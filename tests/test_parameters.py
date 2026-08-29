import pytest

from mie446_wing import SparSpec, WingParameters, validate_wing


def test_baseline_parameter_only_validation_passes() -> None:
    assert validate_wing(parameters=WingParameters()).passed


def test_more_than_three_modules_is_rejected() -> None:
    with pytest.raises(ValueError, match="module_count"):
        WingParameters(module_count=4)


def test_invalid_tip_chord_is_rejected() -> None:
    with pytest.raises(ValueError, match="tip_chord"):
        WingParameters(tip_chord_mm=170.0)


def test_oversized_spar_is_rejected_by_validation() -> None:
    parameters = WingParameters(spars=(SparSpec(0.60, rod_diameter_mm=12.0),))
    assert not validate_wing(parameters=parameters).passed


def test_interface_ribs_do_not_sit_on_cut_plane() -> None:
    parameters = WingParameters()
    stations = parameters.rib_stations_mm()
    assert all(abs(station - 150.0) > 1.0 for station in stations)
    assert all(abs(station - 300.0) > 1.0 for station in stations)

