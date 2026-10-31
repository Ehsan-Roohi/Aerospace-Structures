import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const click=s=>$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:1})),submit=()=>$('#trussBatchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const node=(id,x,y,support='free')=>({id,x,y,support,fx:0,fy:0});
try{
 assert.ok($('.geometry-row').contains($('#newType')),'choose member type beside drawing tools');
 assert.equal(w.document.querySelectorAll('#newType').length,1);
 w.TrussLab.setModel({nodes:[node(1,0,0),node(2,1000,0),node(3,500,500)],members:[]});
 $('#newType').value='cable';click('[data-tool="member"]');
 // Keyboard placement is immediate and uses the same drawing tool as pointer placement.
 for(const id of [1,2])$(`[data-node="${id}"]`).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(w.TrussLab.state().model.members[0].type,'cable');
 $('#newType').value='bar';$('#newType').dispatchEvent(new w.Event('change'));
 for(const id of [2,3])$(`[data-node="${id}"]`).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(w.TrussLab.state().model.members[1].type,'bar');
 const before=w.TrussLab.state();click('[data-tool="batch"]');
 click('[data-node="1"] circle');click('[data-node="2"] circle');
 assert.match($('#trussBatchSummary').textContent,/2 nodes selected · 1 member/);
 assert.equal($('#selectionDialog').open,false);
 w.TrussLab.redo(); // No forward history: the current group selection must remain available.
 $('#batchA').value='55';$('#batchE').value='70000';submit();
 let after=w.TrussLab.state();assert.equal(after.model.members[0].A,55);assert.equal(after.model.members[0].E,70000);assert.equal(after.model.members[0].type,'cable');assert.equal(after.model.members[1].A,before.model.members[1].A);assert.deepEqual(after.model.nodes,before.model.nodes);
 assert.equal(after.historyIndex,before.historyIndex+1,'batch is one undoable edit');
 const stable=JSON.stringify(after.model),history=after.historyIndex;$('#batchA').value='0';submit();
 assert.equal(JSON.stringify(w.TrussLab.state().model),stable);assert.equal(w.TrussLab.state().historyIndex,history);assert.equal($('#trussBatchMessage').dataset.error,'true');
 w.TrussLab.undo();assert.deepEqual(w.TrussLab.state().model,before.model);
 click('[data-tool="batch"]');click('[data-member="1"] path');$('#batchA').value='80';$('#batchE').value='';$('#batchType').value='cable';submit();
 assert.equal(w.TrussLab.state().model.members[1].A,80);assert.equal(w.TrussLab.state().model.members[1].type,'cable');assert.notEqual(w.TrussLab.state().model.members[0].A,80);
 click('#batchDone');assert.equal($('#trussBatchEditor').hidden,true);
 // An edited area reaches the actual axial stiffness solution, not just the label.
 const n2=node(2,1000,0,'rollerY');n2.fx=10;
 w.TrussLab.setModel({nodes:[node(1,0,0,'pin'),n2],members:[{a:1,b:2,E:200000,A:100,type:'bar'}]});
 click('[data-tool="batch"]');click('#batchSelectAll');$('#batchA').value='200';$('#batchType').value='';submit();click('#solve');
 assert.ok(Math.abs(w.TrussLab.state().result.nodes[1].ux-.00025)<1e-12);
 const saved=w.TrussLab.exportText();assert.equal(w.TrussLab.importText(saved,'batch.json'),true);assert.equal(w.TrussLab.state().model.members[0].A,200);assert.equal($('#trussBatchEditor').hidden,true);assert.equal(w.TrussLab.state().result,null);
 console.log('Truss batch PASS: Bar/Cable creation, pointer and keyboard selection, member scope, atomic validation, one-step Undo, stiffness response and JSON round trip.');
}finally{dom.window.close();}
