"""
Unit tests for Azolla stress detection computer vision features.

Tests for:
- Color indices computation
- Color space features
- Texture features (GLCM)
- Morphological features
- Feature extraction pipeline
"""

import pytest
import numpy as np
from pathlib import Path


class TestColorIndices:
    """Tests for color index computations."""
    
    @pytest.fixture
    def sample_image(self):
        """Create a sample RGB image for testing."""
        # Create simple green-dominant image
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        image[:, :, 0] = 50  # R
        image[:, :, 1] = 150  # G (dominant)
        image[:, :, 2] = 50  # B
        
        return image
    
    @pytest.fixture
    def sample_mask(self):
        """Create a sample binary mask."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[25:75, 25:75] = 255  # Square in center
        
        return mask
    
    def test_compute_color_indices(self, sample_image):
        """Test computing all color indices."""
        from azolla_stress_detection.src.cv.features import compute_color_indices
        
        indices = compute_color_indices(sample_image)
        
        assert isinstance(indices, dict)
        assert 'ExG' in indices
        assert 'VARI' in indices
        assert 'GLI' in indices
        assert 'ExR' in indices
        assert 'YI' in indices
        assert 'GMI' in indices
        assert 'BYR' in indices
        
        # ExG should be positive for green-dominant image
        assert indices['ExG'] > 0
    
    def test_compute_color_indices_with_mask(self, sample_image, sample_mask):
        """Test computing color indices with mask."""
        from azolla_stress_detection.src.cv.features import compute_color_indices
        
        indices_masked = compute_color_indices(sample_image, sample_mask)
        indices_full = compute_color_indices(sample_image)
        
        # Should still have all indices
        assert len(indices_masked) == len(indices_full)
    
    def test_exg_for_green_image(self):
        """Test Excess Green index for clearly green image."""
        from azolla_stress_detection.src.cv.features import compute_color_indices
        
        # Very green image
        green_image = np.zeros((50, 50, 3), dtype=np.uint8)
        green_image[:, :, 0] = 30  # Low R
        green_image[:, :, 1] = 200  # High G
        green_image[:, :, 2] = 30  # Low B
        
        indices = compute_color_indices(green_image)
        
        # ExG = 2*G - R - B, should be high positive
        assert indices['ExG'] > 0.5
    
    def test_exg_for_yellow_image(self):
        """Test Excess Green index for yellowing (stressed) image."""
        from azolla_stress_detection.src.cv.features import compute_color_indices
        
        # Yellow image (high R and G, low B)
        yellow_image = np.zeros((50, 50, 3), dtype=np.uint8)
        yellow_image[:, :, 0] = 180  # High R
        yellow_image[:, :, 1] = 180  # High G
        yellow_image[:, :, 2] = 30  # Low B
        
        indices = compute_color_indices(yellow_image)
        
        # ExG should be lower than for green image
        green_image = np.zeros((50, 50, 3), dtype=np.uint8)
        green_image[:, :, 0] = 30
        green_image[:, :, 1] = 200
        green_image[:, :, 2] = 30
        green_indices = compute_color_indices(green_image)
        
        assert indices['ExG'] < green_indices['ExG']


class TestColorSpaceFeatures:
    """Tests for color space feature computations."""
    
    @pytest.fixture
    def sample_image(self):
        """Create a sample RGB image."""
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        image[:, :, 0] = 100  # R
        image[:, :, 1] = 150  # G
        image[:, :, 2] = 80  # B
        
        return image
    
    def test_compute_lab_features(self, sample_image):
        """Test LAB color space features."""
        from azolla_stress_detection.src.cv.features import compute_color_space_features
        
        features = compute_color_space_features(sample_image, spaces=['LAB'])
        
        assert 'L_mean' in features
        assert 'L_std' in features
        assert 'a_mean' in features
        assert 'a_std' in features
        assert 'b_mean' in features
        assert 'b_std' in features
    
    def test_compute_hsv_features(self, sample_image):
        """Test HSV color space features."""
        from azolla_stress_detection.src.cv.features import compute_color_space_features
        
        features = compute_color_space_features(sample_image, spaces=['HSV'])
        
        assert 'H_mean' in features
        assert 'H_std' in features
        assert 'S_mean' in features
        assert 'S_std' in features
        assert 'V_mean' in features
        assert 'V_std' in features
    
    def test_compute_both_spaces(self, sample_image):
        """Test computing both LAB and HSV features."""
        from azolla_stress_detection.src.cv.features import compute_color_space_features
        
        features = compute_color_space_features(sample_image, spaces=['LAB', 'HSV'])
        
        assert len(features) == 12  # 6 from each space
    
    def test_color_space_with_mask(self, sample_image):
        """Test color space features with mask."""
        from azolla_stress_detection.src.cv.features import compute_color_space_features
        
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[25:75, 25:75] = 255
        
        features = compute_color_space_features(sample_image, mask=mask, spaces=['LAB'])
        
        assert 'L_mean' in features


class TestTextureFeatures:
    """Tests for texture feature computations."""
    
    @pytest.fixture
    def smooth_image(self):
        """Create a smooth (low texture) image."""
        image = np.ones((100, 100, 3), dtype=np.uint8) * 128
        return image
    
    @pytest.fixture
    def textured_image(self):
        """Create a textured image with patterns."""
        np.random.seed(42)
        image = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        return image
    
    def test_compute_texture_features_smooth(self, smooth_image):
        """Test texture features on smooth image."""
        from azolla_stress_detection.src.cv.features import compute_texture_features
        
        features = compute_texture_features(smooth_image)
        
        assert 'contrast' in features
        assert 'homogeneity' in features
        assert 'energy' in features
        assert 'correlation' in features
        
        # Smooth image should have low contrast
        assert features['contrast'] < 1.0
    
    def test_compute_texture_features_textured(self, textured_image):
        """Test texture features on textured image."""
        from azolla_stress_detection.src.cv.features import compute_texture_features
        
        features = compute_texture_features(textured_image)
        
        # Textured image should have higher contrast than smooth
        smooth_image = np.ones((100, 100, 3), dtype=np.uint8) * 128
        smooth_features = compute_texture_features(smooth_image)
        
        assert features['contrast'] > smooth_features['contrast']
    
    def test_texture_with_mask(self, textured_image):
        """Test texture features with mask."""
        from azolla_stress_detection.src.cv.features import compute_texture_features
        
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[25:75, 25:75] = 255
        
        features = compute_texture_features(textured_image, mask=mask)
        
        assert 'contrast' in features
    
    def test_grayscale_input(self):
        """Test texture features with grayscale input."""
        from azolla_stress_detection.src.cv.features import compute_texture_features
        
        gray_image = np.random.randint(0, 255, (100, 100), dtype=np.uint8)
        features = compute_texture_features(gray_image)
        
        assert 'contrast' in features


class TestMorphologicalFeatures:
    """Tests for morphological feature computations."""
    
    def test_compute_morphological_features_square(self):
        """Test morphological features on square shape."""
        from azolla_stress_detection.src.cv.features import compute_morphological_features
        
        # Create square mask
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[25:75, 25:75] = 255
        
        features = compute_morphological_features(mask, (100, 100))
        
        assert 'area' in features
        assert 'perimeter' in features
        assert 'solidity' in features
        assert 'extent' in features
        assert 'circularity' in features
        
        # Area should be 50x50 = 2500
        assert features['area'] == 2500
        
        # Area ratio should be 2500/10000 = 0.25
        assert np.isclose(features['area_ratio'], 0.25)
    
    def test_compute_morphological_features_circle(self):
        """Test morphological features on circular shape."""
        from azolla_stress_detection.src.cv.features import compute_morphological_features
        import cv2
        
        # Create circular mask
        mask = np.zeros((100, 100), dtype=np.uint8)
        cv2.circle(mask, (50, 50), 30, 255, -1)
        
        features = compute_morphological_features(mask, (100, 100))
        
        # Circle should have high circularity (close to 1)
        assert features['circularity'] > 0.8
        
        # Solidity should be close to 1 for convex shape
        assert features['solidity'] > 0.9
    
    def test_empty_mask(self):
        """Test morphological features on empty mask."""
        from azolla_stress_detection.src.cv.features import compute_morphological_features
        
        mask = np.zeros((100, 100), dtype=np.uint8)
        
        features = compute_morphological_features(mask, (100, 100))
        
        assert features['area'] == 0.0
        assert features['area_ratio'] == 0.0
        assert features['perimeter'] == 0.0


class TestFeatureExtraction:
    """Tests for complete feature extraction pipeline."""
    
    @pytest.fixture
    def sample_image(self):
        """Create sample RGB image."""
        np.random.seed(42)
        image = np.random.randint(50, 200, (200, 200, 3), dtype=np.uint8)
        return image
    
    @pytest.fixture
    def sample_mask(self):
        """Create sample binary mask."""
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[50:150, 50:150] = 255
        return mask
    
    def test_extract_features(self, sample_image, sample_mask):
        """Test complete feature extraction."""
        from azolla_stress_detection.src.cv.features import extract_features
        
        features = extract_features(sample_image, sample_mask)
        
        # Should have many features from different categories
        assert len(features) > 10
        
        # Check presence of key features
        assert 'ExG' in features
        assert 'contrast' in features
        assert 'area' in features
    
    def test_extract_features_without_texture(self, sample_image, sample_mask):
        """Test feature extraction without texture features."""
        from azolla_stress_detection.src.cv.features import extract_features
        
        features = extract_features(sample_image, sample_mask, include_texture=False)
        
        # Should not have texture features
        assert 'contrast' not in features
        assert 'homogeneity' not in features
        
        # Should still have color indices
        assert 'ExG' in features
    
    def test_extract_features_without_color_space(self, sample_image, sample_mask):
        """Test feature extraction without color space features."""
        from azolla_stress_detection.src.cv.features import extract_features
        
        features = extract_features(sample_image, sample_mask, include_color_space=False)
        
        # Should not have LAB/HSV features
        assert 'L_mean' not in features
        assert 'H_mean' not in features
        
        # Should still have color indices
        assert 'ExG' in features
    
    def test_features_to_dataframe(self, sample_image, sample_mask):
        """Test converting features to DataFrame."""
        from azolla_stress_detection.src.cv.features import extract_features, features_to_dataframe
        
        features = extract_features(sample_image, sample_mask)
        
        df = features_to_dataframe([features])
        
        assert len(df) == 1
        assert 'ExG' in df.columns
        assert 'area' in df.columns
    
    def test_features_to_dataframe_with_metadata(self, sample_image, sample_mask):
        """Test converting features with metadata to DataFrame."""
        from azolla_stress_detection.src.cv.features import extract_features, features_to_dataframe
        
        features = extract_features(sample_image, sample_mask)
        metadata = [{'treatment': 'K', 'day': 0}]
        
        df = features_to_dataframe([features], metadata)
        
        assert 'treatment' in df.columns
        assert 'day' in df.columns
        assert df['treatment'].iloc[0] == 'K'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
