from backend.core.phenotyping import PhenotypeMetrics, PhenotypingModule


def test_to_dict_keeps_glcm_metrics_only_under_texture_analysis():
    module = PhenotypingModule({"phenotyping": {}})
    metrics = PhenotypeMetrics(
        azolla_area_pixels=100.0,
        azolla_area_m2=0.01,
        coverage_percent=25.0,
        water_surface_percent=75.0,
        agi_index=0.1,
        saci_index=0.2,
        chlorophyll_index=1.5,
        stress_browning_percent=0.0,
        stress_yellowing_percent=0.0,
        stress_score=0.0,
        density_low_percent=10.0,
        density_medium_percent=20.0,
        density_high_percent=70.0,
        texture_contrast=1.1,
        texture_homogeneity=0.8,
        texture_energy=0.5,
        texture_correlation=0.3,
        fresh_biomass_g_m2=100.0,
        dry_biomass_g_m2=8.0,
        protein_content_percent=27.0,
        biomass_calibration={},
        growth_rate_percent_day=None,
        doubling_time_days=None,
        max_coverage_percent=25.0,
        errors=[],
    )

    payload = module.to_dict(metrics)

    assert payload["doku_analizi"] == {
        "contrast": 1.1,
        "homogeneity": 0.8,
        "energy": 0.5,
        "correlation": 0.3,
    }
    color_keys = set(payload["renk_indeksleri"].keys())
    assert color_keys == {"agi_index", "saci_index", "chlorophyll_index"}
    assert color_keys.isdisjoint({"contrast", "homogeneity", "energy", "correlation"})
