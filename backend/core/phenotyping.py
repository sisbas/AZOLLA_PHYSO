# filepath: backend/core/phenotyping.py
"""
Azolla-RGB Fenotipleme ve Biyokütle Tahmin Modülü

Bu modül, Azolla microphylla türlerinin RGB görüntülerinden otomatik olarak 
fenotipik özelliklerini çıkaran, büyüme performansını izleyen ve biyokütle 
üretimi tahmin eden hesaplamaları yapar.

Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
"""

import numpy as np
import cv2
from typing import Dict, Any, Tuple, List, Optional
from dataclasses import dataclass
from skimage.feature import graycomatrix, graycoprops
from skimage.morphology import disk, binary_opening, binary_closing
import logging
import json
from pathlib import Path

from .scoring import EARLY_WARNING_NOTE, compute_health_stress_scores

@dataclass
class PhenotypeMetrics:
    """Fenotipik ölçüm metrikleri"""
    # Segmentasyon sonuçları
    azolla_area_pixels: float
    azolla_area_m2: float
    coverage_percent: float
    water_surface_percent: float
    
    # Renk bazlı indeksler
    agi_index: float  # Azolla Yeşillik İndeksi
    saci_index: float  # Su-Azolla Kontrast İndeksi
    chlorophyll_index: float  # Klorofil Durum İndeksi
    
    # Stres belirleme
    stress_browning_percent: float  # Kahverengileşme oranı
    stress_yellowing_percent: float  # Sararma indeksi
    stress_score: float
    
    # Yoğunluk analizi
    density_low_percent: float
    density_medium_percent: float
    density_high_percent: float
    
    # Doku analizi (GLCM)
    texture_contrast: Optional[float]
    texture_homogeneity: Optional[float]
    texture_energy: Optional[float]
    texture_correlation: Optional[float]
    
    # Biyokütle tahmini — kalibrasyon parametreleri ile
    fresh_biomass_g_m2: float
    dry_biomass_g_m2: float
    protein_content_percent: float
    biomass_calibration: Dict[str, Any]  # Kalibrasyon detayları
    
    # Büyüme parametreleri
    growth_rate_percent_day: Optional[float]
    doubling_time_days: Optional[float]
    max_coverage_percent: float
    
    errors: List[Dict[str, Any]]

    # Merkezi skor metadata'sı (geriye dönük uyumluluk için varsayılanlı)
    health_score: float = 0.0
    score_note: str = EARLY_WARNING_NOTE
    score_inputs: Optional[Dict[str, Any]] = None
    score_weights: Optional[Dict[str, Any]] = None


class PhenotypingModule:
    """
    Azolla-RGB Fenotipleme ve Biyokütle Tahmin Modülü
    
    ALGORİTMA ADIMLARI:
    1. Ön İşleme: Gamma düzeltme, beyaz dengesi, yansıma azaltma
    2. Segmentasyon: HSV + LAB renk uzayları, çoklu eşikleme
    3. Özellik Çıkarımı: Alan, yoğunluk, doku analizi
    4. Zamansal Analiz: Büyüme hızı, katlanma süresi
    5. Biyokütle Tahmini: Taze/kuru ağırlık, protein içeriği
    
    NOT: pixel_to_m2 değeri kamera kalibrasyonuna göre değişir.
    Gerçek alan hesabı için pool_area_m2 parametresi kullanılmalıdır.
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config.get('phenotyping', {})
        
        # Kalibrasyon artefaktı (JSON) üzerinden model katsayılarını yükle.
        self.calibration_artifact_path = self.cfg.get('biomass_calibration_artifact')
        self.calibration_dataset_id = self.cfg.get('calibration_dataset_id')
        self.calibration_date = self.cfg.get('calibration_date')
        self.calibration_sample_count = self.cfg.get('calibration_sample_count')
        self.calibration_mae = self.cfg.get('calibration_mae')
        self.calibration_rmse = self.cfg.get('calibration_rmse')

        calibration_payload = self._load_calibration_artifact(self.calibration_artifact_path)

        # Kalibrasyon katsayıları
        self.alpha = float(calibration_payload.get('alpha', self.cfg.get('biomass_alpha', 5.75)))
        self.beta = float(calibration_payload.get('beta', self.cfg.get('biomass_beta', 10.0)))

        # Kalibrasyon güven aralıkları ve metadata
        self.alpha_ci = tuple(calibration_payload.get('alpha_ci', self.cfg.get('biomass_alpha_ci', (4.5, 7.0))))
        self.r_squared = float(calibration_payload.get('r_squared', self.cfg.get('biomass_r_squared', 0.82)))
        self.calibration_reference = calibration_payload.get('reference', self.cfg.get('calibration_reference', 'Lab calibration 2024'))

        self.calibration_dataset_id = calibration_payload.get('dataset_id', self.calibration_dataset_id)
        self.calibration_date = calibration_payload.get('calibration_date', self.calibration_date)
        self.calibration_sample_count = calibration_payload.get('sample_count', self.calibration_sample_count)
        self.calibration_mae = calibration_payload.get('mae', self.calibration_mae)
        self.calibration_rmse = calibration_payload.get('rmse', self.calibration_rmse)
        self.coverage_range = calibration_payload.get('coverage_range', self.cfg.get('calibration_coverage_range', [0.0, 100.0]))
        self.chlorophyll_range = calibration_payload.get('chlorophyll_range', self.cfg.get('calibration_chlorophyll_range', [0.0, 10.0]))
        
        # Pixel to m² conversion — varsayılan değer, gerçek hesaplama phenotyping_service.py'de yapılır
        self.pixel_to_m2 = self.cfg.get('pixel_to_m2', 0.0001)  # Örnek: 1920x1080 @ 1m²
        
        # HSV ranges for Azolla segmentation
        self.hsv_green_min = np.array(self.cfg.get('hsv_green_min', [35, 40, 50]))
        self.hsv_green_max = np.array(self.cfg.get('hsv_green_max', [75, 255, 255]))
        
        # Yoğunluk sınıflandırma eşikleri
        self.density_thresholds = self.cfg.get('density_thresholds', {
            'low_max': 33,
            'medium_max': 66,
            'high_min': 67
        })
        # Stres analizi eşikleri ve ağırlıkları (varsayılanlar):
        # - brown_hue_range: HSV ton aralığı [0-179] kahverengi/kızıl yaprak tespiti
        # - brown_min_saturation/value: düşük satürasyonlu gölgeleri elemek için alt sınır
        # - yellow_hue_range: HSV ton aralığı [0-179] sararma tespiti
        # - yellow_min_saturation/value: zayıf/yetersiz renkli pikselleri dışlama eşiği
        # - lab_bright_percentile: aydınlatma normalizasyonu için LAB-L yüzdelik
        # - iqr_penalty_scale: maskeli bölgede IQR genişliği bazlı robust ceza
        # - browning_weight/yellowing_weight/distribution_weight: stres skoru bileşen ağırlıkları
        self.stress_thresholds = self.cfg.get('stress_thresholds', {
            'brown_hue_range': [5, 30],
            'brown_min_saturation': 45,
            'brown_min_value': 35,
            'yellow_hue_range': [18, 45],
            'yellow_min_saturation': 30,
            'yellow_min_value': 40,
            'lab_bright_percentile': 60,
            'iqr_penalty_scale': 0.30,
            'browning_weight': 0.5,
            'yellowing_weight': 0.3,
            'distribution_weight': 0.2
        })
        self.glcm_min_pixels = int(self.cfg.get('glcm_min_pixels', 32))
        

    def _load_calibration_artifact(self, artifact_path: Optional[str]) -> Dict[str, Any]:
        if not artifact_path:
            return {}
        try:
            payload = json.loads(Path(artifact_path).read_text(encoding='utf-8'))
            if not isinstance(payload, dict):
                logging.warning('Calibration artifact is not an object: %s', artifact_path)
                return {}
            return payload
        except Exception as exc:
            logging.warning('Calibration artifact could not be loaded (%s): %s', artifact_path, exc)
            return {}

    def _compute_confidence(self, coverage_percent: float, chlorophyll_index: float) -> Dict[str, Any]:
        reasons: List[str] = []
        coverage_min, coverage_max = float(self.coverage_range[0]), float(self.coverage_range[1])
        chl_min, chl_max = float(self.chlorophyll_range[0]), float(self.chlorophyll_range[1])

        if coverage_percent < coverage_min or coverage_percent > coverage_max:
            reasons.append('coverage_outside_calibration_range')
        if chlorophyll_index < chl_min or chlorophyll_index > chl_max:
            reasons.append('chlorophyll_outside_calibration_range')

        confidence_score = 1.0 if not reasons else 0.45
        return {
            'confidence_score': confidence_score,
            'low_confidence_reason': ';'.join(reasons) if reasons else None,
            'input_range': {
                'coverage_percent': {'value': coverage_percent, 'min': coverage_min, 'max': coverage_max},
                'chlorophyll_index': {'value': chlorophyll_index, 'min': chl_min, 'max': chl_max},
            }
        }

    def calculate_agi(self, r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
        """
        Azolla Yeşillik İndeksi (AGI)
        AGI = (2×G - R - B) / (2×G + R + B)
        Değer aralığı: [-1, 1], yüksek değer = sağlıklı yeşil
        """
        denom = 2 * g + r + b + 1e-6
        agi = (2 * g - r - b) / denom
        return np.clip(agi, -1, 1)
    
    def calculate_saci(self, g: np.ndarray, b: np.ndarray) -> np.ndarray:
        """
        Su-Azolla Kontrast İndeksi (SACI)
        SACI = (G - B) / (G + B + 0.001)
        Su yüzeyi ile azolla ayrımını iyileştirir
        """
        saci = (g - b) / (g + b + 0.001)
        return np.clip(saci, -1, 1)
    
    def calculate_chlorophyll_index(self, g: np.ndarray, r: np.ndarray) -> np.ndarray:
        """
        Klorofil Durum İndeksi (Chl-Azolla)
        Chl-Azolla = G / (R + 0.01)
        Yüksek değer = yüksek klorofil içeriği
        """
        chl = g / (r + 0.01)
        return np.clip(chl, 0, 10)
    
    def calculate_stress_indices(self, r: np.ndarray, g: np.ndarray, b: np.ndarray,
                                  mask: np.ndarray) -> Tuple[float, float, float]:
        """
        Stres Belirleme İndeksleri
        
        Returns:
            browning_percent: Kahverengileşme oranı (HSV/LAB normalize piksel yüzdesi)
            yellowing_percent: Sararma indeksi (HSV/LAB normalize piksel yüzdesi)
            robust_distribution_score: Maskeli piksel dağılımından percentile/IQR tabanlı ceza
        """
        if not np.any(mask):
            return 0.0, 0.0, 0.0
        
        # Maskeli bölge içindeki pikseller
        r_masked = r[mask]
        g_masked = g[mask]
        
        total_pixels = len(r_masked)
        if total_pixels == 0:
            return 0.0, 0.0, 0.0

        # HSV/LAB üzerinden aydınlatma normalize edilmiş stres tespiti
        rgb_img = np.stack((r, g, b), axis=-1)
        rgb_u8 = np.clip(rgb_img * 255.0, 0, 255).astype(np.uint8)
        hsv = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2HSV)
        lab = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2LAB)

        h = hsv[:, :, 0][mask]
        s = hsv[:, :, 1][mask]
        v = hsv[:, :, 2][mask]
        l = lab[:, :, 0][mask].astype(np.float32) / 255.0

        pctl = float(np.percentile(l, self.stress_thresholds['lab_bright_percentile']))
        adaptive_v_floor = self.stress_thresholds['brown_min_value'] * pctl

        brown_h0, brown_h1 = self.stress_thresholds['brown_hue_range']
        yellow_h0, yellow_h1 = self.stress_thresholds['yellow_hue_range']

        # Kahverengileşme tespiti
        brown_condition = (
            (h >= brown_h0) & (h <= brown_h1) &
            (s >= self.stress_thresholds['brown_min_saturation']) &
            (v >= adaptive_v_floor)
        )
        browning_percent = (np.sum(brown_condition) / total_pixels) * 100

        # Sararma tespiti
        yellow_condition = (
            (h >= yellow_h0) & (h <= yellow_h1) &
            (s >= self.stress_thresholds['yellow_min_saturation']) &
            (v >= self.stress_thresholds['yellow_min_value'] * pctl)
        )
        yellowing_percent = (np.sum(yellow_condition) / total_pixels) * 100

        # Robust istatistik: maskeli bölgede kanal dağılımı (IQR / median)
        rg_delta = r_masked - g_masked
        q25 = np.percentile(rg_delta, 25)
        q50 = np.percentile(rg_delta, 50)
        q75 = np.percentile(rg_delta, 75)
        iqr = max(q75 - q25, 1e-6)
        normalized_iqr = iqr / (abs(q50) + 1e-3)
        robust_distribution_score = float(np.clip(normalized_iqr * self.stress_thresholds['iqr_penalty_scale'] * 100, 0, 100))

        return browning_percent, yellowing_percent, robust_distribution_score
    
    def calculate_density_map(self, mask: np.ndarray, window_size: int = 64) -> Dict[str, float]:
        """
        Yoğunluk Haritası Hesaplama
        64×64 piksel kayan pencere ile yerel yoğunluk analizi
        
        Returns:
            Dictionary with low, medium, high density percentages
        """
        h, w = mask.shape
        if h < window_size or w < window_size:
            return {'low': 0.0, 'medium': 0.0, 'high': 100.0 if np.any(mask) else 0.0}
        
        # Kayan pencere analizi
        densities = []
        step = window_size // 2
        
        for i in range(0, h - window_size + 1, step):
            for j in range(0, w - window_size + 1, step):
                window = mask[i:i+window_size, j:j+window_size]
                local_coverage = (np.sum(window > 0) / (window_size * window_size)) * 100
                densities.append(local_coverage)
        
        if not densities:
            return {'low': 0.0, 'medium': 0.0, 'high': 0.0}
        
        # Sınıflandırma
        low_count = sum(1 for d in densities if d <= self.density_thresholds['low_max'])
        medium_count = sum(1 for d in densities 
                          if self.density_thresholds['low_max'] < d <= self.density_thresholds['medium_max'])
        high_count = sum(1 for d in densities if d > self.density_thresholds['medium_max'])
        
        total = len(densities)
        
        return {
            'low': (low_count / total) * 100,
            'medium': (medium_count / total) * 100,
            'high': (high_count / total) * 100
        }
    
    def calculate_glcm_features(
        self,
        img: np.ndarray,
        mask: np.ndarray
    ) -> Tuple[Dict[str, Optional[float]], List[Dict[str, Any]]]:
        """
        Doku Analizi - Gri Seviye Eş-Oluşum Matrisi (GLCM)
        
        Metrikler:
        - Contrast: Yerel varyasyon ölçüsü
        - Homogeneity: Yakınlık ağırlıklı moment
        - Energy: Uniformity ölçüsü
        - Correlation: Piksel korelasyonu
        """
        texture_none = {
            'contrast': None,
            'homogeneity': None,
            'energy': None,
            'correlation': None
        }
        warnings: List[Dict[str, Any]] = []
        if not np.any(mask):
            warnings.append({
                'step': 'texture_glcm',
                'message': 'GLCM hesaplanamadı: ROI maskesi boş.',
                'severity': 'warning'
            })
            return texture_none, warnings
        
        try:
            ys, xs = np.where(mask)
            y0, y1 = int(ys.min()), int(ys.max()) + 1
            x0, x1 = int(xs.min()), int(xs.max()) + 1

            # ROI bounding box
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            roi_gray = gray[y0:y1, x0:x1]
            roi_mask = mask[y0:y1, x0:x1]
            roi_pixels = int(np.sum(roi_mask))
            if roi_pixels < self.glcm_min_pixels:
                warnings.append({
                    'step': 'texture_glcm',
                    'message': (
                        f'GLCM atlandı: ROI çok küçük '
                        f'({roi_pixels} px < eşik {self.glcm_min_pixels} px).'
                    ),
                    'severity': 'warning'
                })
                return texture_none, warnings

            # Gri seviye görüntü
            # 8-bit'e dönüştür
            if roi_gray.dtype != np.uint8:
                roi_gray = (roi_gray * 255).astype(np.uint8)

            # Maskeli bölge: yalnız ROI içinde komşuluklar değerlendirilsin
            gray_masked = roi_gray.copy()
            gray_masked[~roi_mask] = 0
            
            # GLCM hesaplama
            glcm = graycomatrix(gray_masked, distances=[5], angles=[0], levels=256, symmetric=True, normed=True)
            
            # Özellikler
            contrast = graycoprops(glcm, 'contrast')[0, 0]
            homogeneity = graycoprops(glcm, 'homogeneity')[0, 0]
            energy = graycoprops(glcm, 'energy')[0, 0]
            correlation = graycoprops(glcm, 'correlation')[0, 0]
            
            return {
                'contrast': float(contrast),
                'homogeneity': float(homogeneity),
                'energy': float(energy),
                'correlation': float(correlation)
            }, warnings
        except Exception as e:
            logging.warning(f"GLCM calculation failed: {str(e)}")
            warnings.append({
                'step': 'texture_glcm',
                'message': f'GLCM hesaplaması başarısız: {str(e)}',
                'severity': 'warning'
            })
            return texture_none, warnings
    
    def estimate_biomass(self, coverage_percent: float, chlorophyll_index: float) -> Dict[str, Any]:
        """
        Biyokütle Tahmini
        
        Kalibrasyon modeli:
        taze_ağırlık (g/m²) = α × kaplama_yüzdesi + β
        kuru_ağırlık = taze_ağırlık × 0.08 (%8 kuru madde)
        protein (%) = 25 + 10 × (Chl-Azolla indeksi normalize)
        
        Returns include calibration metadata for transparency.
        """
        # Taze ağırlık tahmini
        fresh_biomass = self.alpha * coverage_percent + self.beta
        
        # Kuru madde (%8 tipik Azolla için)
        dry_biomass = fresh_biomass * 0.08
        
        # Protein içeriği tahmini (klorofil bazlı)
        # Chl indeksi normalize (0-10 arası -> 0-1)
        chl_normalized = min(chlorophyll_index / 10.0, 1.0)
        protein_content = 25 + 10 * chl_normalized  # %25-35 aralığı
        
        # Kalibrasyon bilgisi — API response'una eklenir
        confidence = self._compute_confidence(coverage_percent, chlorophyll_index)

        calibration_info = {
            'alpha': self.alpha,
            'beta': self.beta,
            'alpha_ci': list(self.alpha_ci),
            'r_squared': self.r_squared,
            'reference': self.calibration_reference,
            'note': EARLY_WARNING_NOTE,
            'dataset_id': self.calibration_dataset_id,
            'calibration_date': self.calibration_date,
            'sample_count': self.calibration_sample_count,
            'mae': self.calibration_mae,
            'rmse': self.calibration_rmse
        }
        
        return {
            'fresh_biomass_g_m2': fresh_biomass,
            'dry_biomass_g_m2': dry_biomass,
            'protein_content_percent': protein_content,
            'calibration': calibration_info,
            'confidence_score': confidence['confidence_score'],
            'low_confidence_reason': confidence['low_confidence_reason'],
            'confidence_context': confidence['input_range']
        }
    
    def _extract_previous_coverage(self, previous_results: Dict[str, Any] = None) -> Optional[float]:
        """Read prior coverage from current phenotyping output or legacy metrics."""
        if not previous_results:
            return None

        candidates = [
            previous_results.get('phenotyping', {})
                .get('segmentasyon', {})
                .get('coverage_percent'),
            previous_results.get('metrics', {}).get('coverage_pct'),
        ]

        for candidate in candidates:
            if candidate is None:
                continue
            try:
                coverage = float(candidate)
            except (TypeError, ValueError):
                continue
            if np.isfinite(coverage):
                return coverage

        return None

    def calculate_growth_parameters(self, current_coverage: float, 
                                     previous_coverage: float = None,
                                     time_diff_days: float = 1.0) -> Dict[str, Optional[float]]:
        """
        Büyüme Parametreleri Hesaplama
        
        r = ln(A₂/A₁) / (t₂-t₁)
        T_d = ln(2) / r
        """
        if previous_coverage is None or previous_coverage <= 0:
            # Tek zaman noktası veya geçersiz önceki veri varsa büyüme hesabı yapılamaz.
            return {
                'growth_rate_percent_day': None,
                'doubling_time_days': None,
                'max_coverage_percent': current_coverage
            }

        if time_diff_days is None or time_diff_days <= 0:
            # Aynı/ters tarihli frame'lerde günlük büyüme güvenilir değildir.
            return {
                'growth_rate_percent_day': None,
                'doubling_time_days': None,
                'max_coverage_percent': max(current_coverage, previous_coverage)
            }
        
        # Büyüme hızı
        if current_coverage <= 0:
            growth_rate = 0.0
        else:
            growth_rate = (np.log(current_coverage / previous_coverage) / time_diff_days) * 100
        
        # Katlanma süresi
        if growth_rate > 0:
            doubling_time = np.log(2) / (growth_rate / 100)
        else:
            doubling_time = 999.0  # Sonsuza yakın
        
        return {
            'growth_rate_percent_day': growth_rate,
            'doubling_time_days': doubling_time,
            'max_coverage_percent': max(current_coverage, previous_coverage)
        }
    
    def process(self, img_rgb: np.ndarray, mask: np.ndarray, 
                previous_results: Dict[str, Any] = None,
                time_diff_days: float = 1.0) -> PhenotypeMetrics:
        """
        Ana işleme fonksiyonu - tüm fenotipik metrikleri hesaplar
        
        Args:
            img_rgb: RGB görüntü (numpy array, 0-255)
            mask: Binary maske (0-255 veya boolean)
            previous_results: Önceki zaman noktasının sonuçları
            time_diff_days: Geçen süre (gün)
            
        Returns:
            PhenotypeMetrics: Tüm fenotipik ölçümler
        """
        errors = []
        
        try:
            # Maskeyi normalize et
            if mask.max() > 1:
                mask_bool = mask > 128
            else:
                mask_bool = mask.astype(bool)
            
            h, w = img_rgb.shape[:2]
            total_pixels = h * w
            
            # 1. Alan hesaplaması
            azolla_pixels = np.sum(mask_bool)
            coverage_percent = (azolla_pixels / total_pixels) * 100
            azolla_area_m2 = azolla_pixels * self.pixel_to_m2
            water_surface_percent = 100 - coverage_percent
            
            # 2. Renk kanallarını ayır (normalize 0-1)
            if img_rgb.dtype != np.float32 and img_rgb.dtype != np.float64:
                img_norm = img_rgb.astype(np.float32) / 255.0
            else:
                img_norm = img_rgb.copy()
            
            r = img_norm[:,:,0]
            g = img_norm[:,:,1]
            b = img_norm[:,:,2]
            
            # Maskeli ortalamalar
            if np.any(mask_bool):
                r_mean = np.mean(r[mask_bool])
                g_mean = np.mean(g[mask_bool])
                b_mean = np.mean(b[mask_bool])
            else:
                r_mean = g_mean = b_mean = 0.0
            
            # 3. Renk bazlı indeksler
            agi = self.calculate_agi(r, g, b)
            saci = self.calculate_saci(g, b)
            chl = self.calculate_chlorophyll_index(g, r)
            
            # Maskeli ortalamalar
            agi_index = float(np.mean(agi[mask_bool])) if np.any(mask_bool) else 0.0
            saci_index = float(np.mean(saci[mask_bool])) if np.any(mask_bool) else 0.0
            chlorophyll_index = float(np.mean(chl[mask_bool])) if np.any(mask_bool) else 0.0
            
            # 4. Stres indeksleri için açık girdiler
            browning_pct, yellowing_pct, robust_dist_score = self.calculate_stress_indices(r, g, b, mask_bool)
            
            # 5. Yoğunluk haritası
            density_dist = self.calculate_density_map(mask_bool)
            
            # 6. Doku analizi (GLCM)
            texture_features, texture_warnings = self.calculate_glcm_features(img_rgb, mask_bool)
            errors.extend(texture_warnings)
            
            # 7. Biyokütle tahmini
            biomass_estimates = self.estimate_biomass(coverage_percent, chlorophyll_index)
            
            # 8. Büyüme parametreleri
            prev_coverage = self._extract_previous_coverage(previous_results)
            
            growth_params = self.calculate_growth_parameters(
                coverage_percent, 
                prev_coverage,
                time_diff_days
            )

            score_result = compute_health_stress_scores(
                agi_index=agi_index,
                saci_index=saci_index,
                chlorophyll_index=chlorophyll_index,
                browning_percent=browning_pct,
                yellowing_percent=yellowing_pct,
                growth_rate_percent_day=growth_params['growth_rate_percent_day'],
                robust_distribution_score=robust_dist_score,
                browning_weight=float(self.stress_thresholds['browning_weight']),
                yellowing_weight=float(self.stress_thresholds['yellowing_weight']),
                distribution_weight=float(self.stress_thresholds['distribution_weight']),
            )

            def round_optional(value, digits: int = 2):
                return None if value is None else round(value, digits)
            
            return PhenotypeMetrics(
                azolla_area_pixels=float(azolla_pixels),
                azolla_area_m2=round(azolla_area_m2, 4),
                coverage_percent=round(coverage_percent, 2),
                water_surface_percent=round(water_surface_percent, 2),
                
                agi_index=round(agi_index, 4),
                saci_index=round(saci_index, 4),
                chlorophyll_index=round(chlorophyll_index, 4),
                
                stress_browning_percent=round(browning_pct, 2),
                stress_yellowing_percent=round(yellowing_pct, 2),
                stress_score=round(score_result['stress_score'], 2),
                health_score=round(score_result['health_score'], 2),
                score_note=score_result['score_note'],
                score_inputs=score_result['score_inputs'],
                score_weights=score_result['score_weights'],
                
                density_low_percent=round(density_dist['low'], 2),
                density_medium_percent=round(density_dist['medium'], 2),
                density_high_percent=round(density_dist['high'], 2),
                
                texture_contrast=round(texture_features['contrast'], 4) if texture_features['contrast'] is not None else None,
                texture_homogeneity=round(texture_features['homogeneity'], 4) if texture_features['homogeneity'] is not None else None,
                texture_energy=round(texture_features['energy'], 4) if texture_features['energy'] is not None else None,
                texture_correlation=round(texture_features['correlation'], 4) if texture_features['correlation'] is not None else None,
                
                fresh_biomass_g_m2=round(biomass_estimates['fresh_biomass_g_m2'], 2),
                dry_biomass_g_m2=round(biomass_estimates['dry_biomass_g_m2'], 2),
                protein_content_percent=round(biomass_estimates['protein_content_percent'], 2),
                biomass_calibration={**biomass_estimates['calibration'],
                                    'confidence_score': biomass_estimates.get('confidence_score'),
                                    'low_confidence_reason': biomass_estimates.get('low_confidence_reason'),
                                    'confidence_context': biomass_estimates.get('confidence_context')},
                
                growth_rate_percent_day=round_optional(growth_params['growth_rate_percent_day'], 2),
                doubling_time_days=round_optional(growth_params['doubling_time_days'], 2),
                max_coverage_percent=round(growth_params['max_coverage_percent'], 2),
                
                errors=errors
            )
            
        except Exception as e:
            logging.error(f"Phenotyping failure: {str(e)}")
            import traceback
            traceback.print_exc()
            
            errors.append({
                'step': 'phenotyping',
                'message': f'Fenotipleme başarısız: {str(e)}',
                'severity': 'error'
            })
            
            return PhenotypeMetrics(
                azolla_area_pixels=0.0,
                azolla_area_m2=0.0,
                coverage_percent=0.0,
                water_surface_percent=0.0,
                agi_index=0.0,
                saci_index=0.0,
                chlorophyll_index=0.0,
                stress_browning_percent=0.0,
                stress_yellowing_percent=0.0,
                stress_score=0.0,
                health_score=0.0,
                score_note=EARLY_WARNING_NOTE,
                score_inputs={},
                score_weights={},
                density_low_percent=0.0,
                density_medium_percent=0.0,
                density_high_percent=0.0,
                texture_contrast=None,
                texture_homogeneity=None,
                texture_energy=None,
                texture_correlation=None,
                fresh_biomass_g_m2=0.0,
                dry_biomass_g_m2=0.0,
                protein_content_percent=0.0,
                biomass_calibration={
                    'alpha': self.alpha,
                    'beta': self.beta,
                    'alpha_ci': list(self.alpha_ci),
                    'r_squared': self.r_squared,
                    'reference': self.calibration_reference,
                    'note': EARLY_WARNING_NOTE
                },
                growth_rate_percent_day=None,
                doubling_time_days=None,
                max_coverage_percent=0.0,
                errors=errors
            )
    
    def to_dict(self, metrics: PhenotypeMetrics) -> Dict[str, Any]:
        """PhenotypeMetrics nesnesini dictionary'e çevirir"""
        return {
            'segmentasyon': {
                'azolla_area_pixels': metrics.azolla_area_pixels,
                'azolla_area_m2': metrics.azolla_area_m2,
                'coverage_percent': metrics.coverage_percent,
                'water_surface_percent': metrics.water_surface_percent
            },
            'renk_indeksleri': {
                'agi_index': metrics.agi_index,
                'saci_index': metrics.saci_index,
                'chlorophyll_index': metrics.chlorophyll_index
            },
            'stres_analizi': {
                'browning_percent': metrics.stress_browning_percent,
                'yellowing_percent': metrics.stress_yellowing_percent,
                'stress_score': metrics.stress_score,
                'health_score': metrics.health_score,
                'score_note': metrics.score_note,
                'score_inputs': metrics.score_inputs,
                'score_weights': metrics.score_weights
            },
            'yogunluk_dagilimi': {
                'low_percent': metrics.density_low_percent,
                'medium_percent': metrics.density_medium_percent,
                'high_percent': metrics.density_high_percent
            },
            'doku_analizi': {
                'contrast': metrics.texture_contrast,
                'homogeneity': metrics.texture_homogeneity,
                'energy': metrics.texture_energy,
                'correlation': metrics.texture_correlation
            },
            'biyokutle_tahmini': {
                'fresh_biomass_g_m2': metrics.fresh_biomass_g_m2,
                'dry_biomass_g_m2': metrics.dry_biomass_g_m2,
                'protein_content_percent': metrics.protein_content_percent,
                'calibration': metrics.biomass_calibration,
                'confidence_score': metrics.biomass_calibration.get('confidence_score'),
                'low_confidence_reason': metrics.biomass_calibration.get('low_confidence_reason')
            },
            'buyume_parametreleri': {
                'growth_rate_percent_day': metrics.growth_rate_percent_day,
                'doubling_time_days': metrics.doubling_time_days,
                'max_coverage_percent': metrics.max_coverage_percent
            },
            'errors': metrics.errors
        }
