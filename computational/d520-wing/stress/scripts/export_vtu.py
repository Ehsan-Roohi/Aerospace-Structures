"""Results for ParaView: shell mesh with per-element stresses (per g) and nodal displacement.

    python3 export_vtu.py r3     -> ansys/D520_wing_r3_results_per_g.vtu
"""
import json, os, sys
import numpy as np
import meshio
from common import ROOT

def main(tag):
    d = os.path.join(ROOT, "fe", tag)
    mesh = json.load(open(os.path.join(d, "mesh.json")))
    R = np.load(os.path.join(d, "elem_results.npz"))
    nd = json.load(open(os.path.join(d, "node_disp.json")))["node_disp"]
    ids = sorted(int(k) for k in mesh["xyz"]); idx = {n: i for i, n in enumerate(ids)}
    pts = np.array([mesh["xyz"][str(n)] for n in ids])
    quads, tris, qi, ti = [], [], [], []
    for i, (typ, nodes, g, z, t) in enumerate(mesh["elems"]):
        if len(nodes) == 4: quads.append([idx[q] for q in nodes]); qi.append(i)
        else: tris.append([idx[q] for q in nodes]); ti.append(i)
    groups = sorted(set(R["grp"]))
    gid = np.array([groups.index(g) for g in R["grp"]])
    def cd(a): return [np.asarray(a)[qi], np.asarray(a)[ti]]
    data = {"vonMises_max_MPa_per_g": cd(R["vm"] / 1e6), "vonMises_membrane_MPa_per_g": cd(R["vm_mem"] / 1e6),
            "sigma_spanwise_membrane_MPa_per_g": cd(R["s11"] / 1e6), "shear_inplane_MPa_per_g": cd(R["t12"] / 1e6),
            "thickness_mm": cd(R["thk"] * 1e3), "part_id": cd(gid), "zone": cd(R["zone"])}
    U = np.array([nd.get(str(n), [0, 0, 0, 0])[:3] for n in ids])
    m = meshio.Mesh(pts, [("quad", np.array(quads)), ("triangle", np.array(tris))], point_data={"displacement_m_per_g": U}, cell_data=data)
    out = os.path.join(ROOT, "ansys", f"D520_wing_{tag}_results_per_g.vtu")
    m.write(out)
    json.dump(groups, open(out.replace(".vtu", "_part_ids.json"), "w"))
    print(out, len(pts), "points")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "r3")
