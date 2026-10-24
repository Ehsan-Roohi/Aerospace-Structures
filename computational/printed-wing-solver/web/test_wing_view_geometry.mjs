// Source render functions + actual THREE vertex/camera mathematics; no WebGL or solver substitutions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const require=createRequire(import.meta.url),modulePath=process.env.MIE446_THREE_MODULE||'three',loaded=require(modulePath);
const THREE={...(loaded.Matrix4?loaded:require(path.join(path.dirname(require.resolve(modulePath)),'three.cjs')))},E=require('./engine.js'),WingGeometry=require('./wing_geometry.js');
class OrbitControls {
  constructor(camera){this.camera=camera;this.target=new THREE.Vector3();this.enabled=true;this.disposed=false;}
  update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
  dispose(){this.disposed=true;}
}
THREE.OrbitControls=OrbitControls;
const source=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8');
const elements=new Map(),$=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',hidden:false,style:{},dataset:{}});return elements.get(selector);};
const buttons=['iso','plan','bottom','section','front'].map(view=>({dataset:{view},setAttribute(k,v){this[k]=v;}}));
const canvas={clientHeight:600,getBoundingClientRect:()=>({left:73,top:41,width:900,height:600})},camera=new THREE.PerspectiveCamera(32,1.5,1,20000),world=new THREE.Group();
const ctx={THREE,E,WingGeometry,$,document:{querySelectorAll:()=>buttons},canvas,camera,world,
  S:{explode:0,plot:'model'},R:{},geometryPreview:true,nf:(v,n)=>v.toFixed(n),esc:String,airfoilLabel:()=> 'NACA 0012',
  applyClip(){},applyXray(){},applyAnatomy(){},drawLoads(){},renderLegend(){},resultMaterial(){},contourSample(){},updatePeakMarkers(){}};
vm.createContext(ctx);
vm.runInContext('let model=null,lastViewSet=false;let controls=new THREE.OrbitControls(camera,canvas);'+
 source.slice(source.indexOf('  const COLORS ='),source.indexOf('  // ------------------------------------------------------------ results on the model'))+
 source.slice(source.indexOf('  function updateSpatialModel(){'),source.indexOf('  function updateModel()'))+
 '\nthis.api={buildModel,updateSpatialModel,setView,fitPoints,clearRenderedWing,renderAircraftAxes,renderedWingScreenBounds,get model(){return model;},get controls(){return controls;}};',ctx);
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
const near=(actual,expected,tol,message)=>ok(Math.abs(actual-expected)<=tol,`${message}: ${actual} vs ${expected}`);
const base={naca:'0012',semiSpan:450,rootChord:120,tipChord:100,modules:1,rodFractions:[],ribs:0,spars:[]};
for(const advanced of [false,true]){
  const g=E.makeGeometry({...base,...(advanced?{sweepDeg:20,dihedralDeg:10,sweepReferenceFraction:.25,twistEnabled:true,stations:[{eta:0,incidenceDeg:4,airfoil:{kind:'naca4',code:'0012'}},{eta:.5,incidenceDeg:1,airfoil:{kind:'naca4',code:'0012'}},{eta:1,incidenceDeg:-3,airfoil:{kind:'naca4',code:'0012'}}]}:{})});
  ctx.api.buildModel({geometry:g});ctx.api.updateSpatialModel();
  const model=ctx.api.model,skin=model.skins[0],u=skin.userData,pos=skin.geometry.attributes.position.array;
  const root=Array.from(u.bx.slice(0,u.nP)),tip=Array.from(u.bx.slice((u.nS-1)*u.nP));
  near(Math.max(...root)-Math.min(...root),120,2e-4,'rendered local root chord');
  near(Math.max(...tip)-Math.min(...tip),100,2e-4,'rendered local tip chord');
  near((Math.max(...tip)-Math.min(...tip))/(Math.max(...root)-Math.min(...root)),5/6,2e-6,'mild taper is not flattened to a rectangle');
  // Independently evaluate the documented transform, not the helper under test.
  const rad=Math.PI/180;
  for(let i=0;i<u.by.length;i+=37){
    const y=u.by[i],chord=120-20*y/450,x=u.bx[i],z=u.bz[i],inc=advanced?(y<=225?4-3*y/225:1-4*(y-225)/225)*rad:0,pivot=.25*chord;
    const xle=advanced?.25*120+y*Math.tan(20*rad)-.25*chord:0;
    const expected=[y,(advanced?y*Math.tan(10*rad):0)-(x-pivot)*Math.sin(inc)+z*Math.cos(inc),xle+pivot+(x-pivot)*Math.cos(inc)+z*Math.sin(inc)];
    expected.forEach((p,k)=>near(pos[3*i+k],p,8e-5,`physical geometry coordinate ${advanced}/${i}/${k}`));
  }
  const before=pos.slice();
  for(const view of ['iso','plan','bottom','front','section','plan','iso']){
    const old=ctx.api.controls;ctx.api.setView(view);
    const direction=camera.position.clone().sub(ctx.api.controls.target).normalize();
    near(direction.dot(camera.up),0,view==='iso'?.5:1e-12,'upright standard-view axes are not singular');
    if(view==='plan'){near(direction.y,1,1e-12,'Top looks from aircraft +z');near(camera.up.z,-1,1e-12,'Top leading edge is up');}
    if(view==='bottom')near(direction.y,-1,1e-12,'Bottom looks from aircraft minus z');
    if(view==='front')near(direction.z,-1,1e-12,'Front looks from aircraft −x');
    if(view==='section')near(direction.x,-1,1e-12,'Side looks from aircraft −y/root');
    if(old!==ctx.api.controls)ok(old.disposed,'up-axis switch disposes old OrbitControls');
    for(const p of ctx.api.fitPoints()){
      const q=p.clone().project(camera);ok(Number.isFinite(q.x)&&Number.isFinite(q.y)&&Math.abs(q.x)<=.861&&Math.abs(q.y)<=.861,'entire actual geometry fits the perspective viewport');
    }
    ok(buttons.find(b=>b.dataset.view===view)['aria-pressed']==='true','active view is exposed accessibly');
    const axes=$('#wingModelAxes');ok(!axes.hidden&&['+x','+y','+z'].every(label=>axes.innerHTML.includes(label)),'on-wing axes are visible in every standard view');
    ok(!/NaN|Infinity/.test(axes.innerHTML),'projected model axes have finite coordinates');
    for(const label of axes.innerHTML.matchAll(/<text x="([^"]+)" y="([^"]+)"/g))ok(Number(label[1])>=0&&Number(label[1])<=900&&Number(label[2])>=0&&Number(label[2])<=600,'all on-wing axis labels fit the canvas after Fit');
    const anchor=WingGeometry.transformPoint(g,0,[g.rootChord*.25,0]),q0=new THREE.Vector3(anchor[1],anchor[2],anchor[0]).project(camera);
    const circle=axes.innerHTML.match(/<circle cx="([^"]+)" cy="([^"]+)"/);ok(!!circle,'on-wing axes have a common root origin');
    near(Number(circle[1]),(q0.x+1)*450,1e-8,'axis origin follows the physical root quarter-chord in screen x');near(Number(circle[2]),(1-q0.y)*300,1e-8,'axis origin follows the physical root quarter-chord in screen y');
    const bounds=ctx.api.renderedWingScreenBounds();
    ok(bounds&&bounds.width>0&&bounds.height>0&&Object.values(bounds).every(Number.isFinite),'whole-wing screen bounds are positive client CSS pixels');
    model.fix.position.addScalar(100000);model.loads.position.addScalar(100000);
    assert.deepEqual(ctx.api.renderedWingScreenBounds(),bounds);checks++;
    model.fix.position.addScalar(-100000);model.loads.position.addScalar(-100000);
    for(let i=0;i<u.by.length;i+=111){const q=new THREE.Vector3().fromArray(pos,3*i).project(camera),sx=73+(q.x+1)*450,sy=41+(1-q.y)*300;ok(sx>=bounds.left-1e-6&&sx<=bounds.right+1e-6&&sy>=bounds.top-1e-6&&sy<=bounds.bottom+1e-6,'whole-wing bounds contain rendered skin vertices');}
  }
  assert.deepEqual(pos,before);checks++;
  ok($('#aircraftAxes svg').innerHTML.includes('+x')&&$('#aircraftAxes svg').innerHTML.includes('+y')&&$('#aircraftAxes svg').innerHTML.includes('+z'),'permanent triad has all aircraft axis labels');
  let disposed=false;skin.geometry.addEventListener('dispose',()=>{disposed=true;});
  ctx.api.clearRenderedWing();ok(disposed&&ctx.api.model===null&&world.children.length===0,'Clear disposes and removes previous wing geometry');
  ok(ctx.api.renderedWingScreenBounds()===null,'empty canvas has no selection bounds');
  ok($('#probe').hidden&&$('#anatomyKey').hidden&&!$('#aircraftAxes').hidden,'Clear hides model overlays while retaining triad');
  ok($('#wingModelAxes').hidden&&!$('#wingModelAxes').innerHTML,'Clear removes the on-wing axes with the wing');
}
ok(/class="viewport-views"[\s\S]*?data-view="plan"[\s\S]*?data-view="front"[\s\S]*?data-view="section"/.test(source),'Top/Front/Side are directly available on the viewport');
console.log(`Wing view geometry: ${checks} physical taper/transform, camera-up, fit, axes and clear checks passed (actual THREE; not pixel QA).`);
