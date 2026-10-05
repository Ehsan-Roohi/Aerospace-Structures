// Regression tests for Wing Lab's educational custom loads and shell-only path.
// These test the claimed reduced-order quantities, not local shell/rib stress
// fields, local load introduction, skin buckling validation or printability.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
let checks=0;
function near(actual,expected,rel=1e-8,abs=1e-7) {
  assert.ok(Number.isFinite(actual),`Nonfinite actual ${actual}`);
  assert.ok(Math.abs(actual-expected)<=Math.max(abs,Math.abs(expected)*rel),`${actual} != ${expected}`);checks++;
}
function finite(values,label) {
  for(const v of values) assert.ok(Number.isFinite(v),`${label} contains ${v}`);
  checks++;
}
const point=(position,force,fraction=.3)=>({kind:'point',position,force,fraction});
const distributed=(start,end,qStart,qEnd=qStart,fraction=.3)=>({kind:'distributed',start,end,qStart,qEnd,fraction});
const L=450;
// Independent exact resultant integration: linear load uses the rectangle and
// triangle area/centroid formulas; this is not copied from engine primitives.
function exact(items,x=0) {
  let force=0,moment=0;
  for(const p of items) {
    if(p.kind==='point') {if(p.position>=x){force+=p.force;moment+=p.force*(p.position-x);}continue;}
    const a=Math.max(x,p.start),b=p.end;if(a>=b)continue;
    const qa=p.qStart+(p.qEnd-p.qStart)*(a-p.start)/(p.end-p.start),h=b-a;
    const rect=qa*h,tri=(p.qEnd-qa)*h/2;
    force+=rect+tri;moment+=rect*(a+h/2-x)+tri*(a+2*h/3-x);
  }
  return {force,moment};
}
const cases=[
  ['arbitrary interior point',[point(173.2,2.3)]],
  ['tip point',[point(L,2)]],
  ['full rectangular',[distributed(0,L,.008)]],
  ['partial rectangular',[distributed(91.3,316.7,.013)]],
  ['full increasing triangular',[distributed(0,L,0,.017)]],
  ['partial decreasing triangular',[distributed(71.2,381.3,.019,0)]],
  ['full trapezoidal',[distributed(0,L,.006,.018)]],
  ['partial trapezoidal',[distributed(42.1,299.3,.015,.004)]],
  ['multiple signed loads',[point(163.4,1.5),point(394,-.25),distributed(27.5,377.2,.004,.011),distributed(140,280,-.002,-.003)]],
];
const results=[];
for(const [name,items] of cases) {
  const r=E.solve({load:{kind:'custom',items},nElements:72});
  results.push(r);
  const want=exact(items);
  near(r.V[0],want.force);near(r.M[0],want.moment);near(r.appliedForce,want.force);near(r.appliedMoment,want.moment);
  for(const i of [Math.floor(r.y.length*.2),Math.floor(r.y.length*.55),r.y.length-1]) {
    const inner=exact(items,r.y[i]);near(r.V[i],inner.force);near(r.M[i],inner.moment);
  }
  near(r.deflection[0],0);near(r.fem.w[0],0);
  assert.ok(r.verification.deflectionMethodsDiff<.012,`${name}: direct/FE bending error ${r.verification.deflectionMethodsDiff}`);checks++;
  for(const [key,array] of Object.entries({V:r.V,M:r.M,T:r.T,deflection:r.deflection,twist:r.twist,feDeflection:r.fem.w}))finite(array,`${name} ${key}`);
  console.log(`PASS ${name}: Vroot=${r.V[0].toFixed(5)} N, Mroot=${r.M[0].toFixed(4)} N mm, direct/FE bending ${(100*r.verification.deflectionMethodsDiff).toFixed(4)}%`);
}
// Custom point at the tip is the same physical load as the legacy tip option.
const legacy=E.solve({load:{kind:'tip',tipForce:2,tipFraction:.3},nElements:72});
near(results[1].deflection.at(-1),legacy.deflection.at(-1));near(results[1].twist.at(-1),legacy.twist.at(-1));
near(results[1].V[0],legacy.V[0]);near(results[1].M[0],legacy.M[0]);

// Chordwise application points create torque. Check direct and FE twist with
// an absolute floor: relative error alone is meaningless near cancellation.
const torsionCases=[
  ['unloaded',[]],
  ['zero point',[point(173.2,0,.6)]],
  ['zero distribution',[distributed(30,371,0,0,.6)]],
  ['eccentric point',[point(173.2,2,.6)]],
  ['multiple eccentric loads',[point(173.2,2,.25),point(324.1,-.8,.7),distributed(31,367,.004,.013,.6)]],
  ['sign-changing distribution',[distributed(0,L,-.01,.01,.6)]],
  ['exact cancellation',[point(173.2,2,.6),point(173.2,-2,.6)]],
  ['pure force couple',[point(225,2,.25),point(225,-2,.6)]],
  ['partial eccentric trapezoid',[distributed(40.3,271.2,.017,.003,.75)]],
];
for(const [name,items] of torsionCases) {
  const r=E.solve({load:{kind:'custom',items},nElements:90});
  near(r.twist.at(-1),r.fem.phi.at(-1),.01,1e-7);
  near(r.deflection.at(-1),r.fem.w.at(-1),.012,1e-6);
  finite(r.twist,`${name} twist`);finite(r.fem.phi,`${name} FE twist`);
  for(const c of r.checks)finite([c.demand,c.capacity,c.U],`${name} ${c.name}`);
  const want=exact(items);near(r.V[0],want.force);near(r.M[0],want.moment);
  if(['unloaded','zero point','zero distribution','exact cancellation'].includes(name)) {
    near(r.deflection.at(-1),0);near(r.twist.at(-1),0);near(r.fem.phi.at(-1),0);
  }
  if(name==='pure force couple') {
    near(r.V[0],0);near(r.M[0],0);near(r.deflection.at(-1),0);
    assert.ok(Math.abs(r.twist.at(-1))>1e-5);checks++;
    near(r.T[0],2*(.6-.25)*(160+(100-160)*225/L));
  }
  if(name==='sign-changing distribution') {near(r.V[0],0);assert.ok(r.M[0]>0);checks++;}
}

// Regression: a load infinitesimally beside a regular FE grid point must not
// create a microscopic element. Mandatory ribs/seams/end stations, however,
// cannot simply move: reject close-but-distinct inputs with a readable error.
for(const position of [.1,1,67.49999,150,225]) {
  const r=E.solve({load:{kind:'custom',items:[point(position,2,.6)]}});
  near(r.V[0],2);near(r.M[0],2*position);
  near(r.deflection.at(-1),r.fem.w.at(-1),.012,1e-12);
  near(r.twist.at(-1),r.fem.phi.at(-1),.01,1e-12);
  finite(r.fem.fBending,`near-grid point ${position} bending modes`);
  assert.ok(r.fem.fBending[0]>0);checks++;
}
for(const position of [.001,149.9999,150.0001,225.00001,449.99999]) {
  assert.throws(()=>E.solve({load:{kind:'custom',items:[point(position,2,.6)]}}),/0\.1 mm|degenerate/i);checks++;
}

// One-piece closed shell remains a load-carrying beam in this simplified model.
const shell=E.solve({geometry:{modules:1,rodFractions:[],interiorRibs:0,customInteriorRibs:[]},
  load:{kind:'custom',items:[point(L,2)]},nElements:72});
assert.equal(shell.ribs.length,0);assert.equal(shell.seams.length,0);assert.equal(shell.ribBearing.length,0);checks+=3;
near(shell.mass.ribs,0);near(shell.mass.rods,0);
assert.ok(shell.mass.shell>0&&shell.stiffness.tip>0);checks++;
for(const [key,array] of Object.entries({V:shell.V,M:shell.M,T:shell.T,deflection:shell.deflection,twist:shell.twist,
  feDeflection:shell.fem.w,feTwist:shell.fem.phi,EI:shell.props.EI,GJ:shell.props.GJ,
  fBending:shell.fem.fBending,fTorsion:shell.fem.fTorsion,...shell.stress}))finite(array,`shell ${key}`);
for(const c of shell.checks)finite([c.demand,c.capacity,c.U],`shell check ${c.name}`);
assert.ok(shell.stress.sigRod.every(v=>v===0));checks++;
assert.ok(!shell.checks.some(c=>c.name.startsWith('Rod ')||c.name.startsWith('Rib-hole')));checks++;
assert.ok(shell.verification.deflectionMethodsDiff<.012);checks++;
near(shell.V[0],2);near(shell.M[0],2*L);
// Zero rods at an unbonded seam is disconnected, not an infinitely soft but
// valid teaching beam. Reject instead of silently plotting finite results.
for(const modules of [2,3]) {
  assert.throws(()=>E.solve({geometry:{modules,rodFractions:[]},assembly:{seamsBonded:false}}),/disconnect|rod/i);checks++;
}
// Rib bearing is a nominal force/area screen at locked interface ribs only.
const dry=results[0];
assert.equal(dry.ribBearing.length,2*dry.seams.length);checks++;
for(const b of dry.ribBearing) {
  assert.ok(dry.ribs.some(y=>Math.abs(y-b.station)<1e-8));checks++;
  finite([b.station,b.seam,b.forcePerRod,b.stress],'rib bearing');
  near(b.stress,b.forcePerRod/(dry.geometry.rodDiameter*dry.geometry.ribThickness));
}
for(const items of [[point(0,2)],[point(-1,2)],[point(L+1,2)],[point(100,NaN)],[point(100,2,1.1)],
  [distributed(200,100,.01)],[distributed(-1,200,.01)],[distributed(0,L,.01,Infinity)]]) {
  assert.throws(()=>E.solve({load:{kind:'custom',items}}));checks++;
}
console.log(`Wing custom loading: ${checks} equilibrium, FE comparison, shell-only, rib-bearing and validation checks passed.`);
