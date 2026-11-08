// Tests for the beam-supports module. Run from /home/claude/optlab with:
//   node --test optimization/beam-supports/beam-supports.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from './beam-supports.js';

const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const P = m.makeParams({});            // L = 1000 mm, Al 6061 tube 30 x 2, w = -2 N/mm full span
const L = P.L, EI = P.EI, w = Math.abs(P.w);

test('parameters derive E and I from the material card and the section', () => {
  assert.equal(P.E, 68900);
  assert.ok(relErr(P.I, Math.PI / 64 * (30 ** 4 - 26 ** 4)) < 1e-12);
  assert.equal(P.c, 15);
  assert.ok(relErr(P.EI, P.E * P.I) < 1e-15);
});

test('simply supported beam under a full-span UDL: midspan moment w L^2 / 8 and deflection 5 w L^4 / (384 EI)', () => {
  const r = m.solveLayout(P, m.layoutA1(0, L));
  assert.ok(r.ok, r.error);
  assert.ok(r.elements >= 120);
  assert.ok(relErr(r.momentAt(L / 2), w * L * L / 8) < 1e-5, 'midspan moment');
  assert.ok(relErr(r.peaks.absM, w * L * L / 8) < 1e-5, 'peak moment');
  assert.ok(relErr(r.deflectionAt(L / 2), -5 * w * L ** 4 / (384 * EI)) < 1e-5, 'midspan deflection (downward, negative)');
  assert.ok(relErr(r.peaks.absD, 5 * w * L ** 4 / (384 * EI)) < 1e-5, 'peak deflection');
  assert.ok(relErr(r.supports[0].R, w * L / 2) < 1e-6 && relErr(r.supports[1].R, w * L / 2) < 1e-6, 'reactions');
  assert.ok(relErr(r.peaks.absV, w * L / 2) < 1e-6, 'peak shear');
  assert.ok(Math.abs(r.momentAt(0)) < 1e-6 * w * L * L && Math.abs(r.momentAt(L)) < 1e-6 * w * L * L, 'zero end moments');
});

test('cantilever with a tip load: deflection P L^3 / (3 EI), root moment -P L, reactions', () => {
  const Lc = 600, Pt = 20, EIc = 3500 * 12 * 24 ** 3 / 12;
  const r = m.solveBeam({ L: Lc, EI: EIc, supports: [{ x: 0, type: 'clamp' }], loads: [{ type: 'point', P: -Pt, a: Lc }] });
  assert.ok(r.ok, r.error);
  assert.ok(relErr(r.deflectionAt(Lc), -Pt * Lc ** 3 / (3 * EIc)) < 1e-6, 'tip deflection');
  assert.ok(relErr(r.momentAt(0, 1), -Pt * Lc) < 1e-6, 'root moment is hogging (negative)');
  assert.ok(relErr(r.supports[0].R, Pt) < 1e-6, 'vertical reaction');
  assert.ok(relErr(r.supports[0].Mr, Pt * Lc) < 1e-6, 'clamp moment reaction (counterclockwise positive)');
  assert.ok(Math.abs(r.momentAt(Lc)) < 1e-6 * Pt * Lc, 'free end moment is zero');
});

test('two-span continuous beam (pins at 0, L/2, L) under a UDL: hogging -w L^2 / 32 and reactions 3/16, 10/16, 3/16 of w L', () => {
  const r = m.solveLayout(P, m.layoutA3(L / 2, L));
  assert.ok(r.ok, r.error);
  assert.ok(relErr(r.momentAt(L / 2), -w * L * L / 32) < 1e-3, 'hogging moment over the middle support');
  assert.ok(relErr(r.supports[0].R, 3 * w * L / 16) < 1e-3, 'left reaction');
  assert.ok(relErr(r.supports[1].R, 10 * w * L / 16) < 1e-3, 'middle reaction');
  assert.ok(relErr(r.supports[2].R, 3 * w * L / 16) < 1e-3, 'right reaction');
  assert.ok(relErr(r.peaks.sagM, 9 * w * L * L / 512) < 1e-6, 'span sagging peak 9 w L^2 / 512');
  const check = m.twoSpanCheck(P);
  assert.ok(check.ok && relErr(check.hogging, check.hoggingClassical) < 1e-6);
});

test('propped cantilever under a UDL: reactions 5/8 and 3/8 of w L, clamp moment w L^2 / 8', () => {
  const r = m.solveBeam({ L, EI, supports: [{ x: 0, type: 'clamp' }, { x: L, type: 'pin' }], loads: [{ type: 'udl', w: -w, a: 0, b: L }] });
  assert.ok(r.ok, r.error);
  assert.ok(relErr(r.supports[0].R, 5 * w * L / 8) < 1e-6);
  assert.ok(relErr(r.supports[1].R, 3 * w * L / 8) < 1e-6);
  assert.ok(relErr(r.momentAt(0, 1), -w * L * L / 8) < 1e-6);
  assert.ok(relErr(r.peaks.sagM, 9 * w * L * L / 128) < 1e-6);
  assert.ok(Math.abs(r.peaks.xSag - 5 * L / 8) < 1e-6 * L, 'sagging peak at 5 L / 8 from the clamp');
});

test('partial UDL and a point load inside an element (consistent load vectors) match statics', () => {
  const half = m.solveBeam({ L, EI, supports: m.layoutA1(0, L), loads: [{ type: 'udl', w: -w, a: 0, b: L / 2 }] });
  assert.ok(half.ok);
  assert.ok(relErr(half.supports[0].R, 3 * w * L / 8) < 1e-6 && relErr(half.supports[1].R, w * L / 8) < 1e-6);
  const a = 301, b = L - a, Pp = 100; // 301 mm merges with the node at 300 mm, so the load sits inside an element
  const pt = m.solveBeam({ L, EI, supports: m.layoutA1(0, L), loads: [{ type: 'point', P: -Pp, a }] });
  assert.ok(pt.ok);
  assert.ok(relErr(pt.momentAt(a), Pp * a * b / L) < 1e-6, 'moment under the load P a b / L');
  assert.ok(relErr(pt.deflectionAt(a), -Pp * a * a * b * b / (3 * EI * L)) < 1e-6, 'deflection under the load');
  assert.ok(relErr(pt.supports[0].R, Pp * b / L) < 1e-6 && relErr(pt.supports[1].R, Pp * a / L) < 1e-6);
});

test('equilibrium holds for an asymmetric indeterminate layout with a clamp and point loads', () => {
  const loads = [{ type: 'udl', w: -1.5, a: 100, b: 700 }, { type: 'point', P: -300, a: 850 }, { type: 'point', P: 120, a: 40 }];
  const r = m.solveBeam({ L, EI, supports: [{ x: 0, type: 'clamp' }, { x: 450, type: 'pin' }, { x: 900, type: 'pin' }], loads });
  assert.ok(r.ok, r.error);
  const sumR = r.supports.reduce((s, sp) => s + sp.R, 0);
  const sumF = -1.5 * 600 - 300 + 120;
  assert.ok(Math.abs(sumR + sumF) < 1e-6 * Math.abs(sumF), 'vertical equilibrium');
  assert.ok(Math.abs(r.momentAt(L)) < 1e-6 * r.peaks.absM, 'free end moment zero');
  for (const s of r.supports) assert.ok(Math.abs(r.deflectionAt(s.x)) < 1e-9, 'zero deflection at supports');
  assert.ok(Math.abs(r.rotationAt(0)) < 1e-12, 'zero rotation at the clamp');
});

test('symmetric overhang sweep: optimum a / L within 0.002 of 0.20711, peak 0.02145 w L^2, reduction 82.8 percent, verified', () => {
  const sw = m.sweepA1(P, { n: 400 });
  assert.equal(sw.a.length, 400);
  assert.ok(sw.optM, 'moment optimum found');
  assert.ok(Math.abs(sw.optM.x / L - 0.20711) < 0.002, `a/L = ${sw.optM.x / L}`);
  assert.ok(Math.abs(sw.optM.x / L - m.A1_OPT_RATIO) < 1e-6, 'refined optimum is close to the closed form');
  assert.ok(relErr(sw.optM.value, m.A1_OPT_MOMENT_COEF * w * L * L) < 1e-6, 'peak moment coefficient');
  assert.ok(Math.abs(1 - sw.optM.value / sw.endsM - m.A1_REDUCTION) < 1e-6, 'reduction versus supports at the ends');
  assert.equal(sw.optM.verified, true);
  assert.ok(sw.optM.verify.balance.momentRatio > 0.9999, 'hogging and sagging peaks are equal at the optimum');
  assert.ok(sw.optD && sw.optD.verified, 'deflection optimum found and verified');
  assert.ok(sw.optD.x / L > 0.21 && sw.optD.x / L < 0.24, 'deflection optimum differs from the moment optimum');
  assert.ok(sw.optD.value < 0.05 * sw.endsD, 'deflection optimum is far below the supports-at-the-ends value');
});

test('three-support sweep: optimum interior support at midspan for a symmetric UDL', () => {
  const sw = m.sweepA3(P, { n: 200 });
  assert.ok(sw.optM && sw.optM.verified);
  assert.ok(Math.abs(sw.optM.x / L - 0.5) < 1e-3);
  assert.ok(relErr(sw.optM.value, w * L * L / 32) < 1e-6);
  assert.ok(sw.twoSpan.ok && relErr(sw.twoSpan.reactions[1], 10 * w * L / 16) < 1e-6);
});

test('two independent supports: heatmap grid and Nelder-Mead refinement reach the symmetric optimum', () => {
  const grid = m.heatmapA2Sync(P, { n: 24 });
  assert.equal(grid.Z.length, 24);
  assert.ok(grid.mask[0][0] === true && grid.mask[5][10] === true && grid.mask[10][5] === false, 'a1 >= a2 is masked');
  assert.ok(Number.isNaN(grid.Z[0][0]) && Number.isFinite(grid.Z[23][0]));
  assert.ok(grid.best);
  const ref = m.refineA2(P, [grid.best.a1, grid.best.a2]);
  assert.ok(Math.abs(ref.a1 / L - m.A1_OPT_RATIO) < 0.002 && Math.abs(ref.a2 / L - (1 - m.A1_OPT_RATIO)) < 0.002, `a1 = ${ref.a1}, a2 = ${ref.a2}`);
  assert.ok(relErr(ref.value, m.A1_OPT_MOMENT_COEF * w * L * L) < 1e-4);
  assert.equal(ref.verified, true);
});

test('midspan moment influence line of a simply supported beam is a triangle with peak L / 4 per unit load', () => {
  const il = m.influenceLines(P, m.layoutA1(0, L), { xs: L / 2, P: -1, n: 201 });
  assert.ok(il.ok, il.error);
  const i = 100; // load at midspan
  assert.ok(Math.abs(il.xp[i] - L / 2) < 1e-9);
  assert.ok(relErr(il.M[i], L / 4) < 1e-6, 'peak L/4');
  assert.ok(relErr(il.M[50], L / 8) < 1e-6, 'quarter-span ordinate L/8 (triangle)');
  assert.ok(Math.abs(il.M[0]) < 1e-6 * L && Math.abs(il.M[200]) < 1e-6 * L, 'zero at the supports');
  assert.ok(Math.abs(il.worst.M.x - L / 2) < 1e-4 * L && relErr(il.worst.M.value, L / 4) < 1e-6);
  assert.equal(il.worst.M.verified, true);
  assert.ok(relErr(Math.abs(il.worst.V.value), 0.5) < 1e-5, 'worst shear at midspan is 0.5 per unit load');
  assert.ok(relErr(Math.abs(il.worst.D.value), L ** 3 / (48 * EI)) < 1e-5, 'worst deflection P L^3 / (48 EI)');
  assert.ok(Math.abs(il.worst.R.x) < 1e-6 && relErr(il.worst.R.value, 1) < 1e-6, 'left reaction is largest with the load above it');
  const cl = m.classicalILCheck(P);
  assert.ok(cl.ok && cl.relErr < 1e-6);
});

test('mechanisms are reported as error objects, not exceptions or NaN', () => {
  const single = m.solveBeam({ L, EI, supports: [{ x: 0, type: 'pin' }], loads: [{ type: 'point', P: -1, a: L / 2 }] });
  assert.equal(single.ok, false);
  assert.match(single.error, /Mechanism/);
  const none = m.solveBeam({ L, EI, supports: [], loads: [{ type: 'point', P: -1, a: L / 2 }] });
  assert.equal(none.ok, false);
  const coincident = m.solveBeam({ L, EI, supports: [{ x: 500, type: 'pin' }, { x: 500.0001, type: 'pin' }], loads: [{ type: 'point', P: -1, a: 200 }] });
  assert.equal(coincident.ok, false);
  assert.ok(coincident.warnings.length === 1, 'merge warning');
  const clamp = m.solveBeam({ L, EI, supports: [{ x: 500, type: 'clamp' }], loads: [{ type: 'point', P: -1, a: 200 }] });
  assert.equal(clamp.ok, true, 'a single clamp is stable');
  assert.equal(m.objective(P, [{ x: 0, type: 'pin' }]), Infinity);
  const outside = m.solveBeam({ L, EI, supports: [{ x: 0, type: 'pin' }, { x: 1200, type: 'pin' }], loads: [] });
  assert.equal(outside.ok, false);
});

test('verification routine rejects infeasible layouts and flags violated constraints', () => {
  const bad = m.verifyLayout(P, m.layoutA2(600, 400));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /increasing/);
  const mech = m.verifyLayout(P, [{ x: 0, type: 'pin' }]);
  assert.equal(mech.ok, false);
  const ends = m.verifyLayout(P, m.layoutA1(0, L), { which: 'moment', claimed: w * L * L / 8 });
  assert.equal(ends.ok, true);
  assert.equal(ends.feasible, false, 'supports at the ends violate stress and deflection limits for the default beam');
  assert.ok(ends.U_stress > 1 && ends.U_defl > 1);
  assert.equal(ends.matches, true);
  const wrongClaim = m.verifyLayout(P, m.layoutA1(0, L), { which: 'moment', claimed: 0.9 * w * L * L / 8 });
  assert.equal(wrongClaim.matches, false);
  const opt = m.verifyLayout(P, m.layoutA1(m.A1_OPT_RATIO * L, L));
  assert.equal(opt.feasible, true);
});

test('golden-section search minimizes a quadratic to 1e-6', () => {
  const g = m.goldenSection(x => (x - 1.2345) ** 2 + 3, -10, 10, 1e-9);
  assert.ok(Math.abs(g.x - 1.2345) < 1e-6);
  assert.ok(Math.abs(g.fx - 3) < 1e-12);
});

test('Nelder-Mead minimizes a quadratic bowl, also with a projection onto bounds', () => {
  const nm = m.nelderMead(v => (v[0] - 1) ** 2 + 10 * (v[1] + 2) ** 2, [5, 5], { step: 1, xtol: 1e-10 });
  assert.ok(Math.abs(nm.x[0] - 1) < 1e-6 && Math.abs(nm.x[1] + 2) < 1e-6);
  const project = p => [Math.min(Math.max(p[0], 0), 0.5), Math.min(Math.max(p[1], 0), 0.5)];
  const bounded = m.nelderMead(v => (v[0] - 1) ** 2 + (v[1] - 1) ** 2, [0.5, 0.5], { step: 0.1, project, xtol: 1e-10 });
  assert.ok(Math.abs(bounded.x[0] - 0.5) < 1e-6 && Math.abs(bounded.x[1] - 0.5) < 1e-6, 'optimum on the bound');
});

test('input parsers accept the documented forms and reject garbage with readable messages', () => {
  const pl = m.parsePointLoads('-300@250; -100 at 900', L);
  assert.deepEqual(pl, { ok: true, loads: [{ P: -300, a: 250 }, { P: -100, a: 900 }] });
  assert.equal(m.parsePointLoads('', L).ok, true);
  assert.equal(m.parsePointLoads('abc', L).ok, false);
  assert.equal(m.parsePointLoads('-5@1200', L).ok, false);
  const sp = m.parseSupports('1000, 0 pin, 600 clamp', L);
  assert.deepEqual(sp.supports, [{ x: 0, type: 'pin' }, { x: 600, type: 'clamp' }, { x: 1000, type: 'pin' }]);
  assert.equal(m.parseSupports('600 wobble', L).ok, false);
  assert.equal(m.parseSupports('', L).ok, false);
  assert.throws(() => m.makeParams({ L: -1 }), /positive/);
  assert.throws(() => m.makeParams({ section: { type: 'tube', D: 30, t: 20 } }), /Section/);
  assert.throws(() => m.makeParams({ pointLoads: [{ P: 1, a: 2000 }] }), /outside/);
});

test('classical checks table reproduces every closed form to better than 1e-6', () => {
  const rows = m.classicalChecks(P);
  assert.ok(rows.length >= 9);
  for (const r of rows) assert.ok(r.relErr < 1e-6, `${r.name}: computed ${r.computed}, classical ${r.classical}`);
});
