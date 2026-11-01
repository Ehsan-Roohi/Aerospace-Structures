/* Forward partial-sheet research driver. The target cavitation number is an
 * INPUT; cavity length and smooth detachment are numerical unknowns. Uses the
 * unchanged mixed-boundary core and strict BV adapter. No failed candidate is
 * converted into an accepted result. This is not experimental validation.
 * Browser order: cavitation.js, smooth-detachment.js, adapter, fluid-state.js,
 * then this file. Fluid helper is optional for explicitly supplied rho/pc.
 */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;let F;
  if(node){try{F=require('./fluid-state.js');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}}
  else F=root.CavitationFluid;
  const api=factory(node?require('./cavitation.js'):root.HydrofoilCavitation,
    node?require('./smooth-detachment-adapter.js'):root.HydrofoilSmoothDetachment,F);
  if(node)module.exports=api;else root.ForwardHydrofoilCavitation=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis,function(H,BV,F){
  'use strict';
  const VERSION='0.1.0-forward-research',SCOPE='Steady 2-D upper partial-sheet potential flow with algebraic pressure recovery and the existing smooth-contact/BV estimator. No viscous separation, cloud shedding, erosion or experimental accuracy qualification.';
  const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
  const positive=(x,name)=>{if(!finite(x)||x<=0)throw new Error(name+' must be a finite positive number.');return x;};
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  function controls(input={}){
    if(Object.prototype.hasOwnProperty.call(input,'pressureTolerance')&&input.pressureTolerance!==0)
      throw new Error('The forward driver does not permit a wetted-pressure allowance or null bypass.');
    const s={resolution:48,maxLengthEvaluations:6,maxDetachmentEvaluations:12,maxSeconds:120,
      sigmaTolerance:2e-4,lengthMin:.06,lengthMax:.65,maxInnerIterations:100,...input};
    for(const [k,lo,hi]of[['resolution',16,96],['maxLengthEvaluations',2,12],['maxDetachmentEvaluations',4,20],['maxInnerIterations',20,150]])
      if(!Number.isInteger(s[k])||s[k]<lo||s[k]>hi)throw new Error(k+' must be an integer '+lo+'–'+hi+'.');
    if(!finite(s.maxSeconds)||s.maxSeconds<1||s.maxSeconds>600)throw new Error('Use a time budget from 1 to 600 seconds.');
    if(!finite(s.sigmaTolerance)||s.sigmaTolerance<1e-7||s.sigmaTolerance>1e-3)throw new Error('Use target-sigma tolerance 1e-7–1e-3.');
    if(!finite(s.lengthMin)||!finite(s.lengthMax)||s.lengthMin<.06||s.lengthMax>.65||s.lengthMin>=s.lengthMax)
      throw new Error('The automatic partial-cavity search is restricted to 0.06 <= length/c <= 0.65.');
    return s;
  }
  function target(input={}){
    const mode=input.mode??'sigma';
    if(mode==='sigma')return{mode,sigma:positive(input.sigma,'Target sigma'),
      chord:positive(input.chord??.16,'Chord'),dimensional:false};
    if(mode!=='physical')throw new Error('Select sigma or physical input mode.');
    const U=input.U??input.speed,pInf=input.pInf??input.pressureAbsolute,chord=positive(input.chord??.16,'Chord');
    positive(U,'Liquid speed');positive(pInf,'Absolute ambient pressure');
    const suppliedRho=input.rho,suppliedPc=input.pc??input.vapourPressure;
    if(suppliedRho!==undefined||suppliedPc!==undefined){
      positive(suppliedRho,'Liquid density');
      if(!finite(suppliedPc)||suppliedPc<0||pInf<=suppliedPc)throw new Error('Use finite cavity pressure >= 0 and ambient absolute pressure above cavity pressure.');
      const dynamicPressure=.5*suppliedRho*U*U;
      if(!finite(dynamicPressure)||dynamicPressure<=0)throw new Error('Dynamic pressure is outside the finite numerical range.');
      const sigma=positive((pInf-suppliedPc)/dynamicPressure,'Computed target sigma');
      return{mode,U,pInf,rho:suppliedRho,pc:suppliedPc,vapourPressure:suppliedPc,chord,dynamicPressure,
        sigma,temperatureC:input.temperatureC??null,
        dimensional:true,source:'Explicit liquid density and cavity pressure supplied by caller.'};
    }
    if(!F||typeof F.target!=='function')throw new Error('Load the water-properties helper, or supply both rho and pc explicitly.');
    const r=F.target({mode:'physical',temperatureC:input.temperatureC??20,U,pInf});
    positive(r.rho,'Computed water density');positive(r.sigma,'Computed target sigma');
    return{...r,mode,chord,dimensional:true};
  }
  function foil(input={}){
    const shape=input.geometry||input;
    const p=shape.naca!==undefined?H.parseNaca(shape.naca):{
      thickness:shape.thickness??.12,camber:shape.camber??0,camberPosition:shape.camberPosition??.4};
    // Validate the exact geometry without using the inverse alpha>0 restriction.
    H.nacaCode(p);H.parseNaca(H.nacaCode(p));
    const alpha=input.alpha??shape.alpha??4;
    if(!finite(alpha)||Math.abs(alpha)>10)throw new Error('Use a finite incidence from -10 to 10 degrees for the wetted preflight.');
    return{...p,alpha,naca:H.nacaCode(p)};
  }
  function pointsFor(g,n){
    const u=Array.from({length:n+1},(_,k)=>(1-Math.cos(Math.PI*k/n))/2);
    return[...u.slice().reverse().map(v=>H.sectionPoint(v,g,1)),...u.slice(1).map(v=>H.sectionPoint(v,g,-1))];
  }
  function wetRun(g,n,sigma){
    const r=H.wettedVelocity(pointsFor(g,n),g.alpha),all=r.cp.map((cp,i)=>({cp,margin:cp+sigma,
      x:r.panels[i].x,y:r.panels[i].y,surface:i<n?'upper':'lower',panel:i}));
    const valuesFinite=all.every(v=>[v.cp,v.margin,v.x,v.y].every(Number.isFinite))&&finite(r.linearResidual)&&finite(r.velocityKuttaResidual);
    const scale=valuesFinite?Math.max(1,sigma,...all.map(v=>Math.abs(v.cp))):1,roundoffAllowance=128*Number.EPSILON*scale;
    const min=valuesFinite?all.reduce((a,b)=>a.margin<b.margin?a:b):null;
    return{panelsPerSurface:n,points:r.points,panels:all,minimum:min,finite:valuesFinite,roundoffAllowance,
      linearResidual:r.linearResidual,velocityKuttaResidual:r.velocityKuttaResidual,
      passed:valuesFinite&&min.margin>=-roundoffAllowance,coefficients:{cl:r.cl,cm:r.cm,pressureDrag:r.pressureDrag}};
  }
  function stableKey(o){return JSON.stringify({driver:VERSION,core:H.VERSION,bv:BV.VERSION,
    foil:o.foil,target:o.target.sigma,resolution:o.settings.resolution,recovery:o.recovery,exponent:o.exponent,
    lengthMin:o.settings.lengthMin,lengthMax:o.settings.lengthMax,
    sigmaTolerance:o.settings.sigmaTolerance,closure:'smooth-contact',kutta:'velocity',estimator:'cavity'});}
  function configuration(input={}){
    const t=target(input),g=foil(input),s=controls(input.settings||{}),recovery=input.recovery??.15,exponent=input.exponent??1;
    if(!finite(recovery)||recovery<.05||recovery>.4||!finite(exponent)||exponent<1||exponent>4)
      throw new Error('Forward smooth-contact recovery requires lambda .05–.4 and exponent 1–4.');
    const out={target:t,foil:g,settings:s,recovery,exponent};out.key=stableKey(out);return out;
  }
  function candidateChecks(raw,targetSigma,rootConverged){
    const numerical=raw?.smoothDetachment?.numericalConverged===true;
    const gapFinite=Array.isArray(raw?.height)&&raw.height.length>2&&raw.height.every((p,i)=>
      finite(p.h)&&finite(p.x)&&(i===0||p.x>raw.height[i-1].x));
    const minGap=gapFinite?Math.min(...raw.height.map(p=>p.h)):null;
    const gapRoundoff=128*Number.EPSILON;
    const signedArea=gapFinite?raw.height.slice(1).reduce((a,p,i)=>a+.5*(p.h+raw.height[i].h)*(p.x-raw.height[i].x),0):null;
    const gapPassed=gapFinite&&minGap>=-gapRoundoff&&signedArea>0;
    const geometry=raw?.metrics?.geometryValid===true&&gapPassed;
    const physical=Array.isArray(raw?.panels)?H.physicalAdmissibility(raw.panels,targetSigma,
      {equationsConverged:numerical&&rootConverged,geometryValid:geometry}):null;
    const actual=raw?.physicalAdmissibility?.screenPassed===true;
    return{numericalConverged:numerical,rootConverged,gapPassed,minimumGap:minGap,signedAreaOverChordSquared:signedArea,gapRoundoffAllowance:gapRoundoff,
      computedSigmaScreenPassed:actual,targetSigmaScreen:physical,
      accepted:numerical&&rootConverged&&geometry&&actual&&physical?.screenPassed===true};
  }
  function* iterate(input={},hooks={}){
    const cfg=configuration(input),{target:t,foil:g,settings:s}=cfg,start=Date.now(),trace=[],trials=[];
    const warm=input.warmStart,matchingWarm=warm?.driverVersion===VERSION&&warm?.configurationKey===cfg.key&&
      finite(warm.length)&&warm.length>=s.lengthMin&&warm.length<=s.lengthMax&&
      finite(warm.detachment)&&warm.detachment>=.002&&warm.detachment<=.15&&
      finite(warm.attenuation)&&warm.attenuation>0&&warm.attenuation<.75;
    let last=null,wet=null,serial=0;
    const result=(status,code,reason,extra={})=>({version:VERSION,mode:'forward',status,code,reason,
      acceptedForDisplay:false,cavityPresent:false,target:t,geometry:g,settings:s,configurationKey:cfg.key,
      warmStartUsed:!!matchingWarm,warmStartIgnoredReason:warm&&!matchingWarm?'State version, mathematical configuration or finite seed bounds do not match.':null,
      scope:SCOPE,elapsedSeconds:(Date.now()-start)/1000,
      experimentalValidation:false,meshAccuracyQualified:false,trace,trials,wetPreflight:wet,...extra});
    function stop(){
      if(hooks.isCancelled?.()){const e=new Error('Cancelled');e.code='CANCELLED';throw e;}
      if((Date.now()-start)/1000>s.maxSeconds){const e=new Error('Forward search reached its declared wall-clock budget.');e.code='TIME_BUDGET';throw e;}
    }
    function progress(p){stop();return{phase:'forward-hydrofoil',...p,elapsedSeconds:(Date.now()-start)/1000};}
    try{
      yield progress({stage:'fully wetted preflight',mesh:1,meshes:2});
      const a=wetRun(g,Math.max(32,s.resolution),t.sigma);
      yield progress({stage:'fully wetted preflight',mesh:2,meshes:2});
      const b=wetRun(g,2*Math.max(32,s.resolution),t.sigma);
      const minShift=a.minimum&&b.minimum?Math.abs(a.minimum.cp-b.minimum.cp):Infinity;
      // Conservative resolution warning, not a pressure-error allowance.
      const marginResolved=a.passed&&b.passed&&Math.min(a.minimum.margin,b.minimum.margin)>minShift;
      wet={coarse:a,fine:b,minimumCpChange:minShift,fullyWettedPressureScreenPassed:a.passed&&b.passed,
        marginResolved,criterion:'Every wetted sample Cp + target sigma >= 0 (roundoff only), on both meshes; positive clearance must also exceed the observed minimum-Cp mesh change.',
        limitation:'Potential-flow consistency screen; not observed inception, hysteresis or a cavitation experiment.'};
      if(marginResolved)return result('fully-wetted','NO_CAVITY_REQUIRED',
        'The fully wetted potential-flow solution remains above cavity pressure on both checked meshes. No cavity is required by this model.',
        {acceptedForDisplay:true,cavityPresent:false,cavity:null,points:b.points,panels:b.panels,coefficients:b.coefficients});
      if(!a.finite||!b.finite)return result('rejected','NONFINITE_WET_PREFLIGHT','The wetted preflight contains nonfinite data; no cavity solve was admitted.');
      if(a.passed&&b.passed)return result('unresolved','WET_PREFLIGHT_MARGIN_UNRESOLVED','Both meshes satisfy the pressure sign check, but their remaining clearance is smaller than the observed mesh change. Refine before classifying inception.');
      if(g.alpha<=0)return result('unsupported','UPPER_SHEET_ONLY','The current free-boundary core supports positive incidence and an upper partial cavity only. The wetted result is retained; no lower-surface cavity is substituted.');
      const lower=b.panels.filter(p=>p.surface==='lower'&&p.margin< -b.roundoffAllowance);
      if(lower.length)return result('unsupported','LOWER_SURFACE_BELOW_CAVITY_PRESSURE','The wetted preflight also predicts a below-cavity-pressure region on the lower surface. A single upper partial sheet cannot represent this case.');
      if(s.resolution<48)return result('unresolved','DETACHMENT_MESH_TOO_COARSE','Automatic smooth detachment requires resolution >= 48; the requested numerical resolution has been retained.');
      const upper=b.panels.filter(p=>p.surface==='upper'),minimum=upper.reduce((a,b)=>a.cp<b.cp?a:b);
      const initialD=matchingWarm&&finite(warm.detachment)?clamp(warm.detachment,.002,.15):clamp(minimum.x,.002,.15);
      let seedD=initialD,seedA=matchingWarm&&finite(warm.attenuation)?clamp(warm.attenuation,.01,.74):.37;
      const lengthSeed=matchingWarm&&finite(warm.length)?clamp(warm.length,s.lengthMin,s.lengthMax):clamp(.4,s.lengthMin,s.lengthMax);
      const values=new Map();
      function* evaluate(length){
        length=clamp(length,s.lengthMin,s.lengthMax);const key=length.toPrecision(14);
        if(values.has(key))return values.get(key);
        if(trace.length>=s.maxLengthEvaluations)return null;
        const entry={evaluation:++serial,length,status:'running',seedDetachment:seedD,seedAttenuation:seedA};trace.push(entry);
        let lastProgress=null;
        yield progress({stage:'target-sigma length search',evaluation:serial,maxEvaluations:s.maxLengthEvaluations,length,targetSigma:t.sigma});
        try{
          const it=BV.iterate({thickness:g.thickness,camber:g.camber,camberPosition:g.camberPosition,
            alpha:g.alpha,length,detachment:seedD,attenuation:seedA,resolution:s.resolution,
            recovery:cfg.recovery,exponent:cfg.exponent,maxIterations:s.maxInnerIterations,
            closureMode:'smooth-contact',kuttaCondition:'velocity'},
            {maxEvaluations:s.maxDetachmentEvaluations,initialStep:.002,pressureTolerance:0});
          let step;
          do{stop();step=it.next();if(!step.done){lastProgress=step.value;yield progress({...step.value,stage:step.value.phase||'cavity/closure iteration',lengthEvaluation:serial,length});}}while(!step.done);
          const raw=step.value,numerical=raw.smoothDetachment?.numericalConverged===true;
          const v={length,raw,numerical,f:numerical&&finite(raw.sigma)?raw.sigma-t.sigma:null};
          Object.assign(entry,{status:raw.status,code:raw.code,sigma:raw.sigma,sigmaResidual:v.f,
            numericalConverged:numerical,physicalScreenPassed:raw.physicalAdmissibility?.screenPassed===true,
            detachment:raw.detachment?.selected,minimumWettedPressureMargin:raw.physicalAdmissibility?.minimumWettedPressureMargin,
            minimumGap:raw.metrics?.minimumHeight});
          trials.push({length,raw});values.set(key,v);last=v;
          if(numerical){seedD=raw.detachment.selected;seedA=raw.closure?.selectedAttenuation??seedA;}
          return v;
        }catch(e){
          if(e.code==='CANCELLED'||e.code==='TIME_BUDGET'){
            Object.assign(entry,{status:e.code==='CANCELLED'?'cancelled':'budget-exhausted',reason:e.message});
            trials.push({length,incomplete:true,error:e.message,lastProgress});throw e;
          }
          Object.assign(entry,{status:'error',reason:e.message});trials.push({length,error:e.message});values.set(key,null);return null;
        }
      }
      let v=yield*evaluate(lengthSeed),bracket=null,best=v?.numerical?v:null;
      function update(){
        const good=[...values.values()].filter(p=>p&&p.numerical&&finite(p.f)).sort((a,b)=>a.length-b.length);
        if(good.length)best=good.reduce((a,b)=>Math.abs(a.f)<Math.abs(b.f)?a:b);
        for(let i=1;i<good.length;i++)if(good[i-1].f*good[i].f<=0){bracket=[good[i-1],good[i]];break;}
      }
      update();
      // Sign-informed exploration is an initial-guess strategy, not a presumed
      // monotonicity/admission law. Bracketed iteration is used unless an actual
      // evaluated point already meets the declared target-sigma tolerance.
      const preferred=v?.numerical&&v.f>0?s.lengthMax:s.lengthMin;
      for(const x of [preferred,preferred===s.lengthMax?s.lengthMin:s.lengthMax,.24,.12,.56]){
        if(bracket||trace.length>=s.maxLengthEvaluations||best&&Math.abs(best.f)<=s.sigmaTolerance)break;
        yield*evaluate(x);update();
      }
      let held=0,fa,fb,scalarSteps=0;
      if(bracket){fa=bracket[0].f;fb=bracket[1].f;}
      while(bracket&&trace.length<s.maxLengthEvaluations&&Math.abs(best.f)>s.sigmaTolerance&&scalarSteps++<2*s.maxLengthEvaluations){
        const [a,b]=bracket,width=b.length-a.length;
        if(width<=128*Number.EPSILON*Math.max(1,Math.abs(a.length),Math.abs(b.length)))break;
        let x=(a.length*fb-b.length*fa)/(fb-fa);
        if(!finite(x)||x<=a.length+1e-10||x>=b.length-1e-10)x=(a.length+b.length)/2;
        if(values.has(x.toPrecision(14)))x=(a.length+b.length)/2;
        if(values.has(x.toPrecision(14)))break;
        v=yield*evaluate(x);if(!v||!v.numerical)break;
        if(Math.abs(v.f)<Math.abs(best.f))best=v;
        if(a.f*v.f<=0){bracket=[a,v];fb=v.f;if(held===1)fa*=.5;held=1;}
        else{bracket=[v,b];fa=v.f;if(held===-1)fb*=.5;held=-1;}
      }
      const rootConverged=!!best&&Math.abs(best.f)<=s.sigmaTolerance;
      const checks=best?candidateChecks(best.raw,t.sigma,rootConverged):null;
      if(checks?.accepted){
        const raw=best.raw,area=raw.height.slice(1).reduce((a,p,i)=>a+.5*(p.h+raw.height[i].h)*(p.x-raw.height[i].x),0);
        return result('admitted-research-cavity','TARGET_SIGMA_AND_SAMPLED_PHYSICAL_CHECKS_PASSED',
          'Target sigma, inner closure/BV estimator and sampled physical screens pass. This remains an unvalidated steady partial-sheet research result.',
          {acceptedForDisplay:true,cavityPresent:true,cavity:raw,root:{converged:true,length:best.length,sigma:raw.sigma,residual:best.f,bracket:bracket?.map(p=>p.length)??null},checks,
            cavityArea:{perUnitSpan_m2:area*t.chord*t.chord,normalizedByChordSquared:area,notAThreeDimensionalVolume:true},
            warmStart:{driverVersion:VERSION,configurationKey:cfg.key,length:best.length,detachment:raw.detachment.selected,attenuation:raw.closure?.selectedAttenuation??seedA}});
      }
      return result('rejected',!best?'NO_RESOLVED_DETACHMENT_CANDIDATE':!rootConverged?'TARGET_SIGMA_ROOT_NOT_RESOLVED':'FORWARD_ROOT_PHYSICAL_SCREEN_FAILED',
        !best?'No numerically resolved smooth-detachment candidate was found within the declared budget.':!rootConverged?
          'The supported length range/evaluation budget did not resolve a target-sigma root. The numerical trials are retained.':
          'A numerical target-sigma root was found, but its physical cavity checks failed. No accepted cavity shape or volume is reported.',
        {root:{converged:rootConverged,length:best?.length??null,sigma:best?.raw.sigma??null,residual:best?.f??null,bracket:bracket?.map(p=>p.length)??null},checks,
          diagnosticCandidate:best?.raw??last?.raw??null});
    }catch(e){
      if(e.code!=='CANCELLED'&&e.code!=='TIME_BUDGET')throw e;
      return result(e.code==='CANCELLED'?'cancelled':'budget-exhausted',e.code,e.message,{diagnosticCandidate:last?.raw??null});
    }
  }
  async function solve(input={},hooks={}){
    const it=iterate(input,hooks);let step,lastYield=Date.now();
    do{step=it.next();if(!step.done){hooks.onProgress?.(step.value);if(Date.now()-lastYield>25){
      await(hooks.yieldControl?hooks.yieldControl():new Promise(r=>setTimeout(r,0)));lastYield=Date.now();}}}while(!step.done);
    return step.value;
  }
  return{VERSION,SCOPE,configuration,target,pointsFor,candidateChecks,iterate,solve};
});
