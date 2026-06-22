"""Centralized health/stress score formulas for phenotyping outputs.

The scores in this module are RGB-derived early-warning indices. They are
intended for consistent API reporting, not as biochemical proof of plant state.
Biochemical validation is required before biological conclusions are drawn.
"""

from typing import Any, Dict, Mapping, Optional

import numpy as np

EARLY_WARNING_NOTE = (
    "Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; "
    "biyokimyasal validasyon gerektirir."
)


def _metric_value(metrics: Optional[Mapping[str, Any]], key: str, default: Optional[float]) -> Optional[float]:
    if metrics is None or key not in metrics or metrics[key] is None:
        return default
    try:
        value = float(metrics[key])
    except (TypeError, ValueError):
        return default
    return value if np.isfinite(value) else default


def compute_health_stress_scores(
    metrics: Optional[Mapping[str, Any]] = None,
    *,
    agi_index: Optional[float] = None,
    saci_index: Optional[float] = None,
    chlorophyll_index: Optional[float] = None,
    browning_percent: Optional[float] = None,
    yellowing_percent: Optional[float] = None,
    growth_rate_percent_day: Optional[float] = None,
    robust_distribution_score: Optional[float] = None,
    browning_weight: float = 0.5,
    yellowing_weight: float = 0.3,
    distribution_weight: float = 0.2,
) -> Dict[str, Any]:
    """Compute the single authoritative phenotyping score set.

    Inputs are explicit keyword parameters and may also be supplied through
    ``metrics`` with matching names. Keyword arguments take precedence. The
    resulting ``stress_score`` is the canonical phenotyping early-warning score;
    ``health_score`` is its inverse plus optional RGB-index support signals.
    """

    agi_index = _metric_value(metrics, "agi_index", agi_index) or 0.0
    saci_index = _metric_value(metrics, "saci_index", saci_index) or 0.0
    chlorophyll_index = _metric_value(metrics, "chlorophyll_index", chlorophyll_index) or 0.0
    browning_percent = _metric_value(metrics, "browning_percent", browning_percent) or 0.0
    yellowing_percent = _metric_value(metrics, "yellowing_percent", yellowing_percent) or 0.0
    robust_distribution_score = _metric_value(metrics, "robust_distribution_score", robust_distribution_score) or 0.0
    growth_rate_percent_day = _metric_value(metrics, "growth_rate_percent_day", growth_rate_percent_day)

    stress_score = float(np.clip(
        browning_percent * browning_weight
        + yellowing_percent * yellowing_weight
        + robust_distribution_score * distribution_weight,
        0.0,
        100.0,
    ))

    agi_health = (float(np.clip(agi_index, -1.0, 1.0)) + 1.0) * 50.0
    saci_health = (float(np.clip(saci_index, -1.0, 1.0)) + 1.0) * 50.0
    chlorophyll_health = float(np.clip(chlorophyll_index / 10.0, 0.0, 1.0)) * 100.0
    stress_inverse = 100.0 - stress_score

    growth_bonus = 0.0
    if growth_rate_percent_day is not None:
        growth_bonus = float(np.clip(growth_rate_percent_day, -20.0, 20.0)) * 0.25

    health_score = float(np.clip(
        0.55 * stress_inverse
        + 0.20 * chlorophyll_health
        + 0.15 * agi_health
        + 0.10 * saci_health
        + growth_bonus,
        0.0,
        100.0,
    ))

    return {
        "stress_score": stress_score,
        "health_score": health_score,
        "score_note": EARLY_WARNING_NOTE,
        "score_inputs": {
            "agi_index": agi_index,
            "saci_index": saci_index,
            "chlorophyll_index": chlorophyll_index,
            "browning_percent": browning_percent,
            "yellowing_percent": yellowing_percent,
            "growth_rate_percent_day": growth_rate_percent_day,
            "robust_distribution_score": robust_distribution_score,
        },
        "score_weights": {
            "browning_weight": browning_weight,
            "yellowing_weight": yellowing_weight,
            "distribution_weight": distribution_weight,
            "health_stress_inverse_weight": 0.55,
            "health_chlorophyll_weight": 0.20,
            "health_agi_weight": 0.15,
            "health_saci_weight": 0.10,
        },
    }
