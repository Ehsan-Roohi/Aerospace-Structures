// Wing custom loads (printed PLA wing engine.js and D.520 metal_wing_engine.js): elliptic, parabolic, table and
// Schrenk loads against independent integrals; chord position x/c and torque about the shear centre (sign
// reversal, zero eccentricity, tapered-wing caveats); flight Schrenk = the stated formula; validation.
//   node computational/printed-wing-solver/web/test_wing_custom_curved.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const P=require('./load_profiles.js'), E=require('./engine.js'), M=require('./metal_wing_engine.js');
let checks=0;
const ok=(c,msg)=>{assert.ok(c,msg);checks++;};
const near=(a,b,rel,msg,abs=0)=>ok(Math.abs(a-b)<=rel*Math.abs(b)+abs,`${msg}: ${a} vs ${b}`);

// ------------------------------------------------------------ independent quadrature (substitution u = ±(1 − t²))
function gl(n){const x=[],w=[];for(let i=0;i<n;i++){let z=Math.cos(Math.PI*(i+.75)/(n+.5)),pp,z1;do{let p1=1,p2=0;for(let j=1;j<=n;j++){const p3=p2;p2=p1;p1=((2*j-1)*z*p2-(j-1)*p3)/j;}pp=n*(z*p1-p2)/(z*z-1);z1=z;z=z1-p1/pp;}while(Math.abs(z-z1)>1e-15);x.push(-z);w.push(2/((1-z*z)*pp*pp));}return {x,w};}
const R20=gl(20);
let PANELS=200;
const composite=(f,a,b,panels=PANELS)=>{if(!(b>a))return 0;let s=0;const h=(b-a)/panels;for(let k=0;k<panels;k++){const m=a+(k+.5)*h;for(let i=0;i<20;i++)s+=R20.w[i]*f(m+R20.x[i]*h/2);}return s*h/2;};
function ellipU(f,u1,u2){if(u2<u1)return -ellipU(f,u2,u1);if(u1<0&&u2>0)return ellipU(f,u1,0)+ellipU(f,0,u2);const neg=u2<=0,a=neg?-u2:u1,b=neg?-u1:u2,g=neg?(u=>f(-u)):f;return composite(t=>2*t*t*Math.sqrt(2-t*t)*g(1-t*t),Math.sqrt(Math.max(0,1-b)),Math.sqrt(Math.max(0,1-a)));}
const mapOf=v=>{const l=v.end-v.start;return v.shape==='start'?{c:v.start,d:l}:v.shape==='end'?{c:v.end,d:-l}:{c:(v.start+v.end)/2,d:l/2};};
function integ(v,f,x1=-Infinity,x2=Infinity) {
  if(v.kind==='elliptic'){const {c,d}=mapOf(v),a=Math.max(x1,v.start),b=Math.min(x2,v.end);if(!(b>a))return 0;const cu=u=>Math.min(1,Math.max(-1,u));return v.peak*d*ellipU(u=>f(c+d*u),cu((a-c)/d),cu((b-c)/d));}
  if(v.kind==='parabolic'){const {c,d}=mapOf(v);return composite(x=>{const u=(x-c)/d;return f(x)*v.peak*(1-u*u);},Math.max(x1,v.start),Math.min(x2,v.end));}
  if(v.kind==='distributed')return composite(x=>f(x)*(v.qStart+(v.qEnd-v.qStart)*(x-v.start)/(v.end-v.start)),Math.max(x1,v.start),Math.min(x2,v.end));
  if(v.kind==='table'){let s=0;for(let i=0;i<v.points.length-1;i++){const [xa,wa]=v.points[i],[xb,wb]=v.points[i+1];s+=composite(x=>f(x)*(wa+(wb-wa)*(x-xa)/(xb-xa)),Math.max(x1,xa),Math.min(x2,xb));}return s;}
  return 0;
}
const norm=v=>v.kind==='elliptic'||v.kind==='parabolic'?{...v,...P.normalizeCurve(v,{min:-Infinity,max:Infinity,lengthUnit:''})}:v;
const interp=(x,xs,ys)=>{if(x<=xs[0])return ys[0];if(x>=xs.at(-1))return ys.at(-1);let i=0;while(xs[i+1]<x)i++;return ys[i]+(ys[i+1]-ys[i])*(x-xs[i])/(xs[i+1]-xs[i]);};

// ============================================================ printed PLA wing
const g=E.makeGeometry(), L=g.semiSpan, chord=y=>E.chordAt(g,y);
// Schrenk as its two halves: F c/∫c dy and the root-heavy ellipse with the same F
const schrenkParts=(F)=>{const S=0.5*(g.rootChord+g.tipChord)*L;return [{kind:'distributed',start:0,end:L,qStart:0.5*F*g.rootChord/S,qEnd:0.5*F*g.tipChord/S},norm({kind:'elliptic',start:0,end:L,shape:'start',total:0.5*F})];};
const printedLoads=[
  {kind:'elliptic',start:0,end:L,shape:'start',total:2,fraction:0.25},
  {kind:'elliptic',start:60,end:420,shape:'middle',peak:0.006,fraction:0.5},
  {kind:'parabolic',start:0,end:L,shape:'end',total:-1.5,fraction:0.4},
  {kind:'parabolic',start:100,end:350,shape:'start',total:3,fraction:0.1},
  {kind:'table',points:[[0,0.004],[150,0.006],[300,0.002],[450,0]],fraction:0.3},
  {kind:'table',points:[[20,0.002,0.2],[220,0.005,0.6],[430,0,0.4]]},
  {kind:'schrenk',total:5,fraction:0.25},
];
for(const item of printedLoads) {
  const r=E.solve({load:{kind:'custom',items:[item]},nElements:40});
  const parts=item.kind==='schrenk'?schrenkParts(item.total):[norm(item)];
  const xF=(v,y)=>(v.kind==='table'&&v.points[0].length===3?P.fractionAt(v,y):item.fraction)*chord(y);
  const scale=parts.reduce((s,v)=>s+Math.abs(integ(v,()=>1))+Math.abs(v.kind==='table'?Math.max(...v.points.map(p=>Math.abs(p[1])))*L:Math.abs(v.peak??v.qStart)*L),0);
  for(const i of [0,90,300,451,700,899]) {
    const y=r.y[i];
    const V=parts.reduce((s,v)=>s+integ(v,()=>1,y,Infinity),0), Mm=parts.reduce((s,v)=>s+integ(v,t=>t-y,y,Infinity),0), X=parts.reduce((s,v)=>s+integ(v,t=>xF(v,t),y,Infinity),0);
    near(r.V[i],V,0,`printed ${item.kind} V(${y})`,1e-11*scale);
    near(r.M[i],Mm,0,`printed ${item.kind} M(${y})`,1e-11*scale*L);
    near(r.T[i],r.props.xsc[i]*V-X,0,`printed ${item.kind} T(${y}) = x_sc(y)V − ΣF x_F`,1e-10*scale*L);
  }
  near(r.appliedForce,parts.reduce((s,v)=>s+integ(v,()=>1),0),1e-12,`printed ${item.kind} applied force`,1e-14);
  ok(r.verification.rootShearError<1e-12&&r.verification.rootMomentError<1e-12,`printed ${item.kind} root resultants`);
  ok(r.verification.deflectionMethodsDiff<2e-3,`printed ${item.kind}: integration vs beam FE ${r.verification.deflectionMethodsDiff}`);
}
// linear-load reference level of the integration/FE agreement (same order as the curved loads)
{const r=E.solve({load:{kind:'custom',items:[{kind:'distributed',start:0,end:L,qStart:0.004,qEnd:0.004,fraction:0.25}]},nElements:40});ok(r.verification.deflectionMethodsDiff<2e-3,'linear reference');}
// custom Schrenk equals the flight-like Schrenk lift (inertia relief off) to the flight case's grid integration
{const fl=E.solve({load:{kind:'flight',aircraftMass:1,loadFactor:4,distribution:'schrenk',liftFraction:0.25,inertiaRelief:false}});
 const cu=E.solve({load:{kind:'custom',items:[{kind:'schrenk',total:fl.liftN,fraction:0.25}]}});
 near(cu.V[0],fl.liftN,1e-14,'custom Schrenk: exact total');near(fl.V[0],fl.liftN,2e-5,'flight Schrenk: grid integration of the same total');
 near(cu.M[0],fl.M[0],2e-5,'custom vs flight Schrenk root moment');near(cu.T[0],fl.T[0],2e-5,'custom vs flight Schrenk root torque');
 near(cu.deflection.at(-1),fl.deflection.at(-1),1e-4,'custom vs flight Schrenk tip deflection');
 // the flight lift is exactly the stated formula w = ½[F c/∫c dy + 4F/(πL)√(1 − (y/L)²)]
 const S=0.5*(g.rootChord+g.tipChord)*L;let worst=0;
 fl.y.forEach((y,i)=>{const w=0.5*(fl.liftN*chord(y)/S+4*fl.liftN/(Math.PI*L)*Math.sqrt(Math.max(0,1-(y/L)**2)));worst=Math.max(worst,Math.abs(fl.w[i]-w));});
 ok(worst<1e-15,`flight Schrenk = ½[F c/∫c + 4F/(πL)√(1−(y/L)²)] at every grid station (${worst})`);
 for(const dist of ['elliptic','planform']) {const r=E.solve({load:{kind:'flight',aircraftMass:1,loadFactor:4,distribution:dist,liftFraction:0.25,inertiaRelief:false}});
   let wst=0;r.y.forEach((y,i)=>{const w=dist==='elliptic'?4*r.liftN/(Math.PI*L)*Math.sqrt(Math.max(0,1-(y/L)**2)):r.liftN*chord(y)/S;wst=Math.max(wst,Math.abs(r.w[i]-w));});ok(wst<1e-15,`flight ${dist} shape is the stated formula`);}}
// chord position: torque sign, reversal and zero eccentricity at the load station
{const y0=300, base=E.solve({load:{kind:'custom',items:[{kind:'point',position:y0,force:2,fraction:0.3}]}}), i0=base.y.indexOf(y0);
 const c0=chord(y0), xsc0=base.props.xsc[i0], f0=xsc0/c0;
 const T=frac=>{const r=E.solve({load:{kind:'custom',items:[{kind:'point',position:y0,force:2,fraction:frac}]}});return {at:r.T[r.y.indexOf(y0)],root:r.T[0],tip:r.twist.at(-1),r};};
 const a=T(f0+0.15),b=T(f0-0.15),z=T(f0);
 near(a.at,-2*0.15*c0,1e-12,'aft force: T = F(x_sc − x_F) = −F e (nose-down)');near(b.at,2*0.15*c0,1e-12,'forward force: nose-up');near(a.at,-b.at,1e-12,'reversing the eccentricity reverses the torque');
 ok(Math.abs(z.at)<1e-12*2*c0,`force through the shear centre: no torque at its own station (${z.at})`);
 ok(Math.abs(z.root)>1e-3*2*c0,`…but the tapered wing's root section, whose shear centre is elsewhere, still carries T = F[x_sc(0) − x_F] = ${z.root}`);
 near(z.root,2*(base.props.xsc[0]-f0*c0),1e-9,'root torque from the offset of the root shear centre');
 ok(Math.abs(z.tip)>0,'…so the wing still twists: zero local eccentricity is not zero twist');
 near(a.r.V[0],2,1e-14,'x/c does not change V');near(a.r.M[0],b.r.M[0],1e-14,'x/c does not change M');}
// validation
const bad=[[{kind:'elliptic',start:0,end:L,shape:'start',total:1,peak:1}],[{kind:'parabolic',start:0,end:500,shape:'start',total:1}],[{kind:'table',points:[[0,1],[0,2]]}],
  [{kind:'schrenk',total:NaN}],[{kind:'elliptic',start:0,end:L,shape:'start',total:1,fraction:1.2}],[{kind:'table',points:Array.from({length:31},(_,i)=>[i*15,0.001])},{kind:'point',position:200,force:1}],
  Array.from({length:13},(_,i)=>({kind:'point',position:30+30*i,force:1}))];
for(const items of bad) ok((()=>{try{E.normalize({load:{kind:'custom',items}});return false;}catch(e){return true;}})(),`printed refuses ${JSON.stringify(items).slice(0,70)}`);
ok(E.normalize({load:{kind:'custom',items:[{kind:'table',points:Array.from({length:31},(_,i)=>[i*15,0.001])}]}}).load.items.length===1,'a 31-row table alone is allowed');

// ============================================================ D.520
const W0=M.makeWing(M.D520), yf=M.D520.fittingY, yt=M.D520.ribs.at(-1);
const metalLoads=[
  {kind:'elliptic',start:yf,end:yt,shape:'start',total:10000,fraction:0.25},
  {kind:'parabolic',start:1,end:4,shape:'middle',peak:2000,fraction:0.6},
  {kind:'elliptic',start:2,end:yt,shape:'end',total:-3000,fraction:0.4},
  {kind:'table',points:[[yf,3000,0.25],[2.5,1500,0.3],[yt,0,0.5]],fraction:0.25},
];
for(const item of metalLoads) {
  const r=M.solve({customLoads:[item],n:1,collapse:false,modes:false}), v=norm(item);
  const ys=r.stations.map(s=>s.y), xs=r.stations.map(s=>s.xsc);
  const frac=y=>v.kind==='table'&&v.points[0].length===3?P.fractionAt(v,y):item.fraction;
  const scale=Math.abs(integ(v,()=>1))+Math.abs(v.kind==='table'?3000*yt:v.peak*(v.end-v.start));
  for(const y of [yf+1e-9,1.2,2.345,3.6,4.5]) {
    near(r.perG.V(y),integ(v,()=>1,y,Infinity),0,`D.520 ${item.kind} V(${y})`,1e-11*scale);
    near(r.perG.M(y),integ(v,t=>t-y,y,Infinity),0,`D.520 ${item.kind} M(${y})`,1e-11*scale*yt);
    // torque: each part about the shear centre at its own station, T = ∫ w (x_sc/c − x/c) c dη
    // x_sc/c is the engine's linear interpolation between analysis stations: integrate piece by piece between them
    const bps=[y,...ys.filter(t=>t>y),Infinity];PANELS=4;let Tref=0;
    for(let k=0;k<bps.length-1;k++)Tref+=integ(v,t=>(interp(Math.min(t,yt),ys,xs)-frac(t))*W0.chord(t),bps[k],bps[k+1]);PANELS=200;
    near(r.perG.T(y),Tref,0,`D.520 ${item.kind} T(${y})`,2e-8*scale);
  }
  ok(r.input.customLoads[0].kind===item.kind&&r.input.inertiaRelief===false,'custom case: no inertia relief');
}
// eccentricity reversal, zero eccentricity, and the tapered-beam torque carried by the inclined booms
{const y0=3, probe=M.solve({customLoads:[{kind:'point',position:y0,force:1000,fraction:0.3}],n:1,collapse:false,modes:false});
 const f0=interp(y0,probe.stations.map(s=>s.y),probe.stations.map(s=>s.xsc)), c0=W0.chord(y0);
 const run=(frac,taper=true)=>M.solve({customLoads:[{kind:'point',position:y0,force:1000,fraction:frac}],n:1,collapse:false,modes:false,taper});
 const a=run(f0+0.1),b=run(f0-0.1),z=run(f0),zt=run(f0,false);
 near(a.perG.T(1),-1000*0.1*c0,1e-12,'D.520 aft force: nose-down torque');near(b.perG.T(1),1000*0.1*c0,1e-12,'D.520 forward force: nose-up');
 ok(Math.abs(z.perG.T(1))<1e-9,'D.520: a force through the local shear centre adds no torque (each load about its own station)');
 ok(Math.abs(zt.tip.twistDeg)<1e-9,`…and with the tapered-beam option off the wing does not twist (${zt.tip.twistDeg})`);
 ok(Math.abs(z.tip.twistDeg)>1e-6,`…but with inclined booms (taper on) the bending moment still twists the walls (${z.tip.twistDeg}°)`);
 near(a.perG.V(1),b.perG.V(1),1e-14,'x/c does not change V');}
// flight Schrenk is the stated formula (normalized on the engine's own grid)
{const ys=M.linspace(0,W0.b2,4001), sh=M.spanShape(M.D520,W0,'schrenk',ys), F=0.5;
 const A=M.trapz(ys.map(y=>W0.chord(y)),ys), Ae=M.trapz(ys.map(y=>4*F/(Math.PI*W0.b2)*Math.sqrt(Math.max(0,1-(y/W0.b2)**2))),ys);
 let worst=0;ys.forEach((y,i)=>{const w=0.5*(F*W0.chord(y)/A+4*F/(Math.PI*W0.b2)*Math.sqrt(Math.max(0,1-(y/W0.b2)**2))*(F/Ae));worst=Math.max(worst,Math.abs(sh.l[i]-w));});
 ok(worst<2e-6*F/W0.b2,`D.520 flight Schrenk = ½[F c/∫c + 4F/(πb)√(1−(y/b)²)] per unit half-wing lift (worst ${worst})`);}
// validation
for(const items of [[{kind:'schrenk',total:1000,fraction:0.25}],[{kind:'elliptic',start:0.2,end:3,shape:'start',total:1,fraction:0.3}],[{kind:'table',points:[[1,1],[5.5,2]],fraction:0.3}],
  [{kind:'elliptic',start:1,end:3,shape:'start',total:1,peak:2,fraction:0.3}],[{kind:'table',points:Array.from({length:31},(_,i)=>[0.5+0.1*i,1]),fraction:0.3},{kind:'point',position:2,force:1,fraction:0.3}]])
  ok((()=>{try{M.normalise({customLoads:items});return false;}catch(e){return true;}})(),`D.520 refuses ${JSON.stringify(items).slice(0,70)}`);
ok((()=>{try{M.normalise({customLoads:[{kind:'schrenk',total:1000,fraction:0.25}]});}catch(e){return /flight-mode lift distribution/.test(e.message);}return false;})(),'D.520 explains why Schrenk is a flight option');
ok(M.solve({customLoads:[],n:1,collapse:false,modes:true}).fem.fBending[0]>0,'D.520 with no load: natural frequencies still computed');
console.log(`Wing custom loads: ${checks} checks passed (printed wing: elliptic, parabolic, table with/without x/c and Schrenk V, M and T(y) = x_sc(y)V − ΣF·x_F against independent integrals, custom = flight Schrenk, flight shapes = stated formulas, torque sign/reversal/zero-eccentricity and tapered-wing caveat; D.520: V, M and local-shear-centre torque, eccentricity reversal, taper effect, flight Schrenk formula; validation).`);
