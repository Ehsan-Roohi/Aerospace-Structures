'use strict';
/* Independent checks for the Aero comparison workspace. Run: node run-tests.js (Node 18+, no packages).
   Reproduces the recorded benchmark numbers from the data files, exercises the LWM client against the mock
   transport, checks the section worked examples, and lints the page for provenance wording. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const here = __dirname, folder = path.join(here, '..'), root = path.join(folder, '..');
const read = p => fs.readFileSync(p, 'utf8');
const results = [];
function test(name, fn) { try { fn(); results.push([true, name]); } catch (e) { results.push([false, name + ' :: ' + (e && e.message)]); } }
async function atest(name, fn) { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name + ' :: ' + (e && e.message)]); } }
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what || ''} ${a} vs ${b} (tol ${tol})`);

// browser-style scripts: evaluate in a sandbox exposing window/globalThis
function loadBrowserScript(file, sandbox) {
  const ctx = sandbox || { console, window: {}, module: { exports: {} } };
  ctx.window = ctx.window || {}; ctx.globalThis = ctx;
  vm.runInNewContext(read(path.join(folder, file)), ctx, { filename: file });
  return ctx;
}

const bench = JSON.parse(read(path.join(root, 'wing-comparison', 'benchmarks.json')));
const WC = require(path.join(folder, 'wing-compare.js'));
const LW = require(path.join(folder, 'lwm-client.js'));

// ---------------- recorded wing benchmarks ----------------
test('benchmark CL values match the recorded figures', () => {
  const [c91, c92] = bench.cases;
  close(c91.panels[2].result.coefficients.CL, 0.68888764, 1e-8, 'panel 0012');
  close(c91.lwm.integratedMean[0], 0.66930720, 1e-8, 'LWM 0012');
  assert.equal(c91.reference.reportedWingCL, 0.667);
  close(c92.panels[2].result.coefficients.CL, 0.33886882, 1e-8, 'panel 0015');
  close(c92.lwm.integratedMean[0], 0.36492633, 1e-8, 'LWM 0015');
  assert.equal(c92.reference.reportedWingCL, 0.353);
});
test('matched-point Cp MAE recomputed from the raw points equals the recorded accuracy block', () => {
  for (const c of bench.cases) {
    const e = WC.errors(c, c.panels[2]);
    assert.equal(e.n, c.accuracy.panelCpMatched.n);
    assert.equal(e.excluded, c.accuracy.excludedFromPanelComparison);
    close(e.panel, c.accuracy.panelCpMatched.MAE, 1e-9, 'panel MAE ' + c.id);
    close(e.ml, c.accuracy.lwmCpSameMatchedPoints.MAE, 1e-9, 'LWM MAE ' + c.id);
  }
  close(WC.errors(bench.cases[0], bench.cases[0].panels[2]).panel, 0.09322, 5e-6);
  close(WC.errors(bench.cases[0], bench.cases[0].panels[2]).ml, 0.04184, 5e-6);
  close(WC.errors(bench.cases[1], bench.cases[1].panels[2]).panel, 0.10316, 5e-6);
  close(WC.errors(bench.cases[1], bench.cases[1].panels[2]).ml, 0.05227, 5e-6);
});
test('two-sigma coverage recomputed from points equals the recorded percentage', () => {
  for (const c of bench.cases) close(WC.coverage(c).percent, c.accuracy.lwmCpTwoSigmaCoveragePercent, 1e-9, 'coverage ' + c.id);
});
test('paper approximation CL is kept separate from the full pressure projection', () => {
  for (const c of bench.cases) {
    assert.equal(c.lwm.integratedOrder[0], 'CLpressure'); assert.equal(c.lwm.integratedOrder[3], 'CLpaperNormalOnly');
    assert.notEqual(c.lwm.integratedMean[0], c.lwm.integratedMean[3]);
    close(c.accuracy.lwmPaperConventionCL, c.lwm.integratedMean[3], 1e-12);
  }
});
test('panel pressure interpolation stays inside coverage and reproduces centroid rows', () => {
  const c = bench.cases[0], p = c.panels[2], row = p.result.chordwise[3], eta = row.y_mm / p.geometry.semiSpan;
  const [x, cp] = row.upper[5];
  close(WC.pressure(p, eta, 'upper', x), cp, 1e-12, 'centroid reproduction');
  assert.equal(WC.pressure(p, 1.5, 'upper', 0.5), null); assert.equal(WC.pressure(p, eta, 'upper', -0.1), null);
});
test('span loads expose LWM station cl with std and panel strip cl', () => {
  const s = WC.spanLoads(bench.cases[0], bench.cases[0].panels[2]);
  assert.equal(s.lwm.length, bench.cases[0].lwm.stations.length); assert.equal(s.panel.length, bench.cases[0].panels[2].result.strips.length);
  assert.ok(s.lwm.every(q => q.std >= 0 && q.eta >= 0 && q.eta <= 1)); assert.ok(s.panel.every(q => q.eta > 0 && q.eta < 1));
});

// ---------------- LWM client against the mock transport ----------------
const clientTests = (async () => {
  await atest('offline client reports offline and predicts nothing', async () => {
    const cl = LW.createClient({ endpoint: '' });
    assert.equal(cl.state, 'offline');
    const r = await cl.screen([{ section: 'NACA 0012', alphaDeg: 4, mach: 0.15, semiSpanOverChord: 3 }]);
    assert.equal(r.state, 'offline'); assert.equal(r.ranked.length, 0); assert.equal(r.excluded.length, 1);
  });
  await atest('mock transport replays only recorded cases, gates the domain and caches', async () => {
    let calls = 0; const mock = LW.createMockTransport(bench, { coldLoadMs: 900 });
    const cl = LW.createClient({ transport: async (p, b) => { calls++; return mock(p, b); }, now: () => 1000 + calls });
    const pr = await cl.probe(); assert.equal(pr.state, 'cold'); assert.equal(pr.domain.model.commit, bench.source.commit);
    const c91 = bench.cases[0].conditions, c92 = bench.cases[1].conditions;
    const cands = [
      { section: 'naca  0012', alphaDeg: c91.effectiveAlphaDeg, mach: c91.effectiveMach, semiSpanOverChord: c91.semiSpanOverChord },
      { section: 'NACA 0015', alphaDeg: c92.effectiveAlphaDeg, mach: c92.effectiveMach, semiSpanOverChord: c92.semiSpanOverChord },
      { section: 'NACA 0012', alphaDeg: 4, mach: 0.15, semiSpanOverChord: 3.5 },
      { section: 'NACA 0012', alphaDeg: 20, mach: 0.15, semiSpanOverChord: 3 },
      { section: 'NACA 2412', alphaDeg: 4, mach: 0.15, semiSpanOverChord: 3 },
    ];
    const r = await cl.screen(cands, { objective: 'maxCL', topK: 2 });
    assert.equal(cl.state, 'online');
    assert.equal(r.ranked.length, 2); assert.equal(r.ranked[0].candidate.section, 'naca  0012'); close(r.ranked[0].mean[0], 0.66930720, 1e-8);
    assert.equal(r.ranked[1].candidate.section, 'NACA 0015'); assert.equal(r.excluded.length, 3);
    assert.ok(r.excluded.some(x => /recorded benchmarks only/.test(x.reasons.join()))); assert.ok(r.excluded.some(x => /alpha 20/.test(x.reasons.join())));
    assert.ok(r.excluded.some(x => /section NACA 2412/.test(x.reasons.join())));
    assert.equal(r.top.length, 2); assert.ok(r.top[0].covariance && r.top[0].std && r.top[0].stations.length === bench.cases[0].lwm.stations.length);
    close(r.top[0].std[0], Math.sqrt(bench.cases[0].lwm.integratedCovariance[0][0]), 1e-12);
    assert.equal(r.timing.coldLoadMs, 0); assert.equal(r.timing.cacheHits, 0);
    const before = calls; const again = await cl.predict([cands[0]], 'mean'); assert.equal(calls, before); assert.equal(again[0].cacheHit, true);
    const r2 = await cl.screen([cands[0], cands[1]], { objective: 'minRootBending', minCL: 0.5, topK: 1 });
    assert.equal(r2.ranked.length, 1); assert.equal(r2.ranked[0].candidate.section, 'naca  0012'); assert.ok(r2.excluded.some(x => /below target/.test(x.reasons.join())));
    assert.ok(r2.timing.cacheHits >= 2);
  });
  await atest('canonical keys ignore case, spacing and defaults', () => {
    assert.equal(LW.canonical({ section: 'naca  0012', alphaDeg: 8.85, mach: 0.13, semiSpanOverChord: 2.95 }), LW.canonical({ section: 'NACA 0012', alphaDeg: 8.85, mach: 0.13, semiSpanOverChord: 2.95, taperRatio: 1, sweepDeg: 0 }));
  });
})();

// ---------------- section workspace pieces ----------------
test('section screening reproduces the worked examples (Clark Y and NACA 2412 at 4 degrees)', () => {
  const demoPath = path.join(folder, 'demo.json');
  if (!fs.existsSync(demoPath)) throw new Error('demo.json missing');
  const S = require(path.join(folder, 'screen.js'));
  const demo = JSON.parse(read(demoPath));
  const cy = demo.cases.find(c => c.airfoil === 'Clark Y' && c.alphaDeg === 4), n2 = demo.cases.find(c => c.airfoil === 'NACA 2412' && c.alphaDeg === 4);
  const a = S.assess(cy, { re: 3e6, xsc: 0.35, zsc: 0 }), b = S.assess(n2, { re: 3e6, xsc: 0.35, zsc: 0 });
  close(a.lift.mean - 2 * a.lift.std, 0.607745, 5e-6, 'Clark Y lower screen'); close(b.lift.mean - 2 * b.lift.std, 0.588550, 5e-6, 'NACA 2412 lower screen');
  close(a.torqueScore, 0.016847, 5e-6, 'Clark Y moment score'); close(a.moment.mean, -0.014378, 5e-6, 'Clark Y cm at 0.35');
  const q = S.assess(cy, { re: 3e6, xsc: 0.25, zsc: 0 }); close(q.moment.mean, -0.076235, 5e-6, 'Clark Y cm quarter');
  assert.equal(S.scope(400000, 4, 0.15).eligible, false); assert.equal(S.scope(3e6, 4, 0.15).eligible, true);
  for (const c of demo.cases.slice(0, 20)) S.validate(c);
});
test('handoff URL from Wing Lab still targets the section mode of this workspace', () => {
  const H = require(path.join(folder, 'handoff.js'));
  const u = H.url({ kind: 'naca4', code: '0012' }, 4, {}, 'https://example.org/wing-panel-stress-analyzer/');
  assert.ok(u.endsWith('ml-airfoil/?airfoil=NACA+0012&alpha=4#comparison'), u);
});
test('page names the real solvers and keeps Unity to execution provenance only', () => {
  const app = read(path.join(folder, 'app.js')), html = read(path.join(folder, 'index.html'));
  assert.ok(/WingAirfoilPanel2D 1\.1\.0/.test(app) && /WingAeroPanel ' \+ p\.result\.version/.test(app), 'solver names');
  assert.ok(/Large Airfoil Model/.test(app) && /Large Wing Model/.test(app));
  const unityHits = [...app.matchAll(/Unity/g)].length;
  assert.ok(unityHits <= 1, 'Unity may appear at most once in the source (execution provenance); the data string carries the rest');
  for (const label of app.match(/label: '[^']*'/g) || []) assert.ok(!/Unity/.test(label), 'legend label ' + label);
  assert.ok(!/<canvas/.test(html) && !/bar chart/i.test(html), 'no canvas or bar charts');
  for (const id of ['modeSection', 'modeWing', 'chips', 'strip', 'tabs', 'panels', 'docs', 'foil', 'alpha', 'wing', 'eta', 'endpoint', 'screenBtn']) assert.ok(new RegExp('id="' + id + '"').test(html), 'id ' + id);
  const redirect = read(path.join(root, 'wing-comparison', 'index.html'));
  assert.ok(/ml-airfoil\/#wing/.test(redirect), 'wing-comparison redirects to the wing mode');
});

clientTests.then(() => {
  const failed = results.filter(r => !r[0]);
  for (const [ok, name] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
});
