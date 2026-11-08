// Tests for the truss-failsafe module. Run from /home/claude/optlab with:
//   node --test optimization/truss-failsafe/truss-failsafe.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './truss-failsafe.js';
import { makeRng as labkitRng } from '../shared/labkit.js';
import { MATERIALS } from '../shared/presets.js';

const OPTS = { FS: 1.5, buckling: true, K: 1 };

function presetCases(model, mult = 1) {
  return model.caseNames.map(name => ({ name, loads: model.loadCases[name], mult }));
}

// Two-node single bar hanging a load: top node pinned, bottom node fixed in x, free in y.
function singleBarPreset(A0 = 100, L = 1000, P = 1000, material = 'al6061') {
  return {
    key: 'single-bar',
    nodes: [[0, L], [0, 0]],
    members: [[0, 1, 'bar']],
    groups: { bar: { material, A0, tensionOnly: false, buckling: 'none' } },
    supports: { 0: [1, 1], 1: [1, 0] },
    loads: { 1: [0, -P] },
    loadCases: { 'pull': { 1: [0, -P] } },
  };
}

// Symmetric two-bar truss: bars from (-a, 0) and (a, 0) to the apex (0, h), load P downward at the apex.
function twoBarPreset(a = 1000, h = 1000, P = 2000, A0 = 200) {
  return {
    key: 'two-bar',
    nodes: [[-a, 0], [a, 0], [0, h]],
    members: [[0, 2, 'bar'], [1, 2, 'bar']],
    groups: { bar: { material: 'al6061', A0, tensionOnly: false, buckling: 'square' } },
    supports: { 0: [1, 1], 1: [1, 1] },
    loads: { 2: [0, -P] },
    loadCases: { 'down': { 2: [0, -P] } },
  };
}

test('single bar: displacement PL/(EA) and stress P/A match the closed form', () => {
  const A0 = 100, L = 1000, P = 1000;
  const model = M.buildModel(singleBarPreset(A0, L, P));
  const res = M.solveTruss(model, [A0], model.loadCases['pull'], { FS: 1, buckling: false });
  assert.equal(res.ok, true);
  const E = MATERIALS.al6061.E;
  assert.ok(Math.abs(res.u[3] - (-P * L / (E * A0))) < 1e-12, 'vertical displacement of the loaded node');
  assert.ok(Math.abs(res.N[0] - P) < 1e-9, 'tension equals the load');
  assert.ok(Math.abs(res.sigma[0] - P / A0) < 1e-12, 'stress P/A');
  assert.ok(Math.abs(res.U[0] - P / (A0 * MATERIALS.al6061.sigmaAllow)) < 1e-12, 'utilization with FS = 1');
  assert.ok(Math.abs(res.reactions[0][1] - P) < 1e-9, 'vertical reaction at the pinned node');
});

test('two-bar truss: member forces and apex deflection match the closed form', () => {
  const a = 1000, h = 1000, P = 2000, A0 = 200;
  const model = M.buildModel(twoBarPreset(a, h, P, A0));
  const res = M.solveTruss(model, [A0, A0], model.loadCases['down'], { FS: 1, buckling: false });
  assert.equal(res.ok, true);
  const L = Math.hypot(a, h), E = MATERIALS.al6061.E;
  const Nexp = -P * L / (2 * h);
  assert.ok(Math.abs(res.N[0] - Nexp) < 1e-9 && Math.abs(res.N[1] - Nexp) < 1e-9, 'compression P L / (2 h) in each bar');
  const vexp = -P * L ** 3 / (2 * E * A0 * h * h);
  assert.ok(Math.abs(res.u[5] - vexp) < 1e-12, 'apex deflection P L^3 / (2 E A h^2)');
  assert.ok(Math.abs(res.u[4]) < 1e-12, 'no horizontal apex motion by symmetry');
});

test('Euler buckling screen: P_cr = pi^2 E I / (K L)^2 with I = A^2/12 and the compression utilization', () => {
  const a = 1000, h = 1000, P = 2000, A0 = 200;
  const model = M.buildModel(twoBarPreset(a, h, P, A0));
  for (const K of [1, 0.7, 2]) {
    const res = M.solveTruss(model, [A0, A0], model.loadCases['down'], { FS: 1.5, buckling: true, K });
    const L = Math.hypot(a, h), E = MATERIALS.al6061.E;
    const Pcr = Math.PI ** 2 * E * (A0 * A0 / 12) / (K * L) ** 2;
    assert.ok(Math.abs(res.Pcr[0] - Pcr) / Pcr < 1e-12, 'critical load');
    const Ub = Math.abs(res.N[0]) * 1.5 / Pcr, Us = Math.abs(res.N[0]) * 1.5 / (A0 * MATERIALS.al6061.sigmaAllow);
    assert.ok(Math.abs(res.Ubuckle[0] - Ub) < 1e-12 && Math.abs(res.Ustress[0] - Us) < 1e-12);
    assert.ok(Math.abs(res.U[0] - Math.max(Ub, Us)) < 1e-12, 'U = max(stress, buckling)');
  }
  const off = M.solveTruss(model, [A0, A0], model.loadCases['down'], { FS: 1.5, buckling: false });
  assert.equal(off.Ubuckle[0], 0, 'buckling screen off uses the stress check only');
});

test('mechanisms and bad inputs are reported as errors, never thrown', () => {
  // square frame without a diagonal: a four-bar mechanism
  const sq = M.buildModel({
    key: 'square', nodes: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
    members: [[0, 1, 'g'], [1, 2, 'g'], [2, 3, 'g']],
    groups: { g: { material: 'steel', A0: 100, tensionOnly: false, buckling: 'none' } },
    supports: { 0: [1, 1], 3: [1, 1] }, loads: { 2: [500, 0] }, loadCases: { 'push': { 2: [500, 0] } },
  });
  const r1 = M.solveTruss(sq, [100, 100, 100], sq.loadCases['push'], OPTS);
  assert.equal(r1.ok, false);
  assert.equal(r1.mechanism, true);
  assert.match(r1.error, /unstable structure/);
  // free node without members
  const dangling = M.buildModel({
    key: 'dangling', nodes: [[0, 0], [1000, 0], [2000, 0]], members: [[0, 1, 'g']],
    groups: { g: { material: 'steel', A0: 100, tensionOnly: false, buckling: 'none' } },
    supports: { 0: [1, 1] }, loads: { 1: [100, 0] }, loadCases: { 'c': { 1: [100, 0] } },
  });
  const r2 = M.solveTruss(dangling, [100], dangling.loadCases['c'], OPTS);
  assert.equal(r2.ok, false);
  // bad numbers
  const model = M.buildModel('wright-bay');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  assert.equal(M.solveTruss(model, A, model.loadCases['point lift'], { FS: 0 }).ok, false);
  assert.equal(M.solveTruss(model, A, model.loadCases['point lift'], { FS: NaN }).ok, false);
  assert.equal(M.solveTruss(model, A.map((a, i) => (i === 0 ? NaN : a)), model.loadCases['point lift'], OPTS).ok, false);
  assert.equal(M.solveTruss(model, A, model.loadCases['point lift'], { FS: 1.5, K: -1 }).ok, false);
  const v = M.validateInputs({ FS: -1, groupAreas: { spar: 'abc' }, covLoad: 3, n: 10.5, seed: 1.2 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.length >= 5);
  assert.equal(M.validateInputs({ FS: 1.5, groupAreas: { spar: 2000 }, covLoad: 0.1, n: 5000, seed: 1 }).ok, true);
});

test('wright-bay: removing one bracing wire leaves a stable structure, removing the root spar segment does not', () => {
  const model = M.buildModel('wright-bay');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  const loads = model.loadCases['point lift'];
  const base = M.solveTruss(model, A, loads, OPTS);
  assert.equal(base.ok, true);
  assert.equal(base.redundancy, 5, 'm + r - 2j = 21 + 4 - 20');
  const idx = label => model.members.findIndex(m => m.label === label);
  for (const wire of ['wire 0-6', 'wire 5-1', 'wire 2-8']) {
    const Ad = A.slice(); Ad[idx(wire)] = 0;
    const res = M.solveTruss(model, Ad, loads, OPTS);
    assert.equal(res.ok, true, `${wire} removal must still solve`);
    assert.ok(res.u.every(Number.isFinite), 'finite displacements');
    assert.ok(res.refDisp.mag < 3 * base.refDisp.mag, 'tip displacement stays bounded');
  }
  const Ad = A.slice(); Ad[idx('spar 0-1')] = 0;
  const res = M.solveTruss(model, Ad, loads, OPTS);
  assert.ok(res.ok === false || res.maxU > 2 * base.maxU, 'root spar removal gives a mechanism or a utilization spike');
  const map = M.failSafeMap(model, A, loads, OPTS);
  assert.equal(map.ok, true);
  const row = map.byMember[idx('spar 0-1')];
  assert.ok(row.consequence === 'collapse' || row.consequence === 'overload');
  assert.ok(map.byMember[idx('wire 0-6')].consequence === 'ok');
  assert.ok(map.damageToleranceIndex > 0.5 && map.damageToleranceIndex < 1);
  assert.equal(map.counts.ok + map.counts.overload + map.counts.collapse, model.members.length);
  // rows sorted by criticality: collapse first, then descending max U
  for (let i = 1; i < map.rows.length; i++) {
    const p = map.rows[i - 1], q = map.rows[i];
    const rank = { collapse: 0, overload: 1, ok: 2 };
    assert.ok(rank[p.consequence] < rank[q.consequence] || (rank[p.consequence] === rank[q.consequence] && p.maxU >= q.maxU - 1e-12));
  }
});

test('tension-only wire model: slack wires are dropped, removing the taut wire of a bay collapses the bay', () => {
  const model = M.buildModel('wright-bay');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  const loads = model.loadCases['point lift'];
  const opts = Object.assign({}, OPTS, { wireModel: 'tension-only' });
  const res = M.solveTruss(model, A, loads, opts);
  assert.equal(res.ok, true);
  const idx = label => model.members.findIndex(m => m.label === label);
  assert.equal(res.dropped[idx('wire 5-1')], true);
  assert.equal(res.N[idx('wire 5-1')], 0);
  assert.equal(res.dropped[idx('wire 0-6')], false);
  assert.ok(res.N[idx('wire 0-6')] > 0);
  assert.ok(res.N[idx('strut 1-6')] < -1000, 'struts now carry the lift of the lower nodes up to the taut wires');
  const lin = M.solveTruss(model, A, loads, OPTS);
  assert.ok(Math.abs(res.N[idx('wire 0-6')] - 2 * lin.N[idx('wire 0-6')]) / res.N[idx('wire 0-6')] < 0.02, 'taut wire carries about twice the linear-model share');
  const map = M.failSafeMap(model, A, loads, opts);
  assert.equal(map.byMember[idx('wire 0-6')].consequence, 'collapse');
  assert.equal(map.byMember[idx('wire 5-1')].consequence, 'ok');
  assert.equal(map.byMember[idx('strut 1-6')].consequence, 'collapse');
  assert.ok(map.damageToleranceIndex < 0.5);
});

test('warren truss is statically determinate: every single-member removal is a mechanism', () => {
  const model = M.buildModel('warren');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  assert.equal(M.redundancyCount(model, A), 0);
  const map = M.failSafeMap(model, A, model.loadCases['uniform'], OPTS);
  assert.equal(map.ok, true);
  assert.equal(map.counts.collapse, model.members.length);
  assert.equal(map.damageToleranceIndex, 0);
  // classical method of sections on the baseline: reactions 5000 N each; bottom chord 2-3 from the moment about
  // top node 9 (x = 2500): (5000 * 2500 - 2000 * 1500 - 2000 * 500) / 1000 = 8500 N;
  // top chord 9-10 from the moment about bottom node 3 (x = 3000): -(5000 * 3000 - 2000 * 2000 - 2000 * 1000) / 1000 = -9000 N;
  // end diagonal 0-7 carries the shear 5000 N: N = -5000 * L / h = -5000 * sqrt(500^2 + 1000^2) / 1000.
  const base = map.baseline;
  assert.ok(Math.abs(base.N[2] - 8500) < 1e-6, 'bottom chord 2-3 carries 8500 N');
  assert.ok(Math.abs(base.N[8] + 9000) < 1e-6, 'top chord 9-10 carries -9000 N');
  assert.ok(Math.abs(base.N[11] + 5000 * Math.hypot(500, 1000) / 1000) < 1e-6, 'end diagonal carries the support shear');
  assert.ok(Math.abs(base.reactions[0][1] - 5000) < 1e-6 && Math.abs(base.reactions[6][1] - 5000) < 1e-6, 'reactions');
});

test('load-case envelope equals the elementwise maximum over the cases and finds the governing case', () => {
  const model = M.buildModel('wright-bay');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  const cases = presetCases(model);
  cases[1].mult = 1.3;
  const env = M.loadCaseEnvelope(model, A, cases, OPTS);
  assert.equal(env.ok, true);
  for (let i = 0; i < model.members.length; i++) {
    const direct = cases.map(c => M.solveTruss(model, A, M.scaleLoads(c.loads, c.mult), OPTS).U[i]);
    const mx = Math.max(...direct);
    assert.equal(env.envelope[i], mx);
    assert.equal(env.Ucase[i].length, cases.length);
    assert.ok(direct[env.governingCase[i]] === mx);
  }
  assert.ok(Math.abs(env.caseMax[1] - 1.3 * M.solveTruss(model, A, cases[1].loads, OPTS).maxU) < 1e-12, 'linear scaling with the multiplier');
});

test('single-case FSD then check under negative g: flagged members agree with a direct check and include a buckling failure', () => {
  const model = M.buildModel('wright-bay');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  const cases = presetCases(model);
  const fsd = M.fullyStressedDesign(model, A, [cases[0]], OPTS);
  assert.equal(fsd.ok, true);
  assert.equal(fsd.verify.feasible, false, 'compressed wires prevent physical admission even when the linear constraints pass');
  assert.match(fsd.verify.error, /Compressed wires/);
  assert.ok(fsd.verify.envelope.every(u => u <= 1 + 1e-9));
  assert.ok(Math.abs(Math.max(...fsd.verify.envelope) - 1) < 1e-6, 'fully stressed: the governing member sits at U = 1 (after the uniform polish if the iteration had not converged)');
  assert.equal(fsd.verify.governing.U, Math.max(...fsd.verify.envelope));
  assert.ok(fsd.A.every((a, i) => a >= 0.2 * model.groups[model.members[i].group].A0 - 1e-9), 'A_min clamp respected');
  const neg = cases.find(c => c.name === 'negative g (-1 g)');
  const cc = M.crossCheck(model, fsd.A, [neg], OPTS);
  const direct = M.solveTruss(model, fsd.A, neg.loads, OPTS);
  const directFlags = model.members.map((m, i) => direct.U[i] > 1 + 1e-9 ? i : -1).filter(i => i >= 0).sort((p, q) => p - q);
  const flagged = cc[0].failing.map(f => f.member).sort((p, q) => p - q);
  assert.deepEqual(flagged, directFlags);
  assert.ok(flagged.length >= 1, 'with the buckling screen on, the thin lower spar fails in compression under -1 g');
  assert.ok(cc[0].failing.some(f => f.mode === 'buckling'));
  // with the buckling screen off the same comparison must still be self-consistent (possibly no failures)
  const noB = Object.assign({}, OPTS, { buckling: false });
  const fsdNoB = M.fullyStressedDesign(model, A, [cases[0]], noB);
  const ccNoB = M.crossCheck(model, fsdNoB.A, [neg], noB);
  const dNoB = M.solveTruss(model, fsdNoB.A, neg.loads, noB);
  assert.deepEqual(ccNoB[0].failing.map(f => f.member).sort((p, q) => p - q), model.members.map((m, i) => dNoB.U[i] > 1 + 1e-9 ? i : -1).filter(i => i >= 0));
});

test('FSD on the determinate warren truss converges in two iterations to U = 1 and the known minimum mass', () => {
  const model = M.buildModel('warren');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  const cases = presetCases(model);
  const fsd = M.fullyStressedDesign(model, A, [cases[0]], OPTS);
  assert.equal(fsd.ok, true);
  assert.ok(fsd.iterations <= 2 && fsd.converged, 'forces do not depend on areas in a determinate truss');
  assert.ok(Math.abs(fsd.polishScale - 1) < 1e-9);
  assert.ok(Math.abs(fsd.envelope.maxU - 1) < 1e-9);
  // closed form: A_i = max(A_min, |N_i| FS / sigma, sqrt(12 |N_i| FS (K L)^2 / (pi^2 E))) from the baseline forces
  const base = M.solveTruss(model, A, cases[0].loads, OPTS);
  const E = MATERIALS.al6061.E, sA = MATERIALS.al6061.sigmaAllow;
  let massExp = 0;
  model.members.forEach((m, i) => {
    const N = Math.abs(base.N[i]);
    let a = N * 1.5 / sA;
    if (base.N[i] < 0) a = Math.max(a, Math.sqrt(12 * N * 1.5 * m.L * m.L / (Math.PI ** 2 * E)));
    a = Math.max(a, 0.2 * 300);
    assert.ok(Math.abs(fsd.A[i] - a) / a < 1e-9, `member ${m.label} area`);
    massExp += a * m.L * MATERIALS.al6061.rho / 1000;
  });
  assert.ok(Math.abs(fsd.mass - massExp) / massExp < 1e-9, 'mass = sum A L rho / 1000');
  const env = M.fullyStressedDesign(model, A, cases, OPTS);
  assert.ok(env.ok && env.verify.feasible);
  assert.ok(env.mass >= fsd.mass, 'envelope sizing can only add mass');
  const cc = M.crossCheck(model, env.A, cases, OPTS);
  assert.ok(cc.every(c => c.ok && c.failing.length === 0), 'envelope-sized design passes every case');
});

test('verifyDesign rejects an infeasible design and accepts a feasible one', () => {
  const model = M.buildModel('wright-bay');
  const A = M.memberAreasFromGroups(model, M.defaultGroupAreas(model));
  const cases = presetCases(model);
  const linear = M.verifyDesign(model, A, cases, OPTS);
  assert.equal(linear.feasible, false);
  assert.match(linear.error, /Compressed wires/);
  const good = M.verifyDesign(model, A, [cases[0]], {...OPTS, wireModel: 'tension-only'});
  assert.equal(good.feasible, true);
  assert.ok(good.governing && good.governing.U < 1);
  const bad = M.verifyDesign(model, A.map(a => a / 10), cases, OPTS);
  assert.equal(bad.feasible, false);
  assert.ok(bad.governing.U > 1);
  const broken = M.verifyDesign(model, A.map((a, i) => (i === 8 || i === 9 ? 0 : a)), cases, Object.assign({}, OPTS, { wireModel: 'tension-only' }));
  assert.equal(broken.feasible, false);
  assert.match(broken.error || '', /unstable|point lift|landing|negative|distributed/);
});

test('group-wise sizing helper produces a verified design with the governing member at U = 1', () => {
  const model = M.buildModel('wright-bay');
  const cases = presetCases(model);
  const s = M.sizeGroupAreas(model, M.defaultGroupAreas(model), [cases[0]], {...OPTS, wireModel: 'tension-only'});
  assert.equal(s.ok, true);
  assert.equal(s.verify.feasible, true);
  assert.ok(Math.abs(s.verify.governing.U - 1) < 1e-6);
  assert.ok(s.groupAreas.spar < 2000 && s.groupAreas.wire < 5);
});

test('Monte Carlo with all CoVs zero reproduces the deterministic max U exactly and gives P_f of 0 or 1 consistently', () => {
  const OPTS = { FS: 1.5, buckling: true, K: 1, wireModel: 'tension-only' };
  const model = M.buildModel('wright-bay');
  const cases = presetCases(model);
  const zero = { spar: 0, strut: 0, wire: 0 };
  for (const [A, label] of [[M.memberAreasFromGroups(model, M.defaultGroupAreas(model)), 'student'], [M.sizeGroupAreas(model, M.defaultGroupAreas(model), [cases[0]], OPTS).A, 'sized'], [M.memberAreasFromGroups(model, { spar: 300, strut: 240, wire: 1 }), 'thin']]) {
    const det = M.solveTruss(model, A, cases[0].loads, OPTS);
    const r = M.runReliabilityStudy(model, A, cases[0].loads, OPTS, { n: 200, seed: 7, covE: zero, covSigma: zero, covLoad: 0 });
    assert.equal(r.main.maxUmax, det.maxU, `${label}: max of samples equals the deterministic max U`);
    assert.equal(r.main.maxUmin, det.maxU, `${label}: every sample equals the deterministic max U`);
    assert.equal(r.deterministicCheck.exact, true);
    assert.equal(r.main.pfDesign, det.feasible ? 0 : 1, `${label}: P(design criterion violated)`);
    assert.equal(r.main.pfLimit, det.maxU > 1.5 * (1 + 1e-9) ? 1 : 0, `${label}: P(limit state exceeded)`);
    assert.equal(r.main.ciDesign[0] <= r.main.pfDesign && r.main.pfDesign <= r.main.ciDesign[1], true);
  }
});

test('lognormal sampler: mean within 2 percent and CoV within 10 percent on 20000 samples', () => {
  const rng = M.makeRng(3);
  const mean = 10000, cov = 0.10, n = 20000;
  let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const x = M.sampleLognormal(rng, mean, cov); s += x; s2 += x * x; }
  const m = s / n, sd = Math.sqrt((s2 - n * m * m) / (n - 1));
  assert.ok(Math.abs(m - mean) / mean < 0.02, `mean ${m}`);
  assert.ok(Math.abs(sd / m - cov) / cov < 0.10, `CoV ${sd / m}`);
  assert.equal(M.sampleLognormal(rng, 42, 0), 42, 'zero CoV returns the mean exactly');
  const p = M.lognormalParams(mean, cov);
  assert.ok(Math.abs(Math.exp(p.mu + p.sigma * p.sigma / 2) - mean) / mean < 1e-12, 'parameters preserve the mean');
});

test('normal distribution helpers: Phi^-1(0.975) = 1.95996 and Phi(1.96) = 0.975 within 1e-4', () => {
  assert.ok(Math.abs(M.normalInv(0.975) - 1.959964) < 1e-4);
  assert.ok(Math.abs(M.normalCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(M.normalInv(0.5)) < 1e-9);
  assert.ok(Math.abs(M.normalCdf(0) - 0.5) < 1e-9);
  for (const p of [1e-6, 0.001, 0.02, 0.3, 0.7, 0.99, 0.999999]) {
    assert.ok(Math.abs(M.normalCdf(M.normalInv(p)) - p) < 2e-7, `round trip at ${p}`);
  }
  assert.equal(M.betaFromPf(0), Infinity);
  assert.ok(Math.abs(M.betaFromPf(0.00135) - 3.0) < 2e-3, 'beta = 3 for P_f = 0.135 percent');
  assert.ok(Math.abs(M.erf(0.5) - 0.5204998778) < 1e-6);
});

test('Wilson interval: contains the point estimate, k = 0 gives the z^2/(n + z^2) upper bound', () => {
  const z = 1.959963984540054;
  const w0 = M.wilsonInterval(0, 5000, z);
  assert.equal(w0.p, 0);
  assert.equal(w0.lo, 0);
  assert.ok(Math.abs(w0.hi - z * z / (5000 + z * z)) < 1e-12);
  const w = M.wilsonInterval(50, 1000, z);
  assert.ok(w.lo < 0.05 && 0.05 < w.hi);
  assert.ok(w.lo > 0.037 && w.hi < 0.066, 'about 0.038 to 0.065 for 50/1000');
  const w1 = M.wilsonInterval(1000, 1000, z);
  assert.equal(w1.hi, 1);
});

test('Monte Carlo on a single bar agrees with the lognormal closed form within 4 standard errors', () => {
  // choose U0 so that the limit-state failure probability is moderate and well resolved by 20000 samples
  const A0 = 100, L = 1000, sigmaAllow = MATERIALS.al6061.sigmaAllow;
  const FS = 1.5, targetU = 0.9; // theta_limit = FS / U0 = 1.667
  const P = targetU * A0 * sigmaAllow / FS;
  const model = M.buildModel(singleBarPreset(A0, L, P));
  const VR = 0.15, VS = 0.15, n = 20000;
  const r = M.runReliabilityStudy(model, [A0], model.loadCases['pull'], { FS, buckling: false }, { n, seed: 11, covE: { bar: 0.1 }, covSigma: { bar: VR }, covLoad: VS, sensitivity: false });
  const det = M.solveTruss(model, [A0], model.loadCases['pull'], { FS, buckling: false });
  assert.ok(Math.abs(det.maxU - targetU) < 1e-9);
  const betaL = M.lognormalReliabilityIndex(FS / targetU, VR, VS);
  const pL = M.normalCdf(-betaL);
  const seL = Math.sqrt(pL * (1 - pL) / n);
  assert.ok(Math.abs(r.main.pfLimit - pL) < 4 * seL + 2e-4, `limit state: MC ${r.main.pfLimit} vs closed form ${pL}`);
  const betaD = M.lognormalReliabilityIndex(1 / targetU, VR, VS);
  const pD = M.normalCdf(-betaD);
  const seD = Math.sqrt(pD * (1 - pD) / n);
  assert.ok(Math.abs(r.main.pfDesign - pD) < 4 * seD + 2e-4, `design criterion: MC ${r.main.pfDesign} vs closed form ${pD}`);
  assert.ok(Math.abs(r.closedForm.boundsLimit[0] - pL) < 1e-12 && Math.abs(r.closedForm.boundsLimit[1] - pL) < 1e-12, 'single member: bounds collapse to the closed form');
  // E scatter does not matter for a stress-governed determinate bar
  assert.equal(r.stages.length, 2);
});

test('series-system bounds bracket the Monte Carlo estimate on the determinate warren truss', () => {
  const model = M.buildModel('warren');
  const cases = presetCases(model);
  const s = M.sizeGroupAreas(model, M.defaultGroupAreas(model), [cases[0]], {...OPTS, wireModel: 'tension-only'});
  const cov = { chord: 0.12, diag: 0.12 };
  const n = 20000;
  const r = M.runReliabilityStudy(model, s.A, cases[0].loads, OPTS, { n, seed: 5, covE: cov, covSigma: cov, covLoad: 0.12, sensitivity: false });
  const [lo, hi] = r.closedForm.boundsLimit;
  const se = Math.sqrt(Math.max(r.main.pfLimit, 1e-4) * (1 - r.main.pfLimit) / n);
  assert.ok(r.main.pfLimit >= lo - 4 * se, `P_f ${r.main.pfLimit} below the lower bound ${lo}`);
  assert.ok(r.main.pfLimit <= hi + 4 * se, `P_f ${r.main.pfLimit} above the upper bound ${hi}`);
  assert.ok(r.main.pfLimit > 0, 'the sized design shows some failures with 12 percent scatter');
  assert.ok(r.histogram.counts.reduce((a, b) => a + b, 0) === n);
  assert.ok(r.convergence.n[r.convergence.n.length - 1] === n);
});

test('sensitivity stages use common random numbers and the deterministic stage is exact', () => {
  const OPTS = { FS: 1.5, buckling: true, K: 1, wireModel: 'tension-only' };
  const model = M.buildModel('wright-bay');
  const cases = presetCases(model);
  const A = M.sizeGroupAreas(model, M.defaultGroupAreas(model), [cases[0]], OPTS).A;
  const cov = { spar: 0.1, strut: 0.1, wire: 0.03 };
  const r = M.runReliabilityStudy(model, A, cases[0].loads, OPTS, { n: 2000, seed: 1, covE: cov, covSigma: cov, covLoad: 0.1 });
  assert.equal(r.stages.length, 5);
  assert.equal(r.sensitivity.length, 4);
  assert.equal(r.deterministicCheck.exact, true);
  const allOff = r.stages[4];
  assert.equal(allOff.maxUmin, allOff.maxUmax);
  // the load-off stage removes most of the scatter here: its max U spread must be smaller than the full run
  assert.ok(r.stages[3].maxUstd < r.main.maxUstd);
  // reproducibility
  const r2 = M.runReliabilityStudy(model, A, cases[0].loads, OPTS, { n: 2000, seed: 1, covE: cov, covSigma: cov, covLoad: 0.1 });
  assert.equal(r2.main.pfLimit, r.main.pfLimit);
  assert.equal(r2.main.maxUmean, r.main.maxUmean);
  // stepper interface
  const st = M.createReliabilityStudy(model, A, cases[0].loads, OPTS, { n: 500, seed: 2, covE: cov, covSigma: cov, covLoad: 0.1 });
  let steps = 0;
  while (!st.finished) { st.step(120); steps++; }
  assert.ok(steps >= 20 && st.done === st.total);
  assert.equal(st.result().stages[0].n, 500);
});

test('mulberry32 copy matches the labkit generator sequence for the same seed', () => {
  const a = M.makeRng(2024), b = labkitRng(2024);
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});
