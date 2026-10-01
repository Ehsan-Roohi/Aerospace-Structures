"""Add a short, transparent manufacturing-design bridge without replacing L1."""
from pathlib import Path
import ast
import base64
import contextlib
import io
import json

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb"


def cell(kind, identifier, text):
    result = {"cell_type": kind, "id": identifier, "metadata": {},
              "source": text.strip().splitlines(keepends=True)}
    if kind == "code":
        result.update(execution_count=None, outputs=[])
    return result


ADDITIONS = [
    cell("markdown", "l01-design-three-checks", r"""
### 7F. From naming parts to making a design decision

A structural design begins with a **requirement**, not with the question “Which shape looks strongest?” Define the loads and supports, propose a connected structure, check its response, and revise it. Three different checks matter:

| Check | Plain-language question | Why the other checks are not enough |
|---|---|---|
| **Strength** | Does material or a joint suffer unacceptable damage under the stated load? | A part may remain undamaged but bend too much. |
| **Stiffness** | Does it bend or twist more than the permitted amount? | Small deflection alone does not rule out a local failure. |
| **Buckling** | Can a thin compressed panel or web lose its stable shape? | A thin panel can buckle before its material reaches its compressive strength. |

**Read a bending wing:** in a simple cantilever under upward loading, the upper region is generally in compression and the lower region in tension. Ribs support the section shape; skin stiffeners divide broad panels into smaller supported regions. More supports or thicker material can help some checks, but add mass and manufacturing effort. No single change improves every objective automatically.

**Example decision:** an AI proposes removing every other rib to save mass. The proposal is not accepted just because the outside airfoil is unchanged. Ask how the unsupported skin region changes, how local loads reach the spanwise members, and whether printability or assembly changes. We have not yet calculated a safe rib spacing.

These distinctions inform our project, but **the team wing remains a non-flying, unloaded demonstrator**. Numerical examples teach mechanics; they do not authorize flight or a physical load-to-failure test.

*Teaching connection: Sadaf Khosoussi, Airframe Structural Design (2021–22), supplied Design, Materials and Buckling notes. We adapt the design questions, not the notes' aircraft dimensions, aluminium properties or design allowables to printed PLA.*
"""),
    cell("markdown", "l01-project-model-map", r"""
### 7G. What do those aircraft parts become in our printed model?

| Full-scale idea | Our baseline demonstrator | What you must not assume |
|---|---|---|
| Skin defines the exterior and shares loads | A hollow printed shell with nominal CAD skin setting **1.2 mm** | This is not a calibrated aircraft skin or a guaranteed printed wall thickness. |
| Ribs maintain section shape and distribute local loads | Printed chordwise diaphragms, nominally **1.6 mm** thick, with rod passages | Their count is a layout rule, not the answer to a buckling optimization. |
| Spars are major spanwise structural members | Two **4 mm rods and printed sleeves**, at 30% and 60% of local chord | A rod/sleeve assembly is not equivalent to the deep cap-and-web spar in the FAA cutaway. |
| Joints must transfer loads between members | Three printed modules, two seams, and rod/sleeve interfaces | A rod that fits proves fit, not joint strength, stiffness or flightworthiness. |

There are **no separate aircraft-style skin stringers in this baseline**. Do not label every printed sleeve a stringer. Root and tip closures are also distinct from the seven internal rib stations below.

Our immediate requirement is a correctly dimensioned, manufacturable model and documented assembly fit. A structural performance claim would additionally need credible printed-material properties, joint/support assumptions and appropriate validation. Layer orientation and bonding matter; a handbook aluminium property is not a PLA property.
"""),
    cell("markdown", "l01-seven-ribs-theory", r"""
### 7H. Why does the three-module baseline have seven ribs?

**Start with the rule, then look at the picture.** The semi-span is 450 mm. Three equal modules give seams at 150 and 300 mm, measured from the wing root.

1. The code proposes **three ordinary internal stations** at one-quarter, one-half and three-quarters of the semi-span: **112.5, 225 and 337.5 mm**.
2. Each seam receives a pair of ribs, one **4 mm before** and one **4 mm after** it. This leaves a rib near the end of each adjoining printed module: **146/154 mm** and **296/304 mm**.
3. None of the ordinary stations conflicts with a seam in this baseline. We therefore retain **3 ordinary ribs + 4 seam-adjacent ribs = 7 ribs**.

| Printed module | Span interval, mm | Rib-centre stations, mm |
|---|---|---|
| 1, root module | 0–150 | 112.5, 146 |
| 2, middle module | 150–300 | 154, 225, 296 |
| 3, tip module | 300–450 | 304, 337.5 |

These distances locate the **middle of each rib's thickness**, not the edge. The seam itself is not an additional rib. Seven is **not a universal wing-design requirement** or an experimentally proven optimum: it follows from this particular manufacturing layout. The code rejects ordinary candidate stations too close to seams and merges near-duplicates, so a changed module layout requires a fresh station report, not blind use of “3 + 2 per seam.”

**Before running the next cell:** point to the two seams on your R01 drawing; predict which module contains each of the seven ribs. The following figure is a plan-view map, not a 3D construction drawing. The small lower panels enlarge each seam so that the paired ribs remain distinguishable.

Implementation reference: [`WingParameters.rib_stations_mm()`](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/src/mie446_wing/config.py). Use the manufacturing notebook's actual station report when your approved parameters differ.
"""),
    cell("code", "l01-seven-ribs-map", r"""
#@title 7H. Run the baseline rib map — three ordinary ribs plus four seam ribs { display-mode: "form" }
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.lines import Line2D

# This transparent fixed example illustrates the approved three-module baseline.
# The manufacturing notebook remains the authority for changed parameters.
semi_span = 450.0
seams = np.array([150.0, 300.0])
ordinary_ribs = semi_span * np.array([0.25, 0.50, 0.75])
seam_ribs = np.array([seam + offset for seam in seams for offset in (-4.0, 4.0)])
rib_centres = np.sort(np.r_[ordinary_ribs, seam_ribs])
assert np.allclose(rib_centres, [112.5, 146, 154, 225, 296, 304, 337.5])

def local_chord(span_station):
    return 160.0 + (100.0 - 160.0) * np.asarray(span_station) / semi_span

fig = plt.figure(figsize=(13, 7.4), constrained_layout=True)
grid = fig.add_gridspec(2, 2, height_ratios=[2.0, 1.0])
ax = fig.add_subplot(grid[0, :])
y = np.linspace(0, semi_span, 200)
ax.fill_between(y, 0, local_chord(y), facecolor="#edf3f7", edgecolor="#1c3552", linewidth=2)
for fraction in (0.30, 0.60):
    ax.plot(y, fraction * local_chord(y), color="#656565", linewidth=2, linestyle="--")
for j, position in enumerate(rib_centres, start=1):
    colour = "#146689" if position in ordinary_ribs else "#b35b13"
    ax.plot([position, position], [0, local_chord(position)], color=colour, linewidth=3)
    ax.text(position, -13 if j % 2 else -27, f"R{j}", ha="center", color=colour, fontsize=11, fontweight="bold")
for seam in seams:
    ax.axvline(seam, color="black", linestyle=":", linewidth=1.4)
for left, right, label in [(0, 150, "Module 1"), (150, 300, "Module 2"), (300, 450, "Module 3")]:
    ax.text((left + right) / 2, -43, label, ha="center", fontsize=12, fontweight="bold")
ax.text(0, -47, "ROOT", ha="left", fontsize=11, fontweight="bold")
ax.text(450, -47, "TIP", ha="right", fontsize=11, fontweight="bold")
ax.set_xlim(-5, 455)
ax.set_ylim(170, -55)  # Leading edge above trailing edge in this plan view.
ax.set_xlabel("Span station measured from root, y (mm)", labelpad=13)
ax.set_ylabel("Distance aft of local leading edge (mm)")
ax.set_title("Seven distinct ribs — follow their direction, not just their colour", fontsize=15, pad=35)
ax.set_xticks([0, 75, 150, 225, 300, 375, 450])
ax.set_yticks([0, 25, 50, 75, 100, 125, 150])
ax.grid(alpha=0.15)
ax.legend(handles=[Line2D([0], [0], color="#146689", lw=3, label="ordinary rib"),
                   Line2D([0], [0], color="#b35b13", lw=3, label="seam-adjacent rib"),
                   Line2D([0], [0], color="black", ls=":", label="module seam"),
                   Line2D([0], [0], color="#656565", ls="--", label="rod / sleeve centre path")],
          loc="upper center", bbox_to_anchor=(0.5, 1.13), ncol=4, fontsize=9, frameon=False)

for panel, seam in zip((fig.add_subplot(grid[1, 0]), fig.add_subplot(grid[1, 1])), seams):
    panel.axvspan(seam - 10, seam, color="#edf3f7")
    panel.axvspan(seam, seam + 10, color="#f6f6f6")
    panel.axvline(seam, color="black", ls=":", lw=2)
    for position in (seam - 4, seam + 4):
        panel.axvspan(position - 0.8, position + 0.8, color="#b35b13")
        panel.text(position, 0.62, f"{position:g} mm\nrib centre", ha="center", fontsize=10,
                   bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.94})
    panel.annotate("", (seam - 4, 0.24), (seam, 0.24), arrowprops={"arrowstyle": "<->"})
    panel.annotate("", (seam + 4, 0.24), (seam, 0.24), arrowprops={"arrowstyle": "<->"})
    panel.text(seam - 2, 0.08, "4 mm", ha="center", fontsize=10)
    panel.text(seam + 2, 0.08, "4 mm", ha="center", fontsize=10)
    panel.set(xlim=(seam - 10, seam + 10), ylim=(0, 1), yticks=[], xticks=[seam - 4, seam, seam + 4])
    panel.set_title(f"Enlargement: seam at {seam:g} mm | rib thickness 1.6 mm", fontsize=11)
    panel.set_xlabel("Span station (mm)")
plt.show()
print("Rib-centre stations (mm):", ", ".join(f"{v:g}" for v in rib_centres))
print("Map check: module 1 has 2 ribs; module 2 has 3 ribs; module 3 has 2 ribs.")
print("This is a geometric layout check, not a strength or buckling calculation.")
"""),
    cell("markdown", "l01-skin-manufacturing-check", r"""
### 7I. Skin thickness: a CAD dimension is not a printer setting

Follow this chain: **specified geometry → sliced paths → printed material → measured part**. Each step can introduce a difference.

- **CAD:** the baseline uses a 1.2 mm nominal skin parameter. In this generator the cavity is constructed by shifting upper/lower surface ordinates inward vertically; it is not a constant-normal-thickness shell everywhere. Leading/trailing regions and end closures have separate geometry. Inspect sections rather than assuming every location is exactly 1.2 mm thick.
- **OrcaSlicer:** wall loops are extrusion paths; layer height is the step in the printer's build direction. Neither alone specifies the skin thickness of a curved, tilted part. A 0.4 mm nozzle does not mean every extrusion is exactly 0.4 mm wide. Inspect the selected line widths, top/bottom regions and all relevant layers using the staff-approved profile.
- **Printed part:** gaps, bonding, orientation and dimensional error can change the result. The rod coupon checks **rod fit only**; it does not validate skin strength or bonding. Staff should qualify the printing setup; teams must not interpret a successful coupon as permission to load the wing.

**Two-minute design review, using only what we have taught:**

1. On your R01 sketch, identify all seven rib centres and both seams. Explain why there are two ribs near a seam instead of one shared rib.
2. Point to a rod/sleeve path and explain why it is not the same structure as a full-scale spar web with caps.
3. An AI says, “The model printed, therefore it can carry the calculated flight load.” State the missing evidence; distinguish a fit check from a structural check.

Submit the annotated sketch and a short explanation in your own words. The next lecture develops loads and simple numerical checks; the **Code-to-Print Wing** notebook generates manufacturing geometry. The separate **Wing Structural Design Numerical** notebook explores idealized structural response. Do not mistake the beam model for a validated analysis of this printed assembly.
"""),
]


def main():
    notebook = json.loads(PATH.read_text(encoding="utf-8"))
    ids = {item["id"] for item in ADDITIONS}
    notebook["cells"] = [item for item in notebook["cells"] if item.get("id") not in ids]
    insert_at = next(i for i, item in enumerate(notebook["cells"]) if item.get("id") == "ac7333f3")
    for item in ADDITIONS:
        if item["cell_type"] == "code":
            ast.parse("".join(item["source"]))
    notebook["cells"][insert_at:insert_at] = ADDITIONS
    # Save the original scientific figure output for GitHub readers as well as Colab.
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    original_show = plt.show
    plt.show = lambda: None
    figure_cell = next(item for item in ADDITIONS if item["id"] == "l01-seven-ribs-map")
    stream = io.StringIO()
    namespace = {}
    try:
        with contextlib.redirect_stdout(stream):
            exec(compile("".join(figure_cell["source"]), "rib-map-cell", "exec"), namespace)
        buffer = io.BytesIO()
        namespace["fig"].savefig(buffer, format="png", dpi=145, bbox_inches="tight")
        figure_cell["outputs"] = [
            {"output_type": "display_data", "metadata": {}, "data": {
                "image/png": base64.b64encode(buffer.getvalue()).decode("ascii"),
                "text/plain": ["Baseline three-module rib map with seam enlargements"]}},
            {"output_type": "stream", "name": "stdout", "text": stream.getvalue().splitlines(keepends=True)},
        ]
    finally:
        plt.show = original_show
        plt.close("all")
    introduction = notebook["cells"][0]
    source = "".join(introduction["source"])
    outcome = "11. distinguish strength, stiffness and buckling; explain the seven-rib baseline and the limits of CAD, slicing and coupon-fit evidence."
    if outcome not in source:
        source = source.replace("### Teaching route across multiple sessions", outcome + "\n\n### Teaching route across multiple sessions")
    route = "**Manufacturing bridge (Sections 7F–7I):** allow about 15–20 minutes for the three design checks, seven-rib map and annotated R01 sketch. These sections precede the project evidence audit; the photographs remain available as reference."
    if route not in source:
        source += "\n\n" + route + "\n"
    introduction["source"] = source.splitlines(keepends=True)
    audit = next(item for item in notebook["cells"] if item.get("id") == "ac7333f3")
    audit["source"] = [line.replace("#@title 7C. AI audit", "#@title 7J. AI audit") for line in audit["source"]]
    PATH.write_text(json.dumps(notebook, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Updated L1:", ", ".join(item["id"] for item in ADDITIONS))


if __name__ == "__main__":
    main()
