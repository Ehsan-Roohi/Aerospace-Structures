// Real Chrome regression: available section moments remain accessible for exact tips.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.MIE446_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const docs=path.resolve(__dirname,'../../../docs'),out=fs.mkdtempSync(path.join(os.tmpdir(),'mie446-more-results-'));
 const original=JSON.parse(fs.readFileSync(process.env.MIE446_BENDING_STUDY_JSON||'C:/Users/roohie/Downloads/mie446-printed-wing-study-2026-10-25(4).json','utf8'));
 const ellipse=structuredClone(original);ellipse.version=2;delete ellipse.study.geometry.stations;delete ellipse.study.geometry.twistEnabled;
 Object.assign(ellipse.study.geometry,{planform:'elliptic',naca:'0020',airfoil:{kind:'naca4',code:'0020'},semiSpan:130,rootChord:160,tipChord:0,skin:.8,te:.8,modules:1,rodFractions:[],spars:[],interiorRibs:0,customInteriorRibs:null});
 ellipse.study.assembly.seamsBonded=true;ellipse.study.load={kind:'custom',items:[{kind:'distributed',start:0,end:130,qStart:.01,qEnd:.01,fraction:.25}],selfWeight:false,tipMass:0,fos:1.5};
 const legacy=structuredClone(ellipse);Object.assign(legacy.study.geometry,{planform:'linear',tipChord:100,semiSpan:260});delete legacy.study.geometry.airfoil;legacy.study.load.items[0].end=260;
 const server=http.createServer((req,res)=>{const file=path.resolve(docs,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(docs+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({channel:'chrome',headless:true});for(const [name,doc]of [['delta',original],['ellipse',ellipse],['legacy',legacy]]){
  const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(raw=>{localStorage.setItem('winglab:printed-study:v1',raw);window.__pngText=[];const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...a){window.__pngText.push(String(t));return f.call(this,t,...a);};},JSON.stringify(doc));
  await page.goto('http://127.0.0.1:'+server.address().port+'/wing-lab.html#wing');await page.waitForFunction(()=>window.WingLabUI?.result()&&!WingLabUI.isRunning()&&!WingLabUI.isStale(),null,{timeout:60000});
  assert.equal(await page.locator('#wingMoreResults').isDisabled(),false);assert.equal(await page.locator('#app [data-plot="disp"]').first().innerText(),'Displacement');
  const closed=name!=='legacy',spatial=await page.evaluate(()=>!!WingLabUI.result().analysis3D);
  for(const v of ['fos','mode'])assert.equal(await page.locator('#wingMoreResults option[value="'+v+'"]').isDisabled(),spatial);
  assert.equal(await page.locator('#wingMoreResults option[value="twist"]').isDisabled(),closed);
  assert.equal(await page.locator('#shearCentreBtn').isDisabled(),closed);
  if(closed){assert.match(await page.locator('#wingMoreResultsNote').innerText(),/Twist.*modes.*unavailable.*centroid.*unresolved/);assert.ok(await page.locator('#wingMoreResults option[value="twist"]').getAttribute('title'));}
  const mechanicsBefore=await page.evaluate(()=>{const r=WingLabUI.result();return JSON.stringify({M:Array.from(r.M),T:Array.from(r.T),mass:r.mass});});
  for(const kind of ['bending','torque']){
   await page.locator('#wingMoreResults').selectOption(kind);await page.waitForTimeout(100);
   assert.match(await page.locator('#legendTitle').innerText(),kind==='bending'?/Resultant bending moment.*N·m/:closed?/Span-axis moment \(centroid\).*N·m/:/Signed local torque.*N·m/);
   const ticks=await page.locator('#legend .ticks span').allTextContents();assert.ok(ticks.length&&ticks.every(x=>Number.isFinite(Number(x))),'actual moment legend numbers');
  }
  if(closed){assert.equal(await page.evaluate(()=>WingLabUI.result().twist.every(Number.isNaN)),true);
   await page.locator('#wingContourOptions summary').click();const pending=page.waitForEvent('download');await page.locator('#wrImage').click();const dl=await pending;await dl.saveAs(path.join(out,name+'-centroid-moment.png'));
   assert.ok((await page.evaluate(()=>__pngText)).some(t=>/Span-axis moment about section centroid.*shear-centre torque unresolved/.test(t)));
  }
  assert.equal(await page.evaluate(()=>{const r=WingLabUI.result();return JSON.stringify({M:Array.from(r.M),T:Array.from(r.T),mass:r.mass});}),mechanicsBefore,'changing result fields preserves mechanics');
  await page.screenshot({path:path.join(out,name+'.png')});assert.deepEqual(errors,[]);console.log('PASS Chrome More results:',name);await page.close();
 }console.log('Artifacts:',out);}finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
