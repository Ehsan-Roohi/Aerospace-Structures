/* Optional design comparison worker; cancel terminates this isolated solve. */
'use strict';
importScripts('wing-design-advisor-kernel.js?v=ab2d0e39bcb53319','ui/wing-design-advisor.js?v=d7e1188933d19ddc');
self.onmessage=async event=>{
  const {id,state,options}=event.data;
  try{
    const result=await WingDesignAdvisor.run(state,{E:WingEngine,A:WingAeroPanel,U:WingAeroUI,IO:WingStudyIO},
      {...options,progress:p=>self.postMessage({id,type:'progress',...p})});
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',message:error.message});}
};
