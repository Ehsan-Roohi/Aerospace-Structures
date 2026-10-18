// Load profiles (load_profiles.js): curved and table load integrals against independent closed forms, the
// consistent element loads, validation, and the line-load CSV reader (schema, units, limits, hostile input).
//   node computational/printed-wing-solver/web/test_load_profiles.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const P=require('./load_profiles.js');
let checks=0;
const close=(a,b,tol,msg)=>{assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${msg}: ${a} vs ${b}`);checks++;};
const ok=(c,msg)=>{assert.ok(c,msg);checks++;};
const throwsLike=(fn,re,msg)=>{assert.throws(fn,re,msg);checks++;};

// ---------------------------------------------------------------- independent references
// The module uses closed-form antiderivatives and Gauss-Legendre in the angle u = sin(phi). The references here use a
// different route: the substitution u = ±(1 − t²), which makes √(1 − u²) = t√(2 − t²) smooth, and a composite
// 20-point rule with 400 panels; polynomial (parabolic) moments use the same composite rule directly in x.
function gl(n){const x=[],w=[];for(let i=0;i<n;i++){let z=Math.cos(Math.PI*(i+.75)/(n+.5)),pp,z1;do{let p1=1,p2=0;for(let j=1;j<=n;j++){const p3=p2;p2=p1;p1=((2*j-1)*z*p2-(j-1)*p3)/j;}pp=n*(z*p1-p2)/(z*z-1);z1=z;z=z1-p1/pp;}while(Math.abs(z-z1)>1e-15);x.push(-z);w.push(2/((1-z*z)*pp*pp));}return {x,w};}
const R20=gl(20);
const composite=(f,a,b,panels=400)=>{let s=0;const h=(b-a)/panels;for(let k=0;k<panels;k++){const m=a+(k+.5)*h;for(let i=0;i<20;i++)s+=R20.w[i]*f(m+R20.x[i]*h/2);}return s*h/2;};
// ∫_{u1}^{u2} f(u) √(1 − u²) du for −1 ≤ u1 ≤ u2 ≤ 1
function ellipU(f,u1,u2){
  if(u2<=u1) return -ellipU(f,u2,u1);
  if(u1<0&&u2>0) return ellipU(f,u1,0)+ellipU(f,0,u2);
  const neg=u2<=0, a=neg?-u2:u1, b=neg?-u1:u2, g=neg?(u=>f(-u)):f;           // now 0 ≤ a < b ≤ 1
  const t1=Math.sqrt(Math.max(0,1-a)), t2=Math.sqrt(Math.max(0,1-b));        // u = 1 − t², du = −2t dt
  return composite(t=>2*t*t*Math.sqrt(2-t*t)*g(1-t*t),t2,t1);
}
const mapOf=(shape,a,b)=>{const l=b-a;return shape==='start'?{c:a,d:l}:shape==='end'?{c:b,d:-l}:{c:(a+b)/2,d:l/2};};
/** ∫_{x1}^{x2} (x − o)^k w dx (x1, x2 inside the load), by the references above. */
function moment(kind,shape,a,b,w0,x1,x2,o,k) {
  const {c,d}=mapOf(shape,a,b), clampU=u=>Math.min(1,Math.max(-1,u));
  if(kind==='parabolic') return composite(x=>{const u=(x-c)/d;return (x-o)**k*w0*(1-u*u);},x1,x2,40);
  return w0*d*ellipU(u=>(c+d*u-o)**k,clampU((x1-c)/d),clampU((x2-c)/d));
}
const ctx={min:0,max:1000,lengthUnit:'mm'};

// ---------------------------------------------------------------- shapes, totals and centroids
for(const kind of ['elliptic','parabolic']) for(const shape of ['start','end','middle']) for(const [a,b] of [[0,450],[50,350],[120,121.5]]) for(const total of [0.45,-2,1e-6]) {
  const p=P.normalizeCurve({kind,start:a,end:b,shape,total},ctx), l=b-a;
  close(p.peak,total/((kind==='elliptic'?Math.PI/4:2/3)*l),1e-14,`${kind} ${shape} peak from F`);
  const q=P.normalizeCurve({kind,start:a,end:b,shape,peak:p.peak},ctx);
  close(q.total,total,1e-14,`${kind} ${shape} F from peak`);
  ok(p.basis==='total'&&q.basis==='peak','basis recorded');
  const [F,S]=P.integrals(p,-1e9,1e9,0);
  close(F,total,1e-13,`${kind} ${shape} ∫w = F`);
  const cbar={elliptic:{start:4/(3*Math.PI),end:1-4/(3*Math.PI),middle:.5},parabolic:{start:3/8,end:5/8,middle:.5}}[kind][shape];
  close(S/F,a+cbar*l,1e-12,`${kind} ${shape} centroid`);
  close(S,moment(kind,shape,a,b,p.peak,a,b,0,1),1e-12,`${kind} ${shape} first moment, closed form`);
  // end values and shape (not a triangle: a parabola at mid-span is 3/4 of w0 for the 'start' shape)
  const w=x=>P.valueAt(p,x);
  if(shape==='start'){close(w(a),p.peak,1e-15,'max at start');close(w(b),0,1e-15,'zero at end');}
  if(shape==='end'){close(w(a),0,1e-15,'zero at start');close(w(b),p.peak,1e-15,'max at end');}
  if(shape==='middle'){close(w(a),0,1e-15,'zero at a');close(w(b),0,1e-15,'zero at b');close(w((a+b)/2),p.peak,1e-15,'max in the middle');}
  if(kind==='parabolic'&&shape==='start') close(w(a+l/2),0.75*p.peak,1e-14,'parabola, not triangle (0.75 w0 at mid-span)');
  if(kind==='elliptic'&&shape==='start') close(w(a+l/2),Math.sqrt(0.75)*p.peak,1e-14,'quarter ellipse at mid-span');
  ok(w(a-1e-9)===0&&w(b+1e-9)===0,'zero outside the load');
}
// the user benchmark: root-heavy F on 0..L
{const F=0.45,L=450,p=P.normalizeCurve({kind:'elliptic',start:0,end:L,shape:'start',total:F},ctx),[f,S]=P.integrals(p,0,L,0);
 close(p.peak,4*F/(Math.PI*L),1e-15,'w0 = 4F/(πL)');close(S/f,4*L/(3*Math.PI),1e-13,'resultant at 4L/(3π)');close(S,4*F*L/(3*Math.PI),1e-13,'root moment 4FL/(3π)');}

// ---------------------------------------------------------------- partial intervals and moments about any point
for(const kind of ['elliptic','parabolic']) for(const shape of ['start','end','middle']) {
  const a=40,b=410,p=P.normalizeCurve({kind,start:a,end:b,shape,total:1.7},ctx);
  for(const [x1,x2,o] of [[40,100,40],[100,300,250],[300,410,410],[409.9,410,410],[40,40.01,40],[0,500,225]]) {
    const [F,Mo]=P.integrals(p,x1,x2,o), y1=Math.max(x1,a), y2=Math.min(x2,b);
    close(F,moment(kind,shape,a,b,p.peak,y1,y2,o,0),1e-12,`${kind} ${shape} partial F [${x1},${x2}]`);
    close(Mo,moment(kind,shape,a,b,p.peak,y1,y2,o,1),1e-11,`${kind} ${shape} partial moment about ${o}`);
    // weighted() (Gauss-Legendre in the angle / in x) against the closed forms, k = 0..3
    for(let k=0;k<=3;k++) {
      // tolerance relative to ∫|x − o|^k |w| dx (odd moments of symmetric loads cancel to zero)
      const scale=Math.abs(P.weighted(p,x1,x2,x=>Math.abs(x-o)**k))||1;
      const got=P.weighted(p,x1,x2,x=>(x-o)**k), ref=moment(kind,shape,a,b,p.peak,y1,y2,o,k);
      ok(Math.abs(got-ref)<=1e-11*scale+1e-300,`${kind} ${shape} weighted k=${k} [${x1},${x2}] about ${o}: ${got} vs ${ref}`);
    }
  }
  // additivity over a split
  const [F1]=P.integrals(p,a,200,0),[F2]=P.integrals(p,200,b,0),[Ft]=P.integrals(p,a,b,0);close(F1+F2,Ft,1e-14,'additive');
}
// elliptic zero end: V ~ (b − x)^{3/2}; the closed form and the angle quadrature agree down to tiny slivers
{const p=P.normalizeCurve({kind:'elliptic',start:0,end:450,shape:'start',total:1},ctx);
 for(const e of [1e-1,1e-3,1e-6,1e-9]) {
   const exact=moment('elliptic','start',0,450,p.peak,450-e,450,0,0), approx=p.peak*450*(2*Math.SQRT2/3)*(e/450)**1.5;
   close(P.integrals(p,450-e,450,0)[0],exact,1e-9,`sliver ${e} closed form`);close(P.weighted(p,450-e,450,()=>1),exact,1e-9,`sliver ${e} angle quadrature`);
   ok(Math.abs(exact/approx-1)<2e-2+e,`sliver ${e} follows (b − x)^1.5 (${exact} vs ${approx})`);
 }}

// ---------------------------------------------------------------- consistent Hermite element loads
const herm=[[1,0,-3,2],[0,1,-2,1],[0,0,3,-2],[0,0,-1,1]];   // N_i = Σ coef_k t^k; N1, N3 carry an extra h
for(const kind of ['elliptic','parabolic']) for(const shape of ['start','end','middle']) {
  const a=0,b=450,p=P.normalizeCurve({kind,start:a,end:b,shape,total:2},ctx);
  for(const [x0,h] of [[0,11.25],[438.75,11.25],[200,25],[440,10]]) {
    const f=P.hermiteNodal(p,x0,h);
    herm.forEach((cf,i)=>{
      let ref=0;cf.forEach((c,k)=>{if(c)ref+=c*moment(kind,shape,a,b,p.peak,Math.max(x0,a),Math.min(x0+h,b),x0,k)/h**k;});
      if(i===1||i===3) ref*=h;
      close(f[i],ref,1e-11,`${kind} ${shape} element [${x0},${x0+h}] N${i}`);
    });
  }
  // the element forces add up to the total for any mesh
  for(const n of [3,7,40]) {let s=0;for(let e=0;e<n;e++){const g=P.hermiteNodal(p,450*e/n,450/n);s+=g[0]+g[2];}close(s,2,1e-13,`Σ nodal forces = F (${n} elements)`);}
}

// ---------------------------------------------------------------- tables
{const t=P.normalizeTable({points:[[0,0.002],[225,0.001],[450,0]]},{...ctx,max:450});
 const [F,S]=P.integrals(t,0,450,0);close(F,0.002*225/2+0.001*225/2+0.001*225/2,1e-15,'table total');
 // the same load as two linear segments
 const segs=[{kind:'distributed',start:0,end:225,qStart:.002,qEnd:.001},{kind:'distributed',start:225,end:450,qStart:.001,qEnd:0}];
 const ref=segs.reduce((s,q)=>{const r=P.integrals(q,0,450,0);return [s[0]+r[0],s[1]+r[1]];},[0,0]);
 close(F,ref[0],1e-15,'table = linear segments (F)');close(S,ref[1],1e-15,'table = linear segments (moment)');
 for(const x of [0,100,225,300,450]) close(P.valueAt(t,x),x<=225?.002-.001*x/225:.001-.001*(x-225)/225,1e-15,`table value at ${x}`);
 const f=P.hermiteNodal(t,225,22.5),g=P.hermiteNodal(segs[1],225,22.5);f.forEach((v,i)=>close(v,g[i],1e-15,'table element load'));
 const w=P.normalizeTable({points:[[0,1,0.2],[100,1,0.6]]},{...ctx,allowFraction:true});
 close(P.fractionAt(w,50),0.4,1e-15,'x/c interpolated along the span');close(P.fractionAt(w,-5),0.2,1e-15,'x/c clamped');}

// ---------------------------------------------------------------- validation
throwsLike(()=>P.normalizeCurve({kind:'elliptic',start:0,end:450,shape:'start',total:1,peak:1},ctx),/either/,'both bases refused');
throwsLike(()=>P.normalizeCurve({kind:'elliptic',start:0,end:450,shape:'start'},ctx),/either/,'no basis refused');
// idempotent: a normalised load (both values plus its basis) normalises to itself, from the entered value only
for(const v of [{kind:'elliptic',start:0,end:450,shape:'start',total:0.45},{kind:'parabolic',start:100,end:300,shape:'middle',peak:-0.004},{kind:'elliptic',start:20,end:90,shape:'end',peak:3e-3}]) {
  const once=P.normalizeCurve(v,ctx), twice=P.normalizeCurve(once,ctx);ok(JSON.stringify(once)===JSON.stringify(twice),`normalising twice is harmless (${v.kind} ${v.shape})`);
  ok(JSON.stringify(P.normalizeCurve({...once,[once.basis==='total'?'peak':'total']:123},ctx))===JSON.stringify(once),'the basis value is the one used');}
throwsLike(()=>P.normalizeCurve({kind:'elliptic',start:0,end:450,shape:'start',basis:'total',peak:1},ctx),/either/,'a basis without its value refused');
throwsLike(()=>P.normalizeCurve({kind:'elliptic',start:0,end:450,shape:'top',total:1},ctx),/maximum/,'unknown shape refused');
throwsLike(()=>P.normalizeCurve({kind:'parabolic',start:300,end:200,shape:'start',total:1},ctx),/start < end/,'reversed interval refused');
throwsLike(()=>P.normalizeCurve({kind:'parabolic',start:0,end:1200,shape:'start',total:1},ctx),/≤ 1000/,'beyond the span refused');
for(const bad of [NaN,Infinity,'1',null,1e400]) throwsLike(()=>P.normalizeCurve({kind:'elliptic',start:0,end:450,shape:'start',total:bad},ctx),/finite|either/,`total ${bad} refused`);
throwsLike(()=>P.normalizeTable({points:[[0,1]]},ctx),/2 to 31/,'one row refused');
throwsLike(()=>P.normalizeTable({points:Array.from({length:32},(_,i)=>[i,1])},ctx),/2 to 31/,'32 rows refused');
throwsLike(()=>P.normalizeTable({points:[[0,1],[0,2]]},ctx),/strictly increase/,'repeated station refused');
throwsLike(()=>P.normalizeTable({points:[[10,1],[5,2]]},ctx),/strictly increase/,'decreasing refused');
throwsLike(()=>P.normalizeTable({points:[[0,1,0.5],[10,2,0.5]]},ctx),/each row/,'x/c column refused for a beam');
throwsLike(()=>P.normalizeTable({points:[[0,1,1.5],[10,2,0.5]]},{...ctx,allowFraction:true}),/x\/c/,'x/c above 1 refused');
throwsLike(()=>P.normalizeTable({points:[[0,NaN],[10,2]]},ctx),/finite/,'NaN row refused');
throwsLike(()=>P.normalizeTable({points:[[0,1],[1001,2]]},ctx),/outside/,'row beyond the span refused');
ok(P.segmentCount([{kind:'point'},{kind:'table',points:Array.from({length:31},(_,i)=>[i,1])}])===31,'segments: a 31-row table counts 30');

// ---------------------------------------------------------------- CSV reader
const parse=(t,ws='beam',o={})=>P.parseCsv(t,{workspace:ws,min:0,max:450,ref:0,...o});
{const r=parse('x_mm,w_N_per_mm\n0,0.002\n225,0.001\n450,0\n');ok(r.ok,'plain table');ok(r.rows.length===3&&r.stats.segments===2,'rows and segments');
 // rectangle 0.001·225 at 112.5, triangles 0.1125 at 75 and at 300: F = 0.45 N, first moment 67.5 N·mm, centroid 150 mm
 close(r.stats.total,0.45,1e-15,'CSV total');close(r.stats.centroid,150,1e-13,'CSV centroid (rectangles and triangles)');close(r.stats.firstMoment,67.5,1e-13,'CSV first moment');
 close(r.stats.momentAboutRef,r.stats.total*r.stats.centroid,1e-12,'moment about x = 0');}
ok(parse('﻿# comment\r\nX_MM , W_N_PER_MM\r\n"0","1"\r\n,\r\n10,0\r\n').ok,'BOM, CRLF, comments, case, spaces, quotes and empty spreadsheet rows');
{const r=parse('y_mm,w_N_per_mm,x_over_c\n0,1,0.25\n100,0,0.5\n','printed');ok(r.ok&&r.hasFraction,'printed table with x/c');}
{const r=parse('y_m,w_N_per_m\n0.46,1200\n4.93,0\n','d520',{min:0.46,max:4.93});ok(r.ok&&r.spec.lengthUnit==='m'&&r.spec.lineUnit==='N/m','D.520 units');}
const refuse=(text,re,msg,ws='beam',o)=>{const r=parse(text,ws,o);ok(!r.ok,msg);ok(r.errors.some(e=>re.test(e)),`${msg}: message ${r.errors.join(' | ')}`);};
refuse('x,w\n0,1\n1,2\n',/header must be x_mm,w_N_per_mm/,'header without units');
refuse('x_mm,w_N_per_mm,x_over_c\n0,1,0.2\n1,2,0.3\n',/header/,'beam refuses an x/c column');
refuse('y_mm,w_N_per_mm\n0,1\n1,2\n',/header/,'printed header in the beam');
refuse('x_mm,w_N_per_mm\n0,1\n',/two data rows/,'one row');
refuse(['x_mm,w_N_per_mm',...Array.from({length:32},(_,i)=>`${i},1`)].join('\n'),/At most 31 data rows.*Nothing is truncated/,'32 rows not truncated');
refuse('x_mm,w_N_per_mm\n0,1\n0,2\n',/strictly increase/,'duplicate station');
refuse('x_mm,w_N_per_mm\n10,1\n5,2\n',/strictly increase/,'decreasing station');
refuse('x_mm,w_N_per_mm\n0,1\n500,2\n',/outside the allowed 0–450/,'beyond the span');
refuse('x_mm,w_N_per_mm\n0,1\n10,0x10\n',/not a plain number/,'hex refused');
refuse('x_mm,w_N_per_mm\n0,1\n10,NaN\n',/not a plain number/,'NaN text refused');
refuse('x_mm,w_N_per_mm\n0,1\n10,Infinity\n',/not a plain number/,'Infinity text refused');
refuse('x_mm,w_N_per_mm\n0,1\n10,1e400\n',/finite/,'overflow refused');
refuse('x_mm;w_N_per_mm\n0;1\n10;2\n',/commas/,'semicolon refused');
refuse('x_mm,w_N_per_mm\n0,"1,5"\n10,2\n',/expected 2 values/,'decimal comma refused');
refuse('x_mm,w_N_per_mm\n0\t1\n10,2\n',/commas/,'tab refused');
refuse('x_mm,w_N_per_mm\n0,1\n10,2,3\n',/expected 2 values/,'extra field');
refuse('x_mm,w_N_per_mm\n0,1\n10,=SUM(A1)\n',/not a plain number/,'spreadsheet formula refused');
refuse('x_mm,w_N_per_mm\n0,1\n10,<img src=x onerror=alert(1)>\n',/not a plain number/,'markup refused');
refuse('x_mm,w_N_per_mm\n0,1\u0007\n10,2\n',/control characters/,'control character refused');
refuse('x_mm,w_N_per_mm\n'+'#'.repeat(20001),/larger than 20 kB/,'oversized file');
refuse(Array.from({length:205},()=>'#').join('\n'),/more than 200 lines/,'too many lines');
refuse('y_mm,w_N_per_mm,x_over_c\n0,1,1.2\n10,2,0.5\n',/x_over_c must be between 0/,'x/c out of range','printed');
ok(!P.parseCsv('x_mm,w_N_per_mm\n0,1\n1,2\n',{workspace:'beam'}).ok,'missing station range refused');
ok(!P.parseCsv(42,{workspace:'beam',min:0,max:1}).ok,'non-text refused');
{const r=parse('x_mm,w_N_per_mm\n0,1\n10,-1\n');ok(r.ok&&r.stats.centroid===null&&Math.abs(r.stats.total)<1e-15,'zero net force: centroid undefined');ok(r.warnings.some(w=>/abruptly/.test(w)),'abrupt-end warning');}
ok(P.escapeHtml('<img src=x onerror="a">')==='&lt;img src=x onerror=&quot;a&quot;&gt;','escape');
for(const ws of ['beam','printed','d520']) {
  const tmpl=P.csvTemplate(ws), spec=P.CSV_SPECS[ws], r=P.parseCsv(tmpl,{workspace:ws,min:ws==='d520'?0.46:0,max:ws==='d520'?4.93:450});
  ok(r.ok,`${ws} template parses`);ok(tmpl.includes(spec.lineUnit)&&tmpl.includes(spec.sign),`${ws} template documents units and sign`);
}
// round trip: table -> CSV text (as the editors write it) -> identical rows
{const pts=[[0,0.0012732395447351628],[123.456789,-3.25e-5],[450,0]], text='x_mm,w_N_per_mm\n'+pts.map(r=>r.join(',')).join('\n')+'\n', r=parse(text);
 ok(r.ok&&JSON.stringify(r.rows)===JSON.stringify(pts),'CSV round trip is exact');}
console.log(`Load profiles: ${checks} checks passed (closed-form shapes, totals, centroids, partial intervals, moments k = 0–3, elliptic end slivers, Hermite element loads, tables, validation and the CSV reader).`);
