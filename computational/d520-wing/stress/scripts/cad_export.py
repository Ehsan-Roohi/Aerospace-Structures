"""CAD export of the D.520 for SolidWorks / ANSYS (STEP AP214, millimetres).

1. Outer-mould-line solids built as bicubic B-spline surfaces interpolating the same section points
   as the Blender model (exact at every section point), closed with planar caps and sewn into solids:
   fuselage with canopy, wing with flaps and ailerons as separate bodies, tailplane + elevators,
   fin + rudder, spinner, radiator bath           -> cad/D520_airframe_OML.step (+ a STEP per part, STL)
2. Wing-structure mid-surfaces matching the shell FE model (skins, spar web, booms, false spar,
   stringers, ribs), one body per gauge zone, thickness in the body name
                                                  -> cad/D520_wing_structure_surfaces.step
Axes: X aft from the spinner tip, Y starboard, Z up from the thrust axis.

    python3 cad_export.py
"""
import json, math, os
import numpy as np
import cadquery as cq
from OCP.gp import gp_Pnt, gp_Pln, gp_Dir
from OCP.TColgp import TColgp_HArray1OfPnt, TColgp_Array2OfPnt
from OCP.GeomAPI import GeomAPI_Interpolate, GeomAPI_PointsToBSplineSurface
from OCP.BRepBuilderAPI import (BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace,
                                BRepBuilderAPI_Sewing, BRepBuilderAPI_MakeSolid, BRepBuilderAPI_MakeVertex)
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut, BRepAlgoAPI_Common
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepFill import BRepFill
from OCP.BRepLib import BRepLib
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.ShapeFix import ShapeFix_Solid
from OCP.ShapeUpgrade import ShapeUpgrade_UnifySameDomain
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SHELL
from OCP.TopoDS import TopoDS
from common import INPUTS, WING, FUS, G, RIB_Y, ZONES, KINK_RIBS, chord, section_pts, ROOT

V = lambda k: INPUTS[k]["value"]
MM = 1000.0
OUT = os.path.join(ROOT, "cad")
os.makedirs(OUT, exist_ok=True)

def P(x, y, z): return gp_Pnt(float(x) * MM, float(y) * MM, float(z) * MM)
def valid(s): return BRepCheck_Analyzer(s).IsValid()

def bool_clean(s):
    """Boolean-readiness check (self-intersections, curves off their surfaces), as SolidWorks/ANSYS import checks do."""
    from OCP.BOPAlgo import BOPAlgo_ArgumentAnalyzer
    aa = BOPAlgo_ArgumentAnalyzer(); aa.SetShape1(s)
    for m in ("SelfInterMode", "SmallEdgeMode", "CurveOnSurfaceMode"): setattr(aa, m, True)
    aa.Perform(); return [str(r.GetCheckStatus()).split("_")[-1] for r in aa.GetCheckResult()]

def bspline_edge(pts, periodic=False):
    arr = TColgp_HArray1OfPnt(1, len(pts))
    for i, p in enumerate(pts, 1): arr.SetValue(i, P(*p))
    it = GeomAPI_Interpolate(arr, periodic, 1e-6); it.Perform()
    return BRepBuilderAPI_MakeEdge(it.Curve()).Edge()

def line_edge(a, b): return BRepBuilderAPI_MakeEdge(P(*a), P(*b)).Edge()

def wire(edges):
    mk = BRepBuilderAPI_MakeWire()
    for e in edges: mk.Add(e)
    return mk.Wire()

def grid_surface(grid, periodic=False):
    nv, nu = len(grid), len(grid[0])
    arr = TColgp_Array2OfPnt(1, nu, 1, nv)
    for j in range(nv):
        for i in range(nu): arr.SetValue(i + 1, j + 1, P(*grid[j][i]))
    api = GeomAPI_PointsToBSplineSurface(); api.Interpolate(arr, periodic)
    return api.Surface()

from scipy.interpolate import make_interp_spline
from OCP.Geom import Geom_BSplineSurface
from OCP.TColStd import TColStd_Array1OfReal, TColStd_Array1OfInteger

def _knots(t):
    u, m = np.unique(np.round(t, 12), return_counts=True)
    K = TColStd_Array1OfReal(1, len(u)); M = TColStd_Array1OfInteger(1, len(u))
    for i, (a, b) in enumerate(zip(u, m), 1): K.SetValue(i, float(a)); M.SetValue(i, int(b))
    return K, M

def _params(rows):
    """chord-length parameters averaged over all rows (same parameters for every row)."""
    D = np.array(rows, float)
    d = np.linalg.norm(np.diff(D, axis=1), axis=2).mean(axis=0)
    s = np.concatenate([[0], np.cumsum(d)]); return s / s[-1]

def tensor_surface(grid):
    """Exact tensor-product cubic B-spline interpolation of grid[j][i] (j: v, i: u). Unlike the OCC
    interpolator, every boundary iso-curve interpolates its own row only, so section caps are exactly planar."""
    D = np.array(grid, float) * MM
    up = _params(D); vp = _params(np.transpose(D, (1, 0, 2)))
    ku, kv = min(3, D.shape[1] - 1), min(3, D.shape[0] - 1)
    su = [make_interp_spline(up, D[j], k=ku) for j in range(D.shape[0])]
    R = np.array([q.c for q in su])
    sv = make_interp_spline(vp, R, k=kv, axis=0); Q = sv.c
    nv, nu = Q.shape[:2]
    poles = TColgp_Array2OfPnt(1, nu, 1, nv)
    for i in range(nu):
        for j in range(nv): poles.SetValue(i + 1, j + 1, gp_Pnt(*map(float, Q[j, i])))
    Ku, Mu = _knots(su[0].t); Kv, Mv = _knots(sv.t)
    return Geom_BSplineSurface(poles, Ku, Kv, Mu, Mv, ku, kv)

def grid_face(grid):
    return BRepBuilderAPI_MakeFace(tensor_surface(grid), 1e-6).Face()

def grid_solid(grid, cap_normal, periodic=False):
    """Solid from sections grid[j][i] (j: stations, i: points around the section).
    Open sections run upper TE -> LE -> lower TE and are closed by a ruled TE face."""
    if periodic == "closed":          # closed ring, exact tensor interpolation with a C0 seam
        srf = tensor_surface([list(r) + [r[0]] for r in grid])
    else:
        srf = grid_surface(grid, True) if periodic else tensor_surface(grid)
    u0, u1, v0, v1 = srf.Bounds()
    faces = [BRepBuilderAPI_MakeFace(srf, 1e-6).Face()]
    ME = BRepBuilderAPI_MakeEdge
    if not periodic:
        faces.append(BRepFill.Face_s(ME(srf.UIso(u0)).Edge(), ME(srf.UIso(u1)).Edge()))
    for v in (v0, v1):
        ev = ME(srf.VIso(v)).Edge()
        if periodic: w = BRepBuilderAPI_MakeWire(ev).Wire()
        else: w = BRepBuilderAPI_MakeWire(ev, ME(srf.Value(u1, v), srf.Value(u0, v)).Edge()).Wire()
        faces.append(BRepBuilderAPI_MakeFace(gp_Pln(srf.Value(u0, v), gp_Dir(*cap_normal)), w).Face())
    sew = BRepBuilderAPI_Sewing(0.01)
    for f in faces: sew.Add(f)
    sew.Perform()
    if sew.NbFreeEdges(): raise RuntimeError(f"open shell: {sew.NbFreeEdges()} free edges")
    shell = TopoDS.Shell_s(TopExp_Explorer(sew.SewedShape(), TopAbs_SHELL).Current())
    so = BRepBuilderAPI_MakeSolid(shell).Solid()
    BRepLib.OrientClosedSolid_s(so)
    fx = ShapeFix_Solid(so); fx.Perform()
    return fx.Solid()

def fuse(shapes):
    s = shapes[0]
    for t in shapes[1:]:
        f = BRepAlgoAPI_Fuse(s, t); f.Build(); s = f.Shape()
    u = ShapeUpgrade_UnifySameDomain(s, True, True, False); u.Build()
    return u.Shape()
def cut(a, b):
    c = BRepAlgoAPI_Cut(a, b); c.Build(); return c.Shape()
def common(a, b):
    c = BRepAlgoAPI_Common(a, b); c.Build(); return c.Shape()

def box_prism(poly_xy, z0, z1):
    pts = [(x * MM, y * MM) for x, y in poly_xy]
    return cq.Workplane("XY").workplane(offset=z0 * MM).polyline(pts).close().extrude((z1 - z0) * MM).val().wrapped

# ------------------------------------------------------------------ parts
def fuselage():
    st = FUS.stations()
    keep = np.unique(np.concatenate([st[::2], [st[0], st[-1]]]))
    grid = []
    for S in keep:
        Y, Z, _ = FUS.section(S, n_half=28, with_cap=True)
        grid.append([(S, a, b) for a, b in zip(Y, Z)])
    return grid_solid(grid, (1, 0, 0), periodic=True)

def wing_grid():
    yt = WING.yt; b2 = WING.b2
    tip = yt + (b2 - 0.003 - yt) * (1 - (1 - np.linspace(0, 1, 18)[1:]) ** 1.5)
    half = np.unique(np.round(np.concatenate([np.linspace(0, 0.66, 6), np.linspace(0.66, 0.74, 5), np.linspace(0.74, 1.46, 9),
                                              np.linspace(1.46, 1.54, 5), np.linspace(1.54, yt, 20), tip]), 5))
    ys = np.concatenate([-half[::-1], half[1:]])
    x = G.cosine_x(41); grid = []
    for y in ys:
        up, lo, c = section_pts(abs(y), x)
        up = up.copy(); lo = lo.copy(); up[:, 1] += 0.0005 * x; lo[:, 1] -= 0.0005 * x   # 1 mm blunt TE
        grid.append([(s, y, z) for s, z in up[::-1]] + [(s, y, z) for s, z in lo[1:]])
    return grid

def control_surface_tools():
    gv = G.v; tools = {}
    def strip(y0, y1, frac, side):
        a = (WING.S_LE(y0) + frac * chord(y0), side * y0); b = (WING.S_LE(y1) + frac * chord(y1), side * y1)
        pts = [a, b, (b[0] + 0.6, b[1]), (a[0] + 0.6, a[1])]
        if side < 0: pts = pts[::-1]
        return box_prism(pts, -2.0, 1.0)
    fy0 = gv("flap_centre_y") - gv("flap_span") / 2; fy1 = fy0 + gv("flap_span")
    ay0 = gv("aileron_centre_y") - gv("aileron_span") / 2; ay1 = ay0 + gv("aileron_span")
    for side, tag in ((1, "R"), (-1, "L")):
        tools[f"Flap_{tag}"] = strip(fy0, fy1, 1 - gv("flap_chord_fraction"), side)
        tools[f"Aileron_{tag}"] = strip(ay0, ay1, 1 - gv("aileron_chord_fraction"), side)
    return tools

T = G.Tail()
def tail_grid():
    ytip = T.tp_y.max()
    half = np.concatenate([np.linspace(0, ytip * 0.93, 20), ytip * np.array([0.955, 0.975, 0.99, 0.995])])
    ys = np.concatenate([-half[::-1], half[1:]])
    x = G.cosine_x(31); grid = []
    for y in ys:
        le, te = T.tailplane_chord(min(abs(y), ytip))
        if te - le < 0.04: m = 0.5 * (le + te); le, te = m - 0.02, m + 0.02
        c = te - le; t = G.naca_thickness(x, 0.12) * c + 0.0005 * x
        grid.append([(le + xx * c, y, T.tp_Z + tt) for xx, tt in zip(x[::-1], t[::-1])] +
                    [(le + xx * c, y, T.tp_Z - tt) for xx, tt in zip(x[1:], t[1:])])
    return grid

def fin_grid():
    fin_S, fin_Z = T.fin_top_S, T.fin_top_Z
    k = int(np.argmax(fin_Z)); S_top, Z_top = fin_S[k], fin_Z[k]
    fwd = np.array(sorted([(s, z) for s, z in zip(fin_S, fin_Z) if s < S_top], key=lambda p: p[1]))
    aft = np.array(sorted([(s, z) for s, z in zip(fin_S, fin_Z) if s >= S_top], key=lambda p: p[1]))
    rb = np.array(sorted(zip(T.rud_bot_S, T.rud_bot_Z), key=lambda p: p[0]))
    Zmin = float(rb[:, 1].min()) + 0.005
    def le_of(z):
        zz, ss = fwd[:, 1], fwd[:, 0]
        if z >= zz.min(): return float(np.interp(z, zz, ss))
        sl = np.polyfit(zz[:8], ss[:8], 1); return float(np.polyval(sl, z))
    def te_of(z):
        if z >= aft[:, 1].min(): return float(np.interp(z, aft[:, 1], aft[:, 0]))
        cand = rb[rb[:, 1] <= z + 1e-6]
        return float(cand[:, 0].max()) if len(cand) else T.rudder_hinge_S + 0.05
    x = G.cosine_x(31); grid = []
    for z in np.concatenate([np.linspace(Zmin, Z_top - 0.25, 22), np.linspace(Z_top - 0.25, Z_top - 0.03, 8)[1:]]):
        le, te = le_of(z), te_of(z)
        if te - le < 0.08: continue
        tc = 0.12 * min(1.0, 0.35 + 0.65 * (Z_top - z) / 0.25) if z > Z_top - 0.25 else 0.12
        c = te - le; t = G.naca_thickness(x, tc) * c + 0.0005 * x
        grid.append([(le + xx * c, tt, z) for xx, tt in zip(x[::-1], t[::-1])] + [(le + xx * c, -tt, z) for xx, tt in zip(x[1:], t[1:])])
    return grid, Zmin, Z_top

def spinner():
    sp = G.v("spinner"); L = sp["length"]; R = sp["base_diameter"] / 2
    s = np.linspace(0, 1, 24); r = R * np.sin(0.5 * math.pi * s) ** 0.85
    pts = [(L * a * MM, rr * MM) for a, rr in zip(s, r)]
    wp = cq.Workplane("XZ").moveTo(0, 0).spline(pts[1:], includeCurrent=True).lineTo(L * MM, 0).close()
    return wp.revolve(360, (0, 0, 0), (1, 0, 0)).val().wrapped

def radiator():
    rd = G.v("radiator")
    rb = np.array([G.side_px_to_SZ(p[0], p[1]) for p in G.SIDE["radiator_bottom"]]); rb = rb[np.argsort(rb[:, 0])]
    Ss = np.linspace(rd["S_front"] + 0.01, rd["S_rear"] - 0.01, 14); grid = []
    for S in Ss:
        zb = float(np.interp(S, rb[:, 0], rb[:, 1])); ztop = -0.78
        hw = rd["width"] / 2 * (0.82 + 0.18 * math.sin(math.pi * (S - Ss[0]) / (Ss[-1] - Ss[0])))
        th = np.linspace(0, 2 * math.pi, 32, endpoint=False)
        cz, az = 0.5 * (zb + ztop), 0.5 * (ztop - zb)
        yy = hw * np.sign(np.cos(th)) * np.abs(np.cos(th)) ** (2 / 3); zz = cz + az * np.sign(np.sin(th)) * np.abs(np.sin(th)) ** (2 / 3)
        grid.append([(S, a, b) for a, b in zip(yy, zz)])
    from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
    ts = BRepOffsetAPI_ThruSections(True, True, 1e-6)          # ruled loft through the rings (cosmetic part)
    for r in grid: ts.AddWire(wire([bspline_edge(r, periodic=True)]))
    ts.Build(); return ts.Shape()

# ------------------------------------------------------------------ structural surfaces (FE layout)
def structure_surfaces():
    xs, xf = V("spar_x_c"), V("false_spar_x_c")
    zones = json.load(open(os.path.join(ROOT, "data", "loads.json")))["zones"]
    out = {}
    def add(name, shp): out.setdefault(name, []).append(shp)
    def chordline(x0, x1, n=25):
        if x0 == 0: return x1 * (1 - np.cos(0.5 * math.pi * np.linspace(0, 1, n)))
        return np.linspace(x0, x1, n)
    ww = V("wheel_well")
    S_c = WING.S_LE(ww["y_c"]) + ww["x_c"] * chord(ww["y_c"])
    well = cq.Workplane("XY").workplane(offset=-2 * MM).center(S_c * MM, ww["y_c"] * MM).circle(ww["r"] * MM).extrude(2.5 * MM).val().wrapped
    ranges = []
    for k, (y0, y1) in enumerate(ZONES):     # zone 0 is split at the fuselage fittings so the support line is an edge
        if y0 < V("fitting_y") < y1: ranges += [(k, y0, V("fitting_y")), (k, V("fitting_y"), y1)]
        else: ranges.append((k, y0, y1))
    for k, y0, y1 in ranges:
        z = zones[k]
        ys = np.linspace(y0, y1, max(4, int((y1 - y0) / 0.10) + 2))
        for surf, sname in (("u", "upper"), ("l", "lower")):
            for x0, x1, reg in ((0.0, xs, "LE"), (xs, xf, "box")):
                grid = []
                for y in ys:
                    up, lo, c = section_pts(y, chordline(x0, x1))
                    a = up if surf == "u" else lo
                    grid.append([(s, y, zz) for s, zz in a])
                f = grid_face(grid)
                if surf == "l" and reg == "LE" and y0 < ww["y_c"] + ww["r"]: f = cut(f, well)
                add(f"Skin_{sname}_{reg}_Z{k}_t{z['skin'] * 1e3:.1f}mm", f)
        for xc, nm, t in ((xs, "SparWeb", z["web"]), (xf, "FalseSpar", z["false_spar"])):
            grid = []
            for y in ys:
                up, lo, c = section_pts(y, [xc]); grid.append([(up[0][0], y, up[0][1]), (lo[0][0], y, lo[0][1])])
            add(f"{nm}_Z{k}_t{t * 1e3:.1f}mm", grid_face(grid))
        for surf in ("u", "l"):
            grid = []
            for y in ys:
                up, lo, c = section_pts(y, [xs - 0.01, xs, xs + 0.01])
                src = up if surf == "u" else lo
                tv = src[2] - src[0]; tv /= np.linalg.norm(tv)
                d_f = z["skin"] + 0.5 * z["flange_thickness"]
                pc = src[1] + (d_f if surf == "l" else -d_f) * np.array([0, 1.0])
                bw = V("flange_root_width") / chord(0.0) * c
                a = pc - 0.5 * bw * tv; b = pc + 0.5 * bw * tv
                grid.append([(a[0], y, a[1]), (b[0], y, b[1])])
            add(f"Boom_{'upper' if surf == 'u' else 'lower'}_Z{k}_t{z['flange_thickness'] * 1e3:.1f}mm", grid_face(grid))
        for xc in V("stringer")["x_c"]:
            for surf in ("u", "l"):
                grid = []
                for y in ys:
                    up, lo, c = section_pts(y, [xc])
                    a, b = (up[0], lo[0]) if surf == "u" else (lo[0], up[0])
                    d = (b - a) / np.linalg.norm(b - a); h = min(V("stringer")["h"], 0.3 * np.linalg.norm(b - a))
                    e = a + h * d
                    grid.append([(a[0], y, a[1]), (e[0], y, e[1])])
                add(f"Stringer_{'upper' if surf == 'u' else 'lower'}_Z{k}_t{z['stringer_t'] * 1e3:.1f}mm", grid_face(grid))
    for rn, y in zip(range(22, 0, -1), RIB_Y):
        x0 = xs if rn == 22 else 0.0
        up, lo, c = section_pts(y, chordline(x0, xf))
        upc = [(s, y, zz) for s, zz in up]; loc = [(s, y, zz) for s, zz in lo]
        if rn == 22:
            edges = [bspline_edge(upc), line_edge(upc[-1], loc[-1]), bspline_edge(loc[::-1]), line_edge(loc[0], upc[0])]
        else:
            edges = [bspline_edge(upc), line_edge(upc[-1], loc[-1]), bspline_edge(loc[::-1])]
        f = BRepBuilderAPI_MakeFace(gp_Pln(P(*upc[0]), gp_Dir(0, 1, 0)), wire(edges)).Face()
        add(f"Rib{rn:02d}_t{(V('t_rib_kink') if rn in KINK_RIBS else V('t_rib')) * 1e3:.1f}mm", f)
    return out

# ------------------------------------------------------------------ accuracy checks
def deviation(shape, pts):
    d = np.array([BRepExtrema_DistShapeShape(BRepBuilderAPI_MakeVertex(P(*p)).Vertex(), shape).Value() for p in pts])
    return dict(max_mm=float(d.max()), rms_mm=float(np.sqrt((d ** 2).mean())), n=len(d))

def poly_area(a, b):
    x = np.concatenate([a, b[::-1]]); return 0.5 * abs(np.dot(x[:, 0], np.roll(x[:, 1], 1)) - np.dot(x[:, 1], np.roll(x[:, 0], 1)))

def checks(parts, wing_all, tp_all, vt_all):
    rep = {}
    pts = []; xs = np.array([0.0, 0.05, 0.3, 0.6, 0.9])
    for y in np.linspace(-5.0, 5.0, 57):            # stations between the CAD sections
        up, lo, c = section_pts(abs(y), xs); pts += [(s, y, z) for s, z in up] + [(s, y, z) for s, z in lo]
    rep["wing_surface_deviation"] = deviation(wing_all, pts)
    yy = np.linspace(0, WING.b2 - 0.003, 800)
    rep["wing_volume_integrated_m3"] = 2 * float(np.trapezoid([poly_area(*section_pts(y, G.cosine_x(121))[:2]) for y in yy], yy))
    rep["wing_volume_cad_m3"] = cq.Shape.cast(wing_all).Volume() / MM ** 3
    pts = []
    for S in np.linspace(0.62, 8.05, 41):
        Y, Z, _ = FUS.section(S, n_half=28, with_cap=True); pts += [(S, a, b) for a, b in zip(Y[::3], Z[::3])]
    rep["fuselage_surface_deviation"] = deviation(parts["Fuselage"], pts)
    SS = np.linspace(FUS.S_nose, FUS.S_tail, 500); A = []
    for S in SS:
        Y, Z, _ = FUS.section(S, n_half=60, with_cap=True); A.append(0.5 * abs(np.dot(Y, np.roll(Z, 1)) - np.dot(Z, np.roll(Y, 1))))
    rep["fuselage_volume_integrated_m3"] = float(np.trapezoid(A, SS))
    rep["fuselage_volume_cad_m3"] = cq.Shape.cast(parts["Fuselage"]).Volume() / MM ** 3
    ytip = T.tp_y.max(); pts = []
    for y in np.linspace(-ytip * 0.98, ytip * 0.98, 29):
        le, te = T.tailplane_chord(abs(y)); c = te - le
        for xx in (0.0, 0.3, 0.7):
            t = G.naca_thickness(np.array([xx]), 0.12)[0] * c; pts += [(le + xx * c, y, T.tp_Z + t), (le + xx * c, y, T.tp_Z - t)]
    rep["tailplane_surface_deviation"] = deviation(tp_all, pts)
    bb = cq.Shape.cast(wing_all).BoundingBox(); rep["wing_span_m"] = (bb.ymax - bb.ymin) / MM
    bb = cq.Shape.cast(tp_all).BoundingBox(); rep["tailplane_span_m"] = (bb.ymax - bb.ymin) / MM
    bbs = [cq.Shape.cast(s).BoundingBox() for s in parts.values()]
    rep["overall_length_m"] = (max(b.xmax for b in bbs) - min(b.xmin for b in bbs)) / MM
    rep["overall_span_m"] = (max(b.ymax for b in bbs) - min(b.ymin for b in bbs)) / MM
    rep["printed"] = dict(span=10.20, length=8.76, tailplane_span=3.54)
    return rep

def compound(shapes): return cq.Compound.makeCompound([cq.Shape.cast(s) for s in shapes])

def main():
    report = {}; parts = {}
    print("fuselage ..."); parts["Fuselage"] = fuselage()
    print("wing ..."); w = grid_solid(wing_grid(), (0, 1, 0))
    tools = control_surface_tools(); wing_main = w
    for nm, tl in tools.items():
        parts[nm] = common(w, tl); wing_main = cut(wing_main, tl)
    parts["Wing"] = wing_main
    print("tail ...")
    tp = grid_solid(tail_grid(), (0, 1, 0)); hinge = T.hinge_S; tp_main = tp
    for tag, s in (("R", 1), ("L", -1)):
        pts = [(hinge, s * 0.30), (hinge + 1.0, s * 0.30), (hinge + 1.0, s * 2.5), (hinge, s * 2.5)]
        tl = box_prism(pts if s > 0 else pts[::-1], -1.0, 2.0)
        parts[f"Elevator_{tag}"] = common(tp, tl); tp_main = cut(tp_main, tl)
    parts["Tailplane"] = tp_main
    fg, Zmin, Ztop = fin_grid(); vt = grid_solid(fg, (0, 0, 1))
    hingeR = T.rudder_hinge_S
    lo_box = cq.Workplane("XY").box((10 - hingeR) * MM, 1000, (T.horn_Z - Zmin + 0.5) * MM, centered=(False, True, False)).translate((hingeR * MM, 0, (Zmin - 0.5) * MM)).val().wrapped
    hi_box = cq.Workplane("XY").box((10 - T.horn_S) * MM, 1000, (Ztop - T.horn_Z + 0.5) * MM, centered=(False, True, False)).translate((T.horn_S * MM, 0, T.horn_Z * MM)).val().wrapped
    rt = fuse([lo_box, hi_box])
    parts["Rudder"] = common(vt, rt); parts["Fin"] = cut(vt, rt)
    print("spinner, radiator ...")
    parts["Spinner"] = spinner(); parts["Radiator"] = radiator()
    grey = (0.55, 0.57, 0.50)
    colors = dict(Rudder=(0.25, 0.35, 0.65), Spinner=(0.7, 0.7, 0.72), Radiator=(0.45, 0.47, 0.42))
    assy = cq.Assembly(name="D520_airframe_OML")
    for nm, s in parts.items():
        shp = cq.Shape.cast(s); bb = shp.BoundingBox()
        report[nm] = dict(valid=bool(valid(s)), faults=bool_clean(s), volume_m3=shp.Volume() / MM ** 3, area_m2=shp.Area() / MM ** 2, n_solids=len(shp.Solids()),
                          bbox_m=[round(v / MM, 4) for v in (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax)])
        assy.add(shp, name=nm, color=cq.Color(*colors.get(nm, grey)))
        cq.exporters.export(cq.Workplane().add(shp), os.path.join(OUT, f"D520_{nm}.step"))
        print(f"  {nm:12s} valid={report[nm]['valid']} faults={report[nm]['faults']} V={report[nm]['volume_m3']:.4f} m3 solids={report[nm]['n_solids']}")
    assy.save(os.path.join(OUT, "D520_airframe_OML.step"))
    cq.exporters.export(cq.Workplane().add(compound(list(parts.values()))), os.path.join(OUT, "D520_airframe_OML.stl"),
                        tolerance=0.5, angularTolerance=0.15)
    print("structure surfaces ...")
    ss = structure_surfaces()
    sa = cq.Assembly(name="D520_wing_structure_starboard")
    for nm, lst in ss.items():
        c = compound(lst); sa.add(c, name=nm)
        report["structure:" + nm] = dict(area_m2=c.Area() / MM ** 2, valid=bool(valid(c.wrapped)))
    sa.save(os.path.join(OUT, "D520_wing_structure_surfaces.step"))
    print("checks ...")
    report["_checks"] = checks(parts, w, tp, vt)
    bbs = [v["bbox_m"] for k, v in report.items() if isinstance(v, dict) and "bbox_m" in v]
    report["_checks"]["overall_length_m"] = max(b[1] for b in bbs) - min(b[0] for b in bbs)
    report["_checks"]["overall_span_m"] = max(b[3] for b in bbs) - min(b[2] for b in bbs)
    json.dump(report, open(os.path.join(OUT, "cad_report.json"), "w"), indent=1)
    print(json.dumps(report["_checks"], indent=1))
    bad = [k for k, v in report.items() if isinstance(v, dict) and (v.get("valid") is False or v.get("faults"))]
    print("invalid:", bad)

if __name__ == "__main__":
    main()
