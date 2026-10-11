# Dewoitine D.520 S: CAD for SolidWorks / ANSYS and a wing stress analysis

[D.520 project home](../README.md) · [Report](REPORT.md) · [Blender model](../model/README.md) · [Wing Lab: the same wing in the browser](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#d520)

Built from the 1940 *Notice descriptive et d'utilisation* (the same sources as the Blender model).
Units: CAD in millimetres; FE decks in N, m, kg, Pa. Axes everywhere: **X aft from the spinner tip,
Y to starboard, Z up from the thrust axis**.

## Folders

| Folder / file | What it is | Open with |
|---|---|---|
| `cad/D520_airframe_OML.step` | Outer-mould-line assembly, 13 named solids: fuselage with canopy, wing, flaps L/R, ailerons L/R, tailplane, elevators L/R, fin, rudder, spinner, radiator bath | SolidWorks (File > Open, STEP AP214), ANSYS SpaceClaim / DesignModeler, any CAD |
| `cad/D520_<part>.step` | The same solids, one file each | as above |
| `cad/D520_airframe_OML.stl` | Tessellated OML (0.5 mm chord tolerance) | 3-D printing, CFD meshers, viewers |
| `cad/D520_wing_structure_surfaces.step` | Starboard half-wing structure as mid-surfaces, one body per part and gauge zone, **thickness in each body's name** (e.g. `Skin_upper_box_Z2_t1.2mm`) | SolidWorks Simulation shells, ANSYS Workbench shells |
| `cad/cad_report.json` | Validity, volumes, and deviation of every surface from the defining sections | |
| `ansys/D520_wing_r3.mac` | ANSYS Mechanical APDL deck: 41 066 SHELL181 elements, sections, symmetry and fuselage fittings, 1 g loads scaled by `NLF`, static solve, then linear buckling | MAPDL `/INPUT,D520_wing_r3,mac`; Workbench: Mechanical APDL system > Add Input File |
| `ansys/D520_wing_r3.bdf` | Same model as NASTRAN bulk data, SOL 101 | Workbench External Model, Femap, HyperMesh, MSC/NX/Simcenter Nastran, OptiStruct |
| `ansys/D520_wing_r3_calculix.inp` | The CalculiX (Abaqus-syntax) deck that was solved here | CalculiX `ccx`, Abaqus (minor keyword edits), PrePoMax |
| `ansys/D520_wing_r3_results_per_g.vtu` | FE results per g: von Mises (membrane and surface), spanwise stress, shear, displacement, thickness, part id | ParaView |
| `ansys/verify_exports.json` | The NASTRAN and APDL decks read back and re-solved: same reaction and tip deflection as the original run | |
| `data/` | Every input with its source (`stress_inputs.json`), span loads, hand-set-up load table (`solidworks_loads.json`), results summary | |
| `figures/` | Report figures | |
| `scripts/` | The whole pipeline (see the end of this file); the geometry module is `../model/scripts/d520_geom.py` | Python 3, CalculiX 2.21, CadQuery 2.8, Blender 5.2 (bpy) |
| `fe/<mesh>/` | Results of every shell run: r1–r4 mesh convergence, LE refinement, ±25 % skin, booms ×0.6, the non-linear run (`results.json`, `beam_check.json`) | |
| `REPORT.md` | The stress report: loads, FE checks, stresses at 6 g, buckling, post-buckling strength, limits | |

## Using the files

### ANSYS Mechanical APDL (closest to the analysis in the report)
1. `/INPUT,D520_wing_r3,mac` runs the 1 g static case, then linear buckling.
2. Change `*SET,NLF,1.0` at the top for another load factor: 6 = limit, 9 = ultimate, -3 = negative limit.
   Stresses scale linearly; buckling load multipliers multiply NLF.
3. Check: `FSUM` on the fitting nodes must give UZ reaction = NLF x (-10.6 kN) (half wing).
   Tip deflection 12.3 mm per g.

### ANSYS Workbench
* Mesh route: Workbench > External Model > `D520_wing_r3.bdf` (mesh, thicknesses, material), into a Static
  Structural system. Re-apply the supports and loads from the table below, or use the APDL deck instead.
* Geometry route: import `D520_wing_structure_surfaces.step` in SpaceClaim, run **Share Topology**, set each
  body's thickness from its name, then apply the loads below.

### SolidWorks Simulation (geometry route)
1. Open `cad/D520_wing_structure_surfaces.step`; every body is a surface body.
2. New Static study; Shell definition: thin, thickness = the number in the body name.
3. Material (custom): E = 72 GPa, nu = 0.33, density 2790 kg/m^3, yield 220 MPa, tensile 380 MPa (2017-T4 / AU4G).
4. Connections: Global Contact = Bonded (touching shells are bonded edge-to-face).
5. Fixtures: Symmetry on all edges lying in the plane Y = 0. At Y = 460 mm (fuselage fittings, a split edge on
   `SparWeb_Z0` and `FalseSpar_Z0`): spar web edge X and Z fixed; false-spar web edge Z fixed.
6. Loads per g (multiply by the load factor n):
   * Gravity: n x 9.81 m/s^2 in -Z.
   * Lift: a force in +Z (normal to the Top plane, total value) on the upper-skin faces of each zone:

| Zone | Span (m) | Lift per g (N) |
|---|---|---|
| Z0 | 0.00 - 0.70 | 2371 |
| Z1 | 0.70 - 1.50 | 2586 |
| Z2 | 1.50 - 2.31 | 2417 |
| Z3 | 2.31 - 3.25 | 2479 |
| Z4 | 3.25 - 4.20 | 2050 |
| Z5 | 4.20 - 4.93 (+ tip cap) | 1218 |

   * Non-structural masses as forces in -Z: fuel 861 N per g on the leading-edge skin from Y = 2.07 to 3.49 m;
     guns 210 N per g on the spar web near Y = 1.79-1.96 m; ammunition 319 N per g on the lower box skin at the same span.
   This zoned loading gives the root bending moment within 0.1 % of the lifting-line distribution.
7. Mesh: shell, 15-25 mm. Expected at n = 1: fitting reaction about 10.6 kN, tip deflection about 12 mm,
   spar boom stress about 8-12 MPa.

### The OML solids
`D520_airframe_OML.step` opens as an assembly with named, coloured parts. All solids pass the OpenCascade
validity and boolean-readiness checks; surfaces lie within 3.3 mm (wing), 2.0 mm (fuselage) and 7.8 mm
(tailplane tip) of the defining sections; wing and fuselage volumes match the integrated sections to 1.1 % and 0.05 %.
They are solid bodies of the outer skin, not a structure: use them for drawings, CFD, wind-tunnel models,
3-D printing, mass-property estimates or as the base for your own structural layout.

## Reproducing everything

```
python3 scripts/common.py          # inputs with sources -> data/stress_inputs.json
python3 scripts/loads.py           # lifting line, inertia, boom law -> data/loads.json
python3 scripts/fe_model.py --r 3 --tag r3     # shell mesh + CalculiX decks
ccx -i wing ; ccx -i wing_buckle_pos ; ccx -i wing_buckle_neg   (in fe/r3)
python3 scripts/post.py r3         # stresses, reactions, beam-theory check
python3 scripts/collapse.py r3     # post-buckling strength (effective width)
python3 scripts/cad_export.py      # STEP / STL
python3 scripts/solver_export.py r3 ; python3 scripts/verify_exports.py r3
python3 scripts/summary.py ; python3 scripts/charts.py r3
python3 scripts/export_wing_lab_reference.py ../../printed-wing-solver/web/metal_wing_reference.json   # numbers Wing Lab is tested against
```

The large solver outputs (`.frd`, meshes, element results, about 1 GB) are not stored; the commands above regenerate them.
