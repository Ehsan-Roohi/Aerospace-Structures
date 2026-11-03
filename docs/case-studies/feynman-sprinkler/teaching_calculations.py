"""Reproduce assumed classroom examples; no experimental data or fitted coefficients.
Run: python teaching_calculations.py  (standard library only).
Writes calculations.json beside this script. response.svg is generated separately
from the same analytical formulas and is not experimental evidence.
"""
from math import pi, sqrt, exp
from pathlib import Path
import json

def calculate():
    rho, mu, n, d, q, r, rc = 1000.0, 0.001, 2, 0.008, 2e-5, 0.1, 0.025
    area = pi*d*d/4
    u = q/(n*area)
    b = 0.002
    tf = rho*q*r*u
    th = rho*q*u*b
    c, inertia, k = 2e-5, 1e-4, 1e-3
    ds, length, g = 0.002, 0.05, 26e9
    jp = pi*ds**4/32
    wn = sqrt(k/inertia)
    omega = th/c
    return {
        'status': 'ASSUMED TEACHING EXAMPLE; not experimental data',
        'inputs_SI': dict(rho=rho, mu=mu, arm_count=n, diameter=d, Q=q,
                          radius=r, bend_radius=rc, effective_offset=b,
                          linear_damping=c, effective_inertia=inertia,
                          support_stiffness=k, shaft_diameter=ds,
                          shaft_length=length, shear_modulus=g, pump_delta_p=20000),
        'results_SI': {
            'arm_area_m2': area, 'arm_speed_m_s': u,
            'Re': rho*u*d/mu, 'De': rho*u*d/mu*sqrt(d/(2*rc)),
            'forward_torque_Nm': tf, 'assumed_hub_torque_Nm': th,
            'torque_ratio': th/tf, 'linear_speed_ratio': th/tf,
            'quadratic_speed_ratio': sqrt(th/tf),
            'free_terminal_speed_rad_s': omega,
            'spinup_time_constant_s': inertia/c,
            'speed_at_5_s_rad_s': omega*(1-exp(-5*c/inertia)),
            'shaft_polar_moment_m4': jp,
            'shaft_max_shear_Pa': th*ds/(2*jp),
            'shaft_twist_rad': th*length/(g*jp),
            'natural_frequency_rad_s': wn,
            'damping_ratio': c/(2*sqrt(k*inertia)),
            'static_support_twist_rad': th/k,
            'harmonic_twist_at_wn_rad': th/(c*wn),
            'hydraulic_power_W': 20000*q,
            'mechanical_power_W': th*omega,
            'illustrative_power_ratio': th*omega/(20000*q),
            'torque_when_Q_doubled_Nm': rho*(2*q)*r*(2*u),
        }
    }

if __name__ == '__main__':
    record = calculate()
    out = Path(__file__).with_name('calculations.json')
    out.write_text(json.dumps(record, indent=2)+'\n')
    print(json.dumps(record['results_SI'], indent=2))
