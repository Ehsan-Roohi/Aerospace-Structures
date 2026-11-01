"""Educational models, NOT Apeiron performance/design data. Python standard library."""
import math, json

def atmosphere(h):
    if not 0 <= h <= 25000:
        raise ValueError('Model limited here to 0–25 km')
    if h < 11000:
        T=15.04-.00649*h
        p=101.29*((T+273.1)/288.08)**5.256
    else:
        T=-56.46
        p=22.65*math.exp(1.73-.000157*h)
    return p, p/(.2869*(T+273.1))

def results():
    p0,r0=atmosphere(0); p,r=atmosphere(13700)
    R=6371000.; mu=3.986004418e14; g=9.80665
    return dict(pressure_kPa=p,density_kg_m3=r,pressure_ratio=p/p0,density_ratio=r/r0,
      gravity_ratio_release=(R/(R+13700))**2,gravity_ratio_90km=(R/(R+90000))**2,
      orbit_200km_speed_m_s=math.sqrt(mu/(R+200000)),orbit_specific_KE_MJ_kg=mu/(2*(R+200000))/1e6,
      illustrative_coast_height_m=900**2/(2*g),illustrative_payload_force_N=2*10000*g,
      illustrative_beam_moment_Nm=2*10000*g*10/4,
      illustrative_hoop_stress_Pa=60000*1/.003,illustrative_axial_stress_Pa=60000*1/(2*.003))

def extended_results():
    R=6371000.; mu=3.986004418e14; h=13700.; V=230.
    potential=lambda z: mu*(1/R-1/(R+z))
    rho=atmosphere(h)[1]; rho0=atmosphere(0)[1]
    ecarrier=potential(h)+V**2/2
    eorbit=mu/R-mu/(2*(R+200000))
    return dict(release_potential_MJ_kg=potential(h)/1e6,
        illustrative_release_kinetic_MJ_kg=V**2/2/1e6,
        illustrative_carrier_energy_MJ_kg=ecarrier/1e6,
        potential_90km_MJ_kg=potential(90000)/1e6,
        surface_to_orbit_200km_MJ_kg=eorbit/1e6,
        illustrative_carrier_orbit_energy_ratio=ecarrier/eorbit,
        release_to_90km_potential_ratio=potential(h)/potential(90000),
        illustrative_release_q_kPa=.5*rho*V**2/1000,
        illustrative_sealevel_q_kPa=.5*rho0*V**2/1000,
        illustrative_900ms_fixed_release_density_q_kPa=.5*rho*900**2/1000)

if __name__=='__main__':
    out=results()
    out.update(extended_results())
    assert .19 < out['density_ratio'] < .20
    assert .995 < out['gravity_ratio_release'] < .996
    assert 7780 < out['orbit_200km_speed_m_s'] < 7800
    print(json.dumps(out,indent=2))
