# FAZ 1 - Azolla Görüntü Ön İşleme ve İzolasyon Modülü

## Genel Bakış

FAZ 1, Azolla bitkisinin RGB fotoğrafları üzerinden analiz edilmesini sağlayacak modüler yazılım altyapısının ilk fazıdır. Bu fazda amaç, yüklenen bir görüntü içinden yalnızca Azolla bitkisini izole etmek, arka planı ve ilgisiz objeleri ayıklamak ve sonraki analiz fazlarına temiz çıktılar sağlamaktır.

**Bu fazda yapılmayanlar:**
- Biyokütle tahmini
- Stres tespiti (temel metrikler dışında)
- Zaman serisi analizi
- Frond/yaprakçık sayımı

---

## Modüller

### MODÜL 1: Görüntü Yükleme ve Ön İşleme (`image_preprocessor.py`)

Görüntüyü analiz için standart hale getirir.

#### Özellikler
- **Çoklu giriş formatı desteği**: Dosya yolu, bytes, numpy array, PIL Image
- **Otomatik RGB dönüşümü**: BGR, RGBA, grayscale formatlarından RGB'ye
- **Yeniden boyutlandırma**: Aspect ratio koruyarak resize
- **Gürültü azaltma**: Gaussian Blur, Median Blur, Bilateral Filter
- **Kontrast iyileştirme**: CLAHE, Histogram Equalization, Gamma correction
- **EXIF metadata çıkarma**: Tarih, kamera bilgileri
- **Işık sorunu tespiti**: Underexposure, overexposure, low contrast analizi

#### Kullanım

```python
from backend.core import ImagePreprocessor, preprocess_image

# Class-based kullanım
preprocessor = ImagePreprocessor(config={
    'preprocessing': {
        'gaussian_sigma': 1.5,
        'clahe_clip_limit': 2.0,
        'preferred_denoise': 'gaussian'
    }
})

result = preprocessor.preprocess_image(
    image_input='path/to/image.jpg',
    resize_width=800,
    denoise=True,
    enhance_contrast=True,
    normalize=True
)

print(f"Başarılı: {result.success}")
print(f"Orijinal boyut: {result.metadata.original_shape}")
print(f"İşlenmiş boyut: {result.metadata.processed_shape}")

# Fonksiyon-based kullanım (hızlı)
processed_img, metadata = preprocess_image(
    image='path/to/image.jpg',
    resize_width=800,
    denoise=True,
    enhance_contrast=False
)
```

#### Çıktılar
- `image`: İşlenmiş görüntü (numpy array, float32, 0-1 aralığında)
- `metadata`: 
  - `original_shape`: Orijinal görüntü boyutu
  - `processed_shape`: İşlenmiş görüntü boyutu
  - `resize_applied`: Yeniden boyutlandırma uygulandı mı
  - `denoise_applied`: Gürültü azaltma uygulandı mı
  - `contrast_enhanced`: Kontrast iyileştirme uygulandı mı
  - `warnings`: Uyarı listesi
  - `errors`: Hata listesi

---

### MODÜL 2: Azolla İzolasyonu ve Segmentasyon (`azolla_isolator.py`)

RGB görüntülerden Azolla bitkisini izole eder.

#### Özellikler
- **Çoklu renk uzayı analizi**: RGB, HSV, Lab
- **Vegetation indeksleri**: 
  - ExG (Excess Green): Bitki örtüsü tespiti
  - ExR (Excess Red): Stres indeksi
  - TREx: True Color Vegetation Index
  - GR Ratio: Green-Red oranı
- **Otomatik thresholding**: Otsu, Li, IsoData
- **Adaptive HSV thresholding**: Görüntüye özel HSV sınırları
- **Morfolojik işlemler**: Opening, closing, hole filling
- **Bounding box cropping**: Bitki bölgesine otomatik kırpma
- **ROI selection desteği**: Manuel seçim için GUI altyapısı
- **Fallback stratejileri**: Çoklu segmentasyon yöntemleri

#### Segmentasyon Stratejileri

1. **ExG + Otsu (Primary)**: Excess Green index + Otsu thresholding
2. **HSV Adaptive**: Otomatik ayarlanan HSV sınırları
3. **Green Channel (Fallback)**: Yeşil kanal Li thresholding
4. **Lab a* Channel (Fallback)**: Lab renk uzayı a* kanalı

#### Kullanım

```python
from backend.core import AzollaIsolator, isolate_azolla

# Class-based kullanım
isolator = AzollaIsolator(config={
    'isolation': {
        'hsv_min': [35, 40, 40],
        'hsv_max': [85, 255, 255],
        'min_area': 50,
        'adaptive_hsv': True,
        'auto_gamma': True
    }
})

result = isolator.isolate_azolla('path/to/image.jpg')

print(f"İzolasyon başarılı: {result.success}")
print(f"Maske boyutu: {result.mask.shape}")
print(f"Coverage: %{result.metrics.coverage_pct:.2f}")
print(f"Kullanılan method: {result.metrics.method_used}")
print(f"Health score: {result.metrics.health_score:.1f}")

# Fonksiyon-based kullanım (hızlı)
result = isolate_azolla('path/to/image.jpg')
```

#### Çıktılar
- `mask`: Binary maske (uint8, 0-255)
- `isolated_image`: Arka planı temizlenmiş Azolla görüntüsü
- `cropped_image`: Yalnızca bitki bölgesini içeren kırpılmış görüntü
- `metrics`:
  - `coverage_pct`: Bitki coverage yüzdesi
  - `method_used`: Kullanılan segmentasyon yöntemi
  - `area_pixels`: Maske alanı (piksel)
  - `trex_mean`: Ortalama TREx değeri
  - `exr_mean`: Ortalama ExR değeri
  - `gr_ratio`: Green-Red oranı
  - `health_score`: Sağlık skoru (0-100)
  - `solidity`: Solidity değeri (0-1)
  - `bbox`: Bounding box (x, y, width, height)

---

## Konfigürasyon

`backend/config.yaml` dosyasında FAZ 1 parametreleri:

```yaml
# FAZ 1 - Görüntü Ön İşleme ve İzolasyon Konfigürasyonu
preprocessing:
  default_width: null          # Varsayılan yeniden boyutlandırma
  gaussian_sigma: 1.5          # Gaussian blur sigma
  median_kernel: 3             # Median blur kernel
  clahe_clip_limit: 2.0        # CLAHE clip limit
  clahe_grid_size: [8, 8]      # CLAHE grid boyutu
  normalize_channels: true     # Renk kanallarını normalize et
  preferred_denoise: 'gaussian' # Tercih edilen denoise yöntemi

isolation:
  hsv_min: [35, 40, 40]        # HSV alt sınır
  hsv_max: [85, 255, 255]      # HSV üst sınır
  min_area: 50                 # Minimum alan (piksel)
  close_radius: 3              # Morphological closing yarıçapı
  open_radius: 2               # Morphological opening yarıçapı
  adaptive_hsv: true           # Adaptive HSV thresholding
  auto_gamma: true             # Otomatik gamma düzeltme
  exg_weight: 0.7              # ExG ağırlığı
  trex_weight: 0.3             # TREx ağırlığı
  fallback_enabled: true       # Fallback stratejileri aktif
```

---

## Entegrasyon Örneği

```python
from backend.core import ImagePreprocessor, AzollaIsolator

def process_azolla_image(image_path: str, config: dict = None):
    """
    FAZ 1 tam pipeline: Ön işleme + İzolasyon
    
    Args:
        image_path: Görüntü dosya yolu
        config: Opsiyonel konfigürasyon
        
    Returns:
        dict: Tüm çıktılar ve metrikler
    """
    # 1. Ön işleme
    preprocessor = ImagePreprocessor(config)
    preprocess_result = preprocessor.preprocess_image(
        image_input=image_path,
        resize_width=800,
        denoise=True,
        enhance_contrast=True
    )
    
    if not preprocess_result.success:
        return {"success": False, "errors": preprocess_result.metadata.errors}
    
    # 2. İzolasyon
    isolator = AzollaIsolator(config)
    isolation_result = isolator.isolate_azolla(preprocess_result.image)
    
    if not isolation_result.success:
        return {"success": False, "errors": isolation_result.metrics.errors}
    
    # 3. Sonuçları birleştir
    return {
        "success": True,
        "mask": isolation_result.mask,
        "isolated_image": isolation_result.isolated_image,
        "cropped_image": isolation_result.cropped_image,
        "bounding_box": isolation_result.bbox,
        "metrics": {
            "coverage_pct": isolation_result.metrics.coverage_pct,
            "area_pixels": isolation_result.metrics.area_pixels,
            "method_used": isolation_result.metrics.method_used,
            "health_score": isolation_result.metrics.health_score,
            "gr_ratio": isolation_result.metrics.gr_ratio,
            "trex_mean": isolation_result.metrics.trex_mean,
            "exr_mean": isolation_result.metrics.exr_mean,
            "solidity": isolation_result.metrics.solidity
        },
        "preprocessing_metadata": preprocess_result.metadata.to_dict(),
        "warnings": isolation_result.metrics.warnings
    }

# Kullanım
result = process_azolla_image('samples/azolla_sample.jpg')
print(f"Coverage: %{result['metrics']['coverage_pct']:.2f}")
print(f"Health Score: {result['metrics']['health_score']:.1f}")
```

---

## API Yanıt Formatı (Gelecek UI Entegrasyonu İçin)

```json
{
  "success": true,
  "data": {
    "mask_url": "base64_encoded_mask_png",
    "isolated_image_url": "base64_encoded_isolated_png",
    "cropped_image_url": "base64_encoded_cropped_png",
    "bounding_box": [150, 100, 300, 200],
    "metrics": {
      "coverage_pct": 25.0,
      "area_pixels": 59988,
      "method_used": "exg_otsu",
      "health_score": 100.0,
      "gr_ratio": 2.5,
      "trex_mean": 95.3,
      "exr_mean": 45.2,
      "solidity": 0.85
    },
    "preprocessing": {
      "original_shape": [400, 600, 3],
      "processed_shape": [200, 300, 3],
      "resize_applied": true,
      "denoise_applied": true,
      "contrast_enhanced": true
    }
  },
  "warnings": [],
  "errors": []
}
```

---

## Test

```bash
cd /workspace
python -c "
from backend.core import ImagePreprocessor, AzollaIsolator
import numpy as np

# Test görüntü oluştur
test_img = np.zeros((400, 600, 3), dtype=np.uint8)
test_img[:, :] = [200, 200, 200]  # Arka plan
test_img[100:300, 150:450] = [50, 180, 50]  # Bitki

# MODÜL 1 testi
preprocessor = ImagePreprocessor({})
result = preprocessor.preprocess_image(test_img, resize_width=300)
print(f'MODÜL 1 Başarılı: {result.success}')

# MODÜL 2 testi
isolator = AzollaIsolator({})
isolation_result = isolator.isolate_azolla(test_img)
print(f'MODÜL 2 Başarılı: {isolation_result.success}')
print(f'Coverage: %{isolation_result.metrics.coverage_pct:.2f}')
"
```

---

## Bağımlılıklar

```
opencv-python-headless>=4.8.0
numpy>=1.24.0
scikit-image>=0.20.0
Pillow>=9.5.0
matplotlib>=3.7.0
pandas>=2.0.0  # Metrik tablosu için (opsiyonel)
```

---

## Sonraki Fazlar İçin Hazır Çıktılar

FAZ 1, Faz 2 ve Faz 3 için aşağıdaki temiz çıktıları üretir:

1. **Binary Maske**: İleri morfolojik analiz için
2. **İzole Edilmiş Görüntü**: Arka plan temizlenmiş, sadece bitki
3. **Kırpılmış Görüntü**: Sadece ROI bölgesi, hızlı işlem için
4. **Segmentasyon Metrikleri**: Coverage, area, solidity
5. **Vegetation Indeksleri**: ExG, ExR, TREx, GR ratio
6. **Sağlık Skoru**: Erken uyarı indeksi

Bu çıktılar Faz 2'de biyokütle tahmini ve Faz 3'te zaman serisi analizi için kullanılacaktır.

---

## Notlar

- **Korelasyon ≠ Nedensellik**: Sağlık skorları erken uyarı indeksidir, biyokimyasal validasyon gerektirir.
- **Headless Çalışma**: OpenCV headless versiyonu kullanılır, GUI fonksiyonları (`select_roi_manual`) sadece desktop ortamında çalışır.
- **Performans**: Büyük görüntüler için `resize_width` parametresi ile ön işleme önerilir.
