import fs from 'node:fs';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),G=require('./wing_geometry.js'),P=require('./wing_print_mesh.js'),IO=require('./wing_study_io.js');
const {default:Module}=await import('./vendor/manifold-3.5.4/manifold.js'),wasm=await Module();wasm.setup();
for(const planform of ['delta','elliptic']){
 const geometry={planform,naca:'0020',semiSpan:130,rootChord:160,tipChord:0,skin:.8,modules:1,rodFractions:[],interiorRibs:3},g=E.makeGeometry(geometry);
 assert.equal(G.chordAt(g,130),0);assert.equal(G.area(g),planform==='delta'?10400:130*160*Math.PI/4);
 assert.equal(E.analysisCapability(g,{load:{kind:'custom',items:[]},assembly:{seamsBonded:true}}).mode,'section-stress','actual zero-tip nominal section stress, no substituted nonzero chord');
 const fixture=JSON.parse(fs.readFileSync(new URL('../../../tests/fixtures/wing_lab_one_piece_browser.json',import.meta.url),'utf8'));fixture.version=2;fixture.study.geometry=g;fixture.study.load.items=[];const reopened=IO.importPrintedStudy(JSON.stringify(fixture),E);assert.ok(reopened.ok,JSON.stringify(reopened.errors));assert.equal(reopened.state.geometry.tipChord,0);const again=IO.importPrintedStudy(IO.exportPrintedStudy(reopened.state,E),E);assert.ok(again.ok);assert.equal(again.state.geometry.planform,planform);
 const result=await P.build({geometry},wasm);P.inspectSTL(result.files[0].bytes);
 assert.equal(result.report.closedTip,true);assert.ok(result.report.cavityEndMm<130);
 const v=new DataView(result.files[0].bytes),offset=result.report.modules[0].translationMm;
 let tipCount=0,maxDeviation=0;const projected=[];
 for(let i=0;i<v.getUint32(80,true);i++)for(let k=0;k<3;k++){
  const p=[0,1,2].map(j=>v.getFloat32(84+50*i+12+12*k+4*j,true)-offset[j]);
  projected.push([p[0],p[1]]);if(Math.abs(p[1]-130)<1e-5){tipCount++;assert.ok(Math.abs(p[0]-(planform==='delta'?160:80))<1e-4);assert.ok(Math.abs(p[2])<1e-4);}
  const chord=G.chordAt(g,p[1]),le=G.stationAt(g,p[1]).xLE;
  maxDeviation=Math.max(maxDeviation,le-p[0],p[0]-(le+chord));
 }
 const points=[...new Map(projected.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const lower=[],upper=[];for(const p of points){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of [...points].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}const hull=[...lower.slice(0,-1),...upper.slice(0,-1)],meshArea=Math.abs(hull.reduce((sum,p,i)=>sum+p[0]*hull[(i+1)%hull.length][1]-p[1]*hull[(i+1)%hull.length][0],0))/2;
 assert.ok(Math.abs(meshArea/G.area(g)-1)<.0002,'STL projected outline area matches the true triangle/ellipse, not a trimmed outline');
 assert.ok(tipCount>=3);assert.ok(maxDeviation<.001,'actual STL remains within exact planform');
 const full=await P.build({geometry,fullWing:true},wasm);P.inspectSTL(full.files[0].bytes);assert.ok(Math.abs(full.report.plasticVolumeMm3/result.report.plasticVolumeMm3-2)<1e-4);
 const split=await P.build({geometry:{...geometry,modules:3},fullWing:true},wasm);assert.equal(split.files.length,6);split.files.forEach(f=>P.inspectSTL(f.bytes));
 console.log('PASS exact',planform,'point tip, exact area, watertight STL, solid closure, outline bounds, symmetric full wing',result.report.printedMassG);
}
