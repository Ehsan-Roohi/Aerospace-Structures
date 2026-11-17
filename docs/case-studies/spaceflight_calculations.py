"""Reproduce the generic Dream Chaser / Artemis classroom examples.

Standard-library Python only. All loads, thicknesses, speeds and stopping
strokes used for worked examples are assumptions, not flight specifications.
Run: python docs/case-studies/spaceflight_calculations.py
"""
from math import atan, degrees, exp, pi

G0 = 9.80665
G_MOON = 1.62


def average_support(mass, vertical_speed, stroke, gravity, upward_force=0.0):
    """Constant-force, vertical work-energy model; returns average reaction [N].

    upward_force can represent mean residual lift or thrust during the stroke.
    An assumed nonnegative support reaction is required; a negative result
    signifies that the contact model is inapplicable.
    """
    if mass <= 0 or vertical_speed < 0 or stroke <= 0 or gravity <= 0:
        raise ValueError("Mass, stroke and gravity must be positive; speed >= 0.")
    return mass * gravity - upward_force + mass * vertical_speed**2 / (2 * stroke)


def main():
    m = 10_000.0
    print("DREAM CHASER — GENERIC CLASSROOM ASSUMPTIONS")
    print(f"Orbital translation energy: {0.5*m*7800**2/1e9:.1f} GJ")
    print(f"Runway translation energy: {0.5*m*80**2/1e6:.1f} MJ")
    print(f"Equal-mass energy ratio: {(7800/80)**2:.2f}")
    print("Vertical speed [m/s], stroke [m], mean no-lift support [kN], R/(mg)")
    for vz in (0.5, 1.0, 2.0):
        for stroke in (0.1, 0.2, 0.4):
            reaction = average_support(m, vz, stroke, G0)
            print(f"{vz:.1f}, {stroke:.2f}, {reaction/1000:.3f}, {reaction/(m*G0):.3f}")
    dp, r, t = 70_000.0, 1.2, 0.004
    print(f"Cylindrical hoop / axial stress: {dp*r/t/1e6:.1f} / {dp*r/(2*t)/1e6:.1f} MPa")
    print(f"+10% speed heating ratio: {1.1**3:.3f}")
    print(f"Doubled nose-radius heating ratio: {2**-0.5:.3f}")
    print(f"Generic wing joint moment: {5000*1.5/1000:.1f} kN m")

    print("\nARTEMIS — GENERIC CLASSROOM ASSUMPTIONS")
    print(f"8.8 million lbf: {8.8e6*4.4482216152605/1e6:.3f} MN")
    r, t, axial, moment = 4.2, 0.01, 20e6, 100e6
    area, inertia = 2*pi*r*t, pi*r**3*t
    sigma_axial, sigma_bend = axial/area, moment*r/inertia
    print(f"Tube area / second moment: {area:.6f} m2 / {inertia:.6f} m4")
    print(f"Axial / bending stress magnitudes: {sigma_axial/1e6:.2f} / {sigma_bend/1e6:.2f} MPa")
    print(f"Extreme compression / tension: {(sigma_axial+sigma_bend)/1e6:.2f} / {(sigma_bend-sigma_axial)/1e6:.2f} MPa")
    for isp in (350.0, 450.0):
        ratio = exp(3000/(G0*isp))
        print(f"Isp {isp:.0f} s: m0/mf = {ratio:.4f}; ideal propellant fraction = {1-1/ratio:.4f}")
    for vz, thrust in ((2.0, 0), (1.0, 0), (2.0, 20_000)):
        reaction = average_support(20_000, vz, 0.3, G_MOON, thrust)
        print(f"Lunar vz={vz:.1f} m/s; thrust={thrust/1000:.0f} kN: R={reaction/1000:.3f} kN; R/(mgMoon)={reaction/(20_000*G_MOON):.3f}")
    print(f"Static tipping angle: {degrees(atan(4/12)):.2f} degrees")
    print(f"11.0 versus 7.8 km/s: energy ratio={(11/7.8)**2:.3f}; heating trend ratio={(11/7.8)**3:.3f}")
    print("\nThese are average or idealized results, not certified or peak vehicle loads.")


if __name__ == "__main__":
    main()
