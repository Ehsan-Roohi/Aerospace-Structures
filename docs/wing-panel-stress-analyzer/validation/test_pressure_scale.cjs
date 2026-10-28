const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const app = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ctx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(app, 'ui/wx-aero-results.js'), 'utf8'), ctx);
const V = ctx.window.WingAeroStructResults;
const cps = [-4.742, -.8, -.3, -.1, 0, .05, .3, .9444], q = 61.25;
const panels = cps.map(cp => ({ cp, dp: cp * q })), saved = JSON.stringify(panels);
const auto = V.displayScale(panels, 'cp');
assert.equal(auto.lo, -4.742); assert.equal(auto.hi, .9444);
assert.equal(auto.exponent, .5); assert.equal(auto.below + auto.above, 0);
assert.equal(V.colour(0, auto.lo, auto.hi, auto.exponent), 'rgb(0,255,0)');
assert.equal(V.colour(auto.lo, auto.lo, auto.hi, auto.exponent), 'rgb(0,0,255)');
assert.equal(V.colour(auto.hi, auto.lo, auto.hi, auto.exponent), 'rgb(255,0,0)');
const rgb = s => s.match(/\d+/g).map(Number);
const strength = v => { const [r, g, b] = rgb(V.colour(v, auto.lo, auto.hi, .5)); return v < 0 ? b + 255 - g : r + 255 - g; };
for (const sign of [-1, 1]) {
  let last = -Infinity;
  for (let i = 0; i <= 100; ++i) { const s = strength(sign * i / 100 * (sign < 0 ? -auto.lo : auto.hi)); assert.ok(s >= last); last = s; }
}
assert.ok(rgb(V.colour(-.3, auto.lo, auto.hi, .5))[2] > rgb(V.colour(-.3, auto.lo, auto.hi))[2], 'Contrast must distinguish modest suction from green without cutting off the tip peak');
const pas = V.displayScale(panels, 'dp', 'contrast', null, q);
for (const p of panels) assert.equal(V.colour(p.cp, auto.lo, auto.hi, auto.exponent), V.colour(p.dp, pas.lo, pas.hi, pas.exponent));
const manual = V.displayScale(panels, 'cp', 'manual', [-.5, .4]);
assert.equal(manual.below, 2); assert.equal(manual.above, 1); assert.equal(manual.min, -4.742); assert.equal(manual.max, .9444);
const mp = V.displayScale(panels, 'dp', 'manual', [-.5, .4], q);
assert.equal(mp.lo, -.5 * q); assert.equal(mp.hi, .4 * q); assert.equal(mp.below, manual.below); assert.equal(mp.above, manual.above);
assert.equal(V.colour(-1, 0, .4), 'rgb(0,0,255)');
assert.equal(V.colour(1, -.5, 0), 'rgb(255,0,0)');
assert.equal(V.colour(0, -.5, 0), 'rgb(0,255,0)');
for (const limits of [[.1, 1], [-1, -.1], [NaN, 1], [2, 1]]) assert.throws(() => V.displayScale(panels, 'cp', 'manual', limits));
const zero = V.displayScale([{ cp: 0 }], 'cp'); assert.equal(V.colour(0, zero.lo, zero.hi, zero.exponent), 'rgb(0,255,0)');
assert.equal(JSON.stringify(panels), saved, 'Display settings must never change Cp, pressure or export inputs');
const seq = { definition: { baseChord: 32, baseSpan: 16 }, levels: [
  [16,16,-1.1], [32,16,-2], [48,16,-3.4], [64,16,-4.8], [32,8,-1.3], [32,24,-2.3], [32,32,-3]
].map(([chordPanels,spanPanels,minCp]) => ({ chordPanels,spanPanels,diagnostics:{minCp,maxCp:.95} })) };
const before = JSON.stringify(seq), review = V.pressureMeshCheck(seq);
assert.equal(review.rows.length, 7); assert.equal(review.comparisons.length, 2); assert.ok(review.sensitive); assert.equal(review.certified, false);
assert.equal(JSON.stringify(seq), before);
const missing = V.pressureMeshCheck({ levels: [] }); assert.equal(missing.comparisons.length, 0); assert.equal(missing.certified, false);
console.log(JSON.stringify({default_full_range_preserved:true,contrast_monotonic:true,zero_and_RGB_endpoints:true,manual_exceedances_counted:true,Cp_Pa_invariant:true,mesh_sensitive_peaks_flagged:true,no_solver_or_input_mutation:true},null,2));
