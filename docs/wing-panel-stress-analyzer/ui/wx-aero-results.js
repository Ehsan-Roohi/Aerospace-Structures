/* Wing AeroStruct aerodynamic result views. They draw the panel method's own stored output and nothing else:
 *  - surface Cp and p − p∞ = q∞ Cp at the panel centroids of the BASE mesh (result.base.chordwise; one solved mesh of
 *    the sequence, not extrapolated), placed on the planform from the strip edges, chords and quarter-chord points;
 *  - sectional Cp of one base-mesh strip;
 *  - spanwise lift of the delivered (extrapolated) strip load, the base mesh and every other mesh of the sequence;
 *  - extrapolated coefficients with their uncertainty, mesh convergence, consistency checks and the admission record.
 * Shown without a structural solve and withheld when the wing shape or the flow inputs changed after the solve.
 * The panel module computes no surface velocity field, viscous drag, stall, boundary layer or streamlines, so none
 * is offered. Browser: global WingAeroStructResults.install(env). */
window.WingAeroStructResults = (() => {
  'use strict';
  const VIEWS = [
    ['cp', 'Surface Cp · upper & lower'],
    ['dp', 'Surface p − p∞ (Pa)'],
    ['section', 'Sectional Cp vs x/c'],
    ['span', 'Spanwise lift'],
    ['coef', 'Coefficients & convergence'],
  ];
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const NEG = [[247, 247, 247], [146, 197, 222], [67, 147, 195], [33, 102, 172], [5, 48, 97]];      // suction (Cp < 0)
  const POS = [[247, 247, 247], [244, 165, 130], [214, 96, 77], [178, 24, 43], [103, 0, 31]];       // pressure (Cp > 0)
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sig = (v, d = 4) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2).replace('-', '−') : String(Number(v.toPrecision(d))).replace('-', '−'));
  const csvNum = (v) => (v == null || !Number.isFinite(v) ? '' : String(+v.toPrecision(10)));
  function colour(v, lo, hi) {
    const neg = v < 0, ramp = neg ? NEG : POS, t = neg ? (lo < 0 ? Math.min(1, v / lo) : 0) : (hi > 0 ? Math.min(1, v / hi) : 0);
    const f = t * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(f)), u = f - i, c = ramp[i].map((x, k) => Math.round(x + u * (ramp[i + 1][k] - x)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  // Panels of the base mesh on the planform: span y (mm) and chordwise x (mm, leading edge up). Strip edges and Cp are
  // the solver's; the leading edge and chord of a strip edge are interpolated between the strip midpoints.
  function surfaceField(base) {
    const strips = base.strips, field = base.chordwise;
    if (!Array.isArray(strips) || !Array.isArray(field) || strips.length !== field.length || strips.length < 2) return null;
    const mids = strips.map((s) => ({ y: s.yMid, le: s.quarterChordPoint_mm[0] - 0.25 * s.chord, c: s.chord }));
    const at = (y) => {
      let k = 0; while (k < mids.length - 2 && y > mids[k + 1].y) k++;
      const A = mids[k], B = mids[k + 1], t = (y - A.y) / ((B.y - A.y) || 1);
      return { le: A.le + t * (B.le - A.le), c: Math.max(0, A.c + t * (B.c - A.c)) };
    };
    const panels = [], q = base.flow.dynamicPressure_Pa;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    strips.forEach((s, j) => {
      const A = at(s.y0), B = at(s.y1);
      for (const side of ['upper', 'lower']) {
        const pts = field[j][side].map((p, i) => ({ i, xc: p[0], cp: p[1] })).sort((a, b) => a.xc - b.xc);
        const edges = [0, ...pts.slice(1).map((p, k) => (pts[k].xc + p.xc) / 2), 1];
        pts.forEach((p, k) => {
          const poly = [[s.y0, A.le + edges[k] * A.c], [s.y1, B.le + edges[k] * B.c], [s.y1, B.le + edges[k + 1] * B.c], [s.y0, A.le + edges[k + 1] * A.c]];
          for (const [y, x] of poly) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
          const mid = at(s.yMid);
          panels.push({ side, j, k, n: pts.length, xc: p.xc, cp: p.cp, dp: q * p.cp, y: s.yMid, y0: s.y0, y1: s.y1, chord: s.chord, x: mid.le + p.xc * mid.c, poly });
        });
      }
    });
    return { panels, xmin, xmax, ymin, ymax, strips: strips.length, q };
  }
  function extremes(panels, key) {
    let lo = null, hi = null;
    for (const p of panels) { if (!lo || p[key] < lo[key]) lo = p; if (!hi || p[key] > hi[key]) hi = p; }
    return { lo, hi };
  }
  const niceStep = (span, n) => { const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag; return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag; };

  function install(env) {
    const { el, ui, strip, view, state, openAero } = env;
    const select = el('select', { id: 'wxAeroView', class: 'tool', 'aria-label': 'Aerodynamic results' },
      el('option', { value: '', text: 'Aero results…' }), ...VIEWS.map(([v, t]) => el('option', { value: v, text: t })));
    const group = el('div', { class: 'wx-aero-sel', role: 'group', 'aria-label': 'Aerodynamic results' }, select);
    const title = el('h3', { id: 'wxArTitle' }), source = el('p', { class: 'wx-ar-src', id: 'wxArSource' });
    const station = el('select', { id: 'wxArStation', 'aria-label': 'Base-mesh strip for the sectional Cp', hidden: true });
    const clearBtn = el('button', { type: 'button', class: 'btn', id: 'wxArClear', text: 'Clear probes', hidden: true });
    const pngBtn = el('button', { type: 'button', class: 'btn', id: 'wxArPng', text: 'Save PNG' });
    const csvBtn = el('button', { type: 'button', class: 'btn', id: 'wxArCsv', text: 'Save CSV' });
    const backBtn = el('button', { type: 'button', class: 'btn', id: 'wxArBack', 'aria-label': 'Close the aerodynamic result and show the structural view' }, 'Back', el('span', { class: 'wx-long', text: ' to structure view' }));
    const canvas = el('canvas', { id: 'wxArCanvas', role: 'img', 'aria-label': 'Aerodynamic result' });
    const html = el('div', { id: 'wxArHtml', class: 'wx-ar-html', hidden: true });
    const notice = el('div', { id: 'wxArNotice', class: 'wx-ar-notice', hidden: true });
    const probeBox = el('div', { id: 'wxArProbe', class: 'wx-ar-probe', role: 'status', 'aria-live': 'polite' });
    const overlay = el('section', { id: 'wxAeroResult', class: 'wx-aero-result', hidden: true, 'aria-label': 'Aerodynamic result view' },
      el('header', { class: 'wx-ar-head' }, el('div', { class: 'wx-ar-titles' }, title, source), el('div', { class: 'wx-ar-tools' }, station, clearBtn, pngBtn, csvBtn, backBtn)),
      el('div', { class: 'wx-ar-body' }, canvas, html, notice), probeBox);
    const loading = view.querySelector('#loading');
    view.insertBefore(overlay, loading || null);
    let kind = '', probes = [], hits = [], sectionJ = 0, drawn = null;

    const download = (name, blob) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
    const data = () => { const s = state(); return s.status === 'ok' ? s : null; };
    const flowText = (b) => `V ${sig(b.flow.speed)} m/s · ρ ${sig(b.flow.density)} kg/m³ · α ${sig(b.flow.alphaDeg)}° · q∞ = ½ρV² = ${sig(b.flow.dynamicPressure_Pa)} Pa`;
    // The rounded tip replaces the outermost stations of the spanwise setting with its own strips, so the solved
    // strip count (wakeStrips) is reported as it is, with the rounding strips named inside it.
    const tipStrips = (b) => { const t = b.mesh && b.mesh.roundedTip; const n = t ? (Array.isArray(t.strips) ? t.strips.length : +t.strips) : 0; return Number.isFinite(n) ? n : 0; };
    const meshText = (b) => {
      const m = b.mesh, ns = m.wakeStrips || (b.chordwise ? b.chordwise.length : 0), t = tipStrips(b);
      return `base mesh: ${m.chordPanelsPerSurface} panels per surface along the chord × ${ns} spanwise strips${t ? ` (the outer ${t} round the tip; spanwise setting ${m.spanPanels})` : ''} = ${m.wingPanels} panels`;
    };

    function show(next) {
      kind = next; select.value = next; probes = []; probeBox.textContent = '';
      overlay.hidden = !next; strip.classList.toggle('wx-aero-active', !!next); view.classList.toggle('wx-aero-on', !!next);   // phones give the result view more height
      if (next) render();
    }
    const close = () => show('');
    select.addEventListener('change', () => show(select.value));
    backBtn.addEventListener('click', () => { close(); select.focus(); });
    for (const b of strip.querySelectorAll('[data-plot]')) b.addEventListener('click', close, true);
    const more = strip.querySelector('#wingMoreResults'); if (more) more.addEventListener('change', () => { if (more.value) close(); }, true);
    clearBtn.addEventListener('click', () => { probes = []; probeBox.textContent = ''; render(); });
    station.addEventListener('change', () => { sectionJ = +station.value; probes = []; render(); });

    function setNotice(text, withButton) {
      canvas.hidden = true; html.hidden = true; notice.hidden = false; notice.replaceChildren(el('p', { text }));
      if (withButton) { const b = el('button', { type: 'button', class: 'btn primary', text: 'Open Aerodynamics' }); b.addEventListener('click', () => openAero()); notice.append(b); }
      for (const b of [pngBtn, csvBtn, clearBtn]) b.disabled = true; station.hidden = true; probeBox.textContent = '';
    }
    function render() {
      if (!kind || overlay.hidden) return;
      const label = (VIEWS.find(([v]) => v === kind) || [, ''])[1];
      title.textContent = label;
      const s = state();
      if (s.status === 'none') { source.textContent = 'No aerodynamic solution in this session.'; setNotice('Open Aerodynamics, set the flow conditions and press Solve Aerodynamics. These results do not need a structural solve.', true); return; }
      if (s.status === 'running') { source.textContent = 'Solving the aerodynamic mesh sequence…'; setNotice('The aerodynamic solve is running; the result appears here when it finishes.', false); return; }
      if (s.status === 'stale') { source.textContent = 'Out of date: ' + s.why + '.'; setNotice(`These aerodynamic results belong to an earlier ${/flow/.test(s.why) ? 'set of flow inputs' : 'wing shape'} and are withheld. Press Solve Aerodynamics to compute the current case.`, true); return; }
      const { result, combined } = s, b = result.base;
      notice.hidden = true; pngBtn.disabled = false; csvBtn.disabled = false;
      station.hidden = kind !== 'section'; clearBtn.hidden = !['cp', 'dp', 'section', 'span'].includes(kind); clearBtn.disabled = !probes.length;
      pngBtn.hidden = kind === 'coef';
      if (kind === 'coef') { canvas.hidden = true; html.hidden = false; source.textContent = `${result.label} · ${flowText(b)}`; renderCoefficients(s); probeBox.textContent = ''; return; }
      html.hidden = true; canvas.hidden = false;
      if (kind === 'section') {
        if (station.options.length !== b.chordwise.length) station.replaceChildren(...b.chordwise.map((c, j) => el('option', { value: String(j), text: `Strip ${j + 1} · y = ${sig(c.y_mm)} mm (η ${sig(c.y_mm / (b.reference.span_mm / 2), 3)})` })));
        sectionJ = Math.min(sectionJ, b.chordwise.length - 1); station.value = String(sectionJ);
      }
      if (kind === 'span') {
        const fz = combined.rootWrench[2], cl = combined.coefficients.CL;
        source.textContent = `Semi-wing lift ${sig(fz.value)} ± ${sig(fz.uncertainty, 2)} N extrapolated (finest meshes ${sig(fz.finest)} N, base mesh ${sig(fz.base)} N); both halves ${sig(2 * fz.value)} N; CL ${sig(cl.value)} ± ${sig(cl.uncertainty, 2)}. Solid: strip load delivered to the structure (extrapolated over all ${result.levels.length} meshes); dashed: base mesh; grey: the other meshes. ${flowText(b)}.`;
      } else if (kind === 'section') {
        source.textContent = `Cp at the panel centroids of one strip of the ${meshText(b)} (one solved mesh, not extrapolated). ${flowText(b)}.`;
      } else {
        const f = surfaceField(b), key = kind === 'dp' ? 'dp' : 'cp', ex = f ? extremes(f.panels, key) : null, at = (p) => `${p.side} surface, y ${sig(p.y, 4)} mm, x/c ${sig(p.xc, 3)}`;
        source.textContent = `Panel-centroid values of the ${meshText(b)} (one solved mesh of the ${result.sequence} sequence, not extrapolated; the delivered structural load is extrapolated). ${ex ? `Minimum ${sig(ex.lo[key])} (${at(ex.lo)}); maximum ${sig(ex.hi[key])} (${at(ex.hi)}). ` : ''}${flowText(b)}.`;
      }
      draw(canvas, s);
    }
    function sizeCanvas(c) {
      const r = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(280, Math.floor(r.width)), H = Math.max(220, Math.floor(r.height));
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);   // CSS size follows the container (100%)
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, W, H };
    }
    function draw(c, s, exportSize) {
      const { ctx, W, H } = exportSize ? exportSize : sizeCanvas(c);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      let top = 0;
      if (exportSize) {   // the image carries its own title, case and source
        ctx.fillStyle = '#14212e'; ctx.font = `700 22px ${FONT}`; ctx.fillText(exportSize.title, 24, 34);
        ctx.font = `14px ${FONT}`; ctx.fillStyle = '#4e5f71'; wrapText(ctx, exportSize.source, 24, 58, W - 48, 18); top = 96;
      }
      if (kind === 'cp' || kind === 'dp') drawSurface(ctx, W, H, top, s, !exportSize);
      else if (kind === 'section') drawSection(ctx, W, H, top, s, !exportSize);
      else if (kind === 'span') drawSpan(ctx, W, H, top, s, !exportSize);
    }
    function wrapText(ctx, text, x, y, maxW, lh) {
      let line = '';
      for (const word of String(text).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = word; y += lh; } else line = t; }
      if (line) ctx.fillText(line, x, y);
    }
    // Colour-bar ticks: the two ends first (labelled min and max), then zero and the halves wherever they still fit.
    const tickOrder = (lo, hi) => [lo, hi, 0, lo / 2, hi / 2].filter((v, i, a) => a.indexOf(v) === i);
    const tickLabel = (v, lo, hi) => (v === hi ? 'max ' : v === lo ? 'min ' : '') + sig(v, 3);
    function colourbar(ctx, x, y, h, lo, hi, unit) {   // vertical, beside the maps
      const w = 16, steps = 120;
      for (let i = 0; i < steps; i++) { const v = hi - (hi - lo) * (i + 0.5) / steps; ctx.fillStyle = colour(v, lo, hi); ctx.fillRect(x, y + h * i / steps, w, h / steps + 0.6); }
      ctx.strokeStyle = '#7a8a9b'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.fillStyle = '#14212e'; ctx.font = `700 13px ${FONT}`; ctx.fillText(unit, x - 2, y - 10);
      ctx.font = `12px ${FONT}`;
      const placed = [];
      for (const v of tickOrder(lo, hi)) {
        const ty = y + h * (hi - v) / ((hi - lo) || 1);
        if (placed.some((p) => Math.abs(p - ty) < 15)) continue;
        placed.push(ty); ctx.fillRect(x + w, ty, 4, 1); ctx.fillText(tickLabel(v, lo, hi), x + w + 7, ty + 4);
      }
    }
    function colourbarH(ctx, x, y, w, lo, hi, unit) {   // horizontal, under the maps on narrow screens (low values left)
      const h = 12, steps = 120;
      for (let i = 0; i < steps; i++) { const v = lo + (hi - lo) * (i + 0.5) / steps; ctx.fillStyle = colour(v, lo, hi); ctx.fillRect(x + w * i / steps, y, w / steps + 0.6, h); }
      ctx.strokeStyle = '#7a8a9b'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.fillStyle = '#14212e'; ctx.font = `700 12px ${FONT}`; ctx.fillText(unit, x, y - 6);
      ctx.font = `11px ${FONT}`;
      const boxes = [];
      for (const v of tickOrder(lo, hi)) {
        const tx = x + w * (v - lo) / ((hi - lo) || 1), t = tickLabel(v, lo, hi), tw = ctx.measureText(t).width, bx = Math.min(x + w - tw, Math.max(x, tx - tw / 2));
        if (boxes.some(([a, b]) => bx < b + 6 && bx + tw > a - 6)) continue;
        boxes.push([bx, bx + tw]); ctx.fillRect(tx, y + h, 1, 4); ctx.fillText(t, bx, y + h + 15);
      }
    }
    function fit(ctx, options, maxW) {   // the first wording that fits maxW, else the last one shortened with an ellipsis
      for (const t of options) if (ctx.measureText(t).width <= maxW) return t;
      let t = options[options.length - 1];
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    }
    function drawSurface(ctx, W, H, top, s, interactive) {
      const b = s.result.base, f = surfaceField(b), key = kind === 'dp' ? 'dp' : 'cp', unit = kind === 'dp' ? 'p − p∞ (Pa)' : 'Cp';
      if (!f) { ctx.fillStyle = '#9a5800'; ctx.font = `14px ${FONT}`; ctx.fillText('This solution has no stored panel field to draw.', 20, top + 30); return; }
      const { lo, hi } = extremes(f.panels, key), vlo = Math.min(0, lo[key]), vhi = Math.max(0, hi[key]);
      const narrow = W < 560;   // narrow screens: the colour bar goes under the maps so the maps keep the width
      const left = narrow ? 34 : 54, right = narrow ? 12 : 120, titleH = 22, gap = 34, bottom = narrow ? 94 : 46, spanW = f.ymax - f.ymin, chordH = f.xmax - f.xmin;
      const stacked = Math.min((W - left - right) / spanW, (H - top - 2 * titleH - gap - bottom - 10) / (2 * chordH));
      const beside = Math.min((W - left - right - gap) / (2 * spanW), (H - top - titleH - bottom - 10) / chordH);
      const sc = Math.max(stacked, beside), sideBySide = beside > stacked, mapH = chordH * sc, mapW = spanW * sc;
      const used = sideBySide ? titleH + mapH + bottom : 2 * (titleH + mapH) + gap + bottom, y0 = top + 10 + Math.max(0, (H - top - 10 - used) / 2) + titleH;
      const origin = sideBySide ? { upper: [left, y0], lower: [left + mapW + gap, y0] } : { upper: [left, y0], lower: [left, y0 + mapH + gap + titleH] };
      const maps = { upper: origin.upper[1], lower: origin.lower[1] };
      const X = (y, side = 'upper') => origin[side][0] + (y - f.ymin) * sc, Y = (side, x) => maps[side] + (x - f.xmin) * sc;
      hits = [];
      for (const p of f.panels) {
        const pts = p.poly.map(([y, x]) => [X(y, p.side), Y(p.side, x)]);
        ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
        const c = colour(p[key], vlo, vhi); ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke();
        hits.push({ p, pts });
      }
      // titles: the longest wording that ends before the next map or the colour bar
      const barX = W - right + 28, titleEnd = narrow ? W - 8 : barX - 12;
      ctx.font = `700 13px ${FONT}`; ctx.fillStyle = '#14212e';
      ctx.fillText(fit(ctx, ['Upper surface (suction side), top view', 'Upper surface (suction side)', 'Upper surface'], (sideBySide ? origin.lower[0] - 12 : titleEnd) - origin.upper[0]), origin.upper[0], maps.upper - 8);
      ctx.fillText(fit(ctx, ['Lower surface, same top-view orientation', 'Lower surface, same orientation', 'Lower surface'], titleEnd - origin.lower[0]), origin.lower[0], maps.lower - 8);
      ctx.font = `12px ${FONT}`; ctx.fillStyle = '#4e5f71';
      for (const side of ['upper', 'lower']) {
        const lx = origin[side][0] - (narrow ? 26 : 30);
        if (side === 'upper' || !sideBySide) { ctx.fillText('LE', lx, maps[side] + 12); ctx.fillText('TE', lx, maps[side] + mapH); }
        if (side === 'lower' || sideBySide) {
          const edge = maps[side] + mapH, step = niceStep(spanW, sideBySide || narrow ? 4 : 6);
          for (let y = 0; y <= f.ymax + 1e-9; y += step) { const px = X(y, side), t = sig(y, 4); ctx.fillRect(px, edge + 2, 1, 5); ctx.fillText(t, px - ctx.measureText(t).width / 2, edge + 20); }
          ctx.fillText('span y (mm), root at left', X(f.ymin, side), edge + 36);
        }
      }
      if (narrow) colourbarH(ctx, left, maps.lower + mapH + 62, Math.min(W - left - 14, 420), vlo, vhi, unit);
      else colourbar(ctx, barX, maps.upper, Math.max(120, sideBySide ? mapH : maps.lower + mapH - maps.upper), vlo, vhi, unit);
      drawn = { f, key, unit };
      probes.forEach((pr, n) => {
        const h = hits.find((t) => t.p === pr) || hits.find((t) => t.p.side === pr.side && t.p.j === pr.j && t.p.k === pr.k); if (!h) return;
        const cx = h.pts.reduce((a, q) => a + q[0], 0) / 4, cy = h.pts.reduce((a, q) => a + q[1], 0) / 4;
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 2 * Math.PI); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#14212e'; ctx.font = `700 11px ${FONT}`; ctx.fillText(String(n + 1), cx - 3.5, cy + 4);
      });
      if (interactive) canvas.setAttribute('aria-label', `${unit} on the upper and lower surfaces, base mesh; minimum ${sig(lo[key])}, maximum ${sig(hi[key])}. Click a panel for its value.`);
    }
    const FRAME = { L: 70, R: 24 };
    function chartFrame(ctx, W, H, top, xr, yr, xl, yl, head = 1) {   // head = text rows reserved above the frame
      const L = FRAME.L, R = FRAME.R, T = top + 24 + 20 * head, B = 52, w = W - L - R, h = H - T - B;
      const X = (v) => L + (v - xr[0]) / (xr[1] - xr[0]) * w, Y = (v) => T + (yr[1] - v) / (yr[1] - yr[0]) * h;
      ctx.strokeStyle = '#d4dce5'; ctx.lineWidth = 1; ctx.fillStyle = '#4e5f71'; ctx.font = `12px ${FONT}`;
      const sx = niceStep(xr[1] - xr[0], w < 360 ? 4 : 8), sy = niceStep(yr[1] - yr[0], 6);
      for (let v = Math.ceil(xr[0] / sx) * sx; v <= xr[1] + 1e-9; v += sx) { const t = sig(v, 3); ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), T + h); ctx.stroke(); ctx.fillText(t, X(v) - ctx.measureText(t).width / 2, T + h + 16); }
      for (let v = Math.ceil(yr[0] / sy) * sy; v <= yr[1] + 1e-9; v += sy) { const t = sig(v, 3); ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + w, Y(v)); ctx.stroke(); ctx.fillText(t, L - 8 - ctx.measureText(t).width, Y(v) + 4); }
      ctx.strokeStyle = '#7a8a9b'; ctx.strokeRect(L + 0.5, T + 0.5, w, h);
      if (yr[0] < 0 && yr[1] > 0) { ctx.strokeStyle = '#4e5f71'; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(L + w, Y(0)); ctx.stroke(); }
      ctx.fillStyle = '#14212e'; ctx.font = `700 13px ${FONT}`; const xt = fit(ctx, [xl], w); ctx.fillText(xt, L + w / 2 - ctx.measureText(xt).width / 2, T + h + 38);
      ctx.save(); ctx.translate(18, T + h / 2); ctx.rotate(-Math.PI / 2); const yt = fit(ctx, [yl], h); ctx.fillText(yt, -ctx.measureText(yt).width / 2, 0); ctx.restore();
      return { X, Y, L, T, w, h };
    }
    // Legend and note above the plot frame, wrapped into as many rows as the width needs.
    const itemWidth = (ctx, label) => 32 + ctx.measureText(label).width + 22;
    function headRows(ctx, W, items, note) {
      ctx.font = `12px ${FONT}`;
      const maxW = W - FRAME.L - FRAME.R, rows = [[]]; let used = 0;
      for (const it of items) { const iw = itemWidth(ctx, it[0]); if (used + iw > maxW && rows[rows.length - 1].length) { rows.push([]); used = 0; } rows[rows.length - 1].push(it); used += iw; }
      const noteRow = note && used + 16 + ctx.measureText(note).width > maxW;   // the note gets its own row when it does not fit beside the legend
      return { rows, note, noteRow: !!noteRow, count: rows.length + (noteRow ? 1 : 0) };
    }
    function drawHead(ctx, fr, head) {
      ctx.font = `12px ${FONT}`;
      const rowY = (i) => fr.T - 26 - 20 * (head.count - 1 - i);
      head.rows.forEach((items, i) => {
        let x = fr.L; const y = rowY(i);
        for (const [label, colourValue, dash] of items) { ctx.strokeStyle = colourValue; ctx.lineWidth = 2.2; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 26, y - 4); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#14212e'; ctx.fillText(label, x + 32, y); x += itemWidth(ctx, label); }
      });
      if (head.note) {
        ctx.fillStyle = '#4e5f71';
        const y = head.noteRow ? rowY(head.count - 1) : rowY(head.rows.length - 1), t = head.noteRow ? fit(ctx, [head.note], fr.w) : head.note;
        ctx.fillText(t, head.noteRow ? fr.L : fr.L + fr.w - ctx.measureText(t).width, y);
      }
    }
    function drawSection(ctx, W, H, top, s, interactive) {
      const b = s.result.base, sec = b.chordwise[sectionJ], q = b.flow.dynamicPressure_Pa;
      const all = [...sec.upper, ...sec.lower].map((p) => -p[1]), lo = Math.min(...all), hi = Math.max(...all), pad = 0.06 * ((hi - lo) || 1);
      const head = headRows(ctx, W, [['upper surface', '#2166ac'], ['lower surface', '#b2182b', [7, 5]]],
        `Strip ${sectionJ + 1} of ${b.chordwise.length}: y = ${sig(sec.y_mm)} mm, local chord ${sig(sec.chord_mm)} mm; p − p∞ = q∞ Cp, q∞ = ${sig(q)} Pa`);
      const fr = chartFrame(ctx, W, H, top, [0, 1], [lo - pad, hi + pad], 'x/c (0 = leading edge, 1 = trailing edge)', '−Cp (suction up)', head.count);
      hits = [];
      const series = [['upper', '#2166ac', []], ['lower', '#b2182b', [7, 5]]];
      for (const [side, col, dash] of series) {
        const pts = sec[side].slice().sort((a, c) => a[0] - c[0]);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
        pts.forEach(([x, cp], i) => (i ? ctx.lineTo(fr.X(x), fr.Y(-cp)) : ctx.moveTo(fr.X(x), fr.Y(-cp)))); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col;
        pts.forEach(([x, cp], i) => { ctx.beginPath(); ctx.arc(fr.X(x), fr.Y(-cp), 2.6, 0, 2 * Math.PI); ctx.fill(); hits.push({ point: { side, j: sectionJ, k: i, n: pts.length, xc: x, cp, dp: q * cp, y: sec.y_mm, chord: sec.chord_mm }, at: [fr.X(x), fr.Y(-cp)] }); });
      }
      drawHead(ctx, fr, head);
      probes.forEach((pr, n) => { const h = hits.find((t) => t.point.side === pr.side && t.point.k === pr.k && pr.j === sectionJ); if (!h) return; ctx.beginPath(); ctx.arc(h.at[0], h.at[1], 8, 0, 2 * Math.PI); ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#14212e'; ctx.font = `700 11px ${FONT}`; ctx.fillText(String(n + 1), h.at[0] + 9, h.at[1] - 8); });
      drawn = { section: sec };
      if (interactive) canvas.setAttribute('aria-label', `Sectional pressure coefficient along the chord at y = ${sig(sec.y_mm)} mm, upper and lower surfaces.`);
    }
    function stepRows(rows) { return rows.map((r) => ({ y0: r[0], y1: r[1], fz: r[4], w: r[4] / ((r[1] - r[0]) || 1) })); }
    function drawSpan(ctx, W, H, top, s, interactive) {
      const r = s.result, c = s.combined, b = r.base, delivered = stepRows(c.strips), baseRows = stepRows(b.stripLoads), meshes = r.levels.map((l) => ({ l, rows: stepRows(l.strips) }));
      const allW = [...delivered, ...baseRows, ...meshes.flatMap((m) => m.rows)].map((v) => v.w), ymax = Math.max(...delivered.map((v) => v.y1));
      const lo = Math.min(0, ...allW), hi = Math.max(0, ...allW), pad = 0.06 * ((hi - lo) || 1);
      const head = headRows(ctx, W, [['delivered to the structure (extrapolated)', '#0a5fc2'], [`base mesh ${b.mesh.chordPanelsPerSurface} × ${b.mesh.spanPanels}`, '#14212e', [6, 4]], ['other meshes of the sequence', 'rgba(122,138,155,0.8)']], '');
      const fr = chartFrame(ctx, W, H, top, [0, ymax], [lo - (lo < 0 ? pad : 0), hi + pad], 'span y (mm), root at left', 'lift per unit span Fz/Δy (N/mm)', head.count);
      const step = (rows, col, width, dash) => { ctx.strokeStyle = col; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath(); rows.forEach((v, i) => { if (i === 0) ctx.moveTo(fr.X(v.y0), fr.Y(v.w)); else ctx.lineTo(fr.X(v.y0), fr.Y(v.w)); ctx.lineTo(fr.X(v.y1), fr.Y(v.w)); }); ctx.stroke(); ctx.setLineDash([]); };
      for (const m of meshes) step(m.rows, 'rgba(122,138,155,0.45)', 1);
      step(baseRows, '#14212e', 1.6, [6, 4]);
      step(delivered, '#0a5fc2', 2.6);
      hits = delivered.map((v, i) => ({ point: { kind: 'strip', i, ...v }, at: [fr.X((v.y0 + v.y1) / 2), fr.Y(v.w)] }));
      const fz = c.rootWrench[2], semi = fz.value;
      drawHead(ctx, fr, head);
      probes.forEach((pr, n) => { const h = hits.find((t) => t.point.i === pr.i); if (!h) return; ctx.beginPath(); ctx.arc(h.at[0], h.at[1], 8, 0, 2 * Math.PI); ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#14212e'; ctx.font = `700 11px ${FONT}`; ctx.fillText(String(n + 1), h.at[0] + 9, h.at[1] - 8); });
      drawn = { delivered };
      if (interactive) canvas.setAttribute('aria-label', `Spanwise lift per unit span: delivered extrapolated strip load, base mesh and the other meshes. Semi-wing lift ${sig(semi)} N.`);
    }
    function probeText(p, n) {
      if (p.kind === 'strip') return `${n}. Delivered strip ${p.i + 1}: y ${sig(p.y0, 4)}–${sig(p.y1, 4)} mm · Fz ${sig(p.fz)} N · Fz/Δy ${sig(p.w)} N/mm`;
      const s = state(), b = s.result && s.result.base, eta = b ? p.y / (b.reference.span_mm / 2) : NaN;
      return `${n}. ${p.side === 'upper' ? 'Upper' : 'Lower'} surface · strip ${p.j + 1}, panel ${p.k + 1} of ${p.n} from the leading edge · y ${sig(p.y, 4)} mm (η ${sig(eta, 3)}) · x/c ${sig(p.xc, 3)}${Number.isFinite(p.x) ? ` · x ≈ ${sig(p.x, 4)} mm` : ''} · Cp ${sig(p.cp)} · p − p∞ ${sig(p.dp)} Pa`;
    }
    function showProbes() { probeBox.replaceChildren(...probes.map((p, i) => el('div', { text: probeText(p, i + 1) }))); clearBtn.disabled = !probes.length; }
    canvas.addEventListener('click', (e) => {
      if (!kind || !hits.length) return;
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let picked = null;
      if (kind === 'cp' || kind === 'dp') {
        const inside = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) c = !c; } return c; };
        const h = hits.find((t) => inside(t.pts)); picked = h && h.p;
      } else {
        let best = null; for (const h of hits) { const d = Math.hypot(h.at[0] - x, h.at[1] - y); if (d < 18 && (!best || d < best.d)) best = { d, h }; }
        picked = best && best.h.point;
      }
      if (!picked) return;
      if (kind !== 'span' && picked.j != null) sectionJ = picked.j;
      probes = [...probes.filter((p) => p !== picked), picked].slice(-8);
      render(); showProbes();
    });
    pngBtn.addEventListener('click', () => {
      const s = data(); if (!s || kind === 'coef') return;
      const W = 1800, H = kind === 'section' || kind === 'span' ? 1000 : Math.round(1800 * Math.max(0.55, canvas.clientHeight / Math.max(1, canvas.clientWidth))) + 96;
      const off = document.createElement('canvas'); off.width = W; off.height = H; const ctx = off.getContext('2d');
      draw(off, s, { ctx, W, H, title: 'Wing AeroStruct · ' + title.textContent, source: source.textContent });
      off.toBlob((blob) => blob && download(`wing-aero-${kind}.png`, blob), 'image/png');
      render();   // the probes list and the screen canvas are unchanged; redraw restores the screen hit areas
    });
    csvBtn.addEventListener('click', () => {
      const s = data(); if (!s) return;
      const r = s.result, b = r.base, head = [`# MIE 446 Wing AeroStruct (development) aerodynamic result: ${title.textContent}. Lines starting with # are comments.`, `# ${r.label}`, `# ${flowText(b)}; ${r.sequence} sequence (${r.levels.length} meshes)`];
      let lines = [], name = `wing-aero-${kind}.csv`;
      if (kind === 'cp' || kind === 'dp') {
        const f = surfaceField(b);
        lines = [...head, `# Cp at the panel centroids of the ${meshText(b)}; one solved mesh, not extrapolated. p - p_inf = q_inf * Cp. x_mm is the planform position of the centroid (leading edge plus x/c times the local chord).`,
          'surface,strip,panel_from_LE,y0_mm,y1_mm,y_mid_mm,eta,x_over_c,x_mm,Cp,p_minus_pinf_Pa',
          ...f.panels.map((p) => [p.side, p.j + 1, p.k + 1, csvNum(p.y0), csvNum(p.y1), csvNum(p.y), csvNum(p.y / (b.reference.span_mm / 2)), csvNum(p.xc), csvNum(p.x), csvNum(p.cp), csvNum(p.dp)].join(','))];
      } else if (kind === 'section') {
        const sec = b.chordwise[sectionJ];
        lines = [...head, `# Strip ${sectionJ + 1} of ${b.chordwise.length} of the base mesh: y = ${csvNum(sec.y_mm)} mm, local chord ${csvNum(sec.chord_mm)} mm.`, 'surface,panel_from_LE,x_over_c,Cp,p_minus_pinf_Pa',
          ...['upper', 'lower'].flatMap((side) => sec[side].slice().sort((a, c) => a[0] - c[0]).map((p, i) => [side, i + 1, csvNum(p[0]), csvNum(p[1]), csvNum(b.flow.dynamicPressure_Pa * p[1])].join(',')))];
        name = `wing-aero-section-strip${sectionJ + 1}.csv`;
      } else if (kind === 'span') {
        lines = [...head, '# Spanwise strip loads. delivered = extrapolated load given to the structure; base = base mesh; mesh_CxS = one mesh of the sequence (chord panels per surface x span panels).', 'series,y0_mm,y1_mm,Fz_N,Fz_per_mm_N_per_mm',
          ...stepRows(s.combined.strips).map((v) => ['delivered', csvNum(v.y0), csvNum(v.y1), csvNum(v.fz), csvNum(v.w)].join(',')),
          ...stepRows(b.stripLoads).map((v) => ['base', csvNum(v.y0), csvNum(v.y1), csvNum(v.fz), csvNum(v.w)].join(',')),
          ...r.levels.flatMap((l) => stepRows(l.strips).map((v) => [`mesh_${l.chordPanels}x${l.spanPanels}`, csvNum(v.y0), csvNum(v.y1), csvNum(v.fz), csvNum(v.w)].join(',')))];
      } else if (kind === 'coef' && typeof WingAeroUI !== 'undefined') {
        const a = ui.aero(); name = `wing-aerostruct-alpha${sig(b.flow.alphaDeg, 4)}-V${sig(b.flow.speed, 4)}.csv`.replace(/[^A-Za-z0-9_.-]/g, '_');
        download(name, new Blob([WingAeroUI.csv(WingAeroUI.recordFromSequence(r, a.solvedKey), s.combined, s.admission || null)], { type: 'text/csv' })); return;
      }
      download(name, new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    });
    function renderCoefficients(s) {
      const r = s.result, c = s.combined, b = r.base, cf = c.coefficients;
      const row = (name, e, unit = '') => `<tr><td>${name}</td><td>${sig(e.value)} ± ${sig(e.uncertainty, 2)}${unit}</td><td>${sig(e.finest)}</td><td>${sig(e.base)}</td></tr>`;
      const conv = (name, e) => `<tr><td>${name}</td><td>${e.chord.levels.map((n, i) => `${n}: ${sig(e.chord.values[i])}`).join('<br>')}</td><td>${e.span.levels.map((n, i) => `${n}: ${sig(e.span.values[i])}`).join('<br>')}</td><td>${sig(e.chord.observedOrder, 3)} / ${sig(e.span.observedOrder, 3)}</td></tr>`;
      const meshRows = r.levels.map((l) => { const w = (c.weights.find((x) => x.chordPanels === l.chordPanels && x.spanPanels === l.spanPanels) || { weight: 0 }).weight, F = l.strips.reduce((t, v) => t + v[4], 0); return `<tr><td>${2 * l.chordPanels} × ${l.spanPanels}</td><td>${l.panels ?? '–'}</td><td>${sig(l.coefficients.CL)}</td><td>${sig(F)}</td><td>${sig(w, 3)}</td></tr>`; }).join('');
      const lc = c.consistency.lift, dc = c.consistency.drag, adm = s.admission;
      const S = ui.state(), applied = S.aeroLoad;
      let admHtml = '<p class="note">This aerodynamic load is not applied to the structure. Use Apply aerodynamic loads to structure in Aerodynamics to run the admission test.</p>';
      if (applied && adm && typeof WingAeroUI !== 'undefined') { const v = WingAeroUI.admissionVerdict(adm); admHtml = `<div class="wae-box ${v.ok ? 'ok' : 'no'}"><p class="${v.ok ? 'wae-ok' : 'wae-no'}">${v.html}</p>${WingAeroUI.admissionTable(adm)}</div>`; }
      else if (applied) admHtml = '<p class="note">The load is applied; the admission test runs with the next Solve Structure / Stress.</p>';
      html.innerHTML = `<div class="wae">
        <h4>Extrapolated coefficients (both halves) with uncertainty U</h4>
        <div class="wae-scroll"><table><thead><tr><th>Quantity</th><th>Extrapolated ± U</th><th>Finest meshes</th><th>Base mesh</th></tr></thead><tbody>
          ${row('Lift coefficient C<sub>L</sub>, pressure integral', cf.CL)}${row('C<sub>L</sub>, Trefftz plane', cf.CLTrefftz)}${row('Induced drag C<sub>Di</sub>, Trefftz plane', cf.CDiTrefftz)}
          ${row('Pressure drag C<sub>D,p</sub> (inviscid; equals C<sub>Di</sub> in exact potential flow)', cf.CDpressure)}${row('Pitching moment C<sub>m</sub> about ¼ MAC (nose-up +)', cf.Cm)}
          ${row('Semi-wing lift F<sub>z</sub>', c.rootWrench[2], ' N')}</tbody></table></div>
        <p class="note">No viscous (skin-friction) drag, stall or boundary layer is computed: attached, incompressible potential flow only.</p>
        <h4>Mesh convergence</h4>
        <div class="wae-scroll"><table><thead><tr><th>Quantity</th><th>Chordwise refinement (panels per surface: value)</th><th>Spanwise refinement (panels: value)</th><th>Observed order chord / span</th></tr></thead><tbody>${conv('C<sub>L</sub>', cf.CL)}${conv('C<sub>Di</sub> Trefftz', cf.CDiTrefftz)}${conv('C<sub>m</sub>', cf.Cm)}${conv('Semi-wing F<sub>z</sub> (N)', c.rootWrench[2])}</tbody></table></div>
        <div class="wae-scroll"><table><thead><tr><th>Mesh (around × spanwise)</th><th>Panels</th><th>C<sub>L</sub></th><th>F<sub>z</sub> (N)</th><th>Extrapolation weight</th></tr></thead><tbody>${meshRows}</tbody></table></div>
        <p class="note">Global consistency: pressure and Trefftz-plane lift differ by ${sig(100 * lc.relativeDifference, 3)} % (criterion 2 %); pressure and induced drag differ by ${sig(dc.difference, 2)} (combined U ${sig(dc.combinedUncertainty, 2)}). Re (MAC) ${sig(b.flow.reynoldsMac, 3)}, Mach ${sig(b.flow.mach, 3)}. Linear solver: ${esc(b.diagnostics.linearSolver || '')}, relative residual ${sig(b.diagnostics.linearRelativeResidual, 2)}.</p>
        ${(b.warnings || []).map((w) => `<p class="wae-warn">${esc(w)}</p>`).join('')}
        <h4>Structural load: admission</h4>${admHtml}</div>`;
    }
    if (window.ResizeObserver) new ResizeObserver(() => { if (!overlay.hidden && kind !== 'coef') render(); }).observe(canvas.parentElement);
    return { refresh: () => { if (!overlay.hidden) { render(); if (probes.length) showProbes(); } }, close, show, get kind() { return kind; }, element: overlay, selector: group };
  }
  return Object.freeze({ install, VIEWS, surfaceField, colour });
})();
