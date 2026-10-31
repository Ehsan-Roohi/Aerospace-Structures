"""axi_cavity.py -- independent axisymmetric Riabouchinsky disk-cavity solver (research check).

Disk radius R=1 at x=0, identical image disk at x=L.  Closed meridian: front face (axis->rim),
free surface (rim -> image rim), image rear face (image rim -> axis).  Liquid on the left.
Representation: LINEAR-strength vortex rings (nodal gamma), interior at rest, so the exterior
surface speed at node j is -gamma_j.  Neumann rows at panel midpoints (first half; fore-aft
symmetry gamma_{N-j}=gamma_j), gamma_0 = 0 at the front stagnation point.
Free surface: nodes displaced along the normals of a reference curve that already has the
sharp-edge exponent (x - x_rim ~ (r - R)^{3/2}); unknowns h_1..h_{Nc/2} and qc; dynamic rows
-gamma = qc at cavity nodes 0..Nc/2 (rim node included: speed continuous at the edge).
Outputs sigma = qc^2 - 1, Rmax, C_D = 2 int_0^1 (qc^2 - V^2) r dr on the physical disk face.
"""
import numpy as np, math, json, time, sys
from axi_ring import panel_velocity

def reference_curve(L, Rm, n=40001):
    """Reference free surface r = 1 + (Rm-1) (4x(L-x)/L^2)^(2/3): sharp-edge exponent at both rims.
    Returned as a fine polyline in arclength with unit normals (liquid side)."""
    v = np.linspace(0, 1, n); x = L * (1 - np.cos(np.pi * v)) / 2
    r = 1 + (Rm - 1) * np.maximum(0, 4 * x * (L - x) / L**2)**(2 / 3)
    s = np.r_[0, np.cumsum(np.hypot(np.diff(x), np.diff(r)))]
    tx = np.gradient(x, s); tr = np.gradient(r, s); tn = np.hypot(tx, tr); tx, tr = tx / tn, tr / tn
    tx[0], tr[0], tx[-1], tr[-1] = 0.0, 1.0, 0.0, -1.0
    return dict(u=s / s[-1], x=x, r=r, nx=-tr, nr=tx, S=s[-1])

class Riabouchinsky:
    def __init__(self, L=8.0, Nf=24, Nc=64, Rm=1.95, nnear=16):
        assert Nc % 2 == 0
        self.L, self.Nf, self.Nc, self.nnear = L, Nf, Nc, nnear
        ref = reference_curve(L, Rm); self.ref = ref
        uk = (1 - np.cos(np.pi * np.arange(Nc + 1) / Nc)) / 2             # cosine in arclength
        xr = np.interp(uk, ref['u'], ref['x']); rr = np.interp(uk, ref['u'], ref['r'])
        nx_ = np.interp(uk, ref['u'], ref['nx']); nr_ = np.interp(uk, ref['u'], ref['nr'])
        xr[0], rr[0], xr[-1], rr[-1] = 0.0, 1.0, L, 1.0
        xr = 0.5 * (xr + (L - xr[::-1])); rr = 0.5 * (rr + rr[::-1])       # exact symmetry
        self.cav_ref = np.c_[xr, rr]
        nrm = np.c_[nx_, nr_] / np.hypot(nx_, nr_)[:, None]
        for k in range(Nc // 2 + 1, Nc + 1): nrm[k] = [-nrm[Nc - k][0], nrm[Nc - k][1]]   # exact mirror
        nrm[Nc // 2] = [0.0, 1.0]
        self.cav_nrm = nrm
        rf = np.sin(0.5 * np.pi * np.arange(Nf + 1) / Nf)                  # face nodes, clustered at the rim
        self.front = np.c_[np.zeros(Nf + 1), rf]
        self.N = 2 * Nf + Nc; self.h = self.N // 2
        self.cache = None

    def nodes(self, hk):
        """hk: displacements of cavity nodes 1..Nc/2 (mirror for the other half)."""
        Nc, L = self.Nc, self.L
        d = np.zeros(Nc + 1); d[1:Nc // 2 + 1] = hk; d[Nc // 2:] = d[Nc // 2::-1]
        cav = self.cav_ref + d[:, None] * self.cav_nrm
        cav[0] = [0, 1]; cav[-1] = [L, 1]
        back = np.c_[np.full(self.Nf + 1, L), self.front[::-1, 1]]
        return np.r_[self.front, cav[1:-1], back]

    # ---------------------------------------------------------------- assembly with incremental updates
    def _panel_cols(self, P, j, nodes):
        Va, Vb = panel_velocity('vortex', nodes[j], nodes[j + 1], P, side_on=+1, nnear=self.nnear)
        return Va, Vb

    def assemble(self, nodes, rows=None, panels=None, base=None):
        """Normal-velocity matrix An (h, N+1) at midpoints of panels 0..h-1.  If base is given,
        only 'rows' (midpoints that moved) and 'panels' (sources that moved) are recomputed."""
        N, h = self.N, self.h
        a, b = nodes[:-1], nodes[1:]; d = b - a; Lp = np.hypot(d[:, 0], d[:, 1]); t = d / Lp[:, None]
        n = np.c_[-t[:, 1], t[:, 0]]; c = 0.5 * (a + b)
        if base is None:
            An = np.zeros((h, N + 1)); rows_all = np.arange(h); panels = range(N)
            P = c[:h]
            for j in panels:
                Va, Vb = self._panel_cols(P, j, nodes)
                An[:, j] += Va[:, 0] * n[:h, 0] + Va[:, 1] * n[:h, 1]
                An[:, j + 1] += Vb[:, 0] * n[:h, 0] + Vb[:, 1] * n[:h, 1]
            return An, n, c
        An = base.copy()
        rows = np.array(sorted(set(r for r in rows if 0 <= r < h)), int)
        # recompute moved rows completely
        if len(rows):
            An[rows] = 0.0; P = c[rows]
            for j in range(N):
                Va, Vb = self._panel_cols(P, j, nodes)
                An[rows, j] += Va[:, 0] * n[rows, 0] + Va[:, 1] * n[rows, 1]
                An[rows, j + 1] += Vb[:, 0] * n[rows, 0] + Vb[:, 1] * n[rows, 1]
        # recompute contributions of moved panels to the other rows
        others = np.setdiff1d(np.arange(h), rows)
        if len(others):
            P = c[others]; old = self._old_nodes
            for j in panels:
                Va, Vb = self._panel_cols(P, j, old)      # remove old contribution
                An[others, j] -= Va[:, 0] * n[others, 0] + Va[:, 1] * n[others, 1]
                An[others, j + 1] -= Vb[:, 0] * n[others, 0] + Vb[:, 1] * n[others, 1]
                Va, Vb = self._panel_cols(P, j, nodes)
                An[others, j] += Va[:, 0] * n[others, 0] + Va[:, 1] * n[others, 1]
                An[others, j + 1] += Vb[:, 0] * n[others, 0] + Vb[:, 1] * n[others, 1]
        return An, n, c

    def solve_gamma(self, An, n):
        N, h = self.N, self.h
        F = np.zeros((h, h + 1))
        for j in range(N + 1):
            F[:, j if j <= h else N - j] += An[:, j]
        g = np.linalg.solve(F[:, 1:], -n[:h, 0])
        gam = np.zeros(N + 1); gam[1:h + 1] = g; gam[h:] = gam[h::-1]
        return gam

    def residual_from(self, gam, qc):
        k0 = self.Nf
        return -gam[k0:k0 + self.Nc // 2 + 1] - qc

    def residual(self, z, base=None):
        nodes = self.nodes(z[:-1]); An, n, c = self.assemble(nodes)
        return self.residual_from(self.solve_gamma(An, n), z[-1]), (nodes, An, n, c)

    def newton(self, z, tol=1e-10, maxit=30, verbose=True):
        hist = []
        for it in range(maxit):
            R, (nodes, An, n, c) = self.residual(z); nr = float(np.max(np.abs(R))); hist.append(nr)
            if verbose: print(f'   newton {it}: |R|max={nr:.3e} qc={z[-1]:.7f} sigma={z[-1]**2-1:.7f} Rmax={nodes[self.Nf+self.Nc//2,1]:.6f}', flush=True)
            if nr < tol: break
            m = len(z); J = np.empty((len(R), m))
            self._old_nodes = nodes
            for k in range(m - 1):                          # shape columns: incremental assembly
                dz = 1e-7; zz = z.copy(); zz[k] += dz
                nn = self.nodes(zz[:-1]); gk = self.Nf + k + 1  # global node index of cavity node k+1
                mirror = self.N - gk
                panels = sorted({gk - 1, gk, mirror - 1, mirror})
                rows = [p for p in panels if p < self.h]
                An2, n2, _ = self.assemble(nn, rows=rows, panels=panels, base=An)
                J[:, k] = (self.residual_from(self.solve_gamma(An2, n2), zz[-1]) - R) / dz
            J[:, -1] = -1.0                                  # dR/dqc
            step = np.linalg.solve(J, -R); lam = 1.0
            while lam > 1e-3:
                zt = z + lam * step
                Rt, _ = self.residual(zt)
                if np.max(np.abs(Rt)) < (1 - 1e-4 * lam) * nr: z = zt; break
                lam *= 0.5
            else:
                break
        return z, hist

    def outputs(self, z):
        R, (nodes, An, n, c) = self.residual(z); gam = self.solve_gamma(An, n)
        qc = z[-1]; sigma = qc * qc - 1; Nf = self.Nf
        rf = nodes[:Nf + 1, 1]; V = -gam[:Nf + 1]
        cd = 0.0                                             # exact for V linear along each face panel
        for k in range(Nf):
            r0, r1, v0, v1 = rf[k], rf[k + 1], V[k], V[k + 1]
            for xi, w in zip([0, 0.5, 1], [1 / 6, 4 / 6, 1 / 6]):
                r = r0 + xi * (r1 - r0); v = v0 + xi * (v1 - v0)
                cd += w * (r1 - r0) * 2 * (qc * qc - v * v) * r
        cav = nodes[Nf:Nf + self.Nc + 1]
        vol = 0.0                                             # cavity volume between the disks (frusta)
        for k in range(self.Nc):
            (x0, r0), (x1, r1) = cav[k], cav[k + 1]
            vol += np.pi * (x1 - x0) * (r0 * r0 + r0 * r1 + r1 * r1) / 3
        return dict(L=self.L, Nf=self.Nf, Nc=self.Nc, N=self.N, sigma=float(sigma), qc=float(qc), Rmax=float(cav[self.Nc // 2, 1]),
                    CD=float(cd), CD_over_1_plus_sigma=float(cd / (1 + sigma)), volume=float(vol), maxDynamicResidual=float(np.max(np.abs(R))),
                    rearAxisGamma=float(gam[-1]), faceSpeedNearRim=[float(v) for v in V[-4:]])

def run(L, Nf, Nc, Rm=1.95, z0=None, verbose=True):
    sol = Riabouchinsky(L, Nf, Nc, Rm)
    z = np.r_[np.zeros(Nc // 2), 1.14] if z0 is None else z0
    t0 = time.time(); z, hist = sol.newton(z, verbose=verbose)
    out = sol.outputs(z); out['newton'] = hist; out['seconds'] = time.time() - t0; out['Rm_reference'] = Rm
    return sol, z, out

if __name__ == '__main__':
    L = float(sys.argv[1]); Nf = int(sys.argv[2]); Nc = int(sys.argv[3]); Rm = float(sys.argv[4]) if len(sys.argv) > 4 else 1.95
    sol, z, out = run(L, Nf, Nc, Rm)
    print(json.dumps(out))
    np.save(f'z-L{L}-Nf{Nf}-Nc{Nc}.npy', z)
