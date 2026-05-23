# filepath: backend/core/decision.py
import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, List
from dataclasses import dataclass
from pathlib import Path
import json
from statsmodels.stats.multitest import multipletests

from .errors import format_error

@dataclass
class DecisionRecord:
    timestamp: str
    early_stress_prob: float
    is_stressed: bool
    status: str
    rationale: str
    errors: List[Dict[str, Any]]

class DecisionModule:
    """
    Decision engine using FDR-BH corrected Z-scores and weighted probabilities.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['decision']
        self.alpha = self.cfg['alpha']
        self.weights = self.cfg['early_weights']
        self.prob_thresh = self.cfg['prob_threshold']
        self.model = None
        self.model_features = ['rg_ratio', 'mean_g', 'glcm_entropy', 'coverage_pct']
        self.model_base_coef = None
        self.model_base_intercept = 0.0
        self.model_calib_coef = None
        self.model_calib_intercept = 0.0

        model_path = Path(__file__).resolve().parents[1] / 'models' / 'early_stress_calibrated_logreg_params.json'
        if model_path.exists():
            try:
                bundle = json.loads(model_path.read_text(encoding='utf-8'))
                self.model_features = bundle.get('features', self.model_features)
                self.prob_thresh = float(bundle.get('threshold', self.prob_thresh))
                self.model_base_coef = np.array(bundle['base_linear']['coef'], dtype=float)
                self.model_base_intercept = float(bundle['base_linear']['intercept'])
                self.model_calib_coef = float(bundle['platt_calibration']['coef'])
                self.model_calib_intercept = float(bundle['platt_calibration']['intercept'])
                self.model = True
                logging.info(f'Loaded calibrated early-stress model from {model_path}')
            except Exception as exc:
                logging.warning(f'Failed to load calibrated model ({exc}); fallback to weighted score.')

    def calculate_prob(self, features: Dict[str, float]) -> float:
        """Early stress probability from calibrated model; fallback to weighted score."""
        if self.model is not None:
            x = np.array([float(features.get(name, 0.0)) for name in self.model_features], dtype=float)
            try:
                linear_score = float(np.dot(x, self.model_base_coef) + self.model_base_intercept)
                z = self.model_calib_coef * linear_score + self.model_calib_intercept
                prob = 1.0 / (1.0 + np.exp(-z))
                return float(np.clip(prob, 0, 1))
            except Exception as exc:
                logging.warning(f'Model inference failed ({exc}); using weighted fallback.')

        prob = (
            features.get('rg_ratio', 0) * self.weights['rg_ratio_pct'] +
            (1 - features.get('mean_g', 0)) * self.weights['mean_g_pct'] +
            features.get('glcm_entropy', 0) * self.weights['glcm_entropy_pct'] +
            features.get('coverage_pct', 0) / 100.0 * self.weights['coverage_pct']
        )
        return float(np.clip(prob, 0, 1))

    def process(self, feature_df: pd.DataFrame) -> pd.DataFrame:
        try:
            records = []
            for _, row in feature_df.iterrows():
                errors = []
                f_dict = row.to_dict()
                
                # Check for critical missing features
                if f_dict.get('area', 0) < 10:
                    errors.append(format_error(
                        "decision",
                        "Insufficient biomass area for reliable decision.",
                        "Consider re-imaging with more sample coverage.",
                        "warning"
                    ))

                prob = self.calculate_prob(f_dict)
                is_stressed = prob > self.prob_thresh
                
                reasons = []
                if f_dict.get('rg_ratio', 0) > 0.8: reasons.append("High R/G ratio")
                if f_dict.get('glcm_entropy', 0) > 0.6: reasons.append("Textural heterogeneity")
                
                rationale = " | ".join(reasons) if reasons else "Normal physiological state"
                
                records.append({
                    "timestamp": row['timestamp'],
                    "early_stress_prob": prob,
                    "is_stressed": is_stressed,
                    "status": "STRESSED" if is_stressed else "HEALTHY",
                    "rationale": rationale,
                    "errors": errors
                })
            
            return pd.DataFrame(records)
        except Exception as e:
            logging.error(f"Decision engine failure: {str(e)}")
            return pd.DataFrame()
    
    def apply_fdr(self, p_values: List[float]) -> List[bool]:
        """Benjamini-Hochberg FDR correction."""
        if not p_values: return []
        rejected, _, _, _ = multipletests(p_values, alpha=self.alpha, method='fdr_bh')
        return rejected.tolist()
