const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(app,'index.html'),'utf8');
const fn=page.slice(page.indexOf('  function setAnatomy(kind)'),page.indexOf('  function applyAnatomy()',page.indexOf('  function setAnatomy(kind)')));
const calls=[];
const ctx=vm.createContext({S:{plot:'model',deformed:false,explode:0,anatomy:'inside',clip:false},model:{},$:()=>({setAttribute(){},value:0}),setPlot:(p,refresh)=>{assert.equal(refresh,false);ctx.S.plot=p;},applyXray:()=>{},applyClip:()=>{},applyResult:defer=>{assert.equal(defer,true);calls.push('remap');},renderPlotInfo:()=>calls.push('info'),setView:()=>{}});
vm.runInContext(fn,ctx);
for(const view of ['assembled','inside','assembled','ribs','spars']){ctx.view=view;vm.runInContext('setAnatomy(view)',ctx);}
assert.equal(calls.filter(c=>c==='remap').length,0,'Visibility-only switches must not remesh or recolour');
ctx.S.plot='stress';vm.runInContext("setAnatomy('inside')",ctx);assert.equal(calls.filter(c=>c==='remap').length,1,'Stress to model needs exactly one deferred remap');
ctx.S.deformed=true;vm.runInContext("setAnatomy('assembled')",ctx);assert.equal(calls.filter(c=>c==='remap').length,2,'Removing deformation needs one remap');
const start=page.indexOf('  function loop(t) {'),end=page.indexOf('  // ------------------------------------------------------------ charts',start);
let renders=0;
const loop=vm.createContext({$:s=>s==='#app'?{hidden:false}:{classList:{contains:()=>loop.aero}},document:{hidden:false,querySelector:()=>loop.busy},running:false,lastT:0,requestAnimationFrame(){},resize(){},controls:{update(){}},renderAircraftAxes(){},renderViewReadout(){},positionRibLabels(){},positionResultLabels(){},syncFullWingPreview(){},renderer:{render(){++renders;}},scene:{},camera:{},S:{plot:'model'},R:{},model:{},geometryPreview:false});
vm.runInContext(page.slice(start,end),loop);
for(const mode of ['aero','busy','hidden','running']){loop.aero=mode==='aero';loop.busy=mode==='busy';loop.document.hidden=mode==='hidden';loop.running=mode==='running';vm.runInContext('loop(100)',loop);assert.equal(renders,0,'Covered/hidden/solving scene must not render');}
loop.aero=loop.busy=loop.running=loop.document.hidden=false;vm.runInContext('loop(200)',loop);assert.equal(renders,1,'Structural render must resume after closing the aerodynamic view');
console.log(JSON.stringify({visibility_only_remaps:0,stress_to_model_remaps:1,deformed_to_undeformed_remaps:1,covered_scene_rendering_paused:true,rendering_resumes:true}));
