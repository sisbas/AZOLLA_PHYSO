from pathlib import Path

import cv2

from backend.core.phenotyping import PhenotypingModule

FIXTURES = Path(__file__).parent / "fixtures"


def _estimate(module: PhenotypingModule):
    image = cv2.imread(str(FIXTURES / "regression_frame.png"))
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    mask = (gray > 0).astype("uint8")
    metrics = module.process(rgb, mask)
    return metrics.fresh_biomass_g_m2, module.to_dict(metrics)


def test_regression_fails_when_model_version_shift_exceeds_threshold():
    m1 = PhenotypingModule({"phenotyping": {"biomass_calibration_artifact": str(FIXTURES / "calibration_v1.json")}})
    m2 = PhenotypingModule({"phenotyping": {"biomass_calibration_artifact": str(FIXTURES / "calibration_v2.json")}})

    fresh_v1, _ = _estimate(m1)
    fresh_v2, _ = _estimate(m2)

    delta = abs(fresh_v2 - fresh_v1)
    assert delta <= 150.0, f"Model drift too high for same frame: {delta:.2f} g/m²"


def test_low_confidence_reason_exposed_outside_calibration_range():
    module = PhenotypingModule({"phenotyping": {"biomass_calibration_artifact": str(FIXTURES / "calibration_v1.json")}})
    result = module.estimate_biomass(coverage_percent=95.0, chlorophyll_index=4.0)

    assert result["confidence_score"] < 1.0
    assert result["low_confidence_reason"] is not None
    assert "outside_calibration_range" in result["low_confidence_reason"]


def test_calibration_metadata_fields_are_present():
    module = PhenotypingModule({"phenotyping": {"biomass_calibration_artifact": str(FIXTURES / "calibration_v1.json")}})
    _, payload = _estimate(module)

    calibration = payload["biyokutle_tahmini"]["calibration"]
    for field in ["dataset_id", "calibration_date", "sample_count", "mae", "rmse"]:
        assert field in calibration
