import assert from 'node:assert/strict';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
for(const name of ['cantilever','roller-pin','fixed']){
 for(const prefix of ['hw3','hw2b']){
  const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html?beamCase='+prefix+'-'+name});
  loadBeamLab(dom);const d=dom.window.document;
  assert.equal(d.querySelector('#beamLoads').textContent.trim(),'No load defined. Add your own load.');
  assert.ok(d.querySelector('#beamKpis').textContent.includes('0.0000 mm'));
  assert.equal(d.querySelectorAll('[data-beam-preset^="hw"]').length,0);
  assert.ok(!d.querySelector('#beamStatus').textContent.includes('HW 3 example loaded'));
  assert.ok(d.querySelector('#beamGeometry').parentElement.textContent.includes('Why choose 10, 30 or 40 elements?'));
  dom.window.close();
 }
}
console.log('All six retired homework links open empty; no homework preset buttons remain; mesh guidance present.');
