'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../axisymmetric-reference.js');
const review = path.resolve(__dirname, 'cavity-shape-reference');
const verified = JSON.parse(fs.readFileSync(path.join(review, 'semenenko-primary-relations.json'), 'utf8'));
const samples = fs.readFileSync(path.join(review, 'semenenko-equation-fixture.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
let checks = 0;
function near(actual, expected, tolerance = 3e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  checks++;
}
function good(input) { const r = R.solve(input); assert.equal(r.ok, true, JSON.stringify(r.errors)); return r; }

// Browser and CommonJS entry points must expose the same self-contained API.
const context = {Math, Number, Object, Array, TypeError, RangeError};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../axisymmetric-reference.js'), 'utf8'), context);
assert.equal(typeof context.AxisymmetricReference.solve, 'function');
assert.equal(R.source.pdfSha256, verified.source.pdf_sha256);

// Independent, source-reviewed equation samples, including both sides of the join
// and the strictly positive continuation beyond the reported Eq34 length.
for (const row of samples) {
  const [sigma, branch, x, radius] = row.split(',');
  near(R.radiusAt(+x, +sigma, branch), +radius);
}
for (const reference of verified.endpoint_diagnostics) {
  const r = good({sigma: reference.sigma});
  near(r.dimensions.LcOverRn, reference.eq34_Lc_over_Rn);
  near(r.dimensions.endpoint.rOverRn, reference.eq32_R_at_eq34_length_over_Rn);
  near(r.diagnostics.positiveZeroXOverRn, reference.eq32_positive_zero_x_over_Rn);
  near(r.diagnostics.zeroMinusReportedLengthOverRn, reference.zero_minus_reported_length_over_Rn);
  near(r.diagnostics.literalEq32Peak.xOverRn, reference.eq32_peak_x_over_Rn);
  near(r.diagnostics.literalEq32Peak.rOverRn, reference.eq32_peak_R_over_Rn);
  near(r.dimensions.RmaxOverRn, reference.eq33_Rmax_over_Rn);
  near(r.join.front.rOverRn, verified.join.eq31_R_over_Rn);
  near(r.join.main.rOverRn, verified.join.eq32_R_over_Rn);
  near(r.join.differenceOverRn, verified.join.main_minus_front_R_over_Rn);
  assert.notEqual(r.join.front.rOverRn, r.join.main.rOverRn);
  assert.equal(r.join.rescaled, false);
  assert.equal(r.profile.front.at(-1).xOverRn, r.profile.main[0].xOverRn);
  assert.equal(r.profile.main.at(-1).xOverRn, r.dimensions.LcOverRn);
  assert.ok(r.profile.main.at(-1).rOverRn > 1);
  assert.ok(r.profile.continuation.at(-1).xOverRn < r.diagnostics.positiveZeroXOverRn);
  assert.ok(r.profile.continuation.every(p => p.r > 0 && !p.physicalClosureClaim));
  assert.equal(r.diagnostics.zeroIsPhysicalClosure, false);
  assert.notEqual(r.dimensions.RmaxOverRn, r.diagnostics.literalEq32Peak.rOverRn);
  near(r.drag.CD, .82 * (1 + reference.sigma));
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
}

const base = good({pInf: 101325, pc: 2325, rho: 1000, U: Math.sqrt(2 * (101325 - 2325) / (1000 * .037)), diskRn: .01});
near(base.sigma, .037);
assert.equal(base.advancedSigmaOverride, false);
const override = good({mode: 'sigma', sigma: .044});
near(override.sigma, .044); assert.equal(override.advancedSigmaOverride, true);
assert.notEqual(override.physicalSigma, override.sigma);
const scaled = good({...base.input, diskRn: .03, mode: 'sigma'});
near(scaled.dimensions.Lc / base.dimensions.Lc, 3);
near(scaled.dimensions.Rmax / base.dimensions.Rmax, 3);
near(scaled.drag.force / base.drag.force, 9);
near(scaled.volume.envelopeSegment / base.volume.envelopeSegment, 27);

// Front antiderivative and main cubic integral, independently written. The
// Simpson comparison checks integration against radius samples, not a duplicate API.
const s = .037, lc = 4 + 3.595 / s, u = lc - 2;
const frontIntegral = (Math.pow(7, 5 / 3) - 1) / 5;
const mainIntegral = 3.659 * u + .847 / 2 * u ** 2 - .236 * s / 3 * u ** 3;
near(R.integrateRadiusSquared(0, lc, s), frontIntegral + mainIntegral);
near(R.integrateRadiusSquared(0, 1, s), (Math.pow(4, 5 / 3) - 1) / 5);
near(R.integrateRadiusSquared(1, 3, s), R.integrateRadiusSquared(1, 2, s) + R.integrateRadiusSquared(2, 3, s));
near(R.integrateRadiusSquared(0, 0, s), 0);
const n = 10000, h = (lc - 2) / n;
let simpson = 0;
for (let i = 0; i <= n; i++) {
  const radius = R.radiusAt(2 + h * i, s, 'main');
  simpson += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * radius * radius;
}
near(simpson * h / 3, mainIntegral, 1e-11);
near(base.volume.envelopeSegment, Math.PI * .01 ** 3 * (frontIntegral + mainIntegral));
assert.equal(base.volume.kind, 'envelope-segment');
assert.equal(base.volume.physicalClosedCavityVolume, false);

// Exact containment is independent of the plotting resolution. A constant-radius
// afterbody requires endpoint minima on each branch, not just a coarse sample.
const dry = good({sigma: s, diskRn: .01, sampleCount: 3, frontSamples: 2, body: {radius: .008, length: .5}});
assert.equal(dry.body.dryContained, true); near(dry.body.minimumClearance, .002);
assert.equal(dry.body.clearances.filter(p => p.xOverRn === 2).length, 2);
near(dry.volume.bodyDisplacement, Math.PI * .008 ** 2 * .5);
near(dry.volume.gasEnvelopeSegment, dry.volume.envelopeSegment - Math.PI * .008 ** 2 * .5);
const touch = good({sigma: s, body: {radius: .01, length: .01}});
assert.equal(touch.body.dryContained, true); near(touch.body.minimumClearance, 0);
const negative = good({sigma: s, body: {radius: .0101, length: .5}});
assert.equal(negative.body.dryContained, false); near(negative.body.minimumClearance, -.0001);
assert.ok(negative.body.clearances.some(p => p.clearance < 0));
assert.equal(negative.body.status, 'NEGATIVE_CLEARANCE');
assert.equal(negative.volume.gasEnvelopeSegment, null);
assert.equal(negative.volume.bodyDisplacement, null);
const outside = good({sigma: s, body: {radius: .008, length: lc * .01 + .01}});
assert.equal(outside.body.completeCoverage, false);
assert.equal(outside.body.dryContained, false);
assert.equal(outside.body.minimumClearanceCoversWholeBody, false);
assert.equal(outside.body.tipClearance, null);
assert.equal(outside.volume.gasEnvelopeSegment, null);

// Enforce the profile range even though Eq29's separate drag range is wider.
for (const input of [{sigma: .011999}, {sigma: .057001}, {sigma: .1}, {sigma: 0}, {sigma: 1.2},
  {sigma: NaN}, {sigma: Infinity}, {pInf: 2339}, {pc: -1}, {rho: 0}, {U: 0}, {diskRn: 0},
  {mode: 'sigma'}, {mode: 'other'}, {mode: 'physical', sigma: s}, {sampleCount: 5002},
  {frontSamples: 1}, {continuationSamples: -1}, {body: {radius: 0, length: 1}}, {body: {radius: .01, length: -1}},
  {diskRn: 1e200}, {U: 1e300}, {body: {radius: 1e200, length: 1e200}}]) {
  assert.equal(R.solve(input).ok, false, JSON.stringify(input));
}
assert.throws(() => R.radiusAt(lc + 10, s, 'main'), /negative squared radius/);
assert.throws(() => R.radiusAt(-1, s), /nonnegative/);
assert.throws(() => R.radiusAt(3, s, 'front'), /restricted/);
assert.throws(() => R.integrateRadiusSquared(0, lc + 1, s), /reported length/);
assert.throws(() => R.options({sigma: .1}), /fit range/);
assert.equal(good({sigma: s, continuationSamples: 0}).profile.continuation.length, 0);
console.log(`Axisymmetric reference: ${samples.length} reviewed source samples and ${checks} numeric comparisons passed; physical sigma, source endpoints, unmodified joins, dimensional scaling, exact segment volumes, signed containment failures, domain guards and browser export verified.`);
