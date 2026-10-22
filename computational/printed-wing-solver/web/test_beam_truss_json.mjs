import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url),Study=require('./beam_study.js');
let checks=0;const eq=(a,b,label)=>{assert.equal(a,b,label);checks++;},ok=(v,label)=>{assert.ok(v,label);checks++;},same=(a,b,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),label);checks++;};
const tick=()=>new Promise(r=>setTimeout(r,5)),wait=async fn=>{const end=Date.now()+5000;while(!fn()){assert.ok(Date.now()<end,'FileReader timed out');await tick();}};
// Beam: visible controls save even an unrestrained working draft, while result
// exports keep their existing solved/current guard. Uploaded results are ignored.
{
 const dom=new JSDOM('<div id="foundations"></div>',{url:'https://example.org/wing-lab.html',runScripts:'outside-only'}),w=dom.window,downloads=[];
 w.Blob=Blob;w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:beam';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 const {$}=loadBeamLab(dom);
 try{
  ok($('#beamOpenJson').closest('.bl-model'));ok($('#beamSaveJson').closest('.bl-model'));eq($('#beamSaveJson').disabled,false);eq(w.BeamLab.state().solved,null);
  $('#beamSaveJson').click();eq(downloads.length,1);const saved=JSON.parse(await downloads[0].text());eq(saved.format,Study.FORMAT);eq(saved.state,'draft');eq(saved.results,null);eq(saved.model.supports.length,0);eq(Study.parseStudy(JSON.stringify(saved)).draft,true);
  const before=JSON.stringify(w.BeamLab.state().model);ok(w.BeamLab.importText(JSON.stringify({...saved,model:{...saved.model,length:600,loads:[{kind:'point',position:300,force:2}]},results:{deflection:[999]}})));eq(w.BeamLab.state().model.length,600);eq(w.BeamLab.state().model.loads[0].force,2);eq(w.BeamLab.state().solved,null);eq($('#beamSaveJson').disabled,false);$('#beamUndo').click();eq(JSON.stringify(w.BeamLab.state().model),before,'working-draft import is undoable');
  const invalid=JSON.parse(JSON.stringify(saved));invalid.model.E=-1;eq(w.BeamLab.importText(JSON.stringify(invalid)),false);eq(JSON.stringify(w.BeamLab.state().model),before);eq(w.BeamLab.importText(JSON.stringify({...saved,state:'alien'})),false);
  $('#beamleftSupport').value='fixed';$('#beamSolve').click();ok(w.BeamLab.state().solved);$('#beamSaveJson').click();const solved=JSON.parse(await downloads.at(-1).text());eq(solved.state,undefined,'current solved study retains the old schema');ok(solved.results);
  // The current visible draft, not the previous solved input, is saved.
  const length=$('#beamGeometry [name=length]');length.value='550';length.dispatchEvent(new w.Event('input',{bubbles:true}));$('#beamSaveJson').click();const pending=JSON.parse(await downloads.at(-1).text());eq(pending.state,'draft');eq(pending.model.length,550);eq(pending.results,null);ok(/working draft/.test($('#beamFileStatus').textContent));
  const file=$('#beamImportFile'),uploaded=new w.File([JSON.stringify(saved)],'beam-draft.json',{type:'application/json'});Object.defineProperty(file,'files',{configurable:true,value:[uploaded]});file.dispatchEvent(new w.Event('change'));await wait(()=>!$('#beamOpenJson').disabled);eq(w.BeamLab.state().model.length,450);eq(w.BeamLab.state().model.supports.length,0);ok(/Draft JSON opened/.test($('#beamFileStatus').textContent));
  const latest=JSON.stringify(w.BeamLab.state().model);Object.defineProperty(file,'files',{configurable:true,value:[new w.File(['{broken'],'bad.json',{type:'application/json'})]});file.dispatchEvent(new w.Event('change'));await wait(()=>!$('#beamOpenJson').disabled);eq(JSON.stringify(w.BeamLab.state().model),latest);ok(/refused/.test($('#beamFileStatus').textContent));file.dispatchEvent(new w.Event('cancel'));eq(JSON.stringify(w.BeamLab.state().model),latest);ok(/cancelled/.test($('#beamFileStatus').textContent));
  $('#beamGeometry [name=E]').value='';const count=downloads.length;$('#beamSaveJson').click();eq(downloads.length,count);ok(/not saved/.test($('#beamFileStatus').textContent));
 }finally{dom.window.close();}
}
// Truss: input-only versioned portable files, complete physics fields, settings,
// malformed/foreign files, genuine FileReader, cancellation and import Undo/Redo.
{
 const html=readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s),downloads=[];
 w.confirm=()=>true;w.Blob=Blob;w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:truss';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 const ctx=dom.getInternalVMContext();for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
 try{
  ok($('#trussOpenJson').closest('.workspace-toolbar'));ok($('#trussSaveJson').closest('.workspace-toolbar'));$('#trussSaveJson').click();eq(JSON.parse(await downloads.at(-1).text()).model.nodes.length,0,'empty work can be saved');
  $('#wireExample').click();$('#solve').click();ok(w.TrussLab.state().result);const original=w.TrussLab.state().model;
  const m=JSON.parse(JSON.stringify(original));m.nodes[0].name='Root <A> · α';m.nodes[0].supportSide='above';m.nodes[1].support='roller';m.nodes[1].supportSide='left';m.nodes[1].supportAngle=33.123456789;m.nodes[3].fx=100*Math.cos(35*Math.PI/180);m.nodes[3].fy=100*Math.sin(35*Math.PI/180);m.members[0].material='steel';m.members[0].E=202000.125;m.members[0].A=100.125;m.members[0].Imin=991.125;m.members[0].Kfactor=.85;m.lineLoads=[{nodes:[1,2,4],qStart:.0025,qEnd:.0045,angle:271.125}];w.TrussLab.setModel(m);
  for(const[id,value]of [['newE','172000.125'],['newA','2.375'],['newI','12.345'],['newK','1.125'],['newType','cable'],['gridStep','0'],['trussLabelDetail','detailed'],['forceDirection','angle'],['newSupportSide','right'],['newSupportAngle','-34.5678']])$('#'+id).value=value;
  $('#alignNodes').checked=false;$('#reactionView').checked=true;$('#trussNodeCoordinates').checked=true;$('#rangeX').value='1530.125';$('#rangeY').value='850.375';$('#rangeX').dispatchEvent(new w.Event('change'));
  const text=w.TrussLab.exportText(),doc=JSON.parse(text),canonical=w.TrussLab.state().model;same(doc.model,canonical);eq(doc.model.members.filter(m=>m.type==='cable').length,2);eq(doc.model.nodes[0].name,'Root <A> · α');eq(doc.settings.view.width,1530.125);eq(doc.settings.forceInputMethod,'angle');eq(doc.settings.newMember.type,'cable');eq(doc.results,undefined);
  const baseline=JSON.stringify(w.TrussLab.state());for(const bad of ['{broken',JSON.stringify({...doc,version:2}),JSON.stringify({...doc,format:'mie446-wing-study'}),JSON.stringify({...doc,units:{...doc.units,length:'m'}}),JSON.stringify({...doc,model:{...doc.model,members:[{...doc.model.members[0],a:999}]}}),JSON.stringify({...doc,settings:{...doc.settings,gridStep:13}}),JSON.stringify({...doc,model:{...doc.model,nodes:doc.model.nodes.map((n,i)=>i? n:{...n,x:null})}}),JSON.stringify({...doc,settings:{...doc.settings,newMember:{E:70000,A:1}}}),'{"__proto__":{"polluted":true}}']){eq(w.TrussLab.importText(bad),false);eq(JSON.stringify(w.TrussLab.state()),baseline,'failure preserves model, result, selection and history');}
  const bytes='x'.repeat(200001);eq(w.TrussLab.importText(bytes),false);eq(JSON.stringify(w.TrussLab.state()),baseline);
  $('#clear').click();const empty=w.TrussLab.state().model;$('#gridStep').value='50';$('#alignNodes').checked=true;const previousSettings=JSON.parse(w.TrussLab.exportText()).settings;
  ok(w.TrussLab.importText(text,'student-truss.json'));same(w.TrussLab.state().model,canonical);eq(w.TrussLab.state().result,null);same(JSON.parse(w.TrussLab.exportText()).settings,doc.settings);ok(/student-truss/.test($('#trussFileStatus').textContent));eq($('#trussCanvas [data-node="1"] A'),null,'names remain text, never markup');
  w.TrussLab.undo();same(w.TrussLab.state().model,empty);same(JSON.parse(w.TrussLab.exportText()).settings,previousSettings,'Undo restores import-time drawing/member settings');w.TrussLab.redo();same(w.TrussLab.state().model,canonical);same(JSON.parse(w.TrussLab.exportText()).settings,doc.settings);
  // Settings-only imports are also an undoable study edit.
  const settingsOnly={...doc,settings:{...doc.settings,gridStep:25}};ok(w.TrussLab.importText(JSON.stringify(settingsOnly)));eq($('#gridStep').value,'25');w.TrussLab.undo();eq($('#gridStep').value,'0');
  const file=$('#trussJsonFile'),fileBaseline=JSON.stringify(w.TrussLab.state());file.dispatchEvent(new w.Event('cancel'));eq(JSON.stringify(w.TrussLab.state()),fileBaseline);ok(/cancelled/.test($('#trussFileStatus').textContent));
  Object.defineProperty(file,'files',{configurable:true,value:[new w.File([text],'real-file.json',{type:'application/json'})]});file.dispatchEvent(new w.Event('change'));await w.TrussLab.fileIdle();same(w.TrussLab.state().model,canonical);ok(/real-file/.test($('#trussFileStatus').textContent));
  const after=JSON.stringify(w.TrussLab.state());Object.defineProperty(file,'files',{configurable:true,value:[new w.File(['{}'],'foreign.json',{type:'application/json'})]});file.dispatchEvent(new w.Event('change'));await w.TrussLab.fileIdle();eq(JSON.stringify(w.TrussLab.state()),after);eq($('#trussFileStatus').getAttribute('role'),'alert');
  // Plain earlier model JSON remains readable, but all topology is revalidated.
  ok(w.TrussLab.importText(JSON.stringify(original),'legacy-model.json'));same(w.TrussLab.state().model,w.TrussEngine.normalize(original));
 }finally{dom.window.close();}
}
console.log(`Beam/Truss portable JSON: ${checks} visible controls, solved/unsolved inputs, version/units, all structural fields/settings, real upload, atomic refusal, cancellation and undo/redo checks passed.`);
