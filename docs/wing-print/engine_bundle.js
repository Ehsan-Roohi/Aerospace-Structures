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
if (typeof window !== 'undefined') window.LoadProfiles = LoadProfiles;

;
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
  const keys=['fraction','length','topWidth','topThickness','bottomWidth','bottomThickness','webThickness','material'];
  const G=m=>m.E/(2*(1+m.nu));
  function specs(raw,L){
    if(raw==null)return [];
    if(!Array.isArray(raw)||raw.length>2)throw Error('Use zero, one or two bonded spars.');
    return raw.map((s,i)=>{
      if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!keys.includes(k)))throw Error(`Spar ${i+1}: unsupported field.`);
      const v={...s};
      for(const k of keys.filter(k=>k!=='material'))if(!Number.isFinite(v[k])||v[k]<=0)throw Error(`Spar ${i+1}: ${k} must be finite and positive.`);
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
  function parts(g,y,ordinates){
    const c=g.sectionChord??(g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan),out=[];
    (g.spars||[]).forEach((s,index)=>{
      if(y>s.length+1e-8)return;
      const x=s.fraction*c,top=[],bottom=[];
      for(let j=0;j<=8;j++){
        const xt=x+s.topWidth*(j/8-.5),xb=x+s.bottomWidth*(j/8-.5);
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
      out.push({index,s,x,zt,zb,h,top,bottom,polygons,outline});
    });
    for(let i=0;i<out.length;i++)for(let j=0;j<i;j++){
      const a=out[i],b=out[j],half=(Math.max(a.s.topWidth,a.s.bottomWidth)+Math.max(b.s.topWidth,b.s.bottomWidth))/2;
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
      for(const [mid,width,t,kind] of [[ut,p.s.topWidth,p.s.topThickness,'top cap'],[lt,p.s.bottomWidth,p.s.bottomThickness,'bottom cap']])for(const sign of [-1,1]){
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
  return {MAT,specs,parts,polygon,network,projectedNetwork,field,G};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingSpars;

;
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

;
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

;
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

;
/* Exact closed-tip geometry: section-equilibrium nominal normal stress only.
 * No displacement solution, artificial tip section, or solid-FE field is used.
 * Coordinates are aircraft x aft, y span, z up; all sections remain y=constant.
 */
const WingClosedTipStress = (() => {
  'use strict';
  const GX=[-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
  const GW=[.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
  const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
  function solve(input,tools){
    const {normalize,polyIntegrals,prescribedFlightLoads,customLine,customFraction,Geometry,GRAV=9.80665}=tools,E=tools.E;
    const {g,pla,rod,asm,load:source,crit}=normalize(input),L=g.semiSpan,chord=tools.chordAt||((g,y)=>Geometry.chordAt(g,y));
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
    let base=source.kind==='flight'?prescribedFlightLoads(source,g):source.kind==='tip'?[{kind:'point',position:L,force:source.tipForce,fraction:source.tipFraction}]:source.items;
    const planformArea=(g.planform==='elliptic'?Math.PI/4:.5)*L*g.rootChord;
    // Existing flight tables are arrow-display records only. Structural integration
    // retains the exact chord law, including the elliptic endpoint square root.
    if(source.kind==='flight'&&source.distribution==='planform')base=base.map(p=>({...p,actualChordLaw:true,total:source.aircraftMass*source.loadFactor*GRAV/2}));
    if(base.some(p=>p.kind==='point'&&p.position>=L&&p.force!==0))throw Error('A point force at the zero-area apex is not admitted. Apply the load at a finite section or use a distributed load.');
    for(const[i,s]of g.spars.entries())if(!(s.length<cavityEnd-g.cap))throw Error(`Closed-tip spar ${i+1} must stop inboard of the solid tip-cap region.`);
    const teChord=12*g.skin,teTransition=teChord<g.rootChord?L*(g.planform==='delta'?1-teChord/g.rootChord:Math.sqrt(1-(teChord/g.rootChord)**2)):0;
    const boundaries=uniq([0,L,cavityEnd,teTransition,Math.max(0,cavityEnd-g.cap),Math.min(L,g.cap),...g.spars.map(s=>s.length),...(g.stations||[]).map(s=>s.eta*L),...ribs.flatMap(y=>[Math.max(0,y-g.ribThickness/2),Math.min(L,y+g.ribThickness/2)])]);
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
      const s=section(y,true),reference=Geometry.transformPoint(g,y,[s.xc,s.zc]),w=sourceWrench(y,reference[0]);
      // Unknowns are stress coefficients for x/chord,z/chord. N=Mz=0 for global-z loads.
      const target=-w.Mx/(s.scale**3),b=-target*s.Ixz/s.det,c=target*s.Ixx/s.det;
      const recoveredX=(b*s.Ixx+c*s.Ixz)*s.scale**3,recoveredZ=(b*s.Ixz+c*s.Izz)*s.scale**3;
      const residual=Math.max(Math.abs(recoveredX),Math.abs(recoveredZ+w.Mx))/Math.max(1,Math.abs(w.Mx));maxRecoveryResidual=Math.max(maxRecoveryResidual,residual);
      if(!(residual<1e-8))throw Error('Recovered normal stress failed section moment equilibrium.');
      const out={...s,y,reference,force:[0,0,w.V],moment:[w.Mx,-w.minusMy,0],localForce:[0,0,-w.V],localMoment:[-w.minusMy,w.Mx,0],coefficientX:b,coefficientZ:c,nominal:true,resolved:true,endZone:null,recoveryResidual:residual};cuts.set(y,out);return out;
    }
    function evaluateStress(y,point,material=pla){
      const cut=cutAt(y);if(!cut.resolved)return {value:NaN,resolved:false,nominal:true,station:y,endZone:'tip',reason:cut.reason};
      const modulus=typeof material==='number'?material:material.E;
      if(!Number.isFinite(modulus)||Math.abs(modulus-pla.E)>1e-8*pla.E)throw Error('This stress-only model contains only the selected homogeneous skin/rib material.');
      const value=cut.coefficientX*(point[0]-cut.xc)/cut.scale+cut.coefficientZ*(point[1]-cut.zc)/cut.scale;
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
    const load={...source,kind:'custom',items:[...base,...gravity],sourceLoad:source,gravitySummary:source.selfWeight?{weightN:actualWeight,appliedN:applied.V+actualWeight,netN:applied.V,quadrature:'Continuous adaptive 8-point Gauss integration split at CAD cap/rib/cavity transitions; display points are quadrature markers'}:undefined};
    const limitations=['Section-equilibrium nominal spanwise normal stress on actual aircraft-y material polygons; no displacement or frame solution','Zero user sweep, dihedral and incidence only; delta planform leading-edge sweep is retained geometrically','Locally prismatic Navier stress is a beam approximation; finite taper and rib/cap transitions do not resolve 3-D concentrations','Actual CAD skin/rib/cap and integral same-material spar union is included without double counting filled sections; effective homogeneous isotropic properties','Finite spars stop inboard of the solid tip; abrupt spar runout stress concentrations and load transfer are unresolved','Shear, torsional shear, warping, local buckling, bond/joint stresses, dynamics and overall safety certification are unavailable','The exact zero-area apex has undefined stress; finite samples are not a certified global maximum'];
    const verification={method:'Outboard load integration and polygon moment recovery',normalStressEquilibriumRelativeResidual:maxRecoveryResidual,forceBalanceResidual:root.force[2]-applied.V,momentBalanceResidual:root.moment[0]-applied.Mx,selfWeightN:actualWeight,displayQuadratureWeightN:displayWeight,displayQuadratureRelativeError:Math.abs(displayWeight-actualWeight)/Math.max(1,actualWeight),adaptiveQuadratureRelativeTolerance:2e-9,passed:maxRecoveryResidual<1e-8};
    const NaNs=()=>Float64Array.from(y,()=>NaN),V=Float64Array.from(recovered,c=>c.force[2]),M=Float64Array.from(recovered,c=>c.moment[0]),T=Float64Array.from(recovered,c=>c.moment[1]);
    const mesh={requestedElements:input.nElements||null,actualElements:0,nodeCount:0,mandatorySpanStations:boundaries,stressStations:y.length};
    const analysis3D={stressOnly:true,method:'Exact closed-tip section-equilibrium nominal normal stress (no deformation solve)',limitations,units:{length:'mm',force:'N',moment:'N mm',stress:'MPa',mass:'g'},evaluateStress,cutAt,performanceCounters,normalStress:{skinTension:tension,skinCompression:compression,spars:sparStress},resultants:recovered.map(c=>({y:c.y,force:c.force,moment:c.moment,localForce:c.localForce,localMoment:c.localMoment,endZone:c.endZone})),localM2:M,localM3:Float64Array.from(y,()=>0),localT:T,loadMapping:{endWrenches:[],method:'Original physical positions; continuous outboard wrench integration'},verification,tipBehavior,spanStations:yy,sectionSamples:[],validity:{nominalOnly:true,stressOnly:true,zeroAreaApexExcluded:true}};
    return {analysis3D,geometry:g,pla,rod,assembly:asm,load,criteria:crit,y,ySec:boundaries,sections:[],mass,V,M,T,stress:{sigTop:Float64Array.from(tension),sigBot:Float64Array.from(compression,v=>-v),spars:sparStress},ribs,seams,seamsActive:[],deflection:NaNs(),twist:NaNs(),chordwiseDeflection:NaNs(),fem:{fBending:[],fTorsion:[]},mesh,verification,tipBehavior,checks:[],governing:null,appliedForce:root.force[2],appliedMoment:root.moment[0]};
  }
  return {solve};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingClosedTipStress;

;
/*
 * MIE 446 Wing Lab — structural engine.
 * JavaScript port of computational/printed-wing-solver/printed_wing_solver.py (tested Python solver).
 * Units: mm, N, MPa (N/mm^2), g.  No dependencies; runs in the browser and in Node.
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
  const Profiles = typeof LoadProfiles !== "undefined" ? LoadProfiles : (typeof require === "function" ? require("./load_profiles.js") : null);
  const Spars = typeof WingSpars !== 'undefined' ? WingSpars : (typeof require === 'function' ? require('./wing_spars.js') : null);
  const Airfoils = typeof WingAirfoils !== 'undefined' ? WingAirfoils : (typeof require === 'function' ? require('./wing_airfoils.js') : null);
  const Geometry = typeof WingGeometry !== 'undefined' ? WingGeometry : (typeof require === 'function' ? require('./wing_geometry.js') : null);
  const Frame = typeof WingFrame3D !== 'undefined' ? WingFrame3D : (typeof require === 'function' ? require('./wing_frame3d.js') : null);
  const ClosedTipStress = typeof WingClosedTipStress !== 'undefined' ? WingClosedTipStress : (typeof require === 'function' ? require('./wing_closed_tip_stress.js') : null);
  if (!Profiles) throw new Error("Load load_profiles.js before engine.js.");
  const GRAV = 9.81;
  const VERSION = "1.3.0";
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
    if (!Number.isInteger(g.interiorRibs) || g.interiorRibs < 0 || g.interiorRibs > 16)
      throw new Error("Use 0–16 requested interior ribs.");
    if (g.customInteriorRibs != null) {
      if (!Array.isArray(g.customInteriorRibs) || g.customInteriorRibs.length > 16)
        throw new Error("Use at most 16 custom interior ribs.");
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
      if(Geometry.closedTip(g))for(const s of g.spars){const limit=closedTipSparLimit(g,s);if(s.length>limit+1e-8)throw Error(`Closed-tip spar length ${s.length.toFixed(2)} mm exceeds its finite runout fit limit ${limit.toFixed(2)} mm. Reduce Length; a fixed-width spar cannot reach the zero-area tip.`);}
      const points=[...linspace(0,g.semiSpan,129),...g.spars.map(s=>s.length),...(g.stations||[]).map(s=>s.eta*g.semiSpan)];
      for(const y of points)sparParts(g,y);
    }
    return Object.freeze(g);
  }

  const chordAt = Geometry.chordAt;
  const airfoilAt = (g,y) => Geometry.airfoilAt(g,y);
  // Cross-section mechanics use unrotated local x/z. Apply station transforms
  // only at geometry/CAD/display boundaries, never to the old scalar solver.
  const localGeometry = (g,y) => g.airfoil || g.stations || g.planform==='elliptic' ? {...g,naca:airfoilAt(g,y),sectionChord:chordAt(g,y)} : g;
  const sparParts = (g,y) => Spars.parts(localGeometry(g,y),y,verticalOrdinates);
  function closedTipSparLimit(g,spec){
    if(!Geometry.closedTip(g))return g.semiSpan;
    // Keep the actual fixed cap/web dimensions. Find the first loss of fit,
    // rather than extending material through a solid closure or scaling it.
    const end=cavityTipLimit(g)-g.cap;
    if(!(end>0))throw Error('Closed-tip spar has no hollow root region. Increase root chord or airfoil thickness.');
    const other=(g.spars||[]).filter(s=>s!==spec&&Math.abs(s.fraction-spec.fraction)>1e-12);
    const test={...g,spars:[...other,{...spec,length:g.semiSpan}]};
    const fits=y=>{try{sparParts(test,y);return true;}catch{return false;}};
    if(!fits(0))throw Error('Closed-tip spar dimensions do not fit the root cavity. Reduce cap width/thickness or web thickness, move the spar, or increase root chord/airfoil thickness.');
    const points=[...linspace(0,end,257),...other.flatMap(s=>[s.length,Math.min(end,s.length+1e-7)]),...(g.stations||[]).map(s=>s.eta*g.semiSpan)].filter(y=>y>=0&&y<=end).sort((a,b)=>a-b);
    let lo=0,hi=end;
    for(const y of points){if(!fits(y)){hi=y;break;}lo=y;}
    if(lo<hi)for(let i=0;i<40;i++){const y=(lo+hi)/2;if(fits(y))lo=y;else hi=y;}
    const limit=Math.max(0,Math.min(lo,end)-Math.max(1e-5,g.semiSpan*1e-7));
    if(limit<Math.min(20,g.semiSpan))throw Error('Closed-tip spar has less than the minimum 20 mm fit length. Revise root dimensions or spar dimensions.');
    return limit;
  }
  function analysisCapability(g,input={}) {
    if(Geometry.closedTip(g)){
      const restrictions=[];
      if(Math.abs(g.sweepDeg||0)>1e-10||Math.abs(g.dihedralDeg||0)>1e-10||[0,g.semiSpan,...(g.stations||[]).map(s=>s.eta*g.semiSpan)].some(y=>Math.abs(Geometry.stationAt(g,y).incidenceDeg)>1e-10))restrictions.push('Exact-tip section stress requires zero sweep, dihedral and incidence at every station.');
      if(g.rodFractions?.length)restrictions.push('Exact-tip section stress supports integral skin, ribs and finite-length spars; remove external rods.');
      if(g.modules>1&&input.assembly?.seamsBonded!==true)restrictions.push('Use one piece or explicitly fully bonded module seams for section stress.');
      if((input.load?.kind??DEFAULT_LOAD.kind)==='flight'&&(input.load?.inertiaRelief??DEFAULT_LOAD.inertiaRelief)!==false)restrictions.push('Set Wing inertia relief to Ignored for exact-tip section stress.');
      return {supported:!restrictions.length,requires3D:true,stressOnly:true,mode:'section-stress',reasons:['Exact zero-chord tip'],restrictions,message:restrictions.length?restrictions.join(' '):'Nominal axial and biaxial normal section stress from physical load equilibrium. Exact apex stress and deformation are unresolved; torsion, shear, local buckling and 3-D stress concentrations are not assessed.'};
    }
    const c=Geometry.analysisCapability(g);
    if(c.supported&&!g.airfoil&&!g.stations)return c;
    if(c.supported)c.reasons.push('explicit airfoil profiles / station sections require the full biaxial spatial beam');
    const restrictions=[];
    if(g.rodFractions?.length)restrictions.push('Remove external rods: 3-D rod/sleeve slip and curved rod paths are not validated.');
    if((g.spars||[]).some(s=>s.length<g.semiSpan-1e-8))restrictions.push('Use full-span bonded spars for the spatial beam: abrupt partial-span spar runouts need a validated reference-axis/joint transition model. Geometry and CAD export remain available.');
    if(g.modules>1&&input.assembly?.seamsBonded!==true)restrictions.push('Use one piece or explicitly fully bonded module seams; 3-D dry-joint compliance is not validated.');
    if(input.load?.kind==='flight'&&input.load.inertiaRelief!==false)restrictions.push('For the spatial beam, set Wing inertia relief to Ignored. Distributed aircraft lift is supported; spatial inertia relief is not validated.');
    return {supported:!restrictions.length,mode:'spatial-beam',requires3D:true,reasons:c.reasons,restrictions,loadFrame:c.loadFrame,
      message:restrictions.length?restrictions.join(' '):'Small-displacement 6-DOF spatial beam with projected normal sections, biaxial bending and axial/torsional response. Prescribed loads are global +z, not lift predicted from airfoil or twist. No 3-D solid, joint, buckling or flutter certification.'};
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
    return { g, pla, rod, asm, load, crit, nSections, ySec };
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
    return cachedSection(n.g, n.pla, n.rod, n.asm, Math.min(Math.max(y, 0), n.g.semiSpan));
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
    const sections = ySec.map((y) => cachedSection(g, pla, rod, asm, y));
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
    return ClosedTipStress.solve(input,{E:{ringLoops,outerContour,cavityTipLimit,ribStations,seams,sparParts,verticalOrdinates},normalize,polyIntegrals,prescribedFlightLoads,customLine,customFraction,Geometry,Frame,GRAV,Profiles,chordAt,airfoilAt,requestedElementCount});
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
    const lineForce=(p,y)=>p.kind==='point'?0:p.kind==='distributed'?(y>=p.start&&y<=p.end?p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start):0):customLine(p,g,y);
    const elements=nodeY.slice(1).map((b,i)=>{
      const a=nodeY[i],mid=(a+b)/2,tangent=F.unit(F.sub(nodes[i+1],nodes[i])),p=sectionData(mid,tangent,F.scale(F.add(nodes[i],nodes[i+1]),.5)),angle=Geometry.stationAt(g,mid).incidenceDeg*Math.PI/180;
      return {a:i,b:i+1,...p,orientation:[Math.cos(angle),0,-Math.sin(angle)],spanStart:a,spanEnd:b,consistentLoad:new Float64Array(13)};
    });
    const sourceIntervals=p=>{const bounds=p.kind==='table'?p.points.map(q=>q[0]):p.kind==='schrenk'?[0,L]:[p.start,p.end],base=[...new Set([...bounds,...ys.filter(y=>y>bounds[0]&&y<bounds.at(-1))])].sort((a,b)=>a-b);return base.slice(1).flatMap((b,i)=>Array.from({length:8},(_,k)=>[base[i]+(b-base[i])*k/8,base[i]+(b-base[i])*(k+1)/8]));};
    function footAt(P){const p=normals.locate(P);let index=0;while(index<elements.length-1&&p.boundedStation>nodeY[index+1])index++;return {...p,index,arc:p.boundedStation};}
    function loadVector(index,P,force,foot=footAt(P)){const e=elements[index],seg=axis.segments[index],t=Math.max(0,Math.min(1,(foot.boundedStation-nodeY[index])/(nodeY[index+1]-nodeY[index]))),A=F.add(seg.a,F.scale(seg.tangent,t*seg.L)),moment=F.cross(F.sub(P,A),force),R=F.basis(seg.a,seg.b,e.orientation);return F.pointLoadVector(R,seg.L,t,force,moment);}
    items.forEach((p,loadIndex)=>{
      if(p.kind==='point'){const P=loadPoint(p,p.position),foot=footAt(P),v=loadVector(foot.index,P,[0,0,p.force],foot);v.forEach((x,i)=>elements[foot.index].consistentLoad[i]+=x);if(foot.outside)loadMapping.endWrenches.push({load:loadIndex+1,end:foot.outside,sourceStation:p.position,normalFootStation:foot.station,reason:'Normal foot lies outside the finite beam; an equivalent end wrench preserves the full global force and moment, but local end-zone response is nominal.'});return;}
      for(const[a,b]of sourceIntervals(p)){
        try{loadMapping.monotonicity.intervalBoxes+=normals.certifyPath((lo,hi)=>sourcePathBounds(p,lo,hi),a,b);loadMapping.monotonicity.certifiedSourcePanels++;}catch(error){throw Error(`Wing load ${loadIndex+1} (${p.kind}), aircraft y=${a}…${b} mm: ${error.message}`);}
        const sa=normals.locate(loadPoint(p,a)).station,sb=normals.locate(loadPoint(p,b)).station;
        if(sb<sa-1e-7)throw Error('A prescribed load path reverses along the normal beam coordinate. Split/redefine this folded chordwise load path; no monotone-load approximation is silently applied.');
        const split=[a,b];for(const target of nodeY)if(target>sa+1e-9&&target<sb-1e-9){let lo=a,hi=b;for(let k=0;k<32;k++){const mid=(lo+hi)/2;if(normals.locate(loadPoint(p,mid)).station<target)lo=mid;else hi=mid;}split.push((lo+hi)/2);}split.sort((x,y)=>x-y);
        for(let j=1;j<split.length;j++){const lo=split[j-1],hi=split[j],foot=footAt(loadPoint(p,(lo+hi)/2)),v=F.integrate(y=>loadVector(foot.index,loadPoint(p,y),[0,0,lineForce(p,y)]),lo,hi);v.forEach((x,i)=>elements[foot.index].consistentLoad[i]+=x);if(foot.outside)loadMapping.endWrenches.push({load:loadIndex+1,end:foot.outside,sourceStart:lo,sourceEnd:hi,reason:'Outside-axis part of this line load is retained as an equivalent end wrench; end-zone stresses are unresolved.'});}
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
    function cutAt(y){
      if(cutCache.has(y))return cutCache.get(y);
      const out=frameAt(y),plane=normals.at(y),s=sectionData(y,plane.normal,plane.reference),reference=s.reference;let force=[0,0,0],moment=[0,0,0];
      const signed=P=>F.dot(F.sub(P,reference),plane.normal);
      for(const p of items){
        if(p.kind==='point'){const P=loadPoint(p,p.position);if(signed(P)>=-1e-9){const v=[0,0,p.force];force=F.add(force,v);moment=F.add(moment,F.cross(F.sub(P,reference),v));}continue;}
        for(const[a,b]of sourceIntervals(p)){const fa=signed(loadPoint(p,a)),fb=signed(loadPoint(p,b)),split=[a,b];if(fa*fb<0){let lo=a,hi=b;for(let k=0;k<38;k++){const mid=(lo+hi)/2;if(signed(loadPoint(p,mid))*fa>0)lo=mid;else hi=mid;}split.push((lo+hi)/2);}split.sort((u,v)=>u-v);for(let j=1;j<split.length;j++){const lo=split[j-1],hi=split[j];if(signed(loadPoint(p,(lo+hi)/2))<0)continue;const r=F.integrate(qy=>{const v=[0,0,lineForce(p,qy)],m=F.cross(F.sub(loadPoint(p,qy),reference),v);return [...v,...m];},lo,hi);force=F.add(force,Array.from(r.slice(0,3)));moment=F.add(moment,Array.from(r.slice(3,6)));}}
      }
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
    let appliedWrench=[0,0,0,0,0,0];for(const p of items){const add=(qy,v)=>{const force=[0,0,v],moment=F.cross(F.sub(loadPoint(p,qy),nodes[0]),force);return [...force,...moment];};if(p.kind==='point')appliedWrench=F.add(appliedWrench,add(p.position,p.force));else for(const[a,b]of sourceIntervals(p))appliedWrench=F.add(appliedWrench,F.integrate(q=>add(q,lineForce(p,q)),a,b));}
    const limitations=['Linear small-displacement Euler–Bernoulli beam; no shear deformation, geometric nonlinearity or section distortion','Locally prismatic projected normal sections; taper, twist and curved reference axis are beam approximations, not a 3-D solid mesh','A continuous C1 reference normal family maps physical loads and surface points; straight frame elements approximate that reference curve','The six-DOF equivalent axis clamp is not a resolved physical oblique root face. Geometrically truncated end cuts are masked; this is only a minimum exclusion, not a validated Saint-Venant decay length','Prescribed aircraft-global +z loads per projected y; no aerodynamic lift, zero-lift angle, stall or aeroelastic redistribution prediction','Perfectly bonded skin/ribs/spars and module seams; external rods and dry/slipping joints not modeled','Reported skin/spar stresses are nominal axial + biaxial normal beam stresses; shear failure, local buckling, bond stress and stress concentrations are unresolved','Natural frequencies, flutter and an overall certified factor of safety are unavailable'];
    limitations.push('Non-affine torsional warping normal stress is not recovered; nominal affine stress is not a validated local strength field.');
    const maxTranslation=Math.max(...frame.displacements.map(F.norm)),maxRotation=Math.max(...frame.rotations.map(F.norm)),smallDisplacement=maxTranslation/L<=.05&&maxRotation<=.1;
    const validity={smallDisplacement,maxTranslation,maxRotation,translationRatio:maxTranslation/L,message:smallDisplacement?'Small-displacement screening passed (translation/span ≤ 5%, rotation ≤ 0.1 rad); this is not a nonlinear validation.':'Outside the admitted small-displacement screening (translation/span > 5% or rotation > 0.1 rad). Linear results are illustrative only; reduce loads or use a geometrically nonlinear model.'};
    const analysis3D={method:frame.method,limitations,validity,spanStations:nodeY,referenceCoordinates:nodes,nodes,displacements:frame.displacements,rotations:frame.rotations,elasticIncidenceDeg,reactions:frame.reactions,energy:frame.energy,work:frame.work,verification:frame.verification,elements:frame.elements,sectionSamples:samples,resultants:cuts.map((c,i)=>({y:y[i],force:c.force,moment:c.moment,localForce:c.localForce,localMoment:c.localMoment,endZone:c.endZone})),localM2:Float64Array.from(cuts,c=>c.localMoment[1]),localM3:Float64Array.from(cuts,c=>c.localMoment[2]),localT:T,normalStress:{skinTension:tension,skinCompression:compression,spars:sparStress},loadMapping,frameAt,cutAt,evaluateNormalStress:normalStress,locatePhysicalPoint:normals.locate,referenceAt:y=>frameAt(y).reference,sectionReferenceAt:referenceAt,normalSectionAxisIterationChangeMm:axisChange};
    analysis3D.units={length:'mm',force:'N',moment:'N mm',stress:'MPa',rotation:'rad',energy:'N mm',lineLoad:'N/mm of projected y'};
    analysis3D.mesh=mesh;analysis3D.appliedWrench={force:appliedWrench.slice(0,3),momentAboutRoot:appliedWrench.slice(3)};
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
    cavityTipLimit,effectiveTE,sparParts,closedTipSparLimit,airfoilAt,analysisCapability,solveSpatial,spatialPointMotion,normalStressAt3D,normalStressLocationAt3D,
    stationAt:Geometry.stationAt,transformPoint:Geometry.transformPoint,inversePoint:Geometry.inversePoint,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WingEngine;

;
/* Physical, undeformed printable solids; independent of THREE/display/result meshes.
 * Boolean kernel: Manifold 3.5.4 (Apache-2.0). Coordinates and STL units: mm.
 */
const WingPrintMesh=(()=>{
 'use strict';
 const E=typeof WingEngine!=='undefined'?WingEngine:require('./engine.js');
 const G=typeof WingGeometry!=='undefined'?WingGeometry:require('./wing_geometry.js');
 const VERSION='1.3.0',ENVELOPE=[300,300,300],MAX_MASS=300;
 const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/Math.hypot(...a));
 const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
 const linspace=(a,b,n)=>Array.from({length:n},(_,i)=>a+(b-a)*i/(n-1));
 function spanStations(g,a,b){
  const expanded=g.planform&&g.planform!=='linear'||g.airfoil||g.stations||g.sweepDeg||g.dihedralDeg||g.sweepReferenceFraction;
  const points=g.planform==='elliptic'&&G.closedTip(g)?linspace(Math.asin(a/g.semiSpan),Math.asin(b/g.semiSpan),97).map(t=>g.semiSpan*Math.sin(t)):linspace(a,b,g.planform==='elliptic'?49:expanded?17:5);
  for(const s of g.stations||[])if(s.eta*g.semiSpan>a&&s.eta*g.semiSpan<b)points.push(s.eta*g.semiSpan);
  if(g.twistEnabled)for(let i=1;i<(g.stations||[]).length;i++){const s=g.stations[i-1],t=g.stations[i];for(const y of linspace(s.eta*g.semiSpan,t.eta*g.semiSpan,Math.max(2,Math.ceil(Math.abs(t.incidenceDeg-s.incidenceDeg))+1)))if(y>a&&y<b)points.push(y);}
  return [...new Set(points)].sort((x,y)=>x-y);
 }
 function toBinarySTL(mesh){
  // A double-precision Boolean intersection can collapse to identical float32
  // STL vertices. Drop only exactly zero-area serialized triangles, then
  // independently recheck every oriented edge and the enclosed volume.
  const triangles=[];
  for(let t=0;t<mesh.numTri;t++){
   const p=[0,1,2].map(k=>{const i=mesh.triVerts[3*t+k]*mesh.numProp;return Array.from(mesh.vertProperties.slice(i,i+3),Math.fround);});
   if(!p.flat().every(Number.isFinite))throw Error('STL contains a non-finite coordinate; no file exported.');
   const normal=cross(sub(p[1],p[0]),sub(p[2],p[0]));if(Math.hypot(...normal)===0)continue;triangles.push([...unit(normal),...p.flat()]);
  }
  const bytes=new ArrayBuffer(84+50*triangles.length),v=new DataView(bytes),label=new TextEncoder().encode('MIE446 printable wing; undeformed; mm; mesh Boolean CAD');new Uint8Array(bytes).set(label);v.setUint32(80,triangles.length,true);
  triangles.forEach((triangle,t)=>{let o=84+50*t;for(const x of triangle){v.setFloat32(o,x,true);o+=4;}v.setUint16(o,0,true);});
  return bytes;
 }

 function inspectSTL(bytes){
  const v=new DataView(bytes);if(v.byteLength<84||v.byteLength!==84+50*v.getUint32(80,true))throw Error('STL byte count is invalid.');
  const ids=new Map(),vertices=[],tris=[],edges=new Map();let volume=0;
  for(let t=0;t<v.getUint32(80,true);t++){
   const p=[],tri=[];for(let k=0;k<3;k++){const o=84+50*t+12+12*k,a=[v.getFloat32(o,true),v.getFloat32(o+4,true),v.getFloat32(o+8,true)];if(!a.every(Number.isFinite))throw Error('Non-finite STL coordinate.');const key=a.join(',');if(!ids.has(key)){ids.set(key,vertices.length);vertices.push(a);}tri.push(ids.get(key));p.push(a);}if(new Set(tri).size!==3)throw Error('STL has a collapsed triangle.');tris.push(tri);volume+=dot(p[0],cross(p[1],p[2]))/6;
   for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),e=edges.get(key)||{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(key,e);}
  }
  if([...edges.values()].some(e=>e.count!==2||e.balance!==0))throw Error('The serialized STL is not watertight with consistently oriented faces; no file exported.');
  if(!(volume>0))throw Error('STL does not enclose positive volume.');return {vertices:vertices.length,triangles:tris.length,volumeMm3:volume};
 }
 async function build(input,wasm,onProgress=()=>{}){
  const start=Date.now(),g=E.makeGeometry(input.geometry),{Manifold,Mesh,triangulate}=wasm,owned=new Set(),own=o=>{owned.add(o);return o;};
  const density=input.density??1.24;if(!Number.isFinite(density)||density<=0)throw Error('Set a positive shell material density before exporting.');
  if(g.semiSpan<=2*g.cap)throw Error('Span is too small for the root and tip caps.');
  for(const [value,label]of [[g.skin,'Skin'],[g.ribThickness,'Rib'],[g.te,'Trailing edge']])if(value<.8)throw Error(label+' thickness must be at least 0.8 mm for the course 0.4 mm nozzle.');
  if(g.rodFractions.length>8)throw Error('Use at most eight rod paths.');
  if(g.rodFractions.length){const fit=input.fitRecord;if(!fit||fit.tested!==true||typeof fit.reference!=='string'||!fit.reference.trim()||fit.rodDiameter!==g.rodDiameter||fit.clearance!==g.clearance||fit.sleeveWall!==g.sleeveWall)throw Error('Confirm the physical rod-fit coupon record for these rod diameter, clearance and sleeve-wall settings before STL export.');}

  const sampling=[...new Set([...spanStations(g,0,g.semiSpan),...E.ribStations(g),...E.seams(g),...g.spars.map(s=>s.length)])],radius=E.sleeveRadius(g);
  for(const y of sampling){
   E.ringLoops(g,y,81,2,2);const chord=E.chordAt(g,y),centres=E.rodCentres(g,y),profile=E.airfoilAt(g,y);
   centres.forEach(([x,z],i)=>{
    const room=E.verticalOrdinates(profile,g.rodFractions[i],chord,g.te);
    if(Math.min(room.upper-z,z-room.lower)-radius<.6-1e-6)throw Error(`Rod ${i+1} sleeve needs at least 0.6 mm outer-surface clearance at y=${y.toFixed(1)} mm.`);
    if(x-radius<g.cavityStart*chord-.1||x+radius>g.cavityEnd*chord+.1)throw Error(`Rod ${i+1} sleeve reaches outside the cavity limits. Move the rod or reduce its diameter.`);
    for(let j=-24;j<=24;j++){const dx=radius*j/24,dz=Math.sqrt(Math.max(0,radius*radius-dx*dx)),v=E.verticalOrdinates(profile,(x+dx)/chord,chord,g.te);if(v.upper-g.skin-z-dz<-.1||z-dz-v.lower-g.skin<-.1)throw Error(`Rod ${i+1} sleeve does not fit between the inner skins at y=${y.toFixed(1)} mm.`);}
    for(let j=0;j<i;j++)if(Math.hypot(x-centres[j][0],z-centres[j][1])<2*radius-.1)throw Error('Rod sleeves overlap. Move or remove a rod.');
   });
  }

  const shellMaterial=input.shellMaterial||(G.closedTip(g)?E.MATERIALS.pla_upright:null);
  for(const s of g.spars)for(const key of ['E','nu','rho','ft','fc','fs'])if(shellMaterial&&Math.abs(s.material[key]-shellMaterial[key])>1e-7*Math.max(1,Math.abs(shellMaterial[key])))throw Error('Integral printed spars must use the same material as the shell. Set Materials → Spars to the shell material.');
  const check=(m,label)=>{const status=m.status();if(status!=='NoError'||m.isEmpty())throw Error(label+': invalid CAD solid ('+status+').');return m;};
  function loft(ys,polygonAt,transform=(y,p)=>G.transformPoint(g,y,p)){
   const loops=ys.map(y=>polygonAt(y).map(p=>Array.from(p)));if(loops.length<2||loops.some(p=>p.length!==loops[0].length))throw Error('Inconsistent section contours.');
   if(signedArea(loops[0])<0)loops.forEach(p=>p.reverse());const n=loops[0].length,pointEnd=loops.at(-1).every(p=>Math.hypot(p[0]-loops.at(-1)[0][0],p[1]-loops.at(-1)[0][1])<1e-10),rings=pointEnd?loops.slice(0,-1):loops,vertices=rings.flatMap((loop,j)=>loop.flatMap(p=>transform(ys[j],p))),tri=[];
   for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=(j+1)*n+i,c=(j+1)*n+(i+1)%n,d=j*n+(i+1)%n;tri.push(a,b,c,a,c,d);}
   for(const t of triangulate([loops[0]],1e-8,false))tri.push(...t);
   const end=(rings.length-1)*n;if(pointEnd){const apex=vertices.length/3;vertices.push(...transform(ys.at(-1),loops.at(-1)[0]));for(let i=0;i<n;i++)tri.push(end+i,apex,end+(i+1)%n);}else for(const t of triangulate([loops.at(-1)],1e-8,false))tri.push(end+t[2],end+t[1],end+t[0]);
   let volume=0;for(let i=0;i<tri.length;i+=3){const a=vertices.slice(3*tri[i],3*tri[i]+3),b=vertices.slice(3*tri[i+1],3*tri[i+1]+3),c=vertices.slice(3*tri[i+2],3*tri[i+2]+3);volume+=dot(a,cross(b,c))/6;}if(volume<0)for(let i=0;i<tri.length;i+=3)[tri[i+1],tri[i+2]]=[tri[i+2],tri[i+1]];
   return check(own(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(tri)}))),'Loft');
  }
  function cylinder(a,b,r,extension=0){const d=unit(sub(b,a)),u=unit(cross(d,Math.abs(d[2])<.9?[0,0,1]:[1,0,0])),w=cross(d,u),length=Math.hypot(...sub(b,a)),origin=sub(a,scale(d,extension)),circle=linspace(0,2*Math.PI,97).slice(0,-1).map(t=>[r*Math.cos(t),r*Math.sin(t)]);return loft([0,length+2*extension],()=>circle,(y,p)=>add(add(origin,scale(d,y)),add(scale(u,p[0]),scale(w,p[1]))));}
  function slab(s,a,b){const first=own(s.trimByPlane([0,1,0],a));return own(first.trimByPlane([0,-1,0],-b));}
  try{
   onProgress('Building exterior and cavity…');const outer=loft(spanStations(g,0,g.semiSpan),y=>E.outerContour(g,y,161));
   const cavityEnd=G.closedTip(g)?E.cavityTipLimit(g)-g.cap:g.semiSpan-g.cap;if(cavityEnd<=g.cap)throw Error('The hollow root region is too short. Use a thicker root airfoil or larger root chord.');
   const cavity=loft(spanStations(g,g.cap,cavityEnd),y=>E.ringLoops(g,y,81,2,2).inner);
   let body=check(own(outer.subtract(cavity)),'Skin');
   onProgress('Adding ribs…');for(const y of E.ribStations(g)){const rib=slab(outer,y-g.ribThickness/2,y+g.ribThickness/2);body=check(own(body.add(rib)),'Rib union');}
   onProgress('Adding integral spars…');for(let index=0;index<g.spars.length;index++){
    const s=g.spars[index],ys=spanStations(g,0,s.length);
    // Overlap only within existing plastic: cap/skin 0.05 mm and web/cap
    // 0.03 mm. This avoids coincident-face slivers without thickening the wing.
    for(let part=0;part<3;part++){
     const solid=loft(ys,y=>{const p=E.sparParts(g,y).find(p=>p.index===index);if(!p)throw Error('Spar section is missing.');return p.polygons[part].map(([x,z],j)=>[x,z+(part<2&&j<9?(part===0?.05:-.05):part===2?(z>(p.zt+p.zb)/2?.03:-.03):0)]);});
     body=check(own(body.add(own(solid.intersect(outer)))),'Spar union');
    }
   }
   const rodPaths=[];
   for(let i=0;i<g.rodFractions.length;i++){
    const point=y=>G.transformPoint(g,y,E.rodCentres(g,y)[i]),a=point(0),b=point(g.semiSpan);
    for(const y of spanStations(g,0,g.semiSpan))if(Math.hypot(...sub(point(y),add(a,scale(sub(b,a),y/g.semiSpan))))>.01)throw Error('A straight carbon rod cannot follow this curved path. Remove rods or use a straight path; no bent rod will be exported.');
    rodPaths.push([a,b]);body=check(own(body.add(cylinder(a,b,E.sleeveRadius(g)))),'Sleeve union');
   }
   for(const [a,b]of rodPaths)body=check(own(body.subtract(cylinder(a,b,E.holeRadius(g),2))),'Rod holes');
   onProgress('Checking connected solids and printer fit…');const semiWingVolume=body.volume();
   if(input.fullWing===true){onProgress('Mirroring across the root plane and joining the full wing…');const mirrored=own(body.mirror([0,1,0]));body=check(own(body.add(mirrored)),'Symmetric full wing');if(Math.abs(body.volume()-2*semiWingVolume)>Math.max(.01,5e-5*semiWingVolume))throw Error('Full-wing symmetry failed volume conservation.');}
   const maxMass=MAX_MASS*(input.fullWing===true?2:1),volume=body.volume(),mass=volume*density/1000;if(mass>maxMass)throw Error(`Printed plastic mass ${mass.toFixed(1)} g exceeds ${maxMass} g (${MAX_MASS} g per semi-wing). Revise the design; it has not been scaled.`);
   const wholeParts=body.decompose();wholeParts.forEach(own);if(wholeParts.filter(p=>p.volume()>1e-6).length!==1)throw Error('The complete wing must have one connected material region. Check rib/spar/skin connections.');
   const files=[],modules=[],halfBounds=E.moduleBounds(g),bounds=input.fullWing===true&&g.modules>1?[...halfBounds.slice(1).reverse().map(y=>-y),...halfBounds]:input.fullWing===true?[-g.semiSpan,g.semiSpan]:halfBounds;let sum=0,serializedSum=0;
   for(let i=0;i<bounds.length-1;i++){
    const module=bounds.length===2?body:check(slab(body,bounds[i],bounds[i+1]),'Module '+(i+1)),pieces=module.decompose();pieces.forEach(own);if(pieces.filter(p=>p.volume()>1e-6).length!==1)throw Error(`Module ${i+1} contains disconnected material regions.`);
    const box=module.boundingBox(),size=box.max.map((x,k)=>x-box.min[k]);if(size.some((x,k)=>x>ENVELOPE[k]+1e-3))throw Error(`Module ${i+1} is ${size.map(x=>x.toFixed(1)).join(' × ')} mm; it does not fit the 300 × 300 × 300 mm printer. Increase Printed modules or revise dimensions. No automatic scaling.`);
    const tolerance=.0002,shifted=own(own(module.translate(scale(box.min,-1))).simplify(tolerance)),bytes=toBinarySTL(shifted.getMesh()),verified=inspectSTL(bytes),v=module.volume(),meshVolume=shifted.volume();
    if(Math.abs(meshVolume-v)>Math.max(.01,tolerance*module.surfaceArea()))throw Error('STL surface simplification exceeded its volume-change bound: '+v+' -> '+meshVolume+'; area '+module.surfaceArea()+'; actual tolerance '+module.tolerance());
    if(Math.abs(verified.volumeMm3-meshVolume)>Math.max(.01,1e-5*meshVolume))throw Error('STL serialization changed the simplified solid volume.');sum+=v;serializedSum+=verified.volumeMm3;
    files.push({name:`wing_module_${i+1}.stl`,bytes});modules.push({module:i+1,spanBoundsMm:[bounds[i],bounds[i+1]],sizeMm:size,translationMm:scale(box.min,-1),referenceVolumeMm3:v,meshToleranceMm:tolerance,...verified});

   }
   if(Math.abs(sum-volume)>Math.max(.01,5e-4*volume))throw Error('Module cutting failed volume conservation.');
   if(serializedSum*density/1000>maxMass)throw Error('Serialized STL exceeds the printed-mass limit.');
   return {files,report:{format:'mie446-browser-print',version:VERSION,fullWing:input.fullWing===true,mirrorPlane:'y = 0 (root)',semiWingVolumeMm3:semiWingVolume,maximumPrintedMassG:maxMass,kernel:'Manifold 3.5.4',units:'mm',geometry:g,fitRecord:input.fitRecord||null,printedMassG:serializedSum*density/1000,closedTip:G.closedTip(g),cavityEndMm:cavityEnd,referenceSolidVolumeMm3:volume,plasticVolumeMm3:serializedSum,densityGcm3:density,printerEnvelopeMm:ENVELOPE,modules,elapsedMs:Date.now()-start,limitations:[...(G.closedTip(g)?['Exact zero-chord tip with solid outboard region.','Nominal section stress is a separate approximation; no exact-apex stress, deformation or 3-D solid-FE validation is implied.','The pointed terminal region tapers below the nominal wall thickness; inspect its actual slicer layers.']:[]),'Undeformed mesh CAD, independent of result/display mesh.','Mesh loft and Boolean approximation; not the exact CadQuery B-rep.','STL contains no units; import in millimetres.','Printer fit excludes supports, brim and arbitrary-angle packing. Inspect every slicer layer.','No strength, buckling, bond or flight certification.','Symmetry copies geometry only; source structural results describe the original root-clamped semi-wing. A full-aircraft support/load model is not solved.','For full-wing output, one module joins both halves; multiple modules are counted per semi-wing and require assembly, including the root joint.']}};
  }finally{for(const o of [...owned].reverse())try{o.delete();}catch{}}
 }
 return{VERSION,build,inspectSTL,toBinarySTL};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingPrintMesh;

;
/* Browser-only millimetre CAD exchange. STEP is a faceted solid B-rep built
 * from validated physical print triangles; it does not reconstruct features.
 * Entity mapping follows STEP AP203 FACETED_BREP / POLY_LOOP / CLOSED_SHELL.
 */
const WingCADExport=(()=>{
  'use strict';
  const E=typeof WingEngine!=='undefined'?WingEngine:typeof require==='function'?require('./engine.js'):null;
  const G=typeof WingGeometry!=='undefined'?WingGeometry:typeof require==='function'?require('./wing_geometry.js'):null;
  const P=typeof WingPrintMesh!=='undefined'?WingPrintMesh:typeof require==='function'?require('./wing_print_mesh.js'):null;
  const enc=s=>new TextEncoder().encode(s),num=v=>{if(!Number.isFinite(v))throw Error('CAD coordinates must be finite.');const s=Number(v.toPrecision(15)).toString().replace('e','E');return /[.E]/.test(s)?s:s+'.';},safe=s=>String(s).replace(/[^A-Za-z0-9 _.-]/g,'_');
  const limitations=['Faceted CAD exchange preserves the physical print mesh; surfaces are planar triangles, not smooth or parametric features.','No automatic SolidWorks feature reconstruction, manufacturing allowance, kerf compensation or structural certification.'];
  function buildSTEP(input){
    if(!P||!input||!Array.isArray(input.files)||!input.files.length||!input.report||input.report.units!=='mm'||input.report.modules?.length!==input.files.length)throw Error('STEP export requires the complete validated millimetre physical print build, including its module report.');
    const reports=[],files=input.files.map((file,k)=>{
      const source=ArrayBuffer.isView(file.bytes)?file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength):file.bytes,checked=P.inspectSTL(source),module=input.report.modules[k],translation=module.translationMm;
      if(!Array.isArray(translation)||translation.length!==3||!translation.every(Number.isFinite))throw Error('Physical module placement is missing.');
      if(module.volumeMm3&&Math.abs(checked.volumeMm3-module.volumeMm3)>Math.max(.01,1e-5*checked.volumeMm3))throw Error('STL differs from its validated module report.');
      const v=new DataView(source),count=v.getUint32(80,true),points=[],triangles=[],ids=new Map();
      for(let i=0;i<count;i++){const face=[];for(let j=0;j<3;j++){const p=[0,1,2].map(d=>v.getFloat32(84+50*i+12+12*j+4*d,true)),key=p.join(',');if(!ids.has(key)){ids.set(key,points.length);points.push(p.map((x,d)=>x-translation[d]));}face.push(ids.get(key));}triangles.push(face);}
      const lines=[];let next=1;const add=s=>{const id=next++;lines.push(`#${id}=${s};`);return id;},ref=i=>'#'+i;
      const app=add("APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies')");
      add(`APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,#${app})`);
      const pc=add(`PRODUCT_CONTEXT('',#${app},'mechanical')`),product=add(`PRODUCT('wing_module_${k+1}','Wing module ${k+1}','Faceted physical CAD in millimetres',(#${pc}))`),formation=add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#${product},.NOT_KNOWN.)`),dc=add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${app},'design')`),definition=add(`PRODUCT_DEFINITION('design','',#${formation},#${dc})`),shape=add(`PRODUCT_DEFINITION_SHAPE('','',#${definition})`);
      const mm=add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'),rad=add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'),sterad=add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())'),unc=add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),#${mm},'distance_accuracy_value','')`),context=add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${rad},#${sterad})) REPRESENTATION_CONTEXT('',''))`);
      const pointIDs=points.map(p=>add(`CARTESIAN_POINT('',(${p.map(num).join(',')}))`)),faces=triangles.map(t=>{
        const a=points[t[0]],b=points[t[1]],c=points[t[2]],u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross),edgeLength=Math.hypot(...u);
        if(!(length>0&&edgeLength>0))throw Error('STEP cannot contain degenerate facets.');
        const loop=add(`POLY_LOOP('',(${t.map(i=>ref(pointIDs[i])).join(',')}))`),bound=add(`FACE_OUTER_BOUND('',#${loop},.T.)`),normal=add(`DIRECTION('',(${cross.map(x=>num(x/length)).join(',')}))`),axis=add(`DIRECTION('',(${u.map(x=>num(x/edgeLength)).join(',')}))`),placement=add(`AXIS2_PLACEMENT_3D('',#${pointIDs[t[0]]},#${normal},#${axis})`),plane=add(`PLANE('',#${placement})`);
        return add(`FACE_SURFACE('',(#${bound}),#${plane},.T.)`);
      });
      const shell=add(`CLOSED_SHELL('',(${faces.map(ref).join(',')}))`),solid=add(`FACETED_BREP('Wing module ${k+1}',#${shell})`),representation=add(`FACETED_BREP_SHAPE_REPRESENTATION('Wing module ${k+1}',(#${solid}),#${context})`);add(`SHAPE_DEFINITION_REPRESENTATION(#${shape},#${representation})`);
      const text=`ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Faceted physical wing solid; millimetres; original aircraft placement'),'2;1');\nFILE_NAME('wing_module_${k+1}.step','${new Date().toISOString()}',('MIE 446'),('UMass'),'Wing Lab faceted CAD exporter','Wing Lab','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
      reports.push({module:k+1,triangles:count,vertices:points.length,volumeMm3:checked.volumeMm3,placement:'Original aircraft coordinates restored from print translation',byteLength:enc(text).byteLength});
      return {name:`wing_module_${k+1}_faceted.step`,bytes:enc(text),text,mime:'application/step'};
    });
    return {files,report:{format:'mie446-faceted-step',schema:'AP203 CONFIG_CONTROL_DESIGN',units:'mm',fullWing:!!input.report.fullWing,representation:'FACETED_BREP: closed planar polygon faces',modules:reports,limitations:[...limitations]}};
  }
  function buildDXF(input={}){
    if(!E||!G)throw Error('Load wing geometry and engine before CAD export.');
    const g=E.makeGeometry(input.geometry||{}),full=!!input.fullWing,files=[],sections=[];
    const entity=(layer,points)=>['0','LWPOLYLINE','100','AcDbEntity','8',layer,'100','AcDbPolyline','90',String(points.length),'70','1',...points.flatMap(p=>['10',num(p[0]),'20',num(p[1])])];
    function document(name,entities,note){const data=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','9','$MEASUREMENT','70','1','9','$LUNITS','70','2','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','3',...['PLANFORM_REFERENCE','RIB_OUTER','ROD_HOLE'].flatMap((layer,i)=>['0','LAYER','2',layer,'70','0','62',String(i+1),'6','CONTINUOUS']),'0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES',...entities,'0','ENDSEC','0','EOF'];const text='999\n'+safe(note)+'\n'+data.join('\n')+'\n';files.push({name,bytes:enc(text),text,mime:'application/dxf'});}
    // Cosine span sampling resolves the elliptic apex without a chord floor.
    const ys=Array.from({length:257},(_,i)=>g.semiSpan*(1-Math.cos(Math.PI*i/256))/2),lead=ys.map(y=>{const s=G.stationAt(g,y);return[s.xLE,y];}),trail=ys.map(y=>{const s=G.stationAt(g,y);return[s.xLE+s.chord,y];});
    const semi=[...lead,...trail.reverse()].filter((p,i,a)=>i===0||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>1e-10);
    document('wing_planform_reference_mm.dxf',entity('PLANFORM_REFERENCE',semi).concat(full?entity('PLANFORM_REFERENCE',semi.map(([x,y])=>[x,-y]).reverse()):[]),'2D planform reference in aircraft X-Y, millimetres; not a 3D solid or cutting toolpath');
    const stations=E.ribStations(g);
    stations.forEach((y,i)=>{
      const transform=p=>{const q=G.transformPoint(g,y,p);return[q[0],q[2]];},outer=E.outerContour(g,y,241).map(transform),entities=entity('RIB_OUTER',outer),rodCenters=E.rodCentres(g,y),r=E.holeRadius(g);
      // A straight inclined cylindrical channel cuts an aircraft-y rib as an
      // ellipse: major radius r/|axis_y| along its projected channel axis.
      if(rodCenters.length){for(let j=0;j<rodCenters.length;j++){
        const a=G.transformPoint(g,0,E.rodCentres(g,0)[j]),b=G.transformPoint(g,g.semiSpan,E.rodCentres(g,g.semiSpan)[j]),d=b.map((x,k)=>x-a[k]),length=Math.hypot(...d),transverse=Math.hypot(d[0],d[2]),ratio=Math.abs(d[1])/length,p=transform(rodCenters[j]);
        if(!(ratio>1e-8))throw Error('Rod channel does not cross an aircraft-y rib plane.');
        for(let k=1;k<32;k++){const q=G.transformPoint(g,g.semiSpan*k/32,E.rodCentres(g,g.semiSpan*k/32)[j]);if(Math.hypot(...q.map((x,h)=>x-a[h]-d[h]*k/32))>.01)throw Error('A curved rod channel cannot be exported as a straight physical rod hole.');}
        const common=['0',transverse<1e-9?'CIRCLE':'ELLIPSE','100','AcDbEntity','8','ROD_HOLE','100',transverse<1e-9?'AcDbCircle':'AcDbEllipse','10',num(p[0]),'20',num(p[1]),'30','0.'];
        entities.push(...common,...(transverse<1e-9?['40',num(r)]:['11',num(r*d[0]/(ratio*transverse)),'21',num(r*d[2]/(ratio*transverse)),'31','0.','40',num(ratio),'41','0.','42',num(2*Math.PI)]));
      }}
      document(`wing_rib_${i+1}_y_${y.toFixed(3)}_mm.dxf`,entities,`2D aircraft-y rib section at y=${y.toFixed(6)} mm; DXF X-Y corresponds to aircraft X-Z; center profile, finite rib taper not unfolded; no kerf allowance`);
      sections.push({rib:i+1,yMm:y,thicknessMm:g.ribThickness,holes:rodCenters.length,coordinatePlane:'DXF X-Y = aircraft X-Z',symmetricCopy:full?'Same profile at negative y; no duplicate cutting profile generated':null});
    });
    return {files,report:{format:'mie446-2d-dxf',version:'AutoCAD 2000 ASCII',units:'mm',fullWing:full,planform:'Reference outline sampled at 257 span stations per half',ribSections:sections,limitations:['DXF contains 2D reference outlines and individual center-plane rib profiles, not a 3D wing solid.','Rib profiles retain actual aircraft X-Z placement; finite rib thickness/taper and tool compensation are not unfolded into manufacturing patterns.',...limitations]}};
  }
  return {buildSTEP,buildDXF};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingCADExport;
