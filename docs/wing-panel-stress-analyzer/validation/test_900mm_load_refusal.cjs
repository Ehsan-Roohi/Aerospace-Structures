// Exact user file: valid geometry and resolved aerodynamic load, refused one-way
// coupling. Exercise the deployed kernel and controller, not a substitute model.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const app=path.resolve(__dirname,'..'),web=path.resolve(app,'../../computational/printed-wing-solver/web');
const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
const c=vm.createContext({module:{exports:{}},require:createRequire(path.join(web,'engine.js')),console,performance,TextEncoder,TextDecoder,URL,Buffer});
const read=name=>fs.readFileSync(path.join(app,name),'utf8');
for(const name of ['wing-aero-ui.js','wx-aero-results.js','wx-shell.js','wx-shell.css'])assert.ok(html.replaceAll('\r\n','\n').includes(read('ui/'+name).replaceAll('\r\n','\n').trim()),name+' must remain embedded intact');
assert.equal((html.match(/window\.WingAeroStructResults =/g)||[]).length,1,'retain the aerodynamic result renderer');
vm.runInContext(read('wing-aero/aero_bundle.js'),c);const A=c.module.exports;
const a=html.indexOf('const WingEngine ='),b=html.indexOf('module.exports = WingEngine;',a)+'module.exports = WingEngine;'.length;
vm.runInContext(html.slice(a,b),c);const E=c.module.exports;
vm.runInContext(read('ui/wing-aero-ui.js'),c);const U=c.module.exports;
vm.runInContext(read('wing-aero/wing_study_io.js'),c);const IO=c.module.exports;
IO.setAeroGeometryKey(g=>IO.sha256(A.geometryKey(g)));
const fixture=read('validation/fixtures/900mm-panel-load-2026-10-30.json'),doc=JSON.parse(fixture),snapshot=JSON.stringify(doc);
const imported=IO.importPrintedStudy(fixture,E);assert.ok(imported.ok,JSON.stringify(imported.errors));
const S=imported.state,g=E.makeGeometry(S.geometry);
assert.equal(g.semiSpan,900);assert.equal(g.rootChord,260);assert.equal(g.tipChord,100);assert.equal(g.spars.length,1);assert.equal(g.customInteriorRibs.length,7);
// The physical preview contour and all spar members remain finite, including
// every display loft station, every rib and each spar endpoint.
const stations=[...Array.from({length:226},(_,i)=>900*i/225),...g.customInteriorRibs];
for(const y of stations){const p=E.outerContour(g,y,49);assert.ok(p.length>10&&p.every(v=>v.every(Number.isFinite)));for(const spar of E.sparParts(g,y))assert.ok(spar.polygons.flat(2).every(Number.isFinite));}
function solve(state){
 const gg=E.makeGeometry(state.geometry),snap=[...E.ribStations(gg),...E.seams(gg),...gg.spars.map(s=>s.length)];
 const combined=U.delivered(A,gg,state.aeroLoad,snap),input={...IO.printedEngineInput(state,E),aeroLoad:U.engineLoad(combined,state.aeroLoad.label)},start=performance.now();
 const result=E.solve(input),admission=U.admit(A,gg,state.aeroLoad,combined,result);
 return {state,input,result,admission,combined,milliseconds:performance.now()-start};
}
const original=solve(S),adm=original.admission;
assert.equal(adm.admitted,false);assert.deepEqual(Array.from(adm.failed),['One-way coupling: twist effect on lift']);
assert.equal(adm.twist.status,'resolved');assert.ok(adm.rows.filter(r=>r.kind!=='aeroelastic').every(r=>r.admitted));
assert.ok(adm.twist.rigidWingEffect>0.055&&adm.twist.rigidWingEffect<0.057);
assert.equal(original.result.analysis3D.validity.smallDisplacement,false);
const refusal=U.admissionFailure(adm,{flow:S.aeroLoad.flow,liftN:original.result.analysis3D.aeroLoad.appliedWrench.force[2],validity:original.result.analysis3D.validity});
assert.equal(refusal.kind,'coupling-model-limit');assert.match(refusal.message,/5\.56%/);assert.match(refusal.message,/180 km\/h/);assert.match(refusal.message,/96\.9 N/);assert.match(refusal.message,/second bonded spar/);assert.doesNotMatch(U.admissionVerdict(adm).html,/unresolved twist|not resolved to 10% of itself/);
// A separate alternative is the same attached, incompressible potential-flow
// solution at lower speed. Coefficients stay fixed and every physical force and
// moment scales by q_new/q_old; no geometry or mesh result is fitted or edited.
function atSpeed(speed){
 const copy=JSON.parse(JSON.stringify(doc)),factor=(speed/copy.study.aeroLoad.flow.speed)**2;
 copy.savedAt=new Date().toISOString();copy.study.aerodynamics.speed=speed;copy.study.aeroLoad.flow.speed=speed;
 copy.study.aeroLoad.label=`Panel-method pressure load, alpha ${copy.study.aeroLoad.flow.alphaDeg} deg, V ${speed} m/s; exact dynamic-pressure rescaling of saved fine sequence`;
 for(const level of copy.study.aeroLoad.levels)for(const row of level.strips)for(let i=2;i<8;i++)row[i]*=factor;
 const test=IO.importPrintedStudy(JSON.stringify(copy),E);assert.ok(test.ok,JSON.stringify(test.errors));
 assert.equal(JSON.stringify(copy.study.geometry),JSON.stringify(doc.study.geometry));
 const response=solve(test.state);assert.ok(response.admission.admitted,JSON.stringify(response.admission.failed));assert.equal(response.result.analysis3D.validity.smallDisplacement,true);
 return {document:copy,...response};
}
const lower=atSpeed(25),teaching=atSpeed(15);
assert.equal(JSON.stringify(doc),snapshot,'original file remains immutable');
const out=process.env.OUT||path.resolve(__dirname,'../../..','output','900mm-load-review');fs.mkdirSync(out,{recursive:true});
for(const run of [lower,teaching])fs.writeFileSync(path.join(out,`Wing_900mm_${run.state.aeroLoad.flow.speed}mps_same_geometry.json`),JSON.stringify(run.document,null,2)+'\n');
const summarize=r=>({speedMps:r.state.aeroLoad.flow.speed,admitted:r.admission.admitted,failed:Array.from(r.admission.failed),semiWingForceN:r.result.analysis3D.aeroLoad.appliedWrench.force,tipTwistDeg:r.admission.twist.tipTheta*180/Math.PI,liftChangeFraction:r.admission.twist.rigidWingEffect,linearScreen:r.result.analysis3D.validity,massG:r.result.mass.total,milliseconds:r.milliseconds});

// Execute the actual asynchronous controller with renderer/DOM adapters. A
// scientific refusal must never reach flash(Input error), replace the previous
// accepted result, or leave the busy overlay / current geometry unavailable.
const nodes=new Map(),calls=[],previous={tag:'previous accepted result'};
const q={S,stlReference:null,runTimer:null,clearTimeout,recordWingHistory(){},gateOpen:()=>false,importGate:null,resultRenderGeneration:0,resultRendering:false,running:false,stale:true,analysisRefusal:null,inputError:null,fieldErrors:{},frame:async()=>{},renderInputs(){},beginWingActivity(){calls.push('busy-on')},setStatus(){},solveInput:()=>original.input,lastGeoKey:null,model:{},performance,
 E:{makeGeometry:E.makeGeometry,stations:()=>[],analysisCapability:E.analysisCapability,solve:()=>original.result},
 $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,style:{}});return nodes.get(id)},WingAeroUI:{...U,admit:()=>adm},WingAeroPanel:A,wingAero:{showAdmission(){}},aeroDelivered:()=>original.combined,R:previous,
 showErrorDialog:(text,target,options)=>calls.push({dialog:options.title,text}),flash:()=>calls.push('input-error'),endWingActivity(){calls.push('busy-off')},pending:false,saveDesignAfterRun:false,previewGeometry(){assert.equal(q.running,false);calls.push('current-geometry-preview')},renderTree(){},renderSparResults(){},renderPartEditor(){},console:{error:e=>calls.push('unexpected-console-error:'+e.message)}};
const control=vm.createContext(q),runA=html.indexOf('  async function runStudy()'),runB=html.indexOf('\n  // ------------------------------------------------------------ 3-D scene',runA);
assert.ok(runA>0&&runB>runA);vm.runInContext(html.slice(runA,runB),control);
(async()=>{await vm.runInContext('runStudy()',control);assert.equal(q.R,previous);assert.equal(q.inputError,null);assert.equal(q.analysisRefusal.kind,'coupling-model-limit');assert.equal(q.running,false);assert.ok(calls.includes('busy-off')&&calls.includes('current-geometry-preview'));assert.ok(!calls.includes('input-error'));assert.ok(calls.some(c=>c.dialog==='Structural result withheld'));assert.equal(fs.readFileSync(path.join(app,'wing-lab.html'),'utf8'),html);
 const report={status:'passed',fixtureSha256:crypto.createHash('sha256').update(fixture).digest('hex'),cause:'Rigid-wing one-way coupling exceeds twist-to-lift feedback limit; geometry and aerodynamic mesh uncertainty are valid',original:summarize(original),separateLowerSpeedAlternatives:[summarize(lower),summarize(teaching)],refusalMessage:refusal.message,controller:{classifiedAsInputError:false,previousResultPreserved:true,currentGeometryPreview:true,busyOverlayCleared:true},numericalKernelsChanged:false};
 fs.writeFileSync(path.join(out,'REVIEW.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
