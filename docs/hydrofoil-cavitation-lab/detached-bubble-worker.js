'use strict';
importScripts('detached-bubble.js?v=0.1.0');
self.onmessage=e=>{
 const p=e.data,start=Date.now();
 try{
  if(![16,32,64].includes(p.panels)||![100,200,400].includes(p.steps)||!Number.isFinite(p.duration)||p.duration<=0||p.duration>.65||!Number.isFinite(p.gasRatio)||p.gasRatio<0||p.gasRatio>2||!Number.isFinite(p.kappa)||p.kappa<1||p.kappa>1.67)throw Error('Unsupported dynamics inputs.');
  const B=DetachedBubbleBEM,physics={density:1,pInfinity:1,pVapour:0,pGas0:p.gasRatio,polytropicExponent:p.kappa,surfaceTension:0,gravity:0},dt=p.duration/p.steps;
  let state=B.createState({radius:1,nPanels:p.panels}),g=B.geometry(state.mesh);
  const history=[{time:0,volume:g.volume,equivalentRadius:g.equivalentRadius,maxBoundaryResidual:0,gasPressure:p.gasRatio}],snapshots=[{time:0,mesh:state.mesh,phi:state.phi}],every=Math.max(1,Math.floor(p.steps/50));let reason=null,completed=0;
  for(let i=0;i<p.steps;i++){
   try{state=B.advanceBubble(state,dt,physics,{quadratureOrder:16});}catch(err){reason=err.message;break;}
   completed=i+1;history.push(state.diagnostics);
   if(completed%every===0||completed===p.steps)snapshots.push({time:state.time,mesh:state.mesh,phi:state.phi});
   if(completed%10===0)self.postMessage({type:'progress',completed,total:p.steps,time:state.time});
  }
  if(snapshots.at(-1).time!==state.time)snapshots.push({time:state.time,mesh:state.mesh,phi:state.phi});
  self.postMessage({type:'result',result:{schema:'detached-bubble-bem-result',version:1,solverVersion:B.VERSION,scope:'Isolated initially spherical bubble; unbounded inviscid incompressible liquid; no hydrofoil/cloud shedding',inputs:p,physics,status:reason?'stopped':'completed',reason,completedSteps:completed,history,snapshots,seconds:(Date.now()-start)/1000,units:{length:'R0',time:'R0*sqrt(rho/(pInfinity-pVapour))',volume:'R0^3',gasPressure:'pInfinity-pVapour'}}});
 }catch(err){self.postMessage({type:'error',message:err.message});}
};
