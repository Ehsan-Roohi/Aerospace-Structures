/* Performance regression uses deterministic geometry-operation counts, not a
 * hardware-dependent time limit. Equivalence reference evaluates full original
 * ring polygons at every gravity quadrature point with the same tolerances.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),C=require('./wing_closed_tip_stress.js'),G=require('./wing_geometry.js'),S=require('./wing_spars.js'),P=require('./load_profiles.js');
const near=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=2e-9*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b}`);
const source={geometry:{planform:'elliptic',semiSpan:450,rootChord:160,tipChord:0,skin:1.2,rodFractions:[],modules:1},assembly:{seamsBonded:true},nGrid:201};
function prescribed(load,g){const total=load.aircraftMass*load.loadFactor*9.81/2,fraction=load.liftFraction;if(load.distribution==='schrenk')return [{kind:'schrenk',total,fraction}];if(load.distribution==='planform')return [{kind:'distributed',start:0,end:g.semiSpan,qStart:total*2/g.semiSpan,qEnd:0,fraction}];return [{kind:'distributed',start:0,end:g.semiSpan,qStart:total/g.semiSpan,qEnd:total/g.semiSpan,fraction}];}
const tools={E,normalize:E.normalize,polyIntegrals:S.polygon,Geometry:G,GRAV:9.81,chordAt:E.chordAt,prescribedFlightLoads:prescribed,customLine:(p,g,y)=>P.valueAt(p,y),customFraction:(p,y)=>P.fractionAt(p,y)};
const variants=[
 {label:'custom 5N',load:{kind:'custom',selfWeight:false,items:[{kind:'distributed',start:0,end:450,qStart:5/450,qEnd:5/450,fraction:.3}]}},
 {label:'custom 5N + gravity',load:{kind:'custom',selfWeight:true,items:[{kind:'distributed',start:0,end:450,qStart:5/450,qEnd:5/450,fraction:.3}]}},
 ...['uniform','planform','schrenk'].map(distribution=>({label:`flight ${distribution} + gravity`,load:{kind:'flight',aircraftMass:1,loadFactor:1,distribution,liftFraction:.3,inertiaRelief:false,selfWeight:true}})),
];
for(const {label,load}of variants){
 const input={...source,load},t0=performance.now(),fast=C.solve(input,tools),t1=performance.now(),raw=C.solve(input,{...tools,E:{...E,verticalOrdinates:undefined},disableMassPolynomial:true}),t2=performance.now();
 near(fast.mass.total,raw.mass.total,label+' mass');near(fast.appliedForce,raw.appliedForce,label+' force');near(fast.appliedMoment,raw.appliedMoment,label+' root moment');
 for(const y of [0,1.19,30,123,222,449,449.999955]){const c=E.chordAt(fast.geometry,y),a=fast.analysis3D.cutAt(y),b=raw.analysis3D.cutAt(y);for(let k=0;k<3;k++){near(a.force[k],b.force[k],label+' force component');near(a.moment[k],b.moment[k],label+' moment component');}near(fast.analysis3D.evaluateStress(y,[.3*c,.01*c]).value,raw.analysis3D.evaluateStress(y,[.3*c,.01*c]).value,label+' signed stress');}
 assert.equal(fast.analysis3D.evaluateStress(450,[0,0]).resolved,false);assert.equal(fast.geometry.tipChord,0);assert.equal(fast.verification.adaptiveQuadratureRelativeTolerance,2e-9);assert.ok(fast.verification.normalStressEquilibriumRelativeResidual<1e-8);
 const a=fast.analysis3D.performanceCounters,b=raw.analysis3D.performanceCounters;assert.ok(a.exactMassPolynomialPanels>0);assert.ok(a.exactMassPolynomialEvaluations>0);assert.ok(a.sectionTensorEvaluations<=fast.y.length+8,'gravity nodes cannot trigger stiffness recovery');if(load.selfWeight)assert.ok(a.sectionGeometryEvaluations<b.sectionGeometryEvaluations/5,'constant-profile gravity must reuse exact polygon moment polynomials');
 const countBefore=a.sectionGeometryEvaluations,probeY=197.123,point=[30,3];fast.analysis3D.evaluateStress(probeY,point);const afterFirst=a.sectionGeometryEvaluations;for(let i=0;i<1000;i++)fast.analysis3D.evaluateStress(probeY,[point[0]+i*.001,point[1]]);assert.equal(a.sectionGeometryEvaluations,afterFirst,'all vertices at one station reuse the actual cut');assert.ok(afterFirst-countBefore<=1);
 console.log(`PASS ${label}: exact polygon-equivalent force/mass/moments/stress; fast ${Math.round(t1-t0)} ms vs raw ${Math.round(t2-t1)} ms; geometry ${a.sectionGeometryEvaluations} vs ${b.sectionGeometryEvaluations}`);
}
// The screenshot's recorded pre-optimization solution is retained as an
// additional independent guard against changing the physical load or geometry.
const r=E.solve({...source,load:variants[1].load});near(r.mass.total,223.76544428654347,'pre-optimization mass');near(r.appliedMoment,683.4500109092265,'pre-optimization root moment');near(r.analysis3D.evaluateStress(123,[30,3]).value,-.025004244897708465,'pre-optimization signed stress');
// Varying sections cannot inherit the fixed-profile polynomial identity.
const variable={...source,nGrid:21,geometry:{...source.geometry,stations:[{eta:0,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:0},{eta:1,airfoil:{kind:'naca4',code:'0012'},incidenceDeg:0}]},load:{kind:'custom',items:[],selfWeight:true}},v=C.solve(variable,tools),reference=C.solve(variable,{...tools,E:{...E,verticalOrdinates:undefined},disableMassPolynomial:true});assert.equal(v.analysis3D.performanceCounters.exactMassPolynomialPanels,0);near(v.mass.total,reference.mass.total,'variable-profile fallback mass');near(v.appliedMoment,reference.appliedMoment,'variable-profile fallback gravity moment');
console.log('PASS variable-profile fallback and recorded screenshot equivalence; no geometry, load, endpoint or quadrature-tolerance relaxation.');
