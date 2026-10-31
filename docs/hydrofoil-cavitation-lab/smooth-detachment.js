/* Release adaptation: pressure admission is mandatory with zero allowance.
 * Original source and SHA256 are recorded in validation/bem-source-provenance.json.
 * Root equations and all solution samples are unchanged. */
/* smooth-detachment.js 0.1.0-research — Brillouin–Villat (smooth-detachment) outer solve
 * for Hydrofoil Cavitation Lab 0.3.0.  SEPARATE MODULE: it never edits, patches or
 * re-implements cavitation.js.  It only calls HydrofoilCavitation.iterate() with different
 * detachment stations, so the fixed-detachment legacy and smooth-contact modes are untouched.
 *
 * Mathematics (see NOTES.md, section 2):
 *   Near a detachment point D on a SMOOTH wall, every bounded free-streamline solution has
 *     wall (upstream, s<0):   q/qc = 1 + beta*sqrt(qc*|s|) + O(|s|)
 *     cavity (downstream):    h_n  = (2/3)*beta*sqrt(qc)*s^(3/2) + O(s^2)
 *   with ONE free coefficient beta.  beta>0: wetted speed above qc (pressure below vapour
 *   pressure) ahead of D -> D lies downstream of the smooth point.  beta<0: the free surface
 *   turns into the wall (negative gap ~ s^1.5) -> D lies upstream.  Brillouin–Villat: beta=0.
 *   The slope h_x(D) is zero for EVERY beta (h ~ s^1.5), so "start tangency" cannot select D.
 *
 * Unknowns at prescribed cavity length l (x_E = x_D + l), lambda, nu:
 *   per shape: N+3 linear unknowns/rows of the published mixed BIE (velocity-Kutta form);
 *   inner fixed point: m-1 free node heights + qc  <->  m kinematic rows (closure row);
 *   outer: A <-> h_x(x_E)=0 (published smooth-contact search), x_D <-> beta(x_D)=0 (this file).
 *   sigma = qc^2-1 is an output.  inner:'fixed-recovery' keeps A prescribed instead; the
 *   closure is then generally singular (end angle grows with N) and is labelled as such.
 */
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const api = factory(isNode ? require('./cavitation.js') : root.HydrofoilCavitation);
  if (isNode) module.exports = api; else root.SmoothDetachment = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, function (H) {
  'use strict';
  const VERSION = '0.1.1-strict-research';
  if (!H || typeof H.iterate !== 'function') throw new Error('HydrofoilCavitation (cavitation.js) must be loaded first.');

  function lstsq(rows, y) {
    const n = rows[0].length, sc = new Array(n).fill(0);
    for (const r of rows) for (let j = 0; j < n; j++) sc[j] = Math.max(sc[j], Math.abs(r[j]));
    const A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
    rows.forEach((r, i) => { const rr = r.map((v, j) => v / sc[j]); for (let a = 0; a < n; a++) { b[a] += rr[a] * y[i]; for (let c = 0; c < n; c++) A[a][c] += rr[a] * rr[c]; } });
    for (let k = 0; k < n; k++) {
      let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
      [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]];
      if (!(Math.abs(A[k][k]) > 1e-300)) throw new Error('Singular regularity fit.');
      for (let i = k + 1; i < n; i++) { const f = A[i][k] / A[k][k]; for (let j = k; j < n; j++) A[i][j] -= f * A[k][j]; b[i] -= f * b[k]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let v = b[i]; for (let j = i + 1; j < n; j++) v -= A[i][j] * x[j]; x[i] = v / A[i][i]; }
    return x.map((v, j) => v / sc[j]);
  }

  // beta estimators from a published result object (no solver internals are used).
  // Samples are restricted to a PHYSICAL window |s| <= frac * (arclength from D to the
  // wetted stagnation point); at least minSamples panels/nodes are always used and the
  // estimate is flagged unresolved if the window holds fewer than minSamples samples.
  function stagnationArc(result, first) {
    const P = result.panels, pts = result.original; let s = 0, sgn0 = Math.sign(P[first + 1].tangentialSpeed);
    for (let j = first + 1; j < P.length; j++) {
      const a = pts[j], b = pts[j + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (Math.sign(P[j].tangentialSpeed) !== sgn0) return s; s += L;
    }
    return s;
  }
  function regularity(result, frac = 0.25, minSamples = 4) {
    const P = result.panels, qc = result.cavitySpeedRatio, pts = result.original;
    const ids = []; P.forEach((p, i) => { if (p.cavity) ids.push(i); });
    if (!ids.length) throw new Error('Result has no cavity panels.');
    const first = Math.max(...ids), sStag = stagnationArc(result, first), delta = frac * sStag;
    let s = 0; const wet = [];
    for (let j = first + 1; j < P.length - 1; j++) {
      const a = pts[j], b = pts[j + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), mid = s + L / 2; s += L;
      if (mid > delta && wet.length >= minSamples) break;
      wet.push({ s: mid, x: P[j].x, excess: Math.abs(P[j].tangentialSpeed) / qc - 1, cp: P[j].cp });
    }
    const cw = lstsq(wet.map(w => [Math.sqrt(qc * w.s), w.s]), wet.map(w => w.excess));
    // Cavity side (PRIMARY estimator): the first minSamples free nodes after D.  Resolved if
    // they lie within 5% of the cavity arclength, i.e. inside the local s^(3/2) regime.
    const Hh = result.height, cav = []; let sc = 0;
    for (let k = 1; k <= minSamples && k < Hh.length - 1; k++) {
      const x0 = Hh[k - 1].x, x1 = Hh[k].x, y0 = Hh[k - 1].y - Hh[k - 1].h, y1 = Hh[k].y - Hh[k].h;
      const ds = Math.hypot(x1 - x0, y1 - y0); sc += ds;
      cav.push({ s: sc, x: x1, hn: Hh[k].h * Math.abs(x1 - x0) / ds });
    }
    let cavArc = 0; for (let k = 1; k < Hh.length; k++) { const y0 = Hh[k - 1].y - Hh[k - 1].h, y1 = Hh[k].y - Hh[k].h; cavArc += Math.hypot(Hh[k].x - Hh[k - 1].x, y1 - y0); }
    const cc = lstsq(cav.map(c => [(2 / 3) * Math.sqrt(qc) * Math.pow(c.s, 1.5), c.s * c.s]), cav.map(c => c.hn));
    const resolved = cav.length >= minSamples && cav[cav.length - 1].s <= 0.05 * cavArc;
    const wetResolved = wet.filter(w => w.s <= delta).length >= minSamples;
    return { frac, delta, stagnationArc: sStag, resolved, wetResolved, cavityWindowOverArc: cav[cav.length - 1].s / cavArc, betaWet: cw[0], betaCav: cc[0], betaMean: 0.5 * (cw[0] + cc[0]),
      maxWetSpeedExcessNearD: Math.max(...wet.map(w => w.excess)), minNormalGapNearD: Math.min(...cav.map(c => c.hn)),
      wetSamples: wet.length, cavitySamples: cav.length, wet, cav };
  }

  // Raw wetted-pressure margin: largest amount by which a WETTED panel's Cp lies below -sigma.
  function wettedPressureMargin(result) {
    const P = result.panels, pts = result.original; let iLE = 0;
    pts.forEach((p, i) => { if (p[0] < pts[iLE][0]) iLE = i; });
    const ids = []; P.forEach((p, i) => { if (p.cavity) ids.push(i); });
    const first = Math.max(...ids), last = Math.min(...ids); let worst = -Infinity, at = null;
    P.forEach((p, i) => {
      if (p.cavity) return; const v = -p.cp - result.sigma;
      if (v > worst) { worst = v; at = { index: i, x: p.x, y: p.y, region: i >= iLE ? 'lower surface' : i > first ? 'upper surface upstream of detachment' : i < last ? 'upper surface downstream of closure' : 'cavity' }; }
    });
    return { maxBelowVapour: worst, at };
  }

  function startSlope(height) { // the degenerate proxy, reported only
    const p = height.slice(0, 3), x0 = p[0].x, scl = Math.max(...p.map(v => Math.abs(v.x - x0))), t = p.map(v => (v.x - x0) / scl);
    let d = 0;
    for (let j = 0; j < 3; j++) {
      let den = 1, num = 0; for (let k = 0; k < 3; k++) if (k !== j) den *= t[j] - t[k];
      for (let m = 0; m < 3; m++) if (m !== j) { let term = 1; for (let k = 0; k < 3; k++) if (k !== j && k !== m) term *= -t[k]; num += term; }
      d += p[j].h * num / den / scl;
    }
    return d;
  }

  function settings(ad = {}) {
    const o = { xdMin: 0.002, xdMax: 0.15, tolBeta: 0.02, tolX: 2e-4, windowFraction: 0.25, minSamples: 4, estimator: 'cavity', maxEvaluations: 16,
      inner: 'smooth-contact', initialStep: null, pressureTolerance: 0, ...ad };
    if (!['mean', 'cavity', 'wet'].includes(o.estimator)) throw new Error('estimator must be mean, cavity or wet.');
    if (!['smooth-contact', 'fixed-recovery'].includes(o.inner)) throw new Error('inner must be smooth-contact or fixed-recovery.');
    if (!(o.xdMin >= 0.002 && o.xdMax <= 0.15 && o.xdMin < o.xdMax)) throw new Error('Detachment search range must lie in the published range 0.002-0.15.');
    if (!(o.tolBeta > 0 && o.tolBeta <= 0.05 && o.tolX > 0 && o.tolX <= 2e-3)) throw new Error('Use 0 < tolBeta <= 0.05 and 0 < tolX <= 0.002.');
    if (!(o.windowFraction >= 0.1 && o.windowFraction <= 0.5) || !Number.isInteger(o.minSamples) || o.minSamples < 3 || o.minSamples > 8) throw new Error('Use windowFraction 0.1-0.5 and minSamples 3-8.');
    if (!Number.isInteger(o.maxEvaluations) || o.maxEvaluations < 4 || o.maxEvaluations > 40) throw new Error('Use 4-40 detachment evaluations.');
    if (o.pressureTolerance !== 0) throw new Error('Published research mode retains the zero-allowance wetted-pressure screen.');
    return o;
  }
  const pick = (e, est) => est === 'cavity' ? e.betaCav : est === 'wet' ? e.betaWet : e.betaMean;

  function* iterate(input = {}, ad = {}) {
    const o = settings(ad), trace = [], cache = new Map();
    const baseInput = { ...input, closureMode: o.inner, kuttaCondition: input.kuttaCondition ?? 'velocity' };
    let guessA = baseInput.attenuation ?? 0.3;
    function* evaluate(xd) {
      xd = Math.min(o.xdMax, Math.max(o.xdMin, xd));
      const key = xd.toPrecision(12); if (cache.has(key)) return cache.get(key);
      if (trace.length >= o.maxEvaluations) return null;
      const entry = { evaluation: trace.length + 1, detachment: xd, status: 'running' }; trace.push(entry);
      try {
        const it = H.iterate({ ...baseInput, detachment: xd, attenuation: guessA }); let step;
        do { step = it.next(); if (!step.done) yield { ...step.value, phase: 'detachment-search', detachmentEvaluation: entry.evaluation, detachment: xd }; } while (!step.done);
        const r = step.value, reg = [[0.5 * o.windowFraction, o.minSamples], [o.windowFraction, o.minSamples + 1], [Math.min(0.5, 1.5 * o.windowFraction), o.minSamples + 2]].map(([f, k]) => regularity(r, f, k));
        const e = reg[1], A = r.closure ? r.closure.selectedAttenuation : baseInput.attenuation;
        if (r.status === 'converged-prototype' && Number.isFinite(A)) guessA = A;
        Object.assign(entry, { status: r.status, reason: r.reason, sigma: r.sigma, attenuation: A,
          betaWet: e.betaWet, betaCav: e.betaCav, betaMean: e.betaMean, beta: pick(e, o.estimator), regularityResolved: e.resolved, window: { delta: e.delta, stagnationArc: e.stagnationArc, wetSamples: e.wetSamples, cavitySamples: e.cavitySamples, cavityWindowOverArc: e.cavityWindowOverArc, wetResolved: e.wetResolved },
          betaSpreadWindow: Math.max(...reg.map(q => pick(q, o.estimator))) - Math.min(...reg.map(q => pick(q, o.estimator))),
          startSlope3: startSlope(r.height), minimumGap: r.metrics.minimumHeight,
          wettedPressure: wettedPressureMargin(r), endpointGapSlope: r.metrics.endpointGapSlope ?? null });
        const value = { xd, beta: entry.beta, entry, result: r, reg };
        cache.set(key, value); return value;
      } catch (err) { Object.assign(entry, { status: 'error', reason: err.message }); cache.set(key, null); return null; }
    }
    // 1. Start at the user's station and march in the direction indicated by the sign of beta.
    let a = yield* evaluate(input.detachment ?? 0.01), b = null;
    if (!a) throw new Error('The starting detachment station could not be evaluated: ' + trace[0].reason);
    const dir = a.beta > 0 ? -1 : 1;
    let step = o.initialStep ?? Math.max(0.002, 0.3 * a.xd);
    while (trace.length < o.maxEvaluations) {
      const next = Math.min(o.xdMax, Math.max(o.xdMin, a.xd + dir * step));
      if (Math.abs(next - a.xd) < 1e-12) break;
      const v = yield* evaluate(next);
      if (!v) { step *= 0.5; if (step < o.tolX) break; continue; }
      if (v.beta * a.beta <= 0) { b = v; break; }
      a = v; step *= 1.8;
    }
    let lo = null, hi = null;
    if (b) { [lo, hi] = a.xd < b.xd ? [a, b] : [b, a]; }
    // 2. Illinois (modified regula falsi) on beta(x_D); every evaluation is retained.
    let root = null;
    if (lo && hi) {
      let fa = lo.beta, fb = hi.beta, kept = 0;
      while (trace.length < o.maxEvaluations) {
        const w = hi.xd - lo.xd;
        let c = (lo.xd * fb - hi.xd * fa) / (fb - fa);
        c = Math.min(hi.xd - 0.05 * w, Math.max(lo.xd + 0.05 * w, c));
        let v = yield* evaluate(c);
        if (!v) { v = yield* evaluate(0.5 * (lo.xd + hi.xd)); if (!v) break; }
        root = v;
        if (v.beta * lo.beta <= 0) { hi = v; fb = v.beta; if (kept === 1) fa *= 0.5; kept = 1; }
        else { lo = v; fa = v.beta; if (kept === -1) fb *= 0.5; kept = -1; }
        if (Math.abs(v.beta) <= 0.5 * o.tolBeta || hi.xd - lo.xd <= o.tolX) break;
      }
    }
    // 3. Estimator interval: roots of beta_cav and beta_wet inside the final bracket (linear).
    const interp = (f) => (lo && hi && f(lo.entry) * f(hi.entry) <= 0) ? lo.xd - f(lo.entry) * (hi.xd - lo.xd) / (f(hi.entry) - f(lo.entry)) : null;
    const estimatorRoots = { cavity: interp(e => e.betaCav), wet: interp(e => e.betaWet), mean: interp(e => e.betaMean) };
    const evals = [...cache.values()].filter(Boolean);
    // The ROOT evaluation is the candidate.  Stations that merely satisfy |beta| <= tolBeta away
    // from the root are listed (admissibleWithinTolerance) but never substituted for the root.
    const admissibleWithinTolerance = evals.filter(v => v.result.status === 'converged-prototype' && Math.abs(v.beta) <= o.tolBeta && v.entry.regularityResolved)
      .map(v => ({ detachment: v.xd, beta: v.beta, sigma: v.result.sigma, attenuation: v.entry.attenuation }));
    const chosen = root || evals.sort((p, q) => Math.abs(p.beta) - Math.abs(q.beta))[0];
    if (!chosen) throw new Error('No detachment station could be evaluated.');
    const r = chosen.result, e = chosen.entry, wp = e.wettedPressure;
    const innerOK = r.status === 'converged-prototype';
    const betaOK = Math.abs(e.beta) <= o.tolBeta;
    const resolvedOK = e.regularityResolved;
    const pressOK = wp.maxBelowVapour <= 0;
    // Conditioning of the detachment location: d(beta)/d(x_D) from the final bracket.
    const slope = lo && hi && hi.xd > lo.xd ? (hi.beta - lo.beta) / (hi.xd - lo.xd) : null;
    const rootEstimate = estimatorRoots[o.estimator === 'cavity' ? 'cavity' : o.estimator] ?? (root ? root.xd : null);
    const xdUncertainty = slope ? o.tolBeta / Math.abs(slope) : null;
    const warnings = [];
    if (xdUncertainty !== null && xdUncertainty > 10 * o.tolX) warnings.push(`WEAKLY_DETERMINED_DETACHMENT: |dbeta/dx_D| = ${Math.abs(slope).toFixed(3)} per chord, so |beta| <= ${o.tolBeta} only fixes x_D to +/- ${xdUncertainty.toFixed(4)} c.`);
    if (rootEstimate !== null && Math.abs(chosen.xd - rootEstimate) > o.tolX) warnings.push(`SELECTED_STATION_NOT_AT_ROOT: selected x_D=${chosen.xd.toFixed(5)}, interpolated beta root ${rootEstimate.toFixed(5)}.`);
    if (chosen.xd >= o.xdMax - 1e-12 || chosen.xd <= o.xdMin + 1e-12) warnings.push('SELECTED_STATION_AT_SEARCH_LIMIT');
    if (wp.maxBelowVapour > 0) warnings.push(`WETTED_CP_BELOW_MINUS_SIGMA by ${wp.maxBelowVapour.toFixed(4)} at x=${wp.at.x.toFixed(4)} (${wp.at.region}); must decrease under mesh refinement to be a junction discretization error.`);
    let code = 'ADMITTED';
    if (!b) code = 'NO_BV_BRACKET';
    else if (!betaOK) code = 'BV_TOLERANCE_NOT_MET';
    else if (!resolvedOK) code = 'REGULARITY_UNRESOLVED';
    else if (!innerOK) code = 'BV_ROOT_INNER_REJECTED';
    else if (pressOK !== true) code = 'WETTED_PRESSURE_BELOW_VAPOUR';
    const admitted = code === 'ADMITTED';
    return { ...r, status: admitted ? 'converged-prototype' : 'rejected', code,
      reason: admitted ? 'Inner cavity equations, closure regularity and Brillouin–Villat detachment regularity converged.' : ({
        NO_BV_BRACKET: 'No sign change of the detachment-regularity coefficient beta was found in the allowed detachment range; no smooth-detachment state is admitted.',
        BV_TOLERANCE_NOT_MET: 'A beta bracket was found but |beta| did not meet the tolerance within the evaluation budget.',
        REGULARITY_UNRESOLVED: 'Fewer than minSamples panels lie inside the physical regularity window; refine the mesh.',
        BV_ROOT_INNER_REJECTED: 'At the Brillouin–Villat station the inner closure/geometry gates were not met: ' + r.reason,
        WETTED_PRESSURE_BELOW_VAPOUR: 'A wetted panel has Cp below -sigma by more than the declared pressure tolerance.' })[code],
      detachment: { mode: 'brillouin-villat', version: VERSION, selected: chosen.xd, rootEstimate, admissibleWithinTolerance, dBetaDxD: slope, xdUncertainty, warnings, beta: e.beta, betaWet: e.betaWet, betaCav: e.betaCav, regularityResolved: e.regularityResolved, window: e.window,
        betaWindowSpread: e.betaSpreadWindow, estimator: o.estimator, estimatorRoots, bracket: lo && hi ? [lo.xd, hi.xd] : null,
        startSlope3: e.startSlope3, wettedPressure: wp, innerStatus: r.status, innerReason: r.reason, trace, settings: o,
        equationCount: `${r.panels.length + 3} linear unknowns/rows per (shape, A, x_D) [velocity Kutta]; inner: m-1 node heights + qc <-> m kinematic rows with end-height closure; outer: ${o.inner === 'smooth-contact' ? 'A <-> h_x(x_E)=0 and ' : 'A prescribed (closure generally singular) and '}x_D <-> beta(x_D)=0; sigma output.`,
        note: 'beta is the coefficient of the square-root term of the wetted speed / s^1.5 gap term at detachment; h_x(x_D) vanishes for every beta and is reported only as a degenerate proxy.' } };
  }
  function solve(input = {}, ad = {}) { const it = iterate(input, ad); let s; do { s = it.next(); } while (!s.done); return s.value; }
  // Continuation: march one input parameter (e.g. 'length', 'alpha' or 'resolution'), starting each
  // solve at the previous Brillouin-Villat station and recovery amplitude with a reduced first step.
  // Every station's full result (admitted or rejected) is returned; nothing is skipped or smoothed.
  function* continuation(baseInput, parameter, values, ad = {}) {
    const results = []; let xd = baseInput.detachment ?? 0.01, A = baseInput.attenuation ?? 0.3, step = ad.initialStep ?? null;
    for (const value of values) {
      const input = { ...baseInput, [parameter]: value, detachment: xd, attenuation: A };
      const it = iterate(input, { ...ad, initialStep: step }); let st;
      do { st = it.next(); if (!st.done) yield { ...st.value, phase: 'continuation', parameter, value }; } while (!st.done);
      const r = st.value, d = r.detachment; results.push({ parameter, value, status: r.status, code: r.code, detachment: d.selected, beta: d.beta, sigma: r.sigma,
        attenuation: r.closure ? r.closure.selectedAttenuation : A, xdUncertainty: d.xdUncertainty, warnings: d.warnings, result: r });
      if (Number.isFinite(d.rootEstimate)) xd = d.rootEstimate; else xd = d.selected;
      if (r.closure && Number.isFinite(r.closure.selectedAttenuation)) A = r.closure.selectedAttenuation;
      step = Math.max(4 * (ad.tolX ?? 2e-4), Math.min(0.01, 2 * (d.xdUncertainty ?? 0.002)));
    }
    return results;
  }
  function runContinuation(baseInput, parameter, values, ad = {}) { const it = continuation(baseInput, parameter, values, ad); let s; do { s = it.next(); } while (!s.done); return s.value; }
  return { VERSION, solve, iterate, continuation, runContinuation, regularity, wettedPressureMargin, startSlope, lstsq };
});
