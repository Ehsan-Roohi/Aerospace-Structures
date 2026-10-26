// Structure counts are not physical fit criteria. Verify admission, persistence,
// actual section mechanics, and retained geometric rejection independently.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),IO=require('./wing_study_io.js');
const seed=JSON.parse(readFileSync(new URL('../../../docs/examples/full-delta-1-spar.wing-study.json',import.meta.url),'utf8'));
seed.study.geometry={...seed.study.geometry,naca:'0020',airfoil:{kind:'naca4',code:'0020'},semiSpan:260,interiorRibs:24,customInteriorRibs:null,spars:[.2,.4,.6].map(fraction=>({...seed.study.geometry.spars[0],fraction,widthMode:'fixed',length:40,topWidth:5,bottomWidth:5,topThickness:.6,bottomThickness:.6,webThickness:.4}))};
for(const custom of [false,true]){
 const doc=structuredClone(seed);if(custom)doc.study.geometry.customInteriorRibs=Array.from({length:24},(_,i)=>10*(i+1));
 const imported=IO.importPrintedStudy(JSON.stringify(doc),E);assert.ok(imported.ok,JSON.stringify(imported.errors));
 const round=IO.importPrintedStudy(IO.exportPrintedStudy(imported.state,E),E);assert.ok(round.ok,JSON.stringify(round.errors));
 assert.equal(round.state.geometry.spars.length,3);assert.equal(round.state.geometry.interiorRibs,24);
 assert.equal(round.state.geometry.customInteriorRibs?.length??24,24);
 const input=IO.printedEngineInput(round.state,E),r=E.solve(input);
 assert.equal(r.ribs.length,24);assert.equal(r.geometry.spars.length,3);assert.ok(r.mass.spars>0);assert.ok(r.verification.passed);
 assert.equal(new Set(r.stress.spars.map(s=>s.index)).size,3);assert.ok(r.stress.sigTop.some(Number.isFinite));
 const bad=structuredClone(input);bad.geometry.spars[1].fraction=bad.geometry.spars[0].fraction;
 assert.throws(()=>E.solve(bad),/overlap|separat|same|spar/i,'overlapping spars still fail physical validation');
 const ribs=structuredClone(input);ribs.geometry.customInteriorRibs=[10,10.1];
 assert.throws(()=>E.solve(ribs),/overlap|separat/i,'overlapping custom ribs still fail physical validation');
 console.log(`PASS three spars and24 ${custom?'custom':'automatic'} ribs: strict IO roundtrip, solved union mass/stress and retained overlap guards.`);
}
