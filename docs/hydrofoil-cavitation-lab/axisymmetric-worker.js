importScripts('axisymmetric.js?v=0.1.0');
self.onmessage=function(e){try{self.postMessage({type:'progress',message:'Integrating 3-D source rings and solving no penetration…'});const result=AxisymmetricBEM.solve(e.data);self.postMessage({type:'result',result});}catch(error){self.postMessage({type:'error',message:error.message});}};
