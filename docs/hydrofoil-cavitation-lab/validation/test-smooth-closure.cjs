// Numerical acceptance and compatibility of the integrated closure-selection
// algorithm. The separate velocity-BEM comparison is an independent check.
'use strict';
const C=require('../cavitation.js'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const old=JSON.parse(fs.readFileSync(path.join(__dirname,'verification.json'),'utf8'));
const fixed=C.solve({resolution:32}),old32=old.cavityMeshStudy.find(r=>r.resolution===32);
assert.equal(fixed.options.closureMode,'fixed-recovery');assert.ok(Math.abs(fixed.sigma-old32.sigma)<1e-11,'fixed-A sigma retains the historical formulation');
const rows=[];
for(const resolution of [24,32,48,64,96]){
 const start=performance.now(),r=C.solve({closureMode:'smooth-contact',resolution});
 assert.equal(r.status,'converged-prototype',r.reason);assert.ok(Math.abs(r.metrics.endpointGapSlope)<=1e-5);
 assert.ok(r.metrics.minimumHeight>=-1e-8);assert.ok(r.metrics.maxNormalVelocity<1e-7);assert.ok(r.metrics.maxShapeCorrection<1e-8);
 assert.ok(r.closure.trace.some(v=>v.status==='rejected'),'rejected branches retained');
 assert.equal(r.options.attenuation,.3,'requested starting branch parameter retained');
 assert.equal(r.panels.length,r.closure.baseline.pressure.length);assert.equal(r.height.length,r.closure.baseline.height.length,'endpoint samples are not removed');
 assert.ok(r.metrics.closureTurningAngleDeg<r.closure.baseline.metrics.closureTurningAngleDeg);
 const row={resolution,N:r.panels.length,A:r.closure.selectedAttenuation,sigma:r.sigma,cl:r.coefficients.cl,cm:r.coefficients.cm,baselineCornerDeg:r.closure.baseline.metrics.closureTurningAngleDeg,cornerDeg:r.metrics.closureTurningAngleDeg,slope3:r.metrics.endpointGapSlope,slope5:r.metrics.endpointGapSlopeFivePoint,minimumGap:r.metrics.minimumHeight,evaluations:r.closure.trace.length,seconds:(performance.now()-start)/1000};
 rows.push(row);console.log(JSON.stringify(row));
 if(resolution===32)fs.writeFileSync(path.join(__dirname,'smooth-contact-example.json'),JSON.stringify(r,null,2)+'\n');
}
for(let i=1;i<rows.length;i++){assert.ok(rows[i].cornerDeg<rows[i-1].cornerDeg);assert.ok(Math.abs(rows[i].slope5)<Math.abs(rows[i-1].slope5));}
assert.ok(rows.at(-1).cornerDeg<.4);
const short=C.solve({closureMode:'smooth-contact',resolution:24,maxClosureEvaluations:4});
assert.equal(short.status,'rejected');assert.equal(short.closure.converged,false);assert.ok(Math.abs(short.metrics.endpointGapSlope)>short.options.regularityTolerance);
const invalid=C.solve({closureMode:'smooth-contact',thickness:.18,resolution:24,maxClosureEvaluations:16});
assert.equal(invalid.status,'rejected','no intersecting branch can be called smooth-converged');
assert.throws(()=>C.solve({closureMode:'smooth-contact',exponent:.5}),/exponent/);
assert.throws(()=>C.options({closureMode:'unknown'}),/Select/);
const derivative=C.endpointGapSlope([{x:.7,h:.3**2},{x:.83,h:.17**2},{x:1,h:0}]);assert.ok(Math.abs(derivative)<1e-12,'physical gap derivative checked independently on a quadratic');
const report={status:'PASS_NUMERICAL_CLOSURE_REGRESSION',version:C.VERSION,scope:'Numerical/model correction; not experimental or independently matched cavitating-flow validation',fixedACompatibility:true,noEndpointMasking:true,intersectingBranchesRejected:true,unconvergedClosureRejected:true,rows};
fs.writeFileSync(path.join(__dirname,'smooth-contact-verification.json'),JSON.stringify(report,null,2)+'\n');
