// Node tests for the truss member sizing module. Run from /home/claude/optlab with:
//   node --test optimization/truss-sizing/truss-sizing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ts from './truss-sizing.js';
import { MATERIALS, TRUSS_PRESETS } from '../shared/presets.js';

const FS = 1.5;

function setup(key, mode, dispLimit = null, dir = 'y') {
  const model = ts.buildModel(key);
  assert.equal(model.ok, true, `model ${key} builds`);
  const vm = ts.variableMap(model, mode);
  const x0 = ts.initialDesign(model, vm);
  const Amin = ts.minimumAreas(model, vm);
  const opts = { FS, buckling: true, K: 1, Amin, disp: { nodes: ts.defaultDisplacementNodes(model), dir, limit: dispLimit } };
  return { model, vm, x0, Amin, opts };
}

// Mixed absolute/relative closeness: |a - b| <= tol * max(|b|, scale)
function close(a, b, tol, scale, msg) {
  const ref = Math.max(Math.abs(b), scale);
  assert.ok(Math.abs(a - b) <= tol * ref, `${msg}: got ${a}, expected ${b} (tol ${tol} x ${ref})`);
}

test('two-bar truss: member force and vertical deflection match the closed form', () => {
  for (const theta of [30, 45, 60]) {
    const preset = ts.makeTwoBarTruss({ theta, L: 1200, P: -1000, A0: 50 });
    const model = ts.buildModel(preset);
    assert.equal(model.ok, true);
    const vm = ts.variableMap(model, 'group');
    const res = ts.solveTruss(model, ts.expandAreas(vm, [50]), { FS, disp: { nodes: [0], dir: 'y', limit: 100 } });
    assert.equal(res.ok, true);
    close(res.N[0], preset.closedForm.N, 1e-10, 1, `N bar 0 at theta ${theta}`);
    close(res.N[1], preset.closedForm.N, 1e-10, 1, `N bar 1 at theta ${theta}`);
    close(res.u[1], preset.closedForm.v, 1e-10, 1e-6, `vertical deflection at theta ${theta}`);
    close(res.disp.value, Math.abs(preset.closedForm.v), 1e-10, 1e-6, 'displacement measure');
    const eq = ts.equilibriumCheck(model, res);
    assert.ok(Math.abs(eq.errY) < 1e-9 && Math.abs(eq.errX) < 1e-9, 'two-bar equilibrium');
  }
});

test('two-bar truss: FSD and gradient method reach the exact fully stressed optimum A = |N| FS / sigma_allow', () => {
  const preset = ts.makeTwoBarTruss({ theta: 40, L: 1000, P: -2000, A0: 200 });
  const model = ts.buildModel(preset);
  const vm = ts.variableMap(model, 'member');
  const Amin = [0.1, 0.1];
  const opts = { FS, buckling: true, K: 1, Amin };
  const Astar = Math.abs(preset.closedForm.N) * FS / MATERIALS.steel.sigmaAllow;
  const massStar = 2 * 1000 * Astar * MATERIALS.steel.rho / 1000;
  const fsd = ts.fullyStressedDesign(model, [200, 200], vm, opts);
  assert.equal(fsd.ok, true);
  assert.equal(fsd.verified.feasible, true);
  close(fsd.x[0], Astar, 1e-9, 1e-9, 'FSD area');
  close(fsd.verified.mass, massStar, 1e-9, 1e-9, 'FSD mass');
  const gd = ts.gradientDesign(model, [200, 200], vm, opts);
  assert.equal(gd.ok, true);
  assert.equal(gd.converged, true);
  assert.equal(gd.verified.feasible, true);
  close(gd.verified.mass, massStar, 1e-3, 1e-9, 'gradient mass');
  assert.ok(gd.verified.maxU <= 1 + 1e-6 && gd.verified.maxU > 0.999, 'gradient design is fully stressed');
});

test('wright-bay solves and the reactions balance the applied loads', () => {
  const { model, vm, x0, opts } = setup('wright-bay', 'group');
  assert.equal(ts.staticIndeterminacy(model), 5);
  assert.deepEqual(ts.defaultDisplacementNodes(model), [4, 9]);
  assert.equal(ts.defaultDisplacementLimit(model), 40);
  const res = ts.solveTruss(model, ts.expandAreas(vm, x0), opts);
  assert.equal(res.ok, true, res.error);
  assert.ok(Array.from(res.N).every(Number.isFinite));
  const eq = ts.equilibriumCheck(model, res);
  const totalLoad = Math.hypot(eq.Fx, eq.Fy);
  assert.ok(Math.abs(eq.errX) <= 1e-8 * totalLoad, `horizontal equilibrium error ${eq.errX}`);
  assert.ok(Math.abs(eq.errY) <= 1e-8 * totalLoad, `vertical equilibrium error ${eq.errY}`);
  assert.ok(res.residual <= 1e-8 * totalLoad, 'free DOF residual');
  // Lift wires are in tension, landing wires are slack (compression) under the point lift case
  assert.ok(res.N[13] > 0 && res.slack[14] === true, 'root bay: lift wire 0-6 in tension, landing wire 5-1 slack');
  // The root strut joins two pinned nodes: zero force
  assert.ok(Math.abs(res.N[8]) < 1e-6, 'root strut carries no force');
  assert.equal(res.mass > 0, true);
});

test('warren: FSD converges with max U within 1e-3 of 1 for variables not at A_min, in both sizing modes', () => {
  for (const mode of ['group', 'member']) {
    const { model, vm, x0, Amin, opts } = setup('warren', mode);
    assert.equal(ts.staticIndeterminacy(model), 0);
    assert.deepEqual(ts.defaultDisplacementNodes(model), [3]);
    const fsd = ts.fullyStressedDesign(model, x0, vm, opts);
    assert.equal(fsd.ok, true, fsd.error);
    assert.equal(fsd.converged, true, `FSD converged (${mode})`);
    assert.ok(fsd.iterations <= 50);
    assert.equal(fsd.verified.feasible, true, `FSD verified feasible (${mode})`);
    const U = fsd.verified.utilizations;
    for (let j = 0; j < vm.n; j++) {
      if (fsd.x[j] <= Amin[j] * (1 + 1e-9)) continue;
      let maxU = 0;
      for (const i of vm.membersOf[j]) maxU = Math.max(maxU, U[i]);
      assert.ok(Math.abs(maxU - 1) < 1e-3, `variable ${vm.names[j]} fully stressed (U = ${maxU})`);
    }
    // closed form from the first solve equals the iterated FSD for a determinate truss
    const cf = ts.closedFormFSD(model, ts.expandAreas(vm, x0), vm, opts);
    assert.equal(cf.determinate, true);
    close(cf.mass, fsd.verified.mass, 1e-9, 1, `closed-form FSD mass (${mode})`);
  }
});

test('analytical sensitivities match central finite differences (warren and wright-bay, both modes)', () => {
  for (const key of ['warren', 'wright-bay']) {
    for (const mode of ['group', 'member']) {
      const { model, vm, x0, opts } = setup(key, mode, 40, 'y');
      // Start from a non-uniform design so that the indeterminate case has non-trivial force redistribution
      const x = x0.map((v, j) => v * (1 + 0.15 * Math.sin(j + 1)));
      const areas = ts.expandAreas(vm, x);
      const res = ts.solveTruss(model, areas, opts);
      assert.equal(res.ok, true);
      const sens = ts.sensitivities(model, areas, vm, opts, res);
      assert.equal(sens.ok, true);
      let Nmax = 0;
      for (const v of res.N) Nmax = Math.max(Nmax, Math.abs(v));
      let nonTrivial = 0;
      for (let j = 0; j < vm.n; j++) {
        const h = 1e-4 * x[j];
        const xp = x.slice(), xm = x.slice();
        xp[j] += h; xm[j] -= h;
        const rp = ts.solveTruss(model, ts.expandAreas(vm, xp), opts);
        const rm = ts.solveTruss(model, ts.expandAreas(vm, xm), opts);
        for (let i = 0; i < model.members.length; i++) {
          const fd = (rp.N[i] - rm.N[i]) / (2 * h);
          close(sens.dN[i][j], fd, 1e-4, Nmax / x[j] * 1e-2, `${key} ${mode} dN${i}/dx${j}`);
          if (Math.abs(fd) > 1e-3 * Nmax / x[j]) nonTrivial++;
        }
        sens.dDisp.forEach((dr, k) => {
          const fd = (rp.disp.values[k] - rm.disp.values[k]) / (2 * h);
          close(dr.d[j], fd, 1e-4, res.disp.values[k] / x[j] * 1e-2, `${key} ${mode} d(delta node ${dr.node})/dx${j}`);
        });
      }
      // In group mode the symmetric Wright bay shares each bay's shear equally between its two crossed wires whatever
      // the common wire area, so only the member-by-member design has non-zero force sensitivities.
      if (key === 'wright-bay' && mode === 'member') assert.ok(nonTrivial > 0, 'indeterminate truss has non-zero force sensitivities');
      if (key === 'warren') assert.equal(nonTrivial, 0, 'determinate truss: forces do not depend on the areas');
      // adjoint and direct method agree on the displacement derivative
      sens.dDisp.forEach(dr => {
        const dof = 2 * dr.node + 1;
        const r = res._map[dof];
        const sg = res.u[dof] >= 0 ? 1 : -1;
        for (let j = 0; j < vm.n; j++) close(dr.d[j], sg * sens.du[j][r], 1e-10, 1e-12, `adjoint vs direct ${key} ${mode} j=${j}`);
      });
    }
  }
});

test('displacement constraint: uniform scaling meets the limit within 1e-6 relative', () => {
  const { model, vm, x0, opts } = setup('warren', 'member', 10, 'y');
  const fsd = ts.fullyStressedDesign(model, x0, vm, opts);
  assert.equal(fsd.ok, true);
  assert.equal(fsd.scaling.applied, true, 'scaling was needed');
  assert.ok(fsd.scaling.factor > 1);
  close(fsd.verified.disp.value, 10, 1e-6, 1e-12, 'scaled displacement equals the limit');
  assert.equal(fsd.verified.feasible, true);
  assert.ok(fsd.verified.maxU <= 1 + 1e-6);
  // member forces are unchanged by uniform scaling, so every utilization dropped by the scale factor or more
  const before = ts.solveTruss(model, fsd.areas.map(a => a / fsd.scaling.factor), opts);
  for (let i = 0; i < model.members.length; i++) assert.ok(Math.abs(before.N[i] - fsd.verified.result.N[i]) < 1e-6 * (Math.abs(before.N[i]) + 1));
});

test('catalog rounding never decreases an area and the rounded warren design is feasible', () => {
  for (const mode of ['group', 'member']) {
    const { model, vm, x0, Amin, opts } = setup('warren', mode, 40, 'y');
    const gd = ts.gradientDesign(model, x0, vm, opts);
    assert.equal(gd.ok, true);
    const rc = ts.roundToCatalog(model, vm, gd.x, null);
    assert.equal(rc.ok, true);
    assert.equal(rc.exceeded.length, 0);
    for (let j = 0; j < vm.n; j++) {
      assert.ok(rc.x[j] >= gd.x[j] * (1 - 1e-12), `rounded area ${rc.x[j]} >= ${gd.x[j]}`);
      const cat = ts.CATALOG_DEFAULTS[model.groups[vm.groupOf[j]].material];
      assert.ok(cat.includes(rc.x[j]), 'rounded value is a catalog size');
    }
    const v = ts.verifyDesign(model, rc.areas, opts, { vm, Amin, xVars: rc.x });
    assert.equal(v.feasible, true, `rounded design feasible (${mode})`);
    assert.ok(v.mass >= gd.verified.mass);
  }
  // Explicit catalog that is too small is flagged, never silently accepted
  const { model, vm } = setup('warren', 'group');
  const rc = ts.roundToCatalog(model, vm, [5000, 100], { chord: '100, 200', diag: [100, 200] });
  assert.equal(rc.exceeded.length, 1);
  assert.equal(rc.exceeded[0].name, 'chord');
  assert.equal(ts.roundToCatalog(model, vm, [100, 100], { chord: '', diag: '1' }).ok, false);
  assert.deepEqual(ts.parseCatalog('400, 600 900;1200 abc -5'), [400, 600, 900, 1200]);
});

test('warren: gradient-method mass is within 0.5 percent of the FSD mass and both designs are feasible', () => {
  for (const mode of ['group', 'member']) {
    const { model, vm, x0, opts } = setup('warren', mode, 40, 'y');
    const fsd = ts.fullyStressedDesign(model, x0, vm, opts);
    const gd = ts.gradientDesign(model, x0, vm, opts);
    assert.equal(fsd.ok && gd.ok, true);
    assert.equal(fsd.verified.feasible, true, `FSD feasible (${mode})`);
    assert.equal(gd.verified.feasible, true, `gradient feasible (${mode})`);
    assert.equal(gd.converged, true, `gradient converged (${mode})`);
    assert.ok(gd.verified.mass <= fsd.verified.mass * 1.005, `gradient ${gd.verified.mass} <= FSD ${fsd.verified.mass} + 0.5 percent (${mode})`);
  }
});

test('tight displacement limit: the gradient method beats FSD plus uniform scaling in the linear comparison, but slack wires prevent admission', () => {
  const { model, vm, x0, opts } = setup('wright-bay', 'member', 12, 'y');
  const fsd = ts.fullyStressedDesign(model, x0, vm, opts);
  const gd = ts.gradientDesign(model, x0, vm, opts);
  assert.equal(fsd.verified.constraintsFeasible, true);
  assert.equal(fsd.verified.feasible, false);
  assert.equal(gd.verified.constraintsFeasible, true);
  assert.equal(gd.verified.feasible, false);
  assert.ok(fsd.scaling.applied, 'FSD needed uniform scaling');
  assert.ok(fsd.verified.disp.value <= 12 * (1 + 1e-6));
  assert.ok(gd.verified.disp.value <= 12 * (1 + 1e-6));
  assert.ok(gd.verified.mass < 0.8 * fsd.verified.mass, `gradient ${gd.verified.mass} well below FSD ${fsd.verified.mass}`);
});

test('verification rejects an infeasible design and labels the governing constraint', () => {
  const { model, vm, x0, Amin, opts } = setup('warren', 'group', 40, 'y');
  const v = ts.verifyDesign(model, ts.expandAreas(vm, x0), opts, { vm, Amin, xVars: x0 });
  assert.equal(v.ok, true);
  assert.equal(v.feasible, false, 'A0 = 300 mm^2 chords fail the buckling screen');
  assert.ok(v.violations.length > 0);
  assert.match(v.governingSummary, /buckling screen/);
  assert.ok(v.maxU > 2);
  // the same design with buckling screen off is governed by stress and feasible
  const v2 = ts.verifyDesign(model, ts.expandAreas(vm, x0), { ...opts, buckling: false });
  assert.equal(v2.feasible, true);
  assert.match(v2.governingSummary, /stress/);
});

test('mechanism (warren without diagonals) and invalid inputs return error objects, never NaN or exceptions', () => {
  const w = TRUSS_PRESETS.warren;
  const noDiag = { ...w, key: 'warren-nodiag', members: w.members.filter(m => m[2] !== 'diag') };
  const model = ts.buildModel(noDiag);
  assert.equal(model.ok, true);
  const vm = ts.variableMap(model, 'group');
  const x0 = ts.initialDesign(model, vm);
  const res = ts.solveTruss(model, ts.expandAreas(vm, x0), {});
  assert.equal(res.ok, false);
  assert.match(res.error, /Unstable structure/);
  assert.equal(ts.fullyStressedDesign(model, x0, vm, {}).ok, false);
  assert.equal(ts.gradientDesign(model, x0, vm, {}).ok, false);
  assert.equal(ts.verifyDesign(model, ts.expandAreas(vm, x0), {}).feasible, false);
  const good = ts.buildModel('warren');
  const gvm = ts.variableMap(good, 'group');
  const areas = ts.expandAreas(gvm, ts.initialDesign(good, gvm));
  assert.equal(ts.solveTruss(good, areas, { FS: 0 }).ok, false);
  assert.equal(ts.solveTruss(good, areas, { FS: NaN }).ok, false);
  assert.equal(ts.solveTruss(good, areas, { K: -1 }).ok, false);
  assert.equal(ts.solveTruss(good, areas.map((a, i) => (i === 2 ? 0 : a)), {}).ok, false);
  assert.equal(ts.solveTruss(good, areas.map((a, i) => (i === 2 ? NaN : a)), {}).ok, false);
  assert.equal(ts.solveTruss(good, areas.slice(1), {}).ok, false);
  assert.equal(ts.solveTruss(good, areas, { disp: { nodes: [99], dir: 'y', limit: 1 } }).ok, false);
  assert.equal(ts.buildModel('no-such-preset').ok, false);
  assert.equal(ts.buildModel({ ...w, supports: {} }).ok, true);
  assert.equal(ts.solveTruss(ts.buildModel({ ...w, supports: {} }), areas, {}).ok, false);
  assert.equal(ts.fullyStressedDesign(good, [NaN, 100], gvm, {}).ok, false);
});

test('dense simplex: known optimum, phase I with negative right-hand sides, infeasible detection', () => {
  // maximize 3x + 2y  s.t. x + y <= 4, x + 3y <= 6, x, y >= 0  -> x = 4, y = 0, objective 12
  const a = ts.simplexLP([-3, -2], [[1, 1], [1, 3]], [4, 6]);
  assert.equal(a.status, 'optimal');
  close(a.z[0], 4, 1e-9, 1, 'x');
  close(a.z[1], 0, 1e-9, 1, 'y');
  close(a.objective, -12, 1e-9, 1, 'objective');
  // minimize x + y  s.t. x + y >= 2 (written as -x - y <= -2), x <= 3, y <= 3  -> objective 2
  const b = ts.simplexLP([1, 1], [[-1, -1], [1, 0], [0, 1]], [-2, 3, 3]);
  assert.equal(b.status, 'optimal');
  close(b.objective, 2, 1e-9, 1, 'phase I objective');
  // x >= 5 and x <= 3 is infeasible
  const c = ts.simplexLP([1], [[-1], [1]], [-5, 3]);
  assert.equal(c.status, 'infeasible');
  assert.ok(c.violation > 1);
});

test('all load cases can be checked for a design, and mass is in grams', () => {
  const { model, vm, x0, opts } = setup('warren', 'member', 40, 'y');
  const fsd = ts.fullyStressedDesign(model, x0, vm, opts);
  const rows = ts.checkAllLoadCases(model, fsd.areas, opts);
  assert.equal(rows.length, model.loadCaseKeys.length);
  assert.equal(rows.find(r => r.loadCase === 'uniform').feasible, true);
  assert.equal(rows.find(r => r.loadCase === 'left half').feasible, false, 'a design sized for one case is not safe for another');
  // mass check: 300 mm^2 everywhere, aluminium 2.70 g/cm^3
  let expected = 0;
  for (const m of model.members) expected += 300 * m.L * 2.70 / 1000;
  close(ts.massOf(model, ts.expandAreas(vm, x0)), expected, 1e-12, 1, 'mass in grams');
});
