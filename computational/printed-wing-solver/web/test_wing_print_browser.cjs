// Actual Chrome, local static site, Web Worker, WASM and browser downloads.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.MIE446_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'../../../docs'),out=fs.mkdtempSync(path.join(os.tmpdir(),'mie446-browser-print-'));
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../tests/fixtures/wing_lab_one_piece_browser.json'),'utf8'));
  for(const mode of [...(process.env.MIE446_ONLY_FULL?['full']:['single','modules','full','oversize'])]){
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const d=structuredClone(fixture);d.version=2;d.projectName='Print '+mode;
   Object.assign(d.study.geometry,{naca:'0020',semiSpan:mode==='full'?130:mode==='single'?260:450,rootChord:180,tipChord:80,skin:.8,cavityEnd:.8,modules:mode==='modules'?3:1,rodFractions:[],spars:[],airfoil:{kind:'naca4',code:'0020'}});
   if(mode==='modules'){delete d.study.geometry.airfoil;Object.assign(d.study.geometry,{naca:'0012',rootChord:160,tipChord:160,rodFractions:[.3]});}
   d.study.assembly.seamsBonded=true;d.study.load={kind:'flight',aircraftMass:1,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false,selfWeight:true,fos:1.5,tipMass:0,tipFraction:.3};
   await page.addInitScript(raw=>{localStorage.setItem('winglab:printed-study:v1',raw);localStorage.removeItem('winglab:print-fit-record');},JSON.stringify(d));
   await page.goto('http://127.0.0.1:'+server.address().port+'/wing-lab.html#wing');await page.locator('#runBtn').click();await page.waitForFunction(()=>document.querySelector('#stateChip').textContent.includes('Solved'),{timeout:45000});
   if(mode==='full'){await page.locator('#wingFullSymmetric').check();await page.waitForTimeout(300);assert.equal(await page.locator('#wingSymmetryNote').isVisible(),true);assert.ok((await page.locator('#stateChip').textContent()).includes('Solved'),'symmetry is a view/export choice, not an input error');await page.screenshot({path:path.join(out,'full-wing-preview.png')});}
   const downloads=[];page.on('download',f=>downloads.push(f));const firstDownload=mode==='oversize'?null:page.waitForEvent('download',{timeout:45000});await page.locator('#wingDownloadSTL').click();
   if(mode==='modules'){await page.locator('#wingPrintFitReference').fill('automated synthetic coupon fixture');await page.locator('#wingPrintFitConfirmed').check();await page.getByRole('button',{name:'Confirm fit record & build STL',exact:true}).click();}
   if(mode==='oversize'){
    await page.waitForFunction(()=>document.querySelector('#wingPrintStatus').dataset.error==='true',{timeout:30000});assert.match(await page.locator('#wingPrintStatus').innerText(),/does not fit/);assert.equal(downloads.length,0);
   }else{
    await page.waitForFunction(()=>document.querySelector('#wingPrintStatus').textContent.startsWith('Ready'),{timeout:30000});await firstDownload;assert.equal(downloads.length,1);const file=path.join(out,downloads[0].suggestedFilename());await downloads[0].saveAs(file);
    assert.ok(fs.statSync(file).size>1000);assert.equal(path.extname(file),mode==='modules'?'.zip':'.stl');
    const recordEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Save print record',exact:true}).click();const record=await recordEvent,recordFile=path.join(out,record.suggestedFilename());await record.saveAs(recordFile);const report=JSON.parse(fs.readFileSync(recordFile,'utf8'));assert.equal(report.units,'mm');assert.equal(report.modules.length,mode==='modules'?3:1);assert.ok(report.modules.every(m=>/^[0-9a-f]{64}$/.test(m.sha256)));assert.equal(report.sourceStudy.format,'mie446-wing-study');
    if(mode==='modules')assert.equal(report.fitRecord.tested,true);if(mode==='full'){assert.equal(report.fullWing,true);assert.ok(Math.abs(report.modules[0].sizeMm[1]-260)<.001);}
    if(mode==='single'||mode==='full'){await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'phone view must not overflow');}
   }
   assert.deepEqual(errors,[]);console.log('PASS browser STL',mode);await page.close();
  }
  console.log('Browser test artifacts:',out);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
