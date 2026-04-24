import os
import sys

# Add local lib directory to path
lib_path = os.path.join(os.path.dirname(__file__), 'lib')
if os.path.exists(lib_path):
    sys.path.append(lib_path)

import cv2
import numpy as np
import logging
import json
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any, Union
from PIL import Image
from PIL.ExifTags import TAGS

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("AzollaProcessor")

@dataclass
class AzollaMetrics:
    area_pixels: int
    total_pixels: int
    area_ratio: float
    g_ratio: float
    confidence_score: float
    timestamp: str

class ProcessingError(Exception):
    """Custom exception for Azolla pipeline errors"""
    pass

class AzollaProcessor:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the AzollaProcessor with configurable parameters.
        """
        self.config = {
            "hsv_lower": [35, 40, 40],
            "hsv_upper": [85, 255, 255],
            "morph_kernel_size": (5, 5),
            "clahe_clip_limit": 2.0,
            "clahe_grid_size": (8, 8),
            "overlay_opacity": 0.6,
            "min_confidence_threshold": 0.1
        }
        if config:
            self.config.update(config)

    def load_and_validate(self, image_input: Union[str, bytes]) -> np.ndarray:
        """
        Load image from path or bytes and validate format.
        """
        try:
            if isinstance(image_input, str):
                image = cv2.imread(image_input)
            else:
                nparr = np.frombuffer(image_input, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ProcessingError("Görüntü yüklenemedi veya format geçersiz.")
            
            return image
        except Exception as e:
            logger.error(f"Validation error: {str(e)}")
            raise ProcessingError(f"Yükleme hatası: {str(e)}")

    def isolate_and_segment(self, image: np.ndarray) -> np.ndarray:
        """
        🔒 ZORUNLU İZOLASYON & SEGMENTASYON step.
        Uses HSV thresholding and morphological operations to create a binary mask.
        """
        try:
            # Convert to HSV workspace
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            
            lower = np.array(self.config["hsv_lower"])
            upper = np.array(self.config["hsv_upper"])
            
            # Create mask
            mask = cv2.inRange(hsv, lower, upper)
            
            # Alternative: Adaptive Thresholding for varying light
            # gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            # mask_adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
            # mask = cv2.bitwise_and(mask, mask_adaptive)
            
            # Morphological cleaning
            kernel = np.ones(self.config["morph_kernel_size"], np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            # GrabCut integration point (placeholder/commented)
            # bgdModel = np.zeros((1, 65), np.float64)
            # fgdModel = np.zeros((1, 65), np.float64)
            # cv2.grabCut(image, mask, rect, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_MASK)
            
            if np.sum(mask) == 0:
                logger.warning("Segmentasyon sonucunda hiç Azolla bulunamadı.")
                # We don't fail here but confidence will be low
            
            return mask
        except Exception as e:
            logger.error(f"Segmentation error: {str(e)}")
            raise ProcessingError(f"Segmentasyon hatası: {str(e)}")

    def apply_white_balance(self, image: np.ndarray) -> np.ndarray:
        """
        Apply Gray World white balance.
        """
        img_float = image.astype(np.float32)
        avg_b = np.mean(img_float[:, :, 0])
        avg_g = np.mean(img_float[:, :, 1])
        avg_r = np.mean(img_float[:, :, 2])
        avg_gray = (avg_b + avg_g + avg_r) / 3
        
        img_float[:, :, 0] *= (avg_gray / (avg_b + 1e-6))
        img_float[:, :, 1] *= (avg_gray / (avg_g + 1e-6))
        img_float[:, :, 2] *= (avg_gray / (avg_r + 1e-6))
        
        return np.clip(img_float, 0, 255).astype(np.uint8)

    def normalize_and_standardize(self, image: np.ndarray) -> np.ndarray:
        """
        Apply CLAHE normalization.
        """
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(
            clipLimit=self.config["clahe_clip_limit"], 
            tileGridSize=self.config["clahe_grid_size"]
        )
        cl = clahe.apply(l)
        merged = cv2.merge([cl, a, b])
        return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)

    def extract_metrics(self, original_image: np.ndarray, mask: np.ndarray, timestamp: str) -> AzollaMetrics:
        """
        Calculate area and G/R ratios based on the mask.
        """
        area_pixels = int(np.sum(mask == 255))
        total_pixels = int(mask.shape[0] * mask.shape[1])
        area_ratio = (area_pixels / total_pixels) * 100 if total_pixels > 0 else 0
        
        g_ratio = 0.0
        if area_pixels > 0:
            mean_colors = cv2.mean(original_image, mask=mask)
            g_ratio = mean_colors[1] / (mean_colors[2] + 1e-6)
        
        # Determine confidence score based on area and color distribution
        confidence_score = float(min(1.0, area_ratio / 10.0 + 0.5)) if area_pixels > 0 else 0.0
        
        return AzollaMetrics(
            area_pixels=area_pixels,
            total_pixels=total_pixels,
            area_ratio=area_ratio,
            g_ratio=g_ratio,
            confidence_score=confidence_score,
            timestamp=timestamp
        )

    def add_timestamp_overlay(self, image: np.ndarray, metrics: AzollaMetrics) -> np.ndarray:
        """
        Add semi-transparent info box to bottom right.
        """
        img_copy = image.copy()
        h, w = img_copy.shape[:2]
        
        overlay = img_copy.copy()
        box_w, box_h = 240, 90
        start_x, start_y = w - box_w - 20, h - box_h - 20
        
        cv2.rectangle(overlay, (start_x, start_y), (w-20, h-20), (0, 0, 0), -1)
        cv2.addWeighted(overlay, self.config["overlay_opacity"], img_copy, 1 - self.config["overlay_opacity"], 0, img_copy)
        
        info = [
            f"Date: {metrics.timestamp}",
            f"Area: {metrics.area_ratio:.2f}%",
            f"G/R Ratio: {metrics.g_ratio:.3f}"
        ]
        
        for i, text in enumerate(info):
            cv2.putText(img_copy, text, (start_x + 10, start_y + 25 + i * 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        
        return img_copy

    def _get_timestamp(self, image_input: Union[str, bytes], image_path: Optional[str]) -> str:
        """Internal helper to extract timestamp from EXIF or OS/Fallback."""
        try:
            import io
            # Try to read EXIF
            if isinstance(image_input, bytes):
                img = Image.open(io.BytesIO(image_input))
            else:
                img = Image.open(image_input)
            
            exif_data = img._getexif()
            if exif_data:
                for tag, value in exif_data.items():
                    if TAGS.get(tag) == 'DateTimeOriginal':
                        return datetime.strptime(value, '%Y:%m:%d %H:%M:%S').strftime('%Y-%m-%d %H:%M')
        except Exception:
            pass

        # Fallback to file system if path exists
        if image_path and os.path.exists(image_path):
            try:
                mtime = os.path.getmtime(image_path)
                return datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
            except Exception:
                pass
        
        return datetime.now().strftime('%Y-%m-%d %H:%M')

    def run_pipeline(self, image_input: Union[str, bytes], image_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute full pipeline and return structured result.
        """
        # 0. Timestamp early (before processing might change anything)
        timestamp = self._get_timestamp(image_input, image_path)

        # 1. Load & Validate
        image = self.load_and_validate(image_input)
        original_copy = image.copy()
        
        # 2. Isolate & Segment
        mask = self.isolate_and_segment(image)
        
        if np.sum(mask) / (image.shape[0] * image.shape[1]) < self.config["min_confidence_threshold"]:
            # Fallback or warning
            logger.warning("Low confidence in segmentation.")
        
        # 3. Metrics Extraction
        metrics = self.extract_metrics(original_copy, mask, timestamp)
        
        # 4. White Balance
        balanced = self.apply_white_balance(image)
        
        # 5. Normalization
        normalized = self.normalize_and_standardize(balanced)
        
        # 6. Overlay
        final_image = self.add_timestamp_overlay(normalized, metrics)
        
        return {
            "metrics": asdict(metrics),
            "processed_image": final_image,
            "mask": mask,
            "timestamp": metrics.timestamp,
            "confidence_score": metrics.confidence_score
        }

# Main integration entry point
def process_single(image_data: bytes, path: Optional[str] = None) -> str:
    """Helper for CLI or Node.js integration"""
    processor = AzollaProcessor()
    result = processor.run_pipeline(image_data, path)
    
    # In a real scenario, we'd save the image or return base64
    # For integration, let's return JSON with metrics and pointers
    return json.dumps({
        "status": "success",
        "metrics": result["metrics"],
        "confidence": result["confidence_score"]
    })

if __name__ == "__main__":
    # Example CLI usage
    import sys
    if len(sys.argv) > 1:
        path = sys.argv[1]
        with open(path, 'rb') as f:
            print(process_single(f.read(), path))
