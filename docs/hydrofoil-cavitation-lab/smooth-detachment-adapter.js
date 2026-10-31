/* Admission adapter for the immutable Opus smooth-detachment research module.
 * No flow equations, root estimator, fit window or solution samples are changed.
 * Browser load order: cavitation.js, smooth-detachment.js, this file.
 * The original research wrapper is retained separately; this adapter enforces
 * the same physical pressure screen as the current cavity core.
 */
(function(root,factory){
  const node=typeof module!=='undefined'&&module.exports;
  const api=factory(node?require('./cavitation.js'):root.HydrofoilCavitation,
    node?require('./smooth-detachment.js'):root.SmoothDetachment);
  if(node)module.exports=api;else root.HydrofoilSmoothDetachment=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis,function(H,SD){
  'use strict';
  const VERSION='0.1.0-strict-research';
  if(!H||typeof H.physicalAdmissibility!=='function'||!SD||typeof SD.iterate!=='function')
    throw new Error('Load the current cavitation core and smooth-detachment research module first.');

  function assess(raw){
    const d=raw.detachment;
    if(!d||!Array.isArray(raw.panels)||!raw.metrics)
      throw new Error('The smooth-detachment module returned an incomplete candidate.');
    // These are numerical root/inner-solve requirements, not a pressure allowance.
    // Keep the original kernel geometry decision: no negative-gap branch is rescued.
    const bracketed=Array.isArray(d.bracket)&&d.bracket.length===2&&d.bracket.every(Number.isFinite);
    const betaConverged=Number.isFinite(d.beta)&&Math.abs(d.beta)<=d.settings.tolBeta;
    const innerConverged=d.innerStatus==='converged-prototype';
    const geometryValid=raw.metrics.geometryValid===true;
    const numericalConverged=bracketed&&betaConverged&&d.regularityResolved===true&&innerConverged&&geometryValid;
    // Never inherit a physical check that only assessed the inner closure or a
    // user-configured pressure tolerance. The core 0.3.2 screen uses roundoff only.
    const physicalAdmissibility=H.physicalAdmissibility(raw.panels,raw.sigma,
      {equationsConverged:numericalConverged,geometryValid});
    if(physicalAdmissibility.status==='FAILED_WETTED_PRESSURE')
      physicalAdmissibility.reason='At the automatically selected detachment station, computed liquid still labelled wetted falls below vapour pressure. The numerical root is retained, but it is not a physically accepted cavity. No pressure or gap samples have been clipped.';
    const candidates=d.admissibleWithinTolerance||[];
    const safeDetachment={...d,initial:d.trace?.[0]?.detachment??null,
      numericalCandidatesWithinBetaTolerance:candidates,
      // The source name does not include a pressure check. Do not expose it as
      // a list of physically admissible alternate stations.
      admissibleWithinTolerance:undefined};
    const code=!numericalConverged?raw.code:
      physicalAdmissibility.screenPassed?'BV_NUMERICAL_CHECKS_PASSED':'WETTED_PRESSURE_BELOW_VAPOUR';
    return {...raw,
      // The existing core status describes equation/geometry convergence. A
      // consumer MUST also require physicalAdmissibility.screenPassed for any
      // accepted cavity display. Raw trial samples are retained for diagnostics.
      status:numericalConverged?'converged-prototype':'rejected',code,
      reason:!numericalConverged?raw.reason:physicalAdmissibility.reason,
      physicalAdmissibility,detachment:safeDetachment,
      smoothDetachment:{adapterVersion:VERSION,sourceVersion:SD.VERSION,
        rawStatus:raw.status,rawCode:raw.code,rawReason:raw.reason,
        innerStatus:d.innerStatus,innerReason:d.innerReason,
        numericalConverged,bracketed,betaConverged,geometryValid,
        acceptedForDisplay:physicalAdmissibility.screenPassed,
        pressureGate:'Core physicalAdmissibility; floating-point roundoff only. No null bypass or mesh-error allowance.',
        estimator:'Default source cavity estimator: least-squares first FIVE interior approximate normal gaps against s^(3/2) and s^2 in original foil arclength. Four-/six-node windows and upstream speed are diagnostics.',
        limitation:'Numerical candidate; not experimental validation or proof of a unique smooth cavity.'}};
  }
  function* iterate(input={},settings={}){
    // Explicit zero also prevents the raw source from calling a finite
    // below-vapour defect ADMITTED. The final decision is recomputed above.
    const it=SD.iterate(input,{...settings,pressureTolerance:0});let s;
    do{s=it.next();if(!s.done)yield {...s.value,adapterVersion:VERSION};}while(!s.done);
    return assess(s.value);
  }
  function solve(input={},settings={}){const it=iterate(input,settings);let s;do{s=it.next();}while(!s.done);return s.value;}
  return {VERSION,iterate,solve,assess};
});
