/* Background physical geometry and CAD exchange; no result meshes or server. */
importScripts('./engine_bundle.js?v=572807383dd1');
self.onmessage=async event=>{
 try{
  const input=event.data,format=input.exportFormat||'stl';let result;
  if(format==='dxf'){
    const start=Date.now();self.postMessage({kind:'progress',text:'Preparing millimetre DXF planform and rib profiles…'});
    result=WingCADExport.buildDXF(input);result.report.elapsedMs=Date.now()-start;
  }else{
    const {default:Module}=await import('./vendor/manifold.js');
    const wasm=await Module({locateFile:file=>new URL('./vendor/'+file,self.location.href).href});wasm.setup();
    result=await WingPrintMesh.build(input,wasm,text=>self.postMessage({kind:'progress',text}));
    if(format==='step'){
      self.postMessage({kind:'progress',text:'Writing faceted STEP solids; large files can take a moment…'});
      const cad=WingCADExport.buildSTEP(result);result={files:cad.files,report:{...result.report,exportFormat:'step',cad:cad.report}};
    }else if(format!=='stl')throw Error('Choose STL, DXF or STEP.');
  }
  result.report.sourceStudy=input.sourceStudy;result.report.exportFormat=format;result.report.files=[];
  for(let i=0;i<result.files.length;i++){
    const file=result.files[i];if(ArrayBuffer.isView(file.bytes))file.bytes=file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength);
    const hash=await crypto.subtle.digest('SHA-256',file.bytes),sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    result.report.files.push({name:file.name,bytes:file.bytes.byteLength,sha256});
    if(result.report.modules?.[i])result.report.modules[i].sha256=sha256;
    delete file.text;
  }
  self.postMessage({kind:'complete',...result},result.files.map(f=>f.bytes));
 }catch(error){self.postMessage({kind:'error',text:error.message||String(error)});}
};
