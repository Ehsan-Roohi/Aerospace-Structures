// Cross-section library: closed-form A, I, c, Q, b(z) and tau(z) for every shape, validation of
// dimensions, mass/self-weight, equal-mass candidates and the engine's section-dependent stresses.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), S=require('./beam_sections.js'), B=require('./beam_learning_engine.js');
let checks=0;
const near=(a,b,rel=1e-12,abs=1e-12,label='')=>{assert.ok(Math.abs(a-b)<=Math.max(abs,Math.abs(b)*rel),`${label} ${a} != ${b}`);checks++;};
const PI=Math.PI;

// Independent closed forms written out per shape (not using the library's own expressions).
const shapes=[
  {s:{shape:'rectangle',width:20,height:10},A:200,I:20*1000/12,c:5,Qna:20*5*2.5,bNA:20,k:1.5},
  {s:{shape:'circle',diameter:16},A:PI*64,I:PI*8**4/4,c:8,Qna:2*8**3/3,bNA:16,k:4/3},
  {s:{shape:'tube',outerDiameter:20,thickness:2},A:PI*(100-64),I:PI*(10**4-8**4)/4,c:10,Qna:2*(1000-512)/3,bNA:4},
  {s:{shape:'box',width:16,height:20,thickness:2},A:16*20-12*16,I:(16*8000-12*4096)/12,c:10,Qna:16*10*10/2-12*8*8/2,bNA:4},
  {s:{shape:'ibeam',flangeWidth:16,height:20,flangeThickness:2.5,webThickness:2},A:2*16*2.5+15*2,I:(16*8000-14*15**3)/12,c:10,Qna:16*2.5*(10-1.25)+2*7.5*7.5/2,bNA:2}];
for(const t of shapes) {
  const p=S.properties(t.s);
  near(p.A,t.A,1e-12,0,`${t.s.shape} A`);near(p.I,t.I,1e-12,0,`${t.s.shape} I`);near(p.c,t.c,0,0,`${t.s.shape} c`);near(p.S,t.I/t.c,1e-12);
  near(p.Qna,t.Qna,1e-12,0,`${t.s.shape} Q_NA`);near(p.bNA,t.bNA,0,0,`${t.s.shape} b_NA`);
  near(p.shearFactor,t.k??t.A*t.Qna/(t.I*t.bNA),1e-12,0,`${t.s.shape} k`);
  // Numerical integration of the width function reproduces A, I and Q (voids handled by b(z)).
  let A=0,I=0,Q=0;const n=40000,dz=2*p.c/n;
  for(let i=0;i<n;i++){const z=-p.c+(i+.5)*dz,w=p.widthAt(z);A+=w*dz;I+=w*z*z*dz;if(z>0)Q+=w*z*dz;}
  near(A,t.A,2e-6,0,`${t.s.shape} ∫b dz`);near(I,t.I,2e-6,0,`${t.s.shape} ∫b z² dz`);near(Q,t.Qna,2e-6,0,`${t.s.shape} ∫b z dz`);
  // tau(z) = VQ/(Ib): maximum at the neutral axis, zero at the extreme fibres, symmetric.
  const V=3, prof=S.shearProfile(p,V,81), tmax=Math.max(...prof.map(r=>r.tau));
  near(tmax,V*t.Qna/(t.I*t.bNA),1e-12,0,`${t.s.shape} tau max`);
  near(prof[0].tau,0,0,1e-15);near(prof.at(-1).tau,0,0,1e-15);
  for(const r of prof) {const mirror=prof.find(x=>Math.abs(x.z+r.z)<1e-12&&Math.abs(x.b-r.b)<1e-12);assert.ok(mirror);near(mirror.tau,r.tau,1e-12,1e-15);}
  // sigma(z) = −M z/I is linear and antisymmetric; top fibre = −M c/I.
  const sig=S.stressProfile(p,500,11);near(sig.at(-1).sigma,-500*t.c/t.I,1e-12);near(sig[0].sigma,500*t.c/t.I,1e-12);near(sig[5].sigma,0,0,1e-15);
}
// Thin-walled limits: tube k -> 2, box/I web shear -> V/(h_w t_w)-like averages.
near(S.properties({shape:'tube',outerDiameter:1000,thickness:1}).shearFactor,2,2e-3,0,'thin tube k → 2');
const thinI=S.properties({shape:'ibeam',flangeWidth:100,height:200,flangeThickness:2,webThickness:1}),tauWeb=thinI.shearFactor/thinI.A;
near(tauWeb,1/(196*1),0.08,0,'thin I web carries roughly V/(h_w t_w)');
// Flange–web junction: duplicate samples with the jump caused by the width change (Q continuous).
for(const s of [{shape:'ibeam',flangeWidth:16,height:20,flangeThickness:2.5,webThickness:2},{shape:'box',width:16,height:20,thickness:2}]) {
  const p=S.properties(s),prof=S.shearProfile(p,1,41);
  for(const zj of p.junctions) {
    const pair=prof.filter(r=>Math.abs(r.z-zj)<1e-12);assert.equal(pair.length,2);checks++;
    near(pair[0].Q,pair[1].Q,1e-12);near(pair[0].tau*pair[0].b,pair[1].tau*pair[1].b,1e-12,0,'VQ/I continuous across the junction');
    assert.ok(Math.abs(pair[0].tau-pair[1].tau)>0.1*Math.max(pair[0].tau,pair[1].tau));checks++;
  }
}
// The tube's neutral-axis cut crosses two walls: b = 2t, each wall carries the same tau.
const tube=S.properties({shape:'tube',outerDiameter:20,thickness:2});near(tube.widthAt(0),4,1e-12);near(tube.widthAt(9),2*Math.sqrt(19),1e-12);

// Validation: thickness and overlap limits, units, unknown shapes, non-numbers.
for(const bad of [{shape:'rectangle',width:0,height:10},{shape:'rectangle',width:20,height:-1},{shape:'circle',diameter:NaN},{shape:'circle',diameter:'16'},
  {shape:'tube',outerDiameter:20,thickness:10},{shape:'tube',outerDiameter:20,thickness:12},{shape:'box',width:16,height:20,thickness:8},{shape:'box',width:16,height:20,thickness:0},
  {shape:'ibeam',flangeWidth:16,height:20,flangeThickness:10,webThickness:2},{shape:'ibeam',flangeWidth:16,height:20,flangeThickness:2,webThickness:17},
  {shape:'triangle',width:2},{shape:'__proto__'},{shape:'rectangle',width:2e5,height:10},null]) {
  assert.throws(()=>S.normalize(bad));checks++;
}
assert.deepEqual(S.normalize({shape:'rectangle',width:20,height:10,extra:'<b>x</b>'}),{shape:'rectangle',width:20,height:10});checks++;

// Mass and self-weight from area and density (g/cm³ → g/mm³ → kg; N/mm).
for(const t of shapes) {
  const p=S.properties(t.s);
  near(S.massPerLength(p,1.24)*450,1.24e-3*t.A*450,1e-12,0,'mass g');
  near(S.selfWeightLine(p,1.24),1240*(t.A*1e-6)*9.80665/1000,1e-12,0,'ρgA N/mm');
}

// Equal-mass candidates: identical area, stated proportions, valid sections.
for(const Aref of [200,128,37.5]) for(const c of S.equalMassCandidates(Aref)) {
  const p=S.properties(c.section);near(p.A,Aref,1e-12,0,`${c.name} area`);
  if(c.section.shape==='tube') near(c.section.outerDiameter/c.section.thickness,10,1e-12);
  if(c.section.shape==='box') near(c.section.height/c.section.thickness,10,1e-12);
  if(c.section.shape==='ibeam') {near(c.section.height,2*c.section.flangeWidth,1e-12);near(c.section.flangeThickness,c.section.height/12,1e-12);}
}

// Engine: default rectangle unchanged (section object ≡ legacy width/height, bit for bit).
const loads=[{kind:'point',position:300,force:2},{kind:'distributed',start:50,end:400,qStart:.003,qEnd:-.001}];
const legacy=B.solve({length:450,width:20,height:10,E:2000,density:1.24,support:'fixed-fixed',loads}),
  sectioned=B.solve({length:450,section:{shape:'rectangle',width:20,height:10},E:2000,density:1.24,support:'fixed-fixed',loads});
for(const k of ['x','deflection','rotation','shear','moment','stressTop','stressBottom','shearStressMax']) {assert.deepEqual(sectioned[k],legacy[k],k);checks++;}
assert.equal(legacy.input.width,20);assert.equal(legacy.input.height,10);assert.deepEqual(legacy.section,{shape:'rectangle',width:20,height:10});checks+=3;
legacy.shear.forEach((V,i)=>near(legacy.shearStressMax[i],1.5*Math.abs(V)/200,1e-15,0,'rectangle 1.5|V|/A unchanged'));
// Engine: section-dependent stress for every shape (not 1.5V/A universally).
for(const t of shapes) {
  const r=B.solve({length:450,section:t.s,E:2000,density:1.24,support:'simply-supported',loads,modes:false});
  const k=t.k??t.A*t.Qna/(t.I*t.bNA);
  r.moment.forEach((M,i)=>{near(r.stressTop[i],-M*t.c/t.I,1e-12,1e-15);near(r.stressBottom[i],M*t.c/t.I,1e-12,1e-15);near(r.shearStressMax[i],k*Math.abs(r.shear[i])/t.A,1e-12,1e-15);});
  near(r.EI,2000*t.I,1e-12);near(r.massG,1.24*t.A*450/1000,1e-12);
  // Same supports and loads: M(x) does not depend on EI, deflection scales with 1/I.
  const ref=B.solve({length:450,width:20,height:10,E:2000,density:1.24,support:'simply-supported',loads,modes:false});
  // Determinate beam: identical M up to reaction round-off (relative to the largest moment).
  r.moment.forEach((M,i)=>near(M,ref.moment[i],0,1e-9*ref.maxima.moment,'M independent of the section'));
  near(r.maxima.deflection,ref.maxima.deflection*(20*1000/12)/t.I,1e-9,0,'v ∝ 1/I');
}
// Slenderness flags are warnings only.
assert.ok(S.properties({shape:'tube',outerDiameter:60,thickness:1}).slender.length===1);
assert.ok(B.solve({length:450,section:{shape:'tube',outerDiameter:60,thickness:1},E:2000,density:1.24,support:'cantilever',modes:false}).warnings.some(w=>/shell buckling/.test(w)));checks+=2;
console.log(`Sections: ${checks} closed-form, integration, shear-profile, validation, mass, equal-mass and engine checks passed.`);
