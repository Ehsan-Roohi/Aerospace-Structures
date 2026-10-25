import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),CAD=require('./wing_cad_export.js'),P=require('./wing_print_mesh.js');
const output=mkdtempSync(join(tmpdir(),'test-wing-cad-export-')),expected=[];
function checkSTEP(build){const result=CAD.buildSTEP(build);assert.equal(result.files.length,build.files.length);assert.equal(result.report.units,'mm');result.files.forEach((f,i)=>{
  assert.ok(f.text.includes('FACETED_BREP('));assert.ok(f.text.includes('POLY_LOOP('));assert.ok(f.text.includes('CLOSED_SHELL('));assert.ok(!f.text.includes('NaN'));
  const path=join(output,`${expected.length}_${f.name}`);writeFileSync(path,f.bytes);
  const stl=build.files[i].bytes,v=new DataView(stl.buffer||stl,stl.byteOffset||0,stl.byteLength),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let t=0;t<v.getUint32(80,true);t++)for(let k=0;k<3;k++)for(let j=0;j<3;j++){const x=v.getFloat32(84+50*t+12+12*k+4*j,true)-build.report.modules[i].translationMm[j];lo[j]=Math.min(lo[j],x);hi[j]=Math.max(hi[j],x);}
  expected.push({path,volume:P.inspectSTL(stl).volumeMm3,bounds:[...lo,...hi]});
});return result;}
// Minimal tetrahedron exercises the STEP syntax before slow real CAD fixtures.
const points=[[0,0,0],[1,0,0],[0,2,0],[0,0,3]],faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],bytes=new Uint8Array(84+50*faces.length),view=new DataView(bytes.buffer);view.setUint32(80,faces.length,true);faces.forEach((t,i)=>t.forEach((p,k)=>points[p].forEach((x,j)=>view.setFloat32(84+50*i+12+12*k+4*j,x,true))));
checkSTEP({files:[{name:'tetra.stl',bytes:bytes.buffer}],report:{units:'mm',modules:[{translationMm:[0,0,0],volumeMm3:1}]}});
const python=process.env.WING_CAD_PYTHON||(process.platform==='win32'?'C:/Users/roohie/AppData/Local/Temp/mie446-cad-env/Scripts/python.exe':'python3');
function readAll(){const manifest=join(output,'expected.json');writeFileSync(manifest,JSON.stringify(expected));const check=spawnSync(python,[fileURLToPath(new URL('./test_wing_cad_export_reader.py',import.meta.url)),manifest],{encoding:'utf8',timeout:240000,maxBuffer:1024*1024});assert.equal(check.status,0,`Open CASCADE import failed: ${check.error} ${check.stdout}\n${check.stderr}`);console.log(check.stdout.trim());}
if(!process.argv.includes('--prepare-only'))readAll();
if(!process.argv.includes('--syntax-only')){
  const {default:Module}=await import('./vendor/manifold-3.5.4/manifold.js'),wasm=await Module();wasm.setup();
  for(const planform of ['delta','elliptic']){
    const geometry={naca:'0020',planform,semiSpan:80,rootChord:100,tipChord:0,skin:.8,te:.8,modules:planform==='delta'?2:1,rodFractions:[],interiorRibs:1,cap:2},fullWing=planform==='delta',build=await P.build({geometry,fullWing},wasm),step=checkSTEP(build),dxf=CAD.buildDXF({geometry,fullWing});
    assert.equal(step.files.length,fullWing?4:1);assert.ok(dxf.files.length>=2);assert.equal(dxf.report.units,'mm');assert.ok(dxf.files.every(f=>f.text.includes('$INSUNITS\n70\n4')));assert.ok(dxf.files[0].text.includes('PLANFORM_REFERENCE'));assert.ok(dxf.files[1].text.includes('RIB_OUTER'));
    dxf.files.forEach((f,i)=>{const path=join(output,`${planform}_${f.name}`);writeFileSync(path,f.bytes);expected.push({format:'dxf',path,planform:i===0,expectedArea:geometry.rootChord*geometry.semiSpan*(planform==='delta'?.5:Math.PI/4),expectedPolylines:i===0&&fullWing?2:1});});
    console.log(`Prepared real ${planform} ${fullWing?'symmetric modular':'semi-wing'} faceted STEP: ${step.files.length} solids, ${step.files.reduce((n,f)=>n+f.bytes.length,0)} bytes`);
  }
  assert.throws(()=>CAD.buildSTEP({files:[],report:{}}),/validated/);
  if(!process.argv.includes('--prepare-only'))readAll();
}
if(process.argv.includes('--prepare-only')){writeFileSync(join(output,'expected.json'),JSON.stringify(expected));console.log('Prepared fixtures for separate Open CASCADE reader:',join(output,'expected.json'));}
else{rmSync(output,{recursive:true,force:true});console.log('PASS: STEP imported as valid positive-volume Open CASCADE solids with original millimetre dimensions and placement; DXF is explicitly 2D. No smooth/parametric feature reconstruction claimed.');}


