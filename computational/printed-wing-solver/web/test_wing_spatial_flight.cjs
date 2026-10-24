const assert=require('node:assert/strict'),E=require('./engine.js');
const geometry={airfoil:{kind:'naca4',code:'2412'},semiSpan:300,rootChord:160,tipChord:120,modules:1,rodFractions:[],interiorRibs:2,sweepDeg:12,dihedralDeg:5};
for(const distribution of ['elliptic','uniform','planform','schrenk','tip']){
 const load={kind:'flight',aircraftMass:.2,loadFactor:1,distribution,liftFraction:.25,inertiaRelief:false};
 const r=E.solve({geometry,load,nElements:8,nSections:3,nGrid:11});
 assert.ok(r.analysis3D);assert.ok(Math.abs(r.appliedForce-.981)<1e-7,distribution+' total force');assert.ok(Math.abs(r.liftN-.981)<1e-12);assert.ok([...r.w].every(Number.isFinite));assert.equal(r.point.length,distribution==='tip'?1:0);assert.ok(r.deflection.some(v=>Math.abs(v)>1e-8));
}
assert.equal(E.analysisCapability(E.makeGeometry(geometry),{load:{kind:'flight',inertiaRelief:true}}).supported,false);
console.log('PASS: five aircraft-lift shapes solve on swept/dihedral spatial beam; 0.981 N conserved; arrow intensities and point forces finite; unsupported inertia relief rejected.');
