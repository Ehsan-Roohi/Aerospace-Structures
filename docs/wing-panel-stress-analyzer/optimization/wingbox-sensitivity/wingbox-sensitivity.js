// MIE 446 Optimization Lab: wing box layout, sensitivities, active constraints and shadow prices.
// Pure ES module: solvers, optimizers and helpers only. NO DOM access.
// Units: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g, angles degrees.
//
// The wing box model here is written for this page alone (thin-walled single cell, lumped caps and skins,
// Bredt-Batho torsion, Euler-Bernoulli bending of a cantilever with an elliptic lift distribution).
// It is independent of the Wing AeroStruct solver on the same site.

import { MATERIALS } from '../shared/presets.js';

// ---------------------------------------------------------------------------------------------
// Constants and defaults
// ---------------------------------------------------------------------------------------------

export const G_ACCEL = 9.81;        // m/s^2
export const RHO_AIR = 1.225;       // kg/m^3
export const BOX_FRONT = 0.15;      // spar box front face, fraction of chord
export const BOX_REAR = 0.60;       // spar box rear face, fraction of chord
export const AERO_CENTRE = 0.25;    // aerodynamic centre, fraction of chord
export const HEIGHT_FACTOR = 0.9;   // box height = 0.9 * tau * c
export const N_STATIONS = 201;      // spanwise stations (200 intervals)
export const A_CAP_MIN = 0.5;       // mm^2, lower bound of the cap area in the optimizer
export const A_CAP_MAX = 500;       // mm^2
export const T_MAX = 20;            // mm, upper bound of thicknesses in the optimizer
export const T_FLOOR = 0.05;        // mm, absolute lower bound used when t_min is 0
export const ACTIVE_TOL = 0.02;     // a constraint is "active" when its U is within this of 1
const SQRT3 = Math.sqrt(3);

export const DEFAULTS = Object.freeze({
  s: 900, cRoot: 240, cTip: 160, tau: 0.12,
  tSkin: 1.2, tWeb: 1.5, aCap: 25, nRibs: 6, tRib: 1.5,
  skinMaterial: 'pla', capMaterial: 'cfrp',
  massKg: 2.5, loadFactor: 3.0, FS: 1.5, V: 15, cm: -0.05,
  deflLimitPct: 5, twistLimitDeg: 2, tMin: 0.8, kBuckle: 4.0, nu: 0.35,
  loadShape: 'elliptic',          // 'elliptic' | 'uniform' (the uniform case is the closed-form test switch)
  capTaper: 'constant',           // 'constant' | 'moment' | 'fullyStressed' (used by the cap taper study)
  capFloor: 0.2,                  // tapered caps never drop below this fraction of the root cap area
  allowScale: 1,                  // hidden multiplier on both allowable stresses (used by shadow price checks)
  ribMin: 2, ribMax: 16,          // rib count range searched by the optimizer
});

// Scenario presets: partial overrides of DEFAULTS. The first one is the task's default wing.
export const SCENARIOS = {
  'printed-trainer': { name: 'Printed trainer wing (task defaults: PLA skins, CFRP caps)', overrides: {} },
  'stiffness-critical': { name: 'Stiffness critical: tip deflection limit 0.5 percent of half-span', overrides: { deflLimitPct: 0.5 } },
  'spruce-caps': { name: 'Spruce spar caps instead of CFRP (baseline fails the buckling screen)', overrides: { capMaterial: 'spruce' } },
  'twist-critical': { name: 'Twist critical: V = 40 m/s, c_m = -0.15, twist limit 0.5 degree', overrides: { V: 40, cm: -0.15, twistLimitDeg: 0.5 } },
};

export const CONSTRAINT_KEYS = ['stress', 'buckle', 'defl', 'twist', 'thick'];
export const CONSTRAINT_LABELS = {
  stress: 'Stress (caps, skins, webs)',
  buckle: 'Upper skin buckling screen',
  defl: 'Tip deflection limit',
  twist: 'Tip twist limit',
  thick: 'Minimum printable thickness',
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

export function num(x, digits = 3) {
  if (x === null || x === undefined || Number.isNaN(x)) return 'n/a';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const ax = Math.abs(x);
  if (ax === 0) return '0';
  if (ax >= 1e6 || ax < 1e-3) return x.toExponential(Math.max(0, digits - 1));
  const intDigits = Math.floor(Math.log10(ax)) + 1;
  return x.toFixed(Math.max(0, digits - intDigits));
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function maxAbs(a) { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); return m; }

// Solve a small dense linear system A z = b by Gaussian elimination with partial pivoting.
// Returns null when the matrix is numerically singular.
export function solveLinear(Ain, bin) {
  const n = bin.length;
  const A = Ain.map(r => r.slice());
  const b = bin.slice();
  let scale = 0;
  for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v));
  if (!(scale > 0)) return null;
  for (let k = 0; k < n; k++) {
    let p = k, best = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > best) { best = Math.abs(A[i][k]); p = i; }
    if (best < 1e-12 * scale) return null;
    if (p !== k) { [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]]; }
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  const z = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * z[j];
    z[i] = s / A[i][i];
  }
  return z;
}

// ---------------------------------------------------------------------------------------------
// Closed forms
// ---------------------------------------------------------------------------------------------

// Elastic plate buckling stress, simply supported edges: sigma_cr = k pi^2 E / (12 (1 - nu^2)) (t / b)^2.
export function plateBucklingStress(k, E, nu, t, b) {
  if (!(b > 0) || !(t > 0)) return NaN;
  return k * Math.PI * Math.PI * E / (12 * (1 - nu * nu)) * (t / b) * (t / b);
}

// Largest plate width (rib pitch) for which the plate buckling stress still reaches sigmaRequired.
export function maxRibPitch(k, E, nu, t, sigmaRequired) {
  if (!(sigmaRequired > 0)) return Infinity;
  return t * Math.sqrt(k * Math.PI * Math.PI * E / (12 * (1 - nu * nu) * sigmaRequired));
}

// Bredt-Batho torsion constant of a single rectangular cell with skin thickness tSkin (top and bottom)
// and web thickness tWeb (front and rear): J = 4 A_m^2 / (sum of ds / t).
export function bredtJ(w, h, tSkin, tWeb) {
  const Am = w * h;
  return 4 * Am * Am / (2 * w / tSkin + 2 * h / tWeb);
}

// Elliptic lift per unit span on a half wing carrying Lhalf: l(y) = l0 sqrt(1 - (y/s)^2), l0 = 4 Lhalf / (pi s).
export function ellipticLift(y, s, Lhalf) {
  const l0 = 4 * Lhalf / (Math.PI * s);
  const e = y / s;
  return l0 * Math.sqrt(Math.max(0, 1 - e * e));
}

// ---------------------------------------------------------------------------------------------
// Input validation (returns error objects, never throws)
// ---------------------------------------------------------------------------------------------

const NUMERIC_RULES = [
  ['s', 'Half-span s', v => v > 0, 'must be positive'],
  ['cRoot', 'Root chord', v => v > 0, 'must be positive'],
  ['cTip', 'Tip chord', v => v > 0, 'must be positive (use a small value for a pointed tip)'],
  ['tau', 'Thickness ratio tau', v => v >= 0.01 && v <= 0.5, 'must be between 0.01 and 0.5'],
  ['tSkin', 'Skin thickness t_s', v => v > 0, 'must be positive'],
  ['tWeb', 'Web thickness t_w', v => v > 0, 'must be positive'],
  ['aCap', 'Cap area A_cap', v => v > 0, 'must be positive'],
  ['nRibs', 'Rib count n_r', v => Number.isInteger(v) && v >= 1 && v <= 200, 'must be an integer between 1 and 200'],
  ['tRib', 'Rib thickness t_r', v => v > 0, 'must be positive'],
  ['massKg', 'Aircraft mass', v => v > 0, 'must be positive'],
  ['loadFactor', 'Load factor n', v => v > 0, 'must be positive (the upper skin is the compression side)'],
  ['FS', 'Factor of safety', v => v >= 1, 'must be at least 1'],
  ['V', 'Airspeed V', v => v >= 0, 'must be zero or positive'],
  ['cm', 'Pitching moment coefficient c_m', () => true, ''],
  ['deflLimitPct', 'Deflection limit', v => v > 0, 'must be positive'],
  ['twistLimitDeg', 'Twist limit', v => v > 0, 'must be positive'],
  ['tMin', 'Minimum printable thickness t_min', v => v >= 0 && v < T_MAX, 'must be between 0 and 20 mm'],
  ['kBuckle', 'Plate buckling coefficient k', v => v > 0, 'must be positive'],
  ['nu', 'Poisson ratio nu', v => v >= 0 && v < 0.5, 'must be between 0 and 0.5'],
  ['capFloor', 'Cap taper floor', v => v >= 0 && v <= 1, 'must be a fraction between 0 and 1'],
  ['allowScale', 'Allowable stress scale', v => v > 0, 'must be positive'],
  ['ribMin', 'Minimum rib count searched', v => Number.isInteger(v) && v >= 1, 'must be an integer of at least 1'],
  ['ribMax', 'Maximum rib count searched', v => Number.isInteger(v) && v <= 60, 'must be an integer of at most 60'],
];

export function validateInputs(raw) {
  const inp = Object.assign({}, DEFAULTS, raw || {});
  for (const [key, label, test, msg] of NUMERIC_RULES) {
    const v = Number(inp[key]);
    if (!Number.isFinite(v)) return { ok: false, error: `${label} must be a finite number.` };
    if (!test(v)) return { ok: false, error: `${label} ${msg}.` };
    inp[key] = v;
  }
  if (inp.ribMax < inp.ribMin) return { ok: false, error: 'The maximum rib count searched must not be smaller than the minimum.' };
  if (!MATERIALS[inp.skinMaterial]) return { ok: false, error: `Unknown skin material "${inp.skinMaterial}".` };
  if (!MATERIALS[inp.capMaterial]) return { ok: false, error: `Unknown cap material "${inp.capMaterial}".` };
  if (!['elliptic', 'uniform'].includes(inp.loadShape)) return { ok: false, error: 'Load shape must be "elliptic" or "uniform".' };
  if (!['constant', 'moment', 'fullyStressed'].includes(inp.capTaper)) return { ok: false, error: 'Cap taper must be "constant", "moment" or "fullyStressed".' };
  return { ok: true, inputs: inp };
}

// ---------------------------------------------------------------------------------------------
// Loads: geometry along the span, lift, shear, bending moment and torque (independent of the sizing)
// ---------------------------------------------------------------------------------------------

export function computeLoads(inp) {
  const N = N_STATIONS;
  const s = inp.s;
  const dy = s / (N - 1);
  const y = new Float64Array(N), c = new Float64Array(N), w = new Float64Array(N), h = new Float64Array(N);
  const l = new Float64Array(N), tq = new Float64Array(N), V = new Float64Array(N), M = new Float64Array(N), T = new Float64Array(N);
  const Lhalf = inp.loadFactor * inp.massKg * G_ACCEL / 2;          // N carried by the half wing
  const uniform = inp.loadShape === 'uniform';
  const l0 = uniform ? Lhalf / s : 4 * Lhalf / (Math.PI * s);        // N/mm
  const q = 0.5 * RHO_AIR * inp.V * inp.V * 1e-6;                      // dynamic pressure, MPa
  const arm = (BOX_FRONT + BOX_REAR) / 2 - AERO_CENTRE;                // lift acts this fraction of chord ahead of the shear centre
  for (let i = 0; i < N; i++) {
    y[i] = i === N - 1 ? s : i * dy;
    c[i] = inp.cRoot + (inp.cTip - inp.cRoot) * y[i] / s;
    w[i] = (BOX_REAR - BOX_FRONT) * c[i];
    h[i] = HEIGHT_FACTOR * inp.tau * c[i];
    const e = y[i] / s;
    l[i] = uniform ? l0 : l0 * Math.sqrt(Math.max(0, 1 - e * e));
    tq[i] = l[i] * arm * c[i] + q * c[i] * c[i] * inp.cm;             // N mm per mm, nose-up positive
  }
  V[N - 1] = 0; M[N - 1] = 0; T[N - 1] = 0;
  for (let i = N - 2; i >= 0; i--) {
    V[i] = V[i + 1] + 0.5 * (l[i] + l[i + 1]) * dy;
    M[i] = M[i + 1] + 0.5 * (V[i] + V[i + 1]) * dy;
    T[i] = T[i + 1] + 0.5 * (tq[i] + tq[i + 1]) * dy;
  }
  return { N, y, c, w, h, l, tq, V, M, T, dy, Lhalf, l0, q, arm };
}

// ---------------------------------------------------------------------------------------------
// Section response for a given sizing (the exact solver of this page)
// ---------------------------------------------------------------------------------------------

// inp: validated inputs; loads: from computeLoads(inp); overrides: design variables to replace
// (tSkin, tWeb, aCap, nRibs, tRib, capTaper, capFloor). light = true skips the spanwise arrays
// (used inside the optimizer; the scalar results are identical).
export function evaluateDesign(inp, loads, overrides, light = false) {
  const d = overrides ? Object.assign({}, inp, overrides) : inp;
  const { N, y, w, h, V, M, T, dy } = loads;
  const matS = MATERIALS[d.skinMaterial], matC = MATERIALS[d.capMaterial];
  const Es = matS.E, Ec = matC.E;
  const G = Es / (2 * (1 + d.nu));
  const allow = d.allowScale || 1;
  const sigAs = matS.sigmaAllow * allow, sigAc = matC.sigmaAllow * allow;
  const FS = d.FS;
  const b = d.s / d.nRibs;
  const sigmaCr = plateBucklingStress(d.kBuckle, Es, d.nu, d.tSkin, b);
  const M0 = M[0];
  const wBox = BOX_REAR - BOX_FRONT;

  let span = null;
  if (!light) {
    span = {
      y, c: loads.c, w, h, l: loads.l, tq: loads.tq, V, M, T,
      Acap: new Float64Array(N), EI: new Float64Array(N), GJ: new Float64Array(N),
      sigmaCap: new Float64Array(N), sigmaSkin: new Float64Array(N), tauWeb: new Float64Array(N), tauSkin: new Float64Array(N),
      Ucap: new Float64Array(N), Uskin: new Float64Array(N), Uweb: new Float64Array(N), Ubuck: new Float64Array(N),
      theta: new Float64Array(N), v: new Float64Array(N), phi: new Float64Array(N),
    };
  }

  let intW = 0, intH = 0, intA = 0;
  let Ustress = 0, iStress = 0, stressTerm = 'cap bending';
  let iBuck = 0, sigSkinMax = 0, sigCapMax = 0, tauWebMax = 0, iCapMax = 0;
  let theta = 0, v = 0, phi = 0, kapPrev = 0, thetaPrev = 0, tgjPrev = 0;
  let EI0 = 0, GJ0 = 0, A0 = d.aCap;

  for (let i = 0; i < N; i++) {
    const hh = h[i], ww = w[i], z = hh / 2;
    let A = d.aCap;
    if (d.capTaper === 'moment') A = d.aCap * Math.max(d.capFloor, M0 > 0 ? M[i] / M0 : 1);
    else if (d.capTaper === 'fullyStressed') A = d.aCap * Math.max(d.capFloor, M0 > 0 ? (M[i] / hh) / (M0 / h[0]) : 1);
    const Icap = 4 * A * z * z;                 // 2 x (2 A_cap) x (h/2)^2
    const Iskin = 2 * ww * d.tSkin * z * z;     // two skins as lumped flanges
    const ei = Ec * Icap + Es * Iskin;          // modulus weighted bending stiffness
    const kap = M[i] / ei;
    const eps = kap * z;                        // outer fibre strain, shared by caps and skins
    const sCap = Ec * eps, sSkin = Es * eps;
    const Am = ww * hh;
    const qV = V[i] / (2 * hh);                 // each web carries half the shear
    const qT = T[i] / (2 * Am);                 // Bredt shear flow
    const tWebStress = (Math.abs(qV) + Math.abs(qT)) / d.tWeb;
    const tSkinStress = Math.abs(qT) / d.tSkin;
    const gj = G * bredtJ(ww, hh, d.tSkin, d.tWeb);
    const uc = Math.abs(sCap) * FS / sigAc;
    const us = Math.abs(sSkin) * FS / sigAs;
    const uw = SQRT3 * tWebStress * FS / sigAs;
    const uss = SQRT3 * tSkinStress * FS / sigAs;
    if (uc > Ustress) { Ustress = uc; iStress = i; stressTerm = 'cap bending'; }
    if (us > Ustress) { Ustress = us; iStress = i; stressTerm = 'skin bending'; }
    if (uw > Ustress) { Ustress = uw; iStress = i; stressTerm = 'web shear'; }
    if (uss > Ustress) { Ustress = uss; iStress = i; stressTerm = 'skin shear'; }
    if (Math.abs(sSkin) > sigSkinMax) { sigSkinMax = Math.abs(sSkin); iBuck = i; }
    if (Math.abs(sCap) > sigCapMax) { sigCapMax = Math.abs(sCap); iCapMax = i; }
    if (tWebStress > tauWebMax) tauWebMax = tWebStress;
    const wt = (i === 0 || i === N - 1) ? 0.5 : 1;
    intW += wt * ww; intH += wt * hh; intA += wt * A;
    // slope, deflection and twist integrated forward from the clamped root (trapezoidal rule)
    const tgj = T[i] / gj;
    if (i === 0) { EI0 = ei; GJ0 = gj; A0 = A; }
    else {
      theta += 0.5 * (kapPrev + kap) * dy;
      v += 0.5 * (thetaPrev + theta) * dy;
      phi += 0.5 * (tgjPrev + tgj) * dy;
    }
    kapPrev = kap; thetaPrev = theta; tgjPrev = tgj;
    if (span) {
      span.Acap[i] = A; span.EI[i] = ei; span.GJ[i] = gj;
      span.sigmaCap[i] = sCap; span.sigmaSkin[i] = sSkin; span.tauWeb[i] = tWebStress; span.tauSkin[i] = tSkinStress;
      span.Ucap[i] = uc; span.Uskin[i] = us; span.Uweb[i] = uw; span.Ubuck[i] = Math.abs(sSkin) * FS / sigmaCr;
      span.theta[i] = theta; span.v[i] = v; span.phi[i] = phi;
    }
  }
  intW *= dy; intH *= dy; intA *= dy;

  const vTip = v;
  const phiTipDeg = phi * 180 / Math.PI;
  const deflLimit = d.deflLimitPct / 100 * d.s;

  // mass in grams
  const rhoS = matS.rho, rhoC = matC.rho;
  const massSkins = 2 * d.tSkin * intW * rhoS / 1000;
  const massWebs = 2 * d.tWeb * intH * rhoS / 1000;
  const massCaps = 4 * intA * rhoC / 1000;
  let massRibs = 0;
  const ribY = [];
  for (let k = 1; k <= d.nRibs; k++) {
    const yk = k * b;
    const ck = d.cRoot + (d.cTip - d.cRoot) * yk / d.s;
    massRibs += wBox * ck * HEIGHT_FACTOR * d.tau * ck * d.tRib;
    ribY.push(yk);
  }
  massRibs *= rhoS / 1000;

  const U = {
    stress: Ustress,
    buckle: sigSkinMax * FS / sigmaCr,
    defl: Math.abs(vTip) / deflLimit,
    twist: Math.abs(phiTipDeg) / d.twistLimitDeg,
    thick: d.tMin / Math.min(d.tSkin, d.tWeb, d.tRib),
  };
  const maxU = Math.max(U.stress, U.buckle, U.defl, U.twist);
  let governing = 'stress', gmax = -Infinity;
  for (const k of CONSTRAINT_KEYS) if (U[k] > gmax) { gmax = U[k]; governing = k; }
  const feasible = CONSTRAINT_KEYS.every(k => U[k] <= 1 + 1e-9);

  return {
    ok: true,
    design: { tSkin: d.tSkin, tWeb: d.tWeb, aCap: d.aCap, nRibs: d.nRibs, tRib: d.tRib, capTaper: d.capTaper, capFloor: d.capFloor },
    mass: { skins: massSkins, webs: massWebs, caps: massCaps, ribs: massRibs, total: massSkins + massWebs + massCaps + massRibs },
    U, maxU, governing, feasible,
    vTip, phiTipDeg, deflLimit, twistLimit: d.twistLimitDeg,
    ribPitch: b, sigmaCr, ribY,
    stress: {
      Ustress, term: stressTerm, yStress: y[iStress],
      sigmaCapMax: sigCapMax, yCapMax: y[iCapMax],
      sigmaSkinMax: sigSkinMax, yBuck: y[iBuck],
      tauWebMax,
    },
    root: { w: w[0], h: h[0], Icap: 4 * A0 * (h[0] / 2) ** 2, Iskin: 2 * w[0] * d.tSkin * (h[0] / 2) ** 2, EI: EI0, GJ: GJ0, J: GJ0 / G, Am: w[0] * h[0] },
    material: { Es, Ec, G, sigAs, sigAc, rhoS, rhoC },
    loads: { Lhalf: loads.Lhalf, l0: loads.l0, q: loads.q, Mroot: M[0], Vroot: V[0], Troot: T[0] },
    span,
  };
}

// Fresh solve from raw inputs. Returns { ok: false, error } for invalid inputs.
export function solveWingBox(raw) {
  const v = validateInputs(raw);
  if (!v.ok) return v;
  const loads = computeLoads(v.inputs);
  return evaluateDesign(v.inputs, loads);
}

// Verification routine: rebuild the model from the candidate design numbers and solve it from scratch.
export function verifyDesign(raw, design) {
  const v = validateInputs(Object.assign({}, raw, design || {}));
  if (!v.ok) return { ok: false, error: v.error, feasible: false };
  const loads = computeLoads(v.inputs);
  const r = evaluateDesign(v.inputs, loads);
  return { ok: true, feasible: r.feasible, utilizations: r.U, governing: r.governing, mass: r.mass.total, result: r };
}

// ---------------------------------------------------------------------------------------------
// Tornado sensitivities
// ---------------------------------------------------------------------------------------------

export const TORNADO_VARIABLES = [
  { key: 'tSkin', label: 't_s skin thickness', unit: 'mm' },
  { key: 'tWeb', label: 't_w web thickness', unit: 'mm' },
  { key: 'aCap', label: 'A_cap spar cap area', unit: 'mm^2' },
  { key: 'nRibs', label: 'n_r rib count', unit: '', integer: true },
  { key: 'tRib', label: 't_r rib thickness', unit: 'mm' },
  { key: 'tau', label: 'tau thickness ratio', unit: '' },
];

export const TORNADO_RESPONSES = [
  { key: 'mass', label: 'Mass', unit: 'g', get: r => r.mass.total },
  { key: 'vTip', label: 'Tip deflection', unit: 'mm', get: r => Math.abs(r.vTip) },
  { key: 'twist', label: 'Tip twist', unit: 'deg', get: r => Math.abs(r.phiTipDeg) },
  { key: 'maxU', label: 'Max structural U', unit: '', get: r => r.maxU },
];

// One-at-a-time perturbation of each design variable by +-delta (relative) or +-1 rib.
// Reports percent changes and elasticities d ln R / d ln x (central differences).
export function tornado(raw, delta = 0.1) {
  const v = validateInputs(raw);
  if (!v.ok) return v;
  const inp = v.inputs;
  const base = solveWingBox(inp);
  const rows = TORNADO_VARIABLES.map(vr => {
    const x0 = inp[vr.key];
    const xm = vr.integer ? Math.max(1, x0 - 1) : x0 * (1 - delta);
    const xp = vr.integer ? x0 + 1 : x0 * (1 + delta);
    const rm = solveWingBox(Object.assign({}, inp, { [vr.key]: xm }));
    const rp = solveWingBox(Object.assign({}, inp, { [vr.key]: xp }));
    const responses = TORNADO_RESPONSES.map(resp => {
      const R0 = resp.get(base), Rm = resp.get(rm), Rp = resp.get(rp);
      const pctMinus = R0 !== 0 ? (Rm - R0) / R0 * 100 : NaN;
      const pctPlus = R0 !== 0 ? (Rp - R0) / R0 * 100 : NaN;
      const elasticity = (Rm > 0 && Rp > 0 && xp > xm) ? (Math.log(Rp) - Math.log(Rm)) / (Math.log(xp) - Math.log(xm)) : (Rm === Rp ? 0 : NaN);
      return { key: resp.key, label: resp.label, unit: resp.unit, R0, Rm, Rp, pctMinus, pctPlus, elasticity };
    });
    return { key: vr.key, label: vr.label, unit: vr.unit, integer: !!vr.integer, x0, xm, xp, responses };
  });
  return { ok: true, base, delta, rows };
}

// ---------------------------------------------------------------------------------------------
// Small convex quadratic program by active-set enumeration (tiny problems only)
// ---------------------------------------------------------------------------------------------

// minimize c . u + (mu / 2) u . u  subject to  A[i] . u <= b[i].
// Enumerates candidate active sets S (|S| <= n), solves the equality constrained problem through its
// KKT system and returns the first candidate that is primal and dual feasible (the unique optimum of a
// strictly convex QP). The problem must be feasible (u = 0 is feasible in every call made here).
export function qpActiveSet(c, mu, A, b) {
  const n = c.length, m = A.length;
  const tol = 1e-9;
  const check = (u) => {
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += A[i][j] * u[j];
      if (s > b[i] + tol * (1 + Math.abs(b[i]))) return false;
    }
    return true;
  };
  // |S| = 0
  const u0 = c.map(ci => -ci / mu);
  if (check(u0)) return { ok: true, u: u0, active: [] };
  for (let size = 1; size <= Math.min(n, m); size++) {
    const comb = new Array(size);
    for (let i = 0; i < size; i++) comb[i] = i;
    for (;;) {
      // Solve (A_S A_S^T) lambda = -(mu b_S + A_S c), then u = -(c + A_S^T lambda) / mu
      const G = Array.from({ length: size }, () => new Array(size).fill(0));
      const rhs = new Array(size).fill(0);
      for (let p = 0; p < size; p++) {
        const ap = A[comb[p]];
        for (let q = 0; q < size; q++) G[p][q] = dot(ap, A[comb[q]]);
        rhs[p] = -(mu * b[comb[p]] + dot(ap, c));
      }
      const lam = solveLinear(G, rhs);
      if (lam && lam.every(l => l >= -tol)) {
        const u = c.slice();
        for (let p = 0; p < size; p++) for (let j = 0; j < n; j++) u[j] += lam[p] * A[comb[p]][j];
        for (let j = 0; j < n; j++) u[j] = -u[j] / mu;
        if (check(u)) return { ok: true, u, active: comb.slice(), lambda: lam };
      }
      let i = size - 1;
      while (i >= 0 && comb[i] === m - size + i) i--;
      if (i < 0) break;
      comb[i]++;
      for (let j = i + 1; j < size; j++) comb[j] = comb[j - 1] + 1;
    }
  }
  return { ok: false, reason: 'no active set satisfied the optimality conditions' };
}

// ---------------------------------------------------------------------------------------------
// Minimum mass sizing for a fixed rib count: sequential linear programming with a proximal term
// ---------------------------------------------------------------------------------------------
// Each iteration linearizes the mass and the four structural utilizations in the scaled variables
// u_i = (x_i - x_k,i) / x_k,i, adds a proximal (trust region) term so that the unconstrained step has the
// length of the move limit, and solves the small QP exactly. The trial point is corrected back onto the
// violated constraints by Newton steps along the constraint gradients (fallback: scale all variables up),
// so every accepted iterate is feasible and the mass decreases monotonically. The move limit starts at
// 20 percent, is halved when a step is rejected or when consecutive steps reverse direction, and the loop
// stops after 60 iterations or when the move limit falls below 1e-4.

const STRUCT_KEYS = ['stress', 'buckle', 'defl', 'twist'];
function structFeasible(r) { return STRUCT_KEYS.every(k => r.U[k] <= 1 + 1e-9); }
function gOf(r) { return STRUCT_KEYS.map(k => r.U[k] - 1); }

function fdGradients(evalAt, x, rel = 1e-3) {
  const n = x.length;
  const gf = new Array(n), gg = STRUCT_KEYS.map(() => new Array(n));
  for (let i = 0; i < n; i++) {
    const hstep = rel * Math.max(Math.abs(x[i]), 1e-6);
    const xp = x.slice(), xm = x.slice();
    xp[i] += hstep; xm[i] -= hstep;
    const rp = evalAt(xp), rm = evalAt(xm);
    gf[i] = (rp.mass.total - rm.mass.total) / (2 * hstep);
    const gp = gOf(rp), gm = gOf(rm);
    for (let j = 0; j < STRUCT_KEYS.length; j++) gg[j][i] = (gp[j] - gm[j]) / (2 * hstep);
  }
  return { gf, gg };
}

// Scale all three variables up by the smallest factor alpha >= 1 that restores structural feasibility.
// Every U of this model decreases monotonically when t_s, t_w and A_cap grow together, so bisection is safe.
function restoreByScaling(x, evalAt, ub) {
  const at = a => x.map((xi, i) => Math.min(ub[i], xi * a));
  let lo = 1, hi = null, rHi = null;
  for (const a of [1.001, 1.005, 1.02, 1.05, 1.1, 1.2, 1.5, 2, 3, 5, 10, 20]) {
    const r = evalAt(at(a));
    if (structFeasible(r)) { hi = a; rHi = r; break; }
    lo = a;
  }
  if (hi === null) return null;
  for (let k = 0; k < 30; k++) {
    const mid = 0.5 * (lo + hi);
    const rm = evalAt(at(mid));
    if (structFeasible(rm)) { hi = mid; rHi = rm; } else lo = mid;
  }
  return { x: at(hi), r: rHi };
}

// Newton correction onto the violated constraints: minimum-norm step in scaled variables along the
// gradients of the violated g_j. Falls back to uniform scaling when three corrections do not suffice.
function restoreFeasibility(x, r, evalAt, lb, ub) {
  let xc = x.slice(), rc = r;
  for (let it = 0; it < 3 && !structFeasible(rc); it++) {
    const g = gOf(rc);
    const viol = [];
    g.forEach((gj, j) => { if (gj > 0) viol.push(j); });
    const { gg } = fdGradients(evalAt, xc);
    const J = viol.map(j => gg[j].map((gij, i) => gij * xc[i]));
    const rhs = viol.map(j => -(g[j] + 1e-7));
    const JJt = J.map(rowp => J.map(rowq => dot(rowp, rowq)));
    const lam = solveLinear(JJt, rhs);
    if (!lam) break;
    const du = new Array(xc.length).fill(0);
    for (let p = 0; p < viol.length; p++) for (let i = 0; i < xc.length; i++) du[i] += lam[p] * J[p][i];
    xc = xc.map((xi, i) => clamp(xi * (1 + du[i]), lb[i], ub[i]));
    rc = evalAt(xc);
  }
  if (structFeasible(rc)) return { x: xc, r: rc };
  return restoreByScaling(xc, evalAt, ub);
}

export function designBounds(inp) {
  const lbT = Math.max(inp.tMin, T_FLOOR);
  return { lb: [lbT, lbT, A_CAP_MIN], ub: [T_MAX, T_MAX, A_CAP_MAX], lbT };
}

// opts: { maxIter (60), moveLimit (0.2), minMove (1e-4), x0: { tSkin, tWeb, aCap } }
export function optimizeForRibs(raw, nRibs, opts = {}) {
  const v = validateInputs(raw);
  if (!v.ok) return v;
  const inp = v.inputs;
  const loads = computeLoads(inp);
  const maxIter = opts.maxIter ?? 60;
  const minMove = opts.minMove ?? 1e-4;
  const ml0 = opts.moveLimit ?? 0.2;
  let ml = ml0;
  const { lb, ub } = designBounds(inp);
  const start = opts.x0 ? [opts.x0.tSkin, opts.x0.tWeb, opts.x0.aCap] : [inp.tSkin, inp.tWeb, inp.aCap];
  let x = start.map((xi, i) => clamp(xi, lb[i], ub[i]));
  const evalAt = xx => evaluateDesign(inp, loads, { tSkin: xx[0], tWeb: xx[1], aCap: xx[2], nRibs, capTaper: 'constant' }, true);
  const warnings = [];
  if (inp.tRib < inp.tMin) warnings.push(`The rib thickness t_r = ${num(inp.tRib)} mm is below t_min = ${num(inp.tMin)} mm; it is not a design variable here, so the thickness check stays violated until t_r is raised.`);

  let r = evalAt(x);
  let restoredStart = false;
  if (!structFeasible(r)) {
    const rr = restoreFeasibility(x, r, evalAt, lb, ub);
    if (!rr) {
      return { ok: true, feasible: false, nRibs, reason: 'no feasible sizing exists within the variable bounds for this rib count', warnings, iterations: 0, history: [] };
    }
    x = rr.x; r = rr.r; restoredStart = true;
  }

  const history = [{ iter: 0, mass: r.mass.total, moveLimit: ml, U: Object.assign({}, r.U) }];
  let uPrev = null, status = 'maximum iterations reached', iter = 0, smallSteps = 0;
  for (iter = 1; iter <= maxIter; iter++) {
    if (ml < minMove) { status = 'move limit below tolerance'; break; }
    const f = r.mass.total;
    const g = gOf(r);
    const { gf, gg } = fdGradients(evalAt, x);
    const cS = gf.map((gi, i) => gi * x[i]);
    const lo = x.map((xi, i) => Math.max(-ml, lb[i] / xi - 1));
    const hi = x.map((xi, i) => Math.min(ml, ub[i] / xi - 1));
    // QP rows: linearized constraints g_j + a_j . u <= 0, and the box lo <= u <= hi
    const rows = [], rhs = [];
    for (let j = 0; j < g.length; j++) { rows.push(gg[j].map((gij, i) => gij * x[i])); rhs.push(-g[j]); }
    for (let i = 0; i < x.length; i++) {
      const e = new Array(x.length).fill(0); e[i] = 1; rows.push(e); rhs.push(hi[i]);
      const e2 = new Array(x.length).fill(0); e2[i] = -1; rows.push(e2); rhs.push(-lo[i]);
    }
    // Proximal weight: start so that the unconstrained step has the length of the move limit; when the
    // active constraints leave only a short projected step, relax the weight so that the step along the
    // feasible directions uses the move limit (the box still bounds every component by ml).
    let mu = Math.sqrt(dot(cS, cS)) / ml + 1e-12;
    let qp = qpActiveSet(cS, mu, rows, rhs);
    for (let k = 0; k < 4 && qp.ok; k++) {
      const len = maxAbs(qp.u);
      if (len >= 0.5 * ml || len <= 0) break;
      mu *= Math.max(len / ml, 1e-6);
      const qp2 = qpActiveSet(cS, mu, rows, rhs);
      if (!qp2.ok) break;
      qp = qp2;
    }
    if (!qp.ok) { ml *= 0.5; history.push({ iter, mass: f, moveLimit: ml, note: 'QP failed' }); continue; }
    const u = qp.u;
    if (maxAbs(u) < 1e-9) { status = 'no further step from the linearized problem'; break; }
    const predicted = -dot(cS, u);
    if (predicted <= 1e-9 * f) { status = 'linearized problem predicts no mass decrease'; break; }
    let xt = x.map((xi, i) => clamp(xi * (1 + u[i]), lb[i], ub[i]));
    let rt = evalAt(xt);
    if (!structFeasible(rt)) {
      const rr = restoreFeasibility(xt, rt, evalAt, lb, ub);
      if (!rr) { ml *= 0.5; history.push({ iter, mass: f, moveLimit: ml, note: 'restoration failed' }); continue; }
      xt = rr.x; rt = rr.r;
    }
    const actual = f - rt.mass.total;
    if (actual > 1e-12 * f) {
      const ratio = actual / predicted;             // trust region quality of the linear prediction
      const hitLimit = maxAbs(u) >= 0.9 * ml;
      if (uPrev && dot(u, uPrev) < 0) ml *= 0.5;    // oscillation: halve the move limit
      else if (ratio < 0.25) ml *= 0.5;             // poor prediction (curved constraint): halve
      else if (ratio > 0.75 && hitLimit) ml = Math.min(ml0, ml * 2);
      x = xt; r = rt; uPrev = u;
      smallSteps = actual < 1e-8 * f ? smallSteps + 1 : 0;
      history.push({ iter, mass: r.mass.total, moveLimit: ml, ratio, U: Object.assign({}, r.U) });
      if (smallSteps >= 3) { status = 'mass change below tolerance'; break; }
    } else {
      ml *= 0.5;                                    // no actual decrease: halve and retry
      history.push({ iter, mass: f, moveLimit: ml, note: 'step rejected' });
    }
  }
  const design = { tSkin: x[0], tWeb: x[1], aCap: x[2], nRibs, tRib: inp.tRib };
  return {
    ok: true, feasible: true, nRibs, design, mass: r.mass.total, result: r,
    iterations: Math.min(iter, maxIter), status, history, restoredStart, warnings,
    converged: status !== 'maximum iterations reached',
  };
}

// Convenience: full optimization over the rib range, synchronous. The page runs the same loop in chunks.
export function optimizeAll(raw, opts = {}) {
  const v = validateInputs(raw);
  if (!v.ok) return v;
  const inp = v.inputs;
  const baseline = solveWingBox(inp);
  const perRib = [];
  for (let n = inp.ribMin; n <= inp.ribMax; n++) perRib.push(optimizeForRibs(inp, n, opts));
  const best = pickBest(perRib);
  const analysis = best ? analyzeOptimum(inp, best.design) : null;
  return { ok: true, baseline, perRib, best, analysis };
}

export function pickBest(perRib) {
  let best = null;
  for (const p of perRib) {
    if (!p.ok || !p.feasible) continue;
    if (!best || p.mass < best.mass) best = p;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// KKT multipliers by least squares (non-negative) and shadow prices
// ---------------------------------------------------------------------------------------------

// Unconstrained least squares min |A lambda - b| over the selected columns through the normal equations.
function leastSquares(A, b, cols) {
  const m = cols.length, n = b.length;
  const AtA = Array.from({ length: m }, () => new Array(m).fill(0));
  const Atb = new Array(m).fill(0);
  for (let p = 0; p < m; p++) {
    for (let q = 0; q < m; q++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += A[i][cols[p]] * A[i][cols[q]];
      AtA[p][q] = s;
    }
    let s = 0;
    for (let i = 0; i < n; i++) s += A[i][cols[p]] * b[i];
    Atb[p] = s;
  }
  let trace = 0;
  for (let p = 0; p < m; p++) trace += AtA[p][p];
  for (let p = 0; p < m; p++) AtA[p][p] += 1e-12 * (trace || 1);
  return solveLinear(AtA, Atb);
}

// Exact non-negative least squares for tiny problems: enumerate supports, keep the one with the
// smallest residual among those whose coefficients are all non-negative.
export function nnls(A, b) {
  const m = A[0] ? A[0].length : 0;
  const n = b.length;
  let best = null, bestRes = Infinity;
  const normB = Math.sqrt(dot(b, b));
  for (let mask = 0; mask < (1 << m); mask++) {
    const cols = [];
    for (let j = 0; j < m; j++) if (mask & (1 << j)) cols.push(j);
    const lam = new Array(m).fill(0);
    if (cols.length) {
      const sol = leastSquares(A, b, cols);
      if (!sol || sol.some(v => v < -1e-12)) continue;
      cols.forEach((j, k) => { lam[j] = Math.max(0, sol[k]); });
    }
    let res = 0;
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let j = 0; j < m; j++) s -= A[i][j] * lam[j];
      res += s * s;
    }
    res = Math.sqrt(res);
    if (best === null || res < bestRes - 1e-14 * (1 + bestRes)) { bestRes = res; best = lam; }
  }
  return { lambda: best || new Array(m).fill(0), residual: bestRes, relResidual: normB > 0 ? bestRes / normB : bestRes };
}

// Estimate Lagrange multipliers at a point x for  minimize f(x) subject to g_j(x) <= 0  (all g_j passed are
// treated as active). Gradients by central differences; the stationarity condition grad f + sum lambda_j grad g_j = 0
// is solved in the least squares sense with lambda_j >= 0. Rows are scaled by |x_i| so that variables with
// different units carry comparable weight. Returns lambda (same order as cons), gradients and the KKT residual.
export function estimateMultipliers(f, cons, x, opts = {}) {
  const n = x.length;
  const rel = opts.step ?? 1e-4;
  const grad = fn => x.map((xi, i) => {
    const h = rel * Math.max(Math.abs(xi), 1e-3);
    const xp = x.slice(), xm = x.slice();
    xp[i] = xi + h; xm[i] = xi - h;
    return (fn(xp) - fn(xm)) / (2 * h);
  });
  const gradF = grad(f);
  const gradG = cons.map(cn => grad(cn.g));
  const sc = x.map(xi => (opts.scaled === false ? 1 : Math.max(Math.abs(xi), 1e-12)));
  const A = Array.from({ length: n }, (_, i) => cons.map((_, j) => -gradG[j][i] * sc[i]));
  const b = gradF.map((gi, i) => gi * sc[i]);
  if (!cons.length) return { lambda: [], gradF, gradG, residual: Math.sqrt(dot(b, b)), relResidual: 1 };
  const sol = nnls(A, b);
  return { lambda: sol.lambda, gradF, gradG, residual: sol.residual, relResidual: sol.relResidual };
}

// Constraint definitions used for the KKT analysis of a sizing optimum.
function kktConstraints(inp, evalAt, lbT) {
  return [
    { key: 'stress', label: CONSTRAINT_LABELS.stress, g: xx => evalAt(xx).U.stress - 1 },
    { key: 'buckle', label: CONSTRAINT_LABELS.buckle, g: xx => evalAt(xx).U.buckle - 1 },
    { key: 'defl', label: CONSTRAINT_LABELS.defl, g: xx => evalAt(xx).U.defl - 1 },
    { key: 'twist', label: CONSTRAINT_LABELS.twist, g: xx => evalAt(xx).U.twist - 1 },
    { key: 'tSkinMin', label: 'Skin thickness at t_min', g: xx => (lbT - xx[0]) / lbT },
    { key: 'tWebMin', label: 'Web thickness at t_min', g: xx => (lbT - xx[1]) / lbT },
    { key: 'aCapMin', label: `Cap area at its lower bound (${A_CAP_MIN} mm^2)`, g: xx => (A_CAP_MIN - xx[2]) / A_CAP_MIN },
  ];
}

// Translate a multiplier (grams per unit of the normalized constraint g_j) into a shadow price sentence.
export function shadowPrice(key, lambda, inp, lbT) {
  const Ld = inp.deflLimitPct / 100 * inp.s;
  switch (key) {
    case 'defl': {
      const perMm = lambda / Ld;
      return { amount: perMm, unit: 'g per mm of deflection limit',
        text: `Relaxing the tip deflection limit by 1 mm (from ${num(Ld)} mm to ${num(Ld + 1)} mm) would save about ${num(perMm)} g, to first order.` };
    }
    case 'twist': {
      const per01 = lambda * 0.1 / inp.twistLimitDeg;
      return { amount: per01, unit: 'g per 0.1 degree of twist limit',
        text: `Relaxing the tip twist limit by 0.1 degree (from ${num(inp.twistLimitDeg)} to ${num(inp.twistLimitDeg + 0.1)} degrees) would save about ${num(per01)} g.` };
    }
    case 'buckle': {
      const per1pct = lambda * (1 - 1 / 1.01);
      return { amount: per1pct, unit: 'g per 1 percent of critical buckling stress',
        text: `A critical buckling stress 1 percent higher (a stiffer skin material, or a plate coefficient k of ${num(inp.kBuckle * 1.01)} instead of ${num(inp.kBuckle)}) would save about ${num(per1pct)} g.` };
    }
    case 'stress': {
      const per1pct = lambda * (1 - 1 / 1.01);
      return { amount: per1pct, unit: 'g per 1 percent of allowable stress',
        text: `Raising the allowable stresses by 1 percent would save about ${num(per1pct)} g.` };
    }
    case 'tSkinMin': {
      if (lbT <= T_FLOOR) return { amount: lambda, unit: 'g per unit of the normalized bound',
        text: `The skin thickness sits at the solver floor of ${num(T_FLOOR)} mm (t_min is zero); the skin is not needed by any structural constraint here.` };
      const per01 = lambda * 0.1 / lbT;
      return { amount: per01, unit: 'g per 0.1 mm of minimum thickness (skin)',
        text: `Lowering the minimum printable thickness by 0.1 mm (from ${num(lbT)} to ${num(lbT - 0.1)} mm) would let the skins thin further and save about ${num(per01)} g.` };
    }
    case 'tWebMin': {
      if (lbT <= T_FLOOR) return { amount: lambda, unit: 'g per unit of the normalized bound',
        text: `The web thickness sits at the solver floor of ${num(T_FLOOR)} mm (t_min is zero); the webs are not needed by any structural constraint here.` };
      const per01 = lambda * 0.1 / lbT;
      return { amount: per01, unit: 'g per 0.1 mm of minimum thickness (webs)',
        text: `Lowering the minimum printable thickness by 0.1 mm would let the spar webs thin further and save about ${num(per01)} g.` };
    }
    case 'aCapMin':
      return { amount: lambda, unit: 'g per unit of the normalized bound',
        text: `The cap area sits at the optimizer's lower bound of ${A_CAP_MIN} mm^2: no structural constraint needs the caps here.` };
    default:
      return { amount: lambda, unit: 'g per unit utilization', text: '' };
  }
}

// Verify a sizing by a fresh solve, find the active set and estimate the multipliers and shadow prices.
export function analyzeOptimum(raw, design) {
  const v = validateInputs(raw);
  if (!v.ok) return v;
  const inp = v.inputs;
  const verified = verifyDesign(inp, Object.assign({ capTaper: 'constant' }, design));
  if (!verified.ok) return { ok: false, error: verified.error };
  const r = verified.result;
  const loads = computeLoads(inp);
  const { lbT } = designBounds(inp);
  const x = [design.tSkin, design.tWeb, design.aCap];
  const nRibs = design.nRibs, tRib = design.tRib ?? inp.tRib;
  const evalAt = xx => evaluateDesign(inp, loads, { tSkin: xx[0], tWeb: xx[1], aCap: xx[2], nRibs, tRib, capTaper: 'constant' }, true);
  const f = xx => evalAt(xx).mass.total;
  const cons = kktConstraints(inp, evalAt, lbT);
  const gVals = cons.map(cn => cn.g(x));
  const activeIdx = [];
  gVals.forEach((g, j) => { if (g >= -ACTIVE_TOL) activeIdx.push(j); });
  const est = estimateMultipliers(f, activeIdx.map(j => cons[j]), x);
  const rows = cons.map((cn, j) => {
    const k = activeIdx.indexOf(j);
    const lambda = k >= 0 ? est.lambda[k] : 0;
    const sp = shadowPrice(cn.key, lambda, inp, lbT);
    let U;
    if (cn.key === 'tSkinMin') U = lbT / x[0];
    else if (cn.key === 'tWebMin') U = lbT / x[1];
    else if (cn.key === 'aCapMin') U = A_CAP_MIN / x[2];
    else U = r.U[cn.key];
    return { key: cn.key, label: cn.label, g: gVals[j], U, active: k >= 0, lambda, shadow: sp,
      gradG: k >= 0 ? est.gradG[k] : null };
  });
  const baseline = solveWingBox(inp);
  return {
    ok: true, verified, result: r, x, nRibs, rows,
    active: rows.filter(a => a.active),
    kktResidual: est.relResidual, gradMass: est.gradF,
    baselineMass: baseline.mass.total, massSaved: baseline.mass.total - r.mass.total,
    massSavedPct: (baseline.mass.total - r.mass.total) / baseline.mass.total * 100,
    baselineFeasible: baseline.feasible,
  };
}

// Relaxations used to check a shadow price by an actual re-optimization. Each constraint limit is relaxed by
// the relative amount `fraction` (default 1 percent), small enough to test the derivative that the multiplier
// represents. deltaB is the resulting change of the normalized constraint g_j = U_j - 1 at U_j = 1.
export function relaxationFor(key, inp, fraction = 0.01) {
  const { lbT } = designBounds(inp);
  const Ld = inp.deflLimitPct / 100 * inp.s;
  const f = fraction;
  const dB = 1 - 1 / (1 + f);
  const pct = num(f * 100);
  switch (key) {
    case 'defl':
      return { key, inputs: { deflLimitPct: inp.deflLimitPct * (1 + f) }, deltaB: dB, keys: ['defl'],
        description: `tip deflection limit raised by ${pct} percent (${num(Ld)} to ${num(Ld * (1 + f))} mm)` };
    case 'twist':
      return { key, inputs: { twistLimitDeg: inp.twistLimitDeg * (1 + f) }, deltaB: dB, keys: ['twist'],
        description: `tip twist limit raised by ${pct} percent (${num(inp.twistLimitDeg)} to ${num(inp.twistLimitDeg * (1 + f))} degrees)` };
    case 'buckle':
      return { key, inputs: { kBuckle: inp.kBuckle * (1 + f) }, deltaB: dB, keys: ['buckle'],
        description: `critical buckling stress raised by ${pct} percent (k multiplied by ${num(1 + f)})` };
    case 'stress':
      return { key, inputs: { allowScale: (inp.allowScale || 1) * (1 + f) }, deltaB: dB, keys: ['stress'],
        description: `allowable stresses raised by ${pct} percent` };
    case 'tmin': {
      if (inp.tMin <= T_FLOOR) return null;
      return { key, inputs: { tMin: inp.tMin * (1 - f) }, deltaB: f / (1 - f), keys: ['tSkinMin', 'tWebMin'],
        description: `minimum printable thickness lowered by ${pct} percent (${num(lbT)} to ${num(lbT * (1 - f))} mm)` };
    }
    default:
      return null;
  }
}

// Re-optimize at the best rib count with one constraint relaxed and compare the actual saving with
// the first-order prediction lambda x deltaB. Returns null when the relaxation does not apply.
export function shadowPriceCheck(raw, best, analysis, relaxKey, fraction = 0.01) {
  const v = validateInputs(raw);
  if (!v.ok) return v;
  const inp = v.inputs;
  const rel = relaxationFor(relaxKey, inp, fraction);
  if (!rel) return null;
  const relaxedInp = Object.assign({}, inp, rel.inputs);
  const opt = optimizeForRibs(relaxedInp, best.nRibs, { x0: best.design, moveLimit: 0.05 });
  let predicted = 0;
  for (const row of analysis.rows) if (rel.keys.includes(row.key) && row.active) predicted += row.lambda * rel.deltaB;
  const verified = opt.feasible ? verifyDesign(relaxedInp, opt.design) : null;
  const actual = opt.feasible ? best.mass - opt.mass : NaN;
  return { key: relaxKey, description: rel.description, predicted, actual, relaxedMass: opt.feasible ? opt.mass : NaN,
    design: opt.feasible ? opt.design : null, verified, feasible: !!opt.feasible };
}

// ---------------------------------------------------------------------------------------------
// Rib pitch closed form and skin + rib mass versus rib count
// ---------------------------------------------------------------------------------------------

export function ribPitchStudy(raw, nMax = 20) {
  const v = validateInputs(raw);
  if (!v.ok) return v;
  const inp = v.inputs;
  const loads = computeLoads(inp);
  const base = evaluateDesign(inp, loads);
  const Es = MATERIALS[inp.skinMaterial].E;
  const sigmaReq = base.stress.sigmaSkinMax * inp.FS;     // upper skin compression at the critical station x FS
  const bMax = maxRibPitch(inp.kBuckle, Es, inp.nu, inp.tSkin, sigmaReq);
  const nMin = Number.isFinite(bMax) ? Math.max(1, Math.ceil(inp.s / bMax - 1e-9)) : 1;
  const { lbT } = designBounds(inp);
  const curve = [];
  const top = Math.max(nMax, inp.nRibs, nMin + 1);
  for (let n = 1; n <= top; n++) {
    const b = inp.s / n;
    // closed form at the current design's skin stress (it ignores the small change of EI with t_s)
    const tCF = Math.max(lbT, b * Math.sqrt(12 * (1 - inp.nu * inp.nu) * sigmaReq / (inp.kBuckle * Math.PI * Math.PI * Es)));
    const evalT = (t, lightMode) => evaluateDesign(inp, loads, { tSkin: t, nRibs: n }, lightMode);
    let tReq = NaN, buckleOK = false;
    const rLo = evalT(lbT, true);
    if (rLo.U.buckle <= 1) { tReq = lbT; buckleOK = true; }
    else {
      const rHi = evalT(T_MAX, true);
      if (rHi.U.buckle <= 1) {
        let lo = lbT, hi = T_MAX;
        for (let k = 0; k < 40; k++) {
          const mid = 0.5 * (lo + hi);
          if (evalT(mid, true).U.buckle <= 1) hi = mid; else lo = mid;
        }
        tReq = hi; buckleOK = true;
      }
    }
    const r = buckleOK ? evalT(tReq, false) : null;
    curve.push({
      n, b, tCF, tReq, buckleOK,
      skinMass: r ? r.mass.skins : NaN, ribMass: r ? r.mass.ribs : NaN,
      skinPlusRib: r ? r.mass.skins + r.mass.ribs : NaN, total: r ? r.mass.total : NaN,
      U: r ? r.U : null, feasible: r ? r.feasible : false,
    });
  }
  let best = null;
  for (const e of curve) if (e.buckleOK && (!best || e.skinPlusRib < best.skinPlusRib)) best = e;
  return { ok: true, base, sigmaReq, bMax, nMin, curve, best, current: { n: inp.nRibs, b: inp.s / inp.nRibs, Ubuckle: base.U.buckle } };
}

// ---------------------------------------------------------------------------------------------
// Spar cap taper: caps proportional to the bending moment (or to M/h) with a floor, versus constant caps
// ---------------------------------------------------------------------------------------------

export function capTaperStudy(raw, law = 'moment', floor = 0.2) {
  const v = validateInputs(Object.assign({}, raw, { capTaper: law, capFloor: floor }));
  if (!v.ok) return v;
  const inp = v.inputs;
  const loads = computeLoads(inp);
  const constant = evaluateDesign(inp, loads, { capTaper: 'constant' });
  const tapered = evaluateDesign(inp, loads, { capTaper: law, capFloor: floor });
  const capMassSaved = constant.mass.caps - tapered.mass.caps;
  const totalSaved = constant.mass.total - tapered.mass.total;
  return {
    ok: true, law, floor, constant, tapered,
    capMassSaved, capMassSavedPct: constant.mass.caps > 0 ? capMassSaved / constant.mass.caps * 100 : NaN,
    totalSaved, totalSavedPct: totalSaved / constant.mass.total * 100,
    deflectionPenalty: tapered.vTip - constant.vTip,
    deflectionPenaltyPct: constant.vTip !== 0 ? (tapered.vTip - constant.vTip) / constant.vTip * 100 : NaN,
    rootStressConstant: constant.span.sigmaCap[0], rootStressTapered: tapered.span.sigmaCap[0],
  };
}
