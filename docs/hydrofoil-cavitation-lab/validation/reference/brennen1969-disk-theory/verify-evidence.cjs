// Audit stored matched cases and provenance. The source equations are never altered here.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const here=__dirname,checks=[];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const kernel=path.resolve(here,'../../../axisymmetric-cavity-nodal.js');
const kernelHash=sha(kernel),reference=JSON.parse(fs.readFileSync(path.join(here,'brennen-1969-theory-cp.json')));
assert.equal(reference.referenceType,'published numerical theory, manually digitized; not experimental measurements');
assert.equal(reference.points.length,32);checks.push('32 digitized theoretical points; measurements not claimed');
const receipt=[];
for(const target of [.3,.7])for(const Nc of [32,64,128]){
 const file=`sigma-${target.toFixed(1)}-Nc${Nc}.json`,r=JSON.parse(fs.readFileSync(path.join(here,file)));
 assert.equal(r.Nc,Nc);assert.equal(r.Nf,Nc/2);assert.equal(r.N,2*Nc);
 assert.equal(r.benchmark.kernelSha256,kernelHash);assert.ok(Math.abs(r.sigma-target)<5e-8);
 assert.ok(r.nodalConverged);assert.equal(r.accuracyQualified,false);
 assert.equal(r.fieldAudit.withinPriorOffgridThresholds,false);
 assert.deepEqual(r.fieldAudit.fractions,[.02,.05,.1,.25,.5,.75,.9,.95,.98]);
 assert.equal(r.fieldAudit.profiles.points.length,r.N*9);assert.equal(r.face.length,r.Nf+1);
 assert.equal(r.face[0].r_R,0);assert.equal(r.face.at(-1).r_R,1);
 assert.ok(Math.abs(r.face.at(-1).CpTrace+r.sigma)<1e-9);
 assert.equal(r.fieldAudit.thresholds.maxNormal_U,.01);assert.equal(r.fieldAudit.thresholds.maxCavityDynamicCpResidual,.02);
 assert.ok(r.benchmark.trace.every(p=>p.nodalConverged));
 checks.push(`${file}: source hash, matched sigma, all face nodes, nine-fraction data and unchanged failed screens`);
 receipt.push({file,sigma:r.sigma,L_R:r.L,Nc:r.Nc,total:r.N,fieldSamples:r.fieldAudit.profiles.points.length,accuracyQualified:r.accuracyQualified});
}
const files=fs.readdirSync(here).filter(name=>name!=='manifest.json'&&fs.statSync(path.join(here,name)).isFile()).sort();
assert.ok(!files.some(n=>n.endsWith('.pdf')||/overlay|hires|p680/.test(n)));checks.push('No source PDF or source screenshots in public evidence');
const manifest={created:new Date().toISOString(),reference:'Brennen1969 p680 Figure3, theoretical disk curves',experimental:false,
 kernelVersion:require(kernel).VERSION,kernelSha256:kernelHash,meshDefinition:'Nc cavity bands; Nf=Nc/2 each face; total N=2Nc',
 sigmaRootTolerance:5e-8,unchangedFieldLimits:{normal_U:.01,dynamicCp:.02},
 allCasesRemainUnqualified:true,checks,results:receipt,
 files:files.map(file=>({file,bytes:fs.statSync(path.join(here,file)).size,sha256:sha(path.join(here,file))}))};
fs.writeFileSync(path.join(here,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,files:files.length,kernelHash,allCasesRemainUnqualified:true}));
