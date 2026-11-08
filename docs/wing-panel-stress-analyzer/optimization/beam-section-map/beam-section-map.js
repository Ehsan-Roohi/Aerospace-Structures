// MIE 446 Optimization Lab: Beam Section Design-Space Map (pure ES module, no DOM access).
//
// Closed-form Euler-Bernoulli checks for a prismatic beam (cantilever or simply supported, point load
// or full-span uniform load), a design-space grid over the two parameters of a section family, a
// boundary-following refinement of the minimum-mass feasible design, an exact re-solve verification,
// a mass against deflection Pareto front and an Ashby-style material comparison.
//
// Units everywhere: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g.
// mass_g = A_mm2 * L_mm * rho_g_cm3 / 1000.
//
// Every function that takes user numbers returns { ok: false, error } for invalid input instead of
// throwing or producing NaN. Internal helpers assume a model that passed validateModel().

import { MATERIALS, sectionProps } from '../shared/presets.js';

export const VERSION = '0.1.1';
export const FEAS_TOL = 1e-9;    // a utilization U <= 1 + FEAS_TOL counts as satisfied
export const ACTIVE_TOL = 1e-3;  // a satisfied utilization U >= 1 - ACTIVE_TOL counts as active

// Section families. x is the first map parameter (horizontal axis), y the second (vertical axis).
// The constraints are monotone in y at fixed x and in x at fixed y for all three families, which the
// boundary bisection relies on (see minimalFeasibleAlong).
export const FAMILIES = {
  rect: {
    name: 'Solid rectangle b x h',
    x: { key: 'b', label: 'width b', unit: 'mm', kind: 'dimension' },
    y: { key: 'h', label: 'depth h', unit: 'mm', kind: 'dimension' },
  },
  tube: {
    name: 'Circular tube D x t',
    x: { key: 'D', label: 'outer diameter D', unit: 'mm', kind: 'dimension' },
    y: { key: 't', label: 'wall thickness t', unit: 'mm', kind: 'thickness' },
  },
  box: {
    name: 'Rectangular box h x t (width b = beta h)',
    x: { key: 'h', label: 'depth h', unit: 'mm', kind: 'dimension' },
    y: { key: 't', label: 'wall thickness t', unit: 'mm', kind: 'thickness' },
  },
};

export const CONSTRAINT_LABELS = { stress: 'stress', defl: 'deflection', thick: 'minimum thickness' };
const KEYS = ['stress', 'defl', 'thick'];

// ---------- small helpers ----------

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const fail = error => ({ ok: false, error });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a + (b - a) * i / (n - 1);
  return out;
}

export function roundSig(x, sig = 2) {
  if (!isNum(x) || x === 0) return 0;
  const p = Math.pow(10, sig - 1 - Math.floor(Math.log10(Math.abs(x))));
  return Math.round(x * p) / p;
}

export function utilizationLevel(U) {
  if (!isNum(U)) return 'bad';
  if (U > 1 + FEAS_TOL) return 'bad';
  if (U > 0.9) return 'warn';
  return 'ok';
}

export function designFromXY(family, x, y) {
  const f = FAMILIES[family];
  return { [f.x.key]: x, [f.y.key]: y };
}

export function xyFromDesign(family, design) {
  const f = FAMILIES[family];
  return { x: design[f.x.key], y: design[f.y.key] };
}

export function describeDesign(family, design, digits = 4) {
  const f = FAMILIES[family];
  const d = v => (isNum(v) ? Number(v.toPrecision(digits)) : v);
  return `${f.x.key} = ${d(design[f.x.key])} mm, ${f.y.key} = ${d(design[f.y.key])} mm`;
}

// ---------- model validation ----------
// model: { support: 'cantilever'|'simply', L, load: {type:'point', P, a} | {type:'udl', w},
//          E, sigmaAllow, rho, FS, deflRatio, tMin, family: 'rect'|'tube'|'box', beta (box), materialName }
// Load magnitudes are used (|P|, |w|): in the linear model the utilizations do not depend on the load direction.

export function validateModel(raw) {
  if (!raw || typeof raw !== 'object') return fail('model must be an object');
  const m = {};
  if (raw.support === 'cantilever' || raw.support === 'simply') m.support = raw.support;
  else return fail('support must be "cantilever" or "simply"');
  if (!isNum(raw.L) || raw.L <= 0) return fail('length L must be a positive number (mm)');
  m.L = raw.L;
  const load = raw.load || {};
  if (load.type === 'point') {
    if (!isNum(load.P)) return fail('point load P must be a number (N)');
    if (!isNum(load.a) || load.a < 0 || load.a > m.L) return fail('load position a must lie between 0 and L (mm)');
    m.load = { type: 'point', P: Math.abs(load.P), a: load.a };
  } else if (load.type === 'udl') {
    if (!isNum(load.w)) return fail('uniform load w must be a number (N/mm)');
    m.load = { type: 'udl', w: Math.abs(load.w) };
  } else return fail('load type must be "point" or "udl"');
  const positives = [
    ['E', 'Young modulus E (MPa)'], ['sigmaAllow', 'allowable stress (MPa)'], ['rho', 'density (g/cm^3)'],
    ['FS', 'factor of safety FS'], ['deflRatio', 'deflection limit ratio k'],
  ];
  for (const [k, label] of positives) {
    if (!isNum(raw[k]) || raw[k] <= 0) return fail(label + ' must be a positive number');
    m[k] = raw[k];
  }
  if (!isNum(raw.tMin) || raw.tMin < 0) return fail('minimum thickness t_min must be zero or a positive number (mm)');
  m.tMin = raw.tMin;
  if (!FAMILIES[raw.family]) return fail('section family must be "rect", "tube" or "box"');
  m.family = raw.family;
  if (m.family === 'box') {
    if (!isNum(raw.beta) || raw.beta <= 0) return fail('box width ratio beta (b = beta h) must be positive');
    m.beta = raw.beta;
  } else m.beta = isNum(raw.beta) && raw.beta > 0 ? raw.beta : 0.6;
  m.materialName = typeof raw.materialName === 'string' ? raw.materialName : 'custom';
  return { ok: true, model: m };
}

export function validateRanges(ranges) {
  if (!ranges || !Array.isArray(ranges.x) || !Array.isArray(ranges.y) || ranges.x.length < 2 || ranges.y.length < 2) {
    return fail('map ranges must be given as { x: [min, max], y: [min, max] }');
  }
  const [xLo, xHi] = ranges.x.map(Number), [yLo, yHi] = ranges.y.map(Number);
  if (![xLo, xHi, yLo, yHi].every(isNum)) return fail('map range limits must be numbers (mm)');
  if (xLo <= 0 || yLo <= 0) return fail('map range minima must be positive (mm)');
  if (xHi < xLo || yHi < yLo) return fail('a map range maximum must not be smaller than its minimum');
  if (xHi === xLo && yHi === yLo) return fail('at least one map range must have a positive span');
  return { ok: true, ranges: { x: [xLo, xHi], y: [yLo, yHi] } };
}

// ---------- closed-form load effects (independent of the section) ----------
// Returns Mmax (N mm) and deflCoeff (N mm^3) such that v_max = deflCoeff / (E I), plus the positions
// xM (of M_max) and xV (of v_max) measured from the left end (x = 0 is the clamp for a cantilever).

export function loadEffects(m) {
  const L = m.L;
  if (m.load.type === 'point') {
    const P = m.load.P, a = m.load.a;
    if (m.support === 'cantilever') {
      return {
        Mmax: P * a, xM: 0, deflCoeff: P * a * a * (3 * L - a) / 6, xV: L,
        formulaM: 'M_max = P a (at the clamp)', formulaV: 'v_tip = P a^2 (3L - a) / (6 E I)',
      };
    }
    const b = L - a;
    const s = Math.min(a, b); // distance from the load to the nearer support (mirror rule)
    const Mmax = P * a * b / L;
    const deflCoeff = P * s * Math.pow(L * L - s * s, 1.5) / (9 * Math.sqrt(3) * L);
    const xV = a >= b ? Math.sqrt((L * L - b * b) / 3) : L - Math.sqrt((L * L - a * a) / 3);
    return {
      Mmax, xM: a, deflCoeff, xV,
      formulaM: 'M_max = P a b / L (under the load)',
      formulaV: 'v_max = P b (L^2 - b^2)^(3/2) / (9 sqrt(3) L E I), b = distance to the nearer support',
    };
  }
  const w = m.load.w;
  if (m.support === 'cantilever') {
    return { Mmax: w * L * L / 2, xM: 0, deflCoeff: w * L ** 4 / 8, xV: L, formulaM: 'M_max = w L^2 / 2 (at the clamp)', formulaV: 'v_tip = w L^4 / (8 E I)' };
  }
  return { Mmax: w * L * L / 8, xM: L / 2, deflCoeff: 5 * w * L ** 4 / 384, xV: L / 2, formulaM: 'M_max = w L^2 / 8 (midspan)', formulaV: 'v_max = 5 w L^4 / (384 E I)' };
}

// ---------- section geometry ----------

function sectionGeometry(m, d) {
  switch (m.family) {
    case 'rect': {
      if (!isNum(d.b) || !isNum(d.h) || d.b <= 0 || d.h <= 0) return { error: 'rectangle width b and depth h must be positive numbers (mm)' };
      const props = sectionProps('rect', { b: d.b, h: d.h });
      return { type: 'rect', params: { b: d.b, h: d.h }, props: Object.assign({ b: d.b }, props) };
    }
    case 'tube': {
      if (!isNum(d.D) || !isNum(d.t) || d.D <= 0 || d.t <= 0) return { error: 'tube outer diameter D and wall thickness t must be positive numbers (mm)' };
      if (d.D <= 2 * d.t) return { error: 'tube wall thickness t must be smaller than D / 2 (the section needs D > 2 t)' };
      const props = sectionProps('tube', { D: d.D, t: d.t });
      return { type: 'tube', params: { D: d.D, t: d.t }, props: Object.assign({ b: d.D }, props) };
    }
    case 'box': {
      if (!isNum(d.h) || !isNum(d.t) || d.h <= 0 || d.t <= 0) return { error: 'box depth h and wall thickness t must be positive numbers (mm)' };
      const b = m.beta * d.h;
      if (2 * d.t >= Math.min(b, d.h)) return { error: 'box wall thickness t must be smaller than half of the smaller side (b = beta h)' };
      const props = sectionProps('box', { b, h: d.h, t: d.t });
      return { type: 'box', params: { b, h: d.h, t: d.t }, props: Object.assign({ b }, props) };
    }
    default:
      return { error: 'unknown section family ' + m.family };
  }
}

// Largest valid second parameter at a given first parameter (geometric limit), and smallest valid
// first parameter at a given second parameter.
export function maxValidY(m, x) {
  if (m.family === 'tube') return x / 2;
  if (m.family === 'box') return Math.min(m.beta * x, x) / 2;
  return Infinity;
}
export function minValidX(m, y) {
  if (m.family === 'tube') return 2 * y;
  if (m.family === 'box') return 2 * y / Math.min(m.beta, 1);
  return 0;
}

// ---------- exact evaluation of one design ----------

function governingOf(U) {
  let g = 'stress';
  for (const k of KEYS) if (U[k] > U[g]) g = k;
  const active = KEYS.filter(k => U[k] >= 1 - ACTIVE_TOL && U[k] <= 1 + FEAS_TOL);
  // Headline: the utilization closest to 1. When a structural constraint (stress or deflection) is
  // active together with the manufacturing minimum thickness, name the structural one and list both.
  let governing = g;
  const structural = active.filter(k => k !== 'thick');
  if (structural.length) governing = structural.reduce((a, b) => (U[b] > U[a] ? b : a));
  return { governing, active, Umax: U[g] };
}

function evalCore(m, design, eff) {
  const sec = sectionGeometry(m, design);
  if (sec.error) return fail(sec.error);
  const { A, I, c, tmin } = sec.props;
  if (!(A > 0) || !(I > 0) || !(c > 0)) return fail('section has a non-positive area or second moment of area');
  const sigmaMax = eff.Mmax * c / I;
  const vMax = eff.deflCoeff / (m.E * I);
  const vLimit = m.L / m.deflRatio;
  const U = {
    stress: sigmaMax * m.FS / m.sigmaAllow,
    defl: vMax / vLimit,
    thick: m.tMin > 0 ? m.tMin / tmin : 0,
  };
  const { governing, active, Umax } = governingOf(U);
  const mass = A * m.L * m.rho / 1000;
  return {
    ok: true, family: m.family, design: Object.assign({}, design), section: sec.props, sectionParams: sec.params,
    Mmax: eff.Mmax, xM: eff.xM, xV: eff.xV, sigmaMax, sigmaAllowFS: m.sigmaAllow / m.FS, vMax, vLimit,
    U, Umax, governing, active, feasible: Umax <= 1 + FEAS_TOL, strictFeasible: Umax <= 1, mass,
  };
}

// Exact evaluation of a candidate design. Returns the full result or { ok: false, error }.
export function evaluateDesign(model, design) {
  const v = validateModel(model);
  if (!v.ok) return v;
  if (!design || typeof design !== 'object') return fail('design must be an object with the section parameters');
  return evalCore(v.model, design, loadEffects(v.model));
}

// "Propose, then verify": rebuild everything from the candidate numbers and re-check all constraints.
export function verifyDesign(model, design) {
  const e = evaluateDesign(model, design);
  if (!e.ok) return { ok: false, feasible: false, error: e.error, utilizations: null, governing: null, active: [], mass: null };
  return {
    ok: true, feasible: e.feasible, utilizations: e.U, Umax: e.Umax, governing: e.governing, active: e.active,
    mass: e.mass, eval: e,
    message: e.feasible
      ? 'Checked by fresh model solve'
      : `Verification failed: ${CONSTRAINT_LABELS[e.governing]} utilization ${e.Umax.toFixed(3)} exceeds 1`,
  };
}

// ---------- default map ranges derived from the student's design ----------

export function defaultRanges(model, design) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const m = v.model;
  const fam = FAMILIES[m.family];
  const tRef = m.tMin > 0 ? m.tMin : 0.5;
  const range = (value, kind) => {
    const val = isNum(value) && value > 0 ? value : 10;
    let lo, hi;
    if (kind === 'thickness') { lo = Math.min(0.5 * tRef, val / 2); hi = Math.max(3 * val, 2 * tRef); }
    else { lo = Math.max(tRef, val / 4); hi = 2.5 * val; }
    lo = roundSig(lo, 2); hi = roundSig(hi, 2);
    if (!(hi > lo)) hi = roundSig(lo * 4, 2);
    return [lo, hi];
  };
  return { ok: true, ranges: { x: range(design && design[fam.x.key], fam.x.kind), y: range(design && design[fam.y.key], fam.y.kind) } };
}

// ---------- design-space grid ----------
// Z[j][i] arrays indexed by row j (ys) and column i (xs), as labkit.heatmap expects.

export function buildGrid(model, ranges, n = 90) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const m = v.model;
  const rr = validateRanges(ranges);
  if (!rr.ok) return rr;
  const nn = clamp(Math.round(isNum(n) ? n : 90), 40, 160);
  const fam = FAMILIES[m.family];
  const eff = loadEffects(m);
  const xs = linspace(rr.ranges.x[0], rr.ranges.x[1], nn);
  const ys = linspace(rr.ranges.y[0], rr.ranges.y[1], nn);
  const mass = [], Ustress = [], Udefl = [], Uthick = [], Umax = [], vmax = [], feasible = [], mask = [], valid = [];
  let best = null, nFeasible = 0, nValid = 0;
  for (let j = 0; j < nn; j++) {
    const rm = new Array(nn), rs = new Array(nn), rd = new Array(nn), rt = new Array(nn), ru = new Array(nn), rv = new Array(nn);
    const rf = new Array(nn), rk = new Array(nn), rok = new Array(nn);
    for (let i = 0; i < nn; i++) {
      const e = evalCore(m, designFromXY(m.family, xs[i], ys[j]), eff);
      if (!e.ok) {
        rm[i] = NaN; rs[i] = NaN; rd[i] = NaN; rt[i] = NaN; ru[i] = NaN; rv[i] = NaN; rf[i] = false; rk[i] = true; rok[i] = false;
        continue;
      }
      nValid++;
      rm[i] = e.mass; rs[i] = e.U.stress; rd[i] = e.U.defl; rt[i] = e.U.thick; ru[i] = e.Umax; rv[i] = e.vMax;
      rf[i] = e.feasible; rk[i] = !e.feasible; rok[i] = true;
      if (e.feasible) {
        nFeasible++;
        if (!best || e.mass < best.mass) best = { i, j, x: xs[i], y: ys[j], mass: e.mass, eval: e };
      }
    }
    mass.push(rm); Ustress.push(rs); Udefl.push(rd); Uthick.push(rt); Umax.push(ru); vmax.push(rv); feasible.push(rf); mask.push(rk); valid.push(rok);
  }
  return {
    ok: true, n: nn, xs, ys, dx: nn > 1 ? (xs[nn - 1] - xs[0]) / (nn - 1) : 0, dy: nn > 1 ? (ys[nn - 1] - ys[0]) / (nn - 1) : 0,
    xKey: fam.x.key, yKey: fam.y.key, mass, Ustress, Udefl, Uthick, Umax, vmax, feasible, mask, valid,
    best, nFeasible, nValid, ranges: rr.ranges,
  };
}

// ---------- feasibility boundary by bisection ----------
// All three utilizations are non-increasing in y at fixed x and in x at fixed y (larger sections are
// stiffer, stronger and thicker), so the lightest feasible value along one axis is found by bisection.
// axis 'y': vary the second parameter at fixed x = fixed; axis 'x': vary the first at fixed y = fixed.
// Returns the smallest feasible value in [lo, hi] (on the feasible side of the bracket) or null.

export function minimalFeasibleAlong(model, axis, fixed, lo, hi, eff) {
  const v = validateModel(model);
  if (!v.ok) return null;
  const m = v.model;
  const E = eff || loadEffects(m);
  if (!isNum(fixed) || !isNum(lo) || !isNum(hi) || fixed <= 0) return null;
  let a = lo, b = hi;
  if (axis === 'y') b = Math.min(b, maxValidY(m, fixed) * (1 - 1e-9));
  else a = Math.max(a, minValidX(m, fixed) * (1 + 1e-9));
  if (!(a > 0) || !(b >= a)) return null;
  // Strict test (U <= 1 without tolerance) so the returned value lies on the feasible side of the
  // boundary and passes the tolerant verification check afterwards.
  const feas = s => {
    const d = axis === 'y' ? designFromXY(m.family, fixed, s) : designFromXY(m.family, s, fixed);
    const e = evalCore(m, d, E);
    return e.ok && e.strictFeasible;
  };
  if (!feas(b)) return null;
  if (feas(a)) return a;
  for (let k = 0; k < 100; k++) {
    const mid = 0.5 * (a + b);
    if (!(mid > a && mid < b)) break;
    if (feas(mid)) b = mid; else a = mid;
    if (b - a <= 1e-12 * Math.max(1, Math.abs(b))) break;
  }
  return b;
}

export function minimalFeasibleY(model, x, yLo, yHi, eff) {
  return minimalFeasibleAlong(model, 'y', x, yLo, yHi, eff);
}

// ---------- local refinement of the optimum ----------
// Boundary-following pattern (compass) search on the first parameter x with step halving. For every
// trial x the second parameter is projected onto the constraint boundary by bisection, so every trial
// point is feasible by construction and no penalty is needed. Deterministic.

export function refineOptimum(model, ranges, start, opts = {}) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const m = v.model;
  const rr = validateRanges(ranges);
  if (!rr.ok) return rr;
  const [xLo, xHi] = rr.ranges.x, [yLo, yHi] = rr.ranges.y;
  const eff = loadEffects(m);
  let evaluations = 0;
  const g = x => {
    evaluations++;
    const y = minimalFeasibleAlong(m, 'y', x, yLo, yHi, eff);
    if (y === null) return { f: Infinity, y: null };
    const e = evalCore(m, designFromXY(m.family, x, y), eff);
    return { f: e.ok && e.feasible ? e.mass : Infinity, y };
  };
  if (!start || !isNum(start.x)) return fail('refinement needs a start point { x, y }');
  let x = clamp(start.x, xLo, xHi);
  let cur = g(x);
  if (!Number.isFinite(cur.f)) return fail('the start point has no feasible second parameter inside the map range');
  const span = xHi - xLo;
  let step = isNum(opts.step) && opts.step > 0 ? opts.step : span / 20;
  const tol = (isNum(opts.tol) ? opts.tol : 1e-7) * span;
  const maxIter = isNum(opts.maxIter) ? opts.maxIter : 400;
  let iterations = 0;
  while (span > 0 && step > tol && iterations < maxIter) {
    iterations++;
    let improved = false;
    for (const dir of [-1, 1]) {
      const xt = clamp(x + dir * step, xLo, xHi);
      if (xt === x) continue;
      const t = g(xt);
      if (t.f < cur.f - 1e-12 * Math.abs(cur.f)) { x = xt; cur = t; improved = true; break; }
    }
    if (!improved) step *= 0.5;
  }
  return { ok: true, x, y: cur.y, mass: cur.f, iterations, evaluations, converged: span === 0 || step <= tol };
}

// ---------- full pipeline: grid, refinement, verification ----------

export function optimize(model, ranges, n = 90) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const m = v.model;
  const grid = buildGrid(m, ranges, n);
  if (!grid.ok) return grid;
  const fam = FAMILIES[m.family];
  const result = { ok: true, grid, bestCell: grid.best, refined: null, design: null, verified: null, atBounds: [], feasible: false, fallback: false };
  if (!grid.best) {
    result.message = 'No feasible design inside the map range. Widen the ranges, relax a limit or change the section family.';
    return result;
  }
  let design = designFromXY(m.family, grid.best.x, grid.best.y);
  const ref = refineOptimum(m, grid.ranges, { x: grid.best.x, y: grid.best.y }, { step: grid.dx > 0 ? grid.dx : undefined });
  if (ref.ok && Number.isFinite(ref.mass) && ref.mass <= grid.best.mass + 1e-12 * grid.best.mass) {
    design = designFromXY(m.family, ref.x, ref.y);
    result.refined = ref;
  }
  let verified = verifyDesign(m, design);
  if (!verified.ok || !verified.feasible) {
    // The refined point failed the exact re-check (should not happen); fall back to the best grid cell,
    // which was itself an exact evaluation, and verify that instead.
    design = designFromXY(m.family, grid.best.x, grid.best.y);
    result.refined = null;
    result.fallback = true;
    verified = verifyDesign(m, design);
  }
  const { x, y } = xyFromDesign(m.family, design);
  const [xLo, xHi] = grid.ranges.x, [yLo, yHi] = grid.ranges.y;
  const near = (a, b, span) => Math.abs(a - b) <= 1e-6 * Math.max(span, 1e-12);
  const atBounds = [];
  if (near(x, xLo, xHi - xLo)) atBounds.push({ param: fam.x.key, side: 'lower', value: xLo });
  else if (near(x, xHi, xHi - xLo)) atBounds.push({ param: fam.x.key, side: 'upper', value: xHi });
  if (near(y, yLo, yHi - yLo)) atBounds.push({ param: fam.y.key, side: 'lower', value: yLo });
  else if (near(y, yHi, yHi - yLo)) atBounds.push({ param: fam.y.key, side: 'upper', value: yHi });
  Object.assign(result, { design, verified, atBounds, feasible: verified.ok && verified.feasible, x, y });
  return result;
}

// Nearest feasible grid cell to a point (normalized Euclidean distance in parameter space), optionally
// restricted to cells lighter than opts.lighterThan (g).
export function nearestFeasible(grid, point, opts = {}) {
  if (!grid || !grid.ok || !point) return null;
  const [xLo, xHi] = grid.ranges.x, [yLo, yHi] = grid.ranges.y;
  const sx = xHi - xLo > 0 ? xHi - xLo : 1, sy = yHi - yLo > 0 ? yHi - yLo : 1;
  const limit = isNum(opts.lighterThan) ? opts.lighterThan : Infinity;
  let bestCell = null;
  for (let j = 0; j < grid.n; j++) {
    for (let i = 0; i < grid.n; i++) {
      if (!grid.feasible[j][i]) continue;
      const mass = grid.mass[j][i];
      if (!(mass < limit - 1e-9 * Math.max(1, Math.abs(limit)))) continue;
      const d = Math.hypot((grid.xs[i] - point.x) / sx, (grid.ys[j] - point.y) / sy);
      if (!bestCell || d < bestCell.distance) bestCell = { i, j, x: grid.xs[i], y: grid.ys[j], mass, distance: d };
    }
  }
  return bestCell;
}

// ---------- Pareto front (minimize both keys) ----------

export function nonDominated(points, keyA = 'mass', keyB = 'defl') {
  const idx = [];
  for (let k = 0; k < points.length; k++) if (isNum(points[k][keyA]) && isNum(points[k][keyB])) idx.push(k);
  idx.sort((p, q) => (points[p][keyA] - points[q][keyA]) || (points[p][keyB] - points[q][keyB]));
  const front = [];
  let bestB = Infinity;
  for (const k of idx) {
    const b = points[k][keyB];
    if (b < bestB) { front.push(k); bestB = b; }
  }
  return front;
}

export function dominationCount(points, p, keyA = 'mass', keyB = 'defl') {
  if (!p || !isNum(p[keyA]) || !isNum(p[keyB])) return 0;
  const tA = 1e-9 * Math.max(1, Math.abs(p[keyA])), tB = 1e-9 * Math.max(1, Math.abs(p[keyB]));
  let count = 0;
  for (const q of points) {
    if (!isNum(q[keyA]) || !isNum(q[keyB])) continue;
    if (q[keyA] <= p[keyA] + tA && q[keyB] <= p[keyB] + tB && (q[keyA] < p[keyA] - tA || q[keyB] < p[keyB] - tB)) count++;
  }
  return count;
}

// Candidates: grid cells that satisfy the stress and minimum-thickness constraints (deflection is an
// objective here, not a constraint). Returns the candidate list, the non-dominated front sorted by mass
// and the status of the student's design.
export function paretoAnalysis(grid, studentEval) {
  if (!grid || !grid.ok) return { ok: false, error: 'pareto analysis needs a valid grid' };
  const candidates = [];
  for (let j = 0; j < grid.n; j++) {
    for (let i = 0; i < grid.n; i++) {
      if (!grid.valid[j][i]) continue;
      if (grid.Ustress[j][i] <= 1 + FEAS_TOL && grid.Uthick[j][i] <= 1 + FEAS_TOL) {
        candidates.push({ i, j, x: grid.xs[i], y: grid.ys[j], mass: grid.mass[j][i], defl: grid.vmax[j][i], Ustress: grid.Ustress[j][i], Udefl: grid.Udefl[j][i], feasible: grid.feasible[j][i] });
      }
    }
  }
  const front = nonDominated(candidates).map(k => candidates[k]);
  let student = null;
  if (studentEval && studentEval.ok) {
    const p = { mass: studentEval.mass, defl: studentEval.vMax };
    const inSet = studentEval.U.stress <= 1 + FEAS_TOL && studentEval.U.thick <= 1 + FEAS_TOL;
    const count = dominationCount(candidates, p);
    student = { inSet, count, dominated: count > 0, mass: p.mass, defl: p.defl };
  }
  return { ok: true, candidates, front, student };
}

// ---------- classical closed forms ----------
// Rectangle with the width b fixed: stress-governed depth h = sqrt(6 M FS / (b sigma_allow)),
// deflection-governed depth h = (12 I_req / b)^(1/3) with I_req from v_max = L / k.

export function classicalRectDepth(model, b) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const m = v.model;
  if (m.family !== 'rect') return fail('the classical depth formula applies to the rect family');
  if (!isNum(b) || b <= 0) return fail('width b must be a positive number (mm)');
  const eff = loadEffects(m);
  const vLimit = m.L / m.deflRatio;
  const Ireq = eff.deflCoeff / (m.E * vLimit);
  const hStress = Math.sqrt(6 * eff.Mmax * m.FS / (b * m.sigmaAllow));
  const hDefl = Math.cbrt(12 * Ireq / b);
  const hThick = m.tMin;
  let governing = 'stress', hStar = hStress;
  if (hDefl > hStar) { hStar = hDefl; governing = 'defl'; }
  if (hThick > hStar) { hStar = hThick; governing = 'thick'; }
  return { ok: true, b, hStress, hDefl, hThick, hStar, governing, Ireq, Mmax: eff.Mmax, widthOk: b >= m.tMin };
}

// Thin-wall estimates for the tube (I ~ pi D^3 t / 8) and the box with b = beta h
// (I ~ t h^3 (beta/2 + 1/6)) at a fixed wall thickness t. These are approximations and are labelled so.
export function thinWallEstimate(model, t) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const m = v.model;
  if (!isNum(t) || t <= 0) return fail('wall thickness t must be a positive number (mm)');
  const eff = loadEffects(m);
  const vLimit = m.L / m.deflRatio;
  const Ireq = eff.deflCoeff / (m.E * vLimit);
  if (m.family === 'tube') {
    const Dstress = Math.sqrt(4 * eff.Mmax * m.FS / (Math.PI * t * m.sigmaAllow));
    const Ddefl = Math.cbrt(8 * Ireq / (Math.PI * t));
    const governing = Ddefl > Dstress ? 'defl' : 'stress';
    return { ok: true, family: 'tube', t, param: 'D', xStress: Dstress, xDefl: Ddefl, xStar: Math.max(Dstress, Ddefl), governing, Ireq, note: 'thin-wall estimate, I ~ pi D^3 t / 8' };
  }
  if (m.family === 'box') {
    const k = m.beta / 2 + 1 / 6;
    const hStress = Math.sqrt(eff.Mmax * m.FS / (2 * t * m.sigmaAllow * k));
    const hDefl = Math.cbrt(Ireq / (t * k));
    const governing = hDefl > hStress ? 'defl' : 'stress';
    return { ok: true, family: 'box', t, param: 'h', xStress: hStress, xDefl: hDefl, xStar: Math.max(hStress, hDefl), governing, Ireq, note: 'thin-wall estimate, I ~ t h^3 (beta/2 + 1/6)' };
  }
  return fail('thin-wall estimates apply to the tube and box families');
}

// ---------- material comparison (Ashby style) ----------
// Stiffness-limited beam index E^(1/2)/rho and strength-limited beam index sigma^(2/3)/rho, both
// normalized to the best card. They assume the section can scale freely; the exact minimum masses
// include t_min and the chosen family and can rank differently.

export function ashbyIndices(cards = MATERIALS) {
  const rows = Object.entries(cards)
    .filter(([, c]) => c && isNum(c.E) && isNum(c.sigmaAllow) && isNum(c.rho) && c.E > 0 && c.sigmaAllow > 0 && c.rho > 0)
    .map(([key, c]) => ({
      key, name: c.name || key, E: c.E, sigmaAllow: c.sigmaAllow, rho: c.rho,
      Mstiff: Math.sqrt(c.E) / c.rho, Mstrength: Math.pow(c.sigmaAllow, 2 / 3) / c.rho,
    }));
  const maxS = Math.max(...rows.map(r => r.Mstiff)), maxT = Math.max(...rows.map(r => r.Mstrength));
  for (const r of rows) { r.MstiffRel = r.Mstiff / maxS; r.MstrengthRel = r.Mstrength / maxT; }
  const byS = [...rows].sort((a, b) => b.Mstiff - a.Mstiff); byS.forEach((r, k) => { r.rankStiff = k + 1; });
  const byT = [...rows].sort((a, b) => b.Mstrength - a.Mstrength); byT.forEach((r, k) => { r.rankStrength = k + 1; });
  return rows;
}

// One material: run the same grid + refinement + verification with that card's E, sigmaAllow, rho.
// Mutates and returns the row (from ashbyIndices) so the page can do one material per timer tick.
export function materialRow(model, ranges, n, row) {
  const v = validateModel(model);
  if (!v.ok) { row.ok = false; row.feasible = false; row.mass = null; row.verifiedMessage = v.error; return row; }
  const mm = Object.assign({}, v.model, { E: row.E, sigmaAllow: row.sigmaAllow, rho: row.rho, materialName: row.name });
  const opt = optimize(mm, ranges, n);
  row.ok = opt.ok;
  row.feasible = Boolean(opt.ok && opt.feasible);
  row.mass = row.feasible ? opt.verified.mass : null;
  row.governing = row.feasible ? opt.verified.governing : null;
  row.active = row.feasible ? opt.verified.active : [];
  row.design = row.feasible ? opt.design : null;
  row.atBounds = opt.ok ? opt.atBounds : [];
  row.verifiedMessage = row.feasible ? opt.verified.message : (opt.ok ? (opt.message || 'no feasible design in range') : opt.error);
  return row;
}

// Ranks by verified mass and mass relative to the lightest card. Mutates and returns the rows.
export function rankMaterialRows(rows) {
  const withMass = rows.filter(r => r.mass !== null && isNum(r.mass)).sort((a, b) => a.mass - b.mass);
  withMass.forEach((r, k) => { r.rankMass = k + 1; });
  const bestMass = withMass.length ? withMass[0].mass : null;
  for (const r of rows) r.massRel = r.mass !== null && bestMass ? r.mass / bestMass : null;
  return { ok: true, rows, bestMass };
}

export function compareMaterials(model, ranges, n = 90, cards = MATERIALS) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const rows = ashbyIndices(cards);
  for (const r of rows) materialRow(v.model, ranges, n, r);
  return rankMaterialRows(rows);
}

// ---------- slenderness screen (information only, never a pass or fail) ----------
// The model has no lateral-torsional or local buckling check. This ratio tells the student when such
// a check would matter: deep narrow rectangles (h/b) and thin walls (D/t, h/t).

export function slendernessScreen(model, design) {
  const v = validateModel(model);
  if (!v.ok) return v;
  const m = v.model;
  if (!design) return fail('design required');
  if (m.family === 'rect') {
    if (!(design.b > 0) || !(design.h > 0)) return fail('b and h must be positive');
    return { ok: true, label: 'h / b', value: design.h / design.b, note: 'deep narrow rectangles need a lateral-torsional buckling check that this model does not include' };
  }
  if (m.family === 'tube') {
    if (!(design.t > 0)) return fail('t must be positive');
    return { ok: true, label: 'D / t', value: design.D / design.t, note: 'thin-walled tubes need a local buckling (ovalization) check that this model does not include' };
  }
  if (!(design.t > 0)) return fail('t must be positive');
  return { ok: true, label: 'h / t', value: design.h / design.t, note: 'thin box walls in compression need a local plate buckling check that this model does not include' };
}

// ---------- orchestration for the page ----------
// input: { model, design, ranges (optional), n (optional), materials (optional card set), compare (default true) }

export function analyze(input) {
  const t0 = now();
  if (!input || typeof input !== 'object') return fail('analyze needs an input object');
  const v = validateModel(input.model);
  if (!v.ok) return v;
  const m = v.model;
  const fam = FAMILIES[m.family];
  const design = input.design;
  const student = evaluateDesign(m, design);
  if (!student.ok) return fail('your design: ' + student.error);
  let ranges = input.ranges;
  if (!ranges) {
    const dr = defaultRanges(m, design);
    if (!dr.ok) return dr;
    ranges = dr.ranges;
  }
  const rr = validateRanges(ranges);
  if (!rr.ok) return rr;
  ranges = rr.ranges;
  const n = clamp(Math.round(isNum(input.n) ? input.n : 90), 40, 160);

  const opt = optimize(m, ranges, n);
  if (!opt.ok) return opt;
  const grid = opt.grid;
  const sxy = xyFromDesign(m.family, design);

  // optimum and gains
  let optimum = null;
  if (opt.feasible) {
    const saving = student.mass - opt.verified.mass;
    optimum = {
      design: opt.design, x: opt.x, y: opt.y, verified: opt.verified, refined: opt.refined, bestCell: opt.bestCell,
      atBounds: opt.atBounds, fallback: opt.fallback,
      saving: { g: saving, pct: student.mass > 0 ? 100 * saving / student.mass : NaN },
    };
  }

  // nearest lighter feasible design (fallback: nearest feasible of any mass)
  let nearest = null;
  const cellL = nearestFeasible(grid, sxy, { lighterThan: student.mass });
  const cell = cellL || nearestFeasible(grid, sxy);
  if (cell) {
    const d = designFromXY(m.family, cell.x, cell.y);
    nearest = { cell, design: d, verified: verifyDesign(m, d), lighter: Boolean(cellL) };
  }

  const pareto = paretoAnalysis(grid, student);

  // classical checks
  const classical = { family: m.family };
  if (m.family === 'rect') {
    classical.atStudent = classicalRectDepth(m, sxy.x);
    classical.numericalAtStudent = minimalFeasibleAlong(m, 'y', sxy.x, 1e-6, 1e6);
    if (optimum) {
      classical.atOptimum = classicalRectDepth(m, optimum.x);
      classical.numericalAtOptimum = optimum.y;
      classical.optimumOnBoundary = optimum.verified.active.some(k => k === 'stress' || k === 'defl');
    }
  } else {
    classical.atStudent = thinWallEstimate(m, sxy.y);
    classical.numericalAtStudent = minimalFeasibleAlong(m, 'x', sxy.y, 1e-6, 1e6);
    if (optimum) {
      classical.atOptimum = thinWallEstimate(m, optimum.y);
      classical.numericalAtOptimum = optimum.x;
      classical.optimumOnBoundary = optimum.verified.active.some(k => k === 'stress' || k === 'defl');
    }
  }

  // material comparison
  let materials = null;
  if (input.compare !== false) {
    materials = compareMaterials(m, ranges, n, input.materials || MATERIALS);
  }

  return {
    ok: true, model: m, family: fam, design: Object.assign({}, design), ranges, n,
    effects: loadEffects(m), student, grid, optimum, nearest, pareto, classical, materials,
    noFeasible: !opt.feasible ? (opt.message || 'no feasible design in the map range') : null,
    timeMs: now() - t0,
  };
}
