// Controlled structural design study for the exact 900 mm / 50 m/s user case.
// All candidates retain the same outer aerodynamic surface, alpha, flow and
// complete eight-mesh pressure-load record. Only named internal changes vary.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const app=path.resolve(__dirname,'..'),web=path.resolve(app,'../../computational/printed-wing-solver/web');
const html=fs.readFileSync(path.join(app,'index.html'),'utf8'),read=n=>fs.readFileSync(path.join(app,n),'utf8');
const ctx=vm.createContext({module:{exports:{}},require:createRequire(path.join(web,'engine.js')),console,performance,TextEncoder,TextDecoder,URL,Buffer});
vm.runInContext(read('wing-aero/aero_bundle.js'),ctx);const A=ctx.module.exports;
const ea=html.indexOf('const WingEngine ='),eb=html.indexOf('module.exports = WingEngine;',ea)+'module.exports = WingEngine;'.length;
vm.runInContext(html.slice(ea,eb),ctx);const E=ctx.module.exports;
vm.runInContext(read('ui/wing-aero-ui.js'),ctx);const U=ctx.module.exports;
vm.runInContext(read('wing-aero/wing_study_io.js'),ctx);const IO=ctx.module.exports;
IO.setAeroGeometryKey(g=>IO.sha256(A.geometryKey(g)));
const raw=read('validation/fixtures/900mm-panel-load-2026-10-30.json'),original=JSON.parse(raw),snapshot=JSON.stringify(original),outerKey=A.geometryKey(original.study.geometry);
const out=process.env.OUT||path.resolve(__dirname,'../../..','output','900mm-spar-skin-study');fs.mkdirSync(out,{recursive:true});
const clone=x=>JSON.parse(JSON.stringify(x)),cases=[
 {id:'original_one_spar_skin1p2',label:'Original: one spar; skin 1.2 mm',edit:()=>{}},
 {id:'two_spars_0p25_0p65_skin1p2',label:'Two spars: 0.25c / 0.65c; skin 1.2 mm',edit:g=>g.spars.push({...clone(g.spars[0]),fraction:.65})},
 {id:'two_spars_0p25_0p70_skin1p2',label:'Two spars: 0.25c / 0.70c; skin 1.2 mm',edit:g=>g.spars.push({...clone(g.spars[0]),fraction:.70})},
 ...[1.3,1.4,1.6,2,2.4,2.8,3.2].map(skin=>({id:'one_spar_skin'+String(skin).replace('.','p'),label:`One spar; skin ${skin} mm`,edit:g=>{g.skin=skin;}})),
 {id:'two_spars_0p25_0p65_skin1p3',label:'Two spars: 0.25c / 0.65c; skin 1.3 mm',edit:g=>{g.skin=1.3;g.spars.push({...clone(g.spars[0]),fraction:.65});}},
 ...[[.55,20],[.45,32]].map(([fraction,width])=>({id:`two_spars_0p25_${String(fraction).replace('.','p')}_skin1p3_caps${width}t1p2`,label:`Two spars: 0.25c / ${fraction}c; skin 1.3 mm; caps ${width} x 1.2 mm`,edit:g=>{g.skin=1.3;g.spars.push({...clone(g.spars[0]),fraction});for(const s of g.spars){s.topWidth=s.bottomWidth=width;s.topThickness=s.bottomThickness=1.2;}}})),
 {id:'two_spars_0p25_0p65_skin1p6',label:'Two spars: 0.25c / 0.65c; skin 1.6 mm',edit:g=>{g.skin=1.6;g.spars.push({...clone(g.spars[0]),fraction:.65});}},
 {id:'two_spars_0p25_0p55_skin2p0',label:'Two spars: 0.25c / 0.55c; skin 2.0 mm',edit:g=>{g.skin=2;g.spars.push({...clone(g.spars[0]),fraction:.55});}},
 {id:'two_spars_0p25_0p50_skin2p8',label:'Two spars: 0.25c / 0.50c; skin 2.8 mm',edit:g=>{g.skin=2.8;g.spars.push({...clone(g.spars[0]),fraction:.5});}},
 ...[2,2.4].map(skin=>({id:`two_spars_0p25_0p65_cavityEnd0p85_skin${String(skin).replace('.','p')}`,label:`Two spars: 0.25c / 0.65c; cavity end 0.85c; skin ${skin} mm`,edit:g=>{g.skin=skin;g.cavityEnd=.85;g.spars.push({...clone(g.spars[0]),fraction:.65});}})),
];
const results=[],profiles=[];let force0;
const selectedCases=process.env.CASE_FILTER?cases.filter(c=>process.env.CASE_FILTER.split(',').includes(c.id)):cases;
assert.ok(selectedCases.length,'CASE_FILTER must match at least one named design');
for(const candidate of selectedCases){
 const doc=clone(original);candidate.edit(doc.study.geometry);doc.projectName=candidate.label;
 assert.equal(A.geometryKey(doc.study.geometry),outerKey,'outer aerodynamic shape stays identical');
 assert.equal(JSON.stringify(doc.study.aeroLoad),JSON.stringify(original.study.aeroLoad),'all aerodynamic mesh levels, wrenches and flow remain identical');
 const imported=IO.importPrintedStudy(JSON.stringify(doc),E),record={id:candidate.id,label:candidate.label,skinMm:doc.study.geometry.skin,sparFractions:doc.study.geometry.spars.map(s=>s.fraction),flow:clone(doc.study.aeroLoad.flow),geometryValid:imported.ok};
 if(!imported.ok){record.geometryErrors=imported.errors;results.push(record);console.log(candidate.id,'GEOMETRY REFUSED',JSON.stringify(imported.errors));continue;}
 const S=imported.state,g=E.makeGeometry(S.geometry),snap=[...E.ribStations(g),...E.seams(g),...g.spars.map(s=>s.length)],combined=U.delivered(A,g,S.aeroLoad,snap),input={...IO.printedEngineInput(S,E),aeroLoad:U.engineLoad(combined,S.aeroLoad.label)},t=performance.now();
 let r,adm;try{r=E.solve(input);adm=U.admit(A,g,S.aeroLoad,combined,r);}catch(error){record.solverRefused=true;record.solverError=error.message;record.milliseconds=performance.now()-t;results.push(record);console.log(candidate.id,'SOLVER REFUSED',error.message);continue;}
 const an=r.analysis3D,w=Array.from(an.aeroLoad.appliedWrench.force);
 if(!force0)force0=w;else w.forEach((v,i)=>assert.ok(Math.abs(v-force0[i])<1e-9,'identical external force'));
 const root=an.cutAt(0),tip=an.frameAt(g.semiSpan),stress=an.normalStress;
 Object.assign(record,{admitted:adm.admitted,failed:Array.from(adm.failed),smallDisplacement:an.validity.smallDisplacement,linearScreen:an.validity,semiWingForceN:w,rootShearCentreMm:root.scLocal,rootTorqueNmm:root.localMoment[0],rootGJNmm2:root.GJ,tipTranslationMm:Array.from(tip.displacement),tipTwistDeg:adm.twist.tipTheta*180/Math.PI,liftChangeFraction:adm.twist.rigidWingEffect,twistStatus:adm.twist.status,massG:r.mass.total,sparMassG:r.mass.spars,nominalSkinStressMpa:{sampledTensionMax:Math.max(...Array.from(stress.skinTension).filter(Number.isFinite)),sampledCompressionMax:Math.max(...Array.from(stress.skinCompression).filter(Number.isFinite))},nominalSparStressMpa:stress.spars,milliseconds:performance.now()-t});
 const filename=(adm.admitted&&an.validity.smallDisplacement?'ADMITTED_':'WITHHELD_')+candidate.id+'_50mps.json';
 fs.writeFileSync(path.join(out,filename),JSON.stringify(doc,null,2)+'\n');record.file=filename;
 for(let i=0;i<=30;i++){
  const y=g.semiSpan*i/30,f=an.frameAt(y),cut=an.cutAt(y),e=f.element.R[0],theta=f.rotation.reduce((sum,v,k)=>sum+v*e[k],0)*180/Math.PI;
  profiles.push({case:candidate.id,label:candidate.label,yMm:y,translationXmm:f.displacement[0],translationYmm:f.displacement[1],translationZmm:f.displacement[2],twistDeg:theta,GJNmm2:cut.GJ,shearCentreXmm:cut.scLocal[0],torqueNmm:cut.localMoment[0]});
 }
 results.push(record);console.log(candidate.id,JSON.stringify({admitted:record.admitted,linear:record.smallDisplacement,mass:record.massG,translation:record.linearScreen.maxTranslation,tipTwist:record.tipTwistDeg,feedbackPct:100*record.liftChangeFraction,GJ:record.rootGJNmm2}));
}
assert.equal(JSON.stringify(original),snapshot,'original user document is immutable');
if(!process.env.CASE_FILTER){
 assert.equal(results[0].admitted,false);assert.deepEqual(results[0].failed,['One-way coupling: twist effect on lift']);
 const at=id=>results.find(v=>v.id===id),second=at('two_spars_0p25_0p65_skin1p2');
 assert.equal(second.geometryValid,true);assert.equal(second.admitted,false);assert.equal(second.smallDisplacement,false);
 assert.ok(Math.abs(second.tipTwistDeg)<Math.abs(results[0].tipTwistDeg));assert.ok(second.liftChangeFraction>.02,'second spar is not an automatically successful fix');
 assert.equal(at('one_spar_skin1p4').geometryValid,false,'thickening must still retain a viable hollow tip');
 const message=U.admissionFailure({rows:[{kind:'aeroelastic',admitted:false,value:.03,tolerance:.02}],failed:['One-way coupling: twist effect on lift']}).message;
 assert.match(message,/not a guaranteed fix/);assert.match(message,/thicker skin must still leave a valid cavity/);
}
const fields=['case','yMm','translationXmm','translationYmm','translationZmm','twistDeg','GJNmm2','shearCentreXmm','torqueNmm'];
fs.writeFileSync(path.join(out,'spanwise_profiles.csv'),fields.join(',')+'\n'+profiles.map(p=>fields.map(k=>p[k]??'').join(',')).join('\n')+'\n');
const report={status:'completed',fixtureSha256:crypto.createHash('sha256').update(raw).digest('hex'),engineSha256:crypto.createHash('sha256').update(html.slice(ea,eb)).digest('hex'),numericalScope:'Published linear nominal spatial-beam response, eight-mesh aerodynamic load admission; no new material law, nonlinear aeroelastic iteration or strength validation',control:'Identical outer geometry, 50 m/s, alpha 2 degrees, density 1.225 kg/m3, same solved pressure sequence and self-weight OFF; only named internal skin/spar geometry varies',identicalAerodynamicKey:true,identicalAppliedWrenches:true,stressScope:'Maxima summarize the production normal-stress sample arrays; no local strength or nonlinear accuracy is established.',results,profiles};
fs.writeFileSync(path.join(out,'REVIEW.json'),JSON.stringify(report,null,2)+'\n');
console.log('Output:',out);
