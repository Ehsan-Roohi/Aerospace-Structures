const assert=require('node:assert/strict'),B=require('./wing_nonlinear_beam.js');
const near=(a,b,tol,label)=>assert.ok(Math.abs(a-b)<tol,`${label}: ${a} vs ${b}`);
const L=300,EA=2e6,EI=3e7,GJ=2e7;
const input=n=>({nodes:Array.from({length:n+1},(_,i)=>[L*i/n,0,0]),elements:Array.from({length:n},(_,i)=>({a:i,b:i+1,spanStart:L*i/n,spanEnd:L*(i+1)/n,EA,EI22:EI,EI33:EI,GJ,orientation:[0,1,0]}))});
for(const theta of [.01,.6,1.6]){
 const r=B.solve({...input(10),pointLoads:[{y:L,moment:[0,0,EI*theta/L]}]});
 near(r.tipPosition[0],L*Math.sin(theta)/theta,2e-5,'circular elastica x');near(r.tipPosition[1],L*(1-Math.cos(theta))/theta,2e-5,'circular elastica y');near(r.at(L).rotation[2],theta,1e-7,'finite rotation');near(r.verification.relativeResidual,0,1e-8,'equilibrium');console.log('Circular elastica',theta,r.tipPosition);
}
const P=.001,r=B.solve({...input(10),pointLoads:[{y:L,force:[0,P,0]}]});near(r.tipPosition[1],P*L**3/(3*EI),1e-8,'small-load Euler-Bernoulli limit');
const q=.00001,ru=B.solve({...input(10),distributed:[{y0:0,y1:L,force:[0,q,0]}]});near(ru.tipPosition[1],q*L**4/(8*EI),1e-7,'uniform load linear limit');
const full=B.solve({...input(20),pointLoads:[{y:L,force:[0,EI/L**2,0]}]});console.log('Planar tip-force elastica lambda=1',full.tipPosition,full.at(L).rotation,full.rootMoment);
// Objectivity: rotate all reference coordinates, section orientations and loads.
const axis=B.mul([.3,.8,-.5],1/Math.hypot(.3,.8,-.5)),ang=.74,Q=[Math.cos(ang/2),...B.mul(axis,Math.sin(ang/2))],rot=v=>B.rotate(Q,v),raw=input(20),rr=B.solve({...raw,nodes:raw.nodes.map(rot),elements:raw.elements.map(e=>({...e,orientation:rot(e.orientation)})),pointLoads:[{y:L,force:rot([0,EI/L**2,0])}]});rot(full.tipPosition).forEach((v,i)=>near(rr.tipPosition[i],v,2e-6,'rigidly rotated reference'));console.log('PASS: exact finite-rotation elastica, linear limits, uniform load and objectivity.');

const F=require('../web/wing_frame3d.js');
const pp={EA,EI22:3e7+EA*4,EI33:7e8+EA*64,EI23:1e7+EA*16,first2:EA*8,first3:EA*2,GJ,orientation:[0,1,0]},rawCoupled=input(12),model={...rawCoupled,elements:rawCoupled.elements.map(e=>({...e,...pp}))},force=[1e-5,2e-5,3e-5],moment=[-2e-5,3e-5,4e-5],lin=F.solve({...model,loads:[{node:12,force,moment}]}),geo=B.solve({...model,pointLoads:[{y:L,force,moment}]});
assert.ok(B.norm(B.sub(geo.at(L).displacement,lin.displacements.at(-1)))/B.norm(lin.displacements.at(-1))<1e-4,'full axial/biaxial/reference-axis coupling recovers the existing verified linear limit');
const torsion=B.solve({...input(10),pointLoads:[{y:L,moment:[GJ*1.8/L,0,0]}]});near(torsion.at(L).rotation[0],1.8,1e-8,'finite pure torsion');near(B.norm(B.sub(torsion.deformPoint(L,[L,20,0]),torsion.at(L).position)),20,1e-10,'finite rotation preserves section radius');
assert.throws(()=>B.solve({...input(2),pointLoads:[{y:L+1,force:[0,1,0]}]}),/within/);assert.throws(()=>B.solve({...input(2),elements:input(2).elements.map(e=>({...e,GJ:-1}))}),/positive definite/);assert.throws(()=>B.solve({...input(2),pointLoads:[{y:L,force:[0,1,0]}],maxIterations:0}),/iteration limit/);
console.log('PASS: full section coupling linear limit, 103-degree pure torsion, rigid section radius, invalid loads/stiffness and nonconvergence refusal.');
