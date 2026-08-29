"""Traceable STL, 3MF, STEP, configuration, metrics, and validation export."""

from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

import cadquery as cq

from .config import WingParameters
from .geometry import WingBuild, make_fit_coupon, spar_length_mm
from .validation import validate_wing


def _safe_token(value: str, label: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip()).strip("-")
    if not token:
        raise ValueError(f"{label} must contain a letter or digit")
    return token


def _sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _export_shape(shape: cq.Shape, path: Path) -> None:
    cq.exporters.export(
        shape,
        str(path),
        tolerance=0.08,
        angularTolerance=0.10,
    )
    if not path.exists() or path.stat().st_size < 100:
        raise RuntimeError(f"export failed or produced an empty file: {path}")


def _prepare_empty_destination(output_dir: str | Path) -> Path:
    destination = Path(output_dir)
    if destination.exists() and any(destination.iterdir()):
        raise ValueError(
            f"output directory must be empty: {destination}. "
            "Use a new revision so obsolete files cannot enter the submission archive."
        )
    destination.mkdir(parents=True, exist_ok=True)
    return destination


def _file_record(path: Path) -> dict[str, Any]:
    return {
        "name": path.name,
        "bytes": path.stat().st_size,
        "sha256": _sha256(path),
    }


def _validated_ai_log(ai_log: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(ai_log, list):
        raise ValueError("ai_log must be a list of dictionaries")
    markers = ("example:", "replace with")
    required_fields = (
        "tool",
        "purpose",
        "affected_code_or_claim",
        "student_change",
        "independent_check",
        "error_or_limitation_found",
        "verdict",
    )
    allowed_verdicts = {"Accept", "Accept with Limitations", "Reject"}
    for index, entry in enumerate(ai_log, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"ai_log entry {index} must be a dictionary")
        flattened = " ".join(str(value).lower() for value in entry.values())
        if any(marker in flattened for marker in markers):
            raise ValueError(
                f"ai_log entry {index} still contains template text; replace or remove it"
            )
        missing = [
            field
            for field in required_fields
            if not isinstance(entry.get(field), str) or not entry[field].strip()
        ]
        if missing:
            raise ValueError(f"ai_log entry {index} has missing or blank fields: {missing}")
        if entry["verdict"] not in allowed_verdicts:
            raise ValueError(
                f"ai_log entry {index} verdict must be Accept, Accept with Limitations, or Reject"
            )
    return ai_log


def make_verified_archive(
    output_dir: str | Path,
    archive_path: str | Path | None = None,
    *,
    manifest_name: str = "manifest.json",
) -> Path:
    """Verify manifest membership and hashes, then create a clean ZIP archive."""

    source = Path(output_dir)
    manifest_path = source / manifest_name
    if not manifest_path.is_file():
        raise ValueError(f"manifest file not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    records = manifest.get("files")
    if not isinstance(records, list):
        raise ValueError(f"invalid files list in {manifest_path}")

    expected_names = {manifest_name}
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("name"), str):
            raise ValueError(f"invalid file record in {manifest_path}")
        expected_names.add(record["name"])

    children = list(source.iterdir())
    if any(not child.is_file() for child in children):
        raise ValueError("submission directory must contain files only")
    actual_names = {child.name for child in children}
    if actual_names != expected_names:
        unexpected = sorted(actual_names - expected_names)
        missing = sorted(expected_names - actual_names)
        raise ValueError(f"submission files do not match manifest; unexpected={unexpected}, missing={missing}")

    for record in records:
        path = source / record["name"]
        if path.stat().st_size != record.get("bytes") or _sha256(path) != record.get("sha256"):
            raise ValueError(f"file does not match manifest: {path.name}")

    archive = Path(archive_path) if archive_path is not None else source.with_suffix(".zip")
    if archive.exists():
        raise ValueError(f"archive already exists: {archive}; use a new revision")
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.parent.resolve() == source.resolve():
        raise ValueError("archive must be outside the submission directory")
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as handle:
        for name in sorted(expected_names):
            handle.write(source / name, arcname=name)
    return archive


def export_fit_coupon(
    parameters: WingParameters,
    output_dir: str | Path,
    *,
    team: str = "Team00",
    revision: str = "R01",
) -> dict[str, Any]:
    """Export the clearance coupon before the team's wing-design freeze."""

    team = _safe_token(team, "team")
    revision = _safe_token(revision, "revision")
    parameters_json = json.dumps(parameters.to_dict(), indent=2)
    coupon, mapping = make_fit_coupon(parameters)
    destination = _prepare_empty_destination(output_dir)
    coupon_path = destination / f"MIE446_{team}_Rod_Fit_Coupon_{revision}.stl"
    mapping_path = destination / "fit_coupon_mapping.json"
    parameters_path = destination / "wing_parameters.json"
    _export_shape(coupon, coupon_path)
    mapping_path.write_text(json.dumps(mapping, indent=2), encoding="utf-8")
    parameters_path.write_text(parameters_json, encoding="utf-8")
    manifest: dict[str, Any] = {
        "course": "MIE 446 Aerospace Structures",
        "purpose": "Rod fit coupon before design freeze",
        "units": "millimetres",
        "team": team,
        "revision": revision,
        "files": [
            _file_record(coupon_path),
            _file_record(mapping_path),
            _file_record(parameters_path),
        ],
    }
    (destination / "fit_coupon_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    return manifest


def export_build(
    build: WingBuild,
    output_dir: str | Path,
    *,
    team: str = "Team00",
    revision: str = "R01",
    ai_log: list[dict[str, Any]],
    student_record: dict[str, Any] | None = None,
    design_summary_markdown: str | None = None,
    design_overview_html: str | None = None,
) -> dict[str, Any]:
    """Export a validated build and return its machine-readable manifest."""

    team = _safe_token(team, "team")
    revision = _safe_token(revision, "revision")
    validated_ai_log = _validated_ai_log(ai_log)
    if student_record is not None and not isinstance(student_record, dict):
        raise ValueError("student_record must be a dictionary")
    try:
        serialized_student_record = (
            json.dumps(student_record, indent=2) if student_record is not None else None
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(f"student_record must contain JSON-compatible values: {exc}") from exc
    if design_summary_markdown is not None and (
        not isinstance(design_summary_markdown, str)
        or not design_summary_markdown.strip()
    ):
        raise ValueError("design_summary_markdown must be non-empty text")
    if design_overview_html is not None and (
        not isinstance(design_overview_html, str)
        or not design_overview_html.strip()
    ):
        raise ValueError("design_overview_html must be non-empty text")
    destination = _prepare_empty_destination(output_dir)

    report = validate_wing(build)
    report.raise_for_failure()
    parameters_path = destination / "wing_parameters.json"
    metrics_path = destination / "planform_metrics.json"
    validation_path = destination / "validation_report.json"
    build.parameters.to_json(parameters_path)
    metrics_path.write_text(
        json.dumps(build.metrics.to_dict(), indent=2), encoding="utf-8"
    )
    report.to_json(validation_path)

    exported: list[Path] = [parameters_path, metrics_path, validation_path]
    complete_step = destination / f"MIE446_{team}_Wing_Complete_{revision}.step"
    _export_shape(build.complete, complete_step)
    exported.append(complete_step)

    for index, module in enumerate(build.modules, start=1):
        stem = f"MIE446_{team}_Wing_Module_{index:02d}_{revision}"
        for suffix in (".stl", ".3mf"):
            path = destination / f"{stem}{suffix}"
            _export_shape(module, path)
            exported.append(path)

    coupon, coupon_mapping = make_fit_coupon(build.parameters)
    coupon_path = destination / f"MIE446_{team}_Rod_Fit_Coupon_{revision}.stl"
    _export_shape(coupon, coupon_path)
    exported.append(coupon_path)
    coupon_mapping_path = destination / "fit_coupon_mapping.json"
    coupon_mapping_path.write_text(
        json.dumps(coupon_mapping, indent=2), encoding="utf-8"
    )
    exported.append(coupon_mapping_path)

    ai_log_path = destination / "ai_use_log.json"
    ai_log_path.write_text(json.dumps(validated_ai_log, indent=2), encoding="utf-8")
    exported.append(ai_log_path)

    if student_record is not None:
        student_record_path = destination / "student_design_record.json"
        student_record_path.write_text(serialized_student_record, encoding="utf-8")
        exported.append(student_record_path)

    if design_summary_markdown is not None:
        summary_path = destination / "Design_Summary.md"
        summary_path.write_text(design_summary_markdown.strip() + "\n", encoding="utf-8")
        exported.append(summary_path)

    if design_overview_html is not None:
        overview_path = destination / "Design_Overview.html"
        overview_path.write_text(design_overview_html, encoding="utf-8")
        exported.append(overview_path)

    manifest: dict[str, Any] = {
        "course": "MIE 446 Aerospace Structures",
        "project": "Code-to-Print Wing",
        "units": "millimetres",
        "team": team,
        "revision": revision,
        "naca": build.parameters.naca,
        "estimated_fully_dense_mass_g": round(
            build.complete.Volume() / 1000.0 * build.parameters.pla_density_g_cm3, 3
        ),
        "spar_lengths_mm": [
            round(spar_length_mm(build.parameters, spar), 3) for spar in build.parameters.spars
        ],
        "files": [],
    }
    for path in exported:
        manifest["files"].append(_file_record(path))
    manifest_path = destination / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
