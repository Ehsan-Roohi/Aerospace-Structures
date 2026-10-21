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
 $('#solve').click();assert.equal(w.TrussLab.state().result,null);assert.match($('#status').textContent,/^Mechanism:.*Details below drawing/);assert.match($('#stabilityPanel').textContent,/failure.*internal infinitesimal mechanism/s);assert.match($('#stabilityPanel').textContent,/N1/);
 $('#trussCanvas [data-node="1"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 $('#editForm [name="x"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(w.TrussLab.state().model.nodes.length,4,'typing Delete does not delete geometry');
 $('#deleteSelected').click();assert.equal(w.TrussLab.state().model.nodes.length,3);assert.ok(w.TrussLab.state().model.members.every(m=>m.a!==1&&m.b!==1));
 $('#clear').click();assert.equal(w.TrussLab.state().model.nodes.length,0);assert.match($('#stabilityPanel').textContent,/Before Solve/);
 const unsupported={nodes:[[1,175,625],[2,1000,625],[3,1000,100],[4,175,100]].map(([id,x,y])=>({id,x,y,support:'free',fx:id===4?1000:0,fy:id===1?-1000:id===2?-2000:id===3?1000:0})),members:[[1,2],[2,3],[3,4],[4,1],[1,3],[2,4]].map(([a,b])=>({a,b,E:70000,A:100}))};w.TrussLab.setModel(unsupported);assert.match($('#stabilityPanel').textContent,/No supports are assigned.*Choose Pin/s);const before=JSON.stringify(w.TrussLab.state().model);$('#solve').click();assert.equal(JSON.stringify(w.TrussLab.state().model),before,'diagnostics never alter supports, geometry or loads');assert.match($('#stabilityPanel').textContent,/external restraint rank 0\/3/);assert.equal($('#csv').disabled,true);w.TrussLab.undo();assert.match($('#stabilityPanel').textContent,/Add nodes/);
 w.TrussLab.setModel(unsupported);$('#solve').click();assert.match($('#status').textContent,/^No supports assigned: 3 rigid-body motion\(s\) remain.*physically appropriate pin and separate roller.*Details below drawing/s);assert.ok($('#status').textContent.length<230,'leading cause stays compact');
 console.log('Truss UI PASS: empty startup, explicit example, solve, SVG/CSV actions, member/node Delete, text-field protection, stale-result removal, mechanism rejection, connected-member removal and clear.');
}finally{dom.window.close();}
