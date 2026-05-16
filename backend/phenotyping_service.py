from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Tuple
import logging

import cv2
import numpy as np

from backend.logger import get_logger
from backend.core.phenotyping import PhenotypingModule

logger = get_logger("phenotyping")


@dataclass
class PhenotypingConfig:
    gamma: float = 1.2
    alpha: float = 5.5
    beta: float = 20.0
    dry_matter_ratio: float = 0.08


class AzollaPhenotypingService:
    def __init__(self, config: PhenotypingConfig | None = None):
        self.config = config or PhenotypingConfig()
        self.phenotyping = PhenotypingModule({
            "phenotyping": {
                "biomass_alpha": self.config.alpha,
                "biomass_beta": self.config.beta,
            }
        })
        logger.info("Phenotyping service initialized")

    def _gamma_correction(self, image: np.ndarray) -> np.ndarray:
        inv_gamma = 1.0 / self.config.gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(256)]).astype("uint8")
        return cv2.LUT(image, table)

    def _gray_world_white_balance(self, image: np.ndarray) -> np.ndarray:
        img = image.astype(np.float32)
        means = np.mean(img, axis=(0, 1))
        mean_gray = np.mean(means)
        scale = mean_gray / (means + 1e-6)
        balanced = img * scale
        return np.clip(balanced, 0, 255).astype(np.uint8)

    def _reduce_reflection(self, image: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        v = cv2.GaussianBlur(v, (5, 5), 0)
        v = cv2.normalize(v, None, 0, 255, cv2.NORM_MINMAX)
        return cv2.cvtColor(cv2.merge([h, s, v]), cv2.COLOR_HSV2BGR)

    def _sharpen(self, image: np.ndarray) -> np.ndarray:
        lap = cv2.Laplacian(image, cv2.CV_16S, ksize=3)
        lap = cv2.convertScaleAbs(lap)
        return cv2.addWeighted(image, 1.0, lap, 0.25, 0)

    def _segment(self, image: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        hsv_mask = cv2.inRange(hsv, (35, 40, 50), (75, 255, 255))
        a = lab[:, :, 1].astype(np.int16) - 128
        b = lab[:, :, 2].astype(np.int16) - 128
        lab_mask = ((a >= -50) & (a <= 0) & (b >= 0) & (b <= 50)).astype(np.uint8) * 255
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        mask = cv2.bitwise_and(hsv_mask, lab_mask)
        mask = cv2.bitwise_and(mask, otsu)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=1)
        ff = mask.copy()
        h, w = mask.shape
        flood = np.zeros((h + 2, w + 2), np.uint8)
        cv2.floodFill(ff, flood, (0, 0), 255)
        holes = cv2.bitwise_not(ff)
        return cv2.bitwise_or(mask, holes)

    def _density_map(self, mask: np.ndarray, window: int = 64) -> Tuple[np.ndarray, Dict[str, float]]:
        h, w = mask.shape
        out = np.zeros((h, w, 3), dtype=np.uint8)
        counts = {"low": 0, "medium": 0, "high": 0}
        total_blocks = 0
        for y in range(0, h, window):
            for x in range(0, w, window):
                block = mask[y : min(y + window, h), x : min(x + window, w)]
                cov = float(np.mean(block > 0))
                total_blocks += 1
                if cov <= 0.33:
                    color, key = (148, 163, 184), "low"
                elif cov <= 0.66:
                    color, key = (59, 130, 246), "medium"
                else:
                    color, key = (16, 185, 129), "high"
                counts[key] += 1
                out[y : min(y + window, h), x : min(x + window, w)] = color
        return out, {k: (v / max(total_blocks, 1)) * 100 for k, v in counts.items()}

    def _png_base64(self, image: np.ndarray) -> str:
        ok, enc = cv2.imencode(".png", image)
        if not ok:
            return ""
        return "data:image/png;base64," + base64.b64encode(enc.tobytes()).decode("utf-8")

    def analyze(self, image: np.ndarray, pool_area_m2: float = 16.0) -> Dict[str, Any]:
        try:
            logger.info(f"Starting analysis for image with shape {image.shape}, pool_area: {pool_area_m2} m²")

            step1 = self._gamma_correction(image)
            step2 = self._gray_world_white_balance(step1)
            step3 = self._reduce_reflection(step2)
            preprocessed = self._sharpen(step3)
            mask = self._segment(preprocessed)
            density_img, _ = self._density_map(mask)

            total_pixels = mask.size
            self.phenotyping.pixel_to_m2 = (pool_area_m2 / total_pixels) if total_pixels else 0.0
            rgb = cv2.cvtColor(preprocessed, cv2.COLOR_BGR2RGB)
            metrics = self.phenotyping.process(rgb, mask)
            result = self.phenotyping.to_dict(metrics)
            result["timestamp"] = datetime.utcnow().isoformat()
            result["images"] = {
                "segmentasyon_maskesi": self._png_base64(mask),
                "yogunluk_haritasi": self._png_base64(density_img),
            }

            logger.info("Phenotyping analysis completed successfully")
            return result

        except Exception as e:
            logger.error(f"Phenotyping analysis failed: {str(e)}", exc_info=True)
            raise
