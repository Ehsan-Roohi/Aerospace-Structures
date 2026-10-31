/* Axisymmetric surface-source BEM. Original research implementation, 2026-10-30.
 * Closed surface of revolution, uniform axial flow, no swirl, incompressible,
 * inviscid, fully wetted. This is NOT a developed-cavity/free-boundary solver.
 * Coordinates and dimensions: metres; velocity: m/s; pressure: Pa.
 * Source convention: phi = -integral sigma/(4*pi*R) dS; v = grad(phi).
 * Exterior normal trace is +sigma/2 plus the principal-value integral.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AxisymmetricBEM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.1.0-research';
  const PI = Math.PI;
  const quadratures = new Map();

  function finite(value, name, fallback) {
    const v = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(v)) throw new Error(name + ' must be finite.');
    return v;
  }
  function gauss(n) {
    if (quadratures.has(n)) return quadratures.get(n);
    const x = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      let z = Math.cos(PI * (i + 0.75) / (n + 0.5)), pp;
      for (let k = 0; k < 30; k++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) {
          const p3 = p2; p2 = p1;
          p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
        }
        pp = n * (z * p1 - p2) / (z * z - 1);
        const dz = p1 / pp; z -= dz;
        if (Math.abs(dz) < 2e-15) break;
      }
      x[i] = -z; x[n - 1 - i] = z;
      w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * pp * pp);
    }
    const q = { x, w }; quadratures.set(n, q); return q;
  }
  // Complete elliptic integrals. q=1-m is supplied directly to retain precision
  // near a coincident ring; it is not calculated by subtracting m from 1.
  function ellipticFromComplement(q) {
    if (!(q > 0 && q <= 1 + 1e-14)) throw new Error('Coincident ring or invalid elliptic argument.');
    q = Math.min(1, q);
    const m = 1 - q;
    let a = 1, b = Math.sqrt(q), sum = m / 2, weight = 1;
    for (let k = 0; k < 30; k++) {
      const c = (a - b) / 2;
      sum += weight * c * c;
      const nextA = (a + b) / 2, nextB = Math.sqrt(a * b);
      a = nextA; b = nextB; weight *= 2;
      if (Math.abs(c) < 2e-16 * a) break;
    }
    const K = PI / (2 * a);
    return { K, E: K * (1 - sum) };
  }
  // Velocity from a circular ring with density sigma=1 per meridional ds.
  // The ring circumference factor r' and the 1/(4*pi) Green normalization
  // are included. No azimuthal mesh or rotated two-dimensional solution.
  function ringVelocity(x, r, xs, rs) {
    const dx = x - xs;
    if (r === 0) {
      const d2 = dx * dx + rs * rs;
      return { x: rs * dx / (2 * Math.pow(d2, 1.5)), r: 0 };
    }
    const dr = r - rs, B = dx * dx + dr * dr;
    const D = dx * dx + (r + rs) * (r + rs);
    if (!(B > 0 && D > 0)) throw new Error('Coincident ring.');
    const e = ellipticFromComplement(B / D), factor = rs / (PI * Math.sqrt(D));
    return {
      x: factor * e.E * dx / B,
      r: factor * ((e.K - e.E) / (2 * r) + e.E * dr / B)
    };
  }
  function panelInfluence(p, source, isSelf, order) {
    const q = gauss(order), midX = source.x, midR = source.r;
    let normal = 0, tangent = 0;
    if (isSelf) {
      // Paired PV about the collocation point. u=(L/2)*v^2 also regularizes
      // the integrable logarithm; the odd 1/u tangential term cancels before
      // summation. The finite exterior jump is added only to the normal row.
      for (let k = 0; k < q.x.length; k++) {
        const v = (q.x[k] + 1) / 2;
        const u = source.length * v * v / 2;
        const wt = q.w[k] * source.length * v / 2;
        let pairN = 0, pairT = 0;
        for (const sign of [-1, 1]) {
          const xs = midX + sign * u * source.tx;
          const rs = midR + sign * u * source.tr;
          const dx = -sign * u * source.tx, dr = -sign * u * source.tr;
          const B = u * u, D = dx * dx + (p.r + rs) * (p.r + rs);
          const e = ellipticFromComplement(B / D), f = rs / (PI * Math.sqrt(D));
          pairN += f * p.nr * (e.K - e.E) / (2 * p.r);
          pairT += f * (p.tr * (e.K - e.E) / (2 * p.r) + e.E * (p.tx * dx + p.tr * dr) / B);
        }
        normal += wt * pairN; tangent += wt * pairT;
      }
    } else {
      for (let k = 0; k < q.x.length; k++) {
        const s = q.x[k] * source.length / 2;
        const v = ringVelocity(p.x, p.r, midX + s * source.tx, midR + s * source.tr);
        const wt = q.w[k] * source.length / 2;
        normal += wt * (v.x * p.nx + v.r * p.nr);
        tangent += wt * (v.x * p.tx + v.r * p.tr);
      }
    }
    return { normal, tangent };
  }
  function solveDense(A, rhs) {
    const n = rhs.length, b = Float64Array.from(rhs);
    const M = A.map(row => Float64Array.from(row));
    for (let k = 0; k < n; k++) {
      let pivot = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[pivot][k])) pivot = i;
      if (Math.abs(M[pivot][k]) < 1e-13) throw new Error('Singular axisymmetric source system.');
      if (pivot !== k) { [M[k], M[pivot]] = [M[pivot], M[k]]; [b[k], b[pivot]] = [b[pivot], b[k]]; }
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / M[k][k];
        for (let j = k + 1; j < n; j++) M[i][j] -= f * M[k][j];
        b[i] -= f * b[k];
      }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = b[i]; for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
      x[i] = sum / M[i][i];
    }
    return x;
  }
  function depolarization(a, b) {
    const e2 = 1 - (b / a) ** 2;
    if (e2 < 1e-8) return 1 / 3 - 2 * e2 / 15 - 2 * e2 * e2 / 35;
    const e = Math.sqrt(e2);
    return (1 - e2) * (Math.atanh(e) - e) / (e * e * e);
  }
  function solve(options) {
    const o = options || {}, started = Date.now();
    const geometry = o.geometry === undefined ? 'sphere' : o.geometry;
    if (!['sphere', 'prolate'].includes(geometry)) throw new Error('Supported axisymmetric geometries: sphere or prolate.');
    if (finite(o.yawDeg, 'Yaw', 0) !== 0 || finite(o.incidenceDeg, 'Incidence', 0) !== 0)
      throw new Error('Axisymmetric BEM requires axial flow: yaw and incidence must be zero.');
    if (o.cavityMode && o.cavityMode !== 'fully-wetted')
      throw new Error('Developed axisymmetric cavitation is not implemented. Select fully-wetted flow / inception indicator.');
    const radius = finite(o.radius, 'Radius', 0.05);
    const length = geometry === 'sphere' ? 2 * radius : finite(o.length, 'Length', 0.3);
    const a = length / 2, b = radius;
    if (!(Number.isFinite(length) && b > 0 && a > 0 && b <= a)) throw new Error('Use finite positive dimensions; prolate radius must not exceed half length.');
    if (geometry === 'sphere' && o.length !== undefined && Math.abs(Number(o.length) - 2 * b) > 1e-10 * b)
      throw new Error('A sphere has length = 2 x radius.');
    const n = finite(o.panels, 'Meridional panel count', 64);
    if (!Number.isInteger(n) || n < 16 || n > 512) throw new Error('Meridional panel count must be an integer from 16 to 512.');
    const speed = finite(o.speed, 'Speed', 5), density = finite(o.density, 'Density', 998.2);
    const ambientPressure = finite(o.ambientPressure, 'Ambient absolute pressure', 101325);
    const vapourPressure = finite(o.vapourPressure, 'Vapour absolute pressure', 2339);
    if (!(speed > 0 && density > 0 && ambientPressure > vapourPressure && vapourPressure >= 0))
      throw new Error('Require speed > 0, density > 0 and ambient absolute pressure > vapour pressure >= 0.');
    if (!Number.isFinite(0.5 * density * speed * speed)) throw new Error('Dynamic pressure exceeds the finite numerical range.');
    const order = finite(o.quadratureOrder, 'Quadrature order', 24);
    if (!Number.isInteger(order) || order < 8 || order > 64) throw new Error('Quadrature order must be 8 to 64.');
    const aspect = b / a, nodes = [], panels = [];
    for (let i = 0; i <= n; i++) {
      const theta = PI * i / n;
      nodes.push({ x: -Math.cos(theta), r: i === 0 || i === n ? 0 : aspect * Math.sin(theta) });
    }
    for (let i = 0; i < n; i++) {
      const q0 = nodes[i], q1 = nodes[i + 1], dx = q1.x - q0.x, dr = q1.r - q0.r;
      const L = Math.hypot(dx, dr), tx = dx / L, tr = dr / L;
      panels.push({ x: (q0.x + q1.x) / 2, r: (q0.r + q1.r) / 2, length: L,
        tx, tr, nx: -tr, nr: tx, area: 2 * PI * (q0.r + q1.r) / 2 * L });
    }
    const normal = [], tangential = [], rhs = [];
    for (let i = 0; i < n; i++) {
      normal.push(new Float64Array(n)); tangential.push(new Float64Array(n)); rhs.push(-panels[i].nx);
      for (let j = 0; j < n; j++) {
        const inf = panelInfluence(panels[i], panels[j], i === j, order);
        normal[i][j] = inf.normal + (i === j ? 0.5 : 0);
        tangential[i][j] = inf.tangent;
      }
    }
    const sigma = solveDense(normal, rhs), surface = [];
    let maxNormalResidual = 0, sourceFlux = 0, area = 0, pressureDrag = 0, minCp = Infinity;
    let symmetryError = 0;
    const Lx = depolarization(a, b), amplification = 1 / (1 - Lx);
    for (let i = 0; i < n; i++) {
      const p = panels[i]; let vn = p.nx, vt = p.tx;
      for (let j = 0; j < n; j++) { vn += normal[i][j] * sigma[j]; vt += tangential[i][j] * sigma[j]; }
      const cp = 1 - vt * vt, theta = PI * (i + 0.5) / n;
      const exactV = amplification * Math.sin(theta) / Math.hypot(Math.sin(theta), aspect * Math.cos(theta));
      maxNormalResidual = Math.max(maxNormalResidual, Math.abs(vn));
      sourceFlux += sigma[i] * p.area; area += p.area; pressureDrag -= cp * p.nx * p.area;
      minCp = Math.min(minCp, cp);
      symmetryError = Math.max(symmetryError, Math.abs(sigma[i] + sigma[n - 1 - i]));
      surface.push({ thetaRad: theta, x: p.x * a, r: p.r * a,
        tangentVelocityRatio: vt, normalVelocityResidualRatio: vn,
        cp, pressure: ambientPressure + 0.5 * density * speed * speed * cp,
        sourceDensityRatio: sigma[i], referenceCp: 1 - exactV * exactV });
    }
    const q = 0.5 * density * speed * speed, cavitationNumber = (ambientPressure - vapourPressure) / q;
    return {
      version: VERSION, model: '3D axisymmetric source-ring Neumann BEM', status: 'fully-wetted-research',
      geometry, inputs: { geometry, radius, length, panels: n, speed, density, ambientPressure, vapourPressure, yawDeg: 0, incidenceDeg: 0, quadratureOrder: order },
      nodes: nodes.map(p => ({ x: p.x * a, r: p.r * a })), surface,
      diagnostics: { maxNormalResidualRatio: maxNormalResidual,
        netSourceFluxRatio: sourceFlux / area, sourceAntisymmetryError: symmetryError,
        pressureDragCoefficient: pressureDrag / (PI * aspect * aspect), seconds: (Date.now() - started) / 1000,
        quadratureOrder: order, meridionalPanels: n, azimuthalIntegration: 'analytic complete elliptic integrals',
        exteriorNormalJump: 0.5 },
      inception: { cavitationNumber, sampledMinimumCp: minCp, sampledInceptionSigma: -minCp,
        pressureBelowVapour: minCp < -cavitationNumber,
        interpretation: 'Fully-wetted inviscid pressure criterion only; no cavity geometry, length or validated cavitation prediction.' },
      reference: { kind: 'analytic fully-wetted prolate spheroid (sphere limit included)', depolarization: Lx, equatorialSpeedRatio: amplification },
      limitations: [ 'Axial flow only; no angle of attack, yaw or swirl.',
        'Incompressible, inviscid, steady and fully wetted; no boundary layer or separated wake.',
        'No developed partial/supercavity, cavity closure, re-entrant jet or experimental cavitation validation.',
        'Pressure drag is a numerical zero-drag diagnostic, not a viscous drag prediction.',
        'Panel-centroid samples only; no invented pole samples or clipped pressure values.' ]
    };
  }
  function evaluateVelocity(result, point, order) {
    if (!result || result.version !== VERSION || !Array.isArray(result.nodes)) throw new Error('An axisymmetric solve result is required.');
    const x = finite(point && point.x, 'Field point x'), r = finite(point && point.r, 'Field point radius');
    if (r < 0) throw new Error('Field point radius must be nonnegative.');
    const a = result.inputs.length / 2, q = gauss(order || 32);
    let vx = 1, vr = 0;
    for (let j = 0; j < result.surface.length; j++) {
      const p0 = result.nodes[j], p1 = result.nodes[j + 1];
      const dx = (p1.x - p0.x) / a, dr = (p1.r - p0.r) / a;
      const L = Math.hypot(dx, dr), xm = (p1.x + p0.x) / (2 * a), rm = (p1.r + p0.r) / (2 * a);
      for (let k = 0; k < q.x.length; k++) {
        const v = ringVelocity(x / a, r / a, xm + q.x[k] * dx / 2, rm + q.x[k] * dr / 2);
        const f = q.w[k] * L / 2 * result.surface[j].sourceDensityRatio;
        vx += f * v.x; vr += f * v.r;
      }
    }
    return { x: vx * result.inputs.speed, r: vr * result.inputs.speed,
      note: 'Off-surface field evaluation; no boundary jump is added.' };
  }
  return { VERSION, solve, evaluateVelocity,
    _testing: { gauss, ellipticFromComplement, ringVelocity, panelInfluence, depolarization } };
});
