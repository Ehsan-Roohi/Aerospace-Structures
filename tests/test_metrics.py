import pytest

from mie446_wing import WingParameters, calculate_planform_metrics


def test_baseline_planform_regression_values() -> None:
    metrics = calculate_planform_metrics(WingParameters())
    assert metrics.semi_wing_area_mm2 == pytest.approx(58_500.0)
    assert metrics.equivalent_full_span_mm == pytest.approx(900.0)
    assert metrics.equivalent_full_area_mm2 == pytest.approx(117_000.0)
    assert metrics.taper_ratio == pytest.approx(0.625)
    assert metrics.aspect_ratio == pytest.approx(6.923076923076923)
    assert metrics.mean_aerodynamic_chord_mm == pytest.approx(132.30769230769232)


def test_chord_varies_linearly_along_span() -> None:
    parameters = WingParameters()
    assert parameters.chord_at(0.0) == pytest.approx(160.0)
    assert parameters.chord_at(225.0) == pytest.approx(130.0)
    assert parameters.chord_at(450.0) == pytest.approx(100.0)

