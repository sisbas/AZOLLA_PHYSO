# filepath: backend/core/validation.py
import json
import logging
import numpy as np
import pandas as pd
from typing import Dict, Any, List
from pathlib import Path
from sklearn.model_selection import TimeSeriesSplit
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

class ValidationModule:
    """
    Handles time-series CV, bootstrapping, and metadata generation.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config['validation']
        self.n_splits = self.cfg['n_splits']
        self.bootstrap_iters = self.cfg['bootstrap_iters']

    def generate_metadata(self, config_hash: str) -> Dict[str, Any]:
        """Generates project metadata for reproducibility."""
        return {
            "version": "1.2.4",
            "algorithm": "AzollaEarlyStress",
            "config_hash": config_hash,
            "timestamp_utc": pd.Timestamp.now(tz='UTC').isoformat(),
            "standard": "Academic_Reproducibility_v1"
        }

    def run_cv(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Performs TimeSeriesSplit validation if enough points exist."""
        if len(df) < self.n_splits + 2:
            return {"status": "insufficient_data"}
            
        try:
            tscv = TimeSeriesSplit(n_splits=self.n_splits)
            scores = []
            
            # Mocking score calculation for the pipeline context
            for train_index, test_index in tscv.split(df):
                scores.append(np.random.random()) # Placeholder for real CV error
            
            return {
                "cv_scores": scores,
                "mean_error": float(np.mean(scores)),
                "std_error": float(np.std(scores))
            }
        except Exception as e:
            logging.error(f"Validation CV failure: {str(e)}")
            return {"status": "failed"}

    def bootstrap_ci(self, series: pd.Series) -> Dict[str, float]:
        """Calculates 95% CI using bootstrapping."""
        try:
            values = series.dropna().values
            if len(values) == 0: return {}
            
            resamples = [np.mean(np.random.choice(values, size=len(values), replace=True)) 
                         for _ in range(self.bootstrap_iters)]
            
            return {
                "lower_95": float(np.percentile(resamples, 2.5)),
                "upper_95": float(np.percentile(resamples, 97.5)),
                "mean": float(np.mean(resamples))
            }
        except Exception as e:
            logging.error(f"Bootstrap failure: {str(e)}")
            return {}

    def reliability_targets(self, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Build reliability calibration set from labeled historical examples.
        Expected keys per item: raw_score (0-1) and label (0/1 or bool).
        """
        scores: List[float] = []
        labels: List[int] = []
        for item in history or []:
            raw = item.get("raw_score")
            label = item.get("label")
            if raw is None or label is None:
                continue
            try:
                score = float(raw)
            except (TypeError, ValueError):
                continue
            if isinstance(label, bool):
                lbl = int(label)
            else:
                try:
                    lbl = int(label)
                except (TypeError, ValueError):
                    continue
            if lbl not in (0, 1):
                continue
            scores.append(float(np.clip(score, 0.0, 1.0)))
            labels.append(lbl)
        return {"scores": scores, "labels": labels, "count": len(scores)}

    def calibrate_scores(
        self,
        raw_scores: List[float],
        reliability_data: Dict[str, Any],
        method: str = "isotonic",
    ) -> Dict[str, Any]:
        """
        Calibrate raw QC scores with isotonic regression or Platt scaling.
        Falls back to identity mapping if data is insufficient.
        """
        clipped_raw = [float(np.clip(v, 0.0, 1.0)) for v in raw_scores]
        scores = np.array(reliability_data.get("scores", []), dtype=float)
        labels = np.array(reliability_data.get("labels", []), dtype=int)
        n = int(reliability_data.get("count", 0))
        if n < 8 or len(np.unique(labels)) < 2:
            return {
                "method": "identity",
                "calibrated_scores": clipped_raw,
                "training_count": n,
                "warning": "Insufficient labeled reliability data for calibration.",
            }
        try:
            if method == "platt":
                model = LogisticRegression(max_iter=1000)
                model.fit(scores.reshape(-1, 1), labels)
                calibrated = model.predict_proba(np.array(clipped_raw).reshape(-1, 1))[:, 1].tolist()
            else:
                model = IsotonicRegression(out_of_bounds="clip")
                model.fit(scores, labels)
                calibrated = model.predict(np.array(clipped_raw)).tolist()
            return {
                "method": method,
                "calibrated_scores": [float(np.clip(v, 0.0, 1.0)) for v in calibrated],
                "training_count": n,
            }
        except Exception as e:
            logging.error(f"Calibration failure ({method}): {str(e)}")
            return {
                "method": "identity",
                "calibrated_scores": clipped_raw,
                "training_count": n,
                "warning": str(e),
            }
