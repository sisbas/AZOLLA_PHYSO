# filepath: backend/core/segmentation.py
import numpy as np
import logging
import cv2
import base64
from typing import Dict, Any, Tuple, List, Optional
from dataclasses import dataclass
from skimage.filters import threshold_otsu, threshold_li
from skimage.morphology import binary_closing, disk, remove_small_objects, binary_opening
from skimage.exposure import equalize_hist, rescale_intensity

from .errors import format_error, ProcessingContext, PipelineStepError

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
        self.fallback_strategies = self.cfg.get('fallback_strategies', True)

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
        """Otomatik gamma tahmini - histogram analizine göre."""
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        mean_val = np.mean(gray)
        
        # Eğer görüntü çok karanlıksa gamma < 1, çok aydınlıksa gamma > 1
        if mean_val < 80:
            return 0.8  # Parlaklığı artır
        elif mean_val > 180:
            return 1.5  # Parlaklığı azalt
        else:
            return 1.2  # Normal düzeltme

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
        """Gamma düzeltmesi ile ışık koşullarını dengeler."""
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        return cv2.LUT(img, table)

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

    def process(self, img_clean: np.ndarray, context: ProcessingContext = None) -> Tuple[np.ndarray, SegQC, Dict[str, Any]]:
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
            
            # 1. Gamma correction for lighting normalization
            if self.auto_gamma:
                gamma = self.estimate_gamma(img_uint8)
                img_gamma = self.apply_gamma_correction(img_uint8, gamma=gamma)
            else:
                img_gamma = self.apply_gamma_correction(img_uint8, gamma=1.2)
            
            # 2. Calculate vegetation indices
            r = img_gamma[:,:,2].astype(np.float32)
            g = img_gamma[:,:,1].astype(np.float32)
            b = img_gamma[:,:,0].astype(np.float32)
            
            exg = self.calculate_exg(img_gamma)
            exg_enhanced = self.calculate_exg_enhanced(img_gamma)
            trex = self.calculate_trex(r, g, b)
            exr = self.calculate_exr(r, g, b)
            indices = self.calculate_indices(r, g, b)
            
            # Initialize variables for tracking best method
            best_mask = None
            best_coverage = 0.0
            method_used = "none"
            
            # STRATEGY 1: Enhanced ExG + Otsu (primary)
            try:
                thresh_exg = threshold_otsu(exg_enhanced)
                mask_exg = exg_enhanced > thresh_exg
                mask_exg = binary_opening(mask_exg, disk(2))
                coverage_exg = np.mean(mask_exg) * 100
                
                if coverage_exg > best_coverage:
                    best_mask = mask_exg.copy()
                    best_coverage = coverage_exg
                    method_used = "exg_otsu"
                    thresh_exg_final = thresh_exg
            except Exception as e:
                logging.warning(f"ExG+Otsu failed: {str(e)}")
                thresh_exg_final = 0.0
            
            # STRATEGY 2: HSV-based segmentation with adaptive thresholds
            try:
                hsv = cv2.cvtColor(img_gamma, cv2.COLOR_RGB2HSV)
                
                # Auto-adjust HSV thresholds based on initial mask
                if self.adaptive_hsv and best_mask is not None:
                    hsv_min, hsv_max = self.auto_adjust_hsv(hsv, best_mask.astype(np.uint8))
                    hsv_threshold_used = True
                else:
                    hsv_min, hsv_max = self.hsv_min, self.hsv_max
                    hsv_threshold_used = False
                
                mask_hsv = cv2.inRange(hsv, hsv_min, hsv_max)
                mask_hsv = mask_hsv > 0
                mask_hsv = binary_opening(mask_hsv, disk(2))
                coverage_hsv = np.mean(mask_hsv) * 100
                
                # Use HSV if it gives better coverage or complements ExG
                if coverage_hsv > best_coverage * 1.2:  # %20 daha iyi ise
                    best_mask = mask_hsv.copy()
                    best_coverage = coverage_hsv
                    method_used = "hsv_adaptive"
                elif best_mask is not None:
                    # Combine: union of both masks with some logic
                    mask_combined = np.logical_or(best_mask, mask_hsv)
                    coverage_combined = np.mean(mask_combined) * 100
                    if coverage_combined > best_coverage * 1.1:
                        best_mask = mask_combined
                        best_coverage = coverage_combined
                        method_used = "exg_hsv_combined"
            except Exception as e:
                logging.warning(f"HSV segmentation failed: {str(e)}")
            
            # STRATEGY 3: Fallback - Simple green channel thresholding
            if best_mask is None or best_coverage < 1.0:
                try:
                    # Normalize green channel
                    g_norm = rescale_intensity(g, out_range=(0, 1))
                    thresh_g = threshold_li(g_norm)
                    mask_green = g_norm > (thresh_g * 0.8)  # Relaxed threshold
                    mask_green = binary_opening(mask_green, disk(3))
                    coverage_green = np.mean(mask_green) * 100
                    
                    if coverage_green > best_coverage:
                        best_mask = mask_green
                        best_coverage = coverage_green
                        method_used = "green_channel_li"
                        thresh_exg_final = thresh_g
                except Exception as e:
                    logging.warning(f"Green channel fallback failed: {str(e)}")
            
            # STRATEGY 4: Last resort - LAB color space a* channel
            if best_mask is None or best_coverage < 1.0:
                try:
                    lab = cv2.cvtColor(img_gamma, cv2.COLOR_RGB2LAB)
                    a_channel = lab[:,:,1].astype(np.float32)
                    a_norm = rescale_intensity(a_channel, out_range=(0, 1))
                    
                    # Green vegetation typically has negative a* values in LAB
                    mask_lab = a_norm < 0.5
                    mask_lab = binary_opening(mask_lab, disk(3))
                    coverage_lab = np.mean(mask_lab) * 100
                    
                    if coverage_lab > best_coverage:
                        best_mask = mask_lab
                        best_coverage = coverage_lab
                        method_used = "lab_a_channel"
                        thresh_exg_final = 0.5
                except Exception as e:
                    logging.warning(f"LAB fallback failed: {str(e)}")
            
            # Use the best mask found
            mask_combined = best_mask if best_mask is not None else np.zeros_like(gray, dtype=bool)
            
            # Final post-processing
            if np.sum(mask_combined) > 0:
                mask_combined = binary_closing(mask_combined, disk(self.close_radius))
                mask_combined = remove_small_objects(mask_combined, min_size=self.min_area)
            
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
            mask_uint8 = (mask_combined * 255).astype(np.uint8)
            
            # Result image (segmented area only)
            result = cv2.bitwise_and(img_gamma, img_gamma, mask=mask_uint8)
            
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
                "methodUsed": method_used,
                "contrastScore": contrast_score
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
                threshold_value=float(thresh_exg_final) if 'thresh_exg_final' in locals() else 0.0,
                otsu_valid=coverage > 0.1,
                errors=errors,
                trex_mean=trex_mean,
                exr_mean=exr_mean,
                hsv_threshold_used=('hsv' in method_used),
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
