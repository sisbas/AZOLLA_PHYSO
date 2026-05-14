"""
Image data loader for Azolla RGB images.

Handles loading, organizing, and preprocessing image datasets with:
- Support for time-series images
- Automatic metadata extraction from filenames
- Batch loading and validation
"""

import cv2
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
from dataclasses import dataclass
import logging
import re
from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class ImageMetadata:
    """Metadata extracted from image filename."""
    treatment: str
    replicate: int
    day: int
    filepath: str
    
    @classmethod
    def from_filename(cls, filepath: str) -> 'ImageMetadata':
        """
        Extract metadata from filename.
        
        Expected format: {treatment}_{replicate}_day{day}.png
        Examples: K_1_day0.png, Gd_2_day3.png, Gd+BR10^-7_1_day5.png
        
        Args:
            filepath: Path to image file
            
        Returns:
            ImageMetadata object
        """
        path = Path(filepath)
        filename = path.stem  # filename without extension
        
        # Pattern to match: treatment_replicate_dayN
        # Handle complex treatment names with special characters
        pattern = r'^(.+?)_(\d+)_day(\d+)$'
        match = re.match(pattern, filename)
        
        if match:
            treatment = match.group(1)
            replicate = int(match.group(2))
            day = int(match.group(3))
        else:
            # Fallback: try simpler pattern
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
        
        return cls(
            treatment=treatment,
            replicate=replicate,
            day=day,
            filepath=str(filepath)
        )


class ImageDataLoader:
    """
    Load and organize Azolla RGB images.
    
    Supports:
    - Single image loading
    - Batch loading from directories
    - Time-series organization
    - Metadata extraction from filenames
    """
    
    SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp']
    
    def __init__(self, images_dir: str, target_size: Tuple[int, int] = (640, 480)):
        """
        Initialize the image data loader.
        
        Args:
            images_dir: Directory containing images
            target_size: Target (width, height) for resizing
        """
        self.images_dir = Path(images_dir)
        self.target_size = target_size
        self.images: Dict[str, np.ndarray] = {}
        self.metadata: Dict[str, ImageMetadata] = {}
        self.time_series: Dict[str, Dict[int, str]] = {}  # {group_day: {day: filepath}}
        
        if not self.images_dir.exists():
            logger.warning(f"Images directory not found: {self.images_dir}")
            self.images_dir.mkdir(parents=True, exist_ok=True)
    
    def find_images(self, recursive: bool = False) -> List[Path]:
        """
        Find all supported images in the directory.
        
        Args:
            recursive: Whether to search subdirectories
            
        Returns:
            List of image file paths
        """
        images = []
        
        if recursive:
            pattern = '**/*'
        else:
            pattern = '*'
        
        for ext in self.SUPPORTED_FORMATS:
            images.extend(self.images_dir.glob(f"{pattern}{ext}"))
            images.extend(self.images_dir.glob(f"{pattern}{ext.upper()}"))
        
        logger.info(f"Found {len(images)} images in {self.images_dir}")
        return sorted(images)
    
    def load_image(self, filepath: str, convert_rgb: bool = True) -> np.ndarray:
        """
        Load a single image.
        
        Args:
            filepath: Path to image file
            convert_rgb: Whether to convert BGR to RGB
            
        Returns:
            Image as numpy array (H, W, C)
        """
        filepath = Path(filepath)
        
        if not filepath.exists():
            raise FileNotFoundError(f"Image not found: {filepath}")
        
        # Load using OpenCV (faster, returns BGR)
        image = cv2.imread(str(filepath))
        
        if image is None:
            raise ValueError(f"Failed to load image: {filepath}")
        
        # Convert to RGB if requested
        if convert_rgb:
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        return image
    
    def resize_image(self, image: np.ndarray) -> np.ndarray:
        """
        Resize image to target size.
        
        Args:
            image: Input image
            
        Returns:
            Resized image
        """
        if image.shape[:2] == (self.target_size[1], self.target_size[0]):
            return image
        
        return cv2.resize(image, self.target_size, interpolation=cv2.INTER_AREA)
    
    def load_batch(self, filepaths: Optional[List[str]] = None) -> Dict[str, np.ndarray]:
        """
        Load multiple images.
        
        Args:
            filepaths: List of file paths. If None, loads all images in directory.
            
        Returns:
            Dictionary mapping filepath to image array
        """
        if filepaths is None:
            filepaths = [str(p) for p in self.find_images()]
        
        loaded = {}
        failed = []
        
        for fp in filepaths:
            try:
                image = self.load_image(fp)
                image = self.resize_image(image)
                loaded[fp] = image
                
                # Extract and store metadata
                meta = ImageMetadata.from_filename(fp)
                self.metadata[fp] = meta
                
            except Exception as e:
                logger.warning(f"Failed to load {fp}: {e}")
                failed.append(fp)
        
        self.images = loaded
        
        if failed:
            logger.warning(f"Failed to load {len(failed)} images")
        
        logger.info(f"Successfully loaded {len(loaded)} images")
        return loaded
    
    def organize_time_series(self) -> Dict[str, Dict[int, str]]:
        """
        Organize images by treatment group and day.
        
        Returns:
            Nested dict: {treatment: {day: [filepaths]}}
        """
        if not self.metadata:
            self.find_images()
            for img_path in self.find_images():
                try:
                    meta = ImageMetadata.from_filename(str(img_path))
                    self.metadata[str(img_path)] = meta
                except Exception as e:
                    logger.warning(f"Could not parse metadata for {img_path}: {e}")
        
        time_series = {}
        
        for filepath, meta in self.metadata.items():
            if meta.treatment not in time_series:
                time_series[meta.treatment] = {}
            
            if meta.day not in time_series[meta.treatment]:
                time_series[meta.treatment][meta.day] = []
            
            time_series[meta.treatment][meta.day].append(filepath)
        
        self.time_series = time_series
        
        # Sort days
        for treatment in time_series:
            time_series[treatment] = dict(sorted(time_series[treatment].items()))
        
        logger.info(f"Organized time series for {len(time_series)} treatments")
        return time_series
    
    def get_treatment_images(self, treatment: str) -> Dict[int, List[np.ndarray]]:
        """
        Get all images for a specific treatment group.
        
        Args:
            treatment: Treatment group code
            
        Returns:
            Dict mapping day to list of loaded images
        """
        if not self.time_series:
            self.organize_time_series()
        
        if treatment not in self.time_series:
            logger.warning(f"No images found for treatment: {treatment}")
            return {}
        
        result = {}
        for day, filepaths in self.time_series[treatment].items():
            images = []
            for fp in filepaths:
                try:
                    image = self.load_image(fp)
                    image = self.resize_image(image)
                    images.append(image)
                except Exception as e:
                    logger.warning(f"Failed to load {fp}: {e}")
            
            if images:
                result[day] = images
        
        return result
    
    def get_control_images(self) -> Dict[int, List[np.ndarray]]:
        """
        Get all control group (K) images.
        
        Returns:
            Dict mapping day to list of loaded images
        """
        return self.get_treatment_images('K')
    
    def get_average_image(self, treatment: str, day: int) -> Optional[np.ndarray]:
        """
        Compute average image for a treatment at a specific day.
        
        Args:
            treatment: Treatment group code
            day: Day number
            
        Returns:
            Average image or None if no images available
        """
        images = self.get_treatment_images(treatment)
        
        if day not in images or len(images[day]) == 0:
            return None
        
        # Stack and compute mean
        stacked = np.stack(images[day], axis=0)
        return np.mean(stacked, axis=0).astype(np.uint8)
    
    def validate_images(self) -> Dict[str, List[str]]:
        """
        Validate loaded images for common issues.
        
        Returns:
            Dictionary with validation results
        """
        results = {
            'valid': [],
            'low_contrast': [],
            'too_dark': [],
            'too_bright': [],
            'missing_metadata': []
        }
        
        for filepath, image in self.images.items():
            # Check contrast
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            contrast = gray.std()
            mean_intensity = gray.mean()
            
            if contrast < 20:
                results['low_contrast'].append(filepath)
            elif mean_intensity < 30:
                results['too_dark'].append(filepath)
            elif mean_intensity > 220:
                results['too_bright'].append(filepath)
            else:
                results['valid'].append(filepath)
            
            # Check metadata
            if filepath not in self.metadata:
                results['missing_metadata'].append(filepath)
        
        return results
    
    def create_dummy_dataset(self, n_images: int = 24) -> List[str]:
        """
        Create a dummy dataset for testing.
        
        Args:
            n_images: Number of images to create
            
        Returns:
            List of created image paths
        """
        treatments = ['K', 'Gd', 'Gd+BR10^-7', 'Gd+BR10^-8', 
                     'Gd+BR10^-9', 'BR10^-7', 'BR10^-8', 'BR10^-9']
        
        created_paths = []
        
        for i in range(n_images):
            treatment = treatments[i % len(treatments)]
            replicate = (i // len(treatments)) % 3 + 1
            day = i // (len(treatments) * 3) % 7
            
            # Create synthetic image with varying greenness
            base_green = 100 if treatment == 'K' else max(50, 100 - day * 10)
            noise = np.random.randint(-20, 20)
            green_value = max(0, min(255, base_green + noise))
            
            image = np.zeros((480, 640, 3), dtype=np.uint8)
            image[:, :, 0] = 50  # R
            image[:, :, 1] = green_value  # G
            image[:, :, 2] = 50  # B
            
            # Add some texture
            noise_layer = np.random.randint(0, 30, (480, 640), dtype=np.uint8)
            image[:, :, 1] = np.clip(image[:, :, 1].astype(int) + noise_layer, 0, 255).astype(np.uint8)
            
            # Save
            filename = f"{treatment}_{replicate}_day{day}.png"
            filepath = self.images_dir / filename
            
            cv2.imwrite(str(filepath), image)
            created_paths.append(str(filepath))
        
        logger.info(f"Created {len(created_paths)} dummy images in {self.images_dir}")
        return created_paths
    
    def get_all_metadata(self) -> pd.DataFrame:
        """
        Get metadata for all loaded images as DataFrame.
        
        Returns:
            DataFrame with image metadata
        """
        import pandas as pd
        
        if not self.metadata:
            self.find_images()
            for img_path in self.find_images():
                try:
                    meta = ImageMetadata.from_filename(str(img_path))
                    self.metadata[str(img_path)] = meta
                except:
                    pass
        
        records = []
        for filepath, meta in self.metadata.items():
            records.append({
                'filepath': filepath,
                'treatment': meta.treatment,
                'replicate': meta.replicate,
                'day': meta.day
            })
        
        return pd.DataFrame(records)
