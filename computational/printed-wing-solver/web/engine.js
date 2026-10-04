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
 */
const WingEngine = (() => {
  "use strict";
  const GRAV = 9.81;
  const VERSION = "1.0.0";

  // ------------------------------------------------------------------ materials
  const MATERIALS = {
    pla_upright: {
      key: "pla_upright", kind: "pla", name: "Printed PLA Pro — span along printer Z",
      short: "PLA upright", E: 2000, nu: 0.35, rho: 1.24, ft: 15, fc: 50, fs: 10, G: null,
      source: "Teaching placeholder inside published FFF-PLA ranges (Gonabadi, Yadav & Bull 2020: ≈2 GPa / 5 MPa upright). Replace with coupon data.",
    },
    pla_flat: {
      key: "pla_flat", kind: "pla", name: "Printed PLA Pro — span in build plane",
      short: "PLA flat", E: 3000, nu: 0.35, rho: 1.24, ft: 45, fc: 55, fs: 20, G: null,
      source: "Teaching placeholder inside published FFF-PLA ranges (≈3–3.5 GPa, 45–55 MPa along roads). Replace with coupon data.",
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
    g.rodFractions = [...g.rodFractions];
    const pos = ["semiSpan", "rootChord", "tipChord", "skin", "ribThickness", "te", "cap", "rodDiameter", "sleeveWall"];
    for (const k of pos) if (!(g[k] > 0)) throw new Error(`${k} must be positive.`);
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
    return Object.freeze(g);
  }

  const chordAt = (g, y) => {
    const eta = Math.min(1, Math.max(0, y / g.semiSpan));
    return g.rootChord + eta * (g.tipChord - g.rootChord);
  };
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
    const { yc, slope } = camber(code, x);
    const vh = halfThickness(code, x, chord, te) * Math.cos(Math.atan(slope));
    return { lower: (yc - vh) * chord, camber: yc * chord, upper: (yc + vh) * chord };
  }
  function rodCentres(g, y) {
    const c = chordAt(g, y);
    return g.rodFractions.map((f) => [f * c, camber(g.naca, f).yc * c]);
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

  function outerContour(g, y, count = 241) {
    const c = chordAt(g, y);
    const { xu, zu, xl, zl } = airfoilSurfaces(g.naca, c, g.te, count);
    const pts = xu.map((x, i) => [x, zu[i]]);
    for (let i = xl.length - 1; i >= 1; i--) pts.push([xl[i], zl[i]]);
    return pts;
  }

  // Matched inner (cavity) and outer loops for a mapped ring mesh, CCW around the cavity
  function ringLoops(g, y, Ks = 120, Kn = 40, Ka = 24) {
    const c = chordAt(g, y);
    const t = g.skin;
    const x0 = g.cavityStart, x1 = g.cavityEnd;
    const { xu, zu, xl, zl } = airfoilSurfaces(g.naca, c, g.te, 401);
    const outUp = (x) => interp(x, xu, zu);
    const outLo = (x) => interp(x, xl, zl);
    const xs = cosineSpacing(Ks, x0, x1).map((v) => v * c);
    const upIn = [], loIn = [], upOut = [], loOut = [];
    for (const x of xs) {
      const v = verticalOrdinates(g.naca, x / c, c, g.te);
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
    const mult = (x, out) => {
      for (let i = 0; i < n; i++) {
        if (i === fixed) { out[i] = x[i]; continue; }
        let s = 0;
        for (const [j, v] of rows[i]) if (j !== fixed) s += v * x[j];
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
    const xq = cosineSpacing(161, x0, x1);
    const xs = xq.map((v) => v * c);
    const up = [], lo = [];
    for (const x of xq) {
      const v = verticalOrdinates(g.naca, x, c, g.te);
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
  function geometricSection(g, y, layers = 4) {
    const key = JSON.stringify([g, y, layers]);
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
    const sums = [0, 0, 0, 0, 0, 0];
    const add = (arr, E) => arr.forEach((v, i) => (sums[i] += E * v));
    add(shellInt, Ep);
    sleeveInts.forEach((s) => add(s, Ep));
    if (asm.rodsBonded) rodInts.forEach((s) => add(s, Er));
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
    // mass, centre of gravity and polar mass moment about the shear centre (g/mm, g·mm²/mm)
    const rp = pla.rho * 1e-3, rr_ = rod.rho * 1e-3;
    const plaInt = shellInt.map((v, i) => v + sleeveInts.reduce((s, a) => s + a[i], 0));
    const rodInt = rodInts.reduce((s, a) => s.map((v, i) => v + a[i]), [0, 0, 0, 0, 0, 0]);
    const mass = rp * plaInt[0] + rr_ * rodInt[0];
    const cgx = (rp * plaInt[2] + rr_ * rodInt[2]) / mass;
    const polar = (I) => I[4] - 2 * fe.xsc * I[2] + fe.xsc ** 2 * I[0] + (I[3] - 2 * fe.zsc * I[1] + fe.zsc ** 2 * I[0]);
    const polarInertia = rp * polar(plaInt) + rr_ * polar(rodInt);
    const outerInt = polyIntegrals(outer);
    const holeInt = centres.map((cc) => diskIntegrals(cc, rh)).reduce((s, a) => s.map((v, i) => v + a[i]), [0, 0, 0, 0, 0, 0]);
    const ribInt = outerInt.map((v, i) => v - holeInt[i]);
    const ribExtra = ribInt[0] - plaInt[0];
    let zTop = -Infinity, zBot = Infinity;
    for (const p of outer) { zTop = Math.max(zTop, p[1]); zBot = Math.min(zBot, p[1]); }
    // upper-skin panel: same point set as the Python solver (241-point surface, x0..x1)
    const surf = airfoilSurfaces(g.naca, loops.chord, g.te, 241);
    const us = [];
    surf.xu.forEach((x, i) => { if (x >= g.cavityStart * loops.chord && x <= g.cavityEnd * loops.chord) us.push([x, surf.zu[i]]); });
    let width = 0;
    for (let i = 1; i < us.length; i++) width += Math.hypot(us[i][0] - us[i - 1][0], us[i][1] - us[i - 1][1]);
    const radius = circleRadius(us[0], us[us.length >> 1], us[us.length - 1]);
    return {
      y, chord: loops.chord, EA, xc, zc, EIf, EIc, EIxz, principal, EIrods, GJ, Jfe: fe.J, Jbredt: bredt.J,
      bredtArea: bredt.Am, xsc: fe.xsc, zsc: fe.zsc, mass, cgx, polarInertia, zTop, zBot,
      plaArea: plaInt[0], shellArea: fe.A, rodArea: rodInt[0], ribExtra, ribCgx: ribInt[2] / ribInt[0],
      ribPolar: polar(ribInt), skinWidth: width, skinRadius: radius, mesh, fe, corners: loops.corners,
      outer, centres, Rs, rh, rr,
    };
  }

  // ------------------------------------------------------------------ loads and criteria
  const DEFAULT_LOAD = {
    name: "Limit manoeuvre (analytical)", kind: "flight", aircraftMass: 1.0, loadFactor: 4.0,
    distribution: "schrenk", liftFraction: 0.25, inertiaRelief: true, tipForce: 10, tipFraction: 0.3,
    fos: 1.5, tipMass: 0,
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
    for (const [y, F] of o.pointForces || []) fb[wDof[argmin(nodes, y)]] += F;
    for (const [y, T] of o.pointTorques || []) ft[phL[argmin(nodes, y)]] += T;
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
    const g = makeGeometry(input.geometry || {});
    const pla = { ...MATERIALS.pla_upright, ...(input.pla || {}) };
    const rod = { ...MATERIALS.rod_hobby, ...(input.rod || {}) };
    const asm = { ...DEFAULT_ASSEMBLY, ...(input.assembly || {}) };
    const load = { ...DEFAULT_LOAD, ...(input.load || {}) };
    const crit = { ...DEFAULT_CRITERIA, ...(input.criteria || {}) };
    const nSections = input.nSections || 7;
    const ySec = linspace(0, 0.95 * g.semiSpan, nSections);
    return { g, pla, rod, asm, load, crit, nSections, ySec };
  }
  // Progressive solving for a responsive interface: analyse station k now, solve() reuses it.
  const stations = (input) => normalize(input).ySec;
  function warmStation(input, k) {
    const n = normalize(input);
    return cachedSection(n.g, n.pla, n.rod, n.asm, n.ySec[k]);
  }
  function sectionAt(input, y) {
    const n = normalize(input);
    return cachedSection(n.g, n.pla, n.rod, n.asm, Math.min(Math.max(y, 0), n.g.semiSpan));
  }

  function solve(input = {}) {
    const { g, pla, rod, asm, load, crit, ySec } = normalize(input);
    const nGrid = input.nGrid || 901, nElem = input.nElements || 60;
    const L = g.semiSpan;
    const seamsActive = asm.seamsBonded ? [] : seams(g);
    const ribs = ribStations(g);
    const sections = ySec.map((y) => cachedSection(g, pla, rod, asm, y));
    const col = (k) => sections.map((s) => s[k]);
    const yset = new Set([...linspace(0, L, nGrid), ...seams(g), ...ribs].map((v) => +v.toFixed(9)));
    const y = Float64Array.from([...yset].sort((a, b) => a - b));
    const lin = (k) => (yy) => interpLin(yy, ySec, col(k));
    const P = {};
    P.chord = y.map((v) => chordAt(g, v));
    for (const k of ["xsc", "xc", "zc", "zTop", "zBot", "mass", "cgx", "polarInertia", "skinWidth", "skinRadius", "EIrods", "rodArea"]) P[k] = y.map(lin(k));
    P.EI = y.map((v) => interpLog(v, ySec, col("EIf")));
    P.GJ = y.map((v) => interpLog(v, ySec, col("GJ")));

    // mass
    const rho = pla.rho * 1e-3;
    const ribMass = ribs.map((r) => rho * g.ribThickness * lin("ribExtra")(r));
    const ribCg = ribs.map((r) => lin("ribCgx")(r));
    const ribPolar = ribs.map((r) => rho * g.ribThickness * lin("ribPolar")(r));
    const capMass = [0, L].map((r) => rho * g.cap * lin("ribExtra")(r));
    const plaLine = y.map((v, i) => P.mass[i] - rod.rho * 1e-3 * P.rodArea[i]);
    const shellMass = trapz(plaLine, y);
    const rodsMass = rod.rho * 1e-3 * g.rodFractions.length * Math.PI * rodRadius(g) ** 2 * L;
    const mass = { shell: shellMass, ribs: ribMass.reduce((a, b) => a + b, 0), caps: capMass[0] + capMass[1] };
    mass.printed = mass.shell + mass.ribs + mass.caps;
    mass.rods = rodsMass;
    mass.tip = load.tipMass;
    mass.total = mass.printed + mass.rods + load.tipMass;

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
    } else {
      point.push([L, load.tipForce, load.tipFraction * g.tipChord]);
    }
    const Q0 = fromTip(w, y), Q1 = fromTip(w.map((v, i) => v * y[i]), y), X = fromTip(wx, y);
    const V = Float64Array.from(Q0), M = Q1.map((v, i) => v - y[i] * Q0[i]), Xall = Float64Array.from(X);
    for (const [yp, F, xp] of point)
      for (let i = 0; i < y.length; i++)
        if (y[i] <= yp + 1e-9) { V[i] += F; M[i] += F * (yp - y[i]); Xall[i] += F * xp; }
    const T = y.map((v, i) => P.xsc[i] * V[i] - Xall[i]);
    const appliedForce = trapz(w, y) + point.reduce((s, p) => s + p[1], 0);
    const appliedMoment = trapz(w.map((v, i) => v * y[i]), y) + point.reduce((s, p) => s + p[1] * p[0], 0);

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
    const seamRot = [];
    for (const s of seamsActive) {
      const Ms = interp(s, y, M), Ts = interp(s, y, T);
      const dth = Ms / kBend, dph = Ts / kTorsAt(s);
      for (let i = 0; i < y.length; i++) if (y[i] > s + 1e-9) { slope[i] += dth; twist[i] += dph; }
      seamRot.push({ y: s, M: Ms, T: Ts, dtheta: dth, dphi: dph });
    }
    const deflection = cumFromRoot(slope, y);
    const bounds = moduleBounds(g);
    let freePlay = 0;
    if (!asm.seamsBonded)
      seams(g).forEach((s, i) => {
        const la = bounds[i + 1] - bounds[i], lb = bounds[i + 2] - bounds[i + 1];
        freePlay += 2 * g.clearance * (1 / la + 1 / lb) * (L - s);
      });

    // 1-D FEM: static and modal
    const nodeSet = new Set([...linspace(0, L, nElem + 1), ...seams(g), ...ribs].map((v) => +v.toFixed(9)));
    const nodes = [...nodeSet].sort((a, b) => a - b);
    const EIf = (q) => interpLog(q, ySec, col("EIf"));
    const GJf = (q) => interpLog(q, ySec, col("GJ"));
    const mf = (q) => interp(q, y, P.mass), Ipf = (q) => interp(q, y, P.polarInertia), wf = (q) => interp(q, y, w);
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
      seams: seamsActive, kBend: kb, kTors: kTorsAt, wLine: wf, tLine: tf,
      pointForces: point.map(([yp, F]) => [yp, F]), pointTorques, pointMasses: lumped, pointInertias: lumpedI,
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
    const sigTop = y.map((_, i) => -Ep * kappa[i] * (P.zTop[i] - P.zc[i]));
    const sigBot = y.map((_, i) => -Ep * kappa[i] * (P.zBot[i] - P.zc[i]));
    const skinTop = y.map((_, i) => -Ep * kappa[i] * (P.zTop[i] - t / 2 - P.zc[i]));
    const skinBot = y.map((_, i) => -Ep * kappa[i] * (P.zBot[i] + t / 2 - P.zc[i]));
    const skinComp = y.map((_, i) => Math.max(Math.max(-skinTop[i], 0), Math.max(-skinBot[i], 0)));
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
    if (asm.rodsBonded) {
      const off = sections.map((s) => Math.max(...rodCentres(g, s.y).map(([, z]) => Math.abs(z - s.zc))));
      sigRod = y.map((v, i) => rod.E * Math.abs(kappa[i]) * (interpLin(v, ySec, off) + rr));
    } else sigRod = y.map((_, i) => rod.E * Math.abs(kappa[i]) * rr);

    // shear stress at analysis stations (2-D FE, away from the sharp cavity corners)
    const tau = [], tauPeak = [];
    sections.forEach((s) => {
      const Vs = interp(s.y, y, V), Ts = interp(s.y, y, T);
      const fld = shearField(s, Vs, Ts, g);
      tau.push(fld.nominal);
      tauPeak.push(fld.peak);
    });
    const tauBredt = sections.map((s) => Math.abs(interp(s.y, y, T)) / (2 * s.bredtArea * t));

    // checks
    const F = load.fos;
    const checks = [];
    const add = (name, demand, capacity, unit, at, basis, group) => checks.push({ name, demand, capacity, unit, at, basis, group, U: capacity > 0 ? demand / capacity : Infinity });
    const tens = y.map((_, i) => Math.max(sigTop[i], sigBot[i]));
    const comp = y.map((_, i) => Math.max(-sigTop[i], -sigBot[i]));
    const iT = argmaxArr(tens), iC = argmaxArr(comp);
    add("PLA tension (bending)", F * Math.max(tens[iT], 0), pla.ft, "MPa", y[iT], `FoS ${F} × limit stress vs tensile strength`, "strength");
    add("PLA compression (bending)", F * Math.max(comp[iC], 0), pla.fc, "MPa", y[iC], `FoS ${F} × limit stress vs compressive strength`, "strength");
    const kTau = argmaxArr(tau);
    add("PLA shear (transverse shear + torsion, 2-D FE)", F * tau[kTau], pla.fs, "MPa", ySec[kTau], "Max nominal resultant shear away from sharp cavity corners", "strength");
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
        const dowel = ((4 / 3) * (Vs / nr)) / (Math.PI * rr * rr);
        if (!worst || rodSig > worst[1]) worst = [s, rodSig, bearing, dowel];
      }
      const [s, rodSig, bearing, dowel] = worst;
      add("Rod bending at dry seam (rods carry the whole moment)", F * rodSig, Math.min(rod.ft, rod.fc), "MPa", s, "σ = (M/n) r / I_rod", "joint");
      add("Rib-hole bearing at dry seam (screening)", F * bearing, pla.fc, "MPa", s, "rod moment reacted by a force couple between interface rib and next rib", "joint");
      add("Rod dowel shear at dry seam", F * dowel, rod.fs, "MPa", s, "4V/(3 n π r²)", "joint");
    } else {
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
      y, props: P, w, point, V, M, T, kappa, slope, deflection, twist, fem, seamsActive, seamRot,
      seam: { kBend, freeLength: Lf, freePlay: asm.seamsBonded ? 0 : freePlay },
      ribs, seams: seams(g), mass, stiffness, liftN, appliedForce, appliedMoment,
      stress: { sigTop, sigBot, skinComp, sigCr, sigFlat, sigCyl, sigRod, tau, tauPeak, tauBredt },
      checks, governing, verification,
    };
  }

  function argmaxArr(a) {
    let k = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > a[k]) k = i;
    return k;
  }

  // Resultant shear stress on a section for upward shear V and nose-up torque T
  // (sectionproperties mapping: vy = −V, mzz = +T).
  function shearField(section, Vup, Tnose, g) {
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
    VERSION, MATERIALS, DEFAULT_GEOMETRY, DEFAULT_LOAD, DEFAULT_CRITERIA, DEFAULT_ASSEMBLY,
    makeGeometry, chordAt, seams, ribStations, moduleBounds, rodCentres, rodRadius, holeRadius, sleeveRadius,
    airfoilSurfaces, verticalOrdinates, outerContour, ringLoops, ringMesh, shellFE, analyseSection, solve,
    shearField, compareAssemblies, interp, camber, normalizeNaca, normalize, stations, warmStation, sectionAt,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WingEngine;
