// Actual Chrome: legacy fixed JSON -> explicit auto taper -> solved colours -> JSON roundtrip.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.MIE446_PLAYWRIGHT_MODULE||'playwright'),E=require('./engine.js'),Spars=require('./wing_spars.js');
(async()=>{
 const root=path.resolve(__dirname,'../../..'),docs=path.join(root,'docs'),out=fs.mkdtempSync(path.join(os.tmpdir(),'mie446-auto-spar-browser-'));
 const server=http.createServer((req,res)=>{const file=path.resolve(docs,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(docs+path.sep)){res.writeHead(403).end();return;}try{let bytes=fs.readFileSync(file);if(file.endsWith('.html'))bytes=Buffer.from(bytes.toString().replace('renderer.render(scene, camera);','window.__wingAutoScene=scene;renderer.render(scene, camera);'));res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/wing_lab_one_piece_browser.json'),'utf8'));
  for(const [planform,initialLength,expectedLength]of [['delta',188.9,273.9],['elliptic',354.1,414.1]]){
   const d=structuredClone(fixture);d.version=2;Object.assign(d.study.geometry,{planform,naca:'2412',airfoil:{kind:'naca4',code:'2412'},semiSpan:450,rootChord:160,tipChord:0,skin:1.2,te:1.2,cap:2,cavityStart:.06,cavityEnd:.9,modules:3,rodFractions:[],sweepDeg:0,dihedralDeg:0,interiorRibs:3,spars:[{fraction:.45,length:initialLength,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material:Spars.MAT}]});delete d.study.geometry.stations;delete d.study.geometry.twistEnabled;
   d.study.assembly.seamsBonded=true;d.study.load={kind:'flight',aircraftMass:1,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false,selfWeight:true,tipMass:0,tipFraction:.3,fos:1.5};
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.addInitScript(raw=>localStorage.setItem('winglab:printed-study:v1',raw),JSON.stringify(d));
   await page.goto('http://127.0.0.1:'+server.address().port+'/wing-lab.html#wing');await page.waitForFunction(()=>window.WingLabUI?.result()&&!WingLabUI.isRunning()&&!WingLabUI.isStale(),null,{timeout:60000});
   assert.equal(await page.evaluate(()=>WingLabUI.state().geometry.spars[0].widthMode),undefined,'legacy JSON does not silently acquire auto taper');
   await page.locator('#wingFullSymmetric').check();await page.getByRole('button',{name:'Structure dimensions',exact:true}).click();assert.equal(await page.locator('#ws0_widthMode').inputValue(),'fixed');
   await page.locator('#ws0_longest').click();await page.waitForFunction(()=>WingLabUI.state().geometry.spars[0].widthMode==='auto');
   const applied=await page.evaluate(()=>{const g=WingEngine.makeGeometry(WingLabUI.state().geometry),s=g.spars[0],end=WingEngine.sparParts(g,s.length)[0];return {s,endWidth:end.widths.topWidth,endBottom:end.widths.bottomWidth,rootWidth:WingEngine.sparParts(g,0)[0].widths.topWidth,note:document.querySelector('#ws0_fit').textContent};});
   assert.equal(applied.s.length,expectedLength);assert.equal(applied.s.topWidth,8);assert.equal(applied.s.bottomWidth,8);assert.equal(applied.s.topThickness,.8);assert.equal(applied.s.webThickness,.6);assert.equal(applied.rootWidth,8);assert.equal(applied.endWidth,4);assert.equal(applied.endBottom,4);
   assert.match(applied.note,/counted once, not as additional reinforcement/);assert.match(applied.note,/8\.00\/8\.00 mm.*4\.00\/4\.00 mm/);assert.ok(await page.locator('#ws0_fit').isVisible());
   const preview=await page.evaluate(()=>{
    const scene=window.__wingAutoScene,mirror=scene.getObjectByName('Mirrored full-wing solution'),originals=[];
    scene.traverse(o=>{if(o.userData?.kind!=='spar'||o.userData.memberKind!=='top cap')return;for(let p=o;p;p=p.parent)if(p===mirror)return;originals.push(o);});const m=originals[0],p=m.geometry.attributes.position,a=m.userData.nP,n=m.userData.nS;
    const width=station=>{const v=Array.from({length:a},(_,j)=>p.getZ(station*a+j));return Math.max(...v)-Math.min(...v);};return {root:width(0),end:width(n-1),allFinite:Array.from(p.array).every(Number.isFinite)};
   });assert.ok(preview.allFinite);assert.ok(Math.abs(preview.root-8)<1e-4&&Math.abs(preview.end-4)<1e-4,'actual scene cap geometry tapers from8mm to4mm');
   await page.screenshot({path:path.join(out,planform+'-auto-fit.png')});
   await page.evaluate(()=>WingLabUI.solve());await page.waitForFunction(()=>!WingLabUI.isRunning()&&!WingLabUI.isStale(),null,{timeout:60000});assert.equal(await page.evaluate(()=>WingLabUI.result().analysis3D.stressOnly),true);
   await page.keyboard.press('Escape');await page.locator('#app [data-plot="stress"]').first().click();
   const colours=await page.evaluate(()=>{
    const scene=window.__wingAutoScene,mirror=scene.getObjectByName('Mirrored full-wing solution'),sources=[],copies=[];scene.traverse(o=>{if(!o.isMesh||o.userData.kind!=='skin')return;let mirrored=false;for(let p=o;p;p=p.parent)if(p===mirror)mirrored=true;(mirrored?copies:sources).push(o);});
    const source=sources.find(o=>o.material.type==='MeshBasicMaterial'),copy=copies.find(o=>o.geometry===source?.geometry),c=source?.geometry.attributes.color;return {field:source?.material.type,variation:c?new Set(Array.from(c.array,x=>x.toFixed(5))).size:0,sameMaterial:copy?.material===source?.material,hiddenMotion:WingLabUI.result().deflection.every(Number.isNaN)};
   });assert.equal(colours.field,'MeshBasicMaterial');assert.ok(colours.variation>2,'solved stress colours vary');assert.equal(colours.sameMaterial,true,'mirrored half uses actual current field material');assert.equal(colours.hiddenMotion,true,'no substituted deformation for stress-only study');
   const roundtrip=await page.evaluate(()=>{const text=WingStudyIO.exportPrintedStudy(WingLabUI.state(),WingEngine),opened=WingStudyIO.importPrintedStudy(text,WingEngine);return {text,ok:opened.ok,errors:opened.errors,spec:opened.state?.geometry.spars[0]};});assert.equal(roundtrip.ok,true,JSON.stringify(roundtrip.errors));assert.equal(roundtrip.spec.widthMode,'auto');assert.equal(roundtrip.spec.length,expectedLength);assert.equal(roundtrip.spec.topWidth,8);
   await page.evaluate(text=>{WingLabUI.studyFiles().openText(text,'auto-taper-roundtrip.json');document.querySelector('#wingStudyFiles .wio-apply').click();},roundtrip.text);assert.equal(await page.evaluate(()=>WingLabUI.state().geometry.spars[0].widthMode),'auto');
   assert.deepEqual(errors,[]);console.log('PASS actual Chrome auto taper, tapered scene, stress colours and JSON:',planform,initialLength+' -> '+expectedLength+' mm');await page.close();
  }console.log('Artifacts:',out);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
