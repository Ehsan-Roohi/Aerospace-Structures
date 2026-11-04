"""Blue LED teaching calculations. SI internally unless a unit is named.
Run: python teaching_calculations.py. Inputs are classroom assumptions except
historical optical power/current/wavelength, identified in BLUE_LED.md.
"""
import json
import math
from pathlib import Path


def calculate():
    h, c, q = 6.62607015e-34, 299792458., 1.602176634e-19
    wavelength = 450e-9
    photon_j = h*c/wavelength
    power, current = 1.5e-3, 20e-3
    modulus, poisson, mismatch, excursion, film_t = 300e9, .20, 2e-6, 100., 5e-6
    biaxial = modulus/(1-poisson)
    stress = biaxial*mismatch*excursion
    critical = math.asin(1/2.4)
    heat = .350*3.0-.35
    return {
        'blue_photon_eV': photon_j/q,
        'red_photon_eV': h*c/(650e-9*q),
        'blue_red_energy_ratio': 650/450,
        'historical_EQE_fraction': (power/photon_j)/(current/q),
        'WPE_assumed_3_2V_fraction': power/(current*3.2),
        'critical_angle_assumed_index2_4_deg': math.degrees(critical),
        'single_escape_cone_solid_angle_fraction': (1-math.cos(critical))/2,
        'hole_resistivity_ohm_cm': 1/(q*3e17*10),
        'dislocation_spacing_assumed_1e9_cm2_nm': 1/math.sqrt(1e9)*1e7,
        'alloy_x_assumed_endpoints_and_bowing': (4.1-math.sqrt(4.1**2-4*1.4*(3.4-photon_j/q)))/(2*1.4),
        'one_photon_conversion_energy_ratio': 450/560,
        'phosphor_retained_radiant_fraction': .3+.7*.9*450/560,
        'package_heat_W': heat,
        'junction_temperature_assumed_R30_C': 40+30*heat,
        'junction_temperature_assumed_R60_C': 40+60*heat,
        'film_stress_assumed_heating_MPa': stress/1e6,
        'film_stored_energy_J_m2': stress**2*film_t/biaxial,
        'attachment_edge_displacement_um': 15e-6*100*.002/2*1e6,
        'attachment_shear_strain_estimate': 15e-6*100*.002/2/50e-6,
        'fixture_inertial_force_N': .020*10*9.80665,
        'fixture_root_moment_Nm': .020*10*9.80665*.030,
        'photon_rate_blue_1mW_per_s': .001/photon_j,
        'photon_rate_red_1mW_per_s': .001/(h*c/650e-9),
    }


if __name__ == '__main__':
    results = calculate()
    assert abs(results['historical_EQE_fraction']-.02722)<.00002
    assert abs(results['film_stress_assumed_heating_MPa']-75)<1e-10
    assert abs(results['junction_temperature_assumed_R30_C']-61)<1e-10
    Path(__file__).with_name('calculations.json').write_text(json.dumps(results, indent=2)+'\n')
    print(json.dumps(results, indent=2))
