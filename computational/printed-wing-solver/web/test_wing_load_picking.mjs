// Real app/controller + engines, deterministic scene hit. Browser QA covers rendered WebGL separately.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8'),fixture=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8');
const makeThree=new Function(fixture.slice(fixture.indexOf('function makeThree()'),fixture.indexOf('function openPage('))+'\nreturn makeThree;')();
let enabled=false,calls=0,lastObjects=[],wanted=0;const rays=[];
class Raycaster{constructor(){this.params={Line:{threshold:1}};rays.push(this);}setFromCamera(){}intersectObjects(objects,recursive){if(objects.some(o=>Number.isInteger(o.userData?.wingLoadIndex))){calls++;lastObjects=objects;}const tagged=[];for(const object of objects)object.traverse(o=>{if(o.userData?.wingLoadIndex===wanted)tagged.push(o);});return enabled&&tagged.length?[{object:tagged[0]}]:[];}}
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html#wing',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,$=s=>w.document.querySelector(s),ctx=dom.getInternalVMContext();
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.setInterval=()=>0;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>null;w.ResizeObserver=class{observe(){}disconnect(){}};
for(const[,attrs,code]of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)){if(/OrbitControls/.test(attrs)){const base=makeThree();w.THREE=new Proxy(base,{get:(t,k)=>k==='Raycaster'?Raycaster:Reflect.get(t,k)});}continue;}vm.runInContext(code,ctx);}
const wait=async f=>{const end=Date.now()+60000;while(!f()){assert.ok(Date.now()<end,errors.join('; '));await new Promise(r=>setTimeout(r,20));}},ui=()=>w.WingLabUI,pop=()=>$('.wing-editor-pop[aria-labelledby="appEditorTitle"]'),submit=()=>$('#wingLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const pointer=(type,x=30)=>$('#gl').dispatchEvent(new w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:40}));
try{
 await wait(()=>ui()?.result()&&!ui().isRunning()&&!ui().isStale());
 for(const force of [2,3]){$('#app [data-wing-action="load"]').click();$('#wingP').value=force;$('#wingA').value=force===2?225:350;submit();await ui().solve();await wait(()=>!ui().isRunning()&&!ui().isStale());}
 assert.equal(ui().state().load.items.length,2);wanted=1;enabled=true;const before=calls;
 pointer('pointerdown');pointer('pointermove',60);pointer('pointerup',60);assert.equal(calls,before,'orbit drag never ray-selects a load');assert.equal(pop().hidden,true);
 pointer('pointerdown');pointer('pointercancel');pointer('pointerup');assert.equal(calls,before);
 pointer('pointerdown');pointer('pointerup');assert.equal(pop().hidden,false);assert.equal(+$('#wingP').value,3,'arrow targets the second force, not the first');assert.equal($('#wingLoadForm button[type="submit"]').textContent,'Apply changes');assert.ok(lastObjects.some(o=>o.userData.wingLoadIndex===1));assert.equal(rays[0].params.Line.threshold,1,'load picking restores the shared line tolerance');
 $('#wingP').value=4;submit();assert.equal(ui().state().load.items.length,2);assert.equal(ui().state().load.items[0].force,2);assert.equal(ui().state().load.items[1].force,4);assert.equal(pop().hidden,true);
 assert.deepEqual(errors,[]);console.log('Wing load selection PASS: actual tagged scene arrows, selective second-force editing, replacement not duplication, drag/cancel guards and restored raycast settings.');
}finally{dom.window.close();}
