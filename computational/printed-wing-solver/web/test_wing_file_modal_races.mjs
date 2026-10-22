// Actual built-app host wiring: ×, Escape and leaving the workspace cancel deferred reads.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8'),harness=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8'),raw=readFileSync(new URL('../../../tests/fixtures/wing_lab_station_browser.json',import.meta.url),'utf8');
const makeThree=new Function(harness.slice(harness.indexOf('function makeThree()'),harness.indexOf('function openPage('))+'\nreturn makeThree;')();
let checks=0;const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};
for(const canAbort of [true,false]){
 const errors=[],readers=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html#beam',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,$=s=>w.document.querySelector(s);
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.setInterval=()=>0;w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>null;w.ResizeObserver=class{observe(){}disconnect(){}};
 w.FileReader=class{readAsArrayBuffer(){readers.push(this);}abort(){if(!canAbort)throw Error('No abort');this.onabort?.();}finish(){const b=new TextEncoder().encode(raw);this.result=b.buffer;this.onload?.();}};
 try{
  for(const[,attrs,code]of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)){if(/OrbitControls/.test(attrs))w.THREE=makeThree();continue;}vm.runInContext(code,dom.getInternalVMContext());}
  const files=w.WingLabUI.studyFiles(),before=JSON.stringify(w.WingLabUI.engineInput()),popup=()=>$('.wing-file-pop');
  for(const close of ['cross','escape','workspace']){
   const pending=files.openFile({name:close+'.json',size:raw.length}),reader=readers.at(-1);ok(!popup().hidden,'reading opens actual visible popup');ok(popup().textContent.includes('Reading '+close));
   if(close==='cross')popup().querySelector('.wing-editor-close').click();
   else if(close==='escape')popup().dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
   else w.dispatchEvent(new w.CustomEvent('beam-show'));
   ok(popup().hidden,close+' closes popup');reader.finish();await pending;ok(popup().hidden,close+' cannot be undone by late FileReader');eq(JSON.stringify(w.WingLabUI.engineInput()),before,'closing never applies an old file');ok($('#wingStudyFiles .wio-preview').hidden);
  }
  // Moving the same real file panel from Reading to successful preview must
  // not fire the close hook and accidentally cancel its own Apply button.
  const success=files.openFile({name:'current.json',size:raw.length});readers.at(-1).finish();await success;ok(!popup().hidden);ok($('#wingStudyFiles .wio-apply'));
  $('#wingStudyFiles .wio-apply').click();ok(popup().hidden);eq(w.WingLabUI.state().geometry.sweepDeg,JSON.parse(raw).study.geometry.sweepDeg);ok($('#wingSessionStatus').textContent.includes('Opened current.json'),'successful Apply keeps success, not cancellation status');
  eq(errors.length,0,errors.join('; '));
 }finally{dom.window.close();}
}
console.log(`Wing file modal races PASS: ${checks} actual-app ×/Escape/workspace cancellation, non-abortable late completion, self-preview transition and Apply checks.`);
