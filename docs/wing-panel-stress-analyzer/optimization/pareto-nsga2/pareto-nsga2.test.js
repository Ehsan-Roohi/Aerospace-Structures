// Tests for the pareto-nsga2 module. Run from /home/claude/optlab with:
//   node --test optimization/pareto-nsga2/pareto-nsga2.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from './pareto-nsga2.js';
import { MATERIALS } from '../shared/presets.js';

const approx = (a, b, rel = 1e-9, msg = '') => {
  const tol = rel * Math.max(1, Math.abs(a), Math.abs(b));
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
};

// ---------------- non-dominated utilities ----------------

test('fast non-dominated sort recovers the known fronts of a 6-point set', () => {
  // A(1,5) B(2,3) C(4,1) are mutually non-dominated; D(3,4) is dominated by B; E(5,2) by C; F(6,6) by D and E.
  const pts = [[1, 5], [2, 3], [4, 1], [3, 4], [5, 2], [6, 6]].map(f => ({ f }));
  const fronts = m.fastNonDominatedSort(pts);
  assert.deepEqual(fronts.map(fr => fr.slice().sort()), [[0, 1, 2], [3, 4], [5]]);
  assert.deepEqual(pts.map(p => p.rank), [0, 0, 0, 1, 1, 2]);
});

test('dominance relation is strict and antisymmetric', () => {
  assert.equal(m.dominates([1, 2], [1, 2]), false);
  assert.equal(m.dominates([1, 2], [1, 3]), true);
  assert.equal(m.dominates([1, 3], [1, 2]), false);
  assert.equal(m.dominates([0, 5], [5, 0]), false);
});

test('crowding distance assigns infinity to the extremes and finite values inside', () => {
  const pts = [[0, 10], [1, 6], [2, 3], [4, 1], [5, 0]].map(f => ({ f }));
  const dist = m.crowdingDistance(pts, [0, 1, 2, 3, 4]);
  assert.equal(dist[0], Infinity);
  assert.equal(dist[4], Infinity);
  for (const k of [1, 2, 3]) assert.ok(Number.isFinite(dist[k]) && dist[k] > 0, `interior distance ${k} finite`);
  // point 2 has neighbours (1,6) and (4,1): (4-1)/5 + (6-1)/10 = 0.6 + 0.5
  approx(dist[2], 1.1, 1e-12, 'crowding of the middle point');
  assert.equal(pts[2].crowd, dist[2]);
});

test('constraint-domination prefers feasible designs and smaller violation', () => {
  const feasibleWorse = { f: [10, 10], cv: 0, rank: 0, crowd: 1 };
  const infeasibleBetter = { f: [1, 1], cv: 0.5, rank: 0, crowd: 1 };
  const infeasibleWorseCV = { f: [0, 0], cv: 2.0, rank: 0, crowd: 1 };
  assert.equal(m.constrainedDominates(feasibleWorse, infeasibleBetter), true);
  assert.equal(m.constrainedDominates(infeasibleBetter, feasibleWorse), false);
  assert.equal(m.constrainedDominates(infeasibleBetter, infeasibleWorseCV), true);
  assert.equal(m.constrainedDominates(infeasibleWorseCV, infeasibleBetter), false);
  assert.equal(m.crowdedCompare(feasibleWorse, infeasibleBetter), true);
  // among feasible designs: rank, then crowding
  const a = { f: [1, 1], cv: 0, rank: 0, crowd: 0.2 }, b = { f: [2, 2], cv: 0, rank: 1, crowd: 5 }, c = { f: [1.5, 0.5], cv: 0, rank: 0, crowd: 0.9 };
  assert.equal(m.crowdedCompare(a, b), true);
  assert.equal(m.crowdedCompare(c, a), true);
  assert.equal(m.constraintViolation([-1, 0.25, 0.5, -3]), 0.75);
});

test('2-D hypervolume of {(1,2),(2,1)} with reference (3,3) is 3', () => {
  assert.equal(m.hypervolume2D([[1, 2], [2, 1]], [3, 3]), 3);
  // a dominated point adds nothing; a point outside the box adds nothing
  assert.equal(m.hypervolume2D([[1, 2], [2, 1], [2, 2], [5, 0.5]], [3, 3]), 3);
  assert.equal(m.hypervolume2D([], [3, 3]), 0);
});

test('SBX children and mutated designs stay inside the bounds', () => {
  const rng = m.makeRng(7);
  const lower = [0, -5, 10], upper = [1, 5, 11];
  for (let k = 0; k < 2000; k++) {
    const p1 = lower.map((lo, i) => lo + (upper[i] - lo) * rng());
    const p2 = lower.map((lo, i) => lo + (upper[i] - lo) * rng());
    const [c1, c2] = m.sbxCrossover(p1, p2, lower, upper, 15, rng);
    for (const c of [c1, c2]) c.forEach((v, i) => assert.ok(v >= lower[i] && v <= upper[i], `SBX child inside bounds: ${v}`));
    const mu = m.polynomialMutation(c1, lower, upper, 20, 1, rng);
    mu.forEach((v, i) => assert.ok(v >= lower[i] && v <= upper[i], `mutant inside bounds: ${v}`));
  }
});

test('seeded PRNG is deterministic and SBX preserves the parent mean on average', () => {
  const a = m.makeRng(42), b = m.makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  const rng = m.makeRng(3);
  let sumParents = 0, sumChildren = 0;
  for (let k = 0; k < 5000; k++) {
    const p1 = [rng()], p2 = [rng()];
    const [c1, c2] = m.sbxCrossover(p1, p2, [0], [1], 15, rng);
    sumParents += p1[0] + p2[0]; sumChildren += c1[0] + c2[0];
  }
  approx(sumChildren / sumParents, 1, 2e-2, 'children mean close to parents mean');
});

// ---------------- NSGA-II on ZDT1 ----------------

test('NSGA-II on ZDT1 (n = 10, 60 individuals, 150 generations, seed 1) converges to f2 = 1 - sqrt(f1)', () => {
  const res = m.runNsga2(m.zdt1Problem(10), { popSize: 60, generations: 150, seed: 1 });
  assert.ok(res.front.length >= 20, `front has ${res.front.length} designs`);
  const f1 = res.front.map(p => p.f[0]);
  assert.ok(Math.min(...f1) < 0.05, `front reaches f1 = ${Math.min(...f1)} at the left`);
  assert.ok(Math.max(...f1) > 0.9, `front reaches f1 = ${Math.max(...f1)} at the right`);
  const gaps = res.front.map(p => Math.abs(p.f[1] - (1 - Math.sqrt(p.f[0]))));
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(mean < 0.02, `mean distance to the analytic front ${mean}`);
  // hypervolume grows overall; it is not strictly monotone because crowding truncation may drop an extreme
  // point, but any drop must stay small compared with the final value
  const hv = res.hvHistory;
  assert.equal(hv.length, 151);
  assert.ok(hv[hv.length - 1] > hv[0] * 1.2, `hypervolume grew from ${hv[0]} to ${hv[hv.length - 1]}`);
  let worstDrop = 0;
  for (let i = 1; i < hv.length; i++) worstDrop = Math.max(worstDrop, hv[i - 1] - hv[i]);
  assert.ok(worstDrop < 0.01 * hv[hv.length - 1], `largest hypervolume drop ${worstDrop}`);
  assert.equal(res.evaluations, 60 + 60 * 150);
});

test('NSGA-II is deterministic for a given seed and changes with the seed', () => {
  const p = m.zdt1Problem(5);
  const a = m.runNsga2(p, { popSize: 20, generations: 20, seed: 11 });
  const b = m.runNsga2(p, { popSize: 20, generations: 20, seed: 11 });
  const c = m.runNsga2(p, { popSize: 20, generations: 20, seed: 12 });
  assert.deepEqual(a.front.map(q => q.f), b.front.map(q => q.f));
  assert.notDeepEqual(a.front.map(q => q.f), c.front.map(q => q.f));
});

test('NSGA-II rejects invalid problems and options with readable errors', () => {
  assert.throws(() => m.createNsga2({ n: 2, lower: [0, 0], upper: [1, 0], evaluate: () => ({ f: [0, 0], g: [] }) }), /upper > lower/);
  assert.throws(() => m.createNsga2(m.zdt1Problem(3), { popSize: 2 }), /at least 4/);
  assert.throws(() => m.createNsga2(m.zdt1Problem(3), { pc: 1.5 }), /probabilities/);
  // an evaluate that throws or returns NaN is treated as heavily infeasible, never as NaN in the population
  const bad = { n: 1, lower: [0], upper: [1], evaluate: x => (x[0] < 0.5 ? { f: [NaN, 1], g: [] } : { f: [x[0], 1 - x[0]], g: [] }) };
  const res = m.runNsga2(bad, { popSize: 10, generations: 5, seed: 2 });
  for (const ind of res.population) assert.ok(ind.f.every(Number.isFinite), 'objectives finite');
  for (const ind of res.front) assert.ok(ind.x[0] >= 0.5, 'front contains only evaluable designs');
});

// ---------------- beam closed forms and verification ----------------

test('beam closed forms: printed spar 12 x 24 mm rectangle', () => {
  const spec = m.beamSpecFromPreset('printed-spar');
  assert.equal(spec.family, 'rect');
  const d = m.evaluateBeamDesign(spec, [12, 24]);
  const I = 12 * 24 ** 3 / 12; // 13824 mm^4
  approx(d.I, I, 1e-12, 'I');
  approx(d.M, 20 * 600, 1e-12, 'M = P L');
  approx(d.deflection, 20 * 600 ** 3 / (3 * 3500 * I), 1e-12, 'v = P L^3 / (3 E I)');
  approx(d.sigma, 12000 * 12 / I, 1e-12, 'sigma = M c / I');
  approx(d.mass, 12 * 24 * 600 * 1.24 / 1000, 1e-12, 'mass');
  approx(d.constraints[0].U, (12000 * 12 / I) * 2 / 45, 1e-12, 'U_stress');
  assert.equal(d.feasible, true);
});

test('beam closed forms for the other three cases and section families', () => {
  const al = MATERIALS.al6061;
  // simply supported UDL tube from the shared preset
  const ss = m.beamSpecFromPreset('ss-udl');
  assert.equal(ss.caseKey, 'ss-udl');
  const d = m.evaluateBeamDesign(ss, [30, 2]);
  const I = Math.PI / 64 * (30 ** 4 - 26 ** 4);
  approx(d.I, I, 1e-12, 'tube I');
  approx(d.M, 2 * 1000 ** 2 / 8, 1e-12, 'M = w L^2 / 8');
  approx(d.deflection, 5 * 2 * 1000 ** 4 / (384 * al.E * I), 1e-12, 'v = 5 w L^4 / (384 E I)');
  // cantilever UDL
  const cu = Object.assign(m.beamSpecFromPreset('printed-spar'), { caseKey: 'cant-udl', load: 0.05 });
  const d2 = m.evaluateBeamDesign(cu, [12, 24]);
  approx(d2.M, 0.05 * 600 ** 2 / 2, 1e-12, 'M = w L^2 / 2');
  approx(d2.deflection, 0.05 * 600 ** 4 / (8 * 3500 * 13824), 1e-12, 'v = w L^4 / (8 E I)');
  // simply supported midspan point load, box section b = 0.6 h
  const sp = Object.assign(m.beamSpecFromPreset('ss-udl', 'box'), { caseKey: 'ss-point', load: 500 });
  const d3 = m.evaluateBeamDesign(sp, [40, 2]);
  const b = 24, h = 40, t = 2;
  const Ibox = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12;
  approx(d3.I, Ibox, 1e-12, 'box I');
  approx(d3.M, 500 * 1000 / 4, 1e-12, 'M = P L / 4');
  approx(d3.deflection, 500 * 1000 ** 3 / (48 * al.E * Ibox), 1e-12, 'v = P L^3 / (48 E I)');
  // hollow constraint: a wall that closes the bore is infeasible, not NaN
  const closed = m.evaluateBeamDesign(ss, [10, 6]);
  assert.equal(closed.feasible, false);
  assert.ok(closed.f.every(Number.isFinite), 'finite stand-in objectives');
  assert.ok(closed.constraints.some(c => c.name.startsWith('Hollow') && c.g > 0));
});

test('independent Hermite finite element re-solve matches the closed forms for all four cases', () => {
  const E = 68900, I = 20000, L = 1000, q = 2;
  for (const [key, M, v] of [
    ['cant-point', q * L, q * L ** 3 / (3 * E * I)],
    ['cant-udl', q * L * L / 2, q * L ** 4 / (8 * E * I)],
    ['ss-point', q * L / 4, q * L ** 3 / (48 * E * I)],
    ['ss-udl', q * L * L / 8, 5 * q * L ** 4 / (384 * E * I)],
  ]) {
    const fe = m.beamFE(key, L, q, E, I, 16);
    approx(fe.vmax, v, 1e-8, `${key} deflection`);
    approx(fe.Mmax, M, 1e-8, `${key} moment`);
  }
});

test('verifyBeamDesign accepts a feasible design and rejects an infeasible one with the reason', () => {
  const spec = m.beamSpecFromPreset('printed-spar');
  const ok = m.verifyBeamDesign(spec, [12, 24]);
  assert.equal(ok.verified, true);
  assert.equal(ok.message, 'Checked by fresh model solve');
  assert.equal(ok.governing.name, 'Bending stress');
  const bad = m.verifyBeamDesign(spec, [2, 10]);
  assert.equal(bad.feasible, false);
  assert.equal(bad.verified, false);
  assert.match(bad.message, /violates/);
  assert.match(bad.message, /Bending stress/);
  const thin = m.verifyBeamDesign(Object.assign({}, spec, { tMin: 5 }), [4, 30]);
  assert.equal(thin.feasible, false);
  assert.match(thin.message, /t_min/);
  // invalid numbers produce an error message, not an exception
  const invalid = m.verifyBeamDesign(spec, [-1, 10]);
  assert.equal(invalid.verified, false);
  assert.match(invalid.message, /positive/);
});

test('beam spec validation reports readable errors instead of NaN results', () => {
  const spec = m.beamSpecFromPreset('printed-spar');
  assert.throws(() => m.makeBeamProblem(Object.assign({}, spec, { L: 0 })), /span L/);
  assert.throws(() => m.makeBeamProblem(Object.assign({}, spec, { load: NaN })), /must be a positive number/);
  assert.throws(() => m.makeBeamProblem(Object.assign({}, spec, { material: 'unobtainium' })), /unknown material/);
  assert.throws(() => m.makeBeamProblem(Object.assign({}, spec, { bounds: [[5, 2], [2, 60]] })), /0 < min < max/);
  assert.throws(() => m.makeBeamProblem(Object.assign({}, spec, { FS: 0.5 })), /at least 1/);
  assert.throws(() => m.beamSpecFromPreset('nope'), /unknown beam preset/);
});

test('classical closed-form front of the rectangular spar: depth bound, then width bound', () => {
  const spec = m.beamSpecFromPreset('printed-spar');
  const an = m.analyticBeamFront(spec, 120);
  assert.ok(an.length >= 100);
  const hmax = spec.bounds[1][1], tMin = spec.tMin, rho = MATERIALS.pla.rho;
  const massAtCorner = rho * spec.L * tMin * hmax / 1000;
  for (const p of an) {
    if (p.f[0] > massAtCorner * 1.001) approx(p.x[1], hmax, 1e-9, 'depth at upper bound');
    else if (p.f[0] < massAtCorner * 0.999) approx(p.x[0], tMin, 1e-9, 'width at t_min');
  }
  // lightest design: width t_min and the depth that makes the stress active, h = sqrt(6 M FS / (t_min sigma_allow))
  const hStress = Math.sqrt(6 * 20 * 600 * 2 / (tMin * 45));
  approx(an[0].x[1], hStress, 1e-6, 'lightest front depth from stress');
  approx(m.verifyBeamDesign(spec, an[0].x).governing.U, 1, 1e-6, 'stress active at the light end');
  // heaviest design: both variables at their upper bounds
  assert.deepEqual(an[an.length - 1].x, [spec.bounds[0][1], hmax]);
  // a dense grid sweep (independent exact evaluations) never dominates a closed-form point
  const ref = m.referenceFrontByGrid(m.makeBeamProblem(spec), 120, 120);
  for (const a of an) for (const g of ref.points) assert.equal(m.dominates(g.f, a.f), false, 'grid point dominates a closed-form front point');
  assert.ok(m.frontDistance(ref.points.map(p => p.f), an.map(p => p.f)) < 0.005);
});

test('closed-form front also holds for the tube and box families against the grid sweep', () => {
  for (const fam of ['tube', 'box']) {
    const spec = m.beamSpecFromPreset('ss-udl', fam);
    const an = m.analyticBeamFront(spec, 80);
    assert.ok(an.length >= 60, `${fam} analytic points ${an.length}`);
    const ref = m.referenceFrontByGrid(m.makeBeamProblem(spec), 100, 100);
    for (const a of an) for (const g of ref.points) assert.equal(m.dominates(g.f, a.f), false, `${fam}: grid point dominates a closed-form point`);
    assert.ok(m.frontDistance(ref.points.map(p => p.f), an.map(p => p.f)) < 0.005, `${fam} grid vs closed form`);
    for (const a of an) assert.equal(m.verifyBeamDesign(spec, a.x).verified, true);
  }
});

test('NSGA-II reaches the closed-form front of the rectangular spar and every front design verifies', () => {
  const spec = m.beamSpecFromPreset('printed-spar');
  const problem = m.makeBeamProblem(spec);
  const res = m.runNsga2(problem, { popSize: 60, generations: 120, seed: 1 });
  assert.ok(res.front.length >= 30, `front size ${res.front.length}`);
  const an = m.analyticBeamFront(spec, 200);
  const gap = m.frontDistance(res.front.map(p => p.f), an.map(p => p.f));
  assert.ok(gap < 0.005, `mean normalized gap GA vs closed form ${gap}`);
  // the GA found both ends: the light end near the stress limit and the heavy end at both upper bounds
  approx(res.front[0].f[0], an[0].f[0], 0.03, 'lightest mass');
  approx(res.front[res.front.length - 1].f[1], an[an.length - 1].f[1], 0.03, 'smallest deflection');
  for (const p of res.front) {
    const v = m.verifyBeamDesign(spec, p.x);
    assert.equal(v.verified, true);
    approx(v.mass, p.f[0], 1e-9, 'mass re-solve');
    approx(v.deflection, p.f[1], 1e-9, 'deflection re-solve');
  }
});

// ---------------- Warren truss ----------------

test('Warren truss solver: equilibrium, symmetry and method-of-sections member forces', () => {
  const model = m.buildWarrenModel(1000, 'uniform');
  const sol = m.solveTruss(model, { chord: 300, diag: 300 }, { FS: 1.5 });
  assert.equal(sol.unstable, false);
  approx(sol.sumReactions[1], 10000, 1e-9, 'vertical reactions equal the loads');
  approx(sol.sumReactions[0], 0, 1e-9, 'no net horizontal reaction');
  assert.ok(sol.equilibriumOk);
  approx(sol.reactions[0][1], 5000, 1e-9, 'left reaction');
  approx(sol.reactions[6][1], 5000, 1e-9, 'right reaction');
  // statically determinate: bottom chord 2-3 carries M/h about node 9 = 8.5e6 / 1000, top chord 9-10 carries -9000 N
  const n23 = sol.members.find(x => x.a === 2 && x.b === 3).N;
  const n910 = sol.members.find(x => x.a === 9 && x.b === 10).N;
  approx(n23, 8500, 1e-9, 'bottom chord force');
  approx(n910, -9000, 1e-9, 'top chord force');
  // end diagonal 0-7 carries the shear: 5000 / sin(atan(1000/500)) in compression
  const n07 = sol.members.find(x => x.a === 0 && x.b === 7).N;
  approx(n07, -5000 / Math.sin(Math.atan2(1000, 500)), 1e-9, 'end diagonal force');
  // forces do not depend on the areas, deflections do
  const sol2 = m.solveTruss(model, { chord: 600, diag: 600 }, { FS: 1.5 });
  approx(sol2.members.find(x => x.a === 2 && x.b === 3).N, 8500, 1e-9, 'force independent of area');
  approx(sol2.displacements[3][1], sol.displacements[3][1] / 2, 1e-9, 'deflection halves when areas double');
  // Euler buckling screen on the top chord: P_cr = pi^2 E (A^2/12) / L^2
  const top = sol.members.find(x => x.a === 9 && x.b === 10);
  approx(top.Pcr, Math.PI ** 2 * 68900 * (300 ** 2 / 12) / 1000 ** 2, 1e-9, 'P_cr');
  approx(top.U_buckling, 9000 * 1.5 / top.Pcr, 1e-9, 'buckling utilization');
  assert.equal(top.mode, 'buckling');
  // mass = sum(A L rho) / 1000
  const Lsum = model.members.reduce((s, [a, b]) => s + Math.hypot(model.nodes[b][0] - model.nodes[a][0], model.nodes[b][1] - model.nodes[a][1]), 0);
  approx(sol.mass, 300 * Lsum * 2.7 / 1000, 1e-9, 'mass');
});

test('Warren truss: mechanism detection and input validation', () => {
  const model = m.buildWarrenModel(1000, 'uniform');
  model.members = model.members.filter(mm => mm[2] === 'chord');
  const sol = m.solveTruss(model, { chord: 300, diag: 300 });
  assert.equal(sol.unstable, true);
  assert.match(sol.reason, /mechanism/);
  const spec = m.trussSpecDefault();
  assert.throws(() => m.evaluateTrussDesign(spec, [0, 300]), /positive numbers/);
  assert.throws(() => m.makeTrussProblem(Object.assign({}, spec, { Abounds: [100, 50] })), /area bounds/);
  assert.throws(() => m.makeTrussProblem(Object.assign({}, spec, { loadCase: 'hurricane' })), /unknown load case/);
  assert.throws(() => m.buildWarrenModel(-5), /height h/);
  const v = m.verifyTrussDesign(spec, [-1, 300]);
  assert.equal(v.verified, false);
  assert.match(v.message, /positive/);
});

test('verifyTrussDesign rejects an under-sized truss and accepts a sound one', () => {
  const spec = m.trussSpecDefault();
  const bad = m.verifyTrussDesign(spec, [300, 300]);
  assert.equal(bad.feasible, false);
  assert.match(bad.message, /violates/);
  assert.equal(bad.governing.kind, 'buckling');
  const ok = m.verifyTrussDesign(spec, [600, 600]);
  assert.equal(ok.verified, true);
  assert.equal(ok.message, 'Checked by fresh model solve');
  assert.ok(ok.equilibrium.ok);
  assert.equal(ok.utilizations.length, 23);
});

test('NSGA-II on the Warren truss returns a verified front and the height variable works', () => {
  const spec = m.trussSpecDefault();
  const problem = m.makeTrussProblem(spec);
  const res = m.runNsga2(problem, { popSize: 40, generations: 40, seed: 1 });
  assert.ok(res.front.length >= 10, `front size ${res.front.length}`);
  for (const p of res.front) {
    const v = m.verifyTrussDesign(spec, p.x);
    assert.equal(v.verified, true, `front design ${p.x} verified`);
    approx(v.mass, p.f[0], 1e-9, 'mass re-solve');
    approx(v.deflection, p.f[1], 1e-9, 'deflection re-solve');
  }
  // the lightest design is governed by buckling of a compression member near U = 1
  const lightest = m.verifyTrussDesign(spec, res.front[0].x);
  assert.ok(lightest.governing.U > 0.9 && lightest.governing.U <= 1 + 1e-9, `lightest governing U ${lightest.governing.U}`);
  // three-variable version
  const spec3 = Object.assign(m.trussSpecDefault(), { optimizeH: true });
  const problem3 = m.makeTrussProblem(spec3);
  assert.equal(problem3.n, 3);
  const res3 = m.runNsga2(problem3, { popSize: 24, generations: 15, seed: 1 });
  assert.ok(res3.front.length >= 5);
  for (const p of res3.front) {
    assert.ok(p.x[2] >= 300 && p.x[2] <= 2500);
    assert.equal(m.verifyTrussDesign(spec3, p.x).verified, true);
  }
  assert.throws(() => m.referenceFrontByGrid(problem3, 5, 5), /2-variable/);
});

// ---------------- student classification and trade-off readings ----------------

test('classifyDesign marks a front point as non-dominated and a point above the front as dominated', () => {
  const front = [[1, 10], [2, 6], [3, 4], [4, 3], [5, 2.5]];
  const onFront = m.classifyDesign([3, 4], front);
  assert.equal(onFront.status, 'non-dominated');
  assert.equal(onFront.dominatedBy, 0);
  approx(onFront.normalizedDistance, 0, 1e-12, 'distance of a front point');
  assert.equal(onFront.nearestIndex, 2);
  const above = m.classifyDesign([3.5, 6], front);
  assert.equal(above.status, 'dominated');
  assert.equal(above.dominatedBy, 2); // (2,6) and (3,4)
  assert.ok(above.normalizedDistance > 0);
  const below = m.classifyDesign([2.5, 4.5], front);
  assert.equal(below.status, 'non-dominated');
  assert.equal(below.dominatedBy, 0);
  assert.equal(m.classifyDesign([1, 1], []).status, 'no-front');
});

test('tradeoffReadings interpolate the front and flag out-of-range designs', () => {
  const front = [[1, 10], [2, 6], [3, 4], [4, 3], [5, 2.5]];
  const tr = m.tradeoffReadings([3.5, 6], front);
  // same deflection 6 is reached by the front at mass 2: lighter by 1.5 g
  approx(tr.lighterBy.value, 1.5, 1e-12, 'lighter by');
  assert.equal(tr.lighterBy.kind, 'interpolated');
  // same mass 3.5: front deflection 3.5 (between (3,4) and (4,3)): stiffer by 2.5 mm
  approx(tr.stifferBy.value, 2.5, 1e-12, 'stiffer by');
  const heavy = m.tradeoffReadings([9, 5], front);
  assert.equal(heavy.stifferBy.kind, 'beyond-heavy');
  approx(heavy.stifferBy.value, 2.5, 1e-12, 'stiffer than heaviest');
  assert.equal(heavy.lighterBy.kind, 'interpolated');
  const light = m.tradeoffReadings([0.5, 20], front);
  assert.equal(light.stifferBy.kind, 'beyond-light');
  assert.equal(light.lighterBy.kind, 'beyond-floppy');
});

test('frontDistance is zero for identical fronts and small for a nearby one', () => {
  const ref = Array.from({ length: 101 }, (_, i) => [i / 100, 1 - Math.sqrt(i / 100)]);
  assert.equal(m.frontDistance(ref, ref), 0);
  const shifted = ref.map(([a, b]) => [a, b + 0.01]);
  const d = m.frontDistance(shifted, ref);
  assert.ok(d > 0 && d <= 0.0101, `shifted distance ${d}`);
});

test('frontTableRows exports one header row plus one row per front design', () => {
  const spec = m.beamSpecFromPreset('printed-spar');
  const problem = m.makeBeamProblem(spec);
  const res = m.runNsga2(problem, { popSize: 12, generations: 5, seed: 1 });
  const rows = m.frontTableRows(problem, res.front);
  assert.equal(rows.length, res.front.length + 1);
  assert.equal(rows[0][0], 'Width b (mm)');
  assert.ok(rows.slice(1).every(r => r[r.length - 1] === 'yes'));
});
