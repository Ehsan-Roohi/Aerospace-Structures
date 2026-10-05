import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('./beam_learning_engine.js');
let checks=0;
function near(actual,expected,rel=2e-7,abs=1e-7) {
  assert.ok(Math.abs(actual-expected)<=Math.max(abs,Math.abs(expected)*rel),`${actual} != ${expected}`);checks++;
}
const base={length:450,width:20,height:10,E:2000,density:1.24,elements:40,modes:false};
const L=base.length,I=base.width*base.height**3/12,EI=base.E*I,P=2,q=.01;
const point=(position,force)=>({kind:'point',position,force});
const dist=(start,end,qStart,qEnd=qStart)=>({kind:'distributed',start,end,qStart,qEnd});
const solve=(support,loads,extra={})=>B.solve({...base,support,loads,...extra});
const at=(r,x,key)=>r[key][r.x.findIndex(v=>Math.abs(v-x)<1e-8)];
let r=solve('cantilever',[point(L,P)]);
near(r.deflection.at(-1),P*L**3/(3*EI));near(r.rotation.at(-1),P*L**2/(2*EI));
near(r.moment[0],-P*L);near(r.shear[0],P);near(r.reactions[0].force,-P);near(r.reactions[0].moment,-P*L);
near(r.stressTop[0],P*L*base.height/(2*I));near(r.stressBottom[0],-r.stressTop[0]);near(r.shearStressMax[0],1.5*P/r.area);
near(r.equilibrium.force,0);near(r.equilibrium.moment,0);
r=solve('cantilever',[dist(0,L,q)]);
near(r.deflection.at(-1),q*L**4/(8*EI));near(r.moment[0],-q*L**2/2);near(r.shear[0],q*L);
near(r.moment.at(-1),0);near(r.shear.at(-1),0);
r=solve('fixed-fixed',[point(L/2,P)]);
near(at(r,L/2,'deflection'),P*L**3/(192*EI));near(r.reactions[0].force,-P/2);near(r.reactions[1].force,-P/2);
near(r.reactions[0].moment,-P*L/8);near(r.reactions[1].moment,P*L/8);near(at(r,L/2,'moment'),P*L/8);
near(r.rotation[0],0);near(r.rotation.at(-1),0);near(r.equilibrium.moment,0);
r=solve('fixed-fixed',[dist(0,L,q)]);
near(at(r,L/2,'deflection'),q*L**4/(384*EI));near(r.moment[0],-q*L**2/12);near(at(r,L/2,'moment'),q*L**2/24);
r=solve('simply-supported',[point(L/2,P)]);
near(at(r,L/2,'deflection'),P*L**3/(48*EI));near(at(r,L/2,'moment'),P*L/4);near(r.moment[0],0);near(r.moment.at(-1),0);
assert.ok(at(r,L/2,'stressTop')<0);checks++;
r=solve('simply-supported',[dist(0,L,q)]);
near(at(r,L/2,'deflection'),5*q*L**4/(384*EI));near(at(r,L/2,'moment'),q*L**2/8);
// Partial trapezoid + off-grid point + reverse load: check both global balances.
for(const support of ['cantilever','fixed-fixed','simply-supported']) {
  r=solve(support,[point(173.2,3),point(391,-.75),dist(41.5,309,.004,.017),dist(90,150,-.005)]);
  near(r.equilibrium.force,0,0,2e-7);near(r.equilibrium.moment,0,0,2e-5);
  for(const j of r.jumps) near(j.right-j.left,j.x===173.2?-3:.75);
  near(r.deflection[0],0); if(support!=='cantilever')near(r.deflection.at(-1),0);
}
// Equivalent zero-force and support-applied loads must not bend the beam.
for(const support of ['cantilever','fixed-fixed','simply-supported']) {
  r=solve(support,[point(0,3)]);near(r.maxima.deflection,0);near(r.maxima.moment,0);near(r.maxima.shear,0);
  if(support!=='cantilever') {r=solve(support,[point(L,3)]);near(r.maxima.deflection,0);near(r.maxima.moment,0);}
}
r=solve('cantilever',[]);near(r.maxima.deflection,0);near(r.resultant,0);
// Linearly increasing triangle exact tip displacement 11 q L^4/(120 EI).
r=solve('cantilever',[dist(0,L,0,q)]);near(r.deflection.at(-1),11*q*L**4/(120*EI));near(r.resultant,q*L/2);near(r.appliedMoment,q*L**2/3);
// Linear superposition is part of what this teaching model promises.
const a=solve('cantilever',[point(225,P)]),b=solve('cantilever',[dist(0,L,q)]),c=solve('cantilever',[point(225,P),dist(0,L,q)]);
near(c.deflection.at(-1),a.deflection.at(-1)+b.deflection.at(-1));
// Modes: analytical EB frequencies omega=beta² sqrt(EI/(rho A))/L².
const betas={cantilever:[1.8751040687,4.6940911330,7.8547574382],
  'fixed-fixed':[4.7300407449,7.8532046241,10.9956078380],
  'simply-supported':[Math.PI,2*Math.PI,3*Math.PI]};
for(const support of Object.keys(betas)) {
  r=solve(support,[],{modes:true,elements:32});
  r.modes.forEach((mode,j)=>{
    const exact=betas[support][j]**2*Math.sqrt(EI/(base.density/1e9*r.area))/(L*L*2*Math.PI);
    near(mode.frequencyHz,exact,3e-5);near(Math.max(...mode.shape.map(Math.abs)),1);
    near(mode.shape[0],0);if(support!=='cantilever')near(mode.shape.at(-1),0);
    assert.ok(mode.relativeResidual<1e-5,`modal residual ${mode.relativeResidual}`);checks++;
  });
  const coarse=solve(support,[],{modes:true,elements:6});
  const exact=betas[support][2]**2*Math.sqrt(EI/(base.density/1e9*r.area))/(L*L*2*Math.PI);
  assert.ok(Math.abs(r.modes[2].frequencyHz-exact)<Math.abs(coarse.modes[2].frequencyHz-exact));checks++;
}
for(const opts of [{length:0},{E:-1},{elements:2},{density:NaN},{support:'free'},
  {loads:[point(-1,2)]},{loads:[dist(50,40,1)]},{loads:[{kind:'point',position:10,force:'2'}]}]) {
  assert.throws(()=>B.solve({...base,...opts}));checks++;
}
console.log(`Beam Learning Engine: ${checks} analytical, equilibrium, sign, modal and validation checks passed.`);
