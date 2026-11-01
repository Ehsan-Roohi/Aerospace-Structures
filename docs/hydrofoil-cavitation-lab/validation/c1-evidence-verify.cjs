'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const here=__dirname,read=p=>JSON.parse(fs.readFileSync(path.join(here,p),'utf8'));
const manifest=read('c1-evidence-manifest.json');
let equivalentCRLFCheckouts=0;
for(const [name,expected] of Object.entries(manifest.files)){
 let bytes=fs.readFileSync(path.join(here,name));
 // Published text uses LF. A Windows Git checkout may add CR before LF;
 // accept it only when removing those CR bytes restores the exact stored hash.
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 if(hash(bytes)!==expected.sha256&&/\.(?:js|cjs|py|json|html|md|svg)$/.test(name)){
  const canonical=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
  if(hash(canonical)===expected.sha256){bytes=canonical;equivalentCRLFCheckouts++;}
 }
 assert.equal(bytes.length,expected.bytes,name+' byte count');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected.sha256,name+' hash');
}
const s=read('c1-cavity-mesh-study.json');
for(const n of [32,64,128,256]){
 const m=s.meshes[n],a=m.audit;
 assert.equal(m.nodalConverged,true);assert.equal(m.N,2*m.Nf+m.Nc);
 assert.equal(a.withinPriorOffgridThresholds,true);
 assert.ok(a.maxNormal_U<=.01&&a.maxCavityDynamicCpResidual<=.02);
 assert.equal(m.profiles.points.length,m.N*9);
 assert.deepEqual(a.fractions,[.02,.05,.1,.25,.5,.75,.9,.95,.98]);
 assert.ok(m.profiles.normal_U.every(Number.isFinite));
}
const idx=read('reference/c1-brennen/matched-disk-index.json');
assert.equal(idx.files.length,6);
for(const file of idx.files){
 const r=read('reference/c1-brennen/'+file);
 assert.ok(Math.abs(r.sigma-r.benchmark.targetSigma)<5e-8);
 assert.equal(r.benchmark.experimental,false);assert.equal(r.accuracyQualified,false);
 assert.equal(r.fieldAudit.profiles.points.length,r.N*9);
}
const full=read('c1-cavity-verification.json'),guards=read('c1-reviewed-verification.json'),ui=read('curved-cavity-ui-smoke.json');
assert.ok(full.checks.every(c=>c.passed)&&guards.checks.every(c=>c.passed));
assert.ok(guards.pythonParity.every(c=>c.passed));assert.equal(ui.failures,0);
assert.equal(manifest.experimentalValidation,'NOT_PERFORMED');
console.log(JSON.stringify({status:'PASS_CURRENT_C1_EVIDENCE',hashedFiles:Object.keys(manifest.files).length,equivalentCRLFCheckouts,meshes:4,matchedCases:6,fullChecks:full.checks.length,guardChecks:guards.checks.length,pythonParityChecks:guards.pythonParity.length,UIchecks:ui.checks.length}));
