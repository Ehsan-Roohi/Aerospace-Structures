"""Public interface for the MIE 446 parametric wing starter."""

from .config import K2_PRO_BUILD_VOLUME_MM, SparSpec, WingParameters
from .export import export_build, export_fit_coupon, make_verified_archive
from .geometry import WingBuild, build_wing, make_fit_coupon
from .metrics import PlanformMetrics, calculate_planform_metrics
from .validation import ValidationReport, validate_wing
from .visualization import plot_shape

__all__ = [
    "PlanformMetrics",
    "K2_PRO_BUILD_VOLUME_MM",
    "SparSpec",
    "ValidationReport",
    "WingBuild",
    "WingParameters",
    "build_wing",
    "calculate_planform_metrics",
    "export_build",
    "export_fit_coupon",
    "make_fit_coupon",
    "make_verified_archive",
    "plot_shape",
    "validate_wing",
]
