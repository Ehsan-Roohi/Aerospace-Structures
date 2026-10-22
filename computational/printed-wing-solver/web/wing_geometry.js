/* Station-based semi-wing geometry. Units mm, degrees, x aft / y projected span / z up.
 * Conventions follow NASA OpenVSP's default unrotated-to-dihedral section layout:
 * sections remain in aircraft x-z planes; sweep is measured at an explicit x/c;
 * incidence is absolute, positive nose-up, about an explicit chord reference.
 * https://www.nasa.gov/reference/openvsp-wings/
 * Geometric twist changes incidence; changing spanwise airfoil is aerodynamic twist,
 * not a prediction of its zero-lift angle or resulting lift distribution (NASA SP-367).
 * This module defines geometry, not a swept/curved beam structural formulation.
 */
const WingGeometry = (() => {
  'use strict';
  const A = typeof WingAirfoils !== 'undefined' ? WingAirfoils : (typeof require === 'function' ? require('./wing_airfoils.js') : null);
  const LIMITS = Object.freeze({stations:9, sweepDeg:60, dihedralDeg:45, incidenceDeg:30});
  const deg = Math.PI / 180;
  const finite = (v, name, lo, hi) => {
    if (!Number.isFinite(v) || v < lo || v > hi) throw Error(`${name} must be finite and between ${lo} and ${hi}.`);
    return v;
  };
  function normalizeGeometryFields(g) {
    const out = {};
    for (const [name, limit] of [['sweepDeg',LIMITS.sweepDeg],['dihedralDeg',LIMITS.dihedralDeg]]) {
      if (Object.hasOwn(g,name)) out[name] = finite(g[name], name, -limit, limit);
    }
    for (const name of ['sweepReferenceFraction','twistReferenceFraction']) {
      if (Object.hasOwn(g,name)) out[name] = finite(g[name], name, 0, 1);
    }
    if (Object.hasOwn(g,'twistEnabled')) {
      if (typeof g.twistEnabled !== 'boolean') throw Error('twistEnabled must be true or false.');
      out.twistEnabled = g.twistEnabled;
    }
    if (g.airfoil != null) out.airfoil = A.normalizeProfile(g.airfoil);
    if (g.stations != null) {
      if (!Array.isArray(g.stations) || g.stations.length < 2 || g.stations.length > LIMITS.stations)
        throw Error(`Use 2–${LIMITS.stations} wing stations including the root and tip.`);
      out.stations = Object.freeze(g.stations.map((s,i) => {
        if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !['eta','airfoil','incidenceDeg'].includes(k)))
          throw Error(`Wing station ${i+1}: use eta, airfoil and incidenceDeg only.`);
        const eta = finite(s.eta, `Wing station ${i+1} eta`, 0, 1);
        if (i && eta <= g.stations[i-1].eta) throw Error('Wing stations must be strictly increasing from eta = 0 to eta = 1.');
        if (i && (eta-g.stations[i-1].eta)*g.semiSpan < .1-1e-8) throw Error('Distinct wing stations must be separated by at least 0.1 mm.');
        return Object.freeze({eta, airfoil:A.normalizeProfile(s.airfoil), incidenceDeg:finite(s.incidenceDeg ?? 0, `Wing station ${i+1} incidenceDeg`, -LIMITS.incidenceDeg, LIMITS.incidenceDeg)});
      }));
      if (out.stations[0].eta !== 0 || out.stations.at(-1).eta !== 1) throw Error('Wing stations must include exactly eta = 0 at the root and eta = 1 at the tip.');
      if (g.twistEnabled !== true && out.stations.some(s => s.incidenceDeg !== 0)) throw Error('Enable geometric twist before entering nonzero station incidence, or set every incidence to zero.');
    }
    return out;
  }
  const chordAt = (g,y) => g.rootChord + Math.max(0,Math.min(1,y/g.semiSpan))*(g.tipChord-g.rootChord);
  function stationAt(g,y) {
    finite(y,'Span station y',0,g.semiSpan);
    const eta=y/g.semiSpan, ss=g.stations;
    let incidenceDeg=0, inboard=0, blend=0;
    if (ss) {
      while (inboard < ss.length-2 && eta > ss[inboard+1].eta) inboard++;
      blend=(eta-ss[inboard].eta)/(ss[inboard+1].eta-ss[inboard].eta);
      incidenceDeg=ss[inboard].incidenceDeg+(ss[inboard+1].incidenceDeg-ss[inboard].incidenceDeg)*blend;
    }
    // Omitted sweep reference means legacy leading-edge alignment, not an
    // implicit quarter-chord shift of every existing tapered study.
    const chord=chordAt(g,y), sweepReferenceFraction=g.sweepReferenceFraction ?? 0;
    return {eta,y,chord,incidenceDeg,inboard,blend,
      xLE:y*Math.tan((g.sweepDeg ?? 0)*deg)+sweepReferenceFraction*(g.rootChord-chord),
      zLE:y*Math.tan((g.dihedralDeg ?? 0)*deg),
      twistReferenceFraction:g.twistReferenceFraction ?? .25};
  }
  function airfoilAt(g,y) {
    if (!g.stations) return g.airfoil ?? g.naca;
    const s=stationAt(g,y), a=g.stations[s.inboard].airfoil, b=g.stations[s.inboard+1].airfoil;
    if (s.blend === 0) return a;
    if (s.blend === 1) return b;
    if (JSON.stringify(a) === JSON.stringify(b)) return a;
    return A.blendProfiles(a,b,s.blend);
  }
  function transformPoint(g,y,point) {
    const s=stationAt(g,y), a=s.incidenceDeg*deg, ca=Math.cos(a), sa=Math.sin(a), pivot=s.twistReferenceFraction*s.chord;
    const dx=point[0]-pivot,z=point[1];
    return [s.xLE+pivot+ca*dx+sa*z,y,s.zLE-sa*dx+ca*z];
  }
  function inversePoint(g,point) {
    const s=stationAt(g,point[1]), a=s.incidenceDeg*deg, ca=Math.cos(a), sa=Math.sin(a), pivot=s.twistReferenceFraction*s.chord;
    const dx=point[0]-s.xLE-pivot,z=point[2]-s.zLE;
    return [pivot+ca*dx-sa*z,sa*dx+ca*z];
  }
  function analysisCapability(g) {
    const reasons=[];
    if (Math.abs(g.sweepDeg ?? 0)>1e-12) reasons.push('sweep');
    if (Math.abs(g.dihedralDeg ?? 0)>1e-12) reasons.push('dihedral');
    if ((g.stations ?? []).some(s => Math.abs(s.incidenceDeg)>1e-12)) reasons.push('section incidence / geometric twist');
    // A nonzero sweep-reference location also shifts a tapered wing's sections.
    // Existing legacy wings instead align their leading edges exactly.
    if ((g.sweepReferenceFraction ?? 0)!==0 && g.rootChord!==g.tipChord)
      reasons.push('a chord-reference sweep line that shifts the leading edge of a tapered wing');
    return {supported:reasons.length===0, mode:reasons.length?'geometry-only':'straight-beam', reasons,
      loadFrame:'Aircraft +z (up); N for point loads, N/mm per projected y for line loads.',
      message:reasons.length?`Geometry and CAD export are available, but structural Solve is not supported for ${reasons.join(', ')}. The current solver is a straight, untwisted spanwise beam, not a validated 3-D swept/dihedral frame. Set these angles to zero and align the leading edge to use this solver; no straight-wing stress or safety result will be substituted.`:'Straight, untwisted spanwise beam approximation; local sections may vary. Loads are prescribed, not computed from aerodynamic twist.'};
  }
  return {LIMITS,normalizeGeometryFields,chordAt,stationAt,airfoilAt,transformPoint,inversePoint,analysisCapability};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingGeometry;
