// End-to-end DOM/scene-graph test with real engines. Rendering is inert: not WebGL pixel QA.
import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import{createRequire}from'node:module';import vm from'node:vm';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const E=require('./engine.js'),IO=require('./wing_study_io.js');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8'),fixture=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8');
const makeThree=new Function(fixture.slice(fixture.indexOf('function makeThree()'),fixture.indexOf('function openPage('))+'\nreturn makeThree;')();
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,ctx=dom.getInternalVMContext(),$=s=>w.document.querySelector(s);
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.setInterval=()=>0;
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>null;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.confirm=()=>true;
for(const [,attrs,code]of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)){if(/OrbitControls/.test(attrs))w.THREE=makeThree();continue;}vm.runInContext(code,ctx);}
const tick=()=>new Promise(r=>setTimeout(r,10)),ui=()=>w.WingLabUI;
async function until(test,label){const end=Date.now()+60000;while(!test()){assert.ok(Date.now()<end,'timed out: '+label+'; '+errors.join(';'));await tick();}}
try{
 w.dispatchEvent(new w.CustomEvent('wing-learning-stage',{detail:'shell'}));await until(()=>ui().result()&&!ui().isRunning()&&!ui().isStale(),'shell solve');
 assert.equal(ui().state().load.items.length,0);assert.ok($('#wsAdd'));
 $('#wsAdd').click();await tick();await tick();
 assert.equal(ui().state().geometry.spars.length,1);assert.equal(ui().state().geometry.rodFractions.length,0);
 assert.equal(ui().view().members.sparParts,3,'caps and web preview before Solve');assert.equal(ui().view().preview,true);
 assert.ok(ui().isStale());assert.match($('#wingSparResults').textContent,/geometry preview only/);
 const solve=async()=>{await ui().solve();await until(()=>!ui().isRunning()&&!ui().isStale(),'spar solve');};
 await solve();assert.ok(ui().result().sparModel);assert.equal(ui().result().stress.spars.length,ui().result().sections.length*3);
 const stamp=JSON.stringify(ui().state()),compare=[...$('#wingSparResults').querySelectorAll('button')].find(b=>b.textContent.includes('Compare shell'));
 assert.equal(compare.disabled,false,'comparison is enabled after Solve completes');
 compare.click();await until(()=>$('#wsCompareTable table'),'three-layout comparison');
 assert.equal($('#wsCompareTable tbody').children.length,3);assert.equal(JSON.stringify(ui().state()),stamp,'comparison must not replace the live model');
 assert.match($('#wsCompareTable').textContent,/not equal-mass/);
 assert.equal(ui().result().load.items.length,0);assert.ok(ui().result().stress.spars.every(v=>v.shear===0&&v.tension===0&&v.compression===0));
 $('#ws0_length').value='250';$('#ws0_mE').value='3000';$('#ws0_apply').click();await tick();await tick();
 assert.equal(ui().state().geometry.spars[0].length,250);assert.equal(ui().view().members.sparParts,3);await solve();
 assert.equal(ui().result().geometry.spars[0].material.E,3000);
 $('#wingShellMaterial').click();assert.ok($('#pnu')&&$('#prho'));
 $('#pnu').value='.29';$('#pnu').dispatchEvent(new w.Event('change',{bubbles:true}));$('#prho').value='1.3';$('#prho').dispatchEvent(new w.Event('change',{bubbles:true}));
 await solve();assert.equal(ui().result().pla.nu,.29);assert.equal(ui().result().pla.rho,1.3);
 const text=IO.exportPrintedStudy(ui().state(),E),saved=IO.importPrintedStudy(text,E);assert.equal(saved.ok,true,JSON.stringify(saved.errors));
 const model=IO.printedEngineInput(saved.state,E);assert.equal(model.geometry.spars.length,1);assert.equal(model.geometry.spars[0].material.E,3000);assert.equal(model.pla.nu,.29);assert.equal(model.pla.rho,1.3);
 const previous=JSON.stringify(ui().state().geometry);$('#ws0_webThickness').value='100';$('#ws0_apply').click();await tick();assert.equal(JSON.stringify(ui().state().geometry),previous,'invalid spar edit atomic');
 $('#wsRods').click();await tick();await tick();assert.equal(ui().state().geometry.spars.length,0);assert.equal(ui().state().geometry.rodFractions.length,2);assert.equal(ui().view().members.sparParts,0);
 assert.equal(ui().state().load.items.length,0,'structure changes do not create or replace loads');
 assert.deepEqual(errors,[]);console.log('Bonded spar UI: three-part live preview, independent material/dimensions, partial length, zero defaults, save/import, atomic rejection and structural alternatives PASS (DOM scene graph; not WebGL pixels).');
}finally{dom.window.close();}
