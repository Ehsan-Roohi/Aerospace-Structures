# Homework 2: Flight-Control Forces, Moments, and Structural Load Paths

MIE 446 Aerospace Structures, Fall 2026. Released October 1, 2026. Due: see Canvas.

Start with the illustrated [student guide (PDF)](MIE446_HW2_Control_Forces_Moments.pdf).
It gives the required reading, numbered steps, MATLAB commands, exact Excel cell
references, independent checks, and submission requirements for every question.

## Download the student files

- [Complete student package (ZIP)](MIE446_HW2_Student_Pack.zip)
- [Student guide (PDF)](MIE446_HW2_Control_Forces_Moments.pdf)
- [Excel starter workbook](MIE446_HW2_Excel_Starter.xlsx)
- [MATLAB starter script](MIE446_HW2_Starter.m)
- [Guide source (HTML)](MIE446_HW2_Control_Forces_Moments.html)

Download and extract the ZIP before opening its files. In MATLAB, make the
extracted folder your Current Folder and open `MIE446_HW2_Starter.m`. In Excel,
save a working copy of the starter. The unfinished calculation cells and MATLAB
TODOs are intentional. Follow the guide to complete them; a blank answer is not
a zero result.

## Read alongside Lecture 1

Open [Lecture 1 in Google Colab](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb).
Use the section numbers and titles below to find each explanation.

| Question | Points | Lecture 1 reference | What you produce |
|---|---:|---|---|
| 1. Read the historical evidence | 15 | 7A-3, 7A-3a and 7A-3b | Annotated hardware sketch; approximate graph readings; interpretation |
| 2. Integrate force and moment increments | 35 | 7A-3b and the coefficient/force-scaling lesson | MATLAB integration, Excel panel sums, plots, convergence and speed checks |
| 3. Move a lateral force | 20 | 7A-3b | Hand cross products, MATLAB and Excel checks, signed moment interpretation |
| 4. Mix elevon commands | 20 | 7A-11 and its elevon-mixer code cell | Requested/limited commands, forces, moments and saturation explanation |
| 5. Trace local structural loads | 10 | 7A-1 and 7A-5 | Two load-path drawings and control-string force calculations |

The required paper is Raffel et al., [Flight Controls of Otto Lilienthal's
Experimental Monoplane from 1895](https://elib.dlr.de/191143/1/JoA_Paper_Lilienthal_Flight_Controls.pdf),
especially the device descriptions and Section II.C, Figures 11 and 12. Read the
plotted markers; the dashed fitted lines are not additional measurements.

The computational wing and elevon models are specified instructional models.
They are not measurements from the paper or performance claims for the printed
course wing. The numerical wing matches the course baseline dimensions so that
students can connect geometry, forces, moments and structural interfaces.

Discuss and cross-check within the existing three-person teams. Each student
submits independently authored work through Canvas under the course's individual
homework policy. The PDF handout is the authoritative task and submission list.

The paper retains its aerodynamic-axis coefficient convention. Questions 2-4
use the declared body axes and moments about the CG. Question 5 uses a local
mechanism pivot. Whole-aircraft control moments and local hinge moments are
different quantities.

## Visual credits

`assets/HW2_Wing_Model` and `assets/HW2_Control_Lever` are original teaching
schematics supplied as PNG and editable SVG. They show the given model and
mechanism geometry. The course Lecture 1 figures retain the source information
in [the lecture visual register](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/docs/assets/lecture01/VISUAL_SOURCES.md).

## Help with MATLAB syntax

Official MathWorks references: [linspace](https://www.mathworks.com/help/matlab/ref/double.linspace.html),
[trapz](https://www.mathworks.com/help/matlab/ref/trapz.html),
[cross](https://www.mathworks.com/help/matlab/ref/cross.html), and
[exportgraphics](https://www.mathworks.com/help/matlab/ref/exportgraphics.html).
The guide explains the specific commands needed; no specialist toolbox is required.
