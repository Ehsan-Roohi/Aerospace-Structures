# Wing Project: Design Your Wing and Build It

MIE 446 Aerospace Structures | Project guide

**You have already made the fit coupon. Now design your own semi-wing in Wing Lab, transfer it to the notebook, and manufacture it.** 

![Design in Wing Lab, transfer JSON to the notebook, review STL in OrcaSlicer, then print and assemble](docs/project_workflow.svg)

## 1. Design and analyse your wing
Open [Wing Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#wing). Name your project and choose the airfoil, dimensions, skin, ribs and reinforcement as described below. Add your load, check the root support and press **Solve**. Review the displacement and stress results, and note any warnings.

Assume your wing belongs to an aircraft with a total mass of 200 g in steady, level cruise. Each semi-wing carries half the total lift, so apply an upward load of approximately 1 N to your semi-wing at x/c = 0.25. Please note: do not put 1 N as a point force. Remember from the class lectures how does an actual lift looks like!

For a simple starting geometry, use NACA 2412 at the root and NACA 0012 at the tip (root eta = 0, tip eta = 1), taper ratio 0.7 (tip chord = 0.7 × root chord), zero sweep, zero dihedral and zero incidence. These are suggested starting choices; the airfoils do not automatically determine the applied lift in Wing Lab.

Compare three layouts under the same upward distributed load totalling 1 N: 
no spar, 
one full-span bonded spar at 25% chord, 
and the same spar at 40% chord, keeping all other inputs unchanged. 
Use as many ribs as you find useful.
Record mass, tip displacement, tip twist and maximum nominal stress for each, then briefly justify your choice and build only the selected design after the CAD and print checks.

In your saved Colab notebook, click **+ Text** and title the cell **Design basis**. Write a few sentences answering: Why did you choose this wing? What force did you apply, where, in which direction, and why? Give the value and unit (N for a point force; N/mm for a line load). What result are you aiming for, such as a maximum tip displacement? Does your result meet that target? Add one screenshot of the load and result. Ask the instructor if you need help choosing a reasonable load or target.

![Illustrative semi-wing with root chord, tip chord, semi-span, ribs and spanwise reinforcement](docs/wing_overview.svg)

*Illustration only. Choose your own dimensions and internal layout in Wing Lab.*

Our printer is **300 x 300 x 300 mm**. Choose 1 piece only if the actual CAD fits, or split the wing into 2 or 3 modules. Keep the final plastic mass at or below **300 g**. The loads are for computer analysis only; keep the printed wing unloaded.

Keep a **Save JSON** copy so you can reopen and edit the design. After solving the final design, use **Export to notebook** to download the transfer JSON.

## 2. Turn your design into printable files

Open the [current Code-to-Print notebook](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Code_to_Print_Wing.ipynb) and choose **File > Save a copy in Drive**.

Follow the [notebook steps PDF](docs/MIE446_Wing_Notebook_Steps.pdf). Select **Wing Lab JSON** and **Final Wing**, enter your team/revision, and upload the JSON from **Export to notebook**. The uploaded file supplies the geometry; do not rebuild the design in the notebook's manual geometry fields.

For a complete example with screenshots, open the [simple wing walkthrough PDF](docs/MIE446_Simple_Wing_Walkthrough.pdf). It follows a small one-piece wing from Wing Lab through JSON import, notebook CAD checks and STL export. Use it to learn the workflow, then apply your own design basis and load case.

If your wing uses external rods, enter your **completed coupon test record**. Keep its revision, rod diameter, clearance and fit result; the final-wing revision must be different. Ask staff to review any changed rod or print process. A wing without external rods does not need that record. Do not start another Coupon Only run for an unchanged, already tested interface.

Run the preview, build and export cells. Save the final verified ZIP containing the STL files and design records. **JSON transfers the design; STL is the geometry you open in OrcaSlicer.**

## 3. Slice, obtain approval and print

Extract a working copy of the ZIP. In **OrcaSlicer**, import the STL for every module. Use the assigned **Creality K2 Pro, 0.4 mm nozzle and staff-approved PLA Pro profile**. Check millimetres, **100% scale**, orientation, actual dimensions, space for supports/brim, every layer, mass and print time.

Obtain staff approval before printing. Use the assigned printer procedure and supervise the first layers. Keep the team wing unloaded: it is a non-flying fabrication model, not an airworthy structure.

## 4. Keep the build evidence

Save your editable Wing Lab JSON, exported transfer JSON, completed notebook, final ZIP, slicer project and photographs of the finished parts/assembly. Label them with the same team and revision. Measure semi-span, root/tip chord and actual mass; record the fit of any rods/module joints.

**Your result: your own designed and printed semi-wing, with the files needed to reproduce it.** Use Canvas for submission instructions. This page covers the build stage only.
