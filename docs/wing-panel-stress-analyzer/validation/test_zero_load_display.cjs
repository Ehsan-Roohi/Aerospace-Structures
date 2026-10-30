// UI regression, not a flow benchmark. The separate unapplied-load test solves
// the exact case; this test exercises actual renderer/controller functions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..');
const THREE=require(process.env.THREE_MODULE||process.env.WING_THREE_DIR||process.env.MIE446_THREE_MODULE||path.join(repo,'.review-js/node_modules/three/build/three.cjs'));
const page=fs.readFileSync(path.join(app,'index.html'),'utf8'),shell=fs.readFileSync(path.join(app,'ui/wx-shell.js'),'utf8');
function segment(from,to){const a=page.indexOf(from),b=page.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return page.slice(a,b);}
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/450mm-unapplied-aero-2026-10-30.json'),'utf8'));
const unloaded={load:fixture.study.load,geometry:fixture.study.geometry,props:{xsc:[0]},sections:[],assembly:{},mass:{total:264}};
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,innerHTML:'',textContent:'',value:'',style:{}});return nodes.get(id);};
const requests=[],ctx=vm.createContext({console,THREE,S:{plot:'stress',stressComponent:'skin',explode:0,scale:1,geometry:fixture.study.geometry},R:unloaded,geometryPreview:false,stale:false,
 resultDisplay:{scaleMode:'auto',scales:{},bands:false},range:{min:0,max:1},sectionResultMeta:{},stressExtrema:{},$:node,document:{activeElement:null},
 signedLogColours:()=>false,colourTransform:v=>v,sig:v=>String(v),canvas:{clientWidth:1200,clientHeight:700},
 COLORS:{pla:0xc9d3dd,sleeve:0xe39a4b,rod:0x329bdd},E:{interp:()=>0},at:()=>0,zscAt:()=>0,sectionMotion:()=>[0,0],deformAmount:()=>({scale:0}),
 resultMaterial:(m,enabled)=>requests.push({fieldMaterial:enabled}),meshFieldValues:m=>{requests.push({fieldValues:true});return m.testValues;},contourSample:()=>{},finishContour:()=>{},
 updatePeakMarkers:kind=>requests.push({peaks:kind}),drawLoads:()=>{},renderLegend:kind=>requests.push({legend:kind}),
 WingGeometry:{transformPoint:(g,y,p)=>[p[0],y,p[1]],stationAt:()=>({incidenceDeg:0,twistReferenceFraction:.25})}});
vm.runInContext(segment('  function noStructuralLoad(','  const resultScaleKey'),ctx);
vm.runInContext(segment('  function computeRange(','  function deformAmount('),ctx);
vm.runInContext(segment('  function colourFraction(','  function colourValue('),ctx);
vm.runInContext(segment('  function updateSpatialModel(','  let showShearCentre='),ctx);
assert.equal(ctx.noStructuralLoad(unloaded),true);
for(const partial of [{load:{...fixture.study.load,items:[{type:'point',force:1},{type:'point',force:-1}]}},{load:{...fixture.study.load,selfWeight:true}},{analysis3D:{aeroLoad:{}}},{aeroAdmission:{admitted:true}}]){
 assert.equal(ctx.noStructuralLoad({...unloaded,...partial}),false,'real load presence is independent of net force');
}
const mesh={userData:{kind:'skin',by:[0,1],bx:[10,10],bz:[1,1],module:0},testValues:[0,0],geometry:{attributes:{position:{array:new Float32Array(6)},color:{array:new Float32Array(6)}},computeVertexNormals(){},computeBoundingSphere(){}}};
ctx.model={g:fixture.study.geometry,skins:[mesh],sleeves:[],rods:[],spars:[],rigid:[],fix:{rotation:{},position:{}}};
for(const spatial of [false,true]){
 ctx.R=spatial?{...unloaded,analysis3D:{}}:unloaded;requests.length=0;
 vm.runInContext('updateModel()',ctx);
 assert.ok(requests.some(r=>r.fieldMaterial===false));assert.ok(!requests.some(r=>r.fieldValues),'unloaded model must not create a coloured stress field');
 assert.ok(requests.some(r=>r.legend===null)&&requests.some(r=>r.peaks===null));
 const neutral=new THREE.Color(0xc9d3dd);assert.ok(Math.abs(mesh.geometry.attributes.color.array[0]-neutral.r)<1e-6);
}
ctx.R=unloaded;
let range=vm.runInContext("computeRange('sigma')",ctx);assert.equal(range.min,0);assert.equal(range.max,0,'never invent a 1 MPa maximum for a zero field');
ctx.range=range;assert.equal(ctx.colourFraction(0),.5);assert.ok(Number.isFinite(ctx.colourFraction(0)));
mesh.testValues=[null,NaN];range=vm.runInContext("computeRange('sigma')",ctx);assert.equal(range.unresolved,true);assert.equal(ctx.stressExtrema.max,null,'unresolved is distinct from zero');
mesh.testValues=[1e-15,2e-15];range=vm.runInContext("computeRange('sigma')",ctx);assert.equal(range.min,1e-15);assert.equal(range.max,2e-15,'small physical values retain their actual range');
// The real legend produces one value for a constant field, never a fabricated
// unit interval, and no colour bar for an unloaded view.
ctx.rainbow=t=>new THREE.Color().setHSL((1-t)*2/3,1,.5);ctx.colourValue=t=>ctx.range.min+t*(ctx.range.max-ctx.range.min);
vm.runInContext(segment('  function renderLegend(','  function renderPlotInfo('),ctx);
ctx.range={min:0,max:0};ctx.renderLegend('sigma');assert.match(node('#legend').innerHTML,/Uniform value: 0/);assert.doesNotMatch(node('#legend').innerHTML,/bar-c/);
ctx.renderLegend(null);assert.equal(node('#legend').hidden,true);assert.equal(node('#legendTitle').textContent,'');
assert.ok(page.includes("S.plot!=='stress'||noStructuralLoad(R))return []"),'no stale extrema or probes on the unloaded shape');
assert.ok(page.includes("chip.textContent='No structural load'"));
assert.ok(page.includes("window.dispatchEvent(new Event('wing-open-aerodynamics'))"));
assert.ok(shell.includes("window.addEventListener('wing-open-aerodynamics', () => openMenu('aero'))"));
assert.ok(shell.includes("label:'Solved · not applied'"));
assert.ok(page.includes("if(!noStructuralLoad(R)&&['stress','disp','fos','twist','bending','torque'].includes(S.plot))"),'PNG cannot export a fake zero-to-one scale');
// Opening another saved study must remove the previous field's UI verdict,
// while preserving the new study's actual applied pressure-load record.
let resetCalls=0,historyCalls=0;
const imported={geometry:fixture.study.geometry,load:fixture.study.load,aeroLoad:{label:'new saved panel load'},aerodynamics:fixture.study.aerodynamics};
const importContext=vm.createContext({S:{},E:{DEFAULT_LOAD:{}},wingAero:{running:false,reset(){resetCalls++;}},stlReference:{clear(){}},historySuspended:0,
 resetWingPresentation(){},syncMirrorState(){},edited(){},renderImportGate(){},renderInputs(){},renderTree(){},renderPM(){},setStatus(){},recordWingHistory(){historyCalls++;},$:node});
vm.runInContext(segment('  function applyStudyState(','  const studyFiles ='),importContext);
importContext.applyStudyState(imported,{kind:'study'});
assert.equal(resetCalls,1,'clear old aerodynamic results and admission status on import');
assert.equal(importContext.S.aeroLoad.label,'new saved panel load','reset the display, not the newly imported load');
assert.equal(historyCalls,1);assert.equal(importContext.historySuspended,0);
importContext.wingAero.running=true;
assert.throws(()=>importContext.applyStudyState(imported,{kind:'study'}),/Wait for the aerodynamic solve/);
assert.equal(resetCalls,1,'do not change a study while a previous worker is running');
console.log(JSON.stringify({passed:true,threeRevision:THREE.REVISION,unloadedClassicalAndSpatialViewsNeutral:true,noFabricatedUnitRange:true,zeroDistinctFromUnresolved:true,balancedRealLoadsNotMisclassified:true,realLegendAndRendererFunctionsExercised:true},null,2));
