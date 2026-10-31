importScripts('cavitation.js?v=0.3.0');
self.onmessage=function(e){
  try{
    const iterator=HydrofoilCavitation.iterate(e.data);let step;
    do{step=iterator.next();if(!step.done)self.postMessage({type:'progress',row:step.value});}while(!step.done);
    self.postMessage({type:'result',result:step.value});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
