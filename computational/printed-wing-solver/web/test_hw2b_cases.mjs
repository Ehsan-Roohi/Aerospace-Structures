import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js');
const cases=[
 {left:'fixed',right:'free',shape:'triangle',q0:0,q1:.002,support:'cantilever',v:5.005645751953125},
 {left:'roller',right:'pin',shape:'trapezoid',q0:.001,q1:.002,support:'simply-supported',v:.533271919597278},
 {left:'fixed',right:'fixed',shape:'triangle-root',q0:.002,q1:0,support:'fixed-fixed',v:.0711029226129707}
];
for(const c of cases){
 const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html'});
 loadBeamLab(dom);const d=dom.window.document,$=s=>d.querySelector(s);
 assert.equal($('#beamLoads').textContent.trim(),'No load defined. Add your own load.');
 for(const [key,value] of Object.entries({length:450,E:2200,width:16,height:8,elements:30})){
  const el=$('#beamGeometry [name="'+key+'"]')||$('#beamSectionFields [data-sec="'+key+'"]');el.value=value;
 }
 $('#beamleftSupport').value=c.left;$('#beamrightSupport').value=c.right;
 $('#beamSolve').click();
 $('#beamLoadKind').value=c.shape;$('#beamLoadKind').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 $('#beamLoadA').value=0;$('#beamLoadB').value=450;$('#beamQ0').value=c.q0;$('#beamQ1').value=c.q1;
 $('#beamLoadForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal($('#beamLoads ol').children.length,1);
 assert.equal($('#beamSelfWeight').checked,false);
 const r=B.solve({length:450,width:16,height:8,E:2200,support:c.support,elements:30,modes:false,loads:[{kind:'distributed',start:0,end:450,qStart:c.q0,qEnd:c.q1}]});
 const target=B.fieldAt(r,c.support==='cantilever'?450:225);
 assert.ok(Math.abs(target.v-c.v)<1e-7);
 for(const q of r.reactions)assert.ok($('#beamReactions').textContent.includes(q.force.toFixed(6)));
 const supports=[...$('#beamPicture').querySelectorAll('[data-support-kind]')].map(x=>x.dataset.supportKind);
 assert.deepEqual(supports,c.right==='free'?[c.left]:[c.left,c.right]);
 assert.ok(!/NaN|undefined|Infinity/.test($('#foundations').innerHTML));
 dom.window.close();
}
console.log('Three assigned models configured manually from empty Beam: dimensions, supports, distributed loads, reaction signs and selected displacement pass.');
