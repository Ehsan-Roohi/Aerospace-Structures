import assert from 'node:assert/strict';import {loadBeamLab,configureBlankBeam,JSDOM} from './beam_test_dom.mjs';
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'}),{w,$}=loadBeamLab(dom);
try{
 for(const n of ['length','E','density','elements'])assert.equal($(`#beamGeometry [name="${n}"]`).value,'');
 assert.equal($('#beamShape').value,'');assert.equal($('#beamSectionFields').querySelectorAll('input').length,0);assert.equal($('#beamPicture svg'),null);assert.equal(w.BeamLab.state().solved,null);assert.equal($('#beamModelTitle').textContent,'Supports');assert.equal($('#beamModelSub').hidden,true);assert.match($('.bl-start-guide').textContent,/material.*mesh.*Section shape/s);
 $('#beamShape').value='rectangle';$('#beamShape').dispatchEvent(new w.Event('change'));assert.ok([...$('#beamSectionFields').querySelectorAll('input')].every(e=>e.value===''),'explicit dimensions required on first setup');
 assert.equal(w.BeamLab.solve(),false,'no analysis using hidden fallback defaults');
 configureBlankBeam(dom);$('#beamleftSupport').value='fixed';$('#beamSolve').click();assert.ok(w.BeamLab.state().solved);
 const add=(x,P)=>{$('#beamLoadKind').value='point';$('#beamLoadKind').dispatchEvent(new w.Event('change'));$('#beamLoadA').value=String(x);$('#beamP').value=String(P);$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 add(100,2);add(200,3);assert.equal($('#beamEditorDelete').textContent,'Delete load 2');$('#beamEditorDelete').click();assert.equal(w.BeamLab.state().model.loads.length,1);assert.equal(w.BeamLab.state().model.loads[0].position,100);
 $('#beamEditorClear').click();assert.equal(w.BeamLab.state().model.loads.length,0);assert.equal($('#beamleftSupport').value,'fixed');assert.equal($('#beamGeometry [name="length"]').value,'450');
 console.log('Blank setup PASS: all physical inputs unset, no default section/drawing/solve, explicit configuration, simplified Supports header, complete workflow and under-picture selective/all load removal.');
}finally{dom.window.close();}
const example=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.test/wing-lab.html?beamCase=l03-tip'});try{const {w,$}=loadBeamLab(example);assert.equal($('#beamGeometry [name="length"]').value,'450');assert.equal($('#beamShape').value,'rectangle');assert.ok(w.BeamLab.state().solved);console.log('Explicit Lecture 03 link still loads and solves its specified model.');}finally{example.window.close();}
