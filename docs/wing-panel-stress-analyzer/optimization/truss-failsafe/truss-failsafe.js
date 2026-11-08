// MIE 446 Optimization Lab: truss-failsafe module (pure ES module, no DOM access).
// 2D linear elastic truss solver, single-member removal (fail-safe) map, load-case envelope with
// fully stressed design, and a seeded Monte Carlo reliability study with assumed lognormal scatter.
// Units: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g.
// Everything here is deterministic: the pseudo-random numbers come from a seeded mulberry32 generator.

import { MATERIALS, TRUSS_PRESETS } from '../shared/presets.js';

export const VERSION = '0.1.1';

// Reference node whose displacement is reported in the fail-safe map (tip or midspan).
const REF_NODES = { 'wright-bay': 4, 'warren': 3 };

// Default coefficients of variation (CoV) per material for the reliability study (educational assumptions).
export const DEFAULT_COV = { pla: 0.10, petg: 0.10, spruce: 0.10, al6061: 0.03, steel: 0.03, wire: 0.03, cfrp: 0.10 };
export function defaultCov(material) {
  return DEFAULT_COV[material] !== undefined ? DEFAULT_COV[material] : 0.10;
}

const U_TOL = 1e-9; // feasibility tolerance on utilization (U <= 1 + U_TOL)
// A tension-only member counts as slack (and is dropped in the tension-only wire model) when its compression
// exceeds this fraction of the largest member force magnitude; smaller compressions are numerical zero, which
// matters for unloaded redundant bays whose crossed wires carry a tiny self-stress.
export const SLACK_REL_TOL = 1e-3;

function slackThreshold(N) {
  let maxAbs = 0;
  for (let i = 0; i < N.length; i++) { const v = Math.abs(N[i]); if (v > maxAbs) maxAbs = v; }
  return Math.max(1e-9, SLACK_REL_TOL * maxAbs);
}

// ---------------------------------------------------------------------------------------------
// Deterministic pseudo-random numbers and statistics helpers
// ---------------------------------------------------------------------------------------------

// mulberry32, identical to makeRng in ../shared/labkit.js (copied so a Web Worker needs no DOM kit).
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

// Standard normal variate by Box-Muller (one variate per two uniforms, no caching, so the draw order is fixed).
export function randn(rng) {
  const u1 = 1 - rng(); // in (0, 1], avoids log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Lognormal parameters that preserve the mean: X = mean * exp(sigma z - sigma^2 / 2), sigma^2 = ln(1 + CoV^2).
export function lognormalParams(mean, cov) {
  const s2 = Math.log(1 + cov * cov);
  return { mu: Math.log(mean) - s2 / 2, sigma: Math.sqrt(s2) };
}

// Multiplier with mean exactly 1 for z = 0 and sigma = 0 (exp(0) === 1), used for common random numbers.
export function lognormalFactor(sigmaLn, z) {
  return Math.exp(sigmaLn * z - sigmaLn * sigmaLn / 2);
}

export function sampleLognormal(rng, mean, cov) {
  if (!(cov > 0)) return mean;
  const s2 = Math.log(1 + cov * cov);
  return mean * Math.exp(Math.sqrt(s2) * randn(rng) - s2 / 2);
}

// Error function, Abramowitz and Stegun 7.1.26 (absolute error below 1.5e-7).
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Inverse standard normal (Acklam's rational approximation, relative error about 1.15e-9).
export function normalInv(p) {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Wilson score interval for a binomial proportion (k successes out of n), confidence from z (1.96 for 95 percent).
export function wilsonInterval(k, n, z = 1.959963984540054) {
  if (!(n > 0)) return { p: NaN, lo: NaN, hi: NaN };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
  const lo = k === 0 ? 0 : Math.max(0, centre - half);
  const hi = k === n ? 1 : Math.min(1, centre + half);
  return { p, lo, hi };
}

// Reliability index from a failure probability: beta = -Phi^-1(P_f).
export function betaFromPf(pf) {
  if (pf <= 0) return Infinity;
  if (pf >= 1) return -Infinity;
  return -normalInv(pf);
}

// Classical closed form: lognormal resistance R and load effect S, central safety factor theta = mean R / mean S,
// beta = ln(theta * sqrt((1 + V_S^2) / (1 + V_R^2))) / sqrt(ln((1 + V_R^2) (1 + V_S^2))).
export function lognormalReliabilityIndex(theta, VR, VS) {
  if (!(theta > 0)) return NaN;
  const num = Math.log(theta * Math.sqrt((1 + VS * VS) / (1 + VR * VR)));
  const den = Math.sqrt(Math.log((1 + VR * VR) * (1 + VS * VS)));
  if (!(den > 0)) return theta >= 1 ? Infinity : -Infinity;
  return num / den;
}

// ---------------------------------------------------------------------------------------------
// Model construction
// ---------------------------------------------------------------------------------------------

function normalizeLoads(loads) {
  const out = {};
  if (!loads) return out;
  for (const [k, v] of Object.entries(loads)) {
    const fx = Number(v[0]) || 0, fy = Number(v[1]) || 0;
    if (fx === 0 && fy === 0) continue;
    out[Number(k)] = [fx, fy];
  }
  return out;
}

function pickRefNode(nodes, supports, loads) {
  const supNodes = Object.keys(supports).map(Number);
  let cx = 0, cy = 0;
  for (const i of supNodes) { cx += nodes[i][0]; cy += nodes[i][1]; }
  if (supNodes.length) { cx /= supNodes.length; cy /= supNodes.length; }
  const loaded = Object.keys(loads || {}).map(Number);
  const candidates = loaded.length ? loaded : nodes.map((_, i) => i).filter(i => !supports[i]);
  let best = candidates.length ? candidates[0] : nodes.length - 1, bestD = -1;
  for (const i of candidates) {
    const d = Math.hypot(nodes[i][0] - cx, nodes[i][1] - cy);
    if (d > bestD) { bestD = d; best = i; }
  }
  return best;
}

// Build a plain-data model (JSON serialisable, so it can be posted to a Web Worker) from a preset key or
// a preset-like object { nodes, members, groups, supports, loads, loadCases }.
export function buildModel(preset, options = {}) {
  const key = typeof preset === 'string' ? preset : (preset.key || 'custom');
  const src = typeof preset === 'string' ? TRUSS_PRESETS[preset] : preset;
  if (!src) throw new Error(`unknown truss preset "${preset}"`);
  const nodes = src.nodes.map(p => [Number(p[0]), Number(p[1])]);
  const groupKeys = Object.keys(src.groups);
  const groups = {};
  groupKeys.forEach((g, gi) => {
    const def = src.groups[g];
    const mat = MATERIALS[def.material];
    if (!mat) throw new Error(`unknown material "${def.material}" in group "${g}"`);
    groups[g] = {
      key: g, index: gi, material: def.material, materialName: mat.name,
      E: mat.E, sigmaAllow: mat.sigmaAllow, rho: mat.rho,
      A0: Number(def.A0), tensionOnly: !!def.tensionOnly, buckling: def.buckling || 'none',
    };
  });
  const members = src.members.map(([a, b, g], i) => {
    if (!nodes[a] || !nodes[b]) throw new Error(`member ${i} refers to a missing node`);
    if (!groups[g]) throw new Error(`member ${i} refers to unknown group "${g}"`);
    const dx = nodes[b][0] - nodes[a][0], dy = nodes[b][1] - nodes[a][1];
    const L = Math.hypot(dx, dy);
    if (!(L > 0)) throw new Error(`member ${i} has zero length`);
    return { index: i, a, b, group: g, gi: groups[g].index, L, c: dx / L, s: dy / L, label: `${g} ${a}-${b}` };
  });
  const supports = {};
  for (const [k, v] of Object.entries(src.supports || {})) supports[Number(k)] = [v[0] ? 1 : 0, v[1] ? 1 : 0];
  const n = nodes.length, nDof = 2 * n;
  const dofMap = new Array(nDof).fill(-1);
  let nf = 0;
  for (let i = 0; i < n; i++) {
    const sup = supports[i] || [0, 0];
    if (!sup[0]) dofMap[2 * i] = nf++;
    if (!sup[1]) dofMap[2 * i + 1] = nf++;
  }
  const loadCases = {};
  let caseNames = Object.keys(src.loadCases || {});
  if (caseNames.length === 0) {
    loadCases['default'] = normalizeLoads(src.loads);
    caseNames = ['default'];
  } else {
    for (const c of caseNames) loadCases[c] = normalizeLoads(src.loadCases[c]);
  }
  const primaryCase = options.primaryCase && loadCases[options.primaryCase] ? options.primaryCase : caseNames[0];
  const refNode = Number.isInteger(options.refNode) ? options.refNode
    : (REF_NODES[key] !== undefined ? REF_NODES[key] : pickRefNode(nodes, supports, loadCases[primaryCase]));
  return {
    key, name: src.name || key, description: src.description || '',
    nodes, members, groupKeys, groups, supports,
    nDof, nf, nFixed: nDof - nf, dofMap,
    loadCases, caseNames, primaryCase, refNode,
  };
}

export function defaultGroupAreas(model) {
  const out = {};
  for (const g of model.groupKeys) out[g] = model.groups[g].A0;
  return out;
}

// Per-member area array from a { groupKey: area } map.
export function memberAreasFromGroups(model, groupAreas) {
  return model.members.map(m => {
    const a = groupAreas && groupAreas[m.group] !== undefined ? Number(groupAreas[m.group]) : model.groups[m.group].A0;
    return a;
  });
}

export function loadVector(model, loads, scale = 1) {
  const F = new Float64Array(model.nDof);
  for (const [k, v] of Object.entries(loads || {})) {
    const i = Number(k);
    if (!(i >= 0 && i < model.nodes.length)) throw new Error(`load on missing node ${k}`);
    F[2 * i] += (Number(v[0]) || 0) * scale;
    F[2 * i + 1] += (Number(v[1]) || 0) * scale;
  }
  return F;
}

export function scaleLoads(loads, mult) {
  const out = {};
  for (const [k, v] of Object.entries(loads || {})) out[k] = [v[0] * mult, v[1] * mult];
  return out;
}

// Degree of static indeterminacy m + r - 2j (members with A > 0, reaction components, joints).
// Necessary but not sufficient for stability: the solver decides.
export function redundancyCount(model, A) {
  let m = 0;
  for (let i = 0; i < model.members.length; i++) if (A[i] > 0) m++;
  return m + model.nFixed - model.nDof;
}

export function massGrams(model, A) {
  let v = 0;
  for (let i = 0; i < model.members.length; i++) {
    if (!(A[i] > 0)) continue;
    const m = model.members[i];
    v += A[i] * m.L * model.groups[m.group].rho;
  }
  return v / 1000;
}

// ---------------------------------------------------------------------------------------------
// Direct stiffness solver
// ---------------------------------------------------------------------------------------------

function makeWork(model) {
  const nf = model.nf;
  return { K: new Float64Array(nf * nf), f: new Float64Array(nf), u: new Float64Array(nf), uFull: new Float64Array(model.nDof), piv: new Int32Array(nf) };
}

// Gaussian elimination with partial pivoting on the free-DOF system. Returns false if singular.
function solveDense(K, f, u, nf, info) {
  let scale = 0;
  for (let i = 0; i < nf; i++) { const d = Math.abs(K[i * nf + i]); if (d > scale) scale = d; }
  if (!(scale > 0)) { info.pivotRatio = 0; return false; }
  const tol = 1e-11 * scale;
  let minPivot = Infinity;
  for (let col = 0; col < nf; col++) {
    let p = col, best = Math.abs(K[col * nf + col]);
    for (let r = col + 1; r < nf; r++) { const v = Math.abs(K[r * nf + col]); if (v > best) { best = v; p = r; } }
    if (!(best > tol)) { info.pivotRatio = best / scale; return false; }
    if (best < minPivot) minPivot = best;
    if (p !== col) {
      for (let j = 0; j < nf; j++) { const t = K[col * nf + j]; K[col * nf + j] = K[p * nf + j]; K[p * nf + j] = t; }
      const t = f[col]; f[col] = f[p]; f[p] = t;
    }
    const piv = K[col * nf + col];
    for (let r = col + 1; r < nf; r++) {
      const m = K[r * nf + col] / piv;
      if (m === 0) continue;
      for (let j = col; j < nf; j++) K[r * nf + j] -= m * K[col * nf + j];
      f[r] -= m * f[col];
    }
  }
  for (let i = nf - 1; i >= 0; i--) {
    let s = f[i];
    for (let j = i + 1; j < nf; j++) s -= K[i * nf + j] * u[j];
    u[i] = s / K[i * nf + i];
  }
  info.pivotRatio = minPivot / scale;
  return true;
}

// Core solve. A: member areas (0 = removed), F: full load vector, Egroup: per-group-index E array (or null for
// nominal), work: scratch arrays. Returns displacements (full) and member forces, or { ok: false }.
function solveCore(model, A, F, Egroup, work) {
  const nf = model.nf, nDof = model.nDof;
  const { K, f, u, uFull } = work;
  K.fill(0); f.fill(0); u.fill(0); uFull.fill(0);
  const members = model.members, dofMap = model.dofMap, groups = model.groups;
  const nm = members.length;
  // free-DOF load vector
  for (let d = 0; d < nDof; d++) { const fd = dofMap[d]; if (fd >= 0) f[fd] = F[d]; }
  // assembly
  const dofs = [0, 0, 0, 0], ke = new Float64Array(16);
  for (let i = 0; i < nm; i++) {
    const a = A[i];
    if (!(a > 0)) continue;
    const m = members[i];
    const E = Egroup ? Egroup[m.gi] : groups[m.group].E;
    const k = E * a / m.L;
    const c = m.c, s = m.s;
    const cc = k * c * c, cs = k * c * s, ss = k * s * s;
    ke[0] = cc; ke[1] = cs; ke[2] = -cc; ke[3] = -cs;
    ke[4] = cs; ke[5] = ss; ke[6] = -cs; ke[7] = -ss;
    ke[8] = -cc; ke[9] = -cs; ke[10] = cc; ke[11] = cs;
    ke[12] = -cs; ke[13] = -ss; ke[14] = cs; ke[15] = ss;
    dofs[0] = 2 * m.a; dofs[1] = 2 * m.a + 1; dofs[2] = 2 * m.b; dofs[3] = 2 * m.b + 1;
    for (let p = 0; p < 4; p++) {
      const fp = dofMap[dofs[p]];
      if (fp < 0) continue;
      for (let q = 0; q < 4; q++) {
        const fq = dofMap[dofs[q]];
        if (fq < 0) continue;
        K[fp * nf + fq] += ke[p * 4 + q];
      }
    }
  }
  // keep a copy of K and f for the residual check (the elimination overwrites them)
  const Kc = K.slice(), fc = f.slice();
  const info = { pivotRatio: NaN };
  const okSolve = nf === 0 ? true : solveDense(K, f, u, nf, info);
  if (!okSolve) return { ok: false, reason: 'singular stiffness matrix', pivotRatio: info.pivotRatio };
  // residual check against the original system
  let resMax = 0, fMax = 0, kuMax = 0;
  for (let i = 0; i < nf; i++) {
    let s = 0;
    for (let j = 0; j < nf; j++) { const t = Kc[i * nf + j] * u[j]; s += t; if (Math.abs(t) > kuMax) kuMax = Math.abs(t); }
    const r = Math.abs(s - fc[i]);
    if (r > resMax) resMax = r;
    if (Math.abs(fc[i]) > fMax) fMax = Math.abs(fc[i]);
  }
  if (!(resMax <= 1e-7 * (fMax + kuMax) + 1e-12) || !Number.isFinite(resMax)) {
    return { ok: false, reason: 'ill-conditioned stiffness matrix (residual check failed)', pivotRatio: info.pivotRatio };
  }
  for (let d = 0; d < nDof; d++) { const fd = dofMap[d]; uFull[d] = fd >= 0 ? u[fd] : 0; }
  // member forces (tension positive)
  const N = new Float64Array(nm);
  for (let i = 0; i < nm; i++) {
    const a = A[i];
    if (!(a > 0)) { N[i] = 0; continue; }
    const m = members[i];
    const E = Egroup ? Egroup[m.gi] : groups[m.group].E;
    const du = uFull[2 * m.b] - uFull[2 * m.a], dv = uFull[2 * m.b + 1] - uFull[2 * m.a + 1];
    N[i] = (E * a / m.L) * (m.c * du + m.s * dv);
  }
  return { ok: true, uFull: Float64Array.from(uFull), N, pivotRatio: info.pivotRatio };
}

// Wire model. Linear (default): every member is a bar; a tension-only member in compression is flagged slack.
// Tension-only: tension-only members found in compression are dropped (area set to zero) and the structure is
// Re-solve until cable force/extension signs are complementary. Re-activate stretched cables; refuse cycles.
function solveWireModel(model, A, F, Egroup, work, dropSlack) {
  const nm = model.members.length, dropped = new Array(nm).fill(false);
  if (!dropSlack) return Object.assign(solveCore(model, A, F, Egroup, work), { dropped });
  const seen = new Set(), Aeff = Float64Array.from(A, Number);
  for (let it = 0; it < 2 * nm + 10; it++) {
    const key = dropped.map(Number).join('');
    if (seen.has(key)) return { ok: false, reason: 'tension-only active-set cycle; no accepted equilibrium', dropped };
    seen.add(key);
    const core = solveCore(model, Aeff, F, Egroup, work);
    if (!core.ok) return Object.assign(core, { dropped });
    const tol = slackThreshold(core.N); let changed = false;
    for (let i = 0; i < nm; i++) {
      const m = model.members[i], g = model.groups[m.group];
      if (!(A[i] > 0) || !g.tensionOnly) continue;
      const extension = (core.uFull[2*m.b]-core.uFull[2*m.a])*m.c + (core.uFull[2*m.b+1]-core.uFull[2*m.a+1])*m.s;
      const E = Egroup ? Egroup[g.index] : g.E;
      const trialForce = E * A[i] / m.L * extension;
      if (!dropped[i] && core.N[i] < -tol) { Aeff[i] = 0; dropped[i] = true; changed = true; }
      else if (dropped[i] && trialForce > tol) { Aeff[i] = A[i]; dropped[i] = false; changed = true; }
    }
    if (!changed) return Object.assign(core, { dropped });
  }
  return { ok: false, reason: 'tension-only active set did not converge; no accepted equilibrium', dropped };
}

// Utilizations from member forces. opts: { FS, buckling (bool), K, sigmaGroup (per-group-index array or null),
// Egroup (per-group-index array or null), dropped (bool[] of wires dropped as slack) }.
function utilizations(model, A, N, opts) {
  const FS = opts.FS, useBuckling = opts.buckling !== false, Kf = opts.K || 1;
  const nm = model.members.length;
  const Ustress = new Float64Array(nm), Ubuckle = new Float64Array(nm), U = new Float64Array(nm), Pcr = new Float64Array(nm), sigma = new Float64Array(nm);
  const slack = new Array(nm).fill(false), removed = new Array(nm).fill(false), mode = new Array(nm).fill('zero');
  let maxU = 0, governing = -1, governingMode = 'none', slackCount = 0;
  const slackTol = slackThreshold(N);
  for (let i = 0; i < nm; i++) {
    const a = A[i];
    const m = model.members[i];
    const g = model.groups[m.group];
    if (!(a > 0)) { removed[i] = true; mode[i] = 'removed'; Pcr[i] = NaN; continue; }
    if (opts.dropped && opts.dropped[i]) { slack[i] = true; slackCount++; mode[i] = 'slack'; Pcr[i] = NaN; continue; }
    const E = opts.Egroup ? opts.Egroup[m.gi] : g.E;
    const sAllow = opts.sigmaGroup ? opts.sigmaGroup[m.gi] : g.sigmaAllow;
    const force = N[i];
    sigma[i] = force / a;
    Ustress[i] = Math.abs(force) * FS / (a * sAllow);
    let ub = 0;
    if (force < 0) {
      if (g.tensionOnly) {
        if (Math.abs(force) > slackTol) { slack[i] = true; slackCount++; mode[i] = 'slack'; }
        else mode[i] = 'zero';
      } else {
        mode[i] = 'compression';
      }
      if (useBuckling && g.buckling === 'square') {
        const I = a * a / 12;
        Pcr[i] = Math.PI * Math.PI * E * I / ((Kf * m.L) * (Kf * m.L));
        ub = Math.abs(force) * FS / Pcr[i];
      } else {
        Pcr[i] = NaN;
      }
    } else {
      Pcr[i] = NaN;
      mode[i] = force > 1e-9 ? 'tension' : 'zero';
    }
    Ubuckle[i] = ub;
    U[i] = Math.max(Ustress[i], ub);
    if (U[i] > maxU) { maxU = U[i]; governing = i; governingMode = ub > Ustress[i] ? 'buckling' : 'stress'; }
  }
  return { Ustress, Ubuckle, U, Pcr, sigma, slack, removed, mode, maxU, governing, governingMode, slackCount };
}

function reactions(model, A, N, F) {
  const R = {};
  for (const [k, sup] of Object.entries(model.supports)) {
    const i = Number(k);
    let rx = -F[2 * i], ry = -F[2 * i + 1];
    for (let j = 0; j < model.members.length; j++) {
      if (!(A[j] > 0)) continue;
      const m = model.members[j];
      // a bar in tension pulls node a toward b and node b toward a
      if (m.a === i) { rx -= N[j] * m.c; ry -= N[j] * m.s; }
      else if (m.b === i) { rx += N[j] * m.c; ry += N[j] * m.s; }
    }
    R[i] = [sup[0] ? rx : 0, sup[1] ? ry : 0];
  }
  return R;
}

// Public solve. loads: { node: [Fx, Fy] }; opts: { FS = 1.5, buckling = true, K = 1, loadScale = 1,
// wireModel: 'linear' (default) | 'tension-only',
// Egroup / sigmaGroup: per-group-index arrays overriding the material cards (used by the Monte Carlo study) }.
// Returns { ok: true, ... } or { ok: false, error, mechanism: true }.
export function solveTruss(model, A, loads, opts = {}) {
  const FS = opts.FS !== undefined ? Number(opts.FS) : 1.5;
  if (!(FS > 0) || !Number.isFinite(FS)) return { ok: false, error: 'factor of safety must be a positive number' };
  if (!Array.isArray(A) && !(A instanceof Float64Array)) return { ok: false, error: 'member areas must be an array' };
  if (A.length !== model.members.length) return { ok: false, error: 'member area array has the wrong length' };
  for (let i = 0; i < A.length; i++) if (!Number.isFinite(A[i]) || A[i] < 0) return { ok: false, error: `member ${i} has an invalid area` };
  const Kf = opts.K !== undefined ? Number(opts.K) : 1;
  if (!(Kf > 0) || !Number.isFinite(Kf)) return { ok: false, error: 'effective length factor K must be positive' };
  let F;
  try { F = loadVector(model, loads, opts.loadScale !== undefined ? opts.loadScale : 1); } catch (err) { return { ok: false, error: err.message }; }
  const work = opts.work || makeWork(model);
  const dropSlack = opts.wireModel === 'tension-only';
  const core = solveWireModel(model, A, F, opts.Egroup || null, work, dropSlack);
  const mass = massGrams(model, A);
  if (!core.ok) {
    const droppedLabels = core.dropped ? model.members.filter((m, i) => core.dropped[i]).map(m => m.label) : [];
    const suffix = droppedLabels.length ? ` after dropping slack wires (${droppedLabels.join(', ')})` : '';
    return { ok: false, mechanism: true, error: `unstable structure (mechanism)${suffix}: ${core.reason}`, mass, redundancy: redundancyCount(model, A), dropped: core.dropped || null };
  }
  const ut = utilizations(model, A, core.N, { FS, buckling: opts.buckling, K: Kf, Egroup: opts.Egroup || null, sigmaGroup: opts.sigmaGroup || null, dropped: dropSlack ? core.dropped : null });
  const r = model.refNode;
  const refDisp = { node: r, ux: core.uFull[2 * r], uy: core.uFull[2 * r + 1], mag: Math.hypot(core.uFull[2 * r], core.uFull[2 * r + 1]) };
  let uMax = 0;
  for (let i = 0; i < model.nodes.length; i++) { const d = Math.hypot(core.uFull[2 * i], core.uFull[2 * i + 1]); if (d > uMax) uMax = d; }
  return {
    ok: true, FS, K: Kf, buckling: opts.buckling !== false, wireModel: dropSlack ? 'tension-only' : 'linear',
    u: Array.from(core.uFull), N: Array.from(core.N), sigma: Array.from(ut.sigma),
    Ustress: Array.from(ut.Ustress), Ubuckle: Array.from(ut.Ubuckle), U: Array.from(ut.U), Pcr: Array.from(ut.Pcr),
    slack: ut.slack, removed: ut.removed, dropped: core.dropped, mode: ut.mode, slackCount: ut.slackCount,
    maxU: ut.maxU, governing: ut.governing, governingMode: ut.governingMode,
    governingLabel: ut.governing >= 0 ? model.members[ut.governing].label : 'none',
    wireAdmissible: dropSlack || ut.slackCount === 0,
    feasible: ut.maxU <= 1 + U_TOL && (dropSlack || ut.slackCount === 0),
    mass, refDisp, uMax, reactions: reactions(model, A, core.N, F), redundancy: redundancyCount(model, A), pivotRatio: core.pivotRatio,
  };
}

// Verification routine: rebuild the per-member areas from the candidate design numbers, re-solve every case
// with the plain solver and re-check all constraints. cases: [{ name, loads, mult }].
export function verifyDesign(model, A, cases, opts = {}) {
  const areas = Array.from(A, Number);
  const results = [];
  const nm = model.members.length;
  const envelope = new Array(nm).fill(0), governingCase = new Array(nm).fill(-1);
  let feasible = true, error = null, worst = { U: -1, member: -1, caseIndex: -1, mode: 'none' };
  cases.forEach((c, ci) => {
    const res = solveTruss(model, areas, scaleLoads(c.loads, c.mult === undefined ? 1 : c.mult), opts);
    results.push(res);
    if (!res.ok) { feasible = false; if (!error) error = `${c.name}: ${res.error}`; return; }
    for (let i = 0; i < nm; i++) {
      if (res.U[i] > envelope[i] || governingCase[i] < 0) { envelope[i] = res.U[i]; governingCase[i] = ci; }
      if (res.U[i] > worst.U) worst = { U: res.U[i], member: i, caseIndex: ci, mode: res.Ubuckle[i] > res.Ustress[i] ? 'buckling' : 'stress' };
    }
    if (!res.feasible) feasible = false;
    if (res.wireModel === 'linear' && res.slackCount > 0) { feasible = false; if (!error) error = 'Compressed wires in a bilateral linear comparison: no admissible tension-only design.'; }
  });
  return {
    feasible, error, results, envelope, governingCase, mass: massGrams(model, areas),
    governing: worst.member >= 0 ? { member: worst.member, label: model.members[worst.member].label, caseIndex: worst.caseIndex, caseName: cases[worst.caseIndex] ? cases[worst.caseIndex].name : '', U: worst.U, mode: worst.mode } : null,
    utilizations: results.map(r => (r.ok ? r.U : null)),
  };
}

// ---------------------------------------------------------------------------------------------
// Part A: fail-safe (single-member removal) map
// ---------------------------------------------------------------------------------------------

export function failSafeMap(model, A, loads, opts = {}) {
  const baseline = solveTruss(model, A, loads, opts);
  if (!baseline.ok) return { ok: false, error: `baseline: ${baseline.error}`, baseline };
  const rows = [];
  const nm = model.members.length;
  let nOk = 0, nOverload = 0, nCollapse = 0, nActive = 0;
  for (let i = 0; i < nm; i++) {
    if (!(A[i] > 0)) continue; // already absent
    nActive++;
    const Ad = Array.from(A); Ad[i] = 0;
    const res = solveTruss(model, Ad, loads, opts);
    const m = model.members[i];
    const row = { member: i, label: m.label, group: m.group, baselineU: baseline.U[i], baselineN: baseline.N[i] };
    if (!res.ok) {
      row.consequence = 'collapse'; row.maxU = Infinity; row.governing = -1; row.governingLabel = 'none (mechanism)';
      row.refDisp = Infinity; row.refDispRatio = Infinity; row.slackCount = 0; row.slackPath = false;
      const droppedLabels = res.dropped ? model.members.filter((mm, j) => res.dropped[j] && j !== i).map(mm => mm.label) : [];
      row.note = droppedLabels.length ? `mechanism once the slack wires are dropped (${droppedLabels.join(', ')})` : 'mechanism: singular stiffness';
      row.error = res.error;
      nCollapse++;
    } else {
      row.consequence = res.maxU > 1 + U_TOL ? 'overload' : 'ok';
      row.maxU = res.maxU; row.governing = res.governing; row.governingLabel = res.governingLabel; row.governingMode = res.governingMode;
      row.refDisp = res.refDisp.mag;
      row.refDispRatio = baseline.refDisp.mag > 0 ? res.refDisp.mag / baseline.refDisp.mag : (res.refDisp.mag > 0 ? Infinity : 1);
      row.slackCount = res.slackCount;
      // does the damaged load path rely on a wire that the linear model puts in compression and whose force grew markedly?
      let slackPath = false;
      for (let j = 0; j < nm; j++) {
        if (j === i || !res.slack[j]) continue;
        if (Math.abs(res.N[j]) > 1.25 * Math.abs(baseline.N[j]) + 1e-6) { slackPath = true; break; }
      }
      row.slackPath = slackPath;
      row.note = slackPath ? 'load path through a compression (slack) wire: valid only with rigging pretension' : '';
      if (row.consequence === 'ok') nOk++; else nOverload++;
    }
    rows.push(row);
  }
  const order = { collapse: 0, overload: 1, ok: 2 };
  rows.sort((p, q) => (order[p.consequence] - order[q.consequence]) || ((q.maxU === Infinity ? 1e300 : q.maxU) - (p.maxU === Infinity ? 1e300 : p.maxU)));
  const byMember = new Array(nm).fill(null);
  for (const r of rows) byMember[r.member] = r;
  return {
    ok: true, baseline, rows, byMember,
    counts: { ok: nOk, overload: nOverload, collapse: nCollapse, total: nActive },
    damageToleranceIndex: nActive > 0 ? nOk / nActive : NaN,
    worst: rows.length ? rows[0] : null,
    redundancy: redundancyCount(model, A),
  };
}

// ---------------------------------------------------------------------------------------------
// Part B: load-case envelope and fully stressed design
// ---------------------------------------------------------------------------------------------

// cases: [{ name, loads, mult }]. Returns per-member utilization per case, the envelope and the governing case.
export function loadCaseEnvelope(model, A, cases, opts = {}) {
  const nm = model.members.length;
  const perCase = cases.map(c => solveTruss(model, A, scaleLoads(c.loads, c.mult === undefined ? 1 : c.mult), opts));
  const failed = perCase.find(r => !r.ok);
  if (failed) return { ok: false, error: failed.error, perCase };
  const Ucase = []; // Ucase[i][ci]
  const envelope = new Array(nm).fill(0), governingCase = new Array(nm).fill(-1), envelopeMode = new Array(nm).fill('none');
  for (let i = 0; i < nm; i++) {
    const row = perCase.map(r => r.U[i]);
    Ucase.push(row);
    for (let ci = 0; ci < row.length; ci++) {
      if (governingCase[i] < 0 || row[ci] > envelope[i]) {
        envelope[i] = row[ci]; governingCase[i] = ci;
        envelopeMode[i] = perCase[ci].Ubuckle[i] > perCase[ci].Ustress[i] ? 'buckling' : 'stress';
      }
    }
  }
  let maxU = 0, governing = -1;
  for (let i = 0; i < nm; i++) if (envelope[i] > maxU) { maxU = envelope[i]; governing = i; }
  const caseMax = perCase.map(r => r.maxU);
  return { ok: true, perCase, Ucase, envelope, governingCase, envelopeMode, maxU, governing, caseMax, mass: massGrams(model, A), feasible: maxU <= 1 + U_TOL };
}

// Uniform scale factor that makes the governing member fully stressed: max over members and cases of
// max(U_stress, sqrt(U_buckle)). Used for the final feasibility polish.
function fsdScaleFactor(env) {
  let s = 0;
  for (const r of env.perCase) {
    for (let i = 0; i < r.U.length; i++) {
      if (r.removed[i]) continue;
      s = Math.max(s, r.Ustress[i], Math.sqrt(r.Ubuckle[i]));
    }
  }
  return s;
}

// Fully stressed design (FSD): A_i <- A_i * max(U_stress,i, sqrt(U_buckle,i)) using the maximum over the given
// cases each iteration, clamped to A_min = AminFactor * A0 (group), up to `iters` iterations with early stop.
// A final uniform scale-up (which leaves member forces unchanged in a linear truss) guarantees max U <= 1.
export function fullyStressedDesign(model, Astart, cases, opts = {}, settings = {}) {
  const iters = settings.iters !== undefined ? settings.iters : 40;
  const AminFactor = settings.AminFactor !== undefined ? settings.AminFactor : 0.2;
  const nm = model.members.length;
  const A = Array.from(Astart, Number);
  const Amin = model.members.map(m => AminFactor * model.groups[m.group].A0);
  for (let i = 0; i < nm; i++) if (A[i] > 0 && A[i] < Amin[i]) A[i] = Amin[i];
  const history = [];
  let converged = false, iterationsUsed = 0, error = null;
  for (let it = 0; it < iters; it++) {
    const env = loadCaseEnvelope(model, A, cases, opts);
    if (!env.ok) { error = env.error; break; }
    history.push({ iter: it, maxU: env.maxU, mass: env.mass });
    let maxRel = 0;
    for (let i = 0; i < nm; i++) {
      if (!(A[i] > 0)) continue;
      let us = 0, ub = 0;
      for (const r of env.perCase) { if (r.Ustress[i] > us) us = r.Ustress[i]; if (r.Ubuckle[i] > ub) ub = r.Ubuckle[i]; }
      const factor = Math.max(us, Math.sqrt(ub));
      if (!Number.isFinite(factor)) { error = `non-finite utilization for member ${i}`; break; }
      const An = Math.max(Amin[i], A[i] * factor);
      maxRel = Math.max(maxRel, Math.abs(An - A[i]) / A[i]);
      A[i] = An;
    }
    if (error) break;
    iterationsUsed = it + 1;
    if (maxRel < 1e-7) { converged = true; break; }
  }
  if (error) return { ok: false, error, A, history, iterations: iterationsUsed };
  // Feasibility polish: a uniform scale-up of all areas leaves the member forces of a linear truss unchanged,
  // so scaling by s = max_i max(U_stress,i, sqrt(U_buckle,i)) puts the governing member exactly at U = 1.
  let env = loadCaseEnvelope(model, A, cases, opts);
  if (!env.ok) return { ok: false, error: env.error, A, history, iterations: iterationsUsed };
  let polishScale = 1;
  if (env.maxU > 1 + U_TOL / 10) {
    polishScale = fsdScaleFactor(env);
    for (let i = 0; i < nm; i++) if (A[i] > 0) A[i] *= polishScale;
    env = loadCaseEnvelope(model, A, cases, opts);
    if (!env.ok) return { ok: false, error: env.error, A, history, iterations: iterationsUsed };
  }
  history.push({ iter: iterationsUsed, maxU: env.maxU, mass: env.mass, final: true });
  const verify = verifyDesign(model, A, cases, opts);
  return { ok: true, A, Amin, history, iterations: iterationsUsed, converged, polishScale, envelope: env, mass: env.mass, verify };
}

// Group-wise sizing helper (a student would pick one section per group): A_g <- A_g * max over members in g of
// max(U_stress, sqrt(U_buckle)), clamped to AminFactor * A0. Returns { groupAreas, iterations, converged, verify }.
export function sizeGroupAreas(model, groupAreas, cases, opts = {}, settings = {}) {
  const iters = settings.iters !== undefined ? settings.iters : 40;
  const AminFactor = settings.AminFactor !== undefined ? settings.AminFactor : 0.2;
  const ga = {};
  for (const g of model.groupKeys) ga[g] = Math.max(AminFactor * model.groups[g].A0, Number(groupAreas && groupAreas[g] !== undefined ? groupAreas[g] : model.groups[g].A0));
  let converged = false, used = 0, error = null;
  for (let it = 0; it < iters; it++) {
    const A = memberAreasFromGroups(model, ga);
    const env = loadCaseEnvelope(model, A, cases, opts);
    if (!env.ok) { error = env.error; break; }
    let maxRel = 0;
    for (const g of model.groupKeys) {
      let factor = 0;
      model.members.forEach((m, i) => {
        if (m.group !== g) return;
        for (const r of env.perCase) factor = Math.max(factor, r.Ustress[i], Math.sqrt(r.Ubuckle[i]));
      });
      const An = Math.max(AminFactor * model.groups[g].A0, ga[g] * factor);
      maxRel = Math.max(maxRel, Math.abs(An - ga[g]) / ga[g]);
      ga[g] = An;
    }
    used = it + 1;
    if (maxRel < 1e-7) { converged = true; break; }
  }
  if (error) return { ok: false, error, groupAreas: ga, iterations: used };
  let A = memberAreasFromGroups(model, ga);
  const env = loadCaseEnvelope(model, A, cases, opts);
  if (env.ok && env.maxU > 1 + U_TOL / 10) {
    const s = fsdScaleFactor(env);
    for (const g of model.groupKeys) ga[g] *= s;
    A = memberAreasFromGroups(model, ga);
  }
  const verify = verifyDesign(model, A, cases, opts);
  return { ok: true, groupAreas: ga, A, iterations: used, converged, verify };
}

// Evaluate a design sized for one case under every other case: list members with U > 1 per case.
export function crossCheck(model, A, cases, opts = {}) {
  const out = [];
  for (const c of cases) {
    const res = solveTruss(model, A, scaleLoads(c.loads, c.mult === undefined ? 1 : c.mult), opts);
    if (!res.ok) { out.push({ name: c.name, ok: false, error: res.error, failing: [], maxU: Infinity }); continue; }
    const failing = [];
    for (let i = 0; i < model.members.length; i++) {
      if (res.U[i] > 1 + U_TOL) failing.push({ member: i, label: model.members[i].label, U: res.U[i], mode: res.Ubuckle[i] > res.Ustress[i] ? 'buckling' : 'stress', slack: res.slack[i] });
    }
    failing.sort((p, q) => q.U - p.U);
    out.push({ name: c.name, ok: true, failing, maxU: res.maxU, governingLabel: res.governingLabel, result: res });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Part C: Monte Carlo reliability study (resumable stepper so a worker or a chunked loop can drive it)
// ---------------------------------------------------------------------------------------------

export const STUDY_STAGES = [
  { id: 'full', label: 'all scatter on', zero: null },
  { id: 'noE', label: 'modulus E scatter off', zero: 'E' },
  { id: 'noSigma', label: 'strength scatter off', zero: 'sigma' },
  { id: 'noLoad', label: 'load scatter off', zero: 'load' },
  { id: 'none', label: 'all scatter off (deterministic check)', zero: 'all' },
];

function sigmaLnFromCov(cov) {
  const c = Number(cov) || 0;
  return c > 0 ? Math.sqrt(Math.log(1 + c * c)) : 0;
}

// Per-member lognormal closed form and first-order series-system bounds for a deterministic solve `det`.
export function closedFormBounds(model, det, FS, mc = {}) {
  const VS = Number(mc.covLoad) || 0;
  const perMember = [];
  let maxD = 0, sumD = 0, maxL = 0, sumL = 0, worstD = null, worstL = null;
  for (let i = 0; i < model.members.length; i++) {
    if (det.removed[i] || (det.slack[i] && det.U[i] === 0)) continue;
    const U = det.U[i];
    if (!(U > 0)) continue;
    const m = model.members[i];
    const mode = det.Ubuckle[i] > det.Ustress[i] ? 'buckling' : 'stress';
    const VR = mode === 'buckling' ? (Number(mc.covE && mc.covE[m.group]) || 0) : (Number(mc.covSigma && mc.covSigma[m.group]) || 0);
    const bD = lognormalReliabilityIndex(1 / U, VR, VS), bL = lognormalReliabilityIndex(FS / U, VR, VS);
    const pD = Number.isFinite(bD) ? normalCdf(-bD) : (bD > 0 ? 0 : 1);
    const pL = Number.isFinite(bL) ? normalCdf(-bL) : (bL > 0 ? 0 : 1);
    const row = { member: i, label: m.label, group: m.group, U, mode, VR, VS, betaDesign: bD, pfDesign: pD, betaLimit: bL, pfLimit: pL };
    perMember.push(row);
    sumD += pD; sumL += pL;
    if (pD > maxD || !worstD) { maxD = pD; worstD = row; }
    if (pL > maxL || !worstL) { maxL = pL; worstL = row; }
  }
  perMember.sort((p, q) => q.pfLimit - p.pfLimit || q.pfDesign - p.pfDesign);
  return {
    VS, perMember, worstDesign: worstD, worstLimit: worstL,
    boundsDesign: [maxD, Math.min(1, sumD)], boundsLimit: [maxL, Math.min(1, sumL)],
    betaBoundsLimit: [betaFromPf(Math.min(1, sumL)), betaFromPf(maxL)],
  };
}

// mc: { n, seed, covE: {group: cov}, covSigma: {group: cov}, covLoad, sensitivity (default true), histBins (default 40) }
export function createReliabilityStudy(model, A, loads, opts = {}, mc = {}) {
  const n = Math.max(1, Math.floor(Number(mc.n) || 5000));
  const seed = Number.isFinite(Number(mc.seed)) ? Math.floor(Number(mc.seed)) : 1;
  const FS = opts.FS !== undefined ? Number(opts.FS) : 1.5;
  const areas = Array.from(A, Number);
  const ng = model.groupKeys.length;
  const sE = model.groupKeys.map(g => sigmaLnFromCov(mc.covE && mc.covE[g]));
  const sS = model.groupKeys.map(g => sigmaLnFromCov(mc.covSigma && mc.covSigma[g]));
  const sL = sigmaLnFromCov(mc.covLoad);
  const stages = mc.sensitivity === false ? [STUDY_STAGES[0], STUDY_STAGES[4]] : STUDY_STAGES.slice();
  const total = n * stages.length;
  // deterministic baseline with mean properties (plain solver, no overrides)
  const deterministic = solveTruss(model, areas, loads, opts);
  if (!deterministic.ok) throw new Error(`deterministic baseline: ${deterministic.error}`);
  if (!deterministic.wireAdmissible) throw new Error('Reliability withheld: compressed wires in the linear comparison require an admitted tension-only model.');
  const F = loadVector(model, loads, 1);
  const work = makeWork(model);
  const dropSlack = opts.wireModel === 'tension-only';
  const Eg = new Float64Array(ng), Sg = new Float64Array(ng);
  const E0 = model.groupKeys.map(g => model.groups[g].E), S0 = model.groupKeys.map(g => model.groups[g].sigmaAllow);
  const nm = model.members.length;
  const checkpointEvery = Math.max(1, Math.ceil(n / 200));
  const maxUs = new Float64Array(n); // main stage only
  const stageAcc = stages.map(() => ({ count: 0, countDesign: 0, countLimit: 0, sum: 0, sum2: 0, min: Infinity, max: -Infinity, governingCounts: new Int32Array(nm), slackSamples: 0 }));
  const convergence = { n: [], pfDesign: [], pfLimit: [] };
  let stageIndex = 0, inStage = 0, done = 0, rng = makeRng(seed);
  let firstSampleMaxU = NaN;
  const Fs = new Float64Array(model.nDof);

  function sampleOnce(st, acc, idx) {
    const zero = st.zero;
    for (let g = 0; g < ng; g++) {
      const zE = randn(rng), zS = randn(rng);
      const sEg = (zero === 'E' || zero === 'all') ? 0 : sE[g];
      const sSg = (zero === 'sigma' || zero === 'all') ? 0 : sS[g];
      Eg[g] = E0[g] * lognormalFactor(sEg, zE);
      Sg[g] = S0[g] * lognormalFactor(sSg, zS);
    }
    const zL = randn(rng);
    const m = lognormalFactor((zero === 'load' || zero === 'all') ? 0 : sL, zL);
    for (let d = 0; d < F.length; d++) Fs[d] = F[d] * m;
    const core = solveWireModel(model, areas, Fs, Eg, work, dropSlack);
    if (!core.ok) throw new Error(`sample ${idx} in stage "${st.label}": unstable structure (${core.reason})`);
    const ut = utilizations(model, areas, core.N, { FS, buckling: opts.buckling, K: opts.K || 1, Egroup: Eg, sigmaGroup: Sg, dropped: dropSlack ? core.dropped : null });
    const mu = ut.maxU;
    acc.count++;
    // same tolerance as the feasibility check, so a design sitting exactly at U = 1 is counted consistently
    if (mu > 1 + U_TOL) acc.countDesign++;
    if (mu > FS * (1 + U_TOL)) acc.countLimit++;
    acc.sum += mu; acc.sum2 += mu * mu;
    if (mu < acc.min) acc.min = mu;
    if (mu > acc.max) acc.max = mu;
    if (ut.governing >= 0) acc.governingCounts[ut.governing]++;
    if (ut.slackCount > 0) acc.slackSamples++;
    return mu;
  }

  const study = {
    get total() { return total; },
    get done() { return done; },
    get finished() { return stageIndex >= stages.length; },
    get stageLabel() { return stageIndex < stages.length ? stages[stageIndex].label : 'finished'; },
    get stageIndex() { return stageIndex; },
    step(k = 500) {
      let budget = Math.max(1, Math.floor(k));
      while (budget > 0 && stageIndex < stages.length) {
        const st = stages[stageIndex], acc = stageAcc[stageIndex];
        const mu = sampleOnce(st, acc, inStage);
        if (stageIndex === 0) {
          maxUs[inStage] = mu;
          if (inStage === 0) firstSampleMaxU = mu;
          const k1 = inStage + 1;
          if (k1 % checkpointEvery === 0 || k1 === n) {
            convergence.n.push(k1); convergence.pfDesign.push(acc.countDesign / k1); convergence.pfLimit.push(acc.countLimit / k1);
          }
        }
        inStage++; done++; budget--;
        if (inStage >= n) { stageIndex++; inStage = 0; rng = makeRng(seed); } // common random numbers for every stage
      }
      return { done, total, finished: study.finished };
    },
    result() {
      const summarise = (st, acc) => {
        const nn = acc.count;
        const mean = nn ? acc.sum / nn : NaN;
        const varc = nn > 1 ? Math.max(0, (acc.sum2 - nn * mean * mean) / (nn - 1)) : 0;
        const ciD = wilsonInterval(acc.countDesign, nn), ciL = wilsonInterval(acc.countLimit, nn);
        return {
          id: st.id, label: st.label, zero: st.zero, n: nn,
          countDesign: acc.countDesign, countLimit: acc.countLimit,
          pfDesign: ciD.p, ciDesign: [ciD.lo, ciD.hi], betaDesign: betaFromPf(ciD.p), betaDesignRange: [betaFromPf(ciD.hi), betaFromPf(ciD.lo)],
          pfLimit: ciL.p, ciLimit: [ciL.lo, ciL.hi], betaLimit: betaFromPf(ciL.p), betaLimitRange: [betaFromPf(ciL.hi), betaFromPf(ciL.lo)],
          maxUmean: mean, maxUstd: Math.sqrt(varc), maxUmin: acc.min, maxUmax: acc.max,
          governingCounts: Array.from(acc.governingCounts), slackSamples: acc.slackSamples,
        };
      };
      const stageResults = stages.map((st, i) => summarise(st, stageAcc[i]));
      const main = stageResults[0];
      const detStage = stageResults[stageResults.length - 1];
      // histogram of max U over the main stage
      const bins = Math.max(5, Math.floor(mc.histBins || 40));
      const count = stageAcc[0].count;
      let lo = Math.min(stageAcc[0].min, 0), hi = Math.max(stageAcc[0].max, FS * 1.05, 1.05);
      if (!(hi > lo)) hi = lo + 1;
      const edges = new Array(bins + 1);
      for (let b = 0; b <= bins; b++) edges[b] = lo + (hi - lo) * b / bins;
      const counts = new Array(bins).fill(0);
      for (let i = 0; i < count; i++) {
        let b = Math.floor((maxUs[i] - lo) / (hi - lo) * bins);
        if (b >= bins) b = bins - 1;
        if (b < 0) b = 0;
        counts[b]++;
      }
      const sensitivity = stageResults.slice(1).map(s => ({
        id: s.id, label: s.label, zero: s.zero,
        pfLimit: s.pfLimit, deltaLimit: main.pfLimit - s.pfLimit,
        pfDesign: s.pfDesign, deltaDesign: main.pfDesign - s.pfDesign,
        betaLimit: s.betaLimit, maxUstd: s.maxUstd,
      }));
      // Classical closed form per member (lognormal load effect S and resistance R, member forces taken as fixed):
      // beta_i = ln(theta_i sqrt((1+V_S^2)/(1+V_R^2))) / sqrt(ln((1+V_R^2)(1+V_S^2))), theta_i = 1/U_i (design
      // criterion) or FS/U_i (limit state). First-order series-system bounds: max_i P_i <= P_sys <= sum_i P_i.
      const closedForm = closedFormBounds(model, deterministic, FS, mc);
      return {
        n, seed, FS, stages: stageResults, main, deterministicStage: detStage,
        deterministic: { maxU: deterministic.maxU, governing: deterministic.governing, governingLabel: deterministic.governingLabel, governingMode: deterministic.governingMode, U: deterministic.U, feasible: deterministic.feasible, slackCount: deterministic.slackCount },
        deterministicCheck: { mcMaxU: detStage.maxUmax, solverMaxU: deterministic.maxU, exact: detStage.maxUmax === deterministic.maxU && detStage.maxUmin === deterministic.maxU },
        histogram: { edges, counts, lo, hi },
        convergence, sensitivity, closedForm,
        firstSampleMaxU,
        cov: { E: Object.fromEntries(model.groupKeys.map(g => [g, Number(mc.covE && mc.covE[g]) || 0])), sigma: Object.fromEntries(model.groupKeys.map(g => [g, Number(mc.covSigma && mc.covSigma[g]) || 0])), load: Number(mc.covLoad) || 0 },
      };
    },
  };
  return study;
}

// Convenience: run the whole study synchronously (tests, small n).
export function runReliabilityStudy(model, A, loads, opts = {}, mc = {}) {
  const study = createReliabilityStudy(model, A, loads, opts, mc);
  while (!study.finished) study.step(10000);
  return study.result();
}

// ---------------------------------------------------------------------------------------------
// Input validation (returns messages, never throws)
// ---------------------------------------------------------------------------------------------

export function validateInputs(inp) {
  const errors = [];
  const num = (v, name, { min = -Infinity, max = Infinity, integer = false, strictMin = false } = {}) => {
    const x = Number(v);
    if (!Number.isFinite(x)) { errors.push(`${name} must be a number`); return; }
    if (strictMin ? !(x > min) : x < min) { errors.push(`${name} must be ${strictMin ? 'greater than' : 'at least'} ${min}`); return; }
    if (x > max) { errors.push(`${name} must be at most ${max}`); return; }
    if (integer && Math.floor(x) !== x) errors.push(`${name} must be an integer`);
  };
  num(inp.FS, 'factor of safety FS', { min: 0, strictMin: true });
  if (inp.K !== undefined) num(inp.K, 'effective length factor K', { min: 0, strictMin: true });
  if (inp.groupAreas) for (const [g, a] of Object.entries(inp.groupAreas)) num(a, `area of group "${g}"`, { min: 0, strictMin: true });
  if (inp.multipliers) for (const [c, m] of Object.entries(inp.multipliers)) num(m, `multiplier of load case "${c}"`);
  if (inp.covE) for (const [g, v] of Object.entries(inp.covE)) num(v, `CoV of E for group "${g}"`, { min: 0, max: 1 });
  if (inp.covSigma) for (const [g, v] of Object.entries(inp.covSigma)) num(v, `CoV of strength for group "${g}"`, { min: 0, max: 1 });
  if (inp.covLoad !== undefined) num(inp.covLoad, 'CoV of the load', { min: 0, max: 1 });
  if (inp.n !== undefined) num(inp.n, 'number of samples', { min: 100, max: 200000, integer: true });
  if (inp.seed !== undefined) num(inp.seed, 'seed', { integer: true });
  return { ok: errors.length === 0, errors };
}
