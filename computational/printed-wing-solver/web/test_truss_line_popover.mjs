import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const enter=()=>$('#lineQ1').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
try{
 w.TrussLab.setModel({nodes:[{id:1,x:0,y:0,support:'pin',fx:0,fy:0},{id:2,x:100,y:0,support:'rollerY',fx:0,fy:0}],members:[{a:1,b:2,E:200000,A:100}]});
 $('.workspace-toolbar [data-tool="line"]').click();const pop=$('#trussLineEditor');assert.equal(pop.hidden,false);assert.equal(pop.parentElement,w.document.body);assert.equal(pop.getAttribute('role'),'dialog');
 $('#lineNodes').value='1, 2';$('#lineQ0').value='1';$('#lineQ1').value='1';enter();assert.equal(pop.hidden,true);assert.equal(w.TrussLab.state().model.lineLoads.length,1);assert.equal(w.TrussLab.state().result,null);
 $('[data-edit-line="0"]').click();$('#lineQ1').value='2';enter();assert.equal(w.TrussLab.state().model.lineLoads.length,1,'edit replaces the selected path');assert.equal(w.TrussLab.state().model.lineLoads[0].qEnd,2);
 $('[data-edit-line="0"]').click();$('#lineQ1').value='9';$('#lineQ1').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(pop.hidden,true);assert.equal(w.TrussLab.state().model.lineLoads[0].qEnd,2);
 $('[data-edit-line="0"]').click();$('#lineNodes').value='1';enter();assert.equal(pop.hidden,false,'invalid input keeps editor open');assert.equal(w.TrussLab.state().model.lineLoads[0].nodes.length,2);
 $('#closeLine').click();$('#undo').click();assert.equal(w.TrussLab.state().model.lineLoads[0].qEnd,1);
 console.log('Truss distributed popover PASS: compact body-level dialog, Enter add/edit without duplication, invalid-input retention, Esc cancellation and Undo.');
}finally{dom.window.close();}
