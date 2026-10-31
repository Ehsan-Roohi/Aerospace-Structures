import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
try{
 assert.equal($('.geometry-row > [data-tool="batch"]'),null);
 assert.equal($('#trussMemberMenu [data-tool="batch"]').textContent,'Select multiple · edit properties');
 assert.equal($('#trussMemberMenu').hidden,true);assert.ok($('.geometry-row > [data-tool="select"]'));
 $('#trussMemberMenuButton').click();assert.equal($('#trussMemberMenu').hidden,false);assert.equal($('#trussMemberMenuButton').getAttribute('aria-expanded'),'true');
 $('#newType').value='cable';$('#trussMemberMenu [data-tool="member"]').click();assert.equal(w.TrussLab.state().tool,'member');assert.equal($('#trussMemberMenu').hidden,true);
 w.TrussLab.setModel({nodes:[{id:1,x:0,y:0,fx:0,fy:0,support:'free'},{id:2,x:100,y:0,fx:0,fy:0,support:'free'}],members:[{a:1,b:2,E:70000,A:10}]});
 $('#trussMemberMenuButton').click();$('#trussMemberMenu [data-tool="batch"]').click();assert.equal(w.TrussLab.state().tool,'batch');assert.equal($('#trussMemberMenu').hidden,true);assert.equal($('#trussBatchEditor').hidden,false);
 $('#batchSelectAll').click();$('#batchA').value='20';$('#trussBatchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(w.TrussLab.state().model.members[0].A,20);w.TrussLab.undo();assert.equal(w.TrussLab.state().model.members[0].A,10);
 $('#trussMemberMenuButton').click();w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal($('#trussMemberMenu').hidden,true);assert.equal(w.document.activeElement,$('#trussMemberMenuButton'));
 $('#trussMemberMenuButton').click();w.document.body.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal($('#trussMemberMenu').hidden,true);
 console.log('Member menu PASS: multi-select hidden from main toolbar; Bar/Cable and draw/group tools accessible; group apply/Undo; outside and Escape dismissal.');
}finally{w.close();}
const base=new URL('../../../docs/',import.meta.url);
for(const [path,expected]of [['truss-lab.html','wing-panel-stress-analyzer/#wing'],['wing-panel-stress-analyzer/truss-lab.html','./#wing']]){
 const html=readFileSync(new URL(path,base),'utf8'),d=new JSDOM(html,{url:'https://ehsan-roohi.github.io/Aerospace-Structures/'+path}).window.document;
 const link=[...d.querySelectorAll('nav a')].find(a=>a.textContent.trim()==='Wing');assert.equal(link.getAttribute('href'),expected);assert.equal(link.href,'https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/#wing');
}
console.log('Wing return routes PASS: root and nested Truss both return to AeroStruct, preserving aerodynamic solver access.');
