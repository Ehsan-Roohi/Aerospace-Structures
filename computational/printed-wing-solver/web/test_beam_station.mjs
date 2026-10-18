// Shear sign and exact station readout (jsdom DOM component tests; not a rendering test).
// 1. The sign convention is verified independently of the solver: a tip-heavy triangular load on a cantilever
//    (L = 450 mm, q = 0 → 0.002 N/mm; HW 2B Case 1) against closed forms and against equilibrium of the RIGHT
//    part, which does not use the reactions. V = dM/dx, dV/dx = −q and V(0⁺) = −R hold; nothing is flipped.
// 2. The readout: one click to x = L/2, exact V and M, Euler–Bernoulli v and θ with units, x⁻/x⁺ at jumps,
//    the same station as the plot markers, the beam picture and Cut & section.
// 3. The sign key and the reaction/internal table, the two-part cut free body, the no-load opening and the
//    Lecture 03 / HW 2B deep links.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js'), Study=require('./beam_study.js'), D=require('./beam_diagrams.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const near=(a,b,tol,m)=>{assert.ok(Math.abs(a-b)<=tol,`${m}: ${a} vs ${b}`);checks++;};

function open(query='') {
  const dom=new JSDOM('<div id="foundations"></div>',{url:`https://example.org/wing-lab.html${query}`,runScripts:'outside-only'});
  const w=dom.window;
  // SVGs get a layout box equal to their viewBox, so pointer coordinates map 1 : 1 (as in test_beam_ui.mjs).
  const rect=w.Element.prototype.getBoundingClientRect;
  w.Element.prototype.getBoundingClientRect=function(){
    if(this.tagName.toLowerCase()==='svg'){const W=+this.getAttribute('width')||760,H=+this.getAttribute('height')||200;return {left:0,top:0,x:0,y:0,width:W,height:H,right:W,bottom:H};}
    return rect.call(this);
  };
  const env=loadBeamLab(dom), $=env.$;
  const Ctor=w.PointerEvent||w.MouseEvent;
  return {...env,dom,
    pointer:(type,target,clientX)=>target.dispatchEvent(new Ctor(type,{bubbles:true,cancelable:true,clientX,clientY:20,pointerId:1})),
    click:(target,clientX)=>target.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,clientX,clientY:20})),
    typeX:value=>{$('#beamStationX').value=String(value);$('#beamStationForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));},
    card:k=>$(`#beamStationCards [data-q="${k}"]`),
    station:()=>w.BeamLab.readStation()};
}
const clean=html=>!/NaN|undefined|Infinity/.test(html);
const txt=el=>el.textContent.replace(/\s+/g,' ');

/* ---------- 1. the sign convention, verified without the UI ---------- */
const L=450, q1=0.002, q=x=>q1*x/L;
// Simpson's rule, independent of the engine.
const simpson=(f,a,b,n=2000)=>{if(b<=a)return 0;const h=(b-a)/n;let s=f(a)+f(b);for(let i=1;i<n;i++)s+=(i%2?4:2)*f(a+i*h);return s*h/3;};
for(const [name,section,E] of [['20 × 10 mm, E = 2000',{shape:'rectangle',width:20,height:10},2000],['HW 2B 16 × 8 mm, E = 2200',{shape:'rectangle',width:16,height:8},2200]]) {
  const r=B.solve({length:L,E,elements:30,section,supports:[{x:0,kind:'fixed'}],loads:[{kind:'distributed',start:0,end:L,qStart:0,qEnd:q1}]});
  const EI=E*section.width*section.height**3/12, R=r.reactions[0];
  near(r.resultant,0.45,1e-15,`${name}: W = q·L/2 = 0.45 N`);near(r.appliedMoment/r.resultant,300,1e-12,'centroid x̄ = 2L/3 = 300 mm');
  near(R.force,-0.45,1e-9,'root reaction −0.45 N in app signs (0.45 N upward)');near(R.moment,-135,1e-7,'root couple −135 N·mm in app signs (counter-clockwise)');
  // Equilibrium of the RIGHT part [x, L] uses only the load, not the reactions: on its cut face positive V acts
  // up and positive M clockwise, so V(x) = ∫ q ds and M(x) = −∫ q(s)(s − x) ds over [x, L].
  const Vright=x=>simpson(q,x,L), Mright=x=>-simpson(s=>q(s)*(s-x),x,L);
  const Vexact=x=>0.45-x*x/450000, Mexact=x=>-(q1/(6*L))*(2*L**3-3*L*L*x+x**3);
  const vExact=x=>q1/(120*L*EI)*(20*L**3*x*x-10*L*L*x**3+x**5), tExact=x=>q1/(24*L*EI)*(8*L**3*x-6*L*L*x*x+x**4);
  for(const x of [0,112.5,225,230,337.5,450]) {
    const f=B.fieldAt(r,x,x===L?'left':'right');
    near(f.V,Vexact(x),1e-11,`V(${x}) closed form`);near(f.V,Vright(x),1e-11,`V(${x}) equals the right-part equilibrium (no reactions used)`);
    near(f.M,Mexact(x),1e-8,`M(${x}) closed form`);near(f.M,Mright(x),1e-8,`M(${x}) equals the right-part equilibrium`);
    near(f.v,vExact(x),Math.abs(vExact(x))*1e-6+1e-12,`v(${x}) Euler–Bernoulli`);near(f.theta,tExact(x),Math.abs(tExact(x))*1e-5+1e-12,`θ(${x}) Euler–Bernoulli`);
  }
  near(B.fieldAt(r,225).V,0.3375,1e-11,'V(L/2) = +0.3375 N');near(B.fieldAt(r,225).M,-42.1875,1e-8,'M(L/2) = −42.1875 N·mm');
  near(B.fieldAt(r,0,'right').V,-R.force,1e-12,'V(0⁺) = −R (app signs)');near(B.fieldAt(r,0,'right').M,R.moment,1e-9,'M(0⁺) = +M_R');
  ok(r.shear[0]>0&&r.moment[0]<0,'plotted V(0⁺) is positive and M(0⁺) negative (hogging): coherent, not flipped');
  // dV/dx = −q and V = dM/dx (central differences of the exact fields), and V > 0 exactly where M increases.
  for(const x of [20,100,225,300,430]) {
    const h=1e-3, dV=(B.fieldAt(r,x+h).V-B.fieldAt(r,x-h).V)/(2*h), dM=(B.fieldAt(r,x+h).M-B.fieldAt(r,x-h).M)/(2*h);
    near(dV,-q(x),1e-9,`dV/dx = −q at x = ${x}`);near(dM,B.fieldAt(r,x).V,1e-6,`dM/dx = V at x = ${x}`);ok(Math.sign(dM)===Math.sign(B.fieldAt(r,x).V),'V > 0 where M increases');
  }
}

/* ---------- 2. HW 2B Case 1 deep link: the readout at L/2 and at the root ---------- */
{
  const t=open('?beamCase=hw2b-cantilever'), {$,$$,w}=t, EI=2200*16*8**3/12;
  const vExact=x=>q1/(120*L*EI)*(20*L**3*x*x-10*L*L*x**3+x**5), tExact=x=>q1/(24*L*EI)*(8*L**3*x-6*L*L*x*x+x**4);
  ok(/-0\.450000 N/.test($('#beamReactions').textContent)&&/-135\.000000 N·mm/.test($('#beamReactions').textContent),'reaction table: −0.45 N and −135 N·mm (app signs)');
  eq($('#beamTab-diagrams').hidden,false,'the readout is on the Diagrams tab, open by default');
  ok(/Station x = 225 mm = L\/2/.test($('#beamStationRead').textContent),'the station starts at x = L/2');
  eq($('[data-station-frac="0.5"]').getAttribute('aria-current'),'true','L/2 button marked current');
  eq(txt(t.card('V').querySelector('.bl-stat-v')),'+0.3375 N','V(L/2) = +0.3375 N');
  eq(txt(t.card('M').querySelector('.bl-stat-v')),'−42.1875 N·mm','M(L/2) = −42.1875 N·mm');
  eq(txt(t.card('v').querySelector('.bl-stat-v')),`+${D.fmt(vExact(225),6)} mm`,'v(L/2) with units (Euler–Bernoulli closed form, 6 digits)');
  eq(txt(t.card('theta').querySelector('.bl-stat-v')),`+${D.fmt(tExact(225),6)} rad`,'θ(L/2) with units');
  const s=t.station();near(s.at.V,0.3375,1e-11,'readStation V');near(s.at.M,-42.1875,1e-8,'readStation M');
  near(s.at.v,vExact(225),vExact(225)*1e-9,'v at a node equals the beam-theory value');near(s.at.theta,tExact(225),tExact(225)*1e-9,'θ at a node');
  ok(/↓ on the left part's cut face, ↑ on the right part's/.test(t.card('V').textContent),'V card says what +V means on each face');
  ok(/hogging: top in tension/.test(t.card('M').textContent),'M card: hogging');
  ok(/Exact: equilibrium/.test(t.card('V').textContent)&&/Exact: moments/.test(t.card('M').textContent),'V and M are labelled exact (equilibrium)');
  ok(/Euler–Bernoulli finite element: value at a mesh node/.test(t.card('v').textContent),'v labelled Euler–Bernoulli FE (node)');
  // The two faces of the cut: same signed V and M, opposite arrows.
  const faces=$('#beamStationFaces svg');
  ok(/V = \+0\.3375 N acts down on the left part's face and up on the right part's face/.test(faces.getAttribute('aria-label')),'faces: V direction on each face');
  ok(/M = −42\.1875 N·mm acts clockwise on the left part's face and counter-clockwise on the right part's face/.test(faces.getAttribute('aria-label')),'faces: M direction on each face');
  eq(faces.querySelector('[data-face="left"][data-v]').dataset.v,'down');eq(faces.querySelector('[data-face="right"][data-v]').dataset.v,'up','opposite V arrows');
  eq(faces.querySelector('[data-face="left"][data-m]').dataset.m,'cw');eq(faces.querySelector('[data-face="right"][data-m]').dataset.m,'ccw','opposite M arcs');
  const arrowDown=g=>{const l=g.querySelector('line');return +l.getAttribute('y2')>+l.getAttribute('y1');};
  ok(arrowDown(faces.querySelector('[data-face="left"][data-v]'))&&!arrowDown(faces.querySelector('[data-face="right"][data-v]')),'arrow geometry matches the stated directions');
  // Sign key and the reaction/internal table: V(0⁺) = −R_A, M(0⁺) = +C_A (C: reaction couple, as in Lecture 03).
  const key=txt($('#beamSignKey'));
  ok(/V and M are internal/.test(key)&&/A reaction is external/.test(key)&&/V = dM\/dx and dV\/dx = −q/.test(key),'sign key: internal versus external, V = dM/dx, dV/dx = −q');
  ok(/RA = −0\.45 N \(0\.45 N ↑\), so V\(0⁺\) = −RA = \+0\.45 N/.test(key),'sign key: V(0⁺) = −R_A = +0.45 N');
  ok(/CA = −135 N·mm \(135 N·mm ↺\), so M\(0⁺\) = \+CA = −135 N·mm/.test(key),'sign key: M(0⁺) = +C_A = −135 N·mm');
  const rowA=$('#beamReactionShear tr[data-support="A"]');
  ok(rowA&&/RA = −0\.45 N \(0\.45 N ↑\)/.test(txt(rowA))&&/outside the beam/.test(txt(rowA)),'reaction/internal table: external reaction and the outside of the beam');
  ok(/ΔV = \+0\.45 N = −RA ✓/.test(txt(rowA))&&/ΔM = −135 N·mm = \+CA ✓/.test(txt(rowA)),'thin slice: ΔV = −R_A and ΔM = +C_A');
  eq($$('#beamReactions td.num').length,4,'the original reaction table is unchanged (4 numeric cells)');
  // Plot markers at the station on all six plots; the shear plot carries its sign key.
  eq($$('#beamCharts .bl-cut-dot').length,6,'one marker per plot (no jump here)');
  ok(/V\(x\) = 0\.3375/.test($('#beamCharts [data-key="shear"]').textContent),'shear plot marker shows the exact value');
  ok(/V > 0 acts ↓ on the left part's cut face and ↑ on the right part's/.test($('#beamCharts [data-key="shear"] figcaption').textContent),'sign key beside the shear diagram');
  ok(/not a reaction/.test($('#beamCharts [data-key="shear"] figcaption').textContent));
  // One click to the root and to the tip.
  $('[data-station-frac="0"]').click();
  ok(/Station x = 0 mm \(left end: values just inside the beam, at x = 0⁺\)/.test($('#beamStationRead').textContent),'x = 0 reads the right limit 0⁺');
  eq(txt(t.card('V').querySelector('.bl-stat-v')),'+0.45 N','V(0⁺) = +0.45 N = −R_A');eq(txt(t.card('M').querySelector('.bl-stat-v')),'−135 N·mm','M(0⁺) = −135 N·mm');
  $('[data-station-frac="1"]').click();
  eq(txt(t.card('V').querySelector('.bl-stat-v')),'0 N','V(L⁻) = 0 at the free tip');eq(txt(t.card('M').querySelector('.bl-stat-v')),'0 N·mm');ok(/no shear at this cut/.test(t.card('V').textContent));
  $('[data-station-frac="0.5"]').click();near(t.station().x,225,0,'one click back to L/2');
  // Typed station between nodes: exact V and M (not the plotted samples), interpolated v and θ.
  t.typeX(230);const r=w.BeamLab.state().solved.result, f=t.station();
  near(f.x,230,0,'typed x');near(f.at.V,0.45-230*230/450000,1e-10,'V(230) exact (round-off of the FE reactions only)');near(f.at.M,-(q1/(6*L))*(2*L**3-3*L*L*230+230**3),1e-8,'M(230) exact (round-off only)');
  let i=0;while(i<r.x.length-1&&r.x[i+1]<=230)i++;
  ok(Math.abs(r.shear[i]-f.at.V)>1e-4,'the nearest plotted sample differs, so this checks the exact evaluation');
  near(f.at.v,vExact(230),vExact(230)*1e-6,'v(230): cubic Hermite interpolation, very close');
  ok(/cubic Hermite interpolation between the nodes at 225 and 240 mm \(very close, not exact, under the line load on this element\)/.test(t.card('v').textContent),'v source names the interpolation and its accuracy');
  eq(txt(t.card('V').querySelector('.bl-stat-v')),`+${D.fmt(0.45-230*230/450000,6)} N`);
  t.typeX(600);near(t.station().x,450,0,'off-beam x goes to the nearest end');ok(/is not on the beam/.test($('#beamStationRead').textContent),'and says so');
  t.typeX('');ok(/Type a number for x/.test($('#beamStationRead').textContent),'empty x asks for a number');near(t.station().x,450,0,'and changes nothing');
  $('#beamStationX').value='150';$('#beamStationX').dispatchEvent(new w.Event('change'));near(t.station().x,150,0,'change event applies x as well');
  /* ---------- 3. one station everywhere ---------- */
  $('[data-tab="cut"]').click();
  ok(/Cut at x = 150 mm/.test($('#beamCutRead').textContent)&&+$('#beamCut').value===150&&+$('#beamCutX').value===150,'Cut & section opens at the readout station');
  $('#beamCut').value='300';$('#beamCut').dispatchEvent(new w.Event('input'));
  $('[data-tab="diagrams"]').click();ok(/Station x = 300 mm/.test($('#beamStationRead').textContent),'moving the cut moves the readout');
  ok($('#beamPicture [data-cut-handle]'),'the cut line is drawn on the beam picture on the Diagrams tab');
  ok(/V\(x\) = 0\.25/.test($('#beamCharts [data-key="shear"]').textContent),'plot markers follow (V(300) = 0.25 N)');
  // Click a plot: the station moves there (rounded to 0.5 mm, or snapped to a quarter point within 6 px).
  const chartPx=(key,x)=>{const s=$(`#beamCharts [data-key="${key}"] svg`);return +s.dataset.x0+(+s.dataset.x1-+s.dataset.x0)*x/+s.dataset.length;};
  t.click($('#beamCharts [data-key="moment"]'),chartPx('moment',100.3));near(t.station().x,100.5,1e-9,'click on the moment plot sets x (0.5 mm steps)');
  t.click($('#beamCharts [data-key="deflection"]'),chartPx('deflection',226.2));near(t.station().x,225,0,'a click near L/2 snaps to L/2');
  t.pointer('pointermove',$('#beamCharts [data-key="moment"]'),chartPx('moment',230));
  ok(/x = 230 mm → −40\.5126 N·mm \(exact\)/.test($('#beamCharts [data-key="moment"] .bl-chart-hover').textContent),'hover reads the exact value at the pointer (M(230) = −40.5126), not a sample');
  // Drag the cut line on the beam picture while on the Diagrams tab.
  const pic=$('#beamPicture'), ps=$('#beamPicture svg'), picPx=x=>+ps.dataset.x0+(+ps.dataset.x1-+ps.dataset.x0)*x/+ps.dataset.length;
  t.pointer('pointerdown',ps,picPx(120));t.pointer('pointerup',pic,picPx(120));near(t.station().x,120,0.6,'pointer on the beam picture moves the station');
  ok(/Station x = 1(19|20|21)/.test($('#beamStationRead').textContent),'and the readout follows');
  ok(clean($('#foundations').innerHTML),'clean markup');
  t.dom.window.close();
}

/* ---------- 4. jumps: x⁻ / x⁺ at a point force, a couple and a hinge ---------- */
{
  const t=open('?beamCase=l03-simple'), {$,$$}=t;
  ok(/a jump occurs here/.test($('#beamStationRead').textContent),'point force at L/2: jump reported');eq($('#beamStationLimitField').hidden,false,'x⁻ / x⁺ selector shown');
  const Vc=()=>t.card('V');
  eq(txt(Vc().querySelector('[data-limit="left"]')),'x⁻: +1 N');eq(txt(Vc().querySelector('[data-limit="right"]')),'x⁺: −1 N','both limits listed');
  ok(Vc().querySelector('[data-limit="left"]').classList.contains('is-sel'),'x⁻ selected by default');
  eq(t.card('M').querySelectorAll('[data-limit]').length,0,'M has no jump at a force: one value');eq(txt(t.card('M').querySelector('.bl-stat-v')),'+225 N·mm');
  eq($('#beamCharts [data-key="shear"]').querySelectorAll('.bl-cut-dot').length,2,'two shear markers at the jump');eq($('#beamCharts [data-key="moment"]').querySelectorAll('.bl-cut-dot').length,1);
  $('#beamStationLimitField [data-cut-limit="right"]').click();
  ok(Vc().querySelector('[data-limit="right"]').classList.contains('is-sel'),'x⁺ selected');eq($('#beamStationLimitField [data-cut-limit="right"]').getAttribute('aria-pressed'),'true');
  ok(/V = −1 N acts up on the left part's face and down on the right part's face/.test($('#beamStationFaces svg').getAttribute('aria-label')),'faces show the x⁺ shear');
  ok(/↑ on the left part's cut face/.test(Vc().textContent),'meaning follows the selected limit');
  $('[data-tab="cut"]').click();ok(/right limit x⁺/.test($('#beamCutRead').textContent),'the selected limit is shared with Cut & section');
  ok(/V = −1 N/.test($('#beamCutFbd').textContent));
  // Reaction/internal table and sign key at both ends of the pin–roller beam.
  $('[data-tab="diagrams"]').click();
  ok(/V\(0⁺\) = −RA = \+1 N/.test(txt($('#beamSignKey')))&&/V\(L⁻\) = \+RB = −1 N/.test(txt($('#beamSignKey'))),'sign key: V(0⁺) = −R_A, V(L⁻) = +R_B');
  ok(/ΔV = \+1 N = −RB ✓/.test(txt($('#beamReactionShear tr[data-support="B"]'))),'right end: ΔV = −R_B');
  t.dom.window.close();
  // Couple at x = 150 on a pin–roller beam: M jumps by C, V does not.
  const c=open(), C=60;
  c.w.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,supports:[{x:0,kind:'pin'},{x:450,kind:'roller'}],loads:[{kind:'moment',position:150,moment:C}]})}));
  c.w.BeamLab.setCut(150);
  const ml=c.station().left.M, mr=c.station().right.M;near(mr-ml,C,1e-9,'M(x⁺) − M(x⁻) = +C for a clockwise couple');
  eq(c.card('M').querySelectorAll('[data-limit]').length,2,'M card lists both limits at the couple');eq(c.card('V').querySelectorAll('[data-limit]').length,0,'V is continuous at a couple');
  c.dom.window.close();
  // Hinge at x = 225 of a fixed–roller beam with a load at 337.5: θ jumps, M = 0 at the hinge.
  const h=open();
  h.w.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,supports:[{x:0,kind:'fixed'},{x:450,kind:'roller'}],hinges:[225],loads:[{kind:'point',position:337.5,force:2}]})}));
  h.w.BeamLab.setCut(225);
  eq(h.card('theta').querySelectorAll('[data-limit]').length,2,'θ jumps at the hinge: both limits');near(h.station().at.M,0,1e-9,'M = 0 at the hinge');
  ok(/a jump occurs here/.test(h.$('#beamStationRead').textContent));
  h.dom.window.close();
}

/* ---------- 5. reactions versus internal shear at interior supports and with a force on a support ---------- */
{
  const t=open();
  t.w.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,supports:[{x:0,kind:'pin'},{x:225,kind:'roller'},{x:450,kind:'roller'}],loads:[{kind:'distributed',start:0,end:450,qStart:0.01,qEnd:0.01}]})}));
  const r=t.w.BeamLab.state().solved.result, RB=r.reactions[1].force, rowB=txt(t.$('#beamReactionShear tr[data-support="B"]'));
  near(B.fieldAt(r,225,'right').V-B.fieldAt(r,225,'left').V,-RB,1e-12,'interior support: V jumps by −R_B');
  ok(/ΔV = \+[\d.]+ N = −RB ✓/.test(rowB)&&RB<0,'table row B: ΔV = −R_B ✓ (upward reaction, V rises)');
  ok(!/✗/.test(t.$('#beamReactionShear').textContent),'every slice check passes');
  // A point force applied exactly at a support enters the slice balance.
  t.w.BeamLab.importText(Study.exportStudy({result:B.solve({length:450,supports:[{x:0,kind:'fixed'}],loads:[{kind:'point',position:0,force:1},{kind:'point',position:450,force:2}]})}));
  ok(/= −\(RA \+ P\), P = 1 N applied here ✓/.test(txt(t.$('#beamReactionShear tr[data-support="A"]'))),'force on the support: ΔV = −(R + P)');
  ok(/V\(0⁺\) = −\(RA \+ P\) = \+2 N/.test(txt(t.$('#beamSignKey'))),'sign key: V(0⁺) = −(R_A + P) = +2 N');
  t.dom.window.close();
  // Every Lecture 03 and HW 2B example: all slice checks pass.
  for(const name of ['l03-tip','l03-centre','l03-uniform','l03-simple','l03-fixed','l03-lift','hw2b-cantilever','hw2b-roller-pin','hw2b-fixed']) {
    const e=open(`?beamCase=${name}`), rows=e.$$('#beamReactionShear tr[data-support]');
    ok(rows.length===e.w.BeamLab.state().solved.result.reactions.length&&rows.every(x=>/✓/.test(x.textContent)&&!/✗/.test(x.textContent)),`${name}: reaction/internal checks pass`);
    e.dom.window.close();
  }
}

/* ---------- 6. Cut & section: both parts by default, opposite arrows on the two faces ---------- */
{
  const t=open('?beamCase=hw2b-cantilever'), {$,$$}=t;
  $('[data-tab="cut"]').click();
  eq($('[data-cut-side="both"]').getAttribute('aria-pressed'),'true','both parts shown by default');
  const parts=$$('#beamCutFbd svg.bl-segment');eq(parts.length,2,'two free bodies');
  ok(/left part/.test(parts[0].getAttribute('aria-label'))&&/right part/.test(parts[1].getAttribute('aria-label')),'left part first, right part second');
  const vArrow=svg=>[...svg.querySelectorAll('g.bl-int')].find(g=>g.querySelector('line'));
  const down=g=>{const l=g.querySelector('line');return +l.getAttribute('y2')>+l.getAttribute('y1');};
  ok(down(vArrow(parts[0]))&&!down(vArrow(parts[1])),'V > 0: ↓ on the left part\'s face, ↑ on the right part\'s');
  ok(parts.every(p=>/V = 0\.3375 N/.test(p.textContent)&&/M = −42\.19 N·mm/.test(p.textContent)),'the same V and M on both faces');
  eq(($('#beamCutCheck').textContent.match(/✓/g)||[]).length,4,'both parts balance');
  ok(/Left part/.test($('#beamCutCheck').textContent)&&/Right part/.test($('#beamCutCheck').textContent));
  ok(/V &gt; 0 acts ↓ and M &gt; 0 \(sagging\) acts ↺; on the right part's face V &gt; 0 acts ↑ and M &gt; 0 acts ↻/.test($('#beamCutFbd').innerHTML),'caption states both faces');
  // The root slice x = 0⁺: the reaction and V(0⁺) balance on a thin slice.
  t.w.BeamLab.setCut(0);
  const slice=$$('#beamCutFbd svg.bl-segment')[0];
  ok(/thin slice at x = 0 mm/.test(slice.textContent)&&/RA = −0\.45 N/.test(slice.textContent)&&/V = 0\.45 N/.test(slice.textContent),'thin root slice: signed R_A = −0.45 N (↓ +) and V(0⁺)');
  eq(slice.querySelector('[data-ext="R"]').dataset.dir,'up','thin root slice: the negative R_A is drawn in its actual direction, up');
  ok(down(vArrow(slice)),'V(0⁺) > 0 acts down on the slice face, balancing the upward reaction');
  eq(($('#beamCutCheck').textContent.match(/✓/g)||[]).length,4);
  $('[data-cut-side="left"]').click();eq($$('#beamCutFbd svg.bl-segment').length,1,'one part on request');eq($('[data-cut-side="left"]').getAttribute('aria-pressed'),'true');
  t.dom.window.close();
}

/* ---------- 7. normal opening: no load, zero readout, no arrows ---------- */
{
  const t=open(), {$,$$,w}=t, s=w.BeamLab.state().solved;
  eq(s.model.loads.length,0,'opens with no load');eq(s.model.selfWeight,false);
  ok(/Station x = 225 mm = L\/2/.test($('#beamStationRead').textContent));
  for(const [k,v] of [['V','0 N'],['M','0 N·mm'],['v','0 mm'],['theta','0 rad']]) eq(txt(t.card(k).querySelector('.bl-stat-v')),v,`no load: ${k} = 0`);
  eq($('#beamStationFaces').querySelectorAll('.bl-int').length,0,'no internal-force arrows');
  ok(/RA = 0 N \(zero\), so V\(0⁺\) = −RA = 0 N/.test(txt($('#beamSignKey'))),'sign key at zero load');
  eq($('#beamPicture').querySelectorAll('.bl-load, .bl-point, .bl-couple, .bl-sw, .bl-load-fill, .bl-sw-fill').length,0,'no load drawn');
  eq($('#beamLoads').textContent.trim(),'No load defined. Add your own load.');
  ok(clean($('#foundations').innerHTML));
  t.dom.window.close();
}

/* ---------- 8. Lecture 03 / HW 2B deep links keep their loads and their published values ---------- */
{
  const t=open('?beamCase=l03-tip');
  eq(t.w.BeamLab.state().solved.model.loads[0].force,2,'l03-tip keeps its 2 N tip force');
  t.typeX(150);eq(txt(t.card('V').querySelector('.bl-stat-v')),'+2 N','Lecture 03 §3: V(150) = +2 N');eq(txt(t.card('M').querySelector('.bl-stat-v')),'−600 N·mm','Activity A: M(150) = −600 N·mm');
  ok(/V\(0⁺\) = −RA = \+2 N/.test(txt(t.$('#beamSignKey')))&&/M\(0⁺\) = \+CA = −900 N·mm/.test(txt(t.$('#beamSignKey'))),'Lecture 03 table: +2 N and −900 N·mm just inside the root');
  t.dom.window.close();
  const f=open('?beamCase=l03-fixed'), key=txt(f.$('#beamSignKey'));
  ok(/V\(0⁺\) = −RA = \+1 N/.test(key)&&/M\(0⁺\) = \+CA = −112\.5 N·mm/.test(key)&&/V\(L⁻\) = \+RB = −1 N/.test(key)&&/M\(L⁻\) = −CB = −112\.5 N·mm/.test(key),'Lecture 03 C2: both internal end moments −112.5 N·mm');
  f.dom.window.close();
  const p=open('?beamCase=hw2b-roller-pin'), r=p.w.BeamLab.state().solved.result;
  ok(r.input.supports[0].kind==='roller'&&r.input.supports[1].kind==='pin','HW 2B Case 2: roller left, pin right');
  ok(/V\(0⁺\) = −RA = \+0\.3 N/.test(txt(p.$('#beamSignKey')))&&/V\(L⁻\) = \+RB = −0\.375 N/.test(txt(p.$('#beamSignKey'))),'HW 2B Case 2: V(0⁺) = +0.3 N, V(L⁻) = −0.375 N');
  p.dom.window.close();
  const u=open('?beamCase=unknown');eq(u.w.BeamLab.state().solved.model.loads.length,0,'unknown case: no load');eq(txt(u.card('V').querySelector('.bl-stat-v')),'0 N');u.dom.window.close();
  // Explanations in the Solution and Learn tabs use the same relation.
  const s=open('?beamCase=hw2b-cantilever');
  s.$('[data-tab="solution"]').click();ok(/V\(x⁺\) − V\(x⁻\) = −R, so V\(0⁺\) = −R at a left-end support/.test(s.$('#beamSolution').textContent),'Solution tab states V(0⁺) = −R');
  s.$('[data-tab="learn"]').click();ok(/V\(0⁺\) = −R and M\(0⁺\) = \+C\./.test(txt(s.$('#beamSigns'))),'Learn tab states the same relation');
  ok(clean(s.$('#foundations').innerHTML));
  s.dom.window.close();
}
/* ---------- 9. fixed–fixed, triangle toward the root (HW 2B Case 3): reactions versus internal V and M ---------- */
{
  const t=open('?beamCase=hw2b-fixed'), {$,$$,w}=t, r=w.BeamLab.state().solved.result, q0=0.002, EI=2200*16*8**3/12;
  // Closed forms for q(x) = q0 (1 − x/L) on a clamped–clamped beam (magnitudes: R up, C_A counter-clockwise, C_B clockwise).
  const RA=7*q0*L/20, RB=3*q0*L/20, CA=q0*L*L/20, CB=q0*L*L/30;
  near(r.reactions[0].force,-RA,1e-9,'R_A = −0.315 N in app signs');near(r.reactions[1].force,-RB,1e-9,'R_B = −0.135 N');
  near(r.reactions[0].moment,-CA,1e-7,'C_A = −20.25 N·mm (counter-clockwise)');near(r.reactions[1].moment,CB,1e-7,'C_B = +13.5 N·mm (clockwise)');
  near(RA,0.315,1e-15,'7 q0 L / 20');near(CA,20.25,1e-12,'q0 L² / 20');near(CB,13.5,1e-12,'q0 L² / 30');
  // Internal V and M from the LEFT part alone (R_A up, C_A counter-clockwise, the load on [0, x]).
  const V=x=>RA-q0*(x-x*x/(2*L)), M=x=>-CA+RA*x-q0*(x*x/2-x**3/(6*L));
  const vEx=x=>-(1/EI)*(-CA*x*x/2+RA*x**3/6-q0*(x**4/24-x**5/(120*L)));
  for(const x of [0,100,200,205,225,300,450]) {
    const f=B.fieldAt(r,x,x===L?'left':'right');
    // v: exact at a node; between nodes the cubic interpolation under the line load is close, not exact.
    const node=r.nodes.some(n=>Math.abs(n-x)<1e-9);
    near(f.V,V(x),1e-10,`V(${x})`);near(f.M,M(x),1e-8,`M(${x})`);near(f.v,vEx(x),Math.abs(vEx(x))*(node?1e-9:2e-5)+1e-12,`v(${x}) (${node?'node':'interpolated'})`);
  }
  near(B.fieldAt(r,0,'right').V,0.315,1e-10,'V(0⁺) = +0.315 N = −R_A');near(B.fieldAt(r,L,'left').V,-0.135,1e-10,'V(L⁻) = −0.135 N = +R_B');
  near(B.fieldAt(r,0,'right').M,-20.25,1e-8,'M(0⁺) = −20.25 N·mm = +C_A (hogging)');near(B.fieldAt(r,L,'left').M,-13.5,1e-8,'M(L⁻) = −13.5 N·mm = −C_B (hogging)');
  near(B.fieldAt(r,L,'left').v,0,1e-12,'compatibility: v(L) = 0');near(B.fieldAt(r,L,'left').theta,0,1e-12,'compatibility: θ(L) = 0');
  const key=txt($('#beamSignKey'));
  ok(/V\(0⁺\) = −RA = \+0\.315 N/.test(key)&&/CA = −20\.25 N·mm \(20\.25 N·mm ↺\), so M\(0⁺\) = \+CA = −20\.25 N·mm/.test(key),'sign key at A');
  ok(/V\(L⁻\) = \+RB = −0\.135 N/.test(key)&&/CB = \+13\.5 N·mm \(13\.5 N·mm ↻\), so M\(L⁻\) = −CB = −13\.5 N·mm/.test(key),'sign key at B');
  // Thin slices: external reaction (green) and internal V, M (orange) in their actual directions, and the balance.
  const sliceA=$('#beamReactionShear figure[data-support="A"]'), sliceB=$('#beamReactionShear figure[data-support="B"]');
  ok(sliceA&&sliceB,'one thin slice per support');
  const dirOf=(fig,sel)=>{const g=fig.querySelector(sel);return g&&(g.dataset.dir||g.dataset.v||g.dataset.m);};
  eq(dirOf(sliceA,'[data-ext="R"]'),'up','slice A: R_A acts up');eq(dirOf(sliceA,'[data-ext="C"]'),'ccw','slice A: C_A counter-clockwise');
  eq(dirOf(sliceA,'[data-face="right"][data-v]'),'down','slice A: V(0⁺) = +0.315 acts down on the face of the part left of the next cut');
  eq(dirOf(sliceA,'[data-face="right"][data-m]'),'cw','slice A: M(0⁺) = −20.25 acts clockwise there');
  eq(sliceA.querySelector('[data-face="left"]'),null,'slice A: nothing to the left of the beam end');
  eq(dirOf(sliceB,'[data-ext="R"]'),'up');eq(dirOf(sliceB,'[data-ext="C"]'),'cw','slice B: C_B clockwise');
  eq(dirOf(sliceB,'[data-face="left"][data-v]'),'down','slice B: V(L⁻) = −0.135 on a right part\'s face acts down');
  eq(dirOf(sliceB,'[data-face="left"][data-m]'),'ccw','slice B: M(L⁻) = −13.5 acts counter-clockwise there');
  const down=g=>{const l=g.querySelector('line');return +l.getAttribute('y2')>+l.getAttribute('y1');};
  ok(!down(sliceA.querySelector('[data-ext="R"]'))&&down(sliceA.querySelector('[data-face="right"][data-v]')),'arrow geometry: R_A up, V(0⁺) down');
  ok(/Forces \(↓ \+\)RA \+ V\(0⁺\) = \(−0\.315\) \+ \(\+0\.315\) = 0 N ✓/.test(txt(sliceA))&&/Couples \(↻ \+\)CA − M\(0⁺\) = \(−20\.25\) − \(−20\.25\) = 0 N·mm ✓/.test(txt(sliceA)),'slice A balances, numbers shown');
  ok(/RB − V\(L⁻\) = \(−0\.135\) − \(−0\.135\) = 0 N ✓/.test(txt(sliceB))&&/CB \+ M\(L⁻\) = \(\+13\.5\) \+ \(−13\.5\) = 0 N·mm ✓/.test(txt(sliceB)),'slice B balances, numbers shown');
  ok(!/✗/.test($('#beamReactionShear').textContent),'no failed check');
  ok(/V\(0⁺\) has the opposite sign to R while M\(0⁺\) has the same sign as C/.test(txt($('#beamReactionShear'))),'the explanation states why the signs differ');
  // Typed stations 200 and 205 mm: exact readout, and the same numbers in the left/right Cut & section free bodies.
  for(const x of [200,205]) {
    t.typeX(x);const s=t.station();near(s.at.V,V(x),1e-10,`readout V(${x})`);near(s.at.M,M(x),1e-8,`readout M(${x})`);
    eq(txt(t.card('V').querySelector('.bl-stat-v')),`${V(x)>0?'+':''}${D.fmt(V(x),6)} N`,`V card at ${x} mm`);
  }
  $('[data-tab="cut"]').click();t.w.BeamLab.setCut(0);
  const parts=$$('#beamCutFbd svg.bl-segment');
  ok(/RA = −0\.315 N/.test(parts[0].textContent)&&/CA = −20\.25 N·mm/.test(parts[0].textContent)&&/V = 0\.315 N/.test(parts[0].textContent),'Cut & section at 0⁺: signed R_A, C_A and V(0⁺) on the thin left slice');
  ok(parts[0].querySelector('[data-ext="R"]').dataset.dir==='up'&&parts[0].querySelector('[data-ext="C"]').dataset.dir==='ccw','0⁺ slice: R_A acts up and C_A counter-clockwise (actual directions)');
  t.w.BeamLab.setCut(L);const partsL=$$('#beamCutFbd svg.bl-segment');
  ok(/RB = −0\.135 N/.test(partsL[1].textContent)&&/CB = \+13\.5 N·mm/.test(partsL[1].textContent)&&/V = −0\.135 N/.test(partsL[1].textContent),'Cut & section at L⁻: signed R_B, C_B and V(L⁻) on the thin right slice');
  ok(partsL[1].querySelector('[data-ext="R"]').dataset.dir==='up'&&partsL[1].querySelector('[data-ext="C"]').dataset.dir==='cw','L⁻ slice: R_B acts up and C_B clockwise (actual directions)');
  eq(($('#beamCutCheck').textContent.match(/✓/g)||[]).length,4,'both parts balance at L⁻');
  t.dom.window.close();
}
console.log(`Beam station and shear sign: ${checks} checks passed (sign convention against closed forms and right-part equilibrium, readout at L/2, 0⁺, L⁻ and between nodes, x⁻/x⁺ at a force, a couple and a hinge, one station for readout, plots, picture and Cut & section, reaction/internal table, thin slices at supports, both-part free bodies, fixed–fixed benchmark, no-load opening, Lecture 03 / HW 2B links).`);
