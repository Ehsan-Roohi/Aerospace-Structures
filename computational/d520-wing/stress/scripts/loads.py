"""Wing loads: span loading by Prandtl lifting line on the real planform, inertia relief,
shear / bending / torsion diagrams per g, and the spar-boom area law.

    python3 loads.py            -> data/loads.json, figures/loads_*.png
"""
import json, math, os
import numpy as np
from common import INPUTS, WING, ZONES, RIB_Y, chord, depth_at, zone_of, ROOT, save_inputs

V = lambda k: INPUTS[k]["value"]
B = 2 * WING.b2

def alpha0(y):
    return math.radians(V("alpha0_tip")) * WING.camber_blend(y)

def lifting_line(N=60):
    """Glauert solution, symmetric terms only. Returns y (half span), c*cl per unit CL (additional),
    c*cl basic (at zero wing CL), CL slope."""
    n = np.arange(1, 2 * N, 2)
    th = (np.arange(1, N + 1) - 0.5) * (math.pi / 2) / N          # 0 < th <= pi/2 (tip -> centre)
    y = (B / 2) * np.cos(th)
    c = np.array([chord(v) for v in y]); a0 = V("a0_section")
    mu = a0 * c / (4 * B)
    Amat = np.sin(np.outer(th, n)) * (mu[:, None] * n[None, :] + np.sin(th)[:, None])
    def solve(rhs_alpha):
        A = np.linalg.solve(Amat, mu * rhs_alpha * np.sin(th))
        ccl = 4 * B * (np.sin(np.outer(th, n)) @ A)
        CL = math.pi * (B * B / WING_AREA) * A[0]
        return ccl, CL
    ccl_a, CLa = solve(np.ones_like(th))                           # alpha = 1 rad everywhere
    ccl_b, CLb = solve(-np.array([alpha0(v) for v in y]))          # zero geometric alpha, camber only
    o = np.argsort(y)
    return y[o], ccl_a[o], ccl_b[o], CLa, CLb

ys_fine = np.linspace(0, WING.b2, 4001)
WING_AREA = 2 * np.trapezoid([chord(v) for v in ys_fine], ys_fine)

def span_loading(CL):
    y, ca, cb, CLa, CLb = lifting_line()
    alpha = (CL - CLb) / CLa
    ccl = alpha * ca + cb
    # normalise: lift per unit span for a total (both halves) lift of 1 N
    yy = np.concatenate([[0.0], y, [WING.b2]]); cc = np.concatenate([[ccl[0]], ccl, [0.0]])
    half = np.trapezoid(cc, yy)
    return yy, cc / (2 * half), dict(alpha_deg=math.degrees(alpha), CL_alpha=CLa, CL_basic=CLb)

def schrenk():
    yy = ys_fine
    c = np.array([chord(v) for v in yy])
    ell = 4 * WING_AREA / (math.pi * B) * np.sqrt(1 - (2 * yy / B) ** 2)
    s = 0.5 * (c + ell)
    return yy, s / (2 * np.trapezoid(s, yy))

def point_masses():
    """Non-structural masses on the starboard half wing: list of (name, mass kg, y, x/c)."""
    out = []
    m_fuel = V("tank_volume") * V("fuel_density")
    y0, y1 = V("tank_y"); k = 24
    for yy in np.linspace(y0, y1, k):
        out.append(("fuel", m_fuel / k, float(yy), 0.17))
    for gy in V("guns_y"):
        out.append(("gun", V("gun_mass"), gy, 0.30))
        out.append(("ammo", V("rounds_per_gun") * V("round_mass"), gy, 0.55))
    return out

def diagrams(line_load, y, masses=(), struct=None, xcp=0.25):
    """Shear V, bending M and torsion T (about the spar line) along the half span for a net
    upward line load (N/m) given on grid y plus point loads; per the sign convention lift +."""
    xs = V("spar_x_c")
    w = line_load.copy()
    tq = line_load * (xs - xcp) * np.array([chord(v) for v in y])       # nose-up torque per span
    if struct is not None:
        w = w - struct[0]; tq = tq - struct[1]
    Vv = np.zeros_like(y); M = np.zeros_like(y); T = np.zeros_like(y)
    # integrate from tip inwards (trapezoid)
    for i in range(len(y) - 2, -1, -1):
        dy = y[i + 1] - y[i]
        Vv[i] = Vv[i + 1] + 0.5 * (w[i] + w[i + 1]) * dy
        M[i] = M[i + 1] + 0.5 * (Vv[i] + Vv[i + 1]) * dy
        T[i] = T[i + 1] + 0.5 * (tq[i] + tq[i + 1]) * dy
    for name, F, yp, xc in masses:          # F: upward force (N), at y, x/c
        inb = y < yp
        Vv[inb] += F; M[inb] += F * (yp - y[inb]); T[inb] += F * (xs - xc) * chord(yp)
    return Vv, M, T

def main():
    W = V("mass_gross") * V("g")
    yy, l_unit, info = span_loading(V("CL_design"))
    ys, l_s = schrenk()
    y = ys_fine
    l = np.interp(y, yy, l_unit) * W            # N/m on each half, 1 g, total lift = W
    pm = point_masses()
    inertia_1g = [(nm, -m * V("g"), yp, xc) for nm, m, yp, xc in pm]
    V_l, M_l, T_l = diagrams(l, y)                               # lift only
    V_n, M_n, T_n = diagrams(l, y, inertia_1g)                   # lift - non-structural inertia
    # spar boom law, anchored to the Pl.1 root section
    xs = V("spar_x_c")
    h = np.array([depth_at(v, xs) for v in y])
    Mh = M_l / h
    A0 = V("flange_root_width") * V("flange_root_thickness")
    iref = np.searchsorted(y, V("fitting_y"))
    zones = []
    for k, (a, b) in enumerate(ZONES):
        i = np.searchsorted(y, max(a, V("fitting_y")))
        A = A0 * Mh[i] / Mh[iref]
        A = min(A, A0)
        bw = V("flange_root_width") * chord(a) / chord(0.0)
        zones.append(dict(zone=k, y0=a, y1=b, flange_area=A, flange_width=bw, flange_thickness=A / bw,
                          skin=V("t_skin")[k], web=V("t_spar_web")[k], false_spar=V("t_false_spar")[k],
                          stringer_t=V("stringer")["t"][k], depth_at_y0=float(depth_at(a, xs))))
    res = dict(W_N=W, wing_area_check=WING_AREA, lifting_line=info,
               y=y[::20].tolist(), lift_per_m_1g=l[::20].tolist(),
               schrenk_per_m_1g=(np.interp(y, ys, l_s) * W)[::20].tolist(),
               V_lift_1g=V_l[::20].tolist(), M_lift_1g=M_l[::20].tolist(), T_lift_1g=T_l[::20].tolist(),
               V_net_1g=V_n[::20].tolist(), M_net_1g=M_n[::20].tolist(), T_net_1g=T_n[::20].tolist(),
               point_masses=[dict(name=a, mass=b, y=c, x_c=d) for a, b, c, d in pm],
               nonstructural_mass_half=sum(p[1] for p in pm),
               M_root_lift_1g=float(np.interp(V("fitting_y"), y, M_l)),
               M_root_net_1g=float(np.interp(V("fitting_y"), y, M_n)),
               V_root_net_1g=float(np.interp(V("fitting_y"), y, V_n)),
               T_root_net_1g=float(np.interp(V("fitting_y"), y, T_n)),
               zones=zones)
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    json.dump(res, open(os.path.join(ROOT, "data", "loads.json"), "w"), indent=1)
    save_inputs()
    print("wing area %.3f  alpha %.2f deg  CLa %.3f/rad  CL_basic %.4f" % (WING_AREA, info["alpha_deg"], info["CL_alpha"], info["CL_basic"]))
    print("root (y=%.2f) 1g: M_lift %.1f kNm  M_net %.1f kNm  V_net %.2f kN  T_net %.2f kNm" % (
        V("fitting_y"), res["M_root_lift_1g"] / 1e3, res["M_root_net_1g"] / 1e3, res["V_root_net_1g"] / 1e3, res["T_root_net_1g"] / 1e3))
    print("nonstructural mass per half wing %.1f kg" % res["nonstructural_mass_half"])
    for z in zones:
        print("zone %d %.2f-%.2f  A=%.0f mm2  b=%.0f mm t=%.1f mm  h=%.3f" % (z["zone"], z["y0"], z["y1"], z["flange_area"] * 1e6,
              z["flange_width"] * 1e3, z["flange_thickness"] * 1e3, z["depth_at_y0"]))

if __name__ == "__main__":
    main()
