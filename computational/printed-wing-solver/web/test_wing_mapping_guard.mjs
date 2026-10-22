import assert from'node:assert/strict';import{createRequire}from'node:module';import{readFileSync}from'node:fs';const require=createRequire(import.meta.url),E=require('./engine.js'),s=JSON.parse(readFileSync(new URL('../../../tests/fixtures/wing_lab_station_browser.json',import.meta.url))).study;
let checks=0;const input={geometry:s.geometry,assembly:s.assembly,load:s.load,nElements:12,nSections:7,nGrid:11},r=E.solve(input),p=[144,.6];
// A broad-chord, fast-changing section can have a non-admitted physical
// surface normal map even though the reference-axis beam solve is available.
const stress=E.normalStressLocationAt3D(r,72,p),motion=E.spatialPointMotion(r,72,p);assert.equal(stress.resolved,false);assert.ok(Number.isNaN(stress.value));assert.equal(stress.endZone,'mapping');assert.match(stress.reason,/Ill-conditioned normal-plane mapping/);assert.equal(motion.resolved,false);assert.equal(motion.displacement,null);assert.equal(motion.rotation,null);checks+=7;
assert.throws(()=>r.analysis3D.locatePhysicalPoint(motion.point),/Ill-conditioned normal-plane mapping/);checks++;
// Plotting returns unknown values cleanly, but an invalid physical LOAD is
// still rejected. No solver-admission condition was relaxed for a UI test.
assert.throws(()=>E.solve({...input,load:{kind:'custom',items:[{kind:'point',position:72,force:2,fraction:1}]}}),/Ill-conditioned normal-plane mapping/);checks++;
const refined=E.solve({...input,nElements:24}),a=E.normalStressLocationAt3D(r,65,p),b=E.normalStressLocationAt3D(refined,65,p);assert.equal(a.resolved,true);assert.equal(b.resolved,true);assert.equal(a.station,b.station);checks+=3;
assert.deepEqual(r.analysis3D.locatePhysicalPoint(E.spatialPointMotion(r,65,p).point).reference,refined.analysis3D.locatePhysicalPoint(E.spatialPointMotion(refined,65,p).point).reference);checks++;
console.log(`Normal mapping guard PASS: ${checks} clean unresolved visualization, unchanged strict load admission, and FE-mesh-independent normal-family checks.`);
