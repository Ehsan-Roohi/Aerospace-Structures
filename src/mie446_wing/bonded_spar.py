"""Nominal Wing Lab cap/web polygons and their printable, skin-connected CAD lofts.

The beam and CAD representations are not identical discretisations. A 0.05 mm
bond overlap inside the existing skin avoids coincident-face Boolean failures;
it is clipped to the outer wing and does not thicken the outside surface.
"""
import cadquery as cq
import numpy as np

from .airfoil import surface_ordinates_at
from .config import BondedSparSpec, WingParameters
from .cad_metrics import adaptive_volume
from .wing_sections import surface_at, transform_point, loft_stations


def spar_polygons(p: WingParameters, s: BondedSparSpec, y: float):
    c = p.chord_at(y)
    x = s.fraction * c
    tx = x + s.top_width * (np.arange(9) / 8 - .5)
    bx = x + s.bottom_width * (np.arange(9) / 8 - .5)
    if min(tx[0], bx[0]) <= p.cavity_x_start*c or max(tx[-1], bx[-1]) >= p.cavity_x_end*c:
        raise ValueError(f"bonded spar caps leave the cavity at y={y:g} mm")
    tz = surface_at(p, y, tx/c)[2] - p.skin_mm
    bz = surface_at(p, y, bx/c)[0] + p.skin_mm
    xl, xr = x-s.web_thickness/2, x+s.web_thickness/2
    tu = lambda q: float(np.interp(q, tx, tz)) - s.top_thickness
    bl = lambda q: float(np.interp(q, bx, bz)) + s.bottom_thickness
    h = tu(x)-bl(x)
    if h <= 0 or s.web_thickness > h/5:
        raise ValueError(f"bonded spar web thickness exceeds clear height/5 at y={y:g} mm")
    top = list(zip(tx.tolist(), tz.tolist()))
    bottom = list(zip(bx.tolist(), bz.tolist()))
    web = [(xl, bl(xl))] + [(q, bl(q)) for q in bx if xl < q < xr] + [(xr, bl(xr)), (xr, tu(xr))] + [(q, tu(q)) for q in tx[::-1] if xl < q < xr] + [(xl, tu(xl))]
    return [top + [(a, b-s.top_thickness) for a,b in top[::-1]],
            bottom + [(a, b+s.bottom_thickness) for a,b in bottom[::-1]], web]


def validate_spar_layout(p: WingParameters):
    for y in np.linspace(0, p.semi_span_mm, 33):
        active = [s for s in p.bonded_spars if y <= s.length]
        for s in active:
            spar_polygons(p, s, float(y))
        for i, s in enumerate(active):
            for other in active[:i]:
                if abs(s.fraction-other.fraction)*p.chord_at(y) <= (max(s.top_width,s.bottom_width)+max(other.top_width,other.bottom_width))/2:
                    raise ValueError("bonded spar caps overlap")
    # Check the exact runout as well as the common sampling grid.
    for s in p.bonded_spars:
        spar_polygons(p, s, s.length)


def make_bonded_spar(p: WingParameters, s: BondedSparSpec, outer: cq.Shape):
    pieces = []
    for part in range(3):
        wires = []
        for y in sorted(set(np.linspace(0, s.length, 9)) | set(loft_stations(p, 0, s.length))):
            poly = spar_polygons(p, s, float(y))[part]
            if part in (0,1):
                poly = [(x, z + (.05 if part==0 else -.05) if j<9 else z) for j,(x,z) in enumerate(poly)]
            wires.append(cq.Wire.makePolygon([cq.Vector(*transform_point(p,float(y),float(x),float(z))) for x,z in poly], close=True))
        pieces.append(cq.Solid.makeLoft(wires, ruled=bool(p.airfoil_stations or p.airfoil_profile is not None or p.sweep_deg or p.dihedral_deg or p.sweep_reference_fraction)))
    shape = pieces[0].fuse(*pieces[1:]).intersect(outer).clean()
    if not shape.isValid() or adaptive_volume(shape) <= 0:
        raise ValueError("bonded spar CAD is invalid")
    return shape
