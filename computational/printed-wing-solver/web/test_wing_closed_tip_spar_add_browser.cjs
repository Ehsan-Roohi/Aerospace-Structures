// Actual Chrome and current built app. Fixed-width integral spar insertion.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MIE446_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'../../../docs'),server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../tests/fixtures/wing_lab_one_piece_browser.json'),'utf8'));
  for(const planform of ['delta','elliptic']){
   const d=structuredClone(fixture);d.version=2;Object.assign(d.study.geometry,{planform,naca:'0020',airfoil:{kind:'naca4',code:'0020'},twistEnabled:false,semiSpan:130,rootChord:160,tipChord:0,skin:.8,te:.8,modules:1,rodFractions:[],spars:[],sweepDeg:0,dihedralDeg:0,interiorRibs:0});delete d.study.geometry.stations;
   d.study.assembly.seamsBonded=true;d.study.load={kind:'custom',items:[],selfWeight:true,tipMass:0,fos:1.5};
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.addInitScript(raw=>localStorage.setItem('winglab:printed-study:v1',raw),JSON.stringify(d));
   await page.goto('http://127.0.0.1:'+server.address().port+'/wing-lab.html#wing');await page.waitForFunction(()=>window.WingLabUI?.state().geometry.tipChord===0);
   await page.getByRole('button',{name:'Structure dimensions',exact:true}).click();await page.locator('#wsAdd').click();
   await page.waitForFunction(()=>window.WingLabUI.state().geometry.spars.length===1);
   const state=await page.evaluate(()=>{
    const s=WingLabUI.state(),input=WingStudyIO.printedEngineInput(s,WingEngine),spec=s.geometry.spars[0],g=WingEngine.makeGeometry(s.geometry);
    return {spec,limit:WingEngine.closedTipSparLimit(g,spec),shell:input.pla,note:document.querySelector('[data-closed-spar-limit]')?.textContent};
   });
   assert.ok(state.spec.length>=20&&state.spec.length<state.limit&&state.limit<130,'explicit finite runout');
   assert.match(state.note,/Finite spar length.*maximum fit length/);assert.equal(state.spec.topWidth,8);assert.equal(state.spec.webThickness,.6);
   for(const key of ['E','nu','rho','ft','fc','fs'])assert.equal(state.spec.material[key],state.shell[key]);
   await page.evaluate(()=>WingLabUI.solve());await page.waitForFunction(()=>!WingLabUI.isRunning()&&!WingLabUI.isStale(),{timeout:45000});
   assert.equal(await page.evaluate(()=>WingLabUI.result().analysis3D.stressOnly),true);assert.deepEqual(errors,[]);
   console.log('PASS actual Chrome closed-tip default finite spar addition and solve:',planform,state.spec.length,'mm');await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
