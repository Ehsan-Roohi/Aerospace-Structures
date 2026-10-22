// Study files, design-parameter import, SHA-256, share links, previews and the mounted file panel.
// Run from the repository root:
//   MIE446_JSDOM_MODULE=/path/to/node_modules/jsdom node computational/printed-wing-solver/web/test_wing_study_io.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const IO = require('./wing_study_io.js');
const E = require('./engine.js');
const M = require('./metal_wing_engine.js');
const { JSDOM } = require(process.env.MIE446_JSDOM_MODULE || 'jsdom');
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const t0 = Date.now();

let checks = 0;
const groups = [];
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const deq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const has = (list, re, m) => { assert.ok(list.some((x) => re.test(x)), `${m || ''} expected ${re} in ${JSON.stringify(list)}`); checks++; };
async function group(name, fn) {
  const c0 = checks;
  try { await fn(); groups.push({ name, ok: true, checks: checks - c0 }); }
  catch (e) { groups.push({ name, ok: false, checks: checks - c0, error: e }); console.error(`FAIL ${name}\n${e && e.stack ? e.stack : e}`); }
}
const sha = (data) => createHash('sha256').update(data).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------- UI-state helpers (mirror wing_lab_template.html)
const baseS = () => ({
  geometry: { ...E.DEFAULT_GEOMETRY, rodFractions: [...E.DEFAULT_GEOMETRY.rodFractions] },
  plaKey: 'pla_upright', rodKey: 'rod_hobby', plaOver: { E: null, ft: null, fc: null, fs: null }, rodOver: { E: null },
  assembly: { ...E.DEFAULT_ASSEMBLY, seamFreeLength: 8 }, load: { ...E.DEFAULT_LOAD }, criteria: { ...E.DEFAULT_CRITERIA },
  selected: 'part', plot: 'model', deformed: false, scale: 1,
});
function uiEngineInput(S) {           // engineInput() of the page
  const pla = { ...E.MATERIALS[S.plaKey] };
  for (const k of ['E', 'ft', 'fc', 'fs']) if (S.plaOver[k] > 0) pla[k] = S.plaOver[k];
  if(S.plaOver.rho>0)pla.rho=S.plaOver.rho;if(S.plaOver.nu!=null)pla.nu=S.plaOver.nu;
  const rod = { ...E.MATERIALS[S.rodKey] };
  if (S.rodOver.E > 0) rod.E = S.rodOver.E;
  return { geometry: { ...S.geometry }, pla, rod, assembly: { ...S.assembly }, load: { ...S.load }, criteria: { ...S.criteria } };
}
const applyPrinted = (S, state) => ({ ...S, ...clone(state) });   // what the page's applyState does
const absMax = (a) => Math.max(...Array.from(a, Math.abs));
const printedSummary = (r) => ({
  massTotal: r.mass.total, massPrinted: r.mass.printed, rootEI: r.sections[0].EIf, rootGJ: r.sections[0].GJ,
  V0: r.V[0], M0: r.M[0], T0: r.T[0], tipDeflection: r.deflection[r.deflection.length - 1], tipTwist: r.twist[r.twist.length - 1],
  sigTop: absMax(r.stress.sigTop), sigBot: absMax(r.stress.sigBot), sigRod: absMax(r.stress.sigRod), tau: absMax(r.stress.tau),
  skinComp: absMax(r.stress.skinComp), femTip: r.fem.w[r.fem.w.length - 1], f1: r.fem.fBending[0], checks: r.checks.map((c) => [c.name, c.U]),
});
const baseMS = () => ({ n: 6, distribution: 'liftingLine', inertiaRelief: true, include: { fuel: true, guns: true, ammo: true }, scales: { skin: 1, web: 1, boom: 1, stringer: 1 }, support: 'fittings', taper: true, mass: M.D520.aircraft.mass, CL: M.D520.aircraft.CL, material: { ...M.D520.material } });
const d520Summary = (r) => ({
  wMax: r.tip.wMax, twist: r.tip.twistDeg, mass: r.mass.structuralHalf, nonStructural: r.mass.nonStructuralHalf, fitting: r.fitting,
  boom: Math.max(...r.stations.map((s) => Math.max(Math.abs(s.boomU), Math.abs(s.boomL)))), web: Math.max(...r.stations.map((s) => Math.abs(s.tauWeb))),
  M: r.grid.M, V: r.grid.V, T: r.grid.T, stations: r.stations.length,
});
const SAVED = '2026-10-18T12:00:00.000Z';
const printedDoc = () => JSON.parse(IO.exportPrintedStudy(baseS(), E, { savedAt: SAVED }));
const d520Doc = () => JSON.parse(IO.exportD520Study(baseMS(), M, { savedAt: SAVED }));
const P = (doc) => IO.importPrintedStudy(JSON.stringify(doc), E);
const D = (doc) => IO.importD520Study(JSON.stringify(doc), M);
const refused = (r, re, m) => { eq(r.ok, false, `${m}: should be rejected`); eq(r.state, null, `${m}: no partial state`); has(r.errors, re, m); };
const template = () => clone(IO.PARAMETER_TEMPLATE);
const Q = (doc, filename) => IO.importParameters(typeof doc === 'string' ? doc : JSON.stringify(doc), { engine: E, filename });
const rejectedParams = (r, re, m) => { eq(r.status, 'rejected', `${m}: status`); eq(r.ok, false, m); eq(r.state, null, m); eq(r.geometry, null, m); has(r.errors, re, m); };
const COMPLETE = {
  structure: { skin: 1.2, ribs: { interior: 3, thickness: 1.6 }, rods: { fractions: [0.3, 0.6], diameter: 4, clearance: 0.25, sleeveWall: 1.2, bonded: false }, modules: 3, seams: { bonded: false, freeLength: 8, adhesiveTensile: 5 } },
  material: { shell: { card: 'pla_upright' }, rod: { card: 'rod_hobby' } },
  supports: { root: 'clamped' },
  loads: { kind: 'tip', tipForce: 2, tipFraction: 0.3, fos: 1.5, tipMass: 0 },
};

// ---------------------------------------------------------------- SHA-256, UTF-8, base64url
await group('sha256 vectors', () => {
  eq(IO.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'empty');
  eq(IO.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'abc');
  eq(IO.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1', '448-bit message');
  eq(IO.sha256('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu'), 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1', '896-bit message');
  eq(IO.sha256('a'.repeat(1000000)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0', 'one million a');
  const utf = 'Flügel Ø ±0.25 mm — 机翼 🛩️ '.repeat(40);
  ok(IO.utf8Encode(utf).length > 128, 'multi-block message');
  eq(IO.sha256(utf), sha(Buffer.from(utf, 'utf8')), 'multi-block UTF-8 text');
  eq(IO.sha256(Buffer.from(utf, 'utf8')), sha(Buffer.from(utf, 'utf8')), 'same text as bytes');
  for (const n of [55, 56, 63, 64, 65, 119, 120, 127, 128]) eq(IO.sha256('x'.repeat(n)), sha('x'.repeat(n)), `padding boundary ${n}`);
});
await group('utf-8 and base64url', () => {
  const s = 'ASCII, é, €, 机, 🛩️ and \u0000';
  deq(Array.from(IO.utf8Encode(s)), Array.from(Buffer.from(s, 'utf8')), 'encoder = Node');
  eq(IO.utf8Decode(Buffer.from(s, 'utf8')), s, 'decoder round trip');
  for (const bad of [[0xc0, 0x80], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf8], [0xe2, 0x82], [0x80]]) assert.throws(() => IO.utf8Decode(Uint8Array.from(bad)), /UTF-8/), checks++;
  for (let n = 0; n < 7; n++) { const b = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 255); deq(Array.from(IO.base64urlDecode(IO.base64urlEncode(b))), Array.from(b), `base64url length ${n}`); eq(IO.base64urlEncode(b), Buffer.from(b).toString('base64url'), `base64url = Node ${n}`); }
  assert.throws(() => IO.base64urlDecode('ab+c')); assert.throws(() => IO.base64urlDecode('abcde')); checks += 2;
});
await group('strict JSON reader', () => {
  deq(IO.parseJson('{"a":[1,-2.5e3,true,false,null,"x\\u00e9"]}').a, [1, -2500, true, false, null, 'xé'], 'valid JSON');
  const bad = [
    ['{"a": NaN}', /NaN is not allowed/], ['{"a": Infinity}', /Infinity is not allowed/], ['{"a": -Infinity}', /-Infinity is not allowed/],
    ['{"a": 1e400}', /overflows to infinity/], ['{"a": -1e400}', /overflows/], ['{"a": 1e-400}', /underflows to zero/], ['{"a": 01}', /invalid number/],
    ['{"a": 1, "a": 2}', /duplicate field "a"/], ['{"a": [1,]}', /trailing comma/], ['{"a": 1,}', /trailing comma/], ['{"a": 1} // c', /comments/],
    ["{'a': 1}", /double quotes/], ['{"a": "x\ny"}', /control character/], ['{"a": "\\ud800"}', /surrogate/], ['{"a": undefined}', /undefined is not allowed/],
    ['{"a": 1} 2', /after the end/], ['{"a": "x', /not closed/], ['[1, 2', /expected , or \]/], ['', /ends where a value/],
    ['['.repeat(13) + ']'.repeat(13), /nested more than 12/], [`[${'1,'.repeat(256)}1]`, /more than 256/],
  ];
  for (const [text, re] of bad) assert.throws(() => IO.parseJson(text), re, text.slice(0, 30)), checks++;
  const e = (() => { try { IO.parseJson('{\n  "study": {\n    "geometry": {"semiSpan": NaN}}}'); } catch (x) { return x; } })();
  eq(e.jsonPath, 'study.geometry.semiSpan', 'error path'); eq(e.line, 3, 'error line'); ok(/line 3, column/.test(e.message), 'line and column in message');
  const proto = IO.parseJson('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}}');
  ok(Object.prototype.hasOwnProperty.call(proto, '__proto__'), '__proto__ kept as plain data');
  eq({}.polluted, undefined, 'Object.prototype not polluted');
});

// ---------------------------------------------------------------- printed wing: native round trips
await group('printed round trips reproduce WingEngine results exactly', () => {
  const cases = [];
  const S1 = baseS();                                                    // 3 modules, 2 rods, 3 interior ribs, flight (Schrenk)
  cases.push(['default flight', S1]);
  cases.push(['flight elliptic, tip mass at 0.4c, no relief', { ...baseS(), load: { ...E.DEFAULT_LOAD, distribution: 'elliptic', inertiaRelief: false, tipMass: 20, tipFraction: 0.4, loadFactor: 3, aircraftMass: 1.2 } }]);
  cases.push(['flight with relief and tip mass', { ...baseS(), load: { ...E.DEFAULT_LOAD, tipMass: 15, tipFraction: 0.45 } }]);
  cases.push(['tip force (stale flight fields in the UI)', { ...baseS(), load: { ...E.DEFAULT_LOAD, kind: 'tip', tipForce: 5, tipFraction: 0.35, loadFactor: 6 } }]);
  cases.push(['custom point + distributed', { ...baseS(), load: { ...E.DEFAULT_LOAD, kind: 'custom', items: [{ kind: 'point', position: 300, force: 2, fraction: 0.3 }, { kind: 'distributed', start: 50, end: 400, qStart: 0.004, qEnd: 0.001, fraction: 0.4 }] } }]);
  cases.push(['custom [] (no load defined)', { ...baseS(), load: { kind: 'custom', items: [], fos: 1.5, tipMass: 0 } }]);
  const shell = baseS();                                                 // 1 module, 0 rods, no ribs (learning stage "shell")
  Object.assign(shell.geometry, { modules: 1, customInteriorRibs: [], rodFractions: [] });
  Object.assign(shell, { plaOver: {}, rodOver: {}, assembly: { ...E.DEFAULT_ASSEMBLY, seamFreeLength: 8, seamsBonded: true }, load: { ...E.DEFAULT_LOAD, kind: 'tip', tipForce: 2, tipFraction: 0.3 } });
  cases.push(['1 module, 0 rods, tip force', shell]);
  const one = baseS();                                                   // 2 modules, 1 rod, dry seam
  Object.assign(one.geometry, { modules: 2, rodFractions: [0.35], interiorRibs: 2 });
  one.load = { ...E.DEFAULT_LOAD, kind: 'custom', items: [{ kind: 'point', position: 450, force: 1.5, fraction: 0.25 }] };
  cases.push(['2 modules, 1 rod, custom point', one]);
  const three = baseS();                                                 // 1 module, 3 rods, custom ribs (learning stage "ribs")
  Object.assign(three.geometry, { modules: 1, rodFractions: [0.25, 0.45, 0.65], customInteriorRibs: [337.5, 112.5, 146, 154, 225, 296, 304] });
  three.assembly.seamsBonded = true;
  cases.push(['1 module, 3 rods, custom ribs (unsorted in the UI)', three]);
  const other = baseS();                                                 // other airfoil, planform, cards and joints
  Object.assign(other.geometry, { naca: '0012', semiSpan: 500, rootChord: 200, tipChord: 120, modules: 2, skin: 1.0, ribThickness: 2, interiorRibs: 4 });
  Object.assign(other, { plaKey: 'pla_flat', plaOver: { E: 3200, ft: 40, fc: null, fs: -1 }, rodKey: 'rod_t700', rodOver: { E: 120000 }, assembly: { rodsBonded: true, seamsBonded: false, seamFreeLength: null, adhesiveTensile: 6 }, criteria: { maxTipDeflection: 30, maxTipTwist: 1.5 } });
  other.load = { ...E.DEFAULT_LOAD, distribution: 'planform', liftFraction: 0.3 };
  cases.push(['NACA 0012, 2 modules, flat PLA, T700, bonded rods', other]);
  for (const [name, S] of cases) {
    const text = IO.exportPrintedStudy(S, E, { savedAt: SAVED });
    const doc = JSON.parse(text);
    eq(doc.format, 'mie446-wing-study', name); eq(doc.version, 1, name); eq(doc.workspace, 'printed', name); eq(doc.app.engine, E.VERSION, name);
    deq(Object.keys(doc.study), ['geometry', 'materials', 'assembly', 'load', 'criteria'], `${name}: study sections`);
    const r = IO.importPrintedStudy(text, E, { filename: 'study.json' });
    deq(r.errors, [], `${name}: imports cleanly`); eq(r.ok, true, name);
    eq(r.provenance.sha256, sha(Buffer.from(text, 'utf8')), `${name}: provenance hash`); eq(r.provenance.bytes, Buffer.byteLength(text), `${name}: bytes`);
    const S2 = applyPrinted(S, r.state);
    deq(IO.printedEngineInput(r.state, E), uiEngineInput(S2), `${name}: printedEngineInput = page engineInput`);
    const a = E.solve(uiEngineInput(S)), b = E.solve(uiEngineInput(S2));
    deq(printedSummary(b), printedSummary(a), `${name}: identical results`);
    deq(Array.from(b.deflection), Array.from(a.deflection), `${name}: identical deflection line`);
    if (S.load.kind !== 'tip' || S.load.loadFactor === E.DEFAULT_LOAD.loadFactor) deq(E.normalize(uiEngineInput(S2)), E.normalize(uiEngineInput(S)), `${name}: identical normalised input`);
    eq(IO.exportPrintedStudy(S2, E, { savedAt: SAVED }), text, `${name}: export → import → export is a fixed point`);
  }
  // canonical forms: sorted ribs, effective overrides only, tip-load fields only
  const sorted = JSON.parse(IO.exportPrintedStudy(three, E)).study;
  deq(sorted.geometry.customInteriorRibs, [112.5, 146, 154, 225, 296, 304, 337.5], 'rib stations stored in engine order');
  deq(JSON.parse(IO.exportPrintedStudy(other, E)).study.materials.plaOver, { E: 3200, ft: 40, fc: null, fs: null,rho:null,nu:null }, 'non-positive override stored as card value (as the page uses it)');
  deq(Object.keys(JSON.parse(IO.exportPrintedStudy(cases[3][1], E)).study.load), ['kind', 'tipForce', 'tipFraction', 'fos', 'tipMass'], 'only the active load case is stored');
  deq(JSON.parse(IO.exportPrintedStudy(shell, E)).study.materials, { plaKey: 'pla_upright', plaOver: { E: null, ft: null, fc: null, fs: null,rho:null,nu:null }, rodKey: 'rod_hobby', rodOver: { E: null } }, 'empty override objects');
  // exporting an invalid UI state is refused with the reasons
  const broken = baseS(); broken.geometry.skin = 8;
  assert.throws(() => IO.exportPrintedStudy(broken, E), (e) => /cavity collapses/.test(e.message) && Array.isArray(e.errors)); checks++;
  const nan = baseS(); nan.geometry.semiSpan = NaN;
  assert.throws(() => IO.exportPrintedStudy(nan, E), /semiSpan: must be a finite number in mm, not NaN/); checks++;
});
await group('printed: load kinds the engine may not support yet', () => {
  const S = { ...baseS(), load: { kind: 'custom', fos: 1.5, tipMass: 0, items: [
    { kind: 'elliptic', start: 0, end: 450, shape: 'start', total: 2, fraction: 0.3 },
    { kind: 'parabolic', start: 100, end: 400, shape: 'middle', peak: 0.004, fraction: 0.35, label: 'bench sandbag' },
    { kind: 'table', points: [[0, 0.002, 0.25], [225, 0.001, 0.3], [450, 0, 0.3]], source: { filename: 'lift.csv', sha256: 'a'.repeat(64), rows: 3 } },
    { kind: 'schrenk', total: 4, fraction: 0.25 },
    { kind: 'point', position: 225, force: -1, fraction: 0.5 },
  ] } };
  const text = IO.exportPrintedStudy(S, E, { savedAt: SAVED });
  const r = IO.importPrintedStudy(text, E);
  eq(r.ok, true, 'accepted after structural checks'); deq(r.state.load, JSON.parse(text).study.load, 'items preserved exactly');
  const supported = (k) => { try { E.normalize({ load: { kind: 'custom', items: [k] } }); return true; } catch { return false; } };
  const missing = ['elliptic', 'parabolic', 'table', 'schrenk'].filter((k) => !supported(S.load.items.find((i) => i.kind === k)));
  if (missing.length) has(r.warnings, new RegExp(`cannot analyse .*"${missing[0]}"`), 'engine without the new kinds: warning instead of a physics check');
  else eq(r.warnings.length, 0, 'engine supports every kind: no warning');
  eq(IO.countSegments(r.state.load.items), 6, 'segments: table rows − 1 + one per other item');
  // a normalised curve with both total and peak plus its basis is saved as the basis only
  const both = { ...baseS(), load: { kind: 'custom', fos: 1.5, tipMass: 0, items: [{ kind: 'elliptic', start: 0, end: 450, shape: 'middle', basis: 'peak', total: 1.4137, peak: 0.004, fraction: 0.3 }] } };
  deq(JSON.parse(IO.exportPrintedStudy(both, E)).study.load.items[0], { kind: 'elliptic', start: 0, end: 450, shape: 'middle', peak: 0.004, fraction: 0.3 }, 'basis kept, derived value dropped');
});

// ---------------------------------------------------------------- D.520 round trips
await group('D.520 round trips reproduce MetalWingEngine results exactly', () => {
  const cases = [
    ['default flight n = 6', baseMS()],
    ['negative g, Schrenk, scaled, clamped, no taper', { ...baseMS(), n: -3, distribution: 'schrenk', inertiaRelief: false, include: { fuel: false, guns: true, ammo: false }, scales: { skin: 0.75, web: 1.25, boom: 0.6, stringer: 1.1 }, support: 'clamped', taper: false, mass: 2500, CL: 1.2, material: { ...M.D520.material, E: 70e9, name: 'Alloy B' } }],
    ['custom [] (no load defined)', { ...baseMS(), n: 1, customLoads: [] }],
    ['custom point + trapezoid ×2', { ...baseMS(), n: 2, customLoads: [{ kind: 'point', position: 3, force: 1000, fraction: 0.25 }, { kind: 'distributed', start: 1, end: 4, qStart: 500, qEnd: 1500, fraction: 0.3 }] }],
    ['custom at the bounds', { ...baseMS(), n: 1, customLoads: [{ kind: 'point', position: M.D520.fittingY, force: 100, fraction: 0 }, { kind: 'distributed', start: M.D520.fittingY, end: M.D520.ribs.at(-1), qStart: 10, qEnd: 0, fraction: 1 }] }],
  ];
  for (const [name, MS] of cases) {
    const text = IO.exportD520Study(MS, M, { savedAt: SAVED });
    const doc = JSON.parse(text);
    eq(doc.workspace, 'd520', name); eq(doc.app.engine, M.VERSION, name);
    const r = IO.importD520Study(text, M);
    deq(r.errors, [], `${name}: imports cleanly`);
    deq(M.normalise(r.state), M.normalise({ customLoads: null, ...MS }), `${name}: identical normalised input (absent customLoads = null = flight)`);
    const a = M.solve({ ...MS, collapse: false, modes: false }), b = M.solve({ ...r.state, collapse: false, modes: false });
    deq(d520Summary(b), d520Summary(a), `${name}: identical results`);
    eq(IO.exportD520Study(r.state, M, { savedAt: SAVED }), text, `${name}: fixed point`);
  }
  eq(IO.importD520Study(IO.exportD520Study(baseMS(), M), M).state.customLoads, null, 'null customLoads = flight loading');
  deq(IO.importD520Study(IO.exportD520Study({ ...baseMS(), customLoads: [] }, M), M).state.customLoads, [], '[] = no load defined');
  const curve = IO.importD520Study(IO.exportD520Study({ ...baseMS(), n: 1, customLoads: [{ kind: 'elliptic', start: 0.46, end: 4.93, shape: 'start', total: 20000, fraction: 0.25 }, { kind: 'table', points: [[0.46, 1200], [2.5, 800], [4.93, 0]], fraction: 0.25 }] }, M), M);
  eq(curve.ok, true, 'D.520 elliptic and table items accepted after structural checks');
});

// ---------------------------------------------------------------- neutral design parameters
await group('design parameters: unit and span conversions are exact', () => {
  const conv = [
    [{ length: 'mm' }, { value: 450, kind: 'semi' }, 160, 100, [450, 160, 100]],
    [{ length: 'mm' }, { value: 900, kind: 'full' }, 160, 100, [450, 160, 100]],
    [{ length: 'cm' }, { value: 45, kind: 'semi' }, 16, 10, [450, 160, 100]],
    [{ length: 'cm' }, { value: 90, kind: 'full' }, 16.5, 9.7, [450, 165, 97]],
    [{ length: 'm' }, { value: 0.9, kind: 'full' }, 0.16, 0.07, [450, 160, 70]],
    [{ length: 'm' }, { value: 0.3571, kind: 'semi' }, 0.1573, 0.1234, [357.1, 157.3, 123.4]],
    [{ length: 'in' }, { value: 36, kind: 'full' }, 6.3, 1.5, [457.2, 160.02, 38.1]],
    [{ length: 'in' }, { value: 17.7, kind: 'semi' }, 6.3, 3.9, [449.58, 160.02, 99.06]],
  ];
  ok(1.5 * 25.4 !== 38.1 && 6.3 * 25.4 !== 160.02 && 0.3571 * 1000 !== 357.1 && 0.1234 * 1000 !== 123.4, 'plain floating-point products would not be exact');
  for (const [units, span, rootChord, tipChord, [s, rc, tc]] of conv) {
    const r = Q({ ...template(), units, span, rootChord, tipChord });
    const m = `${span.value} ${units.length} ${span.kind}`;
    eq(r.status, 'geometry-only', m); deq(r.errors, [], m);
    deq(r.geometry, { naca: '2412', semiSpan: s, rootChord: rc, tipChord: tc }, `${m}: engine mm`);
    const f = r.fields.find((x) => x.path === 'span.value');
    deq(f.original, { value: span.value, unit: units.length }, `${m}: original shown`); deq(f.converted, { value: s, unit: 'mm' }, `${m}: converted shown`);
    eq(f.origin, span.kind === 'full' ? 'derived' : 'supplied', `${m}: origin`); eq(f.target, 'geometry.semiSpan', m);
    if (span.kind === 'full') ok(/÷ 2/.test(f.note), `${m}: full → semi explained`);
    const rcField = r.fields.find((x) => x.path === 'rootChord');
    deq([rcField.original, rcField.converted], [{ value: rootChord, unit: units.length }, { value: rc, unit: 'mm' }], `${m}: root chord original/converted`);
  }
  const nacaText = Q({ ...template(), airfoil: { type: 'naca4', code: 'NACA 0012' } });
  eq(nacaText.geometry.naca, '0012', '"NACA 0012" designation'); ok(nacaText.fields.some((f) => f.path === 'airfoil.code' && f.original.value === 'NACA 0012' && f.converted.value === '0012'), 'designation conversion shown');
});
await group('design parameters: geometry only blocks the analysis', () => {
  const r = Q(template(), 'template.json');
  eq(r.ok, true); eq(r.status, 'geometry-only'); eq(r.analysisBlocked, true, 'explicit analysis-blocked flag'); eq(r.state, null, 'no study state');
  deq(r.required.map((x) => x.id), ['skin', 'ribs', 'rods', 'modules', 'material', 'support', 'loads'], 'required structural data');
  deq(r.geometry, { naca: '2412', semiSpan: 450, rootChord: 160, tipChord: 100 });
  ok(r.fields.filter((f) => f.origin === 'missing').length === 7, 'missing items listed as fields');
  eq(r.provenance.app, 'manual transfer'); eq(r.provenance.filename, 'template.json'); eq(r.provenance.sha256, sha(JSON.stringify(template())));
  eq(Q(IO.parameterTemplateText()).provenance.sha256, sha(IO.parameterTemplateText()), 'hash of the exact text');
  ok(/analysis blocked/i.test(IO.previewHtml(r)), 'preview states that the analysis is blocked');
  const partial = Q({ ...template(), structure: { skin: 1.2, modules: 3, ribs: { interior: 3 } }, supports: { root: 'clamped' } });
  eq(partial.status, 'geometry-only'); deq(partial.supplied, ['skin', 'ribs', 'support']);
  deq(partial.required.map((x) => x.id), ['rods', 'modules', 'material', 'loads'], 'three modules need the seam joint type');
  has(partial.warnings, /applied only when the file supplies all of them/);
  const noRods = Q({ ...template(), structure: { skin: 1.2, modules: 1, ribs: { interior: 0 }, rods: { fractions: [] } }, material: { shell: { card: 'pla_flat' } }, supports: { root: 'clamped' } });
  deq(noRods.required.map((x) => x.id), ['loads'], 'no rods: diameter and rod card not required');
});
await group('design parameters: supplied structure is complete and solvable', () => {
  const r = Q({ ...template(), ...COMPLETE }, 'complete.json');
  deq(r.errors, []); eq(r.status, 'complete'); eq(r.analysisBlocked, false); deq(r.required, []);
  const S = baseS(); S.load = { ...E.DEFAULT_LOAD, kind: 'tip', tipForce: 2, tipFraction: 0.3 };
  const native = IO.importPrintedStudy(IO.exportPrintedStudy(S, E), E).state;
  deq(r.state, native, 'same state as the equivalent native study');
  const sol = E.solve(IO.printedEngineInput(r.state, E));
  ok(Number.isFinite(sol.deflection.at(-1)) && sol.deflection.at(-1) > 0 && Number.isFinite(sol.governing.U), 'solvable by WingEngine');
  // gate: the neutral-schema description of the native study reproduces its solved results exactly
  // (mass, root EI and GJ, root reactions V/M/T, tip deflection and twist, stresses, FE tip, first frequency, checks)
  deq(printedSummary(sol), printedSummary(E.solve(IO.printedEngineInput(native, E))), 'schema import = native study: identical mass, EI, GJ, reactions, twist and stress');
  ok(r.fields.some((f) => f.origin === 'assumed' && f.path === 'structure.cap'), 'assumed defaults are listed');
  // inches, full span, custom loads in N/in, explicit rib stations
  const inch = Q({
    ...template(), units: { length: 'in', force: 'N', stress: 'MPa' }, span: { value: 36, kind: 'full' }, rootChord: 6.3, tipChord: 3.9,
    structure: { skin: 0.05, ribs: { stations: [4, 8, 12], thickness: 0.0625 }, rods: { fractions: [0.3, 0.6], diameter: 0.157, clearance: 0.01, sleeveWall: 0.05 }, modules: 1, trailingEdge: 0.05, cap: 0.08, interfaceOffset: 0.16, cavity: { start: 0.06, end: 0.9 } },
    material: { shell: { card: 'pla_flat', E: 3100 }, rod: { card: 'rod_t700' } }, supports: { root: 'clamped' },
    loads: { kind: 'custom', fos: 1.5, tipMass: 0, items: [{ kind: 'point', position: 18, force: 2, fraction: 0.3 }, { kind: 'distributed', start: 0, end: 12, qStart: 0.254, qEnd: 0, fraction: 0.25 }] },
    criteria: { maxTipDeflection: 2, maxTipTwist: 2 },
  });
  deq(inch.errors, []); eq(inch.status, 'complete');
  const g = inch.state.geometry;
  deq([g.semiSpan, g.rootChord, g.tipChord, g.skin, g.ribThickness, g.rodDiameter, g.clearance, g.sleeveWall, g.te, g.cap, g.interfaceOffset],
    [457.2, 160.02, 99.06, 1.27, 1.5875, 3.9878, 0.254, 1.27, 1.27, 2.032, 4.064], 'inch geometry in exact mm');
  deq(g.customInteriorRibs, [101.6, 203.2, 304.8], 'rib stations in mm');
  deq(inch.state.load.items, [{ kind: 'point', position: 457.2, force: 2, fraction: 0.3 }, { kind: 'distributed', start: 0, end: 304.8, qStart: 0.01, qEnd: 0, fraction: 0.25 }], 'loads: in → mm, N/in → N/mm');
  eq(inch.state.criteria.maxTipDeflection, 50.8, 'criterion in mm');
  deq([inch.state.plaKey, inch.state.plaOver.E, inch.state.rodKey], ['pla_flat', 3100, 'rod_t700']);
  const s2 = E.solve(IO.printedEngineInput(inch.state, E));
  ok(Number.isFinite(s2.deflection.at(-1)) && Math.abs(s2.V[0] - (2 + 0.01 * 304.8 / 2)) < 1e-9, 'solvable, root shear = applied force');
});
await group('design parameters: rejections', () => {
  const T = template();
  const textCases = [
    ['"rootChord": 160', '"rootChord": NaN', /NaN is not allowed/], ['"rootChord": 160', '"rootChord": Infinity', /Infinity is not allowed/],
    ['"rootChord": 160', '"rootChord": 1e400', /overflows/], ['"rootChord": 160', '"rootChord": "160"', /rootChord: must be a finite number in mm, not the text "160"/],
  ];
  const base = IO.parameterTemplateText();
  for (const [from, to, re] of textCases) { ok(base.includes(from), 'template text'); rejectedParams(Q(base.replace(from, to)), re, to); }
  const cases = [
    [{ rootChord: -160 }, /rootChord: must be greater than 0 mm/], [{ rootChord: 0 }, /rootChord: must be greater than 0/], [{ span: { value: 0, kind: 'semi' } }, /span.value: must be greater than 0/],
    [{ span: { value: 450, kind: 'half' } }, /span.kind: must be one of "semi", "full"/], [{ tipChord: 170 }, /exceeds the root chord.*inverse taper is not supported/],
    [{ airfoil: { type: 'naca4', code: 'e387' } }, /not a NACA 4-digit designation/], [{ airfoil: { type: 'naca4', code: '23012' } }, /not a NACA 4-digit designation/],
    [{ airfoil: { type: 'naca4', code: 'NACA 64-210' } }, /not a NACA 4-digit designation/], [{ airfoil: { type: 'naca4', code: 2412 } }, /airfoil.code: must be text/],
    [{ airfoil: { type: 'naca4', code: '2012' } }, /camber position.*WingEngine/], [{ airfoil: { type: 'naca5', code: '23012' } }, /NACA 5-digit, 6-series and 16-series sections are not supported/],
    [{ airfoil: { type: 'coordinates', code: 'clarky' } }, /coordinate airfoils are not supported/], [{ airfoil: { type: 'naca4', code: '2412', coordinates: [[1, 0], [0, 0]] } }, /airfoil.coordinates: coordinate airfoils are not supported/],
    [{ airfoil: [{ type: 'naca4', code: '2412' }, { type: 'naca4', code: '0012' }] }, /lists 2 airfoils/], [{ airfoil: { type: 'naca4', code: '2412', tip: { type: 'naca4', code: '0012' } } }, /different|separate root and tip airfoils are not supported/],
    [{ airfoil: { type: 'naca4', code: '2412', elements: 2 } }, /multi-element airfoils/],
    [{ sweepDeg: 5 }, /sweepDeg: sweep of 5°: swept wings are not supported/], [{ dihedralDeg: 3 }, /dihedralDeg: dihedral of 3°/], [{ twistDeg: -2 }, /twistDeg: twist of -2°/],
    [{ sweepDeg: undefined }, /sweepDeg: is missing/], [{ sweepDeg: '0' }, /sweepDeg: must be a finite number/],
    [{ sections: [{ station: 0, chord: 160 }, { station: 200, chord: 130 }, { station: 450, chord: 100 }] }, /describes 3 sections: multi-section/],
    [{ sections: [{ station: 0, chord: 160 }, { station: 450, chord: 100, airfoil: { type: 'naca4', code: '0012' } }] }, /different root and tip airfoils are not supported/],
    [{ sections: [{ station: 0, chord: 160 }, { station: 450, chord: 100, leadingEdgeX: 30 }] }, /leading-edge offset means sweep/],
    [{ sections: [{ station: 0, chord: 160 }, { station: 400, chord: 100 }] }, /tip section must be at 450/],
    [{ units: { length: 'ft' } }, /"ft" is not a supported length unit/], [{ units: { length: 'MM' } }, /not a supported length unit/], [{ units: undefined }, /units: is missing/],
    [{ units: { length: 'mm', force: 'lbf' } }, /units.force.*give forces in N/], [{ units: { length: 'mm', stress: 'psi' } }, /units.stress/],
    [{ frame: { span: 'x', chord: 'y', up: 'z', origin: 'root leading edge' } }, /frame.span: frame mismatch/], [{ frame: { span: 'y', chord: 'x', up: '-z', origin: 'root leading edge' } }, /frame.up: frame mismatch/],
    [{ frame: { span: 'y', chord: 'x', up: 'z', origin: 'root trailing edge' } }, /frame.origin: frame mismatch/], [{ frame: undefined }, /frame: is missing/],
    [{ supports: { root: 'pinned' } }, /supports.root: the text "pinned" is not supported.*clamped/],
    [{ ...COMPLETE, loads: { kind: 'custom', fos: 1.5, tipMass: 0, items: [{ kind: 'point', position: 451, force: 1, fraction: 0.3 }] } }, /loads.items\[0\].position: 451 mm lies outside 0 < y ≤ semi-span 450 mm/],
    [{ ...COMPLETE, structure: { ...COMPLETE.structure, skin: 8 } }, /structure.skin: The cavity collapses/],
    [{ ...COMPLETE, structure: { ...COMPLETE.structure, ribs: { stations: [100, 101] } } }, /structure.ribs.stations.*Interior ribs must not overlap/],
    [{ ...COMPLETE, structure: { ...COMPLETE.structure, rods: { fractions: [0.3, 0.31], diameter: 4 } } }, /structure.rods.fractions\[1\]: the printed sleeves .* overlap/],
    [{ elements: [] }, /elements: unknown field/], [{ format: 'mie446-wing-study' }, /use "Open study"/], [{ format: 'tool-x-export' }, /must be "mie446-wing-parameters"/],
    [{ version: 2 }, /newer than this page reads/], [{ version: '1' }, /version: must be the whole number 1/],
  ];
  for (const [patch, re] of cases) {
    const doc = { ...T, ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete doc[k];
    rejectedParams(Q(doc), re, JSON.stringify(patch).slice(0, 80));
  }
  rejectedParams(Q(' '.repeat(IO.LIMITS.fileBytes + 1)), /too large/, 'oversized text');
  rejectedParams(Q('{"format": "mie446-wing-parameters", "format": "x"}'), /duplicate field/, 'duplicate field');
  rejectedParams(Q('{"format": "mie446-wing-parameters", "version": 1, "a": ' + '{"a": '.repeat(20) + '1' + '}'.repeat(21)), /nested more than 12 levels/, 'depth');
});

// ---------------------------------------------------------------- native rejections
await group('rod limit equals the page (8 rods)', () => {
  const pageMax = +read('./wing_lab_template.html').match(/const MAX_RODS = (\d+);/)[1];
  eq(IO.LIMITS.rods, pageMax, `study files allow the ${pageMax} rods the printed-wing page offers (MAX_RODS)`); eq(pageMax, 8, 'the page offers 8 rods');
  const S8 = baseS(); Object.assign(S8.geometry, { naca: '2418', rodDiameter: 2, sleeveWall: 0.8, clearance: 0.2, rodFractions: [0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48, 0.54] });
  const text = IO.exportPrintedStudy(S8, E, { savedAt: SAVED }), r = IO.importPrintedStudy(text, E);
  deq(r.errors, [], '8 rods: exported and imported without errors'); eq(r.state.geometry.rodFractions.length, 8, '8 rods kept');
  deq(printedSummary(E.solve(uiEngineInput(applyPrinted(S8, r.state)))), printedSummary(E.solve(uiEngineInput(S8))), '8 rods: identical results after the round trip');
});
await group('native study rejections', () => {
  const doc = printedDoc(), text = JSON.stringify(doc, null, 2);
  for (const [to, re] of [['NaN', /NaN is not allowed/], ['Infinity', /Infinity is not allowed/], ['1e400', /overflows to infinity/], ['"450"', /semiSpan: must be a finite number in mm, not the text "450"/], ['-450', /semiSpan: must be greater than 0 mm/], ['0', /semiSpan: must be greater than 0/]])
    refused(IO.importPrintedStudy(text.replace('"semiSpan": 450', `"semiSpan": ${to}`), E), re, `semiSpan ${to}`);
  const g = (patch) => { const d = clone(doc); Object.assign(d.study.geometry, patch); return d; };
  const cases = [
    [g({ tipChord: 200 }), /study.geometry.tipChord: cannot exceed the root chord/], [g({ naca: '2012' }), /study.geometry.naca: A cambered NACA section needs a nonzero camber position/],
    [g({ naca: 'abcd' }), /four digits/], [g({ naca: 2412 }), /naca: must be the four digits/], [g({ naca: 'NACA 2412' }), /naca: must be the four digits/],
    [g({ modules: 4 }), /modules: must be at most 3/], [g({ modules: 2.5 }), /modules: must be a whole number/], [g({ skin: -1 }), /skin: must be greater than 0 mm/],
    [g({ customInteriorRibs: [100, 101] }), /customInteriorRibs: Interior ribs must not overlap/], [g({ customInteriorRibs: [150] }), /customInteriorRibs: Keep interior ribs clear of the seam/],
    [g({ customInteriorRibs: [460] }), /customInteriorRibs: Interior ribs must lie inside the span/], [g({ customInteriorRibs: [300, 100] }), /customInteriorRibs\[1\]: rib stations must be listed in strictly increasing order/],
    [g({ customInteriorRibs: Array.from({ length: 17 }, (_, i) => 20 + 20 * i) }), /at most 16 interior ribs/], [g({ interiorRibs: 17 }), /interiorRibs: must be at most 16/],
    [g({ rodFractions: Array.from({ length: 9 }, (_, i) => +(0.1 + 0.06 * i).toFixed(2)) }), /rodFractions: lists 9 rods; at most 8 are allowed/],
    [g({ rodFractions: [0, 0.5] }), /rodFractions\[0\]: must lie strictly between 0 and 1/], [g({ rodFractions: [1.2] }), /rodFractions\[0\]: must lie strictly between 0 and 1/],
    [g({ rodFractions: [0.3, 0.31] }), /rodFractions\[1\]: the printed sleeves of the rods at x\/c = 0.3 and 0.31 overlap/], [g({ rodFractions: [0.3, 0.3] }), /overlap/],
    [g({ rodDiameter: 9 }), /rodFractions\[1\]: the rod hole .* does not fit inside the airfoil at x\/c = 0.6/], [g({ rodFractions: [] }), /rodFractions: Removing every rod from a dry multi-module joint disconnects the wing/],
    [g({ skin: 8 }), /study.geometry.skin: The cavity collapses at chord 160.0 mm.*WingEngine section at y = 0 mm/], [g({ interfaceOffset: 1 }), /interfaceOffset: Interface rib offset must exceed rib thickness/],
    [g({ clearance: 1 }), /clearance: must be at most 0.8 mm/], [g({ cavityStart: 0.9, cavityEnd: 0.5 }), /cavityEnd: must be greater than cavityStart/], [g({ sweep: 10 }), /study.geometry.sweep: unknown field/],
  ];
  for (const [d, re] of cases) refused(P(d), re, re.source.slice(0, 40));
  const L = (load) => { const d = clone(doc); d.study.load = load; return d; };
  const items = (list) => L({ kind: 'custom', items: list, fos: 1.5, tipMass: 0 });
  const pt = (o) => ({ kind: 'point', position: 225, force: 1, fraction: 0.3, ...o });
  const loadCases = [
    [items([pt({ position: 451 })]), /items\[0\].position: 451 mm lies outside 0 < y ≤ semi-span 450 mm/], [items([pt({ position: 0 })]), /position: 0 mm lies outside 0 < y/],
    [items([pt({ force: 'x' })]), /items\[0\].force: must be a finite number in N/], [items([pt({ fraction: 1.5 })]), /fraction: must be at most 1/], [items([{ kind: 'point', position: 225, force: 1 }]), /fraction: is missing/],
    [items([{ kind: 'distributed', start: 0, end: 460, qStart: 0.001, qEnd: 0, fraction: 0.3 }]), /items\[0\].end: 460 mm lies outside 0 ≤ y ≤ semi-span 450 mm/],
    [items([{ kind: 'distributed', start: 300, end: 200, qStart: 0.001, qEnd: 0, fraction: 0.3 }]), /end: must be greater than start/],
    [items([{ kind: 'elliptic', start: 0, end: 450, shape: 'start', total: 2, peak: 0.01, fraction: 0.3 }]), /give either total \(N\) or peak \(N\/mm\), not both/],
    [items([{ kind: 'parabolic', start: 0, end: 450, shape: 'start', fraction: 0.3 }]), /needs either total \(N\) or peak/], [items([{ kind: 'elliptic', start: 0, end: 450, shape: 'left', total: 1, fraction: 0.3 }]), /shape: must be one of "start", "end", "middle"/],
    [items([{ kind: 'table', points: [[0, 0.001], [200, 0.002], [200, 0.003]], fraction: 0.3 }]), /points\[2\]\[0\]: stations must increase strictly/],
    [items([{ kind: 'table', points: [[0, 0.001]], fraction: 0.3 }]), /points: must have 2–31 rows \(got 1\)/], [items([{ kind: 'table', points: Array.from({ length: 32 }, (_, i) => [i * 14, 0]), fraction: 0.3 }]), /got 32/],
    [items([{ kind: 'table', points: [[0, 0.001, 0.3], [450, 0]], fraction: 0.3 }]), /points\[1\]: must have 3 numbers like the first row/], [items([{ kind: 'table', points: [[0, 0.001, 1.5], [450, 0, 0.3]] }]), /points\[0\]\[2\]: x\/c must be between 0 and 1/],
    [items([{ kind: 'table', points: [[0, 0.001], [460, 0]], fraction: 0.3 }]), /points\[1\]\[0\]: station 460 mm lies outside/], [items([{ kind: 'table', points: [[0, 0.001], [450, 0]] }]), /fraction: is missing/],
    [items([{ kind: 'table', points: [[0, 0.001], [450, 0]], fraction: 0.3, source: { filename: 'a.csv', sha256: 'xyz', rows: 2 } }]), /source.sha256: must be 64 lower-case hexadecimal/],
    [items(Array.from({ length: 13 }, (_, i) => pt({ position: 20 + 30 * i }))), /has 13 load items; at most 12/],
    [items([{ kind: 'table', points: Array.from({ length: 31 }, (_, i) => [i * 15, 0.001]), fraction: 0.3 }, pt({})]), /has 31 load segments in total.*at most 30/],
    [items([{ kind: 'gust', position: 1 }]), /items\[0\].kind: must be one of "point", "distributed", "elliptic", "parabolic", "table", "schrenk"/], [items([pt({ evil: 1 })]), /items\[0\].evil: unknown field/],
    [L({ kind: 'custom', items: 'all', fos: 1.5, tipMass: 0 }), /items: must be a list of load items/], [L({ kind: 'flight', fos: 1.5, tipMass: 0 }), /aircraftMass: is missing/],
    [L({ kind: 'tip', tipForce: 2, tipFraction: 0.3, fos: 0, tipMass: 0 }), /fos: must be greater than 0/], [L({ kind: 'tip', tipForce: 2, tipFraction: 0.3, fos: 1.5, tipMass: -1 }), /tipMass: must be at least 0 g/],
    [L({ kind: 'storm' }), /load.kind: must be one of "flight", "tip", "custom"/],
    [items([pt({ position: 225.05 })]), /study.load.items\[0\]: Keep distinct wing load boundaries at least 0.1 mm from each other, ribs, seams and ends.*WingEngine check/],
    [items([pt({ position: 200 }), pt({ position: 200.05 })]), /^study.load.items: Keep distinct wing load boundaries at least 0.1 mm/],
  ];
  for (const [d, re] of loadCases) refused(P(d), re, re.source.slice(0, 50));
  // twelve items and exactly thirty segments are accepted
  const okItems = P(items([{ kind: 'table', points: Array.from({ length: 20 }, (_, i) => [i * 20, 0.001]), fraction: 0.3 }, ...Array.from({ length: 11 }, (_, i) => pt({ position: 30 + 37 * i }))]));
  deq(okItems.errors, []); eq(IO.countSegments(okItems.state.load.items), 30, '12 items, 30 segments');
  const otherKind = clone(doc); otherKind.study.load = { kind: 'tip', tipForce: 2, tipFraction: 0.3, fos: 1.5, tipMass: 0, aircraftMass: 1 };
  const warned = P(otherKind); eq(warned.ok, true); has(warned.warnings, /aircraftMass: ignored: it belongs to the "flight" load case/);
  // envelope: format, version, workspace, unknown fields, size, encoding
  const env = [
    [{ ...doc, format: 'mie446-beam-study' }, /Beam Lab study/], [{ ...doc, format: 'mie446-wing-parameters' }, /use "Import design parameters"/], [{ ...doc, format: 'x' }, /format: must be "mie446-wing-study"/],
    [{ ...doc, version: 3 }, /newer Wing Lab \(file version 3; this page reads versions 1–2\).*unchanged/], [{ ...doc, version: '1' }, /version: must be the whole number 1/], [{ ...doc, version: 0 }, /not a valid file version/],
    [{ ...doc, workspace: 'd520' }, /this is a D.520 metal wing study: open it in the D.520 metal wing workspace/], [{ ...doc, workspace: 'beam' }, /workspace: must be "printed" or "d520"/],
    [{ ...doc, results: {} }, /results: unknown field/], [{ ...doc, study: undefined }, /study: is missing/], [{ ...doc, study: [] }, /study: must be an object/],
  ];
  for (const [d, re] of env) refused(P(d), re, re.source.slice(0, 40));
  refused(IO.importPrintedStudy(' '.repeat(IO.LIMITS.fileBytes + 1), E), /too large/, 'oversized text');
  refused(IO.importPrintedStudy(new Uint8Array(IO.LIMITS.fileBytes + 1), E), /too large/, 'oversized bytes');
  refused(IO.importPrintedStudy(Uint8Array.from([0x7b, 0xff, 0x7d]), E), /not UTF-8 text/, 'invalid UTF-8');
  refused(IO.importPrintedStudy(text.replace('"geometry": {', '"geometry": {"__proto__": {"polluted": 1},'), E), /geometry\.__proto__: unknown field/, '__proto__');
  eq({}.polluted, undefined, 'no prototype pollution');
  refused(IO.importPrintedStudy(text.replace('"semiSpan": 450,', '"semiSpan": 450, "semiSpan": 451,'), E), /duplicate field "semiSpan"/, 'duplicate field');
  refused(IO.importPrintedStudy(42, E), /must be text/, 'not text');
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
  const withBom = IO.importPrintedStudy(bom, E); eq(withBom.ok, true); eq(withBom.provenance.sha256, sha(bom), 'hash of the exact bytes'); has(withBom.warnings, /byte-order mark/);
  const meta = clone(doc); meta.app.extra = 1; meta.app.engine = '0.9.0';
  const mr = P(meta); eq(mr.ok, true); has(mr.warnings, /app.extra: unknown metadata field ignored/); has(mr.warnings, /saved with engine 0.9.0; this page runs engine/);
  // D.520
  const dd = d520Doc();
  const dl = (list) => { const d = clone(dd); d.study.customLoads = list; return d; };
  const dpt = (o) => ({ kind: 'point', position: 2, force: 100, fraction: 0.25, ...o });
  const d520Cases = [
    [dl([{ kind: 'schrenk', total: 1000, fraction: 0.25 }]), /"schrenk" load items exist for the printed wing only/], [dl([dpt({ position: 0.3 })]), /customLoads\[0\].position: 0.3 m lies outside the fittings at 0.46 m and the last rib at 4.93 m/],
    [dl([dpt({ position: 5 })]), /position: 5 m lies outside/], [dl([{ kind: 'distributed', start: 0.4, end: 2, qStart: 1, qEnd: 1, fraction: 0.2 }]), /start: 0.4 m lies outside/],
    [dl(Array.from({ length: 31 }, (_, i) => dpt({ position: 0.5 + 0.1 * i }))), /has 31 load items; at most 30/],
    [dl([{ kind: 'table', points: Array.from({ length: 31 }, (_, i) => [0.5 + 0.1 * i, 100]), fraction: 0.25 }, dpt({})]), /31 load segments/],
    [dl('x'), /customLoads: must be a list/], [(() => { const d = clone(dd); d.study.n = 0; return d; })(), /study.n: must not be zero/],
    [(() => { const d = clone(dd); d.study.distribution = 'foo'; return d; })(), /distribution: must be one of "liftingLine", "schrenk", "elliptic"/],
    [(() => { const d = clone(dd); d.study.scales.skin = -1; return d; })(), /scales.skin: must be greater than 0/], [(() => { const d = clone(dd); d.study.material.nu = 0.6; return d; })(), /material.nu: must be less than 0.5/],
    [(() => { const d = clone(dd); d.study.material.Ftu = 1e8; return d; })(), /study.material: Check tensile ultimate stress and rupture strain \(MetalWingEngine check\)/],
    [(() => { const d = clone(dd); delete d.study.taper; return d; })(), /taper: is missing/], [(() => { const d = clone(dd); d.study.include.fuel = 'yes'; return d; })(), /include.fuel: must be true or false/],
    [{ ...dd, workspace: 'printed' }, /this is a printed PLA semi-wing study: open it in the printed PLA semi-wing workspace/],
  ];
  for (const [d, re] of d520Cases) refused(D(d), re, re.source.slice(0, 40));
  refused(IO.importD520Study(JSON.stringify(doc), M), /printed PLA semi-wing study: open it in the printed/, 'printed study in the D.520 importer');
});

// ---------------------------------------------------------------- share links
await group('share links', () => {
  const doc = printedDoc();
  const token = IO.encodeShare(doc, { engine: E });
  ok(/^[A-Za-z0-9_-]+$/.test(token) && token.length <= IO.LIMITS.shareChars, 'base64url token within the limit');
  eq(Buffer.from(token, 'base64url').toString('utf8'), JSON.stringify(doc), 'base64url of the UTF-8 JSON');
  const fileState = IO.importPrintedStudy(JSON.stringify(doc), E).state;
  for (const form of [token, IO.shareFragment(token), `https://example.invalid/wing-lab.html?x=1#${IO.SHARE_KEY}=${token}`, `#d520&${IO.SHARE_KEY}=${token}`]) {
    const r = IO.decodeShare(form, { engine: E, metalEngine: M });
    eq(r.ok, true, form.slice(0, 30)); deq(r.state, fileState, 'same state as the file'); eq(r.provenance.source, 'share link');
  }
  const dd = d520Doc(), dt = IO.encodeShare(dd, { engine: E, metalEngine: M });
  const dr = IO.decodeShare(dt, { engine: E, metalEngine: M }); eq(dr.workspace, 'd520'); deq(dr.state, IO.importD520Study(JSON.stringify(dd), M).state);
  refused(IO.decodeShare(dt, { engine: E, metalEngine: M, workspace: 'printed' }), /D.520 metal wing study/, 'workspace mismatch');
  refused(IO.decodeShare('', { engine: E }), /empty/, 'empty'); refused(IO.decodeShare('abc$%', { engine: E }), /characters that a study link never contains/, 'bad characters');
  refused(IO.decodeShare('A'.repeat(IO.LIMITS.shareChars + 1), { engine: E }), /too long/, 'too long'); refused(IO.decodeShare(token.slice(0, 200), { engine: E }), /not valid JSON|UTF-8/, 'truncated');
  refused(IO.decodeShare('#other=1', { engine: E }), /no "wingstudy=" part/, 'other fragment');
  const bad = clone(doc); bad.study.geometry.tipChord = 999;
  refused(IO.decodeShare(Buffer.from(JSON.stringify(bad)).toString('base64url'), { engine: E }), /tipChord: cannot exceed the root chord/, 'same validation as a file');
  assert.throws(() => IO.encodeShare(bad, { engine: E }), /cannot be shared.*tipChord/); checks++;
  const big = printedDoc();
  big.study.load = { kind: 'custom', fos: 1.5, tipMass: 0, name: '€'.repeat(80), items: [
    ...Array.from({ length: 11 }, (_, i) => ({ kind: 'point', position: 20 + 35 * i, force: 0.1, fraction: 0.3, label: '€'.repeat(120) })),
    { kind: 'table', points: [[0, 0.001], [450, 0]], fraction: 0.3, label: '€'.repeat(120), source: { filename: '€'.repeat(255), sha256: 'b'.repeat(64), rows: 2 } }] };
  eq(IO.importPrintedStudy(JSON.stringify(big), E).ok, true, 'a valid but long study');
  ok(Buffer.from(JSON.stringify(big)).toString('base64url').length > IO.LIMITS.shareChars, 'longer than a link allows');
  assert.throws(() => IO.encodeShare(big, { engine: E }), /too long for a link.*limit is 8000/); checks++;
});

// ---------------------------------------------------------------- previews and XSS
const XSS = '<img src=x onerror=alert(1)>';
await group('previews escape every text from a file', () => {
  const doc = printedDoc();
  doc.study.load = { kind: 'custom', fos: 1.5, tipMass: 0, items: [{ kind: 'point', position: 225, force: 1, fraction: 0.3, label: XSS }] };
  const r = IO.importPrintedStudy(JSON.stringify(doc), E, { filename: `${XSS}.json` });
  eq(r.ok, true);
  const html = IO.previewHtml(r);
  ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'escaped filename and label'); ok(!html.includes('<img'), 'no raw tag');
  const p = { ...template(), source: { app: XSS, appVersion: '<script>alert(2)</script>', filename: `${XSS}.wing`, exportedAt: '' }, notes: '<script>alert(3)</script>' };
  const pr = Q(p, `${XSS}.json`);
  eq(pr.status, 'geometry-only'); eq(pr.provenance.app, XSS, 'app name kept as text');
  const phtml = IO.previewHtml(pr);
  ok(!/<img|<script/i.test(phtml), 'no raw tags in the parameter preview'); ok(phtml.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), 'escaped app version');
  const bad = IO.importPrintedStudy(`{"format":"${XSS}"}`, E, { filename: XSS });
  ok(!IO.previewHtml(bad).includes('<img'), 'errors quoting file text are escaped');
  const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>');
  const c = dom.window.document.getElementById('c');
  c.innerHTML = html + phtml + IO.previewHtml(bad);              // test-only: render the HTML strings
  eq(dom.window.document.querySelectorAll('img,script').length, 0, 'jsdom: no img or script element from the previews');
  ok(c.textContent.includes(XSS), 'the text is shown literally');
});

// ---------------------------------------------------------------- mount() in jsdom
await group('mount(): save, open, apply, cancel, parameters, template', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main><div id="wingStudyFiles"></div><div id="mStudyFiles"></div></main></body></html>', { url: 'https://wing-lab.invalid/' });
  const w = dom.window, document = w.document;
  const blobs = [], clicks = [];
  w.URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:test/${blobs.length}`; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function click() { clicks.push({ href: this.href, download: this.download }); };
  const blobText = (blob) => new Promise((resolve, reject) => { const fr = new w.FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsText(blob); });
  let solveCalls = 0;
  const spyE = { ...E, solve: (...a) => { solveCalls++; return E.solve(...a); } };
  const S = baseS();
  const applied = [];
  let busy = false, shown = 0, completed = 0, dismissed = 0;
  const ctl = IO.mount(document.getElementById('wingStudyFiles'), { workspace: 'printed', getState: () => S, applyState: (s, info) => applied.push({ s, info }), engine: spyE, documentRef: document,
    canApply: () => busy ? 'Wait for the current solve, then Apply.' : '', onPreview: () => shown++, onApplied: () => completed++, onDismiss: () => dismissed++ });
  const root = document.querySelector('#wingStudyFiles .wio-root');
  ok(root && root.getAttribute('role') === 'group', 'panel mounted');
  const btn = (text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  const inputs = [...root.querySelectorAll('input[type=file]')];
  eq(inputs.length, 2, 'study and parameter file inputs');
  for (const i of inputs) ok(i.closest('label') && i.closest('label').textContent.trim().length > 5, 'file inputs have labels');
  const ta = root.querySelector('textarea'); ok(ta && root.querySelector(`label[for="${ta.id}"]`), 'textarea label');
  // Save
  btn('Save study').click();
  eq(blobs.length, 1, 'one download'); ok(/^mie446-printed-wing-study-\d{4}-\d\d-\d\d\.json$/.test(clicks[0].download), 'file name');
  const saved = await blobText(blobs[0]);
  const savedDoc = JSON.parse(saved);
  eq(savedDoc.format, 'mie446-wing-study'); eq(savedDoc.workspace, 'printed'); eq(IO.importPrintedStudy(saved, E).ok, true, 'saved file re-opens');
  ok(/Saved mie446-printed-wing-study/.test(root.querySelector('.wio-status').textContent), 'status message');
  // Open a valid study: the real file-input path
  const other = baseS(); other.geometry.tipChord = 90; other.load = { ...E.DEFAULT_LOAD, kind: 'tip', tipForce: 3, tipFraction: 0.3 };
  const otherText = IO.exportPrintedStudy(other, E, { savedAt: SAVED });
  const expected = IO.importPrintedStudy(otherText, E).state;
  const choose = async (input, file) => { Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new w.Event('change')); await ctl.idle(); };
  await choose(inputs[0], new w.File([otherText], 'tip-study.json', { type: 'application/json' }));
  const preview = root.querySelector('.wio-preview');
  eq(preview.hidden, false, 'preview shown'); ok(preview.querySelector('table.wio-table caption'), 'preview table'); ok(preview.textContent.includes('tip-study.json'), 'file name in the preview');
  ok(preview.textContent.includes(IO.sha256(otherText)), 'SHA-256 in the preview');
  eq(applied.length, 0, 'nothing applied before Apply');
  const apply = btn('Apply');
  ok(shown >= 2, 'host is notified during reading and after preview validation');
  eq(document.activeElement, apply, 'Apply is keyboard-ready after choosing a valid file');
  busy = true; apply.click(); eq(applied.length, 0, 'busy solver cannot be overwritten');
  ok(!preview.hidden && /Wait for the current solve/.test(preview.querySelector('[role=alert]').textContent), 'busy feedback stays in the same visible preview');
  busy = false;
  apply.click(); apply.click();
  eq(applied.length, 1, 'applyState called once'); deq(applied[0].s, expected, 'validated state'); eq(applied[0].info.kind, 'study'); eq(applied[0].info.provenance.filename, 'tip-study.json');
  eq(preview.hidden, true, 'preview closed after Apply');
  eq(completed, 1, 'host is notified once after successful application');
  // Cancel
  await choose(inputs[0], new w.File([otherText], 'again.json'));
  btn('Cancel').click();
  eq(dismissed, 1, 'host can close the visible import dialog on Cancel');
  eq(applied.length, 1, 'Cancel applies nothing'); ok(/Nothing was changed/.test(root.querySelector('.wio-status').textContent));
  // Invalid file: errors shown, applyState not called
  await choose(inputs[0], new w.File([otherText.replace('"tipChord": 90', '"tipChord": NaN')], 'broken.json'));
  const alert = preview.querySelector('[role=alert]');
  ok(alert && /NaN is not allowed/.test(alert.textContent), 'errors shown'); eq(btn('Apply'), undefined, 'no Apply button'); eq(applied.length, 1, 'not applied');
  await choose(inputs[0], new w.File([new Uint8Array(IO.LIMITS.fileBytes + 10)], 'huge.json'));
  ok(/too large/.test(preview.querySelector('[role=alert]').textContent), 'oversized file refused before reading'); eq(applied.length, 1);
  await choose(inputs[0], new w.File([IO.exportD520Study(baseMS(), M)], 'd520.json'));
  ok(/D.520 metal wing study/.test(preview.querySelector('[role=alert]').textContent), 'D.520 file in the printed panel refused'); eq(applied.length, 1);
  // XSS through the file name: shown as text, no element created
  await choose(inputs[0], new w.File([otherText], `${XSS}.json`));
  eq(document.querySelectorAll('img,script').length, 0, 'no img element from a hostile file name'); ok(preview.textContent.includes(XSS), 'file name shown literally');
  btn('Cancel').click();
  // Design parameters: paste → preview → Apply outer geometry (geometry only; no solve)
  btn('Paste design parameters').click();
  eq(root.querySelector('.wio-paste').hidden, false, 'paste box opened');
  ta.value = JSON.stringify({ ...template(), source: { app: XSS, appVersion: '1' }, units: { length: 'cm' }, span: { value: 90, kind: 'full' }, rootChord: 16.5, tipChord: 9.7 });
  btn('Preview pasted parameters').click();
  ok(/analysis blocked/i.test(preview.textContent), 'blocked state shown'); ok(preview.textContent.includes('Required before analysis'), 'required list shown');
  ok(preview.textContent.includes('16.5 cm') && preview.textContent.includes('165 mm'), 'original and converted values shown');
  ok(preview.textContent.includes('derived'), 'origins shown'); eq(document.querySelectorAll('img,script').length, 0, 'hostile app name stays text');
  eq(btn('Apply complete study'), undefined, 'geometry-only file cannot be applied as a study');
  btn('Apply outer geometry').click();
  eq(applied.length, 2); deq(applied[1].s, { geometry: { naca: '2412', semiSpan: 450, rootChord: 165, tipChord: 97 } }, 'outer geometry only');
  eq(applied[1].info.kind, 'outer-geometry'); eq(applied[1].info.analysisBlocked, true, 'analysis blocked flag'); eq(applied[1].info.required.length, 7, 'all structural data still to be confirmed');
  eq(applied[1].info.provenance.app, XSS);
  // complete parameter file through the parameter file input
  await choose(inputs[1], new w.File([JSON.stringify({ ...template(), ...COMPLETE })], 'complete.json'));
  ok(btn('Apply outer geometry') && btn('Apply complete study'), 'complete file offers both');
  btn('Apply complete study').click();
  eq(applied.length, 3); eq(applied[2].info.kind, 'parameters-complete'); eq(applied[2].info.analysisBlocked, false);
  deq(applied[2].s, Q({ ...template(), ...COMPLETE }).state, 'complete state applied');
  // a rejected parameter file offers nothing to apply
  await choose(inputs[1], new w.File([JSON.stringify({ ...template(), sweepDeg: 12 })], 'swept.json'));
  ok(/swept wings are not supported/.test(preview.querySelector('[role=alert]').textContent)); eq(btn('Apply outer geometry'), undefined); eq(applied.length, 3);
  // outer geometry that conflicts with the current structure is reported
  const narrow = { ...template(), rootChord: 30, tipChord: 20 };
  ctl.previewParameters(JSON.stringify(narrow), 'narrow.json');
  ok(/Applied to your current study/.test(preview.textContent) && /does not fit inside the airfoil/.test(preview.textContent) && /cavity collapses/.test(preview.textContent), 'conflicts with the current rods and skin reported before applying');
  btn('Cancel').click();
  // template download
  btn('Download parameter template').click();
  const tpl = await blobText(blobs[blobs.length - 1]);
  eq(tpl, IO.parameterTemplateText(), 'template text'); eq(clicks[clicks.length - 1].download, 'mie446-wing-parameters-template.json');
  eq(solveCalls, 0, 'no solve was started by any import or apply');
  // D.520 panel
  const MS = baseMS(); const dApplied = [];
  const dctl = IO.mount(document.getElementById('mStudyFiles'), { workspace: 'd520', getState: () => MS, applyState: (s, info) => dApplied.push({ s, info }), engine: M, documentRef: document });
  const droot = document.querySelector('#mStudyFiles .wio-root');
  eq(droot.querySelectorAll('input[type=file]').length, 1, 'D.520 panel: study files only'); eq(droot.querySelector('textarea'), null);
  [...droot.querySelectorAll('button')].find((b) => b.textContent === 'Save study').click();
  const dSaved = JSON.parse(await blobText(blobs[blobs.length - 1]));
  eq(dSaved.workspace, 'd520'); ok(/^mie446-d520-study-/.test(clicks[clicks.length - 1].download));
  const custom = { ...baseMS(), n: 1, customLoads: [{ kind: 'point', position: 3, force: 1000, fraction: 0.25 }] };
  const dInput = droot.querySelector('input[type=file]');
  Object.defineProperty(dInput, 'files', { value: [new w.File([IO.exportD520Study(custom, M)], 'bench.json')], configurable: true });
  dInput.dispatchEvent(new w.Event('change')); await dctl.idle();
  [...droot.querySelectorAll('button')].find((b) => b.textContent === 'Apply').click();
  eq(dApplied.length, 1); deq(dApplied[0].s, IO.importD520Study(IO.exportD520Study(custom, M), M).state, 'D.520 state applied');
  Object.defineProperty(dInput, 'files', { value: [new w.File([saved], 'printed.json')], configurable: true });
  dInput.dispatchEvent(new w.Event('change')); await dctl.idle();
  ok(/printed PLA semi-wing study/.test(droot.querySelector('[role=alert]').textContent), 'printed study refused in the D.520 panel'); eq(dApplied.length, 1);
  // a state that cannot be saved shows the reasons instead of downloading
  const before = blobs.length; S.geometry.skin = 8;
  btn('Save study').click();
  eq(blobs.length, before, 'nothing downloaded'); ok(/could not be saved/.test(root.querySelector('.wio-preview').textContent) && /cavity collapses/.test(root.querySelector('[role=alert]').textContent), 'save errors shown');
  S.geometry.skin = 1.2;
  ctl.destroy(); dctl.destroy();
  eq(document.querySelector('.wio-root'), null, 'destroy removes the panels');
});

// ---------------------------------------------------------------- source rules, template file, browser global
await group('module source, template file and browser global', () => {
  const src = read('./wing_study_io.js');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [re, what] of [[/\beval\s*\(/, 'eval'], [/new\s+Function\b/, 'new Function'], [/\bfetch\s*\(/, 'fetch'], [/XMLHttpRequest/, 'XMLHttpRequest'], [/\.innerHTML\b/, 'innerHTML'], [/outerHTML/, 'outerHTML'],
    [/insertAdjacentHTML/, 'insertAdjacentHTML'], [/document\.write/, 'document.write'], [/\bimport\s*\(/, 'dynamic import'], [/<\/script/i, '</script>'], [/\bWebSocket\b/, 'WebSocket'], [/sendBeacon/, 'sendBeacon'], [/\brequire\s*\(/, 'require']])
    ok(!re.test(code), `no ${what} in the code of wing_study_io.js`);
  const file = read('./wing_parameters_template.json');
  eq(file, IO.parameterTemplateText(), 'wing_parameters_template.json = embedded template');
  const t = Q(file, 'wing_parameters_template.json');
  eq(t.status, 'geometry-only', 'template is a valid geometry-only example');
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  vm.runInContext(read('./load_profiles.js'), ctx, { filename: 'load_profiles.js' });   // the engines need the shared load profiles (v5)
  vm.runInContext(read('./wing_spars.js'),ctx,{filename:'wing_spars.js'});
  for(const name of ['wing_airfoils.js','wing_geometry.js','wing_frame3d.js'])vm.runInContext(read('./'+name),ctx,{filename:name});
  vm.runInContext(read('./engine.js'), ctx, { filename: 'engine.js' });
  vm.runInContext(read('./metal_wing_engine.js'), ctx, { filename: 'metal_wing_engine.js' });
  vm.runInContext(src, ctx, { filename: 'wing_study_io.js' });
  const G = dom.window.WingStudyIO;
  ok(G && typeof G.mount === 'function', 'browser global WingStudyIO');
  eq(G.sha256('abc'), IO.sha256('abc'));
  const viaGlobals = G.importParameters(IO.parameterTemplateText());
  eq(viaGlobals.status, 'geometry-only', 'uses the page global WingEngine when no engine is passed');
  eq(G.importPrintedStudy(JSON.stringify(printedDoc())).ok, true, 'native import with page globals');
  eq(G.importD520Study(JSON.stringify(d520Doc())).ok, true, 'D.520 import with page globals');
});

const failed = groups.filter((g) => !g.ok);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (failed.length) {
  console.error(`FAIL test_wing_study_io: ${failed.length} of ${groups.length} groups failed (${failed.map((g) => g.name).join('; ')}); ${checks} checks passed before the failures, ${secs} s`);
  process.exit(1);
}
console.log(`PASS test_wing_study_io: ${groups.length} groups, ${checks} checks (SHA-256 vectors, strict JSON, printed and D.520 round trips with exact engine results, exact unit conversions, geometry-only blocking, rejections, share links, escaping, jsdom panel) in ${secs} s`);
