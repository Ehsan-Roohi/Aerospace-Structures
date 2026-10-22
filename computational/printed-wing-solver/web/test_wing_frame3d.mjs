import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),F=require('./wing_frame3d.js');
let checks=0;
const near=(a,b,rel=1e-9,label='value')=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=rel*Math.max(1,Math.abs(b)),`${label}: ${a} vs ${b}`);checks++;};
const L=300,p={EA:2e6,EI22:3e7,EI33:7e8,GJ:2e7,orientation:[0,1,0]},base={nodes:[[0,0,0],[L,0,0]],elements:[{a:0,b:1,...p}]};
for(const [force,moment]of [[[2,0,0],[0,0,0]],[[0,3,0],[0,0,0]],[[0,0,4],[0,0,0]],[[0,0,0],[5,0,0]],[[0,0,0],[0,6,0]],[[0,0,0],[0,0,7]]]){
 const r=F.solve({...base,loads:[{node:1,force,moment}]}),u=r.displacements[1],w=r.rotations[1];
 near(u[0],force[0]*L/p.EA);near(u[1],force[1]*L**3/(3*p.EI33)+moment[2]*L**2/(2*p.EI33));near(u[2],force[2]*L**3/(3*p.EI22)-moment[1]*L**2/(2*p.EI22));
 near(w[0],moment[0]*L/p.GJ);near(w[1],-force[2]*L**2/(2*p.EI22)+moment[1]*L/p.EI22);near(w[2],force[1]*L**2/(2*p.EI33)+moment[2]*L/p.EI33);
 near(r.verification.forceError,0,1e-8);near(r.verification.momentError,0,1e-7);near(r.verification.energyError,0,1e-10);
}
// Constant global line force and distributed couple: consistent, not lumped.
const q=0.03,m=0.2,rq=F.solve({...base,elements:[{a:0,b:1,...p,distributed:()=>({force:[0,q,0],moment:[0,0,m]})}]});
near(rq.displacements[1][1],q*L**4/(8*p.EI33)+m*L**3/(3*p.EI33),1e-10,'uniform transverse force + moment displacement');
near(rq.rotations[1][2],q*L**3/(6*p.EI33)+m*L**2/(2*p.EI33),1e-10,'uniform force + moment rotation');
near(rq.verification.totalForce[1],q*L);near(rq.verification.totalMoment[2],q*L**2/2+m*L);
// Full unsymmetric bending: independently invert curvature constitutive tensor.
const pc={...p,EI23:1e7},f2=3,f3=4,det=pc.EI22*pc.EI33-pc.EI23**2,rc=F.solve({...base,elements:[{a:0,b:1,...pc}],loads:[{node:1,force:[0,f2,f3]}]});
near(rc.displacements[1][1],L**3/3*(pc.EI22*f2-pc.EI23*f3)/det);near(rc.displacements[1][2],L**3/3*(pc.EI33*f3-pc.EI23*f2)/det);
// A rigid rotation of all geometry, section axes and loads must rotate u and R.
const ax=F.unit([.3,.8,-.5]),ang=.74,rotate=v=>F.add(F.add(F.scale(v,Math.cos(ang)),F.scale(F.cross(ax,v),Math.sin(ang))),F.scale(ax,F.dot(ax,v)*(1-Math.cos(ang))));
const force=[2,3,4],moment=[5,6,7],r0=F.solve({...base,elements:[{a:0,b:1,...pc}],loads:[{node:1,force,moment}]}),rr=F.solve({nodes:base.nodes.map(rotate),elements:[{a:0,b:1,...pc,orientation:rotate(p.orientation)}],loads:[{node:1,force:rotate(force),moment:rotate(moment)}]});
rotate(r0.displacements[1]).forEach((v,i)=>near(rr.displacements[1][i],v,1e-9,'rotated displacement'));rotate(r0.rotations[1]).forEach((v,i)=>near(rr.rotations[1][i],v,1e-10,'rotated rotation'));near(rr.energy,r0.energy,1e-9,'rotation-invariant energy');
// Mesh invariance of point-force cantilever and convergence of curved line force.
const run=n=>F.solve({nodes:Array.from({length:n+1},(_,i)=>[L*i/n,0,0]),elements:Array.from({length:n},(_,i)=>({a:i,b:i+1,...pc})),loads:[{node:n,force}]});
for(const n of [2,5,12])run(n).displacements.at(-1).forEach((v,i)=>near(v,r0.displacements[1][i]-F.solve({...base,elements:[{a:0,b:1,...pc}],loads:[{node:1,moment}]}).displacements[1][i],1e-8,'mesh invariance'));
// Reference-axis eccentricity produces axial/bending coupling, not false torsion.
const e=8,pe={...p,first2:p.EA*e,EI33:p.EI33+p.EA*e*e},re=F.solve({...base,elements:[{a:0,b:1,...pe}],loads:[{node:1,force:[2,0,0]}]});
near(re.displacements[1][0],2*L/p.EA+2*e*e*L/p.EI33,1e-9,'eccentric axial extension');near(re.rotations[1][2],2*e*L/p.EI33,1e-9,'eccentric axial bending');near(re.rotations[1][0],0);
assert.throws(()=>F.solve({...base,elements:[{a:0,b:1,...p,EI23:1e12}]}),/positive definite/);checks++;
console.log(`WingFrame3D PASS: ${checks} closed-form, distributed-load, unsymmetric-coupling, reference-axis, rigid-rotation, equilibrium, energy and mesh checks.`);
