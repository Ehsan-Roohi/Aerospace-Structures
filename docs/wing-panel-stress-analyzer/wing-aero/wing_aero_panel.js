const WingAeroPanel = (() => {
  'use strict';
  const VERSION = '0.3.1';
  // Browser/Worker: globals from the inlined or bundled scripts. Node: this directory first, then the
  // shared geometry sources in ../web/ (reused unchanged).
  const nodeLoad = name => {
    if (typeof require !== 'function') return null;
    for (const path of ['./' + name, '../web/' + name]) { try { return require(path); } catch (error) { if (!error || error.code !== 'MODULE_NOT_FOUND' || !String(error.message).includes(name)) throw error; } }
    return null;
  };
  const Airfoils = typeof WingAirfoils !== 'undefined' ? WingAirfoils : nodeLoad('wing_airfoils.js');
  const Geometry = typeof WingGeometry !== 'undefined' ? WingGeometry : nodeLoad('wing_geometry.js');
  if (!Airfoils || !Geometry) throw new Error('Load wing_airfoils.js and wing_geometry.js before wing_aero_panel.js.');
  const INV4PI = 1 / (4 * Math.PI), DEG = Math.PI / 180;
  // Hot kernels use module-scope references (avoids global-object lookups in VM contexts and Workers).
  const sqrt = Math.sqrt, atan2 = Math.atan2, logn = Math.log, absv = Math.abs;
  const DEFAULT_FLOW = Object.freeze({ speed: 15, density: 1.225, alphaDeg: 4, betaDeg: 0, viscosity: 1.81e-5, speedOfSound: 340.29 });
  // tipClosure 'rounded' (default): the tip section thickness is rounded off over a short length so the surface
  // closes on itself and every pressure is integrated. 'flat' keeps a flat cap whose pressure is NOT integrated
  // (diagnostic only; see evaluate and the documentation).
  const DEFAULT_MESH = Object.freeze({ chordPanels: 32, spanPanels: 16, spanSpacing: 'sine', farField: 6, tipClosure: 'rounded', roundingStrips: 'auto' });
  const LIMITS = Object.freeze({ chordPanels: [6, 96], spanPanels: [4, 48], maxPanels: 4800, maxMach: 0.3, warnMach: 0.2,
    warnAlphaDeg: 8, maxAlphaDeg: 15, lowReynolds: 5e5, keepMatrixPanels: 1600, speedOfSound: [290, 360], modelCache: 8 });
  const SCOPE = Object.freeze({
    method: 'Low-order constant-strength source/doublet surface panels on the finite-thickness wing; internal Dirichlet condition; Morino Kutta condition; flat semi-infinite wake along body +x; symmetric image half-wing.',
    flow: 'Steady, incompressible, inviscid, attached. Mach <= 0.3 enforced; no compressibility correction.',
    excluded: ['stall and separation', 'boundary layer, transition and viscous (profile) drag', 'leading-edge vortex lift of slender or delta wings', 'compressibility', 'sideslip, roll/yaw rates and asymmetric flight', 'wake relaxation and wake roll-up', 'aeroelastic coupling (geometry is rigid)', 'fuselage, ground effect, control surfaces', 'blunt trailing-edge base flow (trailing edge is closed sharp for aerodynamics)'],
    claim: 'Numerical potential-flow estimate; accuracy is demonstrated only by the listed benchmark tests, not certified.',
  });

  // ------------------------------------------------------------------ small helpers
  const finiteIn = (v, name, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be a finite number between ${lo} and ${hi}.`); return v; };
  const intIn = (v, name, lo, hi) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be an integer from ${lo} to ${hi}.`); return v; };
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // ------------------------------------------------------------------ kernels
  // Signed solid angle subtended at P by the oriented triangle (a, b, c): positive on the side of
  // (b - a) x (c - a). Van Oosterom & Strackee (1983) with r_i = P - v_i.
  function triAngle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const x1 = px - ax, y1 = py - ay, z1 = pz - az, x2 = px - bx, y2 = py - by, z2 = pz - bz, x3 = px - cx, y3 = py - cy, z3 = pz - cz;
    const l1 = sqrt(x1 * x1 + y1 * y1 + z1 * z1), l2 = sqrt(x2 * x2 + y2 * y2 + z2 * z2), l3 = sqrt(x3 * x3 + y3 * y3 + z3 * z3);
    const det = x1 * (y2 * z3 - z2 * y3) + y1 * (z2 * x3 - x2 * z3) + z1 * (x2 * y3 - y2 * x3);
    const den = l1 * l2 * l3 + (x1 * x2 + y1 * y2 + z1 * z2) * l3 + (x1 * x3 + y1 * y3 + z1 * z3) * l2 + (x2 * x3 + y2 * y3 + z2 * z3) * l1;
    return 2 * atan2(det, den);
  }
  // Solid angle of the semi-infinite triangle (a, a + R u, b), R -> infinity, u a unit vector:
  // the R -> infinity limit of the same formula after dividing numerator and denominator by R.
  function semiInfiniteAngle(px, py, pz, ax, ay, az, ux, uy, uz, bx, by, bz) {
    const x1 = px - ax, y1 = py - ay, z1 = pz - az, x3 = px - bx, y3 = py - by, z3 = pz - bz;
    const l1 = sqrt(x1 * x1 + y1 * y1 + z1 * z1), l3 = sqrt(x3 * x3 + y3 * y3 + z3 * z3);
    const det = -(x1 * (uy * z3 - uz * y3) + y1 * (uz * x3 - ux * z3) + z1 * (ux * y3 - uy * x3));
    const den = l1 * l3 - (x1 * ux + y1 * uy + z1 * uz) * l3 + (x1 * x3 + y1 * y3 + z1 * z3) - (ux * x3 + uy * y3 + uz * z3) * l1;
    return 2 * atan2(det, den);
  }

  // ------------------------------------------------------------------ panel surface
  // nodes: flat [x,y,z,...]; quads: flat vertex indices, counter-clockwise about the outward normal.
  // A quad may collapse one edge (triangle). Non-planar quads: the doublet uses the true edges
  // (watertight vortex rings), the source uses the quad flattened into its mean plane.
  function buildSurface(nodes, quads) {
    const n = quads.length / 4;
    if (!Number.isInteger(n) || n < 4) throw new Error('A panel surface needs at least four quadrilaterals.');
    const PV = new Float64Array(12 * n), PC = new Float64Array(3 * n), PN = new Float64Array(3 * n), PL = new Float64Array(3 * n), PM = new Float64Array(3 * n);
    const PF = new Float64Array(8 * n), PA = new Float64Array(n), PD = new Float64Array(n), PW = new Float64Array(n), SELF = new Float64Array(n);
    let maxWarp = 0;
    const tri = (a, b, c, out) => { // area and centroid of a 3-D triangle
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      out.a = area; out.x = (a[0] + b[0] + c[0]) / 3; out.y = (a[1] + b[1] + c[1]) / 3; out.z = (a[2] + b[2] + c[2]) / 3;
    };
    const t1 = {}, t2 = {};
    for (let k = 0; k < n; k++) {
      const v = [0, 1, 2, 3].map(q => { const i = quads[4 * k + q]; if (!(i >= 0 && 3 * i + 2 < nodes.length)) throw new Error('Panel references a missing node.'); return [nodes[3 * i], nodes[3 * i + 1], nodes[3 * i + 2]]; });
      for (let q = 0; q < 4; q++) for (let d = 0; d < 3; d++) PV[12 * k + 3 * q + d] = v[q][d];
      const d1 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]], d2 = [v[3][0] - v[1][0], v[3][1] - v[1][1], v[3][2] - v[1][2]];
      let nx = d1[1] * d2[2] - d1[2] * d2[1], ny = d1[2] * d2[0] - d1[0] * d2[2], nz = d1[0] * d2[1] - d1[1] * d2[0];
      const nn = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(nn > 0)) throw new Error(`Panel ${k} has zero area.`);
      nx /= nn; ny /= nn; nz /= nn; PA[k] = 0.5 * nn;
      // centroid: mean of the two diagonal splits (exact for planar quads and for triangles)
      let C = [0, 0, 0];
      for (const [a, b, c, d] of [[0, 1, 2, 3], [1, 2, 3, 0]]) {
        tri(v[a], v[b], v[c], t1); tri(v[a], v[c], v[d], t2); const s = t1.a + t2.a;
        C[0] += 0.5 * (t1.a * t1.x + t2.a * t2.x) / s; C[1] += 0.5 * (t1.a * t1.y + t2.a * t2.y) / s; C[2] += 0.5 * (t1.a * t1.z + t2.a * t2.z) / s;
      }
      PC[3 * k] = C[0]; PC[3 * k + 1] = C[1]; PC[3 * k + 2] = C[2]; PN[3 * k] = nx; PN[3 * k + 1] = ny; PN[3 * k + 2] = nz;
      // in-plane axes: l from the 0-3 edge midpoint towards the 1-2 edge midpoint
      let lx = (v[1][0] + v[2][0] - v[0][0] - v[3][0]), ly = (v[1][1] + v[2][1] - v[0][1] - v[3][1]), lz = (v[1][2] + v[2][2] - v[0][2] - v[3][2]);
      let dot = lx * nx + ly * ny + lz * nz; lx -= dot * nx; ly -= dot * ny; lz -= dot * nz;
      let ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (!(ll > 1e-12 * Math.sqrt(PA[k]))) { lx = d1[0]; ly = d1[1]; lz = d1[2]; dot = lx * nx + ly * ny + lz * nz; lx -= dot * nx; ly -= dot * ny; lz -= dot * nz; ll = Math.sqrt(lx * lx + ly * ly + lz * lz); }
      lx /= ll; ly /= ll; lz /= ll;
      const mx = ny * lz - nz * ly, my = nz * lx - nx * lz, mz = nx * ly - ny * lx;
      PL[3 * k] = lx; PL[3 * k + 1] = ly; PL[3 * k + 2] = lz; PM[3 * k] = mx; PM[3 * k + 1] = my; PM[3 * k + 2] = mz;
      let rmax = 0, warp = 0;
      for (let q = 0; q < 4; q++) {
        const ex = v[q][0] - C[0], ey = v[q][1] - C[1], ez = v[q][2] - C[2];
        rmax = Math.max(rmax, Math.sqrt(ex * ex + ey * ey + ez * ez)); warp = Math.max(warp, Math.abs(ex * nx + ey * ny + ez * nz));
        PF[8 * k + 2 * q] = ex * lx + ey * ly + ez * lz; PF[8 * k + 2 * q + 1] = ex * mx + ey * my + ez * mz;
      }
      PD[k] = 2 * rmax; PW[k] = warp; maxWarp = Math.max(maxWarp, warp / (2 * rmax));
    }
    const S = { count: n, nodes, quads, PV, PC, PN, PL, PM, PF, PA, PD, PW, SELF, maxWarpRatio: maxWarp };
    for (let k = 0; k < n; k++) SELF[k] = sourceLocal(S, k, 0, 0, 0);
    return S;
  }
  // (1/4pi) * integral dS/r over the flattened panel k, field point in panel-local coordinates.
  function sourceLocal(S, k, x, y, z) {
    const F = S.PF, o = 8 * k;
    let sum = 0, omega = 0;
    for (let e = 0; e < 4; e++) {
      const a = o + 2 * e, b = o + 2 * ((e + 1) & 3), xa = F[a], ya = F[a + 1], xb = F[b], yb = F[b + 1];
      const ex = xb - xa, ey = yb - ya, d = sqrt(ex * ex + ey * ey);
      if (!(d > 1e-14 * S.PD[k])) continue;
      const ra = sqrt((x - xa) * (x - xa) + (y - ya) * (y - ya) + z * z), rb = sqrt((x - xb) * (x - xb) + (y - yb) * (y - yb) + z * z);
      const perp = (ex * (y - ya) - ey * (x - xa)) / d, den = ra + rb - d;
      if (den > 1e-15 * (ra + rb) && absv(perp) > 0) sum += perp * logn((ra + rb + d) / den);
    }
    if (z !== 0) omega = triAngle(x, y, z, F[o], F[o + 1], 0, F[o + 2], F[o + 3], 0, F[o + 4], F[o + 5], 0) + triAngle(x, y, z, F[o], F[o + 1], 0, F[o + 4], F[o + 5], 0, F[o + 6], F[o + 7], 0);
    return (sum - z * omega) * INV4PI;
  }
  // Influence of panel k (unit source, unit doublet) at a field point not on the panel.
  // Doublet sign: +1/2 just outside (normal side), -1/2 just inside.
  let outS = 0, outD = 0;
  function influence(S, k, px, py, pz, far2) {
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz;
    const nx = S.PN[c], ny = S.PN[c + 1], nz = S.PN[c + 2];
    const lim = far2 * S.PD[k] * S.PD[k];
    if (r2 > lim) { const r = sqrt(r2), a = S.PA[k] * INV4PI; outS = a / r; outD = a * (dx * nx + dy * ny + dz * nz) / (r2 * r); return; }
    const V = S.PV, o = 12 * k;
    outD = (triAngle(px, py, pz, V[o], V[o + 1], V[o + 2], V[o + 3], V[o + 4], V[o + 5], V[o + 6], V[o + 7], V[o + 8]) +
      triAngle(px, py, pz, V[o], V[o + 1], V[o + 2], V[o + 6], V[o + 7], V[o + 8], V[o + 9], V[o + 10], V[o + 11])) * INV4PI;
    outS = sourceLocal(S, k, dx * S.PL[c] + dy * S.PL[c + 1] + dz * S.PL[c + 2], dx * S.PM[c] + dy * S.PM[c + 1] + dz * S.PM[c + 2], dx * nx + dy * ny + dz * nz);
  }

  // ------------------------------------------------------------------ dense LU (partial pivoting)
  function luFactor(a, n) {
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k, best = absv(a[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = absv(a[i * n + k]); if (v > best) { best = v; p = i; } }
      if (!(best > 0)) throw new Error('The panel influence matrix is singular; check the mesh for duplicate or inverted panels.');
      piv[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; }
      const inv = 1 / a[k * n + k], rk = k * n;
      for (let i = k + 1; i < n; i++) {
        const ri = i * n, f = a[ri + k] * inv; a[ri + k] = f;
        if (f !== 0) for (let j = k + 1; j < n; j++) a[ri + j] -= f * a[rk + j];
      }
    }
    return piv;
  }
  function luSolve(a, n, piv, b) {
    const x = Float64Array.from(b);
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; } }
    for (let i = 1; i < n; i++) { let s = x[i]; const ri = i * n; for (let j = 0; j < i; j++) s -= a[ri + j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; const ri = i * n; for (let j = i + 1; j < n; j++) s -= a[ri + j] * x[j]; x[i] = s / a[ri + i]; }
    return x;
  }

  // ------------------------------------------------------------------ assembly and unit solutions
  // options: image (mirror about y = 0, symmetric flow), wake {count, ax..: TE points, dir, upper, lower},
  // farField (point-singularity approximation beyond farField panel diameters; Infinity = exact).
  function assemble(S, options = {}) {
    const n = S.count, image = !!options.image, far2 = (options.farField ?? DEFAULT_MESH.farField) ** 2;
    const A = new Float64Array(n * n), bx = new Float64Array(n), by = new Float64Array(n), bz = new Float64Array(n);
    const W = options.wake || null;
    for (let i = 0; i < n; i++) {
      const px = S.PC[3 * i], py = S.PC[3 * i + 1], pz = S.PC[3 * i + 2], row = i * n;
      let sx = 0, sy = 0, sz = 0;
      for (let k = 0; k < n; k++) {
        let s, d;
        if (k === i) { s = S.SELF[k]; d = -0.5; } else { influence(S, k, px, py, pz, far2); s = outS; d = outD; }
        let sMirror = 0;
        if (image) { influence(S, k, px, -py, pz, far2); d += outD; sMirror = outS; }
        A[row + k] = d;
        const nx = S.PN[3 * k], ny = S.PN[3 * k + 1], nz = S.PN[3 * k + 2], st = s + sMirror;
        sx += st * nx; sz += st * nz; sy += (s - sMirror) * ny;
      }
      bx[i] = sx; by[i] = sy; bz[i] = sz;
      if (W) for (let w = 0; w < W.count; w++) {
        const o = 3 * w;
        let d = semiInfiniteAngle(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
        if (image) d += semiInfiniteAngle(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
        d *= INV4PI; for (let q = 0; q < W.kuttaWidth; q++) { const c = W.kuttaWeights[w * W.kuttaWidth + q]; if (c) A[row + W.kuttaPanels[w * W.kuttaWidth + q]] += d * c; }
      }
    }
    return { A, bx, by, bz };
  }
  // Restarted GMRES (modified Gram-Schmidt, Givens rotations) with Jacobi (row-diagonal) scaling.
  // The internal-Dirichlet doublet system is a second-kind integral equation (diagonal near -1/2),
  // so Krylov iterations converge quickly; the caller verifies the true residual and falls back to LU.
  // Block-Jacobi preconditioner: LU of the diagonal blocks [start, size] (one spanwise strip each for
  // the wing, so the chordwise and Kutta coupling of a strip is inverted exactly).
  function blockPreconditioner(A, n, blocks) {
    const list = blocks && blocks.length ? blocks : Array.from({ length: n }, (_, i) => [i, 1]);
    const factors = list.map(([s, m]) => { const B = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) B[i * m + j] = A[(s + i) * n + s + j]; const piv = luFactor(B, m); return { s, m, B, piv }; });
    return (v, out) => { for (const f of factors) { const x = luSolve(f.B, f.m, f.piv, v.subarray(f.s, f.s + f.m)); out.set(x, f.s); } };
  }
  function gmres(A, n, b, options = {}) {
    const tol = options.tol ?? 1e-12, m = Math.min(options.restart ?? 60, n), maxIter = options.maxIter ?? 400;
    const precond = options.precond || blockPreconditioner(A, n, options.blocks), tmp = new Float64Array(n);
    const mv = (v, out) => { for (let i = 0; i < n; i++) { let s = 0; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * v[k]; tmp[i] = s; } precond(tmp, out); };
    const pb = new Float64Array(n); precond(Float64Array.from(b), pb);
    const bn = Math.sqrt(pb.reduce((s, v) => s + v * v, 0)) || 1;
    const x = new Float64Array(n), r = new Float64Array(n), w = new Float64Array(n), V = Array.from({ length: m + 1 }, () => new Float64Array(n));
    const H = Array.from({ length: m + 1 }, () => new Float64Array(m)), cs = new Float64Array(m), sn = new Float64Array(m), gg = new Float64Array(m + 1);
    let it = 0, rel = Infinity;
    while (it < maxIter) {
      mv(x, r); for (let i = 0; i < n; i++) r[i] = pb[i] - r[i];
      const beta = Math.sqrt(r.reduce((s, v) => s + v * v, 0)); rel = beta / bn;
      if (rel <= tol) break;
      for (let i = 0; i < n; i++) V[0][i] = r[i] / beta;
      gg.fill(0); gg[0] = beta;
      let j = 0;
      for (; j < m && it < maxIter; j++, it++) {
        mv(V[j], w);
        for (let i = 0; i <= j; i++) { let h = 0; const vi = V[i]; for (let q = 0; q < n; q++) h += w[q] * vi[q]; H[i][j] = h; for (let q = 0; q < n; q++) w[q] -= h * vi[q]; }
        const hn = Math.sqrt(w.reduce((s, v) => s + v * v, 0)); H[j + 1][j] = hn;
        if (hn > 0) for (let q = 0; q < n; q++) V[j + 1][q] = w[q] / hn;
        for (let i = 0; i < j; i++) { const t = cs[i] * H[i][j] + sn[i] * H[i + 1][j]; H[i + 1][j] = -sn[i] * H[i][j] + cs[i] * H[i + 1][j]; H[i][j] = t; }
        const den = Math.hypot(H[j][j], H[j + 1][j]); cs[j] = H[j][j] / den; sn[j] = H[j + 1][j] / den;
        H[j][j] = den; H[j + 1][j] = 0; gg[j + 1] = -sn[j] * gg[j]; gg[j] = cs[j] * gg[j];
        rel = Math.abs(gg[j + 1]) / bn;
        if (rel <= tol || hn === 0) { j++; it++; break; }
      }
      const y = new Float64Array(j);
      for (let i = j - 1; i >= 0; i--) { let s = gg[i]; for (let k = i + 1; k < j; k++) s -= H[i][k] * y[k]; y[i] = s / H[i][i]; }
      for (let i = 0; i < j; i++) { const vi = V[i], yi = y[i]; for (let q = 0; q < n; q++) x[q] += yi * vi[q]; }
      if (rel <= tol) break;
    }
    return { x, iterations: it, preconditionedRelativeResidual: rel };
  }
  function trueResidual(A, n, x, b) {
    let rmax = 0, bmax = 0;
    for (let i = 0; i < n; i++) { let s = -b[i]; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * x[k]; rmax = Math.max(rmax, Math.abs(s)); bmax = Math.max(bmax, Math.abs(b[i])); }
    return rmax / Math.max(bmax, 1e-300);
  }
  // Solves for the doublet strengths of unit freestreams along x, z (and y without the image).
  // solver: 'auto' (LU up to luMaxPanels, GMRES above with LU fallback), 'lu' or 'gmres'.
  function unitSolutions(S, options = {}) {
    const n = S.count, t0 = now(), sys = assemble(S, options), t1 = now();
    const rhs = [Float64Array.from(sys.bx, v => -v), Float64Array.from(sys.bz, v => -v), ...(options.image ? [] : [Float64Array.from(sys.by, v => -v)])];
    const mode = options.solver ?? 'auto', useGmres = mode === 'gmres' || (mode === 'auto' && n > (options.luMaxPanels ?? 900));
    let solutions = null, method = 'LU with partial pivoting', iterations = null, residual = 0;
    if (useGmres) {
      const precond = blockPreconditioner(sys.A, n, options.blocks);
      const out = rhs.map(b => gmres(sys.A, n, b, { ...options, precond })), res = out.map((o, i) => trueResidual(sys.A, n, o.x, rhs[i]));
      if (res.every(r => r <= 1e-9)) { solutions = out.map(o => o.x); method = `restarted GMRES(60), ${options.blocks ? 'strip block-Jacobi' : 'Jacobi'} preconditioning`; iterations = out.map(o => o.iterations); residual = Math.max(...res); }
      else method = `LU fallback after GMRES residual ${Math.max(...res).toExponential(2)}`;
    }
    const t2 = now();
    if (!solutions) {
      const keep = n <= (options.keepMatrixPanels ?? LIMITS.keepMatrixPanels) ? Float64Array.from(sys.A) : null;
      const piv = luFactor(sys.A, n);
      solutions = rhs.map(b => luSolve(sys.A, n, piv, b));
      residual = keep ? Math.max(...solutions.map((x, i) => trueResidual(keep, n, x, rhs[i]))) : null;
    }
    const t3 = now();
    return { mux: solutions[0], muz: solutions[1], muy: options.image ? null : solutions[2], method, iterations,
      timing: { assembleMs: t1 - t0, solveMs: t3 - t1 }, relativeResidual: residual };
  }

  // ------------------------------------------------------------------ surface gradient
  // Lagrange derivative weights at s[t] through three parameter values s[0..2].
  function lagrange3(s0, s1, s2, t) {
    const st = [s0, s1, s2][t];
    return [((st - s1) + (st - s2)) / ((s0 - s1) * (s0 - s2)), ((st - s0) + (st - s2)) / ((s1 - s0) * (s1 - s2)), ((st - s0) + (st - s1)) / ((s2 - s0) * (s2 - s1))];
  }
  // Directional derivative and tangent along three points P[], values f[], at point index t.
  function lineDerivative(P, f, t) {
    if (P.length === 2) { const d = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; return { T: d.map(v => v / Math.sqrt(l2)), df: (f[1] - f[0]) / Math.sqrt(l2) }; }
    const d01 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]), d12 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1], P[2][2] - P[1][2]);
    const w = lagrange3(0, d01, d01 + d12, t);
    return { T: [0, 1, 2].map(c => w[0] * P[0][c] + w[1] * P[1][c] + w[2] * P[2][c]), df: w[0] * f[0] + w[1] * f[1] + w[2] * f[2] };
  }
  // Solve [T1; T2; n] g = [d1; d2; 0] for the tangential gradient g.
  function tangentialGradient(T1, d1, T2, d2, n) {
    const M = [T1, T2, n], r = [d1, d2, 0];
    const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det3(M);
    if (!(Math.abs(D) > 1e-14)) throw new Error('Degenerate surface-gradient stencil: two difference directions are parallel.');
    return [0, 1, 2].map(c => det3(M.map((row, i) => row.map((v, j) => (j === c ? r[i] : v)))) / D);
  }
  // Tangential velocity of each panel for a freestream V and doublet mu (perturbation potential).
  // Default 'unfolded' scheme: the three-point line derivatives of the previous scheme, taken on the SURFACE. Each
  // stencil neighbour's centroid is rotated into the plane of panel k about the edge(s) it shares with the chain
  // towards k (the surface is unfolded flat), so the line through the stencil lies in k's tangent plane and the
  // parameter is the surface distance. On a smooth, resolved surface this differs from the previous scheme only at
  // second order; where the surface folds back within a panel width (a thin leading edge; the flattened leading- and
  // trailing-edge parts of the rounded tip, where the section scale tau goes to zero; across the tip seam) the
  // straight chord between centroids was much shorter than the surface path and pointed nearly along the panel
  // normal, which inflated dmu/ds and made the 3 x 3 gradient system nearly singular.
  // Patch panels are the quads (i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1) of a structured grid: edge v3v0 / v1v2
  // is shared with neighbour i - 1 / i + 1, edge v0v1 / v2v3 with j - 1 / j + 1 (checked; otherwise 'legacy').
  // Boundaries: 'wrap', 'open' (one-sided), 'mirror' (y = 0 image) and, for the last row of a closed rounded tip,
  // jEnd 'seam': the surface continues across the tip edge onto the opposite panel seam(i) of the same row, which
  // shares that edge (no wake leaves the tip edge, so the doublet is continuous across it). The two stencil
  // directions stay as the grid gives them (oblique with sweep, dihedral and taper); nothing is orthogonalised.
  function surfaceVelocity(S, layout, mu, Vinf, options = {}) {
    if ((options.scheme ?? 'unfolded') === 'legacy') return surfaceVelocityLegacy(S, layout, mu, Vinf);
    const n = S.count, out = new Float64Array(3 * n), PV = S.PV, PN = S.PN, PC = S.PC;
    const vtx = (k, q) => [PV[12 * k + 3 * q], PV[12 * k + 3 * q + 1], PV[12 * k + 3 * q + 2]];
    const C = k => [PC[3 * k], PC[3 * k + 1], PC[3 * k + 2]], N = k => [PN[3 * k], PN[3 * k + 1], PN[3 * k + 2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // rotate X about the line (Ea, Eb) by the angle that turns plane normal nFrom into nTo
    const hinge = (X, Ea, Eb, nFrom, nTo) => {
      const d = sub(Eb, Ea), l = Math.sqrt(dot(d, d));
      if (!(l > 0)) return X;
      const e = [d[0] / l, d[1] / l, d[2] / l], ef = dot(e, nFrom), et = dot(e, nTo);
      const phi = Math.atan2(dot(e, crs(nFrom, nTo)), dot(nFrom, nTo) - ef * et), c = Math.cos(phi), s = Math.sin(phi);
      const v = sub(X, Ea), ev = dot(e, v), w = crs(e, v);
      return [0, 1, 2].map(q => Ea[q] + v[q] * c + w[q] * s + e[q] * ev * (1 - c));
    };
    const edge = (k, e) => [vtx(k, e), vtx(k, (e + 1) & 3)];
    const shares = (k, ek, m, em) => { const [a0, a1] = edge(k, ek), [b0, b1] = edge(m, em), tol = 1e-4 * (S.PD[k] + S.PD[m]);
      const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tol;
      return (near(a0, b1) && near(a1, b0)) || (near(a0, b0) && near(a1, b1)); };
    // centroid of m, unfolded into the plane of k across k's edge ek (m adjacent to k)
    const unfold1 = (k, ek, m, X = C(m), nm = N(m)) => { const [a, b] = edge(k, ek); return hinge(X, a, b, nm, N(k)); };
    const toPlane = (k, X) => { const nk = N(k), h = dot(sub(X, C(k)), nk); return [X[0] - h * nk[0], X[1] - h * nk[1], X[2] - h * nk[2]]; };
    for (const patch of layout.patches) {
      const { ni, nj, index } = patch;
      let structured = !patch.cross && ni >= 3 && nj >= 3;
      if (structured) for (let j = 0; j < nj && structured; j++) for (let i = 0; i < ni && structured; i++) {
        const k = index(i, j);
        if ((i < ni - 1 || patch.iMode === 'wrap') && !shares(k, 1, index((i + 1) % ni, j), 3)) structured = false;
        if (j < nj - 1 && !shares(k, 2, index(i, j + 1), 0)) structured = false;
        if (j === nj - 1 && patch.jEnd === 'seam' && !shares(k, 2, index(patch.seam(i), j), 2)) structured = false;
      }
      if (!structured) { // tip-cap row, tiny or unstructured patches: previous scheme
        const v = surfaceVelocityLegacy(S, { patches: [patch] }, mu, Vinf);
        for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const k = index(i, j); for (let c = 0; c < 3; c++) out[3 * k + c] = v[3 * k + c]; }
        continue;
      }
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const k = index(i, j), Ck = C(k), nk = N(k);
        // chordwise (i): neighbour i - 1 across k's edge 3, i + 1 across k's edge 1
        let P, f, t;
        if (patch.iMode === 'wrap' || (i > 0 && i < ni - 1)) {
          const a = index((i - 1 + ni) % ni, j), b = index((i + 1) % ni, j);
          P = [unfold1(k, 3, a), Ck, unfold1(k, 1, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (i === 0) { // one-sided: i + 2 unfolded into i + 1's plane, then both into k's
          const b = index(1, j), c = index(2, j), cb = unfold1(b, 1, c);
          P = [Ck, unfold1(k, 1, b), unfold1(k, 1, b, cb)]; f = [mu[k], mu[b], mu[c]]; t = 0;
        } else {
          const b = index(ni - 2, j), a = index(ni - 3, j), ab = unfold1(b, 3, a);
          P = [unfold1(k, 3, b, ab), unfold1(k, 3, b), Ck]; f = [mu[a], mu[b], mu[k]]; t = 2;
        }
        const di = lineDerivative(P.map(X => toPlane(k, X)), f, t);
        // spanwise (j): neighbour j - 1 across k's edge 0, j + 1 across k's edge 2
        if (j > 0 && j < nj - 1) {
          const a = index(i, j - 1), b = index(i, j + 1);
          P = [unfold1(k, 0, a), Ck, unfold1(k, 2, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (j === 0 && patch.jMode === 'mirror') { // image about y = 0 shares the root edge; same doublet
          const b = index(i, 1);
          P = [unfold1(k, 0, -1, [Ck[0], -Ck[1], Ck[2]], [nk[0], -nk[1], nk[2]]), Ck, unfold1(k, 2, b)]; f = [mu[k], mu[k], mu[b]]; t = 1;
        } else if (j === nj - 1 && patch.jEnd === 'seam') { // closed rounded tip: across the tip edge onto the other surface
          const a = index(i, j - 1), b = index(patch.seam(i), j);
          P = [unfold1(k, 0, a), Ck, unfold1(k, 2, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (j === 0) {
          const b = index(i, 1), c = index(i, 2), cb = unfold1(b, 2, c);
          P = [Ck, unfold1(k, 2, b), unfold1(k, 2, b, cb)]; f = [mu[k], mu[b], mu[c]]; t = 0;
        } else {
          const b = index(i, nj - 2), a = index(i, nj - 3), ab = unfold1(b, 0, a);
          P = [unfold1(k, 0, b, ab), unfold1(k, 0, b), Ck]; f = [mu[a], mu[b], mu[k]]; t = 2;
        }
        const dj = lineDerivative(P.map(X => toPlane(k, X)), f, t);
        const g = tangentialGradient(di.T, di.df, dj.T, dj.df, nk);
        const vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
        for (let c = 0; c < 3; c++) out[3 * k + c] = Vinf[c] - vn * nk[c] + g[c];
      }
    }
    return out;
  }
  function surfaceVelocityLegacy(S, layout, mu, Vinf) {
    const n = S.count, out = new Float64Array(3 * n), C = k => [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]];
    const nrm = k => [S.PN[3 * k], S.PN[3 * k + 1], S.PN[3 * k + 2]];
    const stencil = (len, idx, mode, pos, val, at) => {
      // returns {P, f, t} for index idx along a line of length len
      if (mode === 'wrap') return { P: [pos((idx - 1 + len) % len), pos(idx), pos((idx + 1) % len)], f: [val((idx - 1 + len) % len), val(idx), val((idx + 1) % len)], t: 1 };
      if (len === 1) return null;
      if (len === 2) return { P: [pos(0), pos(1)], f: [val(0), val(1)], t: idx };
      if (idx === 0 && mode === 'mirror') return { P: [at.mirrorPos(), pos(0), pos(1)], f: [val(0), val(0), val(1)], t: 1 };
      if (idx === 0) return { P: [pos(0), pos(1), pos(2)], f: [val(0), val(1), val(2)], t: 0 };
      if (idx === len - 1) return { P: [pos(len - 3), pos(len - 2), pos(len - 1)], f: [val(len - 3), val(len - 2), val(len - 1)], t: 2 };
      return { P: [pos(idx - 1), pos(idx), pos(idx + 1)], f: [val(idx - 1), val(idx), val(idx + 1)], t: 1 };
    };
    for (const patch of layout.patches) {
      const { ni, nj, index } = patch;
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const k = index(i, j), nk = nrm(k);
        const si = stencil(ni, i, patch.iMode, q => C(index(q, j)), q => mu[index(q, j)], {});
        const sj = stencil(nj, j, patch.jMode, q => C(index(i, q)), q => mu[index(i, q)], { mirrorPos: () => { const c = C(index(i, 0)); return [c[0], -c[1], c[2]]; } });
        let g;
        const a = lineDerivative(si.P, si.f, si.t);
        if (sj) { const b = lineDerivative(sj.P, sj.f, sj.t); g = tangentialGradient(a.T, a.df, b.T, b.df, nk); }
        else if (patch.cross) { const c = patch.cross(i, j); const P0 = C(c[0]), P1 = C(c[1]); const b = lineDerivative([P0, P1], [mu[c[0]], mu[c[1]]], 0); g = tangentialGradient(a.T, a.df, b.T, b.df, nk); }
        else throw new Error('A one-row patch needs a cross-direction rule.');
        const vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
        for (let c = 0; c < 3; c++) out[3 * k + c] = Vinf[c] - vn * nk[c] + g[c];
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ wing geometry adapter
  const GEOMETRY_KEYS = ['planform', 'semiSpan', 'rootChord', 'tipChord', 'sweepDeg', 'dihedralDeg', 'sweepReferenceFraction', 'twistReferenceFraction', 'twistEnabled', 'airfoil', 'naca', 'stations'];
  const GEOMETRY_DEFAULTS = Object.freeze({ naca: '2412', semiSpan: 450, rootChord: 160, tipChord: 100 }); // engine.js DEFAULT_GEOMETRY values
  // Accepts a WingEngine.makeGeometry result or a raw study geometry; keeps only the outer-surface fields.
  // Field names that look like geometry but are not Wing Lab names: refused, so a misspelling cannot
  // silently fall back to a default (a WingEngine.makeGeometry result never contains them).
  const MISNAMED = Object.freeze({ dihedral: 'dihedralDeg', sweep: 'sweepDeg', span: 'semiSpan (half span, mm)', semispan: 'semiSpan', chord: 'rootChord and tipChord',
    rootchord: 'rootChord', tipchord: 'tipChord', taper: 'tipChord', twist: 'stations[].incidenceDeg with twistEnabled', incidence: 'stations[].incidenceDeg',
    incidenceDeg: 'stations[].incidenceDeg', alpha: 'the flow field alphaDeg', alphaDeg: 'the flow field alphaDeg', aoa: 'the flow field alphaDeg', airfoilName: 'naca or airfoil' });
  const squash = k => String(k).toLowerCase().replace(/[^a-z]/g, '');
  const MISNAMED_SQUASHED = new Map([...Object.entries(MISNAMED).map(([k, v]) => [squash(k), v]),
    ...['sweepangle', 'sweepangledeg', 'dihedralangle', 'dihedralangledeg', 'twistdeg', 'twistangle', 'spanmm', 'halfspan', 'aspectratio'].map(k => [k, 'the Wing Lab geometry names (semiSpan, rootChord, tipChord, sweepDeg, dihedralDeg, stations)'])]);
  function aeroGeometry(raw = {}) {
    for (const k of Object.keys(raw || {})) {
      // refuse geometry-like names that are not Wing Lab names, including case and separator variants of
      // real names (dihedral_deg, SemiSpan), so a typing error cannot fall back silently to a default
      const sq = squash(k), real = GEOMETRY_KEYS.find(n => squash(n) === sq);
      if (real && real !== k) throw new Error(`Unknown geometry field "${k}": use ${real}.`);
      if (!real && MISNAMED_SQUASHED.has(sq)) throw new Error(`Unknown geometry field "${k}": use ${MISNAMED_SQUASHED.get(sq)}.`);
    }
    const g = { ...GEOMETRY_DEFAULTS };
    for (const k of GEOMETRY_KEYS) if (raw[k] !== undefined && raw[k] !== null) g[k] = raw[k];
    for (const k of ['semiSpan', 'rootChord']) finiteIn(g[k], k + ' (mm)', 1e-3, 1e6);
    finiteIn(g.tipChord, 'tipChord (mm)', 0, g.rootChord);
    Object.assign(g, Geometry.normalizeGeometryFields(g));
    if (!(g.tipChord > 0) && !Geometry.closedTip(g)) throw new Error('A zero tip chord is supported only for the exact elliptic or delta closed-tip planforms.');
    return Object.freeze(g);
  }
  // Canonical text of the outer aerodynamic shape (every field the panel mesh depends on). A stored aerodynamic load
  // belongs to the wing with the same key (the application keeps its SHA-256 with the load).
  // Defaults are written out, so equivalent descriptions of the same wing (a field omitted or set to its default) agree.
  function geometryKey(rawGeometry) {
    const g = aeroGeometry(rawGeometry), planform = g.planform ?? 'linear';
    return JSON.stringify({ planform, semiSpan: g.semiSpan, rootChord: g.rootChord, tipChord: g.tipChord, sweepDeg: g.sweepDeg ?? 0, dihedralDeg: g.dihedralDeg ?? 0,
      sweepReferenceFraction: g.sweepReferenceFraction ?? (planform === 'elliptic' ? 0.5 : planform === 'delta' ? 1 : 0), twistReferenceFraction: g.twistReferenceFraction ?? 0.25,
      sections: g.stations ? g.stations.map(st => [st.eta, st.airfoil, st.incidenceDeg]) : [g.airfoil ?? g.naca] });
  }
  function sectionLoop(g, y, nHalf) {
    const c = Geometry.chordAt(g, y);
    if (!(c > 1e-9 * g.rootChord)) return null; // exact closed tip: the station collapses to one point
    const s = Airfoils.surfaces(Geometry.airfoilAt(g, y), c, 0, nHalf + 1); // te = 0: sharp aerodynamic TE
    const pts = [];
    for (let i = 0; i <= nHalf; i++) pts.push([s.xl[nHalf - i], s.zl[nHalf - i]]);
    for (let i = 1; i <= nHalf; i++) pts.push([s.xu[i], s.zu[i]]);
    return pts;
  }
  function spanStations(g, nSpan, spacing) {
    const L = g.semiSpan, ys = [];
    for (let j = 0; j <= nSpan; j++) { const t = j / nSpan; ys.push(spacing === 'uniform' ? L * t : spacing === 'cosine' ? L * (1 - Math.cos(Math.PI * t)) / 2 : L * Math.sin(Math.PI * t / 2)); }
    ys[0] = 0; ys[nSpan] = L;
    for (const yb of (g.stations || []).map(s => s.eta * L).filter(y => y > 1e-9 * L && y < L * (1 - 1e-9))) {
      let k = 1; while (k < ys.length - 1 && Math.abs(ys[k + 1] - yb) < Math.abs(ys[k] - yb)) k++;
      const local = Math.min(ys[k] - ys[k - 1], ys[k + 1] - ys[k]);
      if (Math.abs(ys[k] - yb) <= 0.3 * local) ys[k] = yb; else { ys.push(yb); ys.sort((a, b) => a - b); }
    }
    return ys;
  }
  // Panel mesh of the right semi-wing. options.sectionLoop(y, nHalf) may supply local [x, z] points
  // (lower TE -> LE -> upper TE, 2 nHalf + 1 points) for analytic benchmark sections.
  function wingMesh(g, mesh = {}, limits = LIMITS) {
    const m = { ...DEFAULT_MESH, ...mesh };
    const nHalf = intIn(m.chordPanels, 'Chordwise panels per surface', ...limits.chordPanels), ni = 2 * nHalf;
    intIn(m.spanPanels, 'Spanwise panels', ...limits.spanPanels);
    if (!['sine', 'cosine', 'uniform'].includes(m.spanSpacing)) throw new Error('Span spacing must be sine (tip-clustered), cosine or uniform.');
    if (!['flat', 'rounded'].includes(m.tipClosure)) throw new Error('Tip closure must be flat or rounded.');
    let ys = spanStations(g, m.spanPanels, m.spanSpacing);
    const closed = Geometry.closedTip(g), L = g.semiSpan;
    let loop = m.sectionLoop || ((y, h) => sectionLoop(g, y, h)), rounding = null;
    if (m.tipClosure === 'rounded' && !closed) {
      // Rounded aerodynamic tip: inside the last l of span the section thickness about its camber line is
      // scaled by tau = sqrt(1 - ((y - (L - l)) / l)^2), so the surface closes on a sharp side edge at y = L
      // (no flat cap). l = half the tip section's maximum thickness (a semicircular-like spanwise rounding).
      const tip = loop(L, nHalf), base = loop;
      const tMax = Math.max(...tip.map((p, i) => Math.hypot(p[0] - tip[ni - i][0], p[1] - tip[ni - i][1])));
      // rounding strips refine with the spanwise mesh ('auto': max(2, round(spanPanels / 4))), so a spanwise
      // refinement study also refines the tip rounding
      const ell = Math.min(0.5 * tMax, 0.25 * L), y0 = L - ell, mRound = m.roundingStrips === 'auto' ? Math.max(2, Math.round(m.spanPanels / 4)) : m.roundingStrips;
      ys = [...ys.filter(y => y < y0 - 0.25 * ell / mRound), ...Array.from({ length: mRound + 1 }, (_, k) => y0 + ell * Math.sin(Math.PI / 2 * k / mRound))];
      ys[ys.length - 1] = L;
      loop = (y, h) => {
        const pts = base(y, h); if (!pts || y <= y0) return pts;
        const tau = Math.sqrt(Math.max(0, 1 - ((y - y0) / ell) ** 2));
        return pts.map((p, i) => { const q = pts[ni - i], cx = 0.5 * (p[0] + q[0]), cz = 0.5 * (p[1] + q[1]); return [cx + tau * (p[0] - cx), cz + tau * (p[1] - cz)]; });
      };
      rounding = { length_mm: ell, start_mm: y0, strips: mRound };
    }
    const ns = ys.length - 1;
    const nodes = new Float64Array(3 * (ni + 1) * (ns + 1)), sections = [];
    for (let j = 0; j <= ns; j++) {
      const y = ys[j], pts = loop(y, nHalf);
      if (pts && pts.length !== ni + 1) throw new Error('A section loop must have 2 nHalf + 1 points.');
      for (let i = 0; i <= ni; i++) {
        const P = Geometry.transformPoint(g, y, pts ? pts[i] : [0, 0]), o = 3 * (j * (ni + 1) + i);
        nodes[o] = P[0]; nodes[o + 1] = P[1]; nodes[o + 2] = P[2];
      }
      const st = Geometry.stationAt(g, y);
      sections.push({ y, chord: st.chord, xLE: st.xLE, zLE: st.zLE, incidenceDeg: st.incidenceDeg, collapsed: !pts });
    }
    if (!closed && sections[ns].collapsed) throw new Error('Only closed elliptic or delta tips may collapse to a point.');
    const roundedTip = !!rounding; // the tip edge closes the surface: no cap panels
    const node = (i, j) => j * (ni + 1) + i;
    const quads = [];
    for (let j = 0; j < ns; j++) for (let i = 0; i < ni; i++) quads.push(node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1));
    const wingPanels = ni * ns;
    const hasCap = !sections[ns].collapsed && !roundedTip;
    if (hasCap) for (let i = 0; i < nHalf; i++) quads.push(node(i, ns), node(i + 1, ns), node(ni - i - 1, ns), node(ni - i, ns));
    const S = buildSurface(nodes, Int32Array.from(quads));
    if (S.count > limits.maxPanels) throw new Error(`The panel mesh has ${S.count} panels; at most ${limits.maxPanels} are allowed in the browser.`);
    for (let k = wingPanels; k < S.count; k++) if (!(S.PN[3 * k + 1] > 0.99)) throw new Error('Tip-cap panel orientation check failed.');
    const index = (i, j) => j * ni + i;
    // a rounded tip closes the surface: the last row continues across the tip edge onto the opposite surface
    const patches = [{ ni, nj: ns, index, iMode: 'open', jMode: 'mirror', ...(roundedTip ? { jEnd: 'seam', seam: i => ni - 1 - i } : {}) }];
    if (hasCap) patches.push({ ni: nHalf, nj: 1, index: i => wingPanels + i, iMode: 'open', jMode: 'open', cross: i => [index(i, ns - 1), index(ni - 1 - i, ns - 1)] });
    // Morino Kutta condition: wake doublet = upper minus lower trailing-edge panel doublet. (A linear
    // extrapolation of each surface doublet to the TE edge was tested on exact Karman-Trefftz wings and
    // converged erratically, so it is not offered.) Weights are stored generally for the assembly.
    const kutta = 'centroid', width = 4;
    const wake = { count: ns, a: new Float64Array(3 * ns), b: new Float64Array(3 * ns), dir: m.wakeDirection ? m.wakeDirection.slice() : [1, 0, 0], upper: new Int32Array(ns), lower: new Int32Array(ns), kutta, kuttaWidth: width, kuttaPanels: new Int32Array(width * ns), kuttaWeights: new Float64Array(width * ns) };
    for (let j = 0; j < ns; j++) {
      for (let c = 0; c < 3; c++) { wake.a[3 * j + c] = nodes[3 * node(0, j) + c]; wake.b[3 * j + c] = nodes[3 * node(0, j + 1) + c]; }
      wake.upper[j] = index(ni - 1, j); wake.lower[j] = index(0, j);
      const side = (k1, k2, sign, o) => {
        wake.kuttaPanels[width * j + o] = k1; wake.kuttaWeights[width * j + o] = sign;
        wake.kuttaPanels[width * j + o + 1] = k2; wake.kuttaWeights[width * j + o + 1] = 0;
      };
      side(index(ni - 1, j), index(ni - 2, j), 1, 0); side(index(0, j), index(1, j), -1, 2);
    }
    const blocks = Array.from({ length: ns }, (_, j) => [j * ni, ni]);
    if (hasCap) blocks.push([wingPanels, nHalf]);
    return { S, layout: { patches }, wake, ys, sections, nHalf, ni, ns, wingPanels, hasCap, closedTip: closed, roundedTip: rounding, blocks, options: { chordPanels: nHalf, spanPanels: m.spanPanels, spanSpacing: m.spanSpacing, farField: m.farField, tipClosure: m.tipClosure, kutta }, index };
  }

  // ------------------------------------------------------------------ reference quantities
  function references(g) {
    const L = g.semiSpan, N = 400;
    let S = 0, Sc2 = 0, Scy = 0, Sx = 0, Sz = 0;
    // y = L sin(theta): smooth integrands for square-root (elliptic) chord laws; Simpson in theta.
    for (let k = 0; k <= N; k++) {
      const th = (Math.PI / 2) * k / N, y = L * Math.sin(th), w = (k === 0 || k === N ? 1 : k % 2 ? 4 : 2) * (Math.PI / 2) / (3 * N) * L * Math.cos(th);
      const st = Geometry.stationAt(g, Math.min(L, y)), c = st.chord;
      S += w * c; Sc2 += w * c * c; Scy += w * c * y; Sx += w * c * st.xLE; Sz += w * c * st.zLE;
    }
    const half = Geometry.area(g), mac = Sc2 / S;
    return { semiArea_mm2: half, area_mm2: 2 * half, span_mm: 2 * L, aspectRatio: (2 * L) ** 2 / (2 * half), mac_mm: mac, yMac_mm: Scy / S,
      momentPoint_mm: [Sx / S + 0.25 * mac, 0, Sz / S], areaQuadratureCheck: S / half - 1 };
  }

  // ------------------------------------------------------------------ input checks
  const FLOW_KEYS = ['speed', 'density', 'alphaDeg', 'betaDeg', 'viscosity', 'speedOfSound'];
  const MESH_KEYS = ['chordPanels', 'spanPanels', 'spanSpacing', 'farField', 'tipClosure', 'roundingStrips'];
  function normalizeFlow(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Flow conditions must be an object.');
    for (const k of Object.keys(raw)) if (!FLOW_KEYS.includes(k)) throw new Error(`Unknown flow field "${k}".`);
    const f = { ...DEFAULT_FLOW, ...raw };
    finiteIn(f.speed, 'Speed V (m/s)', 1e-3, 200); finiteIn(f.density, 'Density rho (kg/m^3)', 1e-3, 5);
    finiteIn(f.alphaDeg, 'Angle of attack (deg)', -LIMITS.maxAlphaDeg, LIMITS.maxAlphaDeg);
    if (f.betaDeg !== 0) throw new Error('Sideslip is not supported: this version solves symmetric flight only (beta = 0).');
    finiteIn(f.viscosity, 'Dynamic viscosity (Pa s)', 1e-7, 1e-2); finiteIn(f.speedOfSound, 'Speed of sound in air (m/s)', ...LIMITS.speedOfSound);
    const mach = f.speed / f.speedOfSound;
    if (mach > LIMITS.maxMach) throw new Error(`Mach ${mach.toFixed(3)} exceeds 0.3. This incompressible module has no validated compressibility treatment; reduce the speed.`);
    return Object.freeze({ ...f, mach });
  }
  function normalizeMesh(raw = {}, limits = LIMITS) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Mesh options must be an object.');
    for (const k of Object.keys(raw)) if (!MESH_KEYS.includes(k)) throw new Error(`Unknown mesh field "${k}".`);
    const m = { ...DEFAULT_MESH, ...raw };
    intIn(m.chordPanels, 'Chordwise panels per surface', ...limits.chordPanels); intIn(m.spanPanels, 'Spanwise panels', ...limits.spanPanels);
    if (!['flat', 'rounded'].includes(m.tipClosure)) throw new Error('Tip closure must be flat or rounded.');
    if (m.roundingStrips !== 'auto') intIn(m.roundingStrips, 'Tip rounding strips', 2, 16);
    if (!['sine', 'cosine', 'uniform'].includes(m.spanSpacing)) throw new Error('Span spacing must be sine, cosine or uniform.');
    if (m.farField !== Infinity) finiteIn(m.farField, 'Far-field ratio', 3, 1e9);
    return Object.freeze(m);
  }

  // ------------------------------------------------------------------ prepare (cached) and evaluate
  // options: cache (Map), progress(text), solver ('auto' | 'lu' | 'gmres'), and for analytic benchmark
  // sections only: sectionLoop(y, nHalf) with a sectionKey string identifying it in the cache key.
  function prepare(rawGeometry, rawMesh = {}, options = {}) {
    // options.referenceLimits: larger meshes for Node reference studies only (the Worker never passes it)
    const limits = options.referenceLimits ? { ...LIMITS, ...options.referenceLimits } : LIMITS;
    const g = aeroGeometry(rawGeometry), mesh = normalizeMesh(rawMesh, limits);
    if (options.sectionLoop && typeof options.sectionKey !== 'string') throw new Error('A custom section loop needs a sectionKey for caching.');
    const key = JSON.stringify([GEOMETRY_KEYS.map(k => g[k] ?? null), mesh, options.sectionKey ?? null, options.solver ?? 'auto', options.wakeDirection ?? null, options.gradientScheme ?? 'unfolded']);
    const cache = options.cache;
    if (cache && cache.has(key)) { const hit = cache.get(key); hit.lastCacheHit = true; return hit; }
    const t0 = now(), wm = wingMesh(g, { ...mesh, sectionLoop: options.sectionLoop, wakeDirection: options.wakeDirection }, limits), t1 = now();
    options.progress?.(`Assembling ${wm.S.count} panels with the mirror image and ${wm.wake.count} wake strips...`);
    const sol = unitSolutions(wm.S, { image: true, wake: wm.wake, farField: mesh.farField, solver: options.solver, blocks: wm.blocks });
    // Unit-freestream tangential velocities: V_t(a) = V (cos a Ux + sin a Uz).
    // options.gradientScheme: 'unfolded' (default) or 'legacy' (the previous straight-chord stencil, for comparison only)
    const gs = { scheme: options.gradientScheme ?? 'unfolded' };
    const Ux = surfaceVelocity(wm.S, wm.layout, sol.mux, [1, 0, 0], gs), Uz = surfaceVelocity(wm.S, wm.layout, sol.muz, [0, 0, 1], gs);
    const model = { version: VERSION, key, geometry: g, mesh, wm, sol, Ux, Uz, refs: references(g), timing: { meshMs: t1 - t0, ...sol.timing }, lastCacheHit: false };
    if (cache) { if (cache.size >= LIMITS.modelCache) cache.delete(cache.keys().next().value); cache.set(key, model); }
    return model;
  }

  // Trefftz-plane analysis of the wake trace (y-z plane; wake along +x), per unit V.
  // Midpoint rule for a piecewise-constant doublet trace: each segment is a 2-D doublet panel
  // (point vortices at its ends); normalwash at segment midpoints; D/(rho/2) = -sum mu w l.
  function trefftzMidpoint(trace, mu) {
    const ns = mu.length, segs = [];
    for (let j = 0; j < ns; j++) segs.push({ a: trace[j], b: trace[j + 1], mu: mu[j] });
    for (let j = 0; j < ns; j++) segs.push({ a: [-trace[j + 1][0], trace[j + 1][1]], b: [-trace[j][0], trace[j][1]], mu: mu[j] });
    const grad = (v, P) => { const X = v[0] - P[0], Y = v[1] - P[1], r2 = X * X + Y * Y; return r2 > 0 ? [Y / r2, -X / r2] : [0, 0]; };
    let dragOverHalfRho = 0, liftOverRhoV = 0;
    const wn = new Float64Array(ns);
    for (let i = 0; i < ns; i++) {
      const s = segs[i], ty = s.b[0] - s.a[0], tz = s.b[1] - s.a[1], l = Math.hypot(ty, tz), n = [-tz / l, ty / l], P = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      let vy = 0, vz = 0;
      for (const q of segs) { const gb = grad(q.b, P), ga = grad(q.a, P), f = q.mu / (2 * Math.PI); vy += f * (gb[0] - ga[0]); vz += f * (gb[1] - ga[1]); }
      wn[i] = vy * n[0] + vz * n[1];
      dragOverHalfRho += -2 * s.mu * wn[i] * l; // x2: the mirror half is identical
      liftOverRhoV += 2 * s.mu * ty;            // side forces of the two halves cancel
    }
    return { dragOverHalfRho, liftOverRhoV, normalwash: wn };
  }
  // The midpoint rule is first order in the strip width (-3.6% on an exact elliptic loading with 16
  // sine-spaced strips). Drag is therefore evaluated on a continuous piecewise-linear reconstruction
  // of the strip strengths (nodes at strip midpoints, mirror-symmetric at the root, zero at the tip),
  // sub-divided `refine` times. Lift is the exact Kutta-Joukowski sum of the discrete wake.
  function trefftz(trace, mu, refine = 16) {
    const ns = mu.length, base = trefftzMidpoint(trace, mu);
    if (refine <= 1) return { ...base, method: 'midpoint' };
    const s = [0]; for (let j = 0; j < ns; j++) s.push(s[j] + Math.hypot(trace[j + 1][0] - trace[j][0], trace[j + 1][1] - trace[j][1]));
    const mid = Array.from({ length: ns }, (_, j) => (s[j] + s[j + 1]) / 2), total = s[ns];
    const muAt = x => {
      if (x <= mid[0]) return mu[0];
      if (x >= mid[ns - 1]) return mu[ns - 1] * (total - x) / (total - mid[ns - 1]);
      let j = 0; while (j < ns - 2 && x > mid[j + 1]) j++;
      return mu[j] + (mu[j + 1] - mu[j]) * (x - mid[j]) / (mid[j + 1] - mid[j]);
    };
    const fine = [trace[0]], fineMu = [];
    for (let j = 0; j < ns; j++) for (let p = 1; p <= refine; p++) {
      const t = p / refine, a = trace[j], b = trace[j + 1];
      fine.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      fineMu.push(muAt(s[j] + (t - 0.5 / refine) * (s[j + 1] - s[j])));
    }
    const r = trefftzMidpoint(fine, fineMu);
    return { dragOverHalfRho: r.dragOverHalfRho, liftOverRhoV: base.liftOverRhoV, normalwash: base.normalwash, dragMidpointOverHalfRho: base.dragOverHalfRho, method: `piecewise-linear reconstruction, ${refine} sub-segments per strip` };
  }

  function evaluate(model, rawFlow = {}) {
    const flow = normalizeFlow(rawFlow), t0 = now();
    const { wm, sol, refs, geometry: g } = model, S = wm.S, n = S.count;
    const a = flow.alphaDeg * DEG, ca = Math.cos(a), sa = Math.sin(a), V = flow.speed;
    const q = 0.5 * flow.density * V * V, qmm = q * 1e-6; // Pa and N/mm^2
    const eD = [ca, 0, sa], eL = [-sa, 0, ca];
    const mu = new Float64Array(n), cp = new Float64Array(n), force = new Float64Array(3 * n), capForce = [0, 0, 0];
    // The flat tip cap closes the surface for the potential solution, but its pressure is NOT integrated
    // into loads: its trailing corner is the potential-flow edge singularity where the side edge of the wake
    // (the tip vortex) leaves the wing, so the cap Cp there is unbounded under chordwise refinement and the
    // cap force (purely spanwise, since Wing Lab sections lie in planes y = const) does not converge.
    // Cap pressures and that unconverged force are reported separately as diagnostics only.
    let maxCp = -Infinity, minCp = Infinity, capMinCp = null, capMaxCp = null;
    for (let k = 0; k < n; k++) {
      mu[k] = V * (ca * model.sol.mux[k] + sa * model.sol.muz[k]);
      const vx = ca * model.Ux[3 * k] + sa * model.Uz[3 * k], vy = ca * model.Ux[3 * k + 1] + sa * model.Uz[3 * k + 1], vz = ca * model.Ux[3 * k + 2] + sa * model.Uz[3 * k + 2];
      cp[k] = 1 - (vx * vx + vy * vy + vz * vz);
      if (k < wm.wingPanels) { maxCp = Math.max(maxCp, cp[k]); minCp = Math.min(minCp, cp[k]); }
      else { capMinCp = Math.min(capMinCp ?? Infinity, cp[k]); capMaxCp = Math.max(capMaxCp ?? -Infinity, cp[k]); }
      const f = -cp[k] * qmm * S.PA[k];
      if (k < wm.wingPanels) { force[3 * k] = f * S.PN[3 * k]; force[3 * k + 1] = f * S.PN[3 * k + 1]; force[3 * k + 2] = f * S.PN[3 * k + 2]; }
      else for (let d = 0; d < 3; d++) capForce[d] += f * S.PN[3 * k + d];
    }
    // semi-wing resultants (right half, body axes): about the root origin and about the moment point
    const sum = (from, to, ref) => { const F = [0, 0, 0], M = [0, 0, 0]; for (let k = from; k < to; k++) { const fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - ref[0], ry = S.PC[3 * k + 1] - ref[1], rz = S.PC[3 * k + 2] - ref[2]; F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx; } return { F, M }; };
    const origin = sum(0, n, [0, 0, 0]), atRef = sum(0, n, refs.momentPoint_mm);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const Sref = refs.area_mm2, liftFull = 2 * dot(origin.F, eL), dragFull = 2 * dot(origin.F, eD), pitchFull = 2 * atRef.M[1];
    const CL = liftFull / (qmm * Sref), CDp = dragFull / (qmm * Sref), Cm = pitchFull / (qmm * Sref * refs.mac_mm);
    // strips
    const strips = [], wakeMu = new Float64Array(wm.ns), trace = [];
    for (let j = 0; j < wm.ns; j++) trace.push([wm.wake.a[3 * j + 1], wm.wake.a[3 * j + 2]]);
    trace.push([wm.wake.b[3 * (wm.ns - 1) + 1], wm.wake.b[3 * (wm.ns - 1) + 2]]);
    let kuttaMax = 0, kuttaInterior = 0;
    for (let j = 0; j < wm.ns; j++) {
      const y0 = wm.ys[j], y1 = wm.ys[j + 1], ym = 0.5 * (y0 + y1), st = Geometry.stationAt(g, ym), chord = st.chord;
      const qc = Geometry.transformPoint(g, ym, [0.25 * chord, 0]);
      const F = [0, 0, 0], M = [0, 0, 0]; let Xz = 0;
      for (let i = 0; i < wm.ni; i++) {
        const k = wm.index(i, j), fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - qc[0], ry = S.PC[3 * k + 1] - qc[1], rz = S.PC[3 * k + 2] - qc[2];
        F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx; Xz += fz * S.PC[3 * k];
      }
      { let g = 0; for (let q = 0; q < wm.wake.kuttaWidth; q++) g += wm.wake.kuttaWeights[q + wm.wake.kuttaWidth * j] * mu[wm.wake.kuttaPanels[q + wm.wake.kuttaWidth * j]]; wakeMu[j] = g; }
      const dCpTE = cp[wm.wake.upper[j]] - cp[wm.wake.lower[j]]; kuttaMax = Math.max(kuttaMax, Math.abs(dCpTE));
      if (y1 <= 0.9 * g.semiSpan) kuttaInterior = Math.max(kuttaInterior, Math.abs(dCpTE));
      const dy = y1 - y0, lift = dot(F, eL);
      strips.push({ y0, y1, yMid: ym, chord, force_N: F, momentAboutQuarterChord_Nmm: M, quarterChordPoint_mm: qc,
        cl: chord > 0 ? lift / (qmm * chord * dy) : 0, clKuttaJoukowski: chord > 0 ? 2 * wakeMu[j] / (V * chord) : 0,
        xCenterOfPressure_mm: Math.abs(F[2]) > 0 ? Xz / F[2] : null, gamma: wakeMu[j], trailingEdgeDeltaCp: dCpTE });
    }
    const tr = trefftz(trace, Array.from(wakeMu, v => v / V));
    const CLt = 2 * tr.liftOverRhoV / Sref, CDi = tr.dragOverHalfRho / Sref; // per unit V: L/(q S) = 2 (L/rhoV)/(V S)
    const ar = refs.aspectRatio, e = CDi > 1e-12 && Math.abs(CLt) > 1e-6 ? CLt * CLt / (Math.PI * ar * CDi) : null;
    const reynolds = flow.density * V * (refs.mac_mm * 1e-3) / flow.viscosity;
    const warnings = [];
    const incid = (g.stations || []).map(s => s.incidenceDeg), aLocal = Math.max(...[0, ...incid].map(i => Math.abs(flow.alphaDeg + i)));
    if (aLocal > LIMITS.warnAlphaDeg) warnings.push(`Local geometric angle reaches ${aLocal.toFixed(1)} deg. This attached-flow model does not predict stall; treat results beyond the linear range as unsupported.`);
    if (flow.mach > LIMITS.warnMach) warnings.push(`Mach ${flow.mach.toFixed(3)}: compressibility (about ${(100 * (1 / Math.sqrt(1 - flow.mach ** 2) - 1)).toFixed(1)}% Prandtl-Glauert) is not applied.`);
    if (reynolds < LIMITS.lowReynolds) warnings.push(`Reynolds number ${reynolds.toExponential(2)} (mean aerodynamic chord): laminar separation and low-Re effects can reduce lift slope and maximum lift substantially; inviscid results are optimistic.`);
    if (g.planform === 'delta' || Math.abs(g.sweepDeg || 0) > 45) warnings.push('Highly swept or delta planform: leading-edge vortex lift is not modelled; attached-flow results are not reliable beyond small angles.');
    if (!wm.closedTip && g.tipChord < 0.05 * g.rootChord) warnings.push(`Tip chord ${(100 * g.tipChord / g.rootChord).toPrecision(2)}% of the root chord: the tip panels become slivers and local tip pressures are unreliable. For a pointed tip use the exact delta or elliptic closed-tip planform.`);
    if (kuttaInterior > 0.1) warnings.push(`Trailing-edge pressure mismatch up to ${kuttaInterior.toFixed(3)} (Cp) inboard of 90% semi-span: refine the chordwise mesh near the trailing edge.`);
    const dCL = CL !== 0 ? Math.abs(CLt - CL) / Math.abs(CL) : 0;
    if (dCL > 0.03 && Math.abs(CL) > 0.05) warnings.push(`Pressure-integrated and Trefftz lift differ by ${(100 * dCL).toFixed(1)}%: the mesh is too coarse for load use.`);
    if (maxCp > 1.02) warnings.push(`Maximum Cp ${maxCp.toFixed(3)} exceeds the stagnation value 1: the local mesh is inadequate.`);
    return {
      version: VERSION, scope: SCOPE, flow: { ...flow, dynamicPressure_Pa: q, reynoldsMac: reynolds },
      reference: refs, mesh: { panels: n, wingPanels: wm.wingPanels, tipCapPanels: n - wm.wingPanels, wakeStrips: wm.ns, chordPanelsPerSurface: wm.nHalf, spanStations: wm.ys.slice(), closedTip: wm.closedTip, roundedTip: wm.roundedTip, maxWarpRatio: S.maxWarpRatio, ...model.mesh },
      coefficients: { CL, CDpressure: CDp, CDiTrefftz: CDi, CLTrefftz: CLt, Cm, spanEfficiencyTrefftz: e },
      aircraft: { lift_N: liftFull, dragPressure_N: dragFull, dragInducedTrefftz_N: CDi * qmm * Sref, pitchingMomentAboutReference_Nmm: pitchFull },
      semiWing: { force_N: origin.F, momentAboutRootOrigin_Nmm: origin.M, momentAboutReference_Nmm: atRef.M,
        tipCap: wm.hasCap ? { integrated: false, unconvergedPressureForce_N: capForce, minCp: capMinCp, maxCp: capMaxCp } : null },
      strips, panels: { cp, mu, force_N: force, centroid_mm: S.PC, normal: S.PN, area_mm2: S.PA, count: n, wingPanels: wm.wingPanels },
      diagnostics: { maxCp, minCp, tipCapMinCp: capMinCp, tipCapMaxCp: capMaxCp, trailingEdgeDeltaCpMax: kuttaMax, trailingEdgeDeltaCpInboard90: kuttaInterior, liftTrefftzRelativeDifference: dCL,
        linearSolver: sol.method, gmresIterations: sol.iterations, linearRelativeResidual: sol.relativeResidual, trefftzDragMethod: tr.method, normalwashTrefftz: tr.normalwash },
      warnings, timing: { ...model.timing, evaluateMs: now() - t0 },
    };
  }
  function solve(rawGeometry, rawFlow = {}, rawMesh = {}, options = {}) { return evaluate(prepare(rawGeometry, rawMesh, options), rawFlow); }

  // Angle of attack giving a target aircraft lift (both halves, N) at the given speed and density.
  // Uses the cached unit solutions (no new linear solve). Secant iteration on the attached-flow model;
  // the answer is refused outside the admitted angle range rather than extrapolated.
  function alphaForLift(model, rawFlow, targetLift_N) {
    finiteIn(targetLift_N, 'Target lift (N)', -1e6, 1e6);
    const lift = a => evaluate(model, { ...rawFlow, alphaDeg: a }).aircraft.lift_N - targetLift_N;
    let a0 = 0, a1 = 4, f0 = lift(a0), f1 = lift(a1);
    for (let it = 0; it < 40; it++) {
      if (Math.abs(f1) <= 1e-10 * Math.max(1, Math.abs(targetLift_N))) break;
      const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
      if (!Number.isFinite(a2) || Math.abs(a2) > LIMITS.maxAlphaDeg) throw new Error(`The target lift needs |alpha| > ${LIMITS.maxAlphaDeg} deg at this speed and density, outside the attached-flow range of this module.`);
      a0 = a1; f0 = f1; a1 = a2; f1 = lift(a1);
    }
    return { alphaDeg: a1, residual_N: f1 };
  }
  // Chordwise Cp along one spanwise strip, split into lower and upper surfaces (x/c on the local chord).
  function stripChordwiseCp(model, result, j) {
    const wm = model.wm, g = model.geometry, S = wm.S;
    if (!Number.isInteger(j) || j < 0 || j >= wm.ns) throw new Error('Strip index out of range.');
    const lower = [], upper = [];
    for (let i = 0; i < wm.ni; i++) {
      const k = wm.index(i, j), c = [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]], chord = Geometry.chordAt(g, c[1]);
      const local = Geometry.inversePoint(g, c), xc = chord > 0 ? local[0] / chord : 0;
      (i < wm.nHalf ? lower : upper).push([xc, result.panels.cp[k]]);
    }
    lower.reverse();
    return { y_mm: result.strips[j].yMid, chord_mm: result.strips[j].chord, lower, upper };
  }
  // Structured-clone-friendly summary for a Worker reply or a study report (no per-panel arrays).
  function compactResult(model, result, options = {}) {
    const { panels, diagnostics, ...rest } = result;
    const { normalwashTrefftz, ...diag } = diagnostics;
    return { ...rest, diagnostics: diag, stripLoads: stripWrenches(result), chordwise: options.chordwise === false ? null : result.strips.map((_, j) => stripChordwiseCp(model, result, j)) };
  }
  // ------------------------------------------------------------------ panel resultant about any point
  function resultantOfPanels(result, about = [0, 0, 0]) {
    const P = result.panels, F = [0, 0, 0], M = [0, 0, 0];
    for (let k = 0; k < P.count; k++) { const f = [P.force_N[3 * k], P.force_N[3 * k + 1], P.force_N[3 * k + 2]], dx = P.centroid_mm[3 * k] - about[0], dy = P.centroid_mm[3 * k + 1] - about[1], dz = P.centroid_mm[3 * k + 2] - about[2]; for (let d = 0; d < 3; d++) F[d] += f[d]; M[0] += dy * f[2] - dz * f[1]; M[1] += dz * f[0] - dx * f[2]; M[2] += dx * f[1] - dy * f[0]; }
    return { force: F, moment: M };
  }
  // ------------------------------------------------------------------ six-component strip loads
  // Exact algebra of the structural transfer (aerostruct/engine.js uses the same definition):
  //   strip j on [y0, y1] has the pressure resultant force F_j and moment M_j about the aircraft origin;
  //   it is carried as a uniform force intensity f_j = F_j / (y1 - y0) on the load line
  //   r(y) = transformPoint(g, y, [0.25 c(y), 0]) plus a uniform couple intensity
  //   m_j = (M_j - (integral of r dy over [y0, y1]) x f_j) / (y1 - y0).
  //   Then the integral of f is F_j and the integral of r x f + m is M_j, so the force and the moment about
  //   ANY point equal those of the panel pressures (to the quadrature tolerance of the line integral).
  const LOAD_LINE_FRACTION = 0.25;
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const GAUSS4 = [[0.06943184420297371, 0.1739274225687269], [0.33000947820757187, 0.3260725774312731], [0.6699905217924281, 0.3260725774312731], [0.9305681557970262, 0.1739274225687269]];
  // Adaptive 4-point Gauss-Legendre quadrature of a vector function (bisection until two levels agree).
  function adaptiveIntegral(fn, a, b, tolerance = 1e-12, depth = 20) {
    const gauss = (lo, hi) => { let out = null; for (const [t, w] of GAUSS4) { const v = fn(lo + t * (hi - lo)); if (!out) out = new Array(v.length).fill(0); for (let i = 0; i < v.length; i++) out[i] += v[i] * w * (hi - lo); } return out; };
    const refine = (lo, hi, whole, d) => {
      const mid = 0.5 * (lo + hi), left = gauss(lo, mid), right = gauss(mid, hi), sum = left.map((v, i) => v + right[i]);
      let rel = 0; for (let i = 0; i < sum.length; i++) rel = Math.max(rel, Math.abs(sum[i] - whole[i]) / Math.max(1, Math.abs(sum[i])));
      if (d === 0 || rel <= tolerance) return sum;
      const x = refine(lo, mid, left, d - 1), y = refine(mid, hi, right, d - 1); return x.map((v, i) => v + y[i]);
    };
    return refine(a, b, gauss(a, b), depth);
  }
  function loadLinePoint(g, y, fraction = LOAD_LINE_FRACTION) { return Geometry.transformPoint(g, y, [fraction * Geometry.chordAt(g, y), 0]); }
  function lineIntegral(g, a, b, fraction = LOAD_LINE_FRACTION) { return b > a ? adaptiveIntegral(y => loadLinePoint(g, y, fraction), a, b) : [0, 0, 0]; }
  // Rows [y0, y1, Fx, Fy, Fz, Mx, My, Mz] of the wing-surface strips (moment about the aircraft origin). The flat
  // tip cap, if any, is excluded exactly as in evaluate(); the rows sum to semiWing.force_N and momentAboutRootOrigin_Nmm.
  function stripWrenches(result) {
    const P = result.panels, ni = 2 * result.mesh.chordPanelsPerSurface;
    return result.strips.map((st, j) => {
      const w = [st.y0, st.y1, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < ni; i++) {
        const k = j * ni + i, fx = P.force_N[3 * k], fy = P.force_N[3 * k + 1], fz = P.force_N[3 * k + 2], x = P.centroid_mm[3 * k], y = P.centroid_mm[3 * k + 1], z = P.centroid_mm[3 * k + 2];
        w[2] += fx; w[3] += fy; w[4] += fz; w[5] += y * fz - z * fy; w[6] += z * fx - x * fz; w[7] += x * fy - y * fx;
      }
      return w;
    });
  }
  function checkRows(rows, L, name) {
    if (!Array.isArray(rows) || !rows.length) throw new Error(`${name}: give at least one strip.`);
    rows.forEach((r, i) => {
      if (!Array.isArray(r) || r.length !== 8 || !r.every(Number.isFinite)) throw new Error(`${name}: strip ${i + 1} must be [y0, y1, Fx, Fy, Fz, Mx, My, Mz] with finite numbers.`);
      if (!(r[0] >= 0 && r[1] > r[0] && r[1] <= L * (1 + 1e-12))) throw new Error(`${name}: strip ${i + 1} must satisfy 0 <= y0 < y1 <= semi-span.`);
      if (i && Math.abs(r[0] - rows[i - 1][1]) > 1e-9 * L) throw new Error(`${name}: strips must be contiguous from the root to the tip.`);
    });
    if (rows[0][0] !== 0 || Math.abs(rows[rows.length - 1][1] - L) > 1e-9 * L) throw new Error(`${name}: strips must cover the semi-span from y = 0 to the tip.`);
  }
  // Uniform force and couple intensities of each strip (see the algebra above).
  function stripRepresentation(g, rows, fraction = LOAD_LINE_FRACTION) {
    return rows.map(r => {
      const [y0, y1] = r, h = y1 - y0, F = r.slice(2, 5), M = r.slice(5, 8), f = F.map(v => v / h), c = cross3(lineIntegral(g, y0, y1, fraction), f);
      return { y0, y1, F, M, f, m: M.map((v, d) => (v - c[d]) / h) };
    });
  }
  // Wrench [F; M about the origin] of the load-line part beyond y* of a strip representation (exact for it).
  function outboardOfStation(g, rep, ystar, fraction = LOAD_LINE_FRACTION) {
    const W = [0, 0, 0, 0, 0, 0];
    for (const s of rep) {
      if (s.y1 <= ystar) continue;
      if (s.y0 >= ystar) { for (let d = 0; d < 3; d++) { W[d] += s.F[d]; W[3 + d] += s.M[d]; } continue; }
      const h = s.y1 - ystar, c = cross3(lineIntegral(g, ystar, s.y1, fraction), s.f);
      for (let d = 0; d < 3; d++) { W[d] += s.f[d] * h; W[3 + d] += c[d] + s.m[d] * h; }
    }
    return W;
  }
  // Monotone piecewise-cubic Hermite interpolation (Fritsch & Carlson 1980; end slopes as in Moler's pchip).
  function pchip(x, v) {
    const n = x.length, h = new Float64Array(n - 1), del = new Float64Array(n - 1), d = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; del[i] = (v[i + 1] - v[i]) / h[i]; }
    if (n === 2) { d[0] = d[1] = del[0]; }
    else {
      for (let i = 1; i < n - 1; i++) if (del[i - 1] * del[i] > 0) { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]); }
      const end = (h0, h1, d0, d1) => { let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1); if (Math.sign(s) !== Math.sign(d0)) s = 0; else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0; return s; };
      d[0] = end(h[0], h[1], del[0], del[1]); d[n - 1] = end(h[n - 2], h[n - 3], del[n - 2], del[n - 3]);
    }
    return t => {
      if (t <= x[0]) return v[0]; if (t >= x[n - 1]) return v[n - 1];
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= t) lo = mid; else hi = mid; }
      const s = (t - x[lo]) / h[lo], s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * v[lo] + (s3 - 2 * s2 + s) * h[lo] * d[lo] + (-2 * s3 + 3 * s2) * v[lo + 1] + (s3 - s2) * h[lo] * d[lo + 1];
    };
  }
  // Outboard (cut) wrench of one mesh level as a continuous function of the station: exact sums at the level's
  // strip boundaries, PCHIP between them (a smooth reconstruction, used to combine levels with different strips).
  function cumulativeWrench(rows) {
    const n = rows.length, x = [rows[0][0], ...rows.map(r => r[1])], v = Array.from({ length: 6 }, () => new Float64Array(n + 1));
    for (let k = n - 1; k >= 0; k--) for (let d = 0; d < 6; d++) v[d][k] = v[d][k + 1] + rows[k][2 + d];
    const f = v.map(c => pchip(x, c));
    return { x, at: y => f.map(fn => fn(y)) };
  }

  // ------------------------------------------------------------------ mesh-refinement sequence and admission
  // A sequence refines the chordwise panels at a fixed spanwise mesh and the spanwise strips at a fixed
  // chordwise mesh (7 solves; the base mesh is shared). Each direction has four levels with 1/n proportional
  // to 6 : 4 : 3 : 2. The delivered load is the Richardson extrapolation of the quadratic polynomial in 1/n
  // through the three finest levels of each direction, combined additively:
  //   Q_ext = Q_chord(1/c -> 0) + Q_span(1/s -> 0) - Q(base).
  // The same fixed level weights apply to every quantity, so the extrapolated strip loads, their resultants and
  // the cut loads are one consistent, exactly conservative load set. The uncertainty of Q_ext is
  //   U = Fs * sum over the two directions of max( spread + stability, kappa * |correction| ),
  // spread = largest difference between the linear (two finest), quadratic (three finest) and observed-order
  // (Celik et al. 2008, order bounded to [0.5, 2]) extrapolations, stability = change of the quadratic
  // extrapolation when the three coarser levels are used instead, correction = quadratic extrapolation minus the
  // finest level (what the extrapolation added), Fs = 1.25, kappa = 0.5. The correction term keeps U from
  // claiming that an extrapolation removed more than half of its own correction when the levels agree with each
  // other but are not yet asymptotic (the spanwise observed order still falls from about 0.9 to 0.7 between 32
  // and 96 strips). Validated against far finer reference meshes (validation/reference_study.mjs) in
  // test_wing_aero_admission.mjs and the documentation.
  const SEQUENCES = Object.freeze({
    standard: Object.freeze({ label: 'Standard', chord: Object.freeze([16, 24, 32, 48]), span: Object.freeze([8, 12, 16, 24]), baseChord: 32, baseSpan: 16 }),
    fine: Object.freeze({ label: 'Fine', chord: Object.freeze([32, 48, 64, 96]), span: Object.freeze([16, 24, 32, 48]), baseChord: 32, baseSpan: 16 }),
  });
  // Admission (no absolute torque floor; every criterion is stated in the admission table):
  //  * torque at each structural cut is RESOLVED only if U_T <= 10% of |T| AND every mesh that carries weight in the
  //    delivered load gives a torque of the same sign as T. Otherwise its magnitude is not resolved, and its sign is
  //    not resolved either if U_T >= |T| or the meshes disagree in sign. Torque values are shown only if every
  //    reported cut is resolved.
  //  * twist (needs the structure): with the frame elements' torsional compliance k = (element length / projected
  //    length) / GJ (twist per unit torque per unit projected span) the twist uncertainty is
  //        dtheta(y) = integral from 0 to y of Ubar(eta) k(eta) d eta,
  //    Ubar = upper envelope of U_T at 16 equally spaced cuts (zero at the tip). The twist claim is
  //        'resolved'   every reported torque resolved and dtheta <= 10% |theta| at 25, 50, 75% span and at the tip;
  //        'negligible' otherwise, if the bound on the true twist |theta| + dtheta, applied as an incidence change with
  //                     the thin-airfoil lift slope 2 pi (an upper bound for the sectional response), changes the
  //                     semi-wing lift by at most 1% (half the lift-consistency tolerance):
  //                     q 2 pi integral of c (|theta| + dtheta) dy <= 0.01 |L|. Torque and twist values are withheld
  //                     (only the bound is reported); the rest of the coupled result is shown;
  //        'unresolved' otherwise: the coupled result is withheld (the app refuses rather than overclaims).
  //  * one-way coupling (needs the structure): the load is computed on the rigid wing, so the computed twist itself,
  //    applied as an incidence change with the same lift slope, must change the lift by at most 2% (the
  //    lift-consistency tolerance); a more flexible wing is refused (aeroelastic redistribution is not modelled);
  //  * root force and root bending moment: U / magnitude <= 5%; lift: extrapolated pressure and Trefftz-plane lift
  //    within 2% of max(|CL|, 0.05).
  const ADMISSION = Object.freeze({ safetyFactor: 1.25, correctionFraction: 0.5, orderBounds: Object.freeze([0.5, 2]),
    torqueTolerance: 0.10, twistTolerance: 0.10, twistLiftFraction: 0.01, sectionLiftSlope: 2 * Math.PI, torsionStations: 16, rigidWingTolerance: 0.02,
    forceTolerance: 0.05, bendingTolerance: 0.05, liftConsistencyTolerance: 0.02, liftConsistencyFloorCL: 0.05,
    stations: Object.freeze([0.25, 0.5, 0.75]) });
  function sequenceDefinition(name) { const d = SEQUENCES[name]; if (!d) throw new Error(`Unknown mesh sequence "${name}": use ${Object.keys(SEQUENCES).join(' or ')}.`); return d; }
  function sequenceMeshes(name) {
    const d = sequenceDefinition(name), list = [], add = (c, s) => { if (!list.some(m => m.chordPanels === c && m.spanPanels === s)) list.push({ chordPanels: c, spanPanels: s }); };
    d.chord.forEach(c => add(c, d.baseSpan)); d.span.forEach(s => add(d.baseChord, s));
    return list;
  }
  // Lagrange weights of the polynomial through (h_i, Q_i) evaluated at h = 0.
  const lagrangeWeights0 = h => h.map((hi, i) => h.reduce((w, hj, j) => (j === i ? w : w * (0 - hj) / (hi - hj)), 1));
  function sequenceWeights(name) {
    const d = sequenceDefinition(name), w = new Map(), add = (c, s, v) => { const k = c + 'x' + s; w.set(k, (w.get(k) || 0) + v); };
    const three = a => a.slice(a.length - 3), wc = lagrangeWeights0(three(d.chord).map(v => 1 / v)), ws = lagrangeWeights0(three(d.span).map(v => 1 / v));
    three(d.chord).forEach((c, i) => add(c, d.baseSpan, wc[i])); three(d.span).forEach((s, i) => add(d.baseChord, s, ws[i])); add(d.baseChord, d.baseSpan, -1);
    return [...w.entries()].map(([k, v]) => { const [c, s] = k.split('x').map(Number); return { chordPanels: c, spanPanels: s, weight: v }; }).filter(x => Math.abs(x.weight) > 1e-12);
  }
  // Observed order of convergence from three levels n3 < n2 < n1 (Celik et al. 2008, non-uniform ratios).
  function observedOrder(n3, n2, n1, f3, f2, f1, bounds = ADMISSION.orderBounds) {
    const r21 = n1 / n2, r32 = n2 / n3, e21 = f2 - f1, e32 = f3 - f2, scale = Math.max(Math.abs(f1), Math.abs(f2), Math.abs(f3), 1e-300);
    if (Math.abs(e21) <= 1e-13 * scale || Math.abs(e32) <= 1e-13 * scale) return { order: null, orderUsed: null, monotone: false, extrapolated: f1 };
    const sgn = Math.sign(e32 / e21);
    if (sgn < 0) return { order: null, orderUsed: 1, monotone: false, extrapolated: f1 + (f1 - f2) / (r21 - 1) }; // oscillatory: first order
    let p = 1;
    for (let it = 0; it < 200; it++) { const pn = Math.abs(Math.log(Math.abs(e32 / e21)) + Math.log((r21 ** p - 1) / (r32 ** p - 1))) / Math.log(r21); if (!Number.isFinite(pn)) { p = NaN; break; } if (Math.abs(pn - p) < 1e-12) { p = pn; break; } p = pn; }
    const used = Number.isFinite(p) ? Math.min(bounds[1], Math.max(bounds[0], p)) : 1;
    return { order: Number.isFinite(p) ? p : null, orderUsed: used, monotone: true, extrapolated: f1 + (f1 - f2) / (r21 ** used - 1) };
  }
  // Extrapolated value and uncertainty of a scalar that is linear in the level loads: levelValue(c, s).
  function sequenceEstimate(name, levelValue, settings = ADMISSION) {
    const d = sequenceDefinition(name);
    const dir = (ns, val) => {
      const m = ns.length, h = ns.map(v => 1 / v), Q = ns.map(val), lin = (a, w) => w.reduce((t, wi, i) => t + wi * Q[a + i], 0);
      const quad = lin(m - 3, lagrangeWeights0(h.slice(m - 3))), quad0 = lin(m - 4, lagrangeWeights0(h.slice(m - 4, m - 1))), linear = lin(m - 2, lagrangeWeights0(h.slice(m - 2)));
      const ob = observedOrder(ns[m - 3], ns[m - 2], ns[m - 1], Q[m - 3], Q[m - 2], Q[m - 1], settings.orderBounds);
      const spread = Math.max(Math.abs(quad - linear), Math.abs(quad - ob.extrapolated), Math.abs(ob.extrapolated - linear)), stability = Math.abs(quad - quad0);
      const correction = quad - Q[m - 1], kappa = settings.correctionFraction ?? ADMISSION.correctionFraction, term = Math.max(spread + stability, kappa * Math.abs(correction));
      return { levels: ns.slice(), values: Q, quadratic: quad, linear, observed: ob.extrapolated, observedOrder: ob.order, monotone: ob.monotone, quadraticCoarse: quad0, spread, stability, finest: Q[m - 1],
        correction, term, correctionGoverns: kappa * Math.abs(correction) > spread + stability };
    };
    const chord = dir(d.chord, c => levelValue(c, d.baseSpan)), span = dir(d.span, s => levelValue(d.baseChord, s)), base = levelValue(d.baseChord, d.baseSpan);
    return { value: chord.quadratic + span.quadratic - base, uncertainty: settings.safetyFactor * (chord.term + span.term),
      base, finest: chord.finest + span.finest - base, chord, span };
  }
  // Runs every mesh of a sequence (Worker or Node). Models are cached by geometry and mesh, so a new angle of
  // attack or speed on the same wing costs only the surface evaluations. options: cache, progress(text),
  // targetLift_N (trims alpha so the EXTRAPOLATED pressure lift of both halves equals it), tipClosure, solver.
  function runSequence(rawGeometry, rawFlow = {}, name = 'standard', options = {}) {
    const def = sequenceDefinition(name), meshes = sequenceMeshes(name), cache = options.cache || new Map(), t0 = now();
    const tipClosure = options.tipClosure ?? DEFAULT_MESH.tipClosure;
    const models = meshes.map((m, i) => {
      options.progress?.(`Mesh ${i + 1} of ${meshes.length}: ${2 * m.chordPanels} × ${m.spanPanels} panels (around × spanwise)…`);
      return prepare(rawGeometry, { ...m, tipClosure }, { cache, solver: options.solver, referenceLimits: options.referenceLimits });
    });
    const weights = sequenceWeights(name), weightOf = m => weights.find(w => w.chordPanels === m.chordPanels && w.spanPanels === m.spanPanels)?.weight || 0;
    let alphaDeg = normalizeFlow(rawFlow).alphaDeg, trim = null;
    if (options.targetLift_N != null) {
      finiteIn(options.targetLift_N, 'Target lift (N)', -1e6, 1e6);
      const lift = a => models.reduce((t, model, i) => t + weightOf(meshes[i]) * evaluate(model, { ...rawFlow, alphaDeg: a }).aircraft.lift_N, 0) - options.targetLift_N;
      let a0 = 0, a1 = 4, f0 = lift(a0), f1 = lift(a1);
      for (let it = 0; it < 40 && Math.abs(f1) > 1e-10 * Math.max(1, Math.abs(options.targetLift_N)); it++) {
        const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
        if (!Number.isFinite(a2) || Math.abs(a2) > LIMITS.maxAlphaDeg) throw new Error(`The target lift needs |alpha| > ${LIMITS.maxAlphaDeg} deg at this speed and density, outside the attached-flow range of this module.`);
        a0 = a1; f0 = f1; a1 = a2; f1 = lift(a1);
      }
      alphaDeg = a1; trim = { alphaDeg: a1, residual_N: f1, liftMeasure: 'extrapolated pressure lift of both halves' };
    }
    const flow = { ...rawFlow, alphaDeg }, results = models.map(model => evaluate(model, flow));
    const levels = results.map((r, i) => ({ chordPanels: meshes[i].chordPanels, spanPanels: meshes[i].spanPanels, panels: r.mesh.panels, strips: stripWrenches(r),
      coefficients: { CL: r.coefficients.CL, CLTrefftz: r.coefficients.CLTrefftz, CDpressure: r.coefficients.CDpressure, CDiTrefftz: r.coefficients.CDiTrefftz, Cm: r.coefficients.Cm },
      liftN: r.aircraft.lift_N, roundedTip: r.mesh.roundedTip, closedTip: r.mesh.closedTip, tipCap: r.semiWing.tipCap,
      diagnostics: { minCp: r.diagnostics.minCp, maxCp: r.diagnostics.maxCp, liftTrefftzRelativeDifference: r.diagnostics.liftTrefftzRelativeDifference, linearSolver: r.diagnostics.linearSolver, linearRelativeResidual: r.diagnostics.linearRelativeResidual, trailingEdgeDeltaCpInboard90: r.diagnostics.trailingEdgeDeltaCpInboard90 },
      warnings: r.warnings, timing: r.timing, modelCacheHit: !!models[i].lastCacheHit }));
    const bi = meshes.findIndex(m => m.chordPanels === def.baseChord && m.spanPanels === def.baseSpan);
    return { version: VERSION, kind: 'meshSequence', sequence: name, label: def.label, definition: { chord: def.chord.slice(), span: def.span.slice(), baseChord: def.baseChord, baseSpan: def.baseSpan },
      weights, flow: results[bi].flow, reference: results[bi].reference, scope: SCOPE, tipClosure, levels, base: compactResult(models[bi], results[bi]), trim, timing: { totalMs: now() - t0 } };
  }
  // Delivery stations: the finest spanwise level's strip boundaries (its rounded-tip zone merged into the last
  // strip), snapped to structural stations within 0.25 mm, wide strips halved, every station kept at least
  // 0.1 mm from all others (the structural engine's rule for distinct load and rib stations).
  function deliveryStations(levelRows, roundedTip, L, snap = []) {
    let nodes = [0, ...levelRows.map(r => r[1])];
    if (roundedTip) nodes = [...nodes.filter(y => y <= roundedTip.start_mm + 1e-9 * L && y < L), L];
    nodes[0] = 0; nodes[nodes.length - 1] = L;
    const stations = [...new Set(snap.filter(t => Number.isFinite(t) && t > 0 && t < L))];
    for (const t of stations) { let k = -1, best = Infinity; for (let i = 1; i < nodes.length - 1; i++) { const d = Math.abs(nodes[i] - t); if (d < best) { best = d; k = i; } } if (k > 0 && best > 0 && best < 0.25) nodes[k] = t; }
    nodes = [...new Set(nodes)].sort((a, b) => a - b);
    // strips wider than L/32 are halved once: the delivered load is uniform within a strip, so a finer delivery
    // grid reduces its interpolation difference from the extrapolated cut loads (that difference is part of U)
    nodes = nodes.flatMap((y, i) => (i && y - nodes[i - 1] > L / 32 ? [0.5 * (nodes[i - 1] + y), y] : [y]));
    return nodes.filter((y, i) => i === 0 || i === nodes.length - 1 || (stations.every(t => t === y || Math.abs(t - y) >= 0.1) && y - nodes[i - 1] >= 0.1 && nodes[i + 1] - y >= 0.1));
  }
  // Combines a sequence into the delivered (extrapolated) six-component strip load. options.snapStations.
  function combineSequence(rawGeometry, seq, options = {}) {
    const g = aeroGeometry(rawGeometry), L = g.semiSpan, def = sequenceDefinition(seq?.sequence);
    if (Geometry.closedTip(g)) throw new Error('Structural aerodynamic loads are not available for an exact zero-chord tip: the structural model of a closed tip is a section-stress study without the spatial beam.');
    // a flat tip cap closes the potential solution but its pressure is not integrated (non-convergent edge singularity),
    // so such a load would omit the tip side force: only the rounded tip (the default) is delivered to the structure
    if (seq?.tipClosure === 'flat' || (seq?.levels || []).some(l => l && l.tipCap)) throw new Error('A flat tip cap leaves its pressure out of the load, so this sequence cannot be applied to the structure: use the rounded tip (the default).');
    const find = (c, s) => { const l = (seq.levels || []).find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`The mesh sequence has no ${2 * c} × ${s} level.`); return l; };
    for (const m of sequenceMeshes(seq.sequence)) checkRows(find(m.chordPanels, m.spanPanels).strips, L, `Level ${2 * m.chordPanels} × ${m.spanPanels}`);
    const weights = sequenceWeights(seq.sequence), cum = weights.map(w => ({ w: w.weight, f: cumulativeWrench(find(w.chordPanels, w.spanPanels).strips) }));
    const finest = find(def.baseChord, def.span[def.span.length - 1]), nodes = deliveryStations(finest.strips, finest.roundedTip, L, options.snapStations || []);
    const C = y => { const W = [0, 0, 0, 0, 0, 0]; for (const { w, f } of cum) { const v = f.at(y); for (let d = 0; d < 6; d++) W[d] += w * v[d]; } return W; };
    const values = nodes.map(C); values[values.length - 1] = [0, 0, 0, 0, 0, 0];
    const strips = nodes.slice(0, -1).map((y0, i) => [y0, nodes[i + 1], ...values[i].map((v, d) => v - values[i + 1][d])]);
    const est = f => sequenceEstimate(seq.sequence, (c, s) => f(find(c, s)));
    const coefficients = { CL: est(l => l.coefficients.CL), CLTrefftz: est(l => l.coefficients.CLTrefftz), CDpressure: est(l => l.coefficients.CDpressure), CDiTrefftz: est(l => l.coefficients.CDiTrefftz), Cm: est(l => l.coefficients.Cm) };
    const rootWrench = [0, 1, 2, 3, 4, 5].map(d => est(l => l.strips.reduce((t, r) => t + r[2 + d], 0)));
    const lift = { pressure: coefficients.CL.value, trefftz: coefficients.CLTrefftz.value, relativeDifference: Math.abs(coefficients.CL.value - coefficients.CLTrefftz.value) / Math.max(Math.abs(coefficients.CL.value), ADMISSION.liftConsistencyFloorCL) };
    const drag = { pressure: coefficients.CDpressure.value, trefftz: coefficients.CDiTrefftz.value, difference: coefficients.CDpressure.value - coefficients.CDiTrefftz.value, combinedUncertainty: coefficients.CDpressure.uncertainty + coefficients.CDiTrefftz.uncertainty };
    return { version: VERSION, kind: 'aeroStrips', sequence: seq.sequence, lineFraction: LOAD_LINE_FRACTION, strips, stations: nodes, weights, coefficients, rootWrench,
      deliveredRootWrench: strips.reduce((W, r) => W.map((v, d) => v + r[2 + d]), [0, 0, 0, 0, 0, 0]), consistency: { lift, drag } };
  }
  // Admission of a combined load against the structural axis. cuts: [{ y, reference: [x, y, z], normal: [..],
  // root: true for the root (all loads, no plane), structuralTorque (optional, the engine's own cut torque of the
  // delivered load, used as a transfer check) }]. options.torsion (optional, from the structural result):
  // { cuts: [cut at k L / n, k = 0 .. n - 1, root first], elements: [{ y0, y1, k }] (twist per unit torque per unit
  // projected span), twist: { y: [...], theta: [...] } (rad, the coupled solution) }. Returns rows, the twist claim and
  // an overall decision; it never changes the load.
  function admission(rawGeometry, seq, combined, cuts, options = {}) {
    const g = aeroGeometry(rawGeometry), L = g.semiSpan, set = { ...ADMISSION, ...(options.settings || {}) };
    sequenceDefinition(seq.sequence);
    if (!combined || combined.sequence !== seq.sequence) throw new Error('Combine this mesh sequence before the admission test.');
    if (!Array.isArray(cuts) || !cuts.length || !cuts[0].root) throw new Error('The admission test needs the structural root cut first.');
    const q = seq.flow.dynamicPressure_Pa * 1e-6, refs = seq.reference, weighted = sequenceWeights(seq.sequence);
    const levelCum = new Map(), find = (c, s) => { const k = c + 'x' + s; if (!levelCum.has(k)) { const l = seq.levels.find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`The mesh sequence has no ${2 * c} × ${s} level.`); levelCum.set(k, cumulativeWrench(l.strips)); } return levelCum.get(k); };
    const delivered = stripRepresentation(g, combined.strips, combined.lineFraction);
    const unit = v => { const l = Math.hypot(...v); if (!(l > 0)) throw new Error('A structural cut normal is zero.'); return v.map(x => x / l); };
    const crossing = (P, n) => {
      const s = y => dot3(loadLinePoint(g, y, combined.lineFraction).map((v, d) => v - P[d]), n);
      if (s(0) >= 0) return 0; if (s(L) < 0) return L;
      let lo = 0, hi = L; for (let k = 0; k < 64; k++) { const mid = 0.5 * (lo + hi); if (s(mid) < 0) lo = mid; else hi = mid; }
      return 0.5 * (lo + hi);
    };
    // delivered torque, its sequence estimate and uncertainty, and the torques of the weighted meshes at one cut
    const torqueAt = cut => {
      const P = cut.reference, n = unit(cut.normal), ystar = cut.root ? 0 : crossing(P, n);
      const about = W => ({ F: W.slice(0, 3), M: [W[3] - (P[1] * W[2] - P[2] * W[1]), W[4] - (P[2] * W[0] - P[0] * W[2]), W[5] - (P[0] * W[1] - P[1] * W[0])] });
      const memo = new Map(), levelW = (c, s) => { const k = c + 'x' + s; if (!memo.has(k)) memo.set(k, about(find(c, s).at(ystar))); return memo.get(k); };
      const dw = about(outboardOfStation(g, delivered, ystar, combined.lineFraction));
      const torque = w => dot3(w.M, n), est = sequenceEstimate(seq.sequence, (c, s) => torque(levelW(c, s)), set);
      const T = torque(dw), interp = Math.abs(T - est.value), U = est.uncertainty + interp;
      const meshTorques = weighted.map(w => ({ chordPanels: w.chordPanels, spanPanels: w.spanPanels, weight: w.weight, torque: torque(levelW(w.chordPanels, w.spanPanels)) }));
      const signsAgree = T !== 0 && meshTorques.every(m => Math.sign(m.torque) === Math.sign(T));
      return { ystar, n, levelW, dw, T, U, est, interp, meshTorques, signsAgree };
    };
    const rows = [];
    for (const cut of cuts) {
      const t = torqueAt(cut), relative = t.T !== 0 ? t.U / Math.abs(t.T) : Infinity;
      const resolved = relative <= set.torqueTolerance && t.signsAgree, signResolved = t.U < Math.abs(t.T) && t.signsAgree;
      const label = cut.root ? 'Root torque (shear-centre axis)' : `Torque at ${Math.round(100 * cut.y / L)}% span (y ${(+cut.y).toFixed(1)} mm)`;
      const row = { kind: 'torque', label, y: cut.root ? 0 : cut.y, crossing_mm: t.ystar, value: t.T, uncertainty: t.U, sequenceUncertainty: t.est.uncertainty, interpolation: t.interp,
        relative, measure: relative, tolerance: set.torqueTolerance, resolved, signResolved, meshSignsAgree: t.signsAgree, meshTorques: t.meshTorques,
        status: resolved ? 'resolved' : signResolved ? 'magnitude not resolved' : 'sign not resolved', admitted: resolved, estimate: t.est };
      if (Number.isFinite(cut.structuralTorque)) row.transferResidual = cut.structuralTorque - t.T;
      rows.push(row);
      if (cut.root) {
        const vec = (fn, name, tol, kind) => {
          const v = fn(t.dw), est = [0, 1, 2].map(d => sequenceEstimate(seq.sequence, (c, s) => fn(t.levelW(c, s))[d], set));
          const U = Math.hypot(...est.map((x, d) => x.uncertainty + Math.abs(v[d] - x.value))), mag = Math.hypot(...v), e2 = mag > 0 ? U / mag : Infinity;
          rows.push({ kind, label: name, value: mag, vector: v, uncertainty: U, measure: e2, relative: e2, tolerance: tol, resolved: e2 <= tol, admitted: e2 <= tol, estimate: est });
        };
        vec(w => w.F, 'Root force |F|', set.forceTolerance, 'force');
        vec(w => { const tq = dot3(w.M, t.n); return w.M.map((v, d) => v - tq * t.n[d]); }, 'Root bending moment |M_b|', set.bendingTolerance, 'bending');
      }
    }
    const lc = combined.consistency.lift;
    rows.push({ kind: 'liftConsistency', label: 'Lift: pressure vs Trefftz plane', value: lc.pressure, reference: lc.trefftz, measure: lc.relativeDifference, relative: lc.relativeDifference, tolerance: set.liftConsistencyTolerance, resolved: lc.relativeDifference <= set.liftConsistencyTolerance, admitted: lc.relativeDifference <= set.liftConsistencyTolerance });
    const torqueRows = rows.filter(r => r.kind === 'torque'), torqueResolved = torqueRows.every(r => r.resolved);
    // twist claim from the structure's torsional compliance
    let twist = null;
    if (options.torsion) {
      const tor = options.torsion;
      if (!Array.isArray(tor.cuts) || !tor.cuts.length || !tor.cuts[0].root || !Array.isArray(tor.elements) || !tor.elements.length || !tor.twist) throw new Error('The twist assessment needs the structure: torsion cuts from the root, frame elements and the twist.');
      const tcut = tor.cuts.map(c => { const t = torqueAt(c); return { y: c.root ? 0 : c.y, T: t.T, U: t.U }; });
      const Y = [...tcut.map(c => c.y), L], Uv = [...tcut.map(c => c.U), 0];
      for (let i = 1; i < Y.length; i++) if (!(Y[i] > Y[i - 1])) throw new Error('Torsion cuts must increase from the root to the tip.');
      const els = tor.elements.map(e => ({ y0: e.y0, y1: e.y1, k: e.k }));
      if (!els.every(e => Number.isFinite(e.k) && e.k > 0 && e.y1 > e.y0)) throw new Error('Torsional compliance must be positive and finite on every frame element.');
      const dtheta = y => { let s = 0; for (let i = 0; i < Y.length - 1 && Y[i] < y; i++) { const a = Y[i], b = Math.min(Y[i + 1], y), Ub = Math.max(Uv[i], Uv[i + 1]); for (const e of els) { const lo = Math.max(a, e.y0), hi = Math.min(b, e.y1); if (hi > lo) s += Ub * e.k * (hi - lo); } } return s; };
      const ty = Array.from(tor.twist.y), tv = Array.from(tor.twist.theta);
      const thetaAt = y => { if (y <= ty[0]) return tv[0]; if (y >= ty[ty.length - 1]) return tv[tv.length - 1]; let lo = 0, hi = ty.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ty[m] <= y) lo = m; else hi = m; } const f = (y - ty[lo]) / (ty[hi] - ty[lo]); return tv[lo] + f * (tv[hi] - tv[lo]); };
      for (const c of tcut) { c.theta = thetaAt(c.y); c.dtheta = dtheta(c.y); }
      const stations = [...set.stations, 1].map(f => { const y = f * L, th = thetaAt(y), d = dtheta(y); return { y, theta: th, dtheta: d, bound: Math.abs(th) + d, relative: th !== 0 ? d / Math.abs(th) : Infinity }; });
      const N = 240, h = L / N, a0 = set.sectionLiftSlope; let I = 0, I0 = 0, maxBound = 0;
      for (let i = 0; i <= N; i++) { const y = i * h, w = i === 0 || i === N ? 0.5 : 1, c = Geometry.chordAt(g, y), th = Math.abs(thetaAt(y)), d = dtheta(y); I += w * c * (th + d); I0 += w * c * th; maxBound = Math.max(maxBound, th + d); }
      const CL = combined.coefficients.CL.value, Lsemi = Math.abs(CL) * q * refs.semiArea_mm2, liftChange = q * a0 * I * h, rigidChange = q * a0 * I0 * h;
      const liftEffect = Lsemi > 0 ? liftChange / Lsemi : Infinity, rigidWingEffect = Lsemi > 0 ? rigidChange / Lsemi : Infinity;
      const twistRelative = stations.every(st => st.relative <= set.twistTolerance), worstRelative = Math.max(...stations.map(st => st.relative));
      const status = torqueResolved && twistRelative ? 'resolved' : liftEffect <= set.twistLiftFraction ? 'negligible' : 'unresolved';
      twist = { status, stations, cuts: tcut, tipTheta: stations[stations.length - 1].theta, tipDtheta: stations[stations.length - 1].dtheta, maxBound, liftEffect, liftEffectTolerance: set.twistLiftFraction,
        rigidWingEffect, meanTolerance: Lsemi > 0 ? set.twistLiftFraction * Lsemi / (q * a0 * refs.semiArea_mm2) : 0, worstRelative, relativeTolerance: set.twistTolerance, torqueResolved, sectionLiftSlope: a0,
        method: 'dtheta(y) = integral of max(U_T) k over [0, y] with the frame elements\' torsional compliance k = (length / projected length) / GJ; negligible if q 2 pi integral c (|theta| + dtheta) dy <= 1% of |lift|.' };
      for (const r of torqueRows) if (!r.resolved) r.admitted = status === 'negligible';
      rows.push({ kind: 'twist', label: 'Twist (shear-centre axis)', y: L, value: twist.tipTheta, uncertainty: twist.tipDtheta, bound: maxBound, status,
        measure: status === 'resolved' ? worstRelative : liftEffect, relative: worstRelative, tolerance: status === 'resolved' ? set.twistTolerance : set.twistLiftFraction, resolved: status === 'resolved', admitted: status !== 'unresolved', twist });
      const rigidOk = rigidWingEffect <= set.rigidWingTolerance;
      rows.push({ kind: 'aeroelastic', label: 'One-way coupling: twist effect on lift', value: rigidWingEffect, measure: rigidWingEffect, relative: rigidWingEffect, tolerance: set.rigidWingTolerance, resolved: rigidOk, admitted: rigidOk });
    }
    const failed = rows.filter(r => !r.admitted);
    const notes = torqueRows.filter(r => !r.resolved).map(r => `${r.label}: ${r.status} (${r.value.toPrecision(3)} ± ${r.uncertainty.toPrecision(2)} N mm${r.meshSignsAgree ? '' : '; the meshes disagree in sign'})`);
    if (twist && twist.rigidWingEffect > set.rigidWingTolerance) notes.push(`The computed twist would change the lift by ${(100 * twist.rigidWingEffect).toFixed(1)}% if fed back: the rigid-wing load is not consistent with this flexible structure (aeroelastic redistribution is not modelled).`);
    return { version: VERSION, sequence: seq.sequence, admitted: failed.length === 0, rows, failed: failed.map(r => r.label), settings: set, twist, notes,
      claims: { torque: torqueResolved ? 'shown' : 'withheld', twist: twist ? (twist.status === 'resolved' ? 'shown' : 'withheld') : (torqueResolved ? 'not assessed' : 'withheld') },
      drag: combined.consistency.drag,
      method: 'Richardson extrapolation of a chordwise and a spanwise four-level refinement sequence (quadratic in 1/n through the three finest levels, combined additively); U = 1.25 x sum over the two directions of max(spread of the linear, quadratic and observed-order extrapolations + one-level stability, 0.5 x |extrapolation correction|). Torque resolved only if U <= 10% of |T| and the weighted meshes agree in sign (no absolute floor). Twist from the structure\'s torsional compliance: resolved (shown) if every torque is resolved and the twist bound is within 10% of the twist; otherwise withheld and admitted only if the bound would change the lift by at most 1% (thin-airfoil lift slope), else the coupled result is withheld. One-way coupling: the computed twist may change the lift by at most 2%.' };
  }

  return Object.freeze({ VERSION, SCOPE, LIMITS, DEFAULT_FLOW, DEFAULT_MESH, triAngle, semiInfiniteAngle, buildSurface, sourceLocal,
    geometryKey, influence: (S, k, P, far = Infinity) => { influence(S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far); return { source: outS, doublet: outD }; },
    assemble, unitSolutions, luFactor, luSolve, gmres, surfaceVelocity, aeroGeometry, sectionLoop, spanStations, wingMesh, references, trefftz, trefftzMidpoint,
    normalizeFlow, normalizeMesh, prepare, evaluate, solve, alphaForLift, stripChordwiseCp, compactResult, resultantOfPanels,
    LOAD_LINE_FRACTION, SEQUENCES, ADMISSION, loadLinePoint, lineIntegral, stripWrenches, stripRepresentation, outboardOfStation, pchip, cumulativeWrench,
    sequenceMeshes, sequenceWeights, observedOrder, sequenceEstimate, runSequence, deliveryStations, combineSequence, admission });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroPanel;
