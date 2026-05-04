"""
Işık & Renk Normalizasyonu Module
Referans görüntü bazlı histogram matching
"""

import numpy as np
from typing import Dict, Any, Optional, List, Tuple
from pydantic import BaseModel
from skimage.exposure import match_histograms


class NormalizationStats(BaseModel):
    """Normalizasyon istatistikleri"""
    # Her kanal için istatistikler
    R_mean_source: float
    R_mean_reference: float
    R_mean_matched: float
    R_std_source: float
    R_std_reference: float
    
    G_mean_source: float
    G_mean_reference: float
    G_mean_matched: float
    G_std_source: float
    G_std_reference: float
    
    B_mean_source: float
    B_mean_reference: float
    B_mean_matched: float
    B_std_source: float
    B_std_reference: float
    
    # Genel istatistikler
    overall_mean_shift: float
    channels: List[int] = [0, 1, 2]


class NormalizationParams(BaseModel):
    """Normalizasyon parametreleri"""
    channels: List[int] = [0, 1, 2]  # R, G, B
    use_roi_only: bool = True
    clip_values: bool = True
    min_value: int = 0
    max_value: int = 255


def normalize_to_reference(
    image: np.ndarray,
    reference: np.ndarray,
    mask: Optional[np.ndarray] = None,
    params: Optional[NormalizationParams] = None
) -> Tuple[np.ndarray, NormalizationStats]:
    """
    Görüntüyü referans görüntüye göre normalizer (histogram matching).
    
    Args:
        image: Kaynak görüntü (RGB, uint8)
        reference: Referans görüntü (RGB, uint8)
        mask: Opsiyonel ROI maskesi (sadece maske bölgesi kullanılır)
        params: Normalizasyon parametreleri
    
    Returns:
        matched: Normalize edilmiş görüntü
        stats: Normalizasyon istatistikleri
    """
    if params is None:
        params = NormalizationParams()
    
    channels = params.channels
    
    # Maske bölgesinde istatistik hesapla
    if mask is not None and params.use_roi_only:
        ref_channels = [reference[mask > 0, c] for c in channels]
        img_channels = [image[mask > 0, c] for c in channels]
    else:
        ref_channels = [reference[..., c].ravel() for c in channels]
        img_channels = [image[..., c].ravel() for c in channels]
    
    # Histogram matching (scikit-image)
    matched = match_histograms(image, reference, channel_axis=-1)
    
    # Değerleri kırp (0-255 aralığı)
    if params.clip_values:
        matched = np.clip(matched, params.min_value, params.max_value)
    
    matched = matched.astype(np.uint8)
    
    # İstatistikleri hesapla
    stats = _compute_normalization_stats(
        img_channels, ref_channels, matched, mask, channels
    )
    
    return matched, stats


def _compute_normalization_stats(
    img_channels: List[np.ndarray],
    ref_channels: List[np.ndarray],
    matched: np.ndarray,
    mask: Optional[np.ndarray],
    channels: List[int]
) -> NormalizationStats:
    """
    Normalizasyon öncesi ve sonrası istatistikleri hesaplar.
    
    Args:
        img_channels: Kaynak görüntü kanalları
        ref_channels: Referans görüntü kanalları
        matched: Eşleştirilmiş görüntü
        mask: Opsiyonel ROI maskesi
        channels: Kanal indeksleri
    
    Returns:
        stats: NormalizationStats objesi
    """
    channel_names = ['R', 'G', 'B']
    stats_dict = {}
    
    total_shift = 0.0
    
    for i, (c, name) in enumerate(zip(channels, channel_names)):
        # Kaynak istatistikleri
        source_mean = float(np.mean(img_channels[i]))
        source_std = float(np.std(img_channels[i]))
        
        # Referans istatistikleri
        reference_mean = float(np.mean(ref_channels[i]))
        reference_std = float(np.std(ref_channels[i]))
        
        # Eşleştirilmiş istatistikleri
        if mask is not None:
            matched_channel = matched[mask > 0, c]
        else:
            matched_channel = matched[..., c]
        
        matched_mean = float(np.mean(matched_channel))
        
        # Ortalama kayma
        shift = abs(matched_mean - reference_mean)
        total_shift += shift
        
        stats_dict[f'{name}_mean_source'] = source_mean
        stats_dict[f'{name}_mean_reference'] = reference_mean
        stats_dict[f'{name}_mean_matched'] = matched_mean
        stats_dict[f'{name}_std_source'] = source_std
        stats_dict[f'{name}_std_reference'] = reference_std
    
    stats_dict['overall_mean_shift'] = total_shift / len(channels)
    stats_dict['channels'] = channels
    
    return NormalizationStats(**stats_dict)


def validate_normalization_quality(
    stats: NormalizationStats,
    max_allowed_shift: float = 15.0
) -> Tuple[bool, str]:
    """
    Normalizasyon kalitesini doğrular.
    
    Args:
        stats: Normalizasyon istatistikleri
        max_allowed_shift: Maksimum kabul edilebilir ortalama kayma
    
    Returns:
        success: Başarılı mı?
        message: Açıklama mesajı
    """
    if stats.overall_mean_shift <= max_allowed_shift:
        return True, f"Normalizasyon başarılı (kayma: {stats.overall_mean_shift:.2f})"
    else:
        return False, f"Aşırı renk kayması ({stats.overall_mean_shift:.2f} > {max_allowed_shift})"


def compute_color_difference(
    image1: np.ndarray,
    image2: np.ndarray,
    mask: Optional[np.ndarray] = None
) -> Dict[str, float]:
    """
    İki görüntü arasındaki renk farkını hesaplar.
    
    Args:
        image1: İlk görüntü (RGB)
        image2: İkinci görüntü (RGB)
        mask: Opsiyonel ROI maskesi
    
    Returns:
        delta_rgb: Kanal bazlı ortalama mutlak fark
        delta_luminance: Luminans farkı
    """
    if mask is not None:
        img1_roi = image1[mask > 0]
        img2_roi = image2[mask > 0]
    else:
        img1_roi = image1.reshape(-1, 3)
        img2_roi = image2.reshape(-1, 3)
    
    # Kanal bazlı fark
    delta_per_channel = np.mean(np.abs(img1_roi.astype(float) - img2_roi.astype(float)), axis=0)
    delta_rgb = {
        'R': float(delta_per_channel[0]),
        'G': float(delta_per_channel[1]),
        'B': float(delta_per_channel[2])
    }
    
    # Luminans farkı (CIE L* benzeri)
    def rgb_to_lum(rgb):
        return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    
    lum1 = rgb_to_lum(image1)
    lum2 = rgb_to_lum(image2)
    
    if mask is not None:
        delta_luminance = float(np.mean(np.abs(lum1[mask > 0] - lum2[mask > 0])))
    else:
        delta_luminance = float(np.mean(np.abs(lum1 - lum2)))
    
    return {
        'delta_rgb': delta_rgb,
        'delta_luminance': delta_luminance,
        'total_delta': float(np.mean(list(delta_rgb.values())))
    }
