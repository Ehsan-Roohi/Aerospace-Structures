// Node tests for the Beam Section Design-Space Map module.
// Run from /home/claude/optlab:  node --test optimization/beam-section-map/beam-section-map.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mod from './beam-section-map.js';
import { MATERIALS, sectionProps } from '../shared/presets.js';

const PLA = MATERIALS.pla, AL = MATERIALS.al6061;

function cantileverTip(over = {}) {
  return Object.assign({
    support: 'cantilever', L: 600, load: { type: 'point', P: 20, a: 600 },
    E: PLA.E, sigmaAllow: PLA.sigmaAllow, rho: PLA.rho, FS: 2, deflRatio: 50, tMin: 0.8, family: 'rect',
  }, over);
}

function ssUdl(over = {}) {
  return Object.assign({
    support: 'simply', L: 1000, load: { type: 'udl', w: 2 },
    E: AL.E, sigmaAllow: AL.sigmaAllow, rho: AL.rho, FS: 1.5, deflRatio: 250, tMin: 0.8, family: 'tube',
  }, over);
}

const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---------- closed forms ----------

test('cantilever with the load at the tip: v_tip = P L^3 / (3 E I), M_max = P L, sigma = M c / I', () => {
  const m = cantileverTip();
  const d = { b: 12, h: 24 };
  const r = mod.evaluateDesign(m, d);
  assert.equal(r.ok, true);
  const { I, c } = sectionProps('rect', d);
  const vExact = 20 * 600 ** 3 / (3 * PLA.E * I);
  assert.ok(relErr(r.vMax, vExact) < 1e-12, `v ${r.vMax} vs ${vExact}`);
  assert.ok(relErr(r.Mmax, 20 * 600) < 1e-12);
  assert.ok(relErr(r.sigmaMax, 20 * 600 * c / I) < 1e-12);
  // mass_g = A L rho / 1000
  assert.ok(relErr(r.mass, 12 * 24 * 600 * PLA.rho / 1000) < 1e-12);
  // preset design: deflection utilization above 1, stress below
  assert.ok(r.U.defl > 1 && r.U.stress < 1 && r.feasible === false);
  assert.equal(r.governing, 'defl');
});

test('cantilever with the point load inboard of the tip: v_tip = P a^2 (3L - a) / (6 E I)', () => {
  const m = cantileverTip({ load: { type: 'point', P: 50, a: 400 } });
  const r = mod.evaluateDesign(m, { b: 10, h: 20 });
  const { I } = sectionProps('rect', { b: 10, h: 20 });
  assert.ok(relErr(r.vMax, 50 * 400 ** 2 * (3 * 600 - 400) / (6 * PLA.E * I)) < 1e-12);
  assert.ok(relErr(r.Mmax, 50 * 400) < 1e-12);
});

test('cantilever uniform load: M_max = w L^2 / 2 and v_tip = w L^4 / (8 E I)', () => {
  const m = cantileverTip({ load: { type: 'udl', w: 0.05 } });
  const r = mod.evaluateDesign(m, { b: 10, h: 20 });
  const { I } = sectionProps('rect', { b: 10, h: 20 });
  assert.ok(relErr(r.Mmax, 0.05 * 600 ** 2 / 2) < 1e-12);
  assert.ok(relErr(r.vMax, 0.05 * 600 ** 4 / (8 * PLA.E * I)) < 1e-12);
});

test('simply supported uniform load: v_max = 5 w L^4 / (384 E I) and M_max = w L^2 / 8', () => {
  const m = ssUdl();
  const d = { D: 30, t: 2 };
  const r = mod.evaluateDesign(m, d);
  assert.equal(r.ok, true);
  const { I } = sectionProps('tube', d);
  assert.ok(relErr(r.vMax, 5 * 2 * 1000 ** 4 / (384 * AL.E * I)) < 1e-12);
  assert.ok(relErr(r.Mmax, 2 * 1000 ** 2 / 8) < 1e-12);
  assert.ok(relErr(r.mass, I > 0 ? sectionProps('tube', d).A * 1000 * AL.rho / 1000 : NaN) < 1e-12);
});

test('simply supported point load: midspan gives P L^3 / (48 E I) and P L / 4; off-centre load is mirror symmetric', () => {
  const base = ssUdl({ family: 'rect' });
  const d = { b: 20, h: 40 };
  const { I } = sectionProps('rect', d);
  const mid = mod.evaluateDesign(Object.assign({}, base, { load: { type: 'point', P: 500, a: 500 } }), d);
  assert.ok(relErr(mid.vMax, 500 * 1000 ** 3 / (48 * AL.E * I)) < 1e-12);
  assert.ok(relErr(mid.Mmax, 500 * 1000 / 4) < 1e-12);
  const left = mod.evaluateDesign(Object.assign({}, base, { load: { type: 'point', P: 500, a: 300 } }), d);
  const right = mod.evaluateDesign(Object.assign({}, base, { load: { type: 'point', P: 500, a: 700 } }), d);
  assert.ok(relErr(left.vMax, right.vMax) < 1e-12);
  assert.ok(relErr(left.Mmax, right.Mmax) < 1e-12);
  // closed form with b = distance to the nearer support (300 mm)
  const bNear = 300;
  const vExact = 500 * bNear * Math.pow(1000 ** 2 - bNear ** 2, 1.5) / (9 * Math.sqrt(3) * 1000 * AL.E * I);
  assert.ok(relErr(left.vMax, vExact) < 1e-12);
  assert.ok(relErr(left.Mmax, 500 * 300 * 700 / 1000) < 1e-12);
  // the location of the maximum deflection lies between the load and midspan
  assert.ok(right.xV > 500 && right.xV < 700);
  // load direction does not matter in the linear model
  const down = mod.evaluateDesign(Object.assign({}, base, { load: { type: 'point', P: -500, a: 300 } }), d);
  assert.ok(relErr(down.vMax, left.vMax) < 1e-12);
});

// ---------- optimizer against the classical depth formula ----------

test('grid optimum for rect with b fixed matches h* = sqrt(6 M FS / (b sigma)) within 3 percent when stress governs', () => {
  // cantilever 500 mm, 100 N at the tip, aluminium, FS 1.5, loose deflection limit so stress governs
  const m = {
    support: 'cantilever', L: 500, load: { type: 'point', P: 100, a: 500 },
    E: AL.E, sigmaAllow: AL.sigmaAllow, rho: AL.rho, FS: 1.5, deflRatio: 10, tMin: 0.8, family: 'rect',
  };
  const b = 10;
  const cl = mod.classicalRectDepth(m, b);
  assert.equal(cl.ok, true);
  assert.equal(cl.governing, 'stress', 'the case must be stress-governed');
  const hStar = Math.sqrt(6 * 100 * 500 * 1.5 / (b * AL.sigmaAllow));
  assert.ok(relErr(cl.hStress, hStar) < 1e-12);
  // degenerate x range fixes b; the grid alone must land within 3 percent of h*
  const ranges = { x: [b, b], y: [5, 25] };
  const grid = mod.buildGrid(m, ranges, 90);
  assert.equal(grid.ok, true);
  assert.ok(grid.best, 'a feasible cell must exist');
  assert.ok(relErr(grid.best.y, hStar) < 0.03, `grid h ${grid.best.y} vs h* ${hStar}`);
  assert.ok(grid.best.y >= hStar, 'the grid optimum lies on the feasible side');
  // the refined and verified optimum matches h* much more closely and is feasible by exact re-solve
  const opt = mod.optimize(m, ranges, 90);
  assert.equal(opt.feasible, true);
  assert.ok(relErr(opt.design.h, hStar) < 1e-6, `refined h ${opt.design.h} vs h* ${hStar}`);
  assert.equal(opt.verified.governing, 'stress');
  assert.ok(opt.verified.utilizations.stress <= 1 && opt.verified.utilizations.stress > 0.9999);
});

test('free optimum of a rect with the range starting at t_min: b = t_min, h on the deflection boundary, mass matches the closed form', () => {
  const m = cantileverTip();
  const ranges = { x: [0.8, 30], y: [6, 120] };
  const opt = mod.optimize(m, ranges, 90);
  assert.equal(opt.feasible, true);
  const cl = mod.classicalRectDepth(m, 0.8);
  assert.equal(cl.governing, 'defl');
  assert.ok(relErr(opt.design.b, 0.8) < 1e-9, 'width at the minimum thickness');
  assert.ok(relErr(opt.design.h, cl.hDefl) < 1e-6, `h ${opt.design.h} vs ${cl.hDefl}`);
  assert.ok(relErr(opt.verified.mass, 0.8 * cl.hDefl * 600 * PLA.rho / 1000) < 1e-6);
  assert.ok(opt.verified.active.includes('defl') && opt.verified.active.includes('thick'));
  assert.equal(opt.verified.governing, 'defl');
  // the refinement must not be heavier than the best grid cell
  assert.ok(opt.verified.mass <= opt.bestCell.mass + 1e-9);
});

test('tube optimum sits at the minimum wall thickness with the deflection boundary active and is verified', () => {
  const m = ssUdl();
  const r = mod.analyze({ model: m, design: { D: 30, t: 2 }, n: 60, compare: false });
  assert.equal(r.ok, true);
  assert.ok(r.optimum, 'optimum exists');
  assert.ok(r.optimum.verified.feasible);
  assert.ok(Math.abs(r.optimum.design.t - 0.8) < 1e-6, `t ${r.optimum.design.t}`);
  assert.ok(r.optimum.design.t >= 0.8, 'boundary value is on the feasible side');
  assert.ok(r.optimum.verified.active.includes('defl'));
  assert.ok(r.optimum.verified.mass < r.student.mass);
  // thin-wall estimate within a few percent of the exact boundary at D/t around 85
  const est = r.classical.atOptimum;
  assert.ok(relErr(est.xStar, r.optimum.design.D) < 0.03, `thin wall ${est.xStar} vs exact ${r.optimum.design.D}`);
});

// ---------- feasibility mask ----------

test('feasibility mask marks a thin tube (t < t_min) infeasible and hatched', () => {
  const m = ssUdl({ tMin: 1.0 });
  const grid = mod.buildGrid(m, { x: [20, 120], y: [0.4, 4] }, 40);
  assert.equal(grid.ok, true);
  let checked = 0;
  for (let j = 0; j < grid.n; j++) {
    if (grid.ys[j] >= 1.0) continue;
    for (let i = 0; i < grid.n; i++) {
      assert.equal(grid.feasible[j][i], false);
      assert.equal(grid.mask[j][i], true);
      if (grid.valid[j][i]) assert.ok(grid.Uthick[j][i] > 1);
      checked++;
    }
  }
  assert.ok(checked > 0);
  const e = mod.evaluateDesign(m, { D: 100, t: 0.5 });
  assert.ok(e.U.thick > 1 && e.feasible === false);
  // a large thick tube in the same grid is feasible
  const big = mod.evaluateDesign(m, { D: 120, t: 4 });
  assert.equal(big.feasible, true);
});

// ---------- Pareto ----------

test('non-dominated set on a hand-made 5-point set', () => {
  const pts = [
    { mass: 1, defl: 5 },   // 0 front
    { mass: 2, defl: 3 },   // 1 front
    { mass: 3, defl: 4 },   // 2 dominated by 1 and 4
    { mass: 4, defl: 1 },   // 3 front
    { mass: 2.5, defl: 3 }, // 4 dominated by 1 (equal deflection, heavier)
  ];
  assert.deepEqual(mod.nonDominated(pts), [0, 1, 3]);
  assert.equal(mod.dominationCount(pts, pts[2]), 2);
  assert.equal(mod.dominationCount(pts, pts[4]), 1);
  assert.equal(mod.dominationCount(pts, pts[1]), 0);
  assert.equal(mod.dominationCount(pts, { mass: 5, defl: 6 }), 5);
});

test('pareto analysis of the preset grid: front is sorted by mass with strictly decreasing deflection, student status is reported', () => {
  const m = cantileverTip();
  const r = mod.analyze({ model: m, design: { b: 12, h: 24 }, n: 60, compare: false });
  const f = r.pareto.front;
  assert.ok(f.length > 5);
  for (let k = 1; k < f.length; k++) {
    assert.ok(f[k].mass >= f[k - 1].mass);
    assert.ok(f[k].defl < f[k - 1].defl);
  }
  for (const c of r.pareto.candidates) assert.ok(c.Ustress <= 1 + 1e-9);
  assert.equal(r.pareto.student.inSet, true);
  assert.ok(r.pareto.student.dominated === true && r.pareto.student.count > 0, 'the 12 x 24 preset is dominated');
});

// ---------- verification ----------

test('verification rejects a design with U > 1 and accepts the verified optimum', () => {
  const m = cantileverTip();
  const bad = mod.verifyDesign(m, { b: 12, h: 24 });
  assert.equal(bad.ok, true);
  assert.equal(bad.feasible, false);
  assert.equal(bad.governing, 'defl');
  assert.ok(/failed/i.test(bad.message));
  const good = mod.verifyDesign(m, { b: 12, h: 40 });
  assert.equal(good.feasible, true);
  assert.ok(good.utilizations.defl < 1 && good.utilizations.stress < 1 && good.utilizations.thick < 1);
  assert.equal(good.message, 'Checked by fresh model solve');
});

// ---------- invalid input handling ----------

test('invalid inputs return error objects instead of throwing or producing NaN', () => {
  const base = cantileverTip();
  const d = { b: 12, h: 24 };
  const cases = [
    [Object.assign({}, base, { L: 0 }), d],
    [Object.assign({}, base, { L: -100 }), d],
    [Object.assign({}, base, { E: -5 }), d],
    [Object.assign({}, base, { sigmaAllow: 0 }), d],
    [Object.assign({}, base, { rho: NaN }), d],
    [Object.assign({}, base, { FS: 0 }), d],
    [Object.assign({}, base, { deflRatio: -1 }), d],
    [Object.assign({}, base, { load: { type: 'point', P: 20, a: 900 } }), d],
    [Object.assign({}, base, { family: 'ibeam' }), d],
    [base, { b: -3, h: 24 }],
    [base, { b: 12 }],
  ];
  for (const [m, dd] of cases) {
    const r = mod.evaluateDesign(m, dd);
    assert.equal(r.ok, false, JSON.stringify([m.L, m.E, dd]));
    assert.equal(typeof r.error, 'string');
    const a = mod.analyze({ model: m, design: dd, n: 40, compare: false });
    assert.equal(a.ok, false);
  }
  // tube with D <= 2t
  const tube = ssUdl();
  for (const dd of [{ D: 10, t: 6 }, { D: 10, t: 5 }]) {
    const r = mod.evaluateDesign(tube, dd);
    assert.equal(r.ok, false);
    assert.match(r.error, /D > 2 t/);
    const v = mod.verifyDesign(tube, dd);
    assert.equal(v.feasible, false);
    assert.equal(v.mass, null);
    assert.ok(!Object.values(v).some(x => typeof x === 'number' && Number.isNaN(x)), 'no NaN in the verification result');
  }
  // box with walls too thick for the width beta h
  const box = mod.evaluateDesign(ssUdl({ family: 'box', beta: 0.5 }), { h: 20, t: 5 });
  assert.equal(box.ok, false);
  // bad ranges
  assert.equal(mod.buildGrid(base, { x: [0, 10], y: [1, 2] }, 40).ok, false);
  assert.equal(mod.buildGrid(base, { x: [10, 5], y: [1, 2] }, 40).ok, false);
  assert.equal(mod.optimize(base, { x: [1, 2] }, 40).ok, false);
  // a valid grid that contains invalid tube cells keeps NaN out of the feasible set
  const g = mod.buildGrid(tube, { x: [4, 40], y: [0.5, 6] }, 40);
  assert.equal(g.ok, true);
  for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
    if (g.feasible[j][i]) assert.ok(Number.isFinite(g.mass[j][i]));
    if (!g.valid[j][i]) assert.ok(g.mask[j][i] && Number.isNaN(g.mass[j][i]));
  }
});

// ---------- materials ----------

test('material comparison: Ashby indices normalized to the best card, verified masses ranked, PLA map range reproduced', () => {
  const m = cantileverTip();
  const ranges = { x: [3, 30], y: [6, 60] };
  const c = mod.compareMaterials(m, ranges, 60);
  assert.equal(c.ok, true);
  assert.equal(c.rows.length, Object.keys(MATERIALS).length);
  assert.ok(Math.abs(Math.max(...c.rows.map(r => r.MstiffRel)) - 1) < 1e-12);
  assert.ok(Math.abs(Math.max(...c.rows.map(r => r.MstrengthRel)) - 1) < 1e-12);
  const spruce = c.rows.find(r => r.key === 'spruce');
  assert.ok(relErr(spruce.Mstiff, Math.sqrt(10000) / 0.42) < 1e-12);
  assert.ok(relErr(spruce.Mstrength, Math.pow(35, 2 / 3) / 0.42) < 1e-12);
  assert.equal(spruce.rankStiff, 1, 'spruce has the best stiffness index of the cards');
  const pla = c.rows.find(r => r.key === 'pla');
  assert.ok(pla.feasible && pla.mass > 0);
  const direct = mod.optimize(m, ranges, 60);
  assert.ok(relErr(pla.mass, direct.verified.mass) < 1e-9, 'the selected card reproduces the map optimum');
  const ranked = c.rows.filter(r => r.mass !== null).sort((a, b) => a.rankMass - b.rankMass);
  for (let k = 1; k < ranked.length; k++) assert.ok(ranked[k].mass >= ranked[k - 1].mass);
  assert.ok(relErr(ranked[0].massRel, 1) < 1e-12);
  for (const r of c.rows) if (r.feasible) assert.equal(r.verifiedMessage, 'Checked by fresh model solve');
});

// ---------- helpers and speed ----------

test('default ranges bracket the student design and respect t_min; nearest lighter feasible cell is lighter and feasible', () => {
  const m = cantileverTip();
  const dr = mod.defaultRanges(m, { b: 12, h: 24 });
  assert.equal(dr.ok, true);
  assert.ok(dr.ranges.x[0] < 12 && dr.ranges.x[1] > 12 && dr.ranges.y[0] < 24 && dr.ranges.y[1] > 24);
  assert.ok(dr.ranges.x[0] >= 0.8);
  const r = mod.analyze({ model: m, design: { b: 12, h: 24 }, n: 60, compare: false });
  assert.ok(r.nearest && r.nearest.lighter);
  assert.ok(r.nearest.cell.mass < r.student.mass);
  assert.equal(r.nearest.verified.feasible, true);
  assert.equal(mod.utilizationLevel(0.5), 'ok');
  assert.equal(mod.utilizationLevel(0.95), 'warn');
  assert.equal(mod.utilizationLevel(1.2), 'bad');
});

test('full analysis with the 160 x 160 grid and all materials finishes quickly', () => {
  const m = cantileverTip();
  const t0 = performance.now();
  const r = mod.analyze({ model: m, design: { b: 12, h: 24 }, n: 160 });
  const dt = performance.now() - t0;
  assert.equal(r.ok, true);
  assert.equal(r.grid.n, 160);
  assert.ok(r.materials.rows.length === 7);
  assert.ok(dt < 3000, `took ${dt} ms`);
});
