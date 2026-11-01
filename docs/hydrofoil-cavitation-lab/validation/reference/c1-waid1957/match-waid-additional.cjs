'use strict';
// Independent multi-case prediction. Match sigma only; no measured
// dimension enters geometry or the inverse search. Never modify kernel/gates.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const here=__dirname,source=path.resolve(here,'../../../axisymmetric-cavity-c1.js');
const expected='9bfb67177b372128a26c0893f7df35fc3bfadae5ea6e30a2770d6b71905bfc7c';
let sourceBytes=fs.readFileSync(source);
let hash=crypto.createHash('sha256').update(sourceBytes).digest('hex');
if(hash!==expected){sourceBytes=Buffer.from(sourceBytes.toString('utf8').replace(/\r\n/g,'\n'));hash=crypto.createHash('sha256').update(sourceBytes).digest('hex');}
if(hash!==expected)throw Error('Kernel hash differs from reviewed declaration: '+hash);
const C=require(source),data=JSON.parse(fs.readFileSync(path.join(here,'waid-digitization.json')));
const selected=process.argv.slice(2).map(Number);
if(!selected.length||selected.some(n=>![1,3,4].includes(n)))throw Error('Choose Waid marker indices1,3,4; index2 is independently owned by root.');
const bracket={1:[22,24],3:[18,22],4:[16,20]};
async function matched(index,Nc){
 const exp=data.points[index-1],target=exp.sigma,trace=[];
 const filename=`waid-marker${index}-Nc${Nc}.json`,failure=`waid-marker${index}-Nc${Nc}-failure.json`;
 let last;
 async function run(L,audit=false){
  if(!Number.isFinite(L)||L<2||L>24)throw Error('Declared L/R interval2..24 exceeded');
  const r=await C.solve({L,Nc,Nf:Nc/2,nNear:24,nFar:12,maxIterations:28,tolerance:1e-10,audit});last=r;
  const row={index,Nc,L,sigma:r.sigma,matchError:r.sigma-target,nodalConverged:r.nodalConverged,
   physicalBranch:r.physicalBranch,residual:r.maxDynamicResidual,status:r.status,stopReason:r.stopReason,seconds:r.seconds,audit};
  trace.push(row);console.log(JSON.stringify(row));
  fs.writeFileSync(path.join(here,`waid-marker${index}-Nc${Nc}-progress.json`),JSON.stringify({target,sourceSha256:hash,trace}));
  if(!r.nodalConverged||!r.physicalBranch)throw Error('Rejected nodal/geometry prediction; retained in failure report.');
  return r;
 }
 try{
  let [l,h]=bracket[index];
  if(Nc===128){
   const coarse=JSON.parse(fs.readFileSync(path.join(here,`waid-marker${index}-Nc64.json`)));
   l=Math.max(2,coarse.L-.05);h=Math.min(24,coarse.L+.05);
  }
  let a=await run(l),b=await run(h),r;
  if((a.sigma-target)*(b.sigma-target)>=0){
   [l,h]=bracket[index];a=await run(l);b=await run(h);
  }
  if((a.sigma-target)*(b.sigma-target)>=0)throw Error('No sigma bracket in declared interval; no extrapolation.');
  let fa=a.sigma-target,fb=b.sigma-target,lastSide=0;
  for(let it=0;it<22;it++){
   let L=(a.L*fb-b.L*fa)/(fb-fa);
   // Only a roundoff/end-point guard; a2% guard would unnecessarily force
   // bisection when a legitimate secant estimate is near an endpoint.
   if(!(L>a.L+1e-11&&L<b.L-1e-11))L=(a.L+b.L)/2;
   r=await run(L);
   if(Math.abs(r.sigma-target)<5e-8)break;
   if((r.sigma-target)*(a.sigma-target)>0){a=r;fa=r.sigma-target;if(lastSide===1)fb*=.5;lastSide=1;}
   else{b=r;fb=r.sigma-target;if(lastSide===-1)fa*=.5;lastSide=-1;}
  }
  if(!r||Math.abs(r.sigma-target)>=5e-8)throw Error('Prescribed sigma tolerance5e-8 not met.');
  const out=await run(r.L,true);
  if(Math.abs(out.sigma-target)>=5e-8)throw Error('Audited replay sigma differs from input tolerance.');
  out.benchmark={source:'Waid1957 Figs12/13; zero-incidence open-circle U12ft/s,d1in series',
   pointId:exp.id,markerIndex:index,targetSigma:target,sigmaInputKind:exp.sigma_input_kind,
   rootTolerance:5e-8,sourceSha256:hash,sourceVersion:C.VERSION,trace,
   solverInputs:{Nc,Nf:Nc/2,nNear:24,nFar:12,tolerance:1e-10,maxIterations:28,LRange:[2,24]},
   inputMatched:'sigma only; no measured cavity dimension is fitted',
   predictions:{a0_over_d:out.L/4,b0_over_d:(out.Rmax-1)/2,Rmax_over_R:out.Rmax},
   measured:{a0_over_d:exp.a0_over_d,b0_over_d:exp.b0_over_d,rmax_over_R:exp.rmax_over_R},
   digitizationBounds:data.manual_reading_bounds,
   unmatchedPhysics:['finite free-surface tunnel','gravity/buoyant centreline','sting/strut','ventilation and physical closure'],
   experimentalAccuracyQualified:false};
  fs.writeFileSync(path.join(here,filename),JSON.stringify(out));
  console.log(JSON.stringify({done:true,index,Nc,target,sigma:out.sigma,...out.benchmark.predictions,
   normal:out.fieldAudit.maxNormal_U,cp:out.fieldAudit.maxCavityDynamicCpResidual,fieldPassed:out.fieldAudit.withinPriorOffgridThresholds}));
 }catch(e){
  fs.writeFileSync(path.join(here,failure),JSON.stringify({index,Nc,target,error:String(e),sourceSha256:hash,trace,lastResult:last}));
  console.error(JSON.stringify({failed:true,index,Nc,error:String(e),failure}));
  throw e;
 }
}
(async()=>{for(const index of selected){await matched(index,64);await matched(index,128);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
