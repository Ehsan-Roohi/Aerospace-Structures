"""CadQuery construction of the non-flying MIE 446 wing demonstrator."""

from __future__ import annotations

from dataclasses import dataclass
from math import sqrt

import cadquery as cq
import numpy as np

from .airfoil import camber_line, cavity_airfoil_wire, outer_airfoil_wire
from .config import SparSpec, WingParameters
from .metrics import PlanformMetrics, calculate_planform_metrics


@dataclass(frozen=True)
class WingBuild:
    parameters: WingParameters
    metrics: PlanformMetrics
    outer: cq.Shape
    cavity: cq.Shape
    skin: cq.Shape
    ribs: tuple[cq.Shape, ...]
    sleeves: tuple[cq.Shape, ...]
    complete: cq.Shape
    modules: tuple[cq.Shape, ...]


def _loft_stations(start: float, end: float, count: int) -> np.ndarray:
    return np.linspace(start, end, count)


def _make_outer(parameters: WingParameters) -> cq.Shape:
    wires = [
        outer_airfoil_wire(
            parameters.naca,
            chord_mm=parameters.chord_at(float(y)),
            y_mm=float(y),
            trailing_edge_mm=parameters.trailing_edge_mm,
            point_count=parameters.airfoil_point_count,
        )
        for y in _loft_stations(0.0, parameters.semi_span_mm, parameters.loft_station_count)
    ]
    outer = cq.Solid.makeLoft(wires, ruled=False)
    if not outer.isValid():
        raise RuntimeError("outer wing loft is invalid")
    return outer


def _make_cavity(parameters: WingParameters) -> cq.Shape:
    start = parameters.root_tip_cap_mm
    end = parameters.semi_span_mm - parameters.root_tip_cap_mm
    wires = [
        cavity_airfoil_wire(
            parameters.naca,
            chord_mm=parameters.chord_at(float(y)),
            y_mm=float(y),
            trailing_edge_mm=parameters.trailing_edge_mm,
            skin_mm=parameters.skin_mm,
            x_start=parameters.cavity_x_start,
            x_end=parameters.cavity_x_end,
            point_count=parameters.airfoil_point_count,
        )
        for y in _loft_stations(start, end, parameters.loft_station_count)
    ]
    cavity = cq.Solid.makeLoft(wires, ruled=False)
    if not cavity.isValid():
        raise RuntimeError("inner cavity loft is invalid")
    return cavity


def _box_for_y_interval(shape: cq.Shape, y0: float, y1: float, margin: float = 2.0) -> cq.Solid:
    bounds = shape.BoundingBox()
    return cq.Solid.makeBox(
        bounds.xlen + 2.0 * margin,
        y1 - y0,
        bounds.zlen + 2.0 * margin,
        cq.Vector(bounds.xmin - margin, y0, bounds.zmin - margin),
    )


def _make_rib(parameters: WingParameters, center_y: float) -> cq.Shape:
    y0 = center_y - parameters.rib_thickness_mm / 2.0
    y1 = center_y + parameters.rib_thickness_mm / 2.0
    wires = [
        outer_airfoil_wire(
            parameters.naca,
            chord_mm=parameters.chord_at(y),
            y_mm=y,
            trailing_edge_mm=parameters.trailing_edge_mm,
            point_count=parameters.airfoil_point_count,
        )
        for y in (y0, y1)
    ]
    rib = cq.Solid.makeLoft(wires, ruled=True)
    if not rib.isValid() or rib.Volume() <= 0:
        raise RuntimeError(f"rib at y={center_y:.3f} mm is invalid")
    return rib


def _spar_endpoints(parameters: WingParameters, spar: SparSpec) -> tuple[cq.Vector, cq.Vector]:
    fraction = np.asarray(spar.chord_fraction)
    yc, _ = camber_line(parameters.naca, fraction)
    camber_fraction = float(yc)
    root = cq.Vector(
        spar.chord_fraction * parameters.root_chord_mm,
        0.0,
        camber_fraction * parameters.root_chord_mm,
    )
    tip = cq.Vector(
        spar.chord_fraction * parameters.tip_chord_mm,
        parameters.semi_span_mm,
        camber_fraction * parameters.tip_chord_mm,
    )
    return root, tip


def _cylinder_between(
    start: cq.Vector,
    end: cq.Vector,
    radius: float,
    *,
    extension: float = 0.0,
) -> cq.Solid:
    delta = end.sub(start)
    length = delta.Length
    direction = delta.normalized()
    origin = start.sub(direction.multiply(extension))
    return cq.Solid.makeCylinder(radius, length + 2.0 * extension, origin, direction)


def _make_sleeve(parameters: WingParameters, spar: SparSpec) -> cq.Shape:
    start, end = _spar_endpoints(parameters, spar)
    sleeve = _cylinder_between(start, end, spar.sleeve_radius_mm)
    if not sleeve.isValid() or sleeve.Volume() <= 0:
        raise RuntimeError(f"sleeve at x/c={spar.chord_fraction:.3f} is invalid")
    return sleeve


def _fuse_all(base: cq.Shape, additions: tuple[cq.Shape, ...]) -> cq.Shape:
    if not additions:
        return base
    result = base.fuse(*additions, glue=True).clean()
    if not result.isValid() or len(result.Solids()) != 1:
        result = base.fuse(*additions).clean()
    return result


def _cut_spar_holes(body: cq.Shape, parameters: WingParameters) -> cq.Shape:
    holes = []
    for spar in parameters.spars:
        start, end = _spar_endpoints(parameters, spar)
        holes.append(_cylinder_between(start, end, spar.hole_radius_mm, extension=2.0))
    return body.cut(*holes).clean()


def _segment(body: cq.Shape, parameters: WingParameters) -> tuple[cq.Shape, ...]:
    modules: list[cq.Shape] = []
    bounds = parameters.module_bounds_mm()
    for y0, y1 in zip(bounds[:-1], bounds[1:], strict=True):
        clip = _box_for_y_interval(body, y0, y1)
        module = body.intersect(clip).clean()
        if not module.isValid() or module.Volume() <= 0:
            raise RuntimeError(f"module from y={y0:.3f} to {y1:.3f} mm is invalid")
        modules.append(module)
    return tuple(modules)


def build_wing(parameters: WingParameters | None = None) -> WingBuild:
    """Build the complete wing and its printable modules."""

    parameters = parameters or WingParameters()
    metrics = calculate_planform_metrics(parameters)
    outer = _make_outer(parameters)
    cavity = _make_cavity(parameters)
    skin = outer.cut(cavity).clean()
    if not skin.isValid() or skin.Volume() <= 0:
        raise RuntimeError("outer minus cavity did not create a valid printable skin")

    ribs = tuple(_make_rib(parameters, station) for station in parameters.rib_stations_mm())
    sleeves = tuple(_make_sleeve(parameters, spar) for spar in parameters.spars)
    body = _fuse_all(skin, sleeves + ribs)
    complete = _cut_spar_holes(body, parameters)
    if not complete.isValid() or complete.Volume() <= 0:
        raise RuntimeError("final wing geometry is invalid")
    modules = _segment(complete, parameters)
    return WingBuild(
        parameters=parameters,
        metrics=metrics,
        outer=outer,
        cavity=cavity,
        skin=skin,
        ribs=ribs,
        sleeves=sleeves,
        complete=complete,
        modules=modules,
    )


def make_fit_coupon(
    parameters: WingParameters | None = None,
    clearances_mm: tuple[float, ...] = (0.15, 0.25, 0.35),
) -> tuple[cq.Shape, dict[str, float | str]]:
    """Create a horizontal-hole coupon for selecting rod clearance before design freeze."""

    parameters = parameters or WingParameters()
    rod_diameter = parameters.spars[0].rod_diameter_mm
    spacing = 20.0
    length = spacing * (len(clearances_mm) + 1)
    width = 14.0
    height = max(10.0, rod_diameter + 6.0)
    coupon: cq.Shape = cq.Solid.makeBox(length, width, height)
    mapping: dict[str, float | str] = {
        "physical_marker_legend": (
            "Hole 1 has one top-face dimple, Hole 2 has two, and Hole 3 has three."
        )
    }
    for index, clearance in enumerate(clearances_mm, start=1):
        if clearance <= 0:
            raise ValueError("coupon clearances must be positive")
        x = spacing * index
        diameter = rod_diameter + 2.0 * clearance
        hole = cq.Solid.makeCylinder(
            diameter / 2.0,
            width + 2.0,
            cq.Vector(x, -1.0, height / 2.0),
            cq.Vector(0.0, 1.0, 0.0),
        )
        coupon = coupon.cut(hole)
        for marker_index in range(index):
            marker_x = x + (marker_index - (index - 1) / 2.0) * 2.4
            marker = cq.Solid.makeCylinder(
                0.65,
                0.8,
                cq.Vector(marker_x, width - 2.0, height),
                cq.Vector(0.0, 0.0, -1.0),
            )
            coupon = coupon.cut(marker)
        mapping[f"hole_{index}_diameter_mm"] = diameter
        mapping[f"hole_{index}_radial_clearance_mm"] = clearance
        mapping[f"hole_{index}_physical_marker"] = f"{index} top-face dimple(s)"
    if not coupon.isValid():
        raise RuntimeError("fit coupon geometry is invalid")
    return coupon.clean(), mapping


def spar_length_mm(parameters: WingParameters, spar: SparSpec) -> float:
    """Return the straight-line length of one course-issued carbon rod."""

    start, end = _spar_endpoints(parameters, spar)
    delta = end.sub(start)
    return sqrt(delta.x**2 + delta.y**2 + delta.z**2)
