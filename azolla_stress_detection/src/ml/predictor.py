"""
Stress prediction interface for Azolla images.
"""

import numpy as np
from typing import Dict, List, Optional, Union
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class StressPredictor:
    """
    Unified interface for stress prediction from images.
    
    Usage:
        predictor = StressPredictor.load('models/stress_model.joblib')
        result = predictor.predict_from_image('path/to/image.png')
    """
    
    def __init__(self, model=None, preprocessor=None):
        """Initialize predictor."""
        self.model = model
        self.preprocessor = preprocessor
        self.is_loaded = False
    
    @classmethod
    def load(cls, model_path: str) -> 'StressPredictor':
        """Load predictor from saved model."""
        import joblib
        from .models import CombinedStressModel
        
        instance = cls()
        instance.model = CombinedStressModel.load(model_path)
        instance.is_loaded = True
        
        logger.info(f"Loaded predictor from {model_path}")
        return instance
    
    def predict(self, features: Union[Dict, np.ndarray]) -> Dict:
        """
        Predict stress from features.
        
        Args:
            features: Feature dict or array
            
        Returns:
            Prediction dictionary
        """
        if not self.is_loaded:
            raise ValueError("Model not loaded")
        
        if isinstance(features, dict):
            # Convert dict to array using expected feature order
            feature_names = self.model.classifier.feature_names
            X = np.array([[features.get(f, 0) for f in feature_names]])
        else:
            X = features.reshape(1, -1)
        
        predictions = self.model.predict_with_confidence(X)
        
        # Format output
        result = {
            'stress_score': float(predictions['stress_proba'][0][2]),  # Probability of severe
            'stress_class': predictions['stress_class_names'][0],
            'confidence': float(predictions['confidence'][0]),
            'rgr_deviation': float(predictions['rgr_deviation'][0]),
            'all_probabilities': {
                'early': float(predictions['stress_proba'][0][0]),
                'moderate': float(predictions['stress_proba'][0][1]),
                'severe': float(predictions['stress_proba'][0][2])
            }
        }
        
        return result
    
    def predict_from_image(self, image_path: str, pipeline=None) -> Dict:
        """
        Predict stress directly from an image.
        
        Args:
            image_path: Path to image
            pipeline: ImageProcessingPipeline (optional, creates new if None)
            
        Returns:
            Prediction dictionary
        """
        if pipeline is None:
            from ..cv import ImageProcessingPipeline
            pipeline = ImageProcessingPipeline()
        
        # Process image
        result = pipeline.process_image(image_path)
        
        # Predict
        return self.predict(result.features)
