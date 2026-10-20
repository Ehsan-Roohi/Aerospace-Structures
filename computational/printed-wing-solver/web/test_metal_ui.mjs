// DOM control-flow regressions; WebGL is checked separately in a real browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE || 'jsdom');
const M=require('./metal_wing_engine.js');
const baseline=M.solve({modes:false});
const dom=new JSDOM('<div id="foundations"></div><div id="app" hidden></div><div id="wingNavigation" hidden></div>',{url:'http://localhost/wing-lab.html',runScripts:'outside-only'});
const w=dom.window, ctx=dom.getInternalVMContext();
w.matchMedia=()=>({matches:false});
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.console.error=()=>{};
let exported;
w.Blob=Blob;
w.URL.createObjectURL=b=>{exported=b;return 'blob:test-results';};
w.URL.revokeObjectURL=()=>{};
w.HTMLAnchorElement.prototype.click=()=>{};
const failure=baseline.failure.map(f=>f.governs?{...f,pos:{n:100,y:1},neg:{n:5,y:1}}:f);
w.MetalWingEngine={...M,solve:input=>{
  if(input.mass<=0) throw new Error('Aircraft mass must be positive');
  return {...baseline,input:JSON.parse(JSON.stringify(input)),n:input.n,failure};
}};
w.METAL_REFERENCE=JSON.parse(readFileSync(new URL('./metal_wing_reference.json',import.meta.url),'utf8'));
// Same order as the built page: shared load profiles and the custom-load editor, then the workspace.
for(const f of ['./load_profiles.js','./wing_loads_ui.js','./metal_wing_ui.js']) vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const q=s=>w.document.querySelector(s);
const wait=async test=>{const deadline=Date.now()+10000;while(!test()){assert.ok(Date.now()<deadline,'UI did not settle');await new Promise(r=>setTimeout(r,25));}};
try {
  w.MetalWingUI.open();
  // First opening: no applied load, no inertia relief, multiplier 1, see-through structure view.
  await wait(()=>q('#mChip').textContent==='No load');
  assert.match(q('#mStateText').textContent,/No load defined/);
  assert.equal(JSON.stringify(w.MetalWingUI.state.input.customLoads),'[]');
  assert.equal(w.MetalWingUI.state.input.inertiaRelief,false);
  assert.equal(w.MetalWingUI.state.input.n,1);
  assert.equal(w.MetalWingUI.state.plot,'model');
  // Flight loading is applied only on request.
  q('[data-mtab="loads"]').click();
  q('#mRestoreFlight').click();
  assert.equal(w.MetalWingUI.state.input.customLoads,null);
  assert.equal(w.MetalWingUI.state.input.inertiaRelief,true);
  assert.equal(w.MetalWingUI.state.input.n,6);
  await wait(()=>q('#mChip').textContent.includes('meet assumed'));
  assert.equal(w.MetalWingUI.state.show,'all','loaded solve shows the complete wing');
  assert.equal(w.MetalWingUI.state.plot,'disp');
  assert.equal(w.MetalWingUI.state.deformed,true);
  assert.equal(w.MetalWingUI.state.arrows,true);
  assert.equal(w.MetalWingUI.state.clip,false);
  // Negative-side governing capacity 5 g meets 4.5 g, even though it is below +9 g.
  assert.ok(q('#mChip').classList.contains('ok'));
  q('[data-mtab="theory"]').click();
  assert.equal(q('#mtab-theory').hidden,false);
  assert.match(q('#mtab-theory').textContent,/200 N·m/);
  assert.match(q('#mtab-theory').textContent,/mass matrix/);
  assert.match(q('#mtab-theory').textContent,/not automatically safe/);
  assert.ok(q('#mtab-theory svg[role="img"]'));
  q('[data-mtab="start"]').click();
  q('#mBackBeams').click(); assert.equal(q('#foundations').hidden,false);
  assert.equal(q('#metalLab').hidden,true);
  w.MetalWingUI.open();
  q('#mMass').value='-1';q('#mMass').dispatchEvent(new w.Event('change'));
  q('#mRun').click();
  await wait(()=>q('#mChip').textContent==='Input error');
  await new Promise(r=>setTimeout(r,650));
  assert.equal(q('#mStateText').textContent,'Aircraft mass must be positive');
  assert.equal(q('#mChip').textContent,'Input error','finally must not hide the error');
  q('[data-mtab="report"]').click(); q('#mJson').click();
  assert.match(q('#mCopyState').textContent,/before exporting/);
  q('#mMass').value='2677';q('#mMass').dispatchEvent(new w.Event('change'));
  q('#mRun').click();await wait(()=>q('#mChip').classList.contains('ok'));
  assert.match(q('#mReport').value,/Engine 1.0.1/);
  q('#mJson').click();assert.ok(exported);
  const record=JSON.parse(await exported.text());
  assert.equal(record.input.mass,2677);assert.equal(record.n,6);
  assert.equal(record.engine,'1.0.1');assert.ok(record.stations.length>20);
  console.log('PASS: D.520 no-load opening and deliberate flight loading, navigation, signed-demand status, persistent input errors, stale-export guard and valid JSON report (DOM; no WebGL).');
} finally {dom.window.close();}
