"""Reproduce the assumed examples in SPLIT_SCIMITAR_WINGLETS.md.

Standard-library teaching calculations only; no manufacturer geometry or allowables.
Run: python docs/case-studies/split-scimitar/teaching_calculations.py
"""

from math import pi, sqrt
import json


def calculate():
    cl, ar, cd_other = 0.5, 9.5, 0.020
    cdi0, cdi1 = (cl**2 / (pi * e * ar) for e in (0.80, 0.86))
    cd0, cd1 = cd_other + cdi0, cd_other + cdi1
    # kN and m -> kN m; x aft (downstream), y right, z up; a right-handed frame.
    def cross(r, f):
        x, y, z = r
        fx, fy, fz = f
        return [y * fz - z * fy, z * fx - x * fz, x * fy - y * fx]

    positions = [(x, y) for x in (-50, 50) for y in (-40, 40)]
    jf = sum(x*x + y*y for x, y in positions)  # mm^2
    moment = 1_000_000  # N mm
    fastener_loads = [sqrt((-moment*y/jf)**2 +
                           (5000 + moment*x/jf)**2) for x, y in positions]
    return {
        "cdi_baseline": cdi0,
        "cdi_modified": cdi1,
        "cd_baseline": cd0,
        "cd_modified_no_penalty": cd1,
        "ld_baseline": cl/cd0,
        "ld_modified": cl/cd1,
        "induced_drag_reduction_percent": 100*(cdi0-cdi1)/cdi0,
        "total_drag_reduction_percent": 100*(cd0-cd1)/cd0,
        "cd_modified_with_penalty": cd1+0.00025,
        "net_drag_reduction_percent": 100*(cd0-cd1-0.00025)/cd0,
        "break_even_added_cd": cdi0-cdi1,
        "root_moment_kNm": cross((0, 17, 1), (0.8, 2, 4)),
        "attachment_moment_kNm": cross((0, 0, 1), (0.8, 2, 4)),
        "reversed_side_force_root_moment_kNm": cross((0, 17, 1), (0.8, -2, 4)),
        "closed_cell_shear_flow_N_per_m": 2000/(2*0.08),
        "closed_cell_shear_stress_MPa": 2000/(2*0.08)/0.002/1e6,
        "fastener_group_J_mm2": jf,
        "maximum_fastener_load_kN": max(fastener_loads)/1000,
        "fastener_load_increase_over_equal_share_percent": 100*(max(fastener_loads)/5000-1),
        "nominal_bearing_stress_MPa": max(fastener_loads)/(3*8),
        "frequency_ratio_for_10percent_more_mass": 1/sqrt(1.1),
        "incremental_fuel_saving_percent_low": 100*0.015/0.965,
        "incremental_fuel_saving_percent_high": 100*0.020/0.965,
        "58000_US_gallons_in_liters": 58000*3.785411784,
    }


if __name__ == "__main__":
    print(json.dumps(calculate(), indent=2))
