"""Geometrically and materially non-linear collapse run (CalculiX *STATIC, NLGEOM, J2 plasticity).

The 1 g load set is ramped proportionally to n_max g. The mesh is seeded with the first positive
buckling mode (amplitude w0) so that skin panels buckle naturally; duralumin follows a 2017-T4
true-stress / plastic-strain curve built from the minimum quoted properties (220 / 380 MPa).
The run ends at the last converged increment: that load factor is the collapse estimate.

    python3 nonlinear.py r2 [--nmax 26] [--w0 0.5e-3]      -> fe/<tag>_nl/wing_nl.inp (+ runs ccx)
    python3 nonlinear.py r2 --post                          -> fe/<tag>_nl/nl_results.json
"""
import argparse, json, os, re, subprocess
import numpy as np
from common import INPUTS, ROOT
import frd

V = lambda k: INPUTS[k]["value"]
PLASTIC = [(220e6, 0.0), (260e6, 0.005), (300e6, 0.02), (340e6, 0.05), (380e6, 0.10)]

def build(tag, nmax, w0):
    src = os.path.join(ROOT, "fe", tag); dst = os.path.join(ROOT, "fe", tag + "_nl"); os.makedirs(dst, exist_ok=True)
    mesh = json.load(open(os.path.join(src, "mesh.json")))
    inp = open(os.path.join(src, "wing.inp")).read()
    # imperfection: first positive buckling mode mapped back to the shell nodes
    n3, e3, blocks = frd.read(os.path.join(src, "wing_buckle_pos.frd"))
    dd = [b for b in blocks if b["name"] == "DISP"][1]["data"]
    disp = {}
    for i, (typ, nodes, g, z, t) in enumerate(mesh["elems"]):
        conn = e3[i + 1][1]; k = len(nodes)
        for q, b0, b1 in zip(nodes, conn[:k], conn[k:2 * k]):
            if q not in disp: disp[q] = 0.5 * (np.array(dd[b0][:3]) + np.array(dd[b1][:3]))
    mx = max(np.linalg.norm(v) for v in disp.values())
    head, rest = inp.split("*NODE\n", 1)
    node_block, rest = rest.split("*ELEMENT", 1)
    lines = []
    for ln in node_block.strip().splitlines():
        p = ln.split(","); n = int(p[0]); x = np.array([float(v) for v in p[1:4]]) + w0 * disp.get(n, 0) / mx
        lines.append(f"{n}, {x[0]:.7f}, {x[1]:.7f}, {x[2]:.7f}")
    inp = head + "*NODE\n" + "\n".join(lines) + "\n*ELEMENT" + rest
    inp = inp.replace("*DENSITY", "*PLASTIC\n" + "\n".join(f"{s:.4e}, {e}" for s, e in PLASTIC) + "\n*DENSITY")
    # proportional loads to nmax g
    def scale_cload(m):
        out = []
        for ln in m.group(1).strip().splitlines():
            a, b, c = ln.split(","); out.append(f"{a},{b}, {float(c) * nmax:.6e}")
        return "*CLOAD\n" + "\n".join(out) + "\n*DLOAD"
    inp = re.sub(r"\*CLOAD\n(.*?)\n\*DLOAD", scale_cload, inp, flags=re.S)
    inp = re.sub(r"EALL, GRAV, ([0-9.]+),", lambda m: f"EALL, GRAV, {float(m.group(1)) * nmax:.6f},", inp)
    tip = [n for n in mesh["xyz"] if abs(mesh["xyz"][n][1] - max(v[1] for v in mesh["xyz"].values())) < 1e-6]
    tip_le = min(tip, key=lambda n: mesh["xyz"][n][0])
    step = (f"*STEP, NLGEOM, INC=600\n*STATIC\n0.02, 1.0, 1.e-5, 0.03\n")
    inp = inp.replace("*STEP\n*STATIC\n", f"*NSET, NSET=NTIP\n{tip_le},\n" + step)
    inp = inp.replace("*NODE FILE, OUTPUT=3D\nU\n*EL FILE, OUTPUT=3D\nS\n",
                      "*NODE FILE, OUTPUT=3D, FREQUENCY=4\nU\n*EL FILE, OUTPUT=3D, FREQUENCY=4\nS, PEEQ\n*NODE PRINT, NSET=NTIP\nU\n")
    inp = inp.replace("*NODE PRINT, NSET=NSYM, TOTALS=ONLY\nRF\n", "")
    open(os.path.join(dst, "wing_nl.inp"), "w").write(inp)
    json.dump(dict(tag=tag, nmax=nmax, w0=w0, tip_node=int(tip_le), plastic=PLASTIC), open(os.path.join(dst, "nl_setup.json"), "w"))
    return dst

def post(tag):
    d = os.path.join(ROOT, "fe", tag + "_nl"); setup = json.load(open(os.path.join(d, "nl_setup.json")))
    sta = open(os.path.join(d, "wing_nl.sta")).read().splitlines()
    t = []
    for ln in sta:
        p = ln.split()
        if len(p) >= 7 and p[0].isdigit():
            t.append(float(p[5]))
    dat = open(os.path.join(d, "wing_nl.dat")).read()
    uz = [float(m) for m in re.findall(r"displacements \(vx,vy,vz\) for set NTIP and time\s+\S+\s+\d+\s+\S+\s+\S+\s+(\S+)", dat)]
    rz = [float(m) for m in re.findall(r"total force \(fx,fy,fz\) for set NSUP and time\s+\S+\s+\S+\s+\S+\s+(\S+)", dat)]
    n = [setup["nmax"] * x for x in t]
    # first plastic strain from the frd snapshots
    first_yield = None
    try:
        n3, e3, blocks = frd.read(os.path.join(d, "wing_nl.frd"))
        for b in blocks:
            if b["name"].startswith("PE") and max(v[0] for v in b["data"].values()) > 1e-4:
                first_yield = setup["nmax"] * b["value"]; break
    except Exception as e:
        print("frd", e)
    res = dict(setup, increments=len(t), n_history=n, tip_uz=uz[:len(n)], reaction_fz=rz[:len(n)],
               n_last_converged=n[-1] if n else None, n_first_plastic_snapshot=first_yield)
    json.dump(res, open(os.path.join(d, "nl_results.json"), "w"), indent=1)
    return res

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("tag"); ap.add_argument("--nmax", type=float, default=26.0)
    ap.add_argument("--w0", type=float, default=0.5e-3); ap.add_argument("--post", action="store_true"); ap.add_argument("--no-run", action="store_true")
    a = ap.parse_args()
    if a.post:
        r = post(a.tag); print({k: v for k, v in r.items() if k not in ("n_history", "tip_uz", "reaction_fz")})
    else:
        d = build(a.tag, a.nmax, a.w0); print("written", d)
        if not a.no_run:
            subprocess.run("nohup ccx -i wing_nl > ccx_nl.log 2>&1 &", shell=True, cwd=d)
