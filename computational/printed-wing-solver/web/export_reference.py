"""Write reference results from the tested Python solver for the browser-engine check.

    python computational/printed-wing-solver/web/export_reference.py
    node computational/printed-wing-solver/web/verify_engine.mjs
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import printed_wing_solver as pws  # noqa: E402

CASES = {
    "baseline_flight": dict(),
    "baseline_tip10N": dict(load=dict(name="tip", kind="tip", tip_force_N=10.0, factor_of_safety=1.0)),
    "bonded_flat_t700_tip": dict(
        pla="PLA flat (span in build plane)",
        rod="Carbon rod - aerospace T700",
        assembly=dict(rods_bonded=True, seams_bonded=True),
        load=dict(name="tip", kind="tip", tip_force_N=10.0, tip_force_chord_fraction=0.429, factor_of_safety=1.0),
    ),
    "naca4412_two_modules_elliptic": dict(
        geometry=dict(naca="4412", semi_span_mm=400.0, root_chord_mm=180.0, tip_chord_mm=90.0, module_count=2,
                      skin_mm=1.0, radial_clearance_mm=0.15),
        load=dict(name="elliptic", aircraft_mass_kg=1.2, load_factor=3.0, distribution="elliptic",
                  lift_chord_fraction=0.30, tip_mass_g=5.0),
    ),
    "uniform_no_relief_bonded_seams": dict(
        assembly=dict(seams_bonded=True),
        load=dict(name="uniform", distribution="uniform", inertia_relief=False, factor_of_safety=2.0),
    ),
}


def run(spec: dict) -> dict:
    geom = pws.WingGeometry(**spec.get("geometry", {}))
    pla = pws.MATERIALS[spec.get("pla", "PLA upright (span = print Z)")]
    rod = pws.MATERIALS[spec.get("rod", "Carbon rod - hobby grade")]
    assembly = pws.Assembly(**spec.get("assembly", {}))
    load = pws.LoadCase(**spec.get("load", {}))
    res = pws.solve(geom, pla, rod, assembly, load)
    return {
        "input": spec,
        "sections": [
            {
                "y": s.y_mm,
                "EI": s.EI_flap_Nmm2,
                "GJ": s.GJ_Nmm2,
                "J": s.J_fe_mm4,
                "x_sc": s.shear_centre_x_mm,
                "x_c": s.centroid_x_mm,
                "z_c": s.centroid_z_mm,
                "mass": s.mass_g_per_mm,
                "pla_area": s.pla_area_mm2,
            }
            for s in res.sections
        ],
        "V0": float(res.V[0]),
        "M0": float(res.M[0]),
        "T0": float(res.T[0]),
        "tip_deflection": res.tip_deflection_mm,
        "tip_twist_deg": res.tip_twist_deg,
        "mass": {k: float(v) for k, v in res.mass.items()},
        "stiffness": {k: float(v) for k, v in res.stiffness.items()},
        "f_bending": [float(f) for f in res.fem["f_bending_Hz"][:2]],
        "f_torsion": [float(f) for f in res.fem["f_torsion_Hz"][:1]],
        "checks": {c.name: float(c.utilization) for c in res.checks},
        "governing": res.governing.name,
    }


if __name__ == "__main__":
    out = {name: run(spec) for name, spec in CASES.items()}
    path = HERE / "reference_cases.json"
    path.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"Wrote {path.name}: {', '.join(out)}")
    for name, r in out.items():
        print(f"  {name}: tip {r['tip_deflection']:.3f} mm, f1 {r['f_bending'][0]:.2f} Hz, governing {r['governing']}")
    assert all(math.isfinite(r["tip_deflection"]) for r in out.values())
