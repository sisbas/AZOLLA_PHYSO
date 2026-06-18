from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, date
from typing import Any, Dict, Tuple, Optional
import logging
import math

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
    qc_min_mask_area_ratio: float = 0.01
    qc_max_mask_area_ratio: float = 0.95
    qc_max_connected_components: int = 20
    qc_max_edge_touch_ratio: float = 0.35


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

    def _compute_qc_metrics(self, mask: np.ndarray) -> Dict[str, float]:
        mask_bool = mask > 0
        if mask_bool.size == 0:
            return {"mask_area_ratio": 0.0, "connected_components": 0.0, "edge_touch_ratio": 0.0}

        mask_area_ratio = float(np.mean(mask_bool))
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_bool.astype(np.uint8), connectivity=8)
        connected_components = int(max(0, num_labels - 1))

        border_labels = set(np.unique(labels[0, :])) | set(np.unique(labels[-1, :])) | set(np.unique(labels[:, 0])) | set(np.unique(labels[:, -1]))
        border_labels.discard(0)
        edge_pixels = int(sum(int(stats[label, cv2.CC_STAT_AREA]) for label in border_labels)) if connected_components > 0 else 0
        edge_touch_ratio = float(edge_pixels / max(1, int(np.sum(mask_bool))))

        return {
            "mask_area_ratio": mask_area_ratio,
            "connected_components": float(connected_components),
            "edge_touch_ratio": edge_touch_ratio,
        }

    def _evaluate_qc(self, qc_metrics: Dict[str, float]) -> tuple[bool, list[str]]:
        reasons: list[str] = []
        if qc_metrics["mask_area_ratio"] < self.config.qc_min_mask_area_ratio or qc_metrics["mask_area_ratio"] > self.config.qc_max_mask_area_ratio:
            reasons.append("mask_area_ratio_out_of_range")
        if qc_metrics["connected_components"] > float(self.config.qc_max_connected_components):
            reasons.append("connected_components_out_of_range")
        if qc_metrics["edge_touch_ratio"] > self.config.qc_max_edge_touch_ratio:
            reasons.append("edge_touch_ratio_out_of_range")
        return len(reasons) == 0, reasons

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

    def _resolve_manual_roi_mask(self, manual_roi: Optional[Any], image_shape: tuple[int, int, int]) -> Optional[np.ndarray]:
        if not manual_roi:
            return None

        roi_payload = manual_roi.model_dump() if hasattr(manual_roi, "model_dump") else manual_roi
        if not isinstance(roi_payload, dict):
            return None

        h, w = image_shape[:2]
        mask_base64 = roi_payload.get("mask_base64")
        if isinstance(mask_base64, str) and mask_base64.strip():
            try:
                encoded = mask_base64.split(",", 1)[-1]
                decoded = base64.b64decode(encoded)
                nparr = np.frombuffer(decoded, np.uint8)
                decoded_mask = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
                if decoded_mask is not None:
                    if decoded_mask.shape != (h, w):
                        decoded_mask = cv2.resize(decoded_mask, (w, h), interpolation=cv2.INTER_NEAREST)
                    return np.where(decoded_mask > 0, 255, 0).astype(np.uint8)
            except Exception:
                logger.warning("Manual ROI mask_base64 decode edilemedi, polygon fallback denenecek.")

        polygon = roi_payload.get("polygon")
        if not isinstance(polygon, list) or len(polygon) < 3:
            return None

        coordinate_space = (roi_payload.get("coordinate_space") or "pixel").lower()
        points: list[list[int]] = []
        for p in polygon:
            if not isinstance(p, dict) or "x" not in p or "y" not in p:
                continue
            x, y = float(p["x"]), float(p["y"])
            if coordinate_space == "normalized":
                x *= w
                y *= h
            points.append([int(round(np.clip(x, 0, w - 1))), int(round(np.clip(y, 0, h - 1)))])

        if len(points) < 3:
            return None

        manual_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(manual_mask, [np.array(points, dtype=np.int32)], 255)
        return manual_mask

    @staticmethod
    def parse_date(value: str, field_name: str) -> date:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError(f"Geçersiz {field_name} formatı: '{value}'. Beklenen format: YYYY-MM-DD.") from exc

    @staticmethod
    def calculate_date_diff(start_date: date, end_date: date) -> Dict[str, Any]:
        days_diff = (end_date - start_date).days
        return {"days_diff": days_diff, "start_date": start_date.isoformat(), "end_date": end_date.isoformat()}

    def validate_date_inputs(self, start_date: Optional[str], end_date: Optional[str]) -> Tuple[Optional[date], Optional[date]]:
        if (start_date and not end_date) or (end_date and not start_date):
            raise ValueError("start_date ve end_date birlikte gönderilmelidir (ikisi de opsiyonel).")
        if not start_date and not end_date:
            return None, None

        parsed_start = self.parse_date(start_date, "start_date")
        parsed_end = self.parse_date(end_date, "end_date")
        if parsed_start > parsed_end:
            raise ValueError("Geçersiz tarih aralığı: start_date, end_date değerinden büyük olamaz.")
        return parsed_start, parsed_end

    @staticmethod
    def _as_nullable_float(value: Any) -> Optional[float]:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        value = float(value)
        if math.isnan(value) or math.isinf(value):
            return None
        return value

    @classmethod
    def build_frame_metrics_layer(cls, result: Dict[str, Any]) -> Dict[str, Any]:
        renk = result.get("renk_indeksleri", {}) if isinstance(result, dict) else {}
        bio = result.get("biyokutle_tahmini", {}) if isinstance(result, dict) else {}
        raw_metrics = result.get("metrics", {}) if isinstance(result, dict) else {}

        chlorophyll = cls._as_nullable_float(renk.get("chlorophyll_index"))
        fresh_biomass = cls._as_nullable_float(bio.get("fresh_biomass_g_m2"))

        rg_ratio = cls._as_nullable_float((raw_metrics or {}).get("rg_ratio"))
        if rg_ratio is None:
            rg_ratio = cls._as_nullable_float((renk or {}).get("rg_ratio"))
        if rg_ratio is None:
            mean_r = cls._as_nullable_float((raw_metrics or {}).get("mean_r"))
            mean_g = cls._as_nullable_float((raw_metrics or {}).get("mean_g"))
            if mean_r is not None and mean_g not in (None, 0.0):
                rg_ratio = cls._as_nullable_float(mean_r / mean_g)

        return {
            "phenotyping": {
                "chlorophyll_index": chlorophyll,
                "fresh_biomass_g_m2": fresh_biomass,
            },
            "metrics": {
                "rg_ratio": rg_ratio,
            },
        }

    @staticmethod
    def _extract_metric_values(result: Dict[str, Any]) -> Dict[str, float]:
        metrics: Dict[str, float] = {}
        seg = result.get("segmentasyon", {}) if isinstance(result, dict) else {}
        renk = result.get("renk_indeksleri", {}) if isinstance(result, dict) else {}
        bio = result.get("biyokutle_tahmini", {}) if isinstance(result, dict) else {}

        if isinstance(seg.get("kaplama_orani"), (int, float)):
            metrics["coverage"] = float(seg["kaplama_orani"])
        if isinstance(renk.get("klorofil_indeksi"), (int, float)):
            metrics["chlorophyll"] = float(renk["klorofil_indeksi"])
        if isinstance(bio.get("yas_biyokutle_kg"), (int, float)):
            metrics["biomass_wet_kg"] = float(bio["yas_biyokutle_kg"])
        if isinstance(bio.get("kuru_biyokutle_kg"), (int, float)):
            metrics["biomass_dry_kg"] = float(bio["kuru_biyokutle_kg"])
        return metrics

    @staticmethod
    def _summarize_metric_records(metric_records: list[Dict[str, float]]) -> Dict[str, Any]:
        if not metric_records:
            return {"count": 0, "metrics": {}}

        import statistics
        keys = sorted({k for record in metric_records for k in record.keys()})
        summary: Dict[str, Any] = {"count": len(metric_records), "metrics": {}}
        for key in keys:
            values = [float(record[key]) for record in metric_records if key in record]
            if not values:
                continue
            summary["metrics"][key] = {"mean": float(statistics.fmean(values)), "median": float(statistics.median(values)), "count": len(values)}
        return summary

    def compute_group_comparisons(self, results_with_meta: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        grouped: Dict[str, Dict[str, list[Dict[str, float]]]] = {}
        group_warnings: Dict[str, list[str]] = {}

        for item in results_with_meta:
            group_name = str(item.get("group_name") or "unknown").strip() or "unknown"
            timepoint = str(item.get("timepoint") or "").strip().lower()
            result = item.get("result", {})

            if group_name not in grouped:
                grouped[group_name] = {"before": [], "after": []}
                group_warnings[group_name] = []

            if timepoint not in {"before", "after"}:
                group_warnings[group_name].append(f"Geçersiz timepoint '{timepoint or 'empty'}' verisi atlandı.")
                continue

            grouped[group_name][timepoint].append(self._extract_metric_values(result))

        comparisons: list[Dict[str, Any]] = []
        for group_name in sorted(grouped.keys()):
            before_records = grouped[group_name]["before"]
            after_records = grouped[group_name]["after"]
            before_summary = self._summarize_metric_records(before_records)
            after_summary = self._summarize_metric_records(after_records)

            change_summary: Dict[str, Any] = {"metrics": {}}
            metrics = sorted(set(before_summary.get("metrics", {}).keys()) | set(after_summary.get("metrics", {}).keys()))
            for metric_name in metrics:
                before_mean = before_summary.get("metrics", {}).get(metric_name, {}).get("mean")
                after_mean = after_summary.get("metrics", {}).get(metric_name, {}).get("mean")
                if before_mean is None or after_mean is None:
                    continue
                delta = float(after_mean - before_mean)
                pct_change = float((delta / before_mean) * 100.0) if before_mean != 0 else None
                change_summary["metrics"][metric_name] = {"delta": delta, "pct_change": pct_change}

            warnings = list(group_warnings[group_name])
            if before_summary.get("count", 0) == 0:
                warnings.append("Bu grupta before verisi yok.")
            if after_summary.get("count", 0) == 0:
                warnings.append("Bu grupta after verisi yok.")
            if not change_summary["metrics"] and before_summary.get("count", 0) > 0 and after_summary.get("count", 0) > 0:
                warnings.append("before/after mevcut ancak ortak metrik bulunamadığı için değişim hesaplanamadı.")

            comparisons.append({"group_name": group_name, "before_summary": before_summary, "after_summary": after_summary, "change_summary": change_summary, "warnings": warnings})
        return comparisons

    @staticmethod
    def compute_mask_validity_distribution(results_with_meta: list[Dict[str, Any]]) -> Dict[str, float]:
        total = len(results_with_meta)
        if total == 0:
            return {"valid_percent": 0.0, "invalid_percent": 0.0}
        invalid = sum(1 for item in results_with_meta if bool(item.get("result", {}).get("qc_fail")))
        valid = total - invalid
        return {"valid_percent": float(valid / total * 100.0), "invalid_percent": float(invalid / total * 100.0)}

    def analyze(
        self,
        image: np.ndarray,
        pool_area_m2: float = 16.0,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        manual_roi: Optional[Any] = None,
    ) -> Dict[str, Any]:
        try:
            logger.info(f"Starting analysis for image with shape {image.shape}, pool_area: {pool_area_m2} m²")

            step1 = self._gamma_correction(image)
            step2 = self._gray_world_white_balance(step1)
            step3 = self._reduce_reflection(step2)
            preprocessed = self._sharpen(step3)
            # Service preprocessing uses OpenCV BGR; downstream segmentation/phenotyping indexes expect RGB (0=R, 1=G, 2=B).
            rgb = cv2.cvtColor(preprocessed, cv2.COLOR_BGR2RGB)
            manual_mask = self._resolve_manual_roi_mask(manual_roi=manual_roi, image_shape=image.shape)
            if manual_mask is not None:
                binary_mask = manual_mask
                mask = (binary_mask > 0).astype(np.uint8)
                qc = type("ManualQC", (), {"coverage_pct": float(np.mean(mask > 0) * 100.0), "quality_score": 1.0, "warnings": []})()
            else:
                mask, qc, _ = self.segmenter.process(rgb)
                binary_mask = np.where(mask > 0, 255, 0).astype(np.uint8)
            isolated_rgb = cv2.bitwise_and(rgb, rgb, mask=binary_mask)
            isolated_gray = cv2.cvtColor(isolated_rgb, cv2.COLOR_RGB2GRAY)
            isolated_nonzero = isolated_gray > 0
            mask_inside = binary_mask > 0
            mask_outside = ~mask_inside

            outside_nonzero_pixels = int(np.count_nonzero(isolated_nonzero & mask_outside))
            outside_total_pixels = int(np.count_nonzero(mask_outside))
            inside_nonzero_pixels = int(np.count_nonzero(isolated_nonzero & mask_inside))
            inside_total_pixels = int(np.count_nonzero(mask_inside))

            leakage_pct = (
                float((outside_nonzero_pixels / outside_total_pixels) * 100.0)
                if outside_total_pixels > 0
                else 0.0
            )
            plant_fill_pct = (
                float((inside_nonzero_pixels / inside_total_pixels) * 100.0)
                if inside_total_pixels > 0
                else 0.0
            )
            overlay_rgb = rgb.copy()
            overlay_color = np.zeros_like(rgb)
            overlay_color[:, :, 1] = 255
            overlay_rgb[binary_mask > 0] = cv2.addWeighted(rgb[binary_mask > 0], 0.65, overlay_color[binary_mask > 0], 0.35, 0)

            measured_coverage = float(np.mean(mask > 0) * 100.0)
            if abs(measured_coverage - float(qc.coverage_pct)) > 20.0:
                logger.warning("Segmentation coverage mismatch detected: interface=%.2f%% qc=%.2f%%", measured_coverage, float(qc.coverage_pct))

            qc_metrics = self._compute_qc_metrics(binary_mask)
            qc_pass, qc_fail_reasons = self._evaluate_qc(qc_metrics)

            self.phenotyping.pixel_to_m2 = (pool_area_m2 / mask.size) if mask.size else 0.0
            if qc_pass:
                metrics = self.phenotyping.process(rgb, mask)
                result = self.phenotyping.to_dict(metrics)
                result["qc_fail"] = False
            else:
                result = {
                    "segmentasyon": {},
                    "renk_indeksleri": {},
                    "stres_analizi": {"stress_score": None},
                    "yogunluk_dagilimi": {},
                    "doku_analizi": {},
                    "biyokutle_tahmini": {},
                    "buyume_parametreleri": {},
                    "errors": [{"step": "quality_control", "message": "Segmentation QC failed. Stress score was not produced.", "severity": "warning", "reasons": qc_fail_reasons}],
                    "qc_fail": True,
                }


            calibration = result.get("biyokutle_tahmini", {}).get("calibration", {}) if isinstance(result.get("biyokutle_tahmini"), dict) else {}
            result["calibration_metadata"] = {
                "dataset_id": calibration.get("dataset_id"),
                "calibration_date": calibration.get("calibration_date"),
                "sample_count": calibration.get("sample_count"),
                "mae": calibration.get("mae"),
                "rmse": calibration.get("rmse"),
            }
            result["timestamp"] = datetime.utcnow().isoformat()
            result["segmentation_qc"] = {**qc_metrics, "pass": qc_pass, "fail_reasons": qc_fail_reasons}
            result["images"] = {
                "preprocessed_rgb_png": self._png_base64(rgb),
                "binary_mask_png": self._png_base64(binary_mask),
                "isolated_rgb_png": self._png_base64(isolated_rgb),
                "overlay_png": self._png_base64(overlay_rgb),
            }
            result["qc"] = {
                "coverage_pct": float(qc.coverage_pct),
                "quality_score": float(qc.quality_score),
                "warnings": list(qc.warnings),
                "leakage_pct": leakage_pct,
                "plant_fill_pct": plant_fill_pct,
            }
            if leakage_pct > 2.0:
                qc_warning = (
                    f"ROI leakage yüksek: %{leakage_pct:.1f} "
                    "(eşik: %2.0, mask dışı non-zero piksel oranı)"
                )
                result.setdefault("errors", []).append(qc_warning)
                result["qc"]["warnings"].append(qc_warning)
            if start_date is not None and end_date is not None:
                result["date_comparison"] = self.calculate_date_diff(start_date, end_date)
            logger.info("Phenotyping analysis completed successfully")
            return result
        except Exception as e:
            logger.error(f"Phenotyping analysis failed: {str(e)}", exc_info=True)
            raise
