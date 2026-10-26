/*
 * Wing Lab — custom load editor shared by the printed PLA semi-wing and the D.520 workspaces.
 * Builds the form (point, linear, elliptic, parabolic and, for the printed wing, Schrenk loads), the list,
 * the CSV line-load import with preview, and two teaching figures: the chord position of a load
 * (force line, shear centre, lever arm and torque sign) and the Schrenk planform approximation.
 * It never solves anything itself: the workspace adapter validates and applies the custom load case.
 * Needs load_profiles.js. Browser: global WingLoadsUI. Node: require('./wing_loads_ui.js').
 *
 * Sign conventions (both wings): forces and line loads UPWARD positive; x/c is measured from the local
 * leading edge (0) to the trailing edge (1); torque about the shear centre is NOSE-UP positive,
 * T = F (x_sc − x_F) for a force F at chordwise position x_F.
 */
const WingLoadsUI = (() => {
  'use strict';
  const P = typeof LoadProfiles !== 'undefined' ? LoadProfiles : require('./load_profiles.js');
  const esc = P.escapeHtml;
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  /** Readable number with a true minus sign; plain decimals for ordinary sizes. */
  function fmt(v, sig = 4) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    if (v === 0 || Math.abs(v) < 1e-13) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return String(Number(v.toPrecision(sig))).replace('-', '−');
    const [m, e] = v.toExponential(sig - 1).split('e');
    return `${m.replace('-', '−')} × 10${String(Number(e)).split('').map((c) => SUP[c]).join('')}`;
  }
  const signed = (v, sig = 4) => (v > 0 ? '+' : '') + fmt(v, sig);
  const r1 = (v) => Math.round(v * 10) / 10;

  const SHAPE_TEXT = { start: 'maximum at the start', end: 'maximum at the end', middle: 'symmetric, maximum in the middle' };
  const SHAPE_SHORT = { start: 'max at start', end: 'max at end', middle: 'symmetric' };
  const LAW = {
    elliptic: { start: 'w = w₀√(1 − s²): maximum w₀ at a, zero at b', end: 'w = w₀√(1 − (1 − s)²): zero at a, maximum w₀ at b', middle: 'w = w₀√(1 − (2s − 1)²): zero at a and b, maximum w₀ in the middle' },
    parabolic: { start: 'w = w₀(1 − s²): maximum w₀ at a (zero slope), zero at b', end: 'w = w₀(1 − (1 − s)²): zero at a, maximum w₀ at b (zero slope)', middle: 'w = 4w₀s(1 − s): zero at a and b, maximum w₀ in the middle' },
  };
  const LAW_F = { elliptic: 'F = πw₀ℓ/4, w₀ = 4F/(πℓ)', parabolic: 'F = 2w₀ℓ/3, w₀ = 3F/(2ℓ)' };
  const CENTROID_LAW = { elliptic: { start: 'ȳ = a + 4ℓ/(3π)', end: 'ȳ = b − 4ℓ/(3π)', middle: 'ȳ = (a + b)/2' }, parabolic: { start: 'ȳ = a + 3ℓ/8', end: 'ȳ = a + 5ℓ/8', middle: 'ȳ = (a + b)/2' } };
  // Canonical form shapes; each workspace keeps its own option values and element ids.
  const FORM_KINDS = [
    ['point', 'Point force'], ['uniform', 'Rectangular / uniform'], ['rampUp', 'Triangular (zero at start / tip-heavy)'],
    ['rampDown', 'Triangular (zero at end / root-heavy)'], ['trapezoid', 'Trapezoidal'],
    ['elliptic', 'Elliptic (curved)'], ['parabolic', 'Parabolic (curved)'], ['schrenk', 'Schrenk: whole semi-span, this planform'],
  ];

  let styled = false;
  function injectStyles(doc) {
    if (styled || !doc || !doc.head) return;
    styled = true;
    const st = doc.createElement('style');
    st.textContent = `
    .wle { display: grid; gap: 10px; min-width: 0; }
    .wle .wle-law { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: var(--fg); }
    .wle .wle-list { display: grid; gap: 6px; }
    .wle .wle-list p { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 6px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); font-size: 13px; }
    .wle .wle-empty { color: var(--muted); font-weight: 600; }
    .wle .wle-status { margin: 0; font-size: 13px; }
    .wle .wle-err { color: var(--bad); font-weight: 600; margin: 0; }
    .wle .wle-csv > summary { cursor: pointer; font: 700 14px/1.3 var(--font-label); }
    .wle .wle-csv[open] > summary { margin-bottom: 8px; }
    .wle .wle-csv code { font: 500 12.5px var(--font-data); }
    .wle .wle-csv textarea { width: 100%; min-height: 96px; font: 12.5px/1.4 var(--font-data); background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
    .wle .wle-csv fieldset { border: 1px solid var(--line); border-radius: 7px; padding: 6px 10px; display: grid; gap: 4px; }
    .wle .wle-csv table { border-collapse: collapse; font: 12.5px var(--font-data); }
    .wle .wle-csv td, .wle .wle-csv th { border: 1px solid var(--line); padding: 2px 6px; text-align: right; text-transform: none; }
    .wle figure { margin: 0; }
    .wle figcaption, .wlefig-cap { font-size: 12.5px; color: var(--muted); line-height: 1.45; margin-top: 4px; }
    .wlefig { display: block; width: 100%; height: auto; max-width: 560px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; }
    .wlefig text { font: 11.5px var(--font-data); fill: var(--fg); }
    .wlefig .m { fill: var(--muted); }
    .wlefig .foil { fill: var(--panel-2); stroke: var(--muted); stroke-width: 1.4; }
    .wlefig .chordline { stroke: var(--muted); stroke-dasharray: 4 3; }
    .wlefig .force { stroke: var(--load); stroke-width: 2.4; fill: none; }
    .wlefig .forcehead { fill: var(--load); }
    .wlefig .sc { stroke: var(--good); stroke-width: 2; fill: none; }
    .wlefig .lever { stroke: var(--warn); stroke-width: 1.6; }
    .wlefig .torque { stroke: var(--accent); stroke-width: 2; fill: none; }
    .wlefig .torquehead { fill: var(--accent); }
    .wlefig .axis { stroke: var(--muted); stroke-width: 1; }
    .wlefig .c-chord { stroke: var(--warn); stroke-width: 2; fill: none; stroke-dasharray: 6 4; }
    .wlefig .c-ell { stroke: var(--accent); stroke-width: 2; fill: none; stroke-dasharray: 2 3; }
    .wlefig .c-s { stroke: var(--load); stroke-width: 2.6; fill: none; }
    .wlefig .plan { fill: var(--panel-2); stroke: var(--muted); stroke-width: 1.2; }
    .wle-schrenk-table { border-collapse: collapse; font-size: 12.5px; margin-top: 6px; }
    .wle-schrenk-table th, .wle-schrenk-table td { border: 1px solid var(--line); padding: 3px 7px; text-align: right; text-transform: none; }
    .wle-schrenk-table th:first-child, .wle-schrenk-table td:first-child { text-align: left; }
    `;
    doc.head.append(st);
  }

  // A curved load as entered (total or peak) or as normalized by an engine (both, with basis).
  const curveOf = (p, u) => (Number.isFinite(p.total) && Number.isFinite(p.peak) ? p : { ...p, ...P.normalizeCurve(p, { min: -Infinity, max: Infinity, lengthUnit: (u && u.length) || '' }) });
  /** One-line description of a custom wing load. */
  function describe(p, u) {
    const xc = p.kind === 'table' && p.points[0] && p.points[0].length === 3 ? 'x/c from the table' : `x/c = ${fmt(p.fraction, 3)}`;
    if (p.kind === 'point') return `${fmt(p.force)} ${u.force} at y = ${fmt(p.position)} ${u.length}; ${xc}`;
    if (p.kind === 'distributed') return `${fmt(p.qStart)} → ${fmt(p.qEnd)} ${u.line} from ${fmt(p.start)} to ${fmt(p.end)} ${u.length}; ${xc}`;
    if (p.kind === 'elliptic' || p.kind === 'parabolic') {
      const n = curveOf(p, u);
      return `${p.kind} (${SHAPE_SHORT[p.shape]}) ${fmt(p.start)}–${fmt(p.end)} ${u.length}: F = ${fmt(n.total)} ${u.force}, w₀ = ${fmt(n.peak)} ${u.line}; ${xc}`;
    }
    if (p.kind === 'table') {
      const s = P.stats(p);
      return `table, ${p.points.length} rows (linear between rows) ${fmt(s.start)}–${fmt(s.end)} ${u.length}: F = ${fmt(s.total)} ${u.force}${p.source && p.source.filename ? ` · ${p.source.filename}` : ''}; ${xc}`;
    }
    if (p.kind === 'schrenk') return `Schrenk over the whole semi-span (this planform): F = ${fmt(p.total)} ${u.force}; ${xc}`;
    return p.kind;
  }

  /* ------------------------------------------------------------------ chord-position figure */
  /**
   * Section with the force line, the shear centre, the lever arm and the torque sign.
   * o: {outline:[[x,z]] (LE at x = 0, chord along +x), chord, xsc (null if unknown), fraction, F, units, y, width}
   */
  function chordFigure(o) {
    // Short labels only inside the drawing (no overlaps at any width); the numbers are in the caption.
    const W = Math.max(300, Math.min(560, o.width || 460)), H = 196, pad = 40;
    const c = o.chord, sx = (W - 2 * pad) / c;
    const zs = o.outline.map((p) => p[1]), zTop = Math.max(...zs), zBot = Math.min(...zs);
    const zMid = (zTop + zBot) / 2, cy = 104;
    const X = (x) => pad + x * sx, Z = (z) => cy - (z - zMid) * sx;
    const xF = o.fraction * c, F = o.F;
    const near = (x, upper) => { let best = upper ? zTop : zBot, d = Infinity; for (const [px, pz] of o.outline) if (Math.abs(px - x) < d && (upper ? pz >= zMid : pz <= zMid)) { d = Math.abs(px - x); best = pz; } return best; };
    let s = `<svg class="wlefig" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Section: force at x/c = ${fmt(o.fraction, 3)}${o.xsc != null ? `, shear centre at x/c = ${fmt(o.xsc / c, 3)}` : ''}; leading edge on the left`)}">`;
    s += `<defs><marker id="wleArrowF" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="forcehead"/></marker>
      <marker id="wleArrowT" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="torquehead"/></marker></defs>`;
    s += `<polygon class="foil" points="${o.outline.map(([x, z]) => `${r1(X(x))},${r1(Z(z))}`).join(' ')}"/>`;
    s += `<line class="chordline" x1="${r1(X(0))}" y1="${r1(Z(zMid))}" x2="${r1(X(c))}" y2="${r1(Z(zMid))}"/>`;
    s += `<text x="${r1(X(0))}" y="${H - 8}" class="m" text-anchor="start">LE (x/c = 0)</text><text x="${r1(X(c))}" y="${H - 8}" class="m" text-anchor="end">TE (1)</text>`;
    // force line: an upward force comes from below, a downward force from above
    const up = F >= 0, fx = X(xF), edge = up ? Z(near(xF, false)) + 3 : Z(near(xF, true)) - 3, far = Math.max(14, Math.min(H - 26, up ? edge + 48 : edge - 48));
    s += `<line class="force" x1="${r1(fx)}" y1="${r1(far)}" x2="${r1(fx)}" y2="${r1(edge)}" marker-end="url(#wleArrowF)"/>`;
    s += `<text x="${r1(fx + (fx > W - 60 ? -8 : 8))}" y="${r1(up ? far : far + 10)}" text-anchor="${fx > W - 60 ? 'end' : 'start'}">F</text>`;
    if (o.xsc != null && Number.isFinite(o.xsc)) {
      const xs = X(o.xsc), ys = Z(zMid), e = o.xsc - xF;
      s += `<circle class="sc" cx="${r1(xs)}" cy="${r1(ys)}" r="6"/><line class="sc" x1="${r1(xs - 9)}" y1="${r1(ys)}" x2="${r1(xs + 9)}" y2="${r1(ys)}"/><line class="sc" x1="${r1(xs)}" y1="${r1(ys - 9)}" x2="${r1(xs)}" y2="${r1(ys + 9)}"/>`;
      s += `<text x="${r1(xs)}" y="${r1(Z(zTop) - 30)}" text-anchor="middle">SC</text>`;
      // lever arm above the section, from the force line to the shear centre
      const ly = Z(zTop) - 14;
      if (Math.abs(fx - xs) > 2) {
        s += `<line class="lever" x1="${r1(fx)}" y1="${r1(ly)}" x2="${r1(xs)}" y2="${r1(ly)}"/><line class="lever" x1="${r1(fx)}" y1="${r1(ly - 5)}" x2="${r1(fx)}" y2="${r1(ly + 5)}"/><line class="lever" x1="${r1(xs)}" y1="${r1(ly - 5)}" x2="${r1(xs)}" y2="${r1(ly + 5)}"/>`;
        s += `<text x="${r1((fx + xs) / 2)}" y="${r1(ly - 4)}" text-anchor="middle">e</text>`;
      }
      // torque sense about the shear centre (seen from the root looking outboard, LE on the left):
      // nose-up = leading edge up = clockwise on the page
      const T = F * e;
      if (Math.abs(T) > 0) {
        const noseUp = T > 0, rr = 22, rad = (d) => (d * Math.PI) / 180, a0 = noseUp ? 210 : -30, a1 = noseUp ? 330 : -150;
        const p0 = [xs + rr * Math.cos(rad(a0)), ys + rr * Math.sin(rad(a0))], p1 = [xs + rr * Math.cos(rad(a1)), ys + rr * Math.sin(rad(a1))];
        s += `<path class="torque" d="M${r1(p0[0])} ${r1(p0[1])}A${rr} ${rr} 0 0 ${noseUp ? 1 : 0} ${r1(p1[0])} ${r1(p1[1])}" marker-end="url(#wleArrowT)"/>`;
        s += `<text x="${W / 2}" y="${H - 8}" text-anchor="middle">T about SC: ${noseUp ? 'nose-up' : 'nose-down'}</text>`;
      }
    } else s += `<text x="${W / 2}" y="22" text-anchor="middle" class="m">Solve the current inputs to locate the shear centre.</text>`;
    return s + '</svg>';
  }
  function chordCaption(o) {
    const u = o.units;
    if (o.xsc == null || !Number.isFinite(o.xsc)) return 'Bending (V and M) uses only F and its span station. Torsion uses the offset of the force line from the shear centre, which needs a solved model.';
    const e = o.xsc - o.fraction * o.chord, T = o.F * e;
    return `At y = ${fmt(o.y)} ${u.length} (chord ${fmt(o.chord)} ${u.length}): F = ${signed(o.F)} ${u.force} (upward +) at x_F = ${fmt(o.fraction * o.chord)} ${u.length}; the shear centre is at x_sc = ${fmt(o.xsc)} ${u.length}. ` +
      `<b>Bending</b>: V and M use only F and its span station; x/c does not change them. <b>Torsion</b>: T = F·(x_sc − x_F) = ${signed(T)} ${u.moment} about the shear centre, ${T > 0 ? '<b>nose-up</b>' : T < 0 ? '<b>nose-down</b>' : 'zero'} (nose-up +). ` +
      'An upward force aft of the shear centre twists the nose down; moving it to the same distance ahead reverses the sign; a force through this section\'s shear centre adds no torque here. ' +
      (o.note || '') + ' Section seen from the root looking outboard, leading edge on the left.';
  }

  /* ------------------------------------------------------------------ Schrenk figure */
  // Simpson integration of f on [0, L] with n (even) panels.
  function simpson(f, L, n = 2000) { const h = L / n; let s = f(0) + f(L); for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(i * h); return (s * h) / 3; }
  /**
   * Chord-proportional, elliptic and Schrenk loads of total F on one semi-span for a chord law c(y).
   * linear: [rootChord, tipChord] gives exact chord integrals for a straight taper.
   */
  function schrenkData(L, chord, F = 1, linear = null) {
    let A, Ay;
    if (linear) { const [cr, ct] = linear; A = 0.5 * (cr + ct) * L; Ay = (L * L * (cr + 2 * ct)) / 6; }
    else { A = simpson(chord, L); Ay = simpson((y) => y * chord(y), L); }
    const wc = (y) => (F * chord(y)) / A, we = (y) => ((4 * F) / (Math.PI * L)) * Math.sqrt(Math.max(0, 1 - (y / L) ** 2)), ws = (y) => 0.5 * (wc(y) + we(y));
    const yc = Ay / A, ye = (4 * L) / (3 * Math.PI), yS = 0.5 * (yc + ye);
    return { L, F, A, wc, we, ws, stats: { chord: { F, ybar: yc, M: F * yc }, ellipse: { F, ybar: ye, M: F * ye }, schrenk: { F, ybar: yS, M: F * yS } } };
  }
  /** Two-panel teaching figure (or one panel): planform chord sketch above the three spanwise loads. */
  function schrenkFigure(panels, opts = {}) {
    const W = Math.max(320, Math.min(980, opts.width || 760)), n = panels.length, gap = 18, pw = (W - gap * (n - 1)) / n, H = 280;
    let s = `<svg class="wlefig" style="max-width:${W}px" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Schrenk approximation: chord-proportional, elliptic and Schrenk span loads of equal total force')}">`;
    panels.forEach((p, k) => {
      const x0 = k * (pw + gap), padL = 40, padR = 10, top = 22, planH = 52, gTop = top + planH + 26, gH = H - gTop - 34;
      const d = p.data, L = d.L, cmax = Math.max(...Array.from({ length: 81 }, (_, i) => p.chord((L * i) / 80)));
      const X = (y) => x0 + padL + ((pw - padL - padR) * y) / L;
      s += `<text x="${r1(x0 + pw / 2)}" y="14" text-anchor="middle">${esc(p.title)}</text>`;
      // planform chord sketch (chord length only; Schrenk ignores sweep)
      const ys = Array.from({ length: 81 }, (_, i) => (L * i) / 80), half = (y) => (planH / 2) * (p.chord(y) / cmax), mid = top + planH / 2;
      s += `<polygon class="plan" points="${[...ys.map((y) => `${r1(X(y))},${r1(mid - half(y))}`), ...ys.slice().reverse().map((y) => `${r1(X(y))},${r1(mid + half(y))}`)].join(' ')}"/>`;
      s += `<text x="${r1(X(0))}" y="${r1(top + planH + 14)}" class="m">root</text><text x="${r1(X(L))}" y="${r1(top + planH + 14)}" class="m" text-anchor="end">tip</text>`;
      const wmax = Math.max(...ys.map((y) => Math.max(d.wc(y), d.we(y), d.ws(y)))) * 1.05;
      const Y = (w) => gTop + gH - (gH * w) / wmax;
      s += `<line class="axis" x1="${r1(X(0))}" y1="${r1(Y(0))}" x2="${r1(X(L))}" y2="${r1(Y(0))}"/><line class="axis" x1="${r1(X(0))}" y1="${r1(gTop)}" x2="${r1(X(0))}" y2="${r1(Y(0))}"/>`;
      const curve = (fn, cls) => `<polyline class="${cls}" points="${Array.from({ length: 161 }, (_, i) => (L * i) / 160).map((y) => `${r1(X(y))},${r1(Y(fn(y)))}`).join(' ')}"/>`;
      s += curve(d.wc, 'c-chord') + curve(d.we, 'c-ell') + curve(d.ws, 'c-s');
      // centroid markers
      for (const [key, cls] of [['chord', 'c-chord'], ['ellipse', 'c-ell'], ['schrenk', 'c-s']]) {
        const yb = d.stats[key].ybar;
        s += `<line class="${cls}" x1="${r1(X(yb))}" y1="${r1(Y(0) + 2)}" x2="${r1(X(yb))}" y2="${r1(Y(0) + 10)}"/>`;
      }
      s += `<text x="${r1(X(0) - 4)}" y="${r1(gTop + 8)}" text-anchor="end" class="m">w</text><text x="${r1(X(L / 2))}" y="${r1(H - 12)}" text-anchor="middle" class="m">y from 0 (root) to L (tip)</text>`;
    });
    const sw = (cls) => `<svg class="wlefig" style="display:inline-block;width:30px;height:12px;border:0;background:none;vertical-align:middle" viewBox="0 0 30 12"><line class="${cls}" x1="2" y1="6" x2="28" y2="6"/></svg>`;
    return s + `</svg><p class="wlefig-cap">${sw('c-chord')} chord-proportional F·c(y)/∫c dy &nbsp; ${sw('c-ell')} elliptic (4F/πL)√(1 − (y/L)²) &nbsp; ${sw('c-s')} Schrenk mean. Ticks on the axis mark each resultant location ȳ; the planform strip shows only the chord length c(y).</p>`;
  }
  function schrenkTable(panels, u) {
    const rows = [];
    for (const p of panels) for (const [key, name] of [['chord', 'chord-proportional'], ['ellipse', 'elliptic'], ['schrenk', 'Schrenk mean']]) {
      const st = p.data.stats[key];
      rows.push(`<tr><td>${esc(p.short)} · ${name}</td><td>${fmt(st.F)} ${u.force}</td><td>${fmt(st.ybar / p.data.L, 4)} L = ${fmt(st.ybar)} ${u.length}</td><td>${fmt(st.M)} ${u.moment}</td></tr>`);
    }
    return `<table class="wle-schrenk-table"><tr><th>Wing · distribution</th><th>Area ∫w dy = F</th><th>Resultant at ȳ</th><th>Root moment ∫y w dy</th></tr>${rows.join('')}</table>`;
  }

  /* ------------------------------------------------------------------ editor */
  // Triangle parameters are interpolated on the actual picked skin mesh, not on a screen-space rectangle.
  function surfaceSample(vertices,weights) {
    if(vertices.length!==3||weights.length!==3||weights.some(w=>!Number.isFinite(w)||w < -1e-6)||Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-6)return null;
    if(vertices.some(v=>!Number.isFinite(v.station)||!Number.isFinite(v.fraction)||v.fraction < -1e-6||v.fraction>1+1e-6))return null;
    return {station:vertices.reduce((s,v,i)=>s+v.station*weights[i],0),fraction:Math.max(0,Math.min(1,vertices.reduce((s,v,i)=>s+v.fraction*weights[i],0)))};
  }
  function surfacePicker(canvas,sample,prepare) {
    return accept=>{
      const restore=prepare();let down=null,active=true,dot=null;
      const begin=e=>{if(e.button===undefined||e.button===0)down={x:e.clientX,y:e.clientY};};
      const end=e=>{if(!active||!down)return;const d=down;down=null;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>6)return;const p=sample(e);if(p){if(dot)dot.remove();dot=canvas.ownerDocument.createElement('span');dot.textContent='⊙';dot.title='Selected location only — not an applied force';Object.assign(dot.style,{position:'fixed',left:`${e.clientX-10}px`,top:`${e.clientY-15}px`,color:'#0873e8',background:'white',borderRadius:'50%',fontSize:'24px',pointerEvents:'none',zIndex:10000});canvas.ownerDocument.body.appendChild(dot);accept(p);}};
      const abort=()=>{down=null;};
      canvas.style.cursor='crosshair';canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',abort);
      return ()=>{active=false;if(dot)dot.remove();canvas.removeEventListener('pointerdown',begin);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',abort);canvas.style.cursor='';if(restore)restore();};
    };
  }
  /**
   * Mount the custom-load editor in container. adapter = {
   *   workspace:'printed'|'d520', units:{length, line, force, moment}, ids:{...element ids}, kindValue:{canonical:option},
   *   deleteAttr, range():{min, max, pointMin}, items(), mode():'none'|'custom'|'flight'|'tip',
   *   validate(items) (throws), apply(items, note), flight:{label, apply()} | null, allowSchrenk,
   *   refStation, refLabel, section(y) -> {outline, chord, xsc} | null, defaults:{...}, note
   * }
   */
  function mount(container, ad) {
    const doc = container.ownerDocument || document;
    injectStyles(doc);
    const id = ad.ids, u = ad.units;
    const kinds = FORM_KINDS.filter(([k]) => k !== 'schrenk' || ad.allowSchrenk);
    const configurableFlight=!!ad.flight?.configure,flightPrefix=id.flight+'Input';
    if(configurableFlight)kinds.push(['flight','Lift from aircraft mass · n m g / 2']);
    const val = (k) => ad.kindValue[k] || k, canon = (v) => (Object.entries(ad.kindValue).find(([, x]) => x === v) || [v])[0];
    const d = typeof ad.defaults === 'function' ? ad.defaults() : ad.defaults || {};
    const field = (fid, label, value, extra = '') => `<div class="field"><label for="${fid}">${label}</label><input id="${fid}" type="number" step="any" value="${value}" aria-describedby="${fid}Error" ${extra}><small id="${fid}Error" class="wle-err"></small></div>`;
    const select = (fid, label, options, value) => `<div class="field"><label for="${fid}">${label}</label><select id="${fid}">${options.map(([v, t]) => `<option value="${v}"${v === value ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`;
    container.innerHTML = `<div class="wle" data-workspace="${ad.workspace}">
      ${ad.selfWeight?`<label><input type="checkbox" class="wle-self-weight"> Include wing self-weight</label><small>Gravity: 1 g downward, from the mass of this semi-wing. Separate from flight inertia relief.</small>`:''}
      <form id="${id.form}" class="callout wle-form" novalidate><h3>Add a load to the current wing</h3>
        <div class="wle-submitbar" style="position:sticky;top:0;z-index:3;background:var(--panel,#fff);padding:8px 0"><button class="btn primary" type="submit">Add load</button><p class="wle-draft-error wle-err" role="alert"></p><p class="note" style="margin:4px 0">Draft only until confirmed. Add load registers the force and updates the analysis; Solve alone does not register this form.</p></div>
        ${ad.pickOnModel ? '<button class="btn wle-pick" type="button" aria-pressed="false">⌖ Pick on 3-D wing</button><p class="note">Select the shape below, then pick on the undeformed skin. A point force needs one click; a line load needs start and end clicks. The first click fixes x/c for the whole interval. Schrenk uses the whole span. Picking only fills coordinates: enter magnitude and confirm Add load. No automatic force. Cancel with Esc.</p>' : ''}
        ${ad.showDeformation ? '<button class="btn wle-show-deformation" type="button">Show bending &amp; twist</button>' : ''}
        ${select(id.kind, 'Load type', kinds.map(([k, t]) => [val(k), t]), val('point'))}
        ${configurableFlight?`<fieldset class="wle-flight" hidden><legend>Flight-like lift</legend>${field(flightPrefix+'Mass','Total aircraft mass (kg)',ad.flight.values().aircraftMass)}${field(flightPrefix+'N','Load factor n (1 = steady level cruise)',ad.flight.values().loadFactor)}${select(flightPrefix+'Shape','Spanwise lift distribution',[['elliptic','Elliptic'],['schrenk','Schrenk'],['uniform','Uniform'],['planform','Proportional to chord'],['tip','Tip-force approximation · not distributed']],ad.flight.values().distribution)}${field(flightPrefix+'Xc','Lift chord position x/c',ad.flight.values().liftFraction)}${select(flightPrefix+'Relief','Wing inertia relief',[['false','Ignored · prescribed lift only'],['true','Included · subtract wing inertia loading']],String(ad.flight.values().inertiaRelief))}<p class="note">Each semi-wing receives n × aircraft mass × 9.81 / 2 N of gross lift. This replaces the current load case. The distribution is prescribed, not calculated from the airfoil. With inertia relief the net structural force differs from gross lift.</p></fieldset>`:''}
        <p class="note wle-range"></p>${field(id.a, 'Point station or start', d.a)}${field(id.b, 'Distributed end', d.b)}${field(id.P, `Point force (${u.force}, upward +)`, d.P)}
        ${field(id.q0, `Start intensity (${u.line})`, d.q0)}${field(id.q1, `End intensity (${u.line})`, d.q1)}
        ${select(id.shape, 'Where is the maximum?', [['start', 'At the start (root side), zero at the end'], ['end', 'At the end (tip side), zero at the start'], ['middle', 'Symmetric: zero at both ends, maximum in the middle']], 'start')}
        ${select(id.basis, 'Enter', [['total', 'Total force F'], ['peak', 'Peak intensity w₀']], 'total')}
        ${field(id.value, `Total force F (${u.force}, upward +)`, d.total)}
        ${field(id.xc, 'Chord position x/c (0 = leading edge, 1 = trailing edge)', d.xc)}
        <p class="wle-law" id="${id.law}" hidden></p>
        <p class="note"><b>Total F (${esc(u.force)}) ≠ intensity q (${esc(u.line)}).</b> Total force is the signed area under q(y). Curved loads accept either F or peak w₀; the other is calculated, not entered independently. Positions and the maximum-location selector define the supported nonlinear shape.</p>
        <label>Profile display scale <select class="wle-scale"><option value="independent">Independent height · inspect shape</option><option value="common">Shared intensity scale · compare loads</option></select></label>
        <div class="wle-live-preview" aria-live="polite"></div>
        <button class="btn primary" type="submit">Add load</button>
        <p class="note">The first custom load replaces any flight or tip case; further loads are superposed (signed). Curved loads are integrated exactly, not split into straight segments.</p>
      </form>
      <div id="${id.list}" class="wle-list"></div>
      <div class="lesson-actions"><button class="btn" type="button" id="${id.clear}">${configurableFlight?'Clear applied loads':'Clear custom loads'}</button>${ad.flight&&!configurableFlight ? `<button class="btn" type="button" id="${id.flight}">${esc(ad.flight.label)}</button>` : ''}</div>
      <p id="${id.status}" class="wle-status" role="status"></p>
      <figure class="wle-chordfig"><div id="${id.chord}"></div><figcaption id="${id.chord}Cap"></figcaption></figure>
      <details class="wle-csv" id="${id.csv}"><summary>Import a spanwise line-load table (CSV)</summary>
        ${P.powerControls(id.csv,u)}
        <p class="note">Header with units: <code>${P.CSV_SPECS[ad.workspace].columns.join(',')}</code> and optionally <code>,x_over_c</code>. 2–${P.LIMITS.tableRows} rows, stations strictly increasing within ${fmt(ad.range().min)}–${fmt(ad.range().max)} ${u.length}; w upward +. The load is linear between rows and zero outside the first and last row; nothing is resampled or truncated. <button class="btn" type="button" id="${id.csv}Template">Download template</button></p>
        <div class="field"><label for="${id.csv}File">CSV file</label><input type="file" id="${id.csv}File" accept=".csv,text/csv,text/plain"></div>
        <div class="field"><label for="${id.csv}Text">…or paste the table</label><textarea id="${id.csv}Text" rows="5" spellcheck="false"></textarea></div>
        ${field(id.csv + 'Xc', 'x/c for a table without an x_over_c column', d.xc)}
        <div class="lesson-actions"><button class="btn" type="button" id="${id.csv}Preview">Preview table</button></div>
        <div id="${id.csv}Out" role="status" aria-live="polite"></div>
        <fieldset id="${id.csv}Mode" hidden><legend>Apply the table</legend><label><input type="radio" name="${id.csv}Mode" value="add" checked> Add it to the current custom loads</label><label><input type="radio" name="${id.csv}Mode" value="replace"> Replace all current loads with it</label></fieldset>
        <div class="lesson-actions"><button class="btn primary" type="button" id="${id.csv}Apply" disabled>Apply table</button><button class="btn" type="button" id="${id.csv}Cancel">Cancel</button></div>
      </details>
    </div>`;
    const $ = (sel) => container.querySelector(sel);
    const byId = (x) => container.querySelector('#' + x);
    const status = (t,bad=false) => { const box=byId(id.status);box.innerHTML=t;if(bad||box.querySelector('.wle-err')){box.tabIndex=-1;doc.defaultView.WingLabUI?.showError?.(box.textContent,container.querySelector('[aria-invalid="true"],input:invalid,select:invalid')||box);} };
    let stopPick=null,firstPick=null;
    function cancelPick() {if(stopPick)stopPick();stopPick=null;firstPick=null;const b=container.querySelector('.wle-pick');if(b){b.textContent='⌖ Pick on 3-D wing';b.setAttribute('aria-pressed','false');}}
    function acceptPick(p) {
      const range=ad.range();
      if(!p||!Number.isFinite(p.station)||!Number.isFinite(p.fraction)||p.station<range.min||p.station>range.max||p.fraction<0||p.fraction>1){status(`<span class="wle-err">Pick visible skin between ${fmt(range.min)} and ${fmt(range.max)} ${esc(u.length)}. No load changed.</span>`);return false;}
      const kind=canon(byId(id.kind).value), point=kind==='point'||kind==='schrenk';
      if(!point&&!firstPick){firstPick={...p};status(`Start selected at y = ${fmt(p.station)} ${esc(u.length)}, x/c = ${fmt(p.fraction,4)}. Click the other end; x/c stays fixed at this first value.`);return false;}
      const first=firstPick||p;
      if(!point&&Math.abs(p.station-first.station)<1e-9*Math.max(1,range.max)){status('Choose a different span station for the end of the line load.');return false;}
      byId(id.a).value=point?p.station:Math.min(first.station,p.station);
      byId(id.b).value=point?p.station:Math.max(first.station,p.station);
      byId(id.xc).value=first.fraction;
      for(const k of [id.P,id.q0,id.q1,id.value])byId(k).value='';
      visible();cancelPick();
      status(`Selection only: ${kind==='schrenk'?'whole semi-span':`y = ${fmt(+byId(id.a).value)}${point?'':`–${fmt(+byId(id.b).value)}`} ${esc(u.length)}`}, x/c = ${fmt(first.fraction,4)}. Enter signed magnitude (upward +) and press Add load. Nothing has been applied.`);
      const input=byId(kind==='point'?id.P:kind==='rampUp'?id.q1:['elliptic','parabolic','schrenk'].includes(kind)?id.value:id.q0);
      input.scrollIntoView&&input.scrollIntoView({block:'center'});input.focus();return true;
    }
    const pickButton=container.querySelector('.wle-pick');
    const deformationButton=container.querySelector('.wle-show-deformation');
    if(deformationButton)deformationButton.onclick=()=>{cancelPick();try{ad.showDeformation();}catch(e){status(`<span class="wle-err">${esc(e.message)}</span>`);}};
    if(pickButton)pickButton.onclick=()=>{if(stopPick){cancelPick();status('3-D selection cancelled. Loads unchanged.');return;}try{firstPick=null;stopPick=ad.pickOnModel(acceptPick);pickButton.textContent='Cancel 3-D picking';pickButton.setAttribute('aria-pressed','true');status('Click visible wing skin; orbit is paused during picking. Empty space does nothing. Coordinates use the undeformed model.');}catch(e){cancelPick();status(`<span class="wle-err">${esc(e.message)}</span>`);}};
    if(pickButton)doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&stopPick){cancelPick();status('3-D selection cancelled. Loads unchanged.');}});
    if(pickButton&&doc.defaultView)for(const name of ['wing-learning-stage','wing-show','metal-wing-open'])doc.defaultView.addEventListener(name,cancelPick);
    const readNum = (fid, label) => {
      const raw = String(byId(fid).value).trim(), v = raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(v)) throw new Error(`${label}: enter a finite number.`);
      return v;
    };
    function syncReliefAvailability(){
      if(!configurableFlight)return;
      const select=byId(flightPrefix+'Relief'),allowed=ad.flight.allowInertiaRelief?ad.flight.allowInertiaRelief():true;
      const included=select.querySelector('option[value="true"]');included.disabled=!allowed;
      if(!allowed)select.value='false';select.disabled=!allowed;
      select.closest('.field').hidden=!allowed;
      const explanation=select.closest('fieldset').querySelector('p.note');
      explanation.textContent='Each semi-wing receives n × aircraft mass × 9.81 / 2 N of gross lift. This replaces the current load case. The distribution is prescribed, not calculated from the airfoil.'+(allowed?' With inertia relief the net structural force differs from gross lift.':' Include wing self-weight applies the downward 1-g weight separately.');
    }
    function flightCase(){
      syncReliefAvailability();
      const v={kind:'flight',aircraftMass:readNum(flightPrefix+'Mass','Aircraft mass'),loadFactor:readNum(flightPrefix+'N','Load factor'),distribution:byId(flightPrefix+'Shape').value,liftFraction:readNum(flightPrefix+'Xc','Lift position'),inertiaRelief:byId(flightPrefix+'Relief').value==='true'};
      if(v.aircraftMass<=0)throw Error('Aircraft mass must be greater than zero.');
      if(v.liftFraction<0||v.liftFraction>1)throw Error('Lift position x/c must be between 0 and 1.');
      ad.flight.validate?.(v);return v;
    }
    function visible() {
      const k = canon(byId(id.kind).value), point = k === 'point', curve = k === 'elliptic' || k === 'parabolic', schrenk = k === 'schrenk';
      const flight=k==='flight';syncReliefAvailability();if(configurableFlight)$('.wle-flight').hidden=!flight;
      const show = { [id.a]: !schrenk, [id.b]: !point && !schrenk, [id.P]: point, [id.q0]: ['uniform', 'rampDown', 'trapezoid'].includes(k), [id.q1]: ['rampUp', 'trapezoid'].includes(k),
        [id.shape]: curve, [id.basis]: curve, [id.value]: curve || schrenk, [id.xc]: true };
      for (const [fid, requested] of Object.entries(show)) { const on=requested&&!flight,e = byId(fid); e.closest('.field').hidden = !on; e.disabled = !on; if (e.tagName === 'INPUT') e.required = on; }
      if(pickButton)pickButton.hidden=flight;$('.wle-range').hidden=flight;$('.wle-scale').closest('label').hidden=flight;
      byId(id.form).querySelector('h3').textContent=flight?'Apply aircraft lift to the semi-wing':'Add a load to the current wing';
      container.querySelectorAll('button[type="submit"]').forEach(b=>b.textContent=flight?'Apply lift case':'Add load');
      container.querySelector(`label[for="${id.a}"]`).textContent = point ? `Point station y (${u.length} from root)` : `Start station a (${u.length})`;
      container.querySelector(`label[for="${id.b}"]`).textContent = `End station b (${u.length})`;
      container.querySelector(`label[for="${id.q0}"]`).textContent = k === 'uniform' ? `Uniform intensity q (${u.line}, upward +)` : `Start intensity q(a) (${u.line}, upward +)`;
      container.querySelector(`label[for="${id.q1}"]`).textContent = `End intensity q(b) (${u.line}, upward +)`;
      const total = schrenk || byId(id.basis).value === 'total';
      const bounds=ad.range();$('.wle-range').textContent=`Allowed stations: ${fmt(bounds.min)}–${fmt(bounds.max)} ${u.length} from root. Enter bounds within this interval; no load is clipped or moved automatically.`;
      for(const fid of [id.a,id.b]){byId(fid).min=bounds.min;byId(fid).max=bounds.max;}
      if (schrenk) {byId(id.basis).value = 'total';lastBasis='total';}
      container.querySelector(`label[for="${id.value}"]`).textContent = total ? `Total force F (${u.force}, upward +)` : `Peak intensity w₀ (${u.line}, upward +)`;
      law(); chord();livePreview();
    }
    let editingIndex=null;
    function candidateItems(p){const base=ad.mode()==='custom'?[...ad.items()]:[];if(editingIndex===null)return [...base,p];if(!base[editingIndex])throw new Error('This load no longer exists. Close and select it again.');base[editingIndex]=p;return base;}
    function newLoad(){editingIndex=null;const flight=configurableFlight&&canon(byId(id.kind).value)==='flight';byId(id.form).querySelector('h3').textContent=flight?'Apply aircraft lift to the semi-wing':'Add a load to the current wing';container.querySelectorAll('button[type="submit"]').forEach(b=>b.textContent=flight?'Apply lift case':'Add load');}
    function edit(i){
      const p=ad.items()[i];if(!p)return false;cancelPick();newLoad();
      if(p.kind==='table'){openCsv(i);return true;}
      editingIndex=i;byId(id.kind).value=val(p.kind==='distributed'?'trapezoid':p.kind);
      byId(id.xc).value=p.fraction;
      if(p.kind==='point'){byId(id.a).value=p.position;byId(id.P).value=p.force;}
      else if(p.kind==='schrenk')byId(id.value).value=p.total;
      else {byId(id.a).value=p.start;byId(id.b).value=p.end;if(p.kind==='distributed'){byId(id.q0).value=p.qStart;byId(id.q1).value=p.qEnd;}else{byId(id.shape).value=p.shape;byId(id.basis).value=p.total!==undefined?'total':'peak';lastBasis=byId(id.basis).value;byId(id.value).value=p[lastBasis];}}
      visible();byId(id.kind).dispatchEvent(new doc.defaultView.Event('change'));
      byId(id.form).querySelector('h3').textContent=`Edit load ${i+1}`;container.querySelectorAll('button[type="submit"]').forEach(b=>b.textContent='Apply changes');
      byId(p.kind==='point'?id.P:p.kind==='distributed'?id.q0:id.value).focus({preventScroll:true});return true;
    }
    function itemFromForm() {
      const p=parseItemFromForm();
      ad.validate(candidateItems(p));
      return p;
    }
    function parseItemFromForm() {
      const k = canon(byId(id.kind).value), xc = readNum(id.xc, 'Chord position x/c');
      if (!(xc >= 0 && xc <= 1)) throw new Error('Chord position x/c must be between 0 (leading edge) and 1 (trailing edge).');
      if (k === 'point') return { kind: 'point', position: readNum(id.a, 'Point station'), force: readNum(id.P, 'Point force'), fraction: xc };
      if (k === 'schrenk') return { kind: 'schrenk', total: readNum(id.value, 'Total force F'), fraction: xc };
      const a = readNum(id.a, 'Start station'), b = readNum(id.b, 'End station');
      if (k === 'elliptic' || k === 'parabolic') {
        const basis = byId(id.basis).value;
        return { kind: k, start: a, end: b, shape: byId(id.shape).value, [basis]: readNum(id.value, basis === 'total' ? 'Total force F' : 'Peak intensity w₀'), fraction: xc };
      }
      const q0 = k === 'rampUp' ? 0 : readNum(id.q0, 'Start intensity'), q1 = k === 'rampDown' ? 0 : k === 'uniform' ? q0 : readNum(id.q1, 'End intensity');
      return { kind: 'distributed', start: a, end: b, qStart: q0, qEnd: q1, fraction: xc };
    }
    function law() {
      const out = byId(id.law), k = canon(byId(id.kind).value);
      if (k !== 'elliptic' && k !== 'parabolic' && k !== 'schrenk') { out.hidden = true; return; }
      let extra = '';
      try {
        const p = itemFromForm();
        if (k === 'schrenk') { const r = ad.range(); extra = ` Over ${fmt(r.min)}–${fmt(r.max)} ${u.length} with the chord law of this wing.`; }
        else {
          const n = curveOf(p, u);
          const yb = p.start + P.CENTROID[k][p.shape] * (p.end - p.start);
          extra = ` With ℓ = ${fmt(p.end - p.start)} ${u.length}: F = ${fmt(n.total)} ${u.force}, w₀ = ${fmt(n.peak)} ${u.line}; resultant at ȳ = ${fmt(yb)} ${u.length}; moment about ${ad.refLabel} = ${fmt(n.total * (yb - ad.refStation))} ${u.moment}.`;
        }
      } catch (e) { /* incomplete form: law only */ }
      out.innerHTML = k === 'schrenk'
        ? `<b>Schrenk</b>: w<sub>S</sub>(y) = ½[F·c(y)/∫c dy + (4F/πL)√(1 − (y/L)²)], the mean of a chord-proportional and an elliptic load with the same total F, over the whole semi-span. An unswept-planform approximation of the lift per unit span — not a chordwise pressure (Cp) distribution, not a CFD result.${esc(extra)}`
        : `${esc(LAW[k][byId(id.shape).value])}, s = (y − a)/ℓ. ${esc(LAW_F[k])}; ${esc(CENTROID_LAW[k][byId(id.shape).value])}.${esc(extra)}`;
      out.hidden = false;
    }
    function figureFor(p) {
      // station of the force line: point, or the resultant location of a distributed load
      let y, F;
      if (p.kind === 'point') { y = p.position; F = p.force; }
      else if (p.kind === 'schrenk') { const r = ad.range(); y = ad.schrenkCentroid ? ad.schrenkCentroid() : r.min + 0.45 * (r.max - r.min); F = p.total; }
      else {
        const q = p.kind === 'elliptic' || p.kind === 'parabolic' ? curveOf(p, u) : p;
        const s = P.stats(q); y = s.centroid ?? (s.start + s.end) / 2; F = s.total;
      }
      return { y, F };
    }
    function chord() {
      if(canon(byId(id.kind).value)==='flight'){byId(id.chord).closest('figure').hidden=true;return;}
      byId(id.chord).closest('figure').hidden=false;
      const fig = byId(id.chord), cap = byId(id.chord + 'Cap');
      let p;
      try { p = itemFromForm(); } catch (e) { fig.innerHTML = ''; cap.textContent = 'Enter a load to see its chord position, lever arm and torque.'; return; }
      let at;
      try { at = figureFor(p); } catch (e) { fig.innerHTML = ''; cap.textContent = ''; return; }
      const r = ad.range(), y = Math.min(r.max, Math.max(r.min, at.y));
      const sec = ad.section ? ad.section(y) : null;
      if (!sec) { fig.innerHTML = ''; cap.textContent = 'Solve the current inputs to draw the section and its shear centre.'; return; }
      const frac = p.kind === 'table' && p.points[0].length === 3 ? P.fractionAt(p, y) : p.fraction;
      const o = { outline: sec.outline, chord: sec.chord, xsc: sec.xsc, fraction: frac, F: at.F, units: u, y, width: Math.min(540, container.clientWidth || 460), note: ad.torqueNote || '' };
      fig.innerHTML = chordFigure(o);
      cap.innerHTML = chordCaption(o) + (p.kind !== 'point' ? ` For a distributed load the figure uses its resultant F at its resultant station; the solver integrates the torque along the load.` : '');
    }
    function renderList() {
      if(ad.selfWeight){const box=container.querySelector('.wle-self-weight');box.checked=ad.selfWeight.value();box.onchange=()=>{try{ad.selfWeight.set(box.checked);}catch(error){box.checked=ad.selfWeight.value();status(error.message,true);}};}
      const items = ad.items(), mode = ad.mode();
      byId(id.list).innerHTML = items.length
        ? items.map((p, i) => `<p>${i + 1}. ${esc(describe(p, u))} <button class="btn" type="button" ${ad.deleteAttr}="${i}">Remove</button> <button class="btn" type="button" data-wle-edit-load="${i}">${p.kind==='table'?'Edit table':'Edit load'}</button></p><details><summary>Load ${i+1}: profile &amp; resultant</summary>${profile(p,items)}</details>`).join('')
        : `<p class="wle-empty">${mode === 'flight' ? 'Flight-like loading is active; no custom loads.' : mode === 'tip' ? 'A tip-force case is active; no custom loads.' : 'No load defined. Add your own load.'}</p>`;
      container.querySelectorAll(`[${ad.deleteAttr}]`).forEach((b) => { b.onclick = () => { const i = +b.getAttribute(ad.deleteAttr); newLoad();tryApply(ad.items().filter((_, k) => k !== i), `Load ${i + 1} removed.`); }; });
      container.querySelectorAll('[data-wle-edit-load]').forEach((b) => { b.onclick = () => edit(+b.dataset.wleEditLoad); });
      if (ad.statusText) status(ad.statusText());
    }
    function profile(p,items=[]) {
      try {
        const drawable=q=>{if(q.kind!=='schrenk')return {p:q};if(!ad.schrenkProfile)throw new Error('Schrenk preview requires the current planform.');const d=ad.schrenkProfile(q.total);return {p:{kind:'table',points:Array.from({length:81},(_,i)=>[d.L*i/80,d.ws(d.L*i/80)])},summary:{total:q.total,firstMoment:d.stats.schrenk.M,centroid:d.stats.schrenk.ybar,start:0,end:d.L},note:'Schrenk curve sampled for drawing only; displayed resultant uses the chord/ellipse mean integrals, not the plotted polyline.'};};
        const peak=q=>{if(q.kind==='point')return 0;const raw=drawable(q).p,n=['elliptic','parabolic'].includes(raw.kind)?curveOf(raw,u):raw;return n.kind==='distributed'?Math.max(Math.abs(n.qStart),Math.abs(n.qEnd)):n.kind==='table'?Math.max(...n.points.map(r=>Math.abs(r[1]))):Math.abs(n.peak);};
        const v=drawable(p);
        return P.previewFigure(v.p,{units:u,positive:'up',reference:ad.refStation,summary:v.summary,note:v.note,scalePeak:$('.wle-scale').value==='common'?Math.max(peak(p),...items.map(peak)):null});
      }catch(e){return `<p class="note">${esc(e.message)}</p>`;}
    }
    function livePreview() {
      if(configurableFlight&&canon(byId(id.kind).value)==='flight'){
        try{const v=flightCase(),lift=v.loadFactor*v.aircraftMass*9.81/2;$('.wle-draft-error').textContent='';$('.wle-live-preview').innerHTML=`<b>Preview only · gross lift per semi-wing ${fmt(lift,5)} N</b><p>${fmt(v.aircraftMass)} kg × ${fmt(v.loadFactor)} × 9.81 / 2. ${v.inertiaRelief?'Inertia relief included; net force is reported after solving.':'No wing inertia relief.'} Apply lift case to register this load.</p>`;container.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);}catch(e){$('.wle-draft-error').textContent='Not applied: '+e.message;container.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);}return;
      }
      const out=$('.wle-live-preview'),range=ad.range(),a=byId(id.a),b=byId(id.b);
      for(const field of [a,b]){const v=field.value.trim()===''?NaN:Number(field.value);field.setAttribute('aria-invalid',String(!field.disabled&&Number.isFinite(v)&&(v<range.min||v>range.max)));}
      const invalidOrder=!a.disabled&&!b.disabled&&a.value!==''&&b.value!==''&&+b.value<=+a.value;
      if(invalidOrder){a.setAttribute('aria-invalid','true');b.setAttribute('aria-invalid','true');}
      for(const f of [a,b]){const bad=f.getAttribute('aria-invalid')==='true';f.style.borderColor=bad?'#c72839':'';byId(f.id+'Error').textContent=bad?(invalidOrder?'End must be greater than start.':`Use ${fmt(range.min)}–${fmt(range.max)} ${u.length}.`):'';}
      try{const p=itemFromForm();$('.wle-draft-error').textContent='';out.innerHTML='<b>Live input preview — not applied until Add load</b>'+profile(p,ad.items());container.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);}
      catch(e){$('.wle-draft-error').textContent='Not applied: '+e.message;out.innerHTML='<p class="wle-err" role="alert">Not applied: '+esc(e.message)+' Current loads and results are unchanged.</p>';container.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);}
    }
    $('.wle-scale').onchange=()=>{renderList();livePreview();if(ad.onScale)ad.onScale($('.wle-scale').value);};
    function tryApply(items, note) {
      cancelPick();
      try { ad.validate(items); } catch (e) { status(`<span class="wle-err">${esc(e.message)}</span> Nothing was changed.`); return false; }
      ad.apply(items, note); renderList(); return true;
    }
    byId(id.form).onsubmit = (e) => {
      cancelPick();
      e.preventDefault();
      if(configurableFlight&&canon(byId(id.kind).value)==='flight'){try{const v=flightCase();ad.flight.apply(v);newLoad();renderList();container.dispatchEvent(new doc.defaultView.CustomEvent('wing-load-applied',{bubbles:true,detail:ad.workspace}));}catch(error){status(`<span class="wle-err">${esc(error.message)}</span> Nothing was changed.`);}return;}
      let p;
      try { p = itemFromForm(); } catch (x) { status(`<span class="wle-err">${esc(x.message)}</span> Nothing was changed.`); return; }
      const note=editingIndex===null?'Load added.':`Load ${editingIndex+1} updated.`;
      if(tryApply(candidateItems(p),note)){newLoad();container.dispatchEvent(new doc.defaultView.CustomEvent('wing-load-applied',{bubbles:true,detail:ad.workspace}));}
    };
    byId(id.kind).onchange = ()=>{cancelPick();visible();}; byId(id.shape).onchange = visible;
    let lastBasis='total';
    byId(id.basis).onchange=()=>{const next=byId(id.basis).value,k=canon(byId(id.kind).value);try{if(['elliptic','parabolic'].includes(k)&&byId(id.value).value.trim()!==''){const p=P.normalizeCurve({kind:k,start:readNum(id.a,'Start'),end:readNum(id.b,'End'),shape:byId(id.shape).value,[lastBasis]:readNum(id.value,'Magnitude')},{min:-Infinity,max:Infinity,lengthUnit:u.length});byId(id.value).value=p[next];}}catch(e){}lastBasis=next;visible();};
    byId(id.form).addEventListener('input', () => { law(); chord();livePreview(); });
    byId(id.clear).onclick = () => {newLoad();tryApply([], 'All custom loads cleared: no load defined.');};
    if (ad.flight&&!configurableFlight) byId(id.flight).onclick = () => { newLoad();cancelPick();ad.flight.apply(); renderList(); };
    // ---------------------------------------------------------- CSV
    const csv = { filename: '', sha256: '', fromFile: null, candidate: null, text: null, edit: null };
    const csvMode = () => (csv.edit !== null ? 'edit' : (container.querySelector(`input[name="${id.csv}Mode"]:checked`) || { value: 'add' }).value);
    function openCsv(i) {
      const p = ad.items()[i]; csv.edit = i; byId(id.csv).open = true;
      byId(id.csv + 'Text').value = [P.CSV_SPECS[ad.workspace].columns.join(',') + (p.points[0].length === 3 ? ',x_over_c' : ''), ...p.points.map((r) => r.join(','))].join('\n') + '\n';
      csv.filename = (p.source && p.source.filename) || ''; csv.sha256 = (p.source && p.source.sha256) || ''; csv.fromFile = byId(id.csv + 'Text').value;
      if (p.points[0].length === 2) byId(id.csv + 'Xc').value = p.fraction;
      preview();
    }
    async function sha256Hex(text) {
      try {
        const g = typeof window !== 'undefined' ? window : globalThis;
        if (!(g.crypto && g.crypto.subtle && g.TextEncoder)) return '';
        const dig = await g.crypto.subtle.digest('SHA-256', new g.TextEncoder().encode(text));
        return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { return ''; }
    }
    function preview() {
      const out = byId(id.csv + 'Out'), apply = byId(id.csv + 'Apply'), text = byId(id.csv + 'Text').value, r = ad.range();
      apply.disabled = true; csv.candidate = null; csv.text = null; byId(id.csv + 'Mode').hidden = true;
      const res = P.parseCsv(text, { workspace: ad.workspace, min: r.min, max: r.max, ref: ad.refStation });
      if (!res.ok) { out.innerHTML = `<p class="wle-err">Not imported: ${res.errors.length} problem${res.errors.length > 1 ? 's' : ''}.</p><ul>${res.errors.slice(0, 12).map((e) => `<li>${esc(e)}</li>`).join('')}</ul><p class="note">The current loads are unchanged.</p>`; return; }
      let xc;
      try { xc = readNum(id.csv + 'Xc', 'x/c'); if (!(xc >= 0 && xc <= 1)) throw new Error('x/c must be between 0 and 1.'); } catch (e) { out.innerHTML = `<p class="wle-err">${esc(e.message)}</p>`; return; }
      const table = { kind: 'table', points: res.rows, fraction: xc, source: { filename: csv.filename || 'pasted table', rows: res.rows.length, ...(csv.sha256 ? { sha256: csv.sha256 } : {}) } };
      const mode = csvMode(), now = ad.mode() === 'custom' ? ad.items() : [];
      const items = mode === 'edit' ? now.map((p, i) => (i === csv.edit ? table : p)) : mode === 'replace' ? [table] : [...now, table];
      let problem = '';
      try { ad.validate(items); } catch (e) { problem = e.message; }
      const s = res.stats;
      out.innerHTML = `<p><b>Preview: ${s.rows} rows, ${s.segments} linear segments</b> from ${esc(table.source.filename)}${csv.sha256 ? ` (SHA-256 ${esc(csv.sha256.slice(0, 12))}…)` : ''}. Units: ${esc(res.spec.columns[0])} in ${esc(u.length)}, ${esc(res.spec.columns[1])} in ${esc(u.line)} (upward +)${res.hasFraction ? ', x/c from the table (linear along the span)' : `, x/c = ${fmt(xc, 3)} for every row`}.</p>
        <dl class="kv"><dt>Total force F = ∫w dy</dt><dd>${fmt(s.total)} ${u.force} (${s.total > 0 ? 'up' : s.total < 0 ? 'down' : 'zero'})</dd>
        <dt>Resultant station ȳ</dt><dd>${s.centroid === null ? 'undefined: zero net force (the table acts as a couple)' : `${fmt(s.centroid)} ${u.length}`}</dd>
        <dt>Bending moment about ${esc(ad.refLabel)}</dt><dd>${fmt(s.momentAboutRef)} ${u.moment}</dd>
        <dt>Range</dt><dd>${fmt(s.start)}–${fmt(s.end)} ${u.length}; w from ${fmt(s.wMin)} to ${fmt(s.wMax)} ${u.line}</dd></dl>
        ${res.warnings.length ? `<ul class="note">${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <details><summary>Rows</summary><table><tr><th>${esc(res.spec.columns[0])}</th><th>${esc(res.spec.columns[1])}</th>${res.hasFraction ? '<th>x_over_c</th>' : ''}</tr>${res.rows.map((row) => `<tr>${row.map((v) => `<td>${esc(fmt(v, 6))}</td>`).join('')}</tr>`).join('')}</table></details>
        ${problem ? `<p class="wle-err">Cannot apply: ${esc(problem)} The current loads are unchanged.</p>` : `<p class="note">${mode === 'edit' ? `Apply replaces table load ${csv.edit + 1} only.` : 'Choose add or replace, then Apply. Until then nothing changes.'}</p>`}`;
      out.insertAdjacentHTML('beforeend',P.previewFigure(table,{units:u,positive:'up',reference:ad.refStation}));
      if (problem) return;
      csv.candidate = table; csv.text = text; byId(id.csv + 'Mode').hidden = mode === 'edit'; apply.disabled = false;
    }
    function closeCsv() {
      Object.assign(csv, { filename: '', sha256: '', fromFile: null, candidate: null, text: null, edit: null });
      byId(id.csv + 'Text').value = ''; byId(id.csv + 'File').value = ''; byId(id.csv + 'Out').innerHTML = ''; byId(id.csv + 'Mode').hidden = true; byId(id.csv + 'Apply').disabled = true; byId(id.csv).open = false;
      // the next table is added again unless the user chooses Replace for it (Replace is never remembered)
      const add = byId(id.csv + 'Mode').querySelector('input[value="add"]'); if (add) add.checked = true;
    }
    byId(id.csv + 'Preview').onclick = preview;
    byId(id.csv + 'Cancel').onclick = closeCsv;
    byId(id.csv + 'Mode').addEventListener('change', preview);
    byId(id.csv + 'Text').addEventListener('input', () => { byId(id.csv + 'Apply').disabled = true; if (csv.fromFile !== byId(id.csv + 'Text').value) { csv.filename = ''; csv.sha256 = ''; } });
    byId(id.csv + 'Apply').onclick = () => {
      if (!csv.candidate || csv.text !== byId(id.csv + 'Text').value) { preview(); return; }
      const mode = csvMode(), now = ad.mode() === 'custom' ? ad.items() : [], table = csv.candidate;
      const items = mode === 'edit' ? now.map((p, i) => (i === csv.edit ? table : p)) : mode === 'replace' ? [table] : [...now, table];
      if (tryApply(items, `Line-load table applied (${table.points.length} rows, ${mode === 'replace' ? 'all previous loads replaced' : mode === 'edit' ? 'table updated' : 'added'}).`)) closeCsv();
    };
    byId(id.csv + 'File').onchange = async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      if (file.size > P.LIMITS.csvBytes) { byId(id.csv + 'Out').innerHTML = `<p class="wle-err">The file is larger than ${P.LIMITS.csvBytes / 1000} kB; a load table needs at most ${P.LIMITS.tableRows} rows. The current loads are unchanged.</p>`; return; }
      const text = await file.text();
      // the hash is of the file's own bytes; the text area shows them with its line breaks normalised to LF
      byId(id.csv + 'Text').value = text; csv.fromFile = byId(id.csv + 'Text').value; csv.filename = String(file.name).slice(0, 120); csv.sha256 = await sha256Hex(text);
      preview();
    };
    byId(id.csv + 'Template').onclick = () => { if (ad.download) ad.download(`${ad.workspace}_line_load_template.csv`, P.csvTemplate(ad.workspace), 'text/csv'); };
    byId(id.csv+'PowerPreview').onclick=()=>{try{const n=k=>readNum(id.csv+'Power'+k,k);const p=P.powerTable({start:n('A'),end:n('B'),total:n('F'),exponent:n('N'),shape:byId(id.csv+'PowerShape').value});byId(id.csv+'Text').value=P.CSV_SPECS[ad.workspace].columns.join(',')+'\n'+p.points.map(r=>r.join(',')).join('\n');preview();}catch(e){byId(id.csv+'Out').textContent=e.message;}};
    visible(); renderList();if(ad.onScale)ad.onScale($('.wle-scale').value);
    return { refresh() { renderList(); chord();livePreview(); }, openFlight(){if(!configurableFlight)return;const v=ad.flight.values();for(const [key,suffix]of [['aircraftMass','Mass'],['loadFactor','N'],['distribution','Shape'],['liftFraction','Xc'],['inertiaRelief','Relief']])byId(flightPrefix+suffix).value=String(v[key]);byId(id.kind).value=val('flight');newLoad();cancelPick();visible();}, cancelDraft(){newLoad();cancelPick();closeCsv();}, preview, openCsv, edit, newLoad, container, acceptPick, cancelPick };
  }

  /**
   * Keep one editor alive across panel re-renders: call before replacing the panel's HTML (detach), then
   * place() into the new slot. Form inputs, a CSV preview and its file name survive a re-solve.
   */
  function keeper(adapter) {
    let editor = null, parked = null;
    return {
      detach() { if (editor && editor.container.isConnected && editor.container.dataset.wleHome === '1') { parked = editor.container; parked.remove(); } },
      place(preferred, slot) {
        let host = preferred;
        if (!host) {
          if (parked && editor) { slot.replaceWith(parked); host = parked; }
          else { host = slot; host.dataset.wleHome = '1'; }
        }
        parked = null;
        if (!editor || editor.container !== host || !host.isConnected || !host.querySelector('.wle')) editor = mount(host, adapter);
        else editor.refresh();
        return editor;
      },
      get editor() { return editor; },
    };
  }

  return { mount, keeper, surfacePicker, surfaceSample, describe, chordFigure, chordCaption, schrenkData, schrenkFigure, schrenkTable, fmt, signed, LAW, LAW_F, CENTROID_LAW, SHAPE_TEXT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WingLoadsUI;
if (typeof window !== 'undefined') window.WingLoadsUI = WingLoadsUI;
