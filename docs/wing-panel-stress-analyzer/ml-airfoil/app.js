/* Aero comparison workspace: section (2D) and finite-wing (3D) comparison of our panel solvers, recorded ML
   inference and reference data. Thin DOM layer over screen.js, panel2d.js, panel-geometry.js, wing-compare.js
   and lwm-client.js. Nothing here fabricates values: missing data is shown as missing. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmt = (x, p = 4) => (typeof x === 'number' && Number.isFinite(x)) ? (Math.abs(x) < 1e-9 ? '0' : Number(x.toPrecision(p)).toString()) : '—';
  const pct = (x, ref) => (Number.isFinite(x) && Number.isFinite(ref) && ref !== 0) ? (100 * (x / ref - 1)).toFixed(2) + '%' : '—';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = { panel: '#4ea6ff', ml: '#ff9f43', ref: '#e8eef4', cfd: '#33c587', m2: '#c77dff', m3: '#33c587', grid: '#1f2d3b', axis: '#8a9bac', ink: '#dce5ee' };
  const short = sha => String(sha || '').slice(0, 7);

  // ---------------- figure (SVG, legend inside) ----------------
  function ticks(lo, hi, n = 6) {
    const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
    for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) out.push(Math.abs(t) < step * 1e-6 ? 0 : Number(t.toPrecision(10)));
    return out;
  }
  function fig(spec) {
    const W = spec.w || 900, H = spec.h || 420, m = { l: 66, r: 18, t: 16, b: 48 };
    const good = spec.series.filter(s => s.kind === 'vline' || (s.x && s.x.length));
    const xs = [], ys = [];
    for (const s of good) { if (s.kind === 'vline') { xs.push(s.x); continue; } for (let i = 0; i < s.x.length; i++) { if (Number.isFinite(s.x[i])) xs.push(s.x[i]); if (Number.isFinite(s.y[i])) ys.push(s.y[i]); if (s.y2 && Number.isFinite(s.y2[i])) ys.push(s.y2[i]); } }
    if (!ys.length) return `<div class="caption">${esc(spec.empty || 'No data for this figure.')}</div>`;
    let [x0, x1] = spec.xlim || [Math.min(...xs), Math.max(...xs)];
    let [y0, y1] = spec.ylim || [Math.min(...ys), Math.max(...ys)];
    if (x1 === x0) { x0 -= 1; x1 += 1; } const dy = (y1 - y0) * 0.07 || 0.1; if (!spec.ylim) { y0 -= dy; y1 += dy; }
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = x => m.l + (x - x0) / (x1 - x0) * pw;
    const Y = y => spec.invertY ? m.t + (y - y0) / (y1 - y0) * ph : m.t + ph - (y - y0) / (y1 - y0) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.aria || spec.yLabel || 'figure')}" font-family="Barlow, Segoe UI, system-ui, sans-serif" font-size="12">`;
    s += `<defs><clipPath id="${spec.id}c"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>`;
    for (const t of ticks(x0, x1)) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${m.t + ph}" stroke="${C.grid}"/><text x="${X(t)}" y="${m.t + ph + 18}" text-anchor="middle" fill="${C.axis}">${fmt(t, 4)}</text>`;
    for (const t of ticks(y0, y1)) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="${C.grid}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end" fill="${C.axis}">${fmt(t, 3)}</text>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${C.axis}"/>`;
    s += `<g clip-path="url(#${spec.id}c)">`;
    const pts = (sx, sy) => { let d = '', pen = false; for (let i = 0; i < sx.length; i++) { if (!Number.isFinite(sx[i]) || !Number.isFinite(sy[i])) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(sx[i]).toFixed(1) + ',' + Y(sy[i]).toFixed(1); pen = true; } return d; };
    for (const q of good) {
      if (q.kind === 'band') { const up = pts(q.x, q.y), lo = pts([...q.x].reverse(), [...q.y2].reverse()); s += `<path d="${up}${lo.replace(/^M/, 'L')}Z" fill="${q.color}" fill-opacity="0.2" stroke="none"/>`; }
      else if (q.kind === 'line') s += `<path d="${pts(q.x, q.y)}" fill="none" stroke="${q.color}" stroke-width="${q.width || 2.2}"${q.dash ? ' stroke-dasharray="7 5"' : ''}/>`;
      else if (q.kind === 'points') { for (let i = 0; i < q.x.length; i++) if (Number.isFinite(q.y[i])) s += `<circle cx="${X(q.x[i])}" cy="${Y(q.y[i])}" r="${q.r || 3.4}" fill="${q.fill || q.color}" stroke="${q.color}" stroke-width="1.3"/>`; }
      else if (q.kind === 'vline') s += `<line x1="${X(q.x)}" x2="${X(q.x)}" y1="${m.t}" y2="${m.t + ph}" stroke="${q.color || C.axis}" stroke-dasharray="3 5"/>`;
    }
    s += '</g>';
    s += `<text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle" fill="${C.ink}">${esc(spec.xLabel || '')}</text><text transform="translate(16,${m.t + ph / 2}) rotate(-90)" text-anchor="middle" fill="${C.ink}">${esc(spec.yLabel || '')}</text>`;
    const leg = good.filter(q => q.label);
    if (leg.length) {
      const lw = Math.min(pw - 20, 14 + Math.max(...leg.map(q => q.label.length)) * 6.6 + 44), lh = leg.length * 18 + 10;
      const corner = spec.legend || 'tr', lx = corner.endsWith('r') ? m.l + pw - lw - 10 : m.l + 10, ly = corner.startsWith('t') ? m.t + 8 : m.t + ph - lh - 8;
      s += `<g font-size="12"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="6" fill="#0d141c" fill-opacity="0.92" stroke="${C.grid}"/>`;
      leg.forEach((q, i) => { const y = ly + 14 + i * 18; s += q.kind === 'points' ? `<circle cx="${lx + 16}" cy="${y}" r="3.4" fill="${q.fill || q.color}" stroke="${q.color}"/>` : q.kind === 'band' ? `<rect x="${lx + 8}" y="${y - 6}" width="16" height="12" fill="${q.color}" fill-opacity="0.3"/>` : `<line x1="${lx + 8}" x2="${lx + 26}" y1="${y}" y2="${y}" stroke="${q.color}" stroke-width="2.2"${q.dash ? ' stroke-dasharray="7 5"' : ''}/>`; s += `<text x="${lx + 34}" y="${y + 4}" fill="${C.ink}">${esc(q.label)}</text>`; });
      s += '</g>';
    }
    return s + '</svg>';
  }
  const table = (head, rows, hl) => `<div class="scroll"><table class="data"><thead><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, k) => `<tr${hl === k ? ' class="hl"' : ''}>${r.map((v, i) => `<td${i ? ' class="n"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const kpi = (l, v, s, cls = '') => `<div class="kpi ${cls}"><div class="l">${esc(l)}</div><div class="v${String(v).length > 11 ? ' long' : ''}">${esc(v)}</div><div class="s" title="${esc(s)}">${esc(s)}</div></div>`;
  const chip = (cls, t) => `<span class="chip ${cls}">${esc(t)}</span>`;
  const doc = (id, title, body, open) => `<details class="doc" id="${id}"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="body">${body}</div></details>`;
  function tabs(defs, keep) {
    const bar = $('tabs'), host = $('panels'); bar.replaceChildren(); host.replaceChildren();
    const active = defs.some(d => d.id === keep) ? keep : defs[0].id;
    for (const d of defs) {
      const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.textContent = d.label; b.setAttribute('aria-selected', String(d.id === active)); b.dataset.tab = d.id;
      b.onclick = () => { for (const x of bar.children) x.setAttribute('aria-selected', String(x === b)); for (const p of host.children) p.hidden = p.id !== 'tab-' + d.id; state.tab[state.mode] = d.id; };
      bar.append(b);
      const p = document.createElement('div'); p.className = 'tabpanel'; p.id = 'tab-' + d.id; p.hidden = d.id !== active; p.innerHTML = d.html; host.append(p);
    }
    state.tab[state.mode] = active;
  }
  const state = { mode: 'section', tab: { section: 'cp', wing: 'cp' } };

  // ======================= SECTION (2D) =======================
  const S = window.WingMLScreen, G = window.WingPanelGeometry, P2 = window.WingAirfoilPanel2D;
  const sec = { data: null, refs: {}, ref: null, cache: new Map(), mesh: null, err: null };
  const PANEL2D = 'WingAirfoilPanel2D 1.1.0';
  function refValid(d) {
    const rows = a => { if (!Array.isArray(a) || a.length < 3 || a.length > 2000 || a.some((p, i) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || p[0] < 0 || p[0] > 1 || (i && p[0] <= a[i - 1][0]))) throw Error('Finite, increasing x/c samples from 0 to 1 required.'); return a; };
    if (d.format !== 'wing-cfd-reference-v1' || typeof d.airfoil !== 'string' || !d.airfoil.trim() || !Number.isFinite(d.mach) || d.mach < 0 || !Number.isFinite(d.reynolds) || d.reynolds <= 0 || !Array.isArray(d.cases) || !d.cases.length || d.cases.length > 1000) throw Error('Unsupported reference file or conditions.');
    if (!d.source || !['cfd', 'experiment'].includes(d.source.type) || typeof d.source.solver !== 'string' || !/^https:\/\//.test(d.source.url)) throw Error('Reference solver and HTTPS source URL required.');
    for (const s of [d.geometry && d.geometry.upper, d.geometry && d.geometry.lower]) { rows(s); if (s[0][0] !== 0 || s[s.length - 1][0] !== 1) throw Error('Complete reference geometry required.'); }
    const seen = new Set();
    for (const c of d.cases) { if (!Number.isFinite(c.alphaDeg) || seen.has(c.alphaDeg)) throw Error('Unique finite reference angles required.'); seen.add(c.alphaDeg); rows(c.branch1); rows(c.branch2); for (const k of ['cl', 'totalCd', 'cmQuarter']) if (c[k] !== undefined && c[k] !== null && !Number.isFinite(c[k])) throw Error('Invalid reference coefficient.'); }
    return d;
  }
  const lin = (a, x) => { if (x < a[0][0] || x > a[a.length - 1][0]) return NaN; let i = 0; while (i < a.length - 2 && a[i + 1][0] < x) i++; return a[i][1] + (a[i + 1][1] - a[i][1]) * (x - a[i][0]) / (a[i + 1][0] - a[i][0]); };
  const geomMatch = (a, b) => ['upper', 'lower'].every(k => a[k].every(p => Math.abs(p[1] - lin(b[k], p[0])) < 1e-5) && b[k].every(p => Math.abs(p[1] - lin(a[k], p[0])) < 1e-5));
  const refMatches = (r, re) => sec.ref && sec.ref.airfoil === (r.referenceAirfoil || r.airfoil) && Math.abs(sec.ref.mach - r.mach) < 1e-8 && Math.abs(sec.ref.reynolds - re) <= Math.max(1, re * 1e-6) && geomMatch(r, sec.ref.geometry);
  const solvePanel = (base, alpha, n = 160) => G.solve(base, alpha, n, P2);
  function selected() {
    const name = $('foil').value, alpha = +$('alpha').value, n = +$('panelN').value;
    if (!Number.isFinite(alpha) || alpha < -30 || alpha > 30) throw Error('Angle must be finite and between -30 and 30 degrees.');
    if (!Number.isInteger(n) || n < 16 || n > 512) throw Error('Enter an integer panel count from 16 to 512 per surface.');
    const rec = sec.data.cases.find(r => r.airfoil === name && r.alphaDeg === alpha && !r.noML);

    const base = rec || sec.data.cases.find(r => r.airfoil === name);
    if (!base) return null;
    const key = name + '|' + alpha + '|' + n;
    if (!sec.cache.has(key)) sec.cache.set(key, Object.assign({}, base, { alphaDeg: alpha, noML: !rec, panel: solvePanel(base, alpha, n) }));
    return sec.cache.get(key);
  }
  const lift = r => S.project(r, [-Math.sin(r.alphaDeg * Math.PI / 180), Math.cos(r.alphaDeg * Math.PI / 180), 0]);
  function renderSection() {
    try {
      $('alphaSlider').value = $('alpha').value;
      const r = selected(); sec.err = null;
      const re = +$('re').value;
      if (!Number.isFinite(re) || re <= 0) throw Error('Enter a finite positive Reynolds number.');
      if (!r) { $('strip').innerHTML = kpi('Case', 'none', 'no geometry for ' + $('foil').value); $('chips').innerHTML = chip('bad', 'no recorded model geometry'); tabs([{ id: 'cp', label: 'Cp', html: '<p class="note">No recorded ADAPT prediction and no geometry for this section. No other section or angle is substituted.</p>' }], state.tab.section); return; }
      const kind = sec.ref && sec.ref.source.type === 'experiment' ? 'Experiment' : 'CFD', matching = refMatches(r, re), rc = matching ? sec.ref.cases.find(c => Math.abs(c.alphaDeg - r.alphaDeg) < 1e-8) : null;
      const scope = S.scope(re, r.alphaDeg, r.mach), inDom = !r.noML && scope.eligible, L = r.noML ? null : lift(r), cmStd = r.noML ? null : Math.sqrt(Math.max(0, r.forceMoment.covariance[2][2]));
      const refLabel = sec.ref ? (sec.ref.source.type === 'experiment' ? 'TR-613 tunnel' : sec.ref.source.solver) : 'reference';
      // chips
      $('chips').innerHTML = [
        r.noML ? chip('warn', 'no recorded ML at this angle') : chip('ok', 'recorded ADAPT inference'),
        r.noML ? '' : chip(inDom ? 'ok' : 'warn', inDom ? 'inside ADAPT input ranges · accuracy not guaranteed' : 'outside published domain'),
        r.panel ? chip('idle', 'panel ' + r.panel.panelsPerSurface + '/side') : chip('warn', 'panel withheld'),
        rc ? chip('ok', kind + ' matched at ' + r.alphaDeg + ' deg') : chip('idle', matching ? 'no ' + kind + ' at this angle' : 'no matching ' + kind),
      ].join('');
      // strip
      $('strip').innerHTML = [
        kpi('cl · panel', fmt(r.panel && r.panel.cl), PANEL2D, 'panel-c'),
        kpi('cl · ADAPT', r.noML ? '—' : fmt(L.mean) + ' ± ' + fmt(2 * L.std, 2), r.noML ? 'no recorded prediction' : 'posterior mean ± 2σ, M ' + r.mach, 'ml-c'),
        kpi('cl · ' + kind.toLowerCase(), fmt(rc && rc.cl), rc ? refLabel : 'no reference at this α', 'ref-c'),
        kpi('cm,¼ · panel', fmt(r.panel && r.panel.cmQuarter), 'nose-up positive', 'panel-c'),
        kpi('cm,¼ · ADAPT', r.noML ? '—' : fmt(r.forceMoment.mean[2]) + ' ± ' + fmt(2 * cmStd, 2), 'joint covariance', 'ml-c'),
        kpi('scope', inDom ? 'in range' : r.noML ? 'no ML' : 'outside', 'Re ' + re.toLocaleString() + ' · ADAPT: Re > 1e6, α −4…12°, M 0…0.9'),
      ].join('');
      // Cp figure
      const cpSeries = [];
      if (r.panel) { cpSeries.push({ kind: 'line', x: r.panel.upper.map(p => p[0]), y: r.panel.upper.map(p => p[1]), color: C.panel, label: 'Panel · ' + PANEL2D }); cpSeries.push({ kind: 'line', x: r.panel.lower.map(p => p[0]), y: r.panel.lower.map(p => p[1]), color: C.panel, dash: true }); }
      if (!r.noML) { const n = r.upper.length; const mu = r.cpMean.slice(0, n), ml = r.cpMean.slice(n), su = r.cpStd.slice(0, n), sl = r.cpStd.slice(n), xu = r.upper.map(p => p[0]), xl = r.lower.map(p => p[0]);
        cpSeries.push({ kind: 'band', x: xu, y: mu.map((v, i) => v - 2 * su[i]), y2: mu.map((v, i) => v + 2 * su[i]), color: C.ml, label: 'ADAPT ± 2σ' }, { kind: 'band', x: xl, y: ml.map((v, i) => v - 2 * sl[i]), y2: ml.map((v, i) => v + 2 * sl[i]), color: C.ml }, { kind: 'line', x: xu, y: mu, color: C.ml, label: 'ADAPT mean' }, { kind: 'line', x: xl, y: ml, color: C.ml, dash: true }); }
      if (rc) { const exp = sec.ref.source.type === 'experiment'; for (const [k, dash] of [['branch1', false], ['branch2', true]]) cpSeries.push({ kind: exp ? 'points' : 'line', x: rc[k].map(p => p[0]), y: rc[k].map(p => p[1]), color: exp ? C.ref : C.cfd, fill: exp ? '#0d141c' : undefined, dash, label: k === 'branch1' ? (exp ? 'Experiment · ' + refLabel : 'CFD · ' + refLabel) : undefined }); }
      const cpHtml = `<div class="fig">${fig({ id: 'cp', series: cpSeries, xLabel: 'x/c', yLabel: 'Cp (negative upward)', invertY: true, legend: 'tr', aria: 'Pressure coefficient comparison' })}</div><p class="caption">Solid upper, dashed lower. ${r.panel ? 'Panel: incompressible, ' + r.panel.panelsPerSurface + ' panels per surface, analytic closed trailing edge. ' : 'Panel withheld outside |α| ≤ 15°, M ≤ 0.3. '}${r.noML ? 'ML: no recorded prediction at this geometry or angle; nothing substituted. ' : 'ADAPT: recorded posterior at M ' + r.mach + ', Re is not an input. '}${rc ? kind + ': ' + refLabel + ' at the same α, never solved here.' : matching ? kind + ' exists only at α ' + sec.ref.cases.map(c => c.alphaDeg + '°').join(', ') + '; no angle interpolation.' : 'No matching reference geometry and conditions.'}</p>`;
      // coefficients
      const drag = r.noML ? null : S.project(r, [Math.cos(r.alphaDeg * Math.PI / 180), Math.sin(r.alphaDeg * Math.PI / 180), 0]);
      const coefHtml = table(['Method · provenance', 'cl', 'cm,¼ (nose-up +)', 'pressure cd', 'total cd', 'cl / total cd'], [
        ['Panel · ' + PANEL2D + ' · ' + (r.panel ? r.panel.panelsPerSurface + '/side' : 'withheld'), fmt(r.panel && r.panel.cl), fmt(r.panel && r.panel.cmQuarter), fmt(r.panel && r.panel.pressureCd), 'not computed', 'not computed'],
        [kind + ' · ' + refLabel + (rc ? '' : ' · no case at this α'), fmt(rc && rc.cl), fmt(rc && rc.cmQuarter), 'not provided', fmt(rc && rc.totalCd), fmt(rc && rc.totalCd > 0 ? rc.cl / rc.totalCd : undefined)],
        ['ADAPT · recorded inference' + (r.noML ? ' · none here' : ' · mean ± 2σ'), r.noML ? '—' : fmt(L.mean) + ' ± ' + fmt(2 * L.std, 2), r.noML ? '—' : fmt(r.forceMoment.mean[2]) + ' ± ' + fmt(2 * cmStd, 2), fmt(drag && drag.mean), 'not computed', 'not computed'],
      ]) + '<p class="caption">Pressure-only drag omits skin friction and is not total drag. Reference total cd is quoted from its source. Agreement between columns is a numerical comparison, not validation.</p>';
      // lift curve
      const all = sec.data.cases.filter(q => q.airfoil === r.airfoil && !q.noML).sort((a, b) => a.alphaDeg - b.alphaDeg);
      const mlCl = all.map(lift), mlCm = all.map(q => [q.forceMoment.mean[2], Math.sqrt(Math.max(0, q.forceMoment.covariance[2][2]))]);
      const panelPts = all.filter(q => q.panel), aX = all.map(q => q.alphaDeg);
      const refPts = matching ? sec.ref.cases : [];
      const curve = (key, yl, mlY, mlS) => fig({ id: key, h: 360, series: [
        { kind: 'band', x: aX, y: mlY.map((v, i) => v - 2 * mlS[i]), y2: mlY.map((v, i) => v + 2 * mlS[i]), color: C.ml, label: 'ADAPT ± 2σ' },
        { kind: 'line', x: aX, y: mlY, color: C.ml, label: 'ADAPT mean' },
        { kind: 'line', x: panelPts.map(q => q.alphaDeg), y: panelPts.map(q => q.panel[key]), color: C.panel, label: 'Panel · 160/side' },
        { kind: 'points', x: refPts.filter(q => Number.isFinite(q[key])).map(q => q.alphaDeg), y: refPts.filter(q => Number.isFinite(q[key])).map(q => q[key]), color: C.cfd, label: refPts.some(q => Number.isFinite(q[key])) ? kind + ' · ' + refLabel : undefined },
        { kind: 'vline', x: r.alphaDeg },
      ], xLabel: 'α (deg)', yLabel: yl, legend: key === 'cl' ? 'tl' : 'tr', aria: yl + ' versus angle of attack' });
      const liftHtml = `<div class="two"><div class="fig">${curve('cl', 'cl', mlCl.map(v => v.mean), mlCl.map(v => v.std))}</div><div class="fig">${curve('cmQuarter', 'cm,¼ (nose-up +)', mlCm.map(v => v[0]), mlCm.map(v => v[1]))}</div></div><p class="caption">Recorded ADAPT angles 0 to 12° in 0.1° steps at M ${all.length ? all[0].mach : '—'}. Panel values use the 160-per-side baseline. Reference markers are the source's own angles only; the dashed line marks the selected α. Attached-flow models do not predict stall.</p>`;
      // screening
      const opts = { re, xsc: +$('xsc').value, zsc: +$('zsc').value }, minCL = +$('clmin').value;
      if (!Number.isFinite(minCL)) throw Error('Enter a finite lift target.');
      const cases = sec.data.cases.filter(q => q.alphaDeg === r.alphaDeg && !q.noML && Math.abs(q.mach - r.mach) < 1e-8).map(q => ({ q, a: S.assess(q, opts) }));
      const ok = cases.length > 0 && !r.noML && cases.every(c => c.a.scope.eligible);
      if (ok) cases.sort((x, y) => Number(y.a.lift.mean - 2 * y.a.lift.std >= minCL) - Number(x.a.lift.mean - 2 * x.a.lift.std >= minCL) || x.a.torqueScore - y.a.torqueScore);
      const screenHtml = (ok ? '<p class="caption">Posterior screening at α ' + r.alphaDeg + '°, M ' + r.mach + ': lift screen requires mean − 2σ ≥ target; moment score |mean cm| + 2σ at the chosen reference point. A low score is not a design optimum.</p>' : '<p class="caption">Design scores withheld: ' + (r.noML ? 'no recorded ML at this angle.' : 'outside the published ADAPT domain (Re > 1e6, α −4…12°, M 0…0.9).') + '</p>') +
        table(['Section', 'cl mean ± 2σ', 'cm at reference ± 2σ', '|mean cm| + 2σ', 'Lift screen'], cases.map(({ q, a }) => [q.airfoil, ok ? fmt(a.lift.mean) + ' ± ' + fmt(2 * a.lift.std, 2) : 'withheld', ok ? fmt(a.moment.mean) + ' ± ' + fmt(2 * a.moment.std, 2) : 'withheld', ok ? fmt(a.torqueScore) : 'out of domain', ok ? (a.lift.mean - 2 * a.lift.std >= minCL ? 'meets target' : 'below target') : 'withheld']), cases.findIndex(c => c.q.airfoil === r.airfoil));
      tabs([{ id: 'cp', label: 'Cp', html: cpHtml }, { id: 'coef', label: 'Coefficients', html: coefHtml }, { id: 'curve', label: 'Lift curve', html: liftHtml }, { id: 'screen', label: 'Screening', html: screenHtml }], state.tab.section);
      // docs
      const d = sec.data, up = d.upstream;
      const srcLink = sec.ref ? `<a href="${esc(sec.ref.source.url)}" target="_blank" rel="noopener">${esc(sec.ref.source.solver)}</a>` : 'none loaded';
      $('docs').innerHTML = [
        doc('docSources', 'Sources and execution', `<p class="srcline">Panel: ${PANEL2D}, linear-vortex stream-function panels, Kutta condition, incompressible; module SHA-256 ${esc(short(d.panelModuleSha256))}…; geometry module ${esc(short(d.panelGeometryModuleSha256))}…</p><p class="srcline">ML: ADAPT, the Large Airfoil Model (PCA-input SVDKL Gaussian process) of Lee, Seshadri and Rauleder, <a href="${esc(d.paper)}" target="_blank" rel="noopener">AST 180 (2027) 113783</a>; code <a href="${esc(up.repo)}" target="_blank" rel="noopener">hwlee924/Large-Airfoil-Model</a> commit ${esc(short(up.commit))}, one checkpoint, weights pinned by SHA-256 in <a href="demo.json">demo.json</a>. ${esc(d.execution)} Batch runtime ${fmt(d.runtimeSeconds, 4)} s for ${d.cases.filter(c => !c.noML).length} recorded cases.</p><p class="srcline">Reference: ${srcLink} · ${sec.ref ? esc(sec.ref.source.kind || sec.ref.source.type) : ''}${sec.ref && sec.ref.note ? ' · ' + esc(sec.ref.note) : ''}</p><p class="srcline">Section data is two-dimensional; the finite-wing mode uses the separate Large Wing Model and is never mixed with these section predictions.</p>`),
        doc('docLimits', 'Limitations and scope', `<ul><li>${esc(d.domain)}</li><li>Panel: attached, incompressible potential flow; no stall, no boundary layer, no viscous or total drag; |α| ≤ 15°, M ≤ 0.3.</li><li>Reference values appear only at their own angles and conditions; nothing is interpolated between recorded angles.</li><li>Section cl is not a finite-wing CL; nothing here is a structural or flight approval.</li></ul>`),
        doc('docMesh', 'Panel geometry and mesh', `<p>${esc(r.panel ? r.panel.geometryNote + ' Original trailing-edge gap/chord ' + fmt(r.panel.naturalTrailingGap, 3) + '.' : 'No panel result at this condition.')}</p><p class="note">Endpoint Cp is not a convergence measure: a finite-angle sharp edge tends to stagnation. Compare fixed x/c probes across meshes. <a href="panel-validation.json">Analytic and mesh-validation record</a>.</p><div id="meshOut">${sec.mesh || '<p class="note">Run the convergence check from the Panel mesh controls.</p>'}</div>`),
        doc('docHelp', 'Help and solved examples', `<p>Choose a section and angle, set Re for the scope check, read the strip, then open the tabs. Legends sit inside each figure.</p><p><b>Lift target before a low-moment choice.</b> Re 3,000,000, α 4°, minimum cl 0.60, reference (0.35, 0): Clark Y lower screen 0.618536 − 0.010791 = 0.607745 meets the target; NACA 2412 gives 0.588550 and does not. <button class="btn" type="button" data-worked="lift">Load</button></p><p><b>Moving the moment reference is not stiffening a wing.</b> Clark Y, α 4°: cm,new = cm,¼ + (x/c − 0.25) cn − (z/c) ca = −0.076235 + 0.10 × 0.618563 = −0.014378. <button class="btn" type="button" data-worked="quarter">x/c 0.25</button> <button class="btn" type="button" data-worked="reference">x/c 0.35</button></p><p><b>Low-Re Aeroclub wing.</b> Re 400,000 is outside the published domain: scores are withheld and the Re field never re-runs the model. <button class="btn" type="button" data-worked="lowre">Load</button></p>`, location.hash === '#help'),
        doc('docRepro', 'Reproducibility', `<p class="note">Force and moment covariance is propagated from the full joint Cp covariance; bands are pointwise ± 2σ, not simultaneous bands, and exclude geometric or material uncertainty. Upstream code and weights stay in the authors' repository; this page holds the adapter and the derived inference record (<a href="demo.json">demo.json</a>, format ${esc(d.format)}).</p>`),
      ].join('');
      for (const b of $('docs').querySelectorAll('[data-worked]')) b.onclick = () => worked(b.dataset.worked);
    } catch (e) {
      sec.err = e.message; $('chips').innerHTML = chip('bad', 'invalid input'); $('strip').innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }
  function worked(k) {
    const v = { re: k === 'lowre' ? 400000 : 3000000, alpha: 4, foil: 'Clark Y', clmin: 0.60, xsc: k === 'quarter' ? 0.25 : 0.35, zsc: 0 };
    for (const [id, val] of Object.entries(v)) $(id).value = String(val);
    renderSection(); state.tab.section = 'screen'; const b = [...$('tabs').children].find(x => x.dataset.tab === 'screen'); if (b) b.click(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function meshCheck() {
    try {
      const r = selected(); if (!r) throw Error('No section selected.');
      const n = +$('panelN').value, counts = [...new Set([Math.max(16, Math.round(n / 2)), n, Math.min(512, n * 2)])];
      const results = counts.map(k => solvePanel(r, r.alphaDeg, k));
      if (results.some(x => !x)) throw Error('Panel mesh study is outside the solver scope.');
      const probes = [0.001, 0.01, 0.25, 0.5, 0.9, 0.99], a = results[results.length - 2], b = results[results.length - 1];
      const dc = Math.abs(b.cl - a.cl), dp = Math.max(...['upper', 'lower'].flatMap(sfc => probes.map(x => Math.abs(lin(a[sfc], x) - lin(b[sfc], x)))));
      const edges = ['Leading edge', 'Trailing edge'].map((name, k) => { const [lo, hi] = k ? [0.97, 1] : [-0.001, 0.03]; return `<div class="fig">${fig({ id: 'mesh' + k, h: 300, series: results.flatMap((res, i) => ['upper', 'lower'].map(sfc => ({ kind: 'line', x: res[sfc].filter(p => p[0] >= lo && p[0] <= hi).map(p => p[0]), y: res[sfc].filter(p => p[0] >= lo && p[0] <= hi).map(p => p[1]), color: [C.panel, C.m2, C.m3][i], dash: sfc === 'lower', label: sfc === 'upper' ? res.panelsPerSurface + '/side' : undefined }))), xLabel: 'x/c · ' + name.toLowerCase(), yLabel: 'Cp', invertY: true, legend: k ? 'tl' : 'br', aria: name + ' mesh profiles' })}</div>`; });
      sec.mesh = `<p class="note">Finest two meshes: |Δcl| ${fmt(dc)}, max |ΔCp| at fixed probes ${fmt(dp)}. Observed mesh differences only; not an accuracy claim.</p>` + table(['Panels / side', 'cl', 'cm,¼', 'pressure cd', 'Cp upper x/c 0.001', 'Cp upper x/c 0.99'], results.map(res => [res.panelsPerSurface, fmt(res.cl), fmt(res.cmQuarter), fmt(res.pressureCd), fmt(lin(res.upper, 0.001)), fmt(lin(res.upper, 0.99))])) + `<div class="two">${edges.join('')}</div>`;
      renderSection(); const d = $('docMesh'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } catch (e) { sec.mesh = `<p class="err">${esc(e.message)}</p>`; renderSection(); }
  }
  async function initSection() {
    const res = await fetch('demo.json?v=ws1'); if (!res.ok) throw Error('Recorded model output is unavailable (HTTP ' + res.status + ').');
    sec.data = await res.json(); if (sec.data.format !== 'wing-lam-screen-v1' || !sec.data.cases.length) throw Error('Unsupported inference file.');
    sec.data.cases.forEach(S.validate);
    for (const name of [...new Set(sec.data.cases.map(r => r.airfoil))]) $('foil').append(new Option(name, name));
    for (let i = 0; i <= 300; i++) $('alpha').append(new Option((i / 10).toFixed(1) + '°', String(i / 10)));
    for (const [key, file] of [['cfd', 'cfd-reference.json'], ['experiment', 'experiment-reference.json']]) { try { const q = await fetch(file + '?v=ws1'); if (q.ok) sec.refs[key] = refValid(await q.json()); } catch (e) { console.warn(e); } }
    sec.ref = sec.refs.cfd || sec.refs.experiment || null;
    const query = new URLSearchParams(location.search), qf = query.get('airfoil'), qa = query.get('alpha');
    $('foil').value = 'NACA 0012 (NASA TMR geometry)'; if (!qf) $('re').value = '6000000';
    const want = (id, value, label) => { const sel = $(id); if (![...sel.options].some(o => o.value === value)) sel.append(new Option(label + ' · no recorded prediction', value)); sel.value = value; };
    if (qf) want('foil', qf, qf); if (qa !== null) want('alpha', qa, qa + '°');
    if (qf && query.has('geometry')) { try { const g = JSON.parse(query.get('geometry')); if (g.upper && g.upper.length > 200 || g.lower && g.lower.length > 200) throw Error('Geometry size limit'); S.weights(g.upper, g.lower); sec.data.cases.push(Object.assign({ alphaDeg: 0, mach: 0.15, nominalRe: 3e6 }, g, { airfoil: qf + ' [transferred geometry]', noML: true })); want('foil', qf + ' [transferred geometry]', qf + ' [transferred geometry]'); } catch (e) { sec.err = 'Transferred geometry rejected: ' + e.message; want('foil', qf + ' [rejected transfer]', sec.err); } }
    $('alphaSlider').oninput = () => { $('alpha').value = $('alphaSlider').value; renderSection(); };
    for (const id of ['panelN', 're', 'clmin', 'xsc', 'zsc', 'alpha', 'foil']) $(id).addEventListener('input', renderSection);
    $('panelRecompute').onclick = () => { sec.cache.clear(); renderSection(); }; $('meshCheck').onclick = meshCheck;
    $('referenceSet').oninput = () => { sec.ref = sec.refs[$('referenceSet').value] || null; renderSection(); };
    $('useReference').onclick = () => {
      if (!sec.ref) return;
      const ref=sec.ref;
      const known=sec.data.cases.find(r=>!r.noML && r.airfoil===ref.airfoil && Math.abs(r.mach-ref.mach)<1e-8 && geomMatch(r,ref.geometry));
      const name=known ? known.airfoil : ref.airfoil+' [reference geometry]';
      if (!known) {
        sec.data.cases=sec.data.cases.filter(r=>r.airfoil!==name);
        sec.data.cases.push(Object.assign({alphaDeg:0,mach:ref.mach,nominalRe:ref.reynolds,referenceAirfoil:ref.airfoil},ref.geometry,{airfoil:name,noML:true}));
        if (![...$('foil').options].some(o=>o.value===name)) $('foil').append(new Option(name,name));
      }
      sec.cache.clear(); $('foil').value=name; $('re').value=ref.reynolds;
      const a0=ref.cases[0].alphaDeg;
      if (![...$('alpha').options].some(o=>+o.value===a0)) $('alpha').append(new Option(a0+'°',String(a0)));
      $('alpha').value=String(a0);renderSection();
    };
    $('referenceFile').addEventListener('change', async e => { try { const f = e.target.files[0]; if (!f) return; if (f.size > 5e6) throw Error('Reference file limit is 5 MB.'); const next = refValid(JSON.parse(await f.text())); sec.refs.imported = next; sec.ref = next; if (![...$('referenceSet').options].some(o => o.value === 'imported')) $('referenceSet').append(new Option('Imported', 'imported')); $('referenceSet').lastChild.textContent = 'Imported · ' + next.airfoil; $('referenceSet').value = 'imported'; $('importStatus').textContent = 'Loaded locally, nothing uploaded. Use reference conditions to load its geometry.'; renderSection(); } catch (err) { $('importStatus').textContent = 'Rejected: ' + err.message; } });
    $('dat').onclick = () => { const r = selected(); if (!r) return; const rows = [r.airfoil, ...r.upper.slice().reverse().map(p => p.join(' ')), ...r.lower.slice(1).map(p => p.join(' '))]; const u = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/plain' })); const a = document.createElement('a'); a.href = u; a.download = r.airfoil.replaceAll(' ', '-') + '.dat'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
    renderSection();
  }

  // ======================= WING (3D) =======================
  const WC = window.WingCompare, LW = window.LWMClient;
  const wing = { data: null, fresh: new Map(), worker: null, serial: 0, client: null, screenResult: null, serviceMsg: '' };
  const LWM = 'LWM · Large Wing Model';
  function wsel() { const c = wing.data.cases[+$('wing').value], i = +$('mesh').value, key = c.id + ':' + i; return { c, i, key, p: wing.fresh.get(key) || c.panels[i] }; }
  function wstations() { const { c } = wsel(); const etas = [...new Set(c.reference.points.map(q => q.eta))].sort((a, b) => a - b); $('eta').replaceChildren(...etas.map(y => new Option(y.toFixed(4), String(y)))); }
  function renderWing() {
    if (!wing.data) return;
    const { c, p } = wsel(), eta = +$('eta').value, ref = c.reference.reportedWingCL, co = p.result.coefficients, ml = c.lwm.integratedMean, Cv = c.lwm.integratedCovariance, err = WC.errors(c, p), a = c.accuracy, cov = WC.coverage(c);
    const sd = i => Math.sqrt(Math.max(0, Cv[i][i])), PANEL3D = 'WingAeroPanel ' + p.result.version;
    $('chips').innerHTML = [chip('ok', 'recorded benchmark · ' + c.rawSourceConditions.source), chip(p.fresh ? 'ok' : 'idle', p.fresh ? 'panel re-solved in browser' : 'panel recorded · ' + p.result.mesh.panels + ' panels'), chip('idle', 'LWM recorded, unconditioned'), chip(wing.client && wing.client.state === 'online' ? 'ok' : 'idle', 'service ' + (wing.client ? wing.client.state : 'offline'))].join('');
    $('strip').innerHTML = [
      kpi('CL · experiment', fmt(ref), c.rawSourceConditions.source + ' · reported', 'ref-c'),
      kpi('CL · panel', fmt(co.CL), PANEL3D + ' · ' + pct(co.CL, ref) + ' vs reported', 'panel-c'),
      kpi('CL · LWM', fmt(ml[0]) + ' ± ' + fmt(2 * sd(0), 2), 'full pressure projection · ' + pct(ml[0], ref), 'ml-c'),
      kpi('Cp MAE · panel', fmt(err.panel, 3), err.n + ' matched measured points', 'panel-c'),
      kpi('Cp MAE · LWM', fmt(err.ml, 3), 'same ' + err.n + ' points', 'ml-c'),
      kpi('conditions', c.conditions.effectiveAlphaDeg + '° · M ' + c.conditions.effectiveMach, 's/c ' + c.conditions.semiSpanOverChord + ' · Re ' + c.rawSourceConditions.Re.toLocaleString() + ' (context)'),
    ].join('');
    // Cp at station
    const st = c.lwm.stations.find(s => Math.abs(s.eta - eta) < 1e-10), refs = c.reference.points.filter(q => q.eta === eta), series = [];
    if (st) { const nU = st.upper.length; for (const [sfc, off, dash] of [['upper', 0, false], ['lower', nU, true]]) { const x = st[sfc].map(q => q[0]), y = st[sfc].map(q => q[1]), sdv = st.cpStd.slice(off, off + st[sfc].length); series.push({ kind: 'band', x, y: y.map((v, i) => v - 2 * sdv[i]), y2: y.map((v, i) => v + 2 * sdv[i]), color: C.ml, label: dash ? undefined : 'LWM ± 2σ' }, { kind: 'line', x, y, color: C.ml, dash, label: dash ? undefined : 'LWM mean · 2 checkpoints' }); const py = x.map(v => WC.pressure(p, eta, sfc, v)); series.push({ kind: 'line', x: x.filter((v, i) => py[i] !== null), y: py.filter(v => v !== null), color: C.panel, dash, label: dash ? undefined : 'Panel · ' + PANEL3D }); } }
    series.push({ kind: 'points', x: refs.map(q => q.x), y: refs.map(q => q.cp), color: C.ref, fill: '#0d141c', label: 'Experiment · ' + c.rawSourceConditions.source });
    const cpHtml = `<div class="fig">${fig({ id: 'wcp', series, xLabel: 'x/c · station η = ' + eta.toFixed(4), yLabel: 'Cp (negative upward)', invertY: true, legend: 'tr', aria: 'Pressure comparison at a span station' })}</div><p class="caption">Solid upper, dashed lower. Panel values are centroid data interpolated linearly in chord and span inside sample coverage. LWM is evaluated at this recorded station; measured markers are discrete source samples. ${esc(c.reference.correction)}</p>`;
    // coefficients
    const coefHtml = table(['Quantity', 'Experiment · reference', 'Panel · ' + PANEL3D, LWM], [
      ['Full-wing CL · full pressure projection', fmt(ref), fmt(co.CL), fmt(ml[0]) + ' ± ' + fmt(2 * sd(0), 2)],
      ['CL error vs reported', 'reference', pct(co.CL, ref), pct(ml[0], ref)],
      ['CL · paper normal-force approximation', '—', '—', fmt(ml[3]) + ' ± ' + fmt(2 * sd(3), 2) + ' (' + pct(ml[3], ref) + ')'],
      ['Cm quarter-chord · not reference-validated', 'unavailable', fmt(co.Cm), fmt(ml[1]) + ' ± ' + fmt(2 * sd(1), 2)],
      ['Root-bending coefficient', 'unavailable', '—', fmt(ml[2]) + ' ± ' + fmt(2 * sd(2), 2)],
      ['Induced drag CDi · Trefftz', 'unavailable', fmt(co.CDiTrefftz, 5), 'withheld'],
      ['Cp MAE on matched points', err.n + ' of ' + c.reference.points.length, fmt(err.panel, 4), fmt(err.ml, 4)],
      ['Recorded mesh check 672 → 1152 panels', '—', fmt(a.panelCLLastMeshChangePercent, 3) + '% CL', fmt(a.lwmCLCoarseToFinePercent, 3) + '% (integration)'],
      ['Measured Cp inside LWM ± 2σ', cov.inside + ' of ' + cov.n, '—', fmt(cov.percent, 3) + '%'],
    ]) + `<p class="caption">Headline CL for LWM is the full pressure projection; the authors' normal-force approximation is listed separately and never mixed. Reported experimental CL is quoted from the source, not fitted. ${err.excluded ? err.excluded + ' measured points lie outside the finest panel-centroid coverage and are excluded from the panel score only. ' : ''}Bands omit model-form error and between-checkpoint dispersion; ${fmt(cov.percent, 3)}% coverage is not a calibrated 95% guarantee.</p>`;
    // span
    const sl = WC.spanLoads(c, p);
    const spanHtml = `<div class="fig">${fig({ id: 'span', h: 380, series: [
      { kind: 'band', x: sl.lwm.map(s => s.eta), y: sl.lwm.map(s => s.cl - 2 * s.std), y2: sl.lwm.map(s => s.cl + 2 * s.std), color: C.ml, label: 'LWM section cl ± 2σ' },
      { kind: 'line', x: sl.lwm.map(s => s.eta), y: sl.lwm.map(s => s.cl), color: C.ml, label: 'LWM mean' },
      { kind: 'line', x: sl.panel.map(s => s.eta), y: sl.panel.map(s => s.cl), color: C.panel, label: 'Panel strips · ' + PANEL3D },
      { kind: 'points', x: sl.panel.map(s => s.eta), y: sl.panel.map(s => s.cl), color: C.panel, r: 2.6 },
    ], xLabel: 'η = y / semi-span', yLabel: 'section cl', legend: 'bl', aria: 'Spanwise section lift' })}</div><p class="caption">Section lift integrated from each model's own pressures. No measured section lift is available for these cases, so no experimental curve is drawn. Bands are pointwise model ±2σ, not a calibrated 95% guarantee.</p>`;
    // service
    const svcHtml = serviceHtml();
    tabs([{ id: 'cp', label: 'Cp', html: cpHtml }, { id: 'coef', label: 'Coefficients', html: coefHtml }, { id: 'span', label: 'Span', html: spanHtml }, { id: 'svc', label: 'Prediction service', html: svcHtml }], state.tab.wing);
    const src = wing.data.source;
    $('docs').innerHTML = [
      doc('docSources', 'Sources and execution', `<p class="srcline">Panel: ${esc(PANEL3D)} (Wing AeroStruct surface-panel solver): ${esc(p.result.scope.method)}</p><p class="srcline">ML: ${esc(LWM)} (deep-kernel Gaussian process with Large Airfoil Model prior), <a href="${esc(src.paper)}" target="_blank" rel="noopener">arXiv 2508.11827</a>; code <a href="${esc(src.repository)}" target="_blank" rel="noopener">hwlee924/Large-Wing-Model</a> commit ${esc(short(src.commit))}, ${src.inferenceCheckpoints} checkpoints averaged, ${esc(c.lwm.conditioning)} ${esc(c.lwm.covarianceConvention)}</p><p class="srcline">Measurements: <a href="${esc(c.reference.sourceUrl)}" target="_blank" rel="noopener">${esc(c.rawSourceConditions.source)}</a> · ${esc(c.reference.kind)} · ${esc(c.reference.reportedCLSource)}</p><p class="srcline">Execution provenance: ${esc(wing.data.execution)} LWM full-covariance inference for the two recorded wings (about 7400 points) took 44.84 s on 16 CPU threads after model preparation, as logged by the executing run; this is a batch time, not per-design latency. Prediction artifact SHA-256 ${esc(short(src.predictionArtifactSha256))}… · <a href="../wing-comparison/benchmarks.json">benchmarks.json</a></p>`),
      doc('docLimits', 'Limitations and scope', `<ul><li>Two recorded benchmark cases, not an ML solver for arbitrary wings or angles. New geometries require the prediction service (next tab); nothing is predicted in this page without it.</li><li>LWM is restricted to the authors' rectangular, uniform-section wing context; Reynolds number is not a model input; checkpoints are averaged without conditioning on measured lift.</li><li>Panel: steady, incompressible, inviscid, attached flow, M ≤ 0.3; ${esc(p.result.scope.excluded.slice(0, 4).join('; '))}.</li><li>Pointwise ±2σ is not a calibrated 95% confidence guarantee. Geometries are comparable, not identical: analytic closed-trailing-edge NACA and rounded tip for the panel; sampled section and implicit tip for LWM.</li><li>No low-Reynolds 900 mm foam wing, stall, structural response, viscous drag or flight safety is validated here.</li></ul>`),
      doc('docHelp', 'Help and a solved comparison', `<p>Select NACA 0012 at 8.85° and compare η = 0.05 with η = 0.9883: the tip is where panel and experiment differ most. Switch the mesh from 672 to 1152 panels: CL moves by about ${fmt(Math.abs(a.panelCLLastMeshChangePercent), 2)}% while the remaining error against experiment stays near ${fmt(Math.abs(a.mesh && a.mesh[2] ? a.mesh[2].CLerrorPercent : NaN), 2)}%: more panels do not remove model-form and geometry differences. Select NACA 0015 and read the tunnel-correction note before comparing.</p><p class="note">Re-solve panel runs the bundled WingAeroPanel solver in your browser for the selected recorded case; LWM is never re-run from this page.</p>`, location.hash === '#help'),
    ].join('');
  }
  function serviceHtml() {
    const cl = wing.client, st = cl ? cl.state : 'offline', d = cl && cl.domain;
    let h = `<p class="note">${esc(wing.serviceMsg || (st === 'offline' ? 'Offline: no service endpoint configured. New geometries are not predicted; the page shows the recorded benchmarks only.' : 'Service state: ' + st + '.'))}</p>`;
    if (d) h += `<p class="srcline">${esc(d.model.name)} · ${esc(short(d.model.commit))} · ${d.model.checkpoints} checkpoints · conditioning ${esc(d.model.conditioning)} · ${d.mock ? 'MOCK: replays recorded benchmarks only' : 'external runtime · independently validate before use'} · resident ${d.resident ? 'yes' : 'no'}${Number.isFinite(d.coldLoadSeconds) ? ' · cold load ' + fmt(d.coldLoadSeconds, 3) + ' s' : ''}</p><p class="srcline">Domain: α ${JSON.stringify(d.domain.alphaDeg)}°, M ${JSON.stringify(d.domain.mach)}, s/c ${JSON.stringify(d.domain.semiSpanOverChord)}, taper ${JSON.stringify(d.domain.taperRatio)}, sweep ${JSON.stringify(d.domain.sweepDeg)}°, sections ${esc((d.domain.sections || []).join(', '))}</p>`;
    const r = wing.screenResult;
    if (r && r.timing) {
      h += `<p class="caption">${esc(r.objective)} · mean screening of ${r.ranked.length} in-domain candidates in ${fmt(r.timing.meanMs, 4)} ms, full covariance for ${r.top.length} in ${fmt(r.timing.fullMs, 4)} ms${Number.isFinite(r.timing.coldLoadMs) ? ', model cold load ' + fmt(r.timing.coldLoadMs / 1000, 3) + ' s' : ''}, cache hits ${r.timing.cacheHits}. Ranking by posterior mean inside the model domain is a screening order, not validated accuracy.</p>`;
      h += table(['Rank', 'Section', 'α', 'M', 's/c', 'taper', 'sweep', 'CL mean', 'Cm,¼', 'root bending', 'CL ± 2σ (full)'], r.ranked.map(q => { const t = r.top.find(x => x.candidate === q.candidate); return [q.rank, q.candidate.section, q.candidate.alphaDeg, q.candidate.mach, q.candidate.semiSpanOverChord, q.candidate.taperRatio ?? 1, q.candidate.sweepDeg ?? 0, fmt(q.mean[0]), fmt(q.mean[1]), fmt(q.mean[2]), t && t.status === 'ok' && t.std ? fmt(t.mean[0]) + ' ± ' + fmt(2 * t.std[0], 2) : '—']; }));
      if (r.excluded.length) h += `<p class="note">Excluded ${r.excluded.length}: ${esc(r.excluded.slice(0, 6).map(x => (x.candidate.section || '') + ' s/c ' + x.candidate.semiSpanOverChord + ': ' + x.reasons.join('; ')).join(' · '))}${r.excluded.length > 6 ? ' · …' : ''}</p>`;
    }
    h += `<details class="doc"><summary>Protocol and deployment</summary><div class="body"><p>GET <code>/domain</code> describes the resident model and its declared input ranges (range membership alone is not accuracy validation); POST <code>/predict</code> with <code>mode: "mean"</code> returns posterior means of [CL (full pressure), Cm quarter-chord, root-bending coefficient, CL paper approximation]; <code>mode: "full"</code> adds the joint covariance and span stations. The browser caches by canonical input, screens by mean, and requests full covariance only for the top candidates. Reference implementation and mock: <a href="service/README.md">service/README.md</a>, <a href="service/lwm_service.py">lwm_service.py</a>. A real LWM runtime module is not supplied or validated in this release; mock tests validate replay and protocol only. Weights and training data are required on a resident process; this page starts no cluster job.</p></div></details>`;
    return h;
  }
  function wcancel() { wing.serial++; if (wing.worker) { wing.worker.terminate(); wing.worker = null; } $('solve').disabled = false; }
  async function initWing() {
    if (wing.data) return;
    $('runStatus').textContent = 'Loading recorded benchmark cases…';
    const res = await fetch('../wing-comparison/benchmarks.json'); if (!res.ok) throw Error('Comparison data unavailable (HTTP ' + res.status + ').');
    wing.data = await res.json();
    $('wing').replaceChildren(...wing.data.cases.map((c, i) => new Option(c.airfoil + ' · α ' + c.conditions.effectiveAlphaDeg + '°', String(i))));
    wstations();
    $('runStatus').textContent = 'Recorded panel and LWM results loaded.';
    $('wing').onchange = () => { wcancel(); wstations(); renderWing(); }; $('mesh').onchange = () => { wcancel(); renderWing(); }; $('eta').onchange = renderWing;
    $('solve').onclick = () => {
      wcancel(); const { c, i, key } = wsel(), original = c.panels[i], token = wing.serial; $('solve').disabled = true; $('runStatus').textContent = 'Solving the selected mesh in the browser…';
      try {
        wing.worker = new Worker('../wing-comparison/worker.js');
        wing.worker.onmessage = ({ data: d }) => { if (token !== wing.serial) return; if (d.progress) { $('runStatus').textContent = d.progress; return; } if (d.error) { $('runStatus').textContent = 'Panel solve failed: ' + d.error; wcancel(); return; } if (d.result) { wing.fresh.set(key, Object.assign({}, original, { result: d.result, fresh: true })); wcancel(); $('runStatus').textContent = 'Fresh browser solve, ' + d.result.mesh.panels + ' panels.'; renderWing(); } };
        wing.worker.onerror = e => { if (token !== wing.serial) return; $('runStatus').textContent = 'Panel worker failed: ' + e.message; wcancel(); };
        wing.worker.postMessage({ geometry: original.geometry, flow: original.flow, mesh: { chordPanels: [16, 24, 32][i], spanPanels: [8, 12, 16][i] } });
      } catch (e) { $('runStatus').textContent = 'Cannot start the panel worker: ' + e.message; wcancel(); }
    };
    $('probe').onclick = async () => {
      const ep = $('endpoint').value.trim();
      wing.client = LW.createClient(ep === 'mock' ? { transport: LW.createMockTransport(wing.data) } : { endpoint: ep });
      wing.screenResult = null; wing.serviceMsg = 'Connecting…'; renderWing();
      const r = await wing.client.probe();
      wing.serviceMsg = r.state === 'offline' ? 'Offline: no endpoint. Type "mock" to exercise the adapter on the recorded cases only.' : r.state === 'error' ? 'Service error: ' + r.error : 'Connected: ' + r.state + (r.domain && r.domain.mock ? ' (mock, recorded cases only)' : '');
      $('screenBtn').disabled = !(r.state === 'online' || r.state === 'cold'); $('candFs').hidden = $('screenBtn').disabled;
      if (r.domain) { $('candSection').replaceChildren(...(r.domain.domain.sections || []).map(s => new Option(s, s))); }
      state.tab.wing = 'svc'; renderWing();
    };
    $('screenBtn').onclick = async () => {
      if (!wing.client) return;
      try {
      const list = id => { const v=$(id).value.split(',').map(s=>s.trim()); if(v.some(s=>!s||!Number.isFinite(Number(s)))) throw Error('Candidate lists require finite numbers.'); return v.map(Number); };
      const cands = []; for (const sc of list('candSC')) for (const tp of list('candTaper')) for (const sw of list('candSweep')) cands.push({ section: $('candSection').value, alphaDeg: +$('candAlpha').value, mach: +$('candMach').value, semiSpanOverChord: sc, taperRatio: tp, sweepDeg: sw });
      if(cands.length > 500) throw Error('Use at most 500 candidates.');
      wing.serviceMsg = 'Screening ' + cands.length + ' candidates…'; renderWing();
      try { wing.screenResult = await wing.client.screen(cands, { objective: $('objective').value, topK: +$('topK').value, minCL: +$('minCLw').value, onProgress: m => { wing.serviceMsg = m; } }); wing.serviceMsg = 'Screening done · state ' + wing.client.state; }
      catch (e) { wing.serviceMsg = 'Screening failed: ' + e.message; }
      state.tab.wing = 'svc'; renderWing();
      } catch(e) { wing.screenResult=null; wing.serviceMsg=e.message; renderWing(); }
    };
    renderWing();
  }

  // ======================= mode and routing =======================
  async function setMode(mode) {
    state.mode = mode; $('modeSection').setAttribute('aria-pressed', String(mode === 'section')); $('modeWing').setAttribute('aria-pressed', String(mode === 'wing'));
    $('sideSection').hidden = mode !== 'section'; $('sideWing').hidden = mode !== 'wing';
    if (location.hash !== (mode === 'wing' ? '#wing' : '#comparison') && location.hash !== '#help') history.replaceState(null, '', mode === 'wing' ? '#wing' : '#comparison');
    try { if (mode === 'wing') { await initWing(); renderWing(); } else renderSection(); }
    catch (e) { $('strip').innerHTML = `<p class="err">${esc(e.message)}</p>`; $('chips').innerHTML = chip('bad', 'load error'); }
  }
  $('modeSection').onclick = () => setMode('section'); $('modeWing').onclick = () => setMode('wing');
  $('helpBtn').onclick = () => { const d = $('docHelp'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth' }); } };
  window.addEventListener('hashchange', () => { if (location.hash === '#wing' && state.mode !== 'wing') setMode('wing'); else if (location.hash === '#comparison' && state.mode !== 'section') setMode('section'); else if (location.hash === '#help') $('helpBtn').click(); });
  (async () => {
    try { await initSection(); } catch (e) { $('strip').innerHTML = `<p class="err">${esc(e.message)}</p>`; $('chips').innerHTML = chip('bad', 'load error'); }
    if (location.hash === '#wing') setMode('wing'); else { setMode('section'); if (location.hash === '#help') setTimeout(() => $('helpBtn').click(), 50); }
  })();
})();
