import pytest

from mie446_wing import (
    CouponNotConfirmedError,
    DesignInputError,
    WingDesign,
    WingProject,
    make_ai_log,
    plot_design_overview,
)


def test_student_design_maps_inputs_and_locks_course_settings() -> None:
    design = WingDesign(
        naca="NACA 2412",
        semi_span_mm=450.0,
        root_chord_mm=165.0,
        tip_chord_mm=95.0,
        skin_mm=1.3,
        rib_thickness_mm=1.8,
        module_count=2,
        rod_clearance_mm=0.35,
    )
    parameters = design.to_parameters()
    assert design.naca == "2412"
    assert parameters.root_chord_mm == pytest.approx(165.0)
    assert parameters.tip_chord_mm == pytest.approx(95.0)
    assert parameters.module_count == 2
    assert parameters.trailing_edge_mm == pytest.approx(1.2)
    assert parameters.interior_rib_count == 3
    assert [spar.chord_fraction for spar in parameters.spars] == [0.30, 0.60]
    assert all(spar.rod_diameter_mm == pytest.approx(4.0) for spar in parameters.spars)
    assert all(spar.radial_clearance_mm == pytest.approx(0.35) for spar in parameters.spars)


def test_invalid_student_design_has_friendly_error() -> None:
    with pytest.raises(DesignInputError, match="tip_chord"):
        WingDesign(root_chord_mm=150.0, tip_chord_mm=170.0)

    with pytest.raises(DesignInputError, match="skin_mm must be at least 0.8"):
        WingDesign(skin_mm=0.4)


def test_analytically_oversized_design_stops_before_cad() -> None:
    project = WingProject(
        WingDesign(semi_span_mm=650.0, module_count=2),
        team_id="Team07",
        revision="R01",
    )
    with pytest.raises(DesignInputError, match="nominal module span"):
        project.analyze()


def test_analysis_explains_airfoil_and_controlled_change() -> None:
    analysis = WingProject(WingDesign(), team_id="Team07", revision="R01").analyze()
    markdown = analysis.to_markdown()
    comparison = analysis.compare_tip_chord(90.0)
    assert "NACA 2412" in markdown
    assert "2% maximum camber at 40% chord" in markdown
    assert comparison.area_direction == "decrease"
    assert comparison.aspect_ratio_direction == "increase"


def test_final_build_requires_coupon_confirmation() -> None:
    project = WingProject(WingDesign(), team_id="Team07", revision="R02")
    with pytest.raises(CouponNotConfirmedError, match="Final CAD is locked"):
        project.build(coupon_confirmed=False)


def test_project_can_record_measured_clearance_in_new_revision() -> None:
    project = WingProject(WingDesign(), team_id="Team07", revision="R01")
    final_project = project.with_clearance(0.35, revision="R02")
    assert final_project.revision == "R02"
    assert final_project.design.rod_clearance_mm == pytest.approx(0.35)


def test_ai_form_helper_supports_disclosure_and_no_use() -> None:
    assert make_ai_log(ai_used=False) == []
    log = make_ai_log(
        ai_used=True,
        tool="ChatGPT",
        purpose="Debug a validation failure",
        affected_code_or_claim="Tip-chord input",
        student_change="Reduced the tip chord",
        independent_check="Recomputed trapezoid area by hand",
        error_or_limitation_found="First suggestion exceeded root chord",
        verdict="Accept with Limitations",
    )
    assert log[0]["tool"] == "ChatGPT"
    with pytest.raises(DesignInputError, match="cannot be blank"):
        make_ai_log(ai_used=True, tool="ChatGPT")


def test_automatic_2d_overview_contains_airfoil_planform_and_rods() -> None:
    figure = plot_design_overview(WingDesign().to_parameters())
    assert len(figure.data) == 5
    assert "automatic 2D design check" in figure.layout.title.text
