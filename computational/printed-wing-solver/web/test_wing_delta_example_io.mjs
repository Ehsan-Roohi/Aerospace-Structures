import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),IO=require('./wing_study_io.js'),P=require('./wing_print_mesh.js');
const {default:Module}=await import('./vendor/manifold-3.5.4/manifold.js'),wasm=await Module();wasm.setup();
for(const count of [1,2]){
  const filename=`full-delta-${count}-spar${count===1?'':'s'}.wing-study.json`,text=readFileSync(new URL(`../../../docs/examples/${filename}`,import.meta.url),'utf8'),doc=JSON.parse(text),got=IO.importPrintedStudy(text,E);
  assert.ok(got.ok,JSON.stringify(got.errors));assert.equal(got.state.mirrorFullWing,true);assert.equal(doc.study.fabrication.mirrorFullWing,true);assert.equal(got.state.geometry.planform,'delta');assert.equal(got.state.geometry.tipChord,0);assert.equal(got.state.geometry.spars.length,count);
  const round=IO.importPrintedStudy(IO.exportPrintedStudy(got.state,E),E);assert.ok(round.ok);assert.equal(round.state.mirrorFullWing,true);
  const old=structuredClone(doc);delete old.study.fabrication;assert.equal(IO.importPrintedStudy(JSON.stringify(old),E).state.mirrorFullWing,false,'old studies default to semi-wing');
  for(const bad of [{mirrorFullWing:'true'},{mirrorFullWing:true,unknown:true},null]){const invalid=structuredClone(doc);invalid.study.fabrication=bad;assert.equal(IO.importPrintedStudy(JSON.stringify(invalid),E).ok,false,'fabrication fields strictly validated');}
  const input=IO.printedEngineInput(got.state,E),r=E.solve(input);assert.ok(r.analysis3D.stressOnly);assert.ok(Math.abs(r.appliedForce-2.5)<1e-8);assert.ok(Math.abs(r.appliedMoment-108.33333333333333)<1e-8);assert.ok(r.mass.spars>0);assert.ok(r.verification.passed);assert.ok(r.deflection.every(Number.isNaN));assert.ok(r.stress.sigBot.some(v=>v<0));assert.ok(r.stress.sigTop.some(v=>v>0));
  const full=await P.build({...input,fullWing:true,density:input.pla.rho},wasm),info=P.inspectSTL(full.files[0].bytes);assert.equal(full.report.fullWing,true);assert.equal(full.files.length,1);assert.ok(Math.abs(info.volumeMm3*input.pla.rho/1000-2*r.mass.total)<.005*2*r.mass.total,'actual full printed union agrees with two nominal halves');
  console.log(`PASS full delta ${count} spar(s): strict mirrored study round trip, backward compatibility, actual solve and full one-piece STL`);
}
