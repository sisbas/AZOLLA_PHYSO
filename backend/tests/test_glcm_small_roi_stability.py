import numpy as np
import cv2
from skimage.feature import graycomatrix, graycoprops

from backend.core.phenotyping import PhenotypingModule


def _legacy_glcm(img: np.ndarray, mask: np.ndarray):
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    gray_masked = gray.copy()
    gray_masked[~mask] = 0
    glcm = graycomatrix(gray_masked, distances=[5], angles=[0], levels=256, symmetric=True, normed=True)
    return {
        "contrast": float(graycoprops(glcm, "contrast")[0, 0]),
        "homogeneity": float(graycoprops(glcm, "homogeneity")[0, 0]),
        "energy": float(graycoprops(glcm, "energy")[0, 0]),
        "correlation": float(graycoprops(glcm, "correlation")[0, 0]),
    }


def test_small_roi_returns_none_with_warning_and_old_method_deviates():
    module = PhenotypingModule({"phenotyping": {"glcm_min_pixels": 25}})

    h, w = 64, 64
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = [50, 130, 60]
    img[30:34, 30:34] = [180, 170, 80]

    small_mask = np.zeros((h, w), dtype=bool)
    small_mask[30:34, 30:34] = True  # 16 px < 25

    legacy_metrics = _legacy_glcm(img, small_mask)
    new_metrics, warnings = module.calculate_glcm_features(img, small_mask)

    assert any(w["step"] == "texture_glcm" for w in warnings)
    assert new_metrics == {
        "contrast": None,
        "homogeneity": None,
        "energy": None,
        "correlation": None,
    }

    # Eski yöntem küçük ROI'de 0 dolgulu çevrenin etkisiyle yapay bir metrik üretir.
    assert legacy_metrics["energy"] < 1.0
    assert legacy_metrics["contrast"] >= 0.0
