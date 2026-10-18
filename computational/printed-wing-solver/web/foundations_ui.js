/* Lecture 03 links deliberately replace loads rather than adding to an old study. */
const Lecture03BeamCases = Object.freeze({
  'l03-centre': {support:'cantilever',loads:[{kind:'point',position:225,force:2}]},
  'l03-tip': {support:'cantilever',loads:[{kind:'point',position:450,force:2}]},
  'l03-uniform': {support:'cantilever',loads:[{kind:'distributed',start:0,end:450,qStart:2/450,qEnd:2/450}]},
  'l03-simple': {support:'simply-supported',loads:[{kind:'point',position:225,force:2}]},
  'l03-fixed': {support:'fixed-fixed',loads:[{kind:'point',position:225,force:2}]},
  'l03-lift': {support:'cantilever',loads:[{kind:'distributed',start:0,end:450,qStart:-2/450,qEnd:-2/450}]},
  'hw2b-cantilever': {length:450,width:16,height:8,E:2200,support:'cantilever',loads:[{kind:'distributed',start:0,end:450,qStart:0,qEnd:.002}]},
  'hw2b-roller-pin': {length:450,width:16,height:8,E:2200,support:'simply-supported',simpleArrangement:'roller-left',loads:[{kind:'distributed',start:0,end:450,qStart:.001,qEnd:.002}]},
  'hw2b-fixed': {length:450,width:16,height:8,E:2200,support:'fixed-fixed',loads:[{kind:'distributed',start:0,end:450,qStart:.002,qEnd:0}]}
});
/*
 * MIE 446 Beam Lab — controller for the beam workspace (#foundations).
 * Uses BeamSections, BeamLearningEngine, BeamStudy, BeamDiagrams, BeamSolution and CompanionTools.
 * The inputs form a DRAFT. Every result shown comes from the last SOLVED model. When the draft differs
 * from that model, or the last solve was rejected, results are marked stale, the status says so and
 * exports are disabled: an invalid or pending change is never presented as the current solution.
 */
(() => {
  'use strict';
  const B=BeamLearningEngine, D=BeamDiagrams, Study=BeamStudy, Sol=BeamSolution, SEC=BeamSections;
  const host=document.querySelector('#foundations');
  const $=s=>document.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
  const esc=Study.escapeHtml, fmt=D.fmt, f=(x,n=3)=>Number(x).toFixed(n);
  const clone=v=>JSON.parse(JSON.stringify(v));
  const plain=v=>String(Number(Number(v).toPrecision(6)));
  const raf=fn=>(window.requestAnimationFrame?window.requestAnimationFrame(fn):setTimeout(fn,16));
  const reducedMotion=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MAX_LOADS=Study.LIMITS.loads;   // the load form and imported/shared studies use the same limit
  const BASE=Object.freeze({length:450,E:2000,density:1.24,elements:30,section:{shape:'rectangle',width:20,height:10},
    supports:[{x:0,kind:'fixed'}],hinges:[],loads:[{kind:'point',position:450,force:2}],selfWeight:false});
  const DESCRIBE={fixed:'v = 0 and θ = 0; vertical reaction and reaction couple',
    pin:'v = 0; rotation free; vertical reaction, no couple (horizontal translation restrained)',
    roller:'v = 0; rotation and horizontal translation free; vertical reaction, no couple',
    free:'no restraint; no support reaction; end can move and rotate'};

  /* ------------------------------------------------------------ model setup */

  function presetModel(name) {
    const p=Lecture03BeamCases[name];
    return Study.modelFromInput(B.normalize({length:p.length??450,width:p.width??20,height:p.height??10,E:p.E??2000,
      density:BASE.density,elements:BASE.elements,support:p.support,simpleArrangement:p.simpleArrangement,loads:clone(p.loads)}));
  }
  const params=new URLSearchParams(window.location.search);
  const caseName=params.get('beamCase');
  const lectureCase=caseName!==null&&Object.prototype.hasOwnProperty.call(Lecture03BeamCases,caseName)?caseName:null;
  let startMessage='', initial=clone(BASE);
  if(lectureCase) initial=presetModel(lectureCase);
  else if(params.has('beam')) {
    try {const shared=Study.decodeShare(params.get('beam'));B.solve({...shared,modes:false});initial=shared;startMessage='Shared study opened from the link and solved.';}
    catch(e) {startMessage=`The shared beam link could not be opened: ${e.message} The default study is shown instead.`;}
  }

  const st={model:initial,solved:null,error:'',mechanism:null,draftError:'',tab:'diagrams',cut:{x:initial.length/2,side:'left',limit:'left'},
    mode:0,animated:false,phase:0,placing:null,drag:null,editLoad:null,compare:{A:null,B:null},showDeflection:true,autoSolve:false,
    cache:{},message:''};

  /* ------------------------------------------------------------------ layout */

  const icon={
    pin:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4l-6 9h12z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 16h14" stroke="currentColor" stroke-width="1.8"/></svg>',
    roller:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3l-5 8h10z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 17.5h14" stroke="currentColor" stroke-width="1.5"/></svg>',
    fixed:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3v14" stroke="currentColor" stroke-width="2.2"/><path d="M7 5l-4 3M7 9l-4 3M7 13l-4 3M7 10h10" stroke="currentColor" stroke-width="1.5"/></svg>',
    hinge:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h5M13 10h5" stroke="currentColor" stroke-width="2.2"/><circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'};
  const field=(id,label,unit,attrs='')=>`<label class="bl-field" id="${id}Field"><span id="${id}Label">${label}</span><span class="bl-input"><input id="${id}" type="number" step="any" inputmode="decimal" ${attrs}><span class="bl-unit">${unit}</span></span></label>`;
  const named=(name,label,unit,attrs='')=>`<label class="bl-field"><span>${label}</span><span class="bl-input"><input name="${name}" type="number" step="any" inputmode="decimal" required ${attrs}>${unit?`<span class="bl-unit">${unit}</span>`:''}</span></label>`;

  host.classList.add('bl');
  host.innerHTML=`
  <header class="bl-header">
    <div class="bl-brand"><svg viewBox="0 0 40 28" aria-hidden="true"><path d="M3 12h34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M6 15l-4 7h8z M34 15l-4 7h8z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 2v8" stroke="currentColor" stroke-width="2"/><path d="M17 7l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
      <div><b>Beam Lab</b><small>MIE 446 · Aerospace Structures</small></div></div>
    <button type="button" class="bl-navtoggle" id="beamNavToggle" aria-expanded="false" aria-controls="beamNav">Workspaces</button>
    <nav class="bl-nav" id="beamNav" aria-label="Workspaces">
      <button type="button" data-stage="beam" aria-pressed="true">Beam</button>
      <span>Printed wing</span>
      <button type="button" data-stage="shell" aria-pressed="false">Skin only</button>
      <button type="button" data-stage="rods" aria-pressed="false">+ Rods</button>
      <button type="button" data-stage="ribs" aria-pressed="false">+ Ribs</button>
      <button type="button" data-stage="project" aria-pressed="false">Course wing</button>
      <button type="button" data-stage="metal" aria-pressed="false">D.520 full-scale wing</button>
      <details class="bl-companion"><summary>Wing geometry tool</summary><div class="bl-companion-pop" data-companion="vinco"></div></details>
    </nav>
    <p class="bl-intro">Predict → set supports and loads → solve → explain. Results always belong to the last <b>solved</b> model; edits stay pending until you press <b>Solve</b>.</p>
  </header>
  <div class="bl-app">
    <aside class="bl-side" aria-label="Beam inputs">
      <div class="bl-run">
        <div class="bl-status" id="beamRunStatus" role="status" aria-live="polite"><span class="bl-chip" id="beamChip">Starting</span><span id="beamRunText">Solving the default study…</span></div>
        <div class="bl-run-actions"><button type="button" class="bl-btn bl-btn-primary bl-btn-solve" id="beamSolve">Solve</button></div>
        <label class="bl-auto"><input type="checkbox" id="beamAutoSolve"> Solve automatically after each valid change</label>
        <button type="button" class="bl-btn bl-btn-sm" id="beamRevert" hidden>Revert inputs to the last solved model</button>
      </div>
      <details class="bl-acc" open><summary><span class="bl-step">1</span>Span, material &amp; mesh</summary><div class="bl-acc-body">
        <form id="beamGeometry" novalidate><div class="bl-grid2">
          ${named('length','Length L','mm')}${named('E','Elastic modulus E','MPa')}${named('density','Density ρ','g/cm³')}${named('elements','Requested elements','',"step='1' min='4' max='100'")}
        </div><button type="submit" class="sr-only">Solve</button></form>
        <p class="bl-help">Support, load and hinge stations are always mesh nodes. The mesh only refines between them.</p>
      </div></details>
      <details class="bl-acc" open><summary><span class="bl-step">2</span>Cross-section <span class="bl-badge" id="beamSectionBadge"></span></summary><div class="bl-acc-body">
        <label class="bl-field"><span>Shape</span><select class="bl-select" id="beamShape">${Object.entries(SEC.SHAPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></label>
        <div class="bl-grid2" id="beamSectionFields"></div>
        <div id="beamSectionView"></div>
      </div></details>
      <details class="bl-acc" open><summary><span class="bl-step">3</span>Supports &amp; hinges</summary><div class="bl-acc-body">
        <div class="bl-grid2" id="beamSupportOptions">
          <label class="bl-field"><span>Left end · x = 0</span><select class="bl-select" id="beamleftSupport">${['fixed','pin','roller','free'].map(k=>`<option value="${k}">${k}</option>`).join('')}</select></label>
          <label class="bl-field"><span>Right end · x = L</span><select class="bl-select" id="beamrightSupport">${['fixed','pin','roller','free'].map(k=>`<option value="${k}">${k}</option>`).join('')}</select></label>
        </div>
        <div><h4 class="bl-mini">Interior supports</h4><ol class="bl-list" id="beamInteriorList"></ol>
          <div class="bl-row"><button type="button" class="bl-btn bl-btn-sm" id="beamAddSupport">+ Interior support</button><button type="button" class="bl-btn bl-btn-sm" id="beamAddHinge">+ Internal hinge</button></div></div>
        <div><h4 class="bl-mini">Internal hinges (moment releases)</h4><ol class="bl-list" id="beamHingeList"></ol></div>
        <div class="bl-stability" id="beamSupportStatus" role="status" aria-live="polite"></div>
        <p class="bl-help">Or use <b>Place</b> above the beam picture and click the beam; drag interior supports and hinges to move them. This model solves transverse bending (v, θ) only; at least one pin or clamp must also stop the beam sliding horizontally.</p>
      </div></details>
      <details class="bl-acc" open><summary><span class="bl-step">4</span>Loads <span class="bl-badge" id="beamLoadBadge"></span></summary><div class="bl-acc-body">
        <p class="bl-help" style="margin-top:0">Positive force, line load and displacement point <b>down</b>; negative values point up. Positive couples are <b>clockwise</b>. q is force per length (N/mm), not pressure.</p>
        <div id="beamLoads"></div>
        <label class="bl-check"><input type="checkbox" id="beamSelfWeight"><span>Include self-weight ρgA <span class="bl-help" id="beamSelfWeightValue"></span></span></label>
        <form id="beamLoadForm" novalidate class="bl-box"><div class="bl-grid2">
          <label class="bl-field" style="grid-column:1/-1"><span>Load type</span><select class="bl-select" id="beamLoadKind">
            <option value="point">Point force P</option><option value="moment">Point couple C</option><option value="rectangle">Uniform q</option>
            <option value="triangle">Triangular (zero at start)</option><option value="triangle-root">Triangular (zero at end)</option><option value="trapezoid">Trapezoidal</option></select></label>
          ${field('beamLoadA','Position x','mm',"value='225' required")}${field('beamLoadB','End','mm',"value='450'")}
          ${field('beamP','Force P (+ down)','N',"value='2'")}${field('beamC','Couple C (+ clockwise)','N·mm',"value='100'")}
          ${field('beamQ0','q at start','N/mm',"value='0.004'")}${field('beamQ1','q at end','N/mm',"value='0.008'")}
        </div><p class="bl-err" id="beamLoadError" role="alert" hidden></p>
        <div class="bl-row" style="margin-top:10px"><button type="submit" class="bl-btn bl-btn-primary" id="beamLoadSubmit">Add load &amp; solve</button><button type="button" class="bl-btn" id="beamLoadCancel" hidden>Cancel edit</button></div></form>
        <div class="bl-row"><button type="button" class="bl-btn bl-btn-sm" id="beamCentre">Centre point · 2 N</button><button type="button" class="bl-btn bl-btn-sm bl-btn-danger" id="beamClear">Clear all loads</button></div>
        <div><h4 class="bl-mini">Same total force (2 N), different shape</h4><div class="bl-row"><button type="button" class="bl-btn bl-btn-sm" data-shape="uniform">Uniform</button><button type="button" class="bl-btn bl-btn-sm" data-shape="root">Root-heavy triangle</button><button type="button" class="bl-btn bl-btn-sm" data-shape="tip">Tip-heavy triangle</button></div>
        <p class="bl-help">These replace all loads. Equal area under q(x) does not mean equal bending moment.</p></div>
      </div></details>
      <details class="bl-acc"><summary><span class="bl-step">5</span>Examples &amp; presets</summary><div class="bl-acc-body">
        <div><h4 class="bl-mini">Lecture 03 examples · 450 × 20 × 10 mm, E = 2000 MPa</h4><div class="bl-row">
          <button type="button" class="bl-btn bl-btn-sm" data-beam-preset="l03-tip">A · tip force</button><button type="button" class="bl-btn bl-btn-sm" data-beam-preset="l03-centre">Cantilever · centre force</button>
          <button type="button" class="bl-btn bl-btn-sm" data-beam-preset="l03-uniform">B · uniform 2 N</button><button type="button" class="bl-btn bl-btn-sm" data-beam-preset="l03-lift">B · uniform lift</button>
          <button type="button" class="bl-btn bl-btn-sm" data-beam-preset="l03-simple">C1 · pin–roller</button><button type="button" class="bl-btn bl-btn-sm" data-beam-preset="l03-fixed">C2 · fixed–fixed</button></div></div>
        <div><h4 class="bl-mini">Optional presets · HW 2B</h4><p class="bl-help" style="margin-top:0">Each button replaces all current loads and sets L = 450 mm, b = 16 mm, h = 8 mm and E = 2200 MPa. These are different from the Lecture 03 numerical examples.</p><div class="bl-row">
          <button type="button" class="bl-btn bl-btn-sm" data-beam-preset="hw2b-cantilever">1 · Cantilever · triangle toward tip</button><button type="button" class="bl-btn bl-btn-sm" data-beam-preset="hw2b-roller-pin">2 · Left roller / right pin · trapezoid</button><button type="button" class="bl-btn bl-btn-sm" data-beam-preset="hw2b-fixed">3 · Fixed–fixed · triangle toward root</button></div></div>
      </div></details>
    </aside>

    <section class="bl-card bl-model" aria-labelledby="beamModelTitle">
      <div class="bl-card-head"><div><h2 id="beamModelTitle">Beam</h2><p class="bl-sub" id="beamModelSub"></p></div>
        <div class="bl-toolbar" role="toolbar" aria-label="Place on the beam"><span>Place</span>
          ${['pin','roller','fixed','hinge'].map(k=>`<button type="button" class="bl-tool" data-place="${k}" aria-pressed="false" title="Click the beam to place a ${k}">${icon[k]}${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}
          <button type="button" class="bl-tool" id="beamShowDefl" aria-pressed="true" title="Show the exaggerated deflected shape">Deflected shape</button></div></div>
      <div id="beamPicture" class="bl-picture"></div>
      <p class="bl-picture-note" id="beamPictureNote"></p>
      <div id="beamKpis" class="bl-kpis" aria-label="Key results"></div>
      <div id="beamNotice"></div>
      <p id="beamStatus" class="bl-message" role="status" aria-live="polite"></p>
    </section>

    <section class="bl-card bl-results" aria-label="Results">
      <div class="bl-tabs" role="tablist" aria-label="Result views">
        ${[['diagrams','Diagrams'],['cut','Cut &amp; section'],['solution','Solution'],['modes','Modes'],['compare','Compare A/B'],['report','Report &amp; export'],['learn','Learn']]
          .map(([k,t],i)=>`<button type="button" role="tab" id="beamTabBtn-${k}" data-tab="${k}" aria-controls="beamTab-${k}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${t}</button>`).join('')}
      </div>
      <div class="bl-stale" id="beamStale" role="status" hidden></div>
      <div class="bl-tabpanel" role="tabpanel" id="beamTab-diagrams" aria-labelledby="beamTabBtn-diagrams">
        <div id="beamReactions"></div><p class="bl-help">Hover or touch a plot to read sampled values. At a jump (point force, couple, support or hinge) use the <b>Cut &amp; section</b> tab for exact left and right values.</p><div id="beamCharts" class="bl-charts"></div><div id="beamStressMap"></div>
      </div>
      <div class="bl-tabpanel" role="tabpanel" id="beamTab-cut" aria-labelledby="beamTabBtn-cut" hidden>
        <p class="bl-sub" style="margin:0">Drag the orange cut line on the beam picture, use the slider, or type x. The free body shows the part you keep with the internal shear V and moment M acting on its cut face.</p>
        <div class="bl-cutbar">
          <label class="bl-field bl-cutrange"><span>Cut position x</span><input type="range" id="beamCut" min="0" max="450" step="0.5" value="225" aria-describedby="beamCutRead"></label>
          ${field('beamCutX','x','mm',"value='225'")}
          <div class="bl-field"><span>Part kept</span><div class="bl-seg" role="group" aria-label="Part kept"><button type="button" data-cut-side="left" aria-pressed="true">Left</button><button type="button" data-cut-side="right" aria-pressed="false">Right</button></div></div>
          <div class="bl-field" id="beamCutLimitField" hidden><span>At the jump</span><div class="bl-seg" role="group" aria-label="Limit at the discontinuity"><button type="button" data-cut-limit="left" aria-pressed="true">x⁻ just left</button><button type="button" data-cut-limit="right" aria-pressed="false">x⁺ just right</button></div></div>
        </div>
        <div class="bl-row" id="beamCutSnaps" aria-label="Jump to a station"></div>
        <p class="bl-help" id="beamCutRead"></p>
        <figure class="bl-figure" id="beamCutFbd"></figure>
        <div class="bl-cols"><div class="bl-box" id="beamCutValues"></div><div class="bl-box" id="beamCutCheck"></div></div>
        <div class="bl-charts" id="beamCutCharts"></div>
        <div id="beamCutSection"></div>
        <p class="bl-help" id="beamCutSectionNote"></p>
      </div>
      <div class="bl-tabpanel" role="tabpanel" id="beamTab-solution" aria-labelledby="beamTabBtn-solution" hidden>
        <div id="beamSolution"></div>
        <section class="bl-box" id="beamVerify"><h3>Verify before trusting</h3><p>Refine the mesh and compare. A tiny change is evidence of numerical convergence only; it does not prove that the real clamp, printed material or section is modelled correctly.</p>
          <button type="button" class="bl-btn" id="beamRefine">Compare 10 / 20 / 40 elements</button><div id="beamConvergence"></div></section>
      </div>
      <div class="bl-tabpanel" role="tabpanel" id="beamTab-modes" aria-labelledby="beamTabBtn-modes" hidden>
        <p>A natural mode is an undamped vibration <b>pattern</b>. Its amplitude is normalized, so the animation is <b>not</b> the displacement caused by your static load. Frequencies use the bending stiffness EI and the mass ρA of the chosen section (self-weight loading does not change them).</p>
        <div id="beamModeButtons" class="bl-row"></div><div class="bl-row"><button type="button" class="bl-btn" id="beamAnimate">Animate mode</button><span class="bl-help" id="beamAnimateNote"></span></div>
        <div id="beamModePicture"></div><div id="beamModeTable"></div>
        <p class="bl-help">Bending modes only. Higher modes change direction more often. A natural frequency alone does not predict resonance amplitude, damping, flutter or failure. A mechanism has no modes here because no stable static solution exists.</p>
      </div>
      <div class="bl-tabpanel" role="tabpanel" id="beamTab-compare" aria-labelledby="beamTabBtn-compare" hidden>
        <div class="bl-row"><button type="button" class="bl-btn bl-btn-primary" id="beamSaveA">Save current as A</button><button type="button" class="bl-btn bl-btn-primary" id="beamSaveB">Save current as B</button><button type="button" class="bl-btn" id="beamClearAB">Clear A and B</button></div>
        <div id="beamCompare"></div>
        <section class="bl-box"><h3>Equal-mass cross-sections</h3><p>Same material, same area A (so the same mass and self-weight), same span, supports and loads; only the shape changes. Fixed proportions are stated for each shape.</p>
          <button type="button" class="bl-btn" id="beamEqualMassBtn">Compare equal-mass shapes</button><div id="beamEqualMass"></div></section>
      </div>
      <div class="bl-tabpanel" role="tabpanel" id="beamTab-report" aria-labelledby="beamTabBtn-report" hidden>
        <label class="bl-field"><span>My explanation and notes (saved with the study; plain text)</span><textarea id="beamExplain" class="bl-notes" maxlength="4000" placeholder="The largest stress is at … because …; the largest displacement is at …"></textarea></label>
        <div class="bl-row">
          <button type="button" class="bl-btn bl-btn-primary" id="beamDownload">Save study (.json)</button>
          <button type="button" class="bl-btn" id="beamImport">Import study (.json)</button><input type="file" id="beamImportFile" accept=".json,application/json" class="sr-only" tabindex="-1" aria-hidden="true">
          <button type="button" class="bl-btn" id="beamShare">Copy share link</button>
          <button type="button" class="bl-btn" id="beamCsv">Results CSV</button>
          <button type="button" class="bl-btn" id="beamCsvReactions">Reactions CSV</button>
          <button type="button" class="bl-btn" id="beamPrintBtn">Print / save as PDF</button>
        </div>
        <p class="bl-help" id="beamExportStatus" role="status" aria-live="polite"></p>
        <input class="bl-linkbox" id="beamShareBox" readonly hidden aria-label="Share link">
        <p class="bl-help">Study files are versioned JSON. Imports and links are validated and solved again on this page; a file from a newer version is refused without changing your study. <b>Print / save as PDF</b> opens your browser's print dialog with a report (inputs, free-body diagram, assumptions, supports, plots and results); choose “Save as PDF” there.</p>
      </div>
      <div class="bl-tabpanel bl-learn" role="tabpanel" id="beamTab-learn" aria-labelledby="beamTabBtn-learn" hidden>
        <article id="beamTheory"></article>
        <div id="beamSigns"></div>
        <h3>Supports, hinges and what they restrain</h3>
        <div class="bl-tablewrap"><table class="bl-table"><tr><th>Item</th><th>Restrained motion</th><th>Planar reactions</th></tr>
          <tr><td>Pin</td><td>Horizontal and vertical translation; rotation free</td><td>Rₓ, R<sub>y</sub>; no couple</td></tr>
          <tr><td>Roller on horizontal ground</td><td>Vertical translation only</td><td>R<sub>y</sub> only</td></tr>
          <tr><td>Fixed (clamp)</td><td>Both translations and rotation</td><td>Rₓ, R<sub>y</sub>, couple C</td></tr>
          <tr><td>Internal hinge</td><td>Keeps v continuous; lets the two sides rotate differently</td><td>Passes shear (and axial) force; M = 0</td></tr></table></div>
        <p><b>Transverse-only versus complete planar restraint.</b> This app solves the transverse displacement v and rotation θ. A planar beam also has an axial displacement u<sub>x</sub>, which is <b>not</b> solved here. For stability in the plane at least one pin or clamp must stop the beam from sliding horizontally, so a beam on rollers only is rejected. Two or more pins or clamps make the axial problem redundant, but with no axial load and no temperature change the horizontal reactions are still zero; axial force, thermal stress and inclined rollers are outside this model.</p>
        <p><b>Mechanisms are rejected, not solved.</b> Before solving, the app checks whether the supports and hinges leave any rigid-body motion (sliding, rotating about a single support, or folding at a hinge). A mechanism has no unique static solution and no meaningful vibration modes.</p>
        <h3>What equations are actually solved?</h3>
        <div class="bl-eq">EI v⁗ = q &nbsp; · &nbsp; M = −EI v″ &nbsp; · &nbsp; V = dM/dx &nbsp; · &nbsp; dV/dx = −q<br>σ<sub>x</sub> = −Mz/I &nbsp; · &nbsp; τ = VQ/(Ib) &nbsp; · &nbsp; K u = f &nbsp; · &nbsp; K φ = ω² M φ &nbsp; · &nbsp; f<sub>n</sub> = ω/(2π)</div>
        <p>x is distance along the beam, z is measured upward from the neutral axis, v is downward displacement, E is modulus, I is the second moment of area and κ = v″ is the curvature in this sign convention. Positive M is sagging: top compression, bottom tension. K and M in the eigenvalue equation are matrices, not the bending moment.</p>
        <p><b>Shear stress depends on the section.</b> τ = VQ/(Ib) is the average vertical shear stress across the total material width b(z) cut at height z. For a solid rectangle its maximum is 1.5|V|/A, for a solid circle 4|V|/(3A). For a tube or a box the cut through the neutral axis crosses two separate walls, so b is the sum of both wall thicknesses and each wall carries the same τ by symmetry. In the wide flanges of an I or box section the formula gives only a small average; the real flange shear flow runs mainly along the flange and is not shown. Surface shear is zero.</p>
        <p><b>Outside this beam model:</b> local or shell buckling of thin walls, web crippling under point loads, clamp and contact stress concentrations, holes, plasticity, transverse-shear deformation, torsion, and any CAD or print verification. The plots show nominal beam stress only.</p>
        <p><a href="https://teachbooks.tudelft.nl/computational-modelling/structural_linear/euler_bernouilli.html" target="_blank" rel="noopener noreferrer">TU Delft: Euler–Bernoulli finite elements</a> · <a href="https://help.solidworks.com/2026/english/simtutorialonline/Creating_Beam_Diagrams.htm" target="_blank" rel="noopener noreferrer">SOLIDWORKS: beam diagrams</a> · <a href="https://help.solidworks.com/2025/english/SolidWorks/cworks/HIDD_Mode_Shape_Amplitude.htm" target="_blank" rel="noopener noreferrer">Mode amplitude interpretation</a></p>
        <p class="bl-help">This app follows an educational simulation workflow. It is not SOLIDWORKS or ANSYS and does not replace solid/shell, contact, nonlinear or fracture analysis. The wing workspace uses upward-positive loading and states that convention explicitly.</p>
      </div>
    </section>
  </div>
  <div id="beamPrint" class="bl-print" aria-hidden="true"></div>`;
  if(typeof CompanionTools!=='undefined') CompanionTools.fill(host);

  /* ------------------------------------------------------------- inputs */

  const geometryInput=k=>$(`#beamGeometry [name="${k}"]`);
  function readNumber(el,label) {
    const text=String(el.value).trim(), wrap=el.closest('.bl-input');
    const value=text===''?NaN:Number(text);
    if(wrap) wrap.dataset.invalid=String(!Number.isFinite(value));
    if(!Number.isFinite(value)) throw new Error(`${label} must be a number.`);
    return value;
  }
  function interiorRows(){return $$('#beamInteriorList [data-row="support"]');}
  function hingeRows(){return $$('#beamHingeList [data-row="hinge"]');}

  /** The draft model from the form (no physics validation; the engine does that). */
  function readDraft() {
    const m={};
    m.length=readNumber(geometryInput('length'),'Length L');m.E=readNumber(geometryInput('E'),'Elastic modulus E');
    m.density=readNumber(geometryInput('density'),'Density ρ');m.elements=readNumber(geometryInput('elements'),'Requested elements');
    const shape=$('#beamShape').value;m.section={shape};
    for(const [key,symbol,label] of SEC.SHAPES[shape].fields) m.section[key]=readNumber($(`#beamSectionFields [data-sec="${key}"]`),`${label} ${symbol}`);
    m.supports=[];
    const left=$('#beamleftSupport').value, right=$('#beamrightSupport').value;
    if(left!=='free') m.supports.push({x:0,kind:left,row:-1});
    interiorRows().forEach((row,i)=>m.supports.push({x:readNumber(row.querySelector('[data-field="x"]'),`Interior support ${i+1} position`),kind:row.querySelector('[data-field="kind"]').value,row:i}));
    if(right!=='free') m.supports.push({x:m.length,kind:right,row:-2});
    m.hinges=hingeRows().map((row,i)=>readNumber(row.querySelector('[data-field="x"]'),`Hinge ${i+1} position`));
    m.loads=clone(st.model.loads);
    m.selfWeight=$('#beamSelfWeight').checked;
    return m;
  }
  const canonical=m=>JSON.stringify({length:m.length,E:m.E,density:m.density,elements:m.elements,section:m.section,
    supports:[...m.supports].map(s=>({x:s.x,kind:s.kind})).sort((a,b)=>a.x-b.x),hinges:[...m.hinges].sort((a,b)=>a-b),loads:m.loads,selfWeight:!!m.selfWeight});
  function isCurrent() {
    if(!st.solved) return false;
    try {return canonical(readDraft())===canonical(st.solved.model);} catch(e) {return false;}
  }

  function renderScalars(m) {
    for(const k of ['length','E','density','elements']) geometryInput(k).value=m[k];
    $('#beamShape').value=m.section.shape;
    renderSectionFields(m.section);
    $('#beamleftSupport').value=(m.supports.find(s=>s.x===0)||{kind:'free'}).kind;
    $('#beamrightSupport').value=(m.supports.find(s=>s.x===m.length)||{kind:'free'}).kind;
    $('#beamSelfWeight').checked=!!m.selfWeight;
    $$('.bl-input[data-invalid]',host).forEach(w=>w.dataset.invalid='false');
  }
  function renderSectionFields(section) {
    $('#beamSectionFields').innerHTML=SEC.SHAPES[section.shape].fields.map(([key,symbol,label])=>
      `<label class="bl-field"><span>${label} ${symbol.replace(/_(\w+)/,'<sub>$1</sub>')}</span><span class="bl-input"><input data-sec="${key}" type="number" step="any" inputmode="decimal" value="${section[key]}"><span class="bl-unit">mm</span></span></label>`).join('');
  }
  const EMPTY={support:'<li class="bl-empty">None — use “+ Interior support” or Place on the picture.</li>',hinge:'<li class="bl-empty">None.</li>'};
  const supportRow=(s,i)=>`<li data-row="support" class="bl-rowedit"><span class="bl-tag sup">S${i+1}</span>
      <select class="bl-select" data-field="kind" aria-label="Interior support ${i+1} type">${['pin','roller','fixed'].map(k=>`<option value="${k}"${k===s.kind?' selected':''}>${k}</option>`).join('')}</select>
      <span class="bl-input"><input data-field="x" type="number" step="any" inputmode="decimal" value="${s.x}" aria-label="Interior support ${i+1} position x"><span class="bl-unit">mm</span></span>
      <button type="button" class="bl-btn bl-btn-sm bl-btn-ghost" data-remove-row aria-label="Remove interior support ${i+1}">✕</button></li>`;
  const hingeRow=(h,i)=>`<li data-row="hinge" class="bl-rowedit bl-rowedit-h"><span class="bl-tag">H${i+1}</span>
      <span class="bl-input"><input data-field="x" type="number" step="any" inputmode="decimal" value="${h}" aria-label="Hinge ${i+1} position x"><span class="bl-unit">mm</span></span>
      <button type="button" class="bl-btn bl-btn-sm bl-btn-ghost" data-remove-row aria-label="Remove hinge ${i+1}">✕</button></li>`;
  function renderLists(m) {
    const L=m.length, interior=m.supports.filter(s=>s.x>0&&s.x<L);
    $('#beamInteriorList').innerHTML=interior.map(supportRow).join('')||EMPTY.support;
    $('#beamHingeList').innerHTML=m.hinges.map(hingeRow).join('')||EMPTY.hinge;
    renderLoadList();
  }
  // Rows are added and removed in place so that values being typed elsewhere are never lost.
  function relabelRows(list,type) {
    const rows=[...list.querySelectorAll(`[data-row="${type}"]`)];
    rows.forEach((row,i)=>{
      row.querySelector('.bl-tag').textContent=`${type==='support'?'S':'H'}${i+1}`;
      const sel=row.querySelector('[data-field="kind"]');if(sel)sel.setAttribute('aria-label',`Interior support ${i+1} type`);
      row.querySelector('[data-field="x"]').setAttribute('aria-label',`${type==='support'?'Interior support':'Hinge'} ${i+1} position x`);
      row.querySelector('[data-remove-row]').setAttribute('aria-label',`Remove ${type==='support'?'interior support':'hinge'} ${i+1}`);
    });
    if(!rows.length) list.innerHTML=EMPTY[type];
  }
  function addRow(type,value) {
    const list=type==='support'?$('#beamInteriorList'):$('#beamHingeList'), empty=list.querySelector('.bl-empty');
    if(empty) empty.remove();
    const n=list.querySelectorAll(`[data-row="${type}"]`).length;
    list.insertAdjacentHTML('beforeend',type==='support'?supportRow(value,n):hingeRow(value,n));
    relabelRows(list,type);
  }
  function loadText(p) {
    if(p.kind==='point') return `${plain(p.force)} N at x=${plain(p.position)} mm`;
    if(p.kind==='moment') return `${plain(p.moment)} N·mm couple at x=${plain(p.position)} mm`;
    return `${plain(p.qStart)} → ${plain(p.qEnd)} N/mm over ${plain(p.start)}–${plain(p.end)} mm`;
  }
  function renderLoadList() {
    const loads=st.model.loads;
    $('#beamLoads').innerHTML=`<ol class="bl-list">${loads.map((p,i)=>`<li data-editing="${st.editLoad===i}"><span class="bl-tag load">${p.kind==='point'?'P':p.kind==='moment'?'C':'q'}</span><span class="bl-li-text">${esc(loadText(p))}</span>
      <span class="bl-li-actions"><button type="button" class="bl-btn bl-btn-sm bl-btn-ghost" data-edit-load="${i}" aria-label="Edit load ${i+1}">Edit</button><button type="button" class="bl-btn bl-btn-sm bl-btn-ghost" data-delete-load="${i}" aria-label="Remove load ${i+1}">✕</button></span></li>`).join('')}</ol>${loads.length?'':'<p class="bl-help">No applied loads.</p>'}`;
    $('#beamLoadBadge').textContent=`${loads.length}/${MAX_LOADS}`;
  }
  function renderInputs(m) {renderScalars(m);renderLists(m);syncLoadForm();renderSectionView();renderStability();}

  function sectionFromDraft() {
    const shape=$('#beamShape').value, s={shape};
    for(const [key,symbol,label] of SEC.SHAPES[shape].fields) s[key]=readNumber($(`#beamSectionFields [data-sec="${key}"]`),`${label} ${symbol}`);
    return s;
  }
  function renderSectionView() {
    let html;
    try {
      const s=sectionFromDraft(), p=SEC.properties(s), rho=Number(geometryInput('density').value), L=Number(geometryInput('length').value);
      const mass=Number.isFinite(rho)&&Number.isFinite(L)?SEC.massPerLength(p,rho)*L:NaN, q=Number.isFinite(rho)?SEC.selfWeightLine(p,rho,B.GRAVITY):NaN;
      html=`<div class="bl-secview">${D.sectionDrawing(s,p,{width:300})}<dl class="bl-props">
        <dt>Area A</dt><dd>${fmt(p.A)} mm²</dd><dt>Second moment I</dt><dd>${fmt(p.I)} mm⁴</dd><dt>Extreme fibre c</dt><dd>${fmt(p.c)} mm</dd>
        <dt>Section modulus S = I/c</dt><dd>${fmt(p.S)} mm³</dd><dt>Shear factor k (τ<sub>max</sub> = k|V|/A)</dt><dd>${fmt(p.shearFactor,4)}</dd>
        <dt>Beam mass</dt><dd>${Number.isFinite(mass)?fmt(mass)+' g':'—'}</dd><dt>Self-weight ρgA</dt><dd>${Number.isFinite(q)?fmt(q)+' N/mm':'—'}</dd></dl></div>
        ${p.slender.map(t=>`<p class="bl-help bl-warnline">${esc(t)}</p>`).join('')}`;
      $('#beamSectionBadge').textContent=p.label;
      $('#beamSelfWeightValue').textContent=Number.isFinite(q)?`(${fmt(q)} N/mm, ${Number.isFinite(L)?fmt(q*L):'—'} N in total)`:'';
    } catch(e) {html=`<p class="bl-err">${esc(e.message)}</p>`;}
    $('#beamSectionView').innerHTML=html;
  }
  function renderStability() {
    const box=$('#beamSupportStatus');
    let m;
    try {m=readDraft();} catch(e) {box.className='bl-stability bad';box.textContent=e.message;return;}
    const a=B.analyze(m);
    if(a.ok) {
      const s=a.stability;
      box.className='bl-stability ok';
      box.innerHTML=`<b class="bl-ok">Stable.</b> ${s.degree===0?'Statically determinate: equilibrium alone gives the reactions.':`Statically indeterminate to degree ${s.degree}: compatibility (deformation) is also needed.`} ${s.transverseRestraints} transverse reaction${s.transverseRestraints===1?'':'s'}, ${s.equations} equilibrium equation${s.equations===1?'':'s'}${s.hinges?` (including ${s.hinges} hinge condition${s.hinges>1?'s':''})`:''}.${s.axialRestraints>1?` Axial restraint is redundant (${s.axialRestraints} pins/clamps) but carries no force for these transverse loads.`:''}`;
    } else {
      box.className='bl-stability bad';
      box.innerHTML=`<b>${a.code==='mechanism'?'Mechanism':'Check inputs'}:</b> ${esc(a.error)}`;
    }
  }

  /* ------------------------------------------------------------- status */

  function statusState() {
    if(!st.solved) return st.error?'error':'pending';
    if(isCurrent()) return 'solved';
    return st.error?'error':'pending';
  }
  function renderStatus() {
    const state=statusState(), chip=$('#beamChip'), text=$('#beamRunText');
    chip.className=`bl-chip ${state==='solved'?'ok':state==='error'?'bad':'warn'}`;
    chip.textContent=state==='solved'?'Solved':state==='error'?'Not solved':'Pending';
    text.textContent=state==='solved'?'Results match the inputs.':state==='error'?`${st.error}${st.solved?' Results shown are for the last solved model.':''}`:
      (st.draftError?`${st.draftError} `:'')+'Inputs changed — press Solve. Results shown are for the last solved model.';
    $('#beamSolve').dataset.pending=String(state!=='solved');
    $('#beamRevert').hidden=!(st.solved&&state!=='solved');
    const stale=state!=='solved';
    $('.bl-results').dataset.stale=String(stale);
    $('#beamKpis').dataset.stale=String(stale);
    const banner=$('#beamStale');
    banner.hidden=!stale||!st.solved;
    banner.innerHTML=stale?`<span aria-hidden="true">⚠</span><span><b>${state==='error'?'Not solved.':'Not up to date.'}</b> These results belong to the last solved model, not to the inputs now on screen. ${state==='error'?'Fix the problem shown in the status bar, or revert.':'Press Solve to update them.'}</span>`:'';
    for(const id of ['#beamDownload','#beamShare','#beamCsv','#beamCsvReactions','#beamPrintBtn','#beamSaveA','#beamSaveB','#beamEqualMassBtn','#beamRefine']) {const b=$(id);if(b)b.disabled=stale||!st.solved;}
    $('#beamExportStatus').textContent=stale&&st.solved?'Exports are disabled until the current inputs are solved.':$('#beamExportStatus').dataset.msg||'';
  }

  function message(text){st.message=text;$('#beamStatus').textContent=text;}

  /* ------------------------------------------------------------- solving */

  function solve(note) {
    let draft;
    try {draft=readDraft();} catch(e) {st.error=e.message;st.mechanism=null;renderStatus();renderStability();return false;}
    let result;
    try {result=B.solve({...draft,modes:true});}
    catch(e) {st.error=e.message;st.mechanism=e.mechanism||null;st.model=stripRows(draft);renderStatus();renderStability();renderPicture();renderNotice();return false;}
    st.solved={model:Study.modelFromInput(result.input),result};
    st.model=clone(st.solved.model);st.error='';st.mechanism=null;st.draftError='';st.cache={};
    st.cut.x=Math.min(Math.max(0,st.cut.x),st.model.length);
    renderInputs(st.model);
    renderAll();
    message(note||(result.warnings.length?result.warnings.join(' '):'Solved. Predict the next change before editing.'));
    return true;
  }
  const stripRows=m=>({...m,supports:m.supports.map(s=>({x:s.x,kind:s.kind}))});
  let autoTimer=0;
  function draftChanged() {
    st.error='';st.mechanism=null;message('');
    try {const d=readDraft();st.model=stripRows(d);st.draftError='';} catch(e) {st.draftError=e.message;}
    renderStability();renderPicture();renderStatus();renderNotice();
    if(st.autoSolve&&!st.draftError) {clearTimeout(autoTimer);autoTimer=setTimeout(()=>{if(!isCurrent())solve();},250);}
  }
  function revert() {if(!st.solved)return;st.model=clone(st.solved.model);st.error='';st.draftError='';st.editLoad=null;renderInputs(st.model);renderPicture();renderStatus();renderNotice();message('Inputs reverted to the last solved model.');}

  /* -------------------------------------------------------- beam picture */

  function width(el,fallback=760){const w=el&&el.clientWidth;return w>0?w:fallback;}
  // Draw the draft (DOM order, with row indices for dragging) whenever it is drawable.
  function drawnModel(){
    try {
      const d=readDraft();
      B.normalize({...d,supports:d.supports.map(s=>({x:s.x,kind:s.kind})),_transverseOnly:true,
        hinges:d.hinges.filter(h=>h>0&&h<d.length)});
      return {model:d,current:isCurrent()};
    } catch(e) {
      if(e.code==='mechanism') {try {const d=readDraft();return {model:d,current:false};} catch(x) {}}
      return {model:st.solved?st.solved.model:BASE,current:false,invalid:true};
    }
  }
  function renderPicture(ghost) {
    const pic=$('#beamPicture'), {model,current,invalid}=drawnModel(), r=st.solved&&st.solved.result;
    st.drawn=model;st.drawnInvalid=!!invalid;
    const sw=current&&r&&r.selfWeight.enabled?{q:r.selfWeight.q}:(!current&&model.selfWeight?{q:SEC.selfWeightLine(SEC.properties(model.section),model.density,B.GRAVITY)}:null);
    pic.innerHTML=D.beamSchematic(model,{width:width(pic)-2,result:current?r:null,showDeflection:current&&st.showDeflection,
      cut:st.tab==='cut'&&current?{x:st.cut.x}:null,ghost,selfWeight:sw,
      label:`Physical beam with supports and applied loads${current?'':' (edited inputs, not solved yet)'}`});
    if(st.placing) pic.dataset.placing=st.placing; else delete pic.dataset.placing;
    const svg=pic.querySelector('svg'), factor=svg&&svg.dataset.exaggeration;
    $('#beamPictureNote').textContent=invalid?'Some inputs are invalid, so the picture shows the last valid model.':
      current?`Physical beam: supports (green) and applied loads (purple). This is not a free-body diagram — see Solution.${factor&&st.showDeflection?` Dashed blue: deflected shape drawn at ${factor} × true scale.`:''}`:
      'Showing your edited inputs — not solved yet. Press Solve to update the results.';
    const sup=model.supports, left=(sup.find(s=>s.x===0)||{kind:'free'}).kind, right=(sup.find(s=>s.x===model.length)||{kind:'free'}).kind, interior=sup.filter(s=>s.x>0&&s.x<model.length).length;
    $('#beamModelTitle').textContent=`${left} / ${right}${interior?` + ${interior} interior support${interior>1?'s':''}`:''}${model.hinges.length?` + ${model.hinges.length} hinge${model.hinges.length>1?'s':''}`:''}`;
    $('#beamModelSub').textContent=`L = ${fmt(model.length)} mm · ${SEC.describe(model.section)} · E = ${fmt(model.E)} MPa${model.selfWeight?' · self-weight on':''}`;
  }

  function svgX(evt) {
    const svg=$('#beamPicture svg');if(!svg)return null;
    const box=svg.getBoundingClientRect();if(!box.width)return null;
    const W=+svg.dataset.w,x0=+svg.dataset.x0,x1=+svg.dataset.x1,L=+svg.dataset.length;
    const u=(evt.clientX-box.left)/box.width*W;
    return Math.max(0,Math.min(L,(u-x0)/(x1-x0)*L));
  }
  function snap(x,L) {
    const raw=L/90,p=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].map(k=>k*p).find(s=>s>=raw)||10*p;
    let s=Math.round(x/step)*step;
    const stations=[0,L,...st.model.loads.flatMap(v=>v.kind==='distributed'?[v.start,v.end]:[v.position])];
    for(const t of stations) if(Math.abs(t-x)<L*0.012) s=t;
    return Math.max(0,Math.min(L,Number(s.toPrecision(10))));
  }
  const endSupports=()=>($('#beamleftSupport').value!=='free')+($('#beamrightSupport').value!=='free');
  const supportLimitReached=()=>interiorRows().length+endSupports()>=B.LIMITS.supports;
  function placeAt(x) {
    const L=st.model.length, eps=L*1e-9;
    if(st.placing==='hinge') {
      if(x<=eps||x>=L-eps) {message('A hinge must be inside the span, not at an end.');return;}
      if(hingeRows().length>=B.LIMITS.hinges) {message(`At most ${B.LIMITS.hinges} hinges.`);return;}
      addRow('hinge',x);
    } else if(x<=eps||x>=L-eps) {
      const end=$(x<=eps?'#beamleftSupport':'#beamrightSupport');
      if(end.value==='free'&&supportLimitReached()) {message(`At most ${B.LIMITS.supports} supports.`);return;}
      end.value=st.placing;
    }
    else {
      const row=interiorRows().find(r=>Math.abs(Number(r.querySelector('[data-field="x"]').value)-x)<=eps);
      if(row) row.querySelector('[data-field="kind"]').value=st.placing;
      else if(supportLimitReached()) {message(`At most ${B.LIMITS.supports} supports.`);return;}
      else addRow('support',{x,kind:st.placing});
    }
    draftChanged();
    message(`${st.placing[0].toUpperCase()+st.placing.slice(1)} placed at x = ${fmt(x)} mm. ${st.autoSolve?'':'Press Solve when ready.'}`);
  }
  function setPlacing(kind) {
    st.placing=st.placing===kind?null:kind;
    $$('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===st.placing)));
    renderPicture();
    if(st.placing) message(`Click the beam to place a ${st.placing}. Press Esc or the button again to stop.`);
  }

  /* ---------------------------------------------------------- KPIs etc. */

  function renderKpis() {
    const r=st.solved.result, sw=r.selfWeight.enabled?` (incl. self-weight ${f(r.selfWeight.total)} N)`:'';
    $('#beamKpis').innerHTML=[['Maximum |v|',f(r.maxima.deflection,4)+' mm'],['Maximum |σ|',f(r.maxima.bendingStress)+' MPa'],['Total applied force',f(r.resultant)+' N',sw],
      ['Maximum |τ|',f(r.maxima.shearStress,4)+' MPa'],['First frequency f₁',(r.modes[0]?f(r.modes[0].frequencyHz,2):'—')+' Hz'],['Beam mass',f(r.massG,2)+' g']]
      .map(([n,v,s=''])=>`<div>${n}<b>${v}</b>${s?`<small>${esc(s)}</small>`:''}</div>`).join('');
  }
  function renderReactions() {
    const r=st.solved.result, L=r.input.length;
    const rows=r.reactions.map((q,i)=>{
      const s=r.stations.find(t=>Math.abs(t.x-q.x)<=L*1e-10)||{};
      const th=s.thetaLeft!==null&&s.thetaRight!==null&&s.thetaLeft!==undefined&&Math.abs(s.thetaLeft-s.thetaRight)>1e-12?`${f(s.thetaLeft,8)} | ${f(s.thetaRight,8)}`:f(s.thetaRight??s.thetaLeft??0,8);
      return `<tr><td>${D.supportName(i)} · ${q.kind} · x = ${plain(q.x)} mm</td><td class="num">${f(q.force,6)} N</td><td class="num">${f(q.moment,6)} N·mm</td><td class="num">${f(s.v??0,6)} mm</td><td class="num">${th} rad</td></tr>`;
    }).join('');
    $('#beamReactions').innerHTML=`<h3>Support reactions and motion</h3><div class="bl-tablewrap"><table class="bl-table"><tr><th>Support</th><th class="num">Force (+down)</th><th class="num">Moment (+clockwise)</th><th class="num">v (+down)</th><th class="num">θ = dv/dx</th></tr>${rows||''}</table></div>
      <p class="bl-help">For hand conventions (+up force, +counterclockwise couple), reverse the signs of both reaction columns. v and θ use the same downward-displacement convention as Lecture 03. A pin or roller has zero reaction couple but can have nonzero θ. ΣF residual = ${r.equilibrium.force.toExponential(2)} N; ΣM residual = ${r.equilibrium.moment.toExponential(2)} N·mm.</p>`;
  }
  const CHART_KEYS=['shear','moment','deflection','rotation','stressTop','shearStressMax'];
  function chartWidth(container) {
    const w=width(container), cols=(window.getComputedStyle?getComputedStyle(container).gridTemplateColumns||'':'').split(' ').filter(Boolean).length||1;
    return Math.max(300,(w-(cols-1)*18)/cols);
  }
  function renderCharts() {
    const r=st.solved.result, box=$('#beamCharts'), w=chartWidth(box), sup=r.input.supports.map(s=>s.x);
    box.innerHTML=CHART_KEYS.map((k,i)=>`<figure data-beam-chart="${i}" data-key="${k}">${D.chart(r,k,{width:w,supports:sup})}<figcaption aria-live="polite"></figcaption></figure>`).join('');
    box.querySelectorAll('[data-beam-chart]').forEach(fig=>{fig.onpointermove=e=>{
      const svg=fig.querySelector('svg'), b=svg.getBoundingClientRect();if(!b.width)return;
      const W=+svg.dataset.w,x0=+svg.dataset.x0,x1=+svg.dataset.x1,L=+svg.dataset.length,x=Math.max(0,Math.min(L,((e.clientX-b.left)/b.width*W-x0)/(x1-x0)*L));
      let i=0;while(i<r.x.length-1&&r.x[i+1]<=x)i++;
      const key=fig.dataset.key,meta=D.CHARTS[key];
      fig.querySelector('figcaption').textContent=`${meta.title}: x = ${fmt(r.x[i])} mm → ${fmt(r[key][i])} ${meta.unit} (sampled value).`;
    };});
    $('#beamStressMap').innerHTML=D.stressMap(r,{width:width($('#beamStressMap'))});
  }
  function renderTheory() {
    const m=st.solved.model, L=m.length, left=(m.supports.find(s=>s.x===0)||{kind:'free'}).kind, right=(m.supports.find(s=>s.x===L)||{kind:'free'}).kind;
    const interior=m.supports.filter(s=>s.x>0&&s.x<L);
    $('#beamTheory').innerHTML=`<h3>Beam · ${left} / ${right}${interior.length?` + ${interior.length} interior support${interior.length>1?'s':''}`:''}${m.hinges.length?` + ${m.hinges.length} hinge${m.hinges.length>1?'s':''}`:''}</h3>
      <p><b>Left:</b> ${DESCRIBE[left]}.</p>${interior.map(s=>`<p><b>Interior ${s.kind} at x = ${plain(s.x)} mm:</b> ${DESCRIBE[s.kind]}.</p>`).join('')}
      ${m.hinges.map(h=>`<p><b>Hinge at x = ${plain(h)} mm:</b> v continuous; the two sides may rotate differently; M = 0 there.</p>`).join('')}<p><b>Right:</b> ${DESCRIBE[right]}.</p>
      <p>Equilibrium supplies ΣF = 0 and ΣM = 0 (plus M = 0 at each hinge). When there are more reaction unknowns, the solver also imposes the displacement/rotation conditions above using EI v⁗ = q. A clamp can carry a couple; a pin or roller cannot.</p>
      <p><b>Zero displacement is not zero stress.</b> Stress depends on internal moment, not displacement. A restrained end may carry large bending stress while v = 0. A free end has zero reaction, not necessarily zero displacement.</p>`;
  }
  function renderNotice() {
    const box=$('#beamNotice');let html='';
    if(st.mechanism&&st.mechanism.kind==='transverse'&&!isCurrent()) {
      try {const d=stripRows(readDraft());html+=`<div class="bl-notice bad"><p><b>Mechanism — not solved.</b> ${esc(st.error)}</p>${D.mechanismSketch(d,st.mechanism,{width:width(box)-28})}</div>`;} catch(e) {}
    } else if(st.error&&/must lie on the beam|0 ≤ x|beam length/.test(st.error)&&st.solved) {
      html+=`<div class="bl-notice bad"><p><b>Not solved.</b> ${esc(st.error)}</p><button type="button" class="bl-btn bl-btn-sm" id="beamScaleSpan">Scale all positions to the new span</button></div>`;
    }
    if(st.solved&&isCurrent()) {
      const m=st.solved.model, at=x=>m.supports.some(s=>Math.abs(s.x-x)<=m.length*1e-10);
      if(m.loads.length&&!m.selfWeight&&m.loads.every(p=>p.kind==='point'&&Math.abs(p.force)>0&&at(p.position)))
        html+=`<div class="bl-notice" role="status"><b>Your loads act directly on restrained points.</b><p>Zero span deflection here is expected: the supports take the forces. No load was moved automatically.</p><button type="button" class="bl-btn bl-btn-primary" id="beamMoveCentre">Move these point loads to midspan</button></div>`;
    }
    box.innerHTML=html;
    const mc=$('#beamMoveCentre');if(mc)mc.onclick=()=>{replaceLoads(st.model.loads.map(p=>({...p,position:st.model.length/2})));solve();};
    const sc=$('#beamScaleSpan');if(sc)sc.onclick=scalePositions;
  }
  function scalePositions() {
    const L0=st.solved.model.length;let L1;
    try {L1=readNumber(geometryInput('length'),'Length L');} catch(e) {return;}
    const k=L1/L0;
    interiorRows().forEach(row=>{const i=row.querySelector('[data-field="x"]');i.value=Number((Number(i.value)*k).toPrecision(12));});
    hingeRows().forEach(row=>{const i=row.querySelector('[data-field="x"]');i.value=Number((Number(i.value)*k).toPrecision(12));});
    replaceLoads(st.model.loads.map(p=>p.kind==='distributed'?{...p,start:p.start*k,end:p.end*k}:{...p,position:p.position*k}));draftChanged();solve(`All positions scaled by ${fmt(k)} to the new span.`);
  }

  /* ----------------------------------------------------------------- cut */

  // Values below 1e-9 of the field's largest magnitude are round-off and shown as 0.
  function cleanField(f,r) {
    if(!f) return f;
    const z=(v,s)=>Math.abs(v)<=1e-9*Math.max(s,1e-300)?0:v, m=r.maxima, sTop=Math.max(...r.stressTop.map(Math.abs));
    return {...f,V:z(f.V,m.shear),M:z(f.M,m.moment),v:z(f.v,m.deflection),theta:z(f.theta,m.rotation),curvature:z(f.curvature,m.moment/r.EI),
      stressTop:z(f.stressTop,sTop),stressBottom:z(f.stressBottom,sTop),tauMax:z(f.tauMax,m.shearStress)};
  }
  function cutInfo() {
    const r=st.solved.result, L=r.input.length;
    const x=Math.min(L,Math.max(0,st.cut.x));
    const left=x>0?cleanField(B.fieldAt(r,x,'left'),r):null, right=x<L?cleanField(B.fieldAt(r,x,'right'),r):null;
    const tol=(a,b,s)=>Math.abs(a-b)>1e-9*Math.max(1,s);
    const jump=left&&right&&(tol(left.V,right.V,r.maxima.shear)||tol(left.M,right.M,r.maxima.moment)||tol(left.theta,right.theta,r.maxima.rotation));
    let limit=st.cut.limit;
    if(!left) limit='right'; else if(!right) limit='left';
    const at=limit==='left'?left:right;
    return {r,L,x,left,right,jump,limit,at};
  }
  function partSums(r, x, side, limit) {
    const L=r.input.length, eps=L*1e-10, atCut=a=>Math.abs(a-x)<=eps;
    const inside=a=>side==='left'?(a<x-eps||(atCut(a)&&limit==='right')):(a>x+eps||(atCut(a)&&limit==='left'));
    // Fabs, Mabs: sizes of the individual terms (no cancellation), the scale for the round-off tolerance.
    let F=0,Mc=0,Fabs=0,Mabs=0;const items=[];
    for(const v of r.loadsApplied) {
      if(v.kind==='distributed') {
        const s=side==='left'?v.start:Math.max(v.start,x), e=side==='left'?Math.min(v.end,x):v.end;
        if(e-s<=eps) continue;
        const q=t=>v.qStart+(v.qEnd-v.qStart)*(t-v.start)/(v.end-v.start), q0=q(s), q1=q(e), h=e-s, W=h*(q0+q1)/2;
        const xbar=Math.abs(q0+q1)>1e-15?s+h*(q0+2*q1)/(3*(q0+q1)):(s+e)/2, Mabout=s*W+h*h*(q0+2*q1)/6-W*x;
        F+=W;Mc+=Mabout;items.push({label:v.selfWeight?'self-weight portion':'line-load portion',F:W,M:Mabout,xbar});
        const qmax=Math.max(Math.abs(q0),Math.abs(q1));Fabs+=qmax*h;Mabs+=qmax*h*Math.max(Math.abs(s-x),Math.abs(e-x));
      } else if(inside(v.position)) {
        if(v.kind==='point'){F+=v.force;Mc+=v.force*(v.position-x);items.push({label:'point force',F:v.force,M:v.force*(v.position-x)});Fabs+=Math.abs(v.force);Mabs+=Math.abs(v.force*(v.position-x));}
        else {Mc+=v.moment;items.push({label:'couple',F:0,M:v.moment});Mabs+=Math.abs(v.moment);}
      }
    }
    r.reactions.forEach((q,i)=>{if(inside(q.x)){F+=q.force;Mc+=q.force*(q.x-x)+q.moment;items.push({label:`reaction ${D.supportName(i)}`,F:q.force,M:q.force*(q.x-x)+q.moment});
      Fabs+=Math.abs(q.force);Mabs+=Math.abs(q.force*(q.x-x))+Math.abs(q.moment);}});
    return {F,M:Mc,Fabs,Mabs,items};
  }
  function renderCut() {
    if(!st.solved) return;
    const c=cutInfo(), r=c.r, L=c.L, side=st.cut.side;
    const range=$('#beamCut'), num=$('#beamCutX');
    range.max=L;range.step=Math.max(L/1000,0.001);range.value=c.x;if(document.activeElement!==num)num.value=Number(c.x.toPrecision(10));
    $$('[data-cut-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cutSide===side)));
    $('#beamCutLimitField').hidden=!c.jump;
    $$('[data-cut-limit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cutLimit===c.limit)));
    const stations=r.stations;
    $('#beamCutSnaps').innerHTML=`<span class="bl-help">Go to:</span>`+stations.map(s=>`<button type="button" class="bl-btn bl-btn-sm" data-cut-to="${s.x}">${plain(s.x)}${s.kinds.length?` · ${s.kinds.join(', ')}`:''}</button>`).join('');
    const w=width($('#beamCutFbd'));
    $('#beamCutFbd').innerHTML=D.segmentFbd(st.solved.model,r,{x:c.x,side,limit:c.limit,V:c.at.V,M:c.at.M,jump:!!c.jump},{width:w})+
      `<figcaption>Free body of the ${side} part. Supports are replaced by their reactions (magnitudes, actual directions). V and M are drawn in their actual directions and labelled with their signed values: on this face V &gt; 0 acts ${side==='left'?'↓':'↑'} and M &gt; 0 (sagging) acts ${side==='left'?'↺':'↻'}.</figcaption>`;
    const lim=v=>v===null?'—':fmt(v);
    const pair=(k,unit)=>c.jump&&c.left&&c.right&&Math.abs(c.left[k]-c.right[k])>1e-9*Math.max(1,Math.abs(c.left[k]))?`${lim(c.left[k])} (x⁻) | ${lim(c.right[k])} (x⁺) ${unit}`:`${fmt(c.at[k])} ${unit}`;
    $('#beamCutRead').textContent=`Cut at x = ${fmt(c.x)} mm${c.jump?` — a jump occurs here; the free body uses the ${c.limit==='left'?'left limit x⁻':'right limit x⁺'}.`:'.'}`;
    $('#beamCutValues').innerHTML=`<h4>Values at the cut</h4><dl class="bl-props"><dt>Shear V</dt><dd>${pair('V','N')}</dd><dt>Moment M (sagging +)</dt><dd>${pair('M','N·mm')}</dd>
      <dt>Deflection v (+down)</dt><dd>${fmt(c.at.v)} mm</dd><dt>Rotation θ</dt><dd>${pair('theta','rad')}</dd><dt>Curvature κ = −M/EI</dt><dd>${fmt(c.at.curvature)} mm⁻¹</dd>
      <dt>σ top / bottom</dt><dd>${fmt(c.at.stressTop)} / ${fmt(c.at.stressBottom)} MPa</dd><dt>τ<sub>max</sub> (neutral axis)</dt><dd>${fmt(c.at.tauMax)} MPa</dd></dl>`;
    const sums=partSums(r,c.x,side,c.limit), V=c.at.V, M=c.at.M;
    const sF=side==='left'?sums.F+V:sums.F-V, sM=side==='left'?sums.M-M:sums.M+M, scaleF=sums.Fabs+Math.abs(V), scaleM=sums.Mabs+Math.abs(M);
    const ok=(v,s)=>Math.abs(v)<=1e-7*s+1e-12;   // relative to the size of the terms (round-off only)
    $('#beamCutCheck').innerHTML=`<h4>Check the free body (app signs: ↓ +, ↻ +)</h4>
      <div class="bl-eq bl-eq-left"><span class="bl-eqline"><span class="lbl">ΣF</span>${fmt(sums.F)} (applied + reactions) ${side==='left'?'+':'−'} V(${fmt(V)}) = <span class="bl-nowrap">${fmt(sF)} N ${ok(sF,scaleF)?'✓':'✗'}</span></span>
      <span class="bl-eqline"><span class="lbl">ΣM about cut</span>${fmt(sums.M)} ${side==='left'?'−':'+'} M(${fmt(M)}) = <span class="bl-nowrap">${fmt(sM)} N·mm ${ok(sM,scaleM)?'✓':'✗'}</span></span></div>
      <p class="bl-help">${side==='left'?'On the left part, positive V acts downward and positive M counter-clockwise on the cut face.':'On the right part, positive V acts upward and positive M clockwise on the cut face.'} ${sums.items.length?`Acting on this part besides V and M: ${esc(sums.items.map(i=>i.label).join(', '))}.`:'No load or reaction acts on this part besides V and M.'}</p>`;
    const cw=chartWidth($('#beamCutCharts'));
    const marks=k=>c.jump&&c.left&&c.right?[{label:`${k}(x⁻)`,value:c.left[k==='V'?'V':'M']},{label:`${k}(x⁺)`,value:c.right[k==='V'?'V':'M']}]:[{label:`${k}(x)`,value:c.at[k==='V'?'V':'M']}];
    $('#beamCutCharts').innerHTML=`<figure>${D.chart(r,'shear',{width:cw,cut:{x:c.x,values:marks('V')},extremes:false})}</figure><figure>${D.chart(r,'moment',{width:cw,cut:{x:c.x,values:marks('M')},extremes:false})}</figure>`;
    const p=r.sectionProperties;
    $('#beamCutSection').innerHTML=D.sectionStress(r.section,p,M,V,{width:width($('#beamCutSection'))});
    $('#beamCutSectionNote').textContent=`${p.label}: σ(z) = −Mz/I is linear through the depth (T = tension, C = compression). τ(z) = VQ/(Ib) uses the total material width b(z)${['tube','box'].includes(p.shape)?'; where the cut crosses two walls, b is their sum':''}${['ibeam','box'].includes(p.shape)?'; the jump at the flange–web junction comes from the change in b':''}. Local buckling and clamp or contact stress concentrations are outside this beam model.`;
  }
  function setCut(x) {if(!st.solved)return;st.cut.x=Math.min(Math.max(0,x),st.solved.model.length);renderCut();renderPicture();}

  /* ------------------------------------------------------------ solution */

  function assessedCase(m) {
    for(const k of ['hw2b-cantilever','hw2b-roller-pin','hw2b-fixed']) {
      const p=presetModel(k);
      if(canonical({...p,density:m.density,elements:m.elements})===canonical(m)) return `This study matches HW 2B ${k==='hw2b-cantilever'?'Case 1':k==='hw2b-roller-pin'?'Case 2':'Case 3'}.`;
    }
    return '';
  }
  function renderSolution() {
    if(!st.solved) return;
    const r=st.solved.result;
    if(st.cache.solution&&st.cache.solutionFor===r) return;
    let html;
    try {html=Sol.render(st.solved.model,r,{width:width($('#beamSolution')),assessed:assessedCase(st.solved.model)});}
    catch(e) {html=`<p class="bl-err">The worked solution could not be built: ${esc(e.message)}</p>`;}
    $('#beamSolution').innerHTML=html;st.cache.solution=true;st.cache.solutionFor=r;
  }
  function refine() {
    if(!st.solved) return;
    try {
      const base=st.solved.model;
      $('#beamConvergence').innerHTML='<div class="bl-tablewrap"><table class="bl-table"><tr><th>Requested elements</th><th class="num">Max |v| (mm)</th><th class="num">Max |M| (N·mm)</th><th class="num">f₁ (Hz)</th></tr>'+[10,20,40].map(elements=>{
        const q=B.solve({...base,elements});return `<tr><td>${elements} (+ load, support and hinge stations)</td><td class="num">${f(q.maxima.deflection,6)}</td><td class="num">${f(q.maxima.moment,4)}</td><td class="num">${q.modes[0]?f(q.modes[0].frequencyHz,4):'—'}</td></tr>`;}).join('')+'</table></div><p class="bl-help">For a constant-EI beam the nodal values are already exact; the maxima may still move slightly because they are sampled between nodes, and f₁ converges from above.</p>';
    } catch(e) {message(e.message);}
  }

  /* --------------------------------------------------------------- modes */

  function renderModeButtons() {
    const r=st.solved.result;
    if(st.mode>=r.modes.length) st.mode=0;
    if(!r.modes.length) {
      $('#beamModeButtons').innerHTML='<p class="bl-help">No bending mode: every displacement and rotation is restrained, so this model has nothing left to vibrate.</p>';
      $('#beamModeTable').innerHTML='';$('#beamAnimate').disabled=true;$('#beamAnimateNote').textContent='';
      return;
    }
    $('#beamModeButtons').innerHTML=r.modes.map((m,i)=>`<button type="button" class="bl-btn" data-beam-mode="${i}" aria-pressed="${i===st.mode}">Mode ${i+1}: ${f(m.frequencyHz,2)} Hz</button>`).join('');
    $('#beamModeButtons').querySelectorAll('button').forEach(b=>b.onclick=()=>{st.mode=+b.dataset.beamMode;renderModeButtons();renderMode();});
    $('#beamModeTable').innerHTML=`<div class="bl-tablewrap"><table class="bl-table"><tr><th>Mode</th><th class="num">f (Hz)</th><th class="num">Relative residual</th></tr>${r.modes.map((m,i)=>`<tr><td>${i+1}</td><td class="num">${f(m.frequencyHz,4)}</td><td class="num">${m.relativeResidual.toExponential(1)}</td></tr>`).join('')}</table></div>`;
    $('#beamAnimate').disabled=reducedMotion();
    $('#beamAnimateNote').textContent=reducedMotion()?'Animation is off because your system asks for reduced motion.':'';
  }
  function renderMode() {
    if(!st.solved) return;
    const r=st.solved.result, m=r.modes[st.mode];
    $('#beamModePicture').innerHTML=m?D.modeShape(st.solved.model,m,{width:width($('#beamModePicture')),index:st.mode,phase:st.animated?st.phase:undefined}):'';
  }

  /* ------------------------------------------------------------- compare */

  function snapshot(label) {
    if(!st.solved||!isCurrent()) return;
    st.compare[label]={label,model:clone(st.solved.model),result:st.solved.result,savedAt:new Date().toISOString()};
    renderCompare();message(`Saved the current solved study as ${label}.`);
  }
  function renderCompare() {
    const box=$('#beamCompare'), A=st.compare.A, Bs=st.compare.B;
    if(!A&&!Bs) {box.innerHTML='<p class="bl-help">Save two solved studies as A and B, changing one thing between them (span, section, supports or loads). Both keep their complete inputs and results.</p>';return;}
    if(!A||!Bs) {const s=A||Bs;box.innerHTML=`<p>Saved <b>${s.label}</b>: ${esc(SEC.describe(s.model.section))}, L = ${fmt(s.model.length)} mm, ${s.model.supports.map(q=>q.kind).join('/')}. Save the other one to compare.</p>${restoreButtons()}`;wireRestore();return;}
    const ra=A.result, rb=Bs.result, diff=Study.diffModels(A.model,Bs.model);
    // Differences below 1e-9 of the magnitude are round-off and shown as 0.
    const row=(name,a,b,unit,d=4)=>{let delta=b-a;if(Math.abs(delta)<=1e-9*Math.max(Math.abs(a),Math.abs(b)))delta=0;
      const pct=Math.abs(a)>1e-12?` (${delta>0?'+':''}${fmt(100*delta/Math.abs(a),3)} %)`:'';
      return `<tr><td>${name}</td><td class="num">${fmt(a,d)} ${unit}</td><td class="num">${fmt(b,d)} ${unit}</td><td class="num">${delta>0?'+':''}${fmt(delta,d)}${pct}</td></tr>`;};
    const sameSupports=JSON.stringify(A.model.supports)===JSON.stringify(Bs.model.supports);
    const reactions=sameSupports?ra.reactions.map((q,i)=>row(`Reaction ${D.supportName(i)} force (+down)`,q.force,rb.reactions[i].force,'N')+(q.kind==='fixed'?row(`Reaction ${D.supportName(i)} couple (+cw)`,q.moment,rb.reactions[i].moment,'N·mm'):'')).join('')
      :`<tr><td>Reactions</td><td>${ra.reactions.map((q,i)=>`${D.supportName(i)}: ${fmt(q.force)} N${q.kind==='fixed'?`, ${fmt(q.moment)} N·mm`:''}`).join('<br>')}</td><td>${rb.reactions.map((q,i)=>`${D.supportName(i)}: ${fmt(q.force)} N${q.kind==='fixed'?`, ${fmt(q.moment)} N·mm`:''}`).join('<br>')}</td><td>supports differ</td></tr>`;
    const cols=window.matchMedia&&window.matchMedia('(max-width: 1180px)').matches?1:2, full=width(box), w=Math.max(300,(full-(cols-1)*18)/cols);
    const series=key=>[{result:ra,key,cls:'bl-curve',label:'A'},{result:rb,key,cls:'bl-curve-b',label:'B'}];
    const domain=key=>{const all=[...ra[key],...rb[key],0];return [Math.min(...all),Math.max(...all)];};
    const legend=[{label:'A',cls:'bl-curve'},{label:'B',cls:'bl-curve-b'}];
    const scale=Math.max(ra.maxima.bendingStress,rb.maxima.bendingStress,1e-12);
    box.innerHTML=`${restoreButtons()}
      ${diff.loadsDiffer?`<div class="bl-callout warn"><b>The loads differ between A and B${diff.selfWeightChanges?' (self-weight changes with the section, density or span)':''}.</b> Differences in stress or deflection mix the effect of loading with the effect of stiffness; change one thing at a time for a fair comparison.</div>`:''}
      <h3>What changed</h3>${diff.changes.length?`<div class="bl-tablewrap"><table class="bl-table"><tr><th>Input</th><th>A</th><th>B</th></tr>${diff.changes.map(c=>`<tr><td class="bl-changed">${esc(c.label)}</td><td>${esc(c.a)}</td><td>${esc(c.b)}</td></tr>`).join('')}</table></div>`:'<p>No input differs: A and B are the same study.</p>'}
      <h3>Results side by side</h3><div class="bl-tablewrap"><table class="bl-table"><tr><th>Quantity</th><th class="num">A</th><th class="num">B</th><th class="num">B − A</th></tr>
      ${row('Beam mass',ra.massG,rb.massG,'g')}${row('Max |v|',ra.maxima.deflection,rb.maxima.deflection,'mm')}${row('Max |σ| (bending)',ra.maxima.bendingStress,rb.maxima.bendingStress,'MPa')}
      ${row('Max |τ| (shear)',ra.maxima.shearStress,rb.maxima.shearStress,'MPa')}${row('First frequency f₁',ra.modes[0]?ra.modes[0].frequencyHz:NaN,rb.modes[0]?rb.modes[0].frequencyHz:NaN,'Hz')}
      ${row('Max |M|',ra.maxima.moment,rb.maxima.moment,'N·mm')}${row('Max |V|',ra.maxima.shear,rb.maxima.shear,'N')}${reactions}</table></div>
      <h3>Same axes</h3><div class="bl-charts">${['shear','moment','deflection'].map(k=>`<figure>${D.chart(ra,k,{width:w,series:series(k),yDomain:domain(k),legend,extremes:false,noFill:true})}</figure>`).join('')}</div>
      <h3>Same stress colour scale (±${fmt(scale)} MPa)</h3>${D.stressMap(ra,{width:full,scale,title:`A · bending stress (scale ±${fmt(scale)} MPa)`})}${D.stressMap(rb,{width:full,scale,title:`B · bending stress (same scale)`})}
      <p class="bl-help">Interpretation: for the same loads and supports, deflection scales with 1/(EI) and bending stress with c/I; mass with ρA. Wing A/B comparison is not part of this Beam workspace.</p>`;
    wireRestore();
  }
  const restoreButtons=()=>`<div class="bl-row">${st.compare.A?'<button type="button" class="bl-btn bl-btn-sm" id="beamRestoreA">Load A into the editor</button>':''}${st.compare.B?'<button type="button" class="bl-btn bl-btn-sm" id="beamRestoreB">Load B into the editor</button>':''}</div>`;
  function wireRestore() {
    for(const k of ['A','B']) {const b=$(`#beamRestore${k}`);if(b)b.onclick=()=>{st.model=clone(st.compare[k].model);st.editLoad=null;renderInputs(st.model);solve(`Study ${k} loaded into the editor and solved.`);};}
  }
  function equalMass() {
    if(!st.solved) return;
    const base=st.solved.model, r0=st.solved.result;
    const rows=[{name:'Your section',rule:SEC.describe(base.section),section:base.section,result:r0}];
    for(const c of SEC.equalMassCandidates(r0.area)) {
      try {rows.push({...c,result:B.solve({...base,section:c.section})});} catch(e) {rows.push({...c,error:e.message});}
    }
    $('#beamEqualMass').innerHTML=`<div class="bl-tablewrap"><table class="bl-table"><tr><th>Shape (same area A = ${fmt(r0.area)} mm²)</th><th class="num">I (mm⁴)</th><th class="num">Max |v| (mm)</th><th class="num">Max |σ| (MPa)</th><th class="num">Max |τ| (MPa)</th><th class="num">f₁ (Hz)</th><th></th></tr>
      ${rows.map((q,i)=>q.error?`<tr><td>${esc(q.name)}</td><td colspan="6" class="bl-err">${esc(q.error)}</td></tr>`:`<tr class="${i===0?'hl':''}"><td><b>${esc(q.name)}</b><br><span class="bl-help">${esc(i===0?q.rule:`${q.rule} · ${SEC.describe(q.section)}`)}</span></td><td class="num">${fmt(q.result.I)}</td><td class="num">${fmt(q.result.maxima.deflection)}</td><td class="num">${fmt(q.result.maxima.bendingStress)}</td><td class="num">${fmt(q.result.maxima.shearStress)}</td><td class="num">${q.result.modes[0]?fmt(q.result.modes[0].frequencyHz):'—'}</td><td>${i===0?'':`<button type="button" class="bl-btn bl-btn-sm" data-use-section="${i}" aria-label="Use the ${esc(q.name.toLowerCase())}">Use</button>`}</td></tr>`).join('')}</table></div>
      <p class="bl-help">All rows have the same area, so the same mass (${fmt(r0.massG)} g) and self-weight. Deeper material far from the neutral axis raises I. Thin walls (tube, box, I) can buckle locally before these nominal stresses are reached; that is not checked here.</p>`;
    $$('[data-use-section]').forEach(b=>b.onclick=()=>{const q=rows[+b.dataset.useSection];$('#beamShape').value=q.section.shape;renderSectionFields(q.section);renderSectionView();draftChanged();solve(`Section changed to the equal-mass ${q.name.toLowerCase()}.`);});
  }

  /* -------------------------------------------------- report and export */

  function exportStatus(text){const s=$('#beamExportStatus');s.dataset.msg=text;s.textContent=text;}
  function guard() {
    if(!st.solved||!isCurrent()) {exportStatus('Solve the current inputs before exporting; nothing was exported.');return false;}
    return true;
  }
  function download(name,text,type) {
    const blob=new Blob([text],{type}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function compareForExport(){const c={};for(const k of ['A','B'])if(st.compare[k])c[k]={label:k,model:st.compare[k].model};return Object.keys(c).length?c:null;}
  function exportText(){return Study.exportStudy({result:st.solved.result,notes:$('#beamExplain').value,compare:compareForExport()});}
  function importText(text) {
    let doc;
    try {doc=Study.parseStudy(text);} catch(e) {exportStatus(`Import refused: ${e.message}`);return false;}
    // All or nothing: the model must solve here before anything on the page is replaced.
    try {B.solve({...doc.model,modes:false});} catch(e) {exportStatus(`Import refused: ${e.message} Your current study is unchanged.`);return false;}
    const snapshots={};
    if(doc.compare) for(const k of ['A','B']) if(doc.compare[k]) {
      try {snapshots[k]={label:k,model:doc.compare[k].model,result:B.solve({...doc.compare[k].model,modes:true}),savedAt:''};} catch(e) {}
    }
    st.model=clone(doc.model);st.editLoad=null;renderInputs(st.model);
    $('#beamExplain').value=doc.notes;
    st.compare={A:snapshots.A||null,B:snapshots.B||null};
    const solved=solve(`Study imported (file version ${doc.version}${doc.legacy?', converted from the earlier study record':''}) and solved again on this page.`);
    renderCompare();
    if(!solved) {exportStatus(`The imported study could not be solved here: ${st.error}`);return false;}
    exportStatus(`Imported study (version ${doc.version}). Results were recomputed, not read from the file.`);
    return true;
  }

  function printReport() {
    if(!guard()) return;
    const m=st.solved.model, r=st.solved.result, W=700, p=r.sectionProperties, date=new Date().toLocaleString();
    const reactions=r.reactions.map((q,i)=>{const s=r.stations.find(t=>Math.abs(t.x-q.x)<=m.length*1e-10)||{};return `<tr><td>${D.supportName(i)}</td><td>${q.kind}</td><td class="num">${plain(q.x)}</td><td class="num">${fmt(q.force,5)}</td><td class="num">${fmt(q.moment,5)}</td><td class="num">${fmt(s.v??0,4)}</td><td class="num">${fmt(s.thetaRight??s.thetaLeft??0,4)}</td></tr>`;}).join('');
    $('#beamPrint').innerHTML=`<div class="bl-print"><h1>MIE 446 Beam Lab · study report</h1><p>${esc(date)} · engine ${esc(B.VERSION)} · units mm, N, MPa</p>
      <section><h2>Model</h2><p>L = ${fmt(m.length)} mm · ${esc(SEC.describe(m.section))} · E = ${fmt(m.E)} MPa · ρ = ${fmt(m.density)} g/cm³ · ${r.dofs.elements} elements · self-weight ${m.selfWeight?`included (${fmt(r.selfWeight.q)} N/mm)`:'not included'}</p>
        <p>A = ${fmt(p.A)} mm², I = ${fmt(p.I)} mm⁴, c = ${fmt(p.c)} mm, S = ${fmt(p.S)} mm³, mass ${fmt(r.massG)} g</p>
        <figure>${D.beamSchematic(m,{width:W,selfWeight:r.selfWeight.enabled?{q:r.selfWeight.q}:null,label:'Input schematic: physical supports and applied loads'})}<figcaption>Input schematic (physical supports and loads).</figcaption></figure>
        <figure>${D.freeBody(m,r,{width:W,mode:'solved',label:'Free-body diagram with solved reactions'})}<figcaption>Free-body diagram: supports replaced by the solved reactions (drawn in their actual directions).</figcaption></figure></section>
      <section><h2>Supports and loads</h2><table class="bl-table"><tr><th>Support</th><th>Type</th><th class="num">x (mm)</th><th class="num">Force (N, ↓ +)</th><th class="num">Moment (N·mm, ↻ +)</th><th class="num">v (mm)</th><th class="num">θ (rad)</th></tr>${reactions}</table>
        <p>Hinges: ${m.hinges.length?m.hinges.map(h=>`${fmt(h)} mm`).join(', '):'none'}. Loads: ${m.loads.length?m.loads.map(v=>esc(Study.describeLoad(v))).join('; '):'none'}.</p>
        <p>ΣF residual ${r.equilibrium.force.toExponential(2)} N; ΣM residual ${r.equilibrium.moment.toExponential(2)} N·mm. Stability: ${r.stability.degree===0?'statically determinate':`statically indeterminate to degree ${r.stability.degree}`}.</p></section>
      <section><h2>Results</h2><p>Max |v| = ${fmt(r.maxima.deflection)} mm at x = ${fmt(r.extremes.deflection.x)} mm · max |M| = ${fmt(r.maxima.moment)} N·mm at x = ${fmt(r.extremes.moment.x)} mm · max |σ| = ${fmt(r.maxima.bendingStress)} MPa · max |τ| = ${fmt(r.maxima.shearStress)} MPa · f₁ = ${r.modes[0]?fmt(r.modes[0].frequencyHz):'—'} Hz</p>
        <div class="bl-print-grid">${['shear','moment','deflection','stressTop'].map(k=>`<figure>${D.chart(r,k,{width:340,height:180,supports:r.input.supports.map(s=>s.x)})}</figure>`).join('')}</div>
        ${D.stressMap(r,{width:W})}</section>
      <section><h2>Assumptions and limitations</h2><ul>${r.assumptions.map(a=>`<li>${esc(a)}</li>`).join('')}${r.warnings.map(a=>`<li>${esc(a)}</li>`).join('')}<li>Nominal beam stresses only: local buckling, clamp/contact concentrations, holes and printing defects are not modelled. Not an airworthiness or failure certification.</li></ul></section>
      ${$('#beamExplain').value.trim()?`<section><h2>Notes</h2><div class="bl-notes-print">${esc(Study.cleanText($('#beamExplain').value,4000))}</div></section>`:''}</div>`;
    // The class only changes @media print rules; it is removed after the dialog closes.
    document.body.classList.add('beam-printing');
    const done=()=>{document.body.classList.remove('beam-printing');window.removeEventListener('afterprint',done);};
    window.addEventListener('afterprint',done);
    setTimeout(done,120000);
    if(typeof window.print==='function') window.print();
    exportStatus('Report sent to the print dialog. Choose “Save as PDF” there to keep a PDF.');
  }

  /* ---------------------------------------------------------- render all */

  function renderAll() {
    // Panels computed for an earlier solve (equal-mass table, share link, export message) no longer apply.
    $('#beamEqualMass').innerHTML='';
    const box=$('#beamShareBox');box.value='';box.hidden=true;
    $('#beamExportStatus').dataset.msg='';
    renderStatus();renderPicture();
    if(!st.solved) return;
    renderKpis();renderReactions();renderCharts();renderTheory();renderNotice();renderModeButtons();renderMode();
    if(st.tab==='cut') renderCut();
    if(st.tab==='solution') renderSolution(); else st.cache.solution=false;
    renderCompare();
    $('#beamConvergence').innerHTML='';
    host.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stage==='beam')));
  }

  /* ------------------------------------------------------------- loads */

  function syncLoadForm() {
    if(st.editLoad!==null&&!(st.editLoad<st.model.loads.length)) st.editLoad=null;
    const k=$('#beamLoadKind').value, point=k==='point'||k==='moment';
    const show=(id,on)=>{$(`#${id}Field`).hidden=!on;};
    show('beamLoadB',!point);show('beamP',k==='point');show('beamC',k==='moment');
    show('beamQ0',['rectangle','triangle-root','trapezoid'].includes(k));show('beamQ1',['triangle','trapezoid'].includes(k));
    $('#beamLoadALabel').textContent=point?'Position x':'Start';
    $('#beamQ0Label').textContent=k==='rectangle'?'q (uniform)':'q at start';
    $('#beamLoadSubmit').textContent=st.editLoad===null?'Add load & solve':`Update load ${st.editLoad+1} & solve`;
    $('#beamLoadCancel').hidden=st.editLoad===null;
  }
  function loadFromForm() {
    const k=$('#beamLoadKind').value, n=(id,label)=>readNumber($(id),label);
    const L=Number(geometryInput('length').value)||st.model.length;
    let load;
    if(k==='point') load={kind:'point',position:n('#beamLoadA','Position x'),force:n('#beamP','Force P')};
    else if(k==='moment') load={kind:'moment',position:n('#beamLoadA','Position x'),moment:n('#beamC','Couple C')};
    else {
      const a=n('#beamLoadA','Start'),b=n('#beamLoadB','End'),q0=k==='triangle'?0:n('#beamQ0','q at start'),q1=k==='triangle-root'?0:k==='rectangle'?q0:n('#beamQ1','q at end');
      load={kind:'distributed',start:a,end:b,qStart:q0,qEnd:q1};
    }
    const at=load.kind==='distributed'?[load.start,load.end]:[load.position];
    if(at.some(x=>x<0||x>L)) throw new Error(`Loads must lie on the beam (0 to ${plain(L)} mm).`);
    if(load.kind==='distributed'&&!(load.end>load.start)) throw new Error('A distributed load needs start < end.');
    return load;
  }
  function submitLoad(e) {
    if(e) e.preventDefault();
    const err=$('#beamLoadError');err.hidden=true;
    let load;
    try {load=loadFromForm();} catch(x) {err.textContent=x.message;err.hidden=false;return;}
    if(st.editLoad!==null&&!(st.editLoad<st.model.loads.length)) st.editLoad=null;
    if(st.editLoad===null&&st.model.loads.length>=MAX_LOADS) {err.textContent=`Use at most ${MAX_LOADS} loads.`;err.hidden=false;return;}
    if(st.editLoad===null) st.model.loads.push(load); else st.model.loads[st.editLoad]=load;
    st.editLoad=null;renderLoadList();syncLoadForm();solve();
  }
  function editLoad(i) {
    const p=st.model.loads[i];st.editLoad=i;
    if(p.kind==='point'){$('#beamLoadKind').value='point';$('#beamLoadA').value=p.position;$('#beamP').value=p.force;}
    else if(p.kind==='moment'){$('#beamLoadKind').value='moment';$('#beamLoadA').value=p.position;$('#beamC').value=p.moment;}
    else {$('#beamLoadKind').value=p.qStart===p.qEnd?'rectangle':p.qStart===0?'triangle':p.qEnd===0?'triangle-root':'trapezoid';$('#beamLoadA').value=p.start;$('#beamLoadB').value=p.end;$('#beamQ0').value=p.qStart;$('#beamQ1').value=p.qEnd;}
    renderLoadList();syncLoadForm();$('#beamLoadKind').focus();
  }
  /** Replace the applied loads programmatically; an edit in progress no longer refers to them. */
  function replaceLoads(loads) {st.model.loads=loads;st.editLoad=null;$('#beamLoadError').hidden=true;renderLoadList();syncLoadForm();}
  function fillFormFromSingleLoad() {
    if(st.model.loads.length!==1||st.model.loads[0].kind!=='distributed') return;
    const p=st.model.loads[0];
    $('#beamLoadA').value=p.start;$('#beamLoadB').value=p.end;$('#beamQ0').value=p.qStart;$('#beamQ1').value=p.qEnd;
    $('#beamLoadKind').value=p.qStart===0?'triangle':p.qEnd===0?'triangle-root':p.qStart===p.qEnd?'rectangle':'trapezoid';
    syncLoadForm();
  }

  /* -------------------------------------------------------------- tabs */

  function openTab(name,focus=false) {
    st.tab=name;
    $$('.bl-tabs [role="tab"]').forEach(b=>{const on=b.dataset.tab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();});
    $$('.bl-results [role="tabpanel"]').forEach(p=>{p.hidden=p.id!==`beamTab-${name}`;});
    if(name==='cut') renderCut();
    if(name==='solution') renderSolution();
    if(name==='modes') renderMode();
    if(name==='learn'&&!$('#beamSigns').innerHTML) $('#beamSigns').innerHTML=`<h3>Sign conventions</h3>${D.signConventions({width:width($('#beamSigns'))})}<p class="bl-help">Hand calculations often take reaction forces up and couples counter-clockwise as positive: reverse the signs of the app's reactions to compare. Displacement v is positive downward in both.</p>`;
    if(name==='compare') renderCompare();
    renderPicture();
  }

  /* ------------------------------------------------------------- wiring */

  $('#beamSolve').onclick=()=>solve();
  $('#beamNavToggle').onclick=e=>{const open=$('#beamNav').classList.toggle('is-open');e.currentTarget.setAttribute('aria-expanded',String(open));};
  $('#beamRevert').onclick=revert;
  $('#beamAutoSolve').onchange=e=>{st.autoSolve=e.target.checked;if(st.autoSolve&&!isCurrent())solve();};
  $('#beamGeometry').onsubmit=e=>{e.preventDefault();solve();};
  host.querySelector('.bl-side').addEventListener('input',e=>{if(e.target.closest('#beamLoadForm')||e.target.id==='beamAutoSolve'||e.target.id==='beamShape')return;if(e.target.dataset.sec!==undefined||e.target.id==='beamShape'||e.target.closest('#beamGeometry'))renderSectionView();draftChanged();});
  host.querySelector('.bl-side').addEventListener('change',e=>{if(e.target.closest('#beamLoadForm')||e.target.id==='beamAutoSolve')return;if(e.target.dataset.field==='kind')draftChanged();});
  $('#beamShape').onchange=()=>{
    const shape=$('#beamShape').value;let depth=10,w=20;
    try {const p=SEC.properties(st.model.section);depth=p.depth;w=p.width;} catch(e) {}
    const t=Math.max(Math.min(w,depth)/8,0.1), dims={rectangle:{width:w,height:depth},circle:{diameter:depth},tube:{outerDiameter:depth,thickness:Number((depth/10).toPrecision(3))},
      box:{width:w,height:depth,thickness:Number(t.toPrecision(3))},ibeam:{flangeWidth:w,height:depth,flangeThickness:Number((depth/8).toPrecision(3)),webThickness:Number(Math.min(w/8,depth/4).toPrecision(3))}}[shape];
    renderSectionFields({shape,...dims});renderSectionView();draftChanged();
  };
  const rowValues=type=>(type==='support'?interiorRows():hingeRows()).map(r=>Number(r.querySelector('[data-field="x"]').value));
  function freeSpot(taken) {
    let L=st.model.length;try{L=readNumber(geometryInput('length'),'Length L');}catch(e){}
    return [0.5,0.25,0.75,0.375,0.625,0.125,0.875].map(k=>Number((L*k).toPrecision(10))).find(v=>!taken.some(t=>Math.abs(t-v)<1e-9))??Number((L/3).toPrecision(10));
  }
  $('#beamAddSupport').onclick=()=>{
    if(supportLimitReached()){message(`At most ${B.LIMITS.supports} supports.`);return;}
    addRow('support',{x:freeSpot(rowValues('support')),kind:'roller'});draftChanged();
  };
  $('#beamAddHinge').onclick=()=>{
    if(hingeRows().length>=B.LIMITS.hinges){message(`At most ${B.LIMITS.hinges} hinges.`);return;}
    addRow('hinge',freeSpot([...rowValues('hinge'),...rowValues('support')]));draftChanged();
  };
  host.querySelector('.bl-side').addEventListener('click',e=>{
    const rm=e.target.closest('[data-remove-row]'), de=e.target.closest('[data-delete-load]'), ed=e.target.closest('[data-edit-load]');
    if(rm){const row=rm.closest('[data-row]'),list=row.parentElement,type=row.dataset.row;row.remove();relabelRows(list,type);draftChanged();}
    if(de){const i=+de.dataset.deleteLoad;st.model.loads.splice(i,1);if(st.editLoad!==null){st.editLoad=null;syncLoadForm();}renderLoadList();solve();}
    if(ed) editLoad(+ed.dataset.editLoad);
  });
  $('#beamLoadKind').onchange=syncLoadForm;
  $('#beamLoadForm').onsubmit=submitLoad;
  $('#beamLoadCancel').onclick=()=>{st.editLoad=null;renderLoadList();syncLoadForm();};
  $('#beamSelfWeight').onchange=()=>{renderSectionView();draftChanged();};
  $('#beamClear').onclick=()=>{replaceLoads([]);solve();};
  $('#beamCentre').onclick=()=>{let L=st.model.length;try{L=readNumber(geometryInput('length'),'Length L');}catch(e){}replaceLoads([{kind:'point',position:L/2,force:2}]);solve();};
  host.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>{let L=st.model.length;try{L=readNumber(geometryInput('length'),'Length L');}catch(e){}
    const k=b.dataset.shape,q=2/L;replaceLoads([{kind:'distributed',start:0,end:L,qStart:k==='tip'?0:k==='root'?2*q:q,qEnd:k==='root'?0:k==='tip'?2*q:q}]);solve();});
  host.querySelectorAll('[data-beam-preset]').forEach(b=>b.onclick=()=>{
    const name=b.dataset.beamPreset;st.model=presetModel(name);st.editLoad=null;renderInputs(st.model);fillFormFromSingleLoad();
    solve(name.startsWith('hw2b-')?'HW 2B case loaded: all previous loads replaced; 450 × 16 × 8 mm, E = 2200 MPa. Read support reactions and motion in the table.'
      :'Lecture 03 example loaded: all previous loads replaced; 450 × 20 × 10 mm, E = 2000 MPa.');
    host.querySelectorAll('[data-stage]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.stage==='beam')));
  });
  host.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{
    const s=b.dataset.stage;
    if(s==='beam') {host.querySelectorAll('[data-stage]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}
    else if(document.documentElement.dataset.wingReady==='true') window.dispatchEvent(new CustomEvent('wing-learning-stage',{detail:s}));
    else {const msg=$('#beamStatus');msg.textContent='The 3-D workspace is not ready. It needs WebGL and an internet connection to load its graphics libraries. Reload when connected; the beam lessons still work.';if(msg.scrollIntoView)msg.scrollIntoView({block:'center'});}
  });
  // Tabs: click and arrow-key roving focus.
  const tabs=$$('.bl-tabs [role="tab"]');
  tabs.forEach((b,i)=>{b.onclick=()=>openTab(b.dataset.tab);b.onkeydown=e=>{
    const k=e.key, j=k==='ArrowRight'?(i+1)%tabs.length:k==='ArrowLeft'?(i-1+tabs.length)%tabs.length:k==='Home'?0:k==='End'?tabs.length-1:-1;
    if(j>=0){e.preventDefault();openTab(tabs[j].dataset.tab,true);}};});
  // Placement tools and dragging on the picture.
  host.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>setPlacing(b.dataset.place));
  $('#beamShowDefl').onclick=e=>{st.showDeflection=!st.showDeflection;e.currentTarget.setAttribute('aria-pressed',String(st.showDeflection));renderPicture();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&st.placing)setPlacing(st.placing);});
  const pic=$('#beamPicture');
  let pending=false;
  const frame=fn=>{if(pending)return;pending=true;raf(()=>{pending=false;fn();});};
  pic.addEventListener('pointerdown',e=>{
    const drag=e.target.closest('[data-draggable]');
    if(st.placing) return;
    if(drag&&!e.target.closest('.bl-ghost')) {
      // The fallback picture (invalid inputs) shows the solved model, whose rows differ from the inputs.
      if(st.drawnInvalid) {message('Fix the invalid input first: the picture shows the last valid model.');return;}
      const svg=pic.querySelector('svg');
      if(drag.dataset.draggable==='hinge') st.drag={type:'hinge',index:+drag.dataset.hingeIndex};
      else {const s=st.drawn&&st.drawn.supports[+drag.dataset.supportIndex];st.drag={type:'support',index:s&&s.row>=0?s.row:-1};}
      if(!(st.drag.index>=0)){st.drag=null;return;}
      if(pic.setPointerCapture)try{pic.setPointerCapture(e.pointerId);}catch(x){}
      e.preventDefault();return;
    }
    if(st.tab==='cut'&&st.solved&&isCurrent()) {st.drag={type:'cut'};const x=svgX(e);if(x!==null)setCut(x);if(pic.setPointerCapture)try{pic.setPointerCapture(e.pointerId);}catch(z){}}
  });
  pic.addEventListener('pointermove',e=>{
    if(st.placing) {const x=svgX(e);if(x!==null)frame(()=>renderPicture({x:snap(x,st.model.length),kind:st.placing}));return;}
    if(!st.drag) return;
    const x=svgX(e);if(x===null)return;
    if(st.drag.type==='cut') {frame(()=>setCut(x));return;}
    const L=st.model.length, sx=Math.min(L*0.995,Math.max(L*0.005,snap(x,L)));
    const rows=st.drag.type==='hinge'?hingeRows():interiorRows(), input=rows[st.drag.index]&&rows[st.drag.index].querySelector('[data-field="x"]');
    if(input){input.value=sx;frame(()=>{renderPicture();renderStatus();});}
  });
  const endDrag=()=>{if(!st.drag)return;const t=st.drag.type;st.drag=null;if(t!=='cut')draftChanged();};
  pic.addEventListener('pointerup',endDrag);pic.addEventListener('pointercancel',endDrag);
  pic.addEventListener('click',e=>{if(!st.placing)return;const x=svgX(e);if(x!==null)placeAt(snap(x,st.model.length));});
  // Cut controls.
  $('#beamCut').oninput=e=>setCut(+e.target.value);
  $('#beamCutX').onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v))setCut(v);};
  host.querySelectorAll('[data-cut-side]').forEach(b=>b.onclick=()=>{st.cut.side=b.dataset.cutSide;renderCut();});
  host.querySelectorAll('[data-cut-limit]').forEach(b=>b.onclick=()=>{st.cut.limit=b.dataset.cutLimit;renderCut();});
  $('#beamCutSnaps').onclick=e=>{const b=e.target.closest('[data-cut-to]');if(b)setCut(+b.dataset.cutTo);};
  // Modes, verification, compare, export.
  $('#beamAnimate').onclick=()=>{st.animated=!st.animated;$('#beamAnimate').textContent=st.animated?'Pause mode':'Animate mode';renderMode();};
  setInterval(()=>{if(st.animated&&!host.hidden&&st.tab==='modes'&&!reducedMotion()){st.phase+=.18;renderMode();}},80);
  $('#beamRefine').onclick=refine;
  $('#beamSaveA').onclick=()=>snapshot('A');$('#beamSaveB').onclick=()=>snapshot('B');
  $('#beamClearAB').onclick=()=>{st.compare={A:null,B:null};renderCompare();};
  $('#beamEqualMassBtn').onclick=equalMass;
  $('#beamDownload').onclick=()=>{if(!guard())return;download('MIE446-beam-study.json',exportText(),'application/json');exportStatus('Study saved as MIE446-beam-study.json (versioned JSON).');};
  $('#beamCsv').onclick=()=>{if(!guard())return;download('MIE446-beam-results.csv',Study.resultsCsv(st.solved.result),'text/csv');exportStatus('Sampled results saved as CSV (duplicate x rows are the left/right limits at jumps).');};
  $('#beamCsvReactions').onclick=()=>{if(!guard())return;download('MIE446-beam-reactions.csv',Study.reactionsCsv(st.solved.result),'text/csv');exportStatus('Reactions saved as CSV.');};
  $('#beamImport').onclick=()=>$('#beamImportFile').click();
  $('#beamImportFile').onchange=async e=>{
    const file=e.target.files&&e.target.files[0];e.target.value='';
    if(!file) return;
    if(file.size>Study.LIMITS.fileBytes){exportStatus('Import refused: the file is too large to be a beam study.');return;}
    try {importText(await file.text());} catch(x) {exportStatus(`Import refused: ${x.message}`);}
  };
  $('#beamShare').onclick=async()=>{
    if(!guard()) return;
    let url;
    try {url=Study.shareUrl(st.solved.model,window.location.href);} catch(x) {exportStatus(x.message);return;}
    const box=$('#beamShareBox');box.value=url;box.hidden=false;
    try {await navigator.clipboard.writeText(url);exportStatus('Share link copied. It opens this exact model, solved again (results are recomputed, notes are not included).');}
    catch(x) {box.select&&box.select();exportStatus('Copy the link from the box below (clipboard not available here).');}
  };
  $('#beamPrintBtn').onclick=printReport;
  let resizeTimer=0;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(host.hidden)return;renderPicture();if(st.solved){renderCharts();renderMode();if(st.tab==='cut')renderCut();if(st.tab==='compare')renderCompare();if(st.tab==='solution'){st.cache.solution=false;renderSolution();}}},150);});

  /* ---------------------------------------------------------- start-up */

  renderInputs(st.model);
  fillFormFromSingleLoad();
  solve();
  if(lectureCase) message((lectureCase.startsWith('hw2b-')?'HW 2B':'Lecture 03')+' example loaded and solved. Dimensions: '+st.model.length+' × '+st.model.section.width+' × '+st.model.section.height+' mm; E = '+st.model.E+' MPa. Previous loads replaced.');
  else if(startMessage) message(startMessage);
  host.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stage==='beam')));
  window.BeamLab={version:B.VERSION,state:()=>st,solve,importText,exportText:()=>exportText(),openTab,setCut,snapshot,revert};
})();
