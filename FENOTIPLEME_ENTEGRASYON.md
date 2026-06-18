# Azolla RGB Fenotipleme Entegrasyonu

Bu belge, repoda gerçekten bulunan dizinlere göre fenotipleme entegrasyonunun güncel durumunu özetler.

## Amaç

Azolla görüntülerinden kaplama, renk indeksleri, stres göstergeleri, doku metrikleri, yoğunluk dağılımı ve biyokütle tahmini üretmek; bu çıktıları web arayüzü ve API üzerinden kullanılabilir hale getirmek.

## Mevcut entegrasyon noktaları

### Web uygulaması

- React/Vite arayüzü `src/` altında bulunur.
- Fenotipleme ekranı `src/components/PhenotypingView.tsx` dosyasında uygulanmıştır.
- Uygulama giriş noktaları `src/main.tsx` ve `src/App.tsx` dosyalarıdır.
- Geliştirme sunucusu ve Express API `server.ts` ile repo kökünden çalışır.

### Express + Python köprüsü

- `server.ts`, `/api` altında Express endpoint'lerini tanımlar.
- Seri analiz ve fenotipleme isteklerinde Python işlemesi için `backend/bridge.py` çağrılır.
- `backend/bridge.py`, `backend/azolla_processor.py` içindeki işlemciyi kullanır.
- Fenotipleme çekirdeği `backend/core/phenotyping.py` dosyasında bulunur.

### Bağımsız FastAPI uygulaması

- `backend/main.py`, ayrı çalıştırılabilen FastAPI uygulamasıdır.
- Batch fenotipleme servis mantığı `backend/phenotyping_service.py` içindedir.
- API yanıt şeması `backend/schemas/phenotyping_analyze_response.v1.json` altında sürümlenir.
- Minimal örnek yanıt `fixtures/phenotyping/analyze_response.v1.min.json` dosyasında bulunur.

### Stres algılama paketi

`azolla_stress_detection/src/` ayrı bir paket yapısıdır:

- `azolla_stress_detection/src/cv/`: CV pipeline, segmentasyon, normalizasyon ve özellik çıkarımı.
- `azolla_stress_detection/src/ml/`: Model, eğitim, kalibrasyon ve tahmin bileşenleri.
- `azolla_stress_detection/src/data/`: Görüntü ve Excel veri yükleyicileri.
- `azolla_stress_detection/src/dashboard/`: Paket içi dashboard uygulaması.

## API endpoint durumu

| Endpoint | Durum | Path | Açıklama |
| --- | --- | --- | --- |
| `GET /api/health` | implemented | `server.ts` | Express health endpoint'i. |
| `POST /api/v1/predict/series` | implemented | `server.ts`, `backend/bridge.py` | Çoklu dosya analizi. Form alanı: `images`. |
| `GET /api/v1/tasks/:id/status` | implemented | `server.ts` | Express görev durumunu verir. |
| `GET /api/v1/tasks/:id/results` | implemented | `server.ts` | Express görev sonucunu verir. |
| `GET /api/v1/settings` | implemented | `server.ts` | `config.json` okur. |
| `POST /api/v1/settings` | implemented | `server.ts` | `config.json` günceller. |
| `POST /api/v1/insights` | implemented | `server.ts` | Gemini anahtarı varsa AI yorum üretir. |
| `POST /api/v1/phenotyping/analyze` | implemented | `server.ts`, `backend/bridge.py` | Express sürümü tek `image` alanı ve `pool_area_m2` kabul eder. |
| `GET /api/v1/health` | implemented | `backend/main.py` | FastAPI uygulaması içindir. |
| `POST /api/v1/predict/series` | implemented | `backend/main.py`, `backend/pipeline_runner.py` | FastAPI seri analiz sürümü. |
| `GET /api/v1/tasks/{task_id}/status` | implemented | `backend/main.py` | FastAPI görev durumu. |
| `GET /api/v1/tasks/{task_id}/results` | implemented | `backend/main.py` | FastAPI görev sonucu. |
| `POST /api/v1/phenotyping/analyze` batch sürümü | implemented | `backend/main.py`, `backend/phenotyping_service.py` | FastAPI sürümü `images`, `group_name`, `timepoint`, opsiyonel `replicate_id`, `manual_roi`, `start_date`, `end_date` bekler. |
| WebSocket real-time streaming | planned | — | Uygulanmış WebSocket endpoint'i bulunmuyor. |
| Kalibrasyon veri girişi API'si | planned | — | Ayrı kalibrasyon endpoint'i bulunmuyor. |
| PDF/email raporlama API'si | planned | — | Ayrı raporlama endpoint'i bulunmuyor. |

## Quick Start

Repo kökünden tek doğru yerel geliştirme akışı:

```bash
npm install
python3 -m pip install -r backend/requirements.txt
npm run dev
```

Bu akış `server.ts` dosyasını çalıştırır, Express API'yi ve Vite geliştirme middleware'ini aynı portta başlatır. Varsayılan port `7860` değeridir; `PORT` ortam değişkeniyle değiştirilebilir.

## Fenotipleme kullanım örnekleri

### Express endpoint örneği

```bash
curl -X POST http://localhost:7860/api/v1/phenotyping/analyze \
  -F "image=@sample.jpg" \
  -F "pool_area_m2=16"
```

Bu endpoint `server.ts` tarafından uygulanır ve Python tarafında `backend/bridge.py` çalıştırılır.

### FastAPI batch endpoint örneği

FastAPI uygulaması ayrıca çalıştırılırsa:

```bash
python3 backend/main.py
```

Batch fenotipleme isteği:

```bash
curl -X POST http://localhost:3000/api/v1/phenotyping/analyze \
  -F "images=@sample.jpg" \
  -F "group_name=control" \
  -F "timepoint=t0" \
  -F "pool_area_m2=16" \
  -F "start_date=2026-01-01" \
  -F "end_date=2026-02-12"
```

`start_date` ve `end_date` birlikte gönderilmelidir. Tek başına gönderilen tarih alanı doğrulama hatası üretir.

## Çıktı yapısı

Express fenotipleme endpoint'i tek görüntü için şu ana bölümleri döndürür:

- `timestamp`
- `segmentasyon`
- `renk_indeksleri`
- `stres_analizi`
- `yogunluk_dagilimi`
- `doku_analizi`
- `biyokutle_tahmini`
- `buyume_parametreleri`
- `errors`
- `images`

FastAPI batch fenotipleme endpoint'i sürümlü zarf döndürür:

```json
{
  "schema_version": "1.0.0",
  "data": {
    "results": [],
    "group_comparisons": [],
    "batch_report": {
      "mask_validity_distribution": {}
    }
  }
}
```

## Notlar

- Biyokütle ve protein tahminleri kalibrasyon varsayımlarına bağlıdır; deneysel tartım/validasyon verisiyle doğrulanmalıdır.
- Korelasyon, nedensellik anlamına gelmez; stres skoru erken uyarı indeksidir.
- Pixel-to-m² dönüşümü saha/kamera kalibrasyonuna bağlıdır.

## Verified paths

Bu belge güncellenirken doğrulanan dizinler ve dosyalar:

- `src/`
- `src/App.tsx`
- `src/main.tsx`
- `src/components/PhenotypingView.tsx`
- `server.ts`
- `backend/`
- `backend/bridge.py`
- `backend/azolla_processor.py`
- `backend/main.py`
- `backend/pipeline_runner.py`
- `backend/phenotyping_service.py`
- `backend/core/phenotyping.py`
- `backend/config.yaml`
- `backend/requirements.txt`
- `backend/schemas/phenotyping_analyze_response.v1.json`
- `fixtures/phenotyping/analyze_response.v1.min.json`
- `azolla_stress_detection/src/`
- `azolla_stress_detection/src/cv/`
- `azolla_stress_detection/src/ml/`
- `azolla_stress_detection/src/data/`
- `azolla_stress_detection/src/dashboard/`
- `azolla_stress_detection/configs/config.yaml`
- `azolla_stress_detection/requirements.txt`
- `package.json`
- `config.json`

Doğrulanan repo-kökü komutları:

- `npm install`
- `python3 -m pip install -r backend/requirements.txt`
- `npm run dev`
- `python3 backend/main.py`
- `curl -X POST http://localhost:7860/api/v1/phenotyping/analyze -F "image=@sample.jpg" -F "pool_area_m2=16"`
- `curl -X POST http://localhost:3000/api/v1/phenotyping/analyze -F "images=@sample.jpg" -F "group_name=control" -F "timepoint=t0" -F "pool_area_m2=16" -F "start_date=2026-01-01" -F "end_date=2026-02-12"`
- `npm run lint`
- `npm run build`
- `python3 -m pytest backend/tests azolla_stress_detection/tests`
