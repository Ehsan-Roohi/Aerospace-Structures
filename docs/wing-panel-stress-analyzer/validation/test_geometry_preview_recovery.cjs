// Renderer ownership/recovery regression with real Three.js geometry, no WebGL
// or browser. No aerodynamic/structural equation or admission test is replaced.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..'),web=path.join(repo,'computational/printed-wing-solver/web');
const THREE=require(process.env.THREE_MODULE||process.env.WING_THREE_DIR||process.env.MIE446_THREE_MODULE||path.join(repo,'.review-js/node_modules/three/build/three.cjs'));
const page=fs.readFileSync(path.join(app,'index.html'),'utf8'),shared=createRequire(path.join(web,'engine.js'));
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',hidden:false,value:'',style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;}});return nodes.get(id);};
const camera=new THREE.PerspectiveCamera(32,1.5,1,20000),world=new THREE.Group(),events=[],frameRequests=[];
const ctx=vm.createContext({console,performance,module:{exports:{}},require:shared,THREE,world,model:null,camera,
 S:{geometry:null,load:{kind:'custom',items:[],selfWeight:false},criteria:{maxTipDeflection:45},emptyStudy:false,anatomy:'assembled',plot:'model',stressComponent:'skin',xray:false,deformed:false,clip:false,clipY:450,explode:0},
 COLORS:{pla:0xc9d3dd,rib:0xffcc4d,sleeve:0xe39a4b,rod:0x329bdd,fixture:0x33c587,load:0xd25ad6,seam:0x4ea6ff},
 $:node,document:{querySelectorAll:()=>[]},window:{dispatchEvent:e=>events.push(e.type)},Event:class{constructor(type){this.type=type;}},
 clipPlane:new THREE.Plane(new THREE.Vector3(-1,0,0),150),sectionResultMeta:{bending:{},torque:{},twist:{}},R:null,geometryPreview:true,running:false,lastGeoKey:null,lastViewSet:false,fullWingPrint:true,resetDistance:0,
 canvas:{clientWidth:1200,clientHeight:800},resize:()=>{},renderAircraftAxes:()=>{},renderViewReadout:()=>{},renderPlotInfo:()=>{},renderSparResults:()=>{},
 resultMaterial:()=>{},contourSample:()=>{},finishContour:()=>{},updatePeakMarkers:()=>{},drawLoads:()=>{},renderLegend:()=>{},
 setPlot:(p)=>{ctx.S.plot=p;},showEmptyWing:()=>{},engineInput:()=>({geometry:ctx.S.geometry,load:ctx.S.load,criteria:ctx.S.criteria})});
ctx.controls={target:new THREE.Vector3(),minDistance:1,maxDistance:20000,update(){camera.lookAt(this.target);camera.updateMatrixWorld();return false;}};
ctx.WingGeometry=shared('./wing_geometry.js');
function segment(from,to){const a=page.indexOf(from),b=page.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return page.slice(a,b);}
const ea=page.indexOf('const WingEngine ='),eb=page.indexOf('module.exports = WingEngine;',ea)+'module.exports = WingEngine;'.length;
vm.runInContext(page.slice(ea,eb),ctx);ctx.E=ctx.module.exports;
vm.runInContext(segment('  function swept(','  // Symmetric result extension:'),ctx);
vm.runInContext(segment('  function applyClip()','  function applyResult('),ctx);
vm.runInContext(segment('  function applyAnatomy()','  function positionRibLabels()'),ctx);
vm.runInContext(segment('  function updateSpatialModel()','  function drawShearCentre()'),ctx);
vm.runInContext(segment('  function frameView(','  // Client/CSS-pixel bounds'),ctx);
vm.runInContext(segment('  function previewGeometry(','  // Deliberate study actions'),ctx);
const physicalFrame=ctx.frameView;ctx.frameView=force=>{frameRequests.push(force);physicalFrame(force);};
const doc=JSON.parse(fs.readFileSync(path.join(app,'validation/fixtures/900mm-panel-load-2026-10-30.json'),'utf8'));
ctx.S.geometry=JSON.parse(JSON.stringify(doc.study.geometry));const numericSnapshot=()=>JSON.stringify(ctx.engineInput());const before=numericSnapshot();
ctx.g=ctx.E.makeGeometry(ctx.S.geometry);
const geoDispose=THREE.BufferGeometry.prototype.dispose,matDispose=THREE.Material.prototype.dispose,disposedGeometry=[],disposedMaterial=[];
THREE.BufferGeometry.prototype.dispose=function(){disposedGeometry.push(this);return geoDispose.call(this);};
THREE.Material.prototype.dispose=function(){disposedMaterial.push(this);return matDispose.call(this);};
try{
 // Exact original geometry is constructible independently of its refused load.
 vm.runInContext('buildModel({geometry:g},()=>updateModel())',ctx);
 const first=ctx.model;assert.equal(first.root.parent,world);assert.equal(first.ribs.length,7);assert.equal(first.spars.length,3);
 const geometries=new Set(),materials=new Set();first.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
 assert.ok(first.skins[0].geometry.boundingSphere.radius>400,'the preview has physical span, not zero-initialized vertices');
 // Duplicate resource references mimic the mirror ownership. An inactive field
 // material is also owned by the original mesh and must be disposed once.
 const mesh=first.skins[0],inactive=new THREE.MeshBasicMaterial();mesh.userData.fieldMaterial=inactive;materials.add(inactive);
 first.root.add(new THREE.Mesh(mesh.geometry,mesh.material));
 const originalEngine=ctx.E;
 ctx.E={...originalEngine,ribStations:()=>{throw Error('Injected construction failure after skin and end faces');}};
 assert.throws(()=>vm.runInContext('buildModel({geometry:g})',ctx),/Injected construction failure/);
 assert.equal(ctx.model,first);assert.equal(first.root.parent,world);assert.equal(world.children.length,1);
 assert.ok([...geometries].every(g=>!disposedGeometry.includes(g)),'failed construction must not dispose the visible model');
 assert.ok(disposedGeometry.length>0,'partially constructed candidate resources must be released');
 ctx.E=originalEngine;
 assert.throws(()=>vm.runInContext('buildModel({geometry:g},()=>{throw Error("Injected preview preparation failure")})',ctx),/Injected preview preparation failure/);
 assert.equal(ctx.model,first);assert.equal(first.root.parent,world);assert.equal(world.children.length,1);
 assert.ok([...geometries].every(g=>!disposedGeometry.includes(g)));
 // A successful, physically different replacement commits only the new root.
 ctx.g2=ctx.E.makeGeometry({...ctx.S.geometry,rootChord:280});
 vm.runInContext('buildModel({geometry:g2},()=>updateModel())',ctx);
 assert.notEqual(ctx.model,first);assert.equal(first.root.parent,null);assert.equal(ctx.model.root.parent,world);assert.equal(world.children.length,1);
 for(const g of geometries)assert.equal(disposedGeometry.filter(x=>x===g).length,1,'mirror-shared geometry released once');
 for(const m of materials)assert.equal(disposedMaterial.filter(x=>x===m).length,1,'active and inactive materials released once');
 // Ordinary edits preserve an intentional member/filter/camera view.
 ctx.S.anatomy='ribs';ctx.S.clip=true;ctx.S.clipY=300;ctx.S.explode=12;ctx.S.xray=true;ctx.S.deformed=true;ctx.lastViewSet=true;
 camera.position.set(100000,200000,300000);const far=camera.position.clone();
 vm.runInContext('previewGeometry()',ctx);
 assert.equal(ctx.S.anatomy,'ribs');assert.equal(ctx.S.clip,true);assert.equal(ctx.S.explode,12);assert.equal(ctx.S.xray,true);assert.equal(ctx.S.deformed,true);assert.equal(camera.position.distanceTo(far),0);
 assert.equal(frameRequests.at(-1),false);assert.ok(ctx.model.skins.every(m=>!m.visible));
 // A rods-only view of a wing with zero rods is legitimately empty. Refusal
 // recovery must reveal the physical wing and reset an out-of-view camera.
 ctx.S.anatomy='rods';ctx.S.plot='stress';ctx.S.clipY=-10;ctx.lastViewSet=true;
 vm.runInContext('applyAnatomy();applyClip()',ctx);
 assert.ok(ctx.model.skins.concat(ctx.model.rods,ctx.model.spars,ctx.model.rigid).every(m=>!m.visible));
 vm.runInContext('previewGeometry({recoverView:true})',ctx);
 assert.equal(ctx.S.anatomy,'assembled');assert.equal(ctx.S.plot,'model');assert.equal(ctx.S.clip,false);assert.equal(ctx.S.explode,0);assert.equal(ctx.S.deformed,false);assert.equal(ctx.S.xray,false);
 assert.ok(ctx.model.skins.every(m=>m.visible&&m.material.opacity===1&&m.material.clippingPlanes.length===0));
 assert.ok(camera.position.distanceTo(ctx.controls.target)<10800,'recovery fits the current full-wing extents');
 assert.equal(frameRequests.at(-1),true);assert.ok(events.includes('wing-show-model'));assert.equal(numericSnapshot(),before,'only presentation changed, no geometry/load/criterion changed');
 assert.ok(page.includes('if(analysisRefusal)previewGeometry({recoverView:true})'));
 const report={status:'passed',threeRevision:THREE.REVISION,exactFixtureConstructible:true,previousModelRetainedOnConstructionError:true,previousModelRetainedOnPreparationError:true,successfulReplacementOwnsOnlyVisibleRoot:true,sharedResourcesDisposedOnce:true,ordinaryEditsPreserveView:true,refusalRecoversEmptyRodFilterAndClip:true,refusalRecoversOutOfViewCamera:true,numericInputsUnchanged:true,browserOrWebGLUsed:false};
 console.log(JSON.stringify(report,null,2));
}finally{THREE.BufferGeometry.prototype.dispose=geoDispose;THREE.Material.prototype.dispose=matDispose;}
