/* Semenenko (2001), Eqs 29 and 31-34: bounded semiempirical disk reference.
 * Raw rounded relations are retained. This is not a BEM or measured dataset.
 * SI inputs; x/Rn starts at the downstream disk plane. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AxisymmetricReference = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const MIN_SIGMA = 0.012, MAX_SIGMA = 0.057, JOIN = 2;
  const A = 3.659, B = 0.847, C = 0.236;
  const source = Object.freeze({
    title: 'Artificial Supercavitation. Physics and Calculation',
    author: 'Vladimir N. Semenenko', year: 2001,
    report: 'ADP012080; RTO-EN-010 chapter 11',
    url: 'https://apps.dtic.mil/sti/tr/pdf/ADP012080.pdf',
    mirrorUrl: 'https://archive.org/download/DTIC_ADP012080/DTIC_ADP012080.pdf',
    pdfSha256: '74c80c61579c268ec547d8b2ea078739996667873f715b1649d9d79026b3523f',
    profileEquations: '31-34', profilePdfPage: 15, profilePrintedPage: '11-14',
    dragEquation: '29', dragPdfPage: 14, dragPrintedPage: '11-13',
    evidenceKind: 'Semiempirical reference equations; not raw experimental samples or an exact numerical solution.'
  });
  const validity = Object.freeze({
    profileSigmaClosedInterval: Object.freeze([MIN_SIGMA, MAX_SIGMA]),
    dragSigmaOpenInterval: Object.freeze([0, 1.2]),
    neglectsGravity: true,
    geometry: 'Natural vapor supercavity behind a disk; disk radius Rn, coordinate x/Rn from its downstream plane.'
  });
  const limitations = Object.freeze([
    'Semiempirical disk reference, not a BEM solution or digitized experimental profile.',
    'Profile fit is restricted to 0.012 <= sigma <= 0.057 and assumes negligible gravity.',
    'The two rounded radii at x/Rn = 2 are retained separately, without matching or smoothing.',
    'Eq34 reports a finite-radius endpoint; the Eq32 polynomial zero is only an algebraic diagnostic, not verified physical closure.',
    'Volume up to Eq34 is an envelope-segment volume, not a validated closed-cavity volume.',
    'A dry cylindrical afterbody check is geometric containment only; wetted cylinder flow, reattachment, gas leakage and body forces are not solved.'
  ]);

  function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(name + ' must be a finite number.');
    return value;
  }
  function positive(value, name) {
    finite(value, name);
    if (value <= 0) throw new RangeError(name + ' must be positive.');
    return value;
  }
  function sigmaInFit(sigma) {
    finite(sigma, 'sigma');
    if (sigma < MIN_SIGMA || sigma > MAX_SIGMA) throw new RangeError('Profile sigma must lie in the verified fit range [0.012, 0.057]; no extrapolation is applied.');
    return sigma;
  }
  function count(value, name, low, high) {
    if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(name + ' must be an integer from ' + low + ' through ' + high + '.');
    return value;
  }
  function supplied(input, key, fallback) { return input[key] === undefined ? fallback : input[key]; }

  /** Normalize and validate inputs. Explicit sigma selects advanced mode unless mode is supplied. */
  function options(input) {
    if (input === undefined) input = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Options must be an object.');
    const mode = supplied(input, 'mode', input.sigma === undefined ? 'physical' : 'sigma');
    if (mode !== 'physical' && mode !== 'sigma') throw new RangeError('mode must be "physical" or "sigma".');
    if (mode === 'physical' && input.sigma !== undefined) throw new RangeError('An explicit sigma requires advanced mode "sigma"; omit sigma to compute it from physical inputs.');
    const pInf = positive(supplied(input, 'pInf', 101325), 'Ambient absolute pressure pInf (Pa)');
    const pc = finite(supplied(input, 'pc', 2339), 'Cavity absolute pressure pc (Pa)');
    if (pc < 0 || pc >= pInf) throw new RangeError('Cavity pressure must satisfy 0 <= pc < pInf.');
    const rho = positive(supplied(input, 'rho', 1000), 'Density rho (kg/m^3)');
    const U = positive(supplied(input, 'U', Math.sqrt(2 * (101325 - 2339) / (1000 * 0.037))), 'Speed U (m/s)');
    const diskRn = positive(supplied(input, 'diskRn', 0.01), 'Disk radius Rn (m)');
    const dynamicPressure = positive(0.5 * rho * U * U, 'Derived dynamic pressure (Pa)');
    const physicalSigma = positive((pInf - pc) / dynamicPressure, 'Derived physical sigma');
    const sigma = sigmaInFit(mode === 'sigma' ? finite(input.sigma, 'Advanced sigma') : physicalSigma);
    const sampleCount = count(supplied(input, 'sampleCount', 601), 'sampleCount', 3, 5001);
    const frontSamples = count(supplied(input, 'frontSamples', 81), 'frontSamples', 2, 1001);
    const continuationSamples = count(supplied(input, 'continuationSamples', 80), 'continuationSamples', 0, 1001);
    let body = null;
    if (input.body !== undefined && input.body !== null && input.body !== false) {
      if (typeof input.body !== 'object' || Array.isArray(input.body)) throw new TypeError('body must be {radius, length}, or null.');
      body = {
        radius: positive(input.body.radius, 'Afterbody radius (m)'),
        length: positive(input.body.length, 'Afterbody length (m)')
      };
    }
    return {mode, pInf, pc, rho, U, diskRn, dynamicPressure, physicalSigma, sigma, sampleCount, frontSamples, continuationSamples, body};
  }

  function mainSquared(x, sigma) {
    const u = x - JOIN;
    return A + B * u - C * sigma * u * u;
  }
  function reportedLength(sigma) { return 4 + 3.595 / sigma; }
  function positiveZero(sigma) { return JOIN + (B + Math.sqrt(B * B + 4 * C * sigma * A)) / (2 * C * sigma); }

  /** Dimensionless radius. At the rounded join, choose front or main explicitly.
   * Main evaluations beyond Eq34 are algebraic continuation only. No radicand clipping. */
  function radiusAt(xOverRn, sigma, branch) {
    finite(xOverRn, 'x/Rn'); sigmaInFit(sigma);
    if (xOverRn < 0) throw new RangeError('x/Rn must be nonnegative.');
    if (branch === undefined || branch === 'auto') branch = xOverRn < JOIN ? 'front' : 'main';
    if (branch === 'front' || branch === 'eq31_front') {
      if (xOverRn > JOIN) throw new RangeError('The composed Eq31 front branch is restricted to 0 <= x/Rn <= 2.');
      return Math.cbrt(1 + 3 * xOverRn);
    }
    if (branch !== 'main' && branch !== 'eq32_main' && branch !== 'eq32_main_to_eq34_length' && branch !== 'eq32_algebraic_continuation') throw new RangeError('Unknown profile branch.');
    if (xOverRn < JOIN) throw new RangeError('The Eq32 main branch requires x/Rn >= 2.');
    const squared = mainSquared(xOverRn, sigma);
    if (squared < 0) throw new RangeError('Eq32 has a negative squared radius at this station; no square-root clipping or forced closure is applied.');
    return finite(Math.sqrt(squared), 'Eq32 radius');
  }

  function frontIntegral(x) { return (Math.pow(1 + 3 * x, 5 / 3) - 1) / 5; }
  function mainIntegral(x, sigma) {
    const u = x - JOIN;
    return A * u + B * u * u / 2 - C * sigma * u * u * u / 3;
  }
  /** Exact integral of (R/Rn)^2 d(x/Rn) within the reported Eq34 segment. */
  function integrateRadiusSquared(a, b, sigma) {
    finite(a, 'Integration start x/Rn'); finite(b, 'Integration end x/Rn'); sigmaInFit(sigma);
    if (a < 0 || b < a || b > reportedLength(sigma)) throw new RangeError('Integration requires 0 <= start <= end <= the Eq34 reported length.');
    if (a === b) return 0;
    let result = 0;
    if (a < JOIN) result += frontIntegral(Math.min(b, JOIN)) - frontIntegral(a);
    if (b > JOIN) result += mainIntegral(b, sigma) - mainIntegral(Math.max(a, JOIN), sigma);
    return finite(result, 'Integrated squared radius');
  }

  function point(xOverRn, sigma, rn, branch) {
    const rOverRn = radiusAt(xOverRn, sigma, branch);
    const r = rOverRn * rn;
    return {xOverRn, rOverRn, rSquaredOverRn2: rOverRn * rOverRn,
      x: xOverRn * rn, r, crossSectionArea: Math.PI * r * r, branch,
      isReportedLength: branch === 'eq32_main_to_eq34_length' && xOverRn === reportedLength(sigma),
      physicalClosureClaim: false};
  }
  function sample(a, b, n, sigma, rn, branch) {
    const points = [];
    for (let i = 0; i < n; i++) points.push(point(i === n - 1 ? b : a + (b - a) * i / (n - 1), sigma, rn, branch));
    return points;
  }

  function containedBody(body, sigma, rn, lc) {
    if (!body) return null;
    const lengthOverRn = finite(body.length / rn, 'Normalized afterbody length');
    const radiusOverRn = finite(body.radius / rn, 'Normalized afterbody radius');
    const end = Math.min(lengthOverRn, lc), candidates = [];
    function candidate(x, branch) {
      const p = point(x, sigma, rn, branch);
      candidates.push(Object.assign(p, {clearance: p.r - body.radius, clearanceOverRn: p.rOverRn - radiusOverRn}));
    }
    candidate(0, 'eq31_front');
    candidate(Math.min(end, JOIN), 'eq31_front');
    if (end >= JOIN) {
      candidate(JOIN, 'eq32_main_to_eq34_length');
      if (end > JOIN) candidate(end, 'eq32_main_to_eq34_length');
    }
    // Eq31 is increasing. Eq32 R^2 is concave; its minimum on each closed
    // subinterval occurs at an endpoint. Both rounded join values are tested.
    const limiting = candidates.reduce((a, b) => b.clearance < a.clearance ? b : a);
    const completeCoverage = lengthOverRn <= lc;
    const dryContained = completeCoverage && limiting.clearance >= 0;
    const bodyVolume = Math.PI * body.radius * body.radius * body.length;
    return {
      radius: body.radius, length: body.length, radiusOverRn, lengthOverRn, start: 0,
      completeCoverage, evaluatedLength: end * rn,
      evaluatedLengthOverRn: end, dryContained,
      status: !completeCoverage ? 'OUTSIDE_REPORTED_ENVELOPE' : dryContained ? 'DRY_CONTAINMENT_SUPPORTED' : 'NEGATIVE_CLEARANCE',
      minimumClearance: limiting.clearance, minimumClearanceOverRn: limiting.clearanceOverRn,
      minimumClearanceCoversWholeBody: completeCoverage, limitingPoint: limiting, clearances: candidates,
      tipClearance: completeCoverage ? candidates[candidates.length - 1].clearance : null,
      bodyVolume, displacementSubtracted: dryContained,
      exactMinimumMethod: 'Increasing Eq31 and concave Eq32 squared radius: endpoint minima, including both rounded join values.',
      interpretation: 'Disk-headed cylinder starting at x=0. Geometric dry-containment check only; no wetted cylinder flow, gas leakage, reattachment or body force is solved.'
    };
  }

  function assertFiniteData(value) {
    if (typeof value === 'number') finite(value, 'Derived result');
    else if (Array.isArray(value)) value.forEach(assertFiniteData);
    else if (value && typeof value === 'object') Object.keys(value).forEach(key => assertFiniteData(value[key]));
  }

  /** Synchronous, JSON-serializable calculation. Invalid input is a rejected result. */
  function solve(input) {
    try {
      const o = options(input), s = o.sigma, rn = o.diskRn, lc = reportedLength(s);
      const zero = positiveZero(s), peakX = JOIN + B / (2 * C * s);
      const endpoint = point(lc, s, rn, 'eq32_main_to_eq34_length');
      const frontJoin = point(JOIN, s, rn, 'eq31_front');
      const mainJoin = point(JOIN, s, rn, 'eq32_main_to_eq34_length');
      const peak = point(peakX, s, rn, 'eq32_main_to_eq34_length');
      const rmax = Math.sqrt(A + 0.761 / s), CD = 0.82 * (1 + s);
      const front = sample(0, JOIN, o.frontSamples, s, rn, 'eq31_front');
      const main = sample(JOIN, lc, o.sampleCount, s, rn, 'eq32_main_to_eq34_length');
      // Stop strictly before the algebraic zero, so its metadata never becomes a
      // manufactured zero-radius sample or a purported physical closure.
      const continuation = [];
      for (let i = 1; i <= o.continuationSamples; i++) continuation.push(point(lc + (zero - lc) * i / (o.continuationSamples + 1), s, rn, 'eq32_algebraic_continuation'));
      const body = containedBody(o.body, s, rn, lc);
      const integral = integrateRadiusSquared(0, lc, s), envelopeSegment = Math.PI * rn * rn * rn * integral;
      const bodyDisplacement = body && body.dryContained ? body.bodyVolume : null;
      const result = {
        ok: true, status: 'REFERENCE_EVALUATED', errors: [], model: 'Semenenko 2001 disk semiempirical reference',
        input: o, sigma: s, sigmaMode: o.mode, physicalSigma: o.physicalSigma,
        advancedSigmaOverride: o.mode === 'sigma',
        advancedSigmaNote: o.mode === 'sigma' ? 'Explicit advanced sigma controls the reference. Physical pressures remain displayed; their derived sigma is reported separately.' : null,
        source, validity, limitations,
        units: {x: 'm', r: 'm', pressure: 'Pa absolute', rho: 'kg/m^3', U: 'm/s', crossSectionArea: 'm^2', volume: 'm^3', force: 'N', clearance: 'm'},
        profile: {front, main, continuation,
          samplePolicy: 'Raw equation evaluations; separate rounded join values; finite Eq34 endpoint; continuation stops before the algebraic zero.',
          experimentalSamples: false, physicalClosureClaim: false},
        join: {xOverRn: JOIN, x: JOIN * rn, front: frontJoin, main: mainJoin,
          differenceOverRn: mainJoin.rOverRn - frontJoin.rOverRn, difference: mainJoin.r - frontJoin.r,
          rescaled: false, smoothed: false},
        dimensions: {LcOverRn: lc, Lc: lc * rn, RmaxOverRn: rmax, Rmax: rmax * rn,
          maximumCrossSectionArea: Math.PI * rmax * rn * rmax * rn,
          lengthEquation: '34', radiusEquation: '33', endpoint,
          endpointIsPhysicalClosure: false},
        diagnostics: {literalEq32Peak: peak,
          literalEq32PeakCoefficient: B * B / (4 * C), eq33Coefficient: 0.761,
          positiveZeroXOverRn: zero, positiveZeroX: zero * rn,
          zeroMinusReportedLengthOverRn: zero - lc, zeroMinusReportedLength: (zero - lc) * rn,
          zeroIsPhysicalClosure: false, roundedRadiusDifferenceOverRn: rmax - peak.rOverRn},
        drag: {CD, force: CD * o.dynamicPressure * Math.PI * rn * rn,
          dynamicPressure: o.dynamicPressure, referenceArea: Math.PI * rn * rn,
          equation: '29', sigmaOpenInterval: [0, 1.2], withinPublishedRange: s > 0 && s < 1.2,
          interpretation: 'Approximate empirical disk-cavitator drag; no afterbody drag or experimental accuracy pass.'},
        volume: {kind: 'envelope-segment', envelopeSegment, normalizedIntegralR2: integral,
          normalizedEnvelopeSegment: Math.PI * integral, frontIntegralR2: frontIntegral(JOIN),
          mainIntegralR2: mainIntegral(lc, s), bodyDisplacement,
          gasEnvelopeSegment: !body ? envelopeSegment : body.dryContained ? envelopeSegment - body.bodyVolume : null,
          bodySubtracted: Boolean(body && body.dryContained), endpointRadius: endpoint.r,
          physicalClosedCavityVolume: false,
          interpretation: 'Exact antiderivative of pi*R(x)^2 from the disk to Eq34 length. Finite endpoint: envelope segment, not a closed-cavity volume. Body displacement is subtracted only for fully contained specified cylinders.'},
        body
      };
      assertFiniteData(result);
      return result;
    } catch (error) {
      return {ok: false, status: 'REJECTED', errors: [error.message], source, validity,
        model: 'Semenenko 2001 disk semiempirical reference', physicalClosureClaim: false};
    }
  }

  return Object.freeze({options, solve, radiusAt, integrateRadiusSquared, source, validity});
});
