// Research-only model diagnosis. It does not change solve(), GUI defaults, or
// the independent validation gate. All rejected bracket evaluations are kept.
'use strict';
const C=require('../cavitation.js'),fs=require('node:fs'),path=require('node:path');
function endGapSlope(height){
 const p=height.slice(-3),x=p.at(-1).x;let d=0;
 for(let j=0;j<3;j++){const k=[0,1,2].filter(i=>i!==j);d+=p[j].h*(2*x-p[k[0]].x-p[k[1]].x)/((p[j].x-p[k[0]].x)*(p[j].x-p[k[1]].x));}
 return d;
}
function evaluate(resolution,attenuation,trace){
 const input={resolution,attenuation,relaxation:.3,maxIterations:220,normalTolerance:1e-7,shapeTolerance:1e-8};
 const r=C.solve(input),slope=endGapSlope(r.height);
 trace.push({attenuation,status:r.status,reason:r.reason,endGapSlope:slope,minimumGap:r.metrics.minimumHeight,maxNormalVelocity:r.metrics.maxNormalVelocity,maxShapeCorrection:r.metrics.maxShapeCorrection,closureAngle:r.metrics.closureTurningAngleDeg,sigma:r.sigma});
 return {attenuation,slope,result:r};
}
const meshes=[];
for(const resolution of [24,32,48,64,96]){
 const trace=[];let lo=evaluate(resolution,.30,trace),hi=evaluate(resolution,.40,trace);
 if(!(lo.slope<0&&hi.slope>0))throw Error('The candidate did not establish a regularity bracket.');
 let best=Math.abs(lo.slope)<Math.abs(hi.slope)?lo:hi;
 for(let k=0;k<22&&Math.abs(best.slope)>1e-5;k++){
  const width=hi.attenuation-lo.attenuation,secant=lo.attenuation-lo.slope*width/(hi.slope-lo.slope);
  const A=Math.max(lo.attenuation+.1*width,Math.min(hi.attenuation-.1*width,secant));
  const next=evaluate(resolution,A,trace);
  if(Math.abs(next.slope)<Math.abs(best.slope))best=next;
  if(next.slope<0)lo=next;else hi=next;
 }
 const r=best.result;
 const admission=r.status==='converged-prototype'&&Math.abs(best.slope)<1e-5&&r.metrics.minimumHeight>=-1e-8;
 const row={resolution,N:r.panels.length,status:admission?'INTERNAL_C1_CANDIDATE':'REJECTED_C1_CANDIDATE',attenuation:best.attenuation,endGapSlope:best.slope,sigma:r.sigma,coefficients:r.coefficients,metrics:r.metrics,height:r.height,points:r.points,panels:r.panels,trace};
 meshes.push(row);console.log(JSON.stringify({N:row.N,status:row.status,A:row.attenuation,endGapSlope:row.endGapSlope,sigma:row.sigma,corner:row.metrics.closureTurningAngleDeg,minGap:row.metrics.minimumHeight,maxBCPressureDifference:row.metrics.maximumPressureReconstructionError,cl:row.coefficients.cl,cm:row.coefficients.cm,evaluations:trace.length}));
}
const report={version:C.VERSION,scope:'Targeted research-only diagnosis: treat pressure-recovery attenuation A as an extra unknown and impose extrapolated physical-gap derivative h_x=0 at the prescribed cavity end. This is a MODIFIED closure-parameter selection, not the unchanged fixed-A model.',equationCount:'For each A the original N+2 mixed BIE/free-boundary calculation is solved. The outer scalar equation h_x(end;A)=0 determines the extra unknown A. Existing geometry/admission requirements are retained.',notClaimed:['Independent cavity validation','Experimental validation','A resolved re-entrant jet','Physical uniqueness','Default or production solver adoption'],independentAcostaGate:'NOT_PASSED',meshes};
fs.writeFileSync(path.join(__dirname,'closure-regularity-probe.json'),JSON.stringify(report,null,2)+'\n');
