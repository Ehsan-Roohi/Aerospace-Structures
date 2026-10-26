import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),P=require('./wing_print_mesh.js');
const {default:Module}=await import('./vendor/manifold-3.5.4/manifold.js'),wasm=await Module();wasm.setup();
const material={name:'Integral printed PLA',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10};
const spec=fraction=>({fraction,length:130,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material});
const base={naca:'0020',semiSpan:130,rootChord:160,tipChord:0,skin:.8,te:.8,cavityStart:.12,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:0,customInteriorRibs:[5,53],ribThickness:4,interfaceOffset:5,cap:2,sweepDeg:0,dihedralDeg:0};
for(const planform of ['delta','elliptic']){
 const empty=E.makeGeometry({...base,planform});
 for(const fraction of [.25,.4,.45]){
  const s=spec(fraction),limit=E.closedTipSparLimit(empty,s);
  assert.ok(limit>=20&&limit<E.cavityTipLimit(empty)-empty.cap,'finite runout remains inside hollow region');
  const before=JSON.stringify(s),g=E.makeGeometry({...base,planform,spars:[{...s,length:limit}]});
  assert.equal(JSON.stringify(s),before,'limit discovery does not resize or mutate the spar');
  assert.equal(g.spars[0].topWidth,8);assert.equal(g.spars[0].webThickness,.6);
  for(let k=0;k<=400;k++)assert.equal(E.sparParts(g,limit*k/400).length,1,'actual fixed sections fit through runout');
  assert.throws(()=>E.makeGeometry({...base,planform,spars:[s]}),/finite runout fit limit/);
 }
 assert.throws(()=>E.closedTipSparLimit(empty,{...spec(.25),topWidth:120}),/root cavity/);
 for(const count of [1,2]){
  const spars=[.3,.6].slice(0,count).map(fraction=>({...spec(fraction),length:65})),geometry={...base,planform,spars};
  const r=E.solve({geometry,pla:material,assembly:{seamsBonded:true},load:{kind:'custom',items:[],selfWeight:true},nGrid:25});
  const stl=await P.build({geometry,shellMaterial:material},wasm),mesh=P.inspectSTL(stl.files[0].bytes);
  assert.equal(stl.report.closedTip,true);assert.equal(stl.files.length,1);
  assert.ok(Math.abs(mesh.volumeMm3*material.rho/1000-r.mass.total)<.004*r.mass.total,'physical STL union agrees with stress material union within loft tolerance');
  assert.ok(r.analysis3D.stressOnly,'no artificial deformation/torsion solution');
  assert.throws(()=>E.solve({geometry,pla:{...material,E:3000},load:{kind:'custom',items:[]}}),/same material/);
  await assert.rejects(P.build({geometry,shellMaterial:{...material,E:3000}},wasm),/same material/);
  console.log('PASS closed-tip fixed-dimension finite spar fit and actual STL union:',planform,count,'spar(s)',mesh.volumeMm3);
 }
}
