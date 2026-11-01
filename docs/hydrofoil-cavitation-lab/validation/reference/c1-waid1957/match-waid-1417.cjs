'use strict';
// Independent experimental-case prediction. Only L/R is solved to match sigma;
// no cavity dimension or pressure datum is used to tune the solver.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const source=path.resolve(__dirname,'../../../axisymmetric-cavity-c1.js');
const C=require(source),Nc=Number(process.argv[2]||64),target=.1417,trace=[];
if(![64,128].includes(Nc))throw Error('This case study declares Nc64 and128.');
const expected='9bfb67177b372128a26c0893f7df35fc3bfadae5ea6e30a2770d6b71905bfc7c';
let sourceBytes=fs.readFileSync(source);
let hash=crypto.createHash('sha256').update(sourceBytes).digest('hex');
if(hash!==expected){sourceBytes=Buffer.from(sourceBytes.toString('utf8').replace(/\r\n/g,'\n'));hash=crypto.createHash('sha256').update(sourceBytes).digest('hex');}
if(hash!==expected)throw Error('Kernel differs from the reviewed declaration: '+hash);
async function run(L,audit=false){
 const r=await C.solve({L,Nc,Nf:Nc/2,nNear:24,nFar:12,maxIterations:28,tolerance:1e-10,audit});
 trace.push({L,sigma:r.sigma,nodalConverged:r.nodalConverged,residual:r.maxDynamicResidual,stopReason:r.stopReason,seconds:r.seconds,audit});
 console.log(JSON.stringify(trace.at(-1)));
 if(!r.nodalConverged)throw Error('Nodal convergence failed; no accepted prediction.');
 return r;
}
(async()=>{
 // The fine-mesh bracket comes from the completed coarse-mesh prediction,
 // not from measured cavity dimensions. Illinois prevents false-position stagnation.
 let a=await run(Nc===128?21.02:18),b=await run(Nc===128?21.04:24),r;
 if((a.sigma-target)*(b.sigma-target)>=0)throw Error('No declared sigma bracket.');
 let fa=a.sigma-target,fb=b.sigma-target,lastSide=0;
 for(let i=0;i<22;i++){
  let L=(a.L*fb-b.L*fa)/(fb-fa);
  if(!(L>a.L+1e-11&&L<b.L-1e-11))L=(a.L+b.L)/2;
  r=await run(L);
  if(Math.abs(r.sigma-target)<5e-8)break;
  if((r.sigma-target)*(a.sigma-target)>0){a=r;fa=r.sigma-target;if(lastSide===1)fb*=.5;lastSide=1;}
  else{b=r;fb=r.sigma-target;if(lastSide===-1)fa*=.5;lastSide=-1;}
 }
 if(!r||Math.abs(r.sigma-target)>=5e-8)throw Error('Prescribed sigma tolerance not met.');
 const out=await run(r.L,true);
 out.benchmark={source:'Waid1957, Fig17, zero-incidence disk cavity',targetSigma:target,
  sourceSha256:hash,sourceVersion:C.VERSION,inputs:{diskDiameter_m:.0254,speed_m_s:3.6576,incidence_deg:0,tunnelWidth_m:.508,tunnelHeight_m:.508,diskHeightAboveBottom_m:.3048},
  comparison:{experimentalAo:'disk to maximum radius, not total tail length',modelAo:'half the full disk-to-image separation, symmetry-defined',afterbodyAndGravity:'Model omits experimental sting, buoyant centreline rise and finite tunnel. Compare first-half width about the measured centreline; do not claim matched closure.'},
  rootTolerance:5e-8,trace,experimentalAccuracyQualified:false,
  predictions:{a0_over_d:out.L/4,b0_over_d:(out.Rmax-1)/2,Rmax_over_d:out.Rmax/2}};
 fs.writeFileSync(path.join(__dirname,`waid-1417-Nc${Nc}.json`),JSON.stringify(out));
 console.log(JSON.stringify({done:true,Nc,sigma:out.sigma,...out.benchmark.predictions,normal:out.fieldAudit.maxNormal_U,cp:out.fieldAudit.maxCavityDynamicCpResidual,fieldPassed:out.fieldAudit.withinPriorOffgridThresholds}));
})().catch(e=>{console.error(e);process.exitCode=1;});
