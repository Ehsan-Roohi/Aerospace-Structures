// D.520 workspace with the REAL engine (jsdom DOM test; no WebGL): the shared custom-load editor in the D.520,
// the solved result equals MetalWingEngine.solve for the same input, a CSV table with an x/c column, the chord
// figure from the solved shear centre, flight loading only on request (n = 6 with inertia relief, never added to
// custom loads), clearing back to "No load", and the custom loads in the text and JSON reports.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const M=require('./metal_wing_engine.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const near=(a,b,rel,m,abs=0)=>{assert.ok(Math.abs(a-b)<=rel*Math.abs(b)+abs,`${m}: ${a} vs ${b}`);checks++;};
const dom=new JSDOM('<div id="foundations"></div><div id="app" hidden></div><div id="wingNavigation" hidden></div>',{url:'http://localhost/wing-lab.html',runScripts:'outside-only'});
const w=dom.window, ctx=dom.getInternalVMContext();
w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.scrollIntoView=()=>{};
const errors=[];w.console.error=(...a)=>errors.push(a.map(String).join(' '));
let exported=null;w.Blob=Blob;w.URL.createObjectURL=b=>{exported=b;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});w.TextEncoder=TextEncoder;
w.MetalWingEngine=M;w.METAL_REFERENCE=JSON.parse(readFileSync(new URL('./metal_wing_reference.json',import.meta.url),'utf8'));
for(const f of ['./wing_chart_math.js','./load_profiles.js','./wing_loads_ui.js','./metal_wing_ui.js']) vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const q=s=>w.document.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(test,what)=>{const deadline=Date.now()+120000;while(!test()){assert.ok(Date.now()<deadline,`UI did not settle: ${what}`);await sleep(40);}};
const UI=()=>w.MetalWingUI;
// Solve explicitly when the workspace marks the inputs out of date (explicit-Solve layout); otherwise it solves itself.
async function settle(what) {
  await sleep(700);
  await wait(()=>!/Solving/.test(q('#mChip').textContent),what);
  if(/Out of date/.test(q('#mChip').textContent)){q('#mRun').click();await sleep(50);await wait(()=>!/Solving|Out of date/.test(q('#mChip').textContent),what);}
}
const set=(id,v)=>{q('#'+id).value=String(v);};
try {
  UI().open();
  await wait(()=>q('#mChip').textContent==='No load','first opening');
  eq(JSON.stringify(UI().state.input.customLoads),'[]','opens with no load');eq(UI().state.input.inertiaRelief,false);eq(UI().state.input.n,1);
  q('[data-mtab="loads"]').click();
  ok(q('#mLoadForm')&&q('#mLoadShape'),'the shared editor is in the D.520 workspace');
  eq([...q('#mLoadShape').options].map(o=>o.value).join(),'point,uniform,up,down,trapezoid,elliptic,parabolic','D.520 shapes (Schrenk only as a flight distribution)');
  ok(/No load defined/.test(q('#mLoadList').textContent),'empty list');
  // an elliptic load, root-heavy from the fittings to the last rib, F = 10 kN at the quarter chord
  q('#mLoadShape').value='elliptic';q('#mLoadShape').dispatchEvent(new w.Event('change'));
  set('mLa',0.46);set('mLb',4.93);q('#mLshape').value='start';q('#mLbasis').value='total';set('mLvalue',10000);set('mLxc',0.25);
  q('#mLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await settle('elliptic load');
  const item={kind:'elliptic',start:0.46,end:4.93,shape:'start',total:10000,fraction:0.25};
  eq(JSON.stringify(UI().state.input.customLoads),JSON.stringify([item]),'load applied exactly as entered');
  eq(UI().state.input.inertiaRelief,false,'no inertia relief with custom loads');eq(UI().state.input.n,1,'multiplier 1');
  const R=UI().result(), ref=M.solve({...UI().state.input,collapse:true});
  near(R.fitting.M_per_g,ref.fitting.M_per_g,1e-12,'UI result = engine: moment at the fittings');near(R.tip.wMax,ref.tip.wMax,1e-12,'tip deflection');near(R.tip.twistDeg,ref.tip.twistDeg,1e-12,'tip twist');
  near(R.perG.M(0.46+1e-9),10000*4*(4.93-0.46)/(3*Math.PI)-10000*1e-9,1e-12,'M just outboard of the fittings = 4ℓF/(3π) − F·(1 nm)');near(R.perG.V(0.46+1e-9),10000-4*10000/(Math.PI*(4.93-0.46))*1e-9,1e-12,'V just outboard of the fittings = F − w₀·(1 nm)');
  ok(/elliptic \(max at start\) 0\.46–4\.93 m: F = 1 × 10⁴ N|elliptic \(max at start\) 0\.46–4\.93 m: F = 10000 N/.test(q('#mLoadList').textContent),`list: ${q('#mLoadList').textContent}`);
  // chord figure from the solved shear centre (nose-down for an upward force aft of it, here x/c = 0.6 at y = 3 m)
  q('#mLoadShape').value='point';q('#mLoadShape').dispatchEvent(new w.Event('change'));set('mLa',3);set('mLP',1000);set('mLxc',0.6);q('#mLoadForm').dispatchEvent(new w.Event('input',{bubbles:true}));
  ok(/nose-down/.test(q('#mChordFigure').innerHTML)&&/SC/.test(q('#mChordFigure').innerHTML),'chord figure: SC and nose-down torque');
  ok(/each load's torque is taken about the shear centre at its own station/.test(q('#mChordFigureCap').textContent),'D.520 torque note in the caption');
  q('#mLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle('point load');
  eq(UI().state.input.customLoads.length,2,'second load superposed');
  const T1=UI().result().perG.T(2.9), Tel=M.solve({customLoads:[item],n:1,collapse:false,modes:false}).perG.T(2.9);
  ok(T1<Tel,'the aft point force adds a nose-down torque inboard of it');
  // CSV table with an x/c column
  q('#mCsv').open=true;set('mCsvText','y_m,w_N_per_m,x_over_c\n0.46,3000,0.25\n2.5,1500,0.3\n4.93,0,0.5\n');q('#mCsvPreview').click();
  ok(/Preview: 3 rows, 2 linear segments/.test(q('#mCsvOut').textContent)&&/x\/c from the table/.test(q('#mCsvOut').textContent),'SI table preview');
  q('#mCsvApply').click();await settle('table');
  eq(UI().state.input.customLoads.length,3,'table added');eq(JSON.stringify(UI().state.input.customLoads[2].points),'[[0.46,3000,0.25],[2.5,1500,0.3],[4.93,0,0.5]]');
  const r3=M.solve({...UI().state.input,collapse:false,modes:false});near(UI().result().perG.T(1),r3.perG.T(1),1e-12,'torque with the table = engine');
  // reports carry the custom loads
  q('[data-mtab="report"]').click();
  ok(/elliptic/.test(q('#mReport').value)&&/table/.test(q('#mReport').value),'text report lists the custom loads');
  q('#mJson').click();const rec=JSON.parse(await exported.text());eq(rec.input.customLoads.length,3,'JSON report: custom loads');eq(rec.input.customLoads[2].kind,'table');
  // flight loading only on request: replaces (not adds to) the custom loads, n = 6 with inertia relief
  q('[data-mtab="loads"]').click();q('#mRestoreFlight').click();await settle('flight');
  eq(UI().state.input.customLoads,null,'flight: no custom loads');eq(UI().state.input.n,6);eq(UI().state.input.inertiaRelief,true);
  ok(/Flight-like loading is active/.test(q('#mLoadList').textContent),'list says flight loading is active');
  // a new custom load after flight starts a new custom case at multiplier 1 without inertia relief (no double counting)
  q('#mLoadShape').value='uniform';q('#mLoadShape').dispatchEvent(new w.Event('change'));set('mLa',1);set('mLb',4);set('mLq0',500);set('mLxc',0.25);
  q('#mLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle('custom after flight');
  eq(UI().state.input.customLoads.length,1,'one custom load');eq(UI().state.input.n,1,'multiplier back to 1');eq(UI().state.input.inertiaRelief,false,'inertia relief off');
  near(UI().result().perG.V(0.47),1500,1e-12,'V = 500 N/m × 3 m only (no lift, no inertia relief)');
  // refused input leaves the case unchanged
  const before=JSON.stringify(UI().state.input);set('mLa',0.2);set('mLb',3);q('#mLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  ok(/Nothing was changed/.test(q('#mLoadError').textContent),'load inboard of the fittings refused');eq(JSON.stringify(UI().state.input),before,'state unchanged');
  q('#mClearLoads').click();await settle('clear');
  eq(q('#mChip').textContent,'No load','cleared: No load');eq(JSON.stringify(UI().state.input.customLoads),'[]');
  ok(!errors.length,`console errors: ${errors.join(' | ')}`);
  console.log(`D.520 load editor (real engine): ${checks} DOM checks passed (no-load opening, elliptic/point/CSV-with-x/c loads applied and solved identically to MetalWingEngine, chord figure and torque note, reports, flight only on request and never superposed, refusal, clear).`);
} finally {dom.window.close();}
