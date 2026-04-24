# filepath: backend/core/biomass_isolation.py
import cv2
import numpy as np
import logging
import json
from typing import Dict, Any, List
from pathlib import Path

class BiomassIsolationModule:
    """
    Isolates biomass from background and exports artifacts.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['biomass_isolation']
        self.bg_mode = self.cfg['bg_mode']

    def isolate(self, img_rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
        try:
            # 1. Background neutralization
            isolated = img_rgb.copy()
            if self.bg_mode == "transparent":
                # Add alpha channel
                alpha = (mask * 255).astype(np.uint8)
                isolated = cv2.merge([isolated[:,:,0], isolated[:,:,1], isolated[:,:,2], alpha])
            else:
                isolated[~mask] = 0
            
            return isolated
        except Exception as e:
            logging.error(f"Biomass isolation failure: {str(e)}")
            return img_rgb

    def export_results(self, output_dir: Path, artifacts: Dict[str, Any]):
        """Exports images and JSON metrics to file system."""
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
            
            for key, val in artifacts.items():
                if isinstance(val, np.ndarray):
                    # Save image (BGF to RGB conversion if needed)
                    file_path = output_dir / f"{key}.png"
                    if val.shape[-1] == 4:
                        cv2.imwrite(str(file_path), cv2.cvtColor(val, cv2.COLOR_RGBA2BGRA))
                    else:
                        cv2.imwrite(str(file_path), cv2.cvtColor(val, cv2.COLOR_RGB2BGR))
                elif isinstance(val, (dict, list)):
                    with open(output_dir / f"{key}.json", "w") as f:
                        json.dump(val, f, indent=4)
        except Exception as e:
            logging.error(f"Export failure: {str(e)}")
