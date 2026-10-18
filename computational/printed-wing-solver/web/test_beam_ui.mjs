// Beam Lab workflow tests in jsdom (DOM component tests; not a real-browser rendering test).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js'), Study=require('./beam_study.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const near=(a,b,rel=1e-9,abs=1e-12,m='')=>{assert.ok(Math.abs(a-b)<=Math.max(abs,Math.abs(b)*rel),`${m} ${a} != ${b}`);checks++;};

function open(url='https://example.org/wing-lab.html') {
  const dom=new JSDOM('<div id="foundations"></div>',{url,runScripts:'outside-only'});
  const w=dom.window, downloads=[];
  w.Blob=Blob;
  w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:test';};
  w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){};
  w.print=()=>{w.printed=(w.printed||0)+1;};
  // Give SVGs a layout box equal to their viewBox so pointer coordinates map 1 : 1.
  const rect=w.Element.prototype.getBoundingClientRect;
  w.Element.prototype.getBoundingClientRect=function(){
    if(this.tagName.toLowerCase()==='svg'){const W=+this.getAttribute('width')||760,H=+this.getAttribute('height')||200;return {left:0,top:0,x:0,y:0,width:W,height:H,right:W,bottom:H};}
    return rect.call(this);
  };
  const env=loadBeamLab(dom);
  return {...env,dom,downloads,input:(sel,value)=>{const el=env.$(sel);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));},
    pointer:(type,target,clientX)=>{const Ctor=w.PointerEvent||w.MouseEvent;target.dispatchEvent(new Ctor(type,{bubbles:true,cancelable:true,clientX,clientY:20,pointerId:1}));},
    // Enter one load through the load form, as a user does (the Beam Lab opens with no load).
    addLoad:(kind,values)=>{const $=env.$;$('#beamLoadKind').value=kind;$('#beamLoadKind').dispatchEvent(new w.Event('change'));
      for(const [id,v] of Object.entries(values))$('#'+id).value=String(v);
      $('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}};
}
const kpi=$=>$('#beamKpis').textContent;
const lab=w=>w.BeamLab.state();
const clean=html=>!/NaN|undefined|Infinity/.test(html);

/* ---------- 0. normal opening: no applied load, self-weight off, nothing pre-filled ---------- */
{
  const t0=open(), $0=t0.$, w0=t0.w, s0=lab(w0).solved, r0=s0.result;
  eq(s0.model.loads.length,0,'normal opening: no applied load');eq(s0.model.selfWeight,false,'self-weight off');eq($0('#beamSelfWeight').checked,false);
  eq($0('#beamChip').textContent,'Solved','the unloaded beam is solved');ok(/Solved with no load/.test($0('#beamStatus').textContent),'run message says there is no load');
  ok(r0.deflection.every(v=>v===0)&&r0.rotation.every(v=>v===0)&&r0.moment.every(v=>v===0)&&r0.shear.every(v=>v===0),'zero load: v, θ, V and M are exactly zero');
  ok(r0.reactions.every(q=>q.force===0&&q.moment===0)&&r0.equilibrium.force===0&&r0.equilibrium.moment===0,'zero reactions, zero residuals');
  ok(r0.modes.length===3&&r0.modes[0].frequencyHz>0,'vibration modes do not depend on the load');
  ok(/0\.0000 mm/.test(kpi($0))&&/0\.000 N/.test(kpi($0)),'KPIs: zero deflection and zero total force');
  eq($0('#beamLoads').textContent.trim(),'No load defined. Add your own load.','empty state of the load list');
  ok($0('#beamNoLoad')&&/No load defined\. Add your own load\./.test($0('#beamNoLoad').textContent),'empty state on the model card');
  eq($0('#beamPicture').querySelectorAll('.bl-load, .bl-point, .bl-couple, .bl-sw, .bl-load-fill, .bl-sw-fill').length,0,'no load arrows on the beam picture');
  ok(!/P = |q = |C = |self-weight/.test($0('#beamPicture').textContent),'no load labels on the beam picture');
  ok(/No load is applied/.test($0('#beamPictureNote').textContent),'picture caption says no load is applied');
  eq($0('#beamCentre'),null,'no "Centre point · 2 N" shortcut');eq(t0.$$('[data-shape]').length,0,'no same-total-force shape buttons');
  ok(!/Centre point|Same total force|different shape/i.test($0('#foundations').textContent),'no automatic-load shortcut text');
  ok(['beamLoadA','beamLoadB','beamP','beamC','beamQ0','beamQ1'].every(id=>$0('#'+id).value===''),'the load form starts empty');
  $0('#beamLoadForm').dispatchEvent(new w0.Event('submit',{bubbles:true,cancelable:true}));
  eq($0('#beamLoadError').hidden,false,'submitting the untouched form is refused');eq(lab(w0).solved.model.loads.length,0,'and adds no load');
  for(const tab of ['diagrams','cut','solution','modes','compare','report','learn']) {$0(`[data-tab="${tab}"]`).click();ok(clean($0('#foundations').innerHTML),`zero load: clean ${tab} tab`);}
  const fbd=t0.$$('#beamSolution svg.bl-fbd').at(-1);
  ok(fbd&&[...fbd.querySelectorAll('.bl-react')].every(e=>e.closest('.bl-axial')),'solved free body: no arrow for a zero reaction (only the dashed H = 0 marker)');
  ok(/RA = 0 N/.test(fbd.textContent)&&/CA = 0 N·mm/.test(fbd.textContent),'zero reactions labelled 0 (reaction couple named C, as in Lecture 03)');
  ok(/every reaction is zero/.test($0('#beamSolution').textContent),'hand solution states that every reaction is zero');
  $0('[data-tab="cut"]').click();eq($0('#beamCutFbd').querySelectorAll('.bl-react, .bl-int').length,0,'cut free body: no arrows when nothing acts');
  eq(($0('#beamCutCheck').textContent.match(/✓/g)||[]).length,4,'cut equilibrium closes on both parts (the default view shows both)');
  $0('[data-tab="report"]').click();$0('#beamDownload').click();
  const doc0=JSON.parse(await t0.downloads[0].text());eq(doc0.model.loads.length,0,'saved study has no load');eq(doc0.model.selfWeight,false);
  $0('#beamCsv').click();ok((await t0.downloads[1].text()).split('\n').length>10,'results CSV exported');
  $0('#beamShare').click();await new Promise(res=>setTimeout(res,20));
  eq(Study.decodeShare(new URL($0('#beamShareBox').value).searchParams.get('beam')).loads.length,0,'share link carries no load');
  t0.addLoad('point',{beamLoadA:300,beamP:1});eq(lab(w0).solved.model.loads.length,1,'a user load is added');eq($0('#beamNoLoad'),null,'empty-state notice gone');
  ok($0('#beamPicture').querySelectorAll('.bl-load.bl-point').length===1&&/P = 1 N/.test($0('#beamPicture').textContent),'the user load is drawn (the arrow check above is not vacuous)');
  ok(!/No load defined/.test($0('#beamLoads').textContent));
  $0('#beamClear').click();eq(lab(w0).solved.model.loads.length,0,'Clear all loads');eq($0('#beamLoads').textContent.trim(),'No load defined. Add your own load.');ok($0('#beamNoLoad'));
  t0.dom.window.close();
  // Deliberately chosen examples keep their intended loads.
  for(const [name,check] of [['l03-tip',m=>m.loads.length===1&&m.loads[0].kind==='point'&&m.loads[0].force===2&&m.loads[0].position===450],
    ['hw2b-roller-pin',m=>m.loads.length===1&&m.loads[0].kind==='distributed']]) {
    const te=open(`https://example.org/wing-lab.html?beamCase=${name}`);
    ok(check(lab(te.w).solved.model),`?beamCase=${name} opens with its own load`);eq(te.$('#beamNoLoad'),null);te.dom.window.close();
  }
}

/* ---------- 1. initial solve, pending state, stale flags, revert ---------- */
let t=open(), {$,w}=t;
t.addLoad('point',{beamLoadA:450,beamP:2});
ok(/18\.2250 mm/.test(kpi($)),'2 N tip load entered by the user: 18.2250 mm');
eq($('#beamChip').textContent,'Solved');eq($('.bl-results').dataset.stale,'false');eq($('#beamStale').hidden,true);
eq($('#beamDownload').disabled,false);
t.input('#beamGeometry [name="E"]','4000');
eq($('#beamChip').textContent,'Pending','edit marks the study pending');
eq($('.bl-results').dataset.stale,'true');eq($('#beamKpis').dataset.stale,'true');eq($('#beamStale').hidden,false);
ok(/18\.2250 mm/.test(kpi($)),'old results stay visible but flagged');
for(const id of ['#beamDownload','#beamShare','#beamCsv','#beamPrintBtn','#beamSaveA']) eq($(id).disabled,true,`${id} disabled while pending`);
ok(/not solved yet/.test($('#beamPictureNote').textContent),'picture states that it shows unsolved inputs');
// Even if the guard were bypassed, exporting refuses while pending.
w.BeamLab.state();$('#beamDownload').disabled=false;$('#beamDownload').click();eq(t.downloads.length,0,'no download while pending');
ok(/Solve the current inputs/.test($('#beamExportStatus').textContent));
$('#beamRevert').click();
eq($('#beamChip').textContent,'Solved','revert restores the solved inputs');eq(+$('#beamGeometry [name="E"]').value,2000);
t.input('#beamGeometry [name="E"]','4000');$('#beamSolve').click();
ok(/9\.1125 mm/.test(kpi($)),'E doubled halves the tip deflection');eq($('#beamChip').textContent,'Solved');
t.input('#beamGeometry [name="length"]','abc');
ok(/Length L must be a number/.test($('#beamRunText').textContent),'invalid number reported');
$('#beamSolve').click();eq($('#beamChip').textContent,'Not solved');ok(/9\.1125 mm/.test(kpi($)));eq($('.bl-results').dataset.stale,'true');
$('#beamRevert').click();eq($('#beamChip').textContent,'Solved');

/* ---------- 2. mechanisms are rejected with a sketch; never shown as solved ---------- */
$('#beamleftSupport').value='pin';$('#beamrightSupport').value='free';$('#beamSolve').click();
eq($('#beamChip').textContent,'Not solved');ok(/rotate about the pin/.test($('#beamRunText').textContent));
ok($('#beamNotice .bl-mech'),'mechanism sketch shown');ok(/Mechanism/.test($('#beamSupportStatus').textContent));
eq($('#beamModeButtons').textContent.includes('Mode'),true,'previous modes remain, flagged stale');eq($('.bl-results').dataset.stale,'true');
$('#beamleftSupport').value='roller';$('#beamrightSupport').value='roller';$('#beamSolve').click();
ok(/Two rollers/.test($('#beamRunText').textContent),'axial mechanism rejected');
$('#beamRevert').click();

/* ---------- 3. interior supports and hinges from the panel ---------- */
$('#beamleftSupport').value='pin';$('#beamrightSupport').value='roller';
$('#beamAddSupport').click();
eq(t.$$('#beamInteriorList [data-row="support"]').length,1);eq(+$('#beamInteriorList [data-field="x"]').value,225);
ok(/indeterminate to degree 1/.test($('#beamSupportStatus').textContent),'live stability readout');
$('#beamClear').click();t.addLoad('rectangle',{beamLoadA:0,beamLoadB:450,beamQ0:2/450});     // uniform 2 N in total; solves the whole draft
let r=lab(w).solved.result;
eq(r.reactions.length,3);near(r.reactions[1].force,-10*(2/450)*225/8,1e-8,0,'two-span middle reaction');
eq(t.$$('#beamReactions td.num').length,12);
$('#beamAddHinge').click();
ok(/Mechanism|Stable/.test($('#beamSupportStatus').textContent));
t.input('#beamHingeList [data-field="x"]','225');$('#beamSolve').click();
r=lab(w).solved.result;near(r.stations.find(s=>s.x===225).Mleft,0,0,1e-6,'hinge over the support: M = 0');
t.$$('#beamHingeList [data-remove-row]')[0].click();t.$$('#beamInteriorList [data-remove-row]')[0].click();
eq(t.$$('#beamInteriorList [data-row]').length,0);$('#beamSolve').click();eq(lab(w).solved.result.reactions.length,2);

/* ---------- 4. graphical placement and dragging on the physical picture ---------- */
const svg=()=>$('#beamPicture svg'), xpx=x=>{const s=svg();return +s.dataset.x0+(+s.dataset.x1-+s.dataset.x0)*x/+s.dataset.length;};
$('[data-place="roller"]').click();eq($('[data-place="roller"]').getAttribute('aria-pressed'),'true');
t.pointer('pointermove',$('#beamPicture'),xpx(150));await new Promise(res=>setTimeout(res,40));ok($('#beamPicture .bl-ghost'),'ghost preview while placing (next frame)');
$('#beamPicture').dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:xpx(150)}));
eq(+$('#beamInteriorList [data-field="x"]').value,150,'click places a roller at the snapped station');
eq($('#beamChip').textContent,'Pending');
$('[data-place="roller"]').click();eq($('[data-place="roller"]').getAttribute('aria-pressed'),'false');
$('#beamSolve').click();eq($('#beamChip').textContent,'Solved');
const group=()=>[...$('#beamPicture').querySelectorAll('[data-support-kind]')].find(g=>g.dataset.draggable);
ok(group(),'interior support is draggable');
t.pointer('pointerdown',group().querySelector('path'),xpx(150));t.pointer('pointermove',$('#beamPicture'),xpx(300));
await new Promise(res=>setTimeout(res,40));
eq($('#beamChip').textContent,'Pending','mid-drag: results are marked pending at once');eq($('#beamDownload').disabled,true,'mid-drag: exports disabled');
t.pointer('pointerup',$('#beamPicture'),xpx(300));
await new Promise(res=>setTimeout(res,40));
eq(+$('#beamInteriorList [data-field="x"]').value,300,'drag moves the support');
$('#beamSolve').click();r=lab(w).solved.result;eq(r.input.supports.map(s=>s.x).join(),'0,300,450');
ok(t.$$('#beamPicture [data-support-kind]').map(g=>g.dataset.supportKind).join()==='pin,roller,roller');
const rollerGroup=t.$$('#beamPicture [data-support-kind="roller"]')[0];eq(rollerGroup.querySelectorAll('circle').length,2,'roller symbol keeps two circles');
eq(t.$$('#beamPicture [data-support-kind="pin"]')[0].querySelectorAll('circle').length,0,'pin symbol has no circles');

/* ---------- 5. loads: couple, edit, self-weight, section ---------- */
$('#beamClear').click();
$('#beamLoadKind').value='moment';$('#beamLoadKind').dispatchEvent(new w.Event('change'));
eq($('#beamCField').hidden,false);eq($('#beamPField').hidden,true);eq($('#beamLoadBField').hidden,true);
$('#beamLoadA').value='100';$('#beamC').value='60';
$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
r=lab(w).solved.result;eq(r.momentJumps.length,1);near(r.momentJumps[0].right-r.momentJumps[0].left,60,1e-9,0,'couple jump');
ok(/60 N·mm couple at x=100 mm/.test($('#beamLoads').textContent));
$('[data-edit-load="0"]').click();eq($('#beamLoadSubmit').textContent,'Update load 1 & solve');
$('#beamC').value='-60';$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
r=lab(w).solved.result;near(r.momentJumps[0].right-r.momentJumps[0].left,-60,1e-9);eq(t.$$('#beamLoads li').length,1,'edit replaces, not adds');
$('#beamLoadA').value='900';$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
eq($('#beamLoadError').hidden,false,'off-beam load rejected at the form');eq(t.$$('#beamLoads li').length,1);
$('#beamSelfWeight').checked=true;$('#beamSelfWeight').dispatchEvent(new w.Event('change',{bubbles:true}));
eq($('#beamChip').textContent,'Pending');$('#beamSolve').click();
r=lab(w).solved.result;eq(r.selfWeight.enabled,true);eq(t.$$('#beamLoads li').length,1,'self-weight is not listed as a user load');
ok(/incl\. self-weight/.test(kpi($)));near(r.resultant,r.selfWeight.total,1e-12);
$('#beamShape').value='tube';$('#beamShape').dispatchEvent(new w.Event('change',{bubbles:true}));
ok($('#beamSectionFields [data-sec="outerDiameter"]'),'tube fields');ok(/Circular tube/.test($('#beamSectionBadge').textContent));
t.input('#beamSectionFields [data-sec="thickness"]','8');ok(/D\/2/.test($('#beamSectionView').textContent),'thickness validated live');
t.input('#beamSectionFields [data-sec="thickness"]','1');$('#beamSolve').click();
r=lab(w).solved.result;eq(r.section.shape,'tube');near(r.maxima.shearStress,r.sectionProperties.shearFactor*r.maxima.shear/r.area,1e-12,0,'tube τmax = k|V|/A');
ok(r.sectionProperties.shearFactor>1.9,'tube k is near 2, not 1.5');
ok(clean($('#foundations').innerHTML),'no NaN/undefined after section change');

/* ---------- 6. moving cut: limits at jumps and verifiable free-body equilibrium ---------- */
$('[data-beam-preset="l03-centre"]').click();
eq(lab(w).solved.model.section.shape,'rectangle');ok(/5\.6953 mm/.test(kpi($)),'Lecture 03 centre-force preset');
$('[data-tab="cut"]').click();eq($('#beamTab-cut').hidden,false);ok($('#beamPicture [data-cut-handle]'),'cut line on the physical picture');
w.BeamLab.setCut(225);
eq($('#beamCutLimitField').hidden,false,'jump at the point force offers x⁻ / x⁺');
ok(/V = 2 N/.test($('#beamCutFbd').textContent)&&/M = 0 N·mm/.test($('#beamCutFbd').textContent),'x⁻ values on the cut face (M = 0 under the load)');
eq((($('#beamCutCheck').textContent).match(/✓/g)||[]).length,4,'ΣF and ΣM close on the left and the right part (both shown by default)');
ok(/2 \(x⁻\) \| 0 \(x⁺\) N/.test($('#beamCutValues').textContent.replace(/\s+/g,' ')),'both shear limits listed');
$('[data-cut-limit="right"]').click();ok(/V = 0 N/.test($('#beamCutFbd').textContent));eq((($('#beamCutCheck').textContent).match(/✓/g)||[]).length,4);
$('[data-cut-side="right"]').click();eq((($('#beamCutCheck').textContent).match(/✓/g)||[]).length,2,'right part balances too');
eq($('#beamCutFbd').querySelectorAll('[data-support-kind]').length,0,'cut free body has no support symbols');
eq($('#beamCutCharts').querySelectorAll('.bl-cut-dot').length,4,'V and M markers at both limits');
ok($('#beamCutSection .bl-secstress'),'stress through the depth at the cut');
w.BeamLab.setCut(100);eq($('#beamCutLimitField').hidden,true,'no jump away from the load');
// Lecture 03 software activity A: tip-load cantilever, cut at x = 150 mm gives M = −600 N·mm.
$('[data-beam-preset="l03-tip"]').click();$('[data-cut-side="left"]').click();
$('#beamCut').value='150';$('#beamCut').dispatchEvent(new w.Event('input'));ok(/x = 150 mm/.test($('#beamCutRead').textContent));
ok(/−600 N·mm/.test($('#beamCutValues').textContent),'M(150) = −600 N·mm');ok(/hogging/.test($('#beamCutFbd').textContent));

/* ---------- 7. Show the solution ---------- */
$('[data-beam-preset="l03-fixed"]').click();$('[data-tab="solution"]').click();
let sol=$('#beamSolution').textContent;
ok(/indeterminate to degree 2/.test(sol));ok(/Why equilibrium alone is not enough/.test(sol));ok(/Compatibility/.test(sol));
ok(/θ\(450 mm\) = 0/.test(sol)&&/v\(450 mm\) = 0/.test(sol),'actual compatibility conditions listed');
ok(/Hand-check available for this exact textbook case: Fixed–fixed, centre point force/.test(sol));
const fbds=t.$$('#beamSolution svg.bl-fbd'), physical=t.$$('#beamSolution svg.bl-schematic');
ok(fbds.length>=2&&physical.length>=2,'separate physical and free-body figures');
for(const f of fbds) eq(f.querySelectorAll('[data-support-kind], .bl-support').length,0,'FBD never shows support symbols');
for(const f of physical) ok(f.querySelectorAll('.bl-react').length===0,'physical figure never shows reactions');
ok(clean($('#beamSolution').innerHTML));
$('[data-beam-preset="l03-simple"]').click();sol=$('#beamSolution').textContent;
ok(/Statically determinate/.test(sol)&&/agree with the FE reactions/.test(sol),'determinate hand solution');
$('[data-beam-preset="hw2b-roller-pin"]').click();
ok($('#beamSolution details.bl-reveal'),'HW 2B worked steps are behind a reveal');ok(/HW 2B Case 2/.test($('#beamSolution').textContent));
$('#beamRefine').click();ok(/40/.test($('#beamConvergence').textContent));
// A load whose intensity changes sign can have W = 0: it enters ΣM as its net couple, never as (0)(arm).
w.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,leftSupport:'pin',rightSupport:'roller',loads:[{kind:'distributed',start:0,end:450,qStart:0.01,qEnd:-0.01}]})}));
$('[data-tab="solution"]').click();sol=$('#beamSolution').textContent.replace(/\s+/g,' ');
ok(/W = 0: a net couple/.test(sol),'zero-resultant load described as a net couple');
ok(/\(450\) RB \+ 337\.5 = 0/.test(sol),'ΣM_A uses the couple 337.5 N·mm');ok(!/\(0\)\(/.test(sol),'no (0)(arm) term');
ok(/RB = −337\.5 ?450 = −0\.75 N \(↓\)/.test(sol),'R_B = −337.5 / 450 = −0.75 N, downward');

/* ---------- 8. Compare A/B: independent snapshots, identical axes and colour scale ---------- */
$('[data-beam-preset="l03-tip"]').click();$('[data-tab="compare"]').click();
$('#beamSaveA').click();
$('#beamShape').value='ibeam';$('#beamShape').dispatchEvent(new w.Event('change',{bubbles:true}));$('#beamSolve').click();
$('#beamSaveB').click();
const cmp=$('#beamCompare').textContent;
ok(/Cross-section/.test(cmp)&&!/The loads differ/.test(cmp),'changed variable listed, loads equal');
const A0=JSON.stringify(lab(w).compare.A.model),B0=JSON.stringify(lab(w).compare.B.model);
t.input('#beamGeometry [name="E"]','9000');$('#beamSolve').click();
eq(JSON.stringify(lab(w).compare.A.model),A0,'A unchanged by later edits');eq(JSON.stringify(lab(w).compare.B.model),B0,'B unchanged');
const maps=t.$$('#beamCompare .bl-stressmap');eq(maps.length,2);
const scaleOf=s=>s.getAttribute('aria-label').match(/±([^ ]+) MPa/)[1];eq(scaleOf(maps[0]),scaleOf(maps[1]),'same colour scale');
ok(t.$$('#beamCompare .bl-chart').every(c=>c.querySelector('.bl-curve')&&c.querySelector('.bl-curve-b')),'A and B on the same axes');
t.addLoad('point',{beamLoadA:225,beamP:2});$('#beamSaveB').click();ok(/The loads differ/.test($('#beamCompare').textContent),'warning when loads differ');
$('#beamRestoreA').click();eq(JSON.stringify(lab(w).solved.model),A0,'A reloaded into the editor');
$('#beamEqualMassBtn').click();
const em=t.$$('#beamEqualMass tr').slice(1);eq(em.length,7);ok(/same area A = 200/.test($('#beamEqualMass').textContent));
t.input('#beamGeometry [name="E"]','4000');$('#beamSolve').click();
eq($('#beamEqualMass').innerHTML,'','a new solve clears the equal-mass table made for the previous model');

/* ---------- 9. Save, import (safe), CSV, share link, print ---------- */
$('[data-tab="report"]').click();
$('#beamExplain').value='<img src=x onerror="window.hacked=1">notes';
$('#beamDownload').click();eq(t.downloads.length,1);
const saved=await t.downloads[0].text(), parsed=JSON.parse(saved);
eq(parsed.format,'mie446-beam-study');eq(parsed.version,2);eq(parsed.notes,'<img src=x onerror="window.hacked=1">notes');
$('#beamCsv').click();ok((await t.downloads[1].text()).startsWith('x_mm,side,v_mm'));
$('#beamCsvReactions').click();ok((await t.downloads[2].text()).startsWith('x_mm,support'));
$('#beamPrintBtn').click();eq(w.printed,1);ok(w.document.body.classList.contains('beam-printing'));
const report=$('#beamPrint');
ok(report.querySelector('svg.bl-schematic')&&report.querySelector('svg.bl-fbd'),'report has input schematic and separate FBD');
eq(report.querySelectorAll('img').length,0,'notes are escaped in the report');ok(/&lt;img/.test(report.innerHTML));
ok(/Assumptions and limitations/.test(report.textContent)&&/Supports and loads/.test(report.textContent));
w.dispatchEvent(new w.Event('afterprint'));ok(!w.document.body.classList.contains('beam-printing'));
// Import a different study, then a hostile and a newer one.
const other=Study.exportStudy({result:B.solve({length:300,section:{shape:'circle',diameter:12},E:3000,density:1.1,elements:20,supports:[{x:0,kind:'fixed'},{x:200,kind:'roller'}],hinges:[],loads:[{kind:'point',position:300,force:1}],selfWeight:false}),notes:'<script>window.hacked=2</script>'});
ok(w.BeamLab.importText(other),'valid import');eq(lab(w).solved.model.length,300);eq($('#beamExplain').value,'<script>window.hacked=2</script>');
eq(w.hacked,undefined,'imported notes never execute');eq($('#foundations').querySelectorAll('script,img[onerror]').length,0);
const before=JSON.stringify(lab(w).solved.model);
ok(!w.BeamLab.importText(JSON.stringify({...JSON.parse(other),version:7})),'newer version refused');ok(/newer Beam Lab/.test($('#beamExportStatus').textContent));
ok(!w.BeamLab.importText('{"format":"mie446-beam-study","version":2,"model":{"length":-5}}'),'invalid model refused');
eq(JSON.stringify(lab(w).solved.model),before,'refused imports leave the study unchanged');
// All or nothing: a file that parses but cannot be solved changes nothing (notes and A/B included).
const notesBefore=$('#beamExplain').value, abBefore=JSON.stringify(Object.keys(lab(w).compare).map(k=>!!lab(w).compare[k]));
const tooClose={...JSON.parse(other),notes:'should not appear',compare:null};tooClose.model={...tooClose.model,loads:[{kind:'point',position:100,force:1},{kind:'point',position:100.00001,force:1}]};
ok(!w.BeamLab.importText(JSON.stringify(tooClose)),'a file the solver rejects is refused');ok(/too close.*unchanged/.test($('#beamExportStatus').textContent));
eq($('#beamExplain').value,notesBefore,'notes untouched');eq(JSON.stringify(Object.keys(lab(w).compare).map(k=>!!lab(w).compare[k])),abBefore,'A/B untouched');
eq(JSON.stringify(lab(w).solved.model),before);eq($('#beamChip').textContent,'Solved','still solved and current');
$('#beamShare').click();await new Promise(res=>setTimeout(res,20));
const link=$('#beamShareBox').value;ok(link.includes('?beam='),'share link built');
t.input('#beamGeometry [name="E"]','5000');$('#beamSolve').click();
eq($('#beamShareBox').hidden,true,'a new solve hides the link made for the previous model');eq($('#beamShareBox').value,'');
ok(!/opens this exact model/.test($('#beamExportStatus').textContent),'no stale share message');
t.dom.window.close();

/* ---------- 10. URL cases ---------- */
t=open(link);({$,w}=t);
eq(JSON.stringify(lab(w).solved.model),before,'link reopens the same model');ok(/Shared study opened/.test($('#beamStatus').textContent));
t.dom.window.close();
t=open('https://example.org/wing-lab.html?beam=%3Cscript%3E');({$,w}=t);
ok(/could not be opened/.test($('#beamStatus').textContent)&&lab(w).solved.model.loads.length===0&&/0\.0000 mm/.test(kpi($)),'bad link falls back to the default study (no load)');
t.dom.window.close();
// A well-formed link whose model the solver rejects also falls back to the solved default study.
t=open(`https://example.org/wing-lab.html?beam=${Buffer.from(JSON.stringify({v:2,m:tooClose.model})).toString('base64url')}`);({$,w}=t);
ok(/could not be opened.*too close/.test($('#beamStatus').textContent)&&lab(w).solved.model.loads.length===0&&/0\.0000 mm/.test(kpi($)),'unsolvable link falls back to the default study (no load)');
eq($('#beamChip').textContent,'Solved');t.dom.window.close();
t=open(`https://example.org/wing-lab.html?beamCase=hw2b-fixed&${new URL(link).search.slice(1)}`);({$,w}=t);
ok(/HW 2B/.test($('#beamStatus').textContent)&&lab(w).solved.model.E===2200,'beamCase deep link keeps priority');
/* ---------- 11. keyboard tabs, companion link, clean markup ---------- */
const tabs=t.$$('[role="tab"]');tabs[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
eq(w.document.activeElement,tabs[1]);eq($('#beamTab-cut').hidden,false);
tabs[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));eq(w.document.activeElement,tabs.at(-1));
const link2=$('.bl-companion a.companion-link');
eq(link2.getAttribute('href'),'https://vinco-rc.com/?generator=wing');eq(link2.getAttribute('target'),'_blank');eq(link2.getAttribute('rel'),'noopener noreferrer');
eq($('#foundations').querySelectorAll('iframe').length,0);
ok(clean($('#foundations').innerHTML),'no NaN/undefined/Infinity anywhere');
t.dom.window.close();
/* ---------- review fixes: cut check scale, support limit, messages, shape select, no modes, fallback drag ---------- */
{
  const t3=open(), $3=t3.$, w3=t3.w, checksOf=()=>($3('#beamCutCheck').textContent.match(/✓/g)||[]).length;
  ok(/Solved/.test($3('#beamStatus').textContent));t3.input('#beamGeometry [name="E"]','2100');
  eq($3('#beamStatus').textContent,'','an edit clears the previous run message');eq($3('#beamChip').textContent,'Pending');
  // Whole beam kept at a pinned end: the sums cancel to ~0, so the check must be scaled by the size of the terms.
  w3.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,elements:100,supports:[{x:0,kind:'pin'},{x:150,kind:'roller'},{x:300,kind:'roller'},{x:450,kind:'roller'}],
    loads:[{kind:'distributed',start:0,end:450,qStart:0.01,qEnd:0.01},{kind:'point',position:400,force:5}]})}));
  $3('[data-tab="cut"]').click();w3.BeamLab.setCut(0);$3('[data-cut-side="right"]').click();
  eq(checksOf(),2,'ΣF and ΣM close for the whole beam cut at the pin');ok(!/✗/.test($3('#beamCutCheck').textContent),'no false ✗');
  w3.BeamLab.setCut(450);$3('[data-cut-side="left"]').click();eq(checksOf(),2,'and at the far roller');
  ok(/V &gt; 0 acts ↓/.test($3('#beamCutFbd').innerHTML),'caption states the label convention');
  // At most 12 supports, counting the end supports that are present.
  for(let k=0;k<12;k++) $3('#beamAddSupport').click();
  eq(t3.$$('#beamInteriorList [data-row="support"]').length,10,'10 interior + 2 end supports = the limit of 12');
  ok(/At most 12 supports/.test($3('#beamStatus').textContent));
  $3('#beamrightSupport').value='free';$3('#beamAddSupport').click();
  eq(t3.$$('#beamInteriorList [data-row="support"]').length,11,'a free end frees one place');
  $3('#beamRevert').click();
  // The shape <select> fires input before change: no transient "Cannot read properties" message.
  $3('#beamShape').value='box';$3('#beamShape').dispatchEvent(new w3.Event('input',{bubbles:true}));
  ok(!/Cannot read|null/.test($3('#beamRunText').textContent+$3('#beamSectionView').textContent),'input event of the shape select is ignored');
  $3('#beamShape').dispatchEvent(new w3.Event('change',{bubbles:true}));ok($3('#beamSectionFields [data-sec="thickness"]'),'box fields after change');
  // Every DOF restrained: a valid static result and no modes (never a fake or repeated mode).
  ok(w3.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,elements:4,supports:[0,112.5,225,337.5,450].map(x=>({x,kind:'fixed'})),loads:[{kind:'point',position:225,force:2}]})})),'fully restrained study solves');
  eq(lab(w3).solved.result.modes.length,0);$3('[data-tab="modes"]').click();
  ok(/No bending mode/.test($3('#beamModeButtons').textContent));eq($3('#beamAnimate').disabled,true);
  ok(/f₁—Hz/.test($3('#beamKpis').textContent.replace(/\s+/g,'')),'f₁ shown as —');
  $3('#beamRefine').click();eq(t3.$$('#beamConvergence tr').length,4,'convergence table builds (finer meshes add free nodes, hence modes)');ok(clean($3('#foundations').innerHTML));
  // Invalid input: the picture falls back to the last valid model and its supports cannot be dragged.
  w3.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,supports:[{x:0,kind:'pin'},{x:200,kind:'roller'},{x:450,kind:'roller'}],hinges:[],loads:[{kind:'point',position:300,force:1}]})}));
  t3.input('#beamGeometry [name="length"]','abc');ok(/invalid/.test($3('#beamPictureNote').textContent));
  const g=[...$3('#beamPicture').querySelectorAll('[data-support-kind]')].find(x=>x.dataset.draggable);
  t3.pointer('pointerdown',g.querySelector('path'),300);t3.pointer('pointermove',$3('#beamPicture'),500);t3.pointer('pointerup',$3('#beamPicture'),500);
  await new Promise(res=>setTimeout(res,40));
  eq(+$3('#beamInteriorList [data-field="x"]').value,200,'no drag on the fallback picture');ok(/Fix the invalid input first/.test($3('#beamStatus').textContent));
  t3.dom.window.close();
}
/* ---------- a load edit in progress never outlives the loads it refers to ---------- */
{
  const t2=open(), $2=t2.$, w2=t2.w, submit=()=>$2('#beamLoadForm').dispatchEvent(new w2.Event('submit',{bubbles:true,cancelable:true}));
  // Two user loads on the clamp: the "move to midspan" notice then replaces the loads programmatically.
  t2.addLoad('point',{beamLoadA:0,beamP:1});t2.addLoad('point',{beamLoadA:0,beamP:2});eq(t2.$$('#beamLoads li').length,2);
  $2('[data-edit-load="0"]').click();eq($2('#beamLoadSubmit').textContent,'Update load 1 & solve');
  t2.input('#beamGeometry [name="E"]','2500');$2('#beamRevert').click();
  eq($2('#beamLoadSubmit').textContent,'Add load & solve','revert cancels a load edit in progress');eq($2('#beamLoadCancel').hidden,true);
  $2('[data-edit-load="1"]').click();ok($2('#beamMoveCentre'),'loads on the clamp: the notice offers to move them');$2('#beamMoveCentre').click();
  eq($2('#beamLoadSubmit').textContent,'Add load & solve','replacing the loads cancels the edit');
  $2('#beamLoadKind').value='point';$2('#beamLoadKind').dispatchEvent(new w2.Event('change'));
  $2('#beamLoadA').value='100';$2('#beamP').value='1';submit();
  eq(t2.$$('#beamLoads li').length,3,'the next submit adds a load instead of overwriting a replaced one');
  $2('[data-edit-load="1"]').click();
  w2.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,loads:[{kind:'point',position:450,force:2}]})}));
  eq($2('#beamLoadSubmit').textContent,'Add load & solve','importing a study cancels the edit');eq(t2.$$('#beamLoads li').length,1);
  $2('#beamLoadA').value='200';$2('#beamP').value='1';submit();
  eq(lab(w2).solved.result.input.loads.length,2,'no hole in the load list after an import during an edit');
  t2.dom.window.close();
}
console.log(`Beam Lab UI: ${checks} DOM workflow checks passed (no-load opening and exports, pending/stale/revert, mechanisms, supports/hinges/placement/drag, couples, self-weight, sections, cut limits, solution, A/B, import/export/print safety, links, keyboard).`);
