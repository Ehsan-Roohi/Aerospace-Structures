/* Independent closed-form references for exact-endpoint bending integration.
 * For s=(L-y)/L, I=I0*s^m and q=q0*s^p, equilibrium gives
 * kappa=k0*s^(p+2-m), k0=q0*L^2/[E*I0*(p+1)*(p+2)].
 * Tip translation exists iff p+4-m>0; slope iff p+3-m>0.
 * This is a nominal linear EB component, not torsion/full-surface motion.
 * General beam kinematics: MIT 16.20 Unit14 (Lagace), pp5-10,25-30:
 * https://ocw.mit.edu/courses/16-20-structural-mechanics-fall-2002/13881c48c7c4654e4b5b689cb6987803_unit14.pdf
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('./wing_closed_tip_stress.js'),E=require('./engine.js'),F=require('./wing_frame3d.js');
assert.equal(typeof B.integrateBending,'function','dedicated exact-endpoint bending integrator');
const close=(a,b,label,tol=3e-7)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol*Math.max(1e-5,Math.abs(b)),`${label}: ${a} != ${b}`);
const L=100,q0=.02,EI0=2e6;
function reference(alpha,k,y){
 if(y===L){return {w:alpha>-2?k*L*L/(alpha+2):Infinity,slope:alpha>-1?k*L/(alpha+1):Infinity};}
 const d=1-y/L;
 if(alpha===-1)return {w:k*L*L*(1-d+d*Math.log(d)),slope:-k*L*Math.log(d)};
 if(alpha===-2)return {w:k*L*L*(-Math.log(d)-1+d),slope:k*L*(1/d-1)};
 return {w:k*L*L*((1-d**(alpha+2))/(alpha+2)-d*(1-d**(alpha+1))/(alpha+1)),slope:k*L*(1-d**(alpha+1))/(alpha+1)};
}
function model(m,p,sign=1){
 const alpha=p+2-m,k=sign*q0*L*L/(EI0*(p+1)*(p+2));let endpointCalls=0;
 // The companion curvature represents unsymmetric bending with sectional
 // E*Ixx=EI0, E*Ixz=.3*EI0, E*Izz=1.09*EI0, scaled together by s^m.
 // Zero lateral moment then gives kappaX=-.3*kappaZ and reduced EI=EI0.
 const curvatureAt=y=>{if(!(y>=0&&y<L)){endpointCalls++;throw Error('No endpoint curvature is fabricated.');}const z=k*(1-y/L)**alpha;return [-.3*z,z];};
 const b=B.integrateBending({length:L,curvatureAt,breaks:[0,17,53,L],tipTranslationFinite:alpha>-2,tipSlopeFinite:alpha>-1});
 return {b,alpha,k,endpointCalls:()=>endpointCalls};
}
for(const [name,m,p]of [['delta uniform load',4,0],['delta elliptic-type endpoint load',4,.5],['delta chord load',4,1],['delta quadratic endpoint load',4,2],['square-root chord uniform-load endpoint analogue',2,0]]){
 const {b,alpha,k,endpointCalls}=model(m,p);
 for(const eta of [0,.1,.5,.9,.99,.999]){
  const y=L*eta,got=b.at(y),want=reference(alpha,k,y);
  close(got.verticalMm,want.w,name+' vertical');close(got.chordwiseMm,-.3*want.w,name+' coupled chordwise');
  close(got.slopeVertical,want.slope,name+' slope');close(got.slopeChordwise,-.3*want.slope,name+' chordwise slope');
  assert.equal(got.componentOnly,true);assert.equal(got.torsionIncluded,false);
 }
 const end=b.at(L),want=reference(alpha,k,L);
 assert.equal(end.translationFinite,alpha>-2);assert.equal(end.slopeFinite,alpha>-1);
 if(alpha>-2){close(end.verticalMm,want.w,name+' exact tip');close(end.chordwiseMm,-.3*want.w,name+' exact chordwise tip');}
 else assert.equal(Number.isFinite(end.verticalMm),false,'divergent translation is not made finite');
 if(alpha>-1)close(end.slopeVertical,want.slope,name+' exact tip slope');
 else assert.equal(Number.isFinite(end.slopeVertical),false,'divergent slope is not assigned zero or a finite cap');
 assert.equal(endpointCalls(),0,'quadrature never evaluates zero-area endpoint curvature');
 console.log('PASS closed-form exact-endpoint bending:',name);
}
// Sign reversal and superposition remain valid when the tip slope is singular.
const a=model(4,.5),minus=model(4,.5,-1),c=model(4,2),sum=B.integrateBending({length:L,curvatureAt:y=>{const z=a.k*(1-y/L)**a.alpha+c.k;return [-.3*z,z];},breaks:[0,17,53,L],tipTranslationFinite:true,tipSlopeFinite:false});
for(const y of [0,35,99,L]){
 const x=a.b.at(y),n=minus.b.at(y),z=c.b.at(y),s=sum.at(y);
 close(n.verticalMm,-x.verticalMm,'signed reversal');close(s.verticalMm,x.verticalMm+z.verticalMm,'superposition');
 if(y<L)close(s.slopeVertical,x.slopeVertical+z.slopeVertical,'slope superposition');
}
// Independent work identity for a homothetic delta with q~s^1/2. The analytic
// curvature yields 2U=int EI*kappa^2dy. Simpson integrates q*w from the tested
// response on a separate square-root parameter grid, not the inner quadrature.
let external=0;const panels=400;
for(let i=0;i<=panels;i++){
 const t=i/panels,y=L*(1-t*t),q=q0*t,w=a.b.at(y).verticalMm,integrand=2*L*t*q*w;
 external+=(i===0||i===panels?1:i%2?4:2)*integrand;
}external/=3*panels;
const twiceEnergy=EI0*a.k*a.k*L/(4+2*a.alpha+1);close(external,twiceEnergy,'independent work-energy identity',2e-6);
// An actual exact elliptical planform under uniform load has finite endpoint
// translation AND slope. Integrate the independently recovered cut coefficients
// with the existing 4-point frame quadrature, split at actual material changes.
const r=E.solve({geometry:{planform:'elliptic',naca:'0020',semiSpan:130,rootChord:160,tipChord:0,skin:.8,te:.8,modules:1,rodFractions:[],spars:[],interiorRibs:2},assembly:{seamsBonded:true},load:{kind:'custom',items:[{kind:'distributed',start:0,end:130,qStart:.01,qEnd:.01,fraction:.25}],selfWeight:false},nGrid:31});
assert.ok(r.analysis3D.bending?.at,'actual wing exposes a separately named bending component');
let independentW=0,independentSlope=0;for(let i=1;i<r.ySec.length;i++){
 const value=F.integrate(y=>{const cut=r.analysis3D.cutAt(y),k=-cut.coefficientZ/(r.pla.E*cut.scale);return [(130-y)*k,k];},r.ySec[i-1],r.ySec[i],1e-9,16);
 independentW+=value[0];independentSlope+=value[1];
}
const tip=r.analysis3D.bending.at(130);assert.equal(tip.translationFinite,true);assert.equal(tip.slopeFinite,true);close(tip.verticalMm,independentW,'true ellipse cut-integrated tip component',2e-6);close(tip.slopeVertical,independentSlope,'true ellipse cut-integrated tip slope',2e-6);
assert.ok(r.deflection.every(Number.isNaN)&&r.twist.every(Number.isNaN),'unknown full displacement/twist remain unavailable');
console.log('PASS clamp, signed reversal, superposition, independent energy, actual ellipse finite endpoint and separation from unknown full motion.');
