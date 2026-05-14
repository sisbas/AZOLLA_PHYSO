"""
Feature extraction from Azolla images.

Implements:
- Color indices (ExG, VARI, GLI, ExR, YI, GMI, BYR)
- Color space features (LAB, HSV statistics)
- Texture features (GLCM-based)
- Morphological features
"""

import cv2
import numpy as np
import pandas as pd
from skimage.feature import graycomatrix, graycoprops
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


def compute_color_indices(image: np.ndarray, mask: Optional[np.ndarray] = None) -> Dict[str, float]:
    """
    Compute vegetation color indices from RGB image.
    
    These indices are proxies for plant health and pigment content:
    - ExG (Excess Green): Correlates with chlorophyll content
    - VARI (Visible Atmospherically Resistant Index): Greenness indicator
    - GLI (Green Leaf Index): Overall greenness
    - ExR (Excess Red): Stress/yellowing indicator
    - YI (Yellowness Index): Carotenoid proxy
    - GMI (Green-Magenta Index): Chlorophyll proxy
    - BYR (Blue-Yellow Ratio): Stress indicator
    
    Args:
        image: RGB image (H, W, 3), values 0-255
        mask: Optional binary mask to restrict analysis to plant area
        
    Returns:
        Dictionary of color index values
    """
    if image.dtype != np.float64:
        image = image.astype(np.float64) / 255.0
    
    R = image[:, :, 0]
    G = image[:, :, 1]
    B = image[:, :, 2]
    
    # Apply mask if provided
    if mask is not None:
        mask_bool = mask > 0
        R = R[mask_bool]
        G = G[mask_bool]
        B = B[mask_bool]
    
    # Avoid division by zero
    sum_rgb = R + G + B + 1e-10
    
    # Excess Green Index (ExG)
    # High values indicate healthy green vegetation
    exg = 2 * G - R - B
    
    # Visible Atmospherically Resistant Index (VARI)
    # Resistant to atmospheric effects, correlates with chlorophyll
    vari = (G - R) / (G + R - B + 1e-10)
    
    # Green Leaf Index (GLI)
    # General greenness measure
    gli = (2 * G - R - B) / (2 * G + R + B + 1e-10)
    
    # Excess Red Index (ExR)
    # High values may indicate stress/senescence
    exr = 1.4 * R - G
    
    # Yellowness Index (YI)
    # Proxy for carotenoid content, increases with yellowing
    yi = (R + G) / (B + 1e-10)
    
    # Green-Magenta Index (GMI)
    # Inverse of magenta, correlates with chlorophyll
    gmi = G / (R + B + 1e-10)
    
    # Blue-Yellow Ratio (BYR)
    # Lower values indicate more yellowing/stress
    byr = B / (G + 1e-10)
    
    # Compute means (or use median for robustness)
    indices = {
        'ExG': float(np.mean(exg)),
        'VARI': float(np.mean(vari)),
        'GLI': float(np.mean(gli)),
        'ExR': float(np.mean(exr)),
        'YI': float(np.mean(yi)),
        'GMI': float(np.mean(gmi)),
        'BYR': float(np.mean(byr))
    }
    
    logger.debug(f"Computed color indices: ExG={indices['ExG']:.3f}, VARI={indices['VARI']:.3f}")
    return indices


def compute_color_space_features(
    image: np.ndarray,
    mask: Optional[np.ndarray] = None,
    spaces: List[str] = ['LAB', 'HSV']
) -> Dict[str, float]:
    """
    Compute statistical features from different color spaces.
    
    Args:
        image: RGB image (H, W, 3)
        mask: Optional binary mask
        spaces: Color spaces to analyze ('LAB', 'HSV')
        
    Returns:
        Dictionary of color space features
    """
    features = {}
    
    if mask is not None:
        mask_bool = mask > 0
    
    # LAB color space
    if 'LAB' in spaces:
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        
        if mask is not None:
            L_vals = lab[mask_bool, 0]
            a_vals = lab[mask_bool, 1]
            b_vals = lab[mask_bool, 2]
        else:
            L_vals = lab[:, :, 0].flatten()
            a_vals = lab[:, :, 1].flatten()
            b_vals = lab[:, :, 2].flatten()
        
        features.update({
            'L_mean': float(np.mean(L_vals)),
            'L_std': float(np.std(L_vals)),
            'a_mean': float(np.mean(a_vals)),
            'a_std': float(np.std(a_vals)),
            'b_mean': float(np.mean(b_vals)),
            'b_std': float(np.std(b_vals))
        })
    
    # HSV color space
    if 'HSV' in spaces:
        # Convert to HSV (image should be 0-1 for this conversion)
        if image.dtype == np.float64:
            hsv_image = (image * 255).astype(np.uint8)
        else:
            hsv_image = image
        
        hsv = cv2.cvtColor(hsv_image, cv2.COLOR_RGB2HSV)
        
        if mask is not None:
            H_vals = hsv[mask_bool, 0].astype(np.float64)
            S_vals = hsv[mask_bool, 1].astype(np.float64)
            V_vals = hsv[mask_bool, 2].astype(np.float64)
        else:
            H_vals = hsv[:, :, 0].flatten().astype(np.float64)
            S_vals = hsv[:, :, 1].flatten().astype(np.float64)
            V_vals = hsv[:, :, 2].flatten().astype(np.float64)
        
        features.update({
            'H_mean': float(np.mean(H_vals)),
            'H_std': float(np.std(H_vals)),
            'S_mean': float(np.mean(S_vals)),
            'S_std': float(np.std(S_vals)),
            'V_mean': float(np.mean(V_vals)),
            'V_std': float(np.std(V_vals))
        })
    
    logger.debug(f"Computed color space features for {spaces}")
    return features


def compute_texture_features(
    image: np.ndarray,
    mask: Optional[np.ndarray] = None,
    distances: List[int] = [1, 2, 4],
    angles: List[float] = [0, np.pi/4, np.pi/2, 3*np.pi/4]
) -> Dict[str, float]:
    """
    Compute texture features using Gray-Level Co-occurrence Matrix (GLCM).
    
    Features:
    - Contrast: Local variations in intensity
    - Homogeneity: Closeness of distribution to diagonal
    - Energy: Uniformity of texture
    - Correlation: Linear dependency of gray levels
    
    Args:
        image: RGB or grayscale image
        mask: Optional binary mask
        distances: Distances for GLCM computation
        angles: Angles for GLCM computation (in radians)
        
    Returns:
        Dictionary of texture features
    """
    # Convert to grayscale if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    else:
        gray = image
    
    # Quantize to 8-bit if needed
    if gray.dtype != np.uint8:
        gray = (gray * 255).astype(np.uint8)
    
    # Apply mask if provided
    if mask is not None:
        # Extract ROI from mask
        coords = np.where(mask > 0)
        if len(coords[0]) == 0:
            logger.warning("Empty mask, returning zero texture features")
            return {
                'contrast': 0.0,
                'homogeneity': 0.0,
                'energy': 0.0,
                'correlation': 0.0
            }
        
        y_min, y_max = coords[0].min(), coords[0].max()
        x_min, x_max = coords[1].min(), coords[1].max()
        
        # Add small padding
        y_min = max(0, y_min - 2)
        y_max = min(gray.shape[0], y_max + 2)
        x_min = max(0, x_min - 2)
        x_max = min(gray.shape[1], x_max + 2)
        
        gray_roi = gray[y_min:y_max, x_min:x_max]
        mask_roi = mask[y_min:y_max, x_min:x_max]
        
        # Resize to manageable size for GLCM
        scale = min(128 / gray_roi.shape[0], 128 / gray_roi.shape[1])
        if scale < 1:
            new_size = (int(gray_roi.shape[1] * scale), int(gray_roi.shape[0] * scale))
            gray_roi = cv2.resize(gray_roi, new_size, interpolation=cv2.INTER_AREA)
            mask_roi = cv2.resize(mask_roi, new_size, interpolation=cv2.INTER_NEAREST)
        
        # Apply mask
        gray_masked = gray_roi.copy()
        gray_masked[mask_roi == 0] = 0
    else:
        # Resize large images
        if gray.shape[0] > 256 or gray.shape[1] > 256:
            scale = min(256 / gray.shape[0], 256 / gray.shape[1])
            new_size = (int(gray.shape[1] * scale), int(gray.shape[0] * scale))
            gray_masked = cv2.resize(gray, new_size, interpolation=cv2.INTER_AREA)
        else:
            gray_masked = gray
    
    # Compute GLCM
    try:
        glcm = graycomatrix(
            gray_masked,
            distances=distances,
            angles=angles,
            levels=256,
            symmetric=True,
            normed=True
        )
        
        # Compute properties
        contrast = graycoprops(glcm, 'contrast').mean()
        homogeneity = graycoprops(glcm, 'homogeneity').mean()
        energy = graycoprops(glcm, 'energy').mean()
        correlation = graycoprops(glcm, 'correlation').mean()
        
    except Exception as e:
        logger.warning(f"GLCM computation failed: {e}. Using fallback.")
        contrast, homogeneity, energy, correlation = 0.0, 0.0, 0.0, 0.0
    
    features = {
        'contrast': float(contrast),
        'homogeneity': float(homogeneity),
        'energy': float(energy),
        'correlation': float(correlation)
    }
    
    logger.debug(f"Computed texture features: contrast={features['contrast']:.3f}")
    return features


def extract_features(
    image: np.ndarray,
    mask: np.ndarray,
    include_texture: bool = True,
    include_color_space: bool = True
) -> Dict[str, float]:
    """
    Extract all features from an image-mask pair.
    
    Args:
        image: RGB image (H, W, 3)
        mask: Binary mask (H, W)
        include_texture: Whether to compute texture features
        include_color_space: Whether to compute LAB/HSV features
        
    Returns:
        Dictionary with all extracted features
    """
    features = {}
    
    # 1. Color indices
    color_indices = compute_color_indices(image, mask)
    features.update(color_indices)
    
    # 2. Color space features
    if include_color_space:
        color_space_feats = compute_color_space_features(image, mask)
        features.update(color_space_feats)
    
    # 3. Texture features
    if include_texture:
        texture_feats = compute_texture_features(image, mask)
        features.update(texture_feats)
    
    # 4. Morphological features from mask
    morph_feats = compute_morphological_features(mask, image.shape[:2])
    features.update(morph_feats)
    
    logger.info(f"Extracted {len(features)} features from image")
    return features


def compute_morphological_features(
    mask: np.ndarray,
    image_shape: Tuple[int, int]
) -> Dict[str, float]:
    """
    Compute morphological features from segmentation mask.
    
    Args:
        mask: Binary mask
        image_shape: Shape of original image (H, W)
        
    Returns:
        Dictionary of morphological features
    """
    total_area = image_shape[0] * image_shape[1]
    
    # Area
    area = np.sum(mask > 0)
    area_ratio = area / total_area
    
    # Contours for shape features
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return {
            'area': 0.0,
            'area_ratio': 0.0,
            'perimeter': 0.0,
            'solidity': 0.0,
            'extent': 0.0
        }
    
    # Combine all contours
    all_points = np.vstack(contours)
    
    # Perimeter
    perimeter = sum(cv2.arcLength(c, True) for c in contours)
    
    # Convex hull for solidity
    hull = cv2.convexHull(all_points)
    hull_area = cv2.contourArea(hull)
    solidity = area / hull_area if hull_area > 0 else 0.0
    
    # Bounding box for extent
    x, y, w, h = cv2.boundingRect(all_points)
    bbox_area = w * h
    extent = area / bbox_area if bbox_area > 0 else 0.0
    
    # Circularity
    circularity = 4 * np.pi * area / (perimeter ** 2) if perimeter > 0 else 0.0
    
    return {
        'area': float(area),
        'area_ratio': float(area_ratio),
        'perimeter': float(perimeter),
        'solidity': float(solidity),
        'extent': float(extent),
        'circularity': float(circularity)
    }


def features_to_dataframe(
    features_list: List[Dict[str, float]],
    metadata_list: Optional[List[Dict]] = None
) -> pd.DataFrame:
    """
    Convert list of feature dictionaries to DataFrame.
    
    Args:
        features_list: List of feature dictionaries
        metadata_list: Optional list of metadata dicts to add as columns
        
    Returns:
        pandas DataFrame
    """
    import pandas as pd
    
    df = pd.DataFrame(features_list)
    
    if metadata_list:
        meta_df = pd.DataFrame(metadata_list)
        df = pd.concat([meta_df, df], axis=1)
    
    return df
