"""D.520 wing stress model: every input with its source and status.

Status codes (same convention as the geometry model):
  PRINTED  read from the 1940 manual (page / plate given)
  SCALED   measured on a manual drawing (plate given)
  EXTERNAL taken from an outside reference (named)
  GUESS    engineering assumption, no source; varied in the sensitivity study
  DERIVED  computed from the above
Frame: S = m aft of the spinner tip, y = m to starboard, Z = m above the thrust axis
(identical to the Blender model).  The FE model is the starboard half wing, y >= 0.
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
GEOM = os.path.join(ROOT, "..", "model", "scripts")     # the 3-D model's geometry module (d520_geom.py) and its data
sys.path.insert(0, GEOM)
import d520_geom as G          # noqa: E402  (the geometry used for the Blender model)

INPUTS = {}
def add(key, value, unit, status, source, note=""):
    INPUTS[key] = dict(value=value, unit=unit, status=status, source=source, note=note)
    return value

# ---------------------------------------------------------------- mass and load cases
add("mass_gross", 2677.0, "kg", "EXTERNAL", "Wikipedia 'Dewoitine D.520' specifications (gross weight)",
    "Manual p13 leaves 'L'avion etant au poids de' blank. Alternatives: 2785 kg max take-off (Wikipedia), 2800 kg (warbirdsresourcegroup).")
add("g", 9.80665, "m/s2", "PRINTED", "standard gravity")
add("n_limit_pos", 6.0, "-", "GUESS", "CS-23 aerobatic category limit load factor (+6.0 g)",
    "The manual gives no load factor and none was found for the D.520. Results are also given per g and as the load factor at which each failure mode is reached, so any other requirement can be applied.")
add("n_limit_neg", -3.0, "-", "GUESS", "CS-23 aerobatic category negative limit load factor (-0.5 x positive)")
add("safety_factor", 1.5, "-", "EXTERNAL", "ultimate = 1.5 x limit (CS-23.303 / period practice)")
add("CL_design", 1.4, "-", "GUESS", "clean CL at the manoeuvre point (only shapes the small 'basic' part of the span loading)")
add("a0_section", 0.9 * 2 * math.pi, "1/rad", "GUESS", "section lift slope 0.9 x 2 pi (thick sections)")
add("alpha0_tip", -1.2, "deg", "EXTERNAL", "NACA 230-series zero-lift angle (Abbott & von Doenhoff, 23012: -1.2 deg)",
    "Root section is symmetric (Pl.1 rib table); camber blended from rib 21 to the tip as in the 3-D model (GUESS blend).")

# ---------------------------------------------------------------- wing structure layout
RIB_Y = [0.51, 0.70, 0.86, 1.01, 1.17, 1.33, 1.50, 1.66, 1.88, 2.07, 2.31, 2.54, 2.78, 3.01, 3.25, 3.49,
         3.72, 3.96, 4.20, 4.44, 4.68, 4.93]          # ribs 22 (root) ... 1 (tip)
add("rib_stations_y", RIB_Y, "m", "SCALED", "Pl.1 front elevation (PDF p68): ribs numbered 22 (root) to 1 (tip), 396 px/m",
    "Rib 22 = 0.51 m, rib 16 = 1.50 m (dihedral break), rib 13 = 2.07 m, rib 1 = 4.93 m.")
add("spar_x_c", 0.37, "chord", "SCALED", "Pl.1 root section (0.371c), Pl.6 rib 13 (0.35-0.40c), Pl.1 plan (0.35-0.385c)",
    "Single I-section main spar (PRINTED p13: 'a) un longeron unique').")
add("false_spar_x_c", 0.73, "chord", "SCALED", "Pl.6 rib 13 (0.73c); Pl.1 root section (0.705c); 1 - flap chord fraction 0.25 (p14)")
add("flange_root_width", 0.110, "m", "SCALED", "Pl.1 root section, hatched spar boom: ~40 px along the chord at 352 px/m (low confidence)")
add("flange_root_thickness", 0.030, "m", "SCALED", "Pl.1 root section, hatched spar boom: ~11 px normal to the skin (low confidence, +/-30%)")
add("flange_taper", "A(y) proportional to M(y)/h(y)", "-", "GUESS",
    "Manual p13: 'Les semelles vont en diminuant d'epaisseur et de largeur le long de l'envergure' (PRINTED, qualitative). Width taken proportional to chord, thickness = area / width.")
add("tank_y", [2.07, 3.49], "m", "DERIVED", "Pl.5 'Jonction 13' (tank ends at rib 13) + capacity 122 l fits the D-nose from rib 13 to rib 7",
    "Outboard end is an inference from volume.")
add("tank_volume", 122.0, "l", "PRINTED", "p.11 bis (handwritten): 'Capacite du reservoir gauche 122, droit 122'")
add("fuel_density", 0.72, "kg/l", "EXTERNAL", "aviation gasoline, typical 0.72 kg/l")
add("guns_y", [1.79, 1.955], "m", "DERIVED", "Pl.50 bis (PDF p145/148) gun positions, as in the 3-D model")
add("gun_mass", 10.7, "kg", "EXTERNAL", "Wikipedia 'MAC 1934' (10.7 kg)")
add("rounds_per_gun", 650, "-", "PRINTED", "p38: '650 cartouches par arme'; p41: 'chargeurs ... 650 cartouches'")
add("round_mass", 0.025, "kg", "GUESS", "7.5x54 MAS round ~23 g (9.0 g bullet, Wikipedia) plus belt link")
add("wheel_well", dict(y_c=0.30, x_c=0.17, r=0.37), "m / chord", "SCALED",
    "Pl.1 plan 'Passage de la roue' circle: centre y 0.30 m (= retracted wheel of the 3-D model), 0.17c behind LE, radius 0.37 m")
add("fitting_y", 0.46, "m", "DERIVED", "fuselage side at the wing upper surface (Pl.0 fuselage width law), where the D fittings of Pl.14 join spar and frame",
    "Manual p14: 3 attachments of the spar upper part to frame I, 2 of the false spar to frame III; all fittings high-tensile steel.")

# ---------------------------------------------------------------- material (duralumin)
add("E", 72.0e9, "Pa", "EXTERNAL", "2017-T4 (AU4G duralumin), matmatch AA data: 72-73 GPa", "Manual p13: all wing parts duralumin except the fishplates (PRINTED).")
add("nu", 0.33, "-", "EXTERNAL", "2017-T4, typical wrought 2000-series")
add("rho", 2790.0, "kg/m3", "EXTERNAL", "2017-T4, 2.79 g/cm3")
add("Fty", 220.0e6, "Pa", "EXTERNAL", "2017-T4 0.2% proof, minimum of quoted 220-275 MPa")
add("Ftu", 380.0e6, "Pa", "EXTERNAL", "2017-T4 tensile strength, minimum of quoted 380-425 MPa")
add("Fsu", 262.0e6, "Pa", "EXTERNAL", "2017-T4 shear strength 262 MPa")

# ---------------------------------------------------------------- gauges (spanwise zones bounded by ribs)
ZONES = [(0.00, 0.70), (0.70, 1.50), (1.50, 2.31), (2.31, 3.25), (3.25, 4.20), (4.20, 4.93)]
add("zones", ZONES, "m", "DERIVED", "6 spanwise gauge zones bounded by ribs 21, 16, 12, 8, 4 (sheet gauges step at ribs)")
add("t_skin", [1.6e-3, 1.6e-3, 1.2e-3, 1.0e-3, 0.8e-3, 0.8e-3], "m", "GUESS", "smooth stressed skin ('revetement en tole lisse', p13); gauges typical of 1938-40 fighters")
add("t_spar_web", [3.0e-3, 2.5e-3, 2.0e-3, 1.6e-3, 1.2e-3, 1.0e-3], "m", "GUESS", "'ame en tole forte' (thick sheet web, p13)")
add("t_false_spar", [1.2e-3, 1.2e-3, 1.0e-3, 1.0e-3, 0.8e-3, 0.8e-3], "m", "GUESS", "channel false spar (p13)")
add("t_rib", 1.0e-3, "m", "GUESS", "pressed-sheet ribs with lightening holes (Pl.6); modelled flat, without their pressed stiffening beads")
add("t_rib_kink", 2.0e-3, "m", "GUESS", "ribs 21 and 16, where the lower surface (rib 21) and the dihedral (rib 16) break (Pl.1): the kink turns boom and skin loads into rib crushing, so these ribs are taken heavier")
KINK_RIBS = (21, 16)
add("stringer", dict(x_c=[0.46, 0.53, 0.60, 0.67], h=0.020, t=[1.2e-3, 1.2e-3, 1.2e-3, 1.0e-3, 1.0e-3, 1.0e-3]), "chord / m", "GUESS",
    "spanwise rivet rows on the skin of Pl.2 indicate stringers; 4 blade stringers per surface between the spars")

def zone_of(y):
    y = abs(y)
    for k, (a, b) in enumerate(ZONES):
        if y < b - 1e-9: return k
    return len(ZONES) - 1

WING = G.Wing()
FUS = G.Fuselage()

def chord(y): return WING.chord(y)

def section_pts(y, x):
    """Upper and lower surface points (S, Z) at chord fractions x for span station y."""
    (Su, Zu), (Sl, Zl), c = WING.section(y, np.asarray(x, float))
    return np.c_[Su, Zu], np.c_[Sl, Zl], c

def depth_at(y, xc):
    up, lo, c = section_pts(y, [xc])
    return float(up[0, 1] - lo[0, 1])

def save_inputs(path=os.path.join(ROOT, "data", "stress_inputs.json")):
    json.dump(INPUTS, open(path, "w"), indent=1)
    return path

if __name__ == "__main__":
    print(save_inputs())
    for k, v in INPUTS.items():
        print(f"{k:22s} {str(v['value'])[:40]:40s} {v['status']}")
