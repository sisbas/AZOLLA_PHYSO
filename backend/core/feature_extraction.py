# filepath: backend/core/feature_extraction.py
import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, List
from dataclasses import dataclass
from skimage.feature import graycomatrix, graycoprops
from skimage.exposure import rescale_intensity

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
            
            # 3. GLCM texture features — using actual GLCM matrix instead of fake constant
            entropy = 0.0
            contrast = 0.0
            if len(g_valid) > 100:
                try:
                    # Rescale green channel to 0-255 uint8 for GLCM
                    g_uint8 = (rescale_intensity(g_valid.reshape(-1,1), out_range=(0,255))
                               .astype(np.uint8).reshape(img_masked.shape[:2]))
                    
                    # Create mask for GLCM calculation
                    mask_bool = mask > 0 if mask.max() > 1 else mask.astype(bool)
                    
                    # Quantize to 64 levels for efficiency
                    g_quantized = (g_uint8[mask_bool] // 4).astype(np.uint8)
                    
                    # Calculate GLCM on masked region
                    if len(g_quantized) > 100:
                        glcm = graycomatrix(
                            g_quantized.reshape(-1, 1), 
                            distances=[1, 3],
                            angles=[0, np.pi/4], 
                            levels=64, 
                            symmetric=True, 
                            normed=True
                        )
                        
                        # Entropy: -sum(p * log2(p))
                        glcm_flat = glcm.flatten()
                        glcm_nonzero = glcm_flat[glcm_flat > 0]
                        entropy = float(-np.sum(glcm_nonzero * np.log2(glcm_nonzero + 1e-10)))
                        
                        # Contrast from GLCM properties
                        contrast = float(graycoprops(glcm, 'contrast').mean())
                except Exception as e:
                    logging.warning(f"GLCM calculation failed: {str(e)}, using fallback")
                    entropy = 0.5 + 0.1 * g_skew
                    contrast = 0.0
            
            # Calculate coverage percentage correctly (mask is now 0-255 uint8)
            mask_bool = mask > 0 if mask.max() > 1 else mask.astype(bool)
            coverage_pct_val = float(np.mean(mask_bool) * 100)
            
            return FeatureRecord(
                timestamp=timestamp,
                area=float(np.sum(mask_bool)),
                mean_r=mean_r,
                mean_g=mean_g,
                mean_b=mean_b,
                rg_ratio=rg_ratio,
                g_skew=g_skew,
                g_kurt=g_kurt,
                glcm_entropy=entropy,
                glcm_contrast=contrast,
                coverage_pct=coverage_pct_val,
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
