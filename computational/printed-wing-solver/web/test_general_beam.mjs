import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
let count=0;
for(const leftSupport of ['fixed','pin','roller','free'])for(const rightSupport of ['fixed','pin','roller','free']){
 const opt={leftSupport,rightSupport,elements:20,loads:[{kind:'distributed',start:0,end:450,qStart:.001,qEnd:.002}]};
 const stable=[leftSupport,rightSupport].includes('fixed') || (['pin','roller'].includes(leftSupport)&&['pin','roller'].includes(rightSupport)&&!(leftSupport==='roller'&&rightSupport==='roller'));
 if(!stable){assert.throws(()=>B.solve(opt),/Unstable|Two rollers/);continue;}
 const r=B.solve(opt);near(r.equilibrium.force,0);near(r.equilibrium.moment,0);
 for(const [s,i] of [[leftSupport,0],[rightSupport,r.x.length-1]]){if(s!=='free')near(r.deflection[i],0);if(s==='fixed')near(r.rotation[i],0);if(s==='pin'||s==='roller')near(r.moment[i],0);}
 assert.ok(r.modes.every(m=>m.frequencyHz>0));count++;
}
const r=B.solve({leftSupport:'free',rightSupport:'fixed',loads:[{kind:'point',position:0,force:2}]});
near(r.deflection[0],2*450**3/(3*r.EI));near(r.moment.at(-1),-900);near(r.shear.at(-1),-2);near(r.reactions[0].force,-2);near(r.reactions[0].moment,900);
const propped=B.solve({leftSupport:'fixed',rightSupport:'pin',loads:[{kind:'distributed',start:0,end:450,qStart:.002,qEnd:.002}]});
near(propped.reactions[0].force,-5*.002*450/8);near(propped.reactions[1].force,-3*.002*450/8);near(propped.reactions[0].moment,-.002*450**2/8);
const {JSDOM,loadBeamLab}=await import('./beam_test_dom.mjs');
const dom=new JSDOM('<div id="foundations"></div>',{url:'https://example.org',runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
loadBeamLab(dom);
assert.equal(w.document.querySelectorAll('[data-stage="beam"]').length,1);assert.equal(w.document.querySelector('[data-stage="cantilever"]'),null);
// Supports are part of the draft; Solve applies the whole draft (the old "Apply both supports" step).
$('#beamleftSupport').value='free';$('#beamrightSupport').value='fixed';$('#beamSolve').click();assert.match($('#beamTheory').textContent,/free \/ fixed/);
$('#beamleftSupport').value='free';$('#beamrightSupport').value='free';$('#beamSolve').click();assert.match($('#beamSupportStatus').textContent,/Unstable/);assert.match($('#beamTheory').textContent,/free \/ fixed/);
assert.match($('#beamRunStatus').textContent,/Not solved/);assert.equal($('.bl-results').dataset.stale,'true');
assert.ok(!/NaN|undefined/.test($('#beamPicture').innerHTML));dom.window.close();
console.log(`PASS: ${count} stable support pairs, mechanisms rejected, mirrored cantilever, propped-beam formulas, modes, general UI and rejected-change safety.`);
