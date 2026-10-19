/* Wing Lab — full-scale metal wing workspace (Dewoitine D.520 preset).
 * Uses MetalWingEngine (metal_wing_engine.js), three.js r128 and the reference results of the CalculiX shell
 * model (METAL_REFERENCE). Opens from the landing pathway, from the printed-wing workspace, or with #d520. */
(() => {
  "use strict";
  if (typeof MetalWingEngine === "undefined") return;
  const E = MetalWingEngine;
  const REF = typeof METAL_REFERENCE !== "undefined" ? METAL_REFERENCE : null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, html) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (html != null) n.innerHTML = html; return n; };
  const nf = (v, d = 2) => (v == null || !isFinite(v) ? "–" : Number(v).toFixed(d));
  const sgn = (v, d = 2) => (v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d));
  const MPa = (v, d = 1) => nf(v / 1e6, d);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const frame = () => new Promise((r) => setTimeout(r, 30));
  const REPO = "https://github.com/Ehsan-Roohi/Aerospace-Structures/tree/main/computational/d520-wing";
  const MODEL3D = location.protocol === "file:" ? "https://ehsan-roohi.github.io/Aerospace-Structures/d520/" : "./d520/index.html";

  // ------------------------------------------------------------------ styles
  const style = document.createElement("style");
  style.textContent = `
  #metalLab { min-height: 100%; }
  #metalNav { position: sticky; top: 0; z-index: 50; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 16px; background: var(--panel); border-bottom: 2px solid var(--accent); box-shadow: var(--shadow); }
  #metalNav .btn { min-height: 38px; } #metalNav .title { font: 700 16px/1.2 var(--font-label); letter-spacing: .02em; margin: 0 8px; }
  #metalNav a.btn { text-decoration: none; color: inherit; }
  /* Same layout idea as the printed wing: input column (Solve + status on top) | 3-D view | view panel; results below. */
  #metalApp { --wl-top: 70px; --wl-view-h: clamp(400px, 58vh, 640px); padding: 12px 16px 28px; display: grid; gap: 12px; align-items: start; grid-template-columns: 340px minmax(0, 1fr) 272px; grid-template-rows: auto auto 1fr; grid-template-areas: "bar bar bar" "side view vpanel" "side dock dock"; }
  #metalApp > * { min-width: 0; }
  #mSide .wl-run { grid-template-columns: minmax(0, 1fr); }
  #mSide .wl-run-actions { justify-content: flex-start; }
  .mw-parts { display: grid; gap: 4px; }
  #mParts button[aria-pressed] { color: var(--fg); }
  .mw-parts button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); color: var(--fg); font: 600 12.5px/1.25 var(--font-label); text-align: left; cursor: pointer; }
  .mw-parts button i { width: 12px; height: 12px; border-radius: 3px; flex: none; border: 1px solid rgba(0, 0, 0, 0.35); }
  #mParts button[aria-pressed="false"] { color: var(--muted); background: transparent; border-style: dashed; }
  .mw-parts button[aria-pressed="false"] i { opacity: 0.25; }
  .mw-parts button::after { content: "shown"; margin-left: auto; font: 500 11px var(--font-data); color: var(--muted); }
  .mw-parts button[aria-pressed="false"]::after { content: "hidden"; }
  .mw-label { position: absolute; transform: translate(-50%, calc(-100% - 8px)); padding: 2px 7px; border-radius: 5px; font: 700 12px/1.3 var(--font-label); color: #0b1017; white-space: nowrap; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
  .mw-label::after { content: ""; position: absolute; left: calc(50% - 1px); top: 100%; width: 2px; height: 8px; background: #0b1017; }
  .mw-label[data-mlabel="mainSpar"] { background: #8fc0ef; border: 1px solid #1d5d9b; }
  .mw-label[data-mlabel="falseSpar"] { background: #cfe2f5; border: 1px solid #3f6f9e; }
  .mw-inv { display: grid; gap: 10px; font-size: 13px; }
  .mw-inv article { display: grid; gap: 4px; padding: 0 0 10px; border-bottom: 1px solid var(--line); }
  .mw-inv article:last-of-type { border-bottom: 0; }
  .mw-inv h5 { margin: 0; display: flex; gap: 8px; align-items: baseline; font: 700 13.5px/1.25 var(--font-label); }
  .mw-inv h5 b { font: 600 12px var(--font-data); color: var(--muted); }
  .mw-inv p { margin: 0; overflow-wrap: anywhere; }
  .mw-inv .src { font-size: 12px; color: var(--muted); }
  .mw-tag { display: inline-block; margin: 0 4px 2px 0; padding: 0 7px; border-radius: 99px; border: 1px solid currentColor; font: 700 10.5px/1.6 var(--font-label); letter-spacing: 0.05em; }
  /* text tokens from the page (per theme, at least 4.5:1) so the small tags keep their contrast */
  .mw-tag.PRINTED, .mw-tag.SCALED { color: var(--wl-good-text, var(--good)); } .mw-tag.EXTERNAL { color: var(--wl-accent-text, var(--accent)); } .mw-tag.GUESS { color: var(--wl-warn-text, var(--warn)); } .mw-tag.UNLISTED { color: var(--muted); }
  #mgl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
  .mw-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 10px 0; }
  .mw-kpis div { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
  .mw-kpis b { display: block; font: 700 22px/1.15 var(--font-label); font-variant-numeric: tabular-nums; }
  .mw-kpis span { color: var(--muted); font-size: 12px; }
  .mw-grid2 { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px 20px; }
  .mw-story p, .mw-story li { font-size: 14.5px; line-height: 1.55; max-width: 78ch; }
  .mw-story h2 { margin: 0 0 6px; font: 700 21px var(--font-label); }
  .mw-story h3 { margin: 14px 0 4px; font: 700 16px var(--font-label); }
  .mw-pill { display: inline-block; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--line); font: 600 11.5px var(--font-label); margin: 0 4px 4px 0; }
  .mw-pill.ok { color: var(--good); border-color: var(--good); } .mw-pill.warn { color: var(--warn); border-color: var(--warn); } .mw-pill.bad { color: var(--bad); border-color: var(--bad); }
  .mw-sec svg { width: 100%; height: auto; display: block; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; }
  .mw-sec text { fill: var(--muted); font: 11px var(--font-data); }
  .charts.single .chart svg { max-width: 640px; }
  .mw-modes { display: flex; flex-wrap: wrap; gap: 6px; }
  td.ok { color: var(--good); } td.warn { color: var(--warn); } td.bad { color: var(--bad); }
  .mw-check { display: grid; grid-template-columns: minmax(0, 1.4fr) 90px 90px 110px 90px; gap: 8px; align-items: center; padding: 7px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); margin-bottom: 6px; }
  .mw-check b { font-weight: 600; font-size: 13px; display: block; } .mw-check i { font-style: normal; color: var(--muted); font-size: 11.5px; display: block; }
  .mw-check .num { font: 500 13px var(--font-data); text-align: right; }
  .mw-check.head { background: transparent; border: 0; font: 700 11px var(--font-label); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .mw-eq { padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--panel-2); font: 15.5px/1.7 Georgia, serif; overflow-x: auto; margin: 8px 0; }
  .mw-ab { margin-top: 18px; } .mw-ab h3 { margin: 0 0 6px; font: 700 16px var(--font-label); } .mw-ab .btn { height: auto; min-height: 38px; } .mw-ab th, .mw-ab td { padding: 6px; } .mw-ab td:first-child { white-space: normal; min-width: 8em; } .mw-ab .mw-unit { color: var(--muted); white-space: nowrap; } .mw-ab td.num { text-align: right; font-family: var(--font-data); white-space: nowrap; }
  #mReport { width: 100%; min-height: 260px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font: 12px/1.5 var(--font-data); padding: 10px; }
  .mw-legend { display: flex; gap: 8px; font: 11px/1 var(--font-data); }
  .mw-legend .bar-c { width: 16px; height: 150px; border: 1px solid rgba(0,0,0,.35); }
  .mw-legend .ticks { display: flex; flex-direction: column; justify-content: space-between; height: 150px; }
  @media (max-width: 1279px) { #metalApp { grid-template-columns: 320px minmax(0, 1fr); grid-template-rows: auto auto auto 1fr; grid-template-areas: "bar bar" "side view" "side vpanel" "side dock"; } #metalApp .wl-vpanel { height: auto; } }
  @media (max-width: 1100px) { #metalApp { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "bar" "view" "vpanel" "side" "dock"; } .mw-grid2 { grid-template-columns: minmax(0, 1fr); } #mSide .wl-auto { display: none; } }
  @media (max-width: 760px) { .mw-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .mw-check { grid-template-columns: minmax(0, 1fr) 70px 70px; } .mw-check .hide-s { display: none; } }
  @media (max-width: 560px) { #metalApp { padding: 8px; } #metalNav .title { display: none; } }
  `;
  document.head.append(style);

  // ------------------------------------------------------------------ markup
  const host = el("div", { id: "metalLab", hidden: "" });
  host.innerHTML = `
  <nav id="metalNav" aria-label="Wing Lab navigation">
    <button class="btn" type="button" id="mBackBeams">← Beam lessons</button>
    <button class="btn" type="button" id="mBackWing">Printed PLA wing</button>
    <span class="title">Full-scale metal wing · Dewoitine D.520 S (1940)</span>
    <a class="btn" href="${MODEL3D}" target="_blank" rel="noopener">3-D model of the whole aircraft ↗</a>
    <a class="btn" href="${REPO}" target="_blank" rel="noopener">CAD, ANSYS and Python files ↗</a>
  </nav>
  <div id="metalApp">
    <header class="bar panel" aria-label="Commands">
      <div class="brand"><svg viewBox="0 0 76 44" aria-hidden="true"><path d="M2 24 L 30 18 L 74 20 L 74 23 L 30 27 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M26 18 V 28 M44 19 V 26" stroke="currentColor" stroke-width="2.4"/></svg>
        <div><b>Wing Lab</b><small>Full-scale metal wing</small></div></div>
      <div class="group"><span>Load factor</span><div class="row" id="mNbtns">
        <button class="tool" type="button" data-n="1">1 g</button><button class="tool" type="button" data-n="6">+6 g limit</button><button class="tool" type="button" data-n="9">+9 g ultimate</button><button class="tool" type="button" data-n="-3">−3 g</button></div></div>
      <div class="group"><span>Plot</span><div class="row" id="mPlots">
        <button class="tool" type="button" data-mplot="model">Model</button><button class="tool" type="button" data-mplot="sigma">Spanwise σ</button><button class="tool" type="button" data-mplot="tau">Shear τ</button><button class="tool" type="button" data-mplot="vm">Von Mises</button><button class="tool" type="button" data-mplot="buckle">Buckling n</button><button class="tool" type="button" data-mplot="disp">Displacement</button><button class="tool" type="button" data-mplot="mode">Modes</button></div></div>
    </header>
    <aside class="wl-side panel" id="mSide" aria-label="D.520 inputs">
      <div class="wl-run">
        <div class="wl-status" role="status" aria-live="polite"><span class="chip idle" id="mChip">Ready</span><span id="mStateText">Open to run</span></div>
        <div class="wl-run-actions"><button class="run" id="mRun" type="button"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2 L14 8 L4 14 Z" fill="currentColor"/></svg>Solve</button></div>
        <p class="wl-auto">This workspace solves automatically after each valid change; Solve runs it again.</p>
      </div>
      <p class="wl-modelnote"><b>Educational reconstruction</b> of the 1940 wing. What the model contains, and which numbers come from the manual or are assumptions: <b>Inventory &amp; sources</b> below.</p>
      <details class="wl-acc" id="mSecParams" open>
        <summary>Aircraft &amp; load case · structure · supports</summary>
        <div class="wl-acc-body wl-treepm">
          <aside class="tree panel" aria-label="Study tree"><div class="panel-head">Study · D.520 wing</div><ul id="mTree"></ul></aside>
          <aside class="pm panel" aria-label="Properties"><div class="panel-head"><span id="mPmHead">Properties</span></div><div class="pm-body" id="mPm"></div></aside>
        </div>
      </details>
      <details class="wl-acc" id="mSecLoads" open>
        <summary>Loads</summary>
        <div class="wl-acc-body"><div id="mLoadEditor"></div><p class="note wl-fallback">Point and line loads, and flight loading: the <b>Loads</b> tab under the 3-D view. Load factor or multiplier: the toolbar above.</p></div>
      </details>
      <details class="wl-acc" id="mSecFiles">
        <summary>Study files</summary>
        <div class="wl-acc-body"><div id="mStudyFiles"></div><div id="mShare"></div><p class="note wl-fallback">Saving and opening study files is not available in this build.</p></div>
      </details>
      <details class="wl-acc" id="mSecInventory" open>
        <summary>Inventory &amp; sources <span class="wl-badge" id="mInvBadge"></span></summary>
        <div class="wl-acc-body" id="mInventory"></div>
      </details>
    </aside>
    <section class="view panel" aria-label="3-D viewport" id="mView">
      <canvas id="mgl"></canvas>
      <div class="anatomy-labels" id="mPartLabels" aria-hidden="true"><span class="mw-label" data-mlabel="mainSpar" hidden>Main (front) spar · 0.37c</span><span class="mw-label" data-mlabel="falseSpar" hidden>False (rear) spar · 0.73c</span></div>
      <div class="overlay infocol"><div class="plotinfo" id="mPlotinfo"></div><div class="legend-title" id="mLegendTitle"></div><div class="mw-legend" id="mLegend"></div></div>
      <div class="probe" id="mProbe" hidden></div>
      <div class="overlay footline" id="mFoot"></div>
      <div class="modeplayer" id="mModePlayer" hidden><span>Mode</span><div class="seg" id="mModeSeg"></div></div>
      <div class="loading" id="mLoading" hidden><div class="card"><h3 id="mLoadTitle">Solving the D.520 wing</h3><p id="mLoadStep">Lifting line · sections · strength</p><div class="progress"><div id="mLoadBar"></div></div></div></div>
    </section>
    <aside class="wl-vpanel panel" id="mViewPanel" aria-label="View and display">
      <div class="panel-head">View &amp; display</div>
      <div class="wl-vbody">
        <div>
          <span class="wl-vlabel" id="mZoomLabel">Zoom · changes the view only</span>
          <div class="wl-zoom" role="group" aria-labelledby="mZoomLabel"><button class="btn" type="button" id="mZoomOut" aria-label="Zoom out" title="Zoom out">−</button><button class="btn" type="button" id="mZoomIn" aria-label="Zoom in" title="Zoom in">+</button><button class="btn" type="button" id="mZoomFit" title="Fit the whole wing in the view">Fit</button><button class="btn" type="button" id="mZoomReset" title="Isometric view at the starting distance">Reset view</button></div>
        </div>
        <div class="wl-readout" id="mViewReadout"><p id="mViewDims"><b>View zoom only.</b> Zooming never changes the size of the wing.</p><div class="wl-scale"><span class="wl-scalebar" id="mScaleBar" style="width:60px"></span><span id="mScaleText">–</span></div><p class="note" id="mZoomText">Drag to rotate · right-drag or two fingers to pan · wheel or pinch to zoom.</p></div>
        <details class="hud" id="mHud" open aria-label="View and display">
          <summary>View &amp; display controls</summary>
          <span class="wl-vlabel">Standard views</span>
          <div class="hud-row"><button type="button" data-mview="iso">Isometric</button><button type="button" data-mview="plan">Planform</button><button type="button" data-mview="front">Front</button><button type="button" data-mview="root">From root</button></div>
          <span class="wl-vlabel">Quick views</span>
          <div class="hud-row"><button type="button" data-mshow="all" aria-pressed="false">Complete wing</button><button type="button" data-mshow="inside" aria-pressed="true">Inside (skins see-through)</button><button type="button" data-mshow="frame" aria-pressed="false">Spar, ribs, stringers</button></div>
          <span class="wl-vlabel" id="mSkinLabel">Skin</span>
          <div class="seg" role="group" aria-labelledby="mSkinLabel"><button type="button" data-mskin="opaque" aria-pressed="false">Opaque</button><button type="button" data-mskin="see-through" aria-pressed="true">See-through</button><button type="button" data-mskin="cutaway" aria-pressed="false">Upper skin off</button></div>
          <span class="wl-vlabel" id="mPartsLabel">Show parts · display only</span>
          <div class="mw-parts" role="group" aria-labelledby="mPartsLabel" id="mParts"></div>
          <p class="note" id="mPartsNote">Hiding a part changes only the picture. Stiffness, mass, loads and every result stay the same.</p>
          <span class="wl-vlabel">Results display</span>
          <div class="hud-row"><button type="button" id="mDef" aria-pressed="true">Deformed</button><label>Scale <input id="mScale" type="range" min="0" max="3" step="0.05" value="1"></label><button type="button" id="mMirror" aria-pressed="false">Both wings</button><button type="button" id="mArrows" aria-pressed="true">Loads</button></div>
          <div class="hud-row"><button type="button" id="mClip" aria-pressed="false">Cut at y</button><label><span class="sr">Cut station</span><input id="mClipY" type="range" min="0" max="4930" step="10" value="2350"></label></div>
        </details>
      </div>
    </aside>
    <section class="dock panel" aria-label="Results">
      <div class="tabs" role="tablist" id="mTabs">
        <button role="tab" type="button" data-mtab="start" aria-selected="true">Start here · D.520</button>
        <button role="tab" type="button" data-mtab="theory" aria-selected="false">Theory · guided lesson</button>
        <button role="tab" type="button" data-mtab="loads" aria-selected="false">Loads</button>
        <button role="tab" type="button" data-mtab="diagrams" aria-selected="false">Diagrams</button>
        <button role="tab" type="button" data-mtab="section" aria-selected="false">Section</button>
        <button role="tab" type="button" data-mtab="strength" aria-selected="false">Strength &amp; stability</button>
        <button role="tab" type="button" data-mtab="compare" aria-selected="false">Compare with shell FE</button>
        <button role="tab" type="button" data-mtab="modes" aria-selected="false">Modes</button>
        <button role="tab" type="button" data-mtab="method" aria-selected="false">Method &amp; sources</button>
        <button role="tab" type="button" data-mtab="report" aria-selected="false">Report</button>
      </div>
      <div class="tabpanel" id="mtab-start" role="tabpanel"></div>
      <div class="tabpanel" id="mtab-theory" role="tabpanel" hidden></div>
      <div class="tabpanel" id="mtab-loads" role="tabpanel" hidden></div>
      <div class="tabpanel" id="mtab-diagrams" role="tabpanel" hidden><div class="charts" id="mCharts"></div></div>
      <div class="tabpanel" id="mtab-section" role="tabpanel" hidden></div>
      <div class="tabpanel" id="mtab-strength" role="tabpanel" hidden></div>
      <div class="tabpanel" id="mtab-compare" role="tabpanel" hidden></div>
      <div class="tabpanel" id="mtab-modes" role="tabpanel" hidden></div>
      <div class="tabpanel" id="mtab-method" role="tabpanel" hidden></div>
      <div class="tabpanel" id="mtab-report" role="tabpanel" hidden></div>
    </section>
  </div>`;
  const appEl = document.getElementById("app");
  (appEl && appEl.parentNode ? appEl.parentNode : document.body).insertBefore(host, appEl ? appEl.nextSibling : null);

  // ------------------------------------------------------------------ state
  const MS = {
    // Opens without an applied load (customLoads [] : no lift, no gravity or inertia relief, multiplier 1).
    // Flight loading (lift n W, inertia relief) is applied only when the student asks for it.
    input: { n: 1, distribution: "liftingLine", inertiaRelief: false, include: { fuel: true, guns: true, ammo: true }, scales: { skin: 1, web: 1, boom: 1, stringer: 1 }, support: "fittings", taper: true, mass: E.D520.aircraft.mass, CL: E.D520.aircraft.CL, material: { ...E.D520.material }, customLoads: [] },
    selected: "aircraft", plot: "model", show: "inside", deformed: true, scale: 1, mirror: false, arrows: true, clip: false, clipY: 2.35,
    secY: 2.35, secField: "sigma", tab: "start", mode: { kind: "bending", index: 0 },
  };
  let R = null, R1 = null, running = false, pending = false, stale = true, opened = false, timer = null, lastError = null;

  // ------------------------------------------------------------------ run control
  function setStatus(text, kind) {
    const chip = $("#mChip"), t = $("#mStateText");
    $("#mRun").classList.toggle("stale", stale && !running);
    // a link made for the previous inputs disappears as soon as they change
    if ((stale || running) && $("#mShareBox") && !$("#mShareBox").hidden) { $("#mShareBox").hidden = true; $("#mShareBox").value = ""; $("#mShareMsg").textContent = ""; }
    if (running) { chip.className = "chip idle"; chip.textContent = "Solving"; t.textContent = text || "Running"; return; }
    if (lastError) { chip.className = "chip bad"; chip.textContent = "Input error"; t.textContent = lastError; return; }
    if (stale) { chip.className = "chip warn"; chip.textContent = "Out of date"; t.textContent = "Inputs changed — run the study"; return; }
    if (!R) return;
    if (R.input.customLoads != null && !R.input.customLoads.length) { chip.className = "chip idle"; chip.textContent = "No load"; t.textContent = text || "No load defined. Add your own load, or apply flight loading, in Loads."; return; }
    const g = governing(R);
    const ok = g && g.ratio >= 1;
    chip.className = "chip " + (kind || (ok ? "ok" : "bad"));
    chip.textContent = ok ? "Model checks meet assumed ultimate" : "Below assumed ultimate";
    t.textContent = text || (g ? `Weakest: ${g.name.toLowerCase()} at ${nf(g.n, 1)} ${R.input.customLoads!=null?'× reference load':'g'} (y = ${nf(g.y, 2)} m)` : "");
  }
  function changed() { stale = true; setStatus(); renderTree(); updateModel(); clearTimeout(timer); timer = setTimeout(runStudy, 500); }
  async function runStudy() {
    if (running) { pending = true; return; }
    running = true; stale = false; lastError = null; setStatus();
    const ld = $("#mLoading"), t0 = performance.now();
    try {
      const first = !R;
      ld.hidden = false;
      $("#mLoadTitle").textContent = first ? "Solving the D.520 wing" : "Re-solving";
      $("#mLoadStep").textContent = "Lifting line on the real planform · 2-cell section analysis at 115 stations"; $("#mLoadBar").style.width = "15%";
      await frame();
      const quick = E.solve({ ...MS.input, collapse: false });
      R = quick;
      // Gauges and boom dimensions change geometry as well as stresses.
      buildModel(R);
      $("#mLoadStep").textContent = "Post-buckling strength of 37 sections (effective width) · beam modes"; $("#mLoadBar").style.width = "55%";
      await frame();
      R = E.solve({ ...MS.input, collapse: true });
      R1 = MS.input.n === 1 ? R : E.solve({ ...MS.input, n: 1, collapse: true });
      $("#mLoadBar").style.width = "100%";
      updateModel(); renderAll();
      $("#mFoot").textContent = `Solved in ${((performance.now() - t0) / 1000).toFixed(2)} s · ${R.stations.length} thin-walled sections × ${R.sections[0].walls.length} walls · lifting line N = 60 · beam FE ${R.fem ? R.fem.y.length - 1 : 0} elements · ${R.checks.length} strength sections`;
    } catch (err) { stale = true; lastError = err.message || String(err); console.error(err); }
    finally { ld.hidden = true; running = false; setStatus(); renderTree(); if (pending) { pending = false; runStudy(); } }
  }
  function governing(r) {
    let best = null;
    for (const f of r.failure) if (f.governs) for (const side of ["pos", "neg"]) { const v = f[side]; if (!v) continue; const need = side === "pos" ? r.nUlt : r.nUltNeg; const ratio = v.n / need; if (!best || ratio < best.ratio) best = { ...v, ratio, name: f.name, side, need }; }
    return best;
  }

  // ------------------------------------------------------------------ study tree and property manager
  const glyph = (c) => `<svg class="glyph" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="${c}" stroke-width="2"/></svg>`;
  function treeModel() {
    const i = MS.input;
    return [
      { id: "aircraft", c: "var(--load)", b: "Aircraft & load case", i: i.customLoads!=null?`${i.customLoads.length} custom loads · multiplier ×${sgn(i.n,1)}`:`${nf(i.mass, 0)} kg · n = ${sgn(i.n, 1)} g` },
      { id: "material", c: "var(--muted)", b: "Material", i: `${i.material.name || "duralumin"} · E ${nf(i.material.E / 1e9, 0)} GPa` },
      { id: "structure", c: "var(--accent)", b: "Structure & gauges", i: `skin ×${i.scales.skin} · webs ×${i.scales.web} · booms ×${i.scales.boom}` },
      { id: "supports", c: "var(--fixture)", b: "Supports", i: i.support === "clamped" ? "Clamped at fittings" : "Fittings + centre section" },
      { id: "solver", c: "var(--muted)", b: "Model & solver", i: R ? `${R.stations.length} sections · ${R.checks.length} strength stations` : "–" },
      { id: "results", c: "var(--warn)", b: "Results", i: R ? `tip ${nf(R.tip.wMax * 1e3, 1)} mm at ${sgn(R.n, 1)} ${R.input.customLoads!=null?'× reference':'g'}` : "–" },
    ];
  }
  function renderTree() {
    const ul = $("#mTree"); ul.innerHTML = "";
    for (const n of treeModel()) {
      const li = el("li"), b = el("button", { class: "node", type: "button", "aria-current": String(MS.selected === n.id) }, `${glyph(n.c)}<span class="lbl"><b>${n.b}</b><i>${n.i}</i></span>${stale && n.id === "results" ? '<span class="warnmark">!</span>' : ""}`);
      b.addEventListener("click", () => { MS.selected = n.id; renderTree(); renderPM(); });
      li.append(b); ul.append(li);
    }
  }
  function numField(id, label, hint, value, step, onSet) {
    const w = el("div", { class: "field" }, `<label for="${id}">${label}${hint ? `<small>${hint}</small>` : ""}</label><input id="${id}" type="number" step="${step}" value="${value}">`);
    w.querySelector("input").addEventListener("change", (e) => {
      const v = Number(e.target.value);
      if (!e.target.value.trim() || !Number.isFinite(v)) { stale = true; lastError = `${label}: enter a finite number`; setStatus(); return; }
      onSet(v); changed(); renderTree();
    });
    return w;
  }
  function selField(id, label, options, value, onSet) {
    const w = el("div", { class: "field" }, `<label for="${id}">${label}</label><select id="${id}">${options.map(([v, t]) => `<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${t}</option>`).join("")}</select>`);
    w.querySelector("select").addEventListener("change", (e) => { onSet(e.target.value); changed(); });
    return w;
  }
  const fs = (title, ...kids) => { const f = el("fieldset", {}, `<legend>${title}</legend>`); kids.forEach((k) => f.append(k)); return f; };
  const kv = (pairs) => el("dl", { class: "kv" }, pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(""));
  function renderPM() {
    const pm = $("#mPm"); pm.innerHTML = "";
    const i = MS.input, P = E.D520, id = MS.selected;
    const head = (t, lede) => { pm.append(el("h2", {}, t)); if (lede) pm.append(el("p", { class: "lede" }, lede)); };
    if(id==='aircraft'&&i.customLoads!=null){head(i.customLoads.length?'Custom bench load case':'No load defined',i.customLoads.length?'Entered point and line loads only. No automatic flight lift or gravity/inertia relief. Mass is still present in the modal model.':'The wing opens without a load: no lift, no gravity or inertia relief. Enter loads in Loads, or apply flight loading there. Mass is still present in the modal model.');pm.append(numField('mN','Load multiplier','dimensionless, not flight g',i.n,.5,v=>{i.n=v;syncN();}));if(R)pm.append(kv([['Custom loads',i.customLoads.length],['Applied net force',nf(E.customDemand(i.customLoads,0).V*i.n,2)+' N'],['Tip displacement',nf(R.tip.wMax*1000,3)+' mm'],['Tip twist',nf(R.tip.twistDeg,4)+'°']]));return;}
    if (id === "aircraft") {
      $("#mPmHead").textContent = "Load case";
      head("Aircraft and load case", "Lift = n W, shaped along the span by the chosen method. Inertia relief subtracts n × (structure + fuel + guns + ammunition) weight at the right span and chord positions.");
      pm.append(fs("Flight condition",
        numField("mMass", "Gross mass", "kg (Wikipedia 2 677; manual leaves it blank)", i.mass, 10, (v) => (i.mass = v)),
        numField("mN", "Load factor n", "g; teaching limits +6 / −3, not a D.520 certification", i.n, 0.5, (v) => { i.n = v; syncN(); }),
        numField("mCL", "Wing CL for the lifting line", "only shapes the small camber part", i.CL, 0.1, (v) => (i.CL = v)),
        selField("mDist", "Spanwise lift shape", [["liftingLine", "Lifting line (Glauert, real planform)"], ["schrenk", "Schrenk"], ["elliptic", "Elliptic"]], i.distribution, (v) => (i.distribution = v))));
      const inc = el("fieldset", {}, "<legend>Inertia relief</legend>");
      for (const [k, lab] of [["relief", "Include inertia relief"], ["fuel", "Fuel 122 l (87.8 kg) in the wing tank"], ["guns", "Two MAC 1934 guns (21.4 kg)"], ["ammo", "Ammunition 2 × 650 rounds (32.5 kg)"]]) {
        const checked = k === "relief" ? i.inertiaRelief : i.include[k];
        const w = el("label", { class: "note", style: "display:flex;gap:8px;align-items:center;font-size:13px;color:var(--fg)" }, `<input type="checkbox" ${checked ? "checked" : ""}> ${lab}`);
        w.querySelector("input").addEventListener("change", (e) => { if (k === "relief") i.inertiaRelief = e.target.checked; else i.include[k] = e.target.checked; changed(); });
        inc.append(w);
      }
      pm.append(inc);
      if (R) pm.append(kv([["Weight W", `${nf(R.W / 1e3, 2)} kN`], ["Half-wing lift at n", `${nf((R.W / 2) * R.n / 1e3, 2)} kN`], ["Angle of attack (lifting line)", R.alphaDeg != null ? `${nf(R.alphaDeg, 1)}° at CL ${nf(i.CL, 2)}` : "–"], ["Wing area", `${nf(R.wingArea, 2)} m²`], ["Half-wing structure", `${nf(R.mass.structuralHalf, 1)} kg`], ["Non-structural, half wing", `${nf(R.mass.nonStructuralHalf, 1)} kg`]]));
    } else if (id === "material") {
      $("#mPmHead").textContent = "Material";
      head("Assumed 2017-T4 duralumin analogue", "The manual says duralumin, not a certified alloy/temper or allowable. These representative properties are teaching assumptions; replace them to study another alloy.");
      const m = i.material;
      pm.append(fs("Card", numField("mE", "Young's modulus E", "GPa", m.E / 1e9, 1, (v) => (m.E = v * 1e9)), numField("mNu", "Poisson's ratio ν", "", m.nu, 0.01, (v) => (m.nu = v)), numField("mRho", "Density", "kg/m³", m.rho, 10, (v) => (m.rho = v)),
        numField("mFty", "Tensile yield Fty", "MPa", m.Fty / 1e6, 5, (v) => (m.Fty = v * 1e6)), numField("mFcy", "Compressive yield Fcy", "MPa", m.Fcy / 1e6, 5, (v) => (m.Fcy = v * 1e6)), numField("mFtu", "Tensile strength Ftu", "MPa", m.Ftu / 1e6, 5, (v) => (m.Ftu = v * 1e6)), numField("mFsu", "Shear strength Fsu", "MPa", m.Fsu / 1e6, 5, (v) => (m.Fsu = v * 1e6))));
      pm.append(kv([["Shear modulus G", `${nf(m.E / (2 * (1 + m.nu)) / 1e9, 1)} GPa`], ["Plate constant π²E/12(1−ν²)", `${nf((Math.PI ** 2 * m.E) / (12 * (1 - m.nu ** 2)) / 1e9, 1)} GPa`]]));
    } else if (id === "structure") {
      $("#mPmHead").textContent = "Structure";
      head("Spar, skins and stringers", "Gauges step at ribs 21, 16, 12, 8 and 4. Scale whole families to study the design, as the shell-model sensitivity runs did (skin ×0.75 / ×1.25, booms ×0.6).");
      pm.append(fs("Scale factors", numField("mSk", "Skin thickness ×", "all zones", i.scales.skin, 0.05, (v) => (i.scales.skin = v)), numField("mWb", "Spar and false-spar webs ×", "", i.scales.web, 0.05, (v) => (i.scales.web = v)), numField("mBm", "Spar booms (cap thickness) ×", "", i.scales.boom, 0.05, (v) => (i.scales.boom = v)), numField("mSt", "Stringer thickness ×", "", i.scales.stringer, 0.05, (v) => (i.scales.stringer = v))));
      const rows = P.zones.map(([a, b], k) => `<tr><td>${a.toFixed(2)}–${b.toFixed(2)}</td><td class="num">${nf(P.skin[k] * 1e3 * i.scales.skin, 2)}</td><td class="num">${nf(P.web[k] * 1e3 * i.scales.web, 2)}</td><td class="num">${R ? nf(R.zones[k].area * 1e6 * i.scales.boom, 0) : "–"}</td><td class="num">${nf(P.stringer.t[k] * 1e3 * i.scales.stringer, 2)}</td></tr>`).join("");
      pm.append(el("div", { class: "tablewrap" }, `<table><thead><tr><th>Zone (m)</th><th>Skin mm</th><th>Web mm</th><th>Boom mm²</th><th>Stringer mm</th></tr></thead><tbody>${rows}</tbody></table>`));
      pm.append(el("p", { class: "note" }, "Main spar at 0.37c (single I-spar, manual p.13), false spar at 0.73c, 4 blade stringers 20 mm high per surface at 0.46–0.67c, 22 pressed ribs 1 mm (2 mm at the two kink ribs). Boom area at the root 110 × 30 mm from Pl.1; outboard ∝ M/h."));
    } else if (id === "supports") {
      $("#mPmHead").textContent = "Supports";
      head("Fuselage fittings", "Three steel fittings join the spar to fuselage frame I and two join the false spar to frame III (manual p.14). They sit at y = 0.46 m.");
      pm.append(fs("Support model", selField("mSup", "Boundary condition", [["fittings", "Fittings + centre section by symmetry (as the shell model)"], ["clamped", "Clamped at the fittings (textbook cantilever)"]], i.support, (v) => (i.support = v))));
      pm.append(el("p", { class: "note" }, "With the fittings model the wing between the two fuselage sides bends too (constant moment, slope zero at the centreline), which adds about 1.5 mm to the tip deflection at 1 g. Twist is held at the fittings in both models."));
      if (R) pm.append(kv([["Fitting reaction per g", `${nf(R.fitting.Fz_per_g / 1e3, 2)} kN`], ["Moment at the fittings per g", `${nf(R.fitting.M_per_g / 1e3, 2)} kN·m`], ["Torque at the fittings per g", `${nf(R.fitting.T_per_g, 0)} N·m (nose-up)`]]));
    } else if (id === "solver") {
      $("#mPmHead").textContent = "Model and solver";
      head("How the answer is computed", "Beam theory on the real thin-walled sections, not a 3-D finite-element model. The shell model of the same wing is the check (Compare tab).");
      pm.append(fs("Tapered beam", (() => { const w = el("label", { class: "note", style: "display:flex;gap:8px;align-items:center;font-size:13px;color:var(--fg)" }, `<input type="checkbox" ${i.taper ? "checked" : ""}> Inclined booms carry part of the shear and torque`); w.querySelector("input").addEventListener("change", (e) => { i.taper = e.target.checked; changed(); }); return w; })()));
      if (R) pm.append(kv([["Analysis sections", R.stations.length], ["Walls per section", R.sections[10].walls.length], ["Closed cells", `${R.sections[R.sections.length - 1].cells.length} (nose + box)`], ["Strength sections", R.checks.length], ["Shear resultant error", R.verification.shearResultantError.toExponential(1)], ["Lift: W/2 check", R.input.customLoads==null ? R.verification.halfLiftError.toExponential(1) : "not applicable (custom loads)"], ["Beam FE vs integration (tip)", `${nf(100 * R.verification.femTipDiff, 2)} %`], ["Beam FE vs integration (twist)", `${nf(100 * R.verification.femTwistDiff, 2)} %`]]));
    } else {
      $("#mPmHead").textContent = "Results";
      head("Results at the current load factor", "Pick a plot in the toolbar. Hover over the wing to read values.");
      if (R) pm.append(kv([["Load factor", `${sgn(R.n, 1)} g`], ["Tip deflection (rib 1)", `${nf(R.tip.wMax * 1e3, 1)} mm`], ["Tip twist", `${sgn(R.tip.twistDeg, 3)}° nose-up`], ["Root boom stress (upper)", `${MPa(R.stations[0].boomU)} MPa`], ["Max boom stress", `${MPa(Math.max(...R.stations.map((s) => Math.max(Math.abs(s.boomU), Math.abs(s.boomL)))))} MPa`], ["Max spar-web τ", `${MPa(Math.max(...R.stations.map((s) => Math.abs(s.tauWeb))))} MPa`], ["First bending mode", R.fem ? `${nf(R.fem.fBending[0], 1)} Hz` : "–"]]));
    }
  }
  function syncN() { $$("#mNbtns [data-n]").forEach((b) => {b.dataset.flightLabel ||= b.textContent;b.textContent=MS.input.customLoads!=null?`×${b.dataset.n}`:b.dataset.flightLabel;b.setAttribute("aria-pressed", String(+b.dataset.n === MS.input.n));});$('#mNbtns').previousElementSibling.textContent=MS.input.customLoads!=null?'Custom load multiplier':'Load factor'; }

  // ------------------------------------------------------------------ 3-D scene
  let renderer = null, scene, camera, controls, world, model = null, modelBuilt = false, clipPlane, raf = 0, viewSet = false;
  const ghostMats = [], skinMats = [];
  function initGL() {
    if (renderer || typeof THREE === "undefined") return;
    const canvas = $("#mgl");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
    controls = new THREE.OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.12;
    scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x2a3440, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(3, 6, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.35); rim.position.set(-4, 2, -3); scene.add(rim);
    clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -2.35);
    world = new THREE.Group(); scene.add(world);
    canvas.addEventListener("pointermove", onProbe); canvas.addEventListener("pointerleave", () => ($("#mProbe").hidden = true));
    new ResizeObserver(resize).observe($("#mView"));
    resize();
    const loop = (t) => { raf = requestAnimationFrame(loop); if (host.hidden) return; controls.update(); if (MS.plot === "mode" && R && R.fem) animateMode(t); positionPartLabels(); renderReadout(); renderer.render(scene, camera); };
    raf = requestAnimationFrame(loop);
  }
  function resize() { if (!renderer) return; const v = $("#mView"), w = v.clientWidth, h = v.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  // three.js axes: X = span y (m), Y = up Z (m), Z = chord S aft (m), all relative to the root leading edge
  let ORIGIN = [0, 0];
  const V3 = (y, S, Z) => [y, Z - ORIGIN[1], S - ORIGIN[0]];
  const DIV = ["#2c5fbd", "#4f86d6", "#8fb6e8", "#d9e4ef", "#f2c39b", "#e6835a", "#c6402f"];
  function rainbow(t) { t = Math.max(0, Math.min(1, t)); const stops = [[0, [0.17, 0.36, 1]], [0.25, [0.13, 0.76, 0.86]], [0.5, [0.13, 0.76, 0.42]], [0.75, [0.95, 0.83, 0.23]], [1, [0.94, 0.29, 0.23]]]; for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], u = (t - a) / (b - a); return ca.map((v, k) => v + u * (cb[k] - v)); } return stops[4][1]; }
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  function diverging(t) { t = Math.max(-1, Math.min(1, t)); const u = (t + 1) / 2 * (DIV.length - 1), i = Math.min(DIV.length - 2, Math.floor(u)), f = u - i, a = hex(DIV[i]), b = hex(DIV[i + 1]); return a.map((v, k) => v + f * (b[k] - v)); }
  function margin(t) { t = Math.max(0, Math.min(1, t)); const a = [0.84, 0.19, 0.24], m = [0.95, 0.75, 0.2], g = [0.2, 0.72, 0.45]; return t < 0.5 ? a.map((v, k) => v + 2 * t * (m[k] - v)) : m.map((v, k) => v + (2 * t - 1) * (g[k] - v)); }

  function meshFrom(pos, idx, data, matOpts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.length).fill(0.8), 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, shininess: 26, clippingPlanes: [], ...matOpts });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { base: Float32Array.from(pos), ...data };
    return mesh;
  }
  // a strip family swept along the stations: pts(j) returns the list of [S, Z] points of that station
  function sweep(stIdx, ptsAt, kind, extra = {}, closed = false) {
    const pos = [], idx = [], vj = [], vk = [], vS = [];
    let nP = 0;
    stIdx.forEach((j, a) => { const pts = ptsAt(j); nP = pts.length; pts.forEach(([S, Z], k) => { const y = R.stations[j].y; pos.push(...V3(y, S, Z)); vj.push(j); vk.push(k); vS.push(S); }); });
    for (let a = 0; a < stIdx.length - 1; a++) for (let k = 0; k < (closed ? nP : nP - 1); k++) {
      const k2 = (k + 1) % nP;
      if (extra.skip && extra.skip(stIdx[a], stIdx[a + 1], k)) continue;
      const p = a * nP + k, q = a * nP + k2, r = (a + 1) * nP + k2, s = (a + 1) * nP + k;
      idx.push(p, q, r, p, r, s);
    }
    return meshFrom(pos, idx, { kind, vj, vk, vS, nP, ...extra }, extra.mat || {});
  }
  function buildModel(res) {
    initGL(); if (!renderer) return;
    R = res;
    if (model) { world.remove(model); model.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    model = new THREE.Group(); world.add(model);
    const W = res.wing, S = res.sections, st = res.stations, P = res.P;
    ORIGIN = [W.S_LE(0), S[0].zc];
    const J = st.map((_, j) => j);
    const m = S[0].m, iSp = S[0].iSp;
    const lowerMissing = S.map((sec) => { const have = new Set(sec.walls.filter((w) => w.surf === "l").map((w) => w.i)); return (i) => !have.has(i); });
    // skins
    const upper = sweep(J, (j) => S[j].up, "skinU", { mat: { transparent: true } });
    const lower = sweep(J, (j) => S[j].lo, "skinL", { skip: (a, b, k) => lowerMissing[a](k) || lowerMissing[b](k), mat: { transparent: true } });
    skinMats.length = 0; skinMats.push(upper.material, lower.material);
    // webs (8 levels from the lower to the upper surface)
    const lev = E.linspace(0, 1, 9);
    const web = (ix, kind) => sweep(J, (j) => lev.map((t) => { const lo = S[j].lo[ix], up = S[j].up[ix]; return [lo[0] + t * (up[0] - lo[0]), lo[1] + t * (up[1] - lo[1])]; }), kind);
    const spar = web(iSp, "web"), fsw = web(m, "fs");
    // spar booms: rectangular tubes inside the skin
    const boom = (surf) => sweep(J, (j) => { const sc = S[j], p = surf === "u" ? sc.up[iSp] : sc.lo[iSp], d = surf === "u" ? -1 : 1; const zc = p[1] + d * sc.dF, hw = sc.bw / 2, ht = sc.tf / 2; return [[p[0] - hw, zc - ht], [p[0] + hw, zc - ht], [p[0] + hw, zc + ht], [p[0] - hw, zc + ht]]; }, surf === "u" ? "boomU" : "boomL", {}, true);
    const bU = boom("u"), bL = boom("l");
    // blade stringers
    const strs = [];
    S[0].iStr.forEach((ix, q) => { for (const surf of ["u", "l"]) strs.push(sweep(J, (j) => { const p = surf === "u" ? S[j].up[ix] : S[j].lo[ix], d = surf === "u" ? -1 : 1; return [p, [p[0], p[1] + d * S[j].hS]]; }, surf === "u" ? "strU" : "strL", { q })); });
    const structure = new THREE.Group(); structure.name = "structure";
    [spar, fsw, bU, bL, ...strs].forEach((o) => structure.add(o));
    // ribs (flat sheets; rib 22's nose is cut by the wheel well)
    const ribs = new THREE.Group(); ribs.name = "ribs";
    const ribMat = new THREE.MeshPhongMaterial({ color: 0xffcc4d, side: THREE.DoubleSide, transparent: true, opacity: 0.85, clippingPlanes: [] });
    P.ribs.forEach((y, i) => {
      const xs = E.chordFractions(P).x, sc = W.section(y, xs), iS = S[0].iSp;
      const ptsU = i === 0 ? sc.up.slice(iS) : sc.up, ptsL = i === 0 ? sc.lo.slice(iS) : sc.lo;
      const outline = [...ptsU, ...ptsL.slice().reverse()].map(([Sx, Zx]) => new THREE.Vector2(Sx - ORIGIN[0], Zx - ORIGIN[1]));
      const g = new THREE.ShapeGeometry(new THREE.Shape(outline)); g.rotateY(-Math.PI / 2); g.translate(y, 0, 0);
      const mesh = new THREE.Mesh(g, ribMat); mesh.userData = { kind: "rib", y, base: Float32Array.from(g.attributes.position.array) }; ribs.add(mesh);
    });
    // non-structural trailing edge (flaps, ailerons) and tip cap
    const ghost = new THREE.Group(); ghost.name = "ghost";
    const gm = new THREE.MeshPhongMaterial({ color: 0x9fb2c4, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: [] });
    ghostMats.length = 0; ghostMats.push(gm);
    const teX = E.linspace(P.falseSparX, 1, 9), ysTE = E.linspace(0.05, P.ribs[P.ribs.length - 1], 40);
    const surfMesh = (ys, xs, which) => { const pos = [], idx = [], base = []; ys.forEach((y) => { const sc = W.section(y, xs); (which === "u" ? sc.up : sc.lo).forEach(([Sx, Zx]) => pos.push(...V3(y, Sx, Zx))); }); const n = xs.length; for (let a = 0; a < ys.length - 1; a++) for (let k = 0; k < n - 1; k++) { const p = a * n + k; idx.push(p, p + 1, p + n + 1, p, p + n + 1, p + n); } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals(); const mesh = new THREE.Mesh(g, gm); mesh.userData = { kind: "ghost", base: Float32Array.from(pos), ys, xs, n }; return mesh; };
    ghost.add(surfMesh(ysTE, teX, "u"), surfMesh(ysTE, teX, "l"));
    const capY = E.linspace(P.ribs[P.ribs.length - 1], W.b2 - 0.002, 10), capX = E.linspace(0, 1, 31).map((t) => 0.5 * (1 - Math.cos(Math.PI * t)));
    ghost.add(surfMesh(capY, capX, "u"), surfMesh(capY, capX, "l"));
    // fuel tank, guns, ammunition
    const extras = new THREE.Group(); extras.name = "extras";
    const tank = sweep(J.filter((j) => st[j].y >= 2.07 && st[j].y <= 3.49), (j) => { const sc = S[j], a = 3, b = Math.round(iSp * 0.9); const out = []; for (let k = a; k <= b; k++) out.push([sc.up[k][0], sc.up[k][1] - 0.006]); for (let k = b; k >= a; k--) out.push([sc.lo[k][0], sc.lo[k][1] + 0.006]); return out; }, "tank", { mat: { color: 0x3b82c4, vertexColors: false, transparent: true, opacity: 0.28, depthWrite: false } }, true);
    extras.add(tank);
    for (const gy of P.masses.guns.y) {
      const c = W.chord(gy), sc = W.section(gy, [0.30]); const zc = 0.5 * (sc.up[0][1] + sc.lo[0][1]);
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 14), new THREE.MeshPhongMaterial({ color: 0x2a2f36, clippingPlanes: [] }));
      gun.rotation.x = Math.PI / 2; const p = V3(gy, sc.up[0][0], zc); gun.position.set(p[0], p[1], p[2]); gun.userData = { kind: "point", y: gy, base: p }; extras.add(gun);
      const sa = W.section(gy, [0.55]); const za = 0.5 * (sa.up[0][1] + sa.lo[0][1]);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.25), new THREE.MeshPhongMaterial({ color: 0x8a6d3b, clippingPlanes: [] }));
      const pa = V3(gy, sa.up[0][0], za); box.position.set(pa[0], pa[1], pa[2]); box.userData = { kind: "point", y: gy, base: pa }; extras.add(box);
    }
    // fittings (green) and the symmetry plane
    for (const ix of [iSp, m]) {
      const sc = W.section(P.fittingY, [ix === iSp ? P.sparX : P.falseSparX]);
      const h = sc.up[0][1] - sc.lo[0][1];
      const fit = new THREE.Mesh(new THREE.BoxGeometry(0.04, h * 0.9, 0.06), new THREE.MeshPhongMaterial({ color: 0x33c587, clippingPlanes: [] }));
      const p = V3(P.fittingY, sc.up[0][0], 0.5 * (sc.up[0][1] + sc.lo[0][1])); fit.position.set(p[0], p[1], p[2]); fit.userData = { part: "fittings" }; extras.add(fit);
    }
    const sym = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.2), new THREE.MeshBasicMaterial({ color: 0x33c587, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    sym.rotation.y = Math.PI / 2; sym.position.set(0, 0, 1.1); sym.userData = { part: "fittings" }; extras.add(sym);
    // lift arrows
    const arrows = new THREE.Group(); arrows.name = "arrows";
    const skins = new THREE.Group(); skins.name = "skins"; skins.add(upper, lower);
    model.add(skins, structure, ribs, ghost, extras, arrows);
    modelBuilt = true;
    rebuildMirror(); buildArrows(); updateModel(); applyShow(); applyClip();
    if (!viewSet) { setView("iso"); viewSet = true; }
  }
  let mirrorGroup = null;
  function rebuildMirror() {
    if (mirrorGroup) { world.remove(mirrorGroup); mirrorGroup = null; }
    if (!MS.mirror || !model) return;
    mirrorGroup = new THREE.Group(); mirrorGroup.scale.x = -1;
    model.children.forEach((g) => { if (g.name !== "arrows") mirrorGroup.add(g.clone(true)); });
    world.add(mirrorGroup);
  }
  function buildArrows() {
    const g = model && model.getObjectByName("arrows"); if (!g) return;
    while (g.children.length) g.remove(g.children[0]);
    if (!R || !MS.arrows) return;
    if(R.input.customLoads!=null){
      const lines=R.input.customLoads.filter(p=>p.kind!=='point');
      const samples=p=>p.kind==='table'?p.points.map(r=>r[0]):E.linspace(p.start,p.end,25);
      const qAt=(p,y)=>R.n*(p.kind==='distributed'?p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start):LoadProfiles.valueAt(p,y));
      const common=Math.max(...lines.flatMap(p=>samples(p).map(y=>Math.abs(qAt(p,y)))),1e-30);
      for(const p of R.input.customLoads){
        const ys=p.kind==='point'?[p.position]:samples(p),denom=p.kind==='point'?1:MS.lineArrowScale==='independent'?Math.max(...ys.map(y=>Math.abs(qAt(p,y))),1e-30):common;
        for(const y of ys){
          const force=p.kind==='point'?R.n*p.force:qAt(p,y);if(!force)continue;
          const len=p.kind==='point'?.35:.45*Math.abs(force)/denom;if(len<1e-6)continue;
          const sc=R.wing.section(y,[p.kind==='table'?LoadProfiles.fractionAt(p,y):p.fraction]),base=V3(y,sc.up[0][0],force>0?sc.up[0][1]:sc.lo[0][1]);
          const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,Math.sign(force),0),new THREE.Vector3(...base),len,0xd25ad6,Math.min(.06,len*.3),Math.min(.035,len*.2));arrow.userData={kind:'arrow',y,base};g.add(arrow);
        }
      }
      return;
    }
    const W = R.wing, ys = E.linspace(0.1, W.b2 - 0.15, 16), lmax = Math.max(...R.grid.lift.map(Math.abs)) || 1;
    for (const y of ys) {
      const l = R.perG.lift(y) * R.n, len = (0.55 * Math.abs(l)) / lmax;
      if (len < 0.02) continue;
      const sc = W.section(y, [R.P.aircraft.xcp]), base = V3(y, sc.up[0][0], l > 0 ? sc.up[0][1] : sc.lo[0][1]);
      const dir = new THREE.Vector3(0, Math.sign(l), 0);
      const a = new THREE.ArrowHelper(dir, new THREE.Vector3(base[0], base[1], base[2]), len, 0xd25ad6, 0.06, 0.035); a.userData = { kind: "arrow", y, base };
      g.add(a);
    }
  }

  // displacement at a station: bending + shear deflection and nose-up twist about the shear centre
  function dispAt(y) {
    const st = R.stations, n = st.length;
    if (y >= st[n - 1].y) { const s = st[n - 1]; return { w: s.w + s.slope * (y - s.y), tw: s.twist, xsc: R.wing.S_LE(s.y) + s.xsc * s.chord }; }
    let i = 0; while (i < n - 2 && st[i + 1].y < y) i++;
    const a = st[i], b = st[i + 1], t = (y - a.y) / (b.y - a.y || 1);
    return { w: a.w + t * (b.w - a.w), tw: a.twist + t * (b.twist - a.twist), xsc: R.wing.S_LE(y) + (a.xsc + t * (b.xsc - a.xsc)) * R.wing.chord(y) };
  }
  function deformScale() {
    if (!R) return 0;
    const tip = Math.abs(R.tip.wMax);
    if (!(tip > 1e-9)) return 0;
    return MS.deformed ? (MS.scale * 0.28) / tip : 0;
  }
  let modeT = 0;
  function modeDisp(y, phase) {
    const f = R.fem, k = MS.mode.index, bend = MS.mode.kind === "bending";
    const shape = bend ? f.bendingModes[k] : f.torsionModes[k];
    const v = y <= f.y[0] ? 0 : E.interp(Math.min(y, f.y[f.y.length - 1]), f.y, shape) * phase;
    const xsc = R.wing.S_LE(y) + E.interp(Math.min(y, R.stations[R.stations.length - 1].y), R.stations.map((s) => s.y), R.stations.map((s) => s.xsc)) * R.wing.chord(y);
    return bend ? { w: 0.3 * v, tw: 0, xsc } : { w: 0, tw: 0.25 * v, xsc };
  }
  function deformAll(dfn) {
    if (!model) return;
    const apply = (mesh) => {
      const u = mesh.userData; if (!u || !u.base) return;
      const pos = mesh.geometry.attributes.position, b = u.base;
      if (u.kind === "point") { const d = dfn(u.y); mesh.position.set(b[0], b[1] + d.w + d.tw * (d.xsc - (b[2] + ORIGIN[0])), b[2]); return; }
      for (let i = 0; i < pos.count; i++) {
        const y = b[3 * i], Sx = b[3 * i + 2] + ORIGIN[0], d = dfn(y);
        pos.array[3 * i + 1] = b[3 * i + 1] + d.w + d.tw * (d.xsc - Sx);
      }
      pos.needsUpdate = true; mesh.geometry.computeVertexNormals();
    };
    model.traverse((o) => { if (o.isMesh) apply(o); });
    const ar = model.getObjectByName("arrows");
    if (ar) ar.children.forEach((a) => { const d = dfn(a.userData.y); a.position.set(a.userData.base[0], a.userData.base[1] + d.w, a.userData.base[2]); });
  }
  function animateMode(t) {
    if (stale || running) return;
    const ph = Math.sin(t / 420);
    deformAll((y) => modeDisp(y, ph));
  }

  // ------------------------------------------------------------------ colour fields
  function stationCheck(y) {
    if (!R || !R.checks.length || y < R.P.fittingY) return null;
    return R.checks.reduce((b, c) => (Math.abs(c.y - y) < Math.abs(b.y - y) ? c : b));
  }
  function wallTau(j) {
    const s = R.stations[j], sec = R.sections[j], m = sec.m, tu = new Array(m).fill(NaN), tl = new Array(m).fill(NaN);
    sec.walls.forEach((w, q) => { if (w.surf === "u") tu[w.i] = s.tau[q]; else if (w.surf === "l") tl[w.i] = s.tau[q]; });
    return { tu, tl };
  }
  let tauCache = null;
  function fieldRange() {
    const st = R.stations, p = MS.plot;
    if (p === "sigma") { const m = Math.max(...st.map((s) => Math.max(...s.sUp.map(Math.abs), ...s.sLo.map(Math.abs), Math.abs(s.boomU), Math.abs(s.boomL)))); return [-m, m]; }
    if (p === "tau") return [0, Math.max(...st.map((s) => Math.max(s.skinTauMax, Math.abs(s.tauWeb), Math.abs(s.tauFS))))];
    if (p === "vm") return [0, Math.max(...st.map((s) => Math.max(s.skinVM, Math.abs(s.boomU), Math.abs(s.boomL))))];
    if (p === "disp") return [0, Math.abs(R.tip.wMax) * 1.02];
    if (p === "buckle") return [0, Math.max(R.nUlt, 2 * Math.abs(R.n))];
    return [0, 1];
  }
  function valueFor(mesh, i) {
    const u = mesh.userData, j = u.vj[i], k = u.vk[i], s = R.stations[j], sec = R.sections[j], p = MS.plot;
    const kind = u.kind;
    const tauW = () => { const t = tauCache[j]; if (kind === "skinU") { const a = t.tu[k - 1], b = t.tu[k]; return isFinite(a) && isFinite(b) ? 0.5 * (Math.abs(a) + Math.abs(b)) : Math.abs(isFinite(a) ? a : b); } const a = t.tl[k - 1], b = t.tl[k]; const v = [a, b].filter(isFinite).map(Math.abs); return v.length ? v.reduce((x, y) => x + y) / v.length : NaN; };
    const sig = () => {
      if (kind === "skinU") return s.sUp[k];
      if (kind === "skinL") return s.sLo[k];
      if (kind === "web" || kind === "fs") { const ix = kind === "web" ? sec.iSp : sec.m, t = k / (u.nP - 1); return s.sLo[ix] + t * (s.sUp[ix] - s.sLo[ix]); }
      if (kind === "boomU") return s.boomU; if (kind === "boomL") return s.boomL;
      if (kind === "strU") return s.strU[u.q]; if (kind === "strL") return s.strL[u.q];
      return NaN;
    };
    const tau = () => (kind === "skinU" || kind === "skinL" ? tauW() : kind === "web" ? Math.abs(s.tauWeb) : kind === "fs" ? Math.abs(s.tauFS) : NaN);
    if (p === "sigma") return sig();
    if (p === "tau") return tau();
    if (p === "vm") { const a = sig(), b = tau(); return Math.sqrt(a * a + 3 * (isFinite(b) ? b * b : 0)); }
    if (p === "disp") { const d = dispAt(s.y); return Math.abs(d.w + d.tw * (d.xsc - u.vS[i])); }
    if (p === "buckle") {
      const c = stationCheck(s.y); if (!c) return NaN;
      const side = R.n >= 0 ? "pos" : "neg";
      if (kind === "skinU" || kind === "skinL") { const x = sec.x[k], sd = kind === "skinU" ? "u" : "l"; const pn = c.panels.find((q) => q.side === sd && x >= q.x0 - 1e-9 && x <= q.x1 + 1e-9); return pn ? pn[side] : NaN; }
      if (kind === "web") return c.web.n_buckle;
      if (kind === "strU" || kind === "strL") return c[side] ? c[side].n_stringer_cripple : NaN;
      if (kind === "boomU" || kind === "boomL") return c[side] ? c[side].n_boom_yield : NaN;
      return NaN;
    }
    return NaN;
  }
  const PART_COL = { skinU: [0.79, 0.83, 0.87], skinL: [0.74, 0.78, 0.83], web: [0.23, 0.56, 0.86], fs: [0.33, 0.62, 0.88], boomU: [0.89, 0.6, 0.29], boomL: [0.89, 0.6, 0.29], strU: [0.55, 0.78, 0.4], strL: [0.55, 0.78, 0.4], tank: [0.2, 0.5, 0.8] };
  function colourAll() {
    if (!model || !R) return;
    tauCache = R.stations.map((_, j) => wallTau(j));
    const [lo, hi] = fieldRange(), p = MS.plot;
    model.traverse((o) => {
      if (!o.isMesh || !o.userData.vj || !o.geometry.attributes.color) return;
      const col = o.geometry.attributes.color, u = o.userData;
      for (let i = 0; i < col.count; i++) {
        let c;
        if (stale || p === "model" || p === "mode") c = PART_COL[u.kind] || [0.8, 0.8, 0.8];
        else {
          const v = valueFor(o, i);
          if (!isFinite(v)) c = [0.55, 0.58, 0.62];
          else if (p === "sigma") c = diverging(v / (hi || 1));
          else if (p === "buckle") c = margin(Math.abs(v / Math.abs(R.n || 1)) / 3);
          else c = rainbow((v - lo) / (hi - lo || 1));
        }
        col.array[3 * i] = c[0]; col.array[3 * i + 1] = c[1]; col.array[3 * i + 2] = c[2];
      }
      col.needsUpdate = true;
    });
    renderLegend(lo, hi);
  }
  function renderLegend(lo, hi) {
    const p = MS.plot, L = $("#mLegend"), T = $("#mLegendTitle"), info = $("#mPlotinfo");
    L.hidden = false;
    const title = { sigma: "Spanwise normal stress σ (MPa) · compression blue", tau: "Shear stress |τ| in skins and webs (MPa)", vm: "Von Mises stress (MPa)", disp: "Vertical displacement (mm)", buckle: "Buckling load factor ÷ current n (red < 1: buckled)", model: "", mode: "" }[p];
    T.textContent = title;
    if (p === "model" || p === "mode") { L.innerHTML = ""; }
    else {
      const N = 7, cols = Array.from({ length: 24 }, (_, i) => { const t = 1 - i / 23; const c = p === "sigma" ? diverging(2 * t - 1) : p === "buckle" ? margin(t) : rainbow(t); return `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`; });
      const fmt = (v) => (p === "disp" ? nf(v * 1e3, 2) : p === "buckle" ? nf(v, 2) : MPa(v, 1));
      const ticks = p === "buckle" ? [3, 2, 1, 0].map((v) => (v === 3 ? "≥ 3" : String(v))) : Array.from({ length: N }, (_, i) => fmt(hi - ((hi - lo) * i) / (N - 1)));
      L.innerHTML = `<div class="bar-c" style="background:linear-gradient(${cols.join(",")})"></div><div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>`;
    }
    if (R) info.innerHTML = `<b>${R.input.customLoads!=null?'Custom load multiplier':'Load factor'}</b> ${sgn(R.n, 1)} ${R.input.customLoads!=null?'×':'g'} &nbsp; <b>tip</b> ${nf(R.tip.wMax * 1e3, 1)} mm &nbsp; <b>twist</b> ${sgn(R.tip.twistDeg, 2)}°<br><b>deformation shown</b> ×${nf(deformScale(), 0)}`;
  }
  function updateModel() {
    if (!model || !R) return;
    if (stale) {
      colourAll(); deformAll(() => ({ w: 0, tw: 0, xsc: 0 }));
      const arrows = model.getObjectByName('arrows'); if (arrows) arrows.visible = false;
      $('#mLegend').hidden = true;
      $('#mLegendTitle').textContent = 'Inputs changed · analysis pending';
      $('#mPlotinfo').textContent = 'Previous structure shown undeformed. D.520 updates automatically after valid edits; results are pending.';
      return;
    }
    const arrows = model.getObjectByName('arrows'); if (arrows) arrows.visible = true;
    colourAll();
    if (MS.plot !== "mode") deformAll((y) => { const d = dispAt(y), k = deformScale(); return { w: d.w * k, tw: d.tw * k, xsc: d.xsc }; });
    buildArrows();
  }
  // ------------------------------------------------------------------ part display (visual only)
  // Only parts that buildModel draws can be toggled. Hiding one never changes the inputs, the solver or any result.
  const PARTS = [["skin", "Skin (upper and lower)", "#c9d4de"], ["mainSpar", "Main (front) spar: web + booms", "#3b8fdb"], ["falseSpar", "False (rear) spar web", "#8ab8ea"], ["ribs", "Ribs", "#ffcc4d"],
    ["stringers", "Blade stringers", "#8cc766"], ["trailing", "Trailing edge and tip cap (non-structural)", "#9fb2c4"], ["equipment", "Fuel tank, guns, ammunition (mass only)", "#3b82c4"], ["fittings", "Fuselage fittings, symmetry plane", "#33c587"]];
  const PART_OF = { skinU: "skin", skinL: "skin", web: "mainSpar", boomU: "mainSpar", boomL: "mainSpar", fs: "falseSpar", strU: "stringers", strL: "stringers", rib: "ribs", ghost: "trailing", tank: "equipment", point: "equipment" };
  const SHOW_PRESETS = {
    all: { skin: "opaque", parts: { skin: true, mainSpar: true, falseSpar: true, ribs: true, stringers: true, trailing: true, equipment: true, fittings: true } },
    inside: { skin: "see-through", parts: { skin: true, mainSpar: true, falseSpar: true, ribs: true, stringers: true, trailing: false, equipment: true, fittings: true } },
    frame: { skin: "see-through", parts: { skin: false, mainSpar: true, falseSpar: true, ribs: true, stringers: true, trailing: false, equipment: false, fittings: true } },
  };
  const VIEW = { preset: null, skin: "see-through", parts: { ...SHOW_PRESETS.inside.parts } };
  const partOf = (o) => (o.userData && (o.userData.part || PART_OF[o.userData.kind])) || null;
  $("#mParts").innerHTML = PARTS.map(([k, label, colour]) => `<button type="button" data-mpart="${k}" aria-pressed="true"><i style="background:${colour}"></i><span>${k === "ribs" ? `Ribs (${E.D520.ribs.length})` : k === "stringers" ? `Blade stringers (${E.D520.stringer.x.length} per surface)` : label}</span></button>`).join("");
  function applyShow() {
    if (SHOW_PRESETS[MS.show] && VIEW.preset !== MS.show) { VIEW.preset = MS.show; VIEW.skin = SHOW_PRESETS[MS.show].skin; Object.assign(VIEW.parts, SHOW_PRESETS[MS.show].parts); }
    $$("[data-mshow]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mshow === VIEW.preset)));
    $$("[data-mskin]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mskin === VIEW.skin)));
    $$("[data-mpart]").forEach((b) => b.setAttribute("aria-pressed", String(VIEW.parts[b.dataset.mpart])));
    if (!model) return;
    for (const name of ["skins", "structure", "ribs", "ghost", "extras"]) { const grp = model.getObjectByName(name); if (grp) grp.visible = true; }
    model.traverse((o) => {
      const part = o.isMesh ? partOf(o) : null;
      if (!part) return;
      o.visible = !!VIEW.parts[part] && !(VIEW.skin === "cutaway" && o.userData.kind === "skinU");
    });
    const see = VIEW.skin === "see-through";
    skinMats.forEach((m) => { m.transparent = true; m.opacity = see ? 0.16 : 1; m.depthWrite = !see; m.needsUpdate = true; });
    if (MS.mirror) rebuildMirror();
  }
  function setPart(part, on) { VIEW.parts[part] = on; VIEW.preset = "custom"; MS.show = "custom"; applyShow(); }
  $$("[data-mpart]").forEach((b) => b.addEventListener("click", () => setPart(b.dataset.mpart, !VIEW.parts[b.dataset.mpart])));
  $$("[data-mskin]").forEach((b) => b.addEventListener("click", () => { VIEW.skin = b.dataset.mskin; setPart("skin", true); }));
  // Visible / total meshes of each part (tests and the study-file module read this; display only).
  function partVisibility() {
    const out = Object.fromEntries(PARTS.map(([k]) => [k, { visible: 0, total: 0 }]));
    if (model) model.traverse((o) => { const part = o.isMesh ? partOf(o) : null; if (!part) return; out[part].total++; if (o.visible && o.parent && o.parent.visible) out[part].visible++; });
    return out;
  }
  // Spar labels in the view: placed on the upper surface at the spar chord positions, following the deformed shape.
  function positionPartLabels() {
    const box = $("#mPartLabels");
    if (!box || !model || !R || !camera) return;
    const cv = $("#mgl"), W = R.wing, P = R.P, k = MS.plot === "mode" ? 0 : deformScale();
    for (const lab of box.children) {
      const part = lab.dataset.mlabel, x = part === "mainSpar" ? P.sparX : P.falseSparX, y = part === "mainSpar" ? 2.2 : 3.4;
      const top = W.section(y, [x]).up[0], d = dispAt(y);
      const v = new THREE.Vector3(...V3(y, top[0], top[1] + k * (d.w + d.tw * (d.xsc - top[0])))).project(camera);
      const show = !!VIEW.parts[part] && v.z > -1 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      lab.hidden = !show;
      if (show) { lab.style.left = `${((v.x + 1) * cv.clientWidth) / 2}px`; lab.style.top = `${((1 - v.y) * cv.clientHeight) / 2}px`; }
    }
  }
  function applyClip() {
    if (!model) return;
    clipPlane.constant = MS.clipY; clipPlane.normal.set(-1, 0, 0);
    model.traverse((o) => { if (o.material) o.material.clippingPlanes = MS.clip ? [clipPlane] : []; if (o.material) o.material.needsUpdate = true; });
  }
  function setView(v) {
    if (!camera) return;
    const both = MS.mirror, cx = both ? 0 : 2.55, k = both ? 1.75 : 1;
    const c = new THREE.Vector3(cx, 0.1, 1.0);
    const pos = { iso: [cx + 5.05 * k, 3.6 * k, 1 + 4.8 * k], plan: [cx, 8.5 * k, 1.05], front: [cx, 0.45, 1 - 7.8 * k], root: [-4.2, 0.9, 1.1] }[v] || [cx + 5.05 * k, 3.6 * k, 1 + 4.8 * k];
    camera.position.set(pos[0], pos[1], pos[2]); controls.target.copy(c);
    if (v === "plan") camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
    camera.lookAt(c); controls.update();
    controls.minDistance = 0.3; controls.maxDistance = 60;
    placeAtFit(false);
    if (v === "iso") resetDist = camera.position.distanceTo(controls.target);
    renderReadout(true);
  }
  // Zoom moves the camera toward or away from the orbit target; it never scales the wing (see the readout).
  let resetDist = 0, readKey = "";
  // Fit to the undeformed skin outline (both halves when "Both wings" is on), not to a bounding box.
  function fitPoints() {
    const pts = [], skins = model && model.getObjectByName("skins");
    if (skins) for (const m of skins.children) { const b = m.userData.base; if (!b) continue; for (let i = 0; i < b.length; i += 3 * 7) { pts.push(new THREE.Vector3(b[i], b[i + 1], b[i + 2])); if (MS.mirror) pts.push(new THREE.Vector3(-b[i], b[i + 1], b[i + 2])); } }
    return pts;
  }
  function placeAtFit(retarget) {
    const pts = fitPoints();
    if (!pts.length) return;
    if (retarget) { const centre = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()); camera.position.add(centre.clone().sub(controls.target)); controls.target.copy(centre); }
    camera.updateMatrixWorld();
    const d0 = camera.position.distanceTo(controls.target), tanV = Math.tan((camera.fov * Math.PI) / 360), tanH = tanV * Math.max(camera.aspect || 1, 0.2), m = 0.9;
    let need = 0;
    for (const p of pts) {
      const q = p.clone().applyMatrix4(camera.matrixWorldInverse);
      need = Math.max(need, d0 + q.z + Math.max(Math.abs(q.x) / (m * tanH), Math.abs(q.y) / (m * tanV)));
    }
    const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, need));
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).add(dir.multiplyScalar(d));
    controls.update();
  }
  function zoomBy(f) {
    if (!camera) return;
    const off = camera.position.clone().sub(controls.target);
    off.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * f)));
    camera.position.copy(controls.target).add(off); controls.update(); renderReadout(true);
  }
  function renderReadout(force) {
    if (!camera || !R) return;
    const W = R.wing, dist = camera.position.distanceTo(controls.target), h = $("#mgl").clientHeight;
    const key = [dist.toFixed(4), h].join();
    if (!force && key === readKey) return;
    readKey = key;
    const pxPerM = h / 2 / (dist * Math.tan((camera.fov * Math.PI) / 360));
    $("#mViewReadout").dataset.distance = dist.toFixed(4);
    $("#mViewDims").innerHTML = `<b>View zoom only.</b> Actual size of the modelled half wing: half-span <b>${nf(W.b2, 2)} m</b> (structure to rib 1 at ${nf(R.P.ribs.at(-1), 2)} m), root chord <b>${nf(W.chord(0), 2)} m</b>, tip chord <b>${nf(R.P.planform.ct, 2)} m</b>.`;
    const nice = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5].find((v) => v * pxPerM >= 48) || 5, px = isFinite(pxPerM) && pxPerM > 0 ? Math.min(150, nice * pxPerM) : 0;
    $("#mScaleBar").style.width = `${Math.round(px)}px`;
    $("#mScaleText").textContent = px ? (nice < 1 ? `${nice * 100} cm` : `${nice} m`) : "–";
    $("#mZoomText").textContent = `Zoom ×${resetDist ? nf(resetDist / dist, 2) : "1.00"} relative to Reset view. The scale bar holds at the centre of the view; in perspective, nearer parts look larger.`;
  }

  // ------------------------------------------------------------------ inventory & sources
  // Counts and stations come from the engine's D.520 data; each item carries the status of its row in
  // E.D520.sources. "Modelled in this app" is kept apart from "documented in the 1940 manual": only PRINTED
  // and SCALED rows are manual values; EXTERNAL is an outside reference, GUESS an assumption, and an item
  // with no row in the source table is reported as such (an assumption of this model), never as history.
  const STATUS = { PRINTED: "printed in the manual", SCALED: "measured on a manual plate", EXTERNAL: "outside reference", GUESS: "assumption", UNLISTED: "not in the source table" };
  function sourceRow(re) { const row = E.D520.sources.find(([item]) => re.test(item)); return row ? { item: row[0], text: row[1], tags: [...new Set(row[1].match(/\b(PRINTED|SCALED|EXTERNAL|GUESS)\b/g) || [])] } : null; }
  const unlisted = (text) => ({ item: "", text, tags: ["UNLISTED"] });
  function inventoryRows() {
    const P = E.D520, W = R ? R.wing : E.makeWing(P), zones = R ? R.zones : E.boomZones(P, W), sc = MS.input.scales, mm = (v, k = 1) => nf(v * 1e3 * k, 1);
    const ribsLine = P.ribs.map((v) => nf(v, 2)).join(", ");
    // Direct-stress items of the solved root section, when there is one: booms and stringers as the solver sees them.
    const items = R && R.sections[0] && R.sections[0].items, nItems = (kind, fallback) => (items ? items.filter((it) => it.kind === kind).length : fallback);
    const nBooms = nItems("boom", 2), nStringers = nItems("stringer", 2 * P.stringer.x.length) / 2;
    return [
      { key: "planform", item: "Planform", count: null, modeled: `half-span ${nf(W.b2, 2)} m (structure to rib 1 at y = ${nf(P.ribs.at(-1), 2)} m), root chord ${nf(W.chord(0), 2)} m, tip chord ${nf(P.planform.ct, 2)} m`, sources: [sourceRow(/^Span/)] },
      { key: "ribs", item: "Ribs", count: P.ribs.length, modeled: `${P.ribs.length} pressed ribs at y = ${ribsLine} m; ${mm(P.rib.t)} mm sheet, ${mm(P.rib.tKink)} mm at the kink ribs (y = ${P.kinkRibs.map((v) => nf(v, 2)).join(" and ")} m); the root rib's nose is cut by the wheel well`, sources: [sourceRow(/^Rib stations/)] },
      { key: "mainSpar", item: "Main (front) spar", count: 1, modeled: `1 I-spar at ${P.sparX}c: a web (gauge by zone) and 2 booms`, sources: [sourceRow(/^Main spar/)] },
      { key: "booms", item: "Main-spar booms (caps)", count: nBooms, modeled: `${nBooms} per section (upper and lower); root ${nf(P.boom.rootWidth * 1e3, 0)} × ${nf(P.boom.rootThickness * 1e3, 0)} mm, area ∝ M/h outboard: ${zones.map((z) => nf(z.area * 1e6 * sc.boom, 0)).join(", ")} mm² by zone`, sources: [sourceRow(/^Spar booms/)] },
      { key: "falseSpar", item: "False (rear) spar", count: 1, modeled: `1 web at ${P.falseSparX}c; no booms in this model`, sources: [sourceRow(/^Main spar/), sourceRow(/gauges/)] },
      { key: "stringers", item: "Blade stringers", count: nStringers, modeled: `${nStringers} per surface (${2 * nStringers} in all) at x/c ${P.stringer.x.join(", ")}, ${nf(P.stringer.h * 1e3, 0)} mm high`, sources: [unlisted("Stringer count and positions are not in the source table: an assumption of this model."), sourceRow(/gauges/)] },
      { key: "zones", item: "Gauge zones", count: P.zones.length, modeled: `${P.zones.length} zones, breaks at y = ${P.zones.slice(1).map((z) => nf(z[0], 2)).join(", ")} m; skin ${P.skin.map((v) => mm(v, sc.skin)).join(" / ")} mm, spar web ${P.web.map((v) => mm(v, sc.web)).join(" / ")} mm, false-spar web ${P.falseSpar.map((v) => mm(v, sc.web)).join(" / ")} mm, stringers ${P.stringer.t.map((v) => mm(v, sc.stringer)).join(" / ")} mm`, sources: [sourceRow(/gauges/)] },
      { key: "fittings", item: "Fuselage fittings (support)", count: null, modeled: `one support station at y = ${P.fittingY} m (drawn as one block on each spar); the fitting hardware is not modelled`, sources: [unlisted("Not in the source table. The Supports page of this app cites manual p.14 for the fitting arrangement.")] },
      { key: "wheelWell", item: "Wheel-well cut-out", count: null, modeled: `circular opening r = ${P.wheelWell.r} m centred at y = ${P.wheelWell.yc} m, ${P.wheelWell.xc}c; the nose cell is open there`, sources: [unlisted("Not in the source table: an assumption of this model.")] },
      { key: "equipment", item: "Equipment (mass only)", count: null, modeled: `fuel ${P.masses.fuel.volume} l between y = ${P.masses.fuel.y0} and ${P.masses.fuel.y1} m; ${P.masses.guns.y.length} guns and ${P.masses.ammo.rounds} rounds per gun at y = ${P.masses.guns.y.join(" and ")} m (unit masses ${P.masses.guns.mass} kg per gun, ${P.masses.ammo.roundMass} kg per round are model inputs)`, sources: [sourceRow(/^Fuel/)] },
      { key: "material", item: "Material", count: null, modeled: P.material.name, sources: [sourceRow(/duralumin properties/)] },
      { key: "aircraft", item: "Gross mass and load factors", count: null, modeled: `${P.aircraft.mass} kg; +${P.aircraft.nLimitPos} / ${P.aircraft.nLimitNeg} g limit, ×${P.aircraft.safetyFactor} ultimate`, sources: [sourceRow(/^Gross mass/), sourceRow(/^Load factors/)] },
    ];
  }
  // The verdict covers only what the source line(s) name; anything else in "Modelled in this app" is a model input.
  function documented(sources) {
    const tags = new Set(sources.filter(Boolean).flatMap((x) => x.tags));
    if (tags.has("PRINTED") || tags.has("SCALED")) return tags.has("GUESS") || tags.has("UNLISTED") ? "Partly: manual values combined with assumptions (see the source lines)" : "Yes, for the values named in the source line below";
    if (tags.has("EXTERNAL")) return tags.has("GUESS") ? "No: an outside reference and assumptions" : "No: an outside reference";
    return tags.has("GUESS") ? "No: an assumption of this model" : "Not stated in the source table";
  }
  function renderInventory() {
    const rows = inventoryRows();
    $("#mInventory").innerHTML = `<div class="mw-inv">
      <p class="note">What the beam/section model contains, counted from the engine's D.520 data, and where each number comes from. Status tags: ${Object.entries(STATUS).map(([k, v]) => `<span class="mw-tag ${k}">${k === "UNLISTED" ? "NOT LISTED" : k}</span>${v}`).join(" · ")}.</p>
      ${rows.map((r) => `<article data-minv="${r.key}"><h5>${r.item}${r.count != null ? ` <b>× <span data-minv-count="${r.key}">${r.count}</span></b>` : ""}</h5>
        <p><b>Modelled in this app:</b> ${r.modeled}</p>
        <p><b>Documented in the 1940 manual?</b> <span data-minv-doc="${r.key}">${documented(r.sources)}</span></p>
        <p class="src">${r.sources.filter(Boolean).map((x) => `${x.tags.map((t) => `<span class="mw-tag ${t}" data-minv-tag="${r.key}">${t === "UNLISTED" ? "NOT LISTED" : t}</span>`).join("")}${x.item ? `${x.item}: ` : ""}${x.text}`).join("<br>")}</p></article>`).join("")}
      <p class="note">A verdict covers only the values named in its source line; other numbers shown here are inputs of this model. Not modelled: rivets, the fitting hardware and the fuselage, rib stresses, shear lag and local load introduction (Method &amp; sources).</p></div>`;
    $("#mInvBadge").textContent = `${E.D520.ribs.length} ribs · 2 spars · ${E.D520.stringer.x.length}/surface stringers`;
  }
  // The input column sticks below the sticky D.520 navigation bar.
  const stickBelowNav = () => { const nav = $("#metalNav"); $("#metalApp").style.setProperty("--wl-top", `${Math.round(nav ? nav.getBoundingClientRect().height : 0) + 10}px`); };
  window.addEventListener("resize", stickBelowNav);
  if (window.ResizeObserver) new ResizeObserver(stickBelowNav).observe($("#metalNav"));
  // Read-only hooks for tests and the study-file module (display state only; results are MetalWingUI.result()).
  $("#mZoomIn").addEventListener("click", () => zoomBy(1 / 1.25));
  $("#mZoomOut").addEventListener("click", () => zoomBy(1.25));
  $("#mZoomFit").addEventListener("click", () => { if (!camera) return; placeAtFit(true); renderReadout(true); });
  $("#mZoomReset").addEventListener("click", () => setView("iso"));
  window.MetalWingView = {
    parts: partVisibility, display: () => ({ preset: VIEW.preset, skin: VIEW.skin, parts: { ...VIEW.parts } }), inventory: inventoryRows,
    camera: () => (camera ? { distance: camera.position.distanceTo(controls.target), resetDistance: resetDist } : null),
  };
  const ray = typeof THREE !== "undefined" ? new THREE.Raycaster() : null;
  function beginMetalSurfacePick(accept) {
    return WingLoadsUI.surfacePicker($('#mgl'),e=>{
      if(!R||!model||!ray||stale||running)return null;
      const r=$('#mgl').getBoundingClientRect(),v=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      ray.setFromCamera(v,camera);
      const targets=[];model.traverse(o=>{if(!o.isMesh||!['skinU','skinL'].includes(o.userData.kind))return;for(let p=o;p;p=p.parent)if(!p.visible)return;targets.push(o);});
      const h=ray.intersectObjects(targets,false).find(h=>!MS.clip||Math.abs(h.point.x)<=MS.clipY);
      if(!h||!h.face)return null;
      const pos=h.object.geometry.attributes.position,u=h.object.userData,tri=new THREE.Triangle(),bc=new THREE.Vector3(),local=h.object.worldToLocal(h.point.clone());
      tri.set(...[h.face.a,h.face.b,h.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(pos,i)));tri.getBarycoord(local,bc);
      return WingLoadsUI.surfaceSample([h.face.a,h.face.b,h.face.c].map(i=>({station:u.base[3*i],fraction:R.sections[u.vj[i]].x[u.vk[i]]})),[bc.x,bc.y,bc.z]);
    },()=>{
      if(!R||!model||stale||running||lastError)throw new Error('Solve valid D.520 inputs before picking on its skin.');
      MS.deformed=false;$('#mDef').setAttribute('aria-pressed','false');setPlot('model');updateModel();
      const enabled=controls.enabled;controls.enabled=false;$('#mgl').scrollIntoView({block:'center'});
      return ()=>{controls.enabled=enabled;};
    })(accept);
  }
  function onProbe(e) {
    if (!R || !model || !ray) return;
    const r = e.currentTarget.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const targets = []; model.traverse((o) => { if (o.isMesh && o.userData.vj && o.visible && o.parent.visible) targets.push(o); });
    const hit = ray.intersectObjects(targets, false)[0], pr = $("#mProbe");
    if (!hit) { pr.hidden = true; return; }
    const o = hit.object, i = hit.face.a, u = o.userData, j = u.vj[i], s = R.stations[j], sec = R.sections[j];
    const names = { skinU: "Upper skin", skinL: "Lower skin", web: "Spar web", fs: "False-spar web", boomU: "Upper spar boom", boomL: "Lower spar boom", strU: "Upper stringer", strL: "Lower stringer", tank: "Fuel tank (mass only)" };
    const xc = u.vk && (u.kind === "skinU" || u.kind === "skinL") ? sec.x[u.vk[i]] : null;
    const val = MS.plot === "model" || MS.plot === "mode" ? "" : `<br>${$("#mLegendTitle").textContent.split(" (")[0]}: <b>${MS.plot === "disp" ? nf(valueFor(o, i) * 1e3, 2) + " mm" : MS.plot === "buckle" ? nf(valueFor(o, i), 2) + " g" : MPa(valueFor(o, i), 2) + " MPa"}</b>`;
    pr.innerHTML = `<b>${names[u.kind] || u.kind}</b><br>y = ${nf(s.y, 3)} m${xc != null ? ` · x/c = ${nf(xc, 3)}` : ""} · zone ${s.zone}${val}`;
    pr.style.left = e.clientX - $("#mView").getBoundingClientRect().left + "px"; pr.style.top = e.clientY - $("#mView").getBoundingClientRect().top + "px"; pr.hidden = false;
  }

  // ------------------------------------------------------------------ charts
  function niceTicks(min, max, n = 4) { if (min === max) { min -= 1; max += 1; } const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5) || mag * 10; const a = Math.floor(min / step) * step, out = []; for (let v = a; v <= max + step * 0.5; v += step) out.push(+v.toFixed(10)); return out; }
  const COLS = ["#4ea6ff", "#f08a4b", "#33c587", "#c37cf2", "#efb03b", "#f05b6c"];
  function chart(title, unit, series, opts = {}) {
    const W = 360, H = 190, L = 48, Rr = 10, T = 10, B = 30;
    const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y).filter((v) => Number.isFinite(v));
    let x0 = opts.xmin ?? Math.min(...xs), x1 = opts.xmax ?? Math.max(...xs), y0 = opts.ymin ?? Math.min(0, ...ys), y1 = opts.ymax ?? Math.max(0, ...ys);
    (opts.hlines || []).forEach((h) => { y0 = Math.min(y0, h.y); y1 = Math.max(y1, h.y); });
    const yt = niceTicks(y0, y1), xt = niceTicks(x0, x1, 5);
    y0 = Math.min(y0, yt[0]); y1 = Math.max(y1, yt[yt.length - 1]);
    const X = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - Rr), Y = (v) => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
    let svg = yt.map((v) => `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${Y(v) + 3}" text-anchor="end">${+v.toPrecision(4)}</text>`).join("");
    svg += xt.filter((v) => v >= x0 - 1e-9 && v <= x1 + 1e-9).map((v) => `<text x="${X(v)}" y="${H - B + 13}" text-anchor="middle">${+v.toPrecision(3)}</text>`).join("");
    svg += `<text x="${(L + W - Rr) / 2}" y="${H - 3}" text-anchor="middle">${opts.xlabel || "span station y (m)"}</text>`;
    (opts.hlines || []).forEach((h) => (svg += `<line x1="${L}" x2="${W - Rr}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="${h.color || "var(--muted)"}" stroke-dasharray="4 3"/><text x="${W - Rr - 2}" y="${Y(h.y) - 3}" text-anchor="end">${h.label || ""}</text>`));
    series.forEach((s, k) => {
      const c = s.color || COLS[k % COLS.length];
      if (s.markers) svg += s.x.map((x, i) => (Number.isFinite(s.y[i]) ? `<circle cx="${X(x)}" cy="${Y(s.y[i])}" r="3.6" fill="var(--panel)" stroke="${c}" stroke-width="2"/>` : "")).join("");
      else { const pts = s.x.map((x, i) => (Number.isFinite(s.y[i]) && s.y[i] <= (opts.ymax ?? Infinity) * 1.02 ? `${X(x).toFixed(1)},${Y(s.y[i]).toFixed(1)}` : null)).filter(Boolean).join(" "); svg += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""}/>`; }
    });
    const legend = series.filter((s) => s.name).map((s, k) => `<span style="color:${s.color || COLS[series.indexOf(s) % COLS.length]}">${s.markers ? "○" : "—"} ${s.name}</span>`).join(" &nbsp;");
    return `<div class="chart"><h4>${title}<span>${unit}</span></h4><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${svg}</svg><p class="note">${legend}</p></div>`;
  }

  // ------------------------------------------------------------------ tabs
  const TABS = ["start", "theory", "loads", "diagrams", "section", "strength", "compare", "modes", "method", "report"];
  let dirtyTabs = new Set();
  function renderAll() { renderTree(); renderPM(); dirtyTabs = new Set(TABS); renderTab(MS.tab); dirtyTabs.delete(MS.tab); if (MS.plot === "mode") renderModeSeg(); renderInventory(); renderLoadEditor(); }   // the load editor lives in the input column, whatever results tab is open
  function renderTab(t) {
    if (!R) return;
    ({ start: renderStart, theory: renderTheory, loads: renderLoads, diagrams: renderDiagrams, section: renderSection, strength: renderStrength, compare: renderCompare, modes: renderModes, method: renderMethod, report: renderReport })[t]();
    if(R.input.customLoads!=null&&['strength','diagrams','method','report'].includes(t)){
      if(!R.input.customLoads.length){$('#mtab-'+t).insertAdjacentHTML('afterbegin','<p class="callout"><b>No load defined.</b> Stresses, deflections and margins are zero or undefined until you apply a load (Loads tab).</p>');return;}
      const panel=$('#mtab-'+t);panel.insertAdjacentHTML('afterbegin','<p class="callout"><b>Custom load case:</b> capacity numbers are multipliers of the entered reference pattern, not flight g. Original flight-limit/FE references do not certify this case. Linear nominal beam stresses exclude local point-load contact stresses.</p>');
      if(t==='strength'){const walk=document.createTreeWalker(panel,4);while(walk.nextNode())walk.currentNode.textContent=walk.currentNode.textContent.replace(/\bg\b/g,'× reference');}
    }
  }
  function openTab(t) {
    MS.tab = t;
    $$("#mTabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mtab === t)));
    $$("#metalApp .tabpanel").forEach((p) => (p.hidden = p.id !== "mtab-" + t));
    if (dirtyTabs.has(t)) { renderTab(t); dirtyTabs.delete(t); }
  }
  function renderStart() {
    const g = governing(R), r = R, P = r.P;
    if(r.input.customLoads!=null&&!r.input.customLoads.length){$('#mtab-start').innerHTML=`<div class="mw-grid2"><article class="mw-story"><h2>The Dewoitine D.520 (1940) wing — opened without a load</h2>
      <p class="callout"><b>No load defined.</b> The structure is shown on its own: no lift, no weight or inertia relief and no custom force acts, so every reaction, stress, deflection and twist is zero. Natural frequencies do not need a load. Open <b>Loads</b> to enter your own loads, or press <b>Apply flight loading</b> there for the classic flight case (lift = n W shaped by the lifting line, inertia relief of the structure, fuel, guns and ammunition).</p>
      <p><b>Educational reconstruction, not an airworthiness assessment.</b> The D.520 wing is a stressed-skin duralumin structure: one I-section main spar at 37 % chord, a false spar at 73 %, 22 pressed ribs, a smooth skin and blade stringers, reconstructed from the scanned 1940 manual and labelled assumptions (see <b>Method &amp; sources</b>).</p>
      <h3>Try this</h3><ol><li>Apply flight loading in <b>Loads</b>, then switch the plot to <b>Spanwise σ</b>. Where is the boom stress highest?</li><li>Add one point force of 1000 N at y = 3 m and change only its chord position x/c. Read the torque about the shear centre in <b>Loads</b>.</li><li>Compare a uniform and an elliptic load with the same total force: which gives the larger moment at the fittings?</li></ol></article>
      <div><div class="mw-kpis"><div><span>Applied load</span><b>none</b><span>custom case with no entries</span></div><div><span>Half-wing structure</span><b>${nf(r.mass.structuralHalf, 0)} kg</b><span>shell model 116 kg</span></div>
      <div><span>First bending mode</span><b>${r.fem ? nf(r.fem.fBending[0], 1) : '–'} Hz</b><span>independent of the static load</span></div><div><span>First torsion mode</span><b>${r.fem ? nf(r.fem.fTorsion[0], 0) : '–'} Hz</b><span>fuselage held fixed</span></div></div></div></div>`;return;}
    if(r.input.customLoads!=null){$('#mtab-start').innerHTML=`<h2>D.520 custom-load experiment</h2><p class="callout">Same wing structure; ${r.input.customLoads.length} entered loads, multiplied by ${r.n}. This is not a flight load-factor case. Open Loads to edit positions and intensities, then compare stress, bending and torsion. Strength-table values labelled g in the historical flight pathway represent <b>multipliers of this custom reference load pattern</b> here, not flight g limits. A static load change does not alter linear natural frequencies.</p><p>Tip displacement: ${nf(r.tip.wMax*1000,3)} mm; twist: ${nf(r.tip.twistDeg,4)}°. Point/line loads are section resultants; local load-introduction stresses need shell/solid FE.</p>`;return;}
    const sk = r.failure.find((f) => f.key === "skinBuckle");
    $("#mtab-start").innerHTML = `<div class="mw-grid2"><article class="mw-story">
      <h2>From a printed wing to a real one: the Dewoitine D.520 (1940)</h2>
      <p class="callout"><b>Educational reconstruction, not an airworthiness assessment.</b> Geometry is manual-derived; gauges, boom taper, material allowables, gross mass and load requirements are assumed. Agreement with a supplied shell-model dataset checks consistency, not the strength of a surviving or historical aircraft.</p>
      <p>The D.520 was the best French fighter of 1940. Its wing is a classic <b>stressed-skin</b> metal structure: one I-section main spar at 37 % chord with heavy duralumin booms, a light false spar at 73 % carrying the flaps and ailerons, 22 pressed ribs, a smooth duralumin skin and blade stringers. Every dimension here comes from the scanned 1940 manual (<i>Notice descriptive</i>) or is labelled as an assumption in <b>Method &amp; sources</b>.</p>
      <p>This workspace uses the same chain of reasoning as the printed-wing lab, at full scale: <b>loads → shear, bending moment and torque → section properties → stresses → deflection and twist → stability and strength</b>. What is new is the thin-walled analysis of a real two-cell box (leading-edge nose cell + spar box), a tapered spar whose inclined booms carry part of the shear, skin buckling and the post-buckling strength that let 1940s designers use skins that wrinkle in flight.</p>
      <h3>Try this</h3>
      <ol><li>Press <b>+6 g limit</b> and switch the plot to <b>Spanwise σ</b>. Where is the boom stress highest, and why is it nearly constant from root to mid-span?</li>
      <li>Open <b>Section</b> and move the station. Find the shear centre and compare it with the 25 % chord where the lift acts. Which way does the wing twist?</li>
      <li>Switch the plot to <b>Buckling n</b>. Which skin panels buckle below 1 g? Then read <b>Strength &amp; stability</b>: why are buckling onset and final collapse different events, and what extra evidence would establish safety?</li>
      <li>In <b>Model &amp; solver</b>, untick the tapered-beam effect. What happens to the spar-web shear between ribs 21 and 16 (y = 0.70–1.50 m)?</li>
      <li>Open <b>Compare with shell FE</b>. Where does beam theory agree with the 41 066-element shell model, and where does it not?</li></ol>
      <p class="note">The complete aircraft (transcribed manual, parametric Blender model, CAD, ANSYS/NASTRAN/CalculiX decks) is in the course repository: <a href="${MODEL3D}" target="_blank" rel="noopener">3-D model viewer</a> · <a href="${REPO}" target="_blank" rel="noopener">files on GitHub</a>.</p>
    </article><div>
      <div class="mw-kpis">
        <div><span>Load factor</span><b>${sgn(r.n, 1)} g</b><span>limit +${P.aircraft.nLimitPos} / ${P.aircraft.nLimitNeg} g, ultimate ×${P.aircraft.safetyFactor}</span></div>
        <div><span>Tip deflection</span><b>${nf(r.tip.wMax * 1e3, 1)} mm</b><span>rib 1, y = 4.93 m</span></div>
        <div><span>Spar boom stress, max</span><b>${MPa(Math.max(...r.stations.map((s) => Math.max(Math.abs(s.boomU), Math.abs(s.boomL)))), 0)} MPa</b><span>yield ${MPa(P.material.Fty, 0)} MPa</span></div>
        <div><span>Half-wing structure</span><b>${nf(r.mass.structuralHalf, 0)} kg</b><span>shell model 116 kg</span></div>
      </div>
      <div class="callout"><h3>Verdict at the assumed requirement</h3>
        <p>${g ? `The weakest strength mode is <b>${g.name.toLowerCase()}</b> at <b>${nf(g.n, 1)} g</b> (${g.side === "pos" ? "positive" : "negative"} g, y = ${nf(g.y, 2)} m) against an ultimate requirement of ${nf(g.need, 1)} g: margin of safety ${sgn(g.n / g.need - 1, 2)}.` : ""}</p>
        <p>The leading-edge skin between ribs has no stringers. The simplified panel model predicts buckling at <b>${nf(sk.pos.n, 2)} g</b> (y = ${nf(sk.pos.y, 2)} m). The supplied shell eigenvalue estimate falls toward 2–3 g with refinement and is not converged. Some structures retain post-buckling capacity, but this does not prove elastic recovery or acceptable operation of this aircraft. Our effective-width calculation is an approximate section model.</p>
        <p>First bending frequency ${r.fem ? nf(r.fem.fBending[0], 1) : "–"} Hz, first torsion ${r.fem ? nf(r.fem.fTorsion[0], 0) : "–"} Hz (fuselage held fixed).</p>
        <p class="note">The load factors and gross mass are assumptions (the manual gives neither). All results scale linearly with n except the strength modes, which are reported as the load factor at which each happens.</p></div>
    </div></div>`;
  }
  function renderTheory() {
    const r = R, W = r.W, half = r.n * W / 2;
    $("#mtab-theory").innerHTML = `<article class="mw-story">
      <h2>Understand the wing before reading its colours</h2>
      <p>Learning goals: trace the load into the fuselage; distinguish force, moment, stress and displacement; explain why a light wing needs several kinds of member; and judge what this simplified solver can and cannot establish. Start at 1 g, make a prediction, change only one input, let it solve (or press <b>Solve</b>), and compare with your prediction.</p>
      <h3>1. Pressure becomes a structural load</h3>
      <p>Air pressure acts over the skin, not directly on an isolated spar. Integrating pressure around each airfoil section gives lift per unit span ℓ(y), in N/m. The structural problem replaces those many small pressures by an equivalent spanwise load and a torque. Here y is distance from the aircraft centreline toward the tip, x is chordwise, and z is upward.</p>
      <div class="mw-sec"><svg viewBox="0 0 900 225" role="img" aria-label="Load path: pressure on skin to ribs, skin stiffeners, spar and fuselage fittings">
        <defs><marker id="mTheoryArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>
        <g fill="var(--panel-2)" stroke="var(--line)"><rect x="15" y="55" width="150" height="80" rx="8"/><rect x="240" y="55" width="195" height="80" rx="8"/><rect x="510" y="55" width="165" height="80" rx="8"/><rect x="750" y="55" width="135" height="80" rx="8"/></g>
        <g fill="var(--fg)" text-anchor="middle" style="font-size:17px"><text x="90" y="85">Pressure on skin</text><text x="90" y="113">distributed load</text><text x="337" y="85">Ribs + stiffened skin</text><text x="337" y="113">local load transfer</text><text x="592" y="85">Spar + wing box</text><text x="592" y="113">V, M and T</text><text x="818" y="85">Fittings</text><text x="818" y="113">fuselage</text></g>
        <g stroke="var(--accent)" stroke-width="3" style="color:var(--accent)" marker-end="url(#mTheoryArrow)"><path d="M173 95H229"/><path d="M443 95H499"/><path d="M683 95H739"/></g>
        <text x="450" y="180" text-anchor="middle" style="font-size:16px">Conceptual path: members share loads; this is not an exclusive serial chain.</text>
        <text x="450" y="207" text-anchor="middle" style="font-size:16px">Skin also carries spanwise bending stress and closed-cell shear flow.</text>
      </svg></div>
      <h3>2. What does “6 g” mean?</h3>
      <p>The load factor n is total aerodynamic lift divided by aircraft weight W in this symmetric prescribed-load case: n = L/W. At 1 g, L = W; at 6 g, L = 6W. It is not a change in the value of gravity. A real manoeuvre also involves acceleration, trim and changing aerodynamic conditions; this app prescribes their equivalent load, not a flight trajectory.</p>
      <div class="mw-eq">W = mg &nbsp; · &nbsp; L = nW &nbsp; · &nbsp; L<sub>half</sub> = nW/2<br>Current study: W = ${nf(W/1000,2)} kN, n = ${sgn(r.n,1)}, L<sub>half</sub> = ${nf(half/1000,2)} kN.</div>
      <p><b>Inertia relief:</b> the wing itself, fuel and equipment have mass. Their inertial loads oppose lift in a positive-g manoeuvre, reducing net bending relative to “lift only”. With upward positive, the distributed net load is p(y) = ℓ(y) − n g m′(y), with additional concentrated loads −n g mᵢ at their stations. m′ means kg per metre. The solver includes these masses when inertia relief is enabled. Fuel can reduce static net bending while increasing mass and altering vibration; “more fuel is always safer” does not follow.</p>
      <h3>3. Make a cut: why the root carries a large moment</h3>
      <p>Imagine keeping only the wing outboard of a cut at y. At that cut, the remaining wing must supply shear V to balance the outboard force, bending moment M to balance its turning effect, and torque T to balance twisting. For a positive upward outboard load we use the following positive resultant magnitudes; the matching cut-face reactions act oppositely.</p>
      <div class="mw-eq">V(y) = ∫<sub>y</sub><sup>s</sup> p(η) dη + Σ<sub>yᵢ&gt;y</sub> Fᵢ<br>M(y) = ∫<sub>y</sub><sup>s</sup> p(η)(η − y) dη + Σ<sub>yᵢ&gt;y</sub> Fᵢ(yᵢ − y)<br>dV/dy = −p &nbsp; · &nbsp; dM/dy = −V &nbsp; · &nbsp; V(s) = M(s) = 0 for an unloaded free tip.</div>
      <p>η is just the integration position; s is the modelled tip. Multiply each small force p(η)dη by its distance η − y to obtain its small moment. Point loads produce jumps in V; M remains continuous unless an applied couple is present. The formulas above describe the outboard free body; inboard of the fuselage fittings, their reactions must also be included.</p>
      <p><b>Hand calculation:</b> for a uniform net load p₀ over a 2 m cantilever, V(0) = p₀s and M(0) = p₀s²/2. If p₀ = 100 N/m, V(0) = 200 N and M(0) = 200 N·m. The same total 200 N as a point load at the tip gives 400 N·m. Thus equal total lift does not imply equal root bending: where the force acts matters. A root-heavy triangular load with the same total force has its centroid at s/3 and gives 133.3 N·m.</p>
      <h3>4. Why skin, caps, webs, ribs and stringers are different</h3>
      <ul><li><b>Spar caps / booms:</b> large spanwise areas near the upper and lower surfaces form a tension–compression pair that resists bending. A simple estimate is cap force ≈ M/h, where h is their separation.</li>
      <li><b>Spar webs:</b> connect upper and lower regions and carry shear. An I-section needs both caps and web; a thin vertical plate alone is not the entire spar.</li>
      <li><b>Skin:</b> carries local pressure, shares spanwise normal stress and carries shear around closed cells. It is structural, not just a cover.</li>
      <li><b>Stringers:</b> spanwise stiffeners attached to the skin. They share axial load and divide a wide skin into narrower supported panels, delaying local buckling.</li>
      <li><b>Ribs:</b> chordwise frames at discrete span stations. They preserve section shape, support skin and stiffeners, and distribute concentrated loads. This beam model includes rib mass and panel spacing but does <b>not</b> independently solve rib stress or the benefit of arbitrary new rib layouts.</li></ul>
      <p>A closed wing box is formed by connected upper/lower skins and bounding webs; ribs frame it along the span. The D.520 idealisation has a nose cell and a spar-box cell where the geometry closes them. The wheel-well cut-out changes that topology. Do not assume that every wing has two identical full-height spars or that a visually hidden member is absent.</p>
      <h3>5. From moment to stress, and from stress to displacement</h3>
      <div class="mw-eq">Symmetric-section teaching case: σ = −M(z − z̄)/I &nbsp; · &nbsp; EI = bending stiffness<br>Curvature magnitude |κ| = |M|/(EI) &nbsp; · &nbsp; shear stress τ = q/t.</div>
      <p>σ is spanwise normal stress (Pa), z̄ is the neutral-axis height, I is second moment of area (m⁴), E is Young's modulus (Pa), q is shear flow (N/m), and t is wall thickness (m). Positive bending here usually compresses upper members and stretches lower members. The actual solver uses the unsymmetric section formula in <b>Method &amp; sources</b>, including I<sub>xz</sub>; the simple equation above is a teaching limit, not a replacement solver.</p>
      <p>Moment alone cannot tell you the maximum stress. The wing becomes thinner and its caps taper toward the tip: M decreases, but I and cap area also decrease. This is why stress need not peak exactly at the root. Moving material away from the neutral axis increases I; adding mass close to that axis is less efficient for bending. Integrating curvature gives slope and bending deflection. Web shear adds further deflection; the support and centre-section compliance determine the integration constants.</p>
      <h3>6. Why the wing twists</h3>
      <p>The <b>shear centre</b> is the load position that produces no twist for the local idealised section under transverse shear. It is not necessarily the area centroid or the mass centre. A force offset from it produces torque; aerodynamic section couples can contribute too. Torque accumulates from the outboard loads just as bending moment does.</p>
      <div class="mw-eq">Single closed cell, pure torque teaching case: q = T/(2A), τ = q/t<br>dθ/dy = T/(GJ), &nbsp; J = 4A² / ∮(ds/t).</div>
      <p>A is area enclosed by the wall midline, G is shear modulus, J is torsion constant (not generally the polar second moment), and θ is twist in radians. Two connected cells require torque equilibrium <b>and equal twist rate</b>; the app solves for their separate circulation flows. Tapered spar caps also carry vertical components of axial force, so the actual wall torque/shear can differ from the total section resultants. Use <b>Section</b> to compare them. A disconnected skin joint cannot be treated as an intact closed box.</p>
      <h3>7. Buckling, yielding, crippling and collapse are not synonyms</h3>
      <p><b>Yielding</b> is the onset of permanent material deformation. <b>Buckling</b> is loss of stability under compression or shear: a thin panel develops an out-of-plane wave, possibly below yield stress. <b>Crippling</b> is local failure of a compressed stiffener's walls. <b>Section collapse</b> here is a peak in the approximate moment–curvature response as load-carrying areas lose effectiveness.</p>
      <div class="mw-eq">Flat-panel teaching estimate: σ<sub>cr</sub> = [kπ²E / (12(1 − ν²))](t/b)²<br>Margin of safety = capacity/demand − 1.</div>
      <p>b is panel width between supports, ν is Poisson's ratio, and k depends on boundary conditions and aspect ratio. Doubling thickness gives four times the flat-panel estimate if everything else is unchanged; halving unsupported width does likewise. The app adds approximate curvature and combined compression–shear effects, so its final thresholds need not follow that simple scaling. After buckling, some supported skin remains effective, but this requires adequate stiffeners and connections; buckling is <b>not automatically safe</b>.</p>
      <p>Limit load is the assumed operating requirement; ultimate load applies the specified safety factor. Here those requirements are model inputs, not recovered historical certification limits. A higher section-collapse number does not excuse an earlier failing stringer, fitting or other check.</p>
      <h3>8. Modes are not a flutter simulation</h3>
      <div class="mw-eq">Free-vibration model: Kφ = ω²Mφ &nbsp; · &nbsp; f = ω/(2π).</div>
      <p>K is stiffness matrix, M here is <b>mass matrix</b> (not bending moment), φ is a mode shape, ω is angular frequency in rad/s, and f is frequency in Hz. A mode is a characteristic deformation pattern; its displayed amplitude and sign are arbitrary. Higher bending modes have additional nodes where modal displacement is zero. Torsional modes rotate sections rather than simply moving them upward.</p>
      <p>The current modes are uncoupled structural bending and torsion with the fuselage held fixed. They do not predict a forced vibration amplitude or a flutter speed. Flutter requires motion-dependent aerodynamic forces, inertia, stiffness and damping coupled together. Merely seeing a wing animation, or two similar frequencies, is not proof of flutter. <a href="https://www.nasa.gov/aeronautics/nasa-boeing-test-aircraft-wings/" target="_blank" rel="noopener">NASA's explanation of flexible-wing flutter tests</a> provides the physical context.</p>
      <h3>Guided numerical investigation</h3>
      <ol><li><b>Baseline:</b> record inputs, mass, root/fitting moment, tip deflection, twist and first bending frequency at 1 g. Check Section units and upper/lower stress signs.</li>
      <li><b>Load factor:</b> predict the result at +6 g before running. Linear stresses and displacements should scale by six for unchanged inputs. Event load factors are capacities, so they do not scale with the selected display n.</li>
      <li><b>Load shape:</b> compare elliptic, Schrenk and lifting-line distributions at the same n. Verify equal total lift; compare moment, not just peak load.</li>
      <li><b>Mass:</b> compare inertia relief on/off. Explain the changed fitting reaction. This is an equivalent inertial-load experiment, not removal of the wing's physical mass.</li>
      <li><b>Stiffness versus strength:</b> change skin scale to 1.25, then restore baseline and change boom scale to 1.25. Predict which change affects twisting, bending and local stability more; read mass as well as stress.</li>
      <li><b>Evidence:</b> compare with archived shell FE only under matched baseline inputs. List three effects absent from the beam model before making a design recommendation.</li></ol>
      <p class="callout"><b>Short student submission:</b> one labelled load-path sketch, the 200 N uniform-load moment calculation, a baseline/change comparison table, and a paragraph explaining one disagreement with your prediction. A screenshot of coloured stress alone is not an engineering explanation.</p>
    </article>`;
  }
  function renderLoads() {
    const r = R, g = r.grid;
    if (loadKeeper) loadKeeper.detach();
    if(r.input.customLoads!=null){
      const none=!r.input.customLoads.length;
      $('#mtab-loads').innerHTML=`<h2>${none?'No load defined':'Custom half-wing bench loads'}</h2><p class="callout">${none?'The wing opens without a load. Enter point, linear, elliptic, parabolic or CSV-table loads below, or apply flight loading. ':''}Custom forces replace flight lift and inertia relief. Values entered are multiplied by n = ${r.n}; here n is a <b>load multiplier, not a flight g factor</b>. Both half wings are assumed symmetrically loaded. Load locations are restricted to the fittings-to-last-rib span; local contact stresses are not solved.</p><div class="charts">${chart('Applied line load','N/m',[{name:'q',x:g.y,y:g.lift}])}${chart('Shear force','N',[{name:'V',x:g.y,y:g.V}])}${chart('Bending moment','N·m',[{name:'M',x:g.y,y:g.M}])}${chart('Torque about shear centre','N·m',[{name:'T',x:g.y,y:g.T}])}</div><p>For each cut: V = sum of outboard forces; M = sum of force × spanwise lever arm; T = sum of each force × its chordwise offset from the shear centre at its own station, T = F(x<sub>sc</sub> − x<sub>F</sub>), nose-up +. The inclined spar booms of the tapered wing also carry part of the torque (Model &amp; solver), so a load through the shear centre can still twist the wing slightly. The signed stresses and deformation use the same section solver as the flight cases.</p>${schrenkSection(r)}`;
      renderLoadEditor();return;
    }
    const rows = [["Wing structure (skins, webs, booms, stringers)", r.mass.shellsBoomsStringers, "line mass along the span"], ["22 ribs", r.mass.ribs, "at the rib stations"], ...Object.entries(r.masses.reduce((a, p) => { a[p.name] = (a[p.name] || 0) + p.mass; return a; }, {})).map(([k, v]) => [{ fuel: "Fuel (122 l × 0.72 kg/l)", gun: "Machine guns MAC 1934 (2)", ammo: "Ammunition (2 × 650 rounds)" }[k] || k, v, k === "fuel" ? "y 2.07–3.49 m at 0.17c" : "y 1.79 and 1.955 m"])];
    $("#mtab-loads").innerHTML = `<div class="mw-grid2"><div><div class="charts single" style="grid-template-columns:minmax(0,1fr)">${chart("Lift per unit span", "kN/m at n", [{ name: "lifting line", x: g.y, y: g.liftingLine.map((v) => v / 1e3) }, { name: "Schrenk", x: g.y, y: g.schrenk.map((v) => v / 1e3), dash: "5 4" }, { name: "elliptic", x: g.y, y: g.elliptic.map((v) => v / 1e3), dash: "2 3" }])}</div>
      <p class="note">Glauert's lifting line on the real planform (taper with an elliptic tip cap, camber blended outboard). Schrenk averages the planform and the ellipse. Total half-wing lift is n W / 2 = ${nf((r.W * r.n) / 2 / 1e3, 2)} kN in every case.</p></div>
      <div><h3 style="margin:0 0 6px;font:700 15px var(--font-label)">Half-wing masses (inertia relief)</h3><div class="tablewrap"><table><thead><tr><th>Item</th><th>Mass kg</th><th>Where</th></tr></thead><tbody>${rows.map(([a, b, c]) => `<tr><td>${a}</td><td class="num">${nf(b, 1)}</td><td>${c}</td></tr>`).join("")}<tr><td><b>Total</b></td><td class="num"><b>${nf(r.mass.structuralHalf + r.mass.nonStructuralHalf, 1)}</b></td><td></td></tr></tbody></table></div>
      <p class="note">At load factor n every mass pulls down with n × its weight, so it relieves the wing bending moment. The fittings then react ${nf((-r.fitting.Fz_per_g * r.n) / 1e3, 2)} kN instead of the full half-wing lift.</p></div></div>
      <div class="charts" style="margin-top:12px">${chart("Shear force V", "kN", [{ name: "with inertia relief", x: g.y, y: g.V.map((v) => v / 1e3) }, { name: "lift only", x: g.y, y: g.VliftOnly.map((v) => v / 1e3), dash: "5 4" }])}${chart("Bending moment M", "kN·m", [{ name: "with inertia relief", x: g.y, y: g.M.map((v) => v / 1e3) }, { name: "lift only", x: g.y, y: g.MliftOnly.map((v) => v / 1e3), dash: "5 4" }])}${chart("Torque about the shear centre", "N·m, nose-up +", [{ name: "T", x: g.y, y: g.T }])}</div>
      <p class="note">Inboard of the fittings (y &lt; ${r.P.fittingY} m) the fittings have taken out the shear; the centre section between the fuselage sides carries an almost constant moment by symmetry.</p>${schrenkSection(r)}`;
    renderLoadEditor();
  }
  /** Schrenk teaching figure for the D.520 planform: chord-proportional, elliptic and their mean, equal area. */
  function schrenkSection(r) {
    if (typeof WingLoadsUI === "undefined") return "";
    const W = r.wing, L = W.b2, cm = W.area() / (2 * L);
    const panels = [{ title: `Rectangular wing, same span and area (c = ${nf(cm, 2)} m)`, short: "Rectangle", chord: () => cm, data: WingLoadsUI.schrenkData(L, () => cm, 1, [cm, cm]) },
      { title: "D.520 planform (straight taper + rounded tip)", short: "D.520", chord: (y) => W.chord(y), data: WingLoadsUI.schrenkData(L, (y) => W.chord(y), 1) }];
    return `<section class="mw-story" style="margin-top:14px"><h3>Schrenk's approximation on this planform</h3>
      <div class="mw-eq">w<sub>S</sub>(y) = ½ [ F c(y)/∫c dy + (4F/πb) √(1 − (y/b)²) ],&nbsp; b = ${nf(L, 2)} m semi-span</div>
      <p>The flight option “Schrenk” uses this mean of a chord-proportional and an elliptic load with the same half-wing lift F = nW/2 (equal areas, so the root moment of the mean is the mean of the two). The default lifting-line option solves Glauert's equations on the real planform instead. Custom loads are entered between the fittings and the last rib, so a Schrenk shape (defined over the whole semi-span from the centreline) is offered only as a flight distribution.</p>
      ${WingLoadsUI.schrenkFigure(panels, { width: 760, label: "Chord-proportional, elliptic and Schrenk span loads for a rectangular wing and the D.520 planform, total F = 1 N" })}
      <div class="tablewrap">${WingLoadsUI.schrenkTable(panels, { force: "N", length: "m", moment: "N·m" })}</div>
      <p class="note">Per newton of half-wing lift, moments about the centreline y = 0. Valid for an unswept wing without twist or deflected flaps, below stall; sweep, twist and stall need a correction or a lifting-surface/CFD method. Not a chordwise pressure (Cp) distribution, not a CFD result. Background: <a href="https://ntrs.nasa.gov/citations/19930093823" target="_blank" rel="noopener">NTRS 19930093823, “A simple approximate method for obtaining spanwise lift distributions over swept wings”</a> · <a href="https://ntrs.nasa.gov/citations/19780008062" target="_blank" rel="noopener">NASA CR-132403 (NTRS 19780008062)</a>.</p></section>`;
  }
  // Shared custom-load editor (wing_loads_ui.js) with the D.520 ids, SI units and span limits.
  const loadAdapter = {
    onScale:mode=>{MS.lineArrowScale=mode;if(model&&R)buildArrows();},
    pickOnModel:beginMetalSurfacePick,
    showDeformation:()=>{if(!R||stale||running||lastError)throw new Error('Solve the applied loads first.');MS.deformed=true;$('#mDef').setAttribute('aria-pressed','true');setPlot('disp');updateModel();$('#mgl').scrollIntoView({block:'center'});},
    workspace: "d520", units: { length: "m", line: "N/m", force: "N", moment: "N·m" },
    ids: { form: "mLoadForm", kind: "mLoadShape", a: "mLa", b: "mLb", P: "mLP", q0: "mLq0", q1: "mLq1", shape: "mLshape", basis: "mLbasis", value: "mLvalue", xc: "mLxc", law: "mLlaw",
      list: "mLoadList", clear: "mClearLoads", flight: "mRestoreFlight", status: "mLoadError", chord: "mChordFigure", csv: "mCsv" },
    kindValue: { point: "point", uniform: "uniform", rampUp: "up", rampDown: "down", trapezoid: "trapezoid", elliptic: "elliptic", parabolic: "parabolic" },
    deleteAttr: "data-mdelete",
    range: () => ({ min: E.D520.fittingY, max: E.D520.ribs.at(-1) }),
    items: () => MS.input.customLoads || [],
    mode: () => (MS.input.customLoads == null ? "flight" : MS.input.customLoads.length ? "custom" : "none"),
    validate: (items) => E.normalise({ ...MS.input, customLoads: items, n: MS.input.customLoads == null ? 1 : MS.input.n }),
    apply: (items) => { MS.input = { ...MS.input, customLoads: items, n: MS.input.customLoads == null ? 1 : MS.input.n, inertiaRelief: false }; lastError = null; syncN(); changed(); },
    flight: { label: "Apply flight loading (n = +6 limit, lifting line, inertia relief)", apply: () => { MS.input.customLoads = null; MS.input.inertiaRelief = true; MS.input.n = 6; lastError = null; syncN(); changed(); } },
    allowSchrenk: false, refStation: E.D520.fittingY, refLabel: `the fittings (y = ${E.D520.fittingY} m)`,
    section: (y) => {
      if (!R || stale) return null;
      const W = R.wing, xs = E.linspace(0, 1, 61).map((t) => 0.5 * (1 - Math.cos(Math.PI * t))), sec = W.section(y, xs), le = W.S_LE(y);
      const outline = [...sec.up, ...sec.lo.slice().reverse()].map(([S, Z]) => [S - le, Z]);
      const frac = E.interp(y, R.stations.map((t) => t.y), R.stations.map((t) => t.xsc));
      return { outline, chord: sec.c, xsc: frac * sec.c };
    },
    defaults: () => ({ a: 2, b: E.D520.ribs.at(-1), P: 1000, q0: 500, q1: 1000, total: 2000, xc: 0.25 }),
    statusText: () => (R ? `Solved case: ${R.input.customLoads == null ? `flight loading, n = ${sgn(R.n, 1)} g` : R.input.customLoads.length ? `${R.input.customLoads.length} custom load(s) × ${sgn(R.n, 1)}` : "no load defined"} · fitting reaction ${nf((-R.fitting.Fz_per_g * R.n) / 1e3, 3)} kN · moment at the fittings ${nf((R.fitting.M_per_g * R.n) / 1e3, 3)} kN·m · torque ${nf(R.fitting.T_per_g * R.n, 1)} N·m (nose-up +).${stale ? " Inputs changed: run the study to update." : ""}` : ""),
    download: (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); },
    torqueNote: "In the D.520 model each load's torque is taken about the shear centre at its own station (as for the flight loads); the tapered-beam option also lets the inclined booms carry part of the torque.",
  };
  const loadKeeper = typeof WingLoadsUI !== "undefined" ? WingLoadsUI.keeper(loadAdapter) : null;
  function renderLoadEditor() {
    if (!loadKeeper) return;
    const preferred = document.getElementById("mLoadEditor");
    let slot = null;
    if (!preferred) { $("#mtab-loads").insertAdjacentHTML("afterbegin", '<section class="callout"><h2>Apply D.520 wing loads</h2><p><b>SI units:</b> position in m, point force in N, line intensity in N/m. Upward positive. Chord fraction: 0 = leading edge, 1 = trailing edge.</p><div id="mLoadEditorHome"></div></section>'); slot = $("#mLoadEditorHome"); }
    loadKeeper.place(preferred, slot);
  }
  function renderDiagrams() {
    const st = R.stations, y = st.map((s) => s.y), n = R.n;
    const ref = REF && R.input.customLoads==null ? REF.beam.stations : [];
    $("#mCharts").innerHTML = [
      chart("Vertical deflection", "mm", [{ name: "total", x: y, y: st.map((s) => s.w * 1e3) }, { name: "bending", x: y, y: st.map((s) => s.wBend * 1e3), dash: "5 4" }, { name: "web shear", x: y, y: st.map((s) => s.wShear * 1e3), dash: "2 3" }]),
      chart("Twist (nose-up +)", "deg", [{ name: "twist", x: y, y: st.map((s) => (s.twist * 180) / Math.PI) }]),
      chart("Spar boom stress", "MPa", [{ name: "upper", x: y, y: st.map((s) => s.boomU / 1e6) }, { name: "lower", x: y, y: st.map((s) => s.boomL / 1e6) }, ...(REF ? [{ name: "shell FE (×n)", x: ref.map((s) => s.y), y: ref.map((s) => s.fe_upper_MPa * n), markers: true, color: COLS[0] }, { x: ref.map((s) => s.y), y: ref.map((s) => s.fe_lower_MPa * n), markers: true, color: COLS[1] }] : [])], { hlines: [{ y: R.P.material.Fty / 1e6 * Math.sign(n || 1), label: "Fty" }] }),
      chart("Bending stiffness EI", "MN·m²", [{ name: "EI", x: y, y: st.map((s) => s.EI / 1e6) }]),
      chart("Torsional stiffness GJ (2 cells)", "MN·m²", [{ name: "GJ", x: y, y: st.map((s) => s.GJ / 1e6) }]),
      chart("Shear centre and centroid", "x/c", [{ name: "shear centre", x: y, y: st.map((s) => s.xsc) }, { name: "mass centroid", x: y, y: st.map((s) => s.xm), dash: "5 4" }, { name: "lift (0.25c)", x: [0, y[y.length - 1]], y: [0.25, 0.25], dash: "2 3" }], { ymin: 0.15, ymax: 0.55 }),
      chart("Shear: total V and walls V_w", "kN", [{ name: "V", x: y, y: st.map((s) => s.V / 1e3) }, { name: "V_w (walls)", x: y, y: st.map((s) => s.Vw / 1e3), dash: "5 4" }]),
      chart("Spar web shear stress", "MPa", [{ name: "main spar web", x: y, y: st.map((s) => s.tauWeb / 1e6) }, { name: "false spar web", x: y, y: st.map((s) => s.tauFS / 1e6), dash: "5 4" }]),
      chart("Skin: max von Mises", "MPa", [{ name: "skin", x: y, y: st.map((s) => s.skinVM / 1e6) }]),
    ].join("");
  }
  function renderSection() {
    const y = Math.min(Math.max(MS.secY, 0.02), R.stations[R.stations.length - 1].y);
    const { sec, props, load } = E.sectionAt(R, y);
    const f = MS.secField;
    const xs = sec.nodes.map((n) => n.x), zs = sec.nodes.map((n) => n.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const Wd = 760, pad = 34, sc = (Wd - 2 * pad) / (x1 - x0), Hd = (z1 - z0) * sc + 2 * pad + 30;
    const X = (x) => pad + (x - x0) * sc, Z = (z) => Hd - pad - 20 - (z - z0) * sc;
    const vals = sec.walls.map((w, j) => (f === "q" ? load.q[j] : f === "tau" ? load.tau[j] : 0.5 * (E.sigmaAt(sec, load.M, sec.nodes[w.a].x, sec.nodes[w.a].z) + E.sigmaAt(sec, load.M, sec.nodes[w.b].x, sec.nodes[w.b].z))));
    const vmax = Math.max(...vals.map(Math.abs)) || 1;
    const colour = (v) => { const c = f === "sigma" ? diverging(v / vmax) : f === "q" ? diverging(v / vmax) : rainbow(Math.abs(v) / vmax); return `rgb(${c.map((u) => Math.round(u * 255)).join(",")})`; };
    let svg = sec.walls.map((w, j) => `<line x1="${X(sec.nodes[w.a].x)}" y1="${Z(sec.nodes[w.a].z)}" x2="${X(sec.nodes[w.b].x)}" y2="${Z(sec.nodes[w.b].z)}" stroke="${colour(vals[j])}" stroke-width="${Math.max(2.5, w.t * sc * 1.6)}" stroke-linecap="round"><title>${w.surf} wall · t ${nf(w.t * 1e3, 2)} mm · q ${nf(load.q[j], 0)} N/m · τ ${MPa(load.tau[j], 2)} MPa</title></line>`).join("");
    for (const it of sec.items) if (it.kind === "boom" || it.kind === "stringer") svg += `<circle cx="${X(it.x)}" cy="${Z(it.z)}" r="${Math.max(2.5, Math.sqrt(it.A / Math.PI) * sc)}" fill="${it.kind === "boom" ? "#e39a4b" : "#8cc66a"}" stroke="var(--bg)"><title>${it.kind} · ${nf(it.A * 1e6, 0)} mm² · σ ${MPa(E.sigmaAt(sec, load.M, it.x, it.z), 1)} MPa</title></circle>`;
    const xsc = props.xsc;
    svg += `<line x1="${X(x0) - 10}" x2="${X(x1) + 10}" y1="${Z(sec.zc)}" y2="${Z(sec.zc)}" stroke="var(--muted)" stroke-dasharray="6 4"/><text x="${X(x1) + 4}" y="${Z(sec.zc) - 4}" text-anchor="end">neutral axis</text>`;
    svg += `<g><circle cx="${X(sec.xc)}" cy="${Z(sec.zc)}" r="6" fill="none" stroke="var(--fg)" stroke-width="1.6"/><path d="M${X(sec.xc) - 9} ${Z(sec.zc)}h18M${X(sec.xc)} ${Z(sec.zc) - 9}v18" stroke="var(--fg)"/><text x="${X(sec.xc) + 9}" y="${Z(sec.zc) + 16}">centroid</text></g>`;
    svg += `<g><circle cx="${X(xsc)}" cy="${Z(sec.zc)}" r="7" fill="var(--accent)" opacity=".85"/><text x="${X(xsc)}" y="${Z(sec.zc) - 12}" text-anchor="middle" style="fill:var(--accent)">shear centre ${nf(props.xscFrac, 3)}c</text></g>`;
    const xl = sec.S_LE + 0.25 * sec.c, up = R.n >= 0, ztop = Z(z1) - 4;
    svg += `<path d="M${X(xl)} ${up ? ztop : ztop - 26} v${up ? -26 : 26}" stroke="#d25ad6" stroke-width="2.5" marker-end="url(#ah)"/><text x="${X(xl) + 7}" y="${ztop - 16}" style="fill:#d25ad6">lift at 0.25c</text>`;
    svg = `<svg viewBox="0 -12 ${Wd} ${Hd + 12}" role="img" aria-label="Wing cross-section at y = ${nf(y, 2)} m"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#d25ad6"/></marker></defs>${svg}<text x="${pad}" y="${Hd - 8}">${f === "sigma" ? "spanwise σ (blue compression, red tension)" : f === "tau" ? "|τ| = |q|/t in each wall" : "shear flow q (N/m), sign = direction along each wall"} · max ${f === "q" ? nf(vmax, 0) + " N/m" : MPa(vmax, 2) + " MPa"}</text></svg>`;
    const cells = sec.cells.length === 2 ? "2 (nose + box)" : "1 (nose open at the wheel well)";
    $("#mtab-section").innerHTML = `<div class="secwrap"><div class="mw-sec">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px"><label class="range" for="mSecY">y <input id="mSecY" type="range" min="0.02" max="4.93" step="0.01" value="${y}"></label><span class="scoreline">${nf(y, 2)} m · zone ${sec.zone} · chord ${nf(sec.c, 3)} m</span>
      <div class="seg" id="mSecF" style="width:280px"><button type="button" data-f="sigma" aria-pressed="${f === "sigma"}">Normal σ</button><button type="button" data-f="tau" aria-pressed="${f === "tau"}">Shear τ</button><button type="button" data-f="q" aria-pressed="${f === "q"}">Shear flow q</button></div></div>${svg}</div>
      <div><dl class="kv">
        <dt>Loads at n = ${sgn(R.n, 1)}</dt><dd>V ${nf(load.V / 1e3, 2)} kN · M ${nf(load.M / 1e3, 2)} kN·m · T ${nf(load.T, 0)} N·m</dd>
        <dt>Carried by the walls</dt><dd>V_w ${nf(load.Vw / 1e3, 2)} kN · T_w ${nf(load.Tw, 0)} N·m</dd>
        <dt>Direct-stress area</dt><dd>${nf(sec.area * 1e6, 0)} mm²</dd>
        <dt>I_xx · I_zz · I_xz</dt><dd>${nf(sec.Ixx * 1e6, 1)} · ${nf(sec.Izz * 1e6, 0)} · ${nf(sec.Ixz * 1e6, 1)} ×10⁻⁶ m⁴</dd>
        <dt>EI (lateral bending free)</dt><dd>${nf(props.EI / 1e6, 2)} MN·m²</dd>
        <dt>Closed cells</dt><dd>${cells}</dd>
        <dt>J · GJ</dt><dd>${nf(props.J * 1e6, 1)} ×10⁻⁶ m⁴ · ${nf(props.GJ / 1e6, 2)} MN·m²</dd>
        <dt>Shear centre</dt><dd>${nf(props.xscFrac, 3)} c from the leading edge</dd>
        <dt>Boom stress upper / lower</dt><dd>${MPa(load.boomU, 1)} / ${MPa(load.boomL, 1)} MPa</dd>
        <dt>Spar web τ · false spar τ</dt><dd>${MPa(load.tauWeb, 2)} · ${MPa(load.tauFS, 2)} MPa</dd>
        <dt>Line mass</dt><dd>${nf(sec.massLine, 2)} kg/m</dd></dl>
        <p class="note" style="margin-top:8px">Idealisation: ${sec.walls.length} straight walls; every direct-stress area (skin, webs, caps, stringers) lumped at the wall junctions. Open-section shear flows from q₂ − q₁ = −(V_w/Δ)(I_zz Q_z − I_xz Q_x), closed by equal twist of both cells and moment equilibrium. Hover a wall or boom for its numbers.</p></div></div>`;
    $("#mSecY").addEventListener("input", (e) => { MS.secY = +e.target.value; clearTimeout(secT); secT = setTimeout(renderSection, 60); if (MS.clip) { MS.clipY = MS.secY; $("#mClipY").value = Math.round(MS.secY * 1000); applyClip(); } });
    $$("#mSecF button").forEach((b) => b.addEventListener("click", () => { MS.secField = b.dataset.f; renderSection(); }));
  }
  let secT;
  function renderStrength() {
    const r = R, P = r.P;
    const ms = (n, need) => (n == null ? "–" : sgn(n / need - 1, 2));
    const cls = (n, need, stab) => (n == null ? "" : stab ? (n >= 1 ? "ok" : "warn") : n >= need ? "ok" : "bad");
    const rows = r.failure.map((f) => `<div class="mw-check"><div><b>${f.name}</b><i>${f.kind === "stability" ? "stability: the structure keeps carrying load" : "strength: the governing checks"}</i></div><div class="num ${cls(f.pos && f.pos.n, r.nUlt, f.kind === "stability")}">${f.pos ? nf(f.pos.n, 2) : "–"}</div><div class="num ${cls(f.neg && f.neg.n, r.nUltNeg, f.kind === "stability")}">${f.neg ? "−" + nf(f.neg.n, 2) : "–"}</div><div class="num hide-s">${f.pos ? nf(f.pos.y, 2) + " m" : "–"}</div><div class="num hide-s">${f.kind === "strength" ? ms(f.pos && f.pos.n, r.nUlt) : "–"}</div></div>`).join("");
    const c = r.checks, y = c.map((q) => q.y);
    const crit = c.reduce((b, q) => (q.pos && (!b || q.pos.n_collapse < b.pos.n_collapse) ? q : b), null);
    const curve = crit ? crit.pos.curve : [];
    const fe = REF ? REF.fe : null;
    $("#mtab-strength").innerHTML = `<div class="mw-grid2"><div>
      <div class="mw-check head"><div>Failure or stability mode</div><div class="num">+g at n</div><div class="num">−g at n</div><div class="num hide-s">where (+g)</div><div class="num hide-s">MS vs ${nf(r.nUlt, 0)} g</div></div>${rows}
      <p class="note">Predicted event load factors in this assumed model (+g / −g). Margin of safety MS = n/n<sub>ult</sub> − 1 against assumed demands ${nf(r.nUlt, 1)} g / −${nf(r.nUltNeg, 1)} g. ${fe ? `The archived shell eigenvalues are ${nf(fe.buckle_pos[0], 2)} g and −${nf(Math.abs(fe.buckle_neg[0]), 2)} g; they decrease with refinement (${fe.convergence.map((q) => q.buckle_pos ? nf(q.buckle_pos, 1) : null).filter(Boolean).join(" → ")}) and are not converged. Simplified panel predictions and shell predictions are not rigorous bounds on the real wing.` : ""}</p></div>
      <div class="callout"><h3>Buckling onset is not the same as collapse</h3>
      <p>Thin skins between ribs and stringers buckle elastically at low stress. After buckling a panel keeps carrying load next to its stiffeners (von Kármán effective width w<sub>e</sub> = 1.9 t √(E/σ)), so the booms, stringers and the strips of skin beside them take over. The section fails when stringers cripple and the booms yield: that is the collapse moment found by stepping the curvature of each section until the moment peaks.</p>
      <div class="mw-eq">σ<sub>cr</sub> = k π²E/12(1−ν²) (t/b)² + 0.3 E t/R &nbsp;·&nbsp; τ<sub>cr</sub> = (5.35 + 4 (b/a)²) π²E/12(1−ν²) (t/b)²<br>n σ₁/σ<sub>cr</sub> + (n τ₁/τ<sub>cr</sub>)² = 1 &nbsp;·&nbsp; σ<sub>cc, blade</sub> = 1.3 × 0.43 π²E/12(1−ν²) (t/h)²</div>
      <p class="note">Post-buckling strength requires a validated load path, adequate stiffeners and connections. Tension-field action is not solved here; do not assume a buckled web is safe. The curvature correction and stringer multiplier are approximate. Fittings, rivets and the steel fishplates are not modelled; first crippling below the assumed ultimate requirement remains a failing check even if the section moment peak is higher.</p></div></div>
      <div class="charts" style="margin-top:12px">${chart("Load factor at each event (positive g)", "g", [{ name: "collapse", x: y, y: c.map((q) => q.pos && q.pos.n_collapse) }, { name: "boom yield", x: y, y: c.map((q) => q.pos && q.pos.n_boom_yield), dash: "5 4" }, { name: "stringer crippling", x: y, y: c.map((q) => q.pos && q.pos.n_stringer_cripple) }, { name: "web shear buckling", x: y, y: c.map((q) => q.web.n_buckle), dash: "2 3" }, { name: "skin buckling", x: y, y: c.map((q) => q.skinCombined.pos) }], { ymax: 40, hlines: [{ y: r.nUlt, label: "ultimate" }, { y: P.aircraft.nLimitPos, label: "limit" }] })}
      ${crit ? chart(`Moment–curvature at y = ${nf(crit.y, 2)} m`, "load factor", [{ name: "section response", x: curve.map((p) => p[0] * 1e3), y: curve.map((p) => p[1] / Math.abs(crit.M_per_g)) }], { xlabel: "curvature (1/km)", hlines: [{ y: crit.pos.n_stringer_cripple, label: "stringers cripple" }, { y: crit.pos.n_boom_yield, label: "boom yields" }] }) : ""}
      ${chart("Skin panel buckling (compression + shear)", "g", [{ name: "+g", x: y, y: c.map((q) => q.skinCombined.pos) }, { name: "−g", x: y, y: c.map((q) => q.skinCombined.neg), dash: "5 4" }], { ymax: 4, hlines: [{ y: 1, label: "1 g" }] })}</div>`;
  }
  function renderCompare() {
    const box = $("#mtab-compare");
    if(R.input.customLoads!=null){box.innerHTML='<p>Shell FE reference data apply only to the original flight load case, not your custom loads. Restore flight loading before comparing.</p>';return;}
    if (!REF) { box.innerHTML = "<p>Reference data not loaded.</p>"; return; }
    const r = R1 || R, fe = REF.fe, py = REF.beam;
    const row = (q, js, pyv, fev, unit, d = 2) => { const diff = fev != null && isFinite(fev) ? (100 * (js - fev)) / Math.abs(fev) : pyv != null ? (100 * (js - pyv)) / Math.abs(pyv) : null; const c = diff == null ? "" : Math.abs(diff) < 5 ? "ok" : Math.abs(diff) < 10 ? "warn" : "bad"; return `<tr><td>${q}</td><td class="num">${nf(js, d)}</td><td class="num">${pyv == null ? "–" : nf(pyv, d)}</td><td class="num">${fev == null ? "–" : nf(fev, d)}</td><td class="num ${c}">${diff == null ? "–" : sgn(diff, 1) + " %"}</td><td>${unit}</td></tr>`; };
    let rows = "";
    rows += row("Half-wing structural mass", r.mass.structuralHalf, null, fe.struct_mass_half, "kg", 1);
    rows += row("Fitting reaction at 1 g", r.fitting.Fz_per_g / 1e3, null, fe.reaction_fz_1g / 1e3, "kN", 3);
    rows += row("Bending moment at the fittings, 1 g", r.fitting.M_per_g / 1e3, py.M_at_fitting_1g / 1e3, null, "kN·m", 2);
    rows += row("Tip deflection, clamped at the fittings, bending only (y = 5.1 m)", r.tip.wBendClamped5 * 1e3, py.tip_deflection_clamped_at_fitting_mm, null, "mm", 2);
    rows += row("Tip deflection at rib 1 (largest node), 1 g", r.tip.wMax * 1e3, null, fe.tip_mm_1g, "mm", 2);
    rows += row("Tip twist at rib 1, 1 g (nose-up)", r.tip.twistDeg, null, fe.tip_twist_deg_1g, "deg", 4);
    for (const s of py.stations) {
      const L = E.sectionAt(r, s.y).load;
      rows += row(`Upper boom σ at y = ${s.y} m, 1 g`, L.boomU / 1e6, s.beam_upper_MPa, s.fe_upper_MPa, "MPa", 2);
      rows += row(`Lower boom σ at y = ${s.y} m, 1 g`, L.boomL / 1e6, s.beam_lower_MPa, s.fe_lower_MPa, "MPa", 2);
    }
    const col = r.failure.find((f) => f.key === "collapse"), cri = r.failure.find((f) => f.key === "stringer");
    rows += row("Collapse load factor (+g), critical section", col.pos.n, REF.collapse.summary.pos.n_collapse[0], null, "g", 2);
    rows += row("Stringer crippling load factor (+g)", cri.pos.n, REF.collapse.summary.pos.n_stringer_cripple[0], null, "g", 2);
    const sens = Object.entries(fe.sensitivity).map(([k, v]) => `<button class="btn" type="button" data-sens="${k}">${{ "skin0.75": "Skin ×0.75", "skin1.25": "Skin ×1.25", "boom0.6": "Booms ×0.6" }[k]}</button>`).join(" ");
    box.innerHTML = `<div class="mw-grid2"><div><div class="tablewrap"><table><thead><tr><th>Quantity (per g)</th><th>Wing Lab</th><th>Python beam</th><th>Shell FE</th><th>Δ</th><th>Unit</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Δ is against the shell model where it exists, otherwise against the Python beam check. Shell FE: CalculiX, ${fe.n_elems.toLocaleString()} S4/S3 shells of the same wing (skins, webs, booms, stringers, 22 ribs, wheel-well cut-out), symmetric at the centreline, held at the fuselage fittings. The same model is in the repository as ANSYS APDL, NASTRAN and CalculiX decks.</p></div>
      <div class="callout"><h3>Reading the differences</h3>
      <p><b>Inboard and mid-span</b> the boom stresses agree with the shell model to a few per cent: engineer's bending theory works for a box with booms, given the real section.</p>
      <p><b>Deflection</b> agrees within about 3 % only because three effects are included: the centre section between the fuselage sides bends too, the spar webs shear, and the spar is tapered so its inclined booms carry part of the shear (switch that off in Model &amp; solver and the shear deflection grows).</p>
      <p><b>Near the tip</b> beam theory over-predicts the boom stress: the shell model spreads the loads into the skin (shear lag) and the last ribs introduce them locally.</p>
      <h3>Sensitivity runs of the shell model</h3><p>Run Wing Lab with the same change and compare the tip deflection at 1 g:</p><div class="lesson-actions">${sens}</div><div id="mSensOut"></div></div></div>`;
    $$("[data-sens]", box).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.sens, sc = { "skin0.75": { skin: 0.75 }, "skin1.25": { skin: 1.25 }, "boom0.6": { boom: 0.6 } }[k];
      const rr = E.solve({ ...MS.input, n: 1, scales: { skin: 1, web: 1, boom: 1, stringer: 1, ...sc }, collapse: false, modes: false }), v = fe.sensitivity[k];
      $("#mSensOut").innerHTML = `<table><tbody><tr><th></th><th>Wing Lab</th><th>Shell FE</th></tr><tr><td>Tip deflection, 1 g (mm)</td><td class="num">${nf(rr.tip.wMax * 1e3, 2)}</td><td class="num">${nf(v.tip_mm, 2)}</td></tr><tr><td>Structure, half wing (kg)</td><td class="num">${nf(rr.mass.structuralHalf, 1)}</td><td class="num">${nf(v.struct_mass_half, 1)}</td></tr><tr><td>Upper boom σ, most compressive (MPa)</td><td class="num">${nf(Math.min(...rr.stations.map((s) => s.boomU)) / 1e6, 2)}</td><td class="num">${nf(v.boom_upper_min_MPa, 2)}</td></tr></tbody></table>`;
    }));
  }
  const avgOut = (k) => { const s = R.stations.filter((q) => q.y > 1.6); return s.reduce((a, q) => a + q[k], 0) / s.length; };
  function renderModes() {
    const f = R.fem;
    if (!f) { $("#mtab-modes").innerHTML = "<p>Modes not computed.</p>"; return; }
    const btn = (kind, i, hz) => `<button class="btn" type="button" data-mmode="${kind},${i}" aria-pressed="${MS.mode.kind === kind && MS.mode.index === i}">${kind === "bending" ? "Bending" : "Torsion"} ${i + 1} · ${nf(hz, 1)} Hz</button>`;
    $("#mtab-modes").innerHTML = `<div class="mw-grid2"><div><div class="mw-modes">${f.fBending.slice(0, 3).map((h, i) => btn("bending", i, h)).join("")}${f.fTorsion.slice(0, 2).map((h, i) => btn("torsion", i, h)).join("")}</div>
      <div class="charts" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:10px">${chart("Bending mode shapes", "normalised", f.bendingModes.slice(0, 3).map((s, i) => ({ name: `${nf(f.fBending[i], 1)} Hz`, x: f.y, y: s })))}${chart("Torsion mode shapes", "normalised", f.torsionModes.slice(0, 2).map((s, i) => ({ name: `${nf(f.fTorsion[i], 1)} Hz`, x: f.y, y: s })))}</div></div>
      <div class="callout"><h3>What these are</h3><p>Free vibration of the half wing with the fuselage held fixed: Hermite beam elements from the fittings to rib 1, EI and GJ from the section analysis, the structural line mass, ribs, fuel, guns and ammunition as masses, and the centre section as a rotational spring. Bending and torsion are uncoupled here. Outboard the mass centroid sits at about ${nf(avgOut("xm"), 2)}c and the shear centre at about ${nf(avgOut("xsc"), 2)}c; any offset between them couples the two in reality, and with the aerodynamic forces that coupling is what flutter is made of.</p><p>Press a mode, then pick <b>Modes</b> in the toolbar to animate it in the viewport. The amplitude is arbitrary.</p></div></div>`;
    $$("[data-mmode]").forEach((b) => b.addEventListener("click", () => { const [k, i] = b.dataset.mmode.split(","); MS.mode = { kind: k, index: +i }; setPlot("mode"); renderModes(); renderModeSeg(); }));
    $('#mtab-modes').insertAdjacentHTML('beforeend',`<article class="callout"><h2>Mode shape is not a measured vibration</h2><p>A mode is a natural deformation pattern. Bending modes move the wing centreline; torsional modes rotate its sections. Mode 1 usually has no internal reversal; higher modes have nodes where displacement is small and adjacent parts can move in opposite directions. A point on a node may miss that mode in a sensor recording.</p><div class="mw-eq">K φ = ω² M φ &nbsp; · &nbsp; f = ω/(2π)<br>u(y,t) = Σ φⱼ(y) aⱼ(t)</div><p>K is stiffness, M is mass, φ is the spatial mode shape, and f is its natural frequency. The amplitudes aⱼ depend on excitation, initial conditions and damping; this static solver does not calculate them. The animation is normalized and slowed for viewing. Changing static load alone does not change the linear modes; changing stiffness, mass or supports can. Stress-stiffening, coupled aeroelastic modes and flutter are not included.</p><h3>Can we take an FFT?</h3><p>Yes—from a <b>time recording</b>, such as acceleration or displacement at one sensor. An FFT of a spatial mode shape along y is a spatial spectrum, not a vibration-frequency spectrum. Here we generate a labelled synthetic recording to explain FFT peaks.</p><form id="mFFTform"><div class="field"><label for="mFFTkind">Synthetic signal</label><select id="mFFTkind"><option value="bending">First two bending modes</option><option value="torsion">First two torsion modes</option></select></div><button type="submit" class="btn">Generate signal and FFT</button></form><div id="mFFTresult"></div><p>Real experiments need uniformly sampled time data, adequate sensor placement, anti-alias filtering and a sampling rate above twice the highest frequency of interest (preferably with margin). Record length sets frequency resolution Δf = fₛ/N. Hann windowing reduces leakage but broadens peaks. Peak height is not strength or factor of safety; resonance also depends on forcing and damping.</p></article>`);
    $('#mFFTform').onsubmit=e=>{e.preventDefault();const kind=$('#mFFTkind').value,hz=kind==='bending'?f.fBending:f.fTorsion,freq=hz.slice(0,2),fs=Math.max(500,Math.ceil(Math.max(...freq)*10)),N=4096,t=Array.from({length:N},(_,i)=>i/fs),u=t.map(x=>Math.cos(2*Math.PI*freq[0]*x)+.4*Math.cos(2*Math.PI*freq[1]*x)),sp=E.vibrationSpectrum(u,fs);
      $('#mFFTresult').innerHTML=`<p><b>SYNTHETIC, arbitrary amplitude—not a transient simulation or measurement.</b> u(t) = cos(2π × ${nf(freq[0],2)}t) + 0.4 cos(2π × ${nf(freq[1],2)}t). Sampling ${fs} Hz; duration ${nf(N/fs,2)} s; resolution ${nf(sp.resolution,3)} Hz; Nyquist ${nf(sp.nyquist,0)} Hz. FFT peaks should lie near the two input frequencies; finite-bin leakage is expected.</p><div class="charts">${chart('Synthetic displacement vs time','arbitrary units',[{name:'u(t)',x:t.slice(0,400),y:u.slice(0,400)}],{xlabel:'time (s)'})}${chart('One-sided FFT amplitude (Hann)','arbitrary units',[{name:'FFT',x:sp.frequency.slice(0,Math.ceil(Math.max(...freq)*1.4/sp.resolution)),y:sp.amplitude.slice(0,Math.ceil(Math.max(...freq)*1.4/sp.resolution))}],{xlabel:'frequency (Hz)'})}</div>`;
    };
  }
  function renderModeSeg() {
    const f = R && R.fem; if (!f) return;
    const seg = $("#mModeSeg");
    seg.innerHTML = [...f.fBending.slice(0, 3).map((h, i) => ["bending", i, `B${i + 1} ${nf(h, 0)} Hz`]), ...f.fTorsion.slice(0, 2).map((h, i) => ["torsion", i, `T${i + 1} ${nf(h, 0)} Hz`])].map(([k, i, t]) => `<button type="button" data-k="${k}" data-i="${i}" aria-pressed="${MS.mode.kind === k && MS.mode.index === i}">${t}</button>`).join("");
    $$("button", seg).forEach((b) => b.addEventListener("click", () => { MS.mode = { kind: b.dataset.k, index: +b.dataset.i }; renderModeSeg(); }));
  }
  function renderMethod() {
    const P = R.P;
    $("#mtab-method").innerHTML = `<div class="mw-grid2"><article class="mw-story">
      <h2>Method</h2>
      <h3>1. Span loading</h3><p>Glauert's lifting line, symmetric terms, N = 60, on the real planform (linear taper to y = 4.687 m, then the elliptic tip cap) with the section lift slope 0.9 × 2π and the zero-lift angle blended from 0 at rib 21 to −1.2° (NACA 230) at the tip. The lift is scaled to n W.</p>
      <p class="note">CL and the displayed angle of attack define a reference load shape in linear attached-flow theory, not a stall prediction or a trimmed flight condition. Negative n reverses that prescribed shape; it does not solve a new negative-angle aerodynamic polar. The spar-cap taper is held fixed when CL changes.</p>
      <div class="mw-eq">Σ A<sub>n</sub> sin nθ (μ n + sin θ) = μ (α − α₀) sin θ, &nbsp; μ = a₀c/4b</div>
      <h3>2. Shear, moment, torque</h3><p>Integrated from the tip, with inertia relief from the structural line mass (computed from the sections), the ribs, fuel, guns and ammunition at their span and chord positions. The fittings at y = ${P.fittingY} m react the half-wing load.</p>
      <h3>3. Thin-walled section (every station)</h3><p>Upper and lower skins from the leading edge to the false spar, the spar web and the false-spar web are ${R.sections[20].walls.length} straight walls. Spar caps, blade stringers, and the skin and webs (by the linear-stress rule) are lumped as booms at the wall junctions. Bending stresses use the unsymmetric formula; shear flows come from boom equilibrium and are closed by the compatibility of the two cells:</p>
      <div class="mw-eq">σ = −M (I<sub>zz</sub> z − I<sub>xz</sub> x)/(I<sub>xx</sub>I<sub>zz</sub> − I<sub>xz</sub>²)<br>q<sub>out</sub> − q<sub>in</sub> = −(V<sub>w</sub>/Δ)(I<sub>zz</sub>B z − I<sub>xz</sub>B x) &nbsp;·&nbsp; (1/2A<sub>R</sub>) ∮<sub>R</sub> q ds/Gt = θ′ &nbsp;(R = nose, box)<br>V<sub>w</sub> = V − Σ P<sub>i</sub> dz<sub>i</sub>/dy &nbsp;·&nbsp; T<sub>w</sub> = T − Σ P<sub>i</sub> (dz<sub>i</sub>/dy)(x<sub>i</sub> − x<sub>sc</sub>)</div>
      <p>The last line is the tapered-beam correction: the booms follow the wing's falling depth, so their axial loads have vertical components. A unit shear with zero twist gives the shear centre; a unit torque gives GJ.</p>
      <h3>4. Deflection and twist</h3><p>w″ = M/EI and w′<sub>s</sub> = V<sub>w</sub> Σ q̄² L/(G t) (web shear), with zero slope at the centreline and zero deflection at the fittings; θ′ = T<sub>w</sub>/GJ from the fittings. A Hermite beam FE reproduces the integration and gives the modes.</p>
      <h3>5. Stability and strength</h3><p>Section-by-section, as in the Python pipeline: skin panels (flat plate + curvature, effective width after buckling), blade-stringer crippling, elastic–plastic booms (to rupture at 10 % strain), webs elastic–plastic; the moment–curvature curve gives first yield and collapse. Wing Lab adds combined compression–shear skin buckling and spar-web shear buckling from the computed shear flows.</p>
      <h3>Not modelled</h3><p>Rivets, fittings and the fuselage; rib stresses (the shell model gives about 9–10 MPa per g at rib 21); shear lag; local load introduction; plasticity of the skins in shear; coupled bending–torsion vibration and flutter; drag and chordwise bending.</p></article>
      <div><h2 style="font:700 19px var(--font-label);margin:0 0 6px">Data and sources</h2><div class="tablewrap"><table><thead><tr><th>Input</th><th>Source / status</th></tr></thead><tbody>${P.sources.map(([a, b]) => `<tr><td style="white-space:normal">${a}</td><td style="white-space:normal">${b}</td></tr>`).join("")}</tbody></table></div>
      <p class="note" style="margin-top:8px">PRINTED: read in the 1940 manual · SCALED: measured on a manual plate · EXTERNAL: outside reference · GUESS: assumption, varied in the sensitivity runs. Full list with page numbers: <code>computational/d520-wing/stress/data/stress_inputs.json</code>.</p>
      <p class="note">Python pipeline, CAD (STEP for SolidWorks / ANSYS), ANSYS APDL, NASTRAN and CalculiX decks: <a href="${REPO}" target="_blank" rel="noopener">computational/d520-wing</a>. Tests: <code>node computational/printed-wing-solver/web/test_metal_wing.mjs</code> (textbook sections, the Python model and the shell model).</p></div></div>`;
  }
  function reportText() {
    const r = R, P = r.P, g = governing(r), f = r.failure;
    const L = [];
    L.push(`MIE 446 Wing Virtual Lab · full-scale metal wing · ${P.name}`, `Engine ${E.VERSION} · ${new Date().toISOString().slice(0, 10)}`, "");
    if (r.input.customLoads != null) {
      L.push("INPUTS", `  load case: custom bench loads only (no automatic lift, no gravity or inertia relief) · multiplier ×${sgn(r.n, 2)}`);
      if (!r.input.customLoads.length) L.push("  No load defined.");
      r.input.customLoads.forEach((q, k) => L.push(`  ${k + 1}. ${typeof WingLoadsUI !== "undefined" ? WingLoadsUI.describe(q, { length: "m", line: "N/m", force: "N", moment: "N·m" }) : q.kind}`));
    } else L.push("INPUTS", `  flight case: gross mass ${nf(MS.input.mass, 0)} kg · load factor n = ${sgn(r.n, 2)} · span loading ${MS.input.distribution} · inertia relief ${MS.input.inertiaRelief ? "on" : "off"} (fuel ${MS.input.include.fuel ? "on" : "off"}, guns ${MS.input.include.guns ? "on" : "off"}, ammunition ${MS.input.include.ammo ? "on" : "off"})`);
    L.push(`  scales: skin ×${MS.input.scales.skin}, webs ×${MS.input.scales.web}, booms ×${MS.input.scales.boom}, stringers ×${MS.input.scales.stringer} · support: ${MS.input.support} · tapered-beam effect ${MS.input.taper ? "on" : "off"}`);
    L.push(`  material ${P.material.name}: E ${nf(P.material.E / 1e9, 0)} GPa, Fty ${MPa(P.material.Fty, 0)} MPa, Ftu ${MPa(P.material.Ftu, 0)} MPa`, "");
    L.push("RESULTS AT n", `  half-wing structure ${nf(r.mass.structuralHalf, 1)} kg, non-structural ${nf(r.mass.nonStructuralHalf, 1)} kg`);
    L.push(`  fitting reaction ${nf(r.fitting.Fz_per_g * r.n / 1e3, 2)} kN · moment at fittings ${nf(r.fitting.M_per_g * r.n / 1e3, 2)} kN·m`);
    L.push(`  tip deflection (rib 1) ${nf(r.tip.wMax * 1e3, 2)} mm · tip twist ${sgn(r.tip.twistDeg, 3)}° nose-up`);
    L.push(`  max boom stress ${MPa(Math.max(...r.stations.map((s) => Math.max(Math.abs(s.boomU), Math.abs(s.boomL)))), 1)} MPa · max spar-web shear ${MPa(Math.max(...r.stations.map((s) => Math.abs(s.tauWeb))), 2)} MPa`);
    if (r.fem) L.push(`  natural frequencies: bending ${r.fem.fBending.slice(0, 3).map((v) => nf(v, 1)).join(", ")} Hz · torsion ${r.fem.fTorsion.slice(0, 2).map((v) => nf(v, 1)).join(", ")} Hz`);
    L.push("", "LOAD FACTOR AT EACH EVENT (+g / −g, station of +g)");
    for (const q of f) L.push(`  ${q.name.padEnd(56)} ${q.pos ? nf(q.pos.n, 2).padStart(6) : "     –"} / ${q.neg ? ("−" + nf(q.neg.n, 2)).padStart(7) : "      –"}   y = ${q.pos ? nf(q.pos.y, 2) : "–"} m`);
    if (g) L.push("", `GOVERNING: ${g.name} at ${nf(g.n, 2)} g (${g.side === "pos" ? "+g" : "−g"}), required ${nf(g.need, 1)} g, MS ${sgn(g.n / g.need - 1, 2)}`);
    if (REF && r.input.customLoads==null) L.push("", `CHECK (1 g): tip deflection Wing Lab ${nf((R1 || r).tip.wMax * 1e3, 2)} mm vs CalculiX shell ${nf(REF.fe.tip_mm_1g, 2)} mm; collapse ${nf((R1 || r).failure.find((q) => q.key === "collapse").pos.n, 2)} g vs Python ${nf(REF.collapse.summary.pos.n_collapse[0], 2)} g`);
    L.push("", "Educational reconstruction; not an airworthiness assessment. Beam theory on thin-walled sections, not a 3-D finite-element result. Gauges, boom taper, material allowables, load factors and gross mass are assumptions. Approximate section collapse does not validate whole-wing collapse, joints, post-buckling safety or flutter (see Method & sources).");
    return L.join("\n");
  }
  // ------------------------------------------------------------------ A/B: two solved D.520 studies side by side
  // Snapshots of the solved inputs and their key results (this browser session); kept in the JSON results export.
  const AB = { A: null, B: null };
  const abInput = (inp) => JSON.parse(JSON.stringify(inp));
  function abMetrics(r) {
    const g = governing(r), boom = Math.max(...r.stations.map((s) => Math.max(Math.abs(s.boomU), Math.abs(s.boomL)))), web = Math.max(...r.stations.map((s) => Math.abs(s.tauWeb)));
    return [
      ["Structure, half wing", r.mass.structuralHalf, "kg", 2], ["Fitting reaction", (r.fitting.Fz_per_g * r.n) / 1e3, "kN", 3],
      ["Moment at the fittings", (r.fitting.M_per_g * r.n) / 1e3, "kN·m", 3], ["Torque at the fittings (nose-up +)", r.fitting.T_per_g * r.n, "N·m", 1],
      ["Tip deflection at rib 1", r.tip.wMax * 1e3, "mm", 2], ["Tip twist (nose-up +)", r.tip.twistDeg, "°", 3],
      ["Max boom stress", boom / 1e6, "MPa", 1], ["Max spar-web shear", web / 1e6, "MPa", 2],
      ["First bending frequency", r.fem ? r.fem.fBending[0] : NaN, "Hz", 2], ["Weakest check: reached / required factor", g ? g.ratio : NaN, "", 3],
    ].map(([name, value, unit, d]) => ({ name, value, unit, d }));
  }
  const weakest = (r) => { const g = governing(r); return g ? `${g.name} (${g.side === "pos" ? "+" : "−"} side, y = ${nf(g.y, 2)} m)` : "–"; };
  const DIST = { liftingLine: "lifting line", schrenk: "Schrenk", elliptic: "elliptic" };
  const loadCase = (inp) => (inp.customLoads == null ? `flight loading, n = ${sgn(inp.n, 1)} g, ${DIST[inp.distribution] || inp.distribution}${inp.inertiaRelief ? ", inertia relief" : ""}` : inp.customLoads.length ? `${inp.customLoads.length} custom load${inp.customLoads.length > 1 ? "s" : ""} × ${sgn(inp.n, 1)}` : "no load defined");
  function abDiff(a, b) {
    const out = [], same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    if (!same(a.customLoads, b.customLoads) || a.n !== b.n || a.distribution !== b.distribution || a.inertiaRelief !== b.inertiaRelief || !same(a.include, b.include)) out.push("load case");
    if (!same(a.scales, b.scales)) out.push("gauge scales");
    if (a.support !== b.support) out.push("support");
    if (a.taper !== b.taper) out.push("tapered-beam effect");
    if (a.mass !== b.mass || a.CL !== b.CL) out.push("aircraft mass / CL");
    if (!same(a.material, b.material)) out.push("material");
    return out;
  }
  function renderAB() {
    const box = $("#mAB"); if (!box) return;
    const { A, B } = AB;
    if (!A && !B) { box.innerHTML = '<p class="note">Save one solved study as A, change one input, solve, and save it as B: both keep their inputs and key results.</p>'; return; }
    const at = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const head = `<p class="note">${A ? `<b>A</b>: ${esc(loadCase(A.input))} (saved ${esc(at(A.savedAt))})` : "<b>A</b>: not saved"} · ${B ? `<b>B</b>: ${esc(loadCase(B.input))} (saved ${esc(at(B.savedAt))})` : "<b>B</b>: not saved"}</p>`;
    if (!A || !B) { box.innerHTML = head; return; }
    const diff = abDiff(A.input, B.input);
    const num = (v, d) => { if (v == null || !isFinite(v)) return "–"; const t = Math.abs(v).toFixed(d); return (v < 0 && /[1-9]/.test(t) ? "−" : "") + t; };   // one minus sign (U+2212) in every column
    const rows = A.metrics.map((m, i) => { const b = B.metrics[i]; const d = b.value - m.value, zero = Math.abs(d) <= 1e-9 * Math.max(Math.abs(m.value), Math.abs(b.value)); return `<tr><td>${esc(m.name)}${m.unit ? ` <span class="mw-unit">(${m.unit})</span>` : ""}</td><td class="num">${num(m.value, m.d)}</td><td class="num">${num(b.value, b.d)}</td><td class="num">${zero ? "0" : sgn(d, m.d)}</td></tr>`; }).join("");
    box.innerHTML = `${head}<p class="note">${diff.length ? `Inputs that differ: <b>${esc(diff.join(", "))}</b>.${diff.length > 1 ? " More than one thing changed: this is not a one-variable comparison." : ""}` : "The inputs are identical."}</p>
      <div class="tablewrap"><table aria-label="A/B comparison" id="mABTable"><thead><tr><th>Quantity</th><th>A</th><th>B</th><th>B − A</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note" id="mABWeakest">Weakest check: <b>A</b> ${esc(A.weakest)}; <b>B</b> ${esc(B.weakest)}${A.weakest === B.weakest ? " (the same check)" : ""}.</p>
      <p class="note">Each column is that study's solved result at its own load factor (flight) or multiplier (custom loads). A custom-load multiplier is not a flight g factor; compare flight and custom cases only with care.</p>`;
  }
  function saveAB(label) {
    if (!R || stale || running || lastError) { $("#mABState").textContent = "Run the study first: only solved inputs can be saved."; return; }
    AB[label] = { input: abInput(MS.input), metrics: abMetrics(R), weakest: weakest(R), savedAt: new Date().toISOString() };
    $("#mABState").textContent = `Saved the solved study as ${label}.`; renderAB();
  }
  function renderReport() {
    $("#mtab-report").innerHTML = `<div class="lesson-actions"><button class="btn primary" type="button" id="mCopy">Copy report</button><button class="btn" type="button" id="mJson">Download results (JSON)</button><span class="note" id="mCopyState">Plain-text study summary.</span></div><textarea id="mReport" readonly aria-label="Study report"></textarea>
      <section class="mw-ab"><h3>Compare two solved studies (A/B)</h3><div class="lesson-actions"><button class="btn" type="button" id="mSaveA">Save current as A</button><button class="btn" type="button" id="mSaveB">Save current as B</button><button class="btn" type="button" id="mClearAB">Clear A and B</button><span class="note" id="mABState" role="status"></span></div><div id="mAB"></div></section>`;
    $("#mSaveA").addEventListener("click", () => saveAB("A")); $("#mSaveB").addEventListener("click", () => saveAB("B"));
    $("#mClearAB").addEventListener("click", () => { AB.A = AB.B = null; $("#mABState").textContent = "A and B cleared."; renderAB(); });
    renderAB();
    $("#mReport").value = reportText();
    $("#mCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#mReport").value); $("#mCopyState").textContent = "Copied."; } catch { $("#mReport").select(); $("#mCopyState").textContent = "Select-all done; press Ctrl/Cmd+C."; } });
    $("#mJson").addEventListener("click", () => {
      if (stale || running) { $("#mCopyState").textContent = "Correct the inputs and run the study before exporting."; return; }
      const r = R, out = { input: r.input, engine: E.VERSION, n: r.n, mass: r.mass, fitting: r.fitting, tip: r.tip, failure: r.failure, frequencies: r.fem && { bending: r.fem.fBending, torsion: r.fem.fTorsion }, stations: r.stations.map((s) => ({ y: s.y, V: s.V, M: s.M, T: s.T, Vw: s.Vw, EI: s.EI, GJ: s.GJ, xsc: s.xsc, boomU: s.boomU, boomL: s.boomL, tauWeb: s.tauWeb, w: s.w, twist: s.twist })),
        compare: AB.A || AB.B ? { A: AB.A, B: AB.B } : null };
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" })); a.download = "D520-wing-lab-results.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  // ------------------------------------------------------------------ wiring
  function setPlot(p) {
    MS.plot = p;
    $$("[data-mplot]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mplot === p)));
    $("#mModePlayer").hidden = p !== "mode";
    if (p === "mode") renderModeSeg();
    if (R) updateModel();
  }
  $$("[data-mplot]").forEach((b) => b.addEventListener("click", () => setPlot(b.dataset.mplot)));
  $$("[data-n]", $("#mNbtns")).forEach((b) => b.addEventListener("click", () => { MS.input.n = +b.dataset.n; syncN(); renderPM(); changed(); }));
  $$("[data-mview]").forEach((b) => b.addEventListener("click", () => { lastView = b.dataset.mview; setView(lastView); }));
  $$("[data-mshow]").forEach((b) => b.addEventListener("click", () => { MS.show = b.dataset.mshow; applyShow(); }));
  $("#mDef").addEventListener("click", (e) => { MS.deformed = !MS.deformed; e.currentTarget.setAttribute("aria-pressed", String(MS.deformed)); updateModel(); });
  $("#mScale").addEventListener("input", (e) => { MS.scale = +e.target.value; if (!MS.deformed) { MS.deformed = true; $("#mDef").setAttribute("aria-pressed", "true"); } updateModel(); });
  let lastView = "iso";
  $("#mMirror").addEventListener("click", (e) => { MS.mirror = !MS.mirror; e.currentTarget.setAttribute("aria-pressed", String(MS.mirror)); rebuildMirror(); setView(lastView); });
  $("#mArrows").addEventListener("click", (e) => { MS.arrows = !MS.arrows; e.currentTarget.setAttribute("aria-pressed", String(MS.arrows)); buildArrows(); if (R) updateModel(); });
  $("#mClip").addEventListener("click", (e) => { MS.clip = !MS.clip; e.currentTarget.setAttribute("aria-pressed", String(MS.clip)); applyClip(); });
  $("#mClipY").addEventListener("input", (e) => { MS.clipY = +e.target.value / 1000; MS.secY = MS.clipY; if (!MS.clip) { MS.clip = true; $("#mClip").setAttribute("aria-pressed", "true"); } applyClip(); if (!$("#mtab-section").hidden) { clearTimeout(secT); secT = setTimeout(renderSection, 90); } else dirtyTabs.add("section"); });
  $("#mRun").addEventListener("click", () => { clearTimeout(timer); runStudy(); });
  const loadButton=document.createElement('button');loadButton.className='btn';loadButton.textContent='Apply D.520 loads';loadButton.id='mLoadBtn';$('#mRun').parentElement.append(loadButton);loadButton.onclick=()=>{openTab('loads');$('#mtab-loads').scrollIntoView({behavior:'smooth',block:'start'});};
  $$("#mTabs [role=tab]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.mtab)));
  if (window.matchMedia("(max-width:560px)").matches) $("#mHud").open = false;

  function openMetal() {
    for (const id of ["foundations", "app", "wingNavigation"]) { const n = document.getElementById(id); if (n) n.hidden = true; }
    host.hidden = false;
    if (!opened) { opened = true; initGL(); syncN(); setPlot(MS.plot); renderTree(); renderPM(); renderInventory(); applyShow(); renderLoadEditor(); runStudy(); }
    else resize();
    host.scrollIntoView({ block: "start" });
    if (location.hash !== "#d520") history.replaceState(null, "", "#d520");
  }
  function closeMetal(to) {
    if(loadKeeper&&loadKeeper.editor)loadKeeper.editor.cancelPick();
    host.hidden = true;
    if (location.hash === "#d520") history.replaceState(null, "", location.pathname + location.search);
    if (to === "wing" && document.documentElement.dataset.wingReady === "true") window.dispatchEvent(new CustomEvent("wing-show"));
    else { const f = document.getElementById("foundations"); if (f) { f.hidden = false; f.scrollIntoView({ block: "start" }); } }
  }
  $("#mBackBeams").addEventListener("click", () => closeMetal("beams"));
  const toMetal = document.getElementById("toMetalWing"); if (toMetal) toMetal.addEventListener("click", openMetal);
  $("#mBackWing").addEventListener("click", () => closeMetal("wing"));
  window.addEventListener("wing-learning-stage", (e) => { if (e.detail === "metal") openMetal(); else host.hidden = true; });
  window.addEventListener("wing-show", () => { host.hidden = true; });   // the printed wing is shown (also by a damaged printed-wing link)
  window.addEventListener("metal-wing-open", openMetal);
  // ------------------------------------------------------------------ study files and links (wing_study_io.js)
  // A study file or link replaces the D.520 inputs (validated, all or nothing); the workspace then solves as after any
  // D.520 input change. Hand-made files may give material, mass or CL as null: the D.520 preset values are used.
  function applyD520State(state) {
    MS.input = { ...state, include: { ...state.include }, scales: { ...state.scales },
      customLoads: state.customLoads == null ? null : JSON.parse(JSON.stringify(state.customLoads)),
      mass: state.mass ?? E.D520.aircraft.mass, CL: state.CL ?? E.D520.aircraft.CL, material: state.material ? { ...state.material } : { ...E.D520.material } };
    lastError = null; syncN();
  }
  const downloadFile = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const studyFiles = typeof WingStudyIO !== "undefined" && $("#mStudyFiles") ? WingStudyIO.mount($("#mStudyFiles"), {
    workspace: "d520", engine: E, download: downloadFile, getState: () => MS.input,
    applyState: (state) => { applyD520State(state); renderTree(); renderPM(); changed(); },
  }) : null;
  function renderShare() {
    const box = $("#mShare");
    if (!box || typeof WingStudyIO === "undefined") return;
    box.innerHTML = `<div class="lesson-actions"><button class="btn" type="button" id="mShareBtn">Copy a link to this solved study</button></div>
      <input type="text" id="mShareBox" class="wl-share" readonly hidden aria-label="Link to this D.520 study"><p class="note" id="mShareMsg" role="status"></p>`;
    $("#mShareBtn").onclick = async () => {
      const out = $("#mShareBox"), msg = $("#mShareMsg");
      out.hidden = true; out.value = "";
      if (!R || stale || running || lastError) { msg.textContent = "Run the study first: a link opens the same D.520 inputs and solves them."; return; }
      try {
        const token = WingStudyIO.encodeShare(WingStudyIO.d520StudyDocument(MS.input, E), { metalEngine: E });
        out.value = `${location.href.replace(/[?#].*$/, "")}#d520&${WingStudyIO.SHARE_KEY}=${token}`; out.hidden = false; out.select();
        try { await navigator.clipboard.writeText(out.value); msg.textContent = "Link copied. It opens these D.520 inputs and solves them on the page (nothing is uploaded)."; }
        catch (e) { msg.textContent = "Select the link and copy it. It opens these D.520 inputs and solves them on the page (nothing is uploaded)."; }
      } catch (e) { msg.textContent = e.message; }
    };
  }
  renderShare();
  function openD520Link(h) {
    const res = WingStudyIO.decodeShare(h, { engine: typeof WingEngine !== "undefined" ? WingEngine : undefined, metalEngine: E });
    const ok = res.ok && res.workspace === "d520";
    if (ok) applyD520State(res.state);
    const first = !opened;
    openMetal();
    if (ok && !first) { renderTree(); renderPM(); changed(); }
    $("#mSecFiles").open = true;
    $("#mShareMsg").textContent = ok ? `Shared D.520 study opened from the link${res.warnings.length ? ` (${res.warnings.slice(0, 2).join(" ")})` : ""}.` : `The study link could not be opened: ${(res.errors && res.errors[0]) || "it is not a D.520 study"}. The D.520 opens with its current inputs.`;
  }
  const fromHash = () => {
    const h = location.hash || "";
    if (/^#d520&/.test(h) && typeof WingStudyIO !== "undefined" && new RegExp(`&${WingStudyIO.SHARE_KEY}=`).test(h)) { openD520Link(h); return; }
    if (["#d520", "#metal", "#metal-wing"].includes(h)) openMetal();
  };
  window.addEventListener("hashchange", fromHash);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fromHash); else setTimeout(fromHash, 0);
  window.MetalWingUI = { open: openMetal, close: closeMetal, state: MS, result: () => R, studyFiles: () => studyFiles };
})();
