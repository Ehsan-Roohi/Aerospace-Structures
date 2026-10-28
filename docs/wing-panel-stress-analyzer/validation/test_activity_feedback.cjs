const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const app=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(app,'index.html'),'utf8');
const helpers=page.slice(page.indexOf('  // Yield through a paint before synchronous'),page.indexOf('  async function runStudy()',page.indexOf('  // Yield through a paint before synchronous')));
const render=page.slice(page.indexOf('  function applyResult('),page.indexOf('  function applyResultNow() {',page.indexOf('  function applyResult(')));
const nodes={};for(const id of ['loadTitle','loadStep','loadBar','loadElapsed','loading','app'])nodes['#'+id]={textContent:'',hidden:true,style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};
const rendered=[],errors=[];
const ctx=vm.createContext({performance,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:cb=>setTimeout(cb,1),console:{error(){}},$:(id)=>nodes[id],R:{},S:{plot:'stress'},running:false,flash:e=>errors.push(e),applyResultNow:()=>{assert.equal(nodes['#loading'].hidden,false,'The card must be painted before contour work');rendered.push(ctx.S.plot);if(ctx.fail)throw Error('test rendering failure');}});
vm.runInContext(helpers+render,ctx);
const pause=()=>new Promise(r=>setTimeout(r,80));
(async()=>{
 vm.runInContext('applyResult()',ctx);assert.equal(nodes['#loading'].hidden,false);assert.equal(rendered.length,0,'Contour computation must yield before starting');await pause();assert.deepEqual(rendered,['stress']);assert.equal(nodes['#loading'].hidden,true);assert.equal(nodes['#app'].attributes['aria-busy'],undefined);
 rendered.length=0;vm.runInContext("S.plot='stress';applyResult();S.plot='disp';applyResult()",ctx);await pause();assert.deepEqual(rendered,['disp'],'Rapid result requests must coalesce to the latest result');
 ctx.fail=true;vm.runInContext('applyResult()',ctx);await pause();assert.equal(errors.length,1);assert.equal(nodes['#loading'].hidden,true,'Rendering failures must not leave a stuck activity card');
 ctx.fail=false;rendered.length=0;vm.runInContext("applyResult();++resultRenderGeneration;resultRendering=false;running=true;beginWingActivity('Solving structure / stress','Computing')",ctx);await pause();assert.equal(rendered.length,0,'A queued old contour must not run during a new solve');assert.equal(nodes['#loading'].hidden,false,'An obsolete callback must not hide the solver card');vm.runInContext('running=false;endWingActivity()',ctx);
 rendered.length=0;vm.runInContext("S.plot='model';applyResult(true)",ctx);assert.equal(rendered.length,0,'A requested model remap must yield');await pause();assert.deepEqual(rendered,['model']);assert.equal(nodes['#loading'].hidden,true);
 console.log(JSON.stringify({yields_before_rendering:true,latest_request_wins:true,error_cleanup:true,queued_contour_cannot_hide_new_solve:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
