'use strict';
importScripts('fluid-state.js?v=0.1.0','cavitation.js?v=0.3.2','smooth-detachment.js?v=0.1.1','smooth-detachment-adapter.js?v=0.1.0','forward-hydrofoil.js?v=0.1.0','axisymmetric-cavity-c1.js?v=0.3.1-forward','axisymmetric-forward.js?v=0.1.0','axisymmetric-reference.js?v=0.1.0');
self.onmessage=async function(event){
 try{
  const {geometry,method,flow,foil,disk,settings}=event.data;
  const fluid=CavitationFluid.target(flow),hooks={onProgress:row=>self.postMessage({type:'progress',row})};
  let result;
  if(geometry==='hydrofoil'){
   if(method!=='bem')throw Error('The disk correlation cannot represent a hydrofoil.');
   result=await ForwardHydrofoilCavitation.solve({...fluid,chord:foil.chord,geometry:{naca:foil.naca},alpha:foil.alpha,settings},hooks);
  }else if(['disk','disk-cylinder'].includes(geometry)){
   const input={...fluid,diskRn:disk.radius,body:geometry==='disk-cylinder'?{radius:disk.bodyRadius,length:disk.bodyLength}:null};
   if(input.mode==='physical')delete input.sigma;
   result=method==='reference'?AxisymmetricReference.solve(input):await AxisymmetricForward.solve({...input,Nc:settings.resolution,extendedResearchDomain:settings.extendedResearchDomain,maxSeconds:settings.maxSeconds},hooks);
  }else throw Error('Unknown geometry.');
  self.postMessage({type:'result',result,fluid});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
