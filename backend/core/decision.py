# filepath: backend/core/decision.py
import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, List
from dataclasses import dataclass
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

    def calculate_prob(self, features: Dict[str, float]) -> float:
        """Weighted probability of early stress."""
        prob = (
            features.get('rg_ratio', 0) * self.weights['rg_ratio_pct'] +
            (1 - features.get('mean_g', 0)) * self.weights['mean_g_pct'] +
            features.get('glcm_entropy', 0) * self.weights['glcm_entropy_pct']
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
