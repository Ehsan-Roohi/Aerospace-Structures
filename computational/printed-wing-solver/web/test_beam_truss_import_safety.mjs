// Adversarial read ordering and atomic optional-config import in actual controllers.
import assert from 'node:assert/strict';
import {BEAM_SCRIPTS,JSDOM,loadBeamLab} from './beam_test_dom.mjs';
import {readFileSync} from 'node:fs';import vm from 'node:vm';
let checks=0;const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;},tick=()=>new Promise(r=>setTimeout(r,0));
for(const kind of ['beam','truss'])for(const canAbort of [true,false]){
 const html=kind==='beam'?'<div id="foundations"></div>':readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s),readers=[];
 w.FileReader=class{readAsText(file){this.file=file;readers.push(this);}abort(){if(!canAbort)throw Error('Cannot abort');this.onabort?.();}finish(text){this.result=text;this.onload?.();}fail(){this.onerror?.();}};
 w.confirm=()=>true;w.Blob=Blob;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 if(kind==='beam')loadBeamLab(dom,{scripts:[...BEAM_SCRIPTS,'beam_strength.js','beam_strength_ui.js']});
 else for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
 const lab=kind==='beam'?w.BeamLab:w.TrussLab,file=$(kind==='beam'?'#beamImportFile':'#trussJsonFile'),status=()=>$(kind==='beam'?'#beamFileStatus':'#trussFileStatus').textContent;
 const save=()=>kind==='beam'?lab.portableText():lab.exportText(),state=()=>JSON.stringify(lab.state()),model=()=>JSON.stringify(lab.state().model),doc=JSON.parse(save());
 const a=JSON.parse(JSON.stringify(doc)),b=JSON.parse(JSON.stringify(doc));
 if(kind==='beam'){a.model.length=600;b.model.length=525;}
 else{a.model.nodes=[{id:1,name:'A',x:10,y:0,fx:0,fy:0,support:'free'}];b.model.nodes=[{id:2,name:'B',x:20,y:0,fx:0,fy:0,support:'free'}];}
 const ta=JSON.stringify(a),tb=JSON.stringify(b),begin=name=>{Object.defineProperty(file,'files',{configurable:true,value:[{name,size:Math.max(ta.length,tb.length)}]});file.dispatchEvent(new w.Event('change'));return readers.at(-1);};
 try{
  for(const id of kind==='beam'?['#beamOpenJson','#beamSaveJson']:['#trussOpenJson','#trussSaveJson']){const button=$(id);eq(button.type,'button','native keyboard-activatable button, never implicit form submit');button.focus();eq(w.document.activeElement,button);ok(button.textContent.includes('JSON'));}
  const baseline=state(),r1=begin('cancel.json');file.dispatchEvent(new w.Event('cancel'));r1.finish(ta);await tick();eq(state(),baseline,'Cancel cannot be undone by a late read');ok(/cancelled/i.test(status()));
  const r2=begin('older.json');ok(lab.importText(tb));const newer=model(),s=status();r2.finish(ta);await tick();eq(model(),newer,'direct text import supersedes an in-flight file');eq(status(),s,'old completion cannot overwrite newer success');
  const old=begin('old.json'),fresh=begin('fresh.json');fresh.finish(ta);await tick();const current=model(),success=status();old.fail();await tick();eq(model(),current);eq(status(),success,'old read failure cannot overwrite latest status');
  const editing=begin('before-edit.json');if(kind==='beam'){const input=$('#beamGeometry [name="length"]');input.value='700';input.dispatchEvent(new w.Event('input',{bubbles:true}));}else $('#clear').click();const editModel=model();editing.finish(tb);await tick();eq(model(),editModel,'late open must not overwrite edits made during reading');ok(/inputs changed/.test(status()));
  const unsaved=begin('before-form-edit.json'),draftInput=$(kind==='beam'?'#beamP':'#nodeX');draftInput.value='321';draftInput.dispatchEvent(new w.Event('input',{bubbles:true}));const beforeDraft=model();unsaved.finish(ta);await tick();eq(model(),beforeDraft,'unsubmitted editor input also prevents replacement');eq(draftInput.value,'321');ok(/inputs changed/.test(status()));
  const pending=begin('before-malformed.json');const malformedState=state();eq(lab.importText('{bad json'),false);const refusal=status();pending.finish(ta);await tick();eq(state(),malformedState,'malformed direct request is atomic and supersedes older file');eq(status(),refusal);
  if(kind==='beam'){
   ok(!$('#beamOpenJson').disabled&&!$('#beamImport').disabled,'supersession never leaves Open disabled');
   $('#strength0_yield').value='35';$('#strengthRequired').value='2';const valid=JSON.parse(save()),unchanged=model(),config=JSON.stringify(w.BeamStrengthUI.exportConfig());
   for(const strength of [{version:99},{criterion:'<img src=x onerror=alert(1)>'},{requiredFos:-1},{layers:['not a material']},{layers:[[3]]}]){const bad={...valid,model:{...valid.model,length:900},strength};eq(lab.importText(JSON.stringify(bad)),false);eq(model(),unchanged,'malformed strength cannot partially replace geometry');eq(JSON.stringify(w.BeamStrengthUI.exportConfig()),config,'malformed strength cannot silently reset limits');ok(/Import refused/.test(status()));eq($('#beamStrengthResult img'),null);}
   // Whitelist copy remains compatible while prototype-shaped data is inert.
   const hostile=JSON.stringify(valid).replace('"model":{','"model":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},');ok(lab.importText(hostile));eq(({}).polluted,undefined);eq(w.Object.prototype.polluted,undefined);
  }else{
   const baseline=state();for(const bad of ['{"__proto__":{"polluted":true}}',JSON.stringify({...doc,model:{nodes:[{id:1,x:0,y:0,fx:0,fy:0,support:'free',name:{}}],members:[]}}),JSON.stringify({...doc,settings:{...doc.settings,newMember:{...doc.settings.newMember,E:null}}})]){eq(lab.importText(bad),false);eq(state(),baseline,'malformed settings/model/prototype import is atomic');}
  }
 }finally{dom.window.close();}
}
console.log(`Beam/Truss import safety PASS: ${checks} late-read/cancel/supersession, retained newer edits, atomic malformed strength/model/settings, safe prototype handling and native keyboard controls checks.`);
