// A neutral-v1 outer shape must replace, not inherit, an advanced station planform.
import assert from 'node:assert/strict';import{createRequire}from'node:module';import{readFileSync}from'node:fs';
const require=createRequire(import.meta.url),E=require('./engine.js'),IO=require('./wing_study_io.js'),raw=readFileSync(new URL('../../../tests/fixtures/wing_lab_station_browser.json',import.meta.url),'utf8');
const imported=IO.importPrintedStudy(raw,E);assert.ok(imported.ok,JSON.stringify(imported.errors));
const state=imported.state,before=JSON.stringify(state),outer={naca:'0012',semiSpan:180,rootChord:160,tipChord:120},seen=[];
const wrapped={...E,makeGeometry:g=>{seen.push(JSON.parse(JSON.stringify(g)));return E.makeGeometry(g);},sectionAt:(input,y)=>{seen.push(JSON.parse(JSON.stringify(input.geometry)));return E.sectionAt(input,y);}};
const errors=IO.checkOuterGeometry(state,outer,wrapped);assert.deepEqual(errors,[]);assert.ok(seen.length>0,'actual engine geometry preflight was invoked');
const advanced=['airfoil','stations','sweepDeg','dihedralDeg','sweepReferenceFraction','twistReferenceFraction','twistEnabled'];
for(const geometry of seen){assert.equal(geometry.naca,'0012');for(const field of advanced)assert.ok(!Object.hasOwn(geometry,field),`preflight cannot retain ${field}`);const g=E.makeGeometry(geometry);assert.equal(E.airfoilAt(g,90),'0012');assert.equal(E.camber(E.airfoilAt(g,90),.3).yc,0,'neutral symmetric section, not the prior station profile');}
assert.equal(JSON.stringify(state),before,'conflict checking cannot mutate the current advanced study');
const referenceOnly=JSON.parse(before);for(const field of advanced)delete referenceOnly.geometry[field];referenceOnly.geometry.sweepReferenceFraction=.25;
seen.length=0;assert.deepEqual(IO.checkOuterGeometry(referenceOnly,outer,wrapped),[]);assert.ok(seen.length);for(const geometry of seen){assert.equal(geometry.naca,'0012');for(const field of advanced)assert.ok(!Object.hasOwn(geometry,field),`reference-only preflight cannot retain ${field}`);}
console.log(`Outer-after-station IO PASS: ${seen.length} actual geometry/section preflights use only the incoming neutral NACA4 shape; prior profiles/angles are absent and current state is unchanged.`);
