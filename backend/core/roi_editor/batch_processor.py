"""
Batch Processing Module
Paralel görüntü işleme ve raporlama
"""

import json
import cv2
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
from dataclasses import dataclass, field, asdict
import pandas as pd
from joblib import Parallel, delayed
from tqdm import tqdm

from .isolation import isolate_roi, ROIMethod, ROIParams
from .registration import register_images, RegistrationResult, RegistrationParams
from .normalization import normalize_to_reference, NormalizationStats, NormalizationParams
from .metrics import compute_scientific_metrics, ScientificMetrics, MetricsConfig


class BatchConfig(BaseModel):
    """Batch işlem konfigürasyonu"""
    # ROI parametreleri
    roi_method: str = "threshold"
    roi_thresh: int = 127
    roi_blur_kernel: int = 5
    
    # Registration parametreleri
    reg_n_keypoints: int = 2000
    reg_min_inlier_ratio: float = 0.7
    
    # Normalizasyon parametreleri
    norm_use_roi_only: bool = True
    
    # Metrik eşikleri
    ssim_threshold: float = 0.85
    psnr_threshold_db: float = 25.0
    color_delta_threshold: float = 15.0
    
    # Çıktı ayarları
    save_processed_images: bool = True
    output_format: str = "png"  # png veya jpg
    
    # Performans
    n_jobs: int = -1  # -1 = tüm CPU'ları kullan


@dataclass
class SingleImageResult:
    """Tek görüntü işleme sonucu"""
    source_file: str
    success: bool
    error_message: Optional[str] = None
    
    # Registration sonuçları
    translation_x: float = 0.0
    translation_y: float = 0.0
    rotation_deg: float = 0.0
    scale: float = 1.0
    inlier_ratio: float = 0.0
    n_matches: int = 0
    n_inliers: int = 0
    registration_success: bool = False
    
    # Normalizasyon istatistikleri
    R_mean_source: float = 0.0
    R_mean_reference: float = 0.0
    R_mean_matched: float = 0.0
    G_mean_source: float = 0.0
    G_mean_reference: float = 0.0
    G_mean_matched: float = 0.0
    B_mean_source: float = 0.0
    B_mean_reference: float = 0.0
    B_mean_matched: float = 0.0
    overall_mean_shift: float = 0.0
    
    # Bilimsel metrikler
    ssim: float = 0.0
    psnr: float = 0.0
    delta_r: float = 0.0
    delta_g: float = 0.0
    delta_b: float = 0.0
    delta_rgb_mean: float = 0.0
    delta_luminance: float = 0.0
    quality_score: float = 0.0
    
    # Validasyon
    passes_ssim: bool = False
    passes_psnr: bool = False
    passes_color: bool = False
    overall_pass: bool = False
    
    # Dosya yolları
    output_path: Optional[str] = None


@dataclass
class BatchResult:
    """Batch işlem sonucu"""
    total_images: int
    successful: int
    failed: int
    passed_validation: int
    results: List[SingleImageResult] = field(default_factory=list)
    
    # İstatistikler
    mean_ssim: float = 0.0
    std_ssim: float = 0.0
    mean_psnr: float = 0.0
    std_psnr: float = 0.0
    mean_quality_score: float = 0.0
    
    # Rapor yolları
    csv_report_path: Optional[str] = None
    json_report_path: Optional[str] = None


class ScientificBatchComparator:
    """
    Bilimsel görüntü karşılaştırma için batch işleyici.
    """
    
    def __init__(
        self,
        reference_path: str,
        config: Optional[BatchConfig] = None,
        output_dir: Optional[str] = None
    ):
        """
        Args:
            reference_path: Referans görüntü yolu
            config: İşlem konfigürasyonu
            output_dir: Çıktı dizini
        """
        self.config = config or BatchConfig()
        
        # Referans görüntüyü yükle
        self.reference_path = Path(reference_path)
        self.reference = self._load_image(reference_path)
        
        # Çıktı dizinini hazırla
        self.output_dir = Path(output_dir) if output_dir else Path("./output")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        if self.config.save_processed_images:
            (self.output_dir / "processed").mkdir(exist_ok=True)
        (self.output_dir / "reports").mkdir(exist_ok=True)
    
    def _load_image(self, path: str) -> np.ndarray:
        """Görüntüyü RGB formatında yükler"""
        img = cv2.imread(str(path))
        if img is None:
            raise ValueError(f"Görüntü yüklenemedi: {path}")
        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    def process_single(self, source_path: str) -> SingleImageResult:
        """
        Tek görüntüyü işler.
        
        Args:
            source_path: Kaynak görüntü yolu
        
        Returns:
            result: SingleImageResult objesi
        """
        result = SingleImageResult(source_file=Path(source_path).name)
        
        try:
            # Görüntüyü yükle
            source = self._load_image(source_path)
            
            # 1. ROI izolasyonu
            roi_params = {
                'method': ROIMethod(self.config.roi_method),
                'thresh': self.config.roi_thresh,
                'blur_kernel': self.config.roi_blur_kernel,
                'apply_smoothing': True
            }
            mask = isolate_roi(source, **roi_params)
            
            # 2. Registration (hizalama)
            reg_params = RegistrationParams(
                n_keypoints=self.config.reg_n_keypoints,
                require_min_inlier_ratio=self.config.reg_min_inlier_ratio
            )
            registered, reg_result = register_images(
                source, self.reference, mask, reg_params
            )
            
            # Registration bilgilerini kaydet
            result.translation_x = reg_result.translation[0]
            result.translation_y = reg_result.translation[1]
            result.rotation_deg = reg_result.rotation_deg
            result.scale = reg_result.scale
            result.inlier_ratio = reg_result.inlier_ratio
            result.n_matches = reg_result.n_matches
            result.n_inliers = reg_result.n_inliers
            result.registration_success = reg_result.success
            
            if not reg_result.success:
                result.error_message = reg_result.error_message
            
            # 3. Normalizasyon
            norm_params = NormalizationParams(
                use_roi_only=self.config.norm_use_roi_only
            )
            normalized, norm_stats = normalize_to_reference(
                registered, self.reference, mask, norm_params
            )
            
            # Normalizasyon istatistiklerini kaydet
            result.R_mean_source = norm_stats.R_mean_source
            result.R_mean_reference = norm_stats.R_mean_reference
            result.R_mean_matched = norm_stats.R_mean_matched
            result.G_mean_source = norm_stats.G_mean_source
            result.G_mean_reference = norm_stats.G_mean_reference
            result.G_mean_matched = norm_stats.G_mean_matched
            result.B_mean_source = norm_stats.B_mean_source
            result.B_mean_reference = norm_stats.B_mean_reference
            result.B_mean_matched = norm_stats.B_mean_matched
            result.overall_mean_shift = norm_stats.overall_mean_shift
            
            # 4. Metrik hesaplama
            metrics_config = MetricsConfig(
                ssim_threshold=self.config.ssim_threshold,
                psnr_threshold_db=self.config.psnr_threshold_db,
                color_delta_threshold=self.config.color_delta_threshold
            )
            metrics = compute_scientific_metrics(
                source, self.reference, normalized, mask, metrics_config
            )
            
            # Metrikleri kaydet
            result.ssim = metrics.ssim
            result.psnr = metrics.psnr
            result.delta_r = metrics.delta_r
            result.delta_g = metrics.delta_g
            result.delta_b = metrics.delta_b
            result.delta_rgb_mean = metrics.delta_rgb_mean
            result.delta_luminance = metrics.delta_luminance
            result.quality_score = metrics.quality_score
            result.passes_ssim = metrics.passes_ssim_threshold
            result.passes_psnr = metrics.passes_psnr_threshold
            result.passes_color = metrics.passes_color_threshold
            result.overall_pass = metrics.overall_pass
            
            # 5. Çıktı görüntüsünü kaydet
            if self.config.save_processed_images:
                output_filename = f"processed_{Path(source_path).stem}.{self.config.output_format}"
                output_path = self.output_dir / "processed" / output_filename
                
                # BGR'ye çevir ve kaydet
                output_bgr = cv2.cvtColor(normalized, cv2.COLOR_RGB2BGR)
                cv2.imwrite(str(output_path), output_bgr)
                result.output_path = str(output_path)
            
            result.success = True
            
        except Exception as e:
            result.success = False
            result.error_message = str(e)
        
        return result
    
    def run_batch(self, source_dir: str) -> BatchResult:
        """
        Dizin içindeki tüm görüntüleri paralel işler.
        
        Args:
            source_dir: Kaynak görüntülerin bulunduğu dizin
        
        Returns:
            batch_result: BatchResult objesi
        """
        source_path = Path(source_dir)
        
        # Görüntü dosyalarını bul
        image_extensions = ["*.jpg", "*.jpeg", "*.png", "*.bmp", "*.tif", "*.tiff"]
        source_files = []
        for ext in image_extensions:
            source_files.extend(source_path.glob(ext))
        
        if not source_files:
            raise ValueError(f"Dizinde görüntü bulunamadı: {source_dir}")
        
        # Paralel işleme
        n_jobs = self.config.n_jobs
        
        results = Parallel(n_jobs=n_jobs)(
            delayed(self.process_single)(str(f)) for f in tqdm(
                source_files, desc="Görüntüler işleniyor"
            )
        )
        
        # Batch sonucu oluştur
        batch_result = self._aggregate_results(results)
        
        # Raporları oluştur
        batch_result.csv_report_path = self._save_csv_report(batch_result)
        batch_result.json_report_path = self._save_json_report(batch_result)
        
        return batch_result
    
    def _aggregate_results(self, results: List[SingleImageResult]) -> BatchResult:
        """Sonuçları toplulaştırır"""
        successful = sum(1 for r in results if r.success)
        failed = len(results) - successful
        passed = sum(1 for r in results if r.overall_pass)
        
        # İstatistikler (başarılı işlemler için)
        successful_results = [r for r in results if r.success]
        
        if successful_results:
            ssim_values = [r.ssim for r in successful_results]
            psnr_values = [r.psnr for r in successful_results]
            quality_scores = [r.quality_score for r in successful_results]
            
            mean_ssim = float(np.mean(ssim_values))
            std_ssim = float(np.std(ssim_values))
            mean_psnr = float(np.mean(psnr_values))
            std_psnr = float(np.std(psnr_values))
            mean_quality = float(np.mean(quality_scores))
        else:
            mean_ssim = std_ssim = mean_psnr = std_psnr = mean_quality = 0.0
        
        return BatchResult(
            total_images=len(results),
            successful=successful,
            failed=failed,
            passed_validation=passed,
            results=results,
            mean_ssim=mean_ssim,
            std_ssim=std_ssim,
            mean_psnr=mean_psnr,
            std_psnr=std_psnr,
            mean_quality_score=mean_quality
        )
    
    def _save_csv_report(self, batch_result: BatchResult) -> str:
        """CSV raporu oluşturur"""
        # DataFrame'e dönüştür
        data = [asdict(r) for r in batch_result.results]
        df = pd.DataFrame(data)
        
        # Özet satırları ekle
        summary_row = {
            'source_file': '--- ÖZET ---',
            'total_images': batch_result.total_images,
            'successful': batch_result.successful,
            'failed': batch_result.failed,
            'passed_validation': batch_result.passed_validation,
            'mean_ssim': batch_result.mean_ssim,
            'std_ssim': batch_result.std_ssim,
            'mean_psnr': batch_result.mean_psnr,
            'std_psnr': batch_result.std_psnr,
            'mean_quality_score': batch_result.mean_quality_score
        }
        
        csv_path = self.output_dir / "reports" / "batch_results.csv"
        df.to_csv(csv_path, index=False)
        
        return str(csv_path)
    
    def _save_json_report(self, batch_result: BatchResult) -> str:
        """JSON raporu oluşturur"""
        # Dataclass'ları dict'e çevir
        results_dict = [asdict(r) for r in batch_result.results]
        
        report = {
            'summary': {
                'total_images': batch_result.total_images,
                'successful': batch_result.successful,
                'failed': batch_result.failed,
                'passed_validation': batch_result.passed_validation,
                'statistics': {
                    'ssim': {
                        'mean': batch_result.mean_ssim,
                        'std': batch_result.std_ssim
                    },
                    'psnr': {
                        'mean': batch_result.mean_psnr,
                        'std': batch_result.std_psnr
                    },
                    'quality_score': {
                        'mean': batch_result.mean_quality_score
                    }
                }
            },
            'config': asdict(self.config),
            'reference_image': str(self.reference_path),
            'results': results_dict
        }
        
        json_path = self.output_dir / "reports" / "detailed_results.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        return str(json_path)


def process_batch(
    reference_path: str,
    source_dir: str,
    output_dir: str,
    config: Optional[BatchConfig] = None
) -> BatchResult:
    """
    Kolay kullanım için wrapper fonksiyon.
    
    Args:
        reference_path: Referans görüntü yolu
        source_dir: Kaynak görüntüler dizini
        output_dir: Çıktı dizini
        config: İşlem konfigürasyonu
    
    Returns:
        batch_result: BatchResult objesi
    """
    comparator = ScientificBatchComparator(reference_path, config, output_dir)
    return comparator.run_batch(source_dir)
