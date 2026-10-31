"""axi_ring.py -- axisymmetric ring kernels with near-singular panel integration (independent).

Meridian half-plane (x, r), r >= 0.  A straight meridian panel from a=(xa,ra) to b=(xb,rb)
is a conical frustum.  Strengths vary LINEARLY along the panel (nodal values), per unit area.

Kernels per unit meridian length (azimuth integrated analytically, complete elliptic K, E):
  dx = x - x', D = dx^2 + (r + r')^2, B = dx^2 + (r - r')^2, m = 1 - B/D
  source ring, unit density per AREA (velocity of phi = -int s/(4 pi R) dA):
     vx = r' dx E / (pi sqrt(D) B)
     vr = r'/(pi sqrt(D)) [ (K - E)/(2 r) + (r - r') E / B ]
  vortex ring, unit circulation per unit meridian length (CCW in the (x, r) plane):
     ux = [ K + (r'^2 - r^2 - dx^2) E / B ] / (2 pi sqrt(D))
     ur = dx [ -K + (r'^2 + r^2 + dx^2) E / B ] / (2 pi r sqrt(D))
Both behave like the 2-D line source / point vortex (P-Q)/(2 pi rho^2) (rotated for the vortex)
as rho -> 0; the remainder is O(log rho / r').  Near-singular integration therefore SUBTRACTS the
exact 2-D straight-panel integral (log/atan, linear strength) and integrates only the log-singular
remainder, with the panel split at the foot of the perpendicular and u^2 clustering on each side.
On-surface limits: the 2-D part carries the whole jump (+/- 1/2 of the local strength for the
normal source velocity, +/- gamma/2 for the tangential vortex velocity); side = +1 means the
LEFT of the panel direction (a -> b).
"""
import numpy as np
from scipy.special import ellipkm1, ellipe

PI = np.pi
GL = {n: np.polynomial.legendre.leggauss(n) for n in (4, 6, 8, 12, 16, 24, 32, 48)}

def _KE(B, D):
    p = np.clip(B / D, 1e-300, 1.0)
    return ellipkm1(p), ellipe(1.0 - p)

def ring_kernel(kind, x, r, xs, rs):
    """velocity (vx, vr) at (x, r) of a unit ring at (xs, rs); arrays broadcast."""
    dx = x - xs; D = dx * dx + (r + rs)**2; B = dx * dx + (r - rs)**2
    K, E = _KE(B, D); sD = np.sqrt(D)
    rsafe = np.where(r > 0, r, 1.0)
    if kind == 'source':
        vx = rs * dx * E / (PI * sD * B)
        vr = rs / (PI * sD) * ((K - E) / (2 * rsafe) + (r - rs) * E / B)
        axis_vx = rs * rs * dx / (2 * (dx * dx + rs * rs)**1.5)
        vx = np.where(r > 0, vx, axis_vx); vr = np.where(r > 0, vr, 0.0)
    else:
        vx = (K + (rs * rs - r * r - dx * dx) * E / B) / (2 * PI * sD)
        vr = dx * (-K + (rs * rs + r * r + dx * dx) * E / B) / (2 * PI * rsafe * sD)
        axis_vx = rs * rs / (2 * (dx * dx + rs * rs)**1.5)
        vx = np.where(r > 0, vx, axis_vx); vr = np.where(r > 0, vr, 0.0)
    return vx, vr

def _two_d(kind, X, Y, L, side_on):
    """exact 2-D straight panel, unit strength at node a (shape 1-xi/L) and node b (xi/L).
    Returns local (u along t, v along left normal) for a and b.  side_on: +1/-1 for on-panel
    points (|Y|==0 and 0<X<L), selects the left/right limit."""
    on = (np.abs(Y) <= 1e-12 * L) & (X > 0) & (X < L)
    Y = np.where(on, 0.0, Y)
    beta = np.arctan2(Y * L, X * (X - L) + Y * Y)
    beta = np.where(on, side_on * PI, beta)
    r1 = X * X + Y * Y; r2 = (X - L)**2 + Y * Y
    J0 = 0.5 * np.log(np.where(r1 > 0, r1, 1e-300) / np.where(r2 > 0, r2, 1e-300))
    I0, J1 = beta, X * J0 - L + Y * beta          # int Y/rho^2, int xi (X-xi)/rho^2
    I1 = X * beta - Y * J0                         # int xi Y/rho^2
    # source density s(xi): velocity = (1/2pi) int s (P-Q)/rho^2 dxi -> u = int s (X-xi)/rho^2, v = int s Y/rho^2
    # vortex (CCW): velocity = (1/2pi) int g (-(Y), (X-xi))/rho^2 -> u = -int g Y/rho^2, v = int g (X-xi)/rho^2
    # shape functions Na = 1 - xi/L, Nb = xi/L:
    #   int (X-xi)/rho^2 * xi = X*J0 - (L - Y*beta) = J1 ;  int Y/rho^2 * xi = X*beta - Y*J0 = I1
    Sx_b = J1 / L;          Sx_a = J0 - Sx_b      # int (X-xi)/rho^2 * N
    Sy_b = I1 / L;          Sy_a = I0 - Sy_b      # int Y/rho^2 * N
    c = 1 / (2 * PI)
    if kind == 'source':
        return (c * Sx_a, c * Sy_a), (c * Sx_b, c * Sy_b)
    return (-c * Sy_a, c * Sx_a), (-c * Sy_b, c * Sx_b)

def panel_velocity(kind, a, b, P, side_on=1, nfar=8, nnear=16, near_factor=3.0, sub=True):
    """Velocity at field points P (M,2) from panel a->b with unit nodal strength at a and at b.
    Returns Va, Vb arrays (M,2) in global (x, r) components."""
    P = np.atleast_2d(np.asarray(P, float)); a = np.asarray(a, float); b = np.asarray(b, float)
    d = b - a; L = np.hypot(*d); t = d / L; nl = np.array([-t[1], t[0]])
    rel = P - a; X = rel @ t; Y = rel @ nl
    xf = np.clip(X, 0, L); dist = np.hypot(X - xf, Y)
    near = dist < near_factor * L
    Va = np.zeros_like(P); Vb = np.zeros_like(P)
    # far: plain Gauss
    if np.any(~near):
        g, w = GL[nfar]; xi = 0.5 * L * (g + 1); W = 0.5 * L * w
        Q = a + xi[:, None] * t
        vx, vr = ring_kernel(kind, P[~near, 0][:, None], P[~near, 1][:, None], Q[None, :, 0], Q[None, :, 1])
        Na, Nb = 1 - xi / L, xi / L
        Va[~near] = np.c_[(vx * (W * Na)).sum(1), (vr * (W * Na)).sum(1)]
        Vb[~near] = np.c_[(vx * (W * Nb)).sum(1), (vr * (W * Nb)).sum(1)]
    if np.any(near):
        idx = np.where(near)[0]
        for i in idx:
            x, r = P[i]; Xi, Yi, f = X[i], Y[i], xf[i]
            use_sub = sub and r > 0 and dist[i] < 0.5 * max(r, 1e-300) and min(a[1], b[1]) >= 0
            g, w = GL[nnear]; u = 0.5 * (g + 1); wu = 0.5 * w
            xs, ws = [], []
            for lo, hi in ((f, 0.0), (f, L)):          # clustered toward the foot f
                span = hi - lo
                if abs(span) < 1e-15: continue
                xs.append(lo + span * u * u); ws.append(np.abs(span) * 2 * u * wu)
            xi = np.concatenate(xs); W = np.concatenate(ws)
            Q = a + xi[:, None] * t
            vx, vr = ring_kernel(kind, x, r, Q[:, 0], Q[:, 1])
            if use_sub:
                dxq = x - Q[:, 0]; drq = r - Q[:, 1]; rho2 = dxq * dxq + drq * drq
                rho2 = np.where(rho2 > 0, rho2, np.inf)
                if kind == 'source': px, pr = dxq / (2 * PI * rho2), drq / (2 * PI * rho2)
                else:                px, pr = -drq / (2 * PI * rho2), dxq / (2 * PI * rho2)
                vx = vx - px; vr = vr - pr
            Na, Nb = 1 - xi / L, xi / L
            va = np.array([(vx * W * Na).sum(), (vr * W * Na).sum()])
            vb = np.array([(vx * W * Nb).sum(), (vr * W * Nb).sum()])
            if use_sub:
                (ua, wa), (ub, wb) = _two_d(kind, np.array(Xi), np.array(Yi), L, side_on)
                va = va + float(ua) * t + float(wa) * nl
                vb = vb + float(ub) * t + float(wb) * nl
            Va[i] = va; Vb[i] = vb
    return Va, Vb

# ---------------------------------------------------------------- brute force (independent of K, E)
def brute_ring_velocity(kind, x, r, a, b, sa=1.0, sb=0.0, nth=4000, nxi=400):
    """Direct 3-D Biot-Savart / source integration over the frustum for an OFF-SURFACE point.
    Field point at azimuth 0: P=(x, r, 0).  Midpoint rules in azimuth and arclength."""
    a = np.asarray(a, float); b = np.asarray(b, float); L = np.hypot(*(b - a)); t = (b - a) / L
    xi = (np.arange(nxi) + 0.5) / nxi * L; th = (np.arange(nth) + 0.5) / nth * 2 * PI
    Q = a + xi[:, None] * t; s = sa * (1 - xi / L) + sb * xi / L
    X3 = Q[:, 0][:, None] * np.ones_like(th)[None, :]
    Y3 = Q[:, 1][:, None] * np.cos(th)[None, :]; Z3 = Q[:, 1][:, None] * np.sin(th)[None, :]
    Rx, Ry, Rz = x - X3, r - Y3, -Z3; R3 = (Rx * Rx + Ry * Ry + Rz * Rz)**1.5
    dA = (L / nxi) * Q[:, 1][:, None] * (2 * PI / nth)   # area element; for vortex: per unit length
    if kind == 'source':
        f = s[:, None] / (4 * PI) * dA / R3
        return np.array([(f * Rx).sum(), (f * Ry).sum()])
    # vortex sheet: vorticity omega = g * e_theta (azimuthal), u = (1/4pi) int omega x (P-Q)/R^3 dA
    ex, ey, ez = 0.0, -np.sin(th)[None, :], np.cos(th)[None, :]
    cx = ey * Rz - ez * Ry; cy = ez * Rx - ex * Rz
    f = s[:, None] / (4 * PI) * dA / R3
    return np.array([(f * cx).sum(), (f * cy).sum()])
