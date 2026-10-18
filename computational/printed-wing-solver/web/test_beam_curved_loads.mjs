// Beam Lab curved (elliptic, parabolic) and table loads: reactions, internal forces and deflections against
// independent references (closed forms and Green's-function integrals by a different quadrature), signed and
// partial loads, mixed loads, jumps, self-weight, mesh convergence, study files/links, worked solution, figures.
//   node computational/printed-wing-solver/web/test_beam_curved_loads.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const P=require('./load_profiles.js'), B=require('./beam_learning_engine.js'), S=require('./beam_study.js');
globalThis.BeamLearningEngine=B;
const D=require('./beam_diagrams.js'), Sol=require('./beam_solution.js');
let checks=0;
const ok=(c,msg)=>{assert.ok(c,msg);checks++;};
const near=(a,b,rel,msg,abs=0)=>{ok(Math.abs(a-b)<=rel*Math.max(Math.abs(b),1e-300)+abs,`${msg}: ${a} vs ${b}`);};

// ------------------------------------------------------------ independent quadrature of ∫ f(x) w(x) dx
function gl(n){const x=[],w=[];for(let i=0;i<n;i++){let z=Math.cos(Math.PI*(i+.75)/(n+.5)),pp,z1;do{let p1=1,p2=0;for(let j=1;j<=n;j++){const p3=p2;p2=p1;p1=((2*j-1)*z*p2-(j-1)*p3)/j;}pp=n*(z*p1-p2)/(z*z-1);z1=z;z=z1-p1/pp;}while(Math.abs(z-z1)>1e-15);x.push(-z);w.push(2/((1-z*z)*pp*pp));}return {x,w};}
const R20=gl(20);
const composite=(f,a,b,panels=200)=>{if(!(b>a))return 0;let s=0;const h=(b-a)/panels;for(let k=0;k<panels;k++){const m=a+(k+.5)*h;for(let i=0;i<20;i++)s+=R20.w[i]*f(m+R20.x[i]*h/2);}return s*h/2;};
function ellipU(f,u1,u2){
  if(u2<u1) return -ellipU(f,u2,u1);
  if(u1<0&&u2>0) return ellipU(f,u1,0)+ellipU(f,0,u2);
  const neg=u2<=0, a=neg?-u2:u1, b=neg?-u1:u2, g=neg?(u=>f(-u)):f;
  return composite(t=>2*t*t*Math.sqrt(2-t*t)*g(1-t*t),Math.sqrt(Math.max(0,1-b)),Math.sqrt(Math.max(0,1-a)));
}
const mapOf=v=>{const l=v.end-v.start;return v.shape==='start'?{c:v.start,d:l}:v.shape==='end'?{c:v.end,d:-l}:{c:(v.start+v.end)/2,d:l/2};};
/** ∫_{x1}^{x2} f(x) w(x) dx for a load given as the engine stores it (curved loads normalized). */
function integ(v,f,x1=-Infinity,x2=Infinity) {
  if(v.kind==='elliptic') {const {c,d}=mapOf(v),a=Math.max(x1,v.start),b=Math.min(x2,v.end);if(!(b>a))return 0;const cu=u=>Math.min(1,Math.max(-1,u));return v.peak*d*ellipU(u=>f(c+d*u),cu((a-c)/d),cu((b-c)/d));}
  if(v.kind==='parabolic') {const {c,d}=mapOf(v);return composite(x=>{const u=(x-c)/d;return f(x)*v.peak*(1-u*u);},Math.max(x1,v.start),Math.min(x2,v.end));}
  if(v.kind==='distributed') return composite(x=>f(x)*(v.qStart+(v.qEnd-v.qStart)*(x-v.start)/(v.end-v.start)),Math.max(x1,v.start),Math.min(x2,v.end));
  if(v.kind==='table') {let s=0;for(let i=0;i<v.points.length-1;i++){const [xa,wa]=v.points[i],[xb,wb]=v.points[i+1];s+=composite(x=>f(x)*(wa+(wb-wa)*(x-xa)/(xb-xa)),Math.max(x1,xa),Math.min(x2,xb));}return s;}
  if(v.kind==='point') return v.position>=x1&&v.position<=x2?v.force*f(v.position):0;
  return 0;
}
const norm=v=>v.kind==='elliptic'||v.kind==='parabolic'?{...v,...P.normalizeCurve(v,{min:-Infinity,max:Infinity,lengthUnit:'mm'})}:v;
const L=450, EIdata={length:L,E:2000,section:{shape:'rectangle',width:20,height:10}};
// load size for round-off tolerances: largest intensity × loaded length
const scaleOf=v=>v.kind==='table'?Math.max(...v.points.map(p=>Math.abs(p[1])))*(v.points.at(-1)[0]-v.points[0][0]):Math.abs(v.peak)*(v.end-v.start);
const EI=2000*20*10**3/12;

// ------------------------------------------------------------ the user benchmark (cantilever, root-heavy elliptic)
{const F=0.45, r=B.solve({...EIdata,elements:40,support:'cantilever',loads:[{kind:'elliptic',start:0,end:L,shape:'start',total:F}],modes:false});
 const v=r.loadsApplied[0];near(v.peak,4*F/(Math.PI*L),1e-14,'w0 = 4F/(πL)');
 near(r.reactions[0].force,-F,1e-10,'R_A = −F (↓ +)');near(r.reactions[0].moment,-4*F*L/(3*Math.PI),1e-10,'C_A = −4FL/(3π) (↻ +)');
 const f0=B.fieldAt(r,0,'right');near(f0.V,F,1e-10,'V(0⁺) = −R_A = +F');near(f0.M,-4*F*L/(3*Math.PI),1e-10,'M(0⁺) = C_A = −4FL/(3π) (hogging)');
 const fm=B.fieldAt(r,L/2,'right');// V and M at a cut carry the round-off of the FE reactions (1e-12 to 1e-9 of the load, larger when a load boundary
 // leaves a very short element; the same for linear and point loads): tolerances scale with F and FL.
 near(fm.V,integ(v,()=>1,L/2,L),0,'V(L/2) = load right of the cut',1e-10*F);near(fm.M,-integ(v,x=>x-L/2,L/2,L),0,'M(L/2) = −moment of the load right of the cut',1e-10*F*L);
 near(r.deflection.at(-1),(1/8-4/(45*Math.PI))*F*L**3/EI,1e-9,'tip deflection (1/8 − 4/(45π)) FL³/EI');}
{const F=0.45, r=B.solve({...EIdata,elements:40,support:'cantilever',loads:[{kind:'parabolic',start:0,end:L,shape:'start',total:F}],modes:false});
 near(r.reactions[0].moment,-F*3*L/8,1e-10,'parabolic root moment F·3L/8');near(r.deflection.at(-1),19*F*L**3/(240*EI),1e-9,'parabolic tip deflection 19FL³/(240EI)');}

// ------------------------------------------------------------ reactions for every support case, shape and interval
const kernels={
  cantilever:{supports:[{x:0,kind:'fixed'}],R:v=>[-integ(v,()=>1)],C:v=>[-integ(v,x=>x)]},
  'pin-roller':{supports:[{x:0,kind:'pin'},{x:L,kind:'roller'}],R:v=>{const F=integ(v,()=>1),M=integ(v,x=>x);return [-(F-M/L),-M/L];}},
  'fixed-fixed':{supports:[{x:0,kind:'fixed'},{x:L,kind:'fixed'}],
    R:v=>[-integ(v,x=>(L-x)**2*(L+2*x)/L**3),-integ(v,x=>x*x*(3*L-2*x)/L**3)],C:v=>[-integ(v,x=>x*(L-x)**2/L**2),integ(v,x=>x*x*(L-x)/L**2)]},
  'propped (fixed + roller)':{supports:[{x:0,kind:'fixed'},{x:L,kind:'roller'}],R:v=>{const RB=integ(v,x=>x*x*(3*L-x)/(2*L**3)),F=integ(v,()=>1);return [-(F-RB),-RB];},
    C:v=>{const RB=integ(v,x=>x*x*(3*L-x)/(2*L**3));return [-(integ(v,x=>x)-RB*L),0];}},
};
const cases=[];
for(const kind of ['elliptic','parabolic']) for(const shape of ['start','end','middle']) for(const [a,b] of [[0,L],[60,330],[200,450]]) for(const spec of [{total:0.45},{total:-1.3},{peak:0.004}])
  cases.push({kind,start:a,end:b,shape,...spec});
cases.push({kind:'table',points:[[0,0.002],[100,0.0035],[225,-0.001],[450,0.0005]]});
for(const [name,k] of Object.entries(kernels)) for(const load of cases) {
  const r=B.solve({...EIdata,elements:30,supports:k.supports,loads:[load],modes:false}), v=norm(load);
  const sc=scaleOf(v);
  const R=k.R(v);R.forEach((x,i)=>near(r.reactions[i].force,x,0,`${name} ${load.kind} ${load.shape||''} R${i}`,5e-9*sc));
  if(k.C) k.C(v).forEach((x,i)=>{if(k.supports[i].kind==='fixed')near(r.reactions[i].moment,x,0,`${name} ${load.kind} ${load.shape||''} C${i}`,5e-9*sc*L);});
  near(r.equilibrium.force,0,0,`${name} ΣF`,5e-9*sc);near(r.equilibrium.moment,0,0,`${name} ΣM`,5e-9*sc*L);
  // statics system (determinate cases) agrees with the FE reactions
  const sys=B.staticsSystem({...EIdata,supports:k.supports,loads:[load]});
  if(sys.determinate) sys.unknowns.forEach((u,i)=>near(sys.solution[i],u.type==='force'?r.reactions[u.support].force:r.reactions[u.support].moment,0,`${name} statics ${u.type}`,5e-9*sc*(u.type==='force'?1:L)));
}

// ------------------------------------------------------------ internal forces at arbitrary stations (exact equilibrium)
for(const load of cases.slice(0,18)) {
  const r=B.solve({...EIdata,elements:20,support:'cantilever',loads:[load],modes:false}), v=norm(load);
  for(const x of [0,37.3,100,225,333.3,449.9]) {
    const f=B.fieldAt(r,x,'right');
    const Fs=scaleOf(v);
    near(f.V,integ(v,()=>1,x,Infinity),0,`V at ${x} (${load.kind} ${load.shape})`,5e-9*Fs);
    near(f.M,-integ(v,t=>t-x,x,Infinity),0,`M at ${x} (${load.kind} ${load.shape})`,5e-9*Fs*L);
  }
  // dM/dx = V and dV/dx = −w by central differences of the exact fields
  for(const x of [120,260]) {const h=1e-3,fp=B.fieldAt(r,x+h),fm=B.fieldAt(r,x-h),f=B.fieldAt(r,x);
    near((fp.M-fm.M)/(2*h),f.V,1e-6,'dM/dx = V',1e-10);near(-(fp.V-fm.V)/(2*h),B.loads.value(r.loadsApplied[0],x),1e-6,'dV/dx = −w',1e-9);}
}

// ------------------------------------------------------------ mesh convergence: Green's-function deflections
const green={
  cantilever:(x,s)=>x<=s?x*x*(3*s-x)/(6*EI):s*s*(3*x-s)/(6*EI),
  'simply supported':(x,s)=>x<=s?x*(L-s)*(2*L*s-s*s-x*x)/(6*L*EI):s*(L-x)*(2*L*x-x*x-s*s)/(6*L*EI),
  'fixed-fixed':(x,s)=>{const a=s,b=L-s;return x<=a?b*b*x*x*(3*a*L-(3*a+b)*x)/(6*L**3*EI):a*a*(L-x)**2*(3*b*L-(3*b+a)*(L-x))/(6*L**3*EI);},
};
const convergence=[];
const sup={cantilever:[{x:0,kind:'fixed'}],'simply supported':[{x:0,kind:'pin'},{x:L,kind:'roller'}],'fixed-fixed':[{x:0,kind:'fixed'},{x:L,kind:'fixed'}]};
for(const [name,Gf] of Object.entries(green)) for(const load of [{kind:'elliptic',start:0,end:L,shape:'start',total:0.45},{kind:'elliptic',start:80,end:400,shape:'middle',total:-0.3},{kind:'parabolic',start:0,end:L,shape:'end',total:0.45}]) {
  const v=norm(load), exact=x=>integ(v,s=>Gf(x,s),-Infinity,x)+integ(v,s=>Gf(x,s),x,Infinity);
  const mids={},nodals={};
  for(const n of [4,10,40,100]) {
    const r=B.solve({...EIdata,elements:n,supports:sup[name],loads:[load],modes:false});
    const vmax=Math.max(...r.deflection.map(Math.abs));
    let nodal=0,mid=0;
    for(let j=0;j<r.nodes.length;j++) nodal=Math.max(nodal,Math.abs(r.nodalDisplacement[2*j]-exact(r.nodes[j])));   // v DOF of node j (no hinges)
    for(let j=0;j<r.nodes.length-1;j++) {const xm=(r.nodes[j]+r.nodes[j+1])/2;mid=Math.max(mid,Math.abs(B.fieldAt(r,xm).v-exact(xm)));}
    // Nodal values are exact for exact consistent loads; what remains is the linear-solve round-off, which grows when a
    // load boundary leaves a very short element (e.g. 0.5 mm next to 4.5 mm at 100 elements) — the same for linear loads.
    ok(nodal<=(n>=100?1e-6:1e-8)*vmax,`${name} ${load.kind} ${load.shape}: nodal deflections exact for ${n} elements (error ${nodal/vmax})`);
    convergence.push([name,`${load.kind} ${load.shape}`,n,nodal/vmax,mid/vmax]);
    mids[n]=mid/vmax;nodals[n]=nodal/vmax;
    if(n===100) {
      ok(mids[40]<0.2*mids[4],`${name} ${load.kind} ${load.shape}: interpolation error between nodes converges (${mids[4]} → ${mids[40]})`);
      ok(mids[100]<=mids[40]+2*nodals[100]+1e-12,`${name} ${load.kind} ${load.shape}: 100 elements no worse than 40 apart from round-off`);
      ok(mids[100]<=1e-5,`${name} ${load.kind}: mid-element interpolation within 1e-5 of max |v| at 100 elements (${mids[100]})`);
    }
  }
}

// the same round-off appears for a uniform load with the same boundaries and mesh (it is not from the curved-load integrals)
{const G=green.cantilever, q=0.001, lin={kind:'distributed',start:80,end:400,qStart:q,qEnd:q};
 const r=B.solve({...EIdata,elements:100,support:'cantilever',loads:[lin],modes:false}), ex=integ(lin,s=>G(L,s));
 const e=Math.abs(r.deflection.at(-1)-ex)/Math.abs(ex);ok(e>1e-9&&e<1e-6,`uniform load, same 100-element mesh: tip round-off ${e} of the same order`);convergence.push(['cantilever','uniform (reference)',100,e,NaN]);}
for(const row of convergence) if(row[2]===100||row[2]===4) console.log(`  mesh ${String(row[2]).padStart(3)} ${row[0].padEnd(16)} ${row[1].padEnd(22)} max nodal error ${row[3].toExponential(2)} · mid-element ${Number.isFinite(row[4])?row[4].toExponential(2):'–'} (of max |v|)`);

// ------------------------------------------------------------ superposition of mixed loads, jumps and self-weight
{const loads=[{kind:'elliptic',start:0,end:300,shape:'start',total:0.4},{kind:'point',position:300,force:-0.2},{kind:'moment',position:150,moment:25},
   {kind:'distributed',start:100,end:400,qStart:0.001,qEnd:-0.0005},{kind:'parabolic',start:300,end:L,shape:'middle',peak:0.003},{kind:'table',points:[[50,0],[150,0.002],[250,0]]}];
 const both=[{x:0,kind:'fixed'},{x:L,kind:'roller'}];
 const all=B.solve({...EIdata,elements:30,supports:both,loads,modes:false});
 const parts=loads.map(l=>B.solve({...EIdata,elements:30,supports:both,loads:[l],modes:false}));
 all.reactions.forEach((q,i)=>{near(q.force,parts.reduce((s,p)=>s+p.reactions[i].force,0),1e-9,`superposed R${i}`,1e-13);near(q.moment,parts.reduce((s,p)=>s+p.reactions[i].moment,0),1e-9,`superposed C${i}`,1e-10);});
 near(all.deflection[all.x.indexOf(225)],parts.reduce((s,p)=>s+p.deflection[p.x.indexOf(225)],0),1e-8,'superposed v(L/2)');
 const l=B.fieldAt(all,300,'left'),rr=B.fieldAt(all,300,'right');near(l.V-rr.V,-0.2,1e-10,'point-force jump at the curved-load boundary: V(x⁻) − V(x⁺) = P');
 near(l.M,rr.M,1e-10,'M continuous at a force');ok(all.stations.some(s=>s.x===300&&s.kinds.includes('force')),'boundary station listed with its jump');
 const c1=B.fieldAt(all,150,'left'),c2=B.fieldAt(all,150,'right');near(c2.M-c1.M,25,1e-10,'couple jump M(x⁺) − M(x⁻) = C');}
{const r=B.solve({...EIdata,elements:20,support:'cantilever',selfWeight:true,loads:[{kind:'elliptic',start:0,end:L,shape:'start',total:0.45}],modes:false});
 const sw=r.selfWeight.total;ok(sw>0,'self-weight on');near(r.reactions[0].force,-(0.45+sw),1e-10,'self-weight counted once with a curved load');
 ok(r.loadsApplied.filter(v=>v.selfWeight).length===1,'one self-weight load');}
// table = the same piecewise-linear load entered as linear pieces
{const t={kind:'table',points:[[0,0.001],[150,0.003],[300,0.003],[450,0]]};
 const pieces=[{kind:'distributed',start:0,end:150,qStart:.001,qEnd:.003},{kind:'distributed',start:150,end:300,qStart:.003,qEnd:.003},{kind:'distributed',start:300,end:450,qStart:.003,qEnd:0}];
 for(const s of Object.values(sup)) {const a=B.solve({...EIdata,elements:24,supports:s,loads:[t],modes:false}),b=B.solve({...EIdata,elements:24,supports:s,loads:pieces,modes:false});
   a.reactions.forEach((q,i)=>{near(q.force,b.reactions[i].force,1e-12,'table = pieces (R)',1e-15);near(q.moment,b.reactions[i].moment,1e-12,'table = pieces (C)',1e-13);});}}
// limits
ok((()=>{try{B.solve({...EIdata,loads:[{kind:'table',points:Array.from({length:31},(_,i)=>[i*15,0.001])},{kind:'point',position:100,force:1}]});return false;}catch(e){return /at most 30 load segments/.test(e.message);}})(),'31 segments refused');
ok(B.solve({...EIdata,loads:[{kind:'table',points:Array.from({length:31},(_,i)=>[i*15,0.001])}],modes:false}).reactions.length===1,'a 31-row table alone is allowed');
for(const bad of [{kind:'elliptic',start:0,end:L,shape:'start',total:1,peak:1},{kind:'parabolic',start:0,end:500,shape:'start',total:1},{kind:'table',points:[[0,1],[0,2]]},{kind:'elliptic',start:0,end:L,shape:'x',total:1},{kind:'parabolic',start:0,end:L,shape:'end',total:NaN}])
  ok((()=>{try{B.normalize({...EIdata,loads:[bad]});return false;}catch(e){return true;}})(),`invalid ${JSON.stringify(bad).slice(0,60)} refused`);

// ------------------------------------------------------------ study files and links
{const loads=[{kind:'elliptic',start:0,end:L,shape:'start',total:0.45},{kind:'parabolic',start:50,end:250,shape:'middle',peak:0.002},{kind:'table',points:[[0,0],[225,0.004],[450,0]],source:{filename:'lift.csv',rows:3}}];
 const r=B.solve({...EIdata,support:'cantilever',loads,modes:false}), text=S.exportStudy({result:r,notes:'curved'}), doc=JSON.parse(text);
 ok(doc.version===3,'study with curved/table loads is version 3');
 ok(JSON.stringify(doc.model.loads[0])===JSON.stringify({kind:'elliptic',start:0,end:L,shape:'start',total:0.45}),'curved load stored as entered (total only)');
 ok(JSON.stringify(doc.model.loads[1])===JSON.stringify({kind:'parabolic',start:50,end:250,shape:'middle',peak:0.002}),'peak-based load stored as entered');
 const back=S.parseStudy(text);ok(JSON.stringify(back.model)===JSON.stringify(doc.model),'file round trip is exact');
 const r2=B.solve({...back.model,modes:false});r.reactions.forEach((q,i)=>ok(q.force===r2.reactions[i].force&&q.moment===r2.reactions[i].moment,'round trip reproduces the reactions bit for bit'));
 const token=S.encodeShare(doc.model);ok(JSON.parse(Buffer.from(token.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()).v===3,'link version 3');
 ok(JSON.stringify(S.decodeShare(token))===JSON.stringify(doc.model),'link round trip is exact');
 const legacy=B.solve({...EIdata,support:'cantilever',loads:[{kind:'point',position:L,force:1}],modes:false});ok(JSON.parse(S.exportStudy({result:legacy})).version===2,'legacy-only study stays version 2');
 ok(/elliptic \(maximum at the start\) F = 0.45 N on 0–450 mm/.test(S.describeLoad(doc.model.loads[0])),'describeLoad (curved)');ok(/table of 3 rows/.test(S.describeLoad(doc.model.loads[2])),'describeLoad (table)');
 const changed={...doc.model,loads:[{...doc.model.loads[0],shape:'end'},...doc.model.loads.slice(1)]};ok(S.diffModels(doc.model,changed).loadsDiffer,'A/B detects a changed curve orientation');
 ok(!S.diffModels(doc.model,JSON.parse(JSON.stringify(doc.model))).loadsDiffer,'A/B: identical curved loads are equal');
 const hostile=[{kind:'elliptic',start:0,end:L,shape:'start',total:1,peak:2},{kind:'elliptic',start:0,end:L,shape:'start',total:'1'},{kind:'table',points:Array.from({length:32},(_,i)=>[i,1])},{kind:'table',points:[[0,'1'],[1,2]]},{kind:'table',points:[[0,1],[1,2]],source:{filename:'<img src=x onerror=alert(1)>',sha256:'not-a-hash'}}];
 for(const h of hostile.slice(0,4)) ok((()=>{try{S.sanitizeModel({...doc.model,loads:[h]});return false;}catch(e){return true;}})(),`hostile ${JSON.stringify(h).slice(0,50)} refused`);
 const kept=S.sanitizeModel({...doc.model,loads:[hostile[4]]});ok(kept.loads[0].source.filename==='<img src=x onerror=alert(1)>'&&!('sha256' in kept.loads[0].source),'file name kept as plain text, invalid hash dropped');
 ok(S.escapeHtml(S.describeLoad(kept.loads[0])).includes('&lt;img'),'file name escaped for display');}

// ------------------------------------------------------------ worked solution and figures
{const model={...EIdata,elements:30,density:1.24,supports:[{x:0,kind:'fixed'}],hinges:[],selfWeight:false,loads:[{kind:'elliptic',start:0,end:L,shape:'start',total:0.45}],section:{shape:'rectangle',width:20,height:10}};
 const r=B.solve({...model,modes:true}), html=Sol.render(S.modelFromInput(r.input),r,{width:760});
 ok(/Elliptic \(maximum at the start\)/.test(html),'solution names the curved load');const row=html.replace(/<[^>]+>/g,' ').match(/Elliptic \(maximum at the start\)[^]*?N on 0–450 mm\s+([0-9.]+)\s+([0-9.]+)\s+([−\-0-9.]+)/);
 ok(row&&Number(row[1])===0.45&&Math.abs(Number(row[2])-4*450/(3*Math.PI))<0.5&&Math.abs(Number(row[3].replace('−','-'))-0.45*4*450/(3*Math.PI))<0.01,`solution table: W = 0.45 N at x̄ = 4L/(3π), moment about A +4FL/(3π) (clockwise +) (${row&&row.slice(1)})`);
 ok(/1\/8 − 4\/\(45π\)/.test(html),'closed-form tip deflection shown');ok(!/NaN|undefined|Infinity/.test(html),'solution finite');}
for(const load of [cases[0],cases[5],cases[13],cases.at(-1)]) {
  const model={...EIdata,elements:30,density:1.24,supports:[{x:0,kind:'fixed'},{x:L,kind:'roller'}],hinges:[],selfWeight:false,loads:[load],section:{shape:'rectangle',width:20,height:10}};
  const r=B.solve({...model,modes:false});
  const figs=[D.beamSchematic(model,{width:760}),D.beamSchematic(S.modelFromInput(r.input),{width:390}),D.freeBody(model,r,{width:760,mode:'solved',resultants:true}),D.segmentFbd(model,r,{x:200,side:'left',limit:'left',V:0,M:0},{width:600}),D.segmentFbd(model,r,{x:200,side:'right',limit:'right',V:0,M:0},{width:600})];
  for(const svg of figs) ok(!/NaN|undefined|Infinity/.test(svg),`${load.kind} figure finite`);
  ok(figs[0].includes(`data-load-kind="${load.kind}"`),`${load.kind} drawn with its own envelope`);
  const part=B.loads.portion(r.loadsApplied[0],0,200,0).W, label=figs[3].match(/part: W = ([0-9.e×⁻−]+)/);
  if(Math.abs(part)>1e-12) ok(label&&Math.abs(Number(label[1].replace('−','-'))-Math.abs(part))<=1e-3*Math.abs(part)+1e-12,`${load.kind} left-part resultant label (${label&&label[1]} vs ${part})`);
}
console.log(`Beam curved and table loads: ${checks} checks passed (user benchmark w0 = 4F/(πL), 4L/(3π), 4FL/(3π); cantilever, pin–roller, fixed–fixed and propped reactions for every shape, sign and interval; exact V/M at any station; Green's-function deflections exact at nodes for 4–100 elements; superposition, jumps, self-weight once, table = linear pieces, segment limit, study v3 files/links, A/B, hostile input, worked solution and figures).`);
