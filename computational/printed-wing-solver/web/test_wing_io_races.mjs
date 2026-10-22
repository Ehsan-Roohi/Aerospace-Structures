// Deferred real-format reads: cancellation, supersession and disposal never revive old previews.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const IO=require('./wing_study_io.js'),E=require('./engine.js');
const raw=readFileSync(new URL('../../../tests/fixtures/wing_lab_station_browser.json',import.meta.url),'utf8');
const params=readFileSync(new URL('./wing_parameters_template.json',import.meta.url),'utf8');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
for(const canAbort of [true,false]){
 const dom=new JSDOM('<div id="io"></div>'),w=dom.window,readers=[];let applied=0,presented=0,aborts=0;
 w.FileReader=class{
  readAsArrayBuffer(file){this.file=file;readers.push(this);}
  abort(){aborts++;if(!canAbort)throw Error('Embedded reader cannot abort');this.onabort?.();}
  finish(text=raw){const b=IO.utf8Encode(text);this.result=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);this.onload?.();}
 };
 const m=IO.mount(w.document.querySelector('#io'),{engine:E,workspace:'printed',getState:()=>IO.importPrintedStudy(raw,E).state,applyState:()=>applied++,onPreview:()=>presented++});
 const preview=()=>w.document.querySelector('.wio-preview'),apply=()=>w.document.querySelector('.wio-apply');
 const read=name=>m.openFile({name,size:raw.length});
 try{
  const a=read('cancelled.json'),r0=readers.at(-1);m.cancel();const n=presented;r0.finish();await a;
  ok(preview().hidden,'late cancelled read remains hidden');eq(presented,n,'cancel cannot reopen modal');eq(applied,0);ok(aborts>0,'native read is aborted when available');
  const old=read('older.json'),r1=readers.at(-1),fresh=read('newer.json'),r2=readers.at(-1);r2.finish();await fresh;
  ok(preview().textContent.includes('newer.json'));r1.finish();await old;ok(preview().textContent.includes('newer.json'),'older completion cannot replace newer preview');ok(!preview().textContent.includes('older.json'));
  const staleButton=apply();m.cancel();staleButton.click();eq(applied,0,'detached superseded Apply cannot mutate state');
  const file=read('pending.json'),r3=readers.at(-1);m.openText(raw,'pasted.json');r3.finish();await file;ok(preview().textContent.includes('pasted.json'),'pasted study supersedes read');
  const stalePaste=apply();m.previewParameters(params,'parameters.json');stalePaste.click();eq(applied,0,'parameter preview invalidates old study Apply');ok(preview().textContent.includes('parameters.json'));
  const file2=read('pending-before-parameters.json'),r4=readers.at(-1);m.previewParameters(params,'current-parameters.json');r4.finish();await file2;ok(preview().textContent.includes('current-parameters.json'),'parameter text supersedes read');
  const input=w.document.querySelector('.wio-params input');Object.defineProperty(input,'files',{configurable:true,value:[{name:'parameter-file.json',size:params.length}]});input.dispatchEvent(new w.Event('change'));const rp=readers.at(-1);
  m.openText(raw,'final.json');rp.finish(params);await m.idle();ok(preview().textContent.includes('final.json'),'parameter file cannot overwrite newer text');
  apply().click();eq(applied,1,'current Apply still works');apply()?.click();eq(applied,1,'current Apply is once-only');
  const gone=read('disposed.json'),r5=readers.at(-1),last=presented;m.destroy();r5.finish();await gone;eq(w.document.querySelector('.wio-root'),null);eq(presented,last,'destroyed read cannot present UI');eq(m.openText(raw,'after-destroy.json'),null);eq(m.previewParameters(params),null);
 }finally{dom.window.close();}
}
console.log(`Wing IO races PASS: ${checks} abortable/non-abortable cancellation, file/text/parameter supersession, stale Apply and destruction checks.`);
