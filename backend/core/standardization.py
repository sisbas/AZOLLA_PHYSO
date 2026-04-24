# filepath: backend/core/standardization.py
import cv2
import numpy as np
import logging
from typing import Tuple, Dict, Any
from dataclasses import dataclass
from skimage.restoration import denoise_tv_chambolle

from .errors import format_error

@dataclass
class StandardizationResult:
    img_clean: np.ndarray
    glare_pct: float
    valid: bool
    status: str
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
            # 1. Linearization
            img_lin = self.linearize_rgb(img_rgb)
            
            # 2. Denoising
            img_denoised = denoise_tv_chambolle(img_lin, weight=self.denoise_w, channel_axis=-1)
            
            # 3. Glare Detection
            glare_mask, glare_pct = self.detect_glare(img_rgb)
            
            # 4. Masking glare
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
            
            return StandardizationResult(
                img_clean=img_denoised.astype(np.float32),
                glare_pct=glare_pct,
                valid=valid,
                status="optimized" if valid else "degraded",
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
                errors=errors
            )
