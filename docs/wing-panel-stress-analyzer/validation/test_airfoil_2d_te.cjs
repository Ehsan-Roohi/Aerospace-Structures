// Focused trailing-edge test of the independent 2-D section solver (window.WingAirfoilPanel2D) against EXACT conformal-map
// flows, written here independently of any panel code. Two edges are distinguished:
//   - Joukowski (cusp, edge angle 0; the published test's airfoil: circle centre (-0.08, 0), b = 1): the exact edge speed is
//     FINITE and non-stagnant (q_TE = b W''(b) / 2);
//   - Karman-Trefftz with a 12 deg edge angle (circle centre (-0.075, 0), b = 1; the reviewer's XFOIL case): the exact edge
//     point is a STAGNATION point (Cp = 1 there), approached like s^(2 tau / (2 pi - tau)) = s^0.069, i.e. through a layer far
//     thinner than any panel; at the last-panel mid-point the exact Cp is about 0.4 - 0.5.
// Every panel's Cp is compared with the exact Cp at the SAME physical point (the exact contour point nearest to the panel
// mid-point). All panels are kept in every force and moment. No Cp is clipped or smoothed; the contours are the exact
// conformal contours at uniform circle-angle steps (as the published test builds them).
// Optional: BASE_UI=<published wx-aero-results.js> adds the published solver's numbers for comparison (reported only);
// XFOIL_CASES=<folder of the reviewer's XFOIL 6.99 cases> adds the NACA comparison (XFOIL is a reference calculation; its
// cusp runs are not used as truth). OUT=<folder> receives AIRFOIL_2D_TE_REVIEW.json and AIRFOIL_2D_TE_PROFILES.csv
// (default: this folder).
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..'), OUT = process.env.OUT || __dirname;
function load(ui) { const ctx = vm.createContext({ window: {}, module: { exports: {} }, console, performance }); vm.runInContext(fs.readFileSync(path.join(app, 'wing-aero/aero_bundle.js'), 'utf8'), ctx); vm.runInContext(fs.readFileSync(ui, 'utf8'), ctx); return { P: ctx.window.WingAirfoilPanel2D, ctx }; }
const { P, ctx } = load(path.join(app, 'ui/wx-aero-results.js')), BASE = process.env.BASE_UI ? load(process.env.BASE_UI).P : null;

// ---------------------------------------------------------------- exact Karman-Trefftz / Joukowski flow (complex [re, im])
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }, cabs = a => Math.hypot(a[0], a[1]), sc = (a, s) => [a[0] * s, a[1] * s];
const cpow = (a, k) => { const r = cabs(a); if (r === 0) return [0, 0]; const t = Math.atan2(a[1], a[0]), m = Math.pow(r, k); return [m * Math.cos(k * t), m * Math.sin(k * t)]; };
function exactAirfoil(tauDeg, cx) {
  const b = 1, n = 2 - tauDeg / 180, c0 = [cx, 0], R = b - cx;
  const map = z => { const p = cpow(add(z, [b, 0]), n), m = cpow(sub(z, [b, 0]), n); return sc(div(add(p, m), sub(p, m)), n * b); };
  const dmap = z => { const zp = add(z, [b, 0]), zm = sub(z, [b, 0]), d = sub(cpow(zp, n), cpow(zm, n)); return sc(div(mul(cpow(zm, n - 1), cpow(zp, n - 1)), mul(d, d)), 4 * n * n * b * b); };
  const at = t => add(c0, [R * Math.cos(t), R * Math.sin(t)]), zTE = map([b, 0]), zLE = map(at(Math.PI)), chord = zTE[0] - zLE[0]; // symmetric: LE at t = pi
  const point = t => { const q = map(at(t)); return [(q[0] - zLE[0]) / chord, q[1] / chord]; };
  const circulation = a => 4 * Math.PI * R * Math.sin(a);
  const speed = (t, a) => { const w = sub(at(t), c0), dW = add(sub([Math.cos(a), -Math.sin(a)], sc(div([Math.cos(a), Math.sin(a)], mul(w, w)), R * R)), div([0, circulation(a) / (2 * Math.PI)], w)); return cabs(div(dW, dmap(at(t)))); };
  const cp = (t, a) => 1 - speed(t, a) ** 2;
  const edge = a => { if (n < 2) return { speed: 0, cp: 1, kind: 'finite wedge: stagnation at the edge point' };
    const w = sub([b, 0], c0), W2 = sub(sc(div([Math.cos(a), Math.sin(a)], mul(mul(w, w), w)), 2 * R * R), div([0, circulation(a) / (2 * Math.PI)], mul(w, w))), s = cabs(sc(W2, b / 2)); return { speed: s, cp: 1 - s * s, kind: 'cusp: finite, non-stagnant edge speed' }; };
  const integrals = (a, m = 200000) => { let Fx = 0, Fz = 0, M = 0, prev = point(0);
    for (let i = 1; i <= m; i++) { const p1 = point(2 * Math.PI * i / m), tm = 2 * Math.PI * (i - .5) / m, pm = point(tm), c = cp(tm, a), dx = p1[0] - prev[0], dz = p1[1] - prev[1], fx = -c * dz, fz = c * dx; Fx += fx; Fz += fz; M += pm[1] * fx - (pm[0] - .25) * fz; prev = p1; }
    return { cl: Fz * Math.cos(a) - Fx * Math.sin(a), cm: M }; };
  const nearestT = (X, t) => { for (let it = 0; it < 60; it++) { const h = 1e-7, p = point(t), p1 = point(t + h), p0 = point(t - h), d1 = [(p1[0] - p0[0]) / (2 * h), (p1[1] - p0[1]) / (2 * h)], d2 = [(p1[0] - 2 * p[0] + p0[0]) / (h * h), (p1[1] - 2 * p[1] + p0[1]) / (h * h)], r = [p[0] - X[0], p[1] - X[1]]; const g = r[0] * d1[0] + r[1] * d1[1], H = d1[0] ** 2 + d1[1] ** 2 + r[0] * d2[0] + r[1] * d2[1], st = g / (H > 0 ? H : d1[0] ** 2 + d1[1] ** 2); t -= st; if (Math.abs(st) < 1e-15) break; } return t; };
  return { tauDeg, chord, point, cp, speed, edge, integrals, nearestT, clExact: a => 2 * circulation(a) / chord };
}
const CASES = [['joukowski (cusp)', exactAirfoil(0, -0.08)], ['karman-trefftz 12 deg (finite wedge)', exactAirfoil(12, -0.075)]];

// ---------------------------------------------------------------- runs
const rows = [], profile = ['airfoil,alpha_deg,panels,panel,side,x_c,z_c,Cp_candidate,Cp_exact_same_point,Cp_exact_midpoint_parameter' + (BASE ? ',Cp_published' : '')];
const measure = (A, N, r, a) => {
  const n = r.panels.length, err = r.panels.map((p, i) => p.cp - A.cp(A.nearestT([p.x, p.z], -2 * Math.PI * (i + .5) / N), a));
  const inner = r.panels.map((p, i) => [p, err[i]]).filter(([p]) => p.x > .02 && p.x < .98);
  return { err, rms: Math.sqrt(inner.reduce((s, [, e]) => s + e * e, 0) / inner.length), last: Math.max(Math.abs(err[0]), Math.abs(err[n - 1])), te3: Math.max(...[0, 1, 2, n - 3, n - 2, n - 1].map(i => Math.abs(err[i]))) };
};
for (const [name, A] of CASES) for (const al of [-4, 0, 4, 8]) {
  const a = al * Math.PI / 180, I = A.integrals(a), cl = A.clExact(a), edge = A.edge(a), seq = [];
  assert.ok(Math.abs(I.cl - cl) < 1e-7, 'exact pressure integral reproduces the exact circulation lift');
  for (const N of [80, 160, 320]) {
    const pts = Array.from({ length: N + 1 }, (_, i) => A.point(-2 * Math.PI * i / N)), saved = JSON.stringify(pts), r = P.solveCoordinates(pts, al), m = measure(A, N, r, a);
    assert.equal(JSON.stringify(pts), saved, 'input contour unchanged');
    assert.ok(r.maxResidual < 1e-9 && r.kuttaResidual < 1e-12, 'system rows, panel-mean normal velocity and Kutta residuals');
    assert.ok(r.panels.every(p => p.cp <= 1 + 1e-12) && r.nodes.every(p => p.cp <= 1 + 1e-12), 'Bernoulli bound');
    const exLast = A.cp(A.nearestT([r.panels[0].x, r.panels[0].z], -Math.PI / N), a);
    const row = { airfoil: name, alphaDeg: al, panels: N, cl: r.cl, cl_error: r.cl - cl, cm: r.cm, cm_error: r.cm - I.cm, integrated_cl_error: r.integrated.cl - cl, integrated_cm_error: r.integrated.cm - I.cm,
      circulation_cl_error: r.clCirculation - cl, Cp_RMS_same_point_x_02_98: m.rms, last_panel_max_abs_Cp_error: m.last, last3_panels_max_abs_Cp_error: m.te3,
      exact_Cp_at_last_panel_midpoint: exLast, edge_exact: edge, edge_node_speed: Math.abs(r.trailingEdge.speedUpper), edge_node_Cp: r.trailingEdge.cpNode, edge_angle_deg: r.trailingEdge.includedAngleDeg,
      residual: r.maxResidual, flux_residual: r.fluxResidual, midpoint_normal_velocity: r.midpointNormalVelocity };
    if (BASE) { const rb = BASE.solveCoordinates(pts, al), mb = measure(A, N, rb, a); row.published = { cl_error: rb.cl - cl, cm_error: rb.cm - I.cm, Cp_RMS_same_point_x_02_98: mb.rms, last_panel_max_abs_Cp_error: mb.last, last3_panels_max_abs_Cp_error: mb.te3, edge_gammas: [rb.gamma[0], rb.gamma[N]] }; r.__base = rb; }
    if (al === 4 || al === 0) r.panels.forEach((p, i) => profile.push([name, al, N, i, p.side, p.x, p.z, p.cp, p.cp - m.err[i], A.cp(-2 * Math.PI * (i + .5) / N, a), ...(BASE ? [r.__base.panels[i].cp] : [])].join(',')));
    rows.push(row); seq.push(row);
  }
  const [c, f, F] = seq;
  // the edge: cusp non-stagnant / wedge stagnant only at the edge point
  if (A.tauDeg === 0) { assert.ok(edge.cp < .5, 'exact cusp edge is not a stagnation point'); assert.ok(Math.abs(F.edge_node_speed - edge.speed) < .01 * edge.speed, 'cusp: the edge node speed approaches the exact finite edge speed'); }
  else { assert.equal(edge.cp, 1); assert.ok(seq.every(s => s.exact_Cp_at_last_panel_midpoint < .6), 'wedge: the exact Cp at the last-panel mid-point is far from stagnation'); }
  // trailing-edge region: no spike, converging
  assert.ok(F.last_panel_max_abs_Cp_error < .005, `${name} alpha ${al}: last-panel Cp within 0.005 of exact at 320 panels`);
  assert.ok(F.last3_panels_max_abs_Cp_error < .01 && F.last3_panels_max_abs_Cp_error < f.last3_panels_max_abs_Cp_error, `${name} alpha ${al}: last three panels within 0.01 and converging`);
  // whole contour
  assert.ok(F.Cp_RMS_same_point_x_02_98 < 1e-3 && f.Cp_RMS_same_point_x_02_98 / F.Cp_RMS_same_point_x_02_98 > 2.5, 'Cp RMS < 1e-3 at 320 panels, second order');
  assert.ok(F.midpoint_normal_velocity < f.midpoint_normal_velocity / 3, 'mid-point normal velocity falls at second order');
  if (al) {
    assert.ok(Math.abs(F.cl_error) < 5e-5 && Math.abs(F.cl_error) < Math.abs(f.cl_error) && Math.abs(f.cl_error) < Math.abs(c.cl_error), 'lift (published mid-point convention) < 5e-5 at 320, monotone');
    assert.ok(Math.abs(F.cm_error) < 3e-5 && Math.abs(F.cm_error) < Math.abs(f.cm_error) && Math.abs(f.cm_error) < Math.abs(c.cm_error), 'moment < 3e-5 at 320, monotone');
    assert.ok(seq.every(s => Math.abs(s.integrated_cl_error) < 3e-5), 'exact-integral lift within 3e-5 at every level (not monotone: its error changes sign near 75 panels)');
    assert.ok(Math.abs(F.integrated_cm_error) < 1e-5, 'exact-integral moment within 1e-5 at 320');
  } else assert.ok(seq.every(s => Math.abs(s.cl) < 1e-10 && Math.abs(s.cm) < 1e-10), 'symmetric section at zero incidence');
}
// ---------------------------------------------------------------- XFOIL (reference calculation; optional)
const xfoil = [];
if (process.env.XFOIL_CASES) {
  const num = f => fs.readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.trim().split(/\s+/).map(Number));
  for (const name of ['naca0012', 'naca2412', 'karman_trefftz', 'joukowski']) for (const N of [160, 320]) for (const al of [0, 4]) {
    const dir = path.join(process.env.XFOIL_CASES, `${name}_${N}_a${al}`); if (!fs.existsSync(dir)) continue;
    const appCase = JSON.parse(fs.readFileSync(path.join(dir, 'application.json'), 'utf8')), cp = num(path.join(dir, 'cp.dat')).filter(v => v.length === 3 && v.every(Number.isFinite)), pol = num(path.join(dir, 'polar.dat')).filter(v => v.length >= 7 && v.every(Number.isFinite)).at(-1);
    const r = P.solveCoordinates(appCase.points, al), complete = cp.length === N + 1; let s2 = 0, k = 0, mx = 0;
    if (complete) for (let q = 0; q <= N; q++) { const i = N - q; if (Math.hypot(cp[q][0] - appCase.points[i][0], cp[q][1] - appCase.points[i][1]) > 1e-4) throw Error('XFOIL node order'); if (i > 2 && i < N - 2) { const e = r.nodes[i].cp - cp[q][2]; s2 += e * e; k++; mx = Math.max(mx, Math.abs(e)); } }
    const row = { case: `${name}_${N}_a${al}`, xfoil_cl: pol[1], xfoil_cm: pol[4], cl: r.cl, cm: r.cm, integrated_cl: r.integrated.cl, integrated_cm: r.integrated.cm, xfoil_output_complete: complete, nodal_Cp_RMS_vs_xfoil: complete ? Math.sqrt(s2 / k) : null, nodal_Cp_max_vs_xfoil: complete ? mx : null };
    xfoil.push(row);
    if (name.startsWith('naca') && N === 160) { assert.ok(Math.abs(r.cl - pol[1]) < 1e-3 && Math.abs(r.cm - pol[4]) < 3e-4, `${row.case}: cl and cm within XFOIL's printed precision`); assert.ok(row.nodal_Cp_RMS_vs_xfoil < 2e-3, `${row.case}: nodal Cp RMS against XFOIL < 0.002`); }
  }
}
const report = { method: 'Linear-vorticity panel method with the interior at rest (stream function = constant at the nodes), Kutta gamma0 + gammaN = 0, interior-bisector trailing-edge closure; Cp from the sheet jump with the interior at rest',
  reference: 'Exact Karman-Trefftz conformal-map flows (cusp tau = 0 and finite wedge tau = 12 deg), written in this test; Cp compared at the same physical point',
  rows, xfoil, limits: 'Inviscid, incompressible; exact contours at uniform circle-angle steps. A finite wedge stagnates only at the edge point itself; panel-mid-point values are compared. XFOIL is a reference calculation, not truth for the cusp.' };
fs.writeFileSync(path.join(OUT, 'AIRFOIL_2D_TE_REVIEW.json'), JSON.stringify(report, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'AIRFOIL_2D_TE_PROFILES.csv'), profile.join('\n') + '\n');
console.log(rows.map(r => `${r.airfoil} a ${r.alphaDeg} N ${r.panels}: cl err ${r.cl_error.toExponential(2)} (integrated ${r.integrated_cl_error.toExponential(2)}), cm err ${r.cm_error.toExponential(2)}, RMS ${r.Cp_RMS_same_point_x_02_98.toExponential(2)}, last panel ${r.last_panel_max_abs_Cp_error.toExponential(2)}, last 3 ${r.last3_panels_max_abs_Cp_error.toExponential(2)}, edge node speed ${r.edge_node_speed.toFixed(4)} (exact ${r.edge_exact.speed.toFixed(4)})` + (r.published ? ` | published: cl err ${r.published.cl_error.toExponential(2)}, RMS ${r.published.Cp_RMS_same_point_x_02_98.toExponential(2)}, last panel ${r.published.last_panel_max_abs_Cp_error.toExponential(2)}` : '')).join('\n'));
for (const x of xfoil) console.log(`XFOIL ${x.case}: cl ${x.xfoil_cl} / ${x.cl.toFixed(6)}, cm ${x.xfoil_cm} / ${x.cm.toFixed(6)}${x.xfoil_output_complete ? `, nodal Cp RMS ${x.nodal_Cp_RMS_vs_xfoil.toExponential(2)} max ${x.nodal_Cp_max_vs_xfoil.toExponential(2)}` : ' (XFOIL output incomplete)'}`);
console.log('test_airfoil_2d_te: all assertions passed');
