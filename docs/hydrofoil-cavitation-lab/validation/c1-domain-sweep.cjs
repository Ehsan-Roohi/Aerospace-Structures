'use strict';
// Frozen-core domain diagnosis, independent of concurrent GUI/core integration.
const C=require('./c1-domain-frozen-core.cjs'),fs=require('node:fs'),path=require('node:path');
const cases=[{id:'base'},{id:'length-020',length:.2},{id:'length-030',length:.3},{id:'length-050',length:.5},{id:'length-060',length:.6},
 {id:'thickness-006',thickness:.06},{id:'thickness-009',thickness:.09},{id:'thickness-015',thickness:.15},{id:'thickness-018',thickness:.18},
 {id:'alpha-2',alpha:2},{id:'alpha-3',alpha:3},{id:'alpha-5',alpha:5},{id:'alpha-6',alpha:6}];
function slope(h,n=3){const p=h.slice(-n),x=p.at(-1).x;let d=0;for(let j=0;j<n;j++){let w=0;for(let m=0;m<n;m++)if(m!==j){let t=1/(p[j].x-p[m].x);for(let k=0;k<n;k++)if(k!==j&&k!==m)t*=(x-p[k].x)/(p[j].x-p[k].x);w+=t;}d+=w*p[j].h;}return d;}
function run(test,resolution){
 const {id,...input}=test,trace=[];
 function ev(A){try{const r=C.solve({...input,resolution,attenuation:A,normalTolerance:1e-7,shapeTolerance:1e-8,relaxation:.3,maxIterations:220}),d=slope(r.height),row={A,status:r.status,reason:r.reason,slope:d,sigma:r.sigma,normal:r.metrics.maxNormalVelocity,shape:r.metrics.maxShapeCorrection,minGap:r.metrics.minimumHeight,linear:r.metrics.linearResidual,corner:r.metrics.closureTurningAngleDeg};trace.push(row);return {A,d,r,innerConverged:row.normal<1e-7&&row.shape<1e-8};}catch(e){trace.push({A,status:'exception',reason:e.message});return null;}}
 const sampled=[.05,.2,.3,.4,.55,.7].map(ev);let lo,hi;
 for(let i=0;i<sampled.length-1;i++){const a=sampled[i],b=sampled[i+1];if(a?.innerConverged&&b?.innerConverged&&a.d*b.d<=0){lo=a;hi=b;break;}}
 if(!lo)return {id,input,resolution,status:'NO_CONVERGED_SLOPE_BRACKET',trace};
 let best=Math.abs(lo.d)<Math.abs(hi.d)?lo:hi;
 for(let k=0;k<24&&Math.abs(best.d)>1e-5;k++){
  const w=hi.A-lo.A,secant=lo.A-lo.d*w/(hi.d-lo.d),A=Math.max(lo.A+.1*w,Math.min(hi.A-.1*w,secant)),next=ev(A);
  if(!next?.innerConverged)return {id,input,resolution,status:'INNER_SOLVE_FAILED_DURING_ROOT',trace};
  if(Math.abs(next.d)<Math.abs(best.d))best=next;
  if(lo.d*next.d<=0)hi=next;else lo=next;
 }
 const r=best.r,admitted=r.status==='converged-prototype'&&Math.abs(best.d)<1e-5;
 return {id,input,resolution,N:r.panels.length,status:admitted?'ADMITTED_C1_RESEARCH':'REJECTED_C1_RESEARCH',A:best.A,slope3:best.d,slope5:slope(r.height,5),sigma:r.sigma,metrics:r.metrics,coefficients:r.coefficients,height:r.height,points:r.points,trace};
}
const report={scope:'One-factor-at-a-time research domain test, not a Cartesian full-factorial coverage claim. Frozen core SHA256 6b0155e00b25ad27c4f4283c34b2cbe6fd10f1f355517bcc3e1767056d982ec2. No geometry clipping or failed branch removal.',default:{thickness:.12,alpha:4,detachment:.01,length:.4,recovery:.15,exponent:1},independentValidation:false,rows:[]};
for(const c of cases)for(const n of [32,64]){const r=run(c,n);report.rows.push(r);console.log(JSON.stringify({id:r.id,n,status:r.status,N:r.N,A:r.A,sigma:r.sigma,corner:r.metrics?.closureTurningAngleDeg,evals:r.trace.length}));fs.writeFileSync(path.join(__dirname,'c1-domain-sweep.json'),JSON.stringify(report,null,2)+'\n');}
