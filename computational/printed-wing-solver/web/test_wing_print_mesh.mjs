// Real WASM Boolean solids and serialized STL; no renderer/CSG stand-ins.
import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),P=require('./wing_print_mesh.js');
const {default:Module}=await import('./vendor/manifold-3.5.4/manifold.js'),wasm=await Module();wasm.setup();
const base={naca:'0020',semiSpan:260,rootChord:180,tipChord:80,skin:.8,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:3};
const fit={tested:true,reference:'automated synthetic test fixture',rodDiameter:4,clearance:.25,sleeveWall:1.2};
const spar={fraction:.35,length:260,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material:{name:'PLA',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10}};
for(const planform of ['linear','elliptic','delta'])for(const reinforced of [false,true]){
 const geometry={...base,planform,spars:reinforced?[spar]:[]},before=JSON.stringify(geometry),r=await P.build({geometry},wasm);
 assert.equal(JSON.stringify(geometry),before,'print construction cannot modify the live input');assert.equal(r.files.length,1);assert.ok(r.report.printedMassG>0&&r.report.printedMassG<300);
 const check=P.inspectSTL(r.files[0].bytes);assert.equal(check.triangles,r.report.modules[0].triangles);assert.ok(Math.abs(check.volumeMm3-r.report.plasticVolumeMm3)<1e-5);
 console.log('PASS STL',planform,reinforced?'with spar':'shell/ribs',r.report.elapsedMs+' ms');
}
const twisted=await P.build({geometry:{...base,rootChord:160,tipChord:120,sweepDeg:15,dihedralDeg:8,sweepReferenceFraction:.25,twistEnabled:true,stations:[{eta:0,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:2},{eta:1,airfoil:{kind:'naca4',code:'0012'},incidenceDeg:0}]}},wasm);assert.ok(twisted.files[0].bytes.byteLength>1000);
const rodGeometry={...base,naca:'0012',rootChord:160,tipChord:160,semiSpan:260,rodFractions:[.3]},rod=await P.build({geometry:rodGeometry,fitRecord:fit},wasm);
// Independent ray/triangle parity tests verify the bore is empty, sleeve and
// skin are material, and the hollow cavity remains empty away from a rib.
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function inside(point){const v=new DataView(rod.files[0].bytes),d=[1,.123,.789],hits=[];for(let t=0;t<v.getUint32(80,true);t++){const p=[0,1,2].map(k=>[0,1,2].map(j=>v.getFloat32(84+50*t+12+12*k+4*j,true))),e1=sub(p[1],p[0]),e2=sub(p[2],p[0]),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)continue;const s=sub(point,p[0]),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e1),w=dot(d,q)/det;if(w<0||u+w>1)continue;const distance=dot(e2,q)/det;if(distance>1e-7)hits.push(distance);}hits.sort((a,b)=>a-b);return hits.filter((x,i)=>!i||Math.abs(x-hits[i-1])>1e-6).length%2===1;}
const offset=rod.report.modules[0].translationMm,at=p=>p.map((x,i)=>x+offset[i]),y=123.456;
assert.equal(inside(at([48,y,0])),false,'actual rod hole must be empty');assert.equal(inside(at([50.85,y,0])),true,'printed sleeve annulus must remain');assert.equal(inside(at([80,y,0])),false,'wing cavity remains hollow');
const upper=E.verticalOrdinates('0012',.3,160,1.2).upper;assert.equal(inside(at([48,y,upper-.4])),true,'skin wall remains material');
const modules=await P.build({geometry:{...rodGeometry,semiSpan:450,modules:3},fitRecord:fit},wasm);assert.equal(modules.files.length,3);assert.ok(modules.report.modules.every(m=>m.sizeMm.every(x=>x<=300.001)));
await assert.rejects(P.build({geometry:rodGeometry},wasm),/physical rod-fit/);
await assert.rejects(P.build({geometry:{...base,skin:.3}},wasm),/0.8 mm/);
await assert.rejects(P.build({geometry:{...base,semiSpan:450}},wasm),/does not fit/);
const heavy=await P.build({geometry:base,density:10},wasm);assert.ok(heavy.report.printedMassG>300);assert.equal(heavy.report.maximumPrintedMassG,null);assert.ok(P.inspectSTL(heavy.files[0].bytes).volumeMm3>0);
await assert.rejects(P.build({geometry:{...base,spars:[spar]},shellMaterial:{E:3000,nu:.35,rho:1.24,ft:15,fc:50,fs:10}},wasm),/same material/);
const corrupted=rod.files[0].bytes.slice(0);new DataView(corrupted).setFloat32(96,NaN,true);assert.throws(()=>P.inspectSTL(corrupted),/Non-finite/);
const opened=rod.files[0].bytes.slice(0,-50),header=new DataView(opened);header.setUint32(80,header.getUint32(80,true)-1,true);assert.throws(()=>P.inspectSTL(opened),/watertight/);
console.log('PASS: real STL topology, bore/sleeve/cavity/skin ray probes, 3-module conservation, physical-fit gate, material/nozzle/printer rejection, heavy-wing export, and corrupt/open STL rejection.');
