// Check estimate provenance and numerical meaning, independently of UI labels.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..');
const ctx=vm.createContext({module:{exports:{}},console,performance});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);const A=ctx.module.exports;
vm.runInContext(fs.readFileSync(path.join(app,'ui/wing-aero-ui.js'),'utf8'),ctx);const U=ctx.module.exports;
// Known continuum limit; non-separable mesh error. No reference value is given
// to sequenceEstimate. Its fixed extrapolation must recover the limit itself.
const Q=(c,s)=>.6+.3/c+.4/s+.7/(c*s)+.2/(c*c)+.1/(s*s);
for(const name of ['standard','fine']){
 const e=A.sequenceEstimate(name,Q);assert.ok(Math.abs(e.value-.6)<1e-12);assert.ok(e.uncertainty>0);
 const shifted=A.sequenceEstimate(name,(c,s)=>Q(c,s)+.123);assert.ok(Math.abs(shifted.value-.723)<1e-12);
}
const fixture={mode:'closed-tip-rigid-load-sectional-response',rows:[
 {kind:'force',label:'Root Force',value:10,uncertainty:.5,relative:.05,measure:.05,tolerance:.05,admitted:true},
 {kind:'transfer',label:'Root six-component transfer',value:1e-8,relative:1e-8,measure:1e-8,tolerance:1e-7,admitted:true},
 {kind:'liftConsistency',label:'Lift: pressure vs Trefftz plane',value:.6,reference:.59,relative:.01/.6,measure:.01/.6,tolerance:.02,admitted:true}],notes:[]};
const saved=JSON.stringify(fixture),html=U.admissionTable(fixture);
assert.equal(JSON.stringify(fixture),saved);assert.match(html,/10 ± 0.5/);assert.match(html,/5.00&nbsp;%/);
assert.match(html,/0.6 vs 0.59/);assert.match(html,/U\/\|Value\|/);assert.match(html,/transfer residual/);assert.doesNotMatch(html,/Relative error|Error vs limit/);
const notes=U.provenanceHelp();for(const word of ['Airfoil Tools','not experimental error','confidence interval','Reynolds','base mesh','External validation','mixed refinement'])assert.ok(notes.includes(word),word);
const lf=s=>s.replace(/\r\n/g,'\n'),page=lf(fs.readFileSync(path.join(app,'index.html'),'utf8'));
for(const name of ['wing-aero-ui.js','wx-aero-results.js','wx-shell.js','wx-shell.css'])assert.ok(page.includes(lf(fs.readFileSync(path.join(app,'ui',name),'utf8')).trim()),name+' source is synced');
assert.equal(page,lf(fs.readFileSync(path.join(app,'wing-lab.html'),'utf8')));
const baseRef=process.env.FEEDBACK_BASE||'d8841c3';
const sha=x=>crypto.createHash('sha256').update(x.replace(/\r\n/g,'\n')).digest('hex');
const unchanged=[];
for(const name of ['wing-aero/aero_bundle.js','wing-aero/wing_aero_panel.js','ui/zero-tip-source/engine.js']){
 const rel='docs/wing-panel-stress-analyzer/'+name,current=fs.readFileSync(path.join(app,name),'utf8'),old=cp.execFileSync('git',['show',baseRef+':'+rel],{cwd:repo,maxBuffer:8*1024*1024}).toString();assert.equal(sha(current),sha(old),name+' numerical source unchanged');unchanged.push(name);
}
const engine=s=>s.slice(s.indexOf('const WingEngine ='),s.indexOf('module.exports = WingEngine;')+'module.exports = WingEngine;'.length);
const oldPage=cp.execFileSync('git',['show',baseRef+':docs/wing-panel-stress-analyzer/index.html'],{cwd:repo,maxBuffer:8*1024*1024}).toString();assert.equal(sha(engine(page)),sha(engine(oldPage)));
const foil=s=>s.slice(s.indexOf('window.WingAirfoilPanel2D ='),s.indexOf('window.WingAeroStructResults ='));assert.equal(sha(foil(page)),sha(foil(oldPage)));
console.log(JSON.stringify({manufactured_extrapolation_and_mixed_term:true,not_fit_to_external_target:true,admission_percent_meaning:true,mesh_uncertainty_not_experimental_error:true,modules_and_alias_synced:true,numerical_sources_unchanged:unchanged,inline_structural_engine_unchanged:true,independent_2d_kernel_unchanged:true}));
