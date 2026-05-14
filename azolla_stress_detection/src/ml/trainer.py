"""
Model training pipeline for Azolla stress detection.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import logging
from pathlib import Path
import json

from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

from .models import StressClassifier, StressRegressor, CombinedStressModel

logger = logging.getLogger(__name__)


class ModelTrainer:
    """
    Training pipeline for stress detection models.
    
    Handles:
    - Data preparation
    - Cross-validation
    - Model training
    - Evaluation
    - Model saving
    """
    
    def __init__(self, config: Dict = None):
        """
        Initialize trainer.
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or {}
        self.training_history = []
        self.best_model = None
        self.evaluation_results = {}
    
    def prepare_data(
        self,
        features_df: pd.DataFrame,
        excel_df: pd.DataFrame,
        target_col: str = 'stress_class'
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[str]]:
        """
        Prepare training data from features and Excel data.
        
        Args:
            features_df: DataFrame with image-derived features
            excel_df: DataFrame with Excel measurements
            target_col: Target column name
            
        Returns:
            Tuple of (X, y_class, y_reg, feature_names)
        """
        # Merge datasets
        if 'treatment' in features_df.columns and 'group_code' in excel_df.columns:
            merged = pd.merge(
                features_df,
                excel_df,
                left_on='treatment',
                right_on='group_code',
                how='left'
            )
        else:
            merged = pd.concat([features_df.reset_index(drop=True), 
                               excel_df.reset_index(drop=True)], axis=1)
        
        # Handle missing values
        numeric_cols = merged.select_dtypes(include=[np.number]).columns
        merged[numeric_cols] = merged[numeric_cols].fillna(merged[numeric_cols].median())
        
        # Create stress classes if not present
        if target_col not in merged.columns and 'rgr_deviation' in merged.columns:
            def classify_stress(deviation):
                if pd.isna(deviation):
                    return 1
                if deviation > -0.1:
                    return 0
                elif deviation > -0.3:
                    return 1
                else:
                    return 2
            
            merged['stress_class'] = merged['rgr_deviation'].apply(classify_stress)
        
        # Select feature columns (exclude metadata and targets)
        exclude_cols = ['treatment', 'replicate', 'day', 'filepath', 'group_code',
                       'stress_class', 'rgr', 'rgr_deviation', 'chlorophyll_a',
                       'chlorophyll_b', 'total_chlorophyll', 'carotenoids']
        feature_cols = [c for c in merged.select_dtypes(include=[np.number]).columns 
                       if c not in exclude_cols]
        
        X = merged[feature_cols].values
        y_class = merged[target_col].values if target_col in merged.columns else np.zeros(len(merged))
        
        # Regression targets
        reg_targets = ['rgr_deviation', 'total_chlorophyll']
        existing_reg = [t for t in reg_targets if t in merged.columns]
        
        if existing_reg:
            y_reg = merged[existing_reg].values
        else:
            y_reg = np.zeros((len(merged), 1))
        
        logger.info(f"Prepared data: X shape={X.shape}, y_class shape={y_class.shape}")
        return X, y_class, y_reg, feature_cols
    
    def train(
        self,
        X: np.ndarray,
        y_class: np.ndarray,
        y_reg: np.ndarray,
        feature_names: List[str],
        model_type: str = 'xgboost'
    ) -> CombinedStressModel:
        """
        Train combined classification and regression model.
        
        Args:
            X: Feature matrix
            y_class: Classification targets
            y_reg: Regression targets
            feature_names: List of feature names
            model_type: 'xgboost' or 'random_forest'
            
        Returns:
            Trained CombinedStressModel
        """
        logger.info(f"Training {model_type} model with {X.shape[0]} samples")
        
        # Split data
        from sklearn.model_selection import train_test_split
        X_train, X_test, y_class_train, y_class_test = train_test_split(
            X, y_class, test_size=0.2, random_state=42, stratify=y_class
        )
        
        _, _, y_reg_train, y_reg_test = train_test_split(
            X, y_reg, test_size=0.2, random_state=42
        )
        
        # Create and train model
        classifier = StressClassifier(model_type=model_type)
        regressor = StressRegressor(model_type=model_type)
        
        classifier.fit(X_train, y_class_train, feature_names)
        regressor.fit(X_train, y_reg_train, feature_names)
        
        model = CombinedStressModel(classifier, regressor)
        model.is_fitted = True
        
        # Evaluate
        self.evaluate(model, X_test, y_class_test, y_reg_test)
        
        self.best_model = model
        logger.info("Training complete")
        return model
    
    def evaluate(
        self,
        model: CombinedStressModel,
        X_test: np.ndarray,
        y_class_test: np.ndarray,
        y_reg_test: np.ndarray
    ) -> Dict:
        """
        Evaluate model performance.
        
        Args:
            model: Trained model
            X_test: Test features
            y_class_test: True classification labels
            y_reg_test: True regression targets
            
        Returns:
            Dictionary with evaluation metrics
        """
        predictions = model.predict(X_test)
        
        # Classification metrics
        class_metrics = {
            'accuracy': float(accuracy_score(y_class_test, predictions['stress_class'])),
            'report': classification_report(
                y_class_test, 
                predictions['stress_class'],
                target_names=['Early', 'Moderate', 'Severe'],
                output_dict=True
            ),
            'confusion_matrix': confusion_matrix(
                y_class_test, 
                predictions['stress_class']
            ).tolist()
        }
        
        # Regression metrics
        reg_metrics = {}
        if len(y_reg_test.shape) == 1 or y_reg_test.shape[1] == 1:
            y_pred = predictions['rgr_deviation'].flatten()
            y_true = y_reg_test.flatten() if len(y_reg_test.shape) > 1 else y_reg_test
            
            reg_metrics['rgr_deviation'] = {
                'mse': float(mean_squared_error(y_true, y_pred)),
                'mae': float(mean_absolute_error(y_true, y_pred)),
                'r2': float(r2_score(y_true, y_pred))
            }
        
        self.evaluation_results = {
            'classification': class_metrics,
            'regression': reg_metrics
        }
        
        logger.info(f"Evaluation complete. Accuracy: {class_metrics['accuracy']:.3f}")
        return self.evaluation_results
    
    def save_model(self, model: CombinedStressModel, output_dir: str) -> str:
        """
        Save trained model.
        
        Args:
            model: Trained model
            output_dir: Output directory
            
        Returns:
            Path to saved model
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        model_path = output_dir / 'stress_model.joblib'
        model.save(model_path)
        
        # Save evaluation results
        eval_path = output_dir / 'evaluation_results.json'
        with open(eval_path, 'w') as f:
            json.dump(self.evaluation_results, f, indent=2, default=str)
        
        # Save config
        config_path = output_dir / 'training_config.json'
        with open(config_path, 'w') as f:
            json.dump(self.config, f, indent=2)
        
        logger.info(f"Saved model to {output_dir}")
        return str(model_path)
    
    def cross_validate(
        self,
        X: np.ndarray,
        y: np.ndarray,
        n_folds: int = 5,
        model_type: str = 'xgboost'
    ) -> Dict:
        """
        Perform cross-validation.
        
        Args:
            X: Feature matrix
            y: Target labels
            n_folds: Number of folds
            model_type: Model type
            
        Returns:
            Cross-validation results
        """
        from sklearn.model_selection import cross_val_score
        
        if model_type == 'xgboost':
            try:
                import xgboost as xgb
                model = xgb.XGBClassifier(
                    n_estimators=200,
                    max_depth=6,
                    random_state=42,
                    use_label_encoder=False,
                    eval_metric='mlogloss'
                )
            except ImportError:
                from sklearn.ensemble import RandomForestClassifier
                model = RandomForestClassifier(
                    n_estimators=200,
                    max_depth=6,
                    random_state=42,
                    class_weight='balanced'
                )
        else:
            from sklearn.ensemble import RandomForestClassifier
            model = RandomForestClassifier(
                n_estimators=200,
                max_depth=6,
                random_state=42,
                class_weight='balanced'
            )
        
        scores = cross_val_score(model, X, y, cv=n_folds, scoring='accuracy')
        
        results = {
            'mean_accuracy': float(scores.mean()),
            'std_accuracy': float(scores.std()),
            'fold_scores': scores.tolist()
        }
        
        logger.info(f"Cross-validation: {scores.mean():.3f} (+/- {scores.std() * 2:.3f})")
        return results
