// One sign convention for every external action in the Beam Lab worked solution and its outputs:
// forces (applied loads and reactions R_y) positive DOWN, couples (applied and reaction couples C) and moments of
// forces positive CLOCKWISE — equilibrium equations, load and reaction tables, unknown and solved free-body
// diagrams, consistent-deformation steps, the Diagrams tab, Learn, guide, report and reactions CSV. The solver
// values and the internal V/M conventions are unchanged. Exact user cases, every end-support pair, loaded and
// unloaded, couples, negative loads, curved loads, continuous spans and hinges.
//   MIE446_JSDOM_MODULE=/path/to/jsdom node computational/printed-wing-solver/web/test_beam_sign_convention.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url);
const B=require('./beam_learning_engine.js'), S=require('./beam_study.js'), D=require('./beam_diagrams.js'), Sol=require('./beam_solution.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const near=(a,b,rel,m,abs=0)=>{assert.ok(Math.abs(a-b)<=rel*Math.abs(b)+abs,`${m}: ${a} vs ${b}`);checks++;};
const parser=new JSDOM('').window;
const doc=html=>{const d=parser.document.createElement('div');d.innerHTML=html;return d;};
const text=el=>el.textContent.replace(/\s+/g,' ');
// Anything that would bring back a second ("hand", up/counter-clockwise-positive) reaction convention.
const FORBIDDEN=[/↑ ?\+/,/↺ ?\+/,/\+ ?up\b/i,/App [RC]\b/,/reverse the sign/i,/hand convention/i,/upward positive/i,/counter-?clockwise (as )?positive/i,/\+counterclockwise/i,/assumed ↑/,/assumed ↺/];
const clean=(s,where)=>{for(const re of FORBIDDEN) ok(!re.test(s),`${where}: no second convention (${re})`);ok(!/NaN|undefined|Infinity/.test(s),`${where}: finite`);};
const L=450, base={length:L,E:2200,section:{shape:'rectangle',width:16,height:8},elements:30,density:1.24,hinges:[],selfWeight:false};
const solve=m=>{const r=B.solve({...base,...m,modes:false});return {r,model:S.modelFromInput(r.input)};};
// The equations are satisfied by the solver's reactions (same convention, no sign change): A·fe + constant = 0,
// to FE round-off (about 1e-9 relative for couple loads); a sign error would leave an O(1) residual.
function checkRows(hs,r,where) {
  const scale=Math.max(1,...r.reactions.map(q=>Math.abs(q.force)*L+Math.abs(q.moment)),Math.abs(hs.Wtot)*L,Math.abs(hs.Mtot));
  hs.rows.forEach((row,k)=>{const res=row.coeffs.reduce((s,c,j)=>s+c*hs.fe[j],0)+row.constant;near(res,0,0,`${where}: equation ${row.key}${k} holds with the FE reactions`,1e-8*scale);});
  hs.unknowns.forEach((u,j)=>{const q=r.reactions[u.i];eq(hs.fe[j],u.type==='R'?q.force:q.moment,`${where}: ${u.type} unknown is the FE reaction itself (no sign flip)`);});
}

/* ---------- 1. HW 2B Case 1: cantilever, tip-heavy triangle q = 0 → 0.002 N/mm on 0–450 mm ---------- */
{
  const {r,model}=solve({supports:[{x:0,kind:'fixed'}],loads:[{kind:'distributed',start:0,end:L,qStart:0,qEnd:0.002}]});
  near(r.reactions[0].force,-0.45,1e-9,'solver R_A = −0.45 N (unchanged; FE round-off only)');near(r.reactions[0].moment,-135,1e-9,'solver C_A = −135 N·mm (unchanged)');
  const hs=Sol.handStatics(model,r);
  eq(JSON.stringify(hs.rows.flatMap(x=>[x.key,...x.coeffs,x.constant])),JSON.stringify(['F',1,0,0.45,'M',0,1,135]),'ΣF: R_A + 0.45 = 0; ΣM_A: C_A + 135 = 0');
  near(hs.solution[0],-0.45,1e-14,'R_A = −0.45 N');near(hs.solution[1],-135,1e-14,'C_A = −135 N·mm');checkRows(hs,r,'HW 2B 1');
  near(hs.acts[0].W,0.45,1e-14,'W = +0.45 N');near(hs.acts[0].xbar,300,1e-12,'x̄ = 300 mm');near(hs.acts[0].M,135,1e-12,'load moment about A = +135 N·mm (clockwise)');
  // internal V and M unchanged (left part, exact)
  for(const [x,side,V,M] of [[0,'right',0.45,-135],[225,'right',0.3375,-42.1875]]){const fa=B.fieldAt(r,x,side);near(fa.V,V,1e-9,`V(${x}) unchanged (FE reaction round-off)`);near(fa.M,M,1e-9,`M(${x}) unchanged`);}
  const html=Sol.render(model,r,{width:760}), d=doc(html), t=text(d);
  clean(html,'HW 2B 1 solution');
  ok(t.includes('ΣFy = 0 (↓ +)RA + 0.45 = 0'),'ΣF line: R_A + 0.45 = 0 (↓ +)');ok(t.includes('ΣMA = 0 (↻ +, about x = 0 mm)CA + (0.45)(300) = 0'),'ΣM line: C_A + (0.45)(300) = 0 (↻ +)');
  ok(t.includes('RA = −0.45 = −0.45 N (acts ↑)'),'R_A = −0.45 N, acts up');ok(t.includes('CA = −(0.45)(300) = −135 N·mm (acts ↺)'),'C_A = −(0.45)(300) = −135 N·mm, acts counter-clockwise');
  const loadRow=[...d.querySelectorAll('table tr')].find(tr=>/Triangular/.test(tr.textContent));
  eq([...loadRow.querySelectorAll('td')].slice(1).map(td=>td.textContent).join('|'),'0.45|300|135','load table: W = 0.45 N ↓ +, x̄ = 300, moment about A = +135 N·mm ↻ +');
  ok(/Moment about A \(N·mm, ↻ \+\)/.test(t)&&/Resultant W \(N, ↓ \+\)/.test(t),'load table headers');
  const rt=d.querySelector('table.bl-reactions-solution'), hdr=[...rt.querySelectorAll('th')].map(th=>th.textContent);
  eq(hdr.join('|'),'Support|Ry (N, ↓ +)|C (N·mm, ↻ +)|Acts on the beam|v (mm, ↓ +)|θ (rad, ↻ +)','reactions table: ONE signed R_y column and ONE C column, no duplicate columns');
  const cells=[...rt.querySelectorAll('tr')[1].querySelectorAll('td')].map(td=>td.textContent);
  eq(cells[1],'−0.45','R_y = −0.45');eq(cells[2],'−135','C = −135');ok(/Ry ↑ 0\.45 N/.test(cells[3])&&/C ↺ 135 N·mm/.test(cells[3]),'actual directions: R_y up, C counter-clockwise');eq(cells[5],'0 (clamped)');
  // free-body diagrams: unknowns in the positive directions, solved reactions in actual directions with signed labels
  const [unknown,solved]=[...d.querySelectorAll('svg.bl-fbd')];
  eq(unknown.querySelector('[data-ext="R"]').dataset.dir,'down','unknown R_A drawn downward (positive)');eq(unknown.querySelector('[data-ext="C"]').dataset.dir,'cw','unknown C_A drawn clockwise (positive)');
  ok(/RA \(assumed ↓ \+\)/.test(unknown.textContent)&&/CA \(assumed ↻ \+\)/.test(unknown.textContent),'unknown labels: assumed ↓ + and ↻ +');
  eq(solved.querySelector('[data-ext="R"]').dataset.dir,'up','solved R_A = −0.45 N drawn up (actual)');eq(solved.querySelector('[data-ext="C"]').dataset.dir,'ccw','solved C_A = −135 N·mm drawn counter-clockwise (actual)');
  ok(/RA = −0\.45 N/.test(solved.textContent)&&/CA = −135 N·mm/.test(solved.textContent),'solved labels keep the signed values');
  ok(/signed values \(R ↓ \+, C ↻ \+\)/.test(solved.textContent),'solved FBD key');
  for(const svg of [unknown,solved]) eq(svg.querySelectorAll('[data-support-kind], .bl-support').length,0,'no support symbols in a free-body diagram');
  ok(d.querySelector('svg.bl-axes [data-axis="force"][data-dir="down"]')&&d.querySelector('svg.bl-axes [data-axis="couple"][data-dir="cw"]'),'positive-direction sketch next to the solution: force ↓, couple ↻');
  ok(d.querySelector('svg.bl-axes [data-axis="V"][data-dir="down"]')&&d.querySelector('svg.bl-axes [data-axis="M"][data-dir="ccw"]'),'…and the internal V, M on the left part\'s face, kept separate');
}

/* ---------- 2. HW 2B Case 3 / fixed–fixed, q = 0.002 → 0: reactions and compatibility in the same convention ---------- */
{
  const {r,model}=solve({supports:[{x:0,kind:'fixed'},{x:L,kind:'fixed'}],loads:[{kind:'distributed',start:0,end:L,qStart:0.002,qEnd:0}]});
  near(r.reactions[0].force,-0.315,1e-10,'R_A = −0.315 N');near(r.reactions[1].force,-0.135,1e-10,'R_B = −0.135 N');near(r.reactions[0].moment,-20.25,1e-9,'C_A = −20.25 N·mm');near(r.reactions[1].moment,13.5,1e-9,'C_B = +13.5 N·mm');
  const hs=Sol.handStatics(model,r);checkRows(hs,r,'fixed–fixed');eq(hs.solution,null,'indeterminate: equilibrium alone does not solve');
  const fm=B.forceMethod({...model,elements:r.input.elements});
  ok(fm.redundants.length===2&&fm.mismatch<1e-9,`compatibility reproduces the FE reactions (${fm.mismatch})`);
  fm.flexibility.forEach((row,i)=>ok(row[i]>0,`f${i+1}${i+1} > 0 for a unit redundant in its positive direction`));
  fm.redundants.forEach((c,j)=>near(fm.X[j],c.type==='v'?r.reactions.find(q=>q.x===c.x).force:r.reactions.find(q=>q.x===c.x).moment,1e-9,'X is the reaction itself (↓ +, ↻ +)'));
  const html=Sol.render(model,r,{width:760}), d=doc(html), t=text(d);clean(html,'fixed–fixed solution');
  ok(/1 N downward, or 1 N·mm clockwise/.test(t),'unit redundants act in the positive directions');
  for(const [lab,v] of [['RB',-0.135],['CB',13.5]]) ok(t.includes(`${lab} = ${D.fmt(v,5)}`),`redundant ${lab} = ${v}`);
  ok(/RB = −0\.135 N \(acts ↑\)|RB = −0\.135 ?N/.test(t),'R_B acts up');
  const rows=[...d.querySelector('table.bl-reactions-solution').querySelectorAll('tr')].slice(1).map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent));
  eq(rows.map(c=>[c[1],c[2]].join(',')).join(';'),'−0.315,−20.25;−0.135,13.5','reactions table: R_y and C in the single convention');
  const solved=[...d.querySelectorAll('svg.bl-fbd')].at(-1);
  eq([...solved.querySelectorAll('[data-ext]')].map(g=>`${g.dataset.ext}${g.dataset.support}:${g.dataset.dir}`).join(' '),'RA:up CA:ccw RB:up CB:cw','solved arrows in the actual directions');
  ok(/CB = \+13\.5 N·mm/.test(solved.textContent)&&/RB = −0\.135 N/.test(solved.textContent),'signed labels');
}

/* ---------- 3. every end-support pair, loaded and unloaded, couples, negative and curved loads ---------- */
const pairs=[['fixed','free'],['free','fixed'],['pin','roller'],['roller','pin'],['pin','pin'],['fixed','pin'],['fixed','roller'],['pin','fixed'],['roller','fixed'],['fixed','fixed']];
const loadSets=[[],[{kind:'point',position:300,force:2}],[{kind:'point',position:120,force:-1.5}],[{kind:'moment',position:200,moment:80}],[{kind:'moment',position:350,moment:-60}],
  [{kind:'distributed',start:0,end:L,qStart:0.002,qEnd:0.002}],[{kind:'distributed',start:50,end:400,qStart:0.003,qEnd:-0.001}],[{kind:'elliptic',start:0,end:L,shape:'start',total:0.45}],
  [{kind:'point',position:225,force:1},{kind:'moment',position:100,moment:-40},{kind:'parabolic',start:100,end:350,shape:'middle',peak:-0.004}]];
let cases=0;
for(const [a,b] of pairs) for(const loads of loadSets) {
  const supports=[...(a==='free'?[]:[{x:0,kind:a}]),...(b==='free'?[]:[{x:L,kind:b}])];
  const {r,model}=solve({supports,loads}), where=`${a}–${b} ${loads.map(v=>v.kind).join('+')||'unloaded'}`;
  const hs=Sol.handStatics(model,r);checkRows(hs,r,where);
  // round-off scale of the FE reactions: forces ~ the loads, couples ~ the loads × L
  const sc=Math.max(1e-12,...hs.fe.map((v,j)=>Math.abs(v)/(hs.unknowns[j].type==='R'?1:L)),Math.abs(hs.Wtot),Math.abs(hs.Mtot)/L);
  if(hs.solution) hs.solution.forEach((v,j)=>near(v,hs.fe[j],1e-8,`${where}: determinate solution = FE reaction`,1e-8*sc*(hs.unknowns[j].type==='R'?1:L)));
  if(!loads.length) ok(r.reactions.every(q=>q.force===0&&q.moment===0),`${where}: unloaded reactions exactly zero`);
  const html=Sol.render(model,r,{width:760});clean(html,where);ok(!/class="bl-err"/.test(html),`${where}: no error message in the worked solution`);
  const d=doc(html), rows=[...d.querySelector('table.bl-reactions-solution').querySelectorAll('tr')].slice(1);
  r.reactions.forEach((q,i)=>{const c=[...rows[i].querySelectorAll('td')].map(td=>td.textContent);
    const tol=D.zeroTolerance(r.loadsApplied,L);eq(c[1],D.fmt(Math.abs(q.force)<=tol.force?0:q.force,5),`${where}: R_y cell`);
    if(q.kind==='fixed') eq(c[2],D.fmt(Math.abs(q.moment)<=tol.moment?0:q.moment,5),`${where}: C cell`); else eq(c[2],'0 (rotation free)',`${where}: pin/roller C = 0, rotation free`);});
  const solved=[...d.querySelectorAll('svg.bl-fbd')].at(-1);
  for(const g of solved.querySelectorAll('[data-ext="R"]')){const q=r.reactions[g.dataset.support.charCodeAt(0)-65];eq(g.dataset.dir,q.force<0?'up':'down',`${where}: R arrow in the actual direction`);}
  for(const g of solved.querySelectorAll('[data-ext="C"]')){const q=r.reactions[g.dataset.support.charCodeAt(0)-65];eq(g.dataset.dir,q.moment>0?'cw':'ccw',`${where}: C arrow in the actual direction`);}
  if(hs.unknowns.length>2&&B.forceMethod({...model,elements:r.input.elements}).redundants.length) {const fm=B.forceMethod({...model,elements:r.input.elements});ok(fm.mismatch<1e-8&&fm.flexibility.every((row,i)=>row[i]>0),`${where}: compatibility in the same convention`);}
  cases++;
}

/* ---------- 4. continuous spans and hinges ---------- */
for(const [name,m] of [
  ['four supports',{supports:[{x:0,kind:'pin'},{x:150,kind:'roller'},{x:300,kind:'roller'},{x:L,kind:'roller'}],loads:[{kind:'distributed',start:0,end:L,qStart:0.002,qEnd:0.002},{kind:'point',position:225,force:-1}]}],
  ['propped, interior support',{supports:[{x:0,kind:'fixed'},{x:300,kind:'roller'}],loads:[{kind:'point',position:L,force:1},{kind:'moment',position:150,moment:50}]}],
  ['Gerber hinge (determinate)',{supports:[{x:0,kind:'fixed'},{x:300,kind:'roller'}],hinges:[150],loads:[{kind:'distributed',start:0,end:L,qStart:0.002,qEnd:0},{kind:'point',position:100,force:1}]}],
  ['two hinges, three supports',{supports:[{x:0,kind:'fixed'},{x:225,kind:'roller'},{x:L,kind:'roller'}],hinges:[150,300],loads:[{kind:'elliptic',start:0,end:L,shape:'end',total:-0.6},{kind:'moment',position:400,moment:30}]}],
]) {
  const {r,model}=solve(m), hs=Sol.handStatics(model,r);checkRows(hs,r,name);
  const sc=Math.max(1e-12,...hs.fe.map((v,j)=>Math.abs(v)/(hs.unknowns[j].type==='R'?1:L)),Math.abs(hs.Wtot),Math.abs(hs.Mtot)/L);
  if(hs.solution) hs.solution.forEach((v,j)=>near(v,hs.fe[j],1e-8,`${name}: solution = FE reaction`,1e-8*sc*(hs.unknowns[j].type==='R'?1:L)));
  ok(hs.rows.filter(x=>x.key==='H').length===model.hinges.length,`${name}: one moment equation per hinge`);
  const html=Sol.render(model,r,{width:760});clean(html,name);ok(!/class="bl-err"/.test(html),`${name}: no error message in the worked solution`);
  if(model.hinges.length) ok(/M = 0 at hinge x = 150 mm \(left part, moments ↻ \+\)/.test(text(doc(html))),`${name}: hinge equation in the same convention`);
}
// the propped-cantilever closed form is written in the same convention (the prop reaction is negative: it pushes up)
{const q=0.002, {r,model}=solve({supports:[{x:0,kind:'fixed'},{x:L,kind:'roller'}],loads:[{kind:'distributed',start:0,end:L,qStart:q,qEnd:q}]});
 const bm=Sol.benchmark(model,r);near(bm.exact,-3*q*L/8,1e-15,'R_prop = −3qL/8 (↓ +)');near(bm.fe,bm.exact,1e-9,'solver prop reaction');clean(Sol.render(model,r,{width:760}),'propped cantilever');}

/* ---------- 5. the whole Beam workspace: no second convention anywhere a reaction appears ---------- */
{
  const dom=new JSDOM('<div id="foundations"></div>',{url:'https://example.org/wing-lab.html?beamCase=hw2b-fixed',runScripts:'outside-only'});
  const w=dom.window, downloads=[];w.Blob=Blob;w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:x';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};w.print=()=>{};
  const {$}=loadBeamLab(dom);
  for(const tab of ['diagrams','cut','solution','modes','compare','report','learn']) {$(`[data-tab="${tab}"]`).click();clean($('#foundations').innerHTML.replace(/<script[\s\S]*?<\/script>/g,''),`${tab} tab`);}
  ok(/Ry \(N, ↓ \+\)/.test($('#beamReactions').textContent)&&/C \(N·mm, ↻ \+\)/.test($('#beamReactions').textContent),'Diagrams tab reactions table: R_y ↓ +, C ↻ +');
  ok(/also for hand equations/.test($('#beamReactions').textContent),'the table says the hand equations use the same signs');
  $('[data-tab="report"]').click();$('#beamCsvReactions').click();
  const csv=(await downloads.at(-1).text()).trim().split('\r\n');
  eq(csv[0],'x_mm,support,type,R_y_N_down,C_Nmm_clockwise,v_mm,theta_rad','reactions CSV header');
  ok(csv[1].startsWith('0,A,fixed,-0.315')&&csv[2].startsWith('450,B,fixed,-0.135'),`reactions CSV values in the same convention: ${csv[1]} | ${csv[2]}`);
  $('#beamPrintBtn').click();clean($('#beamPrint').innerHTML,'printed report');ok(/Ry \(N, ↓ \+\)/.test($('#beamPrint').textContent),'report: R_y column');
  $('[data-tab="compare"]').click();$('#beamSaveA').click();$('#beamSaveB').click();ok(/Ry at A \(↓ \+\)/.test($('#beamCompare').textContent),'A/B table: R_y at A (↓ +)');
  dom.window.close();
}
console.log(`Beam sign convention: ${checks} checks passed (one convention — forces and reactions R_y ↓ +, couples, reaction couples C and moments ↻ + — in equations, load/reaction tables, unknown and solved FBDs, consistent deformations, Diagrams/Learn/guide/report/A-B/CSV; HW 2B cases 1 and 3 exact; ${cases} support-pair × load cases; continuous spans and hinges; solver values and internal V/M unchanged).`);
