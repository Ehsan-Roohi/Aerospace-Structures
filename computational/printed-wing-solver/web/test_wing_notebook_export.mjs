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
 await until(solved);exportNow();assert.equal(downloads.length,1,'one-piece 450 mm analysis can transfer to CAD for printer-fit checking');
 const onePiece=JSON.parse(await blobs.at(-1).text());assert.equal(onePiece.study.geometry.modules,1);assert.equal(onePiece.study.geometry.semiSpan,450);
 $('#app [data-wing-action="load"]').click();const weight=$('.wle-self-weight');assert.ok(weight,'independent weight checkbox in load popup');weight.click();$('#runBtn').click();await until(solved);assert.equal(ui().state().load.selfWeight,true);assert.ok(ui().result().load.gravitySummary.weightN>0);assert.match($('#wingMassReadout').textContent,/Weight/);const weighted=JSON.parse(w.WingStudyIO.exportPrintedStudy(ui().state(),w.WingEngine));assert.equal(weighted.study.load.selfWeight,true);weight.click();$('#runBtn').click();await until(solved);assert.equal(ui().state().load.selfWeight,false);
 change('#wgModules',3);exportNow();assert.equal(downloads.length,1);assert.match($('#wingFilesNote').textContent,/Solve/);$('#runBtn').click();await until(solved);
 const before=JSON.stringify(ui().state());exportNow();assert.equal(downloads.at(-1),'MIE446_WingLab_to_Notebook.json');assert.equal(JSON.stringify(ui().state()),before,'export never mutates the study');assert.equal(ui().inputError(),null,'a successful download must never become a solver error');assert.equal($('#stateChip').textContent,'Solved');
 const shell=JSON.parse(await blobs.at(-1).text());assert.equal(shell.workspace,'printed');assert.deepEqual(shell.study.geometry.rodFractions,[]);assert.equal(shell.study.geometry.modules,3);
 $('#wsAdd').click();$('#runBtn').click();await until(solved);exportNow();assert.equal(downloads.length,3);
 const spar=JSON.parse(await blobs.at(-1).text());assert.equal(spar.study.geometry.spars.length,1);assert.equal(spar.study.geometry.spars[0].webThickness,.6);assert.equal(spar.study.geometry.rodFractions.length,0);
 const oldCount=downloads.length;$('#app [data-wing-action="materials"]').click();$('[data-quick-material="mat-spar"]').click();$('#sparProp0_E').value='131000';[...w.document.querySelectorAll('#pm button')].find(b=>b.textContent==='Apply material').click();$('#runBtn').click();await until(solved);exportNow();assert.equal(downloads.length,oldCount);assert.match($('#wingFilesNote').textContent,/same effective PLA/);
 console.log('Wing notebook export PASS: 450 mm one-piece JSON transfer, no state mutation, shell and actual cap/web spar, stale/material rejection; actual printer fit is deferred to CAD.');
}finally{dom.window.close();}
