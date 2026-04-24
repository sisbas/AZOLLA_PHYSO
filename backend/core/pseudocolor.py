# filepath: backend/core/pseudocolor.py
import cv2
import numpy as np
import logging
from typing import Dict, Any, Tuple
from scipy.ndimage import gaussian_filter

class PseudocolorModule:
    """
    Generates stress-representative heatmaps.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['pseudocolor']
        self.alpha = self.cfg['alpha_overlay']
        self.sigma = self.cfg['spatial_smooth_sigma']
        self.z_thresh = self.cfg['z_threshold']

    def generate_heatmap(self, img_clean: np.ndarray, mask: np.ndarray) -> Tuple[np.ndarray, np.ndarray, Dict[str, float]]:
        try:
            # 1. Pixel-based stress proxy (e.g., normalized R/G)
            r, g = img_clean[:,:,0], img_clean[:,:,1]
            stress_map = r / (g + 1e-6)
            stress_map[~mask] = 0
            
            # 2. Smoothing
            stress_map = gaussian_filter(stress_map, sigma=self.sigma)
            stress_map[~mask] = 0
            
            # 3. Normalize for colormap (0-255)
            # Clip by z-threshold simulation
            v_max = np.max(stress_map) if np.any(mask) else 1.0
            stress_norm = np.clip(stress_map / (v_max * 0.8 + 1e-6), 0, 1)
            
            # 4. Apply Colormap
            heatmap = cv2.applyColorMap((stress_norm * 255).astype(np.uint8), cv2.COLORMAP_JET)
            heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
            heatmap[~mask] = 0
            
            # 5. Overlay
            img_uint8 = (img_clean * 255).astype(np.uint8)
            overlay = cv2.addWeighted(img_uint8, 1 - self.alpha, heatmap, self.alpha, 0)
            overlay[~mask] = img_uint8[~mask] # Keep background original or dimmed
            
            metrics = {
                "stress_coverage_pct": float(np.mean(stress_norm > 0.5) * 100),
                "max_local_stress": float(v_max)
            }
            
            return overlay, heatmap, metrics
        except Exception as e:
            logging.error(f"Pseudocolor failure: {str(e)}")
            return (img_clean * 255).astype(np.uint8), np.zeros_like(img_clean, dtype=np.uint8), {}
