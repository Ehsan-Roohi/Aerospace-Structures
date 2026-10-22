"""Validated design inputs and the course baseline configuration."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
import math
from pathlib import Path
import re
from typing import Any


_NACA4 = re.compile(r"^(?:NACA\s*)?(\d{4})$", re.IGNORECASE)
K2_PRO_BUILD_VOLUME_MM = (300.0, 300.0, 300.0)


def normalize_naca4(code: str) -> str:
    """Return a four-digit NACA code and reject undefined combinations."""

    match = _NACA4.fullmatch(str(code).strip())
    if not match:
        raise ValueError("naca must be a four-digit code such as '2412' or 'NACA 2412'")
    digits = match.group(1)
    maximum_camber = int(digits[0])
    camber_position = int(digits[1])
    thickness = int(digits[2:])
    if maximum_camber and camber_position == 0:
        raise ValueError("a cambered NACA 4-digit profile must have a nonzero camber position")
    if thickness == 0:
        raise ValueError("airfoil thickness must be greater than zero")
    return digits


@dataclass(frozen=True)
class SparSpec:
    """A straight carbon-rod path defined by a constant chord fraction."""

    chord_fraction: float
    rod_diameter_mm: float = 4.0
    radial_clearance_mm: float = 0.25
    sleeve_wall_mm: float = 1.20

    def __post_init__(self) -> None:
        if not 0.10 <= self.chord_fraction <= 0.80:
            raise ValueError("spar chord_fraction must be between 0.10 and 0.80")
        if self.rod_diameter_mm <= 0:
            raise ValueError("rod_diameter_mm must be positive")
        if not 0.05 <= self.radial_clearance_mm <= 0.80:
            raise ValueError("radial_clearance_mm must be between 0.05 and 0.80 mm")
        if self.sleeve_wall_mm < 0.8:
            raise ValueError("sleeve_wall_mm must be at least 0.8 mm")

    @property
    def hole_radius_mm(self) -> float:
        return self.rod_diameter_mm / 2.0 + self.radial_clearance_mm

    @property
    def sleeve_radius_mm(self) -> float:
        return self.hole_radius_mm + self.sleeve_wall_mm


def _default_spars() -> tuple[SparSpec, ...]:
    return (SparSpec(0.30), SparSpec(0.60))


@dataclass(frozen=True)
class BondedSparSpec:
    """Root-starting printed I-spar; dimensions match Wing Lab's vertical cap convention."""

    fraction: float
    length: float
    top_width: float
    top_thickness: float
    bottom_width: float
    bottom_thickness: float
    web_thickness: float

    def __post_init__(self) -> None:
        for name, value in asdict(self).items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                raise ValueError(f"bonded spar {name} must be finite and positive")
        if self.fraction >= 1:
            raise ValueError("bonded spar fraction must lie inside the chord")
        if self.top_thickness > self.top_width / 5 or self.bottom_thickness > self.bottom_width / 5:
            raise ValueError("bonded spar cap thickness must not exceed width/5")
        if self.web_thickness >= min(self.top_width, self.bottom_width):
            raise ValueError("bonded spar web must be narrower than its caps")


@dataclass(frozen=True)
class WingParameters:
    """All dimensions are in millimetres unless otherwise stated."""

    naca: str = "2412"
    semi_span_mm: float = 450.0
    root_chord_mm: float = 160.0
    tip_chord_mm: float = 100.0
    skin_mm: float = 1.20
    trailing_edge_mm: float = 1.20
    rib_thickness_mm: float = 1.60
    interior_rib_count: int = 3
    module_count: int = 3
    interface_rib_offset_mm: float = 4.0
    root_tip_cap_mm: float = 2.0
    cavity_x_start: float = 0.06
    cavity_x_end: float = 0.90
    airfoil_point_count: int = 41
    loft_station_count: int = 3
    pla_density_g_cm3: float = 1.24
    maximum_printed_mass_g: float = 300.0
    # Actual usable machine envelope, not an artificial nominal span/chord limit.
    printer_build_volume_mm: tuple[float, float, float] = K2_PRO_BUILD_VOLUME_MM
    spars: tuple[SparSpec, ...] = field(default_factory=_default_spars)
    # None retains the original course rule; an empty tuple deliberately means no editable ribs.
    custom_rib_stations_mm: tuple[float, ...] | None = None
    bonded_spars: tuple[BondedSparSpec, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "naca", normalize_naca4(self.naca))
        object.__setattr__(self, "spars", tuple(self.spars))
        object.__setattr__(self, "bonded_spars", tuple(self.bonded_spars))
        envelope = self.printer_build_volume_mm
        if not isinstance(envelope, (tuple, list)) or len(envelope) != 3 or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0
            for v in envelope
        ):
            raise ValueError("printer_build_volume_mm must contain three finite positive usable dimensions in mm")
        object.__setattr__(self, "printer_build_volume_mm", tuple(float(v) for v in envelope))
        if self.custom_rib_stations_mm is not None:
            object.__setattr__(self, "custom_rib_stations_mm", tuple(self.custom_rib_stations_mm))

        positive = {
            "semi_span_mm": self.semi_span_mm,
            "root_chord_mm": self.root_chord_mm,
            "tip_chord_mm": self.tip_chord_mm,
            "skin_mm": self.skin_mm,
            "trailing_edge_mm": self.trailing_edge_mm,
            "rib_thickness_mm": self.rib_thickness_mm,
            "root_tip_cap_mm": self.root_tip_cap_mm,
            "pla_density_g_cm3": self.pla_density_g_cm3,
            "maximum_printed_mass_g": self.maximum_printed_mass_g,
        }
        for name, value in positive.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive")

        if self.tip_chord_mm > self.root_chord_mm:
            raise ValueError("tip_chord_mm cannot exceed root_chord_mm in this starter project")
        if isinstance(self.module_count, bool) or self.module_count not in (1, 2, 3):
            raise ValueError("module_count must be 1, 2 or 3; choose 1 for a continuous one-piece wing")
        if self.interior_rib_count < 0:
            raise ValueError("interior_rib_count cannot be negative")
        if self.interface_rib_offset_mm <= self.rib_thickness_mm:
            raise ValueError("interface_rib_offset_mm must exceed rib_thickness_mm")
        if self.root_tip_cap_mm * 2 >= self.semi_span_mm:
            raise ValueError("root_tip_cap_mm leaves no span for the cavity")
        if not 0.02 <= self.cavity_x_start < self.cavity_x_end <= 0.95:
            raise ValueError("cavity chord limits must satisfy 0.02 <= start < end <= 0.95")
        if self.airfoil_point_count < 41 or self.airfoil_point_count % 2 == 0:
            raise ValueError("airfoil_point_count must be an odd integer of at least 41")
        if self.loft_station_count < 2:
            raise ValueError("loft_station_count must be at least 2")
        if len(self.spars) > 8:
            raise ValueError("use zero to eight rod paths")
        if len(self.bonded_spars) > 2 or (self.bonded_spars and self.spars):
            raise ValueError("use at most two bonded spars; mixed rod/spar designs are not supported")
        if any(s.length > self.semi_span_mm for s in self.bonded_spars):
            raise ValueError("bonded spar length cannot exceed the semi-span")
        if self.custom_rib_stations_mm is not None:
            ribs = self.custom_rib_stations_mm
            if len(ribs) > 16:
                raise ValueError("use at most 16 custom interior ribs")
            for i, station in enumerate(ribs):
                if isinstance(station, bool) or not isinstance(station, (int, float)) or not math.isfinite(station):
                    raise ValueError("custom rib stations must be finite numbers")
                if not self.root_tip_cap_mm + self.rib_thickness_mm / 2 < station < self.semi_span_mm - self.root_tip_cap_mm - self.rib_thickness_mm / 2:
                    raise ValueError("custom ribs must clear the root/tip caps")
                if i and station - ribs[i-1] <= self.rib_thickness_mm:
                    raise ValueError("custom ribs must be sorted, distinct and non-overlapping")
                if any(abs(station - b) <= self.interface_rib_offset_mm + self.rib_thickness_mm for b in self.module_bounds_mm()[1:-1]):
                    raise ValueError("custom ribs must clear locked module-interface ribs")
        fractions = [spar.chord_fraction for spar in self.spars]
        if len(set(fractions)) != len(fractions):
            raise ValueError("spar chord fractions must be unique")

    def chord_at(self, y_mm: float) -> float:
        eta = min(1.0, max(0.0, y_mm / self.semi_span_mm))
        return self.root_chord_mm + eta * (self.tip_chord_mm - self.root_chord_mm)

    def module_bounds_mm(self) -> tuple[float, ...]:
        return tuple(i * self.semi_span_mm / self.module_count for i in range(self.module_count + 1))

    def rib_stations_mm(self) -> tuple[float, ...]:
        """Return robust rib locations, including pairs beside module seams."""

        stations: list[float] = []
        boundaries = self.module_bounds_mm()[1:-1]
        if self.custom_rib_stations_mm is not None:
            stations.extend(self.custom_rib_stations_mm)
        elif self.interior_rib_count:
            step = self.semi_span_mm / (self.interior_rib_count + 1)
            candidates = (step * i for i in range(1, self.interior_rib_count + 1))
            stations.extend(
                station
                for station in candidates
                if all(
                    abs(station - boundary)
                    > self.interface_rib_offset_mm + self.rib_thickness_mm
                    for boundary in boundaries
                )
            )
        for boundary in boundaries:
            stations.extend(
                (boundary - self.interface_rib_offset_mm, boundary + self.interface_rib_offset_mm)
            )
        tolerance = self.rib_thickness_mm
        merged: list[float] = []
        for station in sorted(stations):
            if not merged or abs(station - merged[-1]) > tolerance:
                merged.append(station)
        return tuple(merged)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @classmethod
    def from_dict(cls, values: dict[str, Any]) -> "WingParameters":
        data = dict(values)
        if "spars" in data:
            data["spars"] = tuple(
                item if isinstance(item, SparSpec) else SparSpec(**item) for item in data["spars"]
            )
        if "bonded_spars" in data:
            data["bonded_spars"] = tuple(item if isinstance(item, BondedSparSpec) else BondedSparSpec(**item) for item in data["bonded_spars"])
        return cls(**data)

    @classmethod
    def from_json(cls, path: str | Path) -> "WingParameters":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
