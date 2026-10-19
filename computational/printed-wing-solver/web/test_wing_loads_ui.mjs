// Shared wing custom-load editor (wing_loads_ui.js) in jsdom, driven like a user, with the real engines as
// validators: every load kind from the form, x/c, refusals that leave the load case unchanged, the CSV table
// (template, malformed rows, preview, add / replace / edit, x/c column, hostile file name, SHA-256), the
// chord-position figure and caption (torque sign), the Schrenk figure/table, and the keeper that preserves the
// form across panel re-renders. The workspace wiring itself is tested in test_metal_ui.mjs and the browser test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto,createHash} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const P=require('./load_profiles.js'), E=require('./engine.js'), M=require('./metal_wing_engine.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const near=(a,b,rel,m,abs=0)=>{assert.ok(Math.abs(a-b)<=rel*Math.abs(b)+abs,`${m}: ${a} vs ${b}`);checks++;};
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const clean=html=>!/NaN|undefined|Infinity/.test(html);

function page() {
  const dom=new JSDOM('<!doctype html><head></head><body><div id="host"></div><div id="panel"></div></body>',{url:'https://example.org/wing-lab.html',runScripts:'outside-only'});
  const w=dom.window, ctx=dom.getInternalVMContext();
  Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});w.TextEncoder=TextEncoder;
  vm.runInContext(read('./load_profiles.js'),ctx);vm.runInContext(read('./wing_loads_ui.js'),ctx);
  return {dom,w,$:s=>w.document.querySelector(s),$$:s=>[...w.document.querySelectorAll(s)]};
}
// A workspace adapter around a plain state object, validated by the real engine.
function printedAdapter(state,downloads) {
  const g=E.makeGeometry(), L=g.semiSpan, solved=E.solve({load:{kind:'custom',items:[]}});
  return {
    workspace:'printed',units:{length:'mm',line:'N/mm',force:'N',moment:'N·mm'},
    ids:{form:'wf',kind:'wk',a:'wa',b:'wb',P:'wp',q0:'wq0',q1:'wq1',shape:'ws',basis:'wbasis',value:'wv',xc:'wxc',law:'wlaw',list:'wlist',clear:'wclear',flight:'wflight',status:'wstatus',chord:'wchord',csv:'wcsv'},
    kindValue:{point:'point',uniform:'rectangle',rampUp:'triangle',rampDown:'triangleDown',trapezoid:'trapezoid',elliptic:'elliptic',parabolic:'parabolic',schrenk:'schrenk'},
    deleteAttr:'data-wdel',range:()=>({min:0,max:L}),
    items:()=>state.load.kind==='custom'?state.load.items:[],
    mode:()=>state.load.kind==='custom'?(state.load.items.length?'custom':'none'):state.load.kind,
    validate:items=>E.normalize({load:{kind:'custom',items}}),
    apply:(items,note)=>{state.load={kind:'custom',items:JSON.parse(JSON.stringify(items))};state.applied.push(note);},
    flight:{label:'Apply flight-like lift',apply:()=>{state.load={kind:'flight',loadFactor:4};state.applied.push('flight');}},
    allowSchrenk:true,refStation:0,refLabel:'the root (y = 0)',
    section:y=>{const c=E.chordAt(g,y),xs=E.interp(y,solved.y,solved.props.xsc);return {outline:[[0,0],[0.3*c,0.06*c],[c,0],[0.3*c,-0.04*c]],chord:c,xsc:xs};},
    schrenkCentroid:()=>{const d=globalThis.__W.schrenkData(L,y=>E.chordAt(g,y),1,[g.rootChord,g.tipChord]);return d.stats.schrenk.ybar;},
    defaults:{a:100,b:L,P:2,q0:0.004,q1:0.002,total:2,xc:0.3},
    statusText:()=>`mode ${state.load.kind}`,download:(n,t,ty)=>downloads.push({n,t,ty}),
    torqueNote:'Printed-wing note.',
  };
}
const ad520=(state)=>({
  workspace:'d520',units:{length:'m',line:'N/m',force:'N',moment:'N·m'},
  ids:{form:'mf',kind:'mk',a:'ma',b:'mb',P:'mp',q0:'mq0',q1:'mq1',shape:'ms',basis:'mbasis',value:'mv',xc:'mxc',law:'mlaw',list:'mlist',clear:'mclear',flight:'mflight',status:'mstatus',chord:'mchord',csv:'mcsv'},
  kindValue:{point:'point',uniform:'uniform',rampUp:'up',rampDown:'down',trapezoid:'trapezoid',elliptic:'elliptic',parabolic:'parabolic'},
  deleteAttr:'data-mdel',range:()=>({min:M.D520.fittingY,max:M.D520.ribs.at(-1)}),
  items:()=>state.customLoads||[],mode:()=>state.customLoads==null?'flight':state.customLoads.length?'custom':'none',
  validate:items=>M.normalise({customLoads:items,n:1}),apply:items=>{state.customLoads=JSON.parse(JSON.stringify(items));},
  flight:null,allowSchrenk:false,refStation:M.D520.fittingY,refLabel:'the fittings',section:()=>null,defaults:{a:2,b:4.93,P:1000,q0:500,q1:1000,total:2000,xc:0.25},
});

/* ---------- 1. printed wing: every kind through the form ---------- */
{
  const {w,$,dom}=page();globalThis.__W=w.WingLoadsUI;
  const state={load:{kind:'custom',items:[]},applied:[]},ad=printedAdapter(state,[]);
  let receive,stops=0;
  ad.pickOnModel=callback=>{receive=callback;return ()=>{stops++;};};
  w.WingLoadsUI.mount($('#host'),ad);
  $('#host .wle-pick').click();eq(state.applied.length,0,'arming picker applies no default');
  receive({station:200,fraction:.65});eq($('#wa').value,'200');eq($('#wxc').value,'0.65');eq($('#wp').value,'','picked force magnitude is blank');eq(state.applied.length,0);eq(stops,1);
  $('#wp').value='3';$('#wf').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));eq(state.load.items[0].fraction,.65);eq(state.load.items[0].position,200);eq(state.load.items[0].force,3);
  $('#wk').value='rectangle';$('#wk').dispatchEvent(new w.Event('change'));$('#host .wle-pick').click();
  receive({station:350,fraction:.3});eq(state.applied.length,1);receive({station:100,fraction:.9});eq($('#wa').value,'100');eq($('#wb').value,'350');eq($('#wxc').value,'0.3','whole line uses first picked x/c');eq($('#wq0').value,'');
  $('#host .wle-pick').click();receive({station:600,fraction:.5});ok(/Pick visible skin/.test($('#wstatus').textContent));eq(state.applied.length,1,'out of range does not modify loads');
  dom.window.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));eq($('#host .wle-pick').getAttribute('aria-pressed'),'false');
  const p=w.WingLoadsUI.surfaceSample([{station:0,fraction:.1},{station:300,fraction:.5},{station:300,fraction:.9}],[.2,.3,.5]);near(p.station,240,1e-12,'barycentric span');near(p.fraction,.62,1e-12,'barycentric chord');eq(w.WingLoadsUI.surfaceSample([{station:0,fraction:0},{station:1,fraction:1},{station:1,fraction:0}],[2,-1,0]),null);
  const can=dom.window.document.createElement('canvas');let count=0,restored=0;
  const stop=w.WingLoadsUI.surfacePicker(can,()=>({station:1,fraction:.2}),()=>()=>{restored++;})(()=>{count++;});
  const pe=(type,x)=>can.dispatchEvent(new w.MouseEvent(type,{clientX:x,clientY:10,button:0}));
  pe('pointerdown',0);pe('pointerup',30);eq(count,0,'orbit drag does not count as a pick');pe('pointerdown',10);pe('pointerup',11);eq(count,1);stop();pe('pointerdown',10);pe('pointerup',10);eq(count,1);eq(restored,1);
  dom.window.close();
}
{
  const {w,$,$$,dom}=page();globalThis.__W=w.WingLoadsUI;
  const state={load:{kind:'custom',items:[]},applied:[]}, downloads=[];
  const ad=printedAdapter(state,downloads), L=E.makeGeometry().semiSpan;
  const ed=w.WingLoadsUI.mount($('#host'),ad);
  ok($('#host .wle[data-workspace="printed"]'),'editor mounted');
  eq($('#wlist').textContent.trim(),'No load defined. Add your own load.','empty state');
  eq($$('#wk option').map(o=>o.value).join(),'point,rectangle,triangle,triangleDown,trapezoid,elliptic,parabolic,schrenk','printed: eight shapes including Schrenk');
  const set=(id,v)=>{$('#'+id).value=String(v);};
  const kind=v=>{$('#wk').value=v;$('#wk').dispatchEvent(new w.Event('change'));};
  const submit=()=>$('#wf').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const shown=id=>!$('#'+id).closest('.field').hidden&&!$('#'+id).disabled;
  const cases=[
    ['point',{wa:300,wp:2,wxc:0.25},{kind:'point',position:300,force:2,fraction:0.25},['wa','wp','wxc'],['wb','wq0','wq1','ws','wbasis','wv']],
    ['rectangle',{wa:0,wb:L,wq0:0.004,wxc:0.3},{kind:'distributed',start:0,end:L,qStart:0.004,qEnd:0.004,fraction:0.3},['wa','wb','wq0'],['wp','wq1','ws']],
    ['triangle',{wa:0,wb:L,wq1:0.006,wxc:0.3},{kind:'distributed',start:0,end:L,qStart:0,qEnd:0.006,fraction:0.3},['wq1'],['wq0']],
    ['triangleDown',{wa:0,wb:L,wq0:0.006,wxc:0.3},{kind:'distributed',start:0,end:L,qStart:0.006,qEnd:0,fraction:0.3},['wq0'],['wq1']],
    ['trapezoid',{wa:50,wb:400,wq0:0.002,wq1:-0.001,wxc:0.5},{kind:'distributed',start:50,end:400,qStart:0.002,qEnd:-0.001,fraction:0.5},['wq0','wq1'],['wp']],
    ['elliptic',{wa:0,wb:L,ws:'start',wbasis:'total',wv:2,wxc:0.25},{kind:'elliptic',start:0,end:L,shape:'start',total:2,fraction:0.25},['ws','wbasis','wv'],['wq0','wq1','wp']],
    ['parabolic',{wa:100,wb:400,ws:'middle',wbasis:'peak',wv:0.004,wxc:0.4},{kind:'parabolic',start:100,end:400,shape:'middle',peak:0.004,fraction:0.4},['ws','wbasis','wv'],['wq0']],
    ['schrenk',{wv:5,wxc:0.25},{kind:'schrenk',total:5,fraction:0.25},['wv','wxc'],['wa','wb','ws','wbasis']],
  ];
  const expected=[];
  for(const [k,vals,item,on,off] of cases) {
    kind(k);for(const [id,v] of Object.entries(vals)){set(id,v);if(id==='wbasis'||id==='ws')$('#'+id).dispatchEvent(new w.Event('change'));}
    $('#wf').dispatchEvent(new w.Event('input',{bubbles:true}));
    ok(on.every(shown)&&off.every(id=>!shown(id)),`${k}: only the fields it uses are shown and enabled`);
    if(k==='elliptic'){const law=$('#wlaw').textContent;ok(law.includes('w = w₀√(1 − s²)')&&law.includes(`w₀ = ${w.WingLoadsUI.fmt(8/(Math.PI*L))} N/mm`)&&law.includes(`ȳ = ${w.WingLoadsUI.fmt(4*L/(3*Math.PI))} mm`),'elliptic law, w₀ and ȳ');}
    if(k==='parabolic')ok($('#wlaw').textContent.includes('F = 0.8 N'),'parabolic F = 2w₀ℓ/3');
    if(k==='schrenk')ok(/½\[F·c\(y\)\/∫c dy \+ \(4F\/πL\)√\(1 − \(y\/L\)²\)\]/.test($('#wlaw').textContent)&&/not a CFD result/.test($('#wlaw').textContent),'Schrenk law and its limits');
    submit();expected.push(item);
    eq(JSON.stringify(state.load.items),JSON.stringify(expected),`${k}: added exactly as entered`);
  }
  eq(state.load.items.length,8,'eight loads');ok(/^1\. /.test($('#wlist p').textContent)&&$$('#wlist p').length===8,'list');
  ok($('#wlist').textContent.includes('elliptic (max at start) 0–450 mm: F = 2 N, w₀ = 0.005659 N/mm; x/c = 0.25'),'list describes the curve with F and w₀');
  ok($('#wlist').textContent.includes('Schrenk over the whole semi-span (this planform): F = 5 N; x/c = 0.25'),'list describes Schrenk');
  const r=E.solve({load:{kind:'custom',items:state.load.items}});ok(Number.isFinite(r.deflection.at(-1))&&r.verification.rootShearError<1e-12,'the engine solves the eight loads');
  // the 12-item limit and refusals: the load case is unchanged and the reason is shown
  const before=JSON.stringify(state.load);
  for(const [k,vals,msg] of [['point',{wa:500,wp:1,wxc:0.3},/span|station|load/i],['elliptic',{wa:300,wb:300,wv:1,wxc:0.3},/start|end|length|span/i],['point',{wa:100,wp:1,wxc:1.5},/between 0 \(leading edge\) and 1/],
    ['parabolic',{wa:0,wb:L,wv:'',wxc:0.3},/finite number/],['point',{wa:'1e999',wp:1,wxc:0.3},/finite number/],['schrenk',{wv:'NaN',wxc:0.3},/finite number/]]) {
    kind(k);for(const [id,v] of Object.entries(vals))set(id,v);submit();
    ok(msg.test($('#wstatus').textContent),`refused ${k} ${JSON.stringify(vals)}: ${$('#wstatus').textContent}`);eq(JSON.stringify(state.load),before,'load case unchanged');
  }
  for(let i=0;i<4;i++){kind('point');set('wa',100+10*i);set('wp',0.1);set('wxc',0.3);submit();}
  eq(state.load.items.length,12,'twelve loads');kind('point');set('wa',250);submit();
  ok(/at most 12/i.test($('#wstatus').textContent)&&state.load.items.length===12,`13th load refused: ${$('#wstatus').textContent}`);
  // remove one, clear, flight; a first custom load after flight replaces the flight case
  $('[data-wdel="0"]').click();eq(state.load.items.length,11,'Remove');eq(state.load.items[0].kind,'distributed');
  $('#wclear').click();eq(state.load.items.length,0,'Clear');eq($('#wlist').textContent.trim(),'No load defined. Add your own load.');
  $('#wflight').click();eq(state.load.kind,'flight','flight only on request');ok(/Flight-like loading is active/.test($('#wlist').textContent));
  kind('point');set('wa',450);set('wp',2);set('wxc',0.3);submit();eq(JSON.stringify(state.load),JSON.stringify({kind:'custom',items:[{kind:'point',position:450,force:2,fraction:0.3}]}),'first custom load replaces the flight case (no superposed lift or inertia relief)');
  // chord-position figure: torque sign, reversal, zero eccentricity
  const sec=ad.section(300), f0=sec.xsc/sec.chord;
  const fig=(xc,F=2)=>{kind('point');set('wa',300);set('wp',F);set('wxc',xc);$('#wf').dispatchEvent(new w.Event('input',{bubbles:true}));return {svg:$('#wchord').innerHTML,cap:$('#wchordCap').textContent};};
  let a=fig(f0+0.1);ok(/nose-down/.test(a.svg)&&/nose-down/.test(a.cap),'upward force aft of the shear centre: nose-down');
  ok(a.cap.includes(`T = F·(x_sc − x_F) = ${w.WingLoadsUI.signed(2*(sec.xsc-(f0+0.1)*sec.chord))} N·mm`),'caption gives T = F(x_sc − x_F) with its value');
  ok(/V and M use only F and its span station; x\/c does not change them/.test(a.cap)&&/Printed-wing note/.test(a.cap),'bending vs torsion and the workspace note');
  a=fig(f0-0.1);ok(/nose-up/.test(a.svg),'forward of the shear centre: nose-up');
  a=fig(f0+0.1,-2);ok(/nose-up/.test(a.svg),'downward force aft: nose-up');
  a=fig(f0);ok(!/nose-/.test(a.svg)&&/zero/.test(a.cap),'through the shear centre: no torque arrow, T = zero');
  for(const xc of [0,0.25,0.5,0.75,1])ok(clean(fig(xc).svg)&&/<svg/.test(fig(xc).svg),`clean chord figure at x/c = ${xc}`);
  ok(/SC/.test(a.svg)&&/LE \(x\/c = 0\)/.test(a.svg)&&/TE \(1\)/.test(a.svg),'figure labels LE, TE and SC');
  // CSV: template, malformed, preview, add, replace, edit, x/c column
  $('#wcsvTemplate').click();eq(downloads.at(-1).n,'printed_line_load_template.csv');ok(P.parseCsv(downloads.at(-1).t,{workspace:'printed',min:0,max:L,ref:0}).ok,'template parses');
  const csv=text=>{$('#wcsvText').value=text;$('#wcsvText').dispatchEvent(new w.Event('input',{bubbles:true}));$('#wcsvPreview').click();return $('#wcsvOut').textContent;};
  const one=JSON.stringify(state.load);
  for(const bad of ['y_mm,w_N_per_mm\n0,0.002\n0,0.001','y_mm,w_N_per_mm\n0,0.002\n500,0','y_m,w_N_per_m\n0,2\n0.45,0','y_mm,w_N_per_mm,x_over_c\n0,0.002,1.2\n450,0,0.3',
    'y_mm,w_N_per_mm\n0,<img src=x onerror=1>\n450,0','y_mm,w_N_per_mm\n'+Array.from({length:32},(_,i)=>`${i*14},0.001`).join('\n')]) {
    ok(/Not imported/.test(csv(bad))&&$('#wcsvApply').disabled,`malformed table refused: ${bad.slice(0,40)}`);eq($('#wcsvOut').querySelectorAll('img,script').length,0);
    $('#wcsvApply').onclick();eq(JSON.stringify(state.load),one,'nothing applied');
  }
  let out=csv('y_mm,w_N_per_mm\n0,0.004\n150,0.002\n450,0\n');
  ok(/Preview: 3 rows, 2 linear segments/.test(out)&&/0\.75 N \(up\)/.test(out)&&/x\/c = 0\.3 for every row/.test(out),'preview with total and x/c');
  eq($('#wcsvMode').hidden,false);$('#wcsvApply').click();
  eq(state.load.items.length,2,'table added');eq(JSON.stringify(state.load.items[1]),JSON.stringify({kind:'table',points:[[0,0.004],[150,0.002],[450,0]],fraction:0.3,source:{filename:'pasted table',rows:3}}),'table item');
  out=csv('y_mm,w_N_per_mm,x_over_c\n0,0.004,0.2\n450,0,0.6\n');ok(/x\/c from the table/.test(out),'x/c column recognised');
  $('#wcsvMode input[value="replace"]').checked=true;$('#wcsvMode').dispatchEvent(new w.Event('change',{bubbles:true}));$('#wcsvApply').click();
  eq(state.load.items.length,1,'replace');eq(JSON.stringify(state.load.items[0].points),'[[0,0.004,0.2],[450,0,0.6]]','x/c kept per row');ok(!('fraction' in state.load.items[0])||state.load.items[0].fraction===0.3,'row x/c used');
  eq($('#wcsvMode input[value="add"]').checked,true,'Replace not remembered');
  const tr=E.solve({load:{kind:'custom',items:state.load.items}}), Xref=P.weighted({kind:'table',points:[[0,0.004,0.2],[450,0,0.6]]},0,450,y=>P.fractionAt({kind:'table',points:[[0,0.004,0.2],[450,0,0.6]]},y)*E.chordAt(E.makeGeometry(),y));
  near(tr.T[0],tr.props.xsc[0]*tr.V[0]-Xref,1e-12,'root torque from the row x/c, T = x_sc V − ∫ x_F w dy',1e-12);
  // edit the table in place
  $('[data-wle-edit-table="0"]').click();eq($('#wcsv').open,true,'Edit table opens the importer');ok($('#wcsvText').value.startsWith('y_mm,w_N_per_mm,x_over_c\n0,0.004,0.2\n450,0,0.6'),'table text refilled');
  csv('y_mm,w_N_per_mm,x_over_c\n0,0.005,0.2\n450,0,0.6\n');ok(/replaces table load 1 only/.test($('#wcsvOut').textContent));$('#wcsvApply').click();eq(state.load.items[0].points[0][1],0.005,'edited');
  // file with a hostile name: text only, SHA-256 of the bytes
  const name='<svg onload="window.pwned=1">.csv', text='y_mm,w_N_per_mm\r\n0,0.003\r\n450,0\r\n';
  Object.defineProperty($('#wcsvFile'),'files',{value:[{name,size:text.length,text:async()=>text}],configurable:true});$('#wcsvFile').dispatchEvent(new w.Event('change'));await tick();
  ok($('#wcsvOut').textContent.includes(name)&&$('#wcsvOut').querySelectorAll('svg[onload]').length===0,'file name shown as text');
  ok($('#wcsvOut').textContent.includes(createHash('sha256').update(text).digest('hex').slice(0,12)),'SHA-256 of the file bytes');
  $('#wcsvApply').click();eq(state.load.items.at(-1).source.sha256,createHash('sha256').update(text).digest('hex'));eq($('#wlist').querySelectorAll('svg[onload]').length,0,'list escapes the name');eq(w.pwned,undefined);
  // Schrenk figure and table: equal areas, resultant moments
  const g=E.makeGeometry(), dR=w.WingLoadsUI.schrenkData(L,()=>(g.rootChord+g.tipChord)/2,1,[(g.rootChord+g.tipChord)/2,(g.rootChord+g.tipChord)/2]), dT=w.WingLoadsUI.schrenkData(L,y=>E.chordAt(g,y),1,[g.rootChord,g.tipChord]);
  for(const d of [dR,dT]) {
    for(const key of ['wc','we','ws']){let s=0;const n=20000;for(let i=0;i<n;i++){const y=(i+.5)*L/n;s+=d[key](y)*L/n;}near(s,1,2e-6,`∫${key} dy = F`);}
    near(d.stats.schrenk.M,0.5*(d.stats.chord.M+d.stats.ellipse.M),1e-15,'Schrenk root moment = mean of the two');near(d.stats.ellipse.ybar,4*L/(3*Math.PI),1e-15,'elliptic ȳ = 4L/(3π)');
  }
  near(dR.stats.chord.ybar,L/2,1e-15,'rectangle: chord load at L/2');near(dT.stats.chord.ybar,L*(g.rootChord+2*g.tipChord)/(3*(g.rootChord+g.tipChord)),1e-14,'taper: chord-load centroid');
  const panels=[{title:'Rectangle',short:'R',chord:()=>(g.rootChord+g.tipChord)/2,data:dR},{title:'Taper',short:'T',chord:y=>E.chordAt(g,y),data:dT}];
  const sf=w.WingLoadsUI.schrenkFigure(panels,{width:760}), st=w.WingLoadsUI.schrenkTable(panels,{force:'N',length:'mm',moment:'N·mm'});
  ok(clean(sf)&&(sf.match(/<polyline/g)||[]).length===6&&/chord-proportional/.test(sf),'Schrenk figure: three curves per panel, legend');ok(clean(st)&&(st.match(/<tr>/g)||[]).length===7,'Schrenk table: six rows');
  // keeper: the form and an open CSV preview survive a re-render of the panel
  $('#host').innerHTML='';   // one editor per document (element ids)
  const kp=w.WingLoadsUI.keeper(ad), render=()=>{kp.detach();$('#panel').innerHTML='<p>results</p><div id="slot"></div>';kp.place(null,$('#slot'));};
  render();const e2=kp.editor;e2.container.querySelector('#wa').value='123';csv('y_mm,w_N_per_mm\n0,0.001\n450,0');
  render();eq(kp.editor,e2,'same editor after a re-render');eq($('#panel #wa').value,'123','typed value kept');ok(/Preview: 2 rows/.test($('#panel #wcsvOut').textContent),'CSV preview kept');
  dom.window.close();
}

/* ---------- 2. D.520: SI units, no Schrenk, fittings-to-last-rib range ---------- */
{
  const {w,$,$$,dom}=page();
  const state={customLoads:[]}, ad=ad520(state);
  w.WingLoadsUI.mount($('#host'),ad);
  eq($$('#mk option').map(o=>o.value).join(),'point,uniform,up,down,trapezoid,elliptic,parabolic','D.520: no Schrenk custom shape');
  eq($('#mflight'),null,'no flight button when the workspace provides none');
  ok(/y_m,w_N_per_m/.test($('#mcsv').textContent)&&/0\.46–4\.93 m/.test($('#mcsv').textContent),'CSV header in SI and the span range');
  const set=(id,v)=>{$('#'+id).value=String(v);};
  $('#mk').value='elliptic';$('#mk').dispatchEvent(new w.Event('change'));set('ma',0.46);set('mb',4.93);set('mv',10000);set('mxc',0.25);
  ok(/N\/m/.test($('label[for="mv"]').textContent)||/N,/.test($('label[for="mv"]').textContent),'SI labels');
  $('#mf').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  eq(JSON.stringify(state.customLoads),JSON.stringify([{kind:'elliptic',start:0.46,end:4.93,shape:'start',total:10000,fraction:0.25}]),'D.520 elliptic load');
  const r=M.solve({customLoads:state.customLoads,n:1,collapse:false,modes:false});near(r.perG.V(0.46+1e-12),10000,1e-12,'shear at the fittings = F');
  near(r.perG.M(0.46+1e-12),10000*4*(4.93-0.46)/(3*Math.PI),1e-12,'moment at the fittings = 4ℓF/(3π)');
  set('ma',0.3);set('mb',3);$('#mf').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  ok(/Nothing was changed/.test($('#mstatus').textContent)&&state.customLoads.length===1,'inboard of the fittings: refused, unchanged');
  const csv=text=>{$('#mcsvText').value=text;$('#mcsvPreview').click();return $('#mcsvOut').textContent;};
  ok(/Not imported/.test(csv('y_mm,w_N_per_mm\n460,1\n4930,0')),'mm columns refused in the D.520 (m, N/m)');
  ok(/Preview: 3 rows/.test(csv('y_m,w_N_per_m,x_over_c\n0.46,3000,0.25\n2.5,1500,0.3\n4.93,0,0.5'))&&/N·m/.test($('#mcsvOut').textContent),'SI preview');
  $('#mcsvApply').click();eq(state.customLoads.length,2,'table added');eq(state.customLoads[1].points.length,3);
  dom.window.close();
}
console.log(`Wing load editor: ${checks} DOM checks passed (printed: eight shapes with x/c and live laws, refusals, 12-load limit, remove/clear/flight, chord figure and torque sign, CSV template/malformed/preview/add/replace/edit/x-over-c/hostile name/SHA-256, Schrenk figure equal areas and moments, keeper; D.520: SI units, no Schrenk shape, span range, SI table).`);
