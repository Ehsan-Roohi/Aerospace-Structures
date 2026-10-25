import assert from 'node:assert/strict';
import {createRequire} from 'node:module';const require=createRequire(import.meta.url),G=require('./wing_geometry.js'),E=require('./engine.js'),IO=require('./wing_study_io.js');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const base={naca:'0020',rootChord:180,tipChord:80,semiSpan:260,skin:.8,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:0};
for(const planform of ['linear','elliptic','delta']){
 const g=E.makeGeometry({...base,planform,sweepReferenceFraction:planform==='delta'?1:planform==='elliptic'?.5:0});
 const saved=IO.printedStudyDocument({geometry:g,plaKey:'pla_upright',plaOver:{},rodKey:'rod_hobby',rodOver:{},assembly:{...E.DEFAULT_ASSEMBLY,seamsBonded:true},load:{...E.DEFAULT_LOAD,kind:'custom',items:[]},criteria:{...E.DEFAULT_CRITERIA}},E);const reopened=IO.importPrintedStudy(JSON.stringify(saved),E);assert.ok(reopened.ok,JSON.stringify(reopened.errors));assert.equal(reopened.state.geometry.planform,planform);
 near(G.chordAt(g,0),180);near(G.chordAt(g,260),80);
 const n=20000,integral=Array.from({length:n},(_,i)=>G.chordAt(g,(i+.5)*260/n)).reduce((a,b)=>a+b)*260/n;near(G.area(g),integral,1e-8);
 const reinforced=E.makeGeometry({...g,spars:[{fraction:.35,length:260,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material:{name:"PLA",E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10}}]});near(E.sparParts(reinforced,130)[0].x,.35*G.chordAt(g,130));
 if(planform==='delta')for(const y of [0,60,130,260])near(G.stationAt(g,y).xLE+G.chordAt(g,y),180);
 if(planform==='elliptic'){near(G.chordAt(g,130)**2,180**2*.75+80**2*.25);for(const y of [20,130,250])near(G.chordDerivative(g,y),(G.chordAt(g,y+.001)-G.chordAt(g,y-.001))/.002);}
 const load={kind:'flight',aircraftMass:1,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false,selfWeight:true};
 if(planform!=='linear'){
  const r=E.solve({geometry:g,load,assembly:{seamsBonded:true},nElements:12,nSections:5});assert.ok(r.analysis3D);assert.ok(r.analysis3D.verification.forceError<1e-6);assert.ok(r.analysis3D.verification.momentError<1e-5);near(r.appliedForce,4.905-r.mass.total*.00981,1e-6);
  const fine=E.solve({geometry:g,load,assembly:{seamsBonded:true},nElements:24,nSections:5});near(r.deflection.at(-1),fine.deflection.at(-1),.005);
  if(planform==='elliptic'){const schrenk=E.solve({geometry:g,load:{...load,distribution:'schrenk',selfWeight:false},nElements:12,nSections:5});near(schrenk.appliedForce,4.905,1e-7);const q=E.solve({geometry:g,load:{...load,distribution:'planform',selfWeight:false},nElements:12,nSections:5});near(q.appliedForce,4.905,1e-7);}
 }
}
assert.throws(()=>E.makeGeometry({...base,planform:'unknown'}),/planform/);
console.log('PASS: planform geometry, analytic area, finite derivative bounds, delta trailing edge, spatial equilibrium, self-weight and mesh convergence.');
