# Manual ROI Entegrasyonu – Karar Dokümanı (1 sayfa)

## Amaç
Auto segmentasyonun zorlandığı örneklerde (yansıma, düşük kontrast, su yüzeyi parlaması) kullanıcı kontrollü ROI sağlayarak fenotipleme metriklerinin kararlılığını artırmak.

## API Sözleşmesi Taslağı
- `manual_roi.mode`: `auto | manual | hybrid`
- `manual_roi.polygon`: nokta dizisi (`[{x,y}, ...]`), en az 3 nokta.
- `manual_roi.mask_base64`: ikili maske (PNG/JPEG) base64.
- `manual_roi.coordinate_space`: `pixel | normalized`.
- Sunucu önceliği:
  1) `mask_base64` varsa decode et ve `binary_mask` olarak kullan.
  2) yoksa polygon'u rasterize et.
  3) ikisi de yoksa auto segmenter.

## Veri Formatı Kararı (Polygon vs Mask)
- **Polygon (önerilen birincil format)**
  - Artı: hafif payload, mobilde gönderimi kolay, kullanıcı düzenlemesi anlaşılır.
  - Eksi: karmaşık kenarlarda hassasiyet düşebilir.
- **Mask base64 (önerilen ikincil/ileri format)**
  - Artı: piksel düzeyi kontrol, kompleks ROI’lerde yüksek doğruluk.
  - Eksi: büyük payload, mobil ağda gecikme/timeout riski.
- **Karar:** Hibrit sözleşme (polygon + opsiyonel mask) en düşük entegrasyon riskiyle esneklik sağlar.

## Beklenen Doğruluk Etkisi
- Zor sahnelerde manual/hybrid modun coverage sapmasını azaltması beklenir.
- Stress index tarafında doğrudan değil, mask kalitesi üzerinden dolaylı iyileşme beklenir.
- QC uyarılarında “segmentation mismatch” ve “low contrast” kaynaklı hataların azalması hedeflenir.

## Kullanılabilirlik Riski (Mobil/Desktop)
- **Mobil risk:** küçük ekranda vertex düzenleme zor, yanlış dokunma olasılığı yüksek.
- **Desktop risk:** düşük; mouse ile nokta taşıma daha kontrollü.
- **Azaltım planı:**
  - Snap/toleranslı vertex seçimi,
  - undo/redo,
  - yakınlaştırma,
  - “otomatikten başla” (hybrid) akışı.

## Performans Etkisi
- Polygon rasterizasyonu O(n) seviyesinde hafif.
- Mask decode + resize orta maliyetli, ancak segmenter inference’dan genelde ucuz.
- Hybrid modda manual ROI varsa segmenter bypass edilebildiği için toplam süre düşebilir.

## A/B Doğrulama Planı
Aynı görüntü için iki koşu yapılır:
- **A (Auto):** mevcut `DefaultSegmenter` maskesi.
- **B (Manual/Hybrid):** kullanıcı ROI maskesi.

Karşılaştırılacak metrikler:
1. **Coverage farkı**: `|coverage_B - coverage_A|`
2. **Stress index farkı**: `stress_score_B - stress_score_A`
3. **QC farkı**:
   - kalite skoru,
   - uyarı sayısı/türü,
   - leakage / plant_fill değişimi.

Kabul kriteri (öneri):
- Zor sahnelerde manual/hybrid, QC uyarılarını azaltırken coverage’ı daha tutarlı hale getiriyorsa özellik “beta” olarak açılır.
