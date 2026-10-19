import assert from 'node:assert/strict';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html?beamCase=l03-tip'});
loadBeamLab(dom);const w=dom.window,d=w.document,$=s=>d.querySelector(s);
const key=el=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));
// A solved lecture model has one force. Keyboard focus selects its graphical handle.
let handle=$('[data-load-handle]');assert.ok(handle);handle.focus();
assert.equal(handle.getAttribute('aria-pressed'),'true');
assert.equal($('#beamDeleteSelected').disabled,false);
// Delete while typing must never delete a selected graphical item.
key($('#beamGeometry input'));assert.equal(d.querySelectorAll('[data-delete-load]').length,1);
// A real pointerdown/up click selects without sending focus to an edit input.
const svg=$('#beamPicture svg');svg.getBoundingClientRect=()=>({left:0,width:760});
handle.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:730,button:0}));
handle.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:730,button:0}));
assert.equal(d.activeElement.getAttribute('data-load-handle'),'0');
key(d.activeElement);assert.equal(d.querySelectorAll('[data-delete-load]').length,0);
assert.equal($('#beamChip').textContent,'Pending');assert.equal($('#beamCsv').disabled,true);
$('#beamSolve').click();assert.equal($('#beamChip').textContent,'Solved');
// Removing an end restraint makes that end free, not a shorter beam.
const L=$('#beamGeometry [name="length"]').value;
$('#beamPicture [data-support-index]').focus();$('#beamDeleteSelected').click();
assert.equal($('#beamleftSupport').value,'free');assert.equal($('#beamGeometry [name="length"]').value,L);
// Interior supports and hinges have genuine keyboard-selectable removal targets.
$('#beamleftSupport').value='fixed';$('#beamSolve').click();
$('#beamAddSupport').click();let support=$('#beamPicture [data-draggable="support"]');assert.ok(support);support.focus();key(support);
assert.equal(d.querySelectorAll('#beamInteriorList [data-row="support"]').length,0);
$('#beamAddHinge').click();const hinge=$('#beamPicture [data-hinge-index]');assert.ok(hinge);hinge.focus();key(hinge);
assert.equal(d.querySelectorAll('[data-row="hinge"]').length,0);
// Clear is explicit, can be cancelled, clears self-weight, retains supports and marks results stale.
$('[data-beam-preset="l03-tip"]').click();$('#beamSelfWeight').checked=true;
$('#beamSelfWeight').dispatchEvent(new w.Event('change',{bubbles:true}));$('#beamSolve').click();
w.confirm=()=>false;$('#beamClearPicture').click();assert.equal(d.querySelectorAll('[data-delete-load]').length,1);
w.confirm=()=>true;$('#beamClearPicture').click();assert.equal(d.querySelectorAll('[data-delete-load]').length,0);
assert.equal($('#beamSelfWeight').checked,false);assert.equal($('#beamleftSupport').value,'fixed');
assert.equal($('#beamChip').textContent,'Pending');assert.equal($('#beamCsv').disabled,true);
dom.window.close();console.log('Graphical Delete and confirmed Clear loads: input safety, end/interior/hinge removal, selection, no stale exports PASS.');
