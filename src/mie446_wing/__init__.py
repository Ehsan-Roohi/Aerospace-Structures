"""Public interface for the MIE 446 parametric wing starter."""

from .config import K2_PRO_BUILD_VOLUME_MM, SparSpec, WingParameters
from .export import export_build, export_fit_coupon, make_verified_archive
from .geometry import WingBuild, build_wing, make_fit_coupon
from .metrics import PlanformMetrics, calculate_planform_metrics
from .student_workflow import (
    BuiltWingProject,
    CouponNotConfirmedError,
    DesignAnalysis,
    DesignInputError,
    GeometryBuildError,
    ProjectExportError,
    ProjectPackage,
    TipChordComparison,
    WingDesign,
    WingProject,
    WingProjectError,
    make_ai_log,
)
from .validation import ValidationReport, validate_wing
from .visualization import plot_design_overview, plot_modules, plot_shape

__all__ = [
    "K2_PRO_BUILD_VOLUME_MM",
    "BuiltWingProject",
    "CouponNotConfirmedError",
    "DesignAnalysis",
    "DesignInputError",
    "GeometryBuildError",
    "PlanformMetrics",
    "ProjectExportError",
    "ProjectPackage",
    "SparSpec",
    "TipChordComparison",
    "ValidationReport",
    "WingBuild",
    "WingDesign",
    "WingParameters",
    "WingProject",
    "WingProjectError",
    "build_wing",
    "calculate_planform_metrics",
    "export_build",
    "export_fit_coupon",
    "make_ai_log",
    "make_fit_coupon",
    "make_verified_archive",
    "plot_design_overview",
    "plot_modules",
    "plot_shape",
    "validate_wing",
]
