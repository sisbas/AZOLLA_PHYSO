# ROI Editor Backend - Bilimsel Görüntü Karşılaştırma Pipeline'ı

## 📋 Genel Bakış

Bu modül, RGB görüntüler için bilimsel karşılaştırma, tek referans görüntü bazlı normalizasyon ve batch processing gereksinimlerine göre optimize edilmiş bir pipeline sunar.

## 🏗️ Mimari

```
[1] ROI İzolasyonu → [2] Görüntü Kaydı (Registration) 
→ [3] Işık/Renk Normalizasyonu → [4] Bilimsel Metrik Hesaplama → [5] Raporlama
```

## 📁 Dosya Yapısı

```
backend/core/roi_editor/
├── __init__.py              # Package exports
├── isolation.py             # ROI izolasyonu (segmentation)
├── registration.py          # Görüntü hizalama (registration)
├── normalization.py         # Histogram matching & renk normalizasyonu
├── metrics.py               # SSIM, PSNR, ΔRGB metrikleri
└── batch_processor.py       # Paralel batch işleme ve raporlama
```

## 🔧 Kurulum

Gerekli paketler:
```bash
pip install opencv-python-headless scikit-image scikit-learn pandas pydantic tqdm joblib
```

## 🚀 Kullanım

### Tek Görüntü İşleme

```python
from core.roi_editor import (
    isolate_roi, ROIMethod,
    register_images, RegistrationParams,
    normalize_to_reference, NormalizationParams,
    compute_scientific_metrics, MetricsConfig
)
import cv2
import numpy as np

# Görüntüleri yükle
reference = cv2.cvtColor(cv2.imread('reference.jpg'), cv2.COLOR_BGR2RGB)
source = cv2.cvtColor(cv2.imread('source.jpg'), cv2.COLOR_BGR2RGB)

# 1. ROI izolasyonu
mask = isolate_roi(source, method=ROIMethod.THRESHOLD, params={'thresh': 127})

# 2. Registration (hizalama)
reg_params = RegistrationParams(n_keypoints=2000, require_min_inlier_ratio=0.7)
registered, reg_result = register_images(source, reference, mask, reg_params)

print(f"Translation: {reg_result.translation}")
print(f"Rotation: {reg_result.rotation_deg:.2f}°")
print(f"Scale: {reg_result.scale:.3f}")
print(f"Inlier Ratio: {reg_result.inlier_ratio:.2f}")

# 3. Normalizasyon
norm_params = NormalizationParams(use_roi_only=True)
normalized, norm_stats = normalize_to_reference(registered, reference, mask, norm_params)

print(f"R Mean Shift: {abs(norm_stats.R_mean_matched - norm_stats.R_mean_reference):.2f}")
print(f"G Mean Shift: {abs(norm_stats.G_mean_matched - norm_stats.G_mean_reference):.2f}")
print(f"B Mean Shift: {abs(norm_stats.B_mean_matched - norm_stats.B_mean_reference):.2f}")

# 4. Metrik hesaplama
metrics_config = MetricsConfig(ssim_threshold=0.85, psnr_threshold_db=25.0)
metrics = compute_scientific_metrics(source, reference, normalized, mask, metrics_config)

print(f"SSIM: {metrics.ssim:.4f}")
print(f"PSNR: {metrics.psnr:.2f} dB")
print(f"ΔRGB Mean: {metrics.delta_rgb_mean:.2f}")
print(f"Quality Score: {metrics.quality_score:.3f}")
print(f"Overall Pass: {metrics.overall_pass}")
```

### Batch Processing

```python
from core.roi_editor.batch_processor import (
    ScientificBatchComparator,
    BatchConfig,
    process_batch
)

# Konfigürasyon
config = BatchConfig(
    roi_method="threshold",
    roi_thresh=127,
    reg_n_keypoints=2000,
    ssim_threshold=0.85,
    psnr_threshold_db=25.0,
    color_delta_threshold=15.0,
    save_processed_images=True,
    output_format="png",
    n_jobs=-1  # Tüm CPU'ları kullan
)

# Batch işlem
comparator = ScientificBatchComparator(
    reference_path="reference.jpg",
    config=config,
    output_dir="./output"
)

result = comparator.run_batch(source_dir="./images")

# Sonuçları görüntüle
print(f"Toplam: {result.total_images}")
print(f"Başarılı: {result.successful}")
print(f"Başarısız: {result.failed}")
print(f"Validasyon Geçti: {result.passed_validation}")
print(f"Ortalama SSIM: {result.mean_ssim:.4f} ± {result.std_ssim:.4f}")
print(f"Ortalama PSNR: {result.mean_psnr:.2f} ± {result.std_psnr:.2f} dB")
print(f"CSV Rapor: {result.csv_report_path}")
print(f"JSON Rapor: {result.json_report_path}")
```

### Kolay Wrapper Fonksiyon

```python
from core.roi_editor.batch_processor import process_batch, BatchConfig

config = BatchConfig()
result = process_batch(
    reference_path="reference.jpg",
    source_dir="./images",
    output_dir="./output",
    config=config
)
```

## 📊 Çıktı Formatları

### CSV Raporu
- `batch_results.csv`: Tüm görüntüler için metrikler (SSIM, PSNR, ΔRGB, vb.)

### JSON Raporu
- `detailed_results.json`: Detaylı sonuçlar (registration parametreleri, normalizasyon istatistikleri, validasyon bayrakları)

### İşlenmiş Görüntüler
- `processed/processed_<filename>.png`: Normalize edilmiş görüntüler

## 🎛️ Konfigürasyon Parametreleri

| Parametre | Varsayılan | Açıklama |
|-----------|------------|----------|
| `roi_method` | "threshold" | ROI yöntemi: threshold, grabcut, manual_mask, adaptive |
| `roi_thresh` | 127 | Threshold değeri (0-255) |
| `roi_blur_kernel` | 5 | Gaussian blur kernel boyutu |
| `reg_n_keypoints` | 2000 | ORB öznitelik sayısı |
| `reg_min_inlier_ratio` | 0.7 | Minimum inlier oranı |
| `norm_use_roi_only` | True | Sadece ROI bölgesini kullan |
| `ssim_threshold` | 0.85 | SSIM eşik değeri |
| `psnr_threshold_db` | 25.0 | PSNR eşik değeri (dB) |
| `color_delta_threshold` | 15.0 | Maksimum renk farkı |
| `save_processed_images` | True | İşlenmiş görüntüleri kaydet |
| `output_format` | "png" | Çıktı formatı (png/jpg) |
| `n_jobs` | -1 | Paralel işleme için CPU sayısı |

## 🔬 Bilimsel Metrikler

### SSIM (Structural Similarity Index)
- İnsan algısına daha yakın yapısal benzerlik ölçütü
- 0-1 arası değer (1 = mükemmel benzerlik)
- Eşik: > 0.85

### PSNR (Peak Signal-to-Noise Ratio)
- Teknik kalite ölçütü
- dB cinsinden (yüksek = iyi)
- Eşik: > 25 dB

### ΔRGB
- Kanal bazlı ortalama mutlak renk farkı
- 0-255 skalasında
- Eşik: < 15

### Quality Score
- Ağırlıklı ortalama: SSIM (%40) + PSNR (%30) + Renk (%30)
- 0-1 arası değer

## ⚠️ Kritik Notlar

1. **Hizalama Önceliği**: Işık normalizasyonu **hizalamadan sonra** yapılmalıdır. Hizalanmamış görüntülerde histogram eşleme yanlış sonuçlar üretir.

2. **ROI Tutarlılığı**: Maskeleme parametreleri tüm batch için sabit tutulmalıdır.

3. **Referans Seçimi**: Referans görüntü, batch'in temsilcisi olmalıdır (ortalama aydınlatma, tipik renk dağılımı).

4. **Validasyon**: Her görüntü için hem SSIM hem PSNR eşikleri aynı anda sağlanmalıdır.

## 📝 Örnek Proje Yapısı

```
project/
├── reference/
│   └── ref_image.jpg
├── images/
│   ├── sample_001.jpg
│   ├── sample_002.jpg
│   └── ...
├── output/
│   ├── processed/
│   │   ├── processed_sample_001.png
│   │   └── ...
│   └── reports/
│       ├── batch_results.csv
│       └── detailed_results.json
└── process_script.py
```

## 🧪 Test

```python
# Basit test
import numpy as np
from core.roi_editor import isolate_roi, ROIMethod

# Test görüntüsü oluştur
test_img = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)

# ROI izolasyonu test
mask = isolate_roi(test_img, method=ROIMethod.THRESHOLD, params={'thresh': 127})
assert mask.shape == (100, 100)
assert mask.dtype == np.uint8
print("✅ Test başarılı!")
```

## 📚 Bağımlılıklar

- `opencv-python-headless >= 4.8.0`
- `scikit-image >= 0.21.0`
- `scikit-learn >= 1.3.0`
- `pandas >= 2.0.0`
- `pydantic >= 2.5.0`
- `tqdm >= 4.65.0`
- `joblib >= 1.3.0`
- `numpy >= 1.24.0`
