// Real generated app/engines; downloads captured rather than saved by a browser.
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import vm from'node:vm';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8'),fixture=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8');
const makeThree=new Function(fixture.slice(fixture.indexOf('function makeThree()'),fixture.indexOf('function openPage('))+'\nreturn makeThree;')();
const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html#wing',runScripts:'outside-only',virtualConsole:new VirtualConsole()}),w=dom.window,ctx=dom.getInternalVMContext(),$=s=>w.document.querySelector(s);
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.setInterval=()=>0;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>null;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.confirm=()=>true;
const blobs=[],downloads=[];w.Blob=Blob;w.URL.createObjectURL=b=>{blobs.push(b);return'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
for(const[,attrs,code]of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)){if(/OrbitControls/.test(attrs))w.THREE=makeThree();continue;}vm.runInContext(code,ctx);}
const tick=()=>new Promise(r=>setTimeout(r,10));async function until(f){const end=Date.now()+60000;while(!f()){assert.ok(Date.now()<end,'timed out');await tick();}}
const ui=()=>w.WingLabUI,solved=()=>ui()?.result()&&!ui().isRunning()&&!ui().isStale(),change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
const exportNow=()=>$('#app [data-wing-action="notebook"]').click();
try{
 await until(solved);exportNow();assert.equal(downloads.length,0);assert.match($('#wingFilesNote').textContent,/300 mm/);
 change('#wgModules',3);exportNow();assert.equal(downloads.length,0);assert.match($('#wingFilesNote').textContent,/Solve/);$('#runBtn').click();await until(solved);
 const before=JSON.stringify(ui().state());exportNow();assert.equal(downloads.at(-1),'MIE446_WingLab_to_Notebook.json');assert.equal(JSON.stringify(ui().state()),before,'export never mutates the study');assert.equal(ui().inputError(),null,'a successful download must never become a solver error');assert.equal($('#stateChip').textContent,'Solved');
 const shell=JSON.parse(await blobs.at(-1).text());assert.equal(shell.workspace,'printed');assert.deepEqual(shell.study.geometry.rodFractions,[]);assert.equal(shell.study.geometry.modules,3);
 $('#wsAdd').click();$('#runBtn').click();await until(solved);exportNow();assert.equal(downloads.length,2);
 const spar=JSON.parse(await blobs.at(-1).text());assert.equal(spar.study.geometry.spars.length,1);assert.equal(spar.study.geometry.spars[0].webThickness,.6);assert.equal(spar.study.geometry.rodFractions.length,0);
 const oldCount=downloads.length;change('#ws0_mE',131000);$('#ws0_apply').click();$('#runBtn').click();await until(solved);exportNow();assert.equal(downloads.length,oldCount);assert.match($('#wingFilesNote').textContent,/same effective PLA/);
 console.log('Wing notebook export PASS: current solved JSON, no state mutation, shell and actual cap/web spar, size/stale/material rejection, downloadable source document.');
}finally{dom.window.close();}
