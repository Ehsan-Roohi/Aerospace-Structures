"""Public interface for the MIE 446 parametric wing starter."""

from .config import SparSpec, WingParameters
from .export import export_build
from .geometry import WingBuild, build_wing, make_fit_coupon
from .metrics import PlanformMetrics, calculate_planform_metrics
from .validation import ValidationReport, validate_wing
from .visualization import plot_shape

__all__ = [
    "PlanformMetrics",
    "SparSpec",
    "ValidationReport",
    "WingBuild",
    "WingParameters",
    "build_wing",
    "calculate_planform_metrics",
    "export_build",
    "make_fit_coupon",
    "plot_shape",
    "validate_wing",
]

