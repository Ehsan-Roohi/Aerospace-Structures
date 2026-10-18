import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM,loadBeamLab}=await import('./beam_test_dom.mjs');
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const expected=[['l03-tip','cantilever',18.225,2.7],
 ['l03-centre','cantilever',5.6953125,1.35],
 ['l03-uniform','cantilever',6.834375,1.35],
 ['l03-simple','simply-supported',1.1390625,.675],
 ['l03-fixed','fixed-fixed',.284765625,.3375],
 ['l03-lift','cantilever',6.834375,1.35],
 ['unknown','cantilever',18.225,2.7],['__proto__','cantilever',18.225,2.7],['toString','cantilever',18.225,2.7]];
for(const [name,support,deflection,stress] of expected){
 const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html?beamCase='+name});
 const w=dom.window,ctx=dom.getInternalVMContext();
 loadBeamLab(dom);
 const text=w.document.querySelector('#beamKpis').textContent;
 assert.ok(text.includes(deflection.toFixed(4)+' mm'),name+': displacement '+text);
 assert.ok(text.includes(stress.toFixed(3)+' MPa'),name+': stress');
 assert.equal(w.document.querySelector('[data-stage="beam"]').getAttribute('aria-pressed'),'true');
 if(name==='l03-lift')assert.ok(w.document.querySelector('#beamLoads').textContent.includes('-0.004'));
 dom.window.close();
}
console.log('Lecture 03: all six deep links and unknown-case fallback pass DOM/numerical checks.');
