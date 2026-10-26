/* Endpoint existence and actual-configuration regression; no Downloads dependency.
 * These are nominal linear bending components, not full physical displacement. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
const material={name:'Printed PLA',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10};
const geometry={naca:'2412',planform:'delta',semiSpan:450,rootChord:160,tipChord:0,skin:1.2,te:1.2,ribThickness:1.6,modules:1,customInteriorRibs:[45,75,127,170,210,275,325,390],interfaceOffset:4,cap:2,cavityStart:.06,cavityEnd:.9,rodFractions:[],spars:[{fraction:.25,widthMode:'auto',length:283.8,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material}]};
const solve=load=>E.solve({geometry,pla:material,assembly:{seamsBonded:true},load,nGrid:15});
const flight={kind:'flight',aircraftMass:.2,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false,selfWeight:false};
const r=solve(flight),b=r.analysis3D.bending,t=b.tip;
assert.ok(Math.abs(t.verticalMm-1.013843324703556)<3e-7,'actual delta configuration agrees with independent split Frame-quadrature reference');
assert.equal(t.translationFinite,true);assert.equal(t.slopeFinite,false);assert.equal(t.classification,'finite-translation-unbounded-slope');
assert.equal(b.validity.globalSmallRotationSatisfied,false);
assert.ok(r.deflection.every(Number.isNaN)&&r.chordwiseDeflection.every(Number.isNaN)&&r.twist.every(Number.isNaN));
assert.equal(b.at(0).verticalMm,0);assert.equal(b.at(0).slopeVertical,0);
const line=(a,z)=>({kind:'distributed',start:0,end:450,qStart:a,qEnd:z,fraction:.25});
const custom=(items,selfWeight=false)=>({kind:'custom',items,selfWeight});
// Exact algebraic cancellation must occur before endpoint classification.
const canceled=solve(custom([line(.001,.001),line(-.001,-.001),line(.002,0)]));
assert.equal(canceled.analysis3D.bending.tip.netEndpointLoadTerms.constant,0);
assert.equal(canceled.analysis3D.bending.tip.translationFinite,true);
assert.equal(canceled.analysis3D.bending.tip.slopeStatus,'unbounded-logarithmic');
// A small but nonzero endpoint force density still gives a divergent tip.
const tiny=solve(custom([line(1e-20,1e-20)]));
assert.equal(tiny.analysis3D.bending.tip.translationFinite,false);
assert.equal(tiny.analysis3D.bending.tip.resolved,false);
assert.ok(Number.isNaN(tiny.analysis3D.bending.tip.verticalMm));
// Interior point forces leave an unloaded terminal interval; gravity is O(d²).
const point=solve(custom([{kind:'point',position:200,force:1,fraction:.25}]));
assert.equal(point.analysis3D.bending.tip.slopeFinite,true);
const gravity=solve(custom([],true));
assert.equal(gravity.analysis3D.bending.tip.slopeFinite,true);
assert.ok(Number.isFinite(gravity.analysis3D.bending.tip.verticalMm));
const plus=solve(custom([line(.002,0)],true)),lift=solve(custom([line(.002,0)]));
assert.ok(Math.abs(plus.analysis3D.bending.tip.verticalMm-lift.analysis3D.bending.tip.verticalMm-gravity.analysis3D.bending.tip.verticalMm)<3e-7,'gravity and prescribed-load bending superpose');
console.log('PASS actual delta reference, exact endpoint cancellation, nonzero tiny tail, interior force, gravity and superposition.');
