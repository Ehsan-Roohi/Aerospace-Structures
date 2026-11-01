"""axi_c1.py -- independent Python twin of axisymmetric-cavity-c1.js (research cross-check).

Axisymmetric Riabouchinsky disk cavity, disk radius R=1 at x=0, image disk at x=L, free surface
rim -> image rim, liquid on the left of the meridian direction (axis -> rim -> image rim -> axis).

Formulation (identical to the JavaScript module, implemented independently):
  * free-surface nodes: reference curve with the sharp-edge exponent, displaced along reference
    normals by unknowns d_1..d_{Nc/2} (mirror symmetric); nodes clustered by cosine in reference
    arclength, so node k sits at the graded parameter tau_k = pi k / Nc;
  * geometry between nodes: C1 cubic Hermite in tau with fourth-order slopes (parity extension
    x odd / r even about each rim, zero slope at the rims); the two rim panels use the exact
    parity form x = B w^3 + E w^5, r - 1 = A w^2 + C w^4; faces are exact (r = sin phi);
  * sheet strength: C2 cubic spline per piece in the piece parameter (phi on the faces: natural at
    the axis, not-a-knot at the rim; tau on the free surface: zero slope at rim and mid-plane);
  * Neumann condition in weighted least squares at mColl Gauss points per panel (arclength weights);
  * dynamic rows -gamma_k = qc at cavity nodes 0..Nc/2, Newton on (d, qc) with a finite-difference
    Jacobian obtained from FULL re-assembly and re-solve (deliberately not the incremental scheme).
Kernels: scipy elliptic integrals (not the AGM), tangent-line subtraction parametrized by the true
arclength of the panel with a cubic density proxy (value/slope at the foot, two far values).
Quadrature: Gauss-Legendre with u^2 clustering toward the foot, different point counts from the JS.
"""
import json, sys, time
import numpy as np
from scipy.special import ellipkm1, ellipe
from scipy.interpolate import CubicSpline

PI = np.pi
_GL = {}
def gl(n):
    if n not in _GL:
        _GL[n] = np.polynomial.legendre.leggauss(n)
    return _GL[n]

# ----------------------------------------------------------------------------- elliptic
def KE(q):
    """K(m), E(m) with q = 1 - m (arrays)."""
    q = np.clip(q, 1e-300, 1.0)
    return ellipkm1(q), ellipe(1.0 - q)

def Em1(q, E):
    q = np.asarray(q, float); E = np.asarray(E, float)
    out = E - 1.0
    small = q < 2e-3
    if np.any(small):
        qs = q[small]; Lg = np.log(4.0 / np.sqrt(qs))
        out[small] = qs * (0.5 * (Lg - 0.5) + qs * (3 / 16 * (Lg - 13 / 12) + qs * (15 / 128 * (Lg - 1.2) + qs * 175 / 2048 * (Lg - 1051 / 840))))
    return out

def ring_kernel(x, r, xs, rs):
    dx = x - xs; D = dx * dx + (r + rs) ** 2; B = dx * dx + (r - rs) ** 2
    K, E = KE(B / D); sd = np.sqrt(D)
    rsafe = np.where(r > 0, r, 1.0)
    ux = (K + (rs * rs - r * r - dx * dx) * E / B) / (2 * PI * sd)
    ur = dx * (-K + (rs * rs + r * r + dx * dx) * E / B) / (2 * PI * rsafe * sd)
    axis = rs * rs / (2 * (dx * dx + rs * rs) ** 1.5)
    return np.where(r > 0, ux, axis), np.where(r > 0, ur, 0.0)

def ring_minus_planar(x, r, xs, rs, dx, dr):
    """ring kernel minus (-dr, dx)/(2 pi rho^2), cancellation free; dx, dr supplied accurately."""
    B = dx * dx + dr * dr; S = r + rs; D = dx * dx + S * S; q = B / D
    K, E = KE(q); sd = np.sqrt(D); em1 = Em1(q, E)
    sdmS = dx * dx / (sd + S)
    one_minus = -em1 + E * sdmS / sd
    ux = (K / sd - dx * dx * E / (B * sd) + dr / B * one_minus) / (2 * PI)
    g = sd / r - 2 * rs / sd; h = (-rs * dr + dx * dx * (sd + rs) / (sd + S)) / (r * sd)
    ur = dx / (2 * PI) * (-K / (r * sd) + (g * em1 + h) / B)
    return ux, ur

def planar_monomials(X, Y, L, side):
    on = abs(Y) <= 1e-12 * L and 0 < X < L
    if on: Y = 0.0
    beta = np.arctan2(Y * L, X * (X - L) + Y * Y)
    if on: beta = side * PI
    I = [0.5 * np.log(max(X * X + Y * Y, 1e-300) / max((X - L) ** 2 + Y * Y, 1e-300))]; J = [beta]
    Lm = 1.0
    for m in range(1, 4):
        Lm *= L; I.append(X * I[m - 1] - Lm / m + Y * J[m - 1]); J.append(X * J[m - 1] - Y * I[m - 1])
    return np.array(I), np.array(J)

# ----------------------------------------------------------------------------- Hermite basis
def Hb(z):
    z = np.asarray(z, float); z2 = z * z; z3 = z2 * z
    return np.array([1 - 3 * z2 + 2 * z3, z - 2 * z2 + z3, 3 * z2 - 2 * z3, -z2 + z3])
def dHb(z):
    z = np.asarray(z, float); z2 = z * z
    return np.array([-6 * z + 6 * z2, 1 - 4 * z + 3 * z2, 6 * z - 6 * z2, -2 * z + 3 * z2])

# ----------------------------------------------------------------------------- reference geometry
def reference_curve(L, Rm, n=40001):
    v = np.arange(n) / (n - 1); x = L * (1 - np.cos(PI * v)) / 2
    r = 1 + (Rm - 1) * np.maximum(0, 4 * x * (L - x) / L ** 2) ** (2 / 3)
    s = np.r_[0, np.cumsum(np.hypot(np.diff(x), np.diff(r)))]
    tx = np.gradient(x, s); tr = np.gradient(r, s); tn = np.hypot(tx, tr)
    nx = -tr / tn; nr = tx / tn; nx[0], nr[0], nx[-1], nr[-1] = -1, 0, 1, 0
    return s / s[-1], x, r, nx, nr

class Setup:
    def __init__(self, L=8.0, Nc=32, Nf=None, Rm=1.95, mColl=3, nNear=24, nFar=10):
        Nf = Nc // 2 if Nf is None else Nf
        self.L, self.Nc, self.Nf, self.Rm, self.mColl, self.nNear, self.nFar = L, Nc, Nf, Rm, mColl, nNear, nFar
        self.N = 2 * Nf + Nc; self.h = Nf + Nc // 2
        u, x, r, nx, nr = reference_curve(L, Rm)
        uk = (1 - np.cos(PI * np.arange(Nc + 1) / Nc)) / 2
        cx = np.interp(uk, u, x); cr = np.interp(uk, u, r); cnx = np.interp(uk, u, nx); cnr = np.interp(uk, u, nr)
        nrm = np.c_[cnx, cnr] / np.hypot(cnx, cnr)[:, None]
        cxs = 0.5 * (cx + (L - cx[::-1])); crs = 0.5 * (cr + cr[::-1]); cxs[0], crs[0], cxs[-1], crs[-1] = 0, 1, L, 1
        self.cav = np.c_[cxs, crs]
        for k in range(Nc // 2 + 1, Nc + 1): nrm[k] = [-nrm[Nc - k, 0], nrm[Nc - k, 1]]
        nrm[Nc // 2] = [0.0, 1.0]; self.normal = nrm
        self.front = np.c_[np.zeros(Nf + 1), np.sin(0.5 * PI * np.arange(Nf + 1) / Nf)]
        # spline slope operators (per unit node index) from scipy CubicSpline on identity columns
        self.Dface = spline_operator(Nf, ('natural', 'not-a-knot'))
        self.Dcav = spline_operator(Nc // 2, ((1, 0.0), (1, 0.0)))
        # per-panel slope rows (global N+1 vectors) and their symmetric folds
        rowA = np.zeros((self.N, self.N + 1)); rowB = np.zeros((self.N, self.N + 1))
        for j in range(self.N):
            for side, row in ((0, rowA), (1, rowB)):
                g = j + side
                if j < Nf: row[j, :Nf + 1] = self.Dface[g]
                elif j < Nf + Nc:
                    k = g - Nf
                    if k <= Nc // 2: row[j, Nf:Nf + Nc // 2 + 1] = self.Dcav[k]
                    else: row[j, Nf:Nf + Nc // 2 + 1] = -self.Dcav[Nc - k]
                else:
                    k = g - Nf - Nc; row[j, :Nf + 1] = -self.Dface[Nf - k]
        self.rowA, self.rowB = rowA, rowB
        self.fold = np.zeros((self.N + 1, self.h))          # gamma = fold @ half  (gamma_0 = 0, mirror)
        for g in range(1, self.N):
            k = g if g <= self.h else self.N - g
            self.fold[g, k - 1] = 1.0
        self.fA = rowA @ self.fold; self.fB = rowB @ self.fold

def spline_operator(n, bc):
    D = np.zeros((n + 1, n + 1)); k = np.arange(n + 1, dtype=float)
    for g in range(n + 1):
        e = np.zeros(n + 1); e[g] = 1.0
        D[:, g] = CubicSpline(k, e, bc_type=bc).derivative()(k)
    return D

def nodes_from(s, z):
    d = np.zeros(s.Nc + 1); d[1:s.Nc // 2 + 1] = z[:-1]; d[s.Nc // 2:] = d[s.Nc // 2::-1]
    cav = s.cav + d[:, None] * s.normal; cav[0] = [0, 1]; cav[-1] = [s.L, 1]
    back = np.c_[np.full(s.Nf + 1, s.L), s.front[::-1, 1]]
    return np.r_[s.front, cav[1:-1], back]

# ----------------------------------------------------------------------------- panels
class Panel:
    def __init__(self, j, a, b, pos, der, diff, graded):
        self.index, self.a, self.b, self.pos, self.der, self.diff, self.graded = j, a, b, pos, der, diff, graded
        d = b - a; self.Lc = float(np.hypot(*d)); self.t = d / self.Lc; self.n = np.array([-self.t[1], self.t[0]])

def build_panels(s, nodes):
    Nf, Nc, N, L = s.Nf, s.Nc, s.N, s.L; dphi = 0.5 * PI / Nf
    cav = nodes[Nf:Nf + Nc + 1]
    def ext(k):
        if k < 0: return np.array([-cav[-k, 0], cav[-k, 1]])
        if k > Nc: return np.array([2 * L - cav[2 * Nc - k, 0], cav[2 * Nc - k, 1]])
        return cav[k]
    m = np.array([(ext(k - 2) - 8 * ext(k - 1) + 8 * ext(k + 1) - ext(k + 2)) / 12 for k in range(Nc + 1)])
    m[0] = 0; m[Nc] = 0
    panels = []
    for j in range(N):
        a, b = nodes[j], nodes[j + 1]; graded = -1
        if j < Nf:
            p0 = j * dphi
            pos = lambda z, p0=p0: np.c_[np.zeros_like(z), np.sin(p0 + z * dphi)]
            der = lambda z, p0=p0: np.c_[np.zeros_like(z), dphi * np.cos(p0 + z * dphi)]
            diff = lambda z, zs, p0=p0: np.c_[np.zeros_like(z), 2 * np.cos(p0 + 0.5 * (z + zs) * dphi) * np.sin(0.5 * (z - zs) * dphi)]
            if j == Nf - 1: graded = 1
        elif j < Nf + Nc:
            k = j - Nf
            if k == 0 or k == Nc - 1:
                front = k == 0; n1 = cav[1] if front else cav[Nc - 1]; m1 = m[1] if front else m[Nc - 1]
                x1 = n1[0] if front else L - n1[0]; mx = m1[0]; r1 = n1[1]; mr = m1[1] if front else -m1[1]
                E = (mx - 3 * x1) / 2; B = x1 - E; Cc = (mr - 2 * (r1 - 1)) / 2; A = r1 - 1 - Cc
                px = lambda w: w ** 3 * (B + E * w * w); dpx = lambda w: w * w * (3 * B + 5 * E * w * w)
                pr = lambda w: 1 + w * w * (A + Cc * w * w); dpr = lambda w: w * (2 * A + 4 * Cc * w * w)
                dpxw = lambda w, ws: (w - ws) * (B * (w * w + w * ws + ws * ws) + E * (w ** 4 + w ** 3 * ws + w * w * ws * ws + w * ws ** 3 + ws ** 4))
                dprw = lambda w, ws: (w - ws) * (A * (w + ws) + Cc * (w ** 3 + w * w * ws + w * ws * ws + ws ** 3))
                if front:
                    pos = lambda z: np.c_[px(z), pr(z)]; der = lambda z: np.c_[dpx(z), dpr(z)]
                    diff = lambda z, zs: np.c_[dpxw(z, zs), dprw(z, zs)]; graded = 0
                else:
                    pos = lambda z: np.c_[L - px(1 - z), pr(1 - z)]; der = lambda z: np.c_[dpx(1 - z), -dpr(1 - z)]
                    diff = lambda z, zs: np.c_[-dpxw(1 - z, 1 - zs), dprw(1 - z, 1 - zs)]; graded = 1
            else:
                za, zb, ma, mb = cav[k], cav[k + 1], m[k], m[k + 1]
                c1 = ma; c2 = -3 * za - 2 * ma + 3 * zb - mb; c3 = 2 * za + ma - 2 * zb + mb
                pos = lambda z, za=za, zb=zb, ma=ma, mb=mb: (Hb(z).T @ np.array([za, ma, zb, mb]))
                der = lambda z, za=za, zb=zb, ma=ma, mb=mb: (dHb(z).T @ np.array([za, ma, zb, mb]))
                diff = lambda z, zs, c1=c1, c2=c2, c3=c3: ((z - zs)[:, None] * (c1[None, :] + c2[None, :] * (z + zs)[:, None] + c3[None, :] * (z * z + z * zs + zs * zs)[:, None]))
        else:
            k = j - Nf - Nc; p0 = (Nf - k) * dphi
            pos = lambda z, p0=p0: np.c_[np.full_like(z, L), np.sin(p0 - z * dphi)]
            der = lambda z, p0=p0: np.c_[np.zeros_like(z), -dphi * np.cos(p0 - z * dphi)]
            diff = lambda z, zs, p0=p0: np.c_[np.zeros_like(z), -2 * np.cos(p0 - 0.5 * (z + zs) * dphi) * np.sin(0.5 * (z - zs) * dphi)]
            if k == 0: graded = 0
        panels.append(Panel(j, a, b, pos, der, diff, graded))
    return panels

# ----------------------------------------------------------------------------- influence
def nearest_parameter(pan, P):
    zz = np.linspace(0, 1, 41); Q = pan.pos(zz); d2 = ((Q - P) ** 2).sum(1); kb = int(np.argmin(d2))
    lo, hi = max(0.0, zz[max(kb - 1, 0)]), min(1.0, zz[min(kb + 1, 40)])
    g = lambda z: float(((pan.pos(np.array([z]))[0] - P) ** 2).sum())
    gr = (np.sqrt(5) - 1) / 2; c = hi - gr * (hi - lo); d = lo + gr * (hi - lo); gc, gd = g(c), g(d)
    for _ in range(50):
        if gc < gd: hi, d, gd = d, c, gc; c = hi - gr * (hi - lo); gc = g(c)
        else: lo, c, gc = c, d, gd; d = lo + gr * (hi - lo); gd = g(d)
    return 0.5 * (lo + hi)

def arclength(pan, za, zb, n=8):
    x, w = gl(n); z = za + (zb - za) * (x + 1) / 2
    return float((zb - za) / 2 * (w * np.hypot(*pan.der(z).T)).sum())

def influence(pan, P, where, nNear, nFar):
    """[4,2] velocities of the unit Hermite densities of the panel at P."""
    P = np.asarray(P, float); out = np.zeros((4, 2))
    self_panel = where is not None and where['panel'] == pan.index
    if self_panel:
        zs = where['zeta']; sub = True; side = where.get('side', 1)
    else:
        rel = P - pan.a; X = rel @ pan.t; Y = rel @ pan.n; f = min(max(X, 0.0), pan.Lc); dist = np.hypot(X - f, Y)
        if dist >= 3 * pan.Lc:
            x, w = gl(nFar); z = (x + 1) / 2; Q = pan.pos(z); J = np.hypot(*pan.der(z).T)
            kx, kr = ring_kernel(P[0], P[1], Q[:, 0], Q[:, 1]); hz = Hb(z)
            out[:, 0] = (hz * (w / 2 * J * kx)).sum(1); out[:, 1] = (hz * (w / 2 * J * kr)).sum(1)
            return out
        zs = nearest_parameter(pan, P); side = 1
        sub = P[1] > 0 and dist < 0.5 * P[1] and float(np.hypot(*pan.der(np.array([zs]))[0])) > 0.1 * pan.Lc
    x, w = gl(nNear); u = (x + 1) / 2
    if not sub:
        for hi in (0.0, 1.0):
            span = hi - zs
            if abs(span) < 1e-15: continue
            z = zs + span * u ** 3; wz = abs(span) * 1.5 * u * u * w; Q = pan.pos(z); J = np.hypot(*pan.der(z).T)
            kx, kr = ring_kernel(P[0], P[1], Q[:, 0], Q[:, 1]); hz = Hb(z)
            out[:, 0] += (hz * (wz * J * kx)).sum(1); out[:, 1] += (hz * (wz * J * kr)).sum(1)
        return out
    Qs = pan.pos(np.array([zs]))[0]; dQ = pan.der(np.array([zs]))[0]; Js = float(np.hypot(*dQ)); tt = dQ / Js; nn = np.array([-tt[1], tt[0]])
    zn, wn, sg = [], [], []; sig = {0.0: 0.0, 1.0: 0.0}
    for hi in (0.0, 1.0):
        span = hi - zs
        if abs(span) < 1e-15: continue
        z = zs + span * u ** 3; wz = abs(span) * 1.5 * u * u * w
        zprev, sprev = zs, 0.0; ss = []
        for zk in z:
            sprev += arclength(pan, zprev, zk); zprev = zk; ss.append(sprev)
        sig[hi] = sprev + arclength(pan, zprev, hi)
        zn.append(z); wn.append(wz); sg.append(np.array(ss))
    zn = np.concatenate(zn); wn = np.concatenate(wn); sg = np.concatenate(sg)
    sig0, sig1 = sig[0.0], sig[1.0]; Ltot = sig1 - sig0
    hz0 = Hb(zs); dh0 = dHb(zs)
    sa, za_, sb, zb_ = sig0, 0.0, sig1, 1.0
    if abs(sa) < 0.02 * Ltot: za_ = 0.5; sa = arclength(pan, zs, 0.5) if zs < 0.5 else -arclength(pan, 0.5, zs)
    if abs(sb) < 0.02 * Ltot: zb_ = 0.5; sb = arclength(pan, zs, 0.5) if zs < 0.5 else -arclength(pan, 0.5, zs)
    ha, hb = Hb(za_), Hb(zb_); det = sa * sa * sb * sb * (sb - sa)
    c0 = hz0; c1 = dh0 / Js; ra = ha - c0 - c1 * sa; rb = hb - c0 - c1 * sb
    c2 = (ra * sb ** 3 - rb * sa ** 3) / det; c3 = (sa * sa * rb - sb * sb * ra) / det
    coef = np.c_[c0, c1, c2, c3]                       # [4,4]
    Q = pan.pos(zn); J = np.hypot(*pan.der(zn).T); e0 = P - Qs
    dd = pan.diff(zn, zs); dx = e0[0] - dd[:, 0]; dr = e0[1] - dd[:, 1]
    rmx, rmr = ring_minus_planar(P[0], P[1], Q[:, 0], Q[:, 1], dx, dr)
    rho2 = dx * dx + dr * dr; pqx = -dr / (2 * PI * rho2); pqr = dx / (2 * PI * rho2)
    tx = e0[0] - tt[0] * sg; tr = e0[1] - tt[1] * sg; rt2 = tx * tx + tr * tr; ptx = -tr / (2 * PI * rt2); ptr = tx / (2 * PI * rt2)
    hz = Hb(zn)                                                        # [4, n]
    gt = coef[:, 0:1] + sg[None, :] * (coef[:, 1:2] + sg[None, :] * (coef[:, 2:3] + sg[None, :] * coef[:, 3:4]))
    out[:, 0] = (wn * J * ((rmx + pqx) * hz - ptx * gt)).sum(1)
    out[:, 1] = (wn * J * ((rmr + pqr) * hz - ptr * gt)).sum(1)
    X = e0 @ tt - sig0; Y = 0.0 if self_panel else float(e0 @ nn)
    I, Jm = planar_monomials(X, Y, Ltot, side)
    s0 = sig0
    d0 = coef[:, 0] + s0 * (coef[:, 1] + s0 * (coef[:, 2] + s0 * coef[:, 3])); d1 = coef[:, 1] + s0 * (2 * coef[:, 2] + 3 * s0 * coef[:, 3])
    d2 = coef[:, 2] + 3 * coef[:, 3] * s0; d3 = coef[:, 3]
    uu = -(d0 * Jm[0] + d1 * Jm[1] + d2 * Jm[2] + d3 * Jm[3]) / (2 * PI); vv = (d0 * I[0] + d1 * I[1] + d2 * I[2] + d3 * I[3]) / (2 * PI)
    out[:, 0] += uu * tt[0] + vv * nn[0]; out[:, 1] += uu * tt[1] + vv * nn[1]
    return out

# ----------------------------------------------------------------------------- Neumann least squares
def collocation(s, panels):
    x, w = gl(s.mColl); rows = []
    for j in range(s.h):
        for k in range(s.mColl):
            z = (x[k] + 1) / 2; P = panels[j].pos(np.array([z]))[0]; d = panels[j].der(np.array([z]))[0]; J = np.hypot(*d); t = d / J
            rows.append(dict(panel=j, zeta=z, P=P, n=np.array([-t[1], t[0]]), w=0.5 * w[k] * J))
    return rows

def hermite_coeffs(s, gam, j):
    return np.array([gam[j], s.rowA[j] @ gam, gam[j + 1], s.rowB[j] @ gam])

def neumann(s, nodes):
    panels = build_panels(s, nodes); rows = collocation(s, panels)
    F = np.zeros((len(rows), s.h)); b = np.zeros(len(rows)); wts = np.zeros(len(rows))
    for i, row in enumerate(rows):
        wh = dict(panel=row['panel'], zeta=row['zeta'], side=1)
        for pan in panels:
            inf = influence(pan, row['P'], wh, s.nNear, s.nFar); c = inf @ row['n']
            j = pan.index
            if 1 <= j <= s.h: F[i, j - 1] += c[0]
            elif j > s.h and j < s.N: F[i, s.N - j - 1] += c[0]
            g = j + 1
            if 1 <= g <= s.h: F[i, g - 1] += c[2]
            elif s.h < g < s.N: F[i, s.N - g - 1] += c[2]
            F[i] += c[1] * s.fA[j] + c[3] * s.fB[j]
        b[i] = -row['n'][0]; wts[i] = row['w']
    sw = np.sqrt(wts)
    half = np.linalg.lstsq(F * sw[:, None], b * sw, rcond=None)[0]
    gam = s.fold @ half
    res = F @ half - b
    return dict(panels=panels, rows=rows, F=F, b=b, w=wts, half=half, gam=gam, nodes=nodes,
                collocMax=float(np.max(np.abs(res))), collocRms=float(np.sqrt((wts * res * res).sum() / wts.sum())))

def dynamic(s, gam, qc):
    return -gam[s.Nf:s.Nf + s.Nc // 2 + 1] - qc

def residual(s, z):
    st = neumann(s, nodes_from(s, z)); st['R'] = dynamic(s, st['gam'], z[-1]); return st

def newton(s, z, tol=1e-10, maxit=20, verbose=True):
    hist = []
    for it in range(maxit):
        st = residual(s, z); R = st['R']; nr = float(np.max(np.abs(R))); hist.append(nr)
        if verbose: print(f'  newton {it}: |R|={nr:.3e} qc={z[-1]:.9f} sigma={z[-1]**2-1:.9f}', file=sys.stderr, flush=True)
        if nr <= tol: break
        m = len(z); J = np.zeros((len(R), m)); dz = 1e-7
        for k in range(m - 1):
            zz = z.copy(); zz[k] += dz
            J[:, k] = (residual(s, zz)['R'] - R) / dz              # full re-assembly and re-solve
        J[:, -1] = -1.0
        step = np.linalg.solve(J, -R); lam = 1.0; accepted = False
        while lam > 1e-3:
            zt = z + lam * step
            if zt[-1] > 1:
                Rt = residual(s, zt)['R']
                if np.max(np.abs(Rt)) < (1 - 1e-4 * lam) * nr: z = zt; accepted = True; break
            lam *= 0.5
        if not accepted: break
    return z, hist

def velocity(s, st, points, wheres, nNear=32, nFar=12):
    coefs = [hermite_coeffs(s, st['gam'], j) for j in range(s.N)]
    out = []
    for i, P in enumerate(points):
        v = np.array([1.0, 0.0]); wh = wheres[i] if wheres else None
        for pan in st['panels']:
            v += coefs[pan.index] @ influence(pan, P, wh, nNear, nFar)
        out.append(v)
    return np.array(out)

def audit(s, z, st, fracs=(.02, .05, .1, .25, .5, .75, .9, .95, .98)):
    qc = z[-1]; P = []; whE = []; whI = []; pan = []; ff = []
    for j in range(s.N):
        for f in fracs:
            P.append(st['panels'][j].pos(np.array([f]))[0]); whE.append(dict(panel=j, zeta=f, side=1)); whI.append(dict(panel=j, zeta=f, side=-1)); pan.append(j); ff.append(f)
    ve = velocity(s, st, P, whE); vi = velocity(s, st, P, whI)
    coefs = [hermite_coeffs(s, st['gam'], j) for j in range(s.N)]
    vn = []; vt = []; dens = []; cp = []; inter = []
    for i in range(len(P)):
        j = pan[i]; d = st['panels'][j].der(np.array([ff[i]]))[0]; J = np.hypot(*d); t = d / J; n = np.array([-t[1], t[0]])
        gi = float(Hb(ff[i]) @ coefs[j])
        vn.append(ve[i] @ n); vt.append(ve[i] @ t); dens.append(-gi); inter.append(np.hypot(*vi[i]))
        if s.Nf <= j < s.Nf + s.Nc: cp.append(ve[i] @ ve[i] - qc * qc)
    vn = np.array(vn); vt = np.array(vt); dens = np.array(dens)
    return dict(fractions=list(fracs), maxNormal_U=float(np.max(np.abs(vn))), rmsNormal_U=float(np.sqrt((vn * vn).mean())),
                maxCavityDynamicCpResidual=float(np.max(np.abs(cp))), maxTraceSpeedMismatch_U=float(np.max(np.abs(vt - dens))),
                maxInteriorBoundarySpeed_U=float(np.max(inter)), profiles=dict(points=[p.tolist() for p in P], panel=pan, fraction=ff, normal_U=vn.tolist(), tangent_U=vt.tolist(), negativeGamma_U=dens.tolist()))

def outputs(s, z, st):
    qc = z[-1]; gam = st['gam']; nodes = st['nodes']; x, w = gl(6)
    CD = 0.0
    for k in range(s.Nf):
        coef = hermite_coeffs(s, gam, k); pan = st['panels'][k]; zz = (x + 1) / 2; p = pan.pos(zz); d = pan.der(zz)
        v = -(Hb(zz).T @ coef); CD += float((w / 2 * d[:, 1] * 2 * (qc * qc - v * v) * p[:, 1]).sum())
    vol = 0.0
    for k in range(s.Nc):
        pan = st['panels'][s.Nf + k]; zz = (x + 1) / 2; p = pan.pos(zz); d = pan.der(zz); vol += float((w / 2 * PI * p[:, 1] ** 2 * d[:, 0]).sum())
    cav = nodes[s.Nf:s.Nf + s.Nc + 1]
    return dict(L=s.L, Nf=s.Nf, Nc=s.Nc, N=s.N, mColl=s.mColl, sigma=float(qc * qc - 1), qc=float(qc), Rmax=float(cav[s.Nc // 2, 1]), CD=CD, volume=vol,
                maxDynamicResidual=float(np.max(np.abs(st['R']))), collocMax=st['collocMax'], collocRms=st['collocRms'], nodes=nodes.tolist(), gamma=gam.tolist())

def run(L, Nc, Nf=None, mColl=3, z0=None, do_audit=True, verbose=True, nNear=24, nFar=10):
    s = Setup(L, Nc, Nf, mColl=mColl, nNear=nNear, nFar=nFar)
    z = np.r_[np.zeros(Nc // 2), 1.14] if z0 is None else np.asarray(z0, float)
    t0 = time.time(); z, hist = newton(s, z, verbose=verbose)
    st = residual(s, z); out = outputs(s, z, st); out['history'] = hist; out['solutionState'] = z.tolist()
    if do_audit: out['fieldAudit'] = audit(s, z, st)
    out['seconds'] = time.time() - t0
    return s, z, st, out

if __name__ == '__main__':
    L = float(sys.argv[1]); Nc = int(sys.argv[2]); Nf = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != '-' else None
    nNear = int(sys.argv[4]) if len(sys.argv) > 4 else 24; nFar = int(sys.argv[5]) if len(sys.argv) > 5 else 10
    s, z, st, out = run(L, Nc, Nf, nNear=nNear, nFar=nFar)
    print(json.dumps(out))
