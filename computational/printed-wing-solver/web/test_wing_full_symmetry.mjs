import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('./wing_print_mesh.js');
const {default:Module}=await import('./vendor/manifold-3.5.4/manifold.js'),wasm=await Module();wasm.setup();
const geometry={naca:'0020',semiSpan:130,rootChord:160,tipChord:80,skin:.8,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:3};
const half=await P.build({geometry},wasm),full=await P.build({geometry,fullWing:true},wasm);
assert.equal(full.files.length,1);assert.equal(full.report.maximumPrintedMassG,null);assert.equal(half.report.maximumPrintedMassG,null);assert.equal(full.report.fullWing,true);
assert.ok(Math.abs(full.report.plasticVolumeMm3/half.report.plasticVolumeMm3-2)<1e-4);
assert.ok(Math.abs(full.report.modules[0].sizeMm[1]-260)<.001);
assert.ok(Math.abs(full.report.modules[0].sizeMm[0]-half.report.modules[0].sizeMm[0])<.001);
P.inspectSTL(full.files[0].bytes);
// Compare mirrored serialized vertices in original coordinates, independently of Manifold.
const m=full.report.modules[0],v=new DataView(full.files[0].bytes),points=new Set();
for(let i=0;i<v.getUint32(80,true);i++)for(let k=0;k<3;k++){const p=[0,1,2].map(j=>v.getFloat32(84+50*i+12+12*k+4*j,true)-m.translationMm[j]);points.add(p.map(x=>Math.round(x*1000)).join(','));}
let missed=0;for(const key of points){const p=key.split(',').map(Number);p[1]=-p[1];if(!points.has(p.join(',')))missed++;}
// Boolean triangulation may choose different coplanar subdivision points. Bounds/volume checks remain exact.
assert.ok(missed/points.size<.02,'mirrored surface vertex coverage');
const split=await P.build({geometry:{...geometry,semiSpan:260,modules:2},fullWing:true},wasm);
assert.equal(split.files.length,4);assert.ok(split.report.modules.every(m=>m.sizeMm.every(x=>x<=300.001)));
assert.deepEqual(split.report.modules.map(m=>m.spanBoundsMm),[[-260,-130],[-130,0],[0,130],[130,260]]);
const angled=await P.build({geometry:{...geometry,sweepDeg:15,dihedralDeg:8},fullWing:true},wasm);assert.equal(angled.files.length,1);P.inspectSTL(angled.files[0].bytes);
await assert.rejects(P.build({geometry:{...geometry,semiSpan:180},fullWing:true},wasm),/does not fit/);
console.log('PASS full-wing mirror: watertight joined STL, doubled mass/volume, symmetric coordinates, four printable modules, oversized full wing rejected.');
