"""
Unit tests for Azolla stress detection ML models.

Tests for:
- StressClassifier: Classification model
- StressRegressor: Regression model  
- CombinedStressModel: Combined classification and regression
"""

import pytest
import numpy as np
import tempfile
from pathlib import Path
import shutil


class TestStressClassifier:
    """Tests for StressClassifier class."""
    
    @pytest.fixture
    def sample_data(self):
        """Create sample training data."""
        np.random.seed(42)
        
        # Create synthetic feature matrix
        n_samples = 100
        n_features = 10
        
        X = np.random.randn(n_samples, n_features)
        y = np.random.randint(0, 3, n_samples)  # 3 classes: 0, 1, 2
        
        feature_names = [f'feature_{i}' for i in range(n_features)]
        
        return X, y, feature_names
    
    def test_init_random_forest(self):
        """Test initialization with Random Forest."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        clf = StressClassifier(model_type='random_forest', n_estimators=10)
        
        assert clf.model_type == 'random_forest'
        assert clf.n_estimators == 10
        assert clf.is_fitted is False
    
    def test_init_xgboost(self):
        """Test initialization with XGBoost."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        clf = StressClassifier(model_type='xgboost', n_estimators=10)
        
        # Should fallback to RF if XGBoost not available
        assert clf.model_type in ['xgboost', 'random_forest']
        assert clf.n_estimators == 10
    
    def test_fit(self, sample_data):
        """Test model fitting."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        X, y, feature_names = sample_data
        clf = StressClassifier(model_type='random_forest', n_estimators=10)
        
        clf.fit(X, y, feature_names)
        
        assert clf.is_fitted is True
        assert len(clf.feature_names) == len(feature_names)
    
    def test_predict(self, sample_data):
        """Test predictions."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        X, y, feature_names = sample_data
        clf = StressClassifier(model_type='random_forest', n_estimators=10)
        clf.fit(X, y, feature_names)
        
        predictions = clf.predict(X[:5])
        
        assert len(predictions) == 5
        assert all(pred in [0, 1, 2] for pred in predictions)
    
    def test_predict_proba(self, sample_data):
        """Test probability predictions."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        X, y, feature_names = sample_data
        clf = StressClassifier(model_type='random_forest', n_estimators=10)
        clf.fit(X, y, feature_names)
        
        probas = clf.predict_proba(X[:5])
        
        assert probas.shape == (5, 3)  # 5 samples, 3 classes
        assert np.allclose(probas.sum(axis=1), 1.0)
    
    def test_get_feature_importance(self, sample_data):
        """Test feature importance extraction."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        X, y, feature_names = sample_data
        clf = StressClassifier(model_type='random_forest', n_estimators=10)
        clf.fit(X, y, feature_names)
        
        importance = clf.get_feature_importance()
        
        assert len(importance) == len(feature_names)
        assert all(v >= 0 for v in importance.values())
        assert np.isclose(sum(importance.values()), 1.0)
    
    def test_save_and_load(self, sample_data):
        """Test model saving and loading."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        X, y, feature_names = sample_data
        clf = StressClassifier(model_type='random_forest', n_estimators=10)
        clf.fit(X, y, feature_names)
        
        # Get original predictions
        original_pred = clf.predict(X[:5])
        
        # Save model
        temp_dir = tempfile.mkdtemp()
        model_path = Path(temp_dir) / 'classifier.joblib'
        
        try:
            clf.save(str(model_path))
            assert model_path.exists()
            
            # Load model
            loaded_clf = StressClassifier.load(str(model_path))
            
            # Verify loaded model
            assert loaded_clf.is_fitted is True
            assert loaded_clf.model_type == 'random_forest'
            
            # Verify predictions match
            loaded_pred = loaded_clf.predict(X[:5])
            assert np.array_equal(original_pred, loaded_pred)
        finally:
            shutil.rmtree(temp_dir)
    
    def test_predict_without_fit(self):
        """Test that predict raises error without fitting."""
        from azolla_stress_detection.src.ml.models import StressClassifier
        
        clf = StressClassifier(model_type='random_forest', n_estimators=10)
        X = np.random.randn(5, 10)
        
        with pytest.raises(ValueError, match="not fitted"):
            clf.predict(X)


class TestStressRegressor:
    """Tests for StressRegressor class."""
    
    @pytest.fixture
    def sample_data(self):
        """Create sample training data."""
        np.random.seed(42)
        
        # Create synthetic feature matrix
        n_samples = 100
        n_features = 10
        
        X = np.random.randn(n_samples, n_features)
        y_reg = np.random.randn(n_samples, 2)  # 2 targets
        
        feature_names = [f'feature_{i}' for i in range(n_features)]
        
        return X, y_reg, feature_names
    
    def test_init_random_forest(self):
        """Test initialization with Random Forest."""
        from azolla_stress_detection.src.ml.models import StressRegressor
        
        reg = StressRegressor(model_type='random_forest', n_estimators=10)
        
        assert reg.model_type == 'random_forest'
        assert reg.n_estimators == 10
        assert reg.is_fitted is False
    
    def test_fit(self, sample_data):
        """Test model fitting."""
        from azolla_stress_detection.src.ml.models import StressRegressor
        
        X, y, feature_names = sample_data
        reg = StressRegressor(model_type='random_forest', n_estimators=10)
        
        reg.fit(X, y, feature_names)
        
        assert reg.is_fitted is True
        assert len(reg.feature_names) == len(feature_names)
    
    def test_predict(self, sample_data):
        """Test predictions."""
        from azolla_stress_detection.src.ml.models import StressRegressor
        
        X, y, feature_names = sample_data
        reg = StressRegressor(model_type='random_forest', n_estimators=10)
        reg.fit(X, y, feature_names)
        
        predictions = reg.predict(X[:5])
        
        assert predictions.shape == (5, 2)  # 5 samples, 2 targets
    
    def test_fit_1d_target(self, sample_data):
        """Test fitting with 1D target array."""
        from azolla_stress_detection.src.ml.models import StressRegressor
        
        X, y, feature_names = sample_data
        y_1d = y[:, 0]  # Use only first target
        
        reg = StressRegressor(model_type='random_forest', n_estimators=10)
        reg.fit(X, y_1d, feature_names)
        
        assert reg.is_fitted is True
        
        predictions = reg.predict(X[:5])
        assert len(predictions.shape) == 2
    
    def test_save_and_load(self, sample_data):
        """Test model saving and loading."""
        from azolla_stress_detection.src.ml.models import StressRegressor
        
        X, y, feature_names = sample_data
        reg = StressRegressor(model_type='random_forest', n_estimators=10)
        reg.fit(X, y, feature_names)
        
        # Get original predictions
        original_pred = reg.predict(X[:5])
        
        # Save model
        temp_dir = tempfile.mkdtemp()
        model_path = Path(temp_dir) / 'regressor.joblib'
        
        try:
            reg.save(str(model_path))
            assert model_path.exists()
            
            # Load model
            loaded_reg = StressRegressor.load(str(model_path))
            
            # Verify loaded model
            assert loaded_reg.is_fitted is True
            
            # Verify predictions match
            loaded_pred = loaded_reg.predict(X[:5])
            assert np.allclose(original_pred, loaded_pred)
        finally:
            shutil.rmtree(temp_dir)


class TestCombinedStressModel:
    """Tests for CombinedStressModel class."""
    
    @pytest.fixture
    def sample_data(self):
        """Create sample training data."""
        np.random.seed(42)
        
        n_samples = 100
        n_features = 10
        
        X = np.random.randn(n_samples, n_features)
        y_class = np.random.randint(0, 3, n_samples)
        y_reg = np.random.randn(n_samples, 2)
        
        feature_names = [f'feature_{i}' for i in range(n_features)]
        
        return X, y_class, y_reg, feature_names
    
    def test_init(self):
        """Test initialization."""
        from azolla_stress_detection.src.ml.models import CombinedStressModel, StressClassifier, StressRegressor
        
        model = CombinedStressModel()
        
        assert isinstance(model.classifier, StressClassifier)
        assert isinstance(model.regressor, StressRegressor)
        assert model.is_fitted is False
    
    def test_fit(self, sample_data):
        """Test fitting combined model."""
        from azolla_stress_detection.src.ml.models import CombinedStressModel
        
        X, y_class, y_reg, feature_names = sample_data
        model = CombinedStressModel()
        
        model.fit(X, y_class, y_reg, feature_names)
        
        assert model.is_fitted is True
        assert model.classifier.is_fitted is True
        assert model.regressor.is_fitted is True
    
    def test_predict(self, sample_data):
        """Test predictions."""
        from azolla_stress_detection.src.ml.models import CombinedStressModel
        
        X, y_class, y_reg, feature_names = sample_data
        model = CombinedStressModel()
        model.fit(X, y_class, y_reg, feature_names)
        
        predictions = model.predict(X[:5])
        
        assert 'stress_class' in predictions
        assert 'stress_proba' in predictions
        assert 'rgr_deviation' in predictions
        assert 'chlorophyll_loss' in predictions
        
        assert len(predictions['stress_class']) == 5
        assert predictions['stress_proba'].shape == (5, 3)
    
    def test_predict_with_confidence(self, sample_data):
        """Test predictions with confidence scores."""
        from azolla_stress_detection.src.ml.models import CombinedStressModel
        
        X, y_class, y_reg, feature_names = sample_data
        model = CombinedStressModel()
        model.fit(X, y_class, y_reg, feature_names)
        
        results = model.predict_with_confidence(X[:5])
        
        assert 'confidence' in results
        assert 'stress_class_names' in results
        assert len(results['confidence']) == 5
        assert all(0 <= c <= 1 for c in results['confidence'])
        assert all(name in ['Early', 'Moderate', 'Severe'] for name in results['stress_class_names'])
    
    def test_save_and_load(self, sample_data):
        """Test saving and loading combined model."""
        from azolla_stress_detection.src.ml.models import CombinedStressModel
        
        X, y_class, y_reg, feature_names = sample_data
        model = CombinedStressModel()
        model.fit(X, y_class, y_reg, feature_names)
        
        # Get original predictions
        original_pred = model.predict(X[:5])
        
        # Save model
        temp_dir = tempfile.mkdtemp()
        model_path = Path(temp_dir) / 'combined_model.joblib'
        
        try:
            model.save(str(model_path))
            assert model_path.exists()
            
            # Load model
            loaded_model = CombinedStressModel.load(str(model_path))
            
            # Verify loaded model
            assert loaded_model.is_fitted is True
            
            # Verify predictions match
            loaded_pred = loaded_model.predict(X[:5])
            assert np.array_equal(original_pred['stress_class'], loaded_pred['stress_class'])
            assert np.allclose(original_pred['rgr_deviation'], loaded_pred['rgr_deviation'])
        finally:
            shutil.rmtree(temp_dir)
    
    def test_predict_without_fit(self):
        """Test that predict raises error without fitting."""
        from azolla_stress_detection.src.ml.models import CombinedStressModel
        
        model = CombinedStressModel()
        X = np.random.randn(5, 10)
        
        with pytest.raises(ValueError, match="not fitted"):
            model.predict(X)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
