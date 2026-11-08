// MIE 446 Optimization Lab: constrained Bayesian optimization (BO) for expensive solves.
// Pure ES module, no DOM access. Imports only data from ../shared/presets.js.
//
// Contents
//   1. deterministic pseudo-random numbers (mulberry32, identical to labkit.makeRng)
//   2. dense linear algebra: Cholesky with jitter fallback, triangular solves
//   3. normal distribution: erf, erfc, cdf, pdf (high accuracy, no tables)
//   4. Gaussian process (GP) regression: Matern 5/2 kernel with automatic relevance determination (ARD)
//   5. acquisition: expected improvement (EI), probability of feasibility, constrained EI (Gardner et al. 2014)
//   6. design helpers: Latin hypercube sampling (LHS), Halton candidates, Nelder-Mead polishing
//   7. the optimizer: createOptimizer (stepper) and optimize (run to completion); grid and random search
//   8. demonstration problems with exact solvers: beam section (closed forms), Warren truss (direct stiffness),
//      Gardner-type analytic test problem; reference optima; verification routine
//
// Units: length mm, force N, stress and modulus MPa, density g/cm^3, mass g. mass_g = volume_mm3 * rho / 1000.

import { MATERIALS, sectionProps, BEAM_PRESETS, TRUSS_PRESETS } from '../shared/presets.js';

export const VERSION = '0.1.1';

const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();

// ---------------------------------------------------------------------------------------------------------
// 1. Deterministic pseudo-random numbers
// ---------------------------------------------------------------------------------------------------------

// mulberry32, copied from labkit.js so this module stays self-contained and DOM free. Same seed, same stream.
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

export function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a + (b - a) * i / (n - 1);
  return out;
}

const clampUnit = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------------------------------------
// 2. Dense linear algebra
// ---------------------------------------------------------------------------------------------------------

// One Cholesky attempt on A + jitter * I. Returns the lower factor L or null when a pivot is not positive
// (relative to the diagonal entry by relTol, which lets the truss solver detect mechanisms robustly).
function cholAttempt(A, jitter, relTol) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const ajj = A[j][j] + jitter;
    let s = ajj;
    for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    if (!Number.isFinite(s) || !(s > relTol * Math.abs(ajj)) || !(s > 0)) return null;
    const d = Math.sqrt(s);
    L[j][j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = A[i][j];
      for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
      L[i][j] = t / d;
    }
  }
  return L;
}

// Cholesky factorization A = L L^T with a jitter fallback: if A is numerically not positive definite,
// a small multiple of the identity is added (1e-12 of the largest diagonal, growing tenfold per attempt).
export function cholesky(A) {
  const n = A.length;
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(A[i][i]));
  if (!(scale > 0)) scale = 1;
  let jitter = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const L = cholAttempt(A, jitter, 0);
    if (L) return { L, jitter };
    jitter = jitter === 0 ? 1e-12 * scale : jitter * 10;
  }
  throw new Error('Cholesky factorization failed: the matrix is not positive definite even with jitter');
}

// Solve L y = b (forward substitution).
export function forwardSubstitution(L, b) {
  const n = L.length;
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  return y;
}

// Solve L L^T x = b.
export function choleskySolve(L, b) {
  const n = L.length;
  const y = forwardSubstitution(L, b);
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

export function choleskyLogDet(L) {
  let s = 0;
  for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]);
  return 2 * s;
}

// ---------------------------------------------------------------------------------------------------------
// 3. Normal distribution
// ---------------------------------------------------------------------------------------------------------

// Complementary error function for x >= 2.5 by a continued fraction (modified Lentz algorithm).
function erfcLarge(x) {
  const tiny = 1e-300;
  let f = x, C = x, D = 0;
  for (let k = 1; k < 300; k++) {
    const a = k / 2;
    D = x + a * D; if (Math.abs(D) < tiny) D = tiny; D = 1 / D;
    C = x + a / C; if (Math.abs(C) < tiny) C = tiny;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}

// Error function: positive-term series for |x| < 2.5 (no cancellation), continued fraction beyond.
export function erf(x) {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax > 6) return x > 0 ? 1 : -1;
  if (ax < 2.5) {
    let term = ax, sum = ax;
    for (let k = 1; k < 400; k++) {
      term *= 2 * ax * ax / (2 * k + 1);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    const r = 2 / Math.sqrt(Math.PI) * Math.exp(-ax * ax) * sum;
    return x < 0 ? -r : r;
  }
  const r = 1 - erfcLarge(ax);
  return x < 0 ? -r : r;
}

export function erfc(x) {
  if (x >= 2.5) return erfcLarge(x);
  if (x <= -2.5) return 2 - erfcLarge(-x);
  return 1 - erf(x);
}

export function normCdf(z) { return 0.5 * erfc(-z / Math.SQRT2); }
export function normPdf(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }

// ---------------------------------------------------------------------------------------------------------
// 4. Gaussian process regression
// ---------------------------------------------------------------------------------------------------------

export const DEFAULT_LS_GRID = [0.1, 0.2, 0.4, 0.8, 1.6];   // length scales in normalized (unit box) units
export const DEFAULT_S2_GRID = [0.25, 0.5, 1, 2, 4];        // signal variances in standardized output units

// Matern 5/2 kernel with one length scale per input dimension (ARD) and signal variance s2.
export function matern52(u, v, ls, s2) {
  let r2 = 0;
  for (let d = 0; d < u.length; d++) { const t = (u[d] - v[d]) / ls[d]; r2 += t * t; }
  const q = Math.sqrt(5 * r2);
  return s2 * (1 + q + q * q / 3) * Math.exp(-q);
}

// Output transform used for constraint GPs. Utilizations span orders of magnitude over the design box,
// so the signed logarithm sign(g) log(1 + |g|) keeps the fit honest near g = 0 where feasibility is decided.
// The transform is monotone and fixes 0, so P(T(g) <= 0) is exactly P(g <= 0).
export function forwardTransform(kind, v) { return kind === 'signedLog' ? Math.sign(v) * Math.log1p(Math.abs(v)) : v; }
export function inverseTransform(kind, v) { return kind === 'signedLog' ? Math.sign(v) * Math.expm1(Math.abs(v)) : v; }

function gpFactor(U, z, ls, s2, diag) {
  const m = U.length;
  const K = Array.from({ length: m }, () => new Array(m));
  for (let i = 0; i < m; i++) {
    K[i][i] = s2 + diag;
    for (let j = 0; j < i; j++) { const k = matern52(U[i], U[j], ls, s2); K[i][j] = k; K[j][i] = k; }
  }
  const { L } = cholesky(K);
  const alpha = choleskySolve(L, z);
  let fit = 0;
  for (let i = 0; i < m; i++) fit += z[i] * alpha[i];
  const lml = -0.5 * fit - 0.5 * choleskyLogDet(L) - 0.5 * m * Math.log(2 * Math.PI);
  return { L, alpha, lml };
}

// Fit a GP to inputs U (points in the unit box) and outputs y.
// Constant mean = sample mean, outputs standardized, kernel diagonal gets nugget + noise.
// Hyperparameters (length scale per dimension, signal variance) maximize the log marginal likelihood over a
// small grid: full grid for n <= 2, coordinate-wise search (two sweeps from the grid centre) for n > 2.
// opts: { nugget = 1e-6, noise = 1e-4, transform = 'none' | 'signedLog', lsGrid, s2Grid, hyper: {ls, s2} }
export function fitGP(U, y, opts = {}) {
  const m = U.length;
  if (!m) throw new Error('fitGP: no training points');
  const n = U[0].length;
  const nugget = opts.nugget ?? 1e-6;
  const noise = opts.noise ?? 1e-4;
  const transform = opts.transform || 'none';
  const t = y.map(v => forwardTransform(transform, v));
  if (!t.every(Number.isFinite)) throw new Error('fitGP: a training output is not a finite number');
  let mean = 0;
  for (const v of t) mean += v;
  mean /= m;
  let varSum = 0;
  for (const v of t) varSum += (v - mean) * (v - mean);
  let std = Math.sqrt(varSum / m);
  if (!(std > 1e-12 * Math.max(1, Math.abs(mean)))) std = 1;
  const z = t.map(v => (v - mean) / std);
  const lsGrid = opts.lsGrid || DEFAULT_LS_GRID;
  const s2Grid = opts.s2Grid || DEFAULT_S2_GRID;
  const diag = nugget + noise;
  let best = null;
  const consider = (ls, s2) => {
    let fac;
    try { fac = gpFactor(U, z, ls, s2, diag); } catch (err) { return null; }
    if (!best || fac.lml > best.lml) best = { ls: ls.slice(), s2, L: fac.L, alpha: fac.alpha, lml: fac.lml };
    return fac.lml;
  };
  if (opts.hyper) {
    consider(opts.hyper.ls, opts.hyper.s2);
  } else if (n <= 2) {
    const total = Math.pow(lsGrid.length, n);
    for (let c = 0; c < total; c++) {
      let r = c;
      const ls = new Array(n);
      for (let d = 0; d < n; d++) { ls[d] = lsGrid[r % lsGrid.length]; r = Math.floor(r / lsGrid.length); }
      for (const s2 of s2Grid) consider(ls, s2);
    }
  } else {
    const ls = new Array(n).fill(lsGrid[Math.floor(lsGrid.length / 2)]);
    let s2 = s2Grid[Math.floor(s2Grid.length / 2)];
    consider(ls, s2);
    for (let sweep = 0; sweep < 2; sweep++) {
      for (let d = 0; d < n; d++) {
        let bestV = ls[d], bestL = -Infinity;
        for (const v of lsGrid) {
          const trial = ls.slice(); trial[d] = v;
          const l = consider(trial, s2);
          if (l !== null && l > bestL) { bestL = l; bestV = v; }
        }
        ls[d] = bestV;
      }
      let bestV = s2, bestL = -Infinity;
      for (const v of s2Grid) {
        const l = consider(ls, v);
        if (l !== null && l > bestL) { bestL = l; bestV = v; }
      }
      s2 = bestV;
    }
  }
  if (!best) throw new Error('fitGP: no hyperparameter setting gave a positive definite kernel matrix');
  return {
    n, m, U: U.map(r => r.slice()), yMean: mean, yStd: std, transform, nugget, noise,
    ls: best.ls, s2: best.s2, L: best.L, alpha: best.alpha, lml: best.lml,
  };
}

// Posterior mean and standard deviation of the latent function at a unit-box point u.
// Returned in the (transformed) output units, i.e. de-standardized but not inverse-transformed.
export function gpPredict(model, u) {
  const { U, ls, s2, L, alpha, m } = model;
  const k = new Array(m);
  for (let i = 0; i < m; i++) k[i] = matern52(U[i], u, ls, s2);
  let mu = 0;
  for (let i = 0; i < m; i++) mu += k[i] * alpha[i];
  const v = forwardSubstitution(L, k);
  let vv = 0;
  for (const x of v) vv += x * x;
  let variance = s2 - vv;
  if (!(variance > 0)) variance = 0;
  return { mu: model.yMean + model.yStd * mu, sigma: model.yStd * Math.sqrt(variance) };
}

// ---------------------------------------------------------------------------------------------------------
// 5. Acquisition functions (minimization convention)
// ---------------------------------------------------------------------------------------------------------

// EI(x) = E[max(fBest - f(x), 0)] for f(x) ~ N(mu, sigma^2).
export function expectedImprovement(mu, sigma, fBest) {
  if (!(sigma > 1e-12)) return Math.max(0, fBest - mu);
  const z = (fBest - mu) / sigma;
  return (fBest - mu) * normCdf(z) + sigma * normPdf(z);
}

// P(g(x) <= 0) for g(x) ~ N(mu, sigma^2).
export function probabilityOfFeasibility(mu, sigma) {
  if (!(sigma > 1e-12)) return mu <= 0 ? 1 : 0;
  return normCdf(-mu / sigma);
}

// Constrained EI of Gardner et al. (2014): EI times the product of the per-constraint feasibility probabilities.
// Without a feasible observation (fBest null) the acquisition is the probability of feasibility alone.
export function constrainedEI(muF, sigmaF, fBest, gPreds) {
  let pf = 1;
  for (const p of gPreds) pf *= probabilityOfFeasibility(p.mu, p.sigma);
  if (fBest === null || fBest === undefined || !Number.isFinite(fBest)) return { acq: pf, ei: null, pf };
  const ei = expectedImprovement(muF, sigmaF, fBest);
  return { acq: ei * pf, ei, pf };
}

// ---------------------------------------------------------------------------------------------------------
// 6. Design helpers
// ---------------------------------------------------------------------------------------------------------

// Latin hypercube with m points in n dimensions: each dimension has exactly one point per stratum [i/m, (i+1)/m).
export function latinHypercube(m, n, rng) {
  const pts = Array.from({ length: m }, () => new Array(n));
  for (let d = 0; d < n; d++) {
    const perm = Array.from({ length: m }, (_, i) => i);
    for (let i = m - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    for (let i = 0; i < m; i++) pts[i][d] = Math.min(1 - 1e-12, (perm[i] + rng()) / m);
  }
  return pts;
}

const HALTON_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];

export function haltonValue(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

// count Halton points in the unit n-box, skipping the first `skip` entries, optionally shifted modulo 1
// (Cranley-Patterson rotation) so successive iterations look at different candidate sets.
export function haltonCandidates(count, n, shift = null, skip = 20) {
  if (n > HALTON_PRIMES.length) throw new Error('haltonCandidates supports up to ' + HALTON_PRIMES.length + ' dimensions');
  const pts = new Array(count);
  for (let k = 0; k < count; k++) {
    const p = new Array(n);
    for (let d = 0; d < n; d++) {
      let v = haltonValue(k + skip + 1, HALTON_PRIMES[d]);
      if (shift) { v += shift[d]; v -= Math.floor(v); }
      p[d] = v;
    }
    pts[k] = p;
  }
  return pts;
}

// Nelder-Mead simplex minimization in a box. Trial points are clamped to the box before evaluation.
// opts: { lower, upper (default unit box), step = 0.05, maxIter = 60 n, tolX = 1e-5 }
export function nelderMead(fn, x0, opts = {}) {
  const n = x0.length;
  const lower = opts.lower || new Array(n).fill(0);
  const upper = opts.upper || new Array(n).fill(1);
  const maxIter = opts.maxIter || 60 * n;
  const step = opts.step || 0.05;
  const tolX = opts.tolX ?? 1e-5;
  const clamp = x => x.map((v, i) => Math.min(upper[i], Math.max(lower[i], v)));
  const f = x => fn(clamp(x));
  let simplex = [clamp(x0)];
  for (let i = 0; i < n; i++) {
    const p = simplex[0].slice();
    const h = step * (upper[i] - lower[i]);
    p[i] += (p[i] + h <= upper[i]) ? h : -h;
    simplex.push(clamp(p));
  }
  let values = simplex.map(f);
  let evals = n + 1;
  for (let it = 0; it < maxIter; it++) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map(i => simplex[i]);
    values = order.map(i => values[i]);
    let size = 0;
    for (let i = 1; i <= n; i++) for (let d = 0; d < n; d++) size = Math.max(size, Math.abs(simplex[i][d] - simplex[0][d]) / (upper[d] - lower[d]));
    if (size < tolX) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let d = 0; d < n; d++) c[d] += simplex[i][d] / n;
    const worst = simplex[n];
    const xr = clamp(c.map((v, d) => v + (v - worst[d])));
    const fr = f(xr); evals++;
    if (fr < values[0]) {
      const xe = clamp(c.map((v, d) => v + 2 * (v - worst[d])));
      const fe = f(xe); evals++;
      if (fe < fr) { simplex[n] = xe; values[n] = fe; } else { simplex[n] = xr; values[n] = fr; }
    } else if (fr < values[n - 1]) {
      simplex[n] = xr; values[n] = fr;
    } else {
      const outside = fr < values[n];
      const xc = clamp(outside ? c.map((v, d) => v + 0.5 * (v - worst[d])) : c.map((v, d) => v - 0.5 * (v - worst[d])));
      const fc = f(xc); evals++;
      if (fc < (outside ? fr : values[n])) { simplex[n] = xc; values[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = clamp(simplex[i].map((v, d) => simplex[0][d] + 0.5 * (v - simplex[0][d])));
          values[i] = f(simplex[i]); evals++;
        }
      }
    }
  }
  let bi = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[bi]) bi = i;
  return { x: simplex[bi], f: values[bi], evaluations: evals };
}

// ---------------------------------------------------------------------------------------------------------
// 7. The optimizer
// ---------------------------------------------------------------------------------------------------------

const fmtNum = v => (Number.isFinite(v) ? Number(v.toPrecision(6)) : v);

// Evaluate the exact solver at x and wrap the outcome in a history record.
function makeRecord(problem, x, k, meta = {}) {
  const t0 = now();
  const out = problem.evaluate(x);
  const solveMs = now() - t0;
  if (!out || typeof out !== 'object' || !Number.isFinite(out.f)) {
    throw new Error(`evaluate returned a non-finite objective at x = [${x.map(fmtNum).join(', ')}]`);
  }
  const g = Array.isArray(out.g) ? out.g.map(v => (Number.isFinite(v) ? v : 1e3)) : [];
  const feasible = g.every(v => v <= 0);
  return {
    k, phase: meta.phase || 'search', x: x.slice(), u: meta.u ? meta.u.slice() : null,
    f: out.f, g, feasible, maxG: g.length ? Math.max(...g) : 0,
    acq: meta.acq ?? null, pred: meta.pred ?? null, info: out.info ?? null, solveMs,
    bestF: null, bestK: null,
  };
}

function checkProblem(problem) {
  if (!problem || typeof problem !== 'object') throw new Error('optimize: problem object missing');
  const n = problem.n;
  if (!Number.isInteger(n) || n < 1 || n > HALTON_PRIMES.length) throw new Error('optimize: n must be an integer between 1 and ' + HALTON_PRIMES.length);
  if (!Array.isArray(problem.lower) || !Array.isArray(problem.upper) || problem.lower.length !== n || problem.upper.length !== n) {
    throw new Error('optimize: lower and upper must be arrays of length n');
  }
  for (let d = 0; d < n; d++) {
    if (!Number.isFinite(problem.lower[d]) || !Number.isFinite(problem.upper[d]) || !(problem.upper[d] > problem.lower[d])) {
      throw new Error(`optimize: bounds of variable ${d + 1} must satisfy lower < upper`);
    }
  }
  if (typeof problem.evaluate !== 'function') throw new Error('optimize: problem.evaluate must be a function');
}

// Create a stepper that performs one exact evaluation per step(). The worker and the page drive it, the
// synchronous optimize() below just runs it to completion.
// problem: { n, lower, upper, evaluate(x) -> { f, g: [] }, budget, seed }
// options: { budget, seed, initialPoints = 2n + 2, candidates = 400, nugget, noise, constraintTransform = 'signedLog' }
export function createOptimizer(problem, options = {}) {
  checkProblem(problem);
  const n = problem.n;
  const lower = problem.lower.slice(), upper = problem.upper.slice();
  const budget = Math.max(1, Math.floor(options.budget ?? problem.budget ?? 30));
  const seed = Math.floor(options.seed ?? problem.seed ?? 1);
  const rng = makeRng(seed);
  const nInit = Math.min(budget, Math.max(1, Math.floor(options.initialPoints ?? (2 * n + 2))));
  const nCand = options.candidates ?? 400;
  const gpOpts = { nugget: options.nugget ?? 1e-6, noise: options.noise ?? 1e-4 };
  const gTransform = options.constraintTransform ?? 'signedLog';
  const initial = latinHypercube(nInit, n, rng);
  const history = [];
  let bestIdx = -1;
  let models = null;
  let fitCount = 0;
  const toPhys = u => u.map((v, d) => lower[d] + v * (upper[d] - lower[d]));

  function record(u, meta) {
    const rec = makeRecord(problem, toPhys(u), history.length + 1, Object.assign({ u }, meta));
    if (rec.feasible && (bestIdx < 0 || rec.f < history[bestIdx].f)) bestIdx = history.length;
    history.push(rec);
    rec.bestK = bestIdx >= 0 ? bestIdx + 1 : null;
    rec.bestF = bestIdx >= 0 ? history[bestIdx].f : null;
    return rec;
  }

  function fitModels() {
    const U = history.map(r => r.u);
    const fModel = fitGP(U, history.map(r => r.f), Object.assign({ transform: 'none' }, gpOpts));
    const nG = history[0].g.length;
    const gModels = [];
    for (let j = 0; j < nG; j++) gModels.push(fitGP(U, history.map(r => r.g[j]), Object.assign({ transform: gTransform }, gpOpts)));
    models = { f: fModel, g: gModels, fitted: history.length };
    fitCount++;
  }

  function acquisition(u, fBest) {
    const pf = gpPredict(models.f, u);
    const gp = models.g.map(mdl => gpPredict(mdl, u));
    const a = constrainedEI(pf.mu, pf.sigma, fBest, gp);
    return { acq: a.acq, ei: a.ei, pf: a.pf, mu: pf.mu, sigma: pf.sigma };
  }

  function chooseNext() {
    fitModels();
    const fBest = bestIdx >= 0 ? history[bestIdx].f : null;
    const shift = new Array(n);
    for (let d = 0; d < n; d++) shift[d] = rng();
    const cands = haltonCandidates(nCand, n, shift);
    const scored = cands.map(u => ({ u, a: acquisition(u, fBest) }));
    scored.sort((p, q) => q.a.acq - p.a.acq);
    let pick = null;
    for (const s of scored.slice(0, 3)) {
      const res = nelderMead(u => -acquisition(u, fBest).acq, s.u, { step: 0.05, maxIter: 60 * n });
      const a = acquisition(res.x, fBest);
      if (!pick || a.acq > pick.a.acq) pick = { u: res.x.map(clampUnit), a, explore: false };
    }
    const isDuplicate = u => history.some(r => r.u.every((v, d) => Math.abs(v - u[d]) < 1e-6));
    if (!pick || !(pick.a.acq > 0) || isDuplicate(pick.u)) {
      // Fallback: pure exploration at the candidate where the objective surrogate is least certain.
      let alt = null;
      for (const s of scored) {
        if (isDuplicate(s.u)) continue;
        if (!alt || s.a.sigma > alt.a.sigma) alt = s;
      }
      if (alt) pick = { u: alt.u.slice(), a: alt.a, explore: true };
    }
    return pick;
  }

  const stepper = {
    n, budget, seed, nInit,
    get done() { return history.length >= budget; },
    get history() { return history; },
    get best() { return bestIdx >= 0 ? history[bestIdx] : null; },
    step() {
      if (history.length >= budget) return null;
      if (history.length < nInit) return record(initial[history.length], { phase: 'initial design' });
      const pick = chooseNext();
      const phase = bestIdx < 0 ? 'feasibility search' : (pick.explore ? 'exploration fallback' : 'constrained EI');
      return record(pick.u, { phase, acq: pick.a.acq, pred: { mu: pick.a.mu, sigma: pick.a.sigma, pf: pick.a.pf, ei: pick.a.ei } });
    },
    result() {
      if (history.length && (!models || models.fitted !== history.length)) fitModels();
      return {
        method: 'bo', n, budget, seed, evaluations: history.length, nInit,
        lower: lower.slice(), upper: upper.slice(), names: problem.names || null,
        history, best: bestIdx >= 0 ? history[bestIdx] : null, models,
        settings: { candidates: nCand, initialPoints: nInit, nugget: gpOpts.nugget, noise: gpOpts.noise, constraintTransform: gTransform, fits: fitCount },
      };
    },
  };
  return stepper;
}

// Adapter entry point. problem = { n, lower, upper, evaluate(x) -> { f, g: [] }, budget, seed };
// onProgress(progress) is called after every exact evaluation with { k, total, record, best }.
export function optimize(problem, onProgress, options = {}) {
  const st = createOptimizer(problem, options);
  const t0 = now();
  while (!st.done) {
    const rec = st.step();
    if (typeof onProgress === 'function') onProgress({ k: rec.k, total: st.budget, record: rec, best: st.best, elapsedMs: now() - t0 });
  }
  const res = st.result();
  res.elapsedMs = now() - t0;
  return res;
}

// GP predictions at a physical point x using the final models of a BO result.
export function predictAt(result, x) {
  const u = x.map((v, d) => (v - result.lower[d]) / (result.upper[d] - result.lower[d]));
  const f = gpPredict(result.models.f, u);
  let pFeasible = 1;
  const g = result.models.g.map(mdl => {
    const p = gpPredict(mdl, u);
    const pf = probabilityOfFeasibility(p.mu, p.sigma);
    pFeasible *= pf;
    return { muT: p.mu, sigmaT: p.sigma, mu: inverseTransform(mdl.transform, p.mu), pf };
  });
  return { f, g, pFeasible, u };
}

// GP mean, standard deviation and feasibility probability on an nx by ny grid over variables dims = [i, j]
// with the other variables held at base[]. Z[j][i] layout as required by labkit.heatmap.
export function predictGrid(result, dims, base, nx = 50, ny = 50) {
  const [di, dj] = dims;
  const xs = linspace(result.lower[di], result.upper[di], nx);
  const ys = linspace(result.lower[dj], result.upper[dj], ny);
  const mean = [], sd = [], pf = [];
  for (let j = 0; j < ny; j++) {
    const rm = new Array(nx), rs = new Array(nx), rp = new Array(nx);
    for (let i = 0; i < nx; i++) {
      const x = base.slice(); x[di] = xs[i]; x[dj] = ys[j];
      const p = predictAt(result, x);
      rm[i] = p.f.mu; rs[i] = p.f.sigma; rp[i] = p.pFeasible;
    }
    mean.push(rm); sd.push(rs); pf.push(rp);
  }
  return { xs, ys, mean, sd, pf };
}

// Exact solver on the same kind of grid (teaching overlay; only affordable because the demo solvers are cheap).
export function evaluateGrid(problem, dims, base, nx = 50, ny = 50) {
  const [di, dj] = dims;
  const xs = linspace(problem.lower[di], problem.upper[di], nx);
  const ys = linspace(problem.lower[dj], problem.upper[dj], ny);
  const f = [], feasible = [], maxG = [];
  for (let j = 0; j < ny; j++) {
    const rf = new Array(nx), rfe = new Array(nx), rg = new Array(nx);
    for (let i = 0; i < nx; i++) {
      const x = base.slice(); x[di] = xs[i]; x[dj] = ys[j];
      const out = problem.evaluate(x);
      const g = out.g.map(v => (Number.isFinite(v) ? v : 1e3));
      rf[i] = out.f; rg[i] = Math.max(...g); rfe[i] = rg[i] <= 0;
    }
    f.push(rf); feasible.push(rfe); maxG.push(rg);
  }
  return { xs, ys, f, feasible, maxG };
}

// ---- same budget cap comparison methods ----

// Side length k of the k^n grid with at most `budget` points (floor(budget^(1/n)) computed robustly).
export function gridSide(budget, n) {
  let k = Math.max(1, Math.floor(Math.pow(budget, 1 / n) + 1e-9));
  while (Math.pow(k + 1, n) <= budget) k++;
  while (k > 1 && Math.pow(k, n) > budget) k--;
  return k;
}

export function gridPoints(problem, budget) {
  const n = problem.n;
  const k = gridSide(budget, n);
  const axes = problem.lower.map((lo, d) => linspace(lo, problem.upper[d], k));
  const pts = [];
  const total = Math.pow(k, n);
  for (let c = 0; c < total; c++) {
    let r = c;
    const x = new Array(n);
    for (let d = 0; d < n; d++) { x[d] = axes[d][r % k]; r = Math.floor(r / k); }
    pts.push(x);
  }
  return pts;
}

export function randomPoints(problem, budget, seed = 1) {
  const rng = makeRng(seed);
  const pts = [];
  for (let k = 0; k < budget; k++) pts.push(problem.lower.map((lo, d) => lo + rng() * (problem.upper[d] - lo)));
  return pts;
}

// Stepper over a fixed list of designs (grid or random search), same record format as the BO stepper.
export function createSearch(problem, points, method = 'search') {
  checkProblem(problem);
  const history = [];
  let bestIdx = -1;
  return {
    method, total: points.length,
    get done() { return history.length >= points.length; },
    get history() { return history; },
    get best() { return bestIdx >= 0 ? history[bestIdx] : null; },
    step() {
      if (history.length >= points.length) return null;
      const rec = makeRecord(problem, points[history.length], history.length + 1, { phase: method });
      if (rec.feasible && (bestIdx < 0 || rec.f < history[bestIdx].f)) bestIdx = history.length;
      history.push(rec);
      rec.bestK = bestIdx >= 0 ? bestIdx + 1 : null;
      rec.bestF = bestIdx >= 0 ? history[bestIdx].f : null;
      return rec;
    },
    result() { return { method, evaluations: history.length, history, best: bestIdx >= 0 ? history[bestIdx] : null }; },
  };
}

export function gridSearch(problem, budget) {
  const st = createSearch(problem, gridPoints(problem, budget), 'grid');
  while (!st.done) st.step();
  return Object.assign(st.result(), { side: gridSide(budget, problem.n) });
}

export function randomSearch(problem, budget, seed = 1) {
  const st = createSearch(problem, randomPoints(problem, budget, seed), 'random');
  while (!st.done) st.step();
  return Object.assign(st.result(), { seed });
}

// ---------------------------------------------------------------------------------------------------------
// 8. Demonstration problems with exact solvers
// ---------------------------------------------------------------------------------------------------------

// ---- 8a. Beam section problem (closed forms) ----

export const BEAM_VARIABLES = {
  rect: { names: ['b', 'h'], labels: ['Width b', 'Depth h'], units: ['mm', 'mm'], lower: [4, 4], upper: [40, 80] },
  tube: { names: ['D', 't'], labels: ['Outer diameter D', 'Wall thickness t'], units: ['mm', 'mm'], lower: [6, 0.8], upper: [60, 6] },
};

export const SUPPORT_LABELS = { cantilever: 'Cantilever, clamped at x = 0', simply: 'Simply supported' };
export const LOAD_LABELS = { point: 'Point load P (tip of a cantilever, midspan of a simply supported beam)', udl: 'Uniformly distributed load w over the whole span' };

export function beamConfigFromPreset(key = 'printed-spar') {
  const p = BEAM_PRESETS[key];
  if (!p) throw new Error(`unknown beam preset "${key}"`);
  const load = p.loads[0];
  const cfg = {
    kind: 'beam', preset: key, L: p.L, support: p.support, loadType: load.type,
    P: load.type === 'point' ? load.P : 20, w: load.type === 'udl' ? load.w : 1,
    material: p.material, FS: p.FS, deflectionLimitRatio: p.deflectionLimitRatio, tMin: 1.2,
    sectionType: p.section.type === 'tube' ? 'tube' : 'rect',
  };
  if (p.section.type === 'rect') cfg.student = [p.section.b, p.section.h];
  else if (p.section.type === 'tube') cfg.student = [p.section.D, p.section.t];
  else cfg.student = [12, 24];
  return cfg;
}

export function validateBeamConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') return ['beam configuration missing'];
  const pos = (v, name) => { if (!Number.isFinite(v) || v <= 0) errors.push(`${name} must be a positive number`); };
  pos(cfg.L, 'Span L');
  pos(cfg.FS, 'Factor of safety FS');
  pos(cfg.deflectionLimitRatio, 'Deflection limit ratio k');
  if (!Number.isFinite(cfg.tMin) || cfg.tMin < 0) errors.push('Minimum thickness t_min must be zero or a positive number');
  if (cfg.loadType === 'point') pos(cfg.P, 'Point load P');
  else if (cfg.loadType === 'udl') pos(cfg.w, 'Load intensity w');
  else errors.push('Unknown load type (point or udl)');
  if (!['cantilever', 'simply'].includes(cfg.support)) errors.push('Unknown support type (cantilever or simply)');
  if (!MATERIALS[cfg.material]) errors.push('Unknown material');
  if (!BEAM_VARIABLES[cfg.sectionType]) errors.push('Unknown section type (rect or tube)');
  return errors;
}

// Maximum bending moment and the deflection coefficient such that v_max = vCoef / (E I).
export function beamLoadEffects(cfg) {
  const L = cfg.L;
  if (cfg.support === 'cantilever' && cfg.loadType === 'point') return { M: cfg.P * L, vCoef: cfg.P * L ** 3 / 3, formulaM: 'M = P L', formulaV: 'v = P L^3 / (3 E I)' };
  if (cfg.support === 'cantilever' && cfg.loadType === 'udl') return { M: cfg.w * L * L / 2, vCoef: cfg.w * L ** 4 / 8, formulaM: 'M = w L^2 / 2', formulaV: 'v = w L^4 / (8 E I)' };
  if (cfg.support === 'simply' && cfg.loadType === 'point') return { M: cfg.P * L / 4, vCoef: cfg.P * L ** 3 / 48, formulaM: 'M = P L / 4', formulaV: 'v = P L^3 / (48 E I)' };
  return { M: cfg.w * L * L / 8, vCoef: 5 * cfg.w * L ** 4 / 384, formulaM: 'M = w L^2 / 8', formulaV: 'v = 5 w L^4 / (384 E I)' };
}

// Section properties for the design x. For tubes, a wall at or beyond the radius (2 t >= D) is treated as the
// solid bar limit, so the geometric requirement D > 2 t acts as a bound on t rather than as a constraint.
export function beamSection(cfg, x) {
  if (cfg.sectionType === 'rect') {
    const [b, h] = x;
    return Object.assign(sectionProps('rect', { b, h }), { solid: false, b, h });
  }
  const [D, t] = x;
  if (2 * t >= D) return { A: Math.PI * D * D / 4, I: Math.PI * D ** 4 / 64, c: D / 2, tmin: D / 2, h: D, solid: true, D, t: D / 2 };
  return Object.assign(sectionProps('tube', { D, t }), { solid: false, D, t });
}

// Exact beam solve. Returns mass, utilizations, constraint values g (<= 0 feasible) and the governing constraint.
export function solveBeam(cfg, x) {
  const errors = validateBeamConfig(cfg);
  if (errors.length) throw new Error(errors.join('; '));
  if (!Array.isArray(x) || x.length !== 2 || !x.every(v => Number.isFinite(v) && v > 0)) {
    throw new Error('beam design variables must be two positive numbers');
  }
  const mat = MATERIALS[cfg.material];
  const { M, vCoef } = beamLoadEffects(cfg);
  const sec = beamSection(cfg, x);
  const sigma = M * sec.c / sec.I;
  const v = vCoef / (mat.E * sec.I);
  const vLim = cfg.L / cfg.deflectionLimitRatio;
  const Us = Math.abs(sigma) * cfg.FS / mat.sigmaAllow;
  const Ud = Math.abs(v) / vLim;
  const Ut = cfg.tMin > 0 ? cfg.tMin / sec.tmin : 0;
  const mass = sec.A * cfg.L * mat.rho / 1000;
  const constraints = [
    { key: 'stress', label: 'Bending stress', U: Us, value: Math.abs(sigma), limit: mat.sigmaAllow / cfg.FS, unit: 'MPa', rule: 'U = sigma_max FS / sigma_allow' },
    { key: 'deflection', label: cfg.support === 'cantilever' ? 'Tip deflection' : 'Midspan deflection', U: Ud, value: Math.abs(v), limit: vLim, unit: 'mm', rule: 'U = v_max / (L / k)' },
    { key: 'thickness', label: 'Minimum feature thickness', U: Ut, value: sec.tmin, limit: cfg.tMin, unit: 'mm', rule: 'U = t_min / t_section (section thickness must be at least t_min)' },
  ];
  const g = constraints.map(c => c.U - 1);
  const feasible = g.every(val => val <= 1e-9);
  let gi = 0;
  for (let j = 1; j < constraints.length; j++) if (constraints[j].U > constraints[gi].U) gi = j;
  return {
    f: mass, g, info: { governing: constraints[gi].key },
    mass, feasible, constraints, governing: constraints[gi].key, governingLabel: constraints[gi].label,
    section: sec, sigma, v, M, vLim, material: mat, mechanism: false,
  };
}

export function makeBeamProblem(cfg) {
  const errors = validateBeamConfig(cfg);
  if (errors.length) throw new Error(errors.join('; '));
  const vars = BEAM_VARIABLES[cfg.sectionType];
  const solve = x => solveBeam(cfg, x);
  return {
    id: 'beam', kind: 'beam', cfg, n: 2,
    names: vars.names.slice(), labels: vars.labels.slice(), units: vars.units.slice(),
    lower: vars.lower.slice(), upper: vars.upper.slice(),
    budget: cfg.budget ?? 30, seed: cfg.seed ?? 1,
    objectiveLabel: 'mass', objectiveUnit: 'g',
    constraintNames: ['stress', 'deflection', 'thickness'],
    constraintLabels: ['U_stress - 1', 'U_defl - 1', 't_min / t_section - 1'],
    student: Array.isArray(cfg.student) ? cfg.student.slice() : null,
    solve,
    evaluate: x => { const r = solve(x); return { f: r.f, g: r.g, info: r.info }; },
  };
}

// Reference optimum of the beam problem: every constraint and the mass are monotone in the second variable
// (b for a rectangle, t for a tube) at fixed first variable (h or D) once the role of the variables is set,
// so a fine 1-D scan over the free variable with bisection on the other gives the constrained optimum to
// scan resolution. Uses only the exact solver. Returns null if no feasible design exists in the box.
export function beamReferenceOptimum(cfg, opts = {}) {
  const problem = makeBeamProblem(cfg);
  const scanIdx = cfg.sectionType === 'rect' ? 1 : 0;   // scan h for rect, D for tube
  const monoIdx = 1 - scanIdx;                           // bisection on b for rect, t for tube
  const nScan = opts.nScan || 1201;
  const tol = 1e-12;
  const feasibleAt = (xs, xm) => {
    const x = [0, 0]; x[scanIdx] = xs; x[monoIdx] = xm;
    const r = problem.solve(x);
    return { ok: r.g.every(v => v <= tol), r, x };
  };
  const bestAlong = (xs) => {
    const lo0 = problem.lower[monoIdx], hi0 = problem.upper[monoIdx];
    const atHi = feasibleAt(xs, hi0);
    if (!atHi.ok) return null;
    const atLo = feasibleAt(xs, lo0);
    if (atLo.ok) return atLo;
    let lo = lo0, hi = hi0;
    for (let it = 0; it < 60; it++) {
      const mid = 0.5 * (lo + hi);
      if (feasibleAt(xs, mid).ok) hi = mid; else lo = mid;
    }
    return feasibleAt(xs, hi);
  };
  let best = null;
  const grid = linspace(problem.lower[scanIdx], problem.upper[scanIdx], nScan);
  for (const xs of grid) {
    const c = bestAlong(xs);
    if (c && (!best || c.r.mass < best.r.mass)) best = c;
  }
  if (!best) return null;
  // local refinement around the best scan value
  const step = (problem.upper[scanIdx] - problem.lower[scanIdx]) / (nScan - 1);
  const lo = Math.max(problem.lower[scanIdx], best.x[scanIdx] - step);
  const hi = Math.min(problem.upper[scanIdx], best.x[scanIdx] + step);
  for (const xs of linspace(lo, hi, 201)) {
    const c = bestAlong(xs);
    if (c && c.r.mass < best.r.mass) best = c;
  }
  return {
    x: best.x, mass: best.r.mass, solve: best.r, governing: best.r.governing,
    method: `1-D scan over ${problem.names[scanIdx]} (${nScan} values, refined) with bisection on ${problem.names[monoIdx]}, exact solver only`,
  };
}

// Classical closed form for the rectangular section. Mass = rho L b h with b h^2 >= cS (stress) and
// b h^3 >= cD (deflection). Trading width for depth at fixed b h^2 always lowers the mass, so the optimum has
// either b at its lower bound (then h is the smallest depth satisfying every constraint) or h at its upper
// bound (then b is the smallest width). Returns null for tubes, where no such simple form exists.
export function beamClosedFormOptimum(cfg) {
  if (!cfg || cfg.sectionType !== 'rect') return null;
  const problem = makeBeamProblem(cfg);
  const mat = MATERIALS[cfg.material];
  const { M, vCoef } = beamLoadEffects(cfg);
  const [bLo, hLo] = problem.lower, [bHi, hHi] = problem.upper;
  const bMin = Math.max(bLo, cfg.tMin);
  const cS = 6 * M * cfg.FS / mat.sigmaAllow;                               // b h^2 >= cS
  const cD = 12 * vCoef * cfg.deflectionLimitRatio / (mat.E * cfg.L);       // b h^3 >= cD
  const hNeeded = Math.max(hLo, cfg.tMin, Math.sqrt(cS / bMin), Math.cbrt(cD / bMin));
  let x, active;
  if (hNeeded <= hHi) {
    x = [bMin, hNeeded];
    active = hNeeded === Math.sqrt(cS / bMin) ? 'stress' : hNeeded === Math.cbrt(cD / bMin) ? 'deflection' : 'bounds';
  } else {
    const bNeeded = Math.max(bMin, cS / (hHi * hHi), cD / (hHi * hHi * hHi));
    if (bNeeded > bHi) return { feasible: false, reason: 'no feasible rectangular section inside the bounds' };
    x = [bNeeded, hHi];
    active = bNeeded === cS / (hHi * hHi) ? 'stress' : bNeeded === cD / (hHi * hHi * hHi) ? 'deflection' : 'bounds';
  }
  const ver = verifyDesign(problem, x);
  return {
    feasible: ver.feasible, x, mass: ver.mass, active, cS, cD, governing: ver.governing,
    formula: x[0] === bMin
      ? `b = b_min = ${fmtNum(bMin)} mm, h = max( sqrt(6 M FS / (sigma_allow b)), cbrt(12 vCoef k / (E L b)) ) = ${fmtNum(x[1])} mm`
      : `h = h_max = ${fmtNum(hHi)} mm, b = max( 6 M FS / (sigma_allow h^2), 12 vCoef k / (E L h^3) ) = ${fmtNum(x[0])} mm`,
  };
}

// ---- 8b. Warren truss problem (2-D direct stiffness) ----

export const TRUSS_VARIABLES = {
  names: ['A_chord', 'A_diag', 'h'], labels: ['Chord area A_chord', 'Diagonal area A_diag', 'Truss height h'],
  units: ['mm^2', 'mm^2', 'mm'], lower: [50, 50, 300], upper: [1500, 1500, 2500],
};

export function trussConfigDefault() {
  return { kind: 'truss', preset: 'warren', loadCase: 'uniform', FS: 1.5, deflectionLimitRatio: 250, K: 1, student: [300, 300, 1000] };
}

export function validateTrussConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') return ['truss configuration missing'];
  const preset = TRUSS_PRESETS[cfg.preset || 'warren'];
  if (!preset) errors.push('Unknown truss preset');
  else if (cfg.loadCase && !preset.loadCases[cfg.loadCase]) errors.push(`Unknown load case "${cfg.loadCase}"`);
  if (!Number.isFinite(cfg.FS) || cfg.FS <= 0) errors.push('Factor of safety FS must be a positive number');
  if (!Number.isFinite(cfg.deflectionLimitRatio) || cfg.deflectionLimitRatio <= 0) errors.push('Deflection limit ratio must be a positive number');
  if (cfg.K !== undefined && (!Number.isFinite(cfg.K) || cfg.K <= 0)) errors.push('Effective length factor K must be a positive number');
  return errors;
}

// Build the truss model for design x = [A_chord, A_diag, h]: all top-chord nodes move to y = h.
export function buildTrussModel(cfg, x) {
  const preset = TRUSS_PRESETS[cfg.preset || 'warren'];
  const [Ac, Ad, h] = x;
  const nodes = preset.nodes.map(([px, py]) => [px, py > 0 ? h : py]);
  const areaByGroup = { chord: Ac, diag: Ad };
  const members = preset.members.map(([a, b, gk]) => {
    const grp = preset.groups[gk];
    const mat = MATERIALS[grp.material];
    return { a, b, group: gk, A: areaByGroup[gk] ?? grp.A0, E: mat.E, rho: mat.rho, sigmaAllow: mat.sigmaAllow, buckling: grp.buckling, tensionOnly: !!grp.tensionOnly };
  });
  const loads = (cfg.loadCase && preset.loadCases[cfg.loadCase]) || preset.loads;
  const span = Math.max(...nodes.map(nd => nd[0]));
  let midNode = 0, bestDist = Infinity;
  nodes.forEach((nd, i) => { if (nd[1] === 0) { const dist = Math.abs(nd[0] - span / 2); if (dist < bestDist) { bestDist = dist; midNode = i; } } });
  return { nodes, members, supports: preset.supports, loads, span, midNode };
}

// Plain 2-D linear elastic direct stiffness solve. Returns displacements, member forces (tension positive),
// member lengths and reactions, or { mechanism: true } when the reduced stiffness matrix is singular.
export function solveTrussModel(model) {
  const { nodes, members, supports, loads } = model;
  const nn = nodes.length, ndof = 2 * nn;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const geom = members.map(mb => {
    const dx = nodes[mb.b][0] - nodes[mb.a][0], dy = nodes[mb.b][1] - nodes[mb.a][1];
    const L = Math.hypot(dx, dy);
    return { L, c: dx / L, s: dy / L };
  });
  members.forEach((mb, i) => {
    const { L, c, s } = geom[i];
    if (!(L > 0) || !(mb.A > 0) || !(mb.E > 0)) return;
    const k = mb.E * mb.A / L;
    const dofs = [2 * mb.a, 2 * mb.a + 1, 2 * mb.b, 2 * mb.b + 1];
    const T = [-c, -s, c, s];
    for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) K[dofs[p]][dofs[q]] += k * T[p] * T[q];
  });
  const fixed = new Array(ndof).fill(false);
  for (const [ni, flags] of Object.entries(supports)) {
    const i = Number(ni);
    if (flags[0]) fixed[2 * i] = true;
    if (flags[1]) fixed[2 * i + 1] = true;
  }
  const F = new Array(ndof).fill(0);
  for (const [ni, fv] of Object.entries(loads)) { const i = Number(ni); F[2 * i] += fv[0]; F[2 * i + 1] += fv[1]; }
  const free = [];
  for (let i = 0; i < ndof; i++) if (!fixed[i]) free.push(i);
  const Kr = free.map(i => free.map(j => K[i][j]));
  const Fr = free.map(i => F[i]);
  const L = cholAttempt(Kr, 0, 1e-10);
  if (!L) return { mechanism: true, message: 'unstable structure: singular stiffness matrix (mechanism or disconnected node)', lengths: geom.map(gm => gm.L) };
  const ur = choleskySolve(L, Fr);
  const u = new Array(ndof).fill(0);
  free.forEach((i, k) => { u[i] = ur[k]; });
  const N = members.map((mb, i) => {
    const { L: len, c, s } = geom[i];
    const du = (u[2 * mb.b] - u[2 * mb.a]) * c + (u[2 * mb.b + 1] - u[2 * mb.a + 1]) * s;
    return mb.E * mb.A / len * du;
  });
  const reactions = {};
  for (let i = 0; i < ndof; i++) {
    if (!fixed[i]) continue;
    let r = -F[i];
    for (let j = 0; j < ndof; j++) r += K[i][j] * u[j];
    reactions[i] = r;
  }
  return { mechanism: false, u, N, lengths: geom.map(gm => gm.L), reactions };
}

function memberChecks(model, sol, cfg) {
  const Kf = cfg.K ?? 1;
  return model.members.map((mb, i) => {
    const L = sol.lengths[i];
    const N = sol.mechanism ? NaN : sol.N[i];
    const Ustress = Math.abs(N) * cfg.FS / (mb.A * mb.sigmaAllow);
    let Ubuck = 0, Pcr = null;
    if (!sol.mechanism && N < 0 && mb.buckling === 'square') {
      const I = mb.A * mb.A / 12;
      Pcr = Math.PI * Math.PI * mb.E * I / Math.pow(Kf * L, 2);
      Ubuck = Math.abs(N) * cfg.FS / Pcr;
    }
    return { index: i, a: mb.a, b: mb.b, group: mb.group, A: mb.A, L, N, stress: N / mb.A, Ustress, Ubuck, Pcr, slack: mb.tensionOnly && N < 0 };
  });
}

// Exact truss solve for design x = [A_chord, A_diag, h]. Mechanisms are reported as a large constraint violation.
export function solveTruss(cfg, x) {
  const errors = validateTrussConfig(cfg);
  if (errors.length) throw new Error(errors.join('; '));
  if (!Array.isArray(x) || x.length !== 3 || !x.every(v => Number.isFinite(v) && v > 0)) {
    throw new Error('truss design variables must be three positive numbers: A_chord, A_diag, h');
  }
  const model = buildTrussModel(cfg, x);
  const sol = solveTrussModel(model);
  let mass = 0;
  model.members.forEach((mb, i) => { mass += mb.A * sol.lengths[i] * mb.rho / 1000; });
  const vLim = model.span / cfg.deflectionLimitRatio;
  const members = memberChecks(model, sol, cfg);
  if (sol.mechanism) {
    const big = 1e3;
    const constraints = [
      { key: 'stress', label: 'Member stress', U: Infinity, value: NaN, limit: NaN, unit: 'MPa', rule: 'U = |N| FS / (A sigma_allow)' },
      { key: 'buckling', label: 'Euler buckling screen', U: Infinity, value: NaN, limit: NaN, unit: 'N', rule: 'U = |N| FS / P_cr' },
      { key: 'deflection', label: 'Midspan deflection', U: Infinity, value: NaN, limit: vLim, unit: 'mm', rule: 'U = |v_mid| / (span / ratio)' },
    ];
    return { f: mass, g: [big, big, big], info: { governing: 'mechanism' }, mass, feasible: false, mechanism: true, message: sol.message, constraints, governing: 'mechanism', governingLabel: 'unstable structure', members, model, vMid: NaN, vLim };
  }
  let si = 0, bi = -1;
  members.forEach((m, i) => { if (m.Ustress > members[si].Ustress) si = i; if (m.Ubuck > 0 && (bi < 0 || m.Ubuck > members[bi].Ubuck)) bi = i; });
  const Us = members[si].Ustress;
  const Ub = bi >= 0 ? members[bi].Ubuck : 0;
  const vMid = -sol.u[2 * model.midNode + 1];
  const Ud = Math.abs(vMid) / vLim;
  const mname = m => `${m.group} ${m.a}-${m.b}`;
  const constraints = [
    { key: 'stress', label: 'Member stress', U: Us, value: Math.abs(members[si].stress), limit: members[si] ? model.members[si].sigmaAllow / cfg.FS : NaN, unit: 'MPa', member: mname(members[si]), rule: 'U = |N| FS / (A sigma_allow), worst member' },
    { key: 'buckling', label: 'Euler buckling screen (K = 1, solid square)', U: Ub, value: bi >= 0 ? Math.abs(members[bi].N) : 0, limit: bi >= 0 ? members[bi].Pcr / cfg.FS : NaN, unit: 'N', member: bi >= 0 ? mname(members[bi]) : 'none in compression', rule: 'U = |N| FS / P_cr, P_cr = pi^2 E I / (K L)^2, I = A^2 / 12' },
    { key: 'deflection', label: 'Midspan deflection', U: Ud, value: Math.abs(vMid), limit: vLim, unit: 'mm', rule: 'U = |v_mid| / (span / ratio)' },
  ];
  const g = constraints.map(c => c.U - 1);
  const feasible = g.every(val => val <= 1e-9);
  let gi = 0;
  for (let j = 1; j < constraints.length; j++) if (constraints[j].U > constraints[gi].U) gi = j;
  return {
    f: mass, g, info: { governing: constraints[gi].key },
    mass, feasible, mechanism: false, constraints, governing: constraints[gi].key, governingLabel: constraints[gi].label,
    members, model, vMid, vLim, reactions: sol.reactions, displacements: sol.u,
  };
}

export function makeTrussProblem(cfg) {
  const full = Object.assign(trussConfigDefault(), cfg || {});
  const errors = validateTrussConfig(full);
  if (errors.length) throw new Error(errors.join('; '));
  const solve = x => solveTruss(full, x);
  return {
    id: 'truss', kind: 'truss', cfg: full, n: 3,
    names: TRUSS_VARIABLES.names.slice(), labels: TRUSS_VARIABLES.labels.slice(), units: TRUSS_VARIABLES.units.slice(),
    lower: TRUSS_VARIABLES.lower.slice(), upper: TRUSS_VARIABLES.upper.slice(),
    budget: full.budget ?? 30, seed: full.seed ?? 1,
    objectiveLabel: 'mass', objectiveUnit: 'g',
    constraintNames: ['stress', 'buckling', 'deflection'],
    constraintLabels: ['max U_stress - 1', 'max U_buckling - 1', 'U_defl - 1'],
    student: Array.isArray(full.student) ? full.student.slice() : null,
    solve,
    evaluate: x => { const r = solve(x); return { f: r.f, g: r.g, info: r.info }; },
  };
}

// Member forces for the actual loads (N) and for a unit downward load at the midspan node (n) at height h.
// The Warren truss is statically determinate (23 members + 3 reactions = 2 x 13 degrees of freedom), so the
// forces do not depend on the areas; unit areas are used. Also returns the mass coefficients per group.
export function trussStatics(cfg, h) {
  const full = Object.assign(trussConfigDefault(), cfg || {});
  const model = buildTrussModel(full, [1, 1, h]);
  const sol = solveTrussModel(model);
  if (sol.mechanism) return { mechanism: true };
  const unitModel = Object.assign({}, model, { loads: { [model.midNode]: [0, -1] } });
  const unit = solveTrussModel(unitModel);
  const groups = {};
  model.members.forEach((mb, i) => {
    const grp = groups[mb.group] || (groups[mb.group] = { lengthSum: 0, rho: mb.rho, E: mb.E, sigmaAllow: mb.sigmaAllow, buckling: mb.buckling, members: [] });
    grp.lengthSum += sol.lengths[i];
    grp.members.push(i);
  });
  return { mechanism: false, model, N: sol.N, n: unit.N, lengths: sol.lengths, groups, midNode: model.midNode, span: model.span };
}

// Reference optimum of the truss problem by a fine 1-D scan over h. At fixed h the member forces are known
// (static determinacy), the stress and buckling constraints give minimum areas per group directly, and the
// deflection constraint v = C_c / A_c + C_d / A_d <= v_lim is handled with the closed-form Lagrangian solution
// of "minimize a A_c + b A_d" (clamped to the bounds). The candidate is re-solved with the exact solver.
export function trussReferenceOptimum(cfg, opts = {}) {
  const full = Object.assign(trussConfigDefault(), cfg || {});
  const problem = makeTrussProblem(full);
  const nScan = opts.nScan || 441;
  const [loC, loD, loH] = problem.lower, [hiC, hiD, hiH] = problem.upper;
  const vLimOf = span => span / full.deflectionLimitRatio;
  const Kf = full.K ?? 1;

  const areasAt = (h) => {
    const st = trussStatics(full, h);
    if (st.mechanism) return null;
    const gC = st.groups.chord, gD = st.groups.diag;
    if (!gC || !gD) return null;
    const minArea = grp => {
      let A = 0;
      for (const i of grp.members) {
        const N = st.N[i], L = st.lengths[i];
        A = Math.max(A, Math.abs(N) * full.FS / grp.sigmaAllow);
        if (N < 0 && grp.buckling === 'square') A = Math.max(A, Kf * L * Math.sqrt(12 * Math.abs(N) * full.FS / (Math.PI * Math.PI * grp.E)));
      }
      return A;
    };
    const coef = grp => { let C = 0; for (const i of grp.members) C += st.N[i] * st.n[i] * st.lengths[i] / grp.E; return C; };
    const vLim = vLimOf(st.span);
    let Ac = Math.max(loC, minArea(gC)), Ad = Math.max(loD, minArea(gD));
    if (Ac > hiC || Ad > hiD) return null;
    const Cc = coef(gC), Cd = coef(gD);
    const a = gC.rho * gC.lengthSum / 1000, b = gD.rho * gD.lengthSum / 1000;
    const defl = (x, y) => Math.abs(Cc / x + Cd / y);
    if (defl(Ac, Ad) > vLim) {
      if (Cc < 0 || Cd < 0) return null; // mixed signs are not expected for downward loads; skip this h
      const sqrtLam = (Math.sqrt(Cc * a) + Math.sqrt(Cd * b)) / vLim;
      let xc = sqrtLam * Math.sqrt(Cc / a), xd = sqrtLam * Math.sqrt(Cd / b);
      if (xc < Ac) { xc = Ac; const rem = vLim - Cc / xc; if (!(rem > 0)) return null; xd = Math.max(Ad, Cd / rem); }
      else if (xd < Ad) { xd = Ad; const rem = vLim - Cd / xd; if (!(rem > 0)) return null; xc = Math.max(Ac, Cc / rem); }
      Ac = xc; Ad = xd;
      if (Ac > hiC || Ad > hiD) return null;
    }
    return { x: [Ac, Ad, h], mass: a * Ac + b * Ad };
  };

  let best = null;
  for (const h of linspace(loH, hiH, nScan)) {
    const c = areasAt(h);
    if (c && (!best || c.mass < best.mass)) best = c;
  }
  if (!best) return null;
  const step = (hiH - loH) / (nScan - 1);
  for (const h of linspace(Math.max(loH, best.x[2] - step), Math.min(hiH, best.x[2] + step), 201)) {
    const c = areasAt(h);
    if (c && c.mass < best.mass) best = c;
  }
  // nudge the areas up by a relative 1e-9 so the exact re-solve is not rejected by round-off at the limit
  const x = [best.x[0] * (1 + 1e-9), best.x[1] * (1 + 1e-9), best.x[2]];
  const ver = verifyDesign(problem, x);
  return {
    x, mass: ver.mass, verified: ver.feasible, solve: ver.details, governing: ver.governing,
    method: `1-D scan over h (${nScan} values, refined); areas from the active stress, buckling and deflection constraints using static determinacy; exact re-solve`,
  };
}

// ---- 8c. Analytic test problem (Gardner type) ----

// minimize f = x + y subject to g = 1.5 - x - 2 y + 0.5 sin(2 pi (x^2 - 2 y)) <= 0 on the unit box.
export function gardnerProblem(budget = 40, seed = 1) {
  const solve = x => {
    const [a, b] = x;
    const g = 1.5 - a - 2 * b + 0.5 * Math.sin(2 * Math.PI * (a * a - 2 * b));
    return { f: a + b, g: [g], mass: a + b, feasible: g <= 1e-12, constraints: [{ key: 'g', label: 'g(x, y)', U: g + 1, value: g, limit: 0, unit: '' }], governing: 'g', governingLabel: 'g(x, y)', mechanism: false };
  };
  return {
    id: 'gardner', kind: 'gardner', n: 2, names: ['x', 'y'], labels: ['x', 'y'], units: ['', ''],
    lower: [0, 0], upper: [1, 1], budget, seed, objectiveLabel: 'f', objectiveUnit: '',
    constraintNames: ['g'], constraintLabels: ['g(x, y)'], student: null,
    solve, evaluate: x => { const r = solve(x); return { f: r.f, g: r.g }; },
  };
}

// ---- 8d. Dispatchers and verification ----

export function makeProblem(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('problem specification missing');
  if (spec.kind === 'beam') return makeBeamProblem(spec);
  if (spec.kind === 'truss') return makeTrussProblem(spec);
  if (spec.kind === 'gardner') return gardnerProblem(spec.budget, spec.seed);
  throw new Error(`unknown problem kind "${spec.kind}"`);
}

export function referenceOptimum(problem, opts = {}) {
  if (problem.kind === 'beam') return beamReferenceOptimum(problem.cfg, opts);
  if (problem.kind === 'truss') return trussReferenceOptimum(problem.cfg, opts);
  return null;
}

// Propose, then verify: rebuild the design from its numbers, solve it from scratch with the plain exact
// solver and re-check every constraint. The page shows this result, never the surrogate's estimate.
export function verifyDesign(problem, x, tol = 1e-9) {
  const n = problem.n;
  if (!Array.isArray(x) || x.length !== n || !x.every(Number.isFinite)) {
    return { feasible: false, inBox: false, mass: NaN, utilizations: [], governing: null, g: [], constraints: [], details: null, reason: 'design variables must be ' + n + ' finite numbers' };
  }
  const inBox = x.every((v, d) => v >= problem.lower[d] - 1e-9 && v <= problem.upper[d] + 1e-9);
  let r;
  try { r = problem.solve(x); } catch (err) {
    return { feasible: false, inBox, mass: NaN, utilizations: [], governing: null, g: [], constraints: [], details: null, reason: err.message };
  }
  const g = r.g.map(v => (Number.isFinite(v) ? v : 1e3));
  const violated = g.map((v, j) => ({ j, g: v })).filter(o => o.g > tol);
  const feasible = inBox && violated.length === 0 && Number.isFinite(r.mass) && !r.mechanism;
  let reason = null;
  if (r.mechanism) reason = r.message || 'unstable structure';
  else if (!inBox) reason = 'design lies outside the variable bounds';
  else if (violated.length) reason = 'violated: ' + violated.map(o => (problem.constraintNames ? problem.constraintNames[o.j] : 'g' + (o.j + 1)) + ' (g = ' + fmtNum(o.g) + ')').join(', ');
  return { feasible, inBox, mass: r.mass, utilizations: r.constraints.map(c => c.U), governing: r.governing, governingLabel: r.governingLabel, g, constraints: r.constraints, details: r, reason };
}

// Busy wait used only to emulate an expensive solver in the demonstration. Never used in tests.
export function busyWait(ms) {
  if (!(ms > 0)) return;
  const t0 = now();
  while (now() - t0 < ms) { /* spin */ }
}

// Full demonstration campaign used by the worker (and by the page as a fallback when workers are unavailable):
// BO, then the same budget cap grid and seeded random search, then the reference optimum, the closed form (beam)
// and the exact grid for the teaching overlay. Yields to the event loop after every exact evaluation so the
// caller can post progress and honour a cancel request.
// request: { spec, budget, seed, delayMs, compare, gridN }
// post(message): receives { type: 'progress' | 'phase' | 'cancelled' | 'done', ... }
export async function runCampaign(request, post, shouldCancel = () => false) {
  const t0 = now();
  const problem = makeProblem(request.spec);
  const budget = Math.max(3, Math.min(200, Math.floor(Number(request.budget) || 30)));
  const seed = Math.floor(Number(request.seed) || 1);
  const delay = Math.max(0, Math.min(300, Number(request.delayMs) || 0));
  const compare = request.compare !== false;
  const exact = problem.evaluate;
  const timed = Object.assign({}, problem, { evaluate: x => { busyWait(delay); return exact(x); } });
  const gridPts = gridPoints(problem, budget);
  const overallTotal = budget + (compare ? gridPts.length + budget : 0);
  let overall = 0;
  const yieldNow = () => new Promise(resolve => setTimeout(resolve, 0));
  const emit = (type, data) => post(Object.assign({ type, elapsedMs: now() - t0 }, data));
  const drive = async (stepper, method, total) => {
    while (!stepper.done) {
      const rec = stepper.step();
      overall++;
      emit('progress', { method, k: rec.k, total, overall, overallTotal, record: rec, bestF: rec.bestF });
      await yieldNow();
      if (shouldCancel()) return false;
    }
    return true;
  };
  const bo = createOptimizer(timed, { budget, seed });
  if (!(await drive(bo, 'bo', budget))) { emit('cancelled', {}); return null; }
  const boResult = bo.result();
  let grid = null, random = null;
  if (compare) {
    const gs = createSearch(timed, gridPts, 'grid');
    if (!(await drive(gs, 'grid', gridPts.length))) { emit('cancelled', {}); return null; }
    grid = Object.assign(gs.result(), { side: gridSide(budget, problem.n) });
    const rs = createSearch(timed, randomPoints(problem, budget, seed), 'random');
    if (!(await drive(rs, 'random', budget))) { emit('cancelled', {}); return null; }
    random = Object.assign(rs.result(), { seed });
  }
  emit('phase', { text: 'Computing the reference optimum and the teaching overlays with the plain exact solver (not counted in the budget)...' });
  await yieldNow();
  if (shouldCancel()) { emit('cancelled', {}); return null; }
  const reference = referenceOptimum(problem);
  const closedForm = problem.kind === 'beam' ? beamClosedFormOptimum(problem.cfg) : null;
  const base = boResult.best ? boResult.best.x.slice()
    : (reference ? reference.x.slice() : problem.lower.map((lo, d) => 0.5 * (lo + problem.upper[d])));
  const dims = [0, 1];
  const gridN = Math.max(10, Math.min(120, Math.floor(Number(request.gridN) || 50)));
  const exactGrid = evaluateGrid(problem, dims, base, gridN, gridN);
  const payload = { spec: request.spec, budget, seed, delayMs: delay, compare, bo: boResult, grid, random, reference, closedForm, exactGrid, dims, base, elapsedMs: now() - t0 };
  emit('done', { payload });
  return payload;
}
