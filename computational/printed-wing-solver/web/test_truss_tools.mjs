import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom'),dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);w.confirm=()=>true;const ctx=dom.getInternalVMContext();for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const click=selector=>$(selector).dispatchEvent(new w.MouseEvent('click',{bubbles:true})),submit=selector=>$(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
try{
 w.TrussLab.setModel({nodes:[{id:1,x:125,y:100,fx:0,fy:0,support:'free'},{id:2,x:125,y:500,fx:0,fy:0,support:'free'}],members:[]});
 assert.equal(w.TrussLab.snapPoint(128,498).x,125);assert.equal(w.TrussLab.snapPoint(128,498).y,500);
 click('[data-tool="pin"]');click('[data-node="1"] circle');assert.equal(w.TrussLab.state().model.nodes[0].support,'pin');
 click('[data-tool="force"]');click('[data-node="2"] circle');assert.equal($('#trussLoadEditor').hidden,false);$('#forceMagnitude').value='12';submit('#forceForm');assert.equal(w.TrussLab.state().model.nodes[1].fy,-12);$('#closeForce').click();assert.equal($('#trussLoadEditor').hidden,true);assert.equal(w.TrussLab.state().model.nodes[1].fy,-12);
 click('[data-tool="select"]');click('[data-force="2"]');w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(w.TrussLab.state().model.nodes.length,2);assert.equal(w.TrussLab.state().model.nodes[1].fy,0);
 click('[data-restraint="1"]');w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(w.TrussLab.state().model.nodes[0].support,'free');
 $('#newType').value='cable';click('[data-tool="member"]');click('[data-node="1"] circle');click('[data-node="2"] circle');assert.equal(w.TrussLab.state().model.members[0].type,'cable');
 w.TrussLab.setModel({nodes:[{id:1,x:0,y:0,fx:0,fy:0,support:'pin'},{id:2,x:1000,y:0,fx:-1000,fy:0,support:'rollerY'}],members:[{a:1,b:2,E:200000,A:100,Imin:1000,Kfactor:2,type:'bar'}]});$('#solve').click();assert.match($('#results').textContent,/ABOVE EULER LIMIT/);assert.equal($('#status').dataset.error,'true');
 assert.ok(!/NaN|undefined|Infinity/.test($('#trussCanvas').innerHTML));
 console.log('Truss tools PASS: exact x/y alignment snapping, top-bar support and force placement, closable force editor, selective force/support Delete, wire creation and Euler-limit UI.');
}finally{dom.window.close();}
