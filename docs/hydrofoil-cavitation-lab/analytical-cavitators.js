/* Analytical cavitator correlations, not a boundary-element flow solution.
 * Semenenko (2001), ADP012080, Eqs 27-30, 35-36 and 51 (kappa=1).
 * SI coordinates: x=0 is the downstream cavitator separation plane; cone apex x<0.
 * The Eq51 main-envelope estimate is NOT a measured profile or physical closure.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AnalyticalCavitators = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const source = Object.freeze({
    title: 'Artificial Supercavitation. Physics and Calculation',
    author: 'Vladimir N. Semenenko', year: 2001,
    report: 'ADP012080; RTO-EN-010 chapter 11',
    url: 'https://apps.dtic.mil/sti/tr/pdf/ADP012080.pdf',
    mirrorUrl: 'https://archive.org/download/DTIC_ADP012080/DTIC_ADP012080.pdf',
    pdfSha256: '74c80c61579c268ec547d8b2ea078739996667873f715b1649d9d79026b3523f',
    equationPages: Object.freeze({'27-30': 'PDF 14 / printed 11-13',
      '35-36': 'PDF 16 / printed 11-15', '51': 'PDF 19 / printed 11-18'}),
    evidenceKind: 'Published asymptotic and approximation relations, evaluated as an analytical estimate; not measured samples or a BEM solution.'
  });
  const validity = Object.freeze({
    coneEq36FullApexAngleClosedIntervalDeg: Object.freeze([30, 180]),
    coneEq36DragSigmaClosedInterval: Object.freeze([0, 0.25]),
    bluntConeEq30FullApexAngleClosedIntervalDeg: Object.freeze([120, 180]),
    reichardtEq29DragSigmaOpenInterval: Object.freeze([0, 1.2]),
    garabedianMathematicalSigmaOpenInterval: Object.freeze([0, 1]),
    garabedianPublishedAsymptoticCondition: 'sigma tends to zero; no finite-sigma error tolerance or validated operating interval is supplied by Eq27.',
    envelopeCondition: 'Rmax >= separation radius; negligible gravity; axisymmetric, steady, zero incidence. Eq51 models the main slender-envelope part.',
    validatedProfile: false, experimentalQualification: false
  });
  const limitations = Object.freeze([
    'Analytical correlation mode: no BEM, pressure-field, full cone/cylinder flow, reattachment or afterbody-force solution.',
    'The generic envelope is the Eq51 main-part approximation with kappa=1, supplied with estimated dimensions. The frontal region and unstable tail are not independently resolved.',
    'Garabedian Eq27 is a disk asymptotic relation as sigma tends to zero. Its Eq28-style use with cone drag is explicitly an envelope estimate, not an experimental cone-profile qualification.',
    'Eq51 gives the separation radius at both x=0 and x=Lc. The reported volume covers this finite-radius envelope segment; no zero-radius closure is forced.',
    'Cavitator drag excludes afterbody drag, friction, gas leakage and changes caused by an afterbody.',
    'A cylindrical afterbody is assessed by geometric clearance only. Only a fully covered, nonnegative-clearance afterbody can be subtracted from envelope volume.',
    'A triangular meridional sketch means an axisymmetric cone. A two-dimensional triangular wedge is unsupported.'
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
  function supplied(o, key, fallback) { return o[key] === undefined ? fallback : o[key]; }
  function oneOf(value, list, name) {
    if (!list.includes(value)) throw new RangeError(name + ' must be one of: ' + list.join(', ') + '.');
    return value;
  }
  function plain(o, name) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new TypeError(name + ' must be an object.');
    return o;
  }
  /** Strict normalization. Refused domains are never clipped to a supported value. */
  function options(input) {
    if (input === undefined) input = {};
    plain(input, 'Options');
    const requestedShape = supplied(input, 'shape', 'disk');
    const shape = requestedShape === 'triangular' ? 'cone' : requestedShape;
    oneOf(shape, ['disk', 'cone', 'cylinder'], 'shape (a 2D wedge is unsupported)');
    if (input.dimension !== undefined && input.dimension !== 'axisymmetric') throw new RangeError('Only axisymmetric cavitators are supported; a 2D wedge is not a cone.');
    const cylinderNose = oneOf(supplied(input, 'cylinderNose', 'flat'), ['flat', 'cone'], 'cylinderNose');
    const cavitatorKind = shape === 'cone' || (shape === 'cylinder' && cylinderNose === 'cone') ? 'cone' : 'disk';
    const mode = oneOf(supplied(input, 'mode', input.sigma === undefined ? 'physical' : 'sigma'), ['physical', 'sigma'], 'mode');
    if (mode === 'physical' && input.sigma !== undefined) throw new RangeError('An explicit sigma requires mode "sigma"; omit sigma to derive it from physical inputs.');
    const pInf = positive(supplied(input, 'pInf', 101325), 'Ambient absolute pressure pInf (Pa)');
    const pc = finite(supplied(input, 'pc', 2339), 'Cavity absolute pressure pc (Pa)');
    if (pc < 0 || pc >= pInf) throw new RangeError('Cavity pressure must satisfy 0 <= pc < pInf.');
    const rho = positive(supplied(input, 'rho', 1000), 'Density rho (kg/m^3)');
    const U = positive(supplied(input, 'U', Math.sqrt(2 * (101325 - 2339) / (1000 * .037))), 'Speed U (m/s)');
    const radius = positive(supplied(input, 'radius', supplied(input, 'diskRn', .01)), 'Separation radius Rn (m)');
    if (input.radius !== undefined && input.diskRn !== undefined && input.radius !== input.diskRn) throw new RangeError('radius and diskRn disagree; specify one separation radius.');
    const dynamicPressure = positive(.5 * rho * U * U, 'Derived dynamic pressure');
    const physicalSigma = positive((pInf - pc) / dynamicPressure, 'Derived physical sigma');
    const sigma = positive(mode === 'sigma' ? input.sigma : physicalSigma, 'sigma');
    const coneAngleDeg = cavitatorKind === 'cone' ? finite(supplied(input, 'coneAngleDeg', 150), 'Full cone apex angle (degrees)') : null;
    if (cavitatorKind === 'cone' && (coneAngleDeg < 30 || coneAngleDeg > 180)) throw new RangeError('Cone full apex angle must lie in the verified Eq36 range [30, 180] degrees. The input is not clipped.');
    const dragModel = oneOf(supplied(input, 'dragModel', cavitatorKind === 'cone' ? 'semenenko-36' : 'reichardt-29'), ['semenenko-36', 'reichardt-29', 'reichardt-29-30'], 'dragModel');
    if (cavitatorKind === 'disk' && dragModel !== 'reichardt-29') throw new RangeError('A flat disk uses dragModel "reichardt-29" with CD0=0.82.');
    if (cavitatorKind === 'cone' && dragModel === 'reichardt-29') throw new RangeError('A cone requires "semenenko-36" or "reichardt-29-30"; disk drag is not reused.');
    if (dragModel === 'semenenko-36' && sigma > .25) throw new RangeError('Eq36 cone drag requires 0 <= sigma <= 0.25; positive sigma is also required by the envelope.');
    if (dragModel === 'reichardt-29-30' && coneAngleDeg < 120) throw new RangeError('Eq30 blunt-cone drag requires a full apex angle in [120, 180] degrees.');
    if (dragModel !== 'semenenko-36' && sigma >= 1.2) throw new RangeError('Eq29 drag requires 0 < sigma < 1.2.');
    const envelopeModel = oneOf(supplied(input, 'envelopeModel', 'garabedian-logvinovich'), ['garabedian-logvinovich', 'semenenko-cone-35'], 'envelopeModel');
    if (envelopeModel === 'semenenko-cone-35' && (cavitatorKind !== 'cone' || dragModel !== 'semenenko-36')) throw new RangeError('Eq35 cone dimensions require a cone and the associated Eq36 drag model.');
    if (sigma >= 1) throw new RangeError('Logarithmic cavity dimensions require 0 < sigma < 1; no log or square-root clipping is applied.');
    const sampleCount = supplied(input, 'sampleCount', 601);
    if (!Number.isInteger(sampleCount) || sampleCount < 3 || sampleCount > 5001) throw new RangeError('sampleCount must be an integer from 3 through 5001.');
    let body = null;
    if (shape === 'cylinder') {
      const b = input.body === undefined ? {} : plain(input.body, 'Cylinder afterbody');
      body = {radius: positive(supplied(b, 'radius', radius), 'Afterbody radius (m)'),
        length: positive(supplied(b, 'length', supplied(input, 'cylinderLength', .2)), 'Afterbody length from the separation plane (m)')};
    } else if (input.body !== undefined && input.body !== null && input.body !== false) {
      plain(input.body, 'Afterbody');
      body = {radius: positive(input.body.radius, 'Afterbody radius (m)'), length: positive(input.body.length, 'Afterbody length (m)')};
    }
    return {shape, requestedShape, dimension: 'axisymmetric', cavitatorKind, cylinderNose,
      coneAngleDeg, mode, pInf, pc, rho, U, radius, diskRn: radius,
      dynamicPressure, physicalSigma, sigma, dragModel, envelopeModel, sampleCount, body};
  }
  function dragFromOptions(o) {
    let CD0, CD, equation, alpha = null;
    if (o.dragModel === 'semenenko-36') {
      alpha = o.coneAngleDeg / 360; // alpha*pi is the cone half angle.
      CD0 = .5 + 1.81 * (alpha - .25) - 2 * (alpha - .25) ** 2;
      CD = CD0 + (.524 + .672 * alpha) * o.sigma;
      equation = '36';
    } else {
      CD0 = o.cavitatorKind === 'disk' ? .82 : .13 + Math.sqrt(.0036 * o.coneAngleDeg - .1719);
      CD = CD0 * (1 + o.sigma);
      equation = o.cavitatorKind === 'disk' ? '29' : '29-30';
    }
    const area = positive(Math.PI * o.radius ** 2, 'Reference area');
    return {CD0: positive(CD0, 'CD0'), CD: positive(CD, 'CD'),
      force: positive(CD * o.dynamicPressure * area, 'Cavitator drag force'),
      dynamicPressure: o.dynamicPressure, referenceArea: area,
      alpha, fullApexAngleDeg: o.coneAngleDeg, equation, model: o.dragModel,
      withinPublishedDragDomain: true, experimentalQualification: false,
      includesAfterbody: false,
      interpretation: 'Published cavitator drag approximation using projected separation area pi*Rn^2; no afterbody force or experimental accuracy pass.'};
  }
  function envelopeFromOptions(o, drag) {
    let M2, L, coefficient;
    const s = o.sigma, log = positive(Math.log(1 / s), 'ln(1/sigma)');
    if (o.envelopeModel === 'semenenko-cone-35') {
      const alpha = o.coneAngleDeg / 360;
      coefficient = (1 + 50 * s) / (1 + 56.2 * s);
      M2 = drag.CD / (coefficient * s);
      L = 2 * (1.1 / s - 4 * (1 - 2 * alpha) / (1 + 144 * alpha ** 2)) * Math.sqrt(drag.CD * log);
    } else {
      coefficient = 1;
      M2 = drag.CD / s;
      L = 2 * Math.sqrt(drag.CD * log) / s;
    }
    positive(L, 'Estimated Lc/Rn'); finite(M2, 'Estimated Rmax^2/Rn^2');
    if (M2 < 1) throw new RangeError('Estimated Rmax is smaller than the separation radius; Eq51 expanding-envelope geometry is inadmissible. No radius clipping is applied.');
    return {LcOverRn: L, RmaxOverRn: Math.sqrt(M2), rMaxSquaredOverRn2: M2,
      kappa: 1, dimensionCorrection: coefficient, model: o.envelopeModel,
      dimensionEquations: o.envelopeModel === 'semenenko-cone-35' ? '35-36' : o.cavitatorKind === 'disk' ? '27 with Eq29 empirical CD' : '27-28 asymptotic structure with cone CD',
      profileEquation: '51 with kappa=1', sourceAccuracyBoundAvailable: false};
  }
  function checkedEnvelope(e) {
    plain(e, 'Envelope geometry'); positive(e.LcOverRn, 'Lc/Rn');
    positive(e.RmaxOverRn, 'Rmax/Rn');
    if (e.RmaxOverRn < 1) throw new RangeError('Rmax/Rn must be at least one.');
    return e;
  }
  /** Eq51, kappa=1. Deliberately limited to its finite-radius segment [0,Lc]. */
  function envelopeRadiusAt(xOverRn, e) {
    finite(xOverRn, 'x/Rn'); checkedEnvelope(e);
    if (xOverRn < 0 || xOverRn > e.LcOverRn) throw new RangeError('Envelope station requires 0 <= x/Rn <= Lc/Rn; no continuation, clipping or physical closure is inferred.');
    const M2 = e.RmaxOverRn ** 2;
    const squared = xOverRn === 0 || xOverRn === e.LcOverRn ? 1 : M2 - (M2 - 1) * (1 - 2 * xOverRn / e.LcOverRn) ** 2;
    if (squared < 0) throw new RangeError('Negative squared envelope radius; no square-root clipping is applied.');
    return finite(Math.sqrt(squared), 'Envelope radius');
  }
  function integrateEnvelopeRadiusSquared(a, b, e) {
    finite(a, 'Integration start'); finite(b, 'Integration end'); checkedEnvelope(e);
    if (a < 0 || b < a || b > e.LcOverRn) throw new RangeError('Envelope integral requires 0 <= start <= end <= Lc/Rn.');
    const L = e.LcOverRn, M2 = e.RmaxOverRn ** 2;
    function primitive(x) { return x + (M2 - 1) * (2 * x ** 2 / L - 4 * x ** 3 / (3 * L ** 2)); }
    return finite(primitive(b) - primitive(a), 'Integrated squared envelope radius');
  }
  function point(xOverRn, o, e) {
    const rOverRn = envelopeRadiusAt(xOverRn, e), r = rOverRn * o.radius;
    return {xOverRn, rOverRn, rSquaredOverRn2: rOverRn ** 2, x: xOverRn * o.radius,
      r, crossSectionArea: Math.PI * r ** 2, branch: 'eq51_kappa1_main_estimate',
      physicalClosureClaim: false};
  }
  function geometry(o) {
    const length = o.cavitatorKind === 'cone' && o.coneAngleDeg !== 180
      ? positive(o.radius / Math.tan(o.coneAngleDeg * Math.PI / 360), 'Cone nose length') : 0;
    return {dimension: 'axisymmetric', shape: o.shape, cavitatorKind: o.cavitatorKind,
      interpretation: o.cavitatorKind === 'cone' ? 'Axisymmetric cone; a triangular meridional sketch is not a 2D wedge.' : 'Flat circular disk cavitator.',
      separationPlaneX: 0, radius: o.radius, fullApexAngleDeg: o.coneAngleDeg,
      noseLength: length, apexX: length === 0 ? 0 : -length,
      cavitatorProfile: o.cavitatorKind === 'cone' && length > 0
        ? [{x: -length, r: 0}, {x: 0, r: o.radius}]
        : [{x: 0, r: 0}, {x: 0, r: o.radius}],
      noseSolidVolume: o.cavitatorKind === 'cone' ? Math.PI * o.radius ** 2 * length / 3 : 0,
      noseVolumeSubtractedFromEnvelope: false,
      afterbodyStartX: o.body ? 0 : null, cylinderLengthMeans: 'Cylindrical afterbody length from x=0; excludes any cone nose.'};
  }
  function containedBody(o, e) {
    if (!o.body) return null;
    const body = o.body, n = positive(body.length / o.radius, 'Normalized body length');
    const end = Math.min(n, e.LcOverRn); // Domain intersection only; the uncovered length is retained and refused.
    const candidates = [point(0, o, e), point(end, o, e)].map(p => Object.assign(p,
      {clearance: p.r - body.radius, clearanceOverRn: p.rOverRn - body.radius / o.radius}));
    const limiting = candidates.reduce((a, b) => b.clearance < a.clearance ? b : a);
    const completeCoverage = n <= e.LcOverRn;
    const dryContained = completeCoverage && limiting.clearance >= 0;
    return {radius: body.radius, length: body.length, start: 0, radiusOverRn: body.radius / o.radius,
      lengthOverRn: n, evaluatedLength: end * o.radius, evaluatedLengthOverRn: end,
      uncoveredLength: completeCoverage ? 0 : body.length - e.LcOverRn * o.radius,
      completeCoverage, dryContained,
      status: !completeCoverage ? 'OUTSIDE_ESTIMATED_ENVELOPE' : dryContained ? 'GEOMETRIC_CONTAINMENT_ESTIMATED' : 'NEGATIVE_CLEARANCE',
      minimumClearance: limiting.clearance, minimumClearanceOverRn: limiting.clearanceOverRn,
      minimumClearanceCoversWholeBody: completeCoverage, limitingPoint: limiting, clearances: candidates,
      tipClearance: completeCoverage ? candidates[1].clearance : null,
      bodyVolume: positive(Math.PI * body.radius ** 2 * body.length, 'Body volume'),
      displacementSubtracted: dryContained,
      exactMinimumMethod: 'Eq51 kappa=1 has concave R^2. Its radius minimum on a closed interval lies at an endpoint; independent of plotting resolution.',
      fullCylinderFlowSolved: false, experimentalQualification: false,
      interpretation: 'Flat disk-headed or conical-nose cylindrical afterbody. Signed clearance is geometric only; no full cylinder flow, wetted reattachment, gas leakage or body force is solved.'};
  }
  function assertFiniteData(value) {
    if (typeof value === 'number') finite(value, 'Derived result');
    else if (Array.isArray(value)) value.forEach(assertFiniteData);
    else if (value && typeof value === 'object') Object.keys(value).forEach(k => assertFiniteData(value[k]));
  }
  function drag(input) { return dragFromOptions(options(input)); }
  function solve(input) {
    try {
      const o = options(input), d = dragFromOptions(o), e = envelopeFromOptions(o, d);
      const main = [];
      for (let i = 0; i < o.sampleCount; i++) main.push(point(i === o.sampleCount - 1 ? e.LcOverRn : e.LcOverRn * i / (o.sampleCount - 1), o, e));
      const body = containedBody(o, e), endpoint = main[main.length - 1];
      const integral = integrateEnvelopeRadiusSquared(0, e.LcOverRn, e);
      const volume = positive(Math.PI * o.radius ** 3 * integral, 'Envelope segment volume');
      const displacement = body && body.dryContained ? body.bodyVolume : null;
      const aspectRatio = e.LcOverRn / (2 * e.RmaxOverRn);
      const warnings = ['This is an estimated main envelope, without measured-profile or experimental accuracy qualification.'];
      if (aspectRatio < 3) warnings.push('Estimated length/maximum diameter is below 3: the slender-envelope assumption is weak. No accuracy bound is supplied.');
      if (o.envelopeModel === 'garabedian-logvinovich') warnings.push('Garabedian dimensions are asymptotic as sigma tends to zero; finite-sigma algebraic admissibility is not a verified accuracy range.');
      const result = {
        ok: true, status: 'ANALYTICAL_ESTIMATE_EVALUATED', errors: [],
        model: 'Analytical cavitator correlations with Logvinovich main-envelope estimate',
        input: o, sigma: o.sigma, sigmaMode: o.mode, physicalSigma: o.physicalSigma,
        advancedSigmaOverride: o.mode === 'sigma',
        source, validity, limitations, warnings, geometry: geometry(o), drag: d,
        admission: {algebraicallyAdmissible: true, publishedDragDomainSatisfied: true,
          profileValidated: false, experimentalQualification: false, BEMSolution: false,
          shapeIsAxisymmetric: true, gravityNeglected: true, finiteSigmaAccuracyBoundAvailable: false},
        units: {x: 'm', r: 'm', pressure: 'Pa absolute', rho: 'kg/m^3', U: 'm/s', crossSectionArea: 'm^2', volume: 'm^3', force: 'N', clearance: 'm'},
        profile: {main, front: [], continuation: [], kind: 'source-main-envelope-estimate',
          validated: false, experimentalSamples: false, empiricalValidationPass: false,
          physicalClosureClaim: false, equation: '51', kappa: 1,
          interpretation: 'Eq51 main-part approximation with estimated dimensions. Frontal and unstable closure regions are not independently solved. Raw finite-radius endpoint is retained.'},
        dimensions: Object.assign({}, e, {Lc: e.LcOverRn * o.radius,
          Rmax: e.RmaxOverRn * o.radius, maximumCrossSectionArea: Math.PI * (e.RmaxOverRn * o.radius) ** 2,
          endpoint, endpointIsPhysicalClosure: false, estimatedAspectRatio: aspectRatio}),
        volume: {kind: 'estimated-envelope-segment', envelopeSegment: volume,
          normalizedIntegralR2: integral, normalizedEnvelopeSegment: Math.PI * integral,
          bodyDisplacement: displacement,
          gasEnvelopeSegment: !body ? volume : body.dryContained ? volume - body.bodyVolume : null,
          bodySubtracted: Boolean(body && body.dryContained), physicalClosedCavityVolume: false,
          endpointRadius: endpoint.r, exactForDisplayedEnvelope: true,
          interpretation: 'Exact integral of the estimated Eq51 kappa=1 segment: pi*Lc*(2*Rmax^2+Rn^2)/3. This exact geometry integral is not a validation of physical cavity volume.'},
        body
      };
      assertFiniteData(result);
      return result;
    } catch (error) {
      return {ok: false, status: 'REJECTED', errors: [error.message], model: 'Analytical cavitator correlation estimate',
        source, validity, physicalClosureClaim: false, experimentalQualification: false};
    }
  }
  return Object.freeze({options, solve, drag, envelopeRadiusAt, integrateEnvelopeRadiusSquared, source, validity, limitations});
});

