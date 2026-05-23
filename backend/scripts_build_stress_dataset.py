import json
from pathlib import Path
import math
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
            group_label = 'control' if cond == 'control' else 'stress'

            rows.append({
                'sample_id': f'{cond}_R{rep+1:02d}',
                'day_index': day,
                'group_label': group_label,
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

df = pd.DataFrame(rows)
# Zorunlu veri modeli alanlarını doğrula
required_model_fields = ['group_label', 'sample_id', 'day_index']
missing = [col for col in required_model_fields if col not in df.columns]
if missing:
    raise ValueError(f"Eksik zorunlu veri modeli alanları: {missing}")

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

# Δsample / Δcorrected + etki büyüklüğü ve p-değeri hesapları
feature_cols = ['rg_ratio', 'mean_g', 'glcm_entropy', 'coverage_pct', 'chlorophyll_a_mg_g_fw', 'carotenoid_mg_g_fw', 'rgr_g_g_day']

start_day = int(df['day_index'].min())
end_day = int(df['day_index'].max())
start_df = df[df['day_index'] == start_day].set_index('sample_id')
end_df = df[df['day_index'] == end_day].set_index('sample_id')
common_samples = start_df.index.intersection(end_df.index)
paired_start = start_df.loc[common_samples]
paired_end = end_df.loc[common_samples]

delta_df = pd.DataFrame({
    'sample_id': common_samples,
    'group_label': paired_start['group_label'].values,
    'day_start': start_day,
    'day_end': end_day,
})

for col in feature_cols:
    delta_df[f'delta_sample_{col}'] = paired_end[col].to_numpy() - paired_start[col].to_numpy()

summary_rows = []
for col in feature_cols:
    delta_col = f'delta_sample_{col}'
    control_vals = delta_df.loc[delta_df['group_label'] == 'control', delta_col].dropna().to_numpy(dtype=float)
    stress_vals = delta_df.loc[delta_df['group_label'] == 'stress', delta_col].dropna().to_numpy(dtype=float)

    mean_control = float(np.mean(control_vals)) if len(control_vals) else 0.0
    corrected_vals = stress_vals - mean_control

    n1, n0 = len(stress_vals), len(control_vals)
    mean1 = float(np.mean(stress_vals)) if n1 else 0.0
    mean0 = float(np.mean(control_vals)) if n0 else 0.0
    var1 = float(np.var(stress_vals, ddof=1)) if n1 > 1 else 0.0
    var0 = float(np.var(control_vals, ddof=1)) if n0 > 1 else 0.0

    se = math.sqrt((var1 / n1) + (var0 / n0)) if n1 > 1 and n0 > 1 else float('nan')
    diff = mean1 - mean0
    t_stat = diff / se if se and se > 0 else float('nan')

    if n1 > 1 and n0 > 1 and se > 0:
        df_welch_num = (var1 / n1 + var0 / n0) ** 2
        df_welch_den = ((var1 / n1) ** 2) / (n1 - 1) + ((var0 / n0) ** 2) / (n0 - 1)
        _df_welch = df_welch_num / df_welch_den if df_welch_den > 0 else float('nan')
        # Normal approx p-value (iki yönlü) ve %95 CI
        p_value = float(math.erfc(abs(t_stat) / math.sqrt(2.0)))
        ci_low = diff - 1.96 * se
        ci_high = diff + 1.96 * se
    else:
        p_value = float('nan')
        ci_low = float('nan')
        ci_high = float('nan')

    pooled_den = (n1 + n0 - 2)
    if n1 > 1 and n0 > 1 and pooled_den > 0:
        pooled_sd = math.sqrt((((n1 - 1) * var1) + ((n0 - 1) * var0)) / pooled_den)
        cohen_d = diff / pooled_sd if pooled_sd > 0 else 0.0
    else:
        cohen_d = float('nan')

    summary_rows.append({
        'index_name': col,
        'delta_control_mean': mean_control,
        'delta_stress_mean': mean1,
        'delta_corrected_mean': float(np.mean(corrected_vals)) if len(corrected_vals) else 0.0,
        'effect_size_cohen_d': float(cohen_d),
        'p_value': p_value,
        'ci95_low': float(ci_low),
        'ci95_high': float(ci_high),
        'n_control': int(n0),
        'n_stress': int(n1),
    })

delta_summary = pd.DataFrame(summary_rows)

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
    'dataset': {
        'required_fields': required_model_fields,
        'n_samples': int(len(df)),
        'n_stressed': int(df['is_stressed'].sum()),
        'n_control': int((1-df['is_stressed']).sum())
    },
    'baseline_weighted_threshold': {'weights': weights, 'threshold': threshold, 'roc_auc': float(auc_base), 'sensitivity': float(sens_base), 'specificity': float(spec_base)},
    'calibrated_logistic': {'threshold': opt_thr, 'roc_auc_test': float(auc_cal), 'sensitivity_test': float(sens_cal), 'specificity_test': float(spec_cal)},
    'delta_analysis': {
        'formula': {
            'delta_sample': 'end-start',
            'delta_corrected': 'delta_stress - mean(delta_control)'
        },
        'start_day': start_day,
        'end_day': end_day,
        'per_index': delta_summary.to_dict(orient='records')
    }
}
OUT_METRICS.parent.mkdir(parents=True, exist_ok=True)
OUT_METRICS.write_text(json.dumps(metrics, indent=2), encoding='utf-8')

card = f"""# Early Stress Model Card

## 1) Amaç
Sabit ağırlıklı erken stres skorunu, kalibre edilmiş lojistik regresyon modeliyle değiştirmek.

## 2) Veri seti
- Dosya: `backend/data/labeled_control_stress_dataset.csv`
- Zorunlu alanlar: `group_label` (control/stress), `sample_id`, `day_index`
- Sütunlar: `sample_id`, `day_index`, `group_label`, `condition`, biyobelirteçler (`chlorophyll_a_mg_g_fw`, `carotenoid_mg_g_fw`, `rgr_g_g_day`) ve görüntü-tabanlı özellikler (`rg_ratio`, `mean_g`, `glcm_entropy`, `coverage_pct`), etiket (`is_stressed`).
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

## 5) Δ Analizi ve İstatistiksel Rapor
- Formül: `Δsample = end-start`
- Düzeltme: `Δcorrected = Δstress - mean(Δcontrol)`
- Rapor metrikleri (indeks başına): `effect_size_cohen_d`, `p_value`, `ci95_low`, `ci95_high`
- Ayrıntılar: `backend/reports/stress_model_metrics.json` içindeki `delta_analysis.per_index` alanı.

## 6) Model sınırlamaları
- Bu veri seti sentetik olup gerçek biyokimyasal ölçümlerle harici doğrulama gerektirir.
- p-değerleri normal yaklaşım ile yaklaşık hesaplanmıştır.
- Farklı görüntüleme düzenekleri için yeniden kalibrasyon önerilir.

## 7) Yayınlanan model artefaktları
- Model: `backend/models/early_stress_calibrated_logreg_params.json`
- Metri̇kler: `backend/reports/stress_model_metrics.json`
"""
OUT_CARD.write_text(card, encoding='utf-8')
print('done')
