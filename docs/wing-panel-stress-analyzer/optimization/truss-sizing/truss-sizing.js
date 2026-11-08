// MIE 446 Optimization Lab: truss member sizing (pure ES module, no DOM access).
//
// Contents
//   1. Model building from the shared TRUSS_PRESETS (or any object with the same shape).
//   2. Exact solver: 2D linear elastic pin-jointed truss by the direct stiffness method with a dense
//      Cholesky factorization, member forces, stresses, utilizations, Euler buckling screen, slack wires,
//      reactions, mass and a nodal displacement measure. Singular stiffness is reported as an error object.
//   3. Analytical sensitivities: dN/dA (direct method, one back-substitution per design variable) and
//      d(displacement)/dA (adjoint method, one back-substitution per constrained degree of freedom).
//   4. Optimizers: fully stressed design (FSD) with a uniform scaling step for the displacement limit, and a
//      gradient-based sequential linear programming (SLP) loop in reciprocal variables solved by a small dense
//      two-phase simplex with Bland's rule.
//   5. Catalog rounding and the verification routine used by the page for every displayed design.
//
// Units everywhere: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g.
// Sign convention: y up, loads positive upward, member force N positive in tension.

import { MATERIALS, TRUSS_PRESETS } from '../shared/presets.js';

export const VERSION = '0.1.1';

// Discrete catalog sizes (mm^2) per material, used when rounding a continuous optimum up to stock sizes.
export const CATALOG_DEFAULTS = {
  spruce: [400, 600, 900, 1200, 1600, 2000, 2500, 3000, 4000],
  al6061: [100, 150, 200, 300, 400, 500, 650, 800],
  wire: [1, 2, 3, 5, 8, 12],
  steel: [10, 20, 30, 50, 80, 120, 200, 300],
  cfrp: [3, 5, 8, 12, 20, 30, 50],
  pla: [20, 30, 50, 80, 120, 200, 300],
  petg: [20, 30, 50, 80, 120, 200, 300],
};

// Default minimum area per material (mm^2): a practical lower bound so that zero-force members keep a finite size.
export const AMIN_DEFAULTS = { spruce: 100, al6061: 20, wire: 0.5, steel: 5, cfrp: 1, pla: 10, petg: 10 };

// Feasibility tolerance on utilization and displacement ratio (absorbs floating point round-off only).
export const FEAS_TOL = 1e-6;

const err = (message, extra = {}) => ({ ok: false, error: message, ...extra });
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------------------------
// 1. Model
// ---------------------------------------------------------------------------------------------

// Build a solver-ready model from a preset key ('wright-bay', 'warren') or a preset-shaped object.
// opts.loadCase selects one of preset.loadCases; the preset's default loads are used otherwise.
export function buildModel(preset, opts = {}) {
  const key = typeof preset === 'string' ? preset : (preset && preset.key) || 'custom';
  const p = typeof preset === 'string' ? TRUSS_PRESETS[preset] : preset;
  if (!p || !Array.isArray(p.nodes) || !Array.isArray(p.members) || !p.groups) {
    return err('Unknown or malformed truss preset.');
  }
  const nodes = p.nodes.map(n => [Number(n[0]), Number(n[1])]);
  if (nodes.length < 2 || nodes.some(n => !isNum(n[0]) || !isNum(n[1]))) {
    return err('Node coordinates must be finite numbers (at least two nodes).');
  }
  const groupKeys = Object.keys(p.groups);
  if (groupKeys.length === 0) return err('The preset defines no member groups.');
  const groups = {};
  for (const k of groupKeys) {
    const g = p.groups[k];
    const mat = MATERIALS[g.material];
    if (!mat) return err(`Group "${k}" uses an unknown material "${g.material}".`);
    groups[k] = {
      key: k, material: g.material, materialName: mat.name,
      E: mat.E, sigmaAllow: mat.sigmaAllow, rho: mat.rho,
      A0: Number(g.A0), tensionOnly: !!g.tensionOnly, buckling: g.buckling || 'none',
    };
    if (!(groups[k].A0 > 0)) return err(`Group "${k}" has a non-positive starting area.`);
  }
  const members = [];
  for (let i = 0; i < p.members.length; i++) {
    const [a, b, gk] = p.members[i];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= nodes.length || b >= nodes.length || a === b) {
      return err(`Member ${i} has invalid end nodes.`);
    }
    if (!groups[gk]) return err(`Member ${i} refers to an unknown group "${gk}".`);
    const dx = nodes[b][0] - nodes[a][0], dy = nodes[b][1] - nodes[a][1];
    const L = Math.hypot(dx, dy);
    if (!(L > 0)) return err(`Member ${i} (nodes ${a}-${b}) has zero length.`);
    members.push({ id: i, a, b, group: gk, L, cx: dx / L, cy: dy / L });
  }
  if (members.length === 0) return err('The truss has no members.');
  const supports = {};
  for (const [nd, fx] of Object.entries(p.supports || {})) {
    const n = Number(nd);
    if (!Number.isInteger(n) || n < 0 || n >= nodes.length) return err(`Support at unknown node ${nd}.`);
    supports[n] = [fx[0] ? 1 : 0, fx[1] ? 1 : 0];
  }
  const loadCases = p.loadCases || {};
  const loadCaseKeys = Object.keys(loadCases);
  let loadCase = opts.loadCase;
  let rawLoads;
  if (loadCase && loadCases[loadCase]) rawLoads = loadCases[loadCase];
  else {
    rawLoads = p.loads || (loadCaseKeys.length ? loadCases[loadCaseKeys[0]] : {});
    loadCase = loadCaseKeys.find(k => loadCases[k] === rawLoads) || loadCaseKeys[0] || 'default';
  }
  const loads = {};
  for (const [nd, f] of Object.entries(rawLoads || {})) {
    const n = Number(nd);
    if (!Number.isInteger(n) || n < 0 || n >= nodes.length) return err(`Load at unknown node ${nd}.`);
    const fx = Number(f[0] ?? 0), fy = Number(f[1] ?? 0);
    if (!isNum(fx) || !isNum(fy)) return err(`Load at node ${nd} is not finite.`);
    loads[n] = [fx, fy];
  }
  return {
    ok: true, key, name: p.name || 'truss', description: p.description || '',
    nodes, members, groups, groupKeys, supports, loads, loadCase, loadCaseKeys, loadCases,
    _preset: p,
  };
}

// Horizontal extent of the truss (mm), used for the default displacement limit span/150.
export function spanOf(model) {
  let lo = Infinity, hi = -Infinity;
  for (const [x] of model.nodes) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return hi - lo;
}

export function defaultDisplacementLimit(model) {
  return spanOf(model) / 150;
}

// Default displacement nodes: the free nodes farthest from the nearest support (ties kept).
// Gives nodes 4 and 9 for 'wright-bay' and node 3 for 'warren'.
export function defaultDisplacementNodes(model) {
  const sup = Object.keys(model.supports).map(Number);
  if (sup.length === 0) return [];
  const dist = model.nodes.map((n, i) => {
    if (model.supports[i]) return -1;
    let d = Infinity;
    for (const s of sup) d = Math.min(d, Math.hypot(n[0] - model.nodes[s][0], n[1] - model.nodes[s][1]));
    return d;
  });
  const dmax = Math.max(...dist);
  return dist.map((d, i) => (d >= dmax * (1 - 1e-9) ? i : -1)).filter(i => i >= 0);
}

// Degree of static indeterminacy m + r - 2 j (members + restrained DOFs - 2 * joints). Zero means determinate.
export function staticIndeterminacy(model) {
  let r = 0;
  for (const fx of Object.values(model.supports)) r += (fx[0] ? 1 : 0) + (fx[1] ? 1 : 0);
  return model.members.length + r - 2 * model.nodes.length;
}

// ---------------------------------------------------------------------------------------------
// Design variables: one area per group ('group' mode) or one area per member ('member' mode).
// ---------------------------------------------------------------------------------------------

export function variableMap(model, mode = 'group') {
  if (mode === 'member') {
    return {
      mode: 'member', n: model.members.length,
      varOf: model.members.map(m => m.id),
      membersOf: model.members.map(m => [m.id]),
      names: model.members.map(m => `m${m.id} (${m.a}-${m.b}, ${m.group})`),
      groupOf: model.members.map(m => m.group),
    };
  }
  const idx = {};
  model.groupKeys.forEach((k, j) => { idx[k] = j; });
  const membersOf = model.groupKeys.map(() => []);
  const varOf = model.members.map(m => { membersOf[idx[m.group]].push(m.id); return idx[m.group]; });
  return { mode: 'group', n: model.groupKeys.length, varOf, membersOf, names: [...model.groupKeys], groupOf: [...model.groupKeys] };
}

export function expandAreas(vm, x) {
  return vm.varOf.map(j => x[j]);
}

// Per-variable vector from a per-group table {groupKey: value}; falls back to the group's A0 or the material default.
export function groupVector(model, vm, table, fallback) {
  return vm.groupOf.map(g => {
    const raw = table ? table[g] : undefined;
    const v = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
    return isNum(v) ? v : fallback(model.groups[g]);
  });
}

export function initialDesign(model, vm, groupAreas) {
  return groupVector(model, vm, groupAreas, g => g.A0);
}

export function minimumAreas(model, vm, groupAmin) {
  return groupVector(model, vm, groupAmin, g => AMIN_DEFAULTS[g.material] ?? 1);
}

// Mass per unit area of each design variable (g/mm^2): sum of L * rho / 1000 over its members.
export function variableWeights(model, vm) {
  const w = new Array(vm.n).fill(0);
  for (const m of model.members) w[vm.varOf[m.id]] += m.L * model.groups[m.group].rho / 1000;
  return w;
}

export function massOf(model, areas) {
  let s = 0;
  for (const m of model.members) s += areas[m.id] * m.L * model.groups[m.group].rho / 1000;
  return s;
}

// ---------------------------------------------------------------------------------------------
// 2. Exact solver (direct stiffness method)
// ---------------------------------------------------------------------------------------------

// Dense Cholesky factorization K = L L^T. Returns { ok, L } or { ok: false, row } for a non positive pivot.
function cholesky(K) {
  const n = K.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(K[i][i]));
  const tol = Math.max(1e-300, 1e-10 * maxDiag);
  for (let j = 0; j < n; j++) {
    let s = K[j][j];
    for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    if (!(s > tol)) return { ok: false, row: j };
    const d = Math.sqrt(s);
    L[j][j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = K[i][j];
      for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
      L[i][j] = t / d;
    }
  }
  return { ok: true, L };
}

function cholSolve(L, b) {
  const n = L.length;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

function normalizeOpts(opts) {
  const FS = opts.FS === undefined ? 1.5 : Number(opts.FS);
  const K = opts.K === undefined ? 1.0 : Number(opts.K);
  const buckling = opts.buckling !== false;
  const d = opts.disp || {};
  const nodes = Array.isArray(d.nodes) ? d.nodes.map(Number) : [];
  const dir = d.dir === 'x' || d.dir === 'mag' ? d.dir : 'y';
  const limit = isNum(Number(d.limit)) && Number(d.limit) > 0 ? Number(d.limit) : null;
  return { FS, K, buckling, disp: { nodes, dir, limit } };
}

// Solve the truss for a per-member area vector. opts: { FS, buckling (bool), K (effective length factor),
// disp: { nodes: [...], dir: 'y'|'x'|'mag', limit (mm) or null } }.
export function solveTruss(model, areas, opts = {}) {
  if (!model || !model.ok) return err('No valid truss model.');
  const o = normalizeOpts(opts);
  if (!(o.FS > 0) || !isNum(o.FS)) return err('The factor of safety FS must be a positive finite number.');
  if (!(o.K > 0) || !isNum(o.K)) return err('The effective length factor K must be a positive finite number.');
  const nm = model.members.length, nn = model.nodes.length, ndof = 2 * nn;
  if (!Array.isArray(areas) && !ArrayBuffer.isView(areas)) return err('Areas must be an array with one entry per member.');
  if (areas.length !== nm) return err(`Areas array has ${areas.length} entries but the truss has ${nm} members.`);
  for (let i = 0; i < nm; i++) {
    if (!isNum(areas[i]) || !(areas[i] > 0)) return err(`Member ${i} has a non-positive or non-finite area (${areas[i]}).`);
  }
  for (const nd of o.disp.nodes) {
    if (!Number.isInteger(nd) || nd < 0 || nd >= nn) return err(`Displacement node ${nd} does not exist (valid: 0 to ${nn - 1}).`);
  }

  // Degrees of freedom
  const fixed = new Uint8Array(ndof);
  for (const [nd, fx] of Object.entries(model.supports)) {
    const n = Number(nd);
    if (fx[0]) fixed[2 * n] = 1;
    if (fx[1]) fixed[2 * n + 1] = 1;
  }
  const map = new Int32Array(ndof).fill(-1);
  const free = [];
  for (let d = 0; d < ndof; d++) if (!fixed[d]) { map[d] = free.length; free.push(d); }
  const nf = free.length;

  // Assemble the reduced stiffness matrix
  const Kff = Array.from({ length: nf }, () => new Float64Array(nf));
  const kAxial = new Float64Array(nm);
  const B = model.members.map(m => [-m.cx, -m.cy, m.cx, m.cy]);
  const DOFS = model.members.map(m => [2 * m.a, 2 * m.a + 1, 2 * m.b, 2 * m.b + 1]);
  for (let i = 0; i < nm; i++) {
    const m = model.members[i];
    const k = model.groups[m.group].E * areas[i] / m.L;
    kAxial[i] = k;
    const b = B[i], dofs = DOFS[i];
    for (let p = 0; p < 4; p++) {
      const rp = map[dofs[p]];
      if (rp < 0) continue;
      for (let q = 0; q < 4; q++) {
        const rq = map[dofs[q]];
        if (rq < 0) continue;
        Kff[rp][rq] += k * b[p] * b[q];
      }
    }
  }

  // Load vector
  const F = new Float64Array(ndof);
  for (const [nd, f] of Object.entries(model.loads)) { const n = Number(nd); F[2 * n] += f[0]; F[2 * n + 1] += f[1]; }
  const Ff = new Float64Array(nf);
  for (let r = 0; r < nf; r++) Ff[r] = F[free[r]];

  // Factor and solve
  let fac = null;
  const u = new Float64Array(ndof);
  if (nf > 0) {
    fac = cholesky(Kff);
    if (!fac.ok) {
      const d = free[fac.row];
      return err(`Unstable structure: the stiffness matrix is singular (mechanism or insufficient supports), first detected at node ${Math.floor(d / 2)} ${d % 2 ? 'y' : 'x'}.`);
    }
    const uf = cholSolve(fac.L, Ff);
    for (let r = 0; r < nf; r++) u[free[r]] = uf[r];
  }

  // Member forces, stresses, utilizations
  const N = new Float64Array(nm), sigma = new Float64Array(nm), Ustress = new Float64Array(nm);
  const Ubuckle = new Float64Array(nm), Pcr = new Float64Array(nm), U = new Float64Array(nm);
  const slack = new Array(nm).fill(false);
  const check = new Array(nm);
  let Nmax = 0;
  for (let i = 0; i < nm; i++) {
    const b = B[i], dofs = DOFS[i];
    let e = 0;
    for (let p = 0; p < 4; p++) e += b[p] * u[dofs[p]];
    N[i] = kAxial[i] * e;
    Nmax = Math.max(Nmax, Math.abs(N[i]));
  }
  const slackTol = 1e-9 * (Nmax + 1);
  let mass = 0;
  for (let i = 0; i < nm; i++) {
    const m = model.members[i], g = model.groups[m.group];
    const A = areas[i];
    sigma[i] = N[i] / A;
    Ustress[i] = Math.abs(N[i]) * o.FS / (A * g.sigmaAllow);
    Pcr[i] = NaN;
    Ubuckle[i] = 0;
    slack[i] = g.tensionOnly && N[i] < -slackTol;
    if (N[i] < 0 && !g.tensionOnly && o.buckling && g.buckling === 'square') {
      const I = A * A / 12;
      Pcr[i] = Math.PI * Math.PI * g.E * I / ((o.K * m.L) ** 2);
      Ubuckle[i] = Math.abs(N[i]) * o.FS / Pcr[i];
    }
    U[i] = Math.max(Ustress[i], Ubuckle[i]);
    check[i] = slack[i] ? 'slack' : (Ubuckle[i] > Ustress[i] ? 'buckling screen' : 'stress');
    mass += A * m.L * g.rho / 1000;
  }

  // Reactions: R = K u - F at the restrained degrees of freedom
  const Ku = new Float64Array(ndof);
  for (let i = 0; i < nm; i++) {
    const b = B[i], dofs = DOFS[i];
    for (let p = 0; p < 4; p++) Ku[dofs[p]] += N[i] * b[p];
  }
  const reactions = {};
  let residual = 0;
  for (let d = 0; d < ndof; d++) {
    if (fixed[d]) {
      const n = Math.floor(d / 2);
      if (!reactions[n]) reactions[n] = [0, 0];
      reactions[n][d % 2] = Ku[d] - F[d];
    } else residual = Math.max(residual, Math.abs(Ku[d] - F[d]));
  }

  // Displacement measure
  const dvals = o.disp.nodes.map(nd => {
    const ux = u[2 * nd], uy = u[2 * nd + 1];
    return o.disp.dir === 'x' ? Math.abs(ux) : o.disp.dir === 'y' ? Math.abs(uy) : Math.hypot(ux, uy);
  });
  let dmax = 0, dnode = null;
  dvals.forEach((v, k) => { if (v >= dmax) { dmax = v; dnode = o.disp.nodes[k]; } });
  const disp = { nodes: o.disp.nodes, dir: o.disp.dir, limit: o.disp.limit, values: dvals, value: dmax, node: dnode,
    ratio: o.disp.limit ? dmax / o.disp.limit : null };

  let maxU = 0, maxUMember = -1;
  for (let i = 0; i < nm; i++) if (!slack[i] && U[i] > maxU) { maxU = U[i]; maxUMember = i; }

  return {
    ok: true, opts: o, areas: Array.from(areas), u, N, sigma, Ustress, Ubuckle, Pcr, U, slack, check,
    maxU, maxUMember, mass, reactions, residual, disp,
    // internals reused by the sensitivity analysis
    _free: free, _map: map, _fac: fac, _kAxial: kAxial, _B: B, _DOFS: DOFS,
  };
}

// Sum of reactions plus applied loads per direction (should be zero): used by tests and the page.
export function equilibriumCheck(model, res) {
  let Rx = 0, Ry = 0, Fx = 0, Fy = 0;
  for (const r of Object.values(res.reactions)) { Rx += r[0]; Ry += r[1]; }
  for (const f of Object.values(model.loads)) { Fx += f[0]; Fy += f[1]; }
  return { Rx, Ry, Fx, Fy, errX: Rx + Fx, errY: Ry + Fy };
}

// ---------------------------------------------------------------------------------------------
// Verification: fresh solve plus constraint checks for a candidate per-member area vector.
// extra: { vm, Amin (per variable), xVars } lets the routine label which constraint governs each member.
// ---------------------------------------------------------------------------------------------

export function verifyDesign(model, areas, opts = {}, extra = {}) {
  const res = solveTruss(model, areas, opts);
  if (!res.ok) return { ok: false, feasible: false, error: res.error };
  const nm = model.members.length;
  const violations = [];
  for (let i = 0; i < nm; i++) if (!res.slack[i] && res.U[i] > 1 + FEAS_TOL) violations.push(i);
  const stressOK = violations.length === 0;
  const dispOK = !(res.disp.limit > 0) || res.disp.value <= res.disp.limit * (1 + FEAS_TOL);
  const constraintsFeasible = stressOK && dispOK;
  const wireAdmissible = !res.slack.some(Boolean);
  const feasible = constraintsFeasible && wireAdmissible;
  const slackMembers = [];
  for (let i = 0; i < nm; i++) if (res.slack[i]) slackMembers.push(i);
  const dispActive = res.disp.limit > 0 && res.disp.ratio >= 0.999;

  const vm = extra.vm, Amin = extra.Amin, xVars = extra.xVars;
  const atMin = vm && Amin && xVars ? xVars.map((v, j) => v <= Amin[j] * (1 + 1e-9)) : null;
  const varMaxU = vm ? new Array(vm.n).fill(0).map((_, j) => {
    let mu = 0, mi = -1;
    for (const i of vm.membersOf[j]) if (!res.slack[i] && res.U[i] > mu) { mu = res.U[i]; mi = i; }
    return { U: mu, member: mi };
  }) : null;

  const governing = new Array(nm);
  for (let i = 0; i < nm; i++) {
    if (res.slack[i]) { governing[i] = 'slack'; continue; }
    if (res.U[i] >= 0.999) { governing[i] = res.check[i]; continue; }
    if (atMin && atMin[vm.varOf[i]]) { governing[i] = 'minimum area'; continue; }
    if (dispActive) { governing[i] = 'displacement'; continue; }
    if (vm && vm.mode === 'group' && varMaxU[vm.varOf[i]].U >= 0.999 && varMaxU[vm.varOf[i]].member !== i) {
      governing[i] = `group (m${varMaxU[vm.varOf[i]].member} governs)`; continue;
    }
    governing[i] = 'under-used';
  }
  let governingSummary;
  if (res.disp.limit > 0 && res.disp.ratio >= res.maxU) governingSummary = `displacement at node ${res.disp.node} (${(res.disp.ratio * 100).toFixed(1)} percent of the limit)`;
  else if (res.maxUMember >= 0) {
    const m = model.members[res.maxUMember];
    governingSummary = `${res.check[res.maxUMember]} in m${m.id} (${m.a}-${m.b}, ${m.group}), U = ${res.maxU.toFixed(3)}`;
  } else governingSummary = 'no loaded member';

  if (!wireAdmissible) governingSummary = 'compressed wire(s): no admissible tension-only response';
  return {
    ok: true, feasible, constraintsFeasible, wireAdmissible, stressOK, dispOK, violations, mass: res.mass, maxU: res.maxU, maxUMember: res.maxUMember,
    utilizations: Array.from(res.U), governing, governingSummary, disp: res.disp, slack: slackMembers, result: res,
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Analytical sensitivities
// ---------------------------------------------------------------------------------------------
// K u = F.  For design variable x_j (an area shared by the members of that variable):
//   (dK/dx_j) u + K du/dx_j = 0   =>   du/dx_j = -K^-1 (dK/dx_j u),   with (dK/dx_j) u = sum_i sigma_i b_i
// (b_i is the member direction vector scattered to its four DOFs, sigma_i = N_i / A_i).
// Member force: N_i = (E A / L)_i b_i . u_e, so dN_i/dx_j = (E A / L)_i b_i . (du/dx_j)_e + [i in j] sigma_i.
// Displacement at a free DOF k: d u_k / dx_j = -lambda^T (dK/dx_j u) with the adjoint lambda = K^-1 e_k.

export function sensitivities(model, areas, vm, opts = {}, res = null) {
  if (!res) res = solveTruss(model, areas, opts);
  if (!res.ok) return res;
  const { _free: free, _map: map, _fac: fac, _kAxial: kAxial, _B: B, _DOFS: DOFS } = res;
  const n = vm.n, nm = model.members.length, nf = free.length;
  const o = res.opts;

  // (dK/dx_j) u restricted to the free DOFs
  const dKu = Array.from({ length: n }, () => new Float64Array(nf));
  for (let i = 0; i < nm; i++) {
    const j = vm.varOf[i], s = res.sigma[i], b = B[i], dofs = DOFS[i];
    for (let p = 0; p < 4; p++) { const r = map[dofs[p]]; if (r >= 0) dKu[j][r] += s * b[p]; }
  }
  // Direct method: du/dx_j, one back-substitution per variable
  const du = dKu.map(v => {
    if (nf === 0) return new Float64Array(0);
    const s = cholSolve(fac.L, v);
    for (let r = 0; r < nf; r++) s[r] = -s[r];
    return s;
  });
  // dN_i/dx_j
  const dN = Array.from({ length: nm }, () => new Float64Array(n));
  for (let i = 0; i < nm; i++) {
    const b = B[i], dofs = DOFS[i];
    for (let j = 0; j < n; j++) {
      let e = 0;
      for (let p = 0; p < 4; p++) { const r = map[dofs[p]]; if (r >= 0) e += b[p] * du[j][r]; }
      dN[i][j] = kAxial[i] * e + (vm.varOf[i] === j ? res.sigma[i] : 0);
    }
  }
  // Utilization derivatives
  const dUstress = Array.from({ length: nm }, () => new Float64Array(n));
  const dUbuckle = Array.from({ length: nm }, () => new Float64Array(n));
  for (let i = 0; i < nm; i++) {
    const m = model.members[i], g = model.groups[m.group], A = areas[i];
    const sg = res.N[i] >= 0 ? 1 : -1, absN = Math.abs(res.N[i]);
    const cS = o.FS / g.sigmaAllow;
    const cB = res.Ubuckle[i] > 0 ? o.FS * (o.K * m.L) ** 2 * 12 / (Math.PI * Math.PI * g.E) : 0;
    for (let j = 0; j < n; j++) {
      const own = vm.varOf[i] === j ? 1 : 0;
      dUstress[i][j] = cS * (sg * dN[i][j] / A - own * absN / (A * A));
      if (cB > 0) dUbuckle[i][j] = cB * (sg * dN[i][j] / (A * A) - own * 2 * absN / (A * A * A));
    }
  }
  // Adjoint method for the displacement measure at each constrained node
  const adjoint = dofIndex => {
    const out = new Float64Array(n);
    const r = map[dofIndex];
    if (r < 0 || nf === 0) return out;
    const e = new Float64Array(nf); e[r] = 1;
    const lambda = cholSolve(fac.L, e);
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let q = 0; q < nf; q++) s += lambda[q] * dKu[j][q];
      out[j] = -s;
    }
    return out;
  };
  const dDisp = res.disp.nodes.map((nd, k) => {
    const ux = res.u[2 * nd], uy = res.u[2 * nd + 1];
    const d = new Float64Array(n);
    if (res.disp.dir === 'x' || res.disp.dir === 'y') {
      const dof = 2 * nd + (res.disp.dir === 'y' ? 1 : 0);
      const val = res.u[dof];
      const sg = val >= 0 ? 1 : -1;
      const a = adjoint(dof);
      for (let j = 0; j < n; j++) d[j] = sg * a[j];
    } else {
      const mag = Math.hypot(ux, uy);
      if (mag > 0) {
        const ax = adjoint(2 * nd), ay = adjoint(2 * nd + 1);
        for (let j = 0; j < n; j++) d[j] = (ux * ax[j] + uy * ay[j]) / mag;
      }
    }
    return { node: nd, value: res.disp.values[k], d };
  });
  return { ok: true, dN, du, dUstress, dUbuckle, dDisp };
}

// ---------------------------------------------------------------------------------------------
// 4a. Fully stressed design
// ---------------------------------------------------------------------------------------------
// Area factor needed by each variable: stress U scales as 1/A, the buckling screen as 1/A^2 (I = A^2/12),
// so the required factor is max over the variable's members of max(U_stress, sqrt(U_buckle)); slack wires are skipped.
function sizingFactors(res, vm) {
  const f = new Array(vm.n).fill(0);
  for (let i = 0; i < res.U.length; i++) {
    if (res.slack[i]) continue;
    let fi = res.Ustress[i];
    if (res.Ubuckle[i] > 0) fi = Math.max(fi, Math.sqrt(res.Ubuckle[i]));
    const j = vm.varOf[i];
    if (fi > f[j]) f[j] = fi;
  }
  return f;
}

function variableUtilization(res, vm) {
  const u = new Array(vm.n).fill(0);
  for (let i = 0; i < res.U.length; i++) if (!res.slack[i]) { const j = vm.varOf[i]; if (res.U[i] > u[j]) u[j] = res.U[i]; }
  return u;
}

// Monotone increase of any variable whose members exceed U = 1 until max U <= 1 + 1e-7 (at most 30 extra solves).
// Used after both optimizers so that the reported design is strictly feasible on the exact re-solve.
function polishFeasibility(model, vm, x, Amin, opts, log) {
  let res = null;
  for (let k = 0; k < 30; k++) {
    res = solveTruss(model, expandAreas(vm, x), opts);
    if (!res.ok) return { ok: false, error: res.error };
    if (res.maxU <= 1 + 1e-7) break;
    const f = sizingFactors(res, vm);
    x = x.map((v, j) => Math.max(Amin[j], v * Math.max(1, f[j])));
    if (log) log.push({ stage: 'polish', mass: massOf(model, expandAreas(vm, x)) });
  }
  return { ok: true, x, res };
}

// Uniform scaling of all areas to meet the displacement limit (member forces are unchanged, displacements scale as 1/f).
function scaleForDisplacement(model, vm, x, opts) {
  const res = solveTruss(model, expandAreas(vm, x), opts);
  if (!res.ok) return { ok: false, error: res.error };
  if (!(res.disp.limit > 0) || res.disp.value <= res.disp.limit) return { ok: true, x, applied: false, factor: 1, before: res.disp.value };
  const f = res.disp.value / res.disp.limit;
  return { ok: true, x: x.map(v => v * f), applied: true, factor: f, before: res.disp.value };
}

export function fullyStressedDesign(model, x0, vm, opts = {}) {
  const Amin = opts.Amin || new Array(vm.n).fill(1e-9);
  const tol = opts.tol ?? 1e-3, maxIter = opts.maxIter ?? 50;
  let x = x0.map((v, j) => Math.max(v, Amin[j]));
  if (x.some(v => !isNum(v) || !(v > 0))) return err('The starting areas must be positive finite numbers.');
  const history = [];
  let converged = false, iter = 0;
  for (iter = 0; iter < maxIter; iter++) {
    const res = solveTruss(model, expandAreas(vm, x), opts);
    if (!res.ok) return err(res.error, { history });
    history.push({ iter, mass: res.mass, maxU: res.maxU, dispRatio: res.disp.ratio });
    const varU = variableUtilization(res, vm);
    let dev = 0;
    for (let j = 0; j < vm.n; j++) {
      const atMin = x[j] <= Amin[j] * (1 + 1e-9);
      if (atMin && varU[j] <= 1) continue;
      dev = Math.max(dev, Math.abs(varU[j] - 1));
    }
    if (dev < tol) { converged = true; break; }
    const f = sizingFactors(res, vm);
    x = x.map((v, j) => Math.max(Amin[j], v * f[j]));
  }
  const iterations = iter;
  const pol = polishFeasibility(model, vm, x, Amin, opts, history);
  if (!pol.ok) return err(pol.error, { history });
  x = pol.x;
  const sc = scaleForDisplacement(model, vm, x, opts);
  if (!sc.ok) return err(sc.error, { history });
  x = sc.x;
  if (sc.applied) history.push({ stage: 'displacement scaling', mass: massOf(model, expandAreas(vm, x)), factor: sc.factor });
  const areas = expandAreas(vm, x);
  const verified = verifyDesign(model, areas, opts, { vm, Amin, xVars: x });
  return { ok: true, method: 'fully stressed design', x, areas, Amin, history, iterations, converged, scaling: sc, verified };
}

// One-shot closed form from the member forces of a single solve: A = max(|N| FS / sigma_allow, sqrt(12 |N| FS (K L)^2 / (pi^2 E))).
// Exact fully stressed design for statically determinate trusses (forces do not depend on the areas).
export function closedFormFSD(model, areas, vm, opts = {}) {
  const res = solveTruss(model, areas, opts);
  if (!res.ok) return res;
  const o = res.opts;
  const Amin = opts.Amin || new Array(vm.n).fill(1e-9);
  const x = new Array(vm.n).fill(0);
  for (let i = 0; i < model.members.length; i++) {
    if (res.slack[i]) continue;
    const m = model.members[i], g = model.groups[m.group];
    const absN = Math.abs(res.N[i]);
    let need = absN * o.FS / g.sigmaAllow;
    if (res.N[i] < 0 && !g.tensionOnly && o.buckling && g.buckling === 'square') {
      need = Math.max(need, Math.sqrt(12 * absN * o.FS * (o.K * m.L) ** 2 / (Math.PI * Math.PI * g.E)));
    }
    const j = vm.varOf[i];
    if (need > x[j]) x[j] = need;
  }
  for (let j = 0; j < vm.n; j++) x[j] = Math.max(x[j], Amin[j]);
  const out = expandAreas(vm, x);
  return { ok: true, x, areas: out, mass: massOf(model, out), determinate: staticIndeterminacy(model) === 0 };
}

// ---------------------------------------------------------------------------------------------
// 4b. Dense two-phase simplex (Bland's rule) for:  minimize c.z  subject to  A z <= b,  z >= 0.
// Rows with a negative right-hand side receive an artificial variable (phase I). If the LP is infeasible the
// returned z is the phase I minimizer, that is the point of least total linearized violation.
// ---------------------------------------------------------------------------------------------

export function simplexLP(c, A, b, opts = {}) {
  const eps = opts.eps ?? 1e-9, maxPivots = opts.maxPivots ?? 20000;
  const m = A.length, n = c.length;
  let na = 0;
  for (let i = 0; i < m; i++) if (b[i] < -eps) na++;
  const ncol = n + m + na + 1, rhs = ncol - 1;
  const T = Array.from({ length: m }, () => new Float64Array(ncol));
  const basis = new Int32Array(m);
  let ai = 0;
  for (let i = 0; i < m; i++) {
    const sgn = b[i] < -eps ? -1 : 1;
    for (let j = 0; j < n; j++) T[i][j] = sgn * A[i][j];
    T[i][n + i] = sgn;
    T[i][rhs] = sgn * b[i];
    if (sgn < 0) { T[i][n + m + ai] = 1; basis[i] = n + m + ai; ai++; } else basis[i] = n + i;
  }
  let pivots = 0;
  const pivot = (r, col, cost) => {
    const row = T[r], p = row[col];
    for (let j = 0; j < ncol; j++) row[j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = T[i][col];
      if (f === 0) continue;
      const ti = T[i];
      for (let j = 0; j < ncol; j++) ti[j] -= f * row[j];
      if (ti[rhs] < 0 && ti[rhs] > -1e-12) ti[rhs] = 0;
    }
    const f = cost[col];
    if (f !== 0) for (let j = 0; j < ncol; j++) cost[j] -= f * row[j];
    basis[r] = col;
    pivots++;
  };
  const run = (cost, ncolAllowed) => {
    for (;;) {
      if (pivots > maxPivots) return 'limit';
      let col = -1;
      for (let j = 0; j < ncolAllowed; j++) if (cost[j] < -eps) { col = j; break; }
      if (col < 0) return 'optimal';
      let r = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][col];
        if (a <= eps) continue;
        const ratio = T[i][rhs] / a;
        if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[r])) { best = ratio; r = i; }
      }
      if (r < 0) return 'unbounded';
      pivot(r, col, cost);
    }
  };
  const extract = () => {
    const z = new Array(n).fill(0);
    for (let i = 0; i < m; i++) if (basis[i] < n) z[basis[i]] = T[i][rhs];
    return z;
  };
  let status = 'optimal';
  if (na > 0) {
    const cost1 = new Float64Array(ncol);
    for (let j = n + m; j < n + m + na; j++) cost1[j] = 1;
    for (let i = 0; i < m; i++) if (basis[i] >= n + m) for (let j = 0; j < ncol; j++) cost1[j] -= T[i][j];
    const st = run(cost1, n + m + na);
    const violation = -cost1[rhs];
    if (st !== 'optimal' || violation > 1e-7) {
      return { status: st === 'optimal' ? 'infeasible' : st, z: extract(), violation, pivots };
    }
  }
  const cost2 = new Float64Array(ncol);
  for (let j = 0; j < n; j++) cost2[j] = c[j];
  for (let i = 0; i < m; i++) if (basis[i] < n) { const f = c[basis[i]]; if (f !== 0) for (let j = 0; j < ncol; j++) cost2[j] -= f * T[i][j]; }
  status = run(cost2, n + m);
  const z = extract();
  let obj = 0;
  for (let j = 0; j < n; j++) obj += c[j] * z[j];
  return { status, z, objective: obj, pivots };
}

// ---------------------------------------------------------------------------------------------
// 4c. Gradient method: sequential linear programming in reciprocal variables y = 1/A.
// ---------------------------------------------------------------------------------------------
// At the current design the mass and every constraint are linearized in y (member stress is exactly linear in 1/A for
// statically determinate trusses, so this linearization is much more accurate than one in A). Each linear program
// (LP) is solved by simplexLP on the normalized variables z in [0, 1] that span the move-limit box, then the areas
// are updated, move limits are halved for variables whose step changes sign (oscillation), and the loop stops when the
// relative mass change is below 1e-4 at a near-feasible design. The final design is made strictly feasible by at most
// ten fully stressed polish steps plus uniform scaling for the displacement limit, then verified by a fresh solve.

// Build the linear subproblem of one SLP iteration at design x (per-variable areas) from a solve `res` and its
// sensitivities `sens`. Variables are y = 1/A inside the move-limit box, normalized to z in [0, 1]:
//   minimize sum_k c_k z_k   subject to  rows[r] . z <= rhs[r]   (constraint rows, then z_k <= 1 rows)
// Variables whose members are all slack are fixed (stepped toward A_min) and moved to the right-hand side.
// Returns { active, xFixed, lo, hi, ylo, span, c, rows, rhs, rowNames }.
export function buildLinearSubproblem(model, vm, x, res, sens, p) {
  const n = vm.n;
  const Amin = p.Amin, mv = p.mv, moveLimitUp = p.moveLimitUp ?? 1.0;
  const w = p.w || variableWeights(model, vm);
  const lo = x.map((v, j) => Math.max(Amin[j], v * (1 - mv[j])));
  const hi = x.map((v, j) => v * (1 + moveLimitUp));
  // A variable whose members are all slack (tension-only wires in compression) carries no constraint in the linear
  // model. It is taken out of the LP and stepped down to its minimum area (as the fully stressed update does), so the
  // optimizer cannot exploit the fictitious compressive stiffness of a slack wire.
  const fixedVar = vm.membersOf.map(list => list.length > 0 && list.every(i => res.slack[i]));
  const xFixed = new Array(n).fill(0);
  const active = [];
  for (let j = 0; j < n; j++) {
    if (fixedVar[j]) xFixed[j] = lo[j]; else active.push(j);
  }
  const na = active.length;
  const col = new Int32Array(n).fill(-1);
  active.forEach((j, k) => { col[j] = k; });
  const ylo = hi.map(v => 1 / v), yhi = lo.map(v => 1 / v), yk = x.map(v => 1 / v);
  const span = yhi.map((v, j) => v - ylo[j]);
  // Linearized mass: dm/dy_j = -w_j x_j^2, scaled to the z range and normalized
  const c = new Array(na);
  let cmax = 0;
  active.forEach((j, k) => { c[k] = -w[j] * x[j] * x[j] * span[j]; cmax = Math.max(cmax, Math.abs(c[k])); });
  if (cmax > 0) for (let k = 0; k < na; k++) c[k] /= cmax;
  const rows = [], rhs = [], rowNames = [];
  const addRow = (name, gVal, dgdx) => {
    const a = new Array(na).fill(0);
    let bsum = -gVal, amax = 0;
    for (let j = 0; j < n; j++) {
      const dgdy = -x[j] * x[j] * dgdx[j];
      if (fixedVar[j]) { bsum -= dgdy * (1 / xFixed[j] - yk[j]); continue; }
      a[col[j]] = dgdy * span[j];
      bsum += dgdy * (yk[j] - ylo[j]);
      amax = Math.max(amax, Math.abs(a[col[j]]));
    }
    if (amax < 1e-14) return;
    for (let k = 0; k < na; k++) a[k] /= amax;
    rows.push(a); rhs.push(bsum / amax); rowNames.push(name);
  };
  for (let i = 0; i < model.members.length; i++) {
    if (res.slack[i]) continue;
    addRow(`stress m${i}`, res.Ustress[i] - 1, sens.dUstress[i]);
    if (res.Ubuckle[i] > 0) addRow(`buckling m${i}`, res.Ubuckle[i] - 1, sens.dUbuckle[i]);
  }
  if (res.disp.limit > 0) {
    for (const dr of sens.dDisp) {
      const d = new Array(n);
      for (let j = 0; j < n; j++) d[j] = dr.d[j] / res.disp.limit;
      addRow(`displacement node ${dr.node}`, dr.value / res.disp.limit - 1, d);
    }
  }
  for (let k = 0; k < na; k++) { const a = new Array(na).fill(0); a[k] = 1; rows.push(a); rhs.push(1); rowNames.push(`bound z${k}`); }
  return { active, xFixed, lo, hi, ylo, span, c, rows, rhs, rowNames };
}

export function gradientDesign(model, x0, vm, opts = {}) {
  const Amin = opts.Amin || new Array(vm.n).fill(1e-9);
  // Move limits: an area may shrink by at most moveLimit (20 percent) per iteration, the risky direction, and grow by
  // at most moveLimitUp (100 percent): stress and displacement are nearly linear in 1/A, so growth is well predicted.
  const moveLimit = opts.moveLimit ?? 0.2, moveLimitUp = opts.moveLimitUp ?? 1.0, minMove = opts.minMove ?? 0.01;
  const maxIter = opts.maxIter ?? 80, tolMass = opts.tolMass ?? 1e-4, tolFeas = opts.tolFeas ?? 1e-3;
  const n = vm.n;
  let x = x0.map((v, j) => Math.max(v, Amin[j]));
  if (x.some(v => !isNum(v) || !(v > 0))) return err('The starting areas must be positive finite numbers.');
  const w = variableWeights(model, vm);
  const mv = new Array(n).fill(moveLimit);
  const prevStep = new Array(n).fill(0);
  const sameDir = new Array(n).fill(0);
  const history = [];
  let converged = false, iter = 0, lpInfeasible = 0, stopReason = 'iteration limit';
  for (iter = 0; iter < maxIter; iter++) {
    const areas = expandAreas(vm, x);
    const res = solveTruss(model, areas, opts);
    if (!res.ok) return err(res.error, { history });
    const sens = sensitivities(model, areas, vm, opts, res);
    const dispViol = res.disp.limit > 0 ? res.disp.ratio - 1 : 0;
    const viol = Math.max(0, res.maxU - 1, dispViol);
    history.push({ iter, mass: res.mass, maxU: Math.max(res.maxU, res.disp.limit > 0 ? res.disp.ratio : 0), dispRatio: res.disp.ratio, violation: viol });

    const sub = buildLinearSubproblem(model, vm, x, res, sens, { Amin, mv, moveLimitUp, w });
    const xNew = sub.xFixed.slice();
    let lpStatus = 'no active variables';
    if (sub.active.length > 0) {
      const lp = simplexLP(sub.c, sub.rows, sub.rhs);
      lpStatus = lp.status;
      if (lp.status === 'optimal') {
        sub.active.forEach((j, k) => {
          const z = Math.min(1, Math.max(0, lp.z[k]));
          xNew[j] = Math.min(sub.hi[j], Math.max(sub.lo[j], 1 / (sub.ylo[j] + z * sub.span[j])));
        });
      } else {
        // No point inside the move-limit box satisfies all linearized constraints (typically a member with a tiny force
        // whose force is about to grow strongly). Fall back to one fully stressed repair step: only over-utilized
        // variables grow, everything else stays, and the next iteration linearizes again at the repaired design.
        lpInfeasible++;
        const f = sizingFactors(res, vm);
        for (const j of sub.active) xNew[j] = Math.min(sub.hi[j], Math.max(Amin[j], x[j] * Math.max(1, f[j])));
      }
    }
    if (typeof opts.trace === 'function') opts.trace({ iter, x: x.slice(), xNew: xNew.slice(), lpStatus, rows: sub.rows.length, rowNames: sub.rowNames, maxU: res.maxU, dispRatio: res.disp.ratio, mv: mv.slice(), sub });
    const massNew = massOf(model, expandAreas(vm, xNew));
    const rel = Math.abs(massNew - res.mass) / Math.max(res.mass, 1e-300);
    if (iter > 0 && rel < tolMass && viol <= tolFeas) {
      x = xNew; converged = true; stopReason = 'relative mass change below 1e-4 at a near-feasible design'; iter++; break;
    }
    // Move-limit adaptation: halve the shrink limit of a variable whose step changed sign (oscillation), let it
    // recover by a factor 1.5 (up to the initial value) after two consecutive steps in the same direction.
    for (let j = 0; j < n; j++) {
      const step = xNew[j] - x[j];
      if (step * prevStep[j] < 0) { mv[j] = Math.max(minMove, 0.5 * mv[j]); sameDir[j] = 0; }
      else if (step * prevStep[j] > 0) { sameDir[j]++; if (sameDir[j] >= 2) mv[j] = Math.min(moveLimit, 1.5 * mv[j]); }
      prevStep[j] = step;
    }
    x = xNew;
  }
  const iterations = iter;
  const pol = polishFeasibility(model, vm, x, Amin, opts, history);
  if (!pol.ok) return err(pol.error, { history });
  x = pol.x;
  const sc = scaleForDisplacement(model, vm, x, opts);
  if (!sc.ok) return err(sc.error, { history });
  x = sc.x;
  if (sc.applied) history.push({ stage: 'displacement scaling', mass: massOf(model, expandAreas(vm, x)), factor: sc.factor });
  const areas = expandAreas(vm, x);
  const verified = verifyDesign(model, areas, opts, { vm, Amin, xVars: x });
  return {
    ok: true, method: 'sequential linear programming (reciprocal variables, dense two-phase simplex)',
    x, areas, Amin, history, iterations, converged, stopReason, lpInfeasible, scaling: sc, verified,
  };
}

// ---------------------------------------------------------------------------------------------
// 5. Catalog rounding: every variable is rounded UP to the nearest catalog size of its group.
// catalogs: { groupKey: number[] }. If no catalog size is large enough the largest is used and the variable is flagged.
// ---------------------------------------------------------------------------------------------

export function parseCatalog(text) {
  if (Array.isArray(text)) return [...text].map(Number).filter(v => isNum(v) && v > 0).sort((a, b) => a - b);
  return String(text || '').split(/[,\s;]+/).map(Number).filter(v => isNum(v) && v > 0).sort((a, b) => a - b);
}

export function roundToCatalog(model, vm, x, catalogs) {
  const xr = x.slice();
  const exceeded = [];
  for (let j = 0; j < vm.n; j++) {
    const g = vm.groupOf[j];
    const cat = parseCatalog(catalogs && catalogs[g] !== undefined ? catalogs[g] : CATALOG_DEFAULTS[model.groups[g].material]);
    if (!cat.length) return err(`Group "${g}" has an empty catalog.`);
    const up = cat.find(v => v >= x[j] * (1 - 1e-12));
    if (up === undefined) { xr[j] = cat[cat.length - 1]; exceeded.push({ variable: j, name: vm.names[j], needed: x[j], largest: cat[cat.length - 1] }); }
    else xr[j] = up;
  }
  return { ok: true, x: xr, areas: expandAreas(vm, xr), exceeded };
}

// Verify a per-member area vector against every load case of the preset the model came from.
export function checkAllLoadCases(model, areas, opts = {}) {
  const out = [];
  for (const lc of model.loadCaseKeys) {
    const m2 = buildModel({ ...model._preset, key: model.key }, { loadCase: lc });
    if (!m2.ok) { out.push({ loadCase: lc, ok: false, error: m2.error }); continue; }
    const v = verifyDesign(m2, areas, opts);
    out.push({ loadCase: lc, ok: v.ok, feasible: v.feasible, maxU: v.maxU, disp: v.disp, slack: v.slack, governingSummary: v.governingSummary, error: v.error });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Test helper: symmetric two-bar truss. Two bars of length L at angle theta (degrees) to the horizontal meet at a
// loaded node; the supports are above the node. A vertical load P (positive upward) acts at the node.
// Closed form: N = -P / (2 sin theta) in each bar (a downward load, P < 0, puts both bars in tension) and the
// vertical deflection v = P L / (2 E A sin^2 theta) (same sign as P).
// ---------------------------------------------------------------------------------------------

export function makeTwoBarTruss({ theta = 45, L = 1000, P = -1000, material = 'steel', A0 = 100, Amin = 1 } = {}) {
  const t = theta * Math.PI / 180;
  const dx = L * Math.cos(t), dy = L * Math.sin(t);
  return {
    key: 'two-bar', name: 'Symmetric two-bar truss',
    nodes: [[0, 0], [-dx, dy], [dx, dy]],
    members: [[0, 1, 'bar'], [0, 2, 'bar']],
    groups: { bar: { material, A0, tensionOnly: false, buckling: 'none' } },
    supports: { 1: [1, 1], 2: [1, 1] },
    loads: { 0: [0, P] },
    loadCases: { 'default': { 0: [0, P] } },
    closedForm: { N: -P / (2 * Math.sin(t)), v: P * L / (2 * MATERIALS[material].E * A0 * Math.sin(t) ** 2), Amin },
  };
}
