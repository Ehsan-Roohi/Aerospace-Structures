// MIE 446 Optimization Lab: truss-shape module (pure ES module, no DOM access).
//
// Nested shape optimization of plane trusses. The outer design variables are node positions; inside every geometry
// evaluation the member areas are sized by a fully stressed design loop, so the outer objective is "the minimum
// feasible mass of this geometry". Two deterministic outer optimizers are implemented from scratch: a bounded
// Nelder-Mead simplex (adaptive parameters, optional restarts) and a compact (mu/mu_w, lambda) CMA-ES
// (Covariance Matrix Adaptation Evolution Strategy) driven by the seeded mulberry32 generator from the shared kit.
//
// Units everywhere: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g.
// mass_g = sum(A_i * L_i) * rho / 1000.

import { MATERIALS, TRUSS_PRESETS } from '../shared/presets.js';
import { makeRng } from '../shared/labkit.js';

export const VERSION = '0.1.1';

// Finite penalty objective (grams) returned for geometries the exact solver cannot analyse
// (mechanisms, coincident nodes). Finite on purpose: the outer optimizers must never see NaN.
export const PENALTY_MASS = 1e9;

// Utilization tolerance used by the verification routine: a design is accepted when every U <= 1 + U_TOL.
export const U_TOL = 1e-6;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clone2 = nodes => nodes.map(p => [p[0], p[1]]);
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// ---------------------------------------------------------------------------
// 1. Problem definition
// ---------------------------------------------------------------------------

export function listPresets() {
  return Object.keys(TRUSS_PRESETS).map(k => ({ key: k, name: TRUSS_PRESETS[k].name, description: TRUSS_PRESETS[k].description }));
}

// Build an analysis problem from a shared preset. opts: { loadCase, FS, K (effective length factor), bucklingOn }
export function makeProblem(presetKey, opts = {}) {
  const preset = TRUSS_PRESETS[presetKey];
  if (!preset) throw new Error(`unknown truss preset "${presetKey}"`);
  const hasCase = opts.loadCase && preset.loadCases && preset.loadCases[opts.loadCase];
  const loadsSrc = hasCase ? preset.loadCases[opts.loadCase] : preset.loads;
  const groups = {};
  for (const [key, g] of Object.entries(preset.groups)) {
    const m = MATERIALS[g.material];
    if (!m) throw new Error(`unknown material "${g.material}" in group "${key}"`);
    groups[key] = {
      key, material: g.material, materialName: m.name, E: m.E, sigmaAllow: m.sigmaAllow, rho: m.rho,
      A0: g.A0, tensionOnly: !!g.tensionOnly, buckling: g.buckling || 'none',
    };
  }
  const members = preset.members.map(([a, b, group], index) => {
    if (!groups[group]) throw new Error(`member ${index} refers to unknown group "${group}"`);
    return { index, a, b, group };
  });
  const loads = {};
  for (const [k, v] of Object.entries(loadsSrc)) loads[k] = [Number(v[0]) || 0, Number(v[1]) || 0];
  const supports = {};
  for (const [k, v] of Object.entries(preset.supports)) supports[k] = [v[0] ? 1 : 0, v[1] ? 1 : 0];
  let loadSum = 0;
  for (const v of Object.values(loads)) loadSum += Math.hypot(v[0], v[1]);
  return {
    key: presetKey, name: preset.name, description: preset.description,
    nodes0: clone2(preset.nodes), members, groups, supports, loads,
    loadCase: hasCase ? opts.loadCase : null,
    loadCaseNames: Object.keys(preset.loadCases || {}),
    loadSum,
    FS: Math.max(1, num(opts.FS, 1.5)),
    Keff: Math.max(0.05, num(opts.K, 1.0)),
    bucklingOn: opts.bucklingOn !== false,
  };
}

export function presetAreas(problem) {
  return problem.members.map(m => problem.groups[m.group].A0);
}

// ---------------------------------------------------------------------------
// 2. Exact solver: 2D linear elastic truss, direct stiffness method
// ---------------------------------------------------------------------------

// Gaussian elimination with partial pivoting on a dense system. A: array of Float64Array rows, b: Float64Array.
// Both are modified. Returns { x, singular }. A pivot below 1e-12 times the largest diagonal entry is a mechanism.
export function solveLinearSystem(A, b) {
  const n = b.length;
  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i][i]));
  if (!(maxDiag > 0)) return { singular: true, x: null };
  const thresh = 1e-12 * maxDiag;
  for (let k = 0; k < n; k++) {
    let p = k, pmax = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i][k]); if (v > pmax) { pmax = v; p = i; } }
    if (!(pmax > thresh)) return { singular: true, x: null };
    if (p !== k) { const t = A[p]; A[p] = A[k]; A[k] = t; const tb = b[p]; b[p] = b[k]; b[k] = tb; }
    const rowk = A[k], akk = rowk[k];
    for (let i = k + 1; i < n; i++) {
      const rowi = A[i];
      const fac = rowi[k] / akk;
      if (fac === 0) continue;
      for (let j = k; j < n; j++) rowi[j] -= fac * rowk[j];
      b[i] -= fac * b[k];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    const row = A[i];
    for (let j = i + 1; j < n; j++) s -= row[j] * x[j];
    x[i] = s / row[i];
  }
  return { x, singular: false };
}

// Solve the truss for given node coordinates and member areas.
// opts.active: optional boolean array; inactive members (released slack wires) carry no stiffness and no force.
// Returns { ok:false, reason } for mechanisms, coincident nodes or bad input, otherwise the full response:
// { ok, u, N, stress, L, elong, active, Ustress, Ubuckle, U, slack, mass, groupMass, reactions, maxU,
//   governingMember, governingType, dispMag, maxDisp, slackCount }.
export function solveTruss(problem, nodes, areas, opts = {}) {
  const fail = reason => ({ ok: false, reason });
  const members = problem.members, nm = members.length;
  if (!Array.isArray(nodes) || nodes.length < 2) return fail('the truss needs at least two nodes');
  const nn = nodes.length, ndof = 2 * nn;
  for (let i = 0; i < nn; i++) {
    if (!Number.isFinite(nodes[i][0]) || !Number.isFinite(nodes[i][1])) return fail(`node ${i} has a non-numeric coordinate`);
  }
  if (!areas || areas.length !== nm) return fail('the areas array does not match the member count');
  for (let i = 0; i < nm; i++) if (!(areas[i] > 0) || !Number.isFinite(areas[i])) return fail(`member ${i} has a non-positive area`);
  const active = new Array(nm);
  for (let i = 0; i < nm; i++) active[i] = !(opts.active && opts.active[i] === false);

  const L = new Float64Array(nm), cx = new Float64Array(nm), cy = new Float64Array(nm), kax = new Float64Array(nm);
  const K = new Array(ndof);
  for (let d = 0; d < ndof; d++) K[d] = new Float64Array(ndof);
  for (let i = 0; i < nm; i++) {
    const m = members[i];
    if (m.a < 0 || m.a >= nn || m.b < 0 || m.b >= nn) return fail(`member ${i} refers to a missing node`);
    const dx = nodes[m.b][0] - nodes[m.a][0], dy = nodes[m.b][1] - nodes[m.a][1];
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-9)) return fail(`member ${i} has zero length (nodes ${m.a} and ${m.b} coincide)`);
    L[i] = len; cx[i] = dx / len; cy[i] = dy / len;
    const g = problem.groups[m.group];
    const kk = active[i] ? g.E * areas[i] / len : 0;
    kax[i] = kk;
    if (!active[i]) continue;
    const c = cx[i], s = cy[i];
    const dofs = [2 * m.a, 2 * m.a + 1, 2 * m.b, 2 * m.b + 1];
    const kl = [
      [c * c, c * s, -c * c, -c * s],
      [c * s, s * s, -c * s, -s * s],
      [-c * c, -c * s, c * c, c * s],
      [-c * s, -s * s, c * s, s * s],
    ];
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) K[dofs[r]][dofs[q]] += kk * kl[r][q];
  }
  const F = new Float64Array(ndof);
  for (const [idx, v] of Object.entries(problem.loads)) {
    const i = Number(idx);
    if (!(i >= 0 && i < nn)) return fail(`load applied to unknown node ${idx}`);
    F[2 * i] += v[0]; F[2 * i + 1] += v[1];
  }
  const fixed = new Uint8Array(ndof);
  for (const [idx, v] of Object.entries(problem.supports)) {
    const i = Number(idx);
    if (!(i >= 0 && i < nn)) return fail(`support on unknown node ${idx}`);
    if (v[0]) fixed[2 * i] = 1;
    if (v[1]) fixed[2 * i + 1] = 1;
  }
  const free = [];
  for (let d = 0; d < ndof; d++) if (!fixed[d]) free.push(d);
  const nf = free.length;
  const u = new Float64Array(ndof);
  if (nf > 0) {
    const A = new Array(nf), b = new Float64Array(nf);
    for (let r = 0; r < nf; r++) {
      const row = new Float64Array(nf), Kr = K[free[r]];
      for (let q = 0; q < nf; q++) row[q] = Kr[free[q]];
      A[r] = row; b[r] = F[free[r]];
    }
    const sol = solveLinearSystem(A, b);
    if (sol.singular) return fail('unstable structure (mechanism): the stiffness matrix is singular');
    for (let r = 0; r < nf; r++) {
      if (!Number.isFinite(sol.x[r])) return fail('the solve produced a non-finite displacement');
      u[free[r]] = sol.x[r];
    }
    // residual check against the untouched stiffness matrix
    let rn = 0, fn = 0;
    for (let r = 0; r < nf; r++) {
      const Kr = K[free[r]];
      let s = -F[free[r]];
      for (let q = 0; q < nf; q++) s += Kr[free[q]] * u[free[q]];
      rn += s * s; fn += F[free[r]] * F[free[r]];
    }
    if (Math.sqrt(rn) > 1e-6 * (Math.sqrt(fn) + 1e-9)) return fail('ill-conditioned stiffness matrix (near mechanism)');
  }
  // member forces, utilizations, mass
  const N = new Float64Array(nm), stress = new Float64Array(nm), elong = new Float64Array(nm);
  const Ustress = new Float64Array(nm), Ubuckle = new Float64Array(nm), U = new Float64Array(nm);
  const slack = new Array(nm).fill(false);
  const groupMass = {};
  for (const key of Object.keys(problem.groups)) groupMass[key] = 0;
  const slackTol = 1e-9 * (problem.loadSum + 1);
  let mass = 0, maxU = -1, governingMember = -1, governingType = 'none', slackCount = 0;
  const FS = problem.FS, Keff = problem.Keff;
  for (let i = 0; i < nm; i++) {
    const m = members[i], g = problem.groups[m.group];
    const du = (u[2 * m.b] - u[2 * m.a]) * cx[i] + (u[2 * m.b + 1] - u[2 * m.a + 1]) * cy[i];
    elong[i] = du;
    N[i] = active[i] ? kax[i] * du : 0;
    stress[i] = N[i] / areas[i];
    Ustress[i] = Math.abs(N[i]) * FS / (areas[i] * g.sigmaAllow);
    Ubuckle[i] = 0;
    if (N[i] < 0 && problem.bucklingOn && g.buckling === 'square') {
      const I = areas[i] * areas[i] / 12;
      const Pcr = Math.PI * Math.PI * g.E * I / ((Keff * L[i]) ** 2);
      Ubuckle[i] = Math.abs(N[i]) * FS / Pcr;
    }
    if (g.tensionOnly && (N[i] < -slackTol || !active[i])) { slack[i] = true; slackCount++; }
    U[i] = Math.max(Ustress[i], Ubuckle[i]);
    const mg = areas[i] * L[i] * g.rho / 1000;
    mass += mg; groupMass[m.group] += mg;
    if (U[i] > maxU) { maxU = U[i]; governingMember = i; governingType = Ubuckle[i] > Ustress[i] ? 'buckling' : 'stress'; }
  }
  const reactions = {};
  for (let d = 0; d < ndof; d++) {
    if (!fixed[d]) continue;
    let s = -F[d];
    const Kd = K[d];
    for (let j = 0; j < ndof; j++) s += Kd[j] * u[j];
    const node = Math.floor(d / 2);
    if (!reactions[node]) reactions[node] = [0, 0];
    reactions[node][d % 2] = s;
  }
  const dispMag = new Float64Array(nn);
  let maxDisp = 0, maxDispNode = 0;
  for (let i = 0; i < nn; i++) {
    dispMag[i] = Math.hypot(u[2 * i], u[2 * i + 1]);
    if (dispMag[i] > maxDisp) { maxDisp = dispMag[i]; maxDispNode = i; }
  }
  return {
    ok: true, u, N, stress, L, elong, active, Ustress, Ubuckle, U, slack, slackCount, mass, groupMass, reactions,
    maxU, governingMember, governingType, dispMag, maxDisp, maxDispNode, releasePasses: 0, releaseSettled: true, slackForce: new Float64Array(nm),
  };
}

// Tension-only iteration for bracing wires: solve, release every tension-only member found in compression,
// re-solve, and re-activate a released member whose elongation would put it back in tension. Converges in one or
// two passes for crossed-wire bays. Released wires are flagged slack; the compression they showed in the linear
// pass is kept in slackForce for the optional "wires must stay taut" penalty.
export function solveTensionOnly(problem, nodes, areas, maxPasses = 30) {
  const nm = problem.members.length, active = new Array(nm).fill(true);
  const slackForce = new Float64Array(nm), seen = new Set();
  const slackTol = 1e-9 * (problem.loadSum + 1);
  for (let pass = 0; pass < maxPasses; pass++) {
    const key = active.map(Number).join('');
    if (seen.has(key)) return { ok: false, reason: 'Tension-only active-set cycle; no accepted equilibrium.', releaseSettled: false };
    seen.add(key);
    const sol = solveTruss(problem, nodes, areas, { active });
    if (!sol.ok) return { ok: false, reason: 'Tension-only active set is singular; no accepted response. Compression in a slack wire cannot stabilize this model. ' + sol.reason, releaseSettled: false };
    let changed = false;
    for (let i = 0; i < nm; i++) {
      const g = problem.groups[problem.members[i].group];
      if (!g.tensionOnly) continue;
      if (active[i] && sol.N[i] < -slackTol) { active[i] = false; slackForce[i] = sol.N[i]; changed = true; }
      else if (!active[i] && sol.elong[i] > 1e-9) { active[i] = true; slackForce[i] = 0; changed = true; }
    }
    if (!changed) {
      sol.releasePasses = pass + 1; sol.releaseSettled = true; sol.slackForce = slackForce; sol.keptForStability = [];
      return sol;
    }
  }
  return { ok: false, reason: 'Tension-only active set did not converge; no accepted equilibrium.', releaseSettled: false };
}

export function hasTensionOnly(problem) {
  return Object.values(problem.groups).some(g => g.tensionOnly);
}

// Pick the analysis model for a design: 'release' (tension-only iteration, default when the preset has wires)
// or 'linear' (every member active, slack wires only flagged).
export function analyze(problem, nodes, areas, slackMode = 'release') {
  if (slackMode !== 'linear' && hasTensionOnly(problem)) return solveTensionOnly(problem, nodes, areas);
  return solveTruss(problem, nodes, areas);
}

// ---------------------------------------------------------------------------
// 3. Inner sizing: fully stressed design (FSD) on areas, optional displacement limit
// ---------------------------------------------------------------------------

// opts: { mode: 'group' | 'individual', Amin (mm^2), maxIter (40), tol (1e-3),
//         dispLimit: null | { node, limit (mm) }, tautWires (bool), penaltyMass, slackMode: 'release' | 'linear' }
// Returns { ok, reason?, nodes, areas, mass, objective, feasible, sol, iterations, converged, polishScale,
//           dispScale, dispValue, dispLimit, governing: { type, member, U }, slackCount, tautPenalty, groupMass }
export function sizeMembers(problem, nodes, opts = {}) {
  const mode = opts.mode === 'individual' ? 'individual' : 'group';
  const Amin = Math.max(1e-6, num(opts.Amin, 1));
  const maxIter = Math.max(1, Math.floor(num(opts.maxIter, 40)));
  const tol = Math.max(1e-9, num(opts.tol, 1e-3));
  const penalty = num(opts.penaltyMass, PENALTY_MASS);
  const slackMode = opts.slackMode === 'linear' ? 'linear' : 'release';
  const solveTruss = (p, n, a) => analyze(p, n, a, slackMode);
  const members = problem.members, nm = members.length;
  const areas = presetAreas(problem).map(a => Math.max(Amin, a));
  // sizing units: one per group, or one per member
  const units = [];
  if (mode === 'group') {
    const byGroup = {};
    members.forEach((m, i) => { (byGroup[m.group] = byGroup[m.group] || []).push(i); });
    for (const list of Object.values(byGroup)) units.push(list);
  } else {
    for (let i = 0; i < nm; i++) units.push([i]);
  }
  const failed = (reason) => ({
    ok: false, reason, nodes, areas, mass: NaN, objective: penalty, feasible: false, sol: null,
    iterations: 0, converged: false, polishScale: 1, dispScale: 1, dispValue: null, dispLimit: null,
    governing: { type: 'mechanism', member: -1, U: NaN }, slackCount: 0, tautPenalty: 0, groupMass: {},
  });
  let sol = null, converged = false, iterations = 0;
  for (let it = 0; it < maxIter; it++) {
    sol = solveTruss(problem, nodes, areas);
    if (!sol.ok) return failed(sol.reason);
    iterations = it + 1;
    let allOk = true;
    for (const unit of units) {
      let Uu = 0;
      for (const i of unit) Uu = Math.max(Uu, sol.U[i]);
      const atMin = areas[unit[0]] <= Amin * (1 + 1e-12);
      if (Uu > 1 + tol) { allOk = false; break; }
      if (Uu < 1 - tol && !atMin) { allOk = false; break; }
    }
    if (allOk) { converged = true; break; }
    for (const unit of units) {
      let s = 0;
      for (const i of unit) s = Math.max(s, sol.Ustress[i], Math.sqrt(sol.Ubuckle[i]));
      const Anew = Math.max(Amin, areas[unit[0]] * s);
      for (const i of unit) areas[i] = Anew;
    }
  }
  if (!converged) {
    sol = solveTruss(problem, nodes, areas);
    if (!sol.ok) return failed(sol.reason);
  }
  // Feasibility polish: uniform scaling keeps the force distribution, so stress utilizations scale as 1/s and
  // Euler utilizations (I = A^2/12) as 1/s^2. Scaling every area by s = max(Ustress, sqrt(Ubuckle)) > 1 therefore
  // guarantees every U <= 1 exactly (to rounding) in determinate and indeterminate trusses alike.
  let polishScale = 1;
  for (let i = 0; i < nm; i++) polishScale = Math.max(polishScale, sol.Ustress[i], Math.sqrt(sol.Ubuckle[i]));
  if (polishScale > 1) {
    for (let i = 0; i < nm; i++) areas[i] *= polishScale;
    sol = solveTruss(problem, nodes, areas);
    if (!sol.ok) return failed(sol.reason);
  }
  // Optional displacement limit at one node, met by uniform scaling (displacements scale exactly as 1/s).
  let dispScale = 1, dispValue = null, dispLimit = null;
  if (opts.dispLimit && Number.isFinite(opts.dispLimit.limit) && opts.dispLimit.limit > 0) {
    const node = Math.floor(num(opts.dispLimit.node, 0));
    if (node < 0 || node >= nodes.length) return failed(`displacement limit refers to unknown node ${node}`);
    dispLimit = { node, limit: opts.dispLimit.limit };
    dispValue = sol.dispMag[node];
    if (dispValue > dispLimit.limit) {
      dispScale = dispValue / dispLimit.limit;
      for (let i = 0; i < nm; i++) areas[i] *= dispScale;
      sol = solveTruss(problem, nodes, areas);
      if (!sol.ok) return failed(sol.reason);
      dispValue = sol.dispMag[node];
    }
  }
  // Governing constraint
  let governing;
  if (dispScale > 1) governing = { type: 'displacement', member: -1, U: dispValue / dispLimit.limit };
  else if (sol.maxU < 1 - tol) governing = { type: 'minimum area', member: sol.governingMember, U: sol.maxU };
  else governing = { type: sol.governingType, member: sol.governingMember, U: sol.maxU };
  // Optional penalty for slack wires in tension-only groups. The measure is the compression the wires showed in
  // the linear pass (the "demand" for pre-tension), normalized by the total applied load, so it is continuous.
  let tautPenalty = 0;
  if (opts.tautWires && sol.slackCount > 0) {
    let sum = 0;
    for (let i = 0; i < nm; i++) {
      if (!sol.slack[i]) continue;
      sum += Math.abs(sol.active[i] ? sol.N[i] : (sol.slackForce ? sol.slackForce[i] : 0));
    }
    tautPenalty = sum / Math.max(problem.loadSum, 1e-9);
  }
  const feasible = sol.maxU <= 1 + U_TOL && (!dispLimit || dispValue <= dispLimit.limit * (1 + U_TOL)) && !(slackMode === 'linear' && sol.slackCount > 0);
  const objective = sol.mass * (1 + tautPenalty);
  return {
    ok: true, nodes, areas, mass: sol.mass, objective, feasible, sol, iterations, converged, polishScale,
    dispScale, dispValue, dispLimit, governing, slackCount: sol.slackCount, tautPenalty, groupMass: sol.groupMass, slackMode,
  };
}

// Nested objective: geometry in, minimum feasible mass (or finite penalty) out.
export function evaluateGeometry(problem, nodes, sizingOpts = {}) {
  return sizeMembers(problem, nodes, sizingOpts);
}

export function describeGoverning(gov, problem) {
  if (!gov) return 'n/a';
  if (gov.type === 'mechanism') return 'unstable geometry (penalized)';
  if (gov.type === 'displacement') return `displacement limit (U = ${gov.U.toFixed(3)})`;
  if (gov.type === 'minimum area') return `minimum area bound (max U = ${gov.U.toFixed(3)})`;
  const m = problem && problem.members[gov.member];
  const where = m ? `member ${gov.member} (${m.group} ${m.a}-${m.b})` : `member ${gov.member}`;
  const kind = gov.type === 'buckling' ? 'Euler buckling screen' : 'stress';
  return `${kind} on ${where}, U = ${gov.U.toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// 4. Design variable parametrizations (node positions as variables)
// ---------------------------------------------------------------------------

// Geometric analysis of a preset layout: lower and upper node rows, panels, mirror pairs, strut stations.
export function analyzeLayout(problem) {
  const nodes = problem.nodes0;
  const ys = nodes.map(p => p[1]), xs = nodes.map(p => p[0]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const eps = 1e-6;
  const lower = [], upper = [];
  nodes.forEach((p, i) => { if (Math.abs(p[1] - yMin) < eps) lower.push(i); else if (Math.abs(p[1] - yMax) < eps) upper.push(i); });
  const lowerX = [...new Set(lower.map(i => nodes[i][0]))].sort((a, b) => a - b);
  const panels = {};
  for (const i of upper) {
    const x = nodes[i][0];
    let left = xMin, right = xMax;
    for (const lx of lowerX) { if (lx < x - eps) left = lx; if (lx > x + eps) { right = lx; break; } }
    panels[i] = [left, right];
  }
  const mid = xMin + xMax;
  const pairs = [], centers = [], used = new Set();
  for (let a = 0; a < upper.length; a++) {
    const i = upper[a];
    if (used.has(i)) continue;
    if (Math.abs(2 * nodes[i][0] - mid) < eps) { centers.push(i); used.add(i); continue; }
    for (let b = a + 1; b < upper.length; b++) {
      const j = upper[b];
      if (used.has(j)) continue;
      if (Math.abs(nodes[i][0] + nodes[j][0] - mid) < eps && Math.abs(nodes[i][1] - nodes[j][1]) < eps) {
        pairs.push(nodes[i][0] <= nodes[j][0] ? [i, j] : [j, i]); used.add(i); used.add(j); break;
      }
    }
  }
  const unpaired = upper.filter(i => !used.has(i));
  // strut stations: an x shared by a lower and an upper node, strictly inside the span
  const stations = [];
  for (const lx of lowerX) {
    if (lx <= xMin + eps || lx >= xMax - eps) continue;
    const list = [];
    nodes.forEach((p, i) => { if (Math.abs(p[0] - lx) < eps) list.push(i); });
    if (list.some(i => upper.includes(i))) stations.push({ x: lx, nodes: list });
  }
  return { lower, upper, xMin, xMax, yMin, yMax, span: xMax - xMin, panels, pairs, centers, unpaired, stations };
}

// Default variable families offered by the page for each preset.
export function defaultVariableSpec(presetKey) {
  if (presetKey === 'wright-bay') {
    return {
      symmetric: true,
      families: [
        { type: 'gap', enabled: true, lower: 1000, upper: 2600, x0: 1850 },
        { type: 'strutX', enabled: false, minSpacing: 600 },
      ],
    };
  }
  return {
    symmetric: true,
    families: [
      { type: 'height', enabled: true, lower: 300, upper: 2500, x0: 1000 },
      { type: 'topY', enabled: false, lower: 300, upper: 2500 },
      { type: 'topX', enabled: false, margin: 50 },
    ],
  };
}

export const FAMILY_LABELS = {
  height: 'Common height h of all top-chord nodes',
  topY: 'Individual heights y of the top-chord nodes',
  topX: 'Horizontal positions x of the top-chord nodes within their panels',
  gap: 'Gap g between lower and upper spar (y of all upper nodes)',
  strutX: 'Positions x of the three interior strut stations (ordered, minimum spacing)',
};

// Sort and push apart station positions so that lo <= x1, x_k >= x_{k-1} + s, x_m <= hi.
export function repairOrdered(xs, lo, hi, s) {
  const v = xs.map(Number).sort((a, b) => a - b).map(x => Math.min(hi, Math.max(lo, x)));
  for (let k = 1; k < v.length; k++) v[k] = Math.max(v[k], v[k - 1] + s);
  v[v.length - 1] = Math.min(v[v.length - 1], hi);
  for (let k = v.length - 2; k >= 0; k--) v[k] = Math.min(v[k], v[k + 1] - s);
  return v;
}

// Build the mapping x -> nodes from a variable spec { symmetric, families: [...] }.
// Returns { n, vars:[{name,label,unit,lower,upper,x0}], lower, upper, x0, apply(x)->nodes, describe(x)->[{name,label,unit,value}], layout, sweepable }
export function buildParametrization(problem, spec) {
  const layout = analyzeLayout(problem);
  const nodes0 = problem.nodes0;
  const families = (spec && spec.families ? spec.families : []).filter(f => f && f.enabled !== false);
  if (!families.length) throw new Error('select at least one design variable family');
  const symmetric = !spec || spec.symmetric !== false;
  const types = families.map(f => f.type);
  const yTypes = types.filter(t => t === 'height' || t === 'gap' || t === 'topY');
  if (yTypes.length > 1) throw new Error('choose either the common height (or gap) or the individual node heights, not both');
  if (!layout.upper.length) throw new Error('the preset has no upper node row to move');
  const vars = [], blocks = [];
  for (const fam of families) {
    switch (fam.type) {
      case 'height':
      case 'gap': {
        const isGap = fam.type === 'gap';
        const lower = num(fam.lower, isGap ? 1000 : 300), upper = num(fam.upper, isGap ? 2600 : 2500);
        if (!(upper > lower)) throw new Error(`${isGap ? 'gap' : 'height'} bounds must satisfy lower < upper`);
        const y0 = nodes0[layout.upper[0]][1];
        const x0 = Math.min(upper, Math.max(lower, num(fam.x0, y0)));
        vars.push({ name: isGap ? 'g' : 'h', label: isGap ? 'spar gap g' : 'truss height h', unit: 'mm', lower, upper, x0 });
        const idx = layout.upper.slice();
        blocks.push({ count: 1, apply: (xs, nodes) => { for (const i of idx) nodes[i][1] = xs[0]; }, values: xs => [xs[0]] });
        break;
      }
      case 'topY': {
        const lower = num(fam.lower, 300), upper = num(fam.upper, 2500);
        if (!(upper > lower)) throw new Error('node height bounds must satisfy lower < upper');
        const units = symmetric
          ? [...layout.pairs, ...layout.centers.map(i => [i]), ...layout.unpaired.map(i => [i])]
          : layout.upper.map(i => [i]);
        units.sort((p, q) => nodes0[p[0]][0] - nodes0[q[0]][0]);
        for (const grp of units) {
          const y0 = Math.min(upper, Math.max(lower, nodes0[grp[0]][1]));
          vars.push({ name: `y${grp.join('/')}`, label: `y of node${grp.length > 1 ? 's' : ''} ${grp.join(' and ')}`, unit: 'mm', lower, upper, x0: y0 });
        }
        blocks.push({ count: units.length, apply: (xs, nodes) => { units.forEach((grp, k) => { for (const i of grp) nodes[i][1] = xs[k]; }); }, values: xs => xs.slice() });
        break;
      }
      case 'topX': {
        const margin = Math.max(0, num(fam.margin, 50));
        const units = symmetric
          ? [...layout.pairs, ...layout.unpaired.map(i => [i])]
          : layout.upper.map(i => [i]);
        units.sort((p, q) => nodes0[p[0]][0] - nodes0[q[0]][0]);
        if (!units.length) throw new Error('no movable top-chord nodes for the x family');
        for (const grp of units) {
          const i = grp[0], panel = layout.panels[i];
          const lower = panel[0] + margin, upper = panel[1] - margin;
          if (!(upper > lower)) throw new Error(`panel margin ${margin} mm is too large for the panel of node ${i}`);
          const x0 = Math.min(upper, Math.max(lower, nodes0[i][0]));
          vars.push({ name: `x${i}`, label: `x of node ${i}${grp.length > 1 ? ` (mirrored to node ${grp[1]})` : ''}`, unit: 'mm', lower, upper, x0 });
        }
        const mid = layout.xMin + layout.xMax;
        blocks.push({
          count: units.length,
          apply: (xs, nodes) => { units.forEach((grp, k) => { nodes[grp[0]][0] = xs[k]; if (grp.length > 1) nodes[grp[1]][0] = mid - xs[k]; }); },
          values: xs => xs.slice(),
        });
        break;
      }
      case 'strutX': {
        const s = Math.max(1, num(fam.minSpacing, 600));
        const stations = layout.stations;
        const m = stations.length;
        if (!m) throw new Error('this preset has no interior strut stations to move');
        if (s * (m + 1) > layout.span + 1e-9) throw new Error(`minimum spacing ${s} mm is too large for ${m} stations on a ${layout.span} mm span`);
        const lo = layout.xMin + s, hi = layout.xMax - s;
        stations.forEach((st, k) => vars.push({ name: `xs${k + 1}`, label: `x of strut station ${k + 1}`, unit: 'mm', lower: lo, upper: hi, x0: st.x }));
        blocks.push({
          count: m,
          apply: (xs, nodes) => { const rep = repairOrdered(xs, lo, hi, s); stations.forEach((st, k) => { for (const i of st.nodes) nodes[i][0] = rep[k]; }); },
          values: xs => repairOrdered(xs, lo, hi, s),
        });
        break;
      }
      default:
        throw new Error(`unknown design variable family "${fam.type}"`);
    }
  }
  const n = vars.length;
  const lower = vars.map(v => v.lower), upper = vars.map(v => v.upper), x0 = vars.map(v => v.x0);
  const apply = x => {
    if (!x || x.length !== n) throw new Error(`expected ${n} design variables, got ${x ? x.length : 0}`);
    const nodes = clone2(nodes0);
    let off = 0;
    for (const b of blocks) { b.apply(x.slice(off, off + b.count), nodes); off += b.count; }
    return nodes;
  };
  const describe = x => {
    const out = [];
    let off = 0;
    for (const b of blocks) {
      const vals = b.values(x.slice(off, off + b.count));
      for (let k = 0; k < b.count; k++) { const v = vars[off + k]; out.push({ name: v.name, label: v.label, unit: v.unit, value: vals[k] }); }
      off += b.count;
    }
    return out;
  };
  const sweepable = n === 1 && (types[0] === 'height' || types[0] === 'gap');
  return { n, vars, names: vars.map(v => v.name), lower, upper, x0, apply, describe, layout, symmetric, types, sweepable };
}

// The 1-D parametrization used for the classical sweep (height for the Warren truss, gap for the Wright bay).
export function buildSweepParametrization(problem, spec) {
  const isGap = problem.key === 'wright-bay' || (problem.loadCaseNames || []).includes('point lift');
  const type = isGap ? 'gap' : 'height';
  const src = (spec && spec.families || []).find(f => f && f.type === type) || defaultVariableSpec(problem.key).families.find(f => f.type === type);
  return buildParametrization(problem, { symmetric: true, families: [{ type, enabled: true, lower: src.lower, upper: src.upper, x0: src.x0 }] });
}

// ---------------------------------------------------------------------------
// 5. Classical 1-D sweep
// ---------------------------------------------------------------------------

export function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a + (b - a) * i / (n - 1);
  return out;
}

// Evaluate the nested objective along one variable. param must have n === 1.
export function sweep1D(problem, param, sizingOpts, samples = 80, onSample = null) {
  if (param.n !== 1) throw new Error('the sweep needs exactly one design variable');
  const xs = linspace(param.lower[0], param.upper[0], Math.max(2, Math.floor(samples)));
  const res = { name: param.vars[0].name, label: param.vars[0].label, unit: param.vars[0].unit, x: [], mass: [], objective: [], feasible: [], governing: [], groupMass: {}, best: null };
  for (const key of Object.keys(problem.groups)) res.groupMass[key] = [];
  let bestI = -1;
  xs.forEach((x, i) => {
    const r = evaluateGeometry(problem, param.apply([x]), sizingOpts);
    res.x.push(x);
    res.mass.push(r.ok ? r.mass : NaN);
    res.objective.push(r.objective);
    res.feasible.push(r.ok && r.feasible);
    res.governing.push(r.ok ? r.governing.type : 'mechanism');
    for (const key of Object.keys(res.groupMass)) res.groupMass[key].push(r.ok ? r.groupMass[key] : NaN);
    if (r.ok && r.feasible && (bestI < 0 || r.objective < res.objective[bestI])) bestI = i;
    if (onSample) onSample(i, xs.length);
  });
  if (bestI >= 0) res.best = { index: bestI, x: xs[bestI], mass: res.mass[bestI], objective: res.objective[bestI], governing: res.governing[bestI] };
  return res;
}

// ---------------------------------------------------------------------------
// 6. Outer optimizer 1: bounded Nelder-Mead simplex (adaptive parameters, restarts)
// ---------------------------------------------------------------------------
// Both optimizers work in normalized coordinates z in [0,1]^n, x = lower + z (upper - lower), and clamp every
// trial point to the box before evaluating. They are exposed as steppers (one iteration per step()) so a worker
// can yield between steps, plus convenience functions that run to completion.

const BIG = 1e300;

export function createNelderMead(f, x0, lower, upper, opts = {}) {
  const n = x0.length;
  if (n < 1) throw new Error('Nelder-Mead needs at least one variable');
  const lo = lower.map(Number), hi = upper.map(Number);
  const range = lo.map((l, i) => (hi[i] > l ? hi[i] - l : 1));
  const toX = z => z.map((v, i) => lo[i] + v * range[i]);
  const clampZ = z => z.map((v, i) => (hi[i] > lo[i] ? Math.min(1, Math.max(0, v)) : 0));
  const tolX = num(opts.tolX, 1e-6), tolF = num(opts.tolF, 1e-9), tolFabs = num(opts.tolFabs, 1e-12);
  const maxEvals = Math.max(n + 2, Math.floor(num(opts.maxEvals, 400 + 200 * n)));
  const maxIter = Math.max(1, Math.floor(num(opts.maxIter, 1e9)));
  const restarts = Math.max(0, Math.floor(num(opts.restarts, 0)));
  const initialStep = Math.min(0.5, Math.max(1e-6, num(opts.initialStep, 0.1)));
  const rng = makeRng(num(opts.seed, 12345));
  const onImprove = typeof opts.onImprove === 'function' ? opts.onImprove : null;
  // adaptive parameters (Gao and Han 2012); for n = 2 they equal the classical values
  const alpha = 1, beta = 1 + 2 / n, gamma = 0.75 - 1 / (2 * n), delta = 1 - 1 / n;
  const st = {
    n, evals: 0, iterations: 0, best: null, history: [], done: false, reason: '', converged: false,
    restartsDone: 0, simplex: [], shrinks: 0,
  };
  function F(z) {
    const x = toX(z);
    let v = f(x);
    if (typeof v !== 'number' || !Number.isFinite(v)) v = BIG;
    st.evals++;
    if (!st.best || v < st.best.f) {
      st.best = { x, z: z.slice(), f: v, evals: st.evals };
      if (onImprove) onImprove(st.best);
    }
    return v;
  }
  function buildSimplex(zc, steps) {
    const verts = [{ z: zc, f: F(zc) }];
    for (let i = 0; i < n; i++) {
      const z = zc.slice();
      let cand = zc[i] + steps[i];
      if (cand < 0 || cand > 1) cand = zc[i] - steps[i];
      z[i] = Math.min(1, Math.max(0, cand));
      if (z[i] === zc[i]) z[i] = zc[i] > 0.5 ? zc[i] - Math.abs(steps[i]) : zc[i] + Math.abs(steps[i]);
      z[i] = Math.min(1, Math.max(0, z[i]));
      verts.push({ z, f: F(z) });
    }
    return verts;
  }
  const z0 = clampZ(x0.map((v, i) => (v - lo[i]) / range[i]));
  st.simplex = buildSimplex(z0, new Array(n).fill(initialStep));
  const sortSimplex = () => st.simplex.sort((a, b) => a.f - b.f);
  function converged() {
    sortSimplex();
    const s = st.simplex;
    let size = 0;
    for (let i = 1; i <= n; i++) for (let j = 0; j < n; j++) size = Math.max(size, Math.abs(s[i].z[j] - s[0].z[j]));
    const spread = s[n].f - s[0].f;
    return size < tolX && spread <= tolF * Math.abs(s[0].f) + tolFabs;
  }
  function restart() {
    st.restartsDone++;
    const zb = st.best.z.slice();
    const zc = clampZ(zb.map(v => v + 0.02 * (2 * rng() - 1)));
    const steps = new Array(n);
    for (let i = 0; i < n; i++) steps[i] = 0.5 * initialStep * (rng() < 0.5 ? -1 : 1);
    st.simplex = buildSimplex(zc, steps);
  }
  function finish(reason) { st.done = true; st.reason = reason; }
  function step() {
    if (st.done) return true;
    sortSimplex();
    const s = st.simplex;
    const best = s[0], worst = s[n], second = s[n - 1];
    const zc = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) zc[j] += s[i].z[j] / n;
    const zr = clampZ(zc.map((c, j) => c + alpha * (c - worst.z[j])));
    const fr = F(zr);
    if (fr < best.f) {
      const ze = clampZ(zc.map((c, j) => c + beta * (zr[j] - c)));
      const fe = F(ze);
      s[n] = fe < fr ? { z: ze, f: fe } : { z: zr, f: fr };
    } else if (fr < second.f) {
      s[n] = { z: zr, f: fr };
    } else {
      let accepted = false;
      if (fr < worst.f) {
        const zoc = clampZ(zc.map((c, j) => c + gamma * (zr[j] - c)));
        const foc = F(zoc);
        if (foc <= fr) { s[n] = { z: zoc, f: foc }; accepted = true; }
      } else {
        const zic = clampZ(zc.map((c, j) => c + gamma * (worst.z[j] - c)));
        const fic = F(zic);
        if (fic < worst.f) { s[n] = { z: zic, f: fic }; accepted = true; }
      }
      if (!accepted) {
        st.shrinks++;
        for (let i = 1; i <= n; i++) {
          const z = clampZ(s[i].z.map((v, j) => best.z[j] + delta * (v - best.z[j])));
          s[i] = { z, f: F(z) };
        }
      }
    }
    st.iterations++;
    st.history.push({ evals: st.evals, f: st.best.f });
    if (converged()) {
      st.converged = true;
      if (st.restartsDone < restarts && st.evals < maxEvals) { restart(); return false; }
      finish(st.restartsDone ? `converged after ${st.restartsDone} restart(s)` : 'converged (simplex size and spread below tolerance)');
      return true;
    }
    if (st.evals >= maxEvals) { finish('maximum number of evaluations reached'); return true; }
    if (st.iterations >= maxIter) { finish('maximum number of iterations reached'); return true; }
    return false;
  }
  function result() {
    return { x: st.best.x.slice(), f: st.best.f, evals: st.evals, iterations: st.iterations, history: st.history.slice(), converged: st.converged, reason: st.reason, restarts: st.restartsDone, method: 'Nelder-Mead' };
  }
  st.history.push({ evals: st.evals, f: st.best.f });
  return {
    step, result,
    get done() { return st.done; }, get best() { return st.best; }, get evals() { return st.evals; },
    get iterations() { return st.iterations; }, get history() { return st.history; }, get reason() { return st.reason; },
    maxEvals,
  };
}

export function nelderMead(f, x0, lower, upper, opts = {}) {
  const s = createNelderMead(f, x0, lower, upper, opts);
  while (!s.done) s.step();
  return s.result();
}

// ---------------------------------------------------------------------------
// 7. Outer optimizer 2: compact (mu/mu_w, lambda) CMA-ES with the seeded mulberry32 generator
// ---------------------------------------------------------------------------

// Cyclic Jacobi eigen-decomposition of a symmetric matrix (n small). Returns { values, vectors } (columns).
export function symmetricEigen(C) {
  const n = C.length;
  const A = C.map(r => r.slice());
  const V = [];
  for (let i = 0; i < n; i++) { V.push(new Array(n).fill(0)); V[i][i] = 1; }
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}

export function createCmaEs(f, x0, lower, upper, opts = {}) {
  const n = x0.length;
  if (n < 1) throw new Error('CMA-ES needs at least one variable');
  const lo = lower.map(Number), hi = upper.map(Number);
  const range = lo.map((l, i) => (hi[i] > l ? hi[i] - l : 1));
  const toX = z => z.map((v, i) => lo[i] + v * range[i]);
  const clampZ = z => z.map((v, i) => (hi[i] > lo[i] ? Math.min(1, Math.max(0, v)) : 0));
  const lambda = Math.max(2, Math.floor(num(opts.lambda, 4 + Math.floor(3 * Math.log(n)))));
  const mu = Math.max(1, Math.floor(lambda / 2));
  const wRaw = [];
  for (let i = 0; i < mu; i++) wRaw.push(Math.log(mu + 0.5) - Math.log(i + 1));
  const wSum = wRaw.reduce((a, b) => a + b, 0);
  const w = wRaw.map(v => v / wSum);
  const mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n);
  const cs = (mueff + 2) / (n + mueff + 5);
  const c1 = 2 / ((n + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff));
  const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  const maxGen = Math.max(1, Math.floor(num(opts.generations, 60)));
  const maxEvals = Math.floor(num(opts.maxEvals, Infinity));
  const tolX = num(opts.tolX, 1e-9);
  const tolFun = num(opts.tolFun, 0);
  const rng = makeRng(num(opts.seed, 12345));
  const onImprove = typeof opts.onImprove === 'function' ? opts.onImprove : null;
  let sigma = Math.min(1, Math.max(1e-6, num(opts.sigma0, 0.3)));
  let xmean = clampZ(x0.map((v, i) => (v - lo[i]) / range[i]));
  const pc = new Array(n).fill(0), ps = new Array(n).fill(0);
  let B = [], D = new Array(n).fill(1), C = [], invsqrtC = [];
  for (let i = 0; i < n; i++) {
    B.push(new Array(n).fill(0)); C.push(new Array(n).fill(0)); invsqrtC.push(new Array(n).fill(0));
    B[i][i] = 1; C[i][i] = 1; invsqrtC[i][i] = 1;
  }
  const st = { n, lambda, mu, evals: 0, generations: 0, best: null, history: [], done: false, reason: '', converged: false, sigma, condition: 1 };
  function F(zRaw) {
    const zc = clampZ(zRaw);
    const x = toX(zc);
    let v = f(x);
    if (typeof v !== 'number' || !Number.isFinite(v)) v = BIG;
    st.evals++;
    if (!st.best || v < st.best.f) {
      st.best = { x, z: zc, f: v, evals: st.evals };
      if (onImprove) onImprove(st.best);
    }
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (zRaw[i] - zc[i]) ** 2;
    return { fx: v, d2 };
  }
  // the start point is evaluated once: it seeds the incumbent and sets the bound-penalty scale
  const first = F(xmean);
  const penaltyCoef = num(opts.boundPenalty, 100 * (Math.abs(first.fx) + 1e-12));
  st.history.push({ evals: st.evals, f: st.best.f });
  let gauss = null;
  function randn() {
    if (gauss !== null) { const g = gauss; gauss = null; return g; }
    let u1 = rng(); if (u1 < 1e-300) u1 = 1e-300;
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    gauss = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  }
  function finish(reason) { st.done = true; st.reason = reason; }
  function step() {
    if (st.done) return true;
    const arx = [], fit = [];
    for (let k = 0; k < lambda; k++) {
      const z = new Array(n);
      for (let i = 0; i < n; i++) z[i] = randn() * D[i];
      const x = new Array(n);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += B[i][j] * z[j]; x[i] = xmean[i] + sigma * s; }
      const r = F(x);
      arx.push(x); fit.push(r.fx + penaltyCoef * r.d2);
      if (st.evals >= maxEvals) break;
    }
    const idx = fit.map((v, i) => i).sort((a, b) => fit[a] - fit[b]);
    const m = Math.min(mu, idx.length);
    const xold = xmean.slice();
    xmean = new Array(n).fill(0);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) xmean[j] += w[i] * arx[idx[i]][j];
    if (m < mu) { const sw = w.slice(0, m).reduce((a, b) => a + b, 0); for (let j = 0; j < n; j++) xmean[j] /= sw; }
    st.generations++;
    // evolution paths
    const dmean = xmean.map((v, j) => (v - xold[j]) / sigma);
    const cinv = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += invsqrtC[i][j] * dmean[j]; cinv[i] = s; }
    const csf = Math.sqrt(cs * (2 - cs) * mueff);
    let psn = 0;
    for (let i = 0; i < n; i++) { ps[i] = (1 - cs) * ps[i] + csf * cinv[i]; psn += ps[i] * ps[i]; }
    psn = Math.sqrt(psn);
    const hsig = psn / Math.sqrt(1 - Math.pow(1 - cs, 2 * st.generations)) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    const ccf = Math.sqrt(cc * (2 - cc) * mueff);
    for (let i = 0; i < n; i++) pc[i] = (1 - cc) * pc[i] + hsig * ccf * dmean[i];
    // covariance update (rank-one plus rank-mu)
    const Cn = [];
    for (let i = 0; i < n; i++) {
      Cn.push(new Array(n).fill(0));
      for (let j = 0; j < n; j++) {
        let rankmu = 0;
        for (let k = 0; k < m; k++) rankmu += w[k] * (arx[idx[k]][i] - xold[i]) * (arx[idx[k]][j] - xold[j]) / (sigma * sigma);
        Cn[i][j] = (1 - c1 - cmu) * C[i][j] + c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * C[i][j]) + cmu * rankmu;
      }
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = 0.5 * (Cn[i][j] + Cn[j][i]); Cn[i][j] = v; Cn[j][i] = v; }
    C = Cn;
    sigma *= Math.exp((cs / damps) * (psn / chiN - 1));
    sigma = Math.min(sigma, 10);
    st.sigma = sigma;
    const eig = symmetricEigen(C);
    B = eig.vectors;
    D = eig.values.map(v => Math.sqrt(Math.max(v, 1e-30)));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += B[i][k] * (1 / D[k]) * B[j][k];
      invsqrtC[i][j] = s;
    }
    const dmax = Math.max(...D), dmin = Math.min(...D);
    st.condition = dmax / dmin;
    st.history.push({ evals: st.evals, f: st.best.f });
    if (st.generations >= maxGen) { st.converged = false; finish('generation budget used'); return true; }
    if (st.evals >= maxEvals) { finish('maximum number of evaluations reached'); return true; }
    if (sigma * dmax < tolX) { st.converged = true; finish('step size below tolerance'); return true; }
    if (tolFun > 0 && fit.length > 1 && fit[idx[idx.length - 1]] - fit[idx[0]] < tolFun) { st.converged = true; finish('population fitness spread below tolerance'); return true; }
    if (st.condition > 1e14) { finish('covariance matrix ill-conditioned'); return true; }
    return false;
  }
  function result() {
    return { x: st.best.x.slice(), f: st.best.f, evals: st.evals, iterations: st.generations, generations: st.generations, lambda, mu, history: st.history.slice(), converged: st.converged, reason: st.reason, sigma: st.sigma, method: 'CMA-ES' };
  }
  return {
    step, result, lambda, mu, maxGen,
    get done() { return st.done; }, get best() { return st.best; }, get evals() { return st.evals; },
    get generations() { return st.generations; }, get history() { return st.history; }, get reason() { return st.reason; },
  };
}

export function cmaEs(f, x0, lower, upper, opts = {}) {
  const s = createCmaEs(f, x0, lower, upper, opts);
  while (!s.done) s.step();
  return s.result();
}

// ---------------------------------------------------------------------------
// 8. Verification: rebuild from plain numbers, solve with the exact solver, re-check every constraint
// ---------------------------------------------------------------------------

// opts: { dispLimit: {node, limit} | null, slackMode: 'release' | 'linear' }
export function verifyDesign(problem, nodes, areas, opts = {}) {
  const nodesC = nodes.map(p => [Number(p[0]), Number(p[1])]);
  const areasC = Array.from(areas, Number);
  const sol = analyze(problem, nodesC, areasC, opts.slackMode === 'linear' ? 'linear' : 'release');
  if (!sol.ok) return { feasible: false, reason: sol.reason, reasons: [sol.reason], mass: NaN, utilizations: [], governing: null, slack: [], slackCount: 0, sol: null };
  const reasons = [];
  let feasible = true;
  if (opts.slackMode === 'linear' && sol.slackCount > 0) { feasible = false; reasons.push('Compressed wires: linear comparison only, no admissible tension-only response.'); }
  for (let i = 0; i < sol.U.length; i++) {
    if (sol.U[i] > 1 + U_TOL) { feasible = false; reasons.push(`member ${i} utilization ${sol.U[i].toFixed(4)} exceeds 1`); }
  }
  let dispCheck = null;
  if (opts.dispLimit && Number.isFinite(opts.dispLimit.limit) && opts.dispLimit.limit > 0) {
    const node = Math.floor(opts.dispLimit.node);
    const d = sol.dispMag[node];
    dispCheck = { node, limit: opts.dispLimit.limit, value: d, U: d / opts.dispLimit.limit };
    if (d > opts.dispLimit.limit * (1 + U_TOL)) { feasible = false; reasons.push(`displacement at node ${node} is ${d.toFixed(3)} mm, above the limit ${opts.dispLimit.limit} mm`); }
  }
  let governing;
  if (dispCheck && dispCheck.U >= sol.maxU) governing = { type: 'displacement', member: -1, U: dispCheck.U };
  else governing = { type: sol.governingType, member: sol.governingMember, U: sol.maxU };
  return { feasible, reason: feasible ? 'all constraints satisfied on the fresh solve' : reasons.join('; '), reasons, mass: sol.mass, utilizations: Array.from(sol.U), governing, slack: sol.slack, slackCount: sol.slackCount, dispCheck, sol };
}

// ---------------------------------------------------------------------------
// 9. Input validation (readable messages, no exceptions for ordinary mistakes)
// ---------------------------------------------------------------------------

export function validateInputs(inp) {
  const errors = [];
  if (!TRUSS_PRESETS[inp.presetKey]) errors.push(`unknown preset "${inp.presetKey}"`);
  if (!(inp.FS >= 1)) errors.push('the safety factor FS must be at least 1');
  if (!(inp.K > 0)) errors.push('the effective length factor K must be positive');
  const s = inp.sizing || {};
  if (!(s.Amin > 0)) errors.push('the minimum member area must be positive');
  if (s.dispLimit && !(s.dispLimit.limit > 0)) errors.push('the displacement limit must be positive');
  const fams = (inp.variables && inp.variables.families || []).filter(f => f.enabled !== false);
  if (!fams.length) errors.push('select at least one design variable family');
  for (const f of fams) {
    if ((f.type === 'height' || f.type === 'gap' || f.type === 'topY') && !(f.upper > f.lower)) errors.push(`${FAMILY_LABELS[f.type] || f.type}: lower bound must be below the upper bound`);
    if ((f.type === 'height' || f.type === 'gap') && Number.isFinite(f.x0) && (f.x0 < f.lower || f.x0 > f.upper)) errors.push(`${FAMILY_LABELS[f.type]}: the start value must lie inside the bounds`);
    if (f.type === 'topX' && !(f.margin >= 0)) errors.push('the panel margin must be zero or positive');
    if (f.type === 'strutX' && !(f.minSpacing > 0)) errors.push('the minimum strut spacing must be positive');
  }
  const yTypes = fams.filter(f => f.type === 'height' || f.type === 'gap' || f.type === 'topY');
  if (yTypes.length > 1) errors.push('choose either the common height (or gap) or the individual node heights, not both');
  const nm = inp.nm || {};
  if (nm.restarts !== undefined && !(nm.restarts >= 0 && nm.restarts <= 10)) errors.push('Nelder-Mead restarts must be between 0 and 10');
  const cma = inp.cma || {};
  if (cma.generations !== undefined && !(cma.generations >= 1 && cma.generations <= 2000)) errors.push('CMA-ES generations must be between 1 and 2000');
  if (inp.sweep && inp.sweep.enabled && !(inp.sweep.samples >= 5 && inp.sweep.samples <= 2000)) errors.push('sweep samples must be between 5 and 2000');
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// 10. Campaign driver shared by the Web Worker and the in-page fallback
// ---------------------------------------------------------------------------
// payload: { presetKey, loadCase, FS, K, bucklingOn, sizing: {...}, variables: {...}, nm: {restarts, maxEvals},
//            cma: {generations}, seed, sweep: { enabled, samples } }
// post(msg) receives: start, sweep, progress, nm, cma, done, cancelled.

function compactRecord(best, detail) {
  if (!detail || !detail.ok) {
    return { evals: best.evals, f: best.f, mass: NaN, x: best.x.slice(), nodes: detail ? clone2(detail.nodes) : null, areas: null, U: null, slack: null, feasible: false, governing: detail ? detail.governing : null };
  }
  return {
    evals: best.evals, f: best.f, mass: detail.mass, x: best.x.slice(), nodes: clone2(detail.nodes), areas: Array.from(detail.areas),
    U: Array.from(detail.sol.U), slack: detail.sol.slack.slice(), feasible: detail.feasible, governing: detail.governing,
  };
}

export function summarizeDesign(problem, detail, x, param) {
  if (!detail.ok) return { ok: false, reason: detail.reason, mass: NaN, objective: detail.objective, feasible: false };
  return {
    ok: true, mass: detail.mass, objective: detail.objective, feasible: detail.feasible, nodes: clone2(detail.nodes),
    areas: Array.from(detail.areas), U: Array.from(detail.sol.U), Ustress: Array.from(detail.sol.Ustress), Ubuckle: Array.from(detail.sol.Ubuckle),
    N: Array.from(detail.sol.N), stress: Array.from(detail.sol.stress), L: Array.from(detail.sol.L), slack: detail.sol.slack.slice(),
    active: detail.sol.active.slice(), releasePasses: detail.sol.releasePasses, releaseSettled: detail.sol.releaseSettled, slackMode: detail.slackMode,
    slackCount: detail.slackCount, governing: detail.governing, governingText: describeGoverning(detail.governing, problem),
    groupMass: detail.groupMass, iterations: detail.iterations, converged: detail.converged, polishScale: detail.polishScale,
    dispScale: detail.dispScale, dispValue: detail.dispValue, dispLimit: detail.dispLimit, tautPenalty: detail.tautPenalty,
    x: x ? x.slice() : null, vars: x && param ? param.describe(x) : null, maxDisp: detail.sol.maxDisp, maxDispNode: detail.sol.maxDispNode,
  };
}

export async function runCampaign(payload, post, isCancelled = () => false, yieldFn = null) {
  const problem = makeProblem(payload.presetKey, { loadCase: payload.loadCase, FS: payload.FS, K: payload.K, bucklingOn: payload.bucklingOn });
  const sizingOpts = Object.assign({}, payload.sizing || {});
  const param = buildParametrization(problem, payload.variables || defaultVariableSpec(payload.presetKey));
  const yieldNow = yieldFn || (() => new Promise(r => setTimeout(r, 0)));
  let lastYield = now(), lastPost = 0;
  const maybeYield = async () => { if (now() - lastYield > 12) { await yieldNow(); lastYield = now(); } };
  const cancelled = () => { if (isCancelled()) { post({ type: 'cancelled' }); return true; } return false; };
  const out = { problemKey: problem.key, param: { n: param.n, names: param.names, vars: param.vars, lower: param.lower, upper: param.upper, x0: param.x0, sweepable: param.sweepable, types: param.types } };

  // Student's design point: start geometry with the preset areas, and the same geometry with sized members.
  const nodesStart = param.apply(param.x0);
  const presetSol = analyze(problem, nodesStart, presetAreas(problem), sizingOpts.slackMode);
  const sizedStart = evaluateGeometry(problem, nodesStart, sizingOpts);
  out.start = {
    x: param.x0.slice(), vars: param.describe(param.x0), nodes: clone2(nodesStart),
    preset: presetSol.ok
      ? { ok: true, mass: presetSol.mass, maxU: presetSol.maxU, feasible: presetSol.maxU <= 1 + U_TOL, governing: { type: presetSol.governingType, member: presetSol.governingMember, U: presetSol.maxU }, governingText: describeGoverning({ type: presetSol.governingType, member: presetSol.governingMember, U: presetSol.maxU }, problem), areas: presetAreas(problem), U: Array.from(presetSol.U), slack: presetSol.slack.slice(), active: presetSol.active.slice(), slackCount: presetSol.slackCount }
      : { ok: false, reason: presetSol.reason, mass: NaN, feasible: false },
    sized: summarizeDesign(problem, sizedStart, param.x0, param),
  };
  post({ type: 'start', start: out.start, param: out.param });
  if (cancelled()) return null;

  // Classical 1-D sweep
  if (payload.sweep && payload.sweep.enabled !== false) {
    const sparam = buildSweepParametrization(problem, payload.variables);
    const samples = Math.max(5, Math.floor(num(payload.sweep.samples, 80)));
    const xs = linspace(sparam.lower[0], sparam.upper[0], samples);
    const res = { name: sparam.vars[0].name, label: sparam.vars[0].label, unit: 'mm', x: [], mass: [], objective: [], feasible: [], governing: [], groupMass: {}, best: null, span: sparam.layout.span };
    for (const key of Object.keys(problem.groups)) res.groupMass[key] = [];
    let bestI = -1;
    for (let i = 0; i < xs.length; i++) {
      if (cancelled()) return null;
      const r = evaluateGeometry(problem, sparam.apply([xs[i]]), sizingOpts);
      res.x.push(xs[i]); res.mass.push(r.ok ? r.mass : NaN); res.objective.push(r.objective);
      res.feasible.push(r.ok && r.feasible); res.governing.push(r.ok ? r.governing.type : 'mechanism');
      for (const key of Object.keys(res.groupMass)) res.groupMass[key].push(r.ok ? r.groupMass[key] : NaN);
      if (r.ok && r.feasible && (bestI < 0 || r.objective < res.objective[bestI])) bestI = i;
      if (i % 8 === 0) { post({ type: 'progress', stage: 'sweep', frac: 0.2 * (i + 1) / xs.length, evals: i + 1, bestF: bestI >= 0 ? res.objective[bestI] : NaN, incumbent: null }); await maybeYield(); }
    }
    if (bestI >= 0) res.best = { index: bestI, x: xs[bestI], mass: res.mass[bestI], objective: res.objective[bestI], governing: res.governing[bestI] };
    out.sweep = res;
    post({ type: 'sweep', sweep: res });
  }

  // Nested objective
  let lastDetail = null;
  const f = x => { lastDetail = evaluateGeometry(problem, param.apply(x), sizingOpts); return lastDetail.objective; };

  // Runs a stepper to completion (or until cancelled), streaming progress. Returns true when finished.
  async function drive(stepper, stage, fracBase, fracSpan, fracOf, traj) {
    while (!stepper.done) {
      stepper.step();
      if (isCancelled()) return false;
      const t = now();
      if (t - lastPost > 40) {
        lastPost = t;
        const inc = traj.length ? traj[traj.length - 1] : null;
        post({ type: 'progress', stage, frac: fracBase + fracSpan * Math.min(1, fracOf()), evals: stepper.evals, bestF: stepper.best ? stepper.best.f : NaN, incumbent: inc });
      }
      await maybeYield();
    }
    return true;
  }
  // Packs the current best of a stepper (complete or partial) with its sized design.
  function packResult(stepper, traj, partial) {
    const r = stepper.result();
    const detail = evaluateGeometry(problem, param.apply(r.x), sizingOpts);
    return Object.assign(r, { trajectory: traj, design: summarizeDesign(problem, detail, r.x, param), partial: !!partial, reason: partial ? 'cancelled by the user' : r.reason });
  }

  // Nelder-Mead
  const nmTraj = [];
  const nmOpts = Object.assign({ restarts: 1 }, payload.nm || {}, { seed: num(payload.seed, 12345), onImprove: b => nmTraj.push(compactRecord(b, lastDetail)) });
  const nm = createNelderMead(f, param.x0, param.lower, param.upper, nmOpts);
  if (!(await drive(nm, 'nm', 0.2, 0.4, () => nm.evals / nm.maxEvals, nmTraj))) {
    if (nm.best) post({ type: 'nm', result: packResult(nm, nmTraj, true) });
    post({ type: 'cancelled' });
    return null;
  }
  out.nm = packResult(nm, nmTraj, false);
  post({ type: 'nm', result: out.nm });

  // CMA-ES
  const cmaTraj = [];
  const cmaOpts = Object.assign({ generations: 60 }, payload.cma || {}, { seed: num(payload.seed, 12345), onImprove: b => cmaTraj.push(compactRecord(b, lastDetail)) });
  const cma = createCmaEs(f, param.x0, param.lower, param.upper, cmaOpts);
  if (!(await drive(cma, 'cma', 0.6, 0.4, () => cma.generations / cma.maxGen, cmaTraj))) {
    if (cma.best) post({ type: 'cma', result: packResult(cma, cmaTraj, true) });
    post({ type: 'cancelled' });
    return null;
  }
  out.cma = packResult(cma, cmaTraj, false);
  post({ type: 'cma', result: out.cma });
  post({ type: 'done' });
  return out;
}
