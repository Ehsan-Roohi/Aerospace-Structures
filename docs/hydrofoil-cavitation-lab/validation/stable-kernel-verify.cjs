'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../axisymmetric-cavity-nodal.js');
const ref=JSON.parse(fs.readFileSync(path.join(__dirname,'stable-kernel-reference.json')));
const checks=[],evidence={};
function check(name,fn){try{const details=fn();checks.push({name,passed:true,...details});}catch(e){checks.push({name,passed:false,error:e.message});}}
check('Malformed declared trace indices are refused',()=>{for(const ids of [[],[0,0],[-1],[1.5],[999]])assert.throws(()=>C.velocity([[0,1],[1,1]],[1,1],[[.5,1]],{onPanelIndices:ids}),/indices/);return{malformedCases:5};});
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],maxabs=x=>Math.max(...x.map(Math.abs));

check('All elliptic coefficients / switch / extreme q against 400-digit original AGM',()=>{
 const rows=ref.elliptic.map(row=>{const got=C.KE(row.q),relative=got.map((v,i)=>Math.abs(v-row.reference[i])/Math.max(1e-300,Math.abs(row.reference[i])));return{q:row.q,computed:got,reference:row.reference,relative};});
 const maxK=Math.max(...rows.map(r=>r.relative[0])),maxE=Math.max(...rows.map(r=>r.relative[1]));
 // Above the asymptotic switch E-1 is still an ordinary subtraction, so the
 // direct high-relative-accuracy assertion applies to the q<=1e-4 branch only.
 const maxEm1=Math.max(...rows.filter(r=>r.q<=1e-4).map(r=>r.relative[2]));
 const maxAbsEm1=Math.max(...rows.filter(r=>r.q<=1e-4).map(r=>Math.abs(r.computed[2]-r.reference[2])));
 assert.ok(maxK<4e-15);assert.ok(maxE<4e-15);assert.ok(maxEm1<2e-13);assert.ok(maxAbsEm1<5e-17);
 evidence.elliptic=rows;return{maxRelativeK:maxK,maxRelativeE:maxE,maxRelativeDirectEm1:maxEm1,maxAbsoluteDirectEm1:maxAbsEm1};
});
check('Stable remainder agrees with 400-digit original kernel subtraction across separation and scale',()=>{
 const rows=ref.kernel.map(row=>{const got=C.vortexRemainder(...row.point),ring=C.vortexRing(...row.point),normalizedError=maxabs(got.map((v,k)=>(v-row.remainder[k])*row.lengthScale));return{...row,computed:got,normalizedError,ringRelativeError:maxabs(ring.map((v,k)=>(v-row.ring[k])/Math.max(Math.abs(row.ring[k]),1)))};});
 const worst=Math.max(...rows.map(r=>r.normalizedError));assert.ok(worst<3e-13,`scaled remainder error ${worst}`);evidence.kernel=rows;return{fixtures:rows.length,maxErrorTimesLengthScale:worst};
});

check('Declared boundary trace has the exact sheet jump and liquid/interior normal continuity',()=>{
 const a=[.2,.9],b=[.35,1.05],f=.37,p=a.map((v,k)=>v+f*(b[k]-v)),L=Math.hypot(b[0]-a[0],b[1]-a[1]),t=b.map((v,k)=>(v-a[k])/L),n=[-t[1],t[0]],ga=.7,gb=-.4;
 const ev=C.velocity([a,b],[ga,gb],[p],{nNear:64,onPanelIndices:[0]})[0],iv=C.velocity([a,b],[ga,gb],[p],{nNear:64,onPanelIndices:[0],side:-1})[0];
 const jump=dot(ev,t)-dot(iv,t),expected=-(ga*(1-f)+gb*f),normalJump=dot(ev,n)-dot(iv,n);
 assert.ok(Math.abs(jump-expected)<2e-14);assert.ok(Math.abs(normalJump)<2e-14);
 evidence.trace={a,b,p,f,exterior:ev,interior:iv,jump,expected,normalJump};return{jump,expected,normalJump};
});

check('Exterior/interior offset limits approach the declared trace, without moving pressure targets',()=>{
 const {a,b,p,exterior,interior}=evidence.trace,L=Math.hypot(b[0]-a[0],b[1]-a[1]),t=b.map((v,k)=>(v-a[k])/L),n=[-t[1],t[0]],rows=[];
 for(const side of [1,-1])for(const eps of [1e-5,1e-7,1e-9]){const target=p.map((v,k)=>v+side*eps*n[k]),v=C.velocity([a,b],[.7,-.4],[target],{nNear:64})[0],trace=side===1?exterior:interior;rows.push({side,eps,target,velocity:v,error:maxabs(v.map((x,k)=>x-trace[k]))});}
 for(const side of [1,-1]){const seq=rows.filter(r=>r.side===side);assert.ok(seq[2].error<seq[0].error);assert.ok(seq[2].error<2e-7);}
 evidence.offsetLimits=rows;return{finalExteriorError:rows[2].error,finalInteriorError:rows[5].error};
});

check('False off-surface hints, endpoints and panel extensions are rejected by public geometric guard',()=>{
 const a=[.2,.9],b=[.35,1.05],p=[.275,.975],normal=[-Math.SQRT1_2,Math.SQRT1_2],tests=[a,b,[.1,.8],p.map((x,k)=>x+.001*normal[k])];
 for(const P of tests)assert.throws(()=>C.panelInfluence(a,b,P,{onPanel:true}),/Declared panel trace/);
 // A declared surface point must still work on the very short, translated
 // panels responsible for the repaired wrong-side event.
 const shortA=[7.99999,1.00031],shortB=[8.,1.0003],P=shortA.map((x,k)=>x+.895*(shortB[k]-x));
 assert.ok(C.panelInfluence(shortA,shortB,P,{onPanel:true}).flat().every(Number.isFinite));
 return{falseHintsRejected:tests.length,shortPanelTraceFinite:true};
});

check('New trace treatment preserves incremental shape Jacobian versus full assembly',()=>{
 const rows=[];
 for(const Nc of [8,16]){const s=C.setup({Nc,Nf:Nc/2}),z=[...new Array(Nc/2).fill(0),1.14],base=C.residual(s,z);
  for(let k=0;k<Nc/2;k++){const zz=z.slice();zz[k]+=1e-7;const nn=C.nodesFrom(s,zz),gi=s.Nf+k+1,mi=s.N-gi,panels=[...new Set([gi-1,gi,mi-1,mi])].sort((a,b)=>a-b),changedRows=panels.filter(p=>p<s.h),inc=C.assemble(s,nn,base.A,base.nodes,changedRows,panels),full=C.assemble(s,nn);
   const matrixError=Math.max(...inc.A.flatMap((r,i)=>Array.from(r,(v,j)=>Math.abs(v-full.A[i][j]))));assert.ok(matrixError<2e-14);rows.push({Nc,column:k,matrixError});
  }
 }
 evidence.jacobian=rows;return{columns:rows.length,maxMatrixDifference:Math.max(...rows.map(r=>r.matrixError))};
});

check('Fine-mesh declared trace agrees with actual liquid-side limiting fields at the repaired event',()=>{
 const state=JSON.parse(fs.readFileSync(path.join(__dirname,'reference/stable-kernel/Nc256-result.json'))),known=JSON.parse(fs.readFileSync(path.join(__dirname,'reference/stable-kernel/side-trace-audit.json'))).worst,g=C.geometry(state.nodes),j=known.panel,p=known.point,t=g[j].t,n=g[j].n;
 const ev=C.velocity(state.nodes,state.gamma,[p],{nNear:64,onPanelIndices:[j]})[0],iv=C.velocity(state.nodes,state.gamma,[p],{nNear:64,onPanelIndices:[j],side:-1})[0];
 const rows=[];for(const eps of [1e-6,1e-8,1e-10]){const point=p.map((v,k)=>v+eps*n[k]),v=C.velocity(state.nodes,state.gamma,[point],{nNear:64})[0];rows.push({eps,tangent:dot(v,t),normal:dot(v,n),error:Math.abs(dot(v,t)-dot(ev,t))});}
 assert.ok(rows[2].error<rows[0].error);assert.ok(rows[2].error<2e-7);assert.ok(Math.abs(dot(ev,t)-known.declaredExteriorTangent_U)<2e-10);
 evidence.fineMeshTrace={panel:j,point:p,declaredExterior:ev,declaredInterior:iv,offsets:rows};return{point:p,exteriorTangent:dot(ev,t),interiorTangent:dot(iv,t),finalLimitError:rows[2].error};
});

async function main(){
 const rejects=[['Infinity tolerance',{tolerance:Infinity}],['negative cavity speed',{Nc:8,Nf:4,initialState:[0,0,0,0,-1.14]}],['NaN seed',{Nc:8,Nf:4,initialState:[0,NaN,0,0,1.14]}],['zero iterations',{maxIterations:0}],['Infinity L',{L:Infinity}],['string Nc',{Nc:'32'}],['odd Nc',{Nc:31}],['resource limit',{Nc:100000}],['invalid geometry',{Nc:8,Nf:4,initialState:[-100,-100,-100,-100,1.14]}]];
 for(const[name,options]of rejects){let caught=null;try{await C.solve(options);}catch(e){caught=e.message;}checks.push({name:'Public input guard: '+name,passed:Boolean(caught),error:caught});}
 let cancelled=false,cancelMessage=null;try{await C.solve({Nc:8,Nf:4},{isCancelled:()=>cancelled,onProgress:o=>{if(o.stage==='Newton shape Jacobian'&&o.column===2)cancelled=true;}});}catch(e){cancelMessage=e.message;}
 checks.push({name:'Public cooperative cancellation remains intact',passed:cancelMessage==='Cancelled',error:cancelMessage});
 const one=await C.solve({Nc:8,Nf:4,maxIterations:1,audit:false});
 checks.push({name:'A one-iteration result cannot be falsely accuracy-qualified',passed:!one.nodalConverged&&!one.accuracyQualified,status:one.status,residual:one.maxDynamicResidual});
 const progress=[],r=await C.solve({Nc:16,Nf:8},{onProgress:o=>progress.push(o.stage)});
 check('Actual strict Newton result keeps stronger nine-fraction field audit and unresolved accuracy status',()=>{assert.ok(r.maxDynamicResidual<1e-10);assert.equal(r.nodalConverged,true);assert.equal(r.accuracyQualified,false);assert.equal(r.status,'nodal-converged-field-unresolved');assert.deepEqual(r.fieldAudit.fractions,[.02,.05,.1,.25,.5,.75,.9,.95,.98]);assert.equal(r.fieldAudit.profiles.points.length,r.N*9);assert.equal(r.fieldAudit.allSamplesRetained,true);assert.ok(r.fieldAudit.maxNormal_U>.01||r.fieldAudit.maxCavityDynamicCpResidual>.02);assert.ok(progress.includes('independent off-node field audit'));return{sigma:r.sigma,nodalResidual:r.maxDynamicResidual,fieldMaxNormal:r.fieldAudit.maxNormal_U,fieldMaxDynamic:r.fieldAudit.maxCavityDynamicCpResidual,allPanelSamples:r.N*9};});
 const out={version:C.VERSION,scope:'Independent mathematical kernel / declared-trace / guard audit. Does not establish developed-cavity accuracy or experimental validation.',status:checks.every(c=>c.passed)?'PASS_REPAIR_ONLY':'FAIL',checks,evidence};
 fs.writeFileSync(path.join(__dirname,'stable-kernel-verification.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,checks:checks.length,failures:checks.filter(c=>!c.passed),summaries:checks.filter(c=>c.passed&&!c.error)},null,2));
 if(out.status!=='PASS_REPAIR_ONLY')process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
