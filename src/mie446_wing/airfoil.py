"""NACA four-digit equations and CadQuery section wires."""

from __future__ import annotations

from dataclasses import dataclass

import cadquery as cq
import numpy as np

from .config import normalize_naca4


@dataclass(frozen=True)
class AirfoilSection:
    x_upper: np.ndarray
    z_upper: np.ndarray
    x_lower: np.ndarray
    z_lower: np.ndarray
    camber_x: np.ndarray
    camber_z: np.ndarray


def cosine_spacing(count: int, start: float = 0.0, end: float = 1.0) -> np.ndarray:
    beta = np.linspace(0.0, np.pi, count)
    unit = 0.5 * (1.0 - np.cos(beta))
    return start + (end - start) * unit


def naca4_parameters(code: str) -> tuple[float, float, float]:
    digits = normalize_naca4(code)
    return int(digits[0]) / 100.0, int(digits[1]) / 10.0, int(digits[2:]) / 100.0


def camber_line(code: str, x: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
    """Return nondimensional camber ordinate and slope at x/c."""

    m, p, _ = naca4_parameters(code)
    values = np.asarray(x, dtype=float)
    if np.any((values < 0.0) | (values > 1.0)):
        raise ValueError("x/c must lie between 0 and 1")
    if m == 0.0:
        return np.zeros_like(values), np.zeros_like(values)

    forward = values < p
    yc = np.empty_like(values)
    slope = np.empty_like(values)
    yc[forward] = m / p**2 * (2.0 * p * values[forward] - values[forward] ** 2)
    slope[forward] = 2.0 * m / p**2 * (p - values[forward])
    aft = ~forward
    yc[aft] = m / (1.0 - p) ** 2 * (
        1.0 - 2.0 * p + 2.0 * p * values[aft] - values[aft] ** 2
    )
    slope[aft] = 2.0 * m / (1.0 - p) ** 2 * (p - values[aft])
    return yc, slope


def half_thickness(
    code: str,
    x: np.ndarray | float,
    *,
    chord_mm: float,
    trailing_edge_mm: float,
) -> np.ndarray:
    """Return nondimensional NACA half-thickness with a printable blunt trailing edge."""

    _, _, thickness_ratio = naca4_parameters(code)
    values = np.asarray(x, dtype=float)
    yt = 5.0 * thickness_ratio * (
        0.2969 * np.sqrt(values)
        - 0.1260 * values
        - 0.3516 * values**2
        + 0.2843 * values**3
        - 0.1015 * values**4
    )
    requested_half_te = trailing_edge_mm / (2.0 * chord_mm)
    natural_half_te = 5.0 * thickness_ratio * (
        0.2969 - 0.1260 - 0.3516 + 0.2843 - 0.1015
    )
    yt = yt + (requested_half_te - natural_half_te) * values**4
    return yt


def naca4_section(
    code: str,
    *,
    chord_mm: float = 1.0,
    trailing_edge_mm: float = 0.0,
    point_count: int = 81,
) -> AirfoilSection:
    """Generate upper/lower surface points in physical millimetres."""

    if chord_mm <= 0:
        raise ValueError("chord_mm must be positive")
    if trailing_edge_mm < 0:
        raise ValueError("trailing_edge_mm cannot be negative")
    x = cosine_spacing(point_count)
    yc, slope = camber_line(code, x)
    theta = np.arctan(slope)
    yt = half_thickness(
        code,
        x,
        chord_mm=chord_mm,
        trailing_edge_mm=trailing_edge_mm,
    )
    xu = (x - yt * np.sin(theta)) * chord_mm
    zu = (yc + yt * np.cos(theta)) * chord_mm
    xl = (x + yt * np.sin(theta)) * chord_mm
    zl = (yc - yt * np.cos(theta)) * chord_mm
    return AirfoilSection(
        x_upper=xu,
        z_upper=zu,
        x_lower=xl,
        z_lower=zl,
        camber_x=x * chord_mm,
        camber_z=yc * chord_mm,
    )


def surface_ordinates_at(
    code: str,
    x_over_c: np.ndarray | float,
    *,
    chord_mm: float,
    trailing_edge_mm: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return lower, camber, and upper z values at base x/c locations."""

    x = np.asarray(x_over_c, dtype=float)
    yc, slope = camber_line(code, x)
    yt = half_thickness(
        code,
        x,
        chord_mm=chord_mm,
        trailing_edge_mm=trailing_edge_mm,
    )
    vertical_half = yt * np.cos(np.arctan(slope))
    return (
        (yc - vertical_half) * chord_mm,
        yc * chord_mm,
        (yc + vertical_half) * chord_mm,
    )


def _closed_wire(upper: list[cq.Vector], lower: list[cq.Vector]) -> cq.Wire:
    edges: list[cq.Edge] = [cq.Edge.makeSpline(upper)]
    if upper[-1].sub(lower[-1]).Length > 1.0e-7:
        edges.append(cq.Edge.makeLine(upper[-1], lower[-1]))
    edges.append(cq.Edge.makeSpline(list(reversed(lower))))
    if lower[0].sub(upper[0]).Length > 1.0e-7:
        edges.append(cq.Edge.makeLine(lower[0], upper[0]))
    wire = cq.Wire.assembleEdges(edges)
    face = cq.Face.makeFromWires(wire)
    if not wire.isValid() or not face.isValid() or face.Area() <= 0:
        raise RuntimeError("CadQuery could not create a valid airfoil section wire")
    return wire


def outer_airfoil_wire(
    code: str,
    *,
    chord_mm: float,
    y_mm: float,
    trailing_edge_mm: float,
    point_count: int,
) -> cq.Wire:
    section = naca4_section(
        code,
        chord_mm=chord_mm,
        trailing_edge_mm=trailing_edge_mm,
        point_count=point_count,
    )
    upper = [
        cq.Vector(float(x), y_mm, float(z))
        for x, z in zip(section.x_upper, section.z_upper, strict=True)
    ]
    lower = [
        cq.Vector(float(x), y_mm, float(z))
        for x, z in zip(section.x_lower, section.z_lower, strict=True)
    ]
    return _closed_wire(upper, lower)


def cavity_airfoil_wire(
    code: str,
    *,
    chord_mm: float,
    y_mm: float,
    trailing_edge_mm: float,
    skin_mm: float,
    x_start: float,
    x_end: float,
    point_count: int,
) -> cq.Wire:
    xq = cosine_spacing(max(31, point_count // 2), x_start, x_end)
    lower_z, _, upper_z = surface_ordinates_at(
        code,
        xq,
        chord_mm=chord_mm,
        trailing_edge_mm=trailing_edge_mm,
    )
    upper_inner = upper_z - skin_mm
    lower_inner = lower_z + skin_mm
    minimum_depth = float(np.min(upper_inner - lower_inner))
    if minimum_depth < 0.8:
        raise ValueError(
            f"inner cavity collapses at chord {chord_mm:.3f} mm; "
            f"minimum remaining depth is {minimum_depth:.3f} mm"
        )
    upper = [cq.Vector(float(x * chord_mm), y_mm, float(z)) for x, z in zip(xq, upper_inner)]
    lower = [cq.Vector(float(x * chord_mm), y_mm, float(z)) for x, z in zip(xq, lower_inner)]
    return _closed_wire(upper, lower)
