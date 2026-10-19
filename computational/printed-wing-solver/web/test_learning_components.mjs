// DOM component tests, not a WebGL/browser visual test.
// Install jsdom separately; optionally set MIE446_JSDOM_MODULE to its module path.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE || 'jsdom');
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'});
const w=dom.window, ctx=dom.getInternalVMContext();
w.HTMLElement.prototype.scrollIntoView=function(){};
const {loadBeamLab}=await import('./beam_test_dom.mjs');
loadBeamLab(dom);
const $=s=>w.document.querySelector(s), click=s=>$(s).click();
$('#beamleftSupport').value='fixed';click('#beamSolve'); // Explicitly configure the test cantilever.
const kpi=()=>$('#beamKpis').textContent;
// The Beam Lab opens with no applied load; every load below is entered through the load form.
const addLoad=(kind,values)=>{$('#beamLoadKind').value=kind;$('#beamLoadKind').dispatchEvent(new w.Event('change'));
  for(const [id,v] of Object.entries(values))$('#'+id).value=String(v);
  $('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
assert.match(kpi(),/0\.0000 mm/);assert.match($('#beamLoads').textContent,/No load defined\. Add your own load\./);
addLoad('point',{beamLoadA:450,beamP:2});
assert.match(kpi(),/18\.2250 mm/);
$('#beamleftSupport').value='fixed';$('#beamrightSupport').value='fixed';click('#beamSolve');
assert.ok($('#beamMoveCentre'));
assert.match(kpi(),/0\.0000 mm/);
click('#beamMoveCentre');
assert.match(kpi(),/0\.2848 mm/);
click('#beamClear');addLoad('point',{beamLoadA:225,beamP:2});
$('#beamleftSupport').value='fixed';$('#beamrightSupport').value='fixed';click('#beamSolve');
assert.match(kpi(),/0\.2848 mm/);
assert.match($('#beamTheory').textContent,/fixed \/ fixed/);
$('#beamleftSupport').value='pin';$('#beamrightSupport').value='roller';click('#beamSolve');
assert.match(kpi(),/1\.1391 mm/);
click('#beamClear');addLoad('rectangle',{beamLoadA:0,beamLoadB:450,beamQ0:2/450});
assert.match(kpi(),/0\.7119 mm/);
click('#beamRefine');
assert.match($('#beamConvergence').textContent,/40/);
click('#beamClear');
click('#beamSolve');
assert.match(kpi(),/0\.0000 mm/);
$('#beamLoadKind').value='trapezoid';$('#beamLoadA').value='0';$('#beamLoadB').value='450';
$('#beamQ0').value='.002';$('#beamQ1').value='.006';
$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
assert.match(kpi(),/1\.800 N/);
click('[data-stage="shell"]');
assert.match($('#beamStatus').textContent,/not ready/);
w.document.documentElement.dataset.wingReady='true';
let requested='';w.addEventListener('wing-learning-stage',e=>requested=e.detail);
click('[data-stage="shell"]');assert.equal(requested,'shell');
assert.ok(!/NaN|undefined|Infinity/.test($('#foundations').innerHTML));
const navigationSource=read('./wing_lab_template.html');
w.document.body.insertAdjacentHTML('beforeend',navigationSource.slice(navigationSource.indexOf('<nav id="wingNavigation"'),navigationSource.indexOf('<div id="app"'))+'<div id="app"></div>');
ctx.$=$;
// The extracted navigation closure also references the real lazy load-editor keeper.
ctx.wingLoadKeeper=require('./wing_loads_ui.js').keeper({});
vm.runInContext(navigationSource.slice(navigationSource.indexOf('  function returnToBeams('),navigationSource.indexOf("  document.documentElement.dataset.wingReady='true'")),ctx);
for(const support of ['beam']) {
  $('#foundations').hidden=true;$('#app').hidden=false;$('#wingNavigation').hidden=false;
  click(`[data-return-beam="${support}"]`);
  assert.equal($('#foundations').hidden,false);assert.equal($('#app').hidden,true);assert.equal($('#wingNavigation').hidden,true);
  assert.equal($(`[data-stage="${support}"]`).getAttribute('aria-pressed'),'true');
  assert.equal(w.document.activeElement,$(`[data-stage="${support}"]`));
}
$('#foundations').hidden=true;$('#app').hidden=false;$('#wingNavigation').hidden=false;
const previousBeam=kpi();click('#backFoundations');
assert.equal(kpi(),previousBeam,'Back preserves the beam study');
assert.equal($('#foundations').hidden,false);assert.equal($('#app').hidden,true);
dom.window.close();

// Render the actual member/load lesson functions with real engine results.
const E=require('./engine.js'), source=read('./wing_lab_template.html').replace('/*__TEACHING_PANELS__*/',read('./teaching_panels.js'));
const wingDOM=new JSDOM('<div id="app" data-lesson-stage="project"></div><div id="memberLesson"></div><div id="wingLoadLesson"></div>',{runScripts:'outside-only'});
const c=wingDOM.getInternalVMContext();
c.E=E;c.nf=(x,d=2)=>Number(x).toFixed(d);c.R=E.solve({});
c.TeachingModels=require('./teaching_models.js');c.frame=()=>Promise.resolve();
c.WingLoadsUI=require('./wing_loads_ui.js');c.LoadProfiles=require('./load_profiles.js');
c.S={geometry:c.R.geometry,load:c.R.load,stressComponent:'skin'};
c.running=false;c.stale=false;
c.model=null; // DOM-only harness: no WebGL model has been constructed.
c.geometryPreview=null; // These draw-load assertions exercise the solved model, not a draft preview.
c.$=s=>wingDOM.window.document.querySelector(s);
c.setPlot=p=>{c.lastPlot=p;};c.applyXray=()=>{};c.setAnatomy=p=>{c.lastAnatomy=p;};
c.changed=()=>{c.changeCount=(c.changeCount||0)+1;};c.flash=s=>{throw Error(s);};
c.engineInput=()=>({geometry:c.S.geometry,load:c.S.load});
vm.runInContext(source.slice(source.indexOf('  function svgFrame('),source.indexOf('  function renderDesignLab(')),c);
c.renderMemberLesson();
assert.match(c.$('#memberLesson').textContent,/3 interior/);
assert.match(c.$('#memberLesson').textContent,/full stress map inside every rib is not solved/);
assert.match(c.$('#memberLesson').textContent,/146.0 mm/);
c.$('#rodStress').click();assert.equal(c.S.stressComponent,'rods');assert.equal(c.lastPlot,'stress');
c.$('#ribBearingView').click();assert.equal(c.lastAnatomy,'ribs');
const rows=[...c.$('#stripResult').querySelectorAll('tr')].slice(1).map(tr=>[...tr.cells].map(td=>parseFloat(td.textContent)));
assert.ok(Math.abs(rows[0][2]/rows[1][2]-16)<.02);
assert.match(c.$('#bucklingModels').textContent,/excluded from student governing/);
c.$('#syntheticObservations').click();
c.$('#observationForm').dispatchEvent(new wingDOM.window.Event('submit',{bubbles:true,cancelable:true}));
assert.match(c.$('#observationResult').textContent,/SYNTHETIC DEMONSTRATION/);
assert.match(c.$('#observationResult').textContent,/0.9091 N\/mm/);
c.$('#stripPressure').value='-1';
c.$('#localForm').dispatchEvent(new wingDOM.window.Event('submit',{bubbles:true,cancelable:true}));
assert.match(c.$('#stripResult').textContent,/nonnegative pressure/);
c.$('#stripPressure').value='120';c.$('#localForm').dispatchEvent(new wingDOM.window.Event('submit',{bubbles:true,cancelable:true}));
await c.$('#compareNoRibs').onclick();
assert.match(c.$('#ribDelta').textContent,/Root EI/);
c.renderWingLoads();
assert.equal(c.$('#wingB').disabled,true,'Point force hides distributed end');
assert.equal(c.$('#wingQ0').closest('.field').hidden,true);
c.$('#wingKind').value='trapezoid';c.$('#wingA').value='40';c.$('#wingB').value='400';
c.$('#wingLoadForm').dispatchEvent(new wingDOM.window.Event('submit',{bubbles:true,cancelable:true}));
assert.equal(c.S.load.kind,'custom');assert.equal(c.S.load.items.length,1);assert.equal(c.changeCount,1);
// All printed presets use the same load editor, independent of reinforcement.
for(const stage of ['shell','rods','ribs','project']) {
  const project=stage==='project';
  c.R=E.solve({geometry:{modules:project?3:1,rodFractions:stage==='shell'?[]:[.3,.6],customInteriorRibs:stage==='ribs'?[112.5,146,154,225,296,304,337.5]:[]},assembly:{seamsBonded:true},load:{kind:'tip',tipForce:2}});
  c.S.geometry=c.R.geometry;c.S.load=c.R.load;
  for(const shape of ['point','rectangle','triangle','triangleDown','trapezoid']) {
    c.renderWingLoads();c.$('#wingKind').value=shape;
    c.$('#wingKind').dispatchEvent(new wingDOM.window.Event('change'));
    assert.equal(c.$('#wingP').disabled,shape!=='point');
    assert.equal(c.$('#wingB').disabled,shape==='point');
    c.$('#wingA').value='40';c.$('#wingB').value='400';c.$('#wingP').value='-2';
    c.$('#wingQ0').value='.004';c.$('#wingQ1').value='.008';
    c.$('#wingLoadForm').dispatchEvent(new wingDOM.window.Event('submit',{bubbles:true,cancelable:true}));
    const load=c.S.load.items.at(-1);
    if(shape==='point')assert.equal(load.force,-2);
    else {assert.equal(load.qStart,shape==='triangle'?0:.004);assert.equal(load.qEnd,shape==='triangleDown'?0:shape==='rectangle'?.004:.008);}
    const solved=E.solve(c.engineInput());assert.ok(Number.isFinite(solved.M[0]));
  }
  assert.equal(c.S.load.items.length,5,'Loads are superposed, not overwritten');
}
c.R=E.solve({geometry:{modules:1,customInteriorRibs:[],rodFractions:[]},assembly:{seamsBonded:true},load:{kind:'tip',tipForce:2}});
c.S.geometry=c.R.geometry;c.$('#app').dataset.lessonStage='shell';c.renderMemberLesson();
assert.match(c.$('#memberLesson').textContent,/No rods in this model/);
assert.ok(!/NaN|undefined|Infinity/.test(c.$('#memberLesson').innerHTML));
c.S.plot='model';
c.R={geometry:E.makeGeometry(),load:{kind:'custom',items:[{kind:'distributed',start:0,end:450,qStart:.01,qEnd:.01,fraction:.2},{kind:'distributed',start:0,end:450,qStart:-.01,qEnd:-.01,fraction:.7}]},props:{zBot:[0],zTop:[10]},point:[]};
c.model={loads:{children:[],add(a){this.children.push(a);}}};
c.sectionMotion=()=>[0];c.at=a=>a[0];c.COLORS={load:1,relief:2};
c.THREE={Vector3:class{constructor(x,y,z){Object.assign(this,{x,y,z});}},ArrowHelper:class{constructor(direction,origin,length,color){Object.assign(this,{direction,origin,length,color});}}};
vm.runInContext(source.slice(source.indexOf('  function drawLoads()'),source.indexOf('  function renderLegend(')),c);
c.drawLoads();
assert.equal(c.model.loads.children.length,26,'Opposite loads must not disappear when net transverse force cancels');
assert.equal(c.model.loads.children[0].origin.z,32);
assert.equal(c.model.loads.children[13].origin.z,112);
assert.equal(c.model.loads.children[0].direction.y,1);
assert.equal(c.model.loads.children[13].direction.y,-1);
wingDOM.window.close();
console.log('PASS: beam controls, supports, load forms, convergence table, graphics fallback, wing member lessons, separate stress controls, local strip scaling, custom wing load submission and force-couple arrow placement (DOM component tests; no WebGL rendering).');
