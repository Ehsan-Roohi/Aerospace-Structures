# MIE 446 · Aerospace Structures

**University of Massachusetts Amherst · Fall 2026**<br>
Tuesday & Thursday · 11:30 a.m.–12:45 p.m. · ELAB 323<br>
Dr. Ehsan Roohi Golkhatmi · Gunness Laboratory, Room 1 · [roohie@umass.edu](mailto:roohie@umass.edu)

## Open for class

**[Syllabus](SYLLABUS.md)** · **[Download Word syllabus](docs/MIE_446_Aerospace_Structures_Fall_2026_Syllabus_Updated.docx)** · **[Weekly schedule](SYLLABUS.md#7-weekly-schedule--fall-2026)** · **[Lecture notebooks](#lecture-notebooks)** · **[Stipa-Caproni: the Venturi-fuselage aircraft](STIPA_CAPRONI.md)** · **[Gimli Glider case study](GIMLI_GLIDER.md)** · **[Navier–Stokes and AI reading](NAVIER_STOKES_AI.md)** · **[Wing project](PROJECT.md)** · **[Register a three-person team](https://forms.gle/L5BMny8WEP4zpokFA)** · **[Homework 1 PDF](assignments/homework-01/MIE446_HW1_Surface_Pressure.pdf)** · **[Homework 1 Excel data](assignments/homework-01/MIE446_HW1_NACA2412_Data.xlsx)** · **[All homework](ASSIGNMENTS.md)** · **[General OrcaSlicer + USB guide](PRINTING.md)**

This is the classroom home for released MIE 446 learning materials. Open a lecture below, save your own copy in Google Drive, and work through the predictions, theory and experiments. No prior aerospace course is assumed.

> **What makes an engineering answer trustworthy?**<br>
> Learn to frame the problem, predict behavior, justify the model, check the evidence and defend the decision—even when AI supplies the calculation or code.

## Lecture notebooks

| Lecture | What we study | Open and run |
|---|---|---|
| **01 · Aircraft forces and airfoils** | Flight-path equilibrium, flight controls, CG, trim and static margin; airfoil geometry, NACA sections, aerodynamic coefficients, stall and load paths · Multi-session lecture | [![Open Lecture 01 in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/54f4c1df1c6f04d5f2e723b686eececbaf5a4875/notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb) |
| **02 · Finite wings and load paths** | Span, chord, taper, aspect ratio, sweep, dihedral, induced drag, distributed loads and root reactions · 75 min | [![Open Lecture 02 in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb) |
| **Numerical wing structural design** | Two teaching sessions + design studio: theory, schematics, signed load cases, bending/shear/torsion, cap buckling, whole-span fit, independent beam FEM, Pareto search, uncertainty and downloadable CAD/report data. No lab or Excel required. | [![Open Numerical Wing Design in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Wing_Structural_Design_Numerical.ipynb) |

Lectures 01 and 02 are released. Later lecture notebooks will appear here when ready; the [syllabus schedule](SYLLABUS.md#7-weekly-schedule--fall-2026) describes the full semester, not a list of already-published notebooks.

### Engineering case studies

**[Stipa-Caproni: when the fuselage becomes a duct](STIPA_CAPRONI.md)** connects the unusual ducted-propeller aircraft to pressure forces, lift, thrust, wooden shell construction, wire-braced wing load paths and structural tradeoffs. Includes original schematics, a historical construction-photo link, archival video and NACA sources, a worked numerical example and an AI-audit discussion.

**[How did OpenAI solve Navier–Stokes in 88 hours? — full Zoomit translation](NAVIER_STOKES_AI.md)** presents the complete English translation of the supplied Zoomit article, credited to Pooyesh Pourmohammad, with all 11 article illustrations and English captions. A separate technical supplement derives the energy scaling, clarifies the Euler result, updates the data-use discussion and links the original video player, English lectures, proof and Lean repository.

**[The Gimli Glider: an aerospace-structures case study](GIMLI_GLIDER.md)** follows Air Canada Flight 143 from a failed fuel-quantity defense to a 17-minute unpowered glide and emergency landing. It connects unit discipline, system redundancy, landing loads, changing load paths, local damage, crashworthiness and occupant survival. The reading includes licensed historical photographs, original engineering diagrams, discussion questions, the official investigation report and video links.

### Your classroom workflow

1. Click **Open in Colab** and choose **File → Save a copy in Drive**.
2. Run the setup cell, then proceed from top to bottom.
3. Record a prediction **before** revealing the result. Change the marked inputs and rerun the affected cells.
4. Explain the result using **Claim — Evidence — Check — Confidence — Limitation**.
5. Keep your own notebook; submit only through the assigned Canvas link.

[Notebook index and troubleshooting](notebooks/README.md)

## Design and build a wing

### Team registration

Form a team of exactly three students. After all members agree, one team contact should submit the form once for the entire group:

**[Register your three-person team](https://forms.gle/L5BMny8WEP4zpokFA)**

<img src="docs/baseline_preview.png" alt="Code-generated baseline semi-wing with printed shell, ribs and rod interfaces" width="640">

![MIE 446 workflow from parametric wing design and fabrication to unloaded Jetson inspection and shared damage diagnostics](docs/project_workflow.svg)

Teams of three use instructor-provided code to define a parametric semi-wing, verify its geometry, print a rod-fit coupon, build approved modules and document the assembled result. Students may use AI for code assistance, but must understand and independently verify the work.

Every team then performs an **unloaded, non-contact dimensional inspection** with a shared **Seeed Studio reComputer Super J3011 (NVIDIA Jetson Orin Nano 8GB)** and USB camera station. In a separate instructor-led activity, teams analyze force–deflection, vibration and crack evidence collected before and after controlled damage to a sacrificial wing-box specimen.

**Student-built wings are not loaded, cracked, flown or tested to failure.** Assessment focuses on reproducibility, geometry, calibrated inspection, diagnostic reasoning, uncertainty, fabrication evidence, revision and individual understanding.

[![Open stable Wing Project v1.1.1 in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/v1.1.1/notebooks/MIE446_Code_to_Print_Wing.ipynb)

**[Project guide and code documentation](PROJECT.md)** · [Project rubric](SYLLABUS.md#4-project-brief--code-to-print-wing--fabrication-machine-vision-inspection-and-damage-diagnostics) · **[General OrcaSlicer + USB guide](PRINTING.md)** ([Word](docs/OrcaSlicer_Offline_USB_3D_Printing_Guide.docx) · [PDF](docs/OrcaSlicer_Offline_USB_3D_Printing_Guide.pdf)) · [AI-use log template](AI_USE_LOG_TEMPLATE.md)

### Download the printing examples

Use these files to practice the STL-to-G-code workflow and to inspect a successful reference output:

- **[Download the sample STL](https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/printing/examples/reference-glider-model.stl)**
- **[Download the matching reference G-code](https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/printing/examples/reference-k2pro-orcaslicer.gcode)**

The G-code is provided for inspection only. Do not send it directly to a printer; import the STL into OrcaSlicer and generate new G-code using the validated profile for the exact printer, nozzle and material.

## Assessment and course support

| Component | Course weight | Details |
|---|---:|---|
| Six individual homeworks | 52.5% total; 8.75% each | [Checklist, dates and oral-check format](ASSIGNMENTS.md) |
| One individual midterm | 17.5% | October 27; [exam policy](SYLLABUS.md#midterm) |
| Team wing project and presentation | 30% | [Milestones, evidence and individual defense](SYLLABUS.md#5-project-workflow-and-deliverables) |

There is no final examination. See the [full syllabus](SYLLABUS.md) for grading, extensions, accommodations, academic integrity and University statements.

AI use is **permitted with disclosure and verification**, except during the midterm or another explicitly restricted component. The course develops teamwork, hands-on experience, creativity, empathy, human communication, critical thinking and lifelong learning. [Read the complete AI statement](SYLLABUS.md#ai-statement-learning-and-engineering-judgment-in-the-age-of-ai).

[Teaching team and contacts](SYLLABUS.md#2-people-communication-and-resources) · [Guest events](SYLLABUS.md#guest-learning-events) · [Course overview](COURSE.md)

## What stays in Canvas

Use GitHub for classroom navigation, the web syllabus, released notebooks, project code and public checklists. Use Canvas for announcements, authoritative deadline changes, assignment question sheets until released here, submissions, grades, office-hour updates, oral-check rotations, printer reservations and private access information. No student submissions, answer keys or room access codes are published here.

## Code and maintenance

[Source package](src/mie446_wing) · [Tests](tests) · [Project troubleshooting](PROJECT.md#11-troubleshooting-the-guided-notebook) · [Final ZIP contents](PROJECT.md#step-6-export-and-download-the-submission)

[![Repository tests](https://github.com/Ehsan-Roohi/Aerospace-Structures/actions/workflows/tests.yml/badge.svg)](https://github.com/Ehsan-Roohi/Aerospace-Structures/actions/workflows/tests.yml)
