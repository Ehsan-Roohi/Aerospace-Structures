const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), assert=require('node:assert/strict');
const app=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..');
const ctx=vm.createContext({module:{exports:{}},console,performance});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);
const A=ctx.module.exports;
vm.runInContext(fs.readFileSync(path.join(app,'ui/wing-aero-ui.js'),'utf8'),ctx);
const U=ctx.module.exports;
const seq={sequence:'standard',flow:{speed:18,density:1.225,alphaDeg:5,viscosity:1.81e-5,speedOfSound:340.29},levels:A.sequenceMeshes('standard').map(m=>{
  const z=1/m.chordPanels+2/m.spanPanels;
  return {...m,strips:[[0,225,1+z,2+z,3+z,4+z,5+z,6+z],[225,450,2+z,3+z,4+z,5+z,6+z,7+z]],coefficients:{CL:.6+z,CLTrefftz:.61+z,CDpressure:.018+z,CDiTrefftz:.017+z,Cm:-.05+z}};
})};
const raw={naca:'2412',semiSpan:450,rootChord:160,tipChord:100};
const before=JSON.stringify(seq), summary=U.aerodynamicSummary(A,seq), combined=A.combineSequence(raw,seq);
assert.equal(JSON.stringify(summary.coefficients),JSON.stringify(combined.coefficients));
assert.equal(JSON.stringify(summary.rootWrench),JSON.stringify(combined.rootWrench));
assert.equal(JSON.stringify(summary.consistency),JSON.stringify(combined.consistency));
assert.equal(summary.strips.length,0);
assert.throws(()=>U.engineLoad(summary),/no structural strip load/);
for (const planform of ['elliptic','delta']) {
  const projected=A.combineSequence({...raw,tipChord:0,planform},seq);assert.ok(projected.closedTip);assert.ok(projected.strips.length);assert.ok(U.engineLoad(projected).strips.length);assert.equal(JSON.stringify(projected.rootWrench),JSON.stringify(combined.rootWrench));
  const c=U.aerodynamicSummary(A,seq);
  assert.equal(c.structuralLoadAvailable,false);
  assert.ok(Object.values(c.coefficients).every(e=>Number.isFinite(e.value)&&Number.isFinite(e.uncertainty)));
}
const csv=U.csv(U.recordFromSequence(seq,'test'),summary,null);
assert.match(csv,/No structural strip load was generated/);
assert.doesNotMatch(csv,/Delivered six-component strip load/);
assert.equal(JSON.stringify(seq),before);
console.log(JSON.stringify({coefficient_and_force_estimates_match_existing_combiner:true,closed_tip_aero_summary:true,explicit_closed_tip_projection_available:true,source_data_unchanged:true},null,2));
