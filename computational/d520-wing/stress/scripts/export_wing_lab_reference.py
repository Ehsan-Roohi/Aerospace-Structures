"""Reference numbers for the Wing Lab metal-wing engine (metal_wing_engine.js).

Collects, from the tested Python pipeline and the CalculiX shell model, the quantities the
browser engine must reproduce: lifting-line span loading, non-structural masses, boom law,
section bending properties at a set of stations, shear / moment diagrams, engineer's-bending
boom stresses, shell-FE results (r3 mesh and the three sensitivity meshes) and the effective-width
collapse load factors.

    python3 export_wing_lab_reference.py [output.json]
"""
import json, os, sys
import numpy as np
from common import INPUTS, WING, RIB_Y, ZONES, chord, section_pts, zone_of, ROOT

V = lambda k: INPUTS[k]["value"]
J = lambda *p: json.load(open(os.path.join(ROOT, *p)))


def chord_fractions(r=3):
    """The chordwise node fractions of the shell mesh (fe_model.chord_fractions)."""
    xs, xf = V("spar_x_c"), V("false_spar_x_c")
    n_le = 8 * r
    t = np.linspace(0, 1, n_le + 1)
    le = xs * (1 - np.cos(0.5 * np.pi * t))
    st = [xs] + list(V("stringer")["x_c"]) + [xf]
    box = [xs]
    for a, b in zip(st[:-1], st[1:]):
        box += list(np.linspace(a, b, 2 * r + 1)[1:])
    x = np.concatenate([le, box[1:]])
    return x, n_le, [int(np.argmin(np.abs(x - s))) for s in V("stringer")["x_c"]]


def section_props(y, zones):
    """Same idealisation as post.beam_check (no wheel-well cut-out)."""
    x, i_sp, i_str = chord_fractions(3)
    z = zones[zone_of(y)]
    up, lo, c = section_pts(y, x)
    items = []
    for surf in (up, lo):
        for a, b in zip(surf[:-1], surf[1:]):
            items.append((np.linalg.norm(b - a) * z["skin"], 0.5 * (a[1] + b[1])))
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
    return dict(y=float(y), chord=float(c), area=float(A[:, 0].sum()), z_na=float(zc),
                Ixx=float((A[:, 0] * (A[:, 1] - zc) ** 2).sum()), depth_spar=float(hs), depth_false_spar=float(hf),
                boom_area=float(bw * tf), z_boom_upper=float(up[i_sp][1] - d_f), z_boom_lower=float(lo[i_sp][1] + d_f))


def main(out):
    L = J("data", "loads.json"); S = J("data", "summary.json"); B = J("fe", "r3", "beam_check.json")
    C = J("fe", "r3", "collapse.json") if os.path.exists(os.path.join(ROOT, "fe", "r3", "collapse.json")) else J("data", "collapse.json")
    R3 = J("fe", "r3", "results.json")
    geometry = [dict(y=float(y), chord=float(chord(y)), S_LE=float(WING.S_LE(y)), thickness=float(WING.thickness(y)),
                     z_upper=float(WING.z_upper(y)), camber_blend=float(WING.camber_blend(y)))
                for y in (0.0, 0.3, 0.51, 1.0, 1.5, 2.07, 3.0, 4.0, 4.6869, 4.8, 5.0)]
    pts = []
    for y in (0.6, 2.35, 4.5):
        up, lo, c = section_pts(y, [0.0, 0.1, 0.37, 0.6, 0.73, 1.0])
        pts.append(dict(y=y, upper=up.tolist(), lower=lo.tolist()))
    sens = {}
    for tag, lab in (("r3_skin075", "skin0.75"), ("r3_skin125", "skin1.25"), ("r3_flange060", "boom0.6")):
        r = J("fe", tag, "results.json")
        sens[lab] = dict(tip_mm=r["tip_deflection_1g"] * 1e3, struct_mass_half=r["struct_mass_half"],
                         boom_upper_min_MPa=r["groups"]["boom_upper"]["s11_min"]["value"] / 1e6,
                         boom_lower_max_MPa=r["groups"]["boom_lower"]["s11_max"]["value"] / 1e6,
                         buckle_pos=(r.get("buckling_factors_pos") or [None])[0], buckle_neg=(r.get("buckling_factors_neg") or [None])[0])
    ref = dict(
        source="computational/d520-wing/stress (Python 3, CalculiX 2.21); shell mesh r3 = %d S4/S3 elements" % R3["n_elems"],
        units="SI: m, N, Pa, kg (stresses also in MPa where the key says so)",
        geometry=geometry, section_points=pts,
        loads=dict(W_N=L["W_N"], wing_area=L["wing_area_check"], alpha_deg=L["lifting_line"]["alpha_deg"],
                   CL_alpha=L["lifting_line"]["CL_alpha"], CL_basic=L["lifting_line"]["CL_basic"],
                   y=L["y"], lift_per_m_1g=L["lift_per_m_1g"], schrenk_per_m_1g=L["schrenk_per_m_1g"],
                   M_root_lift_1g=L["M_root_lift_1g"], M_root_net_nonstructural_1g=L["M_root_net_1g"],
                   point_masses=L["point_masses"], nonstructural_mass_half=L["nonstructural_mass_half"]),
        zones=[dict(y0=z["y0"], y1=z["y1"], flange_area=z["flange_area"], flange_width=z["flange_width"],
                    flange_thickness=z["flange_thickness"]) for z in L["zones"]],
        sections=[section_props(y, L["zones"]) for y in (0.6, 1.1, 1.7, 2.2, 2.7, 3.1, 3.6, 4.0, 4.5)],
        beam=dict(M_at_fitting_1g=B["M_at_fitting"], tip_deflection_clamped_at_fitting_mm=B["beam_tip_deflection_1g"] * 1e3,
                  diagrams=dict(y=B["diagrams"]["y"], V=B["diagrams"]["V"], M=B["diagrams"]["M"]),
                  stations=[dict(y=s["y"], M=s["M"], beam_upper_MPa=s["beam_upper"] / 1e6, beam_lower_MPa=s["beam_lower"] / 1e6,
                                 fe_upper_MPa=s["fe_upper"] / 1e6, fe_lower_MPa=s["fe_lower"] / 1e6) for s in B["stations"]]),
        fe=dict(n_elems=R3["n_elems"], n_nodes=R3["n_nodes"], struct_mass_half=R3["struct_mass_half"],
                reaction_fz_1g=R3["reactions"]["NSUP"][2], tip_mm_1g=R3["tip_deflection_1g"] * 1e3,
                tip_twist_deg_1g=R3["tip_twist_deg_1g"], buckle_pos=R3.get("buckling_factors_pos")[:3],
                buckle_neg=R3.get("buckling_factors_neg")[:3], convergence=S["convergence"],
                components_MPa_per_g={g: {k: (v / 1e6 if "per_g" in k else v) for k, v in c.items()} for g, c in S["fe"]["components"].items()},
                sensitivity=sens),
        collapse=dict(stations=[dict(y=r["y"], M_per_g=r["M_per_g"],
                                     pos={k: r["pos"][k] for k in ("n_skin_buckle", "n_stringer_cripple", "n_boom_yield", "n_collapse", "M_max")},
                                     neg={k: r["neg"][k] for k in ("n_skin_buckle", "n_stringer_cripple", "n_boom_yield", "n_collapse", "M_max")})
                                for r in C["stations"]], summary=C["summary"]),
    )
    json.dump(ref, open(out, "w"), indent=1)
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "wing_lab_reference.json"))
