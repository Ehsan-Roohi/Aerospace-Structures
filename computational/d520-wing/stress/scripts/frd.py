"""Minimal reader for CalculiX ASCII .frd result files (nodes, elements, DISP, STRESS, buckling modes)."""
import numpy as np

def _f(s):
    return float(s.replace("D", "E")) if s.strip() else 0.0

def read(path):
    nodes, elems, blocks = {}, {}, []
    with open(path) as fh:
        lines = fh.read().splitlines()
    i = 0; n = len(lines)
    while i < n:
        ln = lines[i]
        if ln.startswith("    2C"):
            i += 1
            while not lines[i].startswith(" -3"):
                l = lines[i]
                nid = int(l[3:13]); nodes[nid] = (_f(l[13:25]), _f(l[25:37]), _f(l[37:49]))
                i += 1
        elif ln.startswith("    3C"):
            i += 1
            while not lines[i].startswith(" -3"):
                l = lines[i]
                if l.startswith(" -1"):
                    eid = int(l[3:13]); typ = int(l[13:18]); conn = []
                    i += 1
                    while i < n and lines[i].startswith(" -2"):
                        conn += [int(x) for x in lines[i][3:].split()]
                        i += 1
                    elems[eid] = (typ, conn)
                    continue
                i += 1
        elif ln.startswith("    1PSTEP") or ln.startswith("  100C"):
            if ln.startswith("  100C"):
                head = ln
                value = _f(ln[12:24]) if len(ln) > 24 else 0.0
                i += 1
                name = lines[i][5:13].strip(); ncomp = int(lines[i][13:18])
                i += 1
                comps = []
                while lines[i].startswith(" -5"):
                    comps.append(lines[i][5:13].strip()); i += 1
                data = {}
                while not lines[i].startswith(" -3"):
                    l = lines[i]
                    if l.startswith(" -1"):
                        nid = int(l[3:13]); vals = [_f(l[13 + 12 * k:25 + 12 * k]) for k in range(ncomp)]
                        data[nid] = vals
                    i += 1
                blocks.append(dict(name=name, value=value, comps=comps[:ncomp], data=data))
        i += 1
    return nodes, elems, blocks

def as_array(block, ids):
    d = block["data"]; k = len(block["comps"])
    return np.array([d.get(i, [0.0] * k) for i in ids])
