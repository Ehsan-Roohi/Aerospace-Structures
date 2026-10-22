"""One-piece CAD is allowed; nominal JSON dimensions never certify printer fit."""
from dataclasses import replace
import json

import pytest

from mie446_wing import WingParameters, build_wing, export_build, validate_wing


@pytest.fixture(scope="module")
def one_piece():
    return build_wing(WingParameters(module_count=1, spars=()))


def test_real_450mm_cad_does_not_bypass_k2_envelope(one_piece, tmp_path):
    report=validate_wing(one_piece)
    fit=next(c for c in report.checks if c.name=="printer build envelope")
    assert not fit.passed and not report.passed
    assert len(one_piece.modules)==1
    with pytest.raises(ValueError, match="printer build envelope"):
        export_build(one_piece,tmp_path/"too-large",ai_log=[])
    assert not list(tmp_path.rglob("*.stl"))


def test_one_piece_exports_exactly_one_module_for_real_larger_printer(one_piece, tmp_path):
    p=replace(one_piece.parameters,printer_build_volume_mm=(300,500,300))
    configured=replace(one_piece,parameters=p)
    report=validate_wing(configured)
    assert report.passed,report.summary()
    destination=tmp_path/"one-piece"
    manifest=export_build(configured,destination,team="Team01",revision="R03",ai_log=[])
    assert manifest['geometry_inventory']['modules']==1
    assert len(list(destination.glob('*Module_*.stl')))==1
    assert len(list(destination.glob('*Module_*.3mf')))==1
    assert json.loads((destination/'wing_parameters.json').read_text())['printer_build_volume_mm']==[300,500,300]
    assert json.loads((destination/'validation_report.json').read_text())['passed']
    mass_limited=replace(configured,parameters=replace(p,maximum_printed_mass_g=1))
    assert not validate_wing(mass_limited).passed,'removing the nominal size cap must not disable mass checks'


def test_shorter_one_piece_fits_course_printer_without_larger_machine():
    build=build_wing(WingParameters(module_count=1,semi_span_mm=250,spars=()))
    assert len(build.modules)==1
    report=validate_wing(build)
    assert report.passed,report.summary()
