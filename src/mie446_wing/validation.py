"""Independent analytical and geometric checks for AI-assisted designs."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any

import numpy as np

from .airfoil import surface_ordinates_at
from .config import K2_PRO_BUILD_VOLUME_MM, WingParameters
from .geometry import WingBuild
from .metrics import calculate_planform_metrics


@dataclass(frozen=True)
class ValidationCheck:
    name: str
    passed: bool
    value: Any
    requirement: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ValidationReport:
    checks: tuple[ValidationCheck, ...]

    @property
    def passed(self) -> bool:
        return all(check.passed for check in self.checks)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "checks": [check.to_dict() for check in self.checks],
        }

    def to_json(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    def summary(self) -> str:
        rows = ["PASS" if self.passed else "FAIL"]
        for check in self.checks:
            state = "PASS" if check.passed else "FAIL"
            rows.append(f"[{state}] {check.name}: {check.value} ({check.requirement})")
        return "\n".join(rows)

    def raise_for_failure(self) -> None:
        failed = [check for check in self.checks if not check.passed]
        if failed:
            names = ", ".join(check.name for check in failed)
            raise ValueError(f"wing validation failed: {names}")


def _minimum_spar_surface_clearance(parameters: WingParameters) -> float:
    minimum = float("inf")
    for y in np.linspace(0.0, parameters.semi_span_mm, 11):
        chord = parameters.chord_at(float(y))
        for spar in parameters.spars:
            lower, camber, upper = surface_ordinates_at(
                parameters.naca,
                np.asarray([spar.chord_fraction]),
                chord_mm=chord,
                trailing_edge_mm=parameters.trailing_edge_mm,
            )
            vertical_room = min(float(upper[0] - camber[0]), float(camber[0] - lower[0]))
            minimum = min(minimum, vertical_room - spar.sleeve_radius_mm)
    return minimum


def validate_wing(
    build: WingBuild | None = None,
    parameters: WingParameters | None = None,
) -> ValidationReport:
    """Evaluate analytical values first, then CAD checks when a build is supplied."""

    if build is not None:
        parameters = build.parameters
    parameters = parameters or WingParameters()
    metrics = calculate_planform_metrics(parameters)
    checks: list[ValidationCheck] = [
        ValidationCheck(
            "module count",
            parameters.module_count in (2, 3),
            parameters.module_count,
            "2 or 3 for the 300 mm K2 Pro build envelope",
        ),
        ValidationCheck(
            "semi-wing area",
            metrics.semi_wing_area_mm2 > 0,
            round(metrics.semi_wing_area_mm2, 6),
            "positive analytical trapezoid area",
        ),
        ValidationCheck(
            "nominal module span",
            parameters.semi_span_mm / parameters.module_count
            <= K2_PRO_BUILD_VOLUME_MM[1],
            round(parameters.semi_span_mm / parameters.module_count, 3),
            f"<= {K2_PRO_BUILD_VOLUME_MM[1]:.0f} mm before slicer orientation",
        ),
        ValidationCheck(
            "maximum chord",
            max(parameters.root_chord_mm, parameters.tip_chord_mm)
            <= K2_PRO_BUILD_VOLUME_MM[0],
            round(max(parameters.root_chord_mm, parameters.tip_chord_mm), 3),
            f"<= {K2_PRO_BUILD_VOLUME_MM[0]:.0f} mm before slicer orientation",
        ),
        ValidationCheck(
            "skin thickness",
            parameters.skin_mm >= 0.8,
            round(parameters.skin_mm, 3),
            ">= 0.8 mm for the course 0.4 mm nozzle",
        ),
        ValidationCheck(
            "trailing-edge thickness",
            parameters.trailing_edge_mm >= 0.8,
            round(parameters.trailing_edge_mm, 3),
            ">= 0.8 mm for the course 0.4 mm nozzle",
        ),
        ValidationCheck(
            "rib thickness",
            parameters.rib_thickness_mm >= 0.8,
            round(parameters.rib_thickness_mm, 3),
            ">= 0.8 mm for the course 0.4 mm nozzle",
        ),
        ValidationCheck(
            "spar sleeve surface clearance",
            _minimum_spar_surface_clearance(parameters) >= 0.6,
            round(_minimum_spar_surface_clearance(parameters), 3),
            "at least 0.6 mm at 11 spanwise stations",
        ),
    ]

    if build is not None:
        complete_solids = len(build.complete.Solids())
        module_solids = [len(module.Solids()) for module in build.modules]
        complete_volume = build.complete.Volume()
        module_volume = sum(module.Volume() for module in build.modules)
        volume_error = abs(module_volume - complete_volume) / complete_volume
        mass_g = complete_volume / 1000.0 * parameters.pla_density_g_cm3
        module_dimensions = [
            (
                module.BoundingBox().xlen,
                module.BoundingBox().ylen,
                module.BoundingBox().zlen,
            )
            for module in build.modules
        ]
        sorted_envelope = sorted(K2_PRO_BUILD_VOLUME_MM)
        modules_fit_envelope = all(
            all(
                dimension <= limit + 0.05
                for dimension, limit in zip(sorted(dimensions), sorted_envelope, strict=True)
            )
            for dimensions in module_dimensions
        )
        checks.extend(
            [
                ValidationCheck(
                    "complete B-rep",
                    build.complete.isValid(),
                    build.complete.isValid(),
                    "CadQuery isValid() is true",
                ),
                ValidationCheck(
                    "connected complete wing",
                    complete_solids == 1,
                    complete_solids,
                    "exactly one connected solid",
                ),
                ValidationCheck(
                    "printable module count",
                    len(build.modules) == parameters.module_count,
                    len(build.modules),
                    f"exactly {parameters.module_count}",
                ),
                ValidationCheck(
                    "connected modules",
                    all(count == 1 for count in module_solids),
                    module_solids,
                    "one connected solid per module",
                ),
                ValidationCheck(
                    "module B-reps",
                    all(module.isValid() for module in build.modules),
                    [module.isValid() for module in build.modules],
                    "every module is valid",
                ),
                ValidationCheck(
                    "segmentation volume conservation",
                    volume_error <= 5.0e-4,
                    round(volume_error, 8),
                    "relative error <= 5e-4",
                ),
                ValidationCheck(
                    "estimated fully dense plastic mass",
                    mass_g <= parameters.maximum_printed_mass_g,
                    round(mass_g, 2),
                    f"<= {parameters.maximum_printed_mass_g:.1f} g",
                ),
                ValidationCheck(
                    "printer build envelope",
                    modules_fit_envelope,
                    [tuple(round(value, 3) for value in item) for item in module_dimensions],
                    "each module can be oriented inside 300 x 300 x 300 mm; slicer check required",
                ),
            ]
        )
    return ValidationReport(tuple(checks))
