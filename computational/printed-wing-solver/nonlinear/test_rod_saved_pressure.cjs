// Regression from the actual user study: Clark Y, 900x400 mm, 4 mm rod,
// 0.25 mm radial clearance, saved Fine pressure field at V=50 m/s, alpha=0.
// Uses all six saved pressure components; no pressure or criterion is scaled.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),ctx=vm.createContext({module:{exports:{}},console,setTimeout,performance});vm.runInContext(fs.readFileSync(path.join(root,'docs/wing-panel-stress-analyzer/nonlinear/flexible_bundle.js'),'utf8'),ctx);
const out=path.join(root,'output/rod-repair-current');fs.mkdirSync(out,{recursive:true});
vm.runInContext(fs.readFileSync(path.join(root,'docs/wing-panel-stress-analyzer/ui/wing-aero-ui.js'),'utf8'),ctx);
const fixtureData=JSON.parse(fs.readFileSync(path.join(root,'docs/wing-panel-stress-analyzer/validation/fixtures/clarky-900mm-sleeve-pressure-2026-11-06.json'),'utf8')),fixture=fixtureData.input,results=[];
for(const bonded of [true,false])for(const n of [20,40,80]){
 ctx.input=JSON.parse(JSON.stringify(fixture));ctx.input.assembly.rodsBonded=bonded;ctx.input.nElements=n;
 console.log('Saved pressure regression',bonded?'bonded':'sleeve',n);const start=performance.now(),r=vm.runInContext('WingEngine.solve(input)',ctx),v=r.verification,a=r.analysis3D;
 assert.ok(v.energyError<1e-7);assert.ok(v.forceError<1e-5*Math.max(1,Math.hypot(...v.totalForce)));assert.ok(v.momentError<1e-5*Math.max(1,Math.hypot(...v.totalMoment)));assert.ok(v.maxPenetration<1.01e-6);assert.ok(v.contactResidual<=1e-6);assert.equal(a.validity.smallDisplacement,true);
 assert.ok(a.aeroLoad.transferResidual.force<1e-7);assert.ok(a.aeroLoad.transferResidual.moment<1e-4);
 assert.ok(a.nodes.length<fixture.aeroLoad.strips.length+n,'pressure boundaries must not force a separate structural node');
 let admission=null;if(!bonded&&n===40){ctx.record=fixtureData.record;ctx.solved=r;admission=vm.runInContext('(()=>{const g=WingEngine.makeGeometry(input.geometry),c=WingAeroUI.delivered(WingAeroPanel,g,record,[...WingEngine.ribStations(g),...WingEngine.seams(g)]),a=WingAeroUI.admit(WingAeroPanel,g,record,c,solved);if(!a.admitted&&!WingAeroUI.prescribedLoadEligible(a))throw Error("Saved user case has no displayable structural response: "+JSON.stringify(a));return {admitted:a.admitted,prescribed:WingAeroUI.prescribedLoadEligible(a),rows:a.rows};})()',ctx);}
 const rows=Array.from({length:61},(_,i)=>{const y=fixture.geometry.semiSpan*i/60,s=a.frameAt(y);return {y,displacement:s.displacement,rotation:s.rotation};});
 results.push({bonded,requestedElements:n,actualNodes:a.nodes.length,admission,tip_mm:r.deflection.at(-1),verification:v,validity:a.validity,pressureTransfer:a.aeroLoad.transferResidual,elapsedMs:performance.now()-start,profile:rows});fs.writeFileSync(path.join(out,'saved-pressure-regression.json'),JSON.stringify({passed:false,complete:false,results},null,2));
}
for(const bonded of [true,false]){const fine=results.filter(r=>r.bonded===bonded).slice(-2),relative=Math.abs(fine[1].tip_mm/fine[0].tip_mm-1);assert.ok(relative<.002,'40/80-element saved-case deflection refinement below 0.2%');}
fs.writeFileSync(path.join(out,'saved-pressure-regression.json'),JSON.stringify({passed:true,force_N:fixture.aeroLoad.strips.reduce((s,r)=>s+r[4],0),results},null,2));console.log('SAVED_CASE_SUMMARY '+JSON.stringify(results.map(r=>({bonded:r.bonded,n:r.requestedElements,tip:r.tip_mm,energy:r.verification.energyError,gap:r.verification.maxPenetration,contact:r.verification.contactResidual,iterations:r.verification.iterations,admission:r.admission}))));console.log('PASS: exact saved Fine pressure, both connections, three meshes, conserved six-component loads, unchanged equilibrium/contact/energy criteria.');
