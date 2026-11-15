"""Independent CE-25A teaching examples; unpublished inputs are assumptions.

Run with Python 3 (standard library only). No aircraft calibration is performed.
All power/energy variables use the units recorded in their names.
"""
from __future__ import annotations

import json
import math
from pathlib import Path


def calculate() -> dict:
    g = 9.80665
    assumptions = {
        "mass_kg": 10000.0,
        "speed_kmh": 300.0,
        "range_km": 400.0,
        "lift_to_drag": 14.0,
        "propulsive_efficiency": 0.80,
        "motor_efficiency": 0.96,
        "inverter_efficiency": 0.98,
        "auxiliary_kw": 20.0,
        "motor_example_shaft_kw": 200.0,
        "tip_example_diameter_m": 0.8,
        "tip_example_rpm": 6000.0,
        "tip_example_sound_speed_ms": 330.0,
        "battery_usable_fraction": 0.80,
        "separate_battery_example_mission_kwh": 600.0,
        "beam_length_m": 8.0,
        "beam_upward_line_load_Nm": 6000.0,
        "beam_installation_mass_kg_each": 60.0,
        "beam_installation_locations_m": [0.8, 1.8, 2.8, 3.8, 4.8],
        "shaft_assumed_allowable_shear_Pa": 100e6,
    }
    a = assumptions
    speed = a["speed_kmh"] / 3.6
    weight = a["mass_kg"] * g
    drag = weight / a["lift_to_drag"]
    aerodynamic_kw = drag * speed / 1000
    shaft_kw = aerodynamic_kw / a["propulsive_efficiency"]
    eta_e = a["motor_efficiency"] * a["inverter_efficiency"]
    eta_all = eta_e * a["propulsive_efficiency"]
    battery_kw = shaft_kw / eta_e + a["auxiliary_kw"]
    hours = a["range_km"] / a["speed_kmh"]
    cruise_energy = battery_kw * hours
    motor_kw = a["motor_example_shaft_kw"]
    motor_in = motor_kw / a["motor_efficiency"]
    dc_in = motor_in / a["inverter_efficiency"]
    torque_3k = motor_kw * 1000 / (2 * math.pi * 3000 / 60)
    rotor_speed = math.pi * a["tip_example_diameter_m"] * a["tip_example_rpm"] / 60
    fan_mass = a["beam_installation_mass_kg_each"]
    positions = a["beam_installation_locations_m"]
    line_load = a["beam_upward_line_load_Nm"]
    length = a["beam_length_m"]
    return {
        "status": "Teaching calculations, not CE-25A specifications or validation",
        "input_status": {
            "published_programme_figures_used": ["mass limit 10000 kg", "nominal cruise 300 km/h", "range figure 400 km"],
            "all_other_numerical_inputs": "Independent classroom assumptions",
            "scope": "Cruise estimate excludes taxi, climb, diversion and explicit reserve energy",
        },
        "assumptions": a,
        "results": {
            "weight_N": weight,
            "cruise_thrust_N": drag,
            "useful_aerodynamic_power_kw": aerodynamic_kw,
            "cruise_shaft_kw": shaft_kw,
            "equal_share_shaft_kw_each_of_ten": shaft_kw / 10,
            "cruise_battery_kw_with_auxiliaries": battery_kw,
            "cruise_time_h": hours,
            "cruise_only_energy_kwh": cruise_energy,
            "cruise_only_battery_mass_at_350Whkg_fu_0p8_kg": cruise_energy / (0.35 * 0.8),
            "cruise_battery_kw_sensitivity_LD": {
                str(k): weight * speed / k / 1000 / eta_all + a["auxiliary_kw"] for k in [10, 14, 18]
            },
            "motor_200kW_torque_at_3000rpm_Nm": torque_3k,
            "motor_200kW_torque_at_6000rpm_Nm": torque_3k / 2,
            "motor_loss_kw_at_200kW_shaft": motor_in - motor_kw,
            "inverter_loss_kw_at_200kW_shaft": dc_in - motor_in,
            "ten_unit_motor_and_inverter_loss_kw": (dc_in - motor_kw) * 10,
            "tip_example_helical_Mach": math.hypot(rotor_speed, speed) / a["tip_example_sound_speed_ms"],
            "eight_blades_6000rpm_BPF_Hz": 8 * 6000 / 60,
            "four_pole_pairs_6000rpm_electrical_Hz": 4 * 6000 / 60,
            "torsion_only_solid_shaft_diameter_m": (16 * torque_3k / (math.pi * a["shaft_assumed_allowable_shear_Pa"])) ** (1 / 3),
            "battery_mass_600kWh_by_pack_Whkg": {
                str(e): 600 / (0.8 * e / 1000) for e in [250, 350, 450]
            },
            "climb_2400m_potential_energy_kwh": weight * 2400 / 3.6e6,
            "climb_2400m_electrical_potential_contribution_kwh": weight * 2400 / 3.6e6 / eta_all,
            "climb_3ms_additional_shaft_kw": weight * 3 / 1000 / a["propulsive_efficiency"],
            "beam_root_uniform_moment_Nm": line_load * length**2 / 2,
            "beam_installation_relief_Nm": fan_mass * g * sum(positions),
            "beam_net_root_moment_Nm": line_load * length**2 / 2 - fan_mass * g * sum(positions),
            "beam_net_root_shear_N": line_load * length - len(positions) * fan_mass * g,
            "charging_600kWh_30min_battery_kw": 600 / 0.5,
            "charging_600kWh_30min_grid_kw_at_eta0p95": 600 / 0.5 / 0.95,
        },
    }


if __name__ == "__main__":
    result = calculate()
    output = Path(__file__).with_suffix(".json")
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
