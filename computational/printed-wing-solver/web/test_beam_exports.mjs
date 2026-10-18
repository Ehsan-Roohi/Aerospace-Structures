// Downloads and the quick guide (jsdom DOM component tests; the PNG pixels themselves are checked in
// test_beam_browser.mjs because jsdom has no canvas). Covers the station table and its CSV (units in the column
// names, exact values at any listed x, x⁻/x⁺ rows at jumps, agreement with the readout), the plot-samples CSV, the
// source of each plot image (title, model, loads, axes, units, sign convention, white background), the download
// bar on the Diagrams tab with its stale-results guard, the station table in the printed report and the guide.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js'), Study=require('./beam_study.js'), D=require('./beam_diagrams.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const near=(a,b,tol,m)=>{assert.ok(Math.abs(a-b)<=tol,`${m}: ${a} vs ${b}`);checks++;};
const L=450, q0=0.002;

function open(query='') {
  const dom=new JSDOM('<div id="foundations"></div>',{url:`https://example.org/wing-lab.html${query}`,runScripts:'outside-only'});
  const w=dom.window, downloads=[];
  w.Blob=Blob;w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:test';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){downloads.at(-1).name=this.download;};
  w.print=()=>{w.printed=(w.printed||0)+1;};
  const env=loadBeamLab(dom);
  return {...env,dom,downloads,list:text=>{env.$('#beamStationList').value=text;env.$('#beamStationListForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}};
}
const parseCsv=text=>{ok(text.endsWith('\r\n')&&!/\r?\n\r?\n/.test(text.trim()),'CRLF lines, no blank line');return text.trim().split('\r\n').map(l=>l.split(','));};
const HEADER='x_mm,side,V_N,M_Nmm,v_mm,theta_rad,curvature_per_mm,sigma_top_MPa,sigma_bottom_MPa,tau_max_MPa,v_theta_source';

/* ---------- 1. station rows and CSV against closed forms (fixed–fixed, q = 0.002 → 0 N/mm) ---------- */
const model={length:L,E:2200,elements:30,section:{shape:'rectangle',width:16,height:8},supports:[{x:0,kind:'fixed'},{x:L,kind:'fixed'}],loads:[{kind:'distributed',start:0,end:L,qStart:q0,qEnd:0}]};
const r=B.solve(model), RA=7*q0*L/20, CA=q0*L*L/20;
const V=x=>RA-q0*(x-x*x/(2*L)), M=x=>-CA+RA*x-q0*(x*x/2-x**3/(6*L));
{
  const csv=parseCsv(Study.stationsCsv(r,[205,0,200,450,225,200]));
  eq(csv[0].join(','),HEADER,'station CSV header: one row, units in the column names');
  eq(csv.length,1+5,'one row per station (duplicates merged, sorted)');ok(csv.slice(1).every(row=>row.length===11),'11 fields per row');
  eq(csv.slice(1).map(row=>row[0]).join(),'0,200,205,225,450','stations in order');
  eq(csv[1][1],'right','x = 0 is the right limit 0⁺');eq(csv[5][1],'left','x = L is the left limit L⁻');eq(csv[2][1],'','no jump at 200 mm');
  for(const row of csv.slice(1)) {
    const x=+row[0];near(+row[2],V(x),1e-10,`CSV V(${x}) exact`);near(+row[3],M(x),1e-8,`CSV M(${x}) exact`);
    ok(row.slice(2,10).every(c=>c!==''&&Number.isFinite(+c)),`numeric cells at ${x}`);
  }
  near(+csv[1][2],0.315,1e-10,'V(0⁺) = 0.315 N');near(+csv[1][3],-20.25,1e-8,'M(0⁺) = −20.25 N·mm');near(+csv[5][2],-0.135,1e-10,'V(L⁻) = −0.135 N');near(+csv[5][3],-13.5,1e-8,'M(L⁻) = −13.5 N·mm');
  eq(csv[2][10],'FE interpolation','200 mm lies between nodes');eq(csv[4][10],'FE node','225 mm is a node');
  const f205=B.fieldAt(r,205);near(+csv[3][4],f205.v,1e-12,'v from the FE field');near(+csv[3][5],f205.theta,1e-14,'θ from the FE field');
  near(+csv[3][7],-M(205)*4/r.I,1e-9,'σ top = −M c / I');near(+csv[3][8],M(205)*4/r.I,1e-9,'σ bottom = +M c / I');near(+csv[3][9],1.5*Math.abs(V(205))/128,1e-12,'τmax = 1.5 |V| / A');
  // Jumps: a point force (V), a couple (M) and a hinge (θ) each give an x⁻ row and an x⁺ row.
  const j=parseCsv(Study.stationsCsv(B.solve({length:L,supports:[{x:0,kind:'pin'},{x:L,kind:'roller'}],loads:[{kind:'point',position:225,force:2},{kind:'moment',position:100,moment:50}]}),[100,225]));
  eq(j.length,1+4,'two rows at each jump');eq(j.slice(1).map(row=>row[1]).join(),'left,right,left,right','sides left/right');
  near(+j[3][2]-+j[4][2],2,1e-10,'V(x⁻) − V(x⁺) = P');near(+j[2][3]-+j[1][3],50,1e-8,'M(x⁺) − M(x⁻) = C');
  const h=Study.stationRows(B.solve({length:L,supports:[{x:0,kind:'fixed'},{x:L,kind:'roller'}],hinges:[225],loads:[{kind:'point',position:337.5,force:2}]}),[225]);
  ok(h.length===2&&Math.abs(h[0].theta-h[1].theta)>1e-6&&h[0].v===h[1].v,'hinge: θ jumps (two rows), v continuous');
  // The plot-samples CSV is unchanged in form, and its V and M are exact at its own x.
  const s=parseCsv(Study.resultsCsv(r));
  eq(s[0].join(','),'x_mm,side,v_mm,theta_rad,V_N,M_Nmm,sigma_top_MPa,sigma_bottom_MPa,tau_max_MPa','plot-samples CSV header');
  ok(s.slice(1).every(row=>Math.abs(+row[4]-V(+row[0]))<1e-10&&Math.abs(+row[5]-M(+row[0]))<1e-8),'samples: V and M exact at the sample x');
  ok(!s.slice(1).some(row=>+row[0]===205),'205 mm is not a plotted sample: only the station table gives it');
}

/* ---------- 2. the station table on the Diagrams tab; CSV download equals the table ---------- */
{
  const t=open('?beamCase=hw2b-fixed'), {$,$$,w}=t;
  const rows=()=>$$('#beamStationTable tr[data-x]');
  eq($('#beamStationList').value,'0, 112.5, 225, 337.5, 450','default list: 0, L/4, L/2, 3L/4, L');eq(rows().length,5);
  t.list('200, 205');eq(rows().map(x=>x.dataset.x).join(),'200,205','typed stations');
  eq(rows()[0].children[2].textContent,'+0.00388889','V(200) = +0.00388889 N');eq(rows()[1].children[3].textContent,`+${D.fmt(M(205),6)}`,'M(205) exact');
  ok(rows()[0].children[8].textContent==='interp.','200 mm: v and θ interpolated');
  w.BeamLab.setCut(205);eq(rows()[1].children[2].textContent,D.signed(w.BeamLab.readStation().at.V,6),'table = readout at 205 mm');
  $('#beamStationAdd').click();eq(rows().length,2,'adding the current x (205) again changes nothing');w.BeamLab.setCut(L/2);$('#beamStationAdd').click();eq(rows().length,3,'add the current x (L/2)');
  t.list('abc');ok(!$('#beamStationListError').hidden&&/“abc” is not a number/.test($('#beamStationListError').textContent),'non-number refused');eq(rows().length,3,'table unchanged');
  t.list('600');ok(/not on the beam/.test($('#beamStationListError').textContent),'off-beam x refused');
  t.list('200, 205');ok($('#beamStationListError').hidden);
  $('.bl-exportbar [data-export="stations"]').click();
  const file=t.downloads.at(-1);eq(file.name,'MIE446-beam-stations.csv');
  const text=await file.text();eq(text,Study.stationsCsv(w.BeamLab.state().solved.result,[200,205]),'downloaded CSV = the listed stations');
  ok(/Station table saved as CSV \(2 rows\)/.test($('#beamDiagExportStatus').textContent),'status on the Diagrams tab');
  $('#beamStationReset').click();eq(rows().length,5,'default list again');
  // Stations typed but not yet shown are used by the download; an invalid list saves nothing.
  $('#beamStationList').value='150';$('.bl-exportbar [data-export="stations"]').click();
  ok(/\r\n150,,/.test(await t.downloads.at(-1).text())&&rows().length===1&&rows()[0].dataset.x==='150','typed x used for the CSV and the table');
  const nBefore=t.downloads.length;$('#beamStationList').value='150, abc';$('.bl-exportbar [data-export="stations"]').click();
  eq(t.downloads.length,nBefore,'an invalid typed list saves nothing');ok(/Station table not saved: “abc” is not a number/.test($('#beamDiagExportStatus').textContent),'and says why');
  $('#beamStationReset').click();
  // Jump in the table: l03-simple at L/2.
  const s=open('?beamCase=l03-simple'), jr=s.$$('#beamStationTable tr[data-x="225"]');
  ok(jr.length===2&&jr[0].dataset.side==='left'&&jr[1].dataset.side==='right','x⁻ and x⁺ rows at the point force');
  eq(jr[0].children[2].textContent,'+1');eq(jr[1].children[2].textContent,'−1');
  s.dom.window.close();
  // Other downloads from the Diagrams tab.
  $('.bl-exportbar [data-export="samples"]').click();eq(t.downloads.at(-1).name,'MIE446-beam-plot-samples.csv');ok((await t.downloads.at(-1).text()).startsWith('x_mm,side,v_mm,theta_rad,V_N,M_Nmm'),'plot samples CSV');
  $('.bl-exportbar [data-export="reactions"]').click();eq(t.downloads.at(-1).name,'MIE446-beam-reactions.csv');ok((await t.downloads.at(-1).text()).startsWith('x_mm,support,force_N_down,moment_Nmm_clockwise'),'reactions CSV');
  $('.bl-exportbar [data-export="print"]').click();eq(w.printed,1,'report from the Diagrams tab');
  const report=$('#beamPrint');ok(/Values at the listed stations/.test(report.textContent)&&/V\(0⁺\) = −R and M\(0⁺\) = \+C/.test(report.textContent),'printed report: station table and signs');
  ok(/Couple C \(N·mm, ↻ \+\)/.test(report.textContent),'printed report names the reaction couple C');
  w.dispatchEvent(new w.Event('afterprint'));
  $('.bl-exportbar [data-open-tab="report"]').click();eq($('#beamTab-report').hidden,false,'study file and share link: opens Report & export');
  ok($('#beamTab-report [data-export="stations"]'),'station table CSV also in Report & export');eq($('#beamCsv').textContent,'Plot samples CSV','plot-samples CSV named as such');
  $('[data-tab="diagrams"]').click();
  // Stale results: every download is disabled and refuses.
  const before=t.downloads.length, E=$('#beamGeometry [name="E"]');E.value='2500';E.dispatchEvent(new w.Event('input',{bubbles:true}));
  ok($$('[data-export], [data-png]').every(b=>b.disabled),'downloads disabled while results are stale');
  for(const b of $$('[data-export]')) b.disabled=false;
  $('.bl-exportbar [data-export="stations"]').click();eq(t.downloads.length,before,'even if re-enabled, nothing is exported');
  ok(/Solve the current inputs before exporting/.test($('#beamDiagExportStatus').textContent),'and the Diagrams tab says why');
  w.BeamLab.setCut(100);ok($$('[data-png]').every(b=>b.disabled),'PNG buttons stay disabled when the plots are redrawn');
  $('#beamSolve').click();ok($$('[data-export], [data-png]').every(b=>!b.disabled),'enabled again after Solve');
  t.dom.window.close();
}

/* ---------- 3. plot images: what the PNG contains ---------- */
{
  const t=open('?beamCase=hw2b-fixed'), {$,$$,w}=t, parser=new w.DOMParser();
  eq($$('#beamCharts [data-png]').length,6,'a PNG button under every plot');
  ok(/Download the Shear force V plot as a PNG image/.test($('#beamCharts [data-png="shear"]').getAttribute('aria-label')));
  const want={shear:['Shear force V (N)','V (N)',/V > 0 acts down on the left part's cut face and up on the right part's face/],moment:['Bending moment M (sagging +) (N·mm)','M (N·mm)',/M > 0 is sagging/],
    deflection:['Deflection v (down +, drawn downward) (mm)','v (mm)',/v > 0 is downward/],rotation:['Rotation θ = dv/dx (clockwise +) (rad)','θ (rad)',/θ = dv\/dx > 0 is clockwise/],
    stressTop:['Top-fibre stress σ (tension +) (MPa)','σ top (MPa)',/σ > 0 is tension/],shearStressMax:['Neutral-axis shear stress |τ|max (MPa)','|τ| (MPa)',/k \|V\| \/ A/]};
  for(const [key,[title,axis,sign]] of Object.entries(want)) {
    const img=w.BeamLab.plotImage(key), doc=parser.parseFromString(img.svg,'image/svg+xml'), text=[...doc.querySelectorAll('text')].map(x=>x.textContent).join(' ');   // wrapped lines rejoined
    eq(doc.getElementsByTagName('parsererror').length,0,`${key}: well-formed SVG`);eq(doc.documentElement.getAttribute('xmlns'),'http://www.w3.org/2000/svg');
    ok(img.width===960&&img.height>500&&+doc.documentElement.getAttribute('height')===img.height,`${key}: ${img.width} × ${img.height} (PNG at 2×)`);
    const bg=doc.documentElement.querySelector('rect');ok(bg&&bg.getAttribute('fill')==='#ffffff'&&+bg.getAttribute('width')===img.width,`${key}: opaque white background`);
    ok(/fill:#111/.test(doc.querySelector('style').textContent),`${key}: dark text colour of its own (no page CSS)`);
    ok(text.includes(title),`${key}: title with unit`);ok(text.includes(axis)&&text.includes('x (mm)'),`${key}: both axes labelled with units`);
    ok(/Model: L = 450 mm · Solid rectangle 16 × 8 mm \(b × h\) · E = 2200 MPa/.test(text)&&/supports: A fixed at x = 0 mm, B fixed at x = 450 mm/.test(text),`${key}: model line`);
    ok(/Loads \(force and q down \+, couple clockwise \+\): q = 0\.002 → 0 N\/mm on 0–450 mm/.test(text),`${key}: load line`);
    ok(sign.test(text),`${key}: sign convention`);ok(/Curve: values at the plotted sample points/.test(text)&&/Exact values at any x/.test(text),`${key}: sampled curve versus exact values`);
    ok(doc.querySelector('polyline.bl-curve')&&doc.querySelectorAll('polyline.bl-curve')[0].getAttribute('points').split(' ').length>100,`${key}: the plotted curve itself`);
    ok(!/NaN|undefined|Infinity/.test(img.svg),`${key}: no NaN`);
  }
  ok(/station x = 225 mm, exact V\(x\) = −0\.0225 N/.test(w.BeamLab.plotImage('shear').svg),'the marker value in the note is the exact one');
  t.dom.window.close();
  const n=open(), none=n.w.BeamLab.plotImage('moment').svg;
  ok(/Loads \(force and q down \+, couple clockwise \+\): none/.test(none),'no-load opening: the image says no load');
  const zr=n.$$('#beamStationTable tr[data-x]');eq(zr.length,5);
  ok(zr.every(tr=>[...tr.children].slice(2,8).every(td=>/^0( \/ 0)?$/.test(td.textContent))),'no load: V, M, v, θ, σ and τ are 0 at every listed station');
  n.dom.window.close();
}

/* ---------- 4. the quick guide ---------- */
{
  const t=open(), {$,w}=t, g=$('#beamGuide');
  ok(g&&g.closest('#beamTab-learn'),'guide in the Learn tab');
  const steps=[...g.querySelectorAll('.bl-guide-steps > li')].map(li=>li.querySelector('b').textContent);
  eq(steps.join(' | '),'Supports (panel 3). | Loads (panel 4). | Solve. | Diagrams. | Station values. | Report and downloads.','workflow: supports → loads → solve → diagrams → station → report/downloads');
  const text=g.textContent.replace(/\s+/g,' ');
  for(const h of ['Signs and units','Fixed–fixed and other indeterminate beams','Midpoint and jumps','Plots versus exact values','Model limits']) ok([...g.querySelectorAll('h4')].some(x=>x.textContent===h),`guide section: ${h}`);
  ok(/mm, N, N\/mm, N·mm and MPa/.test(text)&&/V\(0⁺\) = −R and M\(0⁺\) = \+C at a left end/.test(text),'units and the reaction/internal relation');
  ok(/v = 0 and θ = 0 at both clamps/.test(text)&&/Press L\/2/.test(text)&&/PNG/.test(text)&&/Station table CSV/.test(text)&&/Euler–Bernoulli/.test(text),'compatibility, midpoint, exports, model');
  ok(!/Codex|Claude|supervisor|instructor|draft|private|chat/i.test(text),'generic student text: no drafting or conversation history');
  $('#beamGuideOpen').click();eq($('#beamTab-learn').hidden,false,'header button opens the guide');eq(w.document.activeElement,$('#beamGuideTitle'),'and focuses its heading');
  t.dom.window.close();
}
console.log(`Beam Lab downloads and guide: ${checks} checks passed (station table and CSV against closed forms, x⁻/x⁺ rows at a force, a couple and a hinge, readout agreement, plot-samples and reactions CSV, Diagrams download bar, stale guard, report station table, six plot images with title, model, loads, axes, units and sign convention, quick guide).`);
