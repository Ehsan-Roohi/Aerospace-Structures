// MIE 446 Optimization Lab: Fully Stressed Tapered Beam (module beam-fsd).
// Pure ES module: solvers, the fully stressed design (FSD) iteration, verification and classical references.
// No DOM access. Units: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g.
// Sign convention: y up, loads positive upward, bending moment M positive sagging (bottom fibre in tension),
// shear V = dM/dx. The beam model is Euler-Bernoulli, linear elastic, small deflection.

import { MATERIALS, sectionProps } from '../shared/presets.js';

export const VERSION = '0.1.1';

export const SUPPORT_TYPES = {
  cantilever: 'Cantilever (clamped at x = 0, free at x = L)',
  simply: 'Simply supported (pins at x = 0 and x = L)',
  propped: 'Propped cantilever (clamped at x = 0, pinned at x = L)',
};

export const SECTION_TYPES = {
  rect: 'Solid rectangle: fixed width b, variable depth h(x)',
  tube: 'Round tube: fixed outer diameter D, variable wall t(x)',
};

export const TAPER_MODES = {
  stepped: 'Stepped (one constant depth per segment)',
  linear: 'Linear taper (depth interpolated between segment midpoints)',
};

// Presets specific to this module. Loads follow the sign convention (positive upward).
export const FSD_PRESETS = {
  'galileo-steel': {
    name: 'Galileo cantilever: steel strip 500 mm, 400 N tip load, b = 10 mm',
    support: 'cantilever', L: 500,
    loads: [{ type: 'point', P: 400, a: 500 }],
    material: 'steel', FS: 1.5, deflectionLimitRatio: 40,
    section: { type: 'rect', b: 10 }, minDim: 2, N: 24, taper: 'stepped',
  },
  'printed-spar': {
    name: 'Printed wing spar (PLA): cantilever 600 mm, 20 N tip lift, b = 12 mm',
    support: 'cantilever', L: 600,
    loads: [{ type: 'point', P: 20, a: 600 }],
    material: 'pla', FS: 2.0, deflectionLimitRatio: 50,
    section: { type: 'rect', b: 12 }, minDim: 2, N: 24, taper: 'stepped',
  },
  'ss-udl-rect': {
    name: 'Simply supported spruce plank 1200 mm, 1.5 N/mm downward, b = 40 mm (pi/4 case)',
    support: 'simply', L: 1200,
    loads: [{ type: 'udl', w: -1.5, a: 0, b: 1200 }],
    material: 'spruce', FS: 1.5, deflectionLimitRatio: 60,
    section: { type: 'rect', b: 40 }, minDim: 2, N: 24, taper: 'stepped',
  },
  'ss-udl-tube': {
    name: 'Simply supported aluminium tube 1000 mm, 3 N/mm downward, D = 40 mm',
    support: 'simply', L: 1000,
    loads: [{ type: 'udl', w: -3, a: 0, b: 1000 }],
    material: 'al6061', FS: 1.5, deflectionLimitRatio: 70,
    section: { type: 'tube', D: 40 }, minDim: 0.8, N: 24, taper: 'stepped',
  },
  'propped-udl': {
    name: 'Propped cantilever: steel strip 800 mm, 2 N/mm downward, b = 12 mm (indeterminate)',
    support: 'propped', L: 800,
    loads: [{ type: 'udl', w: -2, a: 0, b: 800 }],
    material: 'steel', FS: 1.5, deflectionLimitRatio: 150,
    section: { type: 'rect', b: 12 }, minDim: 2, N: 24, taper: 'stepped',
  },
  'mixed-loads': {
    name: 'Cantilever steel strip 700 mm, 300 N at 450 mm plus 1 N/mm on 200 to 700 mm, b = 12 mm (linear taper)',
    support: 'cantilever', L: 700,
    loads: [{ type: 'point', P: -300, a: 450 }, { type: 'udl', w: -1, a: 200, b: 700 }],
    material: 'steel', FS: 1.5, deflectionLimitRatio: 50,
    section: { type: 'rect', b: 12 }, minDim: 2, N: 28, taper: 'linear',
  },
};

export const DEFAULT_PRESET = 'galileo-steel';

// Tolerance used when checking U <= 1 on a verified design (floating point slack only).
export const U_TOL = 1e-6;

// ----------------------------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------------------------

function fail(message) { return { ok: false, error: message }; }
function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }

export function resolveMaterial(m) {
  if (typeof m === 'string') {
    const card = MATERIALS[m];
    if (!card) return null;
    return { key: m, name: card.name, E: card.E, sigmaAllow: card.sigmaAllow, rho: card.rho };
  }
  if (m && typeof m === 'object') {
    return { key: m.key || 'custom', name: m.name || 'Custom material', E: Number(m.E), sigmaAllow: Number(m.sigmaAllow), rho: Number(m.rho) };
  }
  return null;
}

// Returns { ok: true, model } with a normalized model, or { ok: false, error } (never throws for bad numbers).
export function validateModel(raw) {
  if (!raw || typeof raw !== 'object') return fail('The model must be an object.');
  const support = raw.support;
  if (!SUPPORT_TYPES[support]) return fail('Support type must be cantilever, simply or propped.');
  const L = Number(raw.L);
  if (!isNum(L) || L <= 0) return fail('Length L must be a positive number (mm).');
  const N = Math.round(Number(raw.N ?? 24));
  if (!Number.isFinite(N) || N < 2) return fail('Number of segments N must be at least 2.');
  if (N > 400) return fail('Number of segments N must not exceed 400.');
  const material = resolveMaterial(raw.material);
  if (!material) return fail('Unknown material card.');
  if (!isNum(material.E) || material.E <= 0) return fail('Modulus E must be positive (MPa).');
  if (!isNum(material.sigmaAllow) || material.sigmaAllow <= 0) return fail('Allowable stress must be positive (MPa).');
  if (!isNum(material.rho) || material.rho <= 0) return fail('Density must be positive (g/cm^3).');
  const FS = Number(raw.FS ?? 1);
  if (!isNum(FS) || FS <= 0) return fail('Factor of safety FS must be positive.');
  const k = Number(raw.deflectionLimitRatio);
  if (!isNum(k) || k <= 0) return fail('Deflection limit ratio k (limit L / k) must be positive.');
  const sec = raw.section || {};
  let section;
  if (sec.type === 'rect') {
    const b = Number(sec.b);
    if (!isNum(b) || b <= 0) return fail('Section width b must be positive (mm).');
    section = { type: 'rect', b };
  } else if (sec.type === 'tube') {
    const D = Number(sec.D);
    if (!isNum(D) || D <= 0) return fail('Tube outer diameter D must be positive (mm).');
    section = { type: 'tube', D };
  } else {
    return fail('Section family must be rect or tube.');
  }
  const minDim = Number(raw.minDim ?? (section.type === 'rect' ? 2 : 0.8));
  if (!isNum(minDim) || minDim <= 0) return fail(section.type === 'rect' ? 'Minimum depth h_min must be positive (mm).' : 'Minimum wall t_min must be positive (mm).');
  if (section.type === 'tube' && minDim >= section.D / 2) return fail('Minimum wall t_min must be smaller than D / 2.');
  const taper = raw.taper === 'linear' ? 'linear' : 'stepped';
  const rawLoads = Array.isArray(raw.loads) ? raw.loads : [];
  const loads = [];
  const tol = 1e-9 * L;
  for (const ld of rawLoads) {
    if (!ld || ld.type === 'none') continue;
    if (ld.type === 'point') {
      const P = Number(ld.P), a = Number(ld.a);
      if (!isNum(P)) return fail('Point load P must be a number (N).');
      if (!isNum(a) || a < -tol || a > L + tol) return fail('Point load position a must lie within 0 and L.');
      if (P === 0) continue;
      loads.push({ type: 'point', P, a: Math.min(L, Math.max(0, a)) });
    } else if (ld.type === 'udl') {
      const w = Number(ld.w), a = Number(ld.a), b = Number(ld.b);
      if (!isNum(w)) return fail('Uniform load w must be a number (N/mm).');
      if (!isNum(a) || !isNum(b) || a < -tol || b > L + tol) return fail('Uniform load ends a and b must lie within 0 and L.');
      if (b - a <= tol) return fail('Uniform load must have b greater than a.');
      if (w === 0) continue;
      loads.push({ type: 'udl', w, a: Math.max(0, a), b: Math.min(L, b) });
    } else {
      return fail('Load type must be point or udl.');
    }
  }
  if (loads.length === 0) return fail('At least one non-zero load is required.');
  return { ok: true, model: { support, L, N, material, FS, deflectionLimitRatio: k, section, minDim, taper, loads } };
}

// ----------------------------------------------------------------------------------------------
// Section helpers (one design variable per segment: depth h for rect, wall t for tube)
// ----------------------------------------------------------------------------------------------

export function segmentSection(model, dim) {
  if (model.section.type === 'rect') return sectionProps('rect', { b: model.section.b, h: dim });
  return sectionProps('tube', { D: model.section.D, t: dim });
}

// Dimension at which the stress utilization is exactly 1 for a bending moment of magnitude Mabs (before clamping).
export function requiredDim(model, Mabs) {
  const { FS, material } = model;
  if (model.section.type === 'rect') return Math.sqrt(6 * Mabs * FS / (model.section.b * material.sigmaAllow));
  const D = model.section.D;
  const Ireq = Mabs * (D / 2) * FS / material.sigmaAllow;
  const inner4 = D ** 4 - 64 * Ireq / Math.PI;
  if (inner4 <= 0) return Infinity; // even a solid rod cannot carry it
  return (D - inner4 ** 0.25) / 2;
}

export function clampDim(model, dim) {
  let d = Math.max(model.minDim, dim);
  if (model.section.type === 'tube') d = Math.min(d, model.section.D / 2);
  return d;
}

export function maxDim(model) {
  return model.section.type === 'tube' ? model.section.D / 2 : Infinity;
}

export function segmentMidpoints(model) {
  const dx = model.L / model.N;
  const xs = new Array(model.N);
  for (let i = 0; i < model.N; i++) xs[i] = (i + 0.5) * dx;
  return xs;
}

// ----------------------------------------------------------------------------------------------
// Mesh: nodes at segment boundaries plus every load position and support
// ----------------------------------------------------------------------------------------------

export function buildMesh(model) {
  const { L, N, loads } = model;
  const dx = L / N;
  const snap = 1e-7 * L;
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(i * dx);
  for (const ld of loads) {
    if (ld.type === 'point') xs.push(ld.a);
    else { xs.push(ld.a); xs.push(ld.b); }
  }
  xs.sort((p, q) => p - q);
  const nodes = [];
  for (const x of xs) if (nodes.length === 0 || x - nodes[nodes.length - 1] > snap) nodes.push(x);
  nodes[nodes.length - 1] = L; // keep the tip exactly at L
  const n = nodes.length;
  const nodeIndex = x => {
    let best = 0, bd = Infinity;
    for (let j = 0; j < n; j++) { const d = Math.abs(nodes[j] - x); if (d < bd) { bd = d; best = j; } }
    return best;
  };
  const elements = [];
  for (let j = 0; j < n - 1; j++) {
    const x1 = nodes[j], x2 = nodes[j + 1];
    const xm = 0.5 * (x1 + x2);
    const seg = Math.min(N - 1, Math.max(0, Math.floor(xm / dx)));
    let w = 0;
    for (const ld of loads) if (ld.type === 'udl' && ld.a <= x1 + snap && ld.b >= x2 - snap) w += ld.w;
    elements.push({ x1, x2, Le: x2 - x1, seg, w, n1: j, n2: j + 1 });
  }
  const nodalLoads = new Float64Array(2 * n);
  for (const ld of loads) if (ld.type === 'point') nodalLoads[2 * nodeIndex(ld.a)] += ld.P;
  const fixed = [];
  if (model.support === 'cantilever') fixed.push(0, 1);
  else if (model.support === 'simply') fixed.push(0, 2 * (n - 1));
  else fixed.push(0, 1, 2 * (n - 1));
  return { nodes, elements, nodalLoads, fixed, n };
}

// ----------------------------------------------------------------------------------------------
// Exact solver: 2-node Hermite cubic Euler-Bernoulli element, per-element EI, banded elimination
// ----------------------------------------------------------------------------------------------

function elementStiffness(EI, Le) {
  const a = EI / Le ** 3;
  const L2 = Le * Le;
  return [
    [12 * a, 6 * Le * a, -12 * a, 6 * Le * a],
    [6 * Le * a, 4 * L2 * a, -6 * Le * a, 2 * L2 * a],
    [-12 * a, -6 * Le * a, 12 * a, -6 * Le * a],
    [6 * Le * a, 2 * L2 * a, -6 * Le * a, 4 * L2 * a],
  ];
}

function consistentLoad(w, Le) {
  return [w * Le / 2, w * Le * Le / 12, w * Le / 2, -w * Le * Le / 12];
}

// Solve the banded symmetric positive definite system A x = b (A dense row-major m x m, half bandwidth hb) in place.
function solveBanded(A, b, m, hb) {
  let maxDiag = 0;
  for (let i = 0; i < m; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i * m + i]));
  const tiny = 1e-14 * (maxDiag || 1);
  for (let k = 0; k < m; k++) {
    const p = A[k * m + k];
    if (!(Math.abs(p) > tiny) || !Number.isFinite(p)) return null;
    const iEnd = Math.min(m - 1, k + hb);
    for (let i = k + 1; i <= iEnd; i++) {
      const f = A[i * m + k] / p;
      if (f === 0) continue;
      for (let j = k; j <= iEnd; j++) A[i * m + j] -= f * A[k * m + j];
      b[i] -= f * b[k];
    }
  }
  const x = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let s = b[i];
    const jEnd = Math.min(m - 1, i + hb);
    for (let j = i + 1; j <= jEnd; j++) s -= A[i * m + j] * x[j];
    x[i] = s / A[i * m + i];
  }
  return x;
}

// Largest |v| of the element polynomial v(xi) = c0 + c1 xi + c2 xi^2 + c3 xi^3 + c4 xi^4 on [0, Le].
function polyExtremum(c, Le) {
  const v = xi => c[0] + xi * (c[1] + xi * (c[2] + xi * (c[3] + xi * c[4])));
  const dv = xi => c[1] + xi * (2 * c[2] + xi * (3 * c[3] + xi * 4 * c[4]));
  let best = Math.abs(v(0)), xbest = 0;
  const vL = Math.abs(v(Le));
  if (vL > best) { best = vL; xbest = Le; }
  const ns = 12;
  let prev = dv(0), xp = 0;
  for (let s = 1; s <= ns; s++) {
    const xi = Le * s / ns;
    const cur = dv(xi);
    if (prev === 0 || (prev < 0) !== (cur < 0)) {
      let lo = xp, hi = xi, flo = prev;
      for (let it = 0; it < 50; it++) {
        const mid = 0.5 * (lo + hi), fm = dv(mid);
        if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      const xr = 0.5 * (lo + hi), vr = Math.abs(v(xr));
      if (vr > best) { best = vr; xbest = xr; }
    }
    prev = cur; xp = xi;
  }
  return { value: best, xi: xbest, sign: Math.sign(v(xbest)) };
}

// Solve the beam for a given design (array of N dimensions). Returns a rich solution object or { ok: false, error }.
export function solveBeam(model, design, opts = {}) {
  const { N, L, material } = model;
  if (!Array.isArray(design) && !(design instanceof Float64Array)) return fail('Design must be an array of segment dimensions.');
  if (design.length !== N) return fail(`Design must have N = ${N} entries.`);
  const sections = new Array(N);
  for (let i = 0; i < N; i++) {
    const d = Number(design[i]);
    if (!isNum(d) || d <= 0) return fail(`Segment ${i + 1} has an invalid dimension.`);
    const s = segmentSection(model, d);
    if (!isNum(s.I) || s.I <= 0) return fail(`Segment ${i + 1}: wall thickness exceeds the tube radius.`);
    sections[i] = s;
  }
  const mesh = opts.mesh || buildMesh(model);
  const { nodes, elements, nodalLoads, fixed, n } = mesh;
  const ndof = 2 * n;
  const K = new Float64Array(ndof * ndof);
  const F = Float64Array.from(nodalLoads);
  const EIs = new Array(elements.length);
  for (let e = 0; e < elements.length; e++) {
    const el = elements[e];
    const EI = material.E * sections[el.seg].I;
    EIs[e] = EI;
    const ke = elementStiffness(EI, el.Le);
    const fe = consistentLoad(el.w, el.Le);
    const dofs = [2 * el.n1, 2 * el.n1 + 1, 2 * el.n2, 2 * el.n2 + 1];
    for (let a = 0; a < 4; a++) {
      F[dofs[a]] += fe[a];
      for (let b = 0; b < 4; b++) K[dofs[a] * ndof + dofs[b]] += ke[a][b];
    }
  }
  const isFixed = new Uint8Array(ndof);
  for (const d of fixed) isFixed[d] = 1;
  const free = [];
  const red = new Int32Array(ndof).fill(-1);
  for (let d = 0; d < ndof; d++) if (!isFixed[d]) { red[d] = free.length; free.push(d); }
  const m = free.length;
  let hb = 1;
  for (const el of elements) {
    const dofs = [2 * el.n1, 2 * el.n1 + 1, 2 * el.n2, 2 * el.n2 + 1].map(d => red[d]).filter(r => r >= 0);
    if (dofs.length) hb = Math.max(hb, Math.max(...dofs) - Math.min(...dofs));
  }
  const A = new Float64Array(m * m);
  const bvec = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const gi = free[i];
    bvec[i] = F[gi];
    for (let j = 0; j < m; j++) A[i * m + j] = K[gi * ndof + free[j]];
  }
  const xfree = solveBanded(A, bvec, m, hb);
  if (!xfree) return fail('Unstable or singular structure: the stiffness matrix could not be factorized.');
  const d = new Float64Array(ndof);
  for (let i = 0; i < m; i++) d[free[i]] = xfree[i];
  // reactions: R = K d - F at the fixed degrees of freedom
  const reactions = [];
  for (const dof of fixed) {
    let s = 0;
    for (let j = 0; j < ndof; j++) s += K[dof * ndof + j] * d[j];
    const node = Math.floor(dof / 2);
    reactions.push({ x: nodes[node], kind: dof % 2 === 0 ? 'force' : 'moment', value: s - F[dof] });
  }
  // element recovery
  const dx = L / N;
  const segs = new Array(N);
  for (let i = 0; i < N; i++) {
    segs[i] = { index: i, x0: i * dx, x1: (i + 1) * dx, xmid: (i + 0.5) * dx, dim: Number(design[i]), A: sections[i].A, I: sections[i].I, c: sections[i].c,
      Mgov: 0, xgov: i * dx, Mmid: 0, sigma: 0, U: 0, atMin: Number(design[i]) <= model.minDim * (1 + 1e-9), atMax: Number(design[i]) >= maxDim(model) * (1 - 1e-9) };
  }
  const elOut = new Array(elements.length);
  const Mx = [], Mv = [], Vx = [], Vv = [], vx = [], vv = [];
  let vmax = 0, xvmax = 0, vmaxSigned = 0;
  const nplot = Math.max(4, Math.min(16, Math.ceil(64 / Math.max(1, elements.length / N))));
  for (let e = 0; e < elements.length; e++) {
    const el = elements[e];
    const { Le, w } = el;
    const EI = EIs[e];
    const de = [d[2 * el.n1], d[2 * el.n1 + 1], d[2 * el.n2], d[2 * el.n2 + 1]];
    const ke = elementStiffness(EI, Le);
    const fe = consistentLoad(w, Le);
    const f = [0, 0, 0, 0];
    for (let a = 0; a < 4; a++) { let s = -fe[a]; for (let b = 0; b < 4; b++) s += ke[a][b] * de[b]; f[a] = s; }
    const F1 = f[0], M1 = f[1], M2 = f[3];
    const Mint = xi => -M1 + F1 * xi + 0.5 * w * xi * xi;
    const Vint = xi => F1 + w * xi;
    // governing moment: ends and the interior extremum where V = 0
    const cands = [[0, Mint(0)], [Le, M2]];
    if (w !== 0) { const xs = -F1 / w; if (xs > 0 && xs < Le) cands.push([xs, Mint(xs)]); }
    let Mg = 0, xg = 0;
    for (const [xi, Mi] of cands) if (Math.abs(Mi) > Math.abs(Mg)) { Mg = Mi; xg = xi; }
    // deflection polynomial
    const [v1, t1, v2, t2] = de;
    const q = w / (24 * EI);
    const c = [v1, t1,
      -3 * v1 / (Le * Le) - 2 * t1 / Le + 3 * v2 / (Le * Le) - t2 / Le + q * Le * Le,
      2 * v1 / Le ** 3 + t1 / (Le * Le) - 2 * v2 / Le ** 3 + t2 / (Le * Le) - 2 * q * Le,
      q];
    const ext = polyExtremum(c, Le);
    if (ext.value > vmax) { vmax = ext.value; xvmax = el.x1 + ext.xi; vmaxSigned = ext.sign * ext.value; }
    for (let s = 0; s <= nplot; s++) {
      if (s === 0 && e > 0) continue;
      const xi = Le * s / nplot;
      const x = el.x1 + xi;
      Mx.push(x); Mv.push(Mint(xi));
      Vx.push(x); Vv.push(Vint(xi));
      vx.push(x); vv.push(c[0] + xi * (c[1] + xi * (c[2] + xi * (c[3] + xi * c[4]))));
    }
    if (w === 0 && e + 1 < elements.length) { /* shear jumps are shown by the next element's first sample */ }
    elOut[e] = { x1: el.x1, x2: el.x2, seg: el.seg, M1: Mint(0), M2, Mgov: Mg, xgov: el.x1 + xg, Mmid: Mint(Le / 2), V1: F1, V2: Vint(Le), w, EI, coeff: c };
    const sg = segs[el.seg];
    if (Math.abs(Mg) > Math.abs(sg.Mgov)) { sg.Mgov = Mg; sg.xgov = el.x1 + xg; }
    if (Math.abs(el.x1 + Le / 2 - sg.xmid) <= Le / 2 + 1e-9 * L) sg.Mmid = Mint(sg.xmid - el.x1);
  }
  let maxU = 0, govSeg = 0, mass = 0;
  for (let i = 0; i < N; i++) {
    const sg = segs[i];
    sg.sigma = Math.abs(sg.Mgov) * sg.c / sg.I;
    sg.U = sg.sigma * model.FS / material.sigmaAllow;
    if (sg.U > maxU) { maxU = sg.U; govSeg = i; }
    mass += sg.A * dx * material.rho / 1000;
  }
  const vlim = L / model.deflectionLimitRatio;
  return {
    ok: true, nodes, dofs: d, reactions, elements: elOut, segments: segs, maxU, govSeg, vmax, xvmax, vmaxSigned,
    Udefl: vmax / vlim, vlim, mass,
    curves: { M: { x: Mx, y: Mv }, V: { x: Vx, y: Vv }, v: { x: vx, y: vv } },
  };
}

// ----------------------------------------------------------------------------------------------
// Designs
// ----------------------------------------------------------------------------------------------

export function designMass(model, design) {
  const dx = model.L / model.N;
  let m = 0;
  for (let i = 0; i < model.N; i++) m += segmentSection(model, design[i]).A * dx * model.material.rho / 1000;
  return m;
}

// Prismatic design: one uniform dimension such that the stress utilization is exactly 1 (or the minimum if that already passes).
export function prismaticDesign(model, opts = {}) {
  const mesh = opts.mesh || buildMesh(model);
  const probe = new Array(model.N).fill(model.section.type === 'rect' ? Math.max(model.minDim, 10) : Math.max(model.minDim, Math.min(model.section.D / 4, 2)));
  const s0 = solveBeam(model, probe, { mesh });
  if (!s0.ok) return s0;
  let Mmax = 0;
  for (const sg of s0.segments) Mmax = Math.max(Mmax, Math.abs(sg.Mgov));
  const req = requiredDim(model, Mmax);
  if (!Number.isFinite(req) || req > maxDim(model) * (1 + 1e-12)) {
    return fail('The tube cannot carry the bending moment even as a solid rod: increase D, reduce the load or raise the allowable stress.');
  }
  const dim = clampDim(model, req);
  const design = new Array(model.N).fill(dim);
  const sol = solveBeam(model, design, { mesh });
  if (!sol.ok) return sol;
  return { ok: true, design, dim, Mmax, requiredDim: req, atMin: req < model.minDim, solution: sol };
}

// Fully stressed design iteration. Each segment is resized so that its governing section (largest |M| within the
// segment) is exactly at the allowable stress: h <- h sqrt(U) for the rectangle, exact I(t) update for the tube.
// The first iteration always applies the plain stress-ratio rule (exact for statically determinate beams). If the
// moments redistribute (propped cantilever), later iterations use h <- h U^(p/2) with the over-relaxation exponent
// p = opts.exponent (default 1.5, p = 1 is the textbook rule). The fixed point is the same: U = 1 on every free segment.
export const DEFAULT_EXPONENT = 1.5;

export function fsdDesign(model, opts = {}) {
  const tol = opts.tol ?? 1e-3;
  const maxIter = opts.maxIter ?? 60;
  const pExp = Math.min(1.75, Math.max(0.5, Number(opts.exponent ?? DEFAULT_EXPONENT) || DEFAULT_EXPONENT));
  const mesh = opts.mesh || buildMesh(model);
  let start = opts.start;
  if (!start) {
    const pr = prismaticDesign(model, { mesh });
    if (!pr.ok) return pr;
    start = pr.design;
  }
  let design = Array.from(start);
  let sol = solveBeam(model, design, { mesh });
  if (!sol.ok) return sol;
  const history = [];
  const dMax = maxDim(model);
  const deviation = (s, dsg) => {
    let dev = 0;
    for (const sg of s.segments) {
      const atMin = dsg[sg.index] <= model.minDim * (1 + 1e-9);
      const atMax = dsg[sg.index] >= dMax * (1 - 1e-9);
      const free = (!atMin || sg.U > 1) && (!atMax || sg.U < 1);
      if (free) dev = Math.max(dev, Math.abs(sg.U - 1));
    }
    return dev;
  };
  let dev = deviation(sol, design);
  history.push({ iter: 0, maxU: sol.maxU, mass: sol.mass, maxDev: dev, vmax: sol.vmax, exponent: null });
  let converged = dev < tol;
  let iterations = 0;
  let eta = 1; // plain stress-ratio rule on the first pass
  while (!converged && iterations < maxIter) {
    iterations++;
    const next = new Array(model.N);
    for (const sg of sol.segments) {
      const req = requiredDim(model, Math.abs(sg.Mgov));
      let target;
      if (!Number.isFinite(req)) target = dMax;
      else if (eta === 1) target = req;
      else target = sg.dim * Math.pow(req / sg.dim, eta);
      next[sg.index] = clampDim(model, target);
    }
    design = next;
    sol = solveBeam(model, design, { mesh });
    if (!sol.ok) return sol;
    dev = deviation(sol, design);
    history.push({ iter: iterations, maxU: sol.maxU, mass: sol.mass, maxDev: dev, vmax: sol.vmax, exponent: eta });
    if (!Number.isFinite(dev)) return fail('The fully stressed iteration produced a non-finite utilization.');
    if (dev < tol) { converged = true; break; }
    eta = pExp; // over-relaxed stress ratio from the second pass on (p = 1 reproduces the textbook rule)
  }
  // Feasibility polish: a uniform scale-up of the whole profile leaves the moment distribution almost unchanged, so a
  // residual max U slightly above 1 (within the convergence tolerance) is removed exactly before verification.
  let polish = 0;
  while (sol.maxU > 1 + 1e-12 && polish < 8) {
    polish++;
    const next = design.map((dim, i) => {
      const sg = sol.segments[i];
      if (model.section.type === 'rect') return clampDim(model, dim * Math.sqrt(sol.maxU));
      const Ireq = sg.I * sol.maxU;
      const inner4 = model.section.D ** 4 - 64 * Ireq / Math.PI;
      return clampDim(model, inner4 <= 0 ? dMax : (model.section.D - inner4 ** 0.25) / 2);
    });
    const s2 = solveBeam(model, next, { mesh });
    if (!s2.ok) return s2;
    design = next; sol = s2;
  }
  let error = null;
  if (sol.maxU > 1 + U_TOL) {
    error = model.section.type === 'tube'
      ? 'The tube cannot be made fully stressed within t <= D / 2: increase D or reduce the load.'
      : 'The fully stressed iteration ended with an overstressed segment.';
  }
  return { ok: true, design, solution: sol, history, converged, iterations, polishSteps: polish, warning: error };
}

// Scale a whole profile by one factor s >= 1 (bisection) until max |v| equals L / k. Returns scale 1 if already met.
export function scaleToDeflection(model, design, opts = {}) {
  const mesh = opts.mesh || buildMesh(model);
  const vlim = model.L / model.deflectionLimitRatio;
  const base = Array.from(design);
  const scaled = s => base.map(d => clampDim(model, d * s));
  const sol0 = solveBeam(model, base, { mesh });
  if (!sol0.ok) return sol0;
  if (sol0.vmax <= vlim * (1 + 1e-9)) return { ok: true, scale: 1, design: base, solution: sol0, active: false };
  const dMax = maxDim(model);
  const sMax = Number.isFinite(dMax) ? dMax / Math.max(...base) : 1e4;
  let sLo = 1, sHi = 1, solHi = null;
  for (let it = 0; it < 60; it++) {
    sHi = Math.min(sMax, sHi * 2);
    const s = solveBeam(model, scaled(sHi), { mesh });
    if (!s.ok) return s;
    if (s.vmax <= vlim) { solHi = s; break; }
    if (sHi >= sMax) {
      return fail(model.section.type === 'tube'
        ? 'The deflection limit cannot be met even with a solid rod of diameter D: increase D, shorten the beam or relax L / k.'
        : 'The deflection limit cannot be met by scaling the profile (scale factor above 10000).');
    }
    sLo = sHi;
  }
  for (let it = 0; it < 100 && (sHi - sLo) / sHi > 1e-8; it++) {
    const mid = 0.5 * (sLo + sHi);
    const s = solveBeam(model, scaled(mid), { mesh });
    if (!s.ok) return s;
    if (s.vmax <= vlim) { sHi = mid; solHi = s; } else sLo = mid;
  }
  const finalDesign = scaled(sHi);
  const solution = solveBeam(model, finalDesign, { mesh });
  if (!solution.ok) return solution;
  return { ok: true, scale: sHi, design: finalDesign, solution, active: true };
}

// Verification: rebuild the model from the candidate numbers, solve with the plain solver, re-check every constraint.
export function verifyDesign(rawModel, design) {
  const v = validateModel(rawModel);
  if (!v.ok) return { feasible: false, reason: v.error, utilizations: null, governing: null, mass: NaN };
  const model = v.model;
  if (!design || design.length !== model.N) return { feasible: false, reason: 'design length does not match N', utilizations: null, governing: null, mass: NaN };
  const violations = [];
  const dMax = maxDim(model);
  for (let i = 0; i < model.N; i++) {
    const d = Number(design[i]);
    if (!isNum(d) || d <= 0) violations.push(`segment ${i + 1}: invalid dimension`);
    else if (d < model.minDim * (1 - 1e-9)) violations.push(`segment ${i + 1}: below the minimum dimension`);
    else if (d > dMax * (1 + 1e-9)) violations.push(`segment ${i + 1}: wall exceeds D / 2`);
  }
  if (violations.length) return { feasible: false, reason: violations.join('; '), utilizations: null, governing: null, mass: NaN, violations };
  const sol = solveBeam(model, Array.from(design, Number));
  if (!sol.ok) return { feasible: false, reason: sol.error, utilizations: null, governing: null, mass: NaN };
  const Ustress = sol.maxU, Udefl = sol.Udefl;
  if (Ustress > 1 + U_TOL) violations.push(`stress utilization ${Ustress.toFixed(4)} in segment ${sol.govSeg + 1}`);
  if (Udefl > 1 + U_TOL) violations.push(`deflection utilization ${Udefl.toFixed(4)} (max |v| = ${sol.vmax.toFixed(3)} mm, limit ${sol.vlim.toFixed(3)} mm)`);
  const governing = Ustress >= Udefl
    ? { type: 'stress', U: Ustress, segment: sol.govSeg, x: sol.segments[sol.govSeg].xgov, label: `bending stress, segment ${sol.govSeg + 1} (x = ${sol.segments[sol.govSeg].xgov.toFixed(1)} mm)` }
    : { type: 'deflection', U: Udefl, x: sol.xvmax, label: `deflection limit L / ${model.deflectionLimitRatio} at x = ${sol.xvmax.toFixed(1)} mm` };
  return {
    feasible: violations.length === 0,
    reason: violations.length ? violations.join('; ') : 'all constraints satisfied',
    utilizations: { stress: Ustress, deflection: Udefl },
    governing, mass: sol.mass, solution: sol, violations,
  };
}

// ----------------------------------------------------------------------------------------------
// Classical references
// ----------------------------------------------------------------------------------------------

// Galileo's parabolic cantilever: fully stressed depth for a tip load with fixed width.
export function galileoDepth(hRoot, x, L) {
  return hRoot * Math.sqrt(Math.max(0, 1 - x / L));
}

// Fully stressed depth of a simply supported beam under a full-span uniform load with fixed width.
export function ssUdlDepth(hMid, x, L) {
  return hMid * Math.sqrt(Math.max(0, 4 * x * (L - x))) / L;
}

function singleTipLoad(model) {
  return model.loads.length === 1 && model.loads[0].type === 'point' && Math.abs(model.loads[0].a - model.L) <= 1e-9 * model.L;
}
function singleFullUdl(model) {
  const ld = model.loads[0];
  return model.loads.length === 1 && ld.type === 'udl' && ld.a <= 1e-9 * model.L && ld.b >= model.L * (1 - 1e-9);
}

// Returns the applicable closed-form result for the case, or { applicable: false }.
export function classicalReference(model) {
  const rect = model.section.type === 'rect';
  if (model.support === 'cantilever' && singleTipLoad(model)) {
    if (rect) {
      return {
        applicable: true, exact: true,
        caseLabel: 'Cantilever, tip load, rectangle of fixed width (Galileo 1638)',
        profileLabel: 'h(x) = h_root sqrt(1 - x / L)',
        massRatio: 2 / 3, massRatioLabel: '2/3',
        deflRatio: 2, deflRatioLabel: '2',
        profile: (hRef, x) => galileoDepth(hRef, x, model.L), refStation: 0,
        note: 'The continuous parabolic profile has exactly two thirds of the prismatic mass and twice its tip deflection. The stepped design approaches both values as N grows.',
      };
    }
    return {
      applicable: true, exact: false,
      caseLabel: 'Cantilever, tip load, thin-walled tube of fixed outer diameter',
      profileLabel: 't(x) proportional to |M(x)| = P (L - x)',
      massRatio: 1 / 2, massRatioLabel: '1/2 (thin-wall limit)',
      deflRatio: 1.5, deflRatioLabel: '3/2 (thin-wall limit)',
      profile: (tRef, x) => tRef * Math.max(0, 1 - x / model.L), refStation: 0,
      note: 'For a thin tube the section modulus is proportional to the wall, so the fully stressed wall follows the moment triangle: half the prismatic mass and 1.5 times the tip deflection. The exact tube formula and the minimum wall shift the numbers.',
    };
  }
  if (model.support === 'simply' && singleFullUdl(model)) {
    if (rect) {
      return {
        applicable: true, exact: true,
        caseLabel: 'Simply supported, uniform load, rectangle of fixed width',
        profileLabel: 'h(x) = h_mid sqrt(4 x (L - x)) / L',
        massRatio: Math.PI / 4, massRatioLabel: 'pi/4 = 0.7854',
        deflRatio: (6 * Math.PI - 12) / 5, deflRatioLabel: '(6 pi - 12) / 5 = 1.370',
        profile: (hRef, x) => ssUdlDepth(hRef, x, model.L), refStation: model.L / 2,
        note: 'The integral of sqrt(x (L - x)) over the span is pi L^2 / 8, so the continuous profile has pi/4 of the prismatic mass; its midspan deflection is (6 pi - 12) / 5 times the prismatic value.',
      };
    }
    return {
      applicable: true, exact: false,
      caseLabel: 'Simply supported, uniform load, thin-walled tube of fixed outer diameter',
      profileLabel: 't(x) proportional to |M(x)| = |w| x (L - x) / 2',
      massRatio: 2 / 3, massRatioLabel: '2/3 (thin-wall limit)',
      deflRatio: 1.2, deflRatioLabel: '6/5 (thin-wall limit)',
      profile: (tRef, x) => tRef * 4 * x * (model.L - x) / (model.L * model.L), refStation: model.L / 2,
      note: 'For a thin tube the wall follows the moment parabola: two thirds of the prismatic mass and 1.2 times the midspan deflection (uniform curvature).',
    };
  }
  return { applicable: false, caseLabel: 'No listed closed form for this support and load combination', note: 'Refine N and watch the stepped mass ratio settle toward the continuous fully stressed limit.' };
}

// ----------------------------------------------------------------------------------------------
// Full pipeline used by the page: prismatic, FSD, FSD with deflection limit, prismatic with deflection limit
// ----------------------------------------------------------------------------------------------

export function runFSD(rawModel, opts = {}) {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const v = validateModel(rawModel);
  if (!v.ok) return v;
  const model = v.model;
  const mesh = buildMesh(model);
  const pr = prismaticDesign(model, { mesh });
  if (!pr.ok) return pr;
  const fsd = fsdDesign(model, { mesh, start: pr.design, tol: opts.tol, maxIter: opts.maxIter, exponent: opts.exponent ?? rawModel.exponent });
  if (!fsd.ok) return fsd;
  const fsdDefl = scaleToDeflection(model, fsd.design, { mesh });
  const prDefl = scaleToDeflection(model, pr.design, { mesh });

  const mk = (key, label, design, extra) => {
    const ver = verifyDesign(model, design);
    return Object.assign({ key, label, design: Array.from(design), verify: ver, mass: ver.mass, solution: ver.solution }, extra || {});
  };
  const designs = {
    prismatic: mk('prismatic', 'Prismatic (stress-sized)', pr.design, { dim: pr.dim, atMin: pr.atMin }),
    fsd: mk('fsd', 'Fully stressed (FSD)', fsd.design, { converged: fsd.converged, iterations: fsd.iterations, warning: fsd.warning }),
    fsdDefl: fsdDefl.ok ? mk('fsdDefl', 'FSD + deflection limit', fsdDefl.design, { scale: fsdDefl.scale, active: fsdDefl.active }) : { key: 'fsdDefl', label: 'FSD + deflection limit', error: fsdDefl.error },
    prismaticDefl: prDefl.ok ? mk('prismaticDefl', 'Prismatic + deflection limit (reference)', prDefl.design, { scale: prDefl.scale, active: prDefl.active }) : { key: 'prismaticDefl', label: 'Prismatic + deflection limit (reference)', error: prDefl.error },
  };

  const classical = classicalReference(model);
  const numeric = {
    massRatio: designs.fsd.mass / designs.prismatic.mass,
    deflRatio: designs.fsd.solution && designs.prismatic.solution ? designs.fsd.solution.vmax / designs.prismatic.solution.vmax : NaN,
  };
  // depth profile comparison at each segment's governing section (where the stepped design is exactly fully stressed)
  let profileCompare = null, analyticProfile = null;
  if (classical.applicable && designs.fsd.solution) {
    const refDim = classical.refStation === 0 ? requiredDim(model, Math.abs(designs.fsd.solution.segments[0].Mgov)) : pr.dim;
    profileCompare = designs.fsd.solution.segments.map(sg => ({
      index: sg.index, x: sg.xgov, numeric: sg.dim, analytic: classical.profile(refDim, sg.xgov), atMin: sg.atMin,
    }));
    const xs = [], ds = [];
    for (let i = 0; i <= 200; i++) { const x = model.L * i / 200; xs.push(x); ds.push(classical.profile(refDim, x)); }
    analyticProfile = { x: xs, d: ds, refDim, exact: classical.exact };
  }

  const rows = [];
  const sp = designs.prismatic.solution, sf = designs.fsd.solution, sd = designs.fsdDefl.solution;
  for (let i = 0; i < model.N; i++) {
    rows.push({
      index: i + 1, xmid: sp.segments[i].xmid,
      Mprismatic: sp.segments[i].Mgov, Mfsd: sf.segments[i].Mgov, xgov: sf.segments[i].xgov,
      dimPrismatic: sp.segments[i].dim, dimFsd: sf.segments[i].dim, dimFsdDefl: sd ? sd.segments[i].dim : NaN,
      Ubefore: sp.segments[i].U, Uafter: sf.segments[i].U, atMin: sf.segments[i].atMin,
    });
  }
  const warnings = [];
  const loadScale = model.loads.reduce((s, ld) => s + (ld.type === 'point' ? Math.abs(ld.P) : Math.abs(ld.w) * (ld.b - ld.a)), 0) * model.L;
  if (pr.Mmax <= 1e-12 * loadScale) warnings.push('The loads produce no bending moment (for example a point load placed on a support), so every segment sits at the minimum dimension.');
  if (!fsd.converged) warnings.push(`The fully stressed loop did not converge within ${fsd.history.length - 1} passes; the design shown was scaled to be feasible.`);
  if (fsd.warning) warnings.push(fsd.warning);
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return {
    ok: true, model, mesh: { nodes: mesh.nodes.length, elements: mesh.elements.length }, designs, history: fsd.history, warnings,
    converged: fsd.converged, iterations: fsd.iterations, classical, numeric, profileCompare, analyticProfile, rows,
    savings: {
      stressOnly: { grams: designs.prismatic.mass - designs.fsd.mass, percent: 100 * (1 - designs.fsd.mass / designs.prismatic.mass) },
      bothLimits: (designs.fsdDefl.mass && designs.prismaticDefl.mass)
        ? { grams: designs.prismaticDefl.mass - designs.fsdDefl.mass, percent: 100 * (1 - designs.fsdDefl.mass / designs.prismaticDefl.mass) }
        : null,
    },
    elapsedMs: t1 - t0,
  };
}

// Points of the drawn depth profile (half-depth or wall) for the side view: stepped or linear taper.
export function profileOutline(model, design) {
  const dx = model.L / model.N;
  const pts = [];
  if (model.taper === 'linear' && model.N >= 2) {
    pts.push({ x: 0, d: design[0] });
    for (let i = 0; i < model.N; i++) pts.push({ x: (i + 0.5) * dx, d: design[i] });
    pts.push({ x: model.L, d: design[model.N - 1] });
  } else {
    for (let i = 0; i < model.N; i++) { pts.push({ x: i * dx, d: design[i] }); pts.push({ x: (i + 1) * dx, d: design[i] }); }
  }
  return pts;
}

// CSV rows for the segment table.
export function tableToCSV(result) {
  const m = result.model;
  const dimName = m.section.type === 'rect' ? 'h' : 't';
  const rows = [[
    'segment', 'x_mid (mm)', 'x_governing (mm)', 'M prismatic (N mm)', 'M FSD (N mm)',
    `${dimName} prismatic (mm)`, `${dimName} FSD (mm)`, `${dimName} FSD with deflection limit (mm)`, 'U before', 'U after', 'at minimum',
  ]];
  for (const r of result.rows) {
    rows.push([r.index, r.xmid.toFixed(3), r.xgov.toFixed(3), r.Mprismatic.toFixed(3), r.Mfsd.toFixed(3),
      r.dimPrismatic.toFixed(4), r.dimFsd.toFixed(4), Number.isFinite(r.dimFsdDefl) ? r.dimFsdDefl.toFixed(4) : 'n/a',
      r.Ubefore.toFixed(5), r.Uafter.toFixed(5), r.atMin ? 'yes' : 'no']);
  }
  return rows;
}
