"""D.520 parametric geometry (pure numpy, no Blender dependency).

Every function reads its numbers from data/d520_params.json (sourced values) or from the
Pl.0 curves digitised in data/pl0_side_px.json and data/pl0_plan_px.json.
Model frame used here:  S = m aft of spinner tip, y = m to starboard, Z = m above the thrust axis.
Blender frame (see to_blender): X = y, Y = -S, Z = Z  (nose towards +Y).
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

PRM = json.load(open(os.path.join(DATA, "d520_params.json")))
def v(key):
    return PRM[key]["value"]

# ------------------------------------------------------------------ Pl.0 calibration
SIDE_PX_PER_M = 1037.0 / 8.76        # side view: rudder TE px 1999 .. spinner tip px 3036 = printed length
SIDE_S0_PX, SIDE_Z0_PX = 3035.0, 273.0   # spinner tip column, thrust-axis row (spinner centre)
PLAN_PX_PER_M_S = 1055.0 / 8.76      # plan view lengthwise: nose row 1745 .. rudder TE row 690
PLAN_PX_PER_M_Y = 1223.0 / 10.20     # plan view spanwise: tip to tip
PLAN_NOSE_PX, PLAN_CENTRE_PX = 1745.0, 976.5

def side_px_to_SZ(px, py):
    return (SIDE_S0_PX - px) / SIDE_PX_PER_M, (SIDE_Z0_PX - py) / SIDE_PX_PER_M

def plan_px_to_Sy(px, py):
    return (PLAN_NOSE_PX - py) / PLAN_PX_PER_M_S, (px - PLAN_CENTRE_PX) / PLAN_PX_PER_M_Y

SIDE = json.load(open(os.path.join(DATA, "pl0_side_px.json")))
PLAN = json.load(open(os.path.join(DATA, "pl0_plan_px.json")))

def _smooth_curve(S, Z, step=0.02, win=0.12):
    """Resample a digitised polyline on a regular S grid and smooth it with a moving average."""
    S = np.asarray(S, float); Z = np.asarray(Z, float)
    o = np.argsort(S); S, Z = S[o], Z[o]
    grid = np.arange(S.min(), S.max() + 1e-9, step)
    zi = np.interp(grid, S, Z)
    n = max(1, int(round(win / step)))
    if n > 1:
        k = np.ones(n) / n
        pad = np.pad(zi, (n // 2, n - 1 - n // 2), mode="edge")
        zi = np.convolve(pad, k, mode="valid")
    return grid, zi

# ------------------------------------------------------------------ fuselage curves
def _side_curve(name, pick=1):
    pts = SIDE[name]
    S, Z = [], []
    for p in pts:
        s, z = side_px_to_SZ(p[0], p[pick])
        S.append(s); Z.append(z)
    return np.array(S), np.array(Z)

class Fuselage:
    """Fuselage longitudinal laws (all SCALED from Pl.0 unless stated)."""
    def __init__(self):
        S, Z = _side_curve("bottom")
        o = np.argsort(S); S, Z = S[o], Z[o]
        # reject crossings of other lines (fillet, gear leg) : >2 cm from a running median
        med = np.array([np.median(Z[max(0, i - 8):i + 9]) for i in range(len(Z))])
        good = (np.abs(Z - med) < 0.02) | (S < 1.0)
        self.bot_S, self.bot_Z = _smooth_curve(S[good], Z[good], 0.02, 0.12)
        top = []
        for name in ("deck", "canopy_top", "cowl_top"):
            s, z = _side_curve(name); top += list(zip(s, z))
        top = np.array(sorted(top))
        self.sil_S, self.sil_Z = _smooth_curve(top[:, 0], top[:, 1], 0.02, 0.06)
        # plan half-width
        rows = PLAN["fuselage_edges"]
        S, W = [], []
        for r in rows:
            py, l, rr = r
            s, _ = plan_px_to_Sy(0, py)
            w = (rr - l) / 2.0 / PLAN_PX_PER_M_Y
            S.append(s); W.append(w)
        S = np.array(S); W = np.array(W)
        # aft of S=7.05 the tracked edge is captured by the tailplane leading edge; use
        # the rear-fuselage widths read row by row on the same Pl.0 plan view instead
        keep = S < 7.05
        S = np.concatenate([S[keep], [7.39, 7.52, 7.64, 7.77, 7.89, 8.14]])
        W = np.concatenate([W[keep], [0.204, 0.183, 0.163, 0.150, 0.146, 0.100]])
        o = np.argsort(S); S, W = S[o], W[o]
        # robust clean: reject points >7% away from a running median (tailplane / fillet / canopy lines)
        med = np.array([np.median(W[max(0, i - 6):i + 7]) for i in range(len(W))])
        good = (np.abs(W - med) < 0.07 * np.maximum(med, 0.1)) | (S > 7.05)
        self.w_S, self.w_W = _smooth_curve(S[good], W[good], 0.02, 0.14)
        self.S_nose = 0.55          # cowling front ring (spinner base), SCALED
        self.S_tail = 8.10          # rudder hinge / sternpost, DERIVED (LE 2.02 + 6.08)
        self.cs = v("canopy_stations")

    def z_bot(self, S):
        return np.interp(S, self.bot_S, self.bot_Z)

    def half_width(self, S):
        w = np.interp(S, self.w_S, self.w_W)
        # main frame width is printed (0.94 m): the plan tracing may not exceed it
        return np.clip(w, 0.06, v('main_frame_width') / 2)

    def z_sil_top(self, S):
        """Silhouette top (cowling, canopy, rear deck). Aft of the fin leading edge the deck
        slope is continued under the fin."""
        S = np.asarray(S, float)
        z = np.interp(S, self.sil_S, self.sil_Z)
        # canopy top line read point by point on the Pl.0 side view at 4x zoom (SCALED); the automatic
        # trace is noisy there because the frame lines cross it
        from scipy.interpolate import PchipInterpolator
        cp = PchipInterpolator([3.70, 3.83, 4.05, 4.27, 4.29, 4.86, 5.00, 5.20, 5.40, 5.60, 5.80, 5.95],
                               [float(np.interp(3.70, self.sil_S, self.sil_Z)), 0.505, 0.665, 0.790, 0.800, 0.800, 0.790,
                                0.765, 0.742, 0.720, float(np.interp(5.80, self.sil_S, self.sil_Z)), float(np.interp(5.95, self.sil_S, self.sil_Z))])
        z = np.where((S > 3.70) & (S < 5.95), cp(np.clip(S, 3.70, 5.95)), z)
        Sf = self.sil_S.max()
        slope = (np.interp(Sf, self.sil_S, self.sil_Z) - np.interp(Sf - 0.6, self.sil_S, self.sil_Z)) / 0.6
        return np.where(S > Sf, np.interp(Sf, self.sil_S, self.sil_Z) + slope * (S - Sf), z)

    def z_body_top(self, S):
        """Body top on the centreline: the Pl.0 silhouette, except under the canopy where the
        (hidden) body top is a smooth cubic Hermite bridge from the cowling line ahead of the
        windscreen to the rear deck behind the rear fairing (GUESS, keeps the skin crease-free)."""
        S = np.asarray(S, float)
        zt = self.z_sil_top(S)
        a, b = 3.65, 5.80
        za, zb = float(self.z_sil_top(a)), float(self.z_sil_top(b))
        ma = float(self.z_sil_top(a) - self.z_sil_top(a - 0.2)) / 0.2
        mb = float(self.z_sil_top(b + 0.2) - self.z_sil_top(b)) / 0.2
        t = np.clip((S - a) / (b - a), 0, 1); L = b - a
        h00 = 2 * t**3 - 3 * t**2 + 1; h10 = t**3 - 2 * t**2 + t; h01 = -2 * t**3 + 3 * t**2; h11 = t**3 - t**2
        bridge = h00 * za + h10 * L * ma + h01 * zb + h11 * L * mb
        return np.where((S > a) & (S < b), bridge, zt)

    def cap(self, S):
        """Canopy / rear-fairing cap: returns (z_sill, z_top, half_width_at_sill, active)."""
        cs = self.cs
        S = float(S)
        a, wr, hf, hr, re = cs["windscreen_front"], cs["windscreen_rear"], cs["hood_front"], cs["hood_rear"], cs["rear_fairing_end"]
        if S <= a or S >= re + 0.10:
            return None
        ztop = float(self.z_sil_top(S))
        zs = cs["sill_Z"]
        if S < wr:   # windscreen: sill rises to meet the cowling line at its front tip
            t = (S - a) / (wr - a)
            zs = float(self.z_sil_top(a)) * (1 - t) + cs["sill_Z"] * t
        wc = v("canopy_width") / 2
        if S < wr:
            wc *= 0.55 + 0.45 * (S - a) / (wr - a)
        if S > hr:   # rear fairing narrows to the deck
            t = (S - hr) / (re + 0.10 - hr)
            wc *= 1 - 0.55 * t
            zs = cs["sill_Z"] + (float(self.z_body_top(re + 0.10)) - 0.06 - cs["sill_Z"]) * t ** 1.5
        if ztop - zs < 0.01:
            return None
        return zs, ztop, wc

    def section(self, S, n_half=48, n_low=2.25, n_up=2.0, n_cap=2.4, with_cap=True):
        """Closed section ring (2*n_half points) at station S as (y, z) plus a per-point cap flag."""
        zb = float(self.z_bot(S)); zt = float(self.z_body_top(S)); w = float(self.half_width(S))
        frac = 0.41 if S > 1.2 else 0.41 + (0.5 - 0.41) * (1.2 - S) / (1.2 - 0.55)   # ovoid: widest at 41% height (Pl.0 front view)
        if S > 7.0:
            frac = 0.41 + 0.09 * (S - 7.0) / 1.1
        zw = zb + frac * (zt - zb)
        phis = np.linspace(-math.pi / 2, math.pi / 2, n_half + 1)   # bottom -> top, starboard side
        a_lo, b_lo, b_up = w, zw - zb, zt - zw
        c = np.abs(np.cos(phis)); s = np.abs(np.sin(phis))
        b = np.where(phis < 0, b_lo, b_up); nn = np.where(phis < 0, n_low, n_up)
        r_body = 1.0 / ((c / a_lo) ** nn + (s / b) ** nn + 1e-12) ** (1.0 / nn)
        r = r_body.copy(); flag = np.zeros_like(r, dtype=bool)
        cp = self.cap(S) if with_cap else None
        if cp is not None:
            zs, zc, wc = cp
            t = np.linspace(0, 2.0, 600)
            for i, ph in enumerate(phis):
                if ph <= 0: continue
                yy = t * math.cos(ph); zz = zw + t * math.sin(ph)
                inside = (zz >= zs) & ((np.abs(yy) / wc) ** n_cap + (np.clip(zz - zs, 0, None) / (zc - zs)) ** n_cap <= 1.0)
                if inside.any():
                    rc = t[np.where(inside)[0].max()]
                    if rc > r[i] + 0.002:
                        r[i] = rc; flag[i] = True
        y = r * np.cos(phis); z = zw + r * np.sin(phis)
        # full ring: starboard bottom->top, then port top->bottom (exclude duplicate poles)
        Y = np.concatenate([y, -y[-2:0:-1]]); Z = np.concatenate([z, z[-2:0:-1]])
        F = np.concatenate([flag, flag[-2:0:-1]])
        return Y, Z, F

    def body_halfwidth_at(self, S, z):
        Y, Z, _ = self.section(S, n_half=96, with_cap=False)
        n = len(Y) // 2 + 1
        y, zz = Y[:n], Z[:n]                     # starboard, bottom -> top
        k = np.argmax(zz)
        y, zz = y[:k + 1], zz[:k + 1]
        if z >= zz.max(): return 0.0
        return float(np.interp(z, zz, y)) if np.all(np.diff(zz) > -1e-9) else float(np.interp(z, np.maximum.accumulate(zz), y))

    def canopy_ring(self, S, n=61, n_cap=2.4, grow=0.0):
        """Canopy/rear-fairing arch at S, its base sitting on the body surface at the sill height."""
        cp = self.cap(S)
        if cp is None: return None
        zs, zt, _ = cp
        wc = max(0.01, self.body_halfwidth_at(S, zs) - 0.002)
        psi = np.linspace(math.pi, 0, n)
        c, s = np.cos(psi), np.sin(psi)
        y = (wc + grow) * np.sign(c) * np.abs(c) ** (2 / n_cap)
        z = zs + (zt - zs + grow) * np.abs(s) ** (2 / n_cap)
        return y, z

    def stations(self):
        cs = self.cs
        S = list(np.arange(self.S_nose, 1.2, 0.03)) + list(np.arange(1.2, 3.7, 0.06)) + \
            list(np.arange(3.7, 5.7, 0.025)) + list(np.arange(5.7, self.S_tail, 0.06)) + [self.S_tail]
        for k in ("windscreen_front", "windscreen_rear", "hood_front", "hood_rear", "rear_fairing_end"):
            S.append(cs[k])
        S = np.unique(np.round(np.array(S), 4))
        return S

# ------------------------------------------------------------------ airfoils
def naca_thickness(x, t):
    return 5 * t * (0.2969 * np.sqrt(np.clip(x, 0, 1)) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)

def naca230_camber(x):
    """NACA 230 mean line (design CL 0.3, max camber at 15%)."""
    m, k1 = 0.2025, 15.957
    yc = np.where(x < m, k1 / 6 * (x ** 3 - 3 * m * x ** 2 + m * m * (3 - m) * x), k1 / 6 * m ** 3 * (1 - x))
    return yc

def cosine_x(n):
    b = np.linspace(0, math.pi, n)
    return 0.5 * (1 - np.cos(b))

def airfoil_surfaces(x, t, camber_blend):
    yt = naca_thickness(x, t)
    yc = camber_blend * naca230_camber(x)
    return yc + yt, yc - yt, yc

# ------------------------------------------------------------------ wing
# Pl.1 front elevation (p68), thickness at ribs, scaled 396 px/m: (y [m], thickness [m])
WING_T_TABLE = [(0.0, 0.409), (0.51, 0.409), (0.70, 0.409), (0.86, 0.374), (1.01, 0.354), (1.17, 0.333), (1.33, 0.313),
                (1.50, 0.288), (1.66, 0.275), (1.88, 0.255), (2.07, 0.247), (2.31, 0.237), (2.54, 0.222), (2.78, 0.210),
                (3.01, 0.194), (3.25, 0.179), (3.49, 0.167), (3.72, 0.152), (3.96, 0.136), (4.20, 0.122), (4.44, 0.108), (4.68, 0.093)]

class Wing:
    def __init__(self):
        self.b2 = v("span") / 2
        self.c0 = v("chord_centreline"); self.ct = v("chord_tip"); self.yt = v("tip_cap_start_y")
        self.k = (self.c0 - self.ct) / self.yt
        self.a = v("taper_split_LE_fraction")
        self.S_LE0 = v("wing_LE_junction_S") - self.a * self.k * 0.66
        self.inc = math.radians(v("wing_incidence"))
        self.dih = math.tan(math.radians(v("dihedral_upper_outer")))
        self.zl0 = v("wing_root_lower_Z")
        ty = np.array(WING_T_TABLE)
        # smooth the scaled thickness law with a low-order fit outboard of rib 21
        self.t_y, self.t_v = ty[:, 0], ty[:, 1]
        self.zu_root = self.zl0 + 0.409   # at rib 22 / 21 (lower surface flat inboard of rib 21)

    def chord(self, y):
        y = abs(y)
        if y <= self.yt:
            return self.c0 - self.k * y
        eta = min(1.0, (y - self.yt) / (self.b2 - self.yt))
        return max(0.03, self.ct * math.sqrt(max(0.0, 1 - eta ** 2.2)))

    def S_LE(self, y):
        y = abs(y)
        if y <= self.yt:
            return self.S_LE0 + self.a * self.k * y
        eta = min(1.0, (y - self.yt) / (self.b2 - self.yt))
        mid_t = self.S_LE0 + self.a * self.k * self.yt + self.ct / 2
        mid = mid_t - 0.075 * eta ** 2          # Pl.0: tip-cap centre line moves 7.5 cm forward
        return mid - self.chord(y) / 2

    def thickness(self, y):
        y = abs(y)
        if y <= self.yt:
            return float(np.interp(y, self.t_y, self.t_v))
        eta = min(1.0, (y - self.yt) / (self.b2 - self.yt))
        tc = float(np.interp(self.yt, self.t_y, self.t_v)) / self.ct
        return tc * self.chord(y) * (1 - 0.35 * eta)

    def z_upper(self, y):
        """Upper-surface reference line (max-thickness points). Root to rib 16: slope -0.0046
        (Pl.1, sign from the drawing); outboard of rib 16: printed dihedral 3°55'30"."""
        y = abs(y)
        y16 = 1.50
        if y <= y16:
            return self.zu_root - 0.0046 * max(0.0, y - 0.51)
        return self.zu_root - 0.0046 * (y16 - 0.51) + self.dih * (y - y16)

    def camber_blend(self, y):
        return float(np.clip((abs(y) - 0.70) / (self.yt - 0.70), 0, 1))

    def section(self, y, x):
        """3-D points (S, y, Z) of upper and lower surfaces for chord fractions x."""
        c = self.chord(y); t = self.thickness(y); tc = t / c
        up, lo, yc = airfoil_surfaces(x, tc, self.camber_blend(y))
        S_le = self.S_LE(y)
        zu = self.z_upper(y)
        # place: mid-thickness at x=0.3 sits at zu - t/2
        up30, lo30, _ = airfoil_surfaces(np.array([0.3]), tc, self.camber_blend(y))
        z_mid30 = zu - t / 2
        z_chord30 = z_mid30 - (up30[0] + lo30[0]) / 2 * c
        def place(xx, zz):
            # chord frame -> model, incidence about x=0.3c
            dx = (xx - 0.3) * c; dz = zz * c
            ca, sa = math.cos(self.inc), math.sin(self.inc)
            S = S_le + 0.3 * c + dx * ca + dz * sa * 0     # incidence: LE up => S unchanged to 1st order
            Z = z_chord30 + dz - dx * sa
            return S, Z
        Su, Zu = place(x, up); Sl, Zl = place(x, lo)
        return (Su, Zu), (Sl, Zl), c

    def stations(self):
        ys = [0.0, 0.15, 0.30, 0.40, 0.47, 0.51, 0.595, 0.70]
        fl0 = v("flap_centre_y") - v("flap_span") / 2; fl1 = v("flap_centre_y") + v("flap_span") / 2
        ai0 = v("aileron_centre_y") - v("aileron_span") / 2; ai1 = v("aileron_centre_y") + v("aileron_span") / 2
        ys += list(np.arange(0.75, 4.69, 0.07))
        ys += [fl0, fl1, ai0, ai1, 1.50, self.yt, v("gun_inner_y"), v("gun_outer_y")]
        eta = np.linspace(0, 1, 16)[1:]
        ys += list(self.yt + (self.b2 - self.yt) * (1 - (1 - eta) ** 1.6))
        ys = np.unique(np.round(np.array(ys), 4))
        return ys[(ys >= 0) & (ys <= self.b2)]

# ------------------------------------------------------------------ tail
class Tail:
    def __init__(self):
        self.fus = None
        # tailplane outline from Pl.0 plan (left half), spanwise scaled to the printed 3.54 m
        rows = PLAN["tail_left"]
        yspan, le, te = [], [], []
        for x, rr in rows:
            s_vals = [plan_px_to_Sy(x, py)[0] for py in rr]
            y = abs(plan_px_to_Sy(x, 0)[1])
            yspan.append(y); le.append(min(s_vals)); te.append(max(s_vals))
        yspan = np.array(yspan); le = np.array(le); te = np.array(te)
        o = np.argsort(yspan); yspan, le, te = yspan[o], le[o], te[o]
        drawn_half = yspan.max()
        self.tp_scale = (v("tailplane_span") / 2) / drawn_half
        self.tp_y = yspan * self.tp_scale; self.tp_le = le; self.tp_te = te
        # shift chordwise so the hinge sits at LE_junction + 5.88 (printed)
        self.hinge_S = v("wing_LE_junction_S") + v("elevator_hinge_from_LE")
        self.tp_Z = v("tailplane_Z")
        # fin / rudder outline from Pl.0 side
        fin = SIDE["fin_top"]
        S, Z = zip(*[side_px_to_SZ(p[0], p[1]) for p in fin])
        self.fin_top_S = np.array(S); self.fin_top_Z = np.array(Z)
        rb = SIDE["rudder_bottom"]
        S2, Z2 = zip(*[side_px_to_SZ(p[0], p[1]) for p in rb])
        self.rud_bot_S = np.array(S2); self.rud_bot_Z = np.array(Z2)
        self.rudder_hinge_S = v("wing_LE_junction_S") + v("rudder_hinge_from_LE")
        self.horn_Z = side_px_to_SZ(0, 128)[1]
        self.horn_S = side_px_to_SZ(2088, 0)[0]

    def tailplane_chord(self, y):
        y = abs(y)
        le = float(np.interp(y, self.tp_y, self.tp_le)); te = float(np.interp(y, self.tp_y, self.tp_te))
        return le, te

# ------------------------------------------------------------------ landing gear solve
def solve_gear(d_off=0.10):
    """Main gear geometry (all in the y-z plane, the pivot axis being fore-aft, PRINTED p21).
    Static (loaded) wheel centre: y = track/2 (PRINTED 2.88), z from prop-axis height 1.845 (PRINTED)
    minus a 6 % tyre deflection (GUESS).  Retracted wheel centre: y = 0.30 (SCALED, Pl.0 plan),
    lying flat with its outer face flush with the wing lower surface (Pl.30).  The oleo retracts
    fully extended: static compression = remaining travel 0.15 m (PRINTED p13 note).
    The wheel sits d_off (GUESS) inboard of the leg on a stub axle (Pl.30)."""
    track = v("track"); r = v("wheel_diameter") / 2; ext = 0.15
    tw = v("tyre_width")
    yw_s = track / 2; zw_s = -v("prop_axis_height_flight_line") + r * 0.94
    yw_r = 0.30; zw_r = v("wing_root_lower_Z") + tw / 2
    yE, zE = yw_s + d_off, zw_s                        # static leg end
    best = None
    for a in np.linspace(0.0, 0.35, 3501):
        sa, ca = math.sin(a), math.cos(a)
        # eq1: Ls*sa + (Ls+ext)*ca = yE - yw_r ;  -> Ls
        Ls = (yE - yw_r - ext * ca) / (sa + ca)
        Le = Ls + ext
        res = (zE + Ls * ca - Le * sa + d_off) - zw_r
        if best is None or abs(res) < abs(best[0]): best = (res, a, Ls, Le)
    res, a, Ls, Le = best
    y_p = yE - Ls * math.sin(a); z_p = zE + Ls * math.cos(a)
    return dict(L_static=Ls, L_extended=Le, splay=a, pivot_y=y_p, pivot_Z=z_p, leg_end_y=yE, axle_Z=zw_s,
                wheel_y=yw_s, wheel_r=r, d_off=d_off, retracted_y=yw_r, retracted_Z=zw_r, oleo_static_compression=ext, residual=res)

def rest_attitude(axle_S):
    """Nose-up angle at rest from the printed prop-axis heights (1.845 -> 2.265 m)."""
    h0 = v("prop_axis_height_flight_line"); h1 = v("prop_axis_height_rest")
    u = axle_S - v("prop_plane_S")
    R = math.hypot(h0, u); phi = math.atan2(u, h0)
    return math.acos(h1 / R) * -1 + phi if False else phi - math.acos(h1 / R)

def to_blender(S, y, Z):
    return (y, -S, Z)

if __name__ == "__main__":
    f = Fuselage(); w = Wing(); t = Tail()
    print("fuselage S range", f.S_nose, f.S_tail, "max half width", f.w_W.max())
    for S in [0.6, 1.0, 2.0, 3.0, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0]:
        print(f"S={S:4.1f} zb={float(f.z_bot(S)):+.3f} zt={float(f.z_body_top(S)):+.3f} sil={float(f.z_sil_top(S)):+.3f} w={float(f.half_width(S)):.3f} cap={f.cap(S)}")
    for y in [0, 0.66, 1.5, 3.0, 4.687, 5.0]:
        print(f"y={y:4.2f} c={w.chord(y):.3f} S_LE={w.S_LE(y):.3f} t={w.thickness(y):.3f} t/c={w.thickness(y)/w.chord(y):.3f} zu={w.z_upper(y):+.3f}")
    g = solve_gear(); print("gear", {k: round(x, 4) for k, x in g.items()})
    print("rest attitude deg", math.degrees(rest_attitude(v("main_axle_S"))))
    print("tail: hinge S", t.hinge_S, "rudder hinge", t.rudder_hinge_S, "tp scale", t.tp_scale, "horn Z", t.horn_Z)
