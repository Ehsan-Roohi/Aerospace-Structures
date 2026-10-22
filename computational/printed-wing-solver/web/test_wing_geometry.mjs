import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),G=require('./wing_geometry.js'),A=require('./wing_airfoils.js');
let checks=0;const near=(a,b,t=1e-10)=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} vs ${b}`);checks++;};
const base={semiSpan:300,rootChord:160,tipChord:100,modules:1,rodFractions:[],interiorRibs:0};
const plain=E.makeGeometry(base);assert.deepEqual(E.transformPoint(plain,150,[25,4]),[25,150,4]);checks++;
const geometry=E.makeGeometry({...base,sweepDeg:20,dihedralDeg:5,sweepReferenceFraction:.25,twistReferenceFraction:.3,twistEnabled:true,stations:[{eta:0,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:2},{eta:.4,airfoil:{kind:'naca5',code:'23012'},incidenceDeg:0},{eta:1,airfoil:{kind:'naca4',code:'0012'},incidenceDeg:-4}]});
const s=E.stationAt(geometry,210);near(s.chord,118);near(s.incidenceDeg,-2);near(s.xLE,210*Math.tan(20*Math.PI/180)+.25*(160-118));near(s.zLE,210*Math.tan(5*Math.PI/180));
for(const y of [0,43,120,210,300])for(const p of [[0,0],[25,4],[80,-6],[E.chordAt(geometry,y),0]]){const global=E.transformPoint(geometry,y,p);near(global[1],y);E.inversePoint(geometry,global).forEach((v,i)=>near(v,p[i]));}
const rootLE=E.transformPoint(geometry,0,[0,0]),rootTE=E.transformPoint(geometry,0,[160,0]);assert.ok(rootLE[2]>rootTE[2],'positive incidence is nose-up');checks++;
const p=E.airfoilAt(geometry,210),a=A.verticalOrdinates(p,.35,118,1.2),left=A.verticalOrdinates({kind:'naca5',code:'23012'},.35,118,1.2),right=A.verticalOrdinates({kind:'naca4',code:'0012'},.35,118,1.2);near(a.upper,(left.upper+right.upper)/2,1e-10);near(a.lower,(left.lower+right.lower)/2,1e-10);
assert.equal(E.airfoilAt(geometry,0).code,'2412');assert.equal(E.airfoilAt(geometry,120).code,'23012');assert.equal(E.airfoilAt(geometry,300).code,'0012');checks+=3;
for(const patch of [{sweepDeg:NaN},{sweepDeg:null},{dihedralDeg:46},{twistReferenceFraction:1.1},{twistEnabled:'yes'},{stations:[{eta:0,airfoil:'2412',incidenceDeg:2},{eta:1,airfoil:'0012',incidenceDeg:0}]},{stations:[{eta:0,airfoil:'2412'},{eta:0,airfoil:'0012'}]},{stations:[{eta:.1,airfoil:'2412'},{eta:1,airfoil:'0012'}]}]){assert.throws(()=>E.makeGeometry({...base,...patch}));checks++;}
// Local mechanics can be inspected independently of aircraft placement.
const stationary=E.makeGeometry({...geometry,sweepDeg:0,dihedralDeg:0,sweepReferenceFraction:0,stations:geometry.stations.map(s=>({...s,incidenceDeg:0})),twistEnabled:false});
assert.deepEqual(E.ringLoops(geometry,210),E.ringLoops(stationary,210));checks++;
const n=E.normalize({geometry,assembly:{seamsBonded:true},load:{kind:'custom',items:[]}});assert.ok(n.ySec.includes(120)&&n.ySec.includes(300),'all airfoil stations are section samples');checks++;
// Old solver baseline, independently recorded before this extension. The shell
// shear-centre/torsion CG solve uses a 1e-11 relative residual. Its derived GJ
// and integrated twist are not one-operation IEEE-754 identities: platform
// roundoff propagates through that solve. Require 1e-10 relative equivalence
// (ten significant digits), not bit equality. This numerical regression bound
// does not alter any separate analytical/independent physical validation gate.
const r=E.solve({geometry:{modules:1,rodFractions:[]},load:{kind:'tip',tipForce:2},nGrid:101,nElements:10,nSections:3});
for(const[actual,expected]of[[r.mass.total,210.7485706232253],[r.deflection.at(-1),2.5019557037623787],[r.twist.at(-1),.00020002899564432894],[r.sections[0].EIf,35401743.441010736],[r.sections[0].GJ,45885355.6496136]])near(actual,expected,1e-10*Math.abs(expected));assert.equal(r.V[0],2);assert.equal(r.M[0],900);checks+=2;
console.log(`Wing geometry PASS: ${checks} station interpolation, incidence/sweep/dihedral references, inverse transforms, local-section invariance, validation and iterative-solver-precision legacy checks.`);
