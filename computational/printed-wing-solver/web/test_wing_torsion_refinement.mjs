import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),E=require('./engine.js'),IO=require('./wing_study_io.js');
const doc=JSON.parse(readFileSync(new URL('../../../tests/fixtures/wing_lab_one_piece_browser.json',import.meta.url)));
doc.version=2;doc.study.analysis={finiteSectionTorsion:true};
const parsed=IO.importPrintedStudy(JSON.stringify(doc),E);assert.ok(parsed.ok,JSON.stringify(parsed.errors));
assert.deepEqual(parsed.state.analysis,{finiteSectionTorsion:true});
const restored=IO.importPrintedStudy(IO.exportPrintedStudy(parsed.state,E),E);assert.ok(restored.ok,JSON.stringify(restored.errors));
assert.equal(restored.state.analysis.finiteSectionTorsion,true);
const input={...IO.printedEngineInput(restored.state,E),nSections:3,nElements:12};assert.equal(input.finiteSectionTorsion,true);
const fast=E.solve({...input,finiteSectionTorsion:false}),refined=E.solve(input);
assert.ok(refined.sections.some(s=>s.torsionSection?.finiteWall));
for(let i=0;i<fast.sections.length;i++){
 assert.equal(fast.sections[i].EIf,refined.sections[i].EIf,'bending stiffness must not be calibrated');
 if(refined.sections[i].torsionSection?.finiteWall){assert.ok(refined.sections[i].GJ>0);assert.ok(refined.sections[i].torsionSection.refinementRelative<=.01);}
}
assert.equal(fast.mass.total,refined.mass.total);
const mixed=structuredClone(input);mixed.geometry.spars[0].material.E*=2;
const fallback=E.solve(mixed);assert.ok(fallback.sections.some(s=>s.torsionSection?.method==='multi-material thin-wall network'));
const invalid=structuredClone(doc);invalid.study.analysis.finiteSectionTorsion='yes';assert.equal(IO.importPrintedStudy(JSON.stringify(invalid),E).ok,false);
console.log('Torsion refinement PASS: saved optional setting, independent mesh admission metadata, unchanged mass/bending stiffness and explicit mixed-material fallback.');

