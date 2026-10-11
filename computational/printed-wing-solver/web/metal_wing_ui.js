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
  const frame = () => new Promise((r) => setTimeout(r, 30));
  const REPO = "https://github.com/Ehsan-Roohi/Aerospace-Structures/tree/main/computational/d520-wing";
  const MODEL3D = /github\.io$/.test(location.hostname) ? "./d520/index.html" : "https://ehsan-roohi.github.io/Aerospace-Structures/d520/";

  // ------------------------------------------------------------------ styles
  const style = document.createElement("style");
  style.textContent = `
  #metalLab { min-height: 100%; }
  #metalNav { position: sticky; top: 0; z-index: 50; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 16px; background: var(--panel); border-bottom: 2px solid var(--accent); box-shadow: var(--shadow); }
  #metalNav .btn { min-height: 38px; } #metalNav .title { font: 700 16px/1.2 var(--font-label); letter-spacing: .02em; margin: 0 8px; }
  #metalNav a.btn { text-decoration: none; color: inherit; }
  #metalApp { min-height: 1040px; padding: 12px 16px; display: grid; gap: 10px; grid-template-columns: 238px minmax(0, 1fr) 320px; grid-template-rows: auto minmax(460px, 1fr) minmax(420px, 44%); grid-template-areas: "bar bar bar" "tree view pm" "dock dock dock"; }
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
  #mReport { width: 100%; min-height: 260px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font: 12px/1.5 var(--font-data); padding: 10px; }
  .mw-legend { display: flex; gap: 8px; font: 11px/1 var(--font-data); }
  .mw-legend .bar-c { width: 16px; height: 150px; border: 1px solid rgba(0,0,0,.35); }
  .mw-legend .ticks { display: flex; flex-direction: column; justify-content: space-between; height: 150px; }
  @media (max-width: 1180px) { #metalApp { grid-template-columns: 210px minmax(0, 1fr) 290px; } }
  @media (max-width: 1100px) { #metalApp { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "bar" "view" "pm" "dock" "tree"; } #metalApp .view { height: 62vh; min-height: 340px; } .mw-grid2 { grid-template-columns: minmax(0, 1fr); } }
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
      <div class="group"><span>Study</span><div class="row"><button class="run" id="mRun" type="button"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2 L14 8 L4 14 Z" fill="currentColor"/></svg>Run study</button></div></div>
      <div class="group"><span>Load factor</span><div class="row" id="mNbtns">
        <button class="tool" type="button" data-n="1">1 g</button><button class="tool" type="button" data-n="6">+6 g limit</button><button class="tool" type="button" data-n="9">+9 g ultimate</button><button class="tool" type="button" data-n="-3">−3 g</button></div></div>
      <div class="group"><span>Plot</span><div class="row" id="mPlots">
        <button class="tool" type="button" data-mplot="model">Model</button><button class="tool" type="button" data-mplot="sigma">Spanwise σ</button><button class="tool" type="button" data-mplot="tau">Shear τ</button><button class="tool" type="button" data-mplot="vm">Von Mises</button><button class="tool" type="button" data-mplot="buckle">Buckling n</button><button class="tool" type="button" data-mplot="disp">Displacement</button><button class="tool" type="button" data-mplot="mode">Modes</button></div></div>
      <div class="status" aria-live="polite"><span class="chip idle" id="mChip">Ready</span><span id="mStateText">Open to run</span></div>
    </header>
    <aside class="tree panel" aria-label="Study tree"><div class="panel-head">Study · D.520 wing</div><ul id="mTree"></ul></aside>
    <section class="view panel" aria-label="3-D viewport" id="mView">
      <canvas id="mgl"></canvas>
      <div class="overlay infocol"><div class="plotinfo" id="mPlotinfo"></div><div class="legend-title" id="mLegendTitle"></div><div class="mw-legend" id="mLegend"></div></div>
      <details class="hud" id="mHud" open aria-label="View and display"><summary>View</summary>
        <div class="hud-row"><button type="button" data-mview="iso">Isometric</button><button type="button" data-mview="plan">Planform</button><button type="button" data-mview="front">Front</button><button type="button" data-mview="root">From root</button></div>
        <div class="hud-row"><button type="button" data-mshow="all" aria-pressed="true">Complete wing</button><button type="button" data-mshow="inside" aria-pressed="false">Inside (skins see-through)</button><button type="button" data-mshow="frame" aria-pressed="false">Spar, ribs, stringers</button></div>
        <div class="hud-row"><button type="button" id="mDef" aria-pressed="true">Deformed</button><label>Scale <input id="mScale" type="range" min="0" max="3" step="0.05" value="1"></label><button type="button" id="mMirror" aria-pressed="false">Both wings</button><button type="button" id="mArrows" aria-pressed="true">Loads</button></div>
        <div class="hud-row"><button type="button" id="mClip" aria-pressed="false">Cut at y</button><label><span class="sr">Cut station</span><input id="mClipY" type="range" min="0" max="4930" step="10" value="2350"></label></div>
      </details>
      <div class="probe" id="mProbe" hidden></div>
      <div class="overlay footline" id="mFoot"></div>
      <div class="modeplayer" id="mModePlayer" hidden><span>Mode</span><div class="seg" id="mModeSeg"></div></div>
      <div class="loading" id="mLoading" hidden><div class="card"><h3 id="mLoadTitle">Solving the D.520 wing</h3><p id="mLoadStep">Lifting line · sections · strength</p><div class="progress"><div id="mLoadBar"></div></div></div></div>
    </section>
    <aside class="pm panel" aria-label="Properties"><div class="panel-head"><span id="mPmHead">Properties</span></div><div class="pm-body" id="mPm"></div></aside>
    <section class="dock panel" aria-label="Results">
      <div class="tabs" role="tablist" id="mTabs">
        <button role="tab" type="button" data-mtab="start" aria-selected="true">Start here · D.520</button>
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
    input: { n: 6, distribution: "liftingLine", inertiaRelief: true, include: { fuel: true, guns: true, ammo: true }, scales: { skin: 1, web: 1, boom: 1, stringer: 1 }, support: "fittings", taper: true, mass: E.D520.aircraft.mass, CL: E.D520.aircraft.CL, material: { ...E.D520.material } },
    selected: "aircraft", plot: "sigma", show: "all", deformed: true, scale: 1, mirror: false, arrows: true, clip: false, clipY: 2.35,
    secY: 2.35, secField: "sigma", tab: "start", mode: { kind: "bending", index: 0 },
  };
  let R = null, R1 = null, running = false, pending = false, stale = true, opened = false, timer = null;

  // ------------------------------------------------------------------ run control
  function setStatus(text, kind) {
    const chip = $("#mChip"), t = $("#mStateText");
    $("#mRun").classList.toggle("stale", stale && !running);
    if (running) { chip.className = "chip idle"; chip.textContent = "Solving"; t.textContent = text || "Running"; return; }
    if (stale) { chip.className = "chip warn"; chip.textContent = "Out of date"; t.textContent = "Inputs changed — run the study"; return; }
    if (!R) return;
    const g = governing(R);
    const ok = g && g.n >= R.nUlt;
    chip.className = "chip " + (kind || (ok ? "ok" : "bad"));
    chip.textContent = ok ? `Strength ≥ ${nf(R.nUlt, 1)} g ultimate` : "Below ultimate";
    t.textContent = text || (g ? `Weakest: ${g.name.toLowerCase()} at ${nf(g.n, 1)} g (y = ${nf(g.y, 2)} m)` : "");
  }
  function changed() { stale = true; setStatus(); renderTree(); clearTimeout(timer); timer = setTimeout(runStudy, 500); }
  async function runStudy() {
    if (running) { pending = true; return; }
    running = true; stale = false; setStatus();
    const ld = $("#mLoading"), t0 = performance.now();
    try {
      const first = !R;
      ld.hidden = false;
      $("#mLoadTitle").textContent = first ? "Solving the D.520 wing" : "Re-solving";
      $("#mLoadStep").textContent = "Lifting line on the real planform · 2-cell section analysis at 115 stations"; $("#mLoadBar").style.width = "15%";
      await frame();
      const quick = E.solve({ ...MS.input, collapse: false });
      R = quick;
      if (first || !modelBuilt) buildModel(R); else updateModel();
      $("#mLoadStep").textContent = "Post-buckling strength of 37 sections (effective width) · beam modes"; $("#mLoadBar").style.width = "55%";
      await frame();
      R = E.solve({ ...MS.input, collapse: true });
      R1 = MS.input.n === 1 ? R : E.solve({ ...MS.input, n: 1, collapse: true });
      $("#mLoadBar").style.width = "100%";
      updateModel(); renderAll();
      $("#mFoot").textContent = `Solved in ${((performance.now() - t0) / 1000).toFixed(2)} s · ${R.stations.length} thin-walled sections × ${R.sections[0].walls.length} walls · lifting line N = 60 · beam FE ${R.fem ? R.fem.y.length - 1 : 0} elements · ${R.checks.length} strength sections`;
    } catch (err) { stale = true; console.error(err); $("#mChip").className = "chip bad"; $("#mChip").textContent = "Input error"; $("#mStateText").textContent = err.message || String(err); }
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
      { id: "aircraft", c: "var(--load)", b: "Aircraft & load case", i: `${nf(i.mass, 0)} kg · n = ${sgn(i.n, 1)} g` },
      { id: "material", c: "var(--muted)", b: "Material", i: `${i.material.name || "duralumin"} · E ${nf(i.material.E / 1e9, 0)} GPa` },
      { id: "structure", c: "var(--accent)", b: "Structure & gauges", i: `skin ×${i.scales.skin} · webs ×${i.scales.web} · booms ×${i.scales.boom}` },
      { id: "supports", c: "var(--fixture)", b: "Supports", i: i.support === "clamped" ? "Clamped at fittings" : "Fittings + centre section" },
      { id: "solver", c: "var(--muted)", b: "Model & solver", i: R ? `${R.stations.length} sections · ${R.checks.length} strength stations` : "–" },
      { id: "results", c: "var(--warn)", b: "Results", i: R ? `tip ${nf(R.tip.wMax * 1e3, 1)} mm at ${sgn(R.n, 1)} g` : "–" },
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
    w.querySelector("input").addEventListener("change", (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) { onSet(v); changed(); renderTree(); } });
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
    if (id === "aircraft") {
      $("#mPmHead").textContent = "Load case";
      head("Aircraft and load case", "Lift = n W, shaped along the span by the chosen method. Inertia relief subtracts n × (structure + fuel + guns + ammunition) weight at the right span and chord positions.");
      pm.append(fs("Flight condition",
        numField("mMass", "Gross mass", "kg (Wikipedia 2 677; manual leaves it blank)", i.mass, 10, (v) => (i.mass = v)),
        numField("mN", "Load factor n", "g; limit +6 / −3 (CS-23 aerobatic, assumed)", i.n, 0.5, (v) => { if (v === 0) return; i.n = v; syncN(); }),
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
      head("2017-T4 duralumin (AU4G)", "The manual says every wing part is duralumin except the steel fittings. Minimum handbook values; replace them to study another alloy.");
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
      if (R) pm.append(kv([["Analysis sections", R.stations.length], ["Walls per section", R.sections[10].walls.length], ["Closed cells", `${R.sections[R.sections.length - 1].cells.length} (nose + box)`], ["Strength sections", R.checks.length], ["Shear resultant error", R.verification.shearResultantError.toExponential(1)], ["Lift: W/2 check", R.verification.halfLiftError.toExponential(1)], ["Beam FE vs integration (tip)", `${nf(100 * R.verification.femTipDiff, 2)} %`], ["Beam FE vs integration (twist)", `${nf(100 * R.verification.femTwistDiff, 2)} %`]]));
    } else {
      $("#mPmHead").textContent = "Results";
      head("Results at the current load factor", "Pick a plot in the toolbar. Hover over the wing to read values.");
      if (R) pm.append(kv([["Load factor", `${sgn(R.n, 1)} g`], ["Tip deflection (rib 1)", `${nf(R.tip.wMax * 1e3, 1)} mm`], ["Tip twist", `${sgn(R.tip.twistDeg, 3)}° nose-up`], ["Root boom stress (upper)", `${MPa(R.stations[0].boomU)} MPa`], ["Max boom stress", `${MPa(Math.max(...R.stations.map((s) => Math.max(Math.abs(s.boomU), Math.abs(s.boomL)))))} MPa`], ["Max spar-web τ", `${MPa(Math.max(...R.stations.map((s) => Math.abs(s.tauWeb))))} MPa`], ["First bending mode", R.fem ? `${nf(R.fem.fBending[0], 1)} Hz` : "–"]]));
    }
  }
  function syncN() { $$("#mNbtns [data-n]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.n === MS.input.n))); }

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
    const loop = (t) => { raf = requestAnimationFrame(loop); if (host.hidden) return; controls.update(); if (MS.plot === "mode" && R && R.fem) animateMode(t); renderer.render(scene, camera); };
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
      const p = V3(P.fittingY, sc.up[0][0], 0.5 * (sc.up[0][1] + sc.lo[0][1])); fit.position.set(p[0], p[1], p[2]); extras.add(fit);
    }
    const sym = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.2), new THREE.MeshBasicMaterial({ color: 0x33c587, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    sym.rotation.y = Math.PI / 2; sym.position.set(0, 0, 1.1); extras.add(sym);
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
    const tip = Math.abs(R.tip.wMax) || 1e-6;
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
        if (p === "model" || p === "mode") c = PART_COL[u.kind] || [0.8, 0.8, 0.8];
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
    const title = { sigma: "Spanwise normal stress σ (MPa) · compression blue", tau: "Shear stress |τ| in skins and webs (MPa)", vm: "Von Mises stress (MPa)", disp: "Vertical displacement (mm)", buckle: "Buckling load factor ÷ current n (red < 1: buckled)", model: "", mode: "" }[p];
    T.textContent = title;
    if (p === "model" || p === "mode") { L.innerHTML = ""; }
    else {
      const N = 7, cols = Array.from({ length: 24 }, (_, i) => { const t = 1 - i / 23; const c = p === "sigma" ? diverging(2 * t - 1) : p === "buckle" ? margin(t) : rainbow(t); return `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`; });
      const fmt = (v) => (p === "disp" ? nf(v * 1e3, 2) : p === "buckle" ? nf(v, 2) : MPa(v, 1));
      const ticks = p === "buckle" ? [3, 2, 1, 0].map((v) => (v === 3 ? "≥ 3" : String(v))) : Array.from({ length: N }, (_, i) => fmt(hi - ((hi - lo) * i) / (N - 1)));
      L.innerHTML = `<div class="bar-c" style="background:linear-gradient(${cols.join(",")})"></div><div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>`;
    }
    if (R) info.innerHTML = `<b>Load factor</b> ${sgn(R.n, 1)} g &nbsp; <b>tip</b> ${nf(R.tip.wMax * 1e3, 1)} mm &nbsp; <b>twist</b> ${sgn(R.tip.twistDeg, 2)}°<br><b>deformation shown</b> ×${nf(deformScale(), 0)}`;
  }
  function updateModel() {
    if (!model || !R) return;
    colourAll();
    if (MS.plot !== "mode") deformAll((y) => { const d = dispAt(y), k = deformScale(); return { w: d.w * k, tw: d.tw * k, xsc: d.xsc }; });
    buildArrows();
  }
  function applyShow() {
    if (!model) return;
    const s = MS.show;
    const skins = model.getObjectByName("skins");
    skins.visible = s !== "frame";
    skinMats.forEach((m) => { m.opacity = s === "inside" ? 0.32 : 1; m.depthWrite = s !== "inside"; m.needsUpdate = true; });
    model.getObjectByName("ghost").visible = s === "all";
    $$("[data-mshow]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mshow === s)));
    if (MS.mirror) rebuildMirror();
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
  }
  const ray = typeof THREE !== "undefined" ? new THREE.Raycaster() : null;
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
  const TABS = ["start", "loads", "diagrams", "section", "strength", "compare", "modes", "method", "report"];
  let dirtyTabs = new Set();
  function renderAll() { renderTree(); renderPM(); dirtyTabs = new Set(TABS); renderTab(MS.tab); dirtyTabs.delete(MS.tab); if (MS.plot === "mode") renderModeSeg(); }
  function renderTab(t) {
    if (!R) return;
    ({ start: renderStart, loads: renderLoads, diagrams: renderDiagrams, section: renderSection, strength: renderStrength, compare: renderCompare, modes: renderModes, method: renderMethod, report: renderReport })[t]();
  }
  function openTab(t) {
    MS.tab = t;
    $$("#mTabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mtab === t)));
    $$("#metalApp .tabpanel").forEach((p) => (p.hidden = p.id !== "mtab-" + t));
    if (dirtyTabs.has(t)) { renderTab(t); dirtyTabs.delete(t); }
  }
  function renderStart() {
    const g = governing(R), r = R, P = r.P;
    const sk = r.failure.find((f) => f.key === "skinBuckle");
    $("#mtab-start").innerHTML = `<div class="mw-grid2"><article class="mw-story">
      <h2>From a printed wing to a real one: the Dewoitine D.520 (1940)</h2>
      <p>The D.520 was the best French fighter of 1940. Its wing is a classic <b>stressed-skin</b> metal structure: one I-section main spar at 37 % chord with heavy duralumin booms, a light false spar at 73 % carrying the flaps and ailerons, 22 pressed ribs, a smooth duralumin skin and blade stringers. Every dimension here comes from the scanned 1940 manual (<i>Notice descriptive</i>) or is labelled as an assumption in <b>Method &amp; sources</b>.</p>
      <p>This workspace uses the same chain of reasoning as the printed-wing lab, at full scale: <b>loads → shear, bending moment and torque → section properties → stresses → deflection and twist → stability and strength</b>. What is new is the thin-walled analysis of a real two-cell box (leading-edge nose cell + spar box), a tapered spar whose inclined booms carry part of the shear, skin buckling and the post-buckling strength that let 1940s designers use skins that wrinkle in flight.</p>
      <h3>Try this</h3>
      <ol><li>Press <b>+6 g limit</b> and switch the plot to <b>Spanwise σ</b>. Where is the boom stress highest, and why is it nearly constant from root to mid-span?</li>
      <li>Open <b>Section</b> and move the station. Find the shear centre and compare it with the 25 % chord where the lift acts. Which way does the wing twist?</li>
      <li>Switch the plot to <b>Buckling n</b>. Which skin panels buckle below 1 g? Then read <b>Strength &amp; stability</b>: why is that not a failure?</li>
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
        <p>The leading-edge skin between ribs has no stringers and buckles elastically early: at <b>${nf(sk.pos.n, 2)} g</b> by the simple panel formulas (y = ${nf(sk.pos.y, 2)} m), at about 2–3 g in the shell model, whose estimate was still falling with mesh refinement. Stressed-skin wings of the period were designed for this; the effective-width analysis carries the load past it.</p>
        <p>First bending frequency ${r.fem ? nf(r.fem.fBending[0], 1) : "–"} Hz, first torsion ${r.fem ? nf(r.fem.fTorsion[0], 0) : "–"} Hz (fuselage held fixed).</p>
        <p class="note">The load factors and gross mass are assumptions (the manual gives neither). All results scale linearly with n except the strength modes, which are reported as the load factor at which each happens.</p></div>
    </div></div>`;
  }
  function renderLoads() {
    const r = R, g = r.grid;
    const rows = [["Wing structure (skins, webs, booms, stringers)", r.mass.shellsBoomsStringers, "line mass along the span"], ["22 ribs", r.mass.ribs, "at the rib stations"], ...Object.entries(r.masses.reduce((a, p) => { a[p.name] = (a[p.name] || 0) + p.mass; return a; }, {})).map(([k, v]) => [{ fuel: "Fuel (122 l × 0.72 kg/l)", gun: "Machine guns MAC 1934 (2)", ammo: "Ammunition (2 × 650 rounds)" }[k] || k, v, k === "fuel" ? "y 2.07–3.49 m at 0.17c" : "y 1.79 and 1.955 m"])];
    $("#mtab-loads").innerHTML = `<div class="mw-grid2"><div><div class="charts single" style="grid-template-columns:minmax(0,1fr)">${chart("Lift per unit span", "kN/m at n", [{ name: "lifting line", x: g.y, y: g.liftingLine.map((v) => v / 1e3) }, { name: "Schrenk", x: g.y, y: g.schrenk.map((v) => v / 1e3), dash: "5 4" }, { name: "elliptic", x: g.y, y: g.elliptic.map((v) => v / 1e3), dash: "2 3" }])}</div>
      <p class="note">Glauert's lifting line on the real planform (taper with an elliptic tip cap, camber blended outboard). Schrenk averages the planform and the ellipse. Total half-wing lift is n W / 2 = ${nf((r.W * r.n) / 2 / 1e3, 2)} kN in every case.</p></div>
      <div><h3 style="margin:0 0 6px;font:700 15px var(--font-label)">Half-wing masses (inertia relief)</h3><div class="tablewrap"><table><thead><tr><th>Item</th><th>Mass kg</th><th>Where</th></tr></thead><tbody>${rows.map(([a, b, c]) => `<tr><td>${a}</td><td class="num">${nf(b, 1)}</td><td>${c}</td></tr>`).join("")}<tr><td><b>Total</b></td><td class="num"><b>${nf(r.mass.structuralHalf + r.mass.nonStructuralHalf, 1)}</b></td><td></td></tr></tbody></table></div>
      <p class="note">At load factor n every mass pulls down with n × its weight, so it relieves the wing bending moment. The fittings then react ${nf((-r.fitting.Fz_per_g * r.n) / 1e3, 2)} kN instead of the full half-wing lift.</p></div></div>
      <div class="charts" style="margin-top:12px">${chart("Shear force V", "kN", [{ name: "with inertia relief", x: g.y, y: g.V.map((v) => v / 1e3) }, { name: "lift only", x: g.y, y: g.VliftOnly.map((v) => v / 1e3), dash: "5 4" }])}${chart("Bending moment M", "kN·m", [{ name: "with inertia relief", x: g.y, y: g.M.map((v) => v / 1e3) }, { name: "lift only", x: g.y, y: g.MliftOnly.map((v) => v / 1e3), dash: "5 4" }])}${chart("Torque about the shear centre", "N·m, nose-up +", [{ name: "T", x: g.y, y: g.T }])}</div>
      <p class="note">Inboard of the fittings (y &lt; ${r.P.fittingY} m) the fittings have taken out the shear; the centre section between the fuselage sides carries an almost constant moment by symmetry.</p>`;
  }
  function renderDiagrams() {
    const st = R.stations, y = st.map((s) => s.y), n = R.n;
    const ref = REF ? REF.beam.stations : [];
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
      <p class="note">Load factor at which each event first happens anywhere on the span (positive and negative g). Margin of safety MS = n/n<sub>ult</sub> − 1 against the assumed ultimate ${nf(r.nUlt, 1)} g / −${nf(r.nUltNeg, 1)} g. ${fe ? `The shell model's first linear buckling eigenvalue is ${nf(fe.buckle_pos[0], 2)} g (positive) and −${nf(Math.abs(fe.buckle_neg[0]), 2)} g (negative), and it was still falling with mesh refinement (${fe.convergence.map((q) => q.buckle_pos ? nf(q.buckle_pos, 1) : null).filter(Boolean).join(" → ")}), so it is an upper estimate. The simply supported panel formulas here ignore the fuel tank and the rib beads that stiffened the real leading edge, so they are a lower estimate: the first skin buckle lies between the two.` : ""}</p></div>
      <div class="callout"><h3>Why a wing whose skin buckles at 1 g is still safe</h3>
      <p>Thin skins between ribs and stringers buckle elastically at low stress. After buckling a panel keeps carrying load next to its stiffeners (von Kármán effective width w<sub>e</sub> = 1.9 t √(E/σ)), so the booms, stringers and the strips of skin beside them take over. The section fails when stringers cripple and the booms yield: that is the collapse moment found by stepping the curvature of each section until the moment peaks.</p>
      <div class="mw-eq">σ<sub>cr</sub> = k π²E/12(1−ν²) (t/b)² + 0.3 E t/R &nbsp;·&nbsp; τ<sub>cr</sub> = (5.35 + 4 (b/a)²) π²E/12(1−ν²) (t/b)²<br>n σ₁/σ<sub>cr</sub> + (n τ₁/τ<sub>cr</sub>)² = 1 &nbsp;·&nbsp; σ<sub>cc, blade</sub> = 1.3 × 0.43 π²E/12(1−ν²) (t/h)²</div>
      <p class="note">Spar-web shear buckling is not failure either: a buckled web carries shear as a diagonal tension field (Wagner beam) until the web or its rivets fail. Fittings, rivets and the steel fishplates are not modelled.</p></div></div>
      <div class="charts" style="margin-top:12px">${chart("Load factor at each event (positive g)", "g", [{ name: "collapse", x: y, y: c.map((q) => q.pos && q.pos.n_collapse) }, { name: "boom yield", x: y, y: c.map((q) => q.pos && q.pos.n_boom_yield), dash: "5 4" }, { name: "stringer crippling", x: y, y: c.map((q) => q.pos && q.pos.n_stringer_cripple) }, { name: "web shear buckling", x: y, y: c.map((q) => q.web.n_buckle), dash: "2 3" }, { name: "skin buckling", x: y, y: c.map((q) => q.skinCombined.pos) }], { ymax: 40, hlines: [{ y: r.nUlt, label: "ultimate" }, { y: P.aircraft.nLimitPos, label: "limit" }] })}
      ${crit ? chart(`Moment–curvature at y = ${nf(crit.y, 2)} m`, "load factor", [{ name: "section response", x: curve.map((p) => p[0] * 1e3), y: curve.map((p) => p[1] / Math.abs(crit.M_per_g)) }], { xlabel: "curvature (1/km)", hlines: [{ y: crit.pos.n_stringer_cripple, label: "stringers cripple" }, { y: crit.pos.n_boom_yield, label: "boom yields" }] }) : ""}
      ${chart("Skin panel buckling (compression + shear)", "g", [{ name: "+g", x: y, y: c.map((q) => q.skinCombined.pos) }, { name: "−g", x: y, y: c.map((q) => q.skinCombined.neg), dash: "5 4" }], { ymax: 4, hlines: [{ y: 1, label: "1 g" }] })}</div>`;
  }
  function renderCompare() {
    const box = $("#mtab-compare");
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
    L.push(`MIE 446 Wing Lab · full-scale metal wing · ${P.name}`, `Engine ${E.VERSION} · ${new Date().toISOString().slice(0, 10)}`, "");
    L.push("INPUTS", `  gross mass ${nf(MS.input.mass, 0)} kg · load factor n = ${sgn(r.n, 2)} · span loading ${MS.input.distribution} · inertia relief ${MS.input.inertiaRelief ? "on" : "off"} (fuel ${MS.input.include.fuel ? "on" : "off"}, guns ${MS.input.include.guns ? "on" : "off"}, ammunition ${MS.input.include.ammo ? "on" : "off"})`);
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
    if (REF) L.push("", `CHECK (1 g): tip deflection Wing Lab ${nf((R1 || r).tip.wMax * 1e3, 2)} mm vs CalculiX shell ${nf(REF.fe.tip_mm_1g, 2)} mm; collapse ${nf((R1 || r).failure.find((q) => q.key === "collapse").pos.n, 2)} g vs Python ${nf(REF.collapse.summary.pos.n_collapse[0], 2)} g`);
    L.push("", "Beam theory on thin-walled sections; not a 3-D finite-element result. Gauges, load factors and gross mass are assumptions (see Method & sources).");
    return L.join("\n");
  }
  function renderReport() {
    $("#mtab-report").innerHTML = `<div class="lesson-actions"><button class="btn primary" type="button" id="mCopy">Copy report</button><button class="btn" type="button" id="mJson">Download results (JSON)</button><span class="note" id="mCopyState">Plain-text study summary.</span></div><textarea id="mReport" readonly aria-label="Study report"></textarea>`;
    $("#mReport").value = reportText();
    $("#mCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#mReport").value); $("#mCopyState").textContent = "Copied."; } catch { $("#mReport").select(); $("#mCopyState").textContent = "Select-all done; press Ctrl/Cmd+C."; } });
    $("#mJson").addEventListener("click", () => {
      const r = R, out = { input: MS.input, engine: E.VERSION, n: r.n, mass: r.mass, fitting: r.fitting, tip: r.tip, failure: r.failure, frequencies: r.fem && { bending: r.fem.fBending, torsion: r.fem.fTorsion }, stations: r.stations.map((s) => ({ y: s.y, V: s.V, M: s.M, T: s.T, Vw: s.Vw, EI: s.EI, GJ: s.GJ, xsc: s.xsc, boomU: s.boomU, boomL: s.boomL, tauWeb: s.tauWeb, w: s.w, twist: s.twist })) };
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
  $$("#mTabs [role=tab]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.mtab)));
  if (window.matchMedia("(max-width:560px)").matches) $("#mHud").open = false;

  function openMetal() {
    for (const id of ["foundations", "app", "wingNavigation"]) { const n = document.getElementById(id); if (n) n.hidden = true; }
    host.hidden = false;
    if (!opened) { opened = true; initGL(); syncN(); setPlot(MS.plot); renderTree(); renderPM(); runStudy(); }
    else resize();
    host.scrollIntoView({ block: "start" });
    if (location.hash !== "#d520") history.replaceState(null, "", "#d520");
  }
  function closeMetal(to) {
    host.hidden = true;
    if (location.hash === "#d520") history.replaceState(null, "", location.pathname + location.search);
    if (to === "wing" && document.documentElement.dataset.wingReady === "true") window.dispatchEvent(new CustomEvent("wing-learning-stage", { detail: "project" }));
    else { const f = document.getElementById("foundations"); if (f) { f.hidden = false; f.scrollIntoView({ block: "start" }); } }
  }
  $("#mBackBeams").addEventListener("click", () => closeMetal("beams"));
  const toMetal = document.getElementById("toMetalWing"); if (toMetal) toMetal.addEventListener("click", openMetal);
  $("#mBackWing").addEventListener("click", () => closeMetal("wing"));
  window.addEventListener("wing-learning-stage", (e) => { if (e.detail === "metal") openMetal(); else host.hidden = true; });
  window.addEventListener("metal-wing-open", openMetal);
  const fromHash = () => { if (["#d520", "#metal", "#metal-wing"].includes(location.hash)) openMetal(); };
  window.addEventListener("hashchange", fromHash);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fromHash); else setTimeout(fromHash, 0);
  window.MetalWingUI = { open: openMetal, close: closeMetal, state: MS, result: () => R };
})();
