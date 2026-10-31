/* Regression for the equilibrium wetted-pressure consistency screen. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../cavitation.js');
const condition={equationsConverged:true,geometryValid:true};
let report=C.physicalAdmissibility([{x:.1,y:.05,cp:-.5,cavity:false},{x:.2,y:.08,cp:-99,cavity:true}],1,condition);
assert.equal(report.screenPassed,true);assert.equal(report.wettedBelowVapourPanels,0);
report=C.physicalAdmissibility([{x:.1,y:.05,cp:-1.1,cavity:false}],1,condition);
assert.equal(report.screenPassed,false);assert.equal(report.status,'FAILED_WETTED_PRESSURE');assert.equal(report.wettedMinimumLocation.panel,0);
assert.equal(C.physicalAdmissibility([{cp:NaN,cavity:false}],1,condition).screenPassed,false);
assert.equal(C.physicalAdmissibility([{cp:0,cavity:false}],1,{...condition,equationsConverged:false}).screenPassed,false);
const before=JSON.parse(fs.readFileSync(path.join(__dirname,'cavity-2d-before.json'))),rows=[];
for(const baseline of before){
 const r=C.solve(baseline.input);
 // The diagnostic must not change any nonlinear equation, tolerance, geometry,
 // pressure, integrated force, selected branch or legacy numerical status.
 assert.deepEqual({input:baseline.input,status:r.status,sigma:r.sigma,height:r.height,cp:r.panels.map(p=>p.cp),coefficients:r.coefficients},baseline);
 assert.equal(r.physicalAdmissibility.screenPassed,false);
 rows.push({input:baseline.input,numericalStatus:r.status,sigma:r.sigma,physicalAdmissibility:r.physicalAdmissibility});
}
assert.equal(rows[0].numericalStatus,'converged-prototype');
assert.equal(rows[0].physicalAdmissibility.status,'FAILED_WETTED_PRESSURE');
assert.equal(rows[1].numericalStatus,'rejected');
assert.equal(rows[1].physicalAdmissibility.screenPassed,false);
fs.writeFileSync(path.join(__dirname,'cavity-2d-admission-test.json'),JSON.stringify({passed:true,equationsAndSolutionsUnchanged:true,physicalValidation:false,rows},null,2)+'\n');
console.log(JSON.stringify({passed:true,equationsAndSolutionsUnchanged:true,rows:rows.map(r=>({numericalStatus:r.numericalStatus,physicalStatus:r.physicalAdmissibility.status,margin:r.physicalAdmissibility.minimumWettedPressureMargin}))}));
