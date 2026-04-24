# filepath: backend/core/frond_segmenter.py
import cv2
import numpy as np
import logging
from typing import Dict, Any, Tuple
from skimage.segmentation import watershed
from skimage.feature import peak_local_max
from skimage.morphology import h_maxima, local_maxima
from scipy import ndimage as ndi

from .errors import format_error

class FrondSegmenterModule:
    """
    Segmentation of individual fronds using an improved Hybrid Watershed approach.
    Enhanced for overlapping fronds via H-maxima suppression and distance map smoothing.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['frond_segmenter']
        self.peak_thresh = self.cfg.get('peak_threshold_rel', 0.25)
        self.compactness = self.cfg.get('compactness', 0.5)
        self.min_dist = self.cfg.get('min_distance_px', 7)
        self.smooth_sigma = self.cfg.get('distance_smooth_sigma', 1.0)
        self.h_val = self.cfg.get('h_maxima_thresh', 1.0)

    def process(self, mask: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        errors = []
        try:
            if not np.any(mask):
                return np.zeros_like(mask, dtype=np.int32), {"plausible": False, "errors": []}

            # 1. Distance Transform with Smoothing
            # EDM (Euclidean Distance Map) is the basis for separating overlapping convex shapes.
            distance = ndi.distance_transform_edt(mask)
            
            # Smooth distance map to avoid oversegmentation from noisy boundaries
            if self.smooth_sigma > 0:
                distance = ndi.gaussian_filter(distance, sigma=self.smooth_sigma)
            
            # 2. Advanced Peak Detection (H-maxima suppression)
            # This helps suppress local peaks that are too close in 'height' (distance from edge),
            # significantly reducing false splits in overlapping fronds.
            h_max = h_maxima(distance, self.h_val)
            markers, num_features = ndi.label(h_max)
            
            if num_features == 0:
                # Fallback to standard peak detection if h-maxima is too aggressive
                coords = peak_local_max(distance, min_distance=self.min_dist, threshold_rel=self.peak_thresh, labels=mask)
                if len(coords) > 0:
                    mask_seeds = np.zeros(distance.shape, dtype=bool)
                    mask_seeds[tuple(coords.T)] = True
                    markers, num_features = ndi.label(mask_seeds)
                else:
                    errors.append(format_error(
                        "frond_segmenter",
                        "No frond peaks detected.",
                        "Biomass may be too uniform or morphological features are lost. Increase contrast.",
                        "warning"
                    ))
            
            # 3. Marker-based Watershed
            # Compactness handles the trade-off between boundary regularity and marker influence.
            labels = watershed(-distance, markers, mask=mask, compactness=self.compactness)
            
            count = int(np.max(labels))
            is_plausible = 5 < count < 2000
            
            if not is_plausible and count > 0:
                errors.append(format_error(
                    "frond_segmenter",
                    f"Implausible frond count ({count}).",
                    "Overlapping fronds may be too dense or parameters (h_maxima_thresh) need tuning.",
                    "warning"
                ))
            
            qc = {
                "frond_count": count,
                "plausible": is_plausible,
                "mean_size_px": float(np.sum(mask) / count) if count > 0 else 0,
                "errors": errors,
                "method": "improved_watershed_hmax"
            }
            
            return labels, qc
        except Exception as e:
            logging.error(f"Frond segmenter failure: {str(e)}")
            errors.append(format_error(
                "frond_segmenter",
                f"Watershed failure: {str(e)}",
                "Ensure mask connectivity and skimage/scipy versions are compatible.",
                "error"
            ))
            return np.zeros_like(mask, dtype=np.int32), {"plausible": False, "errors": errors}
        finally:
            import gc
            gc.collect()
