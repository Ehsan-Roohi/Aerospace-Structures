import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
try{
 const manual=$('#manual'),actions=$('.analysis-actions'),toolbar=$('.workspace-toolbar');
 assert.ok($('.manual-bar').contains(manual));assert.ok(actions.contains($('#solve')));assert.ok(actions.contains($('#clear')));assert.equal(manual.contains(actions),false,'analysis buttons must not toggle the manual');
 assert.equal(toolbar.contains($('#solve')),false);assert.equal(toolbar.contains($('#clear')),false);
 const rows=[...toolbar.children].filter(e=>!e.matches('input[type="hidden"]'));assert.equal(rows.length,3);assert.equal(rows[0],$('.geometry-row'));assert.equal(rows[1],$('.load-row'));assert.equal(rows[2],$('.truss-file-tools'));
 assert.equal(rows[2].getAttribute('aria-label'),'Truss study files');assert.deepEqual([...rows[2].querySelectorAll('button')].map(e=>e.id),['trussOpenJson','trussSaveJson']);assert.equal($('#trussJsonFile').type,'file');assert.equal($('#trussJsonFile').hidden,true);assert.equal($('#trussFileStatus').getAttribute('role'),'status');
 assert.deepEqual([...$('.geometry-row').children].map(e=>e.dataset.tool||e.className),['node','member','member-type-control','select','batch','tools support-tools']);
 assert.equal($('#newType').closest('.geometry-row'),$('.geometry-row'));
 assert.deepEqual([...$('.support-tools').children].map(e=>e.querySelector('button')?.dataset.tool||e.textContent.trim()),['SUPPORTS','pin','roller','Clear all supports']);
 assert.deepEqual([...$('.load-row').children].map(e=>e.id||e.dataset.tool||e.className),['tools load-start','line','clearLoads','tools history-tools','selectionHelp']);
 assert.equal($('#drawingHelp'),null);assert.match($('#selectionHelp').textContent,/bilateral/);assert.match($('#selectionHelp').textContent,/Grid Off/);
 assert.equal($('#clearSupports').closest('aside'),null,'clear supports belongs above the drawing, not in the sidebar');
 assert.ok($('.load-row').contains($('#clearLoads')));assert.ok($('.load-row').contains($('#selectionHelp')));assert.ok($('.load-start').querySelector('[data-tool="force"]'));assert.ok($('.load-row').querySelector('[data-tool="line"]'));
 w.confirm=()=>true;$('#example').click();$('#solve').click();assert.ok(w.TrussLab.state().result);assert.equal(manual.open,false);
 $('#clear').click();assert.equal(w.TrussLab.state().model.nodes.length,0);assert.equal(manual.open,false);$('#undo').click();assert.equal(w.TrussLab.state().model.nodes.length,4);
 $('[data-tool="pin"]').click();assert.equal($('#pinMenu').hidden,false);assert.equal($('#rollerMenu').hidden,true);
 $('[data-tool="roller"]').click();assert.equal($('#rollerMenu').hidden,false);assert.equal($('#pinMenu').hidden,true);
 console.log('Truss toolbar PASS: separate top analysis actions, geometry before grouped supports, dedicated loads row, independent manual, Solve/Clear/Undo and support menus preserved.');
}finally{dom.window.close();}
