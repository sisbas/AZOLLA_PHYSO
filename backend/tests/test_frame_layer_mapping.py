from backend.phenotyping_service import AzollaPhenotypingService


def test_frame_layer_maps_and_derives_rg_ratio_from_raw_metrics():
    raw_result = {
        "renk_indeksleri": {
            "chlorophyll_index": 1.23,
        },
        "biyokutle_tahmini": {
            "fresh_biomass_g_m2": 456.7,
        },
        "metrics": {
            "mean_r": 120.0,
            "mean_g": 80.0,
        },
    }

    frame = AzollaPhenotypingService.build_frame_metrics_layer(raw_result)

    assert frame["phenotyping"]["chlorophyll_index"] == 1.23
    assert frame["phenotyping"]["fresh_biomass_g_m2"] == 456.7
    assert frame["metrics"]["rg_ratio"] == 1.5


def test_frame_layer_writes_explicit_null_for_invalid_values():
    raw_result = {
        "renk_indeksleri": {"chlorophyll_index": float("nan")},
        "biyokutle_tahmini": {"fresh_biomass_g_m2": None},
        "metrics": {"mean_r": 10.0, "mean_g": 0.0},
    }

    frame = AzollaPhenotypingService.build_frame_metrics_layer(raw_result)

    assert frame["phenotyping"]["chlorophyll_index"] is None
    assert frame["phenotyping"]["fresh_biomass_g_m2"] is None
    assert frame["metrics"]["rg_ratio"] is None
