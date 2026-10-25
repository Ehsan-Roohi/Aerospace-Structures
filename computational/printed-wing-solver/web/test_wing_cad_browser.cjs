// Isolated actual Chrome: static course docs, real Worker, kernel and downloads.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.MIE446_PLAYWRIGHT_MODULE||'playwright');
function unzipStored(bytes){const entries=new Map();let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0,'test expects stored ZIP members');const size=bytes.readUInt32LE(offset+18),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+n).toString('utf8'),start=offset+30+n+extra;entries.set(name,bytes.subarray(start,start+size));offset=start+size;}assert.ok(entries.size>0);return entries;}
(async()=>{
 const root=path.resolve(__dirname,'../../../docs'),output=fs.mkdtempSync(path.join(os.tmpdir(),'mie446-browser-cad-'));
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],kernelRequests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',req=>{if(/manifold\.js|\.wasm(?:\?|$)/.test(req.url()))kernelRequests.push(req.url());});
  const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../tests/fixtures/wing_lab_one_piece_browser.json'),'utf8'));fixture.version=2;fixture.projectName='CAD browser validation';Object.assign(fixture.study.geometry,{naca:'0020',semiSpan:130,rootChord:120,tipChord:80,skin:.8,te:.8,cavityEnd:.8,modules:1,rodFractions:[],spars:[],interiorRibs:1,customInteriorRibs:null,airfoil:{kind:'naca4',code:'0020'}});fixture.study.assembly.seamsBonded=true;fixture.study.load={kind:'flight',aircraftMass:1,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false,selfWeight:false,fos:1.5,tipMass:0,tipFraction:.3};
  await page.addInitScript(raw=>{localStorage.setItem('winglab:printed-study:v1',raw);localStorage.removeItem('winglab:print-fit-record');},JSON.stringify(fixture));
  await page.goto(`http://127.0.0.1:${server.address().port}/wing-lab.html#wing`);await page.locator('#runBtn').click();await page.waitForFunction(()=>document.querySelector('#stateChip').textContent.includes('Solved'),null,{timeout:60000});
  for(const format of ['dxf','step','stl']){
   const fullWing=format!=='stl';await page.locator('#wingFullSymmetric').setChecked(fullWing);const before=kernelRequests.length,downloadEvent=page.waitForEvent('download',{timeout:120000});await page.locator('#wingDownload'+format.toUpperCase()).click();
   await page.waitForFunction(()=>document.querySelector('#wingPrintStatus').textContent.startsWith('Ready')||document.querySelector('#wingPrintStatus').dataset.error==='true',null,{timeout:120000});assert.equal(await page.locator('#wingPrintStatus').getAttribute('data-error'),'false',await page.locator('#wingPrintStatus').textContent());
   const download=await downloadEvent,file=path.join(output,download.suggestedFilename());await download.saveAs(file);const bytes=fs.readFileSync(file);assert.ok(bytes.length>1000);
   assert.equal(path.extname(file),format==='dxf'?'.zip':format==='step'?'.step':'.stl');
   const recordEvent=page.waitForEvent('download');await page.getByRole('button',{name:format==='stl'?'Save print record':'Save export record',exact:true}).click();const recordDownload=await recordEvent,recordPath=path.join(output,`${format}-record.json`);await recordDownload.saveAs(recordPath);const record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
   assert.equal(record.exportFormat,format);assert.equal(record.units,'mm');assert.equal(record.fullWing,fullWing);assert.equal(record.sourceStudy.format,'mie446-wing-study');assert.ok(record.files.length>=1);
   const members=format==='dxf'?unzipStored(bytes):new Map([[record.files[0].name,bytes]]);
   for(const item of record.files){assert.ok(/^[0-9a-f]{64}$/.test(item.sha256));const contents=members.get(item.name);assert.ok(contents,'archive contains '+item.name);assert.equal(contents.length,item.bytes);assert.equal(crypto.createHash('sha256').update(contents).digest('hex'),item.sha256,'download hash matches record');}
   if(format==='dxf'){
    assert.ok(members.has('print_record.json'));assert.equal(record.files.filter(f=>f.name.endsWith('.dxf')).length,2);assert.ok([...members].filter(([name])=>name.endsWith('.dxf')).every(([,data])=>data.toString('utf8').includes('$INSUNITS\n70\n4')));assert.equal(kernelRequests.length,before,'DXF export does not import Manifold or WASM');
   }else if(format==='step'){
    const text=bytes.toString('utf8');assert.ok(text.startsWith('ISO-10303-21;'));assert.ok(text.includes('FACETED_BREP('));assert.ok(text.includes('FACE_SURFACE('));assert.equal(record.cad.units,'mm');assert.ok(record.cad.limitations.some(s=>s.includes('parametric')));assert.ok(record.modules[0].sizeMm[1]>259.99);assert.ok(kernelRequests.length>before,'STEP builds the physical mesh with Manifold');
   }else{assert.equal(bytes.length,84+50*bytes.readUInt32LE(80));assert.equal(record.modules.length,1);assert.ok(Math.abs(record.modules[0].sizeMm[1]-130)<.001);}
   console.log(`PASS actual Chrome ${format.toUpperCase()} download, SHA-256 export record, units, fullWing=${fullWing}; bytes=${bytes.length}`);await page.getByRole('button',{name:'Close CAD exporter',exact:true}).click();
  }
  assert.deepEqual(errors,[]);console.log('Browser CAD artifacts:',output);
 }finally{server.closeAllConnections();await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
