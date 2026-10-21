import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const click=s=>$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const enter=s=>$(s).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
try{
 w.TrussLab.setModel({nodes:[{id:1,x:0,y:0,support:'pin',fx:0,fy:0},{id:2,x:100,y:0,support:'rollerY',fx:0,fy:0}],members:[{a:1,b:2,E:200000,A:100}]});
 assert.equal($('#stabilityPanel').tagName,'DETAILS');assert.equal($('#stabilityPanel').open,false);
 click('#solve');assert.ok(w.TrussLab.state().result);
 click('[data-tool="force"]');click('[data-node="2"] circle');
 assert.equal($('#trussLoadEditor').parentElement,w.document.body);assert.equal($('#forceDirection').value,'custom');assert.equal($('#forceComponents').hidden,false);assert.equal($('#forceAdvanced').open,false);assert.equal(w.document.activeElement,$('#forceX'));
 $('#forceX').value='30';$('#forceY').value='-40';const history=w.TrussLab.state().historyLength;enter('#forceX');
 assert.equal($('#trussLoadEditor').hidden,true);assert.equal(w.TrussLab.state().model.nodes[1].fx,30);assert.equal(w.TrussLab.state().model.nodes[1].fy,-40);assert.equal(w.TrussLab.state().result,null);assert.equal($('#csv').disabled,true);assert.equal(w.TrussLab.state().historyLength,history+1);assert.equal($('#stabilityPanel').open,false);
 click('[data-force="2"]');$('#forceY').value='-60';enter('#forceY');assert.equal(w.TrussLab.state().model.nodes[1].fy,-60);
 click('[data-force="2"]');$('#forceY').value='-99';$('#forceY').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal($('#trussLoadEditor').hidden,true);assert.equal(w.TrussLab.state().model.nodes[1].fy,-60);
 click('[data-force="2"]');$('#forceX').value='20';$('#forceY').value='10';enter('#forceY');const applied=w.TrussLab.state().historyLength;enter('#forceY');assert.equal(w.TrussLab.state().historyLength,applied);assert.equal(w.TrussLab.state().model.nodes[1].fy,10);
 click('[data-force="2"]');click('#deleteForce');assert.equal(w.TrussLab.state().model.nodes[1].fx,0);assert.equal(w.TrussLab.state().model.nodes[1].fy,0);assert.equal(w.TrussLab.state().model.nodes.length,2);
 $('#stabilityPanel').open=true;click('#undo');assert.equal($('#stabilityPanel').open,true);
 console.log('Truss force popover PASS: node-anchored body overlay, Fx/Fy default, Enter from either field, close/Escape preserve loads, replacement not accumulation, stale results, selective delete, collapsed guidance persisted.');
}finally{dom.window.close();}
