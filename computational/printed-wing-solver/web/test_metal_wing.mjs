// Full-scale metal wing (D.520) engine: verification against textbook cases, the Python pipeline and the
// CalculiX shell model of the same wing.
//   node computational/printed-wing-solver/web/test_metal_wing.mjs
// Reference numbers: metal_wing_reference.json, written by
//   python computational/d520-wing/stress/scripts/export_wing_lab_reference.py <path>
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const M = require(join(here, "metal_wing_engine.js"));
const ref = JSON.parse(readFileSync(join(here, "metal_wing_reference.json"), "utf8"));

let failures = 0;
const rows = [];
function check(label, js, target, relTol, absTol = 0) {
  const err = Math.abs(js - target);
  const ok = Number.isFinite(js) && err <= Math.max(relTol * Math.abs(target), absTol);
  if (!ok) failures++;
  rows.push(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(70)} js ${js.toPrecision(6).padStart(12)}  ref ${target.toPrecision(6).padStart(12)}  diff ${(100 * (js - target) / (Math.abs(target) || 1)).toFixed(2).padStart(7)}%`);
}
function truth(label, ok) { if (!ok) failures++; rows.push(`${ok ? "PASS" : "FAIL"}  ${label}`); }

// ---------------------------------------------------------------- 1. textbook thin-walled sections
{
  const R = 0.5, t = 0.002, G = 27e9;
  const s = M.shearFlowSolve(M.tubeSection(R, t, 120), G);
  check("thin tube: J = 2 pi R^3 t", s.J, 2 * Math.PI * R ** 3 * t, 0.002);
  check("thin tube: shear centre at the centre (m)", s.xsc, 0, 0, 1e-9);
  check("thin tube: vertical shear resultant = 1", s.resultant[1], 1, 1e-9);
  check("thin tube: max shear flow = V/(pi R)", Math.max(...s.qV.map(Math.abs)), 1 / (Math.PI * R), 0.002);
}
{
  // two-cell rectangular box: Bredt-Batho for two cells (Megson ex.): compare J with a direct two-cell solution
  const b1 = 0.4, b2 = 0.6, h = 0.3, tSkin = 0.0015, tWeb = 0.003, tMid = 0.002;
  const pts = [[0, h / 2], [b1, h / 2], [b1 + b2, h / 2], [b1 + b2, -h / 2], [b1, -h / 2], [0, -h / 2]];
  const nodes = pts.map(([x, z]) => ({ x, z, B: 0.001, Qx: 0, Qz: 0.001 * z }));
  const L = (a, b) => Math.hypot(pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]);
  const walls = [[1, 0, tSkin], [5, 4, tSkin], [0, 5, tWeb], [4, 1, tMid], [1, 2, tSkin], [4, 3, tSkin], [3, 2, tWeb]].map(([a, b, tt]) => ({ a, b, t: tt, L: L(a, b) }));
  // cell 1 (left), counter-clockwise: 1->0 (top, going -x), 0->5 (down), 5->4 (bottom, +x), 4->1 (up)
  const c1 = [{ w: 0, s: 1 }, { w: 2, s: 1 }, { w: 1, s: -1 }, { w: 3, s: 1 }]; c1.area = b1 * h;
  // walls[1] is 5->4 (+x along the bottom): counter-clockwise for cell 1 goes 5->4, so s = +1
  c1[2].s = 1;
  const c2 = [{ w: 4, s: -1 }, { w: 3, s: -1 }, { w: 5, s: 1 }, { w: 6, s: 1 }]; c2.area = b2 * h;
  const Ixx = 6 * 0.001 * (h / 2) ** 2;
  const s = M.shearFlowSolve({ nodes, walls, cells: [c1, c2], Ixx, Izz: 1, Ixz: 0, ref: [b1, 0] }, 27e9);
  // closed form: unit torque, two cells: solve [d11 d12; d21 d22][q1 q2] = [2A1; 2A2] theta, T = 2A1 q1 + 2A2 q2
  const d1 = (b1 / tSkin) * 2 + h / tWeb + h / tMid, d2 = (b2 / tSkin) * 2 + h / tWeb + h / tMid, d12 = -h / tMid;
  const A1 = b1 * h, A2 = b2 * h;
  const det = d1 * d2 - d12 * d12;
  const q1 = (2 * A1 * d2 - 2 * A2 * d12) / det, q2 = (2 * A2 * d1 - 2 * A1 * d12) / det;   // per unit G theta'
  const Jclosed = 2 * A1 * q1 + 2 * A2 * q2;
  check("two-cell box: J equals the two-cell Bredt-Batho closed form", s.J, Jclosed, 1e-9);
  check("two-cell box: vertical shear resultant = 1", s.resultant[1], 1, 1e-9);
  check("two-cell box: horizontal shear resultant = 0", s.resultant[0], 0, 0, 1e-9);
}

// ---------------------------------------------------------------- 2. D.520 geometry and loads against the Python model
const P = M.D520, W = M.makeWing(P);
for (const g of ref.geometry) {
  check(`chord at y = ${g.y} m`, W.chord(g.y), g.chord, 1e-9);
  check(`leading-edge station at y = ${g.y} m`, W.S_LE(g.y), g.S_LE, 1e-9);
  check(`thickness at y = ${g.y} m`, W.thickness(g.y), g.thickness, 1e-9);
}
for (const sp of ref.section_points) {
  const s = W.section(sp.y, [0.0, 0.1, 0.37, 0.6, 0.73, 1.0]);
  let maxErr = 0;
  s.up.forEach((p, i) => { maxErr = Math.max(maxErr, Math.hypot(p[0] - sp.upper[i][0], p[1] - sp.upper[i][1]), Math.hypot(s.lo[i][0] - sp.lower[i][0], s.lo[i][1] - sp.lower[i][1])); });
  check(`section surface points at y = ${sp.y} m (max distance, m)`, maxErr, 0, 0, 1e-9);
}
check("wing area (m^2)", W.area(), ref.loads.wing_area, 1e-9);
const Z = M.boomZones(P, W);
Z.forEach((z, k) => check(`boom area, zone ${k} (${z.y0}-${z.y1} m)`, z.area, ref.zones[k].flange_area, 2e-4));

const R1 = M.solve({ n: 1 });
check("lifting line: angle of attack at CL 1.4 (deg)", R1.alphaDeg, ref.loads.alpha_deg, 1e-6);
const liftAt = (y) => R1.perG.lift(y);
for (const k of [0, 30, 60, 100, 140, 180, 195]) check(`lift per span at y = ${ref.loads.y[k].toFixed(3)} m (N/m)`, liftAt(ref.loads.y[k]), ref.loads.lift_per_m_1g[k], 2e-4, 1);
check("half-wing lift = W/2", R1.verification.halfLiftError, 0, 0, 1e-5);
check("non-structural mass per half wing (kg)", R1.mass.nonStructuralHalf, ref.loads.nonstructural_mass_half, 1e-9);

// ---------------------------------------------------------------- 3. section properties against the Python idealisation
for (const s of ref.sections) {
  const sec = M.buildSection(P, W, Z, s.y, { skin: 1, web: 1, boom: 1, stringer: 1 }, { wheelWell: false });
  check(`I_xx at y = ${s.y} m`, sec.Ixx, s.Ixx, 0.003);
  check(`neutral-axis height at y = ${s.y} m`, sec.zc, s.z_na, 0, 1e-4);
}

// ---------------------------------------------------------------- 4. shear-flow solution of the real section
for (const y of [0.6, 1.2, 2.35, 4.0]) {
  const sec = M.buildSection(P, W, Z, y, { skin: 1, web: 1, boom: 1, stringer: 1 });
  const p = M.analyseSection(sec, P.material);
  check(`shear-flow resultant (vertical) = applied shear, y = ${y} m`, p.resultant[1], 1, 1e-8);
  check(`shear-flow resultant (chordwise) = 0, y = ${y} m`, p.resultant[0], 0, 0, 1e-8);
  truth(`shear centre lies inside the box, y = ${y} m (x_sc/c = ${p.xscFrac.toFixed(3)})`, p.xscFrac > 0.2 && p.xscFrac < 0.6);
}

// ---------------------------------------------------------------- 5. the whole wing against the shell FE (r3, 41 066 elements)
const fe = ref.fe;
check("structural mass of the half wing (kg) vs shell model", R1.mass.structuralHalf, fe.struct_mass_half, 0.03);
check("fitting reaction per g (N) vs shell model", R1.fitting.Fz_per_g, fe.reaction_fz_1g, 0.01);
check("bending moment at the fittings per g (N m) vs Python beam", R1.fitting.M_per_g, ref.beam.M_at_fitting_1g, 0.01);
check("tip deflection at y = 5.1 m, clamped at the fittings, bending only (mm) vs Python beam", R1.tip.wBendClamped5 * 1e3, ref.beam.tip_deflection_clamped_at_fitting_mm, 0.02);
check("tip deflection, max at rib 1 (mm) vs shell model", R1.tip.wMax * 1e3, fe.tip_mm_1g, 0.04);
check("tip twist at rib 1 (deg, nose-up) vs shell model", R1.tip.twistDeg, fe.tip_twist_deg_1g, 0.08);
for (const st of ref.beam.stations) {
  const s = M.sectionAt(R1, st.y).load;
  // engineer's symmetric bending, as the Python beam check (inboard of 0.67 m the wheel-well cut-out is modelled here, not there)
  check(`upper boom stress per g at y = ${st.y} m, symmetric bending (MPa) vs Python beam`, s.boomUsym / 1e6, st.beam_upper_MPa, 0.03);
  if (st.y > 0.67) check(`lower boom stress per g at y = ${st.y} m, symmetric bending (MPa) vs Python beam`, s.boomLsym / 1e6, st.beam_lower_MPa, 0.03);
  // near the tip the shell model carries less load in the booms than beam theory (load introduction, shear lag)
  if (st.y <= 3.6) {      // unsymmetric bending (I_xz included), as the free shell model
    check(`upper boom stress per g at y = ${st.y} m (MPa) vs shell FE`, s.boomU / 1e6, st.fe_upper_MPa, 0.10);
    check(`lower boom stress per g at y = ${st.y} m (MPa) vs shell FE`, s.boomL / 1e6, st.fe_lower_MPa, 0.10);
  }
}
// sensitivity meshes: the same trend and size of change
for (const [lab, scales] of [["skin0.75", { skin: 0.75 }], ["skin1.25", { skin: 1.25 }], ["boom0.6", { boom: 0.6 }]]) {
  const r = M.solve({ n: 1, scales, collapse: false, modes: false });
  check(`tip deflection (mm), ${lab} vs shell model`, r.tip.wMax * 1e3, fe.sensitivity[lab].tip_mm, 0.05);
  check(`structural mass (kg), ${lab} vs shell model`, r.mass.structuralHalf, fe.sensitivity[lab].struct_mass_half, 0.03);
}

// ---------------------------------------------------------------- 6. strength and stability against collapse.py
for (const st of ref.collapse.stations.filter((s) => s.y > 0.5)) {
  const c = R1.checks.find((r) => Math.abs(r.y - st.y) < 1e-6);
  if (!c) { truth(`collapse station y = ${st.y} m present`, false); continue; }
  check(`collapse moment (+g) at y = ${st.y} m (N m)`, c.pos.M_max, st.pos.M_max, 0.002);
  check(`collapse moment (-g) at y = ${st.y} m (N m)`, c.neg.M_max, st.neg.M_max, 0.002);
  check(`collapse load factor (+g) at y = ${st.y} m`, c.pos.n_collapse, st.pos.n_collapse, 0.02);
  if (st.pos.n_stringer_cripple) check(`stringer crippling load factor (+g) at y = ${st.y} m`, c.pos.n_stringer_cripple, st.pos.n_stringer_cripple, 0.02);
  if (st.pos.n_skin_buckle) check(`first skin buckle load factor (+g) at y = ${st.y} m`, c.pos.n_skin_buckle, st.pos.n_skin_buckle, 0.03);
}
const col = R1.failure.find((f) => f.key === "collapse");
check("critical collapse load factor (+g)", col.pos.n, ref.collapse.summary.pos.n_collapse[0], 0.02);
check("critical collapse station (m)", col.pos.y, ref.collapse.summary.pos.n_collapse[1], 0, 1e-6);

// ---------------------------------------------------------------- 7. internal consistency
check("beam FE vs integration: bending tip deflection", R1.verification.femTipDiff, 0, 0, 0.01);
check("beam FE vs integration: tip twist", R1.verification.femTwistDiff, 0, 0, 0.02);
{
  const s06 = R1.stations.find((s) => Math.abs(s.y - 0.6) < 0.05), s09 = R1.stations.find((s) => Math.abs(s.y - 0.8) < 0.05);
  check("tapered beam: constant-depth root bay, walls carry all the shear (V_w/V)", s06.Vw / s06.V, 1, 1e-3);
  truth(`tapered beam: inclined booms carry most of the shear where the depth falls fastest (V_w/V = ${(s09.Vw / s09.V).toFixed(2)} at y = ${s09.y.toFixed(2)} m)`, s09.Vw / s09.V < 0.5);
}
const R6 = M.solve({ n: 6, collapse: false, modes: false });
check("linearity: tip deflection at n = 6 is 6 x n = 1", R6.tip.wMax, 6 * R1.tip.wMax, 1e-9);
truth(`first bending frequency is plausible (${R1.fem.fBending[0].toFixed(2)} Hz, 5-30 Hz)`, R1.fem.fBending[0] > 5 && R1.fem.fBending[0] < 30);
truth(`first torsion frequency above first bending (${R1.fem.fTorsion[0].toFixed(1)} Hz)`, R1.fem.fTorsion[0] > R1.fem.fBending[0]);
let threw = false; try { M.solve({ n: 0 }); } catch { threw = true; }
truth("rejects a zero load factor", threw);

console.log(rows.join("\n"));
console.log(`\n${rows.length - failures}/${rows.length} checks passed · solve time ${R1.ms} ms`);
if (failures) process.exit(1);
