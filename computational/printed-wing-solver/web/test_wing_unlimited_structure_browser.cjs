// Same real DOM exercise in Chrome and installed Firefox, each with an isolated profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),cp=require('node:child_process');
const {chromium}=require(process.env.MIE446_PLAYWRIGHT_MODULE||'playwright'),E=require('./engine.js'),IO=require('./wing_study_io.js'),Print=require('./wing_print_mesh.js');
const root=path.resolve(__dirname,'../../..'),docs=path.join(root,'docs'),out=fs.mkdtempSync(path.join(os.tmpdir(),'mie446-unlimited-structure-'));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/wing_lab_one_piece_browser.json'),'utf8'));
fixture.version=2;Object.assign(fixture.study.geometry,{naca:'0020',semiSpan:260,rootChord:240,tipChord:220,skin:3,te:3,ribThickness:3,modules:1,interiorRibs:3,customInteriorRibs:null,rodFractions:[]});
const base=fixture.study.geometry.spars[0];fixture.study.geometry.spars=[.25,.5].map(fraction=>({...base,fraction,length:260}));
fixture.study.load={kind:'custom',items:[{kind:'point',position:240,force:2,fraction:.3}],fos:1.5,tipMass:0};
async function exercise(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,s)=>{if(!v)throw Error(s)},wait=async(fn,label,ms=180000)=>{const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('Timeout: '+label);await pause(50)}};
 const downloads=[];const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.href.startsWith('blob:')){const name=this.download;fetch(this.href).then(r=>r.blob()).then(async b=>{downloads.push({name,bytes:b.size,text:name.endsWith('.json')?await b.text():null})});}return click.call(this)};
 try{
  await wait(()=>window.WingLabUI&&!WingLabUI.isRunning(),'initial app');window.confirm=()=>true;
  document.querySelector('[data-wing-action="structure"]').click();
  check(!document.querySelector('#wgRibCount').hasAttribute('max'),'no rib count max attribute');
  document.querySelector('#wgRibCount').value='20';document.querySelector('#wgRibEqual').click();
  check(WingLabUI.state().geometry.interiorRibs===20,'twenty evenly spaced ribs applied');
  document.querySelector('#wgRibCount').value='20.5';document.querySelector('#wgRibEqual').click();
  check(WingLabUI.state().geometry.interiorRibs===20,'fractional count rejected without truncation');
  document.querySelector('#wgRibCount').value='-1';document.querySelector('#wgRibEqual').click();
  check(WingLabUI.state().geometry.interiorRibs===20,'negative count rejected');
  document.querySelector('#wgRibCount').value='20';document.querySelector('#wgRibEqual').click();
  const added=document.querySelector('#wsAdd').onclick(.75);check(added.ok,'third spar added through actual form handler');
  check(WingLabUI.state().geometry.spars.length===3,'three spars retained');
  document.querySelector('[data-wing-action="save-json"]').click();await wait(()=>downloads.some(x=>x.name.endsWith('.json')),'saved JSON');
  const saved=downloads.find(x=>x.name.endsWith('.json')),doc=JSON.parse(saved.text);check(doc.study.geometry.spars.length===3&&doc.study.geometry.interiorRibs===20,'saved JSON counts');
  WingLabUI.studyFiles().openText(saved.text,'twenty-ribs-three-spars.json');document.querySelector('#wingStudyFiles .wio-apply').click();
  check(WingLabUI.state().geometry.spars.length===3&&WingLabUI.state().geometry.interiorRibs===20,'reimport retains counts');
  const solveStart=performance.now();await WingLabUI.solve();const solveMs=performance.now()-solveStart;check(!WingLabUI.isStale()&&!WingLabUI.inputError(),'solve succeeded');
  const result=WingLabUI.result();check(result.mass.total>300,'fixture exceeds three hundred grams');check(Array.from(result.deflection).every(Number.isFinite),'finite displacement');check(result.geometry.spars.length===3&&result.ribs.length===20,'solved counts');
  const exportStart=performance.now();document.querySelector('#wingDownloadSTL').click();await wait(()=>document.querySelector('#wingPrintStatus')?.dataset.error==='true'||document.querySelector('#wingPrintStatus')?.textContent.startsWith('Ready'),'actual STL build');
  check(document.querySelector('#wingPrintStatus').dataset.error!=='true',document.querySelector('#wingPrintStatus').textContent);
  await wait(()=>downloads.some(x=>/\.(zip|stl)$/i.test(x.name)),'actual STL download');
  check(window.__structureErrors.length===0,'page errors: '+window.__structureErrors.join(';'));
  await fetch('/result',{method:'POST',body:JSON.stringify({ok:true,userAgent:navigator.userAgent,solveMs,exportMs:performance.now()-exportStart,mass:result.mass.total,ribs:result.ribs.length,spars:result.geometry.spars.length,downloads:downloads.map(({name,bytes})=>({name,bytes})),errors:window.__structureErrors})});
 }catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({ok:false,error:e.message,stack:e.stack,errors:window.__structureErrors})});}
}
let respond;const server=http.createServer((req,res)=>{if(req.url==='/result'){let b='';req.on('data',x=>b+=x);req.on('end',()=>{respond(JSON.parse(b));res.end('ok')});return;}const file=path.resolve(docs,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(docs+path.sep)){res.writeHead(403).end();return;}try{let b=fs.readFileSync(file);if(file.endsWith('.html'))b=Buffer.from(b.toString().replace('<head>','<head><script>localStorage.setItem("winglab:printed-study:v1",'+JSON.stringify(JSON.stringify(fixture))+');window.__structureErrors=[];addEventListener("error",e=>__structureErrors.push(e.message));</script>').replace('</body>','<script>addEventListener("load",'+exercise.toString()+');</script></body>'));res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(b)}catch{res.writeHead(404).end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{for(const kind of ['chrome','firefox']){const dir=path.join(out,kind);fs.mkdirSync(dir);let browser,child,timer;const report=new Promise(r=>respond=r),url='http://127.0.0.1:'+server.address().port+'/wing-lab.html#wing';try{
 if(kind==='chrome'){browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('dialog',d=>d.accept());page.on('download',d=>d.saveAs(path.join(dir,d.suggestedFilename())));await page.goto(url);}
 else{const profile=path.join(dir,'profile');fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'user.js'),['user_pref("browser.download.folderList",2);','user_pref("browser.download.dir",'+JSON.stringify(dir)+');','user_pref("browser.download.useDownloadDir",true);','user_pref("browser.helperApps.neverAsk.saveToDisk","application/zip,application/octet-stream,application/json,model/stl");'].join('\n'));child=cp.spawn(process.env.MIE446_FIREFOX_EXE||'C:/Program Files/Mozilla Firefox/firefox.exe',['--headless','--no-remote','--profile',profile,'--window-size','1440,1000',url],{windowsHide:true,stdio:'ignore'});}
 const r=await Promise.race([report,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(kind+' timed out')),240000))]);console.log(kind,JSON.stringify(r));assert.equal(r.ok,true,r.error);if(kind==='firefox')assert.match(r.userAgent,/Firefox\//);
 const deadline=Date.now()+15000;while(!fs.readdirSync(dir).some(f=>/\.(zip|stl)$/i.test(f))){if(Date.now()>deadline)throw Error(kind+' native download missing');await new Promise(r=>setTimeout(r,100));}
 const saved=fs.readdirSync(dir).find(f=>f.endsWith('.json'));assert.ok(saved,'native JSON download exists');const imported=IO.importPrintedStudy(fs.readFileSync(path.join(dir,saved),'utf8'),E);assert.ok(imported.ok,JSON.stringify(imported.errors));assert.equal(imported.state.geometry.spars.length,3);assert.equal(imported.state.geometry.interiorRibs,20);
 const stl=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith('.stl')))),bytes=stl.buffer.slice(stl.byteOffset,stl.byteOffset+stl.byteLength),solid=Print.inspectSTL(bytes);assert.ok(solid.volumeMm3*1.24/1000>300,'actual watertight solid itself exceeds former mass gate');
 console.log('PASS actual '+kind+': twenty ribs, third spar, JSON roundtrip, finite solve and >300 g native watertight STL download');
 }finally{clearTimeout(timer);await browser?.close();child?.kill();}}console.log('Artifacts:',out)}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
