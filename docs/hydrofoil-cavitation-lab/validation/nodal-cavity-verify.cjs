const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto'),path=require('path');
const P=require('../axisymmetric-cavity-nodal.js');
process.chdir(path.join(__dirname,'reference','nodal-cavity'));
(async()=>{
 const controls=[],reject=async(name,options)=>{let e=null;try{await P.solve(options);}catch(x){e=x.message;}assert.ok(e,`${name} must reject`);controls.push({name,rejected:true,error:e});};
 for(const[name,opts]of[
  ['infinite tolerance',{tolerance:Infinity}],['negative qc',{Nc:8,Nf:4,initialState:[0,0,0,0,-1.14]}],
  ['invalid geometry seed',{Nc:8,Nf:4,initialState:[-100,-100,-100,-100,1.14]}],
  ['zero iterations',{maxIterations:0}],['infinite length',{L:Infinity}],['string length',{L:'8'}],
  ['string cavity count',{Nc:'32'}],['odd cavity count',{Nc:31}],['fractional quadrature',{nNear:16.5}],
  ['resource-bound mesh',{Nc:100000}],['invalid reference radius',{Rm:NaN}],
  ['negative tolerance',{tolerance:-1}],['huge tolerance',{tolerance:1}],
  ['nonfinite seed',{Nc:8,Nf:4,initialState:[0,0,NaN,0,1.14]}]
 ])await reject(name,opts);
 const one=await P.solve({Nc:16,Nf:8,maxIterations:1,audit:false});
 assert.equal(one.nodalConverged,false);assert.equal(one.stopReason,'iteration limit');
 controls.push({name:'maximum iterations one',nodalConverged:one.nodalConverged,residual:one.maxDynamicResidual,stopReason:one.stopReason});
 let cancelled=false,ce=null;const start=Date.now();
 try{await P.solve({Nc:16,Nf:8},{isCancelled:()=>cancelled,onProgress:o=>{if(o.stage==='Newton shape Jacobian'&&o.column===2)cancelled=true;}});}catch(e){ce=e.message;}
 assert.equal(ce,'Cancelled');controls.push({name:'cancel during shape Jacobian',error:ce,seconds:(Date.now()-start)/1000});
 // Re-evaluate the identical physical points using the standalone JS kernel.
 const probes=[];
 for(const row of JSON.parse(fs.readFileSync('fixed-field-probes.json'))){
  const a=JSON.parse(fs.readFileSync(`L8-Nf${row.Nc/2}-Nc${row.Nc}-audit.json`));
  const v=P.velocity(a.nodes,a.gamma,row.points_R,{nNear:32});
  const err=Math.max(...v.flatMap((r,i)=>r.map((val,j)=>Math.abs(val-row.velocity_U[i][j]))));
  assert.ok(err<1e-8);probes.push({Nc:row.Nc,maxPythonDifference_U:err,points_R:row.points_R,velocity_U:v});
 }
 const kernels=[];const panels={oblique:[[.2,.9],[.35,1.05]],'disk-axis':[[0,0],[0,.2]],'disk-rim':[[0,.85],[0,1]]};
 for(const row of JSON.parse(fs.readFileSync('wet-kernel-audit.json')).kernel){
  const[a,b]=panels[row.panel],L=Math.hypot(b[0]-a[0],b[1]-a[1]),t=[(b[0]-a[0])/L,(b[1]-a[1])/L],n=[-t[1],t[0]],point=a.map((v,k)=>v+row.fraction*L*t[k]+row.offset_L*L*n[k]);
  const[va,vb]=P.panelInfluence(a,b,point,{nNear:32}),v=va.map((r,k)=>.7*r-.4*vb[k]);
  const err=Math.max(...v.map((r,k)=>Math.abs(r-row.panelVelocity[k])));
  assert.ok(err<1e-9);kernels.push({panel:row.panel,offset_L:row.offset_L,maxPythonDifference_U:err,biotSavartDifference_U:Math.max(...v.map((r,k)=>Math.abs(r-row.biotSavart1600[k])))});
 }
 const nonlinearParity=[];
 for(const Nc of [32,64]){
  const reference=JSON.parse(fs.readFileSync(`L8-Nf${Nc/2}-Nc${Nc}-result.json`));
  const actual=await P.solve({L:8,Nc,Nf:Nc/2,nNear:16});
  const differences={sigma:actual.sigma-reference.sigma,Rmax:actual.Rmax-reference.Rmax,CD:actual.CD-reference.CD};
  assert.ok(Object.values(differences).every(v=>Math.abs(v)<1e-7));
  assert.equal(actual.accuracyQualified,false);
  assert.equal(actual.nodalConverged,actual.physicalBranch&&actual.maxDynamicResidual<=actual.requestedNodalTolerance);
  assert.ok(actual.fieldAudit.maxNormal_U>.01&&actual.fieldAudit.maxCavityDynamicCpResidual>.02);
  nonlinearParity.push({Nc,differences,sigma:actual.sigma,Rmax:actual.Rmax,CD:actual.CD,nodalResidual:actual.maxDynamicResidual,nodalConverged:actual.nodalConverged,fieldAudit:actual.fieldAudit});
 }
 const sourceSha256={};for(const name of ['axi_cavity.py','axi_ring.py','axi_bem.py']){const file=path.join('python',name);sourceSha256[name]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
 const portSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..','axisymmetric-cavity-nodal.js'))).digest('hex');
 const out={date:"2026-10-31",status:"PASS_NUMERICAL_IMPLEMENTATION_ONLY",nonlinearParity,controls,fixedPhysicalFieldParity:probes,kernelParity:kernels,sourceSha256,portSha256,scope:'Code parity, controls and exact wet-body verification are not experimental developed-cavity validation.'};
 fs.writeFileSync(path.join(__dirname,'nodal-cavity-verification.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({controls:controls.length,maxFixedFieldParityError:Math.max(...probes.map(p=>p.maxPythonDifference_U)),maxKernelParityError:Math.max(...kernels.map(p=>p.maxPythonDifference_U)),portSha256}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
