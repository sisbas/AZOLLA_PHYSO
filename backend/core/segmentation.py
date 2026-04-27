# filepath: backend/core/segmentation.py
import numpy as np
import logging
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

class SegmentationModule:
    """
    ExG segmentation and baseline Otsu thresholding.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config.get('segmentation', {})
        self.min_area = self.cfg.get('min_area', 100)
        self.close_radius = self.cfg.get('close_radius', 3)

    def calculate_exg(self, img: np.ndarray) -> np.ndarray:
        """ExG = 2G - R - B."""
        try:
            r, g, b = img[:,:,0].astype(np.float32), img[:,:,1].astype(np.float32), img[:,:,2].astype(np.float32)
            denom = r + g + b + 1e-6
            rn, gn, bn = r/denom, g/denom, b/denom
            return 2*gn - rn - bn
        except Exception as e:
            logging.error(f"ExG calculation failed: {str(e)}")
            raise

    def process(self, img_clean: np.ndarray, context: ProcessingContext = None) -> Tuple[np.ndarray, SegQC]:
        errors = []
        mask = np.zeros(img_clean.shape[:2], dtype=bool)
        qc = SegQC(0.0, 0.0, False, [])
        
        try:
            if context:
                context.step = "segmentation"
            
            # Validate input
            if img_clean is None or img_clean.size == 0:
                raise ValueError("Empty or invalid image input")
            
            exg = self.calculate_exg(img_clean)
            
            # Bounded Otsu
            thresh = threshold_otsu(exg)
            mask = exg > thresh
            
            # Post-processing
            mask = binary_closing(mask, disk(self.close_radius))
            mask = remove_small_objects(mask, min_size=self.min_area)
            
            coverage = np.mean(mask) * 100
            
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
                threshold_value=float(thresh),
                otsu_valid=coverage > 0.1,
                errors=errors
            )
            
            return mask.astype(np.uint8) * 255, qc
            
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
            
            return mask, SegQC(0.0, 0.0, False, errors)
