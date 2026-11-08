// MIE 446 Optimization Lab: ground-structure topology optimization of 2D trusses.
// Pure ES module, no DOM access. Units: mm, N, MPa (N/mm^2), g/cm^3, mass in g, compliance in N mm.
//
// Two deterministic optimizers work on the same ground structure (dense set of candidate bars):
//   1. optimality criteria (OC) for minimum compliance at a fixed volume (Bendsoe and Sigmund 2003),
//   2. minimum-volume plastic design as a linear program (Dorn, Gomory and Greenberg 1964),
//      solved by a dense two-phase simplex with Bland's rule.
// Every layout shown to a student is rebuilt from the kept members and re-solved exactly with the
// direct stiffness method (verifyLayout). Nothing here is a certified strength statement.

import { MATERIALS } from '../shared/presets.js';

export const VERSION = '0.1.1';

export const SUPPORT_PRESETS = {
  cantilever: {
    name: 'Cantilever: all left-column nodes pinned',
    short: 'cantilever',
    describe: 'Every node of the left column is pinned (x and y fixed). Default load at the right column, mid-height, downward.',
  },
  simply: {
    name: 'Simply supported: bottom-left pin, bottom-right roller',
    short: 'simply supported',
    describe: 'Bottom-left node pinned, bottom-right node on a roller (y fixed, x free). Default load at the bottom midspan node, downward.',
  },
  mbb: {
    name: 'MBB half beam: left column symmetry rollers, bottom-right pin',
    short: 'MBB half beam',
    describe: 'Left column nodes are rollers that fix x (symmetry plane of the full beam), bottom-right node pinned. Default load at the top-left node, downward.',
  },
};

export const DEFAULTS = Object.freeze({
  W: 3000, H: 1500, nx: 7, ny: 4, r: 2, support: 'cantilever',
  loadIx: null, loadIy: null, P: 10000, angleDeg: -90,
  material: 'al6061', sigmaT: null, sigmaC: null,
  Aref: 20, volfrac: 0.2, aminFrac: 1e-4, theta: 0.02,
  oc: Object.freeze({ maxIter: 200, tol: 1e-3, move: 0.2, eta: 0.5 }),
  lp: Object.freeze({ rule: 'auto', maxPivots: 0 }),
});

export const LIMITS = Object.freeze({ nx: [3, 10], ny: [2, 6], r: [1, 3] });

const UTIL_ACTIVE = 0.98;        // a member with U >= 0.98 is reported as "at or near the allowable"
const FEAS_TOL = 1e-6;           // utilization tolerance for the feasibility badge

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------------------------

export function defaultLoadNode(support, nx, ny) {
  if (support === 'simply') return { ix: Math.floor((nx - 1) / 2), iy: 0 };
  if (support === 'mbb') return { ix: 0, iy: ny - 1 };
  return { ix: nx - 1, iy: Math.floor((ny - 1) / 2) };
}

const NUMERIC_KEYS = ['W', 'H', 'nx', 'ny', 'r', 'loadIx', 'loadIy', 'P', 'angleDeg', 'sigmaT', 'sigmaC', 'Aref', 'volfrac', 'aminFrac', 'theta'];

export function normalizeParams(raw = {}) {
  const p = Object.assign({}, DEFAULTS, raw);
  p.oc = Object.assign({}, DEFAULTS.oc, raw.oc || {});
  p.lp = Object.assign({}, DEFAULTS.lp, raw.lp || {});
  for (const k of NUMERIC_KEYS) {
    if (p[k] === null || p[k] === undefined || p[k] === '') { p[k] = null; continue; }
    p[k] = Number(p[k]);
  }
  for (const k of ['maxIter', 'tol', 'move', 'eta']) p.oc[k] = Number(p.oc[k]);
  if (p.loadIx === null || p.loadIy === null) {
    const d = defaultLoadNode(p.support, p.nx, p.ny);
    if (p.loadIx === null) p.loadIx = d.ix;
    if (p.loadIy === null) p.loadIy = d.iy;
  }
  const mat = MATERIALS[p.material];
  if (mat) {
    if (p.sigmaT === null) p.sigmaT = mat.sigmaAllow;
    if (p.sigmaC === null) p.sigmaC = mat.sigmaAllow;
  }
  return p;
}

// Returns { ok, errors: string[] }. Never throws for bad numbers.
export function validateParams(p) {
  const errors = [];
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!fin(p.W) || p.W <= 0) errors.push('Domain width W must be a positive number (mm).');
  if (!fin(p.H) || p.H <= 0) errors.push('Domain height H must be a positive number (mm).');
  if (!Number.isInteger(p.nx) || p.nx < LIMITS.nx[0] || p.nx > LIMITS.nx[1]) errors.push(`Grid nodes nx must be an integer between ${LIMITS.nx[0]} and ${LIMITS.nx[1]}.`);
  if (!Number.isInteger(p.ny) || p.ny < LIMITS.ny[0] || p.ny > LIMITS.ny[1]) errors.push(`Grid nodes ny must be an integer between ${LIMITS.ny[0]} and ${LIMITS.ny[1]}.`);
  if (!Number.isInteger(p.r) || p.r < LIMITS.r[0] || p.r > LIMITS.r[1]) errors.push('Connectivity level r must be 1, 2 or 3.');
  if (!SUPPORT_PRESETS[p.support]) errors.push('Unknown support preset.');
  if (!MATERIALS[p.material]) errors.push('Unknown material card.');
  if (!fin(p.P) || p.P === 0) errors.push('Load magnitude P must be a nonzero number (N).');
  if (!fin(p.angleDeg)) errors.push('Load angle must be a number (degrees).');
  if (!fin(p.sigmaT) || p.sigmaT <= 0) errors.push('Allowable tensile stress must be positive (MPa).');
  if (!fin(p.sigmaC) || p.sigmaC <= 0) errors.push('Allowable compressive stress must be positive (MPa).');
  if (!fin(p.Aref) || p.Aref <= 0) errors.push('Reference area A_ref must be positive (mm^2).');
  if (!fin(p.volfrac) || p.volfrac <= 0 || p.volfrac > 1) errors.push('Volume fraction must lie in (0, 1].');
  if (!fin(p.aminFrac) || p.aminFrac <= 0) errors.push('Minimum area fraction must be positive.');
  else if (fin(p.volfrac) && p.aminFrac >= p.volfrac) errors.push('Minimum area fraction must be smaller than the volume fraction (the OC starts from uniform areas equal to volfrac times A_ref).');
  if (!fin(p.theta) || p.theta < 0 || p.theta >= 1) errors.push('Display threshold theta must lie in [0, 1).');
  if (Number.isInteger(p.nx) && Number.isInteger(p.ny)) {
    if (!Number.isInteger(p.loadIx) || p.loadIx < 0 || p.loadIx >= p.nx) errors.push('Load node column index is outside the grid.');
    if (!Number.isInteger(p.loadIy) || p.loadIy < 0 || p.loadIy >= p.ny) errors.push('Load node row index is outside the grid.');
    if (errors.length === 0) {
      const fixed = supportFixity(p.support, p.nx, p.ny);
      const n = p.loadIy * p.nx + p.loadIx;
      const ang = p.angleDeg * Math.PI / 180;
      const fx = Math.abs(Math.cos(ang)) > 1e-12, fy = Math.abs(Math.sin(ang)) > 1e-12;
      const worksX = fx && !fixed[2 * n], worksY = fy && !fixed[2 * n + 1];
      if (!worksX && !worksY) errors.push('The load acts only on fixed degrees of freedom of a support node and does no work; choose another node or direction.');
    }
  }
  if (!fin(p.oc.maxIter) || p.oc.maxIter < 1) errors.push('OC maximum iterations must be at least 1.');
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------
// Ground structure
// ---------------------------------------------------------------------------------------------

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

// Candidate members between grid nodes whose index differences are both <= r.
// A pair whose offsets (di, dj) have gcd > 1 passes exactly through an intermediate grid node and is
// skipped (its force path is already available as a chain of shorter candidates).
export function generateMembers(nx, ny, r) {
  const out = [];
  const id = (ix, iy) => iy * nx + ix;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      for (let di = 0; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (di === 0 && dj <= 0) continue;       // each unordered pair once, no self loops
          if (gcd(di, dj) !== 1) continue;         // collinear duplicate through a grid node
          const jx = ix + di, jy = iy + dj;
          if (jx >= nx || jy < 0 || jy >= ny) continue;
          out.push({ i: id(ix, iy), j: id(jx, jy), di, dj });
        }
      }
    }
  }
  return out;
}

export function supportFixity(support, nx, ny) {
  const fixed = new Uint8Array(2 * nx * ny);
  const id = (ix, iy) => iy * nx + ix;
  if (support === 'simply') {
    fixed[2 * id(0, 0)] = 1; fixed[2 * id(0, 0) + 1] = 1;
    fixed[2 * id(nx - 1, 0) + 1] = 1;
  } else if (support === 'mbb') {
    for (let iy = 0; iy < ny; iy++) fixed[2 * id(0, iy)] = 1;
    fixed[2 * id(nx - 1, 0)] = 1; fixed[2 * id(nx - 1, 0) + 1] = 1;
  } else {
    for (let iy = 0; iy < ny; iy++) { fixed[2 * id(0, iy)] = 1; fixed[2 * id(0, iy) + 1] = 1; }
  }
  return fixed;
}

// Builds nodes, candidate members (with length and direction cosines), fixity, loads and the free dof map.
export function buildGround(pIn) {
  const p = normalizeParams(pIn);
  const { W, H, nx, ny, r } = p;
  const nodes = [];
  const dx = W / (nx - 1), dy = H / (ny - 1);
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) nodes.push({ x: ix * dx, y: iy * dy, ix, iy });
  const members = generateMembers(nx, ny, r).map(m => {
    const a = nodes[m.i], b = nodes[m.j];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    return { i: m.i, j: m.j, L, cx: (b.x - a.x) / L, cy: (b.y - a.y) / L };
  });
  const fixed = supportFixity(p.support, nx, ny);
  const loads = new Float64Array(2 * nodes.length);
  const loadNode = p.loadIy * nx + p.loadIx;
  const ang = p.angleDeg * Math.PI / 180;
  let fx = p.P * Math.cos(ang), fy = p.P * Math.sin(ang);
  if (Math.abs(fx) < 1e-12 * Math.abs(p.P)) fx = 0;
  if (Math.abs(fy) < 1e-12 * Math.abs(p.P)) fy = 0;
  loads[2 * loadNode] = fx; loads[2 * loadNode + 1] = fy;
  const freeDofs = [];
  const dofMap = new Int32Array(2 * nodes.length).fill(-1);
  for (let d = 0; d < 2 * nodes.length; d++) if (!fixed[d]) { dofMap[d] = freeDofs.length; freeDofs.push(d); }
  let sumL = 0; for (const m of members) sumL += m.L;
  return { nodes, members, fixed, loads, freeDofs, dofMap, sumL, nx, ny, W, H, loadNode, params: p };
}

// Builds a ground object from explicit data (for tests and small hand examples):
// nodes [[x, y], ...], members [[i, j], ...], supports { node: [fixX, fixY] }, loads { node: [Fx, Fy] }.
export function customGround({ nodes, members, supports = {}, loads = {} }) {
  const nd = nodes.map(([x, y], k) => ({ x, y, ix: k, iy: 0 }));
  const mb = members.map(([i, j]) => {
    const a = nd[i], b = nd[j];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(L > 0)) throw new Error(`member ${i}-${j} has zero length`);
    return { i, j, L, cx: (b.x - a.x) / L, cy: (b.y - a.y) / L };
  });
  const fixed = new Uint8Array(2 * nd.length);
  for (const [k, f] of Object.entries(supports)) { fixed[2 * k] = f[0] ? 1 : 0; fixed[2 * k + 1] = f[1] ? 1 : 0; }
  const ld = new Float64Array(2 * nd.length);
  for (const [k, f] of Object.entries(loads)) { ld[2 * k] = f[0]; ld[2 * k + 1] = f[1]; }
  const freeDofs = [];
  const dofMap = new Int32Array(2 * nd.length).fill(-1);
  for (let d = 0; d < 2 * nd.length; d++) if (!fixed[d]) { dofMap[d] = freeDofs.length; freeDofs.push(d); }
  let sumL = 0; for (const m of mb) sumL += m.L;
  const xs = nd.map(n => n.x), ys = nd.map(n => n.y);
  return {
    nodes: nd, members: mb, fixed, loads: ld, freeDofs, dofMap, sumL, nx: nd.length, ny: 1,
    W: Math.max(...xs) - Math.min(...xs), H: Math.max(...ys) - Math.min(...ys), loadNode: -1, params: null,
  };
}

// Equilibrium matrix B (rows = free dofs, columns = members): B N = f for member forces N (tension +).
// Column k holds -(cx, cy) at node i and +(cx, cy) at node j, so that B^T u is the vector of elongations.
export function equilibriumMatrix(ground, members = ground.members, dofMap = ground.dofMap, m = ground.freeDofs.length) {
  const n = members.length;
  const B = new Float64Array(m * n);
  for (let k = 0; k < n; k++) {
    const mb = members[k];
    const a = dofMap[2 * mb.i], b = dofMap[2 * mb.i + 1], c = dofMap[2 * mb.j], d = dofMap[2 * mb.j + 1];
    if (a >= 0) B[a * n + k] = -mb.cx;
    if (b >= 0) B[b * n + k] = -mb.cy;
    if (c >= 0) B[c * n + k] = mb.cx;
    if (d >= 0) B[d * n + k] = mb.cy;
  }
  return { B, m, n };
}

// ---------------------------------------------------------------------------------------------
// Linear elastic truss analysis (direct stiffness, dense Cholesky with singularity detection)
// ---------------------------------------------------------------------------------------------

// Solves K x = b for symmetric positive definite K (row-major n x n, overwritten). Returns { x } or { singular, index }.
export function choleskySolve(K, n, b, relTol = 1e-11) {
  let maxDiag = 0;
  for (let i = 0; i < n; i++) if (K[i * n + i] > maxDiag) maxDiag = K[i * n + i];
  if (!(maxDiag > 0)) return { singular: true, index: 0 };
  const tol = relTol * maxDiag;
  for (let j = 0; j < n; j++) {
    let s = K[j * n + j];
    for (let k = 0; k < j; k++) s -= K[j * n + k] * K[j * n + k];
    if (!(s > tol)) return { singular: true, index: j };
    const d = Math.sqrt(s);
    K[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = K[i * n + j];
      for (let k = 0; k < j; k++) t -= K[i * n + k] * K[j * n + k];
      K[i * n + j] = t / d;
    }
  }
  const x = Float64Array.from(b);
  for (let i = 0; i < n; i++) {               // forward: L y = b
    let s = x[i];
    for (let k = 0; k < i; k++) s -= K[i * n + k] * x[k];
    x[i] = s / K[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {          // backward: L^T x = y
    let s = x[i];
    for (let k = i + 1; k < n; k++) s -= K[k * n + i] * x[k];
    x[i] = s / K[i * n + i];
  }
  return { x };
}

// Exact linear elastic solve of a truss made of `members` (each {i, j, L, cx, cy}) with the given areas,
// using the nodes, fixity and loads of `ground`. Nodes touched by no member are excluded from the dof set.
// Returns { u, N, compliance, reactions, nFree } or { error: 'mechanism' | 'disconnected' | 'empty', message }.
export function solveElastic(ground, members, areas, E) {
  const nn = ground.nodes.length;
  if (!members.length) return { error: 'empty', message: 'no members are left after thresholding, lower the threshold' };
  const touched = new Uint8Array(nn);
  for (const mb of members) { touched[mb.i] = 1; touched[mb.j] = 1; }
  const dofMap = new Int32Array(2 * nn).fill(-1);
  const free = [];
  for (let a = 0; a < nn; a++) {
    if (!touched[a]) continue;
    for (let d = 0; d < 2; d++) if (!ground.fixed[2 * a + d]) { dofMap[2 * a + d] = free.length; free.push(2 * a + d); }
  }
  for (let d = 0; d < 2 * nn; d++) {
    if (ground.loads[d] !== 0 && !ground.fixed[d] && dofMap[d] < 0) {
      return { error: 'disconnected', message: 'no member reaches the loaded node, lower the threshold' };
    }
  }
  const m = free.length;
  if (m === 0) return { error: 'mechanism', message: 'no free degrees of freedom are connected' };
  const K = new Float64Array(m * m);
  for (let k = 0; k < members.length; k++) {
    const mb = members[k];
    const kk = E * areas[k] / mb.L;
    if (!(kk > 0) || !Number.isFinite(kk)) return { error: 'invalid', message: 'member area must be positive and finite' };
    const c = [mb.cx, mb.cy];
    const dofs = [dofMap[2 * mb.i], dofMap[2 * mb.i + 1], dofMap[2 * mb.j], dofMap[2 * mb.j + 1]];
    const sgn = [-1, -1, 1, 1];
    for (let p = 0; p < 4; p++) {
      const dp = dofs[p]; if (dp < 0) continue;
      for (let q = 0; q < 4; q++) {
        const dq = dofs[q]; if (dq < 0) continue;
        K[dp * m + dq] += kk * sgn[p] * sgn[q] * c[p & 1] * c[q & 1];
      }
    }
  }
  const f = new Float64Array(m);
  for (let q = 0; q < m; q++) f[q] = ground.loads[free[q]];
  const Kcopy = K.slice();
  const sol = choleskySolve(K, m, f);
  let x = sol.x, mechanism = null;
  if (sol.singular) {
    const mech = mechanismAnalysis(Kcopy, m, f, free, nn);
    const mode = Array.from(mech.mode), movingNodes = mech.movingNodes;
    if (mech.loadExcites || mech.count === 0) {
      return { error: 'mechanism', message: 'the thresholded layout is kinematically unstable, lower the threshold', mode, movingNodes, modeCount: mech.count };
    }
    // The load is orthogonal to every zero-stiffness mode: equilibrium holds and the member forces are unique.
    x = mech.x;
    mechanism = { count: mech.count, mode, movingNodes };
  }
  const u = new Float64Array(2 * nn);
  for (let q = 0; q < m; q++) u[free[q]] = x[q];
  const N = new Float64Array(members.length);
  let compliance = 0;
  for (let q = 0; q < m; q++) compliance += f[q] * x[q];
  const internal = new Float64Array(2 * nn); // B N over all dofs (equals loads at free dofs, reactions at fixed ones)
  for (let k = 0; k < members.length; k++) {
    const mb = members[k];
    const e = (u[2 * mb.j] - u[2 * mb.i]) * mb.cx + (u[2 * mb.j + 1] - u[2 * mb.i + 1]) * mb.cy;
    N[k] = E * areas[k] / mb.L * e;
    internal[2 * mb.i] -= N[k] * mb.cx; internal[2 * mb.i + 1] -= N[k] * mb.cy;
    internal[2 * mb.j] += N[k] * mb.cx; internal[2 * mb.j + 1] += N[k] * mb.cy;
  }
  const reactions = new Float64Array(2 * nn);
  for (let d = 0; d < 2 * nn; d++) if (ground.fixed[d] && touched[d >> 1]) reactions[d] = internal[d] - ground.loads[d];
  return { u, N, compliance, reactions, nFree: m, internal, mechanism };
}

// Eigen-decomposition of a symmetric matrix (cyclic Jacobi). Returns { values: Float64Array, vectors: Float64Array (column k = vector k) }.
export function symmetricEigen(Ain, n, maxSweeps = 60) {
  const A = Float64Array.from(Ain), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  let norm = 0; for (let i = 0; i < n * n; i++) norm += A[i] * A[i];
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
    if (off <= 1e-30 * norm) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (apq === 0) continue;
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {               // rotate columns p and q
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {               // rotate rows p and q
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = A[i * n + i];
  return { values, vectors: V };
}

// Analysis of a singular stiffness matrix. Zero-stiffness modes are the eigenvectors with eigenvalue <= tol * lambda_max.
// If the load is orthogonal to every mode the structure is in equilibrium and the displacement on the range space (and
// therefore all member forces) is unique: returns { x, count, mode, movingNodes }. Otherwise returns { loadExcites: true, ... }.
export function mechanismAnalysis(K, m, f, free, nn) {
  const eig = symmetricEigen(K, m);
  let lmax = 0; for (let i = 0; i < m; i++) lmax = Math.max(lmax, eig.values[i]);
  const tol = 1e-9 * (lmax || 1);
  let fnorm = 0; for (let q = 0; q < m; q++) fnorm += f[q] * f[q];
  fnorm = Math.sqrt(fnorm) || 1;
  const x = new Float64Array(m);
  const modeAgg = new Float64Array(m);
  let count = 0, loadExcites = false;
  for (let k = 0; k < m; k++) {
    let proj = 0; for (let q = 0; q < m; q++) proj += eig.vectors[q * m + k] * f[q];
    if (eig.values[k] <= tol) {
      count++;
      if (Math.abs(proj) > 1e-8 * fnorm) loadExcites = true;
      for (let q = 0; q < m; q++) modeAgg[q] += eig.vectors[q * m + k] * (1 + 0.1 * count);
    } else {
      const a = proj / eig.values[k];
      for (let q = 0; q < m; q++) x[q] += a * eig.vectors[q * m + k];
    }
  }
  const mode = new Float64Array(2 * nn);
  let amax = 0;
  for (let q = 0; q < m; q++) mode[free[q]] = modeAgg[q];
  for (let a = 0; a < nn; a++) amax = Math.max(amax, Math.hypot(mode[2 * a], mode[2 * a + 1]));
  if (amax > 0) for (let d = 0; d < 2 * nn; d++) mode[d] /= amax;
  const movingNodes = [];
  for (let a = 0; a < nn; a++) {
    const r = Math.hypot(mode[2 * a], mode[2 * a + 1]);
    if (r > 0.3) movingNodes.push({ node: a, amplitude: r });
  }
  movingNodes.sort((p, q) => q.amplitude - p.amplitude);
  return { x, count, mode, movingNodes, loadExcites };
}

// Relative equilibrium residual ||B N - f|| / ||f|| over the free dofs of the ground structure.
export function equilibriumResidual(ground, members, N) {
  const nn = ground.nodes.length;
  const res = new Float64Array(2 * nn);
  for (let k = 0; k < members.length; k++) {
    const mb = members[k];
    res[2 * mb.i] -= N[k] * mb.cx; res[2 * mb.i + 1] -= N[k] * mb.cy;
    res[2 * mb.j] += N[k] * mb.cx; res[2 * mb.j + 1] += N[k] * mb.cy;
  }
  let num = 0, den = 0;
  for (let d = 0; d < 2 * nn; d++) {
    if (ground.fixed[d]) continue;
    const r = res[d] - ground.loads[d];
    num += r * r; den += ground.loads[d] * ground.loads[d];
  }
  return Math.sqrt(num) / Math.sqrt(den || 1);
}

// ---------------------------------------------------------------------------------------------
// Optimality criteria for minimum compliance at fixed volume
// ---------------------------------------------------------------------------------------------
// min C(A) = f^T u(A)  s.t.  sum_i L_i A_i = V_t,  A_min <= A_i <= A_max,i
// dC/dA_i = -N_i^2 L_i / (E A_i^2) = -sigma_i^2 L_i / E.
// Update A_i <- clamp(A_i (B_i)^eta) with B_i = -dC/dA_i / (lambda L_i); lambda by bisection so the volume is met.

export function ocCreate(ground, opts) {
  const { E, Vt, Amin } = opts;
  const maxIter = opts.maxIter ?? 200, tol = opts.tol ?? 1e-3, move = opts.move ?? 0.2, eta = opts.eta ?? 0.5;
  const members = ground.members;
  const n = members.length;
  const L = Float64Array.from(members, mb => mb.L);
  const A0 = Vt / ground.sumL;
  const st = { ground, E, Vt, Amin, n, L, maxIter, tol, move, eta, iter: 0, history: [], done: false, converged: false, error: null, stoppedBy: null, lambda: NaN, totalBacktracks: 0 };
  if (!(A0 > Amin)) {
    st.error = { error: 'invalid', message: 'the minimum area floor is not below the uniform starting area' };
    st.done = true; return st;
  }
  st.A = new Float64Array(n).fill(A0);
  st.Amax = Float64Array.from(L, l => Vt / l);     // no single bar may hold more than the whole budget
  const an = solveElastic(ground, members, st.A, E);
  if (an.error) { st.error = an; st.done = true; return st; }
  st.N = an.N; st.compliance = an.compliance; st.volume = Vt;
  st.history.push({ iter: 0, compliance: an.compliance, volume: Vt, change: NaN, lambda: NaN, move });
  return st;
}

function ocUpdate(A, g, L, Amin, Amax, Vt, move, eta, gOverLmax) {
  const n = A.length;
  const Anew = new Float64Array(n), lo = new Float64Array(n), hi = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    lo[k] = Math.max(Amin, A[k] * (1 - move));
    hi[k] = Math.min(Amax[k], A[k] * (1 + move));
    if (hi[k] < lo[k]) hi[k] = lo[k];
  }
  const evalV = (lambda) => {
    let V = 0;
    for (let k = 0; k < n; k++) {
      const Bk = -g[k] / (lambda * L[k]);
      let a = A[k] * Math.pow(Bk, eta);
      if (a < lo[k]) a = lo[k]; else if (a > hi[k]) a = hi[k];
      Anew[k] = a; V += a * L[k];
    }
    return V;
  };
  let l1 = 0, l2 = gOverLmax * 1e4, lambda = 0.5 * l2;
  for (let it = 0; it < 400; it++) {
    lambda = 0.5 * (l1 + l2);
    const V = evalV(lambda);
    if (Math.abs(V - Vt) <= 1e-13 * Vt) break;
    if (V > Vt) l1 = lambda; else l2 = lambda;
    if (l2 - l1 <= 1e-15 * l2) { lambda = 0.5 * (l1 + l2); evalV(lambda); break; }
  }
  return { Anew, lambda };
}

export function ocStep(st) {
  if (st.done) return st;
  const { n, L, A, Amin, Amax, E, Vt, eta, ground } = st;
  const g = new Float64Array(n);
  let gOverLmax = 0;
  for (let k = 0; k < n; k++) {
    g[k] = -(st.N[k] * st.N[k]) * L[k] / (E * A[k] * A[k]);
    const v = -g[k] / L[k];
    if (v > gOverLmax) gOverLmax = v;
  }
  if (!(gOverLmax > 0)) { st.done = true; st.converged = true; st.stoppedBy = 'zero forces'; return st; }
  let move = st.move, accepted = false, trial = null, an = null, bt = 0;
  for (; bt < 14; bt++) {
    trial = ocUpdate(A, g, L, Amin, Amax, Vt, move, eta, gOverLmax);
    an = solveElastic(ground, ground.members, trial.Anew, E);
    if (an.error) { st.error = an; st.done = true; return st; }
    if (an.compliance <= st.compliance * (1 + 1e-12)) { accepted = true; break; }
    move *= 0.5;                                   // safeguard: shrink the move limit if the compliance would rise
  }
  st.totalBacktracks += bt;
  if (!accepted) { st.done = true; st.converged = true; st.stoppedBy = 'roundoff'; return st; }
  let Aold = 0, change = 0;
  for (let k = 0; k < n; k++) if (A[k] > Aold) Aold = A[k];
  for (let k = 0; k < n; k++) { const d = Math.abs(trial.Anew[k] - A[k]); if (d > change) change = d; }
  change /= Aold;
  A.set(trial.Anew);
  st.N = an.N; st.compliance = an.compliance; st.lambda = trial.lambda; st.iter++;
  let V = 0; for (let k = 0; k < n; k++) V += A[k] * L[k];
  st.volume = V;
  st.history.push({ iter: st.iter, compliance: an.compliance, volume: V, change, lambda: trial.lambda, move, backtracks: bt });
  if (change < st.tol) { st.done = true; st.converged = true; st.stoppedBy = 'tolerance'; }
  else if (st.iter >= st.maxIter) { st.done = true; st.converged = false; st.stoppedBy = 'max iterations'; }
  return st;
}

export function ocResult(st) {
  if (st.error) return { error: st.error.error, message: st.error.message };
  return {
    areas: Array.from(st.A), forces: Array.from(st.N), history: st.history, iterations: st.iter, converged: st.converged,
    stoppedBy: st.stoppedBy, compliance: st.compliance, volume: st.volume, lambda: st.lambda, Vt: st.Vt, Amin: st.Amin,
    sigmaUniform: Number.isFinite(st.lambda) ? Math.sqrt(st.lambda * st.E) : NaN, totalBacktracks: st.totalBacktracks,
  };
}

export function optimizeOC(ground, opts, onProgress) {
  const st = ocCreate(ground, opts);
  while (!st.done) {
    ocStep(st);
    if (onProgress) onProgress({ iter: st.iter, compliance: st.compliance, change: st.history[st.history.length - 1].change });
  }
  return ocResult(st);
}

// ---------------------------------------------------------------------------------------------
// Dense two-phase simplex
// ---------------------------------------------------------------------------------------------
// Standard form: min c^T x  s.t.  A x = b,  x >= 0.  A is row-major m x n (Float64Array or array).
// Tableau rows 0..m-1 are the constraints, row m holds the reduced costs; columns 0..n-1 original variables,
// n..n+m0-1 artificial variables (their columns hold the current basis inverse), last column the right-hand side.
// The objective row RHS stores -z.
// Pivot rules (opts.rule):
//   'bland'   Bland's rule: first negative reduced cost enters, min ratio with the smallest basis index leaves.
//             Finite by construction but very slow on degenerate problems (every free dof with zero load gives a
//             degenerate row), so it is kept as the anti-cycling safeguard rather than the default.
//   'dantzig' most negative reduced cost enters, lexicographic ratio test (compares the basis-inverse columns of
//             tied rows) leaves. Also finite in exact arithmetic and fast in practice.
//   'auto'    (default) 'dantzig' with a switch to Bland's rule while the objective has stalled for stallLimit pivots.
// The tableau is refactored from the original data every refactorEvery pivots and before declaring optimality, and the
// final basic solution is recomputed from the original equations (simplexRefine).

export function simplexCreate(c, A, b, opts = {}) {
  const m = b.length, n = c.length;
  if (A.length !== m * n) throw new Error(`simplex: A has ${A.length} entries, expected ${m * n}`);
  const eps = opts.eps ?? 1e-9;
  let bscale = 0; for (let i = 0; i < m; i++) bscale = Math.max(bscale, Math.abs(b[i]));
  if (!(bscale > 0)) bscale = 1;
  let cscale = 0; for (let j = 0; j < n; j++) cscale = Math.max(cscale, Math.abs(c[j]));
  if (!(cscale > 0)) cscale = 1;
  const rowScale = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let mx = 0; for (let j = 0; j < n; j++) mx = Math.max(mx, Math.abs(A[i * n + j]));
    rowScale[i] = mx > 0 ? 1 / mx : 1;
  }
  const nc = n + m + 1, rhs = n + m;
  const T = new Float64Array((m + 1) * nc);
  const basis = new Int32Array(m);
  const rowIndex = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    const bi = b[i] / bscale * rowScale[i];
    const sgn = bi < 0 ? -1 : 1;
    const row = i * nc;
    for (let j = 0; j < n; j++) T[row + j] = sgn * A[i * n + j] * rowScale[i];
    T[row + n + i] = 1;
    T[row + rhs] = sgn * bi;
    basis[i] = n + i;
    rowIndex[i] = i;
  }
  const orow = m * nc;
  for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += T[i * nc + j]; T[orow + j] = -s; }
  { let s = 0; for (let i = 0; i < m; i++) s += T[i * nc + rhs]; T[orow + rhs] = -s; }
  const rule = ['bland', 'dantzig', 'auto'].includes(opts.rule) ? opts.rule : 'auto';
  return {
    T, D0: T.slice(0, m * nc), m, m0: m, n, nc, rhs, basis, rowIndex, phase: 1, status: 'running', pivots: 0, phase1Pivots: 0, eps,
    c: Float64Array.from(c, v => v / cscale), cOrig: Float64Array.from(c), Aorig: A, bOrig: Float64Array.from(b),
    bscale, cscale, rule, mode: rule === 'bland' ? 'bland' : 'dantzig', stall: 0, lastObj: Infinity,
    stallLimit: opts.stallLimit ?? 1000, refactorEvery: opts.refactorEvery ?? 250, clean: true, restarts: 0, maxRestarts: 8,
    maxPivots: opts.maxPivots || (60 * (m + n) + 2000), history: [], history1: [], feasTol: opts.feasTol ?? 1e-7,
    infeasibility: NaN, refactors: 0, blandPivots: 0,
  };
}

function simplexPivot(st, r, s) {
  const { T, m, nc } = st;
  const prow = r * nc;
  const inv = 1 / T[prow + s];
  for (let j = 0; j < nc; j++) T[prow + j] *= inv;
  T[prow + s] = 1;
  for (let i = 0; i <= m; i++) {
    if (i === r) continue;
    const row = i * nc;
    const f = T[row + s];
    if (f === 0) continue;
    for (let j = 0; j < nc; j++) T[row + j] -= f * T[prow + j];
    T[row + s] = 0;
  }
  st.basis[r] = s;
  st.pivots++;
  st.clean = false;
  if (st.phase === 1) st.phase1Pivots++;
  if (st.mode === 'bland') st.blandPivots++;
}

function simplexEnterCol(st) {
  const { T, m, n, nc, eps } = st;
  const orow = m * nc;
  if (st.mode === 'bland') {
    for (let j = 0; j < n; j++) if (T[orow + j] < -eps) return j;
    return -1;
  }
  let s = -1, best = -eps;
  for (let j = 0; j < n; j++) if (T[orow + j] < best) { best = T[orow + j]; s = j; }
  return s;
}

// Lexicographic comparison of rows i1 and i2 (divided by their entries in the pivot column) over the RHS and the
// basis-inverse columns. Returns true when row i1 is lexicographically smaller.
function lexLess(st, i1, i2, s) {
  const { T, nc, n, m0, rhs } = st;
  const a1 = T[i1 * nc + s], a2 = T[i2 * nc + s];
  for (let q = -1; q < m0; q++) {
    const col = q < 0 ? rhs : n + q;
    const v1 = T[i1 * nc + col] / a1, v2 = T[i2 * nc + col] / a2;
    if (Math.abs(v1 - v2) > 1e-12 * (1 + Math.abs(v1) + Math.abs(v2))) return v1 < v2;
  }
  return st.basis[i1] < st.basis[i2];
}

function simplexLeaveRow(st, s) {
  const { T, m, nc, rhs, basis, eps } = st;
  let best = Infinity;
  for (let i = 0; i < m; i++) {
    const a = T[i * nc + s];
    if (a <= eps) continue;
    const ratio = T[i * nc + rhs] / a;
    if (ratio < best) best = ratio;
  }
  if (best === Infinity) return -1;
  const tol = 1e-12 * (1 + Math.abs(best));
  let r = -1;
  for (let i = 0; i < m; i++) {
    const a = T[i * nc + s];
    if (a <= eps) continue;
    if (T[i * nc + rhs] / a > best + tol) continue;
    if (r < 0) { r = i; continue; }
    if (st.mode === 'bland') { if (basis[i] < basis[r]) r = i; }
    else if (lexLess(st, i, r, s)) r = i;
  }
  return r;
}

// ---- LU with partial pivoting (for refactorization) ----
function luFactor(M, n) {
  const a = Float64Array.from(M), perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  let scale = 0; for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.abs(a[i]));
  if (!(scale > 0)) return { ok: false };
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(a[col * n + col]);
    for (let i = col + 1; i < n; i++) { const v = Math.abs(a[i * n + col]); if (v > best) { best = v; piv = i; } }
    if (best <= 1e-13 * scale) return { ok: false };
    if (piv !== col) {
      for (let j = 0; j < n; j++) { const t = a[col * n + j]; a[col * n + j] = a[piv * n + j]; a[piv * n + j] = t; }
      const t = perm[col]; perm[col] = perm[piv]; perm[piv] = t;
    }
    const d = a[col * n + col];
    for (let i = col + 1; i < n; i++) {
      const f = a[i * n + col] / d;
      a[i * n + col] = f;
      if (f === 0) continue;
      for (let j = col + 1; j < n; j++) a[i * n + j] -= f * a[col * n + j];
    }
  }
  return { ok: true, a, perm, n };
}

function luSolve(lu, b, x) {
  const { a, perm, n } = lu;
  for (let i = 0; i < n; i++) x[i] = b[perm[i]];
  for (let i = 0; i < n; i++) { let s = x[i]; for (let k = 0; k < i; k++) s -= a[i * n + k] * x[k]; x[i] = s; }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let k = i + 1; k < n; k++) s -= a[i * n + k] * x[k]; x[i] = s / a[i * n + i]; }
}

// Rebuilds the whole tableau from the original (scaled) data and the current basis: rows = B^-1 [A | I | b].
function simplexRefactor(st) {
  const { m, n, nc, rhs, basis, rowIndex, D0 } = st;
  const M = new Float64Array(m * m);
  for (let q = 0; q < m; q++) for (let p = 0; p < m; p++) M[q * m + p] = D0[rowIndex[q] * nc + basis[p]];
  const lu = luFactor(M, m);
  if (!lu.ok) return false;
  const T = st.T, col = new Float64Array(m), x = new Float64Array(m);
  for (let j = 0; j < nc; j++) {
    for (let q = 0; q < m; q++) col[q] = D0[rowIndex[q] * nc + j];
    luSolve(lu, col, x);
    for (let q = 0; q < m; q++) T[q * nc + j] = x[q];
  }
  for (let p = 0; p < m; p++) for (let q = 0; q < m; q++) T[q * nc + basis[p]] = q === p ? 1 : 0;
  const cost = st.phase === 1 ? (j => (j >= n ? 1 : 0)) : (j => (j < n ? st.c[j] : 0));
  const orow = m * nc;
  for (let j = 0; j < nc; j++) {
    if (j === rhs) continue;
    let d = cost(j);
    for (let q = 0; q < m; q++) d -= cost(basis[q]) * T[q * nc + j];
    T[orow + j] = d;
  }
  let z = 0; for (let q = 0; q < m; q++) z += cost(basis[q]) * T[q * nc + rhs];
  T[orow + rhs] = -z;
  st.clean = true;
  st.refactors++;
  return true;
}

function simplexEndPhase1(st) {
  const { n, nc, rhs } = st;
  const z1 = -st.T[st.m * nc + rhs];
  st.infeasibility = z1 * st.bscale;
  if (z1 > st.feasTol) { st.status = 'infeasible'; return; }
  // Drive artificial variables out of the basis (they sit at zero level); rows that cannot be pivoted are redundant.
  const keep = [];
  for (let i = 0; i < st.m; i++) {
    if (st.basis[i] < n) { keep.push(i); continue; }
    let s = -1, best = st.eps;
    for (let j = 0; j < n; j++) { const v = Math.abs(st.T[i * nc + j]); if (v > best) { best = v; s = j; } }
    if (s >= 0) { simplexPivot(st, i, s); keep.push(i); }
  }
  if (keep.length < st.m) {
    const T = st.T, mNew = keep.length;
    const Tn = new Float64Array((mNew + 1) * nc);
    const basis = new Int32Array(mNew), rowIndex = new Int32Array(mNew);
    keep.forEach((i, q) => { Tn.set(T.subarray(i * nc, (i + 1) * nc), q * nc); basis[q] = st.basis[i]; rowIndex[q] = st.rowIndex[i]; });
    st.T = Tn; st.m = mNew; st.basis = basis; st.rowIndex = rowIndex;
  }
  st.phase = 2;
  if (!simplexRefactor(st)) {                // clean tableau with the phase-2 reduced costs; fallback: from the current rows
    const T = st.T, m = st.m, orow = m * nc;
    for (let j = 0; j < nc; j++) T[orow + j] = 0;
    for (let j = 0; j < n; j++) {
      let s = st.c[j];
      for (let i = 0; i < m; i++) s -= st.c[st.basis[i]] * T[i * nc + j];
      T[orow + j] = s;
    }
    let z = 0; for (let i = 0; i < m; i++) z += st.c[st.basis[i]] * T[i * nc + rhs];
    T[orow + rhs] = -z;
  }
  st.lastObj = Infinity; st.stall = 0;
  if (st.rule === 'auto') st.mode = 'dantzig';
  st.history.push(s2obj(st));
}

function s2obj(st) { return -st.T[st.m * st.nc + st.rhs] * st.bscale * st.cscale; }

// Performs up to maxPivots pivots. st.status is 'running' | 'optimal' | 'infeasible' | 'unbounded' | 'maxiter'.
export function simplexStep(st, maxPivots = 50) {
  for (let it = 0; it < maxPivots && st.status === 'running'; it++) {
    const s = simplexEnterCol(st);
    if (s < 0) {
      // Candidate optimum: confirm on a freshly refactored tableau before accepting it.
      if (!st.clean && st.restarts < st.maxRestarts) { st.restarts++; simplexRefactor(st); continue; }
      if (st.phase === 1) { simplexEndPhase1(st); continue; }
      st.status = 'optimal';
      break;
    }
    const r = simplexLeaveRow(st, s);
    if (r < 0) {
      if (!st.clean && st.restarts < st.maxRestarts) { st.restarts++; simplexRefactor(st); continue; }
      st.status = st.phase === 1 ? 'infeasible' : 'unbounded';
      break;
    }
    simplexPivot(st, r, s);
    const obj = -st.T[st.m * st.nc + st.rhs];
    if (st.phase === 2) st.history.push(obj * st.bscale * st.cscale);
    else st.history1.push(obj * st.bscale);
    if (st.rule === 'auto') {
      if (obj < st.lastObj - 1e-12 * (1 + Math.abs(st.lastObj))) { st.stall = 0; st.mode = 'dantzig'; }
      else if (++st.stall >= st.stallLimit) st.mode = 'bland';
      st.lastObj = obj;
    }
    if (st.pivots % st.refactorEvery === 0) simplexRefactor(st);
    if (st.pivots >= st.maxPivots) st.status = 'maxiter';
  }
  return st;
}

// Recomputes the basic solution from the original data (B_basis x_B = b) to remove accumulated roundoff.
function simplexRefine(st, x) {
  const { m, n, basis, rowIndex, Aorig, bOrig } = st;
  for (let i = 0; i < m; i++) if (basis[i] >= n) return false;
  const M = new Float64Array(m * m), rhs = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const ro = rowIndex[i];
    for (let q = 0; q < m; q++) M[i * m + q] = Aorig[ro * n + basis[q]];
    rhs[i] = bOrig[ro];
  }
  const sol = gaussSolve(M, m, rhs);
  if (!sol) return false;
  const tolNeg = -1e-9 * st.bscale;
  for (let q = 0; q < m; q++) if (!(sol[q] >= tolNeg)) return false;
  for (let q = 0; q < m; q++) x[basis[q]] = Math.max(0, sol[q]);
  return true;
}

export function gaussSolve(M, n, b) {
  const lu = luFactor(M, n);
  if (!lu.ok) return null;
  const x = new Float64Array(n);
  luSolve(lu, Float64Array.from(b), x);
  return x;
}

export function simplexExtract(st) {
  const { T, m, n, nc, rhs, basis, bscale } = st;
  const x = new Float64Array(n);
  let refined = false;
  if (st.status === 'optimal') {
    for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = Math.max(0, T[i * nc + rhs] * bscale);
    refined = simplexRefine(st, x);
  }
  let objective = 0;
  for (let j = 0; j < n; j++) objective += st.cOrig[j] * x[j];
  return {
    status: st.status, x, objective: st.status === 'optimal' ? objective : NaN, pivots: st.pivots, phase1Pivots: st.phase1Pivots,
    refined, infeasibility: st.infeasibility, history: st.history, history1: st.history1, rowsRemoved: st.m0 - st.m,
    refactors: st.refactors, blandPivots: st.blandPivots, rule: st.rule,
  };
}

export function solveLP(c, A, b, opts = {}) {
  const st = simplexCreate(c, A, b, opts);
  while (st.status === 'running') simplexStep(st, 1000);
  return simplexExtract(st);
}

// ---------------------------------------------------------------------------------------------
// Minimum-volume plastic design (Dorn, Gomory and Greenberg 1964)
// ---------------------------------------------------------------------------------------------
// Variables t_k >= 0 (tension force) and c_k >= 0 (compression force magnitude) for each candidate bar.
// Equilibrium B (t - c) = f at every free dof. Objective: sum_k L_k (t_k / sigma_t + c_k / sigma_c) = volume
// of a fully stressed design, with areas A_k = t_k / sigma_t + c_k / sigma_c.

export function lpCreate(ground, sigmaT, sigmaC, opts = {}) {
  const { B, m, n } = equilibriumMatrix(ground);
  const A = new Float64Array(m * 2 * n);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < n; k++) {
      const v = B[i * n + k];
      A[i * 2 * n + k] = v;
      A[i * 2 * n + n + k] = -v;
    }
  }
  const b = Float64Array.from(ground.freeDofs, d => ground.loads[d]);
  const c = new Float64Array(2 * n);
  for (let k = 0; k < n; k++) { c[k] = ground.members[k].L / sigmaT; c[n + k] = ground.members[k].L / sigmaC; }
  const st = simplexCreate(c, A, b, opts);
  st.ground = ground; st.nMembers = n; st.sigmaT = sigmaT; st.sigmaC = sigmaC; st.B = B;
  return st;
}

export function lpExtract(st) {
  const res = simplexExtract(st);
  const n = st.nMembers;
  const areas = new Array(n).fill(0), forces = new Array(n).fill(0);
  let residual = NaN;
  if (res.status === 'optimal') {
    // Degenerate basic variables sit at zero level; values below 1e-10 of the load scale are roundoff, not members.
    const tiny = 1e-10 * st.bscale;
    for (let k = 0; k < n; k++) {
      const t = res.x[k] > tiny ? res.x[k] : 0, cc = res.x[n + k] > tiny ? res.x[n + k] : 0;
      areas[k] = t / st.sigmaT + cc / st.sigmaC;
      forces[k] = t - cc;
    }
    residual = equilibriumResidual(st.ground, st.ground.members, forces);
  }
  return {
    status: res.status, volume: res.objective, areas, forces, pivots: res.pivots, phase1Pivots: res.phase1Pivots,
    history: res.history, history1: res.history1, residual, refined: res.refined, rowsRemoved: res.rowsRemoved,
    nVariables: 2 * n, nConstraints: st.m0, infeasibility: res.infeasibility,
  };
}

export function plasticDesignLP(ground, sigmaT, sigmaC, opts = {}) {
  const st = lpCreate(ground, sigmaT, sigmaC, opts);
  while (st.status === 'running') simplexStep(st, 1000);
  return lpExtract(st);
}

// ---------------------------------------------------------------------------------------------
// Thresholding and exact verification
// ---------------------------------------------------------------------------------------------

// Keeps members with A >= theta * max(A) (and A > 0). Then, unless disabled:
//  - removes dangling bars (an unloaded, unsupported node with a single bar carries no force),
//  - merges chains of exactly two collinear bars at an unloaded, unsupported node into one bar (that joint
//    would be a hinge in a straight bar; the built structure uses one continuous bar). Area: length-weighted mean.
export function thresholdLayout(ground, areas, theta, opts = {}) {
  const dropDangling = opts.dropDangling !== false, merge = opts.merge !== false;
  const n = ground.members.length;
  let Amax = 0; for (let k = 0; k < n; k++) if (areas[k] > Amax) Amax = areas[k];
  const thr = theta * Amax;
  let members = [];
  for (let k = 0; k < n; k++) {
    if (!(areas[k] > 0) || areas[k] < thr) continue;
    const mb = ground.members[k];
    members.push({ i: mb.i, j: mb.j, L: mb.L, cx: mb.cx, cy: mb.cy, A: areas[k], source: [k], merged: false });
  }
  const kept0 = members.length;
  const nn = ground.nodes.length;
  const isPlain = (a) => ground.loads[2 * a] === 0 && ground.loads[2 * a + 1] === 0 && !ground.fixed[2 * a] && !ground.fixed[2 * a + 1];
  const degree = () => { const d = new Int32Array(nn); for (const mb of members) { d[mb.i]++; d[mb.j]++; } return d; };
  let dangling = 0, mergedChains = 0;
  if (dropDangling) {
    for (;;) {
      const d = degree();
      const before = members.length;
      members = members.filter(mb => !((d[mb.i] === 1 && isPlain(mb.i)) || (d[mb.j] === 1 && isPlain(mb.j))));
      dangling += before - members.length;
      if (members.length === before) break;
    }
  }
  if (merge) {
    for (;;) {
      const d = degree();
      let did = false;
      for (let a = 0; a < nn && !did; a++) {
        if (d[a] !== 2 || !isPlain(a)) continue;
        const idx = [];
        members.forEach((mb, q) => { if (mb.i === a || mb.j === a) idx.push(q); });
        const m1 = members[idx[0]], m2 = members[idx[1]];
        const o1 = m1.i === a ? m1.j : m1.i, o2 = m2.i === a ? m2.j : m2.i;
        if (o1 === o2) continue;
        const p1 = ground.nodes[o1], pa = ground.nodes[a], p2 = ground.nodes[o2];
        const u1x = (pa.x - p1.x) / m1.L, u1y = (pa.y - p1.y) / m1.L, u2x = (p2.x - pa.x) / m2.L, u2y = (p2.y - pa.y) / m2.L;
        const cross = u1x * u2y - u1y * u2x, dot = u1x * u2x + u1y * u2y;
        if (Math.abs(cross) > 1e-9 || dot <= 0) continue;
        const L = m1.L + m2.L;
        const A = (m1.A * m1.L + m2.A * m2.L) / L;
        const nm = { i: o1, j: o2, L, cx: (p2.x - p1.x) / L, cy: (p2.y - p1.y) / L, A, source: m1.source.concat(m2.source), merged: true };
        members = members.filter((_, q) => q !== idx[0] && q !== idx[1]);
        members.push(nm);
        mergedChains++;
        did = true;
      }
      if (!did) break;
    }
  }
  return {
    members, Amax, thresholdArea: thr, theta,
    stats: { candidates: n, kept: kept0, belowThreshold: n - kept0, dangling, mergedChains, final: members.length },
  };
}

export function scaleLayout(layout, s) {
  return Object.assign({}, layout, { members: layout.members.map(mb => Object.assign({}, mb, { A: mb.A * s })) });
}

// Exact re-solve of a layout. Returns { ok: true, stable, feasible, members:[{i,j,L,A,N,sigma,U,Pcr,Ubuck,volume}], compliance,
// volume, mass, Umax, governing, nActive, nMembers, strainEnergyCheck, residual, u, mechanism } or { ok: false, error, message }.
// stable === false means the stiffness matrix is singular but the load is orthogonal to every zero-stiffness mode, so the
// member forces are still unique (plastic designs often hang a roller on a single bar). feasible requires stable.
export function verifyLayout(ground, layout, opts) {
  const { E, sigmaT, sigmaC, rho } = opts;
  const members = layout.members;
  const areas = members.map(mb => mb.A);
  const sol = solveElastic(ground, members, areas, E);
  if (sol.error) {
    return {
      ok: false, stable: false, error: sol.error, message: sol.message, nMembers: members.length,
      members: members.map(mb => ({ i: mb.i, j: mb.j, L: mb.L, cx: mb.cx, cy: mb.cy, A: mb.A, N: NaN, sigma: NaN, U: NaN, merged: !!mb.merged })),
      mode: sol.mode || null, movingNodes: sol.movingNodes || null, modeCount: sol.modeCount || 0,
    };
  }
  let volume = 0, Umax = -Infinity, governing = -1, nActive = 0, Cse = 0, nTension = 0, nCompression = 0, UbuckMax = 0;
  const out = members.map((mb, k) => {
    const N = sol.N[k];
    const sigma = N / mb.A;
    const U = sigma >= 0 ? sigma / sigmaT : -sigma / sigmaC;
    const Pcr = Math.PI * Math.PI * E * (mb.A * mb.A / 12) / (mb.L * mb.L);   // Euler screen, solid square section, K = 1
    const Ubuck = N < 0 ? -N / Pcr : 0;
    volume += mb.A * mb.L;
    Cse += N * N * mb.L / (E * mb.A);
    if (U > Umax) { Umax = U; governing = k; }
    if (U >= UTIL_ACTIVE) nActive++;
    if (N > 1e-9 * Math.abs(sol.compliance + 1)) nTension++; else if (N < -1e-9 * Math.abs(sol.compliance + 1)) nCompression++;
    if (Ubuck > UbuckMax) UbuckMax = Ubuck;
    return { i: mb.i, j: mb.j, L: mb.L, cx: mb.cx, cy: mb.cy, A: mb.A, N, sigma, U, Pcr, Ubuck, volume: mb.A * mb.L, merged: !!mb.merged };
  });
  const mass = volume * rho / 1000;
  const stable = !sol.mechanism;
  return {
    ok: true, stable, feasible: stable && Umax <= 1 + FEAS_TOL, stressOk: Umax <= 1 + FEAS_TOL,
    members: out, compliance: sol.compliance, volume, mass, Umax, governing,
    nActive, nMembers: members.length, nTension, nCompression, UbuckMax,
    strainEnergyCheck: Math.abs(Cse - sol.compliance) / Math.max(Math.abs(sol.compliance), 1e-300),
    residual: equilibriumResidual(ground, members, sol.N), u: Array.from(sol.u), reactions: Array.from(sol.reactions),
    mechanism: sol.mechanism, mode: sol.mechanism ? sol.mechanism.mode : null, movingNodes: sol.mechanism ? sol.mechanism.movingNodes : null,
    modeCount: sol.mechanism ? sol.mechanism.count : 0,
  };
}

function uniformLayout(ground, A) {
  return thresholdLayout(ground, new Float64Array(ground.members.length).fill(A), 0, { merge: false, dropDangling: false });
}

// ---------------------------------------------------------------------------------------------
// Full pipeline: baseline, OC, LP, thresholding, verification, comparisons
// ---------------------------------------------------------------------------------------------

function plainGround(g) {
  return {
    nodes: g.nodes, members: g.members.map(m => ({ i: m.i, j: m.j, L: m.L })), fixed: Array.from(g.fixed), loads: Array.from(g.loads),
    nx: g.nx, ny: g.ny, W: g.W, H: g.H, sumL: g.sumL, loadNode: g.loadNode, nFree: g.freeDofs.length, nMembers: g.members.length,
  };
}

function scaledVerify(ground, layout, verify, opts) {
  if (!verify || !verify.ok || !(verify.Umax > 0)) return null;
  const s = verify.Umax;
  const v = verifyLayout(ground, scaleLayout(layout, s), opts);
  return v.ok ? { scale: s, verify: v } : null;
}

// Thresholds at theta and re-solves exactly. If the thresholded layout is a mechanism (or the load is cut off), the
// threshold is halved repeatedly (down to 0) until a stable layout is found; the warning tells the student what happened.
// Returns { layout, verify, thetaUsed, thetaRequested, tried, warning }.
export function thresholdAndVerify(ground, areas, theta, vopts, label = 'layout') {
  const tried = [];
  let th = theta, layout = null, verify = null;
  for (let k = 0; k < 16; k++) {
    layout = thresholdLayout(ground, areas, th);
    verify = verifyLayout(ground, layout, vopts);
    tried.push({ theta: th, members: layout.stats.final, ok: verify.ok, stable: !!verify.stable, error: verify.ok ? null : verify.error });
    if (verify.ok && verify.stable) break;
    if (th === 0) break;
    th = th / 2;
    if (th < 1e-4) th = 0;
  }
  let warning = null;
  const first = tried[0];
  const nodesText = (v) => (v.movingNodes && v.movingNodes.length)
    ? ` Moving nodes: ${v.movingNodes.slice(0, 6).map(m => m.node).join(', ')}${v.movingNodes.length > 6 ? ', ...' : ''}.` : '';
  if (!verify.ok) {
    warning = `The ${label} thresholded at theta = ${theta} is kinematically unstable, lower the threshold. ` +
      `Even with every nonzero member kept the load cannot be carried (${verify.message}).${nodesText(verify)}`;
  } else if (!verify.stable) {
    warning = (th !== theta ? `The ${label} thresholded at theta = ${theta} (${first.members} members) is kinematically unstable, lower the threshold. ` : '') +
      `The ${label} with every nonzero member kept (theta = ${th}, ${layout.stats.final} members) is a mechanism with ${verify.modeCount} zero-stiffness mode${verify.modeCount === 1 ? '' : 's'}: ` +
      `it carries this load in equilibrium (member forces are unique and reported) but has no stiffness against the drawn mode, so it needs bracing before it is a usable truss.${nodesText(verify)}`;
  } else if (th !== theta) {
    warning = `The ${label} thresholded at theta = ${theta} (${first.members} members) is kinematically unstable, lower the threshold. ` +
      `It was verified at theta = ${th} (${layout.stats.final} members) instead: thin members just above the cut were needed to brace a chain of two-bar joints.`;
  }
  return { layout, verify, thetaUsed: th, thetaRequested: theta, tried, warning };
}

// Generator: yields progress objects { stage, fraction, text } and returns the result object.
export function* runAllSteps(params) {
  const t0 = nowMs();
  const p = normalizeParams(params);
  const val = validateParams(p);
  if (!val.ok) return { error: 'invalid', messages: val.errors };
  const ground = buildGround(p);
  const mat = MATERIALS[p.material];
  const E = mat.E, rho = mat.rho;
  const vopts = { E, sigmaT: p.sigmaT, sigmaC: p.sigmaC, rho };

  // Baseline: the student's design point, every candidate bar at the reference area.
  const baseLayout = uniformLayout(ground, p.Aref);
  const baseVerify = verifyLayout(ground, baseLayout, vopts);
  if (!baseVerify.ok) return { error: 'ground', message: 'The ground structure itself cannot be analysed: ' + baseVerify.message };
  const baseScaled = scaledVerify(ground, baseLayout, baseVerify, vopts);
  yield { stage: 'baseline', fraction: 0.02, text: 'Baseline (uniform ground structure) solved' };

  // OC
  const Vt = p.volfrac * p.Aref * ground.sumL;
  const Amin = p.aminFrac * p.Aref;
  const tOc = nowMs();
  const oc = ocCreate(ground, { E, Vt, Amin, maxIter: p.oc.maxIter, tol: p.oc.tol, move: p.oc.move, eta: p.oc.eta });
  while (!oc.done) {
    ocStep(oc);
    yield { stage: 'oc', fraction: 0.02 + 0.48 * Math.min(1, oc.iter / p.oc.maxIter), text: `OC iteration ${oc.iter}: compliance ${oc.compliance.toPrecision(5)} N mm` };
  }
  const ocRes = ocResult(oc);
  if (ocRes.error) return { error: 'oc', message: 'OC failed: ' + ocRes.message };
  const ocTV = thresholdAndVerify(ground, ocRes.areas, p.theta, vopts, 'OC layout');
  const ocLayout = ocTV.layout, ocVerify = ocTV.verify;
  const ocScaled = scaledVerify(ground, ocLayout, ocVerify, vopts);
  const uniformAtBudget = verifyLayout(ground, uniformLayout(ground, Vt / ground.sumL), vopts);
  const ocMs = nowMs() - tOc;
  // Stress uniformity among kept members (at the OC optimum interior members share |sigma| = sqrt(lambda E)).
  let uniformity = null;
  if (ocVerify.ok) {
    let lo = Infinity, hi = 0;
    for (const mb of ocVerify.members) { const s = Math.abs(mb.sigma); if (s < lo) lo = s; if (s > hi) hi = s; }
    uniformity = { sigmaMin: lo, sigmaMax: hi, ratio: hi > 0 ? lo / hi : NaN, sigmaUniform: ocRes.sigmaUniform };
  }
  yield { stage: 'oc-done', fraction: 0.5, text: 'OC finished, starting the LP' };

  // LP
  const tLp = nowMs();
  const lp = lpCreate(ground, p.sigmaT, p.sigmaC, { rule: p.lp.rule || 'auto', maxPivots: p.lp.maxPivots || 0 });
  const span = lp.m0 + lp.n;
  while (lp.status === 'running') {
    simplexStep(lp, 25);
    const frac = 0.5 + 0.48 * Math.min(0.98, lp.pivots / (1.5 * span));
    const obj = lp.phase === 2 ? `volume ${s2obj(lp).toPrecision(5)} mm^3` : `infeasibility ${(-lp.T[lp.m * lp.nc + lp.rhs] * lp.bscale).toPrecision(3)} N`;
    yield { stage: 'lp', fraction: frac, text: `LP phase ${lp.phase}, pivot ${lp.pivots}: ${obj}` };
  }
  const lpRes = lpExtract(lp);
  const lpMs = nowMs() - tLp;
  let lpTV = null, lpLayout = null, lpVerify = null, lpScaled = null;
  if (lpRes.status === 'optimal') {
    lpTV = thresholdAndVerify(ground, lpRes.areas, p.theta, vopts, 'LP layout');
    lpLayout = lpTV.layout; lpVerify = lpTV.verify;
    lpScaled = scaledVerify(ground, lpLayout, lpVerify, vopts);
  }
  yield { stage: 'lp-done', fraction: 0.99, text: 'LP finished, verifying' };

  // Comparisons and classical checks
  const equalAllow = Math.abs(p.sigmaT - p.sigmaC) <= 1e-9 * p.sigmaT;
  let michell = null;
  if (lpRes.status === 'optimal' && equalAllow && lpRes.volume > 0) {
    const sig = p.sigmaT;
    const ocBound = ocVerify.ok ? (sig * lpRes.volume) ** 2 / (E * ocVerify.volume) : NaN;
    michell = {
      equalAllowables: true,
      ocBound, ocRatio: ocVerify.ok ? ocVerify.compliance / ocBound : NaN,
      lpFullyStressed: lpVerify && lpVerify.ok ? lpVerify.compliance * E / (sig * sig * lpVerify.volume) : NaN,
      invariantOC: ocVerify.ok ? ocVerify.compliance * ocVerify.volume * E / (sig * lpRes.volume) ** 2 : NaN,
      invariantLP: lpVerify && lpVerify.ok ? lpVerify.compliance * lpVerify.volume * E / (sig * lpRes.volume) ** 2 : NaN,
    };
  } else {
    michell = { equalAllowables: equalAllow, ocBound: NaN, ocRatio: NaN, lpFullyStressed: NaN, invariantOC: NaN, invariantLP: NaN };
  }
  const gains = {};
  if (baseScaled && lpScaled) {
    gains.massSaved_g = baseScaled.verify.mass - lpScaled.verify.mass;
    gains.massSavedPct = 100 * gains.massSaved_g / baseScaled.verify.mass;
  }
  if (ocVerify.ok && uniformAtBudget.ok) {
    gains.complianceReductionPct = 100 * (1 - ocVerify.compliance / uniformAtBudget.compliance);
  }
  if (ocScaled && lpScaled) gains.ocScaledOverLp = ocScaled.verify.mass / lpScaled.verify.mass;
  if (baseScaled && ocScaled) {
    gains.ocMassSaved_g = baseScaled.verify.mass - ocScaled.verify.mass;
    gains.ocMassSavedPct = 100 * gains.ocMassSaved_g / baseScaled.verify.mass;
  }

  return {
    version: VERSION, params: p, ground: plainGround(ground),
    material: { key: p.material, name: mat.name, E, rho, sigmaAllow: mat.sigmaAllow }, sigmaT: p.sigmaT, sigmaC: p.sigmaC,
    baseline: { layout: { stats: baseLayout.stats }, verify: baseVerify, scaled: baseScaled, Aref: p.Aref },
    oc: {
      Vt, Amin, areas: ocRes.areas, forces: ocRes.forces, history: ocRes.history, iterations: ocRes.iterations, converged: ocRes.converged,
      stoppedBy: ocRes.stoppedBy, compliance: ocRes.compliance, volume: ocRes.volume, lambda: ocRes.lambda, sigmaUniform: ocRes.sigmaUniform,
      totalBacktracks: ocRes.totalBacktracks, layout: { stats: ocLayout.stats, thresholdArea: ocLayout.thresholdArea, Amax: ocLayout.Amax },
      thetaUsed: ocTV.thetaUsed, thetaRequested: ocTV.thetaRequested, thresholdWarning: ocTV.warning, thresholdTried: ocTV.tried,
      verify: ocVerify, scaled: ocScaled, uniformAtBudget, uniformity, ms: ocMs,
    },
    lp: {
      status: lpRes.status, volume: lpRes.volume, pivots: lpRes.pivots, phase1Pivots: lpRes.phase1Pivots, history: lpRes.history,
      areas: lpRes.areas, forces: lpRes.forces, residual: lpRes.residual, refined: lpRes.refined, rowsRemoved: lpRes.rowsRemoved,
      nVariables: lpRes.nVariables, nConstraints: lpRes.nConstraints, infeasibility: lpRes.infeasibility, rule: lp.rule,
      refactors: lpRes.refactors, blandPivots: lpRes.blandPivots,
      layout: lpLayout ? { stats: lpLayout.stats, thresholdArea: lpLayout.thresholdArea, Amax: lpLayout.Amax } : null,
      thetaUsed: lpTV ? lpTV.thetaUsed : null, thetaRequested: p.theta, thresholdWarning: lpTV ? lpTV.warning : null, thresholdTried: lpTV ? lpTV.tried : null,
      verify: lpVerify, scaled: lpScaled, ms: lpMs,
    },
    michell, gains, ms: nowMs() - t0,
  };
}

export function runAll(params, onProgress) {
  const g = runAllSteps(params);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    if (onProgress) onProgress(r.value);
  }
}

// Chunked variant for a main-thread fallback: `yieldFn` returns a promise (for example a setTimeout wrapper) and is
// awaited between steps; `shouldCancel` may return true to stop early (result { cancelled: true }).
export async function runAllAsync(params, { onProgress, yieldFn, shouldCancel } = {}) {
  const g = runAllSteps(params);
  let last = 0;
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    if (onProgress) onProgress(r.value);
    if (shouldCancel && shouldCancel()) return { cancelled: true };
    if (yieldFn) {
      const t = nowMs();
      if (t - last > 30) { await yieldFn(); last = nowMs(); }
    }
  }
}

// CSV rows (header first) for the members of a verified layout.
export function membersCSVRows(result, which) {
  const v = which === 'oc' ? result.oc.verify : which === 'lp' ? (result.lp && result.lp.verify) : result.baseline.verify;
  const rows = [['design', 'member', 'node_i', 'node_j', 'xi_mm', 'yi_mm', 'xj_mm', 'yj_mm', 'L_mm', 'A_mm2', 'N_N', 'sigma_MPa', 'utilization', 'euler_screen', 'merged_chain']];
  if (!v || !v.ok) return rows;
  const nodes = result.ground.nodes;
  v.members.forEach((mb, k) => {
    const a = nodes[mb.i], b = nodes[mb.j];
    rows.push([which, k + 1, mb.i, mb.j, a.x, a.y, b.x, b.y, mb.L, mb.A, mb.N, mb.sigma, mb.U, mb.Ubuck, mb.merged ? 'yes' : 'no']);
  });
  return rows;
}
