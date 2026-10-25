# Wing Project: Design Your Wing and Build It

MIE 446 Aerospace Structures | Project guide

**Design and analyze your semi-wing in Wing Lab, download STL directly, then slice and manufacture it. No notebook is required.**

![Design and solve in Wing Lab, download STL directly, review it in OrcaSlicer, then print and assemble](docs/project_workflow.svg)

## 1. Design and analyze your wing
Open [Wing Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#wing). Name your project and choose the airfoil, dimensions, skin, ribs, and reinforcement as described below. Add your load, check the root support, and press **Solve**. Review the displacement and stress results, and note any warnings.

Apply an upward distributed lift of **5 N total** at **x/c = 0.25** and enable **Include wing self-weight**. With the aircraft-mass option, use **1 kg** and **n = 1**, giving **4.905 N per semi-wing** (approximately 5 N in steady, level cruise); use the same load for all three comparisons and record the software's semi-wing mass and downward weight.

For a simple starting geometry, use NACA 2412 at the root and NACA 0012 at the tip (root eta = 0, tip eta = 1), taper ratio 0.7 (tip chord = 0.7 × root chord), zero sweep, zero dihedral, and zero incidence. Wing span can vary between 350 and 600 mm, and skin thickness should be any value between 1 and 2 mm. These are suggested starting choices; Wing Lab does not automatically determine the lift applied by the airfoils.

Compare three layouts under the same upward distributed load (5 N, or 4.905 N from the aircraft-mass option), keeping all other inputs unchanged:

- No spar.
- One full-span bonded spar at 25% chord.
- The same spar at 40% chord.

Use as many ribs as you find useful.
The spar material should match the other parts of the wing.
Record mass, tip displacement, tip twist, and maximum nominal stress for each, then briefly justify your choice and build only the selected design after the CAD and print checks.

In your report, include a short **Design basis**: why you chose this wing, the load magnitude/direction/distribution and chord position, your displacement target, and whether the result meets it. Include a screenshot of the load and result. Give force in N and line-load intensity in N/mm.

![Illustrative semi-wing with root chord, tip chord, semi-span, ribs and spanwise reinforcement](docs/wing_overview.svg)

*Illustration only. Choose your own dimensions and internal layout in Wing Lab.*

Our printer is **300 x 300 x 300 mm**. Choose 1 piece only if the actual CAD fits, or split the wing into 2 or 3 modules. Keep the final plastic mass at or below **300 g**. The loads are for computer analysis only; keep the printed wing unloaded.

Keep a **Save JSON** copy so you can reopen and edit the design. Include your team and revision in the project name. Solve the final design before creating STL.

## 2. Download printable files directly

In Wing Lab, click **Download STL**. The app builds the **undeformed** skin, ribs, integral spars and any rod sleeves/holes, then checks the mesh, printed-plastic mass and printer envelope.

- **1 printed module:** download one `.stl` file.
- **2 or 3 printed modules:** download a ZIP containing the module STLs and `print_record.json`; extract it before slicing.
- Click **Save print record** to retain the build checks and source design with your files. If a check fails, correct the stated dimensions, thickness or interface; no automatic scaling is applied.

For external rods, enter the reference of your **completed physical fit-coupon test** and confirm that the rod diameter, clearance and print process match. Keep the coupon record and photographs. A wing without external rods does not need this record.

**JSON is your editable design; STL is the printable geometry.** The notebook is an optional alternative, not a required project step.

## 3. Slice, obtain approval and print

If you downloaded a ZIP, extract a working copy. In **OrcaSlicer**, import the STL for every module. Use the assigned **Creality K2 Pro, 0.4 mm nozzle and staff-approved PLA Pro profile**. Check millimetres, **100% scale**, orientation, actual dimensions, space for supports/brim, every layer, mass and print time.

Obtain staff approval before printing. Use the assigned printer procedure and supervise the first layers. Keep the team wing unloaded: it is a non-flying fabrication model, not an airworthy structure.

## 4. Keep the build evidence

Save your editable Wing Lab JSON, STL file(s), print record, short design/comparison report, slicer project and photographs of the finished parts/assembly. Label them with the same team and revision. Measure semi-span, root/tip chord and actual mass; record the fit of any rods/module joints.

**Your result: your own designed and printed semi-wing, with the files needed to reproduce it.** Use Canvas for submission instructions. This page covers the build stage only.
