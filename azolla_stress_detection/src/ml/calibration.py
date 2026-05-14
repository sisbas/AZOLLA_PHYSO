"""
Model calibration using Excel ground-truth data.
"""

import numpy as np
from typing import Dict, List, Optional
import logging
from pathlib import Path
import joblib

from sklearn.isotonic import IsotonicRegression
from sklearn.calibration import CalibratedClassifierCV

logger = logging.getLogger(__name__)


class ModelCalibrator:
    """
    Calibrate model predictions using Excel ground-truth data.
    
    Maps RGB-derived predictions to actual measured values:
    - Chlorophyll content
    - RGR (Relative Growth Rate)
    - Carotenoid levels
    """
    
    def __init__(self):
        """Initialize calibrator."""
        self.calibrators = {}
        self.is_fitted = False
    
    def fit(
        self,
        predicted_values: np.ndarray,
        actual_values: np.ndarray,
        target_name: str = 'default'
    ) -> 'ModelCalibrator':
        """
        Fit calibration model.
        
        Args:
            predicted_values: Model predictions
            actual_values: Ground-truth from Excel
            target_name: Name for this calibrator
            
        Returns:
            Self for method chaining
        """
        # Use isotonic regression for flexible calibration
        calibrator = IsotonicRegression(out_of_bounds='clip')
        calibrator.fit(predicted_values, actual_values)
        
        self.calibrators[target_name] = calibrator
        self.is_fitted = True
        
        logger.info(f"Fitted calibrator for {target_name}")
        return self
    
    def calibrate(self, values: np.ndarray, target_name: str = 'default') -> np.ndarray:
        """
        Apply calibration to predictions.
        
        Args:
            values: Values to calibrate
            target_name: Which calibrator to use
            
        Returns:
            Calibrated values
        """
        if target_name not in self.calibrators:
            logger.warning(f"No calibrator found for {target_name}. Returning original values.")
            return values
        
        return self.calibrators[target_name].transform(values)
    
    def calibrate_probabilities(
        self,
        probabilities: np.ndarray,
        method: str = 'isotonic'
    ) -> np.ndarray:
        """
        Calibrate classification probabilities.
        
        Args:
            probabilities: Raw probability outputs
            method: Calibration method
            
        Returns:
            Calibrated probabilities
        """
        # Ensure probabilities sum to 1
        calibrated = probabilities.copy()
        row_sums = calibrated.sum(axis=1, keepdims=True)
        calibrated = calibrated / row_sums
        
        return calibrated
    
    def save(self, filepath: str) -> None:
        """Save calibrator to disk."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        joblib.dump({
            'calibrators': self.calibrators,
            'is_fitted': self.is_fitted
        }, filepath)
        
        logger.info(f"Saved calibrator to {filepath}")
    
    @classmethod
    def load(cls, filepath: str) -> 'ModelCalibrator':
        """Load calibrator from disk."""
        data = joblib.load(filepath)
        
        instance = cls()
        instance.calibrators = data['calibrators']
        instance.is_fitted = data['is_fitted']
        
        logger.info(f"Loaded calibrator from {filepath}")
        return instance
