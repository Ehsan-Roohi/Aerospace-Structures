import assert from 'node:assert/strict';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
for(const name of ['cantilever','roller-pin','fixed']){
 for(const prefix of ['hw3','hw2b']){
  const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html?beamCase='+prefix+'-'+name});
  loadBeamLab(dom);const d=dom.window.document;
  assert.equal(d.querySelector('#beamLoads').textContent.trim(),'No load defined. Add your own load.');
  assert.equal(dom.window.BeamLab.state().solved,null);
  assert.equal(dom.window.BeamLab.state().model.supports.length,0);
  assert.equal(d.querySelectorAll('[data-beam-preset^="hw"]').length,0);
  assert.ok(!d.querySelector('#beamStatus').textContent.includes('HW 3 example loaded'));
  assert.ok(d.querySelector('#beamGuide #beamMeshHelp').textContent.includes('Why choose 10, 30 or 40 elements?'));
  assert.equal(d.querySelector('#beamGeometry').parentElement.contains(d.querySelector('#beamMeshHelp')),false,'mesh explanation belongs in the manual, not the input panel');
  assert.ok(!/HW\s*3|homework|assignment/i.test(d.querySelector('#beamGeometry').parentElement.textContent));
  dom.window.close();
 }
}
console.log('All six retired homework links open empty; no homework preset buttons remain; mesh guidance present.');
