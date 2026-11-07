/* Worker: cancellation terminates this worker; no background or duplicate solve. */
importScripts('./flexible_bundle.js?v=9ef32bc96293');
self.onmessage=async e=>{const {id,request}=e.data;try{const result=await WingFlexibleSolver.solve(request,text=>self.postMessage({id,kind:'progress',text}));self.postMessage({id,kind:'complete',result});}catch(error){self.postMessage({id,kind:'error',text:error.message});}};
