import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'}),w=dom.window;
w.HTMLElement.prototype.scrollIntoView=function(){};
const {loadBeamLab}=await import('./beam_test_dom.mjs');loadBeamLab(dom);
const $=s=>w.document.querySelector(s);
try {
 assert.equal(w.document.querySelectorAll('#beamLoadForm').length,1);
 assert.ok($('#beamLoadEditor').contains($('#beamLoadForm')));
 assert.ok($('#beamGuideOpen').closest('.bl-start-guide'));
 assert.equal(w.BeamLab.state().model.loads.length,0);
 assert.equal(w.BeamLab.state().model.supports.length,0);
 $('#beamleftSupport').value='fixed';$('#beamSolve').click();
 $('#beamLoadKind').value='point';$('#beamLoadKind').dispatchEvent(new w.Event('change'));
 $('#beamLoadA').value='0';$('#beamP').value='2';
 $('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.BeamLab.state().model.loads[0].position,0);
 assert.equal(w.BeamLab.state().model.loads[0].force,2);
 $('#beamGuideOpen').click();assert.equal(w.BeamLab.state().tab,'learn');
 console.log('Inline load editor PASS: single form beside model, empty startup, zero coordinate, confirmed load, manual navigation.');
} finally {dom.window.close();}
