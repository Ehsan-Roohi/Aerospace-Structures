"""Post-buckling strength of the wing box by section analysis (the stressed-skin method of the period).

At each span station the box section is cut into booms, stringers, skin panels and web strips. For a
given curvature the strain is linear through the section (plane sections) and each part follows its
own law:
  booms      elastic - perfectly plastic at Fcy in compression; bilinear to Ftu in tension (rupture at 10 %)
  stringers  elastic, capped at their crippling stress in compression (blade: 1.3 x local buckling stress)
  skin       elastic in tension (capped at Fty); in compression elastic up to the panel buckling stress,
             then von Karman effective width  w_e = 1.9 t sqrt(E / sigma_edge)  next to each stiffener
  webs       elastic - perfectly plastic
The neutral axis is found from zero axial force; the moment-curvature curve gives the first-yield and
the maximum (collapse) moment.  Divided by the net bending moment per g at that station (from the FE
model's own mass + the non-structural masses), this gives the load factor at which the wing yields
and collapses.

    python3 collapse.py r3
"""
import json, math, os, sys
import numpy as np
from common import INPUTS, WING, ZONES, RIB_Y, chord, section_pts, zone_of, ROOT

V = lambda k: INPUTS[k]["value"]
LOADS = json.load(open(os.path.join(ROOT, "data", "loads.json")))
E, nu, Fty, Ftu = V("E"), V("nu"), V("Fty"), V("Ftu")
Fcy = Fty                     # compressive yield taken equal to tensile yield (2017-T4)
EPS_U = 0.10                  # elongation at rupture (2017-T4: 10-20 %)
D_PLATE = math.pi ** 2 * E / (12 * (1 - nu ** 2))

def section(y, scales=None):
    s = {**dict(flange=1.0, skin=1.0, web=1.0, stringer=1.0), **(scales or {})}
    z = LOADS["zones"][zone_of(y)]
    xs, xf = V("spar_x_c"), V("false_spar_x_c"); st = V("stringer")
    c = chord(y); bw = V("flange_root_width") / chord(0.0) * c
    tf = z["flange_thickness"] * s["flange"]; tsk = z["skin"] * s["skin"]
    d_f = tsk + 0.5 * tf
    parts = []          # dict(kind, A, z, b, t)
    up, lo, _ = section_pts(y, [xs])
    parts.append(dict(kind="boom", A=bw * tf, z=up[0][1] - d_f, side="u"))
    parts.append(dict(kind="boom", A=bw * tf, z=lo[0][1] + d_f, side="l"))
    ts = z["stringer_t"] * s["stringer"]
    sig_loc = 0.43 * D_PLATE * (ts / st["h"]) ** 2
    for xc in st["x_c"]:
        up, lo, _ = section_pts(y, [xc])
        parts.append(dict(kind="stringer", A=st["h"] * ts, z=up[0][1] - st["h"] / 2, side="u", scc=min(Fcy, 1.3 * sig_loc)))
        parts.append(dict(kind="stringer", A=st["h"] * ts, z=lo[0][1] + st["h"] / 2, side="l", scc=min(Fcy, 1.3 * sig_loc)))
    # skin panels: nose (curved, fully effective), flat LE panel, box panels between stiffeners
    b_frac = bw / c / 2
    edges = [0.0, 0.10, xs - b_frac, xs + b_frac] + list(st["x_c"]) + [xf]
    kinds = ["nose", "panel", "under_boom"] + ["panel"] * (len(st["x_c"]) + 1)
    for (a, b), k in zip(zip(edges[:-1], edges[1:]), kinds):
        xx = np.linspace(a, b, 12)
        up, lo, _ = section_pts(y, xx)
        for P, side in ((up, "u"), (lo, "l")):
            L = float(np.sum(np.linalg.norm(np.diff(P, axis=0), axis=1)))
            if side == "l" and k != "under_boom" and b <= xs and y < 0.67:
                ww = V("wheel_well")
                if abs(y - ww["y_c"]) < ww["r"]: continue            # wheel well: no lower LE skin
            # panel buckling stress: flat plate (simply supported; wide-column form when the rib pitch is the
            # short side) plus the curvature term 0.3 E t / R of a curved panel (knocked-down classical value)
            ry = np.array([0.0] + RIB_Y); kk = np.searchsorted(ry, y); a = ry[min(kk, len(ry) - 1)] - ry[max(kk - 1, 0)]
            flat = 4.0 * D_PLATE * (tsk / L) ** 2 if a >= L else D_PLATE * (tsk / a) ** 2 * (1 + (a / L) ** 2) ** 2
            p0, p1, p2 = P[0], P[len(P) // 2], P[-1]
            area2 = abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]))
            # Circumradius abc/(4A); area2 is twice the triangle area.
            R = (np.linalg.norm(p1 - p0) * np.linalg.norm(p2 - p1) * np.linalg.norm(p2 - p0) / (2 * area2)) if area2 > 1e-12 else 1e9
            parts.append(dict(kind="skin_" + k, A=L * tsk, z=float(P[:, 1].mean()), side=side, b=L, t=tsk,
                              scr=flat + 0.3 * E * tsk / R, R=R, a=a))
    # webs
    for xc, t in ((xs, z["web"] * s["web"]), (xf, z["false_spar"] * s["web"])):
        up, lo, _ = section_pts(y, [xc]); h = up[0][1] - lo[0][1]
        for zz in np.linspace(lo[0][1], up[0][1], 21)[:-1] + h / 40:
            parts.append(dict(kind="web", A=h / 20 * t, z=float(zz), side="w"))
    return parts

def stress(p, eps):
    """Average stress of a part for strain eps (tension +)."""
    k = p["kind"]; s = E * eps
    if k == "boom":
        if eps >= 0:
            if eps > EPS_U: return np.nan
            ey = Fty / E
            return s if eps <= ey else Fty + (Ftu - Fty) * (eps - ey) / (EPS_U - ey)
        return max(s, -Fcy)
    if k == "stringer":
        return min(s, Fty) if eps >= 0 else max(s, -p["scc"])
    if k == "web":
        return float(np.clip(s, -Fty, Fty))
    # skin
    if eps >= 0: return min(s, Fty)
    if k in ("skin_nose", "skin_under_boom"): return max(s, -Fcy)
    se = min(-s, Fcy)
    if se <= p["scr"]: return -se
    be = min(p["b"], 1.9 * p["t"] * math.sqrt(E / se))
    return -(se * be + p["scr"] * (p["b"] - be)) / p["b"]

KIND = {"boom": 0, "stringer": 1, "web": 2, "skin_nose": 3, "skin_under_boom": 3, "skin_panel": 4}

def arrays(parts):
    k = np.array([KIND[p["kind"]] for p in parts]); z = np.array([p["z"] for p in parts]); A = np.array([p["A"] for p in parts])
    scc = np.array([p.get("scc", Fcy) for p in parts]); scr = np.array([p.get("scr", 0.0) for p in parts])
    b = np.array([p.get("b", 1.0) for p in parts]); t = np.array([p.get("t", 1.0) for p in parts])
    return k, z, A, scc, scr, b, t

def stress_vec(arr, eps):
    """Vectorised version of stress() for all parts at once."""
    k, z, A, scc, scr, b, t = arr
    s = E * eps; out = np.empty_like(s)
    ey = Fty / E
    m = k == 0      # boom
    ten = np.where(eps <= ey, s, Fty + (Ftu - Fty) * (eps - ey) / (EPS_U - ey))
    out[m] = np.where(eps[m] >= 0, np.where(eps[m] > EPS_U, np.nan, ten[m]), np.maximum(s[m], -Fcy))
    m = k == 1      # stringer
    out[m] = np.where(eps[m] >= 0, np.minimum(s[m], Fty), np.maximum(s[m], -scc[m]))
    m = k == 2      # web
    out[m] = np.clip(s[m], -Fty, Fty)
    m = k == 3      # curved / boom-backed skin: no buckling
    out[m] = np.where(eps[m] >= 0, np.minimum(s[m], Fty), np.maximum(s[m], -Fcy))
    m = k == 4      # flat-ish skin panel: effective width after buckling
    se = np.minimum(-s[m], Fcy)
    be = np.minimum(b[m], 1.9 * t[m] * np.sqrt(E / np.maximum(se, 1.0)))
    post = -(se * be + scr[m] * (b[m] - be)) / b[m]
    comp = np.where(se <= scr[m], -se, post)
    out[m] = np.where(eps[m] >= 0, np.minimum(s[m], Fty), comp)
    return out

def moment(arr, kappa):
    k, z, A = arr[0], arr[1], arr[2]
    def N(z0): return np.sum(stress_vec(arr, -kappa * (z - z0)) * A)
    lo, hi = z.min(), z.max(); flo, fhi = N(lo), N(hi)
    if np.isnan(flo) or np.isnan(fhi) or flo * fhi > 0: return np.nan, np.nan, None
    for _ in range(55):
        mid = 0.5 * (lo + hi); fm = N(mid)
        if np.isnan(fm): return np.nan, np.nan, None
        if fm * flo > 0: lo, flo = mid, fm
        else: hi = mid
    z0 = 0.5 * (lo + hi)
    sig = stress_vec(arr, -kappa * (z - z0))
    if np.isnan(sig).any(): return np.nan, np.nan, None
    return float(-np.sum(sig * A * (z - z0))), z0, sig

def capacity(y, sign=+1, scales=None):
    parts = section(y, scales)
    if sign < 0:
        for p in parts: p["z"] = -p["z"]
    arr = arrays(parts); k, z, A, scc, scr, b, t = arr
    out = dict(first_skin_buckle=None, first_stringer_cripple=None, first_boom_yield=None, M_max=0.0, kappa_at_max=None)
    curve = []
    for kappa in np.concatenate([np.linspace(1e-5, 0.02, 400), np.linspace(0.02, 0.2, 200)[1:]]):
        M, z0, sig = moment(arr, kappa)
        if sig is None or np.isnan(M): break
        curve.append((kappa, M)); eps = -kappa * (z - z0)
        if out["first_skin_buckle"] is None and np.any((k == 4) & (eps < 0) & (-E * eps > scr)): out["first_skin_buckle"] = M
        if out["first_stringer_cripple"] is None and np.any((k == 1) & (eps < 0) & (-E * eps >= scc)): out["first_stringer_cripple"] = M
        if out["first_boom_yield"] is None and np.any((k == 0) & (np.abs(E * eps) >= Fty)): out["first_boom_yield"] = M
        if M > out["M_max"]: out["M_max"] = M; out["kappa_at_max"] = kappa
        elif len(curve) > 5 and M < 0.97 * out["M_max"]: break
    out["curve"] = curve[::10]
    return out

def run(tag, scales=None):
    bc = json.load(open(os.path.join(ROOT, "fe", tag, "beam_check.json")))
    yb = np.array(bc["diagrams"]["y"]); Mb = np.array(bc["diagrams"]["M"])
    res = []
    for y in [0.47, 0.6, 0.72, 0.9, 1.2, 1.52, 1.8, 2.1, 2.35, 2.7, 3.0, 3.3, 3.6, 3.9, 4.25, 4.5]:
        M1 = float(np.interp(y, yb, Mb))
        row = dict(y=y, M_per_g=M1)
        for sign, nm in ((1, "pos"), (-1, "neg")):
            c = capacity(y, sign, scales)
            f = lambda m: None if m is None else m / M1
            row[nm] = dict(n_skin_buckle=f(c["first_skin_buckle"]), n_stringer_cripple=f(c["first_stringer_cripple"]),
                           n_boom_yield=f(c["first_boom_yield"]), n_collapse=f(c["M_max"]), M_max=c["M_max"],
                           curve=c["curve"])
        res.append(row)
    def crit(key, side):
        vals = [(r[side][key], r["y"]) for r in res if r[side][key] is not None]
        return min(vals) if vals else (None, None)
    summ = {side: {k: crit(k, side) for k in ("n_skin_buckle", "n_stringer_cripple", "n_boom_yield", "n_collapse")} for side in ("pos", "neg")}
    out = dict(tag=tag, scales=scales or {}, stations=res, summary=summ)
    name = "collapse.json" if not scales else "collapse_" + "_".join(f"{k}{v}" for k, v in scales.items()) + ".json"
    json.dump(out, open(os.path.join(ROOT, "fe", tag, name), "w"), indent=1)
    return out

if __name__ == "__main__":
    tag = sys.argv[1] if len(sys.argv) > 1 else "r3"
    o = run(tag)
    for r in o["stations"]:
        p, n = r["pos"], r["neg"]
        fm = lambda v: "  -  " if v is None else "%5.1f" % v
        print("y=%.2f M/g=%6.0f | +g: skin %s str %s boom-yield %s collapse %s | -g: skin %s str %s boom-yield %s collapse %s" % (
            r["y"], r["M_per_g"], fm(p["n_skin_buckle"]), fm(p["n_stringer_cripple"]), fm(p["n_boom_yield"]), fm(p["n_collapse"]),
            fm(n["n_skin_buckle"]), fm(n["n_stringer_cripple"]), fm(n["n_boom_yield"]), fm(n["n_collapse"])))
    print(json.dumps(o["summary"], indent=1))
