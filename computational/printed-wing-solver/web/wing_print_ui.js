/* Download physical STL from a snapshotted, solved study; CAD runs in a Worker. */
const WingPrintUI=(()=>{
 'use strict';
 const encoder={encode:text=>new TextEncoder().encode(text)};
 const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 function zip(files){
  const chunks=[],central=[];let offset=0,centralSize=0;
  for(const file of files){const name=encoder.encode(file.name),bytes=new Uint8Array(file.bytes),sum=crc(bytes),local=new Uint8Array(30+name.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,0x21,true);l.setUint32(14,sum,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);local.set(name,30);chunks.push(local,bytes);
   const record=new Uint8Array(46+name.length),v=new DataView(record.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);v.setUint32(16,sum,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);record.set(name,46);central.push(record);centralSize+=record.length;offset+=local.length+bytes.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
 }
 function mount({host,getInput,workerURL,documentRef=globalThis.document,WorkerClass=globalThis.Worker,onSymmetryChange=()=>{}}){
  const doc=documentRef,node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=node('button','Download STL','btn primary');button.type='button';button.id='wingDownloadSTL';const symmetry=node('label',null,'wing-print-symmetry'),fullWing=node('input');fullWing.type='checkbox';fullWing.id='wingFullSymmetric';symmetry.append(fullWing,doc.createTextNode(' Full wing · mirror'));const symmetryNote=node('span','Symmetric results: same loads and root clamp on both halves.');symmetryNote.id='wingSymmetryNote';symmetryNote.hidden=true;symmetry.title='Mirror the designed semi-wing across its root. Results reflect the original clamped semi-wing under symmetric loads and supports. Printed modules 1 joins both halves into one STL; 2/3 produces 4/6 pieces for assembly. The full one-piece wing must fit the 300 mm printer.';host.append(symmetry,button,symmetryNote);fullWing.onchange=()=>{symmetryNote.hidden=!fullWing.checked;onSymmetryChange(fullWing.checked);};
  const panel=node('section',null,'wing-print-dialog');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','wingPrintTitle');const title=node('h3','Printable STL');title.id='wingPrintTitle';
  const close=node('button','×','btn wing-print-close');close.type='button';close.setAttribute('aria-label','Close STL builder');const status=node('p');status.id='wingPrintStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');const details=node('div');details.id='wingPrintDetails';panel.append(title,close,status,details);doc.body.append(panel);
  const style=node('style');style.textContent='.wing-print-dialog{position:fixed;z-index:300;right:12px;top:90px;width:min(580px,calc(100vw - 24px));max-height:calc(100dvh - 110px);overflow:auto;padding:16px;background:var(--panel,#fff);color:var(--fg,#17202c);border:2px solid var(--accent,#0875d1);border-radius:12px;box-shadow:0 12px 40px #10203040}.wing-print-dialog[hidden]{display:none}.wing-print-dialog h3{margin:0 44px 12px 0}.wing-print-close{position:absolute;right:8px;top:8px}.wing-print-dialog table{width:100%;font-size:13px}.wing-print-dialog th,.wing-print-dialog td{text-align:left;padding:5px;border-bottom:1px solid var(--line,#ccd)}.wing-print-dialog .btn{margin:5px 5px 0 0;min-height:40px}.wing-print-symmetry{display:inline-flex;align-items:center;gap:5px;padding:6px;font-weight:600}.wing-print-symmetry input{width:18px;height:18px}#wingSymmetryNote{font-size:12px;color:var(--muted)}#wingPrintStatus[data-error=true]{color:var(--bad,#ba2635)}';doc.head.append(style);
  let worker=null,returnFocus=null,output=null,fitRecord=null;try{fitRecord=JSON.parse(doc.defaultView.localStorage.getItem('winglab:print-fit-record'));}catch{}
  const release=()=>{worker?.terminate();worker=null;button.disabled=false;};
  const download=(blob,name)=>{const url=doc.defaultView.URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;doc.body.append(a);a.click();a.remove();doc.defaultView.setTimeout(()=>doc.defaultView.URL.revokeObjectURL(url),2000);};
  const fail=text=>{release();output=null;status.dataset.error='true';status.textContent=text;};
  const currentInput=()=>({...getInput(),fullWing:fullWing.checked});
  const key=input=>JSON.stringify([input.geometry,input.density,input.shellMaterial,input.fullWing]);
  close.onclick=()=>{if(worker){release();status.textContent='Build cancelled. No file exported.';}panel.hidden=true;returnFocus?.focus({preventScroll:true});};
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.click();}if(e.key==='Tab'){const focusable=[...panel.querySelectorAll('button,a[href]')].filter(n=>!n.disabled),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}}});
  button.onclick=()=>{
   returnFocus=button;panel.hidden=false;close.focus();details.replaceChildren();status.dataset.error='false';output=null;let input;
   try{input=currentInput();}catch(e){fail(e.message);return;}
   if(input.geometry.rodFractions?.length){
    const g=input.geometry,signature=JSON.stringify([g.rodDiameter,g.clearance,g.sleeveWall,input.shellMaterial?.name]);
    if(!fitRecord||fitRecord.signature!==signature||fitRecord.tested!==true){
     status.textContent=`Rod-fit record required · rod diameter ${g.rodDiameter} mm; radial clearance ${g.clearance} mm; sleeve wall ${g.sleeveWall} mm. Use your actual completed coupon test.`;
     const label=node('label','Coupon ID / team revision '),reference=node('input');reference.id='wingPrintFitReference';reference.type='text';reference.maxLength=120;label.append(reference);
     const confirm=node('label'),checkbox=node('input');checkbox.type='checkbox';checkbox.id='wingPrintFitConfirmed';confirm.append(checkbox,doc.createTextNode(' I physically tested this rod/coupon and confirmed the fit using these settings and the same print process.'));
     const proceed=node('button','Confirm fit record & build STL','btn primary');proceed.type='button';proceed.onclick=()=>{if(!reference.value.trim()||!checkbox.checked){status.textContent='Enter the coupon reference and confirm the actual physical fit test. A numerical result does not replace it.';return;}fitRecord={signature,reference:reference.value.trim(),tested:true,rodDiameter:g.rodDiameter,clearance:g.clearance,sleeveWall:g.sleeveWall};try{doc.defaultView.localStorage.setItem('winglab:print-fit-record',JSON.stringify(fitRecord));}catch{}button.click();};details.append(label,node('p'),confirm,node('p'),proceed);reference.focus();return;
    }
    input.fitRecord=fitRecord;
   }

   if(doc.defaultView.location.protocol==='file:'){fail('For direct STL export, open Wing Lab from the course website rather than a downloaded HTML file.');return;}
   if(!WorkerClass){fail('This browser does not support background CAD construction. Open Wing Lab in an updated browser.');return;}
   const stamp=key(input),name=(input.projectName||'Wing').normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,70)||'Wing';button.disabled=true;status.textContent='Preparing the CAD kernel…';
   try{worker=new WorkerClass(workerURL);}catch(e){fail('Cannot start the STL builder: '+e.message);return;}
   worker.onerror=e=>fail('STL builder could not run. Reload the page and try again. '+(e.message||''));
   worker.onmessage=event=>{
    const data=event.data;if(data.kind==='progress'){status.textContent=data.text;return;}if(data.kind==='error'){fail(data.text);return;}if(data.kind!=='complete')return;
    try{if(key(currentInput())!==stamp)throw Error('Inputs changed during construction. Solve the updated study and create STL again.');}catch(e){fail(e.message);return;}release();
    const report=data.report;status.textContent=`Ready · ${report.fullWing?'Full symmetric wing':'Semi-wing'} · ${report.printedMassG.toFixed(1)} g printed plastic · ${report.modules.length} module(s) · ${(report.elapsedMs/1000).toFixed(1)} s. Watertight STL and printer-envelope checks passed.`;
    const table=node('table'),head=node('tr');for(const label of ['Module','Dimensions (mm)','Triangles'])head.append(node('th',label));table.append(head);report.modules.forEach(m=>{const row=node('tr');for(const text of [String(m.module),m.sizeMm.map(x=>x.toFixed(1)).join(' × '),String(m.triangles)])row.append(node('td',text));table.append(row);});details.append(table,node('p','Import into OrcaSlicer in millimetres. Inspect orientation, supports, brim and every layer. These checks do not certify structural strength.'));
    const record=encoder.encode(JSON.stringify(report,null,2));
    output=data.files.length===1?{blob:new Blob([data.files[0].bytes],{type:'model/stl'}),name:name+(input.fullWing?'_full_wing':'')+'.stl'}:{blob:zip([...data.files,{name:'print_record.json',bytes:record.buffer}]),name:name+(input.fullWing?'_full_wing':'')+'_STL.zip'};
    const again=node('button','Download again','btn primary');again.type='button';again.onclick=()=>download(output.blob,output.name);const save=node('button','Save print record','btn');save.type='button';save.onclick=()=>download(new Blob([record],{type:'application/json'}),name+'_print_record.json');details.append(again,save);download(output.blob,output.name);
   };
   worker.postMessage(input);
  };
  return {button,panel,fullWing,cancel:()=>close.click()};
 }
 return{mount,zip};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingPrintUI;
