"""Friendly, high-level workflow used by the student Colab notebook."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
import re
from typing import Any

from .airfoil import naca4_parameters
from .config import SparSpec, WingParameters
from .export import export_build, export_fit_coupon, make_verified_archive
from .geometry import WingBuild, build_wing
from .metrics import PlanformMetrics, calculate_planform_metrics
from .validation import ValidationReport, validate_wing
from .visualization import plot_design_overview


_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


class WingProjectError(RuntimeError):
    """Base class for student-facing workflow errors."""


class DesignInputError(WingProjectError):
    """The form contains an invalid or internally inconsistent value."""


class CouponNotConfirmedError(WingProjectError):
    """The final wing was requested before the physical fit check."""


class GeometryBuildError(WingProjectError):
    """CadQuery could not produce a valid version of the requested design."""


class ProjectExportError(WingProjectError):
    """A revision could not be exported without overwriting or mixing files."""


def _project_token(value: str, label: str) -> str:
    token = str(value).strip()
    if not _TOKEN.fullmatch(token):
        raise DesignInputError(
            f"{label} must start with a letter or number and use only letters, "
            "numbers, hyphens, or underscores."
        )
    return token


def _direction(value: float, tolerance: float = 1.0e-9) -> str:
    if value > tolerance:
        return "increase"
    if value < -tolerance:
        return "decrease"
    return "no change"


def _markdown_value(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    return str(value).replace("|", "\\|").replace("\n", "<br>")


def _record_table(values: dict[str, Any]) -> str:
    rows = [
        f"| {key.replace('_', ' ').title()} | {_markdown_value(value)} |"
        for key, value in values.items()
    ]
    return "\n".join(["| Field | Recorded value |", "|---|---|", *rows])


@dataclass(frozen=True)
class WingDesign:
    """The eight engineering inputs a student may change."""

    naca: str = "2412"
    semi_span_mm: float = 450.0
    root_chord_mm: float = 160.0
    tip_chord_mm: float = 100.0
    skin_mm: float = 1.20
    rib_thickness_mm: float = 1.60
    module_count: int = 3
    rod_clearance_mm: float = 0.25

    def __post_init__(self) -> None:
        try:
            parameters = self.to_parameters()
        except ValueError as exc:
            raise DesignInputError(
                f"One or more design entries are not valid: {exc}"
            ) from exc
        object.__setattr__(self, "naca", parameters.naca)

    def to_parameters(self) -> WingParameters:
        """Apply instructor-locked fabrication settings."""

        for name, value in {
            "skin_mm": self.skin_mm,
            "rib_thickness_mm": self.rib_thickness_mm,
        }.items():
            if float(value) < 0.8:
                raise ValueError(
                    f"{name} must be at least 0.8 mm for the course 0.4 mm nozzle"
                )
        course_spars = (
            SparSpec(
                0.30,
                rod_diameter_mm=4.0,
                radial_clearance_mm=self.rod_clearance_mm,
                sleeve_wall_mm=1.20,
            ),
            SparSpec(
                0.60,
                rod_diameter_mm=4.0,
                radial_clearance_mm=self.rod_clearance_mm,
                sleeve_wall_mm=1.20,
            ),
        )
        return WingParameters(
            naca=self.naca,
            semi_span_mm=self.semi_span_mm,
            root_chord_mm=self.root_chord_mm,
            tip_chord_mm=self.tip_chord_mm,
            skin_mm=self.skin_mm,
            trailing_edge_mm=1.20,
            rib_thickness_mm=self.rib_thickness_mm,
            interior_rib_count=3,
            module_count=self.module_count,
            maximum_printed_mass_g=300.0,
            spars=course_spars,
        )


@dataclass(frozen=True)
class ProjectPackage:
    """Files created by a coupon or submission export."""

    output_dir: Path
    archive_path: Path
    manifest: dict[str, Any]


@dataclass(frozen=True)
class TipChordComparison:
    """Analytical result for one controlled tip-chord change."""

    original_tip_chord_mm: float
    comparison_tip_chord_mm: float
    full_area_change_mm2: float
    aspect_ratio_change: float

    @property
    def area_direction(self) -> str:
        return _direction(self.full_area_change_mm2)

    @property
    def aspect_ratio_direction(self) -> str:
        return _direction(self.aspect_ratio_change)

    def to_markdown(self) -> str:
        return "\n".join(
            [
                "### Controlled-change result",
                "",
                "| Quantity | Automatic result |",
                "|---|---:|",
                f"| Original tip chord | {self.original_tip_chord_mm:.2f} mm |",
                f"| Comparison tip chord | {self.comparison_tip_chord_mm:.2f} mm |",
                f"| Full-wing area change | {self.full_area_change_mm2:+,.2f} mm² ({self.area_direction}) |",
                f"| Aspect-ratio change | {self.aspect_ratio_change:+.4f} ({self.aspect_ratio_direction}) |",
                "",
                "Explain whether the computed directions agree with your prediction.",
            ]
        )


@dataclass(frozen=True)
class DesignAnalysis:
    """Fast analytical results produced before expensive CAD generation."""

    parameters: WingParameters
    metrics: PlanformMetrics
    validation: ValidationReport

    def compare_tip_chord(self, comparison_tip_chord_mm: float) -> TipChordComparison:
        try:
            candidate = replace(
                self.parameters,
                tip_chord_mm=float(comparison_tip_chord_mm),
            )
        except ValueError as exc:
            raise DesignInputError(
                f"The comparison tip chord is not valid: {exc}"
            ) from exc
        candidate_metrics = calculate_planform_metrics(candidate)
        return TipChordComparison(
            original_tip_chord_mm=self.parameters.tip_chord_mm,
            comparison_tip_chord_mm=candidate.tip_chord_mm,
            full_area_change_mm2=(
                candidate_metrics.equivalent_full_area_mm2
                - self.metrics.equivalent_full_area_mm2
            ),
            aspect_ratio_change=candidate_metrics.aspect_ratio - self.metrics.aspect_ratio,
        )

    def to_markdown(self) -> str:
        maximum_camber, camber_position, thickness = naca4_parameters(
            self.parameters.naca
        )
        if maximum_camber == 0.0:
            camber_description = "symmetric (zero design camber)"
        else:
            camber_description = (
                f"{100 * maximum_camber:.0f}% maximum camber at "
                f"{100 * camber_position:.0f}% chord"
            )
        check_rows = [
            f"| {'PASS' if check.passed else 'FAIL'} | {check.name} | "
            f"{_markdown_value(check.value)} | {_markdown_value(check.requirement)} |"
            for check in self.validation.checks
        ]
        return "\n".join(
            [
                "### Automatic design report",
                "",
                "| Design quantity | Value |",
                "|---|---:|",
                f"| Airfoil | NACA {self.parameters.naca} |",
                f"| Airfoil meaning | {camber_description}; {100 * thickness:.0f}% thickness |",
                f"| Physical semi-span | {self.parameters.semi_span_mm:.2f} mm |",
                f"| Equivalent full span | {self.metrics.equivalent_full_span_mm:.2f} mm |",
                f"| Root / tip chord | {self.parameters.root_chord_mm:.2f} / {self.parameters.tip_chord_mm:.2f} mm |",
                f"| Taper ratio | {self.metrics.taper_ratio:.4f} |",
                f"| Equivalent full-wing area | {self.metrics.equivalent_full_area_mm2:,.2f} mm² |",
                f"| Aspect ratio | {self.metrics.aspect_ratio:.4f} |",
                f"| Mean aerodynamic chord | {self.metrics.mean_aerodynamic_chord_mm:.2f} mm |",
                f"| Modules | {self.parameters.module_count} × {self.parameters.semi_span_mm / self.parameters.module_count:.2f} mm nominal span |",
                "",
                "### Automatic input checks",
                "",
                "| Status | Check | Value | Requirement |",
                "|---|---|---:|---|",
                *check_rows,
                "",
                "These calculations check the inputs; they do not certify flight or load capacity.",
            ]
        )


@dataclass(frozen=True)
class BuiltWingProject:
    """A generated CAD wing and its independent validation report."""

    project: WingProject
    analysis: DesignAnalysis
    build: WingBuild
    validation: ValidationReport

    @property
    def estimated_fully_dense_mass_g(self) -> float:
        return (
            self.build.complete.Volume()
            / 1000.0
            * self.build.parameters.pla_density_g_cm3
        )

    def to_markdown(self) -> str:
        module_rows = []
        for index, module in enumerate(self.build.modules, start=1):
            bounds = module.BoundingBox()
            module_rows.append(
                f"| {index} | {bounds.xlen:.2f} × {bounds.ylen:.2f} × {bounds.zlen:.2f} | {module.Volume():,.1f} |"
            )
        validation_rows = [
            f"| {'PASS' if check.passed else 'FAIL'} | {check.name} | "
            f"{_markdown_value(check.value)} | {_markdown_value(check.requirement)} |"
            for check in self.validation.checks
        ]
        return "\n".join(
            [
                "### 3D build and validation report",
                "",
                f"**Overall result: {'PASS' if self.validation.passed else 'FAIL'}**",
                "",
                f"Estimated fully dense PLA mass: **{self.estimated_fully_dense_mass_g:.2f} g**  ",
                f"Connected printable modules: **{len(self.build.modules)}**",
                "",
                "| Module | Bounding box X × Y × Z (mm) | CAD material volume (mm³) |",
                "|---:|---:|---:|",
                *module_rows,
                "",
                "### 3D validation checks",
                "",
                "| Status | Check | Value | Requirement |",
                "|---|---|---|---|",
                *validation_rows,
                "",
                "The slicer preview and physical inspection are still required.",
            ]
        )

    def export_submission(
        self,
        output_root: str | Path,
        *,
        ai_log: list[dict[str, Any]],
        student_record: dict[str, Any] | None = None,
    ) -> ProjectPackage:
        root = Path(output_root)
        destination = (
            root
            / f"MIE446_{self.project.team_id}_{self.project.revision}"
        )
        try:
            manifest = export_build(
                self.build,
                destination,
                team=self.project.team_id,
                revision=self.project.revision,
                ai_log=ai_log,
                student_record=student_record,
                design_summary_markdown=self.design_summary(student_record),
                design_overview_html=plot_design_overview(
                    self.analysis.parameters
                ).to_html(full_html=True, include_plotlyjs=True),
            )
            archive = make_verified_archive(destination)
        except (OSError, RuntimeError, TypeError, ValueError) as exc:
            raise ProjectExportError(
                f"The submission package could not be created: {exc}"
            ) from exc
        return ProjectPackage(destination, archive, manifest)

    def design_summary(self, student_record: dict[str, Any] | None = None) -> str:
        sections = [
            f"# MIE 446 Design Summary — {self.project.team_id} {self.project.revision}",
            "",
            self.analysis.to_markdown(),
            "",
            self.to_markdown(),
        ]
        if student_record is not None:
            project_fields = {
                key: student_record.get(key)
                for key in (
                    "course_release",
                    "team_id",
                    "team_members",
                    "revision",
                    "workflow_stage",
                )
            }
            coupon_record = student_record.get("coupon_record")
            engineering_responses = student_record.get("engineering_responses")
            sections.extend(
                [
                    "",
                    "### Team and workflow record",
                    "",
                    _record_table(project_fields),
                    "",
                    "### Physical fit-coupon record",
                    "",
                    _record_table(
                        coupon_record if isinstance(coupon_record, dict) else {}
                    ),
                    "",
                    "### Engineering responses and comparison",
                    "",
                    _record_table(
                        engineering_responses
                        if isinstance(engineering_responses, dict)
                        else {}
                    ),
                    "",
                    "### AI-use declaration",
                    "",
                    _markdown_value(student_record.get("ai_use_declaration")),
                ]
            )
        sections.extend(
            [
                "",
                "This non-flying fabrication demonstrator is not certified for flight or load capacity.",
            ]
        )
        return "\n".join(sections)


@dataclass(frozen=True)
class WingProject:
    """One team's high-level project façade."""

    design: WingDesign
    team_id: str = "Team00"
    revision: str = "R01"

    def __post_init__(self) -> None:
        object.__setattr__(self, "team_id", _project_token(self.team_id, "team_id"))
        object.__setattr__(self, "revision", _project_token(self.revision, "revision"))

    @property
    def parameters(self) -> WingParameters:
        return self.design.to_parameters()

    def with_clearance(
        self,
        rod_clearance_mm: float,
        *,
        revision: str,
    ) -> WingProject:
        return replace(
            self,
            design=replace(
                self.design,
                rod_clearance_mm=float(rod_clearance_mm),
            ),
            revision=revision,
        )

    def analyze(self) -> DesignAnalysis:
        parameters = self.parameters
        report = validate_wing(parameters=parameters)
        if not report.passed:
            raise DesignInputError(
                "The requested design failed the automatic input checks:\n"
                + report.summary()
            )
        return DesignAnalysis(
            parameters=parameters,
            metrics=calculate_planform_metrics(parameters),
            validation=report,
        )

    def make_coupon(self, output_root: str | Path) -> ProjectPackage:
        root = Path(output_root)
        destination = root / f"MIE446_{self.team_id}_{self.revision}_FitCoupon"
        try:
            manifest = export_fit_coupon(
                self.parameters,
                destination,
                team=self.team_id,
                revision=self.revision,
            )
            archive = make_verified_archive(
                destination,
                manifest_name="fit_coupon_manifest.json",
            )
        except (OSError, RuntimeError, ValueError) as exc:
            raise ProjectExportError(
                f"The fit-coupon package could not be created: {exc}"
            ) from exc
        return ProjectPackage(destination, archive, manifest)

    def build(self, *, coupon_confirmed: bool) -> BuiltWingProject:
        if not coupon_confirmed:
            raise CouponNotConfirmedError(
                "Final CAD is locked. Print the rod-fit coupon, test the course rod, "
                "select the measured clearance, and check COUPON_CONFIRMED."
            )
        analysis = self.analyze()
        try:
            wing_build = build_wing(analysis.parameters)
        except (RuntimeError, ValueError) as exc:
            raise GeometryBuildError(
                f"CadQuery could not build this design: {exc}"
            ) from exc
        report = validate_wing(wing_build)
        if not report.passed:
            raise GeometryBuildError(
                "The generated CAD failed validation:\n" + report.summary()
            )
        return BuiltWingProject(self, analysis, wing_build, report)


def make_ai_log(
    *,
    ai_used: bool,
    tool: str = "",
    purpose: str = "",
    affected_code_or_claim: str = "",
    student_change: str = "",
    independent_check: str = "",
    error_or_limitation_found: str = "",
    verdict: str = "Accept with Limitations",
) -> list[dict[str, str]]:
    """Convert simple notebook form fields into the required log structure."""

    if not ai_used:
        return []
    entry = {
        "tool": str(tool).strip(),
        "purpose": str(purpose).strip(),
        "affected_code_or_claim": str(affected_code_or_claim).strip(),
        "student_change": str(student_change).strip(),
        "independent_check": str(independent_check).strip(),
        "error_or_limitation_found": str(error_or_limitation_found).strip(),
        "verdict": str(verdict).strip(),
    }
    missing = [key for key, value in entry.items() if not value]
    if missing:
        raise DesignInputError(
            f"AI_USED is checked, so these AI form fields cannot be blank: {missing}"
        )
    if entry["verdict"] not in {"Accept", "Accept with Limitations", "Reject"}:
        raise DesignInputError(
            "AI verdict must be Accept, Accept with Limitations, or Reject."
        )
    return [entry]
