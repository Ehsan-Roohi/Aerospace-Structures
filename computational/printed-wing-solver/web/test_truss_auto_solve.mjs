import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const click=s=>$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true})),enter=s=>$(s).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
const flush=()=>new Promise(resolve=>w.queueMicrotask(resolve)),state=()=>w.TrussLab.state(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
let calls=0;const original=w.TrussEngine.solve;w.TrussEngine.solve=(...args)=>{calls++;return original(...args);};
const toggle=on=>{$('#trussAutoSolve').checked=on;$('#trussAutoSolve').dispatchEvent(new w.Event('change'));};
try{
 assert.equal($('#trussAutoSolve').checked,false);assert.ok($('.analysis-actions').contains($('#trussAutoSolve')));
 w.TrussLab.setModel({nodes:[{id:1,x:0,y:0,support:'pin',fx:0,fy:0},{id:2,x:100,y:0,support:'rollerY',fx:100,fy:0}],members:[{a:1,b:2,E:200000,A:100}]});await flush();assert.equal(calls,0);assert.equal(state().result,null);
 toggle(true);await flush();assert.equal(calls,1);near(state().result.members[0].force,100);assert.match($('#status').textContent,/Auto-solved/);
 click('[data-force="2"]');$('#forceX').value='200';$('#forceX').dispatchEvent(new w.Event('input',{bubbles:true}));await flush();assert.equal(calls,1,'unconfirmed input does not solve');near(state().result.members[0].force,100);
 enter('#forceX');assert.equal(state().result,null);await flush();assert.equal(calls,2);near(state().result.members[0].force,200);assert.equal($('#csv').disabled,false);
 toggle(false);click('[data-force="2"]');$('#forceX').value='300';enter('#forceX');await flush();assert.equal(calls,2);assert.equal(state().result,null);click('#solve');assert.equal(calls,3);near(state().result.members[0].force,300);
 toggle(true);await flush();assert.equal(calls,4);click('[data-force="2"]');$('#forceX').value='';enter('#forceX');await flush();assert.equal(calls,4,'invalid input is never submitted to the solver');near(state().model.nodes[1].fx,300);click('#closeForce');
 click('[data-force="2"]');$('#forceX').value='400';enter('#forceX');click('#undo');await flush();assert.equal(calls,5,'rapid edits coalesce into one solve of the final model');near(state().result.members[0].force,300);click('#redo');await flush();near(state().result.members[0].force,400);
 click('[data-restraint="1"] path');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));await flush();assert.equal(state().result,null);assert.equal($('#csv').disabled,true);assert.match($('#status').textContent,/Auto-solve could not complete/);assert.equal($('#status').dataset.error,'true');click('#undo');await flush();assert.ok(state().result);assert.equal($('#status').dataset.error,'false');assert.match($('#stabilityPanel summary').textContent,/Before Solve/);
 click('[data-tool="line"]');$('#lineNodes').value='1,2';$('#lineQ0').value='1';$('#lineQ1').value='1';$('#lineAngle').value='0';$('#lineForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await flush();near(state().result.members[0].force,450);
 click('[data-tool="select"]');w.SVGSVGElement.prototype.createSVGPoint=function(){return{x:0,y:0,matrixTransform(){return{x:this.x,y:this.y};}};};w.SVGSVGElement.prototype.getScreenCTM=()=>({inverse:()=>({})});$('#gridStep').value='0';$('#alignNodes').checked=false;
 let c=$('[data-node="2"] circle'),c1=$('[data-node="1"] circle'),x=+c.getAttribute('cx'),y=+c.getAttribute('cy'),s=(x-(+c1.getAttribute('cx')))/100;const beforeDrag=calls;
 c.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:x,clientY:y}));$('#trussCanvas').dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:x+25*s,clientY:y}));await flush();assert.equal(calls,beforeDrag,'do not solve intermediate drag frames');assert.equal(state().result,null);$('#trussCanvas').dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));await flush();assert.equal(calls,beforeDrag+1);near(state().result.members[0].L,125);
 toggle(false);toggle(true);toggle(false);const stopped=calls;await flush();assert.equal(calls,stopped,'disabling cancels a pending automatic solve');
 w.confirm=()=>true;toggle(true);click('#clear');await flush();assert.equal(state().model.nodes.length,0);assert.equal(state().result,null);assert.equal($('#csv').disabled,true);assert.match($('#status').textContent,/Auto-solve ready/);
 console.log('Truss auto-solve PASS: opt-in, confirmed force edits, manual mode, coalescing, invalid-input refusal, Undo/Redo, unstable-result rejection and recovery, distributed loads, release-only dragging, cancellation and empty model.');
}finally{dom.window.close();}
