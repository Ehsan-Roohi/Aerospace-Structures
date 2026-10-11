"""Collect every number the report quotes into data/summary.json."""
import json, os, re
import numpy as np
from common import INPUTS, ROOT

V = lambda k: INPUTS[k]["value"]
def J(*p):
    f = os.path.join(ROOT, *p)
    return json.load(open(f)) if os.path.exists(f) else None

def main(tag="r3"):
    L = J("data", "loads.json"); R = J("fe", tag, "results.json"); B = J("fe", tag, "beam_check.json")
    C = J("fe", tag, "collapse.json"); CS = J("fe", tag, "collapse_sensitivity.json"); CAD = J("cad", "cad_report.json")
    VE = J("ansys", "verify_exports.json"); SW = J("data", "solidworks_loads.json")
    E = np.load(os.path.join(ROOT, "fe", tag, "elem_results.npz"))
    nl, nu = V("n_limit_pos"), V("n_limit_pos") * V("safety_factor")
    far = np.abs(E["y"] - V("fitting_y")) > 0.10
    comp = {}
    for g in sorted(set(E["grp"])):
        s = (E["grp"] == g) & far
        i = np.argmax(np.where(s, E["vm_mem"], -1)); j = np.argmax(np.where(s, E["vm"], -1))
        comp[g] = dict(vm_mem_per_g=float(E["vm_mem"][i]), y_mem=float(E["y"][i]), vm_max_per_g=float(E["vm"][j]), y_max=float(E["y"][j]),
                       s11_min_per_g=float(np.where(s, E["s11"], 0).min()), s11_max_per_g=float(np.where(s, E["s11"], 0).max()),
                       t12_absmax_per_g=float(np.abs(np.where(s, E["t12"], 0)).max()))
    conv = []
    for t in ("r1", "r2", "r3", "r4"):
        r = J("fe", t, "results.json")
        if r: conv.append(dict(tag=t, n_elems=r["n_elems"], tip_mm=r["tip_deflection_1g"] * 1e3,
                               buckle_pos=(r.get("buckling_factors_pos") or [None])[0], buckle_neg=(r.get("buckling_factors_neg") or [None])[0]))
    sens = {}
    for t, lab in (("r3_skin075", "skin x0.75"), ("r3_skin125", "skin x1.25"), ("r3_flange060", "booms x0.6")):
        r = J("fe", t, "results.json")
        if r: sens[lab] = dict(tip_mm=r["tip_deflection_1g"] * 1e3, buckle_pos=(r.get("buckling_factors_pos") or [None])[0],
                               buckle_neg=(r.get("buckling_factors_neg") or [None])[0],
                               boom_upper_min=r["groups"]["boom_upper"]["s11_min"]["value"], boom_lower_max=r["groups"]["boom_lower"]["s11_max"]["value"],
                               struct_mass_half=r["struct_mass_half"])
    out = dict(
        inputs={k: dict(value=v["value"], status=v["status"]) for k, v in INPUTS.items()},
        loads=dict(W_N=L["W_N"], half_lift_1g=L["W_N"] / 2, M_root_lift_1g=L["M_root_lift_1g"], M_root_net_1g=B["M_at_fitting"],
                   nonstructural_mass_half=L["nonstructural_mass_half"], alpha_deg=L["lifting_line"]["alpha_deg"]),
        fe=dict(tag=tag, n_nodes=R["n_nodes"], n_elems=R["n_elems"], struct_mass_half=R["struct_mass_half"],
                reaction_fz_1g=R["reactions"]["NSUP"][2], reaction_expected=R["reaction_expected_fz"], equilibrium_error=R["equilibrium_error"],
                tip_mm_1g=R["tip_deflection_1g"] * 1e3, twist_deg_1g=R["tip_twist_deg_1g"], beam_tip_mm_1g=B["beam_tip_deflection_1g"] * 1e3,
                components=comp, buckle_pos=R.get("buckling_factors_pos"), buckle_neg=R.get("buckling_factors_neg")),
        beam_stations=B["stations"], convergence=conv, sensitivity_fe=sens,
        collapse=C["summary"] if C else None, collapse_sensitivity=CS, cad=CAD.get("_checks") if CAD else None,
        cad_parts={k: dict(valid=v["valid"], faults=v.get("faults"), volume_m3=v["volume_m3"]) for k, v in (CAD or {}).items() if isinstance(v, dict) and "volume_m3" in v},
        exports=VE, solidworks_loads=SW, limit=nl, ultimate=nu)
    json.dump(out, open(os.path.join(ROOT, "data", "summary.json"), "w"), indent=1, default=float)
    return out

if __name__ == "__main__":
    o = main()
    print(json.dumps({k: o[k] for k in ("loads", "convergence", "sensitivity_fe", "collapse")}, indent=1, default=str)[:4000])
    for g, c in o["fe"]["components"].items():
        print(f"{g:16s} mem {c['vm_mem_per_g']/1e6:6.2f} MPa/g @ {c['y_mem']:.2f}  max {c['vm_max_per_g']/1e6:6.2f} @ {c['y_max']:.2f}  s11 [{c['s11_min_per_g']/1e6:.2f}, {c['s11_max_per_g']/1e6:.2f}]  |t12| {c['t12_absmax_per_g']/1e6:.2f}")
