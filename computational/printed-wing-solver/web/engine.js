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
 *
 * Custom loads (load.kind 'custom', items; mm, N, N/mm, UPWARD +; fraction = x/c from the local leading edge):
 * point, linear 'distributed', curved 'elliptic' | 'parabolic' {start, end, shape 'start'|'end'|'middle', total | peak},
 * 'table' {points [[y, w]] or [[y, w, x/c]], linear between rows} and 'schrenk' {total}: the mean of the
 * chord-proportional load F c(y)/∫c dy and the elliptic load 4F/(πL)√(1 − (y/L)²) over the whole semi-span
 * (an unswept-planform approximation, as in the flight case). V, M and the chordwise first moment use exact
 * integrals (load_profiles.js); the beam FE gets exact consistent loads for the elliptic parts.
 * Torque at a cut y is about that section's shear centre: T(y) = Σ F [x_sc(y) − x_F] over the outboard loads.
 */
const WingEngine = (() => {
  "use strict";
  const Profiles = typeof LoadProfiles !== "undefined" ? LoadProfiles : (typeof require === "function" ? require("./load_profiles.js") : null);
  const Spars = typeof WingSpars !== 'undefined' ? WingSpars : (typeof require === 'function' ? require('./wing_spars.js') : null);
  const Airfoils = typeof WingAirfoils !== 'undefined' ? WingAirfoils : (typeof require === 'function' ? require('./wing_airfoils.js') : null);
  const Geometry = typeof WingGeometry !== 'undefined' ? WingGeometry : (typeof require === 'function' ? require('./wing_geometry.js') : null);
  const Frame = typeof WingFrame3D !== 'undefined' ? WingFrame3D : (typeof require === 'function' ? require('./wing_frame3d.js') : null);
  const ClosedTipStress = typeof WingClosedTipStress !== 'undefined' ? WingClosedTipStress : (typeof require === 'function' ? require('./wing_closed_tip_stress.js') : null);
  if (!Profiles) throw new Error("Load load_profiles.js before engine.js.");
  const GRAV = 9.81;
  const VERSION = "1.3.0";
  const MESH_LIMITS=Object.freeze({min:4,max:100,legacyDefault:60,spatialDefault:40});
  function requestedElementCount(input,fallback=MESH_LIMITS.legacyDefault){
    if(input.nElements===undefined)return fallback;
    if(!Number.isInteger(input.nElements)||input.nElements<MESH_LIMITS.min||input.nElements>MESH_LIMITS.max)
      throw Error('Wing requested beam elements (nElements) must be an integer from 4 to 100.');
    return input.nElements;
  }

  // ------------------------------------------------------------------ materials
  const MATERIALS = {
    custom_shell:{key:'custom_shell',kind:'pla',name:'Custom effective shell / rib material',short:'Custom shell',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10,G:null,source:'User-supplied effective isotropic beam properties. Initial numbers are PLA teaching placeholders, not certified properties; replace E, nu, density and allowables before material comparisons.'},
    pla_upright: {
      key: "pla_upright", kind: "pla", name: "Printed PLA Pro — span along printer Z",
      short: "PLA upright", E: 2000, nu: 0.35, rho: 1.24, ft: 15, fc: 50, fs: 10, G: null,
      source: "Illustrative PLA Pro upright card, not a measured material or validated allowable. The 15 MPa tensile entry is a teaching assumption, not a result from your class filament. Gonabadi, Yadav & Bull (2020) is background on print anisotropy, not validation of these numbers. Replace E and strengths with mechanical coupon data; a rod-clearance coupon tests fit only.",
    },
    pla_flat: {
      key: "pla_flat", kind: "pla", name: "Printed PLA Pro — span in build plane",
      short: "PLA flat", E: 3000, nu: 0.35, rho: 1.24, ft: 45, fc: 55, fs: 20, G: null,
      source: "Illustrative PLA Pro flat card, not a measured material or validated allowable. Match the actual filament and print direction, and replace E and strengths with mechanical coupon data; a rod-clearance coupon tests fit only.",
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
    spars: [],
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
    Object.assign(g, Geometry.normalizeGeometryFields(g));
    g.rodFractions = [...g.rodFractions];
    g.spars = Spars.specs(g.spars,g.semiSpan);
    if(g.spars.length&&g.rodFractions.length)throw new Error('Compare shell + rods and shell + bonded spars separately: mixed rod/spar connections are not validated in this model. Remove rods before adding a spar.');
    if (g.rodFractions.some(f => !Number.isFinite(f) || f <= 0 || f >= 1)) throw new Error("Rod positions must be fractions between 0 and 1.");
    const pos = ["semiSpan", "rootChord", "tipChord", "skin", "ribThickness", "te", "cap", "rodDiameter", "sleeveWall"];
    for (const k of pos.filter(k=>k!=="tipChord"||!Geometry.closedTip(g))) if (!Number.isFinite(g[k])||!(g[k] > 0)) throw new Error(`${k} must be positive and finite.`);
    if(!Number.isFinite(g.cavityStart)||!Number.isFinite(g.cavityEnd)||g.cavityStart<=0||g.cavityEnd>=1||g.cavityStart>=g.cavityEnd)throw new Error('Cavity limits must satisfy 0 < start < end < 1.');
    if(Geometry.closedTip(g)&&g.rodFractions.length)throw Error('Remove external rods before selecting a zero-chord tip; closed-tip rod paths are not supported.');
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
    if(g.spars.length){
      if(Geometry.closedTip(g))for(const s of g.spars){const limit=closedTipSparLimit(g,s);if(s.length>limit+1e-8)throw Error(`Closed-tip spar length ${s.length.toFixed(2)} mm exceeds its finite runout fit limit ${limit.toFixed(2)} mm. Reduce Length; a fixed-width spar cannot reach the zero-area tip.`);}
      const points=[...linspace(0,g.semiSpan,129),...g.spars.map(s=>s.length),...(g.stations||[]).map(s=>s.eta*g.semiSpan)];
      for(const y of points)sparParts(g,y);
    }
    return Object.freeze(g);
  }

  const chordAt = Geometry.chordAt;
  const airfoilAt = (g,y) => Geometry.airfoilAt(g,y);
  // Cross-section mechanics use unrotated local x/z. Apply station transforms
  // only at geometry/CAD/display boundaries, never to the old scalar solver.
  const localGeometry = (g,y) => g.airfoil || g.stations || g.planform==='elliptic' ? {...g,naca:airfoilAt(g,y),sectionChord:chordAt(g,y)} : g;
  const sparParts = (g,y) => Spars.parts(localGeometry(g,y),y,verticalOrdinates);
  function closedTipSparLimit(g,spec){
    if(!Geometry.closedTip(g))return g.semiSpan;
    // Keep the actual fixed cap/web dimensions. Find the first loss of fit,
    // rather than extending material through a solid closure or scaling it.
    const end=cavityTipLimit(g)-g.cap;
    if(!(end>0))throw Error('Closed-tip spar has no hollow root region. Increase root chord or airfoil thickness.');
    const other=(g.spars||[]).filter(s=>s!==spec&&Math.abs(s.fraction-spec.fraction)>1e-12);
    const test={...g,spars:[...other,{...spec,length:g.semiSpan}]};
    const fits=y=>{try{sparParts(test,y);return true;}catch{return false;}};
    if(!fits(0))throw Error('Closed-tip spar dimensions do not fit the root cavity. Reduce cap width/thickness or web thickness, move the spar, or increase root chord/airfoil thickness.');
    const points=[...linspace(0,end,257),...other.flatMap(s=>[s.length,Math.min(end,s.length+1e-7)]),...(g.stations||[]).map(s=>s.eta*g.semiSpan)].filter(y=>y>=0&&y<=end).sort((a,b)=>a-b);
    let lo=0,hi=end;
    for(const y of points){if(!fits(y)){hi=y;break;}lo=y;}
    if(lo<hi)for(let i=0;i<40;i++){const y=(lo+hi)/2;if(fits(y))lo=y;else hi=y;}
    const limit=Math.max(0,Math.min(lo,end)-Math.max(1e-5,g.semiSpan*1e-7));
    if(limit<Math.min(20,g.semiSpan))throw Error('Closed-tip spar has less than the minimum 20 mm fit length. Revise root dimensions or spar dimensions.');
    return limit;
  }
  function analysisCapability(g,input={}) {
    if(Geometry.closedTip(g)){
      const restrictions=[];
      if(Math.abs(g.sweepDeg||0)>1e-10||Math.abs(g.dihedralDeg||0)>1e-10||[0,g.semiSpan,...(g.stations||[]).map(s=>s.eta*g.semiSpan)].some(y=>Math.abs(Geometry.stationAt(g,y).incidenceDeg)>1e-10))restrictions.push('Exact-tip section stress requires zero sweep, dihedral and incidence at every station.');
      if(g.rodFractions?.length)restrictions.push('Exact-tip section stress supports integral skin, ribs and finite-length spars; remove external rods.');
      if(g.modules>1&&input.assembly?.seamsBonded!==true)restrictions.push('Use one piece or explicitly fully bonded module seams for section stress.');
      if((input.load?.kind??DEFAULT_LOAD.kind)==='flight'&&(input.load?.inertiaRelief??DEFAULT_LOAD.inertiaRelief)!==false)restrictions.push('Set Wing inertia relief to Ignored for exact-tip section stress.');
      return {supported:!restrictions.length,requires3D:true,stressOnly:true,mode:'section-stress',reasons:['Exact zero-chord tip'],restrictions,message:restrictions.length?restrictions.join(' '):'Nominal axial and biaxial normal section stress from physical load equilibrium. Exact apex stress and deformation are unresolved; torsion, shear, local buckling and 3-D stress concentrations are not assessed.'};
    }
    const c=Geometry.analysisCapability(g);
    if(c.supported&&!g.airfoil&&!g.stations)return c;
    if(c.supported)c.reasons.push('explicit airfoil profiles / station sections require the full biaxial spatial beam');
    const restrictions=[];
    if(g.rodFractions?.length)restrictions.push('Remove external rods: 3-D rod/sleeve slip and curved rod paths are not validated.');
    if((g.spars||[]).some(s=>s.length<g.semiSpan-1e-8))restrictions.push('Use full-span bonded spars for the spatial beam: abrupt partial-span spar runouts need a validated reference-axis/joint transition model. Geometry and CAD export remain available.');
    if(g.modules>1&&input.assembly?.seamsBonded!==true)restrictions.push('Use one piece or explicitly fully bonded module seams; 3-D dry-joint compliance is not validated.');
    if(input.load?.kind==='flight'&&input.load.inertiaRelief!==false)restrictions.push('For the spatial beam, set Wing inertia relief to Ignored. Distributed aircraft lift is supported; spatial inertia relief is not validated.');
    return {supported:!restrictions.length,mode:'spatial-beam',requires3D:true,reasons:c.reasons,restrictions,loadFrame:c.loadFrame,
      message:restrictions.length?restrictions.join(' '):'Small-displacement 6-DOF spatial beam with projected normal sections, biaxial bending and axial/torsional response. Prescribed loads are global +z, not lift predicted from airfoil or twist. No 3-D solid, joint, buckling or flutter certification.'};
  }
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
    if(typeof code==='object') return Airfoils.camber(code,x);
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
    if(typeof code==='object')return Airfoils.surfaces(code,chord,te,count);
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
    if(typeof code==='object')return Airfoils.verticalOrdinates(code,x,chord,te);
    const { yc, slope } = camber(code, x);
    const vh = halfThickness(code, x, chord, te) * Math.cos(Math.atan(slope));
    return { lower: (yc - vh) * chord, camber: yc * chord, upper: (yc + vh) * chord };
  }
  function rodCentres(g, y) {
    const c = chordAt(g, y);
    const profile=airfoilAt(g,y);
    return g.rodFractions.map((f) => [f * c, camber(profile, f).yc * c]);
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

  const effectiveTE=(g,y)=>Geometry.closedTip(g)?g.te*Math.min(1,chordAt(g,y)/(12*g.skin)):g.te;
  const tipCavityCache=new WeakMap();
  function cavityTipLimit(g){
    if(!Geometry.closedTip(g))return g.semiSpan;
    if(tipCavityCache.has(g))return tipCavityCache.get(g);
    const raw={...g,_rawCavity:true};ringLoops(raw,0,81,8,8);
    let a=0,b=g.semiSpan;
    // First closure from the root, rather than admitting disconnected pockets.
    for(let i=1;i<=128;i++){const y=g.semiSpan*i/128;try{ringLoops(raw,y,81,8,8);a=y;}catch{b=y;break;}}
    for(let i=0;i<32;i++){const y=(a+b)/2;try{ringLoops(raw,y,81,8,8);a=y;}catch{b=y;}}
    tipCavityCache.set(g,a);return a;
  }
  function outerContour(g, y, count = 241) {
    const c = chordAt(g, y);
    if(c===0)return Array.from({length:2*count-1},()=>[0,0]);
    const { xu, zu, xl, zl } = airfoilSurfaces(airfoilAt(g,y), c, effectiveTE(g,y), count);
    const pts = xu.map((x, i) => [x, zu[i]]);
    for (let i = xl.length - 1; i >= 1; i--) pts.push([xl[i], zl[i]]);
    return pts;
  }

  // Matched inner (cavity) and outer loops for a mapped ring mesh, CCW around the cavity
  function ringLoops(g, y, Ks = 120, Kn = 40, Ka = 24) {
    const c = chordAt(g, y);
    if(Geometry.closedTip(g)&&!g._rawCavity&&y>=cavityTipLimit(g))return {inner:[],outer:outerContour(g,y,Ks),corners:[],chord:c,upperSkin:[],solid:true};
    if(c===0)throw Error('Zero-chord tip has no hollow cavity.');
    const te=effectiveTE(g,y);
    const t = g.skin;
    const x0 = g.cavityStart, x1 = g.cavityEnd;
    const profile=airfoilAt(g,y);
    const { xu, zu, xl, zl } = airfoilSurfaces(profile, c, te, 401);
    const outUp = (x) => interp(x, xu, zu);
    const outLo = (x) => interp(x, xl, zl);
    const xs = cosineSpacing(Ks, x0, x1).map((v) => v * c);
    const upIn = [], loIn = [], upOut = [], loOut = [];
    for (const x of xs) {
      const v = verticalOrdinates(profile, x / c, c, g.te);
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
    const profile=airfoilAt(g,y);
    const xq = cosineSpacing(161, x0, x1);
    const xs = xq.map((v) => v * c);
    const up = [], lo = [];
    for (const x of xq) {
      const v = verticalOrdinates(profile, x, c, g.te);
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
    // Warping mesh depends only on this shell outline, not on spar materials,
    // rods, rib layout or module labels. Reuse exactly the same immutable FE data.
    const key = JSON.stringify([airfoilAt(g,y),chordAt(g,y),g.skin,g.te,g.cavityStart,g.cavityEnd,layers]);
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
    const sectionSparParts=sparParts(g,y),sparInts=sectionSparParts.flatMap(p=>p.polygons.map((polygon,k)=>({index:p.index,kind:['top cap','bottom cap','web'][k],m:p.s.material,polygon,int:polyIntegrals(polygon)})));
    const sums = [0, 0, 0, 0, 0, 0];
    const add = (arr, E) => arr.forEach((v, i) => (sums[i] += E * v));
    add(shellInt, Ep);
    sleeveInts.forEach((s) => add(s, Ep));
    if (asm.rodsBonded) rodInts.forEach((s) => add(s, Er));
    sparInts.forEach(s=>add(s.int,s.m.E));
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
    const sparNetwork=sectionSparParts.length?Spars.network(loops.inner,loops.outer,pla,sectionSparParts):null;
    const bendCoupling=sparNetwork?EIxz/EIc:0;
    if(sparNetwork){EIf-=EIxz*EIxz/EIc;GJ=sparNetwork.GJ;}
    const xsc=sparNetwork?sparNetwork.xsc:fe.xsc,zsc=sparNetwork?sparNetwork.zsc:fe.zsc;
    // mass, centre of gravity and polar mass moment about the shear centre (g/mm, g·mm²/mm)
    const rp = pla.rho * 1e-3, rr_ = rod.rho * 1e-3;
    const plaInt = shellInt.map((v, i) => v + sleeveInts.reduce((s, a) => s + a[i], 0));
    const rodInt = rodInts.reduce((s, a) => s.map((v, i) => v + a[i]), [0, 0, 0, 0, 0, 0]);
    const sparMass=sparInts.reduce((a,s)=>a+s.m.rho*1e-3*s.int[0],0);
    const mass = rp * plaInt[0] + rr_ * rodInt[0]+sparMass;
    const cgx = (rp * plaInt[2] + rr_ * rodInt[2]+sparInts.reduce((a,s)=>a+s.m.rho*1e-3*s.int[2],0)) / mass;
    const cgz = (rp*plaInt[1]+rr_*rodInt[1]+sparInts.reduce((a,s)=>a+s.m.rho*1e-3*s.int[1],0))/mass;
    const polar = (I) => I[4] - 2 * xsc * I[2] + xsc ** 2 * I[0] + (I[3] - 2 * zsc * I[1] + zsc ** 2 * I[0]);
    const polarInertia = rp * polar(plaInt) + rr_ * polar(rodInt)+sparInts.reduce((a,s)=>a+s.m.rho*1e-3*polar(s.int),0);
    const outerInt = polyIntegrals(outer);
    const holeInt = centres.map((cc) => diskIntegrals(cc, rh)).reduce((s, a) => s.map((v, i) => v + a[i]), [0, 0, 0, 0, 0, 0]);
    const ribInt = outerInt.map((v, i) => v - holeInt[i]-sparInts.reduce((a,s)=>a+s.int[i],0));
    const ribExtra = ribInt[0] - plaInt[0];
    let zTop = -Infinity, zBot = Infinity;
    for (const p of outer) { zTop = Math.max(zTop, p[1]); zBot = Math.min(zBot, p[1]); }
    // upper-skin panel: same point set as the Python solver (241-point surface, x0..x1)
    const surf = airfoilSurfaces(airfoilAt(g,y), loops.chord, g.te, 241);
    const us = [];
    surf.xu.forEach((x, i) => { if (x >= g.cavityStart * loops.chord && x <= g.cavityEnd * loops.chord) us.push([x, surf.zu[i]]); });
    let width = 0;
    for (let i = 1; i < us.length; i++) width += Math.hypot(us[i][0] - us[i - 1][0], us[i][1] - us[i - 1][1]);
    const radius = circleRadius(us[0], us[us.length >> 1], us[us.length - 1]);
    return {
      y, chord: loops.chord, EA, xc, zc, EIf, EIc, EIxz, principal, EIrods, GJ, Jfe: fe.J, Jbredt: bredt.J,
      bredtArea: bredt.Am, xsc, zsc, mass, cgx, cgz, polarInertia, zTop, zBot,
      sparParts:sectionSparParts,sparInts,sparMass,sparNetwork,bendCoupling,
      plaArea: plaInt[0], shellArea: fe.A, rodArea: rodInt[0], ribExtra, ribCgx: ribInt[2] / ribInt[0],ribExtraCgx:(ribInt[2]-plaInt[2])/ribExtra,ribExtraCgz:(ribInt[1]-plaInt[1])/ribExtra,
      ribPolar: polar(ribInt), skinWidth: width, skinRadius: radius, mesh, fe, corners: loops.corners,
      outer, centres, Rs, rh, rr,
    };
  }

  // ------------------------------------------------------------------ loads and criteria
  const DEFAULT_LOAD = {
    name: "Limit manoeuvre (analytical)", kind: "flight", aircraftMass: 1.0, loadFactor: 4.0,
    distribution: "schrenk", liftFraction: 0.25, inertiaRelief: true, tipForce: 10, tipFraction: 0.3,
    fos: 1.5, tipMass: 0, selfWeight:false,
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
      if (o.wNodal) { const fx = o.wNodal(y0, h); for (let a = 0; a < 4; a++) fe[a] += fx[a]; }
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
    for(const [y,F] of o.pointForces||[]){const k=argmin(nodes,y);if(Math.abs(nodes[k]-y)<1e-8){fb[wDof[k]]+=F;continue;}let e=0;while(e<n-2&&y>nodes[e+1])e++;const h=nodes[e+1]-nodes[e],t=(y-nodes[e])/h,N=[1-3*t*t+2*t*t*t,h*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,h*(-t*t+t*t*t)],d=[wDof[e],thR[e],wDof[e+1],thL[e+1]];N.forEach((v,i)=>fb[d[i]]+=F*v);}
    for(const [y,T] of o.pointTorques||[]){const k=argmin(nodes,y);if(Math.abs(nodes[k]-y)<1e-8){ft[(o.pointTorquesOutboard?phR:phL)[k]]+=T;continue;}let e=0;while(e<n-2&&y>nodes[e+1])e++;const t=(y-nodes[e])/(nodes[e+1]-nodes[e]);ft[phR[e]]+=(1-t)*T;ft[phL[e+1]]+=t*T;}
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
    requestedElementCount(input);
    const g = makeGeometry(input.geometry || {});
    const pla = { ...MATERIALS.pla_upright, ...(input.pla || {}) };
    for(const k of ['E','rho','ft','fc','fs'])if(!Number.isFinite(pla[k])||pla[k]<=0)throw new Error(`Shell material ${k} must be finite and positive.`);
    if(!Number.isFinite(pla.nu)||pla.nu<0||pla.nu>=.5)throw new Error('Shell material nu must be 0 ≤ nu < 0.5.');
    const rod = { ...MATERIALS.rod_hobby, ...(input.rod || {}) };
    const asm = { ...DEFAULT_ASSEMBLY, ...(input.assembly || {}) };
    if(g.spars.length&&!asm.seamsBonded&&seams(g).length)throw new Error('Bonded spars require bonded module seams (or a one-piece shell). Dry-seam joint mechanics with spars are not validated.');
    const load = { ...DEFAULT_LOAD, selfWeight:false, ...(input.load || {}) };
    if(load.selfWeight&&!Geometry.closedTip(g)&&g.spars.some(s=>s.length<g.semiSpan-1e-8))throw Error('Self-weight currently requires full-span spars. Partial-span spar runout gravity needs a segmented mass integration model.');
    if(Geometry.closedTip(g))for(const s of g.spars)for(const key of ['E','nu','rho','ft','fc','fs'])if(Math.abs(s.material[key]-pla[key])>1e-7*Math.max(1,Math.abs(pla[key])))throw Error('Closed-tip integral spars must use the same material as the shell.');
    if(typeof load.selfWeight!=='boolean')throw Error('Include wing self-weight must be true or false.');
    if(load.selfWeight&&load.kind==='flight'&&load.inertiaRelief)throw Error('Choose self-weight or flight inertia relief, not both. Self-weight uses 1 g; inertia relief already includes wing mass at n g.');
    if (!g.rodFractions.length && !asm.seamsBonded && seams(g).length)
      throw new Error("Removing every rod from a dry multi-module joint disconnects the wing. Use the one-piece teaching wing or explicitly model bonded seams.");
    if (!["flight", "tip", "custom"].includes(load.kind)) throw new Error("Choose flight, tip or custom loading.");
    if (load.kind === "custom") {
      load.items = validateLoads(load.items, g.semiSpan);
      const essential=[...new Set([0,g.semiSpan,...seams(g),...ribStations(g),...(g.stations||[]).map(s=>s.eta*g.semiSpan),...load.items.flatMap(p=>loadStations(p,g.semiSpan))])].sort((a,b)=>a-b);
      for(let i=1;i<essential.length;i++) if(essential[i]-essential[i-1]<.1-1e-8) throw new Error("Keep distinct wing load boundaries at least 0.1 mm from each other, ribs, seams and ends, or use exactly the same station. This avoids degenerate beam elements.");
    }
    const crit = { ...DEFAULT_CRITERIA, ...(input.criteria || {}) };
    if(g.spars.length){
      const xs=[...new Set([0,g.semiSpan,...seams(g),...ribStations(g),...g.spars.map(s=>s.length),...(load.kind==='custom'?load.items.flatMap(p=>loadStations(p,g.semiSpan)):[])])].sort((a,b)=>a-b);
      for(let i=1;i<xs.length;i++)if(xs[i]-xs[i-1]<.1-1e-8)throw new Error('Keep distinct spar ends at least 0.1 mm from loads, ribs, seams and each other, or use exactly the same station.');
    }
    const nSections = input.nSections || 7;
    const ends=g.spars.filter(s=>s.length<g.semiSpan).flatMap(s=>[s.length,Math.min(g.semiSpan,s.length+.001)]);
    const ySec = [...new Set([...linspace(0, 0.95 * g.semiSpan, nSections),...ends,...(g.spars.length?[g.semiSpan]:[]),...(g.stations||[]).map(s=>s.eta*g.semiSpan)])].sort((a,b)=>a-b);
    return { g, pla, rod, asm, load, crit, nSections, ySec };
  }
  // Prescribed global-z lift uses exactly the existing distributed-load integration.
  // This is not an aerodynamic prediction and does not include inertia relief.
  function chordLoadTable(g,total,fraction){
    const points=linspace(0,g.semiSpan,31).map(y=>[y,chordAt(g,y)]),area=points.slice(1).reduce((sum,p,i)=>sum+(p[0]-points[i][0])*(p[1]+points[i][1])/2,0);
    return {...Profiles.normalizeTable({points:points.map(p=>[p[0],p[1]*total/area])},{min:0,max:g.semiSpan,lengthUnit:'mm'}),fraction};
  }
  function prescribedFlightLoads(load,g) {
    const L=g.semiSpan,total=load.aircraftMass*load.loadFactor*GRAV/2,fraction=load.liftFraction;
    if(load.inertiaRelief)throw Error('Spatial inertia relief is not validated; choose Ignored.');
    let item;
    if(load.distribution==='tip')item={kind:'point',position:L,force:total,fraction};
    else if(load.distribution==='elliptic')item={kind:'elliptic',start:0,end:L,shape:'start',total,fraction};
    else if(load.distribution==='schrenk')item={kind:'schrenk',total,fraction};
    else if(load.distribution==='uniform')item={kind:'distributed',start:0,end:L,qStart:total/L,qEnd:total/L,fraction};
    else if(load.distribution==='planform'&&g.planform==='elliptic')item=chordLoadTable(g,total,fraction);
    else if(load.distribution==='planform'){const area=(g.rootChord+g.tipChord)*L/2;item={kind:'distributed',start:0,end:L,qStart:total*g.rootChord/area,qEnd:total*g.tipChord/area,fraction};}
    else throw Error('Choose elliptic, Schrenk, uniform, planform or tip lift.');
    return validateLoads([item],L);
  }
  // Integrate the section mass model with four-point Gauss quadrature per
  // section interval. Each quadrature force is applied at the true local mass
  // centroid and transferred consistently to the beam; no artificial FE nodes.
  function loadWithSelfWeight(source,g,pla,sections,ys,extrapolate=false){
    if(!source.selfWeight)return source;
    const L=g.semiSpan,lookup=extrapolate?interpLin:interp,stations=[...new Set([0,...ys,L])].sort((a,b)=>a-b),at=(k,y)=>lookup(y,ys,sections.map(s=>s[k]));
    const gravity=[],add=(y,mass,x,z)=>{if(mass>0)gravity.push({kind:'point',position:y,force:-mass*GRAV/1000,fraction:x/chordAt(g,y),localPoint:[x,z],gravity:true});};
    const gx=[-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526],gw=[.3478548451374538,.6521451548625461,.6521451548625461,.3478548451374538];
    for(let i=1;i<stations.length;i++){const a=stations[i-1],b=stations[i];for(let j=0;j<4;j++){const y=(a+b)/2+(b-a)*gx[j]/2,m=at('mass',y),first=k=>lookup(y,ys,sections.map(s=>s.mass*s[k]));add(y,m*(b-a)*gw[j]/2,first('cgx')/m,first('cgz')/m);}}
    const rho=pla.rho/1000;
    for(const y of ribStations(g))add(y,rho*g.ribThickness*at('ribExtra',y),at('ribExtraCgx',y),at('ribExtraCgz',y));
    for(const y of [0,L])add(y,rho*g.cap*at('ribExtra',y),at('ribExtraCgx',y),at('ribExtraCgz',y));
    if(source.tipMass)add(L,source.tipMass,source.tipFraction*g.tipChord,0);
    const base=source.kind==='custom'?source.items:source.kind==='flight'?prescribedFlightLoads(source,g):[{kind:'point',position:L,force:source.tipForce,fraction:source.tipFraction}];
    const weightN=-gravity.reduce((sum,p)=>sum+p.force,0),appliedN=customResultants(base,g,0).V;
    return {...source,kind:'custom',items:[...base,...gravity],sourceLoad:source,gravitySummary:{weightN,appliedN,netN:appliedN-weightN,quadrature:'4-point Gauss per section interval; rib/cap and sensor masses concentrated at their section centroids'}};
  }
  function validateLoads(items, L) {
    if (!Array.isArray(items) || items.length > 12) throw new Error("Use a list of at most 12 loads.");
    const out = items.map((p, i) => {
      const r = { ...p, fraction: p.fraction == null ? .3 : p.fraction };
      if (!Number.isFinite(r.fraction) || r.fraction < 0 || r.fraction > 1) throw new Error("Load chord fraction must be between 0 and 1.");
      if (r.kind === "point") {
        if (!Number.isFinite(r.position) || r.position <= 0 || r.position > L || !Number.isFinite(r.force)) throw new Error("Wing point loads need 0 < station ≤ span and a finite force. A force applied exactly at the fixed root acts directly on the support; use the beam lesson for that case.");
      } else if (r.kind === "distributed") {
        if (![r.start,r.end,r.qStart,r.qEnd].every(Number.isFinite) || r.start < 0 || r.end > L || r.end <= r.start) throw new Error("Distributed load needs 0 ≤ start < end ≤ span and finite end intensities.");
      } else if (r.kind === "elliptic" || r.kind === "parabolic") {
        return { ...Profiles.normalizeCurve(r, { min: 0, max: L, lengthUnit: "mm", name: `Wing load ${i + 1} (${r.kind})` }), fraction: r.fraction };
      } else if (r.kind === "table") {
        const t = Profiles.normalizeTable(r, { min: 0, max: L, lengthUnit: "mm", allowFraction: true, name: `Wing load ${i + 1} (table)` });
        return { ...t, fraction: r.fraction };
      } else if (r.kind === "schrenk") {
        if (!Number.isFinite(r.total)) throw new Error("A Schrenk load needs a finite total force F (N).");
        return { kind: "schrenk", total: r.total, fraction: r.fraction };
      } else throw new Error("Choose point, distributed, elliptic, parabolic, table or Schrenk loading.");
      return r;
    });
    const segments = Profiles.segmentCount(out);
    if (segments > Profiles.LIMITS.segments) throw new Error(`Use at most ${Profiles.LIMITS.segments} load segments (each load is one, a table counts its rows − 1); this case has ${segments}.`);
    return out;
  }
  // Load stations that must be beam-element boundaries (exact consistent loads, no element straddles a kink).
  const loadStations = (p, L) => p.kind === "point" ? [p.position] : p.kind === "table" ? p.points.map((r) => r[0]) : p.kind === "schrenk" ? [0, L] : [p.start, p.end];
  // The two halves of a Schrenk load as engine primitives: chord-proportional (sampled for a curved planform) and elliptic.
  function schrenkParts(p, g) {
    const L = g.semiSpan, S = Geometry.area(g), F = p.total;
    return [
      g.planform==='elliptic'?chordLoadTable(g,.5*F,p.fraction):{ kind: "distributed", start: 0, end: L, qStart: (0.5 * F * g.rootChord) / S, qEnd: (0.5 * F * g.tipChord) / S },
      Profiles.normalizeCurve({ kind: "elliptic", start: 0, end: L, shape: "start", total: 0.5 * F }, { min: 0, max: L, lengthUnit: "mm" }),
    ];
  }
  /** Intensity (N/mm) and chord fraction of a distributed custom load at y. */
  function customLine(p, g, y) {
    if (p.kind === "schrenk") return schrenkParts(p, g).reduce((q, part) => q + Profiles.valueAt(part, y), 0);
    return Profiles.valueAt(p, y);
  }
  const customFraction = (p, y) => Profiles.fractionAt(p, y);
  function customResultants(items, g, y) {
    let V = 0, M = 0, X = 0;
    for (const p of items) {
      if (p.kind === "point") {
        if (p.position >= y) { V += p.force; M += p.force * (p.position-y); X += p.force * p.fraction * chordAt(g,p.position); }
      } else if (p.kind === "distributed") {
        const a = Math.max(y,p.start), b = p.end;
        if (b <= a) continue;
        const k = (p.qEnd-p.qStart)/(p.end-p.start), c = p.qStart-k*p.start;
        const F = c*(b-a)+k*(b*b-a*a)/2, Y = c*(b*b-a*a)/2+k*(b**3-a**3)/3;
        V += F; M += Y-y*F;
        X += p.fraction*(g.rootChord*F+(g.tipChord-g.rootChord)/g.semiSpan*Y);
      } else {
        // Curved, table and Schrenk loads: exact ∫w and ∫(η − y)w over the outboard part; chord is linear in y.
        const parts = p.kind === "schrenk" ? schrenkParts(p, g) : [p];
        const kc = (g.tipChord - g.rootChord) / g.semiSpan;
        for (const q of parts) {
          const [F, Mo] = Profiles.integrals(q, y, Infinity, y);
          if (!F && !Mo) continue;
          V += F; M += Mo;
          if (q.kind === "table" && q.points[0].length === 3) X += Profiles.weighted(q, y, Infinity, (eta) => customFraction(q, eta) * chordAt(g, eta));
          else X += p.fraction * (g.rootChord * F + kc * (Mo + y * F));
        }
      }
    }
    return { V, M, X };
  }
  // Progressive solving for a responsive interface: analyse station k now, solve() reuses it.
  const stations = (input) => {const n=normalize(input);return Geometry.closedTip(n.g)?[]:n.ySec;};
  function warmStation(input, k) {
    const n = normalize(input);
    const cap=analysisCapability(n.g,input);if(!cap.supported)throw Error(cap.message);
    if(Geometry.closedTip(n.g))return null;
    return cachedSection(n.g, n.pla, n.rod, n.asm, n.ySec[k]);
  }
  function sectionAt(input, y) {
    const n = normalize(input);
    if(Geometry.closedTip(n.g))throw Error('The hollow-section torsion/warping detail is unavailable for exact-tip stress studies, including their solid tip region. Use the nominal section-stress result.');
    return cachedSection(n.g, n.pla, n.rod, n.asm, Math.min(Math.max(y, 0), n.g.semiSpan));
  }

  function solve(input = {}) {
    const normalized=normalize(input),{ g, pla, rod, asm, load:sourceLoad, crit, ySec } = normalized;
    let load=sourceLoad;
    const capability=analysisCapability(g,input);
    if(!capability.supported)throw Error(capability.message);
    if(Geometry.closedTip(g))return solveClosedTipStress(input);
    if(capability.requires3D)return solveSpatial(input,normalized);
    const nGrid = input.nGrid || 901, nElem = requestedElementCount(input);
    const L = g.semiSpan;
    const seamsActive = asm.seamsBonded ? [] : seams(g);
    const ribs = ribStations(g);
    const sections = ySec.map((y) => cachedSection(g, pla, rod, asm, y));
    load=loadWithSelfWeight(sourceLoad,g,pla,sections,ySec,true);
    const col = (k) => sections.map((s) => s[k]);
    const loadNodes = load.kind === "custom" ? load.items.filter(p=>!p.gravity).flatMap(p => loadStations(p, L)) : [];
    const profileNodes=(g.stations||[]).map(s=>s.eta*L);
    const sparEnds=g.spars.map(s=>s.length);
    const yset = new Set([...linspace(0, L, nGrid), ...seams(g), ...ribs, ...loadNodes,...sparEnds,...profileNodes,...(sourceLoad.selfWeight?ySec:[])].map((v) => +v.toFixed(9)));
    const y = Float64Array.from([...yset].sort((a, b) => a - b));
    // Never smear a spar runout into the next bay: interpolate only within the
    // same active-spar segment. End values are inboard limits.
    const active=q=>g.spars.map(s=>q<=s.length+1e-8?1:0).join('');
    const sectionValue=(k,q,log=false)=>{
      if(!g.spars.length)return log?interpLog(q,ySec,col(k)):interpLin(q,ySec,col(k));
      const ids=ySec.map((v,i)=>active(v)===active(q)?i:-1).filter(i=>i>=0),xp=ids.map(i=>ySec[i]),fp=ids.map(i=>sections[i][k]);
      if(!ids.length)throw Error('No section in the spar segment.');
      return log?Math.exp(interp(q,xp,fp.map(Math.log))):interp(q,xp,fp);
    };
    const lin = (k) => (yy) => sectionValue(k,yy);
    const P = {};
    P.chord = y.map((v) => chordAt(g, v));
    for (const k of ["xsc", "xc", "zc", "zTop", "zBot", "mass", "cgx", "polarInertia", "skinWidth", "skinRadius", "EIrods", "rodArea","sparMass","bendCoupling"]) P[k] = y.map(lin(k));
    P.EI = y.map((v) => sectionValue('EIf',v,true));
    P.GJ = y.map((v) => sectionValue('GJ',v,true));

    // mass
    const rho = pla.rho * 1e-3;
    const ribMass = ribs.map((r) => rho * g.ribThickness * lin("ribExtra")(r));
    const ribCg = ribs.map((r) => lin("ribCgx")(r));
    const ribPolar = ribs.map((r) => rho * g.ribThickness * lin("ribPolar")(r));
    const capMass = [0, L].map((r) => rho * g.cap * lin("ribExtra")(r));
    const plaLine = y.map((v, i) => P.mass[i] - rod.rho * 1e-3 * P.rodArea[i]-P.sparMass[i]);
    const shellMass = trapz(plaLine, y);
    const rodsMass = rod.rho * 1e-3 * g.rodFractions.length * Math.PI * rodRadius(g) ** 2 * L;
    const mass = { shell: shellMass, ribs: ribMass.reduce((a, b) => a + b, 0), caps: capMass[0] + capMass[1] };
    mass.printed = mass.shell + mass.ribs + mass.caps;
    mass.rods = rodsMass;
    mass.spars=trapz(P.sparMass,y);
    mass.tip = load.tipMass;
    mass.total = mass.printed + mass.rods + mass.spars + load.tipMass;

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
    } else if (load.kind === "custom") {
      for (const p of load.items) {
        if (p.kind === "point") point.push([p.position,p.force,p.fraction*chordAt(g,p.position)]);
        else if (p.kind === "distributed") { for (let i=0;i<y.length;i++) if (y[i]>=p.start && y[i]<=p.end) {
          const q=p.qStart+(p.qEnd-p.qStart)*(y[i]-p.start)/(p.end-p.start);
          w[i]+=q; wx[i]+=q*p.fraction*chordAt(g,y[i]);
        } }
        else for (let i=0;i<y.length;i++) { const q=customLine(p,g,y[i]); if (q) { w[i]+=q; wx[i]+=q*(p.kind==="table"?customFraction(p,y[i]):p.fraction)*chordAt(g,y[i]); } }
      }
    } else {
      point.push([L, load.tipForce, load.tipFraction * g.tipChord]);
    }
    const Q0 = fromTip(w, y), Q1 = fromTip(w.map((v, i) => v * y[i]), y), X = fromTip(wx, y);
    const V = Float64Array.from(Q0), M = Q1.map((v, i) => v - y[i] * Q0[i]), Xall = Float64Array.from(X);
    for (const [yp, F, xp] of point)
      for (let i = 0; i < y.length; i++)
        if (y[i] <= yp + 1e-9) { V[i] += F; M[i] += F * (yp - y[i]); Xall[i] += F * xp; }
    if (load.kind === "custom") y.forEach((v,i) => { const a=customResultants(load.items,g,v); V[i]=a.V; M[i]=a.M; Xall[i]=a.X; });
    const T = y.map((v, i) => P.xsc[i] * V[i] - Xall[i]);
    const appliedForce = load.kind === "custom" ? customResultants(load.items,g,0).V : trapz(w, y) + point.reduce((s, p) => s + p[1], 0);
    const appliedMoment = load.kind === "custom" ? customResultants(load.items,g,0).M : trapz(w.map((v, i) => v * y[i]), y) + point.reduce((s, p) => s + p[1] * p[0], 0);

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
    if(load.kind==='custom') {
      // Integrate over each load boundary with interior quadrature, not an average
      // across a point-torque jump. This also handles loads close to the root.
      const gx=[.0694318442029737,.330009478207572,.669990521792428,.930568155797026],gw=[.173927422568727,.326072577431273,.326072577431273,.173927422568727];
      twist[0]=0;
      for(let i=1;i<y.length;i++) { const h=y[i]-y[i-1];let inc=0;for(let k=0;k<4;k++){const q=y[i-1]+h*gx[k],rr=customResultants(load.items,g,q);inc+=gw[k]*(lin('xsc')(q)*rr.V-rr.X)/sectionValue('GJ',q,true);}twist[i]=twist[i-1]+h*inc; }
    }
    const seamRot = [];
    for (const s of seamsActive) {
      const Ms = interp(s, y, M), Ts = interp(s, y, T);
      const dth = Ms / kBend, dph = Ts / kTorsAt(s);
      for (let i = 0; i < y.length; i++) if (y[i] > s + 1e-9) { slope[i] += dth; twist[i] += dph; }
      seamRot.push({ y: s, M: Ms, T: Ts, dtheta: dth, dphi: dph });
    }
    const deflection = cumFromRoot(slope, y);
    const chordwiseDeflection=g.spars.length?cumFromRoot(cumFromRoot(y.map((_,i)=>-P.bendCoupling[i]*kappa[i]),y),y):new Float64Array(y.length);
    const bounds = moduleBounds(g);
    let freePlay = 0;
    if (!asm.seamsBonded)
      seams(g).forEach((s, i) => {
        const la = bounds[i + 1] - bounds[i], lb = bounds[i + 2] - bounds[i + 1];
        freePlay += 2 * g.clearance * (1 / la + 1 / lb) * (L - s);
      });

    // 1-D FEM: static and modal
    const mandatory=[0,L,...seams(g),...ribs,...loadNodes,...sparEnds,...profileNodes];
    const regular=linspace(0,L,nElem+1).filter(v=>load.kind!=='custom'||!mandatory.some(p=>Math.abs(v-p)<.1));
    const nodeSet = new Set([...regular,...mandatory].map((v) => +v.toFixed(9)));
    const nodes = [...nodeSet].sort((a, b) => a - b);
    const mesh={requestedElements:nElem,actualElements:nodes.length-1,nodeCount:nodes.length,mandatorySpanStations:[...new Set(mandatory)].sort((a,b)=>a-b)};
    const EIf = (q) => sectionValue('EIf',q,true);
    const GJf = (q) => sectionValue('GJ',q,true);
    const mf = (q) => interp(q, y, P.mass), Ipf = (q) => interp(q, y, P.polarInertia);
    // Polynomial and table loads go through wLine (4-point Gauss, exact for these degrees because every load
    // station is an element boundary); elliptic parts get exact consistent nodal loads through wNodal.
    const ellipticParts = load.kind === "custom" ? load.items.flatMap(p => p.kind === "elliptic" ? [p] : p.kind === "schrenk" ? [schrenkParts(p, g)[1]] : []) : [];
    const wf = load.kind === "custom" ? q => load.items.reduce((sum,p) => sum + (p.kind === "distributed" && q>=p.start && q<=p.end ? p.qStart+(p.qEnd-p.qStart)*(q-p.start)/(p.end-p.start)
      : p.kind === "parabolic" || p.kind === "table" ? Profiles.valueAt(p, q) : p.kind === "schrenk" ? Profiles.valueAt(schrenkParts(p, g)[0], q) : 0),0) : q => interp(q,y,w);
    const wNodal = ellipticParts.length ? (y0, h) => ellipticParts.reduce((acc, part) => { const f = Profiles.hermiteNodal(part, y0, h); return acc.map((v, k) => v + f[k]); }, [0, 0, 0, 0]) : null;
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
      seams: seamsActive, kBend: kb, kTors: kTorsAt, wLine: wf, wNodal, tLine: tf,
      pointForces: point.map(([yp, F]) => [yp, F]), pointTorques, pointMasses: lumped, pointInertias: lumpedI,
      pointTorquesOutboard: load.kind==='custom',
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
    let sigTop = y.map((_, i) => -Ep * kappa[i] * (P.zTop[i] - P.zc[i]));
    let sigBot = y.map((_, i) => -Ep * kappa[i] * (P.zBot[i] - P.zc[i]));
    if(g.spars.length){
      const ext=y.map((v,i)=>{const a=outerContour(g,v,49).map(([x,z])=>-Ep*kappa[i]*((z-P.zc[i])-P.bendCoupling[i]*(x-P.xc[i])));return [Math.min(...a),Math.max(...a)];});
      sigTop=y.map((_,i)=>ext[i][0]);sigBot=y.map((_,i)=>ext[i][1]);
    }
    const skinTop = y.map((_, i) => -Ep * kappa[i] * (P.zTop[i] - t / 2 - P.zc[i]));
    const skinBot = y.map((_, i) => -Ep * kappa[i] * (P.zBot[i] + t / 2 - P.zc[i]));
    const skinComp = y.map((_, i) => g.spars.length?Math.max(0,-sigTop[i],-sigBot[i]):Math.max(Math.max(-skinTop[i], 0), Math.max(-skinBot[i], 0)));
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
    if (!nr) sigRod = new Float64Array(y.length);
    else if (asm.rodsBonded) {
      const off = sections.map((s) => Math.max(...rodCentres(g, s.y).map(([, z]) => Math.abs(z - s.zc))));
      sigRod = y.map((v, i) => rod.E * Math.abs(kappa[i]) * (interpLin(v, ySec, off) + rr));
    } else sigRod = y.map((_, i) => rod.E * Math.abs(kappa[i]) * rr);

    // shear stress at analysis stations (2-D FE, away from the sharp cavity corners)
    const tau = [], tauPeak = [],sparStress=[];
    sections.forEach((s) => {
      const Vs = interp(s.y, y, V), Ts = interp(s.y, y, T);
      const fld = shearField(s, Vs, Ts, g);
      tau.push(fld.nominal);
      tauPeak.push(fld.peak);
      if(s.sparNetwork){
        const curvature=interp(s.y,y,kappa),stress=(p,E)=>-E*curvature*((p[1]-s.zc)-s.bendCoupling*(p[0]-s.xc));
        s.sparInts.forEach(p=>{const values=p.polygon.map(v=>stress(v,p.m.E)),shear=fld.spar.filter(v=>v.index===p.index&&v.kind===p.kind).map(v=>v.tau);sparStress.push({y:s.y,index:p.index,kind:p.kind,tension:Math.max(0,...values),compression:Math.max(0,...values.map(v=>-v)),shear:Math.max(0,...shear),material:p.m});});
      }
    });
    const tauBredt = sections.map((s) => Math.abs(interp(s.y, y, T)) / (2 * s.bredtArea * t));

    // checks
    const F = load.fos;
    const checks = [];
    const ribBearing = [];
    const add = (name, demand, capacity, unit, at, basis, group) => checks.push({ name, demand, capacity, unit, at, basis, group, U: capacity > 0 ? demand / capacity : Infinity });
    const tens = y.map((_, i) => Math.max(sigTop[i], sigBot[i]));
    const comp = y.map((_, i) => Math.max(-sigTop[i], -sigBot[i]));
    const iT = argmaxArr(tens), iC = argmaxArr(comp);
    add("PLA tension (bending)", F * Math.max(tens[iT], 0), pla.ft, "MPa", y[iT], `FoS ${F} × limit stress vs tensile strength`, "strength");
    add("PLA compression (bending)", F * Math.max(comp[iC], 0), pla.fc, "MPa", y[iC], `FoS ${F} × limit stress vs compressive strength`, "strength");
    const kTau = argmaxArr(tau);
    add("PLA shear (transverse shear + torsion, 2-D FE)", F * tau[kTau], pla.fs, "MPa", ySec[kTau], "Max nominal resultant shear away from sharp cavity corners", "strength");
    if(g.spars.length){checks.at(-1).name='Shell shear · bonded thin-wall network';checks.at(-1).basis='Equilibrium + minimum shear energy; thin-wall approximation, not local joint stress';}
    for(let j=0;j<g.spars.length;j++)for(const kind of ['top cap','bottom cap','web'])for(const [quantity,capacity]of [['tension','ft'],['compression','fc'],['shear','fs']]){
      const a=sparStress.filter(v=>v.index===j&&v.kind===kind),v=a.reduce((u,v)=>!u||v[quantity]>u[quantity]?v:u,null);
      if(v)add(`Spar ${j+1} ${kind} · ${quantity}`,F*v[quantity],v.material[capacity],'MPa',v.y,quantity==='shear'?'Bonded thin-wall shear-flow network; local adhesive/runout/crippling not resolved':'Compatible elastic strain about E-weighted neutral axes; cap/web material allowable','spar');
    }
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
        for (const [station,lever] of [[inner,leverA],[outer,leverB]]) ribBearing.push({station,seam:s,forcePerRod:Ms/nr/lever,stress:Ms/nr/lever/(g.rodDiameter*g.ribThickness)});
        const dowel = ((4 / 3) * (Vs / nr)) / (Math.PI * rr * rr);
        if (!worst || rodSig > worst[1]) worst = [s, rodSig, bearing, dowel];
      }
      const [s, rodSig, bearing, dowel] = worst;
      add("Rod bending at dry seam (rods carry the whole moment)", F * rodSig, Math.min(rod.ft, rod.fc), "MPa", s, "σ = (M/n) r / I_rod", "joint");
      add("Rib-hole bearing at dry seam (screening)", F * bearing, pla.fc, "MPa", s, "rod moment reacted by a force couple between interface rib and next rib", "joint");
      add("Rod dowel shear at dry seam", F * dowel, rod.fs, "MPa", s, "4V/(3 n π r²)", "joint");
    } else if (nr) {
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
    if(pla.key==='custom_shell')checks.forEach(c=>{if(c.name.startsWith('PLA '))c.name='Shell '+c.name.slice(4);});

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
      y, props: P, w, point, V, M, T, kappa, slope, deflection,chordwiseDeflection, twist, fem, mesh, seamsActive, seamRot,
      seam: { kBend, freeLength: Lf, freePlay: asm.seamsBonded ? 0 : freePlay },
      ribs, seams: seams(g), mass, stiffness, liftN, appliedForce, appliedMoment,
      stress: { sigTop, sigBot, skinComp, sigCr, sigFlat, sigCyl, sigRod, tau, tauPeak, tauBredt,spars:sparStress },
      sparModel:g.spars.length?{method:'Bonded thin-wall beam: transformed section bending + energy-compatible shear-flow network',limitations:['Perfect continuous bond; adhesive stress and debonding not calculated','Sectionwise locally prismatic shear flow; no 3-D taper/runout stress','Cap/web local buckling, crippling and spar runout stresses unresolved','Independent normal/shear allowable checks; combined material failure interaction not resolved','Open-cap local Saint-Venant torsion neglected','Modes are uncoupled beam modes, not a coupled 3-D flutter spectrum','Mixed rod/spar joint model not validated; compare them separately'],rootNetwork:sections[0].sparNetwork.method}:null,
      checks, governing, verification, ribBearing,
    };
  }

  // Spatial extension. The legacy straight-wing route above is deliberately
  // unchanged. Normal cuts are affine projections of aircraft x-z sections;
  // dA_normal = |t_y| dA_xz and ds = dy/|t_y| preserve physical volume.
  function solveClosedTipStress(input){
    if(!ClosedTipStress)throw Error('Load wing_closed_tip_stress.js before engine.js for exact-tip section stress.');
    return ClosedTipStress.solve(input,{E:{ringLoops,outerContour,cavityTipLimit,ribStations,seams,sparParts},normalize,polyIntegrals,prescribedFlightLoads,customLine,customFraction,Geometry,Frame,GRAV,Profiles,chordAt,airfoilAt,requestedElementCount});
  }
  function solveSpatial(input,n=normalize(input)) {
    if(Geometry.closedTip(n.g)){const cap=analysisCapability(n.g,input);if(!cap.supported)throw Error(cap.message);return solveClosedTipStress(input);}
    const {g,pla,rod,asm,load:sourceLoad,crit}=n,L=g.semiSpan,F=Frame;
    let load=sourceLoad;
    const count=requestedElementCount(input,MESH_LIMITS.spatialDefault);
    const cap=analysisCapability(g,input);if(!cap.supported)throw Error(cap.message);
    if(input.nSections!=null&&(!Number.isInteger(input.nSections)||input.nSections<3||input.nSections>31))throw Error('The spatial beam supports 3–31 numerical section samples.');
    const ys=[...new Set([...n.ySec,L])].sort((a,b)=>a-b),local=ys.map(y=>cachedSection(g,pla,rod,asm,y));
    load=loadWithSelfWeight(sourceLoad,g,pla,local,ys);
    const frac=g.twistReferenceFraction??.25;
    let reference=ys.map(y=>Geometry.transformPoint(g,y,[frac*chordAt(g,y),0])),samples=[],axisChange=0;
    const projectedCache=new Map();
    function projectSection(sec,y,tangent){
      const angle=Geometry.stationAt(g,y).incidenceDeg*Math.PI/180,ex=[Math.cos(angle),0,-Math.sin(angle)],ez=[Math.sin(angle),0,Math.cos(angle)];
      const R=F.basis([0,0,0],tangent,ex),B=[[F.dot(R[1],ex),F.dot(R[1],ez)],[F.dot(R[2],ex),F.dot(R[2],ez)]],det=B[0][0]*B[1][1]-B[0][1]*B[1][0],area=Math.abs(det);
      if(area<.35)throw Error('The 3-D beam section projection is too oblique (|t_y| < 0.35). Reduce sweep/dihedral; this beam approximation is not admitted for nearly span-normal section planes.');
      const map=p=>[B[0][0]*p[0]+B[0][1]*p[1],B[1][0]*p[0]+B[1][1]*p[1]];
      const nodes=new Float64Array(sec.mesh.nodes.length);for(let i=0;i<nodes.length;i+=2){const q=map([sec.mesh.nodes[i],sec.mesh.nodes[i+1]]);nodes[i]=q[0];nodes[i+1]=q[1];}
      const mesh={...sec.mesh,nodes},network=sec.sparNetwork?Spars.projectedNetwork(sec.sparNetwork,B):null;
      let fe=null;
      if(!network){
        if(Math.abs(area-1)<1e-12){const sc=map([sec.fe.xsc,sec.fe.zsc]);fe={J:sec.fe.J,xsc:sc[0],zsc:sc[1]};}
        else{
          const key=JSON.stringify([airfoilAt(g,y),sec.chord,g.skin,g.te,g.cavityStart,g.cavityEnd,B.flat().map(v=>+v.toFixed(10))]);
          if(!projectedCache.has(key))projectedCache.set(key,shellFE(mesh));
          fe=projectedCache.get(key);
        }
      }
      const sc=[network?.xsc??fe.xsc,network?.zsc??fe.zsc],centre=map([sec.xc,sec.zc]),d=F.sub(centre,sc);
      const C=[[sec.EIc,sec.EIxz],[sec.EIxz,sec.EIf+(sec.sparNetwork?sec.EIxz**2/sec.EIc:0)]];
      const Q=Array.from({length:2},(_,i)=>Array.from({length:2},(_,j)=>area*B[i].reduce((v,a,k)=>v+a*B[j].reduce((w,b,h)=>w+b*C[k][h],0),0)));
      const EA=area*sec.EA,props={EA,first2:EA*d[0],first3:EA*d[1],EI22:Q[1][1]+EA*d[1]**2,EI33:Q[0][0]+EA*d[0]**2,EI23:Q[0][1]+EA*d[0]*d[1],GJ:network?.GJ??shearModulus(pla)*fe.J};
      const scLocal=[(B[1][1]*sc[0]-B[0][1]*sc[1])/det,(-B[1][0]*sc[0]+B[0][0]*sc[1])/det];
      return {y,R,B,area,scLocal,reference:Geometry.transformPoint(g,y,scLocal),...props,D:Frame.constitutive(props),local:sec,mesh,fe,network};
    }
    // Iterate the normal-cut orientation onto the elastic shear-centre path,
    // rather than using the silhouette's slope as a fictitious beam direction.
    for(let iteration=0;iteration<6;iteration++){
      const previous=reference;
      samples=ys.map((y,i)=>{
        const a=previous[Math.max(0,i-1)],b=previous[Math.min(ys.length-1,i+1)];
        return projectSection(local[i],y,F.unit(F.sub(b,a)));
      });
      reference=samples.map(s=>s.reference);axisChange=Math.max(...reference.map((p,i)=>F.norm(F.sub(p,previous[i]))));
      if(axisChange<1e-5)break;
    }
    if(axisChange>=1e-5)throw Error('The 3-D beam normal-cut/shear-centre iteration did not converge to 0.00001 mm. Reduce geometric gradients or increase section resolution; no unconverged structural result is returned.');
    const column=k=>samples.map(s=>s[k]),at=(k,y)=>interp(y,ys,column(k)),scAt=y=>[interp(y,ys,samples.map(s=>s.scLocal[0])),interp(y,ys,samples.map(s=>s.scLocal[1]))];
    const referenceAt=y=>Geometry.transformPoint(g,y,scAt(y));
    const normalIntegralCache=new Map();
    function sectionData(y,tangent,axisPoint=referenceAt(y)){
      const p={GJ:at('GJ',y)};
      const a=Geometry.stationAt(g,y).incidenceDeg*Math.PI/180,ex=[Math.cos(a),0,-Math.sin(a)],ez=[Math.sin(a),0,Math.cos(a)],R=F.basis([0,0,0],tangent,ex);
      p.R=R;p.B=[[F.dot(R[1],ex),F.dot(R[1],ez)],[F.dot(R[2],ex),F.dot(R[2],ez)]];p.reference=axisPoint;p.scLocal=Geometry.inversePoint(g,axisPoint);
      // Never interpolate tensor entries written in different moving bases.
      // Integrate the local material polygon and project it into THIS element's
      // normal plane about its actual straight-axis piercing point.
      p.D=normalRecoveryD(y,p);Object.assign(p,{EA:p.D[0][0],first2:-p.D[0][2],first3:p.D[0][1],EI22:p.D[1][1],EI33:p.D[2][2],EI23:-p.D[1][2]});return p;
    }
    const sourceItems=load.kind==='flight'?prescribedFlightLoads(load,g):load.kind==='tip'?[{kind:'point',position:L,force:load.tipForce,fraction:load.tipFraction}]:load.items;
    const items=sourceItems.flatMap(p=>g.planform==='elliptic'&&p.kind==='schrenk'?schrenkParts(p,g).map(part=>({...part,fraction:p.fraction})):[p]);
    const physical=[0,L,...(g.stations||[]).map(s=>s.eta*L),...ribStations(g),...seams(g),...g.spars.map(s=>s.length),...items.filter(p=>!p.gravity).flatMap(p=>loadStations(p,L))];
    const mandatory=[...physical,...ys.filter(y=>!physical.some(p=>Math.abs(p-y)<.1))];
    const regular=linspace(0,L,count+1).filter(y=>!mandatory.some(v=>Math.abs(v-y)<.1));
    let nodeY=[...new Set([...mandatory,...regular].map(y=>+y.toFixed(9)))].sort((a,b)=>a-b),nodes=nodeY.map(referenceAt);
    const loadPoint=(p,y)=>Geometry.transformPoint(g,y,p.localPoint||[customFraction(p,y)*chordAt(g,y),0]);
    // Conservative, outward-padded analytic intervals, not point sampling.
    // They certify load-path monotonicity before any normal-foot bisection.
    const interval=(a,b=a)=>{const e=32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));return [Math.min(a,b)-e,Math.max(a,b)+e];};
    const addI=(a,b)=>interval(a[0]+b[0],a[1]+b[1]),subI=(a,b)=>interval(a[0]-b[1],a[1]-b[0]),mulI=(a,b)=>{const q=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return interval(Math.min(...q),Math.max(...q));},scaleI=(a,b)=>mulI(a,[b,b]),dotI=(a,b)=>a.reduce((q,v,i)=>addI(q,mulI(v,b[i])),[0,0]);
    const squareMin=a=>a[0]<=0&&a[1]>=0?0:Math.min(a[0]**2,a[1]**2),absMax=a=>Math.max(Math.abs(a[0]),Math.abs(a[1]));
    function polynomialBounds(c,a,b){const value=t=>c.reduceRight((s,v)=>s*t+v,0),points=[a,b],A=3*(c[3]||0),B=2*(c[2]||0),C=c[1]||0;if(A!==0){const d=B*B-4*A*C;if(d>=0){const s=Math.sqrt(d),q=-.5*(B+(B>=0?s:-s)),roots=q===0?[-B/(2*A)]:[q/A,C/q];for(const t of roots)if(t>a&&t<b)points.push(t);}}else if(B!==0){const t=-C/B;if(t>a&&t<b)points.push(t);}const v=points.map(value);return interval(Math.min(...v),Math.max(...v));}
    function trigBounds(a,b,cosine){const fn=cosine?Math.cos:Math.sin,v=[fn(a),fn(b)];for(let k=Math.ceil(a/(Math.PI/2));k*Math.PI/2<b;k++)v.push(fn(k*Math.PI/2));return interval(Math.min(...v),Math.max(...v));}
    function sourcePathBounds(p,a,b){
      // Every source interval is split at table rows and incidence stations:
      // f(s) and alpha(s) are linear. c(s) is linear or a trimmed ellipse;
      // its derivative is monotone, so endpoint derivative bounds enclose it.
      // of the exact physical position AND derivative over the whole interval.
      const c=interval(chordAt(g,a),chordAt(g,b)),f=interval(customFraction(p,a),customFraction(p,b)),cp=interval(Geometry.chordDerivative(g,a),Geometry.chordDerivative(g,b)),fp=(customFraction(p,b)-customFraction(p,a))/(b-a),pivot=g.twistReferenceFraction??.25,sweepRef=g.planform==='delta'?1:(g.sweepReferenceFraction??(g.planform==='elliptic'?.5:0)),alpha0=Geometry.stationAt(g,a).incidenceDeg*Math.PI/180,alpha1=Geometry.stationAt(g,b).incidenceDeg*Math.PI/180,ap=(alpha1-alpha0)/(b-a),angles=[Math.min(alpha0,alpha1),Math.max(alpha0,alpha1)],co=trigBounds(...angles,true),si=trigBounds(...angles,false),arm=mulI(subI(f,[pivot,pivot]),c),armPrime=addI(mulI(subI(f,[pivot,pivot]),cp),scaleI(c,fp)),sx=Math.tan((g.sweepDeg||0)*Math.PI/180),sz=Math.tan((g.dihedralDeg||0)*Math.PI/180),baseX=addI(addI(scaleI([a,b],sx),scaleI(c,pivot-sweepRef)),[sweepRef*g.rootChord,sweepRef*g.rootChord]);
      return {position:[addI(baseX,mulI(arm,co)),[a,b],subI(scaleI([a,b],sz),mulI(arm,si))],velocity:[subI(addI(addI([sx,sx],scaleI(cp,pivot-sweepRef)),mulI(armPrime,co)),scaleI(mulI(arm,si),ap)),[1,1],subI(subI([sz,sz],mulI(armPrime,si)),scaleI(mulI(arm,co),ap))]};
    }
    function makeAxis(stations,coordinates){
      let length=0;const segments=coordinates.slice(1).map((b,i)=>{const a=coordinates[i],d=F.sub(b,a),L=F.norm(d),s0=length;length+=L;return {a,b,L,tangent:F.scale(d,1/L),s0,y0:stations[i],y1:stations[i+1]};});
      return {segments,length};
    }
    // A continuous normal family avoids gaps/fans at polygonal FE-axis kinks.
    // The Hermite curve is a geometric reference; the frame still approximates
    // it with straight elements. Reject ambiguous normal-foot assignments.
    function normalFamily(stations,coordinates){
      const slope=coordinates.map((p,i)=>{const a=Math.max(0,i-1),b=Math.min(coordinates.length-1,i+1);return F.scale(F.sub(coordinates[b],coordinates[a]),1/(stations[b]-stations[a]));});
      const polynomials=coordinates.slice(1).map((b,i)=>{const a=coordinates[i],h=stations[i+1]-stations[i],m=F.scale(slope[i],h),n=F.scale(slope[i+1],h),o=[a,m,F.sub(F.sub(F.scale(F.sub(b,a),3),F.scale(m,2)),n),F.add(F.scale(F.sub(a,b),2),F.add(m,n))],d=[o[1],F.scale(o[2],2),F.scale(o[3],3)],base=new Array(6).fill(0);o.forEach((v,k)=>d.forEach((w,j)=>base[k+j]-=F.dot(v,w)));return {h,o,d,base};});
      const evaluate=(p,t)=>{let v=0;for(let i=p.length-1;i>=0;i--)v=v*t+p[i];return v;};
      function polynomialRoots(coeff){const p=[...coeff],scale=Math.max(...p.map(Math.abs),1),tolerance=2e-13*scale;while(p.length>1&&Math.abs(p.at(-1))<1e-15*scale)p.pop();if(p.length===1){if(Math.abs(p[0])<=tolerance)throw Error('A whole normal-reference interval maps to the same physical point; the normal mapping is ambiguous.');return [];}if(p.length===2){const t=-p[0]/p[1];return t>=-1e-12&&t<=1+1e-12?[Math.max(0,Math.min(1,t))]:[];}const critical=polynomialRoots(p.slice(1).map((v,i)=>v*(i+1))),bounds=[0,...critical.filter(t=>t>1e-12&&t<1-1e-12),1],roots=[];for(const t of bounds)if(Math.abs(evaluate(p,t))<=tolerance)roots.push(t);for(let i=1;i<bounds.length;i++){let a=bounds[i-1],b=bounds[i],fa=evaluate(p,a),fb=evaluate(p,b);if(fa*fb>=0)continue;for(let k=0;k<40;k++){const t=(a+b)/2,f=evaluate(p,t);if(fa*f<=0)b=t;else{a=t;fa=f;}}roots.push((a+b)/2);}return roots.sort((a,b)=>a-b).filter((t,i,a)=>i===0||t-a[i-1]>1e-9);}
      function at(y){let i=0;while(i<stations.length-2&&y>stations[i+1])i++;const h=stations[i+1]-stations[i],t=(y-stations[i])/h,a=coordinates[i],b=coordinates[i+1],m=slope[i],n=slope[i+1],o=[],d=[],dd=[];for(let k=0;k<3;k++){o[k]=(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*m[k]+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*n[k];d[k]=((6*t*t-6*t)*a[k]+(3*t*t-4*t+1)*h*m[k]+(-6*t*t+6*t)*b[k]+(3*t*t-2*t)*h*n[k])/h;dd[k]=((12*t-6)*a[k]+(6*t-4)*h*m[k]+(-12*t+6)*b[k]+(6*t-2)*h*n[k])/(h*h);}const speed=F.norm(d),normal=F.scale(d,1/speed),dn=F.scale(F.sub(dd,F.scale(normal,F.dot(normal,dd))),1/speed);return {reference:o,normal,dn,speed};}
      const locationCache=new Map();
      function locate(P){const key=P.join(',');if(locationCache.has(key))return locationCache.get(key);const f=y=>{const a=at(y);return F.dot(F.sub(P,a.reference),a.normal);},roots=[];polynomials.forEach((p,i)=>{const h=p.base.map((v,k)=>v+(k<3?F.dot(P,p.d[k]):0));for(const t of polynomialRoots(h))roots.push(stations[i]+t*p.h);});const unique=roots.filter((v,i)=>!roots.slice(0,i).some(w=>Math.abs(v-w)<1e-6));if(unique.length>1)throw Error('Ambiguous physical-point normal mapping: multiple normal planes intersect this point. Reduce geometric gradients; no nearest-plane assignment is fabricated.');let out;if(unique.length===1){const station=unique[0],a=at(station),margin=a.speed-F.norm(F.sub(P,a.reference))*F.norm(a.dn);if(!(margin>1e-7))throw Error('Ill-conditioned normal-plane mapping: section radius times normal gradient reaches the reference-axis speed. Reduce curvature/twist.');out={...a,station,boundedStation:station,outside:null,resolved:true};}else{const a=at(0),b=at(L),root=f(0)<0;if((root&&f(L)<0)||(!root&&f(0)>0&&f(L)>0)){const end=root?a:b,station=(root?0:L)+F.dot(F.sub(P,end.reference),end.normal)/end.speed;out={...end,station,boundedStation:root?0:L,outside:root?'root':'tip',resolved:false};}else throw Error('Physical-point normal mapping could not be resolved; no coordinate clamping is silently applied.');}locationCache.set(key,out);return out;}
      function certifyPath(pathBounds,a,b){
        let boxes=0;
        function check(p,sa,sb,ta,tb,depth){
          if(++boxes>20000)throw Error('Normal load path monotonicity could not be certified within the bounded interval budget. Reduce incidence/profile/chordwise-load gradients or split the load.');
          const path=pathBounds(sa,sb),origin=[0,1,2].map(k=>polynomialBounds(p.o.map(v=>v[k]),ta,tb)),d=[0,1,2].map(k=>scaleI(polynomialBounds(p.d.map(v=>v[k]),ta,tb),1/p.h)),dd=[0,1,2].map(k=>scaleI(polynomialBounds([2*p.o[2][k],6*p.o[3][k]],ta,tb),1/(p.h*p.h))),arm=path.position.map((v,k)=>subI(v,origin[k])),h=dotI(arm,d),numerator=dotI(path.velocity,d),radius=Math.hypot(...arm.map(absMax)),curvature=Math.hypot(...dd.map(absMax)),speedSquared=d.reduce((s,v)=>s+squareMin(v),0);
          // If a normal root is possible, this stronger radius bound implies
          // both the existing point-conditioning screen and dH/dY<0. Together
          // with P'(s).o'(Y)>0 it proves a unique increasing normal-foot path:
          // dY/ds = P'.o' / (|o'|^2-(P-o).o''). Off-root boxes need no radius
          // screen, but still bound the endpoint-extension path direction.
          if(numerator[0]>1e-8*Math.max(1,absMax(numerator))&&(h[0]>1e-8||h[1]<-1e-8||speedSquared-radius*curvature>1e-8*Math.max(1,speedSquared,radius*curvature)))return;
          if(depth>=14)throw Error('Normal load path monotonicity is folded or cannot be certified by conservative analytic interval bounds. Reduce incidence/profile/chordwise-load gradients or split the load; no monotone fit or force relocation is applied.');
          if(depth%2===0){const mid=(sa+sb)/2;check(p,sa,mid,ta,tb,depth+1);check(p,mid,sb,ta,tb,depth+1);}else{const mid=(ta+tb)/2;check(p,sa,sb,ta,mid,depth+1);check(p,sa,sb,mid,tb,depth+1);}
        }
        for(const p of polynomials)check(p,a,b,0,1,0);
        return boxes;
      }
      return {at,locate,atY:y=>at(y).reference,certifyPath};
    }
    // The geometric normal family is defined by the converged numerical
    // section stations, NOT by arbitrary FE/load/rib node spacing. Refining the
    // longitudinal mesh must not introduce artificial reference curvature at
    // corners of a linear interpolation of shear-centre sample coordinates.
    const normals=normalFamily(ys,reference),pointFeet=items.flatMap((p,i)=>{if(p.kind!=='point'||p.gravity)return [];try{const foot=normals.locate(loadPoint(p,p.position));return foot.outside?[]:[foot.station];}catch(error){throw Error(`Wing load ${i+1} (point), aircraft y=${p.position} mm, x/c=${p.fraction}: ${error.message} Reduce profile/incidence gradients or move this load; no nearest-plane clamp is applied.`);}});
    nodeY=[...nodeY];for(const y of pointFeet)if(!nodeY.some(q=>Math.abs(q-y)<.1-1e-9))nodeY.push(y);nodeY.sort((a,b)=>a-b);nodes=nodeY.map(normals.atY);
    if(nodeY.length>161)throw Error('The 3-D frame is limited to 161 nodes. Reduce load-table rows or geometry stations.');
    const axis=makeAxis(nodeY,nodes),loadMapping={method:'Physical loads projected to normal-axis feet; consistent work integrated per original aircraft-y coordinate',endWrenches:[],monotonicity:{method:'Conservative analytic interval bounds of physical-path and C1-normal-family derivatives; no endpoint-sampling certificate',certifiedSourcePanels:0,intervalBoxes:0}};
    const lineForce=(p,y)=>p.kind==='point'?0:p.kind==='distributed'?(y>=p.start&&y<=p.end?p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start):0):customLine(p,g,y);
    const elements=nodeY.slice(1).map((b,i)=>{
      const a=nodeY[i],mid=(a+b)/2,tangent=F.unit(F.sub(nodes[i+1],nodes[i])),p=sectionData(mid,tangent,F.scale(F.add(nodes[i],nodes[i+1]),.5)),angle=Geometry.stationAt(g,mid).incidenceDeg*Math.PI/180;
      return {a:i,b:i+1,...p,orientation:[Math.cos(angle),0,-Math.sin(angle)],spanStart:a,spanEnd:b,consistentLoad:new Float64Array(13)};
    });
    const sourceIntervals=p=>{const bounds=p.kind==='table'?p.points.map(q=>q[0]):p.kind==='schrenk'?[0,L]:[p.start,p.end],base=[...new Set([...bounds,...ys.filter(y=>y>bounds[0]&&y<bounds.at(-1))])].sort((a,b)=>a-b);return base.slice(1).flatMap((b,i)=>Array.from({length:8},(_,k)=>[base[i]+(b-base[i])*k/8,base[i]+(b-base[i])*(k+1)/8]));};
    function footAt(P){const p=normals.locate(P);let index=0;while(index<elements.length-1&&p.boundedStation>nodeY[index+1])index++;return {...p,index,arc:p.boundedStation};}
    function loadVector(index,P,force,foot=footAt(P)){const e=elements[index],seg=axis.segments[index],t=Math.max(0,Math.min(1,(foot.boundedStation-nodeY[index])/(nodeY[index+1]-nodeY[index]))),A=F.add(seg.a,F.scale(seg.tangent,t*seg.L)),moment=F.cross(F.sub(P,A),force),R=F.basis(seg.a,seg.b,e.orientation);return F.pointLoadVector(R,seg.L,t,force,moment);}
    items.forEach((p,loadIndex)=>{
      if(p.kind==='point'){const P=loadPoint(p,p.position),foot=footAt(P),v=loadVector(foot.index,P,[0,0,p.force],foot);v.forEach((x,i)=>elements[foot.index].consistentLoad[i]+=x);if(foot.outside)loadMapping.endWrenches.push({load:loadIndex+1,end:foot.outside,sourceStation:p.position,normalFootStation:foot.station,reason:'Normal foot lies outside the finite beam; an equivalent end wrench preserves the full global force and moment, but local end-zone response is nominal.'});return;}
      for(const[a,b]of sourceIntervals(p)){
        try{loadMapping.monotonicity.intervalBoxes+=normals.certifyPath((lo,hi)=>sourcePathBounds(p,lo,hi),a,b);loadMapping.monotonicity.certifiedSourcePanels++;}catch(error){throw Error(`Wing load ${loadIndex+1} (${p.kind}), aircraft y=${a}…${b} mm: ${error.message}`);}
        const sa=normals.locate(loadPoint(p,a)).station,sb=normals.locate(loadPoint(p,b)).station;
        if(sb<sa-1e-7)throw Error('A prescribed load path reverses along the normal beam coordinate. Split/redefine this folded chordwise load path; no monotone-load approximation is silently applied.');
        const split=[a,b];for(const target of nodeY)if(target>sa+1e-9&&target<sb-1e-9){let lo=a,hi=b;for(let k=0;k<32;k++){const mid=(lo+hi)/2;if(normals.locate(loadPoint(p,mid)).station<target)lo=mid;else hi=mid;}split.push((lo+hi)/2);}split.sort((x,y)=>x-y);
        for(let j=1;j<split.length;j++){const lo=split[j-1],hi=split[j],foot=footAt(loadPoint(p,(lo+hi)/2)),v=F.integrate(y=>loadVector(foot.index,loadPoint(p,y),[0,0,lineForce(p,y)]),lo,hi);v.forEach((x,i)=>elements[foot.index].consistentLoad[i]+=x);if(foot.outside)loadMapping.endWrenches.push({load:loadIndex+1,end:foot.outside,sourceStart:lo,sourceEnd:hi,reason:'Outside-axis part of this line load is retained as an equivalent end wrench; end-zone stresses are unresolved.'});}
      }
    });
    const frame=F.solve({nodes,elements});
    const mesh={requestedElements:count,actualElements:frame.elements.length,nodeCount:nodes.length,mandatorySpanStations:[...new Set(mandatory)].sort((a,b)=>a-b)};
    function frameAt(y){let i=0;while(i<nodeY.length-2&&y>nodeY[i+1])i++;const e=frame.elements[i],t=Math.max(0,Math.min(1,(y-nodeY[i])/(nodeY[i+1]-nodeY[i])));return {...F.sampleElement(e,t),reference:F.add(nodes[i],F.scale(F.sub(nodes[i+1],nodes[i]),t)),element:e,t};}
    function normalRecoveryD(y,cut){
      // Stress recovery must balance the actual local material section, not
      // an interpolation of tensors expressed in neighbouring moving frames.
      // Polygon integrals require no additional torsion/warping FE solves.
      if(!normalIntegralCache.has(y)){const loops=ringLoops(g,y),outer=polyIntegrals(loops.outer),inner=polyIntegrals(loops.inner),sum=outer.map((v,i)=>pla.E*(v-inner[i]));for(const part of sparParts(g,y))for(const polygon of part.polygons){const p=polyIntegrals(polygon);p.forEach((v,i)=>sum[i]+=part.s.material.E*v);}normalIntegralCache.set(y,sum);}
      const sum=normalIntegralCache.get(y);
      const EA=sum[0],x=cut.scLocal[0],z=cut.scLocal[1],X=sum[2]-EA*x,Z=sum[1]-EA*z,XX=sum[4]-2*x*sum[2]+EA*x*x,ZZ=sum[3]-2*z*sum[1]+EA*z*z,XZ=sum[5]-x*sum[1]-z*sum[2]+EA*x*z,B=cut.B,area=Math.abs(B[0][0]*B[1][1]-B[0][1]*B[1][0]),C=[[XX,XZ],[XZ,ZZ]],Q=(a,b)=>a.reduce((v,c,i)=>v+c*b.reduce((w,d,j)=>w+d*C[i][j],0),0);
      return F.constitutive({EA:area*EA,first2:area*(B[0][0]*X+B[0][1]*Z),first3:area*(B[1][0]*X+B[1][1]*Z),EI22:area*Q(B[1],B[1]),EI33:area*Q(B[0],B[0]),EI23:area*Q(B[0],B[1]),GJ:cut.GJ});
    }
    const cutCache=new Map();
    const rootFace=outerContour(g,0,81).map(p=>Geometry.transformPoint(g,0,p)),tipFace=outerContour(g,L,81).map(p=>Geometry.transformPoint(g,L,p));
    function endZone(reference,normal,y){const root=Math.max(...rootFace.map(p=>F.dot(F.sub(p,reference),normal))),tip=Math.min(...tipFace.map(p=>F.dot(F.sub(p,reference),normal)));return root>1e-7||y<1e-8?'root':tip< -1e-7||y>L-1e-8?'tip':null;}
    function cutAt(y){
      if(cutCache.has(y))return cutCache.get(y);
      const out=frameAt(y),plane=normals.at(y),s=sectionData(y,plane.normal,plane.reference),reference=s.reference;let force=[0,0,0],moment=[0,0,0];
      const signed=P=>F.dot(F.sub(P,reference),plane.normal);
      for(const p of items){
        if(p.kind==='point'){const P=loadPoint(p,p.position);if(signed(P)>=-1e-9){const v=[0,0,p.force];force=F.add(force,v);moment=F.add(moment,F.cross(F.sub(P,reference),v));}continue;}
        for(const[a,b]of sourceIntervals(p)){const fa=signed(loadPoint(p,a)),fb=signed(loadPoint(p,b)),split=[a,b];if(fa*fb<0){let lo=a,hi=b;for(let k=0;k<38;k++){const mid=(lo+hi)/2;if(signed(loadPoint(p,mid))*fa>0)lo=mid;else hi=mid;}split.push((lo+hi)/2);}split.sort((u,v)=>u-v);for(let j=1;j<split.length;j++){const lo=split[j-1],hi=split[j];if(signed(loadPoint(p,(lo+hi)/2))<0)continue;const r=F.integrate(qy=>{const v=[0,0,lineForce(p,qy)],m=F.cross(F.sub(loadPoint(p,qy),reference),v);return [...v,...m];},lo,hi);force=F.add(force,Array.from(r.slice(0,3)));moment=F.add(moment,Array.from(r.slice(3,6)));}}
      }
      const fl=F.toLocal(s.R,force),ml=F.toLocal(s.R,moment),recoveryD=normalRecoveryD(y,s),strain=F.solveSPD(recoveryD,[fl[0],ml[1],ml[2],ml[0]]);
      const cut={...s,y,recoveryD,force,moment,localForce:fl,localMoment:ml,strain:Array.from(strain),displacement:out.displacement,rotation:out.rotation,endZone:endZone(reference,plane.normal,y),nominal:true};
      if(cutCache.size>60000)cutCache.clear();cutCache.set(y,cut);return cut;
    }
    const y=Float64Array.from([...new Set([...linspace(0,L,Math.min(1001,input.nGrid||201)),...nodeY])].sort((a,b)=>a-b)),cuts=Array.from(y,cutAt),response=Array.from(y,frameAt);
    const normalStress=(cut,point,E=pla.E)=>{const dx=point[0]-cut.scLocal[0],dz=point[1]-cut.scLocal[1],q2=cut.B[0][0]*dx+cut.B[0][1]*dz,q3=cut.B[1][0]*dx+cut.B[1][1]*dz;return E*(cut.strain[0]+cut.strain[1]*q3-cut.strain[2]*q2);};
    const tension=[],compression=[],sparStress=[];
    cuts.forEach((c,i)=>{
      if(c.endZone){tension.push(NaN);compression.push(NaN);return;}
      const stresses=outerContour(g,y[i],81).map(p=>normalStress(c,p));tension.push(Math.max(0,...stresses));compression.push(Math.max(0,...stresses.map(v=>-v)));
      sparParts(g,y[i]).forEach(p=>{let entry=sparStress.find(s=>s.index===p.index);if(!entry){entry={index:p.index,material:p.s.material,tension:0,compression:0,shear:null};sparStress.push(entry);}const stress=p.polygons.flat().map(q=>normalStress(c,q,p.s.material.E));entry.tension=Math.max(entry.tension,...stress);entry.compression=Math.max(entry.compression,...stress.map(v=>-v));});
    });
    const lineMass=y.map(q=>interp(q,ys,local.map(s=>s.mass))),rho=pla.rho*1e-3,ribs=ribStations(g),ribMass=ribs.map(q=>rho*g.ribThickness*interp(q,ys,local.map(s=>s.ribExtra))),capMass=[0,L].map(q=>rho*g.cap*interp(q,ys,local.map(s=>s.ribExtra))),sparMass=trapz(y.map(q=>interp(q,ys,local.map(s=>s.sparMass))),y),bodyMass=trapz(lineMass,y);
    const mass={shell:bodyMass-sparMass,ribs:ribMass.reduce((a,b)=>a+b,0),caps:capMass[0]+capMass[1],spars:sparMass,rods:0,tip:load.tipMass};mass.printed=mass.shell+mass.ribs+mass.caps;mass.total=mass.printed+sparMass+load.tipMass;
    const deflection=Float64Array.from(response,r=>r.displacement[2]),chordwiseDeflection=Float64Array.from(response,r=>r.displacement[0]),twist=Float64Array.from(response,r=>F.dot(r.rotation,r.element.R[0])),elasticIncidenceDeg=frame.rotations.map(r=>r[1]*180/Math.PI);
    const root=cuts[0],sigTop=Float64Array.from(tension),sigBot=Float64Array.from(compression,v=>-v),V=Float64Array.from(cuts,c=>c.force[2]),M=Float64Array.from(cuts,c=>F.norm(c.moment)),T=Float64Array.from(cuts,c=>c.localMoment[0]);
    // A normal root cut may exclude physical loads on its inboard side. The
    // total applied wrench and support equilibrium must still include ALL loads.
    let appliedWrench=[0,0,0,0,0,0];for(const p of items){const add=(qy,v)=>{const force=[0,0,v],moment=F.cross(F.sub(loadPoint(p,qy),nodes[0]),force);return [...force,...moment];};if(p.kind==='point')appliedWrench=F.add(appliedWrench,add(p.position,p.force));else for(const[a,b]of sourceIntervals(p))appliedWrench=F.add(appliedWrench,F.integrate(q=>add(q,lineForce(p,q)),a,b));}
    const limitations=['Linear small-displacement Euler–Bernoulli beam; no shear deformation, geometric nonlinearity or section distortion','Locally prismatic projected normal sections; taper, twist and curved reference axis are beam approximations, not a 3-D solid mesh','A continuous C1 reference normal family maps physical loads and surface points; straight frame elements approximate that reference curve','The six-DOF equivalent axis clamp is not a resolved physical oblique root face. Geometrically truncated end cuts are masked; this is only a minimum exclusion, not a validated Saint-Venant decay length','Prescribed aircraft-global +z loads per projected y; no aerodynamic lift, zero-lift angle, stall or aeroelastic redistribution prediction','Perfectly bonded skin/ribs/spars and module seams; external rods and dry/slipping joints not modeled','Reported skin/spar stresses are nominal axial + biaxial normal beam stresses; shear failure, local buckling, bond stress and stress concentrations are unresolved','Natural frequencies, flutter and an overall certified factor of safety are unavailable'];
    limitations.push('Non-affine torsional warping normal stress is not recovered; nominal affine stress is not a validated local strength field.');
    const maxTranslation=Math.max(...frame.displacements.map(F.norm)),maxRotation=Math.max(...frame.rotations.map(F.norm)),smallDisplacement=maxTranslation/L<=.05&&maxRotation<=.1;
    const validity={smallDisplacement,maxTranslation,maxRotation,translationRatio:maxTranslation/L,message:smallDisplacement?'Small-displacement screening passed (translation/span ≤ 5%, rotation ≤ 0.1 rad); this is not a nonlinear validation.':'Outside the admitted small-displacement screening (translation/span > 5% or rotation > 0.1 rad). Linear results are illustrative only; reduce loads or use a geometrically nonlinear model.'};
    const analysis3D={method:frame.method,limitations,validity,spanStations:nodeY,referenceCoordinates:nodes,nodes,displacements:frame.displacements,rotations:frame.rotations,elasticIncidenceDeg,reactions:frame.reactions,energy:frame.energy,work:frame.work,verification:frame.verification,elements:frame.elements,sectionSamples:samples,resultants:cuts.map((c,i)=>({y:y[i],force:c.force,moment:c.moment,localForce:c.localForce,localMoment:c.localMoment,endZone:c.endZone})),localM2:Float64Array.from(cuts,c=>c.localMoment[1]),localM3:Float64Array.from(cuts,c=>c.localMoment[2]),localT:T,normalStress:{skinTension:tension,skinCompression:compression,spars:sparStress},loadMapping,frameAt,cutAt,evaluateNormalStress:normalStress,locatePhysicalPoint:normals.locate,referenceAt:y=>frameAt(y).reference,sectionReferenceAt:referenceAt,normalSectionAxisIterationChangeMm:axisChange};
    analysis3D.units={length:'mm',force:'N',moment:'N mm',stress:'MPa',rotation:'rad',energy:'N mm',lineLoad:'N/mm of projected y'};
    analysis3D.mesh=mesh;analysis3D.appliedWrench={force:appliedWrench.slice(0,3),momentAboutRoot:appliedWrench.slice(3)};
    // Public referenceAt is the actual straight FE interpolation; the section
    // reference is its continuous target curve. Keep the older raw section-
    // sample interpolation explicitly diagnostic, never an assembly reference.
    analysis3D.rawSectionSampleInterpolationAt=referenceAt;
    analysis3D.normalReferenceAt=normals.atY;analysis3D.sectionReferenceAt=normals.atY;
    analysis3D.endZoneAt=y=>{const p=normals.at(y);return endZone(p.reference,p.normal,y);};
    analysis3D.pointMotionCache=new Map();analysis3D.pointStressCache=new Map();
    analysis3D.referenceAxis='Straight frame elements approximate a continuous C1 projected-section shear-centre normal family; all six equivalent axis-root DOFs are clamped, not a resolved oblique root face. Local axes are right-handed: e1 span tangent, e2 projected chord direction, e3 = e1 cross e2.';
    return {version:VERSION,analysis3D,mesh,geometry:g,pla,rod,assembly:asm,load,criteria:crit,liftN:load.kind==='flight'?load.aircraftMass*load.loadFactor*GRAV/2:undefined,w:Float64Array.from(y,q=>items.filter(p=>p.kind!=='point').reduce((sum,p)=>sum+lineForce(p,q),0)),point:items.filter(p=>p.kind==='point').map(p=>[p.position,p.force,p.fraction*chordAt(g,p.position)]),sections:local,ySec:ys,y,deflection,chordwiseDeflection,twist,V,M,T,mass,ribs,seams:seams(g),seamsActive:[],appliedForce:appliedWrench[2],appliedMoment:appliedWrench[3],stress:{sigTop,sigBot,spars:sparStress},checks:[],governing:null,verification:frame.verification,fem:{fBending:[],fTorsion:[],w:deflection,phi:twist},sparModel:g.spars.length?{method:'Projected bonded thin-wall shear-flow network + full spatial beam',limitations}:null};
  }
  function spatialPointMotion(result,y,localPoint){
    if(!result.analysis3D)throw Error('A spatial beam result is required.');
    if(result.analysis3D.stressOnly)return {point:Geometry.transformPoint(result.geometry,y,localPoint),reference:null,resolved:false,nominal:true,station:y,endZone:null,reason:'This section-equilibrium study does not calculate displacement or rotation.',displacement:null,rotation:null,movedPoint:null};
    const a=result.analysis3D,key=[y,...localPoint].join(',');if(a.pointMotionCache.has(key))return a.pointMotionCache.get(key);const point=Geometry.transformPoint(result.geometry,y,localPoint);let foot;try{foot=a.locatePhysicalPoint(point);}catch(error){const out={point,reference:null,resolved:false,nominal:true,station:null,endZone:'mapping',reason:error.message,displacement:null,rotation:null,movedPoint:null};a.pointMotionCache.set(key,out);return out;}
    if(foot.outside)return {point,reference:foot.reference,resolved:false,nominal:true,station:foot.station,endZone:foot.outside,reason:'Physical point normal foot lies outside the finite beam; motion is not extrapolated or silently clamped.',displacement:null,rotation:null,movedPoint:null};
    const r=a.frameAt(foot.station),reference=r.reference,displacement=Frame.add(r.displacement,Frame.cross(r.rotation,Frame.sub(point,reference))),endZone=a.endZoneAt(foot.station),out={point,reference,station:foot.station,resolved:true,nominal:true,endZone,displacement,rotation:r.rotation,movedPoint:Frame.add(point,displacement)};a.pointMotionCache.set(key,out);return out;
  }
  function normalStressLocationAt3D(result,y,localPoint,material=result.pla){
    if(result.analysis3D?.stressOnly)return result.analysis3D.evaluateStress(y,localPoint,material);
    if(!result.analysis3D)throw Error('A spatial beam result is required.');const a=result.analysis3D,E=typeof material==='number'?material:material.E,key=[y,...localPoint,E].join(',');if(a.pointStressCache.has(key))return a.pointStressCache.get(key);const point=Geometry.transformPoint(result.geometry,y,localPoint);let foot;try{foot=a.locatePhysicalPoint(point);}catch(error){const out={value:NaN,resolved:false,nominal:true,station:null,endZone:'mapping',reason:error.message};a.pointStressCache.set(key,out);return out;}
    if(foot.outside)return {value:NaN,resolved:false,nominal:true,station:foot.station,endZone:foot.outside,reason:'Physical point normal foot lies outside the finite beam.'};
    const cut=a.cutAt(foot.station);if(cut.endZone)return {value:NaN,resolved:false,nominal:true,station:foot.station,endZone:cut.endZone,reason:'Normal cut intersects an oblique end face; local end stresses are unresolved. This geometric mask is not a validated Saint-Venant decay distance.'};
    const q=Frame.toLocal(cut.R,Frame.sub(point,cut.reference)),value=E*(cut.strain[0]+cut.strain[1]*q[2]-cut.strain[2]*q[1]),out={value,resolved:true,nominal:true,station:foot.station,endZone:null,reason:'Locally prismatic nominal normal-beam stress, not a resolved 3-D solid stress.'};a.pointStressCache.set(key,out);return out;
  }
  function normalStressAt3D(result,y,localPoint,material=result.pla){
    return normalStressLocationAt3D(result,y,localPoint,material).value;
  }

  function argmaxArr(a) {
    let k = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > a[k]) k = i;
    return k;
  }

  // Resultant shear stress on a section for upward shear V and nose-up torque T
  // (sectionproperties mapping: vy = −V, mzz = +T).
  function shearField(section, Vup, Tnose, g) {
    if(section.sparNetwork){
      const n=section.sparNetwork,a=Spars.field(n,Vup,Tnose),skin=n.edges.map((e,i)=>({e,i})).filter(v=>v.e.kind==='skin');
      const vals=new Float64Array(section.mesh.tris.length/3);
      for(let k=0;k<vals.length;k++){
        const ids=[0,1,2].map(j=>section.mesh.tris[3*k+j]),x=ids.reduce((s,i)=>s+section.mesh.nodes[2*i],0)/3,z=ids.reduce((s,i)=>s+section.mesh.nodes[2*i+1],0)/3;
        const near=skin.reduce((best,v)=>{const p=n.nodes[v.e.a],q=n.nodes[v.e.b],d=(x-(p[0]+q[0])/2)**2+(z-(p[1]+q[1])/2)**2;return !best||d<best.d?{d,i:v.i}:best;},null);vals[k]=a[near.i];
      }
      const max=Math.max(0,...skin.map(v=>a[v.i]));return {values:vals,nominal:max,peak:max,spar:n.edges.flatMap((e,i)=>e.index>=0&&!e.tie?[{index:e.index,kind:e.kind,tau:a[i]}]:[])};
    }
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
    VERSION, MATERIALS, DEFAULT_GEOMETRY, DEFAULT_LOAD, DEFAULT_CRITERIA, DEFAULT_ASSEMBLY,MESH_LIMITS,
    makeGeometry, chordAt, seams, ribStations, moduleBounds, rodCentres, rodRadius, holeRadius, sleeveRadius,
    airfoilSurfaces, verticalOrdinates, outerContour, ringLoops, ringMesh, shellFE, analyseSection, solve,
    shearField, compareAssemblies, interp, camber, normalizeNaca, normalize, stations, warmStation, sectionAt,
    cavityTipLimit,effectiveTE,sparParts,closedTipSparLimit,airfoilAt,analysisCapability,solveSpatial,spatialPointMotion,normalStressAt3D,normalStressLocationAt3D,
    stationAt:Geometry.stationAt,transformPoint:Geometry.transformPoint,inversePoint:Geometry.inversePoint,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WingEngine;
