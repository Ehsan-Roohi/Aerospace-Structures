"""Add inspectable load bookkeeping and a baseline rib map to Lecture 02."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb"
nb = json.loads(PATH.read_text(encoding="utf-8"))
nb["cells"] = [c for c in nb["cells"] if not c["id"].startswith("l2-clear-")]

def text(c):
    return "".join(c["source"])

def cell(kind, ident, source):
    item = dict(cell_type=kind, id="l2-clear-" + ident, metadata={}, source=source.strip().splitlines(keepends=True))
    if kind == "code":
        item.update(execution_count=None, outputs=[])
    return item

def insert_before(ident, additions):
    index = next(i for i,c in enumerate(nb["cells"]) if c["id"] == ident)
    nb["cells"][index:index] = additions

retrieval = next(c for c in nb["cells"] if c["id"] == "06b6359c")
retrieval["source"] = r"""### Learn the definition, then make a prediction

Aspect ratio compares span with area: $AR=b^2/S$, where $b$ is **full span** and $S$ is **full-wing projected area**. Holding area fixed while multiplying span by $k$ multiplies aspect ratio by $k^2$. Section 1 explains the geometry in detail.

Two symmetric wings have the same full-wing area. Wing B has a 20% larger span. Does its aspect ratio increase by 20%, increase by 44%, or remain unchanged?

Use the definition to predict before running code. Later we will ask whether this geometry change also reduces the bending demand at the root.
""".splitlines(keepends=True)

insert_before("f796fc19", [cell("markdown", "design-chain", r"""
### Design is a sequence of explainable decisions

Read this from left to right: **requirements → geometry and material → load assumptions → structural demand → checks → revise**. A CAD model answers *what shape?*; equilibrium answers *what must the structure carry?*; material and section properties are needed to ask *can it carry it?*

| Stage | What the student must say | What this lecture actually does |
|---|---|---|
| Inputs | Which length, area, force and units did I enter? | Geometry and an explicitly assumed load |
| Assumptions | What is fixed; what is omitted? | Symmetric equivalent wing; ideal cantilever in the structural example |
| Demand | What force and moment reach the root? | Add strip forces and their lever-arm moments |
| Capacity | How much stress, deflection or instability is acceptable? | Not established by this lecture; needs section, material, joints and limits |
| Evidence | How did I check the computer? | One independent force-times-distance calculation and a units check |

This design-loop perspective is adapted from the instructor-supplied *Structural Design* notes by Sadaf Khosoussi. We use the reasoning, not that course's metal-wing sizing data or flight load cases. Our student wing is a **non-flying, unloaded educational assembly**; all loads here are virtual.
""")])

insert_before("ebb98d85", [cell("markdown", "strip-theory", r"""
### See the calculation before trusting the curve

A numerical integral is a sum of small contributions. For strip $i$, multiply its load per length by its width to get force. Then multiply that force by its distance from the root to get moment:

$$F_i=w_i\,\Delta y_i,\qquad M_i=F_i\,y_i.$$

**Net load is not always lift alone.** For a simple stationary virtual example, take upward aerodynamic load as positive and subtract downward distributed weight. Engine, fuel and other point loads need their own entries. Maneuver/inertia loads require a consistently defined flight load case; we are not constructing one here.

Consider our 0.45 m semi-wing with a **hypothetical**, uniform upward load of 20 N/m and downward weight of 2 N/m. The net load is 18 N/m. Five equal strips are 0.09 m wide; each contributes 1.62 N. Their centers are 0.045, 0.135, 0.225, 0.315 and 0.405 m.

The independent hand check is:

$$F_{\mathrm{net}}=18(0.45)=8.10\ \mathrm{N},\qquad
M_{\mathrm{root,applied}}=8.10(0.225)=1.8225\ \mathrm{N\,m}.$$

At an imaginary cut, keep only the loads **outboard** of that cut and measure their distances **from the cut**, not from the root. Internal shear balances their total force; internal bending moment balances their total moment. The next plots show demand magnitudes, not signed support reactions. For this benchmark, with $y$ measured from the root:

$$V(y)=18(s-y),\qquad M(y)=\frac{18(s-y)^2}{2},\qquad s=0.45\ \mathrm{m}.$$

**Predict:** where are shear and bending largest, and what should both become at the unloaded free tip? Explain using the amount of wing left outboard of a cut.
"""), cell("code", "strip-code", r'''
#@title 4C. Open the calculation — five strips, two checks, no solver { display-mode: "form" }
# This independent benchmark does not change Section 4B's aerodynamic comparison.
demo_span = 0.45
demo_upward, demo_downward = 20.0, 2.0  # N/m; hypothetical, not measured
demo_net = demo_upward - demo_downward
edges = np.linspace(0.0, demo_span, 6)
widths = np.diff(edges)
centers = (edges[:-1] + edges[1:]) / 2
strip_force = demo_net * widths
strip_moment = strip_force * centers
print("Strip   center (m)   width (m)   force (N)   root moment (N m)")
for i, (yc, dy, force, moment) in enumerate(zip(centers, widths, strip_force, strip_moment), 1):
    print(f"{i:3d}     {yc:8.3f}     {dy:7.3f}     {force:7.3f}       {moment:9.4f}")
print(f"SUM                              {sum(strip_force):7.3f}       {sum(strip_moment):9.4f}")
assert np.isclose(sum(strip_force), demo_net * demo_span)
assert np.isclose(sum(strip_moment), demo_net * demo_span**2 / 2)
print("Independent total force and force × centroid checks: PASS")

stations = np.linspace(0, demo_span, 151)
shear_demand = demo_net * (demo_span - stations)
bending_demand = demo_net * (demo_span - stations)**2 / 2
fig, axes = plt.subplots(1, 3, figsize=(13, 3.7), layout="constrained")
axes[0].bar(centers, strip_force, width=0.072, color=BLUE)
axes[0].set(title="1. Add five strip forces", ylabel="Net force per strip (N)")
axes[1].plot(stations, shear_demand, color=ORANGE, lw=2)
axes[1].set(title="2. Force left outboard of cut", ylabel="Shear demand magnitude (N)")
axes[2].plot(stations, bending_demand, color=GREEN, lw=2)
axes[2].set(title="3. Include distance from cut", ylabel="Bending demand magnitude (N m)")
for ax in axes:
    ax.set_xlabel("y from root (m)")
    ax.set_xlim(0, demo_span)
plt.show()
print("Largest at root; zero at unloaded free tip. These checks verify this calculation,")
print("not the truth of the assumed load or the strength of the printed wing.")
''')])

insert_before("ad7911af", [cell("markdown", "demand-capacity", r"""
### Three different questions: strength, stiffness, stability

| Question | Plain-language meaning | Needed beyond this lecture |
|---|---|---|
| Strength | Does a material or joint exceed its allowable stress/load? | Cross-section, suitable printed-material allowables, joint behavior |
| Stiffness | Does the structure bend or twist too much? | Elastic properties, section stiffness, attachment assumptions |
| Local stability | Does a thin skin panel wrinkle or buckle? | Panel thickness, support spacing, boundary conditions and load direction |

For a fixed ideal cantilever and applied load, changing thickness does **not** change the equilibrium root moment; it changes the stresses and deformation needed to carry that moment. More ribs can shorten unsupported skin panels but also add mass and print time. A smaller displacement alone does not prove a design is strong enough, and a low calculated stress does not by itself rule out buckling.

**Where does torsion come from?** A transverse load acting away from a section's **shear center** can twist the wing. In a simplified beam model, torque magnitude is force times perpendicular offset: $T=F e$. A distributed aerodynamic pitching couple can contribute as well. The shear center is a structural property: it is not automatically the aircraft CG, the section centroid or the 25% chord point. We have not calculated it here, so a selected offset is an **assumption**, not a discovered property of our wing.

Use the numerical design notebook for transparent ideal-beam comparisons; use the Code-to-Print notebook for actual CAD and the physical fit gate. Neither a green calculation check nor a successful STL export authorizes flight or physical loading of the student assembly.
""")])

insert_before("64f49c04", [cell("markdown", "rib-theory", r"""
### Where do the seven ribs come from? Read the construction rule

The **450 mm, three-module baseline** has seven rib center stations. This is a construction layout, **not a mathematically optimized rib count** and not a result of the lift calculation.

1. Three interior candidates divide the semi-span into four equal intervals: $450/4=112.5$ mm. Candidates: **112.5, 225, 337.5 mm**.
2. Three 150 mm modules have seams at **150 and 300 mm**.
3. Add one support rib **4 mm on either side** of each seam: **146, 154, 296, 304 mm**. Each neighboring printed module has its own nearby rib.
4. For this baseline all candidates are retained: **3 interior + 4 seam-support ribs = 7 ribs**. These are centers of the rib thickness, not the module cut planes.

| Module | Spanwise interval from root (mm) | Rib centers (mm) |
|---|---|---|
| 1 | 0–150 | 112.5, 146 |
| 2 | 150–300 | 154, 225, 296 |
| 3 | 300–450 | 304, 337.5 |

**Why not automatically use seven for every design?** The production function `WingParameters.rib_stations_mm()` removes interior candidates too close to seams and merges nearby stations. Different module counts, offsets or thicknesses can change the final count. Always read the generated stations in the design record; do not generalize $3+4$ to a different layout.

Ribs run chordwise; rod/sleeve paths run spanwise at 30% and 60% of **local** chord. Near-seam ribs support local shape and the interface region; they do not alone prove joint strength. Rods and printed sleeves are an educational construction, not a complete replica of a full-scale spar.

**Before viewing:** mark seams with dashed lines and ribs with solid lines on your team layout. Which ribs belong to the middle module?
"""), cell("code", "rib-map", r'''
#@title 6B. Baseline construction map — distinguish ribs, rods and seams { display-mode: "form" }
# Fixed baseline illustration, not a replacement for the production CAD generator.
span_mm = 450.0
interior = np.array([112.5, 225.0, 337.5])
seams = np.array([150.0, 300.0])
supports = np.sort(np.concatenate([seams - 4.0, seams + 4.0]))
ribs = np.sort(np.concatenate([interior, supports]))
assert np.allclose(ribs, [112.5, 146, 154, 225, 296, 304, 337.5])
yy = np.linspace(0, span_mm, 301)
local_chord = 160 - 60 * yy / span_mm
fig, axes = plt.subplots(2, 1, figsize=(12, 6.8), layout="constrained", gridspec_kw={"height_ratios": [2, 1]})
ax = axes[0]
ax.fill_between(yy, 0, local_chord, color=BLUE, alpha=0.08)
ax.plot(yy, 0*yy, color="black", lw=1)
ax.plot(yy, local_chord, color="black", lw=1)
for j, frac in enumerate([0.30, 0.60]):
    ax.plot(yy, frac*local_chord, color=BLUE, lw=2, label="Rod/sleeve center paths" if j == 0 else None)
for j, station in enumerate(ribs):
    chord = 160 - 60*station/span_mm
    is_interior = np.any(np.isclose(station, interior))
    ax.plot([station,station],[0,chord],color=GREEN if is_interior else ORANGE,lw=2)
    ax.text(station, chord+6, str(j+1), ha="center", fontsize=10)
for station in seams:
    ax.axvline(station, color="black", ls="--", lw=1)
ax.set(xlim=(-8,458), ylim=(-10,200), ylabel="Aft from local LE (mm)",
       title="Top-view baseline: ribs numbered 1–7; dashed black lines are cuts, not ribs")
ax.legend(loc="upper right", fontsize=9)
ax.text(5,184,"Green: interior ribs     Orange: seam-support ribs",fontsize=10)
ax.set_xlabel("Spanwise y from root (mm)")
# A separate enlarged seam view makes the 8 mm pair spacing readable.
ax = axes[1]
ax.axvline(150,color="black",ls="--",label="Module seam at 150 mm")
for station, caption in [(146,"Module 1 rib"),(154,"Module 2 rib")]:
    ax.axvspan(station-0.8,station+0.8,color=ORANGE,alpha=0.45)
    ax.text(station,0.75,caption,ha="center",fontsize=10)
    ax.text(station,0.32,f"center {station} mm",ha="center",fontsize=10)
ax.annotate("",(150,0.52),(146,0.52),arrowprops={"arrowstyle":"<->"})
ax.annotate("",(154,0.52),(150,0.52),arrowprops={"arrowstyle":"<->"})
ax.text(148,0.57,"4 mm",ha="center"); ax.text(152,0.57,"4 mm",ha="center")
ax.set(xlim=(140,160),ylim=(0,1),yticks=[],xlabel="Enlarged first seam region (mm)",
       title="Detail: rib thickness 1.6 mm; same arrangement around the 300 mm seam")
plt.show()
print("Rib center stations (mm):", ", ".join(f"{value:g}" for value in ribs))
print("Module 2 contains ribs at 154, 225 and 296 mm. Count = 7 for this baseline only.")
''')])

intro = next(c for c in nb["cells"] if c["id"] == "7719229a")
marker = "\n\n**Updated design studio route:**"
intro["source"] = (text(intro).split(marker)[0] + marker + " The strip-by-strip benchmark (4C) and seven-rib map (6B) make the project calculations visible. For a 75-minute pre-print session, use these in place of extra sweep/dihedral and induced-drag parameter sweeps; those comparisons remain available for independent study. Read each explanation before its question. This lecture verifies geometry and equilibrium, not flight capability or print release.\n").splitlines(keepends=True)
sources = next(c for c in nb["cells"] if c["id"] == "ba41365d")
addition = "\n\n**Design-method attribution:** Sadaf Khosoussi, instructor-supplied *Airframe Structural Design* course notes, 2021–22: Design unit, pp. 3–9 (layout, sizing and iteration), and Loading unit, pp. 3 and 6–8 (external loads, required inputs and internal resultants). These ideas are adapted for an introductory virtual model; the original notes' metal properties, spar locations and advanced sizing procedures are not transferred to our PLA assembly. The baseline rib map is grounded in this course repository's [configuration code](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/src/mie446_wing/config.py), not attributed to those notes.\n"
sources["source"] = (text(sources).split("\n\n**Design-method attribution:**")[0] + addition).splitlines(keepends=True)
PATH.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"Updated {PATH.name}: {len(nb['cells'])} cells")
