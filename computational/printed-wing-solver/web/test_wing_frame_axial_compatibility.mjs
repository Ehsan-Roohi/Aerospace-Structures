import assert from'node:assert/strict';import{createRequire}from'node:module';const require=createRequire(import.meta.url),F=require('./wing_frame3d.js');
let n=0;const near=(a,b,label,t=1e-9)=>{assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${label}: ${a} vs ${b}`);n++;};
const L=300,EA=2e6,EI22=3e7,EI33=7e8,GJ=2e7,e=14,P=3;
for(const count of [1,2,4]){
 const nodes=Array.from({length:count+1},(_,i)=>[L*i/count,-e,0]),elements=Array.from({length:count},(_,i)=>({a:i,b:i+1,EA,EI22,EI33:EI33+EA*e*e,first2:EA*e,GJ,orientation:[0,1,0]})),r=F.solve({nodes,elements,loads:[{node:count,force:[0,P,0]}]});
 near(r.displacements.at(-1)[1],P*L**3/(3*EI33),'offset reference cannot change physical bending displacement');
 for(const el of r.elements)for(const t of [0,.2,.5,.8,1]){const s=F.sampleElement(el,t),x=nodes[el.a][0]+t*el.L;near(s.resultant[0],0,'no spurious axial force',1e-7);near(s.displacement[0]-e*s.rotation[2],0,'physical centroid has zero axial motion');near(s.displacement[1],P*x*x*(3*L-x)/(6*EI33),'closed-form centroid displacement');}
}
// Independent 4x4 Gaussian elimination and analytic statics integrals, not the
// element's assembly/condensation or its own SPD solver.
function invSolve(A,b){const a=A.map((r,i)=>[...r,b[i]]);for(let k=0;k<4;k++){let p=k;for(let j=k+1;j<4;j++)if(Math.abs(a[j][k])>Math.abs(a[p][k]))p=j;[a[k],a[p]]=[a[p],a[k]];const q=a[k][k];for(let j=k;j<5;j++)a[k][j]/=q;for(let i=0;i<4;i++)if(i!==k){const m=a[i][k];for(let j=k;j<5;j++)a[i][j]-=m*a[k][j];}}return a.map(r=>r[4]);}
const z=-5,EI23=.8e7,props={EA,EI22:EI22+EA*z*z,EI33:EI33+EA*e*e,EI23:EI23+EA*e*z,first2:EA*e,first3:EA*z,GJ,orientation:[0,1,0]},D=[[EA,EA*z,-EA*e,0],[EA*z,props.EI22,-props.EI23,0],[-EA*e,-props.EI23,props.EI33,0],[0,0,0,GJ]],force=[2,3,4],moment=[5,6,7],r=F.solve({nodes:[[0,0,0],[L,0,0]],elements:[{a:0,b:1,...props}],loads:[{node:1,force,moment}]}),integral=invSolve(D,[force[0]*L,moment[1]*L-force[2]*L*L/2,moment[2]*L+force[1]*L*L/2,moment[0]*L]),weighted=invSolve(D,[force[0]*L*L/2,moment[1]*L*L/2-force[2]*L**3/3,moment[2]*L*L/2+force[1]*L**3/3,moment[0]*L*L/2]);
[integral[0],weighted[2],-weighted[1]].forEach((v,i)=>near(r.displacements[1][i],v,'general coupled statics oracle'));
[integral[3],integral[1],integral[2]].forEach((v,i)=>near(r.rotations[1][i],v,'general coupled rotation oracle'));
const q=.02,uniform=F.solve({nodes:[[0,0,0],[L,0,0]],elements:[{a:0,b:1,EA,EI22,EI33,GJ,orientation:[0,1,0],distributed:()=>({force:[q,0,0]})}]});
near(uniform.displacements[1][0],q*L*L/(2*EA),'uniform axial tip');near(uniform.energy,q*q*L**3/(6*EA),'physical energy includes condensed load constant');near(uniform.verification.energyError,0,'energy/work consistency');
for(const t of [.1,.5,.9])near(F.sampleElement(uniform.elements[0],t).displacement[0],q*L*L/EA*(t-t*t/2),'interior quadratic axial field');
console.log(`Axial compatibility PASS: ${n} offset-reference invariance, zero-spurious-N, independent statics and distributed-load energy checks.`);
