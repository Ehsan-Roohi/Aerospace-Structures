/* Off-main-thread print construction; no result meshes or network service. */
importScripts('./engine_bundle.js');
self.onmessage=async event=>{
 try{
  const {default:Module}=await import('./vendor/manifold.js');
  const wasm=await Module({locateFile:file=>new URL('./vendor/'+file,self.location.href).href});wasm.setup();
  const result=await WingPrintMesh.build(event.data,wasm,text=>self.postMessage({kind:'progress',text}));
  result.report.sourceStudy=event.data.sourceStudy;
  for(let i=0;i<result.files.length;i++){const hash=await crypto.subtle.digest('SHA-256',result.files[i].bytes);result.report.modules[i].sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
  self.postMessage({kind:'complete',...result},result.files.map(f=>f.bytes));
 }catch(error){self.postMessage({kind:'error',text:error.message||String(error)});}
};
