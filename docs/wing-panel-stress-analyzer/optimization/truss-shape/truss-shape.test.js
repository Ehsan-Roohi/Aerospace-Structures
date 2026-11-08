// Tests for the truss-shape module. Run from /home/claude/optlab with:
//   node --test optimization/truss-shape/truss-shape.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './truss-shape.js';
import { makeRng } from '../shared/labkit.js';

const rosenbrock = x => 100 * (x[1] - x[0] * x[0]) ** 2 + (1 - x[0]) ** 2;
const sphere = x => x.reduce((a, b) => a + b * b, 0);

function twoBarProblem(thetaDeg, P) {
  const theta = thetaDeg * Math.PI / 180;
  const h = 1000 * Math.tan(theta);
  return {
    key: 'two-bar', nodes0: [[0, 0], [2000, 0], [1000, h]],
    members: [{ index: 0, a: 0, b: 2, group: 'bar' }, { index: 1, a: 1, b: 2, group: 'bar' }],
    groups: { bar: { key: 'bar', E: 68900, sigmaAllow: 276, rho: 2.7, A0: 100, tensionOnly: false, buckling: 'square' } },
    supports: { 0: [1, 1], 1: [1, 1] }, loads: { 2: [0, -P] }, loadSum: P, FS: 1.5, Keff: 1, bucklingOn: true,
  };
}

// ---------------------------------------------------------------- exact solver

test('two-bar truss: member force N = P / (2 sin theta), compression', () => {
  for (const theta of [20, 30, 45, 60]) {
    const prob = twoBarProblem(theta, 1000);
    const sol = M.solveTruss(prob, prob.nodes0, [100, 100]);
    assert.ok(sol.ok, sol.reason);
    const expected = -1000 / (2 * Math.sin(theta * Math.PI / 180));
    assert.ok(Math.abs(sol.N[0] - expected) < 1e-9 * Math.abs(expected), `theta ${theta}: N0 ${sol.N[0]} vs ${expected}`);
    assert.ok(Math.abs(sol.N[1] - expected) < 1e-9 * Math.abs(expected));
    // mass = sum(A L) rho / 1000
    const Lbar = Math.hypot(1000, 1000 * Math.tan(theta * Math.PI / 180));
    assert.ok(Math.abs(sol.mass - 2 * 100 * Lbar * 2.7 / 1000) < 1e-9);
  }
});

test('single bar: extension delta = P L / (E A) and reaction equilibrium', () => {
  const prob = {
    key: 'bar', nodes0: [[0, 0], [1000, 0]], members: [{ index: 0, a: 0, b: 1, group: 'bar' }],
    groups: { bar: { key: 'bar', E: 68900, sigmaAllow: 276, rho: 2.7, A0: 100, tensionOnly: false, buckling: 'square' } },
    supports: { 0: [1, 1], 1: [0, 1] }, loads: { 1: [500, 0] }, loadSum: 500, FS: 1.5, Keff: 1, bucklingOn: true,
  };
  const sol = M.solveTruss(prob, prob.nodes0, [100]);
  assert.ok(sol.ok);
  assert.ok(Math.abs(sol.u[2] - 500 * 1000 / (68900 * 100)) < 1e-12);
  assert.ok(Math.abs(sol.N[0] - 500) < 1e-9);
  assert.ok(Math.abs(sol.reactions[0][0] + 500) < 1e-9);
  // utilization: tension, stress only
  assert.ok(Math.abs(sol.Ustress[0] - 500 * 1.5 / (100 * 276)) < 1e-12);
  assert.equal(sol.Ubuckle[0], 0);
});

test('Euler buckling screen uses I = A^2/12 and the effective length factor K', () => {
  const prob = twoBarProblem(30, 1000);
  const sol = M.solveTruss(prob, prob.nodes0, [100, 100]);
  const L = Math.hypot(1000, 1000 * Math.tan(Math.PI / 6));
  const Pcr = Math.PI ** 2 * 68900 * (100 * 100 / 12) / (L * L);
  assert.ok(Math.abs(sol.Ubuckle[0] - 1000 * 1.5 / Pcr) < 1e-12);
  const probK = Object.assign({}, prob, { Keff: 2 });
  const solK = M.solveTruss(probK, prob.nodes0, [100, 100]);
  assert.ok(Math.abs(solK.Ubuckle[0] - 4 * sol.Ubuckle[0]) < 1e-9);
  const probNoB = Object.assign({}, prob, { bucklingOn: false });
  assert.equal(M.solveTruss(probNoB, prob.nodes0, [100, 100]).Ubuckle[0], 0);
});

test('mechanism and bad input are reported as errors, not exceptions or NaN', () => {
  const p = M.makeProblem('warren');
  // collinear nodes: every top node on the bottom chord line
  const nodes = p.nodes0.map(q => [q[0], 0]);
  const sol = M.solveTruss(p, nodes, M.presetAreas(p));
  assert.equal(sol.ok, false);
  assert.match(sol.reason, /unstable|mechanism/i);
  // coincident nodes
  const nodes2 = p.nodes0.map(q => q.slice());
  nodes2[7] = [0, 0];
  const sol2 = M.solveTruss(p, nodes2, M.presetAreas(p));
  assert.equal(sol2.ok, false);
  assert.match(sol2.reason, /zero length/);
  // non-positive area
  const bad = M.presetAreas(p); bad[0] = 0;
  assert.equal(M.solveTruss(p, p.nodes0, bad).ok, false);
  // NaN coordinate
  const nodes3 = p.nodes0.map(q => q.slice()); nodes3[8][1] = NaN;
  assert.equal(M.solveTruss(p, nodes3, M.presetAreas(p)).ok, false);
  // validateInputs returns messages
  const v = M.validateInputs({ presetKey: 'warren', FS: 0.5, K: 1, sizing: { Amin: -1 }, variables: { families: [{ type: 'height', enabled: true, lower: 500, upper: 400 }] } });
  assert.equal(v.ok, false);
  assert.ok(v.errors.length >= 3);
});

test('tension-only release: Wright bay struts carry the wire reactions and slack wires are flagged', () => {
  const p = M.makeProblem('wright-bay', { FS: 1.5, K: 1 });
  const lin = M.solveTruss(p, p.nodes0, M.presetAreas(p));
  assert.ok(lin.ok);
  assert.equal(lin.slackCount, 4); // one wire per bay in compression under upward lift
  const rel = M.solveTensionOnly(p, p.nodes0, M.presetAreas(p));
  assert.ok(rel.ok);
  assert.equal(rel.slackCount, 4);
  assert.ok(rel.releaseSettled);
  // released wires carry nothing; shear at the root bay = total lift of the outer stations minus the load at the strut's node
  const totalLift = 2 * (260 + 240 + 190 + 100);
  assert.ok(Math.abs(rel.N[9] - (-(totalLift - 260))) < 1e-6, `strut 1-6 force ${rel.N[9]}`);
  for (let i = 13; i < 21; i++) if (!rel.active[i]) assert.equal(rel.N[i], 0);
  // Landing case has a singular unilateral active set; compression must not be silently retained.
  const pl = M.makeProblem('wright-bay', { loadCase: 'landing (lower wing skid load)' });
  const rl = M.solveTensionOnly(pl, pl.nodes0, M.presetAreas(pl));
  assert.equal(rl.ok, false);
  assert.match(rl.reason, /singular|no accepted/i);
  assert.equal(M.verifyDesign(pl, pl.nodes0, M.presetAreas(pl), { slackMode: 'release' }).feasible, false);
});

// ---------------------------------------------------------------- inner sizing

test('nested objective on the Warren preset is finite and feasible after inner sizing (group and individual)', () => {
  const p = M.makeProblem('warren', { FS: 1.5, K: 1 });
  const param = M.buildParametrization(p, M.defaultVariableSpec('warren'));
  for (const mode of ['group', 'individual']) {
    const r = M.evaluateGeometry(p, param.apply(param.x0), { mode, Amin: 10 });
    assert.ok(r.ok);
    assert.ok(Number.isFinite(r.objective) && r.objective > 0);
    assert.ok(r.feasible);
    assert.ok(r.sol.maxU <= 1 + M.U_TOL);
    assert.ok(r.sol.maxU > 0.99, 'the governing member should be fully stressed');
    assert.ok(r.converged);
    if (mode === 'group') {
      // one area per group
      const chordAreas = new Set(p.members.filter(m => m.group === 'chord').map(m => r.areas[m.index].toFixed(9)));
      assert.equal(chordAreas.size, 1);
    }
  }
});

test('inner sizing: every utilization <= 1 after the polish step, also on the indeterminate Wright bay', () => {
  const p = M.makeProblem('wright-bay', { FS: 1.5, K: 1 });
  for (const slackMode of ['release', 'linear']) {
    for (const mode of ['group', 'individual']) {
      const r = M.evaluateGeometry(p, p.nodes0, { mode, Amin: 2, slackMode });
      assert.ok(r.ok, `${slackMode} ${mode}`);
      assert.equal(r.feasible, slackMode === 'release', 'linear compressed wires are comparison only');
      assert.ok(r.sol.maxU <= 1 + M.U_TOL);
      assert.ok(r.sol.maxU > 0.999);
    }
  }
});

test('a geometry producing a mechanism returns a penalized finite objective rather than NaN', () => {
  const p = M.makeProblem('warren');
  const param = M.buildParametrization(p, { families: [{ type: 'height', enabled: true, lower: 0, upper: 2500, x0: 1000 }] });
  const r = M.evaluateGeometry(p, param.apply([0]), { mode: 'group', Amin: 10 });
  assert.equal(r.ok, false);
  assert.ok(Number.isFinite(r.objective));
  assert.equal(r.objective, M.PENALTY_MASS);
  assert.equal(r.feasible, false);
  // a feasible geometry is far below the penalty
  const good = M.evaluateGeometry(p, param.apply([1000]), { mode: 'group', Amin: 10 });
  assert.ok(good.objective < r.objective / 1000);
});

test('inner sizing meets the displacement limit within 1e-6 relative when enabled', () => {
  const p = M.makeProblem('warren', { FS: 1.5, K: 1 });
  const param = M.buildParametrization(p, M.defaultVariableSpec('warren'));
  const nodes = param.apply([1000]);
  const free = M.evaluateGeometry(p, nodes, { mode: 'group', Amin: 10 });
  const d0 = free.sol.dispMag[3];
  const limit = d0 / 2.5;
  const r = M.evaluateGeometry(p, nodes, { mode: 'group', Amin: 10, dispLimit: { node: 3, limit } });
  assert.ok(r.ok && r.feasible);
  assert.ok(Math.abs(r.dispValue - limit) / limit < 1e-6, `disp ${r.dispValue} vs limit ${limit}`);
  assert.equal(r.governing.type, 'displacement');
  assert.ok(Math.abs(r.mass / free.mass - 2.5) < 1e-9, 'uniform scaling multiplies the mass by the same factor');
  // non-binding limit changes nothing
  const r2 = M.evaluateGeometry(p, nodes, { mode: 'group', Amin: 10, dispLimit: { node: 3, limit: 10 * d0 } });
  assert.ok(Math.abs(r2.mass - free.mass) < 1e-9);
  assert.equal(r2.dispScale, 1);
});

// ---------------------------------------------------------------- parametrizations

test('symmetry linking keeps mirrored nodes equal (heights and x positions)', () => {
  const p = M.makeProblem('warren');
  const py = M.buildParametrization(p, { symmetric: true, families: [{ type: 'topY', enabled: true, lower: 300, upper: 2500 }] });
  assert.equal(py.n, 3);
  const ny = py.apply([400, 900, 1300]);
  assert.equal(ny[7][1], ny[12][1]); assert.equal(ny[8][1], ny[11][1]); assert.equal(ny[9][1], ny[10][1]);
  assert.equal(ny[7][1], 400); assert.equal(ny[9][1], 1300);
  for (let i = 0; i <= 6; i++) assert.deepEqual(ny[i], p.nodes0[i]);
  const px = M.buildParametrization(p, { symmetric: true, families: [{ type: 'topX', enabled: true, margin: 50 }] });
  assert.equal(px.n, 3);
  const nx = px.apply([300, 1200, 2700]);
  assert.ok(Math.abs(nx[7][0] + nx[12][0] - 6000) < 1e-9);
  assert.ok(Math.abs(nx[8][0] + nx[11][0] - 6000) < 1e-9);
  assert.ok(Math.abs(nx[9][0] + nx[10][0] - 6000) < 1e-9);
  assert.equal(nx[7][0], 300);
  // bounds stay inside the panels
  assert.deepEqual([px.lower[0], px.upper[0]], [50, 950]);
  // without symmetry every node is a variable
  const pfull = M.buildParametrization(p, { symmetric: false, families: [{ type: 'topY', enabled: true }, { type: 'topX', enabled: true }] });
  assert.equal(pfull.n, 12);
  // the objective of a symmetric design evaluated in the full space is identical
  const xs = [400, 900, 1300, 1300, 900, 400, 300, 1200, 2700, 3300, 4800, 5700];
  const a = M.evaluateGeometry(p, pfull.apply(xs), { mode: 'individual', Amin: 10 });
  const b = M.evaluateGeometry(p, (() => { const n = py.apply([400, 900, 1300]); const nx2 = px.apply([300, 1200, 2700]); for (let i = 7; i <= 12; i++) n[i][0] = nx2[i][0]; return n; })(), { mode: 'individual', Amin: 10 });
  assert.ok(Math.abs(a.mass - b.mass) < 1e-9);
});

test('Wright bay strut stations stay ordered with the minimum spacing after repair', () => {
  const p = M.makeProblem('wright-bay');
  const param = M.buildParametrization(p, { families: [{ type: 'gap', enabled: true }, { type: 'strutX', enabled: true, minSpacing: 600 }] });
  assert.equal(param.n, 4);
  const nodes = param.apply([1500, 5000, 700, 900]);
  const xs = [nodes[1][0], nodes[2][0], nodes[3][0]];
  assert.ok(xs[0] >= 600 - 1e-9 && xs[2] <= 5400 + 1e-9);
  assert.ok(xs[1] - xs[0] >= 600 - 1e-9 && xs[2] - xs[1] >= 600 - 1e-9);
  // the upper nodes move with their stations and the gap is applied
  assert.equal(nodes[6][0], nodes[1][0]); assert.equal(nodes[7][0], nodes[2][0]); assert.equal(nodes[8][0], nodes[3][0]);
  for (let i = 5; i <= 9; i++) assert.equal(nodes[i][1], 1500);
  const d = param.describe([1500, 5000, 700, 900]);
  assert.deepEqual(d.slice(1).map(v => v.value), xs);
  assert.throws(() => M.buildParametrization(p, { families: [{ type: 'height', enabled: true }, { type: 'topY', enabled: true }] }), /not both/);
  assert.throws(() => M.buildParametrization(p, { families: [] }), /at least one/);
});

// ---------------------------------------------------------------- optimizers

test('Nelder-Mead minimizes Rosenbrock from (-1.2, 1) to within 1e-4 of (1, 1)', () => {
  const r = M.nelderMead(rosenbrock, [-1.2, 1], [-2.048, -2.048], [2.048, 2.048], {});
  assert.ok(Math.abs(r.x[0] - 1) < 1e-4 && Math.abs(r.x[1] - 1) < 1e-4, `x = ${r.x}`);
  assert.ok(r.f < 1e-8);
  assert.ok(r.evals < 2000);
  assert.ok(r.converged);
  // with restarts the result is at least as good and deterministic
  const r2 = M.nelderMead(rosenbrock, [-1.2, 1], [-2.048, -2.048], [2.048, 2.048], { restarts: 3, seed: 7 });
  const r3 = M.nelderMead(rosenbrock, [-1.2, 1], [-2.048, -2.048], [2.048, 2.048], { restarts: 3, seed: 7 });
  assert.ok(r2.f <= r.f + 1e-12);
  assert.deepEqual(r2.x, r3.x);
});

test('Nelder-Mead respects the bounds (clamping) and finds a boundary optimum', () => {
  const f = x => (x[0] - 3) ** 2 + (x[1] + 1) ** 2; // unconstrained minimum outside the box
  const r = M.nelderMead(f, [0, 0], [-1, -0.5], [1, 0.5], {});
  assert.ok(Math.abs(r.x[0] - 1) < 1e-6 && Math.abs(r.x[1] + 0.5) < 1e-6, `x = ${r.x}`);
  // f returning NaN is treated as a large finite value, no exception
  const r2 = M.nelderMead(x => (x[0] > 0.5 ? NaN : x[0] * x[0]), [0.2], [-1], [1], {});
  assert.ok(Number.isFinite(r2.f) && Math.abs(r2.x[0]) < 1e-5);
});

test('CMA-ES minimizes a 4-D sphere below 1e-6 within 500 evaluations with the seeded PRNG (deterministic)', () => {
  const x0 = [1, 1, 1, 1], lo = [-5, -5, -5, -5], hi = [5, 5, 5, 5];
  const s = M.createCmaEs(sphere, x0, lo, hi, { generations: 1000, maxEvals: 500, sigma0: 0.1, seed: 12345 });
  let reached = Infinity;
  while (!s.done) { s.step(); if (s.best.f < 1e-6 && reached === Infinity) reached = s.evals; }
  assert.ok(reached <= 500, `1e-6 reached after ${reached} evaluations`);
  assert.equal(s.lambda, 8); // 4 + floor(3 ln 4)
  // determinism: the same seed gives the same result, a different seed a different one
  const a = M.cmaEs(sphere, x0, lo, hi, { generations: 20, seed: 3 });
  const b = M.cmaEs(sphere, x0, lo, hi, { generations: 20, seed: 3 });
  const c = M.cmaEs(sphere, x0, lo, hi, { generations: 20, seed: 4 });
  assert.deepEqual(a.x, b.x);
  assert.notDeepEqual(a.x, c.x);
});

test('CMA-ES stepper reproduces a literal transliteration of Hansen\'s purecmaes (same random stream)', () => {
  // Reference: purecmaes.m (N. Hansen), no bound handling, one generation per loop pass.
  function purecmaes(f, xmean, sigma, stopeval, seed) {
    const N = xmean.length, rng = makeRng(seed); let spare = null;
    const randn = () => { if (spare !== null) { const g = spare; spare = null; return g; } let u1 = rng(); if (u1 < 1e-300) u1 = 1e-300; const u2 = rng(); const r = Math.sqrt(-2 * Math.log(u1)); spare = r * Math.sin(2 * Math.PI * u2); return r * Math.cos(2 * Math.PI * u2); };
    const lambda = 4 + Math.floor(3 * Math.log(N)), mu = Math.floor(lambda / 2);
    let w = []; for (let i = 0; i < mu; i++) w.push(Math.log(mu + 0.5) - Math.log(i + 1));
    const ws = w.reduce((a, b) => a + b, 0); w = w.map(v => v / ws); const mueff = 1 / w.reduce((a, b) => a + b * b, 0);
    const cc = (4 + mueff / N) / (N + 4 + 2 * mueff / N), cs = (mueff + 2) / (N + mueff + 5), c1 = 2 / ((N + 1.3) ** 2 + mueff);
    const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((N + 2) ** 2 + mueff)), damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (N + 1)) - 1) + cs;
    const chiN = Math.sqrt(N) * (1 - 1 / (4 * N) + 1 / (21 * N * N));
    const pc = new Array(N).fill(0), ps = new Array(N).fill(0); let B = [], D = new Array(N).fill(1), C = [], inv = [];
    for (let i = 0; i < N; i++) { B.push(new Array(N).fill(0)); C.push(new Array(N).fill(0)); inv.push(new Array(N).fill(0)); B[i][i] = 1; C[i][i] = 1; inv[i][i] = 1; }
    let counteval = 0, best = Infinity;
    while (counteval < stopeval) {
      const arx = [], fit = [];
      for (let k = 0; k < lambda; k++) {
        const z = new Array(N); for (let i = 0; i < N; i++) z[i] = randn() * D[i];
        const x = new Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += B[i][j] * z[j]; x[i] = xmean[i] + sigma * s; }
        arx.push(x); const fv = f(x); fit.push(fv); counteval++; if (fv < best) best = fv;
      }
      const idx = fit.map((v, i) => i).sort((a, b) => fit[a] - fit[b]);
      const xold = xmean.slice(); xmean = new Array(N).fill(0);
      for (let i = 0; i < mu; i++) for (let j = 0; j < N; j++) xmean[j] += w[i] * arx[idx[i]][j];
      const dm = xmean.map((v, j) => (v - xold[j]) / sigma);
      const cinv = new Array(N).fill(0); for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += inv[i][j] * dm[j]; cinv[i] = s; }
      let psn = 0; for (let i = 0; i < N; i++) { ps[i] = (1 - cs) * ps[i] + Math.sqrt(cs * (2 - cs) * mueff) * cinv[i]; psn += ps[i] * ps[i]; } psn = Math.sqrt(psn);
      const hsig = psn / Math.sqrt(1 - Math.pow(1 - cs, 2 * counteval / lambda)) / chiN < 1.4 + 2 / (N + 1) ? 1 : 0;
      for (let i = 0; i < N; i++) pc[i] = (1 - cc) * pc[i] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * dm[i];
      const Cn = [];
      for (let i = 0; i < N; i++) { Cn.push(new Array(N).fill(0)); for (let j = 0; j < N; j++) { let rm = 0; for (let k = 0; k < mu; k++) rm += w[k] * (arx[idx[k]][i] - xold[i]) * (arx[idx[k]][j] - xold[j]) / (sigma * sigma); Cn[i][j] = (1 - c1 - cmu) * C[i][j] + c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * C[i][j]) + cmu * rm; } }
      C = Cn; sigma *= Math.exp((cs / damps) * (psn / chiN - 1));
      const eig = M.symmetricEigen(C); B = eig.vectors; D = eig.values.map(v => Math.sqrt(Math.max(v, 1e-30)));
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { let s = 0; for (let k = 0; k < N; k++) s += B[i][k] * (1 / D[k]) * B[j][k]; inv[i][j] = s; }
    }
    return best;
  }
  // my implementation works in normalized coordinates z = (x - lo)/(hi - lo); with a box of width 200 the
  // normalized sigma 0.5/200 equals sigma = 0.5 in x and no sample ever touches the bounds.
  const ref = purecmaes(sphere, [1, 1, 1, 1], 0.5, 240, 12345);
  const mine = M.cmaEs(sphere, [1, 1, 1, 1], [-100, -100, -100, -100], [100, 100, 100, 100], { generations: 30, sigma0: 0.5 / 200, seed: 12345 });
  assert.ok(Math.abs(mine.f - ref) <= 1e-12 * Math.max(1, Math.abs(ref)), `mine ${mine.f} ref ${ref}`);
  assert.equal(mine.evals, 241); // 240 samples plus the start point
});

test('symmetricEigen reproduces A = V diag(l) V^T', () => {
  const A = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 2]];
  const { values, vectors } = M.symmetricEigen(A);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += vectors[i][k] * values[k] * vectors[j][k];
    assert.ok(Math.abs(s - A[i][j]) < 1e-12);
  }
});

// ---------------------------------------------------------------- nested optimization and the classical sweep

test('1-D height sweep optimum and Nelder-Mead optimum on the Warren height agree within 3 percent in mass', () => {
  const p = M.makeProblem('warren', { FS: 1.5, K: 1 });
  const param = M.buildParametrization(p, M.defaultVariableSpec('warren'));
  const sizing = { mode: 'group', Amin: 10 };
  const sweep = M.sweep1D(p, param, sizing, 80);
  assert.ok(sweep.best && Number.isFinite(sweep.best.mass));
  const f = x => M.evaluateGeometry(p, param.apply(x), sizing).objective;
  const nm = M.nelderMead(f, param.x0, param.lower, param.upper, { restarts: 1 });
  assert.ok(Math.abs(nm.f - sweep.best.mass) / sweep.best.mass < 0.03, `NM ${nm.f} sweep ${sweep.best.mass}`);
  assert.ok(nm.f <= sweep.best.mass + 1e-9, 'the continuous optimum is at least as good as the best sample');
  // the optimum height sits between the bounds (interior optimum) and the mass curve rises on both sides
  assert.ok(sweep.best.x > 300 && sweep.best.x < 2500);
  assert.ok(sweep.mass[0] > sweep.best.mass && sweep.mass[sweep.mass.length - 1] > sweep.best.mass);
  // CMA-ES lands on the same optimum
  const cma = M.cmaEs(f, param.x0, param.lower, param.upper, { generations: 60, seed: 12345 });
  assert.ok(Math.abs(cma.f - nm.f) / nm.f < 0.01, `CMA ${cma.f} NM ${nm.f}`);
});

test('verification routine accepts the sized optimum and rejects an infeasible design', () => {
  const p = M.makeProblem('warren', { FS: 1.5, K: 1 });
  const param = M.buildParametrization(p, M.defaultVariableSpec('warren'));
  const sizing = { mode: 'group', Amin: 10 };
  const f = x => M.evaluateGeometry(p, param.apply(x), sizing).objective;
  const nm = M.nelderMead(f, param.x0, param.lower, param.upper, {});
  const detail = M.evaluateGeometry(p, param.apply(nm.x), sizing);
  const ok = M.verifyDesign(p, detail.nodes, detail.areas);
  assert.ok(ok.feasible, ok.reason);
  assert.ok(Math.abs(ok.mass - detail.mass) < 1e-9);
  assert.ok(ok.governing.U > 0.999 && ok.governing.U <= 1 + M.U_TOL);
  const bad = M.verifyDesign(p, detail.nodes, detail.areas.map(a => 0.7 * a));
  assert.equal(bad.feasible, false);
  assert.ok(bad.reasons.length > 0);
  // preset areas on the Wright bay under the release model: slack wires are reported, not hidden
  const pw = M.makeProblem('wright-bay');
  const vw = M.verifyDesign(pw, pw.nodes0, M.presetAreas(pw), { slackMode: 'release' });
  assert.equal(vw.slackCount, 4);
  // a mechanism is a verification failure with a readable reason
  const vm = M.verifyDesign(p, p.nodes0.map(q => [q[0], 0]), M.presetAreas(p));
  assert.equal(vm.feasible, false);
  assert.match(vm.reason, /unstable|mechanism/);
});

test('runCampaign streams start, sweep, nm, cma and done, and supports cancellation', async () => {
  const payload = {
    presetKey: 'warren', FS: 1.5, K: 1, bucklingOn: true, sizing: { mode: 'group', Amin: 10 },
    variables: M.defaultVariableSpec('warren'), nm: { restarts: 0 }, cma: { generations: 10 }, seed: 12345, sweep: { enabled: true, samples: 20 },
  };
  const types = [];
  const out = await M.runCampaign(payload, m => types.push(m.type), () => false, () => Promise.resolve());
  assert.ok(out && out.nm && out.cma && out.sweep);
  for (const t of ['start', 'sweep', 'nm', 'cma', 'done']) assert.ok(types.includes(t), `missing message ${t}`);
  assert.ok(out.nm.trajectory.length >= 1 && out.nm.trajectory[0].nodes.length === 13);
  assert.ok(out.nm.design.feasible && out.cma.design.feasible);
  assert.ok(out.start.sized.mass > out.nm.design.mass);
  // cancellation after the first message
  let count = 0;
  const types2 = [];
  const out2 = await M.runCampaign(payload, m => { types2.push(m.type); count++; }, () => count > 0, () => Promise.resolve());
  assert.equal(out2, null);
  assert.ok(types2.includes('cancelled'));
});
