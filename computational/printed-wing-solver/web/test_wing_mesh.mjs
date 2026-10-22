import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
let checks=0;const geometry={naca:'0012',semiSpan:300,rootChord:160,tipChord:160,modules:1,rodFractions:[],interiorRibs:1},load={kind:'custom',items:[{kind:'point',position:173.1,force:2,fraction:.3}]},base={geometry,load,nSections:3,nGrid:31};
assert.deepEqual(E.MESH_LIMITS,{min:4,max:100,legacyDefault:60,spatialDefault:40});checks++;
for(const value of [null,false,true,'30',3,101,4.5,NaN,Infinity,[],{}]){
 for(const input of [base,{...base,geometry:{...geometry,airfoil:{kind:'naca4',code:'0012'}}}]){
  assert.throws(()=>E.normalize({...input,nElements:value}),/nElements.*integer from 4 to 100/);
  assert.throws(()=>E.solve({...input,nElements:value}),/nElements.*integer from 4 to 100/);checks+=2;
 }
}
for(const count of [4,30,100]){assert.doesNotThrow(()=>E.normalize({...base,nElements:count}));checks++;}
const snapshot=JSON.stringify(base),legacy=E.solve({...base,nElements:4});
assert.equal(JSON.stringify(base),snapshot);assert.equal(legacy.mesh.requestedElements,4);assert.equal(legacy.mesh.actualElements,legacy.fem.y.length-1);assert.equal(legacy.mesh.nodeCount,legacy.fem.y.length);assert.ok(legacy.mesh.actualElements>4,'required off-grid load adds an element');
for(const y of [0,150,173.1,300])assert.ok(legacy.fem.y.includes(y),`required legacy station ${y}`);checks+=9;
const oldDefault=E.solve(base),explicitDefault=E.solve({...base,nElements:60});
assert.deepEqual(oldDefault,explicitDefault,'omitting mesh count preserves the exact old 60-element-request solve');checks++;
assert.equal(oldDefault.mesh.requestedElements,60);checks++;
const spatialInput={...base,geometry:{...geometry,airfoil:{kind:'naca4',code:'0012'}}},spatial=E.solve({...spatialInput,nElements:4});
assert.equal(spatial.mesh.requestedElements,4);assert.equal(spatial.mesh.actualElements,spatial.analysis3D.elements.length);assert.equal(spatial.mesh.nodeCount,spatial.analysis3D.nodes.length);assert.equal(spatial.mesh,spatial.analysis3D.mesh);assert.ok(spatial.mesh.actualElements>4);
for(const y of [0,150,173.1,300])assert.ok(spatial.analysis3D.spanStations.includes(y),`required spatial station ${y}`);checks+=9;
const spatialDefault=E.solve(spatialInput),spatial40=E.solve({...spatialInput,nElements:40});
assert.equal(spatialDefault.mesh.requestedElements,40);assert.deepEqual(spatialDefault.analysis3D.displacements,spatial40.analysis3D.displacements);assert.deepEqual(spatialDefault.mesh,spatial40.mesh);checks+=3;
// Boundary count 100 is admitted and really assembled, not quietly clamped.
const maximum=E.solve({...spatialInput,nElements:100});assert.equal(maximum.mesh.requestedElements,100);assert.ok(maximum.mesh.actualElements>=100);assert.ok(Number.isFinite(maximum.deflection.at(-1)));checks+=3;
console.log(`Wing mesh PASS: ${checks} input validation, exact absent defaults, requested/actual counts, mandatory stations, maximum count and nonmutation checks.`);
