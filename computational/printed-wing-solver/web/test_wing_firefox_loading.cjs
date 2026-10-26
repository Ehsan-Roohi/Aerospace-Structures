// Installed Firefox, isolated temporary profile, real app and engines.
// Browser-side DOM actions exercise empty/stale/clear/import/gate/solve paths.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),docs=path.join(root,'docs'),E=require('./engine.js'),IO=require('./wing_study_io.js');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/wing_lab_one_piece_browser.json'),'utf8'));
const actual=process.env.MIE446_FIREFOX_STUDY_JSON?JSON.parse(fs.readFileSync(process.env.MIE446_FIREFOX_STUDY_JSON,'utf8')):fixture;
const imported=IO.importPrintedStudy(JSON.stringify(actual),E);assert.ok(imported.ok,JSON.stringify(imported.errors));
const expectedMass=E.solve(IO.printedEngineInput(imported.state,E)).mass.total;
const empty={...fixture,emptyStudy:true};let respond;
const exercise=`(async()=>{
 const states=[],errors=window.__ffErrors,check=(v,label)=>{if(!v)throw Error(label);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 const snap=label=>{const ld=document.querySelector('#loading'),ui=WingLabUI;const s={label,running:ui.isRunning(),stale:ui.isStale(),empty:ui.state().emptyStudy,hidden:ld.hidden,display:getComputedStyle(ld).display,chip:document.querySelector('#stateChip').textContent};states.push(s);return s;};
 const idle=label=>{const s=snap(label);check(!s.running&&s.hidden&&s.display==='none',label+': inactive loader must be hidden');return s;};
 try{
  await pause(100);idle('fresh empty study');check(WingLabUI.state().emptyStudy,'starts empty');
  const apply=WingLabUI.applyGeometry({semiSpan:260,rootChord:160,tipChord:100,modules:1,rodFractions:[],spars:[]});check(apply.ok,'create regular wing');
  await pause(400);check(idle('regular geometry with auto solve off').stale,'geometry remains stale without auto solve');
  const solve=WingLabUI.solve(),active=snap('regular solve running');check(active.running&&!active.hidden&&active.display!=='none','loader shows during actual regular solve');await solve;check(!idle('regular solved').stale,'regular solved');
  document.querySelector('[data-wing-action="clear"]').click();document.querySelector('#wingClearConfirm').click();await pause(50);check(idle('clear study').empty,'clear leaves empty');
  WingLabUI.studyFiles().openText(${JSON.stringify(JSON.stringify(actual))},'firefox-regression-study.json');document.querySelector('#wingStudyFiles .wio-apply').click();await pause(100);check(idle('JSON applied before solve').stale,'import waits for Solve');
  const t=performance.now(),again=WingLabUI.solve(),busy=snap('imported solve running');check(busy.running&&!busy.hidden&&busy.display!=='none','loader shows during actual imported solve');await again;const importedSolveMs=performance.now()-t;check(!idle('imported solved').stale,'imported study solved');
  const mass=WingLabUI.result().mass.total;check(Math.abs(mass-${expectedMass})<1e-7*Math.max(1,${expectedMass}),'Firefox result matches independent Node solve');
  WingLabUI.studyFiles().previewParameters(WingStudyIO.parameterTemplateText(),'outer-geometry.json');document.querySelector('#wingStudyFiles .wio-apply-geometry').click();await pause(50);check(WingLabUI.importGate()?.open,'outer geometry gate open');await WingLabUI.solve();check(idle('blocked import gate').chip==='Analysis blocked','gate stays blocked without loader');
  check(errors.length===0,'no page errors: '+errors.join(';'));await fetch('/firefox-test-result',{method:'POST',body:JSON.stringify({ok:true,userAgent:navigator.userAgent,states,mass,importedSolveMs,errors})});
 }catch(e){await fetch('/firefox-test-result',{method:'POST',body:JSON.stringify({ok:false,error:e.message,stack:e.stack,states,errors})});}
})();`;
const server=http.createServer((req,res)=>{
 if(req.url==='/firefox-test-result'){let body='';req.on('data',b=>body+=b);req.on('end',()=>{respond(JSON.parse(body));res.end('ok');});return;}
 const file=path.resolve(docs,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(docs+path.sep)){res.writeHead(403).end();return;}
 try{let bytes=fs.readFileSync(file);if(file.endsWith('.html')){const pre='<script>localStorage.setItem("winglab:printed-study:v1",'+JSON.stringify(JSON.stringify(empty))+');window.__ffErrors=[];addEventListener("error",e=>__ffErrors.push(e.message));</script>';bytes=Buffer.from(bytes.toString().replace('<head>','<head>'+pre).replace('</body>','<script>addEventListener("load",()=>{'+exercise+'});</script></body>'));}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mie446-firefox-loading-'));let child,timer;
 try{const reportPromise=new Promise(r=>respond=r);child=cp.spawn(process.env.MIE446_FIREFOX_EXE||'C:/Program Files/Mozilla Firefox/firefox.exe',['--headless','--no-remote','--profile',profile,'--window-size','1440,1000','http://127.0.0.1:'+server.address().port+'/wing-lab.html#wing'],{windowsHide:true,stdio:'ignore'});const report=await Promise.race([reportPromise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Firefox regression timed out')),90000))]);console.log(JSON.stringify(report,null,2));assert.equal(report.ok,true,report.error);assert.match(report.userAgent,/Firefox\//);console.log('PASS actual Firefox: initially hidden loader, stale geometry without auto solve, active solves only, clear, JSON import/solve, and blocked outer-geometry gate.');
 }finally{clearTimeout(timer);child?.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
