/* Pressure-target forward wrapper for the real C1 disk BEM. It solves for an
 * artificial Riabouchinsky image separation, not a natural-cavity closure. */
(function(root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./axisymmetric-cavity-c1.js'));
  else root.AxisymmetricForward = factory(root.CurvedVortexCavity);
})(typeof globalThis === 'undefined' ? this : globalThis, function(C) {
  'use strict';
  const CORE_SHA256 = '03aefa3ef10f59005f8f053a4b2b6a0c66216508b2a1fbf00bcf78662a0899f0';
  const FRACTIONS = [.001,.005,.01,.02,.05,.1,.25,.5,.75,.9,.95,.98,.99,.995,.999];
  const CLOSURE = 'symmetric-artificial-image-disk';
  const RM_RULE = 'Rm(L/Rn) = 1 + 0.4*sqrt(L/Rn); numerical reference coordinates only, not an empirical cavity fit.';
  let active = false;
  const finite = (v,n) => { if(typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(n+' must be finite.'); return v; };
  const positive = (v,n) => { finite(v,n); if(v <= 0) throw new RangeError(n+' must be positive.'); return v; };
  const get = (o,k,d) => o[k] === undefined ? d : o[k];
  function options(input) {
    if(input === undefined) input = {};
    if(!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Options must be an object.');
    const mode = get(input,'mode',input.sigma === undefined ? 'physical' : 'sigma');
    if(mode !== 'physical' && mode !== 'sigma') throw new RangeError('mode must be physical or sigma.');
    if(mode === 'physical' && input.sigma !== undefined) throw new RangeError('An explicit sigma requires mode sigma.');
    const pInf = positive(get(input,'pInf',101325),'Ambient absolute pressure (Pa)');
    const pc = finite(get(input,'pc',2339),'Cavity absolute pressure (Pa)');
    if(pc < 0 || pc >= pInf) throw new RangeError('Pressures must satisfy 0 <= pc < pInf.');
    const rho = positive(get(input,'rho',1000),'Density (kg/m^3)');
    const U = positive(get(input,'U',Math.sqrt(2*(101325-2339)/(1000*.5))),'Speed (m/s)');
    const diskRn = positive(get(input,'diskRn',.01),'Disk radius (m)');
    const dynamicPressure = positive(.5*rho*U*U,'Dynamic pressure (Pa)');
    positive(diskRn*diskRn*diskRn,'Cubic disk length scale (m^3)');
    positive(dynamicPressure*Math.PI*diskRn*diskRn,'Dimensional disk force scale (N)');
    const physicalSigma = positive((pInf-pc)/dynamicPressure,'Physical cavitation number');
    const sigma = positive(mode === 'sigma' ? input.sigma : physicalSigma,'Target cavitation number');
    const Nc = get(input,'Nc',128);
    if(![32,64,128].includes(Nc)) throw new RangeError('Supported forward meshes are Nc32, Nc64 and Nc128.');
    const extendedResearchDomain = get(input,'extendedResearchDomain',false);
    if(typeof extendedResearchDomain !== 'boolean') throw new TypeError('extendedResearchDomain must be an explicit boolean.');
    const maxEvaluations = get(input,'maxEvaluations',10);
    if(!Number.isInteger(maxEvaluations) || maxEvaluations < 4 || maxEvaluations > 12) throw new RangeError('maxEvaluations must be an integer from 4 through 12.');
    const sigmaTolerance = positive(get(input,'sigmaTolerance',1e-5),'Absolute sigma tolerance');
    if(sigmaTolerance < 1e-8 || sigmaTolerance > 1e-3) throw new RangeError('sigmaTolerance must lie from 1e-8 through 1e-3.');
    const maxSeconds = positive(get(input,'maxSeconds',extendedResearchDomain?600:300),'Wall time limit (s)');
    if(maxSeconds < 10 || maxSeconds > 900) throw new RangeError('maxSeconds must lie from 10 through 900.');
    if(input.closure !== undefined && input.closure !== CLOSURE) throw new RangeError('Only the explicit symmetric Riabouchinsky artificial-image closure is implemented.');
    let body = null;
    if(input.body !== undefined && input.body !== null && input.body !== false) {
      if(typeof input.body !== 'object' || Array.isArray(input.body)) throw new TypeError('body must be {radius,length}.');
      body = {radius:positive(input.body.radius,'Afterbody radius (m)'),length:positive(input.body.length,'Afterbody length (m)')};
      positive(Math.PI*body.radius*body.radius*body.length,'Afterbody volume (m^3)');
      positive(body.length/diskRn,'Normalized afterbody length');
      positive(body.radius/diskRn,'Normalized afterbody radius');
    }
    return {mode,pInf,pc,rho,U,diskRn,dynamicPressure,physicalSigma,sigma,Nc,extendedResearchDomain,maxEvaluations,sigmaTolerance,maxSeconds,body,closure:CLOSURE};
  }
  function referenceRadius(L) { return 1+.4*Math.sqrt(positive(L,'Image separation L/Rn')); }
  function settings(o,L,audit) {
    return {L,Rm:referenceRadius(L),Nc:o.Nc,Nf:o.Nc/2,nNear:24,nFar:12,mColl:3,
      tolerance:1e-10,maxIterations:24,audit,researchLengthExtension:o.extendedResearchDomain,
      auditFractions:FRACTIONS.slice()};
  }
  function lerp(xs,rs,x) {
    if(x <= xs[0]) return rs[0];
    if(x >= xs.at(-1)) return rs.at(-1);
    let i=0; while(xs[i+1] < x) i++;
    const f=(x-xs[i])/(xs[i+1]-xs[i]); return rs[i]*(1-f)+rs[i+1]*f;
  }
  function seed(previous,opts) {
    if(!previous) return null;
    const s=C.setup(opts), r=previous.result;
    const cav=r.nodes.slice(r.Nf,r.Nf+r.Nc+1), xs=cav.map(p=>p[0]/r.L), rs=cav.map(p=>p[1]);
    const z=[],amp=Math.sqrt(opts.L/r.L);
    for(let k=1;k<=opts.Nc/2;k++) {
      const p=s.cav[k],n=s.normal[k],target=1+amp*(lerp(xs,rs,p[0]/opts.L)-1);
      z.push((target-p[1])*n[1]);
    }
    z.push(Math.sqrt(1+r.sigma*r.L/opts.L));
    return C.validGeometry(s,C.nodesFrom(s,z)).admissible ? z : null;
  }
  function summary(record) {
    const r=record.result;
    return {LOverRn:record.L,Rm:record.options.Rm,sigma:r.sigma,residual:record.residual,
      nodalConverged:r.nodalConverged,geometryAdmissible:r.geometry.admissible,
      audited:Boolean(r.fieldAudit),provisional:!r.fieldAudit,seconds:r.seconds,
      maxDynamicResidual:r.maxDynamicResidual,coreOptions:record.options};
  }
  // Exact candidate parameters for the radial cubic/quartic used by C1, restricted
  // to the actual body interval. Evaluate radii on the original panel functions.
  function radialCritical(panel,k,Nc) {
    const a=panel.pos(0),b=panel.pos(1),da=panel.der(0),db=panel.der(1);
    if(k === 0 || k === Nc-1) {
      const front=k===0,delta=(front?b[1]:a[1])-1,mr=front?db[1]:-da[1];
      const cc=(mr-2*delta)/2,aa=delta-cc,roots=[];
      if(cc !== 0 && -aa/(2*cc)>0) { const w=Math.sqrt(-aa/(2*cc)); if(w>0&&w<1)roots.push(front?w:1-w); }
      return roots;
    }
    const c2=-3*a[1]-2*da[1]+3*b[1]-db[1], c3=2*a[1]+da[1]-2*b[1]+db[1];
    const aa=3*c3,bb=2*c2,cc=da[1];
    if(aa===0) return bb===0 ? [] : [-cc/bb].filter(t=>t>0&&t<1);
    const d=bb*bb-4*aa*cc;
    if(d<0) return [];
    const q=-.5*(bb+(bb>=0?1:-1)*Math.sqrt(d));
    return (q===0?[-bb/(2*aa)]:[q/aa,cc/q]).filter(t=>t>0&&t<1);
  }
  function bodyCheck(body,r,rn,panels) {
    if(!body) return null;
    const end=Math.min(body.length/rn,r.L),candidates=[];let tipClearance=null;
    for(let k=0;k<r.Nc;k++) {
      const p=panels[r.Nf+k],a=p.pos(0),b=p.pos(1);
      if(a[0]>end) break;
      let tEnd=1;
      if(b[0]>end) { let lo=0,hi=1; for(let j=0;j<70;j++){const m=(lo+hi)/2;if(p.pos(m)[0]>end)hi=m;else lo=m;}tEnd=(lo+hi)/2; }
      for(const t of [0,tEnd,...radialCritical(p,k,r.Nc).filter(t=>t<=tEnd)]) {
        const q=p.pos(t);candidates.push({xOverRn:q[0],rOverRn:q[1],x:q[0]*rn,r:q[1]*rn,
          clearance:q[1]*rn-body.radius,clearanceOverRn:q[1]-body.radius/rn,panel:p.index,parameter:t});
      }
      tipClearance=p.pos(tEnd)[1]*rn-body.radius;
      if(b[0]>=end) break;
    }
    const limiting=candidates.reduce((a,b)=>b.clearance<a.clearance?b:a), completeCoverage=body.length/rn<=r.L;
    const dryContained=completeCoverage&&limiting.clearance>=0;
    return {radius:body.radius,length:body.length,start:0,completeCoverage,dryContained,
      status:!completeCoverage?'OUTSIDE_IMAGE_ENVELOPE':dryContained?'DRY_CONTAINMENT_SUPPORTED':'NEGATIVE_CLEARANCE',
      minimumClearance:limiting.clearance,minimumClearanceOverRn:limiting.clearanceOverRn,
      minimumClearanceCoversWholeBody:completeCoverage,limitingPoint:limiting,clearances:candidates,
      tipClearance:completeCoverage?tipClearance:null,
      bodyVolume:Math.PI*body.radius*body.radius*body.length,
      interpretation:'Exact radial extrema of the solved C1 polynomial panels over the specified cylinder length. Geometric containment inside an artificial-image envelope only; wetted cylinder flow, body drag, reattachment and ventilation are not solved.'};
  }
  function checkAfterbody(body,r,coreOptions,diskRn) {
    if(!body||typeof body!=='object'||Array.isArray(body))throw new TypeError('Afterbody must be {radius,length}.');
    const b={radius:positive(body.radius,'Afterbody radius (m)'),length:positive(body.length,'Afterbody length (m)')};
    positive(diskRn,'Disk radius (m)');positive(Math.PI*b.radius*b.radius*b.length,'Afterbody volume (m^3)');
    positive(b.radius/diskRn,'Normalized afterbody radius');positive(b.length/diskRn,'Normalized afterbody length');
    if(!r||!r.nodalConverged||!r.geometry?.admissible)throw new RangeError('A complete nodal-converged, geometry-admitted C1 result is required.');
    const s=C.setup(coreOptions);
    if(s.L!==r.L||s.Nc!==r.Nc||s.Nf!==r.Nf||!C.validGeometry(s,r.nodes).admissible)throw new RangeError('Numerical settings and actual admitted C1 geometry must match.');
    return bodyCheck(b,r,diskRn,C.buildPanels(s,r.nodes));
  }
  function decorate(o,record) {
    const r=record.result,s=C.setup(record.options),panels=C.buildPanels(s,r.nodes),rn=o.diskRn,full=[];
    for(let k=0;k<r.Nc;k++) for(let j=0;j<=8;j++) {
      if(k&&j===0)continue;
      const p=panels[r.Nf+k].pos(j/8);full.push({xOverRn:p[0],rOverRn:p[1],x:p[0]*rn,r:p[1]*rn,panel:r.Nf+k,parameter:j/8});
    }
    const body=bodyCheck(o.body,r,rn,panels),fullEnvelope=r.volume*rn*rn*rn;
    return {profile:{full,firstHalf:full.filter(p=>p.xOverRn<=r.L/2),symmetryPlaneX:r.L*rn/2,
      interpretation:'Actual solved curved BEM panels. Rear half is the symmetric artificial-image continuation.'},
      dimensions:{imageSeparationOverRn:r.L,imageSeparation:r.L*rn,firstHalfLength:r.L*rn/2,RmaxOverRn:r.Rmax,Rmax:r.Rmax*rn},
      drag:{CD:r.CD,CD_directField:r.CD_directField,force:o.mode==='physical'?r.CD_directField*o.dynamicPressure*Math.PI*rn*rn:null,
        interpretation:o.mode==='physical'?'Front physical disk only; no cylinder afterbody drag.':'Sigma-only mode reports dimensionless front-disk drag. Select physical inputs for dimensional force; no cylinder afterbody drag.'},
      volume:{kind:'artificial-image-envelope',fullEnvelope,bodySubtracted:Boolean(body&&body.dryContained),
        bodyDisplacement:body&&body.dryContained?body.bodyVolume:null,
        gasEnvelopeSegment:!body?fullEnvelope:body.dryContained?fullEnvelope-body.bodyVolume:null,
        physicalNaturalCavityVolume:false,interpretation:'Full disk-to-image envelope volume of the Riabouchinsky model; not a measured or naturally closing vapor-cavity volume.'},body};
  }
  function allFinite(value) {
    if(typeof value==='number') finite(value,'Derived result');
    else if(Array.isArray(value)) value.forEach(allFinite);
    else if(value&&typeof value==='object') Object.values(value).forEach(allFinite);
  }
  async function solve(input,hooks) {
    hooks=hooks||{};
    const records=[],start=Date.now();let o=null,lastComplete=null;
    if(active) return {ok:false,status:'BUSY',errors:['A forward solve is already active. Cancel or finish it before starting another.']};
    active=true;
    function check() {
      if(hooks.isCancelled&&hooks.isCancelled()) throw Error('Cancelled');
      if(o&&(Date.now()-start)/1000>o.maxSeconds) throw Error('Forward wall time limit reached');
    }
    function progress(p) { check(); if(hooks.onProgress)hooks.onProgress(Object.assign({},p,{elapsedSeconds:(Date.now()-start)/1000})); }
    try {
      o=options(input);
      if(!C||typeof C.solve!=='function') throw Error('The C1 BEM core must be loaded before the forward wrapper.');
      C.setClustering(3);
      const minL=2,maxL=o.extendedResearchDomain?80:24;
      const base={input:o,targetSigma:o.sigma,closure:{id:CLOSURE,artificial:true,
        interpretation:'Riabouchinsky physical sharp disk plus a symmetric artificial image disk. Unknown L is their full separation, not a predicted natural tail.'},
        coreSourceSha256:CORE_SHA256,coreVersion:C.VERSION,
        advancedSigmaOverride:o.mode==='sigma',physicalSigma:o.physicalSigma,
        advancedSigmaNote:o.mode==='sigma'?'Explicit sigma controls the BEM. Default physical pressure/speed fields need not match it; dimensional force is withheld. Geometry is scaled by the specified disk radius.':null,
        referenceRule:RM_RULE,clusteringExponent:3,
        estimate:{typicalSeconds:o.Nc===128?(o.extendedResearchDomain?[180,600]:[120,300]):[15,90],maximumSeconds:o.maxSeconds,maximumScalarSolves:o.maxEvaluations,additionalFinalAuditedSolves:1},
        meshAccuracyQualified:false,experimentalAccuracyQualified:false,accuracyQualified:false};
      progress({stage:'pressure target',targetSigma:o.sigma,message:'Solving a sharp-disk BEM with an artificial Riabouchinsky image closure.'});
      async function evaluate(L,audit,initialRecord) {
        check();C.setClustering(3);
        const opts=settings(o,L,audit);
        const previous=initialRecord||records.reduce((best,r)=>!best||Math.abs(Math.log(r.L/L))<Math.abs(Math.log(best.L/L))?r:best,null);
        const initial=seed(previous,opts);if(initial)opts.initialState=initial;
        const index=records.length+1;
        const r=await C.solve(opts,{isCancelled:()=>Boolean((hooks.isCancelled&&hooks.isCancelled())||(Date.now()-start)/1000>o.maxSeconds),
          yieldControl:hooks.yieldControl,
          onProgress:p=>progress(Object.assign({},p,{stage:audit?'final '+p.stage:p.stage,evaluation:index,LOverRn:L,scalarStage:audit?'fresh final audit':'provisional pressure root'})),
          onCheckpoint:checkpoint=>{if(hooks.onCheckpoint)hooks.onCheckpoint({kind:'provisional Newton iterate',coreOptions:opts,checkpoint,coreSourceSha256:CORE_SHA256});}});
        const record={L,options:opts,result:r,residual:r.sigma-o.sigma};
        lastComplete=r;
        check();
        if(!r.nodalConverged||!r.geometry.admissible||!r.physicalBranch) throw Error('A BEM scalar evaluation failed geometry or nodal admission at L/Rn='+L+'.');
        return record;
      }
      progress({stage:'bracketing',lengthDomain:[minL,maxL]});
      let a=await evaluate(minL,false);records.push(a);
      let b=await evaluate(maxL,false);records.push(b);
      const endpointSigmaRange=[Math.min(a.result.sigma,b.result.sigma),Math.max(a.result.sigma,b.result.sigma)];
      if(a.residual*b.residual>0&&Math.min(Math.abs(a.residual),Math.abs(b.residual))>o.sigmaTolerance) {
        return Object.assign(base,{ok:false,status:'UNSUPPORTED_TARGET',errors:['Fresh endpoint solves do not bracket this target sigma within the admitted image-separation domain. No extrapolation or clipping is applied.'],
          rootConverged:false,nodalConverged:false,geometryAdmissible:false,directFieldPassed:false,
          search:{lengthDomain:[minL,maxL],endpointSigmaRange,evaluations:records.map(summary),referenceRule:RM_RULE},lastComplete,seconds:(Date.now()-start)/1000});
      }
      let best=Math.abs(a.residual)<Math.abs(b.residual)?a:b,wa=a.residual,wb=b.residual,lastSide=null;
      while(Math.abs(best.residual)>o.sigmaTolerance&&records.length<o.maxEvaluations) {
        check();
        // Secant in reciprocal separation is bracketed by actual fresh BEM signs.
        // Illinois endpoint weighting avoids false-position stagnation; no global
        // monotonicity or uniqueness is inferred from the observed samples.
        let t=((1/a.L)*wb-(1/b.L)*wa)/(wb-wa);
        const t0=Math.min(1/a.L,1/b.L),t1=Math.max(1/a.L,1/b.L);
        if(!Number.isFinite(t)||t<=t0||t>=t1)t=(t0+t1)/2;
        const L=1/t;
        progress({stage:'scalar iteration',evaluation:records.length+1,LOverRn:L,bestSigmaResidual:best.residual});
        const c=await evaluate(L,false);records.push(c);
        if(Math.abs(c.residual)<Math.abs(best.residual))best=c;
        if(a.residual*c.residual<=0) { b=c;wb=c.residual;if(lastSide==='b')wa*=.5;else wa=a.residual;lastSide='b'; }
        else { a=c;wa=c.residual;if(lastSide==='a')wb*=.5;else wb=b.residual;lastSide='a'; }
      }
      progress({stage:'fresh final direct-field audit',LOverRn:best.L,sigmaResidual:best.residual});
      const finalRecord=await evaluate(best.L,true,best),r=finalRecord.result;
      const rootConverged=Math.abs(r.sigma-o.sigma)<=o.sigmaTolerance;
      const directFieldPassed=Boolean(r.fieldAudit&&r.fieldAudit.withinPriorOffgridThresholds);
      const geometry=decorate(o,finalRecord),bodyContainmentPassed=!geometry.body||geometry.body.dryContained;
      const fieldAccepted=rootConverged&&r.nodalConverged&&r.geometry.admissible&&directFieldPassed;
      const accepted=fieldAccepted&&bodyContainmentPassed;
      const result=Object.assign(base,{ok:accepted,status:accepted?'FORWARD_RESEARCH_FIELD_PASSED':!rootConverged?'ROOT_NOT_CONVERGED':!fieldAccepted?'FORWARD_FIELD_UNRESOLVED':'BODY_CONTAINMENT_FAILED',
        errors:accepted?[]:[!rootConverged?'The bounded scalar search did not reach the requested absolute sigma tolerance.':!fieldAccepted?'The final direct-field audit did not pass the unchanged screens.':'The specified cylinder is not fully dry-contained in the solved artificial-image envelope; no wetted-cylinder prediction is available.'],
        achievedSigma:r.sigma,sigmaResidual:r.sigma-o.sigma,rootConverged,nodalConverged:r.nodalConverged,
        geometryAdmissible:r.geometry.admissible,directFieldPassed,bodyContainmentPassed,
        search:{lengthDomain:[minL,maxL],endpointSigmaRange,finalBracket:[a.L,b.L],evaluations:records.map(summary),
          scalarEvaluationCount:records.length,sigmaTolerance:o.sigmaTolerance,referenceRule:RM_RULE},
        final:r,finalCoreOptions:finalRecord.options,seconds:(Date.now()-start)/1000},geometry);
      allFinite(result);return result;
    } catch(error) {
      const timedOut=Boolean(o&&(Date.now()-start)/1000>o.maxSeconds),cancelled=/cancel|time limit/i.test(error.message);
      return {ok:false,status:timedOut?'TIME_LIMIT':cancelled?'CANCELLED':'REJECTED',errors:[timedOut?'Forward wall time limit reached; the last complete diagnostic state is retained.':error.message],input:o,
        rootConverged:false,nodalConverged:false,geometryAdmissible:false,directFieldPassed:false,
        meshAccuracyQualified:false,experimentalAccuracyQualified:false,accuracyQualified:false,
        coreSourceSha256:CORE_SHA256,search:{evaluations:records.map(summary)},lastComplete,seconds:(Date.now()-start)/1000};
    } finally {active=false;}
  }
  return Object.freeze({options,solve,checkAfterbody,referenceRadius,closure:CLOSURE,coreSourceSha256:CORE_SHA256,auditFractions:Object.freeze(FRACTIONS.slice())});
});
