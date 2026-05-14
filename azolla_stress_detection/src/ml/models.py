"""
Machine learning models for Azolla stress detection.

Implements:
- Stress classifier (Random Forest, XGBoost)
- Stress regressor (for RGR, chlorophyll prediction)
- Combined model with both classification and regression
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union
import logging
from pathlib import Path
import joblib

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.multioutput import MultiOutputRegressor

logger = logging.getLogger(__name__)


class StressClassifier:
    """
    Classifier for Azolla stress levels.
    
    Classes:
    - 0: Early/No stress
    - 1: Moderate stress
    - 2: Severe stress
    """
    
    def __init__(
        self,
        model_type: str = 'xgboost',
        n_estimators: int = 200,
        max_depth: int = 6,
        random_state: int = 42,
        **kwargs
    ):
        """
        Initialize the classifier.
        
        Args:
            model_type: 'random_forest' or 'xgboost'
            n_estimators: Number of trees
            max_depth: Maximum tree depth
            random_state: Random seed
            **kwargs: Additional model parameters
        """
        self.model_type = model_type
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.random_state = random_state
        self.model = None
        self.feature_names: List[str] = []
        self.class_names = ['Early', 'Moderate', 'Severe']
        self.is_fitted = False
        
        # Set up model
        if model_type == 'random_forest':
            self.model = RandomForestClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth,
                random_state=random_state,
                class_weight='balanced',
                n_jobs=-1,
                **kwargs
            )
        elif model_type == 'xgboost':
            try:
                import xgboost as xgb
                self.model = xgb.XGBClassifier(
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    learning_rate=kwargs.get('learning_rate', 0.1),
                    random_state=random_state,
                    use_label_encoder=False,
                    eval_metric='mlogloss',
                    n_jobs=-1,
                    **kwargs
                )
            except ImportError:
                logger.warning("XGBoost not available, falling back to Random Forest")
                self.model_type = 'random_forest'
                self.model = RandomForestClassifier(
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    random_state=random_state,
                    class_weight='balanced',
                    n_jobs=-1,
                    **kwargs
                )
        else:
            raise ValueError(f"Unknown model_type: {model_type}")
    
    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: List[str] = None) -> 'StressClassifier':
        """
        Train the classifier.
        
        Args:
            X: Feature matrix (n_samples, n_features)
            y: Target labels (n_samples,)
            feature_names: Optional list of feature names
            
        Returns:
            Self for method chaining
        """
        self.model.fit(X, y)
        self.feature_names = feature_names or [f'feature_{i}' for i in range(X.shape[1])]
        self.is_fitted = True
        
        logger.info(f"Fitted {self.model_type} classifier with {X.shape[0]} samples")
        return self
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predict stress classes.
        
        Args:
            X: Feature matrix
            
        Returns:
            Predicted class labels
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")
        return self.model.predict(X)
    
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predict class probabilities.
        
        Args:
            X: Feature matrix
            
        Returns:
            Class probabilities (n_samples, n_classes)
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")
        return self.model.predict_proba(X)
    
    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get feature importance scores.
        
        Returns:
            Dictionary mapping feature names to importance scores
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted.")
        
        importances = self.model.feature_importances_
        return dict(zip(self.feature_names, importances))
    
    def save(self, filepath: str) -> None:
        """Save model to disk."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        joblib.dump({
            'model': self.model,
            'model_type': self.model_type,
            'feature_names': self.feature_names,
            'class_names': self.class_names,
            'is_fitted': self.is_fitted
        }, filepath)
        
        logger.info(f"Saved classifier to {filepath}")
    
    @classmethod
    def load(cls, filepath: str) -> 'StressClassifier':
        """Load model from disk."""
        data = joblib.load(filepath)
        
        instance = cls.__new__(cls)
        instance.model = data['model']
        instance.model_type = data['model_type']
        instance.feature_names = data['feature_names']
        instance.class_names = data['class_names']
        instance.is_fitted = data['is_fitted']
        
        logger.info(f"Loaded classifier from {filepath}")
        return instance


class StressRegressor:
    """
    Regressor for continuous stress metrics.
    
    Predicts:
    - RGR deviation from control
    - Chlorophyll loss
    - Growth percentage
    """
    
    def __init__(
        self,
        model_type: str = 'xgboost',
        n_estimators: int = 200,
        max_depth: int = 6,
        random_state: int = 42,
        targets: List[str] = None,
        **kwargs
    ):
        """
        Initialize the regressor.
        
        Args:
            model_type: 'random_forest' or 'xgboost'
            n_estimators: Number of trees
            max_depth: Maximum tree depth
            random_state: Random seed
            targets: List of target variable names
            **kwargs: Additional model parameters
        """
        self.model_type = model_type
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.random_state = random_state
        self.targets = targets or ['rgr_deviation', 'chlorophyll_loss']
        self.model = None
        self.feature_names: List[str] = []
        self.is_fitted = False
        
        # Set up model
        if model_type == 'random_forest':
            base_model = RandomForestRegressor(
                n_estimators=n_estimators,
                max_depth=max_depth,
                random_state=random_state,
                n_jobs=-1,
                **kwargs
            )
            self.model = MultiOutputRegressor(base_model)
        elif model_type == 'xgboost':
            try:
                import xgboost as xgb
                self.model = xgb.XGBRegressor(
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    learning_rate=kwargs.get('learning_rate', 0.1),
                    random_state=random_state,
                    n_jobs=-1,
                    **kwargs
                )
            except ImportError:
                logger.warning("XGBoost not available, falling back to Random Forest")
                self.model_type = 'random_forest'
                base_model = RandomForestRegressor(
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    random_state=random_state,
                    n_jobs=-1,
                    **kwargs
                )
                self.model = MultiOutputRegressor(base_model)
    
    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: List[str] = None) -> 'StressRegressor':
        """
        Train the regressor.
        
        Args:
            X: Feature matrix
            y: Target values (can be 1D or 2D for multiple targets)
            feature_names: Optional list of feature names
            
        Returns:
            Self for method chaining
        """
        if len(y.shape) == 1:
            y = y.reshape(-1, 1)
        
        self.model.fit(X, y)
        self.feature_names = feature_names or [f'feature_{i}' for i in range(X.shape[1])]
        self.is_fitted = True
        
        logger.info(f"Fitted {self.model_type} regressor with {X.shape[0]} samples, {y.shape[1]} targets")
        return self
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predict continuous values.
        
        Args:
            X: Feature matrix
            
        Returns:
            Predicted values
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")
        return self.model.predict(X)
    
    def save(self, filepath: str) -> None:
        """Save model to disk."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        joblib.dump({
            'model': self.model,
            'model_type': self.model_type,
            'targets': self.targets,
            'feature_names': self.feature_names,
            'is_fitted': self.is_fitted
        }, filepath)
        
        logger.info(f"Saved regressor to {filepath}")
    
    @classmethod
    def load(cls, filepath: str) -> 'StressRegressor':
        """Load model from disk."""
        data = joblib.load(filepath)
        
        instance = cls.__new__(cls)
        instance.model = data['model']
        instance.model_type = data['model_type']
        instance.targets = data['targets']
        instance.feature_names = data['feature_names']
        instance.is_fitted = data['is_fitted']
        
        logger.info(f"Loaded regressor from {filepath}")
        return instance


class CombinedStressModel:
    """
    Combined model with both classification and regression heads.
    
    Provides unified interface for:
    - Stress class prediction (Early/Moderate/Severe)
    - Continuous metric prediction (RGR deviation, chlorophyll loss)
    - Confidence scores
    """
    
    def __init__(
        self,
        classifier: StressClassifier = None,
        regressor: StressRegressor = None
    ):
        """
        Initialize combined model.
        
        Args:
            classifier: StressClassifier instance
            regressor: StressRegressor instance
        """
        self.classifier = classifier or StressClassifier()
        self.regressor = regressor or StressRegressor()
        self.is_fitted = False
    
    def fit(
        self,
        X: np.ndarray,
        y_class: np.ndarray,
        y_reg: np.ndarray,
        feature_names: List[str] = None
    ) -> 'CombinedStressModel':
        """
        Train both classifier and regressor.
        
        Args:
            X: Feature matrix
            y_class: Classification targets
            y_reg: Regression targets
            feature_names: Optional feature names
            
        Returns:
            Self for method chaining
        """
        self.classifier.fit(X, y_class, feature_names)
        self.regressor.fit(X, y_reg, feature_names)
        self.is_fitted = True
        
        logger.info("Fitted combined stress model")
        return self
    
    def predict(self, X: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Make predictions with both heads.
        
        Args:
            X: Feature matrix
            
        Returns:
            Dictionary with:
            - stress_class: Predicted class labels
            - stress_proba: Class probabilities
            - rgr_deviation: Predicted RGR deviation
            - chlorophyll_loss: Predicted chlorophyll loss
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted.")
        
        stress_class = self.classifier.predict(X)
        stress_proba = self.classifier.predict_proba(X)
        reg_pred = self.regressor.predict(X)
        
        # Handle single vs multiple regression targets
        if len(self.regressor.targets) == 1:
            rgr_deviation = reg_pred.flatten()
            chlorophyll_loss = np.zeros_like(rgr_deviation)
        else:
            rgr_deviation = reg_pred[:, 0] if reg_pred.shape[1] > 0 else reg_pred.flatten()
            chlorophyll_loss = reg_pred[:, 1] if reg_pred.shape[1] > 1 else np.zeros_like(rgr_deviation)
        
        return {
            'stress_class': stress_class,
            'stress_proba': stress_proba,
            'rgr_deviation': rgr_deviation,
            'chlorophyll_loss': chlorophyll_loss
        }
    
    def predict_with_confidence(self, X: np.ndarray) -> Dict:
        """
        Make predictions with confidence scores.
        
        Args:
            X: Feature matrix
            
        Returns:
            Dictionary with predictions and confidence
        """
        predictions = self.predict(X)
        
        # Confidence = max probability from classifier
        confidence = predictions['stress_proba'].max(axis=1)
        
        # Map class indices to names
        class_names = self.classifier.class_names
        predicted_classes = [class_names[i] for i in predictions['stress_class']]
        
        return {
            **predictions,
            'confidence': confidence,
            'stress_class_names': predicted_classes
        }
    
    def save(self, filepath: str) -> None:
        """Save combined model to disk."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        classifier_path = filepath.parent / f"{filepath.stem}_classifier.joblib"
        regressor_path = filepath.parent / f"{filepath.stem}_regressor.joblib"
        
        self.classifier.save(classifier_path)
        self.regressor.save(regressor_path)
        
        # Save metadata
        metadata = {
            'classifier_path': str(classifier_path),
            'regressor_path': str(regressor_path),
            'is_fitted': self.is_fitted
        }
        joblib.dump(metadata, filepath)
        
        logger.info(f"Saved combined model to {filepath}")
    
    @classmethod
    def load(cls, filepath: str) -> 'CombinedStressModel':
        """Load combined model from disk."""
        metadata = joblib.load(filepath)
        
        classifier = StressClassifier.load(metadata['classifier_path'])
        regressor = StressRegressor.load(metadata['regressor_path'])
        
        instance = cls(classifier, regressor)
        instance.is_fitted = metadata['is_fitted']
        
        logger.info(f"Loaded combined model from {filepath}")
        return instance
