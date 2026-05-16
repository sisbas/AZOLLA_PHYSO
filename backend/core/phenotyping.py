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
from typing import Dict, Any, Tuple, List
from dataclasses import dataclass
from skimage.feature import graycomatrix, graycoprops
from skimage.morphology import disk, binary_opening, binary_closing
import logging

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
    texture_contrast: float
    texture_homogeneity: float
    texture_energy: float
    texture_correlation: float
    
    # Biyokütle tahmini — kalibrasyon parametreleri ile
    fresh_biomass_g_m2: float
    dry_biomass_g_m2: float
    protein_content_percent: float
    biomass_calibration: Dict[str, Any]  # Kalibrasyon detayları
    
    # Büyüme parametreleri
    growth_rate_percent_day: float
    doubling_time_days: float
    max_coverage_percent: float
    
    errors: List[Dict[str, Any]]


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
        
        # Kalibrasyon katsayıları (deneysel olarak belirlenmeli)
        self.alpha = self.cfg.get('biomass_alpha', 5.75)  # g/m² per % coverage
        self.beta = self.cfg.get('biomass_beta', 10.0)   # base offset g/m²
        
        # Kalibrasyon güven aralıkları (literatür bazlı)
        self.alpha_ci = self.cfg.get('biomass_alpha_ci', (4.5, 7.0))
        self.r_squared = self.cfg.get('biomass_r_squared', 0.82)
        self.calibration_reference = self.cfg.get('calibration_reference', 'Lab calibration 2024')
        
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
                                  mask: np.ndarray) -> Tuple[float, float]:
        """
        Stres Belirleme İndeksleri
        
        Returns:
            browning_percent: Kahverengileşme oranı (R>B>G piksel yüzdesi)
            yellowing_percent: Sararma indeksi (G<R ve G<B piksel yüzdesi)
        """
        if not np.any(mask):
            return 0.0, 0.0
        
        # Maskeli bölge içindeki pikseller
        r_masked = r[mask]
        g_masked = g[mask]
        b_masked = b[mask]
        
        total_pixels = len(r_masked)
        if total_pixels == 0:
            return 0.0, 0.0
        
        # Kahverengileşme tespiti (R > B > G)
        brown_condition = (r_masked > b_masked) & (b_masked > g_masked)
        browning_percent = (np.sum(brown_condition) / total_pixels) * 100
        
        # Sararma tespiti (G < R ve G < B)
        yellow_condition = (g_masked < r_masked) & (g_masked < b_masked)
        yellowing_percent = (np.sum(yellow_condition) / total_pixels) * 100
        
        return browning_percent, yellowing_percent
    
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
    
    def calculate_glcm_features(self, img: np.ndarray, mask: np.ndarray) -> Dict[str, float]:
        """
        Doku Analizi - Gri Seviye Eş-Oluşum Matrisi (GLCM)
        
        Metrikler:
        - Contrast: Yerel varyasyon ölçüsü
        - Homogeneity: Yakınlık ağırlıklı moment
        - Energy: Uniformity ölçüsü
        - Correlation: Piksel korelasyonu
        """
        if not np.any(mask):
            return {
                'contrast': 0.0,
                'homogeneity': 0.0,
                'energy': 0.0,
                'correlation': 0.0
            }
        
        try:
            # Gri seviye görüntü
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            
            # 8-bit'e dönüştür
            if gray.dtype != np.uint8:
                gray = (gray * 255).astype(np.uint8)
            
            # Maskeli bölge
            gray_masked = gray.copy()
            gray_masked[~mask] = 0
            
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
            }
        except Exception as e:
            logging.warning(f"GLCM calculation failed: {str(e)}")
            return {
                'contrast': 0.0,
                'homogeneity': 0.0,
                'energy': 0.0,
                'correlation': 0.0
            }
    
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
        calibration_info = {
            'alpha': self.alpha,
            'beta': self.beta,
            'alpha_ci': list(self.alpha_ci),
            'r_squared': self.r_squared,
            'reference': self.calibration_reference,
            'note': 'Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.'
        }
        
        return {
            'fresh_biomass_g_m2': fresh_biomass,
            'dry_biomass_g_m2': dry_biomass,
            'protein_content_percent': protein_content,
            'calibration': calibration_info
        }
    
    def calculate_growth_parameters(self, current_coverage: float, 
                                     previous_coverage: float = None,
                                     time_diff_days: float = 1.0) -> Dict[str, float]:
        """
        Büyüme Parametreleri Hesaplama
        
        r = ln(A₂/A₁) / (t₂-t₁)
        T_d = ln(2) / r
        """
        if previous_coverage is None or previous_coverage <= 0:
            # Tek zaman noktası varsa varsayılan değerler
            return {
                'growth_rate_percent_day': 0.0,
                'doubling_time_days': 999.0,
                'max_coverage_percent': current_coverage
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
            
            # 4. Stres indeksleri
            browning_pct, yellowing_pct = self.calculate_stress_indices(r, g, b, mask_bool)
            stress_score = (browning_pct * 0.6 + yellowing_pct * 0.4)  # Ağırlıklı ortalama
            
            # 5. Yoğunluk haritası
            density_dist = self.calculate_density_map(mask_bool)
            
            # 6. Doku analizi (GLCM)
            texture_features = self.calculate_glcm_features(img_rgb, mask_bool)
            
            # 7. Biyokütle tahmini
            biomass_estimates = self.estimate_biomass(coverage_percent, chlorophyll_index)
            
            # 8. Büyüme parametreleri
            prev_coverage = None
            if previous_results and 'metrics' in previous_results:
                prev_coverage = previous_results['metrics'].get('coverage_pct')
            
            growth_params = self.calculate_growth_parameters(
                coverage_percent, 
                prev_coverage,
                time_diff_days
            )
            
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
                stress_score=round(stress_score, 2),
                
                density_low_percent=round(density_dist['low'], 2),
                density_medium_percent=round(density_dist['medium'], 2),
                density_high_percent=round(density_dist['high'], 2),
                
                texture_contrast=round(texture_features['contrast'], 4),
                texture_homogeneity=round(texture_features['homogeneity'], 4),
                texture_energy=round(texture_features['energy'], 4),
                texture_correlation=round(texture_features['correlation'], 4),
                
                fresh_biomass_g_m2=round(biomass_estimates['fresh_biomass_g_m2'], 2),
                dry_biomass_g_m2=round(biomass_estimates['dry_biomass_g_m2'], 2),
                protein_content_percent=round(biomass_estimates['protein_content_percent'], 2),
                biomass_calibration=biomass_estimates['calibration'],
                
                growth_rate_percent_day=round(growth_params['growth_rate_percent_day'], 2),
                doubling_time_days=round(growth_params['doubling_time_days'], 2),
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
                density_low_percent=0.0,
                density_medium_percent=0.0,
                density_high_percent=0.0,
                texture_contrast=0.0,
                texture_homogeneity=0.0,
                texture_energy=0.0,
                texture_correlation=0.0,
                fresh_biomass_g_m2=0.0,
                dry_biomass_g_m2=0.0,
                protein_content_percent=0.0,
                biomass_calibration={
                    'alpha': self.alpha,
                    'beta': self.beta,
                    'alpha_ci': list(self.alpha_ci),
                    'r_squared': self.r_squared,
                    'reference': self.calibration_reference,
                    'note': 'Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.'
                },
                growth_rate_percent_day=0.0,
                doubling_time_days=0.0,
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
                'stress_score': metrics.stress_score
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
                'calibration': metrics.biomass_calibration
            },
            'buyume_parametreleri': {
                'growth_rate_percent_day': metrics.growth_rate_percent_day,
                'doubling_time_days': metrics.doubling_time_days,
                'max_coverage_percent': metrics.max_coverage_percent
            },
            'errors': metrics.errors
        }
