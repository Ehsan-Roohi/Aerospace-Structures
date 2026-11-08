# MIE 446 · Aerospace Structures

**University of Massachusetts Amherst · Fall 2026**<br>
Dr. Ehsan Roohi Golkhatmi · [roohie@umass.edu](mailto:roohie@umass.edu)

[Syllabus](SYLLABUS.md) · [Lecture notebooks](notebooks/README.md) · [All assignments](ASSIGNMENTS.md) · [Course overview](COURSE.md)

## Assignments and released solutions

| Assignment | Instructions and files | Released solutions |
|---|---|---|
| **New · Wright Flyer Half-Wing Truss project** | [Project guide](assignments/numerical-project/README.md) · [PDF](assignments/numerical-project/MIE446_Numerical_Project_Wright_Flyer_Truss.pdf) | — |
| **HW 3 · Three beams under distributed loads** | [Instructions](assignments/homework-03/README.md) · [PDF](assignments/homework-03/MIE446_HW3_Three_Beams.pdf) · [Notebook](notebooks/MIE446_HW3_Three_Beams.ipynb) | [PDF / Word](assignments/homework-03/solutions/README.md) |
| **HW 2A · Evidence and moment geometry** | [Instructions](assignments/homework-02/README.md) · [PDF](assignments/homework-02/HW2A/MIE446_HW2A_Evidence_and_Moment_Geometry.pdf) | [PDF / Word](assignments/homework-02/HW2A/solutions/README.md) |
| **HW 1 · Surface pressure and airfoil loads** | [PDF](assignments/homework-01/MIE446_HW1_Surface_Pressure.pdf) · [Excel data](assignments/homework-01/MIE446_HW1_NACA2412_Data.xlsx) | [Word / Excel](assignments/homework-01/README.md#released-solutions) |

**Use Canvas for current deadlines, submissions and announcements.** Upcoming homework is listed in [the assignment schedule](ASSIGNMENTS.md#six-homework-portfolios).

## Software · current release

- **[Open Wing Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/#wing)** — beam, truss, wing aerodynamics and structural analysis; editable JSON and STL export.
- [Wright Flyer / Truss Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/truss-lab.html) · [Full-scale D.520 wing](https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/#d520).
- [900 mm wing examples and run guide](https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/validation/900mm-layout-report.html).
- [ML airfoil screening](https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/ml-airfoil/) — research comparison; published model domain requires Re > 1 million.

## Lectures

| Lecture | Topic |
|---|---|
| [01](notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb) | Aircraft forces, airfoils and controls |
| [02](notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb) | Finite wings and load paths |
| [03](notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb) | Beam reactions, stress and deflection |
| [04](notebooks/MIE446_Lecture_04_Mohr_Circle_Virtual_Work_and_Unit_Load.ipynb) | Mohr's circle, virtual work and unit loads |

[All notebooks and Colab links](notebooks/README.md) · [Wing structure, buckling, materials and flutter](notebooks/MIE446_Wing_Structure_Buckling_Materials_and_Flutter.ipynb) · [Numerical wing design](notebooks/MIE446_Wing_Structural_Design_Numerical.ipynb)

<a id="design-and-build-a-wing"></a>
<a id="wing-project--start-here-lesson-coupon-then-final-wing"></a>

## Wing design and fabrication

[Project guide](PROJECT.md) · [Printing and slicer guide](PRINTING.md) · [SolidWorks cross-check](SOLIDWORKS_SIMULATION_GUIDE.md) · [AI-use log](AI_USE_LOG_TEMPLATE.md)

Design and compare in Wing Lab → save JSON and export STL → inspect every slicer layer → obtain staff approval before supervised printing. Student-built wings are for unloaded inspection, not flight or failure testing.

## Further reading and support

[Engineering readings and case studies](READINGS.md) · **[Jersey barriers and aerospace crashworthiness](JERSEY_BARRIER.md)** · **[New: Turkey Vulture soaring, thermals and migration](TURKEY_VULTURE_SOARING.md)** · [Teaching team](SYLLABUS.md#2-people-communication-and-resources) · [AI-use policy](SYLLABUS.md#ai-statement-learning-and-engineering-judgment-in-the-age-of-ai) · [Source code](src/mie446_wing) · [Tests](tests)
