"""Analytical planform quantities used as independent regression checks."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from .config import WingParameters


@dataclass(frozen=True)
class PlanformMetrics:
    semi_wing_area_mm2: float
    equivalent_full_span_mm: float
    equivalent_full_area_mm2: float
    taper_ratio: float
    aspect_ratio: float
    mean_aerodynamic_chord_mm: float

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


def calculate_planform_metrics(parameters: WingParameters) -> PlanformMetrics:
    semi_area = 0.5 * (
        parameters.root_chord_mm + parameters.tip_chord_mm
    ) * parameters.semi_span_mm
    full_span = 2.0 * parameters.semi_span_mm
    full_area = 2.0 * semi_area
    taper = parameters.tip_chord_mm / parameters.root_chord_mm
    aspect_ratio = full_span**2 / full_area
    mean_aerodynamic_chord = (
        2.0
        / 3.0
        * parameters.root_chord_mm
        * (1.0 + taper + taper**2)
        / (1.0 + taper)
    )
    return PlanformMetrics(
        semi_wing_area_mm2=semi_area,
        equivalent_full_span_mm=full_span,
        equivalent_full_area_mm2=full_area,
        taper_ratio=taper,
        aspect_ratio=aspect_ratio,
        mean_aerodynamic_chord_mm=mean_aerodynamic_chord,
    )

