// Independent derivative of the representation kernels at LIQUID points. This
// probes the solved field; it does not reuse the boundary Cp reconstruction.
'use strict';
const C=require('../cavitation.js'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),PI2=2*Math.PI;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
function velocity(p,q,phi,P,U,gamma=0,te=null){
 let vx=U[0],vy=U[1];
 for(let j=0;j<p.length;j++){
  const v=p[j],dx=P[0]-v.a[0],dy=P[1]-v.a[1],X=dx*v.t[0]+dy*v.t[1],Y=-dx*v.t[1]+dy*v.t[0],L=v.length,R1=X*X+Y*Y,R2=(X-L)**2+Y*Y;
  if(R1<1e-25||R2<1e-25)throw Error('Field sample hits a panel vertex.');
  const sX=Math.log(R1/R2)/(2*PI2),sY=C.influences(v,P).D,dX=Y*(1/R1-1/R2)/PI2,dY=((X-L)/R2-X/R1)/PI2;
  vx+=q[j]*(sX*v.t[0]-sY*v.t[1])-phi[j]*(dX*v.t[0]-dY*v.t[1]);
  vy+=q[j]*(sX*v.t[1]+sY*v.t[0])-phi[j]*(dX*v.t[1]+dY*v.t[0]);
 }
 if(te&&gamma){const x=P[0]-te[0],y=P[1]-te[1],r2=x*x+y*y;vx+=gamma*y/(PI2*r2);vy-=gamma*x/(PI2*r2);}
 return [vx,vy];
}
function wakeJump(p,phi){const n=p.length,u=p[0].length/(p[0].length+p[1].length),l=p[n-1].length/(p[n-1].length+p[n-2].length);return (1+u)*phi[0]-u*phi[1]-(1+l)*phi[n-1]+l*phi[n-2];}
const circle=[],circleNear=[];
for(const N of [40,80,160]){
 const points=Array.from({length:N+1},(_,i)=>[Math.cos(PI2*i/N),Math.sin(PI2*i/N)]),r=C.wetted(points,0,false),e=[];
 for(let k=0;k<72;k++){const a=PI2*(k+.31)/72,P=[1.4*Math.cos(a),1.4*Math.sin(a)],v=velocity(r.panels,r.q,r.phi,P,[1,0]),R2=dot(P,P),ref=[1-(P[0]**2-P[1]**2)/R2**2,-2*P[0]*P[1]/R2**2];e.push(Math.hypot(v[0]-ref[0],v[1]-ref[1]));}
 circle.push({N,sampleRadius:1.4,allPointVelocityRms:rms(e),allPointVelocityMax:Math.max(...e)});
 for(const offset of [{relative:.2},{relative:.05},{absolute:.02},{absolute:.01},{absolute:.005}]){
  const errors=[];
  for(const b of r.panels)for(const f of [.25,.5,.75]){
   const d=offset.absolute??offset.relative*b.length,P=[b.a[0]+f*(b.b[0]-b.a[0])+d*b.n[0],b.a[1]+f*(b.b[1]-b.a[1])+d*b.n[1]],v=velocity(r.panels,r.q,r.phi,P,[1,0]),R2=dot(P,P),ref=[1-(P[0]**2-P[1]**2)/R2**2,-2*P[0]*P[1]/R2**2];
   errors.push(Math.hypot(v[0]-ref[0],v[1]-ref[1]));
  }
  circleNear.push({N,...offset,allPointVelocityErrorRms:rms(errors),allPointVelocityErrorMax:Math.max(...errors)});
 }
}
assert.ok(circle[2].allPointVelocityMax<1e-4);assert.ok(circle[2].allPointVelocityRms<circle[1].allPointVelocityRms/3);
function probe(r,label,attenuation){
 const p=r.panels,phi=p.map(v=>v.potential),q=p.map(v=>v.normalDerivative),a=4*Math.PI/180,U=[Math.cos(a),Math.sin(a)],gamma=wakeJump(p,phi),ids=p.flatMap((v,i)=>v.cavity?[i]:[]).reverse();
 const reference=C.buildFoil(C.options({resolution:r.resolution??r.options?.resolution})),end=reference.foilS.at(-1),start=.85*end;
 const rows=[];
 for(const offset of [{relative:.2},{relative:.05},{absolute:.02},{absolute:.01},{absolute:.005}]){
  const samples=[];
  for(let k=0;k<ids.length;k++)for(const f of [.25,.5,.75]){
   const j=ids[k],b=p[j],distance=offset.absolute??offset.relative*b.length,P=[b.a[0]+f*(b.b[0]-b.a[0])+distance*b.n[0],b.a[1]+f*(b.b[1]-b.a[1])+distance*b.n[1]],v=velocity(p,q,phi,P,U,gamma,r.points[0]);
   const sf=reference.foilS[k]+(1-f)*(reference.foilS[k+1]-reference.foilS[k]),g=1-attenuation*Math.max(0,(sf-start)/(end-start)),qc=Math.sqrt(1+r.sigma),vn=dot(v,b.n),vt=dot(v,b.t),targetCp=1-(qc*g)**2;
   samples.push({panel:j,fractionCCW:f,boundaryX:b.a[0]+f*(b.b[0]-b.a[0]),x:P[0],y:P[1],distance,normalVelocity:vn,tangentialVelocity:vt,Cp:1-dot(v,v),targetCp,CpDifference:1-dot(v,v)-targetCp});
  }
  rows.push({...offset,samples,allNormalVelocityRms:rms(samples.map(v=>v.normalVelocity)),allNormalVelocityMax:Math.max(...samples.map(v=>Math.abs(v.normalVelocity))),allCpTargetDifferenceRms:rms(samples.map(v=>v.CpDifference)),allCpTargetDifferenceMax:Math.max(...samples.map(v=>Math.abs(v.CpDifference)))});
 }
 const outer=[];
 for(let k=0;k<90;k++){const angle=PI2*(k+.27)/90,P=[.5+1.5*Math.cos(angle),1.5*Math.sin(angle)],v=velocity(p,q,phi,P,U,gamma,r.points[0]);outer.push({angle,x:P[0],y:P[1],vx:v[0],vy:v[1],Cp:1-dot(v,v)});}
 return {label,N:p.length,A:attenuation,sigma:r.sigma,coefficients:r.coefficients,closureAngleDeg:r.metrics.closureTurningAngleDeg,height:r.height,boundaryPressure:r.panels.map(v=>({x:v.x,y:v.y,Cp:v.cp,cavity:v.cavity,targetCp:v.targetCp})),nearBoundary:rows,outerField:outer};
}
const candidate=JSON.parse(fs.readFileSync(path.join(__dirname,'closure-regularity-probe.json'),'utf8')),cases=[];
for(const row of candidate.meshes){
 const original=C.solve({resolution:row.resolution,relaxation:.3,maxIterations:220,normalTolerance:1e-7,shapeTolerance:1e-8});
 cases.push(probe(original,'fixed A = 0.30',.30));cases.push(probe(row,'modified C1 selection',row.attenuation));
 console.log(JSON.stringify(cases.slice(-2).map(c=>({label:c.label,N:c.N,A:c.A,sigma:c.sigma,near:c.nearBoundary.map(({samples,...v})=>v)}))));
}
const report={version:C.VERSION,scope:'Analytic source/doublet kernel gradients evaluated outside the boundary at quarter/half/three-quarter panel locations. This is independent of the boundary potential-derivative Cp routine. Relative offset means offset / local panel length; absolute means distance / chord. Neither maximum nor endpoint samples are excluded.',kernelVerification:{reference:'Exact circular-cylinder exterior velocity at radius1.4 and at the exact same near-panel sampling protocols',circle,circleNear},notClaimed:'Finite-offset normal velocity and Cp differences from a SURFACE target are diagnostics, not strict surface residuals or experimental errors. Taking the observation distance to zero together with panel size may yield nonuniform convergence for constant densities; the independent cylinder control measures that. No surface-limit or experimental-validation claim is made.',cases};
fs.writeFileSync(path.join(__dirname,'off-collocation-field-probe.json'),JSON.stringify(report,null,2)+'\n');
