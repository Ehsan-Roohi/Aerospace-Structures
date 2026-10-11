"""Write the wing shell model for other solvers, from the same mesh and loads as the CalculiX runs.

  ansys/D520_wing_<tag>.mac   ANSYS Mechanical APDL: SHELL181, sections, symmetry + fittings, 1 g loads
                              scaled by the parameter NLF, static solve then linear buckling.
                              (Workbench: Mechanical APDL system -> Analysis -> Add Input File.)
  ansys/D520_wing_<tag>.bdf   NASTRAN bulk data, SOL 101 (ANSYS Workbench 'External Model', Femap,
                              HyperMesh, MSC/NX/Simcenter Nastran, OptiStruct).
  ansys/D520_wing_<tag>_calculix.inp   the CalculiX/Abaqus deck actually solved here.
Units: N, m, kg, Pa.

    python3 solver_export.py r3
"""
import json, os, re, shutil, sys
import numpy as np
from common import INPUTS, ROOT
import fe_model as FM

V = lambda k: INPUTS[k]["value"]

def sections_of(mesh):
    secs = {}
    for i, (typ, nodes, grp, z, t) in enumerate(mesh["elems"], start=1):
        key = (grp, z, round(t, 7))
        secs.setdefault(key, []).append((i, typ, nodes))
    return secs

def loads_and_sets(tag):
    d = os.path.join(ROOT, "fe", tag)
    inp = open(os.path.join(d, "wing.inp")).read()
    cl = re.search(r"\*CLOAD\n(.*?)\n\*", inp, re.S).group(1).strip().splitlines()
    loads = [(int(a), int(b), float(c)) for a, b, c in (l.split(",") for l in cl)]
    def nset(name):
        m = re.search(r"\*NSET, NSET=" + name + r"\n(.*?)\n\*", inp, re.S)
        return [int(x) for x in re.split(r"[,\s]+", m.group(1)) if x.strip()]
    return loads, nset("NSYM"), nset("NFIT_SPAR"), nset("NFIT_FSPAR")

def write_apdl(tag, mesh, path):
    loads, sym, fsp, ffs = loads_and_sets(tag)
    secs = sections_of(mesh)
    L = ["! D.520 S starboard half wing - shell model reconstructed from the 1940 manual",
         "! Units N, m, kg, Pa.  Axes: X aft from spinner tip, Y starboard, Z up.",
         "! Loads below are for n = 1 g (lift up, inertia down) and are multiplied by NLF.",
         "! Usage: /INPUT,D520_wing_%s,mac  (or Workbench: Mechanical APDL system, Add Input File)" % tag,
         "FINISH", "/CLEAR,NOSTART", "/PREP7",
         "*SET,NLF,1.0            ! load factor n: 6 = limit (CS-23 aerobatic), 9 = ultimate, -3 = negative limit",
         "ET,1,SHELL181", "KEYOPT,1,3,2           ! full integration with incompatible modes",
         f"MP,EX,1,{V('E'):.6E}", f"MP,PRXY,1,{V('nu')}", f"MP,DENS,1,{V('rho')}"]
    sec_id = {}
    for k, (key, lst) in enumerate(sorted(secs.items()), start=1):
        grp, z, t = key
        sec_id[key] = k
        L += [f"SECTYPE,{k},SHELL", f"SECDATA,{t:.6E},1,0.0,3", "SECOFFSET,MID", f"! section {k}: {grp} zone {z} t = {t*1e3:.2f} mm"]
    L.append("! ---- nodes")
    for n in sorted(int(k) for k in mesh["xyz"]):
        x, y, z = mesh["xyz"][str(n)]; L.append(f"N,{n},{x:.6f},{y:.6f},{z:.6f}")
    L += ["! ---- elements", "TYPE,1", "MAT,1"]
    for key, lst in sorted(secs.items()):
        L.append(f"SECNUM,{sec_id[key]}")
        for e, typ, nodes in lst:
            nn = nodes if len(nodes) == 4 else nodes + [nodes[-1]]
            L.append(f"EN,{e}," + ",".join(str(q) for q in nn))
    for key in sorted(secs):
        grp, z, t = key
        L += [f"ESEL,S,SECN,,{sec_id[key]}", f"CM,{(grp[:24] + '_Z' + str(z)).upper()},ELEM"]
    L += ["ALLSEL,ALL", "! ---- symmetry plane y = 0 (wing continuous through the centre joint, Pl.4)",
          "NSEL,S,LOC,Y,-1.0E-6,1.0E-6", "D,ALL,UY,0", "D,ALL,ROTX,0", "D,ALL,ROTZ,0", "ALLSEL,ALL",
          "! ---- fuselage fittings at y = %.2f m (Pl.14): spar web line UX+UZ, false-spar web line UZ" % V("fitting_y")]
    L += [f"D,{n},UX,0" for n in fsp] + [f"D,{n},UZ,0" for n in fsp] + [f"D,{n},UZ,0" for n in ffs]
    L.append("! ---- lift (flat-plate chordwise, lifting-line spanwise) + non-structural inertia, per g")
    L += [f"F,{n},FZ,NLF*{v:.6E}" for n, d, v in loads]
    L += ["ACEL,0,0,NLF*9.80665      ! structure's own inertia (gravity convention: +Z acceleration = weight down)",
          "FINISH", "/SOLU", "ANTYPE,STATIC", "PSTRES,ON", "OUTRES,ALL,ALL", "SOLVE", "FINISH",
          "/POST1", "SET,LAST", "! reaction check: the fittings must carry n x (W/2 - half-wing weight)",
          "NSEL,S,D,UZ", "FSUM", "ALLSEL,ALL", "! PLNSOL,S,EQV,,,  (von Mises)   PLNSOL,U,Z", "FINISH",
          "! ---- linear buckling (load multipliers apply to the NLF case above)",
          "/SOLU", "ANTYPE,BUCKLE", "BUCOPT,LANB,10", "MXPAND,10,,,YES", "SOLVE", "FINISH", "/POST1", "SET,LIST", "FINISH"]
    open(path, "w").write("\n".join(L) + "\n")
    return len(L)

def ff(v):
    """NASTRAN free-field real (always with a decimal point, at most 16 characters)."""
    s = f"{v:.8G}"
    if "E" in s:
        m, e = s.split("E"); m = m if "." in m else m + "."; s = f"{m}E{int(e)}"
    elif "." not in s: s += "."
    return s

def write_bdf(tag, mesh, path):
    loads, sym, fsp, ffs = loads_and_sets(tag)
    secs = sections_of(mesh)
    L = ["$ D.520 S starboard half wing - shell model reconstructed from the 1940 manual",
         "$ Units N, m, kg, Pa. Loads for n = 1 g; scale LOAD 300 factors for other load factors.",
         "SOL 101", "CEND", "TITLE = D520 HALF WING 1G", "ECHO = NONE",
         "SUBCASE 1", "  LABEL = PULL-UP 1 G", "  SPC = 100", "  LOAD = 300",
         "  DISPLACEMENT(PLOT) = ALL", "  STRESS(PLOT,CORNER) = ALL", "  SPCFORCES = ALL",
         "BEGIN BULK", "PARAM,POST,-1", "PARAM,AUTOSPC,YES",
         f"MAT1,1,{ff(V('E'))},,{ff(V('nu'))},{ff(V('rho'))}"]
    pid = {}
    for k, (key, lst) in enumerate(sorted(secs.items()), start=1):
        grp, z, t = key; pid[key] = k
        L += [f"$ PID {k}: {grp} zone {z}", f"PSHELL,{k},1,{ff(t)},1,,1"]
    for n in sorted(int(k) for k in mesh["xyz"]):
        x, y, z = mesh["xyz"][str(n)]; L.append(f"GRID,{n},,{ff(x)},{ff(y)},{ff(z)}")
    for key, lst in sorted(secs.items()):
        for e, typ, nodes in lst:
            L.append((f"CQUAD4,{e},{pid[key]}," if len(nodes) == 4 else f"CTRIA3,{e},{pid[key]},") + ",".join(str(q) for q in nodes))
    def spc1(c, nodes):
        for k in range(0, len(nodes), 6): L.append(f"SPC1,100,{c}," + ",".join(str(q) for q in nodes[k:k + 6]))
    spc1(246, sorted(sym)); spc1(13, fsp); spc1(3, ffs)
    L += [f"FORCE,200,{n},,{ff(v)},0.,0.,1." for n, d, v in loads]
    L += ["GRAV,201,,9.80665,0.,0.,-1.", "LOAD,300,1.,1.,200,1.,201", "ENDDATA"]
    open(path, "w").write("\n".join(L) + "\n")
    return len(L)

def main(tag):
    mesh = json.load(open(os.path.join(ROOT, "fe", tag, "mesh.json")))
    out = os.path.join(ROOT, "ansys"); os.makedirs(out, exist_ok=True)
    a = write_apdl(tag, mesh, os.path.join(out, f"D520_wing_{tag}.mac"))
    b = write_bdf(tag, mesh, os.path.join(out, f"D520_wing_{tag}.bdf"))
    shutil.copy(os.path.join(ROOT, "fe", tag, "wing.inp"), os.path.join(out, f"D520_wing_{tag}_calculix.inp"))
    print("APDL lines", a, "BDF lines", b)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "r3")
