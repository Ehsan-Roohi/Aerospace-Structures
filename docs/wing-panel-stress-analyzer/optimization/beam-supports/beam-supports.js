// MIE 446 Optimization Lab, module "beam-supports": support placement and worst-case load position.
// Pure ES module: solvers, optimizers and helpers only. No DOM access.
// Units: length mm, force N, moment N·mm, modulus and stress MPa (N/mm^2), flexural rigidity EI in N·mm^2.
//
// Sign convention (stated on the page as well): x to the right, y up. Loads and reactions are positive upward,
// point couples positive counterclockwise, the bending moment is positive when sagging (tension at the bottom),
// the shear force V is the sum of the upward forces to the left of the section (so V = dM/dx), and the
// deflection v is positive upward.

import { MATERIALS, sectionProps } from '../shared/presets.js';

export const VERSION = '0.1.1';
export const N_MIN_ELEMENTS = 120;

export const SIGN_CONVENTION =
  'x to the right, y up. Loads and reactions are positive upward, point couples positive counterclockwise, ' +
  'bending moment positive when sagging (tension at the bottom), shear V = sum of upward forces left of the section ' +
  '(so V = dM/dx), deflection positive upward.';

// Classical constants for a full-span uniformly distributed load (UDL) on two symmetric supports.
export const A1_OPT_RATIO = (Math.SQRT2 - 1) / 2;            // overhang a/L that minimizes the peak bending moment, 0.207107
export const A1_OPT_MOMENT_COEF = (3 - 2 * Math.SQRT2) / 8;   // peak |M| / (|w| L^2) at that optimum, 0.021447
export const A1_ENDS_MOMENT_COEF = 1 / 8;                     // peak |M| / (|w| L^2) with the supports at the ends
export const A1_REDUCTION = 1 - A1_OPT_MOMENT_COEF / A1_ENDS_MOMENT_COEF; // 0.8284

// Default inputs of the page (also used by the tests).
export const DEFAULT_INPUT = {
  L: 1000,
  material: 'al6061',
  section: { type: 'tube', D: 30, t: 2 },
  w: -2, wa: 0, wb: 1000,          // N/mm, upward positive: -2 N/mm is a 2 N/mm gravity-type load on the full span
  pointLoads: [],                  // [{ P (N, upward positive), a (mm) }]
  FS: 1.5,                         // factor of safety on the bending stress
  deflRatio: 250,                  // deflection limit L / deflRatio
  a: 0,                            // case A1: symmetric overhang (student's value)
  a1: 0, a2: 1000,                 // case A2: two independent supports (student's values)
  s: 500,                          // case A3: interior support position (student's value)
  xs: 500,                         // Part B: section of interest
  P: -1,                           // Part B: moving load (N, upward positive; -1 N is a unit downward load)
};

// ---------------------------------------------------------------------------------------------
// small numeric helpers
// ---------------------------------------------------------------------------------------------

export function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a + (b - a) * i / (n - 1);
  return out;
}

function fnum(x, digits = 4) {
  if (!Number.isFinite(x)) return String(x);
  return Number(x.toPrecision(digits)).toString();
}

function fail(error, warnings = []) {
  return { ok: false, error, warnings };
}

// Local maxima of |Y| along a sampled curve plus extra interior extrema, merged within mergeTol, sorted by magnitude.
function localAbsPeaks(X, Y, extra, mergeTol) {
  const cands = [];
  const n = X.length;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(Y[i]);
    if (!(a > 0)) continue;
    const prev = i > 0 ? Math.abs(Y[i - 1]) : -1, next = i < n - 1 ? Math.abs(Y[i + 1]) : -1;
    if (a >= prev && a >= next) cands.push({ x: X[i], value: Y[i] });
  }
  for (const e of extra) cands.push(e);
  cands.sort((p, q) => Math.abs(q.value) - Math.abs(p.value));
  const out = [];
  for (const c of cands) if (!out.some(o => Math.abs(o.x - c.x) <= mergeTol)) out.push(c);
  return out;
}

// ---------------------------------------------------------------------------------------------
// parameters: material card, section, loads
// ---------------------------------------------------------------------------------------------

function requireNumber(v, name) {
  const x = typeof v === 'string' ? parseFloat(v) : v;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${name} must be a finite number.`);
  return x;
}

// Turns raw page inputs into a validated parameter set with derived E, I, c, A and EI.
export function makeParams(raw = {}) {
  const p = Object.assign({}, DEFAULT_INPUT, raw);
  const L = requireNumber(p.L, 'Beam length L');
  if (!(L > 0)) throw new Error('Beam length L must be positive (mm).');
  const mat = MATERIALS[p.material];
  if (!mat) throw new Error(`Unknown material card "${p.material}".`);
  const section = p.section || DEFAULT_INPUT.section;
  let sec;
  try { sec = sectionProps(section.type, section); } catch (e) { throw new Error('Unknown section type.'); }
  if (!Number.isFinite(sec.I) || !(sec.I > 0)) throw new Error('Section properties are invalid: check the wall thickness against the outer dimensions.');
  const E = requireNumber(p.E !== undefined ? p.E : mat.E, 'Modulus E');
  if (!(E > 0)) throw new Error('Modulus E must be positive (MPa).');
  const w = requireNumber(p.w, 'UDL intensity w');
  const wa = requireNumber(p.wa, 'UDL start a');
  const wb = requireNumber(p.wb, 'UDL end b');
  if (wa < 0 || wb > L) throw new Error(`The UDL extent [${wa}, ${wb}] mm must lie inside the beam [0, ${L}] mm.`);
  if (w !== 0 && !(wb > wa)) throw new Error('The UDL end b must be larger than its start a.');
  const pointLoads = [];
  for (const pl of p.pointLoads || []) {
    const P = requireNumber(pl.P, 'Point load P');
    const a = requireNumber(pl.a, 'Point load position a');
    if (a < 0 || a > L) throw new Error(`Point load position ${a} mm lies outside the beam [0, ${L}] mm.`);
    pointLoads.push({ P, a });
  }
  const FS = requireNumber(p.FS, 'Factor of safety FS');
  if (!(FS > 0)) throw new Error('Factor of safety FS must be positive.');
  const deflRatio = requireNumber(p.deflRatio, 'Deflection limit ratio');
  if (!(deflRatio > 0)) throw new Error('Deflection limit ratio must be positive.');
  return {
    L, E, I: sec.I, c: sec.c, A: sec.A, EI: E * sec.I,
    w, wa, wb, pointLoads, FS, deflRatio,
    sigmaAllow: mat.sigmaAllow, rho: mat.rho, material: p.material, materialName: mat.name, section,
  };
}

// Load list of a parameter set in solver form.
export function loadsOf(params) {
  const loads = [];
  if (params.w !== 0 && params.wb > params.wa) loads.push({ type: 'udl', w: params.w, a: params.wa, b: params.wb });
  for (const pl of params.pointLoads || []) if (pl.P !== 0) loads.push({ type: 'point', P: pl.P, a: pl.a });
  return loads;
}

export function hasLoads(params) {
  return loadsOf(params).length > 0;
}

// ---------------------------------------------------------------------------------------------
// support layouts of the three cases
// ---------------------------------------------------------------------------------------------

export function layoutA1(a, L) { return [{ x: a, type: 'pin' }, { x: L - a, type: 'pin' }]; }
export function layoutA2(a1, a2) { return [{ x: a1, type: 'pin' }, { x: a2, type: 'pin' }]; }
export function layoutA3(s, L) { return [{ x: 0, type: 'pin' }, { x: s, type: 'pin' }, { x: L, type: 'pin' }]; }

export function describeSupports(supports) {
  return supports.map(s => `${s.type} at ${fnum(s.x, 5)} mm`).join(', ');
}

// ---------------------------------------------------------------------------------------------
// banded Cholesky (symmetric positive definite, half bandwidth 3: two DOFs per node, two nodes per element)
// ---------------------------------------------------------------------------------------------

const HB = 3;
const BW = HB + 1;

// ab: upper band storage, ab[i*BW + k] = A[i][i+k]. Returns the solution or null if a non-positive pivot appears.
function bandCholeskySolve(ab, n, f) {
  const lb = new Float64Array(n * BW); // lower band, lb[i*BW + k] = Lmat[i][i-k]
  for (let i = 0; i < n; i++) {
    const jmin = Math.max(0, i - HB);
    for (let j = jmin; j <= i; j++) {
      let s = ab[j * BW + (i - j)];
      const mmin = Math.max(jmin, j - HB);
      for (let m = mmin; m < j; m++) s -= lb[i * BW + (i - m)] * lb[j * BW + (j - m)];
      if (j === i) {
        if (!(s > 0)) return null;
        lb[i * BW] = Math.sqrt(s);
      } else {
        lb[i * BW + (i - j)] = s / lb[j * BW];
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = f[i];
    for (let k = 1; k <= HB && i - k >= 0; k++) s -= lb[i * BW + k] * y[i - k];
    y[i] = s / lb[i * BW];
  }
  const u = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = 1; k <= HB && i + k < n; k++) s -= lb[(i + k) * BW + k] * u[i + k];
    u[i] = s / lb[i * BW];
  }
  return u;
}

function bandRowDot(ab, i, u, n) {
  let s = 0;
  for (let k = 0; k < BW && i + k < n; k++) s += ab[i * BW + k] * u[i + k];
  for (let k = 1; k <= HB && i - k >= 0; k++) s += ab[(i - k) * BW + k] * u[i - k];
  return s;
}

// Antiderivatives of the Hermite shape functions in the element coordinate xi (0..1), used for partial UDL coverage.
const I1 = x => x - x * x * x + 0.5 * x * x * x * x;
const I2 = x => 0.5 * x * x - (2 / 3) * x * x * x + 0.25 * x * x * x * x;
const I3 = x => x * x * x - 0.5 * x * x * x * x;
const I4 = x => -(1 / 3) * x * x * x + 0.25 * x * x * x * x;

// ---------------------------------------------------------------------------------------------
// exact beam solver: Euler-Bernoulli, 2-node Hermite cubic elements, uniform EI
// ---------------------------------------------------------------------------------------------
//
// model = { L, EI, supports: [{ x, type: 'pin'|'clamp' }], loads: [{type:'point', P, a} | {type:'udl', w, a, b} |
//           {type:'moment', C, a}], nMin (default 120), extraNodes: [x...] (positions that must be mesh nodes) }
//
// Nodes are placed at both ends, at every support, at every load point and UDL end and at the extra nodes, then each
// segment is refined uniformly so that at least nMin elements span the beam. Breakpoints closer than a quarter of the
// target element length are merged (supports take precedence over load points, the beam ends over everything) so that
// no badly scaled tiny element appears; loads keep their exact positions through consistent (work-equivalent) load vectors.
// Nodal displacements of this element are exact for the Euler-Bernoulli beam, so the reactions are exact and the internal
// shear and moment are recovered exactly by statics from the loads and the reactions. The deflection between nodes is
// the Hermite cubic interpolant (exact for point loads, interpolation error of order (h/L)^4 under a UDL).
export function solveBeam(model) {
  const L = +model.L, EI = +model.EI;
  if (!Number.isFinite(L) || !(L > 0)) return fail('Beam length must be a positive number.');
  if (!Number.isFinite(EI) || !(EI > 0)) return fail('Flexural rigidity EI must be positive.');
  const nMin = model.nMin || N_MIN_ELEMENTS;
  const warnings = [];

  // --- supports
  const sup0 = [];
  for (const s of model.supports || []) {
    const x = +s.x;
    if (!Number.isFinite(x)) return fail('A support position is not a number.');
    if (x < -1e-9 * L || x > L * (1 + 1e-9)) return fail(`Support at ${fnum(x, 6)} mm lies outside the beam [0, ${fnum(L, 6)}] mm.`);
    sup0.push({ x: Math.min(L, Math.max(0, x)), type: s.type === 'clamp' ? 'clamp' : 'pin' });
  }

  // --- loads
  const loads = [];
  for (const ld of model.loads || []) {
    if (ld.type === 'point') {
      const P = +ld.P, a = +ld.a;
      if (!Number.isFinite(P) || !Number.isFinite(a)) return fail('A point load has a non-numeric value or position.');
      if (a < -1e-9 * L || a > L * (1 + 1e-9)) return fail(`Point load at ${fnum(a, 6)} mm lies outside the beam.`);
      if (P !== 0) loads.push({ type: 'point', P, a: Math.min(L, Math.max(0, a)) });
    } else if (ld.type === 'moment') {
      const C = +ld.C, a = +ld.a;
      if (!Number.isFinite(C) || !Number.isFinite(a)) return fail('A point couple has a non-numeric value or position.');
      if (a < -1e-9 * L || a > L * (1 + 1e-9)) return fail(`Point couple at ${fnum(a, 6)} mm lies outside the beam.`);
      if (C !== 0) loads.push({ type: 'moment', C, a: Math.min(L, Math.max(0, a)) });
    } else if (ld.type === 'udl') {
      const w = +ld.w, a = +ld.a, b = +ld.b;
      if (!Number.isFinite(w) || !Number.isFinite(a) || !Number.isFinite(b)) return fail('A distributed load has a non-numeric value or extent.');
      if (a < -1e-9 * L || b > L * (1 + 1e-9)) return fail('A distributed load extends beyond the beam.');
      if (w !== 0 && b > a) loads.push({ type: 'udl', w, a: Math.max(0, a), b: Math.min(L, b) });
    } else {
      return fail(`Unknown load type "${ld.type}".`);
    }
  }

  // --- breakpoints and merging
  const hT = L / nMin;
  const tol = 0.25 * hT;
  const pts = [{ x: 0, pr: 3 }, { x: L, pr: 3 }];
  sup0.forEach((s, i) => pts.push({ x: s.x, pr: 2, sup: i }));
  for (const ld of loads) {
    if (ld.type === 'udl') { pts.push({ x: ld.a, pr: 1 }); pts.push({ x: ld.b, pr: 1 }); }
    else pts.push({ x: ld.a, pr: 1 });
  }
  for (const x of model.extraNodes || []) if (Number.isFinite(x) && x >= 0 && x <= L) pts.push({ x, pr: 1 });
  pts.sort((p, q) => (p.x - q.x) || (q.pr - p.pr));
  const clusters = [];
  for (const p of pts) {
    const c = clusters[clusters.length - 1];
    if (c && p.x - c.x0 <= tol) {
      c.members.push(p);
      if (p.pr > c.repPr) { c.rep = p.x; c.repPr = p.pr; }
    } else {
      clusters.push({ x0: p.x, rep: p.x, repPr: p.pr, members: [p] });
    }
  }
  const supports = [];
  for (const c of clusters) {
    const sups = c.members.filter(m => m.sup !== undefined).map(m => sup0[m.sup]);
    if (!sups.length) continue;
    const type = sups.some(s => s.type === 'clamp') ? 'clamp' : 'pin';
    if (sups.length > 1) {
      warnings.push(`${sups.length} supports closer than ${fnum(tol, 3)} mm (at ${sups.map(s => fnum(s.x, 6)).join(', ')} mm) were merged into one ${type} at ${fnum(c.rep, 6)} mm.`);
    } else if (sups[0].x !== c.rep) {
      warnings.push(`Support at ${fnum(sups[0].x, 6)} mm was moved to the mesh node at ${fnum(c.rep, 6)} mm (closer than ${fnum(tol, 3)} mm).`);
    }
    supports.push({ x: c.rep, type });
  }
  supports.sort((p, q) => p.x - q.x);

  // --- mechanism check (complete for a straight beam with pins and clamps)
  const nEff = supports.reduce((s, sp) => s + (sp.type === 'clamp' ? 2 : 1), 0);
  if (nEff < 2) {
    return fail(supports.length === 0
      ? 'Mechanism: the beam has no support. Add at least two pins at different positions or one clamp.'
      : 'Mechanism: a single pin cannot hold the beam (it can still rotate). Add another support or use a clamp.', warnings);
  }

  // --- mesh
  const bps = clusters.map(c => c.rep);
  const nodes = [];
  for (let k = 0; k < bps.length - 1; k++) {
    const x0 = bps[k], x1 = bps[k + 1], len = x1 - x0;
    const m = Math.max(1, Math.ceil(len / hT - 1e-9));
    for (let i = 0; i < m; i++) nodes.push(x0 + len * i / m);
  }
  nodes.push(L);
  const nn = nodes.length, ne = nn - 1, ndof = 2 * nn;

  const locate = x => { // index of the element containing x
    let lo = 0, hi = ne - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid] <= x) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
  const nodeIndexOf = x => {
    let lo = 0, hi = nn - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (nodes[mid] === x) return mid;
      if (nodes[mid] < x) lo = mid + 1; else hi = mid - 1;
    }
    // fall back to the nearest node (should not happen: breakpoints are nodes by construction)
    let best = 0;
    for (let i = 1; i < nn; i++) if (Math.abs(nodes[i] - x) < Math.abs(nodes[best] - x)) best = i;
    return best;
  };

  // --- stiffness (upper band) and consistent load vector
  const ab = new Float64Array(ndof * BW);
  const f = new Float64Array(ndof);
  for (let e = 0; e < ne; e++) {
    const h = nodes[e + 1] - nodes[e];
    const k0 = EI / (h * h * h);
    const d = 2 * e;
    ab[d * BW + 0] += 12 * k0; ab[d * BW + 1] += 6 * h * k0; ab[d * BW + 2] += -12 * k0; ab[d * BW + 3] += 6 * h * k0;
    ab[(d + 1) * BW + 0] += 4 * h * h * k0; ab[(d + 1) * BW + 1] += -6 * h * k0; ab[(d + 1) * BW + 2] += 2 * h * h * k0;
    ab[(d + 2) * BW + 0] += 12 * k0; ab[(d + 2) * BW + 1] += -6 * h * k0;
    ab[(d + 3) * BW + 0] += 4 * h * h * k0;
  }
  for (const ld of loads) {
    if (ld.type === 'point' || ld.type === 'moment') {
      const e = locate(ld.a), x0 = nodes[e], h = nodes[e + 1] - x0;
      const xi = (ld.a - x0) / h, xi2 = xi * xi, xi3 = xi2 * xi, d = 2 * e;
      if (ld.type === 'point') {
        const P = ld.P;
        f[d] += P * (1 - 3 * xi2 + 2 * xi3);
        f[d + 1] += P * h * (xi - 2 * xi2 + xi3);
        f[d + 2] += P * (3 * xi2 - 2 * xi3);
        f[d + 3] += P * h * (-xi2 + xi3);
      } else {
        const C = ld.C;
        f[d] += C * (-6 * xi + 6 * xi2) / h;
        f[d + 1] += C * (1 - 4 * xi + 3 * xi2);
        f[d + 2] += C * (6 * xi - 6 * xi2) / h;
        f[d + 3] += C * (-2 * xi + 3 * xi2);
      }
    } else {
      const e0 = locate(ld.a), e1 = locate(ld.b);
      for (let e = e0; e <= e1 && e < ne; e++) {
        const x0 = nodes[e], h = nodes[e + 1] - x0;
        const xa = Math.max(0, Math.min(1, (ld.a - x0) / h));
        const xb = Math.max(0, Math.min(1, (ld.b - x0) / h));
        if (xb <= xa) continue;
        const wh = ld.w * h, d = 2 * e;
        f[d] += wh * (I1(xb) - I1(xa));
        f[d + 1] += wh * h * (I2(xb) - I2(xa));
        f[d + 2] += wh * (I3(xb) - I3(xa));
        f[d + 3] += wh * h * (I4(xb) - I4(xa));
      }
    }
  }

  // --- constraints by row and column elimination on a copy of the band
  const cdofs = [];
  for (const s of supports) {
    s.node = nodeIndexOf(s.x);
    cdofs.push(2 * s.node);
    if (s.type === 'clamp') cdofs.push(2 * s.node + 1);
  }
  const am = ab.slice(), fm = f.slice();
  for (const c of cdofs) {
    for (let k = 0; k < BW; k++) am[c * BW + k] = 0;
    for (let k = 1; k <= HB; k++) if (c - k >= 0) am[(c - k) * BW + k] = 0;
    am[c * BW] = 1;
    fm[c] = 0;
  }
  const u = bandCholeskySolve(am, ndof, fm);
  if (!u) return fail('Singular stiffness matrix: the support layout does not restrain the beam.', warnings);

  // --- reactions from the unmodified stiffness
  for (const s of supports) {
    const c = 2 * s.node;
    s.R = bandRowDot(ab, c, u, ndof) - f[c];
    s.Mr = s.type === 'clamp' ? bandRowDot(ab, c + 1, u, ndof) - f[c + 1] : 0;
  }

  // --- statics tables: point forces (loads and reactions), couples, distributed loads
  const px = [], pF = [], cx = [], cC = [], ua = [], ub = [], uw = [];
  for (const ld of loads) {
    if (ld.type === 'point') { px.push(ld.a); pF.push(ld.P); }
    else if (ld.type === 'moment') { cx.push(ld.a); cC.push(ld.C); }
    else { ua.push(ld.a); ub.push(ld.b); uw.push(ld.w); }
  }
  for (const s of supports) {
    px.push(s.x); pF.push(s.R);
    if (s.type === 'clamp') { cx.push(s.x); cC.push(s.Mr); }
  }
  const np = px.length, nc = cx.length, nu = ua.length;

  // side: -1 left limit, +1 right limit, 0 mean of both (only matters exactly at a point force or couple)
  const shearAt = (x, side = 0) => {
    let V = 0;
    for (let i = 0; i < np; i++) {
      const d = x - px[i];
      if (d > 0) V += pF[i];
      else if (d === 0) V += side > 0 ? pF[i] : side < 0 ? 0 : 0.5 * pF[i];
    }
    for (let i = 0; i < nu; i++) {
      const e = Math.min(x, ub[i]);
      if (e > ua[i]) V += uw[i] * (e - ua[i]);
    }
    return V;
  };
  const momentAt = (x, side = 0) => {
    let M = 0;
    for (let i = 0; i < np; i++) {
      const d = x - px[i];
      if (d > 0) M += pF[i] * d;
    }
    for (let i = 0; i < nu; i++) {
      const e = Math.min(x, ub[i]);
      if (e > ua[i]) M += uw[i] * ((e - ua[i]) * (x - 0.5 * (e + ua[i])));
    }
    for (let i = 0; i < nc; i++) {
      const d = x - cx[i];
      if (d > 0) M -= cC[i];
      else if (d === 0) M -= side > 0 ? cC[i] : side < 0 ? 0 : 0.5 * cC[i];
    }
    return M;
  };
  const deflectionAt = xIn => {
    const x = xIn <= 0 ? 0 : xIn >= L ? L : xIn;
    const e = locate(x), x0 = nodes[e], h = nodes[e + 1] - x0;
    const xi = (x - x0) / h, xi2 = xi * xi, xi3 = xi2 * xi, d = 2 * e;
    return u[d] * (1 - 3 * xi2 + 2 * xi3) + u[d + 1] * h * (xi - 2 * xi2 + xi3) + u[d + 2] * (3 * xi2 - 2 * xi3) + u[d + 3] * h * (-xi2 + xi3);
  };
  const rotationAt = xIn => {
    const x = xIn <= 0 ? 0 : xIn >= L ? L : xIn;
    const e = locate(x), x0 = nodes[e], h = nodes[e + 1] - x0;
    const xi = (x - x0) / h, xi2 = xi * xi, d = 2 * e;
    return (u[d] * (-6 * xi + 6 * xi2) + u[d + 1] * h * (1 - 4 * xi + 3 * xi2) + u[d + 2] * (6 * xi - 6 * xi2) + u[d + 3] * h * (-2 * xi + 3 * xi2)) / h;
  };

  // --- sample positions for the diagrams: nodes, element midpoints, UDL ends, and both sides of every jump
  const raw = [];
  for (let e = 0; e < ne; e++) {
    raw.push({ x: nodes[e], s: 0 });
    raw.push({ x: 0.5 * (nodes[e] + nodes[e + 1]), s: 0 });
  }
  raw.push({ x: L, s: 0 });
  for (let i = 0; i < nu; i++) { raw.push({ x: ua[i], s: 0 }); raw.push({ x: ub[i], s: 0 }); }
  for (let i = 0; i < np; i++) { raw.push({ x: px[i], s: -1 }); raw.push({ x: px[i], s: 1 }); }
  for (let i = 0; i < nc; i++) { raw.push({ x: cx[i], s: -1 }); raw.push({ x: cx[i], s: 1 }); }
  raw.sort((p, q) => (p.x - q.x) || (p.s - q.s));
  const samples = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const prev = samples[samples.length - 1];
    if (prev && prev.x === p.x) {
      if (prev.s === p.s) continue;              // identical sample
      if (p.s === 0) continue;                   // a plain sample at a jump position: keep the sided ones only
      if (prev.s === 0) { samples.pop(); }       // replace the plain sample by the sided pair
    }
    samples.push(p);
  }
  const ns = samples.length;
  const X = new Float64Array(ns), V = new Float64Array(ns), M = new Float64Array(ns), D = new Float64Array(ns);
  for (let i = 0; i < ns; i++) {
    X[i] = samples[i].x;
    V[i] = shearAt(samples[i].x, samples[i].s);
    M[i] = momentAt(samples[i].x, samples[i].s);
    D[i] = deflectionAt(samples[i].x);
  }

  // --- peaks (exact for M and V by statics, exact for the Hermite interpolant for v)
  const peaks = {
    absM: 0, xM: 0, sagM: 0, xSag: 0, hogM: 0, xHog: 0,
    absV: 0, xV: 0,
    absD: 0, xD: 0, upD: 0, xUp: 0, downD: 0, xDown: 0,
  };
  const noteM = (m, x) => {
    const a = Math.abs(m);
    if (a > peaks.absM) { peaks.absM = a; peaks.xM = x; }
    if (m > peaks.sagM) { peaks.sagM = m; peaks.xSag = x; }
    if (m < peaks.hogM) { peaks.hogM = m; peaks.xHog = x; }
  };
  const noteD = (v, x) => {
    const a = Math.abs(v);
    if (a > peaks.absD) { peaks.absD = a; peaks.xD = x; }
    if (v > peaks.upD) { peaks.upD = v; peaks.xUp = x; }
    if (v < peaks.downD) { peaks.downD = v; peaks.xDown = x; }
  };
  for (let i = 0; i < ns; i++) {
    noteM(M[i], X[i]);
    noteD(D[i], X[i]);
    const a = Math.abs(V[i]);
    if (a > peaks.absV) { peaks.absV = a; peaks.xV = X[i]; }
  }
  // interior extremum of the quadratic moment between consecutive samples (only inside a distributed load)
  const interiorM = [], interiorD = [];
  for (let i = 0; i + 1 < ns; i++) {
    const xl = X[i], xr = X[i + 1];
    if (!(xr > xl)) continue;
    let wt = 0;
    for (let k = 0; k < nu; k++) if (ua[k] <= xl && ub[k] >= xr) wt += uw[k];
    if (wt === 0) continue;
    const Vl = shearAt(xl, 1);
    const sStar = -Vl / wt;
    if (sStar > 0 && sStar < xr - xl) { const mv = momentAt(xl + sStar); noteM(mv, xl + sStar); interiorM.push({ x: xl + sStar, value: mv }); }
  }
  // interior extrema of the cubic deflection inside each element
  for (let e = 0; e < ne; e++) {
    const h = nodes[e + 1] - nodes[e], d = 2 * e;
    const v1 = u[d], t1 = h * u[d + 1], v2 = u[d + 2], t2 = h * u[d + 3];
    const A = 6 * v1 + 3 * t1 - 6 * v2 + 3 * t2;
    const B = -6 * v1 - 4 * t1 + 6 * v2 - 2 * t2;
    const C = t1;
    const roots = [];
    if (Math.abs(A) < 1e-300) { if (B !== 0) roots.push(-C / B); }
    else {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) { const sq = Math.sqrt(disc); roots.push((-B + sq) / (2 * A), (-B - sq) / (2 * A)); }
    }
    for (const r of roots) if (r > 0 && r < 1) { const x = nodes[e] + r * h; const dv = deflectionAt(x); noteD(dv, x); interiorD.push({ x, value: dv }); }
  }
  // ranked local peaks of |M| and |v| (largest first); at a minimax optimum the leading peaks tie
  peaks.listM = localAbsPeaks(X, M, interiorM, hT);
  peaks.listD = localAbsPeaks(X, D, interiorD, hT);

  return {
    ok: true,
    L, EI, E: model.E, I: model.I,
    nodes, elements: ne, dofs: ndof, u, tol,
    supports, reactions: supports, loads, warnings,
    x: X, V, M, v: D, peaks,
    shearAt, momentAt, deflectionAt, rotationAt,
  };
}

// Solve a parameter set with a given support layout (optionally with a replaced load list or extra nodes).
export function solveLayout(params, supports, opts = {}) {
  return solveBeam({
    L: params.L, EI: params.EI, E: params.E, I: params.I,
    supports, loads: opts.loads || loadsOf(params),
    nMin: opts.nMin || N_MIN_ELEMENTS, extraNodes: opts.extraNodes || [],
  });
}

// Scalar objective of a layout: peak |M| ('moment') or peak |v| ('deflection'); Infinity for an invalid layout.
export function objective(params, supports, which = 'moment') {
  const r = solveLayout(params, supports);
  if (!r.ok) return Infinity;
  return which === 'deflection' ? r.peaks.absD : r.peaks.absM;
}

// ---------------------------------------------------------------------------------------------
// verification: rebuild the model from the candidate layout, solve with the plain solver, check the constraints
// ---------------------------------------------------------------------------------------------
//
// Returns { ok, error?, result, absM, absD, absV, sigmaMax, U_stress, U_defl, feasible, governing, balance, matches, reactions }.
// `claimed` (optional) is the optimizer's own value of the objective `which`; `matches` says whether the fresh
// solve reproduces it to 1e-9 relative.
export function verifyLayout(params, supports, opts = {}) {
  const which = opts.which || 'moment';
  for (let i = 1; i < supports.length; i++) {
    if (!(supports[i].x > supports[i - 1].x)) {
      return { ok: false, error: `Support positions must be strictly increasing (got ${fnum(supports[i - 1].x, 6)} mm followed by ${fnum(supports[i].x, 6)} mm).`, feasible: false };
    }
  }
  const r = solveLayout(params, supports);
  if (!r.ok) return { ok: false, error: r.error, feasible: false, warnings: r.warnings };
  const sigmaMax = r.peaks.absM * params.c / params.I;
  const U_stress = sigmaMax * params.FS / params.sigmaAllow;
  const U_defl = r.peaks.absD / (params.L / params.deflRatio);
  const value = which === 'deflection' ? r.peaks.absD : r.peaks.absM;
  const matches = opts.claimed === undefined || opts.claimed === null ? null
    : Math.abs(value - opts.claimed) <= 1e-9 * Math.max(Math.abs(opts.claimed), 1e-300) + 1e-12;
  const sag = Math.abs(r.peaks.sagM), hog = Math.abs(r.peaks.hogM);
  const up = Math.abs(r.peaks.upD), down = Math.abs(r.peaks.downD);
  // ratio of the second largest local peak to the largest: close to 1 means a minimax tie (the active condition)
  const ratioOf = list => (list.length > 1 && Math.abs(list[0].value) > 0 ? Math.abs(list[1].value) / Math.abs(list[0].value) : 0);
  return {
    ok: true,
    result: r,
    absM: r.peaks.absM, absD: r.peaks.absD, absV: r.peaks.absV,
    sigmaMax, U_stress, U_defl,
    feasible: U_stress <= 1 && U_defl <= 1,
    governing: U_stress >= U_defl ? 'stress' : 'deflection',
    balance: {
      sagging: sag, hogging: hog,
      up, down,
      momentPeaks: r.peaks.listM.slice(0, 4), momentRatio: ratioOf(r.peaks.listM),
      deflectionPeaks: r.peaks.listD.slice(0, 4), deflectionRatio: ratioOf(r.peaks.listD),
    },
    value, matches,
    reactions: r.supports.map(s => ({ x: s.x, type: s.type, R: s.R, Mr: s.Mr })),
    warnings: r.warnings,
  };
}

// ---------------------------------------------------------------------------------------------
// optimizers (deterministic)
// ---------------------------------------------------------------------------------------------

// Golden-section search for the minimum of a unimodal f on [a, b]. Returns { x, fx, iterations, evaluations }.
export function goldenSection(f, a, b, tol = 1e-8, maxIter = 200) {
  const gr = (Math.sqrt(5) - 1) / 2;
  if (b < a) { const t = a; a = b; b = t; }
  let c = b - gr * (b - a), d = a + gr * (b - a);
  let fc = f(c), fd = f(d);
  let evaluations = 2, iterations = 0;
  while (b - a > tol && iterations < maxIter) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
    evaluations++; iterations++;
  }
  let x = fc < fd ? c : d, fx = Math.min(fc, fd);
  const xm = 0.5 * (a + b), fm = f(xm); evaluations++;
  if (fm < fx) { x = xm; fx = fm; }
  return { x, fx, iterations, evaluations };
}

// Nelder-Mead simplex search with a projection onto the feasible box (opts.project maps any point to a feasible one).
// Returns { x, fx, iterations, evaluations, converged }.
export function nelderMead(f, x0, opts = {}) {
  const n = x0.length;
  const project = opts.project || (p => p.slice());
  const maxIter = opts.maxIter ?? 500;
  const xtol = opts.xtol ?? 1e-8, ftol = opts.ftol ?? 1e-14;
  const step = Array.isArray(opts.step) ? opts.step : new Array(n).fill(opts.step ?? 0.1);
  const dist = (p, q) => { let s = 0; for (let i = 0; i < n; i++) s += (p[i] - q[i]) ** 2; return Math.sqrt(s); };
  const pts = [project(x0.slice())];
  for (let i = 0; i < n; i++) {
    let p = pts[0].slice(); p[i] += step[i]; p = project(p);
    if (dist(p, pts[0]) < 1e-12 * (1 + Math.abs(step[i]))) { p = pts[0].slice(); p[i] -= step[i]; p = project(p); }
    pts.push(p);
  }
  let vals = pts.map(f);
  let evaluations = n + 1, iterations = 0, converged = false;
  const order = () => {
    const idx = vals.map((v, i) => i).sort((i, j) => vals[i] - vals[j]);
    const p2 = idx.map(i => pts[i]), v2 = idx.map(i => vals[i]);
    for (let i = 0; i <= n; i++) { pts[i] = p2[i]; vals[i] = v2[i]; }
  };
  for (; iterations < maxIter; iterations++) {
    order();
    let size = 0;
    for (let i = 1; i <= n; i++) size = Math.max(size, dist(pts[i], pts[0]));
    const spread = Math.abs(vals[n] - vals[0]);
    if (size <= xtol && spread <= ftol * Math.max(1, Math.abs(vals[0]))) { converged = true; break; }
    if (size <= xtol * 1e-3) { converged = true; break; }
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const worst = pts[n];
    const xr = project(c.map((cj, j) => cj + (cj - worst[j])));
    const fr = f(xr); evaluations++;
    if (fr < vals[0]) {
      const xe = project(c.map((cj, j) => cj + 2 * (cj - worst[j])));
      const fe = f(xe); evaluations++;
      if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; }
    } else if (fr < vals[n - 1]) {
      pts[n] = xr; vals[n] = fr;
    } else {
      let xc, fc;
      if (fr < vals[n]) { xc = project(c.map((cj, j) => cj + 0.5 * (xr[j] - cj))); }
      else { xc = project(c.map((cj, j) => cj + 0.5 * (worst[j] - cj))); }
      fc = f(xc); evaluations++;
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          pts[i] = project(pts[0].map((b, j) => b + 0.5 * (pts[i][j] - b)));
          vals[i] = f(pts[i]); evaluations++;
        }
      }
    }
  }
  order();
  return { x: pts[0], fx: vals[0], iterations, evaluations, converged };
}

// Refine the minimum of a sampled curve: golden-section search in the bracket around the best grid point.
export function refineGridMinimum(xs, ys, f, tol) {
  let i = -1, best = Infinity;
  for (let k = 0; k < ys.length; k++) if (Number.isFinite(ys[k]) && ys[k] < best) { best = ys[k]; i = k; }
  if (i < 0) return null;
  const lo = xs[Math.max(0, i - 1)], hi = xs[Math.min(xs.length - 1, i + 1)];
  const g = goldenSection(f, lo, hi, tol);
  let x = g.x, value = g.fx;
  if (best < value) { x = xs[i]; value = best; }
  return { x, value, gridX: xs[i], gridValue: best, evaluations: g.evaluations };
}

// Same for a maximum of |y| (worst case).
export function refineGridAbsMax(xs, ys, f, tol) {
  let i = -1, best = -1;
  for (let k = 0; k < ys.length; k++) if (Number.isFinite(ys[k]) && Math.abs(ys[k]) > best) { best = Math.abs(ys[k]); i = k; }
  if (i < 0) return null;
  const lo = xs[Math.max(0, i - 1)], hi = xs[Math.min(xs.length - 1, i + 1)];
  const g = goldenSection(x => -Math.abs(f(x)), lo, hi, tol);
  let x = g.x, value = f(g.x);
  if (best > Math.abs(value)) { x = xs[i]; value = ys[i]; }
  return { x, value, gridX: xs[i], gridValue: ys[i], evaluations: g.evaluations + 1 };
}

// ---------------------------------------------------------------------------------------------
// Part A: support placement sweeps
// ---------------------------------------------------------------------------------------------

function refinedOptimum(params, xs, ys, which, layoutOf) {
  const tol = 1e-7 * params.L;
  const ref = refineGridMinimum(xs, ys, x => objective(params, layoutOf(x), which), tol);
  if (!ref) return null;
  const supports = layoutOf(ref.x);
  const verify = verifyLayout(params, supports, { which, claimed: ref.value });
  return Object.assign(ref, { which, supports, verify, verified: verify.ok && verify.matches === true });
}

// Case A1: two pins at a and L - a. Sweeps a over n values and refines the minimum of both peak |M| and peak |v|.
export function sweepA1(params, opts = {}) {
  const L = params.L;
  const n = opts.n ?? 400;
  const aMax = opts.aMax ?? 0.49 * L;
  const a = linspace(0, aMax, n);
  const M = new Array(n), D = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = solveLayout(params, layoutA1(a[i], L));
    M[i] = r.ok ? r.peaks.absM : NaN;
    D[i] = r.ok ? r.peaks.absD : NaN;
  }
  const layoutOf = x => layoutA1(x, L);
  const optM = refinedOptimum(params, a, M, 'moment', layoutOf);
  const optD = refinedOptimum(params, a, D, 'deflection', layoutOf);
  const ends = solveLayout(params, layoutA1(0, L));
  const wRef = Math.abs(params.w) > 0 ? Math.abs(params.w) : null;
  return {
    a, M, D, optM, optD,
    endsM: ends.ok ? ends.peaks.absM : NaN, endsD: ends.ok ? ends.peaks.absD : NaN,
    classical: {
      applies: wRef !== null && params.wa === 0 && params.wb === L && (params.pointLoads || []).every(p => p.P === 0),
      aRatio: A1_OPT_RATIO, a: A1_OPT_RATIO * L,
      momentCoef: A1_OPT_MOMENT_COEF, moment: wRef ? A1_OPT_MOMENT_COEF * wRef * L * L : NaN,
      endsMoment: wRef ? A1_ENDS_MOMENT_COEF * wRef * L * L : NaN, reduction: A1_REDUCTION,
    },
  };
}

// Case A3: pins at 0, s and L. Sweeps s and refines both optima; also returns the classical two-span check at s = L/2.
export function sweepA3(params, opts = {}) {
  const L = params.L;
  const n = opts.n ?? 400;
  const sMin = opts.sMin ?? 0.02 * L, sMax = opts.sMax ?? 0.98 * L;
  const s = linspace(sMin, sMax, n);
  const M = new Array(n), D = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = solveLayout(params, layoutA3(s[i], L));
    M[i] = r.ok ? r.peaks.absM : NaN;
    D[i] = r.ok ? r.peaks.absD : NaN;
  }
  const layoutOf = x => layoutA3(x, L);
  const optM = refinedOptimum(params, s, M, 'moment', layoutOf);
  const optD = refinedOptimum(params, s, D, 'deflection', layoutOf);
  return { s, M, D, optM, optD, twoSpan: twoSpanCheck(params) };
}

// Classical two-span check: pins at 0, L/2 and L under a full-span UDL alone (point loads excluded on purpose).
export function twoSpanCheck(params) {
  const L = params.L;
  const w = params.w !== 0 ? params.w : -1;
  const r = solveBeam({ L, EI: params.EI, supports: layoutA3(L / 2, L), loads: [{ type: 'udl', w, a: 0, b: L }] });
  if (!r.ok) return { ok: false, error: r.error };
  const aw = Math.abs(w);
  return {
    ok: true, w,
    hogging: r.momentAt(L / 2), hoggingClassical: w * L * L / 32,
    reactions: r.supports.map(s => s.R),
    reactionsClassical: [3 * aw * L / 16, 10 * aw * L / 16, 3 * aw * L / 16].map(v => (w < 0 ? v : -v)),
    sagging: r.peaks.sagM, saggingClassical: w < 0 ? 9 * aw * L * L / 512 : NaN,
    appliesToInputs: params.wa === 0 && params.wb === L && params.w !== 0 && (params.pointLoads || []).every(p => p.P === 0),
  };
}

// Case A2: two independent pins a1 < a2. Generator that yields after each heatmap row so a page can run it in chunks.
// Z[j][i] holds the objective for a1 = a1s[i] (column) and a2 = a2s[j] (row); infeasible cells (a1 >= a2) are NaN and masked.
export function* heatmapA2(params, opts = {}) {
  const L = params.L;
  const n = opts.n ?? 60;
  const which = opts.which || 'moment';
  const a1s = linspace(0, L, n), a2s = linspace(0, L, n);
  const Z = [], mask = [];
  for (let j = 0; j < n; j++) { Z.push(new Array(n).fill(NaN)); mask.push(new Array(n).fill(false)); }
  let best = { value: Infinity, i: -1, j: -1 };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (a1s[i] >= a2s[j] - 1e-9 * L) { mask[j][i] = true; continue; }
      const r = solveLayout(params, layoutA2(a1s[i], a2s[j]));
      if (!r.ok) { mask[j][i] = true; continue; }
      const val = which === 'deflection' ? r.peaks.absD : r.peaks.absM;
      Z[j][i] = val;
      if (val < best.value) best = { value: val, i, j };
    }
    yield { j, n, a1s, a2s, Z, mask };
  }
  return { a1s, a2s, Z, mask, which, best: best.i >= 0 ? { a1: a1s[best.i], a2: a2s[best.j], value: best.value, i: best.i, j: best.j } : null };
}

// Runs the whole heatmap synchronously (tests and scripts).
export function heatmapA2Sync(params, opts = {}) {
  const gen = heatmapA2(params, opts);
  let res = gen.next();
  while (!res.done) res = gen.next();
  return res.value;
}

// Nelder-Mead refinement of the A2 optimum from a start point, with projection onto 0 <= a1 <= a2 - gap, a2 <= L.
export function refineA2(params, start, opts = {}) {
  const L = params.L;
  const which = opts.which || 'moment';
  const gap = opts.minGap ?? 0.02 * L;
  const project = p => {
    const a1 = Math.min(Math.max(p[0], 0), L - gap);
    const a2 = Math.min(Math.max(p[1], a1 + gap), L);
    return [a1, a2];
  };
  const f = p => { const q = project(p); return objective(params, layoutA2(q[0], q[1]), which); };
  const nm = nelderMead(f, [start[0], start[1]], { project, step: opts.step ?? 0.02 * L, xtol: 1e-7 * L, ftol: 1e-13, maxIter: opts.maxIter ?? 400 });
  const q = project(nm.x);
  const supports = layoutA2(q[0], q[1]);
  const verify = verifyLayout(params, supports, { which, claimed: nm.fx });
  return { a1: q[0], a2: q[1], value: nm.fx, which, supports, verify, verified: verify.ok && verify.matches === true, iterations: nm.iterations, evaluations: nm.evaluations, converged: nm.converged };
}

// ---------------------------------------------------------------------------------------------
// Part B: influence lines and worst-case load position
// ---------------------------------------------------------------------------------------------
//
// A load P moves along the beam of the given support layout (the other loads are removed: an influence line is the
// response to the moving load alone). For the section xs it returns the bending moment, the shear and the deflection at
// xs, and the reaction at supports[reactionIndex] (index into the sorted, merged support list), versus the load position.
// Each worst case (largest |value|) is refined by golden-section search and confirmed by a fresh solve at that position.
export function influenceLines(params, supports, opts = {}) {
  const L = params.L;
  const xs = opts.xs ?? L / 2;
  const P = opts.P ?? -1;
  const n = opts.n ?? 200;
  if (!Number.isFinite(xs) || xs < 0 || xs > L) return { ok: false, error: `The section x_s must lie inside the beam [0, ${fnum(L, 6)}] mm.` };
  if (!Number.isFinite(P) || P === 0) return { ok: false, error: 'The moving load P must be a non-zero number.' };
  const probe = solveBeam({ L, EI: params.EI, supports, loads: [{ type: 'point', P, a: 0 }], extraNodes: [xs] });
  if (!probe.ok) return { ok: false, error: probe.error, warnings: probe.warnings };
  const layout = probe.supports.map(s => ({ x: s.x, type: s.type }));
  const reactionIndex = Math.min(Math.max(0, opts.reactionIndex ?? 0), layout.length - 1);
  const evalAt = xp => {
    const r = solveBeam({ L, EI: params.EI, supports: layout, loads: [{ type: 'point', P, a: xp }], extraNodes: [xs] });
    if (!r.ok) return null;
    return { M: r.momentAt(xs, 0), V: r.shearAt(xs, 0), D: r.deflectionAt(xs), R: r.supports[reactionIndex].R, result: r };
  };
  const xp = linspace(0, L, n);
  const M = new Array(n), V = new Array(n), D = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = evalAt(xp[i]);
    M[i] = e ? e.M : NaN; V[i] = e ? e.V : NaN; D[i] = e ? e.D : NaN; R[i] = e ? e.R : NaN;
  }
  const tol = 1e-7 * L;
  const worstOf = (ys, key) => {
    const ref = refineGridAbsMax(xp, ys, x => { const e = evalAt(x); return e ? e[key] : NaN; }, tol);
    if (!ref) return null;
    const fresh = evalAt(ref.x);
    const value = fresh ? fresh[key] : NaN;
    const matches = fresh !== null && Math.abs(value - ref.value) <= 1e-9 * Math.max(Math.abs(ref.value), 1e-300) + 1e-12;
    return { x: ref.x, value, gridX: ref.gridX, gridValue: ref.gridValue, verified: matches, result: fresh ? fresh.result : null };
  };
  return {
    ok: true, xs, P, xp, M, V, D, R, supports: layout, reactionIndex,
    worst: { M: worstOf(M, 'M'), V: worstOf(V, 'V'), D: worstOf(D, 'D'), R: worstOf(R, 'R') },
    warnings: probe.warnings,
  };
}

// Classical check: simply supported beam, section at midspan, moment influence line is a triangle with peak L/4 per unit load.
export function classicalILCheck(params, n = 201) {
  const L = params.L;
  const il = influenceLines(params, [{ x: 0, type: 'pin' }, { x: L, type: 'pin' }], { xs: L / 2, P: -1, n });
  if (!il.ok) return { ok: false, error: il.error };
  let peak = 0, xPeak = 0;
  for (let i = 0; i < n; i++) if (Math.abs(il.M[i]) > peak) { peak = Math.abs(il.M[i]); xPeak = il.xp[i]; }
  // triangle check: the ordinate at a quarter span should be half the peak
  const q = il.M[Math.round((n - 1) / 4)];
  return { ok: true, peak, xPeak, classical: L / 4, relErr: Math.abs(peak - L / 4) / (L / 4), quarterOrdinate: q, quarterClassical: L / 8, il };
}

// ---------------------------------------------------------------------------------------------
// classical checks shown on the page (fresh solves with the actual L, EI and UDL intensity)
// ---------------------------------------------------------------------------------------------

export function classicalChecks(params, opts = {}) {
  const L = params.L, EI = params.EI;
  const w = params.w !== 0 ? params.w : -1;
  const aw = Math.abs(w);
  const rows = [];
  const push = (name, computed, classical, unit) => rows.push({
    name, computed, classical, unit,
    relErr: Number.isFinite(computed) && Number.isFinite(classical) && classical !== 0 ? Math.abs(computed - classical) / Math.abs(classical) : NaN,
  });
  const ss = solveBeam({ L, EI, supports: layoutA1(0, L), loads: [{ type: 'udl', w, a: 0, b: L }] });
  if (ss.ok) {
    push('Simply supported, full-span UDL: midspan moment |M(L/2)| = |w| L^2 / 8', Math.abs(ss.momentAt(L / 2)), aw * L * L / 8, 'N·mm');
    push('Simply supported, full-span UDL: midspan deflection 5 |w| L^4 / (384 EI)', Math.abs(ss.deflectionAt(L / 2)), 5 * aw * L ** 4 / (384 * EI), 'mm');
  }
  const ts = twoSpanCheck(params);
  if (ts.ok) {
    push('Two equal spans (pins at 0, L/2, L), UDL: hogging moment over the middle support |w| L^2 / 32', Math.abs(ts.hogging), aw * L * L / 32, 'N·mm');
    push('Two equal spans, UDL: end reaction 3 |w| L / 16', Math.abs(ts.reactions[0]), 3 * aw * L / 16, 'N');
    push('Two equal spans, UDL: middle reaction 10 |w| L / 16', Math.abs(ts.reactions[1]), 10 * aw * L / 16, 'N');
  }
  // reuse the page's own A1 sweep when the inputs already are a full-span UDL alone
  const sw = opts.sweepA1 && opts.sweepA1.classical && opts.sweepA1.classical.applies
    ? opts.sweepA1
    : sweepA1(Object.assign({}, params, { w, wa: 0, wb: L, pointLoads: [] }), { n: 200 });
  if (sw.optM) {
    push('Symmetric overhang that minimizes the peak moment, a / L = (sqrt(2) - 1) / 2', sw.optM.x / L, A1_OPT_RATIO, '');
    push('Peak moment at that overhang, |M| / (|w| L^2) = (3 - 2 sqrt(2)) / 8', sw.optM.value / (aw * L * L), A1_OPT_MOMENT_COEF, '');
    push('Reduction of the peak moment versus supports at the ends', 1 - sw.optM.value / sw.endsM, A1_REDUCTION, 'fraction');
  }
  const il = classicalILCheck(params);
  if (il.ok) push('Moment influence line at midspan of a simply supported beam: peak = L / 4 per unit load', il.peak, L / 4, 'mm (N·mm per N)');
  return rows;
}

// ---------------------------------------------------------------------------------------------
// text parsers for the page (pure string handling)
// ---------------------------------------------------------------------------------------------

const NUM = '([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?)';

// "P@a" entries separated by commas, semicolons or new lines, e.g. "-300@250; -100 at 900" (N at mm).
export function parsePointLoads(text, L) {
  const loads = [];
  const t = String(text || '').trim();
  if (!t) return { ok: true, loads };
  const re = new RegExp('^' + NUM + '\\s*(?:N)?\\s*(?:@|at)\\s*' + NUM + '\\s*(?:mm)?$', 'i');
  for (const raw of t.split(/[;,\n]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const m = s.match(re);
    if (!m) return { ok: false, error: `Cannot read the point load "${s}". Use the form P@a, for example -300@250 (N at mm, upward positive).` };
    const P = parseFloat(m[1]), a = parseFloat(m[2]);
    if (!(a >= 0 && a <= L)) return { ok: false, error: `Point load position ${a} mm lies outside the beam [0, ${L}] mm.` };
    loads.push({ P, a });
  }
  return { ok: true, loads };
}

// "<x> [pin|clamp]" entries separated by commas, semicolons or new lines, e.g. "0 pin, 600 clamp, 1000".
export function parseSupports(text, L) {
  const supports = [];
  const t = String(text || '').trim();
  if (!t) return { ok: false, error: 'The support list is empty. Example: 0 pin, 700 pin, 1000 pin.' };
  const re = new RegExp('^' + NUM + '\\s*(?:mm)?\\s*([a-z]*)$', 'i');
  for (const raw of t.split(/[;,\n]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const m = s.match(re);
    if (!m) return { ok: false, error: `Cannot read the support "${s}". Use "<position> pin" or "<position> clamp", for example "250 pin".` };
    const x = parseFloat(m[1]);
    const word = (m[2] || 'pin').toLowerCase();
    let type;
    if (['', 'pin', 'p', 'pinned', 'roller', 'r', 'simple'].includes(word)) type = 'pin';
    else if (['clamp', 'c', 'clamped', 'fixed', 'fix', 'f', 'built'].includes(word)) type = 'clamp';
    else return { ok: false, error: `Unknown support type "${word}" in "${s}". Use pin or clamp.` };
    if (!(x >= 0 && x <= L)) return { ok: false, error: `Support position ${x} mm lies outside the beam [0, ${L}] mm.` };
    supports.push({ x, type });
  }
  if (!supports.length) return { ok: false, error: 'The support list is empty.' };
  supports.sort((p, q) => p.x - q.x);
  return { ok: true, supports };
}
