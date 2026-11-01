'use strict';
// Fresh real BEM pressure roots. --long additionally runs sigma=.05 in the explicit
// opt-in length domain. Both retain complete final audits, with no accuracy pass.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../axisymmetric-forward.js'),C=require('../axisymmetric-cavity-c1.js');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'output/opus-bem/axisymmetric-forward-20261101');
fs.mkdirSync(out,{recursive:true});
const checks=[];
function check(name,passed,data={}) { assert.ok(passed,name+': '+JSON.stringify(data));checks.push({name,passed,...data});console.log('PASS '+name+' '+JSON.stringify(data)); }
function near(a,b,tol=1e-10) { return Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)); }
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function run(name,input) {
  let last='';
  const file=path.join(out,name+'.json'),prior=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  const resume=process.argv.includes('--resume')&&prior?.ok===true&&prior.coreSourceSha256===F.coreSourceSha256&&JSON.stringify(prior.input)===JSON.stringify(F.options(input));
  const r=resume?prior:await F.solve(input,{onProgress:p=>{const label=p.scalarStage+':'+p.evaluation;if(label!==last){last=label;console.log(JSON.stringify({case:name,stage:p.stage,evaluation:p.evaluation,L:p.LOverRn,elapsed:p.elapsedSeconds}));}}});
  if(resume){assert.equal(r.coreSourceSha256,F.coreSourceSha256);assert.deepEqual(r.input,F.options(input));console.log('Rechecking stored fresh BEM case '+name+'; a new scalar search is not claimed.');}
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(r));
  check(name+' converged pressure root',r.rootConverged,{target:r.targetSigma,actual:r.achievedSigma,residual:r.sigmaResidual,L:r.final?.L,evaluations:r.search.scalarEvaluationCount,seconds:r.seconds});
  check(name+' fresh final physical and field admission',r.ok&&r.nodalConverged&&r.geometryAdmissible&&r.directFieldPassed,{normal:r.final?.fieldAudit?.maxNormal_U,Cp:r.final?.fieldAudit?.maxCavityDynamicCpResidual});
  check(name+' all mandatory and supplemental audit fractions retained',r.final.fieldAudit.fractions.length===15&&r.final.fieldAudit.fractions[0]===.001&&r.final.fieldAudit.fractions.at(-1)===.999);
  check(name+' scalar calls remain provisional',r.search.evaluations.every(e=>!e.audited&&e.provisional));
  check(name+' deterministic reference on all scalar calls',r.search.evaluations.every(e=>near(e.Rm,1+.4*Math.sqrt(e.LOverRn))));
  check(name+' fresh final audited solve recorded separately',r.finalCoreOptions.audit===true&&r.finalCoreOptions.L===r.final.L&&r.final.fieldAudit.fieldsFinite);
  check(name+' no accuracy qualification',!r.meshAccuracyQualified&&!r.experimentalAccuracyQualified&&!r.accuracyQualified&&!r.final.accuracyQualified);
  check(name+' explicit artificial closure and volume',r.closure.artificial&&r.volume.kind==='artificial-image-envelope'&&!r.volume.physicalNaturalCavityVolume);
  check(name+' dimensional geometry and declared drag',near(r.dimensions.imageSeparation,r.final.L*input.diskRn)&&near(r.dimensions.Rmax,r.final.Rmax*input.diskRn)&&near(r.volume.fullEnvelope,r.final.volume*input.diskRn**3)&&(r.advancedSigmaOverride?r.drag.force===null:Number.isFinite(r.drag.force)));
  check(name+' exact actual afterbody containment',r.body?.dryContained&&near(r.body.minimumClearance,input.diskRn-input.body.radius)&&r.volume.bodySubtracted);
  // JSON normalizes C1's legitimate signed zero; require a stable numeric
  // serialization without treating -0 -> 0 as a scientific-data failure.
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(r))),JSON.stringify(r));
  const reproduce=await C.solve({...r.finalCoreOptions,initialState:r.final.solutionState,audit:false});
  check(name+' root reproduced by unchanged real BEM',reproduce.nodalConverged&&near(reproduce.sigma,r.achievedSigma,1e-11));
  return r;
}
(async()=>{
  check('core source fingerprint',sha(fs.readFileSync(path.join(root,'docs/hydrofoil-cavitation-lab/axisymmetric-cavity-c1.js'),'utf8').replace(/\r\n/g,'\n'))===F.coreSourceSha256);
  assert.throws(()=>C.setup({L:24.01}),/2–24/);
  assert.throws(()=>C.setup({L:80.01,researchLengthExtension:true}),/2–80/);
  assert.throws(()=>C.setup({L:32,researchLengthExtension:1}),/explicit boolean/);
  const extended=C.setup({L:80,researchLengthExtension:true});
  check('extension explicit and unqualified',extended.domain.researchLengthExtension&&!extended.domain.meshAccuracyQualified&&extended.domain.lengthInterval[1]===80);
  check('default core length guard unchanged',C.setup({L:24}).domain.lengthInterval[1]===24);
  for(const input of [{sigma:0},{sigma:-1},{sigma:NaN},{sigma:Infinity},{rho:0},{U:0},{pc:-1},{pInf:2339},{diskRn:0},
    {Nc:16},{extendedResearchDomain:1},{maxEvaluations:13},{sigmaTolerance:1e-12},{closure:'natural-tail'},
    {body:{radius:0,length:1}},{body:{radius:.001,length:0}}]) {
    const r=await F.solve(input);assert.equal(r.ok,false);assert.equal(r.search.evaluations.length,0);
  }
  check('unsupported invalid inputs rejected before BEM',true);
  const cancelled=await F.solve({sigma:.5},{isCancelled:()=>true});
  check('cancellation honored before first BEM',cancelled.status==='CANCELLED'&&cancelled.search.evaluations.length===0);
  const pInf=101325,pc=2339,rho=1000,U=Math.sqrt(2*(pInf-pc)/(rho*.5));
  const basic=await run('physical-target-sigma-0p5',{mode:'physical',pInf,pc,rho,U,diskRn:.01,Nc:128,body:{radius:.008,length:.01},maxSeconds:300});
  check('physical target derived from pressure and speed',near(basic.targetSigma,2*(pInf-pc)/(rho*U*U),1e-14));
  const negativeBody=F.checkAfterbody({radius:.0101,length:.01},basic.final,basic.finalCoreOptions,.01);
  const overlongBody=F.checkAfterbody({radius:.008,length:1},basic.final,basic.finalCoreOptions,.01);
  const touchingBody=F.checkAfterbody({radius:.01,length:.01},basic.final,basic.finalCoreOptions,.01);
  check('actual C1 geometry preserves negative body clearance',!negativeBody.dryContained&&negativeBody.minimumClearance<0&&near(negativeBody.minimumClearance,-.0001));
  check('actual C1 geometry rejects unsupported body coverage',!overlongBody.completeCoverage&&!overlongBody.dryContained&&overlongBody.tipClearance===null);
  check('zero clearance is retained without a positive gap floor',touchingBody.dryContained&&touchingBody.minimumClearance===0);
  assert.throws(()=>F.checkAfterbody({radius:.008,length:.01},basic.final,{...basic.finalCoreOptions,L:8},.01),/must match/);
  const unsupported=await F.solve({sigma:.05,Nc:32,maxSeconds:90});
  fs.writeFileSync(path.join(out,'unsupported-default-domain-sigma-0p05.json'),JSON.stringify(unsupported));
  check('unsupported default-domain sigma rejected by fresh bracket',unsupported.status==='UNSUPPORTED_TARGET'&&!unsupported.rootConverged&&unsupported.search.evaluations.length===2&&unsupported.search.endpointSigmaRange[0]>.05);
  if(process.argv.includes('--long'))await run('explicit-sigma-0p05-extended',{sigma:.05,diskRn:.01,Nc:128,extendedResearchDomain:true,body:{radius:.008,length:.2},maxSeconds:600});
  fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify({coreSourceSha256:F.coreSourceSha256,checks,allPassed:true,longCaseRun:process.argv.includes('--long'),recheckedStoredCases:process.argv.includes('--resume'),experimentalAccuracyQualified:false,meshAccuracyQualified:false},null,2));
  console.log('Forward validation complete: '+checks.length+' checks. No mesh or experimental accuracy qualification.');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
