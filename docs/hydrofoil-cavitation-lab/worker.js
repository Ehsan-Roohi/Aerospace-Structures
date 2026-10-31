'use strict';
importScripts('cavitation.js?v=0.3.2', 'smooth-detachment.js?v=0.1.1', 'smooth-detachment-adapter.js?v=0.1.0');
self.onmessage=function(e){
  let iterator;
  try{
    const {detachmentMode='fixed',...input}=e.data;
    if(!['fixed','smooth-bv'].includes(detachmentMode))throw Error('Unknown detachment method.');
    if(detachmentMode==='smooth-bv'){
      if(input.resolution<48||input.closureMode!=='smooth-contact')throw Error('Use Smooth contact and resolution 48 or higher for automatic detachment.');
      iterator=HydrofoilSmoothDetachment.iterate(input,{xdMax:Math.min(.15,.85-input.length)});
    }else iterator=HydrofoilCavitation.iterate(input);
  }catch(error){self.postMessage({type:'error',message:error.message});return;}
  function advance(){
    try{
      const step=iterator.next();
      if(step.done)self.postMessage({type:'result',result:step.value});
      else{self.postMessage({type:'progress',row:step.value});setTimeout(advance,0);}
    }catch(error){self.postMessage({type:'error',message:error.message});}
  }
  advance();
};
