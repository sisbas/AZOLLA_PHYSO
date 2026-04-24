# filepath: backend/core/segmentation.py
import numpy as np
import logging
from typing import Dict, Any, Tuple
from dataclasses import dataclass
from skimage.filters import threshold_otsu
from skimage.morphology import binary_closing, disk, remove_small_objects

from .errors import format_error

@dataclass
class SegQC:
    coverage_pct: float
    threshold_value: float
    otsu_valid: bool
    errors: List[Dict[str, Any]]

class SegmentationModule:
    """
    ExG segmentation and baseline Otsu thresholding.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['segmentation']
        self.min_area = self.cfg['min_area']
        self.close_radius = self.cfg['close_radius']

    def calculate_exg(self, img: np.ndarray) -> np.ndarray:
        """ExG = 2G - R - B."""
        r, g, b = img[:,:,0], img[:,:,1], img[:,:,2]
        denom = r + g + b + 1e-6
        rn, gn, bn = r/denom, g/denom, b/denom
        return 2*gn - rn - bn

    def process(self, img_clean: np.ndarray) -> Tuple[np.ndarray, SegQC]:
        errors = []
        try:
            exg = self.calculate_exg(img_clean)
            
            # Bounded Otsu
            thresh = threshold_otsu(exg)
            mask = exg > thresh
            
            # Post-processing
            mask = binary_closing(mask, disk(self.close_radius))
            mask = remove_small_objects(mask, min_size=self.min_area)
            
            coverage = np.mean(mask) * 100
            
            if coverage < 0.5:
                errors.append(format_error(
                    "segmentation",
                    f"Very low biomass coverage detected ({coverage:.2f}%).",
                    "Ensure Azolla sample occupies a significant portion of the frame.",
                    "warning"
                ))

            qc = SegQC(
                coverage_pct=coverage,
                threshold_value=float(thresh),
                otsu_valid=coverage > 0.1,
                errors=errors
            )
            
            return mask, qc
        except Exception as e:
            logging.error(f"Segmentation failure: {str(e)}")
            errors.append(format_error(
                "segmentation",
                f"Otsu thresholding failed: {str(e)}",
                "Check image contrast and green channel distribution.",
                "error"
            ))
            return np.zeros(img_clean.shape[:2], dtype=bool), SegQC(0.0, 0.0, False, errors)
