# filepath: backend/core/mask_optimizer.py
import numpy as np
import logging
from typing import Dict, Any, Tuple, List
from dataclasses import dataclass
from skimage.morphology import remove_small_holes, binary_dilation, disk
from scipy.ndimage import distance_transform_edt

from .errors import format_error

@dataclass
class MaskOptimizerQC:
    hole_fraction: float
    solidity: float
    is_reliable: bool
    errors: List[Dict[str, Any]]

class MaskOptimizerModule:
    """
    Refines binary masks and performs QC checks.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['mask_optimizer']
        self.max_hole = self.cfg['max_hole_size']
        self.qc_min_cov = self.cfg['qc_min_coverage']
        self.qc_max_hole = self.cfg['qc_max_hole_fraction']
        self.qc_min_sol = self.cfg['qc_min_solidity']

    def process(self, mask: np.ndarray) -> Tuple[np.ndarray, MaskOptimizerQC, str]:
        errors = []
        try:
            # Convert to boolean if needed
            mask_bool = mask.astype(bool) if mask.dtype != bool else mask
            
            # 1. Fill holes
            refined = remove_small_holes(mask_bool, area_threshold=self.max_hole)
            
            # 2. QC Stats
            total_filled = np.sum(refined)
            holes_filled = total_filled - np.sum(mask_bool)
            hole_frac = holes_filled / (total_filled + 1e-6)
            
            coverage = total_filled / mask_bool.size
            
            is_reliable = (
                coverage > self.qc_min_cov and
                hole_frac < self.qc_max_hole
            )

            if hole_frac > self.qc_max_hole:
                errors.append(format_error(
                    "mask_optimizer",
                    f"Excessive internal holes detected ({hole_frac*100:.1f}%).",
                    "Check for segmentation artifacts or extreme stress causing tissue fragmentation.",
                    "warning"
                ))
            
            if coverage < self.qc_min_cov:
                errors.append(format_error(
                    "mask_optimizer",
                    "Final mask coverage below safety threshold.",
                    "The biomass area is too small for reliable feature extraction.",
                    "warning"
                ))
            
            status = "optimized" if is_reliable else "fallback"
            
            qc = MaskOptimizerQC(
                hole_fraction=float(hole_frac),
                solidity=1.0, 
                is_reliable=is_reliable,
                errors=errors
            )
            
            return refined.astype(np.uint8) * 255, qc, status
        except Exception as e:
            logging.error(f"Mask optimization failure: {str(e)}")
            errors.append(format_error(
                "mask_optimizer",
                f"Optimization failure: {str(e)}",
                "Investigate mask morphology and connectivity.",
                "error"
            ))
            return mask, MaskOptimizerQC(0.0, 0.0, False, errors), "failed"
