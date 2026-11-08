// Tests for the Fully Stressed Tapered Beam module. Run from /home/claude/optlab with
//   node --test optimization/beam-fsd/beam-fsd.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mod from './beam-fsd.js';

const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);

function rectModel(over = {}) {
  return mod.validateModel(Object.assign({
    support: 'cantilever', L: 500, N: 24,
    loads: [{ type: 'point', P: 400, a: 500 }],
    material: 'steel', FS: 1.5, deflectionLimitRatio: 40,
    section: { type: 'rect', b: 10 }, minDim: 2,
  }, over));
}

// ---------------------------------------------------------------------------------------------
// Finite element solver against closed forms
// ---------------------------------------------------------------------------------------------

test('cantilever with tip load: tip deflection P L^3 / (3 E I), root moment P L, reactions', () => {
  const v = rectModel();
  assert.equal(v.ok, true);
  const model = v.model;
  const h = 20, I = 10 * h ** 3 / 12, E = model.material.E, P = 400, L = 500;
  const sol = mod.solveBeam(model, new Array(24).fill(h));
  assert.equal(sol.ok, true);
  assert.ok(relErr(sol.vmax, P * L ** 3 / (3 * E * I)) < 1e-6, `tip deflection ${sol.vmax}`);
  assert.ok(relErr(sol.xvmax, L) < 1e-9);
  assert.ok(relErr(sol.segments[0].Mgov, P * L) < 1e-9, 'root moment');
  const Rf = sol.reactions.find(r => r.kind === 'force'), Rm = sol.reactions.find(r => r.kind === 'moment');
  assert.ok(relErr(Rf.value, -P) < 1e-9, 'vertical reaction balances the load');
  assert.ok(relErr(Rm.value, -P * L) < 1e-9, 'clamp moment');
  // shear is dM/dx = -P everywhere, moment vanishes at the free end
  assert.ok(relErr(sol.elements[0].V1, -P) < 1e-9);
  assert.ok(Math.abs(sol.elements[sol.elements.length - 1].M2) < 1e-6 * P * L);
});

test('simply supported beam with uniform load: midspan deflection 5 w L^4 / (384 E I) and M = w L^2 / 8', () => {
  const v = mod.validateModel({ support: 'simply', L: 1000, N: 24, loads: [{ type: 'udl', w: -2, a: 0, b: 1000 }],
    material: 'al6061', FS: 1.5, deflectionLimitRatio: 250, section: { type: 'rect', b: 20 }, minDim: 2 });
  assert.equal(v.ok, true);
  const model = v.model;
  const h = 30, I = 20 * h ** 3 / 12, E = model.material.E, w = 2, L = 1000;
  const sol = mod.solveBeam(model, new Array(24).fill(h));
  assert.equal(sol.ok, true);
  assert.ok(relErr(sol.vmax, 5 * w * L ** 4 / (384 * E * I)) < 1e-6, `midspan deflection ${sol.vmax}`);
  assert.ok(relErr(sol.xvmax, L / 2) < 1e-6);
  const Mmax = Math.max(...sol.segments.map(s => Math.abs(s.Mgov)));
  assert.ok(relErr(Mmax, w * L * L / 8) < 1e-9, 'midspan moment');
  for (const r of sol.reactions) assert.ok(relErr(r.value, w * L / 2) < 1e-9, 'each support carries half the load');
  // downward load gives a sagging (positive) moment in the y-up convention
  assert.ok(sol.segments[12].Mgov > 0);
});

test('propped cantilever with uniform load: pinned reaction 3 w L / 8, clamped-end moment w L^2 / 8, peak sagging 9 w L^2 / 128', () => {
  const v = mod.validateModel({ support: 'propped', L: 800, N: 24, loads: [{ type: 'udl', w: -2, a: 0, b: 800 }],
    material: 'steel', FS: 1.5, deflectionLimitRatio: 150, section: { type: 'rect', b: 12 }, minDim: 2 });
  assert.equal(v.ok, true);
  const sol = mod.solveBeam(v.model, new Array(24).fill(18.5));
  assert.equal(sol.ok, true);
  const w = 2, L = 800;
  const pin = sol.reactions.find(r => r.x === L && r.kind === 'force');
  const clampM = sol.reactions.find(r => r.x === 0 && r.kind === 'moment');
  assert.ok(relErr(pin.value, 3 * w * L / 8) < 1e-6, `pin reaction ${pin.value}`);
  assert.ok(relErr(Math.abs(clampM.value), w * L * L / 8) < 1e-6, `clamp moment ${clampM.value}`);
  assert.ok(relErr(Math.abs(sol.segments[0].Mgov), w * L * L / 8) < 1e-6);
  const sag = Math.max(...sol.segments.map(s => s.Mgov));
  assert.ok(relErr(sag, 9 * w * L * L / 128) < 1e-6, `peak sagging moment ${sag}`);
});

test('simply supported beam with a point load at a: deflection under the load P a^2 b^2 / (3 E I L) and M = P a b / L', () => {
  const L = 900, a = 300, b = 600, P = 250;
  const v = mod.validateModel({ support: 'simply', L, N: 20, loads: [{ type: 'point', P: -P, a }],
    material: 'al6061', FS: 1.5, deflectionLimitRatio: 100, section: { type: 'rect', b: 20 }, minDim: 2 });
  assert.equal(v.ok, true);
  const h = 25, I = 20 * h ** 3 / 12, E = v.model.material.E;
  const sol = mod.solveBeam(v.model, new Array(20).fill(h));
  assert.equal(sol.ok, true);
  const node = sol.nodes.findIndex(x => Math.abs(x - a) < 1e-9);
  assert.ok(node > 0, 'load position is a node');
  assert.ok(relErr(Math.abs(sol.dofs[2 * node]), P * a * a * b * b / (3 * E * I * L)) < 1e-6);
  const Mmax = Math.max(...sol.segments.map(s => Math.abs(s.Mgov)));
  assert.ok(relErr(Mmax, P * a * b / L) < 1e-9);
});

test('two-step cantilever (per-element EI): tip deflection (P L^3 / 3E) (7 / (8 I1) + 1 / (8 I2))', () => {
  const v = rectModel({ N: 2 });
  assert.equal(v.ok, true);
  const b = 10, h1 = 24, h2 = 14, I1 = b * h1 ** 3 / 12, I2 = b * h2 ** 3 / 12, E = v.model.material.E, P = 400, L = 500;
  const sol = mod.solveBeam(v.model, [h1, h2]);
  assert.equal(sol.ok, true);
  const exact = P * L ** 3 / (3 * E) * (7 / (8 * I1) + 1 / (8 * I2));
  assert.ok(relErr(sol.vmax, exact) < 1e-6, `stepped tip deflection ${sol.vmax} vs ${exact}`);
});

test('element recovery is self-consistent: EI v\'\' equals the statics moment, moments are continuous across nodes', () => {
  const v = mod.validateModel({ support: 'propped', L: 800, N: 16, loads: [{ type: 'udl', w: -2, a: 100, b: 600 }, { type: 'point', P: -150, a: 350 }],
    material: 'steel', FS: 1.5, deflectionLimitRatio: 150, section: { type: 'rect', b: 12 }, minDim: 2 });
  const design = Array.from({ length: 16 }, (_, i) => 20 - 0.5 * i);
  const sol = mod.solveBeam(v.model, design);
  assert.equal(sol.ok, true);
  for (let e = 0; e < sol.elements.length; e++) {
    const el = sol.elements[e];
    const Le = el.x2 - el.x1;
    for (const f of [0.25, 0.5, 0.8]) {
      const xi = f * Le, c = el.coeff;
      const Mcurv = el.EI * (2 * c[2] + 6 * c[3] * xi + 12 * c[4] * xi * xi);
      const Mstat = el.M1 + el.V1 * xi + 0.5 * el.w * xi * xi;
      assert.ok(Math.abs(Mcurv - Mstat) < 1e-6 * Math.max(1, Math.abs(Mstat)) + 1e-6, `element ${e}: ${Mcurv} vs ${Mstat}`);
    }
    if (e > 0) {
      const prev = sol.elements[e - 1];
      const hasPointLoad = v.model.loads.some(ld => ld.type === 'point' && Math.abs(ld.a - el.x1) < 1e-9);
      assert.ok(Math.abs(prev.M2 - el.M1) < 1e-6 * Math.max(1, Math.abs(el.M1)), 'moment continuity');
      if (!hasPointLoad) assert.ok(Math.abs(prev.V2 - el.V1) < 1e-6 * Math.max(1, Math.abs(el.V1)), 'shear continuity without point load');
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Designs
// ---------------------------------------------------------------------------------------------

test('prismatic sizing puts the stress utilization exactly at 1 (rect and tube)', () => {
  const r = mod.prismaticDesign(rectModel().model);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.solution.maxU - 1) < 1e-9, `rect U ${r.solution.maxU}`);
  assert.ok(relErr(r.dim, Math.sqrt(6 * 400 * 500 * 1.5 / (10 * 350))) < 1e-9, 'closed-form depth');
  const t = mod.validateModel(mod.FSD_PRESETS['ss-udl-tube']);
  const rt = mod.prismaticDesign(t.model);
  assert.equal(rt.ok, true);
  assert.ok(Math.abs(rt.solution.maxU - 1) < 1e-9, `tube U ${rt.solution.maxU}`);
  assert.ok(rt.dim > t.model.minDim && rt.dim < t.model.section.D / 2);
});

test('FSD cantilever tip load, N = 60: mass ratio within 2 percent of 2/3 and depth follows Galileo\'s parabola', () => {
  const res = mod.runFSD(Object.assign({}, mod.FSD_PRESETS['galileo-steel'], { N: 60, minDim: 0.5 }));
  assert.equal(res.ok, true);
  assert.equal(res.converged, true);
  assert.ok(Math.abs(res.numeric.massRatio - 2 / 3) < 0.02 * (2 / 3), `mass ratio ${res.numeric.massRatio}`);
  assert.ok(res.numeric.massRatio > 2 / 3, 'stepped design sized for the largest moment in each step is heavier than the continuous limit');
  const L = res.model.L;
  const hRoot = res.designs.fsd.design[0];
  for (const sg of res.designs.fsd.solution.segments) {
    if (sg.atMin) continue;
    // exact agreement at the governing section (inner end of each step), where the step is fully stressed
    assert.ok(relErr(sg.dim, mod.galileoDepth(hRoot, sg.xgov, L)) < 1e-3, `segment ${sg.index} at x = ${sg.xgov}`);
    // and within 2 percent of the parabola evaluated at the segment midpoint over the inner three quarters of the span
    if (sg.xmid < 0.75 * L) assert.ok(relErr(sg.dim, mod.galileoDepth(hRoot, sg.xmid, L)) < 0.02, `midpoint segment ${sg.index}`);
  }
  // tip deflection of the parabolic beam is twice the prismatic one in the continuous limit
  assert.ok(Math.abs(res.numeric.deflRatio - 2) < 0.05 * 2, `deflection ratio ${res.numeric.deflRatio}`);
  assert.equal(res.classical.applicable, true);
  assert.ok(Math.abs(res.classical.massRatio - 2 / 3) < 1e-12);
});

test('FSD simply supported uniform load, N = 60: mass ratio approaches pi/4 and deflection ratio (6 pi - 12) / 5', () => {
  const res = mod.runFSD(Object.assign({}, mod.FSD_PRESETS['ss-udl-rect'], { N: 60, minDim: 0.5 }));
  assert.equal(res.ok, true);
  assert.equal(res.converged, true);
  assert.ok(Math.abs(res.numeric.massRatio - Math.PI / 4) < 0.025 * Math.PI / 4, `mass ratio ${res.numeric.massRatio}`);
  assert.ok(Math.abs(res.numeric.deflRatio - (6 * Math.PI - 12) / 5) < 0.05 * 1.37, `deflection ratio ${res.numeric.deflRatio}`);
  const hMid = res.designs.prismatic.dim;
  for (const sg of res.designs.fsd.solution.segments) {
    if (sg.atMin) continue;
    assert.ok(relErr(sg.dim, mod.ssUdlDepth(hMid, sg.xgov, res.model.L)) < 1e-3);
  }
  // refinement moves the stepped ratio toward the continuous value
  const fine = mod.runFSD(Object.assign({}, mod.FSD_PRESETS['ss-udl-rect'], { N: 200, minDim: 0.2 }));
  assert.ok(Math.abs(fine.numeric.massRatio - Math.PI / 4) < Math.abs(res.numeric.massRatio - Math.PI / 4));
});

test('FSD thin-walled tube follows the moment diagram: SS uniform load mass ratio near 2/3, deflection ratio near 6/5', () => {
  const res = mod.runFSD(Object.assign({}, mod.FSD_PRESETS['ss-udl-tube'], { N: 60, minDim: 0.05 }));
  assert.equal(res.ok, true);
  assert.equal(res.converged, true);
  assert.ok(Math.abs(res.numeric.massRatio - 2 / 3) < 0.02 * (2 / 3), `tube mass ratio ${res.numeric.massRatio}`);
  assert.ok(Math.abs(res.numeric.deflRatio - 1.2) < 0.03 * 1.2, `tube deflection ratio ${res.numeric.deflRatio}`);
});

test('FSD converges on the default preset and the three designs verify as described', () => {
  const res = mod.runFSD(mod.FSD_PRESETS[mod.DEFAULT_PRESET]);
  assert.equal(res.ok, true);
  assert.equal(res.converged, true);
  assert.ok(res.history[res.history.length - 1].maxDev < 1e-3);
  assert.equal(res.iterations, 1, 'statically determinate: one resizing step');
  const d = res.designs;
  assert.equal(d.prismatic.verify.feasible, true);
  assert.ok(Math.abs(d.prismatic.verify.utilizations.stress - 1) < 1e-6);
  // stress-only FSD: fully stressed, but the deflection limit is violated on this preset
  assert.ok(d.fsd.verify.utilizations.stress <= 1 + mod.U_TOL && d.fsd.verify.utilizations.stress > 0.999);
  assert.equal(d.fsd.verify.feasible, false);
  assert.equal(d.fsd.verify.governing.type, 'deflection');
  assert.ok(d.fsd.mass < d.prismatic.mass);
  assert.ok(Math.abs(res.savings.stressOnly.percent - 100 * (1 - 0.6858)) < 0.5, `saving ${res.savings.stressOnly.percent}`);
  // FSD scaled to the deflection limit: feasible, deflection active
  assert.equal(d.fsdDefl.verify.feasible, true);
  assert.equal(d.fsdDefl.active, true);
  assert.ok(d.fsdDefl.scale > 1);
  assert.ok(d.fsdDefl.mass > d.fsd.mass && d.fsdDefl.mass < d.prismatic.mass);
  assert.equal(d.fsdDefl.verify.governing.type, 'deflection');
  assert.ok(d.fsd.solution.vmax > d.prismatic.solution.vmax, 'tapering costs stiffness');
});

test('deflection-limited scaling meets the limit within 0.5 percent (rect and tube)', () => {
  for (const key of ['galileo-steel', 'ss-udl-tube', 'propped-udl']) {
    const res = mod.runFSD(mod.FSD_PRESETS[key]);
    assert.equal(res.ok, true, key);
    const u = res.designs.fsdDefl.verify.utilizations.deflection;
    assert.ok(u <= 1 + mod.U_TOL && u > 0.995, `${key}: U_defl ${u}`);
    assert.equal(res.designs.fsdDefl.verify.feasible, true, key);
    const pr = res.designs.prismaticDefl;
    assert.equal(pr.verify.feasible, true);
  }
  // when the prismatic design violates the limit, the scaled prismatic reference lands on the limit too
  const spar = mod.runFSD(mod.FSD_PRESETS['printed-spar']);
  assert.equal(spar.designs.prismatic.verify.feasible, false);
  assert.ok(spar.designs.prismaticDefl.scale > 1);
  assert.ok(spar.designs.prismaticDefl.verify.utilizations.deflection > 0.995 && spar.designs.prismaticDefl.verify.utilizations.deflection <= 1 + mod.U_TOL);
});

test('propped cantilever: moments redistribute and the FSD iteration still converges within 60 iterations', () => {
  const res = mod.runFSD(mod.FSD_PRESETS['propped-udl']);
  assert.equal(res.ok, true);
  assert.equal(res.converged, true, `iterations ${res.iterations}`);
  assert.ok(res.iterations > 1 && res.iterations <= 60);
  const Mclamp0 = Math.abs(res.designs.prismatic.solution.segments[0].Mgov);
  const Mclamp1 = Math.abs(res.designs.fsd.solution.segments[0].Mgov);
  assert.ok(relErr(Mclamp1, Mclamp0) > 0.1, 'clamp moment changes with the stiffness distribution');
  assert.ok(res.designs.fsd.verify.utilizations.stress <= 1 + mod.U_TOL);
  for (const sg of res.designs.fsd.solution.segments) if (!sg.atMin) assert.ok(Math.abs(sg.U - 1) < 2e-3, `segment ${sg.index} U ${sg.U}`);
  // the textbook rule (exponent 1) reaches the same fixed point, more slowly
  const plain = mod.runFSD(mod.FSD_PRESETS['propped-udl'], { exponent: 1 });
  assert.equal(plain.converged, true);
  assert.ok(plain.iterations > res.iterations);
  assert.ok(relErr(plain.designs.fsd.mass, res.designs.fsd.mass) < 2e-3);
});

test('verification rejects infeasible designs and accepts feasible ones', () => {
  const raw = mod.FSD_PRESETS['galileo-steel'];
  const res = mod.runFSD(raw);
  const good = mod.verifyDesign(raw, res.designs.fsdDefl.design);
  assert.equal(good.feasible, true);
  const thin = mod.verifyDesign(raw, res.designs.fsd.design.map(h => 0.9 * h));
  assert.equal(thin.feasible, false);
  assert.equal(thin.governing.type, 'deflection');
  assert.ok(thin.utilizations.stress > 1.2);
  assert.match(thin.reason, /stress utilization/);
  const below = mod.verifyDesign(raw, res.designs.fsd.design.map((h, i) => (i === 23 ? 0.5 : h)));
  assert.equal(below.feasible, false);
  assert.match(below.reason, /below the minimum/);
  const wrongLength = mod.verifyDesign(raw, [10, 10]);
  assert.equal(wrongLength.feasible, false);
});

test('invalid inputs return error objects instead of throwing', () => {
  const base = mod.FSD_PRESETS['galileo-steel'];
  const bad = [
    [Object.assign({}, base, { L: 0 }), /Length/],
    [Object.assign({}, base, { L: -5 }), /Length/],
    [Object.assign({}, base, { N: 1 }), /segments/],
    [Object.assign({}, base, { minDim: 0 }), /Minimum depth/],
    [Object.assign({}, base, { minDim: -1 }), /Minimum depth/],
    [Object.assign({}, base, { loads: [] }), /load/],
    [Object.assign({}, base, { loads: [{ type: 'point', P: 100, a: 900 }] }), /within 0 and L/],
    [Object.assign({}, base, { loads: [{ type: 'udl', w: 1, a: 300, b: 200 }] }), /greater than a/],
    [Object.assign({}, base, { section: { type: 'tube', D: 20 }, minDim: 12 }), /smaller than D/],
    [Object.assign({}, base, { section: { type: 'rect', b: 0 } }), /width/],
    [Object.assign({}, base, { support: 'fixed-fixed' }), /Support/],
    [Object.assign({}, base, { FS: 0 }), /FS/],
    [Object.assign({}, base, { deflectionLimitRatio: 0 }), /limit ratio/],
    [Object.assign({}, base, { material: 'unobtainium' }), /material/],
    [Object.assign({}, base, { material: { E: NaN, sigmaAllow: 1, rho: 1 } }), /Modulus/],
    [Object.assign({}, base, { L: 'abc' }), /Length/],
  ];
  for (const [raw, re] of bad) {
    let res;
    assert.doesNotThrow(() => { res = mod.runFSD(raw); });
    assert.equal(res.ok, false, JSON.stringify(raw).slice(0, 80));
    assert.match(res.error, re);
  }
  // solver-level guards
  const model = rectModel().model;
  assert.equal(mod.solveBeam(model, [1, 2, 3]).ok, false);
  assert.equal(mod.solveBeam(model, new Array(24).fill(NaN)).ok, false);
  // a tube that cannot carry the moment even as a solid rod
  const rod = mod.runFSD({ support: 'cantilever', L: 1000, N: 12, loads: [{ type: 'point', P: 50000, a: 1000 }], material: 'pla', FS: 2, deflectionLimitRatio: 50, section: { type: 'tube', D: 20 }, minDim: 0.8 });
  assert.equal(rod.ok, false);
  assert.match(rod.error, /solid rod/);
});

test('mesh places nodes at segment boundaries, load positions and supports', () => {
  const v = mod.validateModel({ support: 'simply', L: 1000, N: 10, loads: [{ type: 'point', P: -10, a: 333 }, { type: 'udl', w: -1, a: 120, b: 880 }],
    material: 'steel', FS: 1.5, deflectionLimitRatio: 100, section: { type: 'rect', b: 10 }, minDim: 2 });
  const mesh = mod.buildMesh(v.model);
  for (const x of [0, 100, 333, 120, 880, 1000]) assert.ok(mesh.nodes.some(n => Math.abs(n - x) < 1e-9), `node at ${x}`);
  assert.equal(mesh.nodes.length, 14);
  assert.equal(mesh.elements.length, 13);
  const loaded = mesh.elements.filter(e => e.w !== 0);
  assert.ok(loaded.every(e => e.x1 >= 120 - 1e-9 && e.x2 <= 880 + 1e-9));
  assert.ok(Math.abs(loaded.reduce((s, e) => s + e.Le, 0) - 760) < 1e-9);
});

test('results are deterministic and fast, and the CSV table has one row per segment', () => {
  const t0 = performance.now();
  const a = mod.runFSD(mod.FSD_PRESETS['propped-udl']);
  const dt = performance.now() - t0;
  const b = mod.runFSD(mod.FSD_PRESETS['propped-udl']);
  assert.deepEqual(a.designs.fsd.design, b.designs.fsd.design);
  assert.ok(dt < 1000, `elapsed ${dt} ms`);
  const csv = mod.tableToCSV(a);
  assert.equal(csv.length, a.model.N + 1);
  assert.equal(csv[0].length, 11);
  const outline = mod.profileOutline(a.model, a.designs.fsd.design);
  assert.equal(outline.length, 2 * a.model.N);
  const lin = mod.profileOutline(Object.assign({}, a.model, { taper: 'linear' }), a.designs.fsd.design);
  assert.equal(lin.length, a.model.N + 2);
});
