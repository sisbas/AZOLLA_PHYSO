"""
ROI İzolasyonu (Segmentation) Module
Bilimsel analiz için sabit maske veya otomatik segmentasyon
"""

import cv2
import numpy as np
from enum import Enum
from typing import Dict, Any, Optional, Tuple
from pydantic import BaseModel


class ROIMethod(str, Enum):
    """ROI izolasyon yöntemleri"""
    THRESHOLD = "threshold"
    GRABCUT = "grabcut"
    MANUAL_MASK = "manual_mask"
    ADAPTIVE = "adaptive"


class ROIParams(BaseModel):
    """ROI parametreleri"""
    method: ROIMethod = ROIMethod.THRESHOLD
    thresh: int = 127
    rect: Optional[Tuple[int, int, int, int]] = None
    blur_kernel: int = 5
    apply_smoothing: bool = True


def isolate_roi(
    image: np.ndarray,
    method: ROIMethod = ROIMethod.THRESHOLD,
    params: Optional[Dict[str, Any]] = None
) -> np.ndarray:
    """
    ROI izolasyonu gerçekleştirir.
    
    Args:
        image: RGB görüntü (H, W, 3)
        method: İzolasyon yöntemi
        params: Yönteme özel parametreler
    
    Returns:
        mask: Binary maske (H, W), ROI bölgesi 255, diğerleri 0
    """
    if params is None:
        params = {}
    
    if method == ROIMethod.THRESHOLD:
        mask = _threshold_isolation(image, params)
    elif method == ROIMethod.GRABCUT:
        mask = _grabcut_isolation(image, params)
    elif method == ROIMethod.MANUAL_MASK:
        mask = _manual_mask_isolation(image, params)
    elif method == ROIMethod.ADAPTIVE:
        mask = _adaptive_isolation(image, params)
    else:
        raise ValueError(f"Bilinmeyen ROI yöntemi: {method}")
    
    # Kenar yumuşatma (anti-aliasing) - bilimsel geçerlilik için
    if params.get('apply_smoothing', True):
        blur_kernel = params.get('blur_kernel', 5)
        if blur_kernel > 1:
            mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), 0)
    
    return mask


def _threshold_isolation(image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """Threshold tabanlı ROI izolasyonu"""
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    thresh = params.get('thresh', 127)
    _, mask = cv2.threshold(gray, thresh, 255, cv2.THRESH_BINARY)
    return mask


def _grabcut_isolation(image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """GrabCut algoritması ile ROI izolasyonu"""
    rect = params.get('rect')
    if rect is None:
        # Varsayılan olarak görüntünün merkezinde bir dikdörtgen
        h, w = image.shape[:2]
        rect = (w // 4, h // 4, w // 2, h // 2)
    
    mask = np.zeros(image.shape[:2], np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    
    cv2.grabCut(image, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    mask = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')
    
    return mask * 255


def _manual_mask_isolation(image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """Kullanıcı tarafından sağlanan maskeyi kullanır"""
    mask = params.get('mask')
    if mask is None:
        raise ValueError("manual_mask yöntemi için 'mask' parametresi gereklidir")
    
    # Maskeyi normalize et
    if mask.dtype != np.uint8:
        mask = (mask * 255).astype(np.uint8)
    
    return mask


def _adaptive_isolation(image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """Adaptive threshold ile ROI izolasyonu"""
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    block_size = params.get('block_size', 11)
    c = params.get('c', 2)
    
    mask = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, block_size, c
    )
    return mask


def create_fixed_mask(image_shape: Tuple[int, int], roi_coords: Tuple[int, int, int, int]) -> np.ndarray:
    """
    Sabit koordinatlar için maske oluşturur.
    
    Args:
        image_shape: Görüntü boyutu (H, W) veya (H, W, C)
        roi_coords: ROI koordinatları (x, y, width, height)
    
    Returns:
        mask: Binary maske
    """
    if len(image_shape) == 3:
        h, w = image_shape[:2]
    else:
        h, w = image_shape
    
    x, y, rw, rh = roi_coords
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y:y+rh, x:x+rw] = 255
    
    return mask
