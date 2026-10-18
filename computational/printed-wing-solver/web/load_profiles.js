/*
 * Load profiles — MIE 446 Beam Lab and Wing Lab.
 * Exact or round-off-accurate integrals of the distributed loads the engines accept, and the
 * line-load CSV reader used by the Beam, printed-wing and D.520 workspaces. No dependencies.
 * Browser: global LoadProfiles. Node: require('./load_profiles.js').
 *
 * A curved load acts on a <= x <= b, length l = b - a, with s = (x - a)/l in [0, 1]:
 *   elliptic   shape 'start'  w = w0 sqrt(1 - s^2)          maximum at a, zero at b
 *              shape 'end'    w = w0 sqrt(1 - (1 - s)^2)    zero at a, maximum at b
 *              shape 'middle' w = w0 sqrt(1 - (2s - 1)^2)   zero at both ends, maximum at mid-span
 *   parabolic  shape 'start'  w = w0 (1 - s^2)              vertex (zero slope) at the maximum a
 *              shape 'end'    w = w0 (1 - (1 - s)^2)
 *              shape 'middle' w = w0 4 s (1 - s)
 *   total F = A w0 l with A = pi/4 (elliptic) or 2/3 (parabolic); centroid from a:
 *   elliptic 4l/(3 pi), l - 4l/(3 pi), l/2;  parabolic 3l/8, 5l/8, l/2.
 * Each shape is w0 g(u) with x = c + d u: start c = a, d = l, u in [0,1]; end c = b, d = -l,
 * u in [0,1]; middle c = (a+b)/2, d = l/2, u in [-1,1]; g(u) = sqrt(1 - u^2) or 1 - u^2.
 * Resultants: closed-form antiderivatives (exact). Weighted integrals (finite-element consistent
 * loads, torque lines): elliptic loads use Gauss-Legendre in the angle u = sin(phi), which removes
 * the square-root behaviour at a zero end (smooth integrand, converged to round-off); polynomial
 * and piecewise-linear loads use Gauss-Legendre in x, exact for the polynomial degrees involved.
 * A table load is piecewise linear between its rows and zero outside them.
 */
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

  return {
    SHAPES, CURVES, AREA, CENTROID, LIMITS, CSV_SPECS, GL3, GL8, GL16, gaussLegendre,
    valueAt, fractionAt, integrals, weighted, hermiteNodal, normalizeCurve, normalizeTable,
    segmentsOf, segmentCount, stats, parseCsv, csvTemplate, escapeHtml, lawText, curveMap,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LoadProfiles;
if (typeof window !== 'undefined') window.LoadProfiles = LoadProfiles;
