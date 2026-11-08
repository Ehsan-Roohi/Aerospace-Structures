const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),app=path.join(root,'docs/wing-panel-stress-analyzer');
const {WingEngine:E,WingAeroPanel:A,WingFlexibleSolver:S,WingNonlinearBeam:B}=Function('module','require',fs.readFileSync(path.join(app,'nonlinear/flexible_bundle.js'),'utf8')+';return {WingEngine,WingAeroPanel,WingFlexibleSolver,WingNonlinearBeam};')({exports:{}},require);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} vs ${b}`),rad=x=>x*Math.PI/180;
const rotate=(v,axis,a)=>{const c=Math.cos(a),s=Math.sin(a),d=v.reduce((z,x,i)=>z+x*axis[i],0),k=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]];return v.map((x,i)=>c*x+s*k[i]+(1-c)*d*axis[i]);};
for(const angle of [-16,-11.63,-8,0,8,11,16]){
 const chord=rotate([1,0,0],[0,1,0],rad(angle)),thick=rotate([0,0,1],[0,1,0],rad(angle));near(S.sectionFlowAngle(chord,thick,[1,0,0]),angle);
 // Full 3D objectivity: rotate flow and section together about an oblique axis.
 const axis=[1/3,2/3,2/3],rot=v=>rotate(v,axis,.73);near(S.sectionFlowAngle(rot(chord),rot(thick),rot([1,0,0])),angle);
 // Sweep/spanwise flow must not contaminate section-plane incidence.
 near(S.sectionFlowAngle(chord,thick,[Math.cos(rad(4)),.7,Math.sin(rad(4))]),angle+4);
}
assert.throws(()=>S.sectionFlowAngle([1,0,0],[0,0,1],[0,1,0]),/unresolved/);
const IO=require(path.join(app,'wing-aero/wing_study_io.js')),imported=IO.importPrintedStudy(fs.readFileSync(path.join(app,'validation/cases/900mm-foam-spars.json'),'utf8'),E,{aeroGeometryKey:raw=>IO.sha256(A.geometryKey(E.makeGeometry(raw)))});assert.equal(imported.ok,true);const g=E.makeGeometry(IO.printedEngineInput(imported.state,E).geometry);
for(const [angle,warning,refused]of [[0,false,false],[-1.426,false,false],[-11.63,true,false],[-16,true,true]]){
 const shape={deformPoint:(y,p)=>rotate(p,[0,1,0],rad(angle))},r=S.assessFlowScope(g,shape,{alphaDeg:0},[123.456]);near(r.maxAbsAngleDeg,Math.abs(angle));assert.equal(r.withinAnglePolicy,!warning);assert.equal(r.refused,refused);assert.ok(r.samples.some(s=>s.y===123.456));
}
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||path.join(root,'output/ui-test-deps/node_modules/jsdom')),dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.eval(fs.readFileSync(path.join(app,'ui/wing-aero-ui.js'),'utf8')+';window.TestAero=WingAeroUI;');
const adm={rows:[{kind:'aeroelastic',admitted:false,value:.139,tolerance:.02}],failed:['coupling']};const foam=w.TestAero.admissionFailure(adm,{construction:'solid-foam'}).message,hollow=w.TestAero.admissionFailure(adm,{construction:'hollow'}).message;
assert.match(foam,/Solid-foam wing/);assert.match(foam,/coupled nonlinear model/);assert.doesNotMatch(foam,/valid cavity|closed skin carries/);assert.match(hollow,/Hollow wing/);assert.match(hollow,/valid cavity/);dom.window.close();
console.log('PASS: deformed section angles, signs, 3D objectivity, spanwise-flow projection, angle policy, native case and construction-aware guidance.');
