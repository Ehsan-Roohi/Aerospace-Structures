// Independent exact prismatic benchmark for physical surface -> normal-plane
// mapping and normal-cut load classification. No recovery/cut formula is reused.
// Euler–Bernoulli normal-section basis: MIT 16.20, Module 7 §§7.1.1–7.1.2.
// https://web.mit.edu/16.20/homepage/7_SimpleBeamTheory/SimpleBeamTheory_files/module_7_with_solutions_hide.pdf
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},near=(a,b,m,rel=2e-9,abs=2e-8)=>{assert.ok(Math.abs(a-b)<=abs+rel*Math.abs(b),`${m}: ${a} != ${b}`);checks++;};
function iz(poly){let v=0;for(let i=0;i<poly.length;i++){const [x,z]=poly[i],[u,w]=poly[(i+1)%poly.length];v+=(x*w-u*z)*(z*z+z*w+w*w)/12;}return Math.abs(v);}
const results=[];
const prismatic=[];
for(const angle of [30,-30])for(const count of [12,24])for(const q of [.01,-.01]){
 const L=600,c=200,xLoad=20,sin=Math.sin(angle*Math.PI/180),cos=Math.cos(angle*Math.PI/180);
 const input={geometry:{naca:'0012',semiSpan:L,rootChord:c,tipChord:c,modules:1,rodFractions:[],spars:[],customInteriorRibs:[],sweepDeg:angle},assembly:{seamsBonded:true},load:{kind:'custom',items:[{kind:'distributed',start:0,end:L,qStart:q,qEnd:q,fraction:xLoad/c}],fos:1,tipMass:0},nElements:count,nSections:3,nGrid:21};
 const R=E.solve(input),a=R.analysis3D,axis0=a.sectionReferenceAt(0),xsc=axis0[0],loops=E.ringLoops(R.geometry,300),I=iz(loops.outer)-iz(loops.inner);
 if(count===12&&q>0)prismatic.push({input,xsc,I,sin,cos});
 // All physical loads, including force before/after the finite normal axis,
 // remain in the total applied wrench and reactions (not cutAt(0)).
 near(a.appliedWrench.force[2],q*L,'total physical force');near(R.appliedForce,q*L,'public total force');
 const expectedGlobalMoment=[q*L*L/2,-q*(Math.tan(angle*Math.PI/180)*L*L/2+(xLoad-xsc)*L),0];
 expectedGlobalMoment.forEach((v,i)=>near(a.appliedWrench.momentAboutRoot[i],v,'all-load global moment '+i));
 for(let k=0;k<6;k++)near(a.reactions.find(r=>r.dof===k).value,-([...a.appliedWrench.force,...expectedGlobalMoment][k]),'all-load root reaction '+k,2e-7,1e-6);
 for(const [x,zSign]of [[20,1],[140,-1],[100,1]]){
  const y=300,z=zSign*E.verticalOrdinates('0012',x/c,c,R.geometry.te).upper;
  const expectedFoot=y+(x-xsc)*sin*cos,threshold=y+(x-xLoad)*sin*cos,F=q*(L-threshold),M=q*(L-threshold)**2/(2*cos),T=-cos*(xLoad-xsc)*F;
  const info=E.normalStressLocationAt3D(R,y,[x,z]);ok(info.resolved,'interior normal cut is resolved');ok(info.nominal,'stress explicitly remains nominal beam stress');ok(info.endZone===null);
  near(info.station,expectedFoot,'physical surface normal-foot station',1e-10,1e-7);
  const expectedStress=-M*z/(cos*I);near(info.value,expectedStress,'independent shell physical-point normal stress',3e-9,1e-9);near(E.normalStressAt3D(R,y,[x,z]),expectedStress,'numeric helper same physical location',3e-9,1e-9);
  const cut=a.cutAt(expectedFoot);near(cut.localForce[2],-F,'normal plane classifies outboard load force');near(cut.localMoment[1],M,'independent exact normal-plane bending moment');near(cut.localMoment[0],T,'independent exact normal-plane torque');near(cut.localForce[0],0,'no axial load');near(cut.localMoment[2],0,'no second bending component');
  const motion=E.spatialPointMotion(R,y,[x,z]);ok(motion.resolved);near(motion.station,expectedFoot,'motion uses same physical-point foot',1e-10,1e-7);
  // This follows from the normal-plane definition, not from locator internals.
  const physical=[y*Math.tan(angle*Math.PI/180)+x,y,z],ref=a.locatePhysicalPoint(physical).reference;
  near((physical[0]-ref[0])*sin+(physical[1]-ref[1])*cos,0,'independent foot perpendicularity',0,1e-7);
  results.push({angle,count,q,x,stress:info.value,expectedStress,foot:info.station});
 }
 // An aircraft-y endpoint is oblique. Never fabricate data by clamping a
 // physical point outside the finite axis or treating a truncated cut as full.
 const rootX=angle>0?0:c,tipX=angle>0?c:0;
 for(const[y,x,end]of [[0,rootX,'root'],[L,tipX,'tip']]){
  const info=E.normalStressLocationAt3D(R,y,[x,0]),motion=E.spatialPointMotion(R,y,[x,0]);ok(!info.resolved&&Number.isNaN(info.value));ok(info.endZone===end);ok(!motion.resolved&&motion.displacement===null,'outside motion cannot be silently clamped');ok(/outside/.test(info.reason));
 }
 for(const[y,end]of [[1,'root'],[L-1,'tip']]){const info=E.normalStressLocationAt3D(R,y,[xsc,0]);ok(!info.resolved&&Number.isNaN(info.value));ok(info.endZone===end);ok(/oblique end/.test(info.reason));}
 const shifts=[(0-xsc)*sin*cos,(c-xsc)*sin*cos],lower=Math.max(...shifts),upper=L+Math.min(...shifts);
 ok(a.cutAt(lower-1).endZone==='root','geometric root truncation excluded');ok(a.cutAt(lower+1).endZone===null,'complete root-adjacent normal cut is distinguished');ok(a.cutAt(upper+1).endZone==='tip');ok(a.cutAt(upper-1).endZone===null);
 ok(a.limitations.some(s=>/minimum exclusion/.test(s)),'geometric mask is not a certified Saint-Venant decay bound');
 ok(a.loadMapping.endWrenches.length>0,'outside load portion retained with explicit equivalent-end-wrench provenance');
}
for(const r of results){const reverse=results.find(p=>p.angle===r.angle&&p.count===r.count&&p.x===r.x&&p.q===-r.q);near(r.stress,-reverse.stress,'signed-force reversal',2e-9,1e-9);const mesh=results.find(p=>p.angle===r.angle&&p.count!==r.count&&p.x===r.x&&p.q===r.q);near(r.stress,mesh.stress,'normal-cut recovery mesh independence',2e-9,1e-9);}
// A tip load through the shear centre has zero torsion. Its vertical physical
// point motion has the classical cubic cantilever solution at the point's
// NORMAL coordinate, not at its original aircraft-y station. This independently
// checks the load-assembly/kinematic mapping, not just stress postprocessing.
for(const{input,xsc,I,sin,cos}of prismatic){
 const P=1.25,R=E.solve({...input,load:{kind:'custom',items:[{kind:'point',position:600,force:P,fraction:xsc/200}],fos:1,tipMass:0}}),EI=R.pla.E*I*cos,length=600/cos;
 for(const y of [150,300,450])for(const x of [20,140]){
  const z=E.verticalOrdinates('0012',x/200,200,R.geometry.te).upper,station=y+(x-xsc)*sin*cos,s=station/cos,expected=P*s*s*(3*length-s)/(6*EI),rotation=P*s*(2*length-s)/(2*EI),motion=E.spatialPointMotion(R,y,[x,z]);
  ok(motion.resolved&&!motion.endZone);near(motion.displacement[2],expected,'classical physical-surface vertical deflection at normal foot',2e-7,1e-8);near(motion.rotation[0],rotation*cos,'classical global-x elastic rotation',2e-7,1e-9);near(motion.rotation[1],-rotation*sin,'classical global-y elastic rotation',2e-7,1e-9);near(motion.rotation[2],0,'no in-plane elastic bending',0,1e-9);
 }
}
console.log(`Physical normal recovery PASS: ${checks} independent ±30° normal-cut stress/resultants, classical physical-surface motion, 12/24 mesh, signed loads, global wrench and finite-oblique-end exclusion checks.`);
