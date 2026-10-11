"""Identify where each buckling mode lives (group, span station, chordwise region)."""
import frd, json, sys, numpy as np, os
from common import ROOT
def modes(tag, sign, nshow=10):
    d = os.path.join(ROOT, "fe", tag)
    mesh = json.load(open(os.path.join(d, "mesh.json")))
    n3, e3, b = frd.read(os.path.join(d, f"wing_buckle_{sign}.frd"))
    ds = [x for x in b if x["name"] == "DISP"][1:]
    elems = mesh["elems"]; xyz = mesh["xyz"]
    out = []
    for k, blk in enumerate(ds[:nshow]):
        dd = blk["data"]
        amp = np.array([np.mean([np.linalg.norm(dd[q]) for q in e3[i + 1][1]]) for i in range(len(elems))])
        top = np.argsort(amp)[::-1][:40]
        grp = {}
        for i in top: grp[elems[i][2]] = grp.get(elems[i][2], 0) + 1
        ys = [np.mean([xyz[str(q)][1] for q in elems[i][1]]) for i in top]
        Ss = [np.mean([xyz[str(q)][0] for q in elems[i][1]]) for i in top]
        out.append(dict(mode=k + 1, factor=blk["value"], groups=grp, y=(float(min(ys)), float(max(ys))), S=(float(min(Ss)), float(max(Ss)))))
    return out
if __name__ == "__main__":
    for sign in ("pos", "neg"):
        for m in modes(sys.argv[1], sign, 6):
            print(sign, m["mode"], round(m["factor"], 2), m["groups"], "y %.2f-%.2f" % m["y"], "S %.2f-%.2f" % m["S"])
