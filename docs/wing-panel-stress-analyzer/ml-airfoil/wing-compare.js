/* Finite-wing comparison data helpers: panel-centroid interpolation, matched-point errors, spanwise loads.
   Pure functions over the recorded benchmark records (wing-comparison/benchmarks.json). No DOM. */
(function (root) {
  'use strict';
  function interp(points, x) {
    if (!points || !points.length || x < points[0][0] || x > points[points.length - 1][0]) return null;
    let i = 0;
    while (i < points.length - 2 && points[i + 1][0] < x) i++;
    const a = points[i], b = points[i + 1];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  }
  // Cp of a recorded or fresh panel solve at (eta, surface, x/c): linear in chord inside each strip row, linear between strip rows.
  function pressure(panel, eta, surface, x) {
    const rows = panel.result.chordwise, L = panel.geometry.semiSpan, ys = rows.map(r => r.y_mm / L);
    if (eta < ys[0] || eta > ys[ys.length - 1]) return null;
    let j = 0;
    while (j < rows.length - 2 && ys[j + 1] < eta) j++;
    const a = interp(rows[j][surface], x), b = interp(rows[j + 1][surface], x);
    return a == null || b == null ? null : a + (b - a) * (eta - ys[j]) / (ys[j + 1] - ys[j]);
  }
  // Mean absolute Cp error of panel and ML on the measured points the panel mesh covers; nothing is extrapolated.
  function errors(c, p) {
    const matched = c.reference.points.map(q => ({ q, v: pressure(p, q.eta, q.surface === 'U' ? 'upper' : 'lower', q.x) })).filter(r => r.v !== null);
    if (!matched.length) return { n: 0, panel: null, ml: null, excluded: c.reference.points.length };
    const mean = f => matched.reduce((s, r) => s + f(r), 0) / matched.length;
    return { n: matched.length, excluded: c.reference.points.length - matched.length, panel: mean(r => Math.abs(r.v - r.q.cp)), ml: mean(r => Math.abs(r.q.lwmMean - r.q.cp)) };
  }
  // Section lift along the span: LWM stations carry cl and clStd; panel strips carry cl at the strip midpoint.
  function spanLoads(c, p) {
    const L = p.geometry.semiSpan;
    return {
      lwm: c.lwm.stations.map(s => ({ eta: s.eta, cl: s.cl, std: s.clStd })),
      panel: p.result.strips.map(s => ({ eta: s.yMid / L, cl: s.cl })),
    };
  }
  // Two-sigma coverage of measured Cp samples by the ML band at the same points.
  function coverage(c) {
    const pts = c.reference.points;
    const inside = pts.filter(q => Math.abs(q.lwmMean - q.cp) <= 2 * q.lwmStd).length;
    return { n: pts.length, inside, percent: 100 * inside / pts.length };
  }
  const api = { interp, pressure, errors, spanLoads, coverage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WingCompare = api;
})(typeof window !== 'undefined' ? window : globalThis);
