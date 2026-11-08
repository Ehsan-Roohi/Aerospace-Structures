/* Prediction-service adapter for the Large Wing Model (LWM).
   The browser never runs LWM: a model-resident service (service/lwm_service.py) answers GET /domain and
   POST /predict. This client adds a per-session cache, domain gating, mean screening with full covariance
   only for the top candidates, and cold/warm timing. With no endpoint the client reports "offline" and the
   page shows recorded benchmarks only. The mock transport replays only the two recorded cases. */
(function (root) {
  'use strict';
  const ORDER = ['CLpressure', 'CmQuarter', 'rootBendingCoefficient', 'CLpaperNormalOnly'];
  const OBJECTIVES = {
    maxCL: { label: 'Maximize CL (full pressure projection)', score: m => m[0] },
    minAbsCm: { label: 'Minimize |Cm quarter-chord|', score: m => -Math.abs(m[1]) },
    minRootBending: { label: 'Minimize root-bending coefficient at CL >= target', score: m => -m[2] },
  };
  const r4 = v => { if (!Number.isFinite(v)) throw Error('Finite numeric inputs required'); return v; };
  function canonical(c) {
    return [String(c.section).trim().toUpperCase().replace(/\s+/g, ' '), r4(c.alphaDeg), r4(c.mach), r4(c.semiSpanOverChord), r4(c.taperRatio ?? 1), r4(c.sweepDeg ?? 0)].join('|');
  }
  function inRange(v, range) { return Array.isArray(range) && Number.isFinite(v) && v >= range[0] - 1e-9 && v <= range[1] + 1e-9; }
  function checkDomain(domain, c) {
    const reasons = [];
    if (!domain) return { ok: false, reasons: ['no domain description from the service'] };
    const d = domain.domain || {};
    const unknown = Object.keys(c).filter(k => !['id','section','alphaDeg','mach','semiSpanOverChord','taperRatio','sweepDeg'].includes(k));
    if (unknown.length) reasons.push('unsupported inputs: ' + unknown.join(', '));
    if (!inRange(c.alphaDeg, d.alphaDeg)) reasons.push('alpha ' + c.alphaDeg + ' outside ' + JSON.stringify(d.alphaDeg));
    if (!inRange(c.mach, d.mach)) reasons.push('Mach ' + c.mach + ' outside ' + JSON.stringify(d.mach));
    if (!inRange(c.semiSpanOverChord, d.semiSpanOverChord)) reasons.push('s/c ' + c.semiSpanOverChord + ' outside ' + JSON.stringify(d.semiSpanOverChord));
    if (!inRange(c.taperRatio ?? 1, d.taperRatio)) reasons.push('taper ' + (c.taperRatio ?? 1) + ' outside ' + JSON.stringify(d.taperRatio));
    if (!inRange(c.sweepDeg ?? 0, d.sweepDeg)) reasons.push('sweep ' + (c.sweepDeg ?? 0) + ' outside ' + JSON.stringify(d.sweepDeg));
    if (Array.isArray(d.sections) && !d.sections.some(s => s.toUpperCase().replace(/\s+/g, ' ') === String(c.section).toUpperCase().replace(/\s+/g, ' '))) reasons.push('section ' + c.section + ' not in the service list');
    if (domain.mock && !domain.recordedCases?.includes(canonical(c))) reasons.push('mock service replays recorded benchmarks only');
    return { ok: reasons.length === 0, reasons };
  }
  function validateResult(r, mode) {
    if (!r || !['ok','unavailable','out_of_domain'].includes(r.status)) throw Error('Invalid service status');
    if (r.status !== 'ok') return;
    if (JSON.stringify(r.integratedOrder) !== JSON.stringify(ORDER) || !Array.isArray(r.integratedMean) || r.integratedMean.length !== 4 || !r.integratedMean.every(Number.isFinite)) throw Error('Invalid integrated order or mean');
    if (mode !== 'full') return;
    const c = r.integratedCovariance;
    if (!Array.isArray(c) || c.length !== 4 || c.some(row => !Array.isArray(row) || row.length !== 4 || !row.every(Number.isFinite))) throw Error('Invalid covariance shape');
    const a=c.map(row=>row.slice()), tol=1e-10*Math.max(1e-30,...c.flat().map(Math.abs));
    for(let i=0;i<4;i++) for(let j=0;j<4;j++) if(Math.abs(c[i][j]-c[j][i])>tol) throw Error('Asymmetric covariance');
    for(let k=0;k<4;k++) {
      if(a[k][k]<-tol) throw Error('Non-positive-semidefinite covariance');
      if(a[k][k]<=tol) { for(let j=k+1;j<4;j++) if(Math.abs(a[j][k])>tol) throw Error('Non-positive-semidefinite covariance'); continue; }
      for(let i=k+1;i<4;i++) for(let j=i;j<4;j++) a[j][i]=a[i][j]=a[i][j]-a[i][k]*a[j][k]/a[k][k];
    }
    if(!Array.isArray(r.stations) || r.stations.some(s=>!Number.isFinite(s.eta)||s.eta<0||s.eta>1||!Number.isFinite(s.cl)||!Number.isFinite(s.clStd)||s.clStd<0)) throw Error('Invalid span uncertainty');
  }
  function createClient(opts) {
    const o = Object.assign({ endpoint: '', fetchImpl: typeof fetch === 'function' ? fetch.bind(globalThis) : null, transport: null, timeoutMs: 180000, now: () => Date.now() }, opts || {});
    const cache = new Map();
    const stats = { requests: 0, cacheHits: 0, coldLoadMs: null, warmMs: [], lastError: null };
    let domain = null, state = o.endpoint || o.transport ? 'idle' : 'offline';
    async function call(path, body) {
      stats.requests++;
      if (o.transport) return o.transport(path, body);
      if (!o.endpoint) throw new Error('No service endpoint configured.');
      const url = o.endpoint.replace(/\/$/, '') + path;
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeoutMs) : null;
      try {
        const res = await o.fetchImpl(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl && ctrl.signal } : { signal: ctrl && ctrl.signal });
        if (!res.ok) throw new Error('Service answered HTTP ' + res.status);
        return await res.json();
      } finally { if (timer) clearTimeout(timer); }
    }
    async function probe() {
      if (!o.endpoint && !o.transport) { state = 'offline'; return { state, domain: null }; }
      try {
        domain = await call('/domain');
        if (!domain || !domain.domain || !domain.model) throw new Error('Malformed /domain answer.');
        for(const k of ['alphaDeg','mach','semiSpanOverChord','taperRatio','sweepDeg']) { const r=domain.domain[k]; if(!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||r[0]>r[1]) throw Error('Invalid domain bounds'); }
        if(!Array.isArray(domain.domain.sections)||!domain.domain.sections.every(s=>typeof s==='string')) throw Error('Invalid section domain');
        cache.clear();
        state = domain.resident === false ? 'cold' : 'online';
        if (Number.isFinite(domain.coldLoadSeconds)) stats.coldLoadMs = 1000 * domain.coldLoadSeconds;
        return { state, domain };
      } catch (e) { state = 'error'; stats.lastError = e.message; domain = null; return { state, domain: null, error: e.message }; }
    }
    // mode 'mean': posterior means of the integrated quantities only. mode 'full': covariance and stations too.
    async function predict(cases, mode) {
      if (!['mean','full'].includes(mode) || !Array.isArray(cases) || cases.length > 500) throw Error('Invalid prediction request');
      if (!domain) await probe();
      if (state === 'offline' || state === 'error') return cases.map(() => ({status:'unavailable', reason:'service ' + state}));
      for (const c of cases) { const q=checkDomain(domain,c); if (!q.ok) throw Error(q.reasons.join('; ')); }
      const out = new Array(cases.length), ask = [];
      cases.forEach((c, i) => {
        const key = canonical(c), hit = cache.get(key);
        if (hit && (hit[mode] || (mode === 'mean' && hit.full))) { stats.cacheHits++; out[i] = Object.assign({}, hit.full || hit.mean, { cacheHit: true }); }
        else ask.push({ i, c, key });
      });
      if (ask.length) {
        const t0 = o.now();
        const res = await call('/predict', { mode, cases: ask.map(a => Object.assign({}, a.c, { id: a.key })) });
        const dt = o.now() - t0;
        if (res && res.timing && Number.isFinite(res.timing.coldLoadMs)) stats.coldLoadMs = res.timing.coldLoadMs; else stats.warmMs.push(dt);
        if (!Array.isArray(res.results) || res.results.length !== ask.length) throw Error('Incomplete service response');
        const byId = new Map(res.results.map(r => [r.id, r]));
        for (const r of res.results) validateResult(r, mode);
        if (state === 'cold' || state === 'idle') state = 'online';
        for (const a of ask) {
          const r = byId.get(a.key) || { status: 'unavailable', reason: 'no answer for this candidate' };
          const rec = Object.assign({ cacheHit: false, roundTripMs: dt }, r);
          if (r.status === 'ok') { const slot = cache.get(a.key) || {}; slot[mode] = rec; cache.set(a.key, slot); }
          out[a.i] = rec;
        }
      }
      return out;
    }
    // Screen many candidates by posterior mean, then request full covariance for the top ones only.
    async function screen(candidates, options) {
      const s = Object.assign({ objective: 'maxCL', topK: 3, minCL: null, onProgress: () => {} }, options || {});
      if (!OBJECTIVES[s.objective] || !Number.isInteger(s.topK) || s.topK < 1 || s.topK > 10) throw Error('Invalid objective or top-k');
      if (s.objective === 'minRootBending' && !Number.isFinite(s.minCL)) throw Error('Finite lift target required');
      const obj = OBJECTIVES[s.objective];
      if (!domain) await probe();
      if (state === 'offline' || state === 'error') return { state, ranked: [], top: [], excluded: candidates.map(c => ({ candidate: c, reasons: [state === 'offline' ? 'service offline' : stats.lastError] })), timing: null };
      if(!Array.isArray(candidates)||candidates.length>500) throw Error('Use at most 500 candidates');
      const excluded = [], inDomain = [];
      for (const c of candidates) { const chk = checkDomain(domain, c); (chk.ok ? inDomain : excluded).push(chk.ok ? c : { candidate: c, reasons: chk.reasons }); }
      s.onProgress('mean screening ' + inDomain.length + ' candidates');
      const t0 = o.now();
      const means = inDomain.length ? await predict(inDomain, 'mean') : [];
      const meanMs = o.now() - t0;
      const ranked = [];
      means.forEach((r, i) => {
        if (r.status !== 'ok') { excluded.push({ candidate: inDomain[i], reasons: [r.reason || r.status] }); return; }
        const m = r.integratedMean;
        if (s.objective === 'minRootBending' && Number.isFinite(s.minCL) && m[0] < s.minCL) { excluded.push({ candidate: inDomain[i], reasons: ['CL mean ' + m[0].toFixed(4) + ' below target ' + s.minCL] }); return; }
        ranked.push({ candidate: inDomain[i], mean: m, score: obj.score(m), cacheHit: !!r.cacheHit });
      });
      ranked.sort((a, b) => b.score - a.score);
      ranked.forEach((r, i) => { r.rank = i + 1; });
      const topC = ranked.slice(0, s.topK).map(r => r.candidate);
      s.onProgress('full covariance for top ' + topC.length);
      const t1 = o.now();
      const fulls = topC.length ? await predict(topC, 'full') : [];
      const fullMs = o.now() - t1;
      const top = fulls.map((r, i) => {
        if (r.status !== 'ok') return { candidate: topC[i], status: r.status, reason: r.reason };
        const C = r.integratedCovariance || null;
        return { candidate: topC[i], status: 'ok', mean: r.integratedMean, std: C ? C.map((row, k) => Math.sqrt(Math.max(0, row[k]))) : null, covariance: C, stations: r.stations || null, cacheHit: !!r.cacheHit };
      });
      return { state, objective: obj.label, order: ORDER, ranked, top, excluded, timing: { meanMs, fullMs, coldLoadMs: stats.coldLoadMs, warmMs: stats.warmMs.slice(), cacheHits: stats.cacheHits, requests: stats.requests } };
    }
    return { probe, predict, screen, checkDomain: c => checkDomain(domain, c), canonical, get state() { return state; }, get domain() { return domain; }, stats, cache };
  }
  // Mock transport: replays only the recorded benchmark cases; everything else is reported unavailable.
  function createMockTransport(benchmarks, mockOpts) {
    const mo = Object.assign({ coldLoadMs: 0 }, mockOpts || {});
    let warmed = false;
    const recorded = benchmarks.cases.map(c => ({
      key: canonical({ section: c.airfoil.replace(/^NACA\s*/i, 'NACA '), alphaDeg: c.conditions.effectiveAlphaDeg, mach: c.conditions.effectiveMach, semiSpanOverChord: c.conditions.semiSpanOverChord, taperRatio: 1, sweepDeg: 0 }), c,
    }));
    const sections = [...new Set(benchmarks.cases.map(c => c.airfoil.replace(/^NACA\s*/i, 'NACA ')))];
    return async function transport(path, body) {
      if (path === '/domain') return {
        service: 'lwm-service mock', mock: true, resident: warmed, device: 'none', threads: 0, coldLoadSeconds: null,
        model: { name: benchmarks.source.name, repository: benchmarks.source.repository, commit: benchmarks.source.commit, checkpoints: benchmarks.source.inferenceCheckpoints, conditioning: 'none' },
        domain: { alphaDeg: [Math.min(...benchmarks.cases.map(c=>c.conditions.effectiveAlphaDeg)),Math.max(...benchmarks.cases.map(c=>c.conditions.effectiveAlphaDeg))], mach: [Math.min(...benchmarks.cases.map(c=>c.conditions.effectiveMach)),Math.max(...benchmarks.cases.map(c=>c.conditions.effectiveMach))], semiSpanOverChord: [Math.min(...benchmarks.cases.map(c=>c.conditions.semiSpanOverChord)),Math.max(...benchmarks.cases.map(c=>c.conditions.semiSpanOverChord))], taperRatio: [1, 1], sweepDeg: [0, 0], sections },
        recordedCases: recorded.map(r => r.key),
      };
      if (path === '/predict') {
        const timing = { totalMs: 0, warm: warmed };
        if (!warmed) { timing.coldLoadMs = 0; warmed = true; }
        const results = body.cases.map(c => {
          const hit = recorded.find(r => r.key === canonical(c));
          if (!hit) return { id: c.id, status: 'unavailable', reason: 'mock service replays recorded benchmarks only' };
          const l = hit.c.lwm;
          const out = { id: c.id, status: 'ok', integratedOrder: l.integratedOrder, integratedMean: l.integratedMean, timing: { computeMs: 0, cacheHit: false } };
          if (body.mode === 'full') { out.integratedCovariance = l.integratedCovariance; out.stations = l.stations.map(s => ({ eta: s.eta, cl: s.cl, clStd: s.clStd, cmQuarter: s.cmQuarter })); }
          return out;
        });
        return { results, timing };
      }
      throw new Error('mock: unknown path ' + path);
    };
  }
  const api = { createClient, createMockTransport, canonical, checkDomain, validateResult, OBJECTIVES, ORDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LWMClient = api;
})(typeof window !== 'undefined' ? window : globalThis);
