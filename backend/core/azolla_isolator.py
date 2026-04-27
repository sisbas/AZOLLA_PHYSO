# filepath: backend/core/azolla_isolator.py
"""
FAZ 1 - MODÜL 2: Azolla İzolasyonu ve Segmentasyon

Bu modül, RGB görüntülerden Azolla bitkisini izole eder.
- Çoklu renk uzayı analizi (RGB, HSV, Lab)
- Otomatik thresholding (Otsu, Li, adaptive)
- Vegetation indeksleri (ExG, ExR, GR)
- Morfolojik işlemler
- ROI seçimi desteği (manuel/yarı otomatik için altyapı)
- Maske optimizasyonu

Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
"""

import cv2
import numpy as np
import logging
from typing import Dict, Any, Tuple, Optional, Union, List
from dataclasses import dataclass, field
from datetime import datetime
from skimage.filters import threshold_otsu, threshold_li, threshold_isodata
from skimage.morphology import binary_closing, binary_opening, disk, remove_small_objects, remove_small_holes
from skimage.exposure import rescale_intensity

from .errors import format_error, ProcessingContext, PipelineStepError

logger = logging.getLogger(__name__)


@dataclass
class SegmentationMetrics:
    """Segmentasyon kalite metrikleri."""
    coverage_pct: float
    threshold_value: float
    method_used: str
    otsu_valid: bool
    trex_mean: float
    exr_mean: float
    gr_ratio: float
    health_score: float
    contrast_score: float
    hsv_threshold_used: bool
    area_pixels: int
    solidity: float
    warnings: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]
    
    def to_dict(self) -> dict:
        return {
            "coverage_pct": self.coverage_pct,
            "threshold_value": self.threshold_value,
            "method_used": self.method_used,
            "otsu_valid": self.otsu_valid,
            "trex_mean": round(self.trex_mean, 3),
            "exr_mean": round(self.exr_mean, 3),
            "gr_ratio": round(self.gr_ratio, 3),
            "health_score": round(self.health_score, 3),
            "contrast_score": round(self.contrast_score, 3),
            "hsv_threshold_used": self.hsv_threshold_used,
            "area_pixels": self.area_pixels,
            "solidity": round(self.solidity, 3),
            "warnings": self.warnings,
            "errors": self.errors
        }


@dataclass
class IsolationResult:
    """İzolasyon sonucu."""
    mask: np.ndarray
    isolated_image: np.ndarray
    cropped_image: np.ndarray
    metrics: SegmentationMetrics
    success: bool
    bbox: Optional[Tuple[int, int, int, int]] = None


class AzollaIsolator:
    """
    FAZ 1 - Azolla İzolasyonu ve Segmentasyon Modülü
    
    Azolla bitkisini arka plandan ayırır ve temiz maske üretir.
    Desteklenen özellikler:
    - Çoklu renk uzayı analizi (RGB, HSV, Lab)
    - Vegetation indeksleri (ExG, ExR, TREx, GR)
    - Otomatik thresholding (Otsu, Li, IsoData)
    - Adaptive HSV thresholding
    - Morfolojik post-processing
    - Bounding box cropping
    - ROI selection desteği (manuel seçim için altyapı)
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Args:
            config: Konfigürasyon parametreleri
                - hsv_min: HSV alt sınır [H, S, V]
                - hsv_max: HSV üst sınır [H, S, V]
                - min_area: Minimum alan (piksel)
                - close_radius: Morphological closing yarıçapı
                - open_radius: Morphological opening yarıçapı
                - adaptive_hsv: Adaptive HSV thresholding kullan
                - exg_weight: ExG ağırlığı (0-1)
                - trex_weight: TREx ağırlığı (0-1)
                - auto_gamma: Otomatik gamma düzeltme
        """
        self.cfg = config.get('isolation', {}) if config else {}
        
        # HSV ranges for Azolla (optimized for fern fronds)
        self.hsv_min = np.array(self.cfg.get('hsv_min', [35, 40, 40]))
        self.hsv_max = np.array(self.cfg.get('hsv_max', [85, 255, 255]))
        
        # Morphological parameters
        self.min_area = self.cfg.get('min_area', 50)
        self.close_radius = self.cfg.get('close_radius', 3)
        self.open_radius = self.cfg.get('open_radius', 2)
        
        # Adaptive thresholding
        self.adaptive_hsv = self.cfg.get('adaptive_hsv', True)
        self.auto_gamma = self.cfg.get('auto_gamma', True)
        
        # Index weights
        self.exg_weight = self.cfg.get('exg_weight', 0.7)
        self.trex_weight = self.cfg.get('trex_weight', 0.3)
        
        # Fallback strategies
        self.fallback_enabled = self.cfg.get('fallback_enabled', True)
    
    def calculate_exg(self, img: np.ndarray) -> np.ndarray:
        """
        Excess Green Index: ExG = 2G - R - B (normalized)
        
        Args:
            img: RGB görüntü (float32, 0-1 aralığında)
            
        Returns:
            np.ndarray: ExG indeksi
        """
        r = img[:, :, 0].astype(np.float32)
        g = img[:, :, 1].astype(np.float32)
        b = img[:, :, 2].astype(np.float32)
        
        denom = r + g + b + 1e-6
        rn, gn, bn = r / denom, g / denom, b / denom
        
        return 2 * gn - rn - bn
    
    def calculate_exg_enhanced(self, img: np.ndarray) -> np.ndarray:
        """
        Geliştirilmiş ExG: Contrast stretching sonrası.
        
        Args:
            img: RGB görüntü
            
        Returns:
            np.ndarray: Enhanced ExG
        """
        exg = self.calculate_exg(img)
        return rescale_intensity(exg, out_range=(0, 1))
    
    def calculate_trex(self, r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
        """
        TRI (True Color Vegetation Index): TREx = (R - G) / (R + G + B + epsilon) * 128 + 128
        Yüksek değer stres göstergesi.
        
        Args:
            r, g, b: Renk kanalları
            
        Returns:
            np.ndarray: TREx indeksi
        """
        denom = r + g + b + 1e-6
        trex = (r - g) / denom * 128 + 128
        return np.clip(trex, 0, 255).astype(np.float32)
    
    def calculate_exr(self, r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
        """
        Excess Red Index: ExR = (1.4*R - G) / (R + G + B + epsilon) * 255
        Stres indeksi.
        
        Args:
            r, g, b: Renk kanalları
            
        Returns:
            np.ndarray: ExR indeksi
        """
        denom = r + g + b + 1e-6
        exr = (1.4 * r - g) / denom * 255
        return np.clip(exr, 0, 255).astype(np.float32)
    
    def calculate_gr_ratio(self, g: np.ndarray, r: np.ndarray) -> np.ndarray:
        """
        Green-Red Ratio: GR = G / R
        
        Args:
            g, r: Yeşil ve Kırmızı kanallar
            
        Returns:
            np.ndarray: GR oranı
        """
        return g / (r + 1e-6)
    
    def estimate_gamma(self, img: np.ndarray) -> float:
        """
        Otomatik gamma tahmini - histogram analizine göre.
        
        Args:
            img: RGB görüntü (uint8)
            
        Returns:
            float: Gamma değeri
        """
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        mean_val = np.mean(gray)
        
        if mean_val < 80:
            return 0.8  # Parlaklığı artır
        elif mean_val > 180:
            return 1.5  # Parlaklığı azalt
        else:
            return 1.2  # Normal düzeltme
    
    def apply_gamma_correction(self, img: np.ndarray, gamma: float = 1.2) -> np.ndarray:
        """
        Gamma düzeltmesi ile ışık koşullarını dengeler.
        
        Args:
            img: RGB görüntü (uint8)
            gamma: Gamma değeri
            
        Returns:
            np.ndarray: Gamma düzeltilmiş görüntü
        """
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 
                          for i in np.arange(0, 256)]).astype("uint8")
        return cv2.LUT(img, table)
    
    def auto_adjust_hsv(self, hsv: np.ndarray, mask_initial: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Otomatik HSV threshold optimizasyonu - kullanıcı müdahalesini minimize eder.
        
        Args:
            hsv: HSV görüntü
            mask_initial: İlk maske
            
        Returns:
            Tuple[np.ndarray, np.ndarray]: Yeni HSV min ve max değerleri
        """
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
    
    def segment_with_exg(self, img: np.ndarray) -> Tuple[np.ndarray, float, str]:
        """
        ExG + Otsu thresholding ile segmentasyon.
        
        Args:
            img: RGB görüntü (float32, 0-1)
            
        Returns:
            Tuple[np.ndarray, float, str]: Binary maske, threshold değeri, method adı
        """
        try:
            exg = self.calculate_exg_enhanced(img)
            thresh = threshold_otsu(exg)
            mask = exg > thresh
            mask = binary_opening(mask, disk(self.open_radius))
            return mask.astype(np.uint8), float(thresh), "exg_otsu"
        except Exception as e:
            logger.warning(f"ExG+Otsu başarısız: {str(e)}")
            return np.zeros(img.shape[:2], dtype=np.uint8), 0.0, "exg_failed"
    
    def segment_with_hsv(self, img_uint8: np.ndarray, 
                         initial_mask: Optional[np.ndarray] = None) -> Tuple[np.ndarray, bool]:
        """
        HSV renk uzayı ile segmentasyon.
        
        Args:
            img_uint8: RGB görüntü (uint8)
            initial_mask: İlk maske (adaptive thresholding için)
            
        Returns:
            Tuple[np.ndarray, bool]: Binary maske, adaptive kullanıldı mı
        """
        try:
            hsv = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2HSV)
            
            # Auto-adjust HSV thresholds based on initial mask
            if self.adaptive_hsv and initial_mask is not None:
                hsv_min, hsv_max = self.auto_adjust_hsv(hsv, initial_mask)
                hsv_threshold_used = True
            else:
                hsv_min, hsv_max = self.hsv_min, self.hsv_max
                hsv_threshold_used = False
            
            mask_hsv = cv2.inRange(hsv, hsv_min, hsv_max)
            mask_hsv = mask_hsv > 0
            mask_hsv = binary_opening(mask_hsv, disk(self.open_radius))
            
            return mask_hsv.astype(np.uint8), hsv_threshold_used
            
        except Exception as e:
            logger.warning(f"HSV segmentasyon başarısız: {str(e)}")
            return np.zeros(img_uint8.shape[:2], dtype=np.uint8), False
    
    def segment_with_green_channel(self, img: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Fallback: Yeşil kanal thresholding.
        
        Args:
            img: RGB görüntü (float32, 0-1)
            
        Returns:
            Tuple[np.ndarray, float]: Binary maske, threshold değeri
        """
        try:
            g = img[:, :, 1]
            g_norm = rescale_intensity(g, out_range=(0, 1))
            thresh = threshold_li(g_norm)
            mask = g_norm > (thresh * 0.8)  # Relaxed threshold
            mask = binary_opening(mask, disk(3))
            return mask.astype(np.uint8), float(thresh)
        except Exception as e:
            logger.warning(f"Green channel fallback başarısız: {str(e)}")
            return np.zeros(img.shape[:2], dtype=np.uint8), 0.0
    
    def segment_with_lab(self, img_uint8: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Fallback: Lab renk uzayı a* kanalı.
        
        Args:
            img_uint8: RGB görüntü (uint8)
            
        Returns:
            Tuple[np.ndarray, float]: Binary maske, threshold değeri
        """
        try:
            lab = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2LAB)
            a_channel = lab[:, :, 1].astype(np.float32)
            a_norm = rescale_intensity(a_channel, out_range=(0, 1))
            
            # Green vegetation typically has negative a* values in LAB
            mask_lab = a_norm < 0.5
            mask_lab = binary_opening(mask_lab, disk(3))
            return mask_lab.astype(np.uint8), 0.5
        except Exception as e:
            logger.warning(f"LAB fallback başarısız: {str(e)}")
            return np.zeros(img_uint8.shape[:2], dtype=np.uint8), 0.0
    
    def refine_mask(self, mask: np.ndarray) -> np.ndarray:
        """
        Morfolojik işlemlerle maskeyi iyileştir.
        
        Args:
            mask: Binary maske
            
        Returns:
            np.ndarray: İyileştirilmiş maske
        """
        if np.sum(mask) == 0:
            return mask
        
        # Closing: Delikleri doldur
        mask = binary_closing(mask, disk(self.close_radius))
        
        # Small holes removal
        mask = remove_small_holes(mask.astype(bool), area_threshold=self.min_area * 2)
        
        # Opening: Küçük nesneleri kaldır
        mask = binary_opening(mask, disk(self.open_radius))
        
        # Small objects removal
        mask = remove_small_objects(mask, min_size=self.min_area)
        
        return mask.astype(np.uint8)
    
    def compute_bounding_box(self, mask: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        """
        Maske için bounding box hesapla.
        
        Args:
            mask: Binary maske
            
        Returns:
            Optional[Tuple[int, int, int, int]]: (x, y, width, height) veya None
        """
        coords = cv2.findNonZero(mask)
        if coords is None:
            return None
        
        x, y, w, h = cv2.boundingRect(coords)
        return (int(x), int(y), int(w), int(h))
    
    def crop_to_roi(self, image: np.ndarray, bbox: Tuple[int, int, int, int]) -> np.ndarray:
        """
        Görüntüyü bounding box'a kırp.
        
        Args:
            image: Görüntü
            bbox: (x, y, width, height)
            
        Returns:
            np.ndarray: Kırpılmış görüntü
        """
        x, y, w, h = bbox
        return image[y:y+h, x:x+w].copy()
    
    def calculate_solidity(self, mask: np.ndarray) -> float:
        """
        Solidity hesapla: Area / ConvexHull_Area
        
        Args:
            mask: Binary maske
            
        Returns:
            float: Solidity değeri (0-1)
        """
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return 0.0
        
        # Tüm konturları birleştir
        all_points = np.vstack(contours)
        hull = cv2.convexHull(all_points)
        hull_area = cv2.contourArea(hull)
        mask_area = cv2.contourArea(all_points)
        
        if hull_area == 0:
            return 0.0
        
        return float(mask_area / hull_area)
    
    def isolate_azolla(self, 
                       image: Union[np.ndarray, str, bytes],
                       context: Optional[ProcessingContext] = None) -> IsolationResult:
        """
        Ana izolasyon fonksiyonu. Tüm segmentasyon stratejilerini uygular.
        
        Args:
            image: Görüntü kaynağı (numpy array, dosya yolu, bytes)
            context: İşlem bağlamı (opsiyonel)
            
        Returns:
            IsolationResult: Maske, izole edilmiş görüntü, kırpılmış görüntü, metrikler
        """
        errors = []
        warnings = []
        
        try:
            # Import preprocessor here to avoid circular imports
            from .image_preprocessor import ImagePreprocessor
            
            # 1. Görüntüyü yükle ve ön işle
            preprocessor = ImagePreprocessor({})
            
            if isinstance(image, np.ndarray):
                img_rgb, exif_info = image, {}
            else:
                img_rgb, exif_info = preprocessor.load_image(image)
            
            # uint8 formatına dönüştür
            if img_rgb.dtype == np.float32 or img_rgb.dtype == np.float64:
                img_uint8 = (np.clip(img_rgb, 0, 1) * 255).astype(np.uint8)
            else:
                img_uint8 = img_rgb.copy()
            
            # 2. Gamma correction
            if self.auto_gamma:
                gamma = self.estimate_gamma(img_uint8)
                img_gamma = self.apply_gamma_correction(img_uint8, gamma=gamma)
            else:
                img_gamma = img_uint8
            
            # 3. Normalize et (float32, 0-1)
            img_float = img_gamma.astype(np.float32) / 255.0
            
            # 4. Calculate vegetation indices
            r = img_float[:, :, 0].astype(np.float32)
            g = img_float[:, :, 1].astype(np.float32)
            b = img_float[:, :, 2].astype(np.float32)
            
            trex = self.calculate_trex(r, g, b)
            exr = self.calculate_exr(r, g, b)
            gr_ratio_map = self.calculate_gr_ratio(g, r)
            
            # 5. STRATEGY 1: ExG + Otsu (primary)
            mask_exg, thresh_exg, method_exg = self.segment_with_exg(img_float)
            coverage_exg = np.mean(mask_exg) * 100
            
            best_mask = mask_exg.copy() if coverage_exg > 0.5 else None
            best_coverage = coverage_exg
            best_method = method_exg
            best_thresh = thresh_exg
            
            # 6. STRATEGY 2: HSV segmentation
            mask_hsv, hsv_used = self.segment_with_hsv(img_gamma, best_mask)
            coverage_hsv = np.mean(mask_hsv) * 100
            
            # Use HSV if it gives better coverage
            if coverage_hsv > best_coverage * 1.2:  # %20 daha iyi ise
                best_mask = mask_hsv.copy()
                best_coverage = coverage_hsv
                best_method = "hsv_adaptive" if hsv_used else "hsv_fixed"
                best_thresh = 0.0
            elif best_mask is not None:
                # Combine: union of both masks
                mask_combined = np.logical_or(best_mask, mask_hsv)
                coverage_combined = np.mean(mask_combined) * 100
                if coverage_combined > best_coverage * 1.1:
                    best_mask = mask_combined.astype(np.uint8)
                    best_coverage = coverage_combined
                    best_method = "exg_hsv_combined"
            
            # 7. STRATEGY 3: Fallback - Green channel
            if best_mask is None or best_coverage < 1.0:
                mask_green, thresh_green = self.segment_with_green_channel(img_float)
                coverage_green = np.mean(mask_green) * 100
                
                if coverage_green > best_coverage:
                    best_mask = mask_green
                    best_coverage = coverage_green
                    best_method = "green_channel_li"
                    best_thresh = thresh_green
            
            # 8. STRATEGY 4: Fallback - LAB
            if best_mask is None or best_coverage < 1.0:
                mask_lab, thresh_lab = self.segment_with_lab(img_gamma)
                coverage_lab = np.mean(mask_lab) * 100
                
                if coverage_lab > best_coverage:
                    best_mask = mask_lab
                    best_coverage = coverage_lab
                    best_method = "lab_a_channel"
                    best_thresh = thresh_lab
            
            # Use empty mask if nothing worked
            if best_mask is None:
                best_mask = np.zeros(img_uint8.shape[:2], dtype=np.uint8)
                best_coverage = 0.0
                best_method = "none"
                best_thresh = 0.0
            
            # 9. Refine mask with morphological operations
            refined_mask = self.refine_mask(best_mask)
            final_coverage = np.mean(refined_mask) * 100
            
            # 10. Calculate statistics on segmented region
            pixel_count = int(np.sum(refined_mask))
            
            if pixel_count > 0:
                trex_mean = float(np.mean(trex[refined_mask > 0]))
                exr_mean = float(np.mean(exr[refined_mask > 0]))
                gr_ratio = float(np.mean(gr_ratio_map[refined_mask > 0]))
                
                # Health score based on TREx (lower TREx = healthier)
                # TREx range is 0-255, healthy plants typically have TREx < 128
                health_score = max(0, min(100, 100 - (trex_mean - 128) * 0.5))
                
                # Solidity
                solidity = self.calculate_solidity(refined_mask)
            else:
                trex_mean = exr_mean = gr_ratio = 0.0
                health_score = 0.0
                solidity = 0.0
            
            # 11. Calculate contrast score
            gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2GRAY)
            contrast_score = float(np.std(gray))
            
            # 12. Generate outputs
            mask_uint8 = refined_mask * 255
            
            # Isolated image (segmented area only)
            isolated = cv2.bitwise_and(img_gamma, img_gamma, mask=mask_uint8)
            
            # Crop to bounding box
            bbox = self.compute_bounding_box(refined_mask)
            if bbox:
                cropped_isolated = self.crop_to_roi(isolated, bbox)
                cropped_mask = self.crop_to_roi(mask_uint8, bbox)
            else:
                cropped_isolated = isolated.copy()
                cropped_mask = mask_uint8.copy()
                bbox = None
            
            # 13. Warnings
            if final_coverage < 0.5:
                warnings.append(format_error(
                    "isolation",
                    f"Çok düşük biomass coverage ({final_coverage:.2f}%). Method: {best_method}",
                    "Azolla örneğinin frame'in önemli bir kısmını kapladığından emin olun",
                    "warning"
                ))
            
            if health_score < 50:
                warnings.append(format_error(
                    "isolation",
                    f"Düşük sağlık skoru ({health_score:.1f}). TREx: {trex_mean:.1f}",
                    "Bitki stresi tespit edildi, ileri analizler önerilir",
                    "warning"
                ))
            
            # 14. Create metrics
            metrics = SegmentationMetrics(
                coverage_pct=final_coverage,
                threshold_value=best_thresh,
                method_used=best_method,
                otsu_valid=final_coverage > 0.1,
                trex_mean=trex_mean,
                exr_mean=exr_mean,
                gr_ratio=gr_ratio,
                health_score=health_score,
                contrast_score=contrast_score,
                hsv_threshold_used=('hsv' in best_method),
                area_pixels=pixel_count,
                solidity=solidity,
                warnings=warnings,
                errors=errors
            )
            
            return IsolationResult(
                mask=mask_uint8,
                isolated_image=isolated,
                cropped_image=cropped_isolated,
                metrics=metrics,
                success=final_coverage > 0.1,
                bbox=bbox
            )
            
        except Exception as e:
            logger.error(f"İzolasyon hatası: {str(e)}")
            import traceback
            traceback.print_exc()
            
            errors.append(format_error(
                "isolation",
                f"İzolasyon başarısız: {str(e)}",
                "Görüntü kontrastını ve örnek yoğunluğunu kontrol edin",
                "error"
            ))
            
            return IsolationResult(
                mask=np.zeros((100, 100), dtype=np.uint8),
                isolated_image=np.zeros((100, 100, 3), dtype=np.uint8),
                cropped_image=np.zeros((100, 100, 3), dtype=np.uint8),
                metrics=SegmentationMetrics(
                    coverage_pct=0.0,
                    threshold_value=0.0,
                    method_used="failed",
                    otsu_valid=False,
                    trex_mean=0.0,
                    exr_mean=0.0,
                    gr_ratio=0.0,
                    health_score=0.0,
                    contrast_score=0.0,
                    hsv_threshold_used=False,
                    area_pixels=0,
                    solidity=0.0,
                    warnings=warnings,
                    errors=errors
                ),
                success=False
            )
    
    def select_roi_manual(self, image: np.ndarray, 
                          prompt: str = "ROI seçmek için bir dikdörtgen çizin, sonra 'c' tuşuna basın") -> Optional[Tuple[int, int, int, int]]:
        """
        Manuel ROI seçimi için yardımcı fonksiyon.
        Not: Bu fonksiyon GUI gerektirir, headless ortamlarda çalışmaz.
        
        Args:
            image: RGB görüntü
            prompt: Kullanıcıya gösterilecek mesaj
            
        Returns:
            Optional[Tuple[int, int, int, int]]: (x, y, width, height) veya None
        """
        try:
            img_display = image.copy()
            drawing = False
            ix, iy = -1, -1
            roi = None
            
            def draw_rectangle(event, x, y, flags, param):
                nonlocal drawing, ix, iy, roi, img_display
                
                if event == cv2.EVENT_LBUTTONDOWN:
                    drawing = True
                    ix, iy = x, y
                
                elif event == cv2.EVENT_MOUSEMOVE:
                    if drawing:
                        temp = img_display.copy()
                        cv2.rectangle(temp, (ix, iy), (x, y), (0, 255, 0), 2)
                        cv2.imshow(prompt, temp)
                
                elif event == cv2.EVENT_LBUTTONUP:
                    drawing = False
                    roi = (min(ix, x), min(iy, y), abs(x - ix), abs(y - iy))
                    cv2.rectangle(img_display, (ix, iy), (x, y), (0, 255, 0), 2)
                    cv2.imshow(prompt, img_display)
            
            cv2.imshow(prompt, img_display)
            cv2.setMouseCallback(prompt, draw_rectangle)
            
            while True:
                key = cv2.waitKey(1) & 0xFF
                if key == ord('c'):
                    break
                elif key == 27:  # ESC
                    roi = None
                    break
            
            cv2.destroyAllWindows()
            return roi
            
        except Exception as e:
            logger.error(f"ROI seçim hatası: {str(e)}")
            return None


def isolate_azolla(image: Union[np.ndarray, str, bytes],
                   config: Optional[Dict[str, Any]] = None) -> IsolationResult:
    """
    Standalone fonksiyon - hızlı kullanım için.
    
    Args:
        image: Görüntü kaynağı
        config: Opsiyonel konfigürasyon
        
    Returns:
        IsolationResult: Maske, izole edilmiş görüntü, kırpılmış görüntü, metrikler
    """
    isolator = AzollaIsolator(config)
    return isolator.isolate_azolla(image)
