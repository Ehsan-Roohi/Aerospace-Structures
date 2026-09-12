# MIE 446 Aerospace Structures

**Fall 2026 · Student syllabus**

[Course home](README.md) · [Download Word syllabus](docs/MIE_446_Aerospace_Structures_Fall_2026_Syllabus_Updated.docx) · [Lecture notebooks](notebooks/README.md) · [Project guide](PROJECT.md) · [Homework checklist](ASSIGNMENTS.md)

> Web edition of the current course syllabus, updated September 7, 2026. Canvas carries authoritative announcements, deadline changes, submissions and private access details. The dated schedule below is the syllabus schedule; confirm event logistics in Canvas.

## Contents

- [Purpose and learning outcomes](#1-purpose-scope-and-learning-outcomes)
- [People, communication and resources](#2-people-communication-and-resources)
- [Assessment and evidence of learning](#3-assessment-and-evidence-of-learning)
- [Project brief and grading](#4-project-brief--code-to-print-wing--fabrication-machine-vision-inspection-and-damage-diagnostics)
- [Project workflow and deliverables](#5-project-workflow-and-deliverables)
- [Fabrication requirements](#6-elab-fabrication-requirements)
- [Weekly schedule and homework map](#7-weekly-schedule--fall-2026)
- [Course policies](#8-course-policies)
- [AI statement](#ai-statement-learning-and-engineering-judgment-in-the-age-of-ai)
- [University support and required statements](#9-university-support-and-required-statements)

| Course information | Fall 2026 |
| --- | --- |
| Credits / mode | 3 credits • In person • 2.5 scheduled contact hours per week |
| Meetings | Tuesday & Thursday, 11:30 a.m.–12:45 p.m. |
| Classroom | Engineering Laboratory (ELAB), Room 323 |
| Instructor | Dr. Ehsan Roohi Golkhatmi • roohie@umass.edu |
| Office | Gunness Laboratory, Room 1 • appointment hours posted in Canvas; additional times by appointment |
| Prerequisite | MIE 313 — Design of Mechanical Components |
| Course site | Canvas is the authoritative source for announcements and submissions |

## Course at a glance

Aerospace structures are light because they must fly, yet they must safely carry bending, shear, torsion, landing, and maneuver loads. This course connects those loads to mechanics models and to a buildable wing. The opening bridge introduces airfoils and finite wings for students who have not taken an aerospace course; the remainder develops the structural tools needed to analyze a wing and the design-for-manufacture skills needed to code, print, inspect, and communicate a physical build.

### Signature experience

Teams of three will use instructor-provided code to generate a small parametric wing, verify its geometry, export printable components, and produce a documented physical build. After assembly, every team will complete an unloaded, non-contact inspection with the shared Jetson-camera station and analyze a supervised structural-health-monitoring demonstration performed on a separate sacrificial specimen. Teams will be evaluated through reproducible configuration and verification, calibrated manual/vision measurements, annotated images and data logs, print and assembly quality, interpretation of before/after damage evidence, uncertainty, revision history, and technical defense.

### Central question: What makes an engineering answer trustworthy?

Course commitment. AI can generate equations, code, plots, and polished explanations, but a correct-looking answer is not enough. Students will learn to frame the physical problem, trace the load path, predict behavior, select and justify a model, audit human/computational/AI results, interpret evidence, and defend a safe decision. Analytical work builds the internal physical model needed to supervise tools. Students - not tools - own the judgment, teamwork, physical evidence, and consequences.

## 1. Purpose, scope, and learning outcomes

### Course description

The course surveys classical structural mechanics in an aerospace setting. Topics include aircraft forces and airfoil/wing geometry; internal loads and load paths; stress and strain in two and three dimensions; elasticity assumptions; beam bending and deflection; energy methods and virtual work; aircraft maneuver and landing loads; V-n diagrams; structural idealization; and shear flow, torsion, and shear center in thin-walled wing structures. The course follows a physics-centered approach: computational or AI output is treated as a claim to be validated against governing physics, transparent analytical baselines, known cases, and physical evidence.

### Learning outcomes

- Trace aerodynamic, inertial, and support loads through an aerospace structure and construct defensible free-body diagrams and load paths.

- Predict signs, trends, deformation shapes, relative magnitudes, critical locations, and likely failure modes before detailed calculation.

- Select and justify analytical idealizations; state assumptions, governing relationships, boundary conditions, and limits of validity.

- Compute stress transformations, principal stresses, beam stresses and deflections, strain energy, and selected redundant reactions.

- Construct and interpret shear-force, bending-moment, torque, and V-n diagrams; analyze idealized and thin-walled wing sections.

- Use and explain instructor-provided parametric and measurement code, apply additive-manufacturing constraints, fabricate a wing, and document dimensional compliance, interface fit, machine-vision inspection, print quality, and assembly readiness.

- Audit human-, computational-, and AI-generated results using dimensions, equilibrium, boundary and limiting cases, independent estimates, sensitivity, and physical evidence; diagnose plausible errors and their consequences.

- Translate results, uncertainty, and model limitations into a defensible engineering decision and transfer the reasoning to an unfamiliar case.

- Communicate and defend reasoning clearly; collaborate with empathy and professional responsibility; seek feedback, revise, and identify what must be learned next.

### Learning sequence

| Phase | What students learn | Evidence |
| --- | --- | --- |
| Aero bridge | NACA exercise; prediction-before-calculation; checked load map | NACA coding exercise; load map |
| Mechanics core | HW 1-5 judgment records; worked/AI-solution audit; midterm | HW 1–5; midterm |
| Wing structures | HW 6; analytical baseline; validated code; design reviews | HW 6; design reviews |
| Build–inspect–learn | Parametric geometry, slicing, fabrication, calibrated manual/machine-vision inspection, and shared damage diagnostics | Configured code, wing, print log, annotated inspection image/CSV, diagnostic analysis, report, presentation |

### The engineering reasoning cycle

1. Frame: define the system, loads, constraints, boundary conditions, quantities of interest, and question  2. Predict: state signs, trends, shapes, order of magnitude, critical locations, and possible failure before calculating  3. Model: choose the idealization, governing equations, assumptions, and domain of validity

4. Solve: show a transparent analytical path and use computation or AI only when permitted  5. Audit: test units, equilibrium, boundary/limiting cases, sensitivity, and an independent estimate or physical benchmark  6. Explain and decide: interpret the result, state confidence and limitations, defend a recommendation, and transfer the reasoning

Shared evidence language: Claim - Evidence - Check - Confidence - Limitation. A correct numerical answer without a defensible model, physical interpretation, and independent verification earns limited credit.

A typical class begins with a short no-calculation prediction, develops a focused concept or derivation, asks students to critique a worked or AI-generated candidate solution, and then moves into guided analysis or design. The closing question is: What could make this result wrong?

### Human capabilities in an AI-rich world

Class time is intentionally organized around doing, explaining, questioning, building, and reflecting. The following capabilities are explicit course outcomes, not incidental benefits:

Teamwork: Three-person teams rotate roles, review work, resolve interfaces, and share accountability.

Hands-on experience: Students fabricate, inspect, and document a physical wing instead of stopping at a digital answer.

Creativity: Teams generate and compare design alternatives within real load, mass, material, and printer constraints.

Empathy: Students listen, share work fairly, account for access and safety needs, and recognize how engineering choices affect people.

Human communication: Briefs, oral checks, peer critique, guest interaction, and the final defense require clear, respectful dialogue.

Critical thinking: Students challenge assumptions, verify code and AI output, compare methods, and reconcile analytical expectations with geometry, slicer evidence, and the completed build.

Lifelong learning: Students document debugging, seek feedback, revise after failure, and identify what they need to learn next.

## 2. People, communication, and resources

| Role | Name | Email | Availability |
| --- | --- | --- | --- |
| Instructor | Dr. Ehsan Roohi Golkhatmi | roohie@umass.edu | Gunness 1; hours in Canvas |
| Undergraduate teaching assistant | Ava Towfigh | atowfigh@umass.edu | Hours in Canvas |
| Undergraduate teaching assistant | Lev Kudriavtsev | lkudriavtsev@umass.edu | Hours in Canvas |

Technical questions are best handled in class or office hours. Send grading and accommodation questions to the instructor, not to the full class. Allow two business days for email responses.

### Required and optional resources

- Canvas: announcements, due dates, starter code, submission links, printer sign-ups, and grades.

- Python 3 with the instructor starter environment (Jupyter + CadQuery). OpenSCAD may be used only with prior approval because the supported workflow is Python/CadQuery.

- OrcaSlicer with the validated Creality K2 Pro / 0.4 mm course profile supplied by the instructional team; a laptop capable of running the course environment.

- No required textbook. Selected readings and examples will be posted in Canvas. Useful references include T. H. G. Megson, Aircraft Structures for Engineering Students, and a standard mechanics-of-materials text.

- Project consumables are supplied by the course. Students should not buy structural or printer materials unless the instructor gives written approval.

### Guest learning events

| Date | Speaker | Plan |
| --- | --- | --- |
| Fri., Sept. 25 (outside class) | Dr. Avshalom Manela, Technion — Associate Professor and Vice Dean for Teaching; research in rarefied-gas dynamics, small-scale flows, heat/mass transfer, aeroacoustics, and fluid–structure interaction. | Optional research seminar; final time, title, and room will be announced in Canvas. Pizza lunch afterward. Attendance/reflection may earn the published extra credit. |
| Thu., Oct. 29 11:30–12:45 ELAB 323 | Dr. Michael Tsay, Vice President of Technology, Busek Co. Inc. | Intro to Electric Propulsion: Hall-effect thrusters and gridded ion engines; industry practice and pathways to internships/careers at Busek. This meeting replaces the regular lecture. |

Speaker background: [Dr. Manela's Technion profile](https://aerospace.technion.ac.il/person/manela-avshalom/). Dr. Tsay will also discuss industry practice and pathways to internships and careers at Busek.

#### Optional seminar extra credit

The Sept. 25 event is outside class and optional. Attendance plus a 150-word technical reflection submitted within 48 hours earns up to 1.0 course percentage point. Students unable to attend may complete the same reflection using an instructor-provided recording or another pre-approved aerospace/industry seminar; this equal-access alternative earns identical credit.

## 3. Assessment and evidence of learning

| Component | Basis | Course weight |
| --- | --- | --- |
| Homework 1–6 | 6 × 8.75% | 52.5% |
| Midterm examination | Equivalent to two homework units | 17.5% |
| Team wing fabrication, inspection, diagnostics, report, and presentation | Milestones, instructor-provided code verification, fabrication, calibrated inspection, shared damage-data analysis, report, and presentation | 30.0% |
| Total |  | 100% |

There is one in-class midterm (Tuesday, Oct. 27) and no final examination. The university final-exam period may be used only if a formally approved make-up is required.

### Homework portfolio: six substantial assignments

Each homework submission is individual and contains four connected artifacts organized around the engineering reasoning cycle:

1. Analytical solution plus an Engineering Judgment Record for one instructor-designated problem: frame the system and load path; record predictions made before calculation; justify the model, assumptions, boundary conditions, and validity; show readable derivations; and interpret the result.

2. Verification and reproducibility package for that designated problem: provide at least two independent checks selected from dimensions, equilibrium, boundary or limiting cases, order of magnitude, sensitivity, an alternate method, or physical evidence. When code is assigned, include source/notebook and a short README.

3. One-slide Claim-Evidence-Check brief (.pptx and exported .pdf): state the engineering claim, the model and most informative evidence, an independent check, confidence, and the most important limitation. The slide is a synthesis, not a screenshot collage.

4. Process and AI note: identify tools used, what each contributed, material prompts or task descriptions, student changes, errors discovered, and how high-impact claims or code were verified. 'No generative AI used' is a valid statement.

#### Judgment progression across the six homework assignments

HW 1: read the structure and predict  HW 2: choose and justify the model  HW 3: verify independently  HW 4: audit and correct a polished but flawed AI-generated solution  HW 5: analyze sensitivity and design trade-offs  HW 6: reconcile hand analysis, code/AI-assisted analysis, project evidence, calibrated vision inspection, and shared damage-diagnostic data

#### Why the one-slide brief is feasible in a class of about 65

All students make the slide for every homework, but they do not all present every time. After each deadline, a preassigned rotation of about 10-11 students completes a 90-second explanation plus one short question during a 20-25 minute workshop block. Across six homeworks, every student completes one live oral check. Questions may ask for a key assumption, a prediction under a controlled change, or what would invalidate the result. The rotation will be published by Week 3. A short narrated recording is reserved for an approved absence or accessibility alternative; six required videos per student would create unnecessary workload.

Homework rubric: engineering judgment record and transparent reasoning 40%; mechanics and numerical correctness 25%; independent verification or assigned AI audit 20%; one-slide communication 10%; reproducibility, attribution, and AI disclosure 5%. A correct final number with an unjustified model or failed independent checks earns limited credit. The oral check is a pass/revise authenticity gate.

### Midterm

The midterm is individual and closed to generative AI and unauthorized online assistance. It measures the internal understanding needed to supervise any analytical or AI tool, not algebraic speed alone. The intended balance is approximately 20% qualitative prediction/ranking/sketches; 25% framing, free-body diagrams, model choice, and assumptions; 25% concise analytical solution; 20% audit of a plausible but incorrect worked solution; and 10% interpretation, transfer, or design consequence. A formula sheet policy and sample format will be posted at least one week in advance.

### Letter grades

| Grade | % | Grade | % | Grade | % |
| --- | --- | --- | --- | --- | --- |
| A | 93–100 | B− | 80–82.9 | D+ | 67–69.9 |
| A− | 90–92.9 | C+ | 77–79.9 | D | 63–66.9 |
| B+ | 87–89.9 | C | 73–76.9 | F | <63 |
| B | 83–86.9 | C− | 70–72.9 |  |  |

UMass undergraduate grading does not use A+ or D−. Any end-of-term adjustment will be uniform and will never lower a student’s earned letter grade.

## 4. Project brief — Code-to-Print Wing — Fabrication, Machine-Vision Inspection, and Damage Diagnostics

**Design intent** — Build and verify one code-generated, non-flying wing; inspect the completed team wing without contact and without load using calibrated machine vision; and interpret a shared before/after-damage demonstration on a separate sacrificial wing-box specimen. Success requires traceable geometry, manufacturing evidence, measurement agreement and uncertainty, physically plausible diagnostic trends, and a defensible engineering decision.

### Team formation

The instructor will form teams of three using a short skills/availability survey; roles rotate among geometry/code and verification, CAD/design-for-additive-manufacturing, fabrication and build documentation, and measurement/data interpretation. All members must understand the complete workflow and answer individual technical questions. If enrollment is not divisible by three, the instructor will make the smallest necessary exception and adjust roles and workload. Team preferences are considered but not guaranteed. A confidential contribution record and peer check protect individual accountability.

### Common design envelope

| Constraint | Baseline requirement |
| --- | --- |
| Artifact | One code-generated, non-flying wing demonstrator. Each team wing remains unloaded and undamaged; no propulsion, onboard electronics, controls, fuselage, flight activity, or force-to-failure test |
| Geometry | Semi-span 450 mm; root chord 160 mm; tip chord 100 mm; instructor-approved NACA 4-digit section |
| Construction | Three or fewer printed modules; printed shell/ribs with interfaces for course-issued carbon-fiber rods |
| Material budget | Up to 300 g regular PLA Pro per final wing, plus course-issued rods and supervised 5-minute epoxy when assigned |
| Code | Instructor-provided Python/CadQuery wing-generation code plus supervised Python/OpenCV and data-acquisition workflows; teams configure inputs, run cleanly, verify outputs, explain the logic, and preserve a reproducible record |
| Engineering checks | Units; planform metrics; bounding boxes; watertight solids; printable thickness; build-envelope/mass checks; camera calibration; manual-to-vision agreement; load-cell zero/sanity check; accelerometer sampling and frequency sanity check |
| Build acceptance | Complete labeled modules; approved dimensions; dry-fit interfaces; aligned assembly; no major cracks, warping, separation, or missing features; manual and Jetson-camera evidence; complete archive |
| Inspection and diagnostics | Required unloaded Jetson-camera inspection for every team wing. Shared instructor-led demonstration uses force, camera tip-deflection, acceleration, and microscope evidence on a sacrificial specimen before and after controlled damage. |
| Evaluation | Understanding, reproducibility, traceability, print quality, fit, calibrated inspection, interpretation of diagnostic evidence, uncertainty, revision, communication, and individual defense—not a beauty contest |

### Minimum code behavior

- Accept named inputs for NACA digits, span, root/tip chord, rib spacing, shell thickness, spar positions, and material properties.

- Generate airfoil coordinates and tapered wing/rib/spar-socket geometry without hand-editing every section.

- Export valid STL/3MF components within the assigned printer envelope and report estimated mass/print time.

- Compute and report planform area, aspect ratio, taper ratio, component bounding boxes, estimated material use, and other instructor-assigned geometry checks.

- Run automated unit/sanity tests; compare at least one code case with a hand calculation or known limiting case; and independently verify any AI-assisted technical claim or code segment.

- Produce a Design, Fabrication, and Inspection Memo using Claim - Evidence - Check - Confidence - Limitation; reconcile hand geometry checks, coded output, slicer evidence, printed components, manual/machine-vision measurements, shared damage indicators, uncertainty, and revision history.

### Required post-build inspection and diagnostic activities

**Team-wing inspection (required).** Place the unloaded assembled wing in the alignment jig with ruler and ArUco/checkerboard references. Use the shared Seeed Studio reComputer Super J3011 (Jetson Orin Nano 8GB), Logitech webcam, camera stand, and instructor-provided Python/OpenCV workflow to estimate semi-span, root/tip chord, seams, and gross alignment. Compare against ruler and digital-caliper measurements and submit calibration evidence, one annotated image, a CSV/log, differences, uncertainty, and at least one identified failure mode.

**Shared structural-health-monitoring demonstration (required analysis).** Using a separate sacrificial 3D-printed wing-box specimen, the instructor/TA will acquire force with the 10 kg load cell and HX711, camera-based tip deflection, ADXL343 acceleration, and USB-microscope crack images before and after controlled damage. Teams will compute or interpret stiffness from the force-deflection slope, dominant natural frequency from the acceleration record, and qualitative crack change; then decide which indicators provide credible evidence of damage and which do not.

**Safety and specimen boundary.** No submitted team wing will be loaded, cracked, or tested to failure. Controlled damage is introduced only by the instructor on designated sacrificial specimens; loading is slow, clamped, shielded with clear polycarbonate, and performed with required eye protection. Students do not alter the fixture, damage a specimen, or enter the protected loading area without explicit authorization.

### Project grading (30% of course)

| Element | Evidence | Weight |
| --- | --- | --- |
| Milestones and design reviews | Requirements, concept, role evidence, inspection plan, calibration plan, and risk controls | 5% |
| Reproducible workflow and design rationale | Correct parameters, geometry, instructor-provided code configuration, verification checks, files, and README | 8% |
| Fabrication, inspection, and build acceptance | Safe process, print/assembly quality, manual and calibrated machine-vision evidence, annotated image/CSV, and evidence archive | 8% |
| Final technical report | Concise technical argument integrating geometry, manufacturing, inspection uncertainty, and before/after force-deflection, vibration, and crack evidence | 5% |
| Presentation and individual defense | Team story, clear visuals, diagnostic interpretation, questions, and peer evidence | 4% |

## 5. Project workflow and deliverables

| Target date | Deliverable or gate |
| --- | --- |
| Sept. 17 | Skills/availability survey and team preferences |
| Sept. 22 | Instructor posts teams; team charter and role rotation begin |
| Oct. 15 | Code checkpoint: parameterized airfoil/wing, planform metrics, unit/sanity and bounding-box checks; review of instructor-provided inspection workflow |
| Oct. 22 | Design review: geometry, interfaces, code verification, print-risk register, and draft manual/vision measurement plan |
| Nov. 12 | Print-readiness review: frozen STL/3MF, every-layer preview, mass/time budget, assembly plan, and inspection target placement |
| Nov. 19 | Team-specific fabrication and assembly slots; exact reservations are posted in Canvas |
| Nov. 20–Dec. 3 | Manual and Jetson-camera inspection, build acceptance, shared damage-diagnostics demonstration/data analysis, authorized revision or reprint, and final evidence archive |
| Dec. 3–8 | Project presentations, diagnostic evidence synthesis, and individual technical questions |
| Dec. 8, 10, 15 | Final report, configured code/archive, manufacturing files, print log, annotated inspection image/CSV, diagnostic analysis, and acceptance evidence due |

**Printer reservations** — Team-specific machine and supervision slots will be posted in Canvas after coordination with ELab and the other course using the printers. Only assigned slots are authorized; Canvas is the authoritative schedule.

### Submission package

- Instructor-provided source code/notebooks plus the team's configuration, environment file, README, and clean runs that reproduce geometry, plots, inspection output, and assigned diagnostic analysis.

- STL/3MF files, slicer project, G-code only when requested, every-layer screenshots, print log, calibration target image, manual measurements, one annotated vision image, and concise CSV/log.

- Design, Fabrication, and Inspection Memo with requirements, parameters, code checks, dimensional and slicer evidence, manual-to-vision comparison, uncertainty, limitations, build-acceptance results, diagnostic interpretation, and justified revisions.

- Completed unloaded wing, signed build-acceptance checklist, print log, first-layer and completed-part photographs, actual mass, dry-fit and alignment evidence, and revision record for any failed attempt.

- Final report and concise team presentation that connect mechanics predictions, manufacturing evidence, calibrated inspection, and shared before/after damage evidence; every member answers an individual technical question.

### Recommended team operating rhythm

| Every week | Evidence |
| --- | --- |
| Plan | One measurable team goal; owner and due date for each action |
| Integrate | Code and geometry reviewed by a teammate who did not create them |
| Verify and reflect | One independent physics/manual check; one calibration or sensor sanity check when applicable; one risk updated in the design log; brief contribution record and decision rationale |

### Failure is data; avoid preventable failure

A failed first print or an unsuccessful interface can support learning if the team documents the evidence, identifies a plausible cause, revises one controlled feature, and uses the approved schedule. Unsupervised printing, bypassing a design gate, hiding a failed print, or consuming unapproved material is a safety/process violation rather than productive iteration.

## 6. ELab fabrication requirements

### Location and access

Printer room: Engineering Laboratory (ELab), Room 104 / 104A. The numeric door code is intentionally not printed in a public syllabus. It is issued privately only after the signed agreement, orientation, and machine-specific training are complete.

### Approved equipment and material

Use the Creality K2 Pro + CFS or an Ender Pro only as assigned by ELab staff, with the exact printer and 0.4 mm nozzle profile. The baseline course material is regular 1.75 mm PLA Pro. Do not substitute Overture Air PLA, Aero PLA, or another lightweight/foaming filament: last year’s course experienced brittleness, poor bed adhesion, and failed parts. If a lightweight filament is separately approved, feed it from the external spool rather than the CFS.

### Before the slot

- Complete the agreement/orientation; work only during the assigned team slot and with required supervision.

- Bring frozen watertight STL/3MF files, the project’s print-readiness approval, and a named team operator.

- Confirm printer, nozzle, filament profile, part dimensions, orientation, supports, wall/rib thickness, spar sockets, estimated mass, and estimated time.

- Slice and inspect every layer—not only the outside preview. Save the slicer project (.3mf) before exporting G-code.

### At the printer

- Check that the bed is clean, the correct filament is dry/loaded, and the build plate is seated. Use adhesive only as trained.

- Start the job under supervision and remain for the first layers. Confirm adhesion, extrusion, walls, and supports before leaving the machine in the approved monitored state.

- Never operate alone; never bypass alarms or guards; no food or drink in the room; do not remove another team’s job or change machine settings without permission.

- Record printer, material, slicer settings, start/end times, mass, failures, and corrective actions in the print log.

### After printing and assembly

- Let parts cool, remove them as trained, clean the station, label all parts, and weigh the final printed set.

- Dry-fit rods and modules before epoxy. Sand only as authorized; use gloves, mixing tools, ventilation, and the instructor’s fixture/jig.

- Use 5-minute epoxy only when assigned and under supervision; clamp the assembly in alignment and follow the full handling and cure guidance before moving it.

- Report a failure promptly. Do not start an unscheduled reprint; the instructor/TA will approve the smallest useful revision after reviewing the print log and photographs.

### Course-provided project materials

| Course-provided item | Student responsibility |
| --- | --- |
| Regular 1.75 mm PLA Pro | Use the assigned material/profile and remain within the approved project mass budget |
| Course-issued carbon-fiber rods/interfaces | Use the dimensions posted in Canvas and verify dry fit before any adhesive |
| 5-minute epoxy and shared consumables | Use only when assigned, under supervision, and with required lab controls |
| Shared inspection and diagnostic station | Use only during assigned supervised sessions: Seeed Studio reComputer Super J3011 (Jetson Orin Nano 8GB), webcam/stand, ruler/calibration target, digital caliper, load cell/HX711, ADXL343 accelerometer, breadboard/jumpers, USB microscope, clamps, clear shield, and safety glasses |
| Personal purchases or substitutions | Not required; obtain written approval before bringing another material, chemical, or tool |

The course supplies approved PLA Pro, course-issued rods/interfaces, supervised adhesive, shared fabrication consumables, and one shared inspection/diagnostic station. The instructor provides the baseline wing-generation, machine-vision, and data-acquisition code. Students should not purchase or substitute structural materials, electronics, chemicals, or tools unless the instructor gives written approval. The complete machine workflow, inspection instructions, and acceptance checklist are provided on Canvas.

## 7. Weekly schedule — Fall 2026

Dates and topics below are the working instructional sequence. Canvas will carry the authoritative assignment files and printer sign-ups. Material may shift by one meeting to support learning, but graded due dates will not move earlier without consent.

| Week / dates | Topics and learning activities | Due / event |
| --- | --- | --- |
| 1 Sept. 8/10 | Central question: what makes an answer trustworthy? Why aircraft structures are different; four forces; airfoil geometry, angle of attack, pressure, lift/drag/moment; NACA 4-digit coding studio; prediction-before-calculation routine | Starter environment check |
| 2 Sept. 15/17 | Finite-wing geometry: span, chord, aspect ratio, taper, sweep, dihedral; lift distribution; skin–rib–spar load paths; cantilever idealization | Team survey Sept. 17 |
| 3 Sept. 22/24 | External/internal loads; equilibrium; normal/shear stress and strain; wing free-body diagrams | Teams posted Sept. 22; Fri. Sept. 25 optional Manela seminar |
| 4 Sept. 29/Oct. 1 | Stress transformation; Mohr's circle; principal stresses; aerospace failure questions; paired audit of a correct-looking worked/AI solution | HW 1 due Oct. 1 |
| 5 Oct. 6/8 | Three-dimensional stress tensor; principal values/directions; constitutive law; plane stress/plane strain | HW 2 work session |
| 6 Oct. 13/15 | Beam shear/moment, bending stress, slope/deflection; project load case and requirements | HW 2 due Oct. 13; concept memo Oct. 15 |
| 7 Oct. 20/22 | Strain energy, virtual work, Castigliano; determinate/indeterminate structures; model-validity and solution-audit review | HW 3 due Oct. 22; code checkpoint |
| 8 Oct. 27/29 | Midterm; guest class on electric propulsion, industry practice, and internship/career pathways | Midterm Oct. 27; Dr. Tsay Oct. 29 |
| 9 Nov. 3/5 | Nov. 3: no class (University schedule); aircraft maneuver/landing loads and V–n diagrams | HW 4 preparation |
| 10 Nov. 10/12 | Wing structural idealization; booms/stringers/skins; DfAM; printer orientation and coupon checks | HW 4 due Nov. 12; design review |
| 11 Nov. 17/19 | Thin-walled open/closed sections; shear flow, torsion, shear center; print-readiness studio | HW 5 due Nov. 19; print gate |
| 12 Nov. 24/26 | No regular MIE 446 meetings: Nov. 24 follows a Wednesday schedule; Thanksgiving recess | Approved print slots only if shared schedule permits |
| 13 Dec. 1/3 | Fabrication, assembly, manual and Jetson machine-vision inspection, calibration and uncertainty; shared force-deflection, vibration, and crack demonstration; hand-code/AI-build reconciliation | HW 6 due Dec. 3; inspection evidence and shared diagnostic analysis |
| 14 Dec. 8/10 | Build acceptance, diagnostic evidence synthesis, and team presentations | Presentation groups A–N |
| 15 Dec. 15 | Team presentations, individual questions, lessons from inspection/damage indicators, and course synthesis | Final project package due 5:00 p.m. |

### Homework map

| Assignment | Primary focus | Due |
| --- | --- | --- |
| HW 1 | Read the structure: airfoil/wing load path, FBD, pre-calculation predictions, equilibrium, code plot | Oct. 1 |
| HW 2 | Choose the model: 2D/3D stress transformation, principal stresses, constitutive assumptions and validity | Oct. 13 |
| HW 3 | Verify independently: wing-beam shear/moment, bending, deflection, strain energy, limiting/alternate check | Oct. 22 |
| HW 4 | Audit AI reasoning: virtual work/Castigliano plus correction of a plausible but flawed generated solution | Nov. 12 |
| HW 5 | Sensitivity and trade-offs: maneuver/landing loads, V-n diagram, computational exercise | Nov. 19 |
| HW 6 | Integrated trust case: wing-box shear/torsion/shear center; hand-code/AI validation; design/manufacturing evidence; calibrated vision inspection; and interpretation of shared damage-diagnostic data | Dec. 3 |

## 8. Course policies

### Attendance, participation, and make-up work

Regular attendance is expected because studios, oral checks, design reviews, speaker events, and safety training cannot be reconstructed fully from slides. Notify the instructor as early as practicable for illness, emergency, military duty, religious observance, disability-related needs, or another University-recognized absence. Approved absences receive a reasonable equivalent activity or make-up without penalty. Students remain responsible for announcements and for coordinating team handoffs.

### Deadlines and extensions

Each student may use two 48-hour homework extensions during the semester without giving a reason; activate the extension in writing before the deadline. The passes do not apply to the midterm, oral rotation, project safety gates, printer reservations, fabrication/assembly appointments, or the final presentation. Beyond the passes, late individual work loses 10% of the earned score per 24 hours unless an approved circumstance or accommodation applies. Contact the instructor before a project deadline whenever possible; team safety and printer capacity may require an alternate deliverable rather than a shifted machine slot.

### Religious observance

Students are entitled to reasonable accommodation for religious observances. Review the schedule early and notify the instructor so an alternative can be arranged without penalty. See the [UMass Academic Regulations](https://www.umass.edu/registrar/academic-regulations).

### Academic integrity and collaboration

Engineering depends on trustworthy evidence. Discussion of concepts and comparison of approaches are encouraged unless an assignment says otherwise, but every individual homework and midterm submission must represent the student's own reasoning. Project teammates may share team artifacts; individual contribution records and oral questions remain individual. Copying prior solutions, submitting another person's code or text, fabricating analysis, process records, or citations, or using unauthorized assistance is prohibited.

The University Academic Integrity Policy applies to all work: [UMass Academic Integrity Policy](https://www.umass.edu/senate/book/academic-integrity-policy). Suspected violations follow University procedures.

### AI Statement: Learning and Engineering Judgment in the Age of AI

Generative AI can produce equations, code, plots, and polished explanations in seconds. This changes what counts as evidence of learning, but it does not transfer the engineer's responsibility. The course is organized around a central question: When AI can produce a solution, what must an aerospace engineer still understand and be able to do? Students must frame the problem, predict behavior, choose and justify the model, test the result against mechanics and evidence, recognize uncertainty and limitations, and defend the decision.

This course uses a default-permitted, evidence-required approach unless an assignment restricts a component. AI may support learning, brainstorming, alternative approaches, debugging, communication, or adversarial review. AI output is material to inspect; it is not evidence that a claim is true. Treat it as an unverified assistant: potentially useful, never self-validating. Students remain responsible for safety, evidence, attribution, empathy, professional judgment, teamwork, and the ability to reproduce and defend the essential reasoning.

| Rule | Meaning in this course |
| --- | --- |
| Permitted with disclosure | Learning, brainstorming, examples, alternative approaches, code debugging, language revision, and adversarial critique - when the assignment does not restrict the tool |
| Required evidence | Tool and purpose; material prompt/output excerpts when requested; high-impact claims used; student verdict on technical AI output—Accept, Accept with limitations, or Reject; changes and errors found; verification by mechanics, authoritative sources, independent calculation, code tests, slicer evidence, dimensional checks, or documented fabrication evidence; known limitations |
| Not permitted | Midterm or a restricted component; undisclosed generated work; fabrication of citations/data; hiding lack of understanding; replacing a teammate's responsibility; uploading restricted course or teammate material |
| Accountability | The student owns every equation, number, sentence, citation, code line, and decision, and must be able to explain the model, reproduce essential reasoning, identify limitations, predict a controlled change, and defend the work |

AI detectors will not be used as proof of misconduct. Evidence of learning comes from transparent reasoning, prediction records, independent checks, reproducible code, process history when requested, physical fabrication evidence, revision after error, one-slide synthesis, and the student's ability to explain and defend the work. When uncertain, ask before submitting.

### Regrades

Submit a concise written regrade request within seven calendar days of the grade posting. Identify the specific rubric item and evidence; do not ask only for additional points. The complete submission may be reviewed, and the score may increase, remain unchanged, or decrease if another material grading error is found.

### Recording, privacy, and course materials

Do not record classmates, guest speakers, oral checks, fabrication sessions, or project reviews without permission. Course files may be used for enrolled students' learning but may not be publicly posted, sold, or uploaded to answer-sharing or AI-training services. Students should remove private identifiers from shared project data.

## 9. University support and required statements

### Disability accommodations

UMass Amherst is committed to equal educational access. Students who need an accommodation should connect with Disability Services and provide the course accommodation notice as early as possible. Accommodations apply to classrooms, assessments, oral alternatives, and project/lab access. [Disability Services](https://www.umass.edu/disability/).

### Required University statements and Title IX resources

University policies regarding accommodations, academic integrity, and Title IX apply to this course. In accordance with current Faculty Senate guidance, this syllabus uses the required-statement route for a non-responsible employee. Confidential and non-confidential support resources remain available whether or not a student makes a formal report.

Required statements: [UMass Faculty Senate - Non-Responsible Employee Required Syllabus Statements](https://www.umass.edu/senate/book/non-responsible-employee-required-syllabus-statements). This page contains the current Academic Integrity, Accommodation, and Title IX statements incorporated into this syllabus by reference.

### Health and wellbeing

Coursework and life demands can become difficult. Contact the instructor early when circumstances affect participation, and use campus support. Confidential mental-health services are available through the [Center for Counseling and Psychological Health](https://www.umass.edu/counseling/). In an immediate emergency, call 911 or use the University’s emergency resources.

### Inclusive learning environment

Aerospace engineering benefits from different experiences, identities, and approaches to problem solving. Everyone is expected to use classmates’ names and pronouns, critique ideas rather than people, share technical work equitably, and support a classroom and lab free of discrimination, harassment, and retaliation. Students may raise a concern privately with the instructor or through the appropriate University office.

### Safety and stop-work authority

Every student has authority to pause a print, tool use, or assembly when something appears unsafe. Stop work, keep others clear, and notify the instructor/TA/lab staff. Safety reporting will never reduce a project grade; bypassing required controls may.

### Official policy sources

- [UMass syllabus requirements](https://www.umass.edu/senate/book/course-policies/courses-policies-syllabus)

- [Academic Integrity Policy](https://www.umass.edu/senate/book/academic-integrity-policy)

- [Responsible use of generative AI](https://www.umass.edu/provost/resources/responsible-use-generative-ai)

- [Courses Extra Credit Policy](https://www.umass.edu/senate/book/courses-extra-credit-policy)

- [Registrar Academic Calendar](https://www.umass.edu/registrar/academic-calendar)
