"""Build notebooks/MIE446_Printed_Wing_Structural_Solver.ipynb.

The notebook downloads the tested solver module (printed_wing_solver.py) from this
repository at run time, so there is a single source of truth for the engine.

    python computational/printed-wing-solver/build_notebook.py [--execute]
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUT = REPO / "notebooks" / "MIE446_Printed_Wing_Structural_Solver.ipynb"
ENGINE_PATH = "computational/printed-wing-solver/printed_wing_solver.py"
ENGINE_URL = f"https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/{ENGINE_PATH}"

COLAB = "https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks"
REPO_URL = "https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main"

cells: list[dict] = []


def md(text: str) -> None:
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n")})


def code(text: str, hidden: bool = False) -> None:
    meta = {"cellView": "form"} if hidden else {}
    cells.append({"cell_type": "code", "metadata": meta, "execution_count": None, "outputs": [], "source": text.strip("\n")})


# ---------------------------------------------------------------------------
md(
    f"""
# MIE 446 — Printed-Wing Structural Solver
## Analyse the wing your team designed: section, loads, stress, stiffness and vibration

**Team notebook · Aerospace Structures · Fall 2026 · solver v1.0.0**

[Course home]({REPO_URL}/README.md) · [Wing project]({REPO_URL}/PROJECT.md) · [SolidWorks cross-check guide]({REPO_URL}/SOLIDWORKS_SIMULATION_GUIDE.md) · [Solver source and tests]({REPO_URL}/computational/printed-wing-solver)

### Driving question
*If the semi-wing you released for printing were loaded, where would it bend, where would it twist, which part would give up first — and how sure can you be?*

### What this notebook does
It analyses **the same geometry the Code-to-Print notebook sends to the printer**: the NACA shell with its 1.2 mm skin, the solid nose and trailing-edge strip, the two printed rod sleeves, the two carbon rods, the ribs and the module seams. Every number it prints can be traced to an equation in this notebook and checked by hand or by a second method.

| Question | Numerical Wing Structural Design notebook | Code-to-Print notebook | **This notebook** |
|---|---|---|---|
| What is modelled? | An idealised hollow rectangular spar | The printable CAD parts | **The printed shell, sleeves, rods, ribs and seams as a structure** |
| Main output | Spar sizing trends | STEP/STL files, mass, print records | **EI, GJ, shear centre, V–M–T, stresses, deflection, twist, frequencies, utilisations** |
| Does it approve loading or flying your wing? | No | No | **No** |

> **Safety and course boundary.** This is an analysis tool. Your team wing stays unloaded and undamaged. Only the instructor/TA loads the separate sacrificial specimen. Use the predictions here to *interpret* that shared data — not to justify loading anything yourself.

### Learning outcomes
1. Build a modulus-weighted section model of a real printed cross-section and explain what each part contributes.
2. Explain why a rod in a slip-fit sleeve adds only its own bending stiffness, and why a **dry module seam** behaves like a hinge spring.
3. Convert a lift distribution and load factor into shear, bending moment and torque **about the shear centre**.
4. Find the governing failure mode by comparing several screening checks — not just "max stress".
5. Predict a force–deflection slope and a natural frequency, then compare them with measured evidence.
6. State Claim — Evidence — Check — Confidence — Limitation for one result.

**How to work:** File → *Save a copy in Drive*. Run the cells from top to bottom. Change only the form fields. Write your prediction **before** each result cell.
"""
)

md(
    """
### Coordinates and sign conventions (keep this picture in mind)

* **x** — chordwise, from the leading edge toward the trailing edge (mm)
* **y** — spanwise, from the root (clamped) toward the tip (mm)
* **z** — up (mm)
* Upward force, shear force and bending moment that bend the tip **up** are positive.
* Torque and twist are **nose-up positive** (leading edge moves up).
* Units: mm, N, MPa (= N/mm²), g. 1 N·m = 1000 N·mm.
"""
)

code(
    """
#@title 0. Setup — run once (installs the 2-D section solver) { display-mode: "form" }
import importlib, subprocess, sys

def _ensure(package, spec):
    try:
        importlib.import_module(package)
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", spec], check=True)

_ensure("sectionproperties", "sectionproperties>=3.3,<4")
_ensure("shapely", "shapely>=2")

import math
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from IPython.display import display, Markdown
plt.rcParams.update({"figure.dpi": 100, "font.size": 10, "axes.grid": True, "grid.alpha": 0.3})
pd.set_option("display.max_colwidth", 80)
print("Setup complete. Next: run cell 1 to load the solver engine.")
""",
    hidden=True,
)

code(
    f"""
#@title 1. Solver engine — run once, do not edit {{ display-mode: "form" }}
# Downloads the verified solver from the course repository (the same file the test suite checks).
# Read it in the Colab file browser after this cell, or on GitHub: {ENGINE_PATH}
import importlib, sys, urllib.request
from pathlib import Path

ENGINE_URL = "{ENGINE_URL}"
try:
    urllib.request.urlretrieve(ENGINE_URL, "printed_wing_solver.py")
    source = "course repository"
except Exception as error:
    if not Path("printed_wing_solver.py").exists():
        raise RuntimeError("Could not download the solver; check the internet connection and rerun.") from error
    source = "local copy (download failed)"
sys.path.insert(0, ".")
import printed_wing_solver as pws
pws = importlib.reload(pws)
print(f"Printed-wing solver v{{pws.__version__}} loaded from the {{source}}.")
""",
    hidden=True,
)

# ---------------------------------------------------------------------------
md(
    """
## Part 1 — Your wing, exactly as released for printing

Copy the values from **your team's final Code-to-Print form (R02)**. The defaults are the class baseline: NACA 2412, 450 mm semi-span, 160/100 mm root/tip chord, three modules, 1.2 mm skin, 1.6 mm ribs and two 4 mm rods at 30 % and 60 % chord.

The solver rebuilds the section with **the same NACA equations and the same cavity rule as the CAD code**. As a check, the solver's printed mass for the baseline is 241.6 g versus 240.8 g from the CadQuery model (0.4 % difference); the test suite also compares cut-section areas.
"""
)

code(
    """
#@title 2. Wing geometry — copy from your Code-to-Print form { display-mode: "form" }
NACA_CODE = "2412" #@param {type:"string"}
SEMI_SPAN_MM = 450.0 #@param {type:"number"}
ROOT_CHORD_MM = 160.0 #@param {type:"number"}
TIP_CHORD_MM = 100.0 #@param {type:"number"}
SKIN_THICKNESS_MM = 1.2 #@param {type:"number"}
RIB_THICKNESS_MM = 1.6 #@param {type:"number"}
MODULE_COUNT = 3 #@param [2, 3] {type:"raw"}
SELECTED_RADIAL_CLEARANCE_MM = 0.25 #@param [0.15, 0.25, 0.35] {type:"raw"}

geom = pws.WingGeometry(
    naca=NACA_CODE, semi_span_mm=SEMI_SPAN_MM, root_chord_mm=ROOT_CHORD_MM, tip_chord_mm=TIP_CHORD_MM,
    skin_mm=SKIN_THICKNESS_MM, rib_thickness_mm=RIB_THICKNESS_MM, module_count=int(MODULE_COUNT),
    radial_clearance_mm=SELECTED_RADIAL_CLEARANCE_MM,
)
print(f"NACA {geom.naca}: semi-span {geom.semi_span_mm:.0f} mm, chords {geom.root_chord_mm:.0f} -> {geom.tip_chord_mm:.0f} mm")
print("Module seams (mm):", geom.seams_mm())
print("Rib mid-planes (mm):", geom.rib_stations_mm())
fig, axs = plt.subplots(2, 1, figsize=(11, 6.2))
pws.plot_section(geom, 0.0, ax=axs[0], title=f"Root section, chord {geom.root_chord_mm:.0f} mm")
pws.plot_section(geom, geom.semi_span_mm, ax=axs[1], title=f"Tip section, chord {geom.tip_chord_mm:.0f} mm")
plt.tight_layout(); plt.show()
print("Blue: shell connected to the skin. Orange: sleeve that touches the shell only at ribs. Black: carbon rods.")
"""
)

md(
    """
### Read the picture before you calculate

* The skin is a **closed thin-walled cell**: good in torsion, and its upper and lower skins carry most of the bending.
* Near the root, each printed sleeve is a small tube **floating inside the cavity**. It is tied to the shell only where a rib crosses it. Near the tip the section is thinner and a sleeve may touch the skin.
* The rods sit in their sleeves with the clearance you chose from the coupon. Unless you epoxy them, they can slide: they bend with the wing but cannot carry spanwise tension or compression **as part of the section**.
* Each **module seam** cuts the shell completely. If the seams are dry, only the two rods carry bending across them.
"""
)

# ---------------------------------------------------------------------------
md(
    r"""
## Part 2 — Materials, joints and the section solver

### Modulus-weighted bending stiffness
Different materials work together if they are forced to strain together. Their stiffnesses add after weighting each area by its modulus:

$$\bar z=\frac{\sum_i E_i\int_{A_i} z\,dA}{\sum_i E_i A_i},\qquad \overline{EI}=\sum_i E_i\int_{A_i}(z-\bar z)^2\,dA .$$

A **slip-fit rod** only follows the curvature of its sleeve, so it adds its *own* stiffness about its *own* axis:

$$\overline{EI}_{\text{slip}}=\overline{EI}_{\text{PLA}}+n\,E_r\frac{\pi d^4}{64}.$$

An **epoxied rod** becomes part of the section and adds a parallel-axis term $E_rA_r(z_r-\bar z)^2$. The rods sit almost on the neutral axis, so that extra term is small — a good thing to predict before you run.

### Torsion and the shear centre
For a single closed thin cell (Bredt–Batho):

$$J\approx\frac{4A_m^2}{\oint ds/t},\qquad \tau=\frac{T}{2A_m t}.$$

The notebook also solves the exact 2-D **warping problem** by finite elements (the `sectionproperties` package). That gives $J$ and the **shear centre** — the point where a vertical load produces no twist. Lift that acts ahead of the shear centre twists the wing nose-up.

### Material cards are uncertain — on purpose
Printed PLA is anisotropic. If the modules were printed **standing up** (span along the printer Z axis), spanwise bending stress pulls *across layer interfaces*, the weakest direction. Published upright tensile strengths range from about 5 MPa to above 30 MPa; on-edge values are about 50–55 MPa (Gonabadi, Yadav & Bull 2020). Hobby-grade pultruded carbon rods can have a modulus near 25 GPa; aerospace T700 rods near 130 GPa. **Run both rod cards** and replace the cards with coupon data when you have it.

**Predict first (write it in your record):** what percentage of the root $\overline{EI}$ do the two slip-fit rods provide? (a) < 5 % (b) 5–30 % (c) > 30 %.
"""
)

code(
    """
#@title 3. Materials and joints { display-mode: "form" }
PLA_CARD = "PLA upright (span = print Z)" #@param ["PLA upright (span = print Z)", "PLA flat (span in build plane)"]
ROD_CARD = "Carbon rod - hobby grade" #@param ["Carbon rod - hobby grade", "Carbon rod - aerospace T700"]
RODS_EPOXIED_IN_SLEEVES = False #@param {type:"boolean"}
MODULE_SEAMS_EPOXIED = False #@param {type:"boolean"}
#@markdown Optional overrides (leave 0 to use the card). Use measured values when you have them.
PLA_E_OVERRIDE_MPA = 0.0 #@param {type:"number"}
PLA_TENSILE_OVERRIDE_MPA = 0.0 #@param {type:"number"}
ROD_E_OVERRIDE_MPA = 0.0 #@param {type:"number"}
#@markdown Dry seam: effective rod length that bends across the seam (default = distance between the two interface ribs).
SEAM_ROD_FREE_LENGTH_MM = 8.0 #@param {type:"number"}
EPOXY_BUTT_JOINT_TENSILE_MPA = 5.0 #@param {type:"number"}

pla = pws.MATERIALS[PLA_CARD]
rod = pws.MATERIALS[ROD_CARD]
from dataclasses import replace as _replace
if PLA_E_OVERRIDE_MPA > 0: pla = _replace(pla, E_MPa=PLA_E_OVERRIDE_MPA, name=pla.name + " (E override)")
if PLA_TENSILE_OVERRIDE_MPA > 0: pla = _replace(pla, tensile_MPa=PLA_TENSILE_OVERRIDE_MPA, name=pla.name + " (strength override)")
if ROD_E_OVERRIDE_MPA > 0: rod = _replace(rod, E_MPa=ROD_E_OVERRIDE_MPA, name=rod.name + " (E override)")
assembly = pws.Assembly(rods_bonded=RODS_EPOXIED_IN_SLEEVES, seams_bonded=MODULE_SEAMS_EPOXIED,
                        seam_rod_free_length_mm=SEAM_ROD_FREE_LENGTH_MM, adhesive_tensile_MPa=EPOXY_BUTT_JOINT_TENSILE_MPA)
cards = pd.DataFrame([
    {"card": m.name, "E (MPa)": m.E_MPa, "G (MPa)": round(m.G_MPa), "density (g/cm3)": m.density_g_cm3,
     "tension (MPa)": m.tensile_MPa, "compression (MPa)": m.compressive_MPa, "shear (MPa)": m.shear_MPa} for m in (pla, rod)])
display(cards)
for m in (pla, rod):
    print("Source:", m.source)
"""
)

code(
    """
#@title 4. Section analysis at the root and tip (2-D FE takes ~10 s) { display-mode: "form" }
root = pws.analyse_section(geom, pla, rod, assembly, 0.0)
tip = pws.analyse_section(geom, pla, rod, assembly, 0.95 * geom.semi_span_mm)
rows = []
for name, s in (("root", root), ("95 % semi-span", tip)):
    rows.append({
        "station": name, "chord (mm)": round(s.chord_mm, 1), "PLA area (mm2)": round(s.pla_area_mm2, 1),
        "centroid x/c": round(s.centroid_x_mm / s.chord_mm, 3), "shear centre x/c": round(s.shear_centre_x_mm / s.chord_mm, 3),
        "EI flap (N m2)": round(s.EI_flap_Nmm2 * 1e-6, 3), "rods' share of EI (%)": round(100 * s.EI_rods_own_Nmm2 / s.EI_flap_Nmm2, 1),
        "GJ (N m2)": round(s.GJ_Nmm2 * 1e-6, 3), "J 2-D FE (mm4)": round(s.J_fe_mm4), "J Bredt (mm4)": round(s.J_bredt_mm4),
        "principal-axis angle (deg)": round(s.principal_angle_deg, 2)})
display(pd.DataFrame(rows).set_index("station").T)
fig, ax = plt.subplots(figsize=(11, 3.3)); pws.plot_section(geom, 0.0, ax=ax)
ax.plot(root.centroid_x_mm, root.centroid_z_mm, "+", ms=12, mew=2, color="crimson", label="modulus-weighted centroid")
ax.plot(root.shear_centre_x_mm, root.shear_centre_z_mm, "x", ms=10, mew=2, color="darkgreen", label="shear centre (2-D FE)")
ax.legend(loc="lower right", fontsize=8); plt.show()
"""
)

md(
    r"""
### Hand check 1 — torsion constant
Use the root row above. With the skin mid-line enclosing $A_m$ and the path integral $\oint ds/t$, Bredt–Batho gives $J=4A_m^2/\oint ds/t$. The notebook's Bredt value treats the solid nose and trailing-edge strip as thick walls. **Explain in one sentence why Bredt–Batho is a few per cent below the 2-D FE answer.**

The principal-axis angle is below 1° for the cambered sections used in this course, so vertical bending and chordwise bending are practically uncoupled. That is why the rest of the notebook uses one flap-wise $\overline{EI}$.
"""
)

# ---------------------------------------------------------------------------
md(
    r"""
## Part 3 — Loads

### Flight-like case (analytical only)
Imagine your semi-wing is half of a glider of total mass $m$ pulling a load factor $n$. Each semi-wing lifts

$$L_s=\frac{n\,m\,g}{2}.$$

Choose how that lift is spread along the span ($b$ = semi-span, $S$ = semi-wing area):

| Shape | Line load $w(y)$ |
|---|---|
| Elliptic | $\dfrac{4L_s}{\pi b}\sqrt{1-(y/b)^2}$ |
| Planform (proportional to chord) | $L_s\,c(y)/S$ |
| **Schrenk** (default, good for tapered wings) | average of the two above |
| Uniform | $L_s/b$ |
| Tip point load (the conservative "video" model) | all of $L_s$ at the tip |

The wing's own mass pushes down with the same load factor (**inertia relief**): $w_I=-n\,g\,m'(y)$, plus the rib, tip-cap and sensor masses as point forces. A printed PLA wing is heavy (≈ 0.26 kg per semi-wing with rods), so relief is large — that is a real design lesson, not a bug.

### Tip-force case (like the instructor's load-cell demonstration)
A single force $P$ at the tip, applied at a chosen chord fraction. Self-weight is excluded because the load cell is zeroed before loading.

### Internal loads at station $y$

$$V(y)=\int_y^b w\,d\eta+\sum P_k,\qquad M(y)=\int_y^b w(\eta)(\eta-y)\,d\eta+\sum P_k(y_k-y),$$

$$T(y)=\sum_{\text{outboard}} F_i\,\big(x_{sc}(y)-x_i\big)\quad\text{(nose-up torque about the local shear centre).}$$

**Predict first:** for the flight case, is the root bending moment larger or smaller than for a 10 N tip force? Why?
"""
)

code(
    """
#@title 5. Load case and design criteria { display-mode: "form" }
LOAD_CASE = "Flight-like lift" #@param ["Flight-like lift", "Tip force (load-cell style)"]
#@markdown **Flight-like lift**
AIRCRAFT_MASS_KG = 1.0 #@param {type:"number"}
LOAD_FACTOR_N = 4.0 #@param {type:"number"}
LIFT_DISTRIBUTION = "schrenk" #@param ["schrenk", "elliptic", "planform", "uniform", "tip"]
LIFT_CHORD_FRACTION = 0.25 #@param {type:"number"}
INCLUDE_INERTIA_RELIEF = True #@param {type:"boolean"}
#@markdown **Tip force**
TIP_FORCE_N = 10.0 #@param {type:"number"}
TIP_FORCE_CHORD_FRACTION = 0.30 #@param {type:"number"}
#@markdown **Common**
FACTOR_OF_SAFETY = 1.5 #@param {type:"number"}
TIP_SENSOR_MASS_G = 0.0 #@param {type:"number"}
MAX_TIP_DEFLECTION_MM = 45.0 #@param {type:"number"}
MAX_TIP_TWIST_DEG = 2.0 #@param {type:"number"}

if LOAD_CASE.startswith("Flight"):
    load = pws.LoadCase(name=f"Flight-like lift, n = {LOAD_FACTOR_N:g}, m = {AIRCRAFT_MASS_KG:g} kg", kind="flight",
                        aircraft_mass_kg=AIRCRAFT_MASS_KG, load_factor=LOAD_FACTOR_N, distribution=LIFT_DISTRIBUTION,
                        lift_chord_fraction=LIFT_CHORD_FRACTION, inertia_relief=INCLUDE_INERTIA_RELIEF,
                        factor_of_safety=FACTOR_OF_SAFETY, tip_mass_g=TIP_SENSOR_MASS_G)
else:
    load = pws.LoadCase(name=f"Tip force {TIP_FORCE_N:g} N at {TIP_FORCE_CHORD_FRACTION:g} c", kind="tip",
                        tip_force_N=TIP_FORCE_N, tip_force_chord_fraction=TIP_FORCE_CHORD_FRACTION,
                        factor_of_safety=FACTOR_OF_SAFETY, tip_mass_g=TIP_SENSOR_MASS_G)
criteria = pws.Criteria(max_tip_deflection_mm=MAX_TIP_DEFLECTION_MM, max_tip_twist_deg=MAX_TIP_TWIST_DEG)
print(load.name)
if load.kind == "flight":
    print(f"Semi-wing lift L_s = n m g / 2 = {load.semi_wing_lift_N:.2f} N (before inertia relief)")
"""
)

code(
    """
#@title 6. Run the solver (about 20 s the first time, a few seconds after that) { display-mode: "form" }
res = pws.solve(geom, pla, rod, assembly, load, criteria)
display(pd.Series(res.summary(), name="result").to_frame())
display(Markdown("**Independent checks inside the run** (all should be small, or close to 1 for the J ratio):"))
display(pd.Series({k: float(v) for k, v in res.verification.items()}, name="value").to_frame())
"""
)

code(
    """
#@title 7. Shear, moment, torque, deflection and twist along the span { display-mode: "form" }
pws.plot_span(res); plt.show()
display(pd.DataFrame(res.section_table()).set_index("y (mm)"))
"""
)

md(
    r"""
### What the deflection curve is telling you
Deflection comes from integrating curvature twice, $\kappa=M/\overline{EI}$:

$$\theta(y)=\int_0^y\kappa\,d\eta+\sum_{\text{dry seams}}\frac{M_s}{k_s},\qquad v(y)=\int_0^y\theta\,d\eta .$$

A **dry seam** is a hinge spring. Between the two interface ribs only the rods bend, so

$$k_s\approx\frac{n\,E_r I_r}{L_f},\qquad I_r=\frac{\pi d^4}{64},$$

with $L_f$ the free rod length across the seam. Look for the slope jumps at the dashed seam lines. The solid line (direct integration) and the dashed line (1-D beam finite elements) are two independent calculations of the same model; they should overlap.

**Hand check 2:** for a tip force, $\delta\approx PL^3/(3\overline{EI}_{root})$ underestimates the deflection (the real wing tapers and has seams). Compute it and compare with `res.stiffness`.
"""
)

code(
    """
#@title 8. Hand check 2 — tip-force deflection bounds { display-mode: "form" }
k = res.stiffness
print(f"Hand estimate with root EI everywhere, rigid seams : {k['root_EI_hand_check_N_per_mm']:.3f} N/mm  (too stiff)")
print(f"Tapered EI, rigid seams (integration)               : {k['rigid_seams_N_per_mm']:.3f} N/mm")
print(f"Tapered EI with this notebook's seam model          : {k['tip_force_N_per_mm']:.3f} N/mm")
print(f"Possible dead band from rod clearance at the tip    : {k['free_play_tip_mm']:.2f} mm (dry seams only)")
"""
)

# ---------------------------------------------------------------------------
md(
    r"""
## Part 4 — Stresses and screening checks

Each check is reported as a **utilisation** $U=\text{demand}/\text{capacity}$; strength demands use the ultimate load = factor of safety × limit load.

| Check | Demand | Capacity |
|---|---|---|
| PLA tension / compression | $\sigma=-E_{PLA}\,\kappa\,(z-\bar z)$ at the extreme fibres | printed-PLA strength card |
| PLA shear | resultant of transverse shear and torsion from the 2-D FE, **away from the four sharp cavity corners** | shear strength card |
| Skin buckling | compressive stress in the skin | larger of the flat-plate value $k\frac{\pi^2E}{12(1-\nu^2)}\big(\frac{t}{b}\big)^2$ (panel between ribs) and the knocked-down cylinder value $\gamma\frac{Et}{R\sqrt{3(1-\nu^2)}}$, $\gamma=1-0.901(1-e^{-\sqrt{R/t}/16})$ (NASA SP-8007) |
| Rod bending at a dry seam | $\sigma_r=\dfrac{M_s/n\;r}{I_r}$ — the rods carry the whole moment there | rod strength card |
| Rib-hole bearing at a dry seam | rod moment reacted by a force couple between the interface rib and the next rib | PLA compressive strength |
| Epoxied seam | bending tension across the butt joint | adhesive strength input |
| Deflection, twist | limit-load values | criteria above |

A **screening check** is deliberately simple. $U$ close to or above 1 means *investigate and test*, not *it will certainly break*; $U \ll 1$ means this mode is unlikely to govern **if the model assumptions hold**.

**Predict first:** which mode will govern for your wing — PLA tension across layers, skin buckling, or rods at the seam?
"""
)

code(
    """
#@title 9. Screening checks and stress maps at the root { display-mode: "form" }
display(pd.DataFrame(res.check_table()).set_index("check"))
pws.plot_checks(res); plt.show()
pws.plot_stress_maps(res, 0); plt.show()
g = res.governing
print(f"Governing screen: {g.name}, U = {g.utilization:.2f} at y = {g.location_mm:.0f} mm")
print(f"Shear stress at the sharp cavity corners (root): {res.stress['tau_corner_peak_sections'][0]:.2f} MPa versus "
      f"{res.stress['tau_sections'][0]:.2f} MPa nominal — a geometry-dependent concentration, not used in the shear check.")
"""
)

# ---------------------------------------------------------------------------
md(
    r"""
## Part 5 — Stiffness and vibration: connect to the shared demonstration

The instructor's sacrificial specimen produces a **force–deflection slope** (load cell + camera) and a **dominant frequency** (ADXL343 accelerometer). This model predicts both for the geometry you enter.

* Static: slope $k=P/\delta_{tip}$ for a tip force.
* Dynamic: the 1-D finite-element model (Hermite beam elements for bending, linear elements for torsion, consistent mass, rib and tip masses lumped) solves $K\phi=\omega^2M\phi$. For a uniform cantilever the first bending frequency is $f_1=\frac{1.875^2}{2\pi}\sqrt{\frac{EI}{m'L^4}}$ — a useful hand check.

A sensor glued to the tip adds mass and **lowers** the frequency. A crack lowers stiffness; so can a loosening seam. Which indicator changes more for a given damage — and which is easier to measure precisely?
"""
)

code(
    """
#@title 10. Natural frequencies and mode shapes { display-mode: "form" }
pws.plot_modes(res); plt.show()
m_line = res.mass["printed_total_g"] + res.mass["rods_g"]
EI_mid = float(np.interp(0.5 * geom.semi_span_mm, res.y, res.props["EI"]))
f_hand = 1.875**2 / (2 * math.pi) * math.sqrt(EI_mid / (m_line / geom.semi_span_mm * 1e-6 * geom.semi_span_mm**4))
print(f"First bending frequency, 1-D FEM            : {res.fem['f_bending_Hz'][0]:.2f} Hz")
print(f"Uniform-beam hand check with mid-span EI    : {f_hand:.2f} Hz (rigid seams, uniform mass)")
print(f"First torsion frequency, 1-D FEM            : {res.fem['f_torsion_Hz'][0]:.1f} Hz")
"""
)

code(
    """
#@title 11. Compare with measured evidence (optional) { display-mode: "form" }
#@markdown Enter values from the shared demonstration data if your instructor asks you to model that specimen. Leave 0 to skip.
MEASURED_SLOPE_N_PER_MM = 0.0 #@param {type:"number"}
MEASURED_FIRST_FREQUENCY_HZ = 0.0 #@param {type:"number"}
pred_k, pred_f = res.stiffness["tip_force_N_per_mm"], float(res.fem["f_bending_Hz"][0])
if MEASURED_SLOPE_N_PER_MM > 0:
    print(f"Slope: measured {MEASURED_SLOPE_N_PER_MM:.3f} N/mm, predicted {pred_k:.3f} N/mm, ratio {MEASURED_SLOPE_N_PER_MM / pred_k:.2f}")
if MEASURED_FIRST_FREQUENCY_HZ > 0:
    print(f"Frequency: measured {MEASURED_FIRST_FREQUENCY_HZ:.2f} Hz, predicted {pred_f:.2f} Hz, ratio {MEASURED_FIRST_FREQUENCY_HZ / pred_f:.2f}")
    print(f"Since f ~ sqrt(k/m), the frequency ratio implies an effective stiffness ratio of about {(MEASURED_FIRST_FREQUENCY_HZ / pred_f) ** 2:.2f}")
if MEASURED_SLOPE_N_PER_MM <= 0 and MEASURED_FIRST_FREQUENCY_HZ <= 0:
    print("No measured values entered. Predicted slope", round(pred_k, 3), "N/mm; predicted first frequency", round(pred_f, 2), "Hz.")
"""
)

# ---------------------------------------------------------------------------
md(
    """
## Part 6 — How you join the wing changes the structure

Same printed parts, four ways to assemble them, two rod cards. The table below re-runs the full solver eight times (about 30 s).

**Predict first:** rank the four assemblies by tip stiffness. Which single step — epoxying the rods or epoxying the seams — buys more stiffness?
"""
)

code(
    """
#@title 12. Assembly and rod-card comparison { display-mode: "form" }
table = pd.DataFrame(pws.compare_assemblies(geom, pla, (pws.ROD_HOBBY, pws.ROD_AEROSPACE), load, criteria))
display(table)
"""
)

code(
    """
#@title 13. Sensitivity — the two least certain inputs { display-mode: "form" }
lengths = [4.0, 8.0, 16.0, 30.0]
moduli = [25000.0, 60000.0, 131000.0]
rows = []
for E in moduli:
    for Lf in lengths:
        r = pws.solve(geom, pla, _replace(rod, E_MPa=E), pws.Assembly(seam_rod_free_length_mm=Lf), load, criteria, n_sections=5)
        rows.append({"rod E (GPa)": E / 1000, "seam free length (mm)": Lf,
                     "tip stiffness (N/mm)": round(r.stiffness["tip_force_N_per_mm"], 3),
                     "f1 (Hz)": round(float(r.fem["f_bending_Hz"][0]), 1)})
sens = pd.DataFrame(rows)
display(sens.pivot(index="seam free length (mm)", columns="rod E (GPa)", values="tip stiffness (N/mm)"))
print("Rigid-seam limit:", round(res.stiffness["rigid_seams_N_per_mm"], 3), "N/mm")
"""
)

code(
    """
#@title 14. Measure your rod's modulus with a hanging weight (optional) { display-mode: "form" }
#@markdown Clamp a rod, hang a known mass at distance L from the clamp, measure the tip drop. E = P L^3 / (3 delta I).
HANGING_MASS_G = 100.0 #@param {type:"number"}
FREE_LENGTH_MM = 300.0 #@param {type:"number"}
MEASURED_TIP_DROP_MM = 0.0 #@param {type:"number"}
ROD_DIAMETER_MEASURED_MM = 4.0 #@param {type:"number"}
if MEASURED_TIP_DROP_MM > 0:
    E_meas = pws.rod_modulus_from_cantilever(HANGING_MASS_G * 9.81e-3, FREE_LENGTH_MM, MEASURED_TIP_DROP_MM, ROD_DIAMETER_MEASURED_MM)
    print(f"Measured rod modulus: {E_meas / 1000:.1f} GPa. Enter {E_meas:.0f} in ROD_E_OVERRIDE_MPA (cell 3) and rerun.")
else:
    for E in (25000.0, 131000.0):
        d = HANGING_MASS_G * 9.81e-3 * FREE_LENGTH_MM**3 / (3 * E * math.pi * ROD_DIAMETER_MEASURED_MM**4 / 64)
        print(f"Expected tip drop for E = {E / 1000:.0f} GPa: {d:.1f} mm  (choose a mass that keeps the drop below about 10 % of L)")
"""
)

# ---------------------------------------------------------------------------
md(
    f"""
## Part 7 — Second method and engineering record

### Independent cross-check with SolidWorks (optional)
Import the STEP file from your final ZIP into SolidWorks Simulation, apply the **same** tip force with **bonded** contacts and the **same** PLA card, and compare tip deflection and root bending stress with this notebook run with *both seams and rods epoxied*. Step-by-step instructions: [SolidWorks Simulation cross-check guide]({REPO_URL}/SOLIDWORKS_SIMULATION_GUIDE.md). Expect agreement within roughly 10–20 %; explain any larger difference.

### What this model does not capture
* Layer-by-layer anisotropy, voids, under-extrusion and weak interlayer bonding (only a single spanwise card is used).
* Post-buckling behaviour, local crippling at rib edges, stress concentrations at rib/sleeve junctions and at the root clamp.
* Shear lag, rib flexibility, partial composite action of the floating sleeves between ribs.
* Real contact at dry seams: the hinge spring and the clearance dead band are estimates with uncertain inputs.
* Aerodynamics: the load shapes are prescribed, not computed; no aeroelastic feedback.

### Engineering record — write one entry
**Claim** (one sentence) · **Evidence** (the number and the cell that produced it) · **Check** (hand calculation, limiting case, second method or measurement) · **Confidence** (high/medium/low and why) · **Limitation** (which assumption could change the conclusion).
"""
)

code(
    """
#@title 15. Export evidence files (CSV + JSON) { display-mode: "form" }
TEAM_ID = "Team00" #@param {type:"string"}
REVISION = "R02" #@param {type:"string"}
files = pws.export_results(res, prefix=f"{TEAM_ID}_{REVISION}_structural")
print("Written:", *files, sep="\\n  ")
try:
    from google.colab import files as _colab_files
    for f in files:
        _colab_files.download(f)
except ImportError:
    print("Not running in Colab: the files are in the notebook's working folder.")
"""
)

md(
    """
## Sources

* Course CAD generator `mie446_wing` v1.1.1 — geometry rules reproduced exactly (NACA surfaces, vertical skin offset, cavity 6–90 % chord, sleeve radius, rib stations).
* R. van Leeuwen, *sectionproperties* — 2-D finite-element warping analysis of arbitrary cross-sections (torsion constant, shear centre, shear stress).
* NASA SP-8007, *Buckling of Thin-Walled Circular Cylinders* (1968 rev.) — knock-down factor used in the skin-buckling screen.
* T. H. G. Megson, *Aircraft Structures for Engineering Students* — Bredt–Batho torsion, shear flow, modulus-weighted sections, plate buckling.
* H. Gonabadi, A. Yadav, S. J. Bull, "The effect of processing parameters on the mechanical characteristics of PLA produced by a 3D FFF printer", *Int. J. Adv. Manuf. Technol.* (2020) — build-orientation anisotropy of printed PLA.
* Easy Composites, *Carbon Fibre Pultrusions* technical data sheet; Rock West Composites part 47316 data — low- and high-bound rod cards.
"""
)

notebook = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "colab": {"name": OUT.name, "provenance": []},
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.x"},
    },
    "cells": cells,
}
for index, cell in enumerate(notebook["cells"]):
    cell["id"] = f"pws-{index:02d}"
    cell["source"] = cell["source"].splitlines(keepends=True)


def _execute(nb_dict: dict) -> dict:
    """Run every cell in a scratch folder so the saved notebook shows figures before execution."""

    import tempfile

    import nbformat
    from nbclient import NotebookClient

    plain = json.loads(json.dumps(nb_dict))
    for cell in plain["cells"]:
        cell["source"] = "".join(cell["source"])
    nb = nbformat.from_dict(plain)
    with tempfile.TemporaryDirectory() as tmp:
        # Seed the local engine so a test run works before the module is on the main branch.
        shutil.copy(HERE / "printed_wing_solver.py", Path(tmp) / "printed_wing_solver.py")
        NotebookClient(nb, timeout=1200, kernel_name="python3", resources={"metadata": {"path": tmp}}).execute()
    for cell in nb.cells:
        if cell.cell_type == "code":
            cell.outputs = [o for o in cell.outputs if o.get("name") != "stderr"]
            for out in cell.outputs:
                if out.get("output_type") == "error":
                    raise RuntimeError(f"cell {cell.get('id')} failed: {out.get('ename')}: {out.get('evalue')}")
    return json.loads(nbformat.writes(nb))


if __name__ == "__main__":
    import sys

    result = _execute(notebook) if "--execute" in sys.argv else notebook
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    state = "executed" if "--execute" in sys.argv else "unexecuted"
    print(f"Wrote {OUT.relative_to(REPO)} ({state}) with {len(cells)} cells")
