# filepath: backend/core/standardization.py
import cv2
import numpy as np
import logging
from typing import Tuple, Dict, Any, List
from dataclasses import dataclass
from skimage.restoration import denoise_tv_chambolle

from .errors import format_error

@dataclass
class StandardizationResult:
    img_clean: np.ndarray
    glare_pct: float
    valid: bool
    status: str
    normalization_passed: bool
    illumination_score: float
    wb_shift: Dict[str, float]
    exposure_scale: float
    errors: List[Dict[str, Any]]

class StandardizationModule:
    """
    Handles image preprocessing: Gamma linearization, WB, Glare masking, TV Denoising.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['standardization']
        self.gamma = self.cfg['gamma']
        self.glare_v = self.cfg['glare_v_thresh']
        self.glare_s = self.cfg['glare_s_thresh']
        self.denoise_w = self.cfg['denoise_weight']
        self.illumination_min_score = float(self.cfg.get('illumination_min_score', 0.55))
        self.max_wb_shift = float(self.cfg.get('max_wb_shift', 0.35))

    def apply_color_constancy(self, img: np.ndarray) -> Tuple[np.ndarray, Dict[str, float]]:
        """Simple gray-world white-balance correction."""
        img_f = img.astype(np.float32) / 255.0
        channel_means = img_f.reshape(-1, 3).mean(axis=0) + 1e-8
        target_mean = float(np.mean(channel_means))
        gains = target_mean / channel_means
        balanced = np.clip(img_f * gains.reshape(1, 1, 3), 0.0, 1.0)
        wb_shift = {
            "r_gain": float(gains[0]),
            "g_gain": float(gains[1]),
            "b_gain": float(gains[2]),
        }
        return balanced, wb_shift

    def normalize_exposure(self, img: np.ndarray) -> Tuple[np.ndarray, float]:
        """Normalize luminance around mid-gray target."""
        img_uint8 = (np.clip(img, 0.0, 1.0) * 255).astype(np.uint8)
        gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2GRAY).astype(np.float32)
        mean_luma = float(np.mean(gray)) + 1e-6
        target_luma = 128.0
        scale = target_luma / mean_luma
        normalized = np.clip(img * scale, 0.0, 1.0)
        return normalized, float(scale)

    def linearize_rgb(self, img: np.ndarray) -> np.ndarray:
        """Applies gamma linearization (Inverse Gamma)."""
        img_norm = img.astype(np.float32) / 255.0
        return np.power(img_norm, self.gamma)

    def detect_glare(self, img: np.ndarray) -> Tuple[np.ndarray, float]:
        """Detects specular highlights using HSV V and S thresholds."""
        img_uint8 = (img * 255).astype(np.uint8)
        hsv = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2HSV)
        v_mask = hsv[:, :, 2] > self.glare_v
        s_mask = hsv[:, :, 1] < self.glare_s
        glare_mask = np.logical_and(v_mask, s_mask)
        glare_pct = np.mean(glare_mask) * 100
        return glare_mask, glare_pct

    def process(self, img_rgb: np.ndarray) -> StandardizationResult:
        errors = []
        try:
            # 1. Color constancy (gray-world WB) + exposure normalization
            img_cc, wb_shift = self.apply_color_constancy(img_rgb)
            img_exp, exposure_scale = self.normalize_exposure(img_cc)

            # 2. Linearization
            img_lin = self.linearize_rgb((img_exp * 255.0).astype(np.uint8))
            
            # 3. Denoising
            img_denoised = denoise_tv_chambolle(img_lin, weight=self.denoise_w, channel_axis=-1)
            
            # 4. Glare Detection
            glare_mask, glare_pct = self.detect_glare((img_exp * 255.0).astype(np.uint8))
            
            # 5. QC / normalization score
            del glare_mask  # reserved for future spatial masking use
            mean_luma = float(np.mean(cv2.cvtColor((img_exp * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)))
            luma_score = max(0.0, 1.0 - (abs(mean_luma - 128.0) / 128.0))
            wb_deviation = max(abs(wb_shift["r_gain"] - 1.0), abs(wb_shift["g_gain"] - 1.0), abs(wb_shift["b_gain"] - 1.0))
            wb_score = max(0.0, 1.0 - (wb_deviation / max(self.max_wb_shift, 1e-6)))
            glare_score = max(0.0, 1.0 - (glare_pct / 20.0))
            illumination_score = float(np.clip(0.5 * luma_score + 0.3 * wb_score + 0.2 * glare_score, 0.0, 1.0))
            normalization_passed = illumination_score >= self.illumination_min_score

            valid = glare_pct < 10.0
            
            if not valid:
                errors.append(format_error(
                    "standardization",
                    f"High glare detected ({glare_pct:.1f}%).",
                    "Reduce direct lighting or adjust camera angle to avoid specular reflections.",
                    "warning"
                ))

            if np.mean(img_rgb) < 20:
                errors.append(format_error(
                    "standardization",
                    "Image appears very dark.",
                    "Increase exposure time or improve overall illumination.",
                    "warning"
                ))
            if not normalization_passed:
                errors.append(format_error(
                    "standardization",
                    f"Normalization QC failed (illumination_score={illumination_score:.3f}).",
                    "Capture with gray/white reference card and balanced exposure before analysis.",
                    "warning"
                ))
            
            return StandardizationResult(
                img_clean=img_denoised.astype(np.float32),
                glare_pct=glare_pct,
                valid=valid,
                status="optimized" if valid else "degraded",
                normalization_passed=normalization_passed,
                illumination_score=illumination_score,
                wb_shift=wb_shift,
                exposure_scale=exposure_scale,
                errors=errors
            )
        except Exception as e:
            logging.error(f"Standardization failure: {str(e)}")
            errors.append(format_error(
                "standardization",
                f"Processing error: {str(e)}",
                "Check image format and integrity.",
                "error"
            ))
            return StandardizationResult(
                img_clean=img_rgb.astype(np.float32) / 255.0,
                glare_pct=0.0,
                valid=False,
                status="failed",
                normalization_passed=False,
                illumination_score=0.0,
                wb_shift={"r_gain": 1.0, "g_gain": 1.0, "b_gain": 1.0},
                exposure_scale=1.0,
                errors=errors
            )
