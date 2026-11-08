// Tests for the constrained Bayesian optimization module. Run from /home/claude/optlab with
//   node --test optimization/constrained-bo/constrained-bo.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cbo from './constrained-bo.js';

// ---------- helpers ----------

// Gauss-Jordan inverse, independent of the module, for the Cholesky check.
function inverse(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map(row => row.slice(n));
}

// Simpson integration of E[max(fBest - f, 0)] for f ~ N(mu, sigma^2).
function eiByIntegration(mu, sigma, fBest) {
  const a = mu - 12 * sigma, b = fBest;
  if (b <= a) return 0;
  const N = 200000, h = (b - a) / N;
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const f = a + i * h;
    const w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);
    s += w * Math.max(fBest - f, 0) * cbo.normPdf((f - mu) / sigma) / sigma;
  }
  return s * h / 3;
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${a} to be within ${tol} of ${b}`);

// ---------- linear algebra and distributions ----------

test('Cholesky solve on a 4x4 SPD matrix matches a direct inverse', () => {
  const A = [[4, 1, 2, 0.5], [1, 5, 1, 1], [2, 1, 6, 1.5], [0.5, 1, 1.5, 3]];
  const b = [1, -2, 3, 4];
  const { L, jitter } = cbo.cholesky(A);
  assert.equal(jitter, 0);
  const x = cbo.choleskySolve(L, b);
  const Ainv = inverse(A);
  const xRef = Ainv.map(row => row.reduce((s, v, j) => s + v * b[j], 0));
  for (let i = 0; i < 4; i++) near(x[i], xRef[i], 1e-12, `x[${i}]`);
  // L L^T reproduces A
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += L[i][k] * L[j][k];
    near(s, A[i][j], 1e-12, `A[${i}][${j}]`);
  }
});

test('Cholesky jitter fallback handles a singular matrix and rejects an indefinite one', () => {
  const singular = [[1, 1], [1, 1]];
  const { L, jitter } = cbo.cholesky(singular);
  assert.ok(jitter > 0 && Number.isFinite(L[1][1]));
  assert.throws(() => cbo.cholesky([[1, 2], [2, 1]]), /not positive definite/);
});

test('normal cdf and erf match reference values', () => {
  near(cbo.normCdf(1.96), 0.9750021048517795, 1e-12);
  near(cbo.normCdf(-3), 0.0013498980316301, 1e-14);
  near(cbo.normCdf(-6), 9.865876450377e-10, 1e-20);
  near(cbo.erf(0.5), 0.5204998778130465, 1e-14);
  near(cbo.erfc(4), 1.541725790028002e-8, 1e-20);
  near(cbo.normCdf(0), 0.5, 1e-15);
});

// ---------- Gaussian process ----------

test('GP posterior mean interpolates the training points and the posterior sd there is below 1e-3 (nugget 1e-8, noise free)', () => {
  const U = cbo.linspace(0, 1, 9).map(v => [v]);
  const y = U.map(([v]) => Math.sin(3 * v) + 0.2 * v);
  const gp = cbo.fitGP(U, y, { nugget: 1e-8, noise: 0 });
  U.forEach((u, i) => {
    const p = cbo.gpPredict(gp, u);
    near(p.mu, y[i], 1e-5, `mean at training point ${i}`);
    assert.ok(p.sigma < 1e-3, `sd at training point ${i} is ${p.sigma}`);
  });
});

test('GP on y = sin(3x) with 12 training points predicts 50 test points with RMSE below 0.05', () => {
  const U = cbo.linspace(0, 1, 12).map(v => [v]);
  const y = U.map(([v]) => Math.sin(3 * v));
  const gp = cbo.fitGP(U, y);
  let se = 0;
  for (const v of cbo.linspace(0, 1, 50)) { const p = cbo.gpPredict(gp, [v]); se += (p.mu - Math.sin(3 * v)) ** 2; }
  const rmse = Math.sqrt(se / 50);
  assert.ok(rmse < 0.05, `rmse ${rmse}`);
});

test('GP with ARD picks a long length scale for an inactive input dimension', () => {
  const rng = cbo.makeRng(3);
  const U = Array.from({ length: 25 }, () => [rng(), rng()]);
  const y = U.map(([a]) => Math.sin(4 * a));
  const gp = cbo.fitGP(U, y);
  assert.ok(gp.ls[1] > gp.ls[0], `length scales ${gp.ls}`);
});

// ---------- acquisition ----------

test('EI formula equals the numerically integrated expectation within 1e-6', () => {
  for (const [mu, sigma, fBest] of [[1, 0.5, 0.8], [0, 1, 0], [2, 0.3, 1.5], [-1, 2, 0.5], [3, 0.2, 1]]) {
    near(cbo.expectedImprovement(mu, sigma, fBest), eiByIntegration(mu, sigma, fBest), 1e-6, `EI(${mu},${sigma},${fBest})`);
  }
  assert.equal(cbo.expectedImprovement(1, 0, 2), 1);
  assert.equal(cbo.expectedImprovement(3, 0, 2), 0);
});

test('constrained EI is below 1e-6 where the probability of feasibility is below 1e-6', () => {
  const gPreds = [{ mu: 5, sigma: 0.5 }];   // P(g <= 0) = Phi(-10)
  const pf = cbo.probabilityOfFeasibility(5, 0.5);
  assert.ok(pf < 1e-6, `pf ${pf}`);
  const a = cbo.constrainedEI(0, 1, 1, gPreds);  // EI alone would be about 1.08
  assert.ok(a.ei > 0.5);
  assert.ok(a.acq < 1e-6, `acq ${a.acq}`);
  // without a feasible incumbent the acquisition is the feasibility probability itself
  const b = cbo.constrainedEI(0, 1, null, [{ mu: -1, sigma: 1 }]);
  near(b.acq, cbo.normCdf(1), 1e-12);
});

// ---------- design helpers ----------

test('LHS with 10 points in 2-D has exactly one point per row and column stratum', () => {
  const pts = cbo.latinHypercube(10, 2, cbo.makeRng(11));
  assert.equal(pts.length, 10);
  for (let d = 0; d < 2; d++) {
    const strata = pts.map(p => Math.floor(p[d] * 10)).sort((a, b) => a - b);
    assert.deepEqual(strata, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});

test('Halton candidates lie in the unit box and Nelder-Mead finds a box-constrained minimum', () => {
  const c = cbo.haltonCandidates(400, 3, [0.3, 0.6, 0.9]);
  assert.equal(c.length, 400);
  assert.ok(c.every(p => p.every(v => v >= 0 && v < 1)));
  const res = cbo.nelderMead(x => (x[0] - 0.3) ** 2 + (x[1] + 0.2) ** 2, [0.9, 0.9]);
  near(res.x[0], 0.3, 1e-3);
  near(res.x[1], 0, 1e-9, 'clamped at the lower bound');
});

test('gridSide reproduces floor(budget^(1/n)) robustly', () => {
  assert.equal(cbo.gridSide(30, 2), 5);
  assert.equal(cbo.gridSide(30, 3), 3);
  assert.equal(cbo.gridSide(27, 3), 3);
  assert.equal(cbo.gridSide(64, 3), 4);
  assert.equal(cbo.gridSide(8, 3), 2);
  assert.equal(cbo.gridSide(26, 3), 2);
});

// ---------- optimizer ----------

test('on the Gardner-type problem BO (budget 40, seed 1) is feasible and within 0.05 of a 200 x 200 grid', () => {
  const p = cbo.gardnerProblem(40, 1);
  let gridBest = Infinity;
  for (let i = 0; i < 200; i++) for (let j = 0; j < 200; j++) {
    const r = p.evaluate([i / 199, j / 199]);
    if (r.g[0] <= 0 && r.f < gridBest) gridBest = r.f;
  }
  const res = cbo.optimize(p);
  assert.ok(res.best, 'a feasible point was found');
  const check = p.evaluate(res.best.x);
  assert.ok(check.g[0] <= 0, 'best point re-evaluates as feasible');
  assert.ok(res.best.f <= gridBest + 0.05, `BO ${res.best.f} vs grid ${gridBest}`);
});

test('optimize returns a history with exactly budget evaluations and is deterministic for a seed', () => {
  const p = cbo.gardnerProblem(17, 5);
  const a = cbo.optimize(p);
  const b = cbo.optimize(p);
  assert.equal(a.history.length, 17);
  assert.equal(a.evaluations, 17);
  assert.deepEqual(a.history.map(r => r.x), b.history.map(r => r.x));
  assert.equal(a.history.filter(r => r.phase === 'initial design').length, 2 * 2 + 2);
  // progress callback fires once per evaluation
  let calls = 0;
  cbo.optimize(cbo.gardnerProblem(9, 2), () => { calls++; });
  assert.equal(calls, 9);
});

test('on the beam problem with budget 30 BO finds a verified feasible mass no worse than the same budget cap grid', () => {
  const cfg = cbo.beamConfigFromPreset('printed-spar');
  const problem = cbo.makeBeamProblem(cfg);
  const bo = cbo.optimize(Object.assign({}, problem, { budget: 30, seed: 1 }));
  const grid = cbo.gridSearch(problem, 30);
  assert.equal(grid.history.length, 25);
  assert.ok(bo.best && grid.best, 'both found feasible designs');
  const vBo = cbo.verifyDesign(problem, bo.best.x);
  const vGrid = cbo.verifyDesign(problem, grid.best.x);
  assert.ok(vBo.feasible && vGrid.feasible);
  assert.ok(vBo.mass <= vGrid.mass + 1e-9, `BO ${vBo.mass} g vs grid ${vGrid.mass} g`);
  // and within 1 percent of the classical closed form
  const cf = cbo.beamClosedFormOptimum(cfg);
  assert.ok(cf.feasible);
  assert.ok(vBo.mass <= cf.mass * 1.01, `BO ${vBo.mass} g vs closed form ${cf.mass} g`);
  assert.ok(vBo.mass >= cf.mass - 1e-6, 'BO cannot beat the true optimum');
});

test('GP predictions at evaluated points agree with the observed objective', () => {
  const problem = cbo.makeBeamProblem(cbo.beamConfigFromPreset('printed-spar'));
  const res = cbo.optimize(Object.assign({}, problem, { budget: 20, seed: 3 }));
  const yStd = res.models.f.yStd;
  for (const r of res.history) {
    const p = cbo.predictAt(res, r.x);
    assert.ok(Math.abs(p.f.mu - r.f) < 0.05 * yStd, `mean at evaluated point ${r.k}: ${p.f.mu} vs ${r.f}`);
    assert.ok(p.pFeasible >= 0 && p.pFeasible <= 1);
  }
});

test('random search is seeded and reproducible', () => {
  const problem = cbo.makeBeamProblem(cbo.beamConfigFromPreset('printed-spar'));
  const a = cbo.randomSearch(problem, 12, 4), b = cbo.randomSearch(problem, 12, 4);
  assert.deepEqual(a.history.map(r => r.x), b.history.map(r => r.x));
  assert.equal(a.history.length, 12);
});

// ---------- beam solver and references ----------

test('beam solver matches the closed forms for the printed spar preset', () => {
  const cfg = cbo.beamConfigFromPreset('printed-spar');   // cantilever 600 mm, P = 20 N tip, PLA, FS 2, L/50
  const r = cbo.solveBeam(cfg, [12, 24]);
  const I = 12 * 24 ** 3 / 12;
  near(r.mass, 12 * 24 * 600 * 1.24 / 1000, 1e-9, 'mass');
  near(r.M, 20 * 600, 1e-9, 'moment P L');
  near(r.constraints[0].value, 12000 * 12 / I, 1e-9, 'sigma = M c / I');
  near(r.constraints[0].U, (12000 * 12 / I) * 2 / 45, 1e-12, 'U_stress');
  near(r.constraints[1].value, 20 * 600 ** 3 / (3 * 3500 * I), 1e-9, 'tip deflection P L^3 / (3 E I)');
  near(r.constraints[1].U, (20 * 600 ** 3 / (3 * 3500 * I)) / 12, 1e-12, 'U_defl');
  assert.equal(r.feasible, false, 'the preset section exceeds the L/50 deflection limit');
  assert.equal(r.governing, 'deflection');
});

test('beam load effects follow the four classical formulas', () => {
  const base = { L: 1000, P: 100, w: 2 };
  const c1 = cbo.beamLoadEffects(Object.assign({}, base, { support: 'cantilever', loadType: 'point' }));
  near(c1.M, 100 * 1000, 1e-9); near(c1.vCoef, 100 * 1e9 / 3, 1e-6);
  const c2 = cbo.beamLoadEffects(Object.assign({}, base, { support: 'cantilever', loadType: 'udl' }));
  near(c2.M, 2 * 1e6 / 2, 1e-9); near(c2.vCoef, 2 * 1e12 / 8, 1e-3);
  const c3 = cbo.beamLoadEffects(Object.assign({}, base, { support: 'simply', loadType: 'point' }));
  near(c3.M, 100 * 1000 / 4, 1e-9); near(c3.vCoef, 100 * 1e9 / 48, 1e-6);
  const c4 = cbo.beamLoadEffects(Object.assign({}, base, { support: 'simply', loadType: 'udl' }));
  near(c4.M, 2 * 1e6 / 8, 1e-9); near(c4.vCoef, 5 * 2 * 1e12 / 384, 1e-3);
});

test('beam reference optimum (1-D scan) agrees with the classical closed form', () => {
  const cfg = cbo.beamConfigFromPreset('printed-spar');
  const cf = cbo.beamClosedFormOptimum(cfg);
  const ref = cbo.beamReferenceOptimum(cfg);
  // closed form: b at its lower bound 4 mm, deflection active: h = cbrt(4 k P L^2 / (E b))
  const hStar = Math.cbrt(4 * 50 * 20 * 600 ** 2 / (3500 * 4));
  near(cf.x[0], 4, 1e-12, 'b at lower bound');
  near(cf.x[1], hStar, 1e-9, 'h from the deflection constraint');
  assert.equal(cf.active, 'deflection');
  near(ref.mass, cf.mass, cf.mass * 1e-3, 'scan vs closed form mass');
  near(ref.x[1], hStar, 0.1, 'scan depth');
  assert.ok(cbo.verifyDesign(cbo.makeBeamProblem(cfg), ref.x).feasible);
});

test('tube sections treat 2 t >= D as the solid bar limit instead of producing NaN', () => {
  const cfg = Object.assign(cbo.beamConfigFromPreset('printed-spar'), { sectionType: 'tube' });
  const r = cbo.solveBeam(cfg, [8, 6]);
  assert.ok(Number.isFinite(r.mass) && Number.isFinite(r.g[0]) && Number.isFinite(r.g[1]));
  near(r.section.A, Math.PI * 64 / 4, 1e-9);
  assert.ok(r.section.solid);
  const ref = cbo.beamReferenceOptimum(cfg);
  assert.ok(ref && ref.mass > 0);
  assert.ok(cbo.verifyDesign(cbo.makeBeamProblem(cfg), ref.x).feasible);
});

// ---------- truss solver and references ----------

test('truss solver matches the method of sections on the Warren preset', () => {
  const cfg = cbo.trussConfigDefault();
  const r = cbo.solveTruss(cfg, [300, 300, 1000]);
  const find = (a, b) => r.members.find(m => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  // reactions 5 x 2000 / 2 = 5000 N each; midspan moment 9e6 N mm; top chord 9-10 carries -M/h
  near(find(9, 10).N, -9e6 / 1000, 1e-6, 'top chord force');
  near(find(2, 3).N, 8.5e6 / 1000, 1e-6, 'bottom chord force (moment about node 9)');
  near(find(0, 7).N, -5000 / Math.sin(Math.atan2(1000, 500)), 1e-6, 'end diagonal force');
  near(r.reactions[1], 5000, 1e-6, 'left reaction');
  near(r.reactions[13], 5000, 1e-6, 'right reaction');
  near(r.mass, (11 * 1000 * 300 + 12 * Math.hypot(500, 1000) * 300) * 2.7 / 1000, 1e-6, 'mass');
  assert.equal(r.governing, 'buckling');
});

test('the Warren truss is statically determinate: member forces do not depend on the areas', () => {
  const cfg = cbo.trussConfigDefault();
  const a = cbo.solveTruss(cfg, [300, 300, 800]);
  const b = cbo.solveTruss(cfg, [1200, 150, 800]);
  a.members.forEach((m, i) => near(m.N, b.members[i].N, 1e-6, `member ${i}`));
});

test('mechanisms are reported as unstable, not as NaN, and count as a large constraint violation', () => {
  const cfg = cbo.trussConfigDefault();
  const model = cbo.buildTrussModel(cfg, [300, 300, 1000]);
  model.members = model.members.filter(m => m.group !== 'diag');
  const sol = cbo.solveTrussModel(model);
  assert.equal(sol.mechanism, true);
  assert.match(sol.message, /unstable/);
  // a problem whose solver reports a mechanism still yields finite records for the optimizer
  const problem = cbo.makeTrussProblem(cfg);
  const fake = Object.assign({}, problem, { evaluate: x => ({ f: 1, g: [1e3, 1e3, 1e3] }), budget: 8, seed: 1 });
  const res = cbo.optimize(fake);
  assert.equal(res.history.length, 8);
  assert.equal(res.best, null);
});

test('truss reference optimum is verified feasible and BO at budget 30 beats the same budget cap grid', () => {
  const cfg = cbo.trussConfigDefault();
  const problem = cbo.makeTrussProblem(cfg);
  const ref = cbo.trussReferenceOptimum(cfg);
  assert.ok(ref && ref.verified, 'reference checked by fresh model solve');
  assert.ok(ref.mass > 20000 && ref.mass < 35000, `reference mass ${ref.mass} g`);
  const bo = cbo.optimize(Object.assign({}, problem, { budget: 30, seed: 1 }));
  const grid = cbo.gridSearch(problem, 30);
  assert.equal(grid.history.length, 27);
  assert.ok(bo.best && grid.best);
  assert.ok(bo.best.f < grid.best.f, `BO ${bo.best.f} vs grid ${grid.best.f}`);
  assert.ok(bo.best.f >= ref.mass * (1 - 1e-6), 'BO cannot beat the verified reference');
  assert.ok(cbo.verifyDesign(problem, bo.best.x).feasible);
});

// ---------- verification and error handling ----------

test('verifyDesign rejects an infeasible design and accepts a feasible one with the governing constraint', () => {
  const cfg = cbo.beamConfigFromPreset('printed-spar');
  const problem = cbo.makeBeamProblem(cfg);
  const bad = cbo.verifyDesign(problem, [12, 24]);
  assert.equal(bad.feasible, false);
  assert.match(bad.reason, /deflection/);
  const good = cbo.verifyDesign(problem, [4, 47]);
  assert.equal(good.feasible, true);
  assert.equal(good.governing, 'deflection');
  const outside = cbo.verifyDesign(problem, [2, 90]);
  assert.equal(outside.feasible, false);
  assert.match(outside.reason, /bounds/);
  const nan = cbo.verifyDesign(problem, [NaN, 10]);
  assert.equal(nan.feasible, false);
});

test('invalid inputs produce readable errors instead of NaN or exceptions of the wrong kind', () => {
  assert.throws(() => cbo.makeBeamProblem(Object.assign(cbo.beamConfigFromPreset('printed-spar'), { L: -5 })), /Span L/);
  assert.throws(() => cbo.makeBeamProblem(Object.assign(cbo.beamConfigFromPreset('printed-spar'), { material: 'unobtainium' })), /material/);
  assert.throws(() => cbo.solveBeam(cbo.beamConfigFromPreset('printed-spar'), [NaN, 10]), /positive numbers/);
  assert.throws(() => cbo.makeTrussProblem({ FS: 0 }), /Factor of safety/);
  assert.throws(() => cbo.makeProblem({ kind: 'spaceship' }), /unknown problem kind/);
  assert.throws(() => cbo.createOptimizer({ n: 2, lower: [0, 1], upper: [1, 1], evaluate: () => ({ f: 0, g: [] }) }), /lower < upper/);
  assert.throws(() => cbo.optimize({ n: 1, lower: [0], upper: [1], budget: 3, seed: 1, evaluate: () => ({ f: NaN, g: [] }) }), /non-finite objective/);
  assert.deepEqual(cbo.validateBeamConfig(null), ['beam configuration missing']);
});
