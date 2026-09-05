# MIE 446 Aerospace Structures

## Public Course Guide for Fall 2026

MIE 446 is a three-credit, in-person course at the University of Massachusetts Amherst. It connects classical structural mechanics to the analysis, computational definition and fabrication of a small wing demonstrator. No prior aerospace course is assumed; the opening unit introduces the aircraft and airfoil language needed for the structural work that follows.

Canvas is the authoritative source for meeting logistics, due dates, submissions, accommodations, grades, printer reservations and restricted course materials.

## Course purpose

Aerospace structures must carry bending, shear, torsion, landing and maneuver loads while remaining lightweight. Students therefore need more than a final numerical answer: they must understand the load path, defend the model, recognize failure modes and verify the evidence used for an engineering decision.

The course uses a common reasoning cycle:

1. **Frame:** define the system, loads, constraints, boundary conditions and question.
2. **Predict:** state the expected sign, trend, scale, deformation shape or critical location before calculating.
3. **Model:** choose the idealization, equations, assumptions and domain of validity.
4. **Solve:** show a transparent analytical or computational path.
5. **Audit:** check dimensions, equilibrium, limiting cases, sensitivity and an independent estimate or physical benchmark.
6. **Explain and decide:** interpret the evidence, state confidence and limitations, and defend a recommendation.

## Learning outcomes

By the end of the course, students should be able to:

- trace aerodynamic, inertial and support loads through an aerospace structure;
- construct defensible free-body diagrams and internal-load diagrams;
- predict signs, trends, deformation shapes, relative magnitudes and likely critical locations before detailed calculation;
- select analytical idealizations and state their assumptions, boundary conditions and validity limits;
- calculate stress transformations, principal stresses, beam stresses and deflections, strain energy and selected redundant reactions;
- interpret shear-force, bending-moment, torque and V–n diagrams;
- analyze idealized and thin-walled wing sections, including shear flow, torsion and shear center;
- use transparent code and additive-manufacturing constraints to produce a buildable wing geometry;
- audit human-, computational- and AI-generated results with independent checks and physical evidence;
- communicate uncertainty, limitations and engineering decisions clearly in individual and team settings.

## Course notebooks

| Notebook | Main ideas | Launch |
|---|---|---|
| Lecture 01 — From Airfoil Geometry to Trustworthy Wing Loads | Four forces, general flight-path equations, airfoil geometry, pressure and shear traction, NACA 4-digit geometry, force coefficients, stall-model limits and structural load paths | [![Open Lecture 01 in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb) |
| Lecture 02 — Finite Wings, Geometry and Load Paths | Planform metrics, sweep and dihedral, induced-drag assumptions, equal-force spanwise distributions, load paths, cantilever root reactions and a project geometry bridge | [![Open Lecture 02 in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb) |
| Code-to-Print Wing Project | Parametric wing definition, prediction, geometry checks, coupon gate, CadQuery construction, print segmentation and traceable export | [![Open Wing Project in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Code_to_Print_Wing.ipynb) |

Additional course notebooks will be added to the [notebook index](notebooks/README.md) as they are released.

## Assessment

| Component | Basis | Course weight |
|---|---|---:|
| Homework 1–6 | Six individual assignments, each worth 8.75% | 52.5% |
| Midterm examination | Equivalent to two homework units | 17.5% |
| Team wing project and presentation | Milestones, reproducible code, fabrication, build acceptance, report, presentation and individual defense | 30.0% |

Each homework submission combines an analytical solution, an Engineering Judgment Record, at least two independent checks, a one-slide Claim–Evidence–Check brief, and a concise process and AI-use note. A correct number without a defensible model, physical interpretation and verification earns limited credit.

## Weekly roadmap

| Week | Topics and learning activities | Major public milestone or event |
|---:|---|---|
| 1 | Trustworthy engineering answers; aircraft forces; airfoil geometry; pressure, lift, drag and moment; NACA 4-digit studio | Starter environment check |
| 2 | Finite-wing geometry; span, chord, aspect ratio, taper, sweep and dihedral; lift distribution; skin–rib–spar load paths | Team survey |
| 3 | External and internal loads; equilibrium; normal and shear stress and strain; wing free-body diagrams | Teams formed; optional Dr. Avshalom Manela seminar |
| 4 | Stress transformation; Mohr's circle; principal stresses; aerospace failure questions; audit of a polished worked or AI-generated solution | Homework 1 |
| 5 | Three-dimensional stress tensor; principal values and directions; constitutive law; plane stress and plane strain | Homework 2 studio |
| 6 | Beam shear and moment; bending stress; slope and deflection; project load case and requirements | Concept memo |
| 7 | Strain energy; virtual work; Castigliano's theorem; determinate and indeterminate structures; model-validity review | Code checkpoint |
| 8 | Individual midterm; electric-propulsion guest class with Dr. Michael Tsay of Busek | Midterm and guest class |
| 9 | Aircraft maneuver and landing loads; V–n diagrams | Homework 4 preparation |
| 10 | Wing structural idealization; booms, stringers and skins; design for additive manufacturing; printer and coupon checks | Design review |
| 11 | Thin-walled open and closed sections; shear flow; torsion; shear center | Print-readiness gate |
| 12 | University schedule and Thanksgiving recess | Approved print slots only if scheduled |
| 13 | Fabrication, assembly, dimensional and fit inspection, uncertainty, failure analysis and hand–code–AI–build reconciliation | Homework 6 and build evidence |
| 14 | Build acceptance, project synthesis and team presentations | Presentation groups |
| 15 | Team presentations, individual questions and course synthesis | Final project package |

## Signature project

Teams of three use the guided notebook to define and understand a parametric semi-wing, print and test a rod-fit coupon, generate validated printable modules, inspect the physical build and defend the resulting engineering decisions.

The artifact is a **non-flying fabrication demonstrator**. It excludes propulsion, electronics, controls, a fuselage, force testing and flight. Evaluation emphasizes understanding, reproducibility, traceability, print quality, dimensional and interface evidence, documented revision, communication and individual defense.

The baseline design uses a NACA 4-digit section, a 450 mm semi-span, 160 mm root chord, 100 mm tip chord, printed skin and ribs, two course-issued carbon rods and no more than 300 g of approved PLA Pro.

## AI use and accountability

Generative AI may be used for learning, brainstorming, examples, alternative approaches, code generation, debugging, documentation and adversarial critique when the activity permits it. Material use must be disclosed and independently verified.

Students remain responsible for every equation, number, sentence, citation, code line and decision they submit. They must be able to explain the model, reproduce essential reasoning, predict a controlled change and identify limitations. Generative AI is not permitted during the individual midterm or an explicitly restricted individual assessment.

The course uses the evidence language:

> **Claim — Evidence — Check — Confidence — Limitation**

## Repository boundary

This public repository contains released notebooks, reusable code, tests and public supporting documentation. Canvas contains graded submissions, solution material, student information, accommodations, restricted lab access details and the authoritative course calendar.
