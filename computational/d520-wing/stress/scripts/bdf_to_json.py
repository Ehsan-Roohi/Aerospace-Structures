"""Read a NASTRAN deck with pyNastran (run with the .venv_nastran interpreter) and dump the model as JSON."""
import json, sys
from pyNastran.bdf.bdf import read_bdf
from pyNastran.bdf.mesh_utils.mass_properties import mass_properties
m = read_bdf(sys.argv[1], xref=True, debug=False)
out = dict(nodes={n: list(map(float, g.xyz)) for n, g in m.nodes.items()},
           elems={e: [el.pid, list(el.node_ids)] for e, el in m.elements.items()},
           thick={p: pr.t for p, pr in m.properties.items()}, spc=[], forces=[], grav=None)
for sid, cards in m.spcs.items():
    for c in cards:
        for d in str(c.components): out["spc"] += [[n, int(d)] for n in c.node_ids]
for sid, cards in m.loads.items():
    for c in cards:
        if c.type == "FORCE": out["forces"].append([c.node_id, float(c.mag * c.xyz[2])])
        if c.type == "GRAV": out["grav"] = float(c.scale * -c.N[2])
out["mass"] = float(mass_properties(m)[0])
json.dump(out, open(sys.argv[2], "w"))
print("cards ok:", len(out["nodes"]), "grids,", len(out["elems"]), "elements, mass %.2f kg" % out["mass"])
