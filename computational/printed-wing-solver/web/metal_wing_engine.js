/*
 * MIE 446 Wing Lab — full-scale metal stressed-skin wing engine.
 *
 * Extends Wing Lab from the printed PLA semi-wing to a real aircraft wing. The default preset is the
 * Dewoitine D.520 S fighter (1940), built from its scanned French manual: single-spar duralumin
 * wing with a false spar, 22 ribs, smooth stressed skin and blade stringers.
 *
 * What is solved (all in SI units: m, N, Pa, kg):
 *   1. Planform, thickness law, dihedral and NACA sections of the real wing (port of d520_geom.py).
 *   2. Span loading: Glauert lifting line on the real planform (or Schrenk / elliptic), load factor n,
 *      inertia relief from the computed structural mass and the fuel, guns and ammunition.
 *   3. Shear, bending moment and torque about the shear centre along the span, with the fuselage
 *      fittings as the support and the centre section carried through by symmetry.
 *   4. Thin-walled section analysis at every station: direct-stress booms (spar caps, stringers,
 *      lumped skin and webs), unsymmetric bending, open-section shear flows closed by the two-cell
 *      (nose + box) twist compatibility, shear centre, torsion constant GJ, shear flexibility.
 *   5. Deflection (bending + shear) and twist by integration; a Hermite beam FE gives the same static
 *      answer and the natural frequencies.
 *   6. Stability and strength per rib bay: skin compression buckling (flat + curved panel),
 *      combined compression-shear skin buckling, spar-web shear buckling, blade-stringer crippling,
 *      first boom yield and the post-buckling (effective width) collapse moment of each section.
 *
 * Checked against the Python pipeline and a 41 066-element CalculiX shell model of the same wing by
 * test_metal_wing.mjs (reference numbers in metal_wing_reference.json).
 */
const MetalWingEngine = (() => {
  "use strict";
  const VERSION = "1.0.1";
  const G0 = 9.80665;

  // ------------------------------------------------------------------ small numerics
  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function interp(x, xs, ys) {
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  }
  function trapz(ys, xs) { let s = 0; for (let i = 1; i < xs.length; i++) s += 0.5 * (ys[i] + ys[i - 1]) * (xs[i] - xs[i - 1]); return s; }
  const searchsorted = (arr, v) => { let i = 0; while (i < arr.length && arr[i] < v) i++; return i; };
  // dense Gaussian elimination with partial pivoting (A is an array of rows; destroyed)
  function solveDense(A, b) {
    const n = b.length;
    for (let k = 0; k < n; k++) {
      let p = k, best = Math.abs(A[k][k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i][k]); if (v > best) { best = v; p = i; } }
      if (best < 1e-300) throw new Error("Singular system in the section shear-flow solve");
      if (p !== k) { [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]]; }
      const rk = A[k], piv = rk[k];
      for (let i = k + 1; i < n; i++) {
        const ri = A[i], f = ri[k] / piv;
        if (f === 0) continue;
        for (let j = k; j < n; j++) ri[j] -= f * rk[j];
        b[i] -= f * b[k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; const r = A[i]; for (let j = i + 1; j < n; j++) s -= r[j] * x[j]; x[i] = s / r[i]; }
    return x;
  }
  function cholesky(M, n) {
    const L = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = M[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) { if (s <= 0) throw new Error("Matrix not positive definite (beam FE)"); L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
    }
    return L;
  }
  const cholFwd = (L, n, b) => { const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; } return y; };
  const cholBack = (L, n, y) => { const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; } return x; };
  function jacobiEigen(S, n) {
    const A = Float64Array.from(S), V = new Float64Array(n * n);
    for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let sweep = 0; sweep < 80; sweep++) {
      let off = 0, diag = 0;
      for (let p = 0; p < n; p++) { diag += A[p * n + p] ** 2; for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2; }
      if (off < 1e-26 * diag) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const th = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const a = A[k * n + p], b = A[k * n + q]; A[k * n + p] = c * a - s * b; A[k * n + q] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = A[p * n + k], b = A[q * n + k]; A[p * n + k] = c * a - s * b; A[q * n + k] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = V[k * n + p], b = V[k * n + q]; V[k * n + p] = c * a - s * b; V[k * n + q] = s * a + c * b; }
      }
    }
    const vals = Array.from({ length: n }, (_, i) => A[i * n + i]);
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    return { values: order.map((i) => vals[i]), vectors: order.map((i) => Array.from({ length: n }, (_, k) => V[k * n + i])) };
  }
  function generalizedEigen(K, M, n, count) {
    const L = cholesky(M, n), Y = new Float64Array(n * n), C = new Float64Array(n * n);
    for (let j = 0; j < n; j++) { const col = cholFwd(L, n, Array.from({ length: n }, (_, i) => K[i * n + j])); for (let i = 0; i < n; i++) Y[i * n + j] = col[i]; }
    for (let i = 0; i < n; i++) { const row = cholFwd(L, n, Array.from({ length: n }, (_, j) => Y[i * n + j])); for (let j = 0; j < n; j++) C[i * n + j] = row[j]; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = 0.5 * (C[i * n + j] + C[j * n + i]); C[i * n + j] = m; C[j * n + i] = m; }
    const { values, vectors } = jacobiEigen(C, n);
    return { values: values.slice(0, count), modes: vectors.slice(0, count).map((z) => cholBack(L, n, z)) };
  }
  const deepCopy = (o) => JSON.parse(JSON.stringify(o));

  // ------------------------------------------------------------------ the D.520 preset
  // Status of every number: PRINTED (manual), SCALED (measured on a manual plate), EXTERNAL (outside
  // reference), GUESS (engineering assumption, varied in the sensitivity study). See SOURCES below.
  const D520 = {
    id: "d520",
    name: "Dewoitine D.520 S (1940 manual)",
    short: "D.520",
    planform: {
      b2: 5.10, c0: 2.36, ct: 0.92, yt: 4.6869, aLE: 0.5226, S_LE_junction: 2.02, incidenceDeg: 1.0,
      dihedralDeg: 3.925, zLowerRoot: -0.84, kinkY: 1.50, slopeStart: 0.51, rootSlope: -0.0046, camberStart: 0.70,
      thickness: [[0.0, 0.409], [0.51, 0.409], [0.70, 0.409], [0.86, 0.374], [1.01, 0.354], [1.17, 0.333], [1.33, 0.313],
        [1.50, 0.288], [1.66, 0.275], [1.88, 0.255], [2.07, 0.247], [2.31, 0.237], [2.54, 0.222], [2.78, 0.210],
        [3.01, 0.194], [3.25, 0.179], [3.49, 0.167], [3.72, 0.152], [3.96, 0.136], [4.20, 0.122], [4.44, 0.108], [4.68, 0.093]],
    },
    ribs: [0.51, 0.70, 0.86, 1.01, 1.17, 1.33, 1.50, 1.66, 1.88, 2.07, 2.31, 2.54, 2.78, 3.01, 3.25, 3.49, 3.72, 3.96, 4.20, 4.44, 4.68, 4.93],
    kinkRibs: [0.70, 1.50],
    zones: [[0.00, 0.70], [0.70, 1.50], [1.50, 2.31], [2.31, 3.25], [3.25, 4.20], [4.20, 4.93]],
    sparX: 0.37, falseSparX: 0.73,
    skin: [1.6e-3, 1.6e-3, 1.2e-3, 1.0e-3, 0.8e-3, 0.8e-3],
    web: [3.0e-3, 2.5e-3, 2.0e-3, 1.6e-3, 1.2e-3, 1.0e-3],
    falseSpar: [1.2e-3, 1.2e-3, 1.0e-3, 1.0e-3, 0.8e-3, 0.8e-3],
    stringer: { x: [0.46, 0.53, 0.60, 0.67], h: 0.020, t: [1.2e-3, 1.2e-3, 1.2e-3, 1.0e-3, 1.0e-3, 1.0e-3] },
    boom: { rootWidth: 0.110, rootThickness: 0.030 },
    rib: { t: 1.0e-3, tKink: 2.0e-3 },
    wheelWell: { yc: 0.30, xc: 0.17, r: 0.37 },
    fittingY: 0.46,
    material: { name: "2017-T4 duralumin (AU4G)", E: 72e9, nu: 0.33, rho: 2790, Fty: 220e6, Fcy: 220e6, Ftu: 380e6, Fsu: 262e6, epsU: 0.10 },
    aircraft: { mass: 2677, CL: 1.4, a0: 0.9 * 2 * Math.PI, alpha0TipDeg: -1.2, nLimitPos: 6, nLimitNeg: -3, safetyFactor: 1.5, xcp: 0.25 },
    masses: {
      fuel: { label: "Fuel, 122 l wing tank", volume: 122, density: 0.72, y0: 2.07, y1: 3.49, xc: 0.17, points: 24 },
      guns: { label: "MAC 1934 machine guns", y: [1.79, 1.955], mass: 10.7, xc: 0.30 },
      ammo: { label: "Ammunition, 650 rounds per gun", y: [1.79, 1.955], rounds: 650, roundMass: 0.025, xc: 0.55 },
    },
    sources: [
      ["Span 10.20 m, root chord 2.36 m, tip chord 0.92 m, area", "PRINTED / SCALED, manual p.13 and Pl.0"],
      ["Rib stations (22 ribs), thickness at each rib, dihedral break at rib 16", "SCALED, Pl.1 front elevation"],
      ["Main spar 0.37c, false spar 0.73c", "SCALED, Pl.1 and Pl.6"],
      ["Spar booms 110 × 30 mm at the root, area ∝ M/h outboard", "SCALED (low confidence) + GUESS taper law; manual p.13 says the booms taper in width and thickness"],
      ["Skin, web, false-spar and stringer gauges", "GUESS: typical 1938–40 fighter gauges; varied ±25 % in the sensitivity study"],
      ["2017-T4 (AU4G) duralumin properties", "EXTERNAL: manual p.13 says all wing parts are duralumin"],
      ["Gross mass 2 677 kg", "EXTERNAL (the manual leaves the mass blank)"],
      ["Load factors +6 / −3 g, ultimate ×1.5", "GUESS: CS-23 aerobatic category; the manual gives none"],
      ["Fuel 122 l per wing, guns, 650 rounds per gun", "PRINTED, manual p.11 bis, p.38, p.41"],
    ],
  };

  // ------------------------------------------------------------------ planform and sections
  function nacaThickness(x, t) { x = clamp(x, 0, 1); return 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4); }
  function naca230Camber(x) { const m = 0.2025, k1 = 15.957; return x < m ? (k1 / 6) * (x ** 3 - 3 * m * x * x + m * m * (3 - m) * x) : (k1 / 6) * m ** 3 * (1 - x); }

  function makeWing(P) {
    const p = P.planform;
    const k = (p.c0 - p.ct) / p.yt;
    const S_LE0 = p.S_LE_junction - p.aLE * k * 0.66;
    const inc = (p.incidenceDeg * Math.PI) / 180, dih = Math.tan((p.dihedralDeg * Math.PI) / 180);
    const ty = p.thickness.map((r) => r[0]), tv = p.thickness.map((r) => r[1]);
    const zuRoot = p.zLowerRoot + tv[0];
    const W = {
      b2: p.b2, yt: p.yt, c0: p.c0, ct: p.ct,
      chord(y) { y = Math.abs(y); if (y <= p.yt) return p.c0 - k * y; const e = Math.min(1, (y - p.yt) / (p.b2 - p.yt)); return Math.max(0.03, p.ct * Math.sqrt(Math.max(0, 1 - e ** 2.2))); },
      S_LE(y) {
        y = Math.abs(y);
        if (y <= p.yt) return S_LE0 + p.aLE * k * y;
        const e = Math.min(1, (y - p.yt) / (p.b2 - p.yt));
        const mid = S_LE0 + p.aLE * k * p.yt + p.ct / 2 - 0.075 * e * e;
        return mid - W.chord(y) / 2;
      },
      thickness(y) {
        y = Math.abs(y);
        if (y <= p.yt) return interp(y, ty, tv);
        const e = Math.min(1, (y - p.yt) / (p.b2 - p.yt));
        return (interp(p.yt, ty, tv) / p.ct) * W.chord(y) * (1 - 0.35 * e);
      },
      zUpper(y) { y = Math.abs(y); if (y <= p.kinkY) return zuRoot + p.rootSlope * Math.max(0, y - p.slopeStart); return zuRoot + p.rootSlope * (p.kinkY - p.slopeStart) + dih * (y - p.kinkY); },
      camberBlend(y) { return clamp((Math.abs(y) - p.camberStart) / (p.yt - p.camberStart), 0, 1); },
      /** Upper and lower surface points [S, Z] (m) at chord fractions xs for span station y. */
      section(y, xs) {
        const c = W.chord(y), t = W.thickness(y), tc = t / c, cb = W.camberBlend(y), sle = W.S_LE(y);
        const surf = (x) => { const yt_ = nacaThickness(x, tc), yc = cb * naca230Camber(x); return [yc + yt_, yc - yt_]; };
        const [u30, l30] = surf(0.3);
        const zc30 = W.zUpper(y) - t / 2 - ((u30 + l30) / 2) * c;
        const ca = Math.cos(inc), sa = Math.sin(inc);
        const place = (x, zz) => { const dx = (x - 0.3) * c, dz = zz * c; return [sle + 0.3 * c + dx * ca, zc30 + dz - dx * sa]; };
        const up = [], lo = [];
        for (const x of xs) { const [u, l] = surf(x); up.push(place(x, u)); lo.push(place(x, l)); }
        return { up, lo, c };
      },
      area() { const ys = linspace(0, p.b2, 4001); return 2 * trapz(ys.map((v) => W.chord(v)), ys); },
    };
    return W;
  }

  function zoneOf(P, y) { y = Math.abs(y); for (let k = 0; k < P.zones.length; k++) if (y < P.zones[k][1] - 1e-9) return k; return P.zones.length - 1; }

  // ------------------------------------------------------------------ aerodynamic span loading
  function liftingLine(P, W, N = 60) {
    const B = 2 * W.b2, S = W.area(), a0 = P.aircraft.a0, al0 = (P.aircraft.alpha0TipDeg * Math.PI) / 180;
    const ns = Array.from({ length: N }, (_, j) => 2 * j + 1);
    const th = Array.from({ length: N }, (_, i) => ((i + 0.5) * (Math.PI / 2)) / N);
    const y = th.map((t) => (B / 2) * Math.cos(t));
    const mu = y.map((v) => (a0 * W.chord(v)) / (4 * B));
    const build = () => th.map((t, i) => ns.map((nn) => Math.sin(nn * t) * (mu[i] * nn + Math.sin(t))));
    const run = (alpha) => {
      const A = solveDense(build(), th.map((t, i) => mu[i] * alpha[i] * Math.sin(t)));
      const ccl = th.map((t) => 4 * B * ns.reduce((s, nn, j) => s + Math.sin(nn * t) * A[j], 0));
      return { ccl, CL: Math.PI * ((B * B) / S) * A[0] };
    };
    const a = run(th.map(() => 1));
    const b = run(y.map((v) => -al0 * W.camberBlend(v)));
    const order = y.map((v, i) => i).sort((i, j) => y[i] - y[j]);
    return { y: order.map((i) => y[i]), ca: order.map((i) => a.ccl[i]), cb: order.map((i) => b.ccl[i]), CLa: a.CL, CLb: b.CL, area: S };
  }

  /** Lift per unit span on one half wing for a total lift of 1 N (both halves), on grid ys. */
  function spanShape(P, W, kind, ys, CL) {
    const B = 2 * W.b2;
    if (kind === "liftingLine") {
      const ll = liftingLine(P, W);
      const alpha = (CL - ll.CLb) / ll.CLa;
      const ccl = ll.ca.map((v, i) => alpha * v + ll.cb[i]);
      const yy = [0, ...ll.y, W.b2], cc = [ccl[0], ...ccl, 0];
      const half = trapz(cc, yy);
      return { l: ys.map((v) => interp(v, yy, cc) / (2 * half)), alphaDeg: (alpha * 180) / Math.PI, CLa: ll.CLa, CLb: ll.CLb };
    }
    const S = W.area();
    const ell = ys.map((v) => ((4 * S) / (Math.PI * B)) * Math.sqrt(Math.max(0, 1 - ((2 * v) / B) ** 2)));
    const s = kind === "schrenk" ? ys.map((v, i) => 0.5 * (W.chord(v) + ell[i])) : ell;
    const tot = trapz(s, ys);
    return { l: s.map((v) => v / (2 * tot)), alphaDeg: null };
  }

  function pointMasses(P, include = {}) {
    const m = P.masses, out = [];
    if (include.fuel !== false && m.fuel) {
      const mf = m.fuel.volume * m.fuel.density, k = m.fuel.points || 24;
      for (const y of linspace(m.fuel.y0, m.fuel.y1, k)) out.push({ name: "fuel", mass: mf / k, y, xc: m.fuel.xc });
    }
    if (include.guns !== false && m.guns) for (const y of m.guns.y) out.push({ name: "gun", mass: m.guns.mass, y, xc: m.guns.xc });
    if (include.ammo !== false && m.ammo) for (const y of m.ammo.y) out.push({ name: "ammo", mass: m.ammo.rounds * m.ammo.roundMass, y, xc: m.ammo.xc });
    return out;
  }

  // ------------------------------------------------------------------ spar-boom area law
  /** Boom (spar cap) area per gauge zone: A ∝ M_lift/h anchored to the root boom, as in loads.py. */
  function boomZones(P, W) {
    const ys = linspace(0, W.b2, 4001);
    const shape = spanShape(P, W, "liftingLine", ys, P.aircraft.CL);
    const Wt = P.aircraft.mass * G0;
    const l = shape.l.map((v) => v * Wt);
    const Vv = new Array(ys.length).fill(0), M = new Array(ys.length).fill(0);
    for (let i = ys.length - 2; i >= 0; i--) { const dy = ys[i + 1] - ys[i]; Vv[i] = Vv[i + 1] + 0.5 * (l[i] + l[i + 1]) * dy; M[i] = M[i + 1] + 0.5 * (Vv[i] + Vv[i + 1]) * dy; }
    const depth = (y) => { const s = W.section(y, [P.sparX]); return s.up[0][1] - s.lo[0][1]; };
    const A0 = P.boom.rootWidth * P.boom.rootThickness;
    const iref = searchsorted(ys, P.fittingY);
    const Mh = (i) => M[i] / depth(ys[i]);
    const Mh0 = Mh(iref);
    return P.zones.map(([a, b], k) => {
      const i = searchsorted(ys, Math.max(a, P.fittingY));
      const A = Math.min(A0 * (Mh(i) / Mh0), A0);
      const bw = (P.boom.rootWidth * W.chord(a)) / W.chord(0);
      return { zone: k, y0: a, y1: b, area: A, width: bw, thickness: A / bw };
    });
  }

  // ------------------------------------------------------------------ cross-section model
  function chordFractions(P, r = 3) {
    const xs = P.sparX, xf = P.falseSparX, nLe = 8 * r;
    const le = linspace(0, 1, nLe + 1).map((t) => xs * (1 - Math.cos(0.5 * Math.PI * t)));
    const st = [xs, ...P.stringer.x, xf];
    const box = [];
    for (let i = 0; i < st.length - 1; i++) box.push(...linspace(st[i], st[i + 1], 2 * r + 1).slice(1));
    const x = [...le, ...box];
    const iStr = P.stringer.x.map((s) => x.reduce((best, v, i) => (Math.abs(v - s) < Math.abs(x[best] - s) ? i : best), 0));
    return { x, iSp: nLe, iStr };
  }

  function gauges(P, Z, y, scales) {
    const k = zoneOf(P, y), z = Z[k], s = scales;
    return {
      zone: k, skin: P.skin[k] * s.skin, web: P.web[k] * s.web, falseSpar: P.falseSpar[k] * s.web,
      stringerT: P.stringer.t[k] * s.stringer, boomT: z.thickness * s.boom,
    };
  }

  function inWell(P, W, S, y) {
    const w = P.wheelWell; if (!w) return false;
    const Sc = W.S_LE(w.yc) + w.xc * W.chord(w.yc);
    return (y - w.yc) ** 2 + (S - Sc) ** 2 < w.r * w.r;
  }

  /** General multi-cell thin-walled shear-flow solver with direct-stress booms.
   *  nodes: [{x, z, B, Qx, Qz}]  (B area, Qx/Qz first moments of that node's booms about the centroid)
   *  walls: [{a, b, t, L}]  straight walls a -> b; q > 0 flows from a to b
   *  cells: [[{w, s}]]  s = +1 if the wall direction runs counter-clockwise round the cell (x aft, z up)
   *  Returns unit cases: q for a unit vertical shear through the shear centre (no twist) and for a unit
   *  counter-clockwise torque, plus the shear centre, J (per G) and the shear flexibility. */
  function shearFlowSolve(sec, G) {
    const { nodes, walls, cells, Ixx, Izz, Ixz } = sec;
    const den = Ixx * Izz - Ixz * Ixz;
    const nW = walls.length, nU = nW + 1;
    const active = new Map();
    walls.forEach((w) => { active.set(w.a, true); active.set(w.b, true); });
    const nodeIds = [...active.keys()];
    const O = sec.ref || [0, 0];
    const twoA = walls.map((w) => { const A = nodes[w.a], B = nodes[w.b]; return (A.x - O[0]) * (B.z - A.z) - (A.z - O[1]) * (B.x - A.x); });
    const rowsBase = () => {
      const rows = [];
      for (let k = 0; k < nodeIds.length - 1; k++) {
        const i = nodeIds[k], r = new Array(nU).fill(0);
        walls.forEach((w, j) => { if (w.a === i) r[j] += 1; if (w.b === i) r[j] -= 1; });
        rows.push(r);
      }
      for (const cell of cells) {
        const r = new Array(nU).fill(0);
        for (const { w, s } of cell) r[w] += (s * walls[w].L) / walls[w].t;
        r[nW] = -2 * cell.area;
        rows.push(r);
      }
      return rows;
    };
    const jump = (i, V) => -(V / den) * (Izz * nodes[i].Qz - Ixz * nodes[i].Qx);
    // unit shear through the shear centre: zero twist
    let A = rowsBase(), b = nodeIds.slice(0, -1).map((i) => jump(i, 1)).concat(cells.map(() => 0));
    A.push(Array.from({ length: nU }, (_, j) => (j === nW ? 1 : 0))); b.push(0);
    const sV = solveDense(A, b);
    const qV = sV.slice(0, nW);
    const MO = qV.reduce((s, q, j) => s + q * twoA[j], 0);
    // unit counter-clockwise torque
    A = rowsBase(); b = nodeIds.slice(0, -1).map(() => 0).concat(cells.map(() => 0));
    A.push(twoA.concat([0])); b.push(1);
    const sT = solveDense(A, b);
    const qT = sT.slice(0, nW), phiT = sT[nW];             // phi = G * dtheta/dy for T = 1
    const fx = qV.reduce((s, q, j) => s + q * (nodes[walls[j].b].x - nodes[walls[j].a].x), 0);
    const fz = qV.reduce((s, q, j) => s + q * (nodes[walls[j].b].z - nodes[walls[j].a].z), 0);
    const fs = qV.reduce((s, q, j) => s + (q * q * walls[j].L) / (G * walls[j].t), 0);
    return { qV, qT, xsc: O[0] + MO, J: cells.length ? 1 / phiT : 0, GJ: cells.length ? G / phiT : 0, fs, resultant: [fx, fz] };
  }

  /** The cross-section of the wing at span station y: geometry, direct-stress items, booms, walls and cells. */
  function buildSection(P, W, Z, y, scales, opts = {}) {
    const { x, iSp, iStr } = chordFractions(P, 3);
    const g = gauges(P, Z, y, scales);
    const { up, lo, c } = W.section(y, x);
    const m = x.length - 1;
    const bw = (P.boom.rootWidth / W.chord(0)) * c, tf = g.boomT, dF = g.skin + 0.5 * tf;
    const hS = P.stringer.h;
    const well = opts.wheelWell !== false;
    // walls: upper i -> i+1 (i = 0 .. m-1), lower i -> i+1, spar web (lower -> upper), false spar (lower -> upper)
    // node ids: 0 = leading edge, 1..m = upper points 1..m, m+1..2m = lower points 1..m
    const U = (i) => (i === 0 ? 0 : i), Lw = (i) => (i === 0 ? 0 : m + i);
    const nodes = [{ x: up[0][0], z: up[0][1] }];
    for (let i = 1; i <= m; i++) nodes.push({ x: up[i][0], z: up[i][1] });
    for (let i = 1; i <= m; i++) nodes.push({ x: lo[i][0], z: lo[i][1] });
    const walls = [], kinds = [];
    const len = (p, q) => Math.hypot(q.x - p.x, q.z - p.z);
    for (let i = 0; i < m; i++) { const a = U(i), b = U(i + 1); walls.push({ a, b, t: g.skin, L: len(nodes[a], nodes[b]), surf: "u", i }); }
    for (let i = 0; i < m; i++) {
      const a = Lw(i), b = Lw(i + 1);
      const Smid = 0.5 * (nodes[a].x + nodes[b].x);
      if (well && i < iSp && inWell(P, W, Smid, y)) continue;
      walls.push({ a, b, t: g.skin, L: len(nodes[a], nodes[b]), surf: "l", i });
    }
    const iSpar = walls.length; walls.push({ a: Lw(iSp), b: U(iSp), t: g.web, L: len(nodes[Lw(iSp)], nodes[U(iSp)]), surf: "web" });
    const iFS = walls.length; walls.push({ a: Lw(m), b: U(m), t: g.falseSpar, L: len(nodes[Lw(m)], nodes[U(m)]), surf: "fs" });
    const noseOpen = walls.filter((w) => w.surf === "l" && w.i < iSp).length < iSp;

    // direct-stress items (area, x, z, kind) for the bending properties
    const items = [];
    for (const w of walls) if (w.surf === "u" || w.surf === "l") items.push({ A: w.L * w.t, x: 0.5 * (nodes[w.a].x + nodes[w.b].x), z: 0.5 * (nodes[w.a].z + nodes[w.b].z), kind: "skin" });
    for (const i of iStr) {
      items.push({ A: hS * g.stringerT, x: up[i][0], z: up[i][1] - hS / 2, kind: "stringer", node: U(i) });
      items.push({ A: hS * g.stringerT, x: lo[i][0], z: lo[i][1] + hS / 2, kind: "stringer", node: Lw(i) });
    }
    const webStrips = (i, t, n) => {
      const zl = lo[i][1], zu = up[i][1], h = zu - zl, xw = 0.5 * (up[i][0] + lo[i][0]);
      for (let k = 0; k < n; k++) items.push({ A: (h / n) * t, x: xw, z: zl + (k + 0.5) * (h / n), kind: "web" });
    };
    webStrips(iSp, g.web, 20); webStrips(m, g.falseSpar, 10);
    items.push({ A: bw * tf, x: up[iSp][0], z: up[iSp][1] - dF, kind: "boom", node: U(iSp) });
    items.push({ A: bw * tf, x: lo[iSp][0], z: lo[iSp][1] + dF, kind: "boom", node: Lw(iSp) });
    let A = 0, Sx = 0, Sz = 0;
    for (const it of items) { A += it.A; Sx += it.A * it.x; Sz += it.A * it.z; }
    const xc = Sx / A, zc = Sz / A;
    let Ixx = 0, Izz = 0, Ixz = 0;
    for (const it of items) { Ixx += it.A * (it.z - zc) ** 2; Izz += it.A * (it.x - xc) ** 2; Ixz += it.A * (it.x - xc) * (it.z - zc); }

    // idealised booms for the shear-flow solve: every direct-stress area is lumped at a wall junction
    // (skin halves to each end, webs by the linear-stress rule B = t h (2 + z_j/z_i) / 6, caps and stringers
    // at their skin node), so the shear flows are exactly in equilibrium with the applied shear
    for (const nd of nodes) nd.B = 0;
    for (const w of walls) {
      if (w.surf === "u" || w.surf === "l") { nodes[w.a].B += (w.t * w.L) / 2; nodes[w.b].B += (w.t * w.L) / 2; }
      else {
        const za = nodes[w.a].z - zc, zb = nodes[w.b].z - zc, th = w.t * w.L;
        nodes[w.a].B += Math.abs(za) > 1e-6 ? (th / 6) * (2 + zb / za) : th / 2;
        nodes[w.b].B += Math.abs(zb) > 1e-6 ? (th / 6) * (2 + za / zb) : th / 2;
      }
    }
    for (const it of items) if (it.node != null) nodes[it.node].B += it.A;
    let Bs = 0, Bx = 0, Bz = 0;
    for (const nd of nodes) { Bs += nd.B; Bx += nd.B * nd.x; Bz += nd.B * nd.z; }
    const bxc = Bx / Bs, bzc = Bz / Bs;
    let bIxx = 0, bIzz = 0, bIxz = 0;
    for (const nd of nodes) {
      nd.Qx = nd.B * (nd.x - bxc); nd.Qz = nd.B * (nd.z - bzc);
      bIxx += nd.B * (nd.z - bzc) ** 2; bIzz += nd.B * (nd.x - bxc) ** 2; bIxz += nd.B * (nd.x - bxc) * (nd.z - bzc);
    }
    // spanwise slope of every boom line (tapered wing: inclined booms carry part of the shear and torque)
    {
      const d = 0.005, ya = Math.max(0, y - d), yb = Math.min(W.b2, y + d);
      const sa = W.section(ya, x), sb = W.section(yb, x);
      const slope = (pa, pb) => (pb[1] - pa[1]) / (yb - ya);
      nodes[0].dz = slope(sa.up[0], sb.up[0]);
      for (let i = 1; i <= m; i++) { nodes[U(i)].dz = slope(sa.up[i], sb.up[i]); nodes[Lw(i)].dz = slope(sa.lo[i], sb.lo[i]); }
    }
    // cells: counter-clockwise traversal with x aft and z up
    const polyArea = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; s += x1 * z2 - x2 * z1; } return 0.5 * s; };
    const cells = [];
    const nosePoly = [...up.slice(0, iSp + 1).reverse(), ...lo.slice(1, iSp + 1)];
    const boxPoly = [...up.slice(iSp, m + 1).reverse(), ...lo.slice(iSp, m + 1)];
    const areaNose = Math.abs(polyArea(nosePoly)), areaBox = Math.abs(polyArea(boxPoly));
    if (!noseOpen) {
      const cell = [];
      walls.forEach((w, j) => { if (w.surf === "u" && w.i < iSp) cell.push({ w: j, s: -1 }); if (w.surf === "l" && w.i < iSp) cell.push({ w: j, s: +1 }); });
      cell.push({ w: iSpar, s: +1 }); cell.area = areaNose; cells.push(cell);
    }
    {
      const cell = [];
      walls.forEach((w, j) => { if (w.surf === "u" && w.i >= iSp) cell.push({ w: j, s: -1 }); if (w.surf === "l" && w.i >= iSp) cell.push({ w: j, s: +1 }); });
      cell.push({ w: iSpar, s: -1 }); cell.push({ w: iFS, s: +1 }); cell.area = areaBox; cells.push(cell);
    }
    const ref = [up[iSp][0], 0.5 * (up[iSp][1] + lo[iSp][1])];
    const massLine = P.material.rho * A;
    return {
      y, c, x, iSp, iStr, m, up, lo, zone: g.zone, g, bw, tf, dF, hS, items, nodes, walls, cells, iSpar, iFS, noseOpen,
      area: A, xc, zc, Ixx, Izz, Ixz, boomIdeal: { Ixx: bIxx, Izz: bIzz, Ixz: bIxz, xc: bxc, zc: bzc },
      areaNose, areaBox, massLine, S_LE: W.S_LE(y), ref,
    };
  }

  function analyseSection(sec, mat) {
    const G = mat.E / (2 * (1 + mat.nu));
    const s = shearFlowSolve({ nodes: sec.nodes, walls: sec.walls, cells: sec.cells, Ixx: sec.boomIdeal.Ixx, Izz: sec.boomIdeal.Izz, Ixz: sec.boomIdeal.Ixz, ref: sec.ref }, G);
    const den = sec.Ixx * sec.Izz - sec.Ixz * sec.Ixz;
    const EI = (mat.E * den) / sec.Izz;
    let Ip = 0;
    for (const it of sec.items) Ip += it.A * ((it.x - s.xsc) ** 2 + (it.z - sec.zc) ** 2);
    // tapered beam (Megson, "Shear of tapered beams"): boom loads P_i = B_i s_i M have in-plane components
    // P_i dz_i/dy, so the walls carry V_w = V - M taperV and T_w = T_ccw - M taperT only
    const bi = sec.boomIdeal, bden = bi.Ixx * bi.Izz - bi.Ixz * bi.Ixz;
    let taperV = 0, taperT = 0;
    for (const nd of sec.nodes) {
      if (!nd.B) continue;
      const si = -(bi.Izz * (nd.z - bi.zc) - bi.Ixz * (nd.x - bi.xc)) / bden;
      taperV += nd.B * si * nd.dz; taperT += nd.B * si * nd.dz * (nd.x - s.xsc);
    }
    return { ...s, G, EI, den, taperV, taperT, IpLine: mat.rho * Ip, xscFrac: (s.xsc - sec.S_LE) / sec.c, xmFrac: (sec.xc - sec.S_LE) / sec.c };
  }

  /** Bending stress at a point (S, Z) of a section for moment M (positive compresses the upper surface). */
  function sigmaAt(sec, M, x, z) {
    const den = sec.Ixx * sec.Izz - sec.Ixz * sec.Ixz;
    return (-M * (sec.Izz * (z - sec.zc) - sec.Ixz * (x - sec.xc))) / den;
  }

  // ------------------------------------------------------------------ post-buckling section strength
  // Port of collapse.py: booms, stringers, skin panels (effective width after buckling) and web strips.
  function collapseParts(P, W, Z, y, scales, mat) {
    const g = gauges(P, Z, y, scales);
    const E = mat.E, D = (Math.PI ** 2 * E) / (12 * (1 - mat.nu ** 2));
    const xs = P.sparX, xf = P.falseSparX, c = W.chord(y), bw = (P.boom.rootWidth / W.chord(0)) * c;
    const tf = g.boomT, tsk = g.skin, dF = tsk + 0.5 * tf;
    const parts = [];
    const one = (xc) => W.section(y, [xc]);
    let s = one(xs);
    parts.push({ kind: 0, A: bw * tf, z: s.up[0][1] - dF, name: "boom" });
    parts.push({ kind: 0, A: bw * tf, z: s.lo[0][1] + dF, name: "boom" });
    const ts = g.stringerT, h = P.stringer.h;
    const sigLoc = 0.43 * D * (ts / h) ** 2, scc = Math.min(mat.Fcy, 1.3 * sigLoc);
    for (const xc of P.stringer.x) {
      s = one(xc);
      parts.push({ kind: 1, A: h * ts, z: s.up[0][1] - h / 2, scc, name: "stringer" });
      parts.push({ kind: 1, A: h * ts, z: s.lo[0][1] + h / 2, scc, name: "stringer" });
    }
    const bFrac = bw / c / 2;
    const edges = [0, 0.10, xs - bFrac, xs + bFrac, ...P.stringer.x, xf];
    const kinds = ["nose", "panel", "under_boom", ...P.stringer.x.map(() => "panel"), "panel"];
    const ry = [0, ...P.ribs];
    const kk = searchsorted(ry, y), pitch = ry[Math.min(kk, ry.length - 1)] - ry[Math.max(kk - 1, 0)];
    for (let e = 0; e < edges.length - 1; e++) {
      const a = edges[e], b = edges[e + 1], k = kinds[e];
      const sx = W.section(y, linspace(a, b, 12));
      for (const [Pp, side] of [[sx.up, "u"], [sx.lo, "l"]]) {
        let L = 0; for (let i = 1; i < Pp.length; i++) L += Math.hypot(Pp[i][0] - Pp[i - 1][0], Pp[i][1] - Pp[i - 1][1]);
        if (side === "l" && k !== "under_boom" && b <= xs && y < 0.67 && P.wheelWell && Math.abs(y - P.wheelWell.yc) < P.wheelWell.r) continue;
        const flat = pitch >= L ? 4 * D * (tsk / L) ** 2 : D * (tsk / pitch) ** 2 * (1 + (pitch / L) ** 2) ** 2;
        const p0 = Pp[0], p1 = Pp[Pp.length >> 1], p2 = Pp[Pp.length - 1];
        const area2 = Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
        const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
        // Circumradius abc/(4A); area2 is twice the triangle area.
        const R = area2 > 1e-12 ? (d(p1, p0) * d(p2, p1) * d(p2, p0)) / (2 * area2) : 1e9;
        const zm = Pp.reduce((q, p) => q + p[1], 0) / Pp.length;
        parts.push({ kind: k === "panel" ? 4 : 3, A: L * tsk, z: zm, b: L, t: tsk, scr: flat + (0.3 * E * tsk) / R, R, pitch, side, x0: a, x1: b, name: "skin_" + k });
      }
    }
    for (const [xc, t] of [[xs, g.web], [xf, g.falseSpar]]) {
      s = one(xc); const zu = s.up[0][1], zl = s.lo[0][1], hh = zu - zl;
      for (let k = 0; k < 20; k++) parts.push({ kind: 2, A: (hh / 20) * t, z: zl + (k * hh) / 20 + hh / 40, name: "web" });
    }
    return parts;
  }

  function partStresses(parts, mat, eps, out) {
    const E = mat.E, Fty = mat.Fty, Fcy = mat.Fcy, Ftu = mat.Ftu, epsU = mat.epsU, ey = Fty / E;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], e = eps[i], s = E * e;
      let v;
      if (p.kind === 0) v = e >= 0 ? (e > epsU ? NaN : e <= ey ? s : Fty + ((Ftu - Fty) * (e - ey)) / (epsU - ey)) : Math.max(s, -Fcy);
      else if (p.kind === 1) v = e >= 0 ? Math.min(s, Fty) : Math.max(s, -p.scc);
      else if (p.kind === 2) v = clamp(s, -Fty, Fty);
      else if (p.kind === 3) v = e >= 0 ? Math.min(s, Fty) : Math.max(s, -Fcy);
      else {
        if (e >= 0) v = Math.min(s, Fty);
        else {
          const se = Math.min(-s, Fcy);
          if (se <= p.scr) v = -se;
          else { const be = Math.min(p.b, 1.9 * p.t * Math.sqrt(E / Math.max(se, 1))); v = -(se * be + p.scr * (p.b - be)) / p.b; }
        }
      }
      out[i] = v;
    }
    return out;
  }

  function capacity(parts, mat, sign = 1) {
    const n = parts.length, z = parts.map((p) => sign * p.z), eps = new Float64Array(n), sig = new Float64Array(n);
    const zmin = Math.min(...z), zmax = Math.max(...z);
    const axial = (kappa, z0) => { for (let i = 0; i < n; i++) eps[i] = -kappa * (z[i] - z0); partStresses(parts, mat, eps, sig); let N = 0; for (let i = 0; i < n; i++) N += sig[i] * parts[i].A; return N; };
    let zPrev = null;
    const root = (kappa, lo, hi, iters) => {
      let flo = axial(kappa, lo), fhi = axial(kappa, hi);
      if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
      for (let it = 0; it < iters; it++) { const mid = 0.5 * (lo + hi), fm = axial(kappa, mid); if (!isFinite(fm)) return null; if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid; }
      return 0.5 * (lo + hi);
    };
    const moment = (kappa) => {
      // neutral axis by bisection on the axial force (warm-started from the previous curvature)
      let z0 = zPrev != null ? root(kappa, Math.max(zmin, zPrev - 0.02), Math.min(zmax, zPrev + 0.02), 30) : null;
      if (z0 == null) z0 = root(kappa, zmin, zmax, 50);
      if (z0 == null) return null;
      zPrev = z0;
      axial(kappa, z0);
      let M = 0; for (let i = 0; i < n; i++) { if (!isFinite(sig[i])) return null; M -= sig[i] * parts[i].A * (z[i] - z0); }
      return { M, z0 };
    };
    const out = { firstSkinBuckle: null, firstStringerCripple: null, firstBoomYield: null, Mmax: 0, kappaAtMax: null, curve: [] };
    const kappas = [...linspace(1e-5, 0.02, 400), ...linspace(0.02, 0.2, 200).slice(1)];
    for (const kappa of kappas) {
      const r = moment(kappa);
      if (!r) break;
      out.curve.push([kappa, r.M]);
      for (let i = 0; i < n; i++) eps[i] = -kappa * (z[i] - r.z0);
      for (let i = 0; i < n; i++) {
        const p = parts[i], e = eps[i];
        if (out.firstSkinBuckle == null && p.kind === 4 && e < 0 && -mat.E * e > p.scr) out.firstSkinBuckle = r.M;
        if (out.firstStringerCripple == null && p.kind === 1 && e < 0 && -mat.E * e >= p.scc) out.firstStringerCripple = r.M;
        if (out.firstBoomYield == null && p.kind === 0 && Math.abs(mat.E * e) >= mat.Fty) out.firstBoomYield = r.M;
      }
      if (r.M > out.Mmax) { out.Mmax = r.M; out.kappaAtMax = kappa; } else if (out.curve.length > 5 && r.M < 0.97 * out.Mmax) break;
    }
    out.curve = out.curve.filter((_, i) => i % 10 === 0);
    return out;
  }

  const CAP_CACHE = new Map();

  /** Stresses and shear flows in a section for shear V (up), moment M (+ compresses the upper surface) and
   *  nose-up torque T about the shear centre. taper: include the in-plane components of inclined boom loads. */
  function loadSection(s, p, V, M, T, taper = true) {
    const Tccw = -T;                                         // the solver uses counter-clockwise (x aft, z up) = nose-down
    const Vw = taper ? V - M * p.taperV : V, TwCcw = taper ? Tccw - M * p.taperT : Tccw;
    const q = p.qV.map((qv, j) => Vw * qv + TwCcw * p.qT[j]);
    const tau = q.map((qq, j) => qq / s.walls[j].t);
    const sig = (x, z) => sigmaAt(s, M, x, z);
    const sUp = s.up.map(([x, z]) => sig(x, z)), sLo = s.lo.map(([x, z]) => sig(x, z));
    const boomU = sig(s.up[s.iSp][0], s.up[s.iSp][1] - s.dF), boomL = sig(s.lo[s.iSp][0], s.lo[s.iSp][1] + s.dF);
    // symmetric-bending (engineer's theory, I_xz ignored) values, for comparison with hand calculations
    const boomUsym = (-M * (s.up[s.iSp][1] - s.dF - s.zc)) / s.Ixx, boomLsym = (-M * (s.lo[s.iSp][1] + s.dF - s.zc)) / s.Ixx;
    const strU = s.iStr.map((i) => sig(s.up[i][0], s.up[i][1] - s.hS / 2)), strL = s.iStr.map((i) => sig(s.lo[i][0], s.lo[i][1] + s.hS / 2));
    let skinTauMax = 0, skinVM = 0;
    s.walls.forEach((w, j) => {
      if (w.surf !== "u" && w.surf !== "l") return;
      const sg = 0.5 * (sig(s.nodes[w.a].x, s.nodes[w.a].z) + sig(s.nodes[w.b].x, s.nodes[w.b].z));
      skinTauMax = Math.max(skinTauMax, Math.abs(tau[j]));
      skinVM = Math.max(skinVM, Math.sqrt(sg * sg + 3 * tau[j] * tau[j]));
    });
    return {
      y: s.y, chord: s.c, zone: s.zone, V, M, T, Vw, Tw: -TwCcw, EI: p.EI, GJ: p.GJ, J: p.J, xsc: p.xscFrac, xm: p.xmFrac, Ixx: s.Ixx, Izz: s.Izz, Ixz: s.Ixz,
      area: s.area, zc: s.zc, xc: s.xc, massLine: s.massLine, IpLine: p.IpLine, fs: p.fs, noseOpen: s.noseOpen,
      q, tau, sUp, sLo, boomU, boomL, boomUsym, boomLsym, strU, strL, tauWeb: tau[s.iSpar], tauFS: tau[s.iFS], skinTauMax, skinVM, resultant: p.resultant,
    };
  }

  /** The loaded cross-section at any span station of a solved wing (for the section view and probes). */
  function sectionAt(res, y) {
    const P = res.P, sec = buildSection(P, res.wing, res.zones, y, res.input.scales), p = analyseSection(sec, P.material), n = res.n;
    const T = y < P.fittingY ? 0 : n * res.perG.T(y);
    return { sec, props: p, load: loadSection(sec, p, n * res.perG.V(y), n * res.perG.M(y), T, res.input.taper !== false) };
  }

  // ------------------------------------------------------------------ beam finite elements (bending + torsion)
  function beamFE(nodesY, EI, GJ, mLine, IpLine, o) {
    const n = nodesY.length, nb = 2 * n, nt = n;
    const Kb = new Float64Array(nb * nb), Mb = new Float64Array(nb * nb), fb = new Float64Array(nb);
    const Kt = new Float64Array(nt * nt), Mt = new Float64Array(nt * nt), ft = new Float64Array(nt);
    const gx = [0.06943184420297371, 0.33000947820757187, 0.6699905217924281, 0.9305681557970262], gw = [0.17392742256872692, 0.3260725774312731, 0.3260725774312731, 0.17392742256872692];
    for (let e = 0; e < n - 1; e++) {
      const y0 = nodesY[e], h = nodesY[e + 1] - y0, ym = y0 + h / 2, ei = EI(ym), gj = GJ(ym);
      const ke = [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]];
      const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) Kb[d[a] * nb + d[b]] += (ei / h ** 3) * ke[a][b];
      for (let q = 0; q < 4; q++) {
        const xi = gx[q], w = gw[q], yq = y0 + xi * h;
        const N = [1 - 3 * xi * xi + 2 * xi ** 3, h * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, h * (-xi * xi + xi ** 3)];
        const m = mLine(yq), wl = o.wLine ? o.wLine(yq) : 0;
        for (let a = 0; a < 4; a++) { fb[d[a]] += w * h * wl * N[a]; for (let b = 0; b < 4; b++) Mb[d[a] * nb + d[b]] += w * h * m * N[a] * N[b]; }
        const Lf = [1 - xi, xi], ip = IpLine(yq), tl = o.tLine ? o.tLine(yq) : 0;
        for (let a = 0; a < 2; a++) { ft[e + a] += w * h * tl * Lf[a]; for (let b = 0; b < 2; b++) Mt[(e + a) * nt + e + b] += w * h * ip * Lf[a] * Lf[b]; }
      }
      const kt = gj / h;
      Kt[e * nt + e] += kt; Kt[(e + 1) * nt + e + 1] += kt; Kt[e * nt + e + 1] -= kt; Kt[(e + 1) * nt + e] -= kt;
    }
    const near = (y) => nodesY.reduce((b, v, i) => (Math.abs(v - y) < Math.abs(nodesY[b] - y) ? i : b), 0);
    for (const pm of o.pointMasses || []) { const i = near(pm.y); Mb[2 * i * nb + 2 * i] += pm.m; Mt[i * nt + i] += pm.Ip; }
    for (const pf of o.pointForces || []) { const i = near(pf.y); fb[2 * i] += pf.F; ft[i] += pf.T || 0; }
    if (isFinite(o.kRoot)) Kb[1 * nb + 1] += o.kRoot;
    const freeB = [...Array(nb).keys()].filter((k) => k !== 0 && (isFinite(o.kRoot) || k !== 1));
    const freeT = [...Array(nt).keys()].filter((k) => k !== 0);
    const sub = (M, n0, free) => { const f = free.length, S = new Float64Array(f * f); for (let i = 0; i < f; i++) for (let j = 0; j < f; j++) S[i * f + j] = M[free[i] * n0 + free[j]]; return S; };
    const Kbf = sub(Kb, nb, freeB), Mbf = sub(Mb, nb, freeB), Ktf = sub(Kt, nt, freeT), Mtf = sub(Mt, nt, freeT);
    const ub = cholBack(cholesky(Kbf, freeB.length), freeB.length, cholFwd(cholesky(Kbf, freeB.length), freeB.length, freeB.map((k) => fb[k])));
    const ut = cholBack(cholesky(Ktf, freeT.length), freeT.length, cholFwd(cholesky(Ktf, freeT.length), freeT.length, freeT.map((k) => ft[k])));
    const w = new Array(n).fill(0), phi = new Array(n).fill(0);
    freeB.forEach((k, i) => { if (k % 2 === 0) w[k / 2] = ub[i]; });
    freeT.forEach((k, i) => (phi[k] = ut[i]));
    const count = o.modes || 4;
    const eb = generalizedEigen(Kbf, Mbf, freeB.length, count), et = generalizedEigen(Ktf, Mtf, freeT.length, count);
    const shapeB = (v) => { const s = new Array(n).fill(0); freeB.forEach((k, i) => { if (k % 2 === 0) s[k / 2] = v[i]; }); const mx = Math.max(...s.map(Math.abs)) || 1; const sg = s[n - 1] < 0 ? -1 : 1; return s.map((x) => (sg * x) / mx); };
    const shapeT = (v) => { const s = new Array(n).fill(0); freeT.forEach((k, i) => (s[k] = v[i])); const mx = Math.max(...s.map(Math.abs)) || 1; const sg = s[n - 1] < 0 ? -1 : 1; return s.map((x) => (sg * x) / mx); };
    return {
      y: nodesY, w, phi,
      fBending: eb.values.map((l) => Math.sqrt(Math.max(l, 0)) / (2 * Math.PI)), fTorsion: et.values.map((l) => Math.sqrt(Math.max(l, 0)) / (2 * Math.PI)),
      bendingModes: eb.modes.map(shapeB), torsionModes: et.modes.map(shapeT),
    };
  }

  // ------------------------------------------------------------------ inputs
  const DEFAULT_INPUT = {
    preset: "d520", n: 1, distribution: "liftingLine", inertiaRelief: true,
    include: { fuel: true, guns: true, ammo: true }, scales: { skin: 1, web: 1, boom: 1, stringer: 1 },
    support: "fittings", mass: null, CL: null, material: null, collapse: true, modes: true, stations: 90,
  };
  const PRESETS = { d520: D520 };

  function normalise(input = {}) {
    const finiteNumbers = (value) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Inputs must be finite numbers");
      if (value && typeof value === "object") Object.values(value).forEach(finiteNumbers);
    };
    finiteNumbers(input); // Before JSON cloning can turn NaN/Infinity into null.
    const inp = { ...deepCopy(DEFAULT_INPUT), ...deepCopy(input) };
    inp.include = { ...DEFAULT_INPUT.include, ...(input.include || {}) };
    inp.scales = { ...DEFAULT_INPUT.scales, ...(input.scales || {}) };
    if (!inp.preset || (typeof inp.preset !== "object" && !PRESETS[inp.preset])) throw new Error("Unknown wing preset");
    if (!["liftingLine", "schrenk", "elliptic"].includes(inp.distribution)) throw new Error("Unknown span-loading distribution");
    if (!["fittings", "clamped"].includes(inp.support)) throw new Error("Unknown support condition");
    if (!Number.isInteger(inp.stations) || inp.stations < 20 || inp.stations > 300) throw new Error("Use 20–300 integer analysis stations");
    const P = typeof inp.preset === "object" ? deepCopy(inp.preset) : deepCopy(PRESETS[inp.preset]);
    const designCL = P.aircraft.CL;
    if (inp.mass != null) {
      if (!(Number.isFinite(inp.mass) && inp.mass > 0)) throw new Error("Aircraft mass must be positive");
      P.aircraft.mass = inp.mass;
    }
    if (inp.CL != null) {
      if (!(Number.isFinite(inp.CL) && inp.CL > 0)) throw new Error("Reference CL must be positive");
      P.aircraft.CL = inp.CL;
    }
    if (input.material) P.material = { ...P.material, ...input.material };
    if (input.gauges) for (const k of ["skin", "web", "falseSpar"]) if (input.gauges[k]) P[k] = input.gauges[k].slice();
    if (input.boom) P.boom = { ...P.boom, ...input.boom };
    if (input.fittingY != null) {
      if (!(input.fittingY > 0 && input.fittingY < P.ribs[0])) throw new Error("Fitting must be between the centreline and first rib");
      P.fittingY = input.fittingY;
    }
    for (const [k, v] of Object.entries(inp.scales)) if (!(Number.isFinite(v) && v > 0)) throw new Error(`Scale factor for ${k} must be positive`);
    if (!(P.aircraft.mass > 0)) throw new Error("Aircraft mass must be positive");
    if (!Number.isFinite(inp.n) || inp.n === 0) throw new Error("Load factor must be a non-zero number");
    if (!(P.material.E > 0 && P.material.nu > 0 && P.material.nu < 0.5)) throw new Error("Check the material card (E > 0, 0 < ν < 0.5)");
    for (const k of ["E", "rho", "Fty", "Fcy", "Ftu", "Fsu", "epsU"]) if (!(Number.isFinite(P.material[k]) && P.material[k] > 0)) throw new Error(`Material ${k} must be positive`);
    if (!Number.isFinite(P.material.nu)) throw new Error("Poisson's ratio must be a finite number");
    if (!(P.material.Ftu > P.material.Fty && P.material.epsU > P.material.Fty / P.material.E)) throw new Error("Check tensile ultimate stress and rupture strain");
    for (const k of ["skin", "web", "falseSpar"]) if (P[k].length !== P.zones.length || P[k].some((v) => !(Number.isFinite(v) && v > 0))) throw new Error(`Invalid ${k} gauge array`);
    if (!(P.boom.rootWidth > 0 && P.boom.rootThickness > 0)) throw new Error("Boom dimensions must be positive");
    if (inp.customLoads != null) {
      if (!Array.isArray(inp.customLoads) || inp.customLoads.length > 30) throw new Error('Use at most 30 custom loads');
      const limit=P.ribs[P.ribs.length-1];
      for(const p of inp.customLoads) {
        if(!['point','distributed'].includes(p.kind) || !Number.isFinite(p.fraction) || p.fraction<0 || p.fraction>1) throw new Error('Choose a valid load type and chord fraction 0–1');
        if(p.kind==='point') {if(!Number.isFinite(p.position)||p.position<P.fittingY||p.position>limit||!Number.isFinite(p.force))throw new Error(`Point station must be between fitting ${P.fittingY} and structural tip ${limit} m; force is in N`);}
        else if(![p.start,p.end,p.qStart,p.qEnd].every(Number.isFinite)||p.start<P.fittingY||p.end>limit||p.end<=p.start)throw new Error(`Distributed bounds must increase from fitting ${P.fittingY} to structural tip ${limit} m; intensity is N/m`);
      }
      // Custom bench loads replace flight lift AND gravity/inertia relief.
      inp.inertiaRelief=false;
    }
    return { inp, P, designCL };
  }

  // Exact outboard force and first moment of a signed linear line load.
  function customDemand(loads,y) {
    let V=0,M=0;
    for(const p of loads) {
      if(p.kind==='point') {if(y<p.position){V+=p.force;M+=p.force*(p.position-y);}continue;}
      const a=Math.max(y,p.start),b=p.end;if(a>=b)continue;
      const h=b-a,k=(p.qEnd-p.qStart)/(p.end-p.start),qa=p.qStart+k*(a-p.start);
      const F=qa*h+k*h*h/2;V+=F;M+=(a-y)*F+qa*h*h/2+k*h*h*h/3;
    }
    return {V,M};
  }

  // ------------------------------------------------------------------ main solve
  function solve(input = {}) {
    const t0 = Date.now();
    const { inp, P, designCL } = normalise(input);
    const W = makeWing(P), mat = P.material, n = inp.n;
    // A load-case change must not silently redesign the physical spar.
    const Z = boomZones({ ...P, aircraft: { ...P.aircraft, CL: designCL } }, W);
    const yTipStruct = P.ribs[P.ribs.length - 1];
    // analysis stations: uniform plus both sides of every gauge step, the fitting and every rib
    let st = linspace(0, yTipStruct, inp.stations);
    for (const [a, b] of P.zones) st.push(Math.max(0, a - 1e-4), a + 1e-4, Math.min(yTipStruct, b - 1e-4));
    st.push(P.fittingY, ...P.ribs);
    st = [...new Set(st.map((v) => +v.toFixed(5)))].filter((v) => v >= 0 && v <= yTipStruct).sort((a, b) => a - b);
    const secs = st.map((y) => buildSection(P, W, Z, y, inp.scales));
    const props = secs.map((s) => analyseSection(s, mat));

    // structural mass: shells, booms, stringers (line) + ribs (points)
    const mLineAt = (y) => (y > yTipStruct ? 0 : interp(y, st, secs.map((s) => s.massLine)));
    const xmAt = (y) => interp(y, st, props.map((p) => p.xmFrac));
    const ribs = P.ribs.map((y, i) => {
      const s = buildSection(P, W, Z, y, inp.scales, { wheelWell: false });
      const t = P.kinkRibs.some((k) => Math.abs(k - y) < 1e-6) ? P.rib.tKink : P.rib.t;
      const area = i === 0 ? s.areaBox : s.areaBox + s.areaNose;          // rib 22 nose is cut by the wheel well
      const xm = i === 0 ? P.sparX + 0.6 * (P.falseSparX - P.sparX) : 0.45;
      return { y, rib: 22 - i, t, area, mass: mat.rho * t * area, xc: xm };
    });
    const ys = linspace(0, W.b2, 4001);
    const mLine = ys.map(mLineAt);
    const structLineMass = trapz(mLine, ys), ribMass = ribs.reduce((s, r) => s + r.mass, 0);
    const masses = pointMasses(P, inp.include);
    const nonStructural = masses.reduce((s, p) => s + p.mass, 0);

    // aerodynamic loading per g
    const Wt = P.aircraft.mass * G0;
    const shape = spanShape(P, W, inp.distribution, ys, P.aircraft.CL);
    const custom=inp.customLoads!=null;
    const lineAt=y=>inp.customLoads.filter(p=>p.kind==='distributed'&&y>=p.start&&y<=p.end).reduce((q,p)=>q+p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start),0);
    const lift = custom?ys.map(lineAt):shape.l.map((v) => v * Wt);
    const xscAt = (y) => interp(Math.min(y, yTipStruct), st, props.map((p) => p.xscFrac));
    const relief = inp.inertiaRelief ? 1 : 0;
    const wLine = ys.map((y, i) => lift[i] - relief * mLine[i] * G0);
    const torqueAt=y=>inp.customLoads.filter(p=>p.kind==='distributed'&&y>=p.start&&y<=p.end).reduce((t,p)=>t+(p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start))*(xscAt(y)-p.fraction)*W.chord(y),0);
    const tLine = ys.map((y, i) => { const c = W.chord(y), xs = xscAt(y); return custom?torqueAt(y):lift[i] * (xs - P.aircraft.xcp) * c - relief * mLine[i] * G0 * (xs - xmAt(Math.min(y, yTipStruct))) * c; });
    const points = [];
    if(custom) for(const p of inp.customLoads.filter(p=>p.kind==='point'))points.push({y:p.position,F:p.force,T:p.force*(xscAt(p.position)-p.fraction)*W.chord(p.position),name:'custom point'});
    if (inp.inertiaRelief) {
      for (const p of masses) points.push({ y: p.y, F: -p.mass * G0, T: -p.mass * G0 * (xscAt(p.y) - p.xc) * W.chord(p.y), name: p.name });
      for (const r of ribs) points.push({ y: r.y, F: -r.mass * G0, T: -r.mass * G0 * (xscAt(r.y) - r.xc) * W.chord(r.y), name: "rib" });
    }
    // shear V (net upward load outboard), bending moment M (positive: upper surface in compression), torque T (nose-up, about the shear centre)
    const N = ys.length, V1 = new Array(N).fill(0), M1 = new Array(N).fill(0), T1 = new Array(N).fill(0);
    for (let i = N - 2; i >= 0; i--) {
      const dy = ys[i + 1] - ys[i];
      V1[i] = V1[i + 1] + 0.5 * (wLine[i] + wLine[i + 1]) * dy;
      M1[i] = M1[i + 1] + 0.5 * (V1[i] + V1[i + 1]) * dy;
      T1[i] = T1[i + 1] + 0.5 * (tLine[i] + tLine[i + 1]) * dy;
    }
    for (const p of points) for (let i = 0; i < N; i++) if (ys[i] < p.y) { V1[i] += p.F; M1[i] += p.F * (p.y - ys[i]); T1[i] += p.T; }
    let customLineT=null;
    if(custom) {
      // Integrate torque over clipped load intervals (no smeared load edges).
      const lineT=new Array(N).fill(0);
      for(let i=N-2;i>=0;i--){let dT=0;for(const p of inp.customLoads.filter(p=>p.kind==='distributed')){
        const a=Math.max(ys[i],p.start),b=Math.min(ys[i+1],p.end);if(b<=a)continue;
        const mid=(a+b)/2,h=(b-a)/2,dt=h/Math.sqrt(3);
        for(const y of [mid-dt,mid+dt])dT+=h*(p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start))*(xscAt(y)-p.fraction)*W.chord(y);
      }lineT[i]=lineT[i+1]+dT;}
      customLineT=lineT;
      for(let i=0;i<N;i++){const d=customDemand(inp.customLoads,ys[i]);V1[i]=d.V;M1[i]=d.M;T1[i]=lineT[i]+points.filter(p=>ys[i]<p.y).reduce((t,p)=>t+p.T,0);}
    }
    const VL = new Array(N).fill(0), ML = new Array(N).fill(0);
    for (let i = N - 2; i >= 0; i--) { const dy = ys[i + 1] - ys[i]; VL[i] = VL[i + 1] + 0.5 * (lift[i] + lift[i + 1]) * dy; ML[i] = ML[i + 1] + 0.5 * (VL[i] + VL[i + 1]) * dy; }
    const yf = P.fittingY;
    const totalUp = V1[0];                                   // net upward load on the half wing per g
    const Mf = interp(yf, ys, M1), Tf = interp(yf, ys, T1);
    // fittings react the whole half-wing load: inboard of them the centre section carries the moment by symmetry
    const Vd = V1.slice(), Md = M1.slice(), Td = T1.slice();
    for (let i = 0; i < N; i++) if (ys[i] < yf) { Vd[i] -= totalUp; Md[i] -= totalUp * (yf - ys[i]); Td[i] = 0; }

    // per-station loads, stresses and shear flows at load factor n
    const at = (arr, y) => {
      if(custom&&(arr===Vd||arr===Md)){const d=customDemand(inp.customLoads,y);return arr===Vd?d.V-(y<yf?totalUp:0):d.M-(y<yf?totalUp*(yf-y):0);}
      if(custom&&arr===Td)return y<yf?0:interp(y,ys,customLineT)+points.filter(p=>y<p.y).reduce((t,p)=>t+p.T,0);
      return interp(y, ys, arr);
    };
    const stations = secs.map((s, k) => loadSection(s, props[k], n * at(Vd, s.y), n * at(Md, s.y), n * at(Td, s.y), inp.taper !== false));

    // deflection and twist by integration on the station grid
    const yStations = stations.map((s) => s.y);
    const kap = stations.map((s) => s.M / s.EI);
    const shearSlope = stations.map((s) => s.Vw * s.fs);
    const twistRate = stations.map((s) => (s.y < yf ? 0 : s.Tw / s.GJ));
    const twistRatePlain = stations.map((s) => (s.y < yf ? 0 : s.T / s.GJ));
    const kf = searchsorted(yStations, yf - 1e-9);
    const integrate = (fn, from, init = 0) => { const out = new Array(yStations.length).fill(0); out[from] = init; for (let i = from + 1; i < yStations.length; i++) out[i] = out[i - 1] + 0.5 * (fn[i] + fn[i - 1]) * (yStations[i] - yStations[i - 1]); for (let i = from - 1; i >= 0; i--) out[i] = out[i + 1] - 0.5 * (fn[i] + fn[i + 1]) * (yStations[i + 1] - yStations[i]); return out; };
    const slope = (() => { const s = new Array(yStations.length).fill(0); for (let i = 1; i < yStations.length; i++) s[i] = s[i - 1] + 0.5 * (kap[i] + kap[i - 1]) * (yStations[i] - yStations[i - 1]); return s; })();
    const slopeClamped = slope.map((v) => v - slope[kf]);
    const slopeUse = inp.support === "clamped" ? slopeClamped : slope;
    const wBend = integrate(slopeUse, kf, 0), wShear = integrate(shearSlope, kf, 0);
    const wBendClamped = integrate(slopeClamped, kf, 0);
    const w = wBend.map((v, i) => v + wShear[i]);
    const twist = integrate(twistRate, kf, 0).map((v, i) => (yStations[i] < yf ? 0 : v));      // nose-up, rad
    const twistPlain = integrate(twistRatePlain, kf, 0);
    stations.forEach((s, i) => { s.w = w[i]; s.wBend = wBend[i]; s.wShear = wShear[i]; s.twist = twist[i]; s.slope = slopeUse[i]; });
    const last = stations[stations.length - 1];
    const tipCap = W.b2 - last.y;
    // tipTE is the legacy rear-box-node result, not a deformable trailing-edge flap.
    const tipSC = last.w, tipLE = last.w + last.twist * last.xsc * last.chord, tipTE = last.w - last.twist * (P.falseSparX - last.xsc) * last.chord;
    const tipMax = [tipLE, tipTE, tipSC].reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a);

    // beam finite elements: same static answer (bending, no shear deformation) and the natural frequencies
    let fem = null;
    if (inp.modes) {
      const nodesY = linspace(yf, yTipStruct, 46);
      const EIf = (y) => interp(y, yStations, stations.map((s) => s.EI)), GJf = (y) => interp(y, yStations, stations.map((s) => s.GJ));
      const IpF = (y) => interp(y, yStations, stations.map((s) => s.IpLine));
      // centre-section flexibility as a rotational spring at the fitting (fittings support), or clamped
      let flex = 0; for (let i = 1; i <= kf; i++) flex += 0.5 * (1 / stations[i].EI + 1 / stations[i - 1].EI) * (yStations[i] - yStations[i - 1]);
      const kRoot = inp.support === "clamped" ? Infinity : 1 / flex;
      // loads outboard of the last rib (tip cap) are carried to the last node
      const iTip = searchsorted(ys, yTipStruct);
      const capF = n * trapz(wLine.slice(iTip), ys.slice(iTip)), capT = n * trapz(tLine.slice(iTip), ys.slice(iTip));
      const pmFE = [...masses.map((p) => ({ y: p.y, m: p.mass, Ip: p.mass * ((xscAt(p.y) - p.xc) * W.chord(p.y)) ** 2 })), ...ribs.filter((r) => r.y >= yf).map((r) => ({ y: r.y, m: r.mass, Ip: 0 }))];
      const pfFE = [...points.filter((p) => p.y >= yf).map((p) => ({ y: p.y, F: n * p.F, T: n * p.T })), { y: yTipStruct, F: capF, T: capT }];
      // the centre-section moment enters through the spring; the beam FE then reproduces the integration
      fem = beamFE(nodesY, EIf, GJf, (y) => mLineAt(y), IpF, {
        kRoot, pointMasses: pmFE, pointForces: pfFE, modes: 4,
        wLine: (y) => n * interp(y, ys, wLine), tLine: (y) => n * interp(y, ys, tLine),
      });
    }

    // stability and strength at every bay and at the reference stations
    const ryAll = [0, ...P.ribs];
    const checkY = [...new Set([...P.ribs.slice(0, -1).map((y, i) => +(0.5 * (y + P.ribs[i + 1])).toFixed(3)), 0.47, 0.6, 0.72, 0.9, 1.2, 1.52, 1.8, 2.1, 2.35, 2.7, 3.0, 3.3, 3.6, 3.9, 4.25, 4.5])].filter((y) => y > yf).sort((a, b) => a - b);
    const Mper = (y) => at(Md, y), Vper = (y) => at(Vd, y), Tper = (y) => at(Td, y);
    const D = (Math.PI ** 2 * mat.E) / (12 * (1 - mat.nu ** 2));
    const checks = checkY.map((y) => {
      const s = buildSection(P, W, Z, y, inp.scales), p = analyseSection(s, mat);
      const M1g = Mper(y), V1g = Vper(y), T1g = Tper(y);
      const taper = inp.taper !== false;
      const Vw1 = taper ? V1g - M1g * p.taperV : V1g, Tw1 = taper ? -T1g - M1g * p.taperT : -T1g;
      const q1 = p.qV.map((qv, j) => Vw1 * qv + Tw1 * p.qT[j]);
      const kk = searchsorted(ryAll, y), pitch = ryAll[Math.min(kk, ryAll.length - 1)] - ryAll[Math.max(kk - 1, 0)];
      const row = { y, M_per_g: M1g, V_per_g: V1g, T_per_g: T1g, pitch, zone: s.zone };
      // spar web shear buckling (simply supported plate between booms and ribs) and shear strength
      const hw = s.walls[s.iSpar].L - 2 * s.dF, tw = s.walls[s.iSpar].t, tauW = Math.abs(q1[s.iSpar] / tw);
      const bS = Math.min(hw, pitch), aL = Math.max(hw, pitch), ks = 5.35 + 4 * (bS / aL) ** 2;
      const tauCrWeb = ks * D * (tw / bS) ** 2;
      row.web = { tau_per_g: tauW, tauCr: tauCrWeb, n_buckle: tauCrWeb / tauW, n_yield: mat.Fty / Math.sqrt(3) / tauW, n_ultimate: mat.Fsu / tauW, depth: hw, t: tw };
      // skin panels: compression buckling (as collapse.py), combined compression + shear (new)
      const parts = collapseParts(P, W, Z, y, inp.scales, mat);
      const panels = parts.filter((pp) => pp.kind === 4);
      const combined = { pos: Infinity, neg: Infinity, where: { pos: null, neg: null } };
      row.panels = [];
      for (const pp of panels) {
        const xm = 0.5 * (pp.x0 + pp.x1);
        const sx = W.section(y, [xm]); const pt = pp.side === "u" ? sx.up[0] : sx.lo[0];
        const sig1 = sigmaAt(s, M1g, pt[0], pt[1]);
        let tq = 0, cnt = 0;
        s.walls.forEach((w, j) => { if (w.surf === pp.side && s.x[w.i] >= pp.x0 - 1e-9 && s.x[w.i + 1] <= pp.x1 + 1e-9) { tq += Math.abs(q1[j]); cnt++; } });
        const tau1 = cnt ? tq / cnt / pp.t : 0;
        const b = Math.min(pp.b, pp.pitch), a = Math.max(pp.b, pp.pitch);
        const tauCr = (5.35 + 4 * (b / a) ** 2) * D * (pp.t / b) ** 2 + (0.1 * mat.E * pp.t) / pp.R;
        const prow = { side: pp.side, x0: pp.x0, x1: pp.x1, b: pp.b, t: pp.t, pitch: pp.pitch, R: pp.R, sigCr: pp.scr, tauCr, sig_per_g: sig1, tau_per_g: tau1 };
        for (const [side, sgn] of [["pos", 1], ["neg", -1]]) {
          const comp = Math.max(0, -sgn * sig1) / pp.scr, sh = tau1 / tauCr;
          // n comp + n² sh² = 1
          const nb = sh > 0 ? (-comp + Math.sqrt(comp * comp + 4 * sh * sh)) / (2 * sh * sh) : comp > 0 ? 1 / comp : Infinity;
          prow[side] = nb; prow[side + "Comp"] = comp > 0 ? 1 / comp : Infinity;
          if (nb < combined[side]) { combined[side] = nb; combined.where[side] = { name: pp.name, side: pp.side, x0: pp.x0, x1: pp.x1 }; }
        }
        row.panels.push(prow);
      }
      row.skinCombined = combined;
      if (inp.collapse) {
        for (const [side, sgn] of [["pos", 1], ["neg", -1]]) {
          const key = JSON.stringify([y, sgn, mat, parts]);
          if (!CAP_CACHE.has(key)) { if (CAP_CACHE.size > 400) CAP_CACHE.clear(); CAP_CACHE.set(key, capacity(parts, mat, sgn)); }
          const c = CAP_CACHE.get(key), f = (m) => (m == null ? null : m / Math.abs(M1g));
          row[side] = { n_skin_buckle: f(c.firstSkinBuckle), n_stringer_cripple: f(c.firstStringerCripple), n_boom_yield: f(c.firstBoomYield), n_collapse: f(c.Mmax), M_max: c.Mmax, curve: c.curve };
        }
      }
      return row;
    });
    const crit = (fn) => { let best = null; for (const r of checks) { const v = fn(r); if (v != null && isFinite(v) && (!best || v < best.n)) best = { n: v, y: r.y }; } return best; };
    const nUlt = P.aircraft.nLimitPos * P.aircraft.safetyFactor, nUltNeg = Math.abs(P.aircraft.nLimitNeg) * P.aircraft.safetyFactor;
    const modesSummary = [
      { key: "skinBuckle", name: "Predicted skin compression buckling onset", pos: crit((r) => r.pos && r.pos.n_skin_buckle), neg: crit((r) => r.neg && r.neg.n_skin_buckle), kind: "stability", governs: false },
      { key: "skinCombined", name: "Skin panel buckles under compression + shear", pos: crit((r) => r.skinCombined.pos), neg: crit((r) => r.skinCombined.neg), kind: "stability", governs: false },
      { key: "webBuckle", name: "Spar web shear buckling (post-buckling not solved)", pos: crit((r) => r.web.n_buckle), neg: crit((r) => r.web.n_buckle), kind: "stability", governs: false },
      { key: "stringer", name: "Blade stringer cripples", pos: crit((r) => r.pos && r.pos.n_stringer_cripple), neg: crit((r) => r.neg && r.neg.n_stringer_cripple), kind: "strength", governs: true },
      { key: "boomYield", name: "Spar boom first yield", pos: crit((r) => r.pos && r.pos.n_boom_yield), neg: crit((r) => r.neg && r.neg.n_boom_yield), kind: "strength", governs: true },
      { key: "webShear", name: "Spar web shear rupture (Fsu)", pos: crit((r) => r.web.n_ultimate), neg: crit((r) => r.web.n_ultimate), kind: "strength", governs: true },
      { key: "collapse", name: "Section collapse (effective-width post-buckling)", pos: crit((r) => r.pos && r.pos.n_collapse), neg: crit((r) => r.neg && r.neg.n_collapse), kind: "strength", governs: true },
    ];

    // verification
    const totalLift = trapz(lift, ys);
    const fitting = { Fz_per_g: -totalUp, M_per_g: Mf, T_per_g: Tf };
    const resErr = Math.max(...props.map((p) => Math.max(Math.abs(p.resultant[0]), Math.abs(p.resultant[1] - 1))));
    const verification = {
      halfLiftError: Math.abs(totalLift - Wt / 2) / (Wt / 2),
      shearResultantError: resErr,
      femTipDiff: fem ? Math.abs(fem.w[fem.w.length - 1] - (inp.support === "clamped" ? wBendClamped : wBend)[stations.length - 1]) / Math.abs(wBend[stations.length - 1] || 1) : null,
      femTwistDiff: fem ? Math.abs(fem.phi[fem.phi.length - 1] - twistPlain[stations.length - 1]) / Math.abs(twistPlain[stations.length - 1] || 1) : null,
    };
    const structMass = structLineMass + ribMass;
    return {
      version: VERSION, preset: { id: P.id, name: P.name, short: P.short }, P, input: inp, n, wing: W, zones: Z,
      W: Wt, wingArea: W.area(), alphaDeg: custom?null:shape.alphaDeg, CLa: shape.CLa, CLb: shape.CLb,
      grid: { y: ys.filter((_, i) => i % 20 === 0), lift: lift.filter((_, i) => i % 20 === 0).map((v) => v * n), V: Vd.filter((_, i) => i % 20 === 0).map((v) => v * n), M: Md.filter((_, i) => i % 20 === 0).map((v) => v * n), T: Td.filter((_, i) => i % 20 === 0).map((v) => v * n), m: mLine.filter((_, i) => i % 20 === 0),
        VliftOnly: VL.filter((_, i) => i % 20 === 0).map((v) => v * n), MliftOnly: ML.filter((_, i) => i % 20 === 0).map((v) => v * n),
        schrenk: spanShape(P, W, "schrenk", ys.filter((_, i) => i % 20 === 0)).l.map((v) => v * Wt * n), elliptic: spanShape(P, W, "elliptic", ys.filter((_, i) => i % 20 === 0)).l.map((v) => v * Wt * n),
        liftingLine: (inp.distribution === "liftingLine" ? lift.filter((_, i) => i % 20 === 0) : spanShape(P, W, "liftingLine", ys, P.aircraft.CL).l.filter((_, i) => i % 20 === 0).map((v) => v * Wt)).map((v) => v * n) },
      perG: { V: (y) => at(Vd, y), M: (y) => at(Md, y), T: (y) => at(Td, y), lift: (y) => at(lift, y) },
      stations, sections: secs, sectionProps: props, ribs, masses, points,
      mass: { structuralHalf: structMass, shellsBoomsStringers: structLineMass, ribs: ribMass, nonStructuralHalf: nonStructural },
      fitting, tip: { y: last.y, wSC: tipSC, wLE: tipLE, wTE: tipTE, wRearBox: tipTE, wMax: tipMax, w5: tipSC + last.slope * tipCap, twistDeg: (last.twist * 180) / Math.PI, twistDegNoTaper: (twistPlain[stations.length - 1] * 180) / Math.PI, wBendClamped: wBendClamped[stations.length - 1], wBendClamped5: wBendClamped[stations.length - 1] + slopeClamped[stations.length - 1] * tipCap, wBend: wBend[stations.length - 1], wShear: wShear[stations.length - 1] },
      fem, checks, failure: modesSummary, nUlt, nUltNeg, verification, ms: Date.now() - t0,
    };
  }

  // ------------------------------------------------------------------ textbook checks used by the tests
  // Radix-2 FFT, one-sided Hann-window amplitude spectrum, mean removed.
  function vibrationSpectrum(samples,fs){
    const n=samples.length;
    if(n<8||n>16384||(n&(n-1))||!Number.isFinite(fs)||fs<=0||!samples.every(Number.isFinite))throw new Error('FFT needs 8–16384 power-of-two finite samples and positive sampling rate');
    const mean=samples.reduce((a,b)=>a+b,0)/n,re=new Array(n),im=new Array(n).fill(0);let sumW=0;
    for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/n);sumW+=w;re[i]=(samples[i]-mean)*w;}
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
    for(let size=2;size<=n;size*=2)for(let start=0;start<n;start+=size)for(let j=0;j<size/2;j++){
      const a=start+j,b=a+size/2,angle=-2*Math.PI*j/size,c=Math.cos(angle),s=Math.sin(angle),tr=re[b]*c-im[b]*s,ti=re[b]*s+im[b]*c;
      re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
    }
    return {frequency:Array.from({length:n/2+1},(_,k)=>k*fs/n),amplitude:Array.from({length:n/2+1},(_,k)=>Math.hypot(re[k],im[k])*(k===0||k===n/2?1:2)/sumW),resolution:fs/n,nyquist:fs/2};
  }
  /** Thin circular tube of radius R and wall t discretised into n walls (J = 2πR³t, shear centre at the centre). */
  function tubeSection(R, t, n = 72) {
    const nodes = [], walls = [];
    for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; nodes.push({ x: R * Math.cos(a), z: R * Math.sin(a) }); }
    for (let k = 0; k < n; k++) { const a = k, b = (k + 1) % n; walls.push({ a, b, t, L: Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z) }); }
    let Ixx = 0, Izz = 0;
    for (const nd of nodes) { nd.B = 2 * Math.PI * R * t / n; nd.Qx = nd.B * nd.x; nd.Qz = nd.B * nd.z; Ixx += nd.B * nd.z ** 2; Izz += nd.B * nd.x ** 2; }
    let area = 0; for (let k = 0; k < n; k++) { const a = nodes[k], b = nodes[(k + 1) % n]; area += 0.5 * (a.x * b.z - b.x * a.z); }
    const cell = walls.map((w, j) => ({ w: j, s: +1 })); cell.area = area;
    return { nodes, walls, cells: [cell], Ixx, Izz, Ixz: 0, ref: [0, 0] };
  }

  return {
    VERSION, G0, D520, PRESETS, DEFAULT_INPUT, normalise, customDemand, vibrationSpectrum, makeWing, liftingLine, spanShape, pointMasses, boomZones, chordFractions,
    buildSection, analyseSection, loadSection, sectionAt, shearFlowSolve, sigmaAt, collapseParts, capacity, beamFE, solve, zoneOf, interp, linspace, trapz, tubeSection,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = MetalWingEngine;
