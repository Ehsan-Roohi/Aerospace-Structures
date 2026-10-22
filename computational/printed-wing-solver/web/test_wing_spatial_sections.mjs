import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
let checks=0;const relative=(a,b,t,label)=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${label}: ${a} vs ${b}`);checks++;};
// Independent Saint-Venant benchmark: a homothetic elliptical annulus.
// Warping omega=C*x*z satisfies both traction-free, same-aspect-ratio
// ellipses. J=pi*a^3*b^3/(a^2+b^2)*(1-k^4), not a fitted wing value.
const a=10,k=.8,N=360,angles=Array.from({length:N},(_,i)=>2*Math.PI*i/N);
for(const ratio of [1,.94,.75]){
 const b=a*ratio,inner=angles.map(t=>[k*a*Math.cos(t),k*b*Math.sin(t)]),outer=angles.map(t=>[a*Math.cos(t),b*Math.sin(t)]),fe=E.shellFE(E.ringMesh(inner,outer,4));
 const area=Math.PI*a*b*(1-k*k),Ixx=Math.PI*a*b**3/4*(1-k**4),Iyy=Math.PI*a**3*b/4*(1-k**4),J=Math.PI*a**3*b**3/(a*a+b*b)*(1-k**4);
 relative(fe.A,area,6e-5,'affine annulus area');relative(fe.Ixx,Ixx,1.1e-4,'projected normal Ixx');relative(fe.Iyy,Iyy,1.1e-4,'projected normal Iyy');relative(fe.J,J,.001,'analytic elliptical-annulus torsion');relative(fe.xsc,0,1e-8,'ellipse shear centre x');relative(fe.zsc,0,1e-8,'ellipse shear centre z');relative(fe.A*(1/ratio),Math.PI*a*a*(1-k*k),6e-5,'normal area times oblique ds preserves volume');
}
const geometry={naca:'0012',semiSpan:300,rootChord:160,tipChord:160,modules:1,rodFractions:[],interiorRibs:0},sec=E.sectionAt({geometry},0),fraction=sec.xsc/160,load={kind:'custom',items:[{kind:'point',position:300,force:2,fraction}]};
const legacy=E.solve({geometry,load,nSections:3,nElements:10,nGrid:31}),spatial=E.solve({geometry:{...geometry,airfoil:{kind:'naca4',code:'0012'}},load,nSections:3,nElements:10,nGrid:31});
relative(spatial.deflection.at(-1),2*300**3/(3*sec.EIf),1e-9,'full wing zero-angle analytic cantilever');relative(spatial.mass.total,legacy.mass.total,1e-12,'actual mass is preserved');relative(spatial.twist.at(-1),0,1e-10,'force through shear centre does not twist');
const ell=E.solve({geometry:{...geometry,sweepDeg:10},load:{kind:'custom',items:[{kind:'elliptic',start:0,end:300,shape:'start',total:2,fraction:.25}]},nSections:3,nElements:6,nGrid:11});
relative(ell.appliedForce,2,1e-10,'independently integrated elliptical total');relative(ell.analysis3D.verification.totalForce[2],2,1e-10,'frame consistent elliptical total');relative(ell.analysis3D.verification.forceError,0,1e-8,'elliptical reaction equilibrium');
assert.equal(E.analysisCapability(E.makeGeometry({...geometry,sweepDeg:10,rodFractions:[.3]})).supported,false);assert.equal(E.analysisCapability(E.makeGeometry({...geometry,sweepDeg:10,modules:2}),{assembly:{seamsBonded:true},load:{kind:'custom'}}).supported,true);checks+=2;
console.log(`Spatial wing sections PASS: ${checks} analytic normal-projection/torsion/volume, closed-form wing, exact curved-load and capability checks.`);
