# AzollaProcessor Entegrasyon Rehberi 🌿

Bu modül, Azolla (su yosunu) görüntülerinin bilimsel analizi için tasarlanmış production-ready bir Python pipeline'ıdır.

## 🚀 Hızlı Başlangıç

### 1. Dosya Yapısı
- `backend/azolla_processor.py`: Ana işlemci sınıfı (OOP).
- `backend/bridge.py`: Node.js/External sistemler için JSON tabanlı köprü.
- `backend/requirements.txt`: Gerekli bağımlılıklar.

### 2. Bağımlılıkların Kurulumu
```bash
pip install -r backend/requirements.txt
```

### 3. Python İçinde Kullanım
```python
from backend.azolla_processor import AzollaProcessor

# Konfigürasyon (Opsiyonel)
config = {
    "hsv_lower": [35, 40, 40],
    "hsv_upper": [85, 255, 255]
}

processor = AzollaProcessor(config=config)

# Pipeline'ı çalıştır
result = processor.run_pipeline("azolla_sample.jpg")

print(f"Alan Oranı: %{result['metrics']['area_ratio']}")
print(f"G/R Oranı: {result['metrics']['g_ratio']}")
```

## 🌐 API Entegrasyonu (FastAPI Örneği)

Mevcut sistemde `backend/main.py` üzerinden FastAPI ile entegre edilebilir:

```python
from fastapi import FastAPI, File, UploadFile
from backend.azolla_processor import AzollaProcessor

app = FastAPI()
processor = AzollaProcessor()

@app.post("/api/v1/analyze")
async def analyze_image(file: UploadFile = File(...)):
    contents = await file.read()
    result = processor.run_pipeline(contents)
    return {
        "metrics": result["metrics"],
        "confidence": result["confidence_score"]
    }
```

## 🛠️ Teknik Detaylar

### Pipeline Aşamaları
1. **İzolasyon & Segmentasyon**: HSV thresholding + Morfolojik işlemler (Zorunlu Adım).
2. **Metrik Hesaplama**: Maskelenmiş bölge üzerinde ROI alan hesabı ve G/R (Green/Red) kanal oranı analizi.
3. **Görüntü İyileştirme**: Gray World Beyaz Dengesi + CLAHE Kontrast Normalizasyonu.
4. **Zaman Serisi Overlay**: Sağ alt köşeye tarih ve metrik bilgilerinin yarı saydam şekilde yazdırılması.

### Hata Yönetimi
Pipeline, `ProcessingError` adında custom bir exception fırlatır. Segmentasyon başarısız olduğunda veya görüntü yüklenemediğinde detaylı log üretilir.

## 📊 Örnek Çıktı Formatı
```json
{
  "metrics": {
    "area_pixels": 45230,
    "total_pixels": 1048576,
    "area_ratio": 4.31,
    "g_ratio": 1.42,
    "confidence_score": 0.93,
    "timestamp": "2024-04-24 13:45"
  },
  "confidence_score": 0.93,
  "timestamp": "2024-04-24 13:45"
}
```
