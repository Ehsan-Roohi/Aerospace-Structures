import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s),downloads=[];
w.confirm=()=>true;w.Blob=Blob;w.URL.createObjectURL=b=>(downloads.push(b),'blob:test');w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const change=(id,value)=>{const e=$('#'+id);if(typeof value==='boolean')e.checked=value;else e.value=value;e.dispatchEvent(new w.Event('change'));};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`),plain=v=>JSON.parse(JSON.stringify(v));
const model={nodes:[{id:1,x:0,y:0,support:'pin',fx:0,fy:0},{id:2,x:1000,y:0,support:'rollerY',fx:0,fy:0},{id:3,x:500,y:500,support:'free',fx:0,fy:-10}],members:[[1,2],[1,3],[2,3]].map(([a,b])=>({a,b,E:70000,A:100}))};
try{
 w.TrussLab.setModel(model);$('#solve').click();const result=w.TrussLab.state().result;assert.ok(result);
 near(result.nodes[2].ux,10*250/(70000*100));near(result.nodes[2].uy,-10*(Math.SQRT2*500+250)/(70000*100));
 assert.equal($('#trussNodeResult').hidden,true);assert.equal($('#trussShowDisplacements').checked,false);assert.equal(w.document.querySelectorAll('[data-deformed-member]').length,3);
 const engineering=JSON.stringify(w.TrussLab.state().result),inputs=JSON.stringify(w.TrussLab.state().model);let calls=0;const actualSolve=w.TrussEngine.solve;w.TrussEngine.solve=(...args)=>(calls++,actualSolve(...args));
 change('trussShowDisplacements',true);assert.match($('[data-node="3"] text').textContent,/\|u\|=.* mm/);assert.match($('[data-node="3"] title').textContent,/actual ux=.*uy=.*\|u\|=/);
 const autoPath=$('[data-deformed-member]').getAttribute('d');change('trussDeformationMode','manual');change('trussDeformationScale','2');assert.equal(+ $('[data-deformation-multiplier]').dataset.deformationMultiplier,2);assert.match($('#trussVisualScale').textContent,/×2\.0000/);
 assert.notEqual($('[data-deformed-member]').getAttribute('d'),autoPath,'The visual multiplier changes the drawn overlay');
 change('trussShowDeformed',false);assert.equal(w.document.querySelectorAll('[data-deformed-member]').length,0);assert.match($('#trussVisualScale').textContent,/hidden/);assert.match($('[data-node="3"] text').textContent,/\|u\|=/);
 assert.equal(JSON.stringify(w.TrussLab.state().result),engineering);assert.equal(JSON.stringify(w.TrussLab.state().model),inputs);assert.equal(calls,0,'Display controls must not solve or change physics');
 change('trussDeformationScale','-1');assert.equal($('#trussDeformationScale').value,'2');assert.match($('#status').textContent,/Visual multiplier must/);
 $('[data-node="3"] text').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,260));assert.equal($('#trussNodeResult').hidden,false);assert.match($('#trussNodeResult').textContent,/ux =.*uy =.*\|u\| =.*not multiplied/);
 $('[data-member="0"] text').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));const name='Upper "spar", <AB>';$('#editFields [name="name"]').value=name;$('#editForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.TrussLab.state().model.members[0].name,name);assert.equal(w.TrussLab.state().result,null);assert.equal($('[data-member="0"] text').textContent,name);assert.equal($('[data-member="0"] AB'),null,'Custom names are text, never markup');
 $('#solve').click();assert.equal(w.TrussLab.state().result.members[0].name,name);assert.ok($('#results').textContent.includes(name));$('#csv').click();assert.match(await downloads.at(-1).text(),/"Upper ""spar"", <AB>"/);assert.match(await downloads.at(-1).text(),/magnitude_mm/);
 const text=w.TrussLab.exportText(),saved=JSON.parse(text);assert.equal(saved.model.members[0].name,name);assert.equal(saved.settings.resultDisplay.deformationScale,2);assert.equal(saved.settings.resultDisplay.showDisplacements,true);
 assert.equal(w.TrussLab.importText(text),true);assert.equal(w.TrussLab.state().model.members[0].name,name);assert.equal($('#trussShowDisplacements').checked,true);assert.equal($('#trussShowDeformed').checked,false);assert.equal($('#trussDeformationScale').value,'2');
 const legacy=plain(saved);delete legacy.settings.resultDisplay;assert.equal(w.TrussLab.importText(JSON.stringify(legacy)),true);assert.equal($('#trussShowDisplacements').checked,false);assert.equal($('#trussShowDeformed').checked,true);assert.equal($('#trussDeformationMode').value,'auto');
 const before=JSON.stringify(w.TrussLab.state());for(const badName of ['x'.repeat(41),'bad\nname',{}]){const bad=plain(saved);bad.model.members[0].name=badName;assert.equal(w.TrussLab.importText(JSON.stringify(bad)),false);assert.equal(JSON.stringify(w.TrussLab.state()),before);}
 assert.equal(w.TrussLab.importText(JSON.stringify(model)),true);assert.equal(w.TrussLab.state().model.members[0].name,undefined,'Earlier unnamed models remain compatible');
 console.log('Truss named members and displacement PASS: analytic triangle displacement, physical/display separation, nodal overlay and probe, manual multiplier, CSV escaping, save/open and legacy compatibility, atomic invalid-name refusal.');
}finally{dom.window.close();}
