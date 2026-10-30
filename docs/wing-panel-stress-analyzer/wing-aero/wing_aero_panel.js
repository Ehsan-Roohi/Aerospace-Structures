/* Wing AeroStruct aerodynamic surface-panel core. Development version, NOT published; a separate
 * application from Wing Lab (Wing Lab 1.3 is unchanged).
 *
 * Original implementation of a surface panel method for the finite-thickness wing surface:
 *   - DEFAULT doublet model 'tensor-quadratic' (EXPERIMENTAL candidate 0.3.2-exp.3 / exp.4): a C1 quadratic spline in
 *     BOTH surface directions (along the section loop and along the span, continuous around the rounded tip); on each
 *     flat triangle of a panel's split the doublet is quadratic (P2), so the body doublet is continuous everywhere (see
 *     tensorQuadBasis); sources constant on each triangle (sigma = -V . n_T); the earlier models remain selectable as
 *     doubletModel 'span-quadratic' (0.3.2-exp.2: constant chordwise, C1 quadratic spline along the span; also the
 *     default with the diagnostic flat tip cap) and 'constant' (the 0.3.1 constant-strength doublet and source
 *     quadrilaterals, bit-identical);
 *   - internal Dirichlet condition: perturbation potential zero inside the closed wing;
 *   - Morino trailing-edge Kutta condition (wake doublet = upper minus lower TE doublet), satisfied POINTWISE along the
 *     trailing edge (the wake carries exactly the jump of the two surface doublet traces; zero at the tip);
 *   - flat prescribed wake of semi-infinite doublet strips along body +x (quadratic and continuous along the span in
 *     the spline models; constant per strip in 'constant');
 *   - right semi-wing plus its mirror image (symmetric flight only);
 *   - surface velocity from the jump relations of the solved sheet, v = V - (V . n_T) n_T + grad_s mu_T on each triangle
 *     (linear there), pressure from incompressible Bernoulli (quadratic Cp per triangle; panel forces and couples are its
 *     exact integrals), induced drag in the Trefftz plane;
 *   - rounded aerodynamic tip by default (no flat cap), so every surface pressure is integrated;
 *   - six-component strip loads for the structural model (forces and moments, nothing dropped);
 *   - an executed mesh-refinement sequence (chordwise and spanwise Richardson extrapolation plus the cross term from
 *     one mesh refined in both directions), an uncertainty estimate and an admission test (torque error relative to
 *     the torque itself, see admission()).
 * No source code, header or binary from any other panel program was used.
 *
 * Published theory implemented here:
 *   Hess & Smith (1967) Prog. Aerosp. Sci. 8:1-138 (constant-strength surface panels).
 *   Morino & Kuo (1974) AIAA J. 12(2):191-197 (Green's-identity potential formulation, Kutta condition).
 *   Maskew (1987) NASA CR-4023, VSAERO theory (internal Dirichlet condition).
 *   Katz & Plotkin (2001) Low-Speed Aerodynamics, 2nd ed., ch. 9-12.
 *   Van Oosterom & Strackee (1983) IEEE Trans. Biomed. Eng. 30(2):125-126 (triangle solid angle).
 *   Newman (1986) J. Eng. Math. 20:113-126 (source and normal-dipole quadrilateral integrals).
 *   Johnson (1980) NASA CR-3079 (structure of the linear-strength doublet integral; cross-checked, not copied).
 *   Richardson (1911) Phil. Trans. R. Soc. A 210:307-357; Roache (1998) Verification and Validation in
 *   Computational Science and Engineering; Celik et al. (2008) J. Fluids Eng. 130:078001 (observed order
 *   with non-uniform refinement ratios); Fritsch & Carlson (1980) SIAM J. Numer. Anal. 17:238-246 (PCHIP).
 *
 * Scope, enforced or reported, never silently extended:
 *   steady, incompressible (Mach <= 0.3 enforced, no compressibility correction), inviscid,
 *   attached flow; symmetric flight only (sideslip 0, no rotation rates); rigid geometry; sharp
 *   aerodynamic trailing edge (the printed trailing-edge thickness is a manufacturing feature and
 *   is closed for the aerodynamic surface); flat wake along body +x (not relaxed, not aligned with
 *   the freestream). No stall, separation, transition, viscous drag or leading-edge vortex lift.
 *
 * Units: geometry mm; speed m/s; density kg/m^3; pressure Pa; force N; moment N mm.
 * Axes: aircraft axes, x aft, y right semi-span, z up. Freestream (air relative to the
 * wing) V (cos a, 0, sin a): positive angle of attack a is air arriving from below the nose.
 * Browser: global WingAeroPanel. Node: require('./wing_aero_panel.js').
 */
const WingAeroPanel = (() => {
  'use strict';
  const VERSION = '0.3.2-exp.4';
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
    method: 'Surface panels on the finite-thickness wing (experimental candidate): doublets a C1 quadratic spline in both surface directions, quadratic on each triangle of every panel and continuous over the whole body (tensor-quadratic; the span-quadratic model, also used with the diagnostic flat tip cap, and the constant 0.3.1 model remain selectable); sources constant on each triangle; internal Dirichlet condition; Morino Kutta condition matched pointwise along the trailing edge; flat semi-infinite wake along body +x carrying the jump of the trailing-edge doublet traces; surface velocity from the jump relations of the solved sheet, quadratic Cp integrated exactly; symmetric image half-wing.',
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

  // The 0.3.1 wake (constant-strength semi-infinite strips, strength = Kutta jump) at P and its mirror image, added to
  // target[offset + panel]: exactly the 0.3.1 assembly arithmetic, used for field evaluations of the constant model.
  function addWakeRow(W, px, py, pz, image, target, offset) {
    for (let w = 0; w < W.count; w++) {
      const o = 3 * w;
      let d = semiInfiniteAngle(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
      if (image) d += semiInfiniteAngle(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
      d *= INV4PI; for (let q = 0; q < W.kuttaWidth; q++) { const c = W.kuttaWeights[w * W.kuttaWidth + q]; if (c) target[offset + W.kuttaPanels[w * W.kuttaWidth + q]] += d * c; }
    }
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

  // ------------------------------------------------------------------ span-quadratic doublet (candidate 0.3.2-exp.2)
  // Model ('span-quadratic'). On every wing panel the doublet is constant in the chordwise direction and, along the
  // span, the quadratic Q_k(y) through three values: the panel unknown mu_k at the panel's mid-span y_m = (y_j +
  // y_j+1)/2 and the knot values e at its two spanwise stations y_j, y_j+1 (the panel's v0v1 and v3v2 edges; every node
  // of a station has the same y). The knot values make the doublet a C1 quadratic spline in arc position s along each
  // CHAIN of panels (spanQuadChains): a chordwise row from the root to the tip, around the tip (rounded fold or closed tip
  // point) and back along the opposite row (seam(i) = ni - 1 - i) to the root; the root ends have zero spanwise slope
  // (the mirror image: symmetric flight). C1 condition at an interior knot k between cells k-1, k (widths h):
  //   e_k-1 / h_k-1 + 3 e_k (1/h_k-1 + 1/h_k) + e_k+1 / h_k = 4 mu_k-1 / h_k-1 + 4 mu_k / h_k,
  // clamped root end (zero slope of the first cell): (3 e_0 + e_1)/h_0 = 4 mu_0 / h_0 (likewise at the other end);
  // a symmetric, diagonally dominant tridiagonal system T e = R mu per chain (Thomas algorithm; cyclic chains for an
  // explicit full span by Sherman-Morrison). Next to a flat cap (diagnostic option) each row is its own chain with a
  // natural (linear last cell) tip end, and the cap panels keep constant doublets.
  // Why quadratic and not piecewise linear through the mid-span values: a piecewise-linear doublet with its nodes at the
  // control points (tried first as 'span-linear', checkpoint 1) has its spanwise slope discontinuity, i.e. a jump of
  // the trailing-vorticity density, exactly at the collocation stations (anti-staggered); it under-predicted lift by
  // 6.6 % at 16 x 12 on the AR-6 wing and converged from below, while a reconstruction smooth at the control points
  // recovered the 0.3.1 / PANAIR level. The C1 spline is smooth at the control points, has its knots (the second-
  // derivative jumps) at the stations, staggered like the 0.3.1 trailing vortices, and has no jump anywhere.
  // Trailing edge: the two trailing-edge rows (i = 0 lower, ni - 1 upper) form one chain, so both traces are quadratics
  // on the same stations and their difference is the wake strength (spanQuadWake: one semi-infinite strip per strip
  // with quadratic spanwise strength through the jumps at a_j, the mid-point and b_j): mu_upper - mu_lower - mu_wake = 0
  // at every point of the trailing edge, and at the tip the two rows share the fold knot, so the wake strength is
  // exactly zero there.
  //
  // Potential of a doublet Q(y) on a planar triangle (unit normal n, counter-clockwise about n), exact closed form,
  // derived here (Taylor expansion of the quadratic about the projection P^ = P - h n of the field point and the 2-D
  // divergence theorem; edge integrals of Hess & Smith 1967; solid angle of Van Oosterom & Strackee 1983):
  //   phi(P) = (1/4pi) [ Q(y^) Omega + h Q'(y^) G1 + (1/2) h Q'' G2 ],  y^ = y(P^),  h = (P - Q0).n,
  //   G1 = Y . grad_par S = -sum_e (Y.m_e) L_e,
  //   G2 = int (Y.(X - P^))^2 / r^3 dA = sum_e (Y.u_e) [ (Y.u_e) d_e L_e - (Y.m_e)(r_end - r_start) ] - |Y|^2 h Omega,
  // with Y = y^ - n_y n the in-plane gradient of y, u_e / m_e the unit direction / outward in-plane normal of edge e,
  // d_e = (X_start - P).m_e the signed distance of P^ from the edge line (positive inside), L_e = int_e dl / r =
  // ln[(r_a + r_b + l)/(r_a + r_b - l)], and the identity eta_a eta_b / r^3 = delta_ab / r - d/d eta_b (eta_a / r)
  // (eta = X - P^, r^2 = |eta|^2 + h^2) for the quadratic term; S = int dA / r = sum_e d_e L_e - h Omega. (The linear
  // part is the structure of Johnson 1980, NASA CR-3079, eq. D.30, as implemented in MachLine; no code was copied.)
  // A panel is split through its TRUE corners (watertight with every neighbour like the 0.3.1 rings; the boundary being
  // the 0.3.1 quadrilateral, equal values reproduce the 0.3.1 solid angle) into two triangles along its SHORTER diagonal
  // (mode 0; the corners are stored rotated so that diagonal is 0-2), or, when the diagonals tie on a warped panel, into
  // the fan of four triangles about the vertex mean M (mode 1). Both rules are invariant under the relabelling that maps
  // an upper panel onto its mirror-image lower panel (a fixed diagonal split is not: on warped panels it made a
  // symmetric section lift). The source is integrated over the same triangles from the same edge integrals, each
  // triangle with its OWN normal: the Dirichlet source of the triangulated surface is sigma_t = -V.n_t, so a row stores
  // the vector sum_t S_t n_t (a single panel normal on both triangles of a warped panel made the error of a twisted,
  // airfoil-blended wing depend on the chordwise mesh; planar panels are unchanged).
  const SQ_ED = [Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 0, 2]), Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 4, 0, 4, 1, 4, 2, 4, 3])]; // segments
  const SQ_TV = [Int8Array.from([0, 1, 2, 0, 2, 3]), Int8Array.from([4, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0])];                         // triangles
  const SQ_TS = [Int8Array.from([0, 1, 0, 1, 2, 1, 2, 0, 4, 0, 2, 4, 2, 3, 2, 3, 0, 3]),
    Int8Array.from([4, 0, 4, 0, 1, 0, 1, 4, 5, 4, 1, 5, 1, 2, 1, 2, 4, 6, 4, 2, 6, 2, 3, 2, 3, 4, 7, 4, 3, 7, 3, 0, 3, 0, 4, 4])]; // per triangle edge: start, end, segment
  const SQ_NP = [4, 5], SQ_NS = [5, 8], SQ_NTM = [2, 4];
  const SQ_STRIDE = 154, SQ_Y = 23, SQ_T0 = 25, SQ_FAR = 113, SQ_CP = 149, SQ_MODE = 152;
  // panel data: [0,15) corners and M; [15,23) segment lengths; [23,25) y of the v0v1 / v3v2 stations; per triangle (22):
  // n (3), Y (3), |Y|^2, then per edge (5): m (3), Y.u, Y.m; far moments (36); control-point weights (3).
  const SQR = new Float64Array(15), SQr = new Float64Array(5), SQL = new Float64Array(8);
  // Lagrange quadratic through t = 0 (value at y_L), 1/2 (mid-span), 1 (y_R) and its t-derivatives.
  const quadN = (t, out) => { out[0] = (1 - t) * (1 - 2 * t); out[1] = 4 * t * (1 - t); out[2] = t * (2 * t - 1); out[3] = 4 * t - 3; out[4] = 4 - 8 * t; out[5] = 4 * t - 1; };
  const SQN = new Float64Array(6), SQSV = new Float64Array(3), BPV = new Float64Array(3); // SQSV: source of the fan as sum over triangles of S_t n_t (per-triangle normals)
  // Returns the potential of a unit source on the same fan (Hess & Smith: (1/4pi) sum_tri [ sum_e d_e L_e - h Omega ]),
  // from the same edge integrals.
  function spanQuadNear(D, o, px, py, pz, c) {
    let src = 0, svx = 0, svy = 0, svz = 0;
    const mode = D[o + SQ_MODE], ED = SQ_ED[mode], TV = SQ_TV[mode], TS = SQ_TS[mode], nT = SQ_NTM[mode];
    for (let v = 0, np = SQ_NP[mode]; v < np; v++) {
      const x = px - D[o + 3 * v], y = py - D[o + 3 * v + 1], z = pz - D[o + 3 * v + 2];
      SQR[3 * v] = x; SQR[3 * v + 1] = y; SQR[3 * v + 2] = z; SQr[v] = sqrt(x * x + y * y + z * z);
    }
    for (let e = 0, ns = SQ_NS[mode]; e < ns; e++) {
      const d = D[o + 15 + e];
      if (!(d > 0)) { SQL[e] = 0; continue; }
      const a = ED[2 * e], b = ED[2 * e + 1], ra = SQr[a], rb = SQr[b];
      const ax = SQR[3 * a], ay = SQR[3 * a + 1], az = SQR[3 * a + 2], bx = SQR[3 * b], by = SQR[3 * b + 1], bz = SQR[3 * b + 2];
      const ab = ax * bx + ay * by + az * bz;
      let den;
      if (ab >= 0) den = ra + rb - d;
      else { const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; den = 2 * (cx * cx + cy * cy + cz * cz) / ((ra * rb - ab) * (ra + rb + d)); }
      SQL[e] = den > 0 ? logn((ra + rb + d) / den) : 0;
    }
    const yL = D[o + SQ_Y], dy = D[o + SQ_Y + 1] - yL;
    for (let t = 0; t < nT; t++) {
      const to = o + SQ_T0 + 22 * t, Y2 = D[to + 6];
      if (!(Y2 >= 0)) continue; // degenerate triangle (collapsed tip corner): marked with Y2 = -1
      const nx = D[to], ny = D[to + 1], nz = D[to + 2], i0 = TV[3 * t], i1 = TV[3 * t + 1], i2 = TV[3 * t + 2];
      const x0 = SQR[3 * i0], y0 = SQR[3 * i0 + 1], z0 = SQR[3 * i0 + 2], x1 = SQR[3 * i1], y1 = SQR[3 * i1 + 1], z1 = SQR[3 * i1 + 2];
      const x2 = SQR[3 * i2], y2 = SQR[3 * i2 + 1], z2 = SQR[3 * i2 + 2], r0 = SQr[i0], r1 = SQr[i1], r2 = SQr[i2];
      const det = x0 * (y1 * z2 - z1 * y2) + y0 * (z1 * x2 - x1 * z2) + z0 * (x1 * y2 - y1 * x2);
      const den = r0 * r1 * r2 + (x0 * x1 + y0 * y1 + z0 * z1) * r2 + (x0 * x2 + y0 * y2 + z0 * z2) * r1 + (x1 * x2 + y1 * y2 + z1 * z2) * r0;
      const om = 2 * atan2(det, den), h = x0 * nx + y0 * ny + z0 * nz;
      let G1 = 0, G2 = 0, dL = 0;
      for (let q = 0; q < 3; q++) {
        const eo = to + 7 + 5 * q, ts = 9 * t + 3 * q, s = TS[ts], e = TS[ts + 1], L = SQL[TS[ts + 2]];
        const Yu = D[eo + 3], Ym = D[eo + 4];
        const d = -(SQR[3 * s] * D[eo] + SQR[3 * s + 1] * D[eo + 1] + SQR[3 * s + 2] * D[eo + 2]);
        G1 -= Ym * L; G2 += Yu * (Yu * d * L - Ym * (SQr[e] - SQr[s])); dL += d * L;
      }
      const st = dL - h * om; src += st; svx += st * nx; svy += st * ny; svz += st * nz;
      G2 -= Y2 * h * om;
      quadN((py - h * ny - yL) / dy, SQN);
      const f1 = h * G1 / dy, f2 = 0.5 * h * G2 / (dy * dy);
      c[0] += (SQN[0] * om + SQN[3] * f1 + 4 * f2) * INV4PI;
      c[1] += (SQN[1] * om + SQN[4] * f1 - 8 * f2) * INV4PI;
      c[2] += (SQN[2] * om + SQN[5] * f1 + 4 * f2) * INV4PI;
    }
    SQSV[0] = svx * INV4PI; SQSV[1] = svy * INV4PI; SQSV[2] = svz * INV4PI;
    return src * INV4PI;
  }
  // Far field (beyond farField panel diameters, as 0.3.1): multipole expansion about the centroid through the first
  // moments: phi_q = (1/4pi) [ (a_q . R - tr B_q)/r^3 + 3 R . B_q . R / r^5 ], a_q = int N_q n dA, B_q = int N_q n (x)
  // (X - C) dA (exact for the quadratic shape functions with a degree-5 triangle rule), R = P - C; error O((d/r)^2).
  // (Layout: 30 numbers from SQ_FAR.)
  // Stored per value q (10 numbers): a_q / 4pi (3), tr B_q / 4pi, and 3/4pi times the symmetric part of B_q as
  // (xx, yy, zz, xy + yx, xz + zx, yz + zy), so R . B_q . R costs six products.
  function spanQuadFar(D, o, dx, dy, dz, r2, c) {
    const ir3 = 1 / (r2 * sqrt(r2)), ir5 = ir3 / r2, xx = dx * dx, yy = dy * dy, zz = dz * dz, xy = dx * dy, xz = dx * dz, yz = dy * dz;
    let f = o + SQ_FAR;
    for (let q = 0; q < 3; q++, f += 10) c[q] += (D[f] * dx + D[f + 1] * dy + D[f + 2] * dz - D[f + 3]) * ir3 + (D[f + 4] * xx + D[f + 5] * yy + D[f + 6] * zz + D[f + 7] * xy + D[f + 8] * xz + D[f + 9] * yz) * ir5;
  }
  // Semi-infinite planar strip from the trailing-edge segment A -> B along the unit vector u, with a doublet strength
  // constant along u and quadratic in y through mu_A (at y_A), mu_mid (at (y_A + y_B)/2), mu_B (at y_B); u must have no y
  // component (body +x or a freestream in the x-z plane). The same expansion as spanQuadNear over the strip's edges:
  // the two semi-infinite sides carry no Y.u_e (the divergent side-edge parts of S and of the edge sums cancel exactly),
  // the far edge contributes (Y.e)^2 l / |u x e| in the limit, so with e = (B - A)/l, s_n = |u x e|, Y.e = (y_B - y_A)/l:
  //   G1 = -(Y.e) [ (u.e) L_AB + L_B - L_A ] / s_n,   (L_B - L_A as in linearHalfStrip, finite)
  //   G2 = (Y.e)^2 [ d_AB L_AB - (u.e)(r_B - r_A) / s_n + l / s_n ] - |Y|^2 h Omega,  |Y|^2 = (Y.e)^2 / s_n^2,
  // d_AB = (P - A).(u - (u.e) e) / s_n, Omega = semiInfiniteAngle, n = u x e / s_n. out[0..2]: coefficients of the values.
  function quadStrip(px, py, pz, ax, ay, az, ux, uy, uz, bx, by, bz, out) {
    let ex = bx - ax, ey = by - ay, ez = bz - az;
    const l = sqrt(ex * ex + ey * ey + ez * ez), dyAB = ey; ex /= l; ey /= l; ez /= l;
    const eu = ex * ux + ey * uy + ez * uz;
    let nx = uy * ez - uz * ey, ny = uz * ex - ux * ez, nz = ux * ey - uy * ex;
    const sn = sqrt(nx * nx + ny * ny + nz * nz); nx /= sn; ny /= sn; nz /= sn;
    const dax = px - ax, day = py - ay, daz = pz - az, dbx = px - bx, dby = py - by, dbz = pz - bz;
    const h = dax * nx + day * ny + daz * nz, om = semiInfiniteAngle(px, py, pz, ax, ay, az, ux, uy, uz, bx, by, bz);
    let G1 = 0, G2 = 0;
    const ye = dyAB / l, Y2 = ye * ye / (sn * sn);
    if (h !== 0) {
      const rA = sqrt(dax * dax + day * day + daz * daz), rB = sqrt(dbx * dbx + dby * dby + dbz * dbz);
      const side = (dx, dy, dz, r) => { const du = dx * ux + dy * uy + dz * uz; if (du <= 0) return r - du; const cx = dy * uz - dz * uy, cy = dz * ux - dx * uz, cz = dx * uy - dy * ux; return (cx * cx + cy * cy + cz * cz) / (r + du); };
      const ab = dax * dbx + day * dby + daz * dbz;
      let den;
      if (ab >= 0) den = rA + rB - l;
      else { const cx = day * dbz - daz * dby, cy = daz * dbx - dax * dbz, cz = dax * dby - day * dbx; den = 2 * (cx * cx + cy * cy + cz * cz) / ((rA * rB - ab) * (rA + rB + l)); }
      const LAB = logn((rA + rB + l) / den), LBA = logn(side(dax, day, daz, rA) / side(dbx, dby, dbz, rB));
      const dAB = (dax * (ux - eu * ex) + day * (uy - eu * ey) + daz * (uz - eu * ez)) / sn;
      G1 = -ye * (eu * LAB + LBA) / sn;
      G2 = ye * ye * (dAB * LAB - eu * (rB - rA) / sn + l / sn) - Y2 * h * om;
    }
    quadN((py - h * ny - ay) / dyAB, SQN);
    const f1 = h * G1 / dyAB, f2 = 0.5 * h * G2 / (dyAB * dyAB);
    out[0] = (SQN[0] * om + SQN[3] * f1 + 4 * f2) * INV4PI;
    out[1] = (SQN[1] * om + SQN[4] * f1 - 8 * f2) * INV4PI;
    out[2] = (SQN[2] * om + SQN[5] * f1 + 4 * f2) * INV4PI;
  }
  // Chain solver: T e = R mu (see the model note). chain = { cells: Int32Array (panel per cell, in chain order),
  // h: Float64Array (cell widths), knots: Int32Array (knot ids: N + 1 for an open chain, N for a cyclic one),
  // start / end: 'clamped' | 'natural' (open chains), cyclic: bool }. T is symmetric (rows scaled by 1/h), so the
  // transposed map needed by the matrix rows uses the same solver.
  function chainSystem(ch) {
    const N = ch.cells.length, h = ch.h, cyc = !!ch.cyclic, m = cyc ? N : N + 1;
    const lo = new Float64Array(m), di = new Float64Array(m), up = new Float64Array(m); // row k: lo e_k-1 + di e_k + up e_k+1
    const R0 = new Float64Array(m), R1 = new Float64Array(m); // rhs row k: R0 mu_{k-1} + R1 mu_k (cells mod N for cyclic)
    for (let k = 0; k < m; k++) {
      if (!cyc && k === 0) { if (ch.start === 'natural') { di[0] = 1 / h[0]; up[0] = 1 / h[0]; R1[0] = 2 / h[0]; } else { di[0] = 3 / h[0]; up[0] = 1 / h[0]; R1[0] = 4 / h[0]; } continue; }
      if (!cyc && k === N) { const hl = h[N - 1]; if (ch.end === 'natural') { lo[N] = 1 / hl; di[N] = 1 / hl; R0[N] = 2 / hl; } else { lo[N] = 1 / hl; di[N] = 3 / hl; R0[N] = 4 / hl; } continue; }
      const hl = h[(k - 1 + N) % N], hr = h[k % N];
      lo[k] = 1 / hl; di[k] = 3 * (1 / hl + 1 / hr); up[k] = 1 / hr; R0[k] = 4 / hl; R1[k] = 4 / hr;
    }
    // Thomas factorisation of the open tridiagonal part (for cyclic: of the matrix with the corner terms moved out)
    const cp = new Float64Array(m);
    const solveOpen = (dd, rhs) => { // in place on rhs, tridiagonal lo/dd/up of size m (no corners)
      let b = dd[0]; cp[0] = up[0] / b; rhs[0] /= b;
      for (let k = 1; k < m; k++) { b = dd[k] - lo[k] * cp[k - 1]; cp[k] = up[k] / b; rhs[k] = (rhs[k] - lo[k] * rhs[k - 1]) / b; }
      for (let k = m - 2; k >= 0; k--) rhs[k] -= cp[k] * rhs[k + 1];
      return rhs;
    };
    let solve;
    if (!cyc) solve = rhs => solveOpen(di, rhs);
    else { // Sherman-Morrison: T = T' + w v^T with corner terms T[0][m-1] = lo[0], T[m-1][0] = up[m-1]
      const gam = -di[0], d2 = Float64Array.from(di); d2[0] = di[0] - gam; d2[m - 1] = di[m - 1] - lo[0] * up[m - 1] / gam;
      const w = new Float64Array(m); w[0] = gam; w[m - 1] = up[m - 1];
      const z = solveOpen(d2, Float64Array.from(w)), vz = z[0] + lo[0] / gam * z[m - 1];
      solve = rhs => { const y = solveOpen(d2, rhs), vy = y[0] + lo[0] / gam * y[m - 1], f = vy / (1 + vz); for (let k = 0; k < m; k++) y[k] -= f * z[k]; return y; };
    }
    return { N, m, R0, R1, solve, cyclic: cyc, z: new Float64Array(m) };
  }
  // The same chain system with its Thomas factorization precomputed (multiplications only in each solve); used by the
  // tensor-quadratic model, whose rows apply hundreds of chain solves (chainSystem itself stays unchanged).
  function chainSystemT(ch) {
    const N = ch.cells.length, h = ch.h, cyc = !!ch.cyclic, m = cyc ? N : N + 1;
    const lo = new Float64Array(m), di = new Float64Array(m), up = new Float64Array(m), R0 = new Float64Array(m), R1 = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      if (!cyc && k === 0) { if (ch.start === 'natural') { di[0] = 1 / h[0]; up[0] = 1 / h[0]; R1[0] = 2 / h[0]; } else { di[0] = 3 / h[0]; up[0] = 1 / h[0]; R1[0] = 4 / h[0]; } continue; }
      if (!cyc && k === N) { const hl = h[N - 1]; if (ch.end === 'natural') { lo[N] = 1 / hl; di[N] = 1 / hl; R0[N] = 2 / hl; } else { lo[N] = 1 / hl; di[N] = 3 / hl; R0[N] = 4 / hl; } continue; }
      const hl = h[(k - 1 + N) % N], hr = h[k % N];
      lo[k] = 1 / hl; di[k] = 3 * (1 / hl + 1 / hr); up[k] = 1 / hr; R0[k] = 4 / hl; R1[k] = 4 / hr;
    }
    const fac = dd => { const ib = new Float64Array(m), cp = new Float64Array(m); let b = dd[0]; ib[0] = 1 / b; cp[0] = up[0] * ib[0]; for (let k = 1; k < m; k++) { b = dd[k] - lo[k] * cp[k - 1]; ib[k] = 1 / b; cp[k] = up[k] * ib[k]; } return { ib, cp }; };
    const solveF = (F, rhs) => { const ib = F.ib, cp = F.cp; rhs[0] *= ib[0]; for (let k = 1; k < m; k++) rhs[k] = (rhs[k] - lo[k] * rhs[k - 1]) * ib[k]; for (let k = m - 2; k >= 0; k--) rhs[k] -= cp[k] * rhs[k + 1]; return rhs; };
    let solve, F, smz = null, smf = 0, smg = 0;
    if (!cyc) { F = fac(di); solve = rhs => solveF(F, rhs); }
    else {
      const gam = -di[0], d2 = Float64Array.from(di); d2[0] = di[0] - gam; d2[m - 1] = di[m - 1] - lo[0] * up[m - 1] / gam;
      F = fac(d2); const w = new Float64Array(m); w[0] = gam; w[m - 1] = up[m - 1];
      const z = solveF(F, w), vz = z[0] + lo[0] / gam * z[m - 1];
      smz = z; smf = lo[0] / gam; smg = 1 / (1 + vz);
      solve = rhs => { const y = solveF(F, rhs), vy = y[0] + lo[0] / gam * y[m - 1], f = vy / (1 + vz); for (let k = 0; k < m; k++) y[k] -= f * z[k]; return y; };
    }
    return { N, m, R0, R1, solve, cyclic: cyc, z: new Float64Array(m), lo, ib: F.ib, cp: F.cp, smz, smf, smg };
  }
  // Knot values of all chains from the panel unknowns.
  function knotValues(B, mu) {
    const e = new Float64Array(B.knotCount);
    for (const ch of B.chains) {
      const s = ch.sys, rhs = new Float64Array(s.m);
      for (let k = 0; k < s.m; k++) { const cl = (k - 1 + s.N) % s.N; rhs[k] = (s.R0[k] ? s.R0[k] * mu[ch.cells[cl]] : 0) + (s.R1[k] ? s.R1[k] * mu[ch.cells[k % s.N]] : 0); }
      const x = s.solve(rhs); for (let k = 0; k < s.m; k++) e[ch.knots[k]] = x[k];
    }
    return e;
  }
  // Doublet at each panel centroid (the surface potential sampled by the gradient recovery): Q_k(y_centroid).
  function controlPointValues(B, mu) {
    const out = Float64Array.from(mu), D = B.data, e = knotValues(B, mu);
    for (let k = 0; k < out.length; k++) if (B.quad[k]) { const o = B.stride * k + SQ_CP; out[k] = D[o] * e[B.kL[k]] + D[o + 1] * mu[k] + D[o + 2] * e[B.kR[k]]; }
    return out;
  }
  // Span-quadratic basis. kL[k] / kR[k]: knot on panel k's v0v1 / v3v2 edge (-1 for a constant panel, e.g. a flat cap);
  // chains: see chainSystem (every knot belongs to exactly one chain).
  function spanQuadBasis(S, kL, kR, chains, knotCount) {
    const n = S.count, D = new Float64Array(SQ_STRIDE * n), quad = new Uint8Array(n);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = a => Math.hypot(a[0], a[1], a[2]);
    const GP = [[1 / 3, 1 / 3, 1 / 3, 0.225], [0.059715871789770, 0.470142064105115, 0.470142064105115, 0.132394152788506], [0.470142064105115, 0.059715871789770, 0.470142064105115, 0.132394152788506], [0.470142064105115, 0.470142064105115, 0.059715871789770, 0.132394152788506], [0.797426985353087, 0.101286507323456, 0.101286507323456, 0.125939180544827], [0.101286507323456, 0.797426985353087, 0.101286507323456, 0.125939180544827], [0.101286507323456, 0.101286507323456, 0.797426985353087, 0.125939180544827]];
    const N6 = new Float64Array(6), selfSource = new Float64Array(n), fanArea = new Float64Array(n), selfSourceVec = new Float64Array(3 * n), fanVec = new Float64Array(3 * n);
    for (let k = 0; k < n; k++) {
      if (kL[k] < 0 && kR[k] < 0) continue;
      if (!(kL[k] >= 0 && kL[k] < knotCount && kR[k] >= 0 && kR[k] < knotCount)) throw new Error('A span-quadratic panel needs two valid knots.');
      quad[k] = 1;
      const o = SQ_STRIDE * k, V = S.PV, v = 12 * k, corner = [0, 1, 2, 3].map(q => [V[v + 3 * q], V[v + 3 * q + 1], V[v + 3 * q + 2]]);
      const d02 = len(sub(corner[2], corner[0])), d13 = len(sub(corner[3], corner[1])), tie = absv(d02 - d13) <= 1e-9 * Math.max(d02, d13);
      const mode = tie && S.PW[k] > 1e-12 * S.PD[k] ? 1 : 0, rot = !tie && d13 < d02 ? 1 : 0;
      const pt = mode ? corner.slice() : [0, 1, 2, 3].map(q => corner[(q + rot) % 4]);
      pt.push([0, 1, 2].map(c => 0.25 * (corner[0][c] + corner[1][c] + corner[2][c] + corner[3][c])));
      D[o + SQ_MODE] = mode;
      const yL = corner[0][1], yR = corner[3][1], sc = Math.max(1, absv(yL), absv(yR));
      if (absv(corner[1][1] - yL) > 1e-9 * sc || absv(corner[2][1] - yR) > 1e-9 * sc || !(absv(yR - yL) > 1e-12 * sc)) throw new Error(`Span-quadratic panel ${k}: its spanwise edges must lie on two distinct stations y = const.`);
      const ED = SQ_ED[mode], TV = SQ_TV[mode], TS = SQ_TS[mode];
      for (let q = 0; q < SQ_NP[mode]; q++) for (let c = 0; c < 3; c++) D[o + 3 * q + c] = pt[q][c];
      for (let e = 0; e < SQ_NS[mode]; e++) D[o + 15 + e] = len(sub(pt[ED[2 * e + 1]], pt[ED[2 * e]]));
      const C = [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]], tOf = y => (y - yL) / (yR - yL), mom = new Float64Array(36);
      for (let t = 0; t < SQ_NTM[mode]; t++) {
        const Q = [pt[TV[3 * t]], pt[TV[3 * t + 1]], pt[TV[3 * t + 2]]], to = o + SQ_T0 + 22 * t;
        const N = cross(sub(Q[1], Q[0]), sub(Q[2], Q[0])), twoA = len(N);
        if (!(twoA > 1e-14 * S.PD[k] * S.PD[k])) { D[to + 6] = -1; continue; }
        const nn = N.map(x => x / twoA), Y = [-nn[1] * nn[0], 1 - nn[1] * nn[1], -nn[1] * nn[2]], area = 0.5 * twoA;
        fanArea[k] += area; fanVec[3 * k] += area * nn[0]; fanVec[3 * k + 1] += area * nn[1]; fanVec[3 * k + 2] += area * nn[2];
        D[to] = nn[0]; D[to + 1] = nn[1]; D[to + 2] = nn[2]; D[to + 3] = Y[0]; D[to + 4] = Y[1]; D[to + 5] = Y[2]; D[to + 6] = dot(Y, Y);
        for (let q = 0; q < 3; q++) {
          const ts = 9 * t + 3 * q, A = pt[TS[ts]], Bp = pt[TS[ts + 1]], dl = len(sub(Bp, A)), eo = to + 7 + 5 * q;
          const u = dl > 0 ? sub(Bp, A).map(x => x / dl) : [0, 0, 0], m = cross(u, nn);
          D[eo] = m[0]; D[eo + 1] = m[1]; D[eo + 2] = m[2]; D[eo + 3] = dot(Y, u); D[eo + 4] = dot(Y, m);
        }
        for (const [l0, l1, l2, w] of GP) { // far-field moments, degree-5 rule (exact: quadratic x linear)
          const X = [0, 1, 2].map(c => l0 * Q[0][c] + l1 * Q[1][c] + l2 * Q[2][c]); quadN(tOf(X[1]), N6);
          for (let q = 0; q < 3; q++) {
            const wq = w * area * N6[q], fa = 3 * q, fb = 9 + 9 * q;
            for (let c = 0; c < 3; c++) mom[fa + c] += wq * nn[c];
            for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) mom[fb + 3 * a + b] += wq * nn[a] * (X[b] - C[b]);
          }
        }
      }
      for (let q = 0; q < 3; q++) { // pack (see spanQuadFar)
        const f = o + SQ_FAR + 10 * q, a = 3 * q, b = 9 + 9 * q;
        D[f] = mom[a] * INV4PI; D[f + 1] = mom[a + 1] * INV4PI; D[f + 2] = mom[a + 2] * INV4PI; D[f + 3] = (mom[b] + mom[b + 4] + mom[b + 8]) * INV4PI;
        D[f + 4] = 3 * mom[b] * INV4PI; D[f + 5] = 3 * mom[b + 4] * INV4PI; D[f + 6] = 3 * mom[b + 8] * INV4PI;
        D[f + 7] = 3 * (mom[b + 1] + mom[b + 3]) * INV4PI; D[f + 8] = 3 * (mom[b + 2] + mom[b + 6]) * INV4PI; D[f + 9] = 3 * (mom[b + 5] + mom[b + 7]) * INV4PI;
      }
      D[o + SQ_Y] = yL; D[o + SQ_Y + 1] = yR;
      quadN(tOf(C[1]), N6); D[o + SQ_CP] = N6[0]; D[o + SQ_CP + 1] = N6[1]; D[o + SQ_CP + 2] = N6[2];
      selfSource[k] = spanQuadNear(D, o, C[0], C[1], C[2], new Float64Array(3)); // source of the fan at its own centroid (finite)
      selfSourceVec[3 * k] = SQSV[0]; selfSourceVec[3 * k + 1] = SQSV[1]; selfSourceVec[3 * k + 2] = SQSV[2];
    }
    const sys = chains.map(ch => ({ ...ch, sys: chainSystem(ch) }));
    const seen = new Int32Array(knotCount); for (const ch of sys) for (const kn of ch.knots) seen[kn]++;
    if (!seen.every(v => v === 1)) throw new Error('Span-quadratic basis: every knot must belong to exactly one chain.');
    return Object.freeze({ kind: 'span-quadratic', S, chainsRaw: chains, data: D, stride: SQ_STRIDE, quad, kL: Int32Array.from(kL), kR: Int32Array.from(kR), chains: sys, knotCount, selfSource, fanArea, selfSourceVec, fanVec,
      scratchM: new Float64Array(n), scratchE: new Float64Array(knotCount), c3: new Float64Array(3) });
  }
  // The basis for surface S: B itself when it was built for S, otherwise the same topology (knots, chains) rebuilt on S
  // (e.g. a translated or rotated copy of the mesh with the same panel ordering).
  function basisFor(B, S) { return !B || B.S === S ? B : B.kind === 'tensor-quadratic' ? tensorQuadBasis(S, B.topo) : spanQuadBasis(S, B.kL, B.kR, B.chainsRaw, B.knotCount); }
  // ------------------------------------------------------------------ tensor-quadratic doublet (candidate 0.3.2-exp.3)
  // Model ('tensor-quadratic'). The C1 quadratic spline of the span-quadratic model is applied in BOTH surface
  // directions: along every spanwise chain (as before: root -> tip -> mirror row, zero slope at the root) AND along the
  // section loop (lower trailing edge -> leading edge -> upper trailing edge, natural = linear end cell at both trailing-
  // edge ends) of every strip and every station. Values (one id space, 'unified'): mu (the panel unknowns, the doublet
  // at the panel's parametric centre), MK (row mid-chord at the stations = the span-chain knots), KM (section-loop knots
  // at strip mid-span: the chordwise spline of mu along strip j) and KK (section-loop knots at the stations: the
  // chordwise spline of MK along station j). Nine values per panel (corners KK, edge mid-points MK / KM, centre mu)
  // define the biquadratic f(s, t) of the panel's parameters (s chordwise, t spanwise); on every triangle of the panel's
  // split the doublet is the quadratic (P2) through f at the triangle's vertices and edge mid-points (at the bilinear
  // pre-image of each physical point), so an edge shared by two panels carries the same three values on both sides:
  // the body doublet is continuous everywhere (no line vortex anywhere on the body). Rounded tip: the tip station's
  // loop is the folded camber line, its data are symmetric (a row and its seam row share the span-chain tip knot), so
  // are its knots, and the two trailing-edge traces meet there. Closed tip: every value at the tip point is one value T
  // (mean of the span-chain tip knots). Wake: strip j carries the quadratic through KK(ni, j) - KK(0, j), KM(ni, j) -
  // KM(0, j), KK(ni, j+1) - KK(0, j+1), i.e. upper minus lower trailing-edge trace at every point (zero at the tip).
  // Why: a 2-D study (constant source, Dirichlet, Morino; Karman-Trefftz and NACA 0012 sections) shows the constant
  // chordwise doublet has a FIRST-order lift and moment error (-1.9 % in Cl and +0.0015 in Cm at 32 panels per surface)
  // and the chordwise spline about 2.5th order (+0.1 %, -0.0003).
  // Potential of a quadratic doublet mu(X) on a planar triangle, exact closed form (the vector / tensor form of the span-
  // quadratic expansion, the same edge integrals; derivation: eta_a eta_b / r^3 = delta_ab / r - d/d eta_b (eta_a / r)):
  //   phi(P) = [mu(P^) Omega + h grad(mu) . g + 1/2 h H : G] / 4 pi,  g = -sum_e m_e L_e,
  //   G = sum_e [d_e L_e u_e u_e^T - (r_end - r_start) sym(u_e m_e^T)] - h Omega I,
  // H the constant in-plane Hessian. For the P2 basis (barycentric lambda_i of P^, constant in-plane grad lambda_i):
  // p_i = grad lambda_i . g, q_ij = grad lambda_i^T G grad lambda_j, and
  //   vertex i: [lambda_i (2 lambda_i - 1) Omega + h (4 lambda_i - 1) p_i + 2 h q_ii] / 4 pi,
  //   mid ij:   [4 lambda_i lambda_j Omega + 4 h (lambda_i p_j + lambda_j p_i) + 4 h q_ij] / 4 pi.
  // Panel split: mode 0 two triangles along the shorter diagonal (as span-quadratic), mode 1 the fan of four about the
  // vertex mean when the diagonals tie (warped or not), mode 2 a fan of three about the vertex mean on a panel whose
  // v2 v3 edge has collapsed to the closed-tip point. Source: per triangle, its own normal (as span-quadratic).
  // Exception (tbSplitRule): two mode-0 panels whose triangles would coincide (the closed corners of the last strip)
  // take the other diagonal instead, or the fan of four if a coincidence remained.
  const TQ_ED = [Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 0, 2]), Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 4, 0, 4, 1, 4, 2, 4, 3]), Int8Array.from([0, 1, 1, 2, 2, 0, 4, 0, 4, 1, 4, 2])];
  const TQ_TV = [Int8Array.from([0, 1, 2, 0, 2, 3]), Int8Array.from([4, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0]), Int8Array.from([4, 0, 1, 4, 1, 2, 4, 2, 0])];
  const TQ_TS = [Int8Array.from([0, 1, 0, 1, 2, 1, 2, 0, 4, 0, 2, 4, 2, 3, 2, 3, 0, 3]),
    Int8Array.from([4, 0, 4, 0, 1, 0, 1, 4, 5, 4, 1, 5, 1, 2, 1, 2, 4, 6, 4, 2, 6, 2, 3, 2, 3, 4, 7, 4, 3, 7, 3, 0, 3, 0, 4, 4]),
    Int8Array.from([4, 0, 3, 0, 1, 0, 1, 4, 4, 4, 1, 4, 1, 2, 1, 2, 4, 5, 4, 2, 5, 2, 0, 2, 0, 4, 3])];
  // P2 nodes per triangle (vertex 0, 1, 2, mid 01, mid 12, mid 20) as panel node ids; panel nodes per mode:
  // mode 0: 0-3 the (rotated) corners, 4-7 mid-points of edges 01 12 23 30, 8 mid-point of the diagonal 02;
  // mode 1: 0-3 corners, 4 vertex mean M, 5-8 edge mid-points, 9-12 mid-points of the spokes M0 M1 M2 M3;
  // mode 2: 0 v0, 1 v1, 2 tip point, 3 M, 4 mid v0v1, 5 mid v1-tip, 6 mid tip-v0, 7-9 mid-points of spokes M-v0 M-v1 M-tip.
  const TQ_TN = [Int8Array.from([0, 1, 2, 4, 5, 8, 0, 2, 3, 8, 6, 7]), Int8Array.from([4, 0, 1, 9, 5, 10, 4, 1, 2, 10, 6, 11, 4, 2, 3, 11, 7, 12, 4, 3, 0, 12, 8, 9]),
    Int8Array.from([3, 0, 1, 7, 4, 8, 3, 1, 2, 8, 5, 9, 3, 2, 0, 9, 6, 7])];
  const TQ_NP = [4, 5, 5], TQ_NS = [5, 8, 6], TQ_NT = [2, 4, 3], TQ_NN = [9, 13, 10];
  // panel data layout: [0,15) points (corners, M); [15,23) segment lengths; 23 mode; per triangle (52) from TQ_TRI:
  // valid, n (3), grad lambda_0..2 (9), per edge q (9): m (3), grad lambda_i . u_q (3), grad lambda_i . m_q (3), then
  // g_ij = grad lambda_i . grad lambda_j (00 11 22 01 12 20), node ids (6); node table from TQ_NODE (10 per node: slot
  // 0..8 of a unit node, or -1 followed by the nine slot weights); far moments (9 values x 10) from TQ_FAR; control-point
  // slot weights (9) from TQ_CPW.
  const TQ_TRI = 24, TQ_TRISZ = 52, TQ_NODE = TQ_TRI + 4 * TQ_TRISZ, TQ_FAR = TQ_NODE + 130, TQ_CPW = TQ_FAR + 90, TQ_STRIDE = TQ_CPW + 9;
  const TQR = new Float64Array(15), TQr = new Float64Array(5), TQL = new Float64Array(8), TQN = new Float64Array(13);
  const lag3 = (x, o) => { o[0] = (1 - x) * (1 - 2 * x); o[1] = 4 * x * (1 - x); o[2] = x * (2 * x - 1); return o; };
  // potential coefficients of the nine panel values at P (added to c9), source (returned, scalar sum over triangles)
  // and the source vector sum_t S_t n_t (TQSV), all per 4 pi.
  // Planar panels: the far-field expansion order is graded by distance (r / panel diameter; ff = the farField ratio):
  // exact inside 2/3 ff, fourth order (third- and fourth-order terms both) from 2/3 ff, second from ff, first from 4 ff
  // (default ff = 6: exact inside 4 diameters, fourth order to 6, second to 24, first beyond). Non-planar panels: inside
  // 4 ff diameters the planar graded expansion per triangle of the split (tbTriangleFar, triangleEval; the same zones in
  // the triangle's diameter), beyond it first order about the centroid.
  // Why these zones (0.3.2-exp.3 checkpoint 9; the earlier zones were exact inside 0.4 ff, fourth order to 2/3 ff,
  // second to 2 ff, measured only on the course wing 32 x 16): the far-field error of the ASSEMBLED solution grows with
  // spanwise refinement. Rectangular NACA 0012 AR 6, alpha 4, against the every-panel-exact assembly:
  //   mesh 32 x 48:        earlier zones dCL -6.2e-5, dCm +3.0e-6;  these zones dCL -4e-6, dCm +1.9e-7 (+15 % time)
  //   mesh 64 x 48 (rs 8): earlier zones dCL -8.5e-5, dCm +2.6e-6;  these zones dCL -6e-6, dCm +1.3e-7 (+19 % time)
  // (the earlier zones: Cm drifted by 1.6e-5 over the spanwise sequence 64 x 24 ... 64 x 96, every panel exact: no
  // drift). The exact-zone radius controls the Cm error, the second- and first-order zones the lift error.
  const TQSV = new Float64Array(3), TQ_FF2 = 1, TQ_FF4 = 4 / 9, TQ_FF1 = 16;
  function tensorQuadNear(D, o, px, py, pz, c9) {
    const mode = D[o + 23], ED = TQ_ED[mode], TV = TQ_TV[mode], TS = TQ_TS[mode], TN = TQ_TN[mode], nT = TQ_NT[mode], nN = TQ_NN[mode];
    let src = 0, svx = 0, svy = 0, svz = 0;
    for (let v = 0; v < 5; v++) {
      const x = px - D[o + 3 * v], y = py - D[o + 3 * v + 1], z = pz - D[o + 3 * v + 2];
      TQR[3 * v] = x; TQR[3 * v + 1] = y; TQR[3 * v + 2] = z; TQr[v] = sqrt(x * x + y * y + z * z);
    }
    for (let e = 0, ns = TQ_NS[mode]; e < ns; e++) {
      const d = D[o + 15 + e];
      if (!(d > 0)) { TQL[e] = 0; continue; }
      const a = ED[2 * e], b = ED[2 * e + 1], ra = TQr[a], rb = TQr[b];
      const ax = TQR[3 * a], ay = TQR[3 * a + 1], az = TQR[3 * a + 2], bx = TQR[3 * b], by = TQR[3 * b + 1], bz = TQR[3 * b + 2];
      const ab = ax * bx + ay * by + az * bz;
      let den;
      if (ab >= 0) den = ra + rb - d;
      else { const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; den = 2 * (cx * cx + cy * cy + cz * cz) / ((ra * rb - ab) * (ra + rb + d)); }
      TQL[e] = den > 0 ? logn((ra + rb + d) / den) : 0;
    }
    for (let q = 0; q < nN; q++) TQN[q] = 0;
    for (let t = 0; t < nT; t++) {
      const to = o + TQ_TRI + TQ_TRISZ * t;
      if (!D[to]) continue; // degenerate triangle
      const nx = D[to + 1], ny = D[to + 2], nz = D[to + 3], i0 = TV[3 * t], i1 = TV[3 * t + 1], i2 = TV[3 * t + 2];
      const x0 = TQR[3 * i0], y0 = TQR[3 * i0 + 1], z0 = TQR[3 * i0 + 2], x1 = TQR[3 * i1], y1 = TQR[3 * i1 + 1], z1 = TQR[3 * i1 + 2];
      const x2 = TQR[3 * i2], y2 = TQR[3 * i2 + 1], z2 = TQR[3 * i2 + 2], r0 = TQr[i0], r1 = TQr[i1], r2 = TQr[i2];
      const det = x0 * (y1 * z2 - z1 * y2) + y0 * (z1 * x2 - x1 * z2) + z0 * (x1 * y2 - y1 * x2);
      const den = r0 * r1 * r2 + (x0 * x1 + y0 * y1 + z0 * z1) * r2 + (x0 * x2 + y0 * y2 + z0 * z2) * r1 + (x1 * x2 + y1 * y2 + z1 * z2) * r0;
      const om = 2 * atan2(det, den), h = x0 * nx + y0 * ny + z0 * nz;
      // barycentric coordinates of the projection (grad lambda in-plane, so the normal offset drops out)
      const g0 = to + 4, l1 = D[g0 + 3] * x0 + D[g0 + 4] * y0 + D[g0 + 5] * z0, l2 = D[g0 + 6] * x0 + D[g0 + 7] * y0 + D[g0 + 8] * z0, l0 = 1 - l1 - l2;
      let p0 = 0, p1 = 0, p2 = 0, q00 = 0, q11 = 0, q22 = 0, q01 = 0, q12 = 0, q20 = 0, dL = 0;
      for (let q = 0; q < 3; q++) {
        const eo = to + 13 + 9 * q, ts = 9 * t + 3 * q, s = TS[ts], e = TS[ts + 1], L = TQL[TS[ts + 2]];
        const d = -(TQR[3 * s] * D[eo] + TQR[3 * s + 1] * D[eo + 1] + TQR[3 * s + 2] * D[eo + 2]), dr = TQr[e] - TQr[s], dl = d * L;
        const a0 = D[eo + 3], a1 = D[eo + 4], a2 = D[eo + 5], b0 = D[eo + 6], b1 = D[eo + 7], b2 = D[eo + 8], hr = 0.5 * dr;
        p0 -= b0 * L; p1 -= b1 * L; p2 -= b2 * L; dL += dl;
        q00 += dl * a0 * a0 - dr * a0 * b0; q11 += dl * a1 * a1 - dr * a1 * b1; q22 += dl * a2 * a2 - dr * a2 * b2;
        q01 += dl * a0 * a1 - hr * (a0 * b1 + b0 * a1); q12 += dl * a1 * a2 - hr * (a1 * b2 + b1 * a2); q20 += dl * a2 * a0 - hr * (a2 * b0 + b2 * a0);
      }
      const ho = h * om, gg = to + 40;
      q00 -= ho * D[gg]; q11 -= ho * D[gg + 1]; q22 -= ho * D[gg + 2]; q01 -= ho * D[gg + 3]; q12 -= ho * D[gg + 4]; q20 -= ho * D[gg + 5];
      const st = dL - ho; src += st; svx += st * nx; svy += st * ny; svz += st * nz;
      const nd = to + 46;
      TQN[D[nd]] += l0 * (2 * l0 - 1) * om + h * (4 * l0 - 1) * p0 + 2 * h * q00;
      TQN[D[nd + 1]] += l1 * (2 * l1 - 1) * om + h * (4 * l1 - 1) * p1 + 2 * h * q11;
      TQN[D[nd + 2]] += l2 * (2 * l2 - 1) * om + h * (4 * l2 - 1) * p2 + 2 * h * q22;
      TQN[D[nd + 3]] += 4 * (l0 * l1 * om + h * (l0 * p1 + l1 * p0) + h * q01);
      TQN[D[nd + 4]] += 4 * (l1 * l2 * om + h * (l1 * p2 + l2 * p1) + h * q12);
      TQN[D[nd + 5]] += 4 * (l2 * l0 * om + h * (l2 * p0 + l0 * p2) + h * q20);
    }
    for (let q = 0; q < nN; q++) {
      const v = TQN[q] * INV4PI, no = o + TQ_NODE + 10 * q, slot = D[no];
      if (slot >= 0) c9[slot] += v; else for (let s = 0; s < 9; s++) c9[s] += v * D[no + 1 + s];
    }
    TQSV[0] = svx * INV4PI; TQSV[1] = svy * INV4PI; TQSV[2] = svz * INV4PI;
    return src * INV4PI;
  }
  // Far field: the span-quadratic expansion (zeroth and first moments about the centroid) for the nine values.
  function tensorQuadFar(D, o, dx, dy, dz, r2, c9) {
    const ir3 = 1 / (r2 * sqrt(r2)), ir5 = ir3 / r2, xx = dx * dx, yy = dy * dy, zz = dz * dz, xy = dx * dy, xz = dx * dz, yz = dy * dz;
    let f = o + TQ_FAR;
    for (let q = 0; q < 9; q++, f += 10) c9[q] += (D[f] * dx + D[f + 1] * dy + D[f + 2] * dz - D[f + 3]) * ir3 + (D[f + 4] * xx + D[f + 5] * yy + D[f + 6] * zz + D[f + 7] * xy + D[f + 8] * xz + D[f + 9] * yz) * ir5;
  }
  // Tensor basis on surface S from a topology: { n (panels, all tensor), nValues, refs: Int32Array(9 n) unified value ids
  // per panel slot (a + 3 b: a chordwise node 0 / 1/2 / 1, b spanwise), spanChains (cells: panel ids, knots: MK ids),
  // stationChains (cells: MK ids, knots: KK ids), stripChains (cells: panel ids, knots: KM ids), tipMean: null or
  // { id, from: MK ids }, wake meta }. Chains as chainSystem (h, start / end).
  // Basis construction scratch (module level: the panel loop below allocates nothing per panel). Points PT: the five
  // panel points (corners in split order, then the vertex mean M); NP: node parameters (s, t); NW: node slot weights
  // (9 per node) and NU the unit slot (or -1); per triangle: TQV (the three vertices), TGL (grad lambda_0..2), TU / TM
  // edge directions; the moment accumulators MOM (12 per slot), MM2 (9 per slot), MI2 (9).
  const TBC = new Float64Array(12), TBM = new Float64Array(3), TBX = new Float64Array(3), TBPT = new Float64Array(15), TBNP = new Float64Array(26), TBNW = new Float64Array(117), TBNU = new Int32Array(13);
  const TBQ = new Float64Array(9), TBN = new Float64Array(3), TBNN = new Float64Array(3), TBGL = new Float64Array(9), TBU = new Float64Array(3), TBMV = new Float64Array(3), TBTN = new Int32Array(6);
  const TBAR = new Float64Array(4), TBM3 = new Float64Array(81), TBI3 = new Float64Array(9), TBMOM = new Float64Array(108), TBM2 = new Float64Array(81), TBI2 = new Float64Array(9), TBCPW = new Float64Array(9), TBPH = new Float64Array(6), TBNB = new Float64Array(3), TBL = new Float64Array(3), TBMM = new Float64Array(3), TBF = new Float64Array(3);
  const TB_GP = Float64Array.from([1 / 3, 1 / 3, 1 / 3, 0.225, 0.059715871789770, 0.470142064105115, 0.470142064105115, 0.132394152788506, 0.470142064105115, 0.059715871789770, 0.470142064105115, 0.132394152788506,
    0.470142064105115, 0.470142064105115, 0.059715871789770, 0.132394152788506, 0.797426985353087, 0.101286507323456, 0.101286507323456, 0.125939180544827, 0.101286507323456, 0.797426985353087, 0.101286507323456, 0.125939180544827,
    0.101286507323456, 0.101286507323456, 0.797426985353087, 0.125939180544827]);
  // Dunavant's 12-point degree-6 rule (exact for the fourth moments of the quadratic shape functions)
  const TB_GP6 = (() => { const out = [], add = (a, b, c, w) => out.push(a, b, c, w);
    for (const [a, b, w] of [[0.501426509658179, 0.249286745170910, 0.116786275726379], [0.873821971016996, 0.063089014491502, 0.050844906370207]]) { add(a, b, b, w); add(b, a, b, w); add(b, b, a, w); }
    const [a, b, c, w] = [0.053145049844817, 0.310352451033784, 0.636502499121399, 0.082851075618374];
    add(a, b, c, w); add(a, c, b, w); add(b, a, c, w); add(b, c, a, w); add(c, a, b, w); add(c, b, a, w);
    return Float64Array.from(out); })();
  const TB_PRM = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1]), GPW = new Float64Array(9), GPX = new Float64Array(3), GPP = new Float64Array(6);
  // Gauss-Newton on the bilinear map of the corners in TBC (least squares on a warped panel): parameters of the point
  // (x, y, z) from (s, t), stored at NP[2 q], NP[2 q + 1].
  function tbPreimage(x, y, z, s, t, q) {
    const c = TBC;
    for (let it = 0; it < 30; it++) {
      let a11 = 0, a12 = 0, a22 = 0, r1 = 0, r2 = 0;
      for (let i = 0; i < 3; i++) {
        const X = i === 0 ? x : i === 1 ? y : z, c0 = c[i], c1 = c[3 + i], c2 = c[6 + i], c3 = c[9 + i];
        const B = (1 - s) * (1 - t) * c0 + s * (1 - t) * c1 + s * t * c2 + (1 - s) * t * c3 - X, bs = (1 - t) * (c1 - c0) + t * (c2 - c3), bt = (1 - s) * (c3 - c0) + s * (c2 - c1);
        a11 += bs * bs; a12 += bs * bt; a22 += bt * bt; r1 += bs * B; r2 += bt * B;
      }
      const dt = a11 * a22 - a12 * a12;
      if (!(dt > 0)) break;
      const ds = (a22 * r1 - a12 * r2) / dt, dtt = (a11 * r2 - a12 * r1) / dt; s -= ds; t -= dtt;
      if (absv(ds) + absv(dtt) < 1e-14) break;
    }
    TBNP[2 * q] = s; TBNP[2 * q + 1] = t;
  }
  // pre-image of the mid-point of points a and b of TBPT (indices), started at (s, t)
  function tbPreimageMid(a, b, s, t, q) { const P = TBPT; tbPreimage(0.5 * (P[3 * a] + P[3 * b]), 0.5 * (P[3 * a + 1] + P[3 * b + 1]), 0.5 * (P[3 * a + 2] + P[3 * b + 2]), s, t, q); }
  // node q at parameters (s, t): slot weights (biquadratic Lagrange) and unit slot
  const TBLA = new Float64Array(3), TBLB = new Float64Array(3);
  function tbNodeWeights(q) {
    lag3(TBNP[2 * q], TBLA); lag3(TBNP[2 * q + 1], TBLB);
    const w = 9 * q;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) TBNW[w + a + 3 * b] = TBLA[a] * TBLB[b];
    let unit = -1;
    for (let a = 0; a < 9; a++) {
      if (!(absv(TBNW[w + a] - 1) < 1e-13)) continue;
      let others = true; for (let b = 0; b < 9; b++) if (b !== a && !(absv(TBNW[w + b]) < 1e-13)) { others = false; break; }
      if (others) unit = a;
    }
    TBNU[q] = unit;
  }
  function tbSetNode(q, s, t) { TBNP[2 * q] = s; TBNP[2 * q + 1] = t; }
  function tbPmid(q, a, b) { TBNP[2 * q] = 0.5 * (TBNP[2 * a] + TBNP[2 * b]); TBNP[2 * q + 1] = 0.5 * (TBNP[2 * a + 1] + TBNP[2 * b + 1]); }
  // Far field of a NON-PLANAR panel, per triangle. Each triangle of the panel's split is planar, so it gets the planar
  // expansion of the panel's P2 shape functions restricted to it, about its own centroid in its own frame (normal n,
  // in-plane axes l, m), with the planar panels' graded zones measured in its own diameter. The moments are exact (the
  // degree-6 rule integrates quadratic x quartic exactly); no planar approximation of the warped panel is made. Store:
  // per far triangle j the centroid (TC, 3), frame (TN, 9: n, l, m), diameter (TD), area moments (TI, 13: area, I2 ll / mm
  // / lm, nine third and fourth moments) and the weights grouped by order (TW1 27, TW2 27, TW4 81; carrier-major, nine
  // slots per carrier, as farW1 / farW2 / farW4); per panel the first triangle (base) and the count (cnt, 0 = planar).
  function tbTriStore(n) {
    const cap = Math.max(16, 2 * n);
    return { n, count: 0, cap, base: new Int32Array(n), cnt: new Uint8Array(n), TC: new Float64Array(3 * cap), TN: new Float64Array(9 * cap), TD: new Float64Array(cap),
      TI: new Float64Array(13 * cap), TW1: new Float64Array(27 * cap), TW2: new Float64Array(27 * cap), TW4: new Float64Array(81 * cap) };
  }
  function tbTriAlloc(T) {
    if (T.count === T.cap) {
      const cap = 2 * T.cap, grow = (a, w) => { const b = new Float64Array(w * cap); b.set(a); return b; };
      T.TC = grow(T.TC, 3); T.TN = grow(T.TN, 9); T.TD = grow(T.TD, 1); T.TI = grow(T.TI, 13); T.TW1 = grow(T.TW1, 27); T.TW2 = grow(T.TW2, 27); T.TW4 = grow(T.TW4, 81); T.cap = cap;
    }
    return T.count++;
  }
  const TBTM = new Float64Array(9 * 15), TBTI = new Float64Array(13);
  function tbTriangleFar(S, k, o, mode, D, T) {
    const PT = TBPT, TV = TQ_TV[mode], hyp = Math.hypot;
    T.base[k] = T.count;
    for (let t = 0; t < TQ_NT[mode]; t++) {
      const to = o + TQ_TRI + TQ_TRISZ * t, area = TBAR[t];
      if (!D[to]) continue;
      const j = tbTriAlloc(T), i0 = 3 * TV[3 * t], i1 = 3 * TV[3 * t + 1], i2 = 3 * TV[3 * t + 2];
      const cx = (PT[i0] + PT[i1] + PT[i2]) / 3, cy = (PT[i0 + 1] + PT[i1 + 1] + PT[i2 + 1]) / 3, cz = (PT[i0 + 2] + PT[i1 + 2] + PT[i2 + 2]) / 3;
      const d01 = hyp(PT[i1] - PT[i0], PT[i1 + 1] - PT[i0 + 1], PT[i1 + 2] - PT[i0 + 2]), d12 = hyp(PT[i2] - PT[i1], PT[i2 + 1] - PT[i1 + 1], PT[i2 + 2] - PT[i1 + 2]), d20 = hyp(PT[i0] - PT[i2], PT[i0 + 1] - PT[i2 + 1], PT[i0 + 2] - PT[i2 + 2]);
      const nx = D[to + 1], ny = D[to + 2], nz = D[to + 3];
      // in-plane axis l: the panel's axis projected on the triangle's plane (else its first edge), m = n x l
      let lx = S.PL[3 * k], ly = S.PL[3 * k + 1], lz = S.PL[3 * k + 2], ln = lx * nx + ly * ny + lz * nz;
      lx -= ln * nx; ly -= ln * ny; lz -= ln * nz;
      let ll = hyp(lx, ly, lz);
      if (!(ll > 1e-6)) { lx = PT[i1] - PT[i0]; ly = PT[i1 + 1] - PT[i0 + 1]; lz = PT[i1 + 2] - PT[i0 + 2]; ll = hyp(lx, ly, lz); }
      lx /= ll; ly /= ll; lz /= ll;
      const mx = ny * lz - nz * ly, my = nz * lx - nx * lz, mz = nx * ly - ny * lx;
      T.TC[3 * j] = cx; T.TC[3 * j + 1] = cy; T.TC[3 * j + 2] = cz; T.TD[j] = Math.max(d01, d12, d20);
      const N = T.TN; N[9 * j] = nx; N[9 * j + 1] = ny; N[9 * j + 2] = nz; N[9 * j + 3] = lx; N[9 * j + 4] = ly; N[9 * j + 5] = lz; N[9 * j + 6] = mx; N[9 * j + 7] = my; N[9 * j + 8] = mz;
      // moments of the nine slots (per slot: w0, Fl, Fm, Mll, Mmm, Mlm, then the nine third / fourth in-plane moments)
      const M = TBTM, I = TBTI; M.fill(0); I.fill(0);
      const n0 = 9 * D[to + 46], n1 = 9 * D[to + 47], n2 = 9 * D[to + 48], n3 = 9 * D[to + 49], n4 = 9 * D[to + 50], n5 = 9 * D[to + 51];
      for (let g = 0; g < 12; g++) {
        const l0 = TB_GP6[4 * g], l1 = TB_GP6[4 * g + 1], l2 = TB_GP6[4 * g + 2], wa = TB_GP6[4 * g + 3] * area;
        const ex = l0 * PT[i0] + l1 * PT[i1] + l2 * PT[i2] - cx, ey = l0 * PT[i0 + 1] + l1 * PT[i1 + 1] + l2 * PT[i2 + 1] - cy, ez = l0 * PT[i0 + 2] + l1 * PT[i1 + 2] + l2 * PT[i2 + 2] - cz;
        const xi = ex * lx + ey * ly + ez * lz, eta = ex * mx + ey * my + ez * mz, x2 = xi * xi, y2 = eta * eta, xy = xi * eta;
        const x3 = x2 * xi, x2y = x2 * eta, xy2 = xi * y2, y3 = y2 * eta, x4 = x3 * xi, x3y = x3 * eta, x2y2 = x2y * eta, xy3 = xy2 * eta, y4 = y3 * eta;
        const p0 = l0 * (2 * l0 - 1), p1 = l1 * (2 * l1 - 1), p2 = l2 * (2 * l2 - 1), p3 = 4 * l0 * l1, p4 = 4 * l1 * l2, p5 = 4 * l2 * l0;
        for (let s = 0; s < 9; s++) {
          const wq = wa * (p0 * TBNW[n0 + s] + p1 * TBNW[n1 + s] + p2 * TBNW[n2 + s] + p3 * TBNW[n3 + s] + p4 * TBNW[n4 + s] + p5 * TBNW[n5 + s]), m = 15 * s;
          M[m] += wq; M[m + 1] += wq * xi; M[m + 2] += wq * eta; M[m + 3] += wq * x2; M[m + 4] += wq * y2; M[m + 5] += wq * xy;
          M[m + 6] += wq * x3; M[m + 7] += wq * x2y; M[m + 8] += wq * xy2; M[m + 9] += wq * y3; M[m + 10] += wq * x4; M[m + 11] += wq * x3y; M[m + 12] += wq * x2y2; M[m + 13] += wq * xy3; M[m + 14] += wq * y4;
        }
        I[1] += wa * x2; I[2] += wa * y2; I[3] += wa * xy; I[4] += wa * x3; I[5] += wa * x2y; I[6] += wa * xy2; I[7] += wa * y3; I[8] += wa * x4; I[9] += wa * x3y; I[10] += wa * x2y2; I[11] += wa * xy3; I[12] += wa * y4;
      }
      I[0] = area;
      for (let c = 0; c < 13; c++) T.TI[13 * j + c] = I[c];
      for (let s = 0; s < 9; s++) {
        const m = 15 * s;
        for (let c = 0; c < 3; c++) T.TW1[27 * j + 9 * c + s] = M[m + c] * INV4PI;
        for (let c = 0; c < 3; c++) T.TW2[27 * j + 9 * c + s] = M[m + 3 + c] * INV4PI;
        for (let c = 0; c < 9; c++) T.TW4[81 * j + 9 * c + s] = M[m + 6 + c] * INV4PI;
      }
    }
    T.cnt[k] = T.count - T.base[k];
  }
  // basis helpers (module level, so the per-panel construction allocates no closures)
  function tbCornerDist(a, b) { const C9 = TBC; return Math.hypot(C9[3 * a] - C9[3 * b], C9[3 * a + 1] - C9[3 * b + 1], C9[3 * a + 2] - C9[3 * b + 2]); }
  function tbGradDot(i, j) { const GL = TBGL; return GL[3 * i] * GL[3 * j] + GL[3 * i + 1] * GL[3 * j + 1] + GL[3 * i + 2] * GL[3 * j + 2]; }
  function tbQuadForm(M, mo, u, w) { let t = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) t += u[a] * M[mo + 3 * a + b] * w[b]; return t; }
  // Split rule exception: split[k] = 0 the rule of tbPanel (shorter diagonal / fan on a tie / fan of three on a collapsed
  // edge), 1 the OTHER diagonal, 2 the fan of four about the vertex mean. Where the closed trailing edge, or the
  // leading-edge line, meets the closed tip edge, the upper and lower corner panels of the last strip share three of
  // their four corners; the shorter-diagonal rule can give both the same triangle with opposite orientation: a
  // double-covered triangle of zero thickness (its vertices agree to round-off) that bounds no volume (the solid-angle
  // indicator of the surface is 0 on both sides of it, not -1 inside) and on which both panels' control points lie, under
  // two opposite doublet sheets. Both panels then take the other diagonal, which splits the corner wedge along its two
  // distinct inner corners; a coincidence that remained (none on the app's meshes) would give both panels the fan of four
  // about the vertex mean (no diagonal at all). Coincident: every vertex of one triangle within 1e-6 of the smaller of the
  // two panel diameters of a vertex of the other. Candidates by centroid x (sorted sweep).
  function tbSplitRule(S) {
    const n = S.count, V = S.PV, PD = S.PD, split = new Uint8Array(n), hyp = Math.hypot;
    let dMax = 0; for (let k = 0; k < n; k++) dMax = Math.max(dMax, PD[k]);
    const tolMax = 1e-6 * dMax;
    const coincident = () => {
      const own = [], X = [];
      for (let k = 0; k < n; k++) {
        if (split[k] === 2) continue;
        const o = 12 * k, cd = (a, b) => hyp(V[o + 3 * a] - V[o + 3 * b], V[o + 3 * a + 1] - V[o + 3 * b + 1], V[o + 3 * a + 2] - V[o + 3 * b + 2]);
        if (cd(2, 3) <= 1e-9 * PD[k]) continue; // mode 2
        const d02 = cd(2, 0), d13 = cd(3, 1); if (absv(d02 - d13) <= 1e-9 * Math.max(d02, d13)) continue; // mode 1
        const rot = (d13 < d02) !== (split[k] === 1) ? 1 : 0;
        for (let t = 0; t < 2; t++) { own.push(k); for (const q of t ? [0, 2, 3] : [0, 1, 2]) { const b = o + 3 * ((q + rot) % 4); X.push(V[b], V[b + 1], V[b + 2]); } }
      }
      const m = own.length, cx = new Float64Array(m), cy = new Float64Array(m), cz = new Float64Array(m), order = new Uint32Array(m), hit = new Set();
      for (let t = 0; t < m; t++) { const b = 9 * t; cx[t] = (X[b] + X[b + 3] + X[b + 6]) / 3; cy[t] = (X[b + 1] + X[b + 4] + X[b + 7]) / 3; cz[t] = (X[b + 2] + X[b + 5] + X[b + 8]) / 3; order[t] = t; }
      order.sort((a, b) => cx[a] - cx[b]);
      for (let a = 0; a < m; a++) {
        const p = order[a];
        for (let c = a + 1; c < m; c++) {
          const q = order[c]; if (cx[q] - cx[p] > tolMax) break;
          if (own[p] === own[q] || absv(cy[q] - cy[p]) > tolMax || absv(cz[q] - cz[p]) > tolMax) continue;
          const tol = 1e-6 * Math.min(PD[own[p]], PD[own[q]]);
          let all = true;
          for (let i = 0; i < 3 && all; i++) {
            let any = false; const u = 9 * p + 3 * i;
            for (let j = 0; j < 3 && !any; j++) { const w = 9 * q + 3 * j; any = hyp(X[u] - X[w], X[u + 1] - X[w + 1], X[u + 2] - X[w + 2]) <= tol; }
            all = any;
          }
          if (all) { hit.add(own[p]); hit.add(own[q]); }
        }
      }
      return hit;
    };
    const first = coincident(); for (const k of first) split[k] = 1;
    if (first.size) for (const k of coincident()) split[k] = 2;
    return split;
  }
  // One tensor panel's data (D at TQ_STRIDE k), its self source vector, fan normal and area, planarity flag and far-field
  // weights (the body of tensorQuadBasis's panel loop, as its own function so that it is compiled on its own).
  function tbPanel(S, k, D, selfSourceVec, fanVec, fanArea, planar, farN, farW, farI, farK, c9, T, split) {
    const hyp = Math.hypot, V = S.PV, PT = TBPT, C9 = TBC;
    const o = TQ_STRIDE * k, v = 12 * k;
    for (let q = 0; q < 12; q++) C9[q] = V[v + q];
    for (let i = 0; i < 3; i++) TBM[i] = 0.25 * (C9[i] + C9[3 + i] + C9[6 + i] + C9[9 + i]);
    const sc = S.PD[k], cl = tbCornerDist;
    const collapsed = cl(2, 3) <= 1e-9 * sc;
    if (cl(1, 0) <= 1e-9 * sc || cl(2, 1) <= 1e-9 * sc || cl(0, 3) <= 1e-9 * sc) throw new Error(`Tensor panel ${k}: only the v2 v3 edge may collapse (closed tip).`);
    const d02 = cl(2, 0), d13 = cl(3, 1), tie = absv(d02 - d13) <= 1e-9 * Math.max(d02, d13);
    // a tie uses the fan of four even on a planar panel: unlike a constant or span-quadratic doublet, the P2 doublet
    // depends on the diagonal, and a fixed diagonal is not invariant under the upper / lower mirror relabelling;
    // split[k] (tbSplitRule): 1 the other diagonal, 2 the fan of four (closed corners of the last strip)
    const sp = split[k], mode = collapsed ? 2 : tie || sp === 2 ? 1 : 0, rot = mode === 0 && (d13 < d02) !== (sp === 1) ? 1 : 0;
    // points and node parameters (exact pre-images except interior mid-points: Gauss-Newton)
    for (let q = 0; q < 4; q++) { const cq = mode === 0 ? (q + rot) % 4 : q; for (let i = 0; i < 3; i++) PT[3 * q + i] = C9[3 * cq + i]; }
    for (let i = 0; i < 3; i++) PT[12 + i] = TBM[i];
    let nN;
    if (mode === 0) {
      for (let q = 0; q < 4; q++) { const pq = (q + rot) % 4; tbSetNode(q, TB_PRM[2 * pq], TB_PRM[2 * pq + 1]); }
      tbPmid(4, 0, 1); tbPmid(5, 1, 2); tbPmid(6, 2, 3); tbPmid(7, 3, 0); tbPreimageMid(0, 2, 0.5, 0.5, 8); nN = 9;
    } else if (mode === 1) {
      for (let q = 0; q < 4; q++) tbSetNode(q, TB_PRM[2 * q], TB_PRM[2 * q + 1]);
      tbSetNode(4, 0.5, 0.5); tbPmid(5, 0, 1); tbPmid(6, 1, 2); tbPmid(7, 2, 3); tbPmid(8, 3, 0);
      for (let q = 0; q < 4; q++) tbPreimageMid(4, q, 0.5 * (0.5 + TB_PRM[2 * q]), 0.5 * (0.5 + TB_PRM[2 * q + 1]), 9 + q);
      nN = 13;
    } else {
      tbSetNode(0, 0, 0); tbSetNode(1, 1, 0); tbSetNode(2, 0.5, 1); tbSetNode(3, 0.5, 0.5); tbSetNode(4, 0.5, 0); tbSetNode(5, 1, 0.5); tbSetNode(6, 0, 0.5);
      tbPreimageMid(4, 0, 0.25, 0.25, 7); tbPreimageMid(4, 1, 0.75, 0.25, 8); tbPreimageMid(4, 2, 0.5, 0.75, 9); nN = 10;
    }
    D[o + 23] = mode;
    for (let q = 0; q < 15; q++) D[o + q] = PT[q];
    const ED = TQ_ED[mode], TV = TQ_TV[mode], TS = TQ_TS[mode], TN = TQ_TN[mode];
    for (let e = 0; e < TQ_NS[mode]; e++) { const a = 3 * ED[2 * e], b = 3 * ED[2 * e + 1]; D[o + 15 + e] = hyp(PT[b] - PT[a], PT[b + 1] - PT[a + 1], PT[b + 2] - PT[a + 2]); }
    for (let q = 0; q < nN; q++) tbNodeWeights(q);
    if (mode === 2) { tbSetNode(2, 0.5, 1); tbNodeWeights(2); TBNU[2] = 7; } // the tip point: slots 6, 7, 8 all refer to T
    for (let q = 0; q < nN; q++) { const no = o + TQ_NODE + 10 * q, u = TBNU[q]; D[no] = u; for (let s = 0; s < 9; s++) D[no + 1 + s] = u >= 0 ? 0 : TBNW[9 * q + s]; }
    const C0 = S.PC[3 * k], C1 = S.PC[3 * k + 1], C2 = S.PC[3 * k + 2], mom = TBMOM, m2 = TBM2, I2 = TBI2;
    mom.fill(0); m2.fill(0); I2.fill(0);
    let best = -Infinity, haveCp = false;
    for (let t = 0; t < 4; t++) TBAR[t] = 0;
    for (let t = 0; t < TQ_NT[mode]; t++) {
      const Q = TBQ, to = o + TQ_TRI + TQ_TRISZ * t;
      for (let i = 0; i < 3; i++) { const p = 3 * TV[3 * t + i]; Q[3 * i] = PT[p]; Q[3 * i + 1] = PT[p + 1]; Q[3 * i + 2] = PT[p + 2]; }
      const e1x = Q[3] - Q[0], e1y = Q[4] - Q[1], e1z = Q[5] - Q[2], e2x = Q[6] - Q[0], e2y = Q[7] - Q[1], e2z = Q[8] - Q[2];
      const Nx = e1y * e2z - e1z * e2y, Ny = e1z * e2x - e1x * e2z, Nz = e1x * e2y - e1y * e2x, twoA = hyp(Nx, Ny, Nz);
      if (!(twoA > 1e-14 * S.PD[k] * S.PD[k])) { D[to] = 0; continue; }
      D[to] = 1;
      const nx = Nx / twoA, ny = Ny / twoA, nz = Nz / twoA, area = 0.5 * twoA;
      TBAR[t] = area; fanArea[k] += area; fanVec[3 * k] += area * nx; fanVec[3 * k + 1] += area * ny; fanVec[3 * k + 2] += area * nz;
      D[to + 1] = nx; D[to + 2] = ny; D[to + 3] = nz;
      // grad lambda_i = n x (Q_i+2 - Q_i+1) / 2A (in-plane, pointing towards vertex i)
      const GL = TBGL;
      for (let i = 0; i < 3; i++) {
        const a = 3 * ((i + 2) % 3), b = 3 * ((i + 1) % 3), dx = Q[a] - Q[b], dy = Q[a + 1] - Q[b + 1], dz = Q[a + 2] - Q[b + 2];
        GL[3 * i] = (ny * dz - nz * dy) / twoA; GL[3 * i + 1] = (nz * dx - nx * dz) / twoA; GL[3 * i + 2] = (nx * dy - ny * dx) / twoA;
      }
      for (let q = 0; q < 9; q++) D[to + 4 + q] = GL[q];
      for (let q = 0; q < 3; q++) {
        const ts = 9 * t + 3 * q, a = 3 * TS[ts], b = 3 * TS[ts + 1], eo = to + 13 + 9 * q;
        const sx = PT[b] - PT[a], sy = PT[b + 1] - PT[a + 1], sz = PT[b + 2] - PT[a + 2], dl = hyp(sx, sy, sz);
        const ux = dl > 0 ? sx / dl : 0, uy = dl > 0 ? sy / dl : 0, uz = dl > 0 ? sz / dl : 0;
        const mx = uy * nz - uz * ny, my = uz * nx - ux * nz, mz = ux * ny - uy * nx;
        D[eo] = mx; D[eo + 1] = my; D[eo + 2] = mz;
        for (let i = 0; i < 3; i++) { D[eo + 3 + i] = GL[3 * i] * ux + GL[3 * i + 1] * uy + GL[3 * i + 2] * uz; D[eo + 6 + i] = GL[3 * i] * mx + GL[3 * i + 1] * my + GL[3 * i + 2] * mz; }
      }
      const gg = to + 40, dg = tbGradDot;
      D[gg] = dg(0, 0); D[gg + 1] = dg(1, 1); D[gg + 2] = dg(2, 2); D[gg + 3] = dg(0, 1); D[gg + 4] = dg(1, 2); D[gg + 5] = dg(2, 0);
      for (let q = 0; q < 6; q++) { TBTN[q] = TN[6 * t + q]; D[to + 46 + q] = TBTN[q]; }
      const ws = GPW, dX = GPX, ph = GPP;
      for (let g = 0; g < 7; g++) { // far-field moments, degree-5 rule (exact for quadratic x linear); no allocation
        const l0 = TB_GP[4 * g], l1 = TB_GP[4 * g + 1], l2 = TB_GP[4 * g + 2], w = TB_GP[4 * g + 3];
        dX[0] = l0 * Q[0] + l1 * Q[3] + l2 * Q[6] - C0; dX[1] = l0 * Q[1] + l1 * Q[4] + l2 * Q[7] - C1; dX[2] = l0 * Q[2] + l1 * Q[5] + l2 * Q[8] - C2;
        ph[0] = l0 * (2 * l0 - 1); ph[1] = l1 * (2 * l1 - 1); ph[2] = l2 * (2 * l2 - 1); ph[3] = 4 * l0 * l1; ph[4] = 4 * l1 * l2; ph[5] = 4 * l2 * l0;
        ws.fill(0); for (let q = 0; q < 6; q++) { const nw = 9 * TBTN[q], f = ph[q]; for (let s2 = 0; s2 < 9; s2++) ws[s2] += f * TBNW[nw + s2]; }
        for (let s2 = 0; s2 < 9; s2++) {
          const wq = w * area * ws[s2], fa = 12 * s2, fm = 9 * s2;
          mom[fa] += wq * nx; mom[fa + 1] += wq * ny; mom[fa + 2] += wq * nz;
          for (let a = 0; a < 3; a++) { const wn = wq * (a === 0 ? nx : a === 1 ? ny : nz), wd = wq * dX[a]; for (let b = 0; b < 3; b++) { mom[fa + 3 + 3 * a + b] += wn * dX[b]; m2[fm + 3 * a + b] += wd * dX[b]; } }
        }
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) I2[3 * a + b] += w * area * dX[a] * dX[b];
      }
      // the control point: the triangle that contains its projection best
      const cx = C0 - Q[0], cy = C1 - Q[1], cz = C2 - Q[2];
      const l1 = GL[3] * cx + GL[4] * cy + GL[5] * cz, l2 = GL[6] * cx + GL[7] * cy + GL[8] * cz, l0 = 1 - l1 - l2, inside = Math.min(l0, l1, l2);
      if (inside > best) {
        best = inside; haveCp = true;
        ph[0] = l0 * (2 * l0 - 1); ph[1] = l1 * (2 * l1 - 1); ph[2] = l2 * (2 * l2 - 1); ph[3] = 4 * l0 * l1; ph[4] = 4 * l1 * l2; ph[5] = 4 * l2 * l0;
        TBCPW.fill(0); for (let q = 0; q < 6; q++) { const nw = 9 * TBTN[q]; for (let s2 = 0; s2 < 9; s2++) TBCPW[s2] += ph[q] * TBNW[nw + s2]; }
      }
    }
    for (let s = 0; s < 9; s++) { // pack (see spanQuadFar)
      const f = o + TQ_FAR + 10 * s, a = 12 * s, b = a + 3;
      D[f] = mom[a] * INV4PI; D[f + 1] = mom[a + 1] * INV4PI; D[f + 2] = mom[a + 2] * INV4PI; D[f + 3] = (mom[b] + mom[b + 4] + mom[b + 8]) * INV4PI;
      D[f + 4] = 3 * mom[b] * INV4PI; D[f + 5] = 3 * mom[b + 4] * INV4PI; D[f + 6] = 3 * mom[b + 8] * INV4PI;
      D[f + 7] = 3 * (mom[b + 1] + mom[b + 3]) * INV4PI; D[f + 8] = 3 * (mom[b + 2] + mom[b + 6]) * INV4PI; D[f + 9] = 3 * (mom[b + 5] + mom[b + 7]) * INV4PI;
    }
    if (best < -1e-6 || !haveCp) throw new Error(`Tensor panel ${k}: the control point lies outside the panel's triangles.`);
    { // planar panel (every triangle normal within 1e-9 of the mean) -> carrier far field
      const A = hyp(fanVec[3 * k], fanVec[3 * k + 1], fanVec[3 * k + 2]), nb = TBNB; for (let i = 0; i < 3; i++) nb[i] = fanVec[3 * k + i] / A;
      let dev = 0; for (let t = 0; t < TQ_NT[mode]; t++) { const to = o + TQ_TRI + TQ_TRISZ * t; if (D[to]) dev = Math.max(dev, hyp(D[to + 1] - nb[0], D[to + 2] - nb[1], D[to + 3] - nb[2])); }
      const off = (C0 - PT[0]) * nb[0] + (C1 - PT[1]) * nb[1] + (C2 - PT[2]) * nb[2];
      if (dev <= 1e-9 && absv(off) <= 1e-9 * S.PD[k]) {
        planar[k] = 1;
        const l = TBL, mm = TBMM, F = TBF;
        for (let i = 0; i < 3; i++) l[i] = S.PL[3 * k + i];
        const ln = l[0] * nb[0] + l[1] * nb[1] + l[2] * nb[2];
        for (let i = 0; i < 3; i++) l[i] = l[i] - nb[i] * ln;
        const ll = hyp(l[0], l[1], l[2]); for (let i = 0; i < 3; i++) l[i] = l[i] / ll;
        mm[0] = nb[1] * l[2] - nb[2] * l[1]; mm[1] = nb[2] * l[0] - nb[0] * l[2]; mm[2] = nb[0] * l[1] - nb[1] * l[0];
        for (let i = 0; i < 3; i++) { farN[9 * k + i] = nb[i]; farN[9 * k + 3 + i] = l[i]; farN[9 * k + 6 + i] = mm[i]; }
        const q2 = tbQuadForm;
        // in-plane third and fourth moments: a second pass with the degree-6 rule (exact: quadratic x quartic)
        const m3 = TBM3, I3 = TBI3; m3.fill(0); I3.fill(0);
        for (let t = 0; t < TQ_NT[mode]; t++) {
          const to = o + TQ_TRI + TQ_TRISZ * t, area = TBAR[t];
          if (!D[to]) continue;
          const i0 = 3 * TV[3 * t], i1 = 3 * TV[3 * t + 1], i2 = 3 * TV[3 * t + 2];
          for (let g = 0; g < 12; g++) {
            const l0 = TB_GP6[4 * g], l1 = TB_GP6[4 * g + 1], l2 = TB_GP6[4 * g + 2], w = TB_GP6[4 * g + 3];
            const ex = l0 * PT[i0] + l1 * PT[i1] + l2 * PT[i2] - C0, ey = l0 * PT[i0 + 1] + l1 * PT[i1 + 1] + l2 * PT[i2 + 1] - C1, ez = l0 * PT[i0 + 2] + l1 * PT[i1 + 2] + l2 * PT[i2 + 2] - C2;
            const xi = ex * l[0] + ey * l[1] + ez * l[2], eta = ex * mm[0] + ey * mm[1] + ez * mm[2], x3 = xi * xi * xi, x2y = xi * xi * eta, xy2 = xi * eta * eta, y3 = eta * eta * eta;
            const x4 = x3 * xi, x3y = x3 * eta, x2y2 = x2y * eta, xy3 = xy2 * eta, y4 = y3 * eta;
            const p0 = l0 * (2 * l0 - 1), p1 = l1 * (2 * l1 - 1), p2 = l2 * (2 * l2 - 1), p3 = 4 * l0 * l1, p4 = 4 * l1 * l2, p5 = 4 * l2 * l0, wa = w * area;
            const n0 = 9 * D[to + 46], n1 = 9 * D[to + 47], n2 = 9 * D[to + 48], n3 = 9 * D[to + 49], n4 = 9 * D[to + 50], n5 = 9 * D[to + 51];
            for (let s2 = 0; s2 < 9; s2++) {
              const wq = wa * (p0 * TBNW[n0 + s2] + p1 * TBNW[n1 + s2] + p2 * TBNW[n2 + s2] + p3 * TBNW[n3 + s2] + p4 * TBNW[n4 + s2] + p5 * TBNW[n5 + s2]);
              const m = 9 * s2; m3[m] += wq * x3; m3[m + 1] += wq * x2y; m3[m + 2] += wq * xy2; m3[m + 3] += wq * y3;
              m3[m + 4] += wq * x4; m3[m + 5] += wq * x3y; m3[m + 6] += wq * x2y2; m3[m + 7] += wq * xy3; m3[m + 8] += wq * y4;
            }
            I3[0] += wa * x3; I3[1] += wa * x2y; I3[2] += wa * xy2; I3[3] += wa * y3; I3[4] += wa * x4; I3[5] += wa * x3y; I3[6] += wa * x2y2; I3[7] += wa * xy3; I3[8] += wa * y4;
          }
        }
        for (let s = 0; s < 9; s++) {
          const a = 12 * s, b = a + 3, w = 135 * k + s;
          for (let c = 0; c < 3; c++) F[c] = nb[0] * mom[b + c] + nb[1] * mom[b + 3 + c] + nb[2] * mom[b + 6 + c];
          farW[w] = (mom[a] * nb[0] + mom[a + 1] * nb[1] + mom[a + 2] * nb[2]) * INV4PI; farW[w + 9] = (F[0] * l[0] + F[1] * l[1] + F[2] * l[2]) * INV4PI; farW[w + 18] = (F[0] * mm[0] + F[1] * mm[1] + F[2] * mm[2]) * INV4PI;
          farW[w + 27] = q2(m2, 9 * s, l, l) * INV4PI; farW[w + 36] = q2(m2, 9 * s, mm, mm) * INV4PI; farW[w + 45] = q2(m2, 9 * s, l, mm) * INV4PI;
          for (let c = 0; c < 9; c++) farW[w + 54 + 9 * c] = m3[9 * s + c] * INV4PI;
        }
        farI[13 * k] = fanArea[k]; farI[13 * k + 1] = q2(I2, 0, l, l); farI[13 * k + 2] = q2(I2, 0, mm, mm); farI[13 * k + 3] = q2(I2, 0, l, mm);
        for (let c = 0; c < 9; c++) farI[13 * k + 4 + c] = I3[c];
      }
    }
    for (let s = 0; s < 9; s++) for (let c = 0; c < 10; c++) farK[90 * k + 9 * c + s] = D[o + TQ_FAR + 10 * s + c];
    if (!planar[k]) tbTriangleFar(S, k, o, mode, D, T);
    for (let s = 0; s < 9; s++) D[o + TQ_CPW + s] = TBCPW[s];
    c9.fill(0); tensorQuadNear(D, o, C0, C1, C2, c9); // source of the panel at its own control point (finite)
    selfSourceVec[3 * k] = TQSV[0]; selfSourceVec[3 * k + 1] = TQSV[1]; selfSourceVec[3 * k + 2] = TQSV[2];
  }
  function tensorQuadBasis(S, topo) {
    const n = S.count; if (topo.n !== n) throw new Error('Tensor basis: every panel must be a tensor panel.');
    const D = new Float64Array(TQ_STRIDE * n), selfSourceVec = new Float64Array(3 * n), fanVec = new Float64Array(3 * n), fanArea = new Float64Array(n);
    const c9 = new Float64Array(9), hyp = Math.hypot;
    // Far field of a PLANAR panel (normal n, in-plane axes l, m, centroid C; delta = X - C), expansion through the SECOND
    // moments of each value's shape function N_v: with R = P - C, Rn = R.n, Rl = R.l, Rm = R.m,
    //   phi_v = [w0 Rn / r^3 + 3 Rn (Fl Rl + Fm Rm) / r^5 + 1/2 Rn (15 (R.M2.R) / r^7 - 3 tr M2 / r^5)] / 4 pi,
    //   w0 = int N_v, Fl / Fm = int N_v delta_l / delta_m, M2 = int N_v delta delta^T (in-plane: ll, mm, lm),
    // collected per panel in six carriers; the source likewise: [A / r + 1/2 (3 R.I2.R / r^5 - tr I2 / r^3)] / 4 pi
    // (I2 the in-plane second moment of area). Third order adds, with the in-plane third moments m_ab = int N_v xi^a eta^b
    // (a + b = 3; xi = delta.l, eta = delta.m), Rn [(17.5 Rl^3 / r^9 - 7.5 Rl / r^7) m30 + (52.5 Rl^2 Rm / r^9 - 7.5 Rm / r^7) m21
    // + (52.5 Rl Rm^2 / r^9 - 7.5 Rl / r^7) m12 + (17.5 Rm^3 / r^9 - 7.5 Rm / r^7) m03] (from 1/6 d^3/d delta^3 of |R - delta|^-3)
    // and for the source (2.5 Rl^3 / r^7 - 1.5 Rl / r^5) I30 + (7.5 Rl^2 Rm / r^7 - 1.5 Rm / r^5) I21 + ... (of 1 / |R - delta|).
    // Fourth order (the n-th term of |R - delta|^-3 is |delta|^n P'_(n+1)(cos g) / r^(n+3), of 1 / |R - delta| |delta|^n
    // P_n(cos g) / r^(n+1)): Rn [39.375 (R.d)^4 / r^11 - 26.25 (R.d)^2 |d|^2 / r^9 + 1.875 |d|^4 / r^7] with the moments
    // m40, m31, m22, m13, m04, and for the source [35 (R.d)^4 / r^4 - 30 (R.d)^2 |d|^2 / r^2 + 3 |d|^4] / (8 r^5).
    // Per planar panel: fifteen carriers x nine values of weights (farW, carrier-major: 135 k + 9 c + q) and thirteen area
    // moments (farI); per warped panel the ten first-order terms carrier-major (farK: 90 k + 9 c + q). Zones: TQ_FF1/2/4.
    const planar = new Uint8Array(n), farN = new Float64Array(9 * n), farW = new Float64Array(135 * n), farI = new Float64Array(13 * n), farK = new Float64Array(90 * n);
    const T = tbTriStore(n), split = tbSplitRule(S);
    for (let k = 0; k < n; k++) tbPanel(S, k, D, selfSourceVec, fanVec, fanArea, planar, farN, farW, farI, farK, c9, T, split);
    // the planar weights again, grouped by expansion order so that a row reads only what its zone needs, contiguously:
    // carriers 0..2 (first order, 27 per panel), 3..5 (second, 27), 6..14 (fourth, 81)
    const farW1 = new Float64Array(27 * n), farW2 = new Float64Array(27 * n), farW4 = new Float64Array(81 * n);
    for (let k = 0; k < n; k++) for (let j = 0; j < 27; j++) { farW1[27 * k + j] = farW[135 * k + j]; farW2[27 * k + j] = farW[135 * k + 27 + j]; }
    for (let k = 0; k < n; k++) for (let j = 0; j < 81; j++) farW4[81 * k + j] = farW[135 * k + 54 + j];
    const sysOf = list => list.map(ch => ({ ...ch, sys: chainSystemT(ch) }));
    const spanChains = sysOf(topo.spanChains), stationChains = sysOf(topo.stationChains), stripChains = sysOf(topo.stripChains);
    return Object.freeze({ kind: 'tensor-quadratic', S, topo, data: D, stride: TQ_STRIDE, split, refs: topo.refs, nValues: topo.nValues, spanChains, stationChains, stripChains,
      tipMean: topo.tipMean, selfSourceVec, fanVec, fanArea, planar, farN, farW, farW1, farW2, farW4, farI, farK, scratchV: new Float64Array(topo.nValues), c9: new Float64Array(9),
      rowNear9: new Float64Array(9), rowFarC: new Float64Array(15 * n), rowFarK: new Float64Array(10 * n), rowOrder: new Uint8Array(n),
      rowFar15: new Float64Array(15), rowThr: new Float64Array(3 * n), rowThrFar2: Float64Array.of(NaN),
      tri: Object.freeze({ count: T.count, base: T.base, cnt: T.cnt, TC: T.TC.subarray(0, 3 * T.count), TN: T.TN.subarray(0, 9 * T.count), TD: T.TD.subarray(0, T.count),
        TI: T.TI.subarray(0, 13 * T.count), TW1: T.TW1.subarray(0, 27 * T.count), TW2: T.TW2.subarray(0, 27 * T.count), TW4: T.TW4.subarray(0, 81 * T.count) }),
      triThr: new Float64Array(3 * Math.max(1, T.count)), rowFarT: new Float64Array(60), rowOrdT: new Uint8Array(4), rowDistT: new Float64Array(16), rowCV: new Float64Array(9) });
  }
  // Forward map: every unified value from the panel unknowns mu.
  function chainForward(ch, src, dst) {
    const s = ch.sys, rhs = s.z;
    for (let k = 0; k < s.m; k++) { const cl = (k - 1 + s.N) % s.N; rhs[k] = (s.R0[k] ? s.R0[k] * src[ch.cells[cl]] : 0) + (s.R1[k] ? s.R1[k] * src[ch.cells[k % s.N]] : 0); }
    const x = s.solve(rhs); for (let k = 0; k < s.m; k++) dst[ch.knots[k]] = x[k];
  }
  // Transposed map: coefficients on the knots of a chain (in C, cleared) moved onto its cells (added in C). T is
  // symmetric, so (T^-1 R)^T c = R^T (T^-1 c): one solve with the precomputed factorization, then the R^T scatter.
  function chainTranspose(ch, C) {
    const s = ch.sys, z = s.z, m = s.m, N = s.N, kn = ch.knots, ce = ch.cells, lo = s.lo, ib = s.ib, cp = s.cp, R0 = s.R0, R1 = s.R1;
    z[0] = C[kn[0]] * ib[0]; C[kn[0]] = 0;
    for (let k = 1; k < m; k++) { const id = kn[k]; z[k] = (C[id] - lo[k] * z[k - 1]) * ib[k]; C[id] = 0; }
    for (let k = m - 2; k >= 0; k--) z[k] -= cp[k] * z[k + 1];
    if (s.cyclic) { const f = (z[0] + s.smf * z[m - 1]) * s.smg, sz = s.smz; for (let k = 0; k < m; k++) z[k] -= f * sz[k]; for (let k = 0; k < m; k++) { C[ce[(k - 1 + N) % N]] += R0[k] * z[k]; C[ce[k % N]] += R1[k] * z[k]; } return; }
    C[ce[0]] += R1[0] * z[0];
    for (let k = 1; k < N; k++) { C[ce[k - 1]] += R0[k] * z[k]; C[ce[k]] += R1[k] * z[k]; }
    C[ce[N - 1]] += R0[N] * z[N];
  }
  function tensorValues(B, mu) {
    const V = new Float64Array(B.nValues), n = B.topo.n;
    for (let k = 0; k < n; k++) V[k] = mu[k];
    for (const ch of B.spanChains) chainForward(ch, V, V);
    if (B.tipMean) { let s = 0; for (const id of B.tipMean.from) s += V[id]; V[B.tipMean.id] = s / B.tipMean.from.length; }
    for (const ch of B.stationChains) chainForward(ch, V, V);
    for (const ch of B.stripChains) chainForward(ch, V, V);
    return V;
  }
  // All coefficients collected on unified values (C) -> coefficients on the panel unknowns (C[0..n)).
  function tensorTranspose(B, C) {
    if (B.tipMean) { const f = B.tipMean.from, c = C[B.tipMean.id] / f.length; C[B.tipMean.id] = 0; for (const id of f) C[id] += c; }
    for (const ch of B.stationChains) chainTranspose(ch, C);
    for (const ch of B.stripChains) chainTranspose(ch, C);
    for (const ch of B.spanChains) chainTranspose(ch, C);
  }
  // Source of panel k at P (returned, scalar), source vector (TPV) and the doublet coefficients of its nine values
  // added to C at the panel's unified ids.
  const TPV = new Float64Array(3);
  function tensorPanel(B, S, k, px, py, pz, far2, C) {
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz, c9 = B.c9;
    c9.fill(0);
    let s;
    if (r2 > far2 * S.PD[k] * S.PD[k]) { const f = INV4PI / sqrt(r2); s = B.fanArea[k] * f; TPV[0] = B.fanVec[c] * f; TPV[1] = B.fanVec[c + 1] * f; TPV[2] = B.fanVec[c + 2] * f; tensorQuadFar(B.data, B.stride * k, dx, dy, dz, r2, c9); }
    else { s = tensorQuadNear(B.data, B.stride * k, px, py, pz, c9); TPV[0] = TQSV[0]; TPV[1] = TQSV[1]; TPV[2] = TQSV[2]; }
    const r = B.refs, o = 9 * k;
    for (let q = 0; q < 9; q++) { const id = r[o + q]; if (id >= 0) C[id] += c9[q]; }
    return s;
  }
  // Row of the panel matrix for the tensor basis (see addRow). Per panel the near-field coefficients of its nine values,
  // and the far-field kernel sums (real and image point together) are collected contiguously; each panel's nine
  // coefficients are formed once per row (planar panels from four carriers, others from the ten-term kernel) and moved
  // to the unified values, then the transposed spline maps move them onto the unknowns.
  // ord: expansion order of a planar panel (1, 2 or 4; ignored for a warped panel: first order)
  function farAccumulate(B, S, k, px, py, pz, ord = 2) {
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz, ir = 1 / sqrt(r2), ir2 = ir * ir, ir3 = ir * ir2, ir5 = ir3 * ir2;
    if (B.planar[k]) {
      const N = B.farN, o9 = 9 * k, rn = dx * N[o9] + dy * N[o9 + 1] + dz * N[o9 + 2], rl = dx * N[o9 + 3] + dy * N[o9 + 4] + dz * N[o9 + 5], rm = dx * N[o9 + 6] + dy * N[o9 + 7] + dz * N[o9 + 8];
      const f1 = 3 * rn * ir5, o = 15 * k, F = B.rowFarC, I = B.farI, oi = 13 * k;
      F[o] += rn * ir3; F[o + 1] += f1 * rl; F[o + 2] += f1 * rm;
      let ss = I[oi] * ir;
      if (ord >= 2) {
        const ir7 = ir5 * ir2, q0 = -1.5 * rn * ir5, q1 = 7.5 * rn * ir7, rl2 = rl * rl, rm2 = rm * rm;
        F[o + 3] += q0 + q1 * rl2; F[o + 4] += q0 + q1 * rm2; F[o + 5] += 2 * q1 * rl * rm;
        ss += 0.5 * (3 * (rl2 * I[oi + 1] + rm2 * I[oi + 2] + 2 * rl * rm * I[oi + 3]) * ir5 - (I[oi + 1] + I[oi + 2]) * ir3);
        if (ord >= 4) {
          const ir9 = ir7 * ir2, ir11 = ir9 * ir2, t1 = rn * ir9, t0 = 7.5 * rn * ir7, u = rn * ir11, v = rn * ir9, w = rn * ir7;
          F[o + 6] += 17.5 * t1 * rl2 * rl - t0 * rl; F[o + 7] += 52.5 * t1 * rl2 * rm - t0 * rm; F[o + 8] += 52.5 * t1 * rl * rm2 - t0 * rl; F[o + 9] += 17.5 * t1 * rm2 * rm - t0 * rm;
          F[o + 10] += 39.375 * u * rl2 * rl2 - 26.25 * v * rl2 + 1.875 * w; F[o + 11] += 157.5 * u * rl2 * rl * rm - 52.5 * v * rl * rm; F[o + 12] += 236.25 * u * rl2 * rm2 - 26.25 * v * (rl2 + rm2) + 3.75 * w;
          F[o + 13] += 157.5 * u * rl * rm2 * rm - 52.5 * v * rl * rm; F[o + 14] += 39.375 * u * rm2 * rm2 - 26.25 * v * rm2 + 1.875 * w;
          const a = 35 / 8 * ir9, b = 30 / 8 * ir7, e = 3 / 8 * ir5;
          ss += (2.5 * rl2 * rl * ir7 - 1.5 * rl * ir5) * I[oi + 4] + (7.5 * rl2 * rm * ir7 - 1.5 * rm * ir5) * I[oi + 5] + (7.5 * rl * rm2 * ir7 - 1.5 * rl * ir5) * I[oi + 6] + (2.5 * rm2 * rm * ir7 - 1.5 * rm * ir5) * I[oi + 7]
            + (a * rl2 * rl2 - b * rl2 + e) * I[oi + 8] + (4 * a * rl2 * rl * rm - 2 * b * rl * rm) * I[oi + 9] + (6 * a * rl2 * rm2 - b * (rl2 + rm2) + 2 * e) * I[oi + 10] + (4 * a * rl * rm2 * rm - 2 * b * rl * rm) * I[oi + 11] + (a * rm2 * rm2 - b * rm2 + e) * I[oi + 12];
        }
      }
      if (ord > B.rowOrder[k]) B.rowOrder[k] = ord;
      ss *= INV4PI; TPV[0] = N[o9] * ss; TPV[1] = N[o9 + 1] * ss; TPV[2] = N[o9 + 2] * ss;
      return;
    }
    const F = B.rowFarK, o = 10 * k; F[o] += dx * ir3; F[o + 1] += dy * ir3; F[o + 2] += dz * ir3; F[o + 3] -= ir3; F[o + 4] += dx * dx * ir5; F[o + 5] += dy * dy * ir5; F[o + 6] += dz * dz * ir5; F[o + 7] += dx * dy * ir5; F[o + 8] += dx * dz * ir5; F[o + 9] += dy * dz * ir5;
    const f = INV4PI * ir; TPV[0] = B.fanVec[c] * f; TPV[1] = B.fanVec[c + 1] * f; TPV[2] = B.fanVec[c + 2] * f;
  }
  // Zone thresholds for one farField value (squared distances: exact inside d3, fourth order inside d2, second inside
  // d1, first beyond), computed once per far2 and kept with the basis: per planar panel from its diameter (the same
  // products as before, so the same zones), per far triangle of a non-planar panel from the triangle's diameter.
  function rowThresholds(B, S, far2) {
    const T = B.rowThr;
    if (B.rowThrFar2[0] === far2) return T;
    const n = S.count, PD = S.PD, planar = B.planar;
    for (let k = 0; k < n; k++) { const pk = PD[k] * PD[k]; T[3 * k] = (planar[k] ? far2 * TQ_FF4 : far2) * pk; T[3 * k + 1] = far2 * TQ_FF2 * pk; T[3 * k + 2] = far2 * TQ_FF1 * pk; }
    const tri = B.tri, TT = B.triThr;
    for (let j = 0; j < tri.count; j++) { const pk = tri.TD[j] * tri.TD[j]; TT[3 * j] = far2 * TQ_FF4 * pk; TT[3 * j + 1] = far2 * TQ_FF2 * pk; TT[3 * j + 2] = far2 * TQ_FF1 * pk; }
    B.rowThrFar2[0] = far2;
    return T;
  }
  // A non-planar panel k (far triangles jb .. je - 1) at Q: exact (returns true, coefficients added to B.rowNear9) if Q is
  // inside the exact zone of any of its triangles, else (returns false) one graded planar expansion per triangle, its
  // carriers added to B.rowFarT (fifteen per triangle) and its order to B.rowOrdT; the source vector in TPV.
  // forceOrder (diagnostics only): every triangle expanded at that order, no exact zone.
  function triangleEval(B, k, jb, je, qx, qy, qz, forceOrder = 0) {
    const tri = B.tri, TT = B.triThr, TC = tri.TC, TN = tri.TN, TI = tri.TI, FT = B.rowFarT, OT = B.rowOrdT, RT = B.rowDistT;
    let inside = false;
    for (let j = jb, u = 0; j < je; j++, u += 4) {
      const ex = qx - TC[3 * j], ey = qy - TC[3 * j + 1], ez = qz - TC[3 * j + 2], e2 = ex * ex + ey * ey + ez * ez;
      RT[u] = ex; RT[u + 1] = ey; RT[u + 2] = ez; RT[u + 3] = e2;
      if (e2 <= TT[3 * j]) inside = true;
    }
    if (inside && !forceOrder) {
      const c9 = B.c9, N9 = B.rowNear9; c9.fill(0); tensorQuadNear(B.data, B.stride * k, qx, qy, qz, c9);
      for (let q = 0; q < 9; q++) N9[q] += c9[q];
      TPV[0] = TQSV[0]; TPV[1] = TQSV[1]; TPV[2] = TQSV[2];
      return true;
    }
    let tx = 0, ty = 0, tz = 0;
    for (let j = jb, u = 0; j < je; j++, u++) {
      const tn = 9 * j, ti = 13 * j, f = 15 * u, tnx = TN[tn], tny = TN[tn + 1], tnz = TN[tn + 2];
      const dx = RT[4 * u], dy = RT[4 * u + 1], dz = RT[4 * u + 2], r2 = RT[4 * u + 3];
      const ir = 1 / sqrt(r2), ir2 = ir * ir, ir3 = ir * ir2, ir5 = ir3 * ir2;
      const rn = dx * tnx + dy * tny + dz * tnz, rl = dx * TN[tn + 3] + dy * TN[tn + 4] + dz * TN[tn + 5], rm = dx * TN[tn + 6] + dy * TN[tn + 7] + dz * TN[tn + 8];
      const eo = forceOrder || (r2 > TT[3 * j + 2] ? 1 : r2 > TT[3 * j + 1] ? 2 : 4), g1 = 3 * rn * ir5;
      FT[f] += rn * ir3; FT[f + 1] += g1 * rl; FT[f + 2] += g1 * rm;
      let ss = TI[ti] * ir;
      if (eo >= 2) {
        const ir7 = ir5 * ir2, q0 = -1.5 * rn * ir5, q1 = 7.5 * rn * ir7, rl2 = rl * rl, rm2 = rm * rm;
        FT[f + 3] += q0 + q1 * rl2; FT[f + 4] += q0 + q1 * rm2; FT[f + 5] += 2 * q1 * rl * rm;
        ss += 0.5 * (3 * (rl2 * TI[ti + 1] + rm2 * TI[ti + 2] + 2 * rl * rm * TI[ti + 3]) * ir5 - (TI[ti + 1] + TI[ti + 2]) * ir3);
        if (eo >= 4) {
          const ir9 = ir7 * ir2, ir11 = ir9 * ir2, t1 = rn * ir9, t0 = 7.5 * rn * ir7, uu = rn * ir11, v = rn * ir9, w = rn * ir7;
          FT[f + 6] += 17.5 * t1 * rl2 * rl - t0 * rl; FT[f + 7] += 52.5 * t1 * rl2 * rm - t0 * rm; FT[f + 8] += 52.5 * t1 * rl * rm2 - t0 * rl; FT[f + 9] += 17.5 * t1 * rm2 * rm - t0 * rm;
          FT[f + 10] += 39.375 * uu * rl2 * rl2 - 26.25 * v * rl2 + 1.875 * w; FT[f + 11] += 157.5 * uu * rl2 * rl * rm - 52.5 * v * rl * rm; FT[f + 12] += 236.25 * uu * rl2 * rm2 - 26.25 * v * (rl2 + rm2) + 3.75 * w;
          FT[f + 13] += 157.5 * uu * rl * rm2 * rm - 52.5 * v * rl * rm; FT[f + 14] += 39.375 * uu * rm2 * rm2 - 26.25 * v * rm2 + 1.875 * w;
          const a = 35 / 8 * ir9, b = 30 / 8 * ir7, e = 3 / 8 * ir5;
          ss += (2.5 * rl2 * rl * ir7 - 1.5 * rl * ir5) * TI[ti + 4] + (7.5 * rl2 * rm * ir7 - 1.5 * rm * ir5) * TI[ti + 5] + (7.5 * rl * rm2 * ir7 - 1.5 * rl * ir5) * TI[ti + 6] + (2.5 * rm2 * rm * ir7 - 1.5 * rm * ir5) * TI[ti + 7]
            + (a * rl2 * rl2 - b * rl2 + e) * TI[ti + 8] + (4 * a * rl2 * rl * rm - 2 * b * rl * rm) * TI[ti + 9] + (6 * a * rl2 * rm2 - b * (rl2 + rm2) + 2 * e) * TI[ti + 10] + (4 * a * rl * rm2 * rm - 2 * b * rl * rm) * TI[ti + 11] + (a * rm2 * rm2 - b * rm2 + e) * TI[ti + 12];
        }
      }
      if (eo > OT[u]) OT[u] = eo;
      ss *= INV4PI; tx += tnx * ss; ty += tny * ss; tz += tnz * ss;
    }
    TPV[0] = tx; TPV[1] = ty; TPV[2] = tz;
    return false;
  }
  // The far triangles' carriers (B.rowFarT, orders B.rowOrdT; both cleared) moved to the nine coefficients CV of their panel:
  // per triangle, carriers in order (TW1 0..2, TW2 3..5, TW4 6..14).
  function triangleCoefficients(B, jb, je, CV) {
    const tri = B.tri, TW1 = tri.TW1, TW2 = tri.TW2, TW4 = tri.TW4, FT = B.rowFarT, OT = B.rowOrdT;
    let c0 = CV[0], c1 = CV[1], c2 = CV[2], c3 = CV[3], c4 = CV[4], c5 = CV[5], c6 = CV[6], c7 = CV[7], c8 = CV[8];
    for (let j = jb, u = 0; j < je; j++, u++) {
      const o = OT[u]; if (!o) continue;
      OT[u] = 0;
      const f = 15 * u, t = 27 * j, e0 = FT[f], e1 = FT[f + 1], e2 = FT[f + 2]; FT[f] = 0; FT[f + 1] = 0; FT[f + 2] = 0;
      c0 += TW1[t] * e0; c1 += TW1[t + 1] * e0; c2 += TW1[t + 2] * e0; c3 += TW1[t + 3] * e0; c4 += TW1[t + 4] * e0; c5 += TW1[t + 5] * e0; c6 += TW1[t + 6] * e0; c7 += TW1[t + 7] * e0; c8 += TW1[t + 8] * e0;
      c0 += TW1[t + 9] * e1; c1 += TW1[t + 10] * e1; c2 += TW1[t + 11] * e1; c3 += TW1[t + 12] * e1; c4 += TW1[t + 13] * e1; c5 += TW1[t + 14] * e1; c6 += TW1[t + 15] * e1; c7 += TW1[t + 16] * e1; c8 += TW1[t + 17] * e1;
      c0 += TW1[t + 18] * e2; c1 += TW1[t + 19] * e2; c2 += TW1[t + 20] * e2; c3 += TW1[t + 21] * e2; c4 += TW1[t + 22] * e2; c5 += TW1[t + 23] * e2; c6 += TW1[t + 24] * e2; c7 += TW1[t + 25] * e2; c8 += TW1[t + 26] * e2;
      if (o > 1) {
        for (let e = 3, t2 = t; e < 6; e++, t2 += 9) {
          const a = FT[f + e]; FT[f + e] = 0;
          c0 += TW2[t2] * a; c1 += TW2[t2 + 1] * a; c2 += TW2[t2 + 2] * a; c3 += TW2[t2 + 3] * a; c4 += TW2[t2 + 4] * a; c5 += TW2[t2 + 5] * a; c6 += TW2[t2 + 6] * a; c7 += TW2[t2 + 7] * a; c8 += TW2[t2 + 8] * a;
        }
        if (o > 2) for (let e = 6, t4 = 81 * j; e < 15; e++, t4 += 9) {
          const a = FT[f + e]; FT[f + e] = 0;
          c0 += TW4[t4] * a; c1 += TW4[t4 + 1] * a; c2 += TW4[t4 + 2] * a; c3 += TW4[t4 + 3] * a; c4 += TW4[t4 + 4] * a; c5 += TW4[t4 + 5] * a; c6 += TW4[t4 + 6] * a; c7 += TW4[t4 + 7] * a; c8 += TW4[t4 + 8] * a;
        }
      }
    }
    CV[0] = c0; CV[1] = c1; CV[2] = c2; CV[3] = c3; CV[4] = c4; CV[5] = c5; CV[6] = c6; CV[7] = c7; CV[8] = c8;
  }
  // The coefficients of up to four rows on the unified values. Lane l: the point P[3 l .. 3 l + 2], row self0 + l (its
  // own panel gets the interior limit; self0 = -1: a field point), coefficients added to C at CS * id + l (CS = 1 and
  // one lane: B.scratchV; CS = 4: four rows interleaved, transposed together by tensorTransposeL), source sums in
  // src[3 l .. 3 l + 2]. One pass over the panels; per panel the lanes in turn (so the panel's data and weights are
  // re-read from cache), each lane exactly as a single row: the real point and its mirror image are evaluated, then the
  // nine coefficients are formed and moved to the unified values.
  //  * planar panel: near (exact P2 kernel into N9) or one graded expansion about the panel centroid (carriers 0..2 in
  //    locals, 3..14 in F); the arithmetic is farAccumulate's, inlined in the same order (bit-identical to calling it);
  //  * non-planar panel: exact if the point is inside the exact zone of ANY of its triangles, else one graded planar
  //    expansion per triangle (carriers in FT, fifteen per triangle; orders in OT).
  // F, FT, OT and N9 are cleared after each use.
  function rowValuesTensor(B, W, S, P, self0, lanes, image, far2, C, CS, src) {
    const n = S.count, D = B.data, r = B.refs, N9 = B.rowNear9, F = B.rowFar15, c9 = B.c9, PC = S.PC, TH = rowThresholds(B, S, far2);
    const planar = B.planar, W1 = B.farW1, W2 = B.farW2, W4 = B.farW4, farK = B.farK, fan = B.fanVec, FN = B.farN, FI = B.farI, stride = B.stride, ssv = B.selfSourceVec, mirrors = image ? 2 : 1;
    const tri = B.tri, tbase = tri.base, tcnt = tri.cnt;
    for (let q = 0; q < 3 * lanes; q++) src[q] = 0;
    for (let k = 0; k < n; k++) {
      const c = 3 * k, pl = planar[k], d3 = TH[c], d2 = TH[c + 1], d1 = TH[c + 2], cx = PC[c], cy = PC[c + 1], cz = PC[c + 2], o9 = 9 * k;
      const a0 = CS * r[o9], a1 = CS * r[o9 + 1], a2 = CS * r[o9 + 2], a3 = CS * r[o9 + 3], a4 = CS * r[o9 + 4], a5 = CS * r[o9 + 5], a6 = CS * r[o9 + 6], a7 = CS * r[o9 + 7], a8 = CS * r[o9 + 8];
      // the planar frame (normal, in-plane axes) and area (zero for a non-planar panel, unused there); its far triangles
      const nx = FN[o9], ny = FN[o9 + 1], nz = FN[o9 + 2], lx = FN[o9 + 3], ly = FN[o9 + 4], lz = FN[o9 + 5], mx = FN[o9 + 6], my = FN[o9 + 7], mz = FN[o9 + 8], oi = 13 * k, area = FI[oi];
      const jb = tbase[k], je = jb + tcnt[k];
      for (let lane = 0; lane < lanes; lane++) {
        const px = P[3 * lane], py = P[3 * lane + 1], pz = P[3 * lane + 2], self = self0 < 0 ? -1 : self0 + lane;
        let near = false, ord = 0, triFar = false, warpedFar = false, sx = src[3 * lane], sy = src[3 * lane + 1], sz = src[3 * lane + 2];
        let f0 = 0, f1 = 0, f2 = 0; // planar panel: carriers 0..2 (the others in F)
        for (let m = 0; m < mirrors; m++) {
          let tx, ty, tz;
          if (m === 0 && k === self) {
            const o = stride * k + TQ_CPW; for (let q = 0; q < 9; q++) N9[q] -= 0.5 * D[o + q];
            near = true; tx = ssv[c]; ty = ssv[c + 1]; tz = ssv[c + 2];
          } else if (pl) {
            const qy = m ? -py : py, dx = px - cx, dy = qy - cy, dz = pz - cz, r2 = dx * dx + dy * dy + dz * dz;
            if (r2 > d3) {
              const ir = 1 / sqrt(r2), ir2 = ir * ir, ir3 = ir * ir2, ir5 = ir3 * ir2;
              const rn = dx * nx + dy * ny + dz * nz, rl = dx * lx + dy * ly + dz * lz, rm = dx * mx + dy * my + dz * mz;
              const eo = r2 > d1 ? 1 : r2 > d2 ? 2 : 4, g1 = 3 * rn * ir5;
              f0 += rn * ir3; f1 += g1 * rl; f2 += g1 * rm;
              let ss = area * ir;
              if (eo >= 2) {
                const ir7 = ir5 * ir2, q0 = -1.5 * rn * ir5, q1 = 7.5 * rn * ir7, rl2 = rl * rl, rm2 = rm * rm;
                F[3] += q0 + q1 * rl2; F[4] += q0 + q1 * rm2; F[5] += 2 * q1 * rl * rm;
                ss += 0.5 * (3 * (rl2 * FI[oi + 1] + rm2 * FI[oi + 2] + 2 * rl * rm * FI[oi + 3]) * ir5 - (FI[oi + 1] + FI[oi + 2]) * ir3);
                if (eo >= 4) {
                  const ir9 = ir7 * ir2, ir11 = ir9 * ir2, t1 = rn * ir9, t0 = 7.5 * rn * ir7, u = rn * ir11, v = rn * ir9, w = rn * ir7;
                  F[6] += 17.5 * t1 * rl2 * rl - t0 * rl; F[7] += 52.5 * t1 * rl2 * rm - t0 * rm; F[8] += 52.5 * t1 * rl * rm2 - t0 * rl; F[9] += 17.5 * t1 * rm2 * rm - t0 * rm;
                  F[10] += 39.375 * u * rl2 * rl2 - 26.25 * v * rl2 + 1.875 * w; F[11] += 157.5 * u * rl2 * rl * rm - 52.5 * v * rl * rm; F[12] += 236.25 * u * rl2 * rm2 - 26.25 * v * (rl2 + rm2) + 3.75 * w;
                  F[13] += 157.5 * u * rl * rm2 * rm - 52.5 * v * rl * rm; F[14] += 39.375 * u * rm2 * rm2 - 26.25 * v * rm2 + 1.875 * w;
                  const a = 35 / 8 * ir9, b = 30 / 8 * ir7, e = 3 / 8 * ir5;
                  ss += (2.5 * rl2 * rl * ir7 - 1.5 * rl * ir5) * FI[oi + 4] + (7.5 * rl2 * rm * ir7 - 1.5 * rm * ir5) * FI[oi + 5] + (7.5 * rl * rm2 * ir7 - 1.5 * rl * ir5) * FI[oi + 6] + (2.5 * rm2 * rm * ir7 - 1.5 * rm * ir5) * FI[oi + 7]
                    + (a * rl2 * rl2 - b * rl2 + e) * FI[oi + 8] + (4 * a * rl2 * rl * rm - 2 * b * rl * rm) * FI[oi + 9] + (6 * a * rl2 * rm2 - b * (rl2 + rm2) + 2 * e) * FI[oi + 10] + (4 * a * rl * rm2 * rm - 2 * b * rl * rm) * FI[oi + 11] + (a * rm2 * rm2 - b * rm2 + e) * FI[oi + 12];
                }
              }
              if (eo > ord) ord = eo;
              ss *= INV4PI; tx = nx * ss; ty = ny * ss; tz = nz * ss;
            } else {
              c9.fill(0); tensorQuadNear(D, stride * k, px, qy, pz, c9);
              for (let q = 0; q < 9; q++) N9[q] += c9[q];
              near = true; tx = TQSV[0]; ty = TQSV[1]; tz = TQSV[2];
            }
          } else { // non-planar panel: beyond 4 ff (24) diameters the first-order expansion about the centroid, else per triangle
            const qy = m ? -py : py, dx = px - cx, dy = qy - cy, dz = pz - cz, r2 = dx * dx + dy * dy + dz * dz;
            if (r2 > d1) {
              const ir = 1 / sqrt(r2), ir3 = ir * ir * ir, ir5 = ir3 * ir * ir;
              f0 += dx * ir3; f1 += dy * ir3; f2 += dz * ir3; F[3] -= ir3; F[4] += dx * dx * ir5; F[5] += dy * dy * ir5; F[6] += dz * dz * ir5; F[7] += dx * dy * ir5; F[8] += dx * dz * ir5; F[9] += dy * dz * ir5;
              warpedFar = true;
              const f = INV4PI * ir; tx = fan[c] * f; ty = fan[c + 1] * f; tz = fan[c + 2] * f;
            } else {
              if (triangleEval(B, k, jb, je, px, qy, pz)) near = true; else triFar = true;
              tx = TPV[0]; ty = TPV[1]; tz = TPV[2];
            }
          }
          sx += tx; if (m) sy -= ty; else sy += ty; sz += tz;
        }
        src[3 * lane] = sx; src[3 * lane + 1] = sy; src[3 * lane + 2] = sz;
        // nine coefficients of panel k -> unified values
        let c0, c1, c2, c3, c4, c5, c6, c7, c8;
        if (near) { c0 = N9[0]; c1 = N9[1]; c2 = N9[2]; c3 = N9[3]; c4 = N9[4]; c5 = N9[5]; c6 = N9[6]; c7 = N9[7]; c8 = N9[8]; for (let q = 0; q < 9; q++) N9[q] = 0; }
        else { c0 = 0; c1 = 0; c2 = 0; c3 = 0; c4 = 0; c5 = 0; c6 = 0; c7 = 0; c8 = 0; }
        // carrier-major weights, nine per carrier, carriers in order (W1 carriers 0..2, W2 3..5, W4 6..14)
        if (ord) {
          const t = 27 * k, e0 = f0, e1 = f1, e2 = f2;
          c0 += W1[t] * e0; c1 += W1[t + 1] * e0; c2 += W1[t + 2] * e0; c3 += W1[t + 3] * e0; c4 += W1[t + 4] * e0; c5 += W1[t + 5] * e0; c6 += W1[t + 6] * e0; c7 += W1[t + 7] * e0; c8 += W1[t + 8] * e0;
          c0 += W1[t + 9] * e1; c1 += W1[t + 10] * e1; c2 += W1[t + 11] * e1; c3 += W1[t + 12] * e1; c4 += W1[t + 13] * e1; c5 += W1[t + 14] * e1; c6 += W1[t + 15] * e1; c7 += W1[t + 16] * e1; c8 += W1[t + 17] * e1;
          c0 += W1[t + 18] * e2; c1 += W1[t + 19] * e2; c2 += W1[t + 20] * e2; c3 += W1[t + 21] * e2; c4 += W1[t + 22] * e2; c5 += W1[t + 23] * e2; c6 += W1[t + 24] * e2; c7 += W1[t + 25] * e2; c8 += W1[t + 26] * e2;
          if (ord > 1) {
            for (let e = 3, t2 = 27 * k; e < 6; e++, t2 += 9) {
              const a = F[e]; F[e] = 0;
              c0 += W2[t2] * a; c1 += W2[t2 + 1] * a; c2 += W2[t2 + 2] * a; c3 += W2[t2 + 3] * a; c4 += W2[t2 + 4] * a; c5 += W2[t2 + 5] * a; c6 += W2[t2 + 6] * a; c7 += W2[t2 + 7] * a; c8 += W2[t2 + 8] * a;
            }
            if (ord > 2) for (let e = 6, t4 = 81 * k; e < 15; e++, t4 += 9) {
              const a = F[e]; F[e] = 0;
              c0 += W4[t4] * a; c1 += W4[t4 + 1] * a; c2 += W4[t4 + 2] * a; c3 += W4[t4 + 3] * a; c4 += W4[t4 + 4] * a; c5 += W4[t4 + 5] * a; c6 += W4[t4 + 6] * a; c7 += W4[t4 + 7] * a; c8 += W4[t4 + 8] * a;
            }
          }
        } else {
          if (warpedFar) { // non-planar panel, first order about the centroid: ten carriers (f0..f2, F[3..9])
            const t = 90 * k;
            c0 += farK[t] * f0; c1 += farK[t + 1] * f0; c2 += farK[t + 2] * f0; c3 += farK[t + 3] * f0; c4 += farK[t + 4] * f0; c5 += farK[t + 5] * f0; c6 += farK[t + 6] * f0; c7 += farK[t + 7] * f0; c8 += farK[t + 8] * f0;
            c0 += farK[t + 9] * f1; c1 += farK[t + 10] * f1; c2 += farK[t + 11] * f1; c3 += farK[t + 12] * f1; c4 += farK[t + 13] * f1; c5 += farK[t + 14] * f1; c6 += farK[t + 15] * f1; c7 += farK[t + 16] * f1; c8 += farK[t + 17] * f1;
            c0 += farK[t + 18] * f2; c1 += farK[t + 19] * f2; c2 += farK[t + 20] * f2; c3 += farK[t + 21] * f2; c4 += farK[t + 22] * f2; c5 += farK[t + 23] * f2; c6 += farK[t + 24] * f2; c7 += farK[t + 25] * f2; c8 += farK[t + 26] * f2;
            for (let e = 3, t3 = t + 27; e < 10; e++, t3 += 9) {
              const a = F[e]; F[e] = 0;
              c0 += farK[t3] * a; c1 += farK[t3 + 1] * a; c2 += farK[t3 + 2] * a; c3 += farK[t3 + 3] * a; c4 += farK[t3 + 4] * a; c5 += farK[t3 + 5] * a; c6 += farK[t3 + 6] * a; c7 += farK[t3 + 7] * a; c8 += farK[t3 + 8] * a;
            }
          }
          if (triFar) {
          const CV = B.rowCV; CV[0] = c0; CV[1] = c1; CV[2] = c2; CV[3] = c3; CV[4] = c4; CV[5] = c5; CV[6] = c6; CV[7] = c7; CV[8] = c8;
          triangleCoefficients(B, jb, je, CV);
          c0 = CV[0]; c1 = CV[1]; c2 = CV[2]; c3 = CV[3]; c4 = CV[4]; c5 = CV[5]; c6 = CV[6]; c7 = CV[7]; c8 = CV[8];
          }
        }
        C[a0 + lane] += c0; C[a1 + lane] += c1; C[a2 + lane] += c2; C[a3 + lane] += c3; C[a4 + lane] += c4; C[a5 + lane] += c5; C[a6 + lane] += c6; C[a7 + lane] += c7; C[a8 + lane] += c8;
      }
    }
    if (W) {
      const ux = W.dir[0], uy = W.dir[1], uz = W.dir[2];
      for (let lane = 0; lane < lanes; lane++) {
        const px = P[3 * lane], py = P[3 * lane + 1], pz = P[3 * lane + 2];
        for (let j = 0; j < W.count; j++) {
          const o = 3 * j, st = W.basis.strips[j];
          quadStrip(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3);
          if (image) { quadStrip(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3m); QS3[0] += QS3m[0]; QS3[1] += QS3m[1]; QS3[2] += QS3m[2]; }
          C[CS * st.aUp + lane] += QS3[0]; C[CS * st.aLo + lane] -= QS3[0]; C[CS * st.up + lane] += QS3[1]; C[CS * st.lo + lane] -= QS3[1]; C[CS * st.bUp + lane] += QS3[2]; C[CS * st.bLo + lane] -= QS3[2];
        }
      }
    }
  }
  // One row (B.scratchV is all zero between rows: the transposed maps clear every knot they read and the epilogue clears mu).
  const TRP = new Float64Array(3);
  function addRowTensor(B, W, S, px, py, pz, self, image, far2, target, offset, src) {
    const n = S.count, C = B.scratchV;
    TRP[0] = px; TRP[1] = py; TRP[2] = pz;
    rowValuesTensor(B, W, S, TRP, self, 1, image, far2, C, 1, src);
    tensorTranspose(B, C);
    for (let k = 0; k < n; k++) { target[offset + k] += C[k]; C[k] = 0; }
  }
  // tensorTranspose on 4 rows at once (C: the unified values with the 4 rows interleaved, value-major). Per row the
  // operations of chainTranspose in the same order; the 4 independent recurrences run side by side. Z: scratch of at
  // least 4 x the longest chain. (Eight rows were measured as well: no difference.)
  function chainTransposeL(ch, C, Z) {
    const s = ch.sys, m = s.m, N = s.N, kn = ch.knots, ce = ch.cells, lo = s.lo, ib = s.ib, cp = s.cp, R0 = s.R0, R1 = s.R1;
    let i = 4 * kn[0], b = ib[0];
    let z0 = C[i + 0] * b, z1 = C[i + 1] * b, z2 = C[i + 2] * b, z3 = C[i + 3] * b;
    C[i + 0] = 0; C[i + 1] = 0; C[i + 2] = 0; C[i + 3] = 0; Z[0] = z0; Z[1] = z1; Z[2] = z2; Z[3] = z3;
    for (let k = 1; k < m; k++) {
      const l = lo[k], o = 4 * k; i = 4 * kn[k]; b = ib[k];
      z0 = (C[i + 0] - l * z0) * b; z1 = (C[i + 1] - l * z1) * b; z2 = (C[i + 2] - l * z2) * b; z3 = (C[i + 3] - l * z3) * b;
      C[i + 0] = 0; C[i + 1] = 0; C[i + 2] = 0; C[i + 3] = 0; Z[o + 0] = z0; Z[o + 1] = z1; Z[o + 2] = z2; Z[o + 3] = z3;
    }
    for (let k = m - 2; k >= 0; k--) {
      const c = cp[k], o = 4 * k;
      z0 = Z[o + 0] - c * z0; z1 = Z[o + 1] - c * z1; z2 = Z[o + 2] - c * z2; z3 = Z[o + 3] - c * z3;
      Z[o + 0] = z0; Z[o + 1] = z1; Z[o + 2] = z2; Z[o + 3] = z3;
    }
    if (s.cyclic) {
      const sz = s.smz, smf = s.smf, smg = s.smg, e = 4 * (m - 1);
      const f0 = (Z[0] + smf * Z[e + 0]) * smg, f1 = (Z[1] + smf * Z[e + 1]) * smg, f2 = (Z[2] + smf * Z[e + 2]) * smg, f3 = (Z[3] + smf * Z[e + 3]) * smg;
      for (let k = 0; k < m; k++) { const o = 4 * k, q = sz[k]; Z[o + 0] -= f0 * q; Z[o + 1] -= f1 * q; Z[o + 2] -= f2 * q; Z[o + 3] -= f3 * q; }
      for (let k = 0; k < m; k++) {
        const o = 4 * k, a = 4 * ce[(k - 1 + N) % N], c = 4 * ce[k % N], r0 = R0[k], r1 = R1[k];
        C[a + 0] += r0 * Z[o + 0]; C[a + 1] += r0 * Z[o + 1]; C[a + 2] += r0 * Z[o + 2]; C[a + 3] += r0 * Z[o + 3];
        C[c + 0] += r1 * Z[o + 0]; C[c + 1] += r1 * Z[o + 1]; C[c + 2] += r1 * Z[o + 2]; C[c + 3] += r1 * Z[o + 3];
      }
      return;
    }
    { const c = 4 * ce[0], r1 = R1[0]; C[c + 0] += r1 * Z[0]; C[c + 1] += r1 * Z[1]; C[c + 2] += r1 * Z[2]; C[c + 3] += r1 * Z[3]; }
    for (let k = 1; k < N; k++) {
      const o = 4 * k, a = 4 * ce[k - 1], c = 4 * ce[k], r0 = R0[k], r1 = R1[k];
      C[a + 0] += r0 * Z[o + 0]; C[a + 1] += r0 * Z[o + 1]; C[a + 2] += r0 * Z[o + 2]; C[a + 3] += r0 * Z[o + 3];
      C[c + 0] += r1 * Z[o + 0]; C[c + 1] += r1 * Z[o + 1]; C[c + 2] += r1 * Z[o + 2]; C[c + 3] += r1 * Z[o + 3];
    }
    { const a = 4 * ce[N - 1], o = 4 * N, r0 = R0[N]; C[a + 0] += r0 * Z[o + 0]; C[a + 1] += r0 * Z[o + 1]; C[a + 2] += r0 * Z[o + 2]; C[a + 3] += r0 * Z[o + 3]; }
  }
  function tensorTransposeL(B, C, Z) {
    if (B.tipMean) {
      const f = B.tipMean.from, t = 4 * B.tipMean.id, F = f.length;
      for (let l = 0; l < 4; l++) { const c = C[t + l] / F; C[t + l] = 0; for (const id of f) C[4 * id + l] += c; }
    }
    for (const ch of B.stationChains) chainTransposeL(ch, C, Z);
    for (const ch of B.stripChains) chainTransposeL(ch, C, Z);
    for (const ch of B.spanChains) chainTransposeL(ch, C, Z);
  }
  // Topology of a wingMesh half-wing (rounded or closed tip; a flat cap is not supported by this model).
  function wingTensorTopology(S, wm) {
    const { ni, ns, index } = wm, n = S.count, nh = ni / 2, closed = !!wm.closedTip;
    if (wm.hasCap) throw new Error("The 'tensor-quadratic' doublet model needs a rounded or closed tip (no flat cap).");
    if (n !== ni * ns) throw new Error('Tensor topology: unexpected panel count.');
    const nMK = nh * (2 * ns + 1), nKM = (ni + 1) * ns, nKK = (ni + 1) * (ns + 1), oMK = n, oKM = oMK + nMK, oKK = oKM + nKM, T = closed ? oKK + nKK : -1, nValues = oKK + nKK + (closed ? 1 : 0);
    const mk = (i, j) => { const ch = i >= nh ? ni - 1 - i : i, base = oMK + ch * (2 * ns + 1); return i >= nh ? base + j : base + 2 * ns - j; };
    const km = (m, j) => oKM + m + (ni + 1) * j, kk = (m, j) => (closed && j === ns) ? T : oKK + m + (ni + 1) * j;
    const corner = (k, q) => [S.PV[12 * k + 3 * q], S.PV[12 * k + 3 * q + 1], S.PV[12 * k + 3 * q + 2]], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const refs = new Int32Array(9 * n);
    for (let j = 0; j < ns; j++) for (let i = 0; i < ni; i++) {
      const k = index(i, j), r = [kk(i, j), mk(i, j), kk(i + 1, j), km(i, j), k, km(i + 1, j), kk(i, j + 1), mk(i, j + 1), kk(i + 1, j + 1)];
      if (closed && j === ns - 1) { r[6] = T; r[7] = T; r[8] = T; }
      for (let q = 0; q < 9; q++) refs[9 * k + q] = r[q];
    }
    const spanChains = [];
    for (let c = 0; c < nh; c++) {
      const up = ni - 1 - c, cells = [], h = [], kn = [];
      for (let j = 0; j <= 2 * ns; j++) kn.push(oMK + c * (2 * ns + 1) + j);
      for (let j = 0; j < ns; j++) { cells.push(index(up, j)); h.push(wm.ys[j + 1] - wm.ys[j]); }
      for (let j = ns - 1; j >= 0; j--) { cells.push(index(c, j)); h.push(wm.ys[j + 1] - wm.ys[j]); }
      spanChains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'clamped', end: 'clamped' });
    }
    const stationChains = [];
    for (let j = 0; j <= (closed ? ns - 1 : ns); j++) {
      const cells = [], h = [], kn = [];
      for (let i = 0; i < ni; i++) {
        cells.push(mk(i, j));
        h.push(j < ns ? dist(corner(index(i, j), 1), corner(index(i, j), 0)) : dist(corner(index(i, ns - 1), 2), corner(index(i, ns - 1), 3)));
      }
      for (let m = 0; m <= ni; m++) kn.push(kk(m, j));
      // rounded tip: the folded tip loop is symmetric up to the geometry's own round-off (its section scale is 0 only to
      // ~1e-8), so its spacing is symmetrized: the two traces of every fold point then get the same knot value
      if (j === ns) for (let i = 0; i < nh; i++) { const hm = 0.5 * (h[i] + h[ni - 1 - i]); h[i] = hm; h[ni - 1 - i] = hm; }
      if (!h.every(x => x > 0)) throw new Error(`Tensor topology: station ${j} has a zero-length chordwise edge.`);
      stationChains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'natural', end: 'natural' });
    }
    const stripChains = [];
    for (let j = 0; j < ns; j++) {
      const cells = [], h = [], kn = [];
      for (let i = 0; i < ni; i++) { const k = index(i, j), c = [0, 1, 2, 3].map(q => corner(k, q)); cells.push(k); h.push(dist([0, 1, 2].map(x => 0.5 * (c[1][x] + c[2][x])), [0, 1, 2].map(x => 0.5 * (c[0][x] + c[3][x])))); }
      for (let m = 0; m <= ni; m++) kn.push(km(m, j));
      stripChains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'natural', end: 'natural' });
    }
    const tipMean = closed ? { id: T, from: Int32Array.from({ length: nh }, (_, c) => oMK + c * (2 * ns + 1) + ns) } : null;
    return { n, nValues, refs, spanChains, stationChains, stripChains, tipMean, ni, ns, oMK, oKM, oKK, T, closed, kk: null, km: null };
  }
  function wingTensorQuadBasis(S, wm) { return tensorQuadBasis(S, wingTensorTopology(S, wm)); }
  // Attached wake of a tensor body: strip j carries the quadratic through the jumps of the two trailing-edge traces
  // (KK(ni, j) - KK(0, j), KM(ni, j) - KM(0, j), KK(ni, j+1) - KK(0, j+1)), checks the trailing-edge panel corners.
  function tensorQuadWake(W, B, S, wm) {
    const m = W.count, strips = [], { ni, index } = wm, r = B.refs;
    let scale = 1; for (let j = 0; j < 3 * m; j++) scale = Math.max(scale, absv(W.a[j]), absv(W.b[j]));
    const at = (k, q, P, j) => { const v = 12 * k + 3 * q; if (Math.hypot(S.PV[v] - P[3 * j], S.PV[v + 1] - P[3 * j + 1], S.PV[v + 2] - P[3 * j + 2]) > 1e-9 * scale) throw new Error('Tensor wake: trailing-edge panel corners do not match the wake strip.'); };
    if (absv(W.dir[1]) > 1e-12) throw new Error('Tensor wake: the wake direction must lie in the x-z plane.');
    for (let j = 0; j < m; j++) {
      const up = index(ni - 1, j), lo = index(0, j);
      at(up, 1, W.a, j); at(up, 2, W.b, j); at(lo, 0, W.a, j); at(lo, 3, W.b, j);
      // upper panel: s = 1 edge (slots 2, 5, 8); lower panel: s = 0 edge (slots 0, 3, 6)
      strips.push({ up: r[9 * up + 5], lo: r[9 * lo + 3], aUp: r[9 * up + 2], aLo: r[9 * lo + 0], bUp: r[9 * up + 8], bLo: r[9 * lo + 6] });
    }
    return { kind: 'tensor-quadratic', strips };
  }
  // Surface velocity of the tensor model from the solved distribution itself (the jump relations of the sheet, as PANAIR
  // and MachLine recover the surface velocity). On each flat triangle T of a panel's split the doublet is the P2 polynomial
  // mu_T that the matrix and the field integrate (tensorQuadNear), the source is sigma_T = -V . n_T, and the interior
  // perturbation potential is zero (the collocation condition). Across the sheet (outside minus inside) [phi] = mu_T,
  // [grad_t phi] = grad_s mu_T and [d phi / dn] = sigma_T = -V . n_T, so the exterior limit of the total velocity is
  //   v(x) = V - (V . n_T) n_T + grad_s mu_T(x)   on T,
  // linear on T (grad_s mu_T = sum_m (d mu_T / d lambda_m) grad lambda_m, the in-plane barycentric gradients of T).
  // This is MachLine's panel_get_velocity with the Morino inner flow (and its forces / couples below its quadratic-
  // pressure, average-pressure and moment-about-centroid routines): test_wing_aero_machline_port.mjs applies a port of
  // those routines (validation/machline/) to the same distribution and reproduces the loads to round-off. No MachLine
  // code is used here.
  // tensorTriangles: the triangles of every panel (the split the matrix integrates): per triangle its panel, its index in
  // the panel's split, area, normal and vertices; per panel its first triangle (first[k] .. first[k + 1] - 1) and the
  // triangle containing the projection of the control point (chosen as tbPanel chooses it for the self term) with its
  // barycentric coordinates.
  function tensorTriangles(B, S) {
    const n = S.count, D = B.data;
    let count = 0;
    for (let k = 0; k < n; k++) { const o = B.stride * k, mode = D[o + 23]; for (let t = 0; t < TQ_NT[mode]; t++) if (D[o + TQ_TRI + TQ_TRISZ * t]) count++; }
    const first = new Int32Array(n + 1), panel = new Int32Array(count), tri = new Uint8Array(count), area = new Float64Array(count), N = new Float64Array(3 * count), X = new Float64Array(9 * count);
    const cpTri = new Int32Array(n), cpL = new Float64Array(3 * n);
    for (let k = 0, j = 0; k < n; k++) {
      const o = B.stride * k, mode = D[o + 23], TV = TQ_TV[mode], C0 = S.PC[3 * k], C1 = S.PC[3 * k + 1], C2 = S.PC[3 * k + 2];
      let best = -Infinity;
      first[k] = j;
      for (let t = 0; t < TQ_NT[mode]; t++) {
        const to = o + TQ_TRI + TQ_TRISZ * t;
        if (!D[to]) continue;
        panel[j] = k; tri[j] = t;
        for (let i = 0; i < 3; i++) { const p = o + 3 * TV[3 * t + i]; X[9 * j + 3 * i] = D[p]; X[9 * j + 3 * i + 1] = D[p + 1]; X[9 * j + 3 * i + 2] = D[p + 2]; }
        const x = 9 * j, ax = X[x + 3] - X[x], ay = X[x + 4] - X[x + 1], az = X[x + 5] - X[x + 2], bx = X[x + 6] - X[x], by = X[x + 7] - X[x + 1], bz = X[x + 8] - X[x + 2];
        area[j] = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
        N[3 * j] = D[to + 1]; N[3 * j + 1] = D[to + 2]; N[3 * j + 2] = D[to + 3];
        const cx = C0 - X[x], cy = C1 - X[x + 1], cz = C2 - X[x + 2];
        const l1 = D[to + 7] * cx + D[to + 8] * cy + D[to + 9] * cz, l2 = D[to + 10] * cx + D[to + 11] * cy + D[to + 12] * cz, l0 = 1 - l1 - l2, inside = Math.min(l0, l1, l2);
        if (inside > best) { best = inside; cpTri[k] = j; cpL[3 * k] = l0; cpL[3 * k + 1] = l1; cpL[3 * k + 2] = l2; }
        j++;
      }
      first[k + 1] = j;
    }
    return { n, count, first, panel, tri, area, N, X, cpTri, cpL };
  }
  // The velocity at the three vertices of every triangle of R (9 per triangle) for the unit solution mu, freestream Vinf.
  const TTV = new Float64Array(13);
  function tensorTriangleVelocity(B, S, R, mu, Vinf) {
    const V = tensorValues(B, mu), D = B.data, r = B.refs, out = new Float64Array(9 * R.count), nv = TTV;
    for (let k = 0; k < R.n; k++) {
      const o = B.stride * k, mode = D[o + 23];
      for (let q = 0; q < TQ_NN[mode]; q++) { // the panel's P2 node values (unit slot, or the slot weights of the node)
        const no = o + TQ_NODE + 10 * q, u = D[no];
        if (u >= 0) { const id = r[9 * k + u]; nv[q] = id >= 0 ? V[id] : 0; }
        else { let s = 0; for (let w = 0; w < 9; w++) { const id = r[9 * k + w]; if (id >= 0) s += D[no + 1 + w] * V[id]; } nv[q] = s; }
      }
      for (let j = R.first[k]; j < R.first[k + 1]; j++) {
        const to = o + TQ_TRI + TQ_TRISZ * R.tri[j], nd = to + 46, g = to + 4;
        const v0 = nv[D[nd]], v1 = nv[D[nd + 1]], v2 = nv[D[nd + 2]], v3 = nv[D[nd + 3]], v4 = nv[D[nd + 4]], v5 = nv[D[nd + 5]];
        const nx = D[to + 1], ny = D[to + 2], nz = D[to + 3], vn = Vinf[0] * nx + Vinf[1] * ny + Vinf[2] * nz;
        const tx = Vinf[0] - vn * nx, ty = Vinf[1] - vn * ny, tz = Vinf[2] - vn * nz;
        // d mu_T / d lambda_m at vertex i of the P2 Lagrange polynomial (vertex values v0..v2, mid-edge values v3 (01),
        // v4 (12), v5 (20)): vertex 0 (3 v0, 4 v3 - v1, 4 v5 - v2), vertex 1 (4 v3 - v0, 3 v1, 4 v4 - v2),
        // vertex 2 (4 v5 - v0, 4 v4 - v1, 3 v2)
        for (let i = 0; i < 3; i++) {
          const a = i === 0 ? 3 * v0 : i === 1 ? 4 * v3 - v0 : 4 * v5 - v0, b = i === 0 ? 4 * v3 - v1 : i === 1 ? 3 * v1 : 4 * v4 - v1, c = i === 0 ? 4 * v5 - v2 : i === 1 ? 4 * v4 - v2 : 3 * v2, q = 9 * j + 3 * i;
          out[q] = tx + a * D[g] + b * D[g + 3] + c * D[g + 6];
          out[q + 1] = ty + a * D[g + 1] + b * D[g + 4] + c * D[g + 7];
          out[q + 2] = tz + a * D[g + 2] + b * D[g + 5] + c * D[g + 8];
        }
      }
    }
    return out;
  }
  // per panel: the velocity at the projection of the control point in its triangle (3 per panel)
  function tensorControlPointVelocity(R, TVel) {
    const out = new Float64Array(3 * R.n);
    for (let k = 0; k < R.n; k++) { const q = 9 * R.cpTri[k], l0 = R.cpL[3 * k], l1 = R.cpL[3 * k + 1], l2 = R.cpL[3 * k + 2]; for (let c = 0; c < 3; c++) out[3 * k + c] = l0 * TVel[q + c] + l1 * TVel[q + 3 + c] + l2 * TVel[q + 6 + c]; }
    return out;
  }
  // Tangential velocity per panel from the analytic gradient of the panel's biquadratic at its parametric centre
  // (bilinear Jacobian of the corners): df/ds = f(1, 1/2) - f(0, 1/2), df/dt = f(1/2, 1) - f(1/2, 0). This is NOT the
  // gradient of the distribution the matrix integrates (the triangles' P2 polynomials interpolate the biquadratic at
  // their six nodes only, the vertex mean lies on a triangle edge, and the panel normal is not the triangles'): the
  // checkpoint-6 recovery, kept for comparison only (prepare uses tensorTriangleVelocity).
  function surfaceVelocityTensor(B, S, mu, Vinf) {
    const n = S.count, out = new Float64Array(3 * n), V = tensorValues(B, mu), r = B.refs, PV = S.PV;
    for (let k = 0; k < n; k++) {
      const fs = V[r[9 * k + 5]] - V[r[9 * k + 3]], ft = V[r[9 * k + 7]] - V[r[9 * k + 1]], v = 12 * k;
      const rs = [0, 1, 2].map(i => 0.5 * (PV[v + 3 + i] - PV[v + i] + PV[v + 6 + i] - PV[v + 9 + i])), rt = [0, 1, 2].map(i => 0.5 * (PV[v + 9 + i] - PV[v + i] + PV[v + 6 + i] - PV[v + 3 + i]));
      const a11 = rs[0] * rs[0] + rs[1] * rs[1] + rs[2] * rs[2], a12 = rs[0] * rt[0] + rs[1] * rt[1] + rs[2] * rt[2], a22 = rt[0] * rt[0] + rt[1] * rt[1] + rt[2] * rt[2], dt = a11 * a22 - a12 * a12;
      const a = (a22 * fs - a12 * ft) / dt, b = (a11 * ft - a12 * fs) / dt, nk = [S.PN[3 * k], S.PN[3 * k + 1], S.PN[3 * k + 2]];
      const g = [0, 1, 2].map(i => a * rs[i] + b * rt[i]), gn = g[0] * nk[0] + g[1] * nk[1] + g[2] * nk[2], vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
      for (let i = 0; i < 3; i++) out[3 * k + i] = Vinf[i] - vn * nk[i] + g[i] - gn * nk[i];
    }
    return out;
  }
  // The span-quadratic basis of a wingMesh half-wing: one chain per row pair (i, ni - 1 - i), from the root along row
  // ni - 1 - i to the tip and back along row i (sharing the tip knot: rounded fold or closed tip point), clamped (zero
  // slope) at both root ends; next to a flat cap, one chain per row, natural at the tip.
  function wingSpanQuadBasis(S, wm) {
    const { ni, ns, index, ys } = wm, n = S.count, kL = new Int32Array(n).fill(-1), kR = new Int32Array(n).fill(-1), chains = [];
    let knots = 0;
    const width = j => ys[j + 1] - ys[j];
    if (wm.hasCap) {
      for (let i = 0; i < ni; i++) {
        const cells = [], h = [], kn = [];
        for (let j = 0; j <= ns; j++) kn.push(knots + j);
        for (let j = 0; j < ns; j++) { const k = index(i, j); cells.push(k); h.push(width(j)); kL[k] = knots + j; kR[k] = knots + j + 1; }
        knots += ns + 1;
        chains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'clamped', end: 'natural' });
      }
    } else {
      for (let i = 0; i < ni / 2; i++) {
        const up = ni - 1 - i, cells = [], h = [], kn = [];
        for (let j = 0; j <= 2 * ns; j++) kn.push(knots + j);
        for (let j = 0; j < ns; j++) { const k = index(up, j); cells.push(k); h.push(width(j)); kL[k] = knots + j; kR[k] = knots + j + 1; }
        for (let j = ns - 1; j >= 0; j--) { const k = index(i, j); cells.push(k); h.push(width(j)); kR[k] = knots + 2 * ns - j - 1; kL[k] = knots + 2 * ns - j; }
        knots += 2 * ns + 1;
        chains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'clamped', end: 'clamped' });
      }
    }
    return spanQuadBasis(S, kL, kR, chains, knots);
  }
  // Attached wake of a span-quadratic body: strip j carries the quadratic strength through (jump of the trailing-edge
  // knots at a_j, Kutta jump of the mid-span unknowns, jump of the knots at b_j) = the difference of the two surface
  // traces, at every point of the trailing edge. Checks that the trailing-edge panel corners are the wake strip ends.
  function spanQuadWake(W, B, S) {
    const m = W.count, strips = [];
    let scale = 1; for (let j = 0; j < 3 * m; j++) scale = Math.max(scale, absv(W.a[j]), absv(W.b[j]));
    const at = (k, q, P, j) => { const v = 12 * k + 3 * q; if (Math.hypot(S.PV[v] - P[3 * j], S.PV[v + 1] - P[3 * j + 1], S.PV[v + 2] - P[3 * j + 2]) > 1e-9 * scale) throw new Error('Span-quadratic wake: trailing-edge panel corners do not match the wake strip.'); };
    if (absv(W.dir[1]) > 1e-12) throw new Error('Span-quadratic wake: the wake direction must lie in the x-z plane.');
    for (let j = 0; j < m; j++) {
      let up = -1, lo = -1;
      for (let q = 0; q < W.kuttaWidth; q++) { const c = W.kuttaWeights[j * W.kuttaWidth + q], p = W.kuttaPanels[j * W.kuttaWidth + q]; if (c === 1) up = p; else if (c === -1) lo = p; else if (c !== 0) throw new Error('Span-quadratic wake: Kutta weights must be +1 (upper) and -1 (lower).'); }
      if (up < 0 || lo < 0 || !B.quad[up] || !B.quad[lo]) throw new Error('Span-quadratic wake: both trailing-edge panels must be span-quadratic.');
      at(up, 1, W.a, j); at(up, 2, W.b, j); at(lo, 0, W.a, j); at(lo, 3, W.b, j); // upper TE edge v1v2, lower TE edge v0v3
      strips.push({ up, lo, aUp: B.kL[up], aLo: B.kL[lo], bUp: B.kR[up], bLo: B.kR[lo] });
    }
    return { kind: 'span-quadratic', strips };
  }
  // Wake strength: strip values gamma_j (Kutta jump of the unknowns, at the strip mid-point) and, for a basis, the
  // strength at the trailing-edge end points a_j (atA) and b_j (atB).
  function wakeStrengths(W, mu, B = null) {
    const m = W.count, gamma = new Float64Array(m);
    for (let j = 0; j < m; j++) { let g = 0; for (let q = 0; q < W.kuttaWidth; q++) g += W.kuttaWeights[j * W.kuttaWidth + q] * mu[W.kuttaPanels[j * W.kuttaWidth + q]]; gamma[j] = g; }
    if (!W.basis) return { gamma, atA: Float64Array.from(gamma), atB: Float64Array.from(gamma), model: 'constant' };
    if (!B) throw new Error('wakeStrengths: the span-quadratic wake needs the body basis.');
    if (W.basis.kind === 'tensor-quadratic') { // the jump of the two trailing-edge traces (gamma at the strip mid-point)
      const V = tensorValues(B, mu), st = W.basis.strips;
      return { gamma: Float64Array.from(st, s => V[s.up] - V[s.lo]), atA: Float64Array.from(st, s => V[s.aUp] - V[s.aLo]), atB: Float64Array.from(st, s => V[s.bUp] - V[s.bLo]), model: W.basis.kind };
    }
    const e = knotValues(B, mu), st = W.basis.strips;
    return { gamma, atA: Float64Array.from(st, s => e[s.aUp] - e[s.aLo]), atB: Float64Array.from(st, s => e[s.bUp] - e[s.bLo]), model: W.basis.kind };
  }
  // Source influence of panel k at P (returned); its doublet influence per value is added to M (mid-span unknowns) and E
  // (knots); constant panels add their solid angle to M[k] exactly as 0.3.1.
  function bodyPanel(B, S, k, px, py, pz, far2, M, E) {
    if (!B.quad[k]) { influence(S, k, px, py, pz, far2); M[k] += outD; BPV[0] = outS * S.PN[3 * k]; BPV[1] = outS * S.PN[3 * k + 1]; BPV[2] = outS * S.PN[3 * k + 2]; return outS; }
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz, c3 = B.c3;
    c3[0] = 0; c3[1] = 0; c3[2] = 0;
    let s;
    if (r2 > far2 * S.PD[k] * S.PD[k]) { const f = INV4PI / sqrt(r2); s = B.fanArea[k] * f; BPV[0] = B.fanVec[c] * f; BPV[1] = B.fanVec[c + 1] * f; BPV[2] = B.fanVec[c + 2] * f; spanQuadFar(B.data, B.stride * k, dx, dy, dz, r2, c3); }
    else { s = spanQuadNear(B.data, B.stride * k, px, py, pz, c3); BPV[0] = SQSV[0]; BPV[1] = SQSV[1]; BPV[2] = SQSV[2]; }
    E[B.kL[k]] += c3[0]; M[k] += c3[1]; E[B.kR[k]] += c3[2];
    return s;
  }
  const QS3 = new Float64Array(3), QS3m = new Float64Array(3);
  // One row of the panel matrix: adds to target[offset + p] the doublet influence (body and, when given, wake) at P and
  // at its mirror image (image) per unit panel unknown p, and stores in src the source-influence sums (src . V is the
  // potential of the sources of a unit freestream V). self: the panel whose control point P is (interior limit -1/2 of
  // the doublet value at the control point: Q_k(y_centroid) for a span-quadratic panel, mu_k for 0.3.1), or -1 for a
  // field point. assemble and fieldPotential both call this one function. B = null: the 0.3.1 constant row (the same
  // arithmetic as the 0.3.1 assembly loop) with the 0.3.1 / constant wake (addWakeRow).
  function addRow(B, W, S, px, py, pz, self, image, far2, target, offset, src) {
    if (B && B.kind === 'tensor-quadratic') return addRowTensor(B, W, S, px, py, pz, self, image, far2, target, offset, src);
    const n = S.count;
    let sx = 0, sy = 0, sz = 0;
    if (!B) {
      for (let k = 0; k < n; k++) {
        let s, d;
        if (k === self) { s = S.SELF[k]; d = -0.5; } else { influence(S, k, px, py, pz, far2); s = outS; d = outD; }
        let sMirror = 0;
        if (image) { influence(S, k, px, -py, pz, far2); d += outD; sMirror = outS; }
        target[offset + k] += d;
        const nx = S.PN[3 * k], ny = S.PN[3 * k + 1], nz = S.PN[3 * k + 2], st = s + sMirror;
        sx += st * nx; sz += st * nz; sy += (s - sMirror) * ny;
      }
      src[0] = sx; src[1] = sy; src[2] = sz;
      if (W) addWakeRow(W, px, py, pz, image, target, offset);
      return;
    }
    const M = B.scratchM, E = B.scratchE, D = B.data;
    M.fill(0); E.fill(0);
    for (let k = 0; k < n; k++) {
      let vx, vy, vz;
      if (k === self) {
        if (B.quad[k]) { const o = B.stride * k + SQ_CP; E[B.kL[k]] -= 0.5 * D[o]; M[k] -= 0.5 * D[o + 1]; E[B.kR[k]] -= 0.5 * D[o + 2]; vx = B.selfSourceVec[3 * k]; vy = B.selfSourceVec[3 * k + 1]; vz = B.selfSourceVec[3 * k + 2]; }
        else { M[k] -= 0.5; const s = S.SELF[k]; vx = s * S.PN[3 * k]; vy = s * S.PN[3 * k + 1]; vz = s * S.PN[3 * k + 2]; }
      } else { bodyPanel(B, S, k, px, py, pz, far2, M, E); vx = BPV[0]; vy = BPV[1]; vz = BPV[2]; }
      if (image) { bodyPanel(B, S, k, px, -py, pz, far2, M, E); vx += BPV[0]; vy -= BPV[1]; vz += BPV[2]; } // image triangles: normals (nx, -ny, nz)
      sx += vx; sy += vy; sz += vz;
    }
    if (W) {
      const ux = W.dir[0], uy = W.dir[1], uz = W.dir[2];
      for (let j = 0; j < W.count; j++) {
        const o = 3 * j, st = W.basis.strips[j];
        quadStrip(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3);
        if (image) { quadStrip(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3m); QS3[0] += QS3m[0]; QS3[1] += QS3m[1]; QS3[2] += QS3m[2]; }
        E[st.aUp] += QS3[0]; E[st.aLo] -= QS3[0]; M[st.up] += QS3[1]; M[st.lo] -= QS3[1]; E[st.bUp] += QS3[2]; E[st.bLo] -= QS3[2];
      }
    }
    for (let k = 0; k < n; k++) target[offset + k] += M[k];
    for (const ch of B.chains) { // knots -> panel unknowns: E . (T^-1 R mu) = (T^-1 E) . (R mu), T symmetric
      const s = ch.sys, z = s.z;
      let any = false; for (let k = 0; k < s.m; k++) { z[k] = E[ch.knots[k]]; if (z[k] !== 0) any = true; }
      if (!any) continue;
      s.solve(z);
      for (let k = 0; k < s.m; k++) { if (s.R0[k]) target[offset + ch.cells[(k - 1 + s.N) % s.N]] += s.R0[k] * z[k]; if (s.R1[k]) target[offset + ch.cells[k % s.N]] += s.R1[k] * z[k]; }
    }
    src[0] = sx; src[1] = sy; src[2] = sz;
  }
  // Perturbation potential per unit freestream at a field point P for one unit solution mu (freestream direction V):
  // the panel-matrix row a control point at P would receive (addRow, the same function), applied to mu, plus the source
  // part src . V. options: image (default true), farField (default DEFAULT_MESH.farField), self (default -1).
  function fieldPotential(S, body, wake, P, mu, V, options = {}) {
    const n = S.count, image = options.image !== false, ff = options.farField ?? DEFAULT_MESH.farField, far2 = ff === Infinity ? Infinity : ff * ff;
    const row = new Float64Array(n), src = new Float64Array(3);
    addRow(body || null, wake || null, S, P[0], P[1], P[2], options.self ?? -1, image, far2, row, 0, src);
    let phi = src[0] * V[0] + src[1] * V[1] + src[2] * V[2];
    for (let k = 0; k < n; k++) phi += row[k] * mu[k];
    return phi;
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
  // options.body: a span-quadratic basis (spanQuadBasis; its wake is options.wake with wake.basis); absent: the 0.3.1
  // constant-strength doublets and wake strips, assembled by the unchanged 0.3.1 loop below (bit-identical).
  function assemble(S, options = {}) {
    const n = S.count, image = !!options.image, far2 = (options.farField ?? DEFAULT_MESH.farField) ** 2;
    const bx = new Float64Array(n), by = new Float64Array(n), bz = new Float64Array(n);
    const W = options.wake || null;
    // the doublet model follows the wake: a wingMesh wake with a span-quadratic basis carries its body basis (wake.body)
    const B = basisFor(options.body || (W && W.basis ? W.body : null) || null, S);
    // options.work (a mesh sequence's scratch): the tensor rows overwrite every entry, so its matrix storage is reused
    // from mesh to mesh (no fresh 100 MB allocation per mesh); the other models get a new, zeroed matrix
    const work = B && B.kind === 'tensor-quadratic' ? options.work : null;
    let A;
    if (work && work.A && work.A.length >= n * n) A = work.A.subarray(0, n * n);
    else { A = new Float64Array(n * n); if (work) work.A = A; }
    if (B && B.kind === 'tensor-quadratic') { // four rows at a time: their transposed spline maps run side by side
      if (W && !W.basis) throw new Error('The tensor body needs its matched wake (wake.basis).');
      const LN = 4, src = new Float64Array(3 * LN), PL = new Float64Array(3 * LN), CL = new Float64Array(LN * B.nValues);
      let zmax = 0; for (const list of [B.spanChains, B.stationChains, B.stripChains]) for (const ch of list) zmax = Math.max(zmax, ch.sys.m);
      const Z = new Float64Array(LN * zmax);
      for (let i0 = 0; i0 < n; i0 += LN) {
        const lanes = Math.min(LN, n - i0);
        for (let q = 0; q < 3 * lanes; q++) PL[q] = S.PC[3 * i0 + q];
        rowValuesTensor(B, W, S, PL, i0, lanes, image, far2, CL, LN, src);
        for (let l = 0; l < lanes; l++) { bx[i0 + l] = src[3 * l]; by[i0 + l] = src[3 * l + 1]; bz[i0 + l] = src[3 * l + 2]; }
        tensorTransposeL(B, CL, Z);
        for (let l = 0; l < lanes; l++) { const row = (i0 + l) * n; for (let k = 0; k < n; k++) A[row + k] = CL[LN * k + l] + 0; } // + 0: as 0 + x (signed zeros)
        for (let k = 0; k < LN * n; k++) CL[k] = 0;
      }
      return { A, bx, by, bz };
    }
    if (B) {
      if (W && !W.basis) throw new Error('The span-quadratic body needs its matched wake (wake.basis).');
      const src = new Float64Array(3);
      for (let i = 0; i < n; i++) {
        addRow(B, W, S, S.PC[3 * i], S.PC[3 * i + 1], S.PC[3 * i + 2], i, image, far2, A, i * n, src);
        bx[i] = src[0]; by[i] = src[1]; bz[i] = src[2];
      }
      return { A, bx, by, bz };
    }
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
  // In-place LU solve of x[o .. o + m) with the factors and pivots of luFactor, two partial sums per dot product (no
  // allocation; used inside the preconditioner, where the summation order is free).
  function luSolveAt2(a, m, piv, x, o) {
    for (let k = 0; k < m; k++) { const p = piv[k]; if (p !== k) { const t = x[o + k]; x[o + k] = x[o + p]; x[o + p] = t; } }
    for (let i = 1; i < m; i++) { const ri = i * m; let s0 = 0, s1 = 0, j = 0; for (; j + 1 < i; j += 2) { s0 += a[ri + j] * x[o + j]; s1 += a[ri + j + 1] * x[o + j + 1]; } if (j < i) s0 += a[ri + j] * x[o + j]; x[o + i] -= s0 + s1; }
    for (let i = m - 1; i >= 0; i--) { const ri = i * m; let s0 = 0, s1 = 0, j = i + 1; for (; j + 1 < m; j += 2) { s0 += a[ri + j] * x[o + j]; s1 += a[ri + j + 1] * x[o + j + 1]; } if (j < m) s0 += a[ri + j] * x[o + j]; x[o + i] = (x[o + i] - (s0 + s1)) / a[ri + i]; }
  }
  // Strip block symmetric Gauss-Seidel: M = (D + L) D^-1 (D + U), D the strip diagonal blocks of A (the block-Jacobi
  // factorizations), L / U the blocks coupling neighbouring strips (blocks given in span order). Applying M^-1:
  // forward w_j = D_j^-1 (v_j - A_j,j-1 w_j-1), backward z_j = w_j - D_j^-1 (A_j,j+1 z_j+1). Used for the tensor model:
  // on the course wing 32 x 16 the eigenvalues of M^-1 A lie in [0.41, 1.29] (block-Jacobi: [0.18, 1.69]) and GMRES
  // needs 14 - 15 iterations instead of 26 (32 x 48: 24 instead of 39 - 41).
  function blockSGSPreconditioner(A, n, blocks) {
    const nb = blocks.length, F = [], Lb = [], Ub = [];
    const copy = (s, m, c, w) => { const M = new Float64Array(m * w); for (let i = 0; i < m; i++) for (let q = 0; q < w; q++) M[i * w + q] = A[(s + i) * n + c + q]; return M; };
    for (let j = 0; j < nb; j++) {
      const [s, m] = blocks[j], B = copy(s, m, s, m);
      F.push({ s, m, B, piv: luFactor(B, m) });
      Lb.push(j > 0 ? copy(s, m, blocks[j - 1][0], blocks[j - 1][1]) : null); // A_j,j-1
      Ub.push(j + 1 < nb ? copy(s, m, blocks[j + 1][0], blocks[j + 1][1]) : null); // A_j,j+1
    }
    const t = new Float64Array(Math.max(...blocks.map(b => b[1])));
    return (v, out) => {
      for (let j = 0; j < nb; j++) { // forward: w_j = D_j^-1 (v_j - A_j,j-1 w_j-1)
        const f = F[j], s = f.s, m = f.m;
        if (j === 0) for (let i = 0; i < m; i++) out[s + i] = v[s + i];
        else {
          const L = Lb[j], ps = F[j - 1].s, pm = F[j - 1].m;
          for (let i = 0; i < m; i++) { const r = i * pm; let a0 = 0, a1 = 0, q = 0; for (; q + 1 < pm; q += 2) { a0 += L[r + q] * out[ps + q]; a1 += L[r + q + 1] * out[ps + q + 1]; } if (q < pm) a0 += L[r + q] * out[ps + q]; out[s + i] = v[s + i] - (a0 + a1); }
        }
        luSolveAt2(f.B, m, f.piv, out, s);
      }
      for (let j = nb - 2; j >= 0; j--) { // backward: z_j = w_j - D_j^-1 (A_j,j+1 z_j+1)
        const f = F[j], s = f.s, m = f.m, U = Ub[j], us = F[j + 1].s, um = F[j + 1].m;
        for (let i = 0; i < m; i++) { const r = i * um; let a0 = 0, a1 = 0, q = 0; for (; q + 1 < um; q += 2) { a0 += U[r + q] * out[us + q]; a1 += U[r + q + 1] * out[us + q + 1]; } if (q < um) a0 += U[r + q] * out[us + q]; t[i] = a0 + a1; }
        luSolveAt2(f.B, m, f.piv, t, 0);
        for (let i = 0; i < m; i++) out[s + i] -= t[i];
      }
    };
  }
  // Restarted GMRES(m) with left preconditioning, written as a step generator: it yields each vector to be multiplied
  // by A and receives A v back (unpreconditioned). gmresMany runs several right-hand sides in lockstep and forms their
  // products in ONE pass over A (the dense matrix is streamed once per step instead of once per right-hand side); each
  // product is summed in the same order as a single product, so every solution is bit-identical to a separate solve.
  function* gmresSteps(n, b, precond, tol, m, maxIter) {
    const pb = new Float64Array(n); precond(Float64Array.from(b), pb);
    const bn = Math.sqrt(pb.reduce((s, v) => s + v * v, 0)) || 1;
    const x = new Float64Array(n), r = new Float64Array(n), w = new Float64Array(n), V = Array.from({ length: m + 1 }, () => new Float64Array(n));
    const H = Array.from({ length: m + 1 }, () => new Float64Array(m)), cs = new Float64Array(m), sn = new Float64Array(m), gg = new Float64Array(m + 1);
    let it = 0, rel = Infinity;
    while (it < maxIter) {
      precond(yield x, r); for (let i = 0; i < n; i++) r[i] = pb[i] - r[i];
      const beta = Math.sqrt(r.reduce((s, v) => s + v * v, 0)); rel = beta / bn;
      if (rel <= tol) break;
      for (let i = 0; i < n; i++) V[0][i] = r[i] / beta;
      gg.fill(0); gg[0] = beta;
      let j = 0;
      for (; j < m && it < maxIter; j++, it++) {
        precond(yield V[j], w);
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
  // out[c] = A v[c] for one or two vectors in one pass (per vector the summation order of a single product).
  function matVecMany(A, n, v, out) {
    if (v.length === 1) { const a = v[0], o = out[0]; for (let i = 0; i < n; i++) { let s = 0; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * a[k]; o[i] = s; } return; }
    for (let c = 0; c + 1 < v.length; c += 2) {
      const a = v[c], b = v[c + 1], oa = out[c], ob = out[c + 1];
      for (let i = 0; i < n; i++) { let s = 0, t = 0; const r = i * n; for (let k = 0; k < n; k++) { const e = A[r + k]; s += e * a[k]; t += e * b[k]; } oa[i] = s; ob[i] = t; }
    }
    if (v.length % 2) matVecMany(A, n, [v[v.length - 1]], [out[out.length - 1]]);
  }
  function gmresMany(A, n, bs, options = {}) {
    const tol = options.tol ?? 1e-12, m = Math.min(options.restart ?? 60, n), maxIter = options.maxIter ?? 400;
    const precond = options.precond || blockPreconditioner(A, n, options.blocks);
    const procs = bs.map(b => { const g = gmresSteps(n, b, precond, tol, m, maxIter); return { g, step: g.next(), tmp: new Float64Array(n) }; });
    for (;;) {
      const live = procs.filter(p => !p.step.done);
      if (!live.length) break;
      matVecMany(A, n, live.map(p => p.step.value), live.map(p => p.tmp));
      for (const p of live) p.step = p.g.next(p.tmp);
    }
    return procs.map(p => p.step.value);
  }
  function gmres(A, n, b, options = {}) { return gmresMany(A, n, [b], options)[0]; }
  // max_i |A x - b|_i / max |b| for one or more solutions (one pass over A; per solution the order of a single pass)
  function trueResiduals(A, n, xs, bs) {
    const k = xs.length, rmax = new Float64Array(k), bmax = new Float64Array(k);
    if (k === 2) {
      const x0 = xs[0], x1 = xs[1], b0 = bs[0], b1 = bs[1];
      for (let i = 0; i < n; i++) { let s0 = -b0[i], s1 = -b1[i]; const r = i * n; for (let q = 0; q < n; q++) { const e = A[r + q]; s0 += e * x0[q]; s1 += e * x1[q]; } rmax[0] = Math.max(rmax[0], Math.abs(s0)); rmax[1] = Math.max(rmax[1], Math.abs(s1)); bmax[0] = Math.max(bmax[0], Math.abs(b0[i])); bmax[1] = Math.max(bmax[1], Math.abs(b1[i])); }
      return [rmax[0] / Math.max(bmax[0], 1e-300), rmax[1] / Math.max(bmax[1], 1e-300)];
    }
    return xs.map((x, c) => trueResidual(A, n, x, bs[c]));
  }
  function trueResidual(A, n, x, b) {
    let rmax = 0, bmax = 0;
    for (let i = 0; i < n; i++) { let s = -b[i]; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * x[k]; rmax = Math.max(rmax, Math.abs(s)); bmax = Math.max(bmax, Math.abs(b[i])); }
    return rmax / Math.max(bmax, 1e-300);
  }
  // Solves for the doublet strengths of unit freestreams along x, z (and y without the image).
  // solver: 'auto' (LU up to luMaxPanels, GMRES above with LU fallback), 'lu' or 'gmres'. stripSweep: strip block
  // symmetric Gauss-Seidel instead of strip block-Jacobi (needs blocks).
  // Tensor model: dense LU only up to this many panels (LU costs 2/3 n^3: 0.3 s at 600 panels, against about 30 ms of
  // preconditioned GMRES); the 'constant' and 'span-quadratic' models keep 900 (0.3.1 and the earlier candidates).
  const TENSOR_LU_MAX = 300;
  function unitSolutions(S, options = {}) {
    const n = S.count, t0 = now(), sys = assemble(S, options), t1 = now();
    const rhs = [Float64Array.from(sys.bx, v => -v), Float64Array.from(sys.bz, v => -v), ...(options.image ? [] : [Float64Array.from(sys.by, v => -v)])];
    const mode = options.solver ?? 'auto', useGmres = mode === 'gmres' || (mode === 'auto' && n > (options.luMaxPanels ?? 900));
    let solutions = null, method = 'LU with partial pivoting', iterations = null, residual = 0;
    if (useGmres) {
      const sweep = !!(options.stripSweep && options.blocks && options.blocks.length > 1);
      const precond = (sweep ? blockSGSPreconditioner : blockPreconditioner)(sys.A, n, options.blocks);
      const out = gmresMany(sys.A, n, rhs, { ...options, precond }), res = trueResiduals(sys.A, n, out.map(o => o.x), rhs);
      if (res.every(r => r <= 1e-9)) { solutions = out.map(o => o.x); method = `restarted GMRES(60), ${options.blocks ? (sweep ? 'strip block symmetric Gauss-Seidel' : 'strip block-Jacobi') : 'Jacobi'} preconditioning`; iterations = out.map(o => o.iterations); residual = Math.max(...res); }
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
    // Doublet model: 'tensor-quadratic' (default since candidate 0.3.2-exp.3: wingTensorQuadBasis, tensorQuadWake),
    // 'span-quadratic' (0.3.2-exp.2: wingSpanQuadBasis, spanQuadWake) or 'constant' (the 0.3.1 constant-strength panels
    // and wake strips, bit-identical). A flat cap (diagnostic option) falls back to 'span-quadratic'.
    const doubletModel = m.doubletModel ?? (hasCap ? 'span-quadratic' : 'tensor-quadratic');
    if (!['tensor-quadratic', 'span-quadratic', 'constant'].includes(doubletModel)) throw new Error("Doublet model must be 'tensor-quadratic', 'span-quadratic' or 'constant'.");
    let body = null;
    if (doubletModel === 'span-quadratic') {
      body = wingSpanQuadBasis(S, { ni, ns, index, ys, hasCap });
      wake.basis = spanQuadWake(wake, body, S); wake.body = body; // the wake object fixes its model (assemble reads it)
    } else if (doubletModel === 'tensor-quadratic') {
      body = wingTensorQuadBasis(S, { ni, ns, index, ys, hasCap, closedTip: !!sections[ns].collapsed });
      wake.basis = tensorQuadWake(wake, body, S, { ni, index }); wake.body = body;
    }
    const blocks = Array.from({ length: ns }, (_, j) => [j * ni, ni]);
    if (hasCap) blocks.push([wingPanels, nHalf]);
    return { S, layout: { patches }, wake, body, doubletModel, ys, sections, nHalf, ni, ns, wingPanels, hasCap, closedTip: closed, roundedTip: rounding, blocks, options: { chordPanels: nHalf, spanPanels: m.spanPanels, spanSpacing: m.spanSpacing, farField: m.farField, tipClosure: m.tipClosure, kutta }, index };
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
    const key = JSON.stringify([GEOMETRY_KEYS.map(k => g[k] ?? null), mesh, options.sectionKey ?? null, options.solver ?? 'auto', options.wakeDirection ?? null, options.gradientScheme ?? 'unfolded', options.doubletModel ?? 'default']);
    const cache = options.cache;
    if (cache && cache.has(key)) { const hit = cache.get(key); hit.lastCacheHit = true; return hit; }
    const t0 = now(), wm = wingMesh(g, { ...mesh, sectionLoop: options.sectionLoop, wakeDirection: options.wakeDirection, doubletModel: options.doubletModel }, limits), t1 = now();
    options.progress?.(`Assembling ${wm.S.count} panels with the mirror image and ${wm.wake.count} wake strips...`);
    // the tensor model: strip block symmetric Gauss-Seidel, and GMRES (with its LU fallback) from TENSOR_LU_MAX panels
    const tensor = !!(wm.body && wm.body.kind === 'tensor-quadratic');
    const sol = unitSolutions(wm.S, { image: true, wake: wm.wake, body: wm.body, farField: mesh.farField, solver: options.solver, blocks: wm.blocks, ...(tensor ? { stripSweep: true, luMaxPanels: TENSOR_LU_MAX, work: options.work } : {}) });
    // Unit-freestream tangential velocities: V_t(a) = V (cos a Ux + sin a Uz).
    // options.gradientScheme: 'unfolded' (default) or 'legacy' (the previous straight-chord stencil, for comparison only)
    const gs = { scheme: options.gradientScheme ?? 'unfolded' };
    // the recovery samples the surface potential at the panel centroids: for span-quadratic panels the doublet value
    // there (controlPointValues: Q_k at the centroid's y), for constant panels the panel doublet itself (0.3.1)
    // a tensor body: the exterior velocity of the solved distribution on every triangle of the split (the jump relations,
    // tensorTriangleVelocity; gradientScheme ignored); Ux, Uz then hold its value at the control point (panel Cp) and
    // model.surface the per-triangle field that evaluate integrates exactly
    let Ux, Uz, surface = null;
    if (wm.body && wm.body.kind === 'tensor-quadratic') {
      const R = tensorTriangles(wm.body, wm.S), TUx = tensorTriangleVelocity(wm.body, wm.S, R, sol.mux, [1, 0, 0]), TUz = tensorTriangleVelocity(wm.body, wm.S, R, sol.muz, [0, 0, 1]);
      Ux = tensorControlPointVelocity(R, TUx); Uz = tensorControlPointVelocity(R, TUz); surface = { R, Ux: TUx, Uz: TUz, controlPoint: [Ux, Uz] };
    } else {
      const cpx = wm.body ? controlPointValues(wm.body, sol.mux) : sol.mux, cpz = wm.body ? controlPointValues(wm.body, sol.muz) : sol.muz;
      Ux = surfaceVelocity(wm.S, wm.layout, cpx, [1, 0, 0], gs); Uz = surfaceVelocity(wm.S, wm.layout, cpz, [0, 0, 1], gs);
    }
    const model = { version: VERSION, key, geometry: g, mesh, wm, sol, Ux, Uz, surface, refs: references(g), timing: { meshMs: t1 - t0, ...sol.timing }, lastCacheHit: false };
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

  // Trefftz plane of the span-quadratic wake: the trace (y, z) of every strip with its quadratic strength through s.atA,
  // s.gamma (mid-point), s.atB (per unit V, from wakeStrengths). Lift is the exact Kutta-Joukowski integral (Simpson,
  // exact for the quadratic); drag the midpoint rule on `refine` sub-segments per strip, the strength sampled from the
  // same quadratic (the reconstruction of trefftz(), now the solver's own wake).
  function trefftzQuadratic(W, s, refine = 16) {
    const m = W.count, fine = [], fineMu = []; let liftOverRhoV = 0;
    for (let j = 0; j < m; j++) {
      const a = [W.a[3 * j + 1], W.a[3 * j + 2]], b = [W.b[3 * j + 1], W.b[3 * j + 2]], mA = s.atA[j], mM = s.gamma[j], mB = s.atB[j];
      liftOverRhoV += 2 * (b[0] - a[0]) * (mA + 4 * mM + mB) / 6; // both halves
      if (!fine.length) fine.push(a);
      for (let r = 1; r <= refine; r++) {
        const t = r / refine, tm = t - 0.5 / refine; fine.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        fineMu.push(mA * (1 - tm) * (1 - 2 * tm) + 4 * mM * tm * (1 - tm) + mB * tm * (2 * tm - 1));
      }
    }
    const r = trefftzMidpoint(fine, fineMu);
    return { dragOverHalfRho: r.dragOverHalfRho, liftOverRhoV, normalwash: null, method: `span-quadratic wake strength (solver basis), ${refine} sub-segments per strip` };
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
    // the tensor model: Cp at the control point; force, moment about the centroid (couple) and the x-moment of the lift
    // (xLift: integral of x dF_z) are the exact integrals of the quadratic Cp = 1 - |v|^2 / V^2 of the linear velocity
    // over every triangle (tensorTriangleVelocity): with lambda_i the barycentric coordinates, v = sum v_i lambda_i and
    //   J_i = int Cp lambda_i dA = A / 3 - A [|v_i|^2 / 10 + (|v_a|^2 + |v_b|^2) / 30 + (v_i . v_a + v_i . v_b) / 15 + v_a . v_b / 30]
    // ({a, b} the other two vertices; int l_i^2 l_j = A / 30, int l_i^3 = A / 10, int l_0 l_1 l_2 = A / 60), the force
    // -q n_T sum J_i, the couple about the centroid C -q (sum J_i (X_i - C)) x n_T.
    // (a model whose Ux, Uz were replaced by another reconstruction is evaluated from those, panel-constant, as before)
    const surf = model.surface && model.surface.controlPoint[0] === model.Ux && model.surface.controlPoint[1] === model.Uz ? model.surface : null;
    const couple = surf ? new Float64Array(3 * n) : null, xLift = surf ? new Float64Array(n) : null;
    for (let k = 0; k < n; k++) {
      mu[k] = V * (ca * model.sol.mux[k] + sa * model.sol.muz[k]);
      const vx = ca * model.Ux[3 * k] + sa * model.Uz[3 * k], vy = ca * model.Ux[3 * k + 1] + sa * model.Uz[3 * k + 1], vz = ca * model.Ux[3 * k + 2] + sa * model.Uz[3 * k + 2];
      cp[k] = 1 - (vx * vx + vy * vy + vz * vz);
      if (k < wm.wingPanels) { maxCp = Math.max(maxCp, cp[k]); minCp = Math.min(minCp, cp[k]); }
      else { capMinCp = Math.min(capMinCp ?? Infinity, cp[k]); capMaxCp = Math.max(capMaxCp ?? -Infinity, cp[k]); }
      if (surf) {
        const R = surf.R, TX = surf.Ux, TZ = surf.Uz, X = R.X, Cx = S.PC[3 * k], Cy = S.PC[3 * k + 1], Cz = S.PC[3 * k + 2];
        let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0, xl = 0;
        for (let j = R.first[k]; j < R.first[k + 1]; j++) {
          const q = 9 * j, A = R.area[j];
          const ax = ca * TX[q] + sa * TZ[q], ay = ca * TX[q + 1] + sa * TZ[q + 1], az = ca * TX[q + 2] + sa * TZ[q + 2];
          const bx = ca * TX[q + 3] + sa * TZ[q + 3], by = ca * TX[q + 4] + sa * TZ[q + 4], bz = ca * TX[q + 5] + sa * TZ[q + 5];
          const cx = ca * TX[q + 6] + sa * TZ[q + 6], cy = ca * TX[q + 7] + sa * TZ[q + 7], cz = ca * TX[q + 8] + sa * TZ[q + 8];
          const w00 = ax * ax + ay * ay + az * az, w11 = bx * bx + by * by + bz * bz, w22 = cx * cx + cy * cy + cz * cz;
          const w01 = ax * bx + ay * by + az * bz, w12 = bx * cx + by * cy + bz * cz, w20 = cx * ax + cy * ay + cz * az;
          const J0 = A * (1 / 3 - (w00 / 10 + (w11 + w22) / 30 + (w01 + w20) / 15 + w12 / 30));
          const J1 = A * (1 / 3 - (w11 / 10 + (w00 + w22) / 30 + (w01 + w12) / 15 + w20 / 30));
          const J2 = A * (1 / 3 - (w22 / 10 + (w00 + w11) / 30 + (w12 + w20) / 15 + w01 / 30));
          const nx = R.N[3 * j], ny = R.N[3 * j + 1], nz = R.N[3 * j + 2], f = -qmm * (J0 + J1 + J2);
          fx += f * nx; fy += f * ny; fz += f * nz;
          // first moment of Cp about the centroid, sum J_i (X_i - C)
          const ex = J0 * (X[q] - Cx) + J1 * (X[q + 3] - Cx) + J2 * (X[q + 6] - Cx), ey = J0 * (X[q + 1] - Cy) + J1 * (X[q + 4] - Cy) + J2 * (X[q + 7] - Cy), ez = J0 * (X[q + 2] - Cz) + J1 * (X[q + 5] - Cz) + J2 * (X[q + 8] - Cz);
          mx -= qmm * (ey * nz - ez * ny); my -= qmm * (ez * nx - ex * nz); mz -= qmm * (ex * ny - ey * nx);
          xl -= qmm * nz * (J0 * X[q] + J1 * X[q + 3] + J2 * X[q + 6]);
        }
        force[3 * k] = fx; force[3 * k + 1] = fy; force[3 * k + 2] = fz; couple[3 * k] = mx; couple[3 * k + 1] = my; couple[3 * k + 2] = mz; xLift[k] = xl;
        continue;
      }
      const f = -cp[k] * qmm * S.PA[k];
      if (k < wm.wingPanels) { force[3 * k] = f * S.PN[3 * k]; force[3 * k + 1] = f * S.PN[3 * k + 1]; force[3 * k + 2] = f * S.PN[3 * k + 2]; }
      else for (let d = 0; d < 3; d++) capForce[d] += f * S.PN[3 * k + d];
    }
    if (surf && wm.wingPanels !== n) throw new Error('The tensor model has no cap panels.');
    // semi-wing resultants (right half, body axes): about the root origin and about the moment point
    const sum = (from, to, ref) => { const F = [0, 0, 0], M = [0, 0, 0]; for (let k = from; k < to; k++) { const fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - ref[0], ry = S.PC[3 * k + 1] - ref[1], rz = S.PC[3 * k + 2] - ref[2]; F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx; if (couple) { M[0] += couple[3 * k]; M[1] += couple[3 * k + 1]; M[2] += couple[3 * k + 2]; } } return { F, M }; };
    const origin = sum(0, n, [0, 0, 0]), atRef = sum(0, n, refs.momentPoint_mm);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const Sref = refs.area_mm2, liftFull = 2 * dot(origin.F, eL), dragFull = 2 * dot(origin.F, eD), pitchFull = 2 * atRef.M[1];
    const CL = liftFull / (qmm * Sref), CDp = dragFull / (qmm * Sref), Cm = pitchFull / (qmm * Sref * refs.mac_mm);
    // strips
    const strips = [], wakeMu = new Float64Array(wm.ns), trace = [], ws = wakeStrengths(wm.wake, mu, wm.body), tensorWake = !!(wm.wake.basis && wm.wake.basis.kind === 'tensor-quadratic');
    for (let j = 0; j < wm.ns; j++) trace.push([wm.wake.a[3 * j + 1], wm.wake.a[3 * j + 2]]);
    trace.push([wm.wake.b[3 * (wm.ns - 1) + 1], wm.wake.b[3 * (wm.ns - 1) + 2]]);
    let kuttaMax = 0, kuttaInterior = 0;
    for (let j = 0; j < wm.ns; j++) {
      const y0 = wm.ys[j], y1 = wm.ys[j + 1], ym = 0.5 * (y0 + y1), st = Geometry.stationAt(g, ym), chord = st.chord;
      const qc = Geometry.transformPoint(g, ym, [0.25 * chord, 0]);
      const F = [0, 0, 0], M = [0, 0, 0]; let Xz = 0;
      for (let i = 0; i < wm.ni; i++) {
        const k = wm.index(i, j), fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - qc[0], ry = S.PC[3 * k + 1] - qc[1], rz = S.PC[3 * k + 2] - qc[2];
        F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx;
        if (couple) { M[0] += couple[3 * k]; M[1] += couple[3 * k + 1]; M[2] += couple[3 * k + 2]; Xz += xLift[k]; } else Xz += fz * S.PC[3 * k];
      }
      if (tensorWake) wakeMu[j] = ws.gamma[j]; // the trailing-edge trace jump at the strip mid-point
      else { let g = 0; for (let q = 0; q < wm.wake.kuttaWidth; q++) g += wm.wake.kuttaWeights[q + wm.wake.kuttaWidth * j] * mu[wm.wake.kuttaPanels[q + wm.wake.kuttaWidth * j]]; wakeMu[j] = g; }
      const dCpTE = cp[wm.wake.upper[j]] - cp[wm.wake.lower[j]]; kuttaMax = Math.max(kuttaMax, Math.abs(dCpTE));
      if (y1 <= 0.9 * g.semiSpan) kuttaInterior = Math.max(kuttaInterior, Math.abs(dCpTE));
      const dy = y1 - y0, lift = dot(F, eL);
      strips.push({ y0, y1, yMid: ym, chord, force_N: F, momentAboutQuarterChord_Nmm: M, quarterChordPoint_mm: qc,
        cl: chord > 0 ? lift / (qmm * chord * dy) : 0, clKuttaJoukowski: chord > 0 ? 2 * wakeMu[j] / (V * chord) : 0,
        xCenterOfPressure_mm: Math.abs(F[2]) > 0 ? Xz / F[2] : null, gamma: wakeMu[j], trailingEdgeDeltaCp: dCpTE });
    }
    const tr = wm.wake.basis
      ? trefftzQuadratic(wm.wake, { gamma: Array.from(ws.gamma, v => v / V), atA: Array.from(ws.atA, v => v / V), atB: Array.from(ws.atB, v => v / V) })
      : trefftz(trace, Array.from(wakeMu, v => v / V));
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
      reference: refs, mesh: { panels: n, wingPanels: wm.wingPanels, tipCapPanels: n - wm.wingPanels, wakeStrips: wm.ns, chordPanelsPerSurface: wm.nHalf, spanStations: wm.ys.slice(), closedTip: wm.closedTip, roundedTip: wm.roundedTip, maxWarpRatio: S.maxWarpRatio, doubletModel: wm.doubletModel ?? 'constant', ...model.mesh },
      coefficients: { CL, CDpressure: CDp, CDiTrefftz: CDi, CLTrefftz: CLt, Cm, spanEfficiencyTrefftz: e },
      aircraft: { lift_N: liftFull, dragPressure_N: dragFull, dragInducedTrefftz_N: CDi * qmm * Sref, pitchingMomentAboutReference_Nmm: pitchFull },
      semiWing: { force_N: origin.F, momentAboutRootOrigin_Nmm: origin.M, momentAboutReference_Nmm: atRef.M,
        tipCap: wm.hasCap ? { integrated: false, unconvergedPressureForce_N: capForce, minCp: capMinCp, maxCp: capMaxCp } : null },
      strips, panels: { cp, mu, force_N: force, centroid_mm: S.PC, normal: S.PN, area_mm2: S.PA, count: n, wingPanels: wm.wingPanels, ...(couple ? { momentAboutCentroid_Nmm: couple } : {}) },
      diagnostics: { maxCp, minCp, tipCapMinCp: capMinCp, tipCapMaxCp: capMaxCp, trailingEdgeDeltaCpMax: kuttaMax, trailingEdgeDeltaCpInboard90: kuttaInterior, liftTrefftzRelativeDifference: dCL,
        wake: { model: ws.model, stripStrength: Array.from(ws.gamma), strengthAtInnerEdge: Array.from(ws.atA), strengthAtOuterEdge: Array.from(ws.atB) },
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
    const C = P.momentAboutCentroid_Nmm; // tensor model: the pressure couple of each panel about its centroid
    if (C) for (let k = 0; k < P.count; k++) for (let d = 0; d < 3; d++) M[d] += C[3 * k + d];
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
    const P = result.panels, ni = 2 * result.mesh.chordPanelsPerSurface, C = P.momentAboutCentroid_Nmm;
    return result.strips.map((st, j) => {
      const w = [st.y0, st.y1, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < ni; i++) {
        const k = j * ni + i, fx = P.force_N[3 * k], fy = P.force_N[3 * k + 1], fz = P.force_N[3 * k + 2], x = P.centroid_mm[3 * k], y = P.centroid_mm[3 * k + 1], z = P.centroid_mm[3 * k + 2];
        w[2] += fx; w[3] += fy; w[4] += fz; w[5] += y * fz - z * fy; w[6] += z * fx - x * fz; w[7] += x * fy - y * fx;
        if (C) { w[5] += C[3 * k]; w[6] += C[3 * k + 1]; w[7] += C[3 * k + 2]; } // tensor model: the panel's pressure couple
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
      if(Geometry.closedTip(g)){
        const norms=adaptiveIntegral(y=>{const c=Geometry.chordAt(g,y);return [c,c*c];},y0,y1);
        const density=F.map(v=>v/norms[0]),R=adaptiveIntegral(y=>loadLinePoint(g,y,fraction).map(v=>v*Geometry.chordAt(g,y)),y0,y1),arm=cross3(R,density);
        return {y0,y1,F,M,f:density,m:M.map((v,d)=>(v-arm[d])/norms[1]),geometricTaper:true,norms};
      }
      return { y0, y1, F, M, f, m: M.map((v, d) => (v - c[d]) / h) };
    });
  }
  // Wrench [F; M about the origin] of the load-line part beyond y* of a strip representation (exact for it).
  function outboardOfStation(g, rep, ystar, fraction = LOAD_LINE_FRACTION) {
    const W = [0, 0, 0, 0, 0, 0];
    for (const s of rep) {
      if (s.y1 <= ystar) continue;
      if (s.y0 >= ystar) { for (let d = 0; d < 3; d++) { W[d] += s.F[d]; W[3 + d] += s.M[d]; } continue; }
      if(s.geometricTaper){
        const n=adaptiveIntegral(y=>{const c=Geometry.chordAt(g,y);return [c,c*c];},ystar,s.y1);
        const R=adaptiveIntegral(y=>loadLinePoint(g,y,fraction).map(v=>v*Geometry.chordAt(g,y)),ystar,s.y1),arm=cross3(R,s.f);
        for(let d=0;d<3;d++){W[d]+=s.f[d]*n[0];W[3+d]+=arm[d]+s.m[d]*n[1];}
        continue;
      }
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
  // chordwise mesh (7 solves; the base mesh is shared), plus ONE mesh refined in both directions (the joint mesh;
  // 8 solves). Each direction has four levels with 1/n proportional to 6 : 4 : 3 : 2. The delivered load is the
  // Richardson extrapolation of the quadratic polynomial in 1/n through the three finest levels of each
  // direction, combined additively, plus the cross term:
  //   Q_ext = Q_chord(1/c -> 0) + Q_span(1/s -> 0) - Q(base) + X,   X = f D,
  //   D = Q(cJ, sJ) - Q(cJ, sb) - Q(cb, sJ) + Q(cb, sb),   f = (1/cb)(1/sb) / ((1/cJ - 1/cb)(1/sJ - 1/sb)).
  // The additive combination alone is exact only for a separable error E(c, s) = A(c) + B(s); with a cross term
  // E = A + B + k / (c s) it misses -k / (cb sb), which f D restores exactly. Measured on the rectangular NACA 0012
  // AR 6 wing (4 x 5 joint grid, 32 to 96 chordwise x 16 to 64 strips; 6e30853): every coefficient has this
  // bilinear cross term, with k constant to within 30 % (CDi: 4 %) over nine joint meshes beyond the coarsest
  // levels; uncorrected it biased CDi by +2.3e-6 (40 % of U) and Cm by -1.9e-5 (more than U). The joint mesh is
  // taken from the finer levels: Standard 48 x 24 panels (24 per surface, 24 strips; f = -9), Fine 96 x 24
  // (48 per surface, 24 strips; f = 9); levels coarser than that are not yet bilinear.
  // The same fixed level weights apply to every quantity, so the extrapolated strip loads, their resultants and
  // the cut loads are one consistent, exactly conservative load set. The uncertainty of Q_ext is
  //   U = Fs * ( sum over the two directions of max( spread + stability, kappa * |correction| ) + kappa * |X| ),
  // spread = largest difference between the linear (two finest), quadratic (three finest) and observed-order
  // (Celik et al. 2008, order bounded to [0.5, 2]) extrapolations, stability = change of the quadratic
  // extrapolation when the three coarser levels are used instead, correction = quadratic extrapolation minus the
  // finest level (what the extrapolation added), Fs = 1.25, kappa = 0.5. The correction terms keep U from
  // claiming that an extrapolation removed more than half of its own correction when the levels agree with each
  // other but are not yet asymptotic (the spanwise observed order still falls from about 0.9 to 0.7 between 32
  // and 96 strips); kappa |X| does the same for the cross term (its coefficient k varies by up to 30 % between
  // joint meshes). A sequence stored without the joint mesh (a study file written before the joint mesh existed)
  // is combined additively without X, as it was when it was written (crossTerm.estimated false).
  // Validated against far finer reference meshes (validation/reference_study.mjs) in test_wing_aero_admission.mjs
  // and the documentation.
  const SEQUENCES = Object.freeze({
    standard: Object.freeze({ label: 'Standard', chord: Object.freeze([16, 24, 32, 48]), span: Object.freeze([8, 12, 16, 24]), baseChord: 32, baseSpan: 16, joint: Object.freeze([24, 24]) }),
    fine: Object.freeze({ label: 'Fine', chord: Object.freeze([32, 48, 64, 96]), span: Object.freeze([16, 24, 32, 48]), baseChord: 32, baseSpan: 16, joint: Object.freeze([48, 24]) }),
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
  // joint = false: the seven meshes of a sequence stored before the joint mesh existed (additive combination only)
  function sequenceMeshes(name, joint = true) {
    const d = sequenceDefinition(name), list = [], add = (c, s) => { if (!list.some(m => m.chordPanels === c && m.spanPanels === s)) list.push({ chordPanels: c, spanPanels: s }); };
    d.chord.forEach(c => add(c, d.baseSpan)); d.span.forEach(s => add(d.baseChord, s));
    if (joint) add(d.joint[0], d.joint[1]);
    return list;
  }
  // factor f of the cross-term estimate X = f D (exact for a k / (c s) cross term)
  function crossFactor(d) { const [cJ, sJ] = d.joint; return (1 / d.baseChord) * (1 / d.baseSpan) / ((1 / cJ - 1 / d.baseChord) * (1 / sJ - 1 / d.baseSpan)); }
  // does a stored sequence carry its joint mesh?
  function sequenceHasJoint(seq) { const d = sequenceDefinition(seq?.sequence); return (seq.levels || []).some(l => l && l.chordPanels === d.joint[0] && l.spanPanels === d.joint[1]); }
  // Lagrange weights of the polynomial through (h_i, Q_i) evaluated at h = 0.
  const lagrangeWeights0 = h => h.map((hi, i) => h.reduce((w, hj, j) => (j === i ? w : w * (0 - hj) / (hi - hj)), 1));
  function sequenceWeights(name, joint = true) {
    const d = sequenceDefinition(name), w = new Map(), add = (c, s, v) => { const k = c + 'x' + s; w.set(k, (w.get(k) || 0) + v); };
    const three = a => a.slice(a.length - 3), wc = lagrangeWeights0(three(d.chord).map(v => 1 / v)), ws = lagrangeWeights0(three(d.span).map(v => 1 / v));
    three(d.chord).forEach((c, i) => add(c, d.baseSpan, wc[i])); three(d.span).forEach((s, i) => add(d.baseChord, s, ws[i])); add(d.baseChord, d.baseSpan, -1);
    if (joint) { const f = crossFactor(d), [cJ, sJ] = d.joint; add(cJ, sJ, f); add(cJ, d.baseSpan, -f); add(d.baseChord, sJ, -f); add(d.baseChord, d.baseSpan, f); }
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
  function sequenceEstimate(name, levelValue, settings = ADMISSION, joint = true) {
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
    let cross = null;
    if (joint) {
      const [cJ, sJ] = d.joint, f = crossFactor(d), D = levelValue(cJ, sJ) - levelValue(cJ, d.baseSpan) - levelValue(d.baseChord, sJ) + base, X = f * D;
      cross = { mesh: [cJ, sJ], factor: f, difference: D, value: X, term: (settings.correctionFraction ?? ADMISSION.correctionFraction) * Math.abs(X) };
    }
    return { value: chord.quadratic + span.quadratic - base + (cross ? cross.value : 0), uncertainty: settings.safetyFactor * (chord.term + span.term + (cross ? cross.term : 0)),
      base, finest: chord.finest + span.finest - base, chord, span, cross };
  }
  // Runs every mesh of a sequence (Worker or Node). Models are cached by geometry and mesh, so a new angle of
  // attack or speed on the same wing costs only the surface evaluations. options: cache, progress(text),
  // targetLift_N (trims alpha so the EXTRAPOLATED pressure lift of both halves equals it), tipClosure, solver.
  function runSequence(rawGeometry, rawFlow = {}, name = 'standard', options = {}) {
    const def = sequenceDefinition(name), meshes = sequenceMeshes(name), cache = options.cache || new Map(), t0 = now();
    const tipClosure = options.tipClosure ?? DEFAULT_MESH.tipClosure, work = {}; // work: matrix storage shared by the meshes
    const models = meshes.map((m, i) => {
      options.progress?.(`Mesh ${i + 1} of ${meshes.length}: ${2 * m.chordPanels} × ${m.spanPanels} panels (around × spanwise)…`);
      return prepare(rawGeometry, { ...m, tipClosure }, { cache, solver: options.solver, referenceLimits: options.referenceLimits, work });
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
    return { version: VERSION, kind: 'meshSequence', sequence: name, label: def.label, definition: { chord: def.chord.slice(), span: def.span.slice(), baseChord: def.baseChord, baseSpan: def.baseSpan, joint: def.joint.slice() },
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
    // a flat tip cap closes the potential solution but its pressure is not integrated (non-convergent edge singularity),
    // so such a load would omit the tip side force: only the rounded tip (the default) is delivered to the structure
    if (seq?.tipClosure === 'flat' || (seq?.levels || []).some(l => l && l.tipCap)) throw new Error('A flat tip cap leaves its pressure out of the load, so this sequence cannot be applied to the structure: use the rounded tip (the default).');
    const find = (c, s) => { const l = (seq.levels || []).find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`The mesh sequence has no ${2 * c} × ${s} level.`); return l; };
    const joint = sequenceHasJoint(seq);
    for (const m of sequenceMeshes(seq.sequence, joint)) checkRows(find(m.chordPanels, m.spanPanels).strips, L, `Level ${2 * m.chordPanels} × ${m.spanPanels}`);
    const weights = sequenceWeights(seq.sequence, joint), cum = weights.map(w => ({ w: w.weight, f: cumulativeWrench(find(w.chordPanels, w.spanPanels).strips) }));
    const finest = find(def.baseChord, def.span[def.span.length - 1]), nodes = deliveryStations(finest.strips, finest.roundedTip, L, options.snapStations || []);
    const C = y => { const W = [0, 0, 0, 0, 0, 0]; for (const { w, f } of cum) { const v = f.at(y); for (let d = 0; d < 6; d++) W[d] += w * v[d]; } return W; };
    const values = nodes.map(C); values[values.length - 1] = [0, 0, 0, 0, 0, 0];
    const strips = nodes.slice(0, -1).map((y0, i) => [y0, nodes[i + 1], ...values[i].map((v, d) => v - values[i + 1][d])]);
    const est = f => sequenceEstimate(seq.sequence, (c, s) => f(find(c, s)), ADMISSION, joint);
    const coefficients = { CL: est(l => l.coefficients.CL), CLTrefftz: est(l => l.coefficients.CLTrefftz), CDpressure: est(l => l.coefficients.CDpressure), CDiTrefftz: est(l => l.coefficients.CDiTrefftz), Cm: est(l => l.coefficients.Cm) };
    const rootWrench = [0, 1, 2, 3, 4, 5].map(d => est(l => l.strips.reduce((t, r) => t + r[2 + d], 0)));
    const lift = { pressure: coefficients.CL.value, trefftz: coefficients.CLTrefftz.value, relativeDifference: Math.abs(coefficients.CL.value - coefficients.CLTrefftz.value) / Math.max(Math.abs(coefficients.CL.value), ADMISSION.liftConsistencyFloorCL) };
    const drag = { pressure: coefficients.CDpressure.value, trefftz: coefficients.CDiTrefftz.value, difference: coefficients.CDpressure.value - coefficients.CDiTrefftz.value, combinedUncertainty: coefficients.CDpressure.uncertainty + coefficients.CDiTrefftz.uncertainty };
    const crossTerm = joint ? { estimated: true, mesh: def.joint.slice(), factor: crossFactor(def) } : { estimated: false, mesh: null, factor: 0, note: 'stored sequence without the joint mesh: combined additively, cross term not estimated' };
    return { version: VERSION, kind: 'aeroStrips', sequence: seq.sequence, lineFraction: LOAD_LINE_FRACTION, strips, stations: nodes, weights, crossTerm, coefficients, rootWrench,closedTip:Geometry.closedTip(g),reconstruction:Geometry.closedTip(g)?'Force density proportional to actual chord; residual couple density proportional to chord squared; six source-strip resultants preserved':'Uniform force plus restoring couple',
      deliveredRootWrench: strips.reduce((W, r) => W.map((v, d) => v + r[2 + d]), [0, 0, 0, 0, 0, 0]), consistency: { lift, drag } };
  }
  // Admission of a combined load against the structural axis. cuts: [{ y, reference: [x, y, z], normal: [..],
  // root: true for the root (all loads, no plane), structuralTorque (optional, the engine's own cut torque of the
  // delivered load, used as a transfer check) }]. options.torsion (optional, from the structural result):
  // { cuts: [cut at k L / n, k = 0 .. n - 1, root first], elements: [{ y0, y1, k }] (twist per unit torque per unit
  // projected span), twist: { y: [...], theta: [...] } (rad, the coupled solution) }. Returns rows, the twist claim and
  // an overall decision; it never changes the load.
  function closedTipSectionAdmission(g,seq,combined,cuts,set){
    const L=g.semiSpan,joint=sequenceHasJoint(seq),rep=stripRepresentation(g,combined.strips,combined.lineFraction),memo=new Map();
    const level=(c,s)=>{const key=c+'x'+s;if(!memo.has(key)){const l=seq.levels.find(v=>v.chordPanels===c&&v.spanPanels===s);if(!l)throw Error('Missing aerodynamic mesh '+key);memo.set(key,stripRepresentation(g,l.strips,combined.lineFraction));}return memo.get(key);};
    const about=(W,P)=>[...W.slice(0,3),W[3]-(P[1]*W[2]-P[2]*W[1]),W[4]-(P[2]*W[0]-P[0]*W[2]),W[5]-(P[0]*W[1]-P[1]*W[0])];
    const rows=[];
    for(const cut of cuts){
      const y=cut.root?0:cut.y,P=cut.reference,W=about(outboardOfStation(g,rep,y,combined.lineFraction),P);
      const estimates=Array.from({length:6},(_,d)=>sequenceEstimate(seq.sequence,(c,s)=>about(outboardOfStation(g,level(c,s),y,combined.lineFraction),P)[d],set,joint));
      const U=estimates.map((e,d)=>e.uncertainty+Math.abs(e.value-W[d]));
      for(const[k,label,ids,tol]of [['force','Force',[0,1,2],set.forceTolerance],['bending','Bending moment',[3,5],set.bendingTolerance]]){
        const value=Math.hypot(...ids.map(d=>W[d])),uncertainty=Math.hypot(...ids.map(d=>U[d])),relative=value?uncertainty/value:uncertainty===0?0:Infinity;
        rows.push({kind:k,label:(cut.root?'Root':Math.round(100*y/L)+'% span')+' '+label,y,value,uncertainty,relative,measure:relative,tolerance:tol,resolved:relative<=tol,admitted:relative<=tol,estimate:ids.map(d=>estimates[d])});
      }
      if(cut.structuralWrench){
        const SW=[...cut.structuralWrench.force,...cut.structuralWrench.moment],res=Math.max(...W.map((v,d)=>Math.abs(v-SW[d])/Math.max(1,Math.abs(v))));
        rows.push({kind:'transfer',label:(cut.root?'Root':Math.round(100*y/L)+'% span')+' six-component transfer',value:res,uncertainty:0,relative:res,measure:res,tolerance:1e-7,resolved:res<=1e-7,admitted:res<=1e-7});
      }
    }
    const lc=combined.consistency.lift;
    rows.push({kind:'liftConsistency',label:'Lift: pressure vs Trefftz plane',value:lc.pressure,reference:lc.trefftz,measure:lc.relativeDifference,relative:lc.relativeDifference,tolerance:set.liftConsistencyTolerance,resolved:lc.relativeDifference<=set.liftConsistencyTolerance,admitted:lc.relativeDifference<=set.liftConsistencyTolerance});
    const failed=rows.filter(r=>!r.admitted).map(r=>r.label);
    return {version:VERSION,sequence:seq.sequence,mode:'closed-tip-rigid-load-sectional-response',admitted:!failed.length,rows,failed,settings:set,twist:null,crossTerm:{estimated:joint},claims:{torque:'withheld',twist:'withheld',normalStress:'nominal-section',displacement:'pure-bending-components',aeroelastic:'not assessed'},drag:combined.consistency.drag,
      notes:['Rigid-wing pressures are treated as prescribed loads for a sectional structural study. Admission here assesses numerical load transfer, not strength or full motion. This is not a full aeroelastic admission.','Actual zero tip chord is retained. Force density follows chord and residual free-couple density follows chord squared, conserving all source-strip forces and moments. Local recovery remains a sub-strip projection.','Torsion, shear-centre torque, shear deformation and local 3-D concentrations are not resolved. A delta may have finite formal bending translation and an unbounded tip slope; this does not establish small-rotation validity near the apex. Large inboard rotations require a nonlinear model. Exact-apex stress is undefined.'],
      method:'Six-component conservative geometric projection; force and bending uncertainty at the root and 25/50/75% span <=5%, pressure/Trefftz lift agreement <=2%, exact transfer checked independently against the structural cuts. No torsional or aeroelastic claim.'};
  }
  function admission(rawGeometry, seq, combined, cuts, options = {}) {
    const g = aeroGeometry(rawGeometry), L = g.semiSpan, set = { ...ADMISSION, ...(options.settings || {}) };
    sequenceDefinition(seq.sequence);
    if (!combined || combined.sequence !== seq.sequence) throw new Error('Combine this mesh sequence before the admission test.');
    if (!Array.isArray(cuts) || !cuts.length || !cuts[0].root) throw new Error('The admission test needs the structural root cut first.');
    if(Geometry.closedTip(g)){
      if(options.sectionOnly!==true)throw Error('Exact-tip structural response requires the explicitly scoped normal-section/bending assessment, not spatial-beam torsional admission.');
      return closedTipSectionAdmission(g,seq,combined,cuts,set);
    }
    const joint = sequenceHasJoint(seq), q = seq.flow.dynamicPressure_Pa * 1e-6, refs = seq.reference, weighted = sequenceWeights(seq.sequence, joint);
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
      const torque = w => dot3(w.M, n), est = sequenceEstimate(seq.sequence, (c, s) => torque(levelW(c, s)), set, joint);
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
          const v = fn(t.dw), est = [0, 1, 2].map(d => sequenceEstimate(seq.sequence, (c, s) => fn(t.levelW(c, s))[d], set, joint));
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
    if (!joint) notes.push('This load was stored with the seven meshes of an earlier version (no mesh refined in both directions): it is combined additively under the earlier separable rule; the cross term is not estimated and U does not contain it.');
    return { version: VERSION, sequence: seq.sequence, admitted: failed.length === 0, rows, failed: failed.map(r => r.label), settings: set, twist, notes, crossTerm: { estimated: joint },
      claims: { torque: torqueResolved ? 'shown' : 'withheld', twist: twist ? (twist.status === 'resolved' ? 'shown' : 'withheld') : (torqueResolved ? 'not assessed' : 'withheld') },
      drag: combined.consistency.drag,
      method: (joint ? 'Richardson extrapolation of a chordwise and a spanwise four-level refinement sequence (quadratic in 1/n through the three finest levels, combined additively) plus the cross term X = f D from one mesh refined in both directions (exact for a k / (c s) cross term); U = 1.25 x (sum over the two directions of max(spread of the linear, quadratic and observed-order extrapolations + one-level stability, 0.5 x |extrapolation correction|) + 0.5 x |X|).' : 'Richardson extrapolation of a chordwise and a spanwise four-level refinement sequence (quadratic in 1/n through the three finest levels, combined additively; stored sequence without the joint mesh, so the cross term is not estimated); U = 1.25 x sum over the two directions of max(spread of the linear, quadratic and observed-order extrapolations + one-level stability, 0.5 x |extrapolation correction|).') + ' Torque resolved only if U <= 10% of |T| and the weighted meshes agree in sign (no absolute floor). Twist from the structure\'s torsional compliance: resolved (shown) if every torque is resolved and the twist bound is within 10% of the twist; otherwise withheld and admitted only if the bound would change the lift by at most 1% (thin-airfoil lift slope), else the coupled result is withheld. One-way coupling: the computed twist may change the lift by at most 2%.' };
  }

  return Object.freeze({ VERSION, SCOPE, LIMITS, DEFAULT_FLOW, DEFAULT_MESH, triAngle, semiInfiniteAngle, buildSurface, sourceLocal,
    spanQuadBasis, wingSpanQuadBasis, spanQuadWake, knotValues, controlPointValues, wakeStrengths, trefftzQuadratic, fieldPotential, chainSystem,
    tensorQuadBasis, wingTensorTopology, wingTensorQuadBasis, tensorQuadWake, tensorValues, surfaceVelocityTensor, tensorTriangles, tensorTriangleVelocity, tensorControlPointVelocity,
    tensorPanel: (B, S, k, P, far = Infinity) => { const C = new Float64Array(B.nValues); const s = tensorPanel(B, S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far, C); const c9 = Array.from({ length: 9 }, (_, q) => B.refs[9 * k + q] >= 0 ? C[B.refs[9 * k + q]] : 0); return { source: s, sourceVector: [TPV[0], TPV[1], TPV[2]], coefficients: C, slots: c9 }; },
    // the far-field coefficients of panel k's nine slots at P by the path the assembly uses (planar: second order)
    tensorFar: (B, S, k, P, order = 2) => { const n = S.count; B.rowFarC.fill(0); B.rowFarK.fill(0); farAccumulate(B, S, k, P[0], P[1], P[2], order); B.rowOrder.fill(0); const out = new Float64Array(9), D = B.data;
      if (B.planar[k]) { const o = 15 * k; for (let q = 0; q < 9; q++) { let v = 0; for (let c = 0; c < 15; c++) v += B.farW[135 * k + 9 * c + q] * B.rowFarC[o + c]; out[q] = v; } }
      else { const o = 10 * k; for (let q = 0; q < 9; q++) { const f = B.stride * k + TQ_FAR + 10 * q; let v = 0; for (let c = 0; c < 10; c++) v += D[f + c] * B.rowFarK[o + c]; out[q] = v; } }
      B.rowFarC.fill(0); B.rowFarK.fill(0); return { slots: Array.from(out), sourceVector: [TPV[0], TPV[1], TPV[2]], planar: !!B.planar[k] }; },
    // a non-planar panel's far field by the path the assembly uses inside 24 diameters (per triangle; order 1, 2 or 4
    // forced on every triangle), and the first-order expansion about its centroid that the assembly uses beyond
    tensorFarTriangles: (B, S, k, P, order = 2) => { if (B.planar[k]) throw new Error('tensorFarTriangles: panel ' + k + ' is planar.');
      rowThresholds(B, S, DEFAULT_MESH.farField ** 2); const jb = B.tri.base[k], je = jb + B.tri.cnt[k], CV = new Float64Array(9);
      triangleEval(B, k, jb, je, P[0], P[1], P[2], order); triangleCoefficients(B, jb, je, CV);
      return { slots: Array.from(CV), sourceVector: [TPV[0], TPV[1], TPV[2]], triangles: je - jb }; },
    tensorSlots: (B, k) => { const D = B.data, o = B.stride * k, mode = D[o + 23], nodes = []; for (let q = 0; q < TQ_NN[mode]; q++) { const no = o + TQ_NODE + 10 * q; nodes.push({ slot: D[no], weights: Array.from(D.subarray(no + 1, no + 10)) }); }
      const tris = []; for (let t = 0; t < TQ_NT[mode]; t++) { const to = o + TQ_TRI + TQ_TRISZ * t; tris.push({ valid: !!D[to], points: [0, 1, 2].map(i => { const p = TQ_TV[mode][3 * t + i]; return [D[o + 3 * p], D[o + 3 * p + 1], D[o + 3 * p + 2]]; }), nodes: Array.from(D.subarray(to + 46, to + 52)) }); }
      return { mode, split: B.split[k], nodes, tris, refs: Array.from(B.refs.subarray(9 * k, 9 * k + 9)), cpWeights: Array.from(D.subarray(o + TQ_CPW, o + TQ_CPW + 9)) }; },
    quadStrip: (P, A, u, B) => { const o = new Float64Array(3); quadStrip(P[0], P[1], P[2], A[0], A[1], A[2], u[0], u[1], u[2], B[0], B[1], B[2], o); return Array.from(o); },
    spanQuadPanel: (B, S, k, P, far = Infinity) => { const M = new Float64Array(S.count), E = new Float64Array(B.knotCount); const s = bodyPanel(B, S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far, M, E); return { source: s, sourceVector: [BPV[0], BPV[1], BPV[2]], left: E[B.kL[k]], mid: M[k], right: E[B.kR[k]] }; },
    addRow: (B, W, S, P, self = -1, image = false, far = Infinity) => { const target = new Float64Array(S.count), src = new Float64Array(3); addRow(B, W, S, P[0], P[1], P[2], self, image, far === Infinity ? Infinity : far * far, target, 0, src); return { row: target, source: Array.from(src) }; },
    geometryKey, influence: (S, k, P, far = Infinity) => { influence(S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far); return { source: outS, doublet: outD }; },
    assemble, unitSolutions, luFactor, luSolve, gmres, surfaceVelocity, aeroGeometry, sectionLoop, spanStations, wingMesh, references, trefftz, trefftzMidpoint,
    normalizeFlow, normalizeMesh, prepare, evaluate, solve, alphaForLift, stripChordwiseCp, compactResult, resultantOfPanels,
    LOAD_LINE_FRACTION, SEQUENCES, ADMISSION, loadLinePoint, lineIntegral, stripWrenches, stripRepresentation, outboardOfStation, pchip, cumulativeWrench,
    sequenceMeshes, sequenceWeights, crossFactor, sequenceHasJoint, observedOrder, sequenceEstimate, runSequence, deliveryStations, combineSequence, admission });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroPanel;
