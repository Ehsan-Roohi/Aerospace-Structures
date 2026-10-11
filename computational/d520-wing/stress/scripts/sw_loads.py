"""Load table for setting the wing up by hand in SolidWorks Simulation / ANSYS Workbench on the structure STEP:
lift per gauge zone (applied as a uniform force in +Z on that zone's upper-skin faces), non-structural
masses as forces, and the root bending moment this simplified loading gives compared with the exact one."""
import json, os
import numpy as np
from common import INPUTS, ZONES, WING, ROOT, chord
V = lambda k: INPUTS[k]["value"]
L = json.load(open(os.path.join(ROOT, "data", "loads.json")))
y = np.linspace(0, WING.b2, 20001); l = np.interp(y, L["y"], L["lift_per_m_1g"])
rows = []; Mz = 0.0; yf = V("fitting_y")
for k, (a, b) in enumerate(ZONES):
    bb = WING.b2 if k == len(ZONES) - 1 else b          # tip cap lift goes to the last zone
    s = (y >= a) & (y <= bb)
    F = float(np.trapezoid(l[s], y[s]))
    ys = np.linspace(a, b, 200); A_up = float(np.trapezoid([V("false_spar_x_c") * chord(v) for v in ys], ys))
    yc = 0.5 * (a + b)
    rows.append(dict(zone=k, y0=a, y1=b, lift_N_per_g=F, upper_skin_plan_area_m2=A_up, equivalent_pressure_Pa_per_g=F / A_up))
    if yc > yf: Mz += F * (yc - yf)
exact = float(np.trapezoid(l[y > yf] * (y[y > yf] - yf), y[y > yf]))
masses = []
for pm in L["point_masses"]:
    masses.append(dict(item=pm["name"], y=pm["y"], x_c=pm["x_c"], force_N_per_g=-pm["mass"] * V("g")))
agg = {}
for m in masses:
    k = m["item"]; agg.setdefault(k, dict(item=k, force_N_per_g=0.0, y=[]))
    agg[k]["force_N_per_g"] += m["force_N_per_g"]; agg[k]["y"].append(m["y"])
for v in agg.values(): v["y_range"] = [min(v["y"]), max(v["y"])]; del v["y"]
out = dict(zones=rows, nonstructural=list(agg.values()), root_moment_lift_exact_Nm=exact, root_moment_lift_zoned_Nm=Mz,
           zoned_error=(Mz - exact) / exact, total_lift_half_N_per_g=float(np.trapezoid(l, y)))
json.dump(out, open(os.path.join(ROOT, "data", "solidworks_loads.json"), "w"), indent=1)
for r in rows: print("zone %d %.2f-%.2f  lift %.0f N/g  area %.3f m2  p %.0f Pa/g" % (r["zone"], r["y0"], r["y1"], r["lift_N_per_g"], r["upper_skin_plan_area_m2"], r["equivalent_pressure_Pa_per_g"]))
print(agg); print("root moment exact %.0f zoned %.0f (%.1f%%)" % (exact, Mz, 100 * out["zoned_error"]))
