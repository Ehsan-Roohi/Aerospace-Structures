'use strict';
// Guard changes must preserve the received equations and all mandatory samples.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const C=require('../axisymmetric-cavity-c1.js'),O=require('./reference/c1-cavity/original/axisymmetric-cavity-c1.js');
const here=__dirname,read=p=>JSON.parse(fs.readFileSync(path.join(here,p),'utf8'));
const checks=[];
function reject(name,fn){let error;try{fn();}catch(e){error=e.message;}assert.ok(error,name);checks.push({name,passed:true,error});}
async function rejectAsync(name,fn){let error;try{await fn();}catch(e){error=e.message;}assert.ok(error,name);checks.push({name,passed:true,error});}
(async()=>{
 const counter=read('reference/c1-cavity/reachable-geometry-guard.json').counterexample;
 const s=C.setup(counter.options),nodes=C.nodesFrom(s,counter.z);
 assert.equal(O.validGeometry(O.setup(counter.options),nodes).admissible,true);
 assert.equal(C.validGeometry(s,nodes).admissible,false);
 await rejectAsync('between-node curved reversal rejected before iteration',()=>C.solve({...counter.options,initialState:counter.z}));
 const st=C.stateFor({Nc:8,Nf:4},[0,0,0,0,1.14]),p=st.panels[2].pos(.5);
 for(const [name,points,where,opts] of [
  ['off-surface point falsely declared as trace',[[3,4]],[{panel:2,zeta:.5,side:1}]],
  ['invalid trace parameter',[p],[{panel:2,zeta:2,side:1}]],
  ['invalid trace side',[p],[{panel:2,zeta:.5,side:7}]],
  ['nonexistent trace panel',[p],[{panel:999,zeta:.5,side:1}]],
  ['trace length mismatch',[p],[]],
  ['nonfinite point',[[NaN,1]],null],
  ['invalid quadrature',[p],null,{nNear:NaN}]
 ])reject(name,()=>C.velocity(st,points,where,opts));
 assert.ok(C.velocity(st,[[3,4]],null)[0].every(Number.isFinite));
 for(const value of [0,NaN,Infinity,'3',1.5,6])reject('invalid clustering '+String(value),()=>C.setClustering(value));
 for(const value of [[],[0],[1],[NaN],[.5,.5],'all'])await rejectAsync('invalid audit fractions '+String(value),()=>C.solve({audit:false,auditFractions:value}));
 assert.deepEqual(C.reviewFractions([.5]),[.02,.05,.1,.25,.5,.75,.9,.95,.98]);
 checks.push({name:'optional audit cannot remove mandatory samples',passed:true});
 await rejectAsync('extreme finite seed cannot evade geometry checks',()=>C.solve({Nc:8,Nf:4,initialState:[1e308,1e308,1e308,1e308,1.14]}));
 const original=await O.solve({Nc:32,Nf:16}),current=await C.solve({Nc:32,Nf:16});
 for(const key of ['sigma','qc','Rmax','CD','CD_directField','volume','maxDynamicResidual','nodes','gamma','face','history','fieldAudit','collocationResidual','solutionState'])assert.deepEqual(current[key],original[key],key);
 checks.push({name:'fresh Nc32 physics bit-identical after guard-only changes',passed:true});
 const m=read('c1-cavity-mesh-study.json').meshes['64'],options={Nc:64,Nf:32};
 const cs=C.stateFor(options,m.solutionState),os=O.stateFor(options,m.solutionState);
 const fractions=[.001,.005,.01,.02,.05,.1,.25,.5,.75,.9,.95,.98,.99,.995,.999];
 const a=C.auditField(cs.s,m.solutionState,cs,{fracs:fractions,nNear:48,nFar:20}),b=O.auditField(os.s,m.solutionState,os,{fracs:fractions,nNear:48,nFar:20});
 assert.deepEqual(a,b);assert.equal(a.profiles.points.length,m.N*fractions.length);
 checks.push({name:'all fifteen .001.. .999 fractions unchanged, including both rims',passed:true,normal:a.maxNormal_U,Cp:a.maxCavityDynamicCpResidual,samples:a.profiles.points.length});
 assert.equal(current.accuracyQualified,false);
 const parity=[];
 for(const n of [32,64]){
  const py=read(`reference/c1-cavity/py-c1-Nc${n}.json`),js=read('c1-cavity-mesh-study.json').meshes[String(n)];
  const delta=Object.fromEntries(['sigma','Rmax','CD'].map(k=>[k,js[k]-py[k]]));
  const gamma=Math.max(...js.gamma.map((x,i)=>Math.abs(x-py.gamma[i]))),geometry=Math.max(...js.nodes.map((p,i)=>Math.hypot(p[0]-py.nodes[i][0],p[1]-py.nodes[i][1])));
  assert.ok(Object.values(delta).every(x=>Math.abs(x)<1e-11)&&gamma<1e-10&&geometry<1e-10);
  parity.push({Nc:n,delta,maxGammaDifference:gamma,maxNodeDifference:geometry,passed:true});
 }
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(here,p))).digest('hex');
 const out={status:'PASS_REVIEWED_GUARDS_AND_FRESH_PYTHON_PARITY',checks,pythonParity:parity,sourceSha256:sha('../axisymmetric-cavity-c1.js'),originalSha256:sha('reference/c1-cavity/original/axisymmetric-cavity-c1.js'),experimentalValidation:'NOT_PERFORMED',accuracyScope:'Numerical research controls only; arbitrary cases retain separate per-case field screens.'};
 fs.writeFileSync(path.join(here,'c1-reviewed-verification.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify({status:out.status,guardChecks:checks.length,pythonParityChecks:parity.length}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
