# Early Stress Model Card

## 1) Amaç
Sabit ağırlıklı erken stres skorunu, kalibre edilmiş lojistik regresyon modeliyle değiştirmek.

## 2) Veri seti
- Dosya: `backend/data/labeled_control_stress_dataset.csv`
- Sütunlar: `sample_id`, `day`, `condition`, biyobelirteçler (`chlorophyll_a_mg_g_fw`, `carotenoid_mg_g_fw`, `rgr_g_g_day`) ve görüntü-tabanlı özellikler (`rg_ratio`, `mean_g`, `glcm_entropy`, `coverage_pct`), etiket (`is_stressed`).
- Örnek sayısı: 960

## 3) Eski yaklaşım (sabit ağırlık + eşik)
- ROC/AUC: 0.9830
- Sensitivity: 1.0000
- Specificity: 0.2511

## 4) Yeni yaklaşım (calibrated logistic regression)
- ROC/AUC (test): 0.9762
- Sensitivity (test): 0.8790
- Specificity (test): 0.9483
- Karar eşiği (Youden J): 0.6771

## 5) Model sınırlamaları
- Bu veri seti sentetik olup gerçek biyokimyasal ölçümlerle harici doğrulama gerektirir.
- Farklı görüntüleme düzenekleri için yeniden kalibrasyon önerilir.

## 6) Yayınlanan model artefaktları
- Model: `backend/models/early_stress_calibrated_logreg_params.json`
- Metri̇kler: `backend/reports/stress_model_metrics.json`
