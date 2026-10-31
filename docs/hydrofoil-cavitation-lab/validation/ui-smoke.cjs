// Runs the actual controller against a small DOM/worker harness. This is a
// code-level integration check, not a claim of rendering/browser verification.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const C=require('../cavitation.js'),root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),elements={},downloads=[];
class Element {
 constructor(id,tag='div'){this.id=id;this.tag=tag;this._value='';this.options=[];this.disabled=false;this.open=false;this.dataset={};this.innerHTML='';this.textContent='';this.listeners={};this.files=[];}
 get value(){return this._value;}
 set value(value){value=String(value);this._value=this.tag==='select'&&!this.options.some(v=>v.value===value)?'':value;}
 add(option){this.options.push(option);}
 addEventListener(name,callback){this.listeners[name]=callback;}
 replaceChildren(){this.innerHTML='';this.textContent='';}
 showModal(){this.open=true;}
 close(){this.open=false;}
 click(){if(this.tag==='a')downloads.push({name:this.download,blob:blobs.get(this.href)});else this.onclick?.();}
 querySelector(selector){if(selector!=='svg')return null;const m=this.innerHTML.match(/<svg\b[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>/);return m?{getAttribute:()=>m[1],innerHTML:m[2]}:null;}
}
for(const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
 const e=elements[m[2]]=new Element(m[2],m[1]);
 e.disabled=/\bdisabled\b/.test(m[0]);e._value=m[0].match(/\bvalue="([^"]*)"/)?.[1]??'';
 if(e.tag==='select'){
  const body=html.slice(m.index+m[0].length).split('</select>')[0];
  for(const option of body.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)){
   const value=option[1].match(/\bvalue="([^"]*)"/)?.[1]??option[2];e.options.push({value});if(!e._value||/\bselected\b/.test(option[1]))e._value=value;
  }
 }
}
const blobs=new Map();let serial=0,workerCount=0,holdNext=false;const workers=[];
class Worker {
 constructor(url){assert.equal(url,'worker.js?v=0.3.2');this.terminated=false;this.held=holdNext;holdNext=false;workerCount++;workers.push(this);}
 terminate(){this.terminated=true;}
 postMessage(input){this.input=input;if(this.held)return;const iterator=C.iterate(input);let next;do{next=iterator.next();if(!next.done)this.onmessage({data:{type:'progress',row:next.value}});}while(!next.done);this.onmessage({data:{type:'result',result:next.value}});}
}
const context={document:{getElementById:id=>elements[id],createElement:tag=>new Element('',tag)},HydrofoilCavitation:C,Worker,Option:class {constructor(text,value){this.text=text;this.value=value;}},Blob,URL:{createObjectURL:blob=>{const key='blob:'+serial++;blobs.set(key,blob);return key;},revokeObjectURL:()=>{}},performance,setTimeout:fn=>fn(),console};
vm.runInNewContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context,{filename:'app.js'});
async function open(input){elements.file.files=[{size:1000,text:async()=>JSON.stringify(input)}];await elements.file.onchange();}
async function main(){
 const checks=[];const check=(name,fn)=>{fn();checks.push(name);};
 elements.settings.listeners.submit({preventDefault(){}});
 check('default solve separates numerical convergence from failed wetted-pressure physical screen',()=>{assert.equal(workerCount,1);assert.equal(elements.solve.disabled,false);assert.equal(elements.csv.disabled,true);assert.equal(elements.figures.disabled,true);assert.match(elements.metrics.innerHTML,/No accepted cavity/);assert.doesNotMatch(elements.metrics.innerHTML,/Computed σ|Equivalent-contour CL/);assert.match(elements.status.textContent,/Numerical equations converged/);assert.match(elements.status.textContent,/FAILED_WETTED_PRESSURE/);assert.match(elements.errorMessage.textContent,/Minimum wetted Cp \+ σ =/);assert.match(elements.errorMessage.textContent,/at x\/c.*y\/c.*panel/);assert.match(elements.errorMessage.textContent,/wetted panels below vapour pressure/);assert.match(elements.errorMessage.textContent,/not an experiment/);assert.match(elements.errorMessage.textContent,/does not prove cavitation is absent/);assert.doesNotMatch(elements.errorMessage.textContent,/Example restores.*reference/);});
 check('complete default diagnostic profiles and new physical screen table retained',()=>{assert.equal(elements.closureMode.value,'smooth-contact');assert.equal(elements.rejectedDetails.hidden,false);assert.equal(elements.rejectedDetails.open,false);assert.match(elements.rejectedMetrics.innerHTML,/Solved attenuation/);assert.match(elements.rejectedMetrics.innerHTML,/Converged; physical consistency is separate/);assert.match(elements.shape.innerHTML,/Rejected trial/);assert.match(elements.closure.innerHTML,/Fixed-A baseline/);assert.match(elements.pressure.innerHTML,/Cavity BC target/);assert.match(elements.residuals.innerHTML,/5 nodes/);assert.match(elements.residuals.innerHTML,/Minimum wetted Cp \+ σ/);assert.match(elements.residuals.innerHTML,/Location of minimum wetted/);assert.match(elements.residuals.innerHTML,/Wetted panels below vapour/);assert.match(elements.residuals.innerHTML,/FAILED_WETTED_PRESSURE/);});
 const noExport=downloads.length;elements.csv.click();elements.figures.click();assert.equal(downloads.length,noExport);
 elements.save.click();const saved=JSON.parse(await downloads.at(-1).blob.text());
 check('numerically converged raw trial is saved under rejectedTrial with result:null and separate numericalConverged',()=>{assert.equal(saved.version,2);assert.equal(saved.inputs.closureMode,'smooth-contact');assert.equal(saved.inputs.kuttaCondition,'velocity');assert.equal(saved.inputs.normalTolerance,1e-5);assert.equal(saved.result,null);assert.equal(saved.numericalConverged,true);assert.equal(saved.rejectedTrial.status,'converged-prototype');assert.equal(saved.rejectedTrial.physicalAdmissibility.screenPassed,false);assert.equal(saved.rejectedTrial.physicalAdmissibility.status,'FAILED_WETTED_PRESSURE');assert.ok(saved.rejectedTrial.panels.length>100);assert.ok(saved.rejectedTrial.physicalAdmissibility.wettedBelowVapourPanels>0);});
 // SYNTHETIC controller fixture only: prescribed noncavitating wet-panel Cp=0
 // makes the same physical consistency screen pass. This is not a new solver
 // result or validation evidence, and never changes the real numerical result.
 const fixture=structuredClone(saved.rejectedTrial);for(const p of fixture.panels)if(!p.cavity)p.cp=0;
 fixture.physicalAdmissibility=C.physicalAdmissibility(fixture.panels,fixture.sigma,{equationsConverged:true,geometryValid:true});
 assert.equal(fixture.physicalAdmissibility.screenPassed,true);context.display(fixture);
 elements.csv.click();const csv=await downloads.at(-1).blob.text();elements.figures.click();const figure=await downloads.at(-1).blob.text();
 check('synthetic passing-screen fixture exercises enabled CSV/figure export plumbing only, never experimental validation',()=>{assert.equal(elements.csv.disabled,false);assert.equal(elements.figures.disabled,false);assert.match(csv,/x_c,y_c,Cp,region,target_Cp/);assert.equal(csv.split('\n').length,fixture.panels.length+1);assert.match(figure,/No experimental cavitating-flow validation/);assert.match(elements.status.textContent,/not experimental validation/);});
 // No old or incomplete result can bypass the required new screen.
 const legacy=structuredClone(saved.rejectedTrial);delete legacy.physicalAdmissibility;context.display(legacy);
 check('legacy numerical result without physical screening cannot advertise accepted KPIs or accepted exports',()=>{assert.equal(elements.csv.disabled,true);assert.equal(elements.figures.disabled,true);assert.match(elements.metrics.innerHTML,/No accepted cavity/);assert.match(elements.status.textContent,/screen is unavailable/);});
 saved.inputs.resolution=20;saved.inputs.normalTolerance=5e-6;await open(saved);
 check('nonpreset resolution/tolerance roundtrip; imported results not trusted',()=>{assert.equal(elements.resolution.value,'20');assert.equal(elements.normalTolerance.value,'0.000005');assert.equal(elements.csv.disabled,true);assert.equal(elements.rejectedDetails.hidden,true);assert.match(elements.status.textContent,/recompute/);});
 saved.version=1;delete saved.inputs.camber;delete saved.inputs.camberPosition;delete saved.inputs.closureMode;delete saved.inputs.kuttaCondition;delete saved.inputs.normalTolerance;delete saved.inputs.shapeTolerance;await open(saved);
 check('version1 fixed-A/Morino and default tolerances preserved',()=>{assert.equal(elements.normalTolerance.value,'0.00001');assert.equal(elements.closureMode.value,'fixed-recovery');assert.equal(elements.kuttaCondition.value,'morino');});
 elements.dismissError.click();elements.reset.click();elements.nacaCode.value='2412';elements.settings.listeners.submit({preventDefault(){}});elements.save.click();const cambered=JSON.parse(await downloads.at(-1).blob.text());
 check('actual cambered2412 geometry roundtrip retains numerically converged diagnostics but refuses failing physical screen',()=>{assert.equal(workerCount,2);assert.equal(cambered.inputs.camber,.02);assert.equal(cambered.inputs.camberPosition,.4);assert.equal(cambered.result,null);assert.equal(cambered.numericalConverged,true);assert.equal(cambered.rejectedTrial.physicalAdmissibility.screenPassed,false);assert.equal(elements.csv.disabled,true);});
 await open(cambered);assert.equal(elements.nacaCode.value,'2412');
 const previous=elements.alpha.value;await open({schema:'mie446-wing-study',version:1,inputs:{alpha:99}});
 check('wrong-schema import leaves inputs unchanged and opens separate error dialog',()=>{assert.equal(elements.alpha.value,previous);assert.equal(elements.errorDialog.open,true);assert.match(elements.errorMessage.textContent,/Wing Lab JSON/);});
 elements.dismissError.click();elements.reset.click();
 check('Example restores only input values and promises no accepted physical reference',()=>{assert.equal(elements.resolution.value,'32');assert.equal(elements.closureMode.value,'smooth-contact');assert.match(elements.status.textContent,/physical cavity is not guaranteed/);assert.equal(elements.rejectedDetails.hidden,true);});
 elements.alpha.value='0';elements.settings.listeners.submit({preventDefault(){}});
 check('invalid input is refused before worker creation',()=>{assert.equal(workerCount,2);assert.match(elements.errorMessage.textContent,/angle of attack/);assert.equal(elements.solve.disabled,false);});
 elements.dismissError.click();elements.nacaCode.value='2414';elements.alpha.value='0.1';elements.settings.listeners.submit({preventDefault(){}});
 const downloadsBefore=downloads.length;elements.csv.click();elements.figures.click();assert.equal(downloads.length,downloadsBefore);elements.save.click();const rejected=JSON.parse(await downloads.at(-1).blob.text());
 check('user screenshot 2414/.1deg retains intersecting failed branch with no accepted KPIs/exports',()=>{assert.match(elements.metrics.innerHTML,/No accepted cavity/);assert.doesNotMatch(elements.metrics.innerHTML,/Computed σ|Equivalent-contour CL/);assert.equal(elements.rejectedDetails.hidden,false);assert.match(elements.rejectedMetrics.innerHTML,/not an accepted prediction/);assert.match(elements.shape.innerHTML,/Rejected trial/);assert.match(elements.errorMessage.textContent,/NACA 2414/);assert.equal(elements.csv.disabled,true);assert.equal(elements.figures.disabled,true);assert.equal(rejected.result,null);assert.equal(rejected.rejectedTrial.status,'rejected');assert.equal(rejected.rejectedTrial.physicalAdmissibility.screenPassed,false);assert.ok(rejected.rejectedTrial.metrics.minimumHeight<0);assert.equal(rejected.inputs.dynamicPressure,undefined);});
 await open(rejected);assert.equal(elements.nacaCode.value,'2414');assert.equal(elements.rejectedDetails.hidden,true);assert.equal(elements.csv.disabled,true);
 // Exercise asynchronous UI state without paying for or faking a solver result.
 elements.dismissError.click();elements.reset.click();holdNext=true;elements.settings.listeners.submit({preventDefault(){}});const pending=workers.at(-1);
 pending.onmessage({data:{type:'progress',row:{iteration:2,sigma:.7,maxNormalVelocity:.001}}});
 check('running solve progress visible and inputs locked while cancel available',()=>{assert.equal(elements.solve.disabled,true);assert.equal(elements.cancel.disabled,false);assert.equal(elements.open.disabled,true);assert.equal(elements.alpha.disabled,true);assert.equal(elements.status.dataset.state,'running');assert.match(elements.status.textContent,/iteration 2/);});
 elements.cancel.click();pending.onmessage({data:{type:'result',result:fixture}});
 check('cancel releases controls and stale worker callback cannot restore an accepted result',()=>{assert.equal(pending.terminated,true);assert.equal(elements.solve.disabled,false);assert.equal(elements.open.disabled,false);assert.equal(elements.alpha.disabled,false);assert.equal(elements.cancel.disabled,true);assert.equal(elements.csv.disabled,true);assert.equal(elements.metrics.innerHTML,'');assert.match(elements.status.textContent,/Cancelled/);});
 const report={date:'2026-10-31',version:'0.3.2',scope:'Code-level controller/DOM harness; no real browser or rendered-layout verification',status:'PASS_UI_INTEGRATION_ONLY',checks,actualDefault:{numericalStatus:saved.rejectedTrial.status,numericalConverged:saved.numericalConverged,physicalAdmissibility:saved.rejectedTrial.physicalAdmissibility},actualCambered:{numericalConverged:cambered.numericalConverged,physicalAdmissibility:cambered.rejectedTrial.physicalAdmissibility},syntheticFixture:'Passing-screen export plumbing only; wet Cp prescribed zero in test; not a solver result or physical validation',experimentalValidation:'NOT_PERFORMED'};
 fs.writeFileSync(path.join(__dirname,'ui-smoke.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(__dirname,'screenshot-case-2414-ui-review.json'),JSON.stringify({version:'0.3.2',date:'2026-10-31',scope:report.scope,case:{naca:'2414',alphaDeg:.1,detachment:.01,length:.4,resolution:32},acceptedPhysicalCavity:false,numericalStatus:rejected.rejectedTrial.status,numericalConverged:rejected.numericalConverged,physicalAdmissibility:rejected.rejectedTrial.physicalAdmissibility,checks:['no sigma/lift/height predictions in accepted KPI cards','complete raw failed trial kept under rejectedTrial in JSON','new physical pressure minimum/location/count shown in error and diagnostics','accepted pressure CSV/figure exports disabled','reopening restores inputs only; fresh solve required'],solverEquationsChanged:false},null,2)+'\n');
 console.log(JSON.stringify({status:report.status,checks:checks.length,actualDefaultScreen:report.actualDefault.physicalAdmissibility.status}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
