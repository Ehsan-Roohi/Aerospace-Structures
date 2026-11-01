'use strict';
// Control tests are named SYNTHETIC. Actual wetted and optional cavity runs use
// the unchanged production BEM, with no physical acceptance fabricated.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const F=require('../forward-hydrofoil.js'),H=require('../cavitation.js');
const checks=[];function check(name,f){f();checks.push({name,passed:true});}
function syntheticDriver({pressureFailure=false,geometryFailure=false,innerFailure=false}={}){
 const AH=Object.assign({},H,{wettedVelocity:(pts,alpha)=>{
   const panels=H.geometry(pts);return{points:pts,panels,cp:panels.map((_,i)=>i<panels.length/2?-2:0),
     linearResidual:0,velocityKuttaResidual:0,cl:0,cm:0,pressureDrag:0};}});
 const AB={VERSION:'SYNTHETIC-control-only',*iterate(input){
   yield{iteration:1,phase:'synthetic-test-control'};
   const sigma=2-input.length,raw={status:'converged-prototype',sigma,
     panels:[{cp:pressureFailure?-5:0,cavity:false,x:.01,y:.01},{cp:-sigma,cavity:true,x:.2,y:.02}],
     height:[{x:.01,h:0},{x:.2,h:geometryFailure?-1e-6:.01},{x:input.length+.01,h:0}],
     metrics:{geometryValid:!geometryFailure,minimumHeight:geometryFailure?-1e-6:0},
     closure:{selectedAttenuation:.37},detachment:{selected:.01},
     smoothDetachment:{numericalConverged:!innerFailure}};
   raw.physicalAdmissibility=H.physicalAdmissibility(raw.panels,sigma,{equationsConverged:!innerFailure,geometryValid:!geometryFailure});return raw;
 }};
 const sandbox={HydrofoilCavitation:AH,HydrofoilSmoothDetachment:AB,Date,Math,Number,JSON,Object,Array,Map,Set,Error,Promise,setTimeout};
 sandbox.globalThis=sandbox;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../forward-hydrofoil.js'),'utf8'),sandbox);
 return sandbox.ForwardHydrofoilCavitation;
}
(async()=>{
 check('Physical sigma uses absolute pressure, density and speed',()=>{
  const t=F.target({mode:'physical',rho:1000,pc:2000,U:20,pInf:102000,chord:.2});
  assert.strictEqual(t.sigma,.5);assert.strictEqual(t.dynamicPressure,200000);});
 check('Temperature-based water input delegates to the shared fluid-state module',()=>{
   const t=F.target({mode:'physical',temperatureC:20,U:5,pInf:101325});
   assert(t.rho>990&&t.rho<1005);assert((t.pc??t.vapourPressure)>2300&&(t.pc??t.vapourPressure)<2400);
   assert(Math.abs(t.sigma-(t.pInf-(t.pc??t.vapourPressure))/t.dynamicPressure)<1e-12);});
 for(const [name,input]of[
  ['negative sigma',{sigma:-1}],['nonfinite sigma',{sigma:NaN}],['bad geometry',{sigma:1,naca:'0000'}],
  ['ambient below cavity pressure',{mode:'physical',rho:1000,pc:2000,U:20,pInf:1000}],
  ['overflowing physical dynamic pressure',{mode:'physical',rho:1000,pc:2000,U:1e300,pInf:102000}],
  ['null pressure bypass',{sigma:1,settings:{pressureTolerance:null}}],
  ['finite pressure allowance',{sigma:1,settings:{pressureTolerance:.01}}],
  ['unbounded evaluation count',{sigma:1,settings:{maxLengthEvaluations:100}}],
  ['nonfinite resolution',{sigma:1,settings:{resolution:Infinity}}]])
   check('Guard: '+name,()=>assert.throws(()=>F.configuration(input)));
 let progress=0;
 const actual=await F.solve({mode:'sigma',sigma:5,naca:'0012',alpha:0,settings:{resolution:24,maxSeconds:10}},
   {onProgress:()=>progress++});
 check('ACTUAL BEM two-mesh fully wetted case is finite and above cavity pressure',()=>{
   assert.strictEqual(actual.status,'fully-wetted');assert(actual.acceptedForDisplay);assert(!actual.cavityPresent);
   assert.strictEqual(actual.cavity,null);assert(actual.wetPreflight.coarse.passed&&actual.wetPreflight.fine.passed);
   assert(actual.wetPreflight.coarse.panels.length===64&&actual.wetPreflight.fine.panels.length===128);
   assert(Math.abs(actual.coefficients.cl)<1e-10);assert(progress===2);});
 const physical=await F.solve({mode:'physical',rho:998.2,pc:2339,U:5,pInf:101325,naca:'2412',alpha:2,
   settings:{resolution:24,maxSeconds:10}});
 check('ACTUAL BEM cambered physical-input wet preflight works',()=>{
   assert.strictEqual(physical.status,'fully-wetted');assert(physical.target.dimensional);
   assert(physical.target.sigma>7);assert(physical.coefficients.cl>0);assert(physical.wetPreflight.fine.finite);});
 const cancelled=await F.solve({sigma:1},{isCancelled:()=>true});
 check('Cancellation returns a distinct nonaccepted state',()=>{
   assert.strictEqual(cancelled.status,'cancelled');assert(!cancelled.acceptedForDisplay);assert.strictEqual(cancelled.trials.length,0);});
 const rejectedWarm=await F.solve({sigma:5,alpha:0,warmStart:{driverVersion:F.VERSION,configurationKey:'different',length:.4,detachment:.01,attenuation:.37},settings:{resolution:24}});
 check('Mismatched warmstart is not reused',()=>{assert(!rejectedWarm.warmStartUsed);assert(rejectedWarm.warmStartIgnoredReason);});
 const S=syntheticDriver();let p=0;
 const logic=await S.solve({sigma:1.5,settings:{maxSeconds:10}},{onProgress:()=>p++});
 check('SYNTHETIC control: actual outer function root, not prescribed cavity length',()=>{
   assert.strictEqual(logic.status,'admitted-research-cavity');assert(logic.root.converged);
   assert(Math.abs(logic.root.length-.5)<1e-12);assert(p>2);assert(logic.trials.length>=3);});
 const warm=await S.solve({sigma:1.5,warmStart:logic.warmStart,settings:{maxSeconds:10}});
 check('SYNTHETIC matching warmstart still performs a fresh solve',()=>{
   assert(warm.warmStartUsed);assert(warm.trials.length>0);assert(Math.abs(warm.trials[0].length-.5)<1e-12);});
 const pressure=await syntheticDriver({pressureFailure:true}).solve({sigma:1.5,settings:{maxSeconds:10}});
 check('SYNTHETIC numerical sigma root never overrides failed pressure',()=>{
   assert(pressure.root.converged);assert.strictEqual(pressure.code,'FORWARD_ROOT_PHYSICAL_SCREEN_FAILED');
   assert(!pressure.acceptedForDisplay);assert(!pressure.cavityPresent);assert(pressure.diagnosticCandidate);
   assert(pressure.trials.some(t=>t.raw.panels[0].cp===-5));});
 const geometry=await syntheticDriver({geometryFailure:true}).solve({sigma:1.5,settings:{maxSeconds:10}});
 check('SYNTHETIC negative gap is retained and cannot be accepted',()=>{
   assert(geometry.root.converged);assert(!geometry.checks.gapPassed);assert(!geometry.acceptedForDisplay);
   assert(geometry.diagnosticCandidate.height[1].h<0);});
 const inner=await syntheticDriver({innerFailure:true}).solve({sigma:1.5,settings:{maxSeconds:10,maxLengthEvaluations:3}});
 check('SYNTHETIC failed detachment cannot supply a scalar bracket',()=>{
   assert.strictEqual(inner.code,'NO_RESOLVED_DETACHMENT_CANDIDATE');assert.strictEqual(inner.trials.length,3);assert(!inner.root.converged);});
 const bounded=await S.solve({sigma:1.5,settings:{maxLengthEvaluations:2,maxSeconds:10}});
 check('SYNTHETIC outer evaluation budget is enforced',()=>{
   assert.strictEqual(bounded.trials.length,2);assert(!bounded.acceptedForDisplay);assert.strictEqual(bounded.code,'TARGET_SIGMA_ROOT_NOT_RESOLVED');});
 let cancelInner=false;
 const partial=await S.solve({sigma:1.5,settings:{maxSeconds:10}},
   {isCancelled:()=>cancelInner,onProgress:p=>{if(p.stage==='synthetic-test-control')cancelInner=true;}});
 check('SYNTHETIC cancellation retains and labels the incomplete inner trial',()=>{
   assert.strictEqual(partial.status,'cancelled');assert(!partial.acceptedForDisplay);
   assert.strictEqual(partial.trace[0].status,'cancelled');assert.strictEqual(partial.trials[0].incomplete,true);});
 const ai=process.argv.indexOf('--actual-result');
 if(ai>=0){
   const recorded=JSON.parse(fs.readFileSync(path.resolve(process.argv[ai+1]),'utf8'));
   const r=recorded.result,raw=r.diagnosticCandidate;
   const source=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../cavitation.js'))).digest('hex');
   check('RECORDED ACTUAL BEM core source remained unchanged',()=>{
     assert.strictEqual(recorded.coreSha256Before,source);assert.strictEqual(recorded.coreSha256After,source);});
   const screened=F.candidateChecks(raw,r.target.sigma,r.root.converged);
   check('RECORDED ACTUAL inverse-forward root meets target but cannot bypass wet-pressure failure',()=>{
     assert(r.root.converged);assert(Math.abs(raw.sigma-r.target.sigma)<=r.settings.sigmaTolerance);
     assert(!screened.accepted);assert(!screened.targetSigmaScreen.wettedPressurePass);
     assert(screened.targetSigmaScreen.minimumWettedPressureMargin<0);assert(!r.acceptedForDisplay);});
 }
 const out={driver:F.VERSION,status:'PASS_CONTROL_AND_WET_BEM_TESTS',checks,actualWetted:{symmetric:actual,cambered:physical},
   scope:'Synthetic cases test control/admission logic only. Actual wet cases use the production BEM. No cavitating experimental accuracy claim.'};
 const oi=process.argv.indexOf('--output');if(oi>=0)fs.writeFileSync(path.resolve(process.argv[oi+1]),JSON.stringify(out));
 console.log(JSON.stringify({status:out.status,checks:checks.length,wetCl:physical.coefficients.cl}));
})().catch(e=>{console.error(e);process.exitCode=1;});
