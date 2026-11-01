'use strict';
importScripts('axisymmetric-cavity-c1.js?v=0.3.0-reviewed');
self.onmessage=async function(event){
 try{
  const result=await CurvedVortexCavity.solve(event.data,{onProgress:row=>self.postMessage({type:'progress',row})});
  self.postMessage({type:'result',result});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
