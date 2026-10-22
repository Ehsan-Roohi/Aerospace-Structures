"""Regressions for default B-spline mass quadrature, not relaxed thresholds."""
from dataclasses import replace
import json

import cadquery as cq
import pytest

from mie446_wing import WingParameters,build_wing,validate_wing,export_build,BuiltWingProject
from mie446_wing.config import BondedSparSpec
from mie446_wing.cad_metrics import adaptive_volume


def test_adaptive_material_volume_box_and_empty_boolean():
    box=cq.Solid.makeBox(3,4,5)
    assert adaptive_volume(box)==pytest.approx(60,rel=1e-12)
    assert adaptive_volume(box.cut(box))==pytest.approx(0,abs=1e-12)


@pytest.fixture(scope='module')
def spline_counterexample():
    root=dict(kind='naca5',code='23018');tip=dict(kind='naca4',code='0018')
    return build_wing(WingParameters(semi_span_mm=240,root_chord_mm=60,tip_chord_mm=48,
        module_count=1,spars=(),custom_rib_stations_mm=(80,160),cavity_x_start=.10,cavity_x_end=.78,
        airfoil_profile=root,airfoil_stations=(dict(eta=0,airfoil=root,incidenceDeg=2),
        dict(eta=1,airfoil=tip,incidenceDeg=-2)),twist_enabled=True,sweep_deg=12,dihedral_deg=6,
        sweep_reference_fraction=.25,twist_reference_fraction=.25,
        bonded_spars=(BondedSparSpec(.35,240,4,.8,4,.8,.6),)))


@pytest.mark.slow
def test_station_bspline_volume_uses_converged_adaptive_reference(spline_counterexample):
    b=spline_counterexample
    # Independently converged adaptive B-rep integration (eps1e-5,1e-7,1e-9)
    # and conforming curved tetra10 volume ~41004 mm³; fixed CAD quadrature
    # gives ~41215.738 and must NOT become the accepted reference.
    assert adaptive_volume(b.complete)==pytest.approx(41003.97467006534,rel=1e-9)
    assert abs(b.complete.Volume()/adaptive_volume(b.complete)-1)>.004
    from mie446_wing.geometry import _segment
    p=replace(b.parameters,module_count=2,custom_rib_stations_mm=())
    modules=_segment(b.complete,p)
    assert sum(adaptive_volume(m) for m in modules)==pytest.approx(adaptive_volume(b.complete),rel=5e-6)


@pytest.mark.slow
def test_all_student_mass_paths_use_same_adaptive_material(spline_counterexample,tmp_path):
    b=spline_counterexample
    expected=adaptive_volume(b.complete)/1000*b.parameters.pla_density_g_cm3
    inaccurate=b.complete.Volume()/1000*b.parameters.pla_density_g_cm3
    # A fixed threshold between actual and incorrectly integrated mass proves
    # this changes the calculation, not the permitted fabrication mass.
    limited=replace(b,parameters=replace(b.parameters,maximum_printed_mass_g=(expected+inaccurate)/2))
    report=validate_wing(limited)
    assert report.passed,report.summary()
    built=BuiltWingProject(project=None,analysis=None,build=limited,validation=report)
    assert built.estimated_fully_dense_mass_g==pytest.approx(expected,rel=1e-12)
    assert f'{expected:.2f} g' in built.to_markdown()
    manifest=export_build(limited,tmp_path/'export',ai_log=[],team='VolumeQA',revision='R01')
    assert manifest['estimated_fully_dense_mass_g']==pytest.approx(round(expected,3))
