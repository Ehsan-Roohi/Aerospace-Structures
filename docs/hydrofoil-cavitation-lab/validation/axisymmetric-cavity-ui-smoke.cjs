'use strict';
// Controller/DOM and real worker-protocol integration. This does not claim
// visual acceptance in the user's interactive Chrome or Firefox session.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..');
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||path.join(repo,'.review-js','node_modules','jsdom'));
const C=require('../axisymmetric-cavity.js');
const html=fs.readFileSync(path.join(root,'axisymmetric-cavity.html'),'utf8');
const dom=new JSDOM(html,{url:'https://example.test/axisymmetric-cavity.html',runScripts:'outside-only'});
const w=dom.window,$=id=>w.document.getElementById(id),checks=[],downloads=[],blobs=new Map(),workers=[];
function check(name,fn){fn();checks.push({name,passed:true});}
w.AxisymmetricCavity=C;w.Blob=Blob;
let blobIndex=0;
w.URL.createObjectURL=blob=>{const key='blob:test-'+blobIndex++;blobs.set(key,blob);return key;};
w.URL.revokeObjectURL=()=>{};
w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)});};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
class RealWorkerHarness{
 constructor(url){assert.equal(url,'axisymmetric-cavity-worker.js');this.queue=[];this.dead=false;this.messages=[];workers.push(this);const that=this;
  const sandbox={console,Date,Math,Float64Array,setTimeout:fn=>{that.queue.push(fn);},postMessage:message=>{that.messages.push(message);that.onmessage?.({data:message});}};
  sandbox.self=sandbox;this.context=vm.createContext(sandbox);
  sandbox.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),that.context,{filename:file}));
  vm.runInContext(fs.readFileSync(path.join(root,url),'utf8'),this.context,{filename:url});
 }
 postMessage(data){this.context.onmessage({data:JSON.parse(JSON.stringify(data))});}
 terminate(){this.dead=true;this.queue=[];}
 flush(){let count=0;while(this.queue.length&&!this.dead){assert.ok(count++<5000);this.queue.shift()();}}
}
w.Worker=RealWorkerHarness;
w.eval(fs.readFileSync(path.join(root,'axisymmetric-cavity-app.js'),'utf8'));
function submit(){$('settings').dispatchEvent(new w.Event('submit',{cancelable:true}));return workers.at(-1);}
async function open(data){Object.defineProperty($('file'),'files',{value:[{size:1000,text:async()=>JSON.stringify(data)}],configurable:true});await $('file').onchange();}
async function main(){
 check('default inverse problem: 32 bands, full L/R 8, radius .05m, speed 5m/s; sigma and ambient not inputs',()=>{assert.equal($('panels').value,'32');assert.equal($('lengthRatio').value,'8');assert.equal($('radius').value,'0.05');assert.equal($('speed').value,'5');assert.equal(w.document.querySelector('input[id="sigma"],input[id="ambientPressure"]'),null);assert.equal($('results').hidden,true);});
 const running=submit();
 check('actual worker gives visible progress and permits cancel',()=>{assert.equal($('cancel').disabled,false);assert.equal($('solve').disabled,true);assert.equal($('status').dataset.state,'running');assert.equal($('progress').hidden,false);assert.match($('status').textContent,/Shape iteration/);});
 running.flush(); const r=running.messages.find(m=>m.type==='result').result;
 check('actual source-ring default result remains offgrid-unresolved, not accepted or validated',()=>{assert.equal(r.status,'collocation-converged-offgrid-unresolved');assert.equal(r.diagnostics.accuracyQualified,false);assert.equal($('results').hidden,false);assert.match($('status').textContent,/off-grid accuracy NOT PASSED/);assert.match($('status').textContent,/not an accepted/);assert.equal($('offgridGate').textContent,'Off-grid accuracy: NOT PASSED');assert.equal($('experimentalGate').textContent,'Experimental validation: NOT PERFORMED');assert.equal($('diagnosticValues').open,false);assert.match($('diagnosticValues').textContent,/not accepted physical predictions/);assert.equal(w.document.querySelectorAll('.metrics,.metric').length,0);});
 check('true SI geometry and physical/image distinctions, Cp plus all quarter-band residuals are plotted',()=>{assert.match($('geometry').textContent,/Full disk separation L=0.4 m/);assert.match($('geometry').textContent,/Physical front disk/);assert.match($('geometry').textContent,/Image disk/);assert.match($('pressure').textContent,/Physical front disk/);assert.match($('pressure').textContent,/Artificial image disk/);assert.match($('residual').textContent,/64 independent samples/);assert.equal($('residual').querySelectorAll('circle').length,128);assert.match($('residual').textContent,/No endpoint samples are deleted/);assert.equal($('pressure').querySelectorAll('svg').length,2);});
 $('save').click();const saved=JSON.parse(await downloads.at(-1).blob.text());
 check('saved JSON preserves inputs and explicit diagnostic result/evidence status',()=>{assert.equal(saved.schema,'axisymmetric-cavity-case');assert.equal(saved.inputs.panels,32);assert.equal(saved.evidence.experimentalValidation,'NOT_PERFORMED');assert.equal(saved.diagnosticResult.status,'collocation-converged-offgrid-unresolved');});
 $('csv').click();const csv=await downloads.at(-1).blob.text(),off=csv.split('\n').filter(row=>row.startsWith('independent-quarter-band,'));
 check('diagnostic CSV includes every offgrid point in metres, and computation/external status',()=>{assert.match(csv,/# RESEARCH DIAGNOSTIC ONLY/);assert.match(csv,/# experimental_validation=NOT_PERFORMED/);assert.equal(off.length,64);const maxX=Math.max(...off.map(row=>Number(row.split(',')[1])));assert.ok(maxX>.39&&maxX<.4);assert.equal(off[0].split(',').at(-1),r.status);});
 $('figures').click();const figures=await downloads.at(-1).blob.text();
 check('exported figures carry unresolved/offgrid/experimental status and all five profile SVGs',()=>{assert.match(figures,/Off-grid accuracy: NOT PASSED/);assert.match(figures,/Experimental validation: NOT PERFORMED/);assert.match(figures,/collocation-converged-offgrid-unresolved/);assert.equal((figures.match(/<svg /g)||[]).length,5);});
 await open(saved);
 check('import restores only inputs; saved diagnostic result never becomes fresh accepted prediction',()=>{assert.equal($('results').hidden,true);assert.equal($('csv').disabled,true);assert.match($('status').textContent,/not restored as fresh predictions/);});
 const again=submit();$('cancel').click();again.onmessage({data:{type:'result',result:r}});
 check('cancel terminates worker and late callbacks cannot revive a result',()=>{assert.equal(again.dead,true);assert.equal($('cancel').disabled,true);assert.equal($('results').hidden,true);assert.match($('status').textContent,/cancelled/);});
 await open({...saved,inputs:{...saved.inputs,sigma:.3}});
 check('overconstrained sigma import is rejected visibly and cannot reuse prior result',()=>{assert.equal($('errorDialog').open,true);assert.match($('errorMessage').textContent,/not independent inputs/);assert.equal($('results').hidden,true);});$('dismiss').click();
 await open(saved);$('maxIterations').value='1';$('maxIterations').dispatchEvent(new w.Event('input'));const rejected=submit();rejected.flush();
 check('iteration-rejected case has diagnostic-only profiles and collapsed trial numbers',()=>{assert.match($('status').textContent,/did not converge/);assert.match($('diagnosticLabel').textContent,/rejected-iteration/);assert.equal($('diagnosticValues').open,false);assert.equal($('offgridGate').textContent,'Off-grid accuracy: NOT PASSED');});
 $('radius').value='.1';$('radius').dispatchEvent(new w.Event('input'));
 check('any changed input hides all previous profiles and disables diagnostic figure/CSV exports',()=>{assert.equal($('results').hidden,true);assert.equal($('csv').disabled,true);assert.equal($('figures').disabled,true);});
 await open({schema:'fully-wet-body-case',version:1,inputs:{radius:.05}});
 check('unrelated fullywet or 2D case is refused with separate-mode guidance',()=>assert.match($('errorMessage').textContent,/other solver cases are separate/));
 check('separate mode navigation exists in fullywet page and validation index',()=>{assert.match(fs.readFileSync(path.join(root,'axisymmetric.html'),'utf8'),/href="axisymmetric-cavity.html"/);assert.match(fs.readFileSync(path.join(root,'validation/index.html'),'utf8'),/href="..\/axisymmetric-cavity.html"/);});
 const out={date:'2026-10-31',status:'PASS_UI_INTEGRATION_ONLY',scope:'DOM/controller plus actual source-ring worker protocol; not interactive browser visual acceptance and not physical validation',checks,defaultComputationStatus:r.status,defaultDiagnostics:r.diagnostics,browserVisualReview:'NOT_PERFORMED',experimentalValidation:'NOT_PERFORMED'};
 fs.writeFileSync(path.join(__dirname,'axisymmetric-cavity-ui-smoke.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,checks:checks.length,defaultComputationStatus:r.status}));dom.window.close();
}
main().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
