"""Traceable STL, 3MF, STEP, configuration, metrics, and validation export."""

from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any

import cadquery as cq

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


def export_build(
    build: WingBuild,
    output_dir: str | Path,
    *,
    team: str = "Team00",
    revision: str = "R01",
) -> dict[str, Any]:
    """Export a validated build and return its machine-readable manifest."""

    team = _safe_token(team, "team")
    revision = _safe_token(revision, "revision")
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)

    report = validate_wing(build)
    report.raise_for_failure()
    build.parameters.to_json(destination / "wing_parameters.json")
    (destination / "planform_metrics.json").write_text(
        json.dumps(build.metrics.to_dict(), indent=2), encoding="utf-8"
    )
    report.to_json(destination / "validation_report.json")

    exported: list[Path] = []
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
    (destination / "fit_coupon_mapping.json").write_text(
        json.dumps(coupon_mapping, indent=2), encoding="utf-8"
    )

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
        manifest["files"].append(
            {
                "name": path.name,
                "bytes": path.stat().st_size,
                "sha256": _sha256(path),
            }
        )
    manifest_path = destination / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest

