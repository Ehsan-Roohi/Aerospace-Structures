// Independent analytic checks for supports anywhere, internal hinges, point couples, self-weight,
// mechanism detection and the force-method intermediate results of the Beam Learning Engine.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js');
let checks=0;
function near(actual,expected,rel=2e-7,abs=1e-7,label='') {
  assert.ok(Number.isFinite(actual),`${label} ${actual} is not finite`);
  assert.ok(Math.abs(actual-expected)<=Math.max(abs,Math.abs(expected)*rel),`${label} ${actual} != ${expected}`);checks++;
}
const eq=(a,b,label)=>{assert.equal(a,b,label);checks++;};
const L=450,b=20,h=10,E=2000,rho=1.24,I=b*h**3/12,EI=E*I,A=b*h;
const base={length:L,width:b,height:h,E,density:rho,elements:40,modes:false};
const solve=extra=>B.solve({...base,...extra});
const P=2,q=.004,C=120;
const point=(position,force)=>({kind:'point',position,force});
const couple=(position,moment)=>({kind:'moment',position,moment});
const uniform=(w,s=0,e=L)=>({kind:'distributed',start:s,end:e,qStart:w,qEnd:w});
const sup=(...list)=>list.map(([x,kind])=>({x,kind}));
const nodeValue=(r,x,key)=>{const i=r.x.findIndex(v=>Math.abs(v-x)<1e-9);assert.ok(i>=0,`no sample at ${x}`);return r[key][i];};
const station=(r,x)=>{const s=r.stations.find(t=>Math.abs(t.x-x)<1e-9);assert.ok(s,`no station at ${x}`);return s;};

/* ---------- point couples (clockwise +): reactions, jump +C in M, Macaulay deflection ---------- */
for(const a of [0,150,225,330]) {
  const r=solve({support:'simply-supported',loads:[couple(a,C)]});
  near(r.reactions[0].force,C/L,1e-8,1e-9,'couple R_A');near(r.reactions[1].force,-C/L,1e-8,1e-9,'couple R_B');
  near(r.equilibrium.force,0,0,1e-9);near(r.equilibrium.moment,0,0,1e-6);
  const C1=C*(L-a)**2/(2*L)-C*L/6, v=x=>(C*x**3/(6*L)-C*Math.max(0,x-a)**2/2+C1*x)/EI;
  for(const x of r.nodes) near(nodeValue(r,x,'deflection'),v(x),1e-8,1e-10,`couple v(${x})`);
  if(a>0) {const s=station(r,a);near(s.Mleft,-C*a/L,1e-8,1e-8);near(s.Mright,C*(1-a/L),1e-8,1e-8);near(s.Mright-s.Mleft,C,1e-8);near(s.Vright,s.Vleft,1e-8,1e-10);}
  else near(r.moment[0],C,1e-8,1e-8,'M(0+) with couple at the pin');
  if(a>0&&a<L) {assert.equal(r.momentJumps.length,1);near(r.momentJumps[0].right-r.momentJumps[0].left,C,1e-8);}
}
let r=solve({support:'simply-supported',loads:[couple(0,C)]});
near(nodeValue(r,L/2,'deflection'),C*L*L/(16*EI),1e-8,1e-12,'end couple mid deflection ML²/16EI');
r=solve({support:'cantilever',loads:[couple(L,C)]});
near(r.deflection.at(-1),C*L*L/(2*EI),1e-8);near(r.rotation.at(-1),C*L/EI,1e-8);
near(r.reactions[0].force,0,0,1e-9);near(r.reactions[0].moment,-C,1e-8);
for(const M of r.moment) near(M,-C,1e-8,1e-8,'constant hogging M under a tip couple');
r=solve({support:'fixed-fixed',loads:[couple(0,C)]});
near(r.maxima.deflection,0,0,1e-12,'couple applied at a clamp is carried by the clamp');near(r.reactions[0].moment,-C,1e-8);
// A couple equals the limit of two opposite forces: superposition check with an independent pair.
const pair=solve({support:'simply-supported',elements:60,loads:[point(200,-C/10),point(210,C/10)]}),cc=solve({support:'simply-supported',elements:60,loads:[couple(205,C)]});
near(pair.reactions[0].force,cc.reactions[0].force,1e-8,1e-10,'force pair ≡ couple (reactions)');

/* ---------- self-weight: g -> kg and mm -> m handled once ---------- */
const qSI=1240*(A*1e-6)*9.80665;            // kg/m³ · m² · m/s² = N/m
const qsw=qSI/1000;                          // N/mm
r=solve({support:'cantilever',loads:[],selfWeight:true});
near(r.selfWeight.q,qsw,1e-12,0,'self-weight line load');near(r.selfWeight.total,qsw*L,1e-12);
near(r.deflection.at(-1),qsw*L**4/(8*EI),1e-8);near(r.reactions[0].force,-qsw*L,1e-8);near(r.reactions[0].moment,-qsw*L*L/2,1e-8);
near(r.resultant,qsw*L,1e-10);
assert.equal(r.input.loads.length,0,'self-weight is not stored as a user load');
assert.equal(r.input.selfWeight,true);
const withLoad=solve({support:'simply-supported',loads:[point(100,P)],selfWeight:true}),onlyLoad=solve({support:'simply-supported',loads:[point(100,P)]}),onlySW=solve({support:'simply-supported',loads:[],selfWeight:true});
for(const x of withLoad.nodes.filter(x=>onlySW.nodes.includes(x))) near(nodeValue(withLoad,x,'deflection'),nodeValue(onlyLoad,x,'deflection')+nodeValue(onlySW,x,'deflection'),1e-8,1e-12,'self-weight superposes');
near(withLoad.resultant,P+qsw*L,1e-10,0,'no double counting in the resultant');
const again=B.solve({...withLoad.input,modes:false});
near(again.resultant,withLoad.resultant,1e-14,0,'re-solving result.input does not add self-weight twice');
const m1=solve({support:'simply-supported',modes:true,loads:[]}),m2=solve({support:'simply-supported',modes:true,loads:[],selfWeight:true});
near(m2.modes[0].frequencyHz,m1.modes[0].frequencyHz,1e-12,0,'modal mass independent of the self-weight load');
const tube={shape:'tube',outerDiameter:20,thickness:2};
r=B.solve({...base,section:tube,support:'cantilever',loads:[],selfWeight:true});
near(r.selfWeight.q,1240*(Math.PI*(10**2-8**2)*1e-6)*9.80665/1000,1e-12,0,'tube self-weight uses the tube area');

/* ---------- right-clamped mirror of a cantilever ---------- */
const left=solve({leftSupport:'fixed',rightSupport:'free',loads:[uniform(q)]}),right=solve({leftSupport:'free',rightSupport:'fixed',loads:[uniform(q)]});
near(right.deflection[0],q*L**4/(8*EI),1e-8);near(right.rotation[0],-q*L**3/(6*EI),1e-8);
near(right.reactions[0].force,-q*L,1e-8);near(right.reactions[0].moment,q*L*L/2,1e-8);
for(const x of left.nodes) {
  near(nodeValue(right,L-x,'deflection'),nodeValue(left,x,'deflection'),1e-8,1e-12,'mirror v');
  near(nodeValue(right,L-x,'rotation'),-nodeValue(left,x,'rotation'),1e-8,1e-12,'mirror θ');
  near(nodeValue(right,L-x,'moment'),nodeValue(left,x,'moment'),1e-8,1e-8,'mirror M');
}

/* ---------- propped cantilever (fixed–roller), both load cases ---------- */
r=solve({leftSupport:'fixed',rightSupport:'roller',loads:[uniform(q)]});
near(r.reactions[1].force,-3*q*L/8,1e-8);near(r.reactions[0].force,-5*q*L/8,1e-8);near(r.reactions[0].moment,-q*L*L/8,1e-8);
r=solve({leftSupport:'fixed',rightSupport:'roller',loads:[point(L/2,P)]});
near(r.reactions[1].force,-5*P/16,1e-8);near(r.reactions[0].force,-11*P/16,1e-8);near(r.reactions[0].moment,-3*P*L/16,1e-8);
near(nodeValue(r,L/2,'deflection'),7*P*L**3/(768*EI),1e-8);

/* ---------- continuous beams: supports anywhere, assembled as FE constraints ---------- */
const l2=L/2;
r=solve({supports:sup([0,'pin'],[l2,'roller'],[L,'roller']),loads:[uniform(q)]});
near(r.reactions[0].force,-3*q*l2/8,1e-8);near(r.reactions[1].force,-10*q*l2/8,1e-8);near(r.reactions[2].force,-3*q*l2/8,1e-8);
let s=station(r,l2);near(s.Mleft,-q*l2*l2/8,1e-8);near(s.v,0,0,1e-12);near(s.Vright-s.Vleft,10*q*l2/8,1e-8,0,'V jumps by the middle reaction');
near(nodeValue(r,3*l2/8,'moment'),9*q*l2*l2/128,1e-8,0,'max sagging M = 9ql²/128 at 3l/8');
const l3=L/3;
r=solve({supports:sup([0,'pin'],[l3,'roller'],[2*l3,'roller'],[L,'roller']),loads:[uniform(q)]});
[0.4,1.1,1.1,0.4].forEach((k,i)=>near(r.reactions[i].force,-k*q*l3,1e-8,0,`3-span reaction ${i}`));
near(station(r,l3).Mleft,-0.1*q*l3*l3,1e-8);near(station(r,2*l3).Mleft,-0.1*q*l3*l3,1e-8);
r=solve({supports:sup([0,'pin'],[l2,'roller'],[L,'roller']),loads:[point(l2/2,P),point(l2+l2/2,P)]});
near(r.reactions[1].force,-11*P/8,1e-8);near(r.reactions[0].force,-5*P/16,1e-8);
// Overhang: supports at 0 and a, tip load on the overhang c = L − a.
const a=300,c=L-a;
r=solve({supports:sup([0,'pin'],[a,'roller']),loads:[point(L,P)]});
near(r.reactions[1].force,-P*L/a,1e-8);near(r.reactions[0].force,P*c/a,1e-8);near(r.deflection.at(-1),P*c*c*L/(3*EI),1e-8);
near(station(r,a).Mleft,-P*c,1e-8);near(nodeValue(r,0,'deflection'),0,0,1e-14);

/* ---------- internal hinges ---------- */
r=solve({supports:sup([0,'fixed'],[L,'fixed']),hinges:[l2],loads:[point(l2,P)]});
s=station(r,l2);
near(s.v,(P/2)*l2**3/(3*EI),1e-8);near(s.Mleft,0,0,1e-6);near(s.Mright,0,0,1e-6);
near(s.thetaLeft,(P/2)*l2*l2/(2*EI),1e-8);near(s.thetaRight,-(P/2)*l2*l2/(2*EI),1e-8,0,'rotation jumps at the hinge');
near(r.reactions[0].moment,-(P/2)*l2,1e-8);near(r.reactions[1].moment,(P/2)*l2,1e-8);
const hx=300;
r=solve({supports:sup([0,'fixed'],[L,'roller']),hinges:[hx],loads:[uniform(q)]});
near(r.reactions[1].force,-q*(L-hx)/2,1e-8);near(station(r,hx).v,q*(L-hx)/2*hx**3/(3*EI)+q*hx**4/(8*EI),1e-8);
near(station(r,hx).Mleft,0,0,1e-6);
r=solve({supports:sup([0,'pin'],[l2,'roller'],[L,'roller']),hinges:[l2],loads:[uniform(q)]});
near(r.reactions[1].force,-q*l2,1e-8,0,'hinge over a support: two simple spans');near(r.reactions[0].force,-q*l2/2,1e-8);
near(station(r,l2).Mleft,0,0,1e-6);
for(const st of r.stations) if(st.kinds.includes('hinge')) {near(st.Mleft,0,0,1e-6);near(st.Mright,0,0,1e-6);}

/* ---------- modes for new arrangements (analytic Euler–Bernoulli β values) ---------- */
const freq=(beta,len)=>beta**2*Math.sqrt(EI/(rho/1e9*A))/(len*len*2*Math.PI);
const modal=(extra,betas,len,tol=1e-4)=>{
  const res=solve({...extra,modes:true,elements:60});
  res.modes.forEach((m,j)=>{if(j<betas.length)near(m.frequencyHz,freq(betas[j],len),tol,0,`mode ${j+1}`);assert.ok(m.relativeResidual<1e-5);checks++;});
  for(const sp of res.input.supports) res.modes.forEach(m=>{const i=m.x.findIndex(v=>Math.abs(v-sp.x)<1e-9);near(m.shape[i],0,0,1e-9,'mode shape vanishes at a support');});
  return res;
};
modal({supports:sup([0,'pin'],[l2,'roller'],[L,'roller']),loads:[]},[Math.PI,3.9266023120,2*Math.PI],l2);
modal({supports:sup([0,'fixed'],[L,'fixed']),hinges:[l2],loads:[]},[1.8751040687,3.9266023120,4.6940911330],l2);
modal({leftSupport:'fixed',rightSupport:'pin',loads:[]},[3.9266023120,7.0685827503,10.2101761242],L);
modal({supports:sup([0,'pin'],[l3,'roller'],[2*l3,'roller'],[L,'roller']),loads:[]},[Math.PI],l3);

/* ---------- mechanisms: rejected, never solved, motion verified independently ---------- */
function verifyMotion(model,err) {
  assert.equal(err.code,'mechanism');checks++;
  const o={...model,supports:model.supports||[],hinges:[...(model.hinges||[])].sort((p,q2)=>p-q2)};
  if(err.mechanism.kind==='axial') {assert.ok(o.supports.every(x=>x.kind==='roller'));checks++;return;}
  const mo=err.mechanism.motion, at=x=>{const g=mo.find(m=>x>=m.start-1e-9&&x<=m.end+1e-9);return g.v0+(g.v1-g.v0)*(x-g.start)/(g.end-g.start);};
  assert.ok(mo.some(m=>Math.abs(m.v0)>1e-6||Math.abs(m.v1)>1e-6),'motion is nonzero');checks++;
  for(const x of o.supports) {
    near(at(x.x),0,0,1e-9,'support does not move in the mechanism');
    if(x.kind==='fixed') {const g=mo.find(m=>x.x>=m.start-1e-9&&x.x<=m.end+1e-9);near(g.v1-g.v0,0,0,1e-9,'clamp does not rotate');}
  }
  for(let k=0;k+1<mo.length;k++) near(mo[k].v1,mo[k+1].v0,0,1e-9,'hinge keeps v continuous');
}
const mechanisms=[
  {supports:[]},{supports:sup([0,'pin'])},{supports:sup([L,'roller'])},{supports:sup([120,'pin'])},
  {supports:sup([0,'pin'],[L,'roller']),hinges:[200]},{supports:sup([0,'fixed']),hinges:[200]},
  {supports:sup([0,'fixed'],[L,'roller']),hinges:[150,300]},{supports:sup([0,'roller'],[L,'roller'])},
  {supports:sup([0,'roller'],[200,'roller'],[L,'roller'])},{supports:sup([0,'pin'],[100,'roller'],[L,'pin']),hinges:[50,250]}];
for(const m of mechanisms) {
  let err=null;
  try {solve({...m,loads:[point(225,P)],modes:true});} catch(e) {err=e;}
  assert.ok(err,`mechanism accepted: ${JSON.stringify(m)}`);checks++;
  assert.match(err.message,/Unstable|Two rollers/);checks++;
  verifyMotion(m,err);
  const an=B.analyze({...base,...m});assert.equal(an.ok,false);assert.equal(an.code,'mechanism');checks++;
}
assert.throws(()=>solve({supports:sup([0,'roller'],[L,'roller']),loads:[]}),/Two rollers/);checks++;
// Random arrangements: either a verified mechanism, or a solution satisfying every constraint.
let seed=12345;const rand=()=>((seed=(seed*1103515245+12345)%2147483648)/2147483648);
let stable=0,unstable=0;
for(let trial=0;trial<250;trial++) {
  const n=Math.floor(rand()*4), xs=new Set(), supports=[];
  for(let k=0;k<n;k++){const x=[0,L,90,180,225,270,360][Math.floor(rand()*7)];if(xs.has(x))continue;xs.add(x);supports.push({x,kind:['pin','roller','fixed'][Math.floor(rand()*3)]});}
  const hinges=[...new Set(Array.from({length:Math.floor(rand()*3)},()=>[45,135,200,315,405][Math.floor(rand()*5)]))].filter(hh=>!supports.some(x=>x.kind==='fixed'&&x.x===hh));
  const model={supports,hinges};
  let res=null,err=null;
  try {res=solve({...model,loads:[point(60,P),uniform(q,100,400),couple(330,40)]});} catch(e) {err=e;}
  if(err) {unstable++;verifyMotion(model,err);continue;}
  stable++;
  // Same tolerance policy as test_beam_learning.mjs (2e-7 N, 2e-5 N·mm), scaled by the load size.
  const scale=Math.max(1,P+q*300+40/L);
  near(res.equilibrium.force,0,0,2e-7*scale);near(res.equilibrium.moment,0,0,2e-5*scale);
  for(const x of res.input.supports) {near(station(res,x.x).v,0,0,1e-9);if(x.kind==='fixed'){const t=station(res,x.x);near(t.thetaRight??t.thetaLeft,0,0,1e-9);}}
  for(const hh of res.input.hinges) {const t=station(res,hh);near(t.Mleft,0,0,1e-5);near(t.Mright,0,0,1e-5);}
  // Left/right samples at a station: v is continuous everywhere (hinges included); θ jumps only at a hinge.
  const vmax=Math.max(1e-12,...res.deflection.map(Math.abs)), tmax=Math.max(1e-12,...res.rotation.map(Math.abs));
  for(let i=1;i<res.x.length;i++) if(res.x[i]===res.x[i-1]) {
    near(res.deflection[i],res.deflection[i-1],0,1e-12*vmax);
    if(!res.input.hinges.some(hh=>Math.abs(hh-res.x[i])<=L*1e-10)) near(res.rotation[i],res.rotation[i-1],0,1e-9*tmax);
  }
  const fm=B.forceMethod({...base,...model,loads:[point(60,P),uniform(q,100,400),couple(330,40)]});
  assert.equal(fm.degree,res.stability.degree);checks++;
  if(fm.degree>0&&fm.redundants.length) assert.ok(fm.mismatch<1e-6,`force method mismatch ${fm.mismatch}`),checks++;
}
assert.ok(stable>40&&unstable>40,`fuzz covered both cases (${stable} stable, ${unstable} unstable)`);

/* ---------- force method and equilibrium-only system ---------- */
let fm=B.forceMethod({...base,support:'fixed-fixed',loads:[point(L/2,P)]});
assert.equal(fm.degree,2);assert.deepEqual(fm.redundants.map(c=>c.type+'@'+c.x),['theta@450','v@450']);
near(fm.X[0],P*L/8,1e-8);near(fm.X[1],-P/2,1e-8);near(fm.flexibility[0][1],fm.flexibility[1][0],1e-10,0,'Maxwell reciprocity');
near(fm.delta[1],P*(L/2)**2*(3*L-L/2)/(6*EI),1e-8,0,'released cantilever deflection at B');
fm=B.forceMethod({...base,supports:sup([0,'pin'],[l2,'roller'],[L,'roller']),loads:[uniform(q)]});
near(fm.delta[0],5*q*L**4/(384*EI),1e-8,0,'released simple beam mid deflection');near(fm.flexibility[0][0],L**3/(48*EI),1e-8,0,'unit-load flexibility');
near(fm.X[0],-10*q*l2/8,1e-8);
let ss=B.staticsSystem({...base,supports:sup([0,'fixed'],[L,'roller']),hinges:[hx],loads:[uniform(q)]});
assert.equal(ss.determinate,true);near(ss.solution[0],-q*hx-q*(L-hx)/2,1e-10);near(ss.solution[2],-q*(L-hx)/2,1e-10);
ss=B.staticsSystem({...base,support:'fixed-fixed',loads:[point(L/2,P)]});
assert.equal(ss.determinate,false);assert.equal(ss.degree,2);assert.equal(ss.selfStress.length,2);checks+=5;

/* ---------- exact field evaluation at any cut, both limits ---------- */
r=solve({supports:sup([0,'pin'],[l2,'roller'],[L,'fixed']),hinges:[100],loads:[point(300,P),couple(380,C),uniform(q,0,200)]});
for(const x of r.nodes) for(const side of ['left','right']) {
  if((x===0&&side==='left')||(x===L&&side==='right')) continue;
  const f=B.fieldAt(r,x,side), i=side==='left'?r.x.indexOf(x):r.x.lastIndexOf(x);
  near(f.v,r.deflection[i],1e-9,1e-12);near(f.M,r.moment[i],1e-9,1e-9);near(f.V,r.shear[i],1e-9,1e-9);
}
let f300l=B.fieldAt(r,300,'left'),f300r=B.fieldAt(r,300,'right');near(f300l.V-f300r.V,P,1e-9,0,'V drops by P at the force');
let f380l=B.fieldAt(r,380,'left'),f380r=B.fieldAt(r,380,'right');near(f380r.M-f380l.M,C,1e-9,0,'M rises by C at the clockwise couple');
near(B.fieldAt(r,100,'left').M,0,0,1e-6);near(B.fieldAt(r,100,'right').M,0,0,1e-6);

/* ---------- modes never outnumber the free degrees of freedom ---------- */
{
  const few=B.solve({...base,elements:4,modes:true,supports:sup([0,'fixed'],[112.5,'fixed'],[225,'fixed'],[337.5,'pin'],[L,'pin']),loads:[point(L,P)]});
  eq(few.dofs.free,2,'two free DOFs (the rotations at the two pins)');eq(few.modes.length,2,'only two modes exist');
  few.modes.forEach(m=>assert.ok(m.relativeResidual<1e-6&&m.frequencyHz>0,'converged mode'));checks+=2;
  assert.ok(Math.abs(few.modes[1].frequencyHz-few.modes[0].frequencyHz)>1e-6*few.modes[0].frequencyHz,'distinct, not a repeated copy');checks++;
  const none=B.solve({...base,elements:4,modes:true,supports:[0,112.5,225,337.5,L].map(x=>({x,kind:'fixed'})),loads:[point(225,P)]});
  eq(none.dofs.free,0,'every DOF restrained');eq(none.modes.length,0,'no mode, and the static solution still exists');
  near(none.maxima.deflection,0,0,0);near(none.reactions[2].force,-P,1e-12,0,'the load goes straight into the support under it');
  near(none.equilibrium.force,0,0,1e-12);
}

/* ---------- validation of the new inputs ---------- */
for(const bad of [{supports:[{x:-1,kind:'pin'}]},{supports:[{x:L+1,kind:'pin'}]},{supports:[{x:10,kind:'hinge'}]},{supports:sup([0,'pin'],[0,'roller'])},
  {supports:Array.from({length:13},(_,i)=>({x:i*30,kind:'roller'}))},{supports:sup([0,'fixed']),hinges:[0]},{supports:sup([0,'fixed'],[L,'fixed']),hinges:[L]},
  {supports:sup([0,'fixed'],[200,'fixed'],[L,'pin']),hinges:[200]},{supports:sup([0,'fixed'],[L,'fixed']),hinges:[100,100]},
  {supports:sup([0,'fixed'],[L,'fixed']),hinges:[50,100,150,200,250,300,350]},{supports:sup([0,'fixed'],[L,'fixed']),hinges:[200],loads:[couple(200,5)]},
  {selfWeight:'yes'},{loads:[{kind:'moment',position:10,moment:'5'}]},{loads:[{kind:'moment',position:500,moment:5}]},{section:{shape:'tube',outerDiameter:10,thickness:5}}]) {
  assert.throws(()=>solve({support:'fixed-fixed',loads:[point(100,1)],...bad}));checks++;
}
console.log(`General supports: ${checks} analytic, mechanism, modal, force-method and validation checks passed (${stable} stable / ${unstable} unstable random arrangements verified).`);
