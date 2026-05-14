"""
Image segmentation for Azolla fronds.

Implements:
- Adaptive thresholding for plant/background separation
- Morphological operations for mask refinement
- ROI extraction and validation
"""

import cv2
import numpy as np
from typing import Tuple, Optional, Dict
import logging

logger = logging.getLogger(__name__)


def create_mask(
    image: np.ndarray,
    method: str = 'adaptive',
    block_size: int = 11,
    c_value: int = 2
) -> np.ndarray:
    """
    Create binary mask for Azolla fronds.
    
    Args:
        image: Input RGB image (H, W, 3)
        method: Segmentation method ('adaptive', 'otsu', 'green_threshold')
        block_size: Block size for adaptive thresholding (must be odd)
        c_value: Constant subtracted from mean in adaptive thresholding
        
    Returns:
        Binary mask (H, W) where 255 = plant, 0 = background
    """
    if len(image.shape) != 3:
        raise ValueError(f"Expected RGB image, got shape {image.shape}")
    
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    
    if method == 'adaptive':
        # Ensure block_size is odd
        if block_size % 2 == 0:
            block_size += 1
        
        # Adaptive thresholding (handles varying lighting conditions)
        mask = cv2.adaptiveThreshold(
            gray,
            maxValue=255,
            adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            thresholdType=cv2.THRESH_BINARY_INV,
            blockSize=block_size,
            C=c_value
        )
        
    elif method == 'otsu':
        # Otsu's thresholding (automatic threshold selection)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        _, mask = cv2.threshold(
            blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )
        
    elif method == 'green_threshold':
        # Threshold based on green channel dominance
        # Plants typically have higher green values
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        lower_green = np.array([35, 40, 40])
        upper_green = np.array([85, 255, 255])
        mask = cv2.inRange(hsv, lower_green, upper_green)
        
    else:
        raise ValueError(f"Unknown method: {method}. Use 'adaptive', 'otsu', or 'green_threshold'")
    
    logger.debug(f"Created mask using {method}, coverage: {mask.mean() / 255 * 100:.1f}%")
    return mask


def refine_mask(
    mask: np.ndarray,
    kernel_size: int = 5,
    min_area_ratio: float = 0.01,
    max_area_ratio: float = 0.95
) -> np.ndarray:
    """
    Refine binary mask using morphological operations.
    
    Args:
        mask: Binary mask from create_mask()
        kernel_size: Size of morphological kernel
        min_area_ratio: Minimum area ratio to keep a contour
        max_area_ratio: Maximum area ratio to keep a contour
        
    Returns:
        Refined binary mask
    """
    if len(mask.shape) != 2:
        raise ValueError(f"Expected 2D mask, got shape {mask.shape}")
    
    # Create kernel for morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    
    # Morphological opening: remove small noise
    mask_opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
    
    # Morphological closing: fill small holes
    mask_closed = cv2.morphologyEx(mask_opened, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    # Remove contours that are too small or too large
    refined_mask = np.zeros_like(mask_closed)
    total_area = mask.shape[0] * mask.shape[1]
    
    contours, _ = cv2.findContours(mask_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        area_ratio = area / total_area
        
        if min_area_ratio <= area_ratio <= max_area_ratio:
            cv2.drawContours(refined_mask, [contour], -1, 255, thickness=cv2.FILLED)
    
    coverage_before = mask.mean() / 255 * 100
    coverage_after = refined_mask.mean() / 255 * 100
    
    logger.debug(
        f"Refined mask: coverage changed from {coverage_before:.1f}% to {coverage_after:.1f}%"
    )
    
    return refined_mask


def segment_azolla(
    image: np.ndarray,
    method: str = 'adaptive',
    block_size: int = 11,
    c_value: int = 2,
    kernel_size: int = 5,
    min_area_ratio: float = 0.01,
    max_area_ratio: float = 0.95,
    return_intermediate: bool = False
) -> Tuple[np.ndarray, Optional[Dict]]:
    """
    Complete segmentation pipeline for Azolla images.
    
    Args:
        image: Input RGB image (H, W, 3)
        method: Segmentation method ('adaptive', 'otsu', 'green_threshold')
        block_size: Block size for adaptive thresholding
        c_value: Constant for adaptive thresholding
        kernel_size: Morphological kernel size
        min_area_ratio: Minimum contour area ratio
        max_area_ratio: Maximum contour area ratio
        return_intermediate: Whether to return intermediate results
        
    Returns:
        Tuple of (final_mask, intermediate_results or None)
    """
    # Step 1: Create initial mask
    initial_mask = create_mask(
        image,
        method=method,
        block_size=block_size,
        c_value=c_value
    )
    
    # Step 2: Refine mask
    final_mask = refine_mask(
        initial_mask,
        kernel_size=kernel_size,
        min_area_ratio=min_area_ratio,
        max_area_ratio=max_area_ratio
    )
    
    intermediate = None
    if return_intermediate:
        intermediate = {
            'initial_mask': initial_mask,
            'final_mask': final_mask,
            'coverage_initial': float(initial_mask.mean() / 255),
            'coverage_final': float(final_mask.mean() / 255)
        }
    
    return final_mask, intermediate


def extract_roi(
    image: np.ndarray,
    mask: np.ndarray,
    padding: int = 10
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Extract Region of Interest (ROI) from image using mask.
    
    Args:
        image: Input RGB image
        mask: Binary mask
        padding: Padding around bounding box
        
    Returns:
        Tuple of (cropped_image, cropped_mask)
    """
    # Find bounding box of mask
    coords = cv2.findNonZero(mask)
    
    if coords is None:
        logger.warning("No plant detected in image")
        return image, mask
    
    x, y, w, h = cv2.boundingRect(coords)
    
    # Add padding
    x1 = max(0, x - padding)
    y1 = max(0, y - padding)
    x2 = min(image.shape[1], x + w + padding)
    y2 = min(image.shape[0], y + h + padding)
    
    # Crop
    cropped_image = image[y1:y2, x1:x2]
    cropped_mask = mask[y1:y2, x1:x2]
    
    return cropped_image, cropped_mask


def compute_segmentation_metrics(
    mask: np.ndarray,
    image_shape: Tuple[int, int]
) -> Dict[str, float]:
    """
    Compute metrics from segmentation mask.
    
    Args:
        mask: Binary mask
        image_shape: Shape of original image (H, W)
        
    Returns:
        Dictionary with segmentation metrics
    """
    # Area (number of plant pixels)
    area = np.sum(mask > 0)
    area_ratio = area / (image_shape[0] * image_shape[1])
    
    # Perimeter
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    perimeter = sum(cv2.arcLength(c, True) for c in contours)
    
    # Solidity (area / convex hull area)
    solidity = 0.0
    if contours:
        all_contours = np.vstack(contours)
        hull = cv2.convexHull(all_contours)
        hull_area = cv2.contourArea(hull)
        if hull_area > 0:
            solidity = area / hull_area
    
    # Extent (area / bounding box area)
    extent = 0.0
    if contours:
        x, y, w, h = cv2.boundingRect(np.vstack(contours))
        bbox_area = w * h
        if bbox_area > 0:
            extent = area / bbox_area
    
    return {
        'area': float(area),
        'area_ratio': float(area_ratio),
        'perimeter': float(perimeter),
        'solidity': float(solidity),
        'extent': float(extent)
    }


def quality_check(
    image: np.ndarray,
    mask: np.ndarray,
    min_coverage: float = 0.05,
    max_coverage: float = 0.90,
    min_contrast: float = 20
) -> Tuple[bool, Dict[str, float]]:
    """
    Quality check for segmentation results.
    
    Args:
        image: Input RGB image
        mask: Binary mask
        min_coverage: Minimum acceptable plant coverage
        max_coverage: Maximum acceptable plant coverage
        min_contrast: Minimum acceptable image contrast
        
    Returns:
        Tuple of (passed, metrics)
    """
    metrics = {}
    
    # Coverage check
    coverage = mask.mean() / 255
    metrics['coverage'] = float(coverage)
    coverage_ok = min_coverage <= coverage <= max_coverage
    
    # Contrast check
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    else:
        gray = image
    
    contrast = gray.std()
    metrics['contrast'] = float(contrast)
    contrast_ok = contrast >= min_contrast
    
    # Brightness check
    brightness = gray.mean()
    metrics['brightness'] = float(brightness)
    brightness_ok = 30 <= brightness <= 220
    
    passed = coverage_ok and contrast_ok and brightness_ok
    
    return passed, metrics
