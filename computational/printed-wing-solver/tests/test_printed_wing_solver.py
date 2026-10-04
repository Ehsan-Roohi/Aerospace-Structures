"""Verification tests for the printed-wing structural solver.

Run from computational/printed-wing-solver:  python -m pytest -q
Each test is an independent check: closed-form solutions, the course CAD model,
equilibrium, a second numerical method, or a sign convention.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import Point, Polygon

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import printed_wing_solver as pws  # noqa: E402

REPO = HERE.parents[1]

# Reference values measured from the course CadQuery model (mie446_wing v1.1.1, baseline
# WingParameters()) with build_wing(): complete.Volume() * 1.24 g/cm3, and the area of a
# 0.01 mm slab cut normal to the span divided by its thickness.
CAD_BASELINE_MASS_G = 240.77
CAD_SLICE_AREA_MM2 = {10.0: 494.86, 440.0: 304.77}
COURSE_RIBS_MM = (112.5, 146.0, 154.0, 225.0, 296.0, 304.0, 337.5)


@pytest.fixture(scope="module")
def baseline():
    return pws.solve()


@pytest.fixture(scope="module")
def tip_test():
    return pws.solve(load=pws.LoadCase(name="tip", kind="tip", tip_force_N=10.0, factor_of_safety=1.0))


# --- geometry -----------------------------------------------------------------------------


def test_polygon_integrals_rectangle_with_hole():
    outer = Polygon([(0, 0), (40, 0), (40, 20), (0, 20)])
    hole = Polygon([(10, 5), (30, 5), (30, 15), (10, 15)])
    A, Sz, Sx, Izz, Ixx, Ixz = pws.polygon_integrals(Polygon(outer.exterior.coords, [hole.exterior.coords]))
    assert A == pytest.approx(800 - 200)
    assert Sx / A == pytest.approx(20.0)
    assert Sz / A == pytest.approx(10.0)
    I_about_centroid = (40 * 20**3 - 20 * 10**3) / 12
    assert Izz - A * 10.0**2 == pytest.approx(I_about_centroid)
    assert Ixz - A * 20.0 * 10.0 == pytest.approx(0.0, abs=1e-6)


def test_rib_stations_match_course_rule():
    assert pws.WingGeometry().rib_stations_mm() == pytest.approx(COURSE_RIBS_MM)
    two = pws.WingGeometry(module_count=2).rib_stations_mm()
    assert two == pytest.approx((112.5, 221.0, 229.0, 337.5))


def test_rib_rule_identical_to_course_package_when_available():
    # The configuration is pure Python; do not skip this check merely because the
    # optional CadQuery dependency imported by the package __init__ is absent.
    import importlib.util
    path = REPO / "src/mie446_wing/config.py"
    if not path.exists():
        pytest.skip("course CAD configuration unavailable in this standalone checkout")
    spec = importlib.util.spec_from_file_location("_course_config_check", path)
    config = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = config
    spec.loader.exec_module(config)
    for modules in (2, 3):
        course = config.WingParameters(module_count=modules).rib_stations_mm()
        assert pws.WingGeometry(module_count=modules).rib_stations_mm() == pytest.approx(course)


def test_section_areas_match_course_cad():
    geom = pws.WingGeometry()
    for y, area in CAD_SLICE_AREA_MM2.items():
        assert pws.section_shapes(geom, y).printed.area == pytest.approx(area, rel=0.015)


def test_printed_mass_matches_course_cad(baseline):
    assert baseline.mass["printed_total_g"] == pytest.approx(CAD_BASELINE_MASS_G, rel=0.01)
    assert baseline.mass["printed_total_g"] <= 300.0


def test_rods_lie_inside_the_airfoil():
    geom = pws.WingGeometry()
    for y in (0.0, 225.0, 450.0):
        shapes = pws.section_shapes(geom, y)
        for rod in shapes.rods:
            assert shapes.outer.contains(rod)


# --- section properties -------------------------------------------------------------------


def test_fe_torsion_constant_of_thin_tube_matches_closed_form():
    from sectionproperties.analysis.section import Section
    from sectionproperties.pre.geometry import Geometry

    R, r = 20.0, 19.0
    ring = Point(0, 0).buffer(R, 128).difference(Point(0, 0).buffer(r, 128))
    g = Geometry(ring)
    g.create_mesh(mesh_sizes=0.2)
    sec = Section(g)
    sec.calculate_geometric_properties()
    sec.calculate_warping_properties()
    assert sec.get_j() == pytest.approx(math.pi / 2 * (R**4 - r**4), rel=0.01)
    assert np.allclose(sec.get_sc(), (0.0, 0.0), atol=1e-3)


def test_bredt_batho_agrees_with_fe_torsion(baseline):
    for s in baseline.sections:
        assert 0.85 < s.J_bredt_mm4 / s.J_fe_mm4 < 1.05


def test_torsional_shear_matches_bredt_away_from_corners():
    geom = pws.WingGeometry()
    sec = pws.analyse_section(geom, pws.PLA_UPRIGHT, pws.ROD_HOBBY, pws.Assembly(), 0.0)
    tau, far = pws.shear_stress_field(sec, 0.0, 100.0, geom)
    bredt = 100.0 / (2 * sec.bredt_area_mm2 * geom.skin_mm)
    assert np.median(tau[far]) == pytest.approx(bredt, rel=0.15)


def test_shear_resultants_and_sign_convention():
    """vy acts through the shear centre; mzz is the counter-clockwise moment about +z."""

    geom = pws.WingGeometry()
    sec = pws._fe_shell_section(geom, 0.0, 0.5)
    nodes = np.asarray(sec.mesh["vertices"])
    tris = np.asarray(sec.mesh["triangles"])

    def resultants(**kw):
        st = sec.calculate_stress(**kw).get_stress()[0]
        tx, ty = np.asarray(st["sig_zx"]), np.asarray(st["sig_zy"])
        Fy = Mz = 0.0
        for tri in tris:
            p = nodes[tri[:3]]
            area = 0.5 * abs((p[1, 0] - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (p[1, 1] - p[0, 1]))
            mid = tri[3:6]
            Fy += ty[mid].mean() * area
            Mz += np.mean(nodes[mid, 0] * ty[mid] - nodes[mid, 1] * tx[mid]) * area
        return Fy, Mz

    Fy, Mz = resultants(vy=1.0)
    assert Fy == pytest.approx(1.0, rel=1e-3)
    assert Mz == pytest.approx(sec.get_sc()[0], rel=1e-3)
    Fy, Mz = resultants(mzz=1.0)
    assert Fy == pytest.approx(0.0, abs=1e-3)
    assert Mz == pytest.approx(1.0, rel=1e-3)


def test_slip_fit_rods_add_only_their_own_bending_stiffness():
    geom = pws.WingGeometry()
    slip = pws.analyse_section(geom, pws.PLA_UPRIGHT, pws.ROD_AEROSPACE, pws.Assembly(rods_bonded=False), 0.0)
    bonded = pws.analyse_section(geom, pws.PLA_UPRIGHT, pws.ROD_AEROSPACE, pws.Assembly(rods_bonded=True), 0.0)
    own = 2 * pws.ROD_AEROSPACE.E_MPa * math.pi * 4.0**4 / 64
    assert slip.EI_rods_own_Nmm2 == pytest.approx(own)
    assert bonded.EI_flap_Nmm2 >= slip.EI_flap_Nmm2  # parallel-axis term can only add


# --- beam model -------------------------------------------------------------------------


def test_beam_fem_cantilever_tip_load_and_frequency():
    L, EI, m = 450.0, 3.0e7, 0.5  # mm, N mm^2, g/mm
    nodes = np.linspace(0, L, 61)
    out = pws.beam_fem(
        nodes, lambda y: EI, lambda y: 1e7, lambda y: m, lambda y: 1.0, point_forces=((L, 1.0),)
    )
    assert out["w"][-1] == pytest.approx(L**3 / (3 * EI), rel=1e-6)
    f1 = 1.875104**2 / (2 * math.pi) * math.sqrt(EI / (m * 1e-6 * L**4))
    assert out["f_bending_Hz"][0] == pytest.approx(f1, rel=1e-4)


def test_beam_fem_rotational_spring_at_seam():
    L, EI, k, P = 450.0, 3.0e7, 8.0e4, 1.0
    nodes = np.linspace(0, L, 31)
    out = pws.beam_fem(
        nodes, lambda y: EI, lambda y: 1e7, lambda y: 0.5, lambda y: 1.0,
        seams=(150.0,), k_bend=k, point_forces=((L, P),),
    )
    expected = P * L**3 / (3 * EI) + P * (L - 150.0) / k * (L - 150.0)
    assert out["w"][-1] == pytest.approx(expected, rel=1e-6)


def test_equilibrium_and_two_methods_agree(baseline, tip_test):
    for res in (baseline, tip_test):
        v = res.verification
        assert v["root shear vs applied force (rel. error)"] < 1e-9
        assert v["root moment vs applied moment (rel. error)"] < 1e-9
        assert v["tip deflection: direct vs 1-D FEM (rel. diff)"] < 2e-3
        assert v["tip twist: direct vs 1-D FEM (rel. diff)"] < 2e-3


def test_lift_distributions_integrate_to_the_requested_lift():
    for dist in ("elliptic", "uniform", "planform", "schrenk"):
        res = pws.solve(load=pws.LoadCase(distribution=dist, inertia_relief=False), n_sections=3)
        assert res.V[0] == pytest.approx(res.load.semi_wing_lift_N, rel=2e-3)


def test_tip_load_deflection_brackets_hand_checks(tip_test):
    """Rigid seams: between the root-EI estimate (too stiff) and the solved answer."""

    k = tip_test.stiffness
    assert k["root_EI_hand_check_N_per_mm"] > k["rigid_seams_N_per_mm"] > k["tip_force_N_per_mm"]
    assert tip_test.tip_deflection_mm == pytest.approx(10.0 / k["tip_force_N_per_mm"], rel=2e-3)


def test_bonding_the_seams_stiffens_the_wing():
    dry = pws.solve(assembly=pws.Assembly(seams_bonded=False), n_sections=3)
    bonded = pws.solve(assembly=pws.Assembly(seams_bonded=True), n_sections=3)
    assert bonded.stiffness["tip_force_N_per_mm"] > dry.stiffness["tip_force_N_per_mm"]
    assert bonded.fem["f_bending_Hz"][0] > dry.fem["f_bending_Hz"][0]
    assert bonded.seam["free_play_tip_mm"] == 0.0


def test_upward_lift_compresses_the_upper_surface(tip_test):
    assert tip_test.stress["sigma_top"][0] < 0 < tip_test.stress["sigma_bottom"][0]


def test_nose_up_torque_sign():
    # A tip force ahead of the root shear centre twists the root section nose-up.
    res = pws.solve(load=pws.LoadCase(kind="tip", tip_force_N=1.0, tip_force_chord_fraction=0.0), n_sections=3)
    assert res.T[0] > 0
    res = pws.solve(load=pws.LoadCase(kind="tip", tip_force_N=1.0, tip_force_chord_fraction=0.9), n_sections=3)
    assert res.T[0] < 0 and res.twist[-1] < 0


def test_buckling_helpers_limiting_cases():
    E, nu, t = 2000.0, 0.35, 1.2
    square = pws.plate_buckling_flat(E, nu, t, 100.0, 100.0)
    assert square == pytest.approx(4 * math.pi**2 * E / (12 * (1 - nu**2)) * (t / 100.0) ** 2)
    assert pws.cylinder_buckling_knocked_down(E, nu, t, math.inf) == 0.0


def test_rod_modulus_helper_inverts_cantilever_formula():
    E = 100000.0
    I = math.pi * 4.0**4 / 64
    delta = 1.0 * 300.0**3 / (3 * E * I)
    assert pws.rod_modulus_from_cantilever(1.0, 300.0, delta, 4.0) == pytest.approx(E)


def test_notebook_loads_this_engine_from_the_repository():
    import json
    import re

    notebook = REPO / "notebooks" / "MIE446_Printed_Wing_Structural_Solver.ipynb"
    if not notebook.exists():
        pytest.skip("notebook not built")
    cells = json.loads(notebook.read_text(encoding="utf-8"))["cells"]
    source = "".join("".join(c["source"]) for c in cells if c["cell_type"] == "code")
    match = re.search(r'ENGINE_URL = "https://raw\.githubusercontent\.com/Ehsan-Roohi/Aerospace-Structures/main/([^"]+)"', source)
    assert match, "the notebook must download the solver from the course repository"
    assert (REPO / match.group(1)).resolve() == (HERE / "printed_wing_solver.py").resolve()


@pytest.mark.parametrize("length", [0.0, -8.0, math.nan, math.inf])
def test_invalid_seam_length_rejected(length):
    with pytest.raises(ValueError, match="positive and finite"):
        pws.Assembly(seam_rod_free_length_mm=length)


@pytest.mark.parametrize("kwargs", [
    {"semi_span_mm": math.inf}, {"interior_rib_count": -1},
    {"interior_rib_count": 1.5}, {"rod_chord_fractions": (.3, .3)},
    {"root_tip_cap_mm": 300}, {"interface_rib_offset_mm": 100},
])
def test_invalid_geometry_rejected(kwargs):
    with pytest.raises(ValueError):
        pws.WingGeometry(**kwargs)


@pytest.mark.parametrize("kwargs", [{"n_sections": 1}, {"n_grid": 2},
                                    {"n_beam_elements": 0}, {"mesh_area_mm2": 0}])
def test_invalid_discretization_rejected(kwargs):
    with pytest.raises(ValueError):
        pws.solve(**kwargs)


def test_sensor_inertia_lowers_torsional_frequency():
    empty = pws.solve(load=pws.LoadCase(kind="tip"), n_sections=3)
    sensor = pws.solve(load=pws.LoadCase(kind="tip", tip_mass_g=20,
                       tip_mass_chord_fraction=.85, tip_mass_height_mm=10), n_sections=3)
    assert sensor.fem["f_bending_Hz"][0] < empty.fem["f_bending_Hz"][0]
    assert sensor.fem["f_torsion_Hz"][0] < .95 * empty.fem["f_torsion_Hz"][0]
    assert sensor.mass["tip_sensor_polar_inertia_g_mm2"] > 0
    assert empty.mass["tip_cap_polar_inertia_g_mm2"] > 0
    assert sensor.tip_deflection_mm == pytest.approx(empty.tip_deflection_mm)


def test_rib_inertia_counts_only_added_material(baseline):
    s=baseline.sections[0]
    holes = s.shapes.holes[0].union(s.shapes.holes[1])
    extra = s.shapes.outer.difference(holes).difference(s.shapes.printed)
    integrals = sum(pws.polygon_integrals(poly) for poly in pws._polygons(extra))
    A, Sz, Sx, Izz, Ixx, _ = integrals
    x, z = s.shear_centre_x_mm, s.shear_centre_z_mm
    polar = Ixx - 2*x*Sx + x*x*A + Izz - 2*z*Sz + z*z*A
    assert s.rib_polar_area_mm4 == pytest.approx(polar, rel=1e-8)
    assert s.rib_cg_x_mm == pytest.approx(Sx/A)


def test_buckling_is_an_illustrative_comparison_not_a_pass(baseline):
    assert np.allclose(baseline.stress["skin_critical"], baseline.stress["skin_critical_flat"])
    check=next(c for c in baseline.checks if 'buckling' in c.name)
    assert check.status == 'REVIEW'
    assert check.illustrative


def test_invalid_material_load_and_criteria():
    from dataclasses import replace
    with pytest.raises(ValueError):
        replace(pws.ROD_HOBBY, G_MPa_override=math.nan)
    with pytest.raises(ValueError):
        pws.LoadCase(tip_mass_g=math.nan)
    with pytest.raises(ValueError):
        pws.Criteria(max_tip_twist_deg=0)
