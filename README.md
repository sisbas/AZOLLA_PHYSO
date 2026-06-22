---
title: Azolla Early Stress Detection
emoji: 🌱
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Azolla Early Stress Detection System

Azolla görüntülerinden stres göstergeleri, fenotipleme metrikleri ve biyokütle tahmini üreten React + Express + Python görüntü işleme uygulaması.

## Repodaki ana bileşenler

- `src/`: React/Vite kullanıcı arayüzü.
- `server.ts`: Repo kökünden çalışan Express API ve Vite geliştirme sunucusu.
- `backend/`: Express sunucusunun çağırdığı Python görüntü işleme köprüsü ve ayrıca bağımsız FastAPI uygulaması.
- `backend/core/`: Fenotipleme, segmentasyon, doğrulama ve karar modülleri.
- `azolla_stress_detection/src/`: Ayrı stres algılama paketi; CV, veri, ML ve dashboard modülleri burada yer alır.
- `fixtures/phenotyping/`: Fenotipleme API yanıt örnekleri.

## Özellikler

- **Görüntü işleme**: Azolla maskesi, izole görüntü ve temel metrik üretimi.
- **Stres takibi**: G/R oranı, erken stres olasılığı ve karar açıklaması.
- **Fenotipleme**: Kaplama, renk indeksleri, doku, yoğunluk ve biyokütle metrikleri.
- **Zaman serisi**: Çoklu görüntü yükleme, görev durumu ve sonuç sorgulama.
- **Arayüz**: React tabanlı yükleme, analiz, ayarlar, ROI ve fenotipleme ekranları.

## Quick Start

Aşağıdaki akış repo kökünden (`/workspace/AZOLLA_PHYSO`) çalışacak tek yerel geliştirme akışıdır:

```bash
npm install
python3 -m pip install -r backend/requirements.txt
npm run dev
```

Uygulama varsayılan olarak `http://localhost:7860` adresinde açılır. `npm run dev`, `server.ts` dosyasındaki Express API'yi ve Vite middleware'ini aynı süreçte başlatır. Express fenotipleme ve seri analiz yolları gerektiğinde `backend/bridge.py` üzerinden Python pipeline'ını çağırır.

İsteğe bağlı kontroller:

```bash
npm run lint
npm run build
python3 -m pytest backend/tests azolla_stress_detection/tests
```

## API endpoint durumu

| Endpoint | Durum | Uygulama dosyası | Not |
| --- | --- | --- | --- |
| `GET /api/health` | implemented | `server.ts` | React arayüzü tarafından kullanılan Express health endpoint'i. |
| `POST /api/v1/predict/series` | implemented | `server.ts`, `backend/bridge.py` | Çoklu görüntü yükler ve arka planda Python pipeline çalıştırır. |
| `GET /api/v1/tasks/:id/status` | implemented | `server.ts` | Express görev durumunu döndürür. |
| `GET /api/v1/tasks/:id/results` | implemented | `server.ts` | Tamamlanan Express görev sonucunu döndürür. |
| `GET /api/v1/settings` | implemented | `server.ts` | `config.json` okur. |
| `POST /api/v1/settings` | implemented | `server.ts` | `config.json` yazar. |
| `POST /api/v1/insights` | implemented | `server.ts` | `GEMINI_API_KEY` varsa Gemini API ile yorum üretir. |
| `POST /api/v1/phenotyping/analyze` | implemented | `server.ts`, `backend/bridge.py` | Express yolu tek `image` alanı kabul eder. |
| `GET /api/v1/health` | implemented | `backend/main.py` | Bağımsız FastAPI uygulaması içindir; `npm run dev` ile açılmaz. |
| `POST /api/v1/phenotyping/analyze` batch sürümü | implemented | `backend/main.py`, `backend/phenotyping_service.py` | Bağımsız FastAPI uygulaması çoklu `images`, `group_name`, `timepoint` alanları bekler. |
| WebSocket real-time streaming | planned | — | Repoda uygulanmış endpoint bulunmuyor. |
| PDF/email raporlama endpoint'leri | planned | — | Repoda uygulanmış endpoint bulunmuyor. |

## Fenotipleme ve stres modülleri

- Express geliştirme akışı `server.ts` içinden `backend/bridge.py` dosyasını çağırır.
- Köprü, `backend/azolla_processor.py` üzerinden görüntüyü işler ve fenotipleme çıktısını döndürür.
- Fenotipleme çekirdeği `backend/core/phenotyping.py` içinde bulunur.
- Bağımsız araştırma/ML paketi `azolla_stress_detection/src/` altında tutulur; örneğin `azolla_stress_detection/src/cv/pipeline.py`, `azolla_stress_detection/src/ml/predictor.py` ve `azolla_stress_detection/src/dashboard/app.py`.


### Skorların tekil kaynağı ve anlamı

- Merkezi fenotipleme skorları `backend/core/scoring.py` içindeki `compute_health_stress_scores(metrics, ...)` fonksiyonundan üretilir; segmentasyon modülü kendi TREx tabanlı ara değerini `segmentation_health_proxy` adıyla raporlar ve bu değer merkezi `health_score` ile karıştırılmamalıdır.
- `stress_score = browning_percent × browning_weight + yellowing_percent × yellowing_weight + robust_distribution_score × distribution_weight` formülüyle 0-100 aralığında hesaplanır; varsayılan ağırlıklar sırasıyla 0.5, 0.3 ve 0.2'dir.
- `health_score`, merkezi stres skorunun tersini AGI, SACI, chlorophyll index ve varsa `growth_rate_percent_day` sinyalleriyle birleştiren 0-100 aralıklı özet sağlık indeksidir.
- AGI `(2×G - R - B) / (2×G + R + B)`, SACI `(G - B) / (G + B + 0.001)` ve chlorophyll index `G / (R + 0.01)` olarak hesaplanır; büyüme hızı `ln(A₂/A₁)/(t₂-t₁) × 100` formülünü kullanır.
- Korelasyon ≠ nedensellik. Bu skorlar erken uyarı indeksidir, biyokimyasal validasyon gerektirir; laboratuvar doğrulaması olmadan kesin fizyolojik tanı olarak yorumlanmamalıdır.

## Konfigürasyon

- Web uygulamasının ayarlar ekranı `config.json` dosyasını okur/yazar.
- Bağımsız FastAPI pipeline varsayılan olarak `backend/config.yaml` kullanır.
- Stres algılama paketinin örnek konfigürasyonu `azolla_stress_detection/configs/config.yaml` içindedir.

## Verified paths

Bu belge güncellenirken doğrulanan dizinler ve dosyalar:

- `src/`
- `src/components/PhenotypingView.tsx`
- `server.ts`
- `backend/`
- `backend/bridge.py`
- `backend/main.py`
- `backend/phenotyping_service.py`
- `backend/core/phenotyping.py`
- `backend/requirements.txt`
- `backend/schemas/phenotyping_analyze_response.v1.json`
- `fixtures/phenotyping/analyze_response.v1.min.json`
- `azolla_stress_detection/src/`
- `azolla_stress_detection/src/cv/`
- `azolla_stress_detection/src/ml/`
- `azolla_stress_detection/src/dashboard/`
- `azolla_stress_detection/requirements.txt`
- `package.json`
- `config.json`

Doğrulanan repo-kökü komutları:

- `npm install`
- `python3 -m pip install -r backend/requirements.txt`
- `npm run dev`
- `npm run lint`
- `npm run build`
- `python3 -m pytest backend/tests azolla_stress_detection/tests`

## License

MIT
