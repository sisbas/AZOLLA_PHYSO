"""
Bilimsel Metrikler Module
SSIM, PSNR, ΔRGB ve diğer validasyon metrikleri
"""

import numpy as np
from typing import Dict, Any, Optional
from pydantic import BaseModel
from skimage.metrics import structural_similarity as ssim, peak_signal_noise_ratio as psnr


class ScientificMetrics(BaseModel):
    """Bilimsel karşılaştırma metrikleri"""
    # Yapısal benzerlik
    ssim: float
    ssim_per_channel: Optional[Dict[str, float]] = None
    
    # Sinyal-gürültü oranı
    psnr: float
    
    # Renk farkları
    delta_r: float
    delta_g: float
    delta_b: float
    delta_rgb_mean: float
    
    # Luminans farkı
    delta_luminance: float
    
    # Genel kalite skoru (0-1 arası)
    quality_score: float
    
    # Validasyon bayrakları
    passes_ssim_threshold: bool
    passes_psnr_threshold: bool
    passes_color_threshold: bool
    overall_pass: bool


class MetricsConfig(BaseModel):
    """Metrik konfigürasyonu"""
    ssim_threshold: float = 0.85
    psnr_threshold_db: float = 25.0
    color_delta_threshold: float = 15.0
    compute_per_channel: bool = True


def compute_scientific_metrics(
    source: np.ndarray,
    reference: np.ndarray,
    matched: np.ndarray,
    mask: Optional[np.ndarray] = None,
    config: Optional[MetricsConfig] = None
) -> ScientificMetrics:
    """
    Bilimsel görüntü karşılaştırma metriklerini hesaplar.
    
    Args:
        source: Orijinal kaynak görüntü
        reference: Referans görüntü
        matched: İşlenmiş/eşleştirilmiş görüntü
        mask: Opsiyonel ROI maskesi
        config: Metrik konfigürasyonu
    
    Returns:
        metrics: ScientificMetrics objesi
    """
    if config is None:
        config = MetricsConfig()
    
    # SSIM hesaplama
    if mask is not None:
        # Maske bölgesinde hesapla
        ssim_val, ssim_per_channel = _compute_ssim_masked(
            matched, reference, mask, config.compute_per_channel
        )
    else:
        ssim_val, ssim_per_channel = _compute_ssim_full(
            matched, reference, config.compute_per_channel
        )
    
    # PSNR hesaplama
    psnr_val = psnr(reference, matched, data_range=255)
    
    # Renk farkları (ΔRGB)
    delta_rgb = _compute_delta_rgb(matched, reference, mask)
    
    # Luminans farkı
    delta_lum = _compute_delta_luminance(matched, reference, mask)
    
    # Kalite skoru (0-1 arası)
    quality_score = _compute_quality_score(ssim_val, psnr_val, delta_rgb['mean'], config)
    
    # Validasyon bayrakları
    passes_ssim = ssim_val >= config.ssim_threshold
    passes_psnr = psnr_val >= config.psnr_threshold_db
    passes_color = delta_rgb['mean'] <= config.color_delta_threshold
    overall_pass = passes_ssim and passes_psnr and passes_color
    
    return ScientificMetrics(
        ssim=float(ssim_val),
        ssim_per_channel=ssim_per_channel,
        psnr=float(psnr_val),
        delta_r=float(delta_rgb['R']),
        delta_g=float(delta_rgb['G']),
        delta_b=float(delta_rgb['B']),
        delta_rgb_mean=float(delta_rgb['mean']),
        delta_luminance=float(delta_lum),
        quality_score=float(quality_score),
        passes_ssim_threshold=passes_ssim,
        passes_psnr_threshold=passes_psnr,
        passes_color_threshold=passes_color,
        overall_pass=overall_pass
    )


def _compute_ssim_full(
    image1: np.ndarray,
    image2: np.ndarray,
    compute_per_channel: bool
) -> tuple:
    """Tüm görüntüde SSIM hesaplar"""
    ssim_val = ssim(
        image1, image2,
        data_range=255,
        channel_axis=-1,
        gaussian_weights=True,
        use_sample_covariance=False
    )
    
    if compute_per_channel:
        ssim_per_channel = {}
        for i, name in enumerate(['R', 'G', 'B']):
            ch_ssim = ssim(
                image1[..., i], image2[..., i],
                data_range=255,
                gaussian_weights=True,
                use_sample_covariance=False
            )
            ssim_per_channel[name] = float(ch_ssim)
    else:
        ssim_per_channel = None
    
    return ssim_val, ssim_per_channel


def _compute_ssim_masked(
    image1: np.ndarray,
    image2: np.ndarray,
    mask: np.ndarray,
    compute_per_channel: bool
) -> tuple:
    """Maske bölgesinde SSIM hesaplar"""
    # Maskeyi 3 kanalına genişlet
    if len(mask.shape) == 2:
        mask_3ch = np.stack([mask] * 3, axis=-1)
    else:
        mask_3ch = mask
    
    # Sadece maske bölgesini al
    masked_img1 = image1[mask_3ch > 0].reshape(-1, 3)
    masked_img2 = image2[mask_3ch > 0].reshape(-1, 3)
    
    # Yeniden şekillendirerek SSIM hesapla
    h = w = int(np.sqrt(len(masked_img1)))
    if h * w < len(masked_img1):
        h += 1
    
    try:
        img1_reshaped = masked_img1[:h*w].reshape(h, w, 3)
        img2_reshaped = masked_img2[:h*w].reshape(h, w, 3)
        
        ssim_val = ssim(
            img1_reshaped, img2_reshaped,
            data_range=255,
            channel_axis=-1,
            gaussian_weights=True,
            use_sample_covariance=False
        )
        
        if compute_per_channel:
            ssim_per_channel = {}
            for i, name in enumerate(['R', 'G', 'B']):
                ch_ssim = ssim(
                    img1_reshaped[..., i], img2_reshaped[..., i],
                    data_range=255,
                    gaussian_weights=True,
                    use_sample_covariance=False
                )
                ssim_per_channel[name] = float(ch_ssim)
        else:
            ssim_per_channel = None
            
    except Exception:
        # Hata durumunda basit korelasyon kullan
        ssim_val = np.corrcoef(masked_img1.flatten(), masked_img2.flatten())[0, 1]
        ssim_per_channel = None
    
    return ssim_val, ssim_per_channel


def _compute_delta_rgb(
    image1: np.ndarray,
    image2: np.ndarray,
    mask: Optional[np.ndarray]
) -> Dict[str, float]:
    """Kanal bazlı ortalama mutlak fark"""
    if mask is not None:
        img1_roi = image1[mask > 0].reshape(-1, 3)
        img2_roi = image2[mask > 0].reshape(-1, 3)
    else:
        img1_roi = image1.reshape(-1, 3)
        img2_roi = image2.reshape(-1, 3)
    
    delta_per_channel = np.mean(
        np.abs(img1_roi.astype(float) - img2_roi.astype(float)),
        axis=0
    )
    
    return {
        'R': float(delta_per_channel[0]),
        'G': float(delta_per_channel[1]),
        'B': float(delta_per_channel[2]),
        'mean': float(np.mean(delta_per_channel))
    }


def _compute_delta_luminance(
    image1: np.ndarray,
    image2: np.ndarray,
    mask: Optional[np.ndarray]
) -> float:
    """Luminans farkı (CIE L* benzeri)"""
    def rgb_to_lum(rgb):
        return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    
    lum1 = rgb_to_lum(image1)
    lum2 = rgb_to_lum(image2)
    
    if mask is not None:
        delta_lum = float(np.mean(np.abs(lum1[mask > 0] - lum2[mask > 0])))
    else:
        delta_lum = float(np.mean(np.abs(lum1 - lum2)))
    
    return delta_lum


def _compute_quality_score(
    ssim_val: float,
    psnr_val: float,
    delta_rgb_mean: float,
    config: MetricsConfig
) -> float:
    """
    Genel kalite skoru hesaplar (0-1 arası).
    
    Ağırlıklı ortalama:
    - SSIM: %40
    - PSNR (normalize): %30
    - Renk farkı (ters): %30
    """
    # SSIM zaten 0-1 arası
    ssim_score = ssim_val
    
    # PSNR'i 0-1 aralığına normalize et (0-40 dB skalasında)
    psnr_normalized = min(psnr_val / 40.0, 1.0)
    
    # Renk farkını ters çevir (küçük fark = yüksek skor)
    color_score = max(0, 1.0 - (delta_rgb_mean / config.color_delta_threshold))
    
    # Ağırlıklı ortalama
    quality_score = (
        0.4 * ssim_score +
        0.3 * psnr_normalized +
        0.3 * color_score
    )
    
    return min(max(quality_score, 0.0), 1.0)


def create_metrics_report(metrics: ScientificMetrics) -> str:
    """
    Metriklerden insan tarafından okunabilir rapor oluşturur.
    
    Args:
        metrics: ScientificMetrics objesi
    
    Returns:
        report: Formatlanmış rapor metni
    """
    status = "✅ BAŞARILI" if metrics.overall_pass else "❌ BAŞARISIZ"
    
    report = f"""
=== BİLİMSEL GÖRÜNTÜ KARŞILAŞTIRMA RAPORU ===
Durum: {status}

📊 YAPISAL BENZERLİK:
  SSIM: {metrics.ssim:.4f} (eşik: 0.85)
  {'✓' if metrics.passes_ssim_threshold else '✗'} SSIM eşiği {'geçildi' if metrics.passes_ssim_threshold else 'geçilemedi'}

📡 SİNYAL KALİTESİ:
  PSNR: {metrics.psnr:.2f} dB (eşik: 25.0)
  {'✓' if metrics.psnr_threshold else '✗'} PSNR eşiği {'geçildi' if metrics.psnr_threshold else 'geçilemedi'}

🎨 RENK DOĞRULUĞU:
  ΔR: {metrics.delta_r:.2f}
  ΔG: {metrics.delta_g:.2f}
  ΔB: {metrics.delta_b:.2f}
  Ortalama ΔRGB: {metrics.delta_rgb_mean:.2f} (eşik: 15.0)
  {'✓' if metrics.passes_color_threshold else '✗'} Renk eşiği {'geçildi' if metrics.passes_color_threshold else 'geçilemedi'}

💡 LUMİNANS FARKI:
  ΔLuminance: {metrics.delta_luminance:.2f}

🏆 GENEL KALİTE SKORU:
  {metrics.quality_score:.3f} / 1.000

"""
    
    if metrics.ssim_per_channel:
        report += "\n📈 KANAL BAZLI SSIM:\n"
        for channel, val in metrics.ssim_per_channel.items():
            report += f"  {channel}: {val:.4f}\n"
    
    return report
