"""
Görüntü Kaydı (Registration) Module
RANSAC ile robust dönüşüm tahmini ve görüntü hizalama
"""

import numpy as np
from typing import Tuple, Dict, Any, Optional
from pydantic import BaseModel
from skimage.feature import ORB, match_descriptors
from skimage.measure import ransac
from skimage.transform import AffineTransform, warp


class RegistrationResult(BaseModel):
    """Registration sonuç verileri"""
    class Config:
        arbitrary_types_allowed = True
    
    registered_image: np.ndarray
    translation: Tuple[float, float]
    rotation_deg: float
    scale: float
    inlier_ratio: float
    n_matches: int
    n_inliers: int
    success: bool
    error_message: Optional[str] = None


class RegistrationParams(BaseModel):
    """Registration parametreleri"""
    n_keypoints: int = 2000
    min_samples: int = 3
    residual_threshold: float = 2.0
    max_iterations: int = 1000
    require_min_inlier_ratio: float = 0.7


def register_images(
    source: np.ndarray,
    reference: np.ndarray,
    mask: Optional[np.ndarray] = None,
    params: Optional[RegistrationParams] = None
) -> Tuple[np.ndarray, RegistrationResult]:
    """
    İki görüntüyü hizalar (registration).
    
    Args:
        source: Hizalanacak kaynak görüntü (RGB)
        reference: Referans görüntü (RGB)
        mask: Opsiyonel ROI maskesi
        params: Registration parametreleri
    
    Returns:
        registered: Hizalanmış kaynak görüntü
        result: Registration metrikleri ve parametreleri
    """
    if params is None:
        params = RegistrationParams()
    
    try:
        # ORB öznitelik çıkarımı (hızlı ve batch için uygun)
        orb = ORB(n_keypoints=params.n_keypoints)
        
        # Görüntüleri gri tonlamaya çevir
        if len(source.shape) == 3:
            source_gray = np.mean(source, axis=2)
        else:
            source_gray = source
            
        if len(reference.shape) == 3:
            reference_gray = np.mean(reference, axis=2)
        else:
            reference_gray = reference
        
        # Öznitelik çıkarımı
        orb.extract(source_gray)
        descriptors_source = orb.descriptors
        keypoints_source = orb.keypoints
        
        orb.extract(reference_gray)
        descriptors_ref = orb.descriptors
        keypoints_ref = orb.keypoints
        
        if descriptors_source is None or descriptors_ref is None:
            raise ValueError("Yetersiz öznitelik bulundu")
        
        # Eşleştirme
        matches = match_descriptors(descriptors_source, descriptors_ref, cross_check=True)
        
        if len(matches) < params.min_samples:
            raise ValueError(f"Yetersiz eşleşme: {len(matches)} < {params.min_samples}")
        
        # RANSAC ile robust dönüşüm tahmini
        model, inliers = ransac(
            matches, 
            AffineTransform, 
            min_samples=params.min_samples, 
            residual_threshold=params.residual_threshold,
            max_trials=params.max_iterations
        )
        
        if model is None:
            raise ValueError("RANSAC dönüşüm modeli oluşturulamadı")
        
        # Dönüşüm parametrelerini hesapla
        transform_params = _extract_transform_params(model, matches, inliers)
        
        # Warp işlemi
        registered = warp(
            source, 
            model, 
            output_shape=reference.shape[:2], 
            preserve_range=True,
            order=1  # Bilinear interpolasyon
        )
        
        # Başarı kontrolü
        success = transform_params['inlier_ratio'] >= params.require_min_inlier_ratio
        
        result = RegistrationResult(
            registered_image=registered.astype(np.uint8),
            translation=tuple(transform_params['translation']),
            rotation_deg=transform_params['rotation'],
            scale=transform_params['scale'],
            inlier_ratio=transform_params['inlier_ratio'],
            n_matches=len(matches),
            n_inliers=int(np.sum(inliers)),
            success=success,
            error_message=None if success else f"Düşük inlier oranı: {transform_params['inlier_ratio']:.2f}"
        )
        
        return result.registered_image, result
        
    except Exception as e:
        # Hata durumunda orijinal görüntüyü döndür
        result = RegistrationResult(
            registered_image=source,
            translation=(0.0, 0.0),
            rotation_deg=0.0,
            scale=1.0,
            inlier_ratio=0.0,
            n_matches=0,
            n_inliers=0,
            success=False,
            error_message=str(e)
        )
        return source, result


def _extract_transform_params(
    model: AffineTransform, 
    matches: np.ndarray, 
    inliers: np.ndarray
) -> Dict[str, Any]:
    """
    Dönüşüm modelinden parametreleri çıkarır.
    
    Args:
        model: Affine dönüşüm modeli
        matches: Eşleşmeler
        inliers: Inlier maskesi
    
    Returns:
        Parametre sözlüğü
    """
    # Translation
    translation = model.translation
    
    # Rotation (radyan -> derece)
    rotation_rad = np.arctan2(model.params[1, 0], model.params[0, 0])
    rotation_deg = rotation_rad * 180 / np.pi
    
    # Scale
    scale = np.sqrt(model.params[0, 0]**2 + model.params[1, 0]**2)
    
    # Inlier ratio
    inlier_ratio = np.sum(inliers) / len(matches) if len(matches) > 0 else 0.0
    
    return {
        'translation': translation,
        'rotation': rotation_deg,
        'scale': scale,
        'inlier_ratio': inlier_ratio
    }


def compute_registration_quality(
    source: np.ndarray,
    reference: np.ndarray,
    registered: np.ndarray,
    mask: Optional[np.ndarray] = None
) -> Dict[str, float]:
    """
    Registration kalitesini değerlendirir.
    
    Args:
        source: Orijinal kaynak görüntü
        reference: Referans görüntü
        registered: Hizalanmış görüntü
        mask: Opsiyonel ROI maskesi
    
    Returns:
        Kalite metrikleri
    """
    from skimage.metrics import structural_similarity as ssim
    
    metrics = {}
    
    # SSIM iyileştirmesi
    if mask is not None:
        ssim_before = ssim(source, reference, data_range=255, channel_axis=-1)
        ssim_after = ssim(registered, reference, data_range=255, channel_axis=-1)
    else:
        ssim_before = ssim(source, reference, data_range=255, channel_axis=-1)
        ssim_after = ssim(registered, reference, data_range=255, channel_axis=-1)
    
    metrics['ssim_improvement'] = ssim_after - ssim_before
    metrics['ssim_after'] = ssim_after
    metrics['registration_effective'] = ssim_after > ssim_before
    
    return metrics
