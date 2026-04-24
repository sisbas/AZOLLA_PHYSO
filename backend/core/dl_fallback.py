# filepath: backend/core/dl_fallback.py
import numpy as np
import logging
from typing import Dict, Any, Tuple
try:
    from cellpose import models
except ImportError:
    models = None

from .errors import format_error

class DLFallbackModule:
    """
    Deep Learning (Cellpose) fallback for complex biomass cases.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['dl_fallback']
        self.enabled = self.cfg['enabled']
        self.model_name = self.cfg['model_name']
        self.use_gpu = self.cfg['use_gpu']
        self._model = None

    def _load_model(self):
        if self._model is None and models is not None:
            logging.info(f"Loading Cellpose model: {self.model_name}")
            self._model = models.Cellpose(gpu=self.use_gpu, model_type=self.model_name)

    def process(self, img_rgb: np.ndarray, mask_context: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any], str]:
        errors = []
        if not self.enabled or models is None:
            if models is None and self.enabled:
                errors.append(format_error(
                    "dl_fallback",
                    "Cellpose library not installed.",
                    "Run 'pip install cellpose' or disable DL fallback in config.",
                    "warning"
                ))
            return np.zeros_like(mask_context, dtype=np.int32), {"errors": errors}, "disabled"
            
        try:
            self._load_model()
            img_crop = img_rgb.copy()
            img_crop[~mask_context] = 0
            
            masks, flows, styles, diams = self._model.eval(
                img_crop, 
                diameter=None, 
                channels=[0, 0], 
                cellprob_threshold=self.cfg['cellprob_threshold'],
                flow_threshold=self.cfg['flow_threshold']
            )
            
            qc = {
                "dl_count": int(np.max(masks)),
                "dl_diameter": float(diams) if diams else 0.0,
                "errors": errors
            }
            
            return masks, qc, "dl_success"
        except Exception as e:
            logging.error(f"DL Fallback failure: {str(e)}")
            errors.append(format_error(
                "dl_fallback",
                f"DL Inference failed: {str(e)}",
                "Check GPU status and image dimensions.",
                "error"
            ))
            return np.zeros_like(mask_context, dtype=np.int32), {"errors": errors}, "failed"
        finally:
            import gc
            gc.collect()
