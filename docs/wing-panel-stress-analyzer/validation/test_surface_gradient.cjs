// Exact manufactured surface potentials with the structure of the real flow at the two folds, on the ACTUAL meshes:
//  (LE) leading-edge flow of a thin section: phi = Re(C sqrt(zeta - zeta0)), zeta = (x - xLE) + i z in each section
//       plane, branch point inside the nose, cut along the chord inside the body (exits at the TE like the wake);
//  (TIP) crossflow around the closed tip edge: phi = Re(C sqrt(xi - xi0)), xi = (L - y) + i z' in the spanwise plane,
//       branch point inside the tip edge, cut inboard along the camber surface inside the body.
// Exact surface gradient (I - n n) grad phi at each panel centroid; error of the legacy and unfolded reconstructions.
const path = require('node:path'), assert = require('node:assert/strict');
const W = require(process.env.SOLVER || path.join(__dirname, '../wing-aero/aero_bundle.js'));
const results = [];
const csqrt = (re, im) => { const r = Math.hypot(re, im), a = Math.atan2(im, re); return [Math.sqrt(r) * Math.cos(a / 2), Math.sqrt(r) * Math.sin(a / 2)]; };
function test(geo, meshes, kind, select) {
  for (const [c, s] of meshes) {
    const wm = W.wingMesh(W.aeroGeometry(geo), { chordPanels: c, spanPanels: s }), S = wm.S, n = S.count, mu = new Float64Array(n), ex = new Float64Array(3 * n);
    const L = geo.semiSpan;
    for (let k = 0; k < n; k++) {
      const x = S.PC[3 * k], y = S.PC[3 * k + 1], z = S.PC[3 * k + 2];
      let f, gx = 0, gy = 0, gz = 0;
      if (kind === 'LE') { // branch point 0.02 mm behind the leading edge (x = 0), z = 0; cut along +x: arg in (-pi, pi) measured from -x
        const re = -(x - 0.02), im = z, sq = csqrt(re, im); f = sq[1]; // Im(sqrt(-(zeta - z0))): odd in z, continuous around the nose
        // d/dzeta: w = sqrt(-(zeta - z0)); dw/dzeta = -1 / (2 w);  phi = Im(w) -> grad (d/dx, d/dz) = (Im(dw/dzeta), Re(dw/dzeta))
        const dr = -sq[0] / (2 * (sq[0] ** 2 + sq[1] ** 2)), di = sq[1] / (2 * (sq[0] ** 2 + sq[1] ** 2)); gx = di; gz = dr;
      } else { // tip crossflow: xi = (L - y) + i (z - zc), branch point 0.05 mm inboard of the edge on the camber plane; cut toward -y (inside)
        // w = (y - L + yb) + i z, branch point yb = 0.5 mm inboard of the edge on z = 0, cut along y < L - yb inside the body
        const sq = csqrt(y - L + 0.5, z - zTip(x)); f = sq[1];
        const den = 2 * (sq[0] ** 2 + sq[1] ** 2); // F = sqrt(w), F' = conj(sq) / (2 |sq|^2); phi = Im F
        gy = -sq[1] / den; gz = sq[0] / den;
      }
      mu[k] = f; const N = [S.PN[3 * k], S.PN[3 * k + 1], S.PN[3 * k + 2]], gn = gx * N[0] + gy * N[1] + gz * N[2];
      ex[3 * k] = gx - gn * N[0]; ex[3 * k + 1] = gy - gn * N[1]; ex[3 * k + 2] = gz - gn * N[2];
    }
    const rows = [];
    for (const scheme of ['legacy', 'unfolded']) {
      const v = W.surfaceVelocity(S, wm.layout, mu, [0, 0, 0], { scheme }); let e2 = 0, s2 = 0, cnt = 0, worst = 0, at = '';
      for (let k = 0; k < wm.wingPanels; k++) { const j = Math.floor(k / wm.ni), i = k % wm.ni; if (!select(wm, i, j, S, k)) continue;
        const e = Math.hypot(v[3 * k] - ex[3 * k], v[3 * k + 1] - ex[3 * k + 1], v[3 * k + 2] - ex[3 * k + 2]), m = Math.hypot(ex[3 * k], ex[3 * k + 1], ex[3 * k + 2]);
        e2 += e * e; s2 += m * m; cnt++; if (e / m > worst) { worst = e / m; at = `i${i} j${j}`; } }
      results.push({kind, chord:c, span:s, sampleGroup:currentGroup, scheme, relativeRms:Math.sqrt(e2/s2), samples:cnt});
      rows.push(`${scheme}: rel RMS ${Math.sqrt(e2 / s2).toExponential(2)} worst ${worst.toExponential(2)} (${at})`);
    }
    console.log(`${kind} ${c}x${s} (${rows.length ? '' : ''}): ${rows.join(' | ')}`);
  }
}
let zTip = () => 0, currentGroup = '';
// (LE) thin rectangular 0001 wing, chordwise refinement, root and mid-span strips, panels with x/c < 0.3 except the two nose panels
const thin = { naca: '0001', semiSpan: 600, rootChord: 200, tipChord: 200 };
currentGroup='nose'; console.log('LE, the two nose panels (fold):'); test(thin, [[24, 16], [48, 16], [96, 16]], 'LE', (wm, i, j, S, k) => j <= 6 && Math.abs(i - (wm.nHalf - 0.5)) < 1);
currentGroup='inboard-chord-window'; console.log('LE, fixed window 0.02 < x/c < 0.3:'); test(thin, [[24, 16], [48, 16], [96, 16]], 'LE', (wm, i, j, S, k) => j <= 6 && S.PC[3 * k] > 4 && S.PC[3 * k] < 60);
// (TIP) rectangular 0012 AR 6 (camber zero, so the tip edge lies in z = 0), last 3 rows, 15% < x/c < 85%
const r12 = { naca: '0012', semiSpan: 600, rootChord: 200, tipChord: 200 };
currentGroup='tip-2mm-window'; console.log('TIP, panels within 2 mm of the tip edge, 15% < x/c < 85%:'); test(r12, [[32, 16], [32, 24], [32, 32], [32, 48]], 'TIP', (wm, i, j, S, k) => S.PC[3 * k + 1] > 598 && S.PC[3 * k] > 30 && S.PC[3 * k] < 170);
currentGroup='tip-last-row'; console.log('TIP, last row only:'); test(r12, [[32, 16], [32, 24], [32, 32], [32, 48]], 'TIP', (wm, i, j, S, k) => j === wm.ns - 1 && S.PC[3 * k] > 30 && S.PC[3 * k] < 170);

// Exact-field verification, independent of the boundary-system pressure solution.
const tip = results.filter(r=>r.sampleGroup==='tip-last-row' && r.scheme==='unfolded');
assert.equal(tip.length,4);
for(let i=1;i<tip.length;i++) assert.ok(tip[i].relativeRms<tip[i-1].relativeRms, 'tip seam reconstruction must converge under span refinement');
const tipOld=results.find(r=>r.sampleGroup==='tip-last-row' && r.scheme==='legacy' && r.span===48);
assert.ok(tip.at(-1).relativeRms<.04 && tip.at(-1).relativeRms<.35*tipOld.relativeRms);
for(const c of [24,48]){
  const n=results.find(r=>r.sampleGroup==='nose'&&r.scheme==='unfolded'&&r.chord===c);
  const o=results.find(r=>r.sampleGroup==='nose'&&r.scheme==='legacy'&&r.chord===c);
  assert.ok(n.relativeRms<1 && n.relativeRms<.1*o.relativeRms, 'recover resolved thin nose field without the straight-chord amplification');
}
console.log('PASS exact manufactured edge-gradient verification (not validation of local aerodynamic tip Cp).');
if(process.env.RESULT_JSON) require('node:fs').writeFileSync(process.env.RESULT_JSON,JSON.stringify({solver:W.VERSION,results},null,2)+'\n');
