/* UI-only regression tests against functions extracted from the shipped page.
 * No browser rendering or numerical-solver accuracy is claimed by these tests.
 * Usage: node scripts/validation/wing_display_state_regression.cjs [JSON files...]
 */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const page = fs.readFileSync(path.resolve(__dirname, '../../docs/wing-panel-stress-analyzer/index.html'), 'utf8');
function source(name) {
  const start = page.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  for (let end = page.indexOf('\n  }', start); end >= 0; end = page.indexOf('\n  }', end + 1)) {
    const text = page.slice(start, end + 4);
    try { new vm.Script(`(${text})`); return text; } catch {}
  }
  throw Error(`Cannot extract ${name}`);
}
let count = 0;
const nodes = new Map();
const $ = id => {
  if (!nodes.has(id)) nodes.set(id, {attrs:{}, setAttribute(k,v){this.attrs[k]=v;}});
  return nodes.get(id);
};
const events = [];
const ctx = vm.createContext({
  S:{geometry:{rodFractions:[]}, selected:'part'}, R:null,
  designBaseline:null, saveDesignAfterRun:false, lastViewSet:true, lastGeoKey:'old',
  $, Event:class {constructor(type){this.type=type;}},
  window:{dispatchEvent:e=>events.push(e.type)},
  setPlot(p,refresh){ctx.S.plot=p;ctx.lastPlot=[p,refresh];},
  keyForPatch:()=> 'geometry', checkGeometry:g=>g,
  WingGeometry:{closedTip:()=>false}, wingSelection:{clear(){}},
  fieldErrors:{}, GEO_FIELDS:{geometry:'Geometry'},
  flash(){},setTimeout(){},renderInputs(){},renderPM(){},
  edited(){ctx.previewState={...ctx.S,geometry:{...ctx.S.geometry}};},
  stlReference:null,historySuspended:0,importGate:null,
  E:{DEFAULT_LOAD:{kind:'custom'}}, syncMirrorState(){},
  renderImportGate(){},renderTree(){},setStatus(){},
  wingAero:{refresh(){}},recordWingHistory(){},
  interiorStations(){throw Error('comparison guard passed');},
  model:{g:{semiSpan:450}},canvas:{clientWidth:0,clientHeight:0},
  resize(){ctx.resized=true;},setView(v){ctx.fitted=v;}
});
for (const name of ['resetWingPresentation','canCompareDesign','renderDesignLab','applyGeometry','applyStudyState','frameView']) vm.runInContext(source(name),ctx);
function dirtyView() {
  Object.assign(ctx.S,{plot:'stress',anatomy:'rods',xray:true,deformed:true,clip:true,explode:1});
  ctx.designBaseline={analysis3D:{type:'closed-tip'}};
  ctx.saveDesignAfterRun=true;ctx.lastViewSet=true;ctx.lastGeoKey='old';
}
function visibleModel() {
  assert.equal(ctx.S.plot,'model');assert.equal(ctx.S.anatomy,'assembled');
  for (const k of ['xray','deformed','clip']) assert.equal(ctx.S[k],false,k);
  assert.equal(ctx.S.explode,0);assert.equal(ctx.lastViewSet,false);
  assert.equal(ctx.lastGeoKey,null);assert.equal(ctx.designBaseline,null);
  assert.ok(events.includes('wing-show-model'));count++;
}
const legacy={geometry:{semiSpan:450},stress:{skinComp:[1],sigFlat:[2]},fem:{fBending:[3]},deflection:[0],twist:[0]};
assert.equal(ctx.canCompareDesign(legacy),true);count++;
for (const r of [null,{}, {analysis3D:{}}, {...legacy,analysis3D:{}}, {...legacy,stress:{}}]) {
  assert.equal(ctx.canCompareDesign(r),false);count++;
}
ctx.R=legacy;ctx.designBaseline={analysis3D:{}};
assert.throws(()=>ctx.renderDesignLab(),/comparison guard passed/);
assert.equal(ctx.designBaseline,legacy);count++;
ctx.R={analysis3D:{}};assert.doesNotThrow(()=>ctx.renderDesignLab());count++;
dirtyView();ctx.resetWingPresentation();visibleModel();
assert.deepEqual(Array.from(ctx.lastPlot),['model',false]);count++;
dirtyView();ctx.R=legacy;
const applied=ctx.applyGeometry({semiSpan:600,rootChord:160,tipChord:100});
assert.equal(applied.ok,true);visibleModel();
assert.equal(ctx.previewState.anatomy,'assembled');assert.equal(ctx.previewState.geometry.semiSpan,600);count++;
dirtyView();const old=ctx.S.geometry;
ctx.checkGeometry=()=>{throw Error('invalid draft');};
assert.equal(ctx.applyGeometry({semiSpan:-1}).ok,false);
assert.equal(ctx.S.geometry,old);assert.equal(ctx.S.plot,'stress');count++;
ctx.checkGeometry=g=>g;
const fixtures=process.argv.slice(2);
if (!fixtures.length) fixtures.push(null);
for (const file of fixtures) {
  const raw=file?JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')):{study:{geometry:{semiSpan:450,rodFractions:[],customInteriorRibs:null},load:{items:[]}}};
  const st=raw.study;
  // Importer output shape; geometry and applied loads come from the regression fixture.
  const canonical={...st,plaKey:'pla-upright',plaOver:{},rodKey:'carbon',rodOver:{},projectName:'Display regression',mirrorFullWing:true};
  dirtyView();ctx.applyStudyState(canonical,{kind:'study'});visibleModel();
  assert.equal(ctx.S.geometry.semiSpan,st.geometry.semiSpan);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.S.geometry)),st.geometry);
  assert.equal(ctx.S.mirrorFullWing,true);assert.equal(ctx.historySuspended,0);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.S.load)),{...ctx.E.DEFAULT_LOAD,...st.load});count++;
}
const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>!m[1].includes('src=')&&!m[1].includes('application/'));
scripts.forEach((m,i)=>new vm.Script(m[2],{filename:`inline-${i}.js`}));
assert.ok(page.includes('const heavy = !model || geoKey !== lastGeoKey;'));count++;
ctx.lastViewSet=true;ctx.frameView(true);
assert.equal(ctx.lastViewSet,false);assert.equal(ctx.fitted,undefined);count++;
ctx.canvas.clientWidth=1200;ctx.canvas.clientHeight=800;ctx.frameView(false);
assert.equal(ctx.lastViewSet,true);assert.equal(ctx.fitted,'iso');assert.equal(ctx.resized,true);count++;
console.log(JSON.stringify({status:'PASS',checks:count,inlineScriptsParsed:scripts.length,fixtures:fixtures.filter(Boolean).map(f=>path.basename(f)),scope:'UI state transitions, stale comparison guard, script syntax; not a rendered-browser JSON import test'},null,2));
