import assert from 'node:assert/strict';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
for(const name of ['cantilever','roller-pin','fixed']){
 const outputs=[];
 for(const prefix of ['hw3','hw2b']){
  const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html?beamCase='+prefix+'-'+name});
  loadBeamLab(dom);const d=dom.window.document;
  assert.match(d.querySelector('#beamStatus').textContent,/HW 3/);
  assert.equal(d.querySelector('#beamLoads ol').children.length,1);
  outputs.push([d.querySelector('#beamKpis').textContent,d.querySelector('#beamReactions').textContent]);
  dom.window.close();
 }
 assert.deepEqual(outputs[0],outputs[1]);
}
console.log('HW 3 canonical links and three legacy aliases produce identical numerical results, labelled HW 3.');
