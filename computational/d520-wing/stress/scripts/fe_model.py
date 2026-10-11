"""Shell finite-element model of the D.520 starboard half wing (CalculiX / Abaqus input format).

Structure (manual p13, Pl.1-6): single I-section main spar (booms + web) at 0.37c, channel false spar
at 0.73c, 22 pressed ribs at the Pl.1 stations, smooth duralumin skin over the leading edge and the
box, 4 blade stringers per surface in the box, wheel-well cut-out in the lower leading-edge skin at the
root.  Flaps and ailerons are not structure: their air load is put on the false spar.

Booms are shell strips lying parallel to the skin at the boom centroid depth, joined to the web
(their width follows the chord, thickness steps per gauge zone).

    python3 fe_model.py [--r 1] [--scale-flange 1.0] [--scale-skin 1.0] [--tag base]
writes fe/<tag>/wing.inp (static, 1 g) and fe/<tag>/wing_buckle_pos.inp / _neg.inp
"""
import json, math, os, argparse
import numpy as np
from common import INPUTS, WING, ZONES, RIB_Y, KINK_RIBS, chord, section_pts, zone_of, ROOT

V = lambda k: INPUTS[k]["value"]
LOADS = json.load(open(os.path.join(ROOT, "data", "loads.json")))

def chord_fractions(r, le_mult=1):
    xs, xf = V("spar_x_c"), V("false_spar_x_c")
    n_le = 8 * r * le_mult
    t = np.linspace(0, 1, n_le + 1)
    le = xs * (1 - np.cos(0.5 * math.pi * t))
    st = [xs] + list(V("stringer")["x_c"]) + [xf]
    box = [xs]
    for a, b in zip(st[:-1], st[1:]):
        box += list(np.linspace(a, b, 2 * r + 1)[1:])
    x = np.concatenate([le, box[1:]])
    i_sp = n_le
    i_str = [int(np.argmin(np.abs(x - s))) for s in V("stringer")["x_c"]]
    return x, i_sp, i_str

def span_stations(r):
    yf = V("fitting_y")
    ys = list(np.linspace(0.0, yf, 3 * r + 1)) + list(np.linspace(yf, RIB_Y[0], r + 1)[1:])
    for a, b in zip(RIB_Y[:-1], RIB_Y[1:]):
        ys += list(np.linspace(a, b, 3 * r + 1)[1:])
    ys = np.array(ys)
    rib_j = [int(np.argmin(np.abs(ys - y))) for y in RIB_Y]
    return ys, rib_j

class Mesh:
    def __init__(self):
        self.key2id = {}; self.xyz = []
        self.elems = []          # (type, [node ids], group, zone, thickness)
    def node(self, key, p):
        if key in self.key2id: return self.key2id[key]
        self.xyz.append(np.asarray(p, float)); self.key2id[key] = len(self.xyz)
        return len(self.xyz)
    def nid(self, key): return self.key2id[key]
    def add(self, nodes, group, zone, t):
        # collapse repeated nodes (rib leading-edge column) to triangles
        u = []
        for n in nodes:
            if n not in u: u.append(n)
        if len(u) < 3: return
        self.elems.append(("S4" if len(u) == 4 else "S3", u, group, zone, t))

def build(r=1, scale_flange=1.0, scale_skin=1.0, scale_web=1.0, scale_stringer=1.0, le_mult=1):
    x, i_sp, i_str = chord_fractions(r, le_mult)
    m = len(x) - 1
    ys, rib_j = span_stations(r)
    zones = LOADS["zones"]
    M = Mesh()
    b0 = V("flange_root_width") / chord(0.0)          # boom width as a chord fraction
    n_mid = 3 * r
    # geometry per station
    G = {}
    for j, y in enumerate(ys):
        up, lo, c = section_pts(y, x)
        z = zone_of(y if j == 0 else 0.5 * (ys[j] + ys[max(j - 1, 0)]))
        zs = zone_of(y)
        G[j] = (up, lo, c)
        P = lambda pSZ: (pSZ[0], y, pSZ[1])
        # skin loop: lower from false spar (k=0) to LE (k=m), upper from LE to false spar (k=2m)
        for i in range(m + 1):
            M.node(("s", j, m - i), P(lo[i]))
            M.node(("s", j, m + i), P(up[i]))
        # vertical levels between lower and upper at every chordwise index (ribs, webs)
        zz = zones[zs]
        t_f = zz["flange_thickness"] * scale_flange
        d_f = zz["skin"] * scale_skin + 0.5 * t_f
        h_sp = up[i_sp][1] - lo[i_sp][1]
        f1 = min(0.3, d_f / h_sp)
        lev = np.concatenate([[0.0, f1], np.linspace(f1, 1 - f1, n_mid + 1)[1:-1], [1 - f1, 1.0]])   # from upper (0) to lower (1)
        G[j] = (up, lo, c, lev, t_f)
        for i in range(1, m + 1):
            for v in range(1, len(lev) - 1):
                p = up[i] + lev[v] * (lo[i] - up[i])
                M.node(("v", j, i, v), P(p))
        # boom edge nodes (upper boom at level 1, lower boom at level n_v-1)
        bw = b0 * c
        for surf, v in (("u", 1), ("l", len(lev) - 2)):
            pc = up[i_sp] + lev[v] * (lo[i_sp] - up[i_sp])
            src = up if surf == "u" else lo
            tvec = src[i_sp + 1] - src[i_sp - 1]; tvec = tvec / np.linalg.norm(tvec)
            M.node(("f", j, surf, -1), P(pc - 0.5 * bw * tvec))
            M.node(("f", j, surf, +1), P(pc + 0.5 * bw * tvec))
        # stringer blade tips
        h_s = V("stringer")["h"]
        for surf in ("u", "l"):
            for i in i_str:
                a, b = (up[i], lo[i]) if surf == "u" else (lo[i], up[i])
                d = (b - a) / np.linalg.norm(b - a)
                M.node(("b", j, surf, i), P(a + min(h_s, 0.3 * np.linalg.norm(b - a)) * d))
    nv = len(G[0][3]) - 1

    def vid(j, i, v):
        """id of the vertical-line node (v=0 upper skin, v=nv lower skin)."""
        if i == 0: return M.nid(("s", j, m))
        if v == 0: return M.nid(("s", j, m + i))
        if v == nv: return M.nid(("s", j, m - i))
        return M.nid(("v", j, i, v))

    # wheel well (plan circle) on the lower leading-edge skin
    ww = V("wheel_well")
    S_c = WING.S_LE(ww["y_c"]) + ww["x_c"] * chord(ww["y_c"])
    def in_well(S, y): return (y - ww["y_c"]) ** 2 + (S - S_c) ** 2 < ww["r"] ** 2

    xyz = lambda n: M.xyz[n - 1]
    for j in range(len(ys) - 1):
        ym = 0.5 * (ys[j] + ys[j + 1]); z = zone_of(ym); zz = zones[z]
        t_sk = zz["skin"] * scale_skin
        # skin
        for k in range(2 * m):
            n = [M.nid(("s", j, k)), M.nid(("s", j, k + 1)), M.nid(("s", j + 1, k + 1)), M.nid(("s", j + 1, k))]
            lower = k < m
            ic = (m - k - 0.5) if lower else (k - m + 0.5)       # chordwise index of element centre
            region = "LE" if ic < i_sp else "box"
            if lower and region == "LE":
                cen = np.mean([xyz(q) for q in n], axis=0)
                if in_well(cen[0], cen[1]): continue
            M.add(n, ("skin_lower_" if lower else "skin_upper_") + region, z, t_sk)
        # spar web and false spar web
        for i, grp, t in ((i_sp, "spar_web", zz["web"] * scale_web), (m, "false_spar", zz["false_spar"] * scale_web)):
            for v in range(nv):
                M.add([vid(j, i, v), vid(j + 1, i, v), vid(j + 1, i, v + 1), vid(j, i, v + 1)], grp, z, t)
        # booms (upper at level 1, lower at level nv-1): two strips each, either side of the web
        t_f = G[j][4]
        for surf, v in (("u", 1), ("l", nv - 1)):
            for side in (-1, 1):
                n = [vid(j, i_sp, v), M.nid(("f", j, surf, side)), M.nid(("f", j + 1, surf, side)), vid(j + 1, i_sp, v)]
                M.add(n, "boom_" + ("upper" if surf == "u" else "lower"), z, t_f)
        # stringers
        for surf in ("u", "l"):
            for i in i_str:
                k = m + i if surf == "u" else m - i
                n = [M.nid(("s", j, k)), M.nid(("s", j + 1, k)), M.nid(("b", j + 1, surf, i)), M.nid(("b", j, surf, i))]
                M.add(n, "stringer_" + ("upper" if surf == "u" else "lower"), z, zz["stringer_t"] * scale_stringer)
    # ribs
    for rj, j in zip(range(22, 0, -1), rib_j):
        z = zone_of(ys[j])
        for i in range(m):
            for v in range(nv):
                n = [vid(j, i, v), vid(j, i + 1, v), vid(j, i + 1, v + 1), vid(j, i, v + 1)]
                if rj == 22 and i < i_sp:
                    continue        # rib 22 nose is interrupted by the wheel well (Pl.1)
                M.add(n, "rib", z, V("t_rib_kink") if rj in KINK_RIBS else V("t_rib"))
    # drop orphan nodes
    used = sorted({q for e in M.elems for q in e[1]})
    info = dict(x=x.tolist(), i_sp=i_sp, i_str=i_str, m=m, ys=ys.tolist(), rib_j=rib_j, nv=nv, used=used,
                S_well=S_c)
    return M, info

# ------------------------------------------------------------------ loads (per 1 g, upward lift)
def chord_weights(x):
    """Fraction of the flat-plate chordwise loading carried by each node's tributary interval, and the
    part aft of the false spar (control surfaces)."""
    F = lambda s: math.asin(math.sqrt(min(max(s, 0), 1))) + math.sqrt(max(s * (1 - s), 0))
    mids = np.concatenate([[0.0], 0.5 * (x[1:] + x[:-1]), [x[-1]]])
    w = np.array([F(b) - F(a) for a, b in zip(mids[:-1], mids[1:])]) / (math.pi / 2)
    aft = (math.pi / 2 - F(x[-1])) / (math.pi / 2)
    return w, aft

def span_weights(ys):
    """Consistent (hat-function) nodal share of the line load l(y); the tip cap beyond the last rib is
    lumped on the last station."""
    y = np.array(LOADS["y"]); l = np.array(LOADS["lift_per_m_1g"])
    yf = np.linspace(0, WING.b2, 20001); lf = np.interp(yf, y, l)
    out = np.zeros(len(ys))
    for j in range(len(ys)):
        a = ys[j - 1] if j > 0 else ys[0]; b = ys[j + 1] if j < len(ys) - 1 else ys[-1]
        phi = np.zeros_like(yf)
        if j > 0:
            s = (yf >= a) & (yf <= ys[j]); phi[s] = (yf[s] - a) / (ys[j] - a)
        if j < len(ys) - 1:
            s = (yf >= ys[j]) & (yf <= b); phi[s] = (b - yf[s]) / (b - ys[j])
        out[j] = np.trapezoid(lf * phi, yf)
    # tip cap (beyond the last rib): its lift is spread as a uniform line load over the last rib bay,
    # which carries the cap fairing (lumping it on the last rib alone crushes that rib locally)
    cap = yf >= ys[-1]
    Lcap = np.trapezoid(lf[cap], yf[cap])
    bay = [j for j in range(len(ys)) if ys[j] >= RIB_Y[-2] - 1e-9]
    wts = np.array([(ys[min(j + 1, len(ys) - 1)] - ys[max(j - 1, 0)]) / 2 for j in bay])
    out[bay] += Lcap * wts / wts.sum()
    return out

def nodal_loads(M, info, g_sign=1.0):
    """CLOAD list (node, dof, value) for n = g_sign x 1 g: lift up, non-structural inertia down."""
    x = np.array(info["x"]); m = info["m"]; ys = np.array(info["ys"]); i_sp = info["i_sp"]; nv = info["nv"]
    used = set(info["used"])
    w, aft = chord_weights(x)
    Lj = span_weights(ys)
    loads = {}
    def put(n, val):
        loads[n] = loads.get(n, 0.0) + val
    for j in range(len(ys)):
        for i in range(m + 1):
            nu = M.nid(("s", j, m + i)); nl = M.nid(("s", j, m - i))
            fu, fl = 2 / 3 * w[i] * Lj[j], 1 / 3 * w[i] * Lj[j]
            if i == 0:
                put(nu, w[i] * Lj[j]); continue
            put(nu, fu)
            if nl in used: put(nl, fl)
            else: put(nu, fl)
        # control-surface load to the false-spar caps (hinges)
        put(M.nid(("s", j, 2 * m)), 0.5 * aft * Lj[j]); put(M.nid(("s", j, 0)), 0.5 * aft * Lj[j])
    lift_total = sum(loads.values())
    # non-structural inertia (downward at +1 g)
    g = V("g")
    xs_le = [i for i in range(1, i_sp)]
    def station(yp): return int(np.argmin(np.abs(ys - yp)))
    inertia = 0.0
    for pm in LOADS["point_masses"]:
        F = -pm["mass"] * g
        j = station(pm["y"])
        if pm["name"] == "fuel":
            nodes = [M.nid(("s", j, m + i)) for i in xs_le] + [M.nid(("s", j, m - i)) for i in xs_le]
            nodes = [n for n in nodes if n in used]
        elif pm["name"] == "gun":
            nodes = [M.nid(("s", j, m + i_sp)), M.nid(("s", j, m - i_sp))] + [M.nid(("v", j, i_sp, v)) for v in range(1, nv)]
        else:   # ammunition box between spar and false spar (Pl.48)
            nodes = [M.nid(("s", j, m - i)) for i in range(i_sp + 1, m)]
        for n in nodes: put(n, F / len(nodes))
        inertia += F
    out = [(n, 3, g_sign * v) for n, v in sorted(loads.items()) if abs(v) > 0]
    return out, dict(lift=lift_total, nonstructural_inertia=inertia)

# ------------------------------------------------------------------ CalculiX writer
def write_inp(M, info, path, kind="static", g_sign=1.0, nmodes=10):
    used = info["used"]; ys = np.array(info["ys"]); m = info["m"]; i_sp = info["i_sp"]; nv = info["nv"]
    sets = {}
    for e_i, (typ, nodes, grp, z, t) in enumerate(M.elems, start=1):
        sets.setdefault((typ, grp, z, round(t, 7)), []).append((e_i, nodes))
    L = ["*HEADING", "D.520 starboard half wing, shell model, units N m Pa kg", "*NODE"]
    for n in used:
        p = M.xyz[n - 1]; L.append(f"{n}, {p[0]:.6f}, {p[1]:.6f}, {p[2]:.6f}")
    names = {}
    for (typ, grp, z, t), lst in sets.items():
        nm = f"{grp.upper()}_Z{z}_{typ}_T{int(round(t * 1e6))}"
        names[nm] = t
        L.append(f"*ELEMENT, TYPE={typ}, ELSET={nm}")
        for e_i, nodes in lst: L.append(f"{e_i}, " + ", ".join(str(q) for q in nodes))
    L += ["*ELSET, ELSET=EALL"] + [f"{nm}," for nm in names]
    L += ["*MATERIAL, NAME=DURAL", "*ELASTIC", f"{V('E'):.6e}, {V('nu')}", "*DENSITY", f"{V('rho')}"]
    for nm, t in names.items():
        L += [f"*SHELL SECTION, ELSET={nm}, MATERIAL=DURAL", f"{t:.6e}"]
    # sets
    sym = [n for n in used if abs(M.xyz[n - 1][1]) < 1e-9]
    jf = int(np.argmin(np.abs(ys - V("fitting_y"))))
    spar_fit = [M.nid(("s", jf, m + i_sp)), M.nid(("s", jf, m - i_sp))] + [M.nid(("v", jf, i_sp, v)) for v in range(1, nv)]
    fspar_fit = [M.nid(("s", jf, 2 * m)), M.nid(("s", jf, 0))] + [M.nid(("v", jf, m, v)) for v in range(1, nv)]
    def nset(name, lst):
        out = [f"*NSET, NSET={name}"]
        for k in range(0, len(lst), 12): out.append(", ".join(str(q) for q in lst[k:k + 12]) + ",")
        return out
    L += nset("NSYM", sym) + nset("NFIT_SPAR", spar_fit) + nset("NFIT_FSPAR", fspar_fit)
    L += nset("NSUP", spar_fit + fspar_fit)
    L += ["*BOUNDARY", "NSYM, 2, 2", "NSYM, 4, 4", "NSYM, 6, 6", "NFIT_SPAR, 1, 1", "NFIT_SPAR, 3, 3", "NFIT_FSPAR, 3, 3"]
    loads, linfo = nodal_loads(M, info, g_sign)
    L += ["*STEP"]
    if kind == "static":
        L += ["*STATIC"]
    else:
        L += [f"*BUCKLE", f"{nmodes}, 1.e-4, 30, 300"]
    L += ["*CLOAD"] + [f"{n}, {d}, {v:.6e}" for n, d, v in loads]
    L += ["*DLOAD", f"EALL, GRAV, {V('g') * g_sign:.6f}, 0., 0., -1."]
    if kind == "static":
        L += ["*NODE FILE, OUTPUT=3D", "U", "*EL FILE, OUTPUT=3D", "S",
              "*NODE PRINT, NSET=NSUP, TOTALS=YES", "RF", "*NODE PRINT, NSET=NSYM, TOTALS=ONLY", "RF"]
    else:
        L += ["*NODE FILE, OUTPUT=3D", "U"]
    L += ["*END STEP"]
    open(path, "w").write("\n".join(L) + "\n")
    return linfo, names

def mesh_mass(M):
    m = 0.0; by_grp = {}
    for typ, nodes, grp, z, t in M.elems:
        P = np.array([M.xyz[q - 1] for q in nodes])
        if len(P) == 4: A = 0.5 * np.linalg.norm(np.cross(P[2] - P[0], P[3] - P[1]))
        else: A = 0.5 * np.linalg.norm(np.cross(P[1] - P[0], P[2] - P[0]))
        mm = A * t * V("rho"); m += mm; by_grp[grp] = by_grp.get(grp, 0) + mm
    return m, by_grp

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--r", type=int, default=1); ap.add_argument("--tag", default="base")
    ap.add_argument("--scale-flange", type=float, default=1.0); ap.add_argument("--scale-skin", type=float, default=1.0)
    ap.add_argument("--scale-web", type=float, default=1.0); ap.add_argument("--scale-stringer", type=float, default=1.0)
    ap.add_argument("--no-buckle", action="store_true"); ap.add_argument("--le-mult", type=int, default=1)
    a = ap.parse_args()
    M, info = build(a.r, a.scale_flange, a.scale_skin, a.scale_web, a.scale_stringer, a.le_mult)
    d = os.path.join(ROOT, "fe", a.tag); os.makedirs(d, exist_ok=True)
    linfo, names = write_inp(M, info, os.path.join(d, "wing.inp"), "static")
    if not a.no_buckle:
        write_inp(M, info, os.path.join(d, "wing_buckle_pos.inp"), "buckle", +1.0)
        write_inp(M, info, os.path.join(d, "wing_buckle_neg.inp"), "buckle", -1.0)
    mass, by = mesh_mass(M)
    meta = dict(tag=a.tag, r=a.r, scales=dict(flange=a.scale_flange, skin=a.scale_skin, web=a.scale_web, stringer=a.scale_stringer),
                n_nodes=len(info["used"]), n_elems=len(M.elems), struct_mass_half=mass, mass_by_group=by, **linfo,
                info={k: v for k, v in info.items() if k != "used"},
                elems=[(e[0], e[1], e[2], e[3], e[4]) for e in M.elems],
                xyz={str(n): M.xyz[n - 1].tolist() for n in info["used"]})
    json.dump(meta, open(os.path.join(d, "mesh.json"), "w"))
    print(f"{a.tag}: {len(info['used'])} nodes, {len(M.elems)} elements, structure {mass:.1f} kg/half wing, "
          f"lift {linfo['lift']:.0f} N, non-structural inertia {linfo['nonstructural_inertia']:.0f} N")
    print({k: round(v, 1) for k, v in by.items()})

if __name__ == "__main__":
    main()
