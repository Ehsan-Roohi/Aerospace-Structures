"""Station geometry shared by the JSON bridge, CAD and notebook previews.

x is aft, y is the projected semi-span and z is up. Sweep is measured at the
specified chord reference; positive incidence raises the leading edge. Sections
remain parallel to the aircraft x-z plane (they are not normal to the span line).
NACA five-digit mean lines: PDAS/NASA TR-537, non-reflex three-digit mean line.
"""
from __future__ import annotations

import math
import re
import numpy as np

from .airfoil import AirfoilSection, camber_line, cosine_spacing, naca4_section


def validate_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError("station airfoil must be a profile object")
    kind = profile.get('kind')
    allowed = {'kind','code'} if kind in ('naca4','naca5') else {'kind','version','name','upper','lower','source'}
    if set(profile)-allowed:
        raise ValueError("airfoil profile contains unsupported fields")
    if kind in ('naca4','naca5') and not isinstance(profile.get('code'),str):
        raise ValueError("NACA profile code must be a string")
    if kind == 'naca4':
        from .config import normalize_naca4
        normalize_naca4(profile.get('code', ''))
    elif kind == 'naca5':
        if not re.fullmatch(r'[1-9][1-5]0\d{2}', str(profile.get('code', ''))) or int(profile['code'][-2:]) == 0:
            raise ValueError("NACA five-digit generator supports non-reflex codes such as 23012; use DAT coordinates for reflex profiles")
    elif kind == 'coordinates':
        if profile.get('version',1) != 1:
            raise ValueError("unsupported airfoil coordinate version")
        if 'name' in profile and (not isinstance(profile['name'],str) or len(profile['name']) > 180):
            raise ValueError("airfoil name must be short text")
        source = profile.get('source',{})
        if not isinstance(source,dict) or set(source)-{'format','filename','url','normalization','family'} or any(not isinstance(v,str) for v in source.values()):
            raise ValueError("airfoil source metadata must contain supported text fields")
        for side in ('upper', 'lower'):
            raw = profile.get(side,[])
            if not isinstance(raw,(list,tuple)) or any(not isinstance(pair,(list,tuple)) or len(pair)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) for v in pair) for pair in raw):
                raise ValueError(f"airfoil {side} must contain numerical coordinate pairs, not strings or booleans")
            arr = np.asarray(profile.get(side, []), dtype=float)
            if arr.ndim != 2 or arr.shape[1] != 2 or not 5 <= len(arr) <= 256 or not np.all(np.isfinite(arr)):
                raise ValueError(f"airfoil {side} must contain 5–256 finite [x/c,z/c] pairs")
            if np.any(np.diff(arr[:, 0]) <= 0) or abs(arr[0, 0]) > 1e-8 or abs(arr[-1, 0]-1) > 1e-8:
                raise ValueError("airfoil surfaces must run monotonically from x/c=0 to 1")
            if np.max(np.abs(arr[:, 1])) > .5:
                raise ValueError("airfoil ordinates exceed the normalized half-chord bound")
        x = cosine_spacing(161)
        up = np.interp(x, np.asarray(profile['upper'])[:, 0], np.asarray(profile['upper'])[:, 1])
        lo = np.interp(x, np.asarray(profile['lower'])[:, 0], np.asarray(profile['lower'])[:, 1])
        if np.any(up[1:-1] <= lo[1:-1]) or abs(up[0]-lo[0]) > 1e-6 or up[-1] < lo[-1]-1e-9:
            raise ValueError("airfoil surfaces cross, have an open leading edge, or have no thickness")
    else:
        raise ValueError("unsupported airfoil kind; use naca4, naca5 or normalized coordinates")


def validate_station_geometry(p):
    if p.airfoil_profile is not None:
        validate_profile(p.airfoil_profile)
    if type(p.twist_enabled) is not bool:
        raise ValueError("twist_enabled must be true or false")
    for name, value, bound in [('sweep_deg', p.sweep_deg, 60), ('dihedral_deg', p.dihedral_deg, 45)]:
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or abs(value) > bound:
            raise ValueError(f"{name} must be finite and within ±{bound} degrees")
    for value in (p.sweep_reference_fraction, p.twist_reference_fraction):
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError("sweep/twist chord references must lie between 0 and 1")
    if not p.airfoil_stations:
        if p.twist_enabled:
            raise ValueError("enabled twist requires explicit root and tip airfoil stations")
        return
    if not 2 <= len(p.airfoil_stations) <= 9:
        raise ValueError("use 2–9 airfoil stations including root and tip")
    previous = -1
    for station in p.airfoil_stations:
        if not isinstance(station, dict) or set(station) != {'eta', 'airfoil', 'incidenceDeg'}:
            raise ValueError("each station needs eta, airfoil and incidenceDeg")
        eta, a = station['eta'], station['incidenceDeg']
        if isinstance(eta, bool) or not isinstance(eta, (float, int)) or not math.isfinite(eta) or not previous < eta <= 1:
            raise ValueError("station eta must increase strictly between 0 and 1")
        if previous >= 0 and (eta-previous)*p.semi_span_mm < .1-1e-8:
            raise ValueError("distinct wing stations must be at least 0.1 mm apart")
        if isinstance(a, bool) or not isinstance(a, (float, int)) or not math.isfinite(a) or abs(a) > 30:
            raise ValueError("station incidence must be finite and within ±30 degrees")
        if not p.twist_enabled and a != 0:
            raise ValueError("nonzero station incidence requires twistEnabled=true; angles cannot be silently discarded")
        validate_profile(station['airfoil'])
        previous = eta
    if p.airfoil_stations[0]['eta'] != 0 or p.airfoil_stations[-1]['eta'] != 1:
        raise ValueError("station table must include root eta=0 and tip eta=1")


def naca5_camber(code, x):
    x = np.asarray(x, dtype=float)
    i = int(code[1])-1
    r = [.0580, .1260, .2025, .2900, .3910][i]
    k = [361.4, 51.64, 15.957, 6.643, 3.230][i] * int(code[0])/2
    front = x < r
    y = np.where(front, k/6*(x**3-3*r*x*x+r*r*(3-r)*x), k*r**3/6*(1-x))
    d = np.where(front, k/6*(3*x*x-6*r*x+r*r*(3-r)), -k*r**3/6)
    return y, d


def profile_section(profile, *, chord_mm, trailing_edge_mm, point_count=161):
    if profile['kind'] == 'blend':
        args = dict(chord_mm=chord_mm,trailing_edge_mm=trailing_edge_mm,point_count=point_count)
        a,b,f = profile_section(profile['a'],**args),profile_section(profile['b'],**args),profile['f']
        return AirfoilSection(*(getattr(a,k)*(1-f)+getattr(b,k)*f for k in a.__dataclass_fields__))
    if profile['kind'] == 'naca4':
        return naca4_section(profile['code'], chord_mm=chord_mm, trailing_edge_mm=trailing_edge_mm, point_count=point_count)
    x = cosine_spacing(point_count)
    if profile['kind'] == 'naca5':
        yc, slope = naca5_camber(profile['code'], x)
        t = int(profile['code'][-2:])/100
        yt = 5*t*(.2969*np.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1015*x**4)
        yt += (trailing_edge_mm/(2*chord_mm) - 5*t*(.2969-.126-.3516+.2843-.1015))*x**4
        theta = np.arctan(slope)
        xu, xl = x-yt*np.sin(theta), x+yt*np.sin(theta)
        zu, zl = yc+yt*np.cos(theta), yc-yt*np.cos(theta)
    else:
        up, lo = np.asarray(profile['upper']), np.asarray(profile['lower'])
        zu, zl = np.interp(x, up[:, 0], up[:, 1]), np.interp(x, lo[:, 0], lo[:, 1])
        correction = (trailing_edge_mm/chord_mm-(zu[-1]-zl[-1]))/2*x**4
        zu, zl = zu+correction, zl-correction
        xu = xl = x
        yc = (zu+zl)/2
    return AirfoilSection(xu*chord_mm, zu*chord_mm, xl*chord_mm, zl*chord_mm, x*chord_mm, yc*chord_mm)


def profile_ordinates(profile, x, chord, te=None):
    if profile['kind'] == 'blend':
        a,b,f = profile_ordinates(profile['a'],x,chord,te),profile_ordinates(profile['b'],x,chord,te),profile['f']
        return tuple(u*(1-f)+v*f for u,v in zip(a,b))
    x = np.asarray(x, dtype=float)
    if profile['kind'] == 'coordinates':
        up, lo = np.asarray(profile['upper']), np.asarray(profile['lower'])
        u, l = np.interp(x, up[:,0], up[:,1]), np.interp(x, lo[:,0], lo[:,1])
        d = 0 if te is None else (te/chord-(up[-1,1]-lo[-1,1]))/2
        return (l-d*x**4)*chord, (l+u)/2*chord, (u+d*x**4)*chord
    if profile['kind'] == 'naca4':
        yc, slope = camber_line(profile['code'], x)
    else:
        yc, slope = naca5_camber(profile['code'], x)
    t = int(profile['code'][-2:])/100
    yt = 5*t*(.2969*np.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1015*x**4)
    if te is not None:
        yt += (te/(2*chord)-5*t*(.2969-.126-.3516+.2843-.1015))*x**4
    vh = yt*np.cos(np.arctan(slope))
    return (yc-vh)*chord, yc*chord, (yc+vh)*chord


def station_bracket(p, y):
    profile = p.airfoil_profile or {'kind': 'naca4', 'code': p.naca}
    stations = p.airfoil_stations or ({'eta': 0, 'airfoil': profile, 'incidenceDeg': 0}, {'eta': 1, 'airfoil': profile, 'incidenceDeg': 0})
    eta = min(1, max(0, y/p.semi_span_mm))
    for a, b in zip(stations[:-1], stations[1:]):
        if eta <= b['eta']:
            return a, b, (eta-a['eta'])/(b['eta']-a['eta'])
    return stations[-2], stations[-1], 1


def section_at(p, y, point_count=None):
    if not p.airfoil_stations and p.airfoil_profile is None:
        return naca4_section(p.naca, chord_mm=p.chord_at(y), trailing_edge_mm=p.trailing_edge_mm, point_count=point_count or p.airfoil_point_count)
    return profile_section(profile_at(p,y), chord_mm=p.chord_at(y), trailing_edge_mm=p.trailing_edge_mm, point_count=point_count or p.airfoil_point_count)


def profile_at(p, y):
    a, b, t = station_bracket(p, y)
    if t == 0 or a['airfoil'] == b['airfoil']:
        return a['airfoil']
    if t == 1:
        return b['airfoil']
    return {'kind':'blend','a':a['airfoil'],'b':b['airfoil'],'f':t}


def surface_at(p, y, x_over_c):
    # Preserve the original analytical cap/web convention for legacy NACA4 studies.
    if not p.airfoil_stations and p.airfoil_profile is None:
        from .airfoil import surface_ordinates_at
        return surface_ordinates_at(p.naca, x_over_c, chord_mm=p.chord_at(y), trailing_edge_mm=p.trailing_edge_mm)
    return profile_ordinates(profile_at(p,y), x_over_c, p.chord_at(y), p.trailing_edge_mm)


def incidence_at(p, y):
    a, b, t = station_bracket(p, y)
    return ((1-t)*a['incidenceDeg']+t*b['incidenceDeg']) if p.twist_enabled else 0


def transform_point(p, y, x, z):
    angle = math.radians(incidence_at(p, y))
    pivot = p.twist_reference_fraction*p.chord_at(y)
    offset = y*math.tan(math.radians(p.sweep_deg))+p.sweep_reference_fraction*(p.root_chord_mm-p.chord_at(y))
    return (offset+pivot+math.cos(angle)*(x-pivot)+math.sin(angle)*z, y,
            y*math.tan(math.radians(p.dihedral_deg))-math.sin(angle)*(x-pivot)+math.cos(angle)*z)


def loft_stations(p, start, end):
    if not p.airfoil_stations and p.airfoil_profile is None and p.sweep_deg == 0 and p.dihedral_deg == 0 and p.sweep_reference_fraction == 0:
        return np.linspace(start, end, p.loft_station_count)
    points = list(np.linspace(start, end, max(9, p.loft_station_count)))
    points += [s['eta']*p.semi_span_mm for s in p.airfoil_stations if start < s['eta']*p.semi_span_mm < end]
    # Resolve large incidence changes without rounding or moving user stations.
    # The usual small teaching-wing twists retain the nine-station baseline.
    if p.twist_enabled:
        for a,b in zip(p.airfoil_stations[:-1],p.airfoil_stations[1:]):
            count=max(1,math.ceil(abs(b['incidenceDeg']-a['incidenceDeg'])/2))
            points += [float(y) for y in np.linspace(a['eta']*p.semi_span_mm,b['eta']*p.semi_span_mm,count+1) if start<y<end]
    return np.asarray(sorted(set(points)))


def airfoil_label(p):
    if not p.airfoil_stations and p.airfoil_profile is None:
        return f'NACA {p.naca}'
    def name(s):
        a = s['airfoil']
        return 'NACA '+a['code'] if a['kind'] != 'coordinates' else a.get('name', 'DAT profile')
    return ' → '.join(name(s) for s in p.airfoil_stations) if p.airfoil_stations else name({'airfoil': p.airfoil_profile})
