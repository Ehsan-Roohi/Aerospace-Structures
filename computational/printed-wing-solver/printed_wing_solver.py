"""Structural solver for the MIE 446 3D-printed Code-to-Print semi-wing.

What is modelled
----------------
The *as-printed* wing produced by the course CadQuery generator (``mie446_wing`` v1.1.1):
a NACA four-digit PLA shell whose inner surface is offset vertically by the skin thickness,
a solid nose (0 to 6 % chord), a solid trailing-edge strip (90 to 100 % chord), two printed
rod sleeves centred on the camber line, two carbon rods, full-depth ribs and two or three
separately printed modules.

Model chain (every step has an independent check)
-------------------------------------------------
1. Exact cross-section at any span station, built with the same equations as the CAD code.
2. Section properties: exact polygon integration (area, centroid, second moments) and a
   2-D finite-element warping analysis (torsion constant, shear centre, shear stress) with
   a thin-wall Bredt-Batho check of the torsion constant.
3. Spanwise loads: lift distribution times load factor, chordwise lift position, inertia relief.
4. Beam response by two methods: direct integration of curvature/twist, and a 1-D
   Euler-Bernoulli / St-Venant finite-element model that also gives natural frequencies.
5. Screening checks: PLA tension, compression and shear, skin buckling, rod bending and rib
   bearing at dry module seams, adhesive stress at bonded seams, deflection and twist.

Units: millimetre, newton, megapascal (N/mm^2), second. Masses are reported in grams.

Limits: linear elastic, small deflection, plane sections between ribs, printed PLA treated as
homogeneous with one spanwise modulus, no stress concentrations, shear lag, creep or detailed
joint/rib failure. This is a teaching analysis. It does not authorise loading, flying or
testing a student wing.
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field, replace
from functools import lru_cache

import numpy as np
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

__version__ = "1.0.0"
GRAVITY_M_S2 = 9.81


# ---------------------------------------------------------------------------
# 1. Material cards
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Material:
    """Linear-elastic card used for stresses acting along the span."""

    name: str
    E_MPa: float
    poisson: float
    density_g_cm3: float
    tensile_MPa: float
    compressive_MPa: float
    shear_MPa: float
    G_MPa_override: float | None = None
    source: str = ""

    def __post_init__(self) -> None:
        for key in ("E_MPa", "density_g_cm3", "tensile_MPa", "compressive_MPa", "shear_MPa"):
            value = getattr(self, key)
            if not (math.isfinite(value) and value > 0):
                raise ValueError(f"{self.name}: {key} must be positive and finite")
        if not -1.0 < self.poisson < 0.5:
            raise ValueError(f"{self.name}: Poisson's ratio must lie between -1 and 0.5")
        if self.G_MPa_override is not None and self.G_MPa_override <= 0:
            raise ValueError(f"{self.name}: shear modulus must be positive")

    @property
    def G_MPa(self) -> float:
        if self.G_MPa_override is not None:
            return self.G_MPa_override
        return self.E_MPa / (2.0 * (1.0 + self.poisson))

    @property
    def density_g_mm3(self) -> float:
        return self.density_g_cm3 * 1.0e-3


PLA_UPRIGHT = Material(
    name="Printed PLA Pro, span along printer Z (bending stress crosses layer interfaces)",
    E_MPa=2000.0,
    poisson=0.35,
    density_g_cm3=1.24,
    tensile_MPa=15.0,
    compressive_MPa=50.0,
    shear_MPa=10.0,
    source=(
        "Teaching placeholder inside published FFF-PLA ranges. Gonabadi, Yadav and Bull, "
        "Int. J. Adv. Manuf. Technol. (2020) report about 3.5 GPa / 55 MPa on-edge and about "
        "2 GPa / 5 MPa upright; interlayer strength is the most uncertain input. Replace with "
        "coupon data for the course filament and profile."
    ),
)

PLA_FLAT = Material(
    name="Printed PLA Pro, span in the build plane (bending stress along perimeters)",
    E_MPa=3000.0,
    poisson=0.35,
    density_g_cm3=1.24,
    tensile_MPa=45.0,
    compressive_MPa=55.0,
    shear_MPa=20.0,
    source=(
        "Teaching placeholder inside published FFF-PLA ranges (about 3-3.5 GPa and 45-55 MPa "
        "along deposited roads). Replace with coupon data."
    ),
)

ROD_HOBBY = Material(
    name="Pultruded carbon rod, hobby grade (low-bound card)",
    E_MPa=25000.0,
    poisson=0.30,
    density_g_cm3=1.40,
    tensile_MPa=450.0,
    compressive_MPa=260.0,
    shear_MPa=30.0,
    G_MPa_override=3000.0,
    source=(
        "Easy Composites pultruded rod TDS: flexural modulus 20-30 GPa, tensile 400-500 MPa, "
        "compressive 200-320 MPa, density 1.3-1.5 g/cm3."
    ),
)

ROD_AEROSPACE = Material(
    name="Pultruded carbon rod, T700 aerospace grade (high-bound card)",
    E_MPa=131000.0,
    poisson=0.30,
    density_g_cm3=1.50,
    tensile_MPa=1720.0,
    compressive_MPa=1680.0,
    shear_MPa=80.0,
    G_MPa_override=4500.0,
    source=(
        "Rock West Composites 47316 pultruded T700 rod: flexural modulus 131 GPa, tensile "
        "1.72 GPa, compressive 244 ksi, density 1.5 g/cm3."
    ),
)

MATERIALS = {
    "PLA upright (span = print Z)": PLA_UPRIGHT,
    "PLA flat (span in build plane)": PLA_FLAT,
    "Carbon rod - hobby grade": ROD_HOBBY,
    "Carbon rod - aerospace T700": ROD_AEROSPACE,
}


# ---------------------------------------------------------------------------
# 2. Wing geometry (same rules as mie446_wing.config.WingParameters)
# ---------------------------------------------------------------------------

_NACA4 = re.compile(r"^(?:NACA\s*)?(\d{4})$", re.IGNORECASE)


def normalize_naca4(code: str) -> str:
    match = _NACA4.fullmatch(str(code).strip())
    if not match:
        raise ValueError("naca must be a four-digit code such as '2412' or 'NACA 2412'")
    digits = match.group(1)
    if int(digits[0]) and int(digits[1]) == 0:
        raise ValueError("a cambered NACA 4-digit profile must have a nonzero camber position")
    if int(digits[2:]) == 0:
        raise ValueError("airfoil thickness must be greater than zero")
    return digits


@dataclass(frozen=True)
class WingGeometry:
    """Printed semi-wing geometry. Lengths in millimetres; fractions are x/c."""

    naca: str = "2412"
    semi_span_mm: float = 450.0
    root_chord_mm: float = 160.0
    tip_chord_mm: float = 100.0
    skin_mm: float = 1.2
    rib_thickness_mm: float = 1.6
    module_count: int = 3
    trailing_edge_mm: float = 1.2
    interior_rib_count: int = 3
    interface_rib_offset_mm: float = 4.0
    root_tip_cap_mm: float = 2.0
    cavity_x_start: float = 0.06
    cavity_x_end: float = 0.90
    rod_chord_fractions: tuple[float, ...] = (0.30, 0.60)
    rod_diameter_mm: float = 4.0
    radial_clearance_mm: float = 0.25
    sleeve_wall_mm: float = 1.2

    def __post_init__(self) -> None:
        object.__setattr__(self, "naca", normalize_naca4(self.naca))
        object.__setattr__(self, "rod_chord_fractions", tuple(float(f) for f in self.rod_chord_fractions))
        positive = (
            "semi_span_mm",
            "root_chord_mm",
            "tip_chord_mm",
            "skin_mm",
            "rib_thickness_mm",
            "trailing_edge_mm",
            "root_tip_cap_mm",
            "rod_diameter_mm",
            "sleeve_wall_mm",
        )
        for key in positive:
            if not getattr(self, key) > 0:
                raise ValueError(f"{key} must be positive")
        if self.tip_chord_mm > self.root_chord_mm:
            raise ValueError("tip_chord_mm cannot exceed root_chord_mm")
        if self.module_count not in (1, 2, 3):
            raise ValueError("module_count must be 1, 2 or 3")
        if self.interface_rib_offset_mm <= self.rib_thickness_mm:
            raise ValueError("interface_rib_offset_mm must exceed rib_thickness_mm")
        if not 0.02 <= self.cavity_x_start < self.cavity_x_end <= 0.95:
            raise ValueError("cavity chord limits must satisfy 0.02 <= start < end <= 0.95")
        if not 1 <= len(self.rod_chord_fractions) <= 2:
            raise ValueError("use one or two rods")
        for fraction in self.rod_chord_fractions:
            if not 0.10 <= fraction <= 0.80:
                raise ValueError("rod chord fractions must lie between 0.10 and 0.80")
        if not 0.0 <= self.radial_clearance_mm <= 0.80:
            raise ValueError("radial_clearance_mm must lie between 0 and 0.80 mm")

    # Planform -----------------------------------------------------------------
    def chord_at(self, y_mm: float | np.ndarray) -> float | np.ndarray:
        eta = np.clip(np.asarray(y_mm, dtype=float) / self.semi_span_mm, 0.0, 1.0)
        chord = self.root_chord_mm + eta * (self.tip_chord_mm - self.root_chord_mm)
        return float(chord) if np.ndim(chord) == 0 else chord

    @property
    def semi_area_mm2(self) -> float:
        return 0.5 * (self.root_chord_mm + self.tip_chord_mm) * self.semi_span_mm

    def module_bounds_mm(self) -> tuple[float, ...]:
        n = self.module_count
        return tuple(i * self.semi_span_mm / n for i in range(n + 1))

    def seams_mm(self) -> tuple[float, ...]:
        return self.module_bounds_mm()[1:-1]

    def rib_stations_mm(self) -> tuple[float, ...]:
        """Identical rule to mie446_wing.config.WingParameters.rib_stations_mm."""

        stations: list[float] = []
        boundaries = self.seams_mm()
        if self.interior_rib_count:
            step = self.semi_span_mm / (self.interior_rib_count + 1)
            for i in range(1, self.interior_rib_count + 1):
                station = step * i
                if all(
                    abs(station - b) > self.interface_rib_offset_mm + self.rib_thickness_mm
                    for b in boundaries
                ):
                    stations.append(station)
        for b in boundaries:
            stations.extend((b - self.interface_rib_offset_mm, b + self.interface_rib_offset_mm))
        merged: list[float] = []
        for station in sorted(stations):
            if not merged or abs(station - merged[-1]) > self.rib_thickness_mm:
                merged.append(station)
        return tuple(merged)

    def skin_supports_mm(self) -> tuple[float, ...]:
        """Spanwise stations that support the skin: root cap, ribs, tip cap."""

        return tuple(sorted({0.0, *self.rib_stations_mm(), self.semi_span_mm}))

    # Rods ---------------------------------------------------------------------
    @property
    def rod_radius_mm(self) -> float:
        return self.rod_diameter_mm / 2.0

    @property
    def hole_radius_mm(self) -> float:
        return self.rod_radius_mm + self.radial_clearance_mm

    @property
    def sleeve_radius_mm(self) -> float:
        return self.hole_radius_mm + self.sleeve_wall_mm

    def rod_centres_mm(self, y_mm: float) -> list[tuple[float, float]]:
        """Rod axis position (x, z) in the section at span station y.

        The CAD draws each rod as a straight line between the camber points at the
        root and tip; with a linear chord law this is the camber point at every station.
        """

        chord = self.chord_at(y_mm)
        centres = []
        for fraction in self.rod_chord_fractions:
            yc, _ = camber_line(self.naca, np.array([fraction]))
            centres.append((fraction * chord, float(yc[0]) * chord))
        return centres

    @property
    def rod_length_mm(self) -> float:
        return self.semi_span_mm

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# 3. NACA four-digit equations (copied from mie446_wing.airfoil so the solver and the
#    CAD use exactly the same surfaces, including the blunt printable trailing edge)
# ---------------------------------------------------------------------------


def cosine_spacing(count: int, start: float = 0.0, end: float = 1.0) -> np.ndarray:
    beta = np.linspace(0.0, np.pi, count)
    return start + (end - start) * 0.5 * (1.0 - np.cos(beta))


def naca4_parameters(code: str) -> tuple[float, float, float]:
    digits = normalize_naca4(code)
    return int(digits[0]) / 100.0, int(digits[1]) / 10.0, int(digits[2:]) / 100.0


def camber_line(code: str, x: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
    m, p, _ = naca4_parameters(code)
    values = np.asarray(x, dtype=float)
    if m == 0.0:
        return np.zeros_like(values), np.zeros_like(values)
    forward = values < p
    yc = np.empty_like(values)
    slope = np.empty_like(values)
    yc[forward] = m / p**2 * (2.0 * p * values[forward] - values[forward] ** 2)
    slope[forward] = 2.0 * m / p**2 * (p - values[forward])
    aft = ~forward
    yc[aft] = m / (1.0 - p) ** 2 * (1.0 - 2.0 * p + 2.0 * p * values[aft] - values[aft] ** 2)
    slope[aft] = 2.0 * m / (1.0 - p) ** 2 * (p - values[aft])
    return yc, slope


def half_thickness(code: str, x: np.ndarray | float, *, chord_mm: float, trailing_edge_mm: float) -> np.ndarray:
    _, _, t = naca4_parameters(code)
    values = np.asarray(x, dtype=float)
    yt = 5.0 * t * (
        0.2969 * np.sqrt(values) - 0.1260 * values - 0.3516 * values**2 + 0.2843 * values**3 - 0.1015 * values**4
    )
    natural_half_te = 5.0 * t * (0.2969 - 0.1260 - 0.3516 + 0.2843 - 0.1015)
    return yt + (trailing_edge_mm / (2.0 * chord_mm) - natural_half_te) * values**4


def airfoil_surfaces(code: str, chord_mm: float, trailing_edge_mm: float, count: int = 241):
    """Upper and lower surface coordinates (mm), leading edge to trailing edge."""

    x = cosine_spacing(count)
    yc, slope = camber_line(code, x)
    theta = np.arctan(slope)
    yt = half_thickness(code, x, chord_mm=chord_mm, trailing_edge_mm=trailing_edge_mm)
    xu = (x - yt * np.sin(theta)) * chord_mm
    zu = (yc + yt * np.cos(theta)) * chord_mm
    xl = (x + yt * np.sin(theta)) * chord_mm
    zl = (yc - yt * np.cos(theta)) * chord_mm
    return xu, zu, xl, zl


def vertical_ordinates(code: str, x_over_c, *, chord_mm: float, trailing_edge_mm: float):
    """Lower, camber and upper z at base x/c (the rule used to cut the CAD cavity)."""

    x = np.asarray(x_over_c, dtype=float)
    yc, slope = camber_line(code, x)
    yt = half_thickness(code, x, chord_mm=chord_mm, trailing_edge_mm=trailing_edge_mm)
    vertical_half = yt * np.cos(np.arctan(slope))
    return (yc - vertical_half) * chord_mm, yc * chord_mm, (yc + vertical_half) * chord_mm


# ---------------------------------------------------------------------------
# 4. Cross-section shapes
# ---------------------------------------------------------------------------


@dataclass
class SectionShapes:
    y_mm: float
    chord_mm: float
    outer: Polygon
    cavity: Polygon | None
    printed: Polygon | MultiPolygon
    shell: Polygon
    floating: list[Polygon]
    rods: list[Polygon]
    holes: list[Polygon]
    rod_centres: list[tuple[float, float]]
    upper_x: np.ndarray
    upper_z: np.ndarray
    cavity_corners: np.ndarray


def _polygons(shape) -> list[Polygon]:
    if shape.is_empty:
        return []
    if isinstance(shape, Polygon):
        return [shape]
    return [g for g in getattr(shape, "geoms", []) if isinstance(g, Polygon) and g.area > 1e-9]


def section_shapes(
    geom: WingGeometry,
    y_mm: float,
    *,
    hollow: bool = True,
    outer_points: int = 241,
    cavity_points: int = 161,
    circle_resolution: int = 48,
) -> SectionShapes:
    """Exact printed cross-section at span station y (CAD rules, polyline surfaces)."""

    chord = geom.chord_at(y_mm)
    xu, zu, xl, zl = airfoil_surfaces(geom.naca, chord, geom.trailing_edge_mm, outer_points)
    ring = list(zip(xu, zu)) + list(zip(xl[::-1], zl[::-1]))[1:]
    outer = Polygon(ring).buffer(0)

    cavity = None
    body = outer
    corners = np.zeros((0, 2))
    if hollow:
        xq = cosine_spacing(cavity_points, geom.cavity_x_start, geom.cavity_x_end)
        lower, _, upper = vertical_ordinates(geom.naca, xq, chord_mm=chord, trailing_edge_mm=geom.trailing_edge_mm)
        upper_in = upper - geom.skin_mm
        lower_in = lower + geom.skin_mm
        if float(np.min(upper_in - lower_in)) < 0.8:
            raise ValueError(f"the cavity collapses at chord {chord:.1f} mm; skin too thick for this airfoil")
        xs = xq * chord
        cavity = Polygon(list(zip(xs, upper_in)) + list(zip(xs[::-1], lower_in[::-1])))
        body = outer.difference(cavity)
        corners = np.array([[xs[0], upper_in[0]], [xs[0], lower_in[0]], [xs[-1], upper_in[-1]], [xs[-1], lower_in[-1]]])

    centres = geom.rod_centres_mm(y_mm)
    sleeves = [Point(c).buffer(geom.sleeve_radius_mm, circle_resolution) for c in centres]
    holes = [Point(c).buffer(geom.hole_radius_mm, circle_resolution) for c in centres]
    rods = [Point(c).buffer(geom.rod_radius_mm, circle_resolution) for c in centres]
    printed = unary_union([body, *sleeves]).difference(unary_union(holes))
    components = sorted(_polygons(printed), key=lambda p: p.area, reverse=True)
    mask = (xu >= geom.cavity_x_start * chord) & (xu <= geom.cavity_x_end * chord)
    return SectionShapes(
        y_mm=float(y_mm),
        chord_mm=float(chord),
        outer=outer,
        cavity=cavity,
        printed=printed,
        shell=components[0],
        floating=components[1:],
        rods=rods,
        holes=holes,
        rod_centres=centres,
        upper_x=xu[mask],
        upper_z=zu[mask],
        cavity_corners=corners,
    )


# ---------------------------------------------------------------------------
# 5. Section properties
# ---------------------------------------------------------------------------


def polygon_integrals(poly: Polygon) -> np.ndarray:
    """Exact area integrals of a polygon with holes (Green's theorem).

    Returns [A, int z dA, int x dA, int z^2 dA, int x^2 dA, int x z dA] about the origin.
    """

    total = np.zeros(6)
    poly = orient(poly, sign=1.0)
    for ring in [poly.exterior, *poly.interiors]:
        pts = np.asarray(ring.coords)
        x0, z0 = pts[:-1, 0], pts[:-1, 1]
        x1, z1 = pts[1:, 0], pts[1:, 1]
        a = x0 * z1 - x1 * z0
        total += np.array(
            [
                a.sum() / 2.0,
                ((z0 + z1) * a).sum() / 6.0,
                ((x0 + x1) * a).sum() / 6.0,
                ((z0**2 + z0 * z1 + z1**2) * a).sum() / 12.0,
                ((x0**2 + x0 * x1 + x1**2) * a).sum() / 12.0,
                ((x0 * z1 + 2 * x0 * z0 + 2 * x1 * z1 + x1 * z0) * a).sum() / 24.0,
            ]
        )
    return total


@lru_cache(maxsize=256)
def _fe_shell_section(geom: WingGeometry, y_mm: float, mesh_area_mm2: float):
    """2-D warping finite-element analysis of the connected PLA shell (cached)."""

    from sectionproperties.analysis.section import Section
    from sectionproperties.pre.geometry import Geometry

    shapes = section_shapes(geom, y_mm)
    fe_geometry = Geometry(shapes.shell)
    fe_geometry.create_mesh(mesh_sizes=mesh_area_mm2)
    section = Section(fe_geometry)
    section.calculate_geometric_properties()
    section.calculate_warping_properties()
    return section


def bredt_batho(geom: WingGeometry, shapes: SectionShapes) -> dict[str, float]:
    """Thin-wall single-cell torsion constant J = 4 A_m^2 / (closed integral of ds/t).

    Wall path: upper skin and lower skin (thickness = skin) plus the solid nose and the
    solid trailing-edge strip, idealised as thick vertical walls.
    """

    chord, t = shapes.chord_mm, geom.skin_mm
    x0, x1 = geom.cavity_x_start, geom.cavity_x_end
    xq = cosine_spacing(161, x0, x1)
    lower, _, upper = vertical_ordinates(geom.naca, xq, chord_mm=chord, trailing_edge_mm=geom.trailing_edge_mm)
    up_mid, lo_mid = upper - t / 2.0, lower + t / 2.0
    xs = xq * chord
    length_up = float(np.sum(np.hypot(np.diff(xs), np.diff(up_mid))))
    length_lo = float(np.sum(np.hypot(np.diff(xs), np.diff(lo_mid))))
    h_front = float(up_mid[0] - lo_mid[0])
    h_rear = float(up_mid[-1] - lo_mid[-1])
    enclosed = float(np.trapezoid(up_mid - lo_mid, xs))
    path = (length_up + length_lo) / t + h_front / (x0 * chord) + h_rear / ((1.0 - x1) * chord)
    return {"J_mm4": 4.0 * enclosed**2 / path, "A_m_mm2": enclosed, "ds_over_t": path}


def shear_stress_field(section: "SectionProperties", V_N: float, T_Nmm: float, geom: WingGeometry):
    """Resultant shear stress at the FE nodes for shear V (up +) and nose-up torque T.

    Sign mapping to sectionproperties (x aft, y up, z = inboard): vy = -V, mzz = +T.
    Returns (tau at nodes, mask of nodes farther than 2*skin from the sharp cavity corners).
    """

    fe = section.fe_section
    post = fe.calculate_stress(vy=-V_N, mzz=T_Nmm).get_stress()[0]
    tau = np.abs(np.asarray(post["sig_zxy"]))
    nodes = np.asarray(fe.mesh["vertices"])
    corners = section.shapes.cavity_corners
    if len(corners):
        distance = np.min(np.linalg.norm(nodes[:, None, :] - corners[None, :, :], axis=2), axis=1)
        far = distance > 2.0 * geom.skin_mm
    else:
        far = np.ones(len(nodes), dtype=bool)
    return tau, far


def _circle_through(p1, p2, p3) -> float:
    a = math.dist(p1, p2)
    b = math.dist(p2, p3)
    c = math.dist(p1, p3)
    area2 = abs((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]))
    return math.inf if area2 < 1e-12 else a * b * c / (2.0 * area2)


@dataclass(frozen=True)
class Assembly:
    """How the printed modules and rods are joined."""

    rods_bonded: bool = False
    seams_bonded: bool = False
    seam_rod_free_length_mm: float | None = None
    adhesive_tensile_MPa: float = 5.0

    def free_length(self, geom: WingGeometry) -> float:
        if self.seam_rod_free_length_mm is not None:
            return float(self.seam_rod_free_length_mm)
        return 2.0 * geom.interface_rib_offset_mm


@dataclass
class SectionProperties:
    y_mm: float
    chord_mm: float
    shapes: SectionShapes
    EA_N: float
    centroid_x_mm: float
    centroid_z_mm: float
    EI_flap_Nmm2: float
    EI_chord_Nmm2: float
    EI_xz_Nmm2: float
    principal_angle_deg: float
    EI_rods_own_Nmm2: float
    GJ_Nmm2: float
    J_fe_mm4: float
    J_bredt_mm4: float
    bredt_area_mm2: float
    shear_centre_x_mm: float
    shear_centre_z_mm: float
    mass_g_per_mm: float
    cg_x_mm: float
    polar_inertia_g_mm: float
    z_top_mm: float
    z_bottom_mm: float
    pla_area_mm2: float
    shell_area_mm2: float
    floating_area_mm2: float
    rod_area_mm2: float
    rib_extra_area_mm2: float
    rib_cg_x_mm: float
    rib_polar_area_mm4: float
    upper_skin_width_mm: float
    upper_skin_radius_mm: float
    fe_section: object = field(repr=False, default=None)


def analyse_section(
    geom: WingGeometry,
    pla: Material,
    rod: Material,
    assembly: Assembly,
    y_mm: float,
    *,
    mesh_area_mm2: float = 0.5,
) -> SectionProperties:
    """Modulus-weighted bending properties, torsion, shear centre and mass at station y."""

    shapes = section_shapes(geom, y_mm)
    n_rods = len(shapes.rods)
    Ep, Er = pla.E_MPa, rod.E_MPa

    members: list[tuple[Polygon, float]] = [(p, Ep) for p in [shapes.shell, *shapes.floating]]
    if assembly.rods_bonded:
        members += [(r, Er) for r in shapes.rods]
    sums = np.zeros(6)
    for poly, modulus in members:
        sums += modulus * polygon_integrals(poly)
    EA = sums[0]
    zc, xc = sums[1] / EA, sums[2] / EA
    EI_flap = sums[3] - EA * zc**2
    EI_chord = sums[4] - EA * xc**2
    EI_xz = sums[5] - EA * xc * zc
    I_rod_own = math.pi * geom.rod_diameter_mm**4 / 64.0
    EI_rods_own = 0.0
    if not assembly.rods_bonded:
        EI_rods_own = n_rods * Er * I_rod_own
        EI_flap += EI_rods_own
        EI_chord += EI_rods_own
    principal = 0.5 * math.degrees(math.atan2(2.0 * EI_xz, EI_chord - EI_flap))

    section = _fe_shell_section(geom, float(y_mm), float(mesh_area_mm2))
    J_fe = float(section.get_j())
    x_sc, z_sc = (float(v) for v in section.get_sc())
    J_float = sum(
        math.pi / 2.0 * (geom.sleeve_radius_mm**4 - geom.hole_radius_mm**4) for _ in shapes.floating
    )
    GJ = pla.G_MPa * (J_fe + J_float)
    if assembly.rods_bonded:
        GJ += n_rods * rod.G_MPa * math.pi * geom.rod_diameter_mm**4 / 32.0
    bredt = bredt_batho(geom, shapes)

    # Mass per unit length and polar mass moment about the shear centre (g/mm, g*mm^2/mm)
    rho_p, rho_r = pla.density_g_mm3, rod.density_g_mm3
    pla_int = sum(polygon_integrals(p) for p in [shapes.shell, *shapes.floating])
    rod_int = sum(polygon_integrals(r) for r in shapes.rods)
    mass = rho_p * pla_int[0] + rho_r * rod_int[0]
    cg_x = (rho_p * pla_int[2] + rho_r * rod_int[2]) / mass

    def polar(integrals: np.ndarray) -> float:
        """Integral of r^2 dA about the shear centre."""
        area, int_z, int_x, int_z2, int_x2, _ = integrals
        return (int_x2 - 2 * x_sc * int_x + x_sc**2 * area) + (int_z2 - 2 * z_sc * int_z + z_sc**2 * area)

    polar_inertia = rho_p * polar(pla_int) + rho_r * polar(rod_int)

    hole_area = sum(h.area for h in shapes.holes)
    rib_solid = shapes.outer.difference(unary_union(shapes.holes))
    rib_int = polygon_integrals(rib_solid) if isinstance(rib_solid, Polygon) else sum(
        polygon_integrals(p) for p in _polygons(rib_solid)
    )
    rib_extra = (shapes.outer.area - hole_area) - shapes.printed.area
    rib_cg_x = rib_int[2] / rib_int[0]
    rib_polar = polar(rib_int)

    ux, uz = shapes.upper_x, shapes.upper_z
    width = float(np.sum(np.hypot(np.diff(ux), np.diff(uz))))
    mid = len(ux) // 2
    radius = _circle_through((ux[0], uz[0]), (ux[mid], uz[mid]), (ux[-1], uz[-1]))
    minx, minz, maxx, maxz = shapes.printed.bounds

    return SectionProperties(
        y_mm=float(y_mm),
        chord_mm=shapes.chord_mm,
        shapes=shapes,
        EA_N=float(EA),
        centroid_x_mm=float(xc),
        centroid_z_mm=float(zc),
        EI_flap_Nmm2=float(EI_flap),
        EI_chord_Nmm2=float(EI_chord),
        EI_xz_Nmm2=float(EI_xz),
        principal_angle_deg=float(principal),
        EI_rods_own_Nmm2=float(EI_rods_own),
        GJ_Nmm2=float(GJ),
        J_fe_mm4=J_fe,
        J_bredt_mm4=bredt["J_mm4"],
        bredt_area_mm2=bredt["A_m_mm2"],
        shear_centre_x_mm=x_sc,
        shear_centre_z_mm=z_sc,
        mass_g_per_mm=float(mass),
        cg_x_mm=float(cg_x),
        polar_inertia_g_mm=float(polar_inertia),
        z_top_mm=float(maxz),
        z_bottom_mm=float(minz),
        pla_area_mm2=float(shapes.printed.area),
        shell_area_mm2=float(shapes.shell.area),
        floating_area_mm2=float(sum(p.area for p in shapes.floating)),
        rod_area_mm2=float(sum(r.area for r in shapes.rods)),
        rib_extra_area_mm2=float(rib_extra),
        rib_cg_x_mm=float(rib_cg_x),
        rib_polar_area_mm4=float(rib_polar),
        upper_skin_width_mm=width,
        upper_skin_radius_mm=float(radius),
        fe_section=section,
    )


# ---------------------------------------------------------------------------
# 6. Load case and design criteria
# ---------------------------------------------------------------------------

DISTRIBUTIONS = ("schrenk", "elliptic", "uniform", "planform", "tip")


@dataclass(frozen=True)
class LoadCase:
    """Flight-like lift case or a static tip-force case (like the load-cell demonstration)."""

    name: str = "Limit manoeuvre (analytical)"
    kind: str = "flight"
    aircraft_mass_kg: float = 1.0
    load_factor: float = 4.0
    distribution: str = "schrenk"
    lift_chord_fraction: float = 0.25
    inertia_relief: bool = True
    tip_force_N: float = 10.0
    tip_force_chord_fraction: float = 0.30
    factor_of_safety: float = 1.5
    tip_mass_g: float = 0.0

    def __post_init__(self) -> None:
        if self.kind not in ("flight", "tip"):
            raise ValueError("kind must be 'flight' or 'tip'")
        if self.distribution not in DISTRIBUTIONS:
            raise ValueError(f"distribution must be one of {DISTRIBUTIONS}")
        if self.factor_of_safety < 1.0:
            raise ValueError("factor_of_safety must be at least 1")
        if self.aircraft_mass_kg <= 0 or self.tip_mass_g < 0:
            raise ValueError("masses must be positive")
        if not 0.0 <= self.lift_chord_fraction <= 1.0 or not 0.0 <= self.tip_force_chord_fraction <= 1.0:
            raise ValueError("chord fractions must lie between 0 and 1")

    @property
    def semi_wing_lift_N(self) -> float:
        return self.load_factor * self.aircraft_mass_kg * GRAVITY_M_S2 / 2.0


@dataclass(frozen=True)
class Criteria:
    max_tip_deflection_mm: float = 45.0
    max_tip_twist_deg: float = 2.0


@dataclass
class Check:
    name: str
    demand: float
    capacity: float
    unit: str
    location_mm: float
    basis: str

    @property
    def utilization(self) -> float:
        return self.demand / self.capacity if self.capacity > 0 else math.inf

    @property
    def status(self) -> str:
        u = self.utilization
        return "PASS" if u <= 1.0 else "FAIL"


# ---------------------------------------------------------------------------
# 7. Helpers
# ---------------------------------------------------------------------------


def _cum_from_root(f: np.ndarray, x: np.ndarray) -> np.ndarray:
    out = np.zeros_like(x, dtype=float)
    out[1:] = np.cumsum(0.5 * (f[1:] + f[:-1]) * np.diff(x))
    return out


def _from_tip(f: np.ndarray, x: np.ndarray) -> np.ndarray:
    c = _cum_from_root(f, x)
    return c[-1] - c


def _interp_lin(x, xp, fp):
    """Piecewise-linear interpolation with linear extrapolation beyond the end stations."""

    x = np.atleast_1d(np.asarray(x, dtype=float))
    xp = np.asarray(xp, dtype=float)
    fp = np.asarray(fp, dtype=float)
    out = np.interp(x, xp, fp)
    hi = x > xp[-1]
    out[hi] = fp[-1] + (fp[-1] - fp[-2]) / (xp[-1] - xp[-2]) * (x[hi] - xp[-1])
    return out


def _interp_log(x, xp, fp):
    return np.exp(_interp_lin(np.atleast_1d(x), xp, np.log(np.asarray(fp, dtype=float))))


def plate_buckling_flat(E: float, nu: float, t: float, a: float, b: float) -> float:
    """Simply supported flat plate, compression along a (span), width b: min over half-waves."""

    ratio = a / b
    k = min((m / ratio + ratio / m) ** 2 for m in range(1, 30))
    return k * math.pi**2 * E / (12.0 * (1.0 - nu**2)) * (t / b) ** 2


def cylinder_buckling_knocked_down(E: float, nu: float, t: float, R: float) -> float:
    """Classical axial buckling with the NASA SP-8007 knock-down factor."""

    if not math.isfinite(R):
        return 0.0
    phi = math.sqrt(R / t) / 16.0
    gamma = 1.0 - 0.901 * (1.0 - math.exp(-phi))
    return gamma * E * t / (R * math.sqrt(3.0 * (1.0 - nu**2)))


def rod_modulus_from_cantilever(force_N: float, length_mm: float, deflection_mm: float, diameter_mm: float) -> float:
    """E = P L^3 / (3 delta I): use a hanging weight on a clamped rod to measure the course rod."""

    inertia = math.pi * diameter_mm**4 / 64.0
    return force_N * length_mm**3 / (3.0 * deflection_mm * inertia)


# ---------------------------------------------------------------------------
# 8. 1-D beam finite-element model (bending + torsion, dry seams as springs)
# ---------------------------------------------------------------------------


def _hermite(xi: float, h: float) -> np.ndarray:
    return np.array([1 - 3 * xi**2 + 2 * xi**3, h * (xi - 2 * xi**2 + xi**3), 3 * xi**2 - 2 * xi**3, h * (-(xi**2) + xi**3)])


def beam_fem(
    nodes: np.ndarray,
    EI,
    GJ,
    m_line,
    Ip_line,
    *,
    seams: tuple[float, ...] = (),
    k_bend: float = math.inf,
    k_tors=None,
    w_line=None,
    t_line=None,
    point_forces: tuple = (),
    point_torques: tuple = (),
    point_masses: tuple = (),
    point_inertias: tuple = (),
    n_modes: int = 4,
) -> dict:
    """Clamped-free Euler-Bernoulli bending and St-Venant torsion on a sorted node list.

    EI, GJ, m_line, Ip_line, w_line, t_line are callables of y. Dry seams get a separate
    rotation (and twist) degree of freedom on each side, joined by springs k_bend and
    k_tors(y_seam). Units: N, mm, g; masses converted to tonnes so eigenvalues are in s^-2.
    """

    nodes = np.asarray(nodes, dtype=float)
    n = len(nodes)
    seam_nodes = {int(np.argmin(abs(nodes - s))) for s in seams} if math.isfinite(k_bend) else set()
    if k_tors is None:
        k_tors = lambda _y: math.inf  # noqa: E731

    # Degree-of-freedom maps
    w_dof = list(range(n))
    th_left, th_right = [], []
    next_dof = n
    for i in range(n):
        th_left.append(next_dof)
        if i in seam_nodes:
            th_right.append(next_dof + 1)
            next_dof += 2
        else:
            th_right.append(next_dof)
            next_dof += 1
    nb = next_dof
    tors_split = {i for i in seam_nodes if math.isfinite(float(k_tors(nodes[i])))}
    ph_left, ph_right = [], []
    next_dof = 0
    for i in range(n):
        ph_left.append(next_dof)
        if i in tors_split:
            ph_right.append(next_dof + 1)
            next_dof += 2
        else:
            ph_right.append(next_dof)
            next_dof += 1
    nt = next_dof

    Kb, Mb, fb = np.zeros((nb, nb)), np.zeros((nb, nb)), np.zeros(nb)
    Kt, Mt, ft = np.zeros((nt, nt)), np.zeros((nt, nt)), np.zeros(nt)
    gauss_x, gauss_w = np.polynomial.legendre.leggauss(4)
    gauss_x, gauss_w = 0.5 * (gauss_x + 1.0), 0.5 * gauss_w

    for e in range(n - 1):
        y0, y1 = nodes[e], nodes[e + 1]
        h = y1 - y0
        ym = 0.5 * (y0 + y1)
        ei, gj = float(EI(ym)), float(GJ(ym))
        dofs_b = [w_dof[e], th_right[e], w_dof[e + 1], th_left[e + 1]]
        dofs_t = [ph_right[e], ph_left[e + 1]]
        ke = ei / h**3 * np.array(
            [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]]
        )
        me = np.zeros((4, 4))
        fe = np.zeros(4)
        mt = np.zeros((2, 2))
        ftl = np.zeros(2)
        for xi, wq in zip(gauss_x, gauss_w):
            yq = y0 + xi * h
            N = _hermite(xi, h)
            me += wq * h * float(m_line(yq)) * np.outer(N, N) * 1e-6
            if w_line is not None:
                fe += wq * h * float(w_line(yq)) * N
            L = np.array([1 - xi, xi])
            mt += wq * h * float(Ip_line(yq)) * np.outer(L, L) * 1e-6
            if t_line is not None:
                ftl += wq * h * float(t_line(yq)) * L
        kt = gj / h * np.array([[1, -1], [-1, 1]])
        for a, A in enumerate(dofs_b):
            fb[A] += fe[a]
            for b, B in enumerate(dofs_b):
                Kb[A, B] += ke[a, b]
                Mb[A, B] += me[a, b]
        for a, A in enumerate(dofs_t):
            ft[A] += ftl[a]
            for b, B in enumerate(dofs_t):
                Kt[A, B] += kt[a, b]
                Mt[A, B] += mt[a, b]

    for i in seam_nodes:
        a, b = th_left[i], th_right[i]
        Kb[np.ix_([a, b], [a, b])] += k_bend * np.array([[1, -1], [-1, 1]])
        if i in tors_split:
            a, b = ph_left[i], ph_right[i]
            Kt[np.ix_([a, b], [a, b])] += float(k_tors(nodes[i])) * np.array([[1, -1], [-1, 1]])

    def node_of(y):
        return int(np.argmin(abs(nodes - y)))

    for y, F in point_forces:
        fb[w_dof[node_of(y)]] += F
    for y, T in point_torques:
        ft[ph_left[node_of(y)]] += T
    for y, m in point_masses:
        Mb[w_dof[node_of(y)], w_dof[node_of(y)]] += m * 1e-6
    for y, Ip in point_inertias:
        k = ph_left[node_of(y)]
        Mt[k, k] += Ip * 1e-6

    fixed_b = {w_dof[0], th_left[0], th_right[0]}
    fixed_t = {ph_left[0], ph_right[0]}
    free_b = np.array([d for d in range(nb) if d not in fixed_b])
    free_t = np.array([d for d in range(nt) if d not in fixed_t])

    ub = np.zeros(nb)
    ut = np.zeros(nt)
    ub[free_b] = np.linalg.solve(Kb[np.ix_(free_b, free_b)], fb[free_b])
    ut[free_t] = np.linalg.solve(Kt[np.ix_(free_t, free_t)], ft[free_t])

    from scipy.linalg import eigh

    lam_b, vec_b = eigh(Kb[np.ix_(free_b, free_b)], Mb[np.ix_(free_b, free_b)])
    lam_t, vec_t = eigh(Kt[np.ix_(free_t, free_t)], Mt[np.ix_(free_t, free_t)])
    modes_b = []
    for k in range(min(n_modes, len(lam_b))):
        full = np.zeros(nb)
        full[free_b] = vec_b[:, k]
        shape = full[w_dof]
        modes_b.append(shape / shape[np.argmax(abs(shape))])
    modes_t = []
    for k in range(min(n_modes, len(lam_t))):
        full = np.zeros(nt)
        full[free_t] = vec_t[:, k]
        shape = full[ph_left]
        modes_t.append(shape / shape[np.argmax(abs(shape))])

    return {
        "y": nodes,
        "w": ub[w_dof],
        "theta": ub[th_left],
        "phi": ut[ph_left],
        "f_bending_Hz": np.sqrt(np.maximum(lam_b[:n_modes], 0)) / (2 * math.pi),
        "f_torsion_Hz": np.sqrt(np.maximum(lam_t[:n_modes], 0)) / (2 * math.pi),
        "modes_bending": modes_b,
        "modes_torsion": modes_t,
    }


# ---------------------------------------------------------------------------
# 9. The solver
# ---------------------------------------------------------------------------


@dataclass
class SolverResult:
    geometry: WingGeometry
    pla: Material
    rod: Material
    assembly: Assembly
    load: LoadCase
    criteria: Criteria
    sections: list[SectionProperties]
    y: np.ndarray
    props: dict
    loads: dict
    V: np.ndarray
    M: np.ndarray
    T: np.ndarray
    slope: np.ndarray
    deflection: np.ndarray
    twist: np.ndarray
    fem: dict
    seam: dict
    stress: dict
    checks: list[Check]
    mass: dict
    stiffness: dict
    verification: dict

    # Convenience --------------------------------------------------------------
    @property
    def governing(self) -> Check:
        return max(self.checks, key=lambda c: c.utilization)

    @property
    def tip_deflection_mm(self) -> float:
        return float(self.deflection[-1])

    @property
    def tip_twist_deg(self) -> float:
        return math.degrees(float(self.twist[-1]))

    def check_table(self) -> list[dict]:
        return [
            {
                "check": c.name,
                "demand": round(float(c.demand), 4),
                "capacity": round(float(c.capacity), 4),
                "unit": c.unit,
                "utilization": round(float(c.utilization), 3),
                "status": c.status,
                "at y (mm)": round(float(c.location_mm), 1),
                "basis": c.basis,
            }
            for c in self.checks
        ]

    def section_table(self) -> list[dict]:
        rows = []
        for s in self.sections:
            rows.append(
                {
                    "y (mm)": round(s.y_mm, 1),
                    "chord (mm)": round(s.chord_mm, 1),
                    "PLA area (mm2)": round(s.pla_area_mm2, 1),
                    "EI flap (N m2)": round(s.EI_flap_Nmm2 * 1e-6, 4),
                    "rods' share of EI (%)": round(100 * s.EI_rods_own_Nmm2 / s.EI_flap_Nmm2, 1),
                    "GJ (N m2)": round(s.GJ_Nmm2 * 1e-6, 4),
                    "J FE (mm4)": round(s.J_fe_mm4, 0),
                    "J Bredt (mm4)": round(s.J_bredt_mm4, 0),
                    "shear centre x/c": round(s.shear_centre_x_mm / s.chord_mm, 3),
                    "centroid x/c": round(s.centroid_x_mm / s.chord_mm, 3),
                    "principal angle (deg)": round(s.principal_angle_deg, 2),
                    "mass (g/mm)": round(s.mass_g_per_mm, 4),
                }
            )
        return rows

    def summary(self) -> dict:
        g = self.governing
        return {
            "load case": self.load.name,
            "semi-wing applied force (N)": round(self.loads["applied_force_N"], 3),
            "root shear (N)": round(float(self.V[0]), 3),
            "root bending moment (N m)": round(float(self.M[0]) * 1e-3, 4),
            "root torque, nose-up + (N m)": round(float(self.T[0]) * 1e-3, 5),
            "tip deflection (mm)": round(self.tip_deflection_mm, 3),
            "tip twist (deg)": round(self.tip_twist_deg, 4),
            "printed PLA mass (g)": round(self.mass["printed_total_g"], 1),
            "rod mass (g)": round(self.mass["rods_g"], 1),
            "tip stiffness for a tip force (N/mm)": round(self.stiffness["tip_force_N_per_mm"], 4),
            "first bending frequency (Hz)": round(float(self.fem["f_bending_Hz"][0]), 2),
            "first torsion frequency (Hz)": round(float(self.fem["f_torsion_Hz"][0]), 1),
            "governing check": f"{g.name} (U = {g.utilization:.2f})",
        }


def default_inputs():
    return WingGeometry(), PLA_UPRIGHT, ROD_HOBBY, Assembly(), LoadCase(), Criteria()


def solve(
    geometry: WingGeometry | None = None,
    pla: Material = PLA_UPRIGHT,
    rod: Material = ROD_HOBBY,
    assembly: Assembly | None = None,
    load: LoadCase | None = None,
    criteria: Criteria | None = None,
    *,
    n_sections: int = 7,
    n_grid: int = 901,
    n_beam_elements: int = 90,
    mesh_area_mm2: float = 0.5,
) -> SolverResult:
    geom = geometry or WingGeometry()
    assembly = assembly or Assembly()
    load = load or LoadCase()
    criteria = criteria or Criteria()
    L = geom.semi_span_mm
    seams = geom.seams_mm() if not assembly.seams_bonded else ()

    # --- Sections -----------------------------------------------------------
    # Stations run from the root to 95 % semi-span. The last few millimetres (solid tip cap,
    # possible local sleeve-to-skin fusion) are reached by linear extrapolation, so a very
    # local tip feature does not distort the interpolated shear-centre line.
    y_sec = np.linspace(0.0, 0.95 * L, n_sections)
    sections = [analyse_section(geom, pla, rod, assembly, float(y), mesh_area_mm2=mesh_area_mm2) for y in y_sec]

    def col(attr):
        return np.array([getattr(s, attr) for s in sections])

    def lin(attr, at=None):
        return _interp_lin(y if at is None else at, y_sec, col(attr))

    y = np.union1d(np.linspace(0.0, L, n_grid), np.array([*geom.seams_mm(), *geom.rib_stations_mm()]))
    props = {
        "chord": geom.chord_at(y),
        "EI": _interp_log(y, y_sec, col("EI_flap_Nmm2")),
        "GJ": _interp_log(y, y_sec, col("GJ_Nmm2")),
        "x_sc": lin("shear_centre_x_mm"),
        "x_c": lin("centroid_x_mm"),
        "z_c": lin("centroid_z_mm"),
        "z_top": lin("z_top_mm"),
        "z_bot": lin("z_bottom_mm"),
        "mass": lin("mass_g_per_mm"),
        "x_cg": lin("cg_x_mm"),
        "Ip": lin("polar_inertia_g_mm"),
        "skin_width": lin("upper_skin_width_mm"),
        "skin_radius": lin("upper_skin_radius_mm"),
        "EI_rods_own": lin("EI_rods_own_Nmm2"),
    }

    # --- Mass ---------------------------------------------------------------
    ribs = geom.rib_stations_mm()
    rib_extra = lin("rib_extra_area_mm2", np.array(ribs))
    rib_mass = pla.density_g_mm3 * geom.rib_thickness_mm * rib_extra
    rib_cg = lin("rib_cg_x_mm", np.array(ribs))
    rib_polar = pla.density_g_mm3 * geom.rib_thickness_mm * lin("rib_polar_area_mm4", np.array(ribs))
    cap_extra = lin("rib_extra_area_mm2", np.array([0.0, L]))
    cap_mass = pla.density_g_mm3 * geom.root_tip_cap_mm * cap_extra
    pla_line = props["mass"] - rod.density_g_mm3 * lin("rod_area_mm2")
    shell_mass = float(np.trapezoid(pla_line, y))
    rods_mass = rod.density_g_mm3 * len(geom.rod_chord_fractions) * math.pi * geom.rod_radius_mm**2 * geom.rod_length_mm
    mass = {
        "shell_and_sleeves_g": shell_mass,
        "ribs_g": float(rib_mass.sum()),
        "end_caps_g": float(cap_mass.sum()),
        "printed_total_g": shell_mass + float(rib_mass.sum()) + float(cap_mass.sum()),
        "rods_g": float(rods_mass),
        "tip_mass_g": load.tip_mass_g,
    }
    mass["total_g"] = mass["printed_total_g"] + mass["rods_g"] + load.tip_mass_g

    # --- Loads (upward positive, N/mm and N) ----------------------------------
    chord = props["chord"]
    w = np.zeros_like(y)
    point: list[tuple[float, float, float]] = []  # (y, F, x)
    if load.kind == "flight":
        lift = load.semi_wing_lift_N
        if load.distribution == "tip":
            point.append((L, lift, load.lift_chord_fraction * geom.tip_chord_mm))
        else:
            ell = 4.0 * lift / (math.pi * L) * np.sqrt(np.clip(1.0 - (y / L) ** 2, 0.0, None))
            plan = lift * chord / geom.semi_area_mm2
            uni = np.full_like(y, lift / L)
            w = {"elliptic": ell, "planform": plan, "uniform": uni, "schrenk": 0.5 * (ell + plan)}[load.distribution]
        x_w = load.lift_chord_fraction * chord
        wx = w * x_w
        if load.inertia_relief:
            g_n = load.load_factor * GRAVITY_M_S2 * 1e-3  # N per gram
            w_i = -g_n * props["mass"]
            w = w + w_i
            wx = wx + w_i * props["x_cg"]
            for yr, m, xr in zip(ribs, rib_mass, rib_cg):
                point.append((yr, -g_n * m, xr))
            point.append((L, -g_n * cap_mass[1], float(lin("rib_cg_x_mm", np.array([L]))[0])))
            if load.tip_mass_g:
                point.append((L, -g_n * load.tip_mass_g, load.tip_force_chord_fraction * geom.tip_chord_mm))
    else:
        wx = np.zeros_like(y)
        point.append((L, load.tip_force_N, load.tip_force_chord_fraction * geom.tip_chord_mm))

    Q0 = _from_tip(w, y)
    Q1 = _from_tip(w * y, y)
    X = _from_tip(wx, y)
    V = Q0.copy()
    M = Q1 - y * Q0
    Xall = X.copy()
    for yp, F, xp in point:
        on = y <= yp + 1e-9
        V[on] += F
        M[on] += F * (yp - y[on])
        Xall[on] += F * xp
    T = props["x_sc"] * V - Xall  # nose-up torque about the local shear centre
    applied_force = float(np.trapezoid(w, y) + sum(F for _, F, _ in point))
    applied_moment = float(np.trapezoid(w * y, y) + sum(F * yp for yp, F, _ in point))

    # --- Seam springs ---------------------------------------------------------
    I_rod = math.pi * geom.rod_diameter_mm**4 / 64.0
    n_r = len(geom.rod_chord_fractions)
    Lf = assembly.free_length(geom)
    k_bend = n_r * rod.E_MPa * I_rod / Lf
    if n_r == 2:
        spacing = lambda ys: abs(geom.rod_chord_fractions[1] - geom.rod_chord_fractions[0]) * geom.chord_at(ys)  # noqa: E731
        k_tors_at = lambda ys: 6.0 * rod.E_MPa * I_rod * spacing(ys) ** 2 / Lf**3  # noqa: E731
    else:
        k_tors_at = lambda ys: rod.G_MPa * math.pi * geom.rod_diameter_mm**4 / 32.0 / Lf  # noqa: E731
    seam_info = {
        "dry": not assembly.seams_bonded,
        "stations_mm": geom.seams_mm(),
        "rod_free_length_mm": Lf,
        "k_bend_Nmm_per_rad": k_bend,
        "k_tors_Nmm_per_rad": [k_tors_at(s) for s in geom.seams_mm()],
    }

    # --- Direct integration ---------------------------------------------------
    kappa = M / props["EI"]
    slope = _cum_from_root(kappa, y)
    rate = T / props["GJ"]
    twist = _cum_from_root(rate, y)
    seam_rotation = []
    for s in seams:
        Ms = float(np.interp(s, y, M))
        Ts = float(np.interp(s, y, T))
        dtheta, dphi = Ms / k_bend, Ts / k_tors_at(s)
        slope[y > s + 1e-9] += dtheta
        twist[y > s + 1e-9] += dphi
        seam_rotation.append({"y_mm": s, "M_Nmm": Ms, "T_Nmm": Ts, "dtheta_rad": dtheta, "dphi_rad": dphi})
    deflection = _cum_from_root(slope, y)
    seam_info["rotations"] = seam_rotation

    # Clearance free play (kinematic dead band before rods bear), reported separately
    bounds = geom.module_bounds_mm()
    slop = 0.0
    for i, s in enumerate(geom.seams_mm()):
        la, lb = bounds[i + 1] - bounds[i], bounds[i + 2] - bounds[i + 1]
        slop += 2.0 * geom.radial_clearance_mm * (1.0 / la + 1.0 / lb) * (L - s)
    seam_info["free_play_tip_mm"] = slop if not assembly.seams_bonded else 0.0

    # --- 1-D FEM: static and modal ----------------------------------------------
    nodes = np.union1d(np.linspace(0.0, L, n_beam_elements + 1), np.array([*geom.seams_mm(), *ribs]))
    EI_f = lambda q: float(_interp_log(q, y_sec, col("EI_flap_Nmm2"))[0])  # noqa: E731
    GJ_f = lambda q: float(_interp_log(q, y_sec, col("GJ_Nmm2"))[0])  # noqa: E731
    m_f = lambda q: np.interp(q, y, props["mass"])  # noqa: E731
    Ip_f = lambda q: np.interp(q, y, props["Ip"])  # noqa: E731
    w_f = lambda q: np.interp(q, y, w)  # noqa: E731
    # Point loads become a point force plus a point torque about the local shear centre.
    # The remaining internal torque is produced by a distributed torque t(y) = -dT_d/dy, so
    # the 1-D model reproduces exactly the statics above (including the elastic-axis offset).
    point_torques = tuple((yp, F * (float(np.interp(yp, y, props["x_sc"])) - xp)) for yp, F, xp in point)
    T_point = np.zeros_like(y)
    for (yp, _F, _x), (_, Tp) in zip(point, point_torques):
        T_point[y <= yp + 1e-9] += Tp
    t_dist = -np.gradient(T - T_point, y)
    t_f = lambda q: np.interp(q, y, t_dist)  # noqa: E731
    point_forces = tuple((yp, F) for yp, F, _ in point)
    lumped = [(yr, m) for yr, m in zip(ribs, rib_mass)] + [(L, cap_mass[1] + load.tip_mass_g)]
    lumped_I = [(yr, Ip) for yr, Ip in zip(ribs, rib_polar)]
    kb = k_bend if seams else math.inf
    fem = beam_fem(
        nodes,
        EI_f,
        GJ_f,
        m_f,
        Ip_f,
        seams=seams,
        k_bend=kb,
        k_tors=k_tors_at,
        w_line=w_f,
        t_line=t_f,
        point_forces=point_forces,
        point_torques=point_torques,
        point_masses=tuple(lumped),
        point_inertias=tuple(lumped_I),
    )

    # Tip stiffness for a unit tip force (force-deflection slope of a tip-load test)
    unit = beam_fem(
        nodes, EI_f, GJ_f, m_f, Ip_f, seams=seams, k_bend=kb, k_tors=k_tors_at,
        point_forces=((L, 1.0),), n_modes=1,
    )
    rigid_seams = float(_cum_from_root(_cum_from_root((L - y) / props["EI"], y), y)[-1])
    stiffness = {
        "tip_force_N_per_mm": 1.0 / float(unit["w"][-1]),
        "rigid_seams_N_per_mm": 1.0 / rigid_seams,
        "root_EI_hand_check_N_per_mm": 3.0 * sections[0].EI_flap_Nmm2 / L**3,
        "free_play_tip_mm": seam_info["free_play_tip_mm"],
    }

    # --- Stresses (limit load) ------------------------------------------------
    E_p = pla.E_MPa
    sig_top = -E_p * kappa * (props["z_top"] - props["z_c"])
    sig_bot = -E_p * kappa * (props["z_bot"] - props["z_c"])
    t = geom.skin_mm
    sig_skin_top = -E_p * kappa * (props["z_top"] - t / 2 - props["z_c"])
    sig_skin_bot = -E_p * kappa * (props["z_bot"] + t / 2 - props["z_c"])
    skin_comp = np.maximum(np.maximum(-sig_skin_top, 0), np.maximum(-sig_skin_bot, 0))

    # Skin buckling capacity along the span
    supports = np.array(geom.skin_supports_mm())
    bay = np.array([supports[np.searchsorted(supports, yy, side="right")] - supports[np.searchsorted(supports, yy, side="right") - 1] if yy < L else supports[-1] - supports[-2] for yy in y])
    sig_flat = np.array([plate_buckling_flat(E_p, pla.poisson, t, a, b) for a, b in zip(bay, props["skin_width"])])
    sig_cyl = np.array([cylinder_buckling_knocked_down(E_p, pla.poisson, t, R) for R in props["skin_radius"]])
    sig_cr = np.maximum(sig_flat, sig_cyl)

    # Rods
    r = geom.rod_radius_mm
    if assembly.rods_bonded:
        rod_offset = [max(abs(zr - s.centroid_z_mm) for _, zr in geom.rod_centres_mm(s.y_mm)) for s in sections]
        sig_rod = rod.E_MPa * np.abs(kappa) * (_interp_lin(y, y_sec, rod_offset) + r)
    else:
        sig_rod = rod.E_MPa * np.abs(kappa) * r

    # Shear stress from the 2-D FE sections (transverse shear + torsion about the shear centre).
    # The nominal value excludes a 2*skin radius around the four sharp cavity corners, where the
    # elastic solution is a geometry-dependent concentration; the corner peak is reported separately.
    tau, tau_peak = [], []
    for s in sections:
        Vs = float(np.interp(s.y_mm, y, V))
        Ts = float(np.interp(s.y_mm, y, T))
        field_, far = shear_stress_field(s, Vs, Ts, geom)
        tau.append(float(field_[far].max()))
        tau_peak.append(float(field_.max()))
    tau, tau_peak = np.array(tau), np.array(tau_peak)
    bredt_tau = np.array([abs(float(np.interp(s.y_mm, y, T))) / (2 * s.bredt_area_mm2 * t) for s in sections])

    stress = {
        "sigma_top": sig_top,
        "sigma_bottom": sig_bot,
        "skin_compression": skin_comp,
        "skin_critical": sig_cr,
        "skin_critical_flat": sig_flat,
        "skin_critical_cylinder": sig_cyl,
        "sigma_rod": sig_rod,
        "tau_sections": tau,
        "tau_corner_peak_sections": tau_peak,
        "tau_bredt_sections": bredt_tau,
        "y_sections": y_sec,
        "kappa": kappa,
    }

    # --- Checks -----------------------------------------------------------------
    F = load.factor_of_safety
    checks: list[Check] = []
    tens = np.maximum(sig_top, sig_bot)
    comp = np.maximum(-sig_top, -sig_bot)
    i_t, i_c = int(np.argmax(tens)), int(np.argmax(comp))
    checks.append(Check("PLA tension (bending)", F * max(tens[i_t], 0.0), pla.tensile_MPa, "MPa", y[i_t], f"FoS {F} x limit stress vs tensile strength"))
    checks.append(Check("PLA compression (bending)", F * max(comp[i_c], 0.0), pla.compressive_MPa, "MPa", y[i_c], f"FoS {F} x limit stress vs compressive strength"))
    k_tau = int(np.argmax(tau))
    checks.append(Check("PLA shear (transverse shear + torsion, 2-D FE)", F * tau[k_tau], pla.shear_MPa, "MPa", y_sec[k_tau], "Max nominal resultant shear away from sharp cavity corners"))
    ratio = skin_comp / sig_cr
    i_b = int(np.argmax(ratio))
    checks.append(Check("Skin compression buckling (screening)", F * skin_comp[i_b], sig_cr[i_b], "MPa", y[i_b], "max(flat plate between ribs, SP-8007 knocked-down cylinder)"))
    if not assembly.seams_bonded and geom.seams_mm():
        worst = None
        for s in geom.seams_mm():
            Ms = abs(float(np.interp(s, y, M)))
            Vs = abs(float(np.interp(s, y, V)))
            rod_sigma = (Ms / n_r) * r / I_rod
            sup = np.array(geom.skin_supports_mm())
            inner = s - geom.interface_rib_offset_mm
            outer_ = s + geom.interface_rib_offset_mm
            lever_a = inner - sup[sup < inner - 1e-6].max()
            lever_b = sup[sup > outer_ + 1e-6].min() - outer_
            bearing = (Ms / n_r) / min(lever_a, lever_b) / (geom.rod_diameter_mm * geom.rib_thickness_mm)
            dowel = 4.0 / 3.0 * (Vs / n_r) / (math.pi * r**2)
            if worst is None or rod_sigma > worst[1]:
                worst = (s, rod_sigma, bearing, dowel)
        s, rod_sigma, bearing, dowel = worst
        checks.append(Check("Rod bending at dry seam (rods carry the whole moment)", F * rod_sigma, min(rod.tensile_MPa, rod.compressive_MPa), "MPa", s, "sigma = (M/n) r / I_rod"))
        checks.append(Check("Rib-hole bearing at dry seam (screening)", F * bearing, pla.compressive_MPa, "MPa", s, "rod moment reacted by a force couple between interface rib and next rib"))
        checks.append(Check("Rod dowel shear at dry seam", F * dowel, rod.shear_MPa, "MPa", s, "4V/(3 n pi r^2)"))
    else:
        i_r = int(np.argmax(sig_rod))
        checks.append(Check("Rod bending (rods follow the shell curvature)", F * sig_rod[i_r], min(rod.tensile_MPa, rod.compressive_MPa), "MPa", y[i_r], "E_rod x curvature x fibre distance"))
    if assembly.seams_bonded and geom.seams_mm():
        joint = [max(float(np.interp(s, y, tens)), 0.0) for s in geom.seams_mm()]
        k = int(np.argmax(joint))
        checks.append(Check("Bonded seam butt-joint tension", F * joint[k], assembly.adhesive_tensile_MPa, "MPa", geom.seams_mm()[k], "Bending tension across the epoxy joint"))
    checks.append(Check("Tip deflection at limit load", abs(float(deflection[-1])), criteria.max_tip_deflection_mm, "mm", L, "Stiffness criterion (limit load, no FoS)"))
    checks.append(Check("Tip twist at limit load", abs(math.degrees(float(twist[-1]))), criteria.max_tip_twist_deg, "deg", L, "Stiffness criterion (limit load, no FoS)"))

    # --- Verification ---------------------------------------------------------
    verification = {
        "root shear vs applied force (rel. error)": abs(V[0] - applied_force) / max(abs(applied_force), 1e-12),
        "root moment vs applied moment (rel. error)": abs(M[0] - applied_moment) / max(abs(applied_moment), 1e-12),
        "tip deflection: direct vs 1-D FEM (rel. diff)": abs(deflection[-1] - fem["w"][-1]) / max(abs(fem["w"][-1]), 1e-12),
        "tip twist: direct vs 1-D FEM (rel. diff)": abs(twist[-1] - fem["phi"][-1]) / max(abs(fem["phi"][-1]), 1e-12),
        "J: Bredt-Batho / 2-D FE (root)": sections[0].J_bredt_mm4 / sections[0].J_fe_mm4,
        "J: Bredt-Batho / 2-D FE (tip)": sections[-1].J_bredt_mm4 / sections[-1].J_fe_mm4,
        "max principal-axis angle (deg)": max(abs(s.principal_angle_deg) for s in sections),
    }

    loads = {
        "w_net_N_per_mm": w,
        "point_loads": point,
        "applied_force_N": applied_force,
        "applied_moment_Nmm": applied_moment,
        "lift_N": load.semi_wing_lift_N if load.kind == "flight" else load.tip_force_N,
    }
    return SolverResult(
        geometry=geom,
        pla=pla,
        rod=rod,
        assembly=assembly,
        load=load,
        criteria=criteria,
        sections=sections,
        y=y,
        props=props,
        loads=loads,
        V=V,
        M=M,
        T=T,
        slope=slope,
        deflection=deflection,
        twist=twist,
        fem=fem,
        seam=seam_info,
        stress=stress,
        checks=checks,
        mass=mass,
        stiffness=stiffness,
        verification=verification,
    )


def compare_assemblies(geometry=None, pla=PLA_UPRIGHT, rods=(ROD_HOBBY, ROD_AEROSPACE), load=None, criteria=None, **kw):
    """Run the four joining options for each rod card and return comparison rows."""

    rows = []
    for rod in rods:
        for rods_bonded in (False, True):
            for seams_bonded in (False, True):
                a = Assembly(rods_bonded=rods_bonded, seams_bonded=seams_bonded)
                res = solve(geometry, pla, rod, a, load, criteria, **kw)
                g = res.governing
                rows.append(
                    {
                        "rod card": rod.name.split(",")[1].strip() if "," in rod.name else rod.name,
                        "rods in sleeves": "epoxied" if rods_bonded else "slip fit",
                        "module seams": "epoxied" if seams_bonded else "dry",
                        "tip deflection (mm)": round(res.tip_deflection_mm, 2),
                        "tip stiffness (N/mm)": round(res.stiffness["tip_force_N_per_mm"], 3),
                        "free play at tip (mm)": round(res.seam["free_play_tip_mm"], 2),
                        "f1 bending (Hz)": round(float(res.fem["f_bending_Hz"][0]), 1),
                        "governing check": g.name,
                        "U max": round(float(g.utilization), 2),
                    }
                )
    return rows


# ---------------------------------------------------------------------------
# 10. Plots (matplotlib, imported lazily)
# ---------------------------------------------------------------------------


def plot_section(result_or_geom, y_mm: float = 0.0, ax=None, title: str | None = None):
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon as MplPolygon

    if isinstance(result_or_geom, SolverResult):
        res = result_or_geom
        geom = res.geometry
        sec = min(res.sections, key=lambda s: abs(s.y_mm - y_mm))
        shapes = sec.shapes
    else:
        res, sec, geom = None, None, result_or_geom
        shapes = section_shapes(geom, y_mm)
    if ax is None:
        _, ax = plt.subplots(figsize=(11, 3.4))

    def draw(poly, **style):
        ext = np.asarray(poly.exterior.coords)
        ax.add_patch(MplPolygon(ext, closed=True, **style))
        for hole in poly.interiors:
            ax.add_patch(MplPolygon(np.asarray(hole.coords), closed=True, facecolor="white", edgecolor=style.get("edgecolor", "k"), lw=0.6))

    draw(shapes.outer, facecolor="none", edgecolor="0.55", lw=0.8, ls="--")
    draw(shapes.shell, facecolor="#9ecae1", edgecolor="#08519c", lw=0.8)
    for p in shapes.floating:
        draw(p, facecolor="#fdd0a2", edgecolor="#d94801", lw=0.8)
    for rpoly in shapes.rods:
        draw(rpoly, facecolor="0.15", edgecolor="k", lw=0.5)
    c = shapes.chord_mm
    ax.axvline(0.25 * c, color="0.6", lw=0.8, ls=":")
    ax.text(0.25 * c, shapes.outer.bounds[3] + 1.0, "c/4", ha="center", fontsize=8, color="0.4")
    if sec is not None:
        ax.plot(sec.centroid_x_mm, sec.centroid_z_mm, "+", ms=12, mew=2, color="crimson", label="modulus-weighted centroid")
        ax.plot(sec.shear_centre_x_mm, sec.shear_centre_z_mm, "x", ms=10, mew=2, color="darkgreen", label="shear centre (2-D FE)")
        ax.axhline(sec.centroid_z_mm, color="crimson", lw=0.6, alpha=0.6)
        ax.legend(loc="lower right", fontsize=8, frameon=True)
    ax.set_aspect("equal")
    ax.set_xlim(-3, c + 3)
    minz, maxz = shapes.outer.bounds[1], shapes.outer.bounds[3]
    ax.set_ylim(minz - 4, maxz + 4)
    ax.set_xlabel("x from leading edge (mm)")
    ax.set_ylabel("z (mm)")
    ax.set_title(title or f"Printed section at y = {shapes.y_mm:.0f} mm (chord {c:.0f} mm): blue = shell, orange = sleeve connected only at ribs, black = rods")
    return ax


def plot_span(res: SolverResult):
    import matplotlib.pyplot as plt

    y = res.y
    fig, axs = plt.subplots(3, 2, figsize=(12, 9), sharex=True)
    axs = axs.ravel()
    wnet = res.loads["w_net_N_per_mm"]
    axs[0].plot(y, wnet, color="#2171b5")
    axs[0].axhline(0, color="k", lw=0.6)
    span_w = max(float(np.abs(wnet).max()), 0.01)
    pts = res.loads["point_loads"]
    big = max([abs(F) for _, F, _ in pts] + [1e-12])
    for yp, F, _ in pts:
        axs[0].annotate(
            "", xy=(yp, 0), xytext=(yp, 0.8 * span_w * F / big),
            arrowprops=dict(arrowstyle="<-", color="k", lw=1.2),
        )
    if len(pts) == 1:
        axs[0].text(pts[0][0], 0.85 * span_w * np.sign(pts[0][1]), f"{pts[0][1]:+.2f} N ", ha="right", fontsize=9)
    elif pts:
        total = sum(F for _, F, _ in pts)
        axs[0].text(0.02, 0.04, f"arrows: {len(pts)} point forces (ribs, tip cap, tip mass), total {total:+.2f} N",
                    transform=axs[0].transAxes, fontsize=8)
    axs[0].set_ylim(-1.1 * span_w, 1.1 * span_w)
    axs[0].set_ylabel("net line load (N/mm)")
    axs[0].set_title("Load (labelled arrows = point forces)")
    axs[1].plot(y, res.V, color="#238b45")
    axs[1].set_ylabel("shear V (N)")
    axs[1].set_title("Shear force")
    axs[2].plot(y, res.M * 1e-3, color="#cb181d")
    axs[2].set_ylabel("bending moment M (N m)")
    axs[2].set_title("Bending moment")
    axs[3].plot(y, res.T * 1e-3, color="#6a51a3")
    axs[3].set_ylabel("torque T, nose-up + (N m)")
    axs[3].set_title("Torque about the shear centre")
    axs[4].plot(y, res.deflection, lw=2.5, color="#08519c", label="direct integration")
    axs[4].plot(res.fem["y"], res.fem["w"], "--", color="orange", label="1-D beam FEM")
    for s in res.geometry.seams_mm():
        for a in axs:
            a.axvline(s, color="0.7", lw=0.8, ls="--")
    axs[4].set_ylabel("deflection (mm)")
    axs[4].set_title("Vertical deflection")
    axs[4].legend()
    axs[5].plot(y, np.degrees(res.twist), lw=2.5, color="#54278f", label="direct integration")
    axs[5].plot(res.fem["y"], np.degrees(res.fem["phi"]), "--", color="orange", label="1-D beam FEM")
    axs[5].set_ylabel("twist, nose-up + (deg)")
    axs[5].set_title("Elastic twist")
    axs[5].legend()
    for a in axs[4:]:
        a.set_xlabel("span station y from root (mm)")
    for a in axs:
        a.grid(True, alpha=0.3)
    fig.suptitle(f"{res.load.name}: limit-load response (grey dashed lines = module seams)")
    fig.tight_layout()
    return fig


def plot_checks(res: SolverResult):
    import matplotlib.pyplot as plt

    names = [c.name for c in res.checks]
    u = [c.utilization for c in res.checks]
    colors = ["#2ca25f" if v <= 0.7 else "#fec44f" if v <= 1.0 else "#de2d26" for v in u]
    fig, ax = plt.subplots(figsize=(10, 0.45 * len(names) + 1.2))
    ax.barh(names, u, color=colors)
    ax.axvline(1.0, color="k", lw=1.2)
    for i, v in enumerate(u):
        ax.text(v + 0.02, i, f"{v:.2f}", va="center", fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel("utilization U = demand / capacity (U <= 1 passes the screen)")
    ax.set_title(f"Screening checks - {res.load.name}")
    ax.set_xlim(0, max(1.2, max(u) * 1.15))
    fig.tight_layout()
    return fig


def plot_stress_maps(res: SolverResult, station_index: int = 0):
    """Spanwise normal stress (beam theory) and resultant shear stress (2-D FE) on one section."""

    import matplotlib.pyplot as plt
    import matplotlib.tri as mtri

    sec = res.sections[station_index]
    fe = sec.fe_section
    yy = sec.y_mm
    Vs = float(np.interp(yy, res.y, res.V))
    Ts = float(np.interp(yy, res.y, res.T))
    kappa = float(np.interp(yy, res.y, res.stress["kappa"]))
    nodes = np.asarray(fe.mesh["vertices"])
    tri = np.asarray(fe.mesh["triangles"])[:, :3]
    triang = mtri.Triangulation(nodes[:, 0], nodes[:, 1], tri)
    sigma = -res.pla.E_MPa * kappa * (nodes[:, 1] - sec.centroid_z_mm)
    tau, far = shear_stress_field(sec, Vs, Ts, res.geometry)
    fig, axs = plt.subplots(2, 1, figsize=(12, 5.0), layout="constrained")
    lim = np.max(np.abs(sigma))
    c0 = axs[0].tripcolor(triang, sigma, cmap="RdBu_r", vmin=-lim, vmax=lim, shading="gouraud")
    fig.colorbar(c0, ax=axs[0], label="sigma (MPa), + tension", shrink=0.9)
    c1 = axs[1].tripcolor(triang, tau, cmap="viridis", shading="gouraud", vmax=float(tau[far].max()) * 1.05)
    fig.colorbar(c1, ax=axs[1], label="|tau| (MPa), capped", shrink=0.9)
    corners = sec.shapes.cavity_corners
    if len(corners):
        axs[1].plot(corners[:, 0], corners[:, 1], "o", mfc="none", mec="red", ms=9, label=f"sharp cavity corners: peak {tau.max():.2f} MPa")
        axs[1].legend(loc="lower right", fontsize=8)
    for a in axs:
        a.set_aspect("equal")
        a.set_xlabel("x (mm)")
        a.set_ylabel("z (mm)")
    axs[0].set_title(f"Spanwise normal stress at y = {yy:.0f} mm, limit load (shell only; rods and floating sleeves not drawn)")
    axs[1].set_title(f"Resultant shear stress from V = {Vs:.1f} N and T = {Ts:.0f} N mm (2-D warping FE)")
    return fig


def plot_modes(res: SolverResult, n: int = 2):
    import matplotlib.pyplot as plt

    fig, axs = plt.subplots(1, 2, figsize=(12, 3.6))
    for k in range(min(n, len(res.fem["modes_bending"]))):
        axs[0].plot(res.fem["y"], res.fem["modes_bending"][k], label=f"bending mode {k + 1}: {res.fem['f_bending_Hz'][k]:.1f} Hz")
    for k in range(min(n, len(res.fem["modes_torsion"]))):
        axs[1].plot(res.fem["y"], res.fem["modes_torsion"][k], label=f"torsion mode {k + 1}: {res.fem['f_torsion_Hz'][k]:.0f} Hz")
    for a in axs:
        a.axhline(0, color="k", lw=0.6)
        for s in res.geometry.seams_mm():
            a.axvline(s, color="0.7", ls="--", lw=0.8)
        a.legend(fontsize=8)
        a.set_xlabel("y (mm)")
        a.grid(alpha=0.3)
    axs[0].set_title("Uncoupled bending modes (clamped root)")
    axs[1].set_title("Uncoupled torsion modes (clamped root)")
    fig.tight_layout()
    return fig


def export_results(res: SolverResult, prefix: str = "printed_wing") -> list[str]:
    """Write CSV/JSON evidence files and return their names."""

    import csv
    import json

    files = []
    with open(f"{prefix}_spanwise.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["y_mm", "chord_mm", "w_N_per_mm", "V_N", "M_Nmm", "T_Nmm", "EI_Nmm2", "GJ_Nmm2", "deflection_mm", "twist_deg", "sigma_top_MPa", "sigma_bottom_MPa"])
        for i in range(len(res.y)):
            wr.writerow([f"{res.y[i]:.3f}", f"{res.props['chord'][i]:.3f}", f"{res.loads['w_net_N_per_mm'][i]:.6g}", f"{res.V[i]:.6g}", f"{res.M[i]:.6g}", f"{res.T[i]:.6g}", f"{res.props['EI'][i]:.6g}", f"{res.props['GJ'][i]:.6g}", f"{res.deflection[i]:.6g}", f"{math.degrees(res.twist[i]):.6g}", f"{res.stress['sigma_top'][i]:.6g}", f"{res.stress['sigma_bottom'][i]:.6g}"])
    files.append(f"{prefix}_spanwise.csv")
    with open(f"{prefix}_sections.csv", "w", newline="") as fh:
        rows = res.section_table()
        wr = csv.DictWriter(fh, fieldnames=list(rows[0]))
        wr.writeheader()
        wr.writerows(rows)
    files.append(f"{prefix}_sections.csv")
    with open(f"{prefix}_checks.csv", "w", newline="") as fh:
        rows = res.check_table()
        wr = csv.DictWriter(fh, fieldnames=list(rows[0]))
        wr.writeheader()
        wr.writerows(rows)
    files.append(f"{prefix}_checks.csv")
    record = {
        "solver_version": __version__,
        "geometry": res.geometry.to_dict(),
        "pla": asdict(res.pla),
        "rod": asdict(res.rod),
        "assembly": asdict(res.assembly),
        "load": asdict(res.load),
        "criteria": asdict(res.criteria),
        "summary": res.summary(),
        "mass_g": res.mass,
        "verification": {k: float(v) for k, v in res.verification.items()},
        "frequencies_Hz": {"bending": [float(f) for f in res.fem["f_bending_Hz"]], "torsion": [float(f) for f in res.fem["f_torsion_Hz"]]},
    }
    with open(f"{prefix}_summary.json", "w") as fh:
        json.dump(record, fh, indent=2)
    files.append(f"{prefix}_summary.json")
    return files
