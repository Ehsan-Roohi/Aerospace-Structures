// Run Node to prepare files, then the independent Python reader on the printed
// manifest path. This also works where sandbox policy forbids child processes.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const require=createRequire(import.meta.url),CAD=require('./wing_cad_export.js'),directory=mkdtempSync(join(tmpdir(),'test-wing-dxf-')),expected=[];
for(const planform of ['delta','elliptic','linear']){
 const rodFractions=planform==='linear'?[.3,.6]:[],geometry={planform,naca:'0020',semiSpan:130,rootChord:160,tipChord:planform==='linear'?100:0,skin:.8,te:.8,modules:1,rodFractions,interiorRibs:2},snapshot=JSON.stringify(geometry),r=CAD.buildDXF({geometry,fullWing:true});
 assert.equal(JSON.stringify(geometry),snapshot);assert.equal(r.files.length,3);assert.ok(r.report.limitations.some(s=>s.includes('2D')));
 r.files.forEach((f,i)=>{const path=join(directory,`${planform}_${f.name}`);writeFileSync(path,f.bytes);expected.push({format:'dxf',path,planform:i===0,expectedArea:130*(planform==='delta'?80:planform==='elliptic'?160*Math.PI/4:130),expectedPolylines:i===0?2:1,expectedHoleRatios:i===0?[]:rodFractions.map(fraction=>130/Math.hypot(130,60*fraction)),holeRadius:2.25});});
}
const manifest=join(directory,'expected.json');writeFileSync(manifest,JSON.stringify(expected));console.log('DXF fixtures:',manifest);
