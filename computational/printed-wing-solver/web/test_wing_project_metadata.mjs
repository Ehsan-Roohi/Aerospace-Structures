// Project labels are untrusted metadata: no physics changes or browser automation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url), IO=require('./wing_study_io.js'), E=require('./engine.js');
const original=JSON.parse(readFileSync(new URL('../../../tests/fixtures/wing_lab_course_browser.json',import.meta.url),'utf8'));
const open=doc=>IO.importPrintedStudy(JSON.stringify(doc),E);
const old=open(original); assert.equal(old.ok,true); assert.equal(old.state.projectName,''); assert.equal(old.state.emptyStudy,false);
let checks=3;
for(const name of ['Team Blue - Wing 01','بال تیم یک','<img src=x onerror=alert(1)>','../CON/../../x','  Team 2  ','']){
  const state={...old.state,projectName:name},doc=IO.printedStudyDocument(state,E);
  const restored=open(doc);assert.equal(restored.ok,true);assert.equal(restored.state.projectName,name.trim());
  assert.deepEqual(restored.state.geometry,old.state.geometry);
  assert.deepEqual(IO.printedEngineInput(restored.state,E),IO.printedEngineInput(old.state,E));
  assert.equal(IO.decodeShare(IO.encodeShare(doc,{engine:E}),{engine:E}).state.projectName,name.trim());
  assert.equal(IO.printedStudyDocument(restored.state,E,{savedAt:doc.savedAt}).projectName,doc.projectName);
  assert.ok(!IO.safeFilenameStem(name).includes('/'));assert.ok(!IO.safeFilenameStem(name).includes('..'));
  if(name.includes('<img'))assert.ok(!IO.previewHtml(restored).includes('<img'));
  checks+=8;
}
for(const value of [null,1,true,{},[], 'x'.repeat(81),'x\nname','x\u0000name','x\u0085name','x\u202ename','x\u2066name','\ud800']){
  const bad=open({...original,projectName:value}); assert.equal(bad.ok,false);assert.equal(bad.state,null);
  assert.ok(bad.errors.some(e=>e.includes('projectName')||e.includes('surrogate')));
  assert.throws(()=>IO.printedStudyDocument({...old.state,projectName:value},E));checks+=4;
}
for(const value of ['CON','prn','AUX','nul','COM1','lpt9']){assert.match(IO.safeFilenameStem(value),/^wing-/);checks++;}
assert.equal(IO.safeFilenameStem('بال تیم یک'),'بال-تیم-یک');checks++;
assert.equal(IO.safeFilenameStem('../..'),'wing');checks++;
assert.equal(IO.safeFilenameStem('***','CON'),'wing-CON');checks++;
const blank=IO.printedStudyDocument({...old.state,emptyStudy:true,projectName:'New wing'},E);
assert.equal(blank.emptyStudy,true);assert.equal(open(blank).state.emptyStudy,true);
assert.match(IO.fabricationIssues({...old.state,emptyStudy:true},E)[0],/Create a wing first/);checks+=3;
for(const value of [null,0,1,'true',{},[]]){const bad=open({...original,emptyStudy:value});assert.equal(bad.ok,false);assert.equal(bad.state,null);assert.throws(()=>IO.printedStudyDocument({...old.state,emptyStudy:value},E));checks+=3;}
console.log(`Wing project metadata: ${checks} checks passed`);
