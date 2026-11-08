// MIE 446 Optimization Lab: shared plotting and formatting kit (pure ES module, no dependencies).
// Import from a module page as:  import { linePlot, categoryPlot, heatmap, fmt, badge } from '../shared/labkit.js';
// Every canvas passed in must carry logical width/height attributes, e.g. <canvas class="plot" width="640" height="380">.
// All drawing works in logical pixels; HiDPI scaling and responsive CSS sizing are handled here.

export const palette = {
  blue: '#1f5fbf', orange: '#e07a1f', green: '#2a9d5c', red: '#c43d3d', purple: '#7b4fb3',
  teal: '#1b9aaa', brown: '#8a6d3b', gray: '#6b6b6b', light: '#d9d9de', ink: '#1d1d1f',
  feasible: 'rgba(42,157,92,0.18)', infeasible: 'rgba(196,61,61,0.18)',
  series: ['#1f5fbf', '#e07a1f', '#2a9d5c', '#c43d3d', '#7b4fb3', '#1b9aaa', '#8a6d3b', '#6b6b6b'],
};

// ---------- formatting ----------

export function fmt(x, digits = 3) {
  if (x === null || x === undefined || Number.isNaN(x)) return 'n/a';
  if (typeof x !== 'number') return String(x);
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const ax = Math.abs(x);
  if (ax === 0) return '0';
  if (ax >= 1e6 || ax < 1e-3) return x.toExponential(Math.max(0, digits - 1));
  const intDigits = Math.floor(Math.log10(ax)) + 1;
  const dec = Math.max(0, digits - intDigits);
  return x.toFixed(dec);
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// kind: 'ok' | 'warn' | 'bad' | 'info'
export function badge(kind, text) {
  const k = ['ok', 'warn', 'bad', 'info'].includes(kind) ? kind : 'info';
  return `<span class="badge badge-${k}">${escapeHTML(text)}</span>`;
}

// ---------- canvas setup ----------

export function setupCanvas(canvas) {
  const dpr = Math.max(1, Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  if (!canvas.dataset.logicalW) {
    canvas.dataset.logicalW = String(canvas.width || 640);
    canvas.dataset.logicalH = String(canvas.height || 380);
  }
  const W = Number(canvas.dataset.logicalW);
  const H = Number(canvas.dataset.logicalH);
  canvas.style.width = '100%';
  canvas.style.maxWidth = W + 'px';
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = `${W} / ${H}`;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  return { ctx, W, H, dpr };
}

// Convert a logical canvas coordinate from a mouse event (for probes and clicks).
export function canvasPoint(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const W = Number(canvas.dataset.logicalW || canvas.width);
  const H = Number(canvas.dataset.logicalH || canvas.height);
  return { x: (evt.clientX - rect.left) * W / rect.width, y: (evt.clientY - rect.top) * H / rect.height };
}

// ---------- axis helpers ----------

export function niceTicks(min, max, n = 6) {
  if (!(max > min)) { max = min + 1; }
  const span = max - min;
  const rough = span / Math.max(1, n);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const r = rough / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const ticks = [];
  const t0 = Math.ceil(min / step - 1e-9) * step;
  for (let t = t0; t <= max + step * 1e-9; t += step) {
    const clean = Number((Math.round(t / step) * step).toPrecision(12));
    ticks.push(Math.abs(clean) < step * 1e-9 ? 0 : clean);
  }
  return { ticks, step };
}

function tickLabel(t, step) {
  if (Math.abs(t) >= 1e5 || (Math.abs(t) < 1e-3 && t !== 0)) return t.toExponential(1);
  const dec = Math.max(0, -Math.floor(Math.log10(step)) + (step / Math.pow(10, Math.floor(Math.log10(step))) < 1.5 ? 0 : 0));
  return t.toFixed(Math.min(6, dec));
}

function drawAxes(ctx, frame, xlim, ylim, opts) {
  const { left, top, pw, ph } = frame;
  const X = x => left + (x - xlim[0]) / (xlim[1] - xlim[0]) * pw;
  const Y = y => top + ph - (y - ylim[0]) / (ylim[1] - ylim[0]) * ph;
  const xt = niceTicks(xlim[0], xlim[1], opts.xticks || 7);
  const yt = niceTicks(ylim[0], ylim[1], opts.yticks || 6);
  ctx.save();
  // grid
  if (opts.grid !== false) {
    ctx.strokeStyle = '#eceef2';
    ctx.lineWidth = 1;
    for (const t of xt.ticks) { ctx.beginPath(); ctx.moveTo(X(t), top); ctx.lineTo(X(t), top + ph); ctx.stroke(); }
    for (const t of yt.ticks) { ctx.beginPath(); ctx.moveTo(left, Y(t)); ctx.lineTo(left + pw, Y(t)); ctx.stroke(); }
  }
  // frame
  ctx.strokeStyle = '#9a9aa2';
  ctx.strokeRect(left + 0.5, top + 0.5, pw, ph);
  // tick labels
  ctx.fillStyle = '#3a3a40';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xt.ticks) ctx.fillText(tickLabel(t, xt.step), X(t), top + ph + 5);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of yt.ticks) ctx.fillText(tickLabel(t, yt.step), left - 6, Y(t));
  // axis labels
  ctx.fillStyle = '#1d1d1f';
  if (opts.xlabel) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(opts.xlabel, left + pw / 2, frame.H - 4);
  }
  if (opts.ylabel) {
    ctx.save();
    ctx.translate(13, top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(opts.ylabel, 0, 0);
    ctx.restore();
  }
  if (opts.title) {
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(opts.title, left, 8);
  }
  ctx.restore();
  return { X, Y };
}

function finiteRange(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

function padRange([lo, hi], frac = 0.05) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi === lo) { const d = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1; return [lo - d, hi + d]; }
  const d = (hi - lo) * frac;
  return [lo - d, hi + d];
}

// ---------- line / scatter plot ----------
// series: [{ x: number[], y: number[], label?, color?, type?: 'line'|'scatter'|'both', width?, dash?: number[], size? }]
// opts: { title, xlabel, ylabel, xlim, ylim, legend (default true), grid, markers: [{x, label, color}], hlines: [{y, label, color}],
//         yZero (include y=0 in range), xZero }
export function linePlot(canvas, series, opts = {}) {
  const { ctx, W, H } = setupCanvas(canvas);
  const left = opts.marginLeft || 62, right = 16, top = opts.title ? 30 : 14, bottom = opts.xlabel ? 44 : 30;
  const frame = { left, top, pw: W - left - right, ph: H - top - bottom, W, H };
  const xs = [], ys = [];
  for (const s of series) { for (const v of s.x) xs.push(v); for (const v of s.y) ys.push(v); }
  if (opts.hlines) for (const h of opts.hlines) ys.push(h.y);
  if (opts.markers) for (const m of opts.markers) xs.push(m.x);
  if (opts.yZero) ys.push(0);
  if (opts.xZero) xs.push(0);
  const xlim = opts.xlim || padRange(finiteRange(xs));
  const ylim = opts.ylim || padRange(finiteRange(ys));
  const { X, Y } = drawAxes(ctx, frame, xlim, ylim, opts);
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, frame.pw, frame.ph); ctx.clip();
  series.forEach((s, k) => {
    const color = s.color || palette.series[k % palette.series.length];
    const type = s.type || 'line';
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = s.width || 2;
    ctx.setLineDash(s.dash || []);
    if (type === 'line' || type === 'both') {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < s.x.length; i++) {
        const x = s.x[i], y = s.y[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
        if (!pen) { ctx.moveTo(X(x), Y(y)); pen = true; } else ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke();
    }
    if (type === 'scatter' || type === 'both') {
      const r = s.size || 3.5;
      ctx.setLineDash([]);
      for (let i = 0; i < s.x.length; i++) {
        const x = s.x[i], y = s.y[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  ctx.setLineDash([]);
  if (opts.hlines) for (const h of opts.hlines) {
    ctx.strokeStyle = h.color || palette.red; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(left, Y(h.y)); ctx.lineTo(left + frame.pw, Y(h.y)); ctx.stroke();
    if (h.label) { ctx.fillStyle = h.color || palette.red; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(h.label, left + frame.pw - 4, Y(h.y) - 2); }
  }
  if (opts.markers) for (const m of opts.markers) {
    ctx.strokeStyle = m.color || palette.purple; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(m.x), top); ctx.lineTo(X(m.x), top + frame.ph); ctx.stroke();
    if (m.label) { ctx.fillStyle = m.color || palette.purple; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(m.label, X(m.x) + 4, top + 4); }
  }
  ctx.restore();
  if (opts.legend !== false && series.some(s => s.label)) {
    let y = top + 8;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const labels = series.filter(s => s.label);
    const wmax = Math.max(...labels.map(s => ctx.measureText(s.label).width));
    const x0 = left + frame.pw - wmax - 40;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x0 - 6, y - 10, wmax + 44, labels.length * 16 + 6);
    series.forEach((s, k) => {
      if (!s.label) return;
      const color = s.color || palette.series[k % palette.series.length];
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
      if ((s.type || 'line') !== 'scatter') { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 22, y); ctx.stroke(); }
      if (s.type === 'scatter' || s.type === 'both') { ctx.setLineDash([]); ctx.beginPath(); ctx.arc(x0 + 11, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.setLineDash([]);
      ctx.fillStyle = '#1d1d1f'; ctx.fillText(s.label, x0 + 28, y);
      y += 16;
    });
  }
  return { ctx, X, Y, xlim, ylim, frame };
}

// ---------- category point profile (utilization profiles, sensitivity profiles) ----------
// labels: string[]; values: number[] or number[][] (grouped points per label, e.g. [before, after])
// opts: { title, xlabel, xlim, colors: string[] (per group) or colorFn(value, i, g), refLines: [{x, label, color}],
//         valueFmt: fn(v)->string, groupLabels: string[] }
export function categoryPlot(canvas, labels, values, opts = {}) {
  const { ctx, W, H } = setupCanvas(canvas);
  const groups = Array.isArray(values[0]) ? values[0].length : 1;
  const vals = values.map(v => (Array.isArray(v) ? v : [v]));
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const labelW = Math.min(W * 0.4, Math.max(40, ...labels.map(l => ctx.measureText(String(l)).width)) + 14);
  const left = labelW + 8, right = 70, top = opts.title ? 30 : 14, bottom = opts.xlabel ? 40 : 26;
  const pw = W - left - right, ph = H - top - bottom;
  const flat = vals.flat();
  if (opts.refLines) for (const r of opts.refLines) flat.push(r.x);
  flat.push(0);
  const xlim = opts.xlim || padRange(finiteRange(flat), 0.08);
  const X = x => left + (x - xlim[0]) / (xlim[1] - xlim[0]) * pw;
  // axis ticks
  const xt = niceTicks(xlim[0], xlim[1], 6);
  ctx.strokeStyle = '#eceef2';
  for (const t of xt.ticks) { ctx.beginPath(); ctx.moveTo(X(t), top); ctx.lineTo(X(t), top + ph); ctx.stroke(); }
  ctx.fillStyle = '#3a3a40'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of xt.ticks) ctx.fillText(tickLabel(t, xt.step), X(t), top + ph + 5);
  ctx.strokeStyle = '#9a9aa2'; ctx.strokeRect(left + 0.5, top + 0.5, pw, ph);
  const n = labels.length;
  const rowH = ph / Math.max(1, n);
  const barH = Math.max(2, (rowH * 0.75) / groups);
  const vf = opts.valueFmt || (v => fmt(v, 3));
  for (let i = 0; i < n; i++) {
    const yRow = top + i * rowH + rowH / 2;
    ctx.fillStyle = '#1d1d1f'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(labels[i]), left - 8, yRow);
    for (let g = 0; g < groups; g++) {
      const v = vals[i][g];
      if (!Number.isFinite(v)) continue;
      const color = typeof opts.colorFn === 'function' ? opts.colorFn(v, i, g)
        : (opts.colors && opts.colors[g]) || palette.series[g % palette.series.length];
      const y = yRow - (groups * barH) / 2 + g * barH;
      const x0 = X(Math.max(xlim[0], Math.min(0, v))), x1 = X(Math.min(xlim[1], Math.max(0, v)));
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(X(v), y + barH / 2, Math.max(2, Math.min(4, barH / 3)), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a3a40'; ctx.textBaseline = 'middle';
      if (v >= 0) { ctx.textAlign = 'left'; ctx.fillText(vf(v), x1 + 4, y + barH / 2); }
      else { ctx.textAlign = 'right'; ctx.fillText(vf(v), x0 - 4, y + barH / 2); }
    }
  }
  // zero line
  if (xlim[0] < 0 && xlim[1] > 0) { ctx.strokeStyle = '#6b6b6b'; ctx.beginPath(); ctx.moveTo(X(0), top); ctx.lineTo(X(0), top + ph); ctx.stroke(); }
  if (opts.refLines) for (const r of opts.refLines) {
    ctx.strokeStyle = r.color || palette.red; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(X(r.x), top); ctx.lineTo(X(r.x), top + ph); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1;
    if (r.label) { ctx.fillStyle = r.color || palette.red; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(r.label, X(r.x) + 4, top + 3); }
  }
  ctx.fillStyle = '#1d1d1f';
  if (opts.title) { ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(opts.title, left, 8); ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'; }
  if (opts.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xlabel, left + pw / 2, H - 4); }
  if (opts.groupLabels && groups > 1) {
    let x = left + 4, y = top + ph - 10;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    opts.groupLabels.forEach((gl, g) => {
      const color = (opts.colors && opts.colors[g]) || palette.series[g % palette.series.length];
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 6, y, 3.5, 0, Math.PI * 2); ctx.fill(); x += 16;
      ctx.fillStyle = '#1d1d1f'; ctx.fillText(gl, x, y); x += ctx.measureText(gl).width + 14;
    });
  }
  return { ctx, X, xlim };
}

// ---------- colormaps ----------

const VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
const COOLWARM = [[59, 76, 192], [141, 176, 254], [221, 221, 221], [245, 156, 125], [180, 4, 38]];

export function colormap(name = 'viridis') {
  const anchors = name === 'coolwarm' ? COOLWARM : VIRIDIS;
  return t => {
    const u = Math.max(0, Math.min(1, t)) * (anchors.length - 1);
    const i = Math.min(anchors.length - 2, Math.floor(u));
    const f = u - i;
    const a = anchors[i], b = anchors[i + 1];
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
  };
}

// ---------- marching squares ----------
// xs: length nx, ys: length ny, Z[j][i] (row j over ys, column i over xs). Returns segments [[x1,y1,x2,y2], ...]
export function contourLines(xs, ys, Z, level) {
  const segs = [];
  const nx = xs.length, ny = ys.length;
  const lerp = (xa, xb, za, zb) => (zb === za ? 0.5 * (xa + xb) : xa + (level - za) / (zb - za) * (xb - xa));
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const z00 = Z[j][i], z10 = Z[j][i + 1], z01 = Z[j + 1][i], z11 = Z[j + 1][i + 1];
      if (![z00, z10, z01, z11].every(Number.isFinite)) continue;
      const idx = (z00 >= level ? 1 : 0) | (z10 >= level ? 2 : 0) | (z11 >= level ? 4 : 0) | (z01 >= level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      // edge points: bottom (between 00 and 10), right (10-11), top (01-11), left (00-01)
      const pb = [lerp(x0, x1, z00, z10), y0];
      const pr = [x1, lerp(y0, y1, z10, z11)];
      const pt = [lerp(x0, x1, z01, z11), y1];
      const pl = [x0, lerp(y0, y1, z00, z01)];
      const add = (p, q) => segs.push([p[0], p[1], q[0], q[1]]);
      switch (idx) {
        case 1: case 14: add(pl, pb); break;
        case 2: case 13: add(pb, pr); break;
        case 3: case 12: add(pl, pr); break;
        case 4: case 11: add(pr, pt); break;
        case 5: add(pl, pt); add(pb, pr); break;
        case 6: case 9: add(pb, pt); break;
        case 7: case 8: add(pl, pt); break;
        case 10: add(pl, pb); add(pr, pt); break;
        default: break;
      }
    }
  }
  return segs;
}

// ---------- heatmap with contours, masks and overlay points ----------
// xs, ys: axis sample arrays (monotonic); Z[j][i]. NaN cells are drawn as light gray.
// opts: { title, xlabel, ylabel, zlabel, zlim, cmap: 'viridis'|'coolwarm', colorbar (default true),
//         contours: [{ levels: number[], color, width, dash, labels (bool) }],
//         mask: boolean[][] (true = hatched, e.g. infeasible),
//         overlays: [{ x, y, label, color, shape: 'circle'|'star'|'square'|'cross', size }] }
export function heatmap(canvas, xs, ys, Z, opts = {}) {
  const { ctx, W, H } = setupCanvas(canvas);
  const colorbar = opts.colorbar !== false;
  const left = 62, right = colorbar ? 86 : 16, top = opts.title ? 30 : 14, bottom = opts.xlabel ? 44 : 30;
  const frame = { left, top, pw: W - left - right, ph: H - top - bottom, W, H };
  const nx = xs.length, ny = ys.length;
  const edges = arr => {
    const e = new Array(arr.length + 1);
    for (let i = 1; i < arr.length; i++) e[i] = 0.5 * (arr[i - 1] + arr[i]);
    e[0] = arr.length > 1 ? arr[0] - 0.5 * (arr[1] - arr[0]) : arr[0] - 0.5;
    e[arr.length] = arr.length > 1 ? arr[arr.length - 1] + 0.5 * (arr[arr.length - 1] - arr[arr.length - 2]) : arr[0] + 0.5;
    return e;
  };
  const xe = edges(xs), ye = edges(ys);
  const xlim = opts.xlim || [xe[0], xe[nx]];
  const ylim = opts.ylim || [ye[0], ye[ny]];
  const flat = [];
  for (const row of Z) for (const v of row) if (Number.isFinite(v)) flat.push(v);
  const zlim = opts.zlim || finiteRange(flat);
  if (!Number.isFinite(zlim[0])) { zlim[0] = 0; zlim[1] = 1; }
  if (zlim[1] === zlim[0]) zlim[1] = zlim[0] + 1;
  const cmap = colormap(opts.cmap || 'viridis');
  const { X, Y } = drawAxes(ctx, frame, xlim, ylim, Object.assign({}, opts, { grid: false }));
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, frame.pw, frame.ph); ctx.clip();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = Z[j][i];
      const x0 = X(xe[i]), x1 = X(xe[i + 1]);
      const y0 = Y(ye[j + 1]), y1 = Y(ye[j]);
      ctx.fillStyle = Number.isFinite(v) ? cmap((v - zlim[0]) / (zlim[1] - zlim[0])) : '#e4e4e8';
      ctx.fillRect(Math.min(x0, x1) - 0.5, Math.min(y0, y1) - 0.5, Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1);
    }
  }
  if (opts.mask) {
    ctx.strokeStyle = 'rgba(40,40,40,0.55)'; ctx.lineWidth = 1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!opts.mask[j] || !opts.mask[j][i]) continue;
      const x0 = X(xe[i]), x1 = X(xe[i + 1]), y0 = Y(ye[j + 1]), y1 = Y(ye[j]);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y0); ctx.stroke();
    }
  }
  if (opts.contours) for (const c of opts.contours) {
    ctx.strokeStyle = c.color || '#ffffff'; ctx.lineWidth = c.width || 1.5; ctx.setLineDash(c.dash || []);
    for (const lv of c.levels) {
      const segs = contourLines(xs, ys, Z, lv);
      ctx.beginPath();
      for (const s of segs) { ctx.moveTo(X(s[0]), Y(s[1])); ctx.lineTo(X(s[2]), Y(s[3])); }
      ctx.stroke();
      if (c.labels && segs.length) {
        const s = segs[Math.floor(segs.length / 2)];
        ctx.fillStyle = c.color || '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(fmt(lv, 3), X(s[0]) + 3, Y(s[1]) - 2);
      }
    }
    ctx.setLineDash([]);
  }
  if (opts.overlays) for (const o of opts.overlays) {
    const r = o.size || 7;
    const cx = X(o.x), cy = Y(o.y);
    ctx.fillStyle = o.color || '#ffffff'; ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (o.shape === 'square') ctx.rect(cx - r, cy - r, 2 * r, 2 * r);
    else if (o.shape === 'star') { for (let k = 0; k < 10; k++) { const ang = -Math.PI / 2 + k * Math.PI / 5; const rr = k % 2 ? r * 0.45 : r; ctx.lineTo(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)); } ctx.closePath(); }
    else if (o.shape === 'cross') { ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy - r); }
    else ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (o.shape !== 'cross') ctx.fill();
    ctx.stroke();
    if (o.label) { ctx.fillStyle = '#1d1d1f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(o.label, cx + r + 4, cy); }
  }
  ctx.restore();
  if (colorbar) {
    const cbx = left + frame.pw + 14, cbw = 14;
    for (let k = 0; k < frame.ph; k++) {
      const t = 1 - k / frame.ph;
      ctx.fillStyle = cmap(t);
      ctx.fillRect(cbx, top + k, cbw, 1.5);
    }
    ctx.strokeStyle = '#9a9aa2'; ctx.strokeRect(cbx + 0.5, top + 0.5, cbw, frame.ph);
    const zt = niceTicks(zlim[0], zlim[1], 5);
    ctx.fillStyle = '#3a3a40'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const t of zt.ticks) {
      const y = top + frame.ph - (t - zlim[0]) / (zlim[1] - zlim[0]) * frame.ph;
      if (y < top - 1 || y > top + frame.ph + 1) continue;
      ctx.beginPath(); ctx.moveTo(cbx + cbw, y); ctx.lineTo(cbx + cbw + 3, y); ctx.stroke();
      ctx.fillText(tickLabel(t, zt.step), cbx + cbw + 5, y);
    }
    if (opts.zlabel) {
      ctx.save(); ctx.translate(W - 8, top + frame.ph / 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#1d1d1f';
      ctx.fillText(opts.zlabel, 0, 0); ctx.restore();
    }
  }
  return { ctx, X, Y, xlim, ylim, zlim, frame };
}

// ---------- export helpers ----------

export function downloadCSV(filename, rows) {
  const text = rows.map(r => r.map(v => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v))).join(',')).join('\n');
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadPNG(canvas, filename) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png'); a.download = filename; a.click();
}

// ---------- small numeric helpers shared by modules ----------

export function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a + (b - a) * i / (n - 1);
  return out;
}

// Deterministic seeded PRNG (mulberry32) so demos are reproducible.
export function makeRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
