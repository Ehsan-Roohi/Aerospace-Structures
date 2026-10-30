/* Generated from published 47911135d4f21252a63ae61c00229da8a6bf0f77; numerical definitions unchanged. */
const LoadProfiles = (() => {
  'use strict';
  const SHAPES = Object.freeze(['start', 'end', 'middle']);
  const CURVES = Object.freeze(['elliptic', 'parabolic']);
  const AREA = Object.freeze({ elliptic: Math.PI / 4, parabolic: 2 / 3 });
  const CENTROID = Object.freeze({
    elliptic: Object.freeze({ start: 4 / (3 * Math.PI), end: 1 - 4 / (3 * Math.PI), middle: 0.5 }),
    parabolic: Object.freeze({ start: 3 / 8, end: 5 / 8, middle: 0.5 }),
  });
  const LIMITS = Object.freeze({ tableRows: 31, segments: 30, csvBytes: 20000, csvLines: 200 });

  // ------------------------------------------------------------- Gauss-Legendre rules on [-1, 1]
  function gaussLegendre(n) {
    const x = new Array(n), w = new Array(n);
    for (let i = 0; i < n; i++) {
      let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), pp = 1, z1;
      do {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = (n * (z * p1 - p2)) / (z * z - 1);
        z1 = z; z = z1 - p1 / pp;
      } while (Math.abs(z - z1) > 1e-15);
      x[i] = -z; w[i] = 2 / ((1 - z * z) * pp * pp);
    }
    return Object.freeze({ x: Object.freeze(x), w: Object.freeze(w) });
  }
  const GL3 = gaussLegendre(3), GL8 = gaussLegendre(8), GL16 = gaussLegendre(16);
  function glInterval(rule, a, b, f) {
    const half = (b - a) / 2, mid = (a + b) / 2;
    let s = 0;
    for (let k = 0; k < rule.x.length; k++) s += rule.w[k] * f(mid + half * rule.x[k]);
    return half * s;
  }

  // ------------------------------------------------------------- shapes
  const clampU = (u) => (u > 1 ? 1 : u < -1 ? -1 : u);
  function curveMap(p) {
    const l = p.end - p.start;
    if (p.shape === 'start') return { c: p.start, d: l };
    if (p.shape === 'end') return { c: p.end, d: -l };
    return { c: 0.5 * (p.start + p.end), d: 0.5 * l };
  }
  const shapeG = (kind, u) => (kind === 'elliptic' ? Math.sqrt(Math.max(0, 1 - u * u)) : 1 - u * u);

  /** Intensity at x (zero outside the load). Linear items: {kind:'distributed', start, end, qStart, qEnd}. */
  function valueAt(p, x) {
    if (p.kind === 'distributed') {
      if (x < p.start || x > p.end) return 0;
      return p.qStart + ((p.qEnd - p.qStart) * (x - p.start)) / (p.end - p.start);
    }
    if (p.kind === 'table') {
      const pts = p.points, n = pts.length;
      if (x < pts[0][0] || x > pts[n - 1][0]) return 0;
      let i = 0;
      while (i < n - 2 && x > pts[i + 1][0]) i++;
      const [x0, w0] = pts[i], [x1, w1] = pts[i + 1];
      return w0 + ((w1 - w0) * (x - x0)) / (x1 - x0);
    }
    if (CURVES.includes(p.kind)) {
      if (x < p.start || x > p.end) return 0;
      const { c, d } = curveMap(p);
      return p.peak * shapeG(p.kind, clampU((x - c) / d));
    }
    return 0;
  }

  /** Chord fraction x/c at x for a wing load (table rows may carry their own x/c). */
  function fractionAt(p, x) {
    if (p.kind !== 'table' || p.points[0].length < 3) return p.fraction;
    const pts = p.points, n = pts.length;
    if (x <= pts[0][0]) return pts[0][2];
    if (x >= pts[n - 1][0]) return pts[n - 1][2];
    let i = 0;
    while (i < n - 2 && x > pts[i + 1][0]) i++;
    const [x0, , f0] = pts[i], [x1, , f1] = pts[i + 1];
    return f0 + ((f1 - f0) * (x - x0)) / (x1 - x0);
  }

  function linearPiece(xa, xb, wa, wb, x1, x2, o) {
    const a = Math.max(x1, xa), b = Math.min(x2, xb);
    if (!(b > a)) return [0, 0];
    const k = (wb - wa) / (xb - xa), qa = wa + k * (a - xa), h = b - a;
    const F = qa * h + (k * h * h) / 2;
    return [F, (a - o) * F + (qa * h * h) / 2 + (k * h * h * h) / 3];
  }

  /** [∫ w dx, ∫ (x - o) w dx] over [x1, x2] ∩ load (exact). */
  function integrals(p, x1, x2, o = 0) {
    if (p.kind === 'distributed') return linearPiece(p.start, p.end, p.qStart, p.qEnd, x1, x2, o);
    if (p.kind === 'table') {
      let F = 0, Mo = 0;
      const pts = p.points;
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i + 1][0] <= x1 || pts[i][0] >= x2) continue;
        const [f, m] = linearPiece(pts[i][0], pts[i + 1][0], pts[i][1], pts[i + 1][1], x1, x2, o);
        F += f; Mo += m;
      }
      return [F, Mo];
    }
    if (!CURVES.includes(p.kind)) return [0, 0];
    const a = Math.max(x1, p.start), b = Math.min(x2, p.end);
    if (!(b > a)) return [0, 0];
    const { c, d } = curveMap(p), ua = clampU((a - c) / d), ub = clampU((b - c) / d);
    let I0, I1;
    if (p.kind === 'elliptic') {
      const G0 = (u) => 0.5 * (u * Math.sqrt(Math.max(0, 1 - u * u)) + Math.asin(u));
      const G1 = (u) => -Math.pow(Math.max(0, 1 - u * u), 1.5) / 3;
      I0 = G0(ub) - G0(ua); I1 = G1(ub) - G1(ua);
    } else {
      const P0 = (u) => u - (u * u * u) / 3, P1 = (u) => (u * u) / 2 - (u * u * u * u) / 4;
      I0 = P0(ub) - P0(ua); I1 = P1(ub) - P1(ua);
    }
    const F = p.peak * d * I0;
    return [F, p.peak * d * ((c - o) * I0 + d * I1)];
  }

  /** ∫ f(x) w(x) dx over [x1, x2] ∩ load with a rule suited to the profile (f smooth). */
  function weighted(p, x1, x2, f, rule = GL16) {
    if (p.kind === 'distributed' || p.kind === 'table') {
      const pieces = p.kind === 'table'
        ? p.points.slice(0, -1).map((q, i) => [q[0], p.points[i + 1][0]])
        : [[p.start, p.end]];
      let s = 0;
      for (const [xa, xb] of pieces) {
        const a = Math.max(x1, xa), b = Math.min(x2, xb);
        if (b > a) s += glInterval(rule === GL16 ? GL8 : rule, a, b, (x) => f(x) * valueAt(p, x));
      }
      return s;
    }
    if (!CURVES.includes(p.kind)) return 0;
    const a = Math.max(x1, p.start), b = Math.min(x2, p.end);
    if (!(b > a)) return 0;
    if (p.kind === 'parabolic') return glInterval(rule === GL16 ? GL8 : rule, a, b, (x) => f(x) * valueAt(p, x));
    const { c, d } = curveMap(p);
    const pa = Math.asin(clampU((a - c) / d)), pb = Math.asin(clampU((b - c) / d));
    // ∫ f(x) w0 sqrt(1 - u^2) d du with u = sin(phi):  w0 d ∫ f(c + d sin phi) cos^2 phi dphi
    return p.peak * d * glInterval(GL16, pa, pb, (phi) => { const cs = Math.cos(phi); return f(c + d * Math.sin(phi)) * cs * cs; });
  }

  /** Consistent Hermite beam-element loads ∫ N_i(t) w(x) dx on [x0, x0 + h], t = (x - x0)/h. */
  function hermiteNodal(p, x0, h) {
    const out = [0, 0, 0, 0];
    const rule = p.kind === 'elliptic' ? GL16 : GL3;
    for (let i = 0; i < 4; i++) {
      out[i] = weighted(p, x0, x0 + h, (x) => {
        const t = (x - x0) / h;
        return i === 0 ? 1 - 3 * t * t + 2 * t * t * t : i === 1 ? h * (t - 2 * t * t + t * t * t) : i === 2 ? 3 * t * t - 2 * t * t * t : h * (-t * t + t * t * t);
      }, rule);
    }
    return out;
  }

  // ------------------------------------------------------------- validation (shared by engines)
  const finite = (v, name) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
    return v;
  };
  /**
   * Validated copy of an elliptic/parabolic load. ctx: {min, max, lengthUnit, lineUnit, name}.
   * Exactly one of total (N) or peak (line-load unit) must be given; both are returned, with basis.
   */
  function normalizeCurve(v, ctx) {
    const name = ctx.name || `${v.kind} load`;
    for (const k of ['start', 'end']) finite(v[k], `${name} ${k}`);
    if (v.start < ctx.min || v.end > ctx.max || !(v.end > v.start))
      throw new Error(`${name}: needs ${ctx.min} ≤ start < end ≤ ${ctx.max} ${ctx.lengthUnit}.`);
    if (!SHAPES.includes(v.shape)) throw new Error(`${name}: choose the maximum at the start, at the end or in the middle.`);
    // A load normalised before carries both values and its basis: it is re-read from the entered value only, so
    // normalising twice (an engine re-solving its own normalised input) gives the same load.
    const src = v.basis === 'total' ? { total: v.total } : v.basis === 'peak' ? { peak: v.peak } : v;
    const hasT = src.total !== undefined && src.total !== null, hasP = src.peak !== undefined && src.peak !== null;
    if (hasT === hasP) throw new Error(`${name}: give either the total force F or the peak intensity w0, not both.`);
    const l = v.end - v.start, A = AREA[v.kind];
    let total, peak;
    if (hasT) { total = finite(src.total, `${name} total force`); peak = total / (A * l); }
    else { peak = finite(src.peak, `${name} peak intensity`); total = A * peak * l; }
    return { kind: v.kind, start: v.start, end: v.end, shape: v.shape, basis: hasT ? 'total' : 'peak', total, peak };
  }
  /** Validated piecewise-linear table. ctx: {min, max, lengthUnit, allowFraction, name, eps}. */
  function normalizeTable(v, ctx) {
    const name = ctx.name || 'Table load';
    if (!Array.isArray(v.points) || v.points.length < 2 || v.points.length > LIMITS.tableRows)
      throw new Error(`${name}: use 2 to ${LIMITS.tableRows} rows.`);
    const width = v.points[0] && v.points[0].length;
    if (!(width === 2 || (width === 3 && ctx.allowFraction)))
      throw new Error(`${name}: each row is [station, intensity]${ctx.allowFraction ? ' or [station, intensity, x/c]' : ''}.`);
    const eps = ctx.eps || 0;
    const points = v.points.map((r, i) => {
      if (!Array.isArray(r) || r.length !== width) throw new Error(`${name} row ${i + 1}: every row needs the same ${width} values.`);
      r.forEach((x, k) => finite(x, `${name} row ${i + 1} value ${k + 1}`));
      if (width === 3 && (r[2] < 0 || r[2] > 1)) throw new Error(`${name} row ${i + 1}: x/c must be between 0 and 1.`);
      return r.slice();
    });
    for (let i = 0; i < points.length; i++) {
      if (points[i][0] < ctx.min || points[i][0] > ctx.max) throw new Error(`${name} row ${i + 1}: station ${points[i][0]} ${ctx.lengthUnit} is outside ${ctx.min}–${ctx.max} ${ctx.lengthUnit}.`);
      if (i && !(points[i][0] - points[i - 1][0] > eps)) throw new Error(`${name} row ${i + 1}: stations must strictly increase (no repeated station).`);
    }
    const out = { kind: 'table', points };
    if (v.source && typeof v.source === 'object') {
      const src = {};
      if (typeof v.source.filename === 'string') src.filename = v.source.filename.slice(0, 200);
      if (typeof v.source.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.source.sha256)) src.sha256 = v.source.sha256;
      if (Number.isInteger(v.source.rows)) src.rows = v.source.rows;
      out.source = src;
    }
    if (typeof v.label === 'string') out.label = v.label.slice(0, 120);
    return out;
  }
  const segmentsOf = (p) => (p && p.kind === 'table' && Array.isArray(p.points) ? Math.max(1, p.points.length - 1) : 1);
  const segmentCount = (items) => items.reduce((n, p) => n + segmentsOf(p), 0);

  /** Total, first moment about 0 and centroid of one load (null centroid when the total is zero). */
  function stats(p) {
    const lo = p.kind === 'table' ? p.points[0][0] : p.start, hi = p.kind === 'table' ? p.points.at(-1)[0] : p.end;
    const [F, S] = integrals(p, lo, hi, 0);
    const scale = Math.max(Math.abs(F), ...((p.kind === 'table' ? p.points.map((r) => Math.abs(r[1])) : [Math.abs(p.peak ?? p.qStart ?? 0), Math.abs(p.qEnd ?? 0)]).map((w) => w * (hi - lo))));
    return { total: F, firstMoment: S, centroid: Math.abs(F) > 1e-12 * (scale || 1) ? S / F : null, start: lo, end: hi };
  }

  // ------------------------------------------------------------- CSV line-load tables
  const CSV_SPECS = Object.freeze({
    beam: Object.freeze({ workspace: 'beam', columns: ['x_mm', 'w_N_per_mm'], optional: null, station: 'x', lengthUnit: 'mm', lineUnit: 'N/mm', forceUnit: 'N', momentUnit: 'N·mm', sign: 'positive downward', reference: 'the left end x = 0' }),
    printed: Object.freeze({ workspace: 'printed', columns: ['y_mm', 'w_N_per_mm'], optional: 'x_over_c', station: 'y', lengthUnit: 'mm', lineUnit: 'N/mm', forceUnit: 'N', momentUnit: 'N·mm', sign: 'positive upward', reference: 'the root y = 0' }),
    d520: Object.freeze({ workspace: 'd520', columns: ['y_m', 'w_N_per_m'], optional: 'x_over_c', station: 'y', lengthUnit: 'm', lineUnit: 'N/m', forceUnit: 'N', momentUnit: 'N·m', sign: 'positive upward', reference: 'the fittings' }),
  });
  const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  function csvTemplate(workspace, example) {
    const s = CSV_SPECS[workspace];
    if (!s) throw new Error('Unknown workspace for the CSV template.');
    const head = [...s.columns, ...(s.optional ? [s.optional] : [])].join(',');
    const rows = example || (workspace === 'beam' ? ['0,0.002', '225,0.001', '450,0'] : workspace === 'printed' ? ['0,0.004,0.25', '225,0.003,0.25', '450,0,0.25'] : ['0.46,1200,0.25', '2.5,800,0.25', '4.93,0,0.25']);
    return [
      `# MIE 446 ${workspace === 'beam' ? 'Beam Lab' : workspace === 'printed' ? 'printed-wing' : 'D.520'} line-load table. Lines starting with # are ignored.`,
      `# ${s.columns[0]}: station in ${s.lengthUnit}, strictly increasing. ${s.columns[1]}: line load in ${s.lineUnit}, ${s.sign}.`,
      s.optional ? '# x_over_c (optional): chord position of the load from the leading edge, 0 to 1, interpolated linearly along the span.' : '# Beam tables have no chord column.',
      `# The load is linear between rows and zero outside the first and last station. At most ${LIMITS.tableRows} rows.`,
      head, ...rows, '',
    ].join('\n');
  }
  /**
   * Parse a line-load table. opts: {workspace, min, max, ref (moment reference station)}.
   * Returns {ok, errors, warnings, rows, hasFraction, spec, stats}. Never throws for bad input.
   */
  function parseCsv(text, opts) {
    const spec = CSV_SPECS[opts && opts.workspace];
    const errors = [], warnings = [];
    const fail = () => ({ ok: false, errors, warnings, rows: [], spec, stats: null });
    if (!spec) { errors.push('Unknown workspace.'); return fail(); }
    if (typeof text !== 'string') { errors.push('No text to read.'); return fail(); }
    if (text.length > LIMITS.csvBytes) { errors.push(`The file is larger than ${LIMITS.csvBytes / 1000} kB; a load table needs at most ${LIMITS.tableRows} rows.`); return fail(); }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (!Number.isFinite(opts.min) || !Number.isFinite(opts.max)) { errors.push('The allowed station range is unknown.'); return fail(); }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) { errors.push('The file contains control characters: save it as plain-text CSV.'); return fail(); }
    const lines = text.split(/\r\n|\n|\r/);
    if (lines.length > LIMITS.csvLines) { errors.push(`The file has more than ${LIMITS.csvLines} lines.`); return fail(); }
    const unquote = (f) => { const t = f.trim(); return t.length >= 2 && t[0] === '"' && t.at(-1) === '"' ? t.slice(1, -1).trim() : t; };
    let header = null, headerLine = 0;
    const rows = [];
    lines.forEach((raw, idx) => {
      const line = raw.trim(), n = idx + 1;
      if (!line || line.startsWith('#')) return;
      if (line.includes(';') || line.includes('\t')) { errors.push(`Line ${n}: use commas between values and a dot as the decimal separator.`); return; }
      const fields = line.split(',').map(unquote);
      if (fields.every((f) => f === '')) return;          // an empty spreadsheet row such as ",,"
      if (!header) {
        header = fields; headerLine = n;
        const want = spec.columns.map((c) => c.toLowerCase()), got = fields.map((f) => f.toLowerCase());
        const ok2 = got.length === 2 && got[0] === want[0] && got[1] === want[1];
        const ok3 = spec.optional && got.length === 3 && got[0] === want[0] && got[1] === want[1] && got[2] === spec.optional.toLowerCase();
        if (!ok2 && !ok3) errors.push(`Line ${n}: the header must be ${spec.columns.join(',')}${spec.optional ? ` (optionally ,${spec.optional})` : ''} — units are part of the column names.`);
        return;
      }
      if (fields.length !== header.length) { errors.push(`Line ${n}: expected ${header.length} values, found ${fields.length}.`); return; }
      const nums = [];
      for (let k = 0; k < fields.length; k++) {
        const f = fields[k];
        if (!NUMBER.test(f)) { errors.push(`Line ${n}: "${f.slice(0, 24)}" in ${header[k]} is not a plain number.`); return; }
        const v = Number(f);
        if (!Number.isFinite(v)) { errors.push(`Line ${n}: ${header[k]} is too large to be a finite number.`); return; }
        nums.push(v);
      }
      if (nums.length === 3 && (nums[2] < 0 || nums[2] > 1)) { errors.push(`Line ${n}: x_over_c must be between 0 (leading edge) and 1 (trailing edge).`); return; }
      if (nums[0] < opts.min || nums[0] > opts.max) { errors.push(`Line ${n}: ${spec.columns[0]} = ${nums[0]} is outside the allowed ${opts.min}–${opts.max} ${spec.lengthUnit}.`); return; }
      rows.push({ n, v: nums });
    });
    if (!header) errors.push(`No header found. The first line must be ${spec.columns.join(',')}${spec.optional ? `[,${spec.optional}]` : ''}.`);
    if (header && !errors.length && rows.length < 2) errors.push('At least two data rows are needed.');
    if (rows.length > LIMITS.tableRows) errors.push(`At most ${LIMITS.tableRows} data rows (${LIMITS.tableRows - 1} linear segments); this file has ${rows.length}. Nothing is truncated or resampled: shorten the table.`);
    for (let i = 1; i < rows.length; i++) if (!(rows[i].v[0] > rows[i - 1].v[0]))
      errors.push(`Line ${rows[i].n}: ${spec.columns[0]} must strictly increase (${rows[i].v[0]} after ${rows[i - 1].v[0]}); a step change needs two separate loads.`);
    if (errors.length) return fail();
    const points = rows.map((r) => r.v);
    const table = { kind: 'table', points };
    const s = stats(table), ref = Number.isFinite(opts.ref) ? opts.ref : 0;
    if (points.every((r) => r[1] === 0)) warnings.push('Every intensity is zero: the table adds no load.');
    if (points[0][1] !== 0 || points.at(-1)[1] !== 0) warnings.push('The load is not zero at the first or last station, so it starts or stops abruptly there.');
    return {
      ok: true, errors, warnings, rows: points, hasFraction: header.length === 3, spec, headerLine,
      stats: { rows: points.length, segments: points.length - 1, total: s.total, firstMoment: s.firstMoment, centroid: s.centroid, ref, momentAboutRef: s.firstMoment - ref * s.total, start: s.start, end: s.end,
        wMin: Math.min(...points.map((r) => r[1])), wMax: Math.max(...points.map((r) => r[1])) },
    };
  }
  const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /** One-line human description of a curved load's law (for lists, reports and figures). */
  function lawText(p) {
    const s = 's = (x − a)/ℓ, ℓ = b − a';
    if (p.kind === 'elliptic') return { start: 'w = w₀√(1 − s²): maximum at the start, zero at the end', end: 'w = w₀√(1 − (1 − s)²): zero at the start, maximum at the end', middle: 'w = w₀√(1 − (2s − 1)²): symmetric, zero at both ends' }[p.shape] + `; ${s}; F = πw₀ℓ/4`;
    if (p.kind === 'parabolic') return { start: 'w = w₀(1 − s²): maximum (zero slope) at the start, zero at the end', end: 'w = w₀(1 − (1 − s)²): zero at the start, maximum (zero slope) at the end', middle: 'w = 4w₀s(1 − s): symmetric, zero at both ends' }[p.shape] + `; ${s}; F = 2w₀ℓ/3`;
    return '';
  }

  /** Pure UI renderer; sampling draws the curve only. Resultants use the existing exact integrals. */
  function powerTable({start,end,total,exponent,shape='start'}) {
    if(![start,end,total,exponent].every(Number.isFinite)||!(end>start)||exponent<.1||exponent>12||!SHAPES.includes(shape))throw new Error('Power profile: finite start < end, total force, exponent 0.1–12 and a valid maximum location are required.');
    const points=Array.from({length:31},(_,i)=>{const s=i/30,g=shape==='start'?1-s:shape==='end'?s:4*s*(1-s);return [start+(end-start)*s,g**exponent];});
    const area=stats({kind:'table',points}).total;
    return {kind:'table',points:points.map(([x,q])=>[x,q*total/area]),label:`Power-law n=${exponent}; 31-point piecewise-linear representation`};
  }
  function powerControls(prefix,units) {
    const input=(key,label,value='')=>`<label style="display:block;margin:6px 0">${escapeHtml(label)} <input id="${prefix}Power${key}" type="number" step="any" value="${value}"></label>`;
    return `<details class="power-profile-generator"><summary>Nonlinear power-law table · exponent n</summary><p>q ∝ (1−s)ⁿ, sⁿ, or [4s(1−s)]ⁿ; s=(station−a)/(b−a). 0.1 ≤ n ≤ 12. This produces an explicitly approximate 31-point, piecewise-linear load table, rescaled so its integrated total is exactly your F. It is not a new exact nonlinear solver law. Preview first; nothing is applied automatically.</p>${input('A','Start a ('+units.length+')')}${input('B','End b ('+units.length+')')}${input('F','Total force F ('+units.force+')')}${input('N','Exponent n',2)}<label>Maximum location <select id="${prefix}PowerShape"><option value="start">Start · (1−s)ⁿ</option><option value="end">End · sⁿ</option><option value="middle">Middle · [4s(1−s)]ⁿ</option></select></label><button type="button" id="${prefix}PowerPreview">Generate table &amp; preview only</button></details>`;
  }
  function previewFigure(input,opts={}) {
    const u={length:'mm',line:'N/mm',force:'N',moment:'N·mm',...opts.units},esc=escapeHtml;
    const f=n=>Number.isFinite(n)?String(Number(n.toPrecision(5))):'—';
    let p=input;
    if(!p) return '<p>Enter the load parameters to see its live schematic.</p>';
    if(p.kind==='point'||p.kind==='moment') {
      const v=p.kind==='point'?p.force:p.moment;
      if(!Number.isFinite(v)||!Number.isFinite(p.position))throw new Error('Enter a finite magnitude and position.');
      return `<figure class="load-profile-preview"><svg role="img" aria-label="${p.kind==='point'?'Point force':'Point couple'} schematic" viewBox="0 0 520 150" style="width:100%;max-width:640px"><path d="M40 110H480" stroke="currentColor"/>${v===0?'':p.kind==='point'?`<path d="M260 30V100m-7 -10l7 10 7 -10" fill="none" stroke="#9140a3" stroke-width="3" transform="${(opts.positive==='down'?v<0:v>=0)?'translate(0 135) scale(1 -1)':''}"/>`:'<text x="238" y="88" font-size="48" fill="#9140a3">' + (v>=0?'↻':'↺') + '</text>'}<text x="260" y="132" text-anchor="middle" fill="currentColor" font-size="13">station = ${esc(f(p.position))} ${esc(u.length)}</text><text x="260" y="20" text-anchor="middle" fill="currentColor" font-size="14">${p.kind==='point'?'F':'C'} = ${esc(f(v))} ${esc(p.kind==='point'?u.force:u.moment)} (${p.kind==='moment'?(v>=0?'clockwise':'counter-clockwise'):(v>=0?opts.positive||'up':opts.positive==='down'?'up':'down')})</text></svg><figcaption>${p.kind==='point'?'Point force: measured in '+esc(u.force)+', not force per length.':'Point couple: measured in '+esc(u.moment)+', not a force.'}</figcaption></figure>`;
    }
    if(CURVES.includes(p.kind))p=normalizeCurve(p,{min:-Infinity,max:Infinity,lengthUnit:u.length});
    const s=opts.summary||stats(p),a=s.start,b=s.end;
    if(!Number.isFinite(a)||!Number.isFinite(b)||!(b>a))throw new Error('A line load needs finite start < end.');
    const xs=p.kind==='table'?p.points.map(r=>r[0]):Array.from({length:81},(_,i)=>a+(b-a)*i/80);
    const points=xs.map(x=>[x,valueAt(p,x)]);
    if(points.some(r=>!r.every(Number.isFinite)))throw new Error('Non-finite load profile.');
    const ownPeak=Math.max(...points.map(r=>Math.abs(r[1]))),bound=Math.max(ownPeak,opts.scalePeak||0,1e-30);
    const X=x=>52+(x-a)/(b-a)*440,Y=q=>112-q/bound*67;
    const poly=points.map(([x,q])=>`${f(X(x))},${f(Y(q))}`).join(' ');
    const marker=s.centroid!==null&&s.centroid>=a&&s.centroid<=b?`<path d="M${f(X(s.centroid))} 32V187" stroke="#0873e8" stroke-dasharray="4 3"/><text x="${f(X(s.centroid))}" y="28" text-anchor="middle" fill="#0873e8" font-size="12">resultant station</text>`:'';
    return `<figure class="load-profile-preview" data-peak="${ownPeak}" data-total="${s.total}"><svg role="img" aria-label="${esc(p.kind)} line load, signed intensity against station" viewBox="0 0 540 225" style="width:100%;max-width:640px"><path d="M52 40V187H500M52 112H500" stroke="currentColor" fill="none" opacity=".6"/><text x="8" y="20" fill="currentColor" font-size="12">q (${esc(u.line)})</text><text x="8" y="49" fill="currentColor" font-size="11">${esc(f(bound))}</text><text x="32" y="116" fill="currentColor" font-size="11">0</text><text x="4" y="180" fill="currentColor" font-size="11">${esc(f(-bound))}</text><polygon points="${f(X(a))},112 ${poly} ${f(X(b))},112" fill="#9140a3" fill-opacity=".12"/><polyline data-profile-curve="1" points="${poly}" fill="none" stroke="#9140a3" stroke-width="2.5"/>${marker}<text x="52" y="205" fill="currentColor" font-size="12">a=${esc(f(a))}</text><text x="492" y="205" text-anchor="end" fill="currentColor" font-size="12">b=${esc(f(b))}</text><text x="280" y="221" text-anchor="middle" fill="currentColor" font-size="12">span station (${esc(u.length)}) · intensity axis is signed</text></svg><figcaption><b>Total force F = ${esc(f(s.total))} ${esc(u.force)}</b> · peak |q| = ${esc(f(ownPeak))} ${esc(u.line)} · length ℓ = ${esc(f(b-a))} ${esc(u.length)}<br>Resultant station = ${s.centroid===null?'not defined (zero net force)':esc(f(s.centroid))+' '+esc(u.length)} · moment about ${esc(f(opts.reference||0))} ${esc(u.length)} = ${esc(f(s.firstMoment-(opts.reference||0)*s.total))} ${esc(u.moment)}<br>${opts.scalePeak?'Shared intensity scale: heights compare actual intensities.':'Independent height: inspect the shape, not relative force magnitudes.'} Positive force direction: ${esc(opts.positive||'up')}.${CURVES.includes(p.kind)?'<br>'+esc(lawText(p)):opts.note?'<br>'+esc(opts.note):p.kind==='table'?'<br>CSV: piecewise-linear between the supplied stations; no hidden smoothing.':''}</figcaption></figure>`;
  }
  return {
    SHAPES, CURVES, AREA, CENTROID, LIMITS, CSV_SPECS, GL3, GL8, GL16, gaussLegendre,
    valueAt, fractionAt, integrals, weighted, hermiteNodal, normalizeCurve, normalizeTable,
    segmentsOf, segmentCount, stats, parseCsv, csvTemplate, escapeHtml, lawText, curveMap, previewFigure, powerTable, powerControls,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LoadProfiles;

/* Bonded thin-wall spar sections. mm, N, MPa, g/cm3.
 * Skin panels and spar web form a shear-flow network; caps are open panel branches.
 * Perfect ties transfer shear without adding fictitious material. Energy minimization
 * enforces nodal longitudinal equilibrium and torque, including closed-cell compatibility.
 * This is a thin-wall beam model, NOT 3-D joint, adhesive, runout or buckling analysis.
 * Network derivation: minimize 1/2 sum(q_e^2 l_e/(G_e t_e)), subject to
 * B q = -EA_i (z_i-zbar-c(x_i-xbar)) V/EI and a.q = T about the reference.
 * The torque row enforces closed-cell compatibility by complementary energy.
 * Zero cross-energy between unit V and T defines the shear centre. Panel area
 * is lumped to its end nodes for the shear-flow source; normal-stress section
 * integrals use the actual nonoverlapping cap/web polygons. Skin is sampled
 * to approximately 90 panels with extra cap-bond nodes. Curved caps use the
 * horizontal median-panel idealization in shear flow. Refinement is tested.
 * Theory context: MIT 16.20, Unit 15, Shearing and Torsion of Shell Beams:
 * https://ocw.mit.edu/courses/16-20-structural-mechanics-fall-2002/resources/unit15/
 */
const WingSpars=(()=>{
  'use strict';
  const MAT={name:'Printed PLA · teaching input',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10};
  const keys=['fraction','length','topWidth','topThickness','bottomWidth','bottomThickness','webThickness','material','widthMode'];
  const G=m=>m.E/(2*(1+m.nu));
  function specs(raw,L){
    if(raw==null)return [];
    if(!Array.isArray(raw))throw Error('Supply bonded spars as an array.');
    return raw.map((s,i)=>{
      if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!keys.includes(k)))throw Error(`Spar ${i+1}: unsupported field.`);
      const v={...s};
      for(const k of keys.filter(k=>k!=='material'&&k!=='widthMode'))if(!Number.isFinite(v[k])||v[k]<=0)throw Error(`Spar ${i+1}: ${k} must be finite and positive.`);
      if(v.widthMode!==undefined&&!['fixed','auto'].includes(v.widthMode))throw Error(`Spar ${i+1}: widthMode must be fixed or auto.`);
      if(v.fraction>=1||v.length>L||v.length<Math.min(20,L))throw Error('Spar station must be inside the chord; length must be 20 mm to the semi-span (or the full shorter span).');
      if(v.topThickness>v.topWidth/5||v.bottomThickness>v.bottomWidth/5)throw Error('Thin-wall spar caps require thickness ≤ width/5.');
      if(v.webThickness>=Math.min(v.topWidth,v.bottomWidth))throw Error('Spar web must be narrower than both caps.');
      const m=s.material;
      if(!m||Object.keys(m).some(k=>!Object.keys(MAT).includes(k)))throw Error('Supply spar material name, E, nu, rho, ft, fc and fs.');
      for(const k of ['E','rho','ft','fc','fs'])if(!Number.isFinite(m[k])||m[k]<=0)throw Error(`Spar material ${k} must be finite and positive.`);
      if(!Number.isFinite(m.nu)||m.nu<0||m.nu>=.5)throw Error('Spar material Poisson ratio must be 0 ≤ nu < 0.5.');
      if(typeof m.name!=='string'||!m.name.trim()||m.name.length>80)throw Error('Spar material name must contain 1–80 characters.');
      return Object.freeze({...v,material:Object.freeze({...m})});
    });
  }
  function widths(g,s,y){
    const chord=g.sectionChord??(g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan),scale=Math.min(1,Math.max(0,chord/g.rootChord)),auto=s.widthMode==='auto';
    return {topWidth:auto?Math.max(5*s.topThickness,s.topWidth*scale):s.topWidth,bottomWidth:auto?Math.max(5*s.bottomThickness,s.bottomWidth*scale):s.bottomWidth,scale:auto?scale:1,mode:auto?'auto':'fixed',minimumTopWidth:5*s.topThickness,minimumBottomWidth:5*s.bottomThickness};
  }
  function parts(g,y,ordinates){
    const c=g.sectionChord??(g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan),out=[];
    (g.spars||[]).forEach((s,index)=>{
      if(y>s.length+1e-8)return;
      const effective=widths(g,s,y),topWidth=effective.topWidth,bottomWidth=effective.bottomWidth;
      if(s.webThickness>=Math.min(topWidth,bottomWidth))throw Error(`Spar ${index+1}: tapered caps must remain wider than the web at y=${y.toFixed(1)} mm.`);
      const x=s.fraction*c,top=[],bottom=[];
      for(let j=0;j<=8;j++){
        const xt=x+topWidth*(j/8-.5),xb=x+bottomWidth*(j/8-.5);
        if(Math.min(xt,xb)<=g.cavityStart*c||Math.max(xt,xb)>=g.cavityEnd*c)throw Error(`Spar ${index+1} caps must fit wholly inside the cavity at y=${y.toFixed(1)} mm.`);
        const u=ordinates(g.naca,xt/c,c,g.te).upper-g.skin;
        const b=ordinates(g.naca,xb/c,c,g.te).lower+g.skin;
        const atTop=ordinates(g.naca,xt/c,c,g.te),atBottom=ordinates(g.naca,xb/c,c,g.te);
        if(u-s.topThickness<=atTop.lower+g.skin||b+s.bottomThickness>=atBottom.upper-g.skin)throw Error(`Spar ${index+1} cap thickness must fit between the inner skins at y=${y.toFixed(1)} mm.`);
        top.push([xt,u]);bottom.push([xb,b]);
      }
      const v=ordinates(g.naca,s.fraction,c,g.te),zt=v.upper-g.skin-s.topThickness/2,zb=v.lower+g.skin+s.bottomThickness/2;
      const h=zt-zb-(s.topThickness+s.bottomThickness)/2;
      if(h<=0||s.webThickness>h/5)throw Error(`Spar ${index+1}: positive web height and web thickness ≤ height/5 required at y=${y.toFixed(1)} mm.`);
      const at=(line,q)=>{let i=1;while(i<line.length-1&&line[i][0]<q)i++;const a=line[i-1],b=line[i];return a[1]+(b[1]-a[1])*(q-a[0])/(b[0]-a[0]);};
      const xl=x-s.webThickness/2,xr=x+s.webThickness/2,tu=q=>at(top,q)-s.topThickness,bl=q=>at(bottom,q)+s.bottomThickness;
      for(const q of [xl,xr,...top.map(p=>p[0]),...bottom.map(p=>p[0])].filter(q=>q>=xl&&q<=xr))if(tu(q)-bl(q)<5*s.webThickness)throw Error(`Spar ${index+1}: web thickness must be at most one fifth of the web height across its full width at y=${y.toFixed(1)} mm.`);
      const web=[[xl,bl(xl)],...bottom.filter(p=>p[0]>xl&&p[0]<xr).map(p=>[p[0],bl(p[0])]),[xr,bl(xr)],[xr,tu(xr)],...[...top].reverse().filter(p=>p[0]>xl&&p[0]<xr).map(p=>[p[0],tu(p[0])]),[xl,tu(xl)]];
      const polygons=[top.concat([...top].reverse().map(([a,b])=>[a,b-s.topThickness])),bottom.concat([...bottom].reverse().map(([a,b])=>[a,b+s.bottomThickness])),web];
      const outline=[...top,[top.at(-1)[0],tu(top.at(-1)[0])],...[...top].reverse().filter(p=>p[0]>xr&&p[0]<top.at(-1)[0]).map(p=>[p[0],tu(p[0])]),[xr,tu(xr)],[xr,bl(xr)],...bottom.filter(p=>p[0]>xr).map(p=>[p[0],bl(p[0])]),...bottom.slice().reverse(),[bottom[0][0],bl(bottom[0][0])],...bottom.filter(p=>p[0]>bottom[0][0]&&p[0]<xl).map(p=>[p[0],bl(p[0])]),[xl,bl(xl)],[xl,tu(xl)],...[...top].reverse().filter(p=>p[0]<xl).map(p=>[p[0],tu(p[0])])];
      out.push({index,s,widths:effective,x,zt,zb,h,top,bottom,polygons,outline});
    });
    for(let i=0;i<out.length;i++)for(let j=0;j<i;j++){
      const a=out[i],b=out[j],half=(Math.max(a.widths.topWidth,a.widths.bottomWidth)+Math.max(b.widths.topWidth,b.widths.bottomWidth))/2;
      if(Math.abs(a.x-b.x)<=half)throw Error('Bonded spar caps must not overlap each other.');
    }
    return out;
  }
  function polygon(p){
    const a=[0,0,0,0,0,0];
    p.forEach(([x,z],i)=>{const [u,v]=p[(i+1)%p.length],d=x*v-u*z;a[0]+=d/2;a[1]+=(z+v)*d/6;a[2]+=(x+u)*d/6;a[3]+=(z*z+z*v+v*v)*d/12;a[4]+=(x*x+x*u+u*u)*d/12;a[5]+=(2*x*z+x*v+u*z+2*u*v)*d/24;});
    return a[0]<0?a.map(v=>-v):a;
  }
  function linearSolve(A,b){
    const n=b.length,L=Array.from({length:n},()=>new Float64Array(n));
    for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=A[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];if(i===j){if(!(s>1e-18))throw Error('Disconnected or degenerate spar shear-flow network.');L[i][j]=Math.sqrt(s);}else L[i][j]=s/L[j][j];}
    const y=new Float64Array(n),x=new Float64Array(n);
    for(let i=0;i<n;i++){let s=b[i];for(let j=0;j<i;j++)s-=L[i][j]*y[j];y[i]=s/L[i][i];}
    for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<n;j++)s-=L[j][i]*x[j];x[i]=s/L[i][i];}return x;
  }
  function network(inner,outer,pla,ps,resolution=90){
    const nodes=[],edges=[],EA=[];
    const node=(p)=>{nodes.push(p);EA.push(0);return nodes.length-1;};
    const edge=(a,b,t,m,kind,index=-1,tie=false)=>{
      const p=nodes[a],q=nodes[b],l=Math.hypot(q[0]-p[0],q[1]-p[1]);if(l<1e-8)return;
      edges.push({a,b,t,m,l,kind,index,tie});if(!tie){EA[a]+=m.E*t*l/2;EA[b]+=m.E*t*l/2;}
    };
    // Keep roughly 90 skin edges; section resolution is independent of beam-element count.
    const stride=Math.max(1,Math.floor(inner.length/resolution)),ids=[];
    for(let i=0;i<inner.length;i+=stride)ids.push(i);
    ids.forEach(i=>node([(inner[i][0]+outer[i][0])/2,(inner[i][1]+outer[i][1])/2]));
    ids.forEach((i,k)=>{const j=ids[(k+1)%ids.length],poly=[];let v=i;while(v!==j){poly.push(outer[v]);v=(v+1)%inner.length;}poly.push(outer[j],inner[j]);v=(j-1+inner.length)%inner.length;while(v!==i){poly.push(inner[v]);v=(v-1+inner.length)%inner.length;}poly.push(inner[i]);const a=polygon(poly)[0],p=nodes[k],q=nodes[(k+1)%ids.length],l=Math.hypot(q[0]-p[0],q[1]-p[1]);edge(k,(k+1)%ids.length,a/l,pla,'skin');});
    ps.forEach(p=>{
      const m=p.s.material,ut=node([p.x,p.zt]),lt=node([p.x,p.zb]);
      const attach=(id,upper)=>{
        const x=nodes[id][0],ei=edges.findIndex(e=>e.kind==='skin'&&((nodes[e.a][1]+nodes[e.b][1])/2>(p.zt+p.zb)/2)===upper&&x>=Math.min(nodes[e.a][0],nodes[e.b][0])-1e-9&&x<=Math.max(nodes[e.a][0],nodes[e.b][0])+1e-9);
        if(ei<0)throw Error('Spar cap has no matching bonded skin panel.');
        const e=edges[ei],a=nodes[e.a],b=nodes[e.b],u=(x-a[0])/(b[0]-a[0]);let to;
        if(u<1e-8)to=e.a;else if(u>1-1e-8)to=e.b;else{
          to=node([x,a[1]+u*(b[1]-a[1])]);edges.splice(ei,1);EA[e.a]-=e.m.E*e.t*e.l/2;EA[e.b]-=e.m.E*e.t*e.l/2;
          edge(e.a,to,e.t,e.m,'skin');edge(to,e.b,e.t,e.m,'skin');
        }
        edge(id,to,1,m,'bond',p.index,true);
      };
      attach(ut,true);attach(lt,false);
      // Cap branches include independent upper/lower dimensions; the web excludes cap thickness.
      for(const [mid,width,t,kind] of [[ut,p.widths?.topWidth??p.s.topWidth,p.s.topThickness,'top cap'],[lt,p.widths?.bottomWidth??p.s.bottomWidth,p.s.bottomThickness,'bottom cap']])for(const sign of [-1,1]){
        const base=nodes[mid],a=node([base[0]+sign*width/4,base[1]]),b=node([base[0]+sign*width/2,base[1]]);edge(mid,a,t,m,kind,p.index);edge(a,b,t,m,kind,p.index);attach(a,mid===ut);attach(b,mid===ut);
      }
      const lo=node([p.x,p.zb+p.s.bottomThickness/2]),hi=node([p.x,p.zt-p.s.topThickness/2]);
      edge(lt,lo,1,m,'bond',p.index,true);edge(hi,ut,1,m,'bond',p.index,true);
      edge(lo,hi,p.s.webThickness,m,'web',p.index);
    });
    let sum=EA.reduce((a,b)=>a+b,0),xc=0,zc=0;
    EA.forEach((a,i)=>{xc+=a*nodes[i][0]/sum;zc+=a*nodes[i][1]/sum;});
    let Izz=0,Ixx=0,Ixz=0;EA.forEach((a,i)=>{const x=nodes[i][0]-xc,z=nodes[i][1]-zc;Izz+=a*z*z;Ixx+=a*x*x;Ixz+=a*x*z;});
    const coupling=Ixz/Ixx,EI=Izz-Ixz*coupling,N=nodes.length,K=Array.from({length:N},()=>new Float64Array(N));
    const maxC=Math.max(...edges.filter(e=>!e.tie).map(e=>G(e.m)*e.t/e.l));
    edges.forEach(e=>{
      e.c=e.tie?maxC*1e4:G(e.m)*e.t/e.l;
      const a=nodes[e.a],b=nodes[e.b];e.torque=(a[0]-xc)*(b[1]-a[1])-(a[1]-zc)*(b[0]-a[0]);
      e.row=[];if(e.a<N-1)e.row.push([e.a,1]);if(e.b<N-1)e.row.push([e.b,-1]);e.row.push([N-1,e.torque]);
      for(const [i,v]of e.row)for(const [j,w]of e.row)K[i][j]+=e.c*v*w;
    });
    const bV=new Float64Array(N),bT=new Float64Array(N);bT[N-1]=1;
    for(let i=0;i<N-1;i++)bV[i]=-EA[i]*((nodes[i][1]-zc)-coupling*(nodes[i][0]-xc))/EI;
    const flow=b=>{const u=linearSolve(K,b);return edges.map(e=>e.c*e.row.reduce((a,[i,v])=>a+v*u[i],0));};
    const qV=flow(bV),qT=flow(bT),dot=(a,b)=>edges.reduce((s,e,i)=>s+a[i]*b[i]/e.c,0);
    const fTT=dot(qT,qT),offset=-dot(qV,qT)/fTT,qVs=qV.map((v,i)=>v+offset*qT[i]);
    const resultants=q=>edges.reduce((s,e,i)=>{const a=nodes[e.a],b=nodes[e.b];s[0]+=q[i]*(b[0]-a[0]);s[1]+=q[i]*(b[1]-a[1]);s[2]+=q[i]*e.torque;return s;},[0,0,0]);
    const residual=(q,b)=>{const r=new Float64Array(N);edges.forEach((e,i)=>e.row.forEach(([j,v])=>r[j]+=q[i]*v));return Math.max(...r.map((v,i)=>Math.abs(v-b[i])));};
    const loadV=Float64Array.from(bV);loadV[N-1]=offset;
    return {nodes,edges,qV:qVs,qT,GJ:1/fTT,xsc:xc+offset,zsc:zc,referenceX:xc,unitV:resultants(qVs),unitT:resultants(qT),coupling,energyVT:dot(qVs,qT),residualV:residual(qVs,loadV),residualT:residual(qT,bT),method:'bonded thin-wall shear-flow network; cap-local Saint-Venant torsion neglected'};
  }
  function field(net,V,T){return net.edges.map((e,i)=>e.tie?0:Math.abs(-V*net.qV[i]+T*net.qT[i])/e.t);}
  /* General two-transverse-direction network on an affine normal-plane cut.
   * Original network() is deliberately unchanged. Call projectedNetwork(net,A)
   * with an existing skin/spar graph, or (inner,outer,pla,parts,A,resolution).
   * A maps original [x,z] to the new transverse coordinates [q2,q3]. Projected
   * material area is abs(det(A))*t*l; the thickness on the mapped edge is that
   * area divided by its new length. This is the projected beam-section model,
   * not an exact oblique cut through finite-thickness CAD or a shell FE model.
   * Torque convention: T=sum q*(x_a*dz-z_a*dx), about the reported centroid.
   * qV2 and qV3 are positive unit transverse resultants acting at the SC.
   */
  function projectedNetwork(first,second,pla,ps,affine,resolution=90){
    let raw,A;if(first&&Array.isArray(first.nodes)&&Array.isArray(first.edges)){raw=first;A=second;}else{raw=network(first,second,pla,ps,resolution);A=affine;}
    if(!Array.isArray(A)||A.length!==2||A.some(r=>!Array.isArray(r)||r.length!==2||r.some(v=>!Number.isFinite(v))))throw Error('The section projection must be a finite 2 by 2 matrix.');
    const determinant=A[0][0]*A[1][1]-A[0][1]*A[1][0],areaFactor=Math.abs(determinant);
    if(areaFactor<1e-8)throw Error('The projected section is singular or nearly parallel to the beam axis.');
    const nodes=raw.nodes.map(([x,z])=>[A[0][0]*x+A[0][1]*z,A[1][0]*x+A[1][1]*z]),N=nodes.length,EAi=new Float64Array(N);
    const edges=raw.edges.map(e=>{const a=nodes[e.a],b=nodes[e.b],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!(l>1e-12))throw Error('Projected section has a collapsed network edge.');const area=e.tie?0:areaFactor*e.t*e.l,t=e.tie?e.t:area/l;
      if(!e.tie){EAi[e.a]+=e.m.E*area/2;EAi[e.b]+=e.m.E*area/2;}return {...e,l,t,area};});
    const EA=EAi.reduce((a,b)=>a+b,0);if(!(EA>0))throw Error('Projected section has no axial stiffness.');
    let xc=0,zc=0;EAi.forEach((a,i)=>{xc+=a*nodes[i][0]/EA;zc+=a*nodes[i][1]/EA;});
    let Dxx=0,Dzz=0,Dxz=0;EAi.forEach((a,i)=>{const x=nodes[i][0]-xc,z=nodes[i][1]-zc;Dxx+=a*x*x;Dzz+=a*z*z;Dxz+=a*x*z;});
    const detD=Dxx*Dzz-Dxz*Dxz;if(!(detD>Number.EPSILON*Dxx*Dzz))throw Error('Projected section bending tensor is singular.');
    let exactXX=0,exactZZ=0,exactXZ=0;
    for(const e of edges)if(!e.tie){const a=nodes[e.a],b=nodes[e.b],x=a[0]-xc,u=b[0]-xc,z=a[1]-zc,v=b[1]-zc,w=e.m.E*e.area;
      exactXX+=w*(x*x+x*u+u*u)/3;exactZZ+=w*(z*z+z*v+v*v)/3;exactXZ+=w*(2*x*z+x*v+u*z+2*u*v)/6;}
    const K=Array.from({length:N},()=>new Float64Array(N)),maxC=Math.max(...edges.filter(e=>!e.tie).map(e=>G(e.m)*e.t/e.l));
    edges.forEach(e=>{e.c=e.tie?maxC*1e4:G(e.m)*e.t/e.l;const a=nodes[e.a],b=nodes[e.b];e.torque=(a[0]-xc)*(b[1]-a[1])-(a[1]-zc)*(b[0]-a[0]);e.row=[];if(e.a<N-1)e.row.push([e.a,1]);if(e.b<N-1)e.row.push([e.b,-1]);e.row.push([N-1,e.torque]);for(const [i,v]of e.row)for(const [j,w]of e.row)K[i][j]+=e.c*v*w;});
    // Diagonal equilibration changes neither constraints nor material energies;
    // it avoids mixing mm-scale torque rows with dimensionless incidence rows.
    const scale=K.map((r,i)=>{if(!(r[i]>0))throw Error('Disconnected projected section.');return 1/Math.sqrt(r[i]);});
    const scaledK=K.map((r,i)=>Float64Array.from(r,(v,j)=>v*scale[i]*scale[j]));
    const flow=b=>{const scaledB=Float64Array.from(b,(v,i)=>v*scale[i]),s=linearSolve(scaledK,scaledB),u=Float64Array.from(s,(v,i)=>v*scale[i]);return edges.map(e=>e.c*e.row.reduce((v,[j,w])=>v+w*u[j],0));};
    const bx=new Float64Array(N),bz=new Float64Array(N),bt=new Float64Array(N),sourceX=new Float64Array(N),sourceZ=new Float64Array(N);bt[N-1]=1;
    EAi.forEach((a,i)=>{const x=nodes[i][0]-xc,z=nodes[i][1]-zc;sourceX[i]=-a*(Dzz*x-Dxz*z)/detD;sourceZ[i]=-a*(Dxx*z-Dxz*x)/detD;if(i<N-1){bx[i]=sourceX[i];bz[i]=sourceZ[i];}});
    const qX0=flow(bx),qZ0=flow(bz),qT=flow(bt),dot=(a,b)=>edges.reduce((s,e,i)=>s+a[i]*b[i]/e.c,0),fTT=dot(qT,qT);
    if(!(fTT>0))throw Error('Projected section torsional compliance is not positive.');
    const torqueX=-dot(qX0,qT)/fTT,torqueZ=-dot(qZ0,qT)/fTT,qV2=qX0.map((v,i)=>v+torqueX*qT[i]),qV3=qZ0.map((v,i)=>v+torqueZ*qT[i]);
    const resultants=q=>edges.reduce((s,e,i)=>{const a=nodes[e.a],b=nodes[e.b];s[0]+=q[i]*(b[0]-a[0]);s[1]+=q[i]*(b[1]-a[1]);s[2]+=q[i]*e.torque;return s;},[0,0,0]);
    const residual=(q,source,T)=>{const r=new Float64Array(N);let torque=0;edges.forEach((e,i)=>{r[e.a]+=q[i];r[e.b]-=q[i];torque+=e.torque*q[i];});return Math.max(Math.abs(torque-T),...r.map((v,i)=>Math.abs(v-(source?source[i]:0))));};
    const shearCompliance=[[dot(qV2,qV2),dot(qV2,qV3)],[dot(qV2,qV3),dot(qV3,qV3)]];
    const unitV2=resultants(qV2),unitV3=resultants(qV3),unitT=resultants(qT),residualV2=residual(qV2,sourceX,torqueX),residualV3=residual(qV3,sourceZ,torqueZ),residualT=residual(qT,null,1);
    return {nodes,edges,EA,EAi,xc,zc,referenceX:xc,referenceZ:zc,xsc:xc+torqueZ,zsc:zc-torqueX,GJ:1/fTT,
      qV2,qV3,qVx:qV2,qVz:qV3,qV:qV3,qT,unitV2,unitV3,unitVx:unitV2,unitVz:unitV3,unitV:unitV3,unitT,
      residualV2,residualV3,residualV:residualV3,residualT,energyV2T:dot(qV2,qT),energyV3T:dot(qV3,qT),energyVT:dot(qV3,qT),shearCompliance,
      nodalD:[[Dxx,Dxz],[Dxz,Dzz]],Dnormal:[[exactXX,exactXZ],[exactXZ,exactZZ]],EIxx:exactZZ,EIzz:exactXX,EIxz:exactXZ,
      projection:A.map(r=>r.slice()),areaFactor,sourceX,sourceZ,
      method:'affine-projected bonded thin-wall network; two transverse shears; cap-local Saint-Venant torsion neglected'};
  }
  return {MAT,specs,widths,parts,polygon,network,projectedNetwork,field,G};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingSpars;

/* Rendering-only helpers: accept ordinary/typed arrays without changing solver data. */
const WingChartMath=(()=>{
 'use strict';let serial=0;
 function range(values,includeZero=false){let min=includeZero?0:Infinity,max=includeZero?0:-Infinity;for(const v of values||[])if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}return Number.isFinite(min)&&Number.isFinite(max)?[min,max]:[0,1];}
 function ticks(min,max,count=4){
  if(!Number.isFinite(min)||!Number.isFinite(max))return [0,1];if(min>max)[min,max]=[max,min];
  if(min===0&&max===0)return [-1,0,1];
  const scale=Math.max(Math.abs(min),Math.abs(max)),a=min/scale,b=max/scale,n=Math.max(1,Math.min(20,count));
  const low=a===b?a-.1:a,high=a===b?b+.1:b,span=high-low,realMag=10**Math.floor(Math.log10(scale)+Math.log10(span/n))||Number.MIN_VALUE,mag=realMag/scale;
  const step=[1,2,2.5,5,10].map(v=>v*mag).find(v=>span/v<=n+.5)||10*mag;
  const first=Math.floor(low/step),last=Math.ceil(high/step),out=[];
  for(let i=first;i<=last&&out.length<100;i++){const v=i===0?0:i*step*scale;if(Number.isFinite(v)&&(!out.length||v>out.at(-1)))out.push(v);}
  if(!out.length)return min===max?[0,min]:[min,max];
  if(out[0]>min)out.unshift(min);if(out.at(-1)<max)out.push(max);
  if(out.length===1){if(out[0]>0)out.unshift(0);else out.push(0);}return out;
 }
 function fraction(v,lo,hi){const scale=Math.max(Math.abs(lo),Math.abs(hi))||1,span=hi/scale-lo/scale;return span?(v/scale-lo/scale)/span:.5;}
 function format(v,digits=3){if(!Number.isFinite(v))return 'unresolved';if(v===0)return '0';return Math.abs(v)>=1e5||Math.abs(v)<1e-3?v.toExponential(digits-1).replace('e+','e'):String(+v.toPrecision(digits));}
 function segments(xs,ys){const out=[];let run=[];for(let i=0;i<(xs?.length||0);i++){if(Number.isFinite(xs[i])&&Number.isFinite(ys?.[i]))run.push([xs[i],ys[i]]);else if(run.length){out.push(run);run=[];}}if(run.length)out.push(run);return out;}
 function path(runs,X,Y){return runs.map(run=>run.map(([x,y],i)=>(i?'L':'M')+X(x).toFixed(2)+','+Y(y).toFixed(2)).join('')).join('');}
 function at(xs,ys,x){let previous=null;for(let i=0;i<(xs?.length||0);i++){const a=xs[i],b=ys?.[i];if(!Number.isFinite(a)||!Number.isFinite(b)){previous=null;continue;}if(a===x)return b;if(previous&&previous[0]<x&&a>x){const f=fraction(x,previous[0],a);return (1-f)*previous[1]+f*b;}previous=[a,b];}return NaN;}
 return {range,ticks,fraction,format,segments,path,at,clipId:()=>`wing-chart-clip-${++serial}`};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingChartMath;

/* Wing airfoil geometry, v1. Coordinates are x/c,z/c; no aerodynamic polars.
 * Sources: NACA TR 537; PDAS naca456mean3.html / naca456thick4.html;
 * UIUC Airfoil Data Site ads.html (Selig and Lednicer conventions).
 * Coordinate imports describe one simple, single-element section. They do not
 * certify stall, aerodynamic performance, manufacturability or structural safety.
 */
const WingAirfoils = (() => {
  'use strict';
  const VERSION = 1, SAMPLE_COUNT = 161, MAX_POINTS = 2048;
  const normalized = new WeakSet();
  const cosine = n => Array.from({length:n},(_,i)=>.5*(1-Math.cos(Math.PI*i/(n-1))));
  const finite = (v,label) => {if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`${label} must be finite.`);return v;};
  const text = (v,fallback,max=160) => {const s=v==null?fallback:String(v);if(s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw new Error('Airfoil metadata is too long or contains control characters.');return s;};
  function interp(x,p) {
    if(x<=p[0][0])return p[0][1];if(x>=p[p.length-1][0])return p[p.length-1][1];
    let lo=0,hi=p.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(p[m][0]<=x)lo=m;else hi=m;}
    const f=(x-p[lo][0])/(p[hi][0]-p[lo][0]);return p[lo][1]+f*(p[hi][1]-p[lo][1]);
  }
  function series(spec) {
    const raw=typeof spec==='string'?spec:spec.code;
    const m=String(raw||'').trim().match(/^(?:NACA\s*)?(\d{4}|\d{5})$/i);
    if(!m)throw new Error('Use a four-digit NACA code, or a supported non-reflex five-digit code (e.g. 23012). Other families can be loaded as DAT coordinates.');
    const code=m[1],kind=code.length===4?'naca4':'naca5';
    if(typeof spec==='object'&&spec.kind!==kind)throw new Error('Airfoil family and NACA code do not agree.');
    if(+code.slice(-2)===0)throw new Error('Airfoil thickness must be positive.');
    if(kind==='naca4'&&+code[0]&&+code[1]===0)throw new Error('A cambered NACA section needs a nonzero camber position.');
    if(kind==='naca5'&&!/^[1-9][1-5]0\d{2}$/.test(code))throw new Error('Analytic five-digit support is the non-reflex 210–250 mean-line family. Load reflex or modified sections as DAT coordinates.');
    return Object.freeze({kind,code});
  }
  function branch(points,label,{unit=true}={}) {
    if(!Array.isArray(points)||points.length<3||points.length>MAX_POINTS)throw new Error(`${label} needs 3–${MAX_POINTS} coordinate pairs.`);
    const out=[];
    for(const q of points){if(!Array.isArray(q)||q.length!==2)throw new Error(`${label} needs [x/c,z/c] pairs.`);const p=[finite(q[0],label+' x'),finite(q[1],label+' z')];
      const prev=out[out.length-1];if(prev&&Math.abs(prev[0]-p[0])<1e-12&&Math.abs(prev[1]-p[1])<1e-12)continue;
      if(prev&&p[0]<=prev[0])throw new Error(`${label} must progress monotonically from leading to trailing edge; folded or multi-element sections are not supported.`);
      if(unit&&(p[0]<-1e-8||p[0]>1+1e-8||Math.abs(p[1])>1))throw new Error(`${label} is not a normalized single airfoil.`);out.push(p);
    }
    if(out.length<3)throw new Error(`${label} has too few distinct points.`);
    if(unit&&(Math.abs(out[0][0])>1e-8||Math.abs(out[out.length-1][0]-1)>1e-8))throw new Error(`${label} must cover x/c=0 through 1.`);
    return out;
  }
  function validatePair(upper,lower) {
    if(Math.abs(upper[0][1]-lower[0][1])>1e-7)throw new Error('The upper and lower surfaces must share a closed leading edge.');
    const xs=[...new Set([...upper.map(p=>p[0]),...lower.map(p=>p[0])])].sort((a,b)=>a-b);let thick=0;
    for(const x of xs){const gap=interp(x,upper)-interp(x,lower);if(gap< -1e-9)throw new Error('Airfoil surfaces intersect or upper/lower ordering is invalid.');if(x>1e-8&&x<1-1e-8&&gap<=0)throw new Error('Airfoil has an interior zero-thickness pinch.');thick=Math.max(thick,gap);}
    if(thick<1e-4||thick>.8)throw new Error('The airfoil thickness is degenerate or outside the supported single-section range (0.01%–80% chord).');
  }
  function normalizeProfile(spec) {
    if(spec&&typeof spec==='object'&&normalized.has(spec))return spec;
    if(typeof spec==='string'||spec?.kind==='naca4'||spec?.kind==='naca5'){const p=series(spec);normalized.add(p);return p;}
    if(!spec||typeof spec!=='object'||Array.isArray(spec)||spec.kind!=='coordinates')throw new Error('Unknown airfoil profile. Use naca4, naca5, or normalized coordinates.');
    if(spec.version!=null&&spec.version!==VERSION)throw new Error('Unsupported airfoil coordinate version.');
    const upper=branch(spec.upper,'Upper surface'),lower=branch(spec.lower,'Lower surface');validatePair(upper,lower);
    const source=spec.source||{};if(typeof source!=='object'||Array.isArray(source))throw new Error('Airfoil source metadata must be an object.');
    const p={kind:'coordinates',version:VERSION,name:text(spec.name,'Imported airfoil'),upper:upper.map(Object.freeze),lower:lower.map(Object.freeze),source:{format:text(source.format,'coordinates',32),filename:text(source.filename,'',180),normalization:'unit-chord'}};
    if(source.url!=null){const url=text(source.url,'',1024);if(!/^https?:\/\//i.test(url))throw new Error('Airfoil provenance URL must use http or https.');p.source.url=url;}
    if(source.family!=null)p.source.family=text(source.family,'',80);
    Object.freeze(p.upper);Object.freeze(p.lower);Object.freeze(p.source);Object.freeze(p);normalized.add(p);return p;
  }
  function camber(spec,x) {
    const p=normalizeProfile(spec);finite(x,'Chord fraction');if(x<0||x>1)throw new Error('Chord fraction must be between 0 and 1.');
    if(p.kind==='blend'){const a=camber(p.a,x),b=camber(p.b,x);return {yc:(1-p.f)*a.yc+p.f*b.yc,slope:(1-p.f)*a.slope+p.f*b.slope};}
    if(p.kind==='coordinates'){
      const h=1e-5,a=Math.max(0,x-h),b=Math.min(1,x+h),mean=v=>(interp(v,p.upper)+interp(v,p.lower))/2;
      return {yc:mean(x),slope:(mean(b)-mean(a))/(b-a)};
    }
    if(p.kind==='naca4'){
      const m=+p.code[0]/100,pos=+p.code[1]/10;if(m===0)return {yc:0,slope:0};
      if(x<pos)return {yc:m/(pos*pos)*(2*pos*x-x*x),slope:2*m/(pos*pos)*(pos-x)};
      const q=(1-pos)*(1-pos);return {yc:m/q*(1-2*pos+2*pos*x-x*x),slope:2*m/q*(pos-x)};
    }
    const i=+p.code[1]-1,r=[.058,.126,.2025,.29,.391][i],k=[361.4,51.64,15.957,6.643,3.23][i]*(+p.code[0]/2);
    return x<r?{yc:k/6*(x**3-3*r*x*x+r*r*(3-r)*x),slope:k/6*(3*x*x-6*r*x+r*r*(3-r))}:{yc:k*r**3/6*(1-x),slope:-k*r**3/6};
  }
  function halfThickness(p,x,chord,te) {
    const t=+p.code.slice(-2)/100,natural=5*t*(.2969-.126-.3516+.2843-.1015);
    const yt=5*t*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1015*x**4);
    return te==null?yt:yt+(te/(2*chord)-natural)*x**4;
  }
  function dimensions(chord,te,count) {
    finite(chord,'Chord');if(chord<=0)throw new Error('Chord must be positive.');if(te!=null&&(finite(te,'Trailing-edge thickness')<0))throw new Error('Trailing-edge thickness cannot be negative.');
    if(!Number.isInteger(count)||count<3||count>MAX_POINTS)throw new Error('Use 3–2048 airfoil samples.');
  }
  function surfaces(spec,chord=1,te=null,count=241) {
    const p=normalizeProfile(spec);dimensions(chord,te,count);const xs=cosine(count),xu=[],zu=[],xl=[],zl=[];
    if(p.kind==='blend'){const a=surfaces(p.a,chord,te,count),b=surfaces(p.b,chord,te,count);return Object.fromEntries(['xu','zu','xl','zl'].map(key=>[key,a[key].map((v,i)=>(1-p.f)*v+p.f*b[key][i])]));}
    if(p.kind==='coordinates'){
      const natural=p.upper[p.upper.length-1][1]-p.lower[p.lower.length-1][1],d=te==null?0:(te/chord-natural)/2;
      for(const x of xs){xu.push(x*chord);xl.push(x*chord);zu.push((interp(x,p.upper)+d*x**4)*chord);zl.push((interp(x,p.lower)-d*x**4)*chord);}
    } else for(const x of xs){const {yc,slope}=camber(p,x),th=Math.atan(slope),yt=halfThickness(p,x,chord,te);xu.push((x-yt*Math.sin(th))*chord);zu.push((yc+yt*Math.cos(th))*chord);xl.push((x+yt*Math.sin(th))*chord);zl.push((yc-yt*Math.cos(th))*chord);}
    return {xu,zu,xl,zl};
  }
  function verticalOrdinates(spec,x,chord=1,te=null) {
    const p=normalizeProfile(spec);dimensions(chord,te,3);const {yc,slope}=camber(p,x);
    if(p.kind==='blend'){const a=verticalOrdinates(p.a,x,chord,te),b=verticalOrdinates(p.b,x,chord,te);return Object.fromEntries(['upper','lower','camber'].map(key=>[key,(1-p.f)*a[key]+p.f*b[key]]));}
    if(p.kind==='coordinates'){
      const natural=p.upper[p.upper.length-1][1]-p.lower[p.lower.length-1][1],d=te==null?0:(te/chord-natural)/2;
      return {upper:(interp(x,p.upper)+d*x**4)*chord,lower:(interp(x,p.lower)-d*x**4)*chord,camber:yc*chord};
    }
    const vh=halfThickness(p,x,chord,te)*Math.cos(Math.atan(slope));return {lower:(yc-vh)*chord,camber:yc*chord,upper:(yc+vh)*chord};
  }
  // Import rotates the chord from the foremost point to the midpoint of the
  // two trailing-edge endpoints onto x, then translates/scales to unit chord.
  // Monotone input is preserved; never sort points to conceal a folded contour.
  function canonicalize(a,b,meta) {
    if(a.length<3||b.length<3)throw new Error('Each DAT surface needs at least three points.');
    const all=[...a,...b],minX=Math.min(...all.map(p=>p[0]));
    const le=all.filter(p=>Math.abs(p[0]-minX)<1e-10).reduce((r,p,_,v)=>[r[0]+p[0]/v.length,r[1]+p[1]/v.length],[0,0]);
    const ends=[a[a.length-1],b[b.length-1]],te=[(ends[0][0]+ends[1][0])/2,(ends[0][1]+ends[1][1])/2];
    const dx=te[0]-le[0],dz=te[1]-le[1],length2=dx*dx+dz*dz;if(!(length2>1e-16))throw new Error('Cannot determine a nonzero DAT chord.');
    const transform=p=>[((p[0]-le[0])*dx+(p[1]-le[1])*dz)/length2,(-(p[0]-le[0])*dz+(p[1]-le[1])*dx)/length2];
    let aa=a.map(transform),bb=b.map(transform);
    // Finite-thickness TE endpoints can have unequal chordwise positions;
    // project only these endpoints onto x/c=1, retaining their z coordinates.
    for(const arr of [aa,bb]){if(Math.abs(arr[0][0])>.005||Math.abs(arr[arr.length-1][0]-1)>.01)throw new Error('DAT surfaces do not share a leading edge and trailing-edge chord.');arr[0]=[0,arr[0][1]];arr[arr.length-1]=[1,arr[arr.length-1][1]];}
    if(Math.abs(aa[0][1]-bb[0][1])>1e-5)throw new Error('DAT leading edge is open.');aa[0]=bb[0]=[0,0];
    aa=branch(aa,'DAT first surface');bb=branch(bb,'DAT second surface');
    if(interp(.4,aa)<interp(.4,bb))[aa,bb]=[bb,aa];validatePair(aa,bb);
    const xs=cosine(SAMPLE_COUNT),upper=xs.map(x=>[x,interp(x,aa)]),lower=xs.map(x=>[x,interp(x,bb)]);
    return normalizeProfile({kind:'coordinates',version:VERSION,name:meta.name,upper,lower,source:meta.source});
  }
  function parseDat(input,options={}) {
    if(typeof input!=='string'||input.length>262144)throw new Error('Choose a plain-text DAT file smaller than 256 KiB.');
    const rows=[];let name='',first=true;
    for(const [i,line] of input.replace(/^\uFEFF/,'').replace(/\x1a\s*$/,'').split(/\r?\n/).entries()){
      const s=line.replace(/#.*$/,'').trim();if(!s)continue;
      const tokens=s.split(/[\s,]+/),pair=tokens.length===2&&tokens.every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(v));
      if(!pair){if(first){name=text(s,'Imported airfoil');first=false;continue;}throw new Error(`DAT line ${i+1}: expected exactly two finite coordinates.`);}
      first=false;const p=tokens.map(v=>Number(v.replace(/[dD]/,'e')));p.forEach(v=>finite(v,'DAT coordinate'));rows.push(p);
    }
    if(rows.length<5||rows.length>MAX_POINTS*2+1)throw new Error('DAT needs at least five coordinates (three per surface, with a shared leading edge) and no more than 4096 points.');
    let a,b,format;const n=rows[0];
    if(n.every(v=>Number.isInteger(v)&&v>=3)&&n[0]+n[1]===rows.length-1){format='lednicer';a=rows.slice(1,n[0]+1);b=rows.slice(n[0]+1);}
    else {
      if(n.some(v=>v>2)&&n.every(v=>Number.isInteger(v)&&v>=3))throw new Error('Lednicer surface counts do not match the coordinate rows.');
      format='selig';const min=Math.min(...rows.map(p=>p[0])),k=rows.findIndex(p=>p[0]===min),max=Math.max(...rows.map(p=>p[0]));
      if(k<2||k>rows.length-3||rows[0][0]<min+.9*(max-min)||rows[rows.length-1][0]<min+.9*(max-min))throw new Error('Selig DAT must start at one trailing edge, wrap once around the leading edge, and end at the other trailing edge.');
      a=rows.slice(0,k+1).reverse();b=rows.slice(k);
    }
    const source={format,filename:options.filename||'',normalization:'unit-chord'};if(options.sourceUrl)source.url=options.sourceUrl;if(options.family)source.family=options.family;
    return canonicalize(a,b,{name:name||options.name||'Imported airfoil',source});
  }
  function blendProfiles(a,b,f,count=SAMPLE_COUNT) {
    finite(f,'Airfoil interpolation fraction');if(f<0||f>1)throw new Error('Airfoil interpolation fraction must lie between 0 and 1.');a=normalizeProfile(a);b=normalizeProfile(b);
    if(f===0)return a;if(f===1)return b;if(a===b||JSON.stringify(a)===JSON.stringify(b))return a;
    dimensions(1,null,count);
    // Runtime-only blend, never an external JSON profile. Interpolate actual
    // aligned surface points, not vertical ordinates converted into a new
    // profile: that conversion would jump at analytic NACA station endpoints.
    // Endpoints remain their exact specified profiles and share cosine sample
    // parameters. Their positive thickness vectors blend continuously.
    const p=Object.freeze({kind:'blend',a,b,f});normalized.add(p);return p;
  }
  function profileAt(stations,eta) {
    if(!Array.isArray(stations)||stations.length<2)throw new Error('Airfoil stations need root and tip.');finite(eta,'Span fraction');
    if(eta<=stations[0].eta)return normalizeProfile(stations[0].airfoil);if(eta>=stations[stations.length-1].eta)return normalizeProfile(stations[stations.length-1].airfoil);
    for(let i=1;i<stations.length;i++)if(eta<=stations[i].eta){const a=stations[i-1],b=stations[i];if(!(b.eta>a.eta))throw new Error('Airfoil station positions must increase.');return blendProfiles(a.airfoil,b.airfoil,(eta-a.eta)/(b.eta-a.eta));}
    throw new Error('Cannot locate airfoil station.');
  }
  const SOURCES=Object.freeze({dat:'https://m-selig.ae.illinois.edu/ads.html',database:'https://m-selig.ae.illinois.edu/ads/coord_database.html',naca5:'https://www.pdas.com/naca456mean3.html',nacaThickness:'https://www.pdas.com/naca456thick4.html',nacaReport:'https://ntrs.nasa.gov/citations/19930091610'});
  // CURATED_DATA is inserted below from the cited UIUC coordinate files.
  const CURATED_DATA = {"ag24":"AG24 Bubble Dancer DLG by Mark Drela | The AG2x airfoils are intended to be used on composite versions of the Bubble Dancer and the Allegro-Lite.\r\n     1.000000    0.000312\r\n     0.994048    0.001043\r\n     0.982038    0.002630\r\n     0.968488    0.004486\r\n     0.954647    0.006421\r\n     0.940769    0.008378\r\n     0.926890    0.010328\r\n     0.913006    0.012258\r\n     0.899118    0.014165\r\n     0.885230    0.016048\r\n     0.871339    0.017908\r\n     0.857451    0.019744\r\n     0.843559    0.021562\r\n     0.829670    0.023357\r\n     0.815779    0.025130\r\n     0.801883    0.026879\r\n     0.787989    0.028602\r\n     0.774091    0.030297\r\n     0.760188    0.031964\r\n     0.746285    0.033600\r\n     0.732376    0.035204\r\n     0.718461    0.036776\r\n     0.704547    0.038313\r\n     0.690631    0.039813\r\n     0.676709    0.041277\r\n     0.662788    0.042702\r\n     0.648868    0.044087\r\n     0.634943    0.045432\r\n     0.621017    0.046736\r\n     0.607093    0.047997\r\n     0.593166    0.049214\r\n     0.579236    0.050389\r\n     0.565310    0.051517\r\n     0.551385    0.052600\r\n     0.537456    0.053635\r\n     0.523528    0.054622\r\n     0.509606    0.055558\r\n     0.495682    0.056443\r\n     0.481756    0.057276\r\n     0.467835    0.058053\r\n     0.453918    0.058774\r\n     0.440000    0.059437\r\n     0.426087    0.060040\r\n     0.412180    0.060579\r\n     0.398274    0.061053\r\n     0.384372    0.061458\r\n     0.370481    0.061792\r\n     0.356594    0.062050\r\n     0.342711    0.062231\r\n     0.328841    0.062328\r\n     0.314984    0.062338\r\n     0.301131    0.062254\r\n     0.287296    0.062074\r\n     0.273479    0.061789\r\n     0.259672    0.061394\r\n     0.245889    0.060883\r\n     0.232132    0.060248\r\n     0.218395    0.059480\r\n     0.204696    0.058572\r\n     0.191034    0.057514\r\n     0.177412    0.056295\r\n     0.163854    0.054904\r\n     0.150354    0.053325\r\n     0.136934    0.051545\r\n     0.123613    0.049542\r\n     0.110400    0.047296\r\n     0.097342    0.044784\r\n     0.084457    0.041971\r\n     0.071816    0.038832\r\n     0.059466    0.035323\r\n     0.047533    0.031413\r\n     0.036200    0.027083\r\n     0.025838    0.022393\r\n     0.017129    0.017634\r\n     0.010712    0.013341\r\n     0.006482    0.009857\r\n     0.003763    0.007107\r\n     0.001997    0.004865\r\n     0.000855    0.002963\r\n     0.000198    0.001287\r\n     0.000001   -0.000230\r\n     0.000293   -0.001719\r\n     0.001184   -0.003235\r\n     0.002714   -0.004738\r\n     0.004994   -0.006301\r\n     0.008364   -0.008034\r\n     0.013488   -0.010053\r\n     0.021193   -0.012377\r\n     0.031412   -0.014726\r\n     0.043212   -0.016796\r\n     0.055804   -0.018519\r\n     0.068780   -0.019918\r\n     0.081987   -0.021042\r\n     0.095351   -0.021938\r\n     0.108824   -0.022639\r\n     0.122377   -0.023175\r\n     0.135989   -0.023565\r\n     0.149652   -0.023827\r\n     0.163351   -0.023977\r\n     0.177085   -0.024026\r\n     0.190844   -0.023986\r\n     0.204622   -0.023867\r\n     0.218421   -0.023675\r\n     0.232237   -0.023420\r\n     0.246064   -0.023106\r\n     0.259909   -0.022740\r\n     0.273764   -0.022326\r\n     0.287631   -0.021871\r\n     0.301514   -0.021381\r\n     0.315408   -0.020856\r\n     0.329313   -0.020301\r\n     0.343234   -0.019718\r\n     0.357166   -0.019111\r\n     0.371111   -0.018482\r\n     0.385067   -0.017835\r\n     0.399034   -0.017173\r\n     0.413004   -0.016498\r\n     0.426962   -0.015813\r\n     0.440907   -0.015121\r\n     0.454842   -0.014424\r\n     0.468769   -0.013723\r\n     0.482685   -0.013021\r\n     0.496593   -0.012319\r\n     0.510494   -0.011617\r\n     0.524394   -0.010919\r\n     0.538286   -0.010224\r\n     0.552174   -0.009535\r\n     0.566059   -0.008852\r\n     0.579942   -0.008177\r\n     0.593817   -0.007511\r\n     0.607689   -0.006857\r\n     0.621556   -0.006214\r\n     0.635419   -0.005585\r\n     0.649276   -0.004971\r\n     0.663131   -0.004372\r\n     0.676986   -0.003788\r\n     0.690839   -0.003221\r\n     0.704693   -0.002670\r\n     0.718548   -0.002136\r\n     0.732407   -0.001619\r\n     0.746265   -0.001122\r\n     0.760127   -0.000645\r\n     0.773993   -0.000194\r\n     0.787859    0.000230\r\n     0.801731    0.000622\r\n     0.815611    0.000975\r\n     0.829491    0.001286\r\n     0.843374    0.001550\r\n     0.857263    0.001759\r\n     0.871153    0.001909\r\n     0.885046    0.001991\r\n     0.898943    0.001997\r\n     0.912839    0.001920\r\n     0.926737    0.001758\r\n     0.940634    0.001501\r\n     0.954532    0.001149\r\n     0.968401    0.000707\r\n     0.982019    0.000185\r\n     0.994039   -0.000364\r\n     1.000000   -0.000659\r\n","e205":"E205  (10.48%)               \r\n   1.00000  0.00000\r\n   0.99655  0.00039\r\n   0.98649  0.00174\r\n   0.97049  0.00427\r\n   0.94916  0.00778\r\n   0.92285  0.01196\r\n   0.89175  0.01668\r\n   0.85624  0.02199\r\n   0.81684  0.02786\r\n   0.77412  0.03419\r\n   0.72866  0.04088\r\n   0.68108  0.04777\r\n   0.63204  0.05470\r\n   0.58218  0.06147\r\n   0.53217  0.06782\r\n   0.48265  0.07342\r\n   0.43410  0.07785\r\n   0.38680  0.08081\r\n   0.34101  0.08214\r\n   0.29699  0.08177\r\n   0.25496  0.07970\r\n   0.21508  0.07606\r\n   0.17764  0.07111\r\n   0.14302  0.06507\r\n   0.11157  0.05811\r\n   0.08360  0.05040\r\n   0.05937  0.04211\r\n   0.03909  0.03344\r\n   0.02292  0.02461\r\n   0.01097  0.01589\r\n   0.00331  0.00766\r\n   0.00002  0.00055\r\n   0.00233 -0.00506\r\n   0.01065 -0.00988\r\n   0.02419 -0.01420\r\n   0.04291 -0.01776\r\n   0.06669 -0.02053\r\n   0.09534 -0.02252\r\n   0.12864 -0.02378\r\n   0.16627 -0.02436\r\n   0.20783 -0.02435\r\n   0.25290 -0.02384\r\n   0.30097 -0.02292\r\n   0.35149 -0.02168\r\n   0.40388 -0.02021\r\n   0.45751 -0.01859\r\n   0.51174 -0.01689\r\n   0.56591 -0.01516\r\n   0.61938 -0.01345\r\n   0.67149 -0.01180\r\n   0.72160 -0.01023\r\n   0.76911 -0.00876\r\n   0.81343 -0.00740\r\n   0.85400 -0.00614\r\n   0.89034 -0.00497\r\n   0.92195 -0.00380\r\n   0.94860 -0.00252\r\n   0.97017 -0.00125\r\n   0.98635 -0.00036\r\n   0.99651 -0.00003\r\n   1.00000  0.00000\r\n","naca632615":"NACA 63(2)-615\r\n1.00000     0.00000\r\n0.95042     0.01245\r\n0.90089     0.02398\r\n0.85127     0.03555\r\n0.80153     0.04693\r\n0.75163     0.05800\r\n0.70159     0.06847\r\n0.65139     0.07809\r\n0.60105     0.08665\r\n0.55058     0.09393\r\n0.50000     0.09974\r\n0.44932     0.10384\r\n0.39857     0.10598\r\n0.34778     0.10587\r\n0.29700     0.10331\r\n0.24625     0.09830\r\n0.19558     0.09066\r\n0.14504     0.08010\r\n0.09473     0.06578\r\n0.06973     0.05667\r\n0.04492     0.04560\r\n0.02050     0.03129\r\n0.00866     0.02159\r\n0.00418     0.01634\r\n0.00205     0.01317\r\n0.00000     0.00000\r\n0.00795     -0.01017\r\n0.01082     -0.01214\r\n0.01634     -0.01517\r\n0.02950     -0.02013\r\n0.05508     -0.02664\r\n0.08027     -0.03123\r\n0.10527     -0.03476\r\n0.15496     -0.03972\r\n0.20442     -0.04290\r\n0.25375     -0.04460\r\n0.30300     -0.04499\r\n0.35222     -0.04407\r\n0.40143     -0.04172\r\n0.45068     -0.03814\r\n0.50000     -0.03356\r\n0.54942     -0.02823\r\n0.59895     -0.02239\r\n0.64861     -0.01629\r\n0.69841     -0.01015\r\n0.74837     -0.00430\r\n0.79847     0.00083\r\n0.84873     0.00483\r\n0.89911     0.00704\r\n0.94958     0.00651\r\n1.00000     0.00000\r\n","s1223":"  S1223\r\n  1.00000     0.00000\r\n  0.99838     0.00126\r\n  0.99417     0.00494\r\n  0.98825     0.01037\r\n  0.98075     0.01646\r\n  0.97111     0.02250\r\n  0.95884     0.02853\r\n  0.94389     0.03476\r\n  0.92639     0.04116\r\n  0.90641     0.04768\r\n  0.88406     0.05427\r\n  0.85947     0.06089\r\n  0.83277     0.06749\r\n  0.80412     0.07402\r\n  0.77369     0.08044\r\n  0.74166     0.08671\r\n  0.70823     0.09277\r\n  0.67360     0.09859\r\n  0.63798     0.10412\r\n  0.60158     0.10935\r\n  0.56465     0.11425\r\n  0.52744     0.11881\r\n  0.49025     0.12303\r\n  0.45340     0.12683\r\n  0.41721     0.13011\r\n  0.38193     0.13271\r\n  0.34777     0.13447\r\n  0.31488     0.13526\r\n  0.28347     0.13505\r\n  0.25370     0.13346\r\n  0.22541     0.13037\r\n  0.19846     0.12594\r\n  0.17286     0.12026\r\n  0.14863     0.11355\r\n  0.12591     0.10598\r\n  0.10482     0.09770\r\n  0.08545     0.08879\r\n  0.06789     0.07940\r\n  0.05223     0.06965\r\n  0.03855     0.05968\r\n  0.02694     0.04966\r\n  0.01755     0.03961\r\n  0.01028     0.02954\r\n  0.00495     0.01969\r\n  0.00155     0.01033\r\n  0.00005     0.00178\r\n  0.00044    -0.00561\r\n  0.00264    -0.01120\r\n  0.00789    -0.01427\r\n  0.01718    -0.01550\r\n  0.03006    -0.01584\r\n  0.04627    -0.01532\r\n  0.06561    -0.01404\r\n  0.08787    -0.01202\r\n  0.11282    -0.00925\r\n  0.14020    -0.00563\r\n  0.17006    -0.00075\r\n  0.20278     0.00535\r\n  0.23840     0.01213\r\n  0.27673     0.01928\r\n  0.31750     0.02652\r\n  0.36044     0.03358\r\n  0.40519     0.04021\r\n  0.45139     0.04618\r\n  0.49860     0.05129\r\n  0.54639     0.05534\r\n  0.59428     0.05820\r\n  0.64176     0.05976\r\n  0.68832     0.05994\r\n  0.73344     0.05872\r\n  0.77660     0.05612\r\n  0.81729     0.05219\r\n  0.85500     0.04706\r\n  0.88928     0.04088\r\n  0.91966     0.03387\r\n  0.94573     0.02624\r\n  0.96693     0.01822\r\n  0.98255     0.01060\r\n  0.99268     0.00468\r\n  0.99825     0.00115\r\n  1.00000     0.00000\r\n","sc20412":"NASA SC(2)-0412 AIRFOIL\r\n      103.      103.\r\n\r\n 0.000000  0.000000\r\n 0.002000  0.009200\r\n 0.005000  0.014100\r\n 0.010000  0.019000\r\n 0.020000  0.025300\r\n 0.030000  0.029700\r\n 0.040000  0.033000\r\n 0.050000  0.035700\r\n 0.060000  0.038000\r\n 0.070000  0.040000\r\n 0.080000  0.041800\r\n 0.090000  0.043400\r\n 0.100000  0.044800\r\n 0.110000  0.046100\r\n 0.120000  0.047300\r\n 0.130000  0.048400\r\n 0.140000  0.049400\r\n 0.150000  0.050400\r\n 0.160000  0.051300\r\n 0.170000  0.052200\r\n 0.180000  0.053000\r\n 0.190000  0.053700\r\n 0.200000  0.054400\r\n 0.210000  0.055000\r\n 0.220000  0.055600\r\n 0.230000  0.056200\r\n 0.240000  0.056700\r\n 0.250000  0.057100\r\n 0.260000  0.057500\r\n 0.270000  0.057900\r\n 0.280000  0.058300\r\n 0.290000  0.058600\r\n 0.300000  0.058900\r\n 0.310000  0.059100\r\n 0.320000  0.059300\r\n 0.330000  0.059500\r\n 0.340000  0.059700\r\n 0.350000  0.059800\r\n 0.360000  0.059900\r\n 0.370000  0.060000\r\n 0.380000  0.060100\r\n 0.390000  0.060100\r\n 0.400000  0.060100\r\n 0.410000  0.060100\r\n 0.420000  0.060100\r\n 0.430000  0.060000\r\n 0.440000  0.059900\r\n 0.450000  0.059800\r\n 0.460000  0.059700\r\n 0.470000  0.059500\r\n 0.480000  0.059300\r\n 0.490000  0.059100\r\n 0.500000  0.058800\r\n 0.510000  0.058500\r\n 0.520000  0.058200\r\n 0.530000  0.057800\r\n 0.540000  0.057400\r\n 0.550000  0.057000\r\n 0.560000  0.056500\r\n 0.570000  0.056000\r\n 0.580000  0.055500\r\n 0.590000  0.054900\r\n 0.600000  0.054300\r\n 0.610000  0.053600\r\n 0.620000  0.052900\r\n 0.630000  0.052200\r\n 0.640000  0.051400\r\n 0.650000  0.050600\r\n 0.660000  0.049700\r\n 0.670000  0.048800\r\n 0.680000  0.047900\r\n 0.690000  0.046900\r\n 0.700000  0.045900\r\n 0.710000  0.044900\r\n 0.720000  0.043900\r\n 0.730000  0.042800\r\n 0.740000  0.041700\r\n 0.750000  0.040600\r\n 0.760000  0.039400\r\n 0.770000  0.038200\r\n 0.780000  0.037000\r\n 0.790000  0.035800\r\n 0.800000  0.034500\r\n 0.810000  0.033200\r\n 0.820000  0.031900\r\n 0.830000  0.030600\r\n 0.840000  0.029200\r\n 0.850000  0.027800\r\n 0.860000  0.026400\r\n 0.870000  0.025000\r\n 0.880000  0.023500\r\n 0.890000  0.022000\r\n 0.900000  0.020500\r\n 0.910000  0.019000\r\n 0.920000  0.017400\r\n 0.930000  0.015800\r\n 0.940000  0.014200\r\n 0.950000  0.012500\r\n 0.960000  0.010800\r\n 0.970000  0.009000\r\n 0.980000  0.007200\r\n 0.990000  0.005300\r\n 1.000000  0.003300\r\n\r\n 0.000000  0.000000\r\n 0.002000 -0.009200\r\n 0.005000 -0.014100\r\n 0.010000 -0.019000\r\n 0.020000 -0.025300\r\n 0.030000 -0.029600\r\n 0.040000 -0.032900\r\n 0.050000 -0.035600\r\n 0.060000 -0.037900\r\n 0.070000 -0.040000\r\n 0.080000 -0.041800\r\n 0.090000 -0.043400\r\n 0.100000 -0.044900\r\n 0.110000 -0.046300\r\n 0.120000 -0.047600\r\n 0.130000 -0.048800\r\n 0.140000 -0.049900\r\n 0.150000 -0.050900\r\n 0.160000 -0.051800\r\n 0.170000 -0.052700\r\n 0.180000 -0.053500\r\n 0.190000 -0.054200\r\n 0.200000 -0.054900\r\n 0.210000 -0.055500\r\n 0.220000 -0.056100\r\n 0.230000 -0.056700\r\n 0.240000 -0.057200\r\n 0.250000 -0.057700\r\n 0.260000 -0.058100\r\n 0.270000 -0.058500\r\n 0.280000 -0.058800\r\n 0.290000 -0.059100\r\n 0.300000 -0.059300\r\n 0.310000 -0.059500\r\n 0.320000 -0.059700\r\n 0.330000 -0.059800\r\n 0.340000 -0.059900\r\n 0.350000 -0.060000\r\n 0.360000 -0.060000\r\n 0.370000 -0.060000\r\n 0.380000 -0.059900\r\n 0.390000 -0.059800\r\n 0.400000 -0.059600\r\n 0.410000 -0.059400\r\n 0.420000 -0.059200\r\n 0.430000 -0.058900\r\n 0.440000 -0.058600\r\n 0.450000 -0.058200\r\n 0.460000 -0.057800\r\n 0.470000 -0.057300\r\n 0.480000 -0.056800\r\n 0.490000 -0.056200\r\n 0.500000 -0.055500\r\n 0.510000 -0.054700\r\n 0.520000 -0.053900\r\n 0.530000 -0.053000\r\n 0.540000 -0.052000\r\n 0.550000 -0.050900\r\n 0.560000 -0.049800\r\n 0.570000 -0.048600\r\n 0.580000 -0.047300\r\n 0.590000 -0.045900\r\n 0.600000 -0.044400\r\n 0.610000 -0.042900\r\n 0.620000 -0.041300\r\n 0.630000 -0.039700\r\n 0.640000 -0.038000\r\n 0.650000 -0.036200\r\n 0.660000 -0.034400\r\n 0.670000 -0.032600\r\n 0.680000 -0.030700\r\n 0.690000 -0.028800\r\n 0.700000 -0.026900\r\n 0.710000 -0.025000\r\n 0.720000 -0.023100\r\n 0.730000 -0.021200\r\n 0.740000 -0.019300\r\n 0.750000 -0.017400\r\n 0.760000 -0.015500\r\n 0.770000 -0.013700\r\n 0.780000 -0.011900\r\n 0.790000 -0.010200\r\n 0.800000 -0.008500\r\n 0.810000 -0.006800\r\n 0.820000 -0.005200\r\n 0.830000 -0.003700\r\n 0.840000 -0.002300\r\n 0.850000 -0.000900\r\n 0.860000  0.000300\r\n 0.870000  0.001400\r\n 0.880000  0.002400\r\n 0.890000  0.003200\r\n 0.900000  0.003800\r\n 0.910000  0.004300\r\n 0.920000  0.004500\r\n 0.930000  0.004500\r\n 0.940000  0.004200\r\n 0.950000  0.003800\r\n 0.960000  0.003100\r\n 0.970000  0.002200\r\n 0.980000  0.001000\r\n 0.990000 -0.000500\r\n 1.000000 -0.002200\r\n","clarky":" CLARK Y AIRFOIL\r\n      61.0      61.0\r\n \r\n 0.0000000 0.0000000\r\n 0.0005000 0.0023390\r\n 0.0010000 0.0037271\r\n 0.0020000 0.0058025\r\n 0.0040000 0.0089238\r\n 0.0080000 0.0137350\r\n 0.0120000 0.0178581\r\n 0.0200000 0.0253735\r\n 0.0300000 0.0330215\r\n 0.0400000 0.0391283\r\n 0.0500000 0.0442753\r\n 0.0600000 0.0487571\r\n 0.0800000 0.0564308\r\n 0.1000000 0.0629981\r\n 0.1200000 0.0686204\r\n 0.1400000 0.0734360\r\n 0.1600000 0.0775707\r\n 0.1800000 0.0810687\r\n 0.2000000 0.0839202\r\n 0.2200000 0.0861433\r\n 0.2400000 0.0878308\r\n 0.2600000 0.0890840\r\n 0.2800000 0.0900016\r\n 0.3000000 0.0906804\r\n 0.3200000 0.0911857\r\n 0.3400000 0.0915079\r\n 0.3600000 0.0916266\r\n 0.3800000 0.0915212\r\n 0.4000000 0.0911712\r\n 0.4200000 0.0905657\r\n 0.4400000 0.0897175\r\n 0.4600000 0.0886427\r\n 0.4800000 0.0873572\r\n 0.5000000 0.0858772\r\n 0.5200000 0.0842145\r\n 0.5400000 0.0823712\r\n 0.5600000 0.0803480\r\n 0.5800000 0.0781451\r\n 0.6000000 0.0757633\r\n 0.6200000 0.0732055\r\n 0.6400000 0.0704822\r\n 0.6600000 0.0676046\r\n 0.6800000 0.0645843\r\n 0.7000000 0.0614329\r\n 0.7200000 0.0581599\r\n 0.7400000 0.0547675\r\n 0.7600000 0.0512565\r\n 0.7800000 0.0476281\r\n 0.8000000 0.0438836\r\n 0.8200000 0.0400245\r\n 0.8400000 0.0360536\r\n 0.8600000 0.0319740\r\n 0.8800000 0.0277891\r\n 0.9000000 0.0235025\r\n 0.9200000 0.0191156\r\n 0.9400000 0.0146239\r\n 0.9600000 0.0100232\r\n 0.9700000 0.0076868\r\n 0.9800000 0.0053335\r\n 0.9900000 0.0029690\r\n 1.0000000 0.0005993\r\n \r\n 0.0000000 0.0000000\r\n 0.0005000 -.0046700\r\n 0.0010000 -.0059418\r\n 0.0020000 -.0078113\r\n 0.0040000 -.0105126\r\n 0.0080000 -.0142862\r\n 0.0120000 -.0169733\r\n 0.0200000 -.0202723\r\n 0.0300000 -.0226056\r\n 0.0400000 -.0245211\r\n 0.0500000 -.0260452\r\n 0.0600000 -.0271277\r\n 0.0800000 -.0284595\r\n 0.1000000 -.0293786\r\n 0.1200000 -.0299633\r\n 0.1400000 -.0302404\r\n 0.1600000 -.0302546\r\n 0.1800000 -.0300490\r\n 0.2000000 -.0296656\r\n 0.2200000 -.0291445\r\n 0.2400000 -.0285181\r\n 0.2600000 -.0278164\r\n 0.2800000 -.0270696\r\n 0.3000000 -.0263079\r\n 0.3200000 -.0255565\r\n 0.3400000 -.0248176\r\n 0.3600000 -.0240870\r\n 0.3800000 -.0233606\r\n 0.4000000 -.0226341\r\n 0.4200000 -.0219042\r\n 0.4400000 -.0211708\r\n 0.4600000 -.0204353\r\n 0.4800000 -.0196986\r\n 0.5000000 -.0189619\r\n 0.5200000 -.0182262\r\n 0.5400000 -.0174914\r\n 0.5600000 -.0167572\r\n 0.5800000 -.0160232\r\n 0.6000000 -.0152893\r\n 0.6200000 -.0145551\r\n 0.6400000 -.0138207\r\n 0.6600000 -.0130862\r\n 0.6800000 -.0123515\r\n 0.7000000 -.0116169\r\n 0.7200000 -.0108823\r\n 0.7400000 -.0101478\r\n 0.7600000 -.0094133\r\n 0.7800000 -.0086788\r\n 0.8000000 -.0079443\r\n 0.8200000 -.0072098\r\n 0.8400000 -.0064753\r\n 0.8600000 -.0057408\r\n 0.8800000 -.0050063\r\n 0.9000000 -.0042718\r\n 0.9200000 -.0035373\r\n 0.9400000 -.0028028\r\n 0.9600000 -.0020683\r\n 0.9700000 -.0017011\r\n 0.9800000 -.0013339\r\n 0.9900000 -.0009666\r\n 1.0000000 -.0005993\r\n"};
  const catalog = Object.freeze([
    {id:'naca0012',name:'NACA 0012',family:'NACA 4-digit · symmetric',profile:{kind:'naca4',code:'0012'}},
    {id:'naca2412',name:'NACA 2412',family:'NACA 4-digit · cambered',profile:{kind:'naca4',code:'2412'}},
    {id:'naca4415',name:'NACA 4415',family:'NACA 4-digit · cambered',profile:{kind:'naca4',code:'4415'}},
    {id:'naca23012',name:'NACA 23012',family:'NACA 5-digit · non-reflex',profile:{kind:'naca5',code:'23012'}},
    {id:'naca632615',name:'NACA 63(2)-615',family:'NACA 6-series · coordinate data'},
    {id:'sc20412',name:'NASA SC(2)-0412',family:'NASA supercritical · coordinate data'},
    {id:'clarky',name:'Clark Y',family:'Clark · coordinate data'},
    {id:'e205',name:'Eppler 205',family:'Eppler · coordinate data'},
    {id:'ag24',name:'Drela AG24',family:'Drela · coordinate data'},
    {id:'s1223',name:'Selig S1223',family:'Selig · coordinate data'}
  ].map(p=>Object.freeze({...p,url:p.profile?(p.profile.kind==='naca5'?SOURCES.naca5:SOURCES.nacaThickness):`https://m-selig.ae.illinois.edu/ads/coord/${p.id}.dat`})));
  const presetCache=new Map();
  function preset(id) {const entry=catalog.find(p=>p.id===id);if(!entry)throw new Error('Unknown airfoil library entry.');if(!presetCache.has(id))presetCache.set(id,entry.profile?normalizeProfile(entry.profile):parseDat(CURATED_DATA[id],{filename:id+'.dat',sourceUrl:entry.url,family:entry.family}));return presetCache.get(id);}
  return Object.freeze({VERSION,SAMPLE_COUNT,SOURCES,catalog,preset,normalizeProfile,parseDat,surfaces,verticalOrdinates,camber,blendProfiles,profileAt});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingAirfoils;

/* Station-based semi-wing geometry. Units mm, degrees, x aft / y projected span / z up.
 * Conventions follow NASA OpenVSP's default unrotated-to-dihedral section layout:
 * sections remain in aircraft x-z planes; sweep is measured at an explicit x/c;
 * incidence is absolute, positive nose-up, about an explicit chord reference.
 * https://www.nasa.gov/reference/openvsp-wings/
 * Geometric twist changes incidence; changing spanwise airfoil is aerodynamic twist,
 * not a prediction of its zero-lift angle or resulting lift distribution (NASA SP-367).
 * This module defines geometry, not a swept/curved beam structural formulation.
 */
const WingGeometry = (() => {
  'use strict';
  const A = typeof WingAirfoils !== 'undefined' ? WingAirfoils : (typeof require === 'function' ? require('./wing_airfoils.js') : null);
  const LIMITS = Object.freeze({stations:9, sweepDeg:60, dihedralDeg:45, incidenceDeg:30});
  const deg = Math.PI / 180;
  const finite = (v, name, lo, hi) => {
    if (!Number.isFinite(v) || v < lo || v > hi) throw Error(`${name} must be finite and between ${lo} and ${hi}.`);
    return v;
  };
  function normalizeGeometryFields(g) {
    const out = {};
    if(g.planform!=null){if(!['linear','elliptic','delta'].includes(g.planform))throw Error('Choose linear, elliptic or delta planform.');out.planform=g.planform;}
    for (const [name, limit] of [['sweepDeg',LIMITS.sweepDeg],['dihedralDeg',LIMITS.dihedralDeg]]) {
      if (Object.hasOwn(g,name)) out[name] = finite(g[name], name, -limit, limit);
    }
    for (const name of ['sweepReferenceFraction','twistReferenceFraction']) {
      if (Object.hasOwn(g,name)) out[name] = finite(g[name], name, 0, 1);
    }
    if(g.planform==='elliptic'&&(g.tipChord===0||!Object.hasOwn(g,'sweepReferenceFraction')))out.sweepReferenceFraction=.5;
    if(g.planform==='delta')out.sweepReferenceFraction=1;
    if (Object.hasOwn(g,'twistEnabled')) {
      if (typeof g.twistEnabled !== 'boolean') throw Error('twistEnabled must be true or false.');
      out.twistEnabled = g.twistEnabled;
    }
    if (g.airfoil != null) out.airfoil = A.normalizeProfile(g.airfoil);
    if (g.stations != null) {
      if (!Array.isArray(g.stations) || g.stations.length < 2 || g.stations.length > LIMITS.stations)
        throw Error(`Use 2–${LIMITS.stations} wing stations including the root and tip.`);
      out.stations = Object.freeze(g.stations.map((s,i) => {
        if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !['eta','airfoil','incidenceDeg'].includes(k)))
          throw Error(`Wing station ${i+1}: use eta, airfoil and incidenceDeg only.`);
        const eta = finite(s.eta, `Wing station ${i+1} eta`, 0, 1);
        if (i && eta <= g.stations[i-1].eta) throw Error('Wing stations must be strictly increasing from eta = 0 to eta = 1.');
        if (i && (eta-g.stations[i-1].eta)*g.semiSpan < .1-1e-8) throw Error('Distinct wing stations must be separated by at least 0.1 mm.');
        return Object.freeze({eta, airfoil:A.normalizeProfile(s.airfoil), incidenceDeg:finite(s.incidenceDeg ?? 0, `Wing station ${i+1} incidenceDeg`, -LIMITS.incidenceDeg, LIMITS.incidenceDeg)});
      }));
      if (out.stations[0].eta !== 0 || out.stations.at(-1).eta !== 1) throw Error('Wing stations must include exactly eta = 0 at the root and eta = 1 at the tip.');
      if (g.twistEnabled !== true && out.stations.some(s => s.incidenceDeg !== 0)) throw Error('Enable geometric twist before entering nonzero station incidence, or set every incidence to zero.');
    }
    return out;
  }
  const closedTip=g=>g.tipChord===0&&['elliptic','delta'].includes(g.planform);
  const chordAt = (g,y) => {const e=Math.max(0,Math.min(1,y/g.semiSpan));return g.planform==='elliptic'?Math.sqrt(g.rootChord**2*(1-e*e)+g.tipChord**2*e*e):g.rootChord+e*(g.tipChord-g.rootChord);};
  const chordDerivative=(g,y)=>g.planform==='elliptic'?(g.tipChord**2-g.rootChord**2)*(y/g.semiSpan)/(g.semiSpan*chordAt(g,y)):(g.tipChord-g.rootChord)/g.semiSpan;
  const area = g => {if(g.planform!=='elliptic')return (g.rootChord+g.tipChord)*g.semiSpan/2;const k=Math.sqrt(Math.max(0,1-(g.tipChord/g.rootChord)**2));return g.semiSpan*(g.tipChord+g.rootChord*(k?Math.asin(k)/k:1))/2;};
  function stationAt(g,y) {
    finite(y,'Span station y',0,g.semiSpan);
    const eta=y/g.semiSpan, ss=g.stations;
    let incidenceDeg=0, inboard=0, blend=0;
    if (ss) {
      while (inboard < ss.length-2 && eta > ss[inboard+1].eta) inboard++;
      blend=(eta-ss[inboard].eta)/(ss[inboard+1].eta-ss[inboard].eta);
      incidenceDeg=ss[inboard].incidenceDeg+(ss[inboard+1].incidenceDeg-ss[inboard].incidenceDeg)*blend;
    }
    // Omitted sweep reference means legacy leading-edge alignment, not an
    // implicit quarter-chord shift of every existing tapered study.
    const chord=chordAt(g,y), sweepReferenceFraction=g.planform==='delta'?1:(g.sweepReferenceFraction ?? (g.planform==='elliptic'?.5:0));
    return {eta,y,chord,incidenceDeg,inboard,blend,
      xLE:y*Math.tan((g.sweepDeg ?? 0)*deg)+sweepReferenceFraction*(g.rootChord-chord),
      zLE:y*Math.tan((g.dihedralDeg ?? 0)*deg),
      twistReferenceFraction:g.twistReferenceFraction ?? .25};
  }
  function airfoilAt(g,y) {
    if (!g.stations) return g.airfoil ?? g.naca;
    const s=stationAt(g,y), a=g.stations[s.inboard].airfoil, b=g.stations[s.inboard+1].airfoil;
    if (s.blend === 0) return a;
    if (s.blend === 1) return b;
    if (JSON.stringify(a) === JSON.stringify(b)) return a;
    return A.blendProfiles(a,b,s.blend);
  }
  function transformPoint(g,y,point) {
    const s=stationAt(g,y), a=s.incidenceDeg*deg, ca=Math.cos(a), sa=Math.sin(a), pivot=s.twistReferenceFraction*s.chord;
    const dx=point[0]-pivot,z=point[1];
    return [s.xLE+pivot+ca*dx+sa*z,y,s.zLE-sa*dx+ca*z];
  }
  function inversePoint(g,point) {
    const s=stationAt(g,point[1]), a=s.incidenceDeg*deg, ca=Math.cos(a), sa=Math.sin(a), pivot=s.twistReferenceFraction*s.chord;
    const dx=point[0]-s.xLE-pivot,z=point[2]-s.zLE;
    return [pivot+ca*dx-sa*z,sa*dx+ca*z];
  }
  function analysisCapability(g) {
    const reasons=[];
    if(g.planform&&g.planform!=='linear')reasons.push('non-legacy planform');
    if (Math.abs(g.sweepDeg ?? 0)>1e-12) reasons.push('sweep');
    if (Math.abs(g.dihedralDeg ?? 0)>1e-12) reasons.push('dihedral');
    if ((g.stations ?? []).some(s => Math.abs(s.incidenceDeg)>1e-12)) reasons.push('section incidence / geometric twist');
    // A nonzero sweep-reference location also shifts a tapered wing's sections.
    // Existing legacy wings instead align their leading edges exactly.
    if ((g.sweepReferenceFraction ?? 0)!==0 && g.rootChord!==g.tipChord)
      reasons.push('a chord-reference sweep line that shifts the leading edge of a tapered wing');
    return {supported:reasons.length===0, mode:reasons.length?'geometry-only':'straight-beam', reasons,
      loadFrame:'Aircraft +z (up); N for point loads, N/mm per projected y for line loads.',
      message:reasons.length?`Geometry and CAD export are available, but structural Solve is not supported for ${reasons.join(', ')}. The current solver is a straight, untwisted spanwise beam, not a validated 3-D swept/dihedral frame. Set these angles to zero and align the leading edge to use this solver; no straight-wing stress or safety result will be substituted.`:'Straight, untwisted spanwise beam approximation; local sections may vary. Loads are prescribed, not computed from aerodynamic twist.'};
  }
  return {LIMITS,closedTip,normalizeGeometryFields,chordAt,chordDerivative,area,stationAt,airfoilAt,transformPoint,inversePoint,analysisCapability};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingGeometry;

/* Wing AeroStruct aerodynamic surface-panel core. Development version, NOT published; a separate
 * application from Wing Lab (Wing Lab 1.3 is unchanged).
 *
 * Original implementation of a classical low-order panel method for the finite-thickness wing surface:
 *   - constant-strength source and doublet quadrilaterals on the actual airfoil surface;
 *   - internal Dirichlet condition: perturbation potential zero inside the closed wing;
 *   - Morino trailing-edge Kutta condition (wake doublet = upper minus lower TE doublet);
 *   - flat prescribed wake of semi-infinite constant-strength doublet strips along body +x;
 *   - right semi-wing plus its mirror image (symmetric flight only);
 *   - surface velocity from the tangential gradient of the doublet (= surface perturbation
 *     potential), pressure from incompressible Bernoulli, induced drag in the Trefftz plane;
 *   - rounded aerodynamic tip by default (no flat cap), so every surface pressure is integrated;
 *   - six-component strip loads for the structural model (forces and moments, nothing dropped);
 *   - an executed mesh-refinement sequence with Richardson extrapolation, an uncertainty estimate
 *     and an admission test (torque error relative to the torque itself, see admission()).
 * No source code, header or binary from any other panel program was used.
 *
 * Published theory implemented here:
 *   Hess & Smith (1967) Prog. Aerosp. Sci. 8:1-138 (constant-strength surface panels).
 *   Morino & Kuo (1974) AIAA J. 12(2):191-197 (Green's-identity potential formulation, Kutta condition).
 *   Maskew (1987) NASA CR-4023, VSAERO theory (internal Dirichlet condition).
 *   Katz & Plotkin (2001) Low-Speed Aerodynamics, 2nd ed., ch. 9-12.
 *   Van Oosterom & Strackee (1983) IEEE Trans. Biomed. Eng. 30(2):125-126 (triangle solid angle).
 *   Newman (1986) J. Eng. Math. 20:113-126 (source and normal-dipole quadrilateral integrals).
 *   Richardson (1911) Phil. Trans. R. Soc. A 210:307-357; Roache (1998) Verification and Validation in
 *   Computational Science and Engineering; Celik et al. (2008) J. Fluids Eng. 130:078001 (observed order
 *   with non-uniform refinement ratios); Fritsch & Carlson (1980) SIAM J. Numer. Anal. 17:238-246 (PCHIP).
 *
 * Scope, enforced or reported, never silently extended:
 *   steady, incompressible (Mach <= 0.3 enforced, no compressibility correction), inviscid,
 *   attached flow; symmetric flight only (sideslip 0, no rotation rates); rigid geometry; sharp
 *   aerodynamic trailing edge (the printed trailing-edge thickness is a manufacturing feature and
 *   is closed for the aerodynamic surface); flat wake along body +x (not relaxed, not aligned with
 *   the freestream). No stall, separation, transition, viscous drag or leading-edge vortex lift.
 *
 * Units: geometry mm; speed m/s; density kg/m^3; pressure Pa; force N; moment N mm.
 * Axes: aircraft axes, x aft, y right semi-span, z up. Freestream (air relative to the
 * wing) V (cos a, 0, sin a): positive angle of attack a is air arriving from below the nose.
 * Browser: global WingAeroPanel. Node: require('./wing_aero_panel.js').
 */
/* Wing AeroStruct aerodynamic surface-panel core. Development version, NOT published; a separate
 * application from Wing Lab (Wing Lab 1.3 is unchanged).
 *
 * Original implementation of a surface panel method for the finite-thickness wing surface:
 *   - DEFAULT doublet model 'tensor-quadratic' (EXPERIMENTAL candidate 0.3.2-exp.3 / exp.4): a C1 quadratic spline in
 *     BOTH surface directions (along the section loop and along the span, continuous around the rounded tip); on each
 *     flat triangle of a panel's split the doublet is quadratic (P2), so the body doublet is continuous everywhere (see
 *     tensorQuadBasis); sources constant on each triangle (sigma = -V . n_T); the earlier models remain selectable as
 *     doubletModel 'span-quadratic' (0.3.2-exp.2: constant chordwise, C1 quadratic spline along the span; also the
 *     default with the diagnostic flat tip cap) and 'constant' (the 0.3.1 constant-strength doublet and source
 *     quadrilaterals, bit-identical);
 *   - internal Dirichlet condition: perturbation potential zero inside the closed wing;
 *   - Morino trailing-edge Kutta condition (wake doublet = upper minus lower TE doublet), satisfied POINTWISE along the
 *     trailing edge (the wake carries exactly the jump of the two surface doublet traces; zero at the tip);
 *   - flat prescribed wake of semi-infinite doublet strips along body +x (quadratic and continuous along the span in
 *     the spline models; constant per strip in 'constant');
 *   - right semi-wing plus its mirror image (symmetric flight only);
 *   - surface velocity from the jump relations of the solved sheet, v = V - (V . n_T) n_T + grad_s mu_T on each triangle
 *     (linear there), pressure from incompressible Bernoulli (quadratic Cp per triangle; panel forces and couples are its
 *     exact integrals), induced drag in the Trefftz plane;
 *   - rounded aerodynamic tip by default (no flat cap), so every surface pressure is integrated;
 *   - six-component strip loads for the structural model (forces and moments, nothing dropped);
 *   - an executed mesh-refinement sequence (chordwise and spanwise Richardson extrapolation plus the cross term from
 *     one mesh refined in both directions), an uncertainty estimate and an admission test (torque error relative to
 *     the torque itself, see admission()).
 * No source code, header or binary from any other panel program was used.
 *
 * Published theory implemented here:
 *   Hess & Smith (1967) Prog. Aerosp. Sci. 8:1-138 (constant-strength surface panels).
 *   Morino & Kuo (1974) AIAA J. 12(2):191-197 (Green's-identity potential formulation, Kutta condition).
 *   Maskew (1987) NASA CR-4023, VSAERO theory (internal Dirichlet condition).
 *   Katz & Plotkin (2001) Low-Speed Aerodynamics, 2nd ed., ch. 9-12.
 *   Van Oosterom & Strackee (1983) IEEE Trans. Biomed. Eng. 30(2):125-126 (triangle solid angle).
 *   Newman (1986) J. Eng. Math. 20:113-126 (source and normal-dipole quadrilateral integrals).
 *   Johnson (1980) NASA CR-3079 (structure of the linear-strength doublet integral; cross-checked, not copied).
 *   Richardson (1911) Phil. Trans. R. Soc. A 210:307-357; Roache (1998) Verification and Validation in
 *   Computational Science and Engineering; Celik et al. (2008) J. Fluids Eng. 130:078001 (observed order
 *   with non-uniform refinement ratios); Fritsch & Carlson (1980) SIAM J. Numer. Anal. 17:238-246 (PCHIP).
 *
 * Scope, enforced or reported, never silently extended:
 *   steady, incompressible (Mach <= 0.3 enforced, no compressibility correction), inviscid,
 *   attached flow; symmetric flight only (sideslip 0, no rotation rates); rigid geometry; sharp
 *   aerodynamic trailing edge (the printed trailing-edge thickness is a manufacturing feature and
 *   is closed for the aerodynamic surface); flat wake along body +x (not relaxed, not aligned with
 *   the freestream). No stall, separation, transition, viscous drag or leading-edge vortex lift.
 *
 * Units: geometry mm; speed m/s; density kg/m^3; pressure Pa; force N; moment N mm.
 * Axes: aircraft axes, x aft, y right semi-span, z up. Freestream (air relative to the
 * wing) V (cos a, 0, sin a): positive angle of attack a is air arriving from below the nose.
 * Browser: global WingAeroPanel. Node: require('./wing_aero_panel.js').
 */
const WingAeroPanel = (() => {
  'use strict';
  const VERSION = '0.3.2-exp.4';
  // Browser/Worker: globals from the inlined or bundled scripts. Node: this directory first, then the
  // shared geometry sources in ../web/ (reused unchanged).
  const nodeLoad = name => {
    if (typeof require !== 'function') return null;
    for (const path of ['./' + name, '../web/' + name]) { try { return require(path); } catch (error) { if (!error || error.code !== 'MODULE_NOT_FOUND' || !String(error.message).includes(name)) throw error; } }
    return null;
  };
  const Airfoils = typeof WingAirfoils !== 'undefined' ? WingAirfoils : nodeLoad('wing_airfoils.js');
  const Geometry = typeof WingGeometry !== 'undefined' ? WingGeometry : nodeLoad('wing_geometry.js');
  if (!Airfoils || !Geometry) throw new Error('Load wing_airfoils.js and wing_geometry.js before wing_aero_panel.js.');
  const INV4PI = 1 / (4 * Math.PI), DEG = Math.PI / 180;
  // Hot kernels use module-scope references (avoids global-object lookups in VM contexts and Workers).
  const sqrt = Math.sqrt, atan2 = Math.atan2, logn = Math.log, absv = Math.abs;
  const DEFAULT_FLOW = Object.freeze({ speed: 15, density: 1.225, alphaDeg: 4, betaDeg: 0, viscosity: 1.81e-5, speedOfSound: 340.29 });
  // tipClosure 'rounded' (default): the tip section thickness is rounded off over a short length so the surface
  // closes on itself and every pressure is integrated. 'flat' keeps a flat cap whose pressure is NOT integrated
  // (diagnostic only; see evaluate and the documentation).
  const DEFAULT_MESH = Object.freeze({ chordPanels: 32, spanPanels: 16, spanSpacing: 'sine', farField: 6, tipClosure: 'rounded', roundingStrips: 'auto' });
  const LIMITS = Object.freeze({ chordPanels: [6, 96], spanPanels: [4, 48], maxPanels: 4800, maxMach: 0.3, warnMach: 0.2,
    warnAlphaDeg: 8, maxAlphaDeg: 15, lowReynolds: 5e5, keepMatrixPanels: 1600, speedOfSound: [290, 360], modelCache: 8 });
  const SCOPE = Object.freeze({
    method: 'Surface panels on the finite-thickness wing (experimental candidate): doublets a C1 quadratic spline in both surface directions, quadratic on each triangle of every panel and continuous over the whole body (tensor-quadratic; the span-quadratic model, also used with the diagnostic flat tip cap, and the constant 0.3.1 model remain selectable); sources constant on each triangle; internal Dirichlet condition; Morino Kutta condition matched pointwise along the trailing edge; flat semi-infinite wake along body +x carrying the jump of the trailing-edge doublet traces; surface velocity from the jump relations of the solved sheet, quadratic Cp integrated exactly; symmetric image half-wing.',
    flow: 'Steady, incompressible, inviscid, attached. Mach <= 0.3 enforced; no compressibility correction.',
    excluded: ['stall and separation', 'boundary layer, transition and viscous (profile) drag', 'leading-edge vortex lift of slender or delta wings', 'compressibility', 'sideslip, roll/yaw rates and asymmetric flight', 'wake relaxation and wake roll-up', 'aeroelastic coupling (geometry is rigid)', 'fuselage, ground effect, control surfaces', 'blunt trailing-edge base flow (trailing edge is closed sharp for aerodynamics)'],
    claim: 'Numerical potential-flow estimate; accuracy is demonstrated only by the listed benchmark tests, not certified.',
  });

  // ------------------------------------------------------------------ small helpers
  const finiteIn = (v, name, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be a finite number between ${lo} and ${hi}.`); return v; };
  const intIn = (v, name, lo, hi) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be an integer from ${lo} to ${hi}.`); return v; };
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // ------------------------------------------------------------------ kernels
  // Signed solid angle subtended at P by the oriented triangle (a, b, c): positive on the side of
  // (b - a) x (c - a). Van Oosterom & Strackee (1983) with r_i = P - v_i.
  function triAngle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const x1 = px - ax, y1 = py - ay, z1 = pz - az, x2 = px - bx, y2 = py - by, z2 = pz - bz, x3 = px - cx, y3 = py - cy, z3 = pz - cz;
    const l1 = sqrt(x1 * x1 + y1 * y1 + z1 * z1), l2 = sqrt(x2 * x2 + y2 * y2 + z2 * z2), l3 = sqrt(x3 * x3 + y3 * y3 + z3 * z3);
    const det = x1 * (y2 * z3 - z2 * y3) + y1 * (z2 * x3 - x2 * z3) + z1 * (x2 * y3 - y2 * x3);
    const den = l1 * l2 * l3 + (x1 * x2 + y1 * y2 + z1 * z2) * l3 + (x1 * x3 + y1 * y3 + z1 * z3) * l2 + (x2 * x3 + y2 * y3 + z2 * z3) * l1;
    return 2 * atan2(det, den);
  }
  // Solid angle of the semi-infinite triangle (a, a + R u, b), R -> infinity, u a unit vector:
  // the R -> infinity limit of the same formula after dividing numerator and denominator by R.
  function semiInfiniteAngle(px, py, pz, ax, ay, az, ux, uy, uz, bx, by, bz) {
    const x1 = px - ax, y1 = py - ay, z1 = pz - az, x3 = px - bx, y3 = py - by, z3 = pz - bz;
    const l1 = sqrt(x1 * x1 + y1 * y1 + z1 * z1), l3 = sqrt(x3 * x3 + y3 * y3 + z3 * z3);
    const det = -(x1 * (uy * z3 - uz * y3) + y1 * (uz * x3 - ux * z3) + z1 * (ux * y3 - uy * x3));
    const den = l1 * l3 - (x1 * ux + y1 * uy + z1 * uz) * l3 + (x1 * x3 + y1 * y3 + z1 * z3) - (ux * x3 + uy * y3 + uz * z3) * l1;
    return 2 * atan2(det, den);
  }

  // The 0.3.1 wake (constant-strength semi-infinite strips, strength = Kutta jump) at P and its mirror image, added to
  // target[offset + panel]: exactly the 0.3.1 assembly arithmetic, used for field evaluations of the constant model.
  function addWakeRow(W, px, py, pz, image, target, offset) {
    for (let w = 0; w < W.count; w++) {
      const o = 3 * w;
      let d = semiInfiniteAngle(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
      if (image) d += semiInfiniteAngle(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
      d *= INV4PI; for (let q = 0; q < W.kuttaWidth; q++) { const c = W.kuttaWeights[w * W.kuttaWidth + q]; if (c) target[offset + W.kuttaPanels[w * W.kuttaWidth + q]] += d * c; }
    }
  }

  // ------------------------------------------------------------------ panel surface
  // nodes: flat [x,y,z,...]; quads: flat vertex indices, counter-clockwise about the outward normal.
  // A quad may collapse one edge (triangle). Non-planar quads: the doublet uses the true edges
  // (watertight vortex rings), the source uses the quad flattened into its mean plane.
  function buildSurface(nodes, quads) {
    const n = quads.length / 4;
    if (!Number.isInteger(n) || n < 4) throw new Error('A panel surface needs at least four quadrilaterals.');
    const PV = new Float64Array(12 * n), PC = new Float64Array(3 * n), PN = new Float64Array(3 * n), PL = new Float64Array(3 * n), PM = new Float64Array(3 * n);
    const PF = new Float64Array(8 * n), PA = new Float64Array(n), PD = new Float64Array(n), PW = new Float64Array(n), SELF = new Float64Array(n);
    let maxWarp = 0;
    const tri = (a, b, c, out) => { // area and centroid of a 3-D triangle
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      out.a = area; out.x = (a[0] + b[0] + c[0]) / 3; out.y = (a[1] + b[1] + c[1]) / 3; out.z = (a[2] + b[2] + c[2]) / 3;
    };
    const t1 = {}, t2 = {};
    for (let k = 0; k < n; k++) {
      const v = [0, 1, 2, 3].map(q => { const i = quads[4 * k + q]; if (!(i >= 0 && 3 * i + 2 < nodes.length)) throw new Error('Panel references a missing node.'); return [nodes[3 * i], nodes[3 * i + 1], nodes[3 * i + 2]]; });
      for (let q = 0; q < 4; q++) for (let d = 0; d < 3; d++) PV[12 * k + 3 * q + d] = v[q][d];
      const d1 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]], d2 = [v[3][0] - v[1][0], v[3][1] - v[1][1], v[3][2] - v[1][2]];
      let nx = d1[1] * d2[2] - d1[2] * d2[1], ny = d1[2] * d2[0] - d1[0] * d2[2], nz = d1[0] * d2[1] - d1[1] * d2[0];
      const nn = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(nn > 0)) throw new Error(`Panel ${k} has zero area.`);
      nx /= nn; ny /= nn; nz /= nn; PA[k] = 0.5 * nn;
      // centroid: mean of the two diagonal splits (exact for planar quads and for triangles)
      let C = [0, 0, 0];
      for (const [a, b, c, d] of [[0, 1, 2, 3], [1, 2, 3, 0]]) {
        tri(v[a], v[b], v[c], t1); tri(v[a], v[c], v[d], t2); const s = t1.a + t2.a;
        C[0] += 0.5 * (t1.a * t1.x + t2.a * t2.x) / s; C[1] += 0.5 * (t1.a * t1.y + t2.a * t2.y) / s; C[2] += 0.5 * (t1.a * t1.z + t2.a * t2.z) / s;
      }
      PC[3 * k] = C[0]; PC[3 * k + 1] = C[1]; PC[3 * k + 2] = C[2]; PN[3 * k] = nx; PN[3 * k + 1] = ny; PN[3 * k + 2] = nz;
      // in-plane axes: l from the 0-3 edge midpoint towards the 1-2 edge midpoint
      let lx = (v[1][0] + v[2][0] - v[0][0] - v[3][0]), ly = (v[1][1] + v[2][1] - v[0][1] - v[3][1]), lz = (v[1][2] + v[2][2] - v[0][2] - v[3][2]);
      let dot = lx * nx + ly * ny + lz * nz; lx -= dot * nx; ly -= dot * ny; lz -= dot * nz;
      let ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (!(ll > 1e-12 * Math.sqrt(PA[k]))) { lx = d1[0]; ly = d1[1]; lz = d1[2]; dot = lx * nx + ly * ny + lz * nz; lx -= dot * nx; ly -= dot * ny; lz -= dot * nz; ll = Math.sqrt(lx * lx + ly * ly + lz * lz); }
      lx /= ll; ly /= ll; lz /= ll;
      const mx = ny * lz - nz * ly, my = nz * lx - nx * lz, mz = nx * ly - ny * lx;
      PL[3 * k] = lx; PL[3 * k + 1] = ly; PL[3 * k + 2] = lz; PM[3 * k] = mx; PM[3 * k + 1] = my; PM[3 * k + 2] = mz;
      let rmax = 0, warp = 0;
      for (let q = 0; q < 4; q++) {
        const ex = v[q][0] - C[0], ey = v[q][1] - C[1], ez = v[q][2] - C[2];
        rmax = Math.max(rmax, Math.sqrt(ex * ex + ey * ey + ez * ez)); warp = Math.max(warp, Math.abs(ex * nx + ey * ny + ez * nz));
        PF[8 * k + 2 * q] = ex * lx + ey * ly + ez * lz; PF[8 * k + 2 * q + 1] = ex * mx + ey * my + ez * mz;
      }
      PD[k] = 2 * rmax; PW[k] = warp; maxWarp = Math.max(maxWarp, warp / (2 * rmax));
    }
    const S = { count: n, nodes, quads, PV, PC, PN, PL, PM, PF, PA, PD, PW, SELF, maxWarpRatio: maxWarp };
    for (let k = 0; k < n; k++) SELF[k] = sourceLocal(S, k, 0, 0, 0);
    return S;
  }
  // (1/4pi) * integral dS/r over the flattened panel k, field point in panel-local coordinates.
  function sourceLocal(S, k, x, y, z) {
    const F = S.PF, o = 8 * k;
    let sum = 0, omega = 0;
    for (let e = 0; e < 4; e++) {
      const a = o + 2 * e, b = o + 2 * ((e + 1) & 3), xa = F[a], ya = F[a + 1], xb = F[b], yb = F[b + 1];
      const ex = xb - xa, ey = yb - ya, d = sqrt(ex * ex + ey * ey);
      if (!(d > 1e-14 * S.PD[k])) continue;
      const ra = sqrt((x - xa) * (x - xa) + (y - ya) * (y - ya) + z * z), rb = sqrt((x - xb) * (x - xb) + (y - yb) * (y - yb) + z * z);
      const perp = (ex * (y - ya) - ey * (x - xa)) / d, den = ra + rb - d;
      if (den > 1e-15 * (ra + rb) && absv(perp) > 0) sum += perp * logn((ra + rb + d) / den);
    }
    if (z !== 0) omega = triAngle(x, y, z, F[o], F[o + 1], 0, F[o + 2], F[o + 3], 0, F[o + 4], F[o + 5], 0) + triAngle(x, y, z, F[o], F[o + 1], 0, F[o + 4], F[o + 5], 0, F[o + 6], F[o + 7], 0);
    return (sum - z * omega) * INV4PI;
  }
  // Influence of panel k (unit source, unit doublet) at a field point not on the panel.
  // Doublet sign: +1/2 just outside (normal side), -1/2 just inside.
  let outS = 0, outD = 0;
  function influence(S, k, px, py, pz, far2) {
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz;
    const nx = S.PN[c], ny = S.PN[c + 1], nz = S.PN[c + 2];
    const lim = far2 * S.PD[k] * S.PD[k];
    if (r2 > lim) { const r = sqrt(r2), a = S.PA[k] * INV4PI; outS = a / r; outD = a * (dx * nx + dy * ny + dz * nz) / (r2 * r); return; }
    const V = S.PV, o = 12 * k;
    outD = (triAngle(px, py, pz, V[o], V[o + 1], V[o + 2], V[o + 3], V[o + 4], V[o + 5], V[o + 6], V[o + 7], V[o + 8]) +
      triAngle(px, py, pz, V[o], V[o + 1], V[o + 2], V[o + 6], V[o + 7], V[o + 8], V[o + 9], V[o + 10], V[o + 11])) * INV4PI;
    outS = sourceLocal(S, k, dx * S.PL[c] + dy * S.PL[c + 1] + dz * S.PL[c + 2], dx * S.PM[c] + dy * S.PM[c + 1] + dz * S.PM[c + 2], dx * nx + dy * ny + dz * nz);
  }

  // ------------------------------------------------------------------ span-quadratic doublet (candidate 0.3.2-exp.2)
  // Model ('span-quadratic'). On every wing panel the doublet is constant in the chordwise direction and, along the
  // span, the quadratic Q_k(y) through three values: the panel unknown mu_k at the panel's mid-span y_m = (y_j +
  // y_j+1)/2 and the knot values e at its two spanwise stations y_j, y_j+1 (the panel's v0v1 and v3v2 edges; every node
  // of a station has the same y). The knot values make the doublet a C1 quadratic spline in arc position s along each
  // CHAIN of panels (spanQuadChains): a chordwise row from the root to the tip, around the tip (rounded fold or closed tip
  // point) and back along the opposite row (seam(i) = ni - 1 - i) to the root; the root ends have zero spanwise slope
  // (the mirror image: symmetric flight). C1 condition at an interior knot k between cells k-1, k (widths h):
  //   e_k-1 / h_k-1 + 3 e_k (1/h_k-1 + 1/h_k) + e_k+1 / h_k = 4 mu_k-1 / h_k-1 + 4 mu_k / h_k,
  // clamped root end (zero slope of the first cell): (3 e_0 + e_1)/h_0 = 4 mu_0 / h_0 (likewise at the other end);
  // a symmetric, diagonally dominant tridiagonal system T e = R mu per chain (Thomas algorithm; cyclic chains for an
  // explicit full span by Sherman-Morrison). Next to a flat cap (diagnostic option) each row is its own chain with a
  // natural (linear last cell) tip end, and the cap panels keep constant doublets.
  // Why quadratic and not piecewise linear through the mid-span values: a piecewise-linear doublet with its nodes at the
  // control points (tried first as 'span-linear', checkpoint 1) has its spanwise slope discontinuity, i.e. a jump of
  // the trailing-vorticity density, exactly at the collocation stations (anti-staggered); it under-predicted lift by
  // 6.6 % at 16 x 12 on the AR-6 wing and converged from below, while a reconstruction smooth at the control points
  // recovered the 0.3.1 / PANAIR level. The C1 spline is smooth at the control points, has its knots (the second-
  // derivative jumps) at the stations, staggered like the 0.3.1 trailing vortices, and has no jump anywhere.
  // Trailing edge: the two trailing-edge rows (i = 0 lower, ni - 1 upper) form one chain, so both traces are quadratics
  // on the same stations and their difference is the wake strength (spanQuadWake: one semi-infinite strip per strip
  // with quadratic spanwise strength through the jumps at a_j, the mid-point and b_j): mu_upper - mu_lower - mu_wake = 0
  // at every point of the trailing edge, and at the tip the two rows share the fold knot, so the wake strength is
  // exactly zero there.
  //
  // Potential of a doublet Q(y) on a planar triangle (unit normal n, counter-clockwise about n), exact closed form,
  // derived here (Taylor expansion of the quadratic about the projection P^ = P - h n of the field point and the 2-D
  // divergence theorem; edge integrals of Hess & Smith 1967; solid angle of Van Oosterom & Strackee 1983):
  //   phi(P) = (1/4pi) [ Q(y^) Omega + h Q'(y^) G1 + (1/2) h Q'' G2 ],  y^ = y(P^),  h = (P - Q0).n,
  //   G1 = Y . grad_par S = -sum_e (Y.m_e) L_e,
  //   G2 = int (Y.(X - P^))^2 / r^3 dA = sum_e (Y.u_e) [ (Y.u_e) d_e L_e - (Y.m_e)(r_end - r_start) ] - |Y|^2 h Omega,
  // with Y = y^ - n_y n the in-plane gradient of y, u_e / m_e the unit direction / outward in-plane normal of edge e,
  // d_e = (X_start - P).m_e the signed distance of P^ from the edge line (positive inside), L_e = int_e dl / r =
  // ln[(r_a + r_b + l)/(r_a + r_b - l)], and the identity eta_a eta_b / r^3 = delta_ab / r - d/d eta_b (eta_a / r)
  // (eta = X - P^, r^2 = |eta|^2 + h^2) for the quadratic term; S = int dA / r = sum_e d_e L_e - h Omega. (The linear
  // part is the structure of Johnson 1980, NASA CR-3079, eq. D.30, as implemented in MachLine; no code was copied.)
  // A panel is split through its TRUE corners (watertight with every neighbour like the 0.3.1 rings; the boundary being
  // the 0.3.1 quadrilateral, equal values reproduce the 0.3.1 solid angle) into two triangles along its SHORTER diagonal
  // (mode 0; the corners are stored rotated so that diagonal is 0-2), or, when the diagonals tie on a warped panel, into
  // the fan of four triangles about the vertex mean M (mode 1). Both rules are invariant under the relabelling that maps
  // an upper panel onto its mirror-image lower panel (a fixed diagonal split is not: on warped panels it made a
  // symmetric section lift). The source is integrated over the same triangles from the same edge integrals, each
  // triangle with its OWN normal: the Dirichlet source of the triangulated surface is sigma_t = -V.n_t, so a row stores
  // the vector sum_t S_t n_t (a single panel normal on both triangles of a warped panel made the error of a twisted,
  // airfoil-blended wing depend on the chordwise mesh; planar panels are unchanged).
  const SQ_ED = [Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 0, 2]), Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 4, 0, 4, 1, 4, 2, 4, 3])]; // segments
  const SQ_TV = [Int8Array.from([0, 1, 2, 0, 2, 3]), Int8Array.from([4, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0])];                         // triangles
  const SQ_TS = [Int8Array.from([0, 1, 0, 1, 2, 1, 2, 0, 4, 0, 2, 4, 2, 3, 2, 3, 0, 3]),
    Int8Array.from([4, 0, 4, 0, 1, 0, 1, 4, 5, 4, 1, 5, 1, 2, 1, 2, 4, 6, 4, 2, 6, 2, 3, 2, 3, 4, 7, 4, 3, 7, 3, 0, 3, 0, 4, 4])]; // per triangle edge: start, end, segment
  const SQ_NP = [4, 5], SQ_NS = [5, 8], SQ_NTM = [2, 4];
  const SQ_STRIDE = 154, SQ_Y = 23, SQ_T0 = 25, SQ_FAR = 113, SQ_CP = 149, SQ_MODE = 152;
  // panel data: [0,15) corners and M; [15,23) segment lengths; [23,25) y of the v0v1 / v3v2 stations; per triangle (22):
  // n (3), Y (3), |Y|^2, then per edge (5): m (3), Y.u, Y.m; far moments (36); control-point weights (3).
  const SQR = new Float64Array(15), SQr = new Float64Array(5), SQL = new Float64Array(8);
  // Lagrange quadratic through t = 0 (value at y_L), 1/2 (mid-span), 1 (y_R) and its t-derivatives.
  const quadN = (t, out) => { out[0] = (1 - t) * (1 - 2 * t); out[1] = 4 * t * (1 - t); out[2] = t * (2 * t - 1); out[3] = 4 * t - 3; out[4] = 4 - 8 * t; out[5] = 4 * t - 1; };
  const SQN = new Float64Array(6), SQSV = new Float64Array(3), BPV = new Float64Array(3); // SQSV: source of the fan as sum over triangles of S_t n_t (per-triangle normals)
  // Returns the potential of a unit source on the same fan (Hess & Smith: (1/4pi) sum_tri [ sum_e d_e L_e - h Omega ]),
  // from the same edge integrals.
  function spanQuadNear(D, o, px, py, pz, c) {
    let src = 0, svx = 0, svy = 0, svz = 0;
    const mode = D[o + SQ_MODE], ED = SQ_ED[mode], TV = SQ_TV[mode], TS = SQ_TS[mode], nT = SQ_NTM[mode];
    for (let v = 0, np = SQ_NP[mode]; v < np; v++) {
      const x = px - D[o + 3 * v], y = py - D[o + 3 * v + 1], z = pz - D[o + 3 * v + 2];
      SQR[3 * v] = x; SQR[3 * v + 1] = y; SQR[3 * v + 2] = z; SQr[v] = sqrt(x * x + y * y + z * z);
    }
    for (let e = 0, ns = SQ_NS[mode]; e < ns; e++) {
      const d = D[o + 15 + e];
      if (!(d > 0)) { SQL[e] = 0; continue; }
      const a = ED[2 * e], b = ED[2 * e + 1], ra = SQr[a], rb = SQr[b];
      const ax = SQR[3 * a], ay = SQR[3 * a + 1], az = SQR[3 * a + 2], bx = SQR[3 * b], by = SQR[3 * b + 1], bz = SQR[3 * b + 2];
      const ab = ax * bx + ay * by + az * bz;
      let den;
      if (ab >= 0) den = ra + rb - d;
      else { const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; den = 2 * (cx * cx + cy * cy + cz * cz) / ((ra * rb - ab) * (ra + rb + d)); }
      SQL[e] = den > 0 ? logn((ra + rb + d) / den) : 0;
    }
    const yL = D[o + SQ_Y], dy = D[o + SQ_Y + 1] - yL;
    for (let t = 0; t < nT; t++) {
      const to = o + SQ_T0 + 22 * t, Y2 = D[to + 6];
      if (!(Y2 >= 0)) continue; // degenerate triangle (collapsed tip corner): marked with Y2 = -1
      const nx = D[to], ny = D[to + 1], nz = D[to + 2], i0 = TV[3 * t], i1 = TV[3 * t + 1], i2 = TV[3 * t + 2];
      const x0 = SQR[3 * i0], y0 = SQR[3 * i0 + 1], z0 = SQR[3 * i0 + 2], x1 = SQR[3 * i1], y1 = SQR[3 * i1 + 1], z1 = SQR[3 * i1 + 2];
      const x2 = SQR[3 * i2], y2 = SQR[3 * i2 + 1], z2 = SQR[3 * i2 + 2], r0 = SQr[i0], r1 = SQr[i1], r2 = SQr[i2];
      const det = x0 * (y1 * z2 - z1 * y2) + y0 * (z1 * x2 - x1 * z2) + z0 * (x1 * y2 - y1 * x2);
      const den = r0 * r1 * r2 + (x0 * x1 + y0 * y1 + z0 * z1) * r2 + (x0 * x2 + y0 * y2 + z0 * z2) * r1 + (x1 * x2 + y1 * y2 + z1 * z2) * r0;
      const om = 2 * atan2(det, den), h = x0 * nx + y0 * ny + z0 * nz;
      let G1 = 0, G2 = 0, dL = 0;
      for (let q = 0; q < 3; q++) {
        const eo = to + 7 + 5 * q, ts = 9 * t + 3 * q, s = TS[ts], e = TS[ts + 1], L = SQL[TS[ts + 2]];
        const Yu = D[eo + 3], Ym = D[eo + 4];
        const d = -(SQR[3 * s] * D[eo] + SQR[3 * s + 1] * D[eo + 1] + SQR[3 * s + 2] * D[eo + 2]);
        G1 -= Ym * L; G2 += Yu * (Yu * d * L - Ym * (SQr[e] - SQr[s])); dL += d * L;
      }
      const st = dL - h * om; src += st; svx += st * nx; svy += st * ny; svz += st * nz;
      G2 -= Y2 * h * om;
      quadN((py - h * ny - yL) / dy, SQN);
      const f1 = h * G1 / dy, f2 = 0.5 * h * G2 / (dy * dy);
      c[0] += (SQN[0] * om + SQN[3] * f1 + 4 * f2) * INV4PI;
      c[1] += (SQN[1] * om + SQN[4] * f1 - 8 * f2) * INV4PI;
      c[2] += (SQN[2] * om + SQN[5] * f1 + 4 * f2) * INV4PI;
    }
    SQSV[0] = svx * INV4PI; SQSV[1] = svy * INV4PI; SQSV[2] = svz * INV4PI;
    return src * INV4PI;
  }
  // Far field (beyond farField panel diameters, as 0.3.1): multipole expansion about the centroid through the first
  // moments: phi_q = (1/4pi) [ (a_q . R - tr B_q)/r^3 + 3 R . B_q . R / r^5 ], a_q = int N_q n dA, B_q = int N_q n (x)
  // (X - C) dA (exact for the quadratic shape functions with a degree-5 triangle rule), R = P - C; error O((d/r)^2).
  // (Layout: 30 numbers from SQ_FAR.)
  // Stored per value q (10 numbers): a_q / 4pi (3), tr B_q / 4pi, and 3/4pi times the symmetric part of B_q as
  // (xx, yy, zz, xy + yx, xz + zx, yz + zy), so R . B_q . R costs six products.
  function spanQuadFar(D, o, dx, dy, dz, r2, c) {
    const ir3 = 1 / (r2 * sqrt(r2)), ir5 = ir3 / r2, xx = dx * dx, yy = dy * dy, zz = dz * dz, xy = dx * dy, xz = dx * dz, yz = dy * dz;
    let f = o + SQ_FAR;
    for (let q = 0; q < 3; q++, f += 10) c[q] += (D[f] * dx + D[f + 1] * dy + D[f + 2] * dz - D[f + 3]) * ir3 + (D[f + 4] * xx + D[f + 5] * yy + D[f + 6] * zz + D[f + 7] * xy + D[f + 8] * xz + D[f + 9] * yz) * ir5;
  }
  // Semi-infinite planar strip from the trailing-edge segment A -> B along the unit vector u, with a doublet strength
  // constant along u and quadratic in y through mu_A (at y_A), mu_mid (at (y_A + y_B)/2), mu_B (at y_B); u must have no y
  // component (body +x or a freestream in the x-z plane). The same expansion as spanQuadNear over the strip's edges:
  // the two semi-infinite sides carry no Y.u_e (the divergent side-edge parts of S and of the edge sums cancel exactly),
  // the far edge contributes (Y.e)^2 l / |u x e| in the limit, so with e = (B - A)/l, s_n = |u x e|, Y.e = (y_B - y_A)/l:
  //   G1 = -(Y.e) [ (u.e) L_AB + L_B - L_A ] / s_n,   (L_B - L_A as in linearHalfStrip, finite)
  //   G2 = (Y.e)^2 [ d_AB L_AB - (u.e)(r_B - r_A) / s_n + l / s_n ] - |Y|^2 h Omega,  |Y|^2 = (Y.e)^2 / s_n^2,
  // d_AB = (P - A).(u - (u.e) e) / s_n, Omega = semiInfiniteAngle, n = u x e / s_n. out[0..2]: coefficients of the values.
  function quadStrip(px, py, pz, ax, ay, az, ux, uy, uz, bx, by, bz, out) {
    let ex = bx - ax, ey = by - ay, ez = bz - az;
    const l = sqrt(ex * ex + ey * ey + ez * ez), dyAB = ey; ex /= l; ey /= l; ez /= l;
    const eu = ex * ux + ey * uy + ez * uz;
    let nx = uy * ez - uz * ey, ny = uz * ex - ux * ez, nz = ux * ey - uy * ex;
    const sn = sqrt(nx * nx + ny * ny + nz * nz); nx /= sn; ny /= sn; nz /= sn;
    const dax = px - ax, day = py - ay, daz = pz - az, dbx = px - bx, dby = py - by, dbz = pz - bz;
    const h = dax * nx + day * ny + daz * nz, om = semiInfiniteAngle(px, py, pz, ax, ay, az, ux, uy, uz, bx, by, bz);
    let G1 = 0, G2 = 0;
    const ye = dyAB / l, Y2 = ye * ye / (sn * sn);
    if (h !== 0) {
      const rA = sqrt(dax * dax + day * day + daz * daz), rB = sqrt(dbx * dbx + dby * dby + dbz * dbz);
      const side = (dx, dy, dz, r) => { const du = dx * ux + dy * uy + dz * uz; if (du <= 0) return r - du; const cx = dy * uz - dz * uy, cy = dz * ux - dx * uz, cz = dx * uy - dy * ux; return (cx * cx + cy * cy + cz * cz) / (r + du); };
      const ab = dax * dbx + day * dby + daz * dbz;
      let den;
      if (ab >= 0) den = rA + rB - l;
      else { const cx = day * dbz - daz * dby, cy = daz * dbx - dax * dbz, cz = dax * dby - day * dbx; den = 2 * (cx * cx + cy * cy + cz * cz) / ((rA * rB - ab) * (rA + rB + l)); }
      const LAB = logn((rA + rB + l) / den), LBA = logn(side(dax, day, daz, rA) / side(dbx, dby, dbz, rB));
      const dAB = (dax * (ux - eu * ex) + day * (uy - eu * ey) + daz * (uz - eu * ez)) / sn;
      G1 = -ye * (eu * LAB + LBA) / sn;
      G2 = ye * ye * (dAB * LAB - eu * (rB - rA) / sn + l / sn) - Y2 * h * om;
    }
    quadN((py - h * ny - ay) / dyAB, SQN);
    const f1 = h * G1 / dyAB, f2 = 0.5 * h * G2 / (dyAB * dyAB);
    out[0] = (SQN[0] * om + SQN[3] * f1 + 4 * f2) * INV4PI;
    out[1] = (SQN[1] * om + SQN[4] * f1 - 8 * f2) * INV4PI;
    out[2] = (SQN[2] * om + SQN[5] * f1 + 4 * f2) * INV4PI;
  }
  // Chain solver: T e = R mu (see the model note). chain = { cells: Int32Array (panel per cell, in chain order),
  // h: Float64Array (cell widths), knots: Int32Array (knot ids: N + 1 for an open chain, N for a cyclic one),
  // start / end: 'clamped' | 'natural' (open chains), cyclic: bool }. T is symmetric (rows scaled by 1/h), so the
  // transposed map needed by the matrix rows uses the same solver.
  function chainSystem(ch) {
    const N = ch.cells.length, h = ch.h, cyc = !!ch.cyclic, m = cyc ? N : N + 1;
    const lo = new Float64Array(m), di = new Float64Array(m), up = new Float64Array(m); // row k: lo e_k-1 + di e_k + up e_k+1
    const R0 = new Float64Array(m), R1 = new Float64Array(m); // rhs row k: R0 mu_{k-1} + R1 mu_k (cells mod N for cyclic)
    for (let k = 0; k < m; k++) {
      if (!cyc && k === 0) { if (ch.start === 'natural') { di[0] = 1 / h[0]; up[0] = 1 / h[0]; R1[0] = 2 / h[0]; } else { di[0] = 3 / h[0]; up[0] = 1 / h[0]; R1[0] = 4 / h[0]; } continue; }
      if (!cyc && k === N) { const hl = h[N - 1]; if (ch.end === 'natural') { lo[N] = 1 / hl; di[N] = 1 / hl; R0[N] = 2 / hl; } else { lo[N] = 1 / hl; di[N] = 3 / hl; R0[N] = 4 / hl; } continue; }
      const hl = h[(k - 1 + N) % N], hr = h[k % N];
      lo[k] = 1 / hl; di[k] = 3 * (1 / hl + 1 / hr); up[k] = 1 / hr; R0[k] = 4 / hl; R1[k] = 4 / hr;
    }
    // Thomas factorisation of the open tridiagonal part (for cyclic: of the matrix with the corner terms moved out)
    const cp = new Float64Array(m);
    const solveOpen = (dd, rhs) => { // in place on rhs, tridiagonal lo/dd/up of size m (no corners)
      let b = dd[0]; cp[0] = up[0] / b; rhs[0] /= b;
      for (let k = 1; k < m; k++) { b = dd[k] - lo[k] * cp[k - 1]; cp[k] = up[k] / b; rhs[k] = (rhs[k] - lo[k] * rhs[k - 1]) / b; }
      for (let k = m - 2; k >= 0; k--) rhs[k] -= cp[k] * rhs[k + 1];
      return rhs;
    };
    let solve;
    if (!cyc) solve = rhs => solveOpen(di, rhs);
    else { // Sherman-Morrison: T = T' + w v^T with corner terms T[0][m-1] = lo[0], T[m-1][0] = up[m-1]
      const gam = -di[0], d2 = Float64Array.from(di); d2[0] = di[0] - gam; d2[m - 1] = di[m - 1] - lo[0] * up[m - 1] / gam;
      const w = new Float64Array(m); w[0] = gam; w[m - 1] = up[m - 1];
      const z = solveOpen(d2, Float64Array.from(w)), vz = z[0] + lo[0] / gam * z[m - 1];
      solve = rhs => { const y = solveOpen(d2, rhs), vy = y[0] + lo[0] / gam * y[m - 1], f = vy / (1 + vz); for (let k = 0; k < m; k++) y[k] -= f * z[k]; return y; };
    }
    return { N, m, R0, R1, solve, cyclic: cyc, z: new Float64Array(m) };
  }
  // The same chain system with its Thomas factorization precomputed (multiplications only in each solve); used by the
  // tensor-quadratic model, whose rows apply hundreds of chain solves (chainSystem itself stays unchanged).
  function chainSystemT(ch) {
    const N = ch.cells.length, h = ch.h, cyc = !!ch.cyclic, m = cyc ? N : N + 1;
    const lo = new Float64Array(m), di = new Float64Array(m), up = new Float64Array(m), R0 = new Float64Array(m), R1 = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      if (!cyc && k === 0) { if (ch.start === 'natural') { di[0] = 1 / h[0]; up[0] = 1 / h[0]; R1[0] = 2 / h[0]; } else { di[0] = 3 / h[0]; up[0] = 1 / h[0]; R1[0] = 4 / h[0]; } continue; }
      if (!cyc && k === N) { const hl = h[N - 1]; if (ch.end === 'natural') { lo[N] = 1 / hl; di[N] = 1 / hl; R0[N] = 2 / hl; } else { lo[N] = 1 / hl; di[N] = 3 / hl; R0[N] = 4 / hl; } continue; }
      const hl = h[(k - 1 + N) % N], hr = h[k % N];
      lo[k] = 1 / hl; di[k] = 3 * (1 / hl + 1 / hr); up[k] = 1 / hr; R0[k] = 4 / hl; R1[k] = 4 / hr;
    }
    const fac = dd => { const ib = new Float64Array(m), cp = new Float64Array(m); let b = dd[0]; ib[0] = 1 / b; cp[0] = up[0] * ib[0]; for (let k = 1; k < m; k++) { b = dd[k] - lo[k] * cp[k - 1]; ib[k] = 1 / b; cp[k] = up[k] * ib[k]; } return { ib, cp }; };
    const solveF = (F, rhs) => { const ib = F.ib, cp = F.cp; rhs[0] *= ib[0]; for (let k = 1; k < m; k++) rhs[k] = (rhs[k] - lo[k] * rhs[k - 1]) * ib[k]; for (let k = m - 2; k >= 0; k--) rhs[k] -= cp[k] * rhs[k + 1]; return rhs; };
    let solve, F, smz = null, smf = 0, smg = 0;
    if (!cyc) { F = fac(di); solve = rhs => solveF(F, rhs); }
    else {
      const gam = -di[0], d2 = Float64Array.from(di); d2[0] = di[0] - gam; d2[m - 1] = di[m - 1] - lo[0] * up[m - 1] / gam;
      F = fac(d2); const w = new Float64Array(m); w[0] = gam; w[m - 1] = up[m - 1];
      const z = solveF(F, w), vz = z[0] + lo[0] / gam * z[m - 1];
      smz = z; smf = lo[0] / gam; smg = 1 / (1 + vz);
      solve = rhs => { const y = solveF(F, rhs), vy = y[0] + lo[0] / gam * y[m - 1], f = vy / (1 + vz); for (let k = 0; k < m; k++) y[k] -= f * z[k]; return y; };
    }
    return { N, m, R0, R1, solve, cyclic: cyc, z: new Float64Array(m), lo, ib: F.ib, cp: F.cp, smz, smf, smg };
  }
  // Knot values of all chains from the panel unknowns.
  function knotValues(B, mu) {
    const e = new Float64Array(B.knotCount);
    for (const ch of B.chains) {
      const s = ch.sys, rhs = new Float64Array(s.m);
      for (let k = 0; k < s.m; k++) { const cl = (k - 1 + s.N) % s.N; rhs[k] = (s.R0[k] ? s.R0[k] * mu[ch.cells[cl]] : 0) + (s.R1[k] ? s.R1[k] * mu[ch.cells[k % s.N]] : 0); }
      const x = s.solve(rhs); for (let k = 0; k < s.m; k++) e[ch.knots[k]] = x[k];
    }
    return e;
  }
  // Doublet at each panel centroid (the surface potential sampled by the gradient recovery): Q_k(y_centroid).
  function controlPointValues(B, mu) {
    const out = Float64Array.from(mu), D = B.data, e = knotValues(B, mu);
    for (let k = 0; k < out.length; k++) if (B.quad[k]) { const o = B.stride * k + SQ_CP; out[k] = D[o] * e[B.kL[k]] + D[o + 1] * mu[k] + D[o + 2] * e[B.kR[k]]; }
    return out;
  }
  // Span-quadratic basis. kL[k] / kR[k]: knot on panel k's v0v1 / v3v2 edge (-1 for a constant panel, e.g. a flat cap);
  // chains: see chainSystem (every knot belongs to exactly one chain).
  function spanQuadBasis(S, kL, kR, chains, knotCount) {
    const n = S.count, D = new Float64Array(SQ_STRIDE * n), quad = new Uint8Array(n);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = a => Math.hypot(a[0], a[1], a[2]);
    const GP = [[1 / 3, 1 / 3, 1 / 3, 0.225], [0.059715871789770, 0.470142064105115, 0.470142064105115, 0.132394152788506], [0.470142064105115, 0.059715871789770, 0.470142064105115, 0.132394152788506], [0.470142064105115, 0.470142064105115, 0.059715871789770, 0.132394152788506], [0.797426985353087, 0.101286507323456, 0.101286507323456, 0.125939180544827], [0.101286507323456, 0.797426985353087, 0.101286507323456, 0.125939180544827], [0.101286507323456, 0.101286507323456, 0.797426985353087, 0.125939180544827]];
    const N6 = new Float64Array(6), selfSource = new Float64Array(n), fanArea = new Float64Array(n), selfSourceVec = new Float64Array(3 * n), fanVec = new Float64Array(3 * n);
    for (let k = 0; k < n; k++) {
      if (kL[k] < 0 && kR[k] < 0) continue;
      if (!(kL[k] >= 0 && kL[k] < knotCount && kR[k] >= 0 && kR[k] < knotCount)) throw new Error('A span-quadratic panel needs two valid knots.');
      quad[k] = 1;
      const o = SQ_STRIDE * k, V = S.PV, v = 12 * k, corner = [0, 1, 2, 3].map(q => [V[v + 3 * q], V[v + 3 * q + 1], V[v + 3 * q + 2]]);
      const d02 = len(sub(corner[2], corner[0])), d13 = len(sub(corner[3], corner[1])), tie = absv(d02 - d13) <= 1e-9 * Math.max(d02, d13);
      const mode = tie && S.PW[k] > 1e-12 * S.PD[k] ? 1 : 0, rot = !tie && d13 < d02 ? 1 : 0;
      const pt = mode ? corner.slice() : [0, 1, 2, 3].map(q => corner[(q + rot) % 4]);
      pt.push([0, 1, 2].map(c => 0.25 * (corner[0][c] + corner[1][c] + corner[2][c] + corner[3][c])));
      D[o + SQ_MODE] = mode;
      const yL = corner[0][1], yR = corner[3][1], sc = Math.max(1, absv(yL), absv(yR));
      if (absv(corner[1][1] - yL) > 1e-9 * sc || absv(corner[2][1] - yR) > 1e-9 * sc || !(absv(yR - yL) > 1e-12 * sc)) throw new Error(`Span-quadratic panel ${k}: its spanwise edges must lie on two distinct stations y = const.`);
      const ED = SQ_ED[mode], TV = SQ_TV[mode], TS = SQ_TS[mode];
      for (let q = 0; q < SQ_NP[mode]; q++) for (let c = 0; c < 3; c++) D[o + 3 * q + c] = pt[q][c];
      for (let e = 0; e < SQ_NS[mode]; e++) D[o + 15 + e] = len(sub(pt[ED[2 * e + 1]], pt[ED[2 * e]]));
      const C = [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]], tOf = y => (y - yL) / (yR - yL), mom = new Float64Array(36);
      for (let t = 0; t < SQ_NTM[mode]; t++) {
        const Q = [pt[TV[3 * t]], pt[TV[3 * t + 1]], pt[TV[3 * t + 2]]], to = o + SQ_T0 + 22 * t;
        const N = cross(sub(Q[1], Q[0]), sub(Q[2], Q[0])), twoA = len(N);
        if (!(twoA > 1e-14 * S.PD[k] * S.PD[k])) { D[to + 6] = -1; continue; }
        const nn = N.map(x => x / twoA), Y = [-nn[1] * nn[0], 1 - nn[1] * nn[1], -nn[1] * nn[2]], area = 0.5 * twoA;
        fanArea[k] += area; fanVec[3 * k] += area * nn[0]; fanVec[3 * k + 1] += area * nn[1]; fanVec[3 * k + 2] += area * nn[2];
        D[to] = nn[0]; D[to + 1] = nn[1]; D[to + 2] = nn[2]; D[to + 3] = Y[0]; D[to + 4] = Y[1]; D[to + 5] = Y[2]; D[to + 6] = dot(Y, Y);
        for (let q = 0; q < 3; q++) {
          const ts = 9 * t + 3 * q, A = pt[TS[ts]], Bp = pt[TS[ts + 1]], dl = len(sub(Bp, A)), eo = to + 7 + 5 * q;
          const u = dl > 0 ? sub(Bp, A).map(x => x / dl) : [0, 0, 0], m = cross(u, nn);
          D[eo] = m[0]; D[eo + 1] = m[1]; D[eo + 2] = m[2]; D[eo + 3] = dot(Y, u); D[eo + 4] = dot(Y, m);
        }
        for (const [l0, l1, l2, w] of GP) { // far-field moments, degree-5 rule (exact: quadratic x linear)
          const X = [0, 1, 2].map(c => l0 * Q[0][c] + l1 * Q[1][c] + l2 * Q[2][c]); quadN(tOf(X[1]), N6);
          for (let q = 0; q < 3; q++) {
            const wq = w * area * N6[q], fa = 3 * q, fb = 9 + 9 * q;
            for (let c = 0; c < 3; c++) mom[fa + c] += wq * nn[c];
            for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) mom[fb + 3 * a + b] += wq * nn[a] * (X[b] - C[b]);
          }
        }
      }
      for (let q = 0; q < 3; q++) { // pack (see spanQuadFar)
        const f = o + SQ_FAR + 10 * q, a = 3 * q, b = 9 + 9 * q;
        D[f] = mom[a] * INV4PI; D[f + 1] = mom[a + 1] * INV4PI; D[f + 2] = mom[a + 2] * INV4PI; D[f + 3] = (mom[b] + mom[b + 4] + mom[b + 8]) * INV4PI;
        D[f + 4] = 3 * mom[b] * INV4PI; D[f + 5] = 3 * mom[b + 4] * INV4PI; D[f + 6] = 3 * mom[b + 8] * INV4PI;
        D[f + 7] = 3 * (mom[b + 1] + mom[b + 3]) * INV4PI; D[f + 8] = 3 * (mom[b + 2] + mom[b + 6]) * INV4PI; D[f + 9] = 3 * (mom[b + 5] + mom[b + 7]) * INV4PI;
      }
      D[o + SQ_Y] = yL; D[o + SQ_Y + 1] = yR;
      quadN(tOf(C[1]), N6); D[o + SQ_CP] = N6[0]; D[o + SQ_CP + 1] = N6[1]; D[o + SQ_CP + 2] = N6[2];
      selfSource[k] = spanQuadNear(D, o, C[0], C[1], C[2], new Float64Array(3)); // source of the fan at its own centroid (finite)
      selfSourceVec[3 * k] = SQSV[0]; selfSourceVec[3 * k + 1] = SQSV[1]; selfSourceVec[3 * k + 2] = SQSV[2];
    }
    const sys = chains.map(ch => ({ ...ch, sys: chainSystem(ch) }));
    const seen = new Int32Array(knotCount); for (const ch of sys) for (const kn of ch.knots) seen[kn]++;
    if (!seen.every(v => v === 1)) throw new Error('Span-quadratic basis: every knot must belong to exactly one chain.');
    return Object.freeze({ kind: 'span-quadratic', S, chainsRaw: chains, data: D, stride: SQ_STRIDE, quad, kL: Int32Array.from(kL), kR: Int32Array.from(kR), chains: sys, knotCount, selfSource, fanArea, selfSourceVec, fanVec,
      scratchM: new Float64Array(n), scratchE: new Float64Array(knotCount), c3: new Float64Array(3) });
  }
  // The basis for surface S: B itself when it was built for S, otherwise the same topology (knots, chains) rebuilt on S
  // (e.g. a translated or rotated copy of the mesh with the same panel ordering).
  function basisFor(B, S) { return !B || B.S === S ? B : B.kind === 'tensor-quadratic' ? tensorQuadBasis(S, B.topo) : spanQuadBasis(S, B.kL, B.kR, B.chainsRaw, B.knotCount); }
  // ------------------------------------------------------------------ tensor-quadratic doublet (candidate 0.3.2-exp.3)
  // Model ('tensor-quadratic'). The C1 quadratic spline of the span-quadratic model is applied in BOTH surface
  // directions: along every spanwise chain (as before: root -> tip -> mirror row, zero slope at the root) AND along the
  // section loop (lower trailing edge -> leading edge -> upper trailing edge, natural = linear end cell at both trailing-
  // edge ends) of every strip and every station. Values (one id space, 'unified'): mu (the panel unknowns, the doublet
  // at the panel's parametric centre), MK (row mid-chord at the stations = the span-chain knots), KM (section-loop knots
  // at strip mid-span: the chordwise spline of mu along strip j) and KK (section-loop knots at the stations: the
  // chordwise spline of MK along station j). Nine values per panel (corners KK, edge mid-points MK / KM, centre mu)
  // define the biquadratic f(s, t) of the panel's parameters (s chordwise, t spanwise); on every triangle of the panel's
  // split the doublet is the quadratic (P2) through f at the triangle's vertices and edge mid-points (at the bilinear
  // pre-image of each physical point), so an edge shared by two panels carries the same three values on both sides:
  // the body doublet is continuous everywhere (no line vortex anywhere on the body). Rounded tip: the tip station's
  // loop is the folded camber line, its data are symmetric (a row and its seam row share the span-chain tip knot), so
  // are its knots, and the two trailing-edge traces meet there. Closed tip: every value at the tip point is one value T
  // (mean of the span-chain tip knots). Wake: strip j carries the quadratic through KK(ni, j) - KK(0, j), KM(ni, j) -
  // KM(0, j), KK(ni, j+1) - KK(0, j+1), i.e. upper minus lower trailing-edge trace at every point (zero at the tip).
  // Why: a 2-D study (constant source, Dirichlet, Morino; Karman-Trefftz and NACA 0012 sections) shows the constant
  // chordwise doublet has a FIRST-order lift and moment error (-1.9 % in Cl and +0.0015 in Cm at 32 panels per surface)
  // and the chordwise spline about 2.5th order (+0.1 %, -0.0003).
  // Potential of a quadratic doublet mu(X) on a planar triangle, exact closed form (the vector / tensor form of the span-
  // quadratic expansion, the same edge integrals; derivation: eta_a eta_b / r^3 = delta_ab / r - d/d eta_b (eta_a / r)):
  //   phi(P) = [mu(P^) Omega + h grad(mu) . g + 1/2 h H : G] / 4 pi,  g = -sum_e m_e L_e,
  //   G = sum_e [d_e L_e u_e u_e^T - (r_end - r_start) sym(u_e m_e^T)] - h Omega I,
  // H the constant in-plane Hessian. For the P2 basis (barycentric lambda_i of P^, constant in-plane grad lambda_i):
  // p_i = grad lambda_i . g, q_ij = grad lambda_i^T G grad lambda_j, and
  //   vertex i: [lambda_i (2 lambda_i - 1) Omega + h (4 lambda_i - 1) p_i + 2 h q_ii] / 4 pi,
  //   mid ij:   [4 lambda_i lambda_j Omega + 4 h (lambda_i p_j + lambda_j p_i) + 4 h q_ij] / 4 pi.
  // Panel split: mode 0 two triangles along the shorter diagonal (as span-quadratic), mode 1 the fan of four about the
  // vertex mean when the diagonals tie (warped or not), mode 2 a fan of three about the vertex mean on a panel whose
  // v2 v3 edge has collapsed to the closed-tip point. Source: per triangle, its own normal (as span-quadratic).
  // Exception (tbSplitRule): two mode-0 panels whose triangles would coincide (the closed corners of the last strip)
  // take the other diagonal instead, or the fan of four if a coincidence remained.
  const TQ_ED = [Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 0, 2]), Int8Array.from([0, 1, 1, 2, 2, 3, 3, 0, 4, 0, 4, 1, 4, 2, 4, 3]), Int8Array.from([0, 1, 1, 2, 2, 0, 4, 0, 4, 1, 4, 2])];
  const TQ_TV = [Int8Array.from([0, 1, 2, 0, 2, 3]), Int8Array.from([4, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0]), Int8Array.from([4, 0, 1, 4, 1, 2, 4, 2, 0])];
  const TQ_TS = [Int8Array.from([0, 1, 0, 1, 2, 1, 2, 0, 4, 0, 2, 4, 2, 3, 2, 3, 0, 3]),
    Int8Array.from([4, 0, 4, 0, 1, 0, 1, 4, 5, 4, 1, 5, 1, 2, 1, 2, 4, 6, 4, 2, 6, 2, 3, 2, 3, 4, 7, 4, 3, 7, 3, 0, 3, 0, 4, 4]),
    Int8Array.from([4, 0, 3, 0, 1, 0, 1, 4, 4, 4, 1, 4, 1, 2, 1, 2, 4, 5, 4, 2, 5, 2, 0, 2, 0, 4, 3])];
  // P2 nodes per triangle (vertex 0, 1, 2, mid 01, mid 12, mid 20) as panel node ids; panel nodes per mode:
  // mode 0: 0-3 the (rotated) corners, 4-7 mid-points of edges 01 12 23 30, 8 mid-point of the diagonal 02;
  // mode 1: 0-3 corners, 4 vertex mean M, 5-8 edge mid-points, 9-12 mid-points of the spokes M0 M1 M2 M3;
  // mode 2: 0 v0, 1 v1, 2 tip point, 3 M, 4 mid v0v1, 5 mid v1-tip, 6 mid tip-v0, 7-9 mid-points of spokes M-v0 M-v1 M-tip.
  const TQ_TN = [Int8Array.from([0, 1, 2, 4, 5, 8, 0, 2, 3, 8, 6, 7]), Int8Array.from([4, 0, 1, 9, 5, 10, 4, 1, 2, 10, 6, 11, 4, 2, 3, 11, 7, 12, 4, 3, 0, 12, 8, 9]),
    Int8Array.from([3, 0, 1, 7, 4, 8, 3, 1, 2, 8, 5, 9, 3, 2, 0, 9, 6, 7])];
  const TQ_NP = [4, 5, 5], TQ_NS = [5, 8, 6], TQ_NT = [2, 4, 3], TQ_NN = [9, 13, 10];
  // panel data layout: [0,15) points (corners, M); [15,23) segment lengths; 23 mode; per triangle (52) from TQ_TRI:
  // valid, n (3), grad lambda_0..2 (9), per edge q (9): m (3), grad lambda_i . u_q (3), grad lambda_i . m_q (3), then
  // g_ij = grad lambda_i . grad lambda_j (00 11 22 01 12 20), node ids (6); node table from TQ_NODE (10 per node: slot
  // 0..8 of a unit node, or -1 followed by the nine slot weights); far moments (9 values x 10) from TQ_FAR; control-point
  // slot weights (9) from TQ_CPW.
  const TQ_TRI = 24, TQ_TRISZ = 52, TQ_NODE = TQ_TRI + 4 * TQ_TRISZ, TQ_FAR = TQ_NODE + 130, TQ_CPW = TQ_FAR + 90, TQ_STRIDE = TQ_CPW + 9;
  const TQR = new Float64Array(15), TQr = new Float64Array(5), TQL = new Float64Array(8), TQN = new Float64Array(13);
  const lag3 = (x, o) => { o[0] = (1 - x) * (1 - 2 * x); o[1] = 4 * x * (1 - x); o[2] = x * (2 * x - 1); return o; };
  // potential coefficients of the nine panel values at P (added to c9), source (returned, scalar sum over triangles)
  // and the source vector sum_t S_t n_t (TQSV), all per 4 pi.
  // Planar panels: the far-field expansion order is graded by distance (r / panel diameter; ff = the farField ratio):
  // exact inside 2/3 ff, fourth order (third- and fourth-order terms both) from 2/3 ff, second from ff, first from 4 ff
  // (default ff = 6: exact inside 4 diameters, fourth order to 6, second to 24, first beyond). Non-planar panels: inside
  // 4 ff diameters the planar graded expansion per triangle of the split (tbTriangleFar, triangleEval; the same zones in
  // the triangle's diameter), beyond it first order about the centroid.
  // Why these zones (0.3.2-exp.3 checkpoint 9; the earlier zones were exact inside 0.4 ff, fourth order to 2/3 ff,
  // second to 2 ff, measured only on the course wing 32 x 16): the far-field error of the ASSEMBLED solution grows with
  // spanwise refinement. Rectangular NACA 0012 AR 6, alpha 4, against the every-panel-exact assembly:
  //   mesh 32 x 48:        earlier zones dCL -6.2e-5, dCm +3.0e-6;  these zones dCL -4e-6, dCm +1.9e-7 (+15 % time)
  //   mesh 64 x 48 (rs 8): earlier zones dCL -8.5e-5, dCm +2.6e-6;  these zones dCL -6e-6, dCm +1.3e-7 (+19 % time)
  // (the earlier zones: Cm drifted by 1.6e-5 over the spanwise sequence 64 x 24 ... 64 x 96, every panel exact: no
  // drift). The exact-zone radius controls the Cm error, the second- and first-order zones the lift error.
  const TQSV = new Float64Array(3), TQ_FF2 = 1, TQ_FF4 = 4 / 9, TQ_FF1 = 16;
  function tensorQuadNear(D, o, px, py, pz, c9) {
    const mode = D[o + 23], ED = TQ_ED[mode], TV = TQ_TV[mode], TS = TQ_TS[mode], TN = TQ_TN[mode], nT = TQ_NT[mode], nN = TQ_NN[mode];
    let src = 0, svx = 0, svy = 0, svz = 0;
    for (let v = 0; v < 5; v++) {
      const x = px - D[o + 3 * v], y = py - D[o + 3 * v + 1], z = pz - D[o + 3 * v + 2];
      TQR[3 * v] = x; TQR[3 * v + 1] = y; TQR[3 * v + 2] = z; TQr[v] = sqrt(x * x + y * y + z * z);
    }
    for (let e = 0, ns = TQ_NS[mode]; e < ns; e++) {
      const d = D[o + 15 + e];
      if (!(d > 0)) { TQL[e] = 0; continue; }
      const a = ED[2 * e], b = ED[2 * e + 1], ra = TQr[a], rb = TQr[b];
      const ax = TQR[3 * a], ay = TQR[3 * a + 1], az = TQR[3 * a + 2], bx = TQR[3 * b], by = TQR[3 * b + 1], bz = TQR[3 * b + 2];
      const ab = ax * bx + ay * by + az * bz;
      let den;
      if (ab >= 0) den = ra + rb - d;
      else { const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; den = 2 * (cx * cx + cy * cy + cz * cz) / ((ra * rb - ab) * (ra + rb + d)); }
      TQL[e] = den > 0 ? logn((ra + rb + d) / den) : 0;
    }
    for (let q = 0; q < nN; q++) TQN[q] = 0;
    for (let t = 0; t < nT; t++) {
      const to = o + TQ_TRI + TQ_TRISZ * t;
      if (!D[to]) continue; // degenerate triangle
      const nx = D[to + 1], ny = D[to + 2], nz = D[to + 3], i0 = TV[3 * t], i1 = TV[3 * t + 1], i2 = TV[3 * t + 2];
      const x0 = TQR[3 * i0], y0 = TQR[3 * i0 + 1], z0 = TQR[3 * i0 + 2], x1 = TQR[3 * i1], y1 = TQR[3 * i1 + 1], z1 = TQR[3 * i1 + 2];
      const x2 = TQR[3 * i2], y2 = TQR[3 * i2 + 1], z2 = TQR[3 * i2 + 2], r0 = TQr[i0], r1 = TQr[i1], r2 = TQr[i2];
      const det = x0 * (y1 * z2 - z1 * y2) + y0 * (z1 * x2 - x1 * z2) + z0 * (x1 * y2 - y1 * x2);
      const den = r0 * r1 * r2 + (x0 * x1 + y0 * y1 + z0 * z1) * r2 + (x0 * x2 + y0 * y2 + z0 * z2) * r1 + (x1 * x2 + y1 * y2 + z1 * z2) * r0;
      const om = 2 * atan2(det, den), h = x0 * nx + y0 * ny + z0 * nz;
      // barycentric coordinates of the projection (grad lambda in-plane, so the normal offset drops out)
      const g0 = to + 4, l1 = D[g0 + 3] * x0 + D[g0 + 4] * y0 + D[g0 + 5] * z0, l2 = D[g0 + 6] * x0 + D[g0 + 7] * y0 + D[g0 + 8] * z0, l0 = 1 - l1 - l2;
      let p0 = 0, p1 = 0, p2 = 0, q00 = 0, q11 = 0, q22 = 0, q01 = 0, q12 = 0, q20 = 0, dL = 0;
      for (let q = 0; q < 3; q++) {
        const eo = to + 13 + 9 * q, ts = 9 * t + 3 * q, s = TS[ts], e = TS[ts + 1], L = TQL[TS[ts + 2]];
        const d = -(TQR[3 * s] * D[eo] + TQR[3 * s + 1] * D[eo + 1] + TQR[3 * s + 2] * D[eo + 2]), dr = TQr[e] - TQr[s], dl = d * L;
        const a0 = D[eo + 3], a1 = D[eo + 4], a2 = D[eo + 5], b0 = D[eo + 6], b1 = D[eo + 7], b2 = D[eo + 8], hr = 0.5 * dr;
        p0 -= b0 * L; p1 -= b1 * L; p2 -= b2 * L; dL += dl;
        q00 += dl * a0 * a0 - dr * a0 * b0; q11 += dl * a1 * a1 - dr * a1 * b1; q22 += dl * a2 * a2 - dr * a2 * b2;
        q01 += dl * a0 * a1 - hr * (a0 * b1 + b0 * a1); q12 += dl * a1 * a2 - hr * (a1 * b2 + b1 * a2); q20 += dl * a2 * a0 - hr * (a2 * b0 + b2 * a0);
      }
      const ho = h * om, gg = to + 40;
      q00 -= ho * D[gg]; q11 -= ho * D[gg + 1]; q22 -= ho * D[gg + 2]; q01 -= ho * D[gg + 3]; q12 -= ho * D[gg + 4]; q20 -= ho * D[gg + 5];
      const st = dL - ho; src += st; svx += st * nx; svy += st * ny; svz += st * nz;
      const nd = to + 46;
      TQN[D[nd]] += l0 * (2 * l0 - 1) * om + h * (4 * l0 - 1) * p0 + 2 * h * q00;
      TQN[D[nd + 1]] += l1 * (2 * l1 - 1) * om + h * (4 * l1 - 1) * p1 + 2 * h * q11;
      TQN[D[nd + 2]] += l2 * (2 * l2 - 1) * om + h * (4 * l2 - 1) * p2 + 2 * h * q22;
      TQN[D[nd + 3]] += 4 * (l0 * l1 * om + h * (l0 * p1 + l1 * p0) + h * q01);
      TQN[D[nd + 4]] += 4 * (l1 * l2 * om + h * (l1 * p2 + l2 * p1) + h * q12);
      TQN[D[nd + 5]] += 4 * (l2 * l0 * om + h * (l2 * p0 + l0 * p2) + h * q20);
    }
    for (let q = 0; q < nN; q++) {
      const v = TQN[q] * INV4PI, no = o + TQ_NODE + 10 * q, slot = D[no];
      if (slot >= 0) c9[slot] += v; else for (let s = 0; s < 9; s++) c9[s] += v * D[no + 1 + s];
    }
    TQSV[0] = svx * INV4PI; TQSV[1] = svy * INV4PI; TQSV[2] = svz * INV4PI;
    return src * INV4PI;
  }
  // Far field: the span-quadratic expansion (zeroth and first moments about the centroid) for the nine values.
  function tensorQuadFar(D, o, dx, dy, dz, r2, c9) {
    const ir3 = 1 / (r2 * sqrt(r2)), ir5 = ir3 / r2, xx = dx * dx, yy = dy * dy, zz = dz * dz, xy = dx * dy, xz = dx * dz, yz = dy * dz;
    let f = o + TQ_FAR;
    for (let q = 0; q < 9; q++, f += 10) c9[q] += (D[f] * dx + D[f + 1] * dy + D[f + 2] * dz - D[f + 3]) * ir3 + (D[f + 4] * xx + D[f + 5] * yy + D[f + 6] * zz + D[f + 7] * xy + D[f + 8] * xz + D[f + 9] * yz) * ir5;
  }
  // Tensor basis on surface S from a topology: { n (panels, all tensor), nValues, refs: Int32Array(9 n) unified value ids
  // per panel slot (a + 3 b: a chordwise node 0 / 1/2 / 1, b spanwise), spanChains (cells: panel ids, knots: MK ids),
  // stationChains (cells: MK ids, knots: KK ids), stripChains (cells: panel ids, knots: KM ids), tipMean: null or
  // { id, from: MK ids }, wake meta }. Chains as chainSystem (h, start / end).
  // Basis construction scratch (module level: the panel loop below allocates nothing per panel). Points PT: the five
  // panel points (corners in split order, then the vertex mean M); NP: node parameters (s, t); NW: node slot weights
  // (9 per node) and NU the unit slot (or -1); per triangle: TQV (the three vertices), TGL (grad lambda_0..2), TU / TM
  // edge directions; the moment accumulators MOM (12 per slot), MM2 (9 per slot), MI2 (9).
  const TBC = new Float64Array(12), TBM = new Float64Array(3), TBX = new Float64Array(3), TBPT = new Float64Array(15), TBNP = new Float64Array(26), TBNW = new Float64Array(117), TBNU = new Int32Array(13);
  const TBQ = new Float64Array(9), TBN = new Float64Array(3), TBNN = new Float64Array(3), TBGL = new Float64Array(9), TBU = new Float64Array(3), TBMV = new Float64Array(3), TBTN = new Int32Array(6);
  const TBAR = new Float64Array(4), TBM3 = new Float64Array(81), TBI3 = new Float64Array(9), TBMOM = new Float64Array(108), TBM2 = new Float64Array(81), TBI2 = new Float64Array(9), TBCPW = new Float64Array(9), TBPH = new Float64Array(6), TBNB = new Float64Array(3), TBL = new Float64Array(3), TBMM = new Float64Array(3), TBF = new Float64Array(3);
  const TB_GP = Float64Array.from([1 / 3, 1 / 3, 1 / 3, 0.225, 0.059715871789770, 0.470142064105115, 0.470142064105115, 0.132394152788506, 0.470142064105115, 0.059715871789770, 0.470142064105115, 0.132394152788506,
    0.470142064105115, 0.470142064105115, 0.059715871789770, 0.132394152788506, 0.797426985353087, 0.101286507323456, 0.101286507323456, 0.125939180544827, 0.101286507323456, 0.797426985353087, 0.101286507323456, 0.125939180544827,
    0.101286507323456, 0.101286507323456, 0.797426985353087, 0.125939180544827]);
  // Dunavant's 12-point degree-6 rule (exact for the fourth moments of the quadratic shape functions)
  const TB_GP6 = (() => { const out = [], add = (a, b, c, w) => out.push(a, b, c, w);
    for (const [a, b, w] of [[0.501426509658179, 0.249286745170910, 0.116786275726379], [0.873821971016996, 0.063089014491502, 0.050844906370207]]) { add(a, b, b, w); add(b, a, b, w); add(b, b, a, w); }
    const [a, b, c, w] = [0.053145049844817, 0.310352451033784, 0.636502499121399, 0.082851075618374];
    add(a, b, c, w); add(a, c, b, w); add(b, a, c, w); add(b, c, a, w); add(c, a, b, w); add(c, b, a, w);
    return Float64Array.from(out); })();
  const TB_PRM = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1]), GPW = new Float64Array(9), GPX = new Float64Array(3), GPP = new Float64Array(6);
  // Gauss-Newton on the bilinear map of the corners in TBC (least squares on a warped panel): parameters of the point
  // (x, y, z) from (s, t), stored at NP[2 q], NP[2 q + 1].
  function tbPreimage(x, y, z, s, t, q) {
    const c = TBC;
    for (let it = 0; it < 30; it++) {
      let a11 = 0, a12 = 0, a22 = 0, r1 = 0, r2 = 0;
      for (let i = 0; i < 3; i++) {
        const X = i === 0 ? x : i === 1 ? y : z, c0 = c[i], c1 = c[3 + i], c2 = c[6 + i], c3 = c[9 + i];
        const B = (1 - s) * (1 - t) * c0 + s * (1 - t) * c1 + s * t * c2 + (1 - s) * t * c3 - X, bs = (1 - t) * (c1 - c0) + t * (c2 - c3), bt = (1 - s) * (c3 - c0) + s * (c2 - c1);
        a11 += bs * bs; a12 += bs * bt; a22 += bt * bt; r1 += bs * B; r2 += bt * B;
      }
      const dt = a11 * a22 - a12 * a12;
      if (!(dt > 0)) break;
      const ds = (a22 * r1 - a12 * r2) / dt, dtt = (a11 * r2 - a12 * r1) / dt; s -= ds; t -= dtt;
      if (absv(ds) + absv(dtt) < 1e-14) break;
    }
    TBNP[2 * q] = s; TBNP[2 * q + 1] = t;
  }
  // pre-image of the mid-point of points a and b of TBPT (indices), started at (s, t)
  function tbPreimageMid(a, b, s, t, q) { const P = TBPT; tbPreimage(0.5 * (P[3 * a] + P[3 * b]), 0.5 * (P[3 * a + 1] + P[3 * b + 1]), 0.5 * (P[3 * a + 2] + P[3 * b + 2]), s, t, q); }
  // node q at parameters (s, t): slot weights (biquadratic Lagrange) and unit slot
  const TBLA = new Float64Array(3), TBLB = new Float64Array(3);
  function tbNodeWeights(q) {
    lag3(TBNP[2 * q], TBLA); lag3(TBNP[2 * q + 1], TBLB);
    const w = 9 * q;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) TBNW[w + a + 3 * b] = TBLA[a] * TBLB[b];
    let unit = -1;
    for (let a = 0; a < 9; a++) {
      if (!(absv(TBNW[w + a] - 1) < 1e-13)) continue;
      let others = true; for (let b = 0; b < 9; b++) if (b !== a && !(absv(TBNW[w + b]) < 1e-13)) { others = false; break; }
      if (others) unit = a;
    }
    TBNU[q] = unit;
  }
  function tbSetNode(q, s, t) { TBNP[2 * q] = s; TBNP[2 * q + 1] = t; }
  function tbPmid(q, a, b) { TBNP[2 * q] = 0.5 * (TBNP[2 * a] + TBNP[2 * b]); TBNP[2 * q + 1] = 0.5 * (TBNP[2 * a + 1] + TBNP[2 * b + 1]); }
  // Far field of a NON-PLANAR panel, per triangle. Each triangle of the panel's split is planar, so it gets the planar
  // expansion of the panel's P2 shape functions restricted to it, about its own centroid in its own frame (normal n,
  // in-plane axes l, m), with the planar panels' graded zones measured in its own diameter. The moments are exact (the
  // degree-6 rule integrates quadratic x quartic exactly); no planar approximation of the warped panel is made. Store:
  // per far triangle j the centroid (TC, 3), frame (TN, 9: n, l, m), diameter (TD), area moments (TI, 13: area, I2 ll / mm
  // / lm, nine third and fourth moments) and the weights grouped by order (TW1 27, TW2 27, TW4 81; carrier-major, nine
  // slots per carrier, as farW1 / farW2 / farW4); per panel the first triangle (base) and the count (cnt, 0 = planar).
  function tbTriStore(n) {
    const cap = Math.max(16, 2 * n);
    return { n, count: 0, cap, base: new Int32Array(n), cnt: new Uint8Array(n), TC: new Float64Array(3 * cap), TN: new Float64Array(9 * cap), TD: new Float64Array(cap),
      TI: new Float64Array(13 * cap), TW1: new Float64Array(27 * cap), TW2: new Float64Array(27 * cap), TW4: new Float64Array(81 * cap) };
  }
  function tbTriAlloc(T) {
    if (T.count === T.cap) {
      const cap = 2 * T.cap, grow = (a, w) => { const b = new Float64Array(w * cap); b.set(a); return b; };
      T.TC = grow(T.TC, 3); T.TN = grow(T.TN, 9); T.TD = grow(T.TD, 1); T.TI = grow(T.TI, 13); T.TW1 = grow(T.TW1, 27); T.TW2 = grow(T.TW2, 27); T.TW4 = grow(T.TW4, 81); T.cap = cap;
    }
    return T.count++;
  }
  const TBTM = new Float64Array(9 * 15), TBTI = new Float64Array(13);
  function tbTriangleFar(S, k, o, mode, D, T) {
    const PT = TBPT, TV = TQ_TV[mode], hyp = Math.hypot;
    T.base[k] = T.count;
    for (let t = 0; t < TQ_NT[mode]; t++) {
      const to = o + TQ_TRI + TQ_TRISZ * t, area = TBAR[t];
      if (!D[to]) continue;
      const j = tbTriAlloc(T), i0 = 3 * TV[3 * t], i1 = 3 * TV[3 * t + 1], i2 = 3 * TV[3 * t + 2];
      const cx = (PT[i0] + PT[i1] + PT[i2]) / 3, cy = (PT[i0 + 1] + PT[i1 + 1] + PT[i2 + 1]) / 3, cz = (PT[i0 + 2] + PT[i1 + 2] + PT[i2 + 2]) / 3;
      const d01 = hyp(PT[i1] - PT[i0], PT[i1 + 1] - PT[i0 + 1], PT[i1 + 2] - PT[i0 + 2]), d12 = hyp(PT[i2] - PT[i1], PT[i2 + 1] - PT[i1 + 1], PT[i2 + 2] - PT[i1 + 2]), d20 = hyp(PT[i0] - PT[i2], PT[i0 + 1] - PT[i2 + 1], PT[i0 + 2] - PT[i2 + 2]);
      const nx = D[to + 1], ny = D[to + 2], nz = D[to + 3];
      // in-plane axis l: the panel's axis projected on the triangle's plane (else its first edge), m = n x l
      let lx = S.PL[3 * k], ly = S.PL[3 * k + 1], lz = S.PL[3 * k + 2], ln = lx * nx + ly * ny + lz * nz;
      lx -= ln * nx; ly -= ln * ny; lz -= ln * nz;
      let ll = hyp(lx, ly, lz);
      if (!(ll > 1e-6)) { lx = PT[i1] - PT[i0]; ly = PT[i1 + 1] - PT[i0 + 1]; lz = PT[i1 + 2] - PT[i0 + 2]; ll = hyp(lx, ly, lz); }
      lx /= ll; ly /= ll; lz /= ll;
      const mx = ny * lz - nz * ly, my = nz * lx - nx * lz, mz = nx * ly - ny * lx;
      T.TC[3 * j] = cx; T.TC[3 * j + 1] = cy; T.TC[3 * j + 2] = cz; T.TD[j] = Math.max(d01, d12, d20);
      const N = T.TN; N[9 * j] = nx; N[9 * j + 1] = ny; N[9 * j + 2] = nz; N[9 * j + 3] = lx; N[9 * j + 4] = ly; N[9 * j + 5] = lz; N[9 * j + 6] = mx; N[9 * j + 7] = my; N[9 * j + 8] = mz;
      // moments of the nine slots (per slot: w0, Fl, Fm, Mll, Mmm, Mlm, then the nine third / fourth in-plane moments)
      const M = TBTM, I = TBTI; M.fill(0); I.fill(0);
      const n0 = 9 * D[to + 46], n1 = 9 * D[to + 47], n2 = 9 * D[to + 48], n3 = 9 * D[to + 49], n4 = 9 * D[to + 50], n5 = 9 * D[to + 51];
      for (let g = 0; g < 12; g++) {
        const l0 = TB_GP6[4 * g], l1 = TB_GP6[4 * g + 1], l2 = TB_GP6[4 * g + 2], wa = TB_GP6[4 * g + 3] * area;
        const ex = l0 * PT[i0] + l1 * PT[i1] + l2 * PT[i2] - cx, ey = l0 * PT[i0 + 1] + l1 * PT[i1 + 1] + l2 * PT[i2 + 1] - cy, ez = l0 * PT[i0 + 2] + l1 * PT[i1 + 2] + l2 * PT[i2 + 2] - cz;
        const xi = ex * lx + ey * ly + ez * lz, eta = ex * mx + ey * my + ez * mz, x2 = xi * xi, y2 = eta * eta, xy = xi * eta;
        const x3 = x2 * xi, x2y = x2 * eta, xy2 = xi * y2, y3 = y2 * eta, x4 = x3 * xi, x3y = x3 * eta, x2y2 = x2y * eta, xy3 = xy2 * eta, y4 = y3 * eta;
        const p0 = l0 * (2 * l0 - 1), p1 = l1 * (2 * l1 - 1), p2 = l2 * (2 * l2 - 1), p3 = 4 * l0 * l1, p4 = 4 * l1 * l2, p5 = 4 * l2 * l0;
        for (let s = 0; s < 9; s++) {
          const wq = wa * (p0 * TBNW[n0 + s] + p1 * TBNW[n1 + s] + p2 * TBNW[n2 + s] + p3 * TBNW[n3 + s] + p4 * TBNW[n4 + s] + p5 * TBNW[n5 + s]), m = 15 * s;
          M[m] += wq; M[m + 1] += wq * xi; M[m + 2] += wq * eta; M[m + 3] += wq * x2; M[m + 4] += wq * y2; M[m + 5] += wq * xy;
          M[m + 6] += wq * x3; M[m + 7] += wq * x2y; M[m + 8] += wq * xy2; M[m + 9] += wq * y3; M[m + 10] += wq * x4; M[m + 11] += wq * x3y; M[m + 12] += wq * x2y2; M[m + 13] += wq * xy3; M[m + 14] += wq * y4;
        }
        I[1] += wa * x2; I[2] += wa * y2; I[3] += wa * xy; I[4] += wa * x3; I[5] += wa * x2y; I[6] += wa * xy2; I[7] += wa * y3; I[8] += wa * x4; I[9] += wa * x3y; I[10] += wa * x2y2; I[11] += wa * xy3; I[12] += wa * y4;
      }
      I[0] = area;
      for (let c = 0; c < 13; c++) T.TI[13 * j + c] = I[c];
      for (let s = 0; s < 9; s++) {
        const m = 15 * s;
        for (let c = 0; c < 3; c++) T.TW1[27 * j + 9 * c + s] = M[m + c] * INV4PI;
        for (let c = 0; c < 3; c++) T.TW2[27 * j + 9 * c + s] = M[m + 3 + c] * INV4PI;
        for (let c = 0; c < 9; c++) T.TW4[81 * j + 9 * c + s] = M[m + 6 + c] * INV4PI;
      }
    }
    T.cnt[k] = T.count - T.base[k];
  }
  // basis helpers (module level, so the per-panel construction allocates no closures)
  function tbCornerDist(a, b) { const C9 = TBC; return Math.hypot(C9[3 * a] - C9[3 * b], C9[3 * a + 1] - C9[3 * b + 1], C9[3 * a + 2] - C9[3 * b + 2]); }
  function tbGradDot(i, j) { const GL = TBGL; return GL[3 * i] * GL[3 * j] + GL[3 * i + 1] * GL[3 * j + 1] + GL[3 * i + 2] * GL[3 * j + 2]; }
  function tbQuadForm(M, mo, u, w) { let t = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) t += u[a] * M[mo + 3 * a + b] * w[b]; return t; }
  // Split rule exception: split[k] = 0 the rule of tbPanel (shorter diagonal / fan on a tie / fan of three on a collapsed
  // edge), 1 the OTHER diagonal, 2 the fan of four about the vertex mean. Where the closed trailing edge, or the
  // leading-edge line, meets the closed tip edge, the upper and lower corner panels of the last strip share three of
  // their four corners; the shorter-diagonal rule can give both the same triangle with opposite orientation: a
  // double-covered triangle of zero thickness (its vertices agree to round-off) that bounds no volume (the solid-angle
  // indicator of the surface is 0 on both sides of it, not -1 inside) and on which both panels' control points lie, under
  // two opposite doublet sheets. Both panels then take the other diagonal, which splits the corner wedge along its two
  // distinct inner corners; a coincidence that remained (none on the app's meshes) would give both panels the fan of four
  // about the vertex mean (no diagonal at all). Coincident: every vertex of one triangle within 1e-6 of the smaller of the
  // two panel diameters of a vertex of the other. Candidates by centroid x (sorted sweep).
  function tbSplitRule(S) {
    const n = S.count, V = S.PV, PD = S.PD, split = new Uint8Array(n), hyp = Math.hypot;
    let dMax = 0; for (let k = 0; k < n; k++) dMax = Math.max(dMax, PD[k]);
    const tolMax = 1e-6 * dMax;
    const coincident = () => {
      const own = [], X = [];
      for (let k = 0; k < n; k++) {
        if (split[k] === 2) continue;
        const o = 12 * k, cd = (a, b) => hyp(V[o + 3 * a] - V[o + 3 * b], V[o + 3 * a + 1] - V[o + 3 * b + 1], V[o + 3 * a + 2] - V[o + 3 * b + 2]);
        if (cd(2, 3) <= 1e-9 * PD[k]) continue; // mode 2
        const d02 = cd(2, 0), d13 = cd(3, 1); if (absv(d02 - d13) <= 1e-9 * Math.max(d02, d13)) continue; // mode 1
        const rot = (d13 < d02) !== (split[k] === 1) ? 1 : 0;
        for (let t = 0; t < 2; t++) { own.push(k); for (const q of t ? [0, 2, 3] : [0, 1, 2]) { const b = o + 3 * ((q + rot) % 4); X.push(V[b], V[b + 1], V[b + 2]); } }
      }
      const m = own.length, cx = new Float64Array(m), cy = new Float64Array(m), cz = new Float64Array(m), order = new Uint32Array(m), hit = new Set();
      for (let t = 0; t < m; t++) { const b = 9 * t; cx[t] = (X[b] + X[b + 3] + X[b + 6]) / 3; cy[t] = (X[b + 1] + X[b + 4] + X[b + 7]) / 3; cz[t] = (X[b + 2] + X[b + 5] + X[b + 8]) / 3; order[t] = t; }
      order.sort((a, b) => cx[a] - cx[b]);
      for (let a = 0; a < m; a++) {
        const p = order[a];
        for (let c = a + 1; c < m; c++) {
          const q = order[c]; if (cx[q] - cx[p] > tolMax) break;
          if (own[p] === own[q] || absv(cy[q] - cy[p]) > tolMax || absv(cz[q] - cz[p]) > tolMax) continue;
          const tol = 1e-6 * Math.min(PD[own[p]], PD[own[q]]);
          let all = true;
          for (let i = 0; i < 3 && all; i++) {
            let any = false; const u = 9 * p + 3 * i;
            for (let j = 0; j < 3 && !any; j++) { const w = 9 * q + 3 * j; any = hyp(X[u] - X[w], X[u + 1] - X[w + 1], X[u + 2] - X[w + 2]) <= tol; }
            all = any;
          }
          if (all) { hit.add(own[p]); hit.add(own[q]); }
        }
      }
      return hit;
    };
    const first = coincident(); for (const k of first) split[k] = 1;
    if (first.size) for (const k of coincident()) split[k] = 2;
    return split;
  }
  // One tensor panel's data (D at TQ_STRIDE k), its self source vector, fan normal and area, planarity flag and far-field
  // weights (the body of tensorQuadBasis's panel loop, as its own function so that it is compiled on its own).
  function tbPanel(S, k, D, selfSourceVec, fanVec, fanArea, planar, farN, farW, farI, farK, c9, T, split) {
    const hyp = Math.hypot, V = S.PV, PT = TBPT, C9 = TBC;
    const o = TQ_STRIDE * k, v = 12 * k;
    for (let q = 0; q < 12; q++) C9[q] = V[v + q];
    for (let i = 0; i < 3; i++) TBM[i] = 0.25 * (C9[i] + C9[3 + i] + C9[6 + i] + C9[9 + i]);
    const sc = S.PD[k], cl = tbCornerDist;
    const collapsed = cl(2, 3) <= 1e-9 * sc;
    if (cl(1, 0) <= 1e-9 * sc || cl(2, 1) <= 1e-9 * sc || cl(0, 3) <= 1e-9 * sc) throw new Error(`Tensor panel ${k}: only the v2 v3 edge may collapse (closed tip).`);
    const d02 = cl(2, 0), d13 = cl(3, 1), tie = absv(d02 - d13) <= 1e-9 * Math.max(d02, d13);
    // a tie uses the fan of four even on a planar panel: unlike a constant or span-quadratic doublet, the P2 doublet
    // depends on the diagonal, and a fixed diagonal is not invariant under the upper / lower mirror relabelling;
    // split[k] (tbSplitRule): 1 the other diagonal, 2 the fan of four (closed corners of the last strip)
    const sp = split[k], mode = collapsed ? 2 : tie || sp === 2 ? 1 : 0, rot = mode === 0 && (d13 < d02) !== (sp === 1) ? 1 : 0;
    // points and node parameters (exact pre-images except interior mid-points: Gauss-Newton)
    for (let q = 0; q < 4; q++) { const cq = mode === 0 ? (q + rot) % 4 : q; for (let i = 0; i < 3; i++) PT[3 * q + i] = C9[3 * cq + i]; }
    for (let i = 0; i < 3; i++) PT[12 + i] = TBM[i];
    let nN;
    if (mode === 0) {
      for (let q = 0; q < 4; q++) { const pq = (q + rot) % 4; tbSetNode(q, TB_PRM[2 * pq], TB_PRM[2 * pq + 1]); }
      tbPmid(4, 0, 1); tbPmid(5, 1, 2); tbPmid(6, 2, 3); tbPmid(7, 3, 0); tbPreimageMid(0, 2, 0.5, 0.5, 8); nN = 9;
    } else if (mode === 1) {
      for (let q = 0; q < 4; q++) tbSetNode(q, TB_PRM[2 * q], TB_PRM[2 * q + 1]);
      tbSetNode(4, 0.5, 0.5); tbPmid(5, 0, 1); tbPmid(6, 1, 2); tbPmid(7, 2, 3); tbPmid(8, 3, 0);
      for (let q = 0; q < 4; q++) tbPreimageMid(4, q, 0.5 * (0.5 + TB_PRM[2 * q]), 0.5 * (0.5 + TB_PRM[2 * q + 1]), 9 + q);
      nN = 13;
    } else {
      tbSetNode(0, 0, 0); tbSetNode(1, 1, 0); tbSetNode(2, 0.5, 1); tbSetNode(3, 0.5, 0.5); tbSetNode(4, 0.5, 0); tbSetNode(5, 1, 0.5); tbSetNode(6, 0, 0.5);
      tbPreimageMid(4, 0, 0.25, 0.25, 7); tbPreimageMid(4, 1, 0.75, 0.25, 8); tbPreimageMid(4, 2, 0.5, 0.75, 9); nN = 10;
    }
    D[o + 23] = mode;
    for (let q = 0; q < 15; q++) D[o + q] = PT[q];
    const ED = TQ_ED[mode], TV = TQ_TV[mode], TS = TQ_TS[mode], TN = TQ_TN[mode];
    for (let e = 0; e < TQ_NS[mode]; e++) { const a = 3 * ED[2 * e], b = 3 * ED[2 * e + 1]; D[o + 15 + e] = hyp(PT[b] - PT[a], PT[b + 1] - PT[a + 1], PT[b + 2] - PT[a + 2]); }
    for (let q = 0; q < nN; q++) tbNodeWeights(q);
    if (mode === 2) { tbSetNode(2, 0.5, 1); tbNodeWeights(2); TBNU[2] = 7; } // the tip point: slots 6, 7, 8 all refer to T
    for (let q = 0; q < nN; q++) { const no = o + TQ_NODE + 10 * q, u = TBNU[q]; D[no] = u; for (let s = 0; s < 9; s++) D[no + 1 + s] = u >= 0 ? 0 : TBNW[9 * q + s]; }
    const C0 = S.PC[3 * k], C1 = S.PC[3 * k + 1], C2 = S.PC[3 * k + 2], mom = TBMOM, m2 = TBM2, I2 = TBI2;
    mom.fill(0); m2.fill(0); I2.fill(0);
    let best = -Infinity, haveCp = false;
    for (let t = 0; t < 4; t++) TBAR[t] = 0;
    for (let t = 0; t < TQ_NT[mode]; t++) {
      const Q = TBQ, to = o + TQ_TRI + TQ_TRISZ * t;
      for (let i = 0; i < 3; i++) { const p = 3 * TV[3 * t + i]; Q[3 * i] = PT[p]; Q[3 * i + 1] = PT[p + 1]; Q[3 * i + 2] = PT[p + 2]; }
      const e1x = Q[3] - Q[0], e1y = Q[4] - Q[1], e1z = Q[5] - Q[2], e2x = Q[6] - Q[0], e2y = Q[7] - Q[1], e2z = Q[8] - Q[2];
      const Nx = e1y * e2z - e1z * e2y, Ny = e1z * e2x - e1x * e2z, Nz = e1x * e2y - e1y * e2x, twoA = hyp(Nx, Ny, Nz);
      if (!(twoA > 1e-14 * S.PD[k] * S.PD[k])) { D[to] = 0; continue; }
      D[to] = 1;
      const nx = Nx / twoA, ny = Ny / twoA, nz = Nz / twoA, area = 0.5 * twoA;
      TBAR[t] = area; fanArea[k] += area; fanVec[3 * k] += area * nx; fanVec[3 * k + 1] += area * ny; fanVec[3 * k + 2] += area * nz;
      D[to + 1] = nx; D[to + 2] = ny; D[to + 3] = nz;
      // grad lambda_i = n x (Q_i+2 - Q_i+1) / 2A (in-plane, pointing towards vertex i)
      const GL = TBGL;
      for (let i = 0; i < 3; i++) {
        const a = 3 * ((i + 2) % 3), b = 3 * ((i + 1) % 3), dx = Q[a] - Q[b], dy = Q[a + 1] - Q[b + 1], dz = Q[a + 2] - Q[b + 2];
        GL[3 * i] = (ny * dz - nz * dy) / twoA; GL[3 * i + 1] = (nz * dx - nx * dz) / twoA; GL[3 * i + 2] = (nx * dy - ny * dx) / twoA;
      }
      for (let q = 0; q < 9; q++) D[to + 4 + q] = GL[q];
      for (let q = 0; q < 3; q++) {
        const ts = 9 * t + 3 * q, a = 3 * TS[ts], b = 3 * TS[ts + 1], eo = to + 13 + 9 * q;
        const sx = PT[b] - PT[a], sy = PT[b + 1] - PT[a + 1], sz = PT[b + 2] - PT[a + 2], dl = hyp(sx, sy, sz);
        const ux = dl > 0 ? sx / dl : 0, uy = dl > 0 ? sy / dl : 0, uz = dl > 0 ? sz / dl : 0;
        const mx = uy * nz - uz * ny, my = uz * nx - ux * nz, mz = ux * ny - uy * nx;
        D[eo] = mx; D[eo + 1] = my; D[eo + 2] = mz;
        for (let i = 0; i < 3; i++) { D[eo + 3 + i] = GL[3 * i] * ux + GL[3 * i + 1] * uy + GL[3 * i + 2] * uz; D[eo + 6 + i] = GL[3 * i] * mx + GL[3 * i + 1] * my + GL[3 * i + 2] * mz; }
      }
      const gg = to + 40, dg = tbGradDot;
      D[gg] = dg(0, 0); D[gg + 1] = dg(1, 1); D[gg + 2] = dg(2, 2); D[gg + 3] = dg(0, 1); D[gg + 4] = dg(1, 2); D[gg + 5] = dg(2, 0);
      for (let q = 0; q < 6; q++) { TBTN[q] = TN[6 * t + q]; D[to + 46 + q] = TBTN[q]; }
      const ws = GPW, dX = GPX, ph = GPP;
      for (let g = 0; g < 7; g++) { // far-field moments, degree-5 rule (exact for quadratic x linear); no allocation
        const l0 = TB_GP[4 * g], l1 = TB_GP[4 * g + 1], l2 = TB_GP[4 * g + 2], w = TB_GP[4 * g + 3];
        dX[0] = l0 * Q[0] + l1 * Q[3] + l2 * Q[6] - C0; dX[1] = l0 * Q[1] + l1 * Q[4] + l2 * Q[7] - C1; dX[2] = l0 * Q[2] + l1 * Q[5] + l2 * Q[8] - C2;
        ph[0] = l0 * (2 * l0 - 1); ph[1] = l1 * (2 * l1 - 1); ph[2] = l2 * (2 * l2 - 1); ph[3] = 4 * l0 * l1; ph[4] = 4 * l1 * l2; ph[5] = 4 * l2 * l0;
        ws.fill(0); for (let q = 0; q < 6; q++) { const nw = 9 * TBTN[q], f = ph[q]; for (let s2 = 0; s2 < 9; s2++) ws[s2] += f * TBNW[nw + s2]; }
        for (let s2 = 0; s2 < 9; s2++) {
          const wq = w * area * ws[s2], fa = 12 * s2, fm = 9 * s2;
          mom[fa] += wq * nx; mom[fa + 1] += wq * ny; mom[fa + 2] += wq * nz;
          for (let a = 0; a < 3; a++) { const wn = wq * (a === 0 ? nx : a === 1 ? ny : nz), wd = wq * dX[a]; for (let b = 0; b < 3; b++) { mom[fa + 3 + 3 * a + b] += wn * dX[b]; m2[fm + 3 * a + b] += wd * dX[b]; } }
        }
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) I2[3 * a + b] += w * area * dX[a] * dX[b];
      }
      // the control point: the triangle that contains its projection best
      const cx = C0 - Q[0], cy = C1 - Q[1], cz = C2 - Q[2];
      const l1 = GL[3] * cx + GL[4] * cy + GL[5] * cz, l2 = GL[6] * cx + GL[7] * cy + GL[8] * cz, l0 = 1 - l1 - l2, inside = Math.min(l0, l1, l2);
      if (inside > best) {
        best = inside; haveCp = true;
        ph[0] = l0 * (2 * l0 - 1); ph[1] = l1 * (2 * l1 - 1); ph[2] = l2 * (2 * l2 - 1); ph[3] = 4 * l0 * l1; ph[4] = 4 * l1 * l2; ph[5] = 4 * l2 * l0;
        TBCPW.fill(0); for (let q = 0; q < 6; q++) { const nw = 9 * TBTN[q]; for (let s2 = 0; s2 < 9; s2++) TBCPW[s2] += ph[q] * TBNW[nw + s2]; }
      }
    }
    for (let s = 0; s < 9; s++) { // pack (see spanQuadFar)
      const f = o + TQ_FAR + 10 * s, a = 12 * s, b = a + 3;
      D[f] = mom[a] * INV4PI; D[f + 1] = mom[a + 1] * INV4PI; D[f + 2] = mom[a + 2] * INV4PI; D[f + 3] = (mom[b] + mom[b + 4] + mom[b + 8]) * INV4PI;
      D[f + 4] = 3 * mom[b] * INV4PI; D[f + 5] = 3 * mom[b + 4] * INV4PI; D[f + 6] = 3 * mom[b + 8] * INV4PI;
      D[f + 7] = 3 * (mom[b + 1] + mom[b + 3]) * INV4PI; D[f + 8] = 3 * (mom[b + 2] + mom[b + 6]) * INV4PI; D[f + 9] = 3 * (mom[b + 5] + mom[b + 7]) * INV4PI;
    }
    if (best < -1e-6 || !haveCp) throw new Error(`Tensor panel ${k}: the control point lies outside the panel's triangles.`);
    { // planar panel (every triangle normal within 1e-9 of the mean) -> carrier far field
      const A = hyp(fanVec[3 * k], fanVec[3 * k + 1], fanVec[3 * k + 2]), nb = TBNB; for (let i = 0; i < 3; i++) nb[i] = fanVec[3 * k + i] / A;
      let dev = 0; for (let t = 0; t < TQ_NT[mode]; t++) { const to = o + TQ_TRI + TQ_TRISZ * t; if (D[to]) dev = Math.max(dev, hyp(D[to + 1] - nb[0], D[to + 2] - nb[1], D[to + 3] - nb[2])); }
      const off = (C0 - PT[0]) * nb[0] + (C1 - PT[1]) * nb[1] + (C2 - PT[2]) * nb[2];
      if (dev <= 1e-9 && absv(off) <= 1e-9 * S.PD[k]) {
        planar[k] = 1;
        const l = TBL, mm = TBMM, F = TBF;
        for (let i = 0; i < 3; i++) l[i] = S.PL[3 * k + i];
        const ln = l[0] * nb[0] + l[1] * nb[1] + l[2] * nb[2];
        for (let i = 0; i < 3; i++) l[i] = l[i] - nb[i] * ln;
        const ll = hyp(l[0], l[1], l[2]); for (let i = 0; i < 3; i++) l[i] = l[i] / ll;
        mm[0] = nb[1] * l[2] - nb[2] * l[1]; mm[1] = nb[2] * l[0] - nb[0] * l[2]; mm[2] = nb[0] * l[1] - nb[1] * l[0];
        for (let i = 0; i < 3; i++) { farN[9 * k + i] = nb[i]; farN[9 * k + 3 + i] = l[i]; farN[9 * k + 6 + i] = mm[i]; }
        const q2 = tbQuadForm;
        // in-plane third and fourth moments: a second pass with the degree-6 rule (exact: quadratic x quartic)
        const m3 = TBM3, I3 = TBI3; m3.fill(0); I3.fill(0);
        for (let t = 0; t < TQ_NT[mode]; t++) {
          const to = o + TQ_TRI + TQ_TRISZ * t, area = TBAR[t];
          if (!D[to]) continue;
          const i0 = 3 * TV[3 * t], i1 = 3 * TV[3 * t + 1], i2 = 3 * TV[3 * t + 2];
          for (let g = 0; g < 12; g++) {
            const l0 = TB_GP6[4 * g], l1 = TB_GP6[4 * g + 1], l2 = TB_GP6[4 * g + 2], w = TB_GP6[4 * g + 3];
            const ex = l0 * PT[i0] + l1 * PT[i1] + l2 * PT[i2] - C0, ey = l0 * PT[i0 + 1] + l1 * PT[i1 + 1] + l2 * PT[i2 + 1] - C1, ez = l0 * PT[i0 + 2] + l1 * PT[i1 + 2] + l2 * PT[i2 + 2] - C2;
            const xi = ex * l[0] + ey * l[1] + ez * l[2], eta = ex * mm[0] + ey * mm[1] + ez * mm[2], x3 = xi * xi * xi, x2y = xi * xi * eta, xy2 = xi * eta * eta, y3 = eta * eta * eta;
            const x4 = x3 * xi, x3y = x3 * eta, x2y2 = x2y * eta, xy3 = xy2 * eta, y4 = y3 * eta;
            const p0 = l0 * (2 * l0 - 1), p1 = l1 * (2 * l1 - 1), p2 = l2 * (2 * l2 - 1), p3 = 4 * l0 * l1, p4 = 4 * l1 * l2, p5 = 4 * l2 * l0, wa = w * area;
            const n0 = 9 * D[to + 46], n1 = 9 * D[to + 47], n2 = 9 * D[to + 48], n3 = 9 * D[to + 49], n4 = 9 * D[to + 50], n5 = 9 * D[to + 51];
            for (let s2 = 0; s2 < 9; s2++) {
              const wq = wa * (p0 * TBNW[n0 + s2] + p1 * TBNW[n1 + s2] + p2 * TBNW[n2 + s2] + p3 * TBNW[n3 + s2] + p4 * TBNW[n4 + s2] + p5 * TBNW[n5 + s2]);
              const m = 9 * s2; m3[m] += wq * x3; m3[m + 1] += wq * x2y; m3[m + 2] += wq * xy2; m3[m + 3] += wq * y3;
              m3[m + 4] += wq * x4; m3[m + 5] += wq * x3y; m3[m + 6] += wq * x2y2; m3[m + 7] += wq * xy3; m3[m + 8] += wq * y4;
            }
            I3[0] += wa * x3; I3[1] += wa * x2y; I3[2] += wa * xy2; I3[3] += wa * y3; I3[4] += wa * x4; I3[5] += wa * x3y; I3[6] += wa * x2y2; I3[7] += wa * xy3; I3[8] += wa * y4;
          }
        }
        for (let s = 0; s < 9; s++) {
          const a = 12 * s, b = a + 3, w = 135 * k + s;
          for (let c = 0; c < 3; c++) F[c] = nb[0] * mom[b + c] + nb[1] * mom[b + 3 + c] + nb[2] * mom[b + 6 + c];
          farW[w] = (mom[a] * nb[0] + mom[a + 1] * nb[1] + mom[a + 2] * nb[2]) * INV4PI; farW[w + 9] = (F[0] * l[0] + F[1] * l[1] + F[2] * l[2]) * INV4PI; farW[w + 18] = (F[0] * mm[0] + F[1] * mm[1] + F[2] * mm[2]) * INV4PI;
          farW[w + 27] = q2(m2, 9 * s, l, l) * INV4PI; farW[w + 36] = q2(m2, 9 * s, mm, mm) * INV4PI; farW[w + 45] = q2(m2, 9 * s, l, mm) * INV4PI;
          for (let c = 0; c < 9; c++) farW[w + 54 + 9 * c] = m3[9 * s + c] * INV4PI;
        }
        farI[13 * k] = fanArea[k]; farI[13 * k + 1] = q2(I2, 0, l, l); farI[13 * k + 2] = q2(I2, 0, mm, mm); farI[13 * k + 3] = q2(I2, 0, l, mm);
        for (let c = 0; c < 9; c++) farI[13 * k + 4 + c] = I3[c];
      }
    }
    for (let s = 0; s < 9; s++) for (let c = 0; c < 10; c++) farK[90 * k + 9 * c + s] = D[o + TQ_FAR + 10 * s + c];
    if (!planar[k]) tbTriangleFar(S, k, o, mode, D, T);
    for (let s = 0; s < 9; s++) D[o + TQ_CPW + s] = TBCPW[s];
    c9.fill(0); tensorQuadNear(D, o, C0, C1, C2, c9); // source of the panel at its own control point (finite)
    selfSourceVec[3 * k] = TQSV[0]; selfSourceVec[3 * k + 1] = TQSV[1]; selfSourceVec[3 * k + 2] = TQSV[2];
  }
  function tensorQuadBasis(S, topo) {
    const n = S.count; if (topo.n !== n) throw new Error('Tensor basis: every panel must be a tensor panel.');
    const D = new Float64Array(TQ_STRIDE * n), selfSourceVec = new Float64Array(3 * n), fanVec = new Float64Array(3 * n), fanArea = new Float64Array(n);
    const c9 = new Float64Array(9), hyp = Math.hypot;
    // Far field of a PLANAR panel (normal n, in-plane axes l, m, centroid C; delta = X - C), expansion through the SECOND
    // moments of each value's shape function N_v: with R = P - C, Rn = R.n, Rl = R.l, Rm = R.m,
    //   phi_v = [w0 Rn / r^3 + 3 Rn (Fl Rl + Fm Rm) / r^5 + 1/2 Rn (15 (R.M2.R) / r^7 - 3 tr M2 / r^5)] / 4 pi,
    //   w0 = int N_v, Fl / Fm = int N_v delta_l / delta_m, M2 = int N_v delta delta^T (in-plane: ll, mm, lm),
    // collected per panel in six carriers; the source likewise: [A / r + 1/2 (3 R.I2.R / r^5 - tr I2 / r^3)] / 4 pi
    // (I2 the in-plane second moment of area). Third order adds, with the in-plane third moments m_ab = int N_v xi^a eta^b
    // (a + b = 3; xi = delta.l, eta = delta.m), Rn [(17.5 Rl^3 / r^9 - 7.5 Rl / r^7) m30 + (52.5 Rl^2 Rm / r^9 - 7.5 Rm / r^7) m21
    // + (52.5 Rl Rm^2 / r^9 - 7.5 Rl / r^7) m12 + (17.5 Rm^3 / r^9 - 7.5 Rm / r^7) m03] (from 1/6 d^3/d delta^3 of |R - delta|^-3)
    // and for the source (2.5 Rl^3 / r^7 - 1.5 Rl / r^5) I30 + (7.5 Rl^2 Rm / r^7 - 1.5 Rm / r^5) I21 + ... (of 1 / |R - delta|).
    // Fourth order (the n-th term of |R - delta|^-3 is |delta|^n P'_(n+1)(cos g) / r^(n+3), of 1 / |R - delta| |delta|^n
    // P_n(cos g) / r^(n+1)): Rn [39.375 (R.d)^4 / r^11 - 26.25 (R.d)^2 |d|^2 / r^9 + 1.875 |d|^4 / r^7] with the moments
    // m40, m31, m22, m13, m04, and for the source [35 (R.d)^4 / r^4 - 30 (R.d)^2 |d|^2 / r^2 + 3 |d|^4] / (8 r^5).
    // Per planar panel: fifteen carriers x nine values of weights (farW, carrier-major: 135 k + 9 c + q) and thirteen area
    // moments (farI); per warped panel the ten first-order terms carrier-major (farK: 90 k + 9 c + q). Zones: TQ_FF1/2/4.
    const planar = new Uint8Array(n), farN = new Float64Array(9 * n), farW = new Float64Array(135 * n), farI = new Float64Array(13 * n), farK = new Float64Array(90 * n);
    const T = tbTriStore(n), split = tbSplitRule(S);
    for (let k = 0; k < n; k++) tbPanel(S, k, D, selfSourceVec, fanVec, fanArea, planar, farN, farW, farI, farK, c9, T, split);
    // the planar weights again, grouped by expansion order so that a row reads only what its zone needs, contiguously:
    // carriers 0..2 (first order, 27 per panel), 3..5 (second, 27), 6..14 (fourth, 81)
    const farW1 = new Float64Array(27 * n), farW2 = new Float64Array(27 * n), farW4 = new Float64Array(81 * n);
    for (let k = 0; k < n; k++) for (let j = 0; j < 27; j++) { farW1[27 * k + j] = farW[135 * k + j]; farW2[27 * k + j] = farW[135 * k + 27 + j]; }
    for (let k = 0; k < n; k++) for (let j = 0; j < 81; j++) farW4[81 * k + j] = farW[135 * k + 54 + j];
    const sysOf = list => list.map(ch => ({ ...ch, sys: chainSystemT(ch) }));
    const spanChains = sysOf(topo.spanChains), stationChains = sysOf(topo.stationChains), stripChains = sysOf(topo.stripChains);
    return Object.freeze({ kind: 'tensor-quadratic', S, topo, data: D, stride: TQ_STRIDE, split, refs: topo.refs, nValues: topo.nValues, spanChains, stationChains, stripChains,
      tipMean: topo.tipMean, selfSourceVec, fanVec, fanArea, planar, farN, farW, farW1, farW2, farW4, farI, farK, scratchV: new Float64Array(topo.nValues), c9: new Float64Array(9),
      rowNear9: new Float64Array(9), rowFarC: new Float64Array(15 * n), rowFarK: new Float64Array(10 * n), rowOrder: new Uint8Array(n),
      rowFar15: new Float64Array(15), rowThr: new Float64Array(3 * n), rowThrFar2: Float64Array.of(NaN),
      tri: Object.freeze({ count: T.count, base: T.base, cnt: T.cnt, TC: T.TC.subarray(0, 3 * T.count), TN: T.TN.subarray(0, 9 * T.count), TD: T.TD.subarray(0, T.count),
        TI: T.TI.subarray(0, 13 * T.count), TW1: T.TW1.subarray(0, 27 * T.count), TW2: T.TW2.subarray(0, 27 * T.count), TW4: T.TW4.subarray(0, 81 * T.count) }),
      triThr: new Float64Array(3 * Math.max(1, T.count)), rowFarT: new Float64Array(60), rowOrdT: new Uint8Array(4), rowDistT: new Float64Array(16), rowCV: new Float64Array(9) });
  }
  // Forward map: every unified value from the panel unknowns mu.
  function chainForward(ch, src, dst) {
    const s = ch.sys, rhs = s.z;
    for (let k = 0; k < s.m; k++) { const cl = (k - 1 + s.N) % s.N; rhs[k] = (s.R0[k] ? s.R0[k] * src[ch.cells[cl]] : 0) + (s.R1[k] ? s.R1[k] * src[ch.cells[k % s.N]] : 0); }
    const x = s.solve(rhs); for (let k = 0; k < s.m; k++) dst[ch.knots[k]] = x[k];
  }
  // Transposed map: coefficients on the knots of a chain (in C, cleared) moved onto its cells (added in C). T is
  // symmetric, so (T^-1 R)^T c = R^T (T^-1 c): one solve with the precomputed factorization, then the R^T scatter.
  function chainTranspose(ch, C) {
    const s = ch.sys, z = s.z, m = s.m, N = s.N, kn = ch.knots, ce = ch.cells, lo = s.lo, ib = s.ib, cp = s.cp, R0 = s.R0, R1 = s.R1;
    z[0] = C[kn[0]] * ib[0]; C[kn[0]] = 0;
    for (let k = 1; k < m; k++) { const id = kn[k]; z[k] = (C[id] - lo[k] * z[k - 1]) * ib[k]; C[id] = 0; }
    for (let k = m - 2; k >= 0; k--) z[k] -= cp[k] * z[k + 1];
    if (s.cyclic) { const f = (z[0] + s.smf * z[m - 1]) * s.smg, sz = s.smz; for (let k = 0; k < m; k++) z[k] -= f * sz[k]; for (let k = 0; k < m; k++) { C[ce[(k - 1 + N) % N]] += R0[k] * z[k]; C[ce[k % N]] += R1[k] * z[k]; } return; }
    C[ce[0]] += R1[0] * z[0];
    for (let k = 1; k < N; k++) { C[ce[k - 1]] += R0[k] * z[k]; C[ce[k]] += R1[k] * z[k]; }
    C[ce[N - 1]] += R0[N] * z[N];
  }
  function tensorValues(B, mu) {
    const V = new Float64Array(B.nValues), n = B.topo.n;
    for (let k = 0; k < n; k++) V[k] = mu[k];
    for (const ch of B.spanChains) chainForward(ch, V, V);
    if (B.tipMean) { let s = 0; for (const id of B.tipMean.from) s += V[id]; V[B.tipMean.id] = s / B.tipMean.from.length; }
    for (const ch of B.stationChains) chainForward(ch, V, V);
    for (const ch of B.stripChains) chainForward(ch, V, V);
    return V;
  }
  // All coefficients collected on unified values (C) -> coefficients on the panel unknowns (C[0..n)).
  function tensorTranspose(B, C) {
    if (B.tipMean) { const f = B.tipMean.from, c = C[B.tipMean.id] / f.length; C[B.tipMean.id] = 0; for (const id of f) C[id] += c; }
    for (const ch of B.stationChains) chainTranspose(ch, C);
    for (const ch of B.stripChains) chainTranspose(ch, C);
    for (const ch of B.spanChains) chainTranspose(ch, C);
  }
  // Source of panel k at P (returned, scalar), source vector (TPV) and the doublet coefficients of its nine values
  // added to C at the panel's unified ids.
  const TPV = new Float64Array(3);
  function tensorPanel(B, S, k, px, py, pz, far2, C) {
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz, c9 = B.c9;
    c9.fill(0);
    let s;
    if (r2 > far2 * S.PD[k] * S.PD[k]) { const f = INV4PI / sqrt(r2); s = B.fanArea[k] * f; TPV[0] = B.fanVec[c] * f; TPV[1] = B.fanVec[c + 1] * f; TPV[2] = B.fanVec[c + 2] * f; tensorQuadFar(B.data, B.stride * k, dx, dy, dz, r2, c9); }
    else { s = tensorQuadNear(B.data, B.stride * k, px, py, pz, c9); TPV[0] = TQSV[0]; TPV[1] = TQSV[1]; TPV[2] = TQSV[2]; }
    const r = B.refs, o = 9 * k;
    for (let q = 0; q < 9; q++) { const id = r[o + q]; if (id >= 0) C[id] += c9[q]; }
    return s;
  }
  // Row of the panel matrix for the tensor basis (see addRow). Per panel the near-field coefficients of its nine values,
  // and the far-field kernel sums (real and image point together) are collected contiguously; each panel's nine
  // coefficients are formed once per row (planar panels from four carriers, others from the ten-term kernel) and moved
  // to the unified values, then the transposed spline maps move them onto the unknowns.
  // ord: expansion order of a planar panel (1, 2 or 4; ignored for a warped panel: first order)
  function farAccumulate(B, S, k, px, py, pz, ord = 2) {
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz, ir = 1 / sqrt(r2), ir2 = ir * ir, ir3 = ir * ir2, ir5 = ir3 * ir2;
    if (B.planar[k]) {
      const N = B.farN, o9 = 9 * k, rn = dx * N[o9] + dy * N[o9 + 1] + dz * N[o9 + 2], rl = dx * N[o9 + 3] + dy * N[o9 + 4] + dz * N[o9 + 5], rm = dx * N[o9 + 6] + dy * N[o9 + 7] + dz * N[o9 + 8];
      const f1 = 3 * rn * ir5, o = 15 * k, F = B.rowFarC, I = B.farI, oi = 13 * k;
      F[o] += rn * ir3; F[o + 1] += f1 * rl; F[o + 2] += f1 * rm;
      let ss = I[oi] * ir;
      if (ord >= 2) {
        const ir7 = ir5 * ir2, q0 = -1.5 * rn * ir5, q1 = 7.5 * rn * ir7, rl2 = rl * rl, rm2 = rm * rm;
        F[o + 3] += q0 + q1 * rl2; F[o + 4] += q0 + q1 * rm2; F[o + 5] += 2 * q1 * rl * rm;
        ss += 0.5 * (3 * (rl2 * I[oi + 1] + rm2 * I[oi + 2] + 2 * rl * rm * I[oi + 3]) * ir5 - (I[oi + 1] + I[oi + 2]) * ir3);
        if (ord >= 4) {
          const ir9 = ir7 * ir2, ir11 = ir9 * ir2, t1 = rn * ir9, t0 = 7.5 * rn * ir7, u = rn * ir11, v = rn * ir9, w = rn * ir7;
          F[o + 6] += 17.5 * t1 * rl2 * rl - t0 * rl; F[o + 7] += 52.5 * t1 * rl2 * rm - t0 * rm; F[o + 8] += 52.5 * t1 * rl * rm2 - t0 * rl; F[o + 9] += 17.5 * t1 * rm2 * rm - t0 * rm;
          F[o + 10] += 39.375 * u * rl2 * rl2 - 26.25 * v * rl2 + 1.875 * w; F[o + 11] += 157.5 * u * rl2 * rl * rm - 52.5 * v * rl * rm; F[o + 12] += 236.25 * u * rl2 * rm2 - 26.25 * v * (rl2 + rm2) + 3.75 * w;
          F[o + 13] += 157.5 * u * rl * rm2 * rm - 52.5 * v * rl * rm; F[o + 14] += 39.375 * u * rm2 * rm2 - 26.25 * v * rm2 + 1.875 * w;
          const a = 35 / 8 * ir9, b = 30 / 8 * ir7, e = 3 / 8 * ir5;
          ss += (2.5 * rl2 * rl * ir7 - 1.5 * rl * ir5) * I[oi + 4] + (7.5 * rl2 * rm * ir7 - 1.5 * rm * ir5) * I[oi + 5] + (7.5 * rl * rm2 * ir7 - 1.5 * rl * ir5) * I[oi + 6] + (2.5 * rm2 * rm * ir7 - 1.5 * rm * ir5) * I[oi + 7]
            + (a * rl2 * rl2 - b * rl2 + e) * I[oi + 8] + (4 * a * rl2 * rl * rm - 2 * b * rl * rm) * I[oi + 9] + (6 * a * rl2 * rm2 - b * (rl2 + rm2) + 2 * e) * I[oi + 10] + (4 * a * rl * rm2 * rm - 2 * b * rl * rm) * I[oi + 11] + (a * rm2 * rm2 - b * rm2 + e) * I[oi + 12];
        }
      }
      if (ord > B.rowOrder[k]) B.rowOrder[k] = ord;
      ss *= INV4PI; TPV[0] = N[o9] * ss; TPV[1] = N[o9 + 1] * ss; TPV[2] = N[o9 + 2] * ss;
      return;
    }
    const F = B.rowFarK, o = 10 * k; F[o] += dx * ir3; F[o + 1] += dy * ir3; F[o + 2] += dz * ir3; F[o + 3] -= ir3; F[o + 4] += dx * dx * ir5; F[o + 5] += dy * dy * ir5; F[o + 6] += dz * dz * ir5; F[o + 7] += dx * dy * ir5; F[o + 8] += dx * dz * ir5; F[o + 9] += dy * dz * ir5;
    const f = INV4PI * ir; TPV[0] = B.fanVec[c] * f; TPV[1] = B.fanVec[c + 1] * f; TPV[2] = B.fanVec[c + 2] * f;
  }
  // Zone thresholds for one farField value (squared distances: exact inside d3, fourth order inside d2, second inside
  // d1, first beyond), computed once per far2 and kept with the basis: per planar panel from its diameter (the same
  // products as before, so the same zones), per far triangle of a non-planar panel from the triangle's diameter.
  function rowThresholds(B, S, far2) {
    const T = B.rowThr;
    if (B.rowThrFar2[0] === far2) return T;
    const n = S.count, PD = S.PD, planar = B.planar;
    for (let k = 0; k < n; k++) { const pk = PD[k] * PD[k]; T[3 * k] = (planar[k] ? far2 * TQ_FF4 : far2) * pk; T[3 * k + 1] = far2 * TQ_FF2 * pk; T[3 * k + 2] = far2 * TQ_FF1 * pk; }
    const tri = B.tri, TT = B.triThr;
    for (let j = 0; j < tri.count; j++) { const pk = tri.TD[j] * tri.TD[j]; TT[3 * j] = far2 * TQ_FF4 * pk; TT[3 * j + 1] = far2 * TQ_FF2 * pk; TT[3 * j + 2] = far2 * TQ_FF1 * pk; }
    B.rowThrFar2[0] = far2;
    return T;
  }
  // A non-planar panel k (far triangles jb .. je - 1) at Q: exact (returns true, coefficients added to B.rowNear9) if Q is
  // inside the exact zone of any of its triangles, else (returns false) one graded planar expansion per triangle, its
  // carriers added to B.rowFarT (fifteen per triangle) and its order to B.rowOrdT; the source vector in TPV.
  // forceOrder (diagnostics only): every triangle expanded at that order, no exact zone.
  function triangleEval(B, k, jb, je, qx, qy, qz, forceOrder = 0) {
    const tri = B.tri, TT = B.triThr, TC = tri.TC, TN = tri.TN, TI = tri.TI, FT = B.rowFarT, OT = B.rowOrdT, RT = B.rowDistT;
    let inside = false;
    for (let j = jb, u = 0; j < je; j++, u += 4) {
      const ex = qx - TC[3 * j], ey = qy - TC[3 * j + 1], ez = qz - TC[3 * j + 2], e2 = ex * ex + ey * ey + ez * ez;
      RT[u] = ex; RT[u + 1] = ey; RT[u + 2] = ez; RT[u + 3] = e2;
      if (e2 <= TT[3 * j]) inside = true;
    }
    if (inside && !forceOrder) {
      const c9 = B.c9, N9 = B.rowNear9; c9.fill(0); tensorQuadNear(B.data, B.stride * k, qx, qy, qz, c9);
      for (let q = 0; q < 9; q++) N9[q] += c9[q];
      TPV[0] = TQSV[0]; TPV[1] = TQSV[1]; TPV[2] = TQSV[2];
      return true;
    }
    let tx = 0, ty = 0, tz = 0;
    for (let j = jb, u = 0; j < je; j++, u++) {
      const tn = 9 * j, ti = 13 * j, f = 15 * u, tnx = TN[tn], tny = TN[tn + 1], tnz = TN[tn + 2];
      const dx = RT[4 * u], dy = RT[4 * u + 1], dz = RT[4 * u + 2], r2 = RT[4 * u + 3];
      const ir = 1 / sqrt(r2), ir2 = ir * ir, ir3 = ir * ir2, ir5 = ir3 * ir2;
      const rn = dx * tnx + dy * tny + dz * tnz, rl = dx * TN[tn + 3] + dy * TN[tn + 4] + dz * TN[tn + 5], rm = dx * TN[tn + 6] + dy * TN[tn + 7] + dz * TN[tn + 8];
      const eo = forceOrder || (r2 > TT[3 * j + 2] ? 1 : r2 > TT[3 * j + 1] ? 2 : 4), g1 = 3 * rn * ir5;
      FT[f] += rn * ir3; FT[f + 1] += g1 * rl; FT[f + 2] += g1 * rm;
      let ss = TI[ti] * ir;
      if (eo >= 2) {
        const ir7 = ir5 * ir2, q0 = -1.5 * rn * ir5, q1 = 7.5 * rn * ir7, rl2 = rl * rl, rm2 = rm * rm;
        FT[f + 3] += q0 + q1 * rl2; FT[f + 4] += q0 + q1 * rm2; FT[f + 5] += 2 * q1 * rl * rm;
        ss += 0.5 * (3 * (rl2 * TI[ti + 1] + rm2 * TI[ti + 2] + 2 * rl * rm * TI[ti + 3]) * ir5 - (TI[ti + 1] + TI[ti + 2]) * ir3);
        if (eo >= 4) {
          const ir9 = ir7 * ir2, ir11 = ir9 * ir2, t1 = rn * ir9, t0 = 7.5 * rn * ir7, uu = rn * ir11, v = rn * ir9, w = rn * ir7;
          FT[f + 6] += 17.5 * t1 * rl2 * rl - t0 * rl; FT[f + 7] += 52.5 * t1 * rl2 * rm - t0 * rm; FT[f + 8] += 52.5 * t1 * rl * rm2 - t0 * rl; FT[f + 9] += 17.5 * t1 * rm2 * rm - t0 * rm;
          FT[f + 10] += 39.375 * uu * rl2 * rl2 - 26.25 * v * rl2 + 1.875 * w; FT[f + 11] += 157.5 * uu * rl2 * rl * rm - 52.5 * v * rl * rm; FT[f + 12] += 236.25 * uu * rl2 * rm2 - 26.25 * v * (rl2 + rm2) + 3.75 * w;
          FT[f + 13] += 157.5 * uu * rl * rm2 * rm - 52.5 * v * rl * rm; FT[f + 14] += 39.375 * uu * rm2 * rm2 - 26.25 * v * rm2 + 1.875 * w;
          const a = 35 / 8 * ir9, b = 30 / 8 * ir7, e = 3 / 8 * ir5;
          ss += (2.5 * rl2 * rl * ir7 - 1.5 * rl * ir5) * TI[ti + 4] + (7.5 * rl2 * rm * ir7 - 1.5 * rm * ir5) * TI[ti + 5] + (7.5 * rl * rm2 * ir7 - 1.5 * rl * ir5) * TI[ti + 6] + (2.5 * rm2 * rm * ir7 - 1.5 * rm * ir5) * TI[ti + 7]
            + (a * rl2 * rl2 - b * rl2 + e) * TI[ti + 8] + (4 * a * rl2 * rl * rm - 2 * b * rl * rm) * TI[ti + 9] + (6 * a * rl2 * rm2 - b * (rl2 + rm2) + 2 * e) * TI[ti + 10] + (4 * a * rl * rm2 * rm - 2 * b * rl * rm) * TI[ti + 11] + (a * rm2 * rm2 - b * rm2 + e) * TI[ti + 12];
        }
      }
      if (eo > OT[u]) OT[u] = eo;
      ss *= INV4PI; tx += tnx * ss; ty += tny * ss; tz += tnz * ss;
    }
    TPV[0] = tx; TPV[1] = ty; TPV[2] = tz;
    return false;
  }
  // The far triangles' carriers (B.rowFarT, orders B.rowOrdT; both cleared) moved to the nine coefficients CV of their panel:
  // per triangle, carriers in order (TW1 0..2, TW2 3..5, TW4 6..14).
  function triangleCoefficients(B, jb, je, CV) {
    const tri = B.tri, TW1 = tri.TW1, TW2 = tri.TW2, TW4 = tri.TW4, FT = B.rowFarT, OT = B.rowOrdT;
    let c0 = CV[0], c1 = CV[1], c2 = CV[2], c3 = CV[3], c4 = CV[4], c5 = CV[5], c6 = CV[6], c7 = CV[7], c8 = CV[8];
    for (let j = jb, u = 0; j < je; j++, u++) {
      const o = OT[u]; if (!o) continue;
      OT[u] = 0;
      const f = 15 * u, t = 27 * j, e0 = FT[f], e1 = FT[f + 1], e2 = FT[f + 2]; FT[f] = 0; FT[f + 1] = 0; FT[f + 2] = 0;
      c0 += TW1[t] * e0; c1 += TW1[t + 1] * e0; c2 += TW1[t + 2] * e0; c3 += TW1[t + 3] * e0; c4 += TW1[t + 4] * e0; c5 += TW1[t + 5] * e0; c6 += TW1[t + 6] * e0; c7 += TW1[t + 7] * e0; c8 += TW1[t + 8] * e0;
      c0 += TW1[t + 9] * e1; c1 += TW1[t + 10] * e1; c2 += TW1[t + 11] * e1; c3 += TW1[t + 12] * e1; c4 += TW1[t + 13] * e1; c5 += TW1[t + 14] * e1; c6 += TW1[t + 15] * e1; c7 += TW1[t + 16] * e1; c8 += TW1[t + 17] * e1;
      c0 += TW1[t + 18] * e2; c1 += TW1[t + 19] * e2; c2 += TW1[t + 20] * e2; c3 += TW1[t + 21] * e2; c4 += TW1[t + 22] * e2; c5 += TW1[t + 23] * e2; c6 += TW1[t + 24] * e2; c7 += TW1[t + 25] * e2; c8 += TW1[t + 26] * e2;
      if (o > 1) {
        for (let e = 3, t2 = t; e < 6; e++, t2 += 9) {
          const a = FT[f + e]; FT[f + e] = 0;
          c0 += TW2[t2] * a; c1 += TW2[t2 + 1] * a; c2 += TW2[t2 + 2] * a; c3 += TW2[t2 + 3] * a; c4 += TW2[t2 + 4] * a; c5 += TW2[t2 + 5] * a; c6 += TW2[t2 + 6] * a; c7 += TW2[t2 + 7] * a; c8 += TW2[t2 + 8] * a;
        }
        if (o > 2) for (let e = 6, t4 = 81 * j; e < 15; e++, t4 += 9) {
          const a = FT[f + e]; FT[f + e] = 0;
          c0 += TW4[t4] * a; c1 += TW4[t4 + 1] * a; c2 += TW4[t4 + 2] * a; c3 += TW4[t4 + 3] * a; c4 += TW4[t4 + 4] * a; c5 += TW4[t4 + 5] * a; c6 += TW4[t4 + 6] * a; c7 += TW4[t4 + 7] * a; c8 += TW4[t4 + 8] * a;
        }
      }
    }
    CV[0] = c0; CV[1] = c1; CV[2] = c2; CV[3] = c3; CV[4] = c4; CV[5] = c5; CV[6] = c6; CV[7] = c7; CV[8] = c8;
  }
  // The coefficients of up to four rows on the unified values. Lane l: the point P[3 l .. 3 l + 2], row self0 + l (its
  // own panel gets the interior limit; self0 = -1: a field point), coefficients added to C at CS * id + l (CS = 1 and
  // one lane: B.scratchV; CS = 4: four rows interleaved, transposed together by tensorTransposeL), source sums in
  // src[3 l .. 3 l + 2]. One pass over the panels; per panel the lanes in turn (so the panel's data and weights are
  // re-read from cache), each lane exactly as a single row: the real point and its mirror image are evaluated, then the
  // nine coefficients are formed and moved to the unified values.
  //  * planar panel: near (exact P2 kernel into N9) or one graded expansion about the panel centroid (carriers 0..2 in
  //    locals, 3..14 in F); the arithmetic is farAccumulate's, inlined in the same order (bit-identical to calling it);
  //  * non-planar panel: exact if the point is inside the exact zone of ANY of its triangles, else one graded planar
  //    expansion per triangle (carriers in FT, fifteen per triangle; orders in OT).
  // F, FT, OT and N9 are cleared after each use.
  function rowValuesTensor(B, W, S, P, self0, lanes, image, far2, C, CS, src) {
    const n = S.count, D = B.data, r = B.refs, N9 = B.rowNear9, F = B.rowFar15, c9 = B.c9, PC = S.PC, TH = rowThresholds(B, S, far2);
    const planar = B.planar, W1 = B.farW1, W2 = B.farW2, W4 = B.farW4, farK = B.farK, fan = B.fanVec, FN = B.farN, FI = B.farI, stride = B.stride, ssv = B.selfSourceVec, mirrors = image ? 2 : 1;
    const tri = B.tri, tbase = tri.base, tcnt = tri.cnt;
    for (let q = 0; q < 3 * lanes; q++) src[q] = 0;
    for (let k = 0; k < n; k++) {
      const c = 3 * k, pl = planar[k], d3 = TH[c], d2 = TH[c + 1], d1 = TH[c + 2], cx = PC[c], cy = PC[c + 1], cz = PC[c + 2], o9 = 9 * k;
      const a0 = CS * r[o9], a1 = CS * r[o9 + 1], a2 = CS * r[o9 + 2], a3 = CS * r[o9 + 3], a4 = CS * r[o9 + 4], a5 = CS * r[o9 + 5], a6 = CS * r[o9 + 6], a7 = CS * r[o9 + 7], a8 = CS * r[o9 + 8];
      // the planar frame (normal, in-plane axes) and area (zero for a non-planar panel, unused there); its far triangles
      const nx = FN[o9], ny = FN[o9 + 1], nz = FN[o9 + 2], lx = FN[o9 + 3], ly = FN[o9 + 4], lz = FN[o9 + 5], mx = FN[o9 + 6], my = FN[o9 + 7], mz = FN[o9 + 8], oi = 13 * k, area = FI[oi];
      const jb = tbase[k], je = jb + tcnt[k];
      for (let lane = 0; lane < lanes; lane++) {
        const px = P[3 * lane], py = P[3 * lane + 1], pz = P[3 * lane + 2], self = self0 < 0 ? -1 : self0 + lane;
        let near = false, ord = 0, triFar = false, warpedFar = false, sx = src[3 * lane], sy = src[3 * lane + 1], sz = src[3 * lane + 2];
        let f0 = 0, f1 = 0, f2 = 0; // planar panel: carriers 0..2 (the others in F)
        for (let m = 0; m < mirrors; m++) {
          let tx, ty, tz;
          if (m === 0 && k === self) {
            const o = stride * k + TQ_CPW; for (let q = 0; q < 9; q++) N9[q] -= 0.5 * D[o + q];
            near = true; tx = ssv[c]; ty = ssv[c + 1]; tz = ssv[c + 2];
          } else if (pl) {
            const qy = m ? -py : py, dx = px - cx, dy = qy - cy, dz = pz - cz, r2 = dx * dx + dy * dy + dz * dz;
            if (r2 > d3) {
              const ir = 1 / sqrt(r2), ir2 = ir * ir, ir3 = ir * ir2, ir5 = ir3 * ir2;
              const rn = dx * nx + dy * ny + dz * nz, rl = dx * lx + dy * ly + dz * lz, rm = dx * mx + dy * my + dz * mz;
              const eo = r2 > d1 ? 1 : r2 > d2 ? 2 : 4, g1 = 3 * rn * ir5;
              f0 += rn * ir3; f1 += g1 * rl; f2 += g1 * rm;
              let ss = area * ir;
              if (eo >= 2) {
                const ir7 = ir5 * ir2, q0 = -1.5 * rn * ir5, q1 = 7.5 * rn * ir7, rl2 = rl * rl, rm2 = rm * rm;
                F[3] += q0 + q1 * rl2; F[4] += q0 + q1 * rm2; F[5] += 2 * q1 * rl * rm;
                ss += 0.5 * (3 * (rl2 * FI[oi + 1] + rm2 * FI[oi + 2] + 2 * rl * rm * FI[oi + 3]) * ir5 - (FI[oi + 1] + FI[oi + 2]) * ir3);
                if (eo >= 4) {
                  const ir9 = ir7 * ir2, ir11 = ir9 * ir2, t1 = rn * ir9, t0 = 7.5 * rn * ir7, u = rn * ir11, v = rn * ir9, w = rn * ir7;
                  F[6] += 17.5 * t1 * rl2 * rl - t0 * rl; F[7] += 52.5 * t1 * rl2 * rm - t0 * rm; F[8] += 52.5 * t1 * rl * rm2 - t0 * rl; F[9] += 17.5 * t1 * rm2 * rm - t0 * rm;
                  F[10] += 39.375 * u * rl2 * rl2 - 26.25 * v * rl2 + 1.875 * w; F[11] += 157.5 * u * rl2 * rl * rm - 52.5 * v * rl * rm; F[12] += 236.25 * u * rl2 * rm2 - 26.25 * v * (rl2 + rm2) + 3.75 * w;
                  F[13] += 157.5 * u * rl * rm2 * rm - 52.5 * v * rl * rm; F[14] += 39.375 * u * rm2 * rm2 - 26.25 * v * rm2 + 1.875 * w;
                  const a = 35 / 8 * ir9, b = 30 / 8 * ir7, e = 3 / 8 * ir5;
                  ss += (2.5 * rl2 * rl * ir7 - 1.5 * rl * ir5) * FI[oi + 4] + (7.5 * rl2 * rm * ir7 - 1.5 * rm * ir5) * FI[oi + 5] + (7.5 * rl * rm2 * ir7 - 1.5 * rl * ir5) * FI[oi + 6] + (2.5 * rm2 * rm * ir7 - 1.5 * rm * ir5) * FI[oi + 7]
                    + (a * rl2 * rl2 - b * rl2 + e) * FI[oi + 8] + (4 * a * rl2 * rl * rm - 2 * b * rl * rm) * FI[oi + 9] + (6 * a * rl2 * rm2 - b * (rl2 + rm2) + 2 * e) * FI[oi + 10] + (4 * a * rl * rm2 * rm - 2 * b * rl * rm) * FI[oi + 11] + (a * rm2 * rm2 - b * rm2 + e) * FI[oi + 12];
                }
              }
              if (eo > ord) ord = eo;
              ss *= INV4PI; tx = nx * ss; ty = ny * ss; tz = nz * ss;
            } else {
              c9.fill(0); tensorQuadNear(D, stride * k, px, qy, pz, c9);
              for (let q = 0; q < 9; q++) N9[q] += c9[q];
              near = true; tx = TQSV[0]; ty = TQSV[1]; tz = TQSV[2];
            }
          } else { // non-planar panel: beyond 4 ff (24) diameters the first-order expansion about the centroid, else per triangle
            const qy = m ? -py : py, dx = px - cx, dy = qy - cy, dz = pz - cz, r2 = dx * dx + dy * dy + dz * dz;
            if (r2 > d1) {
              const ir = 1 / sqrt(r2), ir3 = ir * ir * ir, ir5 = ir3 * ir * ir;
              f0 += dx * ir3; f1 += dy * ir3; f2 += dz * ir3; F[3] -= ir3; F[4] += dx * dx * ir5; F[5] += dy * dy * ir5; F[6] += dz * dz * ir5; F[7] += dx * dy * ir5; F[8] += dx * dz * ir5; F[9] += dy * dz * ir5;
              warpedFar = true;
              const f = INV4PI * ir; tx = fan[c] * f; ty = fan[c + 1] * f; tz = fan[c + 2] * f;
            } else {
              if (triangleEval(B, k, jb, je, px, qy, pz)) near = true; else triFar = true;
              tx = TPV[0]; ty = TPV[1]; tz = TPV[2];
            }
          }
          sx += tx; if (m) sy -= ty; else sy += ty; sz += tz;
        }
        src[3 * lane] = sx; src[3 * lane + 1] = sy; src[3 * lane + 2] = sz;
        // nine coefficients of panel k -> unified values
        let c0, c1, c2, c3, c4, c5, c6, c7, c8;
        if (near) { c0 = N9[0]; c1 = N9[1]; c2 = N9[2]; c3 = N9[3]; c4 = N9[4]; c5 = N9[5]; c6 = N9[6]; c7 = N9[7]; c8 = N9[8]; for (let q = 0; q < 9; q++) N9[q] = 0; }
        else { c0 = 0; c1 = 0; c2 = 0; c3 = 0; c4 = 0; c5 = 0; c6 = 0; c7 = 0; c8 = 0; }
        // carrier-major weights, nine per carrier, carriers in order (W1 carriers 0..2, W2 3..5, W4 6..14)
        if (ord) {
          const t = 27 * k, e0 = f0, e1 = f1, e2 = f2;
          c0 += W1[t] * e0; c1 += W1[t + 1] * e0; c2 += W1[t + 2] * e0; c3 += W1[t + 3] * e0; c4 += W1[t + 4] * e0; c5 += W1[t + 5] * e0; c6 += W1[t + 6] * e0; c7 += W1[t + 7] * e0; c8 += W1[t + 8] * e0;
          c0 += W1[t + 9] * e1; c1 += W1[t + 10] * e1; c2 += W1[t + 11] * e1; c3 += W1[t + 12] * e1; c4 += W1[t + 13] * e1; c5 += W1[t + 14] * e1; c6 += W1[t + 15] * e1; c7 += W1[t + 16] * e1; c8 += W1[t + 17] * e1;
          c0 += W1[t + 18] * e2; c1 += W1[t + 19] * e2; c2 += W1[t + 20] * e2; c3 += W1[t + 21] * e2; c4 += W1[t + 22] * e2; c5 += W1[t + 23] * e2; c6 += W1[t + 24] * e2; c7 += W1[t + 25] * e2; c8 += W1[t + 26] * e2;
          if (ord > 1) {
            for (let e = 3, t2 = 27 * k; e < 6; e++, t2 += 9) {
              const a = F[e]; F[e] = 0;
              c0 += W2[t2] * a; c1 += W2[t2 + 1] * a; c2 += W2[t2 + 2] * a; c3 += W2[t2 + 3] * a; c4 += W2[t2 + 4] * a; c5 += W2[t2 + 5] * a; c6 += W2[t2 + 6] * a; c7 += W2[t2 + 7] * a; c8 += W2[t2 + 8] * a;
            }
            if (ord > 2) for (let e = 6, t4 = 81 * k; e < 15; e++, t4 += 9) {
              const a = F[e]; F[e] = 0;
              c0 += W4[t4] * a; c1 += W4[t4 + 1] * a; c2 += W4[t4 + 2] * a; c3 += W4[t4 + 3] * a; c4 += W4[t4 + 4] * a; c5 += W4[t4 + 5] * a; c6 += W4[t4 + 6] * a; c7 += W4[t4 + 7] * a; c8 += W4[t4 + 8] * a;
            }
          }
        } else {
          if (warpedFar) { // non-planar panel, first order about the centroid: ten carriers (f0..f2, F[3..9])
            const t = 90 * k;
            c0 += farK[t] * f0; c1 += farK[t + 1] * f0; c2 += farK[t + 2] * f0; c3 += farK[t + 3] * f0; c4 += farK[t + 4] * f0; c5 += farK[t + 5] * f0; c6 += farK[t + 6] * f0; c7 += farK[t + 7] * f0; c8 += farK[t + 8] * f0;
            c0 += farK[t + 9] * f1; c1 += farK[t + 10] * f1; c2 += farK[t + 11] * f1; c3 += farK[t + 12] * f1; c4 += farK[t + 13] * f1; c5 += farK[t + 14] * f1; c6 += farK[t + 15] * f1; c7 += farK[t + 16] * f1; c8 += farK[t + 17] * f1;
            c0 += farK[t + 18] * f2; c1 += farK[t + 19] * f2; c2 += farK[t + 20] * f2; c3 += farK[t + 21] * f2; c4 += farK[t + 22] * f2; c5 += farK[t + 23] * f2; c6 += farK[t + 24] * f2; c7 += farK[t + 25] * f2; c8 += farK[t + 26] * f2;
            for (let e = 3, t3 = t + 27; e < 10; e++, t3 += 9) {
              const a = F[e]; F[e] = 0;
              c0 += farK[t3] * a; c1 += farK[t3 + 1] * a; c2 += farK[t3 + 2] * a; c3 += farK[t3 + 3] * a; c4 += farK[t3 + 4] * a; c5 += farK[t3 + 5] * a; c6 += farK[t3 + 6] * a; c7 += farK[t3 + 7] * a; c8 += farK[t3 + 8] * a;
            }
          }
          if (triFar) {
          const CV = B.rowCV; CV[0] = c0; CV[1] = c1; CV[2] = c2; CV[3] = c3; CV[4] = c4; CV[5] = c5; CV[6] = c6; CV[7] = c7; CV[8] = c8;
          triangleCoefficients(B, jb, je, CV);
          c0 = CV[0]; c1 = CV[1]; c2 = CV[2]; c3 = CV[3]; c4 = CV[4]; c5 = CV[5]; c6 = CV[6]; c7 = CV[7]; c8 = CV[8];
          }
        }
        C[a0 + lane] += c0; C[a1 + lane] += c1; C[a2 + lane] += c2; C[a3 + lane] += c3; C[a4 + lane] += c4; C[a5 + lane] += c5; C[a6 + lane] += c6; C[a7 + lane] += c7; C[a8 + lane] += c8;
      }
    }
    if (W) {
      const ux = W.dir[0], uy = W.dir[1], uz = W.dir[2];
      for (let lane = 0; lane < lanes; lane++) {
        const px = P[3 * lane], py = P[3 * lane + 1], pz = P[3 * lane + 2];
        for (let j = 0; j < W.count; j++) {
          const o = 3 * j, st = W.basis.strips[j];
          quadStrip(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3);
          if (image) { quadStrip(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3m); QS3[0] += QS3m[0]; QS3[1] += QS3m[1]; QS3[2] += QS3m[2]; }
          C[CS * st.aUp + lane] += QS3[0]; C[CS * st.aLo + lane] -= QS3[0]; C[CS * st.up + lane] += QS3[1]; C[CS * st.lo + lane] -= QS3[1]; C[CS * st.bUp + lane] += QS3[2]; C[CS * st.bLo + lane] -= QS3[2];
        }
      }
    }
  }
  // One row (B.scratchV is all zero between rows: the transposed maps clear every knot they read and the epilogue clears mu).
  const TRP = new Float64Array(3);
  function addRowTensor(B, W, S, px, py, pz, self, image, far2, target, offset, src) {
    const n = S.count, C = B.scratchV;
    TRP[0] = px; TRP[1] = py; TRP[2] = pz;
    rowValuesTensor(B, W, S, TRP, self, 1, image, far2, C, 1, src);
    tensorTranspose(B, C);
    for (let k = 0; k < n; k++) { target[offset + k] += C[k]; C[k] = 0; }
  }
  // tensorTranspose on 4 rows at once (C: the unified values with the 4 rows interleaved, value-major). Per row the
  // operations of chainTranspose in the same order; the 4 independent recurrences run side by side. Z: scratch of at
  // least 4 x the longest chain. (Eight rows were measured as well: no difference.)
  function chainTransposeL(ch, C, Z) {
    const s = ch.sys, m = s.m, N = s.N, kn = ch.knots, ce = ch.cells, lo = s.lo, ib = s.ib, cp = s.cp, R0 = s.R0, R1 = s.R1;
    let i = 4 * kn[0], b = ib[0];
    let z0 = C[i + 0] * b, z1 = C[i + 1] * b, z2 = C[i + 2] * b, z3 = C[i + 3] * b;
    C[i + 0] = 0; C[i + 1] = 0; C[i + 2] = 0; C[i + 3] = 0; Z[0] = z0; Z[1] = z1; Z[2] = z2; Z[3] = z3;
    for (let k = 1; k < m; k++) {
      const l = lo[k], o = 4 * k; i = 4 * kn[k]; b = ib[k];
      z0 = (C[i + 0] - l * z0) * b; z1 = (C[i + 1] - l * z1) * b; z2 = (C[i + 2] - l * z2) * b; z3 = (C[i + 3] - l * z3) * b;
      C[i + 0] = 0; C[i + 1] = 0; C[i + 2] = 0; C[i + 3] = 0; Z[o + 0] = z0; Z[o + 1] = z1; Z[o + 2] = z2; Z[o + 3] = z3;
    }
    for (let k = m - 2; k >= 0; k--) {
      const c = cp[k], o = 4 * k;
      z0 = Z[o + 0] - c * z0; z1 = Z[o + 1] - c * z1; z2 = Z[o + 2] - c * z2; z3 = Z[o + 3] - c * z3;
      Z[o + 0] = z0; Z[o + 1] = z1; Z[o + 2] = z2; Z[o + 3] = z3;
    }
    if (s.cyclic) {
      const sz = s.smz, smf = s.smf, smg = s.smg, e = 4 * (m - 1);
      const f0 = (Z[0] + smf * Z[e + 0]) * smg, f1 = (Z[1] + smf * Z[e + 1]) * smg, f2 = (Z[2] + smf * Z[e + 2]) * smg, f3 = (Z[3] + smf * Z[e + 3]) * smg;
      for (let k = 0; k < m; k++) { const o = 4 * k, q = sz[k]; Z[o + 0] -= f0 * q; Z[o + 1] -= f1 * q; Z[o + 2] -= f2 * q; Z[o + 3] -= f3 * q; }
      for (let k = 0; k < m; k++) {
        const o = 4 * k, a = 4 * ce[(k - 1 + N) % N], c = 4 * ce[k % N], r0 = R0[k], r1 = R1[k];
        C[a + 0] += r0 * Z[o + 0]; C[a + 1] += r0 * Z[o + 1]; C[a + 2] += r0 * Z[o + 2]; C[a + 3] += r0 * Z[o + 3];
        C[c + 0] += r1 * Z[o + 0]; C[c + 1] += r1 * Z[o + 1]; C[c + 2] += r1 * Z[o + 2]; C[c + 3] += r1 * Z[o + 3];
      }
      return;
    }
    { const c = 4 * ce[0], r1 = R1[0]; C[c + 0] += r1 * Z[0]; C[c + 1] += r1 * Z[1]; C[c + 2] += r1 * Z[2]; C[c + 3] += r1 * Z[3]; }
    for (let k = 1; k < N; k++) {
      const o = 4 * k, a = 4 * ce[k - 1], c = 4 * ce[k], r0 = R0[k], r1 = R1[k];
      C[a + 0] += r0 * Z[o + 0]; C[a + 1] += r0 * Z[o + 1]; C[a + 2] += r0 * Z[o + 2]; C[a + 3] += r0 * Z[o + 3];
      C[c + 0] += r1 * Z[o + 0]; C[c + 1] += r1 * Z[o + 1]; C[c + 2] += r1 * Z[o + 2]; C[c + 3] += r1 * Z[o + 3];
    }
    { const a = 4 * ce[N - 1], o = 4 * N, r0 = R0[N]; C[a + 0] += r0 * Z[o + 0]; C[a + 1] += r0 * Z[o + 1]; C[a + 2] += r0 * Z[o + 2]; C[a + 3] += r0 * Z[o + 3]; }
  }
  function tensorTransposeL(B, C, Z) {
    if (B.tipMean) {
      const f = B.tipMean.from, t = 4 * B.tipMean.id, F = f.length;
      for (let l = 0; l < 4; l++) { const c = C[t + l] / F; C[t + l] = 0; for (const id of f) C[4 * id + l] += c; }
    }
    for (const ch of B.stationChains) chainTransposeL(ch, C, Z);
    for (const ch of B.stripChains) chainTransposeL(ch, C, Z);
    for (const ch of B.spanChains) chainTransposeL(ch, C, Z);
  }
  // Topology of a wingMesh half-wing (rounded or closed tip; a flat cap is not supported by this model).
  function wingTensorTopology(S, wm) {
    const { ni, ns, index } = wm, n = S.count, nh = ni / 2, closed = !!wm.closedTip;
    if (wm.hasCap) throw new Error("The 'tensor-quadratic' doublet model needs a rounded or closed tip (no flat cap).");
    if (n !== ni * ns) throw new Error('Tensor topology: unexpected panel count.');
    const nMK = nh * (2 * ns + 1), nKM = (ni + 1) * ns, nKK = (ni + 1) * (ns + 1), oMK = n, oKM = oMK + nMK, oKK = oKM + nKM, T = closed ? oKK + nKK : -1, nValues = oKK + nKK + (closed ? 1 : 0);
    const mk = (i, j) => { const ch = i >= nh ? ni - 1 - i : i, base = oMK + ch * (2 * ns + 1); return i >= nh ? base + j : base + 2 * ns - j; };
    const km = (m, j) => oKM + m + (ni + 1) * j, kk = (m, j) => (closed && j === ns) ? T : oKK + m + (ni + 1) * j;
    const corner = (k, q) => [S.PV[12 * k + 3 * q], S.PV[12 * k + 3 * q + 1], S.PV[12 * k + 3 * q + 2]], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const refs = new Int32Array(9 * n);
    for (let j = 0; j < ns; j++) for (let i = 0; i < ni; i++) {
      const k = index(i, j), r = [kk(i, j), mk(i, j), kk(i + 1, j), km(i, j), k, km(i + 1, j), kk(i, j + 1), mk(i, j + 1), kk(i + 1, j + 1)];
      if (closed && j === ns - 1) { r[6] = T; r[7] = T; r[8] = T; }
      for (let q = 0; q < 9; q++) refs[9 * k + q] = r[q];
    }
    const spanChains = [];
    for (let c = 0; c < nh; c++) {
      const up = ni - 1 - c, cells = [], h = [], kn = [];
      for (let j = 0; j <= 2 * ns; j++) kn.push(oMK + c * (2 * ns + 1) + j);
      for (let j = 0; j < ns; j++) { cells.push(index(up, j)); h.push(wm.ys[j + 1] - wm.ys[j]); }
      for (let j = ns - 1; j >= 0; j--) { cells.push(index(c, j)); h.push(wm.ys[j + 1] - wm.ys[j]); }
      spanChains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'clamped', end: 'clamped' });
    }
    const stationChains = [];
    for (let j = 0; j <= (closed ? ns - 1 : ns); j++) {
      const cells = [], h = [], kn = [];
      for (let i = 0; i < ni; i++) {
        cells.push(mk(i, j));
        h.push(j < ns ? dist(corner(index(i, j), 1), corner(index(i, j), 0)) : dist(corner(index(i, ns - 1), 2), corner(index(i, ns - 1), 3)));
      }
      for (let m = 0; m <= ni; m++) kn.push(kk(m, j));
      // rounded tip: the folded tip loop is symmetric up to the geometry's own round-off (its section scale is 0 only to
      // ~1e-8), so its spacing is symmetrized: the two traces of every fold point then get the same knot value
      if (j === ns) for (let i = 0; i < nh; i++) { const hm = 0.5 * (h[i] + h[ni - 1 - i]); h[i] = hm; h[ni - 1 - i] = hm; }
      if (!h.every(x => x > 0)) throw new Error(`Tensor topology: station ${j} has a zero-length chordwise edge.`);
      stationChains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'natural', end: 'natural' });
    }
    const stripChains = [];
    for (let j = 0; j < ns; j++) {
      const cells = [], h = [], kn = [];
      for (let i = 0; i < ni; i++) { const k = index(i, j), c = [0, 1, 2, 3].map(q => corner(k, q)); cells.push(k); h.push(dist([0, 1, 2].map(x => 0.5 * (c[1][x] + c[2][x])), [0, 1, 2].map(x => 0.5 * (c[0][x] + c[3][x])))); }
      for (let m = 0; m <= ni; m++) kn.push(km(m, j));
      stripChains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'natural', end: 'natural' });
    }
    const tipMean = closed ? { id: T, from: Int32Array.from({ length: nh }, (_, c) => oMK + c * (2 * ns + 1) + ns) } : null;
    return { n, nValues, refs, spanChains, stationChains, stripChains, tipMean, ni, ns, oMK, oKM, oKK, T, closed, kk: null, km: null };
  }
  function wingTensorQuadBasis(S, wm) { return tensorQuadBasis(S, wingTensorTopology(S, wm)); }
  // Attached wake of a tensor body: strip j carries the quadratic through the jumps of the two trailing-edge traces
  // (KK(ni, j) - KK(0, j), KM(ni, j) - KM(0, j), KK(ni, j+1) - KK(0, j+1)), checks the trailing-edge panel corners.
  function tensorQuadWake(W, B, S, wm) {
    const m = W.count, strips = [], { ni, index } = wm, r = B.refs;
    let scale = 1; for (let j = 0; j < 3 * m; j++) scale = Math.max(scale, absv(W.a[j]), absv(W.b[j]));
    const at = (k, q, P, j) => { const v = 12 * k + 3 * q; if (Math.hypot(S.PV[v] - P[3 * j], S.PV[v + 1] - P[3 * j + 1], S.PV[v + 2] - P[3 * j + 2]) > 1e-9 * scale) throw new Error('Tensor wake: trailing-edge panel corners do not match the wake strip.'); };
    if (absv(W.dir[1]) > 1e-12) throw new Error('Tensor wake: the wake direction must lie in the x-z plane.');
    for (let j = 0; j < m; j++) {
      const up = index(ni - 1, j), lo = index(0, j);
      at(up, 1, W.a, j); at(up, 2, W.b, j); at(lo, 0, W.a, j); at(lo, 3, W.b, j);
      // upper panel: s = 1 edge (slots 2, 5, 8); lower panel: s = 0 edge (slots 0, 3, 6)
      strips.push({ up: r[9 * up + 5], lo: r[9 * lo + 3], aUp: r[9 * up + 2], aLo: r[9 * lo + 0], bUp: r[9 * up + 8], bLo: r[9 * lo + 6] });
    }
    return { kind: 'tensor-quadratic', strips };
  }
  // Surface velocity of the tensor model from the solved distribution itself (the jump relations of the sheet, as PANAIR
  // and MachLine recover the surface velocity). On each flat triangle T of a panel's split the doublet is the P2 polynomial
  // mu_T that the matrix and the field integrate (tensorQuadNear), the source is sigma_T = -V . n_T, and the interior
  // perturbation potential is zero (the collocation condition). Across the sheet (outside minus inside) [phi] = mu_T,
  // [grad_t phi] = grad_s mu_T and [d phi / dn] = sigma_T = -V . n_T, so the exterior limit of the total velocity is
  //   v(x) = V - (V . n_T) n_T + grad_s mu_T(x)   on T,
  // linear on T (grad_s mu_T = sum_m (d mu_T / d lambda_m) grad lambda_m, the in-plane barycentric gradients of T).
  // This is MachLine's panel_get_velocity with the Morino inner flow (and its forces / couples below its quadratic-
  // pressure, average-pressure and moment-about-centroid routines): test_wing_aero_machline_port.mjs applies a port of
  // those routines (validation/machline/) to the same distribution and reproduces the loads to round-off. No MachLine
  // code is used here.
  // tensorTriangles: the triangles of every panel (the split the matrix integrates): per triangle its panel, its index in
  // the panel's split, area, normal and vertices; per panel its first triangle (first[k] .. first[k + 1] - 1) and the
  // triangle containing the projection of the control point (chosen as tbPanel chooses it for the self term) with its
  // barycentric coordinates.
  function tensorTriangles(B, S) {
    const n = S.count, D = B.data;
    let count = 0;
    for (let k = 0; k < n; k++) { const o = B.stride * k, mode = D[o + 23]; for (let t = 0; t < TQ_NT[mode]; t++) if (D[o + TQ_TRI + TQ_TRISZ * t]) count++; }
    const first = new Int32Array(n + 1), panel = new Int32Array(count), tri = new Uint8Array(count), area = new Float64Array(count), N = new Float64Array(3 * count), X = new Float64Array(9 * count);
    const cpTri = new Int32Array(n), cpL = new Float64Array(3 * n);
    for (let k = 0, j = 0; k < n; k++) {
      const o = B.stride * k, mode = D[o + 23], TV = TQ_TV[mode], C0 = S.PC[3 * k], C1 = S.PC[3 * k + 1], C2 = S.PC[3 * k + 2];
      let best = -Infinity;
      first[k] = j;
      for (let t = 0; t < TQ_NT[mode]; t++) {
        const to = o + TQ_TRI + TQ_TRISZ * t;
        if (!D[to]) continue;
        panel[j] = k; tri[j] = t;
        for (let i = 0; i < 3; i++) { const p = o + 3 * TV[3 * t + i]; X[9 * j + 3 * i] = D[p]; X[9 * j + 3 * i + 1] = D[p + 1]; X[9 * j + 3 * i + 2] = D[p + 2]; }
        const x = 9 * j, ax = X[x + 3] - X[x], ay = X[x + 4] - X[x + 1], az = X[x + 5] - X[x + 2], bx = X[x + 6] - X[x], by = X[x + 7] - X[x + 1], bz = X[x + 8] - X[x + 2];
        area[j] = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
        N[3 * j] = D[to + 1]; N[3 * j + 1] = D[to + 2]; N[3 * j + 2] = D[to + 3];
        const cx = C0 - X[x], cy = C1 - X[x + 1], cz = C2 - X[x + 2];
        const l1 = D[to + 7] * cx + D[to + 8] * cy + D[to + 9] * cz, l2 = D[to + 10] * cx + D[to + 11] * cy + D[to + 12] * cz, l0 = 1 - l1 - l2, inside = Math.min(l0, l1, l2);
        if (inside > best) { best = inside; cpTri[k] = j; cpL[3 * k] = l0; cpL[3 * k + 1] = l1; cpL[3 * k + 2] = l2; }
        j++;
      }
      first[k + 1] = j;
    }
    return { n, count, first, panel, tri, area, N, X, cpTri, cpL };
  }
  // The velocity at the three vertices of every triangle of R (9 per triangle) for the unit solution mu, freestream Vinf.
  const TTV = new Float64Array(13);
  function tensorTriangleVelocity(B, S, R, mu, Vinf) {
    const V = tensorValues(B, mu), D = B.data, r = B.refs, out = new Float64Array(9 * R.count), nv = TTV;
    for (let k = 0; k < R.n; k++) {
      const o = B.stride * k, mode = D[o + 23];
      for (let q = 0; q < TQ_NN[mode]; q++) { // the panel's P2 node values (unit slot, or the slot weights of the node)
        const no = o + TQ_NODE + 10 * q, u = D[no];
        if (u >= 0) { const id = r[9 * k + u]; nv[q] = id >= 0 ? V[id] : 0; }
        else { let s = 0; for (let w = 0; w < 9; w++) { const id = r[9 * k + w]; if (id >= 0) s += D[no + 1 + w] * V[id]; } nv[q] = s; }
      }
      for (let j = R.first[k]; j < R.first[k + 1]; j++) {
        const to = o + TQ_TRI + TQ_TRISZ * R.tri[j], nd = to + 46, g = to + 4;
        const v0 = nv[D[nd]], v1 = nv[D[nd + 1]], v2 = nv[D[nd + 2]], v3 = nv[D[nd + 3]], v4 = nv[D[nd + 4]], v5 = nv[D[nd + 5]];
        const nx = D[to + 1], ny = D[to + 2], nz = D[to + 3], vn = Vinf[0] * nx + Vinf[1] * ny + Vinf[2] * nz;
        const tx = Vinf[0] - vn * nx, ty = Vinf[1] - vn * ny, tz = Vinf[2] - vn * nz;
        // d mu_T / d lambda_m at vertex i of the P2 Lagrange polynomial (vertex values v0..v2, mid-edge values v3 (01),
        // v4 (12), v5 (20)): vertex 0 (3 v0, 4 v3 - v1, 4 v5 - v2), vertex 1 (4 v3 - v0, 3 v1, 4 v4 - v2),
        // vertex 2 (4 v5 - v0, 4 v4 - v1, 3 v2)
        for (let i = 0; i < 3; i++) {
          const a = i === 0 ? 3 * v0 : i === 1 ? 4 * v3 - v0 : 4 * v5 - v0, b = i === 0 ? 4 * v3 - v1 : i === 1 ? 3 * v1 : 4 * v4 - v1, c = i === 0 ? 4 * v5 - v2 : i === 1 ? 4 * v4 - v2 : 3 * v2, q = 9 * j + 3 * i;
          out[q] = tx + a * D[g] + b * D[g + 3] + c * D[g + 6];
          out[q + 1] = ty + a * D[g + 1] + b * D[g + 4] + c * D[g + 7];
          out[q + 2] = tz + a * D[g + 2] + b * D[g + 5] + c * D[g + 8];
        }
      }
    }
    return out;
  }
  // per panel: the velocity at the projection of the control point in its triangle (3 per panel)
  function tensorControlPointVelocity(R, TVel) {
    const out = new Float64Array(3 * R.n);
    for (let k = 0; k < R.n; k++) { const q = 9 * R.cpTri[k], l0 = R.cpL[3 * k], l1 = R.cpL[3 * k + 1], l2 = R.cpL[3 * k + 2]; for (let c = 0; c < 3; c++) out[3 * k + c] = l0 * TVel[q + c] + l1 * TVel[q + 3 + c] + l2 * TVel[q + 6 + c]; }
    return out;
  }
  // Tangential velocity per panel from the analytic gradient of the panel's biquadratic at its parametric centre
  // (bilinear Jacobian of the corners): df/ds = f(1, 1/2) - f(0, 1/2), df/dt = f(1/2, 1) - f(1/2, 0). This is NOT the
  // gradient of the distribution the matrix integrates (the triangles' P2 polynomials interpolate the biquadratic at
  // their six nodes only, the vertex mean lies on a triangle edge, and the panel normal is not the triangles'): the
  // checkpoint-6 recovery, kept for comparison only (prepare uses tensorTriangleVelocity).
  function surfaceVelocityTensor(B, S, mu, Vinf) {
    const n = S.count, out = new Float64Array(3 * n), V = tensorValues(B, mu), r = B.refs, PV = S.PV;
    for (let k = 0; k < n; k++) {
      const fs = V[r[9 * k + 5]] - V[r[9 * k + 3]], ft = V[r[9 * k + 7]] - V[r[9 * k + 1]], v = 12 * k;
      const rs = [0, 1, 2].map(i => 0.5 * (PV[v + 3 + i] - PV[v + i] + PV[v + 6 + i] - PV[v + 9 + i])), rt = [0, 1, 2].map(i => 0.5 * (PV[v + 9 + i] - PV[v + i] + PV[v + 6 + i] - PV[v + 3 + i]));
      const a11 = rs[0] * rs[0] + rs[1] * rs[1] + rs[2] * rs[2], a12 = rs[0] * rt[0] + rs[1] * rt[1] + rs[2] * rt[2], a22 = rt[0] * rt[0] + rt[1] * rt[1] + rt[2] * rt[2], dt = a11 * a22 - a12 * a12;
      const a = (a22 * fs - a12 * ft) / dt, b = (a11 * ft - a12 * fs) / dt, nk = [S.PN[3 * k], S.PN[3 * k + 1], S.PN[3 * k + 2]];
      const g = [0, 1, 2].map(i => a * rs[i] + b * rt[i]), gn = g[0] * nk[0] + g[1] * nk[1] + g[2] * nk[2], vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
      for (let i = 0; i < 3; i++) out[3 * k + i] = Vinf[i] - vn * nk[i] + g[i] - gn * nk[i];
    }
    return out;
  }
  // The span-quadratic basis of a wingMesh half-wing: one chain per row pair (i, ni - 1 - i), from the root along row
  // ni - 1 - i to the tip and back along row i (sharing the tip knot: rounded fold or closed tip point), clamped (zero
  // slope) at both root ends; next to a flat cap, one chain per row, natural at the tip.
  function wingSpanQuadBasis(S, wm) {
    const { ni, ns, index, ys } = wm, n = S.count, kL = new Int32Array(n).fill(-1), kR = new Int32Array(n).fill(-1), chains = [];
    let knots = 0;
    const width = j => ys[j + 1] - ys[j];
    if (wm.hasCap) {
      for (let i = 0; i < ni; i++) {
        const cells = [], h = [], kn = [];
        for (let j = 0; j <= ns; j++) kn.push(knots + j);
        for (let j = 0; j < ns; j++) { const k = index(i, j); cells.push(k); h.push(width(j)); kL[k] = knots + j; kR[k] = knots + j + 1; }
        knots += ns + 1;
        chains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'clamped', end: 'natural' });
      }
    } else {
      for (let i = 0; i < ni / 2; i++) {
        const up = ni - 1 - i, cells = [], h = [], kn = [];
        for (let j = 0; j <= 2 * ns; j++) kn.push(knots + j);
        for (let j = 0; j < ns; j++) { const k = index(up, j); cells.push(k); h.push(width(j)); kL[k] = knots + j; kR[k] = knots + j + 1; }
        for (let j = ns - 1; j >= 0; j--) { const k = index(i, j); cells.push(k); h.push(width(j)); kR[k] = knots + 2 * ns - j - 1; kL[k] = knots + 2 * ns - j; }
        knots += 2 * ns + 1;
        chains.push({ cells: Int32Array.from(cells), h: Float64Array.from(h), knots: Int32Array.from(kn), start: 'clamped', end: 'clamped' });
      }
    }
    return spanQuadBasis(S, kL, kR, chains, knots);
  }
  // Attached wake of a span-quadratic body: strip j carries the quadratic strength through (jump of the trailing-edge
  // knots at a_j, Kutta jump of the mid-span unknowns, jump of the knots at b_j) = the difference of the two surface
  // traces, at every point of the trailing edge. Checks that the trailing-edge panel corners are the wake strip ends.
  function spanQuadWake(W, B, S) {
    const m = W.count, strips = [];
    let scale = 1; for (let j = 0; j < 3 * m; j++) scale = Math.max(scale, absv(W.a[j]), absv(W.b[j]));
    const at = (k, q, P, j) => { const v = 12 * k + 3 * q; if (Math.hypot(S.PV[v] - P[3 * j], S.PV[v + 1] - P[3 * j + 1], S.PV[v + 2] - P[3 * j + 2]) > 1e-9 * scale) throw new Error('Span-quadratic wake: trailing-edge panel corners do not match the wake strip.'); };
    if (absv(W.dir[1]) > 1e-12) throw new Error('Span-quadratic wake: the wake direction must lie in the x-z plane.');
    for (let j = 0; j < m; j++) {
      let up = -1, lo = -1;
      for (let q = 0; q < W.kuttaWidth; q++) { const c = W.kuttaWeights[j * W.kuttaWidth + q], p = W.kuttaPanels[j * W.kuttaWidth + q]; if (c === 1) up = p; else if (c === -1) lo = p; else if (c !== 0) throw new Error('Span-quadratic wake: Kutta weights must be +1 (upper) and -1 (lower).'); }
      if (up < 0 || lo < 0 || !B.quad[up] || !B.quad[lo]) throw new Error('Span-quadratic wake: both trailing-edge panels must be span-quadratic.');
      at(up, 1, W.a, j); at(up, 2, W.b, j); at(lo, 0, W.a, j); at(lo, 3, W.b, j); // upper TE edge v1v2, lower TE edge v0v3
      strips.push({ up, lo, aUp: B.kL[up], aLo: B.kL[lo], bUp: B.kR[up], bLo: B.kR[lo] });
    }
    return { kind: 'span-quadratic', strips };
  }
  // Wake strength: strip values gamma_j (Kutta jump of the unknowns, at the strip mid-point) and, for a basis, the
  // strength at the trailing-edge end points a_j (atA) and b_j (atB).
  function wakeStrengths(W, mu, B = null) {
    const m = W.count, gamma = new Float64Array(m);
    for (let j = 0; j < m; j++) { let g = 0; for (let q = 0; q < W.kuttaWidth; q++) g += W.kuttaWeights[j * W.kuttaWidth + q] * mu[W.kuttaPanels[j * W.kuttaWidth + q]]; gamma[j] = g; }
    if (!W.basis) return { gamma, atA: Float64Array.from(gamma), atB: Float64Array.from(gamma), model: 'constant' };
    if (!B) throw new Error('wakeStrengths: the span-quadratic wake needs the body basis.');
    if (W.basis.kind === 'tensor-quadratic') { // the jump of the two trailing-edge traces (gamma at the strip mid-point)
      const V = tensorValues(B, mu), st = W.basis.strips;
      return { gamma: Float64Array.from(st, s => V[s.up] - V[s.lo]), atA: Float64Array.from(st, s => V[s.aUp] - V[s.aLo]), atB: Float64Array.from(st, s => V[s.bUp] - V[s.bLo]), model: W.basis.kind };
    }
    const e = knotValues(B, mu), st = W.basis.strips;
    return { gamma, atA: Float64Array.from(st, s => e[s.aUp] - e[s.aLo]), atB: Float64Array.from(st, s => e[s.bUp] - e[s.bLo]), model: W.basis.kind };
  }
  // Source influence of panel k at P (returned); its doublet influence per value is added to M (mid-span unknowns) and E
  // (knots); constant panels add their solid angle to M[k] exactly as 0.3.1.
  function bodyPanel(B, S, k, px, py, pz, far2, M, E) {
    if (!B.quad[k]) { influence(S, k, px, py, pz, far2); M[k] += outD; BPV[0] = outS * S.PN[3 * k]; BPV[1] = outS * S.PN[3 * k + 1]; BPV[2] = outS * S.PN[3 * k + 2]; return outS; }
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz, c3 = B.c3;
    c3[0] = 0; c3[1] = 0; c3[2] = 0;
    let s;
    if (r2 > far2 * S.PD[k] * S.PD[k]) { const f = INV4PI / sqrt(r2); s = B.fanArea[k] * f; BPV[0] = B.fanVec[c] * f; BPV[1] = B.fanVec[c + 1] * f; BPV[2] = B.fanVec[c + 2] * f; spanQuadFar(B.data, B.stride * k, dx, dy, dz, r2, c3); }
    else { s = spanQuadNear(B.data, B.stride * k, px, py, pz, c3); BPV[0] = SQSV[0]; BPV[1] = SQSV[1]; BPV[2] = SQSV[2]; }
    E[B.kL[k]] += c3[0]; M[k] += c3[1]; E[B.kR[k]] += c3[2];
    return s;
  }
  const QS3 = new Float64Array(3), QS3m = new Float64Array(3);
  // One row of the panel matrix: adds to target[offset + p] the doublet influence (body and, when given, wake) at P and
  // at its mirror image (image) per unit panel unknown p, and stores in src the source-influence sums (src . V is the
  // potential of the sources of a unit freestream V). self: the panel whose control point P is (interior limit -1/2 of
  // the doublet value at the control point: Q_k(y_centroid) for a span-quadratic panel, mu_k for 0.3.1), or -1 for a
  // field point. assemble and fieldPotential both call this one function. B = null: the 0.3.1 constant row (the same
  // arithmetic as the 0.3.1 assembly loop) with the 0.3.1 / constant wake (addWakeRow).
  function addRow(B, W, S, px, py, pz, self, image, far2, target, offset, src) {
    if (B && B.kind === 'tensor-quadratic') return addRowTensor(B, W, S, px, py, pz, self, image, far2, target, offset, src);
    const n = S.count;
    let sx = 0, sy = 0, sz = 0;
    if (!B) {
      for (let k = 0; k < n; k++) {
        let s, d;
        if (k === self) { s = S.SELF[k]; d = -0.5; } else { influence(S, k, px, py, pz, far2); s = outS; d = outD; }
        let sMirror = 0;
        if (image) { influence(S, k, px, -py, pz, far2); d += outD; sMirror = outS; }
        target[offset + k] += d;
        const nx = S.PN[3 * k], ny = S.PN[3 * k + 1], nz = S.PN[3 * k + 2], st = s + sMirror;
        sx += st * nx; sz += st * nz; sy += (s - sMirror) * ny;
      }
      src[0] = sx; src[1] = sy; src[2] = sz;
      if (W) addWakeRow(W, px, py, pz, image, target, offset);
      return;
    }
    const M = B.scratchM, E = B.scratchE, D = B.data;
    M.fill(0); E.fill(0);
    for (let k = 0; k < n; k++) {
      let vx, vy, vz;
      if (k === self) {
        if (B.quad[k]) { const o = B.stride * k + SQ_CP; E[B.kL[k]] -= 0.5 * D[o]; M[k] -= 0.5 * D[o + 1]; E[B.kR[k]] -= 0.5 * D[o + 2]; vx = B.selfSourceVec[3 * k]; vy = B.selfSourceVec[3 * k + 1]; vz = B.selfSourceVec[3 * k + 2]; }
        else { M[k] -= 0.5; const s = S.SELF[k]; vx = s * S.PN[3 * k]; vy = s * S.PN[3 * k + 1]; vz = s * S.PN[3 * k + 2]; }
      } else { bodyPanel(B, S, k, px, py, pz, far2, M, E); vx = BPV[0]; vy = BPV[1]; vz = BPV[2]; }
      if (image) { bodyPanel(B, S, k, px, -py, pz, far2, M, E); vx += BPV[0]; vy -= BPV[1]; vz += BPV[2]; } // image triangles: normals (nx, -ny, nz)
      sx += vx; sy += vy; sz += vz;
    }
    if (W) {
      const ux = W.dir[0], uy = W.dir[1], uz = W.dir[2];
      for (let j = 0; j < W.count; j++) {
        const o = 3 * j, st = W.basis.strips[j];
        quadStrip(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3);
        if (image) { quadStrip(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], ux, uy, uz, W.b[o], W.b[o + 1], W.b[o + 2], QS3m); QS3[0] += QS3m[0]; QS3[1] += QS3m[1]; QS3[2] += QS3m[2]; }
        E[st.aUp] += QS3[0]; E[st.aLo] -= QS3[0]; M[st.up] += QS3[1]; M[st.lo] -= QS3[1]; E[st.bUp] += QS3[2]; E[st.bLo] -= QS3[2];
      }
    }
    for (let k = 0; k < n; k++) target[offset + k] += M[k];
    for (const ch of B.chains) { // knots -> panel unknowns: E . (T^-1 R mu) = (T^-1 E) . (R mu), T symmetric
      const s = ch.sys, z = s.z;
      let any = false; for (let k = 0; k < s.m; k++) { z[k] = E[ch.knots[k]]; if (z[k] !== 0) any = true; }
      if (!any) continue;
      s.solve(z);
      for (let k = 0; k < s.m; k++) { if (s.R0[k]) target[offset + ch.cells[(k - 1 + s.N) % s.N]] += s.R0[k] * z[k]; if (s.R1[k]) target[offset + ch.cells[k % s.N]] += s.R1[k] * z[k]; }
    }
    src[0] = sx; src[1] = sy; src[2] = sz;
  }
  // Perturbation potential per unit freestream at a field point P for one unit solution mu (freestream direction V):
  // the panel-matrix row a control point at P would receive (addRow, the same function), applied to mu, plus the source
  // part src . V. options: image (default true), farField (default DEFAULT_MESH.farField), self (default -1).
  function fieldPotential(S, body, wake, P, mu, V, options = {}) {
    const n = S.count, image = options.image !== false, ff = options.farField ?? DEFAULT_MESH.farField, far2 = ff === Infinity ? Infinity : ff * ff;
    const row = new Float64Array(n), src = new Float64Array(3);
    addRow(body || null, wake || null, S, P[0], P[1], P[2], options.self ?? -1, image, far2, row, 0, src);
    let phi = src[0] * V[0] + src[1] * V[1] + src[2] * V[2];
    for (let k = 0; k < n; k++) phi += row[k] * mu[k];
    return phi;
  }

  // ------------------------------------------------------------------ dense LU (partial pivoting)
  function luFactor(a, n) {
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k, best = absv(a[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = absv(a[i * n + k]); if (v > best) { best = v; p = i; } }
      if (!(best > 0)) throw new Error('The panel influence matrix is singular; check the mesh for duplicate or inverted panels.');
      piv[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; }
      const inv = 1 / a[k * n + k], rk = k * n;
      for (let i = k + 1; i < n; i++) {
        const ri = i * n, f = a[ri + k] * inv; a[ri + k] = f;
        if (f !== 0) for (let j = k + 1; j < n; j++) a[ri + j] -= f * a[rk + j];
      }
    }
    return piv;
  }
  function luSolve(a, n, piv, b) {
    const x = Float64Array.from(b);
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; } }
    for (let i = 1; i < n; i++) { let s = x[i]; const ri = i * n; for (let j = 0; j < i; j++) s -= a[ri + j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; const ri = i * n; for (let j = i + 1; j < n; j++) s -= a[ri + j] * x[j]; x[i] = s / a[ri + i]; }
    return x;
  }

  // ------------------------------------------------------------------ assembly and unit solutions
  // options: image (mirror about y = 0, symmetric flow), wake {count, ax..: TE points, dir, upper, lower},
  // farField (point-singularity approximation beyond farField panel diameters; Infinity = exact).
  // options.body: a span-quadratic basis (spanQuadBasis; its wake is options.wake with wake.basis); absent: the 0.3.1
  // constant-strength doublets and wake strips, assembled by the unchanged 0.3.1 loop below (bit-identical).
  function assemble(S, options = {}) {
    const n = S.count, image = !!options.image, far2 = (options.farField ?? DEFAULT_MESH.farField) ** 2;
    const bx = new Float64Array(n), by = new Float64Array(n), bz = new Float64Array(n);
    const W = options.wake || null;
    // the doublet model follows the wake: a wingMesh wake with a span-quadratic basis carries its body basis (wake.body)
    const B = basisFor(options.body || (W && W.basis ? W.body : null) || null, S);
    // options.work (a mesh sequence's scratch): the tensor rows overwrite every entry, so its matrix storage is reused
    // from mesh to mesh (no fresh 100 MB allocation per mesh); the other models get a new, zeroed matrix
    const work = B && B.kind === 'tensor-quadratic' ? options.work : null;
    let A;
    if (work && work.A && work.A.length >= n * n) A = work.A.subarray(0, n * n);
    else { A = new Float64Array(n * n); if (work) work.A = A; }
    if (B && B.kind === 'tensor-quadratic') { // four rows at a time: their transposed spline maps run side by side
      if (W && !W.basis) throw new Error('The tensor body needs its matched wake (wake.basis).');
      const LN = 4, src = new Float64Array(3 * LN), PL = new Float64Array(3 * LN), CL = new Float64Array(LN * B.nValues);
      let zmax = 0; for (const list of [B.spanChains, B.stationChains, B.stripChains]) for (const ch of list) zmax = Math.max(zmax, ch.sys.m);
      const Z = new Float64Array(LN * zmax);
      for (let i0 = 0; i0 < n; i0 += LN) {
        const lanes = Math.min(LN, n - i0);
        for (let q = 0; q < 3 * lanes; q++) PL[q] = S.PC[3 * i0 + q];
        rowValuesTensor(B, W, S, PL, i0, lanes, image, far2, CL, LN, src);
        for (let l = 0; l < lanes; l++) { bx[i0 + l] = src[3 * l]; by[i0 + l] = src[3 * l + 1]; bz[i0 + l] = src[3 * l + 2]; }
        tensorTransposeL(B, CL, Z);
        for (let l = 0; l < lanes; l++) { const row = (i0 + l) * n; for (let k = 0; k < n; k++) A[row + k] = CL[LN * k + l] + 0; } // + 0: as 0 + x (signed zeros)
        for (let k = 0; k < LN * n; k++) CL[k] = 0;
      }
      return { A, bx, by, bz };
    }
    if (B) {
      if (W && !W.basis) throw new Error('The span-quadratic body needs its matched wake (wake.basis).');
      const src = new Float64Array(3);
      for (let i = 0; i < n; i++) {
        addRow(B, W, S, S.PC[3 * i], S.PC[3 * i + 1], S.PC[3 * i + 2], i, image, far2, A, i * n, src);
        bx[i] = src[0]; by[i] = src[1]; bz[i] = src[2];
      }
      return { A, bx, by, bz };
    }
    for (let i = 0; i < n; i++) {
      const px = S.PC[3 * i], py = S.PC[3 * i + 1], pz = S.PC[3 * i + 2], row = i * n;
      let sx = 0, sy = 0, sz = 0;
      for (let k = 0; k < n; k++) {
        let s, d;
        if (k === i) { s = S.SELF[k]; d = -0.5; } else { influence(S, k, px, py, pz, far2); s = outS; d = outD; }
        let sMirror = 0;
        if (image) { influence(S, k, px, -py, pz, far2); d += outD; sMirror = outS; }
        A[row + k] = d;
        const nx = S.PN[3 * k], ny = S.PN[3 * k + 1], nz = S.PN[3 * k + 2], st = s + sMirror;
        sx += st * nx; sz += st * nz; sy += (s - sMirror) * ny;
      }
      bx[i] = sx; by[i] = sy; bz[i] = sz;
      if (W) for (let w = 0; w < W.count; w++) {
        const o = 3 * w;
        let d = semiInfiniteAngle(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
        if (image) d += semiInfiniteAngle(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
        d *= INV4PI; for (let q = 0; q < W.kuttaWidth; q++) { const c = W.kuttaWeights[w * W.kuttaWidth + q]; if (c) A[row + W.kuttaPanels[w * W.kuttaWidth + q]] += d * c; }
      }
    }
    return { A, bx, by, bz };
  }
  // Restarted GMRES (modified Gram-Schmidt, Givens rotations) with Jacobi (row-diagonal) scaling.
  // The internal-Dirichlet doublet system is a second-kind integral equation (diagonal near -1/2),
  // so Krylov iterations converge quickly; the caller verifies the true residual and falls back to LU.
  // Block-Jacobi preconditioner: LU of the diagonal blocks [start, size] (one spanwise strip each for
  // the wing, so the chordwise and Kutta coupling of a strip is inverted exactly).
  function blockPreconditioner(A, n, blocks) {
    const list = blocks && blocks.length ? blocks : Array.from({ length: n }, (_, i) => [i, 1]);
    const factors = list.map(([s, m]) => { const B = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) B[i * m + j] = A[(s + i) * n + s + j]; const piv = luFactor(B, m); return { s, m, B, piv }; });
    return (v, out) => { for (const f of factors) { const x = luSolve(f.B, f.m, f.piv, v.subarray(f.s, f.s + f.m)); out.set(x, f.s); } };
  }
  // In-place LU solve of x[o .. o + m) with the factors and pivots of luFactor, two partial sums per dot product (no
  // allocation; used inside the preconditioner, where the summation order is free).
  function luSolveAt2(a, m, piv, x, o) {
    for (let k = 0; k < m; k++) { const p = piv[k]; if (p !== k) { const t = x[o + k]; x[o + k] = x[o + p]; x[o + p] = t; } }
    for (let i = 1; i < m; i++) { const ri = i * m; let s0 = 0, s1 = 0, j = 0; for (; j + 1 < i; j += 2) { s0 += a[ri + j] * x[o + j]; s1 += a[ri + j + 1] * x[o + j + 1]; } if (j < i) s0 += a[ri + j] * x[o + j]; x[o + i] -= s0 + s1; }
    for (let i = m - 1; i >= 0; i--) { const ri = i * m; let s0 = 0, s1 = 0, j = i + 1; for (; j + 1 < m; j += 2) { s0 += a[ri + j] * x[o + j]; s1 += a[ri + j + 1] * x[o + j + 1]; } if (j < m) s0 += a[ri + j] * x[o + j]; x[o + i] = (x[o + i] - (s0 + s1)) / a[ri + i]; }
  }
  // Strip block symmetric Gauss-Seidel: M = (D + L) D^-1 (D + U), D the strip diagonal blocks of A (the block-Jacobi
  // factorizations), L / U the blocks coupling neighbouring strips (blocks given in span order). Applying M^-1:
  // forward w_j = D_j^-1 (v_j - A_j,j-1 w_j-1), backward z_j = w_j - D_j^-1 (A_j,j+1 z_j+1). Used for the tensor model:
  // on the course wing 32 x 16 the eigenvalues of M^-1 A lie in [0.41, 1.29] (block-Jacobi: [0.18, 1.69]) and GMRES
  // needs 14 - 15 iterations instead of 26 (32 x 48: 24 instead of 39 - 41).
  function blockSGSPreconditioner(A, n, blocks) {
    const nb = blocks.length, F = [], Lb = [], Ub = [];
    const copy = (s, m, c, w) => { const M = new Float64Array(m * w); for (let i = 0; i < m; i++) for (let q = 0; q < w; q++) M[i * w + q] = A[(s + i) * n + c + q]; return M; };
    for (let j = 0; j < nb; j++) {
      const [s, m] = blocks[j], B = copy(s, m, s, m);
      F.push({ s, m, B, piv: luFactor(B, m) });
      Lb.push(j > 0 ? copy(s, m, blocks[j - 1][0], blocks[j - 1][1]) : null); // A_j,j-1
      Ub.push(j + 1 < nb ? copy(s, m, blocks[j + 1][0], blocks[j + 1][1]) : null); // A_j,j+1
    }
    const t = new Float64Array(Math.max(...blocks.map(b => b[1])));
    return (v, out) => {
      for (let j = 0; j < nb; j++) { // forward: w_j = D_j^-1 (v_j - A_j,j-1 w_j-1)
        const f = F[j], s = f.s, m = f.m;
        if (j === 0) for (let i = 0; i < m; i++) out[s + i] = v[s + i];
        else {
          const L = Lb[j], ps = F[j - 1].s, pm = F[j - 1].m;
          for (let i = 0; i < m; i++) { const r = i * pm; let a0 = 0, a1 = 0, q = 0; for (; q + 1 < pm; q += 2) { a0 += L[r + q] * out[ps + q]; a1 += L[r + q + 1] * out[ps + q + 1]; } if (q < pm) a0 += L[r + q] * out[ps + q]; out[s + i] = v[s + i] - (a0 + a1); }
        }
        luSolveAt2(f.B, m, f.piv, out, s);
      }
      for (let j = nb - 2; j >= 0; j--) { // backward: z_j = w_j - D_j^-1 (A_j,j+1 z_j+1)
        const f = F[j], s = f.s, m = f.m, U = Ub[j], us = F[j + 1].s, um = F[j + 1].m;
        for (let i = 0; i < m; i++) { const r = i * um; let a0 = 0, a1 = 0, q = 0; for (; q + 1 < um; q += 2) { a0 += U[r + q] * out[us + q]; a1 += U[r + q + 1] * out[us + q + 1]; } if (q < um) a0 += U[r + q] * out[us + q]; t[i] = a0 + a1; }
        luSolveAt2(f.B, m, f.piv, t, 0);
        for (let i = 0; i < m; i++) out[s + i] -= t[i];
      }
    };
  }
  // Restarted GMRES(m) with left preconditioning, written as a step generator: it yields each vector to be multiplied
  // by A and receives A v back (unpreconditioned). gmresMany runs several right-hand sides in lockstep and forms their
  // products in ONE pass over A (the dense matrix is streamed once per step instead of once per right-hand side); each
  // product is summed in the same order as a single product, so every solution is bit-identical to a separate solve.
  function* gmresSteps(n, b, precond, tol, m, maxIter) {
    const pb = new Float64Array(n); precond(Float64Array.from(b), pb);
    const bn = Math.sqrt(pb.reduce((s, v) => s + v * v, 0)) || 1;
    const x = new Float64Array(n), r = new Float64Array(n), w = new Float64Array(n), V = Array.from({ length: m + 1 }, () => new Float64Array(n));
    const H = Array.from({ length: m + 1 }, () => new Float64Array(m)), cs = new Float64Array(m), sn = new Float64Array(m), gg = new Float64Array(m + 1);
    let it = 0, rel = Infinity;
    while (it < maxIter) {
      precond(yield x, r); for (let i = 0; i < n; i++) r[i] = pb[i] - r[i];
      const beta = Math.sqrt(r.reduce((s, v) => s + v * v, 0)); rel = beta / bn;
      if (rel <= tol) break;
      for (let i = 0; i < n; i++) V[0][i] = r[i] / beta;
      gg.fill(0); gg[0] = beta;
      let j = 0;
      for (; j < m && it < maxIter; j++, it++) {
        precond(yield V[j], w);
        for (let i = 0; i <= j; i++) { let h = 0; const vi = V[i]; for (let q = 0; q < n; q++) h += w[q] * vi[q]; H[i][j] = h; for (let q = 0; q < n; q++) w[q] -= h * vi[q]; }
        const hn = Math.sqrt(w.reduce((s, v) => s + v * v, 0)); H[j + 1][j] = hn;
        if (hn > 0) for (let q = 0; q < n; q++) V[j + 1][q] = w[q] / hn;
        for (let i = 0; i < j; i++) { const t = cs[i] * H[i][j] + sn[i] * H[i + 1][j]; H[i + 1][j] = -sn[i] * H[i][j] + cs[i] * H[i + 1][j]; H[i][j] = t; }
        const den = Math.hypot(H[j][j], H[j + 1][j]); cs[j] = H[j][j] / den; sn[j] = H[j + 1][j] / den;
        H[j][j] = den; H[j + 1][j] = 0; gg[j + 1] = -sn[j] * gg[j]; gg[j] = cs[j] * gg[j];
        rel = Math.abs(gg[j + 1]) / bn;
        if (rel <= tol || hn === 0) { j++; it++; break; }
      }
      const y = new Float64Array(j);
      for (let i = j - 1; i >= 0; i--) { let s = gg[i]; for (let k = i + 1; k < j; k++) s -= H[i][k] * y[k]; y[i] = s / H[i][i]; }
      for (let i = 0; i < j; i++) { const vi = V[i], yi = y[i]; for (let q = 0; q < n; q++) x[q] += yi * vi[q]; }
      if (rel <= tol) break;
    }
    return { x, iterations: it, preconditionedRelativeResidual: rel };
  }
  // out[c] = A v[c] for one or two vectors in one pass (per vector the summation order of a single product).
  function matVecMany(A, n, v, out) {
    if (v.length === 1) { const a = v[0], o = out[0]; for (let i = 0; i < n; i++) { let s = 0; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * a[k]; o[i] = s; } return; }
    for (let c = 0; c + 1 < v.length; c += 2) {
      const a = v[c], b = v[c + 1], oa = out[c], ob = out[c + 1];
      for (let i = 0; i < n; i++) { let s = 0, t = 0; const r = i * n; for (let k = 0; k < n; k++) { const e = A[r + k]; s += e * a[k]; t += e * b[k]; } oa[i] = s; ob[i] = t; }
    }
    if (v.length % 2) matVecMany(A, n, [v[v.length - 1]], [out[out.length - 1]]);
  }
  function gmresMany(A, n, bs, options = {}) {
    const tol = options.tol ?? 1e-12, m = Math.min(options.restart ?? 60, n), maxIter = options.maxIter ?? 400;
    const precond = options.precond || blockPreconditioner(A, n, options.blocks);
    const procs = bs.map(b => { const g = gmresSteps(n, b, precond, tol, m, maxIter); return { g, step: g.next(), tmp: new Float64Array(n) }; });
    for (;;) {
      const live = procs.filter(p => !p.step.done);
      if (!live.length) break;
      matVecMany(A, n, live.map(p => p.step.value), live.map(p => p.tmp));
      for (const p of live) p.step = p.g.next(p.tmp);
    }
    return procs.map(p => p.step.value);
  }
  function gmres(A, n, b, options = {}) { return gmresMany(A, n, [b], options)[0]; }
  // max_i |A x - b|_i / max |b| for one or more solutions (one pass over A; per solution the order of a single pass)
  function trueResiduals(A, n, xs, bs) {
    const k = xs.length, rmax = new Float64Array(k), bmax = new Float64Array(k);
    if (k === 2) {
      const x0 = xs[0], x1 = xs[1], b0 = bs[0], b1 = bs[1];
      for (let i = 0; i < n; i++) { let s0 = -b0[i], s1 = -b1[i]; const r = i * n; for (let q = 0; q < n; q++) { const e = A[r + q]; s0 += e * x0[q]; s1 += e * x1[q]; } rmax[0] = Math.max(rmax[0], Math.abs(s0)); rmax[1] = Math.max(rmax[1], Math.abs(s1)); bmax[0] = Math.max(bmax[0], Math.abs(b0[i])); bmax[1] = Math.max(bmax[1], Math.abs(b1[i])); }
      return [rmax[0] / Math.max(bmax[0], 1e-300), rmax[1] / Math.max(bmax[1], 1e-300)];
    }
    return xs.map((x, c) => trueResidual(A, n, x, bs[c]));
  }
  function trueResidual(A, n, x, b) {
    let rmax = 0, bmax = 0;
    for (let i = 0; i < n; i++) { let s = -b[i]; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * x[k]; rmax = Math.max(rmax, Math.abs(s)); bmax = Math.max(bmax, Math.abs(b[i])); }
    return rmax / Math.max(bmax, 1e-300);
  }
  // Solves for the doublet strengths of unit freestreams along x, z (and y without the image).
  // solver: 'auto' (LU up to luMaxPanels, GMRES above with LU fallback), 'lu' or 'gmres'. stripSweep: strip block
  // symmetric Gauss-Seidel instead of strip block-Jacobi (needs blocks).
  // Tensor model: dense LU only up to this many panels (LU costs 2/3 n^3: 0.3 s at 600 panels, against about 30 ms of
  // preconditioned GMRES); the 'constant' and 'span-quadratic' models keep 900 (0.3.1 and the earlier candidates).
  const TENSOR_LU_MAX = 300;
  function unitSolutions(S, options = {}) {
    const n = S.count, t0 = now(), sys = assemble(S, options), t1 = now();
    const rhs = [Float64Array.from(sys.bx, v => -v), Float64Array.from(sys.bz, v => -v), ...(options.image ? [] : [Float64Array.from(sys.by, v => -v)])];
    const mode = options.solver ?? 'auto', useGmres = mode === 'gmres' || (mode === 'auto' && n > (options.luMaxPanels ?? 900));
    let solutions = null, method = 'LU with partial pivoting', iterations = null, residual = 0;
    if (useGmres) {
      const sweep = !!(options.stripSweep && options.blocks && options.blocks.length > 1);
      const precond = (sweep ? blockSGSPreconditioner : blockPreconditioner)(sys.A, n, options.blocks);
      const out = gmresMany(sys.A, n, rhs, { ...options, precond }), res = trueResiduals(sys.A, n, out.map(o => o.x), rhs);
      if (res.every(r => r <= 1e-9)) { solutions = out.map(o => o.x); method = `restarted GMRES(60), ${options.blocks ? (sweep ? 'strip block symmetric Gauss-Seidel' : 'strip block-Jacobi') : 'Jacobi'} preconditioning`; iterations = out.map(o => o.iterations); residual = Math.max(...res); }
      else method = `LU fallback after GMRES residual ${Math.max(...res).toExponential(2)}`;
    }
    const t2 = now();
    if (!solutions) {
      const keep = n <= (options.keepMatrixPanels ?? LIMITS.keepMatrixPanels) ? Float64Array.from(sys.A) : null;
      const piv = luFactor(sys.A, n);
      solutions = rhs.map(b => luSolve(sys.A, n, piv, b));
      residual = keep ? Math.max(...solutions.map((x, i) => trueResidual(keep, n, x, rhs[i]))) : null;
    }
    const t3 = now();
    return { mux: solutions[0], muz: solutions[1], muy: options.image ? null : solutions[2], method, iterations,
      timing: { assembleMs: t1 - t0, solveMs: t3 - t1 }, relativeResidual: residual };
  }

  // ------------------------------------------------------------------ surface gradient
  // Lagrange derivative weights at s[t] through three parameter values s[0..2].
  function lagrange3(s0, s1, s2, t) {
    const st = [s0, s1, s2][t];
    return [((st - s1) + (st - s2)) / ((s0 - s1) * (s0 - s2)), ((st - s0) + (st - s2)) / ((s1 - s0) * (s1 - s2)), ((st - s0) + (st - s1)) / ((s2 - s0) * (s2 - s1))];
  }
  // Directional derivative and tangent along three points P[], values f[], at point index t.
  function lineDerivative(P, f, t) {
    if (P.length === 2) { const d = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; return { T: d.map(v => v / Math.sqrt(l2)), df: (f[1] - f[0]) / Math.sqrt(l2) }; }
    const d01 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]), d12 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1], P[2][2] - P[1][2]);
    const w = lagrange3(0, d01, d01 + d12, t);
    return { T: [0, 1, 2].map(c => w[0] * P[0][c] + w[1] * P[1][c] + w[2] * P[2][c]), df: w[0] * f[0] + w[1] * f[1] + w[2] * f[2] };
  }
  // Solve [T1; T2; n] g = [d1; d2; 0] for the tangential gradient g.
  function tangentialGradient(T1, d1, T2, d2, n) {
    const M = [T1, T2, n], r = [d1, d2, 0];
    const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det3(M);
    if (!(Math.abs(D) > 1e-14)) throw new Error('Degenerate surface-gradient stencil: two difference directions are parallel.');
    return [0, 1, 2].map(c => det3(M.map((row, i) => row.map((v, j) => (j === c ? r[i] : v)))) / D);
  }
  // Tangential velocity of each panel for a freestream V and doublet mu (perturbation potential).
  // Default 'unfolded' scheme: the three-point line derivatives of the previous scheme, taken on the SURFACE. Each
  // stencil neighbour's centroid is rotated into the plane of panel k about the edge(s) it shares with the chain
  // towards k (the surface is unfolded flat), so the line through the stencil lies in k's tangent plane and the
  // parameter is the surface distance. On a smooth, resolved surface this differs from the previous scheme only at
  // second order; where the surface folds back within a panel width (a thin leading edge; the flattened leading- and
  // trailing-edge parts of the rounded tip, where the section scale tau goes to zero; across the tip seam) the
  // straight chord between centroids was much shorter than the surface path and pointed nearly along the panel
  // normal, which inflated dmu/ds and made the 3 x 3 gradient system nearly singular.
  // Patch panels are the quads (i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1) of a structured grid: edge v3v0 / v1v2
  // is shared with neighbour i - 1 / i + 1, edge v0v1 / v2v3 with j - 1 / j + 1 (checked; otherwise 'legacy').
  // Boundaries: 'wrap', 'open' (one-sided), 'mirror' (y = 0 image) and, for the last row of a closed rounded tip,
  // jEnd 'seam': the surface continues across the tip edge onto the opposite panel seam(i) of the same row, which
  // shares that edge (no wake leaves the tip edge, so the doublet is continuous across it). The two stencil
  // directions stay as the grid gives them (oblique with sweep, dihedral and taper); nothing is orthogonalised.
  function surfaceVelocity(S, layout, mu, Vinf, options = {}) {
    if ((options.scheme ?? 'unfolded') === 'legacy') return surfaceVelocityLegacy(S, layout, mu, Vinf);
    const n = S.count, out = new Float64Array(3 * n), PV = S.PV, PN = S.PN, PC = S.PC;
    const vtx = (k, q) => [PV[12 * k + 3 * q], PV[12 * k + 3 * q + 1], PV[12 * k + 3 * q + 2]];
    const C = k => [PC[3 * k], PC[3 * k + 1], PC[3 * k + 2]], N = k => [PN[3 * k], PN[3 * k + 1], PN[3 * k + 2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // rotate X about the line (Ea, Eb) by the angle that turns plane normal nFrom into nTo
    const hinge = (X, Ea, Eb, nFrom, nTo) => {
      const d = sub(Eb, Ea), l = Math.sqrt(dot(d, d));
      if (!(l > 0)) return X;
      const e = [d[0] / l, d[1] / l, d[2] / l], ef = dot(e, nFrom), et = dot(e, nTo);
      const phi = Math.atan2(dot(e, crs(nFrom, nTo)), dot(nFrom, nTo) - ef * et), c = Math.cos(phi), s = Math.sin(phi);
      const v = sub(X, Ea), ev = dot(e, v), w = crs(e, v);
      return [0, 1, 2].map(q => Ea[q] + v[q] * c + w[q] * s + e[q] * ev * (1 - c));
    };
    const edge = (k, e) => [vtx(k, e), vtx(k, (e + 1) & 3)];
    const shares = (k, ek, m, em) => { const [a0, a1] = edge(k, ek), [b0, b1] = edge(m, em), tol = 1e-4 * (S.PD[k] + S.PD[m]);
      const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tol;
      return (near(a0, b1) && near(a1, b0)) || (near(a0, b0) && near(a1, b1)); };
    // centroid of m, unfolded into the plane of k across k's edge ek (m adjacent to k)
    const unfold1 = (k, ek, m, X = C(m), nm = N(m)) => { const [a, b] = edge(k, ek); return hinge(X, a, b, nm, N(k)); };
    const toPlane = (k, X) => { const nk = N(k), h = dot(sub(X, C(k)), nk); return [X[0] - h * nk[0], X[1] - h * nk[1], X[2] - h * nk[2]]; };
    for (const patch of layout.patches) {
      const { ni, nj, index } = patch;
      let structured = !patch.cross && ni >= 3 && nj >= 3;
      if (structured) for (let j = 0; j < nj && structured; j++) for (let i = 0; i < ni && structured; i++) {
        const k = index(i, j);
        if ((i < ni - 1 || patch.iMode === 'wrap') && !shares(k, 1, index((i + 1) % ni, j), 3)) structured = false;
        if (j < nj - 1 && !shares(k, 2, index(i, j + 1), 0)) structured = false;
        if (j === nj - 1 && patch.jEnd === 'seam' && !shares(k, 2, index(patch.seam(i), j), 2)) structured = false;
      }
      if (!structured) { // tip-cap row, tiny or unstructured patches: previous scheme
        const v = surfaceVelocityLegacy(S, { patches: [patch] }, mu, Vinf);
        for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const k = index(i, j); for (let c = 0; c < 3; c++) out[3 * k + c] = v[3 * k + c]; }
        continue;
      }
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const k = index(i, j), Ck = C(k), nk = N(k);
        // chordwise (i): neighbour i - 1 across k's edge 3, i + 1 across k's edge 1
        let P, f, t;
        if (patch.iMode === 'wrap' || (i > 0 && i < ni - 1)) {
          const a = index((i - 1 + ni) % ni, j), b = index((i + 1) % ni, j);
          P = [unfold1(k, 3, a), Ck, unfold1(k, 1, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (i === 0) { // one-sided: i + 2 unfolded into i + 1's plane, then both into k's
          const b = index(1, j), c = index(2, j), cb = unfold1(b, 1, c);
          P = [Ck, unfold1(k, 1, b), unfold1(k, 1, b, cb)]; f = [mu[k], mu[b], mu[c]]; t = 0;
        } else {
          const b = index(ni - 2, j), a = index(ni - 3, j), ab = unfold1(b, 3, a);
          P = [unfold1(k, 3, b, ab), unfold1(k, 3, b), Ck]; f = [mu[a], mu[b], mu[k]]; t = 2;
        }
        const di = lineDerivative(P.map(X => toPlane(k, X)), f, t);
        // spanwise (j): neighbour j - 1 across k's edge 0, j + 1 across k's edge 2
        if (j > 0 && j < nj - 1) {
          const a = index(i, j - 1), b = index(i, j + 1);
          P = [unfold1(k, 0, a), Ck, unfold1(k, 2, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (j === 0 && patch.jMode === 'mirror') { // image about y = 0 shares the root edge; same doublet
          const b = index(i, 1);
          P = [unfold1(k, 0, -1, [Ck[0], -Ck[1], Ck[2]], [nk[0], -nk[1], nk[2]]), Ck, unfold1(k, 2, b)]; f = [mu[k], mu[k], mu[b]]; t = 1;
        } else if (j === nj - 1 && patch.jEnd === 'seam') { // closed rounded tip: across the tip edge onto the other surface
          const a = index(i, j - 1), b = index(patch.seam(i), j);
          P = [unfold1(k, 0, a), Ck, unfold1(k, 2, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (j === 0) {
          const b = index(i, 1), c = index(i, 2), cb = unfold1(b, 2, c);
          P = [Ck, unfold1(k, 2, b), unfold1(k, 2, b, cb)]; f = [mu[k], mu[b], mu[c]]; t = 0;
        } else {
          const b = index(i, nj - 2), a = index(i, nj - 3), ab = unfold1(b, 0, a);
          P = [unfold1(k, 0, b, ab), unfold1(k, 0, b), Ck]; f = [mu[a], mu[b], mu[k]]; t = 2;
        }
        const dj = lineDerivative(P.map(X => toPlane(k, X)), f, t);
        const g = tangentialGradient(di.T, di.df, dj.T, dj.df, nk);
        const vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
        for (let c = 0; c < 3; c++) out[3 * k + c] = Vinf[c] - vn * nk[c] + g[c];
      }
    }
    return out;
  }
  function surfaceVelocityLegacy(S, layout, mu, Vinf) {
    const n = S.count, out = new Float64Array(3 * n), C = k => [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]];
    const nrm = k => [S.PN[3 * k], S.PN[3 * k + 1], S.PN[3 * k + 2]];
    const stencil = (len, idx, mode, pos, val, at) => {
      // returns {P, f, t} for index idx along a line of length len
      if (mode === 'wrap') return { P: [pos((idx - 1 + len) % len), pos(idx), pos((idx + 1) % len)], f: [val((idx - 1 + len) % len), val(idx), val((idx + 1) % len)], t: 1 };
      if (len === 1) return null;
      if (len === 2) return { P: [pos(0), pos(1)], f: [val(0), val(1)], t: idx };
      if (idx === 0 && mode === 'mirror') return { P: [at.mirrorPos(), pos(0), pos(1)], f: [val(0), val(0), val(1)], t: 1 };
      if (idx === 0) return { P: [pos(0), pos(1), pos(2)], f: [val(0), val(1), val(2)], t: 0 };
      if (idx === len - 1) return { P: [pos(len - 3), pos(len - 2), pos(len - 1)], f: [val(len - 3), val(len - 2), val(len - 1)], t: 2 };
      return { P: [pos(idx - 1), pos(idx), pos(idx + 1)], f: [val(idx - 1), val(idx), val(idx + 1)], t: 1 };
    };
    for (const patch of layout.patches) {
      const { ni, nj, index } = patch;
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const k = index(i, j), nk = nrm(k);
        const si = stencil(ni, i, patch.iMode, q => C(index(q, j)), q => mu[index(q, j)], {});
        const sj = stencil(nj, j, patch.jMode, q => C(index(i, q)), q => mu[index(i, q)], { mirrorPos: () => { const c = C(index(i, 0)); return [c[0], -c[1], c[2]]; } });
        let g;
        const a = lineDerivative(si.P, si.f, si.t);
        if (sj) { const b = lineDerivative(sj.P, sj.f, sj.t); g = tangentialGradient(a.T, a.df, b.T, b.df, nk); }
        else if (patch.cross) { const c = patch.cross(i, j); const P0 = C(c[0]), P1 = C(c[1]); const b = lineDerivative([P0, P1], [mu[c[0]], mu[c[1]]], 0); g = tangentialGradient(a.T, a.df, b.T, b.df, nk); }
        else throw new Error('A one-row patch needs a cross-direction rule.');
        const vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
        for (let c = 0; c < 3; c++) out[3 * k + c] = Vinf[c] - vn * nk[c] + g[c];
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ wing geometry adapter
  const GEOMETRY_KEYS = ['planform', 'semiSpan', 'rootChord', 'tipChord', 'sweepDeg', 'dihedralDeg', 'sweepReferenceFraction', 'twistReferenceFraction', 'twistEnabled', 'airfoil', 'naca', 'stations'];
  const GEOMETRY_DEFAULTS = Object.freeze({ naca: '2412', semiSpan: 450, rootChord: 160, tipChord: 100 }); // engine.js DEFAULT_GEOMETRY values
  // Accepts a WingEngine.makeGeometry result or a raw study geometry; keeps only the outer-surface fields.
  // Field names that look like geometry but are not Wing Lab names: refused, so a misspelling cannot
  // silently fall back to a default (a WingEngine.makeGeometry result never contains them).
  const MISNAMED = Object.freeze({ dihedral: 'dihedralDeg', sweep: 'sweepDeg', span: 'semiSpan (half span, mm)', semispan: 'semiSpan', chord: 'rootChord and tipChord',
    rootchord: 'rootChord', tipchord: 'tipChord', taper: 'tipChord', twist: 'stations[].incidenceDeg with twistEnabled', incidence: 'stations[].incidenceDeg',
    incidenceDeg: 'stations[].incidenceDeg', alpha: 'the flow field alphaDeg', alphaDeg: 'the flow field alphaDeg', aoa: 'the flow field alphaDeg', airfoilName: 'naca or airfoil' });
  const squash = k => String(k).toLowerCase().replace(/[^a-z]/g, '');
  const MISNAMED_SQUASHED = new Map([...Object.entries(MISNAMED).map(([k, v]) => [squash(k), v]),
    ...['sweepangle', 'sweepangledeg', 'dihedralangle', 'dihedralangledeg', 'twistdeg', 'twistangle', 'spanmm', 'halfspan', 'aspectratio'].map(k => [k, 'the Wing Lab geometry names (semiSpan, rootChord, tipChord, sweepDeg, dihedralDeg, stations)'])]);
  function aeroGeometry(raw = {}) {
    for (const k of Object.keys(raw || {})) {
      // refuse geometry-like names that are not Wing Lab names, including case and separator variants of
      // real names (dihedral_deg, SemiSpan), so a typing error cannot fall back silently to a default
      const sq = squash(k), real = GEOMETRY_KEYS.find(n => squash(n) === sq);
      if (real && real !== k) throw new Error(`Unknown geometry field "${k}": use ${real}.`);
      if (!real && MISNAMED_SQUASHED.has(sq)) throw new Error(`Unknown geometry field "${k}": use ${MISNAMED_SQUASHED.get(sq)}.`);
    }
    const g = { ...GEOMETRY_DEFAULTS };
    for (const k of GEOMETRY_KEYS) if (raw[k] !== undefined && raw[k] !== null) g[k] = raw[k];
    for (const k of ['semiSpan', 'rootChord']) finiteIn(g[k], k + ' (mm)', 1e-3, 1e6);
    finiteIn(g.tipChord, 'tipChord (mm)', 0, g.rootChord);
    Object.assign(g, Geometry.normalizeGeometryFields(g));
    if (!(g.tipChord > 0) && !Geometry.closedTip(g)) throw new Error('A zero tip chord is supported only for the exact elliptic or delta closed-tip planforms.');
    return Object.freeze(g);
  }
  // Canonical text of the outer aerodynamic shape (every field the panel mesh depends on). A stored aerodynamic load
  // belongs to the wing with the same key (the application keeps its SHA-256 with the load).
  // Defaults are written out, so equivalent descriptions of the same wing (a field omitted or set to its default) agree.
  function geometryKey(rawGeometry) {
    const g = aeroGeometry(rawGeometry), planform = g.planform ?? 'linear';
    return JSON.stringify({ planform, semiSpan: g.semiSpan, rootChord: g.rootChord, tipChord: g.tipChord, sweepDeg: g.sweepDeg ?? 0, dihedralDeg: g.dihedralDeg ?? 0,
      sweepReferenceFraction: g.sweepReferenceFraction ?? (planform === 'elliptic' ? 0.5 : planform === 'delta' ? 1 : 0), twistReferenceFraction: g.twistReferenceFraction ?? 0.25,
      sections: g.stations ? g.stations.map(st => [st.eta, st.airfoil, st.incidenceDeg]) : [g.airfoil ?? g.naca] });
  }
  function sectionLoop(g, y, nHalf) {
    const c = Geometry.chordAt(g, y);
    if (!(c > 1e-9 * g.rootChord)) return null; // exact closed tip: the station collapses to one point
    const s = Airfoils.surfaces(Geometry.airfoilAt(g, y), c, 0, nHalf + 1); // te = 0: sharp aerodynamic TE
    const pts = [];
    for (let i = 0; i <= nHalf; i++) pts.push([s.xl[nHalf - i], s.zl[nHalf - i]]);
    for (let i = 1; i <= nHalf; i++) pts.push([s.xu[i], s.zu[i]]);
    return pts;
  }
  function spanStations(g, nSpan, spacing) {
    const L = g.semiSpan, ys = [];
    for (let j = 0; j <= nSpan; j++) { const t = j / nSpan; ys.push(spacing === 'uniform' ? L * t : spacing === 'cosine' ? L * (1 - Math.cos(Math.PI * t)) / 2 : L * Math.sin(Math.PI * t / 2)); }
    ys[0] = 0; ys[nSpan] = L;
    for (const yb of (g.stations || []).map(s => s.eta * L).filter(y => y > 1e-9 * L && y < L * (1 - 1e-9))) {
      let k = 1; while (k < ys.length - 1 && Math.abs(ys[k + 1] - yb) < Math.abs(ys[k] - yb)) k++;
      const local = Math.min(ys[k] - ys[k - 1], ys[k + 1] - ys[k]);
      if (Math.abs(ys[k] - yb) <= 0.3 * local) ys[k] = yb; else { ys.push(yb); ys.sort((a, b) => a - b); }
    }
    return ys;
  }
  // Panel mesh of the right semi-wing. options.sectionLoop(y, nHalf) may supply local [x, z] points
  // (lower TE -> LE -> upper TE, 2 nHalf + 1 points) for analytic benchmark sections.
  function wingMesh(g, mesh = {}, limits = LIMITS) {
    const m = { ...DEFAULT_MESH, ...mesh };
    const nHalf = intIn(m.chordPanels, 'Chordwise panels per surface', ...limits.chordPanels), ni = 2 * nHalf;
    intIn(m.spanPanels, 'Spanwise panels', ...limits.spanPanels);
    if (!['sine', 'cosine', 'uniform'].includes(m.spanSpacing)) throw new Error('Span spacing must be sine (tip-clustered), cosine or uniform.');
    if (!['flat', 'rounded'].includes(m.tipClosure)) throw new Error('Tip closure must be flat or rounded.');
    let ys = spanStations(g, m.spanPanels, m.spanSpacing);
    const closed = Geometry.closedTip(g), L = g.semiSpan;
    let loop = m.sectionLoop || ((y, h) => sectionLoop(g, y, h)), rounding = null;
    if (m.tipClosure === 'rounded' && !closed) {
      // Rounded aerodynamic tip: inside the last l of span the section thickness about its camber line is
      // scaled by tau = sqrt(1 - ((y - (L - l)) / l)^2), so the surface closes on a sharp side edge at y = L
      // (no flat cap). l = half the tip section's maximum thickness (a semicircular-like spanwise rounding).
      const tip = loop(L, nHalf), base = loop;
      const tMax = Math.max(...tip.map((p, i) => Math.hypot(p[0] - tip[ni - i][0], p[1] - tip[ni - i][1])));
      // rounding strips refine with the spanwise mesh ('auto': max(2, round(spanPanels / 4))), so a spanwise
      // refinement study also refines the tip rounding
      const ell = Math.min(0.5 * tMax, 0.25 * L), y0 = L - ell, mRound = m.roundingStrips === 'auto' ? Math.max(2, Math.round(m.spanPanels / 4)) : m.roundingStrips;
      ys = [...ys.filter(y => y < y0 - 0.25 * ell / mRound), ...Array.from({ length: mRound + 1 }, (_, k) => y0 + ell * Math.sin(Math.PI / 2 * k / mRound))];
      ys[ys.length - 1] = L;
      loop = (y, h) => {
        const pts = base(y, h); if (!pts || y <= y0) return pts;
        const tau = Math.sqrt(Math.max(0, 1 - ((y - y0) / ell) ** 2));
        return pts.map((p, i) => { const q = pts[ni - i], cx = 0.5 * (p[0] + q[0]), cz = 0.5 * (p[1] + q[1]); return [cx + tau * (p[0] - cx), cz + tau * (p[1] - cz)]; });
      };
      rounding = { length_mm: ell, start_mm: y0, strips: mRound };
    }
    const ns = ys.length - 1;
    const nodes = new Float64Array(3 * (ni + 1) * (ns + 1)), sections = [];
    for (let j = 0; j <= ns; j++) {
      const y = ys[j], pts = loop(y, nHalf);
      if (pts && pts.length !== ni + 1) throw new Error('A section loop must have 2 nHalf + 1 points.');
      for (let i = 0; i <= ni; i++) {
        const P = Geometry.transformPoint(g, y, pts ? pts[i] : [0, 0]), o = 3 * (j * (ni + 1) + i);
        nodes[o] = P[0]; nodes[o + 1] = P[1]; nodes[o + 2] = P[2];
      }
      const st = Geometry.stationAt(g, y);
      sections.push({ y, chord: st.chord, xLE: st.xLE, zLE: st.zLE, incidenceDeg: st.incidenceDeg, collapsed: !pts });
    }
    if (!closed && sections[ns].collapsed) throw new Error('Only closed elliptic or delta tips may collapse to a point.');
    const roundedTip = !!rounding; // the tip edge closes the surface: no cap panels
    const node = (i, j) => j * (ni + 1) + i;
    const quads = [];
    for (let j = 0; j < ns; j++) for (let i = 0; i < ni; i++) quads.push(node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1));
    const wingPanels = ni * ns;
    const hasCap = !sections[ns].collapsed && !roundedTip;
    if (hasCap) for (let i = 0; i < nHalf; i++) quads.push(node(i, ns), node(i + 1, ns), node(ni - i - 1, ns), node(ni - i, ns));
    const S = buildSurface(nodes, Int32Array.from(quads));
    if (S.count > limits.maxPanels) throw new Error(`The panel mesh has ${S.count} panels; at most ${limits.maxPanels} are allowed in the browser.`);
    for (let k = wingPanels; k < S.count; k++) if (!(S.PN[3 * k + 1] > 0.99)) throw new Error('Tip-cap panel orientation check failed.');
    const index = (i, j) => j * ni + i;
    // a rounded tip closes the surface: the last row continues across the tip edge onto the opposite surface
    const patches = [{ ni, nj: ns, index, iMode: 'open', jMode: 'mirror', ...(roundedTip ? { jEnd: 'seam', seam: i => ni - 1 - i } : {}) }];
    if (hasCap) patches.push({ ni: nHalf, nj: 1, index: i => wingPanels + i, iMode: 'open', jMode: 'open', cross: i => [index(i, ns - 1), index(ni - 1 - i, ns - 1)] });
    // Morino Kutta condition: wake doublet = upper minus lower trailing-edge panel doublet. (A linear
    // extrapolation of each surface doublet to the TE edge was tested on exact Karman-Trefftz wings and
    // converged erratically, so it is not offered.) Weights are stored generally for the assembly.
    const kutta = 'centroid', width = 4;
    const wake = { count: ns, a: new Float64Array(3 * ns), b: new Float64Array(3 * ns), dir: m.wakeDirection ? m.wakeDirection.slice() : [1, 0, 0], upper: new Int32Array(ns), lower: new Int32Array(ns), kutta, kuttaWidth: width, kuttaPanels: new Int32Array(width * ns), kuttaWeights: new Float64Array(width * ns) };
    for (let j = 0; j < ns; j++) {
      for (let c = 0; c < 3; c++) { wake.a[3 * j + c] = nodes[3 * node(0, j) + c]; wake.b[3 * j + c] = nodes[3 * node(0, j + 1) + c]; }
      wake.upper[j] = index(ni - 1, j); wake.lower[j] = index(0, j);
      const side = (k1, k2, sign, o) => {
        wake.kuttaPanels[width * j + o] = k1; wake.kuttaWeights[width * j + o] = sign;
        wake.kuttaPanels[width * j + o + 1] = k2; wake.kuttaWeights[width * j + o + 1] = 0;
      };
      side(index(ni - 1, j), index(ni - 2, j), 1, 0); side(index(0, j), index(1, j), -1, 2);
    }
    // Doublet model: 'tensor-quadratic' (default since candidate 0.3.2-exp.3: wingTensorQuadBasis, tensorQuadWake),
    // 'span-quadratic' (0.3.2-exp.2: wingSpanQuadBasis, spanQuadWake) or 'constant' (the 0.3.1 constant-strength panels
    // and wake strips, bit-identical). A flat cap (diagnostic option) falls back to 'span-quadratic'.
    const doubletModel = m.doubletModel ?? (hasCap ? 'span-quadratic' : 'tensor-quadratic');
    if (!['tensor-quadratic', 'span-quadratic', 'constant'].includes(doubletModel)) throw new Error("Doublet model must be 'tensor-quadratic', 'span-quadratic' or 'constant'.");
    let body = null;
    if (doubletModel === 'span-quadratic') {
      body = wingSpanQuadBasis(S, { ni, ns, index, ys, hasCap });
      wake.basis = spanQuadWake(wake, body, S); wake.body = body; // the wake object fixes its model (assemble reads it)
    } else if (doubletModel === 'tensor-quadratic') {
      body = wingTensorQuadBasis(S, { ni, ns, index, ys, hasCap, closedTip: !!sections[ns].collapsed });
      wake.basis = tensorQuadWake(wake, body, S, { ni, index }); wake.body = body;
    }
    const blocks = Array.from({ length: ns }, (_, j) => [j * ni, ni]);
    if (hasCap) blocks.push([wingPanels, nHalf]);
    return { S, layout: { patches }, wake, body, doubletModel, ys, sections, nHalf, ni, ns, wingPanels, hasCap, closedTip: closed, roundedTip: rounding, blocks, options: { chordPanels: nHalf, spanPanels: m.spanPanels, spanSpacing: m.spanSpacing, farField: m.farField, tipClosure: m.tipClosure, kutta }, index };
  }

  // ------------------------------------------------------------------ reference quantities
  function references(g) {
    const L = g.semiSpan, N = 400;
    let S = 0, Sc2 = 0, Scy = 0, Sx = 0, Sz = 0;
    // y = L sin(theta): smooth integrands for square-root (elliptic) chord laws; Simpson in theta.
    for (let k = 0; k <= N; k++) {
      const th = (Math.PI / 2) * k / N, y = L * Math.sin(th), w = (k === 0 || k === N ? 1 : k % 2 ? 4 : 2) * (Math.PI / 2) / (3 * N) * L * Math.cos(th);
      const st = Geometry.stationAt(g, Math.min(L, y)), c = st.chord;
      S += w * c; Sc2 += w * c * c; Scy += w * c * y; Sx += w * c * st.xLE; Sz += w * c * st.zLE;
    }
    const half = Geometry.area(g), mac = Sc2 / S;
    return { semiArea_mm2: half, area_mm2: 2 * half, span_mm: 2 * L, aspectRatio: (2 * L) ** 2 / (2 * half), mac_mm: mac, yMac_mm: Scy / S,
      momentPoint_mm: [Sx / S + 0.25 * mac, 0, Sz / S], areaQuadratureCheck: S / half - 1 };
  }

  // ------------------------------------------------------------------ input checks
  const FLOW_KEYS = ['speed', 'density', 'alphaDeg', 'betaDeg', 'viscosity', 'speedOfSound'];
  const MESH_KEYS = ['chordPanels', 'spanPanels', 'spanSpacing', 'farField', 'tipClosure', 'roundingStrips'];
  function normalizeFlow(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Flow conditions must be an object.');
    for (const k of Object.keys(raw)) if (!FLOW_KEYS.includes(k)) throw new Error(`Unknown flow field "${k}".`);
    const f = { ...DEFAULT_FLOW, ...raw };
    finiteIn(f.speed, 'Speed V (m/s)', 1e-3, 200); finiteIn(f.density, 'Density rho (kg/m^3)', 1e-3, 5);
    finiteIn(f.alphaDeg, 'Angle of attack (deg)', -LIMITS.maxAlphaDeg, LIMITS.maxAlphaDeg);
    if (f.betaDeg !== 0) throw new Error('Sideslip is not supported: this version solves symmetric flight only (beta = 0).');
    finiteIn(f.viscosity, 'Dynamic viscosity (Pa s)', 1e-7, 1e-2); finiteIn(f.speedOfSound, 'Speed of sound in air (m/s)', ...LIMITS.speedOfSound);
    const mach = f.speed / f.speedOfSound;
    if (mach > LIMITS.maxMach) throw new Error(`Mach ${mach.toFixed(3)} exceeds 0.3. This incompressible module has no validated compressibility treatment; reduce the speed.`);
    return Object.freeze({ ...f, mach });
  }
  function normalizeMesh(raw = {}, limits = LIMITS) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Mesh options must be an object.');
    for (const k of Object.keys(raw)) if (!MESH_KEYS.includes(k)) throw new Error(`Unknown mesh field "${k}".`);
    const m = { ...DEFAULT_MESH, ...raw };
    intIn(m.chordPanels, 'Chordwise panels per surface', ...limits.chordPanels); intIn(m.spanPanels, 'Spanwise panels', ...limits.spanPanels);
    if (!['flat', 'rounded'].includes(m.tipClosure)) throw new Error('Tip closure must be flat or rounded.');
    if (m.roundingStrips !== 'auto') intIn(m.roundingStrips, 'Tip rounding strips', 2, 16);
    if (!['sine', 'cosine', 'uniform'].includes(m.spanSpacing)) throw new Error('Span spacing must be sine, cosine or uniform.');
    if (m.farField !== Infinity) finiteIn(m.farField, 'Far-field ratio', 3, 1e9);
    return Object.freeze(m);
  }

  // ------------------------------------------------------------------ prepare (cached) and evaluate
  // options: cache (Map), progress(text), solver ('auto' | 'lu' | 'gmres'), and for analytic benchmark
  // sections only: sectionLoop(y, nHalf) with a sectionKey string identifying it in the cache key.
  function prepare(rawGeometry, rawMesh = {}, options = {}) {
    // options.referenceLimits: larger meshes for Node reference studies only (the Worker never passes it)
    const limits = options.referenceLimits ? { ...LIMITS, ...options.referenceLimits } : LIMITS;
    const g = aeroGeometry(rawGeometry), mesh = normalizeMesh(rawMesh, limits);
    if (options.sectionLoop && typeof options.sectionKey !== 'string') throw new Error('A custom section loop needs a sectionKey for caching.');
    const key = JSON.stringify([GEOMETRY_KEYS.map(k => g[k] ?? null), mesh, options.sectionKey ?? null, options.solver ?? 'auto', options.wakeDirection ?? null, options.gradientScheme ?? 'unfolded', options.doubletModel ?? 'default']);
    const cache = options.cache;
    if (cache && cache.has(key)) { const hit = cache.get(key); hit.lastCacheHit = true; return hit; }
    const t0 = now(), wm = wingMesh(g, { ...mesh, sectionLoop: options.sectionLoop, wakeDirection: options.wakeDirection, doubletModel: options.doubletModel }, limits), t1 = now();
    options.progress?.(`Assembling ${wm.S.count} panels with the mirror image and ${wm.wake.count} wake strips...`);
    // the tensor model: strip block symmetric Gauss-Seidel, and GMRES (with its LU fallback) from TENSOR_LU_MAX panels
    const tensor = !!(wm.body && wm.body.kind === 'tensor-quadratic');
    const sol = unitSolutions(wm.S, { image: true, wake: wm.wake, body: wm.body, farField: mesh.farField, solver: options.solver, blocks: wm.blocks, ...(tensor ? { stripSweep: true, luMaxPanels: TENSOR_LU_MAX, work: options.work } : {}) });
    // Unit-freestream tangential velocities: V_t(a) = V (cos a Ux + sin a Uz).
    // options.gradientScheme: 'unfolded' (default) or 'legacy' (the previous straight-chord stencil, for comparison only)
    const gs = { scheme: options.gradientScheme ?? 'unfolded' };
    // the recovery samples the surface potential at the panel centroids: for span-quadratic panels the doublet value
    // there (controlPointValues: Q_k at the centroid's y), for constant panels the panel doublet itself (0.3.1)
    // a tensor body: the exterior velocity of the solved distribution on every triangle of the split (the jump relations,
    // tensorTriangleVelocity; gradientScheme ignored); Ux, Uz then hold its value at the control point (panel Cp) and
    // model.surface the per-triangle field that evaluate integrates exactly
    let Ux, Uz, surface = null;
    if (wm.body && wm.body.kind === 'tensor-quadratic') {
      const R = tensorTriangles(wm.body, wm.S), TUx = tensorTriangleVelocity(wm.body, wm.S, R, sol.mux, [1, 0, 0]), TUz = tensorTriangleVelocity(wm.body, wm.S, R, sol.muz, [0, 0, 1]);
      Ux = tensorControlPointVelocity(R, TUx); Uz = tensorControlPointVelocity(R, TUz); surface = { R, Ux: TUx, Uz: TUz, controlPoint: [Ux, Uz] };
    } else {
      const cpx = wm.body ? controlPointValues(wm.body, sol.mux) : sol.mux, cpz = wm.body ? controlPointValues(wm.body, sol.muz) : sol.muz;
      Ux = surfaceVelocity(wm.S, wm.layout, cpx, [1, 0, 0], gs); Uz = surfaceVelocity(wm.S, wm.layout, cpz, [0, 0, 1], gs);
    }
    const model = { version: VERSION, key, geometry: g, mesh, wm, sol, Ux, Uz, surface, refs: references(g), timing: { meshMs: t1 - t0, ...sol.timing }, lastCacheHit: false };
    if (cache) { if (cache.size >= LIMITS.modelCache) cache.delete(cache.keys().next().value); cache.set(key, model); }
    return model;
  }

  // Trefftz-plane analysis of the wake trace (y-z plane; wake along +x), per unit V.
  // Midpoint rule for a piecewise-constant doublet trace: each segment is a 2-D doublet panel
  // (point vortices at its ends); normalwash at segment midpoints; D/(rho/2) = -sum mu w l.
  function trefftzMidpoint(trace, mu) {
    const ns = mu.length, segs = [];
    for (let j = 0; j < ns; j++) segs.push({ a: trace[j], b: trace[j + 1], mu: mu[j] });
    for (let j = 0; j < ns; j++) segs.push({ a: [-trace[j + 1][0], trace[j + 1][1]], b: [-trace[j][0], trace[j][1]], mu: mu[j] });
    const grad = (v, P) => { const X = v[0] - P[0], Y = v[1] - P[1], r2 = X * X + Y * Y; return r2 > 0 ? [Y / r2, -X / r2] : [0, 0]; };
    let dragOverHalfRho = 0, liftOverRhoV = 0;
    const wn = new Float64Array(ns);
    for (let i = 0; i < ns; i++) {
      const s = segs[i], ty = s.b[0] - s.a[0], tz = s.b[1] - s.a[1], l = Math.hypot(ty, tz), n = [-tz / l, ty / l], P = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      let vy = 0, vz = 0;
      for (const q of segs) { const gb = grad(q.b, P), ga = grad(q.a, P), f = q.mu / (2 * Math.PI); vy += f * (gb[0] - ga[0]); vz += f * (gb[1] - ga[1]); }
      wn[i] = vy * n[0] + vz * n[1];
      dragOverHalfRho += -2 * s.mu * wn[i] * l; // x2: the mirror half is identical
      liftOverRhoV += 2 * s.mu * ty;            // side forces of the two halves cancel
    }
    return { dragOverHalfRho, liftOverRhoV, normalwash: wn };
  }
  // The midpoint rule is first order in the strip width (-3.6% on an exact elliptic loading with 16
  // sine-spaced strips). Drag is therefore evaluated on a continuous piecewise-linear reconstruction
  // of the strip strengths (nodes at strip midpoints, mirror-symmetric at the root, zero at the tip),
  // sub-divided `refine` times. Lift is the exact Kutta-Joukowski sum of the discrete wake.
  function trefftz(trace, mu, refine = 16) {
    const ns = mu.length, base = trefftzMidpoint(trace, mu);
    if (refine <= 1) return { ...base, method: 'midpoint' };
    const s = [0]; for (let j = 0; j < ns; j++) s.push(s[j] + Math.hypot(trace[j + 1][0] - trace[j][0], trace[j + 1][1] - trace[j][1]));
    const mid = Array.from({ length: ns }, (_, j) => (s[j] + s[j + 1]) / 2), total = s[ns];
    const muAt = x => {
      if (x <= mid[0]) return mu[0];
      if (x >= mid[ns - 1]) return mu[ns - 1] * (total - x) / (total - mid[ns - 1]);
      let j = 0; while (j < ns - 2 && x > mid[j + 1]) j++;
      return mu[j] + (mu[j + 1] - mu[j]) * (x - mid[j]) / (mid[j + 1] - mid[j]);
    };
    const fine = [trace[0]], fineMu = [];
    for (let j = 0; j < ns; j++) for (let p = 1; p <= refine; p++) {
      const t = p / refine, a = trace[j], b = trace[j + 1];
      fine.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      fineMu.push(muAt(s[j] + (t - 0.5 / refine) * (s[j + 1] - s[j])));
    }
    const r = trefftzMidpoint(fine, fineMu);
    return { dragOverHalfRho: r.dragOverHalfRho, liftOverRhoV: base.liftOverRhoV, normalwash: base.normalwash, dragMidpointOverHalfRho: base.dragOverHalfRho, method: `piecewise-linear reconstruction, ${refine} sub-segments per strip` };
  }

  // Trefftz plane of the span-quadratic wake: the trace (y, z) of every strip with its quadratic strength through s.atA,
  // s.gamma (mid-point), s.atB (per unit V, from wakeStrengths). Lift is the exact Kutta-Joukowski integral (Simpson,
  // exact for the quadratic); drag the midpoint rule on `refine` sub-segments per strip, the strength sampled from the
  // same quadratic (the reconstruction of trefftz(), now the solver's own wake).
  function trefftzQuadratic(W, s, refine = 16) {
    const m = W.count, fine = [], fineMu = []; let liftOverRhoV = 0;
    for (let j = 0; j < m; j++) {
      const a = [W.a[3 * j + 1], W.a[3 * j + 2]], b = [W.b[3 * j + 1], W.b[3 * j + 2]], mA = s.atA[j], mM = s.gamma[j], mB = s.atB[j];
      liftOverRhoV += 2 * (b[0] - a[0]) * (mA + 4 * mM + mB) / 6; // both halves
      if (!fine.length) fine.push(a);
      for (let r = 1; r <= refine; r++) {
        const t = r / refine, tm = t - 0.5 / refine; fine.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        fineMu.push(mA * (1 - tm) * (1 - 2 * tm) + 4 * mM * tm * (1 - tm) + mB * tm * (2 * tm - 1));
      }
    }
    const r = trefftzMidpoint(fine, fineMu);
    return { dragOverHalfRho: r.dragOverHalfRho, liftOverRhoV, normalwash: null, method: `span-quadratic wake strength (solver basis), ${refine} sub-segments per strip` };
  }

  function evaluate(model, rawFlow = {}) {
    const flow = normalizeFlow(rawFlow), t0 = now();
    const { wm, sol, refs, geometry: g } = model, S = wm.S, n = S.count;
    const a = flow.alphaDeg * DEG, ca = Math.cos(a), sa = Math.sin(a), V = flow.speed;
    const q = 0.5 * flow.density * V * V, qmm = q * 1e-6; // Pa and N/mm^2
    const eD = [ca, 0, sa], eL = [-sa, 0, ca];
    const mu = new Float64Array(n), cp = new Float64Array(n), force = new Float64Array(3 * n), capForce = [0, 0, 0];
    // The flat tip cap closes the surface for the potential solution, but its pressure is NOT integrated
    // into loads: its trailing corner is the potential-flow edge singularity where the side edge of the wake
    // (the tip vortex) leaves the wing, so the cap Cp there is unbounded under chordwise refinement and the
    // cap force (purely spanwise, since Wing Lab sections lie in planes y = const) does not converge.
    // Cap pressures and that unconverged force are reported separately as diagnostics only.
    let maxCp = -Infinity, minCp = Infinity, capMinCp = null, capMaxCp = null;
    // the tensor model: Cp at the control point; force, moment about the centroid (couple) and the x-moment of the lift
    // (xLift: integral of x dF_z) are the exact integrals of the quadratic Cp = 1 - |v|^2 / V^2 of the linear velocity
    // over every triangle (tensorTriangleVelocity): with lambda_i the barycentric coordinates, v = sum v_i lambda_i and
    //   J_i = int Cp lambda_i dA = A / 3 - A [|v_i|^2 / 10 + (|v_a|^2 + |v_b|^2) / 30 + (v_i . v_a + v_i . v_b) / 15 + v_a . v_b / 30]
    // ({a, b} the other two vertices; int l_i^2 l_j = A / 30, int l_i^3 = A / 10, int l_0 l_1 l_2 = A / 60), the force
    // -q n_T sum J_i, the couple about the centroid C -q (sum J_i (X_i - C)) x n_T.
    // (a model whose Ux, Uz were replaced by another reconstruction is evaluated from those, panel-constant, as before)
    const surf = model.surface && model.surface.controlPoint[0] === model.Ux && model.surface.controlPoint[1] === model.Uz ? model.surface : null;
    const couple = surf ? new Float64Array(3 * n) : null, xLift = surf ? new Float64Array(n) : null;
    for (let k = 0; k < n; k++) {
      mu[k] = V * (ca * model.sol.mux[k] + sa * model.sol.muz[k]);
      const vx = ca * model.Ux[3 * k] + sa * model.Uz[3 * k], vy = ca * model.Ux[3 * k + 1] + sa * model.Uz[3 * k + 1], vz = ca * model.Ux[3 * k + 2] + sa * model.Uz[3 * k + 2];
      cp[k] = 1 - (vx * vx + vy * vy + vz * vz);
      if (k < wm.wingPanels) { maxCp = Math.max(maxCp, cp[k]); minCp = Math.min(minCp, cp[k]); }
      else { capMinCp = Math.min(capMinCp ?? Infinity, cp[k]); capMaxCp = Math.max(capMaxCp ?? -Infinity, cp[k]); }
      if (surf) {
        const R = surf.R, TX = surf.Ux, TZ = surf.Uz, X = R.X, Cx = S.PC[3 * k], Cy = S.PC[3 * k + 1], Cz = S.PC[3 * k + 2];
        let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0, xl = 0;
        for (let j = R.first[k]; j < R.first[k + 1]; j++) {
          const q = 9 * j, A = R.area[j];
          const ax = ca * TX[q] + sa * TZ[q], ay = ca * TX[q + 1] + sa * TZ[q + 1], az = ca * TX[q + 2] + sa * TZ[q + 2];
          const bx = ca * TX[q + 3] + sa * TZ[q + 3], by = ca * TX[q + 4] + sa * TZ[q + 4], bz = ca * TX[q + 5] + sa * TZ[q + 5];
          const cx = ca * TX[q + 6] + sa * TZ[q + 6], cy = ca * TX[q + 7] + sa * TZ[q + 7], cz = ca * TX[q + 8] + sa * TZ[q + 8];
          const w00 = ax * ax + ay * ay + az * az, w11 = bx * bx + by * by + bz * bz, w22 = cx * cx + cy * cy + cz * cz;
          const w01 = ax * bx + ay * by + az * bz, w12 = bx * cx + by * cy + bz * cz, w20 = cx * ax + cy * ay + cz * az;
          const J0 = A * (1 / 3 - (w00 / 10 + (w11 + w22) / 30 + (w01 + w20) / 15 + w12 / 30));
          const J1 = A * (1 / 3 - (w11 / 10 + (w00 + w22) / 30 + (w01 + w12) / 15 + w20 / 30));
          const J2 = A * (1 / 3 - (w22 / 10 + (w00 + w11) / 30 + (w12 + w20) / 15 + w01 / 30));
          const nx = R.N[3 * j], ny = R.N[3 * j + 1], nz = R.N[3 * j + 2], f = -qmm * (J0 + J1 + J2);
          fx += f * nx; fy += f * ny; fz += f * nz;
          // first moment of Cp about the centroid, sum J_i (X_i - C)
          const ex = J0 * (X[q] - Cx) + J1 * (X[q + 3] - Cx) + J2 * (X[q + 6] - Cx), ey = J0 * (X[q + 1] - Cy) + J1 * (X[q + 4] - Cy) + J2 * (X[q + 7] - Cy), ez = J0 * (X[q + 2] - Cz) + J1 * (X[q + 5] - Cz) + J2 * (X[q + 8] - Cz);
          mx -= qmm * (ey * nz - ez * ny); my -= qmm * (ez * nx - ex * nz); mz -= qmm * (ex * ny - ey * nx);
          xl -= qmm * nz * (J0 * X[q] + J1 * X[q + 3] + J2 * X[q + 6]);
        }
        force[3 * k] = fx; force[3 * k + 1] = fy; force[3 * k + 2] = fz; couple[3 * k] = mx; couple[3 * k + 1] = my; couple[3 * k + 2] = mz; xLift[k] = xl;
        continue;
      }
      const f = -cp[k] * qmm * S.PA[k];
      if (k < wm.wingPanels) { force[3 * k] = f * S.PN[3 * k]; force[3 * k + 1] = f * S.PN[3 * k + 1]; force[3 * k + 2] = f * S.PN[3 * k + 2]; }
      else for (let d = 0; d < 3; d++) capForce[d] += f * S.PN[3 * k + d];
    }
    if (surf && wm.wingPanels !== n) throw new Error('The tensor model has no cap panels.');
    // semi-wing resultants (right half, body axes): about the root origin and about the moment point
    const sum = (from, to, ref) => { const F = [0, 0, 0], M = [0, 0, 0]; for (let k = from; k < to; k++) { const fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - ref[0], ry = S.PC[3 * k + 1] - ref[1], rz = S.PC[3 * k + 2] - ref[2]; F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx; if (couple) { M[0] += couple[3 * k]; M[1] += couple[3 * k + 1]; M[2] += couple[3 * k + 2]; } } return { F, M }; };
    const origin = sum(0, n, [0, 0, 0]), atRef = sum(0, n, refs.momentPoint_mm);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const Sref = refs.area_mm2, liftFull = 2 * dot(origin.F, eL), dragFull = 2 * dot(origin.F, eD), pitchFull = 2 * atRef.M[1];
    const CL = liftFull / (qmm * Sref), CDp = dragFull / (qmm * Sref), Cm = pitchFull / (qmm * Sref * refs.mac_mm);
    // strips
    const strips = [], wakeMu = new Float64Array(wm.ns), trace = [], ws = wakeStrengths(wm.wake, mu, wm.body), tensorWake = !!(wm.wake.basis && wm.wake.basis.kind === 'tensor-quadratic');
    for (let j = 0; j < wm.ns; j++) trace.push([wm.wake.a[3 * j + 1], wm.wake.a[3 * j + 2]]);
    trace.push([wm.wake.b[3 * (wm.ns - 1) + 1], wm.wake.b[3 * (wm.ns - 1) + 2]]);
    let kuttaMax = 0, kuttaInterior = 0;
    for (let j = 0; j < wm.ns; j++) {
      const y0 = wm.ys[j], y1 = wm.ys[j + 1], ym = 0.5 * (y0 + y1), st = Geometry.stationAt(g, ym), chord = st.chord;
      const qc = Geometry.transformPoint(g, ym, [0.25 * chord, 0]);
      const F = [0, 0, 0], M = [0, 0, 0]; let Xz = 0;
      for (let i = 0; i < wm.ni; i++) {
        const k = wm.index(i, j), fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - qc[0], ry = S.PC[3 * k + 1] - qc[1], rz = S.PC[3 * k + 2] - qc[2];
        F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx;
        if (couple) { M[0] += couple[3 * k]; M[1] += couple[3 * k + 1]; M[2] += couple[3 * k + 2]; Xz += xLift[k]; } else Xz += fz * S.PC[3 * k];
      }
      if (tensorWake) wakeMu[j] = ws.gamma[j]; // the trailing-edge trace jump at the strip mid-point
      else { let g = 0; for (let q = 0; q < wm.wake.kuttaWidth; q++) g += wm.wake.kuttaWeights[q + wm.wake.kuttaWidth * j] * mu[wm.wake.kuttaPanels[q + wm.wake.kuttaWidth * j]]; wakeMu[j] = g; }
      const dCpTE = cp[wm.wake.upper[j]] - cp[wm.wake.lower[j]]; kuttaMax = Math.max(kuttaMax, Math.abs(dCpTE));
      if (y1 <= 0.9 * g.semiSpan) kuttaInterior = Math.max(kuttaInterior, Math.abs(dCpTE));
      const dy = y1 - y0, lift = dot(F, eL);
      strips.push({ y0, y1, yMid: ym, chord, force_N: F, momentAboutQuarterChord_Nmm: M, quarterChordPoint_mm: qc,
        cl: chord > 0 ? lift / (qmm * chord * dy) : 0, clKuttaJoukowski: chord > 0 ? 2 * wakeMu[j] / (V * chord) : 0,
        xCenterOfPressure_mm: Math.abs(F[2]) > 0 ? Xz / F[2] : null, gamma: wakeMu[j], trailingEdgeDeltaCp: dCpTE });
    }
    const tr = wm.wake.basis
      ? trefftzQuadratic(wm.wake, { gamma: Array.from(ws.gamma, v => v / V), atA: Array.from(ws.atA, v => v / V), atB: Array.from(ws.atB, v => v / V) })
      : trefftz(trace, Array.from(wakeMu, v => v / V));
    const CLt = 2 * tr.liftOverRhoV / Sref, CDi = tr.dragOverHalfRho / Sref; // per unit V: L/(q S) = 2 (L/rhoV)/(V S)
    const ar = refs.aspectRatio, e = CDi > 1e-12 && Math.abs(CLt) > 1e-6 ? CLt * CLt / (Math.PI * ar * CDi) : null;
    const reynolds = flow.density * V * (refs.mac_mm * 1e-3) / flow.viscosity;
    const warnings = [];
    const incid = (g.stations || []).map(s => s.incidenceDeg), aLocal = Math.max(...[0, ...incid].map(i => Math.abs(flow.alphaDeg + i)));
    if (aLocal > LIMITS.warnAlphaDeg) warnings.push(`Local geometric angle reaches ${aLocal.toFixed(1)} deg. This attached-flow model does not predict stall; treat results beyond the linear range as unsupported.`);
    if (flow.mach > LIMITS.warnMach) warnings.push(`Mach ${flow.mach.toFixed(3)}: compressibility (about ${(100 * (1 / Math.sqrt(1 - flow.mach ** 2) - 1)).toFixed(1)}% Prandtl-Glauert) is not applied.`);
    if (reynolds < LIMITS.lowReynolds) warnings.push(`Reynolds number ${reynolds.toExponential(2)} (mean aerodynamic chord): laminar separation and low-Re effects can reduce lift slope and maximum lift substantially; inviscid results are optimistic.`);
    if (g.planform === 'delta' || Math.abs(g.sweepDeg || 0) > 45) warnings.push('Highly swept or delta planform: leading-edge vortex lift is not modelled; attached-flow results are not reliable beyond small angles.');
    if (!wm.closedTip && g.tipChord < 0.05 * g.rootChord) warnings.push(`Tip chord ${(100 * g.tipChord / g.rootChord).toPrecision(2)}% of the root chord: the tip panels become slivers and local tip pressures are unreliable. For a pointed tip use the exact delta or elliptic closed-tip planform.`);
    if (kuttaInterior > 0.1) warnings.push(`Trailing-edge pressure mismatch up to ${kuttaInterior.toFixed(3)} (Cp) inboard of 90% semi-span: refine the chordwise mesh near the trailing edge.`);
    const dCL = CL !== 0 ? Math.abs(CLt - CL) / Math.abs(CL) : 0;
    if (dCL > 0.03 && Math.abs(CL) > 0.05) warnings.push(`Pressure-integrated and Trefftz lift differ by ${(100 * dCL).toFixed(1)}%: the mesh is too coarse for load use.`);
    if (maxCp > 1.02) warnings.push(`Maximum Cp ${maxCp.toFixed(3)} exceeds the stagnation value 1: the local mesh is inadequate.`);
    return {
      version: VERSION, scope: SCOPE, flow: { ...flow, dynamicPressure_Pa: q, reynoldsMac: reynolds },
      reference: refs, mesh: { panels: n, wingPanels: wm.wingPanels, tipCapPanels: n - wm.wingPanels, wakeStrips: wm.ns, chordPanelsPerSurface: wm.nHalf, spanStations: wm.ys.slice(), closedTip: wm.closedTip, roundedTip: wm.roundedTip, maxWarpRatio: S.maxWarpRatio, doubletModel: wm.doubletModel ?? 'constant', ...model.mesh },
      coefficients: { CL, CDpressure: CDp, CDiTrefftz: CDi, CLTrefftz: CLt, Cm, spanEfficiencyTrefftz: e },
      aircraft: { lift_N: liftFull, dragPressure_N: dragFull, dragInducedTrefftz_N: CDi * qmm * Sref, pitchingMomentAboutReference_Nmm: pitchFull },
      semiWing: { force_N: origin.F, momentAboutRootOrigin_Nmm: origin.M, momentAboutReference_Nmm: atRef.M,
        tipCap: wm.hasCap ? { integrated: false, unconvergedPressureForce_N: capForce, minCp: capMinCp, maxCp: capMaxCp } : null },
      strips, panels: { cp, mu, force_N: force, centroid_mm: S.PC, normal: S.PN, area_mm2: S.PA, count: n, wingPanels: wm.wingPanels, ...(couple ? { momentAboutCentroid_Nmm: couple } : {}) },
      diagnostics: { maxCp, minCp, tipCapMinCp: capMinCp, tipCapMaxCp: capMaxCp, trailingEdgeDeltaCpMax: kuttaMax, trailingEdgeDeltaCpInboard90: kuttaInterior, liftTrefftzRelativeDifference: dCL,
        wake: { model: ws.model, stripStrength: Array.from(ws.gamma), strengthAtInnerEdge: Array.from(ws.atA), strengthAtOuterEdge: Array.from(ws.atB) },
        linearSolver: sol.method, gmresIterations: sol.iterations, linearRelativeResidual: sol.relativeResidual, trefftzDragMethod: tr.method, normalwashTrefftz: tr.normalwash },
      warnings, timing: { ...model.timing, evaluateMs: now() - t0 },
    };
  }
  function solve(rawGeometry, rawFlow = {}, rawMesh = {}, options = {}) { return evaluate(prepare(rawGeometry, rawMesh, options), rawFlow); }

  // Angle of attack giving a target aircraft lift (both halves, N) at the given speed and density.
  // Uses the cached unit solutions (no new linear solve). Secant iteration on the attached-flow model;
  // the answer is refused outside the admitted angle range rather than extrapolated.
  function alphaForLift(model, rawFlow, targetLift_N) {
    finiteIn(targetLift_N, 'Target lift (N)', -1e6, 1e6);
    const lift = a => evaluate(model, { ...rawFlow, alphaDeg: a }).aircraft.lift_N - targetLift_N;
    let a0 = 0, a1 = 4, f0 = lift(a0), f1 = lift(a1);
    for (let it = 0; it < 40; it++) {
      if (Math.abs(f1) <= 1e-10 * Math.max(1, Math.abs(targetLift_N))) break;
      const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
      if (!Number.isFinite(a2) || Math.abs(a2) > LIMITS.maxAlphaDeg) throw new Error(`The target lift needs |alpha| > ${LIMITS.maxAlphaDeg} deg at this speed and density, outside the attached-flow range of this module.`);
      a0 = a1; f0 = f1; a1 = a2; f1 = lift(a1);
    }
    return { alphaDeg: a1, residual_N: f1 };
  }
  // Chordwise Cp along one spanwise strip, split into lower and upper surfaces (x/c on the local chord).
  function stripChordwiseCp(model, result, j) {
    const wm = model.wm, g = model.geometry, S = wm.S;
    if (!Number.isInteger(j) || j < 0 || j >= wm.ns) throw new Error('Strip index out of range.');
    const lower = [], upper = [];
    for (let i = 0; i < wm.ni; i++) {
      const k = wm.index(i, j), c = [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]], chord = Geometry.chordAt(g, c[1]);
      const local = Geometry.inversePoint(g, c), xc = chord > 0 ? local[0] / chord : 0;
      (i < wm.nHalf ? lower : upper).push([xc, result.panels.cp[k]]);
    }
    lower.reverse();
    return { y_mm: result.strips[j].yMid, chord_mm: result.strips[j].chord, lower, upper };
  }
  // Structured-clone-friendly summary for a Worker reply or a study report (no per-panel arrays).
  function compactResult(model, result, options = {}) {
    const { panels, diagnostics, ...rest } = result;
    const { normalwashTrefftz, ...diag } = diagnostics;
    return { ...rest, diagnostics: diag, stripLoads: stripWrenches(result), chordwise: options.chordwise === false ? null : result.strips.map((_, j) => stripChordwiseCp(model, result, j)) };
  }
  // ------------------------------------------------------------------ panel resultant about any point
  function resultantOfPanels(result, about = [0, 0, 0]) {
    const P = result.panels, F = [0, 0, 0], M = [0, 0, 0];
    for (let k = 0; k < P.count; k++) { const f = [P.force_N[3 * k], P.force_N[3 * k + 1], P.force_N[3 * k + 2]], dx = P.centroid_mm[3 * k] - about[0], dy = P.centroid_mm[3 * k + 1] - about[1], dz = P.centroid_mm[3 * k + 2] - about[2]; for (let d = 0; d < 3; d++) F[d] += f[d]; M[0] += dy * f[2] - dz * f[1]; M[1] += dz * f[0] - dx * f[2]; M[2] += dx * f[1] - dy * f[0]; }
    const C = P.momentAboutCentroid_Nmm; // tensor model: the pressure couple of each panel about its centroid
    if (C) for (let k = 0; k < P.count; k++) for (let d = 0; d < 3; d++) M[d] += C[3 * k + d];
    return { force: F, moment: M };
  }
  // ------------------------------------------------------------------ six-component strip loads
  // Exact algebra of the structural transfer (aerostruct/engine.js uses the same definition):
  //   strip j on [y0, y1] has the pressure resultant force F_j and moment M_j about the aircraft origin;
  //   it is carried as a uniform force intensity f_j = F_j / (y1 - y0) on the load line
  //   r(y) = transformPoint(g, y, [0.25 c(y), 0]) plus a uniform couple intensity
  //   m_j = (M_j - (integral of r dy over [y0, y1]) x f_j) / (y1 - y0).
  //   Then the integral of f is F_j and the integral of r x f + m is M_j, so the force and the moment about
  //   ANY point equal those of the panel pressures (to the quadrature tolerance of the line integral).
  const LOAD_LINE_FRACTION = 0.25;
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const GAUSS4 = [[0.06943184420297371, 0.1739274225687269], [0.33000947820757187, 0.3260725774312731], [0.6699905217924281, 0.3260725774312731], [0.9305681557970262, 0.1739274225687269]];
  // Adaptive 4-point Gauss-Legendre quadrature of a vector function (bisection until two levels agree).
  function adaptiveIntegral(fn, a, b, tolerance = 1e-12, depth = 20) {
    const gauss = (lo, hi) => { let out = null; for (const [t, w] of GAUSS4) { const v = fn(lo + t * (hi - lo)); if (!out) out = new Array(v.length).fill(0); for (let i = 0; i < v.length; i++) out[i] += v[i] * w * (hi - lo); } return out; };
    const refine = (lo, hi, whole, d) => {
      const mid = 0.5 * (lo + hi), left = gauss(lo, mid), right = gauss(mid, hi), sum = left.map((v, i) => v + right[i]);
      let rel = 0; for (let i = 0; i < sum.length; i++) rel = Math.max(rel, Math.abs(sum[i] - whole[i]) / Math.max(1, Math.abs(sum[i])));
      if (d === 0 || rel <= tolerance) return sum;
      const x = refine(lo, mid, left, d - 1), y = refine(mid, hi, right, d - 1); return x.map((v, i) => v + y[i]);
    };
    return refine(a, b, gauss(a, b), depth);
  }
  function loadLinePoint(g, y, fraction = LOAD_LINE_FRACTION) { return Geometry.transformPoint(g, y, [fraction * Geometry.chordAt(g, y), 0]); }
  function lineIntegral(g, a, b, fraction = LOAD_LINE_FRACTION) { return b > a ? adaptiveIntegral(y => loadLinePoint(g, y, fraction), a, b) : [0, 0, 0]; }
  // Rows [y0, y1, Fx, Fy, Fz, Mx, My, Mz] of the wing-surface strips (moment about the aircraft origin). The flat
  // tip cap, if any, is excluded exactly as in evaluate(); the rows sum to semiWing.force_N and momentAboutRootOrigin_Nmm.
  function stripWrenches(result) {
    const P = result.panels, ni = 2 * result.mesh.chordPanelsPerSurface, C = P.momentAboutCentroid_Nmm;
    return result.strips.map((st, j) => {
      const w = [st.y0, st.y1, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < ni; i++) {
        const k = j * ni + i, fx = P.force_N[3 * k], fy = P.force_N[3 * k + 1], fz = P.force_N[3 * k + 2], x = P.centroid_mm[3 * k], y = P.centroid_mm[3 * k + 1], z = P.centroid_mm[3 * k + 2];
        w[2] += fx; w[3] += fy; w[4] += fz; w[5] += y * fz - z * fy; w[6] += z * fx - x * fz; w[7] += x * fy - y * fx;
        if (C) { w[5] += C[3 * k]; w[6] += C[3 * k + 1]; w[7] += C[3 * k + 2]; } // tensor model: the panel's pressure couple
      }
      return w;
    });
  }
  function checkRows(rows, L, name) {
    if (!Array.isArray(rows) || !rows.length) throw new Error(`${name}: give at least one strip.`);
    rows.forEach((r, i) => {
      if (!Array.isArray(r) || r.length !== 8 || !r.every(Number.isFinite)) throw new Error(`${name}: strip ${i + 1} must be [y0, y1, Fx, Fy, Fz, Mx, My, Mz] with finite numbers.`);
      if (!(r[0] >= 0 && r[1] > r[0] && r[1] <= L * (1 + 1e-12))) throw new Error(`${name}: strip ${i + 1} must satisfy 0 <= y0 < y1 <= semi-span.`);
      if (i && Math.abs(r[0] - rows[i - 1][1]) > 1e-9 * L) throw new Error(`${name}: strips must be contiguous from the root to the tip.`);
    });
    if (rows[0][0] !== 0 || Math.abs(rows[rows.length - 1][1] - L) > 1e-9 * L) throw new Error(`${name}: strips must cover the semi-span from y = 0 to the tip.`);
  }
  // Uniform force and couple intensities of each strip (see the algebra above).
  function stripRepresentation(g, rows, fraction = LOAD_LINE_FRACTION) {
    return rows.map(r => {
      const [y0, y1] = r, h = y1 - y0, F = r.slice(2, 5), M = r.slice(5, 8), f = F.map(v => v / h), c = cross3(lineIntegral(g, y0, y1, fraction), f);
      if(Geometry.closedTip(g)){
        const norms=adaptiveIntegral(y=>{const c=Geometry.chordAt(g,y);return [c,c*c];},y0,y1);
        const density=F.map(v=>v/norms[0]),R=adaptiveIntegral(y=>loadLinePoint(g,y,fraction).map(v=>v*Geometry.chordAt(g,y)),y0,y1),arm=cross3(R,density);
        return {y0,y1,F,M,f:density,m:M.map((v,d)=>(v-arm[d])/norms[1]),geometricTaper:true,norms};
      }
      return { y0, y1, F, M, f, m: M.map((v, d) => (v - c[d]) / h) };
    });
  }
  // Wrench [F; M about the origin] of the load-line part beyond y* of a strip representation (exact for it).
  function outboardOfStation(g, rep, ystar, fraction = LOAD_LINE_FRACTION) {
    const W = [0, 0, 0, 0, 0, 0];
    for (const s of rep) {
      if (s.y1 <= ystar) continue;
      if (s.y0 >= ystar) { for (let d = 0; d < 3; d++) { W[d] += s.F[d]; W[3 + d] += s.M[d]; } continue; }
      if(s.geometricTaper){
        const n=adaptiveIntegral(y=>{const c=Geometry.chordAt(g,y);return [c,c*c];},ystar,s.y1);
        const R=adaptiveIntegral(y=>loadLinePoint(g,y,fraction).map(v=>v*Geometry.chordAt(g,y)),ystar,s.y1),arm=cross3(R,s.f);
        for(let d=0;d<3;d++){W[d]+=s.f[d]*n[0];W[3+d]+=arm[d]+s.m[d]*n[1];}
        continue;
      }
      const h = s.y1 - ystar, c = cross3(lineIntegral(g, ystar, s.y1, fraction), s.f);
      for (let d = 0; d < 3; d++) { W[d] += s.f[d] * h; W[3 + d] += c[d] + s.m[d] * h; }
    }
    return W;
  }
  // Monotone piecewise-cubic Hermite interpolation (Fritsch & Carlson 1980; end slopes as in Moler's pchip).
  function pchip(x, v) {
    const n = x.length, h = new Float64Array(n - 1), del = new Float64Array(n - 1), d = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; del[i] = (v[i + 1] - v[i]) / h[i]; }
    if (n === 2) { d[0] = d[1] = del[0]; }
    else {
      for (let i = 1; i < n - 1; i++) if (del[i - 1] * del[i] > 0) { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]); }
      const end = (h0, h1, d0, d1) => { let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1); if (Math.sign(s) !== Math.sign(d0)) s = 0; else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0; return s; };
      d[0] = end(h[0], h[1], del[0], del[1]); d[n - 1] = end(h[n - 2], h[n - 3], del[n - 2], del[n - 3]);
    }
    return t => {
      if (t <= x[0]) return v[0]; if (t >= x[n - 1]) return v[n - 1];
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= t) lo = mid; else hi = mid; }
      const s = (t - x[lo]) / h[lo], s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * v[lo] + (s3 - 2 * s2 + s) * h[lo] * d[lo] + (-2 * s3 + 3 * s2) * v[lo + 1] + (s3 - s2) * h[lo] * d[lo + 1];
    };
  }
  // Outboard (cut) wrench of one mesh level as a continuous function of the station: exact sums at the level's
  // strip boundaries, PCHIP between them (a smooth reconstruction, used to combine levels with different strips).
  function cumulativeWrench(rows) {
    const n = rows.length, x = [rows[0][0], ...rows.map(r => r[1])], v = Array.from({ length: 6 }, () => new Float64Array(n + 1));
    for (let k = n - 1; k >= 0; k--) for (let d = 0; d < 6; d++) v[d][k] = v[d][k + 1] + rows[k][2 + d];
    const f = v.map(c => pchip(x, c));
    return { x, at: y => f.map(fn => fn(y)) };
  }

  // ------------------------------------------------------------------ mesh-refinement sequence and admission
  // A sequence refines the chordwise panels at a fixed spanwise mesh and the spanwise strips at a fixed
  // chordwise mesh (7 solves; the base mesh is shared), plus ONE mesh refined in both directions (the joint mesh;
  // 8 solves). Each direction has four levels with 1/n proportional to 6 : 4 : 3 : 2. The delivered load is the
  // Richardson extrapolation of the quadratic polynomial in 1/n through the three finest levels of each
  // direction, combined additively, plus the cross term:
  //   Q_ext = Q_chord(1/c -> 0) + Q_span(1/s -> 0) - Q(base) + X,   X = f D,
  //   D = Q(cJ, sJ) - Q(cJ, sb) - Q(cb, sJ) + Q(cb, sb),   f = (1/cb)(1/sb) / ((1/cJ - 1/cb)(1/sJ - 1/sb)).
  // The additive combination alone is exact only for a separable error E(c, s) = A(c) + B(s); with a cross term
  // E = A + B + k / (c s) it misses -k / (cb sb), which f D restores exactly. Measured on the rectangular NACA 0012
  // AR 6 wing (4 x 5 joint grid, 32 to 96 chordwise x 16 to 64 strips; 6e30853): every coefficient has this
  // bilinear cross term, with k constant to within 30 % (CDi: 4 %) over nine joint meshes beyond the coarsest
  // levels; uncorrected it biased CDi by +2.3e-6 (40 % of U) and Cm by -1.9e-5 (more than U). The joint mesh is
  // taken from the finer levels: Standard 48 x 24 panels (24 per surface, 24 strips; f = -9), Fine 96 x 24
  // (48 per surface, 24 strips; f = 9); levels coarser than that are not yet bilinear.
  // The same fixed level weights apply to every quantity, so the extrapolated strip loads, their resultants and
  // the cut loads are one consistent, exactly conservative load set. The uncertainty of Q_ext is
  //   U = Fs * ( sum over the two directions of max( spread + stability, kappa * |correction| ) + kappa * |X| ),
  // spread = largest difference between the linear (two finest), quadratic (three finest) and observed-order
  // (Celik et al. 2008, order bounded to [0.5, 2]) extrapolations, stability = change of the quadratic
  // extrapolation when the three coarser levels are used instead, correction = quadratic extrapolation minus the
  // finest level (what the extrapolation added), Fs = 1.25, kappa = 0.5. The correction terms keep U from
  // claiming that an extrapolation removed more than half of its own correction when the levels agree with each
  // other but are not yet asymptotic (the spanwise observed order still falls from about 0.9 to 0.7 between 32
  // and 96 strips); kappa |X| does the same for the cross term (its coefficient k varies by up to 30 % between
  // joint meshes). A sequence stored without the joint mesh (a study file written before the joint mesh existed)
  // is combined additively without X, as it was when it was written (crossTerm.estimated false).
  // Validated against far finer reference meshes (validation/reference_study.mjs) in test_wing_aero_admission.mjs
  // and the documentation.
  const SEQUENCES = Object.freeze({
    standard: Object.freeze({ label: 'Standard', chord: Object.freeze([16, 24, 32, 48]), span: Object.freeze([8, 12, 16, 24]), baseChord: 32, baseSpan: 16, joint: Object.freeze([24, 24]) }),
    fine: Object.freeze({ label: 'Fine', chord: Object.freeze([32, 48, 64, 96]), span: Object.freeze([16, 24, 32, 48]), baseChord: 32, baseSpan: 16, joint: Object.freeze([48, 24]) }),
  });
  // Admission (no absolute torque floor; every criterion is stated in the admission table):
  //  * torque at each structural cut is RESOLVED only if U_T <= 10% of |T| AND every mesh that carries weight in the
  //    delivered load gives a torque of the same sign as T. Otherwise its magnitude is not resolved, and its sign is
  //    not resolved either if U_T >= |T| or the meshes disagree in sign. Torque values are shown only if every
  //    reported cut is resolved.
  //  * twist (needs the structure): with the frame elements' torsional compliance k = (element length / projected
  //    length) / GJ (twist per unit torque per unit projected span) the twist uncertainty is
  //        dtheta(y) = integral from 0 to y of Ubar(eta) k(eta) d eta,
  //    Ubar = upper envelope of U_T at 16 equally spaced cuts (zero at the tip). The twist claim is
  //        'resolved'   every reported torque resolved and dtheta <= 10% |theta| at 25, 50, 75% span and at the tip;
  //        'negligible' otherwise, if the bound on the true twist |theta| + dtheta, applied as an incidence change with
  //                     the thin-airfoil lift slope 2 pi (an upper bound for the sectional response), changes the
  //                     semi-wing lift by at most 1% (half the lift-consistency tolerance):
  //                     q 2 pi integral of c (|theta| + dtheta) dy <= 0.01 |L|. Torque and twist values are withheld
  //                     (only the bound is reported); the rest of the coupled result is shown;
  //        'unresolved' otherwise: the coupled result is withheld (the app refuses rather than overclaims).
  //  * one-way coupling (needs the structure): the load is computed on the rigid wing, so the computed twist itself,
  //    applied as an incidence change with the same lift slope, must change the lift by at most 2% (the
  //    lift-consistency tolerance); a more flexible wing is refused (aeroelastic redistribution is not modelled);
  //  * root force and root bending moment: U / magnitude <= 5%; lift: extrapolated pressure and Trefftz-plane lift
  //    within 2% of max(|CL|, 0.05).
  const ADMISSION = Object.freeze({ safetyFactor: 1.25, correctionFraction: 0.5, orderBounds: Object.freeze([0.5, 2]),
    torqueTolerance: 0.10, twistTolerance: 0.10, twistLiftFraction: 0.01, sectionLiftSlope: 2 * Math.PI, torsionStations: 16, rigidWingTolerance: 0.02,
    forceTolerance: 0.05, bendingTolerance: 0.05, liftConsistencyTolerance: 0.02, liftConsistencyFloorCL: 0.05,
    stations: Object.freeze([0.25, 0.5, 0.75]) });
  function sequenceDefinition(name) { const d = SEQUENCES[name]; if (!d) throw new Error(`Unknown mesh sequence "${name}": use ${Object.keys(SEQUENCES).join(' or ')}.`); return d; }
  // joint = false: the seven meshes of a sequence stored before the joint mesh existed (additive combination only)
  function sequenceMeshes(name, joint = true) {
    const d = sequenceDefinition(name), list = [], add = (c, s) => { if (!list.some(m => m.chordPanels === c && m.spanPanels === s)) list.push({ chordPanels: c, spanPanels: s }); };
    d.chord.forEach(c => add(c, d.baseSpan)); d.span.forEach(s => add(d.baseChord, s));
    if (joint) add(d.joint[0], d.joint[1]);
    return list;
  }
  // factor f of the cross-term estimate X = f D (exact for a k / (c s) cross term)
  function crossFactor(d) { const [cJ, sJ] = d.joint; return (1 / d.baseChord) * (1 / d.baseSpan) / ((1 / cJ - 1 / d.baseChord) * (1 / sJ - 1 / d.baseSpan)); }
  // does a stored sequence carry its joint mesh?
  function sequenceHasJoint(seq) { const d = sequenceDefinition(seq?.sequence); return (seq.levels || []).some(l => l && l.chordPanels === d.joint[0] && l.spanPanels === d.joint[1]); }
  // Lagrange weights of the polynomial through (h_i, Q_i) evaluated at h = 0.
  const lagrangeWeights0 = h => h.map((hi, i) => h.reduce((w, hj, j) => (j === i ? w : w * (0 - hj) / (hi - hj)), 1));
  function sequenceWeights(name, joint = true) {
    const d = sequenceDefinition(name), w = new Map(), add = (c, s, v) => { const k = c + 'x' + s; w.set(k, (w.get(k) || 0) + v); };
    const three = a => a.slice(a.length - 3), wc = lagrangeWeights0(three(d.chord).map(v => 1 / v)), ws = lagrangeWeights0(three(d.span).map(v => 1 / v));
    three(d.chord).forEach((c, i) => add(c, d.baseSpan, wc[i])); three(d.span).forEach((s, i) => add(d.baseChord, s, ws[i])); add(d.baseChord, d.baseSpan, -1);
    if (joint) { const f = crossFactor(d), [cJ, sJ] = d.joint; add(cJ, sJ, f); add(cJ, d.baseSpan, -f); add(d.baseChord, sJ, -f); add(d.baseChord, d.baseSpan, f); }
    return [...w.entries()].map(([k, v]) => { const [c, s] = k.split('x').map(Number); return { chordPanels: c, spanPanels: s, weight: v }; }).filter(x => Math.abs(x.weight) > 1e-12);
  }
  // Observed order of convergence from three levels n3 < n2 < n1 (Celik et al. 2008, non-uniform ratios).
  function observedOrder(n3, n2, n1, f3, f2, f1, bounds = ADMISSION.orderBounds) {
    const r21 = n1 / n2, r32 = n2 / n3, e21 = f2 - f1, e32 = f3 - f2, scale = Math.max(Math.abs(f1), Math.abs(f2), Math.abs(f3), 1e-300);
    if (Math.abs(e21) <= 1e-13 * scale || Math.abs(e32) <= 1e-13 * scale) return { order: null, orderUsed: null, monotone: false, extrapolated: f1 };
    const sgn = Math.sign(e32 / e21);
    if (sgn < 0) return { order: null, orderUsed: 1, monotone: false, extrapolated: f1 + (f1 - f2) / (r21 - 1) }; // oscillatory: first order
    let p = 1;
    for (let it = 0; it < 200; it++) { const pn = Math.abs(Math.log(Math.abs(e32 / e21)) + Math.log((r21 ** p - 1) / (r32 ** p - 1))) / Math.log(r21); if (!Number.isFinite(pn)) { p = NaN; break; } if (Math.abs(pn - p) < 1e-12) { p = pn; break; } p = pn; }
    const used = Number.isFinite(p) ? Math.min(bounds[1], Math.max(bounds[0], p)) : 1;
    return { order: Number.isFinite(p) ? p : null, orderUsed: used, monotone: true, extrapolated: f1 + (f1 - f2) / (r21 ** used - 1) };
  }
  // Extrapolated value and uncertainty of a scalar that is linear in the level loads: levelValue(c, s).
  function sequenceEstimate(name, levelValue, settings = ADMISSION, joint = true) {
    const d = sequenceDefinition(name);
    const dir = (ns, val) => {
      const m = ns.length, h = ns.map(v => 1 / v), Q = ns.map(val), lin = (a, w) => w.reduce((t, wi, i) => t + wi * Q[a + i], 0);
      const quad = lin(m - 3, lagrangeWeights0(h.slice(m - 3))), quad0 = lin(m - 4, lagrangeWeights0(h.slice(m - 4, m - 1))), linear = lin(m - 2, lagrangeWeights0(h.slice(m - 2)));
      const ob = observedOrder(ns[m - 3], ns[m - 2], ns[m - 1], Q[m - 3], Q[m - 2], Q[m - 1], settings.orderBounds);
      const spread = Math.max(Math.abs(quad - linear), Math.abs(quad - ob.extrapolated), Math.abs(ob.extrapolated - linear)), stability = Math.abs(quad - quad0);
      const correction = quad - Q[m - 1], kappa = settings.correctionFraction ?? ADMISSION.correctionFraction, term = Math.max(spread + stability, kappa * Math.abs(correction));
      return { levels: ns.slice(), values: Q, quadratic: quad, linear, observed: ob.extrapolated, observedOrder: ob.order, monotone: ob.monotone, quadraticCoarse: quad0, spread, stability, finest: Q[m - 1],
        correction, term, correctionGoverns: kappa * Math.abs(correction) > spread + stability };
    };
    const chord = dir(d.chord, c => levelValue(c, d.baseSpan)), span = dir(d.span, s => levelValue(d.baseChord, s)), base = levelValue(d.baseChord, d.baseSpan);
    let cross = null;
    if (joint) {
      const [cJ, sJ] = d.joint, f = crossFactor(d), D = levelValue(cJ, sJ) - levelValue(cJ, d.baseSpan) - levelValue(d.baseChord, sJ) + base, X = f * D;
      cross = { mesh: [cJ, sJ], factor: f, difference: D, value: X, term: (settings.correctionFraction ?? ADMISSION.correctionFraction) * Math.abs(X) };
    }
    return { value: chord.quadratic + span.quadratic - base + (cross ? cross.value : 0), uncertainty: settings.safetyFactor * (chord.term + span.term + (cross ? cross.term : 0)),
      base, finest: chord.finest + span.finest - base, chord, span, cross };
  }
  // Runs every mesh of a sequence (Worker or Node). Models are cached by geometry and mesh, so a new angle of
  // attack or speed on the same wing costs only the surface evaluations. options: cache, progress(text),
  // targetLift_N (trims alpha so the EXTRAPOLATED pressure lift of both halves equals it), tipClosure, solver.
  function runSequence(rawGeometry, rawFlow = {}, name = 'standard', options = {}) {
    const def = sequenceDefinition(name), meshes = sequenceMeshes(name), cache = options.cache || new Map(), t0 = now();
    const tipClosure = options.tipClosure ?? DEFAULT_MESH.tipClosure, work = {}; // work: matrix storage shared by the meshes
    const models = meshes.map((m, i) => {
      options.progress?.(`Mesh ${i + 1} of ${meshes.length}: ${2 * m.chordPanels} × ${m.spanPanels} panels (around × spanwise)…`);
      return prepare(rawGeometry, { ...m, tipClosure }, { cache, solver: options.solver, referenceLimits: options.referenceLimits, work });
    });
    const weights = sequenceWeights(name), weightOf = m => weights.find(w => w.chordPanels === m.chordPanels && w.spanPanels === m.spanPanels)?.weight || 0;
    let alphaDeg = normalizeFlow(rawFlow).alphaDeg, trim = null;
    if (options.targetLift_N != null) {
      finiteIn(options.targetLift_N, 'Target lift (N)', -1e6, 1e6);
      const lift = a => models.reduce((t, model, i) => t + weightOf(meshes[i]) * evaluate(model, { ...rawFlow, alphaDeg: a }).aircraft.lift_N, 0) - options.targetLift_N;
      let a0 = 0, a1 = 4, f0 = lift(a0), f1 = lift(a1);
      for (let it = 0; it < 40 && Math.abs(f1) > 1e-10 * Math.max(1, Math.abs(options.targetLift_N)); it++) {
        const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
        if (!Number.isFinite(a2) || Math.abs(a2) > LIMITS.maxAlphaDeg) throw new Error(`The target lift needs |alpha| > ${LIMITS.maxAlphaDeg} deg at this speed and density, outside the attached-flow range of this module.`);
        a0 = a1; f0 = f1; a1 = a2; f1 = lift(a1);
      }
      alphaDeg = a1; trim = { alphaDeg: a1, residual_N: f1, liftMeasure: 'extrapolated pressure lift of both halves' };
    }
    const flow = { ...rawFlow, alphaDeg }, results = models.map(model => evaluate(model, flow));
    const levels = results.map((r, i) => ({ chordPanels: meshes[i].chordPanels, spanPanels: meshes[i].spanPanels, panels: r.mesh.panels, strips: stripWrenches(r),
      coefficients: { CL: r.coefficients.CL, CLTrefftz: r.coefficients.CLTrefftz, CDpressure: r.coefficients.CDpressure, CDiTrefftz: r.coefficients.CDiTrefftz, Cm: r.coefficients.Cm },
      liftN: r.aircraft.lift_N, roundedTip: r.mesh.roundedTip, closedTip: r.mesh.closedTip, tipCap: r.semiWing.tipCap,
      diagnostics: { minCp: r.diagnostics.minCp, maxCp: r.diagnostics.maxCp, liftTrefftzRelativeDifference: r.diagnostics.liftTrefftzRelativeDifference, linearSolver: r.diagnostics.linearSolver, linearRelativeResidual: r.diagnostics.linearRelativeResidual, trailingEdgeDeltaCpInboard90: r.diagnostics.trailingEdgeDeltaCpInboard90 },
      warnings: r.warnings, timing: r.timing, modelCacheHit: !!models[i].lastCacheHit }));
    const bi = meshes.findIndex(m => m.chordPanels === def.baseChord && m.spanPanels === def.baseSpan);
    return { version: VERSION, kind: 'meshSequence', sequence: name, label: def.label, definition: { chord: def.chord.slice(), span: def.span.slice(), baseChord: def.baseChord, baseSpan: def.baseSpan, joint: def.joint.slice() },
      weights, flow: results[bi].flow, reference: results[bi].reference, scope: SCOPE, tipClosure, levels, base: compactResult(models[bi], results[bi]), trim, timing: { totalMs: now() - t0 } };
  }
  // Delivery stations: the finest spanwise level's strip boundaries (its rounded-tip zone merged into the last
  // strip), snapped to structural stations within 0.25 mm, wide strips halved, every station kept at least
  // 0.1 mm from all others (the structural engine's rule for distinct load and rib stations).
  function deliveryStations(levelRows, roundedTip, L, snap = []) {
    let nodes = [0, ...levelRows.map(r => r[1])];
    if (roundedTip) nodes = [...nodes.filter(y => y <= roundedTip.start_mm + 1e-9 * L && y < L), L];
    nodes[0] = 0; nodes[nodes.length - 1] = L;
    const stations = [...new Set(snap.filter(t => Number.isFinite(t) && t > 0 && t < L))];
    for (const t of stations) { let k = -1, best = Infinity; for (let i = 1; i < nodes.length - 1; i++) { const d = Math.abs(nodes[i] - t); if (d < best) { best = d; k = i; } } if (k > 0 && best > 0 && best < 0.25) nodes[k] = t; }
    nodes = [...new Set(nodes)].sort((a, b) => a - b);
    // strips wider than L/32 are halved once: the delivered load is uniform within a strip, so a finer delivery
    // grid reduces its interpolation difference from the extrapolated cut loads (that difference is part of U)
    nodes = nodes.flatMap((y, i) => (i && y - nodes[i - 1] > L / 32 ? [0.5 * (nodes[i - 1] + y), y] : [y]));
    return nodes.filter((y, i) => i === 0 || i === nodes.length - 1 || (stations.every(t => t === y || Math.abs(t - y) >= 0.1) && y - nodes[i - 1] >= 0.1 && nodes[i + 1] - y >= 0.1));
  }
  // Combines a sequence into the delivered (extrapolated) six-component strip load. options.snapStations.
  function combineSequence(rawGeometry, seq, options = {}) {
    const g = aeroGeometry(rawGeometry), L = g.semiSpan, def = sequenceDefinition(seq?.sequence);
    // a flat tip cap closes the potential solution but its pressure is not integrated (non-convergent edge singularity),
    // so such a load would omit the tip side force: only the rounded tip (the default) is delivered to the structure
    if (seq?.tipClosure === 'flat' || (seq?.levels || []).some(l => l && l.tipCap)) throw new Error('A flat tip cap leaves its pressure out of the load, so this sequence cannot be applied to the structure: use the rounded tip (the default).');
    const find = (c, s) => { const l = (seq.levels || []).find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`The mesh sequence has no ${2 * c} × ${s} level.`); return l; };
    const joint = sequenceHasJoint(seq);
    for (const m of sequenceMeshes(seq.sequence, joint)) checkRows(find(m.chordPanels, m.spanPanels).strips, L, `Level ${2 * m.chordPanels} × ${m.spanPanels}`);
    const weights = sequenceWeights(seq.sequence, joint), cum = weights.map(w => ({ w: w.weight, f: cumulativeWrench(find(w.chordPanels, w.spanPanels).strips) }));
    const finest = find(def.baseChord, def.span[def.span.length - 1]), nodes = deliveryStations(finest.strips, finest.roundedTip, L, options.snapStations || []);
    const C = y => { const W = [0, 0, 0, 0, 0, 0]; for (const { w, f } of cum) { const v = f.at(y); for (let d = 0; d < 6; d++) W[d] += w * v[d]; } return W; };
    const values = nodes.map(C); values[values.length - 1] = [0, 0, 0, 0, 0, 0];
    const strips = nodes.slice(0, -1).map((y0, i) => [y0, nodes[i + 1], ...values[i].map((v, d) => v - values[i + 1][d])]);
    const est = f => sequenceEstimate(seq.sequence, (c, s) => f(find(c, s)), ADMISSION, joint);
    const coefficients = { CL: est(l => l.coefficients.CL), CLTrefftz: est(l => l.coefficients.CLTrefftz), CDpressure: est(l => l.coefficients.CDpressure), CDiTrefftz: est(l => l.coefficients.CDiTrefftz), Cm: est(l => l.coefficients.Cm) };
    const rootWrench = [0, 1, 2, 3, 4, 5].map(d => est(l => l.strips.reduce((t, r) => t + r[2 + d], 0)));
    const lift = { pressure: coefficients.CL.value, trefftz: coefficients.CLTrefftz.value, relativeDifference: Math.abs(coefficients.CL.value - coefficients.CLTrefftz.value) / Math.max(Math.abs(coefficients.CL.value), ADMISSION.liftConsistencyFloorCL) };
    const drag = { pressure: coefficients.CDpressure.value, trefftz: coefficients.CDiTrefftz.value, difference: coefficients.CDpressure.value - coefficients.CDiTrefftz.value, combinedUncertainty: coefficients.CDpressure.uncertainty + coefficients.CDiTrefftz.uncertainty };
    const crossTerm = joint ? { estimated: true, mesh: def.joint.slice(), factor: crossFactor(def) } : { estimated: false, mesh: null, factor: 0, note: 'stored sequence without the joint mesh: combined additively, cross term not estimated' };
    return { version: VERSION, kind: 'aeroStrips', sequence: seq.sequence, lineFraction: LOAD_LINE_FRACTION, strips, stations: nodes, weights, crossTerm, coefficients, rootWrench,closedTip:Geometry.closedTip(g),reconstruction:Geometry.closedTip(g)?'Force density proportional to actual chord; residual couple density proportional to chord squared; six source-strip resultants preserved':'Uniform force plus restoring couple',
      deliveredRootWrench: strips.reduce((W, r) => W.map((v, d) => v + r[2 + d]), [0, 0, 0, 0, 0, 0]), consistency: { lift, drag } };
  }
  // Admission of a combined load against the structural axis. cuts: [{ y, reference: [x, y, z], normal: [..],
  // root: true for the root (all loads, no plane), structuralTorque (optional, the engine's own cut torque of the
  // delivered load, used as a transfer check) }]. options.torsion (optional, from the structural result):
  // { cuts: [cut at k L / n, k = 0 .. n - 1, root first], elements: [{ y0, y1, k }] (twist per unit torque per unit
  // projected span), twist: { y: [...], theta: [...] } (rad, the coupled solution) }. Returns rows, the twist claim and
  // an overall decision; it never changes the load.
  function closedTipSectionAdmission(g,seq,combined,cuts,set){
    const L=g.semiSpan,joint=sequenceHasJoint(seq),rep=stripRepresentation(g,combined.strips,combined.lineFraction),memo=new Map();
    const level=(c,s)=>{const key=c+'x'+s;if(!memo.has(key)){const l=seq.levels.find(v=>v.chordPanels===c&&v.spanPanels===s);if(!l)throw Error('Missing aerodynamic mesh '+key);memo.set(key,stripRepresentation(g,l.strips,combined.lineFraction));}return memo.get(key);};
    const about=(W,P)=>[...W.slice(0,3),W[3]-(P[1]*W[2]-P[2]*W[1]),W[4]-(P[2]*W[0]-P[0]*W[2]),W[5]-(P[0]*W[1]-P[1]*W[0])];
    const rows=[];
    for(const cut of cuts){
      const y=cut.root?0:cut.y,P=cut.reference,W=about(outboardOfStation(g,rep,y,combined.lineFraction),P);
      const estimates=Array.from({length:6},(_,d)=>sequenceEstimate(seq.sequence,(c,s)=>about(outboardOfStation(g,level(c,s),y,combined.lineFraction),P)[d],set,joint));
      const U=estimates.map((e,d)=>e.uncertainty+Math.abs(e.value-W[d]));
      for(const[k,label,ids,tol]of [['force','Force',[0,1,2],set.forceTolerance],['bending','Bending moment',[3,5],set.bendingTolerance]]){
        const value=Math.hypot(...ids.map(d=>W[d])),uncertainty=Math.hypot(...ids.map(d=>U[d])),relative=value?uncertainty/value:uncertainty===0?0:Infinity;
        rows.push({kind:k,label:(cut.root?'Root':Math.round(100*y/L)+'% span')+' '+label,y,value,uncertainty,relative,measure:relative,tolerance:tol,resolved:relative<=tol,admitted:relative<=tol,estimate:ids.map(d=>estimates[d])});
      }
      if(cut.structuralWrench){
        const SW=[...cut.structuralWrench.force,...cut.structuralWrench.moment],res=Math.max(...W.map((v,d)=>Math.abs(v-SW[d])/Math.max(1,Math.abs(v))));
        rows.push({kind:'transfer',label:(cut.root?'Root':Math.round(100*y/L)+'% span')+' six-component transfer',value:res,uncertainty:0,relative:res,measure:res,tolerance:1e-7,resolved:res<=1e-7,admitted:res<=1e-7});
      }
    }
    const lc=combined.consistency.lift;
    rows.push({kind:'liftConsistency',label:'Lift: pressure vs Trefftz plane',value:lc.pressure,reference:lc.trefftz,measure:lc.relativeDifference,relative:lc.relativeDifference,tolerance:set.liftConsistencyTolerance,resolved:lc.relativeDifference<=set.liftConsistencyTolerance,admitted:lc.relativeDifference<=set.liftConsistencyTolerance});
    const failed=rows.filter(r=>!r.admitted).map(r=>r.label);
    return {version:VERSION,sequence:seq.sequence,mode:'closed-tip-rigid-load-sectional-response',admitted:!failed.length,rows,failed,settings:set,twist:null,crossTerm:{estimated:joint},claims:{torque:'withheld',twist:'withheld',normalStress:'nominal-section',displacement:'pure-bending-components',aeroelastic:'not assessed'},drag:combined.consistency.drag,
      notes:['Rigid-wing pressures are treated as prescribed loads for a sectional structural study. Admission here assesses numerical load transfer, not strength or full motion. This is not a full aeroelastic admission.','Actual zero tip chord is retained. Force density follows chord and residual free-couple density follows chord squared, conserving all source-strip forces and moments. Local recovery remains a sub-strip projection.','Torsion, shear-centre torque, shear deformation and local 3-D concentrations are not resolved. A delta may have finite formal bending translation and an unbounded tip slope; this does not establish small-rotation validity near the apex. Large inboard rotations require a nonlinear model. Exact-apex stress is undefined.'],
      method:'Six-component conservative geometric projection; force and bending uncertainty at the root and 25/50/75% span <=5%, pressure/Trefftz lift agreement <=2%, exact transfer checked independently against the structural cuts. No torsional or aeroelastic claim.'};
  }
  function admission(rawGeometry, seq, combined, cuts, options = {}) {
    const g = aeroGeometry(rawGeometry), L = g.semiSpan, set = { ...ADMISSION, ...(options.settings || {}) };
    sequenceDefinition(seq.sequence);
    if (!combined || combined.sequence !== seq.sequence) throw new Error('Combine this mesh sequence before the admission test.');
    if (!Array.isArray(cuts) || !cuts.length || !cuts[0].root) throw new Error('The admission test needs the structural root cut first.');
    if(Geometry.closedTip(g)){
      if(options.sectionOnly!==true)throw Error('Exact-tip structural response requires the explicitly scoped normal-section/bending assessment, not spatial-beam torsional admission.');
      return closedTipSectionAdmission(g,seq,combined,cuts,set);
    }
    const joint = sequenceHasJoint(seq), q = seq.flow.dynamicPressure_Pa * 1e-6, refs = seq.reference, weighted = sequenceWeights(seq.sequence, joint);
    const levelCum = new Map(), find = (c, s) => { const k = c + 'x' + s; if (!levelCum.has(k)) { const l = seq.levels.find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`The mesh sequence has no ${2 * c} × ${s} level.`); levelCum.set(k, cumulativeWrench(l.strips)); } return levelCum.get(k); };
    const delivered = stripRepresentation(g, combined.strips, combined.lineFraction);
    const unit = v => { const l = Math.hypot(...v); if (!(l > 0)) throw new Error('A structural cut normal is zero.'); return v.map(x => x / l); };
    const crossing = (P, n) => {
      const s = y => dot3(loadLinePoint(g, y, combined.lineFraction).map((v, d) => v - P[d]), n);
      if (s(0) >= 0) return 0; if (s(L) < 0) return L;
      let lo = 0, hi = L; for (let k = 0; k < 64; k++) { const mid = 0.5 * (lo + hi); if (s(mid) < 0) lo = mid; else hi = mid; }
      return 0.5 * (lo + hi);
    };
    // delivered torque, its sequence estimate and uncertainty, and the torques of the weighted meshes at one cut
    const torqueAt = cut => {
      const P = cut.reference, n = unit(cut.normal), ystar = cut.root ? 0 : crossing(P, n);
      const about = W => ({ F: W.slice(0, 3), M: [W[3] - (P[1] * W[2] - P[2] * W[1]), W[4] - (P[2] * W[0] - P[0] * W[2]), W[5] - (P[0] * W[1] - P[1] * W[0])] });
      const memo = new Map(), levelW = (c, s) => { const k = c + 'x' + s; if (!memo.has(k)) memo.set(k, about(find(c, s).at(ystar))); return memo.get(k); };
      const dw = about(outboardOfStation(g, delivered, ystar, combined.lineFraction));
      const torque = w => dot3(w.M, n), est = sequenceEstimate(seq.sequence, (c, s) => torque(levelW(c, s)), set, joint);
      const T = torque(dw), interp = Math.abs(T - est.value), U = est.uncertainty + interp;
      const meshTorques = weighted.map(w => ({ chordPanels: w.chordPanels, spanPanels: w.spanPanels, weight: w.weight, torque: torque(levelW(w.chordPanels, w.spanPanels)) }));
      const signsAgree = T !== 0 && meshTorques.every(m => Math.sign(m.torque) === Math.sign(T));
      return { ystar, n, levelW, dw, T, U, est, interp, meshTorques, signsAgree };
    };
    const rows = [];
    for (const cut of cuts) {
      const t = torqueAt(cut), relative = t.T !== 0 ? t.U / Math.abs(t.T) : Infinity;
      const resolved = relative <= set.torqueTolerance && t.signsAgree, signResolved = t.U < Math.abs(t.T) && t.signsAgree;
      const label = cut.root ? 'Root torque (shear-centre axis)' : `Torque at ${Math.round(100 * cut.y / L)}% span (y ${(+cut.y).toFixed(1)} mm)`;
      const row = { kind: 'torque', label, y: cut.root ? 0 : cut.y, crossing_mm: t.ystar, value: t.T, uncertainty: t.U, sequenceUncertainty: t.est.uncertainty, interpolation: t.interp,
        relative, measure: relative, tolerance: set.torqueTolerance, resolved, signResolved, meshSignsAgree: t.signsAgree, meshTorques: t.meshTorques,
        status: resolved ? 'resolved' : signResolved ? 'magnitude not resolved' : 'sign not resolved', admitted: resolved, estimate: t.est };
      if (Number.isFinite(cut.structuralTorque)) row.transferResidual = cut.structuralTorque - t.T;
      rows.push(row);
      if (cut.root) {
        const vec = (fn, name, tol, kind) => {
          const v = fn(t.dw), est = [0, 1, 2].map(d => sequenceEstimate(seq.sequence, (c, s) => fn(t.levelW(c, s))[d], set, joint));
          const U = Math.hypot(...est.map((x, d) => x.uncertainty + Math.abs(v[d] - x.value))), mag = Math.hypot(...v), e2 = mag > 0 ? U / mag : Infinity;
          rows.push({ kind, label: name, value: mag, vector: v, uncertainty: U, measure: e2, relative: e2, tolerance: tol, resolved: e2 <= tol, admitted: e2 <= tol, estimate: est });
        };
        vec(w => w.F, 'Root force |F|', set.forceTolerance, 'force');
        vec(w => { const tq = dot3(w.M, t.n); return w.M.map((v, d) => v - tq * t.n[d]); }, 'Root bending moment |M_b|', set.bendingTolerance, 'bending');
      }
    }
    const lc = combined.consistency.lift;
    rows.push({ kind: 'liftConsistency', label: 'Lift: pressure vs Trefftz plane', value: lc.pressure, reference: lc.trefftz, measure: lc.relativeDifference, relative: lc.relativeDifference, tolerance: set.liftConsistencyTolerance, resolved: lc.relativeDifference <= set.liftConsistencyTolerance, admitted: lc.relativeDifference <= set.liftConsistencyTolerance });
    const torqueRows = rows.filter(r => r.kind === 'torque'), torqueResolved = torqueRows.every(r => r.resolved);
    // twist claim from the structure's torsional compliance
    let twist = null;
    if (options.torsion) {
      const tor = options.torsion;
      if (!Array.isArray(tor.cuts) || !tor.cuts.length || !tor.cuts[0].root || !Array.isArray(tor.elements) || !tor.elements.length || !tor.twist) throw new Error('The twist assessment needs the structure: torsion cuts from the root, frame elements and the twist.');
      const tcut = tor.cuts.map(c => { const t = torqueAt(c); return { y: c.root ? 0 : c.y, T: t.T, U: t.U }; });
      const Y = [...tcut.map(c => c.y), L], Uv = [...tcut.map(c => c.U), 0];
      for (let i = 1; i < Y.length; i++) if (!(Y[i] > Y[i - 1])) throw new Error('Torsion cuts must increase from the root to the tip.');
      const els = tor.elements.map(e => ({ y0: e.y0, y1: e.y1, k: e.k }));
      if (!els.every(e => Number.isFinite(e.k) && e.k > 0 && e.y1 > e.y0)) throw new Error('Torsional compliance must be positive and finite on every frame element.');
      const dtheta = y => { let s = 0; for (let i = 0; i < Y.length - 1 && Y[i] < y; i++) { const a = Y[i], b = Math.min(Y[i + 1], y), Ub = Math.max(Uv[i], Uv[i + 1]); for (const e of els) { const lo = Math.max(a, e.y0), hi = Math.min(b, e.y1); if (hi > lo) s += Ub * e.k * (hi - lo); } } return s; };
      const ty = Array.from(tor.twist.y), tv = Array.from(tor.twist.theta);
      const thetaAt = y => { if (y <= ty[0]) return tv[0]; if (y >= ty[ty.length - 1]) return tv[tv.length - 1]; let lo = 0, hi = ty.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ty[m] <= y) lo = m; else hi = m; } const f = (y - ty[lo]) / (ty[hi] - ty[lo]); return tv[lo] + f * (tv[hi] - tv[lo]); };
      for (const c of tcut) { c.theta = thetaAt(c.y); c.dtheta = dtheta(c.y); }
      const stations = [...set.stations, 1].map(f => { const y = f * L, th = thetaAt(y), d = dtheta(y); return { y, theta: th, dtheta: d, bound: Math.abs(th) + d, relative: th !== 0 ? d / Math.abs(th) : Infinity }; });
      const N = 240, h = L / N, a0 = set.sectionLiftSlope; let I = 0, I0 = 0, maxBound = 0;
      for (let i = 0; i <= N; i++) { const y = i * h, w = i === 0 || i === N ? 0.5 : 1, c = Geometry.chordAt(g, y), th = Math.abs(thetaAt(y)), d = dtheta(y); I += w * c * (th + d); I0 += w * c * th; maxBound = Math.max(maxBound, th + d); }
      const CL = combined.coefficients.CL.value, Lsemi = Math.abs(CL) * q * refs.semiArea_mm2, liftChange = q * a0 * I * h, rigidChange = q * a0 * I0 * h;
      const liftEffect = Lsemi > 0 ? liftChange / Lsemi : Infinity, rigidWingEffect = Lsemi > 0 ? rigidChange / Lsemi : Infinity;
      const twistRelative = stations.every(st => st.relative <= set.twistTolerance), worstRelative = Math.max(...stations.map(st => st.relative));
      const status = torqueResolved && twistRelative ? 'resolved' : liftEffect <= set.twistLiftFraction ? 'negligible' : 'unresolved';
      twist = { status, stations, cuts: tcut, tipTheta: stations[stations.length - 1].theta, tipDtheta: stations[stations.length - 1].dtheta, maxBound, liftEffect, liftEffectTolerance: set.twistLiftFraction,
        rigidWingEffect, meanTolerance: Lsemi > 0 ? set.twistLiftFraction * Lsemi / (q * a0 * refs.semiArea_mm2) : 0, worstRelative, relativeTolerance: set.twistTolerance, torqueResolved, sectionLiftSlope: a0,
        method: 'dtheta(y) = integral of max(U_T) k over [0, y] with the frame elements\' torsional compliance k = (length / projected length) / GJ; negligible if q 2 pi integral c (|theta| + dtheta) dy <= 1% of |lift|.' };
      for (const r of torqueRows) if (!r.resolved) r.admitted = status === 'negligible';
      rows.push({ kind: 'twist', label: 'Twist (shear-centre axis)', y: L, value: twist.tipTheta, uncertainty: twist.tipDtheta, bound: maxBound, status,
        measure: status === 'resolved' ? worstRelative : liftEffect, relative: worstRelative, tolerance: status === 'resolved' ? set.twistTolerance : set.twistLiftFraction, resolved: status === 'resolved', admitted: status !== 'unresolved', twist });
      const rigidOk = rigidWingEffect <= set.rigidWingTolerance;
      rows.push({ kind: 'aeroelastic', label: 'One-way coupling: twist effect on lift', value: rigidWingEffect, measure: rigidWingEffect, relative: rigidWingEffect, tolerance: set.rigidWingTolerance, resolved: rigidOk, admitted: rigidOk });
    }
    const failed = rows.filter(r => !r.admitted);
    const notes = torqueRows.filter(r => !r.resolved).map(r => `${r.label}: ${r.status} (${r.value.toPrecision(3)} ± ${r.uncertainty.toPrecision(2)} N mm${r.meshSignsAgree ? '' : '; the meshes disagree in sign'})`);
    if (twist && twist.rigidWingEffect > set.rigidWingTolerance) notes.push(`The computed twist would change the lift by ${(100 * twist.rigidWingEffect).toFixed(1)}% if fed back: the rigid-wing load is not consistent with this flexible structure (aeroelastic redistribution is not modelled).`);
    if (!joint) notes.push('This load was stored with the seven meshes of an earlier version (no mesh refined in both directions): it is combined additively under the earlier separable rule; the cross term is not estimated and U does not contain it.');
    return { version: VERSION, sequence: seq.sequence, admitted: failed.length === 0, rows, failed: failed.map(r => r.label), settings: set, twist, notes, crossTerm: { estimated: joint },
      claims: { torque: torqueResolved ? 'shown' : 'withheld', twist: twist ? (twist.status === 'resolved' ? 'shown' : 'withheld') : (torqueResolved ? 'not assessed' : 'withheld') },
      drag: combined.consistency.drag,
      method: (joint ? 'Richardson extrapolation of a chordwise and a spanwise four-level refinement sequence (quadratic in 1/n through the three finest levels, combined additively) plus the cross term X = f D from one mesh refined in both directions (exact for a k / (c s) cross term); U = 1.25 x (sum over the two directions of max(spread of the linear, quadratic and observed-order extrapolations + one-level stability, 0.5 x |extrapolation correction|) + 0.5 x |X|).' : 'Richardson extrapolation of a chordwise and a spanwise four-level refinement sequence (quadratic in 1/n through the three finest levels, combined additively; stored sequence without the joint mesh, so the cross term is not estimated); U = 1.25 x sum over the two directions of max(spread of the linear, quadratic and observed-order extrapolations + one-level stability, 0.5 x |extrapolation correction|).') + ' Torque resolved only if U <= 10% of |T| and the weighted meshes agree in sign (no absolute floor). Twist from the structure\'s torsional compliance: resolved (shown) if every torque is resolved and the twist bound is within 10% of the twist; otherwise withheld and admitted only if the bound would change the lift by at most 1% (thin-airfoil lift slope), else the coupled result is withheld. One-way coupling: the computed twist may change the lift by at most 2%.' };
  }

  return Object.freeze({ VERSION, SCOPE, LIMITS, DEFAULT_FLOW, DEFAULT_MESH, triAngle, semiInfiniteAngle, buildSurface, sourceLocal,
    spanQuadBasis, wingSpanQuadBasis, spanQuadWake, knotValues, controlPointValues, wakeStrengths, trefftzQuadratic, fieldPotential, chainSystem,
    tensorQuadBasis, wingTensorTopology, wingTensorQuadBasis, tensorQuadWake, tensorValues, surfaceVelocityTensor, tensorTriangles, tensorTriangleVelocity, tensorControlPointVelocity,
    tensorPanel: (B, S, k, P, far = Infinity) => { const C = new Float64Array(B.nValues); const s = tensorPanel(B, S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far, C); const c9 = Array.from({ length: 9 }, (_, q) => B.refs[9 * k + q] >= 0 ? C[B.refs[9 * k + q]] : 0); return { source: s, sourceVector: [TPV[0], TPV[1], TPV[2]], coefficients: C, slots: c9 }; },
    // the far-field coefficients of panel k's nine slots at P by the path the assembly uses (planar: second order)
    tensorFar: (B, S, k, P, order = 2) => { const n = S.count; B.rowFarC.fill(0); B.rowFarK.fill(0); farAccumulate(B, S, k, P[0], P[1], P[2], order); B.rowOrder.fill(0); const out = new Float64Array(9), D = B.data;
      if (B.planar[k]) { const o = 15 * k; for (let q = 0; q < 9; q++) { let v = 0; for (let c = 0; c < 15; c++) v += B.farW[135 * k + 9 * c + q] * B.rowFarC[o + c]; out[q] = v; } }
      else { const o = 10 * k; for (let q = 0; q < 9; q++) { const f = B.stride * k + TQ_FAR + 10 * q; let v = 0; for (let c = 0; c < 10; c++) v += D[f + c] * B.rowFarK[o + c]; out[q] = v; } }
      B.rowFarC.fill(0); B.rowFarK.fill(0); return { slots: Array.from(out), sourceVector: [TPV[0], TPV[1], TPV[2]], planar: !!B.planar[k] }; },
    // a non-planar panel's far field by the path the assembly uses inside 24 diameters (per triangle; order 1, 2 or 4
    // forced on every triangle), and the first-order expansion about its centroid that the assembly uses beyond
    tensorFarTriangles: (B, S, k, P, order = 2) => { if (B.planar[k]) throw new Error('tensorFarTriangles: panel ' + k + ' is planar.');
      rowThresholds(B, S, DEFAULT_MESH.farField ** 2); const jb = B.tri.base[k], je = jb + B.tri.cnt[k], CV = new Float64Array(9);
      triangleEval(B, k, jb, je, P[0], P[1], P[2], order); triangleCoefficients(B, jb, je, CV);
      return { slots: Array.from(CV), sourceVector: [TPV[0], TPV[1], TPV[2]], triangles: je - jb }; },
    tensorSlots: (B, k) => { const D = B.data, o = B.stride * k, mode = D[o + 23], nodes = []; for (let q = 0; q < TQ_NN[mode]; q++) { const no = o + TQ_NODE + 10 * q; nodes.push({ slot: D[no], weights: Array.from(D.subarray(no + 1, no + 10)) }); }
      const tris = []; for (let t = 0; t < TQ_NT[mode]; t++) { const to = o + TQ_TRI + TQ_TRISZ * t; tris.push({ valid: !!D[to], points: [0, 1, 2].map(i => { const p = TQ_TV[mode][3 * t + i]; return [D[o + 3 * p], D[o + 3 * p + 1], D[o + 3 * p + 2]]; }), nodes: Array.from(D.subarray(to + 46, to + 52)) }); }
      return { mode, split: B.split[k], nodes, tris, refs: Array.from(B.refs.subarray(9 * k, 9 * k + 9)), cpWeights: Array.from(D.subarray(o + TQ_CPW, o + TQ_CPW + 9)) }; },
    quadStrip: (P, A, u, B) => { const o = new Float64Array(3); quadStrip(P[0], P[1], P[2], A[0], A[1], A[2], u[0], u[1], u[2], B[0], B[1], B[2], o); return Array.from(o); },
    spanQuadPanel: (B, S, k, P, far = Infinity) => { const M = new Float64Array(S.count), E = new Float64Array(B.knotCount); const s = bodyPanel(B, S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far, M, E); return { source: s, sourceVector: [BPV[0], BPV[1], BPV[2]], left: E[B.kL[k]], mid: M[k], right: E[B.kR[k]] }; },
    addRow: (B, W, S, P, self = -1, image = false, far = Infinity) => { const target = new Float64Array(S.count), src = new Float64Array(3); addRow(B, W, S, P[0], P[1], P[2], self, image, far === Infinity ? Infinity : far * far, target, 0, src); return { row: target, source: Array.from(src) }; },
    geometryKey, influence: (S, k, P, far = Infinity) => { influence(S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far); return { source: outS, doublet: outD }; },
    assemble, unitSolutions, luFactor, luSolve, gmres, surfaceVelocity, aeroGeometry, sectionLoop, spanStations, wingMesh, references, trefftz, trefftzMidpoint,
    normalizeFlow, normalizeMesh, prepare, evaluate, solve, alphaForLift, stripChordwiseCp, compactResult, resultantOfPanels,
    LOAD_LINE_FRACTION, SEQUENCES, ADMISSION, loadLinePoint, lineIntegral, stripWrenches, stripRepresentation, outboardOfStation, pchip, cumulativeWrench,
    sequenceMeshes, sequenceWeights, crossFactor, sequenceHasJoint, observedOrder, sequenceEstimate, runSequence, deliveryStations, combineSequence, admission });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroPanel;

/*
binary-search-bounds 2.0.5

The MIT License (MIT)

Copyright (c) 2013-2015 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


two-product 1.0.2

The MIT License (MIT)

Copyright (c) 2013 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


robust-sum 1.0.0

The MIT License (MIT)

Copyright (c) 2013 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


two-sum 1.0.0

The MIT License (MIT)

Copyright (c) 2013 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


robust-scale 1.0.2

The MIT License (MIT)

Copyright (c) 2013 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


robust-subtract 1.0.0

The MIT License (MIT)

Copyright (c) 2013 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


robust-orientation 1.2.1

The MIT License (MIT)

Copyright (c) 2013 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


cdt2d 1.0.0

The MIT License (MIT)

Copyright (c) 2015 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


robust-in-sphere 1.2.1

The MIT License (MIT)

Copyright (c) 2014 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


polygon-clipping 0.15.7
The MIT License (MIT)

Copyright (c) 2018 Mike Fogel <mike@fogel.ca> - covers everything not specially attributed to others below.

Copyright (c) 2016 Alexander Milevski <info@w8r.name> - covers all portions originally part of github:w8r/martinez, from which this project was forked on Febuary 2, 2018.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
var WingFiniteSectionDeps=(()=>{var lt=(r,n)=>()=>(n||r((n={exports:{}}).exports,n),n.exports);var zt=lt((ue,vr)=>{"use strict";function Kr(r,n,u,t,E){for(var o=E+1;t<=E;){var h=t+E>>>1,v=r[h],g=u!==void 0?u(v,n):v-n;g>=0?(o=h,E=h-1):t=h+1}return o}function jr(r,n,u,t,E){for(var o=E+1;t<=E;){var h=t+E>>>1,v=r[h],g=u!==void 0?u(v,n):v-n;g>0?(o=h,E=h-1):t=h+1}return o}function sr(r,n,u,t,E){for(var o=t-1;t<=E;){var h=t+E>>>1,v=r[h],g=u!==void 0?u(v,n):v-n;g<0?(o=h,t=h+1):E=h-1}return o}function cr(r,n,u,t,E){for(var o=t-1;t<=E;){var h=t+E>>>1,v=r[h],g=u!==void 0?u(v,n):v-n;g<=0?(o=h,t=h+1):E=h-1}return o}function dr(r,n,u,t,E){for(;t<=E;){var o=t+E>>>1,h=r[o],v=u!==void 0?u(h,n):h-n;if(v===0)return o;v<=0?t=o+1:E=o-1}return-1}function Bt(r,n,u,t,E,o){return typeof u=="function"?o(r,n,u,t===void 0?0:t|0,E===void 0?r.length-1:E|0):o(r,n,void 0,u===void 0?0:u|0,t===void 0?r.length-1:t|0)}vr.exports={ge:function(r,n,u,t,E){return Bt(r,n,u,t,E,Kr)},gt:function(r,n,u,t,E){return Bt(r,n,u,t,E,jr)},lt:function(r,n,u,t,E){return Bt(r,n,u,t,E,sr)},le:function(r,n,u,t,E){return Bt(r,n,u,t,E,cr)},eq:function(r,n,u,t,E){return Bt(r,n,u,t,E,dr)}}});var Dt=lt((ge,gr)=>{"use strict";gr.exports=mr;var ur=+(Math.pow(2,27)+1);function mr(r,n,u){var t=r*n,E=ur*r,o=E-r,h=E-o,v=r-h,g=ur*n,y=g-n,l=g-y,L=n-l,A=t-h*l,O=A-v*l,R=O-h*L,T=v*L-R;return u?(u[0]=T,u[1]=t,u):[T,t]}});var Ht=lt((xe,xr)=>{"use strict";xr.exports=rn;function tn(r,n){var u=r+n,t=u-r,E=u-t,o=n-t,h=r-E,v=h+o;return v?[v,u]:[u]}function rn(r,n){var u=r.length|0,t=n.length|0;if(u===1&&t===1)return tn(r[0],n[0]);var E=u+t,o=new Array(E),h=0,v=0,g=0,y=Math.abs,l=r[v],L=y(l),A=n[g],O=y(A),R,T;L<O?(T=l,v+=1,v<u&&(l=r[v],L=y(l))):(T=A,g+=1,g<t&&(A=n[g],O=y(A))),v<u&&L<O||g>=t?(R=l,v+=1,v<u&&(l=r[v],L=y(l))):(R=A,g+=1,g<t&&(A=n[g],O=y(A)));for(var N=R+T,U=N-R,z=T-U,G=z,k=N,B,F,V,$,Q;v<u&&g<t;)L<O?(R=l,v+=1,v<u&&(l=r[v],L=y(l))):(R=A,g+=1,g<t&&(A=n[g],O=y(A))),T=G,N=R+T,U=N-R,z=T-U,z&&(o[h++]=z),B=k+N,F=B-k,V=B-F,$=N-F,Q=k-V,G=Q+$,k=B;for(;v<u;)R=l,T=G,N=R+T,U=N-R,z=T-U,z&&(o[h++]=z),B=k+N,F=B-k,V=B-F,$=N-F,Q=k-V,G=Q+$,k=B,v+=1,v<u&&(l=r[v]);for(;g<t;)R=A,T=G,N=R+T,U=N-R,z=T-U,z&&(o[h++]=z),B=k+N,F=B-k,V=B-F,$=N-F,Q=k-V,G=Q+$,k=B,g+=1,g<t&&(A=n[g]);return G&&(o[h++]=G),k&&(o[h++]=k),h||(o[h++]=0),o.length=h,o}});var wr=lt((ye,yr)=>{"use strict";yr.exports=nn;function nn(r,n,u){var t=r+n,E=t-r,o=t-E,h=n-E,v=r-o;return u?(u[0]=v+h,u[1]=t,u):[v+h,t]}});var Zt=lt((we,pr)=>{"use strict";var Wt=Dt(),en=wr();pr.exports=on;function on(r,n){var u=r.length;if(u===1){var t=Wt(r[0],n);return t[0]?t:[t[1]]}var E=new Array(2*u),o=[.1,.1],h=[.1,.1],v=0;Wt(r[0],n,o),o[0]&&(E[v++]=o[0]);for(var g=1;g<u;++g){Wt(r[g],n,h);var y=o[1];en(y,h[0],o),o[0]&&(E[v++]=o[0]);var l=h[1],L=o[1],A=l+L,O=A-l,R=L-O;o[1]=A,R&&(E[v++]=R)}return o[1]&&(E[v++]=o[1]),v===0&&(E[v++]=0),E.length=v,E}});var Jt=lt((pe,lr)=>{"use strict";lr.exports=vn;function hn(r,n){var u=r+n,t=u-r,E=u-t,o=n-t,h=r-E,v=h+o;return v?[v,u]:[u]}function vn(r,n){var u=r.length|0,t=n.length|0;if(u===1&&t===1)return hn(r[0],-n[0]);var E=u+t,o=new Array(E),h=0,v=0,g=0,y=Math.abs,l=r[v],L=y(l),A=-n[g],O=y(A),R,T;L<O?(T=l,v+=1,v<u&&(l=r[v],L=y(l))):(T=A,g+=1,g<t&&(A=-n[g],O=y(A))),v<u&&L<O||g>=t?(R=l,v+=1,v<u&&(l=r[v],L=y(l))):(R=A,g+=1,g<t&&(A=-n[g],O=y(A)));for(var N=R+T,U=N-R,z=T-U,G=z,k=N,B,F,V,$,Q;v<u&&g<t;)L<O?(R=l,v+=1,v<u&&(l=r[v],L=y(l))):(R=A,g+=1,g<t&&(A=-n[g],O=y(A))),T=G,N=R+T,U=N-R,z=T-U,z&&(o[h++]=z),B=k+N,F=B-k,V=B-F,$=N-F,Q=k-V,G=Q+$,k=B;for(;v<u;)R=l,T=G,N=R+T,U=N-R,z=T-U,z&&(o[h++]=z),B=k+N,F=B-k,V=B-F,$=N-F,Q=k-V,G=Q+$,k=B,v+=1,v<u&&(l=r[v]);for(;g<t;)R=A,T=G,N=R+T,U=N-R,z=T-U,z&&(o[h++]=z),B=k+N,F=B-k,V=B-F,$=N-F,Q=k-V,G=Q+$,k=B,g+=1,g<t&&(A=-n[g]);return G&&(o[h++]=G),k&&(o[h++]=k),h||(o[h++]=0),o.length=h,o}});var ar=lt((le,Kt)=>{"use strict";var un=Dt(),gn=Ht(),xn=Zt(),yn=Jt(),Er=5,Ut=11102230246251565e-32,wn=(3+16*Ut)*Ut,pn=(7+56*Ut)*Ut;function ln(r,n,u,t){return function(o,h,v){var g=r(r(n(h[1],v[0]),n(-v[1],h[0])),r(n(o[1],h[0]),n(-h[1],o[0]))),y=r(n(o[1],v[0]),n(-v[1],o[0])),l=t(g,y);return l[l.length-1]}}function En(r,n,u,t){return function(o,h,v,g){var y=r(r(u(r(n(v[1],g[0]),n(-g[1],v[0])),h[2]),r(u(r(n(h[1],g[0]),n(-g[1],h[0])),-v[2]),u(r(n(h[1],v[0]),n(-v[1],h[0])),g[2]))),r(u(r(n(h[1],g[0]),n(-g[1],h[0])),o[2]),r(u(r(n(o[1],g[0]),n(-g[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),g[2])))),l=r(r(u(r(n(v[1],g[0]),n(-g[1],v[0])),o[2]),r(u(r(n(o[1],g[0]),n(-g[1],o[0])),-v[2]),u(r(n(o[1],v[0]),n(-v[1],o[0])),g[2]))),r(u(r(n(h[1],v[0]),n(-v[1],h[0])),o[2]),r(u(r(n(o[1],v[0]),n(-v[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),v[2])))),L=t(y,l);return L[L.length-1]}}function an(r,n,u,t){return function(o,h,v,g,y){var l=r(r(r(u(r(u(r(n(g[1],y[0]),n(-y[1],g[0])),v[2]),r(u(r(n(v[1],y[0]),n(-y[1],v[0])),-g[2]),u(r(n(v[1],g[0]),n(-g[1],v[0])),y[2]))),h[3]),r(u(r(u(r(n(g[1],y[0]),n(-y[1],g[0])),h[2]),r(u(r(n(h[1],y[0]),n(-y[1],h[0])),-g[2]),u(r(n(h[1],g[0]),n(-g[1],h[0])),y[2]))),-v[3]),u(r(u(r(n(v[1],y[0]),n(-y[1],v[0])),h[2]),r(u(r(n(h[1],y[0]),n(-y[1],h[0])),-v[2]),u(r(n(h[1],v[0]),n(-v[1],h[0])),y[2]))),g[3]))),r(u(r(u(r(n(v[1],g[0]),n(-g[1],v[0])),h[2]),r(u(r(n(h[1],g[0]),n(-g[1],h[0])),-v[2]),u(r(n(h[1],v[0]),n(-v[1],h[0])),g[2]))),-y[3]),r(u(r(u(r(n(g[1],y[0]),n(-y[1],g[0])),h[2]),r(u(r(n(h[1],y[0]),n(-y[1],h[0])),-g[2]),u(r(n(h[1],g[0]),n(-g[1],h[0])),y[2]))),o[3]),u(r(u(r(n(g[1],y[0]),n(-y[1],g[0])),o[2]),r(u(r(n(o[1],y[0]),n(-y[1],o[0])),-g[2]),u(r(n(o[1],g[0]),n(-g[1],o[0])),y[2]))),-h[3])))),r(r(u(r(u(r(n(h[1],y[0]),n(-y[1],h[0])),o[2]),r(u(r(n(o[1],y[0]),n(-y[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),y[2]))),g[3]),r(u(r(u(r(n(h[1],g[0]),n(-g[1],h[0])),o[2]),r(u(r(n(o[1],g[0]),n(-g[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),g[2]))),-y[3]),u(r(u(r(n(v[1],g[0]),n(-g[1],v[0])),h[2]),r(u(r(n(h[1],g[0]),n(-g[1],h[0])),-v[2]),u(r(n(h[1],v[0]),n(-v[1],h[0])),g[2]))),o[3]))),r(u(r(u(r(n(v[1],g[0]),n(-g[1],v[0])),o[2]),r(u(r(n(o[1],g[0]),n(-g[1],o[0])),-v[2]),u(r(n(o[1],v[0]),n(-v[1],o[0])),g[2]))),-h[3]),r(u(r(u(r(n(h[1],g[0]),n(-g[1],h[0])),o[2]),r(u(r(n(o[1],g[0]),n(-g[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),g[2]))),v[3]),u(r(u(r(n(h[1],v[0]),n(-v[1],h[0])),o[2]),r(u(r(n(o[1],v[0]),n(-v[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),v[2]))),-g[3]))))),L=r(r(r(u(r(u(r(n(g[1],y[0]),n(-y[1],g[0])),v[2]),r(u(r(n(v[1],y[0]),n(-y[1],v[0])),-g[2]),u(r(n(v[1],g[0]),n(-g[1],v[0])),y[2]))),o[3]),u(r(u(r(n(g[1],y[0]),n(-y[1],g[0])),o[2]),r(u(r(n(o[1],y[0]),n(-y[1],o[0])),-g[2]),u(r(n(o[1],g[0]),n(-g[1],o[0])),y[2]))),-v[3])),r(u(r(u(r(n(v[1],y[0]),n(-y[1],v[0])),o[2]),r(u(r(n(o[1],y[0]),n(-y[1],o[0])),-v[2]),u(r(n(o[1],v[0]),n(-v[1],o[0])),y[2]))),g[3]),u(r(u(r(n(v[1],g[0]),n(-g[1],v[0])),o[2]),r(u(r(n(o[1],g[0]),n(-g[1],o[0])),-v[2]),u(r(n(o[1],v[0]),n(-v[1],o[0])),g[2]))),-y[3]))),r(r(u(r(u(r(n(v[1],y[0]),n(-y[1],v[0])),h[2]),r(u(r(n(h[1],y[0]),n(-y[1],h[0])),-v[2]),u(r(n(h[1],v[0]),n(-v[1],h[0])),y[2]))),o[3]),u(r(u(r(n(v[1],y[0]),n(-y[1],v[0])),o[2]),r(u(r(n(o[1],y[0]),n(-y[1],o[0])),-v[2]),u(r(n(o[1],v[0]),n(-v[1],o[0])),y[2]))),-h[3])),r(u(r(u(r(n(h[1],y[0]),n(-y[1],h[0])),o[2]),r(u(r(n(o[1],y[0]),n(-y[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),y[2]))),v[3]),u(r(u(r(n(h[1],v[0]),n(-v[1],h[0])),o[2]),r(u(r(n(o[1],v[0]),n(-v[1],o[0])),-h[2]),u(r(n(o[1],h[0]),n(-h[1],o[0])),v[2]))),-y[3])))),A=t(l,L);return A[A.length-1]}}function Qt(r){var n=r===3?ln:r===4?En:an;return n(gn,un,xn,yn)}var bn=Qt(3),Sn=Qt(4),Tt=[function(){return 0},function(){return 0},function(n,u){return u[0]-n[0]},function(n,u,t){var E=(n[1]-t[1])*(u[0]-t[0]),o=(n[0]-t[0])*(u[1]-t[1]),h=E-o,v;if(E>0){if(o<=0)return h;v=E+o}else if(E<0){if(o>=0)return h;v=-(E+o)}else return h;var g=wn*v;return h>=g||h<=-g?h:bn(n,u,t)},function(n,u,t,E){var o=n[0]-E[0],h=u[0]-E[0],v=t[0]-E[0],g=n[1]-E[1],y=u[1]-E[1],l=t[1]-E[1],L=n[2]-E[2],A=u[2]-E[2],O=t[2]-E[2],R=h*l,T=v*y,N=v*g,U=o*l,z=o*y,G=h*g,k=L*(R-T)+A*(N-U)+O*(z-G),B=(Math.abs(R)+Math.abs(T))*Math.abs(L)+(Math.abs(N)+Math.abs(U))*Math.abs(A)+(Math.abs(z)+Math.abs(G))*Math.abs(O),F=pn*B;return k>F||-k>F?k:Sn(n,u,t,E)}];function _n(r){var n=Tt[r.length];return n||(n=Tt[r.length]=Qt(r.length)),n.apply(void 0,r)}function In(r,n,u,t,E,o,h){return function(g,y,l,L,A){switch(arguments.length){case 0:case 1:return 0;case 2:return t(g,y);case 3:return E(g,y,l);case 4:return o(g,y,l,L);case 5:return h(g,y,l,L,A)}for(var O=new Array(arguments.length),R=0;R<arguments.length;++R)O[R]=arguments[R];return r(O)}}function Pn(){for(;Tt.length<=Er;)Tt.push(Qt(Tt.length));Kt.exports=In.apply(void 0,[_n].concat(Tt));for(var r=0;r<=Er;++r)Kt.exports[r]=Tt[r]}Pn()});var Mr=lt((Ee,Pr)=>{"use strict";var Yt=zt(),Ot=ar()[3],st=0,br=1,jt=2;Pr.exports=Nn;function _r(r,n,u,t,E){this.a=r,this.b=n,this.idx=u,this.lowerIds=t,this.upperIds=E}function $t(r,n,u,t){this.a=r,this.b=n,this.type=u,this.idx=t}function Mn(r,n){var u=r.a[0]-n.a[0]||r.a[1]-n.a[1]||r.type-n.type;return u||r.type!==st&&(u=Ot(r.a,r.b,n.b),u)?u:r.idx-n.idx}function Sr(r,n){return Ot(r.a,r.b,n)}function Rn(r,n,u,t,E){for(var o=Yt.lt(n,t,Sr),h=Yt.gt(n,t,Sr),v=o;v<h;++v){for(var g=n[v],y=g.lowerIds,L=y.length;L>1&&Ot(u[y[L-2]],u[y[L-1]],t)>0;)r.push([y[L-1],y[L-2],E]),L-=1;y.length=L,y.push(E);for(var l=g.upperIds,L=l.length;L>1&&Ot(u[l[L-2]],u[l[L-1]],t)<0;)r.push([l[L-2],l[L-1],E]),L-=1;l.length=L,l.push(E)}}function Ir(r,n){var u;return r.a[0]<n.a[0]?u=Ot(r.a,r.b,n.a):u=Ot(n.b,n.a,r.a),u||(n.b[0]<r.b[0]?u=Ot(r.a,r.b,n.b):u=Ot(n.b,n.a,r.b),u||r.idx-n.idx)}function An(r,n,u){var t=Yt.le(r,u,Ir),E=r[t],o=E.upperIds,h=o[o.length-1];E.upperIds=[h],r.splice(t+1,0,new _r(u.a,u.b,u.idx,[h],o))}function Ln(r,n,u){var t=u.a;u.a=u.b,u.b=t;var E=Yt.eq(r,u,Ir),o=r[E],h=r[E-1];h.upperIds=o.upperIds,r.splice(E,1)}function Nn(r,n){for(var u=r.length,t=n.length,E=[],o=0;o<u;++o)E.push(new $t(r[o],null,st,o));for(var o=0;o<t;++o){var h=n[o],v=r[h[0]],g=r[h[1]];v[0]<g[0]?E.push(new $t(v,g,jt,o),new $t(g,v,br,o)):v[0]>g[0]&&E.push(new $t(g,v,jt,o),new $t(v,g,br,o))}E.sort(Mn);for(var y=E[0].a[0]-(1+Math.abs(E[0].a[0]))*Math.pow(2,-52),l=[new _r([y,1],[y,0],-1,[],[],[],[])],L=[],o=0,A=E.length;o<A;++o){var O=E[o],R=O.type;R===st?Rn(L,l,r,O.a,O.idx):R===jt?An(l,r,O):Ln(l,r,O)}return L}});var Lr=lt((ae,Ar)=>{"use strict";var On=zt();Ar.exports=Tn;function Rr(r,n){this.stars=r,this.edges=n}var qt=Rr.prototype;function ct(r,n,u){for(var t=1,E=r.length;t<E;t+=2)if(r[t-1]===n&&r[t]===u){r[t-1]=r[E-2],r[t]=r[E-1],r.length=E-2;return}}qt.isConstraint=(function(){var r=[0,0];function n(u,t){return u[0]-t[0]||u[1]-t[1]}return function(u,t){return r[0]=Math.min(u,t),r[1]=Math.max(u,t),On.eq(this.edges,r,n)>=0}})();qt.removeTriangle=function(r,n,u){var t=this.stars;ct(t[r],n,u),ct(t[n],u,r),ct(t[u],r,n)};qt.addTriangle=function(r,n,u){var t=this.stars;t[r].push(n,u),t[n].push(u,r),t[u].push(r,n)};qt.opposite=function(r,n){for(var u=this.stars[n],t=1,E=u.length;t<E;t+=2)if(u[t]===r)return u[t-1];return-1};qt.flip=function(r,n){var u=this.opposite(r,n),t=this.opposite(n,r);this.removeTriangle(r,n,u),this.removeTriangle(n,r,t),this.addTriangle(r,t,u),this.addTriangle(n,u,t)};qt.edges=function(){for(var r=this.stars,n=[],u=0,t=r.length;u<t;++u)for(var E=r[u],o=0,h=E.length;o<h;o+=2)n.push([E[o],E[o+1]]);return n};qt.cells=function(){for(var r=this.stars,n=[],u=0,t=r.length;u<t;++u)for(var E=r[u],o=0,h=E.length;o<h;o+=2){var v=E[o],g=E[o+1];u<Math.min(v,g)&&n.push([u,v,g])}return n};function Tn(r,n){for(var u=new Array(r),t=0;t<r;++t)u[t]=[];return new Rr(u,n)}});var Tr=lt((be,dt)=>{"use strict";var qn=Dt(),Cn=Ht(),kn=Jt(),Bn=Zt(),Nr=6;function Or(r){var n=r===3?Gn:r===4?Dn:r===5?Un:Qn;return n(Cn,kn,qn,Bn)}function zn(){return 0}function $n(){return 0}function Fn(){return 0}function Gn(r,n,u,t){function E(o,h,v){var g=u(o[0],o[0]),y=t(g,h[0]),l=t(g,v[0]),L=u(h[0],h[0]),A=t(L,o[0]),O=t(L,v[0]),R=u(v[0],v[0]),T=t(R,o[0]),N=t(R,h[0]),U=r(n(N,O),n(A,y)),z=n(T,l),G=n(U,z);return G[G.length-1]}return E}function Dn(r,n,u,t){function E(o,h,v,g){var y=r(u(o[0],o[0]),u(o[1],o[1])),l=t(y,h[0]),L=t(y,v[0]),A=t(y,g[0]),O=r(u(h[0],h[0]),u(h[1],h[1])),R=t(O,o[0]),T=t(O,v[0]),N=t(O,g[0]),U=r(u(v[0],v[0]),u(v[1],v[1])),z=t(U,o[0]),G=t(U,h[0]),k=t(U,g[0]),B=r(u(g[0],g[0]),u(g[1],g[1])),F=t(B,o[0]),V=t(B,h[0]),$=t(B,v[0]),Q=r(r(t(n($,k),h[1]),r(t(n(V,N),-v[1]),t(n(G,T),g[1]))),r(t(n(V,N),o[1]),r(t(n(F,A),-h[1]),t(n(R,l),g[1])))),W=r(r(t(n($,k),o[1]),r(t(n(F,A),-v[1]),t(n(z,L),g[1]))),r(t(n(G,T),o[1]),r(t(n(z,L),-h[1]),t(n(R,l),v[1])))),J=n(Q,W);return J[J.length-1]}return E}function Un(r,n,u,t){function E(o,h,v,g,y){var l=r(u(o[0],o[0]),r(u(o[1],o[1]),u(o[2],o[2]))),L=t(l,h[0]),A=t(l,v[0]),O=t(l,g[0]),R=t(l,y[0]),T=r(u(h[0],h[0]),r(u(h[1],h[1]),u(h[2],h[2]))),N=t(T,o[0]),U=t(T,v[0]),z=t(T,g[0]),G=t(T,y[0]),k=r(u(v[0],v[0]),r(u(v[1],v[1]),u(v[2],v[2]))),B=t(k,o[0]),F=t(k,h[0]),V=t(k,g[0]),$=t(k,y[0]),Q=r(u(g[0],g[0]),r(u(g[1],g[1]),u(g[2],g[2]))),W=t(Q,o[0]),J=t(Q,h[0]),Z=t(Q,v[0]),Et=t(Q,y[0]),d=r(u(y[0],y[0]),r(u(y[1],y[1]),u(y[2],y[2]))),s=t(d,o[0]),H=t(d,h[0]),K=t(d,v[0]),j=t(d,g[0]),Rt=r(r(r(t(r(t(n(j,Et),v[1]),r(t(n(K,$),-g[1]),t(n(Z,V),y[1]))),h[2]),r(t(r(t(n(j,Et),h[1]),r(t(n(H,G),-g[1]),t(n(J,z),y[1]))),-v[2]),t(r(t(n(K,$),h[1]),r(t(n(H,G),-v[1]),t(n(F,U),y[1]))),g[2]))),r(t(r(t(n(Z,V),h[1]),r(t(n(J,z),-v[1]),t(n(F,U),g[1]))),-y[2]),r(t(r(t(n(j,Et),h[1]),r(t(n(H,G),-g[1]),t(n(J,z),y[1]))),o[2]),t(r(t(n(j,Et),o[1]),r(t(n(s,R),-g[1]),t(n(W,O),y[1]))),-h[2])))),r(r(t(r(t(n(H,G),o[1]),r(t(n(s,R),-h[1]),t(n(N,L),y[1]))),g[2]),r(t(r(t(n(J,z),o[1]),r(t(n(W,O),-h[1]),t(n(N,L),g[1]))),-y[2]),t(r(t(n(Z,V),h[1]),r(t(n(J,z),-v[1]),t(n(F,U),g[1]))),o[2]))),r(t(r(t(n(Z,V),o[1]),r(t(n(W,O),-v[1]),t(n(B,A),g[1]))),-h[2]),r(t(r(t(n(J,z),o[1]),r(t(n(W,O),-h[1]),t(n(N,L),g[1]))),v[2]),t(r(t(n(F,U),o[1]),r(t(n(B,A),-h[1]),t(n(N,L),v[1]))),-g[2]))))),X=r(r(r(t(r(t(n(j,Et),v[1]),r(t(n(K,$),-g[1]),t(n(Z,V),y[1]))),o[2]),t(r(t(n(j,Et),o[1]),r(t(n(s,R),-g[1]),t(n(W,O),y[1]))),-v[2])),r(t(r(t(n(K,$),o[1]),r(t(n(s,R),-v[1]),t(n(B,A),y[1]))),g[2]),t(r(t(n(Z,V),o[1]),r(t(n(W,O),-v[1]),t(n(B,A),g[1]))),-y[2]))),r(r(t(r(t(n(K,$),h[1]),r(t(n(H,G),-v[1]),t(n(F,U),y[1]))),o[2]),t(r(t(n(K,$),o[1]),r(t(n(s,R),-v[1]),t(n(B,A),y[1]))),-h[2])),r(t(r(t(n(H,G),o[1]),r(t(n(s,R),-h[1]),t(n(N,L),y[1]))),v[2]),t(r(t(n(F,U),o[1]),r(t(n(B,A),-h[1]),t(n(N,L),v[1]))),-y[2])))),m=n(Rt,X);return m[m.length-1]}return E}function Qn(r,n,u,t){function E(o,h,v,g,y,l){var L=r(r(u(o[0],o[0]),u(o[1],o[1])),r(u(o[2],o[2]),u(o[3],o[3]))),A=t(L,h[0]),O=t(L,v[0]),R=t(L,g[0]),T=t(L,y[0]),N=t(L,l[0]),U=r(r(u(h[0],h[0]),u(h[1],h[1])),r(u(h[2],h[2]),u(h[3],h[3]))),z=t(U,o[0]),G=t(U,v[0]),k=t(U,g[0]),B=t(U,y[0]),F=t(U,l[0]),V=r(r(u(v[0],v[0]),u(v[1],v[1])),r(u(v[2],v[2]),u(v[3],v[3]))),$=t(V,o[0]),Q=t(V,h[0]),W=t(V,g[0]),J=t(V,y[0]),Z=t(V,l[0]),Et=r(r(u(g[0],g[0]),u(g[1],g[1])),r(u(g[2],g[2]),u(g[3],g[3]))),d=t(Et,o[0]),s=t(Et,h[0]),H=t(Et,v[0]),K=t(Et,y[0]),j=t(Et,l[0]),Rt=r(r(u(y[0],y[0]),u(y[1],y[1])),r(u(y[2],y[2]),u(y[3],y[3]))),X=t(Rt,o[0]),m=t(Rt,h[0]),ot=t(Rt,v[0]),tt=t(Rt,g[0]),nt=t(Rt,l[0]),Lt=r(r(u(l[0],l[0]),u(l[1],l[1])),r(u(l[2],l[2]),u(l[3],l[3]))),rt=t(Lt,o[0]),ht=t(Lt,h[0]),vt=t(Lt,v[0]),et=t(Lt,g[0]),it=t(Lt,y[0]),Vt=r(r(r(t(r(r(t(r(t(n(it,nt),g[1]),r(t(n(et,j),-y[1]),t(n(tt,K),l[1]))),v[2]),t(r(t(n(it,nt),v[1]),r(t(n(vt,Z),-y[1]),t(n(ot,J),l[1]))),-g[2])),r(t(r(t(n(et,j),v[1]),r(t(n(vt,Z),-g[1]),t(n(H,W),l[1]))),y[2]),t(r(t(n(tt,K),v[1]),r(t(n(ot,J),-g[1]),t(n(H,W),y[1]))),-l[2]))),h[3]),r(t(r(r(t(r(t(n(it,nt),g[1]),r(t(n(et,j),-y[1]),t(n(tt,K),l[1]))),h[2]),t(r(t(n(it,nt),h[1]),r(t(n(ht,F),-y[1]),t(n(m,B),l[1]))),-g[2])),r(t(r(t(n(et,j),h[1]),r(t(n(ht,F),-g[1]),t(n(s,k),l[1]))),y[2]),t(r(t(n(tt,K),h[1]),r(t(n(m,B),-g[1]),t(n(s,k),y[1]))),-l[2]))),-v[3]),t(r(r(t(r(t(n(it,nt),v[1]),r(t(n(vt,Z),-y[1]),t(n(ot,J),l[1]))),h[2]),t(r(t(n(it,nt),h[1]),r(t(n(ht,F),-y[1]),t(n(m,B),l[1]))),-v[2])),r(t(r(t(n(vt,Z),h[1]),r(t(n(ht,F),-v[1]),t(n(Q,G),l[1]))),y[2]),t(r(t(n(ot,J),h[1]),r(t(n(m,B),-v[1]),t(n(Q,G),y[1]))),-l[2]))),g[3]))),r(r(t(r(r(t(r(t(n(et,j),v[1]),r(t(n(vt,Z),-g[1]),t(n(H,W),l[1]))),h[2]),t(r(t(n(et,j),h[1]),r(t(n(ht,F),-g[1]),t(n(s,k),l[1]))),-v[2])),r(t(r(t(n(vt,Z),h[1]),r(t(n(ht,F),-v[1]),t(n(Q,G),l[1]))),g[2]),t(r(t(n(H,W),h[1]),r(t(n(s,k),-v[1]),t(n(Q,G),g[1]))),-l[2]))),-y[3]),t(r(r(t(r(t(n(tt,K),v[1]),r(t(n(ot,J),-g[1]),t(n(H,W),y[1]))),h[2]),t(r(t(n(tt,K),h[1]),r(t(n(m,B),-g[1]),t(n(s,k),y[1]))),-v[2])),r(t(r(t(n(ot,J),h[1]),r(t(n(m,B),-v[1]),t(n(Q,G),y[1]))),g[2]),t(r(t(n(H,W),h[1]),r(t(n(s,k),-v[1]),t(n(Q,G),g[1]))),-y[2]))),l[3])),r(t(r(r(t(r(t(n(it,nt),g[1]),r(t(n(et,j),-y[1]),t(n(tt,K),l[1]))),h[2]),t(r(t(n(it,nt),h[1]),r(t(n(ht,F),-y[1]),t(n(m,B),l[1]))),-g[2])),r(t(r(t(n(et,j),h[1]),r(t(n(ht,F),-g[1]),t(n(s,k),l[1]))),y[2]),t(r(t(n(tt,K),h[1]),r(t(n(m,B),-g[1]),t(n(s,k),y[1]))),-l[2]))),o[3]),t(r(r(t(r(t(n(it,nt),g[1]),r(t(n(et,j),-y[1]),t(n(tt,K),l[1]))),o[2]),t(r(t(n(it,nt),o[1]),r(t(n(rt,N),-y[1]),t(n(X,T),l[1]))),-g[2])),r(t(r(t(n(et,j),o[1]),r(t(n(rt,N),-g[1]),t(n(d,R),l[1]))),y[2]),t(r(t(n(tt,K),o[1]),r(t(n(X,T),-g[1]),t(n(d,R),y[1]))),-l[2]))),-h[3])))),r(r(r(t(r(r(t(r(t(n(it,nt),h[1]),r(t(n(ht,F),-y[1]),t(n(m,B),l[1]))),o[2]),t(r(t(n(it,nt),o[1]),r(t(n(rt,N),-y[1]),t(n(X,T),l[1]))),-h[2])),r(t(r(t(n(ht,F),o[1]),r(t(n(rt,N),-h[1]),t(n(z,A),l[1]))),y[2]),t(r(t(n(m,B),o[1]),r(t(n(X,T),-h[1]),t(n(z,A),y[1]))),-l[2]))),g[3]),t(r(r(t(r(t(n(et,j),h[1]),r(t(n(ht,F),-g[1]),t(n(s,k),l[1]))),o[2]),t(r(t(n(et,j),o[1]),r(t(n(rt,N),-g[1]),t(n(d,R),l[1]))),-h[2])),r(t(r(t(n(ht,F),o[1]),r(t(n(rt,N),-h[1]),t(n(z,A),l[1]))),g[2]),t(r(t(n(s,k),o[1]),r(t(n(d,R),-h[1]),t(n(z,A),g[1]))),-l[2]))),-y[3])),r(t(r(r(t(r(t(n(tt,K),h[1]),r(t(n(m,B),-g[1]),t(n(s,k),y[1]))),o[2]),t(r(t(n(tt,K),o[1]),r(t(n(X,T),-g[1]),t(n(d,R),y[1]))),-h[2])),r(t(r(t(n(m,B),o[1]),r(t(n(X,T),-h[1]),t(n(z,A),y[1]))),g[2]),t(r(t(n(s,k),o[1]),r(t(n(d,R),-h[1]),t(n(z,A),g[1]))),-y[2]))),l[3]),t(r(r(t(r(t(n(et,j),v[1]),r(t(n(vt,Z),-g[1]),t(n(H,W),l[1]))),h[2]),t(r(t(n(et,j),h[1]),r(t(n(ht,F),-g[1]),t(n(s,k),l[1]))),-v[2])),r(t(r(t(n(vt,Z),h[1]),r(t(n(ht,F),-v[1]),t(n(Q,G),l[1]))),g[2]),t(r(t(n(H,W),h[1]),r(t(n(s,k),-v[1]),t(n(Q,G),g[1]))),-l[2]))),o[3]))),r(r(t(r(r(t(r(t(n(et,j),v[1]),r(t(n(vt,Z),-g[1]),t(n(H,W),l[1]))),o[2]),t(r(t(n(et,j),o[1]),r(t(n(rt,N),-g[1]),t(n(d,R),l[1]))),-v[2])),r(t(r(t(n(vt,Z),o[1]),r(t(n(rt,N),-v[1]),t(n($,O),l[1]))),g[2]),t(r(t(n(H,W),o[1]),r(t(n(d,R),-v[1]),t(n($,O),g[1]))),-l[2]))),-h[3]),t(r(r(t(r(t(n(et,j),h[1]),r(t(n(ht,F),-g[1]),t(n(s,k),l[1]))),o[2]),t(r(t(n(et,j),o[1]),r(t(n(rt,N),-g[1]),t(n(d,R),l[1]))),-h[2])),r(t(r(t(n(ht,F),o[1]),r(t(n(rt,N),-h[1]),t(n(z,A),l[1]))),g[2]),t(r(t(n(s,k),o[1]),r(t(n(d,R),-h[1]),t(n(z,A),g[1]))),-l[2]))),v[3])),r(t(r(r(t(r(t(n(vt,Z),h[1]),r(t(n(ht,F),-v[1]),t(n(Q,G),l[1]))),o[2]),t(r(t(n(vt,Z),o[1]),r(t(n(rt,N),-v[1]),t(n($,O),l[1]))),-h[2])),r(t(r(t(n(ht,F),o[1]),r(t(n(rt,N),-h[1]),t(n(z,A),l[1]))),v[2]),t(r(t(n(Q,G),o[1]),r(t(n($,O),-h[1]),t(n(z,A),v[1]))),-l[2]))),-g[3]),t(r(r(t(r(t(n(H,W),h[1]),r(t(n(s,k),-v[1]),t(n(Q,G),g[1]))),o[2]),t(r(t(n(H,W),o[1]),r(t(n(d,R),-v[1]),t(n($,O),g[1]))),-h[2])),r(t(r(t(n(s,k),o[1]),r(t(n(d,R),-h[1]),t(n(z,A),g[1]))),v[2]),t(r(t(n(Q,G),o[1]),r(t(n($,O),-h[1]),t(n(z,A),v[1]))),-g[2]))),l[3]))))),at=r(r(r(t(r(r(t(r(t(n(it,nt),g[1]),r(t(n(et,j),-y[1]),t(n(tt,K),l[1]))),v[2]),t(r(t(n(it,nt),v[1]),r(t(n(vt,Z),-y[1]),t(n(ot,J),l[1]))),-g[2])),r(t(r(t(n(et,j),v[1]),r(t(n(vt,Z),-g[1]),t(n(H,W),l[1]))),y[2]),t(r(t(n(tt,K),v[1]),r(t(n(ot,J),-g[1]),t(n(H,W),y[1]))),-l[2]))),o[3]),r(t(r(r(t(r(t(n(it,nt),g[1]),r(t(n(et,j),-y[1]),t(n(tt,K),l[1]))),o[2]),t(r(t(n(it,nt),o[1]),r(t(n(rt,N),-y[1]),t(n(X,T),l[1]))),-g[2])),r(t(r(t(n(et,j),o[1]),r(t(n(rt,N),-g[1]),t(n(d,R),l[1]))),y[2]),t(r(t(n(tt,K),o[1]),r(t(n(X,T),-g[1]),t(n(d,R),y[1]))),-l[2]))),-v[3]),t(r(r(t(r(t(n(it,nt),v[1]),r(t(n(vt,Z),-y[1]),t(n(ot,J),l[1]))),o[2]),t(r(t(n(it,nt),o[1]),r(t(n(rt,N),-y[1]),t(n(X,T),l[1]))),-v[2])),r(t(r(t(n(vt,Z),o[1]),r(t(n(rt,N),-v[1]),t(n($,O),l[1]))),y[2]),t(r(t(n(ot,J),o[1]),r(t(n(X,T),-v[1]),t(n($,O),y[1]))),-l[2]))),g[3]))),r(r(t(r(r(t(r(t(n(et,j),v[1]),r(t(n(vt,Z),-g[1]),t(n(H,W),l[1]))),o[2]),t(r(t(n(et,j),o[1]),r(t(n(rt,N),-g[1]),t(n(d,R),l[1]))),-v[2])),r(t(r(t(n(vt,Z),o[1]),r(t(n(rt,N),-v[1]),t(n($,O),l[1]))),g[2]),t(r(t(n(H,W),o[1]),r(t(n(d,R),-v[1]),t(n($,O),g[1]))),-l[2]))),-y[3]),t(r(r(t(r(t(n(tt,K),v[1]),r(t(n(ot,J),-g[1]),t(n(H,W),y[1]))),o[2]),t(r(t(n(tt,K),o[1]),r(t(n(X,T),-g[1]),t(n(d,R),y[1]))),-v[2])),r(t(r(t(n(ot,J),o[1]),r(t(n(X,T),-v[1]),t(n($,O),y[1]))),g[2]),t(r(t(n(H,W),o[1]),r(t(n(d,R),-v[1]),t(n($,O),g[1]))),-y[2]))),l[3])),r(t(r(r(t(r(t(n(it,nt),v[1]),r(t(n(vt,Z),-y[1]),t(n(ot,J),l[1]))),h[2]),t(r(t(n(it,nt),h[1]),r(t(n(ht,F),-y[1]),t(n(m,B),l[1]))),-v[2])),r(t(r(t(n(vt,Z),h[1]),r(t(n(ht,F),-v[1]),t(n(Q,G),l[1]))),y[2]),t(r(t(n(ot,J),h[1]),r(t(n(m,B),-v[1]),t(n(Q,G),y[1]))),-l[2]))),o[3]),t(r(r(t(r(t(n(it,nt),v[1]),r(t(n(vt,Z),-y[1]),t(n(ot,J),l[1]))),o[2]),t(r(t(n(it,nt),o[1]),r(t(n(rt,N),-y[1]),t(n(X,T),l[1]))),-v[2])),r(t(r(t(n(vt,Z),o[1]),r(t(n(rt,N),-v[1]),t(n($,O),l[1]))),y[2]),t(r(t(n(ot,J),o[1]),r(t(n(X,T),-v[1]),t(n($,O),y[1]))),-l[2]))),-h[3])))),r(r(r(t(r(r(t(r(t(n(it,nt),h[1]),r(t(n(ht,F),-y[1]),t(n(m,B),l[1]))),o[2]),t(r(t(n(it,nt),o[1]),r(t(n(rt,N),-y[1]),t(n(X,T),l[1]))),-h[2])),r(t(r(t(n(ht,F),o[1]),r(t(n(rt,N),-h[1]),t(n(z,A),l[1]))),y[2]),t(r(t(n(m,B),o[1]),r(t(n(X,T),-h[1]),t(n(z,A),y[1]))),-l[2]))),v[3]),t(r(r(t(r(t(n(vt,Z),h[1]),r(t(n(ht,F),-v[1]),t(n(Q,G),l[1]))),o[2]),t(r(t(n(vt,Z),o[1]),r(t(n(rt,N),-v[1]),t(n($,O),l[1]))),-h[2])),r(t(r(t(n(ht,F),o[1]),r(t(n(rt,N),-h[1]),t(n(z,A),l[1]))),v[2]),t(r(t(n(Q,G),o[1]),r(t(n($,O),-h[1]),t(n(z,A),v[1]))),-l[2]))),-y[3])),r(t(r(r(t(r(t(n(ot,J),h[1]),r(t(n(m,B),-v[1]),t(n(Q,G),y[1]))),o[2]),t(r(t(n(ot,J),o[1]),r(t(n(X,T),-v[1]),t(n($,O),y[1]))),-h[2])),r(t(r(t(n(m,B),o[1]),r(t(n(X,T),-h[1]),t(n(z,A),y[1]))),v[2]),t(r(t(n(Q,G),o[1]),r(t(n($,O),-h[1]),t(n(z,A),v[1]))),-y[2]))),l[3]),t(r(r(t(r(t(n(tt,K),v[1]),r(t(n(ot,J),-g[1]),t(n(H,W),y[1]))),h[2]),t(r(t(n(tt,K),h[1]),r(t(n(m,B),-g[1]),t(n(s,k),y[1]))),-v[2])),r(t(r(t(n(ot,J),h[1]),r(t(n(m,B),-v[1]),t(n(Q,G),y[1]))),g[2]),t(r(t(n(H,W),h[1]),r(t(n(s,k),-v[1]),t(n(Q,G),g[1]))),-y[2]))),o[3]))),r(r(t(r(r(t(r(t(n(tt,K),v[1]),r(t(n(ot,J),-g[1]),t(n(H,W),y[1]))),o[2]),t(r(t(n(tt,K),o[1]),r(t(n(X,T),-g[1]),t(n(d,R),y[1]))),-v[2])),r(t(r(t(n(ot,J),o[1]),r(t(n(X,T),-v[1]),t(n($,O),y[1]))),g[2]),t(r(t(n(H,W),o[1]),r(t(n(d,R),-v[1]),t(n($,O),g[1]))),-y[2]))),-h[3]),t(r(r(t(r(t(n(tt,K),h[1]),r(t(n(m,B),-g[1]),t(n(s,k),y[1]))),o[2]),t(r(t(n(tt,K),o[1]),r(t(n(X,T),-g[1]),t(n(d,R),y[1]))),-h[2])),r(t(r(t(n(m,B),o[1]),r(t(n(X,T),-h[1]),t(n(z,A),y[1]))),g[2]),t(r(t(n(s,k),o[1]),r(t(n(d,R),-h[1]),t(n(z,A),g[1]))),-y[2]))),v[3])),r(t(r(r(t(r(t(n(ot,J),h[1]),r(t(n(m,B),-v[1]),t(n(Q,G),y[1]))),o[2]),t(r(t(n(ot,J),o[1]),r(t(n(X,T),-v[1]),t(n($,O),y[1]))),-h[2])),r(t(r(t(n(m,B),o[1]),r(t(n(X,T),-h[1]),t(n(z,A),y[1]))),v[2]),t(r(t(n(Q,G),o[1]),r(t(n($,O),-h[1]),t(n(z,A),v[1]))),-y[2]))),-g[3]),t(r(r(t(r(t(n(H,W),h[1]),r(t(n(s,k),-v[1]),t(n(Q,G),g[1]))),o[2]),t(r(t(n(H,W),o[1]),r(t(n(d,R),-v[1]),t(n($,O),g[1]))),-h[2])),r(t(r(t(n(s,k),o[1]),r(t(n(d,R),-h[1]),t(n(z,A),g[1]))),v[2]),t(r(t(n(Q,G),o[1]),r(t(n($,O),-h[1]),t(n(z,A),v[1]))),-g[2]))),y[3]))))),Ft=n(Vt,at);return Ft[Ft.length-1]}return E}var Ct=[zn,$n,Fn];function Yn(r){var n=Ct[r.length];return n||(n=Ct[r.length]=Or(r.length)),n.apply(void 0,r)}function Xn(r,n,u,t,E,o,h,v){function g(y,l,L,A,O,R){switch(arguments.length){case 0:case 1:return 0;case 2:return t(y,l);case 3:return E(y,l,L);case 4:return o(y,l,L,A);case 5:return h(y,l,L,A,O);case 6:return v(y,l,L,A,O,R)}for(var T=new Array(arguments.length),N=0;N<arguments.length;++N)T[N]=arguments[N];return r(T)}return g}function fn(){for(;Ct.length<=Nr;)Ct.push(Or(Ct.length));dt.exports=Xn.apply(void 0,[Yn].concat(Ct));for(var r=0;r<=Nr;++r)dt.exports[r]=Ct[r]}fn()});var Cr=lt((_e,qr)=>{"use strict";var mt=Tr()[4],Se=zt();qr.exports=Vn;function Xt(r,n,u,t,E,o){var h=n.opposite(t,E);if(!(h<0)){if(E<t){var v=t;t=E,E=v,v=o,o=h,h=v}n.isConstraint(t,E)||mt(r[t],r[E],r[o],r[h])<0&&u.push(t,E)}}function Vn(r,n){for(var u=[],t=r.length,E=n.stars,o=0;o<t;++o)for(var h=E[o],v=1;v<h.length;v+=2){var g=h[v];if(!(g<o)&&!n.isConstraint(o,g)){for(var y=h[v-1],l=-1,L=1;L<h.length;L+=2)if(h[L-1]===g){l=h[L];break}l<0||mt(r[o],r[g],r[y],r[l])<0&&u.push(o,g)}}for(;u.length>0;){for(var g=u.pop(),o=u.pop(),y=-1,l=-1,h=E[o],A=1;A<h.length;A+=2){var O=h[A-1],R=h[A];O===g?l=R:R===g&&(y=O)}y<0||l<0||mt(r[o],r[g],r[y],r[l])>=0||(n.flip(o,g),Xt(r,n,u,y,o,l),Xt(r,n,u,o,l,y),Xt(r,n,u,l,g,y),Xt(r,n,u,g,y,l))}}});var $r=lt((Ie,zr)=>{"use strict";var Hn=zt();zr.exports=Kn;function kr(r,n,u,t,E,o,h){this.cells=r,this.neighbor=n,this.flags=t,this.constraint=u,this.active=E,this.next=o,this.boundary=h}var Wn=kr.prototype;function Br(r,n){return r[0]-n[0]||r[1]-n[1]||r[2]-n[2]}Wn.locate=(function(){var r=[0,0,0];return function(n,u,t){var E=n,o=u,h=t;return u<t?u<n&&(E=u,o=t,h=n):t<n&&(E=t,o=n,h=u),E<0?-1:(r[0]=E,r[1]=o,r[2]=h,Hn.eq(this.cells,r,Br))}})();function Zn(r,n){for(var u=r.cells(),t=u.length,E=0;E<t;++E){var o=u[E],h=o[0],v=o[1],g=o[2];v<g?v<h&&(o[0]=v,o[1]=g,o[2]=h):g<h&&(o[0]=g,o[1]=h,o[2]=v)}u.sort(Br);for(var y=new Array(t),E=0;E<y.length;++E)y[E]=0;var l=[],L=[],A=new Array(3*t),O=new Array(3*t),R=null;n&&(R=[]);for(var T=new kr(u,A,O,y,l,L,R),E=0;E<t;++E)for(var o=u[E],N=0;N<3;++N){var h=o[N],v=o[(N+1)%3],U=A[3*E+N]=T.locate(v,h,r.opposite(v,h)),z=O[3*E+N]=r.isConstraint(h,v);U<0&&(z?L.push(E):(l.push(E),y[E]=1),n&&R.push([v,h,-1]))}return T}function Jn(r,n,u){for(var t=0,E=0;E<r.length;++E)n[E]===u&&(r[t++]=r[E]);return r.length=t,r}function Kn(r,n,u){var t=Zn(r,u);if(n===0)return u?t.cells.concat(t.boundary):t.cells;for(var E=1,o=t.active,h=t.next,v=t.flags,g=t.cells,y=t.constraint,l=t.neighbor;o.length>0||h.length>0;){for(;o.length>0;){var L=o.pop();if(v[L]!==-E){v[L]=E;for(var A=g[L],O=0;O<3;++O){var R=l[3*L+O];R>=0&&v[R]===0&&(y[3*L+O]?h.push(R):(o.push(R),v[R]=E))}}}var T=h;h=o,o=T,h.length=0,E=-E}var N=Jn(g,v,n);return u?N.concat(t.boundary):N}});var Gr=lt((Pe,Fr)=>{"use strict";var jn=Mr(),sn=Lr(),cn=Cr(),tr=$r();Fr.exports=re;function dn(r){return[Math.min(r[0],r[1]),Math.max(r[0],r[1])]}function mn(r,n){return r[0]-n[0]||r[1]-n[1]}function te(r){return r.map(dn).sort(mn)}function ft(r,n,u){return n in r?r[n]:u}function re(r,n,u){Array.isArray(n)?(u=u||{},n=n||[]):(u=n||{},n=[]);var t=!!ft(u,"delaunay",!0),E=!!ft(u,"interior",!0),o=!!ft(u,"exterior",!0),h=!!ft(u,"infinity",!1);if(!E&&!o||r.length===0)return[];var v=jn(r,n);if(t||E!==o||h){for(var g=sn(r.length,te(n)),y=0;y<v.length;++y){var l=v[y];g.addTriangle(l[0],l[1],l[2])}return t&&cn(r,g),o?E?h?tr(g,0,h):g.cells():tr(g,1,h):tr(g,-1)}else return v}});var Dr=lt((rr,nr)=>{(function(r,n){typeof rr=="object"&&typeof nr<"u"?nr.exports=n():typeof define=="function"&&define.amd?define(n):(r=typeof globalThis<"u"?globalThis:r||self,r.polygonClipping=n())})(rr,(function(){"use strict";/**
 * splaytree v3.1.2
 * Fast Splay tree for Node and browser
 *
 * @author Alexander Milevski <info@w8r.name>
 * @license MIT
 * @preserve
 *//*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */function r(a,e){var i={label:0,sent:function(){if(w[0]&1)throw w[1];return w[1]},trys:[],ops:[]},x,p,w,_;return _={next:S(0),throw:S(1),return:S(2)},typeof Symbol=="function"&&(_[Symbol.iterator]=function(){return this}),_;function S(I){return function(C){return P([I,C])}}function P(I){if(x)throw new TypeError("Generator is already executing.");for(;i;)try{if(x=1,p&&(w=I[0]&2?p.return:I[0]?p.throw||((w=p.return)&&w.call(p),0):p.next)&&!(w=w.call(p,I[1])).done)return w;switch(p=0,w&&(I=[I[0]&2,w.value]),I[0]){case 0:case 1:w=I;break;case 4:return i.label++,{value:I[1],done:!1};case 5:i.label++,p=I[1],I=[0];continue;case 7:I=i.ops.pop(),i.trys.pop();continue;default:if(w=i.trys,!(w=w.length>0&&w[w.length-1])&&(I[0]===6||I[0]===2)){i=0;continue}if(I[0]===3&&(!w||I[1]>w[0]&&I[1]<w[3])){i.label=I[1];break}if(I[0]===6&&i.label<w[1]){i.label=w[1],w=I;break}if(w&&i.label<w[2]){i.label=w[2],i.ops.push(I);break}w[2]&&i.ops.pop(),i.trys.pop();continue}I=e.call(a,i)}catch(C){I=[6,C],p=0}finally{x=w=0}if(I[0]&5)throw I[1];return{value:I[0]?I[1]:void 0,done:!0}}}var n=(function(){function a(e,i){this.next=null,this.key=e,this.data=i,this.left=null,this.right=null}return a})();function u(a,e){return a>e?1:a<e?-1:0}function t(a,e,i){for(var x=new n(null,null),p=x,w=x;;){var _=i(a,e.key);if(_<0){if(e.left===null)break;if(i(a,e.left.key)<0){var S=e.left;if(e.left=S.right,S.right=e,e=S,e.left===null)break}w.left=e,w=e,e=e.left}else if(_>0){if(e.right===null)break;if(i(a,e.right.key)>0){var S=e.right;if(e.right=S.left,S.left=e,e=S,e.right===null)break}p.right=e,p=e,e=e.right}else break}return p.right=e.left,w.left=e.right,e.left=x.right,e.right=x.left,e}function E(a,e,i,x){var p=new n(a,e);if(i===null)return p.left=p.right=null,p;i=t(a,i,x);var w=x(a,i.key);return w<0?(p.left=i.left,p.right=i,i.left=null):w>=0&&(p.right=i.right,p.left=i,i.right=null),p}function o(a,e,i){var x=null,p=null;if(e){e=t(a,e,i);var w=i(e.key,a);w===0?(x=e.left,p=e.right):w<0?(p=e.right,e.right=null,x=e):(x=e.left,e.left=null,p=e)}return{left:x,right:p}}function h(a,e,i){return e===null?a:(a===null||(e=t(a.key,e,i),e.left=a),e)}function v(a,e,i,x,p){if(a){x(""+e+(i?"\u2514\u2500\u2500 ":"\u251C\u2500\u2500 ")+p(a)+`
`);var w=e+(i?"    ":"\u2502   ");a.left&&v(a.left,w,!1,x,p),a.right&&v(a.right,w,!0,x,p)}}var g=(function(){function a(e){e===void 0&&(e=u),this._root=null,this._size=0,this._comparator=e}return a.prototype.insert=function(e,i){return this._size++,this._root=E(e,i,this._root,this._comparator)},a.prototype.add=function(e,i){var x=new n(e,i);this._root===null&&(x.left=x.right=null,this._size++,this._root=x);var p=this._comparator,w=t(e,this._root,p),_=p(e,w.key);return _===0?this._root=w:(_<0?(x.left=w.left,x.right=w,w.left=null):_>0&&(x.right=w.right,x.left=w,w.right=null),this._size++,this._root=x),this._root},a.prototype.remove=function(e){this._root=this._remove(e,this._root,this._comparator)},a.prototype._remove=function(e,i,x){var p;if(i===null)return null;i=t(e,i,x);var w=x(e,i.key);return w===0?(i.left===null?p=i.right:(p=t(e,i.left,x),p.right=i.right),this._size--,p):i},a.prototype.pop=function(){var e=this._root;if(e){for(;e.left;)e=e.left;return this._root=t(e.key,this._root,this._comparator),this._root=this._remove(e.key,this._root,this._comparator),{key:e.key,data:e.data}}return null},a.prototype.findStatic=function(e){for(var i=this._root,x=this._comparator;i;){var p=x(e,i.key);if(p===0)return i;p<0?i=i.left:i=i.right}return null},a.prototype.find=function(e){return this._root&&(this._root=t(e,this._root,this._comparator),this._comparator(e,this._root.key)!==0)?null:this._root},a.prototype.contains=function(e){for(var i=this._root,x=this._comparator;i;){var p=x(e,i.key);if(p===0)return!0;p<0?i=i.left:i=i.right}return!1},a.prototype.forEach=function(e,i){for(var x=this._root,p=[],w=!1;!w;)x!==null?(p.push(x),x=x.left):p.length!==0?(x=p.pop(),e.call(i,x),x=x.right):w=!0;return this},a.prototype.range=function(e,i,x,p){for(var w=[],_=this._comparator,S=this._root,P;w.length!==0||S;)if(S)w.push(S),S=S.left;else{if(S=w.pop(),P=_(S.key,i),P>0)break;if(_(S.key,e)>=0&&x.call(p,S))return this;S=S.right}return this},a.prototype.keys=function(){var e=[];return this.forEach(function(i){var x=i.key;return e.push(x)}),e},a.prototype.values=function(){var e=[];return this.forEach(function(i){var x=i.data;return e.push(x)}),e},a.prototype.min=function(){return this._root?this.minNode(this._root).key:null},a.prototype.max=function(){return this._root?this.maxNode(this._root).key:null},a.prototype.minNode=function(e){if(e===void 0&&(e=this._root),e)for(;e.left;)e=e.left;return e},a.prototype.maxNode=function(e){if(e===void 0&&(e=this._root),e)for(;e.right;)e=e.right;return e},a.prototype.at=function(e){for(var i=this._root,x=!1,p=0,w=[];!x;)if(i)w.push(i),i=i.left;else if(w.length>0){if(i=w.pop(),p===e)return i;p++,i=i.right}else x=!0;return null},a.prototype.next=function(e){var i=this._root,x=null;if(e.right){for(x=e.right;x.left;)x=x.left;return x}for(var p=this._comparator;i;){var w=p(e.key,i.key);if(w===0)break;w<0?(x=i,i=i.left):i=i.right}return x},a.prototype.prev=function(e){var i=this._root,x=null;if(e.left!==null){for(x=e.left;x.right;)x=x.right;return x}for(var p=this._comparator;i;){var w=p(e.key,i.key);if(w===0)break;w<0?i=i.left:(x=i,i=i.right)}return x},a.prototype.clear=function(){return this._root=null,this._size=0,this},a.prototype.toList=function(){return L(this._root)},a.prototype.load=function(e,i,x){i===void 0&&(i=[]),x===void 0&&(x=!1);var p=e.length,w=this._comparator;if(x&&R(e,i,0,p-1,w),this._root===null)this._root=y(e,i,0,p),this._size=p;else{var _=O(this.toList(),l(e,i),w);p=this._size+p,this._root=A({head:_},0,p)}return this},a.prototype.isEmpty=function(){return this._root===null},Object.defineProperty(a.prototype,"size",{get:function(){return this._size},enumerable:!0,configurable:!0}),Object.defineProperty(a.prototype,"root",{get:function(){return this._root},enumerable:!0,configurable:!0}),a.prototype.toString=function(e){e===void 0&&(e=function(x){return String(x.key)});var i=[];return v(this._root,"",!0,function(x){return i.push(x)},e),i.join("")},a.prototype.update=function(e,i,x){var p=this._comparator,w=o(e,this._root,p),_=w.left,S=w.right;p(e,i)<0?S=E(i,x,S,p):_=E(i,x,_,p),this._root=h(_,S,p)},a.prototype.split=function(e){return o(e,this._root,this._comparator)},a.prototype[Symbol.iterator]=function(){var e,i,x;return r(this,function(p){switch(p.label){case 0:e=this._root,i=[],x=!1,p.label=1;case 1:return x?[3,6]:e===null?[3,2]:(i.push(e),e=e.left,[3,5]);case 2:return i.length===0?[3,4]:(e=i.pop(),[4,e]);case 3:return p.sent(),e=e.right,[3,5];case 4:x=!0,p.label=5;case 5:return[3,1];case 6:return[2]}})},a})();function y(a,e,i,x){var p=x-i;if(p>0){var w=i+Math.floor(p/2),_=a[w],S=e[w],P=new n(_,S);return P.left=y(a,e,i,w),P.right=y(a,e,w+1,x),P}return null}function l(a,e){for(var i=new n(null,null),x=i,p=0;p<a.length;p++)x=x.next=new n(a[p],e[p]);return x.next=null,i.next}function L(a){for(var e=a,i=[],x=!1,p=new n(null,null),w=p;!x;)e?(i.push(e),e=e.left):i.length>0?(e=w=w.next=i.pop(),e=e.right):x=!0;return w.next=null,p.next}function A(a,e,i){var x=i-e;if(x>0){var p=e+Math.floor(x/2),w=A(a,e,p),_=a.head;return _.left=w,a.head=a.head.next,_.right=A(a,p+1,i),_}return null}function O(a,e,i){for(var x=new n(null,null),p=x,w=a,_=e;w!==null&&_!==null;)i(w.key,_.key)<0?(p.next=w,w=w.next):(p.next=_,_=_.next),p=p.next;return w!==null?p.next=w:_!==null&&(p.next=_),x.next}function R(a,e,i,x,p){if(!(i>=x)){for(var w=a[i+x>>1],_=i-1,S=x+1;;){do _++;while(p(a[_],w)<0);do S--;while(p(a[S],w)>0);if(_>=S)break;var P=a[_];a[_]=a[S],a[S]=P,P=e[_],e[_]=e[S],e[S]=P}R(a,e,i,S,p),R(a,e,S+1,x,p)}}let T=(a,e)=>a.ll.x<=e.x&&e.x<=a.ur.x&&a.ll.y<=e.y&&e.y<=a.ur.y,N=(a,e)=>{if(e.ur.x<a.ll.x||a.ur.x<e.ll.x||e.ur.y<a.ll.y||a.ur.y<e.ll.y)return null;let i=a.ll.x<e.ll.x?e.ll.x:a.ll.x,x=a.ur.x<e.ur.x?a.ur.x:e.ur.x,p=a.ll.y<e.ll.y?e.ll.y:a.ll.y,w=a.ur.y<e.ur.y?a.ur.y:e.ur.y;return{ll:{x:i,y:p},ur:{x,y:w}}},U=Number.EPSILON;U===void 0&&(U=Math.pow(2,-52));let z=U*U,G=(a,e)=>{if(-U<a&&a<U&&-U<e&&e<U)return 0;let i=a-e;return i*i<z*a*e?0:a<e?-1:1};class k{constructor(){this.reset()}reset(){this.xRounder=new B,this.yRounder=new B}round(e,i){return{x:this.xRounder.round(e),y:this.yRounder.round(i)}}}class B{constructor(){this.tree=new g,this.round(0)}round(e){let i=this.tree.add(e),x=this.tree.prev(i);if(x!==null&&G(i.key,x.key)===0)return this.tree.remove(e),x.key;let p=this.tree.next(i);return p!==null&&G(i.key,p.key)===0?(this.tree.remove(e),p.key):e}}let F=new k,V=11102230246251565e-32,$=134217729,Q=(3+8*V)*V;function W(a,e,i,x,p){let w,_,S,P,I=e[0],C=x[0],b=0,M=0;C>I==C>-I?(w=I,I=e[++b]):(w=C,C=x[++M]);let q=0;if(b<a&&M<i)for(C>I==C>-I?(_=I+w,S=w-(_-I),I=e[++b]):(_=C+w,S=w-(_-C),C=x[++M]),w=_,S!==0&&(p[q++]=S);b<a&&M<i;)C>I==C>-I?(_=w+I,P=_-w,S=w-(_-P)+(I-P),I=e[++b]):(_=w+C,P=_-w,S=w-(_-P)+(C-P),C=x[++M]),w=_,S!==0&&(p[q++]=S);for(;b<a;)_=w+I,P=_-w,S=w-(_-P)+(I-P),I=e[++b],w=_,S!==0&&(p[q++]=S);for(;M<i;)_=w+C,P=_-w,S=w-(_-P)+(C-P),C=x[++M],w=_,S!==0&&(p[q++]=S);return(w!==0||q===0)&&(p[q++]=w),q}function J(a,e){let i=e[0];for(let x=1;x<a;x++)i+=e[x];return i}function Z(a){return new Float64Array(a)}let Et=(3+16*V)*V,d=(2+12*V)*V,s=(9+64*V)*V*V,H=Z(4),K=Z(8),j=Z(12),Rt=Z(16),X=Z(4);function m(a,e,i,x,p,w,_){let S,P,I,C,b,M,q,Y,D,c,f,ut,xt,gt,yt,wt,bt,pt,_t=a-p,It=i-p,Pt=e-w,Mt=x-w;gt=_t*Mt,M=$*_t,q=M-(M-_t),Y=_t-q,M=$*Mt,D=M-(M-Mt),c=Mt-D,yt=Y*c-(gt-q*D-Y*D-q*c),wt=Pt*It,M=$*Pt,q=M-(M-Pt),Y=Pt-q,M=$*It,D=M-(M-It),c=It-D,bt=Y*c-(wt-q*D-Y*D-q*c),f=yt-bt,b=yt-f,H[0]=yt-(f+b)+(b-bt),ut=gt+f,b=ut-gt,xt=gt-(ut-b)+(f-b),f=xt-wt,b=xt-f,H[1]=xt-(f+b)+(b-wt),pt=ut+f,b=pt-ut,H[2]=ut-(pt-b)+(f-b),H[3]=pt;let At=J(4,H),kt=d*_;if(At>=kt||-At>=kt||(b=a-_t,S=a-(_t+b)+(b-p),b=i-It,I=i-(It+b)+(b-p),b=e-Pt,P=e-(Pt+b)+(b-w),b=x-Mt,C=x-(Mt+b)+(b-w),S===0&&P===0&&I===0&&C===0)||(kt=s*_+Q*Math.abs(At),At+=_t*C+Mt*S-(Pt*I+It*P),At>=kt||-At>=kt))return At;gt=S*Mt,M=$*S,q=M-(M-S),Y=S-q,M=$*Mt,D=M-(M-Mt),c=Mt-D,yt=Y*c-(gt-q*D-Y*D-q*c),wt=P*It,M=$*P,q=M-(M-P),Y=P-q,M=$*It,D=M-(M-It),c=It-D,bt=Y*c-(wt-q*D-Y*D-q*c),f=yt-bt,b=yt-f,X[0]=yt-(f+b)+(b-bt),ut=gt+f,b=ut-gt,xt=gt-(ut-b)+(f-b),f=xt-wt,b=xt-f,X[1]=xt-(f+b)+(b-wt),pt=ut+f,b=pt-ut,X[2]=ut-(pt-b)+(f-b),X[3]=pt;let Wr=W(4,H,4,X,K);gt=_t*C,M=$*_t,q=M-(M-_t),Y=_t-q,M=$*C,D=M-(M-C),c=C-D,yt=Y*c-(gt-q*D-Y*D-q*c),wt=Pt*I,M=$*Pt,q=M-(M-Pt),Y=Pt-q,M=$*I,D=M-(M-I),c=I-D,bt=Y*c-(wt-q*D-Y*D-q*c),f=yt-bt,b=yt-f,X[0]=yt-(f+b)+(b-bt),ut=gt+f,b=ut-gt,xt=gt-(ut-b)+(f-b),f=xt-wt,b=xt-f,X[1]=xt-(f+b)+(b-wt),pt=ut+f,b=pt-ut,X[2]=ut-(pt-b)+(f-b),X[3]=pt;let Zr=W(Wr,K,4,X,j);gt=S*C,M=$*S,q=M-(M-S),Y=S-q,M=$*C,D=M-(M-C),c=C-D,yt=Y*c-(gt-q*D-Y*D-q*c),wt=P*I,M=$*P,q=M-(M-P),Y=P-q,M=$*I,D=M-(M-I),c=I-D,bt=Y*c-(wt-q*D-Y*D-q*c),f=yt-bt,b=yt-f,X[0]=yt-(f+b)+(b-bt),ut=gt+f,b=ut-gt,xt=gt-(ut-b)+(f-b),f=xt-wt,b=xt-f,X[1]=xt-(f+b)+(b-wt),pt=ut+f,b=pt-ut,X[2]=ut-(pt-b)+(f-b),X[3]=pt;let Jr=W(Zr,j,4,X,Rt);return Rt[Jr-1]}function ot(a,e,i,x,p,w){let _=(e-w)*(i-p),S=(a-p)*(x-w),P=_-S,I=Math.abs(_+S);return Math.abs(P)>=Et*I?P:-m(a,e,i,x,p,w,I)}let tt=(a,e)=>a.x*e.y-a.y*e.x,nt=(a,e)=>a.x*e.x+a.y*e.y,Lt=(a,e,i)=>{let x=ot(a.x,a.y,e.x,e.y,i.x,i.y);return x>0?-1:x<0?1:0},rt=a=>Math.sqrt(nt(a,a)),ht=(a,e,i)=>{let x={x:e.x-a.x,y:e.y-a.y},p={x:i.x-a.x,y:i.y-a.y};return tt(p,x)/rt(p)/rt(x)},vt=(a,e,i)=>{let x={x:e.x-a.x,y:e.y-a.y},p={x:i.x-a.x,y:i.y-a.y};return nt(p,x)/rt(p)/rt(x)},et=(a,e,i)=>e.y===0?null:{x:a.x+e.x/e.y*(i-a.y),y:i},it=(a,e,i)=>e.x===0?null:{x:i,y:a.y+e.y/e.x*(i-a.x)},Vt=(a,e,i,x)=>{if(e.x===0)return it(i,x,a.x);if(x.x===0)return it(a,e,i.x);if(e.y===0)return et(i,x,a.y);if(x.y===0)return et(a,e,i.y);let p=tt(e,x);if(p==0)return null;let w={x:i.x-a.x,y:i.y-a.y},_=tt(w,e)/p,S=tt(w,x)/p,P=a.x+S*e.x,I=i.x+_*x.x,C=a.y+S*e.y,b=i.y+_*x.y,M=(P+I)/2,q=(C+b)/2;return{x:M,y:q}};class at{static compare(e,i){let x=at.comparePoints(e.point,i.point);return x!==0?x:(e.point!==i.point&&e.link(i),e.isLeft!==i.isLeft?e.isLeft?1:-1:Nt.compare(e.segment,i.segment))}static comparePoints(e,i){return e.x<i.x?-1:e.x>i.x?1:e.y<i.y?-1:e.y>i.y?1:0}constructor(e,i){e.events===void 0?e.events=[this]:e.events.push(this),this.point=e,this.isLeft=i}link(e){if(e.point===this.point)throw new Error("Tried to link already linked events");let i=e.point.events;for(let x=0,p=i.length;x<p;x++){let w=i[x];this.point.events.push(w),w.point=this.point}this.checkForConsuming()}checkForConsuming(){let e=this.point.events.length;for(let i=0;i<e;i++){let x=this.point.events[i];if(x.segment.consumedBy===void 0)for(let p=i+1;p<e;p++){let w=this.point.events[p];w.consumedBy===void 0&&x.otherSE.point.events===w.otherSE.point.events&&x.segment.consume(w.segment)}}}getAvailableLinkedEvents(){let e=[];for(let i=0,x=this.point.events.length;i<x;i++){let p=this.point.events[i];p!==this&&!p.segment.ringOut&&p.segment.isInResult()&&e.push(p)}return e}getLeftmostComparator(e){let i=new Map,x=p=>{let w=p.otherSE;i.set(p,{sine:ht(this.point,e.point,w.point),cosine:vt(this.point,e.point,w.point)})};return(p,w)=>{i.has(p)||x(p),i.has(w)||x(w);let{sine:_,cosine:S}=i.get(p),{sine:P,cosine:I}=i.get(w);return _>=0&&P>=0?S<I?1:S>I?-1:0:_<0&&P<0?S<I?-1:S>I?1:0:P<_?-1:P>_?1:0}}}let Ft=0;class Nt{static compare(e,i){let x=e.leftSE.point.x,p=i.leftSE.point.x,w=e.rightSE.point.x,_=i.rightSE.point.x;if(_<x)return 1;if(w<p)return-1;let S=e.leftSE.point.y,P=i.leftSE.point.y,I=e.rightSE.point.y,C=i.rightSE.point.y;if(x<p){if(P<S&&P<I)return 1;if(P>S&&P>I)return-1;let b=e.comparePoint(i.leftSE.point);if(b<0)return 1;if(b>0)return-1;let M=i.comparePoint(e.rightSE.point);return M!==0?M:-1}if(x>p){if(S<P&&S<C)return-1;if(S>P&&S>C)return 1;let b=i.comparePoint(e.leftSE.point);if(b!==0)return b;let M=e.comparePoint(i.rightSE.point);return M<0?1:M>0?-1:1}if(S<P)return-1;if(S>P)return 1;if(w<_){let b=i.comparePoint(e.rightSE.point);if(b!==0)return b}if(w>_){let b=e.comparePoint(i.rightSE.point);if(b<0)return 1;if(b>0)return-1}if(w!==_){let b=I-S,M=w-x,q=C-P,Y=_-p;if(b>M&&q<Y)return 1;if(b<M&&q>Y)return-1}return w>_?1:w<_||I<C?-1:I>C?1:e.id<i.id?-1:e.id>i.id?1:0}constructor(e,i,x,p){this.id=++Ft,this.leftSE=e,e.segment=this,e.otherSE=i,this.rightSE=i,i.segment=this,i.otherSE=e,this.rings=x,this.windings=p}static fromRing(e,i,x){let p,w,_,S=at.comparePoints(e,i);if(S<0)p=e,w=i,_=1;else if(S>0)p=i,w=e,_=-1;else throw new Error(`Tried to create degenerate segment at [${e.x}, ${e.y}]`);let P=new at(p,!0),I=new at(w,!1);return new Nt(P,I,[x],[_])}replaceRightSE(e){this.rightSE=e,this.rightSE.segment=this,this.rightSE.otherSE=this.leftSE,this.leftSE.otherSE=this.rightSE}bbox(){let e=this.leftSE.point.y,i=this.rightSE.point.y;return{ll:{x:this.leftSE.point.x,y:e<i?e:i},ur:{x:this.rightSE.point.x,y:e>i?e:i}}}vector(){return{x:this.rightSE.point.x-this.leftSE.point.x,y:this.rightSE.point.y-this.leftSE.point.y}}isAnEndpoint(e){return e.x===this.leftSE.point.x&&e.y===this.leftSE.point.y||e.x===this.rightSE.point.x&&e.y===this.rightSE.point.y}comparePoint(e){if(this.isAnEndpoint(e))return 0;let i=this.leftSE.point,x=this.rightSE.point,p=this.vector();if(i.x===x.x)return e.x===i.x?0:e.x<i.x?1:-1;let w=(e.y-i.y)/p.y,_=i.x+w*p.x;if(e.x===_)return 0;let S=(e.x-i.x)/p.x,P=i.y+S*p.y;return e.y===P?0:e.y<P?-1:1}getIntersection(e){let i=this.bbox(),x=e.bbox(),p=N(i,x);if(p===null)return null;let w=this.leftSE.point,_=this.rightSE.point,S=e.leftSE.point,P=e.rightSE.point,I=T(i,S)&&this.comparePoint(S)===0,C=T(x,w)&&e.comparePoint(w)===0,b=T(i,P)&&this.comparePoint(P)===0,M=T(x,_)&&e.comparePoint(_)===0;if(C&&I)return M&&!b?_:!M&&b?P:null;if(C)return b&&w.x===P.x&&w.y===P.y?null:w;if(I)return M&&_.x===S.x&&_.y===S.y?null:S;if(M&&b)return null;if(M)return _;if(b)return P;let q=Vt(w,this.vector(),S,e.vector());return q===null||!T(p,q)?null:F.round(q.x,q.y)}split(e){let i=[],x=e.events!==void 0,p=new at(e,!0),w=new at(e,!1),_=this.rightSE;this.replaceRightSE(w),i.push(w),i.push(p);let S=new Nt(p,_,this.rings.slice(),this.windings.slice());return at.comparePoints(S.leftSE.point,S.rightSE.point)>0&&S.swapEvents(),at.comparePoints(this.leftSE.point,this.rightSE.point)>0&&this.swapEvents(),x&&(p.checkForConsuming(),w.checkForConsuming()),i}swapEvents(){let e=this.rightSE;this.rightSE=this.leftSE,this.leftSE=e,this.leftSE.isLeft=!0,this.rightSE.isLeft=!1;for(let i=0,x=this.windings.length;i<x;i++)this.windings[i]*=-1}consume(e){let i=this,x=e;for(;i.consumedBy;)i=i.consumedBy;for(;x.consumedBy;)x=x.consumedBy;let p=Nt.compare(i,x);if(p!==0){if(p>0){let w=i;i=x,x=w}if(i.prev===x){let w=i;i=x,x=w}for(let w=0,_=x.rings.length;w<_;w++){let S=x.rings[w],P=x.windings[w],I=i.rings.indexOf(S);I===-1?(i.rings.push(S),i.windings.push(P)):i.windings[I]+=P}x.rings=null,x.windings=null,x.consumedBy=i,x.leftSE.consumedBy=i.leftSE,x.rightSE.consumedBy=i.rightSE}}prevInResult(){return this._prevInResult!==void 0?this._prevInResult:(this.prev?this.prev.isInResult()?this._prevInResult=this.prev:this._prevInResult=this.prev.prevInResult():this._prevInResult=null,this._prevInResult)}beforeState(){if(this._beforeState!==void 0)return this._beforeState;if(!this.prev)this._beforeState={rings:[],windings:[],multiPolys:[]};else{let e=this.prev.consumedBy||this.prev;this._beforeState=e.afterState()}return this._beforeState}afterState(){if(this._afterState!==void 0)return this._afterState;let e=this.beforeState();this._afterState={rings:e.rings.slice(0),windings:e.windings.slice(0),multiPolys:[]};let i=this._afterState.rings,x=this._afterState.windings,p=this._afterState.multiPolys;for(let S=0,P=this.rings.length;S<P;S++){let I=this.rings[S],C=this.windings[S],b=i.indexOf(I);b===-1?(i.push(I),x.push(C)):x[b]+=C}let w=[],_=[];for(let S=0,P=i.length;S<P;S++){if(x[S]===0)continue;let I=i[S],C=I.poly;if(_.indexOf(C)===-1)if(I.isExterior)w.push(C);else{_.indexOf(C)===-1&&_.push(C);let b=w.indexOf(I.poly);b!==-1&&w.splice(b,1)}}for(let S=0,P=w.length;S<P;S++){let I=w[S].multiPoly;p.indexOf(I)===-1&&p.push(I)}return this._afterState}isInResult(){if(this.consumedBy)return!1;if(this._isInResult!==void 0)return this._isInResult;let e=this.beforeState().multiPolys,i=this.afterState().multiPolys;switch(St.type){case"union":{let x=e.length===0,p=i.length===0;this._isInResult=x!==p;break}case"intersection":{let x,p;e.length<i.length?(x=e.length,p=i.length):(x=i.length,p=e.length),this._isInResult=p===St.numMultiPolys&&x<p;break}case"xor":{let x=Math.abs(e.length-i.length);this._isInResult=x%2===1;break}case"difference":{let x=p=>p.length===1&&p[0].isSubject;this._isInResult=x(e)!==x(i);break}default:throw new Error(`Unrecognized operation type found ${St.type}`)}return this._isInResult}}class er{constructor(e,i,x){if(!Array.isArray(e)||e.length===0)throw new Error("Input geometry is not a valid Polygon or MultiPolygon");if(this.poly=i,this.isExterior=x,this.segments=[],typeof e[0][0]!="number"||typeof e[0][1]!="number")throw new Error("Input geometry is not a valid Polygon or MultiPolygon");let p=F.round(e[0][0],e[0][1]);this.bbox={ll:{x:p.x,y:p.y},ur:{x:p.x,y:p.y}};let w=p;for(let _=1,S=e.length;_<S;_++){if(typeof e[_][0]!="number"||typeof e[_][1]!="number")throw new Error("Input geometry is not a valid Polygon or MultiPolygon");let P=F.round(e[_][0],e[_][1]);P.x===w.x&&P.y===w.y||(this.segments.push(Nt.fromRing(w,P,this)),P.x<this.bbox.ll.x&&(this.bbox.ll.x=P.x),P.y<this.bbox.ll.y&&(this.bbox.ll.y=P.y),P.x>this.bbox.ur.x&&(this.bbox.ur.x=P.x),P.y>this.bbox.ur.y&&(this.bbox.ur.y=P.y),w=P)}(p.x!==w.x||p.y!==w.y)&&this.segments.push(Nt.fromRing(w,p,this))}getSweepEvents(){let e=[];for(let i=0,x=this.segments.length;i<x;i++){let p=this.segments[i];e.push(p.leftSE),e.push(p.rightSE)}return e}}class Qr{constructor(e,i){if(!Array.isArray(e))throw new Error("Input geometry is not a valid Polygon or MultiPolygon");this.exteriorRing=new er(e[0],this,!0),this.bbox={ll:{x:this.exteriorRing.bbox.ll.x,y:this.exteriorRing.bbox.ll.y},ur:{x:this.exteriorRing.bbox.ur.x,y:this.exteriorRing.bbox.ur.y}},this.interiorRings=[];for(let x=1,p=e.length;x<p;x++){let w=new er(e[x],this,!1);w.bbox.ll.x<this.bbox.ll.x&&(this.bbox.ll.x=w.bbox.ll.x),w.bbox.ll.y<this.bbox.ll.y&&(this.bbox.ll.y=w.bbox.ll.y),w.bbox.ur.x>this.bbox.ur.x&&(this.bbox.ur.x=w.bbox.ur.x),w.bbox.ur.y>this.bbox.ur.y&&(this.bbox.ur.y=w.bbox.ur.y),this.interiorRings.push(w)}this.multiPoly=i}getSweepEvents(){let e=this.exteriorRing.getSweepEvents();for(let i=0,x=this.interiorRings.length;i<x;i++){let p=this.interiorRings[i].getSweepEvents();for(let w=0,_=p.length;w<_;w++)e.push(p[w])}return e}}class ir{constructor(e,i){if(!Array.isArray(e))throw new Error("Input geometry is not a valid Polygon or MultiPolygon");try{typeof e[0][0][0]=="number"&&(e=[e])}catch{}this.polys=[],this.bbox={ll:{x:Number.POSITIVE_INFINITY,y:Number.POSITIVE_INFINITY},ur:{x:Number.NEGATIVE_INFINITY,y:Number.NEGATIVE_INFINITY}};for(let x=0,p=e.length;x<p;x++){let w=new Qr(e[x],this);w.bbox.ll.x<this.bbox.ll.x&&(this.bbox.ll.x=w.bbox.ll.x),w.bbox.ll.y<this.bbox.ll.y&&(this.bbox.ll.y=w.bbox.ll.y),w.bbox.ur.x>this.bbox.ur.x&&(this.bbox.ur.x=w.bbox.ur.x),w.bbox.ur.y>this.bbox.ur.y&&(this.bbox.ur.y=w.bbox.ur.y),this.polys.push(w)}this.isSubject=i}getSweepEvents(){let e=[];for(let i=0,x=this.polys.length;i<x;i++){let p=this.polys[i].getSweepEvents();for(let w=0,_=p.length;w<_;w++)e.push(p[w])}return e}}class Gt{static factory(e){let i=[];for(let x=0,p=e.length;x<p;x++){let w=e[x];if(!w.isInResult()||w.ringOut)continue;let _=null,S=w.leftSE,P=w.rightSE,I=[S],C=S.point,b=[];for(;_=S,S=P,I.push(S),S.point!==C;)for(;;){let M=S.getAvailableLinkedEvents();if(M.length===0){let D=I[0].point,c=I[I.length-1].point;throw new Error(`Unable to complete output ring starting at [${D.x}, ${D.y}]. Last matching segment found ends at [${c.x}, ${c.y}].`)}if(M.length===1){P=M[0].otherSE;break}let q=null;for(let D=0,c=b.length;D<c;D++)if(b[D].point===S.point){q=D;break}if(q!==null){let D=b.splice(q)[0],c=I.splice(D.index);c.unshift(c[0].otherSE),i.push(new Gt(c.reverse()));continue}b.push({index:I.length,point:S.point});let Y=S.getLeftmostComparator(_);P=M.sort(Y)[0].otherSE;break}i.push(new Gt(I))}return i}constructor(e){this.events=e;for(let i=0,x=e.length;i<x;i++)e[i].segment.ringOut=this;this.poly=null}getGeom(){let e=this.events[0].point,i=[e];for(let I=1,C=this.events.length-1;I<C;I++){let b=this.events[I].point,M=this.events[I+1].point;Lt(b,e,M)!==0&&(i.push(b),e=b)}if(i.length===1)return null;let x=i[0],p=i[1];Lt(x,e,p)===0&&i.shift(),i.push(i[0]);let w=this.isExteriorRing()?1:-1,_=this.isExteriorRing()?0:i.length-1,S=this.isExteriorRing()?i.length:-1,P=[];for(let I=_;I!=S;I+=w)P.push([i[I].x,i[I].y]);return P}isExteriorRing(){if(this._isExteriorRing===void 0){let e=this.enclosingRing();this._isExteriorRing=e?!e.isExteriorRing():!0}return this._isExteriorRing}enclosingRing(){return this._enclosingRing===void 0&&(this._enclosingRing=this._calcEnclosingRing()),this._enclosingRing}_calcEnclosingRing(){let e=this.events[0];for(let p=1,w=this.events.length;p<w;p++){let _=this.events[p];at.compare(e,_)>0&&(e=_)}let i=e.segment.prevInResult(),x=i?i.prevInResult():null;for(;;){if(!i)return null;if(!x)return i.ringOut;if(x.ringOut!==i.ringOut)return x.ringOut.enclosingRing()!==i.ringOut?i.ringOut:i.ringOut.enclosingRing();i=x.prevInResult(),x=i?i.prevInResult():null}}}class or{constructor(e){this.exteriorRing=e,e.poly=this,this.interiorRings=[]}addInterior(e){this.interiorRings.push(e),e.poly=this}getGeom(){let e=[this.exteriorRing.getGeom()];if(e[0]===null)return null;for(let i=0,x=this.interiorRings.length;i<x;i++){let p=this.interiorRings[i].getGeom();p!==null&&e.push(p)}return e}}class Yr{constructor(e){this.rings=e,this.polys=this._composePolys(e)}getGeom(){let e=[];for(let i=0,x=this.polys.length;i<x;i++){let p=this.polys[i].getGeom();p!==null&&e.push(p)}return e}_composePolys(e){let i=[];for(let x=0,p=e.length;x<p;x++){let w=e[x];if(!w.poly)if(w.isExteriorRing())i.push(new or(w));else{let _=w.enclosingRing();_.poly||i.push(new or(_)),_.poly.addInterior(w)}}return i}}class Xr{constructor(e){let i=arguments.length>1&&arguments[1]!==void 0?arguments[1]:Nt.compare;this.queue=e,this.tree=new g(i),this.segments=[]}process(e){let i=e.segment,x=[];if(e.consumedBy)return e.isLeft?this.queue.remove(e.otherSE):this.tree.remove(i),x;let p=e.isLeft?this.tree.add(i):this.tree.find(i);if(!p)throw new Error(`Unable to find segment #${i.id} [${i.leftSE.point.x}, ${i.leftSE.point.y}] -> [${i.rightSE.point.x}, ${i.rightSE.point.y}] in SweepLine tree.`);let w=p,_=p,S,P;for(;S===void 0;)w=this.tree.prev(w),w===null?S=null:w.key.consumedBy===void 0&&(S=w.key);for(;P===void 0;)_=this.tree.next(_),_===null?P=null:_.key.consumedBy===void 0&&(P=_.key);if(e.isLeft){let I=null;if(S){let b=S.getIntersection(i);if(b!==null&&(i.isAnEndpoint(b)||(I=b),!S.isAnEndpoint(b))){let M=this._splitSafely(S,b);for(let q=0,Y=M.length;q<Y;q++)x.push(M[q])}}let C=null;if(P){let b=P.getIntersection(i);if(b!==null&&(i.isAnEndpoint(b)||(C=b),!P.isAnEndpoint(b))){let M=this._splitSafely(P,b);for(let q=0,Y=M.length;q<Y;q++)x.push(M[q])}}if(I!==null||C!==null){let b=null;I===null?b=C:C===null?b=I:b=at.comparePoints(I,C)<=0?I:C,this.queue.remove(i.rightSE),x.push(i.rightSE);let M=i.split(b);for(let q=0,Y=M.length;q<Y;q++)x.push(M[q])}x.length>0?(this.tree.remove(i),x.push(e)):(this.segments.push(i),i.prev=S)}else{if(S&&P){let I=S.getIntersection(P);if(I!==null){if(!S.isAnEndpoint(I)){let C=this._splitSafely(S,I);for(let b=0,M=C.length;b<M;b++)x.push(C[b])}if(!P.isAnEndpoint(I)){let C=this._splitSafely(P,I);for(let b=0,M=C.length;b<M;b++)x.push(C[b])}}}this.tree.remove(i)}return x}_splitSafely(e,i){this.tree.remove(e);let x=e.rightSE;this.queue.remove(x);let p=e.split(i);return p.push(x),e.consumedBy===void 0&&this.tree.add(e),p}}let hr=typeof process<"u"&&process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE||1e6,fr=typeof process<"u"&&process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS||1e6;class Vr{run(e,i,x){St.type=e,F.reset();let p=[new ir(i,!0)];for(let b=0,M=x.length;b<M;b++)p.push(new ir(x[b],!1));if(St.numMultiPolys=p.length,St.type==="difference"){let b=p[0],M=1;for(;M<p.length;)N(p[M].bbox,b.bbox)!==null?M++:p.splice(M,1)}if(St.type==="intersection")for(let b=0,M=p.length;b<M;b++){let q=p[b];for(let Y=b+1,D=p.length;Y<D;Y++)if(N(q.bbox,p[Y].bbox)===null)return[]}let w=new g(at.compare);for(let b=0,M=p.length;b<M;b++){let q=p[b].getSweepEvents();for(let Y=0,D=q.length;Y<D;Y++)if(w.insert(q[Y]),w.size>hr)throw new Error("Infinite loop when putting segment endpoints in a priority queue (queue size too big).")}let _=new Xr(w),S=w.size,P=w.pop();for(;P;){let b=P.key;if(w.size===S){let q=b.segment;throw new Error(`Unable to pop() ${b.isLeft?"left":"right"} SweepEvent [${b.point.x}, ${b.point.y}] from segment #${q.id} [${q.leftSE.point.x}, ${q.leftSE.point.y}] -> [${q.rightSE.point.x}, ${q.rightSE.point.y}] from queue.`)}if(w.size>hr)throw new Error("Infinite loop when passing sweep line over endpoints (queue size too big).");if(_.segments.length>fr)throw new Error("Infinite loop when passing sweep line over endpoints (too many sweep line segments).");let M=_.process(b);for(let q=0,Y=M.length;q<Y;q++){let D=M[q];D.consumedBy===void 0&&w.insert(D)}S=w.size,P=w.pop()}F.reset();let I=Gt.factory(_.segments);return new Yr(I).getGeom()}}let St=new Vr;var Hr={union:function(a){for(var e=arguments.length,i=new Array(e>1?e-1:0),x=1;x<e;x++)i[x-1]=arguments[x];return St.run("union",a,i)},intersection:function(a){for(var e=arguments.length,i=new Array(e>1?e-1:0),x=1;x<e;x++)i[x-1]=arguments[x];return St.run("intersection",a,i)},xor:function(a){for(var e=arguments.length,i=new Array(e>1?e-1:0),x=1;x<e;x++)i[x-1]=arguments[x];return St.run("xor",a,i)},difference:function(a){for(var e=arguments.length,i=new Array(e>1?e-1:0),x=1;x<e;x++)i[x-1]=arguments[x];return St.run("difference",a,i)}};return Hr}))});var ne=lt((Me,Ur)=>{Ur.exports={cdt2d:Gr(),polygonClipping:Dr()}});return ne();})();

if(typeof module!=="undefined"&&module.exports)module.exports=WingFiniteSectionDeps;

/* Optional refined section: homogeneous material-union Saint-Venant torsion.
 * Independent of engine assembly. No shear-centre replacement, no fitted GJ.
 * P1 conforming Neumann warping minimizes int|grad(w)+[-z,x]|² dA.
 * Supply deps={cdt2d,polygonClipping}; bundled browser dependencies avoid network requests.
 */
const WingFiniteSection=(()=>{
 'use strict';const cache=new Map();
 const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+(a[0]*b[1]-a[1]*b[0])/2;},0);
 const clean=p=>{const q=p.map(v=>v.slice());if(q.length>1&&Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])<1e-12)q.pop();return q;};
 function inside(p,rings){let parity=false;for(const ring of rings){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}if(yes)parity=!parity;}return parity;}
 function mesh(spec,h,layers,deps){
  const union=deps.polygonClipping.union([spec.outer,spec.inner].filter(p=>p?.length),...(spec.spars||[]).map(p=>[p]));
  if(union.length!==1)throw Error('Finite-section union must be one connected homogeneous material region.');
  const rings=union[0].map(clean),points=[],edges=[],seen=new Map(),key=p=>p.map(v=>v.toPrecision(14)).join(',');
  const node=p=>{const k=key(p);if(seen.has(k))return seen.get(k);const i=points.length;seen.set(k,i);points.push(p);return i;};
  let exactArea=0;for(let k=0;k<rings.length;k++){const ring=rings[k];exactArea+=(k===0?1:-1)*Math.abs(area(ring));const ids=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],n=Math.max(1,Math.ceil(spec.inner?.length?Math.max(Math.abs(b[0]-a[0])/(3*h),Math.abs(b[1]-a[1])/h):Math.hypot(b[0]-a[0],b[1]-a[1])/h));for(let j=0;j<n;j++)ids.push(node([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]));}for(let i=0;i<ids.length;i++)edges.push([ids[i],ids[(i+1)%ids.length]]);}
  // Boundary constraints are at most h long. A local bucket avoids an
  // O(all boundary edges) distance scan for every proposed interior seed.
  const buckets=new Map();for(const e of edges){const a=points[e[0]],b=points[e[1]];for(let ix=Math.floor((Math.min(a[0],b[0])-1e-8)/h);ix<=Math.floor((Math.max(a[0],b[0])+1e-8)/h);ix++)for(let iz=Math.floor((Math.min(a[1],b[1])-1e-8)/h);iz<=Math.floor((Math.max(a[1],b[1])+1e-8)/h);iz++){const k=ix+','+iz;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(e);}}
  const nearBoundary=p=>(buckets.get(Math.floor(p[0]/h)+','+Math.floor(p[1]/h))||[]).some(([i,j])=>{const a=points[i],b=points[j],dx=b[0]-a[0],dz=b[1]-a[1],t=((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz);return t>=0&&t<=1&&(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dz)**2<1e-16;});
  const seed=p=>{if(inside(p,rings)&&!seen.has(key(p))&&!nearBoundary(p))node(p);};
  // Existing paired ring samples seed thin walls through their thickness.
  if(spec.inner?.length===spec.outer.length)for(let j=1;j<layers;j++)for(let i=0;i<spec.inner.length;i++){const a=spec.inner[i],b=spec.outer[i],t=j/layers;seed([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  const xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs);
  if(spec.inner?.length){
   // Paired wall seeds already resolve the skin through its thickness. Avoid
   // an isotropic grid over the entire airfoil bounding box and its cavity.
   // Add local seeds only in each finite spar polygon's bounding rectangle.
   for(let x=xmin+.413*h;x<xmax;x+=3*h)for(let z=zmin+.271*h;z<zmax;z+=h)seed([x,z]);
   for(const poly of spec.spars||[]){const px=poly.map(p=>p[0]),pz=poly.map(p=>p[1]),lo=Math.min(...px),hi=Math.max(...px),bot=Math.min(...pz),top=Math.max(...pz);for(let x=lo+.413*h;x<hi;x+=h)for(let z=bot+.271*h;z<top;z+=h)seed([x,z]);}
  }else for(let x=xmin+.413*h;x<xmax;x+=h)for(let z=zmin+.271*h;z<zmax;z+=h)seed([x,z]);
  const tris=deps.cdt2d(points,edges,{exterior:false});if(!tris.length)throw Error('Empty material-union mesh.');
  return {points,tris,exactArea};
 }
 function cg(rows,f,tol=1e-9){
  const n=f.length,off=new Int32Array(n+1),col=[],val=[],diag=new Float64Array(n);let norm=0;
  for(let i=0;i<n;i++){if(i)for(const[j,v]of rows[i])if(j){col.push(j);val.push(v);if(i===j)diag[i]=v;}off[i+1]=col.length;norm+=i?f[i]*f[i]:0;}norm=Math.sqrt(norm);if(norm===0)return {u:new Float64Array(n),iterations:0,residual:0};
  const columns=Int32Array.from(col),values=Float64Array.from(val);
  const multiply=(a,o)=>{o.fill(0);for(let i=1;i<n;i++){let sum=0;for(let k=off[i];k<off[i+1];k++)sum+=values[k]*a[columns[k]];o[i]=sum;}};
  const u=new Float64Array(n),r=Float64Array.from(f),z=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n);r[0]=0;let rz=0;for(let i=1;i<n;i++){if(!(diag[i]>0))throw Error('Disconnected or invalid section stiffness.');z[i]=r[i]/diag[i];p[i]=z[i];rz+=r[i]*z[i];}
  let iteration=0;
  for(;iteration<10000;iteration++){multiply(p,ap);let den=0;for(let i=1;i<n;i++)den+=p[i]*ap[i];if(!(den>0))throw Error('Section PCG lost positive definiteness.');const alpha=rz/den;let rr=0;for(let i=1;i<n;i++){u[i]+=alpha*p[i];r[i]-=alpha*ap[i];rr+=r[i]*r[i];}if(Math.sqrt(rr)<=tol*norm){let pinned=-f[0];for(const[j,v]of rows[0])pinned+=v*u[j];if(Math.hypot(Math.sqrt(rr),pinned)<=tol*norm)break;}let next=0;for(let i=1;i<n;i++){z[i]=r[i]/diag[i];next+=r[i]*z[i];}const beta=next/rz;for(let i=1;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;}
  multiply(u,ap);let err=0;for(let i=1;i<n;i++)err+=(ap[i]-f[i])**2;let pinned=-f[0];for(const[j,v]of rows[0])pinned+=v*u[j];err+=pinned*pinned;const residual=Math.sqrt(err)/norm;if(residual>tol*2||iteration===10000)throw Error(`Finite-section PCG did not converge: true residual ${residual}.`);
  return {u,iterations:iteration+1,residual};
 }
 function refine(m){const points=m.points.map(p=>p.slice()),mid=new Map(),at=(i,j)=>{const k=Math.min(i,j)+','+Math.max(i,j);if(mid.has(k))return mid.get(k);const q=points.length;points.push([(points[i][0]+points[j][0])/2,(points[i][1]+points[j][1])/2]);mid.set(k,q);return q;},tris=[];for(const[a,b,c]of m.tris){const ab=at(a,b),bc=at(b,c),ca=at(c,a);tris.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}return {points,tris,exactArea:m.exactArea};}
 function level(spec,h,layers,deps,prior=null){const t=performance.now(),m=prior?refine(prior):mesh(spec,h,layers,deps),meshDone=performance.now(),{points,tris}=m,n=points.length,rows=Array.from({length:n},()=>new Map()),f=new Float64Array(n);let A=0,sx=0,sz=0;
  const elements=tris.map(ids=>{const p=ids.map(i=>points[i]),det=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1]),a=Math.abs(det)/2;if(!(a>1e-18))throw Error('Degenerate union triangle.');const gx=[p[1][1]-p[2][1],p[2][1]-p[0][1],p[0][1]-p[1][1]].map(v=>v/det),gz=[p[2][0]-p[1][0],p[0][0]-p[2][0],p[1][0]-p[0][0]].map(v=>v/det),x=p.reduce((s,v)=>s+v[0],0)/3,z=p.reduce((s,v)=>s+v[1],0)/3;A+=a;sx+=a*x;sz+=a*z;return {ids,p,a,gx,gz,x,z};});
  if(Math.abs(A-m.exactArea)>1e-8*Math.max(1,A))throw Error('Constrained mesh does not preserve polygon-union area.');const xc=sx/A,zc=sz/A;let polar=0;
  for(const e of elements){const{ids,p,a,gx,gz}=e,x=e.x-xc,z=e.z-zc;for(let i=0;i<3;i++){f[ids[i]]+=a*(z*gx[i]-x*gz[i]);for(let j=0;j<3;j++){const k=a*(gx[i]*gx[j]+gz[i]*gz[j]);rows[ids[i]].set(ids[j],(rows[ids[i]].get(ids[j])||0)+k);}}for(const axis of [0,1]){const q=p.map(v=>v[axis]-(axis?zc:xc));polar+=a/6*(q[0]**2+q[1]**2+q[2]**2+q[0]*q[1]+q[0]*q[2]+q[1]*q[2]);}}
  const assembled=performance.now(),solved=cg(rows,f),solvedAt=performance.now(),u=solved.u;let J=0,work=0,mean=0;for(let i=0;i<n;i++)work+=f[i]*u[i];
  for(const e of elements){let dx=0,dz=0;for(let i=0;i<3;i++){dx+=e.gx[i]*u[e.ids[i]];dz+=e.gz[i]*u[e.ids[i]];mean+=e.a*u[e.ids[i]]/3;}const x=e.x-xc,z=e.z-zc;J+=e.a*(dx*dx+dz*dz-2*z*dx+2*x*dz);}
  J+=polar;const identity=Math.abs(J-(polar-work))/J;if(!(J>0)||identity>1e-7)throw Error('Finite-section energy identity failed.');
  const result={J,GJ:spec.G*J,area:A,centroid:[xc,zc],nodes:n,triangles:tris.length,iterations:solved.iterations,trueRelativeResidual:solved.residual,energyIdentityRelative:identity,elapsedMs:performance.now()-t,meshMs:meshDone-t,assemblyMs:assembled-meshDone,solveMs:solvedAt-assembled,h,layers,variationalScope:'Conforming P1 free-warping energy upper bound for this polygon union; not restrained-warping stress or an exact curved CAD section.'};Object.defineProperty(result,'_mesh',{value:m,configurable:true});return result;
 }
 function solve(spec,options={}){
  if(!(spec.G>0)||!Number.isFinite(spec.G))throw Error('A finite positive homogeneous shear modulus is required.');if(spec.partShearModuli?.some(g=>Math.abs(g-spec.G)>1e-12*spec.G))throw Error('Finite-section supports homogeneous shear modulus only; retain the explicit existing multi-material model.');
  const deps=options.deps||globalThis.WingFiniteSectionDeps;if(!deps?.cdt2d||!deps?.polygonClipping)throw Error('Finite-section dependencies are unavailable.');
  const key=JSON.stringify([spec,options.levels||(spec.inner?.length?[[.6,1],[.3,2],[.15,4]]:[[.6,1],[.3,2],[.15,4]])]);if(cache.has(key))return {...cache.get(key),cached:true};
  const history=[];let previousMesh=null;for(const[h,layers]of options.levels||(spec.inner?.length?[[.6,1],[.3,2],[.15,4]]:[[.6,1],[.3,2],[.15,4]])){const r=level(spec,previousMesh?history.at(-1).h/2:h,previousMesh?history.at(-1).layers*2:layers,deps,previousMesh);previousMesh=r._mesh;delete r._mesh;history.push(r);if(history.length>1){if(r.J>history.at(-2).J*(1+1e-7))throw Error('Nested P1 refinement increased the variational energy beyond algebra tolerance.');r.refinementRelative=Math.abs(r.J-history.at(-2).J)/r.J;if(r.refinementRelative<=(spec.inner?.length?.01:.003)){const out={...r,history,cached:false,refinementAdmitted:true,shearCentreReplaced:false};if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,out);return out;}}}
  throw Error(`Finite-section did not meet1%refinement: ${JSON.stringify(history.map(r=>({J:r.J,nodes:r.nodes,ms:r.elapsedMs})))}`);
 }
 return {solve,level,clearCache:()=>cache.clear()};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingFiniteSection;

/* Small-displacement spatial Euler–Bernoulli frame, six DOFs/node.
 * mm, N, MPa; rotations rad. Includes axial extension, both bending planes,
 * unsymmetric cross-section bending, axial/bending reference-axis coupling,
 * Saint-Venant torsion, and consistent global forces and eccentric moments.
 * It is a locally prismatic 1-D beam approximation, not a 3-D solid FE model.
 * Strain energy is integrated from [u', kappa_2, kappa_3, phi'] and a symmetric
 * sectional constitutive matrix. Reference axes and loads are explicit.
 */
const WingFrame3D=(()=>{
 'use strict';
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,k)=>a.map(v=>v*k),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
 const unit=a=>{const l=norm(a);if(!(l>1e-12))throw Error('A frame axis is degenerate.');return scale(a,1/l);};
 const zero=(m,n=m)=>Array.from({length:m},()=>new Float64Array(n));
 const finite=(v,name)=>{if(!Number.isFinite(v))throw Error(`${name} must be finite.`);return v;};
 const GAUSS=Object.freeze([[.06943184420297371,.1739274225687269],[.33000947820757187,.3260725774312731],[.6699905217924281,.3260725774312731],[.9305681557970262,.1739274225687269]]);
 function integrate(fn,a,b,tolerance=1e-10,maxDepth=16){
   const gauss=(lo,hi)=>{let out;for(const[t,w]of GAUSS){const value=fn(lo+t*(hi-lo));if(!out)out=new Float64Array(value.length);value.forEach((v,i)=>out[i]+=v*w*(hi-lo));}return out;};
   const refine=(lo,hi,whole,depth)=>{const mid=(lo+hi)/2,left=gauss(lo,mid),right=gauss(mid,hi),sum=left.map((v,i)=>v+right[i]);let relative=0;for(let i=0;i<sum.length;i++)relative=Math.max(relative,Math.abs(sum[i]-whole[i])/Math.max(1,Math.abs(sum[i])));if(depth===0||relative<=tolerance)return sum;const x=refine(lo,mid,left,depth-1),y=refine(mid,hi,right,depth-1);return x.map((v,i)=>v+y[i]);};
   return refine(a,b,gauss(a,b),maxDepth);
 }
 function basis(a,b,orientation=[1,0,0]){
   const e1=unit(sub(b,a));let p=sub(orientation,scale(e1,dot(orientation,e1)));
   if(norm(p)<1e-9){const fallback=Math.abs(e1[2])<.9?[0,0,1]:[0,1,0];p=sub(fallback,scale(e1,dot(fallback,e1)));}
   const e2=unit(p),e3=unit(cross(e1,e2));return[e1,e2,e3];
 }
 function shapes(t,L){
   const H=[1-3*t*t+2*t*t*t,L*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,L*(-t*t+t*t*t)];
   const dH=[(-6*t+6*t*t)/L,1-4*t+3*t*t,(6*t-6*t*t)/L,-2*t+3*t*t];
   const ddH=[(-6+12*t)/(L*L),(-4+6*t)/L,(6-12*t)/(L*L),(-2+6*t)/L];
   return {H,dH,ddH,N:[1-t,t]};
 }
 function strainMatrix(t,L,withAxialBubble=false){
   const {ddH}=shapes(t,L),B=zero(4,withAxialBubble?13:12);
   B[0][0]=-1/L;B[0][6]=1/L;
   if(withAxialBubble)B[0][12]=4*(1-2*t)/L;
   [2,4,8,10].forEach((i,k)=>B[1][i]=ddH[k]*(k%2?1:-1));
   [1,5,7,11].forEach((i,k)=>B[2][i]=ddH[k]);
   B[3][3]=-1/L;B[3][9]=1/L;return B;
 }
 function constitutive(s){
   for(const k of ['EA','EI22','EI33','GJ'])if(!(finite(s[k],k)>0))throw Error(`${k} must be positive.`);
   const EI23=finite(s.EI23??0,'EI23'),first2=finite(s.first2??0,'first2'),first3=finite(s.first3??0,'first3');
   // first2 = integral E*q2 dA, first3 = integral E*q3 dA.
   const D=[[s.EA,first3,-first2,0],[first3,s.EI22,-EI23,0],[-first2,-EI23,s.EI33,0],[0,0,0,s.GJ]];
   cholesky(D);return D;
 }
 function cholesky(A){
   const n=A.length,L=zero(n);
   for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let v=A[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];if(i===j){if(!(v>0)||!Number.isFinite(v))throw Error('Frame stiffness is not positive definite; check restraints and section properties.');L[i][j]=Math.sqrt(v);}else L[i][j]=v/L[j][j];}
   return L;
 }
 function solveSPD(A,b){
   // Diagonal equilibration prevents mm/radian stiffness scales degrading SPD
   // admission and gives a useful residual even for slender classroom models.
   const d=A.map((r,i)=>{if(!(r[i]>0))throw Error('A frame DOF has no positive stiffness.');return Math.sqrt(r[i]);});
   const C=A.map((r,i)=>Float64Array.from(r,(v,j)=>v/(d[i]*d[j]))),L=cholesky(C),n=b.length;
   const back=rhs=>{const y=new Float64Array(n),x=new Float64Array(n);for(let i=0;i<n;i++){let v=rhs[i]/d[i];for(let j=0;j<i;j++)v-=L[i][j]*y[j];y[i]=v/L[i][i];}for(let i=n-1;i>=0;i--){let v=y[i];for(let j=i+1;j<n;j++)v-=L[j][i]*x[j];x[i]=v/L[i][i];}return x.map((v,i)=>v/d[i]);};
   const x=back(b);
   // Reuse the same factorization for two compensated-residual corrections.
   // Closely spaced mandatory stations can otherwise lose support equilibrium
   // digits even after diagonal scaling. No stiffness or loads are altered.
   if(n>12)for(let pass=0;pass<2;pass++){const residual=A.map((r,i)=>{let s=0,c=0;for(let j=0;j<n;j++){const v=r[j]*x[j],t=s+v;c+=Math.abs(s)>=Math.abs(v)?s-t+v:v-t+s;s=t;}return b[i]-(s+c);}),dx=back(residual);dx.forEach((v,i)=>x[i]+=v);}
   return x;
 }
 function matvec(A,x){return Float64Array.from(A,r=>dot(r,x));}
 function toLocal(R,v){return R.map(r=>dot(r,v));}
 function toGlobal(R,v){return [0,1,2].map(j=>R.reduce((s,r,i)=>s+r[j]*v[i],0));}
 function pointLoadVector(R,L,t,globalForce=[0,0,0],globalMoment=[0,0,0]){
   const force=toLocal(R,globalForce),moment=toLocal(R,globalMoment),{H,dH,N}=shapes(t,L),v=new Float64Array(13);
   [0,6].forEach((j,i)=>{v[j]+=N[i]*force[0];v[j+3]+=N[i]*moment[0];});v[12]=4*t*(1-t)*force[0];
   [1,5,7,11].forEach((j,i)=>v[j]+=H[i]*force[1]+dH[i]*moment[2]);
   [2,4,8,10].forEach((j,i)=>v[j]+=(i%2?-1:1)*(H[i]*force[2]-dH[i]*moment[1]));return v;
 }
 function element(nodes,s){
   if(!Number.isInteger(s.a)||!Number.isInteger(s.b)||s.a<0||s.b<0||s.a>=nodes.length||s.b>=nodes.length||s.a===s.b)throw Error('Frame element needs two different existing nodes.');
   const a=nodes[s.a],b=nodes[s.b],L=norm(sub(b,a)),R=basis(a,b,s.orientation);
   if(!(L>1e-8))throw Error('Frame element has zero length.');
   // A centroid offset couples axial strain to the linearly varying Hermite
   // bending curvatures. Linear axial displacement alone cannot represent
   // the corresponding zero-N field and introduces artificial axial locking.
   // Add one quadratic axial bubble, then statically condense it: global
   // nodes retain exactly six DOFs and no reduced-integration mechanism.
   const D=constitutive(s),fullK=zero(13),fullF=new Float64Array(13);
   for(const [t,w]of GAUSS){
     const B=strainMatrix(t,L,true),DB=D.map(r=>Float64Array.from({length:13},(_,j)=>r.reduce((v,c,h)=>v+c*B[h][j],0)));
     for(let i=0;i<13;i++)for(let j=0;j<13;j++)for(let h=0;h<4;h++)fullK[i][j]+=B[h][i]*DB[h][j]*w*L;
   }
   if(s.distributed)fullF.set(integrate(t=>{
     const q=s.distributed(t,add(a,scale(sub(b,a),t)))||{},force=toLocal(R,q.force||[0,0,0]),moment=toLocal(R,q.moment||[0,0,0]),{H,dH,N}=shapes(t,L),v=new Float64Array(13);
     [0,6].forEach((j,i)=>{v[j]+=L*N[i]*force[0];v[j+3]+=L*N[i]*moment[0];});
     v[12]=L*4*t*(1-t)*force[0];
     [1,5,7,11].forEach((j,i)=>v[j]+=L*(H[i]*force[1]+dH[i]*moment[2]));
     [2,4,8,10].forEach((j,i)=>v[j]+=L*(i%2?-1:1)*(H[i]*force[2]-dH[i]*moment[1]));return v;
   },0,1));
   if(s.consistentLoad){if(s.consistentLoad.length!==13||Array.from(s.consistentLoad).some(v=>!Number.isFinite(v)))throw Error('An element consistent load needs 13 finite entries including its axial bubble.');s.consistentLoad.forEach((v,i)=>fullF[i]+=v);}
   const axialMode={stiffness:fullK[12][12],coupling:Float64Array.from(fullK[12].slice(0,12)),load:fullF[12]};
   const k=zero(12),f=new Float64Array(12);
   for(let i=0;i<12;i++){f[i]=fullF[i]-fullK[i][12]*axialMode.load/axialMode.stiffness;for(let j=0;j<12;j++)k[i][j]=fullK[i][j]-fullK[i][12]*fullK[12][j]/axialMode.stiffness;}
   const T=zero(12);for(let block=0;block<4;block++)for(let i=0;i<3;i++)for(let j=0;j<3;j++)T[3*block+i][3*block+j]=R[i][j];
   const kg=zero(12),fg=new Float64Array(12);
   for(let i=0;i<12;i++){for(let h=0;h<12;h++)fg[i]+=T[h][i]*f[h];for(let j=0;j<12;j++)for(let h=0;h<12;h++)if(T[h][i])for(let l=0;l<12;l++)if(T[l][j])kg[i][j]+=T[h][i]*k[h][l]*T[l][j];}
   return {...s,L,R,D,k,f,T,kg,fg,axialMode,dofs:[...Array.from({length:6},(_,i)=>6*s.a+i),...Array.from({length:6},(_,i)=>6*s.b+i)]};
 }
 function solve({nodes,elements,loads=[],fixed=[0,1,2,3,4,5]}){
   if(!Array.isArray(nodes)||nodes.length<2||nodes.length>161||nodes.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('Use 2–161 finite spatial frame nodes.');
   const n=6*nodes.length,K=zero(n),f=new Float64Array(n),es=elements.map(s=>element(nodes,s));
   for(const e of es)for(let i=0;i<12;i++){f[e.dofs[i]]+=e.fg[i];for(let j=0;j<12;j++)K[e.dofs[i]][e.dofs[j]]+=e.kg[i][j];}
   for(const l of loads){if(!Number.isInteger(l.node)||l.node<0||l.node>=nodes.length)throw Error('A frame load references a missing node.');const values=[...(l.force||[0,0,0]),...(l.moment||[0,0,0])];if(values.length!==6||values.some(v=>!Number.isFinite(v)))throw Error('Frame forces and moments need three finite components.');values.forEach((v,i)=>f[6*l.node+i]+=v);}
   if(!Array.isArray(fixed)||fixed.some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid frame restraint DOF.');
   const fixedSet=new Set(fixed),free=Array.from({length:n},(_,i)=>i).filter(i=>!fixedSet.has(i)),u=new Float64Array(n),uf=solveSPD(free.map(i=>Float64Array.from(free,j=>K[i][j])),free.map(i=>f[i]));free.forEach((d,i)=>u[d]=uf[i]);
   const residual=matvec(K,u).map((v,i)=>v-f[i]),reactions=fixed.map(d=>({dof:d,value:residual[d]}));
   const member=es.map(e=>{const ul=matvec(e.T,e.dofs.map(d=>u[d])),end=matvec(e.k,ul).map((v,i)=>v-e.f[i]),bubble=(e.axialMode.load-dot(e.axialMode.coupling,ul))/e.axialMode.stiffness;return {...e,ul,bubble,end,globalEnd:matvec(e.T.map((r,i)=>Float64Array.from(r,(_,j)=>e.T[j][i])),end)};});
   const totalForce=[0,0,0],totalMoment=[0,0,0],supportForce=[0,0,0],supportMoment=[0,0,0];
   for(let i=0;i<nodes.length;i++){const F=Array.from(f.slice(6*i,6*i+3)),M=add(Array.from(f.slice(6*i+3,6*i+6)),cross(nodes[i],F));for(let j=0;j<3;j++){totalForce[j]+=F[j];totalMoment[j]+=M[j];}const RF=Array.from({length:3},(_,j)=>fixedSet.has(6*i+j)?residual[6*i+j]:0),RM=add(Array.from({length:3},(_,j)=>fixedSet.has(6*i+j+3)?residual[6*i+j+3]:0),cross(nodes[i],RF));for(let j=0;j<3;j++){supportForce[j]+=RF[j];supportMoment[j]+=RM[j];}}
   const internalWork=es.reduce((s,e)=>s+e.axialMode.load**2/e.axialMode.stiffness,0),energy=.5*(dot(u,matvec(K,u))+internalWork),work=dot(u,f)+internalWork,forceError=norm(add(totalForce,supportForce)),momentError=norm(add(totalMoment,supportMoment)),freeResidual=Math.max(0,...free.map(i=>Math.abs(residual[i])));
   return {nodes,elements:member,displacements:nodes.map((_,i)=>Array.from(u.slice(6*i,6*i+3))),rotations:nodes.map((_,i)=>Array.from(u.slice(6*i+3,6*i+6))),u,applied:f,reactions,energy,work,verification:{forceError,momentError,freeResidual,energyError:Math.abs(2*energy-work)/Math.max(Math.abs(work),1e-30),totalForce,totalMoment,supportForce,supportMoment},method:'6-DOF spatial Euler–Bernoulli frame; condensed quadratic axial mode + coupled biaxial bending + Saint-Venant torsion'};
 }
 function sampleElement(e,t){
   const {H,dH,N}=shapes(t,e.L),u=e.ul,local=[N[0]*u[0]+N[1]*u[6]+4*t*(1-t)*(e.bubble||0),[1,5,7,11].reduce((s,j,i)=>s+H[i]*u[j],0),[2,4,8,10].reduce((s,j,i)=>s+H[i]*(i%2?-1:1)*u[j],0)],rotation=[N[0]*u[3]+N[1]*u[9],-[2,4,8,10].reduce((s,j,i)=>s+dH[i]*(i%2?-1:1)*u[j],0),[1,5,7,11].reduce((s,j,i)=>s+dH[i]*u[j],0)];
   const strain=matvec(strainMatrix(t,e.L,true),[...u,e.bubble||0]),resultant=matvec(e.D,strain);
   return {displacement:toGlobal(e.R,local),rotation:toGlobal(e.R,rotation),strain:Array.from(strain),resultant:Array.from(resultant)};
 }
 return {solve,element,basis,constitutive,strainMatrix,sampleElement,pointLoadVector,toLocal,toGlobal,dot,add,sub,scale,cross,norm,unit,solveSPD,integrate,GAUSS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingFrame3D;

/* Station airfoils and aircraft geometry editor. Changes are atomic and use the host's geometry validator. */
const WingGeometryUI=(()=>{
 'use strict';
 function mount(container,{getGeometry,applyGeometry,onApplied=()=>{},documentRef=container.ownerDocument}){
  const doc=documentRef,win=doc.defaultView,G=typeof WingGeometry!=='undefined'?WingGeometry:require('./wing_geometry.js'),A=typeof WingAirfoils!=='undefined'?WingAirfoils:require('./wing_airfoils.js');
  const clone=x=>JSON.parse(JSON.stringify(x)),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const node=(tag,attrs={},html)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(html!=null)n.innerHTML=html;return n;};
  let draft,generation=0,dimensionSource='tip';
  const activeReads=new Map();
  function cancelPickerRead(id){
   const pending=activeReads.get(id);if(!pending)return;
   activeReads.delete(id);pending.cancel?.();
   try{pending.reader?.abort();}catch{/* Generation/identity guards also protect embedded readers without abort support. */}
  }
  function cancelReads(){generation++;for(const id of activeReads.keys())cancelPickerRead(id);}
  const profileValidators=new Map();
  const form=node('form',{class:'wing-geometry-form'});
  const notice=node('p',{role:'status',class:'note',id:'wingGeometryEditorStatus',tabindex:'-1'});
  container.append(form,notice);
  // Keep instructional copy in the shared Help menu; retain live validation in the editor.
  function syncGeometryHelp(){
   const host=doc.querySelector('#wingInputHelp .wing-help-content');if(!host)return;
   let section=host.querySelector('#wingHelpGeometry');
   if(!section){section=node('details',{id:'wingHelpGeometry'});section.append(node('summary',{},'Airfoils, dimensions, taper & orientation'));host.prepend(section);}
   let body=section.querySelector('[data-geometry-help-body]');if(!body){body=node('div',{'data-geometry-help-body':''});section.append(body);}
   const copies=[],seen=new Set();
   for(const original of form.querySelectorAll('p.note,small')){
    if(original.closest('.wing-geometry-guidance'))continue;
    const text=original.textContent.trim();original.hidden=true;if(!text)continue;
    const label=original.matches('small')?original.closest('label')?.firstChild?.textContent?.trim():'';
    const key=(label?label+': ':'')+text;if(seen.has(key))continue;seen.add(key);
    const copy=node('p',{class:'note'});copy.textContent=key;copies.push(copy);
   }
   body.replaceChildren(...copies);
   for(const detail of form.querySelectorAll('details'))if(detail.querySelector('summary')?.textContent==='Airfoil file format & print geometry')detail.hidden=true;
  }
  form.addEventListener('input',syncGeometryHelp);form.addEventListener('change',syncGeometryHelp);
  doc.addEventListener('wing-help-ready',syncGeometryHelp);
  const name=p=>p.name||('NACA '+p.code);
  const numeric=(label,id,value,hint='',attrs='')=>`<label class="wing-geometry-field" for="${id}">${label}<small>${hint}</small><input id="${id}" type="number" step="any" value="${value}" ${attrs} required></label>`;
  const baseProfile=()=>draft.airfoil||{kind:'naca4',code:draft.naca};
  function message(text,bad=false){
   notice.textContent=text;notice.setAttribute('role',bad?'alert':'status');notice.style.color=bad?'var(--bad)':'';
   if(bad){
    let target=form.querySelector('[aria-invalid="true"],input:invalid,select:invalid,textarea:invalid');
    if(!target&&!/spar|rod|seam/i.test(text)){
     const id=/skin|cavity|hollow/i.test(text)?'wgtSkin':/root chord/i.test(text)?'wgtRootChord':/tip chord/i.test(text)?'wgtTipChord':/semi.span/i.test(text)?'wgtSpan':null;
     if(id)target=form.querySelector('#'+id);
    }
    win.WingLabUI?.showError?.(text,target||notice);
   }
  }
  function showGuidance(d){
   if(!d||d.kind!=='cavity')return;
   const box=node('section',{class:'wing-geometry-guidance',role:'alert','aria-label':'How to fix this wing geometry'});
   box.append(node('h3',{},'Why Apply geometry stopped'));
   box.append(node('p',{},`${d.section?'Section '+d.section+' · ':''}${esc(d.profile)} · eta ${d.eta.toFixed(3)} · y ${d.y.toFixed(1)} mm · chord ${d.chord.toFixed(1)} mm.`));
   box.append(node('p',{},`Near <b>x/c = ${d.x.toFixed(3)}</b> (the aft part of this cavity), the outer thickness is ${d.outer.toFixed(2)} mm. Two ${d.skin.toFixed(2)} mm skins leave <b>${d.gap.toFixed(2)} mm</b>; this model requires ${d.requiredGap.toFixed(2)} mm. Different airfoil families are allowed—the local cavity clearance is the problem.`));
   const options=node('ol');
   for(const suggestion of d.suggestions){const item=node('li');item.textContent=suggestion.text;
    if(suggestion.kind==='skin'||suggestion.kind==='chords'){
     const button=node('button',{type:'button',class:'btn'},suggestion.kind==='skin'?`Put skin ${suggestion.value.toFixed(1)} mm in draft`:'Put larger chords in draft');
     button.onclick=()=>{if(suggestion.kind==='skin'){draft.skin=suggestion.value;form.querySelector('#wgtSkin').value=draft.skin;}else{draft.rootChord=suggestion.root;draft.tipChord=suggestion.tip;dimensionSource='tip';form.querySelector('#wgtRootChord').value=draft.rootChord;form.querySelector('#wgtTipChord').value=draft.tipChord;form.querySelector('#wgtTipChord').dispatchEvent(new win.Event('input',{bubbles:true}));}box.querySelectorAll('button').forEach(b=>b.disabled=true);message('Suggestion placed in the draft only. Inspect it, then press Apply geometry to re-check all constraints. The current wing has not changed.');};item.append(doc.createElement('br'),button);
    }options.append(item);
   }
   box.append(options,node('p',{class:'note'},esc(d.scope)));form.prepend(box);box.scrollIntoView?.({block:'nearest'});
  }
  function outline(p){
   const s=A.surfaces(p,1,null,81),points=s.xu.map((x,i)=>[x,s.zu[i]]).reverse().concat(s.xl.slice(1).map((x,i)=>[x,s.zl[i+1]]));
   const zz=points.map(p=>p[1]),lo=Math.min(...zz),hi=Math.max(...zz),height=Math.max(.15,hi-lo),cy=(lo+hi)/2;
   return `<svg viewBox="0 0 400 100" role="img" aria-label="Local airfoil profile, normalized coordinates" style="width:100%;max-height:90px"><path d="M ${points.map(([x,z])=>`${12+376*x},${50-75*(z-cy)/height}`).join(' L ')} Z" fill="var(--raise,#e4f0fb)" stroke="var(--accent,#176ac0)" stroke-width="2"/></svg>`;
  }
  function profilePicker(holder,get,set,id){
   cancelPickerRead(id);
   const p=get(),card=node('div',{class:'wing-airfoil-picker'});
   card.innerHTML=`<label for="${id}Kind">Airfoil family / library</label><select id="${id}Kind" aria-label="Airfoil family at ${id}"><option value="current">${esc(name(p))} · current</option><option value="naca4">NACA 4-digit · enter code</option><option value="naca5">NACA 5-digit · non-reflex code</option>${A.catalog.map(e=>`<option value="${e.id}">${esc(e.name+' · '+e.family)}</option>`).join('')}</select><label for="${id}Code">NACA code</label><input id="${id}Code" type="text" value="${esc(p.code||'')}" ${p.kind==='coordinates'?'disabled':''} maxlength="9" autocomplete="off"><label class="btn" style="display:inline-flex;gap:6px;align-items:center">Upload airfoil .dat / .txt<input id="${id}Dat" type="file" accept=".dat,.txt,text/plain" aria-label="Upload airfoil at ${id}" style="max-width:220px"></label><div data-profile-outline>${outline(p)}</div><p class="note" data-profile-source></p>`;
   card.querySelector('[data-profile-source]').textContent=p.source?.url||p.source?.filename||'Analytical NACA section; no aerodynamic polar is inferred.';
   const choose=card.querySelector('select'),code=card.querySelector('[type=text]');
   profileValidators.set(id,()=>{if(!code.disabled){const value=code.value.trim();set(clone(A.normalizeProfile({kind:value.replace(/^NACA\s*/i,'').length===5?'naca5':'naca4',code:value})));}});
   const repaint=()=>{holder.replaceChildren();profilePicker(holder,get,set,id);syncGeometryHelp();};
   choose.onchange=()=>{cancelPickerRead(id);try{set(clone(choose.value==='current'?get():choose.value==='naca4'?A.normalizeProfile({kind:'naca4',code:'2412'}):choose.value==='naca5'?A.normalizeProfile({kind:'naca5',code:'23012'}):A.preset(choose.value)));repaint();message('Airfoil selected in the draft. Apply geometry to update the wing.');}catch(e){message(e.message,true);}};
   code.addEventListener('input',()=>cancelPickerRead(id));
   code.onchange=()=>{cancelPickerRead(id);try{set(clone(A.normalizeProfile({kind:code.value.trim().replace(/^NACA\s*/i,'').length===5?'naca5':'naca4',code:code.value.trim()})));repaint();}catch(e){message(e.message,true);}};
   card.querySelector('[type=file]').onchange=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    cancelPickerRead(id);
    if(file.size>262144){message('Airfoil file is too large (maximum 256 KiB).',true);return;}
    const started=generation,ticket={};activeReads.set(id,ticket);message('Reading '+file.name+'…');
    const current=()=>started===generation&&activeReads.get(id)===ticket;
    try{
     const text=await new Promise((resolve,reject)=>{ticket.cancel=()=>resolve(null);const r=ticket.reader=new win.FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read this airfoil file.'));r.onabort=()=>resolve(null);r.readAsText(file);});
     if(!current()||text===null)return;
     const parsed=A.parseDat(text,{filename:file.name});activeReads.delete(id);set(clone(parsed));repaint();
     message('Read '+file.name+' ('+parsed.source.format+'). Inspect the profile, then Apply geometry. The current wing is unchanged until Apply.');
    }catch(err){if(current())message(err.message,true);}finally{if(activeReads.get(id)===ticket)activeReads.delete(id);}
   };
   holder.append(card);
  }
  function stations(){
   const p=clone(baseProfile());
   if(!draft.stations)draft.stations=[{eta:0,airfoil:clone(p),incidenceDeg:0},{eta:.5,airfoil:clone(p),incidenceDeg:0},{eta:1,airfoil:clone(p),incidenceDeg:0}];
  }
  function nonlinearIncidence(){
   const ss=draft.stations||[];if(ss.length<2)return false;
   const a=ss[0].incidenceDeg,b=ss.at(-1).incidenceDeg;
   return ss.some(s=>Math.abs(s.incidenceDeg-(a+(b-a)*s.eta))>1e-8);
  }
  function syncTwistSummary(){
   const root=form.querySelector('#wgtRootInc'),tip=form.querySelector('#wgtTipInc');if(!root)return;
   const ss=draft.stations||[],a=ss[0]?.incidenceDeg||0,b=ss.at(-1)?.incidenceDeg||0,custom=nonlinearIncidence();
   form.querySelector('#wgtSimpleAngles').hidden=!draft.twistEnabled;
   for(const [input,value]of [[root,a],[tip,b]]){input.readOnly=custom;input.setAttribute('aria-readonly',String(custom));if(doc.activeElement!==input)input.value=value;}
   const delta=b-a,summary=custom?'Custom intermediate angles are retained. Edit the section angles below, or explicitly replace them with a linear root-to-tip variation.':Math.abs(delta)<1e-8?`Same incidence ${a}° at root and tip; no spanwise geometric twist.`:`Tip − root = ${+delta.toFixed(3)}°: ${Math.abs(+delta.toFixed(3))}° ${delta<0?'washout (tip angle lower)':'wash-in (tip angle higher)'}.`;
   form.querySelector('#wgtTwistSummary').textContent=summary;
   form.querySelector('#wgtLinearAngles').hidden=!custom;
   for(const [s,i]of ss.map((s,i)=>[s,i])){const input=form.querySelector('#wgtInc'+i);if(input)input.readOnly=!draft.twistEnabled;}
  }
  function readSimpleAngles(){
   if(!draft.twistEnabled||nonlinearIncidence())return;
   const inputs=['wgtRootInc','wgtTipInc'].map(id=>form.querySelector('#'+id));
   if(!inputs.every(Boolean))return;
   const values=inputs.map(input=>input.value.trim()===''?NaN:Number(input.value));
   if(values.some(v=>!Number.isFinite(v)||Math.abs(v)>30))throw Error('Enter root and tip incidence between −30° and +30°.');
   for(const [s,i]of (draft.stations||[]).map((s,i)=>[s,i])){s.incidenceDeg=values[0]+(values[1]-values[0])*s.eta;const input=form.querySelector('#wgtInc'+i);if(input)input.value=+s.incidenceDeg.toFixed(10);const heading=form.querySelectorAll('.wing-station-card > summary')[i];if(heading)heading.textContent=`Section ${i+1} · ${i===0?'root':i===draft.stations.length-1?'tip':'eta '+s.eta} · ${name(s.airfoil)} · ${+s.incidenceDeg.toFixed(3)}°`;}
  }
  function organiseTwistControls(){
   const field=form.querySelector('#wgtTwist').closest('.field'),section=node('fieldset',{class:'wing-twist-simple'},'<legend>Wing incidence and twist</legend>');field.before(section);section.append(field);
   field.querySelector('label').firstChild.textContent='Set wing angles';
   form.querySelector('#wgtTwist option[value="no"]').textContent='None · all incidences 0°';
   form.querySelector('#wgtTwist option[value="yes"]').textContent='Set root and tip incidence';
   const a=draft.stations?.[0]?.incidenceDeg||0,b=draft.stations?.at(-1)?.incidenceDeg||0;
   const quick=node('div',{id:'wgtSimpleAngles'},'<p class="note">Incidence is the section angle. Positive raises the leading edge. Enter the actual angle at each end, not an extra rotation.</p><div class="wing-geometry-grid">'+numeric('Root incidence (°)','wgtRootInc',a,'Angle at the wing root','min="-30" max="30"')+numeric('Tip incidence (°)','wgtTipInc',b,'Angle at the wing tip','min="-30" max="30"')+'</div><p class="note" id="wgtTwistSummary"></p><p class="note">Example: root +2°, tip 0° gives 2° washout. Intermediate angles are interpolated linearly; airfoil choices stay unchanged.</p><button type="button" class="btn" id="wgtLinearAngles">Replace custom angles with linear root to tip</button>');section.append(quick);
   const profiles=node('fieldset',{id:'wgtSpanwiseProfiles'},'<legend>Spanwise airfoils</legend>');section.before(profiles);
   const check=form.querySelector('#wgtSections').closest('label'),note=check.nextElementSibling,stationBox=form.querySelector('#wgtStations');
   profiles.append(check,note,stationBox);
   const pivot=form.querySelector('#wgtTwistRef').closest('label');section.append(pivot);
   for(const id of ['wgtRootInc','wgtTipInc'])form.querySelector('#'+id).oninput=()=>{try{readSimpleAngles();syncTwistSummary();message('Angles are a draft until Apply geometry.');}catch(err){message(err.message,true);}};
   form.querySelector('#wgtLinearAngles').onclick=()=>{const ss=draft.stations||[],a=ss[0]?.incidenceDeg||0,b=ss.at(-1)?.incidenceDeg||0;for(const s of ss)s.incidenceDeg=a+(b-a)*s.eta;render();message('Intermediate angles replaced with a linear variation. Airfoil profiles retained; Apply geometry to commit.');};
   syncTwistSummary();
  }
  function renderDimensions(){
   const box=node('fieldset',{class:'wing-planform-dimensions'});
   box.innerHTML='<legend>Wing dimensions & taper</legend><label>Planform<select id="wgtPlanform"><option value="linear">Rectangular / trapezoidal</option><option value="elliptic">Elliptical · closed tip</option><option value="delta">Delta · pointed tip</option></select></label><p class="note">Elliptical and delta shapes close at zero tip chord. The narrow tip is solid; the hollow cavity ends inboard. Nominal normal-stress analysis is available with zero user sweep, dihedral and incidence. Exact-apex stress is undefined. After Solve, bending displacement components are available; torsional displacement is not computed.</p><label for="wgtChordMode">Chord input method<select id="wgtChordMode"><option value="tip">Root + Tip → calculate λ</option><option value="ratio">Root + λ → calculate Tip</option></select></label><div class="wing-geometry-grid">'+numeric('Semi-span (mm)','wgtSpan',draft.semiSpan,'Root to tip, projected aircraft y','min="1"')+numeric('Root chord (mm)','wgtRootChord',draft.rootChord,'Reference chord at root','min="1"')+numeric('Tip chord (mm)','wgtTipChord',draft.tipChord,'Reference chord at tip','min="0"')+numeric('Taper ratio λ = tip / root','wgtTaper',draft.tipChord/draft.rootChord,'1 = rectangular; below 1 = narrower tip','min="0" max="1"')+numeric('Skin thickness (mm)','wgtSkin',draft.skin,'Measured vertically; course printing minimum 0.8 mm','min="0.001" step="0.1"')+'<label class="wing-geometry-field">Printed modules<small>Equal lengths; seams between modules</small><select id="wgtModules"><option value="1">1 · one piece</option><option value="2">2</option><option value="3">3</option></select></label></div><p class="note" id="wgtChordHint"></p><dl class="kv wl-kv" id="wgtGeometrySummary"></dl>';
   form.prepend(box);box.querySelector('#wgtModules').value=String(draft.modules??1);const shape=box.querySelector('#wgtPlanform');if(draft.tipChord>0&&['elliptic','delta'].includes(draft.planform)){const old=node('option',{value:'legacy'},'Imported trimmed '+draft.planform+' · choose a closed shape');old.disabled=true;shape.append(old);shape.value='legacy';}else shape.value=draft.planform||'linear';box.querySelector('#wgtPlanform').onchange=e=>{draft.planform=e.target.value;draft.sweepReferenceFraction=draft.planform==='delta'?1:draft.planform==='elliptic'?.5:0;if(draft.planform!=='linear'){draft.tipChord=0;draft.sweepDeg=0;win.wingChordInputMode='tip';}else if(draft.tipChord===0)draft.tipChord=.7*draft.rootChord;render();};dimensionSource=win.wingChordInputMode==='ratio'?'ratio':'tip';
   const value=id=>{const s=form.querySelector('#'+id).value;return s.trim()===''?NaN:Number(s);};
   box.querySelector('#wgtModules').onchange=e=>{draft.modules=Number(e.target.value);preview();};
   box.querySelector('#wgtSkin').oninput=()=>{draft.skin=value('wgtSkin');};
   function preview(){
    const closed=G.closedTip(draft);if(closed)dimensionSource='tip';const ratio=dimensionSource==='ratio';box.querySelector('#wgtChordMode').value=dimensionSource;
    box.querySelector('#wgtChordMode').disabled=closed;box.querySelector('#wgtTipChord').readOnly=closed||ratio;box.querySelector('#wgtTaper').readOnly=closed||!ratio;
    box.querySelector('#wgtTipChord').setAttribute('aria-readonly',String(closed||ratio));box.querySelector('#wgtTaper').setAttribute('aria-readonly',String(closed||!ratio));
    box.querySelector('#wgtChordHint').textContent=closed?'Zero tip chord: exact closed planform; no tip trimming.':ratio?'Tip is calculated from Root × λ. Changing Root preserves λ.':'λ is calculated from Tip / Root. Enter both chord lengths.';
    const area=G.area(draft),length=draft.semiSpan/(draft.modules||1),summary=box.querySelector('#wgtGeometrySummary');
    summary.innerHTML=Number.isFinite(area)&&area>0?`<dt>Semi-wing area</dt><dd>${(area/100).toFixed(1)} cm²</dd><dt>Taper ratio</dt><dd>${(draft.tipChord/draft.rootChord).toFixed(3)}</dd><dt>Aspect ratio (full wing)</dt><dd>${(2*draft.semiSpan**2/area).toFixed(2)}</dd><dt>Module length</dt><dd>${length.toFixed(1)} mm</dd>`:'';

   }
   box.querySelector('#wgtChordMode').onchange=e=>{dimensionSource=e.target.value;win.wingChordInputMode=dimensionSource;preview();};
   for(const[id,key]of [['wgtSpan','semiSpan'],['wgtRootChord','rootChord'],['wgtTipChord','tipChord']])box.querySelector('#'+id).oninput=()=>{
    if(key==='tipChord'&&dimensionSource==='ratio')return;
    draft[key]=value(id);
    if(dimensionSource==='ratio'&&!G.closedTip(draft)){draft.tipChord=draft.rootChord*value('wgtTaper');box.querySelector('#wgtTipChord').value=Number.isFinite(draft.tipChord)?+draft.tipChord.toPrecision(12):'';}
    else box.querySelector('#wgtTaper').value=Number.isFinite(draft.tipChord/draft.rootChord)?+(draft.tipChord/draft.rootChord).toPrecision(8):'';
    preview();
   };
   box.querySelector('#wgtTaper').oninput=()=>{
    if(dimensionSource!=='ratio')return;const ratio=value('wgtTaper');draft.rootChord=value('wgtRootChord');draft.tipChord=draft.rootChord*ratio;
    box.querySelector('#wgtTipChord').value=Number.isFinite(draft.tipChord)?+draft.tipChord.toPrecision(12):'';preview();
   };
   preview();
  }
  function render(){
   cancelReads();
   profileValidators.clear();
   form.innerHTML=`<div class="lesson-actions" style="position:sticky;top:0;z-index:2;background:var(--panel);padding:8px 0"><button class="btn primary" type="submit" id="wgtApply">Apply geometry</button></div><p class="note">Aircraft coordinates: x aft, y projected semi-span, z up. Positive incidence is leading-edge up; negative tip incidence relative to root is washout. These are geometry inputs, not a computed lift distribution.</p><h4>Default airfoil</h4><div id="wgtDefaultProfile"></div><div class="field"><label for="wgtTwist">Geometric twist / incidence?</label><select id="wgtTwist"><option value="no" ${!draft.twistEnabled?'selected':''}>No · zero incidence</option><option value="yes" ${draft.twistEnabled?'selected':''}>Yes · set section incidences</option></select></div><label><input type="checkbox" id="wgtSections" ${draft.stations?'checked':''}> Choose airfoils at root, intermediate stations and tip</label><p class="note">Root and tip are required. Intermediate stations are optional—not necessarily ribs. Airfoil shape and absolute incidence interpolate linearly between stations.</p><div id="wgtStations"></div><h4>Planform & orientation</h4><div class="wing-geometry-grid">${numeric('Sweep (degrees)','wgtSweep',draft.sweepDeg??0,'Positive aft; reference below','min="-60" max="60"')}${numeric('Dihedral (degrees)','wgtDihedral',draft.dihedralDeg??0,'Positive tip-up; negative anhedral','min="-45" max="45"')}${numeric('Sweep reference x/c','wgtSweepRef',draft.sweepReferenceFraction??0,'0 = leading edge; 0.25 = quarter chord','min="0" max="1"')}${numeric('Incidence pivot x/c','wgtTwistRef',draft.twistReferenceFraction??.25,'0.25 = common quarter-chord pivot','min="0" max="1"')}</div><p class="note">Sections remain in flight-parallel x–z planes (OpenVSP default), not rotated to follow dihedral. Chord follows the selected planform. Control surfaces, winglets and arbitrary multi-element airfoils are not inferred from these inputs.</p><details><summary>Airfoil file format & print geometry</summary><p class="note">Selig: optional title, then normalized x/c and z/c coordinate pairs from trailing edge around the leading edge to the other trailing edge. Lednicer: title, upper/lower point counts, then the two coordinate blocks. No polar or force data. Single-element monotone upper/lower surfaces only. Source coordinates are embedded in JSON. The printable trailing-edge thickness and skin/cavity settings still apply and can make a thin profile unprintable; no dimension is changed automatically.</p></details>`;
   renderDimensions();
   profilePicker(form.querySelector('#wgtDefaultProfile'),baseProfile,p=>draft.airfoil=p,'wgtDefault');
   const stationBox=form.querySelector('#wgtStations');
   if(draft.stations){
    draft.stations.forEach((s,i)=>{
     const box=node('details',{class:'wing-station-card'},`<summary>Section ${i+1} · ${i===0?'root':i===draft.stations.length-1?'tip':'eta '+s.eta} · ${esc(name(s.airfoil))} · ${s.incidenceDeg}°</summary><div class="wing-geometry-grid">${numeric('Span fraction eta','wgtEta'+i,s.eta,'0 = root, 1 = tip',i===0||i===draft.stations.length-1?'readonly':'min="0" max="1"')}${numeric('Absolute incidence (degrees)','wgtInc'+i,s.incidenceDeg,'Positive LE-up; not incremental twist','min="-30" max="30"')}</div><div data-station-profile></div>${i>0&&i<draft.stations.length-1?'<button type="button" class="btn" data-remove-station>Remove this station</button>':''}`);
     const updateHeading=()=>{box.querySelector('summary').textContent=`Section ${i+1} · ${i===0?'root':i===draft.stations.length-1?'tip':'eta '+s.eta} · ${name(s.airfoil)} · ${s.incidenceDeg}°`;};
     if(i===0)box.open=true;
     profilePicker(box.querySelector('[data-station-profile]'),()=>s.airfoil,p=>{s.airfoil=p;updateHeading();},'wgtStation'+i);
     box.querySelector('#wgtEta'+i).onchange=e=>{s.eta=Number(e.target.value);updateHeading();syncTwistSummary();};
     box.querySelector('#wgtInc'+i).onchange=e=>{s.incidenceDeg=e.target.value.trim()===''?NaN:Number(e.target.value);updateHeading();syncTwistSummary();};
     box.querySelector('[data-remove-station]')?.addEventListener('click',()=>{draft.stations.splice(i,1);render();});
     stationBox.append(box);
    });
    const add=node('button',{type:'button',class:'btn',id:'wgtAddStation'},'Add intermediate station');add.disabled=draft.stations.length>=9;
    add.onclick=()=>{let k=1;for(let j=2;j<draft.stations.length;j++)if(draft.stations[j].eta-draft.stations[j-1].eta>draft.stations[k].eta-draft.stations[k-1].eta)k=j;const a=draft.stations[k-1],b=draft.stations[k];draft.stations.splice(k,0,{eta:(a.eta+b.eta)/2,airfoil:clone(a.airfoil),incidenceDeg:(a.incidenceDeg+b.incidenceDeg)/2});render();};stationBox.append(add);
   }
   organiseTwistControls();
   form.querySelector('#wgtSweepRef').readOnly=draft.planform==='delta'||G.closedTip(draft)&&draft.planform==='elliptic';
   if(draft.planform==='delta')form.querySelector('#wgtSweepRef').title='Delta keeps a straight trailing edge (x/c = 1). Sweep adds to this reference line.';
   form.querySelector('#wgtTwist').onchange=e=>{draft.twistEnabled=e.target.value==='yes';if(draft.twistEnabled)stations();else for(const s of draft.stations||[])s.incidenceDeg=0;render();if(!draft.twistEnabled)message('All draft incidences set to zero; airfoil profiles retained. Apply geometry to commit.');};
   form.querySelector('#wgtSections').onchange=e=>{if(e.target.checked)stations();else{if(draft.twistEnabled){e.target.checked=true;message('Twist needs root/tip incidence stations. Turn twist off first.',true);return;}delete draft.stations;}render();};
   for(const[id,key]of [['wgtSweep','sweepDeg'],['wgtDihedral','dihedralDeg'],['wgtSweepRef','sweepReferenceFraction'],['wgtTwistRef','twistReferenceFraction']])form.querySelector('#'+id).onchange=e=>{draft[key]=e.target.value.trim()===''?NaN:Number(e.target.value);};
   syncGeometryHelp();
  }
  form.onsubmit=e=>{
   e.preventDefault();if(activeReads.size){message('Wait until the airfoil file has finished reading.',true);return;}
   form.querySelector('.wing-geometry-guidance')?.remove();
   try{
    // Enter can submit before change/blur: validate visible fields, never a stale draft.
    for(const validate of profileValidators.values())validate();
    // A typed end angle may be submitted with Enter before input/change fires.
    // Per-station edits are authoritative when their visible values differ.
    const advancedChanged=(draft.stations||[]).some((s,i)=>{const n=form.querySelector('#wgtInc'+i);return n&&(n.value.trim()===''||!Number.isFinite(Number(n.value))||Math.abs(Number(n.value)-s.incidenceDeg)>1e-8);});
    if(!advancedChanged)readSimpleAngles();
    for(const[id,key]of [['wgtSpan','semiSpan'],['wgtRootChord','rootChord'],['wgtTipChord','tipChord']]){
     const value=form.querySelector('#'+id).value;draft[key]=value.trim()===''?NaN:Number(value);
    }
    if(dimensionSource==='ratio'){
     const text=form.querySelector('#wgtTaper').value,ratio=text.trim()===''?NaN:Number(text);
     if(!Number.isFinite(ratio)||ratio<=0||ratio>1)throw Error('Taper ratio must be greater than 0 and no greater than 1.');
     draft.tipChord=draft.rootChord*ratio;
    }
    for(const[id,key]of [['wgtSweep','sweepDeg'],['wgtDihedral','dihedralDeg'],['wgtSweepRef','sweepReferenceFraction'],['wgtTwistRef','twistReferenceFraction']]){
      const value=form.querySelector('#'+id).value;draft[key]=value.trim()===''?NaN:Number(value);
    }
    for(const[s,i]of (draft.stations||[]).map((s,i)=>[s,i])){
      for(const[prefix,key]of [['wgtEta','eta'],['wgtInc','incidenceDeg']]){const value=form.querySelector('#'+prefix+i).value;s[key]=value.trim()===''?NaN:Number(value);}
    }
    const skinText=form.querySelector('#wgtSkin').value;draft.skin=skinText.trim()===''?NaN:Number(skinText);
    if(!Number.isFinite(draft.skin)||draft.skin<=0)throw Error('Skin thickness must be a positive number of millimetres.');
    const patch={planform:draft.planform||'linear',modules:Number(form.querySelector('#wgtModules').value),semiSpan:draft.semiSpan,rootChord:draft.rootChord,tipChord:draft.tipChord,skin:draft.skin,airfoil:clone(A.normalizeProfile(baseProfile())),twistEnabled:!!draft.twistEnabled,sweepDeg:draft.sweepDeg??0,dihedralDeg:draft.dihedralDeg??0,sweepReferenceFraction:draft.sweepReferenceFraction??0,twistReferenceFraction:draft.twistReferenceFraction??.25};
    // Explicitly removing section variation uses the same global profile at root and tip.
    patch.stations=draft.stations?clone(draft.stations):undefined;
    // A uniform, unrotated four-digit section with leading-edge alignment is
    // exactly the legacy construction. Keep its rod/joint-compatible analysis
    // route rather than silently upgrading it merely because a picker was used.
    if(patch.planform==='linear'&&patch.airfoil.kind==='naca4'&&!draft.stations&&!patch.twistEnabled&&patch.sweepDeg===0&&patch.dihedralDeg===0&&(patch.sweepReferenceFraction===0||draft.rootChord===draft.tipChord)){
     patch.naca=patch.airfoil.code;patch.airfoil=null;patch.stations=null;
    }
    const result=applyGeometry(patch,'advanced','airfoil / sweep / dihedral / incidence');
    if(!result.ok){message(result.error||'Geometry was not applied. Check the wing dimensions and cavity clearance.',true);showGuidance(result.guidance);return;}
    message('Geometry applied.');onApplied();
   }catch(err){message(err.message,true);}
  };
  const style=node('style',{},'.wing-geometry-guidance{border:1px solid var(--warn,#ad7300);border-radius:10px;padding:12px;background:var(--panel-2);font-size:13px;line-height:1.45}.wing-geometry-guidance h3{margin:0 0 6px}.wing-geometry-guidance li{margin:10px 0}.wing-geometry-guidance .btn{margin-top:5px}.wing-geometry-form{display:grid;gap:10px}.wing-geometry-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.wing-geometry-field{display:grid;gap:4px;font-size:13px}.wing-geometry-field small{color:var(--muted)}.wing-geometry-form input[type=number],.wing-geometry-form input[type=text],.wing-geometry-form select{width:100%;min-height:40px;padding:7px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--fg);font-size:16px}.wing-airfoil-picker{display:grid;gap:6px}.wing-station-card{margin:7px 0;padding:8px;border:1px solid var(--line);border-radius:8px}.wing-station-card>summary{font-weight:700;cursor:pointer;padding:7px 0}.wing-station-card .note{overflow-wrap:anywhere}');doc.head.append(style);
  return{refresh(){draft=clone(getGeometry());render();message('Changes remain a draft until Apply geometry.');},form,notice};
 }
 return{mount};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingGeometryUI;

/* Local geometry diagnostics, not AI, a solver bypass, or manufacturing approval.
 * Reuses the engine's vertical ordinates, 120 cavity samples and 0.8 mm gap rule.
 * Runs only after a cavity rejection; never mutates inputs or runs structural FE.
 */
const WingGeometryHelp=(()=>{
 'use strict';
 const GAP=.8,MIN_SKIN=.8;
 function sampleStations(g,E){return [...new Set([0,g.semiSpan,...E.seams(g),...E.ribStations(g),...(g.stations||[]).map(s=>s.eta*g.semiSpan),...Array.from({length:33},(_,i)=>g.semiSpan*i/32)])].sort((a,b)=>a-b);}
 function scan(g,E,ys){let worst=null;for(const y of ys){const chord=E.chordAt(g,y),profile=E.airfoilAt(g,y);for(let i=0;i<120;i++){const x=g.cavityStart+(g.cavityEnd-g.cavityStart)*.5*(1-Math.cos(Math.PI*i/119)),v=E.verticalOrdinates(profile,x,chord,g.te),outer=v.upper-v.lower,gap=outer-2*g.skin;if(!Number.isFinite(gap))throw Error('Non-finite cavity diagnostic');if(!worst||gap<worst.gap)worst={y,eta:y/g.semiSpan,chord,x,outer,gap};}}return worst;}
 function clears(g,E,ys){return scan(g,E,ys).gap>=GAP;}
 function diagnoseCavity(candidate,E){
  const g=E.makeGeometry(candidate),ys=sampleStations(g,E),worst=scan(g,E,ys);
  if(worst.gap>=GAP)return null;
  const maxSkin=(worst.outer-GAP)/2,suggestions=[];
  const thinner=Math.floor((maxSkin-1e-6)*10)/10;
  if(thinner>=MIN_SKIN&&thinner<g.skin&&clears({...g,skin:thinner},E,ys))suggestions.push({kind:'skin',value:thinner,text:`Try skin ${thinner.toFixed(1)} mm instead of ${g.skin.toFixed(2)} mm. This clears the sampled cavity check; re-check strength and print settings.`});
  else suggestions.push({kind:'advice',text:'Do not reduce the skin below the course printing minimum of 0.8 mm. Keep the skin and change the profile or enlarge the chords.'});
  let lo=1,hi=2;
  const scaled=f=>({...g,rootChord:g.rootChord*f,tipChord:g.tipChord*f});
  while(hi<8&&!clears(scaled(hi),E,ys))hi*=2;
  if(clears(scaled(hi),E,ys)){for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(clears(scaled(mid),E,ys))hi=mid;else lo=mid;}const factor=Math.ceil((hi+1e-6)*100)/100,root=Math.ceil(g.rootChord*factor*10-1e-9)/10,tip=Math.ceil(g.tipChord*factor*10-1e-9)/10;
   if(clears({...g,rootChord:root,tipChord:tip},E,ys))suggestions.push({kind:'chords',root,tip,text:`Keep skin ${g.skin.toFixed(2)} mm and try root/tip chords ${root.toFixed(1)} / ${tip.toFixed(1)} mm (same nominal taper). Re-check mass and the printer envelope.`});
  }
  suggestions.push({kind:'profile',text:`Alternatively, choose a profile with more thickness near x/c = ${worst.x.toFixed(3)}, especially around span fraction eta = ${worst.eta.toFixed(3)}. Maximum airfoil thickness alone does not guarantee an open aft cavity. Different airfoil families are allowed.`});
  const exact=(g.stations||[]).findIndex(s=>Math.abs(s.eta-worst.eta)<1e-8),p=E.airfoilAt(g,worst.y),profile=exact>=0?(g.stations[exact].airfoil.name||'NACA '+g.stations[exact].airfoil.code):p.name||(p.code?'NACA '+p.code:'Interpolated section');
  return {kind:'cavity',...worst,profile,section:exact>=0?exact+1:null,skin:g.skin,requiredGap:GAP,maxSkin,minSkin:MIN_SKIN,suggestions,
   summary:`Cavity too narrow at y = ${worst.y.toFixed(1)} mm (eta ${worst.eta.toFixed(3)}, chord ${worst.chord.toFixed(1)} mm), x/c = ${worst.x.toFixed(3)}: clear gap ${worst.gap.toFixed(2)} mm; this model requires at least ${GAP.toFixed(2)} mm. ${suggestions[0].text}`,
   scope:'Sampled geometry check only, not CAD validation, strength approval or a guarantee of printability. Apply geometry re-checks all model constraints. No committed wing inputs have been changed.'};
 }
 return {diagnoseCavity};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingGeometryHelp;

/* Whole-wing marquee selection only. The host owns deletion confirmation and study state. */
const WingSelectionUI=(()=>{
 function mount({canvas,viewport,button=null,getBounds,onDelete,setOrbitEnabled=()=>{},isActive=()=>true}){
  const doc=canvas.ownerDocument,win=doc.defaultView;
  if(!doc.getElementById('wing-selection-style')){const style=doc.createElement('style');style.id='wing-selection-style';style.textContent='.wing-marquee,.wing-whole-selection{position:absolute;pointer-events:none;z-index:55;box-sizing:border-box;border:2px solid #176bc4;background:#176bc41a}.wing-whole-selection{border:2px dashed #d97706;background:transparent}.wing-selection-status{position:absolute;left:8px;bottom:8px;max-width:calc(100% - 16px);z-index:56;pointer-events:none;padding:6px 9px;margin:0;border:1px solid var(--line,#b8c9dc);border-radius:7px;background:var(--panel,#fff);color:var(--fg,#172c40);font:13px/1.4 var(--font-ui,system-ui)}.wing-marquee[hidden],.wing-whole-selection[hidden],.wing-selection-status[hidden]{display:none}';doc.head.append(style);}
  if(win.getComputedStyle(viewport).position==='static')viewport.style.position='relative';
  const overlay=kind=>{const n=doc.createElement('div');n.className=kind;n.hidden=true;n.setAttribute('aria-hidden','true');viewport.append(n);return n;},marquee=overlay('wing-marquee'),outline=overlay('wing-whole-selection');
  const status=doc.createElement('p');status.className='wing-selection-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;viewport.append(status);
  const feedback=doc.createElement('span');feedback.className='wing-selection-feedback';feedback.hidden=true;
  const feedbackText=doc.createElement('span'),deleteButton=doc.createElement('button');deleteButton.type='button';deleteButton.className='btn';deleteButton.textContent='Delete selected';feedback.append(feedbackText,deleteButton);button?.after(feedback);
  let mode=false,selected=false,gesture=null,requestingDelete=false;const touches=new Set();
  const active=()=>!!isActive();
  function rect(value){if(!value)return null;const left=value.left??value.x,top=value.top??value.y,right=value.right??left+value.width,bottom=value.bottom??top+value.height;if(![left,top,right,bottom].every(Number.isFinite)||right<=left||bottom<=top)return null;return{left,top,right,bottom};}
  function bounds(){try{return rect(getBounds());}catch(_){return null;}}
  function paint(node,r){const p=viewport.getBoundingClientRect(),left=Math.max(p.left,r.left),top=Math.max(p.top,r.top),right=Math.min(p.right,r.right),bottom=Math.min(p.bottom,r.bottom);node.hidden=right<=left||bottom<=top;if(node.hidden)return;node.style.left=(left-p.left-(viewport.clientLeft||0)+viewport.scrollLeft)+'px';node.style.top=(top-p.top-(viewport.clientTop||0)+viewport.scrollTop)+'px';node.style.width=(right-left)+'px';node.style.height=(bottom-top)+'px';}
  function sync(){const b=selected?bounds():null;if(selected&&!b)selected=false;if(button){button.setAttribute('aria-pressed',String(mode));button.textContent=mode?'Deselect wing':'Select wing';}status.hidden=!mode&&!selected;status.textContent=selected?'Whole wing selected · Delete asks for confirmation · Esc cancels':mode?'Drag a rectangle around the whole wing · Esc exits selection':'';outline.hidden=!selected;if(selected)paint(outline,b);feedback.hidden=!mode;feedbackText.textContent=selected?'Wing selected':'Drag around wing';deleteButton.hidden=!selected;deleteButton.disabled=!selected;}
  function cancelGesture(){const old=gesture;gesture=null;marquee.hidden=true;if(old)try{if(canvas.hasPointerCapture?.(old.id))canvas.releasePointerCapture(old.id);}catch(_){}}
  function setMode(value){const next=!!value&&active();cancelGesture();touches.clear();selected=false;if(mode!==next){mode=next;setOrbitEnabled(!mode);}sync();}
  function clear(){setMode(false);}
  function intercept(e){e.preventDefault();e.stopImmediatePropagation();}
  function point(e){const c=canvas.getBoundingClientRect(),p=viewport.getBoundingClientRect();return{x:Math.max(Math.max(c.left,p.left),Math.min(e.clientX,Math.min(c.right,p.right))),y:Math.max(Math.max(c.top,p.top),Math.min(e.clientY,Math.min(c.bottom,p.bottom)))};}
  function rectangle(a,b){return{left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)};}
  function down(e){if(!mode||!active())return;if(e.pointerType==='touch'){intercept(e);touches.add(e.pointerId);if(e.isPrimary===false||touches.size>1){cancelGesture();selected=false;sync();return;}}else if(e.button!==0||e.isPrimary===false)return;else intercept(e);if(gesture)return;selected=false;sync();const start=point(e);gesture={id:e.pointerId,start,end:start};try{canvas.setPointerCapture?.(e.pointerId);}catch(_){}}
  function move(e){if(!gesture||e.pointerId!==gesture.id)return;intercept(e);if(!active()){clear();return;}gesture.end=point(e);if(Math.hypot(gesture.end.x-gesture.start.x,gesture.end.y-gesture.start.y)>=8)paint(marquee,rectangle(gesture.start,gesture.end));}
  function up(e){touches.delete(e.pointerId);if(!gesture||e.pointerId!==gesture.id)return;intercept(e);const g=gesture,end=point(e),r=rectangle(g.start,end),b=active()?bounds():null;cancelGesture();selected=!!b&&Math.hypot(end.x-g.start.x,end.y-g.start.y)>=8&&r.left<=b.left&&r.right>=b.right&&r.top<=b.top&&r.bottom>=b.bottom;sync();}
  function cancel(e){touches.delete(e.pointerId);if(!gesture||e.pointerId!==gesture.id)return;intercept(e);cancelGesture();}
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',cancel,true);
  canvas.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)cancelGesture();},true);
  // Pointer capture normally delivers these to canvas; outside-target fallback also works if capture is unavailable.
  for(const[name,handler]of[['pointermove',move],['pointerup',up],['pointercancel',cancel]])doc.addEventListener(name,e=>{if(!canvas.contains(e.target))handler(e);},true);
  function editing(target){return target?.closest?.('input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])');}
  function requestDelete(){if(!selected||!active()||requestingDelete)return;requestingDelete=true;try{const answer=onDelete();if(answer&&typeof answer.then==='function')Promise.resolve(answer).then(()=>{requestingDelete=false;},()=>{requestingDelete=false;});else requestingDelete=false;}catch(error){requestingDelete=false;throw error;}}
  doc.addEventListener('keydown',e=>{if(e.defaultPrevented||!active())return;if(e.key==='Escape'&&(mode||selected)){intercept(e);clear();return;}if(editing(e.target))return;if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='a'){intercept(e);setMode(true);selected=!!bounds();sync();return;}if(selected&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&['Delete','Backspace'].includes(e.key)){intercept(e);if(!e.repeat)requestDelete();}},true);
  button?.addEventListener('click',()=>{setMode(!mode);if(mode){selected=!!bounds();sync();}});
  deleteButton.addEventListener('click',requestDelete);
  for(const name of ['resize','scroll'])win.addEventListener(name,()=>{if((mode||selected)&&!active())clear();else if(selected)sync();},true);
  win.addEventListener('blur',()=>{cancelGesture();touches.clear();});
  sync();return{clear,setMode,isSelected:()=>selected};
 }
 return{mount};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingSelectionUI;

/* Exact closed-tip geometry: section-equilibrium nominal normal stress only.
 * No displacement solution, artificial tip section, or solid-FE field is used.
 * Coordinates are aircraft x aft, y span, z up; all sections remain y=constant.
 */
const WingClosedTipStress = (() => {
  'use strict';
  const GX=[-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
  const GW=[.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
  const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
  // Clamped Euler-Bernoulli transverse bending components. This accepts exact
  // curvature, not a fictitious regular tip section. The endpoint substitution
  // s=L-t^2 regularizes the finite delta/elliptic-load translation integral.
  function integrateBending({length:L,curvatureAt,breaks=[],tipTranslationFinite=true,tipSlopeFinite=true}){
    if(!(Number.isFinite(L)&&L>0)||typeof curvatureAt!=='function')throw Error('Bending integration needs a positive span and a curvature evaluator.');
    const stations=uniq([0,L,...breaks.filter(y=>y>0&&y<L)]),panelCache=new Map(),pointCache=new Map(),curvatureCache=new Map(),counters={curvatureEvaluations:0,quadratureEvaluations:0};
    const tolerance=2e-9;
    function curvature(y){if(!curvatureCache.has(y)){const k=Array.from(curvatureAt(y));if(k.length!==2||!k.every(Number.isFinite))throw Error(`Unresolved bending curvature at y=${y} mm.`);curvatureCache.set(y,k);counters.curvatureEvaluations++;}return curvatureCache.get(y);}
    function gauss(fn,a,b){const sum=[0,0,0,0];for(let i=0;i<8;i++){const q=fn((a+b)/2+(b-a)*GX[i]/2),w=GW[i]*(b-a)/2;counters.quadratureEvaluations++;for(let k=0;k<4;k++)sum[k]+=w*q[k];}return sum;}
    function adaptive(fn,a,b,depth=0){const full=gauss(fn,a,b),mid=(a+b)/2,left=gauss(fn,a,mid),right=gauss(fn,mid,b),fine=left.map((v,k)=>v+right[k]);if(fine.every((v,k)=>Math.abs(v-full[k])<=tolerance*Math.max(1,Math.abs(v))))return fine;if(depth>=20)throw Error('Pure-bending compliance quadrature did not converge; no regularized displacement is substituted.');const u=adaptive(fn,a,mid,depth+1),v=adaptive(fn,mid,b,depth+1);return u.map((x,k)=>x+v[k]);}
    function integral(a,b,target,slopes){
      if(!(b>a))return [0,0,0,0];
      const lo=Math.sqrt(Math.max(0,L-b)),hi=Math.sqrt(Math.max(0,L-a));
      return adaptive(t=>{const distance=t*t,y=L-distance;if(y===L)throw Error('The improper bending integral exceeded floating-point station resolution; no physical tip-chord floor is introduced.');const k=curvature(y),weight=2*t,arm=(target-L)+distance;return [slopes?weight*k[0]:0,slopes?weight*k[1]:0,weight*arm*k[0],weight*arm*k[1]];},lo,hi);
    }
    function at(y){
      if(!Number.isFinite(y)||y<0||y>L)throw Error('Bending displacement station must lie on the actual span.');
      if(pointCache.has(y))return pointCache.get(y);
      const endpoint=y===L;
      if(endpoint&&!tipTranslationFinite){const out={y,verticalMm:NaN,chordwiseMm:NaN,slopeVertical:NaN,slopeChordwise:NaN,resolved:false,translationFinite:false,slopeFinite:false,componentOnly:true,torsionIncluded:false,reason:'The exact delta-tip bending translation is unbounded for a nonzero endpoint line load; no artificial finite tip section is substituted.'};pointCache.set(y,out);return out;}
      const sum=[0,0,0,0],slopes=!endpoint||tipSlopeFinite;
      for(let i=1;i<stations.length;i++){
        const a=stations[i-1],b=stations[i];if(a>=y)break;let v;
        if(b<=y&&b<L){let p=panelCache.get(i);if(!p){p=integral(a,b,b,true);panelCache.set(i,p);}v=[p[0],p[1],p[2]+(y-b)*p[0],p[3]+(y-b)*p[1]];}
        else v=integral(a,Math.min(b,y),y,slopes);
        for(let k=0;k<4;k++)sum[k]+=v[k];
      }
      const out={y,verticalMm:sum[3],chordwiseMm:sum[2],slopeVertical:slopes?sum[1]:NaN,slopeChordwise:slopes?sum[0]:NaN,resolved:true,translationFinite:true,slopeFinite:slopes,componentOnly:true,torsionIncluded:false,reason:endpoint&&tipSlopeFinite===null?'Exact-tip slope existence is undetermined at floating-point cancellation; it is withheld. No finite limit or divergence is asserted.':endpoint&&!slopes?'The improper pure-bending translation is finite, but the exact tip slope is unbounded. Small-rotation beam kinematics are not valid arbitrarily close to this apex.':'Clamped nominal Euler-Bernoulli transverse bending components only; torsional displacement and physical cross-section orientation are not computed.'};pointCache.set(y,out);return out;
    }
    return {at,counters,quadratureRelativeTolerance:tolerance,method:'Direct compliance kernel with exact-span square-root endpoint substitution',tipTranslationFinite,tipSlopeFinite};
  }
  function solve(input,tools){
    const {normalize,polyIntegrals,prescribedFlightLoads,customLine,customFraction,Geometry,GRAV=9.80665}=tools,E=tools.E;
    const normalized=normalize(input),{g,pla,rod,asm,load:source,crit}=normalized,L=g.semiSpan,chord=tools.chordAt||((g,y)=>Geometry.chordAt(g,y));
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    // AeroStruct normally validates this record in normalize(). The shared
    // Wing Lab engine has no aerodynamic adapter, so validate it here too.
    const aero=normalized.aero||input.aeroLoad||null;
    if(aero){
      if(aero.kind!=='aeroStrips'||!Number.isFinite(aero.lineFraction)||aero.lineFraction<0||aero.lineFraction>1||!Array.isArray(aero.strips)||!aero.strips.length)throw Error('Closed-tip aerodynamic loading needs a finite six-component strip record.');
      for(const[r,s]of aero.strips.map((r,i)=>[r,i]))if(!Array.isArray(r)||r.length!==8||!r.every(Number.isFinite)||r[0]<0||!(r[1]>r[0])||r[1]>L||s&&r[0]<aero.strips[s-1][1])throw Error('Closed-tip aerodynamic strips must be ordered finite [y0,y1,Fx,Fy,Fz,Mx,My,Mz] records on the actual span.');
    }
    if(g.tipChord!==0||!['elliptic','delta'].includes(g.planform))throw Error('Closed-tip normal stress requires an exact elliptic or delta zero-chord tip.');
    const zero=v=>Math.abs(v||0)<=1e-12;
    if(!zero(g.sweepDeg)||!zero(g.dihedralDeg)||!zero(Geometry.stationAt(g,0).incidenceDeg)||!zero(Geometry.stationAt(g,L).incidenceDeg)||(g.stations||[]).some(s=>!zero(s.incidenceDeg)))throw Error('Closed-tip normal stress currently requires zero user sweep, dihedral and incidence at every station.');
    if(g.rodFractions.length)throw Error('Closed-tip normal stress does not support external rods.');
    for(const [i,s]of g.spars.entries()){
      if(!['E','nu','rho','ft','fc','fs'].every(k=>Math.abs(s.material[k]-pla[k])<=1e-10*Math.max(1,Math.abs(pla[k]))))throw Error(`Closed-tip spar ${i+1} must use the same material properties as the printed shell; mixed-material union mechanics are not admitted.`);
      if(!(s.length<L))throw Error(`Closed-tip spar ${i+1} must stop at a finite hollow section inboard of the zero-area tip.`);
    }
    if(g.spars.length&&typeof E.sparParts!=='function')throw Error('Closed-tip spar geometry helper is unavailable.');
    const ribs=E.ribStations(g),seams=E.seams(g),cavityEnd=E.cavityTipLimit(g);
    if(seams.length&&!asm.seamsBonded)throw Error('Closed-tip normal stress requires bonded seams or a one-piece wing.');
    if(source.tipMass)throw Error('A mass attached at a zero-area apex needs a resolved attachment model. Move it to a finite section.');
    // Aero replaces the default flight/tip case, while explicitly registered
    // custom forces remain additive, as in the spatial-beam adapter.
    let base=aero?(source.kind==='custom'?source.items:[]):source.kind==='flight'?prescribedFlightLoads(source,g):source.kind==='tip'?[{kind:'point',position:L,force:source.tipForce,fraction:source.tipFraction}]:source.items;
    const planformArea=(g.planform==='elliptic'?Math.PI/4:.5)*L*g.rootChord;
    // Existing flight tables are arrow-display records only. Structural integration
    // retains the exact chord law, including the elliptic endpoint square root.
    if(source.kind==='flight'&&source.distribution==='planform')base=base.map(p=>({...p,actualChordLaw:true,total:source.aircraftMass*source.loadFactor*GRAV/2}));
    if(base.some(p=>p.kind==='point'&&p.position>=L&&p.force!==0))throw Error('A point force at the zero-area apex is not admitted. Apply the load at a finite section or use a distributed load.');
    for(const[i,s]of g.spars.entries())if(s.widthMode!=='auto'&&!(s.length<cavityEnd-g.cap))throw Error(`Closed-tip fixed-width spar ${i+1} must stop inboard of the solid tip-cap region.`);
    const teChord=12*g.skin,teTransition=teChord<g.rootChord?L*(g.planform==='delta'?1-teChord/g.rootChord:Math.sqrt(1-(teChord/g.rootChord)**2)):0;
    const widthBreaks=g.spars.flatMap(s=>typeof tools.sparWidthBreaks==='function'?tools.sparWidthBreaks(g,s):typeof E.sparWidthBreaks==='function'?E.sparWidthBreaks(g,s):[]);
    const boundaries=uniq([0,L,cavityEnd,teTransition,Math.max(0,cavityEnd-g.cap),Math.min(L,g.cap),...g.spars.map(s=>s.length),...widthBreaks,...(g.stations||[]).map(s=>s.eta*L),...ribs.flatMap(y=>[Math.max(0,y-g.ribThickness/2),Math.min(L,y+g.ribThickness/2)]),...(aero?aero.strips.flatMap(r=>r.slice(0,2)):[])]);
    const sectionCache=new Map(),performanceCounters={sectionGeometryEvaluations:0,sectionTensorEvaluations:0,quadraturePointEvaluations:0,fullPanelCacheHits:0,fullPanelIntegrations:0};
    function section(y,requireTensor=false){
      if(!(y>=0&&y<L))return null;
      if(sectionCache.has(y)){const out=sectionCache.get(y);if(!requireTensor||out.tensorReady)return out;sectionCache.delete(y);}
      performanceCounters.sectionGeometryEvaluations++;
      // Only the cavity boundary is needed; omit ringLoops' torsion-mesh
      // outer-arc resampling. Intermediate straight wall nodes add no area or
      // moments, so this is the identical 120-station polygon integral.
      let inner=[];
      if(y<cavityEnd){
        if(typeof E.verticalOrdinates!=='function')inner=E.ringLoops(g,y).inner;
        else{const lower=[],upper=[],c=chord(g,y),profile=Geometry.airfoilAt(g,y);for(let i=0;i<120;i++){const u=g.cavityStart+(g.cavityEnd-g.cavityStart)*.5*(1-Math.cos(Math.PI*i/119)),x=u*c,v=E.verticalOrdinates(profile,x/c,c,g.te);if(v.upper-v.lower-2*g.skin<.8)throw Error('The material cavity is collapsed; no stress result is returned.');lower.push([x,v.lower+g.skin]);upper.push([x,v.upper-g.skin]);}inner=lower.concat(upper.reverse());}
      }
      const outer=E.outerContour(g,y,241),oi=polyIntegrals(outer),ii=polyIntegrals(inner);
      const cap=y<g.cap||y>=cavityEnd-g.cap,rib=ribs.some(q=>Math.abs(y-q)<=g.ribThickness/2),filled=cap||rib;
      const sparParts=filled?[]:E.sparParts?.(g,y)||[],sparPolygons=sparParts.flatMap(p=>p.polygons),sparIntegrals=sparPolygons.map(polyIntegrals);
      const p=oi.map((v,k)=>v-(filled?0:ii[k])+sparIntegrals.reduce((a,s)=>a+s[k],0)),A=p[0];
      if(!(A>0&&Number.isFinite(A)))throw Error(`Invalid positive-area material section at y=${y} mm.`);
      const xc=p[2]/A,zc=p[1]/A,scale=chord(g,y);
      const shellA=oi[0]-ii[0],sparA=sparIntegrals.reduce((a,p)=>a+p[0],0),extra=A-shellA-sparA;
      const out={y,A,xc,zc,scale,filled,cap,rib,shellA,sparA,capA:cap?extra:0,ribA:!cap&&rib?extra:0,tensorReady:false};
      // Mass/gravity quadrature requires area and first moments, not stiffness.
      // Recover the identical centered tensor lazily only at actual stress cuts.
      if(requireTensor){
        performanceCounters.sectionTensorEvaluations++;
        const centered=polygon=>polyIntegrals(polygon.map(q=>[(q[0]-xc)/scale,(q[1]-zc)/scale]));
        const po=centered(outer),pi=filled?[0,0,0,0,0,0]:centered(inner),sp=sparPolygons.map(centered),h=po.map((v,k)=>v-pi[k]+sp.reduce((a,s)=>a+s[k],0));
        const Izz=h[3],Ixx=h[4],Ixz=h[5],det=Ixx*Izz-Ixz*Ixz,trace=Ixx+Izz;
        if(!(scale>0&&Ixx>0&&Izz>0&&det>1e-12*trace*trace))throw Error(`The centered section tensor is singular or ill conditioned at y=${y} mm; no regularized stress is returned.`);
        Object.assign(out,{Ixx,Izz,Ixz,det,outer,sparParts,tensorReady:true});
      }
      sectionCache.set(y,out);return out;
    }
    function gauss(fn,a,b){const v=[];for(let i=0;i<8;i++){performanceCounters.quadraturePointEvaluations++;const q=fn((a+b)/2+(b-a)*GX[i]/2),w=GW[i]*(b-a)/2;for(let k=0;k<q.length;k++)v[k]=(v[k]||0)+w*q[k];}return v;}
    function integrate(fn,a,b,depth=0){
      if(!(b>a))return [0,0,0];
      const full=gauss(fn,a,b),mid=(a+b)/2,left=gauss(fn,a,mid),right=gauss(fn,mid,b),fine=left.map((v,k)=>v+right[k]);
      const okay=fine.every((v,k)=>Math.abs(v-full[k])<=2e-9*Math.max(1,Math.abs(v)));
      if(okay)return fine;
      if(depth>=16)throw Error('Closed-tip load/mass quadrature did not converge; no unverified stress is returned.');
      const u=integrate(fn,a,mid,depth+1),v=integrate(fn,mid,b,depth+1);return u.map((x,k)=>x+v[k]);
    }
    function splitIntegral(fn,a,b,breaks=boundaries){let out=null;const cuts=uniq([a,b,...breaks.filter(q=>q>a&&q<b)]);for(let i=1;i<cuts.length;i++){const v=integrate(fn,cuts[i-1],cuts[i]);if(!out)out=v;else out=out.map((x,k)=>x+v[k]);}return out||[0,0,0];}
    // With a fixed airfoil profile and no active cavity spars, every polygon vertex is
    // affine in chord on each trailing-edge branch. Area is quadratic and
    // first moments cubic in chord. Evaluate those exact polynomial identities
    // instead of rebuilding thousands of identical-topology gravity polygons.
    // Varying profiles and active cavity spars retain general polygon quadrature.
    const massModels=[],polynomialNodes=[-.75,-.25,.25,.75];
    const moments=s=>[s.A,s.A*s.xc,s.A*s.zc,s.shellA,s.ribA,s.capA,s.sparA];
    const yFromChord=c=>L*(g.planform==='delta'?1-c/g.rootChord:Math.sqrt(Math.max(0,1-(c/g.rootChord)**2)));
    function polynomialValue(model,c){const t=(c-model.center)/model.half,out=new Array(7).fill(0);for(let i=0;i<4;i++){let w=1;for(let j=0;j<4;j++)if(i!==j)w*=(t-polynomialNodes[j])/(polynomialNodes[i]-polynomialNodes[j]);for(let k=0;k<7;k++)out[k]+=w*model.values[i][k];}return out;}
    const fixedProfile=!g.stations||g.stations.every(s=>JSON.stringify(s.airfoil)===JSON.stringify(g.stations[0].airfoil));
    if(!tools.disableMassPolynomial&&fixedProfile){
      for(let i=1;i<boundaries.length;i++){
        const a=boundaries[i-1],b=boundaries[i],ca=chord(g,a),cb=chord(g,b),model={a,b,center:(ca+cb)/2,half:(ca-cb)/2};
        if(!(model.half>0))continue;
        if(g.spars.some(s=>s.length>=(a+b)/2)&&!section((a+b)/2).filled)continue;
        if(a>=cavityEnd&&ca<=teChord*(1+1e-12)){const q=(a+b)/2;model.homothetic=moments(section(q));model.chord=chord(g,q);massModels.push(model);continue;}
        if(cb===0)continue;
        model.values=polynomialNodes.map(t=>moments(section(yFromChord(model.center+model.half*t))));
        let exact=true;
        for(const t of[-.95,-.6,-.1,.1,.6,.95]){const c=model.center+model.half*t,p=polynomialValue(model,c),actual=moments(section(yFromChord(c)));if(!p.every((v,k)=>Math.abs(v-actual[k])<=2e-12*Math.max(1,Math.abs(actual[k])))){exact=false;break;}}
        if(exact)massModels.push(model);
      }
    }
    performanceCounters.exactMassPolynomialPanels=massModels.length;
    performanceCounters.exactMassPolynomialEvaluations=0;
    function massSection(y){
      const model=massModels.find(m=>y>m.a&&y<m.b);if(!model)return section(y);
      performanceCounters.exactMassPolynomialEvaluations++;
      const c=chord(g,y),ratio=model.homothetic?c/model.chord:1,p=model.homothetic?model.homothetic.map((v,k)=>v*ratio**(k===1||k===2?3:2)):polynomialValue(model,c);
      if(!(p[0]>0))return section(y);
      return {A:p[0],xc:p[1]/p[0],zc:p[2]/p[0],shellA:p[3],ribA:p[4],capA:p[5],sparA:p[6]};
    }
    const rho=pla.rho/1000,massParts=splitIntegral(y=>{const s=massSection(y);return [s.shellA,s.ribA,s.capA,s.sparA].map(a=>rho*a);},0,L);
    const mass={shell:massParts[0],ribs:massParts[1],caps:massParts[2],spars:massParts[3],rods:0,tip:0};mass.printed=mass.total=mass.shell+mass.ribs+mass.caps+mass.spars;
    const position=(p,y)=>Geometry.transformPoint(g,y,p.localPoint||[customFraction(p,y)*chord(g,y),0]);
    const loadBreaks=p=>p.kind==='table'?p.points.map(q=>q[0]):p.kind==='schrenk'?[0,L]:[p.start,p.end];
    const line=(p,y)=>p.actualChordLaw?p.total*chord(g,y)/planformArea:p.kind==='schrenk'?.5*p.total*(chord(g,y)/planformArea+4/(Math.PI*L)*Math.sqrt(Math.max(0,1-(y/L)**2))):p.kind==='distributed'?(y<p.start||y>p.end?0:p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start)):customLine(p,g,y);
    const loadPanelCaches=new Map(),gravityPanelCache=new Map();
    // Conservative geometric projection: force density follows the actual
    // chord (surface area per span) and the residual free-couple density follows
    // chord squared (area times chordwise arm). The integral force and all three
    // first moments match each source strip exactly. For a zero-chord tip this
    // avoids the nonphysical constant end force/couple of a uniform line strip.
    // It is a sub-strip reconstruction, not recovery of the original Cp field.
    const aeroItems=(aero?.strips||[]).map((r,index)=>{
      const [start,end]=r,h=end-start,norms=splitIntegral(y=>{const c=chord(g,y);return [c,c*c,0];},start,end),f=r.slice(2,5).map(v=>v/norms[0]);
      const R=splitIntegral(y=>Geometry.transformPoint(g,y,[aero.lineFraction*chord(g,y),0]).map(v=>v*chord(g,y)),start,end);
      const arm=cross(R,f),m=r.slice(5,8).map((v,k)=>(v-arm[k])/norms[1]);
      return {kind:'aeroStrip',index,start,end,f,m,fraction:aero.lineFraction,last:index===aero.strips.length-1,force:r.slice(2,5),moment:r.slice(5,8),geometricTaper:true,norms};
    });
    function aeroWrench(y,reference=[0,0,0]){
      const force=[0,0,0],moment=[0,0,0];
      for(const p of aeroItems){
        const a=Math.max(y,p.start),b=p.end;if(!(b>a))continue;
        const weights=a===p.start?p.norms:splitIntegral(q=>{const c=chord(g,q);return [c,c*c,0];},a,b),F=p.f.map(v=>v*weights[0]);
        let M;
        if(a===p.start){const shift=cross(reference,F);M=p.moment.map((v,k)=>v-shift[k]);}
        else M=splitIntegral(q=>{const c=chord(g,q),P=Geometry.transformPoint(g,q,[p.fraction*c,0]),arm=cross(P.map((v,k)=>v-reference[k]),p.f);return arm.map((v,k)=>v*c+p.m[k]*c*c);},a,b);
        for(let k=0;k<3;k++){force[k]+=F[k];moment[k]+=M[k];}
      }
      return {force,moment};
    }
    function outboardIntegral(density,a,b,y,referenceX,breaks,cache){
      const edges=uniq([a,b,...breaks.filter(q=>q>a&&q<b)]),sum=[0,0,0];
      for(let i=1;i<edges.length;i++){
        const lo=edges[i-1],hi=edges[i];let value;
        if(lo===y){
          // Keep direct local arms on the cut-containing panel: subtraction
          // of two whole-wing moments would lose the tiny apex resultants.
          value=integrate(q=>{const[f,x]=density(q);return [f,(q-y)*f,(x-referenceX)*f];},lo,hi);
        }else{
          const key=lo+':'+hi;let v=cache.get(key);
          if(v)performanceCounters.fullPanelCacheHits++;
          else{performanceCounters.fullPanelIntegrations++;v=integrate(q=>{const[f,x]=density(q);return [f,(q-lo)*f,x*f];},lo,hi);cache.set(key,v);}
          value=[v[0],v[1]+(lo-y)*v[0],v[2]-referenceX*v[0]];
        }
        for(let k=0;k<3;k++)sum[k]+=value[k];
      }
      return sum;
    }
    function sourceWrench(y,referenceX=0){
      let V=0,Mx=0,minusMy=0;
      for(const p of base){
        if(p.kind==='point'){if(p.position>=y){const P=position(p,p.position);V+=p.force;Mx+=(p.position-y)*p.force;minusMy+=(P[0]-referenceX)*p.force;}continue;}
        const bs=loadBreaks(p),a=Math.max(y,bs[0]),b=bs.at(-1);if(!(b>a))continue;
        if(!loadPanelCaches.has(p))loadPanelCaches.set(p,new Map());
        const v=outboardIntegral(q=>[line(p,q),position(p,q)[0]],a,b,y,referenceX,uniq([...boundaries,...bs]),loadPanelCaches.get(p));V+=v[0];Mx+=v[1];minusMy+=v[2];
      }
      if(source.selfWeight){const v=outboardIntegral(q=>{const s=massSection(q);return [-rho*s.A*GRAV/1000,Geometry.transformPoint(g,q,[s.xc,s.zc])[0]];},y,L,y,referenceX,boundaries,gravityPanelCache);V+=v[0];Mx+=v[1];minusMy+=v[2];}
      return {V,Mx,minusMy};
    }
    const cuts=new Map();let maxRecoveryResidual=0;
    function cutAt(y){
      if(!Number.isFinite(y)||y<0||y>L)throw Error('Stress station must lie within the physical span.');
      if(cuts.has(y))return cuts.get(y);
      if(y===L){const out={y,nominal:true,resolved:false,endZone:'tip',reason:'Zero-area apex: stress is undefined; no finite tip section is substituted.',force:[0,0,0],moment:[0,0,0],localForce:[0,0,0],localMoment:[0,0,0]};cuts.set(y,out);return out;}
      const s=section(y,true),reference=Geometry.transformPoint(g,y,[s.xc,s.zc]),w=sourceWrench(y,reference[0]),aw=aeroWrench(y,reference);
      const force=aw.force.map((v,k)=>v+(k===2?w.V:0)),moment=aw.moment.map((v,k)=>v+(k===0?w.Mx:k===1?-w.minusMy:0));
      // sigma_yy = N/A + b (x-xc)/c + c (z-zc)/c.
      // Across an aircraft-y cut: integral x*sigma dA=Mz,
      // integral z*sigma dA=-Mx. My is retained, not recovered as stress.
      const targetX=moment[2]/s.scale**3,target=-moment[0]/s.scale**3;
      const b=(targetX*s.Izz-target*s.Ixz)/s.det,c=(target*s.Ixx-targetX*s.Ixz)/s.det;
      const recoveredX=(b*s.Ixx+c*s.Ixz)*s.scale**3,recoveredZ=(b*s.Ixz+c*s.Izz)*s.scale**3;
      const residual=Math.max(Math.abs(recoveredX-moment[2]),Math.abs(recoveredZ+moment[0]))/Math.max(1,Math.hypot(moment[0],moment[2]));maxRecoveryResidual=Math.max(maxRecoveryResidual,residual);
      if(!(residual<1e-8))throw Error('Recovered normal stress failed section moment equilibrium.');
      const out={...s,y,reference,force,moment,localForce:[force[1],force[0],-force[2]],localMoment:[moment[1],moment[0],-moment[2]],coefficient0:force[1]/s.A,coefficientX:b,coefficientZ:c,nominal:true,resolved:true,endZone:null,recoveryResidual:residual};cuts.set(y,out);return out;
    }
    function evaluateStress(y,point,material=pla){
      const cut=cutAt(y);if(!cut.resolved)return {value:NaN,resolved:false,nominal:true,station:y,endZone:'tip',reason:cut.reason};
      const modulus=typeof material==='number'?material:material.E;
      if(!Number.isFinite(modulus)||Math.abs(modulus-pla.E)>1e-8*pla.E)throw Error('This stress-only model contains only the selected homogeneous skin/rib material.');
      const value=cut.coefficient0+cut.coefficientX*(point[0]-cut.xc)/cut.scale+cut.coefficientZ*(point[1]-cut.zc)/cut.scale;
      return {value,resolved:true,nominal:true,station:y,endZone:null,reason:'Section-equilibrium nominal spanwise normal stress; local taper, rib, bond and tip concentrations are unresolved.'};
    }
    const tipStations=Array.from({length:7},(_,k)=>L*(1-10**(-k-1))),gridCount=Math.min(1001,Math.max(21,input.nGrid||5*(input.nElements||40)+1));
    const yy=uniq([...Array.from({length:gridCount},(_,i)=>L*i/(gridCount-1)),...boundaries,...base.flatMap(p=>p.kind==='point'?[p.position]:loadBreaks(p)),...tipStations]);
    const y=Float64Array.from(yy),recovered=yy.map(cutAt),tension=[],compression=[],sparStress=[];
    recovered.forEach(c=>{if(!c.resolved){tension.push(NaN);compression.push(NaN);return;}const values=c.outer.map(p=>evaluateStress(c.y,p).value);tension.push(Math.max(0,...values));compression.push(Math.max(0,...values.map(v=>-v)));for(const part of c.sparParts)part.polygons.forEach((polygon,k)=>{const v=polygon.map(p=>evaluateStress(c.y,p).value);sparStress.push({y:c.y,index:part.index,kind:['top cap','bottom cap','web'][k],material:part.s.material,tension:Math.max(0,...v),compression:Math.max(0,...v.map(x=>-x)),shear:null});});});
    const tipSamples=tipStations.map(q=>{const i=yy.indexOf(q);return {y:q,distanceToTip:L-q,chord:chord(g,q),tension:tension[i],compression:compression[i]};});
    const qtip=base.filter(p=>p.kind!=='point').reduce((v,p)=>v+line(p,L),0),qscale=Math.max(1,...base.filter(p=>p.kind!=='point').map(p=>Math.abs(line(p,L*(1-1e-6)))));
    const sqrtCoefficient=base.reduce((v,p)=>v+(p.kind==='schrenk'?.5*p.total*4/(Math.PI*L)*Math.sqrt(2/L):p.kind==='elliptic'&&p.end===L&&p.shape!=='end'?p.peak*(p.shape==='middle'?2:Math.sqrt(2))/Math.sqrt(p.end-p.start):0),0);
    const uniformDivergence=g.planform==='delta'&&Math.abs(qtip)>1e-10*qscale,sqrtDivergence=g.planform==='delta'&&!uniformDivergence&&Math.abs(sqrtCoefficient)>1e-10*qscale/Math.sqrt(L),divergent=uniformDivergence||sqrtDivergence;
    const tipBehavior={endpoint:'undefined-zero-area',status:divergent?'divergent':g.planform==='elliptic'?'vanishing-for-bounded-line-load':'limit-unclassified',samples:tipSamples,tipLineLoadNPerMm:qtip,reason:uniformDivergence?'Delta solid-tip nominal bending stress diverges as 1/(L-y) for nonzero bounded endpoint line load.':sqrtDivergence?'A noncancelling elliptic endpoint component gives unbounded nominal delta-tip bending stress; near-cancelling endpoint loads require a separate asymptotic assessment.':g.planform==='elliptic'?'For bounded line loads and no apex point force, the homothetic solid elliptic-tip nominal bending stress tends to zero; the apex itself has no stress value.':'A zero endpoint line load does not by itself determine the delta-tip limit. The displayed finite samples are not a global maximum.',globalMaximumCertified:false};
    // Display gravity as quadrature points; stress integration above remains continuous.
    const gravity=[];
    function gravityMarkers(a,b,depth=0){
      const density=q=>{const s=massSection(q),P=Geometry.transformPoint(g,q,[s.xc,s.zc]),m=rho*s.A;return [m,m*q,m*P[0]];};
      const mid=(a+b)/2,full=gauss(density,a,b),left=gauss(density,a,mid),right=gauss(density,mid,b),fine=left.map((v,k)=>v+right[k]);
      if(!fine.every((v,k)=>Math.abs(v-full[k])<=2e-9*Math.max(1,Math.abs(v)))){if(depth>=16)throw Error('Self-weight display quadrature did not converge.');gravityMarkers(a,mid,depth+1);gravityMarkers(mid,b,depth+1);return;}
      for(const[lo,hi]of[[a,mid],[mid,b]])for(let j=0;j<8;j++){const q=(lo+hi)/2+(hi-lo)*GX[j]/2,s=massSection(q),m=rho*s.A*GW[j]*(hi-lo)/2;gravity.push({kind:'point',position:q,force:-m*GRAV/1000,fraction:s.xc/chord(g,q),localPoint:[s.xc,s.zc],gravity:true,quadratureDisplay:true});}
    }
    if(source.selfWeight)for(let k=1;k<boundaries.length;k++)gravityMarkers(boundaries[k-1],boundaries[k]);
    const root=cutAt(0),applied=sourceWrench(0),displayWeight=-gravity.reduce((a,p)=>a+p.force,0),actualWeight=source.selfWeight?mass.total*GRAV/1000:0;
    const load={...source,kind:'custom',items:[...base,...gravity],sourceLoad:source,gravitySummary:source.selfWeight?{weightN:actualWeight,appliedN:root.force[2]+actualWeight,netN:root.force[2],quadrature:'Continuous adaptive 8-point Gauss integration split at CAD cap/rib/cavity transitions; display points are quadrature markers'}:undefined};
    const limitations=['Section-equilibrium nominal spanwise normal stress and Euler-Bernoulli pure-bending translation components on actual aircraft-y material polygons; no torsional or full-motion solution','Zero user sweep, dihedral and incidence only; delta planform leading-edge sweep is retained geometrically','Locally prismatic Navier stress is a beam approximation; finite taper and rib/cap transitions do not resolve 3-D concentrations','Actual CAD skin/rib/cap and integral same-material spar union is included without double counting filled sections; effective homogeneous isotropic properties','Spars have finite admitted runouts; abrupt termination stress concentrations and load transfer are unresolved','Automatic cap widths taper with actual chord down to the admitted width floor, while cap/web thicknesses remain fixed. A same-material spar inside an already solid tip is embedded material, not an additional separate I-section or extra stiffness.','Shear, torsional shear, warping, local buckling, bond/joint stresses, dynamics and overall safety certification are unavailable','The exact zero-area apex has undefined stress; finite samples are not a certified global maximum'];
    const aeroRoot=aeroWrench(0,root.reference),allForce=aeroRoot.force.map((v,k)=>v+(k===2?applied.V:0)),allMoment=aeroRoot.moment.map((v,k)=>v+(k===0?applied.Mx:k===1?-sourceWrench(0,root.reference[0]).minusMy:0));
    const verification={method:'Six-component outboard wrench integration and polygon normal-moment recovery',normalStressEquilibriumRelativeResidual:maxRecoveryResidual,forceBalanceResidual:Math.max(...root.force.map((v,k)=>Math.abs(v-allForce[k]))),momentBalanceResidual:Math.max(...root.moment.map((v,k)=>Math.abs(v-allMoment[k]))),selfWeightN:actualWeight,displayQuadratureWeightN:displayWeight,displayQuadratureRelativeError:Math.abs(displayWeight-actualWeight)/Math.max(1,actualWeight),adaptiveQuadratureRelativeTolerance:2e-9,passed:maxRecoveryResidual<1e-8};
    // Only the first three exact endpoint terms matter for delta-tip existence:
    // q(L-d)=a0+aHalf*sqrt(d)+a1*d+O(d^1.5). Sum before classifying so opposing
    // prescribed loads cancel algebraically; never discard a nonzero term by a
    // numerical magnitude threshold. Homogeneous solid-tip gravity is O(d^2).
    const tail={constant:0,squareRoot:0,linear:0};
    for(const p of base){
      if(p.kind==='point')continue;
      if(p.actualChordLaw){if(g.planform==='delta')tail.linear+=p.total*g.rootChord/(planformArea*L);else tail.squareRoot+=p.total*g.rootChord/planformArea*Math.sqrt(2/L);continue;}
      if(p.kind==='schrenk'){tail.squareRoot+=.5*p.total*4/(Math.PI*L)*Math.sqrt(2/L);if(g.planform==='delta')tail.linear+=.5*p.total*g.rootChord/(planformArea*L);else tail.squareRoot+=.5*p.total*g.rootChord/planformArea*Math.sqrt(2/L);continue;}
      const bs=loadBreaks(p);if(bs.at(-1)!==L)continue;
      if(p.kind==='distributed'){tail.constant+=p.qEnd;tail.linear+=(p.qStart-p.qEnd)/(p.end-p.start);}
      else if(p.kind==='table'){const a=p.points.at(-2),b=p.points.at(-1);tail.constant+=b[1];tail.linear+=(a[1]-b[1])/(b[0]-a[0]);}
      else if(p.kind==='elliptic'){if(p.shape==='end')tail.constant+=p.peak;else tail.squareRoot+=p.peak*(p.shape==='middle'?2:Math.sqrt(2))/Math.sqrt(p.end-p.start);}
      else if(p.kind==='parabolic'){if(p.shape==='end')tail.constant+=p.peak;else tail.linear+=p.peak*(p.shape==='middle'?4:2)/(p.end-p.start);}
    }
    const endAero=aeroItems.find(p=>p.end===L),leadingBending={Mx:[tail.linear/6],Mz:[]};
    if(endAero&&g.planform==='delta'){
      const k=g.rootChord/L,{f,m}=endAero;
      // c=k*d at d=L-y. Sum the d^3 cut-moment coefficients BEFORE
      // classifying the 1/d curvature. A force and restoring couple can
      // cancel this leading term; nonzero components alone prove nothing.
      leadingBending.Mx.push(f[2]*k/6,m[0]*k*k/3);
      leadingBending.Mz.push(-f[0]*k/6,m[2]*k*k/3);
      if(f[1]!==0){
        // The exact limiting solid-tip polygon, at unit chord. This does not
        // give the physical apex an area, stiffness, or chord floor.
        const tipPolygon=E.outerContour({...g,planform:'linear',semiSpan:1,rootChord:1,tipChord:1,stations:null,airfoil:Geometry.airfoilAt(g,L),te:g.te/(12*g.skin)},0,241),p=polyIntegrals(tipPolygon),xc=p[2]/p[0],zc=p[1]/p[0];
        leadingBending.Mx.push(f[1]*k*k*zc/2);
        leadingBending.Mz.push(f[1]*k*k*((1-xc)/2-(1-aero.lineFraction)/3));
      }
    }
    const summedLeading=Object.fromEntries(Object.entries(leadingBending).map(([axis,terms])=>{const value=terms.reduce((a,b)=>a+b,0),roundoff=64*Number.EPSILON*terms.reduce((a,b)=>a+Math.abs(b),0);return [axis,{value,roundoff,classification:value===0?'zero':Math.abs(value)<=roundoff?'undetermined':'nonzero'}];}));
    const nonzeroLeading=Object.values(summedLeading).some(t=>t.classification==='nonzero'),uncertainLeading=Object.values(summedLeading).some(t=>t.classification==='undetermined');
    // q_F=O(chord), q_M=O(chord^2) gives finite formal tip translation.
    // Delta curvature is logarithmic only when its SUMMED leading term is nonzero.
    const tipTranslationFinite=g.planform==='elliptic'||tail.constant===0,tipSlopeFinite=g.planform==='elliptic'?true:tail.constant!==0||tail.squareRoot!==0||nonzeroLeading?false:uncertainLeading?null:true;
    const slopeUnknown=tipSlopeFinite===null;
    const bending=integrateBending({length:L,breaks:uniq([...boundaries,...base.flatMap(p=>p.kind==='point'?[p.position]:loadBreaks(p))]),curvatureAt:q=>{const c=cutAt(q);return [-c.coefficientX/(pla.E*c.scale),-c.coefficientZ/(pla.E*c.scale)];},tipTranslationFinite,tipSlopeFinite});
    let bendingTip=null;
    Object.defineProperty(bending,'tip',{enumerable:true,get:()=>bendingTip||(bendingTip={...bending.at(L),classification:!tipTranslationFinite?'unbounded-translation-and-slope':slopeUnknown?'finite-translation-undetermined-slope':!tipSlopeFinite?'finite-translation-unbounded-slope':'finite-translation-and-slope',translationStatus:tipTranslationFinite?'finite':'unbounded',slopeStatus:slopeUnknown?'undetermined-leading-cancellation':tipSlopeFinite?'finite':tail.constant!==0?'unbounded-power':tail.squareRoot!==0?'unbounded-power':'unbounded-logarithmic',netEndpointLoadTerms:tail,netLeadingBending:summedLeading,...(slopeUnknown?{reason:'The summed endpoint curvature coefficient is at floating-point cancellation uncertainty. Exact-tip slope is withheld; no logarithmic divergence or finite limit is claimed.'}:{})})});
    bending.scope='Nominal Euler-Bernoulli transverse pure-bending components from actual sectional compliance; not full physical surface displacement.';
    bending.torsionIncluded=false;bending.physicalSectionOrientationAvailable=false;
    bending.limitations=['The undeformed geometry and exact zero-chord apex are retained. No physical tip-chord floor or shortened span is introduced.','Cross-section translations illustrate transverse bending only. Torsional displacement, shear deformation, section distortion and physical section orientation are unresolved.','A finite improper tip translation does not imply a finite tip slope or validity of small-rotation kinematics near the apex.','This reduced sectional beam response is not a 3-D solid finite-element displacement solution.'];
    // Compute display samples only when the displacement view/report requests
    // them; a stress-only view does not repeat thousands of compliance cuts.
    let bendingSamples=null;
    const samples=()=>bendingSamples||(bendingSamples=Array.from(y,q=>bending.at(q)));
    for(const key of ['verticalMm','chordwiseMm','slopeVertical','slopeChordwise'])Object.defineProperty(bending,key,{enumerable:true,get:()=>Float64Array.from(samples(),s=>s[key])});
    Object.defineProperty(bending,'validity',{enumerable:true,get:()=>{
      const ss=samples(),finite=ss.filter(s=>s.resolved),maxSampledTranslationMm=Math.max(0,...finite.map(s=>Math.hypot(s.verticalMm,s.chordwiseMm))),maxSampledSlopeRad=Math.max(0,...ss.filter(s=>s.slopeFinite).map(s=>Math.hypot(s.slopeVertical,s.slopeChordwise))),translationRatio=maxSampledTranslationMm/L,failed=!tipTranslationFinite||!tipSlopeFinite||translationRatio>.05||maxSampledSlopeRad>.1;
      return {tipTranslationFinite,tipSlopeFinite,globalSmallRotationSatisfied:slopeUnknown?null:!tipSlopeFinite||maxSampledSlopeRad>.1?false:null,sampledSmallRotationSatisfied:maxSampledSlopeRad<=.1,maxSampledTranslationMm,maxSampledSlopeRad,translationRatio,smallDisplacement:!failed,sampleScreeningOnly:true,rotationLimitRad:.1,translationRatioLimit:.05,message:!tipTranslationFinite?'The exact tip bending translation is unbounded; a finite whole-wing displacement is not available.':slopeUnknown?'Exact-tip slope existence is undetermined because leading bending contributions cancel at floating-point uncertainty. The slope is withheld; global small-rotation validity is not certified.':!tipSlopeFinite?'The nominal tip bending translation is finite, but the exact tip slope diverges. Small-rotation beam kinematics fail arbitrarily close to the apex; this is a formal bending component, not a validated full-wing displacement.':failed?'Sampled bending response exceeds the linear-model screening limits. A geometrically nonlinear analysis is required for physical displacement validation.':'Sampled pure-bending screening satisfies translation/span <=5% and slope <=0.1rad. This is not a global nonlinear or torsional validation.'};
    }});
    const NaNs=()=>Float64Array.from(y,()=>NaN),V=Float64Array.from(recovered,c=>c.force[2]),M=Float64Array.from(recovered,c=>c.moment[0]),T=Float64Array.from(recovered,c=>c.moment[1]);
    const mesh={requestedElements:input.nElements||null,actualElements:0,nodeCount:0,mandatorySpanStations:boundaries,stressStations:y.length};
    const analysis3D={stressOnly:true,method:'Exact closed-tip nominal normal stress and pure-bending components; no torsional or full-motion solve',limitations,units:{length:'mm',force:'N',moment:'N mm',stress:'MPa',mass:'g'},bending,evaluateStress,cutAt,performanceCounters,normalStress:{skinTension:tension,skinCompression:compression,spars:sparStress},resultants:recovered.map(c=>({y:c.y,force:c.force,moment:c.moment,localForce:c.localForce,localMoment:c.localMoment,endZone:c.endZone})),localM2:M,localM3:Float64Array.from(y,()=>0),localT:T,loadMapping:{endWrenches:[],method:'Original physical positions; continuous outboard wrench integration'},verification,tipBehavior,spanStations:yy,sectionSamples:[],validity:{nominalOnly:true,stressOnly:true,zeroAreaApexExcluded:true}};
    analysis3D.localM3=Float64Array.from(recovered,c=>-c.moment[2]);
    if(aero){
      analysis3D.aeroLoad={label:aero.label,lineFraction:aero.lineFraction,strips:aero.strips.map(r=>r.slice()),appliedWrench:{force:aeroRoot.force.slice(),momentAboutRoot:aeroRoot.moment.slice(),rootReference:root.reference.slice()},cutAt:y=>{const c=cutAt(y),r=aeroWrench(y,c.reference||[0,y,0]);return {...r,reference:c.reference||[0,y,0],torque:null,torqueResolved:false};},method:'Conservative chord-weighted force and chord-squared residual couple; all six strip resultants/first moments retained; actual aircraft-y cuts'};
      analysis3D.limitations.push('Rigid-wing aerodynamic-load response only. Torsional compliance, twist feedback on lift, shear-centre torque and full aeroelastic admission are not assessed. The chord/chord-squared sub-strip projection preserves all six source resultants; it is not an exact recovery of the original pressure field.');
      tipBehavior.reason+=' Aerodynamic force density vanishes with actual chord and residual couple density with chord squared. Exact-apex stress remains undefined, and delta-tip slope can diverge.';
      bending.scope+=' Applied aerodynamic loads are rigid-wing strip approximations; no torsional or aeroelastic response is inferred.';
    }
    return {analysis3D,geometry:g,pla,rod,assembly:asm,load,criteria:crit,y,ySec:boundaries,sections:[],mass,V,M,T,stress:{sigTop:Float64Array.from(tension),sigBot:Float64Array.from(compression,v=>-v),spars:sparStress},ribs,seams,seamsActive:[],deflection:NaNs(),twist:NaNs(),chordwiseDeflection:NaNs(),fem:{fBending:[],fTorsion:[]},mesh,verification,tipBehavior,checks:[],governing:null,appliedForce:root.force[2],appliedMoment:root.moment[0]};
  }
  return {solve,integrateBending};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingClosedTipStress;

/*
 * Wing AeroStruct fork of the MIE 446 Wing Lab 1.3 structural engine (development, NOT published).
 * The ONLY changes from web/engine.js (see aerostruct/engine_fork.diff, reproduced by the test suite):
 *  - input.aeroLoad {kind 'aeroStrips', lineFraction, strips [[y0, y1, Fx, Fy, Fz, Mx, My, Mz], ...]}: six-component
 *    aerodynamic strip loads (force and moment about the aircraft origin per strip), carried by the spatial beam
 *    as a uniform force intensity on the load line plus a uniform couple intensity, which reproduces every strip's
 *    force and moment exactly (all six root-wrench components, any dihedral, sweep and twist);
 *  - such loads always use the full spatial beam (forced 3-D route); exact zero-chord tips refuse them;
 *  - the spatial beam's consistent loads, cut resultants, applied wrench and line-load display include the
 *    force vector and couple of every aerodynamic strip; analysis3D.aeroLoad reports the aerodynamic part;
 *  - shared sources load from this directory first, then ../web/ (unchanged).
 * Without input.aeroLoad every result is identical to web/engine.js.
 *
 * MIE 446 Wing Lab — structural engine.
 * JavaScript port of computational/printed-wing-solver/printed_wing_solver.py (tested Python solver).
 * Units: mm, N, MPa (N/mm^2), g. Runs in the browser and in Node with bundled section geometry utilities.
 *
 * Differences from the Python solver (checked by verify_engine.mjs):
 *  - the PLA shell section is meshed with a mapped ring of linear triangles instead of
 *    sectionproperties' quadratic triangles (torsion constant about +0.3 %, shear centre < 0.1 mm);
 *  - printed sleeves are treated as separate annuli everywhere (where a sleeve touches the skin
 *    in the last millimetres near the tip, the tiny overlap is counted twice);
 *  - transverse shear uses the same Prandtl-type shear function with Poisson's ratio 0, as the
 *    Python run does.
 *
 * Custom loads (load.kind 'custom', items; mm, N, N/mm, UPWARD +; fraction = x/c from the local leading edge):
 * point, linear 'distributed', curved 'elliptic' | 'parabolic' {start, end, shape 'start'|'end'|'middle', total | peak},
 * 'table' {points [[y, w]] or [[y, w, x/c]], linear between rows} and 'schrenk' {total}: the mean of the
 * chord-proportional load F c(y)/∫c dy and the elliptic load 4F/(πL)√(1 − (y/L)²) over the whole semi-span
 * (an unswept-planform approximation, as in the flight case). V, M and the chordwise first moment use exact
 * integrals (load_profiles.js); the beam FE gets exact consistent loads for the elliptic parts.
 * Torque at a cut y is about that section's shear centre: T(y) = Σ F [x_sc(y) − x_F] over the outboard loads.
 */
const WingEngine = (() => {
  "use strict";
  // AeroStruct fork: shared Wing Lab sources from this directory first, then ../web/ (unchanged).
  const requireShared = (name) => { for (const path of ["./" + name, "../web/" + name]) { try { return require(path); } catch (error) { if (!error || error.code !== "MODULE_NOT_FOUND" || !String(error.message).includes(name.split("/").pop())) throw error; } } return null; };
  const Profiles = typeof LoadProfiles !== "undefined" ? LoadProfiles : (typeof require === "function" ? requireShared("load_profiles.js") : null);
  const Spars = typeof WingSpars !== 'undefined' ? WingSpars : (typeof require === 'function' ? requireShared('wing_spars.js') : null);
  const Airfoils = typeof WingAirfoils !== 'undefined' ? WingAirfoils : (typeof require === 'function' ? requireShared('wing_airfoils.js') : null);
  const Geometry = typeof WingGeometry !== 'undefined' ? WingGeometry : (typeof require === 'function' ? requireShared('wing_geometry.js') : null);
  const Frame = typeof WingFrame3D !== 'undefined' ? WingFrame3D : (typeof require === 'function' ? requireShared('wing_frame3d.js') : null);
  const ClosedTipStress = typeof WingClosedTipStress !== 'undefined' ? WingClosedTipStress : (typeof require === 'function' ? requireShared('wing_closed_tip_stress.js') : null);
  if (!Profiles) throw new Error("Load load_profiles.js before engine.js.");
  const FiniteSection=typeof WingFiniteSection!=='undefined'?WingFiniteSection:(typeof require==='function'?requireShared('wing_finite_section.js'):null);
  const FiniteSectionDeps=typeof WingFiniteSectionDeps!=='undefined'?WingFiniteSectionDeps:(typeof require==='function'?requireShared('vendor/finite-section-geometry/geometry.min.js'):null);
  const GRAV = 9.81;
  const VERSION = "1.3.0+aerostruct.1";
  const MESH_LIMITS=Object.freeze({min:4,max:100,legacyDefault:60,spatialDefault:40});
  function requestedElementCount(input,fallback=MESH_LIMITS.legacyDefault){
    if(input.nElements===undefined)return fallback;
    if(!Number.isInteger(input.nElements)||input.nElements<MESH_LIMITS.min||input.nElements>MESH_LIMITS.max)
      throw Error('Wing requested beam elements (nElements) must be an integer from 4 to 100.');
    return input.nElements;
  }

  // ------------------------------------------------------------------ materials
  const MATERIALS = {
    custom_shell:{key:'custom_shell',kind:'pla',name:'Custom effective shell / rib material',short:'Custom shell',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10,G:null,source:'User-supplied effective isotropic beam properties. Initial numbers are PLA teaching placeholders, not certified properties; replace E, nu, density and allowables before material comparisons.'},
    pla_upright: {
      key: "pla_upright", kind: "pla", name: "Printed PLA Pro — span along printer Z",
      short: "PLA upright", E: 2000, nu: 0.35, rho: 1.24, ft: 15, fc: 50, fs: 10, G: null,
      source: "Illustrative PLA Pro upright card, not a measured material or validated allowable. The 15 MPa tensile entry is a teaching assumption, not a result from your class filament. Gonabadi, Yadav & Bull (2020) is background on print anisotropy, not validation of these numbers. Replace E and strengths with mechanical coupon data; a rod-clearance coupon tests fit only.",
    },
    pla_flat: {
      key: "pla_flat", kind: "pla", name: "Printed PLA Pro — span in build plane",
      short: "PLA flat", E: 3000, nu: 0.35, rho: 1.24, ft: 45, fc: 55, fs: 20, G: null,
      source: "Illustrative PLA Pro flat card, not a measured material or validated allowable. Match the actual filament and print direction, and replace E and strengths with mechanical coupon data; a rod-clearance coupon tests fit only.",
    },
    rod_hobby: {
      key: "rod_hobby", kind: "rod", name: "Pultruded carbon rod — hobby grade",
      short: "Carbon, hobby", E: 25000, nu: 0.3, rho: 1.4, ft: 450, fc: 260, fs: 30, G: 3000,
      source: "Easy Composites pultrusion TDS: flexural modulus 20–30 GPa, compressive 200–320 MPa.",
    },
    rod_t700: {
      key: "rod_t700", kind: "rod", name: "Pultruded carbon rod — T700 aerospace grade",
      short: "Carbon, T700", E: 131000, nu: 0.3, rho: 1.5, ft: 1720, fc: 1680, fs: 80, G: 4500,
      source: "Rock West Composites 47316: flexural modulus 131 GPa, compressive 244 ksi.",
    },
  };
  const shearModulus = (m) => (m.G != null ? m.G : m.E / (2 * (1 + m.nu)));

  // ------------------------------------------------------------------ helpers
  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));
  const cosineSpacing = (n, a = 0, b = 1) =>
    Array.from({ length: n }, (_, i) => a + (b - a) * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));

  function interp(x, xp, fp) {
    // numpy.interp semantics (clamped ends); xp ascending
    const n = xp.length;
    if (x <= xp[0]) return fp[0];
    if (x >= xp[n - 1]) return fp[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xp[mid] <= x) lo = mid; else hi = mid;
    }
    const t = (x - xp[lo]) / (xp[hi] - xp[lo]);
    return fp[lo] + t * (fp[hi] - fp[lo]);
  }
  function interpLin(x, xp, fp) {
    const n = xp.length;
    if (x > xp[n - 1]) return fp[n - 1] + ((fp[n - 1] - fp[n - 2]) / (xp[n - 1] - xp[n - 2])) * (x - xp[n - 1]);
    return interp(x, xp, fp);
  }
  const interpLog = (x, xp, fp) => Math.exp(interpLin(x, xp, fp.map(Math.log)));

  function cumFromRoot(f, x) {
    const out = new Float64Array(x.length);
    for (let i = 1; i < x.length; i++) out[i] = out[i - 1] + 0.5 * (f[i] + f[i - 1]) * (x[i] - x[i - 1]);
    return out;
  }
  function fromTip(f, x) {
    const c = cumFromRoot(f, x);
    const total = c[c.length - 1];
    return c.map((v) => total - v);
  }
  const trapz = (f, x) => cumFromRoot(f, x)[x.length - 1];

  // ------------------------------------------------------------------ geometry
  const DEFAULT_GEOMETRY = {
    naca: "2412", semiSpan: 450, rootChord: 160, tipChord: 100, skin: 1.2, ribThickness: 1.6,
    modules: 3, te: 1.2, interiorRibs: 3, customInteriorRibs: null, interfaceOffset: 4, cap: 2, cavityStart: 0.06,
    cavityEnd: 0.9, rodFractions: [0.3, 0.6], rodDiameter: 4, clearance: 0.25, sleeveWall: 1.2,
    spars: [],
  };

  function normalizeNaca(code) {
    const m = String(code).trim().match(/^(?:NACA\s*)?(\d{4})$/i);
    if (!m) throw new Error("Use a four-digit NACA code such as 2412.");
    const d = m[1];
    if (+d[0] && +d[1] === 0) throw new Error("A cambered NACA section needs a nonzero camber position.");
    if (+d.slice(2) === 0) throw new Error("Airfoil thickness must be greater than zero.");
    return d;
  }

  function makeGeometry(opts = {}) {
    const g = { ...DEFAULT_GEOMETRY, ...opts };
    g.naca = normalizeNaca(g.naca);
    Object.assign(g, Geometry.normalizeGeometryFields(g));
    g.rodFractions = [...g.rodFractions];
    g.spars = Spars.specs(g.spars,g.semiSpan);
    if(g.spars.length&&g.rodFractions.length)throw new Error('Compare shell + rods and shell + bonded spars separately: mixed rod/spar connections are not validated in this model. Remove rods before adding a spar.');
    if (g.rodFractions.some(f => !Number.isFinite(f) || f <= 0 || f >= 1)) throw new Error("Rod positions must be fractions between 0 and 1.");
    const pos = ["semiSpan", "rootChord", "tipChord", "skin", "ribThickness", "te", "cap", "rodDiameter", "sleeveWall"];
    for (const k of pos.filter(k=>k!=="tipChord"||!Geometry.closedTip(g))) if (!Number.isFinite(g[k])||!(g[k] > 0)) throw new Error(`${k} must be positive and finite.`);
    if(!Number.isFinite(g.cavityStart)||!Number.isFinite(g.cavityEnd)||g.cavityStart<=0||g.cavityEnd>=1||g.cavityStart>=g.cavityEnd)throw new Error('Cavity limits must satisfy 0 < start < end < 1.');
    if(Geometry.closedTip(g)&&g.rodFractions.length)throw Error('Remove external rods before selecting a zero-chord tip; closed-tip rod paths are not supported.');
    if (g.tipChord > g.rootChord) throw new Error("Tip chord cannot exceed root chord.");
    if (![1, 2, 3].includes(+g.modules)) throw new Error("Use 1, 2 or 3 modules.");
    if (g.interfaceOffset <= g.ribThickness) throw new Error("Interface rib offset must exceed rib thickness.");
    if (g.clearance < 0 || g.clearance > 0.8) throw new Error("Radial clearance must lie between 0 and 0.8 mm.");
    g.modules = +g.modules;
    if (!Number.isSafeInteger(g.interiorRibs) || g.interiorRibs < 0)
      throw new Error("Use a nonnegative safe-integer count of requested interior ribs.");
    if (g.customInteriorRibs != null) {
      if (!Array.isArray(g.customInteriorRibs))
        throw new Error("Supply custom interior ribs as an array of span stations.");
      const ribs = [...g.customInteriorRibs].sort((a, b) => a - b);
      for (let i = 0; i < ribs.length; i++) {
        const y = ribs[i];
        if (!Number.isFinite(y) || y <= g.cap + g.ribThickness / 2 || y >= g.semiSpan - g.cap - g.ribThickness / 2)
          throw new Error("Interior ribs must lie inside the span, clear of root/tip caps.");
        if (seams(g).some(s => Math.abs(y - s) <= g.interfaceOffset + g.ribThickness))
          throw new Error("Keep interior ribs clear of the seam and its two locked interface ribs.");
        if (i && y - ribs[i - 1] <= g.ribThickness)
          throw new Error("Interior ribs must not overlap: separate their centres by more than the rib thickness.");
      }
      g.customInteriorRibs = Object.freeze(ribs);
    }
    if(g.spars.length){
      if(Geometry.closedTip(g))for(const s of g.spars){const limit=closedTipSparLimit(g,s);if(s.length>limit+1e-8)throw Error(`Closed-tip spar length ${s.length.toFixed(2)} mm exceeds its finite runout fit limit ${limit.toFixed(2)} mm. Reduce Length; ${s.widthMode==='auto'?'auto-tapered widths retain finite cap/web thickness and cannot reach the zero-area tip':'a fixed-width spar cannot reach the zero-area tip'}.`);}
      const points=[...linspace(0,g.semiSpan,129),...g.spars.map(s=>s.length),...g.spars.flatMap(s=>sparWidthBreaks(g,s)),...(g.stations||[]).map(s=>s.eta*g.semiSpan)];
      for(const y of points)sparParts(g,y);
    }
    return Object.freeze(g);
  }

  const chordAt = Geometry.chordAt;
  const airfoilAt = (g,y) => Geometry.airfoilAt(g,y);
  // Cross-section mechanics use unrotated local x/z. Apply station transforms
  // only at geometry/CAD/display boundaries, never to the old scalar solver.
  const localGeometry = (g,y) => g.airfoil || g.stations || g.planform==='elliptic' ? {...g,naca:airfoilAt(g,y),sectionChord:chordAt(g,y)} : g;
  const sparParts = (g,y) => {const parts=Spars.parts(localGeometry(g,y),y,verticalOrdinates);if(Geometry.closedTip(g)&&parts.some(p=>p.s.widthMode==='auto')){const start=cavityTipLimit(g)-g.cap;for(const p of parts)if(p.s.widthMode==='auto')p.embeddedInSolidTip=y>=start;}return parts;};
  const sparWidths=(g,s,y)=>Spars.widths(localGeometry(g,y),s,y);
  function sparWidthBreaks(g,s){
    if(s.widthMode!=='auto')return [];
    const out=[];
    for(const [width,thickness]of [[s.topWidth,s.topThickness],[s.bottomWidth,s.bottomThickness]]){
      const target=g.rootChord*5*thickness/width;
      if(target>=g.rootChord||target<=chordAt(g,g.semiSpan))continue;
      let a=0,b=g.semiSpan;for(let i=0;i<48;i++){const y=(a+b)/2;if(chordAt(g,y)>target)a=y;else b=y;}const y=(a+b)/2;if(y<s.length)out.push(y);
    }
    return [...new Set(out)].sort((a,b)=>a-b);
  }
  function closedTipSparLimit(g,spec){return closedTipSparFit(g,spec).maximumLengthMm;}
  function closedTipSparFit(g,spec){
    if(!Geometry.closedTip(g))return {closedTip:false,maximumLengthMm:g.semiSpan,governingLimit:'span',category:'geometry',reason:'The nonzero-tip span bounds the spar length.',boundaryMm:g.semiSpan,safetyInsetMm:0};
    // Keep the actual fixed cap/web dimensions. Find the first loss of fit,
    // rather than extending material through a solid closure or scaling it.
    const solidStart=cavityTipLimit(g)-g.cap,auto=spec.widthMode==='auto',end=auto?g.semiSpan:solidStart;
    if(!(solidStart>0))throw Error('Closed-tip spar has no hollow root region. Increase root chord or airfoil thickness.');
    const other=(g.spars||[]).filter(s=>s!==spec&&Math.abs(s.fraction-spec.fraction)>1e-12);
    const test={...g,spars:[...other,{...spec,length:g.semiSpan}]};
    let lastFailure=null;
    const fits=y=>{try{sparParts(test,y);return true;}catch(error){lastFailure={stationMm:y,message:error.message};return false;}};
    if(!fits(0))throw Error('Closed-tip spar dimensions do not fit the root cavity. Reduce cap width/thickness or web thickness, move the spar, or increase root chord/airfoil thickness.');
    const points=[...linspace(0,end,257),...sparWidthBreaks(g,{...spec,length:g.semiSpan}),...other.flatMap(s=>[s.length,Math.min(end,s.length+1e-7)]),...(g.stations||[]).map(s=>s.eta*g.semiSpan)].filter(y=>y>=0&&y<=end).sort((a,b)=>a-b);
    let lo=0,hi=end,sectionLimited=false;
    for(const y of points){if(!fits(y)){hi=y;sectionLimited=true;break;}lo=y;}
    if(lo<hi)for(let i=0;i<40;i++){const y=(lo+hi)/2;if(fits(y))lo=y;else hi=y;}
    const limit=Math.max(0,Math.min(lo,end)-Math.max(1e-5,g.semiSpan*1e-7));
    if(limit<Math.min(20,g.semiSpan))throw Error('Closed-tip spar has less than the minimum 20 mm fit length. Revise root dimensions or spar dimensions.');
    const part=sparParts(test,limit).find(p=>p.index===other.length),c=chordAt(g,limit),profile=airfoilAt(g,limit);
    const lineAt=(line,x)=>{let i=1;while(i<line.length-1&&line[i][0]<x)i++;const a=line[i-1],b=line[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);};
    const xl=part.x-spec.webThickness/2,xr=part.x+spec.webThickness/2,webPoints=[xl,xr,...part.top.map(p=>p[0]),...part.bottom.map(p=>p[0])].filter(x=>x>=xl&&x<=xr);
    const minimumWebHeight=Math.min(...webPoints.map(x=>lineAt(part.top,x)-spec.topThickness-lineAt(part.bottom,x)-spec.bottomThickness));
    const capXs=[...part.top,...part.bottom].map(p=>p[0]),capClearance=Math.min(...part.top.map(([x,z])=>z-spec.topThickness-(verticalOrdinates(profile,x/c,c,g.te).lower+g.skin)),...part.bottom.map(([x,z])=>(verticalOrdinates(profile,x/c,c,g.te).upper-g.skin)-(z+spec.bottomThickness)));
    let governingLimit='solid-tip-closure',category='closure-policy',reason='The selected hollow region ends here: cavity closure station minus the cap offset. This is a hollow-to-solid geometry policy, not a claim that the local spar cannot physically extend farther.';
    if(sectionLimited){
      const message=lastFailure?.message||'';
      if(/overlap/.test(message)){governingLimit='spar-overlap';category='geometry';reason='The fixed-width caps would overlap another spar.';}
      else if(/caps must fit wholly/.test(message)){governingLimit='cap-cavity-width';category='geometry';reason='The fixed-width caps reach a chordwise cavity boundary.';}
      else if(/cap thickness/.test(message)){governingLimit='cap-skin-clearance';category='geometry';reason='A fixed cap thickness reaches the opposite inner skin.';}
      else if(/caps must remain wider/.test(message)){governingLimit='cap-web-clearance';category='geometry';reason='The tapered cap would become no wider than the fixed web. An I-section needs positive cap flange width.';}
      else if(/web thickness|web height/.test(message)){governingLimit='web-thin-wall';category='model-admission';reason='The current spar model requires positive clear web height and web thickness no greater than one fifth of that height across the web width. This is a model-admission limit, not proof of physical impossibility.';}
      else {governingLimit='section-fit';category='geometry';reason=message||'The actual fixed-dimension spar section fails its fit checks.';}
    }
    return {closedTip:true,maximumLengthMm:limit,governingLimit,category,reason,boundaryMm:sectionLimited?lo:end,safetyInsetMm:Math.max(1e-5,g.semiSpan*1e-7),firstRejectedStationMm:sectionLimited?hi:null,failureMessage:sectionLimited?lastFailure?.message:null,cavityClosureMm:solidStart+g.cap,solidTipStartMm:solidStart,capOffsetMm:g.cap,cavityCriterion:'The hollow contour requires at least 0.8 mm inner separation at its sampled cavity stations; the cap offset is reserved before that closure.',widthMode:auto?'auto':'fixed',widthFloorStationsMm:sparWidthBreaks(g,{...spec,length:limit}),rootTopWidthMm:spec.topWidth,rootBottomWidthMm:spec.bottomWidth,embeddedContinuation:auto&&limit>solidStart,embeddingReason:auto?'Any continuation inside the existing homogeneous solid tip is embedded material, counted once in the physical union; it is not a separate hollow I-section.':null,sectionAtMaximum:{stationMm:limit,chordMm:c,topWidthMm:part.widths.topWidth,bottomWidthMm:part.widths.bottomWidth,minimumTopWidthMm:part.widths.minimumTopWidth,minimumBottomWidthMm:part.widths.minimumBottomWidth,webHeightMm:part.h,minimumWebHeightMm:minimumWebHeight,webThicknessMm:spec.webThickness,requiredWebHeightMm:5*spec.webThickness,capVerticalClearanceMm:capClearance,capLeftClearanceMm:Math.min(...capXs)-g.cavityStart*c,capRightClearanceMm:g.cavityEnd*c-Math.max(...capXs)},dimensionsChanged:false};
  }
  function analysisCapability(g,input={}) {
    if(Geometry.closedTip(g)){
      const restrictions=[];
      if(Math.abs(g.sweepDeg||0)>1e-10||Math.abs(g.dihedralDeg||0)>1e-10||[0,g.semiSpan,...(g.stations||[]).map(s=>s.eta*g.semiSpan)].some(y=>Math.abs(Geometry.stationAt(g,y).incidenceDeg)>1e-10))restrictions.push('Exact-tip section stress requires zero sweep, dihedral and incidence at every station.');
      if(g.rodFractions?.length)restrictions.push('Exact-tip section stress supports integral skin, ribs and finite-length spars; remove external rods.');
      if(g.modules>1&&input.assembly?.seamsBonded!==true)restrictions.push('Use one piece or explicitly fully bonded module seams for section stress.');
      if((input.load?.kind??DEFAULT_LOAD.kind)==='flight'&&(input.load?.inertiaRelief??DEFAULT_LOAD.inertiaRelief)!==false)restrictions.push('Set Wing inertia relief to Ignored for exact-tip section stress.');
      return {supported:!restrictions.length,requires3D:true,stressOnly:true,mode:'section-stress',reasons:['Exact zero-chord tip'],restrictions,message:restrictions.length?restrictions.join(' '):'Nominal axial and biaxial normal section stress from physical load equilibrium. Exact-apex stress is undefined. Nominal transverse bending components are available; torsion, shear, local buckling, full displacement and 3-D stress concentrations are not assessed.'};
    }
    const c=Geometry.analysisCapability(g);
    if(c.supported&&!g.airfoil&&!g.stations&&input.aeroLoad==null)return c;
    if(c.supported)c.reasons.push(input.aeroLoad!=null?'six-component aerodynamic loads require the full spatial beam':'explicit airfoil profiles / station sections require the full biaxial spatial beam');
    const restrictions=[];
    if(g.rodFractions?.length)restrictions.push('Remove external rods: 3-D rod/sleeve slip and curved rod paths are not validated.');
    if((g.spars||[]).some(s=>s.length<g.semiSpan-1e-8))restrictions.push('Use full-span bonded spars for the spatial beam: abrupt partial-span spar runouts need a validated reference-axis/joint transition model. Geometry and CAD export remain available.');
    if(g.modules>1&&input.assembly?.seamsBonded!==true)restrictions.push('Use one piece or explicitly fully bonded module seams; 3-D dry-joint compliance is not validated.');
    if(input.load?.kind==='flight'&&input.load.inertiaRelief!==false)restrictions.push('For the spatial beam, set Wing inertia relief to Ignored. Distributed aircraft lift is supported; spatial inertia relief is not validated.');
    if(input.aeroLoad!=null&&input.load?.kind==='flight')restrictions.push('The aerodynamic panel load replaces the prescribed flight lift: set the structural load case to Custom (other custom loads such as point masses may remain).');
    return {supported:!restrictions.length,mode:'spatial-beam',requires3D:true,reasons:c.reasons,restrictions,loadFrame:c.loadFrame,
      message:restrictions.length?restrictions.join(' '):input.aeroLoad!=null?'Small-displacement 6-DOF spatial beam with projected normal sections, biaxial bending and axial/torsional response. Aerodynamic panel loads enter as six-component strip forces and couples on the rigid wing (no aeroelastic redistribution). No 3-D solid, joint, buckling or flutter certification.':'Small-displacement 6-DOF spatial beam with projected normal sections, biaxial bending and axial/torsional response. Prescribed loads are global +z, not lift predicted from airfoil or twist. No 3-D solid, joint, buckling or flutter certification.'};
  }
  const moduleBounds = (g) => linspace(0, g.semiSpan, g.modules + 1);
  const seams = (g) => moduleBounds(g).slice(1, -1);
  function ribStations(g) {
    const st = [];
    const b = seams(g);
    if (g.customInteriorRibs != null) {
      st.push(...g.customInteriorRibs);
    } else if (g.interiorRibs) {
      const step = g.semiSpan / (g.interiorRibs + 1);
      for (let i = 1; i <= g.interiorRibs; i++) {
        const s = step * i;
        if (b.every((v) => Math.abs(s - v) > g.interfaceOffset + g.ribThickness)) st.push(s);
      }
    }
    for (const v of b) st.push(v - g.interfaceOffset, v + g.interfaceOffset);
    st.sort((a, c) => a - c);
    const merged = [];
    for (const s of st) if (!merged.length || Math.abs(s - merged[merged.length - 1]) > g.ribThickness) merged.push(s);
    return merged;
  }
  const skinSupports = (g) => [...new Set([0, ...ribStations(g), g.semiSpan])].sort((a, b) => a - b);
  const rodRadius = (g) => g.rodDiameter / 2;
  const holeRadius = (g) => rodRadius(g) + g.clearance;
  const sleeveRadius = (g) => holeRadius(g) + g.sleeveWall;

  // NACA four-digit (identical to the CAD code, including the blunt printable trailing edge)
  function nacaParams(code) {
    const d = normalizeNaca(code);
    return [+d[0] / 100, +d[1] / 10, +d.slice(2) / 100];
  }
  function camber(code, x) {
    if(typeof code==='object') return Airfoils.camber(code,x);
    const [m, p] = nacaParams(code);
    if (m === 0) return { yc: 0, slope: 0 };
    if (x < p) return { yc: (m / (p * p)) * (2 * p * x - x * x), slope: ((2 * m) / (p * p)) * (p - x) };
    const q = (1 - p) * (1 - p);
    return { yc: (m / q) * (1 - 2 * p + 2 * p * x - x * x), slope: ((2 * m) / q) * (p - x) };
  }
  function halfThickness(code, x, chord, te) {
    const t = nacaParams(code)[2];
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
    const natural = 5 * t * (0.2969 - 0.126 - 0.3516 + 0.2843 - 0.1015);
    return yt + (te / (2 * chord) - natural) * x ** 4;
  }
  function airfoilSurfaces(code, chord, te, count = 241) {
    if(typeof code==='object')return Airfoils.surfaces(code,chord,te,count);
    const xs = cosineSpacing(count);
    const xu = [], zu = [], xl = [], zl = [];
    for (const x of xs) {
      const { yc, slope } = camber(code, x);
      const th = Math.atan(slope);
      const yt = halfThickness(code, x, chord, te);
      xu.push((x - yt * Math.sin(th)) * chord);
      zu.push((yc + yt * Math.cos(th)) * chord);
      xl.push((x + yt * Math.sin(th)) * chord);
      zl.push((yc - yt * Math.cos(th)) * chord);
    }
    return { xu, zu, xl, zl };
  }
  function verticalOrdinates(code, x, chord, te) {
    if(typeof code==='object')return Airfoils.verticalOrdinates(code,x,chord,te);
    const { yc, slope } = camber(code, x);
    const vh = halfThickness(code, x, chord, te) * Math.cos(Math.atan(slope));
    return { lower: (yc - vh) * chord, camber: yc * chord, upper: (yc + vh) * chord };
  }
  function rodCentres(g, y) {
    const c = chordAt(g, y);
    const profile=airfoilAt(g,y);
    return g.rodFractions.map((f) => [f * c, camber(profile, f).yc * c]);
  }

  // ------------------------------------------------------------------ section geometry
  function polyIntegrals(pts) {
    // [A, ∫z, ∫x, ∫z², ∫x², ∫xz] for a closed polygon (CCW positive)
    const r = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      const a = x0 * z1 - x1 * z0;
      r[0] += a / 2;
      r[1] += ((z0 + z1) * a) / 6;
      r[2] += ((x0 + x1) * a) / 6;
      r[3] += ((z0 * z0 + z0 * z1 + z1 * z1) * a) / 12;
      r[4] += ((x0 * x0 + x0 * x1 + x1 * x1) * a) / 12;
      r[5] += ((x0 * z1 + 2 * x0 * z0 + 2 * x1 * z1 + x1 * z0) * a) / 24;
    }
    if (r[0] < 0) return r.map((v) => -v);
    return r;
  }
  function diskIntegrals([xc, zc], R) {
    const A = Math.PI * R * R;
    const I = (Math.PI * R ** 4) / 4;
    return [A, A * zc, A * xc, I + A * zc * zc, I + A * xc * xc, A * xc * zc];
  }
  const annulusIntegrals = (c, R, r) => diskIntegrals(c, R).map((v, i) => v - diskIntegrals(c, r)[i]);

  const effectiveTE=(g,y)=>Geometry.closedTip(g)?g.te*Math.min(1,chordAt(g,y)/(12*g.skin)):g.te;
  const tipCavityCache=new WeakMap();
  function cavityTipLimit(g){
    if(!Geometry.closedTip(g))return g.semiSpan;
    if(tipCavityCache.has(g))return tipCavityCache.get(g);
    const raw={...g,_rawCavity:true};ringLoops(raw,0,81,8,8);
    let a=0,b=g.semiSpan;
    // First closure from the root, rather than admitting disconnected pockets.
    for(let i=1;i<=128;i++){const y=g.semiSpan*i/128;try{ringLoops(raw,y,81,8,8);a=y;}catch{b=y;break;}}
    for(let i=0;i<32;i++){const y=(a+b)/2;try{ringLoops(raw,y,81,8,8);a=y;}catch{b=y;}}
    tipCavityCache.set(g,a);return a;
  }
  function outerContour(g, y, count = 241) {
    const c = chordAt(g, y);
    if(c===0)return Array.from({length:2*count-1},()=>[0,0]);
    const { xu, zu, xl, zl } = airfoilSurfaces(airfoilAt(g,y), c, effectiveTE(g,y), count);
    const pts = xu.map((x, i) => [x, zu[i]]);
    for (let i = xl.length - 1; i >= 1; i--) pts.push([xl[i], zl[i]]);
    return pts;
  }

  // Matched inner (cavity) and outer loops for a mapped ring mesh, CCW around the cavity
  function ringLoops(g, y, Ks = 120, Kn = 40, Ka = 24) {
    const c = chordAt(g, y);
    if(Geometry.closedTip(g)&&!g._rawCavity&&y>=cavityTipLimit(g))return {inner:[],outer:outerContour(g,y,Ks),corners:[],chord:c,upperSkin:[],solid:true};
    if(c===0)throw Error('Zero-chord tip has no hollow cavity.');
    const te=effectiveTE(g,y);
    const t = g.skin;
    const x0 = g.cavityStart, x1 = g.cavityEnd;
    const profile=airfoilAt(g,y);
    const { xu, zu, xl, zl } = airfoilSurfaces(profile, c, te, 401);
    const outUp = (x) => interp(x, xu, zu);
    const outLo = (x) => interp(x, xl, zl);
    const xs = cosineSpacing(Ks, x0, x1).map((v) => v * c);
    const upIn = [], loIn = [], upOut = [], loOut = [];
    for (const x of xs) {
      const v = verticalOrdinates(profile, x / c, c, g.te);
      upIn.push(v.upper - t);
      loIn.push(v.lower + t);
      upOut.push(outUp(x));
      loOut.push(outLo(x));
    }
    for (let i = 0; i < Ks; i++) if (upIn[i] - loIn[i] < 0.8) throw new Error(`The cavity collapses at chord ${c.toFixed(1)} mm: skin too thick for this airfoil.`);
    const resample = (arc, n) => {
      const s = [0];
      for (let i = 1; i < arc.length; i++) s.push(s[i - 1] + Math.hypot(arc[i][0] - arc[i - 1][0], arc[i][1] - arc[i - 1][1]));
      const L = s[s.length - 1];
      const sn = linspace(0, 1, n + 1).map((v) => v * L);
      const xa = arc.map((p) => p[0]), za = arc.map((p) => p[1]);
      return sn.map((v) => [interp(v, s, xa), interp(v, s, za)]);
    };
    // nose: outer arc upper(x0) -> LE -> lower(x0); inner front wall upper corner -> lower corner
    const arc = [[x0 * c, upOut[0]]];
    for (let i = xu.length - 1; i >= 0; i--) if (xu[i] <= x0 * c) arc.push([xu[i], zu[i]]);
    for (let i = 1; i < xl.length; i++) if (xl[i] <= x0 * c) arc.push([xl[i], zl[i]]);
    arc.push([x0 * c, loOut[0]]);
    const noseOut = resample(arc, Kn);
    const noseIn = linspace(0, 1, Kn + 1).map((s) => [x0 * c, upIn[0] + (loIn[0] - upIn[0]) * s]);
    // aft: outer lower(x1) -> TE -> upper(x1); inner rear wall lower corner -> upper corner
    const arc2 = [[x1 * c, loOut[Ks - 1]]];
    for (let i = 0; i < xl.length; i++) if (xl[i] >= x1 * c) arc2.push([xl[i], zl[i]]);
    for (let i = xu.length - 1; i >= 0; i--) if (xu[i] >= x1 * c) arc2.push([xu[i], zu[i]]);
    arc2.push([x1 * c, upOut[Ks - 1]]);
    const aftOut = resample(arc2, Ka);
    const aftIn = linspace(0, 1, Ka + 1).map((s) => [x1 * c, loIn[Ks - 1] + (upIn[Ks - 1] - loIn[Ks - 1]) * s]);
    const inner = [], outer = [];
    for (let i = 0; i < Ks; i++) { inner.push([xs[i], loIn[i]]); outer.push([xs[i], loOut[i]]); }
    for (let i = 1; i < Ka; i++) { inner.push(aftIn[i]); outer.push(aftOut[i]); }
    for (let i = Ks - 1; i >= 0; i--) { inner.push([xs[i], upIn[i]]); outer.push([xs[i], upOut[i]]); }
    for (let i = 1; i < Kn; i++) { inner.push(noseIn[i]); outer.push(noseOut[i]); }
    const corners = [[xs[0], upIn[0]], [xs[0], loIn[0]], [xs[Ks - 1], upIn[Ks - 1]], [xs[Ks - 1], loIn[Ks - 1]]];
    const upperSkin = xs.map((x, i) => [x, upOut[i]]);
    return { inner, outer, corners, chord: c, upperSkin };
  }

  function ringMesh(inner, outer, layers = 4) {
    const K = inner.length;
    const nodes = new Float64Array(2 * K * (layers + 1));
    for (let j = 0; j <= layers; j++)
      for (let i = 0; i < K; i++) {
        const f = j / layers;
        nodes[2 * (j * K + i)] = inner[i][0] + (outer[i][0] - inner[i][0]) * f;
        nodes[2 * (j * K + i) + 1] = inner[i][1] + (outer[i][1] - inner[i][1]) * f;
      }
    const tris = [];
    const ok = (a, b, c) => {
      const d = (nodes[2 * b] - nodes[2 * a]) * (nodes[2 * c + 1] - nodes[2 * a + 1]) - (nodes[2 * c] - nodes[2 * a]) * (nodes[2 * b + 1] - nodes[2 * a + 1]);
      return Math.abs(d) > 1e-9;
    };
    for (let j = 0; j < layers; j++)
      for (let i = 0; i < K; i++) {
        const a = j * K + i, b = j * K + ((i + 1) % K), c = (j + 1) * K + ((i + 1) % K), d = (j + 1) * K + i;
        if (ok(a, b, c)) tris.push(a, b, c);
        if (ok(a, c, d)) tris.push(a, c, d);
      }
    return { nodes, tris: Int32Array.from(tris), K, layers };
  }

  // Preconditioned conjugate gradient on a sparse symmetric matrix (rows: Map col->val)
  function solveCG(rows, b, fixed = 0, tol = 1e-11, maxIt = 20000) {
    const n = b.length;
    const diag = new Float64Array(n);
    for (let i = 0; i < n; i++) diag[i] = rows[i].get(i) || 1;
    // Preserve each assembled row's addition order, but traverse contiguous
    // numeric storage during PCG rather than allocating Map entry iterators
    // for every multiply. Matrix, gauge, tolerance and iteration limit agree.
    const offsets=new Int32Array(n+1),columns=[],entries=[];
    for(let i=0;i<n;i++){
      if(i!==fixed)for(const [j,v]of rows[i])if(j!==fixed){columns.push(j);entries.push(v);}
      offsets[i+1]=columns.length;
    }
    const col=Int32Array.from(columns),values=Float64Array.from(entries);
    const mult = (x, out) => {
      for (let i = 0; i < n; i++) {
        if (i === fixed) { out[i] = x[i]; continue; }
        let s = 0;
        for(let k=offsets[i];k<offsets[i+1];k++)s+=values[k]*x[col[k]];
        out[i] = s;
      }
    };
    const x = new Float64Array(n);
    const r = Float64Array.from(b);
    r[fixed] = 0;
    const z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
    for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
    p.set(z);
    let rz = 0, bnorm = 0;
    for (let i = 0; i < n; i++) { rz += r[i] * z[i]; bnorm += r[i] * r[i]; }
    bnorm = Math.sqrt(bnorm) || 1;
    for (let it = 0; it < maxIt; it++) {
      mult(p, Ap);
      let pAp = 0;
      for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
      const alpha = rz / pAp;
      let rn = 0;
      for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; rn += r[i] * r[i]; }
      if (Math.sqrt(rn) / bnorm < tol) break;
      let rz2 = 0;
      for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
      const beta = rz2 / rz;
      rz = rz2;
      for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    }
    return x;
  }

  // 2-D finite elements on the shell ring: area properties, warping (St-Venant torsion),
  // Trefftz shear centre and the shear function for a vertical shear force (Poisson's ratio 0).
  function shellFE(mesh) {
    const { nodes, tris } = mesh;
    const nT = tris.length / 3, nN = nodes.length / 2;
    const A = new Float64Array(nT), bx = new Float64Array(3 * nT), by = new Float64Array(3 * nT);
    let At = 0, Sx = 0, Sz = 0;
    for (let e = 0; e < nT; e++) {
      const i = tris[3 * e], j = tris[3 * e + 1], k = tris[3 * e + 2];
      const x1 = nodes[2 * i], y1 = nodes[2 * i + 1], x2 = nodes[2 * j], y2 = nodes[2 * j + 1], x3 = nodes[2 * k], y3 = nodes[2 * k + 1];
      const det = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
      const a = Math.abs(det) / 2;
      A[e] = a;
      bx[3 * e] = (y2 - y3) / det; bx[3 * e + 1] = (y3 - y1) / det; bx[3 * e + 2] = (y1 - y2) / det;
      by[3 * e] = (x3 - x2) / det; by[3 * e + 1] = (x1 - x3) / det; by[3 * e + 2] = (x2 - x1) / det;
      At += a;
      Sx += (a * (x1 + x2 + x3)) / 3;
      Sz += (a * (y1 + y2 + y3)) / 3;
    }
    const xc = Sx / At, zc = Sz / At;
    let Ixx = 0, Iyy = 0, Ixy = 0; // Ixx = ∫z'², Iyy = ∫x'², Ixy = ∫x'z' (section-plane convention)
    const X = (n) => nodes[2 * n] - xc, Y = (n) => nodes[2 * n + 1] - zc;
    for (let e = 0; e < nT; e++) {
      const v = [tris[3 * e], tris[3 * e + 1], tris[3 * e + 2]];
      const xs = v.map(X), ys = v.map(Y);
      const a = A[e];
      Ixx += (a / 6) * (ys[0] ** 2 + ys[1] ** 2 + ys[2] ** 2 + ys[0] * ys[1] + ys[1] * ys[2] + ys[0] * ys[2]);
      Iyy += (a / 6) * (xs[0] ** 2 + xs[1] ** 2 + xs[2] ** 2 + xs[0] * xs[1] + xs[1] * xs[2] + xs[0] * xs[2]);
      Ixy += (a / 12) * (2 * (xs[0] * ys[0] + xs[1] * ys[1] + xs[2] * ys[2]) + xs[0] * ys[1] + xs[1] * ys[0] + xs[1] * ys[2] + xs[2] * ys[1] + xs[0] * ys[2] + xs[2] * ys[0]);
    }
    // stiffness (Laplace) and load vectors
    const rows = Array.from({ length: nN }, () => new Map());
    const fW = new Float64Array(nN), fV = new Float64Array(nN);
    for (let e = 0; e < nT; e++) {
      const v = [tris[3 * e], tris[3 * e + 1], tris[3 * e + 2]];
      const a = A[e];
      const xs = v.map(X), ys = v.map(Y);
      const xm = (xs[0] + xs[1] + xs[2]) / 3, ym = (ys[0] + ys[1] + ys[2]) / 3;
      for (let p = 0; p < 3; p++) {
        for (let q = 0; q < 3; q++) {
          const kv = a * (bx[3 * e + p] * bx[3 * e + q] + by[3 * e + p] * by[3 * e + q]);
          rows[v[p]].set(v[q], (rows[v[p]].get(v[q]) || 0) + kv);
        }
        fW[v[p]] += a * (bx[3 * e + p] * ym - by[3 * e + p] * xm);
        // ∇²Φ = 2(Ixy x − Iyy y)  →  ∫∇N·∇Φ = −∫N f ;  ∫_T N_p g = A/12 (2 g_p + g_q + g_r)
        const gv = xs.map((xx, i) => 2 * (Ixy * xx - Iyy * ys[i]));
        fV[v[p]] -= (a / 12) * (gv[0] + gv[1] + gv[2] + gv[p]);
      }
    }
    const omega = solveCG(rows, fW);
    const phi = solveCG(rows, fV);
    // zero-mean warping, J, Trefftz shear centre
    let wMean = 0;
    for (let e = 0; e < nT; e++) wMean += (A[e] * (omega[tris[3 * e]] + omega[tris[3 * e + 1]] + omega[tris[3 * e + 2]])) / 3;
    wMean /= At;
    for (let i = 0; i < nN; i++) omega[i] -= wMean;
    let Jw = 0, Ixw = 0, Iyw = 0;
    const gradW = new Float64Array(2 * nT), gradP = new Float64Array(2 * nT);
    for (let e = 0; e < nT; e++) {
      const v = [tris[3 * e], tris[3 * e + 1], tris[3 * e + 2]];
      const xs = v.map(X), ys = v.map(Y), ws = v.map((n) => omega[n]);
      let gx = 0, gy = 0, px = 0, py = 0;
      for (let p = 0; p < 3; p++) {
        gx += bx[3 * e + p] * ws[p]; gy += by[3 * e + p] * ws[p];
        px += bx[3 * e + p] * phi[v[p]]; py += by[3 * e + p] * phi[v[p]];
      }
      gradW[2 * e] = gx; gradW[2 * e + 1] = gy; gradP[2 * e] = px; gradP[2 * e + 1] = py;
      const xm = (xs[0] + xs[1] + xs[2]) / 3, ym = (ys[0] + ys[1] + ys[2]) / 3;
      Jw += A[e] * (xm * gy - ym * gx);
      Ixw += (A[e] / 12) * (xs[0] * ws[0] + xs[1] * ws[1] + xs[2] * ws[2] + (xs[0] + xs[1] + xs[2]) * (ws[0] + ws[1] + ws[2]));
      Iyw += (A[e] / 12) * (ys[0] * ws[0] + ys[1] * ws[1] + ys[2] * ws[2] + (ys[0] + ys[1] + ys[2]) * (ws[0] + ws[1] + ws[2]));
    }
    const J = Ixx + Iyy + Jw;
    const D = Ixx * Iyy - Ixy * Ixy;
    const xsc = xc + (Ixy * Ixw - Iyy * Iyw) / D;
    const zsc = zc + (Ixx * Ixw - Ixy * Iyw) / D;
    // unit-load shear stress per element: torsion (mzz = 1, CCW) and vertical shear (vy = 1)
    const tauT = new Float64Array(2 * nT), tauV = new Float64Array(2 * nT);
    const Ds = 2 * D;
    let FyV = 0, MzT = 0;
    for (let e = 0; e < nT; e++) {
      const v = [tris[3 * e], tris[3 * e + 1], tris[3 * e + 2]];
      const xm = v.reduce((s, n) => s + X(n), 0) / 3, ym = v.reduce((s, n) => s + Y(n), 0) / 3;
      tauT[2 * e] = (gradW[2 * e] - ym) / J;
      tauT[2 * e + 1] = (gradW[2 * e + 1] + xm) / J;
      tauV[2 * e] = gradP[2 * e] / Ds;
      tauV[2 * e + 1] = gradP[2 * e + 1] / Ds;
      FyV += A[e] * tauV[2 * e + 1];
      MzT += A[e] * (xm * tauT[2 * e + 1] - ym * tauT[2 * e]);
    }
    // normalise the resultants (sign and discretisation) so ∫τ_zy dA = vy and ∫(xτ_zy − yτ_zx) dA = mzz
    for (let e = 0; e < 2 * nT; e++) { tauV[e] /= FyV; tauT[e] /= MzT; }
    return { A: At, xc, zc, Ixx, Iyy, Ixy, J, xsc, zsc, tauT, tauV, areas: A };
  }

  function bredtBatho(g, y) {
    const c = chordAt(g, y), t = g.skin, x0 = g.cavityStart, x1 = g.cavityEnd;
    const profile=airfoilAt(g,y);
    const xq = cosineSpacing(161, x0, x1);
    const xs = xq.map((v) => v * c);
    const up = [], lo = [];
    for (const x of xq) {
      const v = verticalOrdinates(profile, x, c, g.te);
      up.push(v.upper - t / 2);
      lo.push(v.lower + t / 2);
    }
    let Lu = 0, Ll = 0, Am = 0;
    for (let i = 1; i < xs.length; i++) {
      Lu += Math.hypot(xs[i] - xs[i - 1], up[i] - up[i - 1]);
      Ll += Math.hypot(xs[i] - xs[i - 1], lo[i] - lo[i - 1]);
      Am += 0.5 * (up[i] - lo[i] + up[i - 1] - lo[i - 1]) * (xs[i] - xs[i - 1]);
    }
    const hF = up[0] - lo[0], hR = up[up.length - 1] - lo[lo.length - 1];
    const path = (Lu + Ll) / t + hF / (x0 * c) + hR / ((1 - x1) * c);
    return { J: (4 * Am * Am) / path, Am };
  }

  function circleRadius(p1, p2, p3) {
    const a = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
    const b = Math.hypot(p2[0] - p3[0], p2[1] - p3[1]);
    const c = Math.hypot(p1[0] - p3[0], p1[1] - p3[1]);
    const area2 = Math.abs((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]));
    return area2 < 1e-12 ? Infinity : (a * b * c) / (2 * area2);
  }

  const DEFAULT_ASSEMBLY = { rodsBonded: false, seamsBonded: false, seamFreeLength: null, adhesiveTensile: 5 };

  // Geometry-only part of a section (mesh, warping FE, Bredt check): cached by geometry and station.
  const geoCache = new Map();
  // Normal-plane warping solves depend on the physical section and its
  // projection, not its applied load. Reuse the existing section/projection
  // key across solves as well as within the shear-centre-axis iteration.
  const projectedSectionCache=new Map();
  function geometricSection(g, y, layers = 4) {
    // Warping mesh depends only on this shell outline, not on spar materials,
    // rods, rib layout or module labels. Reuse exactly the same immutable FE data.
    const key = JSON.stringify([airfoilAt(g,y),chordAt(g,y),g.skin,g.te,g.cavityStart,g.cavityEnd,layers]);
    if (!geoCache.has(key)) {
      if (geoCache.size > 120) geoCache.clear();
      const loops = ringLoops(g, y);
      const mesh = ringMesh(loops.inner, loops.outer, layers);
      geoCache.set(key, { loops, mesh, fe: shellFE(mesh), bredt: bredtBatho(g, y), outer: outerContour(g, y) });
    }
    return geoCache.get(key);
  }

  function analyseSection(g, pla, rod, asm, y, layers = 4) {
    const { loops, mesh, fe, bredt, outer } = geometricSection(g, y, layers);
    const Ep = pla.E, Er = rod.E;
    const centres = rodCentres(g, y);
    const Rs = sleeveRadius(g), rh = holeRadius(g), rr = rodRadius(g);
    const shellInt = [fe.A, fe.A * fe.zc, fe.A * fe.xc, fe.Ixx + fe.A * fe.zc ** 2, fe.Iyy + fe.A * fe.xc ** 2, fe.Ixy + fe.A * fe.xc * fe.zc];
    const sleeveInts = centres.map((cc) => annulusIntegrals(cc, Rs, rh));
    const rodInts = centres.map((cc) => diskIntegrals(cc, rr));
    const sectionSparParts=sparParts(g,y),sparInts=sectionSparParts.flatMap(p=>p.polygons.map((polygon,k)=>({index:p.index,kind:['top cap','bottom cap','web'][k],m:p.s.material,polygon,int:polyIntegrals(polygon)})));
    const sums = [0, 0, 0, 0, 0, 0];
    const add = (arr, E) => arr.forEach((v, i) => (sums[i] += E * v));
    add(shellInt, Ep);
    sleeveInts.forEach((s) => add(s, Ep));
    if (asm.rodsBonded) rodInts.forEach((s) => add(s, Er));
    sparInts.forEach(s=>add(s.int,s.m.E));
    const EA = sums[0], zc = sums[1] / EA, xc = sums[2] / EA;
    let EIf = sums[3] - EA * zc * zc, EIc = sums[4] - EA * xc * xc;
    const EIxz = sums[5] - EA * xc * zc;
    const Irod = (Math.PI * g.rodDiameter ** 4) / 64;
    let EIrods = 0;
    if (!asm.rodsBonded) { EIrods = centres.length * Er * Irod; EIf += EIrods; EIc += EIrods; }
    const principal = 0.5 * (180 / Math.PI) * Math.atan2(2 * EIxz, EIc - EIf);
    const Jfloat = centres.length * (Math.PI / 2) * (Rs ** 4 - rh ** 4);
    let GJ = shearModulus(pla) * (fe.J + Jfloat);
    if (asm.rodsBonded) GJ += centres.length * shearModulus(rod) * (Math.PI * g.rodDiameter ** 4) / 32;
    const sparNetwork=sectionSparParts.length?Spars.network(loops.inner,loops.outer,pla,sectionSparParts):null;
    const bendCoupling=sparNetwork?EIxz/EIc:0;
    if(sparNetwork){EIf-=EIxz*EIxz/EIc;GJ=sparNetwork.GJ;}
    const xsc=sparNetwork?sparNetwork.xsc:fe.xsc,zsc=sparNetwork?sparNetwork.zsc:fe.zsc;
    // mass, centre of gravity and polar mass moment about the shear centre (g/mm, g·mm²/mm)
    const rp = pla.rho * 1e-3, rr_ = rod.rho * 1e-3;
    const plaInt = shellInt.map((v, i) => v + sleeveInts.reduce((s, a) => s + a[i], 0));
    const rodInt = rodInts.reduce((s, a) => s.map((v, i) => v + a[i]), [0, 0, 0, 0, 0, 0]);
    const sparMass=sparInts.reduce((a,s)=>a+s.m.rho*1e-3*s.int[0],0);
    const mass = rp * plaInt[0] + rr_ * rodInt[0]+sparMass;
    const cgx = (rp * plaInt[2] + rr_ * rodInt[2]+sparInts.reduce((a,s)=>a+s.m.rho*1e-3*s.int[2],0)) / mass;
    const cgz = (rp*plaInt[1]+rr_*rodInt[1]+sparInts.reduce((a,s)=>a+s.m.rho*1e-3*s.int[1],0))/mass;
    const polar = (I) => I[4] - 2 * xsc * I[2] + xsc ** 2 * I[0] + (I[3] - 2 * zsc * I[1] + zsc ** 2 * I[0]);
    const polarInertia = rp * polar(plaInt) + rr_ * polar(rodInt)+sparInts.reduce((a,s)=>a+s.m.rho*1e-3*polar(s.int),0);
    const outerInt = polyIntegrals(outer);
    const holeInt = centres.map((cc) => diskIntegrals(cc, rh)).reduce((s, a) => s.map((v, i) => v + a[i]), [0, 0, 0, 0, 0, 0]);
    const ribInt = outerInt.map((v, i) => v - holeInt[i]-sparInts.reduce((a,s)=>a+s.int[i],0));
    const ribExtra = ribInt[0] - plaInt[0];
    let zTop = -Infinity, zBot = Infinity;
    for (const p of outer) { zTop = Math.max(zTop, p[1]); zBot = Math.min(zBot, p[1]); }
    // upper-skin panel: same point set as the Python solver (241-point surface, x0..x1)
    const surf = airfoilSurfaces(airfoilAt(g,y), loops.chord, g.te, 241);
    const us = [];
    surf.xu.forEach((x, i) => { if (x >= g.cavityStart * loops.chord && x <= g.cavityEnd * loops.chord) us.push([x, surf.zu[i]]); });
    let width = 0;
    for (let i = 1; i < us.length; i++) width += Math.hypot(us[i][0] - us[i - 1][0], us[i][1] - us[i - 1][1]);
    const radius = circleRadius(us[0], us[us.length >> 1], us[us.length - 1]);
    return {
      y, chord: loops.chord, EA, xc, zc, EIf, EIc, EIxz, principal, EIrods, GJ, Jfe: fe.J, Jbredt: bredt.J,
      bredtArea: bredt.Am, xsc, zsc, mass, cgx, cgz, polarInertia, zTop, zBot,
      sparParts:sectionSparParts,sparInts,sparMass,sparNetwork,bendCoupling,
      plaArea: plaInt[0], shellArea: fe.A, rodArea: rodInt[0], ribExtra, ribCgx: ribInt[2] / ribInt[0],ribExtraCgx:(ribInt[2]-plaInt[2])/ribExtra,ribExtraCgz:(ribInt[1]-plaInt[1])/ribExtra,
      ribPolar: polar(ribInt), skinWidth: width, skinRadius: radius, mesh, fe, corners: loops.corners,
      outer, centres, Rs, rh, rr,
    };
  }

  // ------------------------------------------------------------------ loads and criteria
  const DEFAULT_LOAD = {
    name: "Limit manoeuvre (analytical)", kind: "flight", aircraftMass: 1.0, loadFactor: 4.0,
    distribution: "schrenk", liftFraction: 0.25, inertiaRelief: true, tipForce: 10, tipFraction: 0.3,
    fos: 1.5, tipMass: 0, selfWeight:false,
  };
  const DEFAULT_CRITERIA = { maxTipDeflection: 45, maxTipTwist: 2 };

  // ------------------------------------------------------------------ dense linear algebra
  function cholesky(A, n) {
    const L = new Float64Array(n * n);
    for (let j = 0; j < n; j++) {
      let s = A[j * n + j];
      for (let k = 0; k < j; k++) s -= L[j * n + k] ** 2;
      if (s <= 0) throw new Error("Matrix not positive definite.");
      const d = Math.sqrt(s);
      L[j * n + j] = d;
      for (let i = j + 1; i < n; i++) {
        let v = A[i * n + j];
        for (let k = 0; k < j; k++) v -= L[i * n + k] * L[j * n + k];
        L[i * n + j] = v / d;
      }
    }
    return L;
  }
  function cholSolve(L, n, b) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
      y[i] = s / L[i * n + i];
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
      x[i] = s / L[i * n + i];
    }
    return x;
  }
  function jacobiEigen(S, n) {
    const A = Float64Array.from(S);
    const V = new Float64Array(n * n);
    for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++)
        for (let q = p + 1; q < n; q++) {
          const apq = A[p * n + q];
          if (Math.abs(apq) < 1e-300) continue;
          const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k * n + p], akq = A[k * n + q];
            A[k * n + p] = c * akp - s * akq;
            A[k * n + q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p * n + k], aqk = A[q * n + k];
            A[p * n + k] = c * apk - s * aqk;
            A[q * n + k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k * n + p], vkq = V[k * n + q];
            V[k * n + p] = c * vkp - s * vkq;
            V[k * n + q] = s * vkp + c * vkq;
          }
        }
    }
    const vals = Array.from({ length: n }, (_, i) => A[i * n + i]);
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    return { values: order.map((i) => vals[i]), vectors: order.map((i) => Array.from({ length: n }, (_, k) => V[k * n + i])) };
  }
  // generalised symmetric eigenproblem K x = λ M x (both SPD)
  function generalizedEigen(K, M, n, count) {
    const L = cholesky(M, n);
    // C = L^-1 K L^-T
    const Y = new Float64Array(n * n);
    for (let j = 0; j < n; j++) {
      const col = cholFwd(L, n, Array.from({ length: n }, (_, i) => K[i * n + j]));
      for (let i = 0; i < n; i++) Y[i * n + j] = col[i];
    }
    const C = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      const row = cholFwd(L, n, Array.from({ length: n }, (_, j) => Y[i * n + j]));
      for (let j = 0; j < n; j++) C[i * n + j] = row[j];
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = 0.5 * (C[i * n + j] + C[j * n + i]); C[i * n + j] = m; C[j * n + i] = m; }
    const { values, vectors } = jacobiEigen(C, n);
    const modes = vectors.slice(0, count).map((z) => cholBack(L, n, z));
    return { values: values.slice(0, count), modes };
  }
  function cholFwd(L, n, b) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
    return y;
  }
  function cholBack(L, n, y) {
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
    return x;
  }

  // ------------------------------------------------------------------ 1-D beam finite elements
  function beamFEM(nodes, EI, GJ, mLine, IpLine, o = {}) {
    const n = nodes.length;
    const seamList = o.seams || [];
    const kBend = o.kBend == null ? Infinity : o.kBend;
    const kTors = o.kTors || (() => Infinity);
    const seamNodes = new Set(isFinite(kBend) ? seamList.map((s) => argmin(nodes, s)) : []);
    const torsSplit = new Set([...seamNodes].filter((i) => isFinite(kTors(nodes[i]))));
    const wDof = [], thL = [], thR = [];
    let d = n;
    for (let i = 0; i < n; i++) wDof.push(i);
    for (let i = 0; i < n; i++) { thL.push(d); if (seamNodes.has(i)) { thR.push(d + 1); d += 2; } else { thR.push(d); d += 1; } }
    const nb = d;
    const phL = [], phR = [];
    d = 0;
    for (let i = 0; i < n; i++) { phL.push(d); if (torsSplit.has(i)) { phR.push(d + 1); d += 2; } else { phR.push(d); d += 1; } }
    const nt = d;
    const Kb = new Float64Array(nb * nb), Mb = new Float64Array(nb * nb), fb = new Float64Array(nb);
    const Kt = new Float64Array(nt * nt), Mt = new Float64Array(nt * nt), ft = new Float64Array(nt);
    const gx = [0.06943184420297371, 0.33000947820757187, 0.6699905217924281, 0.9305681557970262];
    const gw = [0.17392742256872692, 0.3260725774312731, 0.3260725774312731, 0.17392742256872692];
    for (let e = 0; e < n - 1; e++) {
      const y0 = nodes[e], h = nodes[e + 1] - y0, ym = y0 + h / 2;
      const ei = EI(ym), gj = GJ(ym);
      const db = [wDof[e], thR[e], wDof[e + 1], thL[e + 1]];
      const dt = [phR[e], phL[e + 1]];
      const ke = [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]];
      const me = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], fe = [0, 0, 0, 0];
      const mt = [[0, 0], [0, 0]], ftl = [0, 0];
      for (let q = 0; q < 4; q++) {
        const xi = gx[q], yq = y0 + xi * h, w = gw[q];
        const N = [1 - 3 * xi * xi + 2 * xi ** 3, h * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, h * (-xi * xi + xi ** 3)];
        const m = mLine(yq) * 1e-6;
        for (let a = 0; a < 4; a++) { for (let b = 0; b < 4; b++) me[a][b] += w * h * m * N[a] * N[b]; if (o.wLine) fe[a] += w * h * o.wLine(yq) * N[a]; }
        const Lf = [1 - xi, xi], ip = IpLine(yq) * 1e-6;
        for (let a = 0; a < 2; a++) { for (let b = 0; b < 2; b++) mt[a][b] += w * h * ip * Lf[a] * Lf[b]; if (o.tLine) ftl[a] += w * h * o.tLine(yq) * Lf[a]; }
      }
      if (o.wNodal) { const fx = o.wNodal(y0, h); for (let a = 0; a < 4; a++) fe[a] += fx[a]; }
      for (let a = 0; a < 4; a++) {
        fb[db[a]] += fe[a];
        for (let b = 0; b < 4; b++) { Kb[db[a] * nb + db[b]] += (ei / h ** 3) * ke[a][b]; Mb[db[a] * nb + db[b]] += me[a][b]; }
      }
      const kt = [[1, -1], [-1, 1]];
      for (let a = 0; a < 2; a++) {
        ft[dt[a]] += ftl[a];
        for (let b = 0; b < 2; b++) { Kt[dt[a] * nt + dt[b]] += (gj / h) * kt[a][b]; Mt[dt[a] * nt + dt[b]] += mt[a][b]; }
      }
    }
    for (const i of seamNodes) {
      const a = thL[i], b = thR[i];
      Kb[a * nb + a] += kBend; Kb[b * nb + b] += kBend; Kb[a * nb + b] -= kBend; Kb[b * nb + a] -= kBend;
      if (torsSplit.has(i)) {
        const k = kTors(nodes[i]), p = phL[i], q = phR[i];
        Kt[p * nt + p] += k; Kt[q * nt + q] += k; Kt[p * nt + q] -= k; Kt[q * nt + p] -= k;
      }
    }
    for(const [y,F] of o.pointForces||[]){const k=argmin(nodes,y);if(Math.abs(nodes[k]-y)<1e-8){fb[wDof[k]]+=F;continue;}let e=0;while(e<n-2&&y>nodes[e+1])e++;const h=nodes[e+1]-nodes[e],t=(y-nodes[e])/h,N=[1-3*t*t+2*t*t*t,h*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,h*(-t*t+t*t*t)],d=[wDof[e],thR[e],wDof[e+1],thL[e+1]];N.forEach((v,i)=>fb[d[i]]+=F*v);}
    for(const [y,T] of o.pointTorques||[]){const k=argmin(nodes,y);if(Math.abs(nodes[k]-y)<1e-8){ft[(o.pointTorquesOutboard?phR:phL)[k]]+=T;continue;}let e=0;while(e<n-2&&y>nodes[e+1])e++;const t=(y-nodes[e])/(nodes[e+1]-nodes[e]);ft[phR[e]]+=(1-t)*T;ft[phL[e+1]]+=t*T;}
    for (const [y, m] of o.pointMasses || []) { const k = wDof[argmin(nodes, y)]; Mb[k * nb + k] += m * 1e-6; }
    for (const [y, Ip] of o.pointInertias || []) { const k = phL[argmin(nodes, y)]; Mt[k * nt + k] += Ip * 1e-6; }
    const fixB = new Set([wDof[0], thL[0], thR[0]]), fixT = new Set([phL[0], phR[0]]);
    const freeB = [...Array(nb).keys()].filter((k) => !fixB.has(k));
    const freeT = [...Array(nt).keys()].filter((k) => !fixT.has(k));
    const sub = (M, N, free) => { const m = free.length, S = new Float64Array(m * m); free.forEach((r, i) => free.forEach((c, j) => (S[i * m + j] = M[r * N + c]))); return S; };
    const KbF = sub(Kb, nb, freeB), KtF = sub(Kt, nt, freeT);
    const LKb = cholesky(KbF, freeB.length), LKt = cholesky(KtF, freeT.length);
    const ub = new Float64Array(nb), ut = new Float64Array(nt);
    cholSolve(LKb, freeB.length, freeB.map((k) => fb[k])).forEach((v, i) => (ub[freeB[i]] = v));
    cholSolve(LKt, freeT.length, freeT.map((k) => ft[k])).forEach((v, i) => (ut[freeT[i]] = v));
    const out = { y: Array.from(nodes), w: wDof.map((k) => ub[k]), theta: thL.map((k) => ub[k]), phi: phL.map((k) => ut[k]) };
    if (o.modal !== false) {
      const nm = o.nModes || 3;
      const eb = generalizedEigen(KbF, sub(Mb, nb, freeB), freeB.length, nm);
      const et = generalizedEigen(KtF, sub(Mt, nt, freeT), freeT.length, nm);
      const shape = (vec, free, total, map) => {
        const full = new Float64Array(total);
        vec.forEach((v, i) => (full[free[i]] = v));
        const s = map.map((k) => full[k]);
        const mx = s.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0) || 1;
        return s.map((v) => v / mx);
      };
      out.fBending = eb.values.map((l) => Math.sqrt(Math.max(l, 0)) / (2 * Math.PI));
      out.fTorsion = et.values.map((l) => Math.sqrt(Math.max(l, 0)) / (2 * Math.PI));
      out.modesBending = eb.modes.map((v) => shape(v, freeB, nb, wDof));
      out.modesTorsion = et.modes.map((v) => shape(v, freeT, nt, phL));
    }
    return out;
  }
  function argmin(arr, v) {
    let k = 0, best = Infinity;
    for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i] - v); if (d < best) { best = d; k = i; } }
    return k;
  }

  // ------------------------------------------------------------------ buckling helpers
  function plateBucklingFlat(E, nu, t, a, b) {
    const r = a / b;
    let k = Infinity;
    for (let m = 1; m < 30; m++) k = Math.min(k, (m / r + r / m) ** 2);
    return ((k * Math.PI ** 2 * E) / (12 * (1 - nu * nu))) * (t / b) ** 2;
  }
  function cylinderBuckling(E, nu, t, R) {
    if (!isFinite(R)) return 0;
    const phi = Math.sqrt(R / t) / 16;
    const gamma = 1 - 0.901 * (1 - Math.exp(-phi));
    return (gamma * E * t) / (R * Math.sqrt(3 * (1 - nu * nu)));
  }

  // ------------------------------------------------------------------ the solver
  const sectionCache = new Map();
  function cachedSection(g, pla, rod, asm, y) {
    const key = JSON.stringify([g, pla.E, pla.nu, pla.rho, pla.G, rod.E, rod.rho, rod.G, asm.rodsBonded, y]);
    if (!sectionCache.has(key)) {
      if (sectionCache.size > 200) sectionCache.clear();
      sectionCache.set(key, analyseSection(g, pla, rod, asm, y));
    }
    return sectionCache.get(key);
  }

  function normalize(input = {}) {
    requestedElementCount(input);
    const g = makeGeometry(input.geometry || {});
    const pla = { ...MATERIALS.pla_upright, ...(input.pla || {}) };
    for(const k of ['E','rho','ft','fc','fs'])if(!Number.isFinite(pla[k])||pla[k]<=0)throw new Error(`Shell material ${k} must be finite and positive.`);
    if(!Number.isFinite(pla.nu)||pla.nu<0||pla.nu>=.5)throw new Error('Shell material nu must be 0 ≤ nu < 0.5.');
    const rod = { ...MATERIALS.rod_hobby, ...(input.rod || {}) };
    const asm = { ...DEFAULT_ASSEMBLY, ...(input.assembly || {}) };
    if(g.spars.length&&!asm.seamsBonded&&seams(g).length)throw new Error('Bonded spars require bonded module seams (or a one-piece shell). Dry-seam joint mechanics with spars are not validated.');
    const load = { ...DEFAULT_LOAD, selfWeight:false, ...(input.load || {}) };
    if(load.selfWeight&&!Geometry.closedTip(g)&&g.spars.some(s=>s.length<g.semiSpan-1e-8))throw Error('Self-weight currently requires full-span spars. Partial-span spar runout gravity needs a segmented mass integration model.');
    if(Geometry.closedTip(g))for(const s of g.spars)for(const key of ['E','nu','rho','ft','fc','fs'])if(Math.abs(s.material[key]-pla[key])>1e-7*Math.max(1,Math.abs(pla[key])))throw Error('Closed-tip integral spars must use the same material as the shell.');
    if(typeof load.selfWeight!=='boolean')throw Error('Include wing self-weight must be true or false.');
    if(load.selfWeight&&load.kind==='flight'&&load.inertiaRelief)throw Error('Choose self-weight or flight inertia relief, not both. Self-weight uses 1 g; inertia relief already includes wing mass at n g.');
    if (!g.rodFractions.length && !asm.seamsBonded && seams(g).length)
      throw new Error("Removing every rod from a dry multi-module joint disconnects the wing. Use the one-piece teaching wing or explicitly model bonded seams.");
    if (!["flight", "tip", "custom"].includes(load.kind)) throw new Error("Choose flight, tip or custom loading.");
    if (load.kind === "custom") {
      load.items = validateLoads(load.items, g.semiSpan);
      const essential=[...new Set([0,g.semiSpan,...seams(g),...ribStations(g),...(g.stations||[]).map(s=>s.eta*g.semiSpan),...load.items.flatMap(p=>loadStations(p,g.semiSpan))])].sort((a,b)=>a-b);
      for(let i=1;i<essential.length;i++) if(essential[i]-essential[i-1]<.1-1e-8) throw new Error("Keep distinct wing load boundaries at least 0.1 mm from each other, ribs, seams and ends, or use exactly the same station. This avoids degenerate beam elements.");
    }
    const crit = { ...DEFAULT_CRITERIA, ...(input.criteria || {}) };
    if(g.spars.length){
      const xs=[...new Set([0,g.semiSpan,...seams(g),...ribStations(g),...g.spars.map(s=>s.length),...(load.kind==='custom'?load.items.flatMap(p=>loadStations(p,g.semiSpan)):[])])].sort((a,b)=>a-b);
      for(let i=1;i<xs.length;i++)if(xs[i]-xs[i-1]<.1-1e-8)throw new Error('Keep distinct spar ends at least 0.1 mm from loads, ribs, seams and each other, or use exactly the same station.');
    }
    const nSections = input.nSections || 7;
    const ends=g.spars.filter(s=>s.length<g.semiSpan).flatMap(s=>[s.length,Math.min(g.semiSpan,s.length+.001)]);
    const ySec = [...new Set([...linspace(0, 0.95 * g.semiSpan, nSections),...ends,...(g.spars.length?[g.semiSpan]:[]),...(g.stations||[]).map(s=>s.eta*g.semiSpan)])].sort((a,b)=>a-b);
    const aero = input.aeroLoad == null ? null : normalizeAeroLoad(input.aeroLoad, g, load);
    return { g, pla, rod, asm, load, crit, nSections, ySec, aero };
  }
  // AeroStruct: six-component aerodynamic strip loads. Each row [y0, y1, Fx, Fy, Fz, Mx, My, Mz] is one strip's
  // pressure force (N) and moment about the aircraft origin (N mm); see aeroStripItem for how it is carried.
  const AERO_LIMITS = Object.freeze({ strips: 96, minWidth: .1 });
  function normalizeAeroLoad(raw, g, load) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('The aerodynamic load must be an object.');
    for (const k of Object.keys(raw)) if (!['kind', 'lineFraction', 'strips', 'label'].includes(k)) throw Error(`Unknown aerodynamic load field "${k}".`);
    if (raw.kind !== 'aeroStrips') throw Error('The aerodynamic load kind must be aeroStrips.');
    const L = g.semiSpan, f = raw.lineFraction;
    if (!Number.isFinite(f) || f < 0 || f > 1) throw Error('The aerodynamic load-line chord fraction must be between 0 and 1.');
    if (!Array.isArray(raw.strips) || raw.strips.length < 1 || raw.strips.length > AERO_LIMITS.strips) throw Error(`Give 1 to ${AERO_LIMITS.strips} aerodynamic strips.`);
    const strips = raw.strips.map((r, i) => { if (!Array.isArray(r) || r.length !== 8 || !r.every(Number.isFinite)) throw Error(`Aerodynamic strip ${i + 1} must be [y0, y1, Fx, Fy, Fz, Mx, My, Mz] with finite numbers (mm, N, N mm).`); return r.slice(); });
    strips.forEach((r, i) => {
      if (!(r[0] >= 0 && r[1] > r[0] && r[1] <= L)) throw Error(`Aerodynamic strip ${i + 1} must satisfy 0 ≤ y0 < y1 ≤ semi-span (${L} mm).`);
      if (r[1] - r[0] < AERO_LIMITS.minWidth - 1e-9) throw Error(`Aerodynamic strip ${i + 1} is narrower than ${AERO_LIMITS.minWidth} mm.`);
      if (i && r[0] < strips[i - 1][1]) throw Error('Aerodynamic strips must be ordered from root to tip without overlap.');
    });
    const essential = [0, L, ...seams(g), ...ribStations(g), ...(g.stations || []).map(s => s.eta * L), ...g.spars.map(s => s.length), ...(load.kind === 'custom' ? load.items.flatMap(p => loadStations(p, L)) : [])];
    for (const y of strips.flatMap(r => [r[0], r[1]])) for (const t of essential) if (t !== y && Math.abs(t - y) < .1 - 1e-8) throw Error(`Aerodynamic strip station y = ${+y.toFixed(4)} mm is within 0.1 mm of the structural station ${+t.toFixed(4)} mm: use exactly the same station or keep them at least 0.1 mm apart (avoids degenerate beam elements).`);
    return { kind: 'aeroStrips', lineFraction: f, strips, label: typeof raw.label === 'string' ? raw.label.slice(0, 200) : 'Aerodynamic panel load' };
  }
  // A strip carried as a uniform force intensity f = F / (y1 - y0) on the load line r(y) = transformPoint(y,
  // [fraction c(y), 0]) and a uniform couple intensity m = (M - (∫ r dy) x f) / (y1 - y0): then ∫ f dy = F and
  // ∫ (r x f + m) dy = M exactly (to the adaptive quadrature tolerance of ∫ r dy), so the force and the moment of
  // the strip about ANY point are reproduced.
  function aeroStripItem(r, index, fraction, g, last) {
    const [y0, y1] = r, h = y1 - y0, f = [r[2] / h, r[3] / h, r[4] / h];
    const R = Array.from(Frame.integrate((y) => Geometry.transformPoint(g, y, [fraction * chordAt(g, y), 0]), y0, y1, 1e-13)), c = Frame.cross(R, f);
    return { kind: 'aeroStrip', index, start: y0, end: y1, fraction, last, f, m: [(r[5] - c[0]) / h, (r[6] - c[1]) / h, (r[7] - c[2]) / h], force: r.slice(2, 5), moment: r.slice(5, 8) };
  }
  // Prescribed global-z lift uses exactly the existing distributed-load integration.
  // This is not an aerodynamic prediction and does not include inertia relief.
  function chordLoadTable(g,total,fraction){
    const points=linspace(0,g.semiSpan,31).map(y=>[y,chordAt(g,y)]),area=points.slice(1).reduce((sum,p,i)=>sum+(p[0]-points[i][0])*(p[1]+points[i][1])/2,0);
    return {...Profiles.normalizeTable({points:points.map(p=>[p[0],p[1]*total/area])},{min:0,max:g.semiSpan,lengthUnit:'mm'}),fraction};
  }
  function prescribedFlightLoads(load,g) {
    const L=g.semiSpan,total=load.aircraftMass*load.loadFactor*GRAV/2,fraction=load.liftFraction;
    if(load.inertiaRelief)throw Error('Spatial inertia relief is not validated; choose Ignored.');
    let item;
    if(load.distribution==='tip')item={kind:'point',position:L,force:total,fraction};
    else if(load.distribution==='elliptic')item={kind:'elliptic',start:0,end:L,shape:'start',total,fraction};
    else if(load.distribution==='schrenk')item={kind:'schrenk',total,fraction};
    else if(load.distribution==='uniform')item={kind:'distributed',start:0,end:L,qStart:total/L,qEnd:total/L,fraction};
    else if(load.distribution==='planform'&&g.planform==='elliptic')item=chordLoadTable(g,total,fraction);
    else if(load.distribution==='planform'){const area=(g.rootChord+g.tipChord)*L/2;item={kind:'distributed',start:0,end:L,qStart:total*g.rootChord/area,qEnd:total*g.tipChord/area,fraction};}
    else throw Error('Choose elliptic, Schrenk, uniform, planform or tip lift.');
    return validateLoads([item],L);
  }
  // Integrate the section mass model with four-point Gauss quadrature per
  // section interval. Each quadrature force is applied at the true local mass
  // centroid and transferred consistently to the beam; no artificial FE nodes.
  function loadWithSelfWeight(source,g,pla,sections,ys,extrapolate=false){
    if(!source.selfWeight)return source;
    const L=g.semiSpan,lookup=extrapolate?interpLin:interp,stations=[...new Set([0,...ys,L])].sort((a,b)=>a-b),at=(k,y)=>lookup(y,ys,sections.map(s=>s[k]));
    const gravity=[],add=(y,mass,x,z)=>{if(mass>0)gravity.push({kind:'point',position:y,force:-mass*GRAV/1000,fraction:x/chordAt(g,y),localPoint:[x,z],gravity:true});};
    const gx=[-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526],gw=[.3478548451374538,.6521451548625461,.6521451548625461,.3478548451374538];
    for(let i=1;i<stations.length;i++){const a=stations[i-1],b=stations[i];for(let j=0;j<4;j++){const y=(a+b)/2+(b-a)*gx[j]/2,m=at('mass',y),first=k=>lookup(y,ys,sections.map(s=>s.mass*s[k]));add(y,m*(b-a)*gw[j]/2,first('cgx')/m,first('cgz')/m);}}
    const rho=pla.rho/1000;
    for(const y of ribStations(g))add(y,rho*g.ribThickness*at('ribExtra',y),at('ribExtraCgx',y),at('ribExtraCgz',y));
    for(const y of [0,L])add(y,rho*g.cap*at('ribExtra',y),at('ribExtraCgx',y),at('ribExtraCgz',y));
    if(source.tipMass)add(L,source.tipMass,source.tipFraction*g.tipChord,0);
    const base=source.kind==='custom'?source.items:source.kind==='flight'?prescribedFlightLoads(source,g):[{kind:'point',position:L,force:source.tipForce,fraction:source.tipFraction}];
    const weightN=-gravity.reduce((sum,p)=>sum+p.force,0),appliedN=customResultants(base,g,0).V;
    return {...source,kind:'custom',items:[...base,...gravity],sourceLoad:source,gravitySummary:{weightN,appliedN,netN:appliedN-weightN,quadrature:'4-point Gauss per section interval; rib/cap and sensor masses concentrated at their section centroids'}};
  }
  function validateLoads(items, L) {
    if (!Array.isArray(items) || items.length > 12) throw new Error("Use a list of at most 12 loads.");
    const out = items.map((p, i) => {
      const r = { ...p, fraction: p.fraction == null ? .3 : p.fraction };
      if (!Number.isFinite(r.fraction) || r.fraction < 0 || r.fraction > 1) throw new Error("Load chord fraction must be between 0 and 1.");
      if (r.kind === "point") {
        if (!Number.isFinite(r.position) || r.position <= 0 || r.position > L || !Number.isFinite(r.force)) throw new Error("Wing point loads need 0 < station ≤ span and a finite force. A force applied exactly at the fixed root acts directly on the support; use the beam lesson for that case.");
      } else if (r.kind === "distributed") {
        if (![r.start,r.end,r.qStart,r.qEnd].every(Number.isFinite) || r.start < 0 || r.end > L || r.end <= r.start) throw new Error("Distributed load needs 0 ≤ start < end ≤ span and finite end intensities.");
      } else if (r.kind === "elliptic" || r.kind === "parabolic") {
        return { ...Profiles.normalizeCurve(r, { min: 0, max: L, lengthUnit: "mm", name: `Wing load ${i + 1} (${r.kind})` }), fraction: r.fraction };
      } else if (r.kind === "table") {
        const t = Profiles.normalizeTable(r, { min: 0, max: L, lengthUnit: "mm", allowFraction: true, name: `Wing load ${i + 1} (table)` });
        return { ...t, fraction: r.fraction };
      } else if (r.kind === "schrenk") {
        if (!Number.isFinite(r.total)) throw new Error("A Schrenk load needs a finite total force F (N).");
        return { kind: "schrenk", total: r.total, fraction: r.fraction };
      } else throw new Error("Choose point, distributed, elliptic, parabolic, table or Schrenk loading.");
      return r;
    });
    const segments = Profiles.segmentCount(out);
    if (segments > Profiles.LIMITS.segments) throw new Error(`Use at most ${Profiles.LIMITS.segments} load segments (each load is one, a table counts its rows − 1); this case has ${segments}.`);
    return out;
  }
  // Load stations that must be beam-element boundaries (exact consistent loads, no element straddles a kink).
  const loadStations = (p, L) => p.kind === "point" ? [p.position] : p.kind === "table" ? p.points.map((r) => r[0]) : p.kind === "schrenk" ? [0, L] : [p.start, p.end];
  // The two halves of a Schrenk load as engine primitives: chord-proportional (sampled for a curved planform) and elliptic.
  function schrenkParts(p, g) {
    const L = g.semiSpan, S = Geometry.area(g), F = p.total;
    return [
      g.planform==='elliptic'?chordLoadTable(g,.5*F,p.fraction):{ kind: "distributed", start: 0, end: L, qStart: (0.5 * F * g.rootChord) / S, qEnd: (0.5 * F * g.tipChord) / S },
      Profiles.normalizeCurve({ kind: "elliptic", start: 0, end: L, shape: "start", total: 0.5 * F }, { min: 0, max: L, lengthUnit: "mm" }),
    ];
  }
  /** Intensity (N/mm) and chord fraction of a distributed custom load at y. */
  function customLine(p, g, y) {
    if (p.kind === "schrenk") return schrenkParts(p, g).reduce((q, part) => q + Profiles.valueAt(part, y), 0);
    return Profiles.valueAt(p, y);
  }
  const customFraction = (p, y) => Profiles.fractionAt(p, y);
  function customResultants(items, g, y) {
    let V = 0, M = 0, X = 0;
    for (const p of items) {
      if (p.kind === "point") {
        if (p.position >= y) { V += p.force; M += p.force * (p.position-y); X += p.force * p.fraction * chordAt(g,p.position); }
      } else if (p.kind === "distributed") {
        const a = Math.max(y,p.start), b = p.end;
        if (b <= a) continue;
        const k = (p.qEnd-p.qStart)/(p.end-p.start), c = p.qStart-k*p.start;
        const F = c*(b-a)+k*(b*b-a*a)/2, Y = c*(b*b-a*a)/2+k*(b**3-a**3)/3;
        V += F; M += Y-y*F;
        X += p.fraction*(g.rootChord*F+(g.tipChord-g.rootChord)/g.semiSpan*Y);
      } else {
        // Curved, table and Schrenk loads: exact ∫w and ∫(η − y)w over the outboard part; chord is linear in y.
        const parts = p.kind === "schrenk" ? schrenkParts(p, g) : [p];
        const kc = (g.tipChord - g.rootChord) / g.semiSpan;
        for (const q of parts) {
          const [F, Mo] = Profiles.integrals(q, y, Infinity, y);
          if (!F && !Mo) continue;
          V += F; M += Mo;
          if (q.kind === "table" && q.points[0].length === 3) X += Profiles.weighted(q, y, Infinity, (eta) => customFraction(q, eta) * chordAt(g, eta));
          else X += p.fraction * (g.rootChord * F + kc * (Mo + y * F));
        }
      }
    }
    return { V, M, X };
  }
  // Progressive solving for a responsive interface: analyse station k now, solve() reuses it.
  const stations = (input) => {const n=normalize(input);return Geometry.closedTip(n.g)?[]:n.ySec;};
  function warmStation(input, k) {
    const n = normalize(input);
    const cap=analysisCapability(n.g,input);if(!cap.supported)throw Error(cap.message);
    if(Geometry.closedTip(n.g))return null;
    return cachedSection(n.g, n.pla, n.rod, n.asm, n.ySec[k]);
  }
  function sectionAt(input, y) {
    const n = normalize(input);
    if(Geometry.closedTip(n.g))throw Error('The hollow-section torsion/warping detail is unavailable for exact-tip stress studies, including their solid tip region. Use the nominal section-stress result.');
    const station=Math.min(Math.max(y,0),n.g.semiSpan),sec=cachedSection(n.g,n.pla,n.rod,n.asm,station);return {...sec,...finiteSectionTorsion(input,n.g,n.pla,station,[[1,0],[0,1]],sec.GJ)};
  }

  function solve(input = {}) {
    const normalized=normalize(input),{ g, pla, rod, asm, load:sourceLoad, crit, ySec } = normalized;
    let load=sourceLoad;
    const capability=analysisCapability(g,input);
    if(!capability.supported)throw Error(capability.message);
    if(Geometry.closedTip(g))return solveClosedTipStress(input);
    if(capability.requires3D)return solveSpatial(input,normalized);
    const nGrid = input.nGrid || 901, nElem = requestedElementCount(input);
    const L = g.semiSpan;
    const seamsActive = asm.seamsBonded ? [] : seams(g);
    const ribs = ribStations(g);
    const sections = ySec.map((y) => {const sec=cachedSection(g,pla,rod,asm,y);return {...sec,...finiteSectionTorsion(input,g,pla,y,[[1,0],[0,1]],sec.GJ)};});
    load=loadWithSelfWeight(sourceLoad,g,pla,sections,ySec,true);
    const col = (k) => sections.map((s) => s[k]);
    const loadNodes = load.kind === "custom" ? load.items.filter(p=>!p.gravity).flatMap(p => loadStations(p, L)) : [];
    const profileNodes=(g.stations||[]).map(s=>s.eta*L);
    const sparEnds=g.spars.map(s=>s.length);
    const yset = new Set([...linspace(0, L, nGrid), ...seams(g), ...ribs, ...loadNodes,...sparEnds,...profileNodes,...(sourceLoad.selfWeight?ySec:[])].map((v) => +v.toFixed(9)));
    const y = Float64Array.from([...yset].sort((a, b) => a - b));
    // Never smear a spar runout into the next bay: interpolate only within the
    // same active-spar segment. End values are inboard limits.
    const active=q=>g.spars.map(s=>q<=s.length+1e-8?1:0).join('');
    const sectionValue=(k,q,log=false)=>{
      if(!g.spars.length)return log?interpLog(q,ySec,col(k)):interpLin(q,ySec,col(k));
      const ids=ySec.map((v,i)=>active(v)===active(q)?i:-1).filter(i=>i>=0),xp=ids.map(i=>ySec[i]),fp=ids.map(i=>sections[i][k]);
      if(!ids.length)throw Error('No section in the spar segment.');
      return log?Math.exp(interp(q,xp,fp.map(Math.log))):interp(q,xp,fp);
    };
    const lin = (k) => (yy) => sectionValue(k,yy);
    const P = {};
    P.chord = y.map((v) => chordAt(g, v));
    for (const k of ["xsc", "xc", "zc", "zTop", "zBot", "mass", "cgx", "polarInertia", "skinWidth", "skinRadius", "EIrods", "rodArea","sparMass","bendCoupling"]) P[k] = y.map(lin(k));
    P.EI = y.map((v) => sectionValue('EIf',v,true));
    P.GJ = y.map((v) => sectionValue('GJ',v,true));

    // mass
    const rho = pla.rho * 1e-3;
    const ribMass = ribs.map((r) => rho * g.ribThickness * lin("ribExtra")(r));
    const ribCg = ribs.map((r) => lin("ribCgx")(r));
    const ribPolar = ribs.map((r) => rho * g.ribThickness * lin("ribPolar")(r));
    const capMass = [0, L].map((r) => rho * g.cap * lin("ribExtra")(r));
    const plaLine = y.map((v, i) => P.mass[i] - rod.rho * 1e-3 * P.rodArea[i]-P.sparMass[i]);
    const shellMass = trapz(plaLine, y);
    const rodsMass = rod.rho * 1e-3 * g.rodFractions.length * Math.PI * rodRadius(g) ** 2 * L;
    const mass = { shell: shellMass, ribs: ribMass.reduce((a, b) => a + b, 0), caps: capMass[0] + capMass[1] };
    mass.printed = mass.shell + mass.ribs + mass.caps;
    mass.rods = rodsMass;
    mass.spars=trapz(P.sparMass,y);
    mass.tip = load.tipMass;
    mass.total = mass.printed + mass.rods + mass.spars + load.tipMass;

    // loads (upward +, N/mm and N)
    let w = new Float64Array(y.length), wx = new Float64Array(y.length);
    const point = []; // [y, F, x]
    const liftN = (load.loadFactor * load.aircraftMass * GRAV) / 2;
    if (load.kind === "flight") {
      if (load.distribution === "tip") point.push([L, liftN, load.liftFraction * g.tipChord]);
      else {
        const S = 0.5 * (g.rootChord + g.tipChord) * L;
        w = y.map((v, i) => {
          const ell = ((4 * liftN) / (Math.PI * L)) * Math.sqrt(Math.max(0, 1 - (v / L) ** 2));
          const plan = (liftN * P.chord[i]) / S;
          return { elliptic: ell, planform: plan, uniform: liftN / L, schrenk: 0.5 * (ell + plan) }[load.distribution];
        });
      }
      wx = w.map((v, i) => v * load.liftFraction * P.chord[i]);
      if (load.inertiaRelief) {
        const gn = load.loadFactor * GRAV * 1e-3;
        w = w.map((v, i) => v - gn * P.mass[i]);
        wx = wx.map((v, i) => v - gn * P.mass[i] * P.cgx[i]);
        ribs.forEach((r, k) => point.push([r, -gn * ribMass[k], ribCg[k]]));
        point.push([L, -gn * capMass[1], lin("ribCgx")(L)]);
        if (load.tipMass) point.push([L, -gn * load.tipMass, load.tipFraction * g.tipChord]);
      }
    } else if (load.kind === "custom") {
      for (const p of load.items) {
        if (p.kind === "point") point.push([p.position,p.force,p.fraction*chordAt(g,p.position)]);
        else if (p.kind === "distributed") { for (let i=0;i<y.length;i++) if (y[i]>=p.start && y[i]<=p.end) {
          const q=p.qStart+(p.qEnd-p.qStart)*(y[i]-p.start)/(p.end-p.start);
          w[i]+=q; wx[i]+=q*p.fraction*chordAt(g,y[i]);
        } }
        else for (let i=0;i<y.length;i++) { const q=customLine(p,g,y[i]); if (q) { w[i]+=q; wx[i]+=q*(p.kind==="table"?customFraction(p,y[i]):p.fraction)*chordAt(g,y[i]); } }
      }
    } else {
      point.push([L, load.tipForce, load.tipFraction * g.tipChord]);
    }
    const Q0 = fromTip(w, y), Q1 = fromTip(w.map((v, i) => v * y[i]), y), X = fromTip(wx, y);
    const V = Float64Array.from(Q0), M = Q1.map((v, i) => v - y[i] * Q0[i]), Xall = Float64Array.from(X);
    for (const [yp, F, xp] of point)
      for (let i = 0; i < y.length; i++)
        if (y[i] <= yp + 1e-9) { V[i] += F; M[i] += F * (yp - y[i]); Xall[i] += F * xp; }
    if (load.kind === "custom") y.forEach((v,i) => { const a=customResultants(load.items,g,v); V[i]=a.V; M[i]=a.M; Xall[i]=a.X; });
    const T = y.map((v, i) => P.xsc[i] * V[i] - Xall[i]);
    const appliedForce = load.kind === "custom" ? customResultants(load.items,g,0).V : trapz(w, y) + point.reduce((s, p) => s + p[1], 0);
    const appliedMoment = load.kind === "custom" ? customResultants(load.items,g,0).M : trapz(w.map((v, i) => v * y[i]), y) + point.reduce((s, p) => s + p[1] * p[0], 0);

    // dry-seam springs
    const Irod = (Math.PI * g.rodDiameter ** 4) / 64;
    const nr = g.rodFractions.length;
    const Lf = asm.seamFreeLength != null ? asm.seamFreeLength : 2 * g.interfaceOffset;
    const kBend = (nr * rod.E * Irod) / Lf;
    const kTorsAt = (ys) =>
      nr === 2
        ? (6 * rod.E * Irod * (Math.abs(g.rodFractions[1] - g.rodFractions[0]) * chordAt(g, ys)) ** 2) / Lf ** 3
        : (shearModulus(rod) * Math.PI * g.rodDiameter ** 4) / 32 / Lf;

    // direct integration
    const kappa = M.map((v, i) => v / P.EI[i]);
    const slope = cumFromRoot(kappa, y);
    const twist = cumFromRoot(T.map((v, i) => v / P.GJ[i]), y);
    if(load.kind==='custom') {
      // Integrate over each load boundary with interior quadrature, not an average
      // across a point-torque jump. This also handles loads close to the root.
      const gx=[.0694318442029737,.330009478207572,.669990521792428,.930568155797026],gw=[.173927422568727,.326072577431273,.326072577431273,.173927422568727];
      twist[0]=0;
      for(let i=1;i<y.length;i++) { const h=y[i]-y[i-1];let inc=0;for(let k=0;k<4;k++){const q=y[i-1]+h*gx[k],rr=customResultants(load.items,g,q);inc+=gw[k]*(lin('xsc')(q)*rr.V-rr.X)/sectionValue('GJ',q,true);}twist[i]=twist[i-1]+h*inc; }
    }
    const seamRot = [];
    for (const s of seamsActive) {
      const Ms = interp(s, y, M), Ts = interp(s, y, T);
      const dth = Ms / kBend, dph = Ts / kTorsAt(s);
      for (let i = 0; i < y.length; i++) if (y[i] > s + 1e-9) { slope[i] += dth; twist[i] += dph; }
      seamRot.push({ y: s, M: Ms, T: Ts, dtheta: dth, dphi: dph });
    }
    const deflection = cumFromRoot(slope, y);
    const chordwiseDeflection=g.spars.length?cumFromRoot(cumFromRoot(y.map((_,i)=>-P.bendCoupling[i]*kappa[i]),y),y):new Float64Array(y.length);
    const bounds = moduleBounds(g);
    let freePlay = 0;
    if (!asm.seamsBonded)
      seams(g).forEach((s, i) => {
        const la = bounds[i + 1] - bounds[i], lb = bounds[i + 2] - bounds[i + 1];
        freePlay += 2 * g.clearance * (1 / la + 1 / lb) * (L - s);
      });

    // 1-D FEM: static and modal
    const mandatory=[0,L,...seams(g),...ribs,...loadNodes,...sparEnds,...profileNodes];
    const regular=linspace(0,L,nElem+1).filter(v=>load.kind!=='custom'||!mandatory.some(p=>Math.abs(v-p)<.1));
    const nodeSet = new Set([...regular,...mandatory].map((v) => +v.toFixed(9)));
    const nodes = [...nodeSet].sort((a, b) => a - b);
    const mesh={requestedElements:nElem,actualElements:nodes.length-1,nodeCount:nodes.length,mandatorySpanStations:[...new Set(mandatory)].sort((a,b)=>a-b)};
    const EIf = (q) => sectionValue('EIf',q,true);
    const GJf = (q) => sectionValue('GJ',q,true);
    const mf = (q) => interp(q, y, P.mass), Ipf = (q) => interp(q, y, P.polarInertia);
    // Polynomial and table loads go through wLine (4-point Gauss, exact for these degrees because every load
    // station is an element boundary); elliptic parts get exact consistent nodal loads through wNodal.
    const ellipticParts = load.kind === "custom" ? load.items.flatMap(p => p.kind === "elliptic" ? [p] : p.kind === "schrenk" ? [schrenkParts(p, g)[1]] : []) : [];
    const wf = load.kind === "custom" ? q => load.items.reduce((sum,p) => sum + (p.kind === "distributed" && q>=p.start && q<=p.end ? p.qStart+(p.qEnd-p.qStart)*(q-p.start)/(p.end-p.start)
      : p.kind === "parabolic" || p.kind === "table" ? Profiles.valueAt(p, q) : p.kind === "schrenk" ? Profiles.valueAt(schrenkParts(p, g)[0], q) : 0),0) : q => interp(q,y,w);
    const wNodal = ellipticParts.length ? (y0, h) => ellipticParts.reduce((acc, part) => { const f = Profiles.hermiteNodal(part, y0, h); return acc.map((v, k) => v + f[k]); }, [0, 0, 0, 0]) : null;
    const pointTorques = point.map(([yp, F, xp]) => [yp, F * (interp(yp, y, P.xsc) - xp)]);
    const Tpoint = new Float64Array(y.length);
    point.forEach(([yp], k) => { for (let i = 0; i < y.length; i++) if (y[i] <= yp + 1e-9) Tpoint[i] += pointTorques[k][1]; });
    const Td = T.map((v, i) => v - Tpoint[i]);
    const tDist = y.map((_, i) => {
      // numpy.gradient (second order inside, first order at the ends)
      if (i === 0) return -(Td[1] - Td[0]) / (y[1] - y[0]);
      if (i === y.length - 1) return -(Td[i] - Td[i - 1]) / (y[i] - y[i - 1]);
      const h1 = y[i] - y[i - 1], h2 = y[i + 1] - y[i];
      return -((h1 * h1 * Td[i + 1] - h2 * h2 * Td[i - 1] + (h2 * h2 - h1 * h1) * Td[i]) / (h1 * h2 * (h1 + h2)));
    });
    const tf = (q) => interp(q, y, tDist);
    const lumped = ribs.map((r, k) => [r, ribMass[k]]).concat([[L, capMass[1] + load.tipMass]]);
    const lumpedI = ribs.map((r, k) => [r, ribPolar[k]]);
    const kb = seamsActive.length ? kBend : Infinity;
    const fem = beamFEM(nodes, EIf, GJf, mf, Ipf, {
      seams: seamsActive, kBend: kb, kTors: kTorsAt, wLine: wf, wNodal, tLine: tf,
      pointForces: point.map(([yp, F]) => [yp, F]), pointTorques, pointMasses: lumped, pointInertias: lumpedI,
      pointTorquesOutboard: load.kind==='custom',
    });
    const unit = beamFEM(nodes, EIf, GJf, mf, Ipf, { seams: seamsActive, kBend: kb, kTors: kTorsAt, pointForces: [[L, 1]], modal: false });
    const rigid = cumFromRoot(cumFromRoot(y.map((v, i) => (L - v) / P.EI[i]), y), y);
    const stiffness = {
      tip: 1 / unit.w[unit.w.length - 1],
      rigidSeams: 1 / rigid[rigid.length - 1],
      rootHand: (3 * sections[0].EIf) / L ** 3,
      freePlay,
    };

    // stresses at limit load
    const Ep = pla.E, t = g.skin;
    let sigTop = y.map((_, i) => -Ep * kappa[i] * (P.zTop[i] - P.zc[i]));
    let sigBot = y.map((_, i) => -Ep * kappa[i] * (P.zBot[i] - P.zc[i]));
    if(g.spars.length){
      const ext=y.map((v,i)=>{const a=outerContour(g,v,49).map(([x,z])=>-Ep*kappa[i]*((z-P.zc[i])-P.bendCoupling[i]*(x-P.xc[i])));return [Math.min(...a),Math.max(...a)];});
      sigTop=y.map((_,i)=>ext[i][0]);sigBot=y.map((_,i)=>ext[i][1]);
    }
    const skinTop = y.map((_, i) => -Ep * kappa[i] * (P.zTop[i] - t / 2 - P.zc[i]));
    const skinBot = y.map((_, i) => -Ep * kappa[i] * (P.zBot[i] + t / 2 - P.zc[i]));
    const skinComp = y.map((_, i) => g.spars.length?Math.max(0,-sigTop[i],-sigBot[i]):Math.max(Math.max(-skinTop[i], 0), Math.max(-skinBot[i], 0)));
    const sup = skinSupports(g);
    const bay = y.map((v) => {
      if (v >= L) return sup[sup.length - 1] - sup[sup.length - 2];
      let k = 0;
      while (k < sup.length - 1 && sup[k + 1] <= v) k++;
      return sup[k + 1] - sup[k];
    });
    const sigFlat = y.map((_, i) => plateBucklingFlat(Ep, pla.nu, t, bay[i], P.skinWidth[i]));
    const sigCyl = y.map((_, i) => cylinderBuckling(Ep, pla.nu, t, P.skinRadius[i]));
    const sigCr = y.map((_, i) => Math.max(sigFlat[i], sigCyl[i]));
    const rr = rodRadius(g);
    let sigRod;
    if (!nr) sigRod = new Float64Array(y.length);
    else if (asm.rodsBonded) {
      const off = sections.map((s) => Math.max(...rodCentres(g, s.y).map(([, z]) => Math.abs(z - s.zc))));
      sigRod = y.map((v, i) => rod.E * Math.abs(kappa[i]) * (interpLin(v, ySec, off) + rr));
    } else sigRod = y.map((_, i) => rod.E * Math.abs(kappa[i]) * rr);

    // shear stress at analysis stations (2-D FE, away from the sharp cavity corners)
    const tau = [], tauPeak = [],sparStress=[];
    sections.forEach((s) => {
      const Vs = interp(s.y, y, V), Ts = interp(s.y, y, T);
      const fld = shearField(s, Vs, Ts, g);
      tau.push(fld.nominal);
      tauPeak.push(fld.peak);
      if(s.sparNetwork){
        const curvature=interp(s.y,y,kappa),stress=(p,E)=>-E*curvature*((p[1]-s.zc)-s.bendCoupling*(p[0]-s.xc));
        s.sparInts.forEach(p=>{const values=p.polygon.map(v=>stress(v,p.m.E)),shear=fld.spar.filter(v=>v.index===p.index&&v.kind===p.kind).map(v=>v.tau);sparStress.push({y:s.y,index:p.index,kind:p.kind,tension:Math.max(0,...values),compression:Math.max(0,...values.map(v=>-v)),shear:Math.max(0,...shear),material:p.m});});
      }
    });
    const tauBredt = sections.map((s) => Math.abs(interp(s.y, y, T)) / (2 * s.bredtArea * t));

    // checks
    const F = load.fos;
    const checks = [];
    const ribBearing = [];
    const add = (name, demand, capacity, unit, at, basis, group) => checks.push({ name, demand, capacity, unit, at, basis, group, U: capacity > 0 ? demand / capacity : Infinity });
    const tens = y.map((_, i) => Math.max(sigTop[i], sigBot[i]));
    const comp = y.map((_, i) => Math.max(-sigTop[i], -sigBot[i]));
    const iT = argmaxArr(tens), iC = argmaxArr(comp);
    add("PLA tension (bending)", F * Math.max(tens[iT], 0), pla.ft, "MPa", y[iT], `FoS ${F} × limit stress vs tensile strength`, "strength");
    add("PLA compression (bending)", F * Math.max(comp[iC], 0), pla.fc, "MPa", y[iC], `FoS ${F} × limit stress vs compressive strength`, "strength");
    const kTau = argmaxArr(tau);
    add("PLA shear (transverse shear + torsion, 2-D FE)", F * tau[kTau], pla.fs, "MPa", ySec[kTau], "Max nominal resultant shear away from sharp cavity corners", "strength");
    if(g.spars.length){checks.at(-1).name='Shell shear · bonded thin-wall network';checks.at(-1).basis='Equilibrium + minimum shear energy; thin-wall approximation, not local joint stress';}
    for(let j=0;j<g.spars.length;j++)for(const kind of ['top cap','bottom cap','web'])for(const [quantity,capacity]of [['tension','ft'],['compression','fc'],['shear','fs']]){
      const a=sparStress.filter(v=>v.index===j&&v.kind===kind),v=a.reduce((u,v)=>!u||v[quantity]>u[quantity]?v:u,null);
      if(v)add(`Spar ${j+1} ${kind} · ${quantity}`,F*v[quantity],v.material[capacity],'MPa',v.y,quantity==='shear'?'Bonded thin-wall shear-flow network; local adhesive/runout/crippling not resolved':'Compatible elastic strain about E-weighted neutral axes; cap/web material allowable','spar');
    }
    const ratio = y.map((_, i) => skinComp[i] / sigCr[i]);
    const iB = argmaxArr(ratio);
    add("Skin compression buckling (screening)", F * skinComp[iB], sigCr[iB], "MPa", y[iB], "max(flat plate between ribs, SP-8007 knocked-down cylinder)", "stability");
    if (!asm.seamsBonded && seams(g).length) {
      let worst = null;
      for (const s of seams(g)) {
        const Ms = Math.abs(interp(s, y, M)), Vs = Math.abs(interp(s, y, V));
        const rodSig = ((Ms / nr) * rr) / Irod;
        const inner = s - g.interfaceOffset, outer = s + g.interfaceOffset;
        const leverA = inner - Math.max(...sup.filter((v) => v < inner - 1e-6));
        const leverB = Math.min(...sup.filter((v) => v > outer + 1e-6)) - outer;
        const bearing = (Ms / nr) / Math.min(leverA, leverB) / (g.rodDiameter * g.ribThickness);
        for (const [station,lever] of [[inner,leverA],[outer,leverB]]) ribBearing.push({station,seam:s,forcePerRod:Ms/nr/lever,stress:Ms/nr/lever/(g.rodDiameter*g.ribThickness)});
        const dowel = ((4 / 3) * (Vs / nr)) / (Math.PI * rr * rr);
        if (!worst || rodSig > worst[1]) worst = [s, rodSig, bearing, dowel];
      }
      const [s, rodSig, bearing, dowel] = worst;
      add("Rod bending at dry seam (rods carry the whole moment)", F * rodSig, Math.min(rod.ft, rod.fc), "MPa", s, "σ = (M/n) r / I_rod", "joint");
      add("Rib-hole bearing at dry seam (screening)", F * bearing, pla.fc, "MPa", s, "rod moment reacted by a force couple between interface rib and next rib", "joint");
      add("Rod dowel shear at dry seam", F * dowel, rod.fs, "MPa", s, "4V/(3 n π r²)", "joint");
    } else if (nr) {
      const iR = argmaxArr(sigRod);
      add("Rod bending (rods follow the shell curvature)", F * sigRod[iR], Math.min(rod.ft, rod.fc), "MPa", y[iR], "E_rod × curvature × fibre distance", "joint");
    }
    if (asm.seamsBonded && seams(g).length) {
      const joint = seams(g).map((s) => Math.max(interp(s, y, tens), 0));
      const k = argmaxArr(joint);
      add("Bonded seam butt-joint tension", F * joint[k], asm.adhesiveTensile, "MPa", seams(g)[k], "Bending tension across the epoxy joint", "joint");
    }
    add("Tip deflection at limit load", Math.abs(deflection[deflection.length - 1]), crit.maxTipDeflection, "mm", L, "Stiffness criterion (limit load, no FoS)", "stiffness");
    add("Tip twist at limit load", Math.abs((twist[twist.length - 1] * 180) / Math.PI), crit.maxTipTwist, "deg", L, "Stiffness criterion (limit load, no FoS)", "stiffness");
    const governing = checks.reduce((a, b) => (b.U > a.U ? b : a));
    if(pla.key==='custom_shell')checks.forEach(c=>{if(c.name.startsWith('PLA '))c.name='Shell '+c.name.slice(4);});

    const verification = {
      rootShearError: Math.abs(V[0] - appliedForce) / Math.max(Math.abs(appliedForce), 1e-12),
      rootMomentError: Math.abs(M[0] - appliedMoment) / Math.max(Math.abs(appliedMoment), 1e-12),
      deflectionMethodsDiff: Math.abs(deflection[deflection.length - 1] - fem.w[fem.w.length - 1]) / Math.max(Math.abs(fem.w[fem.w.length - 1]), 1e-12),
      twistMethodsDiff: Math.abs(twist[twist.length - 1] - fem.phi[fem.phi.length - 1]) / Math.max(Math.abs(fem.phi[fem.phi.length - 1]), 1e-12),
      bredtRatioRoot: sections[0].Jbredt / sections[0].Jfe,
      bredtRatioTip: sections[sections.length - 1].Jbredt / sections[sections.length - 1].Jfe,
      principalAngleMax: Math.max(...sections.map((s) => Math.abs(s.principal))),
    };

    return {
      version: VERSION, geometry: g, pla, rod, assembly: asm, load, criteria: crit, sections, ySec,
      y, props: P, w, point, V, M, T, kappa, slope, deflection,chordwiseDeflection, twist, fem, mesh, seamsActive, seamRot,
      seam: { kBend, freeLength: Lf, freePlay: asm.seamsBonded ? 0 : freePlay },
      ribs, seams: seams(g), mass, stiffness, liftN, appliedForce, appliedMoment,
      stress: { sigTop, sigBot, skinComp, sigCr, sigFlat, sigCyl, sigRod, tau, tauPeak, tauBredt,spars:sparStress },
      sparModel:g.spars.length?{method:'Bonded thin-wall beam: transformed section bending + energy-compatible shear-flow network',limitations:['Perfect continuous bond; adhesive stress and debonding not calculated','Sectionwise locally prismatic shear flow; no 3-D taper/runout stress','Cap/web local buckling, crippling and spar runout stresses unresolved','Independent normal/shear allowable checks; combined material failure interaction not resolved','Open-cap local Saint-Venant torsion neglected','Modes are uncoupled beam modes, not a coupled 3-D flutter spectrum','Mixed rod/spar joint model not validated; compare them separately'],rootNetwork:sections[0].sparNetwork.method}:null,
      checks, governing, verification, ribBearing,
    };
  }

  // Spatial extension. The legacy straight-wing route above is deliberately
  // unchanged. Normal cuts are affine projections of aircraft x-z sections;
  // dA_normal = |t_y| dA_xz and ds = dy/|t_y| preserve physical volume.
  function solveClosedTipStress(input){
    if(!ClosedTipStress)throw Error('Load wing_closed_tip_stress.js before engine.js for exact-tip section stress.');
    return ClosedTipStress.solve(input,{E:{ringLoops,outerContour,cavityTipLimit,ribStations,seams,sparParts,sparWidthBreaks,verticalOrdinates},normalize,polyIntegrals,prescribedFlightLoads,customLine,customFraction,Geometry,Frame,GRAV,Profiles,chordAt,airfoilAt,requestedElementCount});
  }
  function finiteSectionTorsion(input,g,pla,y,B,previous){
    const parts=sparParts(g,y);if(!parts.length)return {GJ:previous,torsionSection:{method:'existing shell warping FE',finiteWall:false}};
    if(input.finiteSectionTorsion!==true)return {GJ:previous,torsionSection:{method:'thin-wall network',finiteWall:false}};
    const G=shearModulus(pla),partG=parts.map(p=>shearModulus(p.s.material));
    if(partG.some(v=>Math.abs(v-G)>1e-12*G))return {GJ:previous,torsionSection:{method:'multi-material thin-wall network',finiteWall:false,reason:'Finite material-union solve requires a homogeneous shear modulus.'}};
    const loops=ringLoops(g,y),map=p=>[B[0][0]*p[0]+B[0][1]*p[1],B[1][0]*p[0]+B[1][1]*p[1]];
    const value=FiniteSection.solve({G,outer:loops.outer.map(map),inner:loops.inner.map(map),spars:parts.flatMap(p=>p.polygons.map(poly=>poly.map(map))),partShearModuli:partG},{deps:FiniteSectionDeps});
    return {GJ:value.GJ,torsionSection:{method:'finite-wall homogeneous material-union P1 Saint-Venant section',finiteWall:true,J:value.J,GJ:value.GJ,networkGJ:previous,nodes:value.nodes,triangles:value.triangles,refinementRelative:value.refinementRelative,trueRelativeResidual:value.trueRelativeResidual,energyIdentityRelative:value.energyIdentityRelative,shearCentreReplaced:false,scope:value.variationalScope}};
  }
  function solveSpatial(input,n=normalize(input)) {
    if(Geometry.closedTip(n.g)){const cap=analysisCapability(n.g,input);if(!cap.supported)throw Error(cap.message);return solveClosedTipStress(input);}
    const {g,pla,rod,asm,load:sourceLoad,crit}=n,L=g.semiSpan,F=Frame;
    let load=sourceLoad;
    const count=requestedElementCount(input,MESH_LIMITS.spatialDefault);
    const cap=analysisCapability(g,input);if(!cap.supported)throw Error(cap.message);
    if(input.nSections!=null&&(!Number.isInteger(input.nSections)||input.nSections<3||input.nSections>31))throw Error('The spatial beam supports 3–31 numerical section samples.');
    const ys=[...new Set([...n.ySec,L])].sort((a,b)=>a-b),local=ys.map(y=>cachedSection(g,pla,rod,asm,y));
    load=loadWithSelfWeight(sourceLoad,g,pla,local,ys);
    const frac=g.twistReferenceFraction??.25;
    let reference=ys.map(y=>Geometry.transformPoint(g,y,[frac*chordAt(g,y),0])),samples=[],axisChange=0;
    const projectedCache=projectedSectionCache;
    function projectSection(sec,y,tangent){
      const angle=Geometry.stationAt(g,y).incidenceDeg*Math.PI/180,ex=[Math.cos(angle),0,-Math.sin(angle)],ez=[Math.sin(angle),0,Math.cos(angle)];
      const R=F.basis([0,0,0],tangent,ex),B=[[F.dot(R[1],ex),F.dot(R[1],ez)],[F.dot(R[2],ex),F.dot(R[2],ez)]],det=B[0][0]*B[1][1]-B[0][1]*B[1][0],area=Math.abs(det);
      if(area<.35)throw Error('The 3-D beam section projection is too oblique (|t_y| < 0.35). Reduce sweep/dihedral; this beam approximation is not admitted for nearly span-normal section planes.');
      const map=p=>[B[0][0]*p[0]+B[0][1]*p[1],B[1][0]*p[0]+B[1][1]*p[1]];
      const nodes=new Float64Array(sec.mesh.nodes.length);for(let i=0;i<nodes.length;i+=2){const q=map([sec.mesh.nodes[i],sec.mesh.nodes[i+1]]);nodes[i]=q[0];nodes[i+1]=q[1];}
      const mesh={...sec.mesh,nodes},network=sec.sparNetwork?Spars.projectedNetwork(sec.sparNetwork,B):null;
      let fe=null;
      if(!network){
        if(Math.abs(area-1)<1e-12){const sc=map([sec.fe.xsc,sec.fe.zsc]);fe={J:sec.fe.J,xsc:sc[0],zsc:sc[1]};}
        else{
          const key=JSON.stringify([airfoilAt(g,y),sec.chord,g.skin,g.te,g.cavityStart,g.cavityEnd,B.flat().map(v=>+v.toFixed(10))]);
          if(!projectedCache.has(key)){if(projectedCache.size>=160)projectedCache.clear();projectedCache.set(key,shellFE(mesh));}
          fe=projectedCache.get(key);
        }
      }
      const sc=[network?.xsc??fe.xsc,network?.zsc??fe.zsc],centre=map([sec.xc,sec.zc]),d=F.sub(centre,sc);
      const C=[[sec.EIc,sec.EIxz],[sec.EIxz,sec.EIf+(sec.sparNetwork?sec.EIxz**2/sec.EIc:0)]];
      const Q=Array.from({length:2},(_,i)=>Array.from({length:2},(_,j)=>area*B[i].reduce((v,a,k)=>v+a*B[j].reduce((w,b,h)=>w+b*C[k][h],0),0)));
      const EA=area*sec.EA,props={EA,first2:EA*d[0],first3:EA*d[1],EI22:Q[1][1]+EA*d[1]**2,EI33:Q[0][0]+EA*d[0]**2,EI23:Q[0][1]+EA*d[0]*d[1],GJ:network?.GJ??shearModulus(pla)*fe.J};
      const scLocal=[(B[1][1]*sc[0]-B[0][1]*sc[1])/det,(-B[1][0]*sc[0]+B[0][0]*sc[1])/det];
      return {y,R,B,area,scLocal,reference:Geometry.transformPoint(g,y,scLocal),...props,D:Frame.constitutive(props),local:sec,mesh,fe,network};
    }
    // Iterate the normal-cut orientation onto the elastic shear-centre path,
    // rather than using the silhouette's slope as a fictitious beam direction.
    for(let iteration=0;iteration<6;iteration++){
      const previous=reference;
      samples=ys.map((y,i)=>{
        const a=previous[Math.max(0,i-1)],b=previous[Math.min(ys.length-1,i+1)];
        return projectSection(local[i],y,F.unit(F.sub(b,a)));
      });
      reference=samples.map(s=>s.reference);axisChange=Math.max(...reference.map((p,i)=>F.norm(F.sub(p,previous[i]))));
      if(axisChange<1e-5)break;
    }
    if(axisChange>=1e-5)throw Error('The 3-D beam normal-cut/shear-centre iteration did not converge to 0.00001 mm. Reduce geometric gradients or increase section resolution; no unconverged structural result is returned.');
    samples=samples.map(s=>{const upgrade=finiteSectionTorsion(input,g,pla,s.y,s.B,s.GJ);return {...s,...upgrade,D:Frame.constitutive({...s,GJ:upgrade.GJ})};});
    const column=k=>samples.map(s=>s[k]),at=(k,y)=>interp(y,ys,column(k)),scAt=y=>[interp(y,ys,samples.map(s=>s.scLocal[0])),interp(y,ys,samples.map(s=>s.scLocal[1]))];
    const referenceAt=y=>Geometry.transformPoint(g,y,scAt(y));
    const normalIntegralCache=new Map();
    function sectionData(y,tangent,axisPoint=referenceAt(y)){
      const p={GJ:at('GJ',y)};
      const a=Geometry.stationAt(g,y).incidenceDeg*Math.PI/180,ex=[Math.cos(a),0,-Math.sin(a)],ez=[Math.sin(a),0,Math.cos(a)],R=F.basis([0,0,0],tangent,ex);
      p.R=R;p.B=[[F.dot(R[1],ex),F.dot(R[1],ez)],[F.dot(R[2],ex),F.dot(R[2],ez)]];p.reference=axisPoint;p.scLocal=Geometry.inversePoint(g,axisPoint);
      // Never interpolate tensor entries written in different moving bases.
      // Integrate the local material polygon and project it into THIS element's
      // normal plane about its actual straight-axis piercing point.
      p.D=normalRecoveryD(y,p);Object.assign(p,{EA:p.D[0][0],first2:-p.D[0][2],first3:p.D[0][1],EI22:p.D[1][1],EI33:p.D[2][2],EI23:-p.D[1][2]});return p;
    }
    const sourceItems=load.kind==='flight'?prescribedFlightLoads(load,g):load.kind==='tip'?[{kind:'point',position:L,force:load.tipForce,fraction:load.tipFraction}]:load.items;
    const items=sourceItems.flatMap(p=>g.planform==='elliptic'&&p.kind==='schrenk'?schrenkParts(p,g).map(part=>({...part,fraction:p.fraction})):[p]);
    const aeroItems=n.aero?n.aero.strips.map((r,i,a)=>aeroStripItem(r,i,n.aero.lineFraction,g,i===a.length-1)):[];items.push(...aeroItems);
    const loadName=(p,i)=>p.kind==='aeroStrip'?`Aerodynamic strip ${p.index+1}`:`Wing load ${i+1} (${p.kind})`;
    const physical=[0,L,...(g.stations||[]).map(s=>s.eta*L),...ribStations(g),...seams(g),...g.spars.map(s=>s.length),...items.filter(p=>!p.gravity).flatMap(p=>loadStations(p,L))];
    const mandatory=[...physical,...ys.filter(y=>!physical.some(p=>Math.abs(p-y)<.1))];
    const regular=linspace(0,L,count+1).filter(y=>!mandatory.some(v=>Math.abs(v-y)<.1));
    let nodeY=[...new Set([...mandatory,...regular].map(y=>+y.toFixed(9)))].sort((a,b)=>a-b),nodes=nodeY.map(referenceAt);
    const loadPoint=(p,y)=>Geometry.transformPoint(g,y,p.localPoint||[customFraction(p,y)*chordAt(g,y),0]);
    // Conservative, outward-padded analytic intervals, not point sampling.
    // They certify load-path monotonicity before any normal-foot bisection.
    const interval=(a,b=a)=>{const e=32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));return [Math.min(a,b)-e,Math.max(a,b)+e];};
    const addI=(a,b)=>interval(a[0]+b[0],a[1]+b[1]),subI=(a,b)=>interval(a[0]-b[1],a[1]-b[0]),mulI=(a,b)=>{const q=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return interval(Math.min(...q),Math.max(...q));},scaleI=(a,b)=>mulI(a,[b,b]),dotI=(a,b)=>a.reduce((q,v,i)=>addI(q,mulI(v,b[i])),[0,0]);
    const squareMin=a=>a[0]<=0&&a[1]>=0?0:Math.min(a[0]**2,a[1]**2),absMax=a=>Math.max(Math.abs(a[0]),Math.abs(a[1]));
    function polynomialBounds(c,a,b){const value=t=>c.reduceRight((s,v)=>s*t+v,0),points=[a,b],A=3*(c[3]||0),B=2*(c[2]||0),C=c[1]||0;if(A!==0){const d=B*B-4*A*C;if(d>=0){const s=Math.sqrt(d),q=-.5*(B+(B>=0?s:-s)),roots=q===0?[-B/(2*A)]:[q/A,C/q];for(const t of roots)if(t>a&&t<b)points.push(t);}}else if(B!==0){const t=-C/B;if(t>a&&t<b)points.push(t);}const v=points.map(value);return interval(Math.min(...v),Math.max(...v));}
    function trigBounds(a,b,cosine){const fn=cosine?Math.cos:Math.sin,v=[fn(a),fn(b)];for(let k=Math.ceil(a/(Math.PI/2));k*Math.PI/2<b;k++)v.push(fn(k*Math.PI/2));return interval(Math.min(...v),Math.max(...v));}
    function sourcePathBounds(p,a,b){
      // Every source interval is split at table rows and incidence stations:
      // f(s) and alpha(s) are linear. c(s) is linear or a trimmed ellipse;
      // its derivative is monotone, so endpoint derivative bounds enclose it.
      // of the exact physical position AND derivative over the whole interval.
      const c=interval(chordAt(g,a),chordAt(g,b)),f=interval(customFraction(p,a),customFraction(p,b)),cp=interval(Geometry.chordDerivative(g,a),Geometry.chordDerivative(g,b)),fp=(customFraction(p,b)-customFraction(p,a))/(b-a),pivot=g.twistReferenceFraction??.25,sweepRef=g.planform==='delta'?1:(g.sweepReferenceFraction??(g.planform==='elliptic'?.5:0)),alpha0=Geometry.stationAt(g,a).incidenceDeg*Math.PI/180,alpha1=Geometry.stationAt(g,b).incidenceDeg*Math.PI/180,ap=(alpha1-alpha0)/(b-a),angles=[Math.min(alpha0,alpha1),Math.max(alpha0,alpha1)],co=trigBounds(...angles,true),si=trigBounds(...angles,false),arm=mulI(subI(f,[pivot,pivot]),c),armPrime=addI(mulI(subI(f,[pivot,pivot]),cp),scaleI(c,fp)),sx=Math.tan((g.sweepDeg||0)*Math.PI/180),sz=Math.tan((g.dihedralDeg||0)*Math.PI/180),baseX=addI(addI(scaleI([a,b],sx),scaleI(c,pivot-sweepRef)),[sweepRef*g.rootChord,sweepRef*g.rootChord]);
      return {position:[addI(baseX,mulI(arm,co)),[a,b],subI(scaleI([a,b],sz),mulI(arm,si))],velocity:[subI(addI(addI([sx,sx],scaleI(cp,pivot-sweepRef)),mulI(armPrime,co)),scaleI(mulI(arm,si),ap)),[1,1],subI(subI([sz,sz],mulI(armPrime,si)),scaleI(mulI(arm,co),ap))]};
    }
    function makeAxis(stations,coordinates){
      let length=0;const segments=coordinates.slice(1).map((b,i)=>{const a=coordinates[i],d=F.sub(b,a),L=F.norm(d),s0=length;length+=L;return {a,b,L,tangent:F.scale(d,1/L),s0,y0:stations[i],y1:stations[i+1]};});
      return {segments,length};
    }
    // A continuous normal family avoids gaps/fans at polygonal FE-axis kinks.
    // The Hermite curve is a geometric reference; the frame still approximates
    // it with straight elements. Reject ambiguous normal-foot assignments.
    function normalFamily(stations,coordinates){
      const slope=coordinates.map((p,i)=>{const a=Math.max(0,i-1),b=Math.min(coordinates.length-1,i+1);return F.scale(F.sub(coordinates[b],coordinates[a]),1/(stations[b]-stations[a]));});
      const polynomials=coordinates.slice(1).map((b,i)=>{const a=coordinates[i],h=stations[i+1]-stations[i],m=F.scale(slope[i],h),n=F.scale(slope[i+1],h),o=[a,m,F.sub(F.sub(F.scale(F.sub(b,a),3),F.scale(m,2)),n),F.add(F.scale(F.sub(a,b),2),F.add(m,n))],d=[o[1],F.scale(o[2],2),F.scale(o[3],3)],base=new Array(6).fill(0);o.forEach((v,k)=>d.forEach((w,j)=>base[k+j]-=F.dot(v,w)));return {h,o,d,base};});
      const evaluate=(p,t)=>{let v=0;for(let i=p.length-1;i>=0;i--)v=v*t+p[i];return v;};
      function polynomialRoots(coeff){const p=[...coeff],scale=Math.max(...p.map(Math.abs),1),tolerance=2e-13*scale;while(p.length>1&&Math.abs(p.at(-1))<1e-15*scale)p.pop();if(p.length===1){if(Math.abs(p[0])<=tolerance)throw Error('A whole normal-reference interval maps to the same physical point; the normal mapping is ambiguous.');return [];}if(p.length===2){const t=-p[0]/p[1];return t>=-1e-12&&t<=1+1e-12?[Math.max(0,Math.min(1,t))]:[];}const critical=polynomialRoots(p.slice(1).map((v,i)=>v*(i+1))),bounds=[0,...critical.filter(t=>t>1e-12&&t<1-1e-12),1],roots=[];for(const t of bounds)if(Math.abs(evaluate(p,t))<=tolerance)roots.push(t);for(let i=1;i<bounds.length;i++){let a=bounds[i-1],b=bounds[i],fa=evaluate(p,a),fb=evaluate(p,b);if(fa*fb>=0)continue;for(let k=0;k<40;k++){const t=(a+b)/2,f=evaluate(p,t);if(fa*f<=0)b=t;else{a=t;fa=f;}}roots.push((a+b)/2);}return roots.sort((a,b)=>a-b).filter((t,i,a)=>i===0||t-a[i-1]>1e-9);}
      function at(y){let i=0;while(i<stations.length-2&&y>stations[i+1])i++;const h=stations[i+1]-stations[i],t=(y-stations[i])/h,a=coordinates[i],b=coordinates[i+1],m=slope[i],n=slope[i+1],o=[],d=[],dd=[];for(let k=0;k<3;k++){o[k]=(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*m[k]+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*n[k];d[k]=((6*t*t-6*t)*a[k]+(3*t*t-4*t+1)*h*m[k]+(-6*t*t+6*t)*b[k]+(3*t*t-2*t)*h*n[k])/h;dd[k]=((12*t-6)*a[k]+(6*t-4)*h*m[k]+(-12*t+6)*b[k]+(6*t-2)*h*n[k])/(h*h);}const speed=F.norm(d),normal=F.scale(d,1/speed),dn=F.scale(F.sub(dd,F.scale(normal,F.dot(normal,dd))),1/speed);return {reference:o,normal,dn,speed};}
      const locationCache=new Map();
      function locate(P){const key=P.join(',');if(locationCache.has(key))return locationCache.get(key);const f=y=>{const a=at(y);return F.dot(F.sub(P,a.reference),a.normal);},roots=[];polynomials.forEach((p,i)=>{const h=p.base.map((v,k)=>v+(k<3?F.dot(P,p.d[k]):0));for(const t of polynomialRoots(h))roots.push(stations[i]+t*p.h);});const unique=roots.filter((v,i)=>!roots.slice(0,i).some(w=>Math.abs(v-w)<1e-6));if(unique.length>1)throw Error('Ambiguous physical-point normal mapping: multiple normal planes intersect this point. Reduce geometric gradients; no nearest-plane assignment is fabricated.');let out;if(unique.length===1){const station=unique[0],a=at(station),margin=a.speed-F.norm(F.sub(P,a.reference))*F.norm(a.dn);if(!(margin>1e-7))throw Error('Ill-conditioned normal-plane mapping: section radius times normal gradient reaches the reference-axis speed. Reduce curvature/twist.');out={...a,station,boundedStation:station,outside:null,resolved:true};}else{const a=at(0),b=at(L),root=f(0)<0;if((root&&f(L)<0)||(!root&&f(0)>0&&f(L)>0)){const end=root?a:b,station=(root?0:L)+F.dot(F.sub(P,end.reference),end.normal)/end.speed;out={...end,station,boundedStation:root?0:L,outside:root?'root':'tip',resolved:false};}else throw Error('Physical-point normal mapping could not be resolved; no coordinate clamping is silently applied.');}locationCache.set(key,out);return out;}
      function certifyPath(pathBounds,a,b){
        let boxes=0;
        function check(p,sa,sb,ta,tb,depth){
          if(++boxes>20000)throw Error('Normal load path monotonicity could not be certified within the bounded interval budget. Reduce incidence/profile/chordwise-load gradients or split the load.');
          const path=pathBounds(sa,sb),origin=[0,1,2].map(k=>polynomialBounds(p.o.map(v=>v[k]),ta,tb)),d=[0,1,2].map(k=>scaleI(polynomialBounds(p.d.map(v=>v[k]),ta,tb),1/p.h)),dd=[0,1,2].map(k=>scaleI(polynomialBounds([2*p.o[2][k],6*p.o[3][k]],ta,tb),1/(p.h*p.h))),arm=path.position.map((v,k)=>subI(v,origin[k])),h=dotI(arm,d),numerator=dotI(path.velocity,d),radius=Math.hypot(...arm.map(absMax)),curvature=Math.hypot(...dd.map(absMax)),speedSquared=d.reduce((s,v)=>s+squareMin(v),0);
          // If a normal root is possible, this stronger radius bound implies
          // both the existing point-conditioning screen and dH/dY<0. Together
          // with P'(s).o'(Y)>0 it proves a unique increasing normal-foot path:
          // dY/ds = P'.o' / (|o'|^2-(P-o).o''). Off-root boxes need no radius
          // screen, but still bound the endpoint-extension path direction.
          if(numerator[0]>1e-8*Math.max(1,absMax(numerator))&&(h[0]>1e-8||h[1]<-1e-8||speedSquared-radius*curvature>1e-8*Math.max(1,speedSquared,radius*curvature)))return;
          if(depth>=14)throw Error('Normal load path monotonicity is folded or cannot be certified by conservative analytic interval bounds. Reduce incidence/profile/chordwise-load gradients or split the load; no monotone fit or force relocation is applied.');
          if(depth%2===0){const mid=(sa+sb)/2;check(p,sa,mid,ta,tb,depth+1);check(p,mid,sb,ta,tb,depth+1);}else{const mid=(ta+tb)/2;check(p,sa,sb,ta,mid,depth+1);check(p,sa,sb,mid,tb,depth+1);}
        }
        for(const p of polynomials)check(p,a,b,0,1,0);
        return boxes;
      }
      return {at,locate,atY:y=>at(y).reference,certifyPath};
    }
    // The geometric normal family is defined by the converged numerical
    // section stations, NOT by arbitrary FE/load/rib node spacing. Refining the
    // longitudinal mesh must not introduce artificial reference curvature at
    // corners of a linear interpolation of shear-centre sample coordinates.
    const normals=normalFamily(ys,reference),pointFeet=items.flatMap((p,i)=>{if(p.kind!=='point'||p.gravity)return [];try{const foot=normals.locate(loadPoint(p,p.position));return foot.outside?[]:[foot.station];}catch(error){throw Error(`Wing load ${i+1} (point), aircraft y=${p.position} mm, x/c=${p.fraction}: ${error.message} Reduce profile/incidence gradients or move this load; no nearest-plane clamp is applied.`);}});
    nodeY=[...nodeY];for(const y of pointFeet)if(!nodeY.some(q=>Math.abs(q-y)<.1-1e-9))nodeY.push(y);nodeY.sort((a,b)=>a-b);nodes=nodeY.map(normals.atY);
    if(nodeY.length>161)throw Error('The 3-D frame is limited to 161 nodes. Reduce load-table rows or geometry stations.');
    const axis=makeAxis(nodeY,nodes),loadMapping={method:'Physical loads projected to normal-axis feet; consistent work integrated per original aircraft-y coordinate',endWrenches:[],monotonicity:{method:'Conservative analytic interval bounds of physical-path and C1-normal-family derivatives; no endpoint-sampling certificate',certifiedSourcePanels:0,intervalBoxes:0}};
    const aeroIn=(p,y)=>y>=p.start&&(y<p.end||(p.last&&y<=p.end));
    const lineForce=(p,y)=>p.kind==='point'?0:p.kind==='aeroStrip'?(aeroIn(p,y)?p.f[2]:0):p.kind==='distributed'?(y>=p.start&&y<=p.end?p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start):0):customLine(p,g,y);
    // AeroStruct: line force vector and couple intensity per projected y (global +z only for the 1.3 load kinds)
    const lineVector=(p,y)=>p.kind==='aeroStrip'?(aeroIn(p,y)?p.f:[0,0,0]):[0,0,lineForce(p,y)],lineCouple=(p,y)=>p.kind==='aeroStrip'&&aeroIn(p,y)?p.m:null;
    const elements=nodeY.slice(1).map((b,i)=>{
      const a=nodeY[i],mid=(a+b)/2,tangent=F.unit(F.sub(nodes[i+1],nodes[i])),p=sectionData(mid,tangent,F.scale(F.add(nodes[i],nodes[i+1]),.5)),angle=Geometry.stationAt(g,mid).incidenceDeg*Math.PI/180;
      return {a:i,b:i+1,...p,orientation:[Math.cos(angle),0,-Math.sin(angle)],spanStart:a,spanEnd:b,consistentLoad:new Float64Array(13)};
    });
    const sourceIntervals=p=>{const bounds=p.kind==='table'?p.points.map(q=>q[0]):p.kind==='schrenk'?[0,L]:[p.start,p.end],base=[...new Set([...bounds,...ys.filter(y=>y>bounds[0]&&y<bounds.at(-1))])].sort((a,b)=>a-b);return base.slice(1).flatMap((b,i)=>Array.from({length:8},(_,k)=>[base[i]+(b-base[i])*k/8,base[i]+(b-base[i])*(k+1)/8]));};
    function footAt(P){const p=normals.locate(P);let index=0;while(index<elements.length-1&&p.boundedStation>nodeY[index+1])index++;return {...p,index,arc:p.boundedStation};}
    function loadVector(index,P,force,foot=footAt(P),couple=null){const e=elements[index],seg=axis.segments[index],t=Math.max(0,Math.min(1,(foot.boundedStation-nodeY[index])/(nodeY[index+1]-nodeY[index]))),A=F.add(seg.a,F.scale(seg.tangent,t*seg.L)),arm=F.cross(F.sub(P,A),force),moment=couple?F.add(arm,couple):arm,R=F.basis(seg.a,seg.b,e.orientation);return F.pointLoadVector(R,seg.L,t,force,moment);}
    items.forEach((p,loadIndex)=>{
      if(p.kind==='point'){const P=loadPoint(p,p.position),foot=footAt(P),v=loadVector(foot.index,P,[0,0,p.force],foot);v.forEach((x,i)=>elements[foot.index].consistentLoad[i]+=x);if(foot.outside)loadMapping.endWrenches.push({load:loadIndex+1,end:foot.outside,sourceStation:p.position,normalFootStation:foot.station,reason:'Normal foot lies outside the finite beam; an equivalent end wrench preserves the full global force and moment, but local end-zone response is nominal.'});return;}
      for(const[a,b]of sourceIntervals(p)){
        try{loadMapping.monotonicity.intervalBoxes+=normals.certifyPath((lo,hi)=>sourcePathBounds(p,lo,hi),a,b);loadMapping.monotonicity.certifiedSourcePanels++;}catch(error){throw Error(`${loadName(p,loadIndex)}, aircraft y=${a}…${b} mm: ${error.message}`);}
        const sa=normals.locate(loadPoint(p,a)).station,sb=normals.locate(loadPoint(p,b)).station;
        if(sb<sa-1e-7)throw Error('A prescribed load path reverses along the normal beam coordinate. Split/redefine this folded chordwise load path; no monotone-load approximation is silently applied.');
        const split=[a,b];for(const target of nodeY)if(target>sa+1e-9&&target<sb-1e-9){let lo=a,hi=b;for(let k=0;k<32;k++){const mid=(lo+hi)/2;if(normals.locate(loadPoint(p,mid)).station<target)lo=mid;else hi=mid;}split.push((lo+hi)/2);}split.sort((x,y)=>x-y);
        for(let j=1;j<split.length;j++){const lo=split[j-1],hi=split[j],foot=footAt(loadPoint(p,(lo+hi)/2)),v=F.integrate(y=>loadVector(foot.index,loadPoint(p,y),lineVector(p,y),undefined,lineCouple(p,y)),lo,hi);v.forEach((x,i)=>elements[foot.index].consistentLoad[i]+=x);if(foot.outside)loadMapping.endWrenches.push({load:loadIndex+1,end:foot.outside,sourceStart:lo,sourceEnd:hi,reason:'Outside-axis part of this line load is retained as an equivalent end wrench; end-zone stresses are unresolved.'});}
      }
    });
    const frame=F.solve({nodes,elements});
    const mesh={requestedElements:count,actualElements:frame.elements.length,nodeCount:nodes.length,mandatorySpanStations:[...new Set(mandatory)].sort((a,b)=>a-b)};
    function frameAt(y){let i=0;while(i<nodeY.length-2&&y>nodeY[i+1])i++;const e=frame.elements[i],t=Math.max(0,Math.min(1,(y-nodeY[i])/(nodeY[i+1]-nodeY[i])));return {...F.sampleElement(e,t),reference:F.add(nodes[i],F.scale(F.sub(nodes[i+1],nodes[i]),t)),element:e,t};}
    function normalRecoveryD(y,cut){
      // Stress recovery must balance the actual local material section, not
      // an interpolation of tensors expressed in neighbouring moving frames.
      // Polygon integrals require no additional torsion/warping FE solves.
      if(!normalIntegralCache.has(y)){const loops=ringLoops(g,y),outer=polyIntegrals(loops.outer),inner=polyIntegrals(loops.inner),sum=outer.map((v,i)=>pla.E*(v-inner[i]));for(const part of sparParts(g,y))for(const polygon of part.polygons){const p=polyIntegrals(polygon);p.forEach((v,i)=>sum[i]+=part.s.material.E*v);}normalIntegralCache.set(y,sum);}
      const sum=normalIntegralCache.get(y);
      const EA=sum[0],x=cut.scLocal[0],z=cut.scLocal[1],X=sum[2]-EA*x,Z=sum[1]-EA*z,XX=sum[4]-2*x*sum[2]+EA*x*x,ZZ=sum[3]-2*z*sum[1]+EA*z*z,XZ=sum[5]-x*sum[1]-z*sum[2]+EA*x*z,B=cut.B,area=Math.abs(B[0][0]*B[1][1]-B[0][1]*B[1][0]),C=[[XX,XZ],[XZ,ZZ]],Q=(a,b)=>a.reduce((v,c,i)=>v+c*b.reduce((w,d,j)=>w+d*C[i][j],0),0);
      return F.constitutive({EA:area*EA,first2:area*(B[0][0]*X+B[0][1]*Z),first3:area*(B[1][0]*X+B[1][1]*Z),EI22:area*Q(B[1],B[1]),EI33:area*Q(B[0],B[0]),EI23:area*Q(B[0],B[1]),GJ:cut.GJ});
    }
    const cutCache=new Map();
    const rootFace=outerContour(g,0,81).map(p=>Geometry.transformPoint(g,0,p)),tipFace=outerContour(g,L,81).map(p=>Geometry.transformPoint(g,L,p));
    function endZone(reference,normal,y){const root=Math.max(...rootFace.map(p=>F.dot(F.sub(p,reference),normal))),tip=Math.min(...tipFace.map(p=>F.dot(F.sub(p,reference),normal)));return root>1e-7||y<1e-8?'root':tip< -1e-7||y>L-1e-8?'tip':null;}
    // Resultant of the loads in `list` on the outboard side of the plane through `reference` with unit normal.
    function outboardLoads(list,reference,normal){
      let force=[0,0,0],moment=[0,0,0];
      const signed=P=>F.dot(F.sub(P,reference),normal);
      for(const p of list){
        if(p.kind==='point'){const P=loadPoint(p,p.position);if(signed(P)>=-1e-9){const v=[0,0,p.force];force=F.add(force,v);moment=F.add(moment,F.cross(F.sub(P,reference),v));}continue;}
        for(const[a,b]of sourceIntervals(p)){const fa=signed(loadPoint(p,a)),fb=signed(loadPoint(p,b)),split=[a,b];if(fa*fb<0){let lo=a,hi=b;for(let k=0;k<38;k++){const mid=(lo+hi)/2;if(signed(loadPoint(p,mid))*fa>0)lo=mid;else hi=mid;}split.push((lo+hi)/2);}split.sort((u,v)=>u-v);for(let j=1;j<split.length;j++){const lo=split[j-1],hi=split[j];if(signed(loadPoint(p,(lo+hi)/2))<0)continue;const r=F.integrate(qy=>{const v=lineVector(p,qy),c=lineCouple(p,qy),m=F.cross(F.sub(loadPoint(p,qy),reference),v);return [...v,...(c?F.add(m,c):m)];},lo,hi);force=F.add(force,Array.from(r.slice(0,3)));moment=F.add(moment,Array.from(r.slice(3,6)));}}
      }
      return {force,moment};
    }
    function cutAt(y){
      if(cutCache.has(y))return cutCache.get(y);
      const out=frameAt(y),plane=normals.at(y),s=sectionData(y,plane.normal,plane.reference),reference=s.reference;
      const {force,moment}=outboardLoads(items,reference,plane.normal);
      const fl=F.toLocal(s.R,force),ml=F.toLocal(s.R,moment),recoveryD=normalRecoveryD(y,s),strain=F.solveSPD(recoveryD,[fl[0],ml[1],ml[2],ml[0]]);
      const cut={...s,y,recoveryD,force,moment,localForce:fl,localMoment:ml,strain:Array.from(strain),displacement:out.displacement,rotation:out.rotation,endZone:endZone(reference,plane.normal,y),nominal:true};
      if(cutCache.size>60000)cutCache.clear();cutCache.set(y,cut);return cut;
    }
    const y=Float64Array.from([...new Set([...linspace(0,L,Math.min(1001,input.nGrid||201)),...nodeY])].sort((a,b)=>a-b)),cuts=Array.from(y,cutAt),response=Array.from(y,frameAt);
    const normalStress=(cut,point,E=pla.E)=>{const dx=point[0]-cut.scLocal[0],dz=point[1]-cut.scLocal[1],q2=cut.B[0][0]*dx+cut.B[0][1]*dz,q3=cut.B[1][0]*dx+cut.B[1][1]*dz;return E*(cut.strain[0]+cut.strain[1]*q3-cut.strain[2]*q2);};
    const tension=[],compression=[],sparStress=[];
    cuts.forEach((c,i)=>{
      if(c.endZone){tension.push(NaN);compression.push(NaN);return;}
      const stresses=outerContour(g,y[i],81).map(p=>normalStress(c,p));tension.push(Math.max(0,...stresses));compression.push(Math.max(0,...stresses.map(v=>-v)));
      sparParts(g,y[i]).forEach(p=>{let entry=sparStress.find(s=>s.index===p.index);if(!entry){entry={index:p.index,material:p.s.material,tension:0,compression:0,shear:null};sparStress.push(entry);}const stress=p.polygons.flat().map(q=>normalStress(c,q,p.s.material.E));entry.tension=Math.max(entry.tension,...stress);entry.compression=Math.max(entry.compression,...stress.map(v=>-v));});
    });
    const lineMass=y.map(q=>interp(q,ys,local.map(s=>s.mass))),rho=pla.rho*1e-3,ribs=ribStations(g),ribMass=ribs.map(q=>rho*g.ribThickness*interp(q,ys,local.map(s=>s.ribExtra))),capMass=[0,L].map(q=>rho*g.cap*interp(q,ys,local.map(s=>s.ribExtra))),sparMass=trapz(y.map(q=>interp(q,ys,local.map(s=>s.sparMass))),y),bodyMass=trapz(lineMass,y);
    const mass={shell:bodyMass-sparMass,ribs:ribMass.reduce((a,b)=>a+b,0),caps:capMass[0]+capMass[1],spars:sparMass,rods:0,tip:load.tipMass};mass.printed=mass.shell+mass.ribs+mass.caps;mass.total=mass.printed+sparMass+load.tipMass;
    const deflection=Float64Array.from(response,r=>r.displacement[2]),chordwiseDeflection=Float64Array.from(response,r=>r.displacement[0]),twist=Float64Array.from(response,r=>F.dot(r.rotation,r.element.R[0])),elasticIncidenceDeg=frame.rotations.map(r=>r[1]*180/Math.PI);
    const root=cuts[0],sigTop=Float64Array.from(tension),sigBot=Float64Array.from(compression,v=>-v),V=Float64Array.from(cuts,c=>c.force[2]),M=Float64Array.from(cuts,c=>F.norm(c.moment)),T=Float64Array.from(cuts,c=>c.localMoment[0]);
    // A normal root cut may exclude physical loads on its inboard side. The
    // total applied wrench and support equilibrium must still include ALL loads.
    const wrenchOf=list=>{let total=[0,0,0,0,0,0];for(const p of list){const add=(qy,force,couple=null)=>{const arm=F.cross(F.sub(loadPoint(p,qy),nodes[0]),force);return [...force,...(couple?F.add(arm,couple):arm)];};if(p.kind==='point')total=F.add(total,add(p.position,[0,0,p.force]));else for(const[a,b]of sourceIntervals(p))total=F.add(total,F.integrate(q=>add(q,lineVector(p,q),lineCouple(p,q)),a,b));}return total;};
    let appliedWrench=wrenchOf(items);
    const limitations=['Linear small-displacement Euler–Bernoulli beam; no shear deformation, geometric nonlinearity or section distortion','Locally prismatic projected normal sections; taper, twist and curved reference axis are beam approximations, not a 3-D solid mesh','A continuous C1 reference normal family maps physical loads and surface points; straight frame elements approximate that reference curve','The six-DOF equivalent axis clamp is not a resolved physical oblique root face. Geometrically truncated end cuts are masked; this is only a minimum exclusion, not a validated Saint-Venant decay length',n.aero?'Aerodynamic loads: rigid-wing, attached, incompressible potential-flow panel pressures (no stall, viscous or aeroelastic redistribution), carried as six-component strip forces and couples on the quarter-chord load line; any other prescribed loads are aircraft-global +z per projected y':'Prescribed aircraft-global +z loads per projected y; no aerodynamic lift, zero-lift angle, stall or aeroelastic redistribution prediction','Perfectly bonded skin/ribs/spars and module seams; external rods and dry/slipping joints not modeled','Reported skin/spar stresses are nominal axial + biaxial normal beam stresses; shear failure, local buckling, bond stress and stress concentrations are unresolved','Natural frequencies, flutter and an overall certified factor of safety are unavailable'];
    limitations.push('Non-affine torsional warping normal stress is not recovered; nominal affine stress is not a validated local strength field.');
    const maxTranslation=Math.max(...frame.displacements.map(F.norm)),maxRotation=Math.max(...frame.rotations.map(F.norm)),smallDisplacement=maxTranslation/L<=.05&&maxRotation<=.1;
    const validity={smallDisplacement,maxTranslation,maxRotation,translationRatio:maxTranslation/L,message:smallDisplacement?'Small-displacement screening passed (translation/span ≤ 5%, rotation ≤ 0.1 rad); this is not a nonlinear validation.':'Outside the admitted small-displacement screening (translation/span > 5% or rotation > 0.1 rad). Linear results are illustrative only; reduce loads or use a geometrically nonlinear model.'};
    const analysis3D={method:frame.method,limitations,validity,spanStations:nodeY,referenceCoordinates:nodes,nodes,displacements:frame.displacements,rotations:frame.rotations,elasticIncidenceDeg,reactions:frame.reactions,energy:frame.energy,work:frame.work,verification:frame.verification,elements:frame.elements,sectionSamples:samples,resultants:cuts.map((c,i)=>({y:y[i],force:c.force,moment:c.moment,localForce:c.localForce,localMoment:c.localMoment,endZone:c.endZone})),localM2:Float64Array.from(cuts,c=>c.localMoment[1]),localM3:Float64Array.from(cuts,c=>c.localMoment[2]),localT:T,normalStress:{skinTension:tension,skinCompression:compression,spars:sparStress},loadMapping,frameAt,cutAt,evaluateNormalStress:normalStress,locatePhysicalPoint:normals.locate,referenceAt:y=>frameAt(y).reference,sectionReferenceAt:referenceAt,normalSectionAxisIterationChangeMm:axisChange};
    analysis3D.units={length:'mm',force:'N',moment:'N mm',stress:'MPa',rotation:'rad',energy:'N mm',lineLoad:'N/mm of projected y'};
    analysis3D.mesh=mesh;analysis3D.appliedWrench={force:appliedWrench.slice(0,3),momentAboutRoot:appliedWrench.slice(3)};
    if(n.aero){const aw=wrenchOf(aeroItems),given=n.aero.strips.reduce((t,r)=>t.map((v,i)=>v+r[2+i]),[0,0,0,0,0,0]),about=F.sub(given.slice(3),F.cross(nodes[0],given.slice(0,3)));
      analysis3D.aeroLoad={label:n.aero.label,lineFraction:n.aero.lineFraction,strips:n.aero.strips.map(r=>r.slice()),
        appliedWrench:{force:aw.slice(0,3),momentAboutRoot:aw.slice(3)},givenWrench:{force:given.slice(0,3),momentAboutRoot:about,momentAboutOrigin:given.slice(3)},
        transferResidual:{force:Math.max(...[0,1,2].map(i=>Math.abs(aw[i]-given[i]))),moment:Math.max(...[0,1,2].map(i=>Math.abs(aw[3+i]-about[i])))},
        cutAt:q=>{const plane=normals.at(q),reference=sectionData(q,plane.normal,plane.reference).reference,r=outboardLoads(aeroItems,reference,plane.normal);return {y:q,reference,normal:plane.normal,force:r.force,moment:r.moment,torque:F.dot(r.moment,plane.normal)};},
        method:'Each strip: uniform force intensity F/(y1 - y0) on the load line plus the uniform couple intensity that restores the strip moment exactly; consistent element loads by the same normal-foot work integration as the other line loads.'};}
    // Public referenceAt is the actual straight FE interpolation; the section
    // reference is its continuous target curve. Keep the older raw section-
    // sample interpolation explicitly diagnostic, never an assembly reference.
    analysis3D.rawSectionSampleInterpolationAt=referenceAt;
    analysis3D.normalReferenceAt=normals.atY;analysis3D.sectionReferenceAt=normals.atY;
    analysis3D.endZoneAt=y=>{const p=normals.at(y);return endZone(p.reference,p.normal,y);};
    analysis3D.pointMotionCache=new Map();analysis3D.pointStressCache=new Map();
    analysis3D.referenceAxis='Straight frame elements approximate a continuous C1 projected-section shear-centre normal family; all six equivalent axis-root DOFs are clamped, not a resolved oblique root face. Local axes are right-handed: e1 span tangent, e2 projected chord direction, e3 = e1 cross e2.';
    return {version:VERSION,analysis3D,mesh,geometry:g,pla,rod,assembly:asm,load,criteria:crit,liftN:load.kind==='flight'?load.aircraftMass*load.loadFactor*GRAV/2:undefined,w:Float64Array.from(y,q=>items.filter(p=>p.kind!=='point').reduce((sum,p)=>sum+lineForce(p,q),0)),point:items.filter(p=>p.kind==='point').map(p=>[p.position,p.force,p.fraction*chordAt(g,p.position)]),sections:local,ySec:ys,y,deflection,chordwiseDeflection,twist,V,M,T,mass,ribs,seams:seams(g),seamsActive:[],appliedForce:appliedWrench[2],appliedMoment:appliedWrench[3],stress:{sigTop,sigBot,spars:sparStress},checks:[],governing:null,verification:frame.verification,fem:{fBending:[],fTorsion:[],w:deflection,phi:twist},sparModel:g.spars.length?{method:'Projected bonded thin-wall shear-flow network + full spatial beam',limitations}:null};
  }
  function spatialPointMotion(result,y,localPoint){
    if(!result.analysis3D)throw Error('A spatial beam result is required.');
    if(result.analysis3D.stressOnly)return {point:Geometry.transformPoint(result.geometry,y,localPoint),reference:null,resolved:false,nominal:true,station:y,endZone:null,reason:'This section-equilibrium study does not calculate displacement or rotation.',displacement:null,rotation:null,movedPoint:null};
    const a=result.analysis3D,key=[y,...localPoint].join(',');if(a.pointMotionCache.has(key))return a.pointMotionCache.get(key);const point=Geometry.transformPoint(result.geometry,y,localPoint);let foot;try{foot=a.locatePhysicalPoint(point);}catch(error){const out={point,reference:null,resolved:false,nominal:true,station:null,endZone:'mapping',reason:error.message,displacement:null,rotation:null,movedPoint:null};a.pointMotionCache.set(key,out);return out;}
    if(foot.outside)return {point,reference:foot.reference,resolved:false,nominal:true,station:foot.station,endZone:foot.outside,reason:'Physical point normal foot lies outside the finite beam; motion is not extrapolated or silently clamped.',displacement:null,rotation:null,movedPoint:null};
    const r=a.frameAt(foot.station),reference=r.reference,displacement=Frame.add(r.displacement,Frame.cross(r.rotation,Frame.sub(point,reference))),endZone=a.endZoneAt(foot.station),out={point,reference,station:foot.station,resolved:true,nominal:true,endZone,displacement,rotation:r.rotation,movedPoint:Frame.add(point,displacement)};a.pointMotionCache.set(key,out);return out;
  }
  function normalStressLocationAt3D(result,y,localPoint,material=result.pla){
    if(result.analysis3D?.stressOnly)return result.analysis3D.evaluateStress(y,localPoint,material);
    if(!result.analysis3D)throw Error('A spatial beam result is required.');const a=result.analysis3D,E=typeof material==='number'?material:material.E,key=[y,...localPoint,E].join(',');if(a.pointStressCache.has(key))return a.pointStressCache.get(key);const point=Geometry.transformPoint(result.geometry,y,localPoint);let foot;try{foot=a.locatePhysicalPoint(point);}catch(error){const out={value:NaN,resolved:false,nominal:true,station:null,endZone:'mapping',reason:error.message};a.pointStressCache.set(key,out);return out;}
    if(foot.outside)return {value:NaN,resolved:false,nominal:true,station:foot.station,endZone:foot.outside,reason:'Physical point normal foot lies outside the finite beam.'};
    const cut=a.cutAt(foot.station);if(cut.endZone)return {value:NaN,resolved:false,nominal:true,station:foot.station,endZone:cut.endZone,reason:'Normal cut intersects an oblique end face; local end stresses are unresolved. This geometric mask is not a validated Saint-Venant decay distance.'};
    const q=Frame.toLocal(cut.R,Frame.sub(point,cut.reference)),value=E*(cut.strain[0]+cut.strain[1]*q[2]-cut.strain[2]*q[1]),out={value,resolved:true,nominal:true,station:foot.station,endZone:null,reason:'Locally prismatic nominal normal-beam stress, not a resolved 3-D solid stress.'};a.pointStressCache.set(key,out);return out;
  }
  function normalStressAt3D(result,y,localPoint,material=result.pla){
    return normalStressLocationAt3D(result,y,localPoint,material).value;
  }

  function argmaxArr(a) {
    let k = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > a[k]) k = i;
    return k;
  }

  // Resultant shear stress on a section for upward shear V and nose-up torque T
  // (sectionproperties mapping: vy = −V, mzz = +T).
  function shearField(section, Vup, Tnose, g) {
    if(section.sparNetwork){
      const n=section.sparNetwork,a=Spars.field(n,Vup,Tnose),skin=n.edges.map((e,i)=>({e,i})).filter(v=>v.e.kind==='skin');
      const vals=new Float64Array(section.mesh.tris.length/3);
      for(let k=0;k<vals.length;k++){
        const ids=[0,1,2].map(j=>section.mesh.tris[3*k+j]),x=ids.reduce((s,i)=>s+section.mesh.nodes[2*i],0)/3,z=ids.reduce((s,i)=>s+section.mesh.nodes[2*i+1],0)/3;
        const near=skin.reduce((best,v)=>{const p=n.nodes[v.e.a],q=n.nodes[v.e.b],d=(x-(p[0]+q[0])/2)**2+(z-(p[1]+q[1])/2)**2;return !best||d<best.d?{d,i:v.i}:best;},null);vals[k]=a[near.i];
      }
      const max=Math.max(0,...skin.map(v=>a[v.i]));return {values:vals,nominal:max,peak:max,spar:n.edges.flatMap((e,i)=>e.index>=0&&!e.tie?[{index:e.index,kind:e.kind,tau:a[i]}]:[])};
    }
    const fe = section.fe, mesh = section.mesh;
    const nT = mesh.tris.length / 3;
    const vals = new Float64Array(nT);
    let nominal = 0, peak = 0;
    const cr = 2 * g.skin;
    for (let e = 0; e < nT; e++) {
      const tx = -Vup * fe.tauV[2 * e] + Tnose * fe.tauT[2 * e];
      const ty = -Vup * fe.tauV[2 * e + 1] + Tnose * fe.tauT[2 * e + 1];
      const m = Math.hypot(tx, ty);
      vals[e] = m;
      peak = Math.max(peak, m);
      let near = false;
      for (let v = 0; v < 3 && !near; v++) {
        const n = mesh.tris[3 * e + v];
        const x = mesh.nodes[2 * n], z = mesh.nodes[2 * n + 1];
        for (const [cx, cz] of section.corners) if (Math.hypot(x - cx, z - cz) <= cr) { near = true; break; }
      }
      if (!near) nominal = Math.max(nominal, m);
    }
    return { values: vals, nominal, peak };
  }

  function compareAssemblies(base, rods = [MATERIALS.rod_hobby, MATERIALS.rod_t700]) {
    const rows = [];
    for (const rod of rods)
      for (const rodsBonded of [false, true])
        for (const seamsBonded of [false, true]) {
          const r = solve({ ...base, rod, assembly: { ...(base.assembly || {}), rodsBonded, seamsBonded }, nElements: 40 });
          rows.push({
            rod: rod.short, rods: rodsBonded ? "epoxied" : "slip fit", seams: seamsBonded ? "epoxied" : "dry",
            tipDeflection: r.deflection[r.deflection.length - 1], stiffness: r.stiffness.tip, freePlay: r.seam.freePlay,
            f1: r.fem.fBending[0], governing: r.governing.name, U: r.governing.U, mass: r.mass.total,
          });
        }
    return rows;
  }

  return {
    VERSION, MATERIALS, DEFAULT_GEOMETRY, DEFAULT_LOAD, DEFAULT_CRITERIA, DEFAULT_ASSEMBLY,MESH_LIMITS,
    makeGeometry, chordAt, seams, ribStations, moduleBounds, rodCentres, rodRadius, holeRadius, sleeveRadius,
    airfoilSurfaces, verticalOrdinates, outerContour, ringLoops, ringMesh, shellFE, analyseSection, solve,
    shearField, compareAssemblies, interp, camber, normalizeNaca, normalize, stations, warmStation, sectionAt,
    cavityTipLimit,effectiveTE,sparParts,sparWidths,sparWidthBreaks,closedTipSparLimit,closedTipSparFit,airfoilAt,analysisCapability,solveSpatial,spatialPointMotion,normalStressAt3D,normalStressLocationAt3D,
    stationAt:Geometry.stationAt,transformPoint:Geometry.transformPoint,inversePoint:Geometry.inversePoint,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WingEngine;

/* Independent teaching idealizations. mm, N, MPa; pressure input in Pa.
 * Plate: isotropic Kirchhoff-Love, all four edges simply supported, uniform p.
 * Navier odd sine series. Outputs are centre values, not a full wing solution.
 */
const TeachingModels = (() => {
  function panel({a,b,t,E,nu,pressure,terms=61}) {
    if(![a,b,t,E].every(x=>Number.isFinite(x)&&x>0)||!Number.isFinite(nu)||nu<=-1||nu>=.5||!Number.isFinite(pressure)||pressure<0||!Number.isInteger(terms)||terms<1||terms>201) throw Error('Use positive dimensions/modulus, −1 < ν < 0.5, nonnegative pressure and 1–201 series indices.');
    const p=pressure*1e-6,D=E*t**3/(12*(1-nu**2));
    let w=0,ma=0,mb=0;
    for(let m=1;m<=terms;m+=2) for(let n=1;n<=terms;n+=2) {
      const aa=(m/a)**2,bb=(n/b)**2;
      const v=16*p*(-1)**((m+n-2)/2)/(Math.PI**6*D*m*n*(aa+bb)**2);
      w+=v; ma+=D*Math.PI**2*(aa+nu*bb)*v; mb+=D*Math.PI**2*(bb+nu*aa)*v;
    }
    const stripW=5*p*a**4/(32*E*t**3), stripSigma=3*p*a*a/(4*t*t);
    const status=d=>d/t>.2?'Outside the conservative small-deflection teaching range':'Within the δ/t ≤ 0.2 teaching screen (not validation)';
    return {D,plate:{w,sigmaA:6*ma/t**2,sigmaB:6*mb/t**2,ratio:w/t,status:status(w)},strip:{w:stripW,sigmaA:stripSigma,ratio:stripW/t,status:status(stripW)},thin:Math.min(a,b)/t>=20};
  }
  function studentResult(r) {
    if(r.analysis3D)return {...r,bucklingUnresolved:true};
    // Preserve the numerical engine/reference API, but never promote max(plate,
    // cylinder) to a validated wing buckling capacity in the teaching interface.
    const checks=r.checks.filter(c=>c.name!=='Skin compression buckling (screening)');
    return {...r,checks,governing:checks.reduce((a,b)=>b.U>a.U?b:a),bucklingUnresolved:true};
  }
  function buckling(r) {
    const ratio=capacity=>Math.max(...r.stress.skinComp.map((s,i)=>s*r.load.fos/capacity[i]));
    return {flat:ratio(r.stress.sigFlat),cylinder:ratio(r.stress.sigCyl),legacy:ratio(r.stress.sigCr)};
  }
  function zeroTipTwist(r,engine) {
    // Affine direct-integration model: phi_tip = P(A - x_load B).
    // Include existing dry-joint torsional spring compliances explicitly.
    const {y,props:g,geometry,assembly,rod}=r;let A=0,B=0;
    for(let i=1;i<y.length;i++) {const h=y[i]-y[i-1];A+=h*(g.xsc[i-1]/g.GJ[i-1]+g.xsc[i]/g.GJ[i])/2;B+=h*(1/g.GJ[i-1]+1/g.GJ[i])/2;}
    if(!assembly.seamsBonded) for(const s of r.seams) {
      const nr=geometry.rodFractions.length,Lf=assembly.seamFreeLength??2*geometry.interfaceOffset,d=geometry.rodDiameter;
      const k=nr===2?6*rod.E*(Math.PI*d**4/64)*(Math.abs(geometry.rodFractions[1]-geometry.rodFractions[0])*engine.chordAt(geometry,s))**2/Lf**3:(rod.G??rod.E/(2*(1+rod.nu)))*Math.PI*d**4/32/Lf;
      A+=engine.interp(s,y,g.xsc)/k;B+=1/k;
    }
    return {x:A/B,fraction:A/B/geometry.tipChord,A,B};
  }
  function fitObservations(rows) {
    if(rows.length<3||rows.length>100||rows.some(r=>r.length!==2||!r.every(Number.isFinite)))throw Error('Enter 3–100 rows: force N, displacement mm.');
    const N=rows.length,px=rows.reduce((s,r)=>s+r[0],0)/N,py=rows.reduce((s,r)=>s+r[1],0)/N;
    const xx=rows.reduce((s,r)=>s+(r[0]-px)**2,0);if(xx<=0)throw Error('Use at least two distinct force values.');
    const compliance=rows.reduce((s,r)=>s+(r[0]-px)*(r[1]-py),0)/xx;
    if(compliance<=0)throw Error('Use matching force/displacement signs; a positive compliance is required.');
    const offset=py-compliance*px,ss=rows.reduce((s,r)=>s+(r[1]-py)**2,0),err=rows.reduce((s,r)=>s+(r[1]-offset-compliance*r[0])**2,0);
    return {compliance,stiffness:1/compliance,offset,r2:1-err/ss};
  }
  return {panel,studentResult,buckling,zeroTipTwist,fitObservations};
})();
if(typeof module!=='undefined')module.exports=TeachingModels;

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
    function syncLoadHelp(){
      if(ad.workspace!=='printed')return;const body=doc.querySelector('#wingInputHelp .wing-help-content');if(!body)return;
      let help=doc.querySelector('#wingHelpLoads');if(!help){help=doc.createElement('details');help.id='wingHelpLoads';help.innerHTML='<summary>Loads · applying, picking and distributions</summary>';body.append(help);}
      help.querySelectorAll('[data-load-instruction]').forEach(n=>n.remove());
      for(const note of container.querySelectorAll('p.note'))if(/^(Draft only until confirmed|Select the shape below|Each semi-wing receives|Total F |The first custom load)/.test(note.textContent.trim())){
        note.hidden=true;const copy=note.cloneNode(true);copy.hidden=false;copy.dataset.loadInstruction='1';help.append(copy);
      }
    }
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
      syncLoadHelp();
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
    visible(); renderList();syncLoadHelp();if(ad.onScale)ad.onScale($('.wle-scale').value);
    return { refresh() { renderList(); chord();livePreview();syncLoadHelp(); }, openFlight(){if(!configurableFlight)return;const v=ad.flight.values();for(const [key,suffix]of [['aircraftMass','Mass'],['loadFactor','N'],['distribution','Shape'],['liftFraction','Xc'],['inertiaRelief','Relief']])byId(flightPrefix+suffix).value=String(v[key]);byId(id.kind).value=val('flight');newLoad();cancelPick();visible();}, cancelDraft(){newLoad();cancelPick();closeCsv();}, preview, openCsv, edit, newLoad, container, acceptPick, cancelPick };
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

/* Wing AeroStruct aerodynamic panel module: user interface and coupling helpers. Development version, NOT published.
 *
 * Workflow: speed, density, angle of attack (or a target lift) and a mesh sequence (Standard or Fine) run
 * WingAeroPanel.runSequence in a Web Worker (wing-aero/wing_aero_worker.js; main-thread fallback). The page then
 * shows the extrapolated coefficients with their uncertainty, the global-load consistency checks and every mesh of
 * the sequence. "Apply to structure" stores the solved levels (S.aeroLoad); the page derives the extrapolated
 * six-component strip load (WingAeroPanel.combineSequence), solves the spatial beam with it and runs the admission
 * test against the structural axis (WingAeroPanel.admission). A load that is not admitted is not used: the page
 * withholds the coupled structural result and this panel shows why.
 *
 * adapter = { geometry(): normalized geometry, settings(): saved object | null, saveSettings(obj),
 *   structure(): { supported, message } for six-component loads on the current structure,
 *   snapStations(): structural stations (ribs, seams, geometry stations, spar ends, custom-load stations),
 *   applied(): the applied record (S.aeroLoad) | null, apply(record) (may throw), remove(),
 *   geometryKey(geometry): SHA-256 hex of WingAeroPanel.geometryKey(geometry),
 *   disabled(): '' or a reason, workerURL: string | null, download(name, text, mime) optional }
 * Browser: global WingAeroUI. Node: require('./wing_aero_ui.js').
 */
const WingAeroUI = (() => {
  'use strict';
  const DEFAULTS = Object.freeze({ speed: 15, density: 1.225, alphaDeg: 4, viscosity: 1.81e-5, speedOfSound: 340.29, sequence: 'standard' });
  const SEQUENCE_TEXT = Object.freeze({ standard: 'Standard', fine: 'Fine' });
  const SEQUENCE_NOTE = 'Each new sequence solves eight meshes, refining both chord and span. Standard: up to 96 × 16 and 64 × 24 panels (around × spanwise); Fine: up to 192 × 16 and 64 × 48, with a mixed-refinement mesh in each sequence. Fine costs more. Use the on-screen stage and elapsed time; runtime depends on geometry and device.';
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 4) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3).replace('-', '−') : String(Number(v.toPrecision(d))).replace('-', '−'));
  const pct = v => (Number.isFinite(v) ? `${(100 * v).toFixed(v < 0.1 ? 2 : 1)}&nbsp;%` : '–');
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // --------------------------------------------------------------- coupling helpers (pure, used by the page and tests)
  // The applied record keeps exactly what the study file stores (see wing_study_io.js checkAeroLoad).
  function recordFromSequence(seq, geometrySha256, label) {
    const f = seq.flow;
    return { kind: 'panelSequence', label: label || `Panel-method pressure load, α ${+f.alphaDeg.toFixed(4)}°, V ${+f.speed.toFixed(4)} m/s, ${seq.sequence} sequence`, sequence: seq.sequence, geometrySha256,
      flow: { speed: f.speed, density: f.density, alphaDeg: f.alphaDeg, viscosity: f.viscosity, speedOfSound: f.speedOfSound },
      levels: seq.levels.map(l => ({ chordPanels: l.chordPanels, spanPanels: l.spanPanels, strips: l.strips.map(r => r.slice()), coefficients: { CL: l.coefficients.CL, CLTrefftz: l.coefficients.CLTrefftz, CDpressure: l.coefficients.CDpressure, CDiTrefftz: l.coefficients.CDiTrefftz, Cm: l.coefficients.Cm }, roundedTip: l.roundedTip ? { length_mm: l.roundedTip.length_mm, start_mm: l.roundedTip.start_mm, strips: l.roundedTip.strips } : null })) };
  }
  // A record viewed as a sequence for WingAeroPanel.combineSequence and admission (q and reference recomputed).
  function sequenceOf(A, geometry, record) {
    const q = 0.5 * record.flow.density * record.flow.speed ** 2;
    return { sequence: record.sequence, levels: record.levels, flow: { ...record.flow, dynamicPressure_Pa: q }, reference: A.references(A.aeroGeometry(geometry)) };
  }
  function delivered(A, geometry, record, snapStations = []) { return A.combineSequence(geometry, sequenceOf(A, geometry, record), { snapStations }); }
  // Global aerodynamic results do not require a spatial-beam load or structural admission. Use the existing
  // sequence estimator verbatim for callers requesting aerodynamic results without a structural transfer.
  function aerodynamicSummary(A, seq) {
    const find = (c, s) => { const l = seq.levels.find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`Missing aerodynamic mesh ${c} x ${s}.`); return l; };
    const est = f => A.sequenceEstimate(seq.sequence, (c, s) => f(find(c, s)));
    const coefficients = Object.fromEntries(['CL', 'CLTrefftz', 'CDpressure', 'CDiTrefftz', 'Cm'].map(k => [k, est(l => l.coefficients[k])]));
    const rootWrench = [0, 1, 2, 3, 4, 5].map(d => est(l => l.strips.reduce((sum, r) => sum + r[2 + d], 0)));
    const lift = { pressure: coefficients.CL.value, trefftz: coefficients.CLTrefftz.value, relativeDifference: Math.abs(coefficients.CL.value - coefficients.CLTrefftz.value) / Math.max(Math.abs(coefficients.CL.value), A.ADMISSION.liftConsistencyFloorCL) };
    const drag = { pressure: coefficients.CDpressure.value, trefftz: coefficients.CDiTrefftz.value, difference: coefficients.CDpressure.value - coefficients.CDiTrefftz.value, combinedUncertainty: coefficients.CDpressure.uncertainty + coefficients.CDiTrefftz.uncertainty };
    return { kind: 'aerodynamicSummary', structuralLoadAvailable: false, sequence: seq.sequence, strips: [], weights: A.sequenceWeights(seq.sequence), coefficients, rootWrench, consistency: { lift, drag } };
  }
  const engineLoad = (combined, label) => {
    if (combined.structuralLoadAvailable === false) throw new Error('This aerodynamic summary contains no structural strip load.');
    return { kind: 'aeroStrips', lineFraction: combined.lineFraction, strips: combined.strips.map(r => r.slice()), label: String(label || 'Aerodynamic panel load').slice(0, 200) };
  };
  // Cut planes of the structural result: the root (all loads, about the root axis node, axis direction) and normal
  // cuts at the admission stations; structuralTorque is the engine's own torque of the aerodynamic part.
  function structuralCuts(A, R) {
    const a = R && R.analysis3D;
    if (!a || a.stressOnly || typeof a.cutAt !== 'function') throw new Error('The admission test needs the spatial-beam result.');
    const L = R.geometry.semiSpan, root = a.cutAt(0), n0 = root.R[0];
    const cuts = [{ y: 0, root: true, reference: a.nodes[0].slice(), normal: n0.slice(), structuralTorque: a.aeroLoad ? dot(a.aeroLoad.appliedWrench.momentAboutRoot, n0) : undefined }];
    for (const f of A.ADMISSION.stations) { const y = f * L, c = a.cutAt(y), ac = a.aeroLoad ? a.aeroLoad.cutAt(y) : null; cuts.push({ y, reference: c.reference.slice(), normal: c.R[0].slice(), structuralTorque: ac ? ac.torque : undefined }); }
    return cuts;
  }
  // Torsion data of the structural result for the twist claim: cuts at k L / n (k = 0 .. n - 1) on the engine's own
  // section planes, the frame elements' torsional compliance per unit projected span, k = (length / projected
  // length) / GJ, and the coupled twist (rad). The twist uncertainty is then integral of U_T k dy (wing_aero_panel.js).
  function structuralTorsion(A, R) {
    const a = R && R.analysis3D;
    if (!a || a.stressOnly || typeof a.cutAt !== 'function' || !Array.isArray(a.elements) || !a.elements.length) throw new Error('The twist assessment needs the spatial-beam result.');
    const L = R.geometry.semiSpan, n = A.ADMISSION.torsionStations;
    const cuts = Array.from({ length: n }, (_, k) => { const y = k * L / n, c = a.cutAt(y); return k === 0 ? { y: 0, root: true, reference: a.nodes[0].slice(), normal: c.R[0].slice() } : { y, reference: c.reference.slice(), normal: c.R[0].slice() }; });
    const elements = a.elements.map(e => ({ y0: e.spanStart, y1: e.spanEnd, k: e.L / (e.spanEnd - e.spanStart) / e.GJ }));
    return { cuts, elements, twist: { y: Array.from(R.y), theta: Array.from(R.twist) } };
  }
  function admit(A, geometry, record, combined, R) {
    if(R?.analysis3D?.stressOnly){
      const a=R.analysis3D,L=R.geometry.semiSpan;
      if(!a.aeroLoad||typeof a.aeroLoad.cutAt!=='function')throw Error('The exact-tip structural result contains no transferred aerodynamic wrench.');
      const cuts=[0,...A.ADMISSION.stations.map(f=>f*L)].map((y,i)=>{const c=a.cutAt(y);return {y,root:i===0,reference:c.reference.slice(),normal:[0,1,0],structuralWrench:a.aeroLoad.cutAt(y)};});
      return A.admission(geometry,sequenceOf(A,geometry,record),combined,cuts,{sectionOnly:true});
    }
    return A.admission(geometry, sequenceOf(A, geometry, record), combined, structuralCuts(A, R), { torsion: structuralTorsion(A, R) });
  }

  let styled = false;
  function injectStyles(doc) {
    if (styled || !doc || !doc.head) return; styled = true;
    const st = doc.createElement('style');
    st.textContent = `.wae{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0}.wae .wae-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px 10px}
.wae label{display:grid;gap:2px;font-size:13px}.wae input,.wae select{min-width:0;max-width:100%}.wae select{width:100%}.wae .wae-status{margin:0;font-size:13px}.wae .wae-err{color:var(--bad);font-weight:600}
.wae table{border-collapse:collapse;font-size:12.5px;width:100%}.wae td,.wae th{border:1px solid var(--line);padding:2px 6px;text-align:right;white-space:normal}.wae td:first-child,.wae th:first-child{text-align:left}
.wae .wae-warn{border-left:3px solid var(--warn);padding:4px 8px;margin:0;font-size:12.5px}.wae figure{margin:0}.wae figcaption{font-size:12px;color:var(--muted)}
.wae .wae-ok{color:var(--wl-good-text,var(--good));font-weight:600}.wae .wae-warnmark{color:var(--warn);font-weight:700}.wae .wae-no{color:var(--bad);font-weight:600}.wae .wae-box{border:1px solid var(--line);border-radius:8px;padding:6px 8px;display:grid;gap:6px}
.wae .wae-box.ok{border-color:var(--good)}.wae .wae-box.no{border-color:var(--bad)}.wae .wae-box p{margin:0}
.wae .wae-scroll{overflow-x:auto;max-width:100%}.waefig{display:block;width:100%;height:auto;max-width:420px;background:var(--bg);border:1px solid var(--line);border-radius:8px}.waefig text{font:10.5px var(--font-data,monospace);fill:var(--fg)}
.waefig .ax{stroke:var(--muted);stroke-width:1;fill:none}.waefig .s1{stroke:var(--accent);stroke-width:2;fill:none}.waefig .s2{stroke:var(--load);stroke-width:2;fill:none;stroke-dasharray:5 3}.waefig .s3{stroke:var(--muted);stroke-width:1.4;fill:none;stroke-dasharray:2 3}`;
    doc.head.append(st);
  }
  // --------------------------------------------------------------- figures (pure SVG strings)
  // Vertical force per unit span of the delivered (extrapolated) strips (solid) and of the base mesh (dashed).
  function spanwiseFigure(combined, baseStrips, span) {
    const W = 300, H = 180, L = 40, R = 8, T = 10, B = 20;
    const step = rows => rows.flatMap(r => { const q = r[4] / (r[1] - r[0]); return [[r[0], q], [r[1], q]]; });
    const a = step(combined.strips), b = step(baseStrips);
    const ymax = Math.max(1e-12, ...a.map(v => v[1]), ...b.map(v => v[1])) * 1.1, ymin = Math.min(0, ...a.map(v => v[1]), ...b.map(v => v[1]));
    const X = y => L + (W - L - R) * y / span, Y = v => T + (H - T - B) * (ymax - v) / (ymax - ymin);
    const line = (pts, cls) => `<polyline class="${cls}" points="${pts.map(([p, v]) => `${X(p).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
    return `<svg class="waefig" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vertical aerodynamic force per unit span versus span station"><path class="ax" d="M${L} ${T}V${H - B}H${W - R}M${L} ${Y(0).toFixed(1)}H${W - R}"/>${line(b, 's2')}${line(a, 's1')}<text x="${L - 4}" y="${T + 8}" text-anchor="end">${fmt(ymax, 3)}</text><text x="${L - 4}" y="${(Y(0) + 4).toFixed(1)}" text-anchor="end">0</text><text x="${L}" y="${H - 6}">root</text><text x="${W - R}" y="${H - 6}" text-anchor="end">tip, y = ${fmt(span, 4)} mm</text></svg>`;
  }
  function cpFigure(section) {
    const W = 300, H = 180, L = 36, R = 8, T = 10, B = 20, all = [...section.lower, ...section.upper].map(v => v[1]).filter(Number.isFinite);
    const top = Math.max(1, ...all.map(v => -v)), bot = Math.min(-1, ...all.map(v => -v)); // plotted: -Cp up
    const X = x => L + (W - L - R) * x, Y = v => T + (H - T - B) * (top - v) / (top - bot);
    const line = (pts, cls) => `<polyline class="${cls}" points="${pts.map(([x, cp]) => `${X(x).toFixed(1)},${Y(-cp).toFixed(1)}`).join(' ')}"/>`;
    return `<svg class="waefig" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pressure coefficient along the chord at the selected station, upper and lower surfaces"><path class="ax" d="M${L} ${T}V${H - B}H${W - R}M${L} ${Y(0).toFixed(1)}H${W - R}"/>${line(section.upper, 's1')}${line(section.lower, 's2')}<text x="${L - 4}" y="${(Y(top) + 9).toFixed(1)}" text-anchor="end">${fmt(top, 3)}</text><text x="${L - 4}" y="${(Y(0) + 4).toFixed(1)}" text-anchor="end">0</text><text x="${L - 4}" y="${(Y(bot) - 2).toFixed(1)}" text-anchor="end">${fmt(bot, 3)}</text><text x="${L}" y="${H - 6}">LE</text><text x="${W - R}" y="${H - 6}" text-anchor="end">TE</text></svg><figcaption>−C<sub>p</sub> versus x/c at y = ${fmt(section.y_mm, 4)} mm (local chord ${fmt(section.chord_mm, 4)} mm) on the 64 × 16 base mesh: upper surface solid, lower surface dashed.</figcaption>`;
  }
  // --------------------------------------------------------------- CSV export (pure)
  function csv(record, combined, adm) {
    const lines = [], q = v => (v == null || !Number.isFinite(v) ? '' : String(+v.toPrecision(12)));
    lines.push(`# MIE 446 Wing AeroStruct (development) aerodynamic ${combined.structuralLoadAvailable === false ? 'results' : 'load'}. Lines starting with # are comments.`);
    lines.push(`# ${record.label}`, `# V = ${q(record.flow.speed)} m/s, rho = ${q(record.flow.density)} kg/m^3, alpha = ${q(record.flow.alphaDeg)} deg; ${record.sequence} mesh sequence (${record.levels.length} meshes)`);
    lines.push('# Axes: x aft, y right semi-span, z up; forces N, moments N mm about the aircraft origin, lengths mm.');
    const c = combined.coefficients;
    lines.push('# Provenance: all values are computed for this geometry and flow. No Airfoil Tools polar, experimental target or external reference value is used in extrapolation or admission.');
    lines.push('# U is an empirical mesh-discretization uncertainty estimate, not experimental error, a confidence interval or a guarantee of total accuracy. Cp contours use one solved base mesh, not extrapolated Cp.');
    lines.push(`# Extrapolated (Richardson) with mesh uncertainty U: CL ${q(c.CL.value)} +- ${q(c.CL.uncertainty)}, CL_Trefftz ${q(c.CLTrefftz.value)} +- ${q(c.CLTrefftz.uncertainty)}, CDi_Trefftz ${q(c.CDiTrefftz.value)} +- ${q(c.CDiTrefftz.uncertainty)}, CD_pressure ${q(c.CDpressure.value)} +- ${q(c.CDpressure.uncertainty)}, Cm ${q(c.Cm.value)} +- ${q(c.Cm.uncertainty)}`);
    if (adm) {
      lines.push(`# Admission: ${adm.admitted ? 'ADMITTED' : 'NOT ADMITTED'}; torque ${adm.claims.torque}, twist ${adm.claims.twist}`);
      for (const r of adm.rows) lines.push(r.kind === 'aeroelastic' ? `#   ${r.label}: ${q(r.value)} of the lift (limit ${q(r.tolerance)}): ${r.admitted ? 'consistent' : 'FAILS'}` : r.kind === 'twist' ? `#   ${r.label}: ${r.status}; tip twist ${q(r.value)} rad +- ${q(r.uncertainty)}, bound on |twist| ${q(r.bound)} rad, lift effect of the bound ${q(r.twist.liftEffect)} (limit ${q(r.twist.liftEffectTolerance)}), rigid-wing lift effect of the twist ${q(r.twist.rigidWingEffect)}` : `#   ${r.label}: ${q(r.value)}${r.reference != null ? ' vs '+q(r.reference) : ''} (U ${q(r.uncertainty)}), numerical check ratio ${q(r.measure)} vs limit ${q(r.tolerance)}: ${r.resolved ? 'resolved' : r.admitted ? `${r.status || 'not resolved'}, value withheld` : 'FAILS'}`);
      for (const n of adm.notes || []) lines.push(`# Note: ${n}`);
    }
    if (combined.structuralLoadAvailable === false) lines.push('', '# Aerodynamic results only. No structural strip load was generated for this zero-chord-tip wing.');
    else {
      lines.push('', combined.closedTip ? '# Delivered six-component strip resultants. Conservative sub-strip projection: force density proportional to actual chord; restoring free-couple density proportional to chord squared. All original force and moment components preserved. This is not recovered local panel pressure; torsional response is not computed.' : '# Delivered six-component strip load (extrapolated; carried by the spatial beam as a uniform force intensity on the quarter-chord line plus the couple that restores the strip moment)');
      lines.push('y0_mm,y1_mm,Fx_N,Fy_N,Fz_N,Mx_Nmm,My_Nmm,Mz_Nmm');
      for (const r of combined.strips) lines.push(r.map(q).join(','));
    }
    lines.push('', '# Solved meshes of the sequence (strip forces and moments about the origin) and the extrapolation weight of each');
    lines.push('chordPanels,spanPanels,weight,y0_mm,y1_mm,Fx_N,Fy_N,Fz_N,Mx_Nmm,My_Nmm,Mz_Nmm');
    for (const l of record.levels) { const w = (combined.weights.find(x => x.chordPanels === l.chordPanels && x.spanPanels === l.spanPanels) || { weight: 0 }).weight; for (const r of l.strips) lines.push([l.chordPanels, l.spanPanels, q(w), ...r.map(q)].join(',')); }
    return lines.join('\n') + '\n';
  }
  // --------------------------------------------------------------- main-thread fallback
  const localCache = new Map();
  function runMainThread(request) {
    const A = typeof WingAeroPanel !== 'undefined' ? WingAeroPanel : (typeof require === 'function' ? require('./wing_aero_panel.js') : null);
    if (!A) throw new Error('The aerodynamic panel module is not loaded.');
    return A.runSequence(request.geometry, request.flow, request.sequence, { cache: localCache, targetLift_N: request.options.targetLift_N });
  }
  // --------------------------------------------------------------- admission table (pure HTML)
  const degText = v => `${fmt(v * 180 / Math.PI, 3)}°`;
  function provenanceHelp() {
    return `<details class="wae-provenance"><summary>Where do Value, Extrapolated and U come from?</summary>
      <p>Every value is computed for your wing and flow inputs. No Airfoil Tools polar or measured reference value is read for these tables. Airfoil coordinates define shape, not a target lift or pressure curve.</p>
      <p>At a fixed entered α, lift is a prediction of this model. If you explicitly enter <b>Target lift</b>, the solver instead adjusts α to meet that target; matching it is trimming, not an independent accuracy test. It does not fit the Cp curve to measured data.</p>
      <p><b>Extrapolated</b> estimates the zero-panel-size limit of integrated forces and coefficients using separate chordwise and spanwise mesh sequences. Q<sub>ext</sub> = Q<sub>chord→0</sub> + Q<sub>span→0</sub> − Q<sub>base</sub> + X. X estimates their mixed refinement term when the joint mesh is stored; older files without it omit X. The table below exposes the actual solved meshes and weights; no expected curve is fitted.</p>
      <p><b>U</b> is an empirical mesh-discretization uncertainty estimate: 1.25 × [sum in both directions of max(spread + stability, 0.5|correction|) + 0.5|X|]. Spread compares linear, quadratic and observed-order extrapolations; stability shifts the three-level window. It is not experimental error, a statistical confidence interval, or a bound on all modelling errors.</p>
      <p><b>Admission</b> asks whether numerical load uncertainty and one-way coupling checks meet the stated limits. Force, bending and torque use U/|Value|; pressure versus Trefftz compares two calculations from the same flow solution. Passing does not validate every Cp point or approve structural strength.</p>
      <p>Cp contours and sectional graphs show a solved <b>base mesh</b>, not an extrapolated pressure field. Reynolds number is reported for scope screening; this inviscid solver has no Reynolds-dependent boundary layer, skin-friction drag or stall prediction.</p>
      <p><a href="validation/2026-10-29/index.html" target="_blank" rel="noopener">Independent reference tests and their limitations</a> · <a href="https://www.grc.nasa.gov/www/wind/valid/tutorial/spatconv.html" target="_blank" rel="noopener">NASA: mesh convergence</a>. External validation is documented separately; it is not recomputed against a reference for every new design.</p></details>`;
  }
  function admissionSource(r) {
    return r.kind === 'liftConsistency' ? 'Pressure vs wake/Trefftz; same flow solution. |CLp − CLwake| / max(|CLp|, CL floor)' : r.kind === 'transfer' ? 'Aerodynamic wrench vs structural cut; transfer residual' : r.kind === 'twist' ? 'Structural twist and propagated mesh uncertainty' : r.kind === 'aeroelastic' ? 'Estimated lift change from structural twist; 2π lift slope' : 'Transferred aerodynamic load; U from mesh refinement and transfer interpolation';
  }
  function admissionTable(adm) {
    const basis = '<p class="note">Numerical load checks, not error against experiment. U = estimated mesh uncertainty; the source and check definition are shown per row. Passing is not strength approval.</p>';
    if(adm.mode==='closed-tip-rigid-load-sectional-response')return basis+'<div class="wae-scroll"><table><thead><tr><th>Sectional load check</th><th>Computed value / comparison</th><th>Numerical ratio / limit</th><th>Source / definition</th></tr></thead><tbody>'+adm.rows.map(r=>'<tr><td>'+(r.admitted?'✓ ':'✗ ')+esc(r.label)+'</td><td>'+fmt(r.value)+(r.reference!=null?' vs '+fmt(r.reference):r.kind==='transfer'?'':' ± '+fmt(r.uncertainty||0))+'</td><td>'+pct(r.relative)+' / '+pct(r.tolerance)+'</td><td>'+esc(admissionSource(r))+(r.kind==='force'||r.kind==='bending'?' · U/|Value|':'')+'</td></tr>').join('')+'</tbody></table></div>'+provenanceHelp()+adm.notes.map(n=>'<p class="note">'+esc(n)+'</p>').join('');
    // percentages: whole numbers from 10%, one decimal from 1%, two significant digits below (a 0.011% lift effect is not "0.0%")
    const short = v => (!Number.isFinite(v) ? '∞' : `${v >= 0.1 ? (100 * v).toFixed(0) : v >= 0.01 ? (100 * v).toFixed(1) : Number((100 * v).toPrecision(2))}%`);
    const mark = r => (r.resolved ? '<span class="wae-ok" title="resolved">✓</span>' : r.admitted ? '<span class="wae-warnmark" title="not resolved: value withheld">!</span>' : '<span class="wae-no" title="fails">✗</span>');
    const value = r => r.kind === 'liftConsistency' ? `${fmt(r.value)} vs ${fmt(r.reference)}` : r.kind === 'aeroelastic' ? 'computed twist' : r.kind === 'twist' ? (r.status === 'resolved' ? `${degText(r.value)} ±&nbsp;${degText(r.uncertainty)} (tip)` : `|θ| ≤ ${degText(r.bound)}`) : `${fmt(r.value)} ±&nbsp;${fmt(r.uncertainty, 3)}`;
    const error = r => {
      if (r.kind === 'torque') return `${short(r.relative)} of |T| (limit ${short(r.tolerance)})${r.resolved ? '' : `: ${esc(r.status)}${r.meshSignsAgree ? '' : '; meshes disagree in sign'}`}`;
      if (r.kind === 'twist') return r.status === 'resolved' ? `${short(r.relative)} of |θ| (limit ${short(r.tolerance)})` : `lift effect ${short(r.twist.liftEffect)} (limit ${short(r.twist.liftEffectTolerance)}): ${r.status === 'negligible' ? 'negligible, value withheld' : 'not resolved'}`;
      if (r.kind === 'aeroelastic') return `${short(r.measure)} of lift (limit ${short(r.tolerance)})`;
      return `${short(r.measure)} (limit ${short(r.tolerance)})`;
    };
    const tw = adm.twist;
    return `${basis}<div class="wae-scroll"><table><thead><tr><th>Admission check (N, N·mm)</th><th>Computed value / comparison</th><th>Numerical ratio vs limit</th><th>Source / definition</th></tr></thead><tbody>${adm.rows.map(r => `<tr><td>${mark(r)} ${esc(r.label)}</td><td>${value(r)}</td><td>${error(r)}</td><td>${esc(admissionSource(r))}${['force','bending','torque'].includes(r.kind)?' · U/|Value|':''}</td></tr>`).join('')}</tbody></table></div>${provenanceHelp()}
      <p class="note">✓ resolved; ! not resolved, value withheld; ✗ fails. A torque is resolved only if U ≤ 10% of |T| and every mesh that carries weight in the load gives the same sign; there is no absolute floor. ${tw ? `The twist uncertainty uses this structure's torsional compliance, Δθ(y) = ∫ U<sub>T</sub>/GJ ds. Twist is shown only if every torque is resolved and Δθ ≤ 10% of |θ|; otherwise only the bound on |θ| is reported, and the load is admitted only if that bound, applied as an incidence change with the thin-airfoil lift slope 2π, changes the lift by at most 1% (an area-weighted mean twist of ${degText(tw.meanTolerance)} would do that). One-way coupling: the load is computed on the rigid wing, so the computed twist itself may change the lift by at most 2% (same lift slope); a more flexible wing is refused.` : ''} Torques are about the structural shear-centre axis of the spatial beam. Pressure and Trefftz-plane drag of the extrapolated solution: ${fmt(adm.drag.pressure)} and ${fmt(adm.drag.trefftz)} (reported, not a criterion).</p>`;
  }
  // Explain a refused coupled result without calling valid geometry bad input.
  // This is presentation only: no admission threshold or solved value changes.
  function speedUnits(value) {
    const raw = String(value ?? '').trim(), speed = raw === '' ? NaN : Number(raw);
    return Number.isFinite(speed) && speed > 0
      ? `${Number((3.6 * speed).toPrecision(4))} km/h · input is in m/s`
      : 'Enter speed in m/s; divide km/h by 3.6.';
  }
  function admissionFailure(adm, context = {}) {
    const row = adm.rows?.find(r => r.kind === 'aeroelastic' && !r.admitted);
    const lines = [], number = (v, digits = 3) => Number.isFinite(v) ? String(Number(v.toPrecision(digits))) : 'unavailable';
    if (row) {
      lines.push(`Structural result withheld: the rigid-wing load is not consistent with this flexible wing. The computed twist would change lift by ${number(100 * row.value)}%; the one-way coupling limit is ${number(100 * row.tolerance)}%.`);
      if (Number.isFinite(adm.twist?.tipTheta)) lines.push(`Computed tip twist: ${number(adm.twist.tipTheta * 180 / Math.PI)} degrees. This is a flexibility/model-limit check, not a material-strength failure.`);
      const speed = context.flow?.speed, lift = context.liftN;
      if (Number.isFinite(speed)) lines.push(`Selected airspeed: ${number(speed)} m/s (${number(3.6 * speed)} km/h).${Number.isFinite(lift) ? ` Upward aerodynamic force on this semi-wing: ${number(lift)} N.` : ''}`);
      lines.push('This is not a fixed speed limit: the aerodynamic solution is retained, but this design is too flexible for the one-way structural model under that load. At fixed shape, angle of attack and air density, forces scale with speed squared. For steady level flight, use target lift equal to the actual total aircraft weight to find the required angle of attack; changing speed alone is not a design verification.');
      const validity = context.validity;
      if (validity && !validity.smallDisplacement) lines.push(`The linear structural screening is also exceeded: maximum translation ${number(validity.maxTranslation)} mm (${number(100 * validity.translationRatio)}% of span; limit 5%) and maximum rotation ${number(validity.maxRotation)} rad (limit 0.1 rad).`);
      lines.push('Stiffen the wing, shorten the span, or choose a lower physically justified flight speed. A second bonded spar may help but is not a guaranteed fix: its position also changes the shear-centre torque. The closed skin carries much of the torsion; thicker skin must still leave a valid cavity. After a change, solve Aerodynamics again, apply its loads and review both the coupling and linear screens. A finer panel mesh alone does not fix flexibility.');
    } else {
      lines.push(`Structural result withheld: aerodynamic load admission failed (${(adm.failed || []).join('; ')}).`);
      lines.push(adm.sequence === 'standard' ? 'Select the Fine panel sequence, solve Aerodynamics and try applying its loads again. Review the admission table for the failed quantity.' : 'Review the failed quantity and its uncertainty in the admission table. The finest browser sequence did not establish a reliable coupled result for this case.');
    }
    lines.push('Your inputs and wing geometry are unchanged. The geometry preview remains available; no unaccepted stress or displacement field is shown.');
    return { kind: row ? 'coupling-model-limit' : 'load-admission', title: 'Structural result withheld', message: lines.join('\n\n'), failed: (adm.failed || []).slice() };
  }
  // Verdict sentence of an admission (HTML).
  function admissionVerdict(adm) {
    if(adm.mode==='closed-tip-rigid-load-sectional-response')return {ok:adm.admitted,html:adm.admitted?'Rigid-wing load admitted for nominal normal section stress and pure-bending components. Torsion and aeroelastic feedback are not assessed; exact-apex stress is undefined.':'Sectional load assessment failed: '+esc(adm.failed.join('; '))+'. Choose a finer aerodynamic sequence; no accepted structural field is substituted.'};
    const tw = adm.twist, open = adm.rows.filter(r => r.kind === 'torque' && !r.resolved).map(r => `${esc(r.label.replace(' (shear-centre axis)', ''))}: ${esc(r.status)}`);
    const torqueShown = adm.claims.torque === 'shown', pct = v => { const p = 100 * v; return !Number.isFinite(p) ? '∞' : p >= 100 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : String(Number(p.toPrecision(2))); };
    const notResolved = torqueShown ? `every torque is resolved, but the twist is not resolved to 10% of itself (worst ${tw ? pct(tw.worstRelative) : '?'}% at the reported stations)` : `the torque about this structure's shear-centre axis is not resolved (${open.join('; ')})`;
    if (adm.admitted && adm.claims.twist === 'shown') return { ok: true, html: 'Aerodynamic load admitted: the coupled structural result is shown, including torque and twist (resolved to 10%).' };
    if (adm.admitted) return { ok: true, html: `Aerodynamic load admitted with ${torqueShown ? 'the twist' : 'torque and twist'} withheld: ${notResolved}. ${tw ? `The twist is only bounded, |θ| ≤ ${degText(tw.maxBound)}, which would change the lift by at most ${pct(tw.liftEffect)}% (limit 1%). ` : ''}${torqueShown ? 'Bending, shear force, normal stress, displacement and torque are shown; twist values are not.' : 'Bending, shear force, normal stress and displacement are shown; torque and twist values are not.'}` };
    const failure = admissionFailure(adm);
    return { ok: false, html: failure.message.split('\n\n').map(p => `<span>${esc(p)}</span>`).join('<br><br>') };
  }
  // --------------------------------------------------------------- mount
  function mount(host, ad) {
    const doc = host.ownerDocument || document; injectStyles(doc);
    const saved = { ...DEFAULTS, ...(ad.settings?.() || {}) };
    const field = (id, label, value, extra = '') => `<label for="${id}">${label}<input id="${id}" type="number" step="any" value="${value}" ${extra}></label>`;
    host.innerHTML = `<div class="wae">
      <p class="note">Attached, incompressible potential flow on the actual wing surface (source and doublet panels, Kutta-condition wake, rounded tip). A sequence of seven meshes is solved and extrapolated; the resulting six-component load is admitted to the structure only if its estimated discretization error is within tolerance.</p>
      <div class="wae-grid">${field('aeroV', 'Speed V (m/s)', saved.speed, 'min="0" aria-describedby="aeroSpeedUnits"').replace('</label>', '<small id="aeroSpeedUnits" aria-live="polite"></small></label>')}${field('aeroRho', 'Air density ρ (kg/m³)', saved.density, 'min="0"')}${field('aeroAlpha', 'Angle of attack α (°)', saved.alphaDeg)}${field('aeroTarget', 'or target lift, both halves (N)', '', 'placeholder="optional"')}
      <label for="aeroSequence">Mesh sequence<select id="aeroSequence"><option value="standard">${SEQUENCE_TEXT.standard}</option><option value="fine">${SEQUENCE_TEXT.fine}</option></select></label></div>
      <p class="note">${SEQUENCE_NOTE}</p>
      <details><summary>Air properties</summary><div class="wae-grid">${field('aeroMu', 'Dynamic viscosity μ (Pa·s)', saved.viscosity)}${field('aeroSound', 'Speed of sound a (m/s)', saved.speedOfSound, 'min="290" max="360"')}</div><p class="note">Used for the Reynolds-number and Mach screens only. The speed of sound must be that of air (290 to 360 m/s); Mach above 0.3 is refused.</p></details>
      <div class="lesson-actions"><button class="btn primary" type="button" id="aeroRun">Solve Aerodynamics</button><button class="btn" type="button" id="aeroApply" disabled>Apply aerodynamic loads to structure</button><button class="btn" type="button" id="aeroRemove" hidden>Remove aerodynamic load</button></div>
      <p class="wae-status" id="aeroStatus" role="status" aria-live="polite"></p>
      <div id="aeroApplied"></div><div id="aeroAdmission"></div><div id="aeroResults"></div></div>`;
    const $ = s => host.querySelector(s), status = (t, bad = false) => { $('#aeroStatus').innerHTML = bad ? `<span class="wae-err">${esc(t)}</span>` : esc(t); };
    const updateSpeedUnits = () => { $('#aeroSpeedUnits').textContent = speedUnits($('#aeroV').value); };
    $('#aeroV').addEventListener('input', updateSpeedUnits);
    updateSpeedUnits();
    $('#aeroSequence').value = saved.sequence === 'fine' ? 'fine' : 'standard';
    let worker = null, workerFailed = !ad.workerURL || typeof Worker === 'undefined', seq = 0, last = null, lastCombined = null, lastKey = '', running = false, lastAdmission = null;
    const pending = new Map();
    const A = () => (typeof WingAeroPanel !== 'undefined' ? WingAeroPanel : null);
    function getWorker() {
      if (workerFailed) return null;
      if (worker) return worker;
      try {
        worker = new Worker(ad.workerURL);
        worker.onmessage = ev => { const m = ev.data || {}, p = pending.get(m.id); if (!p) return; if (m.kind === 'progress') { status(m.text); return; } pending.delete(m.id); if (m.kind === 'complete') p.resolve(m.result); else p.reject(new Error(m.text || 'Aerodynamic solve failed.')); };
        worker.onerror = ev => { ev.preventDefault?.(); workerFailed = true; worker?.terminate(); worker = null; for (const [, p] of pending) p.retry(); pending.clear(); };
        return worker;
      } catch (e) { workerFailed = true; return null; }
    }
    function request() {
      const num = (id, label) => { const raw = String($(id).value).trim(), v = raw === '' ? NaN : Number(raw); if (!Number.isFinite(v)) throw new Error(`${label}: enter a finite number.`); return v; };
      const target = String($('#aeroTarget').value).trim();
      const flow = { speed: num('#aeroV', 'Speed'), density: num('#aeroRho', 'Density'), alphaDeg: num('#aeroAlpha', 'Angle of attack'), viscosity: num('#aeroMu', 'Viscosity'), speedOfSound: num('#aeroSound', 'Speed of sound') };
      A()?.normalizeFlow(flow); // the solver's own checks, before any work starts
      return { geometry: ad.geometry(), flow, sequence: $('#aeroSequence').value === 'fine' ? 'fine' : 'standard', options: { targetLift_N: target === '' ? null : num('#aeroTarget', 'Target lift') } };
    }
    function solve(req) {
      return new Promise((resolve, reject) => {
        const local = () => { try { status('Solving on the page (Worker unavailable); the page may pause for a few seconds…'); resolve(runMainThread(req)); } catch (e) { reject(e); } };
        const w = getWorker();
        if (!w) { setTimeout(local, 0); return; }
        const id = ++seq; pending.set(id, { resolve, reject, retry: local });
        w.postMessage({ id, kind: 'sequence', geometry: JSON.parse(JSON.stringify(req.geometry)), flow: req.flow, sequence: req.sequence, options: req.options });
      });
    }
    const busy = on => { running = on; $('#aeroRun').disabled = on; syncButtons(); };
    function syncButtons() {
      const st = ad.structure?.() || { supported: true }, fresh = last && lastKey && ad.geometryKey && ad.geometryKey(ad.geometry()) === lastKey;
      $('#aeroApply').disabled = running || !fresh || !st.supported || lastCombined?.structuralLoadAvailable === false || !!ad.disabled?.();
      $('#aeroApply').title = !st.supported ? st.message : lastCombined?.structuralLoadAvailable === false ? 'Structural load transfer is unavailable for an exact zero-chord tip.' : 'Transfer the aerodynamic load and run the structural admission checks.';
      $('#aeroRemove').hidden = !ad.applied?.();
    }
    async function compute() {
      if (running) return;
      const blocked = ad.disabled?.(); if (blocked) { status(blocked, true); return; }
      let req; try { req = request(); } catch (e) { status(e.message, true); return; }
      const setting = { speed: req.flow.speed, density: req.flow.density, alphaDeg: req.flow.alphaDeg, sequence: req.sequence };
      if (req.flow.viscosity !== DEFAULTS.viscosity) setting.viscosity = req.flow.viscosity;
      if (req.flow.speedOfSound !== DEFAULTS.speedOfSound) setting.speedOfSound = req.flow.speedOfSound;
      ad.saveSettings?.(setting);
      busy(true); status('Building the panel meshes and influence systems…');
      const t0 = Date.now();
      try {
        const result = await solve(req), key = ad.geometryKey ? ad.geometryKey(req.geometry) : '';
        lastCombined = A().combineSequence(req.geometry, result, { snapStations: ad.snapStations ? ad.snapStations() : [] });
        last = result; lastKey = key;
        if (last.trim) $('#aeroAlpha').value = +last.trim.alphaDeg.toFixed(4);
        const support = ad.structure?.();
        status(`Solved the ${result.sequence} sequence (${result.levels.length} meshes, ${result.levels.reduce((t, l) => t + l.panels, 0)} panels in total) in ${((Date.now() - t0) / 1000).toFixed(1)} s${result.levels.every(l => l.modelCacheHit) ? ' (influence systems reused)' : ''}. ${lastCombined.structuralLoadAvailable === false ? 'Aerodynamic results are available. Structural load transfer is unavailable for a zero-chord tip.' : support?.supported === false ? support.message : 'Press Apply aerodynamic loads to structure to run the admission test (it re-solves the structure).'}`);
        render();
      } catch (e) { status(e.message, true); }
      finally { busy(false); }
    }
    function render() {
      const r = last, c = lastCombined, cf = c.coefficients, base = r.base, st = ad.structure?.() || { supported: true };
      const row = (k, est, unit = '') => `<tr><td>${k}</td><td>${fmt(est.value)} ±&nbsp;${fmt(est.uncertainty, 2)}${unit ? `&nbsp;${unit}` : ''}</td><td>${fmt(est.finest)}</td></tr>`;
      const levelRows = r.levels.map(l => { const w = (c.weights.find(x => x.chordPanels === l.chordPanels && x.spanPanels === l.spanPanels) || { weight: 0 }).weight, F = l.strips.reduce((t, s) => t + s[4], 0), M = l.strips.reduce((t, s) => t + s[5], 0);
        return `<tr><td>${2 * l.chordPanels} × ${l.spanPanels}</td><td>${l.panels}</td><td>${fmt(l.coefficients.CL)}</td><td>${fmt(F)}</td><td>${fmt(M)}</td><td>${fmt(w, 3)}</td></tr>`; }).join('');
      const lc = c.consistency.lift, dc = c.consistency.drag;
      $('#aeroResults').innerHTML = `
        ${r.trim ? `<p class="note">Target lift reached at α = ${fmt(r.trim.alphaDeg, 5)}° on the extrapolated pressure lift (residual ${fmt(r.trim.residual_N, 2)} N).</p>` : ''}
        ${provenanceHelp()}
        <div class="wae-scroll"><table><thead><tr><th>Computed result (both halves unless stated)</th><th>Extrapolated ± U (mesh)</th><th>Finest-direction combination</th></tr></thead><tbody>
        ${row('Lift coefficient C<sub>L</sub>, pressure integral', cf.CL)}
        ${row('C<sub>L</sub>, Trefftz plane', cf.CLTrefftz)}
        ${row('Induced drag C<sub>Di</sub>, Trefftz plane', cf.CDiTrefftz)}
        ${row('Pressure drag C<sub>D,p</sub> (equals C<sub>Di</sub> in exact potential flow)', cf.CDpressure)}
        ${row('Pitching moment C<sub>m</sub> about ¼ MAC (nose-up +)', cf.Cm)}
        ${['x', 'y', 'z'].map((k, i) => row(`Semi-wing force F<sub>${k}</sub> (N)`, c.rootWrench[i])).join('')}
        ${['x', 'y', 'z'].map((k, i) => row(`Semi-wing moment M<sub>${k}</sub> about the root origin (N·mm)`, c.rootWrench[3 + i])).join('')}
        </tbody></table></div>
        <p class="note">Global consistency of the extrapolated solution: pressure and Trefftz-plane lift differ by ${pct(lc.relativeDifference)} (criterion 2%); pressure and induced drag differ by ${fmt(dc.difference, 2)} (combined U ${fmt(dc.combinedUncertainty, 2)}). Reynolds number (MAC) ${fmt(base.flow.reynoldsMac, 3)}, Mach ${fmt(base.flow.mach, 3)}, q ${fmt(base.flow.dynamicPressure_Pa)} Pa.</p>
        ${base.warnings.map(w => `<p class="wae-warn">${esc(w)}</p>`).join('')}
        <div class="callout"><b>Use as structural load</b>
          <p class="note">${c.structuralLoadAvailable === false ? 'Cp, pressure, lift and coefficients are available for this closed-tip wing. Transfer to the spatial-beam structural model is unavailable; no structural load has been generated.' : `The extrapolated load is ${c.strips.length} spanwise strips, each with its full force vector and moment (six components; nothing is dropped). ${c.closedTip ? 'The exact-tip model uses a conservative sub-strip projection: force density follows actual chord, and restoring couple density follows chord squared. Every force and moment resultant is preserved. This is not recovered local Cp. Nominal normal stress and pure-bending translation are assessed; torsion, full displacement and aeroelastic feedback are not assessed.' : 'The spatial beam carries a strip as a uniform force on the quarter-chord line plus the couple that restores the strip moment exactly.'}`}</p>
          ${st.supported ? '' : `<p class="wae-err">${esc(st.message)}</p>`}</div>
        <figure>${spanwiseFigure(c.structuralLoadAvailable === false ? { ...c, strips: base.stripLoads } : c, base.stripLoads, base.reference.span_mm / 2)}<figcaption>Strip-average vertical force per unit span F<sub>z</sub>/Δy (N/mm): ${c.structuralLoadAvailable === false ? 'base aerodynamic mesh; no structural load generated' : 'delivered extrapolated strips (solid) and the base mesh (dashed)'}.</figcaption></figure>
        <label for="aeroStation">Chordwise Cp station (base mesh)<select id="aeroStation">${base.strips.map((s, j) => `<option value="${j}"${j === 0 ? ' selected' : ''}>y = ${fmt(s.yMid, 4)} mm (η = ${fmt(s.yMid / (base.reference.span_mm / 2), 3)})</option>`).join('')}</select></label>
        <figure id="aeroCp">${base.chordwise ? cpFigure(base.chordwise[0]) : ''}</figure>
        <details><summary>Meshes of the sequence</summary><div class="wae-scroll"><table><thead><tr><th>Mesh (around × spanwise)</th><th>Panels</th><th>C<sub>L</sub></th><th>F<sub>z</sub> (N)</th><th>M<sub>x</sub> (N·mm)</th><th>Weight</th></tr></thead><tbody>${levelRows}</tbody></table></div>
          <p class="note">Chordwise refinement at ${r.definition.baseSpan} strips and spanwise refinement at ${r.definition.baseChord} panels per surface. The delivered load uses the displayed fixed mesh weights: separate quadratic extrapolations plus a mixed refinement correction when its joint mesh is stored. U is an empirical mesh uncertainty estimate, not a measured error or a guarantee. See the provenance explanation and independent reference tests.</p></details>
        ${ad.download ? `<div class="lesson-actions"><button class="btn" type="button" id="aeroCsv">${c.structuralLoadAvailable === false ? 'Download aerodynamic results (CSV)' : 'Download aerodynamic load (CSV)'}</button></div>` : ''}
        <details><summary>Method and scope</summary><p class="note">${esc(base.scope.method)} ${esc(base.scope.flow)}</p><p class="note">Not modelled: ${esc(base.scope.excluded.join('; '))}.</p><p class="note">${esc(base.scope.claim)}</p></details>`;
      $('#aeroStation').onchange = () => { const j = +$('#aeroStation').value; $('#aeroCp').innerHTML = cpFigure(base.chordwise[j]); };
      if ($('#aeroCsv')) $('#aeroCsv').onclick = () => { const rec = recordFromSequence(last, lastKey); ad.download(`wing-aerostruct-alpha${fmt(r.flow.alphaDeg, 4)}-V${fmt(r.flow.speed, 4)}.csv`.replace(/[^A-Za-z0-9_.-]/g, '_'), csv(rec, lastCombined, lastAdmission), 'text/csv'); status('Aerodynamic load CSV prepared.'); };
      syncButtons();
    }
    function apply() {
      try {
        if (!last) throw new Error('Press Solve Aerodynamics first.');
        if (lastCombined?.structuralLoadAvailable === false) throw new Error('Aerodynamic results are available, but transfer to the spatial-beam structural model is unavailable for an exact zero-chord tip.');
        const key = ad.geometryKey(ad.geometry());
        if (key !== lastKey) throw new Error('The wing shape changed after this aerodynamic solve. Press Solve Aerodynamics again before applying the load.');
        const st = ad.structure?.(); if (st && !st.supported) throw new Error(st.message);
        const record = recordFromSequence(last, lastKey);
        // before the solve: showAdmission replaces this line with the outcome when the admission test has run
        status(`Aerodynamic load applied (α = ${fmt(last.flow.alphaDeg, 4)}°, V = ${fmt(last.flow.speed, 4)} m/s, ${last.sequence} sequence). The structural response is being solved; the load assessment follows.`);
        ad.apply(record);
        refresh();
      } catch (e) { status(e.message, true); }
    }
    $('#aeroRun').onclick = compute;
    $('#aeroApply').onclick = apply;
    $('#aeroRemove').onclick = () => { try { ad.remove(); lastAdmission = null; $('#aeroAdmission').innerHTML = ''; status('Aerodynamic load removed from the structure.'); refresh(); } catch (e) { status(e.message, true); } };
    function showAdmission(adm, message = '') {
      lastAdmission = adm || null;
      const box = $('#aeroAdmission');
      if (!adm) { box.innerHTML = message ? `<div class="wae-box no"><p class="wae-err">${esc(message)}</p></div>` : ''; return; }
      const v = admissionVerdict(adm);
      box.innerHTML = `<div class="wae-box ${v.ok ? 'ok' : 'no'}"><p class="${v.ok ? 'wae-ok' : 'wae-no'}">${v.html}</p>${admissionTable(adm)}</div>`;
      if(adm.mode==='closed-tip-rigid-load-sectional-response'){status(adm.admitted?'Sectional response solved: nominal normal stress and pure-bending components; torsion and aeroelastic feedback not assessed.':'Sectional load assessment failed; see the checks below.',!adm.admitted);return;}
      status(`Admission test (${adm.sequence} sequence): ${!adm.admitted ? 'coupled structural result withheld; aerodynamic solution retained' : adm.claims.twist === 'shown' ? 'admitted with torque and twist' : adm.claims.torque === 'shown' ? 'admitted with the twist withheld' : 'admitted with torque and twist withheld'}. See the table below.`, false);
    }
    function refresh() {
      const s = { ...DEFAULTS, ...(ad.settings?.() || {}) };
      $('#aeroV').value = s.speed; $('#aeroRho').value = s.density; $('#aeroAlpha').value = s.alphaDeg; $('#aeroMu').value = s.viscosity; $('#aeroSound').value = s.speedOfSound;
      updateSpeedUnits();
      $('#aeroSequence').value = s.sequence === 'fine' ? 'fine' : 'standard';
      syncApplied();
    }
    function reset() {
      if (running) throw new Error('Wait for the aerodynamic solve to finish before opening the course example.');
      last = null; lastCombined = null; lastKey = ''; lastAdmission = null;
      $('#aeroResults').innerHTML = ''; $('#aeroAdmission').innerHTML = ''; $('#aeroTarget').value = '';
      status('Set the flow conditions, then press Solve Aerodynamics.');
      refresh();
    }
    // Applied-load banner, stale-shape warning and buttons only (the flow fields keep what the user is typing).
    function syncApplied() {
      let rec = null, key = '';
      try { rec = ad.applied?.(); key = ad.geometryKey ? ad.geometryKey(ad.geometry()) : ''; } catch (e) { rec = ad.applied?.() || null; key = ''; }
      $('#aeroApplied').innerHTML = rec ? `<div class="wae-box"><p><b>Applied:</b> ${esc(rec.label)}.</p>${rec.geometrySha256 !== key ? '<p class="wae-err">The wing shape changed after this load was solved: the structural solve refuses it until you press Solve Aerodynamics again and apply the loads, or remove it.</p>' : ''}</div>` : '';
      if (!rec) { lastAdmission = null; $('#aeroAdmission').innerHTML = ''; }
      if (last && key !== lastKey) status('The wing shape changed since the last aerodynamic solve: press Solve Aerodynamics again before applying its load.');
      syncButtons();
    }
    refresh();
    return { refresh, reset, syncApplied, compute, apply, showAdmission, destroy: () => { worker?.terminate(); worker = null; host.innerHTML = ''; }, get result() { return last; }, get combined() { return lastCombined; }, get admission() { return lastAdmission; }, get solvedKey() { return lastKey; }, get running() { return running; } };
  }
  return Object.freeze({ mount, DEFAULTS, SEQUENCE_TEXT, SEQUENCE_NOTE, spanwiseFigure, cpFigure, csv, runMainThread, recordFromSequence, sequenceOf, delivered, aerodynamicSummary, engineLoad, structuralCuts, structuralTorsion, admit, provenanceHelp, admissionSource, admissionTable, admissionVerdict, admissionFailure, speedUnits });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroUI;

/* Shared wing-workspace tools. Moves real editor nodes; never copies model data or solves. */
const WingWorkspaceUI=(()=>{
 let styled=false;
 function create({app,canvas,viewPanel,actions,sample,contextActions=actions,unit='mm',onClose=null}){
  const doc=app.ownerDocument,win=doc.defaultView;
  if(!styled){styled=true;const style=doc.createElement('style');style.textContent=`
   #app.wing-workspace,#metalApp.wing-workspace{grid-template-columns:320px minmax(0,1fr);grid-template-rows:none;grid-template-areas:"bar bar" "side quick" "side view" "side dock"}
   #app.wing-workspace.learning-view{grid-template-columns:minmax(0,1fr);grid-template-areas:"bar" "quick" "view" "dock"}
   .wing-quick-tools{grid-area:quick;padding:12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}.wing-quick-tools .btn{min-height:40px;padding:7px 12px;white-space:nowrap}.wing-quick-tools .wing-quick-hint{flex-basis:100%;font-size:12px;color:var(--muted);margin:0}
   .wing-display-drawer{grid-area:vpanel;min-width:0}.wing-display-drawer>summary{padding:12px 16px;cursor:pointer;font:700 14px var(--font-label);color:var(--fg)}.wing-display-drawer .wl-vpanel{height:auto;max-height:none;overflow:visible;display:block;border:0;box-shadow:none}.wing-display-drawer .wl-vbody{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));align-items:start}.wing-display-drawer .panel-head{display:none}
   .wing-editor-pop,.wing-context-menu{position:fixed;z-index:180;background:var(--panel,#fff);color:var(--fg,#172c40);border:2px solid var(--accent,#176ac0);border-radius:14px;box-shadow:0 14px 40px #102d4f40;max-height:calc(100vh - 16px);overflow:auto}
   .wing-editor-pop{width:min(420px,calc(100vw - 16px));padding:14px}.wing-editor-pop[hidden],.wing-context-menu[hidden]{display:none}.wing-editor-pop>h3{font:700 17px var(--font-label);padding-right:46px;margin:0 0 12px}.wing-editor-close{position:absolute;right:7px;top:7px;width:40px;height:40px;font-size:28px;line-height:1;border:1px solid var(--line);border-radius:9px;background:var(--panel-2,#eff5fc);color:var(--fg);cursor:pointer}.wing-editor-pop .field{grid-template-columns:minmax(0,1fr) 120px}.wing-editor-pop .field input{min-width:0}.wing-editor-pop .callout{padding:10px}.wing-editor-pop .wle-form>h3{display:none}.wing-editor-pop .wle-form>.note{font-size:12px}.wing-editor-pop .wle-live-preview svg{max-height:150px}.wing-editor-pop .wle-pick{margin:5px 0}.wing-editor-pop .wl-row{margin:8px 0}.wing-editor-pop .btn{min-height:36px}.wing-editor-help{display:none}.wing-editor-pop .wing-editor-help{display:inline-flex;margin-bottom:6px}.wing-editor-pop .wle-form:not(.wing-help-open)>.note:not(.wle-range),.wing-editor-pop .wle-form:not(.wing-help-open) .wle-submitbar>.note{display:none}.wing-editor-pop .wle-form[data-compact-kind="point"] .wle-live-preview{display:none}.wing-quick-form label{display:grid;gap:6px;font-size:14px}.wing-quick-form input{width:100%;padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--fg);font:16px var(--font-data)}.wing-context-menu{padding:8px;width:230px;display:grid;gap:5px}.wing-context-menu button{text-align:left;padding:10px;border:0;border-radius:7px;background:var(--panel-2,#eff5fc);color:var(--fg);cursor:pointer;font:14px var(--font-label)}.wing-context-menu button:hover,.wing-context-menu button:focus-visible{outline:2px solid var(--accent)}.wing-context-menu p{font-size:12px;margin:4px;color:var(--muted)}
   @media(max-width:1100px){#app.wing-workspace,#app.wing-workspace.learning-view{grid-template-columns:minmax(0,1fr);grid-template-areas:"bar" "quick" "view" "dock"}#metalApp.wing-workspace{grid-template-columns:minmax(0,1fr);grid-template-areas:"bar" "quick" "view" "side" "dock"}.wing-quick-tools{gap:6px}.wing-quick-tools .btn{padding:6px 9px}
    #app.wing-workspace>.wl-side{display:none;position:fixed;z-index:90;left:8px;top:var(--wl-top);width:min(340px,calc(100vw - 16px));max-height:calc(100dvh - var(--wl-top) - 8px);overflow:auto;overscroll-behavior:contain;box-shadow:0 12px 36px #102d4f50}
    #app.wing-workspace>.wl-side>*{flex-shrink:0}
    #app.wing-workspace.tablet-inputs-open>.wl-side{display:flex}
    #app.wing-workspace>.view{height:clamp(300px,52dvh,620px);min-height:300px}
    #app.wing-workspace>.bar{gap:6px;padding:8px}#app .bar>.wl-run{flex:1 1 100%;max-width:none;display:flex;flex-wrap:wrap;border:0;padding:6px;position:static;min-width:0}#app .bar>.wl-run .wl-status{font-size:12px;flex:1 1 200px}#app .bar>.wl-run .wl-auto{max-width:210px;margin:0}#app .bar>.wl-run .wl-run-actions{order:3}
    #app .anatomy-key{max-width:calc(100% - 16px);max-height:62px;overflow:auto;font-size:11px;padding:5px;bottom:8px;left:8px}
    #app .footline{display:none}
    #app .bar .brand{display:none}.wing-quick-tools .wing-quick-hint{display:none}.wing-editor-pop{width:min(390px,calc(100vw - 16px))}.wing-editor-pop>div{max-height:calc(65dvh - 64px)!important}.wing-editor-pop input,.wing-editor-pop select,#app .wl-side input,#app .wl-side select{font-size:16px;min-height:40px}
    .wing-quick-tools .btn,.wing-editor-pop .btn,#app .tool,#app .wl-acc>summary{min-height:44px;height:auto}.wing-editor-pop .learn-layout{grid-template-columns:minmax(0,1fr)}
   }
   @media(max-width:600px){#app.wing-workspace{padding:6px;gap:6px}.wing-quick-tools{padding:6px}.wing-quick-tools .btn{font-size:12px;padding:5px 8px}.wing-quick-hint{display:none}.wing-history-tools{margin-left:0!important}#app.wing-workspace>.view{height:46dvh}.wing-editor-pop .field{grid-template-columns:minmax(0,1fr)}.wing-editor-pop .wl-row{gap:6px}}
   .wing-experiments{position:relative}.wing-experiments>summary{list-style:none;cursor:pointer}.wing-experiments[open]>div{position:absolute;z-index:70;right:0;top:100%;width:240px;padding:8px;display:grid;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow)}
   @media(min-width:1101px){#app .bar>.wl-run{margin-left:auto;max-width:430px;border:0;position:static}}#app .wing-input-library[hidden]{display:none}.wing-editor-pop.wing-lesson-pop{width:min(840px,calc(100vw - 16px))}.wing-lesson-pop .tabpanel{padding:0;overflow:visible}.wing-lesson-pop .learn-layout{grid-template-columns:minmax(0,1fr)}
   .wing-part-pop #wingPartEditor{margin:0!important;padding:0!important;border:0!important}.wing-part-pop #wingPartEditor>b,.wing-part-pop #wpPick,.wing-part-pop #wpDeselect,.wing-part-pop #wingPartEditor>.wl-row:last-of-type,.wing-part-pop #wingPartEditor>p:last-child{display:none}.wing-part-pop #wpChoice{max-width:100%;min-height:40px}.wing-part-pop #wpPosition{font-size:16px;min-height:40px}
  `;doc.head.append(style);}
  const scrollStyle=doc.createElement('style');scrollStyle.textContent='.wing-editor-pop{overflow:visible}.wing-editor-pop>div{max-height:calc(100vh - 100px);overflow:auto;overscroll-behavior:contain}.wing-editor-pop.wing-file-pop{width:min(600px,calc(100vw - 16px))}.wing-file-pop .wio-preview{margin:0;padding:0;border:0}.wing-file-pop .wio-preview-actions{position:sticky;top:0;z-index:1;background:var(--panel,#fff);padding:8px 0;border-bottom:1px solid var(--line)}.wing-file-pop .wio-apply{background:var(--accent,#176ac0);color:#fff;font-weight:700;min-width:110px}.wing-file-pop .wio-apply-help,.wing-file-pop .wio-apply-error{flex-basis:100%;margin:0;font-size:13px}.wing-file-pop .wio-apply-error{color:var(--bad,#b42318)}.wing-file-pop .wio-table{font-size:12px}';doc.head.append(scrollStyle);
  const fileStyle=doc.createElement('style');fileStyle.textContent='.wing-file-pop #wingStudyFiles .wio-root>.wio-title,.wing-file-pop #wingStudyFiles .wio-root>.wio-actions,.wing-file-pop #wingStudyFiles .wio-root>.wio-paste,.wing-file-pop #wingStudyFiles .wio-root>.wio-status{display:none}';doc.head.append(fileStyle);
  fileStyle.textContent+='.wing-file-pop .wio-preview{overflow:visible}.wing-file-pop .wio-preview-body{min-width:0}.wing-file-pop .wio-table{width:100%;table-layout:fixed}.wing-file-pop .wio-table th:first-child{width:16%}.wing-file-pop .wio-table th:nth-child(2){width:26%}';
  fileStyle.textContent+='.wing-file-pop .wio-table td,.wing-file-pop .wio-table th{white-space:normal;overflow-wrap:anywhere}.wing-file-pop .wio-provenance{min-width:0}';
  app.classList.add('wing-workspace');
  const historyStyle=doc.createElement('style');historyStyle.textContent='.wing-history-tools .btn:disabled{opacity:.45;cursor:not-allowed}';doc.head.append(historyStyle);
  const tools=doc.createElement('section');tools.className='panel wing-quick-tools';tools.setAttribute('aria-label','Wing model tools');
  for(const action of actions){const b=doc.createElement('button');b.type='button';b.className='btn';b.textContent=action.label;b.dataset.wingAction=action.id;b.onclick=()=>action.run(null,b);tools.append(b);}
  const viewButton=doc.createElement('button');viewButton.type='button';viewButton.className='btn';viewButton.textContent='View & display ▾';viewButton.setAttribute('aria-expanded','false');tools.append(viewButton);
  const hint=doc.createElement('p');hint.className='wing-quick-hint';hint.textContent=app.id==='app'?'Click or tap a visible part to edit it. Drag to rotate; pinch to zoom; two fingers to pan. Right-click for actions at a location. Loads need confirmation.':'Right-click the wing to work at that location. Drag to rotate; right-drag to pan. No load is added until confirmed.';tools.append(hint);canvas.closest('.view').before(tools);
  const display=doc.createElement('details');display.className='wing-display-drawer panel';const summary=doc.createElement('summary');summary.textContent='View & display · zoom, camera and appearance';display.append(summary);viewPanel.before(display);display.append(viewPanel);
  // Keep the real controls (and their listeners) in a hidden home, not below the model.
  display.hidden=true;
  viewButton.onclick=()=>{if(moved===viewPanel)close();else open('View & display',viewPanel,viewButton);};
  const popup=doc.createElement('section');popup.className='wing-editor-pop';popup.hidden=true;popup.setAttribute('role','dialog');const title=doc.createElement('h3');title.id=app.id+'EditorTitle';popup.setAttribute('aria-labelledby',title.id);const closeButton=doc.createElement('button');closeButton.className='wing-editor-close';closeButton.type='button';closeButton.textContent='×';closeButton.setAttribute('aria-label','Close wing editor');const body=doc.createElement('div');popup.append(title,closeButton,body);doc.body.append(popup);
  let moved=null,placeholder=null,anchor=null,returnFocus=null,drag=null,manualPosition=false;
  title.title='Drag this heading to move the panel';title.style.cssText='cursor:move;touch-action:none;user-select:none';
  const viewStyle=doc.createElement('style');viewStyle.textContent='.wing-display-drawer[hidden]{display:none}.wing-editor-pop .wl-vpanel{display:block;height:auto;max-height:none;overflow:visible;border:0;box-shadow:none}.wing-editor-pop .wl-vbody{display:grid;grid-template-columns:minmax(0,1fr)}.wing-editor-pop .wl-vpanel>.panel-head{display:none}.wing-editor-pop.wing-view-pop{width:min(570px,calc(100vw - 16px))}.wing-view-pop #wingPartEditor{display:none}.wing-view-pop .wl-vbody{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.wing-view-pop .hud{grid-column:1/-1}';doc.head.append(viewStyle);
  function clampBox(node,x,y){const r=node.getBoundingClientRect(),vw=doc.documentElement.clientWidth||win.innerWidth,vh=win.innerHeight;node.style.left=Math.max(8,Math.min(x,vw-r.width-8))+'px';node.style.top=Math.max(8,Math.min(y,vh-r.height-8))+'px';}
  function position(){if(popup.hidden)return;if(manualPosition){clampBox(popup,parseFloat(popup.style.left),parseFloat(popup.style.top));return;}const r=anchor?.getBoundingClientRect?.()||anchor||canvas.getBoundingClientRect();clampBox(popup,r.right!=null?r.right+10:r.x,r.top!=null?r.top:r.y);}
  title.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=popup.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};title.setPointerCapture?.(e.pointerId);e.preventDefault();});
  title.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;manualPosition=true;clampBox(popup,drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});
  for(const name of ['pointerup','pointercancel'])title.addEventListener(name,()=>{drag=null;});
  function close(notify=true){const closed=moved;if(moved){if(placeholder?.parentNode)placeholder.replaceWith(moved);else moved.remove();}moved=null;placeholder=null;drag=null;popup.hidden=true;viewButton.setAttribute('aria-expanded','false');body.replaceChildren();returnFocus?.focus?.({preventScroll:true});returnFocus=null;if(notify&&closed)onClose?.(closed);}
  function open(heading,node,at){close(moved!==node);manualPosition=false;returnFocus=doc.activeElement;anchor=at||canvas;title.textContent=heading;placeholder=doc.createComment('wing editor home');if(node.parentNode)node.before(placeholder);moved=node;body.append(node);popup.classList.toggle('wing-view-pop',node===viewPanel);popup.classList.toggle('wing-lesson-pop',node.classList.contains('wing-lesson-panel'));popup.classList.toggle('wing-part-pop',node.id==='wingPartEditor'&&!!node.querySelector('#wpChoice')?.value);viewButton.setAttribute('aria-expanded',String(node===viewPanel));
   const form=node.querySelector('.wle-form');if(form){const kind=form.querySelector('select');form.dataset.compactKind=kind?.value||'';if(!form.querySelector('.wing-editor-help')){const help=doc.createElement('button');help.type='button';help.className='btn wing-editor-help';help.textContent='Load help';help.setAttribute('aria-expanded','false');help.onclick=()=>{const on=form.classList.toggle('wing-help-open');help.setAttribute('aria-expanded',String(on));position();};form.prepend(help);kind?.addEventListener('change',()=>{form.dataset.compactKind=kind.value;position();});}}
   popup.style.width=node.id==='wingAdvancedGeometry'?'min(680px,calc(100vw - 16px))':'';
   popup.classList.toggle('wing-file-pop',node.id==='wingStudyFiles');
   body.scrollTop=0;popup.hidden=false;position();closeButton.focus({preventScroll:true});return popup;}
  closeButton.onclick=()=>close();popup.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  const menu=doc.createElement('section');menu.className='wing-context-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Actions at wing location');doc.body.append(menu);
  let start=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button===2)start={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('contextmenu',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>6){start=null;return;}start=null;let picked;try{picked=sample(e);}catch{return;}if(!picked)return;e.preventDefault();menu.replaceChildren();const at={x:e.clientX,y:e.clientY,right:e.clientX,top:e.clientY};for(const action of contextActions){const b=doc.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=action.label;b.onclick=()=>{menu.hidden=true;action.run(picked,at);};menu.append(b);}const readout=doc.createElement('p');readout.textContent='Reference station '+Number(picked.station.toPrecision(5))+' '+unit+' · x/c '+Number(picked.fraction.toPrecision(4));menu.append(readout);menu.hidden=false;clampBox(menu,e.clientX,e.clientY);menu.querySelector('button')?.focus();});
  doc.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))menu.hidden=true;});doc.addEventListener('keydown',e=>{if(e.key==='Escape')menu.hidden=true;});
  menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(doc.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}});
  for(const name of ['resize','scroll'])win.addEventListener(name,()=>{menu.hidden=true;position();},true);
  for(const name of ['wing-learning-stage','wing-show','metal-wing-open','beam-show'])win.addEventListener(name,()=>{close();menu.hidden=true;});
  return{open,close,position,popup,tools,display,menu};
 }
 // A screen-space hit margin stays usable at every zoom level, including very thin arrow shafts.
 function pickLoadArrow(arrows,camera,canvas,event,THREE,tolerance=12){
  const r=canvas.getBoundingClientRect();let best=null;
  for(const arrow of arrows){
   const {wingLoadIndex:index,wingLoadLength:length}=arrow.userData;if(!Number.isInteger(index)||!Number.isFinite(length)||typeof arrow.getWorldPosition!=='function'||typeof arrow.localToWorld!=='function')continue;
   let visible=true;for(let p=arrow;p;p=p.parent)if(!p.visible)visible=false;if(!visible)continue;
   arrow.updateWorldMatrix(true,true);const a=arrow.getWorldPosition(new THREE.Vector3()).project(camera),b=arrow.localToWorld(new THREE.Vector3(0,length,0)).project(camera);
   if(![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite)||a.z < -1||a.z>1||b.z < -1||b.z>1)continue;
   const ax=r.left+(a.x+1)*r.width/2,ay=r.top+(1-a.y)*r.height/2,bx=r.left+(b.x+1)*r.width/2,by=r.top+(1-b.y)*r.height/2,dx=bx-ax,dy=by-ay;
   const t=Math.max(0,Math.min(1,((event.clientX-ax)*dx+(event.clientY-ay)*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(event.clientX-ax-t*dx,event.clientY-ay-t*dy);
   if(distance<=tolerance&&(!best||distance<best.distance))best={index,distance};
  }
  return best?.index??null;
 }
 return{create,pickLoadArrow};
})();
if(typeof module!=='undefined')module.exports=WingWorkspaceUI;

/*
 * Wing Study IO — study files, design-parameter import, SHA-256 provenance and share links for the
 * MIE 446 Wing Lab (printed PLA semi-wing and D.520 metal-wing workspaces).
 *
 *   Browser: inline this file in the page; it defines the global WingStudyIO.
 *   Node:    const WingStudyIO = require('./wing_study_io.js');
 *
 * Files, pasted text and links are untrusted. They are read by a strict JSON reader (finite numbers
 * only: no NaN, Infinity or overflowing literals; no duplicate keys; size, depth and length limits),
 * copied field by field into a fresh state (unknown fields are refused), checked here for type,
 * units and bounds, and then checked by the engines themselves (WingEngine.makeGeometry, normalize
 * and the solver's own section builder ringLoops; MetalWingEngine.normalise). An import returns
 * either a complete validated state or a list of errors, never a partial state. Nothing is fetched
 * or evaluated, nothing is solved, and text from a file reaches the page only as escaped text.
 * Formats, limits and the neutral design-parameter schema are documented in WING_IMPORT.md.
 * Wing AeroStruct (development) copy of the Wing Lab 1.3 reader/writer. Additions, all optional:
 *  - study.aerodynamics: panel-method inputs (flow and mesh-sequence choice), file version 3;
 *  - study.aeroLoad: an applied aerodynamic load, stored as the solved mesh-sequence levels (strip forces and
 *    moments of each mesh) with the flow, the sequence name and the SHA-256 key of the outer wing shape it
 *    belongs to; file version 4. The reader checks every number, the exact set of meshes of the named sequence,
 *    contiguous strips over the semi-span and the shape key (opts.aeroGeometryKey), or refuses the whole file.
 *  Share links never carry study.aeroLoad (its size); versions 1 and 2 behave exactly as in Wing Lab 1.3.
 */
;(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.WingStudyIO = api;
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : undefined), function () {
  'use strict';

  const IO_VERSION = '2.0.0+aerostruct.1';
  const STUDY_FORMAT = 'mie446-wing-study';
  const PARAMS_FORMAT = 'mie446-wing-parameters';
  const FILE_VERSION = 1;
  const MAX_FILE_VERSION = 4;   // 3: aerodynamic-panel settings block; 4: applied aerodynamic load (Wing AeroStruct)
  const SHARE_KEY = 'wingstudy';
  const LIMITS = Object.freeze({
    fileBytes: 262144,                  // study and design-parameter files, UTF-8 bytes (256 KiB)
    shareChars: 8000,                   // base64url token of a share link
    depth: 12, arrayItems: 256, objectKeys: 64, stringChars: 4096, numberChars: 100,
    printedItems: 12, printedSegments: 30, d520Items: 30, d520Segments: 30,
    tableRowsMin: 2, tableRowsMax: 31, rods: 8,     // rods: the printed-wing page offers at most 8 (MAX_RODS)
    nameChars: 80, labelChars: 120, filenameChars: 255, notesChars: 2000, messages: 60,
  });
  const WORKSPACE_LABEL = Object.freeze({ printed: 'printed PLA semi-wing', d520: 'D.520 metal wing' });

  // Engines are passed in explicitly; inside the single-page app the globals are used as a fallback.
  /* global WingEngine, MetalWingEngine */
  const globalWing = () => (typeof WingEngine !== 'undefined' ? WingEngine : null);
  const globalMetal = () => (typeof MetalWingEngine !== 'undefined' ? MetalWingEngine : null);

  // ------------------------------------------------------------------ small helpers
  const own = (o, k) => o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  function join(base, key) {
    if (typeof key === 'number') return `${base}[${key}]`;
    const k = String(key);
    if (IDENT.test(k)) return base ? `${base}.${k}` : k;
    return `${base}[${JSON.stringify(k.length > 40 ? k.slice(0, 40) + '…' : k)}]`;
  }
  const fmt = (v) => (typeof v === 'number' ? (Object.is(v, -0) ? '0' : String(v)) : String(v));
  function describe(v) {
    if (v === undefined) return 'nothing';
    if (v === null) return 'null';
    if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : Number.isFinite(v) ? String(v) : v > 0 ? 'Infinity' : '-Infinity';
    if (typeof v === 'string') return `the text ${JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…' : v)}`;
    if (typeof v === 'boolean') return `the value ${v}`;
    if (Array.isArray(v)) return `a list of ${v.length}`;
    if (typeof v === 'object') return 'an object';
    return `a ${typeof v}`;
  }
  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(clone);
    const out = {};
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  }
  const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  function cleanName(v) {
    if (typeof v !== 'string') return null;
    return v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.filenameChars) || null;
  }
  /** Display metadata only: never interpreted as markup, a path or engine input. */
  function normalizeProjectName(value) {
    if (typeof value !== 'string') throw new Error('projectName must be plain text.');
    if (value.length > LIMITS.nameChars) throw new Error(`projectName must be at most ${LIMITS.nameChars} characters.`);
    if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))
      throw new Error('projectName contains control characters, line breaks or directional overrides; use plain text.');
    return value.trim();
  }
  /** Safe portable filename component; display names are preserved separately. */
  function safeFilenameStem(value, fallback = 'wing') {
    const token = v => Array.from(String(v ?? '').normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 64).join('');
    let stem = token(value) || token(fallback) || 'wing';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `wing-${stem}`;
    return stem;
  }
  function readProjectName(issues, obj) {
    if (!own(obj, 'projectName')) return '';
    try { return normalizeProjectName(obj.projectName); }
    catch (e) { issues.err('projectName', e.message); return ''; }
  }

  // Error and warning collector; messages are "path: message".
  function makeIssues() {
    const errors = [], warnings = [];
    let dropped = 0;
    return {
      errors, warnings,
      err(path, msg) { if (errors.length >= LIMITS.messages) { dropped++; return; } errors.push(path ? `${path}: ${msg}` : msg); },
      warn(path, msg) { if (warnings.length < LIMITS.messages) warnings.push(path ? `${path}: ${msg}` : msg); },
      get count() { return errors.length + dropped; },
      finish() { if (dropped) { errors.push(`…and ${dropped} more problems.`); dropped = 0; } },
    };
  }

  // ------------------------------------------------------------------ UTF-8
  function utf8Encode(str) {
    const out = new Uint8Array(str.length * 3);
    let n = 0;
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } else c = 0xfffd;
      } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out[n++] = c;
      else if (c < 0x800) { out[n++] = 0xc0 | (c >> 6); out[n++] = 0x80 | (c & 63); }
      else if (c < 0x10000) { out[n++] = 0xe0 | (c >> 12); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63); }
      else { out[n++] = 0xf0 | (c >> 18); out[n++] = 0x80 | ((c >> 12) & 63); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63); }
    }
    return out.slice(0, n);
  }
  /** Strict UTF-8 decoder: overlong forms, surrogates and truncated sequences are errors. */
  function utf8Decode(bytes) {
    const b = toBytes(bytes);
    let out = '';
    const chunk = [];
    for (let i = 0; i < b.length;) {
      const x = b[i];
      let cp, need;
      if (x < 0x80) { cp = x; need = 0; }
      else if (x >= 0xc2 && x <= 0xdf) { cp = x & 0x1f; need = 1; }
      else if (x >= 0xe0 && x <= 0xef) { cp = x & 0x0f; need = 2; }
      else if (x >= 0xf0 && x <= 0xf4) { cp = x & 0x07; need = 3; }
      else throw new Error(`byte ${i + 1} is not valid UTF-8`);
      if (i + need >= b.length + (need ? 0 : 1)) throw new Error(`the text ends inside a UTF-8 character at byte ${i + 1}`);
      for (let k = 1; k <= need; k++) {
        const c = b[i + k];
        if ((c & 0xc0) !== 0x80) throw new Error(`byte ${i + k + 1} is not valid UTF-8`);
        cp = (cp << 6) | (c & 0x3f);
      }
      if ((need === 2 && (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff))) || (need === 3 && (cp < 0x10000 || cp > 0x10ffff)))
        throw new Error(`bytes ${i + 1}–${i + need + 1} are not a valid UTF-8 character`);
      chunk.push(cp);
      if (chunk.length >= 4096) { out += String.fromCodePoint(...chunk); chunk.length = 0; }
      i += need + 1;
    }
    return out + String.fromCodePoint(...chunk);
  }
  function isBytes(v) {
    if (!v || typeof v !== 'object') return false;
    const tag = Object.prototype.toString.call(v);
    return tag === '[object ArrayBuffer]' || tag === '[object Uint8Array]' || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v));
  }
  function toBytes(v) {
    if (typeof v === 'string') return utf8Encode(v);
    const tag = Object.prototype.toString.call(v);
    if (tag === '[object ArrayBuffer]') return new Uint8Array(v);
    if (tag === '[object Uint8Array]') return v;
    if (v && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    throw new TypeError('Expected text or bytes.');
  }

  // ------------------------------------------------------------------ SHA-256 (FIPS 180-4), synchronous
  const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  /** Hex SHA-256 of text (hashed as UTF-8) or of bytes (Uint8Array / ArrayBuffer). */
  function sha256(input) {
    const msg = toBytes(input);
    const len = msg.length;
    const total = Math.ceil((len + 9) / 64) * 64;
    const buf = new Uint8Array(total);
    buf.set(msg);
    buf[len] = 0x80;
    const view = new DataView(buf.buffer);
    view.setUint32(total - 8, Math.floor(len / 0x20000000) >>> 0);
    view.setUint32(total - 4, (len * 8) >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + 4 * t);
      for (let t = 16; t < 64; t++) {
        const a = W[t - 15], b = W[t - 2];
        const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3), s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K256[t] + W[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
  }

  // ------------------------------------------------------------------ base64url
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function base64urlEncode(bytes) {
    const b = toBytes(bytes);
    let out = '';
    for (let i = 0; i < b.length; i += 3) {
      const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (i + 1 < b.length) out += B64[(n >> 6) & 63];
      if (i + 2 < b.length) out += B64[n & 63];
    }
    return out;
  }
  function base64urlDecode(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('not a base64url text');
    const out = new Uint8Array(Math.floor((text.length * 3) / 4));
    let n = 0;
    for (let i = 0; i < text.length; i += 4) {
      const q = [0, 1, 2, 3].map((k) => (i + k < text.length ? B64.indexOf(text[i + k]) : 0));
      const v = (q[0] << 18) | (q[1] << 12) | (q[2] << 6) | q[3];
      out[n++] = (v >> 16) & 255;
      if (i + 2 < text.length) out[n++] = (v >> 8) & 255;
      if (i + 3 < text.length) out[n++] = v & 255;
    }
    return out.slice(0, n);
  }

  // ------------------------------------------------------------------ strict JSON reader
  /**
   * RFC 8259 JSON with explicit refusals: NaN/Infinity/undefined, numbers that overflow to infinity
   * or underflow to zero, duplicate keys, raw control characters, lone surrogates, comments, trailing
   * commas, nesting deeper than LIMITS.depth, lists longer than LIMITS.arrayItems, objects with more
   * than LIMITS.objectKeys fields. Objects are created without a prototype, so keys such as
   * "__proto__" are plain data. Errors name the field path and the line and column.
   */
  function parseJson(text, limits = LIMITS) {
    if (typeof text !== 'string') throw new TypeError('parseJson needs text.');
    let i = 0;
    const n = text.length, path = [];
    const where = () => path.reduce((p, k) => join(p, k), '');
    function fail(msg, pos = i) {
      let line = 1, col = 1;
      for (let k = 0; k < pos && k < n; k++) { if (text.charCodeAt(k) === 10) { line++; col = 1; } else col++; }
      const p = where();
      const e = new Error(`${p ? p + ': ' : ''}${msg} (line ${line}, column ${col})`);
      e.jsonPath = p; e.line = line; e.column = col;
      throw e;
    }
    const ws = () => { while (i < n) { const c = text.charCodeAt(i); if (c === 32 || c === 9 || c === 10 || c === 13) i++; else break; } };
    const NUM = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    const ESC = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    function value(depth) {
      ws();
      if (i >= n) fail('the text ends where a value was expected');
      const c = text[i];
      if (c === '{') return object(depth + 1);
      if (c === '[') return array(depth + 1);
      if (c === '"') return string();
      if (c === 't') return word('true', true);
      if (c === 'f') return word('false', false);
      if (c === 'n') return word('null', null);
      if (c === '-' || (c >= '0' && c <= '9')) return number();
      for (const bad of ['NaN', 'Infinity', 'undefined']) if (text.startsWith(bad, i)) fail(`${bad} is not allowed: every number must be a finite JSON number`);
      if (c === "'") fail('text values and field names must use double quotes');
      if (c === '/') fail('comments are not allowed in JSON');
      fail(`unexpected character ${JSON.stringify(c)}`);
    }
    function word(w, v) {
      if (text.startsWith(w, i)) { i += w.length; return v; }
      fail(`unexpected text ${JSON.stringify(text.slice(i, i + 12))}`);
    }
    function number() {
      if (text.startsWith('-Infinity', i)) fail('-Infinity is not allowed: every number must be a finite JSON number');
      NUM.lastIndex = i;
      const m = NUM.exec(text);
      if (!m) fail('invalid number');
      const tok = m[0], next = text[i + tok.length];
      if (next !== undefined && /[0-9A-Za-z.+\-]/.test(next)) fail(`invalid number ${JSON.stringify(text.slice(i, i + tok.length + 1))}`);
      if (tok.length > limits.numberChars) fail(`the number ${tok.slice(0, 24)}… has more than ${limits.numberChars} characters`);
      const v = Number(tok);
      if (!Number.isFinite(v)) fail(`the number ${tok} is too large: it overflows to infinity, and every number must be finite`);
      if (v === 0 && /[1-9]/.test(tok.replace(/[eE].*$/, ''))) fail(`the number ${tok} is too small: it underflows to zero`);
      i += tok.length;
      return v;
    }
    function string() {
      i++;
      let out = '', start = i;
      for (;;) {
        if (i >= n) fail('a text value is not closed (missing ")');
        const c = text.charCodeAt(i);
        if (c === 34) { out += text.slice(start, i); i++; break; }
        if (c === 92) {
          out += text.slice(start, i);
          const e = text[i + 1];
          if (e === 'u') {
            const hex = text.slice(i + 2, i + 6);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) fail('invalid \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else if (e !== undefined && own(ESC, e)) { out += ESC[e]; i += 2; }
          else fail('invalid escape sequence in a text value');
          start = i;
          continue;
        }
        if (c < 32) fail('a text value contains a raw control character');
        i++;
        if (out.length + i - start > limits.stringChars) fail(`a text value is longer than ${limits.stringChars} characters`);
      }
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)) fail('a text value contains an unpaired Unicode surrogate');
      return out;
    }
    function object(depth) {
      if (depth > limits.depth) fail(`the data is nested more than ${limits.depth} levels deep`);
      i++;
      const obj = Object.create(null);
      let count = 0;
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail(text[i] === '}' ? 'a trailing comma is not allowed' : 'expected a field name in double quotes');
        const at = i, key = string();
        if (own(obj, key)) { path.push(key); fail(`duplicate field ${JSON.stringify(key.slice(0, 40))}: each field may appear only once`, at); }
        if (++count > limits.objectKeys) fail(`an object has more than ${limits.objectKeys} fields`, at);
        ws();
        if (text[i] !== ':') fail('expected : after a field name');
        i++;
        path.push(key);
        obj[key] = value(depth);
        path.pop();
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return obj; }
        fail(text[i] === '/' ? 'comments are not allowed in JSON' : 'expected , or } after a field');
      }
    }
    function array(depth) {
      if (depth > limits.depth) fail(`the data is nested more than ${limits.depth} levels deep`);
      i++;
      const arr = [];
      ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        if (arr.length >= limits.arrayItems) fail(`a list has more than ${limits.arrayItems} entries`);
        path.push(arr.length);
        arr.push(value(depth));
        path.pop();
        ws();
        if (text[i] === ',') { i++; ws(); if (text[i] === ']') fail('a trailing comma is not allowed'); continue; }
        if (text[i] === ']') { i++; return arr; }
        fail(text[i] === '/' ? 'comments are not allowed in JSON' : 'expected , or ] in a list');
      }
    }
    const result = value(0);
    ws();
    if (i < n) fail(text[i] === '/' ? 'comments are not allowed in JSON' : 'unexpected text after the end of the JSON value');
    return result;
  }

  // Bytes or text in, checked UTF-8 text out, with provenance (SHA-256 of the exact bytes).
  function readInput(input, label) {
    let bytes, text;
    if (typeof input === 'string') {
      if (input.length > LIMITS.fileBytes) return { error: `${label} is too large (more than ${LIMITS.fileBytes} bytes; the limit is ${LIMITS.fileBytes / 1024} KiB).`, byteLength: null };
      bytes = utf8Encode(input);
      text = input;
    } else if (isBytes(input)) {
      bytes = toBytes(input);
      if (bytes.length > LIMITS.fileBytes) return { error: `${label} is too large (${bytes.length} bytes; the limit is ${LIMITS.fileBytes} bytes = ${LIMITS.fileBytes / 1024} KiB).`, byteLength: bytes.length };
      try { text = utf8Decode(bytes); } catch (e) { return { error: `${label} is not UTF-8 text: ${e.message}.`, byteLength: bytes.length, sha256: sha256(bytes) }; }
    } else return { error: `${label} must be text.`, byteLength: null };
    if (bytes.length > LIMITS.fileBytes) return { error: `${label} is too large (${bytes.length} bytes; the limit is ${LIMITS.fileBytes} bytes = ${LIMITS.fileBytes / 1024} KiB).`, byteLength: bytes.length };
    const hash = sha256(bytes);
    let bom = false;
    if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); bom = true; }
    return { text, byteLength: bytes.length, sha256: hash, bom };
  }

  // ------------------------------------------------------------------ exact decimal unit conversion
  // A finite double is converted through its shortest decimal form with integer (BigInt) arithmetic,
  // so 0.07 m becomes exactly 70 mm and 1.5 in exactly 38.1 mm (the double nearest the true value).
  function decimalOf(v) {
    let s = String(v), neg = false, exp = 0;
    if (s[0] === '-') { neg = true; s = s.slice(1); }
    const e = s.search(/e/i);
    if (e >= 0) { exp = parseInt(s.slice(e + 1), 10); s = s.slice(0, e); }
    const dot = s.indexOf('.');
    if (dot >= 0) { exp -= s.length - dot - 1; s = s.slice(0, dot) + s.slice(dot + 1); }
    return { neg, digits: BigInt(s), exp };
  }
  /** v × mul × 10^exp ÷ div, correctly rounded (to within the 30 guard digits of the division). */
  function exactScale(v, mul, exp, div) {
    if (v === 0) return v;
    const d = decimalOf(v);
    let digits = d.digits * mul, e = d.exp + exp;
    if (div !== undefined && div !== 1n) { digits = (digits * 10n ** 30n) / div; e -= 30; }
    return Number(`${d.neg ? '-' : ''}${digits}e${e}`);
  }
  const LENGTH_UNITS = Object.freeze({
    mm: Object.freeze({ mul: 1n, exp: 0, text: '1 mm = 1 mm' }),
    cm: Object.freeze({ mul: 1n, exp: 1, text: '1 cm = 10 mm (exact)' }),
    m: Object.freeze({ mul: 1n, exp: 3, text: '1 m = 1000 mm (exact)' }),
    in: Object.freeze({ mul: 254n, exp: -1, text: '1 in = 25.4 mm (exact by definition)' }),
  });
  const lengthToMm = (v, u) => exactScale(v, LENGTH_UNITS[u].mul, LENGTH_UNITS[u].exp);
  const perLengthToPerMm = (v, u) => exactScale(v, 1n, -LENGTH_UNITS[u].exp, LENGTH_UNITS[u].mul);
  const half = (v) => exactScale(v, 5n, -1);

  // ------------------------------------------------------------------ field checks
  function checkKeys(issues, obj, path, allowed, explain) {
    for (const k of Object.keys(obj)) {
      if (allowed.includes(k)) continue;
      const p = join(path, k);
      if (explain && own(explain, k)) issues.err(p, explain[k]);
      else issues.err(p, `unknown field: it is not part of version ${FILE_VERSION} of this format (see WING_IMPORT.md); remove it`);
    }
  }
  const unitSuffix = (u) => (u ? ` ${u}` : '');
  /** Number field. o: {optional, nullable, integer, gt, ge, lt, le, nonzero, unit, label}. Returns undefined when invalid. */
  function num(issues, obj, key, path, o = {}) {
    const p = join(path, key), u = unitSuffix(o.unit);
    if (!own(obj, key) || obj[key] === undefined) {
      if (!o.optional) issues.err(p, `is missing${o.label ? ` (${o.label}${o.unit ? `, ${o.unit}` : ''})` : ''}`);
      return undefined;
    }
    const v = obj[key];
    if (v === null && o.nullable) return null;
    if (!isNum(v)) { issues.err(p, `must be a finite number${o.unit ? ` in ${o.unit}` : ''}, not ${describe(v)}`); return undefined; }
    if (o.integer && !Number.isInteger(v)) { issues.err(p, `must be a whole number, not ${fmt(v)}`); return undefined; }
    if (o.gt !== undefined && !(v > o.gt)) { issues.err(p, `must be greater than ${fmt(o.gt)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.ge !== undefined && !(v >= o.ge)) { issues.err(p, `must be at least ${fmt(o.ge)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.lt !== undefined && !(v < o.lt)) { issues.err(p, `must be less than ${fmt(o.lt)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.le !== undefined && !(v <= o.le)) { issues.err(p, `must be at most ${fmt(o.le)}${u} (got ${fmt(v)}${u})`); return undefined; }
    if (o.nonzero && v === 0) { issues.err(p, 'must not be zero'); return undefined; }
    return v;
  }
  function bool(issues, obj, key, path, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, `is missing (true or false${o.label ? `: ${o.label}` : ''})`); return undefined; }
    if (typeof obj[key] !== 'boolean') { issues.err(p, `must be true or false, not ${describe(obj[key])}`); return undefined; }
    return obj[key];
  }
  function choice(issues, obj, key, path, options, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, `is missing (one of ${options.map((q) => JSON.stringify(q)).join(', ')})`); return undefined; }
    const v = obj[key];
    if (typeof v !== 'string' || !options.includes(v)) { issues.err(p, `must be one of ${options.map((q) => JSON.stringify(q)).join(', ')}, not ${describe(v)}`); return undefined; }
    return v;
  }
  function text(issues, obj, key, path, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, 'is missing (text)'); return undefined; }
    const v = obj[key];
    if (v === null && o.nullable) return null;
    if (typeof v !== 'string') { issues.err(p, `must be text, not ${describe(v)}`); return undefined; }
    if (v.length > (o.max || LIMITS.nameChars)) { issues.err(p, `is too long (${v.length} characters; at most ${o.max || LIMITS.nameChars})`); return undefined; }
    if (o.multiline ? CONTROL.test(v) : /[\u0000-\u001f\u007f]/.test(v)) { issues.err(p, `contains control characters${o.multiline ? '' : ' or line breaks'}; use plain text`); return undefined; }
    if (o.nonEmpty && !v.trim()) { issues.err(p, 'must not be empty'); return undefined; }
    return v;
  }
  function objectField(issues, obj, key, path, o = {}) {
    const p = join(path, key);
    if (!own(obj, key) || obj[key] === undefined) { if (!o.optional) issues.err(p, `is missing${o.label ? ` (${o.label})` : ''}`); return undefined; }
    const v = obj[key];
    if (v === null && o.nullable) return null;
    if (!isObj(v)) { issues.err(p, `must be an object${o.label ? ` (${o.label})` : ''}, not ${describe(v)}`); return undefined; }
    return v;
  }

  // ------------------------------------------------------------------ load items (both wings)
  const ITEM_KINDS = Object.freeze(['point', 'distributed', 'elliptic', 'parabolic', 'table', 'schrenk']);
  const ITEM_KEYS = Object.freeze({
    point: ['kind', 'position', 'force', 'fraction', 'label'],
    distributed: ['kind', 'start', 'end', 'qStart', 'qEnd', 'fraction', 'label'],
    elliptic: ['kind', 'start', 'end', 'shape', 'total', 'peak', 'fraction', 'label'],
    parabolic: ['kind', 'start', 'end', 'shape', 'total', 'peak', 'fraction', 'label'],
    table: ['kind', 'points', 'fraction', 'source', 'label'],
    schrenk: ['kind', 'total', 'fraction', 'label'],
  });
  const SHAPES = Object.freeze(['start', 'end', 'middle']);
  const segmentsOf = (it) => (it && it.kind === 'table' && Array.isArray(it.points) ? Math.max(1, it.points.length - 1) : 1);
  const countSegments = (items) => (Array.isArray(items) ? items.reduce((s, it) => s + segmentsOf(it), 0) : 0);

  /**
   * Validated canonical copy of a list of load items, or undefined.
   * ctx: {lo, hi, pointLoOpen, len, line, rangeText, allowSchrenk, maxItems, maxSegments,
   *       toLen(v), toLine(v), convNote}  (toLen/toLine convert file units to engine units).
   */
  function checkItems(issues, raw, path, ctx) {
    if (!Array.isArray(raw)) { issues.err(path, `must be a list of load items, not ${describe(raw)}`); return undefined; }
    if (raw.length > ctx.maxItems) { issues.err(path, `has ${raw.length} load items; at most ${ctx.maxItems} are allowed`); return undefined; }
    const out = [];
    let bad = false;
    raw.forEach((it, i) => {
      const r = checkItem(issues, it, join(path, i), ctx);
      if (r === undefined) bad = true; else out.push(r);
    });
    if (bad) return undefined;
    const segments = countSegments(out);
    if (segments > ctx.maxSegments) {
      issues.err(path, `has ${segments} load segments in total (each item counts 1 and a table counts its rows − 1); at most ${ctx.maxSegments} are allowed`);
      return undefined;
    }
    return out;
  }
  function checkItem(issues, it, p, ctx) {
    if (!isObj(it)) { issues.err(p, `must be an object describing one load, not ${describe(it)}`); return undefined; }
    const kinds = ctx.allowSchrenk ? ITEM_KINDS : ITEM_KINDS.filter((k) => k !== 'schrenk');
    if (it.kind === 'schrenk' && !ctx.allowSchrenk) {
      issues.err(join(p, 'kind'), '"schrenk" load items exist for the printed wing only; the D.520 flight case sets its span loading with "distribution"');
      return undefined;
    }
    if (typeof it.kind !== 'string' || !kinds.includes(it.kind)) {
      issues.err(join(p, 'kind'), `must be one of ${kinds.map((k) => JSON.stringify(k)).join(', ')}, not ${describe(it.kind)}`);
      return undefined;
    }
    const kind = it.kind, n0 = issues.count, L = ctx.len, Q = ctx.line, note = ctx.convNote || '';
    const toLen = ctx.toLen || ((v) => v), toLine = ctx.toLine || ((v) => v);
    checkKeys(issues, it, p, ITEM_KEYS[kind]);
    const fileLen = ctx.fileLen || L, fileLine = ctx.fileLine || Q;
    const station = (key, label) => {
      const v = num(issues, it, key, p, { label, unit: fileLen });
      return v === undefined ? undefined : toLen(v);
    };
    const inRange = (key, v, { open = false } = {}) => {
      if (v === undefined) return;
      const okLo = open ? v > ctx.lo : v >= ctx.lo;
      if (!okLo || !(v <= ctx.hi)) issues.err(join(p, key), `${fmt(v)} ${L}${note} lies outside ${ctx.rangeText(open)}`);
    };
    const fraction = (optional) => num(issues, it, 'fraction', p, { ge: 0, le: 1, optional, label: 'chord fraction x/c measured from the local leading edge, 0–1' });
    const r = { kind };
    if (kind === 'point') {
      r.position = station('position', 'station from the root');
      r.force = num(issues, it, 'force', p, { unit: 'N', label: 'force, upward positive' });
      r.fraction = fraction(false);
      inRange('position', r.position, { open: ctx.pointLoOpen });
    } else if (kind === 'distributed' || kind === 'elliptic' || kind === 'parabolic') {
      r.start = station('start', 'start station');
      r.end = station('end', 'end station');
      inRange('start', r.start);
      inRange('end', r.end);
      if (r.start !== undefined && r.end !== undefined && !(r.end > r.start)) issues.err(join(p, 'end'), `must be greater than start (${fmt(r.start)} → ${fmt(r.end)} ${L}${note})`);
      if (kind === 'distributed') {
        const a = num(issues, it, 'qStart', p, { unit: fileLine, label: 'intensity at the start, upward positive' });
        const b = num(issues, it, 'qEnd', p, { unit: fileLine, label: 'intensity at the end, upward positive' });
        r.qStart = a === undefined ? undefined : toLine(a);
        r.qEnd = b === undefined ? undefined : toLine(b);
      } else {
        r.shape = choice(issues, it, 'shape', p, SHAPES);
        const hasT = own(it, 'total') && it.total !== null && it.total !== undefined;
        const hasP = own(it, 'peak') && it.peak !== null && it.peak !== undefined;
        if (hasT && hasP) issues.err(p, `give either total (N) or peak (${fileLine}), not both`);
        else if (!hasT && !hasP) issues.err(p, `needs either total (N) or peak (${fileLine})`);
        else if (hasT) r.total = num(issues, it, 'total', p, { unit: 'N', label: 'total force' });
        else { const v = num(issues, it, 'peak', p, { unit: fileLine, label: 'peak intensity' }); r.peak = v === undefined ? undefined : toLine(v); }
      }
      r.fraction = fraction(false);
    } else if (kind === 'table') {
      const pts = it.points, pp = join(p, 'points');
      let width = 0;
      if (!own(it, 'points')) issues.err(pp, `is missing (rows [y, w] or [y, w, x/c]; y in ${fileLen}, w in ${fileLine})`);
      else if (!Array.isArray(pts)) issues.err(pp, `must be a list of rows, not ${describe(pts)}`);
      else if (pts.length < LIMITS.tableRowsMin || pts.length > LIMITS.tableRowsMax) issues.err(pp, `must have ${LIMITS.tableRowsMin}–${LIMITS.tableRowsMax} rows (got ${pts.length}); nothing is truncated or resampled`);
      else {
        width = Array.isArray(pts[0]) ? pts[0].length : 0;
        if (width !== 2 && width !== 3) issues.err(join(pp, 0), `each row must be [y, w] or [y, w, x/c], not ${describe(pts[0])}`);
        else {
          const rows = [];
          pts.forEach((row, j) => {
            const rp = join(pp, j);
            if (!Array.isArray(row) || row.length !== width) { issues.err(rp, `must have ${width} numbers like the first row, not ${describe(row)}`); return; }
            const vals = [];
            for (let k = 0; k < width; k++) {
              if (!isNum(row[k])) { issues.err(join(rp, k), `must be a finite number, not ${describe(row[k])}`); return; }
              vals.push(row[k]);
            }
            const y = toLen(vals[0]), w = toLine(vals[1]);
            if (!(y >= ctx.lo && y <= ctx.hi)) issues.err(join(rp, 0), `station ${fmt(y)} ${L}${note} lies outside ${ctx.rangeText(false)}`);
            if (width === 3 && !(vals[2] >= 0 && vals[2] <= 1)) issues.err(join(rp, 2), `x/c must be between 0 and 1 (got ${fmt(vals[2])})`);
            if (rows.length && rows.length === j && !(y > rows[j - 1][0])) issues.err(join(rp, 0), `stations must increase strictly (${fmt(y)} after ${fmt(rows[j - 1][0])} ${L}); a step needs two separate loads`);
            rows.push(width === 3 ? [y, w, vals[2]] : [y, w]);
          });
          r.points = rows;
        }
      }
      if (width === 3) {
        if (own(it, 'fraction')) {
          const f = fraction(true);
          if (f !== undefined) { r.fraction = f; issues.warn(join(p, 'fraction'), 'is not used because every row gives its own x/c'); }
        }
      } else r.fraction = fraction(false);
      if (own(it, 'source')) {
        const sp = join(p, 'source'), s = it.source;
        if (!isObj(s)) issues.err(sp, `must be an object {filename, sha256, rows}, not ${describe(s)}`);
        else {
          checkKeys(issues, s, sp, ['filename', 'sha256', 'rows']);
          const src = {};
          const fn = text(issues, s, 'filename', sp, { optional: true, max: LIMITS.filenameChars });
          if (fn !== undefined) src.filename = fn;
          if (own(s, 'sha256')) {
            if (typeof s.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.sha256)) issues.err(join(sp, 'sha256'), 'must be 64 lower-case hexadecimal characters');
            else src.sha256 = s.sha256;
          }
          const rows = num(issues, s, 'rows', sp, { optional: true, integer: true, ge: 1, label: 'number of data rows in the source file' });
          if (rows !== undefined) {
            src.rows = rows;
            if (Array.isArray(pts) && rows !== pts.length) issues.warn(join(sp, 'rows'), `says ${rows} rows but the table has ${pts.length}`);
          }
          r.source = src;
        }
      }
    } else if (kind === 'schrenk') {
      r.total = num(issues, it, 'total', p, { unit: 'N', label: 'total force over the semi-span' });
      r.fraction = fraction(false);
    }
    const label = text(issues, it, 'label', p, { optional: true, max: LIMITS.labelChars });
    if (label !== undefined) r.label = label;
    if (issues.count > n0) return undefined;
    return r;
  }
  function describeItem(it, u) {
    const at = it.fraction !== undefined ? `, at ${fmt(it.fraction)}c` : '';
    const tag = it.label ? ` — “${it.label}”` : '';
    switch (it.kind) {
      case 'point': return `Point force ${fmt(it.force)} N at y = ${fmt(it.position)} ${u.len}${at}${tag}`;
      case 'distributed': return `Linear line load ${fmt(it.qStart)} → ${fmt(it.qEnd)} ${u.line} over y = ${fmt(it.start)}–${fmt(it.end)} ${u.len}${at}${tag}`;
      case 'elliptic': case 'parabolic':
        return `${it.kind === 'elliptic' ? 'Elliptic' : 'Parabolic'} line load, maximum at the ${it.shape === 'middle' ? 'middle (zero at both ends)' : it.shape}, over y = ${fmt(it.start)}–${fmt(it.end)} ${u.len}; ${it.total !== undefined && it.total !== null ? `total ${fmt(it.total)} N` : `peak ${fmt(it.peak)} ${u.line}`}${at}${tag}`;
      case 'table': {
        const pts = it.points, rows = pts.length;
        const where = pts[0].length === 3 ? ', x/c given per row' : at;
        const src = it.source && (it.source.filename || it.source.sha256) ? `; source ${it.source.filename || 'file'}${it.source.sha256 ? ` (SHA-256 ${it.source.sha256.slice(0, 12)}…)` : ''}` : '';
        return `Tabulated line load, ${rows} rows (${rows - 1} segments) over y = ${fmt(pts[0][0])}–${fmt(pts[rows - 1][0])} ${u.len}, ${u.line}${where}${src}${tag}`;
      }
      case 'schrenk': return `Schrenk distribution over the whole semi-span, total ${fmt(it.total)} N${at}${tag}`;
      default: return String(it.kind);
    }
  }
  // Export-side canonical copy of a UI load item (only the fields of its kind; engine-equivalent values).
  function canonicalItemFromUi(it, printed) {
    if (!isObj(it)) return it;
    const r = {};
    const keys = own(ITEM_KEYS, it.kind) ? ITEM_KEYS[it.kind] : Object.keys(it);
    for (const k of keys) if (own(it, k) && it[k] !== undefined) r[k] = clone(it[k]);
    // The printed engine reads a missing point/distributed chord fraction as 0.3c.
    if (printed && (it.kind === 'point' || it.kind === 'distributed') && (it.fraction === undefined || it.fraction === null)) r.fraction = 0.3;
    if (it.kind === 'elliptic' || it.kind === 'parabolic') {
      // A normalised curve may carry both values plus the basis it was entered with: keep the basis only.
      if (it.basis === 'total' || it.basis === 'peak') delete r[it.basis === 'total' ? 'peak' : 'total'];
      for (const k of ['total', 'peak']) if (r[k] === null) delete r[k];
    }
    if (it.kind === 'table' && (r.fraction === null || r.fraction === undefined)) delete r.fraction;
    if (r.label === null || r.label === '') delete r.label;
    return r;
  }

  // ------------------------------------------------------------------ engine support probes
  // An engine that predates a load kind rejects it. Probing once per engine and kind tells "this page's
  // engine cannot analyse this kind yet" apart from a physics error in an item it can analyse.
  const probeCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  const PRINTED_PROBES = {
    point: (L) => ({ kind: 'point', position: L, force: 1, fraction: 0.3 }),
    distributed: (L) => ({ kind: 'distributed', start: 0, end: L, qStart: 0.001, qEnd: 0.001, fraction: 0.3 }),
    elliptic: (L) => ({ kind: 'elliptic', start: 0, end: L, shape: 'start', total: 1, fraction: 0.3 }),
    parabolic: (L) => ({ kind: 'parabolic', start: 0, end: L, shape: 'start', total: 1, fraction: 0.3 }),
    table: (L) => ({ kind: 'table', points: [[0, 0.001], [L, 0.001]], fraction: 0.3 }),
    schrenk: () => ({ kind: 'schrenk', total: 1, fraction: 0.3 }),
  };
  const D520_PROBES = {
    point: (a, b) => ({ kind: 'point', position: b, force: 1, fraction: 0.25 }),
    distributed: (a, b) => ({ kind: 'distributed', start: a, end: b, qStart: 1, qEnd: 1, fraction: 0.25 }),
    elliptic: (a, b) => ({ kind: 'elliptic', start: a, end: b, shape: 'start', total: 1, fraction: 0.25 }),
    parabolic: (a, b) => ({ kind: 'parabolic', start: a, end: b, shape: 'start', total: 1, fraction: 0.25 }),
    table: (a, b) => ({ kind: 'table', points: [[a, 1], [b, 1]], fraction: 0.25 }),
  };
  function engineSupports(engine, workspace, kind) {
    let memo = probeCache ? probeCache.get(engine) : null;
    if (!memo) { memo = new Map(); if (probeCache) probeCache.set(engine, memo); }
    const key = `${workspace}:${kind}`;
    if (!memo.has(key)) {
      let ok = false;
      try {
        if (workspace === 'printed') {
          const L = engine.DEFAULT_GEOMETRY.semiSpan;
          engine.normalize({ load: { ...engine.DEFAULT_LOAD, kind: 'custom', items: [PRINTED_PROBES[kind](L)] } });
        } else {
          const P = engine.D520, a = P.fittingY, b = P.ribs[P.ribs.length - 1];
          engine.normalise({ n: 1, customLoads: [D520_PROBES[kind](a, b)] });
        }
        ok = true;
      } catch (e) { ok = false; }
      memo.set(key, ok);
    }
    return memo.get(key);
  }
  const engineMessage = (e, name) => `${e && e.message ? e.message : String(e)} (${name} check)`;
  function pathFor(rules, base, message) {
    for (const [re, rel] of rules) {
      const m = re.exec(message);
      if (m) return String(typeof rel === 'function' ? rel(m) : rel).split('.').reduce(join, base);
    }
    return base;
  }
  const PRINTED_RULES = [
    [/four-digit NACA|camber position|Airfoil thickness/i, 'geometry.naca'],
    [/Rod positions/i, 'geometry.rodFractions'],
    [/Tip chord/i, 'geometry.tipChord'],
    [/\bmodules\b/i, 'geometry.modules'],
    [/Interface rib offset/i, 'geometry.interfaceOffset'],
    [/clearance/i, 'geometry.clearance'],
    [/requested interior ribs/i, 'geometry.interiorRibs'],
    [/interior ribs/i, 'geometry.customInteriorRibs'],
    [/^(\w+) must be positive/, (m) => `geometry.${m[1]}`],
    [/disconnects the wing/i, 'geometry.rodFractions'],
    [/load|station|span/i, 'load'],
  ];
  const D520_RULES = [
    [/span-loading distribution/i, 'distribution'], [/support condition/i, 'support'], [/Aircraft mass/i, 'mass'],
    [/Reference CL/i, 'CL'], [/Scale factor for (\w+)/i, (m) => `scales.${m[1]}`], [/Load factor/i, 'n'],
    [/custom loads|load type|Point station|Distributed bounds|chord fraction/i, 'customLoads'],
    [/material|Poisson|ultimate|rupture/i, 'material'],
  ];

  // ------------------------------------------------------------------ printed wing: schema
  const GEOMETRY_V1 = Object.freeze(['naca', 'semiSpan', 'rootChord', 'tipChord', 'skin', 'ribThickness', 'modules', 'te', 'interiorRibs',
    'customInteriorRibs', 'interfaceOffset', 'cap', 'cavityStart', 'cavityEnd', 'rodFractions', 'rodDiameter', 'clearance', 'sleeveWall']);
  const GEOMETRY_V2 = Object.freeze(['planform','airfoil','sweepDeg','dihedralDeg','sweepReferenceFraction','twistReferenceFraction','twistEnabled','stations']);
  const hasAdvancedGeometry = (g) => GEOMETRY_V2.some(k => own(g,k) && g[k] != null);
  function checkAirfoil(issues,p,path){
    if(!isObj(p)){issues.err(path,'must be an airfoil profile object');return;}
    const analytic=p.kind==='naca4'||p.kind==='naca5';
    checkKeys(issues,p,path,analytic?['kind','code']:['kind','version','name','upper','lower','source']);
    if(!analytic&&p.kind!=='coordinates'){issues.err(join(path,'kind'),'use naca4, naca5 or coordinates');return;}
    if(analytic){if(typeof p.code!=='string')issues.err(join(path,'code'),'must be an airfoil code as text');return;}
    if(p.version!=null&&p.version!==1)issues.err(join(path,'version'),'coordinate profile version must be 1');
    if(p.name!=null)text(issues,p,'name',path,{max:80});
    for(const key of ['upper','lower']){
      const rows=p[key],rp=join(path,key);
      if(!Array.isArray(rows)||rows.length<3||rows.length>256){issues.err(rp,'must contain 3–256 normalized [x/c,z/c] points');continue;}
      rows.forEach((row,i)=>{if(!Array.isArray(row)||row.length!==2||row.some(x=>!isNum(x)))issues.err(join(rp,i),'must be exactly two finite coordinates');});
    }
    if(p.source!=null){
      if(!isObj(p.source)){issues.err(join(path,'source'),'must be provenance metadata');return;}
      checkKeys(issues,p.source,join(path,'source'),['format','filename','normalization','url','family']);
      for(const k of Object.keys(p.source))text(issues,p.source,k,join(path,'source'),{max:k==='url'?1024:180});
      if(p.source.normalization!=null&&p.source.normalization!=='unit-chord')issues.err(join(path,'source.normalization'),'only unit-chord coordinates are supported');
    }
  }
  const POSITIVE_MM = Object.freeze({
    semiSpan: 'semi-span', rootChord: 'root chord', tipChord: 'tip chord', skin: 'skin thickness, measured vertically',
    ribThickness: 'rib thickness', te: 'trailing-edge thickness', cap: 'root and tip cap thickness',
    interfaceOffset: 'interface rib offset from a seam', rodDiameter: 'rod diameter', sleeveWall: 'printed sleeve wall',
  });
  const ASSEMBLY_V1 = Object.freeze(['rodsBonded', 'seamsBonded', 'seamFreeLength', 'adhesiveTensile']);
  const CRITERIA_V1 = Object.freeze(['maxTipDeflection', 'maxTipTwist']);
  const PRINTED_LOAD_KEYS = Object.freeze({
    flight: ['aircraftMass', 'loadFactor', 'distribution', 'liftFraction', 'inertiaRelief', 'tipFraction', 'fos', 'tipMass', 'selfWeight'],
    tip: ['tipForce', 'tipFraction', 'fos', 'tipMass', 'selfWeight'],
    custom: ['items', 'fos', 'tipMass', 'selfWeight'],
  });
  const FLIGHT_DISTRIBUTIONS = Object.freeze(['schrenk', 'elliptic', 'planform', 'uniform', 'tip']);

  // Fields of the engine defaults that this version does not know are carried through by type.
  function extraField(issues, raw, key, path, dflt) {
    const p = join(path, key);
    if (!own(raw, key) || raw[key] === undefined) {
      issues.warn(p, `is not in the file; the engine default ${JSON.stringify(dflt)} is used`);
      return clone(dflt);
    }
    const v = raw[key];
    const kind = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
    if (typeof dflt === 'number' ? !isNum(v) : dflt !== null && kind(v) !== kind(dflt)) { issues.err(p, `must have the same type as the engine default (${kind(dflt)}), not ${describe(v)}`); return undefined; }
    return clone(v);
  }

  function checkPrintedGeometry(issues, raw, path, E) {
    if (!isObj(raw)) { issues.err(path, `must be an object with the wing geometry, not ${describe(raw)}`); return undefined; }
    const extras = Object.keys(E.DEFAULT_GEOMETRY).filter((k) => !GEOMETRY_V1.includes(k));
    checkKeys(issues, raw, path, [...GEOMETRY_V1, ...extras,...GEOMETRY_V2]);
    const n0 = issues.count, g = {};
    if (!own(raw, 'naca')) issues.err(join(path, 'naca'), 'is missing (four digits of a NACA 4-digit section, such as "2412")');
    else if (typeof raw.naca !== 'string' || !/^\d{4}$/.test(raw.naca)) issues.err(join(path, 'naca'), `must be the four digits of a NACA 4-digit section as text, such as "2412", not ${describe(raw.naca)}`);
    else { try { g.naca = E.normalizeNaca(raw.naca); } catch (e) { issues.err(join(path, 'naca'), engineMessage(e, 'WingEngine')); } }
    for (const [k, label] of Object.entries(POSITIVE_MM)) g[k] = num(issues, raw, k, path, { ...(k==='tipChord'&&['delta','elliptic'].includes(raw.planform)?{ge:0}:{gt:0}), unit: 'mm', label });
    g.modules = num(issues, raw, 'modules', path, { integer: true, ge: 1, le: 3, label: 'number of printed modules' });
    g.interiorRibs = num(issues, raw, 'interiorRibs', path, { integer: true, ge: 0, label: 'requested evenly spaced interior ribs' });
    const rp = join(path, 'customInteriorRibs');
    if (!own(raw, 'customInteriorRibs')) issues.err(rp, 'is missing (null, or a list of interior rib stations in mm)');
    else if (raw.customInteriorRibs === null) g.customInteriorRibs = null;
    else if (!Array.isArray(raw.customInteriorRibs)) issues.err(rp, `must be null or a list of rib stations in mm, not ${describe(raw.customInteriorRibs)}`);
    else {
      const ribs = [];
      raw.customInteriorRibs.forEach((v, i) => {
        if (!isNum(v)) { issues.err(join(rp, i), `must be a finite number in mm, not ${describe(v)}`); return; }
        if (ribs.length === i && i && !(v > ribs[i - 1])) issues.err(join(rp, i), `rib stations must be listed in strictly increasing order (${fmt(v)} after ${fmt(ribs[i - 1])} mm)`);
        ribs.push(v);
      });
      g.customInteriorRibs = ribs;
    }
    g.cavityStart = num(issues, raw, 'cavityStart', path, { gt: 0, lt: 1, label: 'start of the hollow cavity, x/c' });
    g.cavityEnd = num(issues, raw, 'cavityEnd', path, { gt: 0, lt: 1, label: 'end of the hollow cavity, x/c' });
    if (isNum(g.cavityStart) && isNum(g.cavityEnd) && !(g.cavityEnd > g.cavityStart)) issues.err(join(path, 'cavityEnd'), `must be greater than cavityStart (${fmt(g.cavityStart)} → ${fmt(g.cavityEnd)})`);
    const fp = join(path, 'rodFractions');
    if (!own(raw, 'rodFractions')) issues.err(fp, 'is missing (list of rod positions x/c; an empty list means no rods)');
    else if (!Array.isArray(raw.rodFractions)) issues.err(fp, `must be a list of rod positions x/c, not ${describe(raw.rodFractions)}`);
    else if (raw.rodFractions.length > LIMITS.rods) issues.err(fp, `lists ${raw.rodFractions.length} rods; at most ${LIMITS.rods} are allowed`);
    else {
      const fr = [];
      raw.rodFractions.forEach((v, i) => {
        if (!isNum(v)) issues.err(join(fp, i), `must be a finite number (x/c), not ${describe(v)}`);
        else if (!(v > 0 && v < 1)) issues.err(join(fp, i), `must lie strictly between 0 and 1 (got ${fmt(v)})`);
        fr.push(v);
      });
      g.rodFractions = fr;
    }
    g.clearance = num(issues, raw, 'clearance', path, { ge: 0, le: 0.8, unit: 'mm', label: 'radial rod clearance' });
    if (isNum(g.tipChord) && isNum(g.rootChord) && g.tipChord > g.rootChord) issues.err(join(path, 'tipChord'), `cannot exceed the root chord (${fmt(g.tipChord)} mm > ${fmt(g.rootChord)} mm): only linear taper with tip ≤ root is analysed`);
    for (const k of extras) g[k] = extraField(issues, raw, k, path, E.DEFAULT_GEOMETRY[k]);
    for(const k of GEOMETRY_V2)if(own(raw,k)){
      if(raw[k]===null){issues.err(join(path,k),'omit optional geometry fields instead of null');continue;}
      g[k]=clone(raw[k]);
    }
    if(g.airfoil)checkAirfoil(issues,g.airfoil,join(path,'airfoil'));
    if(own(g,'stations')){
      if(!Array.isArray(g.stations)||g.stations.length<2||g.stations.length>9)issues.err(join(path,'stations'),'use 2–9 root-to-tip airfoil stations');
      else g.stations.forEach((s,i)=>{const sp=join(join(path,'stations'),i);if(!isObj(s)){issues.err(sp,'must be a station object');return;}checkKeys(issues,s,sp,['eta','airfoil','incidenceDeg']);checkAirfoil(issues,s.airfoil,join(sp,'airfoil'));});
    }
    if (issues.count > n0) return undefined;
    const out = {};
    for (const k of Object.keys(E.DEFAULT_GEOMETRY)) out[k] = g[k];
    for (const k of GEOMETRY_V1) if (!own(out, k)) out[k] = g[k];
    for(const k of GEOMETRY_V2)if(own(g,k))out[k]=g[k];
    return out;
  }
  function checkMaterials(issues, raw, path, E) {
    if (!isObj(raw)) { issues.err(path, `must be an object {plaKey, plaOver, rodKey, rodOver}, not ${describe(raw)}`); return undefined; }
    checkKeys(issues, raw, path, ['plaKey', 'plaOver', 'rodKey', 'rodOver']);
    const n0 = issues.count;
    const keysOf = (kind) => Object.keys(E.MATERIALS).filter((k) => E.MATERIALS[k] && E.MATERIALS[k].kind === kind);
    const card = (key, kind) => {
      const v = choice(issues, raw, key, path, keysOf(kind));
      return v;
    };
    const over = (key, fields) => {
      const p = join(path, key), o = raw[key], out = {};
      if (!own(raw, key)) { issues.err(p, `is missing (an object of overrides; null keeps the card value)`); return undefined; }
      if (!isObj(o)) { issues.err(p, `must be an object of overrides, not ${describe(o)}`); return undefined; }
      checkKeys(issues, o, p, fields);
      for (const f of fields) {
        if (!own(o, f) || o[f] === null) { out[f] = null; continue; }
        out[f] = num(issues, o, f, p, { ...(f==='nu'?{ge:0,lt:.5}:{gt:0}), unit:f==='nu'?'dimensionless':f==='rho'?'g/cm³':'MPa', label: 'override (null keeps the card value)' });
      }
      return out;
    };
    const m = { plaKey: card('plaKey', 'pla'), plaOver: over('plaOver', ['E', 'ft', 'fc', 'fs','rho','nu']), rodKey: card('rodKey', 'rod'), rodOver: over('rodOver', ['E']) };
    return issues.count > n0 ? undefined : m;
  }
  function checkAssembly(issues, raw, path, E) {
    if (!isObj(raw)) { issues.err(path, `must be an object with the joints, not ${describe(raw)}`); return undefined; }
    const extras = Object.keys(E.DEFAULT_ASSEMBLY || {}).filter((k) => !ASSEMBLY_V1.includes(k));
    checkKeys(issues, raw, path, [...ASSEMBLY_V1, ...extras]);
    const n0 = issues.count;
    const a = {
      rodsBonded: bool(issues, raw, 'rodsBonded', path, { label: 'rods epoxied into their sleeves' }),
      seamsBonded: bool(issues, raw, 'seamsBonded', path, { label: 'module seams epoxied' }),
      seamFreeLength: num(issues, raw, 'seamFreeLength', path, { nullable: true, gt: 0, unit: 'mm', label: 'rod free length at a dry seam; null means 2 × interface offset' }),
      adhesiveTensile: num(issues, raw, 'adhesiveTensile', path, { gt: 0, unit: 'MPa', label: 'epoxy butt-joint strength' }),
    };
    for (const k of extras) a[k] = extraField(issues, raw, k, path, E.DEFAULT_ASSEMBLY[k]);
    return issues.count > n0 ? undefined : a;
  }
  function checkCriteria(issues, raw, path, E, conv) {
    if (!isObj(raw)) { issues.err(path, `must be an object {maxTipDeflection, maxTipTwist}, not ${describe(raw)}`); return undefined; }
    const extras = Object.keys(E.DEFAULT_CRITERIA || {}).filter((k) => !CRITERIA_V1.includes(k));
    checkKeys(issues, raw, path, [...CRITERIA_V1, ...extras]);
    const n0 = issues.count;
    const d = num(issues, raw, 'maxTipDeflection', path, { gt: 0, unit: conv ? conv.fileLen : 'mm', label: 'allowed tip deflection' });
    const c = {
      maxTipDeflection: d === undefined ? undefined : conv ? conv.toLen(d) : d,
      maxTipTwist: num(issues, raw, 'maxTipTwist', path, { gt: 0, unit: 'deg', label: 'allowed tip twist' }),
    };
    for (const k of extras) c[k] = extraField(issues, raw, k, path, E.DEFAULT_CRITERIA[k]);
    return issues.count > n0 ? undefined : c;
  }
  /** conv (design-parameter files only): {fileLen, fileLine, toLen, toLine, note}. */
  function checkPrintedLoad(issues, raw, path, semiSpan, E, conv) {
    if (!isObj(raw)) { issues.err(path, `must be an object describing the load case, not ${describe(raw)}`); return undefined; }
    const kind = choice(issues, raw, 'kind', path, ['flight', 'tip', 'custom']);
    if (kind === undefined) return undefined;
    const n0 = issues.count;
    const allowed = ['kind', 'name', ...PRINTED_LOAD_KEYS[kind]];
    for (const k of Object.keys(raw)) {
      if (allowed.includes(k)) continue;
      const other = Object.keys(PRINTED_LOAD_KEYS).find((q) => PRINTED_LOAD_KEYS[q].includes(k));
      if (other) issues.warn(join(path, k), `ignored: it belongs to the "${other}" load case, not to "${kind}"`);
      else issues.err(join(path, k), `unknown field: it is not part of version ${FILE_VERSION} of this format (see WING_IMPORT.md); remove it`);
    }
    const L = { kind };
    L.selfWeight=own(raw,'selfWeight')?bool(issues,raw,'selfWeight',path,{label:'include 1-g wing self-weight'}):false;
    const fos = () => {
      const v = num(issues, raw, 'fos', path, { gt: 0, label: 'factor of safety on strength and buckling' });
      if (v !== undefined && v < 1) issues.warn(join(path, 'fos'), `a factor of safety of ${fmt(v)} is below 1`);
      return v;
    };
    const tipMass = () => num(issues, raw, 'tipMass', path, { ge: 0, unit: 'g', label: 'tip sensor mass' });
    if (kind === 'flight') {
      L.aircraftMass = num(issues, raw, 'aircraftMass', path, { gt: 0, unit: 'kg', label: 'aircraft mass' });
      L.loadFactor = num(issues, raw, 'loadFactor', path, { label: 'load factor n (lift / weight)' });
      L.distribution = choice(issues, raw, 'distribution', path, FLIGHT_DISTRIBUTIONS);
      L.liftFraction = num(issues, raw, 'liftFraction', path, { ge: 0, le: 1, label: 'chord fraction where the lift acts' });
      L.inertiaRelief = bool(issues, raw, 'inertiaRelief', path, { label: 'subtract the wing weight at n g' });
      if (own(raw, 'tipFraction')) L.tipFraction = num(issues, raw, 'tipFraction', path, { ge: 0, le: 1, label: 'chord fraction of the tip mass' });
      else {
        L.tipFraction = E.DEFAULT_LOAD.tipFraction;
        if (raw.tipMass > 0 && raw.inertiaRelief === true) issues.warn(join(path, 'tipFraction'), `is not given; the tip mass acts at the engine default ${fmt(L.tipFraction)}c`);
      }
      L.fos = fos(); L.tipMass = tipMass();
    } else if (kind === 'tip') {
      L.tipForce = num(issues, raw, 'tipForce', path, { unit: 'N', label: 'tip force, upward positive' });
      L.tipFraction = num(issues, raw, 'tipFraction', path, { ge: 0, le: 1, label: 'chord fraction of the tip force' });
      L.fos = fos(); L.tipMass = tipMass();
    } else {
      const ip = join(path, 'items');
      if (!own(raw, 'items')) issues.err(ip, 'is missing (a list of load items; an empty list means no load is defined yet)');
      else if (isNum(semiSpan)) {
        L.items = checkItems(issues, raw.items, ip, {
          lo: 0, hi: semiSpan, pointLoOpen: true, len: 'mm', line: 'N/mm', allowSchrenk: true,
          maxItems: LIMITS.printedItems, maxSegments: LIMITS.printedSegments,
          rangeText: (open) => `${open ? '0 < y' : '0 ≤ y'} ≤ semi-span ${fmt(semiSpan)} mm`,
          fileLen: conv ? conv.fileLen : 'mm', fileLine: conv ? conv.fileLine : 'N/mm',
          toLen: conv ? conv.toLen : undefined, toLine: conv ? conv.toLine : undefined, convNote: conv ? conv.note : '',
        });
      }
      L.fos = fos(); L.tipMass = tipMass();
    }
    const name = text(issues, raw, 'name', path, { optional: true, max: LIMITS.nameChars });
    if (name !== undefined) L.name = name;
    return issues.count > n0 ? undefined : L;
  }
  function checkPrintedStudy(issues, raw, path, E, opts = {}) {
    if (!isObj(raw)) { issues.err(path, `must be an object {geometry, materials, assembly, load, criteria}, not ${describe(raw)}`); return undefined; }
    checkKeys(issues, raw, path, ['geometry', 'materials', 'assembly', 'load', 'criteria', 'analysis', 'fabrication', 'aerodynamics', 'aeroLoad']);
    let analysis,fabrication,aerodynamics;
    if(own(raw,'aerodynamics'))aerodynamics=checkAerodynamics(issues,raw.aerodynamics,join(path,'aerodynamics'));
    if(own(raw,'fabrication')){
      const fp=join(path,'fabrication');
      if(!isObj(raw.fabrication))issues.err(fp,'must be an object {mirrorFullWing}');
      else{
        checkKeys(issues,raw.fabrication,fp,['mirrorFullWing']);
        if(typeof raw.fabrication.mirrorFullWing!=='boolean')issues.err(join(fp,'mirrorFullWing'),'must be true or false');
        else fabrication={mirrorFullWing:raw.fabrication.mirrorFullWing};
      }
    }
    if(own(raw,'analysis')){
      if(!isObj(raw.analysis))issues.err(join(path,'analysis'),'must be an analysis settings object');
      else{
        checkKeys(issues,raw.analysis,join(path,'analysis'),['nElements','finiteSectionTorsion']);
        analysis={};
        if(own(raw.analysis,'nElements')){
          const n=raw.analysis.nElements;
          if(!Number.isInteger(n)||n<4||n>100)issues.err(join(path,'analysis.nElements'),'must be an integer from 4 to 100');
          else analysis.nElements=n;
        }
        if(own(raw.analysis,'finiteSectionTorsion')){
          if(typeof raw.analysis.finiteSectionTorsion!=='boolean')issues.err(join(path,'analysis.finiteSectionTorsion'),'must be true or false');
          else analysis.finiteSectionTorsion=raw.analysis.finiteSectionTorsion;
        }
      }
    }
    const need = (k) => { if (!own(raw, k)) issues.err(join(path, k), 'is missing'); return own(raw, k); };
    const geometry = need('geometry') ? checkPrintedGeometry(issues, raw.geometry, join(path, 'geometry'), E) : undefined;
    const materials = need('materials') ? checkMaterials(issues, raw.materials, join(path, 'materials'), E) : undefined;
    const assembly = need('assembly') ? checkAssembly(issues, raw.assembly, join(path, 'assembly'), E) : undefined;
    const load = need('load') ? checkPrintedLoad(issues, raw.load, join(path, 'load'), geometry ? geometry.semiSpan : undefined, E) : undefined;
    const criteria = need('criteria') ? checkCriteria(issues, raw.criteria, join(path, 'criteria'), E) : undefined;
    if ([geometry, materials, assembly, load, criteria].includes(undefined)) return undefined;
    if(own(raw,'aerodynamics')&&aerodynamics===undefined)return undefined;
    let aeroLoad;
    if(own(raw,'aeroLoad')){aeroLoad=checkAeroLoad(issues,raw.aeroLoad,join(path,'aeroLoad'),geometry,opts);if(aeroLoad===undefined)return undefined;if(load.kind==='flight')issues.err(join(path,'load','kind'),'must be custom (or tip) with an applied aerodynamic load: the panel-method load replaces the prescribed flight lift');}
    return { geometry, materials, assembly, load, criteria, ...(analysis?{analysis}:{}),...(fabrication?{fabrication}:{}),...(aerodynamics?{aerodynamics}:{}),...(aeroLoad?{aeroLoad}:{}) };
  }
  // Aerodynamic panel-method INPUTS (study.aerodynamics). Results are always recomputed, never stored here.
  // Limits mirror wing_aero_panel.js: incompressible (Mach <= 0.3), attached-flow angle range,
  // symmetric flight (no sideslip field), bounded panel counts.
  const AERO_KEYS = Object.freeze(['speed', 'density', 'alphaDeg', 'viscosity', 'speedOfSound', 'mesh', 'sequence']);
  // Mesh sequences of wing_aero_panel.js (SEQUENCES): chordwise panels per surface at baseSpan strips, then
  // spanwise strips at baseChord panels, then the joint mesh (refined in both directions; it gives the cross term).
  // A stored load must contain exactly these meshes; a load stored before the joint mesh existed (the first
  // seven meshes only) is still read, and the page combines it additively as it was when it was written.
  const AERO_SEQUENCES = Object.freeze({ standard: Object.freeze({ chord: [16, 24, 32, 48], span: [8, 12, 16, 24], baseChord: 32, baseSpan: 16, joint: [24, 24] }), fine: Object.freeze({ chord: [32, 48, 64, 96], span: [16, 24, 32, 48], baseChord: 32, baseSpan: 16, joint: [48, 24] }) });
  const AERO_LOAD_KEYS = Object.freeze(['kind', 'label', 'sequence', 'geometrySha256', 'flow', 'levels']);
  const AERO_LEVEL_KEYS = Object.freeze(['chordPanels', 'spanPanels', 'strips', 'coefficients', 'roundedTip']);
  const AERO_COEFFICIENTS = Object.freeze(['CL', 'CLTrefftz', 'CDpressure', 'CDiTrefftz', 'Cm']);
  const sequenceMeshList = (d) => { const list = []; for (const [c, sp] of [...d.chord.map((c) => [c, d.baseSpan]), ...d.span.map((sp) => [d.baseChord, sp])]) if (!list.some((m) => m[0] === c && m[1] === sp)) list.push([c, sp]); return list; };
  // The page registers how to key an outer wing shape (SHA-256 of WingAeroPanel.geometryKey); opts.aeroGeometryKey
  // overrides it for one call. Without either, a study with an applied aerodynamic load is refused.
  let aeroGeometryKeyHook = null;
  function setAeroGeometryKey(fn) { if (fn !== null && typeof fn !== 'function') throw new Error('setAeroGeometryKey needs a function or null.'); aeroGeometryKeyHook = fn; }
  // Applied aerodynamic load (Wing AeroStruct): the solved levels of one mesh sequence. Every number is checked;
  // the delivered (extrapolated) strip load and its admission are recomputed from these levels by the page.
  function checkAeroLoad(issues, raw, path, geometry, opts) {
    if (!isObj(raw)) { issues.err(path, `must be an object {kind, label, sequence, geometrySha256, flow, levels}, not ${describe(raw)}`); return undefined; }
    const n0 = issues.count;
    checkKeys(issues, raw, path, AERO_LOAD_KEYS);
    for (const k of AERO_LOAD_KEYS) if (!own(raw, k)) issues.err(join(path, k), 'is missing');
    if (issues.count > n0) return undefined;
    if (raw.kind !== 'panelSequence') issues.err(join(path, 'kind'), `must be "panelSequence", not ${describe(raw.kind)}`);
    const label = text(issues, raw, 'label', path, { max: LIMITS.labelChars });
    const def = own(AERO_SEQUENCES, raw.sequence) ? AERO_SEQUENCES[raw.sequence] : null;
    if (!def) issues.err(join(path, 'sequence'), `must be "standard" or "fine", not ${describe(raw.sequence)}`);
    if (typeof raw.geometrySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.geometrySha256)) issues.err(join(path, 'geometrySha256'), 'must be 64 lowercase hexadecimal characters (SHA-256)');
    const fp = join(path, 'flow');
    if (!isObj(raw.flow)) issues.err(fp, 'must be an object {speed, density, alphaDeg, viscosity, speedOfSound}');
    else for (const k of ['speed', 'density', 'alphaDeg', 'viscosity', 'speedOfSound']) if (!own(raw.flow, k)) issues.err(join(fp, k), 'is missing');
    const flow = isObj(raw.flow) ? checkAerodynamics(issues, raw.flow, fp) : undefined;
    if (flow && (own(flow, 'mesh') || own(flow, 'sequence'))) issues.err(fp, 'holds the flow only (speed, density, alphaDeg, viscosity, speedOfSound)');
    const L = geometry && isNum(geometry.semiSpan) ? geometry.semiSpan : null, lp = join(path, 'levels'), levels = [];
    if (!Array.isArray(raw.levels)) issues.err(lp, 'must be a list of solved meshes');
    else if (def) {
      const legacy = sequenceMeshList(def), withJoint = [...legacy, def.joint], expected = raw.levels.length === legacy.length ? legacy : withJoint;
      if (raw.levels.length !== withJoint.length && raw.levels.length !== legacy.length) issues.err(lp, `must hold the ${withJoint.length} meshes of the ${raw.sequence} sequence (or its first ${legacy.length}, as stored before the joint mesh existed), not ${raw.levels.length}`);
      raw.levels.forEach((lv, i) => {
        const p = join(lp, String(i));
        if (!isObj(lv)) { issues.err(p, 'must be an object {chordPanels, spanPanels, strips, coefficients, roundedTip}'); return; }
        checkKeys(issues, lv, p, AERO_LEVEL_KEYS);
        const c = num(issues, lv, 'chordPanels', p, { integer: true, ge: 6, le: 96, label: 'panels per surface' }), sp = num(issues, lv, 'spanPanels', p, { integer: true, ge: 4, le: 48, label: 'spanwise strips' });
        if (isNum(c) && isNum(sp) && !expected.some((m) => m[0] === c && m[1] === sp)) issues.err(p, `${2 * c} × ${sp} panels is not a mesh of the ${raw.sequence} sequence`);
        if (isNum(c) && isNum(sp) && levels.some((l) => l.chordPanels === c && l.spanPanels === sp)) issues.err(p, 'repeats a mesh');
        const strips = [], spth = join(p, 'strips');
        if (!Array.isArray(lv.strips) || lv.strips.length < 1 || lv.strips.length > 80) issues.err(spth, 'must be a list of 1 to 80 strips [y0, y1, Fx, Fy, Fz, Mx, My, Mz]');
        else lv.strips.forEach((r, j) => {
          const rp = join(spth, String(j));
          if (!Array.isArray(r) || r.length !== 8 || !r.every((v) => isNum(v) && Math.abs(v) <= 1e9)) { issues.err(rp, 'must be 8 finite numbers [y0, y1, Fx, Fy, Fz, Mx, My, Mz] (mm, N, N mm)'); return; }
          if (!(r[1] > r[0])) issues.err(rp, 'must have y1 > y0');
          if (j === 0 && r[0] !== 0) issues.err(rp, 'the first strip must start at the root, y0 = 0');
          if (j > 0 && Array.isArray(lv.strips[j - 1]) && r[0] !== lv.strips[j - 1][1]) issues.err(rp, 'strips must be contiguous (y0 equals the previous y1)');
          if (L !== null && (r[0] < 0 || r[1] > L * (1 + 1e-12))) issues.err(rp, `must lie within the semi-span 0 to ${fmt(L)} mm`);
          strips.push(r.slice());
        });
        if (L !== null && strips.length && Math.abs(strips[strips.length - 1][1] - L) > 1e-9 * L) issues.err(spth, `must end at the tip, y = ${fmt(L)} mm`);
        const cp = join(p, 'coefficients'), coefficients = {};
        if (!isObj(lv.coefficients)) issues.err(cp, `must be an object {${AERO_COEFFICIENTS.join(', ')}}`);
        else { checkKeys(issues, lv.coefficients, cp, AERO_COEFFICIENTS); for (const k of AERO_COEFFICIENTS) { const v = num(issues, lv.coefficients, k, cp, { ge: -100, le: 100, label: k }); if (v !== undefined) coefficients[k] = v; } }
        let roundedTip = null;
        if (geometry?.tipChord===0&&['delta','elliptic'].includes(geometry.planform)&&lv.roundedTip===null) { /* Exact closed tip: no artificial rounded-tip record. */ }
        else if (!own(lv, 'roundedTip') || lv.roundedTip === null) issues.err(join(p, 'roundedTip'), 'must be the rounded-tip record for a nonzero-tip aerodynamic wing');
        else {
          const rt = join(p, 'roundedTip');
          if (!isObj(lv.roundedTip)) issues.err(rt, 'must be an object {length_mm, start_mm, strips}');
          else { checkKeys(issues, lv.roundedTip, rt, ['length_mm', 'start_mm', 'strips']); const len = num(issues, lv.roundedTip, 'length_mm', rt, { gt: 0, le: 1e6, unit: 'mm', label: 'rounding length' }), st = num(issues, lv.roundedTip, 'start_mm', rt, { ge: 0, le: 1e6, unit: 'mm', label: 'rounding start' }), n = num(issues, lv.roundedTip, 'strips', rt, { integer: true, ge: 2, le: 64, label: 'rounding strips' }); if ([len, st, n].every(isNum)) { if (L !== null && Math.abs(st + len - L) > 1e-9 * L) issues.err(rt, 'must end at the tip (start + length = semi-span)'); roundedTip = { length_mm: len, start_mm: st, strips: n }; } }
        }
        levels.push({ chordPanels: c, spanPanels: sp, strips, coefficients, roundedTip });
      });
    }
    if (issues.count > n0) return undefined;
    const keyOf = typeof opts?.aeroGeometryKey === 'function' ? opts.aeroGeometryKey : aeroGeometryKeyHook;
    if (typeof keyOf !== 'function') { issues.err(path, 'cannot be checked by this reader (it has no aerodynamic shape key); nothing was imported'); return undefined; }
    let key = null; try { key = keyOf(geometry); } catch (e) { issues.err(path, `the outer wing shape key could not be computed: ${e.message}`); return undefined; }
    if (key !== raw.geometrySha256) { issues.err(join(path, 'geometrySha256'), 'does not match this study\'s outer wing shape: the aerodynamic load was solved for a different wing. Nothing was imported'); return undefined; }
    return { kind: 'panelSequence', label, sequence: raw.sequence, geometrySha256: raw.geometrySha256, flow, levels };
  }
  function checkAerodynamics(issues, raw, path) {
    if (!isObj(raw)) { issues.err(path, `must be an object {speed, density, alphaDeg, mesh}, not ${describe(raw)}`); return undefined; }
    const n0 = issues.count;
    checkKeys(issues, raw, path, AERO_KEYS);
    const out = {
      speed: num(issues, raw, 'speed', path, { ge: 1e-3, le: 200, unit: 'm/s', label: 'freestream speed' }),
      density: num(issues, raw, 'density', path, { ge: 1e-3, le: 5, unit: 'kg/m³', label: 'air density' }),
      alphaDeg: num(issues, raw, 'alphaDeg', path, { ge: -15, le: 15, unit: 'deg', label: 'angle of attack' }),
    };
    const visc = num(issues, raw, 'viscosity', path, { optional: true, ge: 1e-7, le: 1e-2, unit: 'Pa·s', label: 'dynamic viscosity' });
    const sound = num(issues, raw, 'speedOfSound', path, { optional: true, ge: 290, le: 360, unit: 'm/s', label: 'speed of sound in air' });
    if (visc !== undefined) out.viscosity = visc;
    if (sound !== undefined) out.speedOfSound = sound;
    if (isNum(out.speed) && out.speed / (sound ?? 340.29) > 0.3) issues.err(join(path, 'speed'), 'gives a Mach number above 0.3; the incompressible panel module does not accept it');
    if (own(raw, 'sequence')) { if (!own(AERO_SEQUENCES, raw.sequence)) issues.err(join(path, 'sequence'), `must be "standard" or "fine", not ${describe(raw.sequence)}`); else out.sequence = raw.sequence; }
    if (own(raw, 'mesh')) {
      const mp = join(path, 'mesh');
      if (!isObj(raw.mesh)) issues.err(mp, 'must be an object {chordPanels, spanPanels}');
      else {
        checkKeys(issues, raw.mesh, mp, ['chordPanels', 'spanPanels']);
        const mesh = {};
        const c = num(issues, raw.mesh, 'chordPanels', mp, { integer: true, ge: 6, le: 48, label: 'panels per surface' });
        const sp = num(issues, raw.mesh, 'spanPanels', mp, { integer: true, ge: 4, le: 40, label: 'spanwise panels' });
        if (c !== undefined) mesh.chordPanels = c;
        if (sp !== undefined) mesh.spanPanels = sp;
        // same panel limit as the solver (2 c s wing panels plus c tip-cap panels; geometry stations can add strips)
        if (isNum(c) && isNum(sp) && 2 * c * sp + c > 2600) issues.err(mp, `gives ${2 * c * sp + c} panels; the browser panel solver allows at most 2600`);
        out.mesh = mesh;
      }
    }
    return issues.count > n0 ? undefined : out;
  }
  // State handed to applyState: the UI's own field names.
  const printedState = (s) => ({
    projectName: '', emptyStudy: false, mirrorFullWing:s.fabrication?.mirrorFullWing===true,
    geometry: clone(s.geometry), plaKey: s.materials.plaKey, plaOver: clone(s.materials.plaOver), rodKey: s.materials.rodKey,
    rodOver: clone(s.materials.rodOver), assembly: clone(s.assembly), load: clone(s.load), criteria: clone(s.criteria), analysis:s.analysis?clone(s.analysis):null,
    ...(s.aerodynamics ? { aerodynamics: clone(s.aerodynamics) } : {}),
    ...(s.aeroLoad ? { aeroLoad: clone(s.aeroLoad) } : {}),
  });
  const printedStudyOf = (st) => ({
    geometry: clone(st.geometry), materials: { plaKey: st.plaKey, plaOver: clone(st.plaOver), rodKey: st.rodKey, rodOver: clone(st.rodOver) },
    assembly: clone(st.assembly), load: clone(st.load), criteria: clone(st.criteria), ...(st.analysis?{analysis:clone(st.analysis)}:{}),...(st.mirrorFullWing===true?{fabrication:{mirrorFullWing:true}}:{}),...(st.aerodynamics?{aerodynamics:clone(st.aerodynamics)}:{}),...(st.aeroLoad?{aeroLoad:clone(st.aeroLoad)}:{}),
  });
  /** Engine input for a printed state, exactly as the Wing Lab page builds it (card values unless an override is > 0). */
  function printedEngineInput(state, engine) {
    const E = engine || globalWing();
    const pla = { ...E.MATERIALS[state.plaKey] };
    for (const k of ['E', 'ft', 'fc', 'fs','rho']) if (state.plaOver && state.plaOver[k] > 0) pla[k] = state.plaOver[k];
    if(state.plaOver&&state.plaOver.nu!=null)pla.nu=state.plaOver.nu;
    const rod = { ...E.MATERIALS[state.rodKey] };
    if (state.rodOver && state.rodOver.E > 0) rod.E = state.rodOver.E;
    return { geometry: clone(state.geometry), pla, rod, assembly: clone(state.assembly), load: clone(state.load), criteria: clone(state.criteria), ...(state.analysis?{...state.analysis}:{}) };
  }
  /** Rod holes must fit inside the airfoil and printed sleeves must not overlap (checked at the tip, the smallest chord). */
  function rodLayoutIssues(g, E) {
    const out = [], c = g.tipChord, rh = E.holeRadius(g), Rs = E.sleeveRadius(g);
    const centres = E.rodCentres(g,g.semiSpan),profile=E.airfoilAt?E.airfoilAt(g,g.semiSpan):g.naca;
    g.rodFractions.forEach((f, i) => {
      const v = E.verticalOrdinates(profile, f, c, g.te), depth = v.upper - v.lower;
      if (depth < 2 * rh) out.push({ index: i, message: `the rod hole (⌀${fmt(+(2 * rh).toFixed(4))} mm with clearance) does not fit inside the airfoil at x/c = ${fmt(f)}: the tip section is only ${fmt(+depth.toFixed(3))} mm deep there (tip chord ${fmt(c)} mm)` });
    });
    for (let i = 0; i < centres.length; i++)
      for (let j = i + 1; j < centres.length; j++) {
        const d = Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1]);
        if (d < 2 * Rs) out.push({ index: j, message: `the printed sleeves of the rods at x/c = ${fmt(g.rodFractions[i])} and ${fmt(g.rodFractions[j])} overlap at the tip chord (centres ${fmt(+d.toFixed(3))} mm apart; two sleeves need ${fmt(+(2 * Rs).toFixed(3))} mm)` });
      }
    return out;
  }
  /** Engine checks of a validated printed state. Never solves. Returns false on an error. */
  function printedEngineChecks(issues, state, path, E) {
    const n0 = issues.count, gp = join(path, 'geometry');
    let g;
    try { g = E.makeGeometry(clone(state.geometry)); }
    catch (e) { issues.err(pathFor(PRINTED_RULES, path, e.message), engineMessage(e, 'WingEngine')); return false; }
    for (const r of rodLayoutIssues(g, E)) issues.err(join(join(gp, 'rodFractions'), r.index), r.message);
    const load = state.load;
    let items = null;
    if (load.kind === 'custom') {
      const unsupported = [...new Set(load.items.map((it) => it.kind))].filter((k) => !engineSupports(E, 'printed', k));
      if (unsupported.length) issues.warn(join(join(path, 'load'), 'items'), `this page's WingEngine ${E.VERSION} cannot analyse ${unsupported.map((k) => `"${k}"`).join(', ')} load items yet: their structure, units and span bounds were checked here, the engine check was not possible, and the solver will report an error if it cannot use them`);
      items = load.items.map((it, i) => ({ it, i })).filter((q) => !unsupported.includes(q.it.kind));
    }
    // 1. geometry and joints with a neutral load
    const neutral = { ...state, load: { ...E.DEFAULT_LOAD, kind: 'tip', tipForce: 0, tipFraction: 0.3, fos: load.fos, tipMass: load.tipMass } };
    let n;
    try { n = E.normalize(printedEngineInput(neutral, E)); }
    catch (e) { issues.err(pathFor(PRINTED_RULES, path, e.message), engineMessage(e, 'WingEngine')); return false; }
    // 2. the solver's own section builder at its analysis stations (cavity collapse and similar)
    for (const y of n.ySec) {
      try { E.ringLoops(n.g, y); }
      catch (e) { issues.err(join(gp, 'skin'), `${e.message} (WingEngine section at y = ${fmt(+y.toFixed(3))} mm)`); return false; }
    }
    if (issues.count > n0) return false;
    // 3. the load case: each item alone, then all together
    const tryLoad = (l, p) => {
      try { E.normalize(printedEngineInput({ ...state, load: l }, E)); return true; }
      catch (e) { issues.err(p, engineMessage(e, 'WingEngine')); return false; }
    };
    if (items) {
      let ok = true;
      for (const { it, i } of items) ok = tryLoad({ ...load, items: [it] }, join(join(join(path, 'load'), 'items'), i)) && ok;
      if (ok && items.length > 1) tryLoad({ ...load, items: items.map((q) => q.it) }, join(join(path, 'load'), 'items'));
    } else tryLoad(load, join(path, 'load'));
    return issues.count === n0;
  }
  function canonicalPrintedFromUi(S, E) {
    if (!isObj(S)) throw new Error('There is no printed-wing study state to save.');
    const pick = (src, defaults) => {
      const out = {}, s = isObj(src) ? src : {};
      for (const k of Object.keys(defaults)) out[k] = clone(own(s, k) && s[k] !== undefined ? s[k] : defaults[k]);
      return out;
    };
    const geometry = pick(S.geometry, E.DEFAULT_GEOMETRY);
    for(const k of GEOMETRY_V2)if(own(S.geometry,k)&&S.geometry[k]!=null)geometry[k]=clone(S.geometry[k]);
    // The engine sorts custom rib stations; the file stores them in that (canonical) order.
    if (Array.isArray(geometry.customInteriorRibs) && geometry.customInteriorRibs.every(isNum)) geometry.customInteriorRibs.sort((a, b) => a - b);
    const over = (o, keys) => Object.fromEntries(keys.map((k) => [k, isObj(o) && isNum(o[k]) && (k==='nu'?o[k]>=0:o[k]>0) ? o[k] : null]));
    const l = { ...E.DEFAULT_LOAD, ...(isObj(S.load) ? S.load : {}) };
    const load = { kind: l.kind };
    if (own(PRINTED_LOAD_KEYS, l.kind)) for (const k of PRINTED_LOAD_KEYS[l.kind]) {if(k==='selfWeight'&&!l.selfWeight)continue;load[k] = k === 'items' ? (Array.isArray(l.items) ? l.items.map((it) => canonicalItemFromUi(it, true)) : clone(l.items)) : clone(l[k]);}
    return {
      geometry,
      materials: { plaKey: S.plaKey, plaOver: over(S.plaOver, ['E', 'ft', 'fc', 'fs','rho','nu']), rodKey: S.rodKey, rodOver: over(S.rodOver, ['E']) },
      assembly: pick(S.assembly, E.DEFAULT_ASSEMBLY), load, criteria: pick(S.criteria, E.DEFAULT_CRITERIA), ...(S.analysis?{analysis:clone(S.analysis)}:{}),...(S.mirrorFullWing===true?{fabrication:{mirrorFullWing:true}}:{}),...(isObj(S.aerodynamics)?{aerodynamics:clone(S.aerodynamics)}:{}),...(isObj(S.aeroLoad)?{aeroLoad:clone(S.aeroLoad)}:{}),
    };
  }
  function printedRows(state, E) {
    const g = state.geometry, rows = [], add = (group, label, value) => rows.push({ group, label, value });
    const profileName=p=>p?(p.name||`NACA ${p.code}`):`NACA ${g.naca}`;
    add('Geometry', 'Airfoil', g.stations?'Spanwise airfoil stations (listed below)':profileName(g.airfoil));
    add('Geometry', 'Semi-span', `${fmt(g.semiSpan)} mm`);
    if(state.mirrorFullWing)add('Fabrication','Full-wing mirror',`enabled; symmetric full span ${fmt(2*g.semiSpan)} mm; structural analysis remains one root-clamped semi-wing`);
    add('Geometry', 'Root / tip chord', `${fmt(g.rootChord)} / ${fmt(g.tipChord)} mm (${g.planform||'linear'} reference-chord planform)`);
    if(hasAdvancedGeometry(g)){
      add('Geometry','Sweep / dihedral',`${fmt(g.sweepDeg||0)}° at ${fmt(g.sweepReferenceFraction??0)}c / ${fmt(g.dihedralDeg||0)}°; projected span y, x aft, z up`);
      add('Geometry','Geometric twist',`${g.twistEnabled?'enabled':'off'}; absolute incidence, positive LE-up, pivot ${fmt(g.twistReferenceFraction??.25)}c`);
      for(const [i,s]of (g.stations||[]).entries())add('Geometry',`Station ${i+1}`,`eta ${fmt(s.eta)}, y ${fmt(s.eta*g.semiSpan)} mm · ${profileName(s.airfoil)} · incidence ${fmt(s.incidenceDeg)}°`);
    }
    add('Structure', 'Modules', g.modules === 1 ? '1 (one piece, no seams)' : `${g.modules} (seams at ${E.seams(E.makeGeometry(clone(g))).map((v) => fmt(+v.toFixed(3))).join(', ')} mm)`);
    add('Structure', 'Skin / rib thickness', `${fmt(g.skin)} / ${fmt(g.ribThickness)} mm`);
    add('Structure', 'Interior ribs', g.customInteriorRibs ? (g.customInteriorRibs.length ? `custom stations ${g.customInteriorRibs.map(fmt).join(', ')} mm` : 'none (empty custom list)') : `${g.interiorRibs} requested, evenly spaced (interface ribs are added at seams)`);
    add('Structure', 'Rods', g.rodFractions.length ? `${g.rodFractions.length} × ⌀${fmt(g.rodDiameter)} mm at ${g.rodFractions.map((f) => `${fmt(f)}c`).join(', ')}; radial clearance ${fmt(g.clearance)} mm; sleeve wall ${fmt(g.sleeveWall)} mm` : 'none');
    for(const [i,s]of (g.spars||[]).entries())add('Structure',`Bonded spar ${i+1}`,`x/c ${fmt(s.fraction)}; root-to-end ${fmt(s.length)} mm; ${s.widthMode==='auto'?'automatic chord-based cap-width taper; fixed thickness':'fixed cap widths'}; upper root cap ${fmt(s.topWidth)} × ${fmt(s.topThickness)} mm; lower cap ${fmt(s.bottomWidth)} × ${fmt(s.bottomThickness)} mm; web ${fmt(s.webThickness)} mm, skin-derived height; ${s.material.name}, E ${fmt(s.material.E)} MPa, nu ${fmt(s.material.nu)}, rho ${fmt(s.material.rho)} g/cm³, ft/fc/fs ${fmt(s.material.ft)}/${fmt(s.material.fc)}/${fmt(s.material.fs)} MPa; perfect bond, thin-wall model`);
    add('Structure', 'Other', `trailing edge ${fmt(g.te)} mm; root/tip caps ${fmt(g.cap)} mm; interface rib offset ${fmt(g.interfaceOffset)} mm; cavity ${fmt(g.cavityStart)}–${fmt(g.cavityEnd)}c`);
    const card = (key, over, fields, unit) => {
      const m = E.MATERIALS[key];
      return `${m.short || m.name}: ${fields.map((f) => `${f} ${fmt(over[f] > 0 ? over[f] : m[f])} ${unit}${over[f] > 0 ? ' (override)' : ''}`).join(', ')}`;
    };
    add('Materials', 'Shell, ribs, sleeves', card(state.plaKey, state.plaOver, ['E', 'ft', 'fc', 'fs'], 'MPa'));
    add('Materials','Shell Poisson ratio / density',`${fmt(state.plaOver.nu!=null?state.plaOver.nu:E.MATERIALS[state.plaKey].nu)} / ${fmt(state.plaOver.rho>0?state.plaOver.rho:E.MATERIALS[state.plaKey].rho)} g/cm³`);
    add('Materials', 'Rods', card(state.rodKey, state.rodOver, ['E'], 'MPa'));
    const a = state.assembly;
    add('Joints', 'Rods in sleeves', a.rodsBonded ? 'epoxied (bonded)' : 'slip fit');
    add('Joints', 'Module seams', `${a.seamsBonded ? 'epoxied' : 'dry (rods only)'}; rod free length ${a.seamFreeLength === null ? '2 × interface offset' : `${fmt(a.seamFreeLength)} mm`}; epoxy ${fmt(a.adhesiveTensile)} MPa`);
    const L = state.load;
    if (L.kind === 'flight') add('Load', 'Case', `Flight-like lift: aircraft ${fmt(L.aircraftMass)} kg, n = ${fmt(L.loadFactor)}, ${L.distribution} distribution at ${fmt(L.liftFraction)}c, inertia relief ${L.inertiaRelief ? 'on' : 'off'}`);
    else if (L.kind === 'tip') add('Load', 'Case', `Tip force ${fmt(L.tipForce)} N (upward +) at ${fmt(L.tipFraction)}c of the tip chord`);
    else if (!L.items.length) add('Load', 'Case', 'Custom — no load defined yet (empty list)');
    else {
      add('Load', 'Case', `Custom: ${L.items.length} item(s), ${countSegments(L.items)} segment(s), upward positive`);
      L.items.forEach((it, i) => add('Load', `Item ${i + 1}`, describeItem(it, { len: 'mm', line: 'N/mm' })));
    }
    add('Checks', 'Factor of safety / tip mass', `${fmt(L.fos)} / ${fmt(L.tipMass)} g`);
    add('Checks', 'Stiffness criteria', `tip deflection ≤ ${fmt(state.criteria.maxTipDeflection)} mm; tip twist ≤ ${fmt(state.criteria.maxTipTwist)}°`);
    add('Analysis','Requested beam elements',state.analysis?.nElements?`${state.analysis.nElements}; required stations may add elements. CAD/STL geometry is unchanged.`:'Solver default; required stations may add elements.');
    add('Analysis','Torsion sections',state.analysis?.finiteSectionTorsion===true?'Finite-wall homogeneous bonded-spar refinement requested; mixed shear moduli retain the thin-wall method. Closed-tip torsion is unavailable.':'Fast method (default)');
    if(state.aerodynamics){const a=state.aerodynamics;add('Aerodynamics','Panel-method inputs',`V ${fmt(a.speed)} m/s, ρ ${fmt(a.density)} kg/m³, α ${fmt(a.alphaDeg)}°, ${a.sequence==='fine'?'Fine':'Standard'} mesh sequence`);}
    if(state.aeroLoad){const a=state.aeroLoad;add('Aerodynamics','Applied aerodynamic load',`${a.label}: ${a.levels.length} solved meshes of the ${a.sequence} sequence at V ${fmt(a.flow.speed)} m/s, α ${fmt(a.flow.alphaDeg)}°; the extrapolated six-component strip load and its admission are recomputed from them`);}
    return rows;
  }

  // ------------------------------------------------------------------ D.520: schema
  const D520_KEYS = Object.freeze(['n', 'distribution', 'inertiaRelief', 'include', 'scales', 'support', 'taper', 'mass', 'CL', 'material', 'customLoads']);
  const D520_MATERIAL = Object.freeze({ E: 'Pa', nu: '', rho: 'kg/m³', Fty: 'Pa', Fcy: 'Pa', Ftu: 'Pa', Fsu: 'Pa', epsU: '' });
  function d520Bounds(M) {
    const P = M && M.D520;
    return P ? { lo: P.fittingY, hi: P.ribs[P.ribs.length - 1] } : { lo: 0.46, hi: 4.93 };
  }
  function checkD520Study(issues, raw, path, M) {
    if (!isObj(raw)) { issues.err(path, `must be an object with the D.520 inputs, not ${describe(raw)}`); return undefined; }
    checkKeys(issues, raw, path, D520_KEYS);
    const n0 = issues.count, s = {};
    s.n = num(issues, raw, 'n', path, { nonzero: true, label: 'load factor (flight) or load multiplier (custom loads)' });
    s.distribution = choice(issues, raw, 'distribution', path, ['liftingLine', 'schrenk', 'elliptic']);
    s.inertiaRelief = bool(issues, raw, 'inertiaRelief', path, { label: 'inertia relief in flight cases' });
    const inc = objectField(issues, raw, 'include', path, { label: '{fuel, guns, ammo}' });
    if (inc) {
      const ip = join(path, 'include');
      checkKeys(issues, inc, ip, ['fuel', 'guns', 'ammo']);
      s.include = { fuel: bool(issues, inc, 'fuel', ip), guns: bool(issues, inc, 'guns', ip), ammo: bool(issues, inc, 'ammo', ip) };
    }
    const sc = objectField(issues, raw, 'scales', path, { label: '{skin, web, boom, stringer}' });
    if (sc) {
      const sp = join(path, 'scales');
      checkKeys(issues, sc, sp, ['skin', 'web', 'boom', 'stringer']);
      s.scales = {};
      for (const k of ['skin', 'web', 'boom', 'stringer']) s.scales[k] = num(issues, sc, k, sp, { gt: 0, label: 'gauge scale factor' });
    }
    s.support = choice(issues, raw, 'support', path, ['fittings', 'clamped']);
    s.taper = bool(issues, raw, 'taper', path, { label: 'tapered-beam effect of inclined booms' });
    s.mass = num(issues, raw, 'mass', path, { nullable: true, gt: 0, unit: 'kg', label: 'gross mass; null keeps the preset' });
    s.CL = num(issues, raw, 'CL', path, { nullable: true, gt: 0, label: 'reference lift coefficient; null keeps the preset' });
    const mat = objectField(issues, raw, 'material', path, { nullable: true, label: 'material card' });
    if (mat === null) s.material = null;
    else if (mat) {
      const mp = join(path, 'material');
      checkKeys(issues, mat, mp, [...Object.keys(D520_MATERIAL), 'name']);
      s.material = {};
      for (const [k, unit] of Object.entries(D520_MATERIAL)) s.material[k] = num(issues, mat, k, mp, k === 'nu' ? { gt: 0, lt: 0.5, label: "Poisson's ratio" } : { gt: 0, unit: unit || undefined });
      const name = text(issues, mat, 'name', mp, { optional: true, max: LIMITS.nameChars });
      if (name !== undefined) s.material.name = name;
    }
    if (!own(raw, 'customLoads')) issues.err(join(path, 'customLoads'), 'is missing (null for flight loading, [] for no load, or a list of bench loads)');
    else if (raw.customLoads === null) s.customLoads = null;
    else {
      const b = d520Bounds(M);
      s.customLoads = checkItems(issues, raw.customLoads, join(path, 'customLoads'), {
        lo: b.lo, hi: b.hi, pointLoOpen: false, len: 'm', line: 'N/m', allowSchrenk: false,
        maxItems: LIMITS.d520Items, maxSegments: LIMITS.d520Segments,
        rangeText: () => `the fittings at ${fmt(b.lo)} m and the last rib at ${fmt(b.hi)} m`,
      });
    }
    return issues.count > n0 ? undefined : s;
  }
  function d520EngineChecks(issues, s, path, M) {
    const n0 = issues.count;
    try { M.normalise({ ...clone(s), customLoads: null }); }
    catch (e) { issues.err(pathFor(D520_RULES, path, e.message), engineMessage(e, 'MetalWingEngine')); return false; }
    if (s.customLoads && s.customLoads.length) {
      const unsupported = [...new Set(s.customLoads.map((it) => it.kind))].filter((k) => !engineSupports(M, 'd520', k));
      if (unsupported.length) issues.warn(join(path, 'customLoads'), `this page's MetalWingEngine ${M.VERSION} cannot analyse ${unsupported.map((k) => `"${k}"`).join(', ')} load items yet: their structure, units and span bounds were checked here, the engine check was not possible, and the solver will report an error if it cannot use them`);
      const items = s.customLoads.map((it, i) => ({ it, i })).filter((q) => !unsupported.includes(q.it.kind));
      let ok = true;
      for (const { it, i } of items) {
        try { M.normalise({ ...clone(s), customLoads: [clone(it)] }); }
        catch (e) { issues.err(join(join(path, 'customLoads'), i), engineMessage(e, 'MetalWingEngine')); ok = false; }
      }
      if (ok && items.length > 1) {
        try { M.normalise({ ...clone(s), customLoads: items.map((q) => clone(q.it)) }); }
        catch (e) { issues.err(join(path, 'customLoads'), engineMessage(e, 'MetalWingEngine')); }
      }
    }
    return issues.count === n0;
  }
  function canonicalD520FromUi(inp, M) {
    if (!isObj(inp)) throw new Error('There is no D.520 study state to save.');
    const D = M.DEFAULT_INPUT, pick = (v, d) => (v === undefined ? d : v);
    const material = inp.material === null || inp.material === undefined ? null : (() => {
      const m = { ...M.D520.material, ...(isObj(inp.material) ? inp.material : {}) }, out = {};
      for (const k of Object.keys(D520_MATERIAL)) out[k] = m[k];
      if (typeof m.name === 'string') out.name = m.name;
      return out;
    })();
    const sub = (v, d, keys) => Object.fromEntries(keys.map((k) => [k, pick(isObj(v) ? v[k] : undefined, d[k])]));
    return {
      n: pick(inp.n, D.n), distribution: pick(inp.distribution, D.distribution), inertiaRelief: pick(inp.inertiaRelief, D.inertiaRelief),
      include: sub(inp.include, D.include, ['fuel', 'guns', 'ammo']), scales: sub(inp.scales, D.scales, ['skin', 'web', 'boom', 'stringer']),
      support: pick(inp.support, D.support), taper: inp.taper !== false, mass: pick(inp.mass, null), CL: pick(inp.CL, null), material,
      customLoads: inp.customLoads === null || inp.customLoads === undefined ? null : Array.isArray(inp.customLoads) ? inp.customLoads.map((it) => canonicalItemFromUi(it, false)) : inp.customLoads,
    };
  }
  function d520Rows(s, M) {
    const rows = [], add = (group, label, value) => rows.push({ group, label, value });
    const custom = s.customLoads !== null;
    if (!custom) {
      add('Load', 'Case', `Flight: n = ${fmt(s.n)} g, ${s.distribution} span loading`);
      add('Load', 'Aircraft', `gross mass ${s.mass === null ? `preset (${fmt(M.D520.aircraft.mass)} kg)` : `${fmt(s.mass)} kg`}; CL ${s.CL === null ? `preset (${fmt(M.D520.aircraft.CL)})` : fmt(s.CL)}`);
      add('Load', 'Inertia relief', s.inertiaRelief ? `on (fuel ${s.include.fuel ? 'on' : 'off'}, guns ${s.include.guns ? 'on' : 'off'}, ammunition ${s.include.ammo ? 'on' : 'off'})` : 'off');
    } else if (!s.customLoads.length) add('Load', 'Case', `Custom — no load defined yet (empty list); multiplier ×${fmt(s.n)}`);
    else {
      add('Load', 'Case', `Custom bench loads: ${s.customLoads.length} item(s), ${countSegments(s.customLoads)} segment(s), multiplied by ${fmt(s.n)}; no flight lift and no inertia relief`);
      s.customLoads.forEach((it, i) => add('Load', `Item ${i + 1}`, describeItem(it, { len: 'm', line: 'N/m' })));
    }
    add('Structure', 'Gauge scales', `skin ×${fmt(s.scales.skin)}, webs ×${fmt(s.scales.web)}, booms ×${fmt(s.scales.boom)}, stringers ×${fmt(s.scales.stringer)}`);
    add('Structure', 'Support', s.support === 'clamped' ? 'clamped at the fittings' : 'fittings + centre section by symmetry');
    add('Structure', 'Tapered-beam effect', s.taper ? 'on' : 'off');
    const m = s.material || M.D520.material;
    add('Material', m.name || 'Material card', `E ${fmt(m.E / 1e9)} GPa, ν ${fmt(m.nu)}, ρ ${fmt(m.rho)} kg/m³, Fty ${fmt(m.Fty / 1e6)} MPa, Fcy ${fmt(m.Fcy / 1e6)} MPa, Ftu ${fmt(m.Ftu / 1e6)} MPa, Fsu ${fmt(m.Fsu / 1e6)} MPa, εu ${fmt(m.epsU)}${s.material ? '' : ' (preset)'}`);
    return rows;
  }

  // ------------------------------------------------------------------ native study files
  function studyResult(workspace, filename) {
    return {
      ok: false, kind: 'study', workspace, state: null, warnings: [], errors: [], preview: null, version: null,
      provenance: { filename: cleanName(filename), source: 'file', sha256: null, bytes: null, savedAt: null, savedWith: null, engine: null },
    };
  }
  function checkEnvelope(issues, doc, expected, engineVersion, res) {
    if (!isObj(doc)) { issues.err('', `This JSON text does not contain a Wing Lab study (expected an object, found ${describe(doc)}).`); return null; }
    if (doc.format === PARAMS_FORMAT) { issues.err('format', 'this is a design-parameter file (mie446-wing-parameters): use "Import design parameters", not "Open study"'); return null; }
    if (doc.format === 'mie446-beam-study') { issues.err('format', 'this is a Beam Lab study: open it in the Beam Lab'); return null; }
    if (doc.format !== STUDY_FORMAT) { issues.err('format', `must be "${STUDY_FORMAT}", not ${describe(doc.format)}`); return null; }
    if (!own(doc, 'version')) { issues.err('version', 'is missing'); return null; }
    if (!Number.isInteger(doc.version)) { issues.err('version', `must be the whole number ${FILE_VERSION}, not ${describe(doc.version)}`); return null; }
    if (doc.version > MAX_FILE_VERSION) { issues.err('version', `this study was saved by a newer Wing Lab (file version ${doc.version}; this page reads versions 1–${MAX_FILE_VERSION}). Nothing was imported; your current study is unchanged`); return null; }
    if (doc.version < 1) { issues.err('version', `${doc.version} is not a valid file version`); return null; }
    res.version = doc.version;
    const ws = doc.workspace;
    if(doc.version===2&&ws!=='printed'){issues.err('version','version 2 is the printed-wing station geometry format');return null;}
    if(doc.version===3&&ws!=='printed'){issues.err('version','version 3 is the printed-wing aerodynamic-settings format');return null;}
    if(doc.version===4&&ws!=='printed'){issues.err('version','version 4 is the printed-wing applied-aerodynamic-load format');return null;}
    if(doc.version<3&&own(doc.study||{},'aerodynamics')){issues.err('version','aerodynamic panel settings require file version 3; nothing was imported');return null;}
    if(doc.version<4&&own(doc.study||{},'aeroLoad')){issues.err('version','an applied aerodynamic load requires file version 4; nothing was imported');return null;}
    if(doc.version===1&&(hasAdvancedGeometry(doc.study?.geometry)||own(doc.study||{},'analysis'))){issues.err('version','station geometry and analysis settings require file version 2; nothing was imported');return null;}
    if (ws !== 'printed' && ws !== 'd520') { issues.err('workspace', `must be "printed" or "d520", not ${describe(ws)}`); return null; }
    if (expected && ws !== expected) { issues.err('workspace', `this is a ${WORKSPACE_LABEL[ws]} study: open it in the ${WORKSPACE_LABEL[ws]} workspace (this is the ${WORKSPACE_LABEL[expected]} workspace)`); return null; }
    checkKeys(issues, doc, '', ['format', 'version', 'workspace', 'savedAt', 'app', 'study', ...(ws === 'printed' ? ['projectName', 'emptyStudy'] : [])]);
    if (ws === 'printed') {
      res.provenance.projectName = readProjectName(issues, doc);
      res.provenance.emptyStudy = own(doc, 'emptyStudy') ? bool(issues, doc, 'emptyStudy', '') : false;
    }
    if (own(doc, 'savedAt')) {
      const v = text(issues, doc, 'savedAt', '', { max: 40 });
      if (v !== undefined) { if (Number.isNaN(Date.parse(v))) issues.warn('savedAt', 'is not a valid date and time; ignored'); else res.provenance.savedAt = v; }
    }
    if (own(doc, 'app')) {
      if (!isObj(doc.app)) issues.err('app', `must be an object {name, engine}, not ${describe(doc.app)}`);
      else {
        for (const k of Object.keys(doc.app)) if (!['name', 'engine', 'io'].includes(k)) issues.warn(join('app', k), 'unknown metadata field ignored');
        const name = text(issues, doc.app, 'name', 'app', { optional: true, max: LIMITS.nameChars });
        const eng = text(issues, doc.app, 'engine', 'app', { optional: true, max: 40 });
        res.provenance.savedWith = name === undefined ? null : name;
        res.provenance.engine = eng === undefined ? null : eng;
        if (eng !== undefined && engineVersion && eng !== engineVersion) issues.warn('app.engine', `the study was saved with engine ${eng}; this page runs engine ${engineVersion}, and every result is recomputed by it`);
      }
    }
    if (res.provenance.engine === null) issues.warn('app.engine', 'the engine version that saved the study is not recorded');
    if (!own(doc, 'study')) { issues.err('study', 'is missing'); return null; }
    return ws;
  }
  /**
   * Import untrusted study text or bytes. opts: {workspace ('printed'|'d520'; omit to accept either),
   * engine, metalEngine, filename, source}. Returns {ok, kind:'study', workspace, state, warnings,
   * errors, preview, provenance, version}; state is null unless ok.
   */
  function importStudy(input, opts = {}) {
    const res = studyResult(opts.workspace || null, opts.filename);
    if (opts.source) res.provenance.source = opts.source;
    const issues = makeIssues();
    const done = () => {
      issues.finish();
      res.errors = issues.errors; res.warnings = issues.warnings;
      if (res.errors.length) { res.ok = false; res.state = null; }
      res.preview = { title: res.ok ? `${WORKSPACE_LABEL[res.workspace]} study` : 'Study file', rows: res.ok ? res.preview.rows : [] };
      return res;
    };
    res.preview = { rows: [] };
    const read = readInput(input, 'The study file');
    res.provenance.bytes = read.byteLength === undefined ? null : read.byteLength;
    res.provenance.sha256 = read.sha256 || null;
    if (read.error) { issues.err('', read.error); return done(); }
    if (read.bom) issues.warn('', 'a UTF-8 byte-order mark at the start of the file was ignored (it is included in the SHA-256)');
    let doc;
    try { doc = parseJson(read.text); } catch (e) { issues.err('', `This is not valid JSON: ${e.message}.`); return done(); }
    const peek = isObj(doc) && (doc.workspace === 'printed' || doc.workspace === 'd520') ? doc.workspace : null;
    const engine = peek === 'd520' ? (opts.metalEngine || (opts.workspace === 'd520' ? opts.engine : null) || globalMetal()) : (opts.engine || globalWing());
    const ws = checkEnvelope(issues, doc, opts.workspace || null, engine && engine.VERSION, res);
    if (!ws) return done();
    res.workspace = ws;
    if (!engine) { issues.err('', `${ws === 'printed' ? 'WingEngine' : 'MetalWingEngine'} is not loaded, so the study cannot be checked.`); return done(); }
    if (ws === 'printed') {
      const study = checkPrintedStudy(issues, doc.study, 'study', engine, opts);
      if (study && !issues.count) {
        const state = { ...printedState(study), projectName: res.provenance.projectName, emptyStudy: res.provenance.emptyStudy };
        if (printedEngineChecks(issues, state, 'study', engine) && !issues.count) { res.ok = true; res.state = state; res.preview.rows = printedRows(state, engine); }
      }
    } else {
      const study = checkD520Study(issues, doc.study, 'study', engine);
      if (study && !issues.count && d520EngineChecks(issues, study, 'study', engine) && !issues.count) { res.ok = true; res.state = clone(study); res.preview.rows = d520Rows(study, engine); }
    }
    return done();
  }
  const importPrintedStudy = (input, engine, opts = {}) => importStudy(input, { ...opts, workspace: 'printed', engine: engine || opts.engine });
  const importD520Study = (input, metalEngine, opts = {}) => importStudy(input, { ...opts, workspace: 'd520', engine: metalEngine || opts.engine, metalEngine: metalEngine || opts.metalEngine || opts.engine });

  function savedError(prefix, errors) {
    const e = new Error(`${prefix}: ${errors.slice(0, 4).join(' · ')}${errors.length > 4 ? ` · …(${errors.length} problems)` : ''}`);
    e.errors = errors.slice();
    return e;
  }
  /** Versioned study document (an object) for the printed-wing UI state S. Throws when S is not valid. */
  function printedStudyDocument(S, engine, opts = {}) {
    const E = engine || globalWing();
    if (!E) throw new Error('WingEngine is not loaded.');
    const raw = canonicalPrintedFromUi(S, E), issues = makeIssues();
    const projectName = readProjectName(issues, { projectName: own(opts, 'projectName') ? opts.projectName : (S.projectName === undefined ? '' : S.projectName) });
    const emptyStudy = S.emptyStudy === undefined ? false : bool(issues, S, 'emptyStudy', '');
    const study = checkPrintedStudy(issues, raw, 'study', E, opts);
    if (study && !issues.count) printedEngineChecks(issues, printedState(study), 'study', E);
    issues.finish();
    if (issues.errors.length) throw savedError('The current study cannot be saved', issues.errors);
    return { format: STUDY_FORMAT, version: study.aeroLoad?4:study.aerodynamics?3:hasAdvancedGeometry(study.geometry)||study.analysis||study.fabrication?2:FILE_VERSION, workspace: 'printed', ...(projectName ? { projectName } : {}), ...(emptyStudy ? { emptyStudy: true } : {}), savedAt: opts.savedAt || new Date().toISOString(), app: { name: 'MIE 446 Wing AeroStruct', engine: E.VERSION, io: IO_VERSION }, study };
  }
  const exportPrintedStudy = (S, engine, opts) => `${JSON.stringify(printedStudyDocument(S, engine, opts), null, 2)}\n`;
  /** Manufacturing preflight only. No model edits, no CAD generation and no safety approval. */
  function fabricationIssues(S, E) {
    if (S.emptyStudy) return ['Create a wing first. This is an empty study, not a printable wing.'];
    const n=printedEngineInput(S,E),g=n.geometry,m=n.pla,errors=[];
    // One-piece and larger designs may be exported; the notebook validates actual CAD against its configured printer.
    if(g.skin<.8||g.ribThickness<.8||g.te<.8)errors.push('Printed skin, ribs and trailing edge must be ≥0.8 mm.');
    if(!['pla_upright','pla_flat'].includes(S.plaKey))errors.push('The notebook currently fabricates PLA, not custom/metal shell materials.');
    if(g.rodFractions.some(f=>f<.1||f>.8)||g.rodFractions.length&&(g.clearance<.05||g.sleeveWall<.8))errors.push('CAD rod positions must be 0.10–0.80c; radial clearance ≥0.05 mm and sleeve wall ≥0.8 mm.');
    for(const [i,s]of (g.spars||[]).entries()){
      if(s.widthMode==='auto')errors.push(`Spar ${i+1}: automatic cap-width taper is supported by the browser CAD exporter; use Download STL/DXF/STEP rather than the optional legacy notebook.`);
      if(['E','nu','rho','ft','fc','fs'].some(k=>Math.abs(s.material[k]-m[k])>1e-9*Math.max(1,Math.abs(m[k]))))errors.push(`Spar ${i+1}: integral single-filament printing requires the same effective PLA properties as the shell. Match its material card and Solve; a carbon/metal spar cannot silently become printed PLA.`);
      if(Math.min(s.topThickness,s.bottomThickness,s.webThickness)<.4)errors.push(`Spar ${i+1}: cap/web thickness must be ≥0.4 mm; slicer extrusion-path inspection remains required.`);
    }
    return errors;
  }
  /** Versioned study document for the D.520 UI input MS.input. Throws when it is not valid. */
  function d520StudyDocument(input, metalEngine, opts = {}) {
    const M = metalEngine || globalMetal();
    if (!M) throw new Error('MetalWingEngine is not loaded.');
    const raw = canonicalD520FromUi(input, M), issues = makeIssues();
    const study = checkD520Study(issues, raw, 'study', M);
    if (study && !issues.count) d520EngineChecks(issues, study, 'study', M);
    issues.finish();
    if (issues.errors.length) throw savedError('The current D.520 study cannot be saved', issues.errors);
    return { format: STUDY_FORMAT, version: FILE_VERSION, workspace: 'd520', savedAt: opts.savedAt || new Date().toISOString(), app: { name: 'MIE 446 Wing Lab', engine: M.VERSION, io: IO_VERSION }, study };
  }
  const exportD520Study = (input, metalEngine, opts) => `${JSON.stringify(d520StudyDocument(input, metalEngine, opts), null, 2)}\n`;

  // ------------------------------------------------------------------ share links
  /** base64url(UTF-8 JSON) of a study document, after the same validation as a file. Throws when invalid or too long. */
  function encodeShare(studyDocument, opts = {}) {
    if (!isObj(studyDocument)) throw new Error('encodeShare needs a Wing Lab study document (an object).');
    if (isObj(studyDocument.study) && own(studyDocument.study, 'aeroLoad')) throw new Error('Share links do not carry an applied aerodynamic load (its solved mesh levels are too large for a link). Save the study as a JSON file, or remove the aerodynamic load to share the other inputs.');
    const json = JSON.stringify(studyDocument);
    const check = importStudy(json, { ...opts, workspace: null, source: 'share link' });
    if (!check.ok) throw savedError('This study cannot be shared', check.errors);
    const token = base64urlEncode(utf8Encode(json));
    if (token.length > LIMITS.shareChars) throw new Error(`This study is too long for a link (${token.length} characters; the limit is ${LIMITS.shareChars}). Save it as a file instead.`);
    return token;
  }
  const shareFragment = (token) => `#${SHARE_KEY}=${token}`;
  /**
   * Decode a link, a "#wingstudy=…" fragment or a bare token, and import it exactly like a file
   * (opts: {engine, metalEngine, workspace}). Returns the same result object as importStudy.
   */
  function decodeShare(fragment, opts = {}) {
    const res = studyResult(opts.workspace || null, null);
    res.provenance.source = 'share link';
    const fail = (msg) => { res.errors = [msg]; res.preview = { title: 'Study link', rows: [] }; return res; };
    if (typeof fragment !== 'string' || !fragment.trim()) return fail('The link is empty.');
    let token = fragment.trim();
    const hash = token.indexOf('#');
    if (hash >= 0) token = token.slice(hash + 1);
    const part = token.split('&').find((p) => p.startsWith(`${SHARE_KEY}=`));
    if (part) token = part.slice(SHARE_KEY.length + 1);
    else if (token.includes('=')) return fail(`The link has no "${SHARE_KEY}=" part.`);
    if (token.length > LIMITS.shareChars) return fail(`The link is too long to be a study link (${token.length} characters; the limit is ${LIMITS.shareChars}).`);
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return fail('The link contains characters that a study link never contains (it may be damaged).');
    let bytes;
    try { bytes = base64urlDecode(token); } catch (e) { return fail('The link is damaged or incomplete.'); }
    return importStudy(bytes, { ...opts, source: 'share link' });
  }

  // ------------------------------------------------------------------ neutral design-parameter files
  const FRAME = Object.freeze({ span: 'y', chord: 'x', up: 'z', origin: 'root leading edge' });
  const FRAME_TEXT = Object.freeze({ span: 'span axis', chord: 'chord axis (leading edge → trailing edge)', up: 'thickness axis (upward)', origin: 'origin' });
  const PARAM_KEYS = Object.freeze(['format', 'version', 'source', 'units', 'span', 'frame', 'airfoil', 'rootChord', 'tipChord', 'sweepDeg',
    'dihedralDeg', 'twistDeg', 'sections', 'structure', 'material', 'supports', 'loads', 'criteria', 'notes']);
  const REQUIRED_ITEMS = Object.freeze([
    Object.freeze({ id: 'skin', label: 'Skin thickness', path: 'structure.skin' }),
    Object.freeze({ id: 'ribs', label: 'Rib layout (interior rib count or stations)', path: 'structure.ribs' }),
    Object.freeze({ id: 'rods', label: 'Spanwise rods (positions x/c and diameter; an empty list means no rods)', path: 'structure.rods' }),
    Object.freeze({ id: 'modules', label: 'Modules and seams (module count; dry or bonded seams when there is more than one module)', path: 'structure.modules' }),
    Object.freeze({ id: 'material', label: 'Material cards (printed PLA; the rod card when there are rods)', path: 'material' }),
    Object.freeze({ id: 'support', label: 'Root support (clamped root)', path: 'supports.root' }),
    Object.freeze({ id: 'loads', label: 'Load case', path: 'loads' }),
  ]);
  const PARAMETER_TEMPLATE = deepFreeze({
    format: PARAMS_FORMAT,
    version: 1,
    notes: 'Template for transferring an outer wing shape into the MIE 446 Wing Lab by hand. Replace the example values with your design. Lengths use units.length; angles are degrees and must be 0. See WING_IMPORT.md.',
    source: { app: 'manual transfer', appVersion: '', filename: '', exportedAt: '' },
    units: { length: 'mm' },
    span: { value: 450, kind: 'semi' },
    frame: { span: 'y', chord: 'x', up: 'z', origin: 'root leading edge' },
    airfoil: { type: 'naca4', code: '2412' },
    rootChord: 160,
    tipChord: 100,
    sweepDeg: 0,
    dihedralDeg: 0,
    twistDeg: 0,
  });
  function deepFreeze(o) { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; }
  const parameterTemplateText = () => `${JSON.stringify(PARAMETER_TEMPLATE, null, 2)}\n`;
  const NACA_DESIGNATION = /^\s*(?:NACA[\s-]*)?(\d{4})\s*$/i;

  /**
   * Import an untrusted design-parameter file (text or bytes). opts: {filename, engine}.
   * Returns {ok, status:'complete'|'geometry-only'|'rejected', analysisBlocked, fields, geometry, state,
   * required, supplied, errors, warnings, provenance, preview}. Never solves.
   */
  function importParameters(input, opts = {}) {
    const E = opts.engine || globalWing();
    const res = {
      ok: false, kind: 'parameters', workspace: 'printed', status: 'rejected', analysisBlocked: true, fields: [], geometry: null, state: null,
      required: [], supplied: [], errors: [], warnings: [], preview: null,
      provenance: { filename: cleanName(opts.filename), sha256: null, bytes: null, app: null, appVersion: null, exportedAt: null, sourceFilename: null },
    };
    const issues = makeIssues();
    const ov = (value, unit) => ({ value: value === undefined ? null : clone(value), unit: unit || null });
    const field = (path, original, converted, origin, note, target) => res.fields.push({ path, original, converted, origin, note: note || '', target: target || null });
    const done = () => {
      issues.finish();
      res.errors = issues.errors; res.warnings = issues.warnings;
      if (res.errors.length) { res.ok = false; res.status = 'rejected'; res.state = null; res.geometry = null; res.analysisBlocked = true; res.required = []; }
      res.preview = { title: 'Design parameters', rows: res.fields.map((f) => ({ group: f.origin, label: f.path, value: fieldValue(f.converted) })) };
      return res;
    };
    if (!E) { issues.err('', 'WingEngine is not loaded, so design parameters cannot be checked.'); return done(); }
    const read = readInput(input, 'The design-parameter file');
    res.provenance.bytes = read.byteLength === undefined ? null : read.byteLength;
    res.provenance.sha256 = read.sha256 || null;
    if (read.error) { issues.err('', read.error); return done(); }
    let doc;
    try { doc = parseJson(read.text); } catch (e) { issues.err('', `This is not valid JSON: ${e.message}.`); return done(); }
    if (!isObj(doc)) { issues.err('', `This JSON text does not contain design parameters (expected an object, found ${describe(doc)}).`); return done(); }
    if (doc.format === STUDY_FORMAT) { issues.err('format', 'this is a Wing Lab study file (mie446-wing-study): use "Open study", not "Import design parameters"'); return done(); }
    if (doc.format !== PARAMS_FORMAT) { issues.err('format', `must be "${PARAMS_FORMAT}", not ${describe(doc.format)}. Exports of other tools are not read directly: transfer the values into the template by hand (see WING_IMPORT.md)`); return done(); }
    if (!Number.isInteger(doc.version)) { issues.err('version', `must be the whole number ${FILE_VERSION}, not ${describe(doc.version)}`); return done(); }
    if (doc.version !== FILE_VERSION) { issues.err('version', doc.version > FILE_VERSION ? `file version ${doc.version} is newer than this page reads (version ${FILE_VERSION}); nothing was imported` : `${doc.version} is not a valid file version`); return done(); }
    checkKeys(issues, doc, '', PARAM_KEYS);
    if (own(doc, 'notes')) text(issues, doc, 'notes', '', { max: LIMITS.notesChars, multiline: true });

    // provenance
    const src = objectField(issues, doc, 'source', '', { label: '{app, appVersion, filename, exportedAt}' });
    if (src) {
      for (const k of Object.keys(src)) if (!['app', 'appVersion', 'filename', 'exportedAt'].includes(k)) issues.warn(join('source', k), 'unknown metadata field ignored');
      const app = text(issues, src, 'app', 'source', { max: 120, nonEmpty: true });
      const ver = text(issues, src, 'appVersion', 'source', { optional: true, max: 60 });
      const fn = text(issues, src, 'filename', 'source', { optional: true, max: LIMITS.filenameChars });
      const at = text(issues, src, 'exportedAt', 'source', { optional: true, max: 40 });
      res.provenance.app = app === undefined ? null : app;
      res.provenance.appVersion = ver || null;
      res.provenance.sourceFilename = fn || null;
      if (at) { if (Number.isNaN(Date.parse(at))) issues.warn('source.exportedAt', 'is not a valid date and time; ignored'); else res.provenance.exportedAt = at; }
    }

    // units and frame
    let U = null;
    const units = objectField(issues, doc, 'units', '', { label: '{length: "mm" | "cm" | "m" | "in"}' });
    if (units) {
      checkKeys(issues, units, 'units', ['length', 'force', 'stress']);
      const len = units.length;
      if (!own(units, 'length')) issues.err('units.length', 'is missing ("mm", "cm", "m" or "in")');
      else if (typeof len !== 'string' || !own(LENGTH_UNITS, len)) issues.err('units.length', `${describe(len)} is not a supported length unit: use "mm", "cm", "m" or "in" (nothing is guessed)`);
      else { U = len; field('units.length', ov(len), ov('mm'), 'supplied', LENGTH_UNITS[len].text, null); }
      if (own(units, 'force') && units.force !== 'N') issues.err('units.force', `${describe(units.force)} is not supported: give forces in N`);
      if (own(units, 'stress') && units.stress !== 'MPa') issues.err('units.stress', `${describe(units.stress)} is not supported: give moduli and strengths in MPa`);
    }
    const frame = objectField(issues, doc, 'frame', '', { label: 'axes {"span":"y","chord":"x","up":"z","origin":"root leading edge"}, required so that span, chord and thickness cannot be confused' });
    if (frame) {
      checkKeys(issues, frame, 'frame', Object.keys(FRAME));
      let okFrame = true;
      for (const k of Object.keys(FRAME)) {
        if (frame[k] !== FRAME[k]) {
          okFrame = false;
          issues.err(join('frame', k), `frame mismatch: this importer reads the ${FRAME_TEXT[k]} as ${JSON.stringify(FRAME[k])}, but the file says ${describe(frame[k])}. Nothing is rotated, mirrored or swapped automatically; convert the axes in the source or transfer the values by hand`);
        }
      }
      if (okFrame) field('frame', ov('span y, chord x, up z, origin at the root leading edge'), ov('same'), 'supplied', 'matches the Wing Lab axes', null);
    }
    const toMm = (v) => (U ? lengthToMm(v, U) : v);
    const lenNote = (v, mm) => (U && U !== 'mm' ? `${fmt(v)} ${U} = ${fmt(mm)} mm` : '');

    // span and chords
    let semiFile, semiMm, rootFile, tipFile;
    const span = objectField(issues, doc, 'span', '', { label: '{value, kind: "semi" | "full"}' });
    if (span) {
      checkKeys(issues, span, 'span', ['value', 'kind']);
      const v = num(issues, span, 'value', 'span', { gt: 0, unit: U || undefined, label: 'span length' });
      const kind = choice(issues, span, 'kind', 'span', ['semi', 'full']);
      if (v !== undefined && kind !== undefined) {
        semiFile = kind === 'full' ? half(v) : v;
        semiMm = toMm(semiFile);
        if (kind === 'full') field('span.value', ov(v, U), ov(semiMm, 'mm'), 'derived', `full span ${fmt(v)} ${U || ''} ÷ 2 = semi-span ${fmt(semiFile)} ${U || ''}${U && U !== 'mm' ? ` = ${fmt(semiMm)} mm` : ''}`.replace(/ {2,}/g, ' '), 'geometry.semiSpan');
        else field('span.value', ov(v, U), ov(semiMm, 'mm'), 'supplied', lenNote(v, semiMm) || 'semi-span (root to tip)', 'geometry.semiSpan');
      }
    }
    const chord = (key, label) => {
      const v = num(issues, doc, key, '', { gt: 0, unit: U || undefined, label });
      if (v === undefined) return undefined;
      field(key, ov(v, U), ov(toMm(v), 'mm'), 'supplied', lenNote(v, toMm(v)), `geometry.${key}`);
      return v;
    };
    rootFile = chord('rootChord', 'chord at the root');
    tipFile = chord('tipChord', 'chord at the tip');
    if (rootFile !== undefined && tipFile !== undefined && tipFile > rootFile) {
      issues.err('tipChord', `the tip chord (${fmt(tipFile)}) exceeds the root chord (${fmt(rootFile)}): inverse taper is not supported; the Wing Lab analyses a linear taper with tip ≤ root`);
      res.fields[res.fields.length - 1].origin = 'unsupported';
    }

    // airfoil
    let naca;
    const airfoilExplain = {
      root: 'separate root and tip airfoils are not supported: the Wing Lab uses one NACA 4-digit profile along the whole semi-span (give it as airfoil.type and airfoil.code)',
      tip: 'separate root and tip airfoils are not supported: the Wing Lab uses one NACA 4-digit profile along the whole semi-span (give it as airfoil.type and airfoil.code)',
      coordinates: 'coordinate airfoils are not supported: only NACA 4-digit sections, defined by their designation, can be analysed',
      points: 'coordinate airfoils are not supported: only NACA 4-digit sections, defined by their designation, can be analysed',
      elements: 'multi-element airfoils (slats, flaps, multiple elements) are not supported',
    };
    if (!own(doc, 'airfoil')) issues.err('airfoil', 'is missing ({"type":"naca4","code":"2412"})');
    else if (Array.isArray(doc.airfoil)) {
      issues.err('airfoil', `lists ${doc.airfoil.length} airfoils: multi-profile and multi-element wings are not supported; give one NACA 4-digit profile for the whole semi-wing`);
      field('airfoil', ov(`${doc.airfoil.length} airfoils`), ov(null), 'unsupported', 'one profile only');
    } else if (!isObj(doc.airfoil)) issues.err('airfoil', `must be an object {type, code}, not ${describe(doc.airfoil)}`);
    else {
      const af = doc.airfoil;
      checkKeys(issues, af, 'airfoil', ['type', 'code'], airfoilExplain);
      if (!own(af, 'type')) issues.err('airfoil.type', 'is missing ("naca4")');
      else if (af.type !== 'naca4') {
        const t = typeof af.type === 'string' ? af.type.toLowerCase() : '';
        const why = /coord|dat|point|xy|spline/.test(t) ? 'coordinate airfoils are not supported' : /naca\s*5|naca5|naca\s*6|naca6|naca\s*16/.test(t) ? 'NACA 5-digit, 6-series and 16-series sections are not supported' : 'only "naca4" is supported';
        issues.err('airfoil.type', `${describe(af.type)}: ${why}; the Wing Lab analyses NACA 4-digit sections only`);
        field('airfoil.type', ov(af.type), ov(null), 'unsupported', why);
      }
      if (!own(af, 'code')) issues.err('airfoil.code', 'is missing (such as "2412")');
      else if (typeof af.code !== 'string') issues.err('airfoil.code', `must be text such as "2412" (a number would drop leading zeros), not ${describe(af.code)}`);
      else {
        const m = NACA_DESIGNATION.exec(af.code);
        if (!m) {
          issues.err('airfoil.code', `${JSON.stringify(af.code.slice(0, 40))} is not a NACA 4-digit designation (four digits such as "2412", optionally preceded by "NACA"); other airfoils cannot be analysed`);
          field('airfoil.code', ov(af.code), ov(null), 'unsupported', 'not a NACA 4-digit designation', 'geometry.naca');
        } else {
          try {
            naca = E.normalizeNaca(m[1]);
            field('airfoil.code', ov(af.code), ov(naca), 'supplied', af.code === naca ? 'NACA 4-digit section' : `designation written as its four digits ${naca}`, 'geometry.naca');
          } catch (e) { issues.err('airfoil.code', engineMessage(e, 'WingEngine')); }
        }
      }
    }

    // straight wing only
    const ANGLE_TEXT = {
      sweepDeg: ['sweep', 'swept wings are not supported (the leading edge must be straight and unswept)'],
      dihedralDeg: ['dihedral', 'dihedral is not supported (the semi-wing must be flat)'],
      twistDeg: ['twist', 'twisted (washed-out) wings are not supported'],
    };
    for (const [key, [what, why]] of Object.entries(ANGLE_TEXT)) {
      const v = num(issues, doc, key, '', { unit: 'deg', label: `${what} angle; state 0 for a straight wing` });
      if (v === undefined) continue;
      if (v !== 0) {
        issues.err(key, `${what} of ${fmt(v)}°: ${why}. Nothing is flattened or approximated; change the design or analyse it with another tool`);
        field(key, ov(v, 'deg'), ov(null), 'unsupported', `${what} must be 0`);
      } else field(key, ov(v, 'deg'), ov(0, 'deg'), 'supplied', `${what} 0° (required)`);
    }

    // optional explicit sections: only the root and the tip of the same straight panel
    if (own(doc, 'sections')) {
      const s = doc.sections;
      if (!Array.isArray(s)) issues.err('sections', `must be a list of the root and tip sections, not ${describe(s)}`);
      else if (s.length !== 2) {
        issues.err('sections', s.length > 2 ? `describes ${s.length} sections: multi-section (cranked or multi-panel) wings are not supported; the Wing Lab analyses one straight linear-taper panel from root to tip` : `must list exactly the root and the tip section (got ${s.length})`);
        field('sections', ov(`${s.length} sections`), ov(null), 'unsupported', 'one straight panel only');
      } else {
        const expect = [[0, rootFile, 'root'], [semiFile, tipFile, 'tip']];
        s.forEach((sec, i) => {
          const sp = join('sections', i);
          if (!isObj(sec)) { issues.err(sp, `must be an object, not ${describe(sec)}`); return; }
          checkKeys(issues, sec, sp, ['station', 'chord', 'airfoil', 'leadingEdgeX', 'leadingEdgeZ', 'twistDeg']);
          const [st, ch, which] = expect[i];
          const vs = num(issues, sec, 'station', sp, { ge: 0, unit: U || undefined, label: 'spanwise station from the root' });
          const vc = num(issues, sec, 'chord', sp, { gt: 0, unit: U || undefined, label: 'chord' });
          if (vs !== undefined && st !== undefined && vs !== st) issues.err(join(sp, 'station'), `the ${which} section must be at ${fmt(st)} ${U || ''} (got ${fmt(vs)}); intermediate or extra sections are not supported`.replace(/ {2,}/g, ' '));
          if (vc !== undefined && ch !== undefined && vc !== ch) issues.err(join(sp, 'chord'), `does not match ${which === 'root' ? 'rootChord' : 'tipChord'} (${fmt(vc)} vs ${fmt(ch)}): a non-linear chord distribution is not supported`);
          for (const [k, why] of [['leadingEdgeX', 'a chordwise leading-edge offset means sweep, which is not supported'], ['leadingEdgeZ', 'a vertical leading-edge offset means dihedral, which is not supported'], ['twistDeg', 'section twist is not supported']]) {
            const v = num(issues, sec, k, sp, { optional: true, unit: k === 'twistDeg' ? 'deg' : U || undefined });
            if (v !== undefined && v !== 0) issues.err(join(sp, k), `${fmt(v)}: ${why}`);
          }
          if (own(sec, 'airfoil')) {
            const a = sec.airfoil, ap = join(sp, 'airfoil');
            if (!isObj(a)) issues.err(ap, `must be an object {type, code}, not ${describe(a)}`);
            else {
              checkKeys(issues, a, ap, ['type', 'code'], airfoilExplain);
              const m = typeof a.code === 'string' ? NACA_DESIGNATION.exec(a.code) : null;
              if (a.type !== 'naca4' || !m) issues.err(ap, 'only NACA 4-digit sections ({"type":"naca4","code":"…"}) are supported');
              else if (naca !== undefined && m[1] !== naca) issues.err(join(ap, 'code'), `NACA ${m[1]} differs from the wing airfoil NACA ${naca}: different root and tip airfoils are not supported`);
            }
          }
        });
        field('sections', ov('2 sections'), ov('one straight linear-taper panel'), 'supplied', 'root and tip sections checked against rootChord, tipChord and the airfoil');
      }
    }
    const outer = naca !== undefined && semiMm !== undefined && rootFile !== undefined && tipFile !== undefined && tipFile <= rootFile
      ? { naca, semiSpan: semiMm, rootChord: toMm(rootFile), tipChord: toMm(tipFile) } : null;

    // optional structure, material, supports, loads and criteria
    const D = E.DEFAULT_GEOMETRY, st = {}, have = {};
    const len = (obj, key, path, o, target) => {
      const v = num(issues, obj, key, path, { ...o, unit: U || undefined });
      if (v === undefined || v === null) return v;
      const mm = toMm(v);
      field(join(path, key), ov(v, U), ov(mm, 'mm'), 'supplied', lenNote(v, mm), target);
      return mm;
    };
    if (own(doc, 'structure')) {
      const S = doc.structure;
      if (!isObj(S)) issues.err('structure', `must be an object, not ${describe(S)}`);
      else {
        checkKeys(issues, S, 'structure', ['skin', 'ribs', 'rods', 'modules', 'seams', 'interfaceOffset', 'cap', 'trailingEdge', 'cavity']);
        if (own(S, 'skin')) { st.skin = len(S, 'skin', 'structure', { gt: 0, label: 'skin thickness, measured vertically' }, 'geometry.skin'); have.skin = st.skin !== undefined; }
        if (own(S, 'ribs')) {
          const R = objectField(issues, S, 'ribs', 'structure', { label: '{interior} or {stations}, optional thickness' });
          if (R) {
            checkKeys(issues, R, 'structure.ribs', ['interior', 'stations', 'thickness']);
            const hasI = own(R, 'interior'), hasS = own(R, 'stations');
            if (hasI && hasS) issues.err('structure.ribs', 'give either interior (a count of evenly spaced ribs) or stations (a list), not both');
            else if (!hasI && !hasS) issues.err('structure.ribs', 'needs interior (a count of evenly spaced ribs) or stations (a list of rib stations)');
            else if (hasI) {
              const n = num(issues, R, 'interior', 'structure.ribs', { integer: true, ge: 0, label: 'evenly spaced interior ribs' });
              if (n !== undefined) { st.interiorRibs = n; st.customInteriorRibs = null; have.ribs = true; field('structure.ribs.interior', ov(n), ov(n), 'supplied', 'evenly spaced; the engine adds interface ribs at seams', 'geometry.interiorRibs'); }
            } else {
              const list = R.stations, lp = 'structure.ribs.stations';
              if (!Array.isArray(list)) issues.err(lp, `must be a list of stations, not ${describe(list)}`);
              else {
                const out = [];
                let okList = true;
                list.forEach((v, i) => {
                  if (!isNum(v)) { issues.err(join(lp, i), `must be a finite number${U ? ` in ${U}` : ''}, not ${describe(v)}`); okList = false; return; }
                  if (i && !(v > list[i - 1])) { issues.err(join(lp, i), `rib stations must increase strictly (${fmt(v)} after ${fmt(list[i - 1])})`); okList = false; }
                  out.push(toMm(v));
                });
                if (okList) { st.customInteriorRibs = out; st.interiorRibs = out.length; have.ribs = true; field(lp, ov(clone(list), U), ov(out, 'mm'), 'supplied', U && U !== 'mm' ? `converted from ${U}` : '', 'geometry.customInteriorRibs'); }
              }
            }
            if (own(R, 'thickness')) st.ribThickness = len(R, 'thickness', 'structure.ribs', { gt: 0, label: 'rib thickness' }, 'geometry.ribThickness');
          }
        }
        if (own(S, 'rods')) {
          const R = objectField(issues, S, 'rods', 'structure', { label: '{fractions, diameter, clearance, sleeveWall, bonded}' });
          if (R) {
            checkKeys(issues, R, 'structure.rods', ['fractions', 'diameter', 'clearance', 'sleeveWall', 'bonded']);
            const fr = R.fractions, fp = 'structure.rods.fractions';
            let fractions;
            if (!own(R, 'fractions')) issues.err(fp, 'is missing (rod positions x/c; [] for no rods)');
            else if (!Array.isArray(fr)) issues.err(fp, `must be a list of x/c values, not ${describe(fr)}`);
            else if (fr.length > LIMITS.rods) issues.err(fp, `lists ${fr.length} rods; at most ${LIMITS.rods} are allowed`);
            else {
              let okF = true;
              fr.forEach((v, i) => {
                if (!isNum(v)) { issues.err(join(fp, i), `must be a finite number (x/c), not ${describe(v)}`); okF = false; }
                else if (!(v > 0 && v < 1)) { issues.err(join(fp, i), `must lie strictly between 0 and 1 (got ${fmt(v)})`); okF = false; }
              });
              if (okF) { fractions = fr.slice(); field(fp, ov(fractions), ov(fractions), 'supplied', fractions.length ? 'x/c from the local leading edge' : 'no rods', 'geometry.rodFractions'); }
            }
            const dia = own(R, 'diameter') ? len(R, 'diameter', 'structure.rods', { gt: 0, label: 'rod diameter' }, 'geometry.rodDiameter') : undefined;
            if (fractions && fractions.length && !own(R, 'diameter')) issues.err('structure.rods.diameter', 'is missing: rods need a diameter');
            if (own(R, 'clearance')) { st.clearance = len(R, 'clearance', 'structure.rods', { ge: 0, label: 'radial clearance' }, 'geometry.clearance'); }
            if (own(R, 'sleeveWall')) st.sleeveWall = len(R, 'sleeveWall', 'structure.rods', { gt: 0, label: 'printed sleeve wall' }, 'geometry.sleeveWall');
            if (own(R, 'bonded')) { st.rodsBonded = bool(issues, R, 'bonded', 'structure.rods'); if (st.rodsBonded !== undefined) field('structure.rods.bonded', ov(st.rodsBonded), ov(st.rodsBonded), 'supplied', st.rodsBonded ? 'epoxied in the sleeves' : 'slip fit', 'assembly.rodsBonded'); }
            if (fractions) { st.rodFractions = fractions; if (dia !== undefined) st.rodDiameter = dia; have.rods = !fractions.length || dia !== undefined; }
          }
        }
        if (own(S, 'modules')) {
          st.modules = num(issues, S, 'modules', 'structure', { integer: true, ge: 1, le: 3, label: 'number of printed modules' });
          if (st.modules !== undefined) field('structure.modules', ov(st.modules), ov(st.modules), 'supplied', st.modules === 1 ? 'one piece, no seams' : `${st.modules - 1} seam(s)`, 'geometry.modules');
        }
        if (own(S, 'seams')) {
          const R = objectField(issues, S, 'seams', 'structure', { label: '{bonded, freeLength, adhesiveTensile}' });
          if (R) {
            checkKeys(issues, R, 'structure.seams', ['bonded', 'freeLength', 'adhesiveTensile']);
            if (own(R, 'bonded')) { st.seamsBonded = bool(issues, R, 'bonded', 'structure.seams'); if (st.seamsBonded !== undefined) field('structure.seams.bonded', ov(st.seamsBonded), ov(st.seamsBonded), 'supplied', st.seamsBonded ? 'epoxied seams' : 'dry seams (rods only)', 'assembly.seamsBonded'); }
            if (own(R, 'freeLength')) st.seamFreeLength = len(R, 'freeLength', 'structure.seams', { gt: 0, label: 'rod free length at a dry seam' }, 'assembly.seamFreeLength');
            if (own(R, 'adhesiveTensile')) {
              st.adhesiveTensile = num(issues, R, 'adhesiveTensile', 'structure.seams', { gt: 0, unit: 'MPa', label: 'epoxy butt-joint strength' });
              if (st.adhesiveTensile !== undefined) field('structure.seams.adhesiveTensile', ov(st.adhesiveTensile, 'MPa'), ov(st.adhesiveTensile, 'MPa'), 'supplied', '', 'assembly.adhesiveTensile');
            }
          }
        }
        have.modules = st.modules !== undefined && (st.modules === 1 || st.seamsBonded !== undefined);
        if (own(S, 'interfaceOffset')) st.interfaceOffset = len(S, 'interfaceOffset', 'structure', { gt: 0, label: 'interface rib offset from a seam' }, 'geometry.interfaceOffset');
        if (own(S, 'cap')) st.cap = len(S, 'cap', 'structure', { gt: 0, label: 'root and tip cap thickness' }, 'geometry.cap');
        if (own(S, 'trailingEdge')) st.te = len(S, 'trailingEdge', 'structure', { gt: 0, label: 'printed trailing-edge thickness' }, 'geometry.te');
        if (own(S, 'cavity')) {
          const R = objectField(issues, S, 'cavity', 'structure', { label: '{start, end} as x/c' });
          if (R) {
            checkKeys(issues, R, 'structure.cavity', ['start', 'end']);
            const a = num(issues, R, 'start', 'structure.cavity', { gt: 0, lt: 1, label: 'cavity start x/c' });
            const b = num(issues, R, 'end', 'structure.cavity', { gt: 0, lt: 1, label: 'cavity end x/c' });
            if (a !== undefined && b !== undefined) {
              if (!(b > a)) issues.err('structure.cavity.end', `must be greater than start (${fmt(a)} → ${fmt(b)})`);
              else { st.cavityStart = a; st.cavityEnd = b; field('structure.cavity', ov(`${fmt(a)}–${fmt(b)}`), ov(`${fmt(a)}–${fmt(b)}`), 'supplied', 'x/c', 'geometry.cavityStart/cavityEnd'); }
            }
          }
        }
      }
    }
    const mat = {};
    if (own(doc, 'material')) {
      const R = doc.material;
      if (!isObj(R)) issues.err('material', `must be an object {shell, rod}, not ${describe(R)}`);
      else {
        checkKeys(issues, R, 'material', ['shell', 'rod']);
        const keysOf = (kind) => Object.keys(E.MATERIALS).filter((k) => E.MATERIALS[k] && E.MATERIALS[k].kind === kind);
        const part = (key, kind, overrides) => {
          const p = join('material', key), o = objectField(issues, R, key, 'material', { optional: true, label: `{card${overrides.map((f) => `, ${f}`).join('')}}` });
          if (!o) return undefined;
          checkKeys(issues, o, p, ['card', ...overrides]);
          const cardKey = choice(issues, o, 'card', p, keysOf(kind));
          const over = {};
          for (const f of overrides) {
            if (!own(o, f)) { over[f] = null; continue; }
            over[f] = num(issues, o, f, p, { gt: 0, unit: 'MPa', label: 'override of the card value' });
            if (over[f] !== undefined) field(join(p, f), ov(over[f], 'MPa'), ov(over[f], 'MPa'), 'supplied', 'override of the card value', `${kind === 'pla' ? 'plaOver' : 'rodOver'}.${f}`);
          }
          if (cardKey !== undefined) field(join(p, 'card'), ov(cardKey), ov(E.MATERIALS[cardKey].name), 'supplied', E.MATERIALS[cardKey].source || '', kind === 'pla' ? 'plaKey' : 'rodKey');
          return cardKey === undefined || Object.values(over).includes(undefined) ? undefined : { card: cardKey, over };
        };
        const shell = part('shell', 'pla', ['E', 'ft', 'fc', 'fs']);
        const rod = part('rod', 'rod', ['E']);
        if (shell) { mat.plaKey = shell.card; mat.plaOver = shell.over; }
        if (rod) { mat.rodKey = rod.card; mat.rodOver = rod.over; }
        if (!own(R, 'shell')) issues.warn('material.shell', 'is not given: the printed PLA card is still required before analysis');
      }
    }
    const rodsNeeded = Array.isArray(st.rodFractions) && st.rodFractions.length > 0;
    have.material = mat.plaKey !== undefined && (!rodsNeeded || mat.rodKey !== undefined);
    if (own(doc, 'supports')) {
      const R = doc.supports;
      if (!isObj(R)) issues.err('supports', `must be an object {root: "clamped"}, not ${describe(R)}`);
      else {
        checkKeys(issues, R, 'supports', ['root']);
        if (!own(R, 'root')) issues.err('supports.root', 'is missing ("clamped")');
        else if (R.root !== 'clamped') { issues.err('supports.root', `${describe(R.root)} is not supported: the printed semi-wing is analysed as a cantilever clamped at the root face ("clamped")`); field('supports.root', ov(R.root), ov(null), 'unsupported', 'clamped root only'); }
        else { have.support = true; field('supports.root', ov('clamped'), ov('clamped root face'), 'supplied', 'no deflection, slope or twist at y = 0', null); }
      }
    }
    let load;
    if (own(doc, 'loads')) {
      const conv = U ? {
        fileLen: U, fileLine: `N/${U}`, toLen: (v) => lengthToMm(v, U), toLine: (v) => perLengthToPerMm(v, U), note: U === 'mm' ? '' : ` (converted from ${U})`,
      } : { fileLen: 'mm', fileLine: 'N/mm', toLen: (v) => v, toLine: (v) => v, note: '' };
      if (semiMm === undefined) issues.err('loads', 'cannot be checked without a valid span');
      else {
        load = checkPrintedLoad(issues, doc.loads, 'loads', semiMm, E, conv);
        if (load) {
          have.loads = true;
          const desc = load.kind === 'custom' ? (load.items.length ? `${load.items.length} custom item(s), ${countSegments(load.items)} segment(s)` : 'custom, no load defined yet') : load.kind === 'tip' ? `tip force ${fmt(load.tipForce)} N` : `flight-like lift, n = ${fmt(load.loadFactor)}`;
          field('loads', ov(desc), ov(desc), 'supplied', U && U !== 'mm' && load.kind === 'custom' ? `stations converted from ${U} to mm and line loads from N/${U} to N/mm` : '', 'load');
          if (load.kind === 'custom') load.items.forEach((it, i) => field(`loads.items[${i}]`, ov(describeItem(itemInFileUnits(doc.loads.items[i]), { len: U || 'mm', line: `N/${U || 'mm'}` })), ov(describeItem(it, { len: 'mm', line: 'N/mm' })), 'supplied', '', `load.items[${i}]`));
        }
      }
    }
    let criteria;
    if (own(doc, 'criteria')) criteria = checkCriteria(issues, doc.criteria, 'criteria', E, { fileLen: U || 'mm', toLen: toMm });

    if (issues.count) return done();
    res.geometry = outer;
    res.provenance.app = res.provenance.app || null;
    res.supplied = REQUIRED_ITEMS.filter((r) => have[r.id]).map((r) => r.id);
    res.required = REQUIRED_ITEMS.filter((r) => !have[r.id]).map((r) => ({ ...r }));
    for (const r of res.required) field(r.path, ov(null), ov(null), 'missing', `${r.label}: required before analysis`, null);
    if (res.required.length) {
      res.ok = true; res.status = 'geometry-only'; res.analysisBlocked = true;
      if (res.supplied.length) issues.warn('structure', `${res.supplied.length} of ${REQUIRED_ITEMS.length} required items are in the file; they are shown for reference and are applied only when the file supplies all of them`);
      return done();
    }
    // complete: assemble the study (defaults are reported as assumed) and run the engine checks
    const assumed = (path, target, value, unit, note) => { field(path, ov(null), ov(value, unit), 'assumed', note || 'not in the file: the Wing Lab default is used', target); return clone(value); };
    const g = clone(D);
    Object.assign(g, outer);
    g.skin = st.skin;
    g.ribThickness = st.ribThickness !== undefined ? st.ribThickness : assumed('structure.ribs.thickness', 'geometry.ribThickness', D.ribThickness, 'mm');
    g.modules = st.modules;
    g.interiorRibs = st.interiorRibs;
    g.customInteriorRibs = st.customInteriorRibs;
    g.rodFractions = st.rodFractions;
    g.rodDiameter = st.rodDiameter !== undefined ? st.rodDiameter : assumed('structure.rods.diameter', 'geometry.rodDiameter', D.rodDiameter, 'mm', 'not used: there are no rods');
    g.clearance = st.clearance !== undefined ? st.clearance : assumed('structure.rods.clearance', 'geometry.clearance', D.clearance, 'mm');
    g.sleeveWall = st.sleeveWall !== undefined ? st.sleeveWall : assumed('structure.rods.sleeveWall', 'geometry.sleeveWall', D.sleeveWall, 'mm');
    g.interfaceOffset = st.interfaceOffset !== undefined ? st.interfaceOffset : assumed('structure.interfaceOffset', 'geometry.interfaceOffset', D.interfaceOffset, 'mm');
    g.cap = st.cap !== undefined ? st.cap : assumed('structure.cap', 'geometry.cap', D.cap, 'mm');
    g.te = st.te !== undefined ? st.te : assumed('structure.trailingEdge', 'geometry.te', D.te, 'mm');
    if (st.cavityStart !== undefined) { g.cavityStart = st.cavityStart; g.cavityEnd = st.cavityEnd; }
    else { assumed('structure.cavity', 'geometry.cavityStart/cavityEnd', `${fmt(D.cavityStart)}–${fmt(D.cavityEnd)}`, 'x/c'); }
    const A = E.DEFAULT_ASSEMBLY;
    const assembly = {
      rodsBonded: st.rodsBonded !== undefined ? st.rodsBonded : assumed('structure.rods.bonded', 'assembly.rodsBonded', false, null, 'not in the file: slip-fit rods'),
      seamsBonded: st.seamsBonded !== undefined ? st.seamsBonded : assumed('structure.seams.bonded', 'assembly.seamsBonded', false, null, 'one-piece wing: there are no seams'),
      seamFreeLength: st.seamFreeLength !== undefined ? st.seamFreeLength : assumed('structure.seams.freeLength', 'assembly.seamFreeLength', 2 * g.interfaceOffset, 'mm', 'not in the file: 2 × interface rib offset (the engine rule)'),
      adhesiveTensile: st.adhesiveTensile !== undefined ? st.adhesiveTensile : assumed('structure.seams.adhesiveTensile', 'assembly.adhesiveTensile', A.adhesiveTensile, 'MPa'),
    };
    for (const k of Object.keys(A)) if (!own(assembly, k)) assembly[k] = clone(A[k]);
    if (mat.rodKey === undefined) { mat.rodKey = assumed('material.rod.card', 'rodKey', 'rod_hobby', null, 'not used: there are no rods'); mat.rodOver = { E: null }; }
    if (!criteria) criteria = assumed('criteria', 'criteria', { ...E.DEFAULT_CRITERIA }, null, `not in the file: Wing Lab defaults (tip deflection ≤ ${fmt(E.DEFAULT_CRITERIA.maxTipDeflection)} mm, tip twist ≤ ${fmt(E.DEFAULT_CRITERIA.maxTipTwist)}°)`);
    const state = { geometry: g, plaKey: mat.plaKey, plaOver: mat.plaOver, rodKey: mat.rodKey, rodOver: mat.rodOver, assembly, load, criteria };
    // Check the assembled study like a native one, then report every problem at the file's own field.
    const inner = makeIssues();
    const check = checkPrintedStudy(inner, printedStudyOf(state), 'study', E);
    if (check && !inner.count) printedEngineChecks(inner, printedState(check), 'study', E);
    inner.finish();
    inner.errors.forEach((m) => issues.err('', fileLocation(m)));
    inner.warnings.forEach((m) => issues.warn('', fileLocation(m)));
    if (check && !issues.count) { res.ok = true; res.status = 'complete'; res.analysisBlocked = false; res.state = printedState(check); }
    return done();
  }
  // "study.geometry.skin: …" (assembled study) → "structure.skin: …" (design-parameter file).
  const FILE_PATHS = [
    ['study.geometry.naca', 'airfoil.code'], ['study.geometry.semiSpan', 'span.value'], ['study.geometry.rootChord', 'rootChord'],
    ['study.geometry.tipChord', 'tipChord'], ['study.geometry.skin', 'structure.skin'], ['study.geometry.ribThickness', 'structure.ribs.thickness'],
    ['study.geometry.modules', 'structure.modules'], ['study.geometry.interiorRibs', 'structure.ribs.interior'],
    ['study.geometry.customInteriorRibs', 'structure.ribs.stations'], ['study.geometry.rodFractions', 'structure.rods.fractions'],
    ['study.geometry.rodDiameter', 'structure.rods.diameter'], ['study.geometry.clearance', 'structure.rods.clearance'],
    ['study.geometry.sleeveWall', 'structure.rods.sleeveWall'], ['study.geometry.interfaceOffset', 'structure.interfaceOffset'],
    ['study.geometry.cap', 'structure.cap'], ['study.geometry.te', 'structure.trailingEdge'], ['study.geometry.cavityStart', 'structure.cavity.start'],
    ['study.geometry.cavityEnd', 'structure.cavity.end'], ['study.geometry', 'structure'], ['study.assembly.seamFreeLength', 'structure.seams.freeLength'],
    ['study.assembly.adhesiveTensile', 'structure.seams.adhesiveTensile'], ['study.assembly.seamsBonded', 'structure.seams.bonded'],
    ['study.assembly.rodsBonded', 'structure.rods.bonded'], ['study.assembly', 'structure'], ['study.materials', 'material'],
    ['study.load', 'loads'], ['study.criteria', 'criteria'], ['study', 'design parameters'],
  ];
  function fileLocation(message) {
    for (const [from, to] of FILE_PATHS) {
      if (message.startsWith(from) && /^[.[:]/.test(message.slice(from.length))) return to + message.slice(from.length);
    }
    return message;
  }
  // File-unit copy of a raw item for the "In the file" column (display only).
  function itemInFileUnits(raw) {
    const r = {};
    for (const k of Object.keys(raw)) r[k] = raw[k];
    return r;
  }
  function fieldValue(v) {
    if (!v || v.value === null || v.value === undefined) return '—';
    const val = Array.isArray(v.value) ? v.value.map((x) => (Array.isArray(x) ? `[${x.map(fmt).join(', ')}]` : fmt(x))).join(', ') : isObj(v.value) ? Object.entries(v.value).map(([k, x]) => `${k} ${fmt(x)}`).join(', ') : fmt(v.value);
    return v.unit ? `${val} ${v.unit}` : val;
  }
  /**
   * Problems that applying an outer geometry {naca, semiSpan, rootChord, tipChord} to the current
   * printed UI state would cause (ribs outside the new span, a collapsing cavity …). Empty when none.
   */
  function checkOuterGeometry(uiState, outer, engine) {
    const E = engine || globalWing();
    try {
      const raw = canonicalPrintedFromUi(uiState, E);
      // A neutral-v1 file declares a single, straight NACA4 outer shape.
      // Never retain hidden station profiles or angles from the current study.
      for(const k of GEOMETRY_V2)delete raw.geometry[k];
      raw.geometry = { ...raw.geometry, naca: outer.naca, semiSpan: outer.semiSpan, rootChord: outer.rootChord, tipChord: outer.tipChord };
      const issues = makeIssues();
      const study = checkPrintedStudy(issues, raw, 'current study', E);
      if (study && !issues.count) printedEngineChecks(issues, printedState(study), 'current study', E);
      issues.finish();
      return issues.errors;
    } catch (e) { return [e.message]; }
  }

  // ------------------------------------------------------------------ preview (one model, two renderers)
  const ORIGIN_TEXT = Object.freeze({ supplied: 'supplied', derived: 'derived', assumed: 'assumed', missing: 'missing', unsupported: 'unsupported' });
  function provenanceRows(p, kind) {
    const rows = [];
    if (!p) return rows;
    if (p.projectName) rows.push(['Project', p.projectName]);
    rows.push(['File', p.filename || (p.source === 'share link' ? 'share link' : '—')]);
    if (p.bytes !== null && p.bytes !== undefined) rows.push(['Size', `${p.bytes} bytes`]);
    if (p.sha256) rows.push(['SHA-256', p.sha256]);
    if (kind === 'parameters') {
      rows.push(['Source app (as stated in the file)', p.app ? `${p.app}${p.appVersion ? ` ${p.appVersion}` : ''}` : '—']);
      if (p.sourceFilename) rows.push(['Source design file', p.sourceFilename]);
      if (p.exportedAt) rows.push(['Exported at', p.exportedAt]);
    } else {
      if (p.savedAt) rows.push(['Saved at', p.savedAt]);
      if (p.engine || p.savedWith) rows.push(['Saved with', `${p.savedWith || 'unknown app'}${p.engine ? `, engine ${p.engine}` : ''}`]);
    }
    return rows;
  }
  /** Display model shared by previewHtml and mount(). All values are plain text. */
  function previewModel(result) {
    if (!result || typeof result !== 'object') return { title: 'Nothing to preview', state: { kind: 'error', text: '' }, errors: [], warnings: [], lists: [], tables: [], provenance: [] };
    if (result.kind === 'parameters') {
      const st = result.status;
      const stateText = st === 'complete' ? 'Complete: every required item is in the file and the assembled study passed the WingEngine checks. Applying it does not start a solve.'
        : st === 'geometry-only' ? 'Outer geometry only — analysis blocked until skin, ribs, rods, modules/seams, material, root support and loads are supplied (in the file or in the app).'
          : 'Rejected: nothing can be applied. Fix the file or transfer the values by hand.';
      return {
        title: 'Design parameters',
        state: { kind: st === 'complete' ? 'ok' : st === 'geometry-only' ? 'blocked' : 'error', text: stateText },
        errors: result.errors.slice(), warnings: result.warnings.slice(),
        lists: result.required.length ? [{ heading: 'Required before analysis (analysis blocked)', kind: 'required', items: result.required.map((r) => `${r.label} — ${r.path}`) }] : [],
        tables: result.fields.length ? [{ caption: 'Fields: value in the file, value in the Wing Lab (mm), origin', columns: ['Field', 'In the file', 'Wing Lab value', 'Origin', 'Note'], rows: result.fields.map((f) => [f.path, fieldValue(f.original), fieldValue(f.converted), ORIGIN_TEXT[f.origin] || f.origin, f.note || '']) }] : [],
        provenance: provenanceRows(result.provenance, 'parameters'),
      };
    }
    const ws = result.workspace ? WORKSPACE_LABEL[result.workspace] : 'Wing Lab';
    return {
      title: result.ok ? `Open study: ${ws}` : 'Open study: not imported',
      state: result.ok ? { kind: result.warnings.length ? 'warn' : 'ok', text: 'Every field was checked. Apply replaces the current study; Cancel leaves it unchanged.' } : { kind: 'error', text: 'Nothing was imported; your current study is unchanged.' },
      errors: result.errors.slice(), warnings: result.warnings.slice(), lists: [],
      tables: result.ok && result.preview && result.preview.rows.length ? [{ caption: 'Study contents', columns: ['Group', 'Item', 'Value'], rows: result.preview.rows.map((r) => [r.group, r.label, r.value]) }] : [],
      provenance: provenanceRows(result.provenance, 'study'),
    };
  }
  function modelHtml(m) {
    const e = escapeHtml, out = [];
    out.push(`<section class="wio-preview-body"><h4 class="wio-preview-title">${e(m.title)}</h4>`);
    if (m.state.text) out.push(`<p class="wio-state wio-state-${e(m.state.kind)}">${e(m.state.text)}</p>`);
    if (m.errors.length) out.push(`<ul class="wio-errors" role="alert">${m.errors.map((t) => `<li>${e(t)}</li>`).join('')}</ul>`);
    if (m.warnings.length) out.push(`<ul class="wio-warnings">${m.warnings.map((t) => `<li>${e(t)}</li>`).join('')}</ul>`);
    for (const l of m.lists) out.push(`<div class="wio-list wio-list-${e(l.kind)}"><p class="wio-list-heading">${e(l.heading)}</p><ul>${l.items.map((t) => `<li>${e(t)}</li>`).join('')}</ul></div>`);
    for (const t of m.tables) out.push(`<table class="wio-table"><caption>${e(t.caption)}</caption><thead><tr>${t.columns.map((c) => `<th scope="col">${e(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    if (m.provenance.length) out.push(`<dl class="wio-provenance">${m.provenance.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>`);
    out.push('</section>');
    return out.join('');
  }
  /** Escaped HTML preview of an import result (study, link or design parameters). */
  const previewHtml = (result) => modelHtml(previewModel(result));

  // ------------------------------------------------------------------ mount(): file buttons and previews
  let mountCount = 0;
  /**
   * Build the study-file panel inside container with DOM APIs. options: {workspace:'printed'|'d520',
   * getState() → current UI state (S or MS.input), applyState(state, info), engine, documentRef,
   * download(filename, text, mime) (optional override of the browser download),
   * onPreview(node), onApplied(info, message), onDismiss(), canApply() → blocking reason (optional)}.
   * applyState is called only after validation, at most once per preview, and never starts a solve.
   */
  function mount(container, options = {}) {
    if (!container || typeof container.appendChild !== 'function') throw new Error('WingStudyIO.mount needs a container element.');
    const workspace = options.workspace || 'printed';
    if (workspace !== 'printed' && workspace !== 'd520') throw new Error('workspace must be "printed" or "d520".');
    const { getState, applyState } = options;
    if (typeof getState !== 'function' || typeof applyState !== 'function') throw new Error('mount needs getState() and applyState(state, info).');
    const doc = options.documentRef || container.ownerDocument;
    const win = doc.defaultView || {};
    const engine = options.engine || (workspace === 'printed' ? globalWing() : globalMetal());
    const uid = `wio${++mountCount}`;
    const el = (tag, attrs, ...kids) => {
      const node = doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'hidden') node.hidden = true;
        else node.setAttribute(k, v === true ? '' : String(v));
      }
      for (const c of kids) if (c !== null && c !== undefined) node.append(c);
      return node;
    };
    const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
    const button = (label, cls, onClick) => { const b = el('button', { type: 'button', class: `wio-btn ${cls}` }, label); b.addEventListener('click', onClick); return b; };
    const fileInput = (label, cls, onFile) => {
      const input = el('input', { type: 'file', accept: '.json,application/json', class: 'wio-file-input' });
      const lab = el('label', { class: `wio-btn wio-file ${cls}` }, el('span', { class: 'wio-file-text' }, label), input);
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        input.value = '';
        if (f) track(onFile(f));
      });
      return { label: lab, input };
    };
    let pending = Promise.resolve();
    let previewGeneration = 0, destroyed = false;
    const activeReaders = new Set();
    function invalidatePreview() {
      previewGeneration++;
      for (const reader of activeReaders) {
        try { reader.abort(); } catch (_) { /* Some embedded readers cannot abort; the generation guard still applies. */ }
      }
      activeReaders.clear();
      return previewGeneration;
    }
    const currentPreview = (generation) => !destroyed && generation === previewGeneration;
    const track = (p) => { pending = Promise.resolve(p).catch((e) => showFailure('Unexpected problem', [e && e.message ? e.message : String(e)])); return pending; };

    const root = el('div', { class: `wio-root wio-${workspace}`, role: 'group', 'aria-labelledby': `${uid}-title` });
    const title = el('h3', { class: 'wio-title', id: `${uid}-title` }, workspace === 'printed' ? 'Study files' : 'D.520 study files');
    const actions = el('div', { class: 'wio-actions' });
    const status = el('p', { class: 'wio-status', role: 'status', 'aria-live': 'polite' });
    const preview = el('div', { class: 'wio-preview', role: 'region', 'aria-label': 'Import preview', hidden: true });
    const saveBtn = button('Save study', 'wio-save', () => save());
    const open = fileInput('Open study (.json)', 'wio-open', (f) => openFile(f));
    actions.append(saveBtn, open.label);
    let params = null, pasteBox = null, pasteArea = null, templateBtn = null, pasteToggle = null;
    if (workspace === 'printed') {
      params = fileInput('Import design parameters (.json)', 'wio-params', (f) => importParametersFile(f));
      pasteToggle = button('Paste design parameters', 'wio-paste-toggle', () => {
        pasteBox.hidden = !pasteBox.hidden;
        pasteToggle.setAttribute('aria-expanded', String(!pasteBox.hidden));
        if (!pasteBox.hidden && pasteArea.focus) pasteArea.focus();
      });
      pasteToggle.setAttribute('aria-expanded', 'false');
      pasteToggle.setAttribute('aria-controls', `${uid}-paste-box`);
      templateBtn = button('Download parameter template', 'wio-template', () => downloadText('mie446-wing-parameters-template.json', parameterTemplateText(), 'Parameter template downloaded.'));
      actions.append(params.label, pasteToggle, templateBtn);
      pasteArea = el('textarea', { id: `${uid}-paste`, class: 'wio-paste-text', rows: '8', spellcheck: 'false', autocomplete: 'off' });
      pasteBox = el('div', { class: 'wio-paste', id: `${uid}-paste-box`, hidden: true },
        el('label', { for: `${uid}-paste`, class: 'wio-paste-label' }, 'Design parameters (JSON text, format mie446-wing-parameters)'),
        pasteArea,
        button('Preview pasted parameters', 'wio-paste-preview', () => previewParameters(pasteArea.value, 'pasted text')));
    }
    root.append(title, actions);
    if (pasteBox) root.append(pasteBox);
    root.append(status, preview);
    container.appendChild(root);

    const say = (msg) => { status.textContent = msg; };
    function downloadText(filename, textValue, done) {
      try {
        if (typeof options.download === 'function') options.download(filename, textValue, 'application/json');
        else {
          let url, revoke = false;
          if (win.URL && typeof win.URL.createObjectURL === 'function' && win.Blob) { url = win.URL.createObjectURL(new win.Blob([textValue], { type: 'application/json' })); revoke = true; }
          else url = `data:application/json;charset=utf-8,${encodeURIComponent(textValue)}`;
          const a = el('a', { href: url, download: filename, rel: 'noopener', class: 'wio-download' });
          a.style.display = 'none';
          (doc.body || root).appendChild(a);
          a.click();
          a.remove();
          if (revoke && typeof win.setTimeout === 'function') win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
        }
        say(done);
        return true;
      } catch (e) { showFailure('Download failed', [e.message || String(e)]); return false; }
    }
    function stamp() { const d = new Date(), p = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
    function save() {
      let textValue;
      try { textValue = workspace === 'printed' ? exportPrintedStudy(getState(), engine) : exportD520Study(getState(), engine); }
      catch (e) { showFailure('The study could not be saved', e.errors || [e.message || String(e)]); return null; }
      const name = JSON.parse(textValue).projectName;
      const filename = name ? `${safeFilenameStem(name)}.json` : `mie446-${workspace === 'printed' ? 'printed-wing' : 'd520'}-study-${stamp()}.json`;
      return downloadText(filename, textValue, `Saved ${filename}.`) ? textValue : null;
    }
    function readFile(file) {
      return new Promise((resolve) => {
        if (typeof file.size === 'number' && file.size > LIMITS.fileBytes) { resolve({ error: `The file is too large (${file.size} bytes; the limit is ${LIMITS.fileBytes} bytes = ${LIMITS.fileBytes / 1024} KiB).` }); return; }
        if (!win.FileReader) { resolve({ error: 'This browser cannot read local files.' }); return; }
        let reader;
        const finish = (result) => { activeReaders.delete(reader); resolve(result); };
        try {
          reader = new win.FileReader(); activeReaders.add(reader);
          reader.onload = () => finish({ bytes: new Uint8Array(reader.result) });
          reader.onerror = () => finish({ error: 'The file could not be read.' });
          reader.onabort = () => finish({ aborted: true });
          reader.readAsArrayBuffer(file);
        } catch (e) { finish({ error: e.message || 'The file could not be read.' }); }
      });
    }
    function showFailure(heading, errors) {
      clear(preview);
      preview.append(el('div', { class: 'wio-actions wio-preview-actions' }, button('Dismiss', 'wio-dismiss', cancel)));
      preview.append(renderModel({ title: heading, state: { kind: 'error', text: 'Nothing was changed.' }, errors, warnings: [], lists: [], tables: [], provenance: [] }));
      preview.hidden = false;
      say(heading);
      presentPreview();
    }
    function cancel() { invalidatePreview(); clear(preview); preview.hidden = true; say('Nothing was changed.'); options.onDismiss?.(); }
    function presentPreview() {
      // The host may present this real node in a visible dialog instead of a scrolled sidebar.
      options.onPreview?.(preview);
      const action = preview.querySelector('button');
      action?.focus({ preventScroll: true });
    }
    function renderModel(m) {
      const box = el('section', { class: 'wio-preview-body' }, el('h4', { class: 'wio-preview-title' }, m.title));
      if (m.state.text) box.append(el('p', { class: `wio-state wio-state-${m.state.kind}` }, m.state.text));
      if (m.errors.length) box.append(el('ul', { class: 'wio-errors', role: 'alert' }, ...m.errors.map((t) => el('li', {}, t))));
      if (m.warnings.length) box.append(el('ul', { class: 'wio-warnings' }, ...m.warnings.map((t) => el('li', {}, t))));
      for (const l of m.lists) box.append(el('div', { class: `wio-list wio-list-${l.kind}` }, el('p', { class: 'wio-list-heading' }, l.heading), el('ul', {}, ...l.items.map((t) => el('li', {}, t)))));
      for (const t of m.tables) {
        box.append(el('table', { class: 'wio-table' }, el('caption', {}, t.caption),
          el('thead', {}, el('tr', {}, ...t.columns.map((c) => el('th', { scope: 'col' }, c)))),
          el('tbody', {}, ...t.rows.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, c)))))));
      }
      if (m.provenance.length) { const dl = el('dl', { class: 'wio-provenance' }); for (const [k, v] of m.provenance) dl.append(el('dt', {}, k), el('dd', {}, v)); box.append(dl); }
      return box;
    }
    function show(result, buttons) {
      clear(preview);
      // Keep confirmation beside the file controls, not below a long inventory.
      preview.append(el('div', { class: 'wio-actions wio-preview-actions' }, ...buttons));
      preview.append(renderModel(previewModel(result)));
      preview.hidden = false;
      presentPreview();
    }
    function applyOnce(stateValue, info, doneText) {
      let used = false;
      const generation = previewGeneration;
      return () => {
        if (used || !currentPreview(generation)) return;
        const blocked = options.canApply?.();
        if (blocked) {
          let note = preview.querySelector('.wio-apply-error');
          if (!note) { note = el('p', { class: 'wio-apply-error', role: 'alert' }); preview.querySelector('.wio-preview-actions').append(note); }
          note.textContent = blocked;
          say(blocked);
          return;
        }
        used = true;
        invalidatePreview();
        try { applyState(clone(stateValue), info); }
        catch (e) { showFailure('The app could not apply the data', [e.message || String(e)]); return; }
        clear(preview); preview.hidden = true; say(doneText);
        options.onApplied?.(info, doneText);
      };
    }
    function showStudy(result) {
      if (!result.ok) { show(result, [button('Dismiss', 'wio-dismiss', cancel)]); say('The study was not imported.'); return result; }
      const info = { kind: 'study', workspace, provenance: clone(result.provenance), warnings: result.warnings.slice() };
      show(result, [button('Apply', 'wio-apply', applyOnce(result.state, info, `Study applied${result.provenance.filename ? ` from ${result.provenance.filename}` : ''}. Run the study to see results.`)), button('Cancel', 'wio-cancel', cancel), el('p', { class: 'wio-apply-help' }, 'File read successfully. Click Apply to replace the current wing with this design, or Cancel to keep it.')]);
      say('Check the preview, then Apply or Cancel.');
      return result;
    }
    async function openFile(file) {
      const generation = invalidatePreview();
      if (destroyed) return null;
      clear(preview);
      preview.append(el('p', { role: 'status' }, `Reading ${cleanName(file && file.name)}… Your current wing has not changed.`));
      preview.hidden = false;
      say('Reading the selected study file…');
      presentPreview();
      const got = await readFile(file);
      if (!currentPreview(generation) || got.aborted) return null;
      const name = cleanName(file && file.name);
      if (got.error) { showFailure('The study was not imported', [got.error]); return null; }
      return showStudy(importStudy(got.bytes, { workspace, engine, metalEngine: workspace === 'd520' ? engine : undefined, filename: name }));
    }
    function openText(textValue, filename) { invalidatePreview(); if (destroyed) return null; return showStudy(importStudy(textValue, { workspace, engine, metalEngine: workspace === 'd520' ? engine : undefined, filename })); }
    function showParameters(result) {
      const buttons = [];
      if (result.ok && result.geometry) {
        let conflicts = [];
        try { conflicts = checkOuterGeometry(getState(), result.geometry, engine); } catch (e) { conflicts = [e.message]; }
        if (conflicts.length) result.warnings.push(...conflicts.map((c) => `Applied to your current study, this outer geometry gives a problem to fix in the app before analysis: ${c}`));
        const info = {
          kind: 'outer-geometry', workspace, analysisBlocked: true, required: REQUIRED_ITEMS.map((r) => ({ ...r })), suppliedByFile: result.supplied.slice(), conflicts,
          provenance: clone(result.provenance), fields: clone(result.fields.filter((f) => ['geometry.naca', 'geometry.semiSpan', 'geometry.rootChord', 'geometry.tipChord'].includes(f.target))),
        };
        buttons.push(button('Apply outer geometry', 'wio-apply-geometry', applyOnce({ geometry: clone(result.geometry) }, info, 'Outer geometry applied. The analysis stays blocked until skin, ribs, rods, modules/seams, material, root support and loads are confirmed in the app.')));
        if (result.status === 'complete') {
          buttons.push(button('Apply complete study', 'wio-apply-complete', applyOnce(result.state, { kind: 'parameters-complete', workspace, analysisBlocked: false, provenance: clone(result.provenance), fields: clone(result.fields) }, 'Design parameters applied. Run the study to see results.')));
        }
      }
      buttons.push(button(result.ok ? 'Cancel' : 'Dismiss', result.ok ? 'wio-cancel' : 'wio-dismiss', cancel));
      show(result, buttons);
      say(result.ok ? 'Check the preview: values in the file, converted values and origins.' : 'The design parameters were rejected.');
      return result;
    }
    function previewParameters(textValue, filename) { invalidatePreview(); if (destroyed) return null; return showParameters(importParameters(textValue, { engine, filename: filename || 'pasted text' })); }
    async function importParametersFile(file) {
      const generation = invalidatePreview();
      if (destroyed) return null;
      const got = await readFile(file);
      if (!currentPreview(generation) || got.aborted) return null;
      if (got.error) { showFailure('The design parameters were not imported', [got.error]); return null; }
      return showParameters(importParameters(got.bytes, { engine, filename: cleanName(file && file.name) }));
    }
    return {
      root, save, openFile: (f) => track(openFile(f)), openText, previewParameters, cancel,
      idle: () => pending, destroy() { destroyed = true; invalidatePreview(); root.remove(); },
    };
  }

  return Object.freeze({
    VERSION: IO_VERSION, STUDY_FORMAT, PARAMS_FORMAT, FILE_VERSION, SHARE_KEY, LIMITS, PARAMETER_TEMPLATE, REQUIRED_ITEMS,
    escapeHtml, normalizeProjectName, safeFilenameStem, sha256, utf8Encode, utf8Decode, base64urlEncode, base64urlDecode, parseJson, countSegments,
    printedStudyDocument, exportPrintedStudy, importPrintedStudy, printedEngineInput, fabricationIssues, setAeroGeometryKey,
    d520StudyDocument, exportD520Study, importD520Study, importStudy,
    importParameters, parameterTemplateText, checkOuterGeometry,
    encodeShare, decodeShare, shareFragment,
    previewModel, previewHtml, mount,
  });
}));

/* Local STL inspection and restricted, explicit-axis external-wing recovery.
 * STL carries triangles only: no units, material, section construction, clamp
 * or load. Neither parser nor recovery claims a finite-element stress solve.
 */
const WingSTLImport=(()=>{
 'use strict';
 const AXIS={x:0,y:1,z:2},MAX_BYTES=64*1024*1024,MAX_TRIANGLES=500000;
 const fail=s=>{throw Error(s);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),extent=(points,k)=>points.reduce((b,p)=>[Math.min(b[0],p[k]),Math.max(b[1],p[k])],[Infinity,-Infinity]);
 function inputBytes(input){if(typeof input==='string')return new TextEncoder().encode(input);if(input instanceof ArrayBuffer)return new Uint8Array(input);if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);fail('Supply STL text or an ArrayBuffer/typed byte array.');}
 function parse(input,options={}){
  if(options.units!=='mm')fail('STL has no units. Explicitly confirm millimetres (units: mm) before import; no scale is guessed.');
  const bytes=inputBytes(input),maxBytes=options.maxBytes??MAX_BYTES,maxTriangles=options.maxTriangles??MAX_TRIANGLES,maxCoordinate=options.maxCoordinateAbs??1e6;
  if(!Number.isInteger(maxBytes)||maxBytes<84||maxBytes>256*1024*1024||!Number.isInteger(maxTriangles)||maxTriangles<1||maxTriangles>1000000||!Number.isFinite(maxCoordinate)||maxCoordinate<=0||maxCoordinate>1e9)fail('Invalid STL admission limits.');
  if(bytes.byteLength>maxBytes)fail('STL exceeds the admitted byte limit.');if(bytes.byteLength<15)fail('STL is empty or truncated.');
  const points=[],triangles=[],ids=new Map(),faceKeys=new Set();let format,normalCount=0;
  function finite(x){if(!Number.isFinite(x)||Math.abs(x)>maxCoordinate)fail('STL coordinate/normal is non-finite or outside the admitted coordinate range.');return Object.is(x,-0)?0:x;}
  function triangle(raw){
   if(triangles.length/3>=maxTriangles)fail('STL exceeds the admitted triangle count.');
   const p=raw.map(v=>v.map(finite)),a=sub(p[1],p[0]),b=sub(p[2],p[0]),area2=Math.hypot(...cross(a,b)),edge=Math.max(Math.hypot(...a),Math.hypot(...b),Math.hypot(...sub(p[2],p[1])));
   if(!(edge>0)||!(area2>Math.max(1e-24,edge*edge*1e-14)))fail('STL contains a degenerate or numerically collapsed triangle.');
   const t=p.map(q=>{const key=q.join(',');if(!ids.has(key)){ids.set(key,points.length);points.push(q);}return ids.get(key);}),key=[...t].sort((x,y)=>x-y).join(',');
   if(faceKeys.has(key))fail('STL contains duplicate triangles.');faceKeys.add(key);triangles.push(...t);
  }
  let binaryCount=-1;if(bytes.byteLength>=84){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);binaryCount=v.getUint32(80,true);if(84+50*binaryCount===bytes.byteLength){format='binary';if(binaryCount<1||binaryCount>maxTriangles)fail('Invalid or excessive binary STL triangle count.');for(let i=0;i<binaryCount;i++){const off=84+50*i;for(let k=0;k<3;k++)finite(v.getFloat32(off+4*k,true));normalCount++;triangle([0,1,2].map(k=>[0,1,2].map(j=>v.getFloat32(off+12+12*k+4*j,true))));}}}
  if(!format){
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('Binary STL byte count is invalid or text is not valid ASCII.');}
   if(/[^\x09\x0a\x0d\x20-\x7e]/.test(text))fail('STL text must be ASCII; malformed binary data is not repaired.');
   const header=text.match(/^\s*solid[^\r\n]*(?:\r?\n)/i),footer=text.match(/\bendsolid[^\r\n]*\s*$/i);if(!header||!footer||footer.index<header[0].length)fail('STL is neither a complete binary STL nor an ASCII solid.');
   const tokens=text.slice(header[0].length,footer.index).trim().split(/\s+/);let k=0;const token=s=>{if(tokens[k++]?.toLowerCase()!==s)fail('Malformed ASCII STL facet grammar.');},number=()=>{const value=tokens[k++];if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value||''))fail('Malformed ASCII STL numeric coordinate.');return finite(Number(value));};
   while(k<tokens.length){token('facet');token('normal');for(let j=0;j<3;j++)number();normalCount++;token('outer');token('loop');const raw=[];for(let j=0;j<3;j++){token('vertex');raw.push([number(),number(),number()]);}token('endloop');token('endfacet');triangle(raw);}
   format='ascii';
  }
  if(!triangles.length)fail('STL contains no triangles.');
  const edges=new Map(),parent=Array.from({length:triangles.length/3},(_,i)=>i),rank=new Uint8Array(triangles.length/3),vertexFaces=Array.from({length:points.length},()=>[]),find=i=>{let root=i;while(parent[root]!==root)root=parent[root];while(parent[i]!==i){const next=parent[i];parent[i]=root;i=next;}return root;},join=(a,b)=>{a=find(a);b=find(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;};
  for(let i=0;i<triangles.length;i+=3){const f=i/3,t=triangles.slice(i,i+3);t.forEach(v=>vertexFaces[v].push(f));for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);if(!edges.has(key))edges.set(key,[]);edges.get(key).push({a,b,f});}}
  let boundaryEdges=0,nonManifoldEdges=0,inconsistentEdges=0;
  for(const e of edges.values()){if(e.length===1)boundaryEdges++;if(e.length>2)nonManifoldEdges++;if(e.length===2&&e[0].a===e[1].a)inconsistentEdges++;for(let i=1;i<e.length;i++)join(e[0].f,e[i].f);}
  let nonManifoldVertices=0;
  for(let v=0;v<points.length;v++){
   const link=new Map();for(const f of vertexFaces[v]){const other=triangles.slice(f*3,f*3+3).filter(i=>i!==v);for(let k=0;k<2;k++){if(!link.has(other[k]))link.set(other[k],[]);link.get(other[k]).push(other[1-k]);}}
   if([...link.values()].some(a=>a.length!==2)){nonManifoldVertices++;continue;}const visited=new Set(),stack=[link.keys().next().value];while(stack.length){const n=stack.pop();if(visited.has(n))continue;visited.add(n);stack.push(...link.get(n));}if(visited.size!==link.size)nonManifoldVertices++;
  }
  const components=new Map();for(let i=0;i<triangles.length/3;i++){const p=find(i);if(!components.has(p))components.set(p,[]);components.get(p).push(i);}
  const shells=[...components.values()].map(faces=>{const origin=points[triangles[faces[0]*3]];let volume=0;for(const f of faces){const p=triangles.slice(f*3,f*3+3).map(i=>sub(points[i],origin));volume+=dot(p[0],cross(p[1],p[2]))/6;}return {triangles:faces.length,signedVolumeMm3:volume};});
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  const watertight=boundaryEdges===0&&nonManifoldEdges===0&&inconsistentEdges===0&&nonManifoldVertices===0,topology={watertight,oriented:inconsistentEdges===0,boundaryEdges,nonManifoldEdges,inconsistentEdges,nonManifoldVertices,shellCount:shells.length,shells,selfIntersectionsChecked:false,nestedShellContainmentChecked:false};
  if(options.requireWatertight&&!watertight)fail(`STL is not a closed oriented 2-manifold: ${boundaryEdges} boundary, ${nonManifoldEdges} non-manifold and ${inconsistentEdges} inconsistent edges; ${nonManifoldVertices} non-manifold vertices.`);
  return {mesh:{vertices:Float64Array.from(points.flat()),triangles:Uint32Array.from(triangles)},report:{format,units:'mm',unitsConfirmed:true,bytes:bytes.byteLength,vertices:points.length,triangles:triangles.length/3,bounds:{min,max,size:max.map((x,k)=>x-min[k])},topology,normalCount,geometryRepaired:false,coordinateWelding:'Only numerically identical input vertices are shared; source coordinates are not moved.',analysisAvailable:false,limitations:['STL has no material, supports, loads, units metadata or parametric internal construction.','Closed edge topology does not certify absence of self-intersections or correct nesting of cavity shells.','Imported triangles are reference geometry; no mesh-based stress solution is performed.']},analysisAvailable:false};
 }
 function axes(options){const si=AXIS[options.spanAxis],ci=AXIS[options.chordAxis],ti=AXIS[options.thicknessAxis];if(![si,ci,ti].every(Number.isInteger)||new Set([si,ci,ti]).size!==3)fail('Explicitly declare three distinct spanAxis, chordAxis and thicknessAxis values (x, y or z).');return {si,ci,ti};}
 function slice(parsed,options={}){
  const {si,ci,ti}=axes(options),plane=options.positionMm,tol=options.toleranceMm??1e-6;if(!Number.isFinite(plane)||!Number.isFinite(tol)||tol<=0||tol>1)fail('A finite slice position and positive tolerance up to 1 mm are required.');
  const {vertices,triangles}=parsed.mesh,points=[],cells=new Map(),segments=new Map();let coplanarTriangles=0,maxEndpointMergeMm=0;
  function point(p){const a=Math.floor(p[0]/tol),b=Math.floor(p[1]/tol);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){for(const id of cells.get((a+i)+','+(b+j))||[]){const d=Math.hypot(p[0]-points[id][0],p[1]-points[id][1]);if(d<=tol){maxEndpointMergeMm=Math.max(maxEndpointMergeMm,d);return id;}}}const id=points.length;points.push(p);const key=a+','+b;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);return id;}
  for(let f=0;f<triangles.length;f+=3){const p=[0,1,2].map(k=>Array.from(vertices.slice(3*triangles[f+k],3*triangles[f+k]+3))),d=p.map(q=>q[si]-plane);if(d.every(x=>Math.abs(x)<=1e-12)){coplanarTriangles++;continue;}const hits=[];
   for(let k=0;k<3;k++){const q=p[k],r=p[(k+1)%3],a=d[k],b=d[(k+1)%3];if(Math.abs(a)<=1e-12)hits.push([q[ci],q[ti]]);if(a*b<0){const t=a/(a-b);hits.push([q[ci]+t*(r[ci]-q[ci]),q[ti]+t*(r[ti]-q[ti])]);}}
   const hitIDs=[...new Set(hits.map(point))];if(hitIDs.length===2&&hitIDs[0]!==hitIDs[1])segments.set([...hitIDs].sort((a,b)=>a-b).join(','),hitIDs);else if(hitIDs.length>2)fail('Ambiguous triangle-plane intersection; reduce the declared slice tolerance.');
  }
  const neighbors=new Map();for(const [a,b]of segments.values()){if(!neighbors.has(a))neighbors.set(a,[]);if(!neighbors.has(b))neighbors.set(b,[]);neighbors.get(a).push(b);neighbors.get(b).push(a);}
  const invalid=[...neighbors.values()].filter(a=>a.length!==2).length;if(invalid)return {positionMm:plane,closed:false,loops:[],openOrBranchVertices:invalid,coplanarTriangles,toleranceMm:tol,maxEndpointMergeMm};
  const visited=new Set(),loops=[];for(const start of neighbors.keys()){if(visited.has(start))continue;let previous=-1,current=start;const loop=[];do{if(visited.has(current))fail('Section loop intersects itself topologically.');visited.add(current);loop.push(points[current]);const n=neighbors.get(current),next=n[0]===previous?n[1]:n[0];previous=current;current=next;}while(current!==start);if(loop.length>=3){const area=loop.reduce((s,p,i)=>s+p[0]*loop[(i+1)%loop.length][1]-p[1]*loop[(i+1)%loop.length][0],0)/2;loops.push({points:loop,signedAreaMm2:area,areaMm2:Math.abs(area)});}}
  loops.sort((a,b)=>b.areaMm2-a.areaMm2);return {positionMm:plane,closed:loops.length>0,loops,openOrBranchVertices:0,coplanarTriangles,toleranceMm:tol,maxEndpointMergeMm};
 }
 function recoverPlanform(parsed,options={}){
  const {si,ci,ti}=axes(options),root=options.rootPlaneMm,side=options.side,tol=options.geometryToleranceMm??.1,profileTol=options.profileToleranceMm??tol;
  if(!Number.isFinite(root)||!['positive','negative'].includes(side))fail('Declare rootPlaneMm and side (positive or negative); no span direction or root is guessed.');
  if(!Number.isFinite(tol)||tol<=0||tol>5||!Number.isFinite(profileTol)||profileTol<=0||profileTol>5)fail('Recovery tolerances must be positive and at most 5 mm.');
  const result={status:'reference-only',geometryRepresentable:false,analysisAvailable:false,internalConstructionRecovered:false,sections:[],geometryDraft:null,missingAnalysisInputs:['skin/cavity construction','rib/cap layout','spar/rod layout and attachment','material properties','support/clamp definition','loads and load positions'],reasons:[],tolerances:{geometryMm:tol,profileMm:profileTol},limitations:['External-section extraction is a prospective parameter reconstruction, not stress analysis of the imported triangles.','Interior loops are reported as observed surfaces; skin/ribs/spars are not invented from them.','Agreement at sampled sections does not prove full-surface identity; compare the prospective geometry against the reference mesh before configuring a separate analysis.']};
  if(!parsed.report.topology.watertight){result.reasons.push('Restricted geometry recovery requires closed, consistently oriented manifold topology.');return result;}
  const sign=side==='positive'?1:-1,v=parsed.mesh.vertices;let span=0;for(let i=si;i<v.length;i+=3)span=Math.max(span,sign*(v[i]-root));if(!(span>tol)){result.reasons.push('Declared root and side contain no positive semi-span.');return result;}
  const etas=[0,.125,.25,.375,.5,.625,.75,.875,.97],slices=etas.map(eta=>slice(parsed,{...options,positionMm:root+sign*span*eta,toleranceMm:Math.min(1e-5,tol/100)}));
  if(slices.some(s=>!s.closed)){result.reasons.push('At least one declared span section does not form closed loops.');return result;}
  function profile(s,eta){const p=s.loops[0].points,[minX,maxX]=extent(p,0),c=maxX-minX;if(!(c>tol))fail('A sampled section has no resolvable chord.');const sample=[];
   for(let i=0;i<=80;i++){const u=(1-Math.cos(Math.PI*i/80))/2,x=minX+u*c,z=[];for(let k=0;k<p.length;k++){const a=p[k],b=p[(k+1)%p.length];if(Math.abs(a[0]-x)<1e-9)z.push(a[1]);if((a[0]<x&&b[0]>x)||(b[0]<x&&a[0]>x)){const t=(x-a[0])/(b[0]-a[0]);z.push(a[1]+t*(b[1]-a[1]));}}const unique=[...z].sort((a,b)=>a-b).filter((x,k,a)=>k===0||Math.abs(x-a[k-1])>Math.max(1e-7,Math.min(.001,tol/100)));if(!unique.length||(i>0&&i<80&&unique.length>2))fail('The outer section is folded or not a single-valued upper/lower airfoil.');sample.push({u,lower:Math.min(...z),upper:Math.max(...z)});}
   if(sample[0].upper-sample[0].lower>tol)fail('Blunt leading-edge section cannot be represented as a closed-leading-edge Wing Lab airfoil.');const zLE=(sample[0].upper+sample[0].lower)/2,upper=sample.map(q=>[q.u,(q.upper-zLE)/c]),lower=sample.map(q=>[q.u,(q.lower-zLE)/c]);return {eta,positionMm:s.positionMm,chordMm:c,xLE:minX,zLE,observedLoops:s.loops.length,upper,lower};
  }
  let sections;try{sections=slices.map((s,i)=>profile(s,etas[i]));}catch(error){result.reasons.push(error.message);result.sections=slices;return result;}result.sections=sections;
  const c0=sections[0].chordMm,tipPoints=[];for(let i=0;i<v.length;i+=3)if(Math.abs(sign*(v[i+si]-root)-span)<=Math.max(1e-7,tol/1000))tipPoints.push([v[i+ci],v[i+ti]]);
  const tipX=extent(tipPoints,0),tipZ=extent(tipPoints,1),tipChord=tipX[1]-tipX[0],tipThickness=tipZ[1]-tipZ[0],pointTip=tipChord<=tol&&tipThickness<=tol,ct=pointTip?0:tipChord;
  const error=f=>Math.max(...sections.map(s=>Math.abs(s.chordMm-f(s.eta)))),linearError=error(e=>c0+(ct-c0)*e),ellipseError=error(e=>Math.sqrt(c0*c0*(1-e*e)+ct*ct*e*e));
  const planform=linearError<=tol?(pointTip?'delta':'linear'):ellipseError<=tol?'elliptic':null;result.planformFit={linearResidualMm:linearError,ellipticResidualMm:ellipseError,tipChordObservedMm:tipChord,pointTipObserved:pointTip};
  if(!planform){result.reasons.push('Observed chord schedule does not fit a supported linear/delta/elliptic planform within the declared tolerance.');return result;}
  const fraction=planform==='delta'?1:planform==='elliptic'?.5:0,rootX=sections[0].xLE,rootZ=sections[0].zLE,den=sections.reduce((a,s)=>a+(s.eta*span)**2,0),sweepSlope=sections.reduce((a,s)=>a+s.eta*span*(s.xLE-rootX-fraction*(c0-s.chordMm)),0)/den,dihedralSlope=sections.reduce((a,s)=>a+s.eta*span*(s.zLE-rootZ),0)/den;
  const transformError=Math.max(...sections.map(s=>Math.max(Math.abs(s.xLE-rootX-fraction*(c0-s.chordMm)-sweepSlope*s.eta*span),Math.abs(s.zLE-rootZ-dihedralSlope*s.eta*span)))),base=sections[0],homotheticError=Math.max(...sections.flatMap(s=>s.upper.flatMap((p,i)=>[Math.abs(p[1]-base.upper[i][1])*s.chordMm,Math.abs(s.lower[i][1]-base.lower[i][1])*s.chordMm]))),rootTE=(base.upper.at(-1)[1]-base.lower.at(-1)[1])*c0,teValues=sections.map(s=>(s.upper.at(-1)[1]-s.lower.at(-1)[1])*s.chordMm),fixedTEError=Math.max(...sections.flatMap(s=>s.upper.flatMap((p,i)=>{const correction=(rootTE/s.chordMm-rootTE/c0)*p[0]**4/2;return [Math.abs(p[1]-base.upper[i][1]-correction)*s.chordMm,Math.abs(s.lower[i][1]-base.lower[i][1]+correction)*s.chordMm];}))),fixedTE=Math.max(...teValues.map(t=>Math.abs(t-rootTE)))<=tol&&fixedTEError<=profileTol,profileError=fixedTE?fixedTEError:homotheticError;
  result.recoveryResiduals={transformMm:transformError,homotheticProfileMm:homotheticError,fixedTrailingEdgeProfileMm:fixedTEError};result.externalMeasurements={rootTrailingEdgeThicknessMm:rootTE,sectionTrailingEdgeThicknessMm:teValues,profileFamily:fixedTE?'common profile with constant physical trailing-edge thickness':'common homothetic profile',sampledSpanFractions:etas};
  if(transformError>tol||profileError>profileTol){result.reasons.push(transformError>tol?'The section reference transformation is outside the supported sweep/dihedral representation.':'The observed airfoil sections are not a verified common normalized profile; retain section loops as reference rather than silently inventing a profile family.');return result;}
  const sweepDeg=Math.atan(sweepSlope)*180/Math.PI,dihedralDeg=Math.atan(dihedralSlope)*180/Math.PI;if(Math.abs(sweepDeg)>60||Math.abs(dihedralDeg)>45){result.reasons.push('Recovered sweep/dihedral exceeds Wing Lab geometry limits.');return result;}
  const airfoil={kind:'coordinates',version:1,name:'External profile recovered from confirmed-mm STL',upper:base.upper,lower:base.lower,source:{format:'STL-section',filename:String(options.filename||'').slice(0,180),normalization:'unit-chord'}};
  result.geometryRepresentable=true;result.status='prospective-parameter-geometry';result.geometryDraft={planform,semiSpan:span,rootChord:c0,tipChord:ct,sweepDeg,dihedralDeg,sweepReferenceFraction:fraction,airfoil,...(fixedTE&&rootTE>0?{te:rootTE}:{})};result.sourceToWingLab={sourceAxes:{span:options.spanAxis,chord:options.chordAxis,thickness:options.thicknessAxis},sourceRootPlaneMm:root,sourceRootLeadingEdge:[rootX,rootZ],spanSign:sign};
  result.reasons.push('A sampled external geometry draft is available. Confirm the reconstruction, then explicitly supply internal construction, materials, supports and loads for a separate supported Wing Lab analysis.');return result;
 }
 return {parse,slice,recoverPlanform};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingSTLImport;


/* STL geometry reference. No inferred material, construction or analysis. */
(function(root){'use strict';
root.WingSTLReferenceUI={mount({host,THREE,scene,camera,controls,onShow,onHide}){
 const button=document.createElement('button');button.className='btn';button.textContent='Open STL';button.id='wingOpenSTL';host.append(button);
 const input=document.createElement('input');input.type='file';input.accept='.stl';input.hidden=true;host.append(input);
 const panel=document.createElement('div');panel.className='wing-print-dialog';panel.hidden=true;host.append(panel);
 let mesh=null;
 function clear(){if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();mesh=null;}panel.hidden=true;onHide?.();}
 button.onclick=()=>{input.value='';input.click();};
 input.onchange=async()=>{const file=input.files?.[0];if(!file)return;panel.hidden=false;panel.replaceChildren();const h=document.createElement('h3');h.textContent='STL geometry reference';panel.append(h);const note=document.createElement('p');note.textContent='STL stores a surface mesh, without units, material, loads or supports. This view does not calculate stress. Your editable Wing Lab study is retained.';panel.append(note);const label=document.createElement('label'),units=document.createElement('input');units.type='checkbox';label.append(units,document.createTextNode(' I confirm this file uses millimetres'));panel.append(label);const load=document.createElement('button');load.className='btn primary';load.textContent='Read STL';const close=document.createElement('button');close.className='btn';close.textContent='Return to Wing Lab';close.onclick=clear;const status=document.createElement('p');panel.append(document.createElement('br'),load,close,status);
 load.onclick=async()=>{load.disabled=true;try{if(!units.checked)throw Error('Confirm the file units before importing.');const parsed=WingSTLImport.parse(await file.arrayBuffer(),{units:'mm',requireWatertight:false});if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(parsed.mesh.vertices,3));geometry.setIndex(new THREE.BufferAttribute(parsed.mesh.triangles,1));geometry.computeVertexNormals();const material=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});mesh=new THREE.Mesh(geometry,material);scene.add(mesh);const box=new THREE.Box3().setFromObject(mesh),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z)*.8;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(radius,radius,radius));camera.near=Math.max(.001,radius/1000);camera.far=Math.max(1000,radius*100);camera.updateProjectionMatrix();controls.update();onShow?.();const r=parsed.report;status.style.color='';status.textContent=file.name+' · '+r.triangles.toLocaleString()+' triangles · bounds '+size.toArray().map(v=>v.toFixed(2)).join(' × ')+' mm · '+(r.topology.watertight?'closed mesh':'open/non-manifold mesh')+'. Reference only; intersections and structural validity are not certified.';load.textContent='STL loaded';}catch(e){status.textContent=e.message;status.style.color='#b42318';load.disabled=false;}};
 };
 return{clear,get mesh(){return mesh;}};
}};
})(typeof window!=='undefined'?window:globalThis);

/* Download physical STL from a snapshotted, solved study; CAD runs in a Worker. */
const WingPrintUI=(()=>{
 'use strict';
 const encoder={encode:text=>new TextEncoder().encode(text)};
 const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 function zip(files){
  const chunks=[],central=[];let offset=0,centralSize=0;
  for(const file of files){const name=encoder.encode(file.name),bytes=new Uint8Array(file.bytes),sum=crc(bytes),local=new Uint8Array(30+name.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,0x21,true);l.setUint32(14,sum,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);local.set(name,30);chunks.push(local,bytes);
   const record=new Uint8Array(46+name.length),v=new DataView(record.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);v.setUint32(16,sum,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);record.set(name,46);central.push(record);centralSize+=record.length;offset+=local.length+bytes.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
 }
 function mount({host,getInput,workerURL,documentRef=globalThis.document,WorkerClass=globalThis.Worker,onSymmetryChange=()=>{},onRequestModules=null}){
  const doc=documentRef,node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=node('button','Download STL','btn primary');button.type='button';button.id='wingDownloadSTL';const symmetry=node('label',null,'wing-print-symmetry'),fullWing=node('input');fullWing.type='checkbox';fullWing.id='wingFullSymmetric';symmetry.append(fullWing,doc.createTextNode(' Full wing · mirror'));const symmetryNote=node('span','Symmetric results: same loads and root clamp on both halves.');symmetryNote.id='wingSymmetryNote';symmetryNote.hidden=true;symmetry.title='Mirror the designed semi-wing across its root. Results reflect the original clamped semi-wing under symmetric loads and supports. Printed modules 1 joins both halves into one STL; 2/3 produces 4/6 pieces for assembly. The full one-piece wing must fit the 300 mm printer.';const dxf=node('button','DXF','btn'),step=node('button','STEP','btn');dxf.type=step.type='button';dxf.id='wingDownloadDXF';step.id='wingDownloadSTEP';dxf.title='2D millimetre planform and rib profiles';step.title='3D faceted solid CAD exchange; not smooth or parametric features';host.append(symmetry,button,dxf,step,symmetryNote);fullWing.onchange=()=>{symmetryNote.hidden=!fullWing.checked;onSymmetryChange(fullWing.checked);};
  const panel=node('section',null,'wing-print-dialog');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','wingPrintTitle');const title=node('h3','Printable STL');title.id='wingPrintTitle';
  const close=node('button','×','btn wing-print-close');close.type='button';close.setAttribute('aria-label','Close CAD exporter');const status=node('p');status.id='wingPrintStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');const details=node('div');details.id='wingPrintDetails';panel.append(title,close,status,details);doc.body.append(panel);
  const style=node('style');style.textContent='.wing-print-dialog{position:fixed;z-index:300;right:12px;top:90px;width:min(580px,calc(100vw - 24px));max-height:calc(100dvh - 110px);overflow:auto;padding:16px;background:var(--panel,#fff);color:var(--fg,#17202c);border:2px solid var(--accent,#0875d1);border-radius:12px;box-shadow:0 12px 40px #10203040}.wing-print-dialog[hidden]{display:none}.wing-print-dialog h3{margin:0 44px 12px 0}.wing-print-close{position:absolute;right:8px;top:8px}.wing-print-dialog table{width:100%;font-size:13px}.wing-print-dialog th,.wing-print-dialog td{text-align:left;padding:5px;border-bottom:1px solid var(--line,#ccd)}.wing-print-dialog .btn{margin:5px 5px 0 0;min-height:40px}.wing-print-symmetry{display:inline-flex;align-items:center;gap:5px;padding:6px;font-weight:600}.wing-print-symmetry input{width:18px;height:18px}#wingSymmetryNote{font-size:12px;color:var(--muted)}#wingPrintStatus[data-error=true]{color:var(--bad,#ba2635)}';doc.head.append(style);
  let worker=null,returnFocus=null,output=null,fitRecord=null;try{fitRecord=JSON.parse(doc.defaultView.localStorage.getItem('wing-aerostruct:print-fit-record'));}catch{}
  const release=()=>{worker?.terminate();worker=null;for(const b of [button,dxf,step])b.disabled=false;};
  const download=(blob,name)=>{const url=doc.defaultView.URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;doc.body.append(a);a.click();a.remove();doc.defaultView.setTimeout(()=>doc.defaultView.URL.revokeObjectURL(url),2000);};
  const fail=text=>{release();output=null;status.dataset.error='true';status.textContent=text;};
  const currentInput=()=>({...getInput(),fullWing:fullWing.checked});
  const key=input=>JSON.stringify([input.geometry,input.density,input.shellMaterial,input.fullWing]);
  function offerModuleSplits(input,format){
   const current=input.geometry.modules||1,counts=[2,3].filter(n=>n>current),box=node('div');box.id='wingPrintFitSuggestions';
   box.append(node('p',`The physical printer envelope is 300 × 300 × 300 mm. ${input.fullWing&&current===1?'A single full-wing module joins both halves into one piece. ':''}Split the wing into shorter printed modules while keeping its span, chords and loads. No automatic scaling is applied.`));
   box.append(node('p','Changing modules also changes seam locations and their interface ribs. Review the assembly assumptions and solve the updated study. Fit is confirmed only when the physical CAD builder checks the new pieces; a span estimate alone does not certify fit.'));
   if(!counts.length){box.append(node('p','The supported two- and three-module layouts are already exhausted. Review the actual chord, thickness and printer orientation; increasing a span split cannot fix every oversized dimension.'));details.append(box);return;}
   const buttons=[];
   for(const count of counts){
    const pieces=input.fullWing?2*count:count,label=`Use ${count} modules per half · ${pieces} ${input.fullWing?'full-wing':'semi-wing'} pieces`,apply=node('button',label,'btn');apply.type='button';apply.dataset.modules=String(count);apply.id='wingPrintUseModules'+count;buttons.push(apply);
    if(typeof onRequestModules!=='function'){apply.disabled=true;apply.title='Change Printed modules in the study, solve, then download again.';}
    apply.onclick=async()=>{
     for(const b of [...buttons,button,dxf,step])b.disabled=true;status.dataset.error='false';status.textContent=`Applying ${count} modules per half; validating the revised study…`;
     try{
      const result=await onRequestModules(count),applied=result===true||result?.applied===true;
      if(!applied)throw Error(result?.message||'The module change was not applied. Review the rib/seam geometry in the study before trying again.');
      const solved=!!result?.solved;status.textContent=`Applied ${count} modules per half · ${pieces} ${input.fullWing?'full-wing':'semi-wing'} pieces. ${solved?'The updated study has been solved.':'Run Solve for the updated study.'} Close this panel and choose Download ${format.toUpperCase()} again to build and check the actual pieces.`;
      if(result?.message)details.append(node('p',result.message));
      box.querySelectorAll('button').forEach(b=>{b.disabled=true;});
     }catch(error){status.dataset.error='true';status.textContent=error.message||String(error);for(const b of buttons)b.disabled=false;}
     finally{for(const b of [button,dxf,step])b.disabled=false;}
    };
    box.append(apply);
   }
   if(typeof onRequestModules!=='function')box.append(node('p','Set Printed modules to two or three in the study controls, solve, then download again.'));
   details.append(box);
  }
  close.onclick=()=>{if(worker){release();status.textContent='Build cancelled. No file exported.';}panel.hidden=true;returnFocus?.focus({preventScroll:true});};
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.click();}if(e.key==='Tab'){const focusable=[...panel.querySelectorAll('button,a[href]')].filter(n=>!n.disabled),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}}});
  function start(format='stl',trigger=button){
   returnFocus=trigger;title.textContent=format==='dxf'?'DXF · 2D profiles':format==='step'?'STEP · faceted 3D solids':'Printable STL';panel.hidden=false;close.focus();details.replaceChildren();status.dataset.error='false';output=null;let input;
   try{input={...currentInput(),exportFormat:format};}catch(e){fail(e.message);return;}
   if(format!=='dxf'&&input.geometry.rodFractions?.length){
    const g=input.geometry,signature=JSON.stringify([g.rodDiameter,g.clearance,g.sleeveWall,input.shellMaterial?.name]);
    if(!fitRecord||fitRecord.signature!==signature||fitRecord.tested!==true){
     status.textContent=`Rod-fit record required · rod diameter ${g.rodDiameter} mm; radial clearance ${g.clearance} mm; sleeve wall ${g.sleeveWall} mm. Use your actual completed coupon test.`;
     const label=node('label','Coupon ID / team revision '),reference=node('input');reference.id='wingPrintFitReference';reference.type='text';reference.maxLength=120;label.append(reference);
     const confirm=node('label'),checkbox=node('input');checkbox.type='checkbox';checkbox.id='wingPrintFitConfirmed';confirm.append(checkbox,doc.createTextNode(' I physically tested this rod/coupon and confirmed the fit using these settings and the same print process.'));
     const proceed=node('button','Confirm fit record & build '+format.toUpperCase(),'btn primary');proceed.type='button';proceed.onclick=()=>{if(!reference.value.trim()||!checkbox.checked){status.textContent='Enter the coupon reference and confirm the actual physical fit test. A numerical result does not replace it.';return;}fitRecord={signature,reference:reference.value.trim(),tested:true,rodDiameter:g.rodDiameter,clearance:g.clearance,sleeveWall:g.sleeveWall};try{doc.defaultView.localStorage.setItem('wing-aerostruct:print-fit-record',JSON.stringify(fitRecord));}catch{}start(format,trigger);};details.append(label,node('p'),confirm,node('p'),proceed);reference.focus();return;
    }
    input.fitRecord=fitRecord;
   }

   if(doc.defaultView.location.protocol==='file:'){fail('For CAD export, open Wing Lab from the course website rather than a downloaded HTML file.');return;}
   if(!WorkerClass){fail('This browser does not support background CAD construction. Open Wing Lab in an updated browser.');return;}
   const stamp=key(input),name=(input.projectName||'Wing').normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,70)||'Wing';for(const b of [button,dxf,step])b.disabled=true;status.textContent=format==='dxf'?'Preparing DXF reference profiles…':'Preparing the CAD kernel…';
   try{worker=new WorkerClass(workerURL);}catch(e){fail('Cannot start the STL builder: '+e.message);return;}
   worker.onerror=e=>fail('STL builder could not run. Reload the page and try again. '+(e.message||''));
   worker.onmessage=event=>{
    const data=event.data;if(data.kind==='progress'){status.textContent=data.text;return;}if(data.kind==='error'){fail(data.text);if(format!=='dxf'&&/does not fit/i.test(data.text)&&/300/.test(data.text))offerModuleSplits(input,format);return;}if(data.kind!=='complete')return;
    try{if(key(currentInput())!==stamp)throw Error('Inputs changed during construction. Solve the updated study and create STL again.');}catch(e){fail(e.message);return;}release();
    const report=data.report;
    if(format==='dxf'){
      status.textContent=`Ready · ${data.files.length} DXF file(s) · millimetres · 2D planform and rib reference profiles.`;
      details.append(node('p','DXF contains 2D outlines, not a 3D solid. Rib profiles are centre-plane references; review finite rib thickness, taper and tool compensation before cutting.'));
    }else{
    status.textContent=`Ready · ${report.fullWing?'Full symmetric wing':'Semi-wing'} · ${report.printedMassG.toFixed(1)} g printed plastic · ${report.modules.length} module(s) · ${(report.elapsedMs/1000).toFixed(1)} s. ${format==='step'?'Faceted STEP; source physical mesh and printer checks passed.':'Watertight STL and printer-envelope checks passed.'}`;
    const table=node('table'),head=node('tr');for(const label of ['Module','Dimensions (mm)','Triangles'])head.append(node('th',label));table.append(head);report.modules.forEach(m=>{const row=node('tr');for(const text of [String(m.module),m.sizeMm.map(x=>x.toFixed(1)).join(' × '),String(m.triangles)])row.append(node('td',text));table.append(row);});details.append(table,node('p','Import into OrcaSlicer in millimetres. Inspect orientation, supports, brim and every layer. These checks do not certify structural strength.'+(report.closedTip?' The solid pointed tip tapers below nominal wall thickness: inspect the terminal slicer layers.':'')));
    if(format==='step')details.append(node('p','STEP is a faceted solid B-rep in original aircraft coordinates. It preserves the physical triangle surfaces; it does not reconstruct smooth surfaces or editable feature history. Files can be large.'));
    }
    const record=encoder.encode(JSON.stringify(report,null,2));
    output=data.files.length===1?{blob:new Blob([data.files[0].bytes],{type:format==='stl'?'model/stl':'application/octet-stream'}),name:name+(input.fullWing?'_full_wing':'')+'.'+(format==='step'?'step':format==='dxf'?'dxf':'stl')}:{blob:zip([...data.files,{name:'print_record.json',bytes:record.buffer}]),name:name+(input.fullWing?'_full_wing':'')+'_'+format.toUpperCase()+'.zip'};
    const again=node('button','Download again','btn primary');again.type='button';again.onclick=()=>download(output.blob,output.name);const save=node('button',format==='stl'?'Save print record':'Save export record','btn');save.type='button';save.onclick=()=>download(new Blob([record],{type:'application/json'}),name+'_print_record.json');details.append(again,save);download(output.blob,output.name);
   };
   worker.postMessage(input);
  }
  button.onclick=()=>start('stl',button);dxf.onclick=()=>start('dxf',dxf);step.onclick=()=>start('step',step);
  return {button,dxf,step,panel,fullWing,cancel:()=>close.click()};
 }
 return{mount,zip};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingPrintUI;

