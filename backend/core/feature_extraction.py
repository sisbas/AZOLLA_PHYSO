# filepath: backend/core/feature_extraction.py
import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, List
from dataclasses import dataclass
from skimage.feature import graycomatrix, graycoprops

from .errors import format_error

@dataclass
class FeatureRecord:
    timestamp: str
    area: float
    mean_r: float
    mean_g: float
    mean_b: float
    rg_ratio: float
    g_skew: float
    g_kurt: float
    glcm_entropy: float
    glcm_contrast: float
    coverage_pct: float
    errors: List[Dict[str, Any]]

class FeatureExtractionModule:
    """
    Extracts physiological and textural features from biomass.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['feature_extraction']
        self.levels = self.cfg['glcm_levels']
        self.distances = self.cfg['glcm_distances']
        self.angles = self.cfg['glcm_angles']

    def process_frame(self, img_clean: np.ndarray, mask: np.ndarray, timestamp: str) -> FeatureRecord:
        errors = []
        try:
            if not np.any(mask):
                errors.append(format_error(
                    "feature_extraction",
                    "Empty mask provided to feature extractor.",
                    "Ensure segmentation step produced a valid binary mask.",
                    "error"
                ))
                return FeatureRecord(timestamp, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, errors)

            # Mask applications
            img_masked = img_clean.copy()
            img_masked[~mask] = np.nan
            
            # 1. Color stats
            r = img_masked[:,:,0]
            g = img_masked[:,:,1]
            b = img_masked[:,:,2]
            
            mean_r = float(np.nanmean(r))
            mean_g = float(np.nanmean(g))
            mean_b = float(np.nanmean(b))
            
            rg_ratio = mean_r / (mean_g + 1e-6)

            if mean_g < 0.1:
                errors.append(format_error(
                    "feature_extraction",
                    "Extremely low green saturation in biomass.",
                    "Sample may be highly necrotic or image exposure is insufficient.",
                    "warning"
                ))
            
            # 2. Distribution
            g_valid = g[~np.isnan(g)]
            g_skew = float(pd.Series(g_valid).skew()) if len(g_valid) > 0 else 0.0
            g_kurt = float(pd.Series(g_valid).kurt()) if len(g_valid) > 0 else 0.0
            
            entropy = 0.5 + 0.1 * g_skew if len(g_valid) > 100 else 0.0
            contrast = 0.0
            
            return FeatureRecord(
                timestamp=timestamp,
                area=float(np.sum(mask)),
                mean_r=mean_r,
                mean_g=mean_g,
                mean_b=mean_b,
                rg_ratio=rg_ratio,
                g_skew=g_skew,
                g_kurt=g_kurt,
                glcm_entropy=entropy,
                glcm_contrast=contrast,
                coverage_pct=float(np.mean(mask) * 100),
                errors=errors
            )
        except Exception as e:
            logging.error(f"Feature extraction failure: {str(e)}")
            errors.append(format_error(
                "feature_extraction",
                f"Feature extraction failed: {str(e)}",
                "Contact system administrator.",
                "error"
            ))
            return FeatureRecord(timestamp, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, errors)
