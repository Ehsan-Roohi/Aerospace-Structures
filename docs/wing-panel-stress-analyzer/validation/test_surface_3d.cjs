const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ctx = vm.createContext({ window: {}, module: { exports: {} }, console, performance });
vm.runInContext(fs.readFileSync(path.join(app, 'wing-aero/aero_bundle.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(app, 'ui/wx-aero-results.js'), 'utf8'), ctx);
const A = ctx.module.exports, V = ctx.window.WingAeroStructResults;
const G = vm.runInContext('WingGeometry', ctx);
assert.equal(V.colour(-4, -4, 1), 'rgb(0,0,255)');
assert.equal(V.colour(0, -4, 1), 'rgb(0,255,0)');
assert.equal(V.colour(1, -4, 1), 'rgb(255,0,0)');
let mapped = 0;
const cases = [
  { naca: '2412', semiSpan: 450, rootChord: 160, tipChord: 100 },
  { naca: '4415', semiSpan: 450, rootChord: 160, tipChord: 90, sweepDeg: 20, dihedralDeg: 10, twistEnabled: true, stations: [{ eta: 0, airfoil: { kind: 'naca4', code: '4415' }, incidenceDeg: 3 }, { eta: 1, airfoil: { kind: 'naca4', code: '0012' }, incidenceDeg: -2 }] },
  { naca: '2412', planform: 'delta', semiSpan: 300, rootChord: 180, tipChord: 0 },
  { naca: '2412', planform: 'elliptic', semiSpan: 300, rootChord: 160, tipChord: 0 }
];
for (const raw of cases) {
  const g = A.aeroGeometry(raw), wm = A.wingMesh(g, { chordPanels: 12, spanPanels: 8 });
  const strips = [], chordwise = [];
  for (let j = 0; j < wm.ns; ++j) {
    const y0 = wm.ys[j], y1 = wm.ys[j + 1], yMid = (y0 + y1) / 2, c = G.chordAt(g, yMid);
    strips.push({ y0, y1, yMid, chord: c, quarterChordPoint_mm: G.transformPoint(g, yMid, [0.25 * c, 0]) });
    const lower = [], upper = [];
    for (let i = 0; i < wm.ni; ++i) {
      const k = wm.index(i, j), P = Array.from(wm.S.PC.slice(3 * k, 3 * k + 3));
      const local = G.inversePoint(g, P), xc = local[0] / G.chordAt(g, P[1]);
      (i < wm.nHalf ? lower : upper).push([xc, k + 0.125]);
    }
    lower.reverse(); chordwise.push({ upper, lower });
  }
  const b = { strips, chordwise, mesh: { ...wm.options, chordPanelsPerSurface: wm.nHalf, wingPanels: wm.wingPanels, roundedTip: wm.roundedTip }, flow: { dynamicPressure_Pa: 198.45 } };
  const before = JSON.stringify(b), f = V.surfaceField3D(b, raw);
  assert.equal(f.panels.length, wm.wingPanels);
  for (const p of f.panels) {
    assert.equal(p.cp, p.panelIndex + 0.125, 'Cp must stay on its original solver panel');
    assert.equal(p.dp, 198.45 * p.cp);
    assert.equal(JSON.stringify(p.vertices.flat()), JSON.stringify(Array.from(wm.S.PV.slice(12 * p.panelIndex, 12 * p.panelIndex + 12))), 'Actual aerodynamic panel vertices must match');
    ++mapped;
  }
  assert.equal(JSON.stringify(b), before, 'Rendering must not modify solver data');
  const wrong = { ...b, mesh: { ...b.mesh, spanPanels: 9 } };
  assert.throws(() => V.surfaceField3D(wrong, raw), /do not match/);
}
console.log(JSON.stringify({ cases: cases.length, panels_verified: mapped, rgb_zero_and_extremes: true, immutable_solver_data: true, mismatched_mesh_refused: true }, null, 2));
