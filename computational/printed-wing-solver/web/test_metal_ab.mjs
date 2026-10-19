// D.520 A/B comparison (jsdom DOM test with the REAL engine; no WebGL). A solved study is saved as A, one input is
// changed and solved, and the result is saved as B. Every A, B and B − A cell must equal MetalWingEngine.solve for
// the same inputs (independently re-computed here), the differing inputs must be named, out-of-date or failed
// inputs must not be saved, both snapshots must be in the JSON results export, and Clear must remove them.
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
for(const f of ['./load_profiles.js','./wing_loads_ui.js','./metal_wing_ui.js']) vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const q=s=>w.document.querySelector(s), qa=s=>[...w.document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(test,what)=>{const deadline=Date.now()+120000;while(!test()){assert.ok(Date.now()<deadline,`UI did not settle: ${what}`);await sleep(40);}};
const UI=()=>w.MetalWingUI;
async function settle(what){
  await sleep(700);
  await wait(()=>!/Solving/.test(q('#mChip').textContent),what);
  if(/Out of date/.test(q('#mChip').textContent)){q('#mRun').click();await sleep(50);await wait(()=>!/Solving|Out of date/.test(q('#mChip').textContent),what);}
}
// independent re-computation of the compared quantities from an engine result (same definitions as the report)
function expected(r){
  let g=null;
  for(const f of r.failure) if(f.governs) for(const side of ['pos','neg']){const v=f[side];if(!v)continue;const need=side==='pos'?r.nUlt:r.nUltNeg;const ratio=v.n/need;if(!g||ratio<g.ratio)g={ratio,name:f.name,side,y:v.y};}
  const boom=Math.max(...r.stations.map(s=>Math.max(Math.abs(s.boomU),Math.abs(s.boomL)))), web=Math.max(...r.stations.map(s=>Math.abs(s.tauWeb)));
  return {rows:[[r.mass.structuralHalf,'kg',2],[r.fitting.Fz_per_g*r.n/1e3,'kN',3],[r.fitting.M_per_g*r.n/1e3,'kN·m',3],[r.fitting.T_per_g*r.n,'N·m',1],[r.tip.wMax*1e3,'mm',2],[r.tip.twistDeg,'°',3],[boom/1e6,'MPa',1],[web/1e6,'MPa',2],[r.fem.fBending[0],'Hz',2],[g.ratio,'',3]],
    weakest:`${g.name} (${g.side==='pos'?'+':'−'} side, y = ${g.y.toFixed(2)} m)`};
}
const cell=(v,d)=>{const t=Math.abs(v).toFixed(d);return (v<0&&/[1-9]/.test(t)?'−':'')+t;};
const signed=(v,d)=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(d);
const UNITS=['kg','kN','kN·m','N·m','mm','°','MPa','MPa','Hz',''];
const NAMES=['Structure, half wing','Fitting reaction','Moment at the fittings','Torque at the fittings (nose-up +)','Tip deflection at rib 1','Tip twist (nose-up +)','Max boom stress','Max spar-web shear','First bending frequency','Weakest check: reached / required factor'];
function checkTable(rA,rB,label){
  const eA=expected(rA), eB=expected(rB), tr=qa('#mABTable tbody tr');
  eq(tr.length,10,`${label}: ten quantities`);
  eA.rows.forEach(([a,unit,d],i)=>{
    const b=eB.rows[i][0], td=[...tr[i].children].map(c=>c.textContent.trim()), diff=b-a, zero=Math.abs(diff)<=1e-9*Math.max(Math.abs(a),Math.abs(b));
    eq(unit,UNITS[i],`${label}: row ${i} unit`);
    eq(td[0],NAMES[i]+(unit?` (${unit})`:''),`${label}: row ${i} name and unit`);
    eq(td[1],cell(a,d),`${label}: A ${NAMES[i]}`);eq(td[2],cell(b,d),`${label}: B ${NAMES[i]}`);
    eq(td[3],zero?'0':signed(diff,d),`${label}: B − A ${NAMES[i]}`);
  });
  eq(q('#mABWeakest').textContent,`Weakest check: A ${eA.weakest}; B ${eB.weakest}${eA.weakest===eB.weakest?' (the same check)':''}.`,`${label}: weakest checks named`);
  return {eA,eB};
}
try {
  UI().open();
  await wait(()=>q('#mChip').textContent==='No load','first opening');
  q('[data-mtab="report"]').click();
  ok(q('#mSaveA')&&q('#mSaveB')&&q('#mClearAB'),'A/B buttons in the Report tab');
  ok(/Save one solved study as A, change one input, solve, and save it as B/.test(q('#mAB').textContent),'instructions before anything is saved');
  // A: the opening state (no load) is a solved study too
  q('#mSaveA').click();
  eq(q('#mABState').textContent,'Saved the solved study as A.');
  ok(/A: no load defined/.test(q('#mAB').textContent)&&/B: not saved/.test(q('#mAB').textContent),`A summary: ${q('#mAB').textContent}`);
  // flight loading, n = 6 → save as A (replaces the earlier A)
  q('[data-mtab="loads"]').click();q('#mRestoreFlight').click();await settle('flight');
  eq(UI().state.input.n,6);eq(UI().state.input.customLoads,null);
  q('[data-mtab="report"]').click();q('#mSaveA').click();
  ok(/A: flight loading, n = \+6\.0 g, lifting line, inertia relief/.test(q('#mAB').textContent),`flight A summary: ${q('#mAB').textContent}`);
  const inA=JSON.parse(JSON.stringify(UI().state.input));
  // change the load factor; saving before the solve is refused and B stays empty
  q('#mNbtns [data-n="9"]').click();
  eq(UI().state.input.n,9,'n = 9 entered');
  q('#mSaveB').click();
  eq(q('#mABState').textContent,'Run the study first: only solved inputs can be saved.','out-of-date inputs are not saved');
  ok(/B: not saved/.test(q('#mAB').textContent),'B still empty');
  await settle('n = 9');
  ok(/A: flight loading, n = \+6\.0 g/.test(q('#mAB').textContent),'A survives the re-solve and re-render');
  q('#mSaveB').click();
  const inB=JSON.parse(JSON.stringify(UI().state.input));
  const rA=M.solve({...inA,collapse:true}), rB=M.solve({...inB,collapse:true});
  const {eA,eB}=checkTable(rA,rB,'n 6 → 9');
  eq(q('#mAB').querySelectorAll('p.note')[1].textContent,'Inputs that differ: load case.','one changed input named');
  ok(!/not a one-variable comparison/.test(q('#mAB').textContent),'one-variable comparison');
  // physics of the comparison: the model is linear in n; mass, frequency and capacity do not depend on n
  for(const i of [1,2,3,4,5,6,7]) near(eB.rows[i][0]/eA.rows[i][0],1.5,1e-9,`${NAMES[i]} scales with n (9/6)`);
  for(const i of [0,8,9]) near(eB.rows[i][0],eA.rows[i][0],1e-12,`${NAMES[i]} does not depend on n`);
  for(const i of [0,8,9]) eq([...qa('#mABTable tbody tr')[i].children][3].textContent.trim(),'0',`B − A = 0 for ${NAMES[i]}`);
  // the JSON results export carries both snapshots with the same numbers
  q('#mJson').click();let rec=JSON.parse(await exported.text());
  eq(rec.compare.A.input.n,6,'JSON: A input');eq(rec.compare.B.input.n,9,'JSON: B input');eq(rec.compare.A.input.customLoads,null);
  eq(rec.compare.A.metrics.length,10);
  rec.compare.A.metrics.forEach((m,i)=>{eq(m.name,NAMES[i]);near(m.value,eA.rows[i][0],1e-12,`JSON A ${m.name}`);near(rec.compare.B.metrics[i].value,eB.rows[i][0],1e-12,`JSON B ${m.name}`);});
  eq(rec.compare.A.weakest,eA.weakest);ok(/^\d{4}-\d\d-\d\dT/.test(rec.compare.B.savedAt),'saved time recorded');
  eq(rec.input.n,9,'the export is still the current study');
  // two inputs changed: the support and the load factor → named, with the one-variable warning
  [...qa('#mTree button.node')].find(b=>/Supports/.test(b.textContent)).click();
  q('#mSup').value='clamped';q('#mSup').dispatchEvent(new w.Event('change'));
  q('#mNbtns [data-n="1"]').click();
  await settle('clamped, n = 1');
  q('[data-mtab="report"]').click();q('#mSaveB').click();
  const inB2=JSON.parse(JSON.stringify(UI().state.input));eq(inB2.support,'clamped');eq(inB2.n,1);
  checkTable(rA,M.solve({...inB2,collapse:true}),'support and n');
  ok(/Inputs that differ: load case, support\. More than one thing changed: this is not a one-variable comparison\./.test(q('#mAB').textContent),`two changes named: ${q('#mAB').textContent}`);
  // a failed solve cannot be saved: the engine's own refusal shows as an input error
  const saved=q('#mABTable').textContent;
  [...qa('#mTree button.node')].find(b=>/Structure/.test(b.textContent)).click();
  q('#mSk').value='-1';q('#mSk').dispatchEvent(new w.Event('change',{bubbles:true}));
  await sleep(900);await wait(()=>!/Solving/.test(q('#mChip').textContent),'refused scale');
  eq(q('#mChip').textContent,'Input error','the engine refuses a negative skin scale');
  ok(/Scale factor for skin must be positive/.test(q('#mStateText').textContent),q('#mStateText').textContent);
  q('#mSaveB').click();
  eq(q('#mABState').textContent,'Run the study first: only solved inputs can be saved.','inputs that failed to solve are not saved');
  eq(q('#mABTable').textContent,saved,'table unchanged');
  // a custom bench load as B: restore the skin scale, add one point load, solve, save
  q('#mSk').value='1';q('#mSk').dispatchEvent(new w.Event('change',{bubbles:true}));await settle('skin scale restored');
  q('[data-mtab="loads"]').click();
  q('#mLoadShape').value='point';q('#mLoadShape').dispatchEvent(new w.Event('change'));
  q('#mLa').value='3';q('#mLP').value='1000';q('#mLxc').value='0.25';
  q('#mLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle('custom point load');
  eq(UI().state.input.customLoads.length,1,'one custom load');
  q('[data-mtab="report"]').click();q('#mSaveB').click();
  const inB3=JSON.parse(JSON.stringify(UI().state.input));
  ok(/B: 1 custom load × \+1\.0/.test(q('#mAB').textContent),`custom B summary: ${q('#mAB').textContent}`);
  const rB3=M.solve({...inB3,collapse:true});checkTable(rA,rB3,'flight A, custom B');
  near(rB3.fitting.Fz_per_g*rB3.n,-1000,1e-12,'custom B: the fitting reacts the 1000 N point load');
  eq([...qa('#mABTable tbody tr')[1].children].map(c=>c.textContent.trim()).slice(1).join(' | '),`${cell(rA.fitting.Fz_per_g*rA.n/1e3,3)} | −1.000 | ${signed(-1-rA.fitting.Fz_per_g*rA.n/1e3,3)}`,'negative values use the same minus sign (U+2212) in every column');
  ok(!/-\d/.test(q('#mABTable').textContent),'no ASCII hyphen-minus before a number in the table');
  ok(/Inputs that differ: load case, support\./.test(q('#mAB').textContent),'flight → custom named as a load-case change');
  // clear
  q('#mClearAB').click();
  eq(q('#mABState').textContent,'A and B cleared.');ok(!q('#mABTable')&&/Save one solved study as A/.test(q('#mAB').textContent),'cleared');
  // the workspace logs an engine refusal to the console (runStudy's catch); that one is expected, nothing else is
  const unexpected=errors.filter(e=>!/Scale factor for skin must be positive/.test(e));
  eq(errors.length-unexpected.length,1,'the refused scale was logged once');
  ok(!unexpected.length,`console errors: ${unexpected.join(' | ')}`);
  console.log(`D.520 A/B comparison (real engine): ${checks} DOM checks passed (save A/B for flight n 6 → 9, two changed inputs and flight → custom load; every A, B and B − A cell = MetalWingEngine for the same inputs; linear scaling with n and n-independent mass/frequency/capacity; changed inputs named; out-of-date and refused inputs not saved; JSON export; clear).`);
} finally {dom.window.close();}
