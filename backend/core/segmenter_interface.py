from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Protocol, Tuple

import cv2
import numpy as np



class SegmenterInterface(Protocol):
    def process(self, image_rgb: np.ndarray) -> Tuple[np.ndarray, Any, Dict[str, Any]]:
        """Return (mask_uint8_255, qc, extras)."""


@dataclass
class SegmentationStandards:
    open_kernel: Tuple[int, int] = (3, 3)
    open_iterations: int = 2
    close_kernel: Tuple[int, int] = (5, 5)
    close_iterations: int = 1


def standardize_mask(mask: np.ndarray, standards: SegmentationStandards | None = None) -> np.ndarray:
    """Normalize mask to uint8 0/255 and apply shared morphological post-process."""
    cfg = standards or SegmentationStandards()
    mask_u8 = ((mask > 0).astype(np.uint8) * 255)
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN, np.ones(cfg.open_kernel, np.uint8), iterations=cfg.open_iterations)
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, np.ones(cfg.close_kernel, np.uint8), iterations=cfg.close_iterations)
    return mask_u8


def density_map(mask: np.ndarray, window: int = 64) -> Tuple[np.ndarray, Dict[str, float]]:
    h, w = mask.shape
    out = np.zeros((h, w, 3), dtype=np.uint8)
    counts = {"low": 0, "medium": 0, "high": 0}
    total_blocks = 0
    for y in range(0, h, window):
        for x in range(0, w, window):
            block = mask[y:min(y + window, h), x:min(x + window, w)]
            cov = float(np.mean(block > 0))
            total_blocks += 1
            if cov <= 0.33:
                color, key = (148, 163, 184), "low"
            elif cov <= 0.66:
                color, key = (59, 130, 246), "medium"
            else:
                color, key = (16, 185, 129), "high"
            counts[key] += 1
            out[y:min(y + window, h), x:min(x + window, w)] = color
    return out, {k: (v / max(total_blocks, 1)) * 100 for k, v in counts.items()}


class DefaultSegmenter(SegmenterInterface):
    def __init__(self, config: Dict[str, Any] | None = None):
        from .segmentation import SegmentationModule
        self._segmentation = SegmentationModule(config or {})

    def process(self, image_rgb: np.ndarray) -> Tuple[np.ndarray, Any, Dict[str, Any]]:
        raw_mask, qc, extras = self._segmentation.process(image_rgb)
        mask = standardize_mask(raw_mask)
        return mask, qc, extras
