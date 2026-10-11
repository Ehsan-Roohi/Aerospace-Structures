"""Independent check of the exported solver decks: each deck is read back (NASTRAN with pyNastran,
APDL with a small command parser), rebuilt as a fresh CalculiX model and solved; tip deflection and
fitting reactions must reproduce the original run.

    python3 verify_exports.py r3
"""
import json, os, re, subprocess, sys
import numpy as np
from common import INPUTS, ROOT

V = lambda k: INPUTS[k]["value"]

def ccx_deck(nodes, elems, thick, spc, forces, grav, path):
    """nodes {id: xyz}; elems {id: (pid, [n])}; thick {pid: t}; spc [(node, dof)]; forces [(node, fz)]; grav g (m/s2 downward)."""
    L = ["*NODE"] + [f"{n}, {x:.6f}, {y:.6f}, {z:.6f}" for n, (x, y, z) in sorted(nodes.items())]
    by = {}
    for e, (pid, ns) in elems.items(): by.setdefault((pid, len(ns)), []).append((e, ns))
    names = []
    for (pid, k), lst in sorted(by.items()):
        nm = f"P{pid}_{k}"; names.append((nm, pid))
        L.append(f"*ELEMENT, TYPE={'S4' if k == 4 else 'S3'}, ELSET={nm}")
        L += [f"{e}, " + ", ".join(map(str, ns)) for e, ns in lst]
    L += ["*ELSET, ELSET=EALL"] + [f"{nm}," for nm, _ in names]
    L += ["*MATERIAL, NAME=M", "*ELASTIC", f"{V('E')}, {V('nu')}", "*DENSITY", f"{V('rho')}"]
    for nm, pid in names: L += [f"*SHELL SECTION, ELSET={nm}, MATERIAL=M", f"{thick[pid]:.8e}"]
    L += ["*NSET, NSET=NZ"] + [f"{n}," for n, d in spc if d == 3]
    L += ["*BOUNDARY"] + [f"{n}, {d}, {d}" for n, d in spc]
    L += ["*STEP", "*STATIC", "*CLOAD"] + [f"{n}, 3, {v:.8e}" for n, v in forces]
    L += ["*DLOAD", f"EALL, GRAV, {grav}, 0., 0., -1.", "*NODE FILE, OUTPUT=3D", "U",
          "*NODE PRINT, NSET=NZ, TOTALS=ONLY", "RF", "*END STEP"]
    open(path, "w").write("\n".join(L) + "\n")

def from_bdf(path):
    """pyNastran lives in its own venv (it pins numpy 1.x); it parses the deck and dumps JSON."""
    js = path + ".json"
    r = subprocess.run([os.path.join(ROOT, ".venv_nastran", "bin", "python"), os.path.join(os.path.dirname(__file__), "bdf_to_json.py"), path, js],
                       capture_output=True, text=True, check=True)
    print(r.stdout.strip())
    j = json.load(open(js)); os.remove(js)
    nodes = {int(n): tuple(v) for n, v in j["nodes"].items()}
    elems = {int(e): (v[0], v[1]) for e, v in j["elems"].items()}
    thick = {int(p): t for p, t in j["thick"].items()}
    return nodes, elems, thick, [tuple(x) for x in j["spc"]], [tuple(x) for x in j["forces"]], j["grav"], \
        dict(n_nodes=len(nodes), n_elems=len(elems), mass=j["mass"], sum_fz=sum(f for _, f in j["forces"]))

def from_apdl(path):
    nodes, elems, thick, spc, forces = {}, {}, {}, [], []
    sec = None; cur_sec = None; sym = False
    for ln in open(path):
        ln = ln.split("!")[0].strip()
        if not ln: continue
        p = [q.strip() for q in ln.split(",")]
        c = p[0].upper()
        if c == "SECTYPE": sec = int(p[1])
        elif c == "SECDATA": thick[sec] = float(p[1])
        elif c == "N": nodes[int(p[1])] = tuple(float(v) for v in p[2:5])
        elif c == "SECNUM": cur_sec = int(p[1])
        elif c == "EN":
            ns = [int(v) for v in p[2:6]]
            if ns[3] == ns[2]: ns = ns[:3]
            elems[int(p[1])] = (cur_sec, ns)
        elif c == "NSEL" and p[1] == "S" and p[2] == "LOC": sym = True
        elif c == "D" and p[1] == "ALL" and sym:
            d = {"UY": 2, "ROTX": 4, "ROTZ": 6}[p[2]]
            spc += [(n, d) for n, xyz in nodes.items() if abs(xyz[1]) < 1e-6]
        elif c == "D" and p[1] != "ALL":
            spc.append((int(p[1]), {"UX": 1, "UZ": 3}[p[2]]))
        elif c == "F": forces.append((int(p[1]), float(p[3].split("*")[1])))
        elif c == "ACEL": grav = float(p[3].split("*")[1])
    return nodes, elems, thick, spc, forces, grav, dict(n_nodes=len(nodes), n_elems=len(elems), sum_fz=sum(f for _, f in forces))

def solve(d, name):
    subprocess.run(["ccx", "-i", name], cwd=d, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    dat = open(os.path.join(d, name + ".dat")).read()
    rz = float(re.findall(r"total force \(fx,fy,fz\) for set NZ and time\s+\S+\s+\S+\s+\S+\s+(\S+)", dat)[0])
    import frd
    nodes, elems, blocks = frd.read(os.path.join(d, name + ".frd"))
    u = [b for b in blocks if b["name"] == "DISP"][-1]["data"]
    return rz, max(v[2] for v in u.values())

def main(tag):
    d = os.path.join(ROOT, "ansys", "verify"); os.makedirs(d, exist_ok=True)
    ref = json.load(open(os.path.join(ROOT, "fe", tag, "results.json")))
    out = dict(reference=dict(reaction_fz=ref["reactions"]["NSUP"][2], tip_uz=ref["tip_deflection_1g"]))
    for kind, reader, src in (("nastran", from_bdf, f"D520_wing_{tag}.bdf"), ("apdl", from_apdl, f"D520_wing_{tag}.mac")):
        nodes, elems, thick, spc, forces, grav, info = reader(os.path.join(ROOT, "ansys", src))
        ccx_deck(nodes, elems, thick, spc, forces, grav, os.path.join(d, kind + ".inp"))
        rz, uz = solve(d, kind)
        out[kind] = dict(info, reaction_fz=rz, tip_uz_max=uz)
        print(kind, info, "reaction %.1f N, max uz %.5f m" % (rz, uz))
    json.dump(out, open(os.path.join(ROOT, "ansys", "verify_exports.json"), "w"), indent=1)
    print("reference", out["reference"])

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "r3")
