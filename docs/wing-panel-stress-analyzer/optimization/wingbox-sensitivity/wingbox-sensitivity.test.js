// Node tests for the wing box sensitivity module. Run from /home/claude/optlab with
//   node --test optimization/wingbox-sensitivity/wingbox-sensitivity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mod from './wingbox-sensitivity.js';

const D = mod.DEFAULTS;

test('elliptic lift integrates to the half-wing lift within 1e-3 relative', () => {
  const r = mod.solveWingBox(D);
  assert.equal(r.ok, true);
  const Lhalf = D.loadFactor * D.massKg * mod.G_ACCEL / 2;
  assert.ok(Math.abs(r.loads.Lhalf - Lhalf) < 1e-12);
  assert.ok(Math.abs(r.loads.Vroot / Lhalf - 1) < 1e-3, `root shear ${r.loads.Vroot} vs ${Lhalf}`);
  // the analytic root moment of an elliptic load is L_half x 4 s / (3 pi)
  const Mroot = Lhalf * 4 * D.s / (3 * Math.PI);
  assert.ok(Math.abs(r.loads.Mroot / Mroot - 1) < 1e-3, `root moment ${r.loads.Mroot} vs ${Mroot}`);
});

test('constant chord, constant EI, uniform load: tip deflection equals w s^4 / (8 EI) within 1 percent', () => {
  const r = mod.solveWingBox(Object.assign({}, D, { loadShape: 'uniform', cTip: D.cRoot }));
  assert.equal(r.ok, true);
  const w = r.loads.Lhalf / D.s;                 // N/mm
  const EI = r.root.EI;                          // constant along the span for a constant chord
  const closed = w * D.s ** 4 / (8 * EI);
  assert.ok(Math.abs(r.vTip / closed - 1) < 0.01, `v_tip ${r.vTip} vs ${closed}`);
  // slope at the tip: w s^3 / (6 EI)
  const thetaClosed = w * D.s ** 3 / (6 * EI);
  assert.ok(Math.abs(r.span.theta[r.span.theta.length - 1] / thetaClosed - 1) < 0.01);
});

test('Bredt torsion constant for uniform wall thickness equals 4 A^2 / (perimeter / t)', () => {
  const w = 108, h = 25.92, t = 1.3;
  const J = mod.bredtJ(w, h, t, t);
  const A = w * h, perimeter = 2 * (w + h);
  assert.ok(Math.abs(J / (4 * A * A / (perimeter / t)) - 1) < 1e-12);
  // the model's root GJ uses the same formula with the skin shear modulus
  const r = mod.solveWingBox(D);
  const G = r.material.G;
  assert.ok(Math.abs(r.root.GJ / (G * mod.bredtJ(r.root.w, r.root.h, D.tSkin, D.tWeb)) - 1) < 1e-12);
});

test('plate buckling closed form reproduces 25.85 MPa for E = 70000, nu = 0.33, t = 1, b = 100, k = 4', () => {
  const s = mod.plateBucklingStress(4, 70000, 0.33, 1, 100);
  assert.ok(Math.abs(s / 25.85 - 1) < 0.005, `sigma_cr ${s}`);
  // maxRibPitch inverts the closed form
  const b = mod.maxRibPitch(4, 70000, 0.33, 1, s);
  assert.ok(Math.abs(b - 100) < 1e-9);
});

test('KKT multiplier estimator on minimize x + y subject to x y >= 1 at (1, 1)', () => {
  // For g = 1 - x y <= 0 the stationarity condition grad f + lambda grad g = 0 gives (1, 1) = lambda (1, 1),
  // so lambda = 1 (the sensitivity theorem agrees: f*(b) = 2 sqrt(b) for x y >= b, df*/db = 1 at b = 1).
  const est = mod.estimateMultipliers(x => x[0] + x[1], [{ g: x => 1 - x[0] * x[1] }], [1, 1]);
  assert.ok(Math.abs(est.lambda[0] - 1) < 1e-3, `lambda ${est.lambda[0]}`);
  assert.ok(est.relResidual < 1e-6);
  // Multipliers scale with the constraint function: writing the same feasible set as (x y)^2 >= 1 gives 0.5.
  const est2 = mod.estimateMultipliers(x => x[0] + x[1], [{ g: x => 1 - (x[0] * x[1]) ** 2 }], [1, 1]);
  assert.ok(Math.abs(est2.lambda[0] - 0.5) < 1e-3, `lambda ${est2.lambda[0]}`);
  // Inactive-looking constraints receive lambda = 0 (non-negative least squares)
  const est3 = mod.estimateMultipliers(x => x[0] + x[1], [{ g: x => 1 - x[0] * x[1] }, { g: x => x[0] - x[1] }], [1, 1]);
  assert.ok(Math.abs(est3.lambda[0] - 1) < 1e-3);
  assert.ok(Math.abs(est3.lambda[1]) < 1e-9);
});

test('non-negative least squares is exact on a tiny problem', () => {
  const sol = mod.nnls([[1, 0], [0, 1]], [1, -1]);
  assert.ok(Math.abs(sol.lambda[0] - 1) < 1e-9 && sol.lambda[1] === 0);
  assert.ok(Math.abs(sol.residual - 1) < 1e-9);
});

test('active-set QP projects the unconstrained step onto the violated constraint', () => {
  // minimize -u1 - u2 + (1/2)|u|^2 subject to u1 + u2 <= 1: unconstrained (1, 1), projected (0.5, 0.5)
  const qp = mod.qpActiveSet([-1, -1], 1, [[1, 1]], [1]);
  assert.equal(qp.ok, true);
  assert.ok(Math.abs(qp.u[0] - 0.5) < 1e-12 && Math.abs(qp.u[1] - 0.5) < 1e-12);
  // a non-binding constraint leaves the unconstrained minimizer unchanged
  const qp2 = mod.qpActiveSet([-1, -1], 1, [[1, 1]], [5]);
  assert.ok(Math.abs(qp2.u[0] - 1) < 1e-12 && qp2.active.length === 0);
});

test('tornado signs: thicker skin adds mass and reduces deflection, more ribs add mass only', () => {
  const tor = mod.tornado(D);
  assert.equal(tor.ok, true);
  const skin = tor.rows.find(r => r.key === 'tSkin');
  const mass = skin.responses.find(p => p.key === 'mass');
  const defl = skin.responses.find(p => p.key === 'vTip');
  assert.ok(mass.pctPlus > 0 && mass.pctMinus < 0 && mass.elasticity > 0);
  assert.ok(defl.pctPlus < 0 && defl.pctMinus > 0 && defl.elasticity < 0);
  const ribs = tor.rows.find(r => r.key === 'nRibs');
  assert.ok(ribs.responses.find(p => p.key === 'mass').pctPlus > 0);
  assert.ok(Math.abs(ribs.responses.find(p => p.key === 'vTip').pctPlus) < 1e-9);
  // mass is linear in the skin thickness, so its elasticity is the skin mass fraction (the central
  // difference of the logarithm over +-10 percent differs from the analytic value at order delta^2)
  const base = tor.base;
  assert.ok(Math.abs(mass.elasticity - base.mass.skins / base.mass.total) < 0.01);
});

test('optimizer result is verified feasible and not heavier than a feasible baseline', () => {
  const base = mod.solveWingBox(D);
  assert.equal(base.feasible, true);
  const all = mod.optimizeAll(D);
  assert.equal(all.ok, true);
  assert.ok(all.best, 'a feasible optimum exists');
  const ver = mod.verifyDesign(D, all.best.design);
  assert.equal(ver.feasible, true);
  assert.ok(ver.mass <= base.mass.total + 1e-9);
  assert.ok(Math.abs(ver.mass - all.best.mass) < 1e-9, 'fresh solve matches the optimizer mass');
  // at least one constraint is active at the optimum and the KKT residual is small
  assert.ok(all.analysis.active.length >= 1);
  assert.ok(all.analysis.kktResidual < 1e-3, `KKT residual ${all.analysis.kktResidual}`);
  assert.ok(all.analysis.active.every(a => a.lambda >= 0));
  // the optimum for every rib count is itself not heavier than the baseline design with that rib count
  for (const p of all.perRib) {
    if (!p.feasible) continue;
    const sameRibs = mod.solveWingBox(Object.assign({}, D, { nRibs: p.nRibs }));
    if (sameRibs.feasible) assert.ok(p.mass <= sameRibs.mass.total + 1e-9, `ribs ${p.nRibs}`);
  }
});

test('optimizer reaches the known vertex optimum: both thicknesses at t_min and the cap area set by buckling', () => {
  const n = 15;
  const p = mod.optimizeForRibs(D, n);
  assert.equal(p.feasible, true);
  assert.ok(Math.abs(p.design.tSkin - D.tMin) < 1e-6 && Math.abs(p.design.tWeb - D.tMin) < 1e-6);
  // independent bisection: the cap area at which U_buckle = 1 with both thicknesses at t_min
  const inp = Object.assign({}, D, { nRibs: n, tSkin: D.tMin, tWeb: D.tMin });
  let lo = 0.5, hi = 100;
  for (let k = 0; k < 60; k++) {
    const mid = 0.5 * (lo + hi);
    if (mod.solveWingBox(Object.assign({}, inp, { aCap: mid })).U.buckle <= 1) hi = mid; else lo = mid;
  }
  assert.ok(Math.abs(p.design.aCap / hi - 1) < 1e-5, `A_cap ${p.design.aCap} vs bisection ${hi}`);
  const an = mod.analyzeOptimum(D, p.design);
  const keys = an.active.map(a => a.key).sort();
  assert.deepEqual(keys, ['buckle', 'tSkinMin', 'tWebMin']);
  assert.ok(an.kktResidual < 1e-6);
});

test('optimizer reaches the analytic twist-only optimum t_s = t_w', () => {
  // With only the twist limit active, minimizing 2 w t_s + 2 h t_w at fixed Bredt J gives t_s = t_w
  // (w / h is constant along the span). Many ribs keep the buckling screen inactive.
  const inp = Object.assign({}, D, mod.SCENARIOS['twist-critical'].overrides);
  const p = mod.optimizeForRibs(inp, 16);
  assert.equal(p.feasible, true);
  assert.ok(Math.abs(p.result.U.twist - 1) < 1e-6, `U_twist ${p.result.U.twist}`);
  assert.ok(p.result.U.buckle < 0.98 && p.result.U.defl < 0.98 && p.result.U.stress < 0.98);
  assert.ok(Math.abs(p.design.tSkin / p.design.tWeb - 1) < 1e-3, `t_s ${p.design.tSkin} t_w ${p.design.tWeb}`);
});

test('shadow price check: a 1 percent relaxation of the active buckling screen saves what lambda predicts', () => {
  const all = mod.optimizeAll(D);
  const chk = mod.shadowPriceCheck(D, all.best, all.analysis, 'buckle');
  assert.ok(chk && chk.feasible && chk.verified.feasible);
  assert.ok(chk.predicted > 0);
  assert.ok(Math.abs(chk.actual / chk.predicted - 1) < 0.05, `predicted ${chk.predicted} actual ${chk.actual}`);
  // the deflection constraint is inactive for the default wing: zero shadow price, nothing to save
  const inactive = mod.shadowPriceCheck(D, all.best, all.analysis, 'defl');
  assert.equal(inactive.predicted, 0);
  assert.ok(Math.abs(inactive.actual) < 1e-6);
});

test('optimizer makes an infeasible baseline feasible (spruce caps fail the buckling screen)', () => {
  const inp = Object.assign({}, D, mod.SCENARIOS['spruce-caps'].overrides);
  const base = mod.solveWingBox(inp);
  assert.equal(base.feasible, false);
  assert.equal(base.governing, 'buckle');
  const all = mod.optimizeAll(inp);
  assert.ok(all.best);
  assert.equal(mod.verifyDesign(inp, all.best.design).feasible, true);
});

test('verification routine rejects an infeasible design and names the governing constraint', () => {
  const ver = mod.verifyDesign(D, { tSkin: 0.3, tWeb: 0.3, aCap: 1, nRibs: 2 });
  assert.equal(ver.ok, true);
  assert.equal(ver.feasible, false);
  assert.equal(ver.governing, 'buckle');
  assert.ok(ver.utilizations.buckle > 1);
  const okv = mod.verifyDesign(D, { tSkin: 1.2, tWeb: 1.5, aCap: 25, nRibs: 6 });
  assert.equal(okv.feasible, true);
});

test('rib pitch closed form gives the minimum rib count that passes the buckling screen', () => {
  const rp = mod.ribPitchStudy(D);
  assert.equal(rp.ok, true);
  assert.ok(Number.isFinite(rp.bMax) && rp.bMax > 0);
  // the closed form is the exact inverse of the plate buckling stress at the current skin stress
  const E = 3500;
  assert.ok(Math.abs(mod.plateBucklingStress(D.kBuckle, E, D.nu, D.tSkin, rp.bMax) / rp.sigmaReq - 1) < 1e-9);
  const atMin = mod.solveWingBox(Object.assign({}, D, { nRibs: rp.nMin }));
  assert.ok(atMin.U.buckle <= 1 + 1e-9, `U_buckle at n_min ${atMin.U.buckle}`);
  if (rp.nMin > 1) {
    const below = mod.solveWingBox(Object.assign({}, D, { nRibs: rp.nMin - 1 }));
    assert.ok(below.U.buckle > 1, `U_buckle below n_min ${below.U.buckle}`);
  }
  // every entry of the curve was solved fresh and passes the screen
  for (const e of rp.curve) if (e.buckleOK) assert.ok(e.U.buckle <= 1 + 1e-9);
  assert.ok(rp.best && rp.best.skinPlusRib <= Math.min(...rp.curve.filter(e => e.buckleOK).map(e => e.skinPlusRib)) + 1e-9);
});

test('cap taper saves cap mass at equal root stress and costs deflection', () => {
  const ct = mod.capTaperStudy(D, 'moment', 0.2);
  assert.equal(ct.ok, true);
  assert.ok(ct.capMassSaved > 0);
  assert.ok(ct.deflectionPenalty > 0);
  assert.ok(Math.abs(ct.rootStressTapered / ct.rootStressConstant - 1) < 1e-12);
  // the tapered cap never drops below the floor and equals the root cap at the root
  const A = ct.tapered.span.Acap;
  assert.ok(Math.abs(A[0] - D.aCap) < 1e-12);
  assert.ok(Math.min(...A) >= 0.2 * D.aCap - 1e-12);
  // the fully stressed law keeps the cap stress maximum at the root for a tapered box
  const fs = mod.capTaperStudy(D, 'fullyStressed', 0.2);
  assert.ok(fs.tapered.stress.yCapMax === 0);
});

test('invalid inputs return error objects instead of throwing', () => {
  const bad = [
    { s: -1 }, { s: NaN }, { cTip: 0 }, { tau: 0.9 }, { tSkin: 0 }, { nRibs: 2.5 }, { nRibs: 0 },
    { skinMaterial: 'unobtainium' }, { capMaterial: '' }, { FS: 0.5 }, { loadFactor: -2 }, { nu: 0.5 },
    { deflLimitPct: 0 }, { loadShape: 'triangular' }, { ribMin: 10, ribMax: 4 }, { tMin: 'abc' },
  ];
  for (const b of bad) {
    const r = mod.solveWingBox(Object.assign({}, D, b));
    assert.equal(r.ok, false, JSON.stringify(b));
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 10);
  }
  assert.equal(mod.tornado(Object.assign({}, D, { s: 0 })).ok, false);
  assert.equal(mod.optimizeForRibs(Object.assign({}, D, { tau: 0 }), 6).ok, false);
  assert.equal(mod.ribPitchStudy(Object.assign({}, D, { kBuckle: -4 })).ok, false);
  assert.equal(mod.capTaperStudy(D, 'moment', 1.5).ok, false);
  assert.equal(mod.verifyDesign(D, { tSkin: -1 }).ok, false);
});

test('results are deterministic and contain no NaN for the default and scenario inputs', () => {
  for (const sc of Object.values(mod.SCENARIOS)) {
    const inp = Object.assign({}, D, sc.overrides);
    const a = mod.optimizeAll(inp), b = mod.optimizeAll(inp);
    assert.ok(a.best && b.best);
    assert.equal(a.best.mass, b.best.mass);
    assert.deepEqual(a.best.design, b.best.design);
    const r = mod.solveWingBox(inp);
    for (const k of mod.CONSTRAINT_KEYS) assert.ok(Number.isFinite(r.U[k]), `${k} finite`);
    assert.ok(Number.isFinite(r.mass.total) && Number.isFinite(r.vTip) && Number.isFinite(r.phiTipDeg));
  }
});
