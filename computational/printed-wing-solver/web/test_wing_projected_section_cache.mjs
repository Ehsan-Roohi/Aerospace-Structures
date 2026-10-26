// Reusing section warping FE may not reuse load response or another geometry.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),enginePath=require.resolve('./engine.js');
const fresh=()=>{delete require.cache[enginePath];return require(enginePath);};
const g={naca:'2412',airfoil:{kind:'naca4',code:'2412'},semiSpan:180,rootChord:140,tipChord:90,skin:1.2,modules:1,rodFractions:[],spars:[],interiorRibs:1,sweepDeg:10,dihedralDeg:5};
const input={geometry:g,load:{kind:'custom',items:[{kind:'distributed',start:0,end:180,qStart:.01,qEnd:.02,fraction:.25}]},nElements:8,nGrid:31};
const snapshot=r=>({deflection:Array.from(r.deflection),twist:Array.from(r.twist),top:Array.from(r.stress.sigTop),bottom:Array.from(r.stress.sigBot),mass:r.mass,verification:r.verification,samples:r.analysis3D.sectionSamples.map(s=>({reference:s.reference,GJ:s.GJ,sc:s.scLocal}))});
const E=fresh(),first=snapshot(E.solve(input));
assert.deepEqual(snapshot(E.solve(input)),first,'identical repeated solve retains every reported number');
for(const next of [
 {...input,load:{kind:'custom',items:[{kind:'point',position:170,force:2,fraction:.6}]}},
 {...input,geometry:{...g,rootChord:150}},
 {...input,geometry:{...g,skin:1.1}},
 {...input,geometry:{...g,naca:'0012',airfoil:{kind:'naca4',code:'0012'}}},
])assert.deepEqual(snapshot(E.solve(next)),snapshot(fresh().solve(next)),'warm section cache matches a fresh engine after load or physical-section changes');
console.log('PASS projected-section FE cache: exact repeatability and cold/warm equality after load, chord, skin and airfoil changes.');
