import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, roc_curve, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.base import clone

RNG = np.random.default_rng(42)

OUT_DATA = Path('backend/data/labeled_control_stress_dataset.csv')
OUT_METRICS = Path('backend/reports/stress_model_metrics.json')
OUT_CARD = Path('backend/reports/stress_model_card.md')
OUT_MODEL_PARAMS = Path('backend/models/early_stress_calibrated_logreg_params.json')

weights = {
    'rg_ratio_pct': 0.40,
    'mean_g_pct': 0.30,
    'glcm_entropy_pct': 0.20,
    'coverage_pct': 0.10,
}
threshold = 0.45

conditions = ['control', 'mild_salt', 'severe_salt', 'nutrient_deficit']
days = [0,1,2,3,4,5,6,7]
rows = []
idx = 1
for cond in conditions:
    for day in days:
        for rep in range(30):
            sev = {
                'control': 0.05,
                'mild_salt': 0.45,
                'severe_salt': 0.85,
                'nutrient_deficit': 0.6,
            }[cond]
            day_eff = day / 7.0
            latent = np.clip(0.2*day_eff + 0.8*sev + RNG.normal(0,0.08),0,1)

            rg_ratio = np.clip(0.45 + 0.50*latent + RNG.normal(0,0.05), 0, 1.4)
            mean_g = np.clip(0.72 - 0.35*latent + RNG.normal(0,0.04), 0.1, 0.95)
            glcm_entropy = np.clip(0.25 + 0.60*latent + RNG.normal(0,0.05), 0, 1.5)
            coverage_pct = np.clip(85 - 35*latent + RNG.normal(0,4.5), 20, 100)

            chlorophyll_a = np.clip(2.8 - 1.8*latent + RNG.normal(0,0.2), 0.2, 4.0)
            carotenoid = np.clip(0.8 + 0.5*latent + RNG.normal(0,0.09), 0.1, 2.0)
            rgr = np.clip(0.16 - 0.12*latent + RNG.normal(0,0.015), -0.05, 0.25)

            y = 1 if latent > 0.52 else 0

            rows.append({
                'sample_id': f'S{idx:04d}',
                'day': day,
                'condition': cond,
                'rg_ratio': rg_ratio,
                'mean_g': mean_g,
                'glcm_entropy': glcm_entropy,
                'coverage_pct': coverage_pct,
                'chlorophyll_a_mg_g_fw': chlorophyll_a,
                'carotenoid_mg_g_fw': carotenoid,
                'rgr_g_g_day': rgr,
                'is_stressed': y,
            })
            idx += 1

df = pd.DataFrame(rows)
OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(OUT_DATA, index=False)

# baseline score
baseline = (
    df['rg_ratio'] * weights['rg_ratio_pct'] +
    (1 - df['mean_g']) * weights['mean_g_pct'] +
    df['glcm_entropy'] * weights['glcm_entropy_pct'] +
    (df['coverage_pct']/100.0) * weights['coverage_pct']
).clip(0,1)

y = df['is_stressed'].to_numpy()

auc_base = roc_auc_score(y, baseline)
yhat_base = (baseline > threshold).astype(int)
tn, fp, fn, tp = confusion_matrix(y, yhat_base).ravel()
sens_base = tp / (tp + fn)
spec_base = tn / (tn + fp)

X = df[['rg_ratio','mean_g','glcm_entropy','coverage_pct']].to_numpy()
X_train, X_test, y_train, y_test = train_test_split(X,y,test_size=0.25,stratify=y,random_state=42)

lr = LogisticRegression(max_iter=2000, class_weight='balanced', random_state=42)
cal = CalibratedClassifierCV(lr, method='sigmoid', cv=5)
cal.fit(X_train, y_train)

# Export a text-based calibrated linear model (no binary artifacts):
# Platt calibration over out-of-fold raw linear scores.
from sklearn.model_selection import StratifiedKFold
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
oof_scores = np.zeros(len(X_train), dtype=float)
for tr_idx, va_idx in skf.split(X_train, y_train):
    fold_lr = clone(lr)
    fold_lr.fit(X_train[tr_idx], y_train[tr_idx])
    oof_scores[va_idx] = fold_lr.decision_function(X_train[va_idx])

platt = LogisticRegression(max_iter=2000, class_weight='balanced', random_state=42)
platt.fit(oof_scores.reshape(-1, 1), y_train)

base_lr = clone(lr)
base_lr.fit(X_train, y_train)

base_test_scores = base_lr.decision_function(X_test)
proba = platt.predict_proba(base_test_scores.reshape(-1, 1))[:, 1]

auc_cal = roc_auc_score(y_test, proba)

fpr, tpr, thr = roc_curve(y_test, proba)
js = tpr - fpr
best = int(np.argmax(js))
opt_thr = float(thr[best])
yhat_cal = (proba >= opt_thr).astype(int)
tn, fp, fn, tp = confusion_matrix(y_test, yhat_cal).ravel()
sens_cal = tp / (tp + fn)
spec_cal = tn / (tn + fp)

OUT_MODEL_PARAMS.parent.mkdir(parents=True, exist_ok=True)
model_params = {
    'features': ['rg_ratio', 'mean_g', 'glcm_entropy', 'coverage_pct'],
    'threshold': opt_thr,
    'base_linear': {
        'coef': base_lr.coef_[0].tolist(),
        'intercept': float(base_lr.intercept_[0]),
    },
    'platt_calibration': {
        'coef': float(platt.coef_[0][0]),
        'intercept': float(platt.intercept_[0]),
    },
}
OUT_MODEL_PARAMS.write_text(json.dumps(model_params, indent=2), encoding='utf-8')

metrics = {
    'dataset': {'n_samples': int(len(df)), 'n_stressed': int(df['is_stressed'].sum()), 'n_control': int((1-df['is_stressed']).sum())},
    'baseline_weighted_threshold': {'weights': weights, 'threshold': threshold, 'roc_auc': float(auc_base), 'sensitivity': float(sens_base), 'specificity': float(spec_base)},
    'calibrated_logistic': {'threshold': opt_thr, 'roc_auc_test': float(auc_cal), 'sensitivity_test': float(sens_cal), 'specificity_test': float(spec_cal)}
}
OUT_METRICS.parent.mkdir(parents=True, exist_ok=True)
OUT_METRICS.write_text(json.dumps(metrics, indent=2), encoding='utf-8')

card = f"""# Early Stress Model Card

## 1) Amaç
Sabit ağırlıklı erken stres skorunu, kalibre edilmiş lojistik regresyon modeliyle değiştirmek.

## 2) Veri seti
- Dosya: `backend/data/labeled_control_stress_dataset.csv`
- Sütunlar: `sample_id`, `day`, `condition`, biyobelirteçler (`chlorophyll_a_mg_g_fw`, `carotenoid_mg_g_fw`, `rgr_g_g_day`) ve görüntü-tabanlı özellikler (`rg_ratio`, `mean_g`, `glcm_entropy`, `coverage_pct`), etiket (`is_stressed`).
- Örnek sayısı: {len(df)}

## 3) Eski yaklaşım (sabit ağırlık + eşik)
- ROC/AUC: {auc_base:.4f}
- Sensitivity: {sens_base:.4f}
- Specificity: {spec_base:.4f}

## 4) Yeni yaklaşım (calibrated logistic regression)
- ROC/AUC (test): {auc_cal:.4f}
- Sensitivity (test): {sens_cal:.4f}
- Specificity (test): {spec_cal:.4f}
- Karar eşiği (Youden J): {opt_thr:.4f}

## 5) Model sınırlamaları
- Bu veri seti sentetik olup gerçek biyokimyasal ölçümlerle harici doğrulama gerektirir.
- Farklı görüntüleme düzenekleri için yeniden kalibrasyon önerilir.

## 6) Yayınlanan model artefaktları
- Model: `backend/models/early_stress_calibrated_logreg_params.json`
- Metri̇kler: `backend/reports/stress_model_metrics.json`
"""
OUT_CARD.write_text(card, encoding='utf-8')
print('done')
