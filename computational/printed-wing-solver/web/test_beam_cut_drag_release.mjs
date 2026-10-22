// A pending animation frame must never overwrite the final released cut station.
// DOM/event regression, not a hardware-pointer or pixel-layout test.
import assert from 'node:assert/strict';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const dom=new JSDOM('<div id="foundations"></div>',{url:'https://example.org/wing-lab.html?beamCase=l03-tip',runScripts:'outside-only'});
const w=dom.window,frames=[];
w.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};w.cancelAnimationFrame=()=>{};
const rect=w.Element.prototype.getBoundingClientRect;
w.Element.prototype.getBoundingClientRect=function(){if(this.tagName.toLowerCase()==='svg'){const width=+this.getAttribute('width')||760,height=+this.getAttribute('height')||200;return {left:0,top:0,x:0,y:0,width,height,right:width,bottom:height};}return rect.call(this);};
const {$}=loadBeamLab(dom),ui=w.BeamLab,pic=$('#beamPicture');
while(frames.length)frames.shift()();
ui.openTab('cut');const solved=ui.state().solved;
function pointer(type,x){const s=pic.querySelector('svg'),clientX=+s.dataset.x0+(+s.dataset.x1-+s.dataset.x0)*x/(+s.dataset.length);pic.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX,clientY:20}));}
try{
  pointer('pointerdown',100);assert.ok(Math.abs(ui.state().cut.x-100)<1e-9);
  pointer('pointermove',200);pointer('pointermove',280);assert.ok(frames.length>0);
  pointer('pointerup',320);assert.ok(Math.abs(ui.state().cut.x-320)<1e-9,'release commits its exact station without waiting for a frame');
  while(frames.length)frames.shift()();
  assert.ok(Math.abs(ui.state().cut.x-320)<1e-9,'an earlier queued move cannot overwrite the released station');
  pointer('pointerdown',125);pointer('pointermove',300);pointer('pointercancel',300);
  while(frames.length)frames.shift()();
  assert.ok(Math.abs(ui.state().cut.x-125)<1e-9,'cancelled move cannot arrive late');
  assert.equal(ui.state().solved,solved,'cut inspection does not replace the solved mechanics');
  assert.equal(ui.state().model.loads.length,1,'cut dragging does not alter the load');
  console.log('Beam cut drag release PASS: 7 exact release, delayed-frame, cancellation and visual-only checks.');
}finally{dom.window.close();}
