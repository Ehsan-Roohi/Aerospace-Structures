// MIE 446 Optimization Lab: canonical material cards, section property helpers and truss presets.
// Units everywhere: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3.
// mass_g = volume_mm3 * rho_g_cm3 / 1000.
// These are representative educational values, not certified allowables.

export const MATERIALS = {
  pla:    { name: 'PLA (printed)',          E: 3500,   sigmaAllow: 45,   rho: 1.24, note: 'Educational card; use measured coupon data for printed parts.' },
  petg:   { name: 'PETG (printed)',         E: 2100,   sigmaAllow: 45,   rho: 1.27, note: 'Educational card; use measured coupon data for printed parts.' },
  al6061: { name: 'Aluminium 6061-T6',      E: 68900,  sigmaAllow: 276,  rho: 2.70, note: 'Yield strength used as the allowable.' },
  spruce: { name: 'Sitka spruce (along grain)', E: 10000, sigmaAllow: 35, rho: 0.42, note: 'Representative clear-wood allowable.' },
  cfrp:   { name: 'CFRP pultruded rod (T700 class)', E: 130000, sigmaAllow: 1200, rho: 1.60, note: 'Axial properties of a unidirectional rod.' },
  wire:   { name: 'Steel bracing wire',     E: 200000, sigmaAllow: 800,  rho: 7.85, note: 'Tension member; compression means a slack wire.' },
  steel:  { name: 'Structural steel',       E: 200000, sigmaAllow: 350,  rho: 7.85, note: 'Yield strength used as the allowable.' },
};

export function massGrams(volume_mm3, rho_g_cm3) {
  return volume_mm3 * rho_g_cm3 / 1000;
}

// Section properties about the horizontal bending axis. Returns { A (mm^2), I (mm^4), c (mm, extreme fibre), tmin (mm), h (mm) }.
// type 'rect': { b, h }      solid rectangle, width b, depth h
// type 'tube': { D, t }      hollow circular tube, outer diameter D, wall t
// type 'ibeam': { bf, tf, hw, tw }  flange width bf, flange thickness tf, web height hw (clear), web thickness tw
// type 'box': { b, h, t }    hollow rectangle, outer b x h, uniform wall t
export function sectionProps(type, p) {
  switch (type) {
    case 'rect': {
      const A = p.b * p.h;
      const I = p.b * p.h ** 3 / 12;
      return { A, I, c: p.h / 2, tmin: Math.min(p.b, p.h), h: p.h };
    }
    case 'tube': {
      const d = p.D - 2 * p.t;
      if (d <= 0) return { A: NaN, I: NaN, c: NaN, tmin: NaN, h: p.D };
      const A = Math.PI / 4 * (p.D ** 2 - d ** 2);
      const I = Math.PI / 64 * (p.D ** 4 - d ** 4);
      return { A, I, c: p.D / 2, tmin: p.t, h: p.D };
    }
    case 'ibeam': {
      const h = p.hw + 2 * p.tf;
      const A = 2 * p.bf * p.tf + p.hw * p.tw;
      const I = p.bf * h ** 3 / 12 - (p.bf - p.tw) * p.hw ** 3 / 12;
      return { A, I, c: h / 2, tmin: Math.min(p.tf, p.tw), h };
    }
    case 'box': {
      const bi = p.b - 2 * p.t, hi = p.h - 2 * p.t;
      if (bi <= 0 || hi <= 0) return { A: NaN, I: NaN, c: NaN, tmin: NaN, h: p.h };
      const A = p.b * p.h - bi * hi;
      const I = (p.b * p.h ** 3 - bi * hi ** 3) / 12;
      return { A, I, c: p.h / 2, tmin: p.t, h: p.h };
    }
    default:
      throw new Error('unknown section type ' + type);
  }
}

// ---------------- truss presets (2D, mm, N) ----------------
// nodes: [x, y]; members: [nodeA, nodeB, groupKey]; supports: { nodeIndex: [fixX, fixY] } (1 = fixed);
// loads: { nodeIndex: [Fx, Fy] } for the default load case; loadCases: named alternatives.
// groups: { key: { material, A0 (mm^2), tensionOnly (bool), buckling: 'square' | 'none' } }
// For Euler buckling of solid wood members use I = A^2 / 12 (square solid section) and effective length factor K = 1.

export const TRUSS_PRESETS = {
  'wright-bay': {
    name: 'Wright Flyer type half-wing truss (front view, 4 bays)',
    description: 'Lower and upper spars 1850 mm apart, struts every 1500 mm, crossed bracing wires in each bay. Root nodes pinned to the centre section. Lift applied upward at the strut stations.',
    nodes: [
      [0, 0], [1500, 0], [3000, 0], [4500, 0], [6000, 0],          // 0..4 lower spar
      [0, 1850], [1500, 1850], [3000, 1850], [4500, 1850], [6000, 1850], // 5..9 upper spar
    ],
    members: [
      [0, 1, 'spar'], [1, 2, 'spar'], [2, 3, 'spar'], [3, 4, 'spar'],
      [5, 6, 'spar'], [6, 7, 'spar'], [7, 8, 'spar'], [8, 9, 'spar'],
      [0, 5, 'strut'], [1, 6, 'strut'], [2, 7, 'strut'], [3, 8, 'strut'], [4, 9, 'strut'],
      [0, 6, 'wire'], [5, 1, 'wire'],
      [1, 7, 'wire'], [6, 2, 'wire'],
      [2, 8, 'wire'], [7, 3, 'wire'],
      [3, 9, 'wire'], [8, 4, 'wire'],
    ],
    groups: {
      spar:  { material: 'spruce', A0: 2000, tensionOnly: false, buckling: 'square' },
      strut: { material: 'spruce', A0: 1200, tensionOnly: false, buckling: 'square' },
      wire:  { material: 'wire',   A0: 5,    tensionOnly: true,  buckling: 'none' },
    },
    supports: { 0: [1, 1], 5: [1, 1] },
    loads: { 1: [0, 260], 2: [0, 240], 3: [0, 190], 4: [0, 100], 6: [0, 260], 7: [0, 240], 8: [0, 190], 9: [0, 100] },
    loadCases: {
      'point lift': { 1: [0, 260], 2: [0, 240], 3: [0, 190], 4: [0, 100], 6: [0, 260], 7: [0, 240], 8: [0, 190], 9: [0, 100] },
      'distributed lift (tip-heavy gust)': { 1: [0, 200], 2: [0, 220], 3: [0, 220], 4: [0, 150], 6: [0, 200], 7: [0, 220], 8: [0, 220], 9: [0, 150] },
      'negative g (-1 g)': { 1: [0, -130], 2: [0, -120], 3: [0, -95], 4: [0, -50], 6: [0, -130], 7: [0, -120], 8: [0, -95], 9: [0, -50] },
      'landing (lower wing skid load)': { 1: [0, -600], 2: [0, -300], 6: [0, 0] },
    },
  },
  'warren': {
    name: 'Warren truss, 6 panels, simply supported',
    description: 'Span 6000 mm, height 1000 mm, pinned at the left end, roller at the right end, 2000 N downward at each interior bottom-chord node.',
    nodes: [
      [0, 0], [1000, 0], [2000, 0], [3000, 0], [4000, 0], [5000, 0], [6000, 0],           // 0..6 bottom chord
      [500, 1000], [1500, 1000], [2500, 1000], [3500, 1000], [4500, 1000], [5500, 1000],  // 7..12 top chord
    ],
    members: [
      [0, 1, 'chord'], [1, 2, 'chord'], [2, 3, 'chord'], [3, 4, 'chord'], [4, 5, 'chord'], [5, 6, 'chord'],
      [7, 8, 'chord'], [8, 9, 'chord'], [9, 10, 'chord'], [10, 11, 'chord'], [11, 12, 'chord'],
      [0, 7, 'diag'], [7, 1, 'diag'], [1, 8, 'diag'], [8, 2, 'diag'], [2, 9, 'diag'], [9, 3, 'diag'],
      [3, 10, 'diag'], [10, 4, 'diag'], [4, 11, 'diag'], [11, 5, 'diag'], [5, 12, 'diag'], [12, 6, 'diag'],
    ],
    groups: {
      chord: { material: 'al6061', A0: 300, tensionOnly: false, buckling: 'square' },
      diag:  { material: 'al6061', A0: 300, tensionOnly: false, buckling: 'square' },
    },
    supports: { 0: [1, 1], 6: [0, 1] },
    loads: { 1: [0, -2000], 2: [0, -2000], 3: [0, -2000], 4: [0, -2000], 5: [0, -2000] },
    loadCases: {
      'uniform': { 1: [0, -2000], 2: [0, -2000], 3: [0, -2000], 4: [0, -2000], 5: [0, -2000] },
      'left half': { 1: [0, -3000], 2: [0, -3000], 3: [0, -1500] },
      'midspan point': { 3: [0, -8000] },
    },
  },
};

// ---------------- beam presets (mm, N) ----------------
export const BEAM_PRESETS = {
  'printed-spar': {
    name: 'Printed wing spar, cantilever 600 mm, tip load 20 N',
    L: 600, support: 'cantilever', loads: [{ type: 'point', P: 20, a: 600 }], material: 'pla',
    section: { type: 'rect', b: 12, h: 24 }, deflectionLimitRatio: 50, FS: 2.0,
  },
  'ss-udl': {
    name: 'Simply supported aluminium beam, 1000 mm, 2 N/mm',
    L: 1000, support: 'simply', loads: [{ type: 'udl', w: 2.0, a: 0, b: 1000 }], material: 'al6061',
    section: { type: 'tube', D: 30, t: 2 }, deflectionLimitRatio: 250, FS: 1.5,
  },
};
