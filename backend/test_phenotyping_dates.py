import pytest

from backend.phenotyping_service import AzollaPhenotypingService


def test_validate_date_inputs_valid_range():
    service = AzollaPhenotypingService()
    start, end = service.validate_date_inputs("2026-01-01", "2026-02-12")
    comparison = service.calculate_date_diff(start, end)
    assert comparison == {
        "days_diff": 42,
        "start_date": "2026-01-01",
        "end_date": "2026-02-12",
    }


def test_validate_date_inputs_same_day_diff_zero():
    service = AzollaPhenotypingService()
    start, end = service.validate_date_inputs("2026-04-20", "2026-04-20")
    assert service.calculate_date_diff(start, end)["days_diff"] == 0


def test_validate_date_inputs_reverse_order_error():
    service = AzollaPhenotypingService()
    with pytest.raises(ValueError, match="start_date"):
        service.validate_date_inputs("2026-05-02", "2026-05-01")


def test_validate_date_inputs_invalid_format_error():
    service = AzollaPhenotypingService()
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        service.validate_date_inputs("02-05-2026", "2026-05-02")


def test_validate_date_inputs_leap_year_and_month_boundary():
    service = AzollaPhenotypingService()
    start, end = service.validate_date_inputs("2024-02-28", "2024-03-01")
    assert service.calculate_date_diff(start, end)["days_diff"] == 2
