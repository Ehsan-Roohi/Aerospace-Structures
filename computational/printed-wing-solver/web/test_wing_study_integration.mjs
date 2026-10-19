// Study files, design-parameter import (analysis gate) and study links wired into BOTH wing workspaces of the built
// page (docs/wing-lab.html in jsdom with the real engines; WebGL replaced by the THREE stand-in of
// test_wing_layout_controls.mjs). Printed wing: save → change → open → Apply restores the study and the same solved
// numbers; a geometry-only parameter file applies the outer shape but blocks Solve, Save and links until every
// structural item is ticked (or the previous geometry is restored); a link reopens and solves the same study; a
// damaged link opens the course wing with no load on a first visit and changes nothing in an open study; a study with
// the page's maximum of 8 rods is saved, reopened and linked, and a file with 9 is refused. D.520: save/open round trip, a hand-made file with null
// material/mass/CL, and a "#d520&wingstudy=" link.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8');
const layoutTest=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8');
// The same THREE stand-in as the layout test (scene graph kept, rendering inert).
const makeThree=new Function(`${layoutTest.slice(layoutTest.indexOf('function makeThree()'),layoutTest.indexOf('function openPage('))}\nreturn makeThree;`)();
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++;};
const eq=(a,b,m)=>{assert.equal(JSON.stringify(a),JSON.stringify(b),m);checks++;};
const near=(a,b,rel,m,abs=0)=>{assert.ok(Math.abs(a-b)<=rel*Math.abs(b)+abs,`${m}: ${a} vs ${b}`);checks++;};
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
async function until(test,what,ms=120000){const end=Date.now()+ms;while(!test()){assert.ok(Date.now()<end,`timed out waiting for ${what}`);await tick(20);}}
function openPage(hash='') {
  const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html'+hash,runScripts:'outside-only',virtualConsole:new VirtualConsole()});
  const w=dom.window, ctx=dom.getInternalVMContext(), downloads=[];
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.setInterval=()=>0;
  w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>null;
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.console.error=()=>{};
  w.Blob=Blob;w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.at(-1).name=this.download;};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true});
  for(const [,attrs,code] of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(/\bsrc=/.test(attrs)) {if(/OrbitControls/.test(attrs))w.THREE=makeThree();continue;}
    vm.runInContext(code,ctx);
  }
  const $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
  return {dom,w,$,$$,downloads};
}
const metrics=r=>({mass:r.mass.printed,EI:r.sections[0].EIf,GJ:r.sections[0].GJ,V0:r.V[0],M0:r.M[0],T0:r.T[0],tip:r.deflection.at(-1),twist:r.twist.at(-1),sig:Math.max(...r.stress.sigTop.map(Math.abs))});
const btn=(root,re)=>[...root.querySelectorAll('button')].find(b=>re.test(b.textContent));

/* ---------- printed semi-wing ---------- */
let savedText, savedMetrics, link;
{
  const {dom,w,$,$$,downloads}=openPage(), ui=()=>w.WingLabUI;
  const solved=async()=>{await until(()=>ui().result()&&!ui().isRunning()&&!ui().isStale()&&$('#stateChip').textContent==='Solved','a solved study');await tick(5);};
  const solve=async()=>{const before=ui().result();$('#runBtn').click();await until(()=>ui().result()!==before&&!ui().isRunning(),'Solve');await solved();return ui().result();};
  try {
    w.dispatchEvent(new w.CustomEvent('wing-learning-stage',{detail:'project'}));await solved();
    ok($('#wingStudyFiles .wio-root.wio-printed')&&$('#wingShareBtn'),'study files and link button in the input column');
    // a load through the shared editor (solves at once), and a skin change (pending until Solve)
    $('#wingKind').value='elliptic';$('#wingKind').dispatchEvent(new w.Event('change'));
    for(const [id,v] of [['wingA',0],['wingB',450],['wingCurveValue',2],['wingFraction',0.3]]) $('#'+id).value=String(v);
    $('#wingLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>ui().result().load.kind==='custom'&&ui().result().load.items.length===1&&!ui().isRunning()&&!ui().isStale(),'the elliptic load solved');
    $('#wgSkin').value='1.1';$('#wgSkin').dispatchEvent(new w.Event('change',{bubbles:true}));ok(ui().isStale(),'skin edit pending');
    let R=await solve();savedMetrics=metrics(R);ok(Math.abs(R.V[0]-2)<1e-9&&R.geometry.skin===1.1,'solved: elliptic F = 2 N, skin 1.1 mm');
    // Save
    btn($('#wingStudyFiles'),/Save study/).click();
    savedText=await downloads.at(-1).text();const doc=JSON.parse(savedText);
    eq([doc.format,doc.workspace,doc.study.geometry.skin,doc.study.load.kind,doc.study.load.items[0].kind,doc.study.load.items[0].total],['mie446-wing-study','printed',1.1,'custom','elliptic',2],'saved study file');
    ok(/^mie446-printed-wing-study-\d{4}-\d\d-\d\d\.json$/.test(downloads.at(-1).name),'file name');
    // change, then open the saved file: preview, Apply, pending, Solve → the same numbers
    // (a shorter span would strand the 0–450 mm load: the layout refuses that atomically; change the root chord)
    $('#wgSpan').value='420';$('#wgSpan').dispatchEvent(new w.Event('change',{bubbles:true}));ok(ui().state().geometry.semiSpan===450,'a span that strands the load is refused');
    $('#wgRoot').value='170';$('#wgRoot').dispatchEvent(new w.Event('change',{bubbles:true}));R=await solve();ok(R.geometry.rootChord===170,'changed study solved');
    ui().studyFiles().openText(savedText,'saved.json');
    ok(/Apply/.test($('#wingStudyFiles .wio-preview').textContent)&&!$('#wingStudyFiles .wio-preview').hidden,'preview before anything changes');eq(ui().state().geometry.rootChord,170,'preview changes nothing');
    btn($('#wingStudyFiles'),/^Apply$/).click();
    eq([ui().state().geometry.rootChord,ui().state().geometry.skin,ui().state().load.items.length],[160,1.1,1],'Apply restores the saved inputs');
    ok(ui().isStale()&&$('#stateChip').textContent==='Out of date','opening a file never solves by itself');
    R=await solve();const m=metrics(R);for(const k of Object.keys(m)) near(m[k],savedMetrics[k],1e-12,`round trip: identical ${k}`,1e-15);
    // a link to the solved study
    $('#wingShareBtn').click();await tick(10);link=$('#wingShareBox').value;
    ok(/#wingstudy=[A-Za-z0-9_-]+$/.test(link)&&!$('#wingShareBox').hidden,'link built for the solved study');
    $('#wgRibT').value='1.6';$('#wgRibT').dispatchEvent(new w.Event('change',{bubbles:true}));
    ok($('#wingShareBox').hidden&&$('#wingShareBox').value==='','an edit hides the link made for the previous inputs');
    $('#wingShareBtn').click();await tick(10);ok(/Solve the inputs on screen first/.test($('#wingShareMsg').textContent)&&$('#wingShareBox').hidden,'no link for unsolved inputs');
    R=await solve();
    // geometry-only design parameters: the outer shape is applied, the analysis is blocked
    let before=metrics(R);const beforeGeo=JSON.stringify(ui().state().geometry);
    const params={...JSON.parse(readFileSync(new URL('./wing_parameters_template.json',import.meta.url),'utf8')),units:{length:'cm'},span:{value:84,kind:'full'},rootChord:15,tipChord:9.5,airfoil:{type:'naca4',code:'2415'}};
    ui().studyFiles().previewParameters(JSON.stringify(params),'from-my-design-tool.json');
    const pv=$('#wingStudyFiles .wio-preview').textContent;
    ok(/analysis/i.test(pv)&&/blocked/i.test(pv)&&/84/.test(pv)&&/420/.test(pv),'preview: original and converted values, analysis blocked');
    ok(!btn($('#wingStudyFiles'),/Apply complete study/),'a geometry-only file cannot be applied as a complete study');
    btn($('#wingStudyFiles'),/Apply outer geometry/).click();
    // the current 0–450 mm load would lie beyond the new 420 mm semi-span: refused as a whole, nothing changes
    ok(/could not apply/i.test($('#wingStudyFiles .wio-preview').textContent)&&/450|load/i.test($('#wingStudyFiles .wio-preview').textContent),'an outer shape that strands the current load is refused with the reason');
    eq(JSON.stringify(ui().state().geometry),beforeGeo,'…and the geometry is unchanged');ok(!ui().importGate(),'…and no gate is opened');
    btn($('#wingStudyFiles'),/Dismiss/).click();
    $('#wingClearLoad').click();await until(()=>ui().result().load.items.length===0&&!ui().isRunning()&&!ui().isStale(),'loads cleared');
    ui().studyFiles().previewParameters(JSON.stringify(params),'from-my-design-tool.json');btn($('#wingStudyFiles'),/Apply outer geometry/).click();
    const g=ui().state().geometry;eq([g.naca,g.semiSpan,g.rootChord,g.tipChord],['2415',420,150,95],'outer geometry applied in mm (full span 84 cm → semi-span 420 mm)');
    ok(!$('#wingImportGate').hidden&&$$('#wingImportGate [data-gate]').length===7,'gate: seven structural items to confirm');
    ok(/from-my-design-tool\.json/.test($('#wingImportGate').textContent)&&/SHA-256/.test($('#wingImportGate').textContent),'gate names the file and its hash');
    eq($('#stateChip').textContent,'Analysis blocked','chip: analysis blocked');
    const r0=ui().result();$('#runBtn').click();await tick(600);
    ok(ui().result()===r0&&ui().importGate().open,'Solve does nothing while blocked');
    $('#wingAutoSolve').checked=true;$('#wingAutoSolve').dispatchEvent(new w.Event('change',{bubbles:true}));await tick(600);ok(ui().result()===r0,'auto-solve is blocked too');
    $('#wingAutoSolve').checked=false;$('#wingAutoSolve').dispatchEvent(new w.Event('change',{bubbles:true}));
    btn($('#wingStudyFiles'),/Save study/).click();ok(/could not be saved/.test($('#wingStudyFiles .wio-preview').textContent)&&/Confirm the structural inputs/.test($('#wingStudyFiles .wio-preview').textContent),'Save refused while blocked');
    btn($('#wingStudyFiles'),/Dismiss/).click();
    $('#wingShareBtn').click();await tick(10);ok(/Confirm the structural inputs/.test($('#wingShareMsg').textContent),'link refused while blocked');
    // restore the previous geometry
    $('#wingGateRestore').click();eq(JSON.stringify(ui().state().geometry),beforeGeo,'Discard restores the previous geometry exactly');ok($('#wingImportGate').hidden&&!ui().importGate(),'gate closed');
    // import again and confirm every item: the study solves with the imported shape
    ui().studyFiles().previewParameters(JSON.stringify(params),'from-my-design-tool.json');btn($('#wingStudyFiles'),/Apply outer geometry/).click();
    const boxes=$$('#wingImportGate [data-gate]');
    for(const [k,b] of boxes.entries()){b.checked=true;b.dispatchEvent(new w.Event('change'));if(k<boxes.length-1) ok(ui().importGate().open,'still blocked until the last item');}
    ok(!ui().importGate().open&&$('#stateChip').textContent==='Out of date','all items confirmed: ready to solve');
    R=await solve();eq([R.geometry.naca,R.geometry.semiSpan,R.geometry.rootChord,R.geometry.tipChord],['2415',420,150,95],'the imported shape is analysed');
    const a=metrics(R);ok(a.EI!==before.EI&&a.mass!==before.mass,'stiffness and mass recalculated for the imported shape');
    dom.window.close();
  } catch(e) {dom.window.close();throw e;}
}
// the link opens the same study and solves it
{
  const {dom,w,$}=openPage(link.slice(link.indexOf('#'))), ui=()=>w.WingLabUI;
  try {
    await until(()=>ui().result()&&!ui().isRunning()&&!ui().isStale()&&ui().result().load.kind==='custom'&&ui().result().load.items.length===1,'the linked study solved');
    ok(!$('#app').hidden,'the link opens the printed workspace');ok(/Shared study opened from the link/.test($('#wingFilesNote').textContent),'the link says what it opened');
    const m=metrics(ui().result());for(const k of Object.keys(m)) near(m[k],savedMetrics[k],1e-12,`link: identical ${k}`,1e-15);
    dom.window.close();
  } catch(e) {dom.window.close();throw e;}
}
{
  const {dom,w,$}=openPage('#wingstudy=not*a*study'), ui=()=>w.WingLabUI;
  try {
    await until(()=>ui().result()&&!ui().isRunning(),'the fallback study');
    ok(/The study link could not be opened/.test($('#wingFilesNote').textContent)&&$('#wlFiles').open,'a damaged link says why (Study files opened)');ok($('#stateChip').textContent!=='Input error','…without an input error');
    eq([ui().result().load.kind,ui().result().load.items.length],['custom',0],'…and opens the course wing with no load');
    dom.window.close();
  } catch(e) {dom.window.close();throw e;}
}
// eight rods (the page's maximum) are saved, reopened and linked; a file with nine is refused; a damaged link
// pasted into the open page leaves the study on screen unchanged (also with the D.520 on screen); the property panel
// refuses out-of-range load-case and check values
let rods8Link, rods8Metrics;
{
  const {dom,w,$,downloads}=openPage(), ui=()=>w.WingLabUI;
  const solved=async()=>{await until(()=>ui().result()&&!ui().isRunning()&&!ui().isStale()&&$('#stateChip').textContent==='Solved','a solved study');await tick(5);};
  const solve=async()=>{const before=ui().result();$('#runBtn').click();await until(()=>ui().result()!==before&&!ui().isRunning(),'Solve');await solved();return ui().result();};
  try {
    w.dispatchEvent(new w.CustomEvent('wing-learning-stage',{detail:'project'}));await solved();
    const rods8=[0.12,0.18,0.24,0.3,0.36,0.42,0.48,0.54];
    const res=ui().applyGeometry({naca:'2418',rodDiameter:2,sleeveWall:0.8,clearance:0.2,rodFractions:rods8});
    ok(res&&res.ok,`the page accepts 8 rods: ${res&&res.error}`);
    const R8=await solve();eq(R8.geometry.rodFractions,rods8,'8 rods solved');const m8=metrics(R8);
    btn($('#wingStudyFiles'),/Save study/).click();const text=await downloads.at(-1).text();
    eq(JSON.parse(text).study.geometry.rodFractions,rods8,'an 8-rod study is saved');
    ok(ui().applyGeometry({rodFractions:[0.3,0.5]}).ok,'changed to 2 rods');await solve();
    ui().studyFiles().openText(text,'rods8.json');btn($('#wingStudyFiles'),/^Apply$/).click();
    const R8b=await solve();eq(R8b.geometry.rodFractions,rods8,'the 8-rod study reopens');
    const mb=metrics(R8b);for(const k of Object.keys(m8)) near(mb[k],m8[k],1e-12,`8 rods reopened: identical ${k}`,1e-15);
    $('#wingShareBtn').click();await tick(10);rods8Link=$('#wingShareBox').value;ok(/#wingstudy=[A-Za-z0-9_-]+$/.test(rods8Link),`an 8-rod study has a link: ${$('#wingShareMsg').textContent}`);rods8Metrics=mb;
    const nine=JSON.parse(text);nine.study.geometry.rodFractions=[...rods8,0.6];
    ui().studyFiles().openText(JSON.stringify(nine),'rods9.json');
    ok(/lists 9 rods; at most 8 are allowed/.test($('#wingStudyFiles .wio-preview').textContent),'a file with 9 rods is refused with the limit');
    ok(!btn($('#wingStudyFiles'),/^Apply$/)||btn($('#wingStudyFiles'),/^Apply$/).disabled||btn($('#wingStudyFiles'),/^Apply$/).hidden,'…and cannot be applied');
    // a damaged link pasted into the open page: checked first, nothing changes
    const before=JSON.stringify(ui().state()), rBefore=ui().result();
    w.location.hash='#wingstudy=still*not*a*study';await tick(50);
    ok(/The study link could not be opened/.test($('#wingFilesNote').textContent)&&/The printed-wing study is shown unchanged/.test($('#wingFilesNote').textContent),`damaged link on an open page: ${$('#wingFilesNote').textContent}`);
    eq(JSON.stringify(ui().state()),before,'…the study on screen is unchanged');ok(ui().result()===rBefore&&!ui().isRunning(),'…and is not re-solved');
    eq(ui().result().geometry.rodFractions,rods8,'…still the 8-rod study');
    // the same with the D.520 on screen: the printed wing is shown unchanged and the D.520 is hidden (never both)
    w.MetalWingUI.open();await until(()=>w.MetalWingUI.result()&&$('#mChip').textContent==='No load','D.520 opened');
    ok(!$('#metalLab').hidden&&$('#app').hidden,'the D.520 is on screen');
    w.location.hash='#wingstudy=damaged*again';await tick(50);
    ok($('#metalLab').hidden&&!$('#app').hidden,'a damaged printed-wing link shows the printed wing and hides the D.520');
    eq(JSON.stringify(ui().state()),before,'…with the printed study unchanged');ok(ui().result()===rBefore,'…and not re-solved');
    // the property panel refuses load-case and check values that the engine would misuse or a study file refuses
    $('#tree button[data-id="load"]').click();
    const field=async(id,v)=>{const f=$('#'+id);f.value=String(v);f.dispatchEvent(new w.Event('change',{bubbles:true}));await tick(5);return f;};
    for(const [id,v,re,key] of [['fos',0,/Factor of safety: must be greater than 0/,'fos'],['fos',-1.5,/Factor of safety: must be greater than 0/,'fos'],['tm',-1,/Tip sensor mass: cannot be negative/,'tipMass']]) {
      const was=ui().state().load[key],f=await field(id,v);
      ok(re.test(ui().inputError()||'')&&f.getAttribute('aria-invalid')==='true',`${id} = ${v} refused: ${ui().inputError()}`);eq(ui().state().load[key],was,`${id} = ${v}: the previous value is kept`);
    }
    for(const [id,v,re,key] of [['cd',0,/Max tip deflection: must be greater than 0 mm/,'maxTipDeflection'],['ct',-2,/Max tip twist: must be greater than 0/,'maxTipTwist']]) {
      const was=ui().state().criteria[key];await field(id,v);ok(re.test(ui().inputError()||''),`${id} = ${v} refused: ${ui().inputError()}`);eq(ui().state().criteria[key],was,`${id}: kept`);
    }
    await field('fos',1.2);eq(ui().state().load.fos,1.2,'a valid factor of safety is accepted');ok($('#fos').getAttribute('aria-invalid')==='false','…and marked valid');
    btn($('#pm'),/^Flight-like lift$/).click();await tick(5);
    for(const [id,v,re] of [['am',-1,/Aircraft mass: must be greater than 0 kg/],['am',0,/Aircraft mass: must be greater than 0 kg/],['lcf',1.2,/Lift acts at: must lie between 0 \(leading edge\) and 1/],['lcf',-0.1,/Lift acts at: must lie between 0/]]) {
      const was=JSON.stringify(ui().state().load);await field(id,v);ok(re.test(ui().inputError()||''),`${id} = ${v} refused: ${ui().inputError()}`);eq(JSON.stringify(ui().state().load),was,`${id} = ${v}: load case unchanged`);
    }
    dom.window.close();
  } catch(e) {dom.window.close();throw e;}
}
{
  const {dom,w,$}=openPage(rods8Link.slice(rods8Link.indexOf('#'))), ui=()=>w.WingLabUI;
  try {
    await until(()=>ui().result()&&!ui().isRunning()&&!ui().isStale()&&ui().result().geometry.rodFractions.length===8,'the 8-rod link solved');
    const m=metrics(ui().result());for(const k of Object.keys(m)) near(m[k],rods8Metrics[k],1e-12,`8-rod link: identical ${k}`,1e-15);
    dom.window.close();
  } catch(e) {dom.window.close();throw e;}
}

/* ---------- D.520 ---------- */
let d520Link, d520Fit;
{
  const {dom,w,$,downloads}=openPage(), UI=()=>w.MetalWingUI;
  const settled=async what=>{await tick(700);await until(()=>UI().result()&&!/Solving|Out of date/.test($('#mChip').textContent),what);};
  try {
    UI().open();await until(()=>$('#mChip').textContent==='No load','D.520 no-load opening');
    ok($('#mStudyFiles .wio-root.wio-d520')&&$('#mLoadEditor .wle[data-workspace="d520"]'),'D.520 study files and load editor in the input column');
    $('#mLoadShape').value='parabolic';$('#mLoadShape').dispatchEvent(new w.Event('change'));
    for(const [id,v] of [['mLa',1],['mLb',4],['mLvalue',5000],['mLxc',0.3]]) $('#'+id).value=String(v);
    $('#mLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settled('D.520 load');
    d520Fit=UI().result().fitting.M_per_g;ok(Math.abs(UI().result().perG.V(0.47)-5000)<1e-6,'parabolic 5 kN applied');
    btn($('#mStudyFiles'),/Save study/).click();const text=await downloads.at(-1).text(), doc=JSON.parse(text);
    eq([doc.workspace,doc.study.customLoads.length,doc.study.customLoads[0].kind],['d520',1,'parabolic'],'D.520 study saved');
    $('#mClearLoads').click();await settled('cleared');eq(UI().state.input.customLoads.length,0,'cleared');
    UI().studyFiles().openText(text,'d520.json');btn($('#mStudyFiles'),/^Apply$/).click();await settled('reopened');
    eq(UI().state.input.customLoads.length,1,'study reopened');near(UI().result().fitting.M_per_g,d520Fit,1e-12,'same moment at the fittings');
    // a hand-made file with material, mass and CL left to the preset (null)
    const hand={...doc,study:{...doc.study,material:null,mass:null,CL:null}};
    UI().studyFiles().openText(JSON.stringify(hand),'hand.json');btn($('#mStudyFiles'),/^Apply$/).click();await settled('hand-made file');
    ok(UI().state.input.material&&UI().state.input.material.E>0&&UI().state.input.mass>0&&UI().state.input.CL>0,'null material/mass/CL take the D.520 preset (no crash)');
    near(UI().result().fitting.M_per_g,d520Fit,1e-12,'…and give the same result');
    $('#mShareBtn').click();await tick(10);d520Link=$('#mShareBox').value;ok(/#d520&wingstudy=[A-Za-z0-9_-]+$/.test(d520Link),'D.520 link');
    dom.window.close();
  } catch(e) {dom.window.close();throw e;}
}
{
  const {dom,w,$}=openPage(d520Link.slice(d520Link.indexOf('#'))), UI=()=>w.MetalWingUI;
  try {
    await until(()=>UI().result()&&!/Solving|Out of date/.test($('#mChip').textContent)&&UI().state.input.customLoads&&UI().state.input.customLoads.length===1,'the linked D.520 study',180000);
    ok(!$('#metalLab').hidden,'the link opens the D.520 workspace');near(UI().result().fitting.M_per_g,d520Fit,1e-12,'linked D.520 study: same result');
    ok(/Shared D\.520 study opened/.test($('#mShareMsg').textContent),'the link says what it opened');
    dom.window.close();
  } catch(e) {dom.window.close();throw e;}
}
console.log(`Wing study files, import gate and links: ${checks} checks passed (printed: save/open round trip with identical mass, EI, GJ, V/M/T, deflection, twist and stress; geometry-only parameter file → outer shape in mm, Solve/auto-solve/Save/link blocked until 7 items are ticked, restore; link reopens and solves identically; damaged link falls back to no load on a first visit and changes nothing in an open study (also from the D.520); 8 rods saved, reopened and opened from a link with identical results, 9 refused; out-of-range load-case and check values refused in the property panel; D.520: save/open, null material/mass/CL, link).`);
