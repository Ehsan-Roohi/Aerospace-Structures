import assert from'node:assert/strict';import{createRequire}from'node:module';const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'}),w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};
const{loadBeamLab,configureBlankBeam}=await import('./beam_test_dom.mjs');loadBeamLab(dom);configureBlankBeam(dom);const $=s=>w.document.querySelector(s);
try{
 $('#beamShape').value='layered';$('#beamShape').dispatchEvent(new w.Event('change'));
 assert.equal($('#beamSectionFields [data-sec="topThickness"]').value,'5');
 $('#beamSectionFields [data-sec="modulusRatio"]').value='3';$('#beamSectionFields [data-sec="densityRatio"]').value='2';
 $('#beamleftSupport').value='fixed';$('#beamSolve').click();const state=w.BeamLab.state(),r=state.solved.result;
 assert.equal(r.section.shape,'layered');assert.equal(r.section.modulusRatio,3);assert.match($('#beamSectionView').textContent,/E₂=6000/);assert.match($('#beamSectionView').textContent,/Material 1/);
 $('#beamLoadKind').value='point';$('#beamLoadKind').dispatchEvent(new w.Event('change'));$('#beamLoadA').value='450';$('#beamP').value='2';$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.BeamLab.state().solved.result.section.shape,'layered');
 w.BeamLab.openTab('cut');assert.match($('#bfResult').textContent,/7\.5/);$('#bfUseCut').click();assert.ok(Math.abs(+$('#bfV').value-2)<1e-8);
 w.BeamLab.openTab('solution');assert.ok(!/NaN|undefined|Infinity/.test($('#beamTab-solution').innerHTML));
 const exported=w.BeamLab.exportText();w.BeamLab.importText(exported);assert.equal(w.BeamLab.state().solved.result.section.modulusRatio,3);
 const before=JSON.stringify(w.BeamLab.state().model);$('#bfB').value='30';$('#bfB').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(JSON.stringify(w.BeamLab.state().model),before,'section calculator never changes the beam');
 assert.ok(!/NaN|undefined|Infinity/.test($('#beamSectionView').innerHTML));console.log('Layered beam UI PASS: shape selection, material ratios, solve/load, stress view, cut-to-flow transfer, solution, saved study round-trip and independent channel calculator.');
}finally{dom.window.close();}
