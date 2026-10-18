import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM,loadBeamLab}=await import('./beam_test_dom.mjs');
const B=require('./beam_learning_engine.js');
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const L=450,w=.002,EI=2200*16*8**3/12;
let checks=0;
function near(a,b){assert.ok(Math.abs(a-b)<Math.max(1e-7,Math.abs(b)*1e-7),a+' != '+b);checks++;}
const cases=[
 ['hw2b-cantilever','cantilever',0,w,'pin-left'],
 ['hw2b-roller-pin','simply-supported',w/2,w,'roller-left'],
 ['hw2b-fixed','fixed-fixed',w,0,'pin-left']
];
for(const [name,support,qStart,qEnd,arrangement] of cases){
 const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html?beamCase='+name});
 const win=dom.window,ctx=dom.getInternalVMContext(),$=s=>win.document.querySelector(s);
 loadBeamLab(dom);
 // Width and depth now live in the cross-section panel (rectangle), length and E in the span panel.
 assert.equal($('#beamShape').value,'rectangle');
 for(const [key,value] of Object.entries({length:450,width:16,height:8,E:2200})){
   const input=$('#beamGeometry [name="'+key+'"]')||$('#beamSectionFields [data-sec="'+key+'"]');
   assert.equal(+input.value,value);checks++;
 }
 const r=B.solve({length:L,width:16,height:8,E:2200,support,elements:40,modes:false,loads:[{kind:'distributed',start:0,end:L,qStart,qEnd}]});
 assert.equal($('#beamLoads ol').children.length,1);
 assert.ok(!$('#beamLoads').textContent.includes(' N at x='));
 assert.match($('#beamStatus').textContent,/HW 2B/);
 assert.match($('#beamReactions').textContent,/rad/);
 assert.equal($('#beamReactions tr').querySelectorAll('th').length,5);
 if(support==='cantilever'){
   near(r.reactions[0].force,-w*L/2);near(r.reactions[0].moment,-w*L**2/3);
 }else if(support==='fixed-fixed'){
   near(r.reactions[0].force,-7*w*L/20);near(r.reactions[1].force,-3*w*L/20);
   near(r.reactions[0].moment,-w*L**2/20);near(r.reactions[1].moment,w*L**2/30);
 }else{
   const left=$('#beamPicture [data-support-kind]'),right=left.nextElementSibling;
   assert.equal(left.dataset.supportKind,'roller');
   assert.equal(left.querySelectorAll('circle').length,2);
   const supports=[...$('#beamPicture').querySelectorAll('[data-support-kind]')];
   assert.deepEqual(supports.map(x=>x.dataset.supportKind),['roller','pin']);
   near(r.reactions[0].force,-.3);near(r.reactions[1].force,-.375);
   near(r.rotation[0],L**3*(8*w/2+7*w)/(360*EI));
   near(r.rotation.at(-1),-(L**3)*(7*w/2+8*w)/(360*EI));
   // Swapping pin and roller changes only the axial restraint: every number in the table is unchanged.
   const numbers=()=>[...$('#beamReactions').querySelectorAll('td.num')].map(td=>td.textContent);
   const before=$('#beamKpis').textContent,rotations=numbers();
   assert.equal(rotations.length,8);
   $('#beamleftSupport').value='pin';$('#beamrightSupport').value='roller';$('#beamSolve').click();
   assert.equal($('#beamKpis').textContent,before);
   assert.deepEqual(numbers(),rotations);
   assert.deepEqual([...$('#beamPicture').querySelectorAll('[data-support-kind]')].map(x=>x.dataset.supportKind),['pin','roller']);
 }
 // A preset replaces all loads and updates the visible form, even after an old point study.
 $('#beamCentre').click();
 $('[data-beam-preset="'+name+'"]').click();
 assert.equal($('#beamLoads ol').children.length,1);
 assert.equal($('#beamleftSupport').value,support==='simply-supported'?'roller':'fixed');
 assert.equal(+$('#beamQ0').value,qStart);assert.equal(+$('#beamQ1').value,qEnd);
 assert.equal($('[data-stage="beam"]').getAttribute('aria-pressed'),'true');
 assert.ok(!/NaN|undefined|Infinity/.test($('#foundations').innerHTML));
 if(name==='hw2b-fixed'){
   $('#beamClear').click();
   $('#beamLoadKind').value='triangle-root';$('#beamLoadA').value=0;$('#beamLoadB').value=450;
   $('#beamQ0').value=.002;$('#beamQ1').value=99;
   $('#beamLoadForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
   assert.match($('#beamLoads').textContent,/0.002 → 0 N\/mm/);
 }
 near(r.deflection[0],0);
 if(support!=='cantilever')near(r.deflection.at(-1),0);
 if(support!=='simply-supported'){near(r.rotation[0],0);if(support==='fixed-fixed')near(r.rotation.at(-1),0);}
 near(r.equilibrium.force,0);near(r.equilibrium.moment,0);
 dom.window.close();
}
console.log('HW2B: three exact presets, pin/roller symbols and switching, support motion, reversed triangle and '+checks+' numerical/input checks passed.');
