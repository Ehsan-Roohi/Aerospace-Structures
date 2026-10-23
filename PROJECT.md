# Wing Project: Design Your Wing and Build It

MIE 446 Aerospace Structures | Project guide

**You have already made the fit coupon. Now design your own semi-wing in Wing Lab, transfer it to the notebook, and manufacture it.** You do not need to write CAD code.

![Design in Wing Lab, transfer JSON to the notebook, review STL in OrcaSlicer, then print and assemble](docs/project_workflow.svg)

## 1. Design and analyse your wing

Open [Wing Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#wing). Name your project and choose the airfoil, dimensions, skin, ribs and reinforcement. Add your load, check the root support and press **Solve**. Look at the displacement and stress results; read any warnings.

In your saved Colab notebook, click **+ Text** and title the cell **Design basis**. Write a few sentences answering: Why did you choose this wing? What force did you apply, where, in which direction, and why? Give the value and unit (N for a point force; N/mm for a line load). What result are you aiming for, such as a maximum tip displacement? Does your result meet that target? Add one screenshot of the load and result. Ask the instructor if you need help choosing a reasonable load or target.

![Illustrative semi-wing with root chord, tip chord, semi-span, ribs and spanwise reinforcement](docs/wing_overview.svg)

*Illustration only. Choose your own dimensions and internal layout in Wing Lab.*

Our printer is **300 x 300 x 300 mm**. Choose 1 piece only if the actual CAD fits, or split the wing into 2 or 3 modules. Keep the final plastic mass at or below **300 g**. The loads are for computer analysis only; keep the printed wing unloaded.

Keep a **Save JSON** copy so you can reopen and edit the design. After solving the final design, use **Export to notebook** to download the transfer JSON.

## 2. Turn your design into printable files

Open the [current Code-to-Print notebook](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Code_to_Print_Wing.ipynb) and choose **File > Save a copy in Drive**.

Follow the [notebook steps PDF](docs/MIE446_Wing_Notebook_Steps.pdf). Select **Wing Lab JSON** and **Final Wing**, enter your team/revision, and upload the JSON from **Export to notebook**. The uploaded file supplies the geometry; do not rebuild the design in the notebook's manual geometry fields.

If your wing uses external rods, enter your **completed coupon test record**. Keep its revision, rod diameter, clearance and fit result; the final-wing revision must be different. Ask staff to review any changed rod or print process. A wing without external rods does not need that record. Do not start another Coupon Only run for an unchanged, already tested interface.

Run the preview, build and export cells. Save the final verified ZIP containing the STL files and design records. **JSON transfers the design; STL is the geometry you open in OrcaSlicer.**

## 3. Slice, obtain approval and print

Extract a working copy of the ZIP. In **OrcaSlicer**, import the STL for every module. Use the assigned **Creality K2 Pro, 0.4 mm nozzle and staff-approved PLA Pro profile**. Check millimetres, **100% scale**, orientation, actual dimensions, space for supports/brim, every layer, mass and print time.

Obtain staff approval before printing. Use the assigned printer procedure and supervise the first layers. Keep the team wing unloaded: it is a non-flying fabrication model, not an airworthy structure.

## 4. Keep the build evidence

Save your editable Wing Lab JSON, exported transfer JSON, completed notebook, final ZIP, slicer project and photographs of the finished parts/assembly. Label them with the same team and revision. Measure semi-span, root/tip chord and actual mass; record the fit of any rods/module joints.

**Your result: your own designed and printed semi-wing, with the files needed to reproduce it.** Use Canvas for submission instructions. This page covers the build stage only.
