// Published-figure comparison. This adjusts L/R to a prescribed sigma, never the pressure data.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const here=__dirname;
function locateKernel(){
  if(process.argv[2])return path.resolve(process.argv[2]);
  for(let p=here;;p=path.dirname(p)){
    for(const candidate of [path.join(p,'axisymmetric-cavity-nodal.js'),path.join(p,'docs/hydrofoil-cavitation-lab/axisymmetric-cavity-nodal.js')])
      if(fs.existsSync(candidate))return candidate;
    if(path.dirname(p)===p)throw Error('Pass the path to axisymmetric-cavity-nodal.js as the first argument.');
  }
}
const kernelPath=locateKernel();
const C=require(kernelPath);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const meshes=[32,64,128],targets=[0.3,0.7];
async function matched(target,Nc){
  const Nf=Nc/2,trace=[];
  async function evaluate(L,audit=false){
    const r=await C.solve({L,Nc,Nf,maxIterations:24,tolerance:1e-10,audit});
    trace.push({L,sigma:r.sigma,residual:r.maxDynamicResidual,nodalConverged:r.nodalConverged,status:r.status,audit});
    if(!r.nodalConverged)throw Error('Nodal solve failed: '+JSON.stringify(trace.at(-1)));
    return r;
  }
  let lo=await evaluate(target===0.3?8:2.8),hi=await evaluate(target===0.3?10:3.4),r;
  if(!((lo.sigma-target)*(hi.sigma-target)<0))throw Error('No sigma root bracket');
  for(let i=0;i<20;i++){
    const span=hi.L-lo.L;
    let L=lo.L+(target-lo.sigma)*(hi.L-lo.L)/(hi.sigma-lo.sigma);
    if(!(L>lo.L+.03*span&&L<hi.L-.03*span))L=(lo.L+hi.L)/2;
    r=await evaluate(L);
    if(Math.abs(r.sigma-target)<5e-8)break;
    if((r.sigma-target)*(lo.sigma-target)>0)lo=r;else hi=r;
  }
  if(Math.abs(r.sigma-target)>=5e-8)throw Error('Inverse sigma tolerance not met');
  const out=await evaluate(r.L,true);
  out.benchmark={source:'Brennen (1969), Figure 3, theoretical Riabouchinsky disk curves',targetSigma:target,rootTolerance:5e-8,inverseInput:'L/R (full disk-to-image separation)',trace,kernelSha256:sha(kernelPath),kernelVersion:C.VERSION,experimental:false,externalAccuracyQualified:false,normalization:{r:'r / front disk radius R',Cp:'1 - (q/U)^2',L:'full disk-to-image separation / R'}};
  const filename=`sigma-${target.toFixed(1)}-Nc${Nc}.json`;
  fs.writeFileSync(path.join(here,filename),JSON.stringify(out));
  console.log(JSON.stringify({file:filename,target,Nc,Nf,L:out.L,sigma:out.sigma,CD:out.CD,CDover1PlusSigma:out.CD/(1+out.sigma),status:out.status,accuracyQualified:out.accuracyQualified,field:{normal:out.fieldAudit.maxNormal_U,dynamic:out.fieldAudit.maxCavityDynamicCpResidual,pass:out.fieldAudit.withinPriorOffgridThresholds},iterations:trace.length}));
  return filename;
}
(async()=>{
  const files=[];
  for(const target of targets)for(const Nc of meshes)files.push(await matched(target,Nc));
  fs.writeFileSync(path.join(here,'matched-disk-index.json'),JSON.stringify({created:new Date().toISOString(),kernelVersion:C.VERSION,kernelSha256:sha(kernelPath),files},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
