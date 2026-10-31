// Reproduce production adapter admission with recorded ACTUAL samples, then
// run one fresh bounded N48 candidate. Numerical verification, not experiment.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const H=require('../cavitation.js'),S=require('../smooth-detachment.js'),A=require('../smooth-detachment-adapter.js');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'smooth-detachment-admission-fixtures.json')));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const freshInput={thickness:.12,alpha:4,detachment:.01,length:.4,recovery:.15,exponent:1,resolution:48,attenuation:.37};
function runFresh(){
  const start=Date.now(),it=A.iterate(freshInput);let next,yields=0;
  do{if(Date.now()-start>59000)throw Error('Fresh candidate exceeded the59-second generator budget.');next=it.next();if(!next.done)yields++;}while(!next.done);
  const r=next.value;
  assert.equal(r.detachment.settings.pressureTolerance,0);
  assert.equal(r.smoothDetachment.rawCode,'WETTED_PRESSURE_BELOW_VAPOUR');
  assert.equal(r.status,'converged-prototype');assert.equal(r.physicalAdmissibility.screenPassed,false);
  assert.equal(r.smoothDetachment.acceptedForDisplay,false);
  assert.ok(Math.abs(r.detachment.selected-.00616242130062486)<1e-10);
  assert.ok(Math.abs(r.sigma-1.069733129527486)<1e-10);
  const out={status:'NUMERICAL_CANDIDATE_PHYSICAL_SCREEN_FAILED',input:freshInput,seconds:(Date.now()-start)/1000,progressYields:yields,
    rawCode:r.smoothDetachment.rawCode,code:r.code,numericalStatus:r.status,selectedDetachment:r.detachment.selected,sigma:r.sigma,
    attenuation:r.closure.selectedAttenuation,beta:r.detachment.beta,physicalAdmissibility:r.physicalAdmissibility,
    noSamplesOmitted:true,pressure:r.panels.map(p=>({x:p.x,y:p.y,cp:p.cp,cavity:p.cavity,margin:p.cp+r.sigma})),height:r.height};
  fs.writeFileSync(path.join(__dirname,'smooth-detachment-fresh.json'),JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({status:out.status,seconds:out.seconds,progressYields:yields,xD:out.selectedDetachment,sigma:r.sigma,wetMargin:r.physicalAdmissibility.minimumWettedPressureMargin}));
  return out;
}
if(process.argv.includes('--fresh-only')){runFresh();process.exit(0);}
const checks=[],check=(name,fn)=>{fn();checks.push(name);},legacyInput={thickness:.12,alpha:4,detachment:.01,length:.4,resolution:32};
const before=JSON.stringify(H.solve(legacyInput)),baselineHash=hash(path.join(__dirname,'../cavitation.js'));
check('current core is byte-identical to the independently reproduced0.3.2 core',()=>{for(const f of fixture.cases)assert.equal(f.sourceCoreSha256,baselineHash);});
check('raw production wrapper forbids null, positive and nonfinite pressure allowances before a solve',()=>{
  for(const v of [null,.01,Infinity,NaN,-1])assert.throws(()=>S.iterate({}, {pressureTolerance:v}).next(),/zero-allowance/);
});
const records=[];
for(const f of fixture.cases){
  const raw=f.raw,samples=JSON.stringify({panels:raw.panels,height:raw.height,points:raw.points,sigma:raw.sigma}),r=A.assess(raw);
  check(`actualN${f.resolution} pressure-violating candidate cannot inherit the original ADMITTED label`,()=>{
    assert.equal(raw.code,'ADMITTED');assert.equal(r.smoothDetachment.rawCode,'ADMITTED');assert.equal(r.status,'converged-prototype');
    assert.equal(r.code,'WETTED_PRESSURE_BELOW_VAPOUR');assert.equal(r.physicalAdmissibility.screenPassed,false);
    assert.equal(r.smoothDetachment.acceptedForDisplay,false);assert.equal(r.physicalAdmissibility.minimumWettedPressureMargin,f.strictReview.minimumWettedPressureMargin);
    assert.equal(JSON.stringify({panels:r.panels,height:r.height,points:r.points,sigma:r.sigma}),samples);
  });
  check(`actualN${f.resolution} rejects stale pass, bad geometry and unbracketed regularity`,()=>{
    assert.equal(A.assess({...raw,physicalAdmissibility:{screenPassed:true}}).physicalAdmissibility.screenPassed,false);
    const g=A.assess({...raw,metrics:{...raw.metrics,geometryValid:false},detachment:{...raw.detachment,innerStatus:'rejected'}});
    assert.equal(g.status,'rejected');assert.equal(g.physicalAdmissibility.screenPassed,false);
    assert.equal(A.assess({...raw,detachment:{...raw.detachment,bracket:null}}).status,'rejected');
  });
  records.push({resolution:f.resolution,numericalStatus:r.status,code:r.code,selectedDetachment:r.detachment.selected,sigma:r.sigma,physicalAdmissibility:r.physicalAdmissibility});
}
check('adapter forces zero allowance even if a caller requests null or a positive value',()=>{
  const old=S.iterate;
  try{S.iterate=function*(input,settings){assert.equal(settings.pressureTolerance,0);return structuredClone(fixture.cases[0].raw);};
    for(const v of [null,.5]){const r=A.iterate({}, {pressureTolerance:v}).next().value;assert.equal(r.physicalAdmissibility.screenPassed,false);}
  }finally{S.iterate=old;}
});
// Test the actual Worker routing source against one-step instrumented iterators.
check('production worker strips UI mode, routes BV and fixed modes, and enforces48/smooth guards',()=>{
  const vm=require('node:vm'),messages=[],calls=[],imports=[];
  const iterator=route=>function*(input,settings){calls.push({route,input,settings});yield {phase:route};return {testOnly:true};};
  const context={importScripts:(...urls)=>imports.push(...urls),HydrofoilCavitation:{iterate:iterator('fixed')},HydrofoilSmoothDetachment:{iterate:iterator('BV')},setTimeout:fn=>fn(),self:{postMessage:r=>messages.push(r)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../worker.js'),'utf8'),context);
  context.self.onmessage({data:{resolution:48,closureMode:'smooth-contact',length:.4,detachmentMode:'smooth-bv'}});
  assert.equal(calls.at(-1).route,'BV');assert.equal(calls.at(-1).input.detachmentMode,undefined);assert.equal(calls.at(-1).settings.xdMax,.15);
  context.self.onmessage({data:{resolution:32,closureMode:'smooth-contact',detachmentMode:'fixed'}});
  assert.equal(calls.at(-1).route,'fixed');assert.equal(calls.at(-1).input.detachmentMode,undefined);
  const count=calls.length;
  for(const payload of [{resolution:32,closureMode:'smooth-contact',detachmentMode:'smooth-bv'}, {resolution:48,closureMode:'fixed-recovery',detachmentMode:'smooth-bv'}, {detachmentMode:'bad'}]){
    context.self.onmessage({data:payload});assert.equal(messages.at(-1).type,'error');assert.equal(calls.length,count);
  }
  assert.ok(imports.some(v=>v.startsWith('smooth-detachment-adapter.js')));
});
let fresh;
try{
  fresh=runFresh();assert.ok(fresh.seconds<60);
  checks.push('fresh productionN48 solve completes below60s, reports progress and remains numerically-only under strict pressure screen');
}catch(error){
  fs.writeFileSync(path.join(__dirname,'smooth-detachment-runtime-failure.json'),JSON.stringify({status:'INCOMPLETE_FRESH_RUN',budgetSeconds:59,message:error.message},null,2)+'\n');
  throw error;
}
check('legacy fixed-detachment JSON remains bit-identical after all adapter operations',()=>assert.equal(JSON.stringify(H.solve(legacyInput)),before));
const report={version:'0.3.3',date:'2026-10-31',status:'PASS_NUMERICAL_VERIFICATION_ONLY',scope:'Production adapter, worker routing and numerical reproduction; no experimental validation',checks,
  hashes:{core:baselineHash,sourceWrapper:hash(path.join(__dirname,'../smooth-detachment.js')),adapter:hash(path.join(__dirname,'../smooth-detachment-adapter.js')),fixtures:hash(path.join(__dirname,'smooth-detachment-admission-fixtures.json'))},
  recordedActualCases:records,fresh:{input:fresh.input,seconds:fresh.seconds,progressYields:fresh.progressYields,selectedDetachment:fresh.selectedDetachment,sigma:fresh.sigma,physicalAdmissibility:fresh.physicalAdmissibility},experimentalValidation:false};
fs.writeFileSync(path.join(__dirname,'smooth-detachment-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,freshSeconds:fresh.seconds,physicalStatus:fresh.physicalAdmissibility.status}));
