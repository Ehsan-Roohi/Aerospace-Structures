'use strict';
// Real nodal solver + current controller/worker protocol. No interactive
// Chrome/Firefox visual acceptance or experimental validation is implied.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..');
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||path.join(repo,'.review-js/node_modules/jsdom'));
const C=require('../axisymmetric-cavity-nodal.js');
const html=fs.readFileSync(path.join(root,'axisymmetric-cavity.html'),'utf8');
const dom=new JSDOM(html,{url:'https://example.test/axisymmetric-cavity.html',runScripts:'outside-only'});
const w=dom.window,$=id=>w.document.getElementById(id),checks=[],downloads=[],blobs=new Map(),workers=[];
function check(name,fn){try{fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}}
w.NodalVortexCavity=C;w.Blob=Blob;
let blobIndex=0,holdNext=false;
w.URL.createObjectURL=blob=>{const key='blob:nodal-test-'+blobIndex++;blobs.set(key,blob);return key;};
w.URL.revokeObjectURL=()=>{};
w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)});};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
class RealWorkerHarness{
 constructor(url){assert.match(url,/^axisymmetric-cavity-worker\.js(?:\?v=[\w.-]+)?$/);this.dead=false;this.messages=[];this.hold=holdNext;holdNext=false;workers.push(this);const that=this;
  const sandbox={console,Date,Math,Float64Array,setTimeout,clearTimeout,postMessage:message=>{that.messages.push(message);if(!that.dead)that.onmessage?.({data:message});}};
  sandbox.self=sandbox;this.context=vm.createContext(sandbox);
  sandbox.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(root,file.split('?')[0]),'utf8'),that.context,{filename:file}));
  vm.runInContext(fs.readFileSync(path.join(root,url.split('?')[0]),'utf8'),this.context,{filename:url});
 }
 postMessage(data){this.input=JSON.parse(JSON.stringify(data));if(!this.hold)this.done=Promise.resolve(this.context.onmessage({data:this.input}));else this.done=Promise.resolve();}
 terminate(){this.dead=true;}
}
w.Worker=RealWorkerHarness;
w.eval(fs.readFileSync(path.join(root,'axisymmetric-cavity-app.js'),'utf8'));
function submit(){$('settings').dispatchEvent(new w.Event('submit',{cancelable:true}));return workers.at(-1);}
async function open(data){Object.defineProperty($('file'),'files',{value:[{size:1000,text:async()=>typeof data==='string'?data:JSON.stringify(data)}],configurable:true});await $('file').onchange();}
function dismiss(){if($('errorDialog').open)$('dismiss').click();}
async function main(){
 check('HTML loads current nodal solver/controller, not old constant-source library',()=>{assert.match(html,/axisymmetric-cavity-nodal\.js/);assert.match(html,/axisymmetric-cavity-app\.js/);assert.doesNotMatch(html,/<script[^>]+src="axisymmetric-cavity\.js/);});
 check('default inverse inputs and empty initial output',()=>{assert.equal($('panels').value,'32');assert.equal($('lengthRatio').value,'8');assert.equal($('radius').value,'.05'.replace(/^\./,'0.'));assert.equal($('results').hidden,true);assert.equal($('csv').disabled,true);assert.equal(w.document.querySelector('input[id="sigma"],input[id="ambientPressure"]'),null);});
 const running=submit();
 check('real worker produces immediate visible progress and enables cancellation',()=>{assert.equal($('solve').disabled,true);assert.equal($('cancel').disabled,false);assert.equal($('progress').hidden,false);assert.equal($('status').dataset.state,'running');assert.match($('status').textContent,/normal system|nodal free-surface|Newton shape/);});
 await running.done;
 const failure=running.messages.find(m=>m.type==='error');if(failure)throw Error('Actual Nc32 worker failed: '+failure.message);
 const r=running.messages.find(m=>m.type==='result')?.result;if(!r)throw Error('Actual Nc32 worker returned no result');
 check('actual Nc32 result stays research/field-unqualified',()=>{assert.equal(r.Nc,32);assert.equal(r.Nf,16);assert.equal(r.nodalConverged,true);assert.equal(r.accuracyQualified,false);assert.equal(r.status,'nodal-converged-field-unresolved');assert.equal(r.fieldAudit.fieldsFinite,true);assert.match($('status').textContent,/UNQUALIFIED/);assert.match($('status').textContent,/No experimental validation/);assert.match($('experimentalGate').textContent,/NOT PERFORMED/);assert.equal($('results').hidden,false);});
 check('actual profile contract retains five samples on every panel',()=>{assert.deepEqual(Array.from(r.fieldAudit.fractions),[.1,.25,.5,.75,.9]);assert.equal(r.fieldAudit.profiles.points.length,r.N*5);assert.equal(r.fieldAudit.profiles.panel.length,r.N*5);assert.equal(new Set(r.fieldAudit.profiles.panel).size,r.N);assert.equal($('residual').querySelectorAll('circle').length,r.N*5+r.Nc*5);});
 check('plots include true SI meridian, reconstruction/direct pressure and signed boundary residuals',()=>{assert.match($('geometry').textContent,/L = 0.4 m/);assert.match($('geometry').textContent,/Physical front disk/);assert.match($('geometry').textContent,/Artificial image disk/);assert.match($('pressure').textContent,/Nodal trace reconstruction/);assert.match($('pressure').textContent,/Direct field/);assert.match($('residual').textContent,/Cp \+ σ/);assert.equal($('pressure').querySelectorAll('svg').length,2);assert.equal($('residual').querySelectorAll('svg').length,2);});
 $('save').click();const saved=JSON.parse(await downloads.at(-1).blob.text());
 check('JSON saves current method, inputs and honest diagnostic status',()=>{assert.equal(saved.schema,'axisymmetric-cavity-case');assert.equal(saved.version,2);assert.equal(saved.method,'linear-vortex-nodal');assert.equal(saved.evidence.accuracyQualified,false);assert.equal(saved.evidence.experimentalValidation,'NOT_PERFORMED');assert.equal(saved.diagnosticResult.status,r.status);});
 $('csv').click();const csv=await downloads.at(-1).blob.text();
 const direct=csv.split('\n').filter(line=>line.startsWith('direct-field,')),nodal=csv.split('\n').filter(line=>line.startsWith('nodal-trace,'));
 check('CSV has actual newline-separated rows and every direct/nodal sample',()=>{assert.match(csv,/# RESEARCH DIAGNOSTIC ONLY/);assert.ok(csv.includes('\n'));assert.equal(csv.includes('\\n'),false);assert.equal(direct.length,r.N*5);assert.equal(nodal.length,r.N+1);const xs=direct.map(v=>Number(v.split(',')[1]));assert.equal(Math.min(...xs),0);assert.equal(Math.max(...xs),.4);});
 check('CSV direct Cp/velocity and metre coordinates match the actual solver samples',()=>{const cols=direct[37].split(','),p=r.fieldAudit.profiles;assert.equal(Number(cols[1]),p.points[37][0]*.05);assert.equal(Number(cols[2]),p.points[37][1]*.05);assert.equal(Number(cols[3]),p.panel[37]);assert.ok(Math.abs(Number(cols[4])-(1-p.normal_U[37]**2-p.tangent_U[37]**2))<1e-13);assert.equal(Number(cols[5]),p.normal_U[37]);assert.equal(Number(cols[6]),p.tangent_U[37]);});
 $('figures').click();const figures=await downloads.at(-1).blob.text();
 check('figure export contains five SVGs and explicit unqualified/nonexperimental labels',()=>{assert.equal((figures.match(/<svg /g)||[]).length,5);assert.match(figures,/accuracy unqualified/);assert.match(figures,/No experimentally validated cavity prediction/);assert.match(figures,/Nodal reconstruction and independent field values are distinct/);});
 await open(saved);
 check('saved case import restores inputs only; no stale result/exports',()=>{assert.equal($('results').hidden,true);assert.equal($('csv').disabled,true);assert.equal($('figures').disabled,true);assert.match($('status').textContent,/Stored results and legacy shape coefficients are not reused/);});
 await open({...saved,version:1,diagnosticResult:{status:'ACCEPTED'},inputs:{...saved.inputs,shapeCoefficients:[100,100],initialState:[100]}});
 check('legacy diagnostic/shape payload cannot become a fresh solution',()=>{assert.equal($('results').hidden,true);assert.match($('status').textContent,/not reused/);});
 holdNext=true;const cancelled=submit();$('cancel').click();cancelled.onmessage({data:{type:'result',result:r}});
 check('cancel terminates and ignores a late result callback',()=>{assert.equal(cancelled.dead,true);assert.equal($('solve').disabled,false);assert.equal($('cancel').disabled,true);assert.equal($('results').hidden,true);assert.match($('status').textContent,/cancelled/);});
 await open({...saved,inputs:{...saved.inputs,diskPanels:12}});holdNext=true;const custom=submit();$('cancel').click();
 check('imported explicit disk discretization is passed to the worker',()=>assert.equal(custom.input.Nf,12));
 await open(saved);holdNext=true;const standard=submit();$('cancel').click();
 check('new standard import does not inherit hidden diskPanels from the previous case',()=>assert.equal(standard.input.Nf,16));
 $('radius').value='.1';$('radius').dispatchEvent(new w.Event('input'));
 check('changed input invalidates prior plots and disables exports',()=>{assert.equal($('results').hidden,true);assert.equal($('csv').disabled,true);assert.equal($('figures').disabled,true);assert.match($('status').textContent,/Inputs changed/);});
 await open({schema:'wrong-case',version:2,inputs:saved.inputs});
 check('wrong case schema is refused visibly',()=>{assert.equal($('errorDialog').open,true);assert.match($('errorMessage').textContent,/axisymmetric-cavity case JSON/);assert.equal($('results').hidden,true);});dismiss();
 await open('{ broken json');
 check('invalid JSON reports error and cannot revive any result',()=>{assert.equal($('errorDialog').open,true);assert.equal($('results').hidden,true);assert.equal($('csv').disabled,true);});dismiss();
 await open({...saved,inputs:{...saved.inputs,lengthRatio:0}});
 check('invalid imported geometry is rejected before any worker starts',()=>{assert.equal($('errorDialog').open,true);assert.match($('errorMessage').textContent,/domain|L\/R/);assert.equal($('results').hidden,true);});dismiss();
 const out={date:'2026-10-31',status:checks.every(c=>c.passed)?'PASS_UI_INTEGRATION_ONLY':'FAIL_UI_INTEGRATION',
  scope:'Current DOM/controller and actual Nc32 nodal worker protocol; exact CSV data/coverage checks, imports, stale-result/cancel controls. Not interactive Chrome/Firefox visual acceptance or physical/experimental validation.',
  checks,failures:checks.filter(c=>!c.passed).length,actualDefault:{version:r.version,status:r.status,Nc:r.Nc,Nf:r.Nf,sigma:r.sigma,Rmax:r.Rmax,CD:r.CD,nodalResidual:r.maxDynamicResidual,fieldAudit:{fieldsFinite:r.fieldAudit.fieldsFinite,maxNormal_U:r.fieldAudit.maxNormal_U,maxCavityDynamicCpResidual:r.fieldAudit.maxCavityDynamicCpResidual}},
  browserVisualReview:'NOT_PERFORMED',experimentalValidation:'NOT_PERFORMED'};
 fs.writeFileSync(path.join(__dirname,'nodal-cavity-ui-smoke.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,checks:checks.length,failures:out.failures,failed:checks.filter(c=>!c.passed)},null,2));
 if(out.failures)process.exitCode=1;dom.window.close();
}
main().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
