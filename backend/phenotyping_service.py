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
from backend.core.segmenter_interface import DefaultSegmenter

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
        self.segmenter = DefaultSegmenter()
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
            rgb = cv2.cvtColor(preprocessed, cv2.COLOR_BGR2RGB)
            mask, qc, _ = self.segmenter.process(rgb)
            binary_mask = np.where(mask > 0, 255, 0).astype(np.uint8)
            isolated_rgb = cv2.bitwise_and(rgb, rgb, mask=binary_mask)
            overlay_rgb = rgb.copy()
            overlay_color = np.zeros_like(rgb)
            overlay_color[:, :, 1] = 255
            overlay_alpha = 0.35
            overlay_rgb[binary_mask > 0] = cv2.addWeighted(
                rgb[binary_mask > 0],
                1.0 - overlay_alpha,
                overlay_color[binary_mask > 0],
                overlay_alpha,
                0,
            )

            # Endpoint consistency guard: same input should produce similar coverage semantics
            measured_coverage = float(np.mean(mask > 0) * 100.0)
            if abs(measured_coverage - float(qc.coverage_pct)) > 20.0:
                logger.warning(
                    "Segmentation coverage mismatch detected: interface=%.2f%% qc=%.2f%%",
                    measured_coverage,
                    float(qc.coverage_pct),
                )

            total_pixels = mask.size
            self.phenotyping.pixel_to_m2 = (pool_area_m2 / total_pixels) if total_pixels else 0.0
            metrics = self.phenotyping.process(rgb, mask)
            result = self.phenotyping.to_dict(metrics)
            result["timestamp"] = datetime.utcnow().isoformat()
            result["images"] = {
                "binary_mask_png": self._png_base64(binary_mask),
                "isolated_rgb_png": self._png_base64(isolated_rgb),
                "overlay_png": self._png_base64(overlay_rgb),
            }

            logger.info("Phenotyping analysis completed successfully")
            return result

        except Exception as e:
            logger.error(f"Phenotyping analysis failed: {str(e)}", exc_info=True)
            raise
