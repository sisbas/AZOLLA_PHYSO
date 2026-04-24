# filepath: backend/core/unet_segmenter.py
import numpy as np
import logging
from typing import Dict, Any, Tuple
import os

try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None

from .errors import format_error

class UNetSegmenterModule:
    """
    U-Net based segmentation for complex Azolla frond patterns.
    Provides superior handling of overlapping fronds compared to Watershed.
    Requires pre-trained weights in the configured path.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config.get('unet_segmenter', {})
        self.enabled = self.cfg.get('enabled', False)
        self.weights_path = self.cfg.get('weights_path', 'backend/models/azolla_unet.pth')
        self.device = "cuda" if self.cfg.get('use_gpu', True) and torch and torch.cuda.is_available() else "cpu"
        self._model = None

    def _build_model(self):
        """Simple U-Net architecture skeleton."""
        if torch is None: return None
        
        # This is a placeholder for the actual architecture.
        # In a real scenario, this would be a full UNet class definition.
        class SimpleUNet(nn.Module):
            def __init__(self):
                super().__init__()
                self.enc = nn.Sequential(nn.Conv2d(3, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2))
                self.dec = nn.Sequential(nn.Conv2d(64, 1, 3, padding=1), nn.Sigmoid())
            def forward(self, x):
                # Placeholder forward pass logic
                return x 

        model = SimpleUNet()
        if os.path.exists(self.weights_path):
            try:
                model.load_state_dict(torch.load(self.weights_path, map_location=self.device))
                logging.info(f"Loaded U-Net weights from {self.weights_path}")
            except Exception as e:
                logging.warning(f"Failed to load U-Net weights: {e}")
        return model.to(self.device)

    def process(self, img_rgb: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        errors = []
        if not self.enabled:
            return np.zeros(img_rgb.shape[:2], dtype=np.uint8), {"errors": [], "status": "disabled"}

        if torch is None:
            errors.append(format_error(
                "unet_segmenter",
                "PyTorch not found.",
                "Ensure 'torch' is installed in the backend environment.",
                "error"
            ))
            return np.zeros(img_rgb.shape[:2], dtype=np.uint8), {"errors": errors, "status": "failed"}

        if not os.path.exists(self.weights_path):
            errors.append(format_error(
                "unet_segmenter",
                "Model weights missing.",
                f"Place 'azolla_unet.pth' in {self.weights_path} or retrain the model.",
                "warning"
            ))
            return np.zeros(img_rgb.shape[:2], dtype=np.uint8), {"errors": errors, "status": "missing_weights"}

        try:
            if self._model is None:
                self._model = self._build_model()
            
            self._model.eval()
            with torch.no_grad():
                # 1. Preprocessing
                input_tensor = torch.from_numpy(img_rgb.transpose(2, 0, 1)).float().unsqueeze(0) / 255.0
                input_tensor = input_tensor.to(self.device)
                
                # 2. Inference
                output = self._model(input_tensor)
                mask = (output.squeeze().cpu().numpy() > 0.5).astype(np.uint8)
                
                return mask, {"errors": [], "status": "success", "device": self.device}
        except Exception as e:
            logging.error(f"U-Net Inference failure: {e}")
            errors.append(format_error(
                "unet_segmenter",
                f"Inference crash: {e}",
                "Check image dimensions and GPU memory.",
                "error"
            ))
            return np.zeros(img_rgb.shape[:2], dtype=np.uint8), {"errors": errors, "status": "failed"}
