'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const r=JSON.parse(fs.readFileSync(path.join(__dirname,'c1-domain-sweep.json'),'utf8'));
assert.equal(r.rows.length,26);assert.equal(r.independentValidation,false);
let accepted=0,rejected=0;
for(const m of r.rows){
 assert.ok(m.trace.length>=6);assert.ok(m.trace.some(v=>v.status!=='converged-prototype'),'Rejected evaluations must remain visible.');
 if(m.status==='ADMITTED_C1_RESEARCH'){
  accepted++;assert.ok(Math.abs(m.slope3)<1e-5);assert.ok(m.metrics.minimumHeight>=-1e-8);assert.ok(m.metrics.maxNormalVelocity<1e-7);assert.ok(m.metrics.maxShapeCorrection<1e-8);
 }else{rejected++;assert.equal(m.status,'REJECTED_C1_RESEARCH');assert.ok(m.metrics.minimumHeight< -1e-8);}
}
assert.equal(accepted,18);assert.equal(rejected,8);
console.log(JSON.stringify({status:'PASS_DOMAIN_ACCOUNTING_NOT_INDEPENDENT_VALIDATION',accepted,rejected,oneFactorCases:13,meshesPerCase:2}));
