/* Optional solver-guided layout comparison, inside the existing structure menu. */
(() => {
  'use strict';
  const ui=window.WingLabUI,D=typeof WingDesignAdvisor!=='undefined'?WingDesignAdvisor:null;
  if(!ui?.shell?.addStructureSubgroup||!D)return;
  const host=document.createElement('section');host.id='wingDesignAdvisor';
  host.innerHTML=`<p>Compare two goals: <b>less displacement within a mass budget</b>, and <b>lower mass within the assessed limits</b>. The current wing stays unchanged until you choose a tested layout.</p>
    <label>Allowed mass increase for the stiffness goal (%) <input id="wdaBudget" type="number" min="0" max="100" step="1" value="10" style="width:85px"></label>
    <div class="wx-row" style="margin:8px 0"><button class="btn primary" id="wdaRun">Compare layouts</button><button class="btn" id="wdaCancel" disabled>Cancel</button><button class="btn" id="wdaCSV" disabled>Save comparison CSV</button><button class="btn" id="wdaLoads">Review loads / self-weight</button></div>
    <div id="wdaStatus" role="status" aria-live="polite">Uses the current applied load and material properties. No automatic aerodynamic or geometry changes.</div>
    <progress id="wdaProgress" max="1" value="0" style="width:100%" hidden></progress>
    <div id="wdaResults"></div>
    <details style="margin-top:10px"><summary>How the design advisor works</summary>
    <p>This is a bounded numerical search, not a trained AI or a claim of global optimality. Each listed layout is run through the existing structural solver with the same outer aerodynamic shape, load, materials, and analysis settings. The pressure field is reused only while that shape is identical; its transfer and admission are checked again for every layout. A higher mesh density is not substituted for missing physics.</p>
    <p>The lower-mass choice uses your saved displacement and twist limits and the resolved nominal normal-stress check with your material card and factor of safety. The stiffness choice also respects the entered mass budget. These are assessed beam limits, not a full failure criterion. Skin, cap and member changes can fail the geometric fit checks and are then rejected with their actual reason.</p>
    <p>Ribs support skin bays, cross-section shape and local load transfer. Their local buckling and diaphragm effects are not resolved by this beam model, so the advisor does not remove ribs or rank rib count as an optimum. Adding a spar is tested, not assumed to improve the design. Runout and bond concentrations, buckling, print quality and the printer envelope still need separate checks.</p>
    <p>For an exact zero-chord tip, bending is sampled at the same 25 uniform inboard stations from 0 to 90% of semi-span. Stress uses these stations plus the union of all cap, rib, cavity and spar-runout boundaries and probes just to either side, identical across layouts. These are sampled inboard values, not continuous/global maxima. If skin changes alter the printed trailing-edge contour inside that span, the stress comparison is withheld. The full-tip slope and torsion are not verified, so an inboard trial establishes no full-wing optimum.</p>
    <p>The flight basis comes from the applied pressure record, not an unapplied aerodynamic result or a reference-data table. Gravity, if enabled, is recalculated for each layout. The rigid pressure field is held fixed: this is one flight case, without aerodynamic trim or aeroelastic redistribution. Flight design requires aircraft mass, load factors and relevant flight cases; a rib count or reduced skin thickness cannot be justified from the nominal beam stress alone.</p>
    <p>This search varies internal structure only. Changing airfoil, span, taper, sweep, dihedral or incidence requires a new aerodynamic solution and is outside this fixed-pressure comparison. Each rejected fit keeps its stated length and dimensions; the advisor does not silently shorten a spar to make a thicker cap fit.</p>
    <p>The optional worker starts only when you press Compare. It tests a finite list, stops starting new candidates after 45 seconds, reports progress, and can be cancelled immediately. Normal Solve does not run this search. Re-run after changing any inputs. Applied layouts use normal geometry validation, Undo and Save JSON.</p>
    <p>Related optimization formulation: <a href="https://mdolab-openaerostruct.readthedocs-hosted.com/en/latest/aerostructural_wingbox_walkthrough.html" target="_blank" rel="noopener">OpenAeroStruct wingbox objectives and constraints</a>. That reference does not validate this app's beam or exact-tip model.</p></details>`;
  const $=s=>host.querySelector(s),status=$('#wdaStatus'),run=$('#wdaRun'),cancel=$('#wdaCancel'),csv=$('#wdaCSV'),progress=$('#wdaProgress'),results=$('#wdaResults');
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=x=>Number.isFinite(x)?x.toPrecision(4):'Not assessed';
  let worker=null,report=null,serial=0,flowDraft='';
  const active=()=>ui.isRunning()||ui.aero()?.running;
  const draftStamp=()=>JSON.stringify(['aeroV','aeroRho','aeroAlpha','aeroMu','aeroSound','aeroSequence','aeroTarget'].map(id=>document.getElementById(id)?.value??null));
  const current=()=>report&&D.stamp(ui.state())===report.inputStamp&&draftStamp()===flowDraft;
  function busy(v){run.disabled=v;cancel.disabled=!v;progress.hidden=!v;csv.disabled=v||!report;}
  function stop(){serial++;worker?.terminate();worker=null;busy(false);}
  function error(message){stop();status.textContent=message;status.style.color='#a21a1a';}
  function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function render(r){
    report=r;const factor=r.massMultiplier,by=id=>r.rows.find(x=>x.id===id),base=r.rows[0],bay=r.layoutDiagnostics?.largestBay;
    const f=r.flightBasis,flow=f.flow;
    const pick=(id,name,partial=false)=>{const x=by(id);return x?`<p><b>${esc(name)}:</b> ${esc(x.label)} — ${n(x.metrics.massG*factor)} g, ${n(x.metrics.displacementMm)} mm${partial?' at the common inboard stations':''}. Mass ${n(x.deltaMassPercent)}%; displacement ${n(x.deltaDisplacementPercent)}%. ${partial?'Exploratory trial; no flight-valid recommendation.':'Smallest tested value under the assessed beam limits; local stability unassessed.'}</p>`:`<p><b>${esc(name)}:</b> No tested candidate satisfies all required resolved checks.</p>`;};
    results.innerHTML=`<div class="wae-box" style="margin-top:10px"><p><b>${base.metrics.partial?'Exploratory inboard comparison — no full-wing optimum':'Solver-guided comparison — nominal beam limits only'}</b></p>
      <p><b>Load basis:</b> ${esc(f.source)}.${flow?` V ${n(flow.speed)} m/s (${n(flow.speed*3.6)} km/h), α ${n(flow.alphaDeg)}°, ρ ${n(flow.density)} kg/m³; upward aerodynamic force ${n(f.upwardAerodynamicForcePerHalfN)} N per semi-wing.`:''} Wing self-weight: <b>${f.selfWeight?'ON · 1 g, recalculated':'OFF'}</b>. Estimated baseline wing weight ${n(f.wingWeightPerHalfN*factor)} N (${factor===2?'full wing':'semi-wing'}).</p>
      <p>${f.aircraftMassKg!=null?`Prescribed aircraft mass ${n(f.aircraftMassKg)} kg, load factor ${n(f.loadFactor)}.`:'Aircraft mass/load factor are not specified by this pressure record.'} This is a fixed rigid-wing load comparison; trim and aeroelastic changes are not assessed.${!f.selfWeight?' Enable wing self-weight and compare again for a gravity-loaded design.':''}</p>
      <p>${esc(r.ranking.note)}</p>${pick(r.ranking.lightest||r.ranking.exploratoryLightest,'Lower-mass comparison',base.metrics.partial)}${pick(r.ranking.stiffest||r.ranking.exploratoryStiffest,'Stiffness comparison',base.metrics.partial)}
      ${base.metrics.partial?`<p>Formal tip bending translation: ${n(base.metrics.tipBendingMm)} mm. Exact-tip slope: ${base.metrics.tipSlopeFinite?'finite':'not finite / not assessed'}; torsion unassessed. No added finite spar can certify the zero-area apex with this model.</p>`:''}
      <p>Mass shown: ${factor===2?'full mirrored wing (2 × semi-wing)':'one semi-wing'}. ${base.metrics.partial?`Comparison covers 0–0.90 semi-span: 25 common bending stations and ${r.comparisonStationsMm.length} common stress stations including section transitions; values are not tip/global maxima.`:'Displacement is the sampled maximum translation.'} Materials and applied aerodynamic forces/moments are unchanged. Skin variants may change the printed tip closure.</p>
      <p>Saved criteria: displacement ≤ ${n(r.criteria.maxTipDeflection)} mm, twist ≤ ${n(r.criteria.maxTipTwist)}°. Stiffness comparison mass budget: +${n(r.massBudgetPercent)}%. ${base.metrics.partial?'Neither motion criterion is certified by this inboard comparison.':'Resolved nominal normal stresses are checked with the existing factor of safety and material allowables.'} ${!r.stressComparable?esc(r.outerContourComparison):''}</p>
      ${bay?`<details><summary>Rib guidance</summary><p>Largest current bay: y ${n(bay.startMm)}–${n(bay.endMm)} mm (${n(bay.lengthMm)} mm). This identifies a place to check skin stability and load introduction; it is not a buckling result. The extra-rib trial fills the largest bays, but its beam response cannot determine a required rib count. Do not remove ribs merely because nominal beam stress is small.</p></details>`:''}</div>
      <div style="overflow:auto;max-height:440px"><table class="wl-list" aria-label="Design layout comparison"><thead><tr><th>Layout</th><th>Mass (g)</th><th>Displ. (mm)</th><th>Skin σ+ / |σ−| (MPa)</th><th>Assessment / action</th></tr></thead><tbody>${r.rows.map((x,i)=>{
        if(!x.metrics)return `<tr><td>${esc(x.label)}</td><td colspan="4">Rejected: ${esc(x.error||x.failed?.join('; ')||'unresolved')}</td></tr>`;
        const m=x.metrics,why=x.massOnly?'Rib mass control; local stability not assessed':!x.admitted?'Load admission withheld: '+x.failed.join('; '):m.partial?'Inboard trial only':x.eligible?'Assessed beam limits met; local failure unassessed':'One or more limits failed or not assessed';
        const effects=x.geometryEffects,detail=effects?`${effects.cavityClosureMm!=null?`Hollow cavity closes at y ${n(effects.cavityClosureMm)} mm; solid tip starts at ${n(effects.solidTipStartMm)} mm. `:''}${effects.spars.map(s=>`Spar ${s.index}: ${n(s.lengthMm)} mm${s.embeddedLengthMm>0?` (${n(s.embeddedLengthMm)} mm inside existing solid tip)`:''}`).join('; ')}`:'';
        return `<tr><td>${esc(x.label)}${i===0?' (baseline)':''}${detail?`<details><summary>Geometry effects</summary>${esc(detail)}</details>`:''}</td><td>${n(m.massG*factor)}<br>${n(x.deltaMassPercent)}%</td><td>${n(m.displacementMm)}<br>${n(x.deltaDisplacementPercent)}%</td><td>${n(m.skinTensionMpa)} / ${n(m.skinCompressionMpa)}</td><td>${esc(why)}${i&&!x.massOnly&&x.admitted?`<br><button class="btn" data-wda-apply="${i}">${m.partial?'Try inboard layout':'Try this layout'}</button>`:''}</td></tr>`;
      }).join('')}</tbody></table></div><details><summary>Interpret these changes</summary>${r.guidance.map(t=>`<p>${esc(t)}</p>`).join('')}</details>`;
    for(const button of results.querySelectorAll('[data-wda-apply]'))button.onclick=async()=>{
      if(!current()){error('The study changed after this comparison. Compare again before trying a layout.');return;}
      if(active()){status.textContent='Wait for the current solver to finish.';return;}
      const row=report.rows[+button.dataset.wdaApply],applied=ui.applyGeometry(row.patch);
      if(!applied.ok){error(applied.error);return;}
      results.querySelectorAll('[data-wda-apply]').forEach(b=>b.disabled=true);csv.disabled=true;
      status.textContent='Layout applied through normal validation. Solving it now; Undo restores the previous design. Save JSON keeps the editable layout.';
      await ui.solve();
    };
    status.style.color='';status.textContent=`Compared ${r.testedCandidates} of ${r.totalCandidates} layouts in ${(r.elapsedMs/1000).toFixed(1)} s. No inputs were changed. ${r.testedCandidates<r.totalCandidates?'Time budget reached; this is a partial search.':''}`;
  }
  run.onclick=()=>{
    if(active()){status.textContent='Wait for the current solver to finish.';return;}
    if(ui.importGate()?.open){status.textContent='Confirm the imported structural inputs first.';return;}
    const budget=+$('#wdaBudget').value;if(!Number.isFinite(budget)||budget<0||budget>100){error('Enter a mass increase budget from 0 to 100%.');return;}
    stop();report=null;results.innerHTML='';csv.disabled=true;flowDraft=draftStamp();const id=++serial;
    status.style.color='';status.textContent='Starting design comparison in a background worker…';progress.value=0;busy(true);
    try{worker=new Worker(new URL('wing-design-advisor-worker.js?v=__ADVISOR_WORKER_SHA__',document.baseURI));}
    catch(e){error('Design comparison could not start: '+e.message);return;}
    worker.onerror=e=>error('Design comparison failed: '+e.message);
    worker.onmessage=e=>{const m=e.data;if(m.id!==serial)return;
      if(m.type==='progress'){progress.max=m.total;progress.value=m.completed;status.textContent=`Testing ${m.completed+1} of ${m.total}: ${m.label}. The current wing stays unchanged.`;}
      else if(m.type==='error')error(m.message);
      else if(m.type==='result'){worker?.terminate();worker=null;render(m.result);busy(false);invalidateIfChanged();}
    };
    worker.postMessage({id,state:JSON.parse(JSON.stringify(ui.state())),options:{massBudgetPercent:budget}});
  };
  cancel.onclick=()=>{stop();status.textContent='Comparison cancelled. The current study is unchanged.';};
  $('#wdaLoads').onclick=()=>window.dispatchEvent(new Event('wing-open-structural-loads'));
  csv.onclick=()=>{
    if(!current()){status.textContent='Inputs changed. Compare again before exporting the report.';return;}
    const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"',head=['layout','scope','mass_g','displacement_mm','comparison_eta','skin_tension_MPa','skin_compression_magnitude_MPa','twist_deg','admitted','assessed_beam_limits_met','reason','applied_speed_m_s','applied_alpha_deg','applied_rho_kg_m3','wing_self_weight','cavity_closure_y_mm','spar_runouts_mm'];
    const data=report.rows.map(x=>[x.label,x.metrics?.scope,x.metrics?x.metrics.massG*report.massMultiplier:'',x.metrics?.displacementMm,x.metrics?.comparisonEta,x.metrics?.skinTensionMpa,x.metrics?.skinCompressionMpa,x.metrics?.twistDeg,x.admitted,x.eligible,x.error||report.ranking.note,report.flightBasis.flow?.speed,report.flightBasis.flow?.alphaDeg,report.flightBasis.flow?.density,report.flightBasis.selfWeight,x.geometryEffects?.cavityClosureMm,x.geometryEffects?.spars.map(s=>s.lengthMm).join(';')]);
    download('Wing_design_comparison.csv',[head,...data].map(r=>r.map(quote).join(',')).join('\n'),'text/csv');
  };
  function invalidateIfChanged(){
    if(!report||current())return;
    results.querySelectorAll('[data-wda-apply]').forEach(b=>b.disabled=true);csv.disabled=true;
    status.textContent='Inputs or the aerodynamic draft changed. These results belong to the earlier load/design snapshot; compare again before using a layout.';
  }
  document.addEventListener('input',invalidateIfChanged);
  document.addEventListener('change',invalidateIfChanged);
  ui.shell.addStructureSubgroup({id:'wxDesignAdvisor',title:'Design advisor · compare layouts',node:host});
})();
