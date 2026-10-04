# SolidWorks Simulation Cross-Check of the Printed Wing

**MIE 446 Aerospace Structures · Fall 2026 · optional second method for the wing project**

[Course home](README.md) · [Wing project](PROJECT.md) · [Printed-Wing Structural Solver notebook](notebooks/MIE446_Printed_Wing_Structural_Solver.ipynb) · [Solver source and tests](computational/printed-wing-solver/README.md)

[![Open the Printed-Wing Structural Solver in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Printed_Wing_Structural_Solver.ipynb)

## 1. Purpose and boundary

The [Printed-Wing Structural Solver](notebooks/MIE446_Printed_Wing_Structural_Solver.ipynb) is the primary analysis tool for the project. This guide shows how to check one of its results with a completely different method: a 3-D solid finite-element model of the same STEP geometry in SOLIDWORKS Simulation.

The comparison case is deliberately simple:

| Setting | Value |
|---|---|
| Geometry | Your final `MIE446_<Team>_Wing_Complete_<Revision>.step` from the verified ZIP |
| Joints | Continuous shell (the STEP has no seams) and rods filling and bonded in their holes; use the **matched hole-filling comparison** in Section 7, not the default 4 mm rod model |
| Support | Root face fully fixed |
| Load | 10 N upward, spread over the tip face |
| Material | The **same** PLA card you used in the notebook |
| Outputs | Tip deflection, spanwise normal stress near the root, first flap-bending frequency |

This is a numerical exercise only. It does **not** authorise loading, cracking or flying your team wing.

SOLIDWORKS runs only on Windows; use a Windows lab machine with the Simulation add-in. Budget about 60 minutes the first time.

## 2. Import the geometry

1. **Tools → Add-Ins**: tick **SOLIDWORKS Simulation** (both columns).
2. **File → Open**, set the file type to STEP, open the complete-wing STEP from your extracted final ZIP. If SOLIDWORKS offers **Import Diagnostics**, run it and accept repairs.
3. **Tools → Options → Document Properties → Units**: choose **MMGS**.
4. Check the axes. The course CAD uses **x = chord (from the leading edge), y = span (from the root), z = up**. In SOLIDWORKS this means the wing's *up* direction is the global **Z** axis and the **Front Plane** (XY) is normal to it. The **Top Plane** (XZ) is normal to the span.
5. Measure the root chord, tip chord and semi-span with **Tools → Evaluate → Measure** and confirm they match your form.

## 3. Add the rods as separate bodies

The STEP contains the printed shell with two empty rod holes. Fill each hole with a rod body:

1. **Insert → Boss/Base → Loft**.
2. **Profiles**: select the circular edge of the front hole on the root face, then the matching edge on the tip face.
3. Clear **Merge result**. Confirm.
4. Repeat for the rear hole. The **Solid Bodies** folder should now list three bodies.

These idealized rods have the hole diameter (rod + 2 × clearance, for example 4.5 mm). Assigning carbon properties to the entire hole is a **hole-filling comparison model**, not a faithful model of a 4 mm carbon rod with a softer epoxy annulus. Section 7 preserves the printed geometry while matching this idealization. For actual epoxy properties, model carbon and adhesive separately; do not claim exact equivalence to the classroom assembly.

## 4. Static study

1. **Simulation → New Study → Static**. Name it `Tip10N_bonded`.
2. **Materials** (right-click each body → *Apply/Edit Material* → *Custom Materials*, model type *Linear Elastic Isotropic*):

   | Card | E (N/mm²) | Poisson | Density (kg/m³) | Tensile strength (N/mm²) |
   |---|---:|---:|---:|---:|
   | PLA upright (span = print Z) | 2000 | 0.35 | 1240 | 15 |
   | PLA flat (span in build plane) | 3000 | 0.35 | 1240 | 45 |
   | Carbon rod, hobby grade | 25000 | 0.30 | 1400 | 260 |
   | Carbon rod, aerospace T700 | 131000 | 0.30 | 1500 | 1680 |

   Use the cards that match your notebook run. Then **Evaluate → Mass Properties** and compare the PLA mass with the notebook (baseline: about 241 g printed PLA).
3. **Connections**: keep the default **global bonded** contact between touching bodies. That is the "epoxied" assumption.
4. **Fixtures → Fixed Geometry**: select the root face of the shell **and** the root faces of both rods.
5. **External Loads → Force**: select only the shell's tip face. Choose **Selected direction**, pick the **Front Plane**, enter **10 N normal to the plane**, and make sure the arrows point **up** (+Z). The resultant acts at the tip-face centroid, about 0.43 chord from the leading edge.
6. **Mesh** (right-click → *Create Mesh*): *Blended curvature-based mesh*, high quality (quadratic) elements, maximum element size 3 mm, minimum 0.6 mm. Add a **Mesh Control** of 1.2 mm on the outer skin faces if the mesher allows it. Note the number of nodes and elements.
7. **Run**.

## 5. Read the results the same way as the notebook

1. **Displacement → UZ (mm)**. Use **Probe → On selected entities** on the tip face; record the **average** UZ. This is the tip deflection.
2. **Stress → SY: Y Normal Stress (N/mm²)** — the spanwise normal stress. Create a reference plane parallel to the Top Plane at **y = 25 mm**, use **Section Clipping** with it, and probe the outer upper skin and outer lower skin near the thickest part of the airfoil. Stay away from the fixed root face: a fully fixed face creates an artificial stress concentration.
3. Expected signs: upper skin in **compression** (negative), lower skin in **tension** (positive).

## 6. Frequency study

1. **New Study → Frequency**. Drag the *Materials*, *Connections* and *Fixtures* folders from the static study onto the new study.
2. Properties: **Number of frequencies = 5**. Run.
3. **List Resonant Frequencies** and animate each mode. Identify the first **flap-bending** mode (tip moves up and down), the first **chordwise (in-plane) bending** mode and the first **torsion** mode.
4. Compare only the flap-bending and torsion modes with the notebook. The 1-D notebook model does not compute chordwise bending. It also decouples bending and torsion; 3-D modes can be coupled. Use zero tip sensor mass in both models, or explicitly match its mass, position and rotational inertia.

## 7. Reference values and acceptance

Generate fresh reference values with the reviewed solver, rather than using a fixed table from an older version. After running the notebook, use this optional comparison cell:

```python
from dataclasses import replace
matched_geom = replace(geom,
    rod_diameter_mm=geom.rod_diameter_mm + 2 * geom.radial_clearance_mm,
    radial_clearance_mm=0.0)
# Hole and sleeve outer radii remain unchanged; only the comparison rod fills the hole.
matched = pws.solve(matched_geom, pla, rod,
    pws.Assembly(rods_bonded=True, seams_bonded=True),
    pws.LoadCase(kind="tip", tip_force_N=10.0,
                 tip_force_chord_fraction=0.429, tip_mass_g=0.0))
display(pd.Series(matched.summary()))
```

The 0.429 chord load position is an approximate baseline tip-face centroid. Measure the resultant location for your geometry and use that same fraction in both models. Compare stress at the same span station and physical point; a root maximum and a value at y = 25 mm are not equivalent.

Agreement within roughly 10–20 % can be a useful classroom discussion target, **not an acceptance certificate**. The 3-D model includes solid ribs, end caps, local sleeve attachments and coupled deformation; the reduced beam model makes simplifying assumptions. Investigate differences through units, materials, mesh convergence, fixtures, loads and model assumptions instead of treating every discrepancy as a software error. No SOLIDWORKS solution was executed to certify these comparisons.

## 8. Mesh convergence (required if you report a SOLIDWORKS number)

Solve the static study with maximum element sizes of about 6, 3 and 1.5 mm. Record the tip UZ and the node count for each, plot UZ against node count, and report the finest mesh only when the last refinement changes UZ by less than about 2 %. Stress near corners and the fixed face will not converge; that is expected.

## 9. Optional extension: dry seams

This extension needs a nonlinear contact solution and can take much longer.

1. Create reference planes parallel to the Top Plane at the seam stations (for the baseline, y = 150 and 300 mm) and use **Insert → Features → Split** to cut the shell into module bodies.
2. Model the rods at their real 4 mm diameter (a sketch circle on each end face, lofted, *Merge result* cleared), so a clearance gap remains.
3. Define **Contact Sets → No Penetration** between neighbouring module faces and between each rod and each hole surface. The solver may need *soft springs* to start.

Compare with the notebook run with *dry seams* and *slip-fit rods*. Expect a wide spread: the notebook's seam spring and clearance dead band are estimates, and the 3-D contact result depends strongly on clearance, friction and mesh. Explaining that spread is the engineering result.

## 10. Questions for your record

- Which number agreed best, which agreed worst, and what modelling difference explains it?
- Did the stress at y = 25 mm change sign where you expected? Where is the neutral axis?
- The 3-D model does not report skin buckling unless you run a separate buckling study. What does the notebook's buckling screen tell you that a linear static run cannot?
- Write one Claim — Evidence — Check — Confidence — Limitation entry that uses both methods.
