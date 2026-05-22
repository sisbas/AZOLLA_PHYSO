"""Distance/scale normalization utilities for image preprocessing."""

from __future__ import annotations

from typing import Optional, Tuple
import cv2
import numpy as np


def normalize_by_distance(
    image: np.ndarray,
    *,
    capture_distance_cm: Optional[float],
    target_distance_cm: Optional[float],
    min_scale: float = 0.6,
    max_scale: float = 1.8,
    interpolation: int = cv2.INTER_LINEAR,
) -> Tuple[np.ndarray, float]:
    """Normalize apparent object scale based on capture distance.

    Uses a simple pinhole-camera approximation where apparent size is inversely
    proportional to distance. The image is scaled by `capture_distance/target_distance`
    then center-cropped/padded back to original dimensions.

    Returns normalized image and applied scale factor.
    """
    if capture_distance_cm is None or target_distance_cm is None:
        return image, 1.0
    if capture_distance_cm <= 0 or target_distance_cm <= 0:
        return image, 1.0

    raw_scale = capture_distance_cm / target_distance_cm
    scale = float(np.clip(raw_scale, min_scale, max_scale))

    h, w = image.shape[:2]
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    resized = cv2.resize(image, (new_w, new_h), interpolation=interpolation)

    if scale >= 1.0:
        # center crop
        x0 = (new_w - w) // 2
        y0 = (new_h - h) // 2
        normalized = resized[y0:y0 + h, x0:x0 + w]
    else:
        # center pad
        normalized = np.zeros_like(image)
        x0 = (w - new_w) // 2
        y0 = (h - new_h) // 2
        normalized[y0:y0 + new_h, x0:x0 + new_w] = resized

    return normalized, scale
