import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const html=readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8');const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
w.confirm=()=>true;let downloads=[];w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
const ctx=dom.getInternalVMContext();for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
try{
 assert.equal(w.TrussLab.state().model.nodes.length,0);$('#example').click();assert.equal(w.TrussLab.state().model.nodes.length,4);$('#solve').click();assert.ok(w.TrussLab.state().result);assert.equal($('#csv').disabled,false);assert.ok(!/NaN|undefined|Infinity/.test($('#trussCanvas').innerHTML));
 $('#csv').click();$('#image').click();assert.deepEqual(downloads,['truss-results.csv','truss-model.svg']);
 $('#trussCanvas [data-member="0"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(w.TrussLab.state().model.members.length,4);assert.equal(w.TrussLab.state().result,null);assert.equal($('#csv').disabled,true);assert.equal($('#results').textContent,'');
 $('#solve').click();assert.equal(w.TrussLab.state().result,null);assert.match($('#status').textContent,/singular|Mechanism/);
 $('#trussCanvas [data-node="1"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 $('#editForm [name="x"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(w.TrussLab.state().model.nodes.length,4,'typing Delete does not delete geometry');
 $('#deleteSelected').click();assert.equal(w.TrussLab.state().model.nodes.length,3);assert.ok(w.TrussLab.state().model.members.every(m=>m.a!==1&&m.b!==1));
 $('#clear').click();assert.equal(w.TrussLab.state().model.nodes.length,0);
 console.log('Truss UI PASS: empty startup, explicit example, solve, SVG/CSV actions, member/node Delete, text-field protection, stale-result removal, mechanism rejection, connected-member removal and clear.');
}finally{dom.window.close();}
