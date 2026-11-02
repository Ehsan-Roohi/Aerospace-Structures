'use strict';
importScripts('fluid-state.js?v=0.1.0','cavitation.js?v=0.3.4','smooth-detachment.js?v=0.1.2','smooth-detachment-adapter.js?v=0.1.1','forward-hydrofoil.js?v=0.1.6-forward-research','axisymmetric-cavity-c1.js?v=0.3.1-c1-forward-domain','axisymmetric-forward.js?v=0.1.2-bidirectional-bracket','axisymmetric-reference.js?v=0.1.0','analytical-cavitators.js?v=0.1.0');
// Both mesh stages share one deadline. The fine solve is fresh: no state from
// the coarse mesh is supplied as an initialization or an admission substitute.
async function automaticDiskMesh(input,settings,hooks){
 const maxSeconds=settings.maxSeconds;
 if(!Number.isFinite(maxSeconds)||maxSeconds<10||maxSeconds>900)throw Error('Automatic disk BEM requires a finite time budget from 10 to 900 s.');
 const started=Date.now(),elapsed=()=>Math.max(0,(Date.now()-started)/1000),remaining=()=>maxSeconds-elapsed(),stages=[];
 const run=async(resolution,budgetSeconds)=>{
  const stageStarted=Date.now(),stage={resolution,budgetSeconds,startedElapsedSeconds:elapsed(),status:'running'};stages.push(stage);
  const report=row=>hooks.onProgress({...row,stage:'Automatic mesh · '+resolution+' bands · '+(row.stage||row.phase||'solving'),requestedResolution:0,meshResolution:resolution,meshStage:stages.length,stageElapsedSeconds:Math.max(0,(Date.now()-stageStarted)/1000),elapsedSeconds:elapsed(),remainingSeconds:Math.max(0,remaining())});
  report({stage:'fresh calculation'});
  let result;
  try{result=await AxisymmetricForward.solve({...input,Nc:resolution,maxSeconds:budgetSeconds},{...hooks,onProgress:report,isCancelled:()=>elapsed()>maxSeconds||Boolean(hooks.isCancelled?.())});if(!result||typeof result!=='object')throw Error('The solver returned an incomplete stage response.');}
  catch(error){result={ok:false,status:'WORKER_STAGE_ERROR',version:AxisymmetricForward.VERSION,errors:['The fresh '+resolution+'-band disk BEM stage failed: '+(error?.message||String(error))],rootConverged:false,nodalConverged:false,geometryAdmissible:false,directFieldPassed:false};}
  stage.status=result.status;stage.ok=result.ok===true;stage.elapsedSeconds=Math.max(0,(Date.now()-stageStarted)/1000);stage.finishedElapsedSeconds=elapsed();
  stage.rootConverged=result.rootConverged===true;stage.nodalConverged=result.nodalConverged===true;stage.geometryAdmissible=result.geometryAdmissible===true;stage.directFieldPassed=result.directFieldPassed===true;
  return result;
 };
 const coarse=await run(32,maxSeconds);
 const retryEligible=coarse.ok===false&&coarse.status==='FORWARD_FIELD_UNRESOLVED'&&coarse.rootConverged===true&&coarse.nodalConverged===true&&coarse.geometryAdmissible===true&&coarse.directFieldPassed===false&&coarse.bodyContainmentPassed!==false&&(!coarse.body||coarse.body.dryContained===true);
 let fine=null,message='The 32-band calculation is retained. Automatic refinement does not bypass root, geometry, body-containment or numerical-domain checks.';
 if(retryEligible){
  const budgetSeconds=remaining();
  if(budgetSeconds>=10){
   hooks.onProgress({stage:'Automatic mesh · final field checks need a fresh 128-band calculation',requestedResolution:0,meshResolution:128,meshStage:2,elapsedSeconds:elapsed(),remainingSeconds:Math.max(0,budgetSeconds)});
   // Recheck after reporting progress so even that overhead belongs to the
   // original budget; a stage with less than the solver minimum is not started.
   const fineBudget=remaining();
   if(fineBudget>=10){fine=await run(128,fineBudget);message='A fresh 128-band calculation followed the completed 32-band field-check failure. Both complete stage outputs are retained.';}
   else message='The 32-band field-check failure is retained. Less than 10 s remain in the original time budget, so no 128-band calculation was started.';
  }else message='The 32-band field-check failure is retained. Less than 10 s remain in the original time budget, so no 128-band calculation was started.';
 }else if(coarse.ok===true)message='The 32-band calculation passed the reported checks; no finer calculation was required by automatic mesh selection. This is not an accuracy qualification.';
 const selected=fine||coarse,effectiveResolution=fine?128:32;
 const meshSelection={mode:'automatic',requestedResolution:0,effectiveResolution,attemptedResolutions:stages.map(s=>s.resolution),attemptCount:stages.length,maxSeconds,elapsedSeconds:elapsed(),retryEligible,refinementAttempted:Boolean(fine),message,stages};
 const diagnostics=fine?{coarseDiagnostic:coarse,fineDiagnostic:fine}:{};
 if(meshSelection.elapsedSeconds>maxSeconds)return {ok:false,status:'TIME_LIMIT',version:selected.version||AxisymmetricForward.VERSION,input:selected.input,errors:['The shared automatic-mesh time budget expired. No result completed after its deadline is accepted.'],rootConverged:false,nodalConverged:false,geometryAdmissible:false,directFieldPassed:false,accuracyQualified:false,meshAccuracyQualified:false,experimentalAccuracyQualified:false,seconds:meshSelection.elapsedSeconds,completedDiagnostic:selected,meshSelection,...diagnostics};
 const result={...selected,meshSelection,...diagnostics};
 if(retryEligible&&!fine)result.errors=[...(selected.errors||[]),message];
 return result;
}
self.onmessage=async function(event){
 try{
  const {geometry,method,flow,foil,disk,cavitator,settings}=event.data;
  if(cavitator?.coneEnvelopeModel!==undefined&&!['semenenko-cone-35','garabedian-logvinovich'].includes(cavitator.coneEnvelopeModel))throw Error('Unsupported cone envelope dimension model.');
  const fluid=CavitationFluid.target(flow),hooks={onProgress:row=>self.postMessage({type:'progress',row})};
  let result;
  if(geometry==='hydrofoil'){
   if(method!=='bem')throw Error('The disk correlation cannot represent a hydrofoil.');
   result=await ForwardHydrofoilCavitation.solve({...fluid,chord:foil.chord,geometry:{naca:foil.naca},alpha:foil.alpha,settings},hooks);
  }else if(method==='analytical'&&['disk','disk-cylinder','cone','cylinder'].includes(geometry)){
   const input={...fluid,shape:geometry==='disk-cylinder'?'cylinder':geometry,radius:disk.radius,coneAngleDeg:cavitator?.coneAngleDeg??150,cylinderNose:geometry==='disk-cylinder'?'flat':cavitator?.cylinderNose??'flat'};
   if(input.shape==='cone'||input.shape==='cylinder'&&input.cylinderNose==='cone')input.envelopeModel=cavitator?.coneEnvelopeModel??'garabedian-logvinovich';
   if(['disk-cylinder','cylinder'].includes(geometry))input.body={radius:disk.bodyRadius,length:disk.bodyLength};
   if(input.mode==='physical')delete input.sigma;
   result=AnalyticalCavitators.solve(input);
  }else if(['disk','disk-cylinder'].includes(geometry)){
   const input={...fluid,diskRn:disk.radius,body:geometry==='disk-cylinder'?{radius:disk.bodyRadius,length:disk.bodyLength}:null};
   if(input.mode==='physical')delete input.sigma;
   const numerical={...input,Nc:settings.resolution,extendedResearchDomain:settings.extendedResearchDomain,maxSeconds:settings.maxSeconds};
   for(const key of ['lengthStrategy','maxEvaluations','sigmaTolerance','closure'])if(Object.prototype.hasOwnProperty.call(settings,key))numerical[key]=settings[key];
   result=method==='reference'?AxisymmetricReference.solve(input):settings.resolution===0?await automaticDiskMesh(numerical,settings,hooks):await AxisymmetricForward.solve(numerical,hooks);
  }else throw Error('Unknown geometry.');
  self.postMessage({type:'result',result,fluid});
 }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
