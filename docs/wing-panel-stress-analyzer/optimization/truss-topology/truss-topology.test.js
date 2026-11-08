// Tests for the ground-structure topology module. Run from /home/claude/optlab with
//   node --test optimization/truss-topology/truss-topology.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mod from './truss-topology.js';

const E = 68900, SIG = 276, RHO = 2.7;
const vopts = { E, sigmaT: SIG, sigmaC: SIG, rho: RHO };

function closeRel(a, b, rel, msg) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) / scale <= rel, `${msg || ''} expected ${a} ~ ${b} (rel ${rel}), got rel ${Math.abs(a - b) / scale}`);
}

// ---------------------------------------------------------------- ground structure

test('connectivity generator: counts and collinear duplicates skipped', () => {
  assert.equal(mod.generateMembers(7, 4, 1).length, 81);    // 24 + 21 + 2 x 18
  assert.equal(mod.generateMembers(7, 4, 2).length, 135);   // + 2 x 15 + 2 x 12
  assert.equal(mod.generateMembers(7, 4, 3).length, 197);
  const m2 = mod.generateMembers(7, 4, 2);
  // a level-2 member passing through an intermediate grid node (offsets with gcd > 1) is never added
  assert.ok(!m2.some(m => m.di === 2 && m.dj === 0), 'horizontal two-step member must be skipped');
  assert.ok(!m2.some(m => m.di === 0 && m.dj === 2), 'vertical two-step member must be skipped');
  assert.ok(!m2.some(m => m.di === 2 && Math.abs(m.dj) === 2), 'diagonal two-step member must be skipped');
  assert.ok(m2.some(m => m.di === 2 && m.dj === 1), 'knight move (2,1) must be present');
  assert.ok(m2.some(m => m.di === 1 && m.dj === -2), 'knight move (1,-2) must be present');
  for (const m of m2) assert.equal(mod.gcd(m.di, m.dj), 1);
  // each unordered pair exactly once
  const keys = new Set(m2.map(m => `${Math.min(m.i, m.j)}-${Math.max(m.i, m.j)}`));
  assert.equal(keys.size, m2.length);
});

test('equilibrium matrix times member forces reproduces the applied loads', () => {
  const ground = mod.buildGround({});
  const areas = new Float64Array(ground.members.length).fill(20);
  const sol = mod.solveElastic(ground, ground.members, areas, E);
  assert.ok(!sol.error, 'ground structure must be solvable');
  const { B, m, n } = mod.equilibriumMatrix(ground);
  let num = 0, den = 0;
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += B[i * n + k] * sol.N[k];
    const f = ground.loads[ground.freeDofs[i]];
    num += (s - f) ** 2; den += f * f;
  }
  assert.ok(Math.sqrt(num / den) < 1e-10, 'B N must equal f on the free dofs');
  // compliance equals the strain energy sum N^2 L / (E A)
  let Cse = 0;
  ground.members.forEach((mb, k) => { Cse += sol.N[k] ** 2 * mb.L / (E * areas[k]); });
  closeRel(Cse, sol.compliance, 1e-10, 'strain energy');
  // reactions balance the load (vertical): sum of fixed-dof reactions in y = +P
  let Ry = 0;
  for (let d = 1; d < 2 * ground.nodes.length; d += 2) if (ground.fixed[d]) Ry += sol.reactions[d];
  closeRel(Ry, 10000, 1e-10, 'vertical reaction');
});

test('direct stiffness matches the closed form of a two-bar truss', () => {
  // two bars at 45 degrees carrying a vertical load P: N = P / (2 sin 45), vertical deflection = N L / (E A sin 45) ... check force and compliance
  const h = 1000, P = 5000, A = 50;
  const g = mod.customGround({ nodes: [[0, 0], [2000, 0], [1000, h]], members: [[0, 2], [1, 2]], supports: { 0: [1, 1], 1: [1, 1] }, loads: { 2: [0, -P] } });
  const sol = mod.solveElastic(g, g.members, [A, A], E);
  const L = Math.hypot(1000, h), sin = h / L;
  closeRel(sol.N[0], -P / (2 * sin), 1e-12, 'bar force');
  closeRel(sol.N[1], -P / (2 * sin), 1e-12, 'bar force');
  // v = N L / (E A) / sin  (elongation projected), compliance = P v
  const v = (P / (2 * sin)) * L / (E * A) / sin;
  closeRel(sol.compliance, P * v, 1e-12, 'compliance');
});

// ---------------------------------------------------------------- simplex

function lpFromTextbook(rule) {
  // maximize 3x + 2y  s.t. x + y <= 4, x + 3y <= 6, x,y >= 0  ->  12 at (4, 0). Standard form with slacks s1, s2.
  const c = [-3, -2, 0, 0];
  const A = [1, 1, 1, 0, 1, 3, 0, 1];
  const b = [4, 6];
  return mod.solveLP(c, A, b, { rule });
}

test('simplex solves the textbook LP (both pivot rules)', () => {
  for (const rule of ['auto', 'bland', 'dantzig']) {
    const r = lpFromTextbook(rule);
    assert.equal(r.status, 'optimal', rule);
    closeRel(r.objective, -12, 1e-12, rule + ' objective');
    closeRel(r.x[0], 4, 1e-12, rule + ' x');
    assert.ok(Math.abs(r.x[1]) < 1e-12, rule + ' y');
  }
});

test('simplex reports infeasible and unbounded systems', () => {
  // x + y + s1 = 1, x - s2 = 2 : contradictory with x, y, s >= 0
  const inf = mod.solveLP([1, 1, 0, 0], [1, 1, 1, 0, 1, 0, 0, -1], [1, 2]);
  assert.equal(inf.status, 'infeasible');
  // minimize -x subject to x - y = 0 : unbounded
  const unb = mod.solveLP([-1, 0], [1, -1], [0]);
  assert.equal(unb.status, 'unbounded');
  // redundant row handled: x + y = 1 twice
  const red = mod.solveLP([1, 2], [1, 1, 1, 1], [1, 1]);
  assert.equal(red.status, 'optimal');
  closeRel(red.objective, 1, 1e-12);
});

test("simplex with Bland's rule terminates on Beale's cycling example", () => {
  // min -3/4 x4 + 20 x5 - 1/2 x6 + 6 x7
  // x1 + 1/4 x4 - 8 x5 - x6 + 9 x7 = 0 ; x2 + 1/2 x4 - 12 x5 - 1/2 x6 + 3 x7 = 0 ; x3 + x6 = 1
  const c = [0, 0, 0, -0.75, 20, -0.5, 6];
  const A = [
    1, 0, 0, 0.25, -8, -1, 9,
    0, 1, 0, 0.5, -12, -0.5, 3,
    0, 0, 1, 0, 0, 1, 0,
  ];
  for (const rule of ['bland', 'auto']) {
    const r = mod.solveLP(c, A, [0, 0, 1], { rule });
    assert.equal(r.status, 'optimal', rule);
    closeRel(r.objective, -1.25, 1e-12, rule);
  }
});

// ---------------------------------------------------------------- plastic design LP

test('LP on a three-node ground structure returns the two-bar truss with the analytic volume', () => {
  const P = 10000, h = 800, half = 1000;
  const g = mod.customGround({
    nodes: [[0, 0], [2 * half, 0], [half, h]], members: [[0, 2], [1, 2], [0, 1]],
    supports: { 0: [1, 1], 1: [1, 1] }, loads: { 2: [0, -P] },
  });
  const ell = Math.hypot(half, h);
  const sigT = 276, sigC = 138;
  const down = mod.plasticDesignLP(g, sigT, sigC);
  assert.equal(down.status, 'optimal');
  closeRel(down.volume, P * ell * ell / (h * sigC), 1e-9, 'compression volume');
  assert.ok(down.areas[2] === 0, 'bar between the supports carries nothing');
  closeRel(down.forces[0], -P * ell / (2 * h), 1e-9, 'bar force');
  assert.ok(down.residual < 1e-12);
  // load upward: the bars work in tension with the tensile allowable
  g.loads[5] = +P;
  const up = mod.plasticDesignLP(g, sigT, sigC);
  closeRel(up.volume, P * ell * ell / (h * sigT), 1e-9, 'tension volume');
  // a direct vertical bar above a support beats any two-bar path
  const g2 = mod.customGround({ nodes: [[0, 0], [1000, 0], [0, h]], members: [[0, 2], [1, 2], [0, 1]], supports: { 0: [1, 1], 1: [1, 1] }, loads: { 2: [0, -P] } });
  const direct = mod.plasticDesignLP(g2, sigT, sigT);
  closeRel(direct.volume, P * h / sigT, 1e-9, 'single bar volume');
  assert.ok(direct.areas[1] === 0 && direct.areas[2] === 0);
});

test('LP volume does not increase when the ground structure gets richer (nested candidate sets)', () => {
  const vols = [1, 2, 3].map(r => {
    const g = mod.buildGround({ nx: 5, ny: 3, r });
    const lp = mod.plasticDesignLP(g, SIG, SIG);
    assert.equal(lp.status, 'optimal');
    return lp.volume;
  });
  assert.ok(vols[1] <= vols[0] * (1 + 1e-9) && vols[2] <= vols[1] * (1 + 1e-9), `volumes ${vols}`);
});

// ---------------------------------------------------------------- optimality criteria

test('OC on the default cantilever: compliance non-increasing and volume constraint met', () => {
  const p = mod.normalizeParams({});
  const g = mod.buildGround(p);
  const Vt = p.volfrac * p.Aref * g.sumL;
  const oc = mod.optimizeOC(g, { E, Vt, Amin: p.aminFrac * p.Aref, maxIter: 200, tol: 1e-3, move: 0.2, eta: 0.5 });
  assert.ok(!oc.error);
  assert.ok(oc.converged, 'OC should converge within 200 iterations on the default case');
  assert.ok(oc.iterations <= 200);
  const h = oc.history;
  for (let k = 1; k < h.length; k++) {
    assert.ok(h[k].compliance <= h[k - 1].compliance * (1 + 1e-9), `compliance rose at iteration ${k}`);
    closeRel(h[k].volume, Vt, 1e-6, `volume at iteration ${k}`);
  }
  closeRel(oc.volume, Vt, 1e-6, 'final volume');
  assert.ok(h[h.length - 1].compliance < 0.5 * h[0].compliance, 'OC should reduce compliance substantially from the uniform start');
  for (const a of oc.areas) assert.ok(a >= p.aminFrac * p.Aref * (1 - 1e-12) && Number.isFinite(a));
});

// ---------------------------------------------------------------- thresholding, verification, pipeline

test('thresholding plus exact re-solve on the default case gives finite stresses and consistent checks', () => {
  const res = mod.runAll({});
  assert.ok(!res.error, res.message);
  for (const which of ['oc', 'lp']) {
    const v = res[which].verify;
    assert.ok(v.ok && v.stable, which + ' layout must verify as a stable truss');
    assert.ok(v.members.length > 0);
    for (const mb of v.members) {
      assert.ok(Number.isFinite(mb.N) && Number.isFinite(mb.sigma) && Number.isFinite(mb.U), 'finite member results');
      assert.ok(mb.A > 0);
    }
    assert.ok(v.mass > 0 && Number.isFinite(v.compliance));
    assert.ok(v.strainEnergyCheck < 1e-9, 'compliance equals strain energy');
    assert.ok(v.residual < 1e-9, 'equilibrium residual');
  }
  // LP layout is fully stressed: every kept member at the allowable, and C E / (sigma^2 V) = 1
  closeRel(res.lp.verify.Umax, 1, 1e-6, 'LP utilization');
  assert.ok(res.lp.verify.feasible);
  closeRel(res.michell.lpFullyStressed, 1, 1e-6, 'fully stressed identity');
  // OC compliance cannot beat the Michell bound (sigma V_LP)^2 / (E V)
  assert.ok(res.michell.ocRatio >= 1 - 1e-9, 'OC compliance below the Michell lower bound: ' + res.michell.ocRatio);
  assert.ok(res.michell.ocRatio < 1.05, 'OC should land close to the bound on the default case: ' + res.michell.ocRatio);
  // volume of the thresholded OC layout does not exceed the budget
  assert.ok(res.oc.verify.volume <= res.oc.Vt * (1 + 1e-9));
  // the LP minimum volume is a lower bound for any stress-feasible layout: scaled OC and scaled baseline weigh more
  assert.ok(res.oc.scaled.verify.mass >= res.lp.verify.mass * (1 - 1e-9));
  assert.ok(res.baseline.scaled.verify.mass >= res.lp.verify.mass * (1 - 1e-9));
  closeRel(res.baseline.scaled.verify.Umax, 1, 1e-9, 'scaled baseline at the allowable');
  assert.ok(res.gains.massSavedPct > 50);
  // CSV rows
  const rows = mod.membersCSVRows(res, 'lp');
  assert.equal(rows.length, res.lp.verify.members.length + 1);
  assert.equal(rows[0][0], 'design');
});

test('mechanism detection returns an error object instead of throwing', () => {
  // two squares side by side without diagonals, load on the top middle node: a sway mechanism that the load excites
  const g = mod.customGround({
    nodes: [[0, 0], [1000, 0], [2000, 0], [0, 1000], [1000, 1000], [2000, 1000]],
    members: [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5]],
    supports: { 0: [1, 1], 2: [0, 1] }, loads: { 4: [3000, -10000] },
  });
  const layout = { members: g.members.map(mb => Object.assign({}, mb, { A: 10 })) };
  const v = mod.verifyLayout(g, layout, vopts);
  assert.equal(v.ok, false);
  assert.equal(v.error, 'mechanism');
  assert.match(v.message, /kinematically unstable, lower the threshold/);
  assert.ok(Array.isArray(v.movingNodes) && v.movingNodes.length > 0, 'mechanism mode reports moving nodes');
  // a roller hanging on a single vertical bar: singular stiffness, but a vertical load is orthogonal to the sway mode
  const g2 = mod.customGround({
    nodes: [[0, 0], [1000, 0], [1000, 1000]], members: [[0, 2], [1, 2]],
    supports: { 0: [1, 1], 1: [0, 1] }, loads: { 2: [0, -5000] },
  });
  const v2 = mod.verifyLayout(g2, { members: g2.members.map(mb => Object.assign({}, mb, { A: 10 })) }, vopts);
  assert.equal(v2.ok, true);
  assert.equal(v2.stable, false);
  assert.equal(v2.feasible, false, 'an unstable layout is never reported feasible');
  closeRel(v2.members[1].N, -5000, 1e-9, 'vertical bar takes the whole load');
  assert.ok(Math.abs(v2.members[0].N) < 1e-6, 'diagonal carries nothing');
  // and the pipeline-level helper lowers the threshold when the thresholded layout is unstable
  const gd = mod.buildGround({ r: 3 });
  const p = mod.normalizeParams({ r: 3 });
  const oc = mod.optimizeOC(gd, { E, Vt: p.volfrac * p.Aref * gd.sumL, Amin: p.aminFrac * p.Aref, maxIter: 200, tol: 1e-3 });
  const tv = mod.thresholdAndVerify(gd, oc.areas, 0.02, vopts, 'OC layout');
  assert.ok(tv.verify.ok && tv.verify.stable);
  assert.ok(tv.thetaUsed <= 0.02);
  if (tv.thetaUsed !== 0.02) assert.match(tv.warning, /kinematically unstable, lower the threshold/);
});

test('verification rejects an infeasible design and accepts the scaled one', () => {
  const g = mod.buildGround({});
  const tiny = mod.thresholdLayout(g, new Float64Array(g.members.length).fill(1), 0, { merge: false, dropDangling: false });
  const v = mod.verifyLayout(g, tiny, vopts);
  assert.ok(v.ok && v.stable);
  assert.equal(v.feasible, false);
  assert.ok(v.Umax > 1);
  assert.ok(v.governing >= 0);
  const scaled = mod.verifyLayout(g, mod.scaleLayout(tiny, v.Umax), vopts);
  assert.ok(scaled.feasible);
  closeRel(scaled.Umax, 1, 1e-9);
  closeRel(scaled.mass, v.mass * v.Umax, 1e-12, 'mass scales linearly');
});

test('invalid inputs are reported as readable errors, not exceptions', () => {
  const bad = mod.validateParams(mod.normalizeParams({ nx: 2, P: 0, loadIx: 99, aminFrac: 0.5, theta: 1.5, W: -5 }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 5);
  for (const e of bad.errors) assert.equal(typeof e, 'string');
  const r = mod.runAll({ nx: 2 });
  assert.equal(r.error, 'invalid');
  // a load acting only on fixed dofs of a support node does no work
  const fixedLoad = mod.validateParams(mod.normalizeParams({ support: 'cantilever', loadIx: 0, loadIy: 1 }));
  assert.equal(fixedLoad.ok, false);
  assert.ok(fixedLoad.errors.some(e => /does no work/.test(e)));
  // NaN-producing inputs
  const nan = mod.validateParams(mod.normalizeParams({ H: 'abc', sigmaT: -1 }));
  assert.equal(nan.ok, false);
  assert.ok(mod.validateParams(mod.normalizeParams({})).ok);
});

test('all support presets run end to end with verified layouts', () => {
  for (const support of ['cantilever', 'simply', 'mbb']) {
    const res = mod.runAll({ support });
    assert.ok(!res.error, support);
    assert.equal(res.lp.status, 'optimal', support);
    assert.ok(res.oc.verify.ok && res.oc.verify.stable, support + ' OC layout');
    assert.ok(res.lp.verify.ok, support + ' LP layout');
    closeRel(res.lp.verify.Umax, 1, 1e-6, support + ' LP fully stressed');
    assert.ok(res.michell.ocRatio >= 1 - 1e-9, support + ' Michell bound');
  }
});
