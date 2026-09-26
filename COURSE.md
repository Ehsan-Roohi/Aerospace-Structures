# MIE 446 Aerospace Structures

## Public Course Guide for Fall 2026

[Course home](README.md) · **[Full student syllabus](SYLLABUS.md)** · [Homework checklist](ASSIGNMENTS.md) · [Project guide](PROJECT.md)

This page is an overview. The full web syllabus includes dated schedules, teaching contacts, grading rubrics and course policies.

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
| Code-to-Print Wing Project | Parametric wing definition, prediction, geometry checks, coupon gate, CadQuery construction, print segmentation and traceable export | [![Open stable Wing Project v1.1.1 in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/v1.1.1/notebooks/MIE446_Code_to_Print_Wing.ipynb) |

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
| 1 | Trustworthy engineering answers; aircraft forces; airfoil geometry; pressure, lift, drag and moment; NACA four-digit studio | Starter environment check |
| 2 | Finite-wing geometry and skin-rib-spar load paths; already assigned teams prepare for project launch | Teams active |
| 3 | External and internal loads; equilibrium; normal and shear stress and strain; wing FBDs | Optional Dr. Avshalom Manela seminar |
| 4 | Finish Lecture 1 wing anatomy, devices and load paths; hand-calculate semi-wing geometry, taper, area and aspect ratio | HW 1 due Oct. 1; project calculation sheet |
| 5 | NACA section, rods, modules, fit coupon and print constraints; cantilever FBD, virtual-load shear/root moment and print-release review | Coupon R01 and pre-print gate Oct. 8–9 |
| 6 | Supervised wing-module fabrication starts Oct. 13; beam shear/moment, bending stress, slope and deflection | First-print evidence |
| 7 | 2D/3D stress transformation, Mohr's circle, principal stresses and constitutive assumptions | As-built checkpoint Oct. 22 |
| 8 | Individual midterm; electric-propulsion guest class with Dr. Michael Tsay of Busek | Midterm Oct. 27 and guest class |
| 9 | Nov. 3 no class; strain energy and virtual work on Nov. 5 | HW 2 due Nov. 5 |
| 10 | Castigliano, maneuver/landing loads and V–n diagrams; wing idealization and assembly review | HW 3 due Nov. 12 |
| 11 | Thin-walled wing-box shear flow, torsion and shear center; compare model with printed geometry | HW 4 due Nov. 19; Nov. 16 lab slot |
| 12 | University schedule and Thanksgiving recess | Approved inspection/correction slots only |
| 13 | Manual and Jetson machine-vision inspection; shared force-deflection, vibration and crack demonstration | HW 5 due Dec. 3 |
| 14 | Build acceptance, diagnostic synthesis and team presentations | HW 6 due Dec. 10 |
| 15 | Team presentations, individual questions, lessons from damage indicators and course synthesis | Final project package Dec. 15 |

## Signature project

Teams of three use instructor-provided workflows to define and understand a parametric semi-wing, print and test a rod-fit coupon, generate validated printable modules, inspect the unloaded physical build with manual and Jetson-camera measurements, analyze shared before/after damage data, and defend the resulting engineering decisions.

The team artifact is a **non-flying fabrication demonstrator**. Student-built wings remain unloaded and undamaged: they exclude propulsion, onboard electronics, controls, a fuselage, force-to-failure testing and flight. Controlled damage is introduced only by the instructor/TA on a separate sacrificial specimen. Evaluation emphasizes understanding, reproducibility, traceability, print quality, calibrated inspection, interpretation of stiffness/frequency/crack evidence, uncertainty, communication and individual defense.

The baseline design uses a NACA 4-digit section, a 450 mm semi-span, 160 mm root chord, 100 mm tip chord, printed skin and ribs, two course-issued carbon rods and no more than 300 g of approved PLA Pro.

## AI use and accountability

Generative AI may be used for learning, brainstorming, examples, alternative approaches, code generation, debugging, documentation and adversarial critique when the activity permits it. Material use must be disclosed and independently verified.

Students remain responsible for every equation, number, sentence, citation, code line and decision they submit. They must be able to explain the model, reproduce essential reasoning, predict a controlled change and identify limitations. Generative AI is not permitted during the individual midterm or an explicitly restricted individual assessment.

The course uses the evidence language:

> **Claim — Evidence — Check — Confidence — Limitation**

## Repository boundary

This public repository contains released notebooks, reusable code, tests and public supporting documentation. Canvas contains graded submissions, solution material, student information, accommodations, restricted lab access details and the authoritative course calendar.
