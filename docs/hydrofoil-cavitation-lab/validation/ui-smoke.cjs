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
const blobs=new Map();let serial=0,workerCount=0;
class Worker {
 constructor(){this.terminated=false;workerCount++;}
 terminate(){this.terminated=true;}
 postMessage(input){const iterator=C.iterate(input);let next;do{next=iterator.next();if(!next.done)this.onmessage({data:{type:'progress',row:next.value}});}while(!next.done);this.onmessage({data:{type:'result',result:next.value}});}
}
const context={document:{getElementById:id=>elements[id],createElement:tag=>new Element('',tag)},HydrofoilCavitation:C,Worker,Option:class {constructor(text,value){this.text=text;this.value=value;}},Blob,URL:{createObjectURL:blob=>{const key='blob:'+serial++;blobs.set(key,blob);return key;},revokeObjectURL:()=>{}},performance,setTimeout:fn=>fn(),console};
vm.runInNewContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context,{filename:'app.js'});
async function open(input){elements.file.files=[{size:1000,text:async()=>JSON.stringify(input)}];await elements.file.onchange();}
async function main(){
 elements.settings.listeners.submit({preventDefault(){}});
 assert.equal(workerCount,1);assert.equal(elements.solve.disabled,false);assert.equal(elements.csv.disabled,false);assert.match(elements.status.textContent,/converged/);assert.match(elements.pressure.innerHTML,/Cavity BC target/);assert.match(elements.metrics.innerHTML,/Computed σ/);
 assert.equal(elements.closureMode.value,'smooth-contact');assert.match(elements.metrics.innerHTML,/Solved attenuation/);assert.match(elements.closure.innerHTML,/Fixed-A baseline/);assert.match(elements.residuals.innerHTML,/5 nodes/);
 elements.csv.click();const csv=await downloads.at(-1).blob.text();assert.match(csv,/x_c,y_c,Cp,region,target_Cp/);assert.ok(csv.split('\n').length>100);
 elements.figures.click();assert.match(await downloads.at(-1).blob.text(),/Research prototype/);
 elements.save.click();const saved=JSON.parse(await downloads.at(-1).blob.text());assert.equal(saved.version,2);assert.equal(saved.inputs.closureMode,'smooth-contact');assert.equal(saved.inputs.kuttaCondition,'velocity');assert.equal(saved.inputs.normalTolerance,1e-5);assert.equal(saved.result.status,'converged-prototype');
 // The API supports any integer resolution 16..96. An imported value that is
 // absent from the preset select must be added, never silently become empty.
 saved.inputs.resolution=20;saved.inputs.normalTolerance=5e-6;await open(saved);assert.equal(elements.resolution.value,'20');assert.equal(elements.normalTolerance.value,'0.000005');assert.equal(elements.csv.disabled,true);assert.match(elements.status.textContent,/recompute/);
 // Version-1 files predating the optional tolerance fields use documented defaults.
 saved.version=1;delete saved.inputs.camber;delete saved.inputs.camberPosition;delete saved.inputs.closureMode;delete saved.inputs.kuttaCondition;delete saved.inputs.normalTolerance;delete saved.inputs.shapeTolerance;await open(saved);assert.equal(elements.normalTolerance.value,'0.00001');assert.equal(elements.closureMode.value,'fixed-recovery','legacy input physics preserved');assert.equal(elements.kuttaCondition.value,'morino');
 elements.reset.click();elements.nacaCode.value='2412';elements.settings.listeners.submit({preventDefault(){}});assert.equal(workerCount,2);assert.match(elements.status.textContent,/converged/);elements.save.click();const cambered=JSON.parse(await downloads.at(-1).blob.text());assert.equal(cambered.inputs.camber,.02);assert.equal(cambered.inputs.camberPosition,.4);await open(cambered);assert.equal(elements.nacaCode.value,'2412');
 const previous=elements.alpha.value;await open({schema:'mie446-wing-study',version:1,inputs:{alpha:99}});assert.equal(elements.alpha.value,previous);assert.equal(elements.errorDialog.open,true);assert.match(elements.errorMessage.textContent,/Wing Lab JSON/);
 elements.dismissError.click();elements.reset.click();assert.equal(elements.resolution.value,'32');assert.equal(elements.errorDialog.open,false);assert.equal(elements.closureMode.value,'smooth-contact');
 elements.alpha.value='0';elements.settings.listeners.submit({preventDefault(){}});assert.equal(workerCount,2);assert.match(elements.errorMessage.textContent,/angle of attack/);assert.equal(elements.solve.disabled,false);
 const report={date:'2026-10-30',scope:'Code-level controller/DOM harness; no real browser or rendered-layout verification',checks:['default smooth-contact worker solve and visible metrics/plots','selected A, baseline/complete-gap chart and endpoint diagnostics visible','CSV, version-2 JSON and SVG exports','nonpreset resolution import without data loss','tolerance roundtrip and version-1 fixed-A physics preserved','cambered2412 worker solve and JSONgeometry roundtrip','wrong-schema import leaves inputs unchanged and opens error dialog','invalid solve refused before worker launch']};
 fs.writeFileSync(path.join(__dirname,'ui-smoke.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
