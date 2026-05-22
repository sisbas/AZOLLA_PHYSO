"""
Complete image processing pipeline for Azolla analysis.

Orchestrates:
- Image loading and preprocessing
- Segmentation
- Feature extraction
- Result aggregation
"""

import cv2
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
import pandas as pd
import logging
from dataclasses import dataclass

from .segmentation import segment_azolla, compute_segmentation_metrics, quality_check
from .features import extract_features
from .normalization import normalize_by_distance

logger = logging.getLogger(__name__)


@dataclass
class ProcessingResult:
    """Result from processing a single image."""
    filepath: str
    treatment: str
    replicate: int
    day: int
    features: Dict[str, float]
    segmentation_metrics: Dict[str, float]
    quality_passed: bool
    quality_metrics: Dict[str, float]


class ImageProcessingPipeline:
    """
    Complete pipeline for processing Azolla images.
    
    Usage:
        pipeline = ImageProcessingPipeline()
        result = pipeline.process_image("path/to/image.png")
        features = result.features
    """
    
    def __init__(
        self,
        target_size: Tuple[int, int] = (640, 480),
        segmentation_method: str = 'adaptive',
        block_size: int = 11,
        c_value: int = 2,
        kernel_size: int = 5,
        min_area_ratio: float = 0.01,
        max_area_ratio: float = 0.95,
        include_texture: bool = True,
        include_color_space: bool = True,
        normalize_distance: bool = False,
        target_distance_cm: Optional[float] = None,
        capture_distances_cm: Optional[Dict[str, float]] = None
    ):
        """
        Initialize the processing pipeline.
        
        Args:
            target_size: Target image size (width, height)
            segmentation_method: Segmentation method
            block_size: Adaptive thresholding block size
            c_value: Adaptive thresholding constant
            kernel_size: Morphological kernel size
            min_area_ratio: Minimum area ratio for contours
            max_area_ratio: Maximum area ratio for contours
            include_texture: Whether to compute texture features
            include_color_space: Whether to compute color space features
        """
        self.target_size = target_size
        self.segmentation_method = segmentation_method
        self.block_size = block_size
        self.c_value = c_value
        self.kernel_size = kernel_size
        self.min_area_ratio = min_area_ratio
        self.max_area_ratio = max_area_ratio
        self.include_texture = include_texture
        self.include_color_space = include_color_space
        self.normalize_distance = normalize_distance
        self.target_distance_cm = target_distance_cm
        self.capture_distances_cm = capture_distances_cm or {}
        
        self.results: List[ProcessingResult] = []
    
    def load_and_preprocess(self, filepath: str) -> np.ndarray:
        """
        Load and preprocess an image.
        
        Args:
            filepath: Path to image file
            
        Returns:
            Preprocessed RGB image
        """
        # Load image
        image = cv2.imread(str(filepath))
        if image is None:
            raise ValueError(f"Failed to load image: {filepath}")
        
        # Convert BGR to RGB
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Resize to target size
        if image.shape[:2] != (self.target_size[1], self.target_size[0]):
            image = cv2.resize(image, self.target_size, interpolation=cv2.INTER_AREA)

        if self.normalize_distance:
            distance_cm = self.capture_distances_cm.get(str(filepath))
            image, _ = normalize_by_distance(
                image,
                capture_distance_cm=distance_cm,
                target_distance_cm=self.target_distance_cm
            )

        return image
    
    def parse_metadata(self, filepath: str) -> Tuple[str, int, int]:
        """
        Parse treatment, replicate, and day from filename.
        
        Expected format: {treatment}_{replicate}_day{day}.png
        
        Args:
            filepath: Path to image file
            
        Returns:
            Tuple of (treatment, replicate, day)
        """
        import re
        path = Path(filepath)
        filename = path.stem
        
        # Pattern: treatment_replicate_dayN
        pattern = r'^(.+?)_(\d+)_day(\d+)$'
        match = re.match(pattern, filename)
        
        if match:
            treatment = match.group(1)
            replicate = int(match.group(2))
            day = int(match.group(3))
        else:
            # Fallback parsing
            parts = filename.split('_')
            if len(parts) >= 3:
                treatment = '_'.join(parts[:-2])
                try:
                    replicate = int(parts[-2])
                    day = int(parts[-1].replace('day', ''))
                except ValueError:
                    treatment = filename
                    replicate = 1
                    day = 0
            else:
                treatment = filename
                replicate = 1
                day = 0
        
        return treatment, replicate, day
    
    def process_image(self, filepath: str) -> ProcessingResult:
        """
        Process a single image through the complete pipeline.
        
        Args:
            filepath: Path to image file
            
        Returns:
            ProcessingResult with all outputs
        """
        logger.info(f"Processing image: {filepath}")
        
        # Parse metadata
        treatment, replicate, day = self.parse_metadata(filepath)
        
        # Load and preprocess
        image = self.load_and_preprocess(filepath)
        
        # Segment
        mask, seg_intermediate = segment_azolla(
            image,
            method=self.segmentation_method,
            block_size=self.block_size,
            c_value=self.c_value,
            kernel_size=self.kernel_size,
            min_area_ratio=self.min_area_ratio,
            max_area_ratio=self.max_area_ratio,
            return_intermediate=True
        )
        
        # Compute segmentation metrics
        seg_metrics = compute_segmentation_metrics(mask, image.shape[:2])
        
        # Quality check
        quality_passed, quality_metrics = quality_check(image, mask)
        
        # Extract features
        features = extract_features(
            image,
            mask,
            include_texture=self.include_texture,
            include_color_space=self.include_color_space
        )
        
        # Combine all metrics
        all_features = {**features, **seg_metrics}
        
        result = ProcessingResult(
            filepath=filepath,
            treatment=treatment,
            replicate=replicate,
            day=day,
            features=all_features,
            segmentation_metrics=seg_metrics,
            quality_passed=quality_passed,
            quality_metrics=quality_metrics
        )
        
        self.results.append(result)
        
        logger.info(
            f"Processed {filepath}: treatment={treatment}, day={day}, "
            f"coverage={seg_metrics['area_ratio']:.2f}, quality={quality_passed}"
        )
        
        return result
    
    def process_batch(self, filepaths: List[str]) -> List[ProcessingResult]:
        """
        Process multiple images.
        
        Args:
            filepaths: List of image file paths
            
        Returns:
            List of ProcessingResult objects
        """
        results = []
        failed = []
        
        for fp in filepaths:
            try:
                result = self.process_image(fp)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to process {fp}: {e}")
                failed.append(fp)
        
        logger.info(f"Batch processing complete: {len(results)} succeeded, {len(failed)} failed")
        return results
    
    def process_directory(self, directory: str, recursive: bool = False) -> List[ProcessingResult]:
        """
        Process all images in a directory.
        
        Args:
            directory: Directory path
            recursive: Whether to search subdirectories
            
        Returns:
            List of ProcessingResult objects
        """
        directory = Path(directory)
        
        # Find all images
        extensions = ['*.jpg', '*.jpeg', '*.png', '*.tiff', '*.tif', '*.bmp']
        filepaths = []
        
        if recursive:
            for ext in extensions:
                filepaths.extend(directory.rglob(ext))
        else:
            for ext in extensions:
                filepaths.extend(directory.glob(ext))
        
        filepaths = [str(p) for p in sorted(filepaths)]
        
        return self.process_batch(filepaths)
    
    def get_features_dataframe(self, include_metadata: bool = True) -> pd.DataFrame:
        """
        Convert results to DataFrame.
        
        Args:
            include_metadata: Whether to include treatment, replicate, day columns
            
        Returns:
            pandas DataFrame with all features
        """
        if not self.results:
            raise ValueError("No results available. Process images first.")
        
        records = []
        for result in self.results:
            record = result.features.copy()
            
            if include_metadata:
                record['treatment'] = result.treatment
                record['replicate'] = result.replicate
                record['day'] = result.day
                record['filepath'] = result.filepath
                record['quality_passed'] = result.quality_passed
            
            records.append(record)
        
        df = pd.DataFrame(records)
        
        # Add quality filter column
        df['quality_passed'] = [r.quality_passed for r in self.results]
        
        return df
    
    def get_summary_statistics(self) -> pd.DataFrame:
        """
        Get summary statistics grouped by treatment and day.
        
        Returns:
            DataFrame with mean ± std for key features
        """
        df = self.get_features_dataframe()
        
        # Group by treatment and day
        grouped = df.groupby(['treatment', 'day'])
        
        # Compute statistics for key features
        key_features = ['ExG', 'VARI', 'GLI', 'area_ratio', 'solidity']
        existing_features = [f for f in key_features if f in df.columns]
        
        summary_records = []
        for (treatment, day), group in grouped:
            record = {
                'treatment': treatment,
                'day': day,
                'n_samples': len(group)
            }
            
            for feature in existing_features:
                record[f'{feature}_mean'] = group[feature].mean()
                record[f'{feature}_std'] = group[feature].std()
            
            summary_records.append(record)
        
        return pd.DataFrame(summary_records)
    
    def save_results(self, output_path: str, include_all: bool = True) -> None:
        """
        Save processing results to CSV.
        
        Args:
            output_path: Output file path
            include_all: Whether to include all features or just summary
        """
        if include_all:
            df = self.get_features_dataframe()
        else:
            df = self.get_summary_statistics()
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        df.to_csv(output_path, index=False)
        logger.info(f"Saved results to {output_path}")
    
    def reset(self) -> None:
        """Clear all stored results."""
        self.results = []
        logger.info("Pipeline results cleared")
