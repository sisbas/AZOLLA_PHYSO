# filepath: backend/core/segmentation.py
import numpy as np
import logging
import cv2
from typing import Dict, Any, Tuple, List
from dataclasses import dataclass
from skimage.filters import threshold_otsu
from skimage.morphology import binary_closing, disk, remove_small_objects

from .errors import format_error, ProcessingContext, PipelineStepError

@dataclass
class SegQC:
    coverage_pct: float
    threshold_value: float
    otsu_valid: bool
    errors: List[Dict[str, Any]]
    trex_mean: float
    exr_mean: float
    hsv_threshold_used: bool

class SegmentationModule:
    """
    Hibrit segmentasyon: ExG + HSV + TREx/ExR indeksleri.
    Otomatik parametre optimizasyonu ile kullanıcı müdahalesini minimize eder.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config.get('segmentation', {})
        self.min_area = self.cfg.get('min_area', 100)
        self.close_radius = self.cfg.get('close_radius', 3)
        # HSV ranges for fern fronds (optimized for Azolla)
        self.hsv_min = np.array(self.cfg.get('hsv_min', [35, 40, 40]))
        self.hsv_max = np.array(self.cfg.get('hsv_max', [85, 255, 255]))
        # Adaptive threshold control
        self.adaptive_hsv = self.cfg.get('adaptive_hsv', True)
        self.trex_weight = self.cfg.get('trex_weight', 0.3)
        self.exg_weight = self.cfg.get('exg_weight', 0.7)

    def calculate_exg(self, img: np.ndarray) -> np.ndarray:
        """ExG = 2G - R - B (normalized)."""
        try:
            r, g, b = img[:,:,0].astype(np.float32), img[:,:,1].astype(np.float32), img[:,:,2].astype(np.float32)
            denom = r + g + b + 1e-6
            rn, gn, bn = r/denom, g/denom, b/denom
            return 2*gn - rn - bn
        except Exception as e:
            logging.error(f"ExG calculation failed: {str(e)}")
            raise

    def calculate_trex(self, r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
        """TREx = (R - G) / (R + G + B + epsilon). Yüksek değer stres göstergesi."""
        denom = r + g + b + 1e-6
        return (r - g) / denom * 128 + 128  # Scale to 0-255 range

    def calculate_exr(self, r: np.ndarray, g: np.ndarray) -> np.ndarray:
        """ExR = 1.4*R - G. Stres indeksi."""
        return (1.4 * r - g) * 255  # Scale appropriately

    def auto_adjust_hsv(self, hsv: np.ndarray, mask_initial: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Otomatik HSV threshold optimizasyonu - kullanıcı müdahalesini minimize eder."""
        h, s, v = cv2.split(hsv)
        
        # Analiz edilen bölgedeki histogramları kullan
        if np.sum(mask_initial > 0) > 100:
            h_vals = h[mask_initial > 0]
            s_vals = s[mask_initial > 0]
            v_vals = v[mask_initial > 0]
            
            # Adaptive bounds based on actual distribution
            h_min = max(0, int(np.percentile(h_vals, 5)) - 5)
            h_max = min(180, int(np.percentile(h_vals, 95)) + 5)
            s_min = max(0, int(np.percentile(s_vals, 10)) - 10)
            v_min = max(0, int(np.percentile(v_vals, 10)) - 10)
            
            return (np.array([h_min, s_min, v_min]), 
                    np.array([h_max, 255, 255]))
        
        return self.hsv_min, self.hsv_max

    def apply_gamma_correction(self, img: np.ndarray, gamma: float = 1.2) -> np.ndarray:
        """Gamma düzeltmesi ile ışık koşullarını dengeler."""
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        return cv2.LUT(img, table)

    def process(self, img_clean: np.ndarray, context: ProcessingContext = None) -> Tuple[np.ndarray, SegQC]:
        errors = []
        mask = np.zeros(img_clean.shape[:2], dtype=bool)
        qc = SegQC(0.0, 0.0, False, [], 0.0, 0.0, False)
        
        try:
            if context:
                context.step = "segmentation"
            
            # Validate input
            if img_clean is None or img_clean.size == 0:
                raise ValueError("Empty or invalid image input")
            
            # Convert to proper format for OpenCV (expects 0-255 uint8)
            if img_clean.dtype == np.float32 or img_clean.dtype == np.float64:
                img_uint8 = (np.clip(img_clean, 0, 1) * 255).astype(np.uint8)
            else:
                img_uint8 = img_clean
            
            # 1. Gamma correction for lighting normalization
            img_gamma = self.apply_gamma_correction(img_uint8, gamma=1.2)
            
            # 2. Calculate vegetation indices
            r = img_gamma[:,:,2].astype(np.float32)
            g = img_gamma[:,:,1].astype(np.float32)
            b = img_gamma[:,:,0].astype(np.float32)
            
            exg = self.calculate_exg(img_gamma)
            trex = self.calculate_trex(r, g, b)
            exr = self.calculate_exr(r, g)
            
            # 3. Initial ExG-based mask with Otsu
            thresh_exg = threshold_otsu(exg)
            mask_exg = exg > thresh_exg
            
            # 4. HSV-based segmentation with adaptive thresholds
            hsv = cv2.cvtColor(img_gamma, cv2.COLOR_RGB2HSV)
            
            # Auto-adjust HSV thresholds based on initial mask
            if self.adaptive_hsv:
                hsv_min, hsv_max = self.auto_adjust_hsv(hsv, mask_exg.astype(np.uint8))
                hsv_threshold_used = True
            else:
                hsv_min, hsv_max = self.hsv_min, self.hsv_max
                hsv_threshold_used = False
            
            mask_hsv = cv2.inRange(hsv, hsv_min, hsv_max)
            mask_hsv = mask_hsv > 0
            
            # 5. Combine masks (hybrid approach)
            # Weighted combination based on confidence
            mask_combined = np.logical_or(
                mask_exg,
                np.logical_and(mask_hsv, exg > (thresh_exg - 0.1))  # Relaxed ExG for HSV regions
            )
            
            # 6. Post-processing
            mask_combined = binary_closing(mask_combined, disk(self.close_radius))
            mask_combined = remove_small_objects(mask_combined, min_size=self.min_area)
            
            # 7. Calculate statistics on segmented region
            coverage = np.mean(mask_combined) * 100
            
            if np.sum(mask_combined) > 0:
                trex_mean = float(np.mean(trex[mask_combined]))
                exr_mean = float(np.mean(exr[mask_combined]))
            else:
                trex_mean = exr_mean = 0.0
            
            if coverage < 0.5:
                error_dict = format_error(
                    "segmentation",
                    f"Very low biomass coverage detected ({coverage:.2f}%).",
                    "Ensure Azolla sample occupies a significant portion of the frame.",
                    "warning"
                )
                errors.append(error_dict)
                if context:
                    context.add_warning("segmentation", error_dict["message"], error_dict["remediation"])

            qc = SegQC(
                coverage_pct=coverage,
                threshold_value=float(thresh_exg),
                otsu_valid=coverage > 0.1,
                errors=errors,
                trex_mean=trex_mean,
                exr_mean=exr_mean,
                hsv_threshold_used=hsv_threshold_used
            )
            
            return mask_combined.astype(np.uint8) * 255, qc
            
        except Exception as e:
            logging.error(f"Segmentation failure: {str(e)}")
            error_dict = format_error(
                "segmentation",
                f"Otsu thresholding failed: {str(e)}",
                "Check image contrast and green channel distribution.",
                "error"
            )
            errors.append(error_dict)
            
            if context:
                context.add_error(
                    "segmentation",
                    str(e),
                    "Segmentasyon başarısız, boş maske döndürülüyor.",
                    "error",
                    "segmentation"
                )
            
            return mask, SegQC(0.0, 0.0, False, errors, 0.0, 0.0, False)
