import pytest

from mie446_wing import SparSpec, WingParameters, validate_wing


def test_baseline_parameter_only_validation_passes() -> None:
    assert validate_wing(parameters=WingParameters()).passed


def test_more_than_three_modules_is_rejected() -> None:
    with pytest.raises(ValueError, match="module_count"):
        WingParameters(module_count=4)


def test_one_module_is_allowed_before_actual_cad_fit_check() -> None:
    assert validate_wing(parameters=WingParameters(module_count=1)).passed
    assert validate_wing(parameters=WingParameters(module_count=1, semi_span_mm=250)).passed


def test_invalid_tip_chord_is_rejected() -> None:
    with pytest.raises(ValueError, match="tip_chord"):
        WingParameters(tip_chord_mm=170.0)


@pytest.mark.parametrize(
    ("field", "value"),
    [("skin_mm", 0.4), ("trailing_edge_mm", 0.4), ("rib_thickness_mm", 0.4)],
)
def test_sub_nozzle_features_are_rejected(field: str, value: float) -> None:
    parameters = WingParameters(**{field: value})
    assert not validate_wing(parameters=parameters).passed


def test_nominal_dimensions_are_not_a_printer_fit_gate() -> None:
    parameters = WingParameters(semi_span_mm=650.0, module_count=2)
    assert validate_wing(parameters=parameters).passed
    assert not any(c.name == "printer build envelope" for c in validate_wing(parameters=parameters).checks)


@pytest.mark.parametrize("envelope", [(0,300,300),(-1,300,300),(float('nan'),300,300),(True,300,300),(300,300),'300'])
def test_invalid_printer_envelopes_are_rejected(envelope) -> None:
    with pytest.raises(ValueError, match="printer_build_volume_mm"):
        WingParameters(printer_build_volume_mm=envelope)


def test_printer_envelope_survives_json_round_trip() -> None:
    p = WingParameters(module_count=1, printer_build_volume_mm=[500,300,300])
    assert p.printer_build_volume_mm == (500.,300.,300.)
    assert WingParameters.from_dict(p.to_dict()) == p


def test_oversized_spar_is_rejected_by_validation() -> None:
    parameters = WingParameters(spars=(SparSpec(0.60, rod_diameter_mm=12.0),))
    assert not validate_wing(parameters=parameters).passed


def test_interface_ribs_do_not_sit_on_cut_plane() -> None:
    parameters = WingParameters()
    stations = parameters.rib_stations_mm()
    assert all(abs(station - 150.0) > 1.0 for station in stations)
    assert all(abs(station - 300.0) > 1.0 for station in stations)


def test_three_module_baseline_has_seven_documented_ribs() -> None:
    assert WingParameters().rib_stations_mm() == pytest.approx(
        (112.5, 146.0, 154.0, 225.0, 296.0, 304.0, 337.5)
    )


def test_two_modules_replace_middle_candidate_with_interface_pair() -> None:
    assert WingParameters(module_count=2).rib_stations_mm() == pytest.approx(
        (112.5, 221.0, 229.0, 337.5)
    )
