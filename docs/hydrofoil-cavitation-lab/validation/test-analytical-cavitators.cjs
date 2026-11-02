'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const A = require('../analytical-cavitators.js');
let comparisons = 0, refusals = 0;
function near(a, b, tolerance = 3e-12) {
  assert.ok(Number.isFinite(a) && Number.isFinite(b));
  assert.ok(Math.abs(a - b) <= tolerance * Math.max(Math.abs(b), 1), a + ' != ' + b);
  comparisons++;
}
function good(o) {
  const r = A.solve(o);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.status, 'ANALYTICAL_ESTIMATE_EVALUATED');
  return r;
}
function bad(o, pattern) {
  const r = A.solve(o);
  assert.equal(r.ok, false, JSON.stringify(o));
  assert.equal(r.status, 'REJECTED');
  assert.ok(pattern.test(r.errors.join(' ')), r.errors.join(' '));
  assert.equal(r.profile, undefined);
  refusals++;
}
// Browser/CommonJS parity, input immutability, and serialization.
const context = {Math, Number, Object, Array, TypeError, RangeError};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../analytical-cavitators.js'), 'utf8'), context);
assert.equal(typeof context.AnalyticalCavitators.solve, 'function');
near(context.AnalyticalCavitators.solve({shape: 'cone', sigma: .037}).drag.CD, A.solve({shape: 'cone', sigma: .037}).drag.CD);
const request = {shape: 'cylinder', sigma: .037, radius: .01, body: {radius: .008, length: .3}};
const unchanged = JSON.stringify(request), base = good(request);
assert.equal(JSON.stringify(request), unchanged);
assert.deepEqual(JSON.parse(JSON.stringify(base)), base);

// Eq36 uses alpha*pi as HALF angle: alpha = full apex degrees / 360.
// These independently reduced values exercise the end points and three interiors.
const fixture = [
  {angle: 30, CD0: .14277777777777778, slope: .58, CD: .1642377777777778},
  {angle: 90, CD0: .5, slope: .692, CD: .525604},
  {angle: 120, CD0: .6369444444444444, slope: .748, CD: .6646204444444444},
  {angle: 150, CD0: .7461111111111112, slope: .804, CD: .7758591111111112},
  {angle: 180, CD0: .8275, slope: .86, CD: .85932}
];
for (const f of fixture) {
  const r = good({shape: 'cone', coneAngleDeg: f.angle, sigma: .037});
  near(r.drag.CD0, f.CD0); near(r.drag.CD, f.CD);
  near(good({shape: 'cone', coneAngleDeg: f.angle, sigma: .25}).drag.CD, f.CD0 + .25 * f.slope);
  near(r.drag.alpha, f.angle / 360);
  near(r.drag.referenceArea, Math.PI * .01 ** 2);
  near(r.drag.force, r.drag.CD * .5 * r.input.rho * r.input.U ** 2 * Math.PI * .01 ** 2);
  assert.equal(r.drag.equation, '36');
}
for (const [angle, zero] of [[120, .64], [180, .82]]) {
  const r = good({shape: 'cone', coneAngleDeg: angle, sigma: .037, dragModel: 'reichardt-29-30'});
  near(r.drag.CD0, zero); near(r.drag.CD, zero * 1.037);
}
// Distinct published calibrations retain their small disk-limit mismatch.
assert.notEqual(good({shape: 'cone', coneAngleDeg: 180, sigma: .037}).drag.CD,
  good({shape: 'disk', sigma: .037}).drag.CD);
const cone = good({shape: 'cone', coneAngleDeg: 90, sigma: .037});
near(cone.geometry.noseLength, .01);
near(cone.geometry.apexX, -.01);
near(cone.geometry.noseSolidVolume, Math.PI * .01 ** 3 / 3);
assert.equal(cone.geometry.separationPlaneX, 0);
assert.equal(cone.geometry.noseVolumeSubtractedFromEnvelope, false);
near(good({shape: 'cone', coneAngleDeg: 180, sigma: .037}).geometry.noseLength, 0);
near(good({shape: 'triangular', coneAngleDeg: 90, sigma: .037}).drag.CD, cone.drag.CD);
const physical = good({shape: 'cone', coneAngleDeg: 90, rho: 1000, pInf: 101325, pc: 2325, U: Math.sqrt(2 * 99000 / (1000 * .037))});
near(physical.sigma, .037); assert.equal(physical.advancedSigmaOverride, false);
assert.equal(cone.advancedSigmaOverride, true);

// Garabedian-style dimensions and the primary Eq35 alternative.
for (const r of [base, cone, good({shape: 'disk', sigma: .012})]) {
  near(r.dimensions.RmaxOverRn, Math.sqrt(r.drag.CD / r.sigma));
  near(r.dimensions.LcOverRn, 2 * Math.sqrt(r.drag.CD * Math.log(1 / r.sigma)) / r.sigma);
  const e = r.dimensions, L = e.LcOverRn, M = e.RmaxOverRn;
  near(A.envelopeRadiusAt(0, e), 1);
  near(A.envelopeRadiusAt(L, e), 1);
  near(A.envelopeRadiusAt(L / 2, e), M);
  near(A.envelopeRadiusAt(.13 * L, e), A.envelopeRadiusAt(.87 * L, e));
  // Independent Simpson integration from point evaluations.
  const n = 2000, h = L / n;
  let simpson = 0;
  for (let i = 0; i <= n; i++) {
    const y = A.envelopeRadiusAt(i === n ? L : h * i, e);
    simpson += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * y ** 2;
  }
  near(A.integrateEnvelopeRadiusSquared(0, L, e), simpson * h / 3, 1e-11);
  near(r.volume.envelopeSegment, Math.PI * r.dimensions.Lc * (2 * r.dimensions.Rmax ** 2 + r.input.radius ** 2) / 3);
  near(A.integrateEnvelopeRadiusSquared(0, .3 * L, e) + A.integrateEnvelopeRadiusSquared(.3 * L, L, e), A.integrateEnvelopeRadiusSquared(0, L, e));
  assert.equal(r.profile.kind, 'source-main-envelope-estimate');
  assert.equal(r.profile.validated, false);
  assert.equal(r.profile.empiricalValidationPass, false);
  assert.equal(r.profile.physicalClosureClaim, false);
  assert.equal(r.admission.BEMSolution, false);
  assert.equal(r.admission.experimentalQualification, false);
  assert.equal(r.volume.physicalClosedCavityVolume, false);
  near(r.profile.main.at(-1).r, r.input.radius);
}
const c35 = good({shape: 'cone', coneAngleDeg: 90, sigma: .037, envelopeModel: 'semenenko-cone-35'});
const k35 = (1 + 50 * .037) / (1 + 56.2 * .037);
near(c35.dimensions.RmaxOverRn, Math.sqrt(.525604 / (k35 * .037)));
near(c35.dimensions.LcOverRn, 2 * (1.1 / .037 - 2 / 10) * Math.sqrt(.525604 * Math.log(1 / .037)));
assert.equal(c35.dimensions.dimensionEquations, '35-36');
assert.equal(c35.profile.validated, false);

// Geometry and volume scale without hidden normalization or sampled containment.
const scaled = good({...request, radius: .03, body: {radius: .024, length: .9}});
near(scaled.dimensions.Lc / base.dimensions.Lc, 3);
near(scaled.drag.force / base.drag.force, 9);
near(scaled.volume.envelopeSegment / base.volume.envelopeSegment, 27);
near(scaled.volume.gasEnvelopeSegment / base.volume.gasEnvelopeSegment, 27);
near(base.body.minimumClearance, .002);
near(base.volume.bodyDisplacement, Math.PI * .008 ** 2 * .3);
assert.equal(base.body.fullCylinderFlowSolved, false);
const flat = good({shape: 'cylinder', sigma: .037, body: {radius: .01, length: .3}});
const nosed = good({shape: 'cylinder', cylinderNose: 'cone', coneAngleDeg: 90, sigma: .037, body: {radius: .01, length: .3}});
assert.equal(flat.geometry.cavitatorKind, 'disk');
assert.equal(nosed.geometry.cavitatorKind, 'cone');
near(flat.drag.CD, good({shape: 'disk', sigma: .037}).drag.CD);
near(nosed.drag.CD, cone.drag.CD);
near(nosed.body.minimumClearance, 0);
near(nosed.body.length, .3); // Cylinder length excludes the upstream nose.
const coarse = good({...request, sampleCount: 3});
near(coarse.body.minimumClearance, base.body.minimumClearance);
near(coarse.volume.envelopeSegment, base.volume.envelopeSegment);
const nearEnd = good({...request, body: {radius: .008, length: base.dimensions.Lc}});
assert.equal(nearEnd.body.completeCoverage, true); near(nearEnd.body.tipClearance, .002);
const over = good({...request, body: {radius: .0101, length: .3}});
assert.equal(over.body.status, 'NEGATIVE_CLEARANCE');
near(over.body.minimumClearance, -.0001);
assert.equal(over.volume.gasEnvelopeSegment, null);
assert.equal(over.volume.bodyDisplacement, null);
const beyond = good({...request, body: {radius: .008, length: base.dimensions.Lc + .1}});
assert.equal(beyond.body.status, 'OUTSIDE_ESTIMATED_ENVELOPE');
assert.equal(beyond.body.completeCoverage, false);
assert.equal(beyond.body.minimumClearanceCoversWholeBody, false);
near(beyond.body.uncoveredLength, .1);
assert.equal(beyond.body.tipClearance, null);
assert.equal(beyond.volume.gasEnvelopeSegment, null);

// Explicit bounds: unsupported shapes, source domains, nonfinite/overflow inputs.
for (const [o, message] of [
  [{shape:'wedge', sigma:.037}, /unsupported/],
  [{shape:'triangular', dimension:'2d', sigma:.037}, /axisymmetric/],
  [{shape:'cone', coneAngleDeg:29.999, sigma:.037}, /\[30, 180\]/],
  [{shape:'cone', coneAngleDeg:180.001, sigma:.037}, /\[30, 180\]/],
  [{shape:'cone', sigma:.250001}, /0.25/],
  [{shape:'cone', sigma:.037, coneAngleDeg:119.999, dragModel:'reichardt-29-30'}, /\[120, 180\]/],
  [{shape:'cone', sigma:.037, dragModel:'reichardt-29'}, /disk drag/],
  [{shape:'disk', sigma:.037, dragModel:'semenenko-36'}, /flat disk/],
  [{shape:'disk', sigma:.037, envelopeModel:'semenenko-cone-35'}, /require a cone/],
  [{shape:'cone', sigma:.037, envelopeModel:'semenenko-cone-35', dragModel:'reichardt-29-30'}, /associated Eq36/],
  [{shape:'disk', sigma:1}, /0 < sigma < 1/],
  [{shape:'disk', sigma:1.2}, /1.2/],
  [{sigma:0}, /positive/], [{sigma:-.1}, /positive/], [{sigma:NaN}, /finite/],
  [{sigma:Infinity}, /finite/], [{sigma:Number.MIN_VALUE}, /finite/],
  [{mode:'physical',sigma:.037}, /explicit sigma/], [{mode:'sigma'}, /finite/],
  [{mode:'other'}, /mode/], [{pInf:2339}, /pressure/], [{pc:-1}, /pressure/],
  [{rho:0}, /positive/], [{U:0}, /positive/], [{radius:0}, /positive/],
  [{U:1e300}, /finite/], [{radius:1e200}, /finite/],
  [{radius:1e-200}, /positive/], [{sigma:.037,radius:.01,diskRn:.02}, /disagree/],
  [{sampleCount:2}, /sampleCount/], [{sampleCount:5002}, /sampleCount/],
  [{sampleCount:3.5}, /sampleCount/], [{cylinderNose:'pointy'}, /cylinderNose/],
  [{shape:'cylinder',body:null}, /object/],
  [{shape:'cylinder',body:{radius:-1,length:.1}}, /positive/],
  [{shape:'cylinder',body:{radius:.01,length:0}}, /positive/],
  [{shape:'cylinder',body:{radius:1e200,length:1e200}}, /finite/]
]) bad(o, message);
assert.throws(() => A.options({shape: 'cone', sigma: .3}), /0.25/);
assert.throws(() => A.envelopeRadiusAt(-1, base.dimensions), /station/);
assert.throws(() => A.envelopeRadiusAt(base.dimensions.LcOverRn + 1e-8, base.dimensions), /station/);
assert.throws(() => A.envelopeRadiusAt(0, {LcOverRn:10, RmaxOverRn:.99}), /at least one/);
assert.throws(() => A.integrateEnvelopeRadiusSquared(0, base.dimensions.LcOverRn + 1, base.dimensions), /integral/);
assert.throws(() => A.integrateEnvelopeRadiusSquared(2, 1, base.dimensions), /integral/);

// Optional review artifacts, written only to an explicitly supplied destination.
const reportIndex = process.argv.indexOf('--report-dir');
if (reportIndex >= 0) {
  const out = path.resolve(process.argv[reportIndex + 1]);
  fs.mkdirSync(out, {recursive: true});
  const repo = path.resolve(__dirname, '../../..');
  const pdf = path.join(repo, 'output/opus-bem/axisymmetric-semenenko-review-20261101/semenenko-2001-archive.pdf');
  const digest = fs.existsSync(pdf) ? crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex') : null;
  if (digest) assert.equal(digest, A.source.pdfSha256);
  const cases = [
    good({shape:'disk',sigma:.037}),
    good({shape:'cone',coneAngleDeg:30,sigma:.037}),
    good({shape:'cone',coneAngleDeg:90,sigma:.037}),
    good({shape:'cone',coneAngleDeg:150,sigma:.037}),
    good({shape:'cone',coneAngleDeg:150,sigma:.037,envelopeModel:'semenenko-cone-35'}),
    flat, nosed, over, beyond
  ];
  const summary = {
    result: 'PASS', comparisons, refusals,
    implementationSha256: crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../analytical-cavitators.js'))).digest('hex'),
    testSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    source: A.source, sourcePdfHashVerified: digest === A.source.pdfSha256,
    reviewedPages: ['PDF14 / printed11-13: Eqs27-30','PDF16 / printed11-15: Eqs35-36','PDF19 / printed11-18: Eq51'],
    independentFixture: fixture,
    validationMeaning: 'Formula transcription, dimensional scaling, exact integral, signed-clearance logic, source-domain refusals and browser export only. No experimental accuracy qualification.',
    cases: cases.map(r => ({shape:r.input.shape, nose:r.input.cylinderNose, angle:r.input.coneAngleDeg,
      envelopeModel:r.input.envelopeModel, sigma:r.sigma, drag:r.drag,
      dimensions:r.dimensions, volume:r.volume, body:r.body, admission:r.admission}))
  };
  fs.writeFileSync(path.join(out, 'analytical-shape-validation.json'), JSON.stringify(summary, null, 2) + '\n');
  const rows = ['shape,cylinderNose,coneAngleDeg,envelopeModel,sigma,xOverRn,rOverRn,profileKind,physicalClosureClaim'];
  for (const r of cases.slice(0,7)) for (const p of r.profile.main) rows.push([r.input.shape,r.input.cylinderNose,r.input.coneAngleDeg,r.input.envelopeModel,r.sigma,p.xOverRn,p.rOverRn,r.profile.kind,false].join(','));
  fs.writeFileSync(path.join(out,'analytical-shape-profiles.csv'), rows.join('\n') + '\n');
  const Ref = require('../axisymmetric-reference.js');
  const diskRef = Ref.solve({sigma:.037});
  assert.equal(diskRef.ok,true);
  const panels = [
    {title:'Disk: two source-based estimates, sigma = 0.037', curves:[
      {name:'Semenenko Eqs31/32 to Eq34 (semiempirical reference, not measurements)',color:'#087b51',points:diskRef.profile.front.concat(diskRef.profile.main)},
      {name:'Garabedian dimensions + Eq51 kappa=1 (main-envelope estimate)',color:'#174bbd',points:cases[0].profile.main}
    ]},
    {title:'Cone noses and a cylindrical afterbody: geometry estimates', curves:[
      {name:'30-degree cone; Garabedian-style dimensions + Eq51',color:'#ba5411',points:cases[1].profile.main},
      {name:'90-degree cone; Garabedian-style dimensions + Eq51',color:'#8a2f9d',points:cases[2].profile.main},
      {name:'150-degree cone; Garabedian-style dimensions + Eq51',color:'#174bbd',points:cases[3].profile.main},
      {name:'150-degree cone; Eq35 dimensions + Eq51',color:'#087b51',points:cases[4].profile.main,dash:'6 4'},
      {name:'Cylinder radius Rn, downstream length 30 Rn (geometric clearance only)',color:'#333333',points:[{xOverRn:0,rOverRn:1},{xOverRn:30,rOverRn:1}],dash:'3 3'}
    ]}
  ];
  function escape(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="1020" viewBox="0 0 1120 1020">',
    '<rect width="1120" height="1020" fill="#ffffff"/>',
    '<style>text{font-family:Arial,sans-serif;fill:#172335} .title{font-size:19px;font-weight:bold} .note{font-size:13px} .tick{font-size:12px}</style>',
    '<text x="70" y="28" class="title">Axisymmetric cavitator analytical envelopes</text>',
    '<text x="70" y="50" class="note">x=0: separation plane. Positive radius shown; finite endpoints are retained. No physical closure or measured-profile claim.</text>'];
  const xmax = 120, ymax = 5.5;
  panels.forEach((panel,j) => {
    const x0=75,y0=95+j*450,w=1005,h=260;
    const X=x=>x0+x/xmax*w, Y=y=>y0+h-y/ymax*h;
    svg.push('<text x="'+x0+'" y="'+(y0-15)+'" class="title">'+escape(panel.title)+'</text>');
    for(let x=0;x<=xmax;x+=20) svg.push('<path d="M '+X(x)+' '+y0+' V '+(y0+h)+'" stroke="#e4e8ef"/><text x="'+X(x)+'" y="'+(y0+h+18)+'" text-anchor="middle" class="tick">'+x+'</text>');
    for(let y=0;y<=5;y++) svg.push('<path d="M '+x0+' '+Y(y)+' H '+(x0+w)+'" stroke="#e4e8ef"/><text x="'+(x0-12)+'" y="'+(Y(y)+4)+'" text-anchor="end" class="tick">'+y+'</text>');
    svg.push('<path d="M '+x0+' '+y0+' V '+(y0+h)+' H '+(x0+w)+'" fill="none" stroke="#192739"/>',
      '<text x="'+(x0+w/2)+'" y="'+(y0+h+38)+'" text-anchor="middle" class="note">Downstream position x/Rn</text>',
      '<text transform="translate(23 '+(y0+h/2)+') rotate(-90)" text-anchor="middle" class="note">Envelope radius R/Rn</text>');
    panel.curves.forEach((c,i) => {
      svg.push('<polyline points="'+c.points.map(p=>X(p.xOverRn).toFixed(3)+','+Y(p.rOverRn).toFixed(3)).join(' ')+'" fill="none" stroke="'+c.color+'" stroke-width="2.2"'+(c.dash?' stroke-dasharray="'+c.dash+'"':'')+'/>');
      const yy=y0+h+65+i*19;
      svg.push('<path d="M '+x0+' '+yy+' h 28" stroke="'+c.color+'" stroke-width="2.2"'+(c.dash?' stroke-dasharray="'+c.dash+'"':'')+'/><text x="'+(x0+38)+'" y="'+(yy+4)+'" class="note">'+escape(c.name)+'</text>');
    });
  });
  svg.push('<text x="75" y="1000" class="note">Source: Semenenko (2001), ADP012080, Eqs27-36 and51. Garabedian finite-sigma accuracy and afterbody effects are not validated here.</text></svg>');
  fs.writeFileSync(path.join(out,'analytical-envelope-profiles.svg'),svg.join('\n')+'\n');
}
console.log('Analytical cavitators: PASS; '+comparisons+' numeric comparisons, '+refusals+' refused inputs; source domains, geometric profiles/volumes, cylinder clearances and browser export verified. No experimental accuracy qualification.');

