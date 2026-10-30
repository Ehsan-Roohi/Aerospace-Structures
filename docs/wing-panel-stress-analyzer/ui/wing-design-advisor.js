/* Bounded, solver-driven layout comparison. No language-model estimates,
 * altered loads, new material allowables, or inferred local rib physics. */
const WingDesignAdvisor = (() => {
  'use strict';
  const VERSION='0.2.0', clone=x=>JSON.parse(JSON.stringify(x));
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const maximum=a=>{const v=Array.from(a||[]).filter(finite);return v.length?Math.max(...v.map(Math.abs)):null;};
  const stamp=s=>JSON.stringify([s.geometry,s.plaKey,s.plaOver,s.rodKey,s.rodOver,s.assembly,s.load,s.criteria,s.analysis,s.aerodynamics,s.aeroLoad,s.mirrorFullWing]);
  const round=x=>+x.toFixed(5);
  function variants(state){
    const g=state.geometry,rows=[{id:'baseline',label:'Current layout',patch:{}}];
    const push=(id,label,patch,extra={})=>rows.push({id,label,patch:clone(patch),...extra});
    for(const d of [.2,.4,-.2])if(g.skin+d>=.8-1e-10)push('skin'+d,`Skin ${round(g.skin+d)} mm`,{skin:round(g.skin+d)});
    const spars=g.spars||[];
    if(spars.length){
      for(const d of [-.05,.05]){
        const s=clone(spars);s[0].fraction=round(s[0].fraction+d);
        if(s[0].fraction>.08&&s[0].fraction<.85)push('move'+d,`Move spar 1 to ${s[0].fraction}c; keep its length`,{spars:s});
      }
      for(const d of [.2,.4]){const s=clone(spars);for(const p of s){p.topThickness=round(p.topThickness+d);p.bottomThickness=round(p.bottomThickness+d);}push('caps'+d,`All spar caps +${d} mm; keep runouts`,{spars:s});}
      const wider=clone(spars);for(const p of wider){p.topWidth+=2;p.bottomWidth+=2;}push('width2','All spar caps +2 mm width; keep runouts',{spars:wider});
    }
    // Finite, explicitly reported new spar length. Never extend through an
    // inadmissible tip or silently shorten an existing member to make it fit.
    if(!g.rodFractions?.length&&spars.length<4){
      const material=clone(spars[0]?.material||{});
      for(const f of [.3,.55])if(!spars.some(s=>Math.abs(s.fraction-f)<.09)){
        const length=round(g.tipChord===0?Math.min(.7*g.semiSpan,...spars.map(s=>s.length)):g.semiSpan);
        const s={fraction:f,length,widthMode:g.tipChord===0?'auto':'fixed',topWidth:8,bottomWidth:8,topThickness:.8,bottomThickness:.8,webThickness:.6,material};
        push('add'+f,`Add spar at ${f}c, length ${length} mm`,{spars:[...clone(spars),s]});
      }
    }
    // Adding ribs is an educational control, excluded from global ranking.
    // No rib removal is generated: missing local stability must not reward it.
    const ribs=g.customInteriorRibs==null?Array.from({length:g.interiorRibs||0},(_,i)=>(i+1)*g.semiSpan/((g.interiorRibs||0)+1)):clone(g.customInteriorRibs);
    const extra=clone(ribs);
    for(let k=0;k<2;k++){const a=[0,...extra,g.semiSpan].sort((x,y)=>x-y);let i=1;for(let j=2;j<a.length;j++)if(a[j]-a[j-1]>a[i]-a[i-1])i=j;extra.push(round((a[i-1]+a[i])/2));}
    push('ribs2','Add two ribs in the largest bays',{customInteriorRibs:extra.sort((a,b)=>a-b)},{massOnly:true});
    // Visit both objectives and the main spar alternative before slower,
    // lower-priority controls if the interactive time budget is reached.
    const priority=id=>id==='baseline'?0:id.startsWith('add')?1:id==='skin-0.2'?2:id==='move0.05'?3:id==='width2'?4:id==='ribs2'?99:10;
    return rows.sort((a,b)=>priority(a.id)-priority(b.id));
  }
  function snap(E,g,load){return [...E.ribStations(g),...E.seams(g),...(g.stations||[]).map(s=>s.eta*g.semiSpan),...(g.spars||[]).map(s=>s.length),...(load.kind==='custom'?load.items||[]:[]).flatMap(p=>p.kind==='point'?[p.position]:p.kind==='table'?p.points.map(r=>r[0]):p.kind==='schrenk'?[0,g.semiSpan]:[p.start,p.end])].filter(finite);}
  function comparisonStations(input,specs,E,eta){
    const L=input.geometry.semiSpan,end=eta*L,eps=Math.max(1e-5,L*1e-7),points=Array.from({length:25},(_,i)=>end*i/24);
    // The union is fixed BEFORE evaluation: root-cap exits, rib edges, cavity
    // closure and member runouts must not move the stress sample coverage.
    const edge=y=>{if(finite(y))points.push(y-eps,y,y+eps);};
    for(const spec of specs)try{
      // Only topology locations are prepared here. Full geometry/fit admission
      // is run by the normal kernel for each actual candidate below.
      const g={...input.geometry,...clone(spec.patch)};
      edge(g.cap);edge(L-g.cap);edge(E.cavityTipLimit(g));edge(E.cavityTipLimit(g)-g.cap);
      for(const y of E.ribStations(g)){edge(y-g.ribThickness/2);edge(y+g.ribThickness/2);}
      for(const y of E.seams(g)){edge(y-g.cap);edge(y+g.cap);}
      for(const s of g.spars||[])edge(s.length);
      for(const y of snap(E,g,input.load))edge(y);
    }catch{/* Invalid candidate geometry remains rejected in the evaluation. */}
    return [...new Set(points.filter(y=>finite(y)&&y>=0&&y<=end).map(y=>+y.toFixed(8)))].sort((a,b)=>a-b);
  }
  function geometryEffects(g,E){
    const closed=g.tipChord===0,closure=closed?E.cavityTipLimit(g):null,solid=closed?closure-g.cap:null;
    return {cavityClosureMm:closure,solidTipStartMm:solid,
      spars:(g.spars||[]).map((s,i)=>({index:i+1,positionFraction:s.fraction,lengthMm:s.length,widthMode:s.widthMode,
        embeddedLengthMm:closed?Math.max(0,s.length-solid):0})),
      trailingEdgeTransitionChordMm:closed?12*g.skin:null};
  }
  function metrics(r,E,eta,stations,stressComparable){
    const a=r.analysis3D,partial=!!a?.stressOnly,L=r.geometry.semiSpan;
    let displacement,stressT,stressC,tip,validity;
    if(partial){
      if(!a.bending)throw Error('The closed-tip model has no bending response.');
      // Same physical stations for every layout, never a changing last mesh
      // point near a singular tip. This is explicitly an INBOARD comparison.
      const y=stations,u=Array.from({length:25},(_,i)=>a.bending.at(eta*L*i/24));
      displacement=maximum(u.map(p=>Math.hypot(p.verticalMm,p.chordwiseMm)));
      const tensions=[],compressions=[];
      for(const q of y){const cut=a.cutAt(q);if(!cut.resolved)continue;for(const p of cut.outer){const v=a.evaluateStress(q,p).value;if(finite(v)){tensions.push(Math.max(0,v));compressions.push(Math.max(0,-v));}}}
      stressT=stressComparable?maximum(tensions):null;stressC=stressComparable?maximum(compressions):null;tip=a.bending.tip;validity=a.bending.validity;
    }else{
      displacement=maximum(Array.from(r.deflection||[],(v,i)=>Math.hypot(v,r.chordwiseDeflection?.[i]||0)));
      const skin=[...r.stress.sigTop,...r.stress.sigBot];
      stressT=maximum(a?.normalStress?.skinTension||skin.map(v=>Math.max(0,v)));stressC=maximum(a?.normalStress?.skinCompression||skin.map(v=>Math.max(0,-v)));
      validity=a?.validity||{smallDisplacement:displacement/L<=.05&&maximum(r.slope)<=.1&&maximum(r.twist)<=.1};
    }
    const twist=partial?null:maximum(Array.from(r.twist||[],v=>v*180/Math.PI));
    const F=r.load.fos||1,normalRatio=finite(stressT)&&finite(stressC)?Math.max(F*stressT/r.pla.ft,F*stressC/r.pla.fc):null;
    let memberRatio=normalRatio;
    for(const p of a?.normalStress?.spars||r.stress.spars||[])if(p.material&&finite(p.tension)&&finite(p.compression))memberRatio=Math.max(memberRatio,F*p.tension/p.material.ft,F*p.compression/p.material.fc);
    if(r.geometry.rodFractions?.length){const sr=maximum(r.stress.sigRod);memberRatio=finite(sr)?Math.max(memberRatio,F*sr/Math.min(r.rod.ft,r.rod.fc)):null;}
    return {massG:r.mass.total,displacementMm:displacement,twistDeg:twist,skinTensionMpa:stressT,skinCompressionMpa:stressC,nominalSkinRatio:normalRatio,nominalNormalRatio:memberRatio,partial,comparisonEta:partial?eta:1,
      tipBendingMm:partial&&tip?.translationFinite?Math.hypot(tip.verticalMm,tip.chordwiseMm):null,tipSlopeFinite:partial?tip?.slopeFinite:null,
      linearScreenPassed:partial?false:validity?validity.smallDisplacement===true:null,stressComparable:!partial||stressComparable,
      scope:partial?`Inboard pure-bending comparison at common stations 0–${eta} semi-span; torsion and full-tip validity unassessed`:'Nominal beam response; local buckling, bonds and failure interactions unassessed'};
  }
  function ranking(rows,criteria,budget){
    const base=rows.find(r=>r.id==='baseline');if(!base?.metrics)throw Error('The current layout could not be evaluated.');
    for(const r of rows){
      if(!r.metrics)continue;const m=r.metrics;
      r.deltaMassPercent=100*(m.massG/base.metrics.massG-1);r.deltaDisplacementPercent=base.metrics.displacementMm>0?100*(m.displacementMm/base.metrics.displacementMm-1):null;
      r.assessed={deflection:m.partial?null:finite(m.displacementMm)&&m.displacementMm<=criteria.maxTipDeflection,twist:finite(m.twistDeg)?m.twistDeg<=criteria.maxTipTwist:null,nominalNormalStress:finite(m.nominalNormalRatio)?m.nominalNormalRatio<=1:null};
      r.eligible=!r.massOnly&&r.admitted&&m.linearScreenPassed===true&&!m.partial&&Object.values(r.assessed).every(x=>x===true);
      r.partial=!r.eligible&&m.partial;
    }
    const valid=rows.filter(r=>r.eligible),stiff=valid.filter(r=>r.metrics.massG<=base.metrics.massG*(1+budget/100)+1e-9);
    const light=valid.slice().sort((a,b)=>a.metrics.massG-b.metrics.massG||a.metrics.displacementMm-b.metrics.displacementMm)[0];
    const stiffer=stiff.slice().sort((a,b)=>a.metrics.displacementMm-b.metrics.displacementMm||a.metrics.massG-b.metrics.massG)[0];
    const exploratory=rows.filter(r=>r.metrics&&r.admitted&&!r.massOnly);
    const inboardStiff=exploratory.filter(r=>r.metrics.massG<=base.metrics.massG*(1+budget/100)+1e-9).sort((a,b)=>a.metrics.displacementMm-b.metrics.displacementMm)[0];
    const inboardLight=exploratory.slice().sort((a,b)=>a.metrics.massG-b.metrics.massG)[0];
    return {lightest:light?.id||null,stiffest:stiffer?.id||null,exploratoryLightest:base.metrics.partial?inboardLight?.id||null:null,exploratoryStiffest:base.metrics.partial?inboardStiff?.id||null:null,
      note:base.metrics.partial?'No full-wing optimum is declared: exact-tip slope validity and torsion are not assessed. Listed best inboard comparisons are exploratory, not a verified design.':'Best among the tested layouts under the assessed beam limits only; this is not a global optimum or a strength certification.'};
  }
  async function run(state,deps,options={}){
    const {E,A,U,IO}=deps,saved=stamp(state),eta=.9,budget=Number(options.massBudgetPercent??10),startBudget=Number(options.candidateStartBudgetMs??45000);
    if(!finite(budget)||budget<0||budget>100)throw Error('Enter a mass increase budget from 0 to 100%.');
    if(!finite(startBudget)||startBudget<1000||startBudget>180000)throw Error('The candidate-start budget must be 1–180 seconds.');
    if(state.emptyStudy)throw Error('Create or open a wing first.');
    const input=IO.printedEngineInput(state,E),g=E.makeGeometry(input.geometry),key=IO.sha256(A.geometryKey(g));
    if(state.aeroLoad&&state.aeroLoad.geometrySha256!==key)throw Error('The applied aerodynamic load belongs to another outer shape. Re-solve and apply it first.');
    if(!state.aeroLoad&&input.load.kind==='custom'&&!input.load.items?.length&&!input.load.selfWeight)throw Error('No structural load is applied. Apply aerodynamic loads or add a structural load first.');
    // Do not generate a nominal spar material from hidden defaults.
    const stateForCandidates=clone(state);if(!stateForCandidates.geometry.spars?.length)stateForCandidates.geometry.spars=[];
    const specs=variants(stateForCandidates),rows=[],start=performance.now(),cache=new Map(),stations=comparisonStations({...input,geometry:g},specs,E,eta);
    const maxSkin=Math.max(g.skin,...specs.map(s=>s.patch.skin||g.skin)),endChord=E.chordAt(g,eta*g.semiSpan),stressComparable=g.tipChord!==0||endChord>=12*maxSkin;
    let referenceWrench=null;
    const limits={maxTipDeflection:state.criteria?.maxTipDeflection||45,maxTipTwist:state.criteria?.maxTipTwist||2};
    for(let i=0;i<specs.length;i++){
      if(options.cancelled?.())break;
      if(i>0&&performance.now()-start>startBudget)break;
      const spec=specs[i],row={...spec,patch:clone(spec.patch)};
      options.progress?.({completed:i,total:specs.length,label:spec.label});
      await Promise.resolve();
      try{
        const candidate={...clone(input),geometry:{...clone(input.geometry),...clone(spec.patch)}};
        if(spec.id.startsWith('add'))for(const spar of candidate.geometry.spars)if(!Object.keys(spar.material||{}).length)spar.material=clone(input.pla);
        row.patch=spec.id.startsWith('add')?{spars:clone(candidate.geometry.spars)}:row.patch;
        const cg=E.makeGeometry(candidate.geometry);
        if(IO.sha256(A.geometryKey(cg))!==key)throw Error('This variant changes the outer aerodynamic shape; its pressure field must be solved again.');
        const cacheKey=JSON.stringify(candidate.geometry);let value=cache.get(cacheKey);
        if(!value){
          let delivered=null,loadWrench=null;if(state.aeroLoad){
            delivered=U.delivered(A,cg,state.aeroLoad,snap(E,cg,input.load));candidate.aeroLoad=U.engineLoad(delivered,state.aeroLoad.label);
            loadWrench=delivered.rootWrench.map(x=>x.value);
            if(!referenceWrench)referenceWrench=loadWrench;
            if(loadWrench.some((v,k)=>Math.abs(v-referenceWrench[k])>1e-9*Math.max(1,Math.abs(v),Math.abs(referenceWrench[k]))))throw Error('Aerodynamic force or moment changed during transfer; this comparison is rejected.');
          }
          const t=performance.now(),result=E.solve(candidate),admission=state.aeroLoad?U.admit(A,cg,state.aeroLoad,delivered,result):null;
          value={metrics:metrics(result,E,eta,stations,stressComparable),geometryEffects:geometryEffects(cg,E),loadWrench,admitted:admission?admission.admitted:true,admissionMode:admission?.mode||'prescribed-load',failed:admission?.failed||[],milliseconds:performance.now()-t};
          if(admission&&admission.claims?.twist!=='shown')value.metrics.twistDeg=null;
          cache.set(cacheKey,value);
        }
        Object.assign(row,clone(value));
      }catch(error){row.error=error.message;row.admitted=false;}
      rows.push(row);
      if(spec.id==='baseline'&&!row.metrics)throw Error('Current layout: '+row.error);
    }
    if(saved!==stamp(state))throw Error('Comparison changed its input snapshot.');
    const ranks=ranking(rows,limits,budget),partial=rows[0].metrics.partial,flow=state.aeroLoad?.flow||null;
    const supports=[0,...E.ribStations(g),g.semiSpan].sort((a,b)=>a-b),bays=supports.slice(1).map((end,i)=>({startMm:supports[i],endMm:end,lengthMm:end-supports[i]})),largestBay=bays.slice().sort((a,b)=>b.lengthMm-a.lengthMm)[0];
    const flightBasis={source:state.aeroLoad?'Applied aerodynamic panel record':input.load.kind==='flight'?'Prescribed aircraft lift':'Prescribed structural loads',
      flow,rootAerodynamicWrench:referenceWrench,upwardAerodynamicForcePerHalfN:referenceWrench?.[2]??null,selfWeight:input.load.selfWeight===true,
      gravityMode:input.load.selfWeight?'1 g, recomputed from each candidate mass':'Not included',wingWeightPerHalfN:rows[0].metrics.massG*.00981,
      aircraftMassKg:input.load.kind==='flight'?input.load.aircraftMass:null,loadFactor:input.load.kind==='flight'?input.load.loadFactor:null,
      trimAssessed:false,aeroelasticRedistribution:false};
    return {version:VERSION,inputStamp:saved,rows,ranking:ranks,criteria:limits,massBudgetPercent:budget,candidateStartBudgetMs:startBudget,comparisonEta:partial?eta:1,totalCandidates:specs.length,testedCandidates:rows.length,elapsedMs:performance.now()-start,
      flightBasis,layoutDiagnostics:{ribStationsMm:E.ribStations(g),largestBay,localStabilityAssessed:false},comparisonStationsMm:partial?stations:null,stressComparable,outerContourComparison:stressComparable?'Comparison span stays outside the skin-dependent trailing-edge transition':'Inboard stress comparison withheld: skin changes also change the outer printed tip contour inside this comparison span',
      massMultiplier:state.mirrorFullWing?2:1,outerAerodynamicShapePreserved:true,pressureSolveReused:!!state.aeroLoad,criteriaPreserved:true,
      guidance:[partial?'This pointed-tip case has a finite formal bending translation but may have an unbounded exact-tip slope. Do not use its inboard ranking as proof of full-wing validity.':'Compare the tested beam responses at identical outer shape and applied load.',
        'Ribs support skin bays and local load transfer. The beam model does not resolve diaphragm stiffness or local buckling; it cannot decide the required rib count. Rib variants are excluded from the optimizer ranking.',
        'A second spar can change both bending stiffness and torsional lever arm. Its value must be measured; adding one is not automatically necessary or better.',
        'Skin changes may alter the manufactured closed-tip trailing-edge closure. The panel model retains its existing sharp-edge geometry approximation.',
        'Read the cavity closure and spar runouts for each candidate: a skin change is not a pure wall-thickness change near a closed tip. Existing member lengths are never shortened silently.',
        flightBasis.selfWeight?'Gravity is recalculated from each candidate mass. The aerodynamic pressure record is fixed on the rigid outer shape; no aeroelastic or trim re-solve is performed.':'Wing self-weight is OFF. This compares the applied lift/load alone; enable self-weight and re-run before judging a gravity-loaded wing.',
        'A flight-ready optimum also needs aircraft mass, load factors and multiple flight cases, with verified local skin stability, bonds and runouts. These comparisons do not establish those missing constraints.',
        'No local buckling, runout/bond stress, printed-material certification, or printer-envelope test is inferred. Check manufacturing separately.'],
      algorithm:'Bounded deterministic candidate search using the existing structural solver and unchanged admission. No language model is called during calculation; no trained AI or global-optimum claim.'};
  }
  return Object.freeze({VERSION,stamp,variants,metrics,ranking,comparisonStations,geometryEffects,run});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingDesignAdvisor;
