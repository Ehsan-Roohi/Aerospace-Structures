from pathlib import Path

import pytest

from mie446_wing import WingParameters, build_wing, export_build, make_fit_coupon, validate_wing


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


@pytest.mark.slow
def test_export_package_contains_expected_files(baseline_build, tmp_path: Path) -> None:
    manifest = export_build(baseline_build, tmp_path, team="Team99", revision="R01")
    assert len(manifest["files"]) == 8
    assert (tmp_path / "validation_report.json").exists()
    assert (tmp_path / "manifest.json").exists()
    assert all((tmp_path / item["name"]).stat().st_size > 100 for item in manifest["files"])
