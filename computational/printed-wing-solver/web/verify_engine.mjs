// Compare the browser engine with the tested Python solver.
//   python computational/printed-wing-solver/web/export_reference.py
//   node   computational/printed-wing-solver/web/verify_engine.mjs
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(join(here, "engine.js"));
const ref = JSON.parse(readFileSync(join(here, "reference_cases.json"), "utf8"));

const PLA = { "PLA upright (span = print Z)": "pla_upright", "PLA flat (span in build plane)": "pla_flat" };
const ROD = { "Carbon rod - hobby grade": "rod_hobby", "Carbon rod - aerospace T700": "rod_t700" };
const GEO = { naca: "naca", semi_span_mm: "semiSpan", root_chord_mm: "rootChord", tip_chord_mm: "tipChord", module_count: "modules", skin_mm: "skin", radial_clearance_mm: "clearance" };
const ASM = { rods_bonded: "rodsBonded", seams_bonded: "seamsBonded" };
const LOAD = { name: "name", kind: "kind", tip_force_N: "tipForce", tip_force_chord_fraction: "tipFraction", factor_of_safety: "fos", aircraft_mass_kg: "aircraftMass", load_factor: "loadFactor", distribution: "distribution", lift_chord_fraction: "liftFraction", tip_mass_g: "tipMass", inertia_relief: "inertiaRelief" };
const remap = (o = {}, map) => Object.fromEntries(Object.entries(o).map(([k, v]) => [map[k], v]));

let failures = 0;
const rows = [];
function check(caseName, label, js, py, relTol, absTol = 0) {
  const err = Math.abs(js - py);
  const ok = err <= Math.max(relTol * Math.abs(py), absTol);
  if (!ok) failures++;
  rows.push(`${ok ? "PASS" : "FAIL"}  ${caseName.padEnd(31)} ${label.padEnd(58)} js ${js.toPrecision(6).padStart(11)}  py ${py.toPrecision(6).padStart(11)}  diff ${(100 * (js - py) / (Math.abs(py) || 1)).toFixed(2)}%`);
}

const t0 = Date.now();
for (const [name, r] of Object.entries(ref)) {
  const spec = r.input;
  const input = {
    geometry: remap(spec.geometry, GEO),
    pla: E.MATERIALS[PLA[spec.pla || "PLA upright (span = print Z)"]],
    rod: E.MATERIALS[ROD[spec.rod || "Carbon rod - hobby grade"]],
    assembly: remap(spec.assembly, ASM),
    load: remap(spec.load, LOAD),
    nElements: 90,
  };
  const js = E.solve(input);
  js.sections.forEach((s, i) => {
    const p = r.sections[i];
    check(name, `section y=${p.y.toFixed(1)} EI flap`, s.EIf, p.EI, 0.01);
    check(name, `section y=${p.y.toFixed(1)} GJ`, s.GJ, p.GJ, 0.01);
    check(name, `section y=${p.y.toFixed(1)} shear centre x (mm)`, s.xsc, p.x_sc, 0, 0.5);
    check(name, `section y=${p.y.toFixed(1)} mass per length`, s.mass, p.mass, 0.005);
  });
  check(name, "root shear V0 (N)", js.V[0], r.V0, 0.002);
  check(name, "root moment M0 (N mm)", js.M[0], r.M0, 0.002);
  check(name, "root torque T0 (N mm)", js.T[0], r.T0, 0.03, 2);
  check(name, "tip deflection (mm)", js.deflection.at(-1), r.tip_deflection, 0.01);
  check(name, "tip twist (deg)", (js.twist.at(-1) * 180) / Math.PI, r.tip_twist_deg, 0.03, 0.002);
  check(name, "printed PLA mass (g)", js.mass.printed, r.mass.printed_total_g, 0.005);
  check(name, "tip stiffness (N/mm)", js.stiffness.tip, r.stiffness.tip_force_N_per_mm, 0.01);
  check(name, "free play at tip (mm)", js.seam.freePlay, r.stiffness.free_play_tip_mm, 1e-9, 1e-9);
  check(name, "f1 bending (Hz)", js.fem.fBending[0], r.f_bending[0], 0.01);
  check(name, "f2 bending (Hz)", js.fem.fBending[1], r.f_bending[1], 0.01);
  check(name, "f1 torsion (Hz)", js.fem.fTorsion[0], r.f_torsion[0], 0.01);
  for (const c of js.checks) {
    const py = r.checks[c.name];
    if (py === undefined) { failures++; rows.push(`FAIL  ${name} missing check ${c.name}`); continue; }
    const tol = c.name.startsWith("PLA shear") ? 0.12 : 0.02;
    check(name, `U: ${c.name}`, c.U, py, tol, 0.003);
  }
  if (js.governing.name !== r.governing) { failures++; rows.push(`FAIL  ${name} governing ${js.governing.name} vs ${r.governing}`); }
}
console.log(rows.join("\n"));
console.log(`\n${rows.length} comparisons, ${failures} outside tolerance, ${(Date.now() - t0) / 1000}s`);
process.exit(failures ? 1 : 0);
