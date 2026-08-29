from pathlib import Path
from zipfile import ZipFile

import pytest

from mie446_wing import (
    BuiltWingProject,
    WingDesign,
    WingParameters,
    WingProject,
    build_wing,
    export_build,
    export_fit_coupon,
    make_fit_coupon,
    make_verified_archive,
    validate_wing,
)


@pytest.fixture(scope="module")
def baseline_build():
    return build_wing(WingParameters())


@pytest.mark.slow
def test_baseline_geometry_builds_and_validates(baseline_build) -> None:
    report = validate_wing(baseline_build)
    assert report.passed, report.summary()
    assert baseline_build.complete.isValid()
    assert len(baseline_build.complete.Solids()) == 1
    assert len(baseline_build.modules) == 3
    assert all(module.isValid() for module in baseline_build.modules)
    assert all(len(module.Solids()) == 1 for module in baseline_build.modules)


@pytest.mark.slow
def test_segmented_volume_is_conserved(baseline_build) -> None:
    module_volume = sum(module.Volume() for module in baseline_build.modules)
    assert module_volume == pytest.approx(baseline_build.complete.Volume(), rel=5.0e-4)


def test_fit_coupon_is_valid() -> None:
    coupon, mapping = make_fit_coupon(WingParameters())
    assert coupon.isValid()
    assert len(coupon.Solids()) == 1
    assert mapping["hole_2_radial_clearance_mm"] == pytest.approx(0.25)
    assert mapping["hole_3_physical_marker"] == "3 top-face dimple(s)"


def test_coupon_can_be_exported_before_build(tmp_path: Path) -> None:
    output_dir = tmp_path / "coupon"
    manifest = export_fit_coupon(WingParameters(), output_dir, team="Team99", revision="R01")
    assert len(manifest["files"]) == 3
    assert (output_dir / "fit_coupon_manifest.json").exists()
    assert (output_dir / "wing_parameters.json").exists()
    assert all((output_dir / item["name"]).exists() for item in manifest["files"])
    archive = make_verified_archive(
        output_dir,
        tmp_path / "coupon.zip",
        manifest_name="fit_coupon_manifest.json",
    )
    with ZipFile(archive) as handle:
        assert set(handle.namelist()) == {
            "fit_coupon_manifest.json",
            *(item["name"] for item in manifest["files"]),
        }


def test_export_rejects_nonempty_destination(baseline_build, tmp_path: Path) -> None:
    (tmp_path / "obsolete_module.stl").write_text("stale", encoding="utf-8")
    with pytest.raises(ValueError, match="must be empty"):
        export_build(baseline_build, tmp_path, ai_log=[])


def test_export_rejects_untouched_ai_log_template(baseline_build, tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="template text"):
        export_build(
            baseline_build,
            tmp_path,
            ai_log=[{"tool": "Example: ChatGPT", "student_change": "Replace with details"}],
        )


def test_export_rejects_incomplete_ai_log_entry(baseline_build, tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="missing or blank fields"):
        export_build(baseline_build, tmp_path, ai_log=[{}])


def test_export_rejects_non_json_student_record_before_writing(
    baseline_build, tmp_path: Path
) -> None:
    destination = tmp_path / "submission"
    with pytest.raises(ValueError, match="JSON-compatible"):
        export_build(
            baseline_build,
            destination,
            ai_log=[],
            student_record={"bad_value": object()},
        )
    assert not destination.exists()


@pytest.mark.slow
def test_export_package_contains_expected_files(baseline_build, tmp_path: Path) -> None:
    manifest = export_build(
        baseline_build,
        tmp_path,
        team="Team99",
        revision="R01",
        ai_log=[],
        student_record={"team_members": "Student A, Student B, Student C"},
        design_summary_markdown="# Design Summary\n\nAutomatic report.",
        design_overview_html="<!doctype html><title>Design Overview</title>",
    )
    assert len(manifest["files"]) == 16
    assert (tmp_path / "validation_report.json").exists()
    assert (tmp_path / "student_design_record.json").exists()
    assert (tmp_path / "Design_Summary.md").exists()
    assert (tmp_path / "Design_Overview.html").exists()
    assert (tmp_path / "manifest.json").exists()
    assert all((tmp_path / item["name"]).stat().st_size > 0 for item in manifest["files"])
    assert {item["name"] for item in manifest["files"]} == {
        path.name for path in tmp_path.iterdir() if path.name != "manifest.json"
    }


def test_design_summary_formats_student_record_as_tables(baseline_build) -> None:
    project = WingProject(WingDesign(), team_id="Team99", revision="R02")
    analysis = project.analyze()
    built_project = BuiltWingProject(
        project=project,
        analysis=analysis,
        build=baseline_build,
        validation=validate_wing(baseline_build),
    )
    summary = built_project.design_summary(
        {
            "course_release": "v1.1.0",
            "team_id": "Team99",
            "team_members": "A, B, C",
            "revision": "R02",
            "workflow_stage": "Final Wing",
            "coupon_record": {"coupon_revision": "R01", "confirmed": True},
            "engineering_responses": {"area_prediction_matches": True},
            "ai_use_declaration": "Team declares no material AI use",
        }
    )
    assert "### Team and workflow record" in summary
    assert "### Physical fit-coupon record" in summary
    assert "### Engineering responses and comparison" in summary
    assert "| Area Prediction Matches | Yes |" in summary
    assert "```json" not in summary


@pytest.mark.slow
def test_verified_archive_rejects_unmanifested_file(baseline_build, tmp_path: Path) -> None:
    output_dir = tmp_path / "submission"
    export_build(baseline_build, output_dir, ai_log=[])
    (output_dir / "obsolete_module.stl").write_text("stale", encoding="utf-8")
    with pytest.raises(ValueError, match="do not match manifest"):
        make_verified_archive(output_dir, tmp_path / "submission.zip")
