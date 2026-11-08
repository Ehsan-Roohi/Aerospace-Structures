// MIE 446 Optimization Lab, module "pareto-nsga2".
// Multi-objective structural design with NSGA-II (Non-dominated Sorting Genetic Algorithm II, Deb et al. 2002).
// Pure ES module: no DOM access, so the same code runs in the page, in a module Web Worker and in Node tests.
// Imports data only from ../shared/presets.js.
// Units everywhere: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g.

import { MATERIALS, sectionProps, TRUSS_PRESETS, BEAM_PRESETS } from '../shared/presets.js';

export const VERSION = '0.1.1';

// Tolerances and sentinels.
const CV_TOL = 1e-12;          // total constraint violation at or below this value counts as feasible
const BIG_OBJECTIVE = 1e12;    // finite stand-in for an objective that could not be evaluated
const BIG_VIOLATION = 1e6;     // violation assigned to a design that could not be evaluated
const HOLLOW_MARGIN = 1e-3;    // hollow sections must keep the bore open: outer >= 2 t (1 + margin)

// ---------------------------------------------------------------------------------------------
// Deterministic PRNG (pseudo-random number generator), mulberry32. This is a copy of labkit.makeRng:
// the worker must not import the plotting kit, and the module must give identical results for a seed.
// ---------------------------------------------------------------------------------------------
export function makeRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------------------------
// Dominance utilities (all objectives are minimized)
// ---------------------------------------------------------------------------------------------

// true when fa is no worse than fb in every objective and strictly better in at least one.
export function dominates(fa, fb) {
  let strict = false;
  for (let k = 0; k < fa.length; k++) {
    if (fa[k] > fb[k]) return false;
    if (fa[k] < fb[k]) strict = true;
  }
  return strict;
}

// Total constraint violation: sum of the positive parts of g (g <= 0 means satisfied).
export function constraintViolation(g) {
  let s = 0;
  for (const v of g) {
    if (Number.isNaN(v)) s += BIG_VIOLATION;
    else if (v > 0) s += v;
  }
  return s;
}

export function isFeasible(ind) { return ind.cv <= CV_TOL; }

// Deb's constraint-domination rule: a feasible design beats an infeasible one; between two infeasible
// designs the smaller total violation wins; between two feasible designs ordinary dominance decides.
export function constrainedDominates(a, b) {
  const fa = isFeasible(a), fb = isFeasible(b);
  if (fa && !fb) return true;
  if (!fa && fb) return false;
  if (!fa && !fb) return a.cv < b.cv;
  return dominates(a.f, b.f);
}

// Fast non-dominated sorting (Deb et al. 2002). items: array of objects with .f (and .cv when the
// constrained relation is used). Returns an array of fronts, each an array of indices into items,
// and writes .rank (0 = first front) on every item.
export function fastNonDominatedSort(items, dom = (a, b) => dominates(a.f, b.f)) {
  const N = items.length;
  const S = Array.from({ length: N }, () => []);
  const nDom = new Array(N).fill(0);
  for (let p = 0; p < N; p++) {
    for (let q = 0; q < N; q++) {
      if (p === q) continue;
      if (dom(items[p], items[q])) S[p].push(q);
      else if (dom(items[q], items[p])) nDom[p]++;
    }
  }
  const fronts = [[]];
  for (let p = 0; p < N; p++) if (nDom[p] === 0) { items[p].rank = 0; fronts[0].push(p); }
  let i = 0;
  while (fronts[i].length) {
    const next = [];
    for (const p of fronts[i]) {
      for (const q of S[p]) {
        nDom[q]--;
        if (nDom[q] === 0) { items[q].rank = i + 1; next.push(q); }
      }
    }
    i++;
    fronts.push(next);
  }
  fronts.pop();
  return fronts;
}

// Crowding distance of one front. frontIdx: indices into items. Extreme designs in each objective get
// Infinity; interior designs get the sum over objectives of the normalized gap between their neighbours.
// Writes .crowd on the items of the front and returns the distances in the order of frontIdx.
export function crowdingDistance(items, frontIdx) {
  const m = frontIdx.length;
  const dist = new Array(m).fill(0);
  if (m === 0) return dist;
  if (m <= 2) {
    dist.fill(Infinity);
    for (const i of frontIdx) items[i].crowd = Infinity;
    return dist;
  }
  const M = items[frontIdx[0]].f.length;
  const order = frontIdx.map((_, k) => k);
  for (let obj = 0; obj < M; obj++) {
    order.sort((a, b) => items[frontIdx[a]].f[obj] - items[frontIdx[b]].f[obj]);
    const fmin = items[frontIdx[order[0]]].f[obj];
    const fmax = items[frontIdx[order[m - 1]]].f[obj];
    dist[order[0]] = Infinity;
    dist[order[m - 1]] = Infinity;
    const range = fmax - fmin;
    if (!(range > 0)) continue;
    for (let k = 1; k < m - 1; k++) {
      if (dist[order[k]] === Infinity) continue;
      dist[order[k]] += (items[frontIdx[order[k + 1]]].f[obj] - items[frontIdx[order[k - 1]]].f[obj]) / range;
    }
  }
  frontIdx.forEach((i, k) => { items[i].crowd = dist[k]; });
  return dist;
}

// Crowded-comparison operator with constraint handling. Returns true when a should be preferred over b.
export function crowdedCompare(a, b) {
  const fa = isFeasible(a), fb = isFeasible(b);
  if (fa !== fb) return fa;
  if (!fa) return a.cv < b.cv;
  if (a.rank !== b.rank) return a.rank < b.rank;
  return a.crowd > b.crowd;
}

// Exact 2-D hypervolume (area dominated by the point set inside the box closed by the reference point).
// points: array of [f1, f2], minimization. Points outside the box contribute nothing. Computed by a
// staircase sweep after sorting by f1, so dominated points are skipped automatically.
export function hypervolume2D(points, ref) {
  const pts = points
    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] < ref[0] && p[1] < ref[1])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  let hv = 0;
  let lastF2 = ref[1];
  for (const p of pts) {
    if (p[1] < lastF2) {
      hv += (ref[0] - p[0]) * (lastF2 - p[1]);
      lastF2 = p[1];
    }
  }
  return hv;
}

// Non-dominated subset of a list of {f: [f1, f2]} objects (2-D, exact), sorted by f1 ascending.
export function nonDominatedSubset(points) {
  const sorted = points
    .filter(p => Number.isFinite(p.f[0]) && Number.isFinite(p.f[1]))
    .slice()
    .sort((a, b) => (a.f[0] - b.f[0]) || (a.f[1] - b.f[1]));
  const out = [];
  let lastF2 = Infinity;
  for (const p of sorted) {
    if (p.f[1] < lastF2) { out.push(p); lastF2 = p.f[1]; }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Variation operators (real coded)
// ---------------------------------------------------------------------------------------------

// Simulated binary crossover (SBX, Deb and Agrawal 1995), bounded version. Each variable is crossed with
// probability 0.5; children are clipped to the bounds. Returns [child1, child2].
export function sbxCrossover(x1, x2, lower, upper, etaC, rng) {
  const n = x1.length;
  const c1 = x1.slice(), c2 = x2.slice();
  const e = 1 / (etaC + 1);
  for (let i = 0; i < n; i++) {
    if (rng() > 0.5) continue;
    if (Math.abs(x1[i] - x2[i]) <= 1e-14) continue;
    const yl = lower[i], yu = upper[i];
    const y1 = Math.min(x1[i], x2[i]), y2 = Math.max(x1[i], x2[i]);
    const u = rng();
    let beta = 1 + 2 * (y1 - yl) / (y2 - y1);
    let alpha = 2 - Math.pow(beta, -(etaC + 1));
    let betaq = u <= 1 / alpha ? Math.pow(u * alpha, e) : Math.pow(1 / (2 - u * alpha), e);
    let ca = 0.5 * ((y1 + y2) - betaq * (y2 - y1));
    beta = 1 + 2 * (yu - y2) / (y2 - y1);
    alpha = 2 - Math.pow(beta, -(etaC + 1));
    betaq = u <= 1 / alpha ? Math.pow(u * alpha, e) : Math.pow(1 / (2 - u * alpha), e);
    let cb = 0.5 * ((y1 + y2) + betaq * (y2 - y1));
    ca = clamp(ca, yl, yu);
    cb = clamp(cb, yl, yu);
    if (rng() <= 0.5) { c1[i] = cb; c2[i] = ca; } else { c1[i] = ca; c2[i] = cb; }
  }
  return [c1, c2];
}

// Polynomial mutation (Deb), bounded version. Each variable mutates with probability pm.
export function polynomialMutation(x, lower, upper, etaM, pm, rng) {
  const y = x.slice();
  const mp = 1 / (etaM + 1);
  for (let i = 0; i < y.length; i++) {
    if (rng() > pm) continue;
    const yl = lower[i], yu = upper[i];
    const range = yu - yl;
    if (!(range > 0)) continue;
    const v = y[i];
    const d1 = (v - yl) / range, d2 = (yu - v) / range;
    const r = rng();
    let dq;
    if (r <= 0.5) {
      const xy = 1 - d1;
      const val = 2 * r + (1 - 2 * r) * Math.pow(xy, etaM + 1);
      dq = Math.pow(val, mp) - 1;
    } else {
      const xy = 1 - d2;
      const val = 2 * (1 - r) + 2 * (r - 0.5) * Math.pow(xy, etaM + 1);
      dq = 1 - Math.pow(val, mp);
    }
    y[i] = clamp(v + dq * range, yl, yu);
  }
  return y;
}

// ---------------------------------------------------------------------------------------------
// NSGA-II engine
// problem = { n, lower[], upper[], evaluate(x) -> { f: [f1, f2], g: [g1, ...] } } with g <= 0 feasible.
// ---------------------------------------------------------------------------------------------

function evaluateIndividual(problem, x) {
  let out = null;
  try { out = problem.evaluate(x); } catch (err) { out = null; }
  let f = out && Array.isArray(out.f) ? out.f.slice() : [];
  let g = out && Array.isArray(out.g) ? out.g.slice() : [];
  const bad = f.length < 2 || f.some(v => !Number.isFinite(v)) || g.some(v => Number.isNaN(v));
  if (bad) {
    f = f.map(v => (Number.isFinite(v) ? v : BIG_OBJECTIVE));
    while (f.length < 2) f.push(BIG_OBJECTIVE);
    g = [BIG_VIOLATION];
  }
  const cv = constraintViolation(g);
  return { x: x.slice(), f, g, cv, feasible: cv <= CV_TOL, rank: Infinity, crowd: 0 };
}

function serializeIndividual(ind) {
  return { x: ind.x.slice(), f: ind.f.slice(), g: ind.g.slice(), cv: ind.cv, feasible: ind.feasible, rank: ind.rank, crowd: ind.crowd };
}

export function validateProblem(problem) {
  if (!problem || !Number.isInteger(problem.n) || problem.n < 1) throw new Error('problem.n must be a positive integer');
  if (!Array.isArray(problem.lower) || !Array.isArray(problem.upper) || problem.lower.length !== problem.n || problem.upper.length !== problem.n) {
    throw new Error('problem.lower and problem.upper must have length n');
  }
  for (let i = 0; i < problem.n; i++) {
    if (!Number.isFinite(problem.lower[i]) || !Number.isFinite(problem.upper[i]) || !(problem.upper[i] > problem.lower[i])) {
      throw new Error(`bounds of variable ${i + 1} must be finite with upper > lower`);
    }
  }
  if (typeof problem.evaluate !== 'function') throw new Error('problem.evaluate must be a function');
}

// Creates a stepwise NSGA-II optimizer so the caller (page, worker, test) controls pacing and can cancel.
// options: { popSize = 60, generations = 120, seed = 1, etaC = 15, etaM = 20, pc = 0.9, pm = 1/n, ref }
export function createNsga2(problem, options = {}) {
  validateProblem(problem);
  const n = problem.n;
  let N = Number.isFinite(options.popSize) ? Math.round(options.popSize) : 60;
  if (N < 4) throw new Error('population size must be at least 4');
  if (N > 2000) throw new Error('population size above 2000 is not supported');
  if (N % 2) N += 1;
  const generations = Number.isFinite(options.generations) ? Math.round(options.generations) : 120;
  if (generations < 1 || generations > 20000) throw new Error('generations must be between 1 and 20000');
  const seed = Number.isFinite(options.seed) ? Math.round(options.seed) : 1;
  const etaC = Number.isFinite(options.etaC) ? options.etaC : 15;
  const etaM = Number.isFinite(options.etaM) ? options.etaM : 20;
  const pc = Number.isFinite(options.pc) ? options.pc : 0.9;
  const pm = Number.isFinite(options.pm) ? options.pm : 1 / n;
  if (!(etaC > 0) || !(etaM > 0)) throw new Error('distribution indices eta_c and eta_m must be positive');
  if (!(pc >= 0 && pc <= 1) || !(pm >= 0 && pm <= 1)) throw new Error('probabilities p_c and p_m must lie in [0, 1]');
  const lower = problem.lower.slice(), upper = problem.upper.slice();
  const rng = makeRng(seed);

  // initial population, uniform in the box
  let pop = [];
  for (let i = 0; i < N; i++) {
    const x = new Array(n);
    for (let k = 0; k < n; k++) x[k] = lower[k] + (upper[k] - lower[k]) * rng();
    pop.push(evaluateIndividual(problem, x));
  }
  let evaluations = N;
  let fronts = fastNonDominatedSort(pop, constrainedDominates);
  for (const fr of fronts) crowdingDistance(pop, fr);

  // hypervolume reference point: 1.1 x the largest value of each objective over the initial population.
  // Feasible members are used when at least two exist (infeasible designs can have absurd objective
  // values, for example the deflection of a 2 mm x 2 mm spar), otherwise every finite member.
  let ref = Array.isArray(options.ref) ? options.ref.slice() : null;
  if (!ref) {
    const feas = pop.filter(p => p.feasible);
    const basis = feas.length >= 2 ? feas : pop.filter(p => p.f.every(v => Number.isFinite(v) && Math.abs(v) < BIG_OBJECTIVE));
    const src = basis.length ? basis : pop;
    ref = [0, 1].map(k => {
      const mx = Math.max(...src.map(p => p.f[k]));
      return mx + 0.1 * Math.max(Math.abs(mx), 1e-12);
    });
  }
  const refBasis = pop.filter(p => p.feasible).length >= 2 ? 'feasible members of the initial population' : 'all members of the initial population';

  const currentFront = () => pop.filter(p => p.rank === 0 && p.feasible);
  const currentHV = () => hypervolume2D(currentFront().map(p => p.f), ref);
  const hvHistory = [currentHV()];
  let gen = 0;

  function tournament() {
    const a = pop[Math.floor(rng() * N)], b = pop[Math.floor(rng() * N)];
    if (crowdedCompare(a, b)) return a;
    if (crowdedCompare(b, a)) return b;
    return rng() < 0.5 ? a : b;
  }

  function progress() {
    const front = currentFront();
    return {
      gen, generations, evaluations,
      hv: hvHistory[hvHistory.length - 1],
      nFeasible: pop.filter(p => p.feasible).length,
      frontSize: front.length,
    };
  }

  function step() {
    if (gen >= generations) return progress();
    const offspring = [];
    while (offspring.length < N) {
      const p1 = tournament(), p2 = tournament();
      let c1, c2;
      if (rng() <= pc) [c1, c2] = sbxCrossover(p1.x, p2.x, lower, upper, etaC, rng);
      else { c1 = p1.x.slice(); c2 = p2.x.slice(); }
      c1 = polynomialMutation(c1, lower, upper, etaM, pm, rng);
      c2 = polynomialMutation(c2, lower, upper, etaM, pm, rng);
      offspring.push(evaluateIndividual(problem, c1));
      if (offspring.length < N) offspring.push(evaluateIndividual(problem, c2));
    }
    evaluations += offspring.length;
    // elitist (mu + lambda) selection
    const union = pop.concat(offspring);
    fronts = fastNonDominatedSort(union, constrainedDominates);
    const next = [];
    for (const fr of fronts) {
      crowdingDistance(union, fr);
      if (next.length + fr.length <= N) {
        for (const i of fr) next.push(union[i]);
      } else {
        const sorted = fr.slice().sort((a, b) => {
          const ca = union[a].crowd, cb = union[b].crowd;
          return cb > ca ? 1 : cb < ca ? -1 : 0;
        });
        for (const i of sorted) { if (next.length >= N) break; next.push(union[i]); }
      }
      if (next.length >= N) break;
    }
    pop = next;
    gen++;
    hvHistory.push(currentHV());
    return progress();
  }

  function result() {
    const front = nonDominatedSubset(currentFront()).map(serializeIndividual);
    return {
      population: pop.map(serializeIndividual),
      front,
      hvHistory: hvHistory.slice(),
      ref: ref.slice(),
      refBasis,
      generations: gen,
      evaluations,
      options: { popSize: N, generations, seed, etaC, etaM, pc, pm },
    };
  }

  return { step, result, progress, get gen() { return gen; }, get generations() { return generations; }, get done() { return gen >= generations; } };
}

// Convenience: run all generations synchronously. onGeneration(progress) is called after each generation.
export function runNsga2(problem, options = {}, onGeneration = null) {
  const opt = createNsga2(problem, options);
  while (!opt.done) {
    const p = opt.step();
    if (onGeneration) onGeneration(p);
  }
  return opt.result();
}

// ---------------------------------------------------------------------------------------------
// Benchmark problem for algorithm checks: ZDT1 (Zitzler, Deb and Thiele 2000). Analytic front f2 = 1 - sqrt(f1).
// ---------------------------------------------------------------------------------------------
export function zdt1Problem(n = 10) {
  return {
    kind: 'zdt1', n,
    lower: new Array(n).fill(0), upper: new Array(n).fill(1),
    names: Array.from({ length: n }, (_, i) => `x${i + 1}`),
    objectiveLabels: ['f1', 'f2'],
    evaluate(x) {
      let s = 0;
      for (let i = 1; i < n; i++) s += x[i];
      const g = 1 + 9 * s / (n - 1);
      const f1 = x[0];
      return { f: [f1, g * (1 - Math.sqrt(f1 / g))], g: [] };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Beam problem: exact closed forms (Euler-Bernoulli, linear elastic, small deflection)
// ---------------------------------------------------------------------------------------------

export const BEAM_CASES = {
  'cant-point': {
    name: 'Cantilever, point load P at the tip', support: 'cantilever', loadType: 'point',
    loadLabel: 'Tip load P', loadUnit: 'N', formula: 'M_max = P L at the root, v_max = P L^3 / (3 E I) at the tip',
    Mmax: (q, L) => q * L, vmax: (q, L, E, I) => q * L ** 3 / (3 * E * I),
  },
  'cant-udl': {
    name: 'Cantilever, uniform load w', support: 'cantilever', loadType: 'udl',
    loadLabel: 'Distributed load w', loadUnit: 'N/mm', formula: 'M_max = w L^2 / 2 at the root, v_max = w L^4 / (8 E I) at the tip',
    Mmax: (q, L) => q * L * L / 2, vmax: (q, L, E, I) => q * L ** 4 / (8 * E * I),
  },
  'ss-point': {
    name: 'Simply supported, point load P at midspan', support: 'simply', loadType: 'point',
    loadLabel: 'Midspan load P', loadUnit: 'N', formula: 'M_max = P L / 4, v_max = P L^3 / (48 E I) at midspan',
    Mmax: (q, L) => q * L / 4, vmax: (q, L, E, I) => q * L ** 3 / (48 * E * I),
  },
  'ss-udl': {
    name: 'Simply supported, uniform load w', support: 'simply', loadType: 'udl',
    loadLabel: 'Distributed load w', loadUnit: 'N/mm', formula: 'M_max = w L^2 / 8, v_max = 5 w L^4 / (384 E I) at midspan',
    Mmax: (q, L) => q * L * L / 8, vmax: (q, L, E, I) => 5 * q * L ** 4 / (384 * E * I),
  },
};

export const SECTION_FAMILIES = {
  rect: { name: 'Solid rectangle b x h', vars: [{ key: 'b', label: 'Width b', unit: 'mm' }, { key: 'h', label: 'Depth h', unit: 'mm' }] },
  tube: { name: 'Circular tube D, t', vars: [{ key: 'D', label: 'Outer diameter D', unit: 'mm' }, { key: 't', label: 'Wall thickness t', unit: 'mm' }] },
  box: { name: 'Rectangular box, b = 0.6 h, wall t', vars: [{ key: 'h', label: 'Depth h', unit: 'mm' }, { key: 't', label: 'Wall thickness t', unit: 'mm' }] },
};

// Default variable bounds and student designs per preset and family (mm).
export const BEAM_DEFAULTS = {
  'printed-spar': {
    caseKey: 'cant-point', tMin: 2,
    bounds: { rect: [[2, 30], [2, 60]], tube: [[6, 40], [1, 8]], box: [[6, 40], [1, 8]] },
    student: { rect: [12, 24], tube: [24, 3], box: [24, 3] },
  },
  'ss-udl': {
    caseKey: 'ss-udl', tMin: 1,
    bounds: { rect: [[2, 60], [2, 60]], tube: [[10, 80], [0.5, 6]], box: [[10, 80], [0.5, 6]] },
    student: { rect: [20, 40], tube: [30, 2], box: [40, 2] },
  },
};

// Builds a beam spec from a shared preset. Returns a plain object the page can edit before makeBeamProblem.
export function beamSpecFromPreset(presetKey = 'printed-spar', family = null) {
  const preset = BEAM_PRESETS[presetKey];
  const d = BEAM_DEFAULTS[presetKey];
  if (!preset || !d) throw new Error(`unknown beam preset "${presetKey}"`);
  const fam = family || preset.section.type;
  if (!SECTION_FAMILIES[fam]) throw new Error(`unknown section family "${fam}"`);
  const load = preset.loads[0];
  return {
    kind: 'beam', preset: presetKey, caseKey: d.caseKey, L: preset.L,
    load: load.type === 'point' ? load.P : load.w,
    material: preset.material, FS: preset.FS, tMin: d.tMin, family: fam,
    bounds: d.bounds[fam].map(b => b.slice()),
    student: d.student[fam].slice(),
  };
}

function materialCard(m) {
  if (typeof m === 'string') {
    const card = MATERIALS[m];
    if (!card) throw new Error(`unknown material "${m}"`);
    return Object.assign({ key: m }, card);
  }
  if (m && Number.isFinite(m.E) && Number.isFinite(m.sigmaAllow) && Number.isFinite(m.rho)) return m;
  throw new Error('material must be a preset key or an object with E, sigmaAllow and rho');
}

// Section properties for the two design variables of a family. Hollow sections whose wall closes the bore
// are evaluated as the solid section of the same outer size (finite stand-in) and flagged hollow = false;
// the geometric constraint then marks the design infeasible.
export function beamSection(family, x) {
  const [x1, x2] = x;
  if (family === 'rect') {
    const p = sectionProps('rect', { b: x1, h: x2 });
    return Object.assign(p, { hollow: true, hollowRatio: 0, outer: x2, b: x1, depth: x2, wall: Math.min(x1, x2) });
  }
  if (family === 'tube') {
    let p = sectionProps('tube', { D: x1, t: x2 });
    let hollow = true;
    if (!Number.isFinite(p.A)) {
      hollow = false;
      p = { A: Math.PI / 4 * x1 ** 2, I: Math.PI / 64 * x1 ** 4, c: x1 / 2, tmin: x2, h: x1 };
    }
    return Object.assign(p, { hollow, hollowRatio: 2 * x2 / x1, outer: x1, depth: x1, wall: x2 });
  }
  if (family === 'box') {
    const b = 0.6 * x1;
    let p = sectionProps('box', { b, h: x1, t: x2 });
    let hollow = true;
    if (!Number.isFinite(p.A)) {
      hollow = false;
      const q = sectionProps('rect', { b, h: x1 });
      p = { A: q.A, I: q.I, c: q.c, tmin: x2, h: x1 };
    }
    return Object.assign(p, { hollow, hollowRatio: 2 * x2 / b, outer: b, b, depth: x1, wall: x2 });
  }
  throw new Error(`unknown section family "${family}"`);
}

function checkBeamSpec(spec) {
  if (!spec || spec.kind !== 'beam') throw new Error('beam spec expected');
  const bc = BEAM_CASES[spec.caseKey];
  if (!bc) throw new Error(`unknown beam case "${spec.caseKey}"`);
  if (!SECTION_FAMILIES[spec.family]) throw new Error(`unknown section family "${spec.family}"`);
  if (!(Number.isFinite(spec.L) && spec.L > 0)) throw new Error('span L must be a positive number (mm)');
  if (!(Number.isFinite(spec.load) && spec.load > 0)) throw new Error(`${bc.loadLabel} must be a positive number (${bc.loadUnit})`);
  if (!(Number.isFinite(spec.FS) && spec.FS >= 1)) throw new Error('factor of safety FS must be at least 1');
  if (!(Number.isFinite(spec.tMin) && spec.tMin >= 0)) throw new Error('minimum thickness t_min must be zero or positive (mm)');
  const mat = materialCard(spec.material);
  if (!(mat.E > 0 && mat.sigmaAllow > 0 && mat.rho > 0)) throw new Error('material card must have positive E, sigmaAllow and rho');
  if (!Array.isArray(spec.bounds) || spec.bounds.length !== 2) throw new Error('bounds must list [min, max] for both variables');
  spec.bounds.forEach((b, i) => {
    if (!Array.isArray(b) || !Number.isFinite(b[0]) || !Number.isFinite(b[1]) || !(b[0] > 0) || !(b[1] > b[0])) {
      throw new Error(`bounds of ${SECTION_FAMILIES[spec.family].vars[i].label} must satisfy 0 < min < max (mm)`);
    }
  });
  return { bc, mat };
}

// Exact evaluation of one beam design. Returns objectives, constraints and the full detail record.
export function evaluateBeamDesign(spec, x) {
  const { bc, mat } = checkBeamSpec(spec);
  if (!Array.isArray(x) || x.length < 2 || !x.every(v => Number.isFinite(v) && v > 0)) {
    throw new Error('design variables must be two positive numbers (mm)');
  }
  const sec = beamSection(spec.family, x);
  const M = bc.Mmax(spec.load, spec.L);
  const sigma = M * sec.c / sec.I;
  const defl = bc.vmax(spec.load, spec.L, mat.E, sec.I);
  const mass = sec.A * spec.L * mat.rho / 1000;
  const U_stress = sigma * spec.FS / mat.sigmaAllow;
  const U_tmin = spec.tMin > 0 ? spec.tMin / sec.wall : 0;
  const constraints = [
    { name: 'Bending stress', U: U_stress, g: U_stress - 1, kind: 'stress', text: `sigma_max FS / sigma_allow = ${sigma.toPrecision(4)} x ${spec.FS} / ${mat.sigmaAllow}` },
    { name: spec.family === 'rect' ? 'Minimum dimension >= t_min' : 'Wall thickness >= t_min', U: U_tmin, g: U_tmin - 1, kind: 'geometry', text: `t_min / ${spec.family === 'rect' ? 'min(b, h)' : 't'} = ${spec.tMin} / ${sec.wall.toPrecision(4)}` },
  ];
  if (spec.family !== 'rect') {
    const U_hollow = sec.hollowRatio * (1 + HOLLOW_MARGIN);
    constraints.push({
      name: spec.family === 'tube' ? 'Hollow tube: D > 2 t' : 'Hollow box: b > 2 t',
      U: U_hollow, g: U_hollow - 1, kind: 'geometry',
      text: `2 t / ${spec.family === 'tube' ? 'D' : 'b'} = ${sec.hollowRatio.toPrecision(4)} (must stay below 1)`,
    });
  }
  const g = constraints.map(c => c.g);
  const cv = constraintViolation(g);
  return {
    kind: 'beam', x: x.slice(), f: [mass, defl], g, cv, feasible: cv <= CV_TOL,
    mass, deflection: defl, M, sigma, A: sec.A, I: sec.I, c: sec.c, hollow: sec.hollow, section: sec,
    E: mat.E, sigmaAllow: mat.sigmaAllow, rho: mat.rho, materialName: mat.name,
    constraints,
    objectiveLabels: ['Mass (g)', 'Maximum deflection (mm)'],
  };
}

export function makeBeamProblem(spec) {
  checkBeamSpec(spec);
  const fam = SECTION_FAMILIES[spec.family];
  return {
    kind: 'beam', n: 2,
    lower: spec.bounds.map(b => b[0]), upper: spec.bounds.map(b => b[1]),
    names: fam.vars.map(v => v.label), keys: fam.vars.map(v => v.key), units: fam.vars.map(v => v.unit),
    objectiveLabels: ['Mass (g)', 'Maximum deflection (mm)'],
    objectiveUnits: ['g', 'mm'],
    spec,
    evaluate(x) { const d = evaluateBeamDesign(spec, x); return { f: d.f, g: d.g }; },
  };
}

// Independent Euler-Bernoulli finite element re-solve (2-node Hermite cubic elements, consistent loads).
// Nodal deflections and element end moments are exact for these load cases, so this is a genuine cross check
// of the closed forms. Returns { vmax, Mmax, x[], v[] }.
export function beamFE(caseKey, L, q, E, I, ne = 16) {
  const bc = BEAM_CASES[caseKey];
  if (!bc) throw new Error(`unknown beam case "${caseKey}"`);
  if (ne % 2) ne += 1;
  const l = L / ne;
  const ndof = 2 * (ne + 1);
  const K = Array.from({ length: ndof }, () => new Float64Array(ndof));
  const F = new Float64Array(ndof);
  const k = EI_l3 => [
    [12 * EI_l3, 6 * l * EI_l3, -12 * EI_l3, 6 * l * EI_l3],
    [6 * l * EI_l3, 4 * l * l * EI_l3, -6 * l * EI_l3, 2 * l * l * EI_l3],
    [-12 * EI_l3, -6 * l * EI_l3, 12 * EI_l3, -6 * l * EI_l3],
    [6 * l * EI_l3, 2 * l * l * EI_l3, -6 * l * EI_l3, 4 * l * l * EI_l3],
  ];
  const ke = k(E * I / l ** 3);
  const fe = bc.loadType === 'udl' ? [-q * l / 2, -q * l * l / 12, -q * l / 2, q * l * l / 12] : [0, 0, 0, 0];
  for (let e = 0; e < ne; e++) {
    const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) {
      F[dofs[a]] += fe[a];
      for (let b = 0; b < 4; b++) K[dofs[a]][dofs[b]] += ke[a][b];
    }
  }
  if (bc.loadType === 'point') {
    const node = bc.support === 'cantilever' ? ne : ne / 2;
    F[2 * node] += -q;
  }
  const fixed = bc.support === 'cantilever' ? [0, 1] : [0, 2 * ne];
  const free = [];
  for (let i = 0; i < ndof; i++) if (!fixed.includes(i)) free.push(i);
  const Kff = free.map(i => Float64Array.from(free.map(j => K[i][j])));
  const Ff = Float64Array.from(free.map(i => F[i]));
  const uf = solveLinearSystem(Kff, Ff);
  if (!uf) throw new Error('beam finite element system is singular');
  const u = new Float64Array(ndof);
  free.forEach((i, k2) => { u[i] = uf[k2]; });
  let vmax = 0;
  const v = [], xs = [];
  for (let i = 0; i <= ne; i++) { v.push(u[2 * i]); xs.push(i * l); vmax = Math.max(vmax, Math.abs(u[2 * i])); }
  // element end moments from element equilibrium: f_int = k_e u_e - f_e(load)
  let Mmax = 0;
  for (let e = 0; e < ne; e++) {
    const ue = [u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]];
    for (const row of [1, 3]) {
      let s = -fe[row];
      for (let b = 0; b < 4; b++) s += ke[row][b] * ue[b];
      Mmax = Math.max(Mmax, Math.abs(s));
    }
  }
  return { vmax, Mmax, x: xs, v };
}

// Verification routine for a beam design: rebuilds the section from the design numbers, evaluates the closed
// forms, re-solves the beam with the independent finite element model and re-checks every constraint.
export function verifyBeamDesign(spec, x) {
  let d;
  try { d = evaluateBeamDesign(spec, x); } catch (err) { return { verified: false, feasible: false, message: err.message, utilizations: [], governing: null }; }
  const fe = beamFE(spec.caseKey, spec.L, spec.load, d.E, d.I, 16);
  const relV = Math.abs(fe.vmax - d.deflection) / Math.max(Math.abs(d.deflection), 1e-12);
  const relM = Math.abs(fe.Mmax - d.M) / Math.max(Math.abs(d.M), 1e-12);
  const agree = relV < 1e-6 && relM < 1e-6;
  const utilizations = d.constraints.map(c => ({ name: c.name, U: c.U, kind: c.kind, ok: c.g <= CV_TOL, text: c.text }));
  const governing = utilizations.reduce((best, u) => (best === null || u.U > best.U ? u : best), null);
  const activeBounds = activeBoundList(spec.bounds.map(b => b[0]), spec.bounds.map(b => b[1]), x, SECTION_FAMILIES[spec.family].vars.map(v => v.label));
  const feasible = d.feasible && d.hollow;
  let message;
  if (!agree) message = `Finite element re-solve disagrees with the closed form (deflection ${(relV * 100).toFixed(3)} %, moment ${(relM * 100).toFixed(3)} %)`;
  else if (!feasible) message = 'Re-solve confirms the design violates: ' + utilizations.filter(u => !u.ok).map(u => `${u.name} (U = ${u.U.toFixed(3)})`).join(', ');
  else message = 'Checked by fresh model solve';
  return {
    verified: agree && feasible, feasible, agree, message, utilizations, governing, activeBounds,
    mass: d.mass, deflection: d.deflection, M: d.M, sigma: d.sigma, A: d.A, I: d.I, hollow: d.hollow,
    fe: { deflection: fe.vmax, Mmax: fe.Mmax, relV, relM, elements: 16 },
    detail: d,
  };
}

// Classical closed-form Pareto front of the beam problem. At fixed area the second moment of area grows
// with the outer dimension (depth of a rectangle or box, diameter of a tube), so every Pareto optimal design
// has the outer dimension at its upper bound, except at the light end where the wall (or width) has reached
// its lower bound and only the outer dimension can shrink. The front is therefore the union of two boundary
// segments; the end points of each segment come from the stress constraint by bisection. Returns the points
// sorted by mass as { x, f, segment }.
export function analyticBeamFront(spec, n = 120) {
  checkBeamSpec(spec);
  const outerIdx = spec.family === 'rect' ? 1 : 0;
  const wallIdx = 1 - outerIdx;
  const lo = spec.bounds.map(b => b[0]), hi = spec.bounds.map(b => b[1]);
  const make = (outer, wall) => { const x = [0, 0]; x[outerIdx] = outer; x[wallIdx] = wall; return x; };
  const feasible = x => { try { const d = evaluateBeamDesign(spec, x); return d.feasible && d.hollow; } catch (e) { return false; } };
  // bisection for the smallest feasible value of one variable, the other fixed; feasibility is monotone there
  const smallestFeasible = (f, a, b) => {
    if (!f(b)) return null;
    if (f(a)) return a;
    for (let k = 0; k < 80; k++) { const mid = 0.5 * (a + b); if (f(mid)) b = mid; else a = mid; }
    return b;
  };
  const pts = [];
  const half = Math.max(2, Math.floor(n / 2));
  // segment A: outer dimension at its upper bound, wall from the stress limit to its cap
  let wallCap = hi[wallIdx];
  if (spec.family === 'tube') wallCap = Math.min(wallCap, hi[outerIdx] / (2 * (1 + HOLLOW_MARGIN)) * (1 - 1e-9));
  if (spec.family === 'box') wallCap = Math.min(wallCap, 0.6 * hi[outerIdx] / (2 * (1 + HOLLOW_MARGIN)) * (1 - 1e-9));
  const wStar = smallestFeasible(w => feasible(make(hi[outerIdx], w)), lo[wallIdx], wallCap);
  if (wStar !== null) {
    for (let k = 0; k < half; k++) {
      const w = wStar + (wallCap - wStar) * k / (half - 1);
      const x = make(hi[outerIdx], w);
      const d = evaluateBeamDesign(spec, x);
      pts.push({ x, f: d.f, segment: 'outer at upper bound' });
    }
  }
  // segment B: wall at its lower bound (or t_min), outer from the stress limit up to its upper bound
  const w0 = Math.max(lo[wallIdx], spec.tMin);
  if (w0 <= hi[wallIdx]) {
    const oStar = smallestFeasible(o => feasible(make(o, w0)), lo[outerIdx], hi[outerIdx]);
    if (oStar !== null) {
      for (let k = 0; k < half; k++) {
        const o = oStar + (hi[outerIdx] - oStar) * k / (half - 1);
        const x = make(o, w0);
        const d = evaluateBeamDesign(spec, x);
        pts.push({ x, f: d.f, segment: 'wall at lower bound' });
      }
    }
  }
  return nonDominatedSubset(pts);
}

function activeBoundList(lower, upper, x, names, tol = 0.005) {
  const out = [];
  for (let i = 0; i < x.length; i++) {
    const range = upper[i] - lower[i];
    if (Math.abs(x[i] - upper[i]) <= tol * range) out.push({ name: names[i], side: 'upper', value: upper[i] });
    else if (Math.abs(x[i] - lower[i]) <= tol * range) out.push({ name: names[i], side: 'lower', value: lower[i] });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dense linear solver (Gaussian elimination with partial pivoting). Returns null when singular.
// ---------------------------------------------------------------------------------------------
export function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map(row => Float64Array.from(row));
  const rhs = Float64Array.from(b);
  let scale = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(M[i][j]));
  const tol = 1e-12 * (scale || 1);
  for (let k = 0; k < n; k++) {
    let p = k, best = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(M[i][k]); if (v > best) { best = v; p = i; } }
    if (!(best > tol)) return null;
    if (p !== k) { const tmp = M[k]; M[k] = M[p]; M[p] = tmp; const t = rhs[k]; rhs[k] = rhs[p]; rhs[p] = t; }
    const pivotRow = M[k], piv = pivotRow[k];
    for (let i = k + 1; i < n; i++) {
      const row = M[i];
      const fct = row[k] / piv;
      if (fct === 0) continue;
      for (let j = k; j < n; j++) row[j] -= fct * pivotRow[j];
      rhs[i] -= fct * rhs[k];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = rhs[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(x[i])) return null;
  return x;
}

// ---------------------------------------------------------------------------------------------
// 2D truss: exact direct stiffness solver with mechanism detection (SPEC section 4)
// ---------------------------------------------------------------------------------------------

// model: { nodes: [[x, y]], members: [[a, b, groupKey]], groups: { key: { material, tensionOnly, buckling } },
//         supports: { node: [fixX, fixY] }, loads: { node: [Fx, Fy] } }
// areas: { groupKey: A_mm2 }. opts: { FS = 1.5, K = 1 }.
export function solveTruss(model, areas, opts = {}) {
  const FS = Number.isFinite(opts.FS) ? opts.FS : 1.5;
  const Kfac = Number.isFinite(opts.K) ? opts.K : 1;
  const nn = model.nodes.length;
  const ndof = 2 * nn;
  const K = Array.from({ length: ndof }, () => new Float64Array(ndof));
  const F = new Float64Array(ndof);
  const mem = [];
  let mass = 0;
  for (let i = 0; i < model.members.length; i++) {
    const [a, b, gkey] = model.members[i];
    const grp = model.groups[gkey];
    if (!grp) throw new Error(`member ${i} refers to unknown group "${gkey}"`);
    const mat = materialCard(grp.material);
    const A = areas[gkey];
    if (!(Number.isFinite(A) && A > 0)) throw new Error(`area of group "${gkey}" must be a positive number (mm^2)`);
    const dx = model.nodes[b][0] - model.nodes[a][0], dy = model.nodes[b][1] - model.nodes[a][1];
    const L = Math.hypot(dx, dy);
    if (!(L > 0)) throw new Error(`member ${i} has zero length`);
    const c = dx / L, s = dy / L;
    const kk = mat.E * A / L;
    const dofs = [2 * a, 2 * a + 1, 2 * b, 2 * b + 1];
    const t = [-c, -s, c, s];
    for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) K[dofs[p]][dofs[q]] += kk * t[p] * t[q];
    mass += A * L * mat.rho / 1000;
    mem.push({ index: i, a, b, group: gkey, L, A, c, s, E: mat.E, sigmaAllow: mat.sigmaAllow, rho: mat.rho, tensionOnly: !!grp.tensionOnly, buckling: grp.buckling || 'none' });
  }
  let sumLoads = [0, 0];
  for (const [node, fxy] of Object.entries(model.loads || {})) {
    const k = Number(node);
    F[2 * k] += fxy[0]; F[2 * k + 1] += fxy[1];
    sumLoads[0] += fxy[0]; sumLoads[1] += fxy[1];
  }
  const fixed = new Set();
  for (const [node, fix] of Object.entries(model.supports || {})) {
    const k = Number(node);
    if (fix[0]) fixed.add(2 * k);
    if (fix[1]) fixed.add(2 * k + 1);
  }
  const free = [];
  for (let i = 0; i < ndof; i++) if (!fixed.has(i)) free.push(i);
  const base = { members: mem, mass, sumLoads, fixedCount: fixed.size };
  if (fixed.size < 3) return Object.assign(base, { unstable: true, reason: 'fewer than three support reactions: rigid-body motion is possible' });
  const Kff = free.map(i => Float64Array.from(free.map(j => K[i][j])));
  const Ff = Float64Array.from(free.map(i => F[i]));
  const uf = solveLinearSystem(Kff, Ff);
  if (!uf) return Object.assign(base, { unstable: true, reason: 'singular stiffness matrix: the truss is a mechanism' });
  const u = new Float64Array(ndof);
  free.forEach((i, k) => { u[i] = uf[k]; });
  // reactions R = K u - F at fixed degrees of freedom
  const reactions = {};
  const sumReactions = [0, 0];
  for (const i of fixed) {
    let r = -F[i];
    for (let j = 0; j < ndof; j++) r += K[i][j] * u[j];
    const node = Math.floor(i / 2), comp = i % 2;
    if (!reactions[node]) reactions[node] = [0, 0];
    reactions[node][comp] = r;
    sumReactions[comp] += r;
  }
  const equilibriumResidual = Math.hypot(sumReactions[0] + sumLoads[0], sumReactions[1] + sumLoads[1]);
  const loadScale = Math.max(1, Math.hypot(sumLoads[0], sumLoads[1]));
  // member forces and utilizations
  let maxU = 0, governing = null;
  for (const m of mem) {
    const du = (u[2 * m.b] - u[2 * m.a]) * m.c + (u[2 * m.b + 1] - u[2 * m.a + 1]) * m.s;
    m.N = m.E * m.A / m.L * du;
    m.stress = m.N / m.A;
    m.U_stress = Math.abs(m.N) * FS / (m.A * m.sigmaAllow);
    m.U_buckling = 0;
    m.Pcr = null;
    m.slack = false;
    if (m.N < 0) {
      if (m.tensionOnly) m.slack = true;
      if (m.buckling === 'square') {
        const I = m.A * m.A / 12;
        m.Pcr = Math.PI ** 2 * m.E * I / (Kfac * m.L) ** 2;
        m.U_buckling = Math.abs(m.N) * FS / m.Pcr;
      }
    }
    m.U = Math.max(m.U_stress, m.U_buckling);
    m.mode = m.U_buckling > m.U_stress ? 'buckling' : 'stress';
    m.label = `${m.group} ${m.a}-${m.b}`;
    if (m.U > maxU) { maxU = m.U; governing = m; }
  }
  const displacements = [];
  for (let i = 0; i < nn; i++) displacements.push([u[2 * i], u[2 * i + 1]]);
  return Object.assign(base, {
    unstable: false, u, displacements, reactions, sumReactions, equilibriumResidual,
    equilibriumOk: equilibriumResidual <= 1e-6 * loadScale,
    maxU, governing: governing ? { label: governing.label, mode: governing.mode, U: governing.U, index: governing.index } : null,
    feasible: maxU <= 1 + CV_TOL && !mem.some(m => m.slack),
    FS, K: Kfac,
  });
}

// Warren truss model from the shared preset with an adjustable height h (moves all top chord nodes).
export function buildWarrenModel(h = 1000, loadCase = 'uniform') {
  const p = TRUSS_PRESETS.warren;
  if (!(Number.isFinite(h) && h > 0)) throw new Error('truss height h must be a positive number (mm)');
  const loads = p.loadCases[loadCase];
  if (!loads) throw new Error(`unknown load case "${loadCase}"`);
  const nodes = p.nodes.map(([x, y]) => [x, y > 0 ? h : y]);
  return { name: p.name, nodes, members: p.members.map(m => m.slice()), groups: p.groups, supports: p.supports, loads, loadCase };
}

export const TRUSS_DEFAULTS = {
  loadCase: 'uniform', FS: 1.5, Abounds: [50, 1500], hBounds: [300, 2500], hFixed: 1000, optimizeH: false,
  student: [600, 600, 1000], deflectionNode: 3,
};

export function trussSpecDefault() {
  const d = TRUSS_DEFAULTS;
  return { kind: 'truss', loadCase: d.loadCase, FS: d.FS, Abounds: d.Abounds.slice(), hBounds: d.hBounds.slice(), hFixed: d.hFixed, optimizeH: d.optimizeH, student: d.student.slice() };
}

function checkTrussSpec(spec) {
  if (!spec || spec.kind !== 'truss') throw new Error('truss spec expected');
  if (!TRUSS_PRESETS.warren.loadCases[spec.loadCase]) throw new Error(`unknown load case "${spec.loadCase}"`);
  if (!(Number.isFinite(spec.FS) && spec.FS >= 1)) throw new Error('factor of safety FS must be at least 1');
  const ab = spec.Abounds;
  if (!Array.isArray(ab) || !(ab[0] > 0) || !(ab[1] > ab[0])) throw new Error('area bounds must satisfy 0 < min < max (mm^2)');
  if (spec.optimizeH) {
    const hb = spec.hBounds;
    if (!Array.isArray(hb) || !(hb[0] > 0) || !(hb[1] > hb[0])) throw new Error('height bounds must satisfy 0 < min < max (mm)');
  } else if (!(Number.isFinite(spec.hFixed) && spec.hFixed > 0)) throw new Error('truss height h must be a positive number (mm)');
}

export function trussVariableNames(spec) {
  const names = ['Chord area A_chord', 'Diagonal area A_diag'], units = ['mm^2', 'mm^2'], keys = ['Achord', 'Adiag'];
  if (spec.optimizeH) { names.push('Truss height h'); units.push('mm'); keys.push('h'); }
  return { names, units, keys };
}

// Exact evaluation of one Warren truss design x = [A_chord, A_diag, (h)].
export function evaluateTrussDesign(spec, x) {
  checkTrussSpec(spec);
  const nv = spec.optimizeH ? 3 : 2;
  if (!Array.isArray(x) || x.length < nv || !x.slice(0, nv).every(v => Number.isFinite(v) && v > 0)) {
    throw new Error(`design variables must be ${nv} positive numbers`);
  }
  const h = spec.optimizeH ? x[2] : spec.hFixed;
  const model = buildWarrenModel(h, spec.loadCase);
  const sol = solveTruss(model, { chord: x[0], diag: x[1] }, { FS: spec.FS, K: 1 });
  const node = TRUSS_DEFAULTS.deflectionNode;
  if (sol.unstable) {
    return {
      kind: 'truss', x: x.slice(), f: [sol.mass, 1e6], g: [BIG_VIOLATION], cv: BIG_VIOLATION, feasible: false,
      mass: sol.mass, deflection: NaN, unstable: true, reason: sol.reason, model, solution: sol, h,
      constraints: [], objectiveLabels: ['Mass (g)', 'Midspan deflection (mm)'],
    };
  }
  const defl = Math.abs(sol.displacements[node][1]);
  const constraints = sol.members.map(m => ({
    name: `${m.label} ${m.mode}`, U: m.U, g: m.U - 1, kind: m.mode, member: m.index,
    text: `N = ${m.N.toFixed(0)} N, stress U = ${m.U_stress.toFixed(3)}` + (m.Pcr ? `, buckling U = ${m.U_buckling.toFixed(3)} (P_cr = ${m.Pcr.toFixed(0)} N)` : ''),
  }));
  const g = constraints.map(c => c.g);
  const cv = constraintViolation(g);
  return {
    kind: 'truss', x: x.slice(), f: [sol.mass, defl], g, cv, feasible: cv <= CV_TOL,
    mass: sol.mass, deflection: defl, unstable: false, model, solution: sol, h,
    constraints, objectiveLabels: ['Mass (g)', 'Midspan deflection (mm)'],
  };
}

export function makeTrussProblem(spec) {
  checkTrussSpec(spec);
  const { names, units, keys } = trussVariableNames(spec);
  const lower = [spec.Abounds[0], spec.Abounds[0]], upper = [spec.Abounds[1], spec.Abounds[1]];
  if (spec.optimizeH) { lower.push(spec.hBounds[0]); upper.push(spec.hBounds[1]); }
  return {
    kind: 'truss', n: lower.length, lower, upper, names, units, keys,
    objectiveLabels: ['Mass (g)', 'Midspan deflection (mm)'], objectiveUnits: ['g', 'mm'],
    spec,
    evaluate(x) { const d = evaluateTrussDesign(spec, x); return { f: d.f, g: d.g }; },
  };
}

// Verification routine for a truss design: rebuilds the model from the numbers, solves it with the plain
// direct stiffness solver, checks global equilibrium and every member utilization.
export function verifyTrussDesign(spec, x) {
  let d;
  try { d = evaluateTrussDesign(spec, x); } catch (err) { return { verified: false, feasible: false, message: err.message, utilizations: [], governing: null }; }
  const { names } = trussVariableNames(spec);
  const lower = [spec.Abounds[0], spec.Abounds[0]], upper = [spec.Abounds[1], spec.Abounds[1]];
  if (spec.optimizeH) { lower.push(spec.hBounds[0]); upper.push(spec.hBounds[1]); }
  const activeBounds = activeBoundList(lower, upper, x.slice(0, lower.length), names);
  if (d.unstable) {
    return { verified: false, feasible: false, message: 'Unstable structure: ' + d.reason, utilizations: [], governing: null, mass: d.mass, deflection: NaN, unstable: true, activeBounds, detail: d };
  }
  const sol = d.solution;
  const utilizations = sol.members.map(m => ({
    name: m.label, U: m.U, kind: m.mode, ok: m.U <= 1 + CV_TOL, N: m.N, stress: m.stress, U_stress: m.U_stress, U_buckling: m.U_buckling, Pcr: m.Pcr, L: m.L, slack: m.slack,
  }));
  const governing = sol.governing ? { name: sol.governing.label, U: sol.governing.U, kind: sol.governing.mode } : null;
  const feasible = d.feasible && sol.equilibriumOk;
  let message;
  if (!sol.equilibriumOk) message = `Equilibrium check failed (residual ${sol.equilibriumResidual.toExponential(2)} N)`;
  else if (!feasible) {
    const worst = utilizations.filter(u => !u.ok).sort((a, b) => b.U - a.U).slice(0, 3);
    message = 'Re-solve confirms the design violates: ' + worst.map(u => `${u.name} ${u.kind} (U = ${u.U.toFixed(3)})`).join(', ') + (utilizations.filter(u => !u.ok).length > 3 ? ', ...' : '');
  } else message = 'Checked by fresh model solve';
  return {
    verified: feasible, feasible, message, utilizations, governing, activeBounds,
    mass: d.mass, deflection: d.deflection, maxU: sol.maxU, h: d.h,
    equilibrium: { residual: sol.equilibriumResidual, ok: sol.equilibriumOk, sumLoads: sol.sumLoads, sumReactions: sol.sumReactions, reactions: sol.reactions },
    detail: d,
  };
}

// ---------------------------------------------------------------------------------------------
// Generic dispatch by spec.kind
// ---------------------------------------------------------------------------------------------
export function makeProblem(spec) {
  if (!spec) throw new Error('no problem specification');
  if (spec.kind === 'beam') return makeBeamProblem(spec);
  if (spec.kind === 'truss') return makeTrussProblem(spec);
  if (spec.kind === 'zdt1') return zdt1Problem(spec.n || 10);
  throw new Error(`unknown problem kind "${spec.kind}"`);
}

export function evaluateDesign(spec, x) {
  if (spec.kind === 'beam') return evaluateBeamDesign(spec, x);
  if (spec.kind === 'truss') return evaluateTrussDesign(spec, x);
  throw new Error(`unknown problem kind "${spec.kind}"`);
}

export function verifyDesign(spec, x) {
  if (spec.kind === 'beam') return verifyBeamDesign(spec, x);
  if (spec.kind === 'truss') return verifyTrussDesign(spec, x);
  throw new Error(`unknown problem kind "${spec.kind}"`);
}

// ---------------------------------------------------------------------------------------------
// Front analytics: student classification, distance, trade-off readings, reference sweep
// ---------------------------------------------------------------------------------------------

export function frontRanges(frontF) {
  const r = [[Infinity, -Infinity], [Infinity, -Infinity]];
  for (const f of frontF) for (let k = 0; k < 2; k++) { if (f[k] < r[k][0]) r[k][0] = f[k]; if (f[k] > r[k][1]) r[k][1] = f[k]; }
  return r;
}

// Classifies a design against a computed front (array of [f1, f2]). Returns the number of front designs that
// dominate it, its status and the normalized Euclidean distance to the nearest front point (objectives are
// scaled by the ranges of the front).
export function classifyDesign(f, frontF) {
  if (!frontF || frontF.length === 0) return { status: 'no-front', dominatedBy: 0, normalizedDistance: NaN, nearestIndex: -1 };
  let dominatedBy = 0;
  for (const p of frontF) if (dominates(p, f)) dominatedBy++;
  const r = frontRanges(frontF);
  const scale = r.map(([lo, hi]) => (hi > lo ? hi - lo : Math.max(Math.abs(hi), 1e-12)));
  let best = Infinity, nearestIndex = -1;
  frontF.forEach((p, i) => {
    const d = Math.hypot((f[0] - p[0]) / scale[0], (f[1] - p[1]) / scale[1]);
    if (d < best) { best = d; nearestIndex = i; }
  });
  const dominatesFront = frontF.filter(p => dominates(f, p)).length;
  return {
    status: dominatedBy > 0 ? 'dominated' : 'non-dominated', dominatedBy, dominatesFront,
    normalizedDistance: best, nearestIndex, scale,
  };
}

// Linear interpolation on a front sorted by f1 ascending (f2 then descends). Returns f2 at the given f1,
// or null when f1 lies outside the front's mass range.
function interpF2(front, f1) {
  for (let i = 0; i < front.length - 1; i++) {
    const a = front[i], b = front[i + 1];
    if (f1 >= a[0] && f1 <= b[0]) {
      const t = b[0] > a[0] ? (f1 - a[0]) / (b[0] - a[0]) : 0;
      return a[1] + t * (b[1] - a[1]);
    }
  }
  if (front.length && Math.abs(f1 - front[0][0]) < 1e-12) return front[0][1];
  return null;
}

function interpF1(front, f2) {
  // along the sorted front f2 decreases with index
  for (let i = 0; i < front.length - 1; i++) {
    const a = front[i], b = front[i + 1];
    const hi = Math.max(a[1], b[1]), lo = Math.min(a[1], b[1]);
    if (f2 <= hi && f2 >= lo) {
      const t = hi > lo ? (a[1] - f2) / (a[1] - b[1]) : 0;
      return a[0] + t * (b[0] - a[0]);
    }
  }
  if (front.length && Math.abs(f2 - front[0][1]) < 1e-12) return front[0][0];
  return null;
}

// Trade-off readings for a design against a sorted front: how much lighter the front is at the same
// deflection and how much stiffer it is at the same mass. Values are obtained by interpolating the front;
// they are readings of the plot, not verified designs.
export function tradeoffReadings(f, frontF) {
  const front = frontF.slice().sort((a, b) => a[0] - b[0]);
  if (front.length === 0) return { lighterBy: null, stifferBy: null };
  const lightest = front[0], stiffest = front[front.length - 1];
  const f2max = Math.max(...front.map(p => p[1])), f2min = Math.min(...front.map(p => p[1]));
  let lighterBy;
  if (f[1] > f2max) {
    lighterBy = { value: f[0] - lightest[0], kind: 'beyond-floppy', frontPoint: lightest, note: 'the lightest front design is already stiffer than this design' };
  } else if (f[1] < f2min) {
    lighterBy = { value: NaN, kind: 'beyond-stiff', frontPoint: stiffest, note: 'no front design is this stiff inside the bounds' };
  } else {
    const m = interpF1(front, f[1]);
    lighterBy = { value: f[0] - m, kind: 'interpolated', frontPoint: [m, f[1]], note: 'front mass interpolated at the same deflection' };
  }
  let stifferBy;
  if (f[0] < lightest[0]) {
    stifferBy = { value: NaN, kind: 'beyond-light', frontPoint: lightest, note: 'no front design is this light inside the bounds' };
  } else if (f[0] > stiffest[0]) {
    stifferBy = { value: f[1] - stiffest[1], kind: 'beyond-heavy', frontPoint: stiffest, note: 'the heaviest front design is already lighter than this design' };
  } else {
    const v = interpF2(front, f[0]);
    stifferBy = { value: f[1] - v, kind: 'interpolated', frontPoint: [f[0], v], note: 'front deflection interpolated at the same mass' };
  }
  return { lighterBy, stifferBy };
}

// Brute-force reference front for 2-variable problems: exact evaluation on an n1 x n2 grid, feasible points
// only, then the exact non-dominated subset. Independent of NSGA-II, used to check the computed front.
// createReferenceSweep is the incremental form (step(rows) evaluates a few grid rows) so a page without a
// worker can run it in chunks; referenceFrontByGrid runs it to completion.
export function createReferenceSweep(problem, n1 = 200, n2 = 200) {
  validateProblem(problem);
  if (problem.n !== 2) throw new Error('reference sweep is available for 2-variable problems only');
  if (!(n1 >= 2 && n2 >= 2)) throw new Error('reference grid needs at least 2 x 2 points');
  const pts = [];
  let evaluations = 0;
  let i = 0;
  function step(rows = 1) {
    for (let r = 0; r < rows && i < n1; r++, i++) {
      const x1 = problem.lower[0] + (problem.upper[0] - problem.lower[0]) * i / (n1 - 1);
      for (let j = 0; j < n2; j++) {
        const x2 = problem.lower[1] + (problem.upper[1] - problem.lower[1]) * j / (n2 - 1);
        const ind = evaluateIndividual(problem, [x1, x2]);
        evaluations++;
        if (ind.feasible) pts.push({ x: ind.x, f: ind.f });
      }
    }
    return i / n1;
  }
  function result() {
    return { points: nonDominatedSubset(pts), evaluations, grid: [n1, n2], feasibleCount: pts.length };
  }
  return { step, result, get done() { return i >= n1; }, get progress() { return i / n1; } };
}

export function referenceFrontByGrid(problem, n1 = 200, n2 = 200) {
  const sweep = createReferenceSweep(problem, n1, n2);
  while (!sweep.done) sweep.step(n1);
  return sweep.result();
}

// Mean normalized distance from the points of frontA to the polyline through refFront (both arrays of
// [f1, f2]); objectives are scaled by the ranges of refFront. Used to report agreement between NSGA-II and
// the reference sweep, and in tests against analytic fronts.
export function frontDistance(frontA, refFront) {
  if (!frontA.length || !refFront.length) return NaN;
  const ref = refFront.slice().sort((a, b) => a[0] - b[0]);
  const r = frontRanges(ref);
  const scale = r.map(([lo, hi]) => (hi > lo ? hi - lo : Math.max(Math.abs(hi), 1e-12)));
  const segDist = (p, a, b) => {
    const ax = a[0] / scale[0], ay = a[1] / scale[1], bx = b[0] / scale[0], by = b[1] / scale[1];
    const px = p[0] / scale[0], py = p[1] / scale[1];
    const vx = bx - ax, vy = by - ay;
    const L2 = vx * vx + vy * vy;
    const t = L2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  };
  let total = 0;
  for (const p of frontA) {
    let best = Infinity;
    if (ref.length === 1) best = segDist(p, ref[0], ref[0]);
    for (let i = 0; i < ref.length - 1; i++) best = Math.min(best, segDist(p, ref[i], ref[i + 1]));
    total += best;
  }
  return total / frontA.length;
}

// Rows for the CSV export of a front (plain values, no formatting).
export function frontTableRows(problem, front) {
  const head = [...problem.names.map((n, i) => `${n} (${problem.units[i]})`), ...problem.objectiveLabels, 'max utilization', 'governing', 'feasible'];
  const rows = [head];
  for (const ind of front) {
    const v = verifyDesign(problem.spec, ind.x);
    rows.push([...ind.x.map(x => Number(x.toPrecision(8))), ...ind.f.map(f => Number(f.toPrecision(8))),
      v.governing ? Number(v.governing.U.toPrecision(6)) : '', v.governing ? `${v.governing.name}${v.governing.kind ? ' (' + v.governing.kind + ')' : ''}` : '', v.feasible ? 'yes' : 'no']);
  }
  return rows;
}
