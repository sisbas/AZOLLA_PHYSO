"""
Computer Vision module for Azolla image analysis.

This module handles:
- Image segmentation (adaptive thresholding, morphological operations)
- Feature extraction (color indices, texture, morphology)
- ROI detection and analysis
"""

from .segmentation import segment_azolla, create_mask, refine_mask
from .features import extract_features, compute_color_indices, compute_texture_features
from .pipeline import ImageProcessingPipeline

__all__ = [
    'segment_azolla', 'create_mask', 'refine_mask',
    'extract_features', 'compute_color_indices', 'compute_texture_features',
    'ImageProcessingPipeline'
]