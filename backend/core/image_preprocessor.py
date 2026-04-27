# filepath: backend/core/image_preprocessor.py
"""
FAZ 1 - MODÜL 1: Görüntü Yükleme ve Ön İşleme

Bu modül, Azolla bitkisi fotoğraflarını analiz için standart hale getirir.
- RGB görüntü yükleme ve validasyon
- Yeniden boyutlandırma
- Renk kanalı normalizasyonu
- Gürültü azaltma (Gaussian Blur, Median Blur)
- Kontrast iyileştirme (CLAHE, Histogram Equalization)
- Metadata çıkarma

Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
"""

import cv2
import numpy as np
import logging
from typing import Dict, Any, Tuple, Optional, Union, List
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
from PIL import Image
from PIL.ExifTags import TAGS

from .errors import format_error, ProcessingContext, PipelineStepError

logger = logging.getLogger(__name__)


@dataclass
class PreprocessingMetadata:
    """Ön işleme sonrası metadata bilgileri."""
    original_shape: Tuple[int, int, int]
    processed_shape: Tuple[int, int, int]
    original_dtype: str
    processed_dtype: str
    resize_applied: bool
    denoise_applied: bool
    contrast_enhanced: bool
    denoise_method: str
    contrast_method: str
    color_space: str
    timestamp: str
    exif_info: Dict[str, Any]
    warnings: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]
    
    def to_dict(self) -> dict:
        return {
            "original_shape": self.original_shape,
            "processed_shape": self.processed_shape,
            "original_dtype": self.original_dtype,
            "processed_dtype": self.processed_dtype,
            "resize_applied": self.resize_applied,
            "denoise_applied": self.denoise_applied,
            "contrast_enhanced": self.contrast_enhanced,
            "denoise_method": self.denoise_method,
            "contrast_method": self.contrast_method,
            "color_space": self.color_space,
            "timestamp": self.timestamp,
            "exif_info": self.exif_info,
            "warnings": self.warnings,
            "errors": self.errors
        }


@dataclass
class PreprocessingResult:
    """Ön işleme sonucu."""
    image: np.ndarray
    metadata: PreprocessingMetadata
    success: bool


class ImagePreprocessor:
    """
    FAZ 1 - Görüntü Yükleme ve Ön İşleme Modülü
    
    Azolla bitkisi fotoğraflarını analiz için standart hale getirir.
    Desteklenen özellikler:
    - Çoklu giriş formatı (dosya yolu, bytes, numpy array, PIL Image)
    - Otomatik RGB dönüşümü
    - Opsiyonel yeniden boyutlandırma
    - Gaussian/Median blur ile gürültü azaltma
    - CLAHE/Histogram Equalization ile kontrast iyileştirme
    - EXIF metadata çıkarma
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Args:
            config: Konfigürasyon parametreleri
                - default_width: Varsayılan yeniden boyutlandırma genişliği
                - gaussian_sigma: Gaussian blur sigma değeri
                - median_kernel: Median blur kernel boyutu
                - clahe_clip_limit: CLAHE clip limit
                - clahe_grid_size: CLAHE grid boyutu
                - normalize_channels: Renk kanallarını normalize et
        """
        self.cfg = config.get('preprocessing', {}) if config else {}
        
        # Varsayılan değerler
        self.default_width = self.cfg.get('default_width', None)
        self.gaussian_sigma = self.cfg.get('gaussian_sigma', 1.5)
        self.median_kernel = self.cfg.get('median_kernel', 3)
        self.clahe_clip_limit = self.cfg.get('clahe_clip_limit', 2.0)
        self.clahe_grid_size = tuple(self.cfg.get('clahe_grid_size', [8, 8]))
        self.normalize_channels = self.cfg.get('normalize_channels', True)
        
        # Denoise method preference
        self.preferred_denoise = self.cfg.get('preferred_denoise', 'gaussian')
        
    def load_image(self, image_input: Union[str, bytes, np.ndarray, Image.Image]) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Görüntüyü çeşitli kaynaklardan yükler ve RGB formatına dönüştürür.
        
        Args:
            image_input: Görüntü kaynağı (dosya yolu, bytes, numpy array, PIL Image)
            
        Returns:
            Tuple[np.ndarray, Dict]: RGB görüntü ve EXIF/metadata bilgisi
            
        Raises:
            ValueError: Geçersiz giriş tipi veya bozuk görüntü
        """
        exif_info = {}
        
        try:
            if isinstance(image_input, str):
                # Dosya yolundan yükle
                path = Path(image_input)
                if not path.exists():
                    raise FileNotFoundError(f"Görüntü dosyası bulunamadı: {image_input}")
                
                # OpenCV ile yükle (BGR formatında)
                img_bgr = cv2.imread(str(path))
                if img_bgr is None:
                    raise ValueError(f"Görüntü okunamadı: {image_input}")
                
                # BGR -> RGB
                img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                
                # EXIF bilgilerini çıkar
                exif_info = self._extract_exif(path)
                
            elif isinstance(image_input, bytes):
                # Bytes'tan yükle
                nparr = np.frombuffer(image_input, np.uint8)
                img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if img_bgr is None:
                    raise ValueError("Bytes verisinden görüntü okunamadı")
                
                img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                
            elif isinstance(image_input, np.ndarray):
                # Numpy array doğrudan kullan
                img_rgb = image_input.copy()
                
                # Eğer 2 boyutlu ise (grayscale), RGB'ye dönüştür
                if len(img_rgb.shape) == 2:
                    img_rgb = cv2.cvtColor(img_rgb, cv2.COLOR_GRAY2RGB)
                # Eğer 4 kanallı ise (RGBA), RGB'ye dönüştür
                elif img_rgb.shape[2] == 4:
                    img_rgb = cv2.cvtColor(img_rgb, cv2.COLOR_RGBA2RGB)
                # Eğer BGR formatındaysa (OpenCV varsayılanı)
                elif img_rgb.shape[2] == 3 and img_rgb.dtype == np.uint8:
                    # Basit bir kontrol: eğer ilk kanal genellikle en yüksek değerlere sahipse BGR olabilir
                    # Güvenli olması için kullanıcıya bırakıyoruz, direkt RGB kabul ediyoruz
                    pass
                    
            elif isinstance(image_input, Image.Image):
                # PIL Image'dan yükle
                pil_img = image_input
                
                # RGBA ise RGB'ye dönüştür
                if pil_img.mode == 'RGBA':
                    pil_img = pil_img.convert('RGB')
                elif pil_img.mode != 'RGB':
                    pil_img = pil_img.convert('RGB')
                
                img_rgb = np.array(pil_img)
                
                # EXIF bilgilerini çıkar
                try:
                    exif_data = pil_img._getexif()
                    if exif_data:
                        for tag_id, value in exif_data.items():
                            tag = TAGS.get(tag_id, tag_id)
                            exif_info[tag] = value
                except Exception:
                    pass  # EXIF yoksa devam et
                    
            else:
                raise TypeError(f"Desteklenmeyen giriş tipi: {type(image_input)}")
            
            # Validasyon
            if img_rgb is None or img_rgb.size == 0:
                raise ValueError("Boş veya geçersiz görüntü")
            
            if len(img_rgb.shape) < 3:
                raise ValueError(f"Geçersiz görüntü boyutu: {img_rgb.shape}")
            
            return img_rgb, exif_info
            
        except Exception as e:
            logger.error(f"Görüntü yükleme hatası: {str(e)}")
            raise
    
    def _extract_exif(self, path: Path) -> Dict[str, Any]:
        """EXIF metadata bilgilerini çıkarır."""
        exif_info = {}
        try:
            with Image.open(path) as img:
                exif_data = img._getexif()
                if exif_data:
                    for tag_id, value in exif_data.items():
                        tag = TAGS.get(tag_id, tag_id)
                        # Tarih formatını düzenle
                        if tag == 'DateTimeOriginal' and isinstance(value, str):
                            try:
                                dt = datetime.strptime(value, '%Y:%m:%d %H:%M:%S')
                                value = dt.strftime('%Y-%m-%d %H:%M:%S')
                            except Exception:
                                pass
                        exif_info[tag] = value
        except Exception as e:
            logger.warning(f"EXIF okuma hatası: {str(e)}")
        
        return exif_info
    
    def resize_image(self, image: np.ndarray, width: Optional[int] = None, 
                     height: Optional[int] = None, 
                     maintain_aspect_ratio: bool = True) -> Tuple[np.ndarray, bool]:
        """
        Görüntüyü yeniden boyutlandırır.
        
        Args:
            image: Giriş görüntüsü
            width: Yeni genişlik (None ise aspect ratio korunur)
            height: Yeni yükseklik (None ise aspect ratio korunur)
            maintain_aspect_ratio: En-boy oranını koru
            
        Returns:
            Tuple[np.ndarray, bool]: Yeniden boyutlandırılmış görüntü, işlem uygulandı mı
        """
        if width is None and height is None:
            return image, False
        
        h, w = image.shape[:2]
        
        if maintain_aspect_ratio:
            if width is not None:
                scale = width / w
                new_w = width
                new_h = int(h * scale)
            else:
                scale = height / h
                new_h = height
                new_w = int(w * scale)
        else:
            new_w = width if width else w
            new_h = height if height else h
        
        # Interpolation yöntemi seçimi
        if new_w < w and new_h < h:
            interpolation = cv2.INTER_AREA  # Küçültme için optimal
        else:
            interpolation = cv2.INTER_LINEAR  # Büyütme için
        
        resized = cv2.resize(image, (new_w, new_h), interpolation=interpolation)
        
        return resized, True
    
    def normalize_color_channels(self, image: np.ndarray) -> np.ndarray:
        """
        Renk kanallarını normalize eder (0-1 aralığına).
        
        Args:
            image: uint8 formatında RGB görüntü
            
        Returns:
            np.ndarray: float32 formatında normalize edilmiş görüntü
        """
        if image.dtype == np.float32 or image.dtype == np.float64:
            # Zaten float formatında, 0-1 arasına ölçekle
            if image.max() > 1.0:
                return image.astype(np.float32) / 255.0
            return image.astype(np.float32)
        
        # uint8 -> float32, 0-1 aralığı
        return image.astype(np.float32) / 255.0
    
    def apply_denoise(self, image: np.ndarray, method: str = 'gaussian',
                      sigma: Optional[float] = None,
                      kernel_size: Optional[int] = None) -> np.ndarray:
        """
        Gürültü azaltma uygular.
        
        Args:
            image: Giriş görüntüsü (float32 veya uint8)
            method: 'gaussian', 'median', 'bilateral', 'none'
            sigma: Gaussian blur sigma değeri
            kernel_size: Blur kernel boyutu
            
        Returns:
            np.ndarray: Gürültü azaltılmış görüntü
        """
        if method == 'none':
            return image
        
        # uint8'e dönüştür eğer gerekliyse (OpenCV fonksiyonları için)
        was_float = image.dtype == np.float32 or image.dtype == np.float64
        if was_float:
            img_uint8 = (np.clip(image, 0, 1) * 255).astype(np.uint8)
        else:
            img_uint8 = image.copy()
        
        try:
            if method == 'gaussian':
                ksize = kernel_size or 0  # 0 ise sigma'dan otomatik hesaplanır
                sigma_val = sigma or self.gaussian_sigma
                denoised = cv2.GaussianBlur(img_uint8, (ksize, ksize), sigmaX=sigma_val)
                
            elif method == 'median':
                ksize = kernel_size or self.median_kernel
                # Kernel boyutu tek sayı olmalı
                if ksize % 2 == 0:
                    ksize += 1
                denoised = cv2.medianBlur(img_uint8, ksize)
                
            elif method == 'bilateral':
                d = kernel_size or 9
                sigma_color = sigma or 75
                sigma_space = sigma or 75
                denoised = cv2.bilateralFilter(img_uint8, d, sigma_color, sigma_space)
                
            else:
                logger.warning(f"Bilinmeyen denoise yöntemi: {method}, atlanıyor")
                return image
            
            # Orijinal dtype'a geri dönüştür
            if was_float:
                return denoised.astype(np.float32) / 255.0
            return denoised
            
        except Exception as e:
            logger.error(f"Denoise hatası: {str(e)}")
            return image
    
    def enhance_contrast(self, image: np.ndarray, method: str = 'clahe',
                         clip_limit: Optional[float] = None,
                         grid_size: Optional[Tuple[int, int]] = None,
                         apply_to_channel: str = 'L') -> np.ndarray:
        """
        Kontrast iyileştirme uygular.
        
        Args:
            image: Giriş görüntüsü
            method: 'clahe', 'histogram_eq', 'gamma', 'none'
            clip_limit: CLAHE clip limit
            grid_size: CLAHE grid boyutu
            apply_to_channel: Hangi kanala uygulanacak ('L' için Lab L kanalı, 'V' için HSV V kanalı, 'all' için tüm kanallar)
            
        Returns:
            np.ndarray: Kontrast iyileştirilmiş görüntü
        """
        if method == 'none':
            return image
        
        # uint8 formatına dönüştür
        was_float = image.dtype == np.float32 or image.dtype == np.float64
        if was_float:
            img_uint8 = (np.clip(image, 0, 1) * 255).astype(np.uint8)
        else:
            img_uint8 = image.copy()
        
        try:
            if method == 'clahe':
                clip = clip_limit or self.clahe_clip_limit
                grid = grid_size or self.clahe_grid_size
                clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=grid)
                
                if apply_to_channel == 'L':
                    # Lab renk uzayında L kanalına uygula
                    lab = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2LAB)
                    l, a, b = cv2.split(lab)
                    l_enhanced = clahe.apply(l)
                    lab_enhanced = cv2.merge([l_enhanced, a, b])
                    enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2RGB)
                    
                elif apply_to_channel == 'V':
                    # HSV renk uzayında V kanalına uygula
                    hsv = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2HSV)
                    h, s, v = cv2.split(hsv)
                    v_enhanced = clahe.apply(v)
                    hsv_enhanced = cv2.merge([h, s, v_enhanced])
                    enhanced = cv2.cvtColor(hsv_enhanced, cv2.COLOR_HSV2RGB)
                    
                elif apply_to_channel == 'all':
                    # Her kanala ayrı ayrı uygula (daha agresif)
                    r, g, b = cv2.split(img_uint8)
                    r_enhanced = clahe.apply(r)
                    g_enhanced = clahe.apply(g)
                    b_enhanced = clahe.apply(b)
                    enhanced = cv2.merge([r_enhanced, g_enhanced, b_enhanced])
                else:
                    enhanced = img_uint8
                    
            elif method == 'histogram_eq':
                if apply_to_channel == 'L':
                    lab = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2LAB)
                    l, a, b = cv2.split(lab)
                    l_eq = cv2.equalizeHist(l)
                    lab_eq = cv2.merge([l_eq, a, b])
                    enhanced = cv2.cvtColor(lab_eq, cv2.COLOR_LAB2RGB)
                elif apply_to_channel == 'V':
                    hsv = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2HSV)
                    h, s, v = cv2.split(hsv)
                    v_eq = cv2.equalizeHist(v)
                    hsv_eq = cv2.merge([h, s, v_eq])
                    enhanced = cv2.cvtColor(hsv_eq, cv2.COLOR_HSV2RGB)
                else:
                    enhanced = img_uint8
                    
            elif method == 'gamma':
                gamma = 1.2  # Varsayılan gamma
                inv_gamma = 1.0 / gamma
                table = np.array([((i / 255.0) ** inv_gamma) * 255 
                                  for i in np.arange(0, 256)]).astype("uint8")
                enhanced = cv2.LUT(img_uint8, table)
                
            else:
                logger.warning(f"Bilinmeyen kontrast yöntemi: {method}, atlanıyor")
                return image
            
            # Orijinal dtype'a geri dönüştür
            if was_float:
                return enhanced.astype(np.float32) / 255.0
            return enhanced
            
        except Exception as e:
            logger.error(f"Kontrast iyileştirme hatası: {str(e)}")
            return image
    
    def detect_lighting_issues(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Görüntüdeki ışık sorunlarını tespit eder.
        
        Args:
            image: Giriş görüntüsü
            
        Returns:
            Dict: Işık analizi sonuçları
        """
        if image.dtype == np.float32 or image.dtype == np.float64:
            img_uint8 = (np.clip(image, 0, 1) * 255).astype(np.uint8)
        else:
            img_uint8 = image
        
        gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2GRAY)
        mean_brightness = np.mean(gray)
        std_brightness = np.std(gray)
        
        # Histogram analizi
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        hist_norm = hist.flatten() / hist.sum()
        
        # Underexposure ve overexposure tespiti
        underexposed_ratio = np.sum(hist_norm[:32])  # İlk %12.5
        overexposed_ratio = np.sum(hist_norm[224:])  # Son %12.5
        
        issues = {
            'mean_brightness': float(mean_brightness),
            'brightness_std': float(std_brightness),
            'underexposed_ratio': float(underexposed_ratio),
            'overexposed_ratio': float(overexposed_ratio),
            'is_dark': mean_brightness < 60,
            'is_bright': mean_brightness > 200,
            'is_low_contrast': std_brightness < 40,
            'recommendation': []
        }
        
        if issues['is_dark']:
            issues['recommendation'].append("Görüntü çok karanlık, kontrast iyileştirme önerilir")
        if issues['is_bright']:
            issues['recommendation'].append("Görüntü çok parlak, gamma düzeltme önerilir")
        if issues['is_low_contrast']:
            issues['recommendation'].append("Düşük kontrast, CLAHE uygulanabilir")
        
        return issues
    
    def preprocess_image(self, 
                         image_input: Union[str, bytes, np.ndarray, Image.Image],
                         resize_width: Optional[int] = None,
                         denoise: bool = True,
                         denoise_method: Optional[str] = None,
                         enhance_contrast: bool = False,
                         contrast_method: Optional[str] = None,
                         normalize: bool = True) -> PreprocessingResult:
        """
        Ana ön işleme fonksiyonu. Tüm adımları sırayla uygular.
        
        Args:
            image_input: Görüntü kaynağı
            resize_width: İsteğe bağlı yeniden boyutlandırma genişliği
            denoise: Gürültü azaltma uygulansın mı?
            denoise_method: 'gaussian', 'median', 'bilateral', 'none'
            enhance_contrast: Kontrast iyileştirme uygulansın mı?
            contrast_method: 'clahe', 'histogram_eq', 'gamma', 'none'
            normalize: Renk kanallarını normalize et
            
        Returns:
            PreprocessingResult: İşlenmiş görüntü ve metadata
        """
        errors = []
        warnings = []
        
        try:
            # 1. Görüntüyü yükle
            image, exif_info = self.load_image(image_input)
            original_shape = image.shape
            original_dtype = str(image.dtype)
            
            # 2. Işık sorunlarını tespit et ve uyarı ekle
            lighting_issues = self.detect_lighting_issues(image)
            if lighting_issues['is_dark']:
                warnings.append(format_error(
                    "preprocessing",
                    f"Görüntü çok karanlık (ortalama parlaklık: {lighting_issues['mean_brightness']:.1f})",
                    "Kontrast iyileştirme uygulanması önerilir",
                    "warning"
                ))
            if lighting_issues['is_bright']:
                warnings.append(format_error(
                    "preprocessing",
                    f"Görüntü çok parlak (ortalama parlaklık: {lighting_issues['mean_brightness']:.1f})",
                    "Gamma düzeltme uygulanması önerilir",
                    "warning"
                ))
            
            # 3. Yeniden boyutlandırma
            resize_applied = False
            if resize_width:
                image, resize_applied = self.resize_image(image, width=resize_width)
            
            # 4. Gürültü azaltma
            denoise_applied = False
            applied_denoise_method = 'none'
            if denoise:
                method = denoise_method or self.preferred_denoise
                image = self.apply_denoise(image, method=method)
                denoise_applied = True
                applied_denoise_method = method
            
            # 5. Kontrast iyileştirme
            contrast_enhanced = False
            applied_contrast_method = 'none'
            if enhance_contrast:
                method = contrast_method or 'clahe'
                image = self.enhance_contrast(image, method=method)
                contrast_enhanced = True
                applied_contrast_method = method
            
            # 6. Renk normalizasyonu
            if normalize:
                image = self.normalize_color_channels(image)
            
            processed_shape = image.shape
            processed_dtype = str(image.dtype)
            
            # Metadata oluştur
            metadata = PreprocessingMetadata(
                original_shape=original_shape,
                processed_shape=processed_shape,
                original_dtype=original_dtype,
                processed_dtype=processed_dtype,
                resize_applied=resize_applied,
                denoise_applied=denoise_applied,
                contrast_enhanced=contrast_enhanced,
                denoise_method=applied_denoise_method,
                contrast_method=applied_contrast_method,
                color_space='RGB',
                timestamp=datetime.now().isoformat(),
                exif_info=exif_info,
                warnings=warnings,
                errors=errors
            )
            
            return PreprocessingResult(
                image=image,
                metadata=metadata,
                success=True
            )
            
        except Exception as e:
            logger.error(f"Ön işleme hatası: {str(e)}")
            import traceback
            traceback.print_exc()
            
            errors.append(format_error(
                "preprocessing",
                f"Ön işleme başarısız: {str(e)}",
                "Görüntü formatını ve bütünlüğünü kontrol edin",
                "error"
            ))
            
            return PreprocessingResult(
                image=np.zeros((100, 100, 3), dtype=np.float32),
                metadata=PreprocessingMetadata(
                    original_shape=(0, 0, 0),
                    processed_shape=(0, 0, 0),
                    original_dtype="",
                    processed_dtype="",
                    resize_applied=False,
                    denoise_applied=False,
                    contrast_enhanced=False,
                    denoise_method="none",
                    contrast_method="none",
                    color_space="RGB",
                    timestamp=datetime.now().isoformat(),
                    exif_info={},
                    warnings=warnings,
                    errors=errors
                ),
                success=False
            )


def preprocess_image(image: Union[str, bytes, np.ndarray, Image.Image],
                     resize_width: Optional[int] = None,
                     denoise: bool = True,
                     enhance_contrast: bool = False,
                     config: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Standalone fonksiyon - hızlı kullanım için.
    
    Args:
        image: Görüntü kaynağı
        resize_width: İsteğe bağlı yeniden boyutlandırma genişliği
        denoise: Gürültü azaltma uygulansın mı?
        enhance_contrast: Kontrast iyileştirme uygulansın mı?
        config: Opsiyonel konfigürasyon
        
    Returns:
        Tuple[np.ndarray, Dict]: İşlenmiş görüntü ve metadata dictionary
    """
    processor = ImagePreprocessor(config)
    result = processor.preprocess_image(
        image_input=image,
        resize_width=resize_width,
        denoise=denoise,
        enhance_contrast=enhance_contrast
    )
    
    return result.image, result.metadata.to_dict()
