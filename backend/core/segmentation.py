# filepath: backend/core/segmentation.py
import numpy as np
import logging
import cv2
import base64
from typing import Dict, Any, Tuple, List, Optional
from dataclasses import dataclass
from skimage.filters import threshold_otsu
from skimage.morphology import binary_closing, disk, remove_small_objects, binary_opening
from skimage.exposure import equalize_hist, rescale_intensity

from .errors import format_error, ProcessingContext, PipelineStepError
from .segmenter_interface import standardize_mask, density_map
from .image_preprocessor import ImagePreprocessor


def _mask_component_count(mask: np.ndarray) -> int:
    mask_uint8 = standardize_mask((mask.astype(bool) * 255).astype(np.uint8))
    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(mask_uint8)
    return int(sum(1 for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > 0))


def is_mask_valid(mask: np.ndarray, qc: Dict[str, Any]) -> bool:
    """Validate a candidate segmentation mask using coverage, components, and contrast."""
    if mask is None or mask.size == 0:
        return False

    coverage_pct = float(qc.get("coverage_pct", np.mean(mask.astype(bool)) * 100.0) or 0.0)
    component_count = int(qc.get("component_count", _mask_component_count(mask)) or 0)
    contrast_score = float(qc.get("contrast_score", 0.0) or 0.0)

    min_coverage_pct = float(qc.get("min_coverage_pct", 0.5))
    max_coverage_pct = float(qc.get("max_coverage_pct", 95.0))
    min_components = int(qc.get("min_components", 1))
    max_components = int(qc.get("max_components", 250))
    min_contrast_score = float(qc.get("min_contrast_score", 5.0))

    return (
        min_coverage_pct <= coverage_pct <= max_coverage_pct
        and min_components <= component_count <= max_components
        and contrast_score >= min_contrast_score
    )

@dataclass
class SegQC:
    coverage_pct: float
    threshold_value: float
    otsu_valid: bool
    errors: List[Dict[str, Any]]
    trex_mean: float
    exr_mean: float
    hsv_threshold_used: bool
    gr_ratio: float
    health_score: float
    contrast_score: float
    method_used: str

class SegmentationModule:
    """
    Hibrit segmentasyon: ExG + HSV + TREx/ExR indeksleri.
    Otomatik parametre optimizasyonu ile kullanıcı müdahalesini minimize eder.
    Çoklu fallback stratejisi ile düşük kontrastlı görüntüleri de işler.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config.get('segmentation', {})
        self.min_area = self.cfg.get('min_area', 50)  # Düşürüldü
        self.close_radius = self.cfg.get('close_radius', 3)
        # HSV ranges for fern fronds (optimized for Azolla)
        self.hsv_min = np.array(self.cfg.get('hsv_min', [35, 40, 40]))
        self.hsv_max = np.array(self.cfg.get('hsv_max', [85, 255, 255]))
        # Adaptive threshold control
        self.adaptive_hsv = self.cfg.get('adaptive_hsv', True)
        self.trex_weight = self.cfg.get('trex_weight', 0.3)
        self.exg_weight = self.cfg.get('exg_weight', 0.7)
        self.auto_gamma = self.cfg.get('auto_gamma', True)
        self.preprocessor = ImagePreprocessor(config)
        self.fallback_strategies = self.cfg.get('fallback_strategies', True)
        self.min_component_area = int(self.cfg.get('min_component_area', self.min_area))
        self.max_component_area_ratio = float(self.cfg.get('max_component_area_ratio', 1.0))
        self.max_edge_touch_ratio = float(self.cfg.get('max_edge_touch_ratio', 0.2))
        self.min_component_solidity = float(self.cfg.get('min_component_solidity', 0.35))
        self.min_component_compactness = float(self.cfg.get('min_component_compactness', 0.02))
        self.keep_largest_n = self.cfg.get('keep_largest_n', 10)

        self.strategy_policy = self.cfg.get('strategy_policy', 'coverage_union')
        self.qc_min_coverage = float(self.cfg.get('qc_min_coverage', 0.5))
        self.qc_max_coverage = float(self.cfg.get('qc_max_coverage', 95.0))
        self.qc_min_components = int(self.cfg.get('qc_min_components', 1))
        self.qc_max_components = int(self.cfg.get('qc_max_components', 250))
        self.qc_min_contrast = float(self.cfg.get('qc_min_contrast', 5.0))

    def calculate_exg(self, img: np.ndarray) -> np.ndarray:
        """ExG = 2G - R - B (normalized)."""
        try:
            r, g, b = img[:,:,0].astype(np.float32), img[:,:,1].astype(np.float32), img[:,:,2].astype(np.float32)
            denom = r + g + b + 1e-6
            rn, gn, bn = r/denom, g/denom, b/denom
            return 2*gn - rn - bn
        except Exception as e:
            logging.error(f"ExG calculation failed: {str(e)}")
            raise

    def calculate_exg_enhanced(self, img: np.ndarray) -> np.ndarray:
        """Geliştirilmiş ExG: Contrast stretching sonrası."""
        exg = self.calculate_exg(img)
        # Rescale to full range for better thresholding
        exg_rescaled = rescale_intensity(exg, out_range=(0, 1))
        return exg_rescaled

    def calculate_trex(self, r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
        """TREx = (R - G) / (R + G + B + epsilon) * 128 + 128. Yüksek değer stres göstergesi."""
        denom = r + g + b + 1e-6
        trex = (r - g) / denom * 128 + 128  # Scale to 0-255 range
        return np.clip(trex, 0, 255).astype(np.float32)

    def calculate_exr(self, r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
        """ExR = (1.4*R - G) / (R + G + B + epsilon) * 255. Stres indeksi."""
        denom = r + g + b + 1e-6
        exr = (1.4 * r - g) / denom * 255
        return np.clip(exr, 0, 255).astype(np.float32)

    def calculate_indices(self, r: np.ndarray, g: np.ndarray, b: np.ndarray) -> Dict[str, np.ndarray]:
        """Calculate all vegetation indices for stress analysis."""
        trex = self.calculate_trex(r, g, b)
        exr = self.calculate_exr(r, g, b)
        
        # GR Ratio (Green-Red Ratio)
        gr_ratio = g / (r + 1e-6)
        
        return {
            'TREx': trex,
            'ExR': exr,
            'GR': gr_ratio
        }

    def estimate_gamma(self, img: np.ndarray) -> float:
        """Merkezi ön işleme modülündeki gamma tahminini kullanır."""
        return self.preprocessor.estimate_gamma(img)

    def auto_adjust_hsv(self, hsv: np.ndarray, mask_initial: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Otomatik HSV threshold optimizasyonu - kullanıcı müdahalesini minimize eder."""
        h, s, v = cv2.split(hsv)
        
        # Analiz edilen bölgedeki histogramları kullan
        if np.sum(mask_initial > 0) > 100:
            h_vals = h[mask_initial > 0]
            s_vals = s[mask_initial > 0]
            v_vals = v[mask_initial > 0]
            
            # Adaptive bounds based on actual distribution
            h_min = max(0, int(np.percentile(h_vals, 5)) - 5)
            h_max = min(180, int(np.percentile(h_vals, 95)) + 5)
            s_min = max(0, int(np.percentile(s_vals, 10)) - 10)
            v_min = max(0, int(np.percentile(v_vals, 10)) - 10)
            
            return (np.array([h_min, s_min, v_min]), 
                    np.array([h_max, 255, 255]))
        
        return self.hsv_min, self.hsv_max

    def apply_gamma_correction(self, img: np.ndarray, gamma: float = 1.2) -> np.ndarray:
        """Merkezi ön işleme modülündeki gamma düzeltmesini kullanır."""
        return self.preprocessor.apply_gamma_correction(img, gamma)

    def array_to_base64(self, arr: np.ndarray) -> str:
        """Convert numpy array to base64 string for JSON serialization."""
        if arr.dtype == np.float32 or arr.dtype == np.float64:
            arr_normalized = ((arr - arr.min()) / (arr.max() - arr.min() + 1e-6) * 255).astype(np.uint8)
        elif arr.max() > 255:
            arr_normalized = ((arr - arr.min()) / (arr.max() - arr.min() + 1e-6) * 255).astype(np.uint8)
        else:
            arr_normalized = arr.astype(np.uint8)
        
        if len(arr_normalized.shape) == 2:
            arr_colored = cv2.applyColorMap(arr_normalized, cv2.COLORMAP_JET)
        else:
            arr_colored = arr_normalized
            
        _, buffer = cv2.imencode('.png', arr_colored)
        return base64.b64encode(buffer).decode('utf-8')


    def filter_components(self, mask: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Filter connected components before ROI-level measurements are computed.

        Components are accepted/rejected using configurable geometric criteria so
        mask cleaning is part of the actual ROI optimization path, not only a
        reporting artifact. The input may be boolean or 0/255 uint8; the returned
        mask is boolean.
        """
        mask_bool = mask.astype(bool)
        h, w = mask_bool.shape[:2]
        image_area = max(1, h * w)
        min_area = max(0, int(self.min_component_area))
        max_area = max(1, int(float(self.max_component_area_ratio) * image_area))
        keep_largest_n = self.keep_largest_n
        if keep_largest_n is not None:
            keep_largest_n = max(0, int(keep_largest_n))

        filtering_report: Dict[str, Any] = {
            "inputComponents": 0,
            "keptComponents": 0,
            "discardedComponents": 0,
            "discardedByReason": {},
            "criteria": {
                "minComponentArea": min_area,
                "maxComponentAreaRatio": self.max_component_area_ratio,
                "maxEdgeTouchRatio": self.max_edge_touch_ratio,
                "minComponentSolidity": self.min_component_solidity,
                "minComponentCompactness": self.min_component_compactness,
                "keepLargestN": keep_largest_n,
            },
            "components": [],
        }

        if not np.any(mask_bool):
            return mask_bool, filtering_report

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_bool.astype(np.uint8), 8)
        candidates = []

        def add_reason(reason: str) -> None:
            filtering_report["discardedByReason"][reason] = filtering_report["discardedByReason"].get(reason, 0) + 1

        border_mask = np.zeros((h, w), dtype=bool)
        border_mask[0, :] = True
        border_mask[-1, :] = True
        border_mask[:, 0] = True
        border_mask[:, -1] = True

        for label_id in range(1, num_labels):
            component_mask = labels == label_id
            area = int(stats[label_id, cv2.CC_STAT_AREA])
            filtering_report["inputComponents"] += 1

            contours, _ = cv2.findContours(component_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            perimeter = float(sum(cv2.arcLength(contour, True) for contour in contours))
            compactness = float((4.0 * np.pi * area) / (perimeter * perimeter + 1e-6)) if perimeter > 0 else 0.0

            contour_points = np.vstack(contours) if contours else np.empty((0, 1, 2), dtype=np.int32)
            convex_area = float(cv2.contourArea(cv2.convexHull(contour_points))) if len(contour_points) >= 3 else float(area)
            solidity = float(area / (convex_area + 1e-6)) if convex_area > 0 else 0.0
            edge_touch_ratio = float(np.count_nonzero(component_mask & border_mask) / max(1, area))

            reasons = []
            if area < min_area:
                reasons.append("min_component_area")
            if area > max_area:
                reasons.append("max_component_area_ratio")
            if edge_touch_ratio > self.max_edge_touch_ratio:
                reasons.append("max_edge_touch_ratio")
            if solidity < self.min_component_solidity:
                reasons.append("min_component_solidity")
            if compactness < self.min_component_compactness:
                reasons.append("min_component_compactness")

            component_info = {
                "label": int(label_id),
                "area": area,
                "areaRatio": float(area / image_area),
                "edgeTouchRatio": round(edge_touch_ratio, 6),
                "solidity": round(solidity, 6),
                "compactness": round(compactness, 6),
                "kept": not reasons,
                "reasons": reasons,
            }
            filtering_report["components"].append(component_info)

            if reasons:
                for reason in reasons:
                    add_reason(reason)
            else:
                candidates.append((area, label_id))

        if keep_largest_n is not None and keep_largest_n > 0:
            kept_label_ids = {label_id for _, label_id in sorted(candidates, reverse=True)[:keep_largest_n]}
            for _, label_id in sorted(candidates, reverse=True)[keep_largest_n:]:
                add_reason("keep_largest_n")
                for component in filtering_report["components"]:
                    if component["label"] == label_id:
                        component["kept"] = False
                        component["reasons"].append("keep_largest_n")
                        break
        elif keep_largest_n == 0:
            kept_label_ids = set()
            for _, label_id in candidates:
                add_reason("keep_largest_n")
                for component in filtering_report["components"]:
                    if component["label"] == label_id:
                        component["kept"] = False
                        component["reasons"].append("keep_largest_n")
                        break
        else:
            kept_label_ids = {label_id for _, label_id in candidates}

        filtered_mask = np.isin(labels, list(kept_label_ids))
        filtering_report["keptComponents"] = len(kept_label_ids)
        filtering_report["discardedComponents"] = filtering_report["inputComponents"] - filtering_report["keptComponents"]
        return filtered_mask, filtering_report

    def process(self, img_clean: np.ndarray, context: ProcessingContext = None, preprocessing_metadata: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, SegQC, Dict[str, Any]]:
        """
        Process image and return mask, QC metrics, and additional outputs for API response.
        Returns: (mask, qc, extra_outputs) where extra_outputs contains base64 encoded images and indices
        Çoklu fallback stratejisi: ExG -> HSV -> LAB -> Combined
        """
        errors = []
        mask = np.zeros(img_clean.shape[:2], dtype=bool)
        qc = SegQC(0.0, 0.0, False, [], 0.0, 0.0, False, 0.0, 0.0, 0.0, "none")
        extra_outputs = {}
        
        try:
            if context:
                context.step = "segmentation"
            
            # Validate input
            if img_clean is None or img_clean.size == 0:
                raise ValueError("Empty or invalid image input")
            
            # Convert to proper format for OpenCV (expects 0-255 uint8)
            if img_clean.dtype == np.float32 or img_clean.dtype == np.float64:
                img_uint8 = (np.clip(img_clean, 0, 1) * 255).astype(np.uint8)
            else:
                img_uint8 = img_clean
            
            # Calculate contrast score for QC
            gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2GRAY)
            contrast_score = float(np.std(gray))
            
            # 1. Gamma correction for lighting normalization; skip if central preprocessing already did it.
            preprocessing_metadata = preprocessing_metadata or {}
            already_preprocessed = bool(preprocessing_metadata.get("already_preprocessed") or preprocessing_metadata.get("gamma_applied"))
            if already_preprocessed:
                gamma = float(preprocessing_metadata.get("gamma_estimated", 0.0) or 0.0)
                img_gamma = img_uint8
            elif self.auto_gamma:
                gamma = self.estimate_gamma(img_uint8)
                img_gamma = self.apply_gamma_correction(img_uint8, gamma=gamma)
            else:
                gamma = 1.2
                img_gamma = self.apply_gamma_correction(img_uint8, gamma=gamma)
            
            # 2. Calculate vegetation indices. img_gamma is RGB: channel 0=R, 1=G, 2=B.
            r = img_gamma[:, :, 0].astype(np.float32)
            g = img_gamma[:, :, 1].astype(np.float32)
            b = img_gamma[:, :, 2].astype(np.float32)
            
            exg = self.calculate_exg(img_gamma)
            exg_enhanced = self.calculate_exg_enhanced(img_gamma)
            trex = self.calculate_trex(r, g, b)
            exr = self.calculate_exr(r, g, b)
            indices = self.calculate_indices(r, g, b)
            
            # Initialize variables for tracking candidate methods
            best_mask = None
            best_coverage = 0.0
            method_used = "none"
            threshold_value = 0.0
            fallback_reason = None
            candidate_coverages: Dict[str, float] = {}
            candidate_thresholds: Dict[str, float] = {}
            candidate_masks: Dict[str, np.ndarray] = {}
            candidate_validity: Dict[str, bool] = {}
            hsv_threshold_used = False

            def candidate_qc(candidate_mask: np.ndarray) -> Dict[str, Any]:
                return {
                    "coverage_pct": float(np.mean(candidate_mask.astype(bool)) * 100.0),
                    "component_count": _mask_component_count(candidate_mask),
                    "contrast_score": contrast_score,
                    "min_coverage_pct": self.qc_min_coverage,
                    "max_coverage_pct": self.qc_max_coverage,
                    "min_components": self.qc_min_components,
                    "max_components": self.qc_max_components,
                    "min_contrast_score": self.qc_min_contrast,
                }

            def register_candidate(name: str, candidate_mask: np.ndarray, threshold: float) -> None:
                candidate_masks[name] = candidate_mask.astype(bool)
                candidate_thresholds[name] = float(threshold)
                candidate_coverages[name] = float(np.mean(candidate_masks[name]) * 100.0)
                candidate_validity[name] = is_mask_valid(candidate_masks[name], candidate_qc(candidate_masks[name]))

            # STRATEGY 1: Enhanced ExG + Otsu (primary)
            try:
                thresh_exg = threshold_otsu(exg_enhanced)
                mask_exg = exg_enhanced > thresh_exg
                mask_exg = binary_opening(mask_exg, disk(2))
                register_candidate("exg_otsu", mask_exg, thresh_exg)
            except Exception as e:
                logging.warning(f"ExG+Otsu failed: {str(e)}")

            # STRATEGY 2: HSV-based segmentation with adaptive thresholds
            try:
                hsv = cv2.cvtColor(img_gamma, cv2.COLOR_RGB2HSV)
                initial_mask = candidate_masks.get("exg_otsu")
                if self.adaptive_hsv and initial_mask is not None:
                    hsv_min, hsv_max = self.auto_adjust_hsv(hsv, initial_mask.astype(np.uint8))
                    hsv_threshold_used = True
                else:
                    hsv_min, hsv_max = self.hsv_min, self.hsv_max
                    hsv_threshold_used = False

                mask_hsv = cv2.inRange(hsv, hsv_min, hsv_max) > 0
                mask_hsv = binary_opening(mask_hsv, disk(2))
                register_candidate("hsv_adaptive" if hsv_threshold_used else "hsv", mask_hsv, float(hsv_min[0]))
            except Exception as e:
                logging.warning(f"HSV segmentation failed: {str(e)}")

            # STRATEGY 3: LAB color space a* channel fallback
            try:
                lab = cv2.cvtColor(img_gamma, cv2.COLOR_RGB2LAB)
                a_channel = lab[:, :, 1].astype(np.float32)
                a_norm = rescale_intensity(a_channel, out_range=(0, 1))
                mask_lab = a_norm < 0.5
                mask_lab = binary_opening(mask_lab, disk(3))
                register_candidate("lab_a_channel", mask_lab, 0.5)
            except Exception as e:
                logging.warning(f"LAB fallback failed: {str(e)}")

            if self.strategy_policy == "strict_fallback":
                for candidate_name in ("exg_otsu", "hsv_adaptive", "hsv", "lab_a_channel"):
                    if candidate_name not in candidate_masks:
                        continue
                    if candidate_validity.get(candidate_name, False):
                        best_mask = candidate_masks[candidate_name]
                        best_coverage = candidate_coverages[candidate_name]
                        method_used = candidate_name
                        threshold_value = candidate_thresholds[candidate_name]
                        break
                    fallback_reason = (
                        f"{candidate_name} failed QC: "
                        f"coverage={candidate_coverages.get(candidate_name, 0.0):.2f}%, "
                        f"valid={candidate_validity.get(candidate_name, False)}"
                    )

                if best_mask is None and candidate_masks:
                    method_used = "lab_a_channel" if "lab_a_channel" in candidate_masks else next(reversed(candidate_masks))
                    best_mask = candidate_masks[method_used]
                    best_coverage = candidate_coverages[method_used]
                    threshold_value = candidate_thresholds[method_used]
                    fallback_reason = fallback_reason or "No candidate passed QC; using last available fallback."
            else:
                # coverage_union policy preserves the previous behavior: choose coverage-improving
                # candidates and union ExG+HSV when it improves coverage enough.
                if "exg_otsu" in candidate_masks:
                    best_mask = candidate_masks["exg_otsu"].copy()
                    best_coverage = candidate_coverages["exg_otsu"]
                    method_used = "exg_otsu"
                    threshold_value = candidate_thresholds["exg_otsu"]

                hsv_name = "hsv_adaptive" if "hsv_adaptive" in candidate_masks else "hsv"
                if hsv_name in candidate_masks:
                    coverage_hsv = candidate_coverages[hsv_name]
                    if best_mask is None or coverage_hsv > best_coverage * 1.2:
                        best_mask = candidate_masks[hsv_name].copy()
                        best_coverage = coverage_hsv
                        method_used = hsv_name
                        threshold_value = candidate_thresholds[hsv_name]
                    elif best_mask is not None:
                        mask_union = np.logical_or(best_mask, candidate_masks[hsv_name])
                        coverage_union = float(np.mean(mask_union) * 100.0)
                        candidate_coverages["exg_hsv_combined"] = coverage_union
                        if coverage_union > best_coverage * 1.1:
                            best_mask = mask_union
                            best_coverage = coverage_union
                            method_used = "exg_hsv_combined"
                            threshold_value = candidate_thresholds.get("exg_otsu", 0.0)

                if (best_mask is None or best_coverage < 1.0) and "lab_a_channel" in candidate_masks:
                    best_mask = candidate_masks["lab_a_channel"].copy()
                    best_coverage = candidate_coverages["lab_a_channel"]
                    method_used = "lab_a_channel"
                    threshold_value = candidate_thresholds["lab_a_channel"]

            # Use the best mask found
            mask_combined = best_mask if best_mask is not None else np.zeros_like(gray, dtype=bool)
            
            # Final post-processing
            if np.sum(mask_combined) > 0:
                mask_combined = binary_closing(mask_combined, disk(self.close_radius))
                mask_combined = remove_small_objects(mask_combined, min_size=self.min_area)

            # Component filtering is applied before any ROI statistics/reporting.
            mask_combined, component_filtering = self.filter_components(mask_combined)
            
            # 7. Calculate statistics on segmented region
            coverage = np.mean(mask_combined) * 100
            pixel_count = int(np.sum(mask_combined))
            
            if pixel_count > 0:
                trex_mean = float(np.mean(trex[mask_combined]))
                exr_mean = float(np.mean(exr[mask_combined]))
                
                # GR Ratio calculation
                gr_ratio = float(np.mean(g[mask_combined]) / (np.mean(r[mask_combined]) + 1e-6))
                
                # Health score based on TREx (lower TREx = healthier)
                # TREx range is 0-255, healthy plants typically have TREx < 128
                health_score = max(0, min(100, 100 - (trex_mean - 128) * 0.5))
            else:
                trex_mean = exr_mean = 0.0
                gr_ratio = 0.0
                health_score = 0.0
            
            # 8. Generate visualization outputs
            mask_uint8 = standardize_mask((mask_combined * 255).astype(np.uint8))
            
            # Result image (segmented area only)
            result = cv2.bitwise_and(img_gamma, img_gamma, mask=mask_uint8)
            
            density_img, density_stats = density_map(mask_uint8)

            # Heatmap from TREx
            trex_normalized = ((trex - trex.min()) / (trex.max() - trex.min() + 1e-6) * 255).astype(np.uint8)
            heatmap = cv2.applyColorMap(trex_normalized, cv2.COLORMAP_JET)
            heatmap = cv2.bitwise_and(heatmap, heatmap, mask=mask_uint8)
            
            # 9. Region analysis (connected components)
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8)
            regions = []
            for i in range(1, num_labels):
                if stats[i, cv2.CC_STAT_AREA] > self.min_area:
                    r_mask = (labels == i)
                    r_area = int(stats[i, cv2.CC_STAT_AREA])
                    r_trex = float(np.mean(trex[r_mask]))
                    r_exr = float(np.mean(exr[r_mask]))
                    
                    if r_trex > 30:
                        stress_label = "Sağlıklı"
                    elif r_trex > 20:
                        stress_label = "Hafif Stres"
                    else:
                        stress_label = "Yüksek Stres"

                    regions.append({
                        "id": i,
                        "area": r_area,
                        "trex": round(r_trex, 2),
                        "exr": round(r_exr, 2),
                        "stress": stress_label,
                        "center": [int(centroids[i][0]), int(centroids[i][1])]
                    })
            
            # Sort regions by area and take top 10
            regions = sorted(regions, key=lambda x: x['area'], reverse=True)[:10]
            
            # 10. Prepare extra outputs for API
            extra_outputs = {
                "area": pixel_count,
                "grRatio": gr_ratio,
                "healthScore": health_score,
                "maskUrl": self.array_to_base64(mask_uint8),
                "resultUrl": self.array_to_base64(result),
                "stressHeatmapUrl": self.array_to_base64(heatmap),
                "exrUrl": self.array_to_base64(indices['ExR']),
                "trexUrl": self.array_to_base64(indices['TREx']),
                "regions": regions,
                "componentFiltering": component_filtering,
                "images": {
                    "segmentasyon_maskesi": "data:image/png;base64," + self.array_to_base64(mask_uint8),
                    "yogunluk_haritasi": "data:image/png;base64," + self.array_to_base64(density_img),
                },
                "coverageConsistency": {
                    "measuredCoveragePct": coverage,
                    "densityLowPct": density_stats["low"],
                    "densityMediumPct": density_stats["medium"],
                    "densityHighPct": density_stats["high"],
                    "withinExpectedRange": 0.0 <= coverage <= 100.0,
                },
                "methodUsed": method_used,
                "threshold_value": float(threshold_value),
                "fallback_reason": fallback_reason,
                "candidate_coverages": candidate_coverages,
                "contrastScore": contrast_score,
                "preprocessing": {
                    "already_preprocessed": already_preprocessed,
                    "gamma_estimated": gamma,
                    "gamma_applied_in_segmentation": not already_preprocessed,
                }
            }
            
            if coverage < 0.5:
                error_dict = format_error(
                    "segmentation",
                    f"Very low biomass coverage detected ({coverage:.2f}%). Method: {method_used}",
                    "Ensure Azolla sample occupies a significant portion of the frame.",
                    "warning"
                )
                errors.append(error_dict)
                if context:
                    context.add_warning("segmentation", error_dict["message"], error_dict["remediation"])

            qc = SegQC(
                coverage_pct=coverage,
                threshold_value=float(threshold_value),
                otsu_valid=coverage > 0.1,
                errors=errors,
                trex_mean=trex_mean,
                exr_mean=exr_mean,
                hsv_threshold_used=hsv_threshold_used,
                gr_ratio=gr_ratio,
                health_score=health_score,
                contrast_score=contrast_score,
                method_used=method_used
            )
            
            return mask_combined.astype(np.uint8) * 255, qc, extra_outputs
            
        except Exception as e:
            logging.error(f"Segmentation failure: {str(e)}")
            import traceback
            traceback.print_exc()
            error_dict = format_error(
                "segmentation",
                f"Segmentation failed: {str(e)}",
                "Check image contrast and sample density in the uploaded series.",
                "error"
            )
            errors.append(error_dict)
            
            if context:
                context.add_error(
                    "segmentation",
                    str(e),
                    "Segmentasyon başarısız, boş maske döndürülüyor.",
                    "error",
                    "segmentation"
                )
            
            return mask, SegQC(0.0, 0.0, False, errors, 0.0, 0.0, False, 0.0, 0.0, 0.0, "failed"), {}
