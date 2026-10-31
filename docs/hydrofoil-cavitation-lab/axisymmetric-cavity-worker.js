'use strict';
importScripts('axisymmetric-cavity-nodal.js?v=0.2.0');
self.onmessage=async function(event){
 try{
  const result=await NodalVortexCavity.solve(event.data,{onProgress:row=>self.postMessage({type:'progress',row})});
  self.postMessage({type:'result',result});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
