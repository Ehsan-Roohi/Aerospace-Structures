import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'}),w=dom.window;
w.HTMLElement.prototype.scrollIntoView=function(){};
const {loadBeamLab}=await import('./beam_test_dom.mjs');loadBeamLab(dom);
const $=s=>w.document.querySelector(s);
try {
 assert.equal(w.document.querySelectorAll('#beamLoadForm').length,1);
 assert.ok($('#beamLoadEditor').hidden);
 assert.ok($('#beamLoadFormHome').contains($('#beamLoadForm')));
 assert.ok($('#beamGuideOpen').closest('.bl-start-guide'));
 assert.equal(w.BeamLab.state().model.loads.length,0);
 assert.equal(w.BeamLab.state().model.supports.length,0);
 $('#beamleftSupport').value='fixed';$('#beamSolve').click();
 $('#beamLoadKind').value='point';$('#beamLoadKind').dispatchEvent(new w.Event('change'));
 $('#beamLoadA').value='0';$('#beamP').value='2';
 $('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.BeamLab.state().model.loads[0].position,0);
 assert.equal(w.BeamLab.state().model.loads[0].force,2);
 // Model the same transfer used by graphical placement, then close without deleting a load.
 $('#beamLoadEditor').hidden=false;$('#beamLoadEditor').append($('#beamLoadForm'));
 $('#beamLoadEditorClose').click();assert.ok($('#beamLoadEditor').hidden);
 assert.ok($('#beamLoadFormHome').contains($('#beamLoadForm')));
 assert.equal(w.BeamLab.state().model.loads.length,1);
 $('#beamAddHinge').click();
 let hinge=$('#beamPicture [data-hinge-index]');assert.ok(hinge,'hinge visible');
 hinge.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
 assert.equal(w.document.querySelectorAll('#beamHingeList [data-row="hinge"]').length,0,'Delete removes selected hinge even when SVG focus falls back to body');
 const handle=$('#beamPicture [data-load-handle]');handle.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 $('#beamP').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(w.BeamLab.state().model.loads.length,1,'Delete in a number field must not remove geometry');
 w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(w.BeamLab.state().model.loads.length,0);
 $('#beamPicture [data-support-index]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal($('#beamleftSupport').value,'free');
 $('#beamGuideOpen').click();assert.equal(w.BeamLab.state().tab,'learn');
 console.log('Inline load editor PASS: sidebar default, close and return, applied load retained, hinge Delete, empty startup, zero coordinate, manual navigation.');
} finally {dom.window.close();}
