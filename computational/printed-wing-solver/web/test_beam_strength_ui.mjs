import assert from 'node:assert/strict';import {BEAM_SCRIPTS,loadBeamLab,JSDOM} from './beam_test_dom.mjs';
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'}),{w,$}=loadBeamLab(dom,{scripts:[...BEAM_SCRIPTS,'beam_strength.js','beam_strength_ui.js']});
const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
let csvText='',downloadName='';w.Blob=class{constructor(parts){this.parts=parts;}};w.URL.createObjectURL=blob=>{csvText=blob.parts.join('');return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloadName=this.download;};
try{
 assert.match($('#beamStrengthResult').textContent,/NOT CHECKED/);assert.equal($('#strength0_yield').value,'');assert.equal($('#beamStrengthCsv').disabled,true);
 $('#beamleftSupport').value='fixed';$('#beamSolve').click();assert.equal(w.BeamStrengthUI.assessment().status,'unchecked');assert.match($('#beamStrengthResult').textContent,/missing/);
 change('#strengthRequired',2);change('#strength0_yield',27);assert.equal(w.BeamStrengthUI.assessment().status,'within');assert.equal(w.BeamStrengthUI.assessment().maxBound,0);
 $('#beamLoadA').value='450';$('#beamP').value='2';$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(w.BeamStrengthUI.assessment().status,'within');assert.match($('#beamStrengthResult').textContent,/x=0\.0000 mm/);assert.equal($('#beamStrengthCut').disabled,false);
 change('#strength0_yield',2);assert.equal(w.BeamStrengthUI.assessment().status,'exceeded');assert.ok($('#beamStrengthResult [fill="#be3041"]'));
 change('#strength0_yield',4);assert.equal(w.BeamStrengthUI.assessment().status,'margin');
 change('#strength0_yield',27);change('#strengthDeflection',1);assert.equal(w.BeamStrengthUI.assessment().deflection.status,'exceeded');
 $('#beamStrengthCsv').click();assert.equal(downloadName,'beam-strength-screening.csv');assert.match(csvText,/critical_evaluated_x_mm/);assert.match(csvText,/material_1_yield_MPa","27/);assert.match(csvText,/deflection_status","exceeded/);
 const saved=w.BeamLab.exportText();assert.equal(JSON.parse(saved).strength.layers[0].yield,27);
 change('#strength0_yield',100);assert.equal(w.BeamLab.importText(saved),true);assert.equal($('#strength0_yield').value,'27');assert.equal(w.BeamStrengthUI.assessment().config.requiredFos,2);
 const legacy=JSON.parse(saved);delete legacy.strength;w.BeamLab.importText(JSON.stringify(legacy));assert.equal($('#strength0_yield').value,'');assert.equal(w.BeamStrengthUI.assessment().status,'unchecked');
 change('#strength0_yield',27);change('#strengthRequired',2);
 $('#beamGeometry [name="length"]').value='460';$('#beamGeometry [name="length"]').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.BeamStrengthUI.assessment(),null);assert.equal($('#beamStrengthCsv').disabled,true);assert.equal($('#beamStrengthCut').disabled,true);assert.match($('#beamStrengthResult').textContent,/changed or invalid/);
 $('#beamSolve').click();assert.equal(w.BeamStrengthUI.assessment().status,'within');
 change('#strength0_yield',-1);assert.equal(w.BeamStrengthUI.assessment(),null);assert.equal($('#beamStrengthCsv').disabled,true);assert.match($('#beamStrengthResult').textContent,/NOT CHECKED/);
 change('#strength0_yield',27);$('#beamStrengthCut').click();assert.equal(w.BeamLab.state().tab,'cut');assert.equal(w.BeamLab.state().cut.limit,w.BeamStrengthUI.assessment().critical.side);
 assert.match(w.BeamStrengthUI.reportHTML(),/Nominal strength screening/);assert.ok(!/NaN|undefined|Infinity/.test($('#beamStrengthResult').innerHTML));
 $('#beamShape').value='layered';$('#beamShape').dispatchEvent(new w.Event('change'));$('#beamSolve').click();assert.equal($('#strengthMaterial1').hidden,false);assert.equal(w.BeamStrengthUI.assessment().status,'unchecked');change('#strength1_yield',30);assert.equal(w.BeamStrengthUI.assessment().complete,true);const layers=w.BeamLab.exportText();w.BeamLab.importText(layers);assert.equal($('#strength1_yield').value,'30');
 const malformed=JSON.parse(saved);malformed.strength={criterion:'<img src=x onerror=alert(1)>',layers:[]};w.BeamLab.importText(JSON.stringify(malformed));assert.equal(w.BeamStrengthUI.assessment().status,'unchecked');assert.equal($('#beamStrengthResult img'),null);
 console.log('Strength UI PASS: blank limits, missing-data grey, zero load, green/red/amber map, critical station, deflection failure, study save/import and old-file reset, stale-result/export suppression, invalid data, safe import and report content.');
}finally{dom.window.close();}
