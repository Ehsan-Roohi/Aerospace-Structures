'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const r=JSON.parse(fs.readFileSync(path.join(__dirname,'closure-regularity-probe.json'),'utf8'));
assert.equal(r.independentAcostaGate,'NOT_PASSED');
assert.ok(r.meshes.length>=5);
for(let i=0;i<r.meshes.length;i++){
 const m=r.meshes[i];assert.equal(m.status,'INTERNAL_C1_CANDIDATE');assert.ok(m.attenuation>0&&m.attenuation<.75);
 assert.ok(Math.abs(m.endGapSlope)<1e-5);assert.ok(m.metrics.minimumHeight>=-1e-8);assert.ok(m.metrics.maxNormalVelocity<1e-7);assert.ok(m.metrics.maxShapeCorrection<1e-8);
 assert.ok(m.trace.some(t=>t.status==='rejected'),'The rejected bracket branches must be retained.');
 if(i)assert.ok(m.metrics.closureTurningAngleDeg<r.meshes[i-1].metrics.closureTurningAngleDeg);
}
console.log(JSON.stringify({status:'PASS_INTERNAL_C1_RESEARCH_REGRESSION_ONLY',notIndependentValidation:true,meshes:r.meshes.map(m=>({N:m.N,A:m.attenuation,slope:m.endGapSlope,corner:m.metrics.closureTurningAngleDeg}))},null,2));
