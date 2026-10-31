"""axi_bem.py -- linear-strength vortex-sheet (and source) ring BEM for closed meridians.

Meridian polygon nodes run from the upstream axis point to the downstream axis point; the
liquid is on the LEFT of the direction of travel (outward normal n = (-t_r, t_x)).
Vortex sheet, interior at rest: exterior surface speed along t equals -gamma (nodal values).
Fore-aft symmetric bodies use the reduction gamma_{N-j} = gamma_j (N even).
"""
import numpy as np
from axi_ring import panel_velocity

def geometry(nodes):
    a, b = nodes[:-1], nodes[1:]; d = b - a; L = np.hypot(d[:, 0], d[:, 1]); t = d / L[:, None]
    n = np.c_[-t[:, 1], t[:, 0]]; c = 0.5 * (a + b)
    return dict(a=a, b=b, L=L, t=t, n=n, c=c)

def influence(nodes, P, kind='vortex', on_panel=None, nnear=16):
    """Velocity at points P (M,2) per unit nodal strength: arrays Vx, Vr of shape (M, N+1).
    on_panel[i] = panel index containing P[i] (on-surface, liquid side) or -1."""
    g = geometry(nodes); N = len(g['L']); M = len(P)
    Vx = np.zeros((M, N + 1)); Vr = np.zeros((M, N + 1))
    on_panel = np.full(M, -1) if on_panel is None else np.asarray(on_panel)
    for j in range(N):
        Va, Vb = panel_velocity(kind, g['a'][j], g['b'][j], P, side_on=+1, nnear=nnear)
        Vx[:, j] += Va[:, 0]; Vr[:, j] += Va[:, 1]; Vx[:, j + 1] += Vb[:, 0]; Vr[:, j + 1] += Vb[:, 1]
    return Vx, Vr, g

def solve_symmetric_vortex(nodes, U=1.0, nnear=16):
    """Fore-aft symmetric closed meridian (N even).  Unknowns gamma_1..gamma_{N/2}, gamma_0=0.
    Rows: vn=0 at the midpoints of panels 0..N/2-1.  Returns full nodal gamma and data."""
    g = geometry(nodes); N = len(g['L']); h = N // 2
    P = g['c'][:h]
    Vx, Vr, _ = influence(nodes, P, 'vortex', on_panel=np.arange(h), nnear=nnear)
    An = Vx * g['n'][:h, 0][:, None] + Vr * g['n'][:h, 1][:, None]   # (h, N+1)
    # fold symmetric unknowns: column j and N-j
    F = np.zeros((h, h + 1))
    for j in range(N + 1):
        k = j if j <= h else N - j
        F[:, k] += An[:, j]
    A = F[:, 1:]                                   # gamma_0 = 0
    rhs = -U * g['n'][:h, 0]
    gh = np.linalg.solve(A, rhs)
    gam = np.zeros(N + 1); gam[1:h + 1] = gh; gam[h:] = gam[h::-1]
    return gam, g

def surface_speed_check(nodes, gam, U=1.0, kind='vortex', fracs=(0.25, 0.5, 0.75), nnear=16):
    """Exterior velocity at fractional positions of every panel (true off-collocation values)."""
    g = geometry(nodes); N = len(g['L'])
    pts, pan = [], []
    for j in range(N):
        for f in fracs:
            pts.append(g['a'][j] + f * g['L'][j] * g['t'][j]); pan.append(j)
    P = np.array(pts); pan = np.array(pan)
    Vx, Vr, _ = influence(nodes, P, kind, on_panel=pan, nnear=nnear)
    vx = U + Vx @ gam; vr = Vr @ gam
    vt = vx * g['t'][pan, 0] + vr * g['t'][pan, 1]; vn = vx * g['n'][pan, 0] + vr * g['n'][pan, 1]
    return P, pan, vt, vn
