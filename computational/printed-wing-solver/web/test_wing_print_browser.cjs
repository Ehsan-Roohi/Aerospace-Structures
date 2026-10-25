// Actual Chrome, local static site, Web Worker, WASM and browser downloads.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.MIE446_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'../../../docs'),out=fs.mkdtempSync(path.join(os.tmpdir(),'mie446-browser-print-'));
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json'})[path.extname(file)]||'application/octet-stream');let bytes=fs.readFileSync(file);if(path.extname(file)==='.html')bytes=Buffer.from(bytes.toString('utf8').replace('renderer.render(scene, camera);','window.__wingTestScene=scene;renderer.render(scene, camera);'));res.end(bytes);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../tests/fixtures/wing_lab_one_piece_browser.json'),'utf8'));
  for(const mode of [...(process.env.MIE446_ONLY_CLOSED?['closed-delta','closed-elliptic']:process.env.MIE446_ONLY_FULL?['full']:['single','modules','full','oversize'])]){
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',mode,e.message);});
   const d=structuredClone(fixture);d.version=2;d.projectName='Print '+mode;
   Object.assign(d.study.geometry,{naca:'0020',semiSpan:(mode==='full'||mode.startsWith('closed-'))?130:mode==='single'?260:450,rootChord:180,tipChord:80,skin:.8,cavityEnd:.8,modules:mode==='modules'?3:1,rodFractions:[],spars:[],airfoil:{kind:'naca4',code:'0020'}});
   if(mode==='modules'){delete d.study.geometry.airfoil;Object.assign(d.study.geometry,{naca:'0012',rootChord:160,tipChord:160,rodFractions:[.3]});}
   d.study.assembly.seamsBonded=true;d.study.load={kind:'flight',aircraftMass:1,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false,selfWeight:true,fos:1.5,tipMass:0,tipFraction:.3};
   await page.addInitScript(raw=>{localStorage.setItem('winglab:printed-study:v1',raw);localStorage.removeItem('winglab:print-fit-record');},JSON.stringify(d));
   await page.goto('http://127.0.0.1:'+server.address().port+'/wing-lab.html#wing');await page.locator('#runBtn').click();await page.waitForFunction(()=>document.querySelector('#stateChip').textContent.includes('Solved'),{timeout:45000});
   if(mode.startsWith('closed-')){await page.locator('#wgtPlanform').selectOption(mode.slice(7));assert.equal(await page.locator('#wgtTipChord').inputValue(),'0');await page.locator('#wgtApply').click();await page.waitForTimeout(300);assert.equal(await page.locator('#runBtn').isDisabled(),false);await page.locator('#runBtn').click();await page.waitForFunction(()=>document.querySelector('#stateChip').textContent==='Solved · section stress',{timeout:45000});await page.locator('#app [data-plot=stress]').first().click();assert.equal(await page.locator('#defBtn').isDisabled(),true);assert.equal(await page.locator('#closedStressCharts svg').count(),1);await page.locator('#app [data-view=plan]').first().click();await page.screenshot({path:path.join(out,mode+'.png')});}
   if(mode==='full'){await page.locator('#wingFullSymmetric').check();await page.waitForTimeout(300);assert.equal(await page.locator('#wingSymmetryNote').isVisible(),true);assert.ok((await page.locator('#stateChip').textContent()).includes('Solved'),'symmetry is a view/export choice, not an input error');await page.waitForFunction(()=>window.__wingTestScene?.getObjectByName('Mirrored applied loads')?.children.length>0);
    assert.ok(await page.evaluate(()=>window.__wingTestScene.getObjectByName('Mirrored shear centres').children.length>0),'mirror shear-centre path');
    await page.locator('#shearCentreBtn').click();await page.waitForFunction(()=>window.__wingTestScene.getObjectByName('Mirrored shear centres').children.length===0);
    await page.locator('#shearCentreBtn').click();await page.waitForFunction(()=>window.__wingTestScene.getObjectByName('Mirrored shear centres').children.length>0);
    // The mirror is created before resultMaterial replaces the model material.
    // Matching colour buffers alone missed the stale Phong-material regression.
    for(const plot of ['model','stress','disp','stress']){
      await page.locator('#app [data-plot="'+plot+'"]').first().click();await page.waitForTimeout(100);
      const materials=await page.evaluate(()=>{
        const scene=window.__wingTestScene,mirror=scene.getObjectByName('Mirrored full-wing solution'),originals=[],copies=[];
        scene.traverse(o=>{if(!o.isMesh||o.userData.kind!=='skin')return;let inside=false;for(let p=o;p;p=p.parent)if(p===mirror)inside=true;(inside?copies:originals).push(o);});
        return copies.map(copy=>{const source=originals.find(o=>o.geometry===copy.geometry);return {hasSource:!!source,sameMaterial:copy.material===source?.material,sourceType:source?.material.type,copyType:copy.material.type};});
      });
      assert.ok(materials.length>0,'mirrored skin meshes exist for '+plot);
      assert.ok(materials.every(m=>m.hasSource&&m.sameMaterial&&m.sourceType===m.copyType),'mirror uses the current source geometry and material for '+plot);
      if(plot==='stress')assert.ok(materials.every(m=>m.copyType==='MeshBasicMaterial'),'stress mirror uses the field material');
    }
    await page.locator('#defBtn').click();await page.waitForTimeout(250);
    const reflected=await page.evaluate(()=>{
      const scene=window.__wingTestScene,mirror=scene.getObjectByName('Mirrored full-wing solution');scene.updateMatrixWorld(true);
      const originals=[],copies=[];scene.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;let inside=false;for(let p=o;p;p=p.parent)if(p===mirror)inside=true;(inside?copies:originals).push(o);});
      for(const copy of copies){const source=originals.find(o=>o.geometry===copy.geometry&&o.userData.kind==='skin');if(!source)continue;
        const a=new THREE.Vector3().fromBufferAttribute(source.geometry.attributes.position,20).applyMatrix4(source.matrixWorld),b=new THREE.Vector3().fromBufferAttribute(copy.geometry.attributes.position,20).applyMatrix4(copy.matrixWorld);
        return {visible:mirror.visible,sameColour:copy.geometry.attributes.color===source.geometry.attributes.color,sameMaterial:copy.material===source.material,delta:Math.max(Math.abs(a.x+b.x),Math.abs(a.y-b.y),Math.abs(a.z-b.z))};}
      return null;
    });assert.ok(reflected?.visible&&reflected.sameColour&&reflected.sameMaterial&&reflected.delta<1e-6,'stress colours, material and solved vector motion reflect exactly');
    await page.screenshot({path:path.join(out,'full-wing-preview.png')});}
   const downloads=[];page.on('download',f=>downloads.push(f));const firstDownload=mode==='oversize'?null:page.waitForEvent('download',{timeout:45000});await page.locator('#wingDownloadSTL').click();
   if(mode==='modules'){await page.locator('#wingPrintFitReference').fill('automated synthetic coupon fixture');await page.locator('#wingPrintFitConfirmed').check();await page.getByRole('button',{name:'Confirm fit record & build STL',exact:true}).click();}
   if(mode==='oversize'){
    await page.waitForFunction(()=>document.querySelector('#wingPrintStatus').dataset.error==='true',{timeout:30000});assert.match(await page.locator('#wingPrintStatus').innerText(),/does not fit/);assert.equal(downloads.length,0);
   }else{
    await page.waitForFunction(()=>document.querySelector('#wingPrintStatus').textContent.startsWith('Ready'),{timeout:30000});await firstDownload;assert.equal(downloads.length,1);const file=path.join(out,downloads[0].suggestedFilename());await downloads[0].saveAs(file);
    assert.ok(fs.statSync(file).size>1000);assert.equal(path.extname(file),mode==='modules'?'.zip':'.stl');
    const recordEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Save print record',exact:true}).click();const record=await recordEvent,recordFile=path.join(out,record.suggestedFilename());await record.saveAs(recordFile);const report=JSON.parse(fs.readFileSync(recordFile,'utf8'));assert.equal(report.units,'mm');assert.equal(report.modules.length,mode==='modules'?3:1);assert.ok(report.modules.every(m=>/^[0-9a-f]{64}$/.test(m.sha256)));assert.equal(report.sourceStudy.format,'mie446-wing-study');
    if(mode.startsWith('closed-')){assert.equal(report.closedTip,true);assert.equal(report.geometry.tipChord,0);}if(mode==='modules')assert.equal(report.fitRecord.tested,true);if(mode==='full'){assert.equal(report.fullWing,true);assert.ok(Math.abs(report.modules[0].sizeMm[1]-260)<.001);}
    if(mode==='single'||mode==='full'){await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'phone view must not overflow');}
   }
   assert.deepEqual(errors,[]);console.log('PASS browser STL',mode);await page.close();
  }
  console.log('Browser test artifacts:',out);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
