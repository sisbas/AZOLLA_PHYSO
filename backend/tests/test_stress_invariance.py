import numpy as np

from backend.core.phenotyping import PhenotypingModule


def _build_scene(brightness: float = 1.0, contrast: float = 1.0):
    h, w = 120, 120
    img = np.zeros((h, w, 3), dtype=np.uint8)
    # Aynı biyolojik durum: baskın yeşil + hafif kahverengi/sarı stres karışımı
    img[:] = [55, 120, 60]
    img[20:60, 20:60] = [125, 95, 45]   # brown-ish
    img[65:100, 65:110] = [165, 165, 70]  # yellow-ish

    img_f = img.astype(np.float32)
    img_f = ((img_f - 127.5) * contrast) + 127.5
    img_f = img_f * brightness
    img_f = np.clip(img_f, 0, 255).astype(np.uint8)

    mask = np.ones((h, w), dtype=np.uint8)
    return img_f, mask


def _stress_score(module: PhenotypingModule, brightness: float, contrast: float) -> float:
    rgb, mask = _build_scene(brightness=brightness, contrast=contrast)
    metrics = module.process(rgb, mask)
    return metrics.stress_score


def test_stress_score_is_robust_to_brightness_variations():
    module = PhenotypingModule({"phenotyping": {}})

    base = _stress_score(module, brightness=1.0, contrast=1.0)
    darker = _stress_score(module, brightness=0.75, contrast=1.0)
    brighter = _stress_score(module, brightness=1.25, contrast=1.0)

    assert abs(base - darker) <= 8.0
    assert abs(base - brighter) <= 8.0


def test_stress_score_is_robust_to_contrast_variations():
    module = PhenotypingModule({"phenotyping": {}})

    base = _stress_score(module, brightness=1.0, contrast=1.0)
    low_contrast = _stress_score(module, brightness=1.0, contrast=0.8)
    high_contrast = _stress_score(module, brightness=1.0, contrast=1.2)

    assert abs(base - low_contrast) <= 8.0
    assert abs(base - high_contrast) <= 8.0
