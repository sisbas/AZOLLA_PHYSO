import numpy as np

from azolla_stress_detection.src.cv.normalization import normalize_by_distance


def test_distance_normalization_zoom_in_for_far_capture():
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    image[40:60, 40:60] = 255

    normalized, scale = normalize_by_distance(
        image,
        capture_distance_cm=40.0,
        target_distance_cm=20.0,
    )

    assert normalized.shape == image.shape
    assert scale > 1.0
    assert normalized.sum() > image.sum()


def test_distance_normalization_zoom_out_for_near_capture():
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    image[30:70, 30:70] = 255

    normalized, scale = normalize_by_distance(
        image,
        capture_distance_cm=10.0,
        target_distance_cm=20.0,
    )

    assert normalized.shape == image.shape
    assert scale < 1.0
    assert normalized.sum() < image.sum()
