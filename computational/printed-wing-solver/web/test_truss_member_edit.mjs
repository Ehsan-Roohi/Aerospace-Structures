import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const click=s=>$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const bay={nodes:[[0,0],[1000,0],[1000,500],[0,500]].map(([x,y],i)=>({id:i+1,x,y,support:'free',fx:0,fy:0})),members:[[1,2],[2,3],[3,4],[4,1],[1,3],[2,4]].map(([a,b])=>({a,b,E:70000,A:100}))};
try{
 assert.ok(!w.document.body.textContent.includes('Why a braced rectangle can still fail'));
 for(const index of [4,5])for(const mode of ['node','member','force','pin','roller','line','select']){
  w.TrussLab.setModel(bay);click(`[data-tool="${mode}"]`);click(`[data-member="${index}"] text`);
  assert.equal($('#selectionDialog').open,true);assert.equal(w.TrussLab.state().selected.index,index);assert.equal(w.TrussLab.state().tool,'select');
  const type=$('#editFields [name="type"]'),material=$('#editFields [name="material"]');type.value='cable';material.value='steel';material.dispatchEvent(new w.Event('change'));assert.equal(+$('#editFields [name="E"]').value,200000);
  $('#editFields [name="E"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  const model=w.TrussLab.state().model;assert.equal($('#selectionDialog').open,false);assert.equal(model.members[index].type,'cable');assert.equal(model.members[index].material,'steel');assert.equal(model.members[index].E,200000);assert.equal(model.members.length,6);assert.equal(model.nodes.length,4);
  model.members.forEach((m,i)=>{if(i!==index){assert.equal(m.type,'bar');assert.equal(m.E,70000);}});
  click('#undo');assert.equal(w.TrussLab.state().model.members[index].type,'bar');
 }
 w.TrussLab.setModel(bay);const target=$('[data-member="4"]');target.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal($('#selectionDialog').open,true);
 $('#editFields [name="E"]').value='90000';$('#editFields [name="E"]').dispatchEvent(new w.Event('input'));assert.equal($('#editFields [name="material"]').value,'custom');
 $('#editFields [name="E"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));assert.equal(w.TrussLab.state().model.members.length,6);
 w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));assert.equal(w.TrussLab.state().model.members.length,5);assert.equal(w.TrussLab.state().model.nodes.length,4);
 console.log('Truss member editing PASS: both diagonals from every tool, clickable labels, Bar/Wire, material/E, Enter activation/application, selective Delete and Undo.');
}finally{dom.window.close();}
