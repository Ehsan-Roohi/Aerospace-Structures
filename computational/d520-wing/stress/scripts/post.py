"""Post-processing of the CalculiX runs: element stresses in local axes, deflections, reactions,
beam-theory cross-check, buckling factors and the strength checks.

    python3 post.py base          -> fe/base/results.json, fe/base/elem_results.npz
"""
import json, math, os, re, sys, glob
import numpy as np
from common import INPUTS, WING, ZONES, chord, section_pts, ROOT
import frd

V = lambda k: INPUTS[k]["value"]
LOADS = json.load(open(os.path.join(ROOT, "data", "loads.json")))

def vm(s):
    sxx, syy, szz, sxy, syz, szx = s[..., 0], s[..., 1], s[..., 2], s[..., 3], s[..., 4], s[..., 5]
    return np.sqrt(0.5 * ((sxx - syy) ** 2 + (syy - szz) ** 2 + (szz - sxx) ** 2) + 3 * (sxy ** 2 + syz ** 2 + szx ** 2))

def tensor(s):
    return np.array([[s[0], s[3], s[5]], [s[3], s[1], s[4]], [s[5], s[4], s[2]]])

def element_frames(P, grp):
    """e1 = span direction (or chordwise for ribs) projected in the element plane, e2, normal."""
    if len(P) == 4: n = np.cross(P[2] - P[0], P[3] - P[1])
    else: n = np.cross(P[1] - P[0], P[2] - P[0])
    n /= np.linalg.norm(n)
    ref = np.array([1.0, 0, 0]) if grp == "rib" else np.array([0, 1.0, 0])
    e1 = ref - n * ref.dot(n); e1 /= np.linalg.norm(e1)
    e2 = np.cross(n, e1)
    return e1, e2, n

def analyze(tag):
    d = os.path.join(ROOT, "fe", tag)
    mesh = json.load(open(os.path.join(d, "mesh.json")))
    xyz = {int(k): np.array(v) for k, v in mesh["xyz"].items()}
    elems = mesh["elems"]
    nodes3, elems3, blocks = frd.read(os.path.join(d, "wing.frd"))
    disp = [b for b in blocks if b["name"] == "DISP"][-1]["data"]
    strs = [b for b in blocks if b["name"] == "STRESS"][-1]["data"]
    ne = len(elems)
    R = dict(vm_top=np.zeros(ne), vm_bot=np.zeros(ne), vm_mem=np.zeros(ne), s11=np.zeros(ne), s22=np.zeros(ne), t12=np.zeros(ne),
             s11_top=np.zeros(ne), s11_bot=np.zeros(ne), y=np.zeros(ne), S=np.zeros(ne), Z=np.zeros(ne))
    grp = np.array([e[2] for e in elems]); zone = np.array([e[3] for e in elems]); thk = np.array([e[4] for e in elems])
    node_disp = {}
    for i, (typ, nodes, g, z, t) in enumerate(elems):
        k = len(nodes)
        conn = elems3[i + 1][1]
        bot, top = conn[:k], conn[k:2 * k]
        sb = np.mean([strs[q] for q in bot], axis=0); st = np.mean([strs[q] for q in top], axis=0)
        P = np.array([xyz[q] for q in nodes])
        e1, e2, n = element_frames(P, g)
        Tb, Tt = tensor(sb), tensor(st); Tm = 0.5 * (Tb + Tt)
        R["vm_bot"][i] = vm(np.array(sb)); R["vm_top"][i] = vm(np.array(st))
        R["vm_mem"][i] = vm(0.5 * (np.array(sb) + np.array(st)))
        R["s11"][i] = e1 @ Tm @ e1; R["s22"][i] = e2 @ Tm @ e2; R["t12"][i] = e1 @ Tm @ e2
        R["s11_top"][i] = e1 @ Tt @ e1; R["s11_bot"][i] = e1 @ Tb @ e1
        c = P.mean(axis=0); R["S"][i], R["y"][i], R["Z"][i] = c
        for a, b, q in zip(bot, top, nodes):
            if q not in node_disp:
                node_disp[q] = 0.5 * (np.array(disp[a]) + np.array(disp[b]))
    R["vm"] = np.maximum(R["vm_top"], R["vm_bot"])
    # reactions from .dat
    dat = open(os.path.join(d, "wing.dat")).read()
    tot = re.findall(r"total force \(fx,fy,fz\) for set (\w+) and time\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)", dat)
    reac = {s: [float(a), float(b), float(c)] for s, a, b, c in tot}
    expected = mesh["lift"] + mesh["nonstructural_inertia"] - mesh["struct_mass_half"] * V("g")
    ys = np.array(mesh["info"]["ys"])
    tip_nodes = [q for q in node_disp if abs(xyz[q][1] - ys[-1]) < 1e-6]
    uz_tip = max(node_disp[q][2] for q in tip_nodes)
    # twist at the last rib: from LE and false-spar node vertical displacements
    le = min(tip_nodes, key=lambda q: xyz[q][0]); te = max(tip_nodes, key=lambda q: xyz[q][0])
    twist = math.degrees(math.atan2(node_disp[le][2] - node_disp[te][2], xyz[te][0] - xyz[le][0]))
    # exclusion zone around the fitting supports (local load introduction)
    yf = V("fitting_y")
    far = np.abs(R["y"] - yf) > 0.10
    summ = {}
    for g in sorted(set(grp)):
        sel = (grp == g); sel_far = sel & far
        def mx(a, s):
            if not s.any(): return None
            i = np.argmax(np.where(s, a, -np.inf)); return dict(value=float(a[i]), y=float(R["y"][i]), S=float(R["S"][i]), elem=int(i + 1))
        def mn(a, s):
            if not s.any(): return None
            i = np.argmin(np.where(s, a, np.inf)); return dict(value=float(a[i]), y=float(R["y"][i]), S=float(R["S"][i]), elem=int(i + 1))
        summ[g] = dict(vm_max=mx(R["vm"], sel_far), vm_mem_max=mx(R["vm_mem"], sel_far), vm_max_incl_fitting=mx(R["vm"], sel),
                       s11_max=mx(R["s11"], sel_far), s11_min=mn(R["s11"], sel_far),
                       t12_absmax=mx(np.abs(R["t12"]), sel_far))
    res = dict(tag=tag, n_nodes=mesh["n_nodes"], n_elems=ne, struct_mass_half=mesh["struct_mass_half"],
               reactions=reac, reaction_expected_fz=-expected,
               equilibrium_error=(reac.get("NSUP", [0, 0, 0])[2] + expected) / expected,
               tip_deflection_1g=uz_tip, tip_twist_deg_1g=twist, groups=summ, scales=mesh["scales"])
    np.savez(os.path.join(d, "elem_results.npz"), grp=grp, zone=zone, thk=thk, **R)
    json.dump(dict(node_disp={str(k): v.tolist() for k, v in node_disp.items()}), open(os.path.join(d, "node_disp.json"), "w"))
    # buckling factors
    for sign in ("pos", "neg"):
        f = os.path.join(d, f"wing_buckle_{sign}.dat")
        if os.path.exists(f):
            txt = open(f).read()
            m = re.search(r"B U C K L I N G   F A C T O R   O U T P U T.*?MODE NO\s+BUCKLING\s+FACTOR\s*\n(.*?)(\n\s*\n|$)", txt, re.S)
            vals = []
            if m:
                for ln in m.group(1).strip().splitlines():
                    p = ln.split()
                    if len(p) >= 2: vals.append(float(p[1]))
            res[f"buckling_factors_{sign}"] = vals
    json.dump(res, open(os.path.join(d, "results.json"), "w"), indent=1)
    return res

def beam_check(tag):
    """Engineer's bending theory at a set of stations, with the FE boom stress for comparison."""
    d = os.path.join(ROOT, "fe", tag)
    mesh = json.load(open(os.path.join(d, "mesh.json")))
    E = np.load(os.path.join(d, "elem_results.npz"))
    x = np.array(mesh["info"]["x"]); i_sp = mesh["info"]["i_sp"]; i_str = mesh["info"]["i_str"]
    zones = LOADS["zones"]
    # structural line mass from the mesh elements
    yb = np.linspace(0, WING.b2, 400); mline = np.zeros_like(yb)
    xyz = {int(k): np.array(v) for k, v in mesh["xyz"].items()}
    for typ, nodes, g, z, t in mesh["elems"]:
        P = np.array([xyz[q] for q in nodes])
        A = 0.5 * np.linalg.norm(np.cross(P[2] - P[0], P[3] - P[1])) if len(P) == 4 else 0.5 * np.linalg.norm(np.cross(P[1] - P[0], P[2] - P[0]))
        k = min(len(yb) - 1, int(P[:, 1].mean() / (yb[1] - yb[0])))
        mline[k] += A * t * V("rho")
    mline /= (yb[1] - yb[0])
    y = np.array(LOADS["y"]); l = np.array(LOADS["lift_per_m_1g"])
    lf = np.interp(yb, y, l) - np.interp(yb, yb, mline) * V("g")
    # point masses
    Vv = np.zeros_like(yb); M = np.zeros_like(yb)
    for i in range(len(yb) - 2, -1, -1):
        dy = yb[i + 1] - yb[i]
        Vv[i] = Vv[i + 1] + 0.5 * (lf[i] + lf[i + 1]) * dy
        M[i] = M[i + 1] + 0.5 * (Vv[i] + Vv[i + 1]) * dy
    tip_extra = np.trapezoid(np.interp(np.linspace(yb[-1], WING.b2, 3), y, l), np.linspace(yb[-1], WING.b2, 3))
    for pm in LOADS["point_masses"]:
        F = -pm["mass"] * V("g"); inb = yb < pm["y"]
        Vv[inb] += F; M[inb] += F * (pm["y"] - yb[inb])
    out = []
    EI = []
    for yk in yb:
        from common import zone_of
        z = zones[zone_of(yk)]
        up, lo, c = section_pts(yk, x)
        items = []    # (area, Z)
        # skins (LE to false spar), stringers, webs, booms
        for surf in (up, lo):
            for a, b in zip(surf[:-1], surf[1:]):
                L = np.linalg.norm(b - a); items.append((L * z["skin"], 0.5 * (a[1] + b[1])))
        h_s = V("stringer")["h"]
        for i in i_str:
            items.append((h_s * z["stringer_t"], up[i][1] - h_s / 2)); items.append((h_s * z["stringer_t"], lo[i][1] + h_s / 2))
        hs = up[i_sp][1] - lo[i_sp][1]; hf = up[-1][1] - lo[-1][1]
        for zz in np.linspace(lo[i_sp][1], up[i_sp][1], 21)[:-1] + hs / 40:
            items.append((hs / 20 * z["web"], zz))
        for zz in np.linspace(lo[-1][1], up[-1][1], 11)[:-1] + hf / 22:
            items.append((hf / 10 * z["false_spar"], zz))
        bw = V("flange_root_width") / chord(0.0) * c; tf = z["flange_thickness"]
        d_f = z["skin"] + 0.5 * tf
        items.append((bw * tf, up[i_sp][1] - d_f)); items.append((bw * tf, lo[i_sp][1] + d_f))
        A = np.array(items)
        zc = (A[:, 0] * A[:, 1]).sum() / A[:, 0].sum()
        I = (A[:, 0] * (A[:, 1] - zc) ** 2).sum()
        Mk = np.interp(yk, yb, M)
        EI.append(V("E") * I)
        out.append(dict(y=float(yk), M=float(Mk), I=float(I), z_na=float(zc),
                        sigma_boom_upper=float(-Mk * (up[i_sp][1] - d_f - zc) / I),
                        sigma_boom_lower=float(-Mk * (lo[i_sp][1] + d_f - zc) / I)))
    EI = np.array(EI)
    # deflection by double integration from the fitting (clamped) outwards
    yf = V("fitting_y"); k0 = np.searchsorted(yb, yf)
    kap = M / EI
    th = np.zeros_like(yb); w = np.zeros_like(yb)
    for i in range(k0 + 1, len(yb)):
        dy = yb[i] - yb[i - 1]
        th[i] = th[i - 1] + 0.5 * (kap[i] + kap[i - 1]) * dy
        w[i] = w[i - 1] + 0.5 * (th[i] + th[i - 1]) * dy
    # FE boom stresses binned by station
    fe = []
    for yk in [0.6, 1.1, 1.7, 2.2, 2.7, 3.1, 3.6, 4.0, 4.5]:
        sel_u = (E["grp"] == "boom_upper") & (np.abs(E["y"] - yk) < 0.06)
        sel_l = (E["grp"] == "boom_lower") & (np.abs(E["y"] - yk) < 0.06)
        b = min(out, key=lambda o: abs(o["y"] - yk))
        fe.append(dict(y=yk, fe_upper=float(E["s11"][sel_u].mean()) if sel_u.any() else None,
                       fe_lower=float(E["s11"][sel_l].mean()) if sel_l.any() else None,
                       beam_upper=b["sigma_boom_upper"], beam_lower=b["sigma_boom_lower"], M=b["M"]))
    res = dict(stations=fe, beam_tip_deflection_1g=float(w[-1]), M_at_fitting=float(np.interp(yf, yb, M)),
               struct_mass_line=dict(y=yb[::8].tolist(), m=mline[::8].tolist()),
               diagrams=dict(y=yb[::4].tolist(), V=Vv[::4].tolist(), M=M[::4].tolist()))
    json.dump(res, open(os.path.join(d, "beam_check.json"), "w"), indent=1)
    return res

if __name__ == "__main__":
    tag = sys.argv[1] if len(sys.argv) > 1 else "base"
    r = analyze(tag)
    print(json.dumps({k: v for k, v in r.items() if k != "groups"}, indent=1))
    for g, s in r["groups"].items():
        def f(o): return "-" if o is None else "%.1f MPa @y=%.2f" % (o["value"] / 1e6, o["y"])
        print(f"{g:16s} vm {f(s['vm_max'])}  (incl. fitting {f(s['vm_max_incl_fitting'])})  s11 max {f(s['s11_max'])} min {f(s['s11_min'])}  |t12| {f(s['t12_absmax'])}")
    b = beam_check(tag)
    print("beam tip deflection 1g %.4f m ; M at fitting %.1f kNm" % (b["beam_tip_deflection_1g"], b["M_at_fitting"] / 1e3))
    for s in b["stations"]:
        print("y=%.1f M=%.1f kNm  FE upper %s beam %.1f | FE lower %s beam %.1f MPa" % (
            s["y"], s["M"] / 1e3, "%.1f" % (s["fe_upper"] / 1e6) if s["fe_upper"] is not None else "-", s["beam_upper"] / 1e6,
            "%.1f" % (s["fe_lower"] / 1e6) if s["fe_lower"] is not None else "-", s["beam_lower"] / 1e6))
