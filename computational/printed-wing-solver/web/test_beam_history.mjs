import assert from 'node:assert/strict';
import {loadBeamLab,JSDOM} from './beam_test_dom.mjs';
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'}),{w,$}=loadBeamLab(dom);
const state=()=>w.BeamLab.state(),click=s=>$(s).click(),set=(s,v)=>{$(s).value=String(v);$(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
const key=(target,key,extra={})=>target.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,ctrlKey:true,...extra}));
try{
 assert.ok($('#beamGuide').contains($('#beamMeshHelp')));assert.equal($('.bl-side').contains($('#beamMeshHelp')),false);
 assert.equal($('#beamUndo').disabled,true);assert.equal($('#beamRedo').disabled,true);
 set('#beamGeometry [name="length"]',600);assert.equal(state().model.length,600);click('#beamUndo');assert.equal(state().model.length,450);click('#beamRedo');assert.equal(state().model.length,600);
 key(w.document.body,'z');assert.equal(state().model.length,450);key(w.document.body,'z',{shiftKey:true});assert.equal(state().model.length,600);
 // Text editing owns its native Undo shortcut; it must not undo the model.
 key($('#beamGeometry [name="length"]'),'z');assert.equal(state().model.length,600);
 click('#beamUndo');set('#beamGeometry [name="E"]',3000);assert.equal($('#beamRedo').disabled,true,'new edit drops redo branch');
 $('#beamleftSupport').value='fixed';$('#beamleftSupport').dispatchEvent(new w.Event('change',{bubbles:true}));$('#beamleftSupport').dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.ok(w.BeamLab.solve());assert.ok(state().solved);
 $('#beamLoadKind').value='point';$('#beamLoadKind').dispatchEvent(new w.Event('change'));$('#beamLoadA').value='200';$('#beamP').value='5';$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(state().model.loads.length,1);const solved=state().solved;click('#beamUndo');assert.equal(state().model.loads.length,0);assert.ok(state().solved===solved,'history never overwrites last solved evidence');click('#beamRedo');assert.equal(state().model.loads[0].force,5);
 click('#beamClearPicture');assert.equal(state().model.loads.length,0);click('#beamUndo');assert.equal(state().model.loads[0].force,5);
 const n=state().model.supports.length;click('#beamClearSupports');assert.equal(state().model.supports.length,0);click('#beamUndo');assert.equal(state().model.supports.length,n);
 set('#beamSectionFields [data-sec="height"]',15);click('#beamUndo');assert.equal(state().model.section.height,10);key(w.document.body,'y');assert.equal(state().model.section.height,15);
 console.log('Beam history PASS: manual-only mesh help, initial state, geometry/material/section/support/load edits, clear/restore, Ctrl+Z/Shift+Z/Y, native input undo, redo branching and last-solved evidence.');
}finally{dom.window.close();}
