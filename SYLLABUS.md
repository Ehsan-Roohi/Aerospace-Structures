# MIE 446 Aerospace Structures

University of Massachusetts Amherst | Fall 2026 | Updated October 23, 2026

## Course information

| Item | Details |
| --- | --- |
| Credits and format | 3 credits, in person |
| Class | Tuesday and Thursday, 11:30 a.m. to 12:45 p.m., ELAB 323 |
| Instructor | Dr. Ehsan Roohi Golkhatmi, roohie@umass.edu |
| Office | Gunness Laboratory, Room 1; if unavailable there, check Room 5 |
| Office hours | Friday, 10:00 a.m. to noon; other times by appointment |
| Teaching assistants | Ava Towfigh (atowfigh@umass.edu) and Lev Kudriavtsev (lkudriavtsev@umass.edu); hours in Canvas |
| Prerequisite | MIE 313, Design of Mechanical Components |

[Canvas Modules](https://umamherst.instructure.com/courses/37837/modules)

## What you will learn

This course connects aircraft loads to structural mechanics and the design of a small printed wing. By the end of the course, you should be able to:

- Draw free-body diagrams and trace loads through skins, ribs, spars and supports.
- Calculate reactions, internal forces, stress, strain and beam deflection.
- Use stress transformation, virtual work and energy methods to solve structural problems.
- Explain maneuver loads and the behavior of thin-walled wing sections in bending, shear and torsion.
- Compare hand calculations with software, checking units, equilibrium, boundary conditions and model limits.
- Design and manufacture a wing, document the results, and explain your own contribution.

## Materials and software

No textbook purchase is required. Readings and worked examples are linked in Canvas. Megson's *Aircraft Structures for Engineering Students* and a mechanics-of-materials text are useful references.

| Resource | Use |
| --- | --- |
| [Lecture notebooks](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/README.md) | Read explanations, follow examples and run the assigned cells in Google Colab |
| [Beam Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#beam) | Compare support reactions, stress and deflection with hand solutions |
| [Truss Lab](https://ehsan-roohi.github.io/Aerospace-Structures/truss-lab.html) | Study nodes, members, supports and forces |
| [Wing Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#wing) | Design and analyse your project wing; save and export JSON |
| [Code-to-Print notebook](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/v1.3.1/notebooks/MIE446_Code_to_Print_Wing.ipynb) | Import Wing Lab JSON and generate CAD/STL files |
| OrcaSlicer | Review the STL and prepare the print with the staff-approved printer profile |

Save your own Colab copy in Drive. Course consumables are supplied; obtain approval before buying or substituting materials.

## Assessment

| Component | Course weight |
| --- | --- |
| Homework 1-6 | 6 x 8.75% = 52.5% |
| Numerical project, equivalent to two homework units | 17.5% |
| Team wing project | 30% |
| Total | 100% |

There is no midterm or final examination. The homework and numerical project together account for 70% of the course grade.

Follow the submission requirements in each released assignment. Show readable calculations, units, assumptions and checks. Include the short slide and AI/process note when the assignment requests them. **HW 3 requires one PDF containing the three analytical beam solutions and software comparisons; no additional slide or supporting files are required.** Collaboration and individual/team submission rules are stated in each assignment.

The course includes six homework sets. Instructions and deadlines for each set are posted in Canvas.

### Wing project

Design, analyse and manufacture a semi-wing using Wing Lab and the Code-to-Print notebook.

1. Choose your airfoil, dimensions, ribs and reinforcement. State why you chose the design, the applied force with units, location and direction, and your target result. Include the analysis and a screenshot in a short **Design basis** text cell in your saved notebook.
2. If using external rods, generate and print a fit coupon. Test the actual rod, measure its diameter, select the clearance and record the fit before generating the final wing.
3. Save an editable JSON and use **Export to notebook** for the transfer file. Import it into Code-to-Print and check the generated geometry and STL package.
4. Review every layer in OrcaSlicer, obtain staff approval, then print and assemble. Our printer envelope is **300 x 300 x 300 mm**. Use one piece only if the actual CAD fits; otherwise use two or three modules. Final plastic mass must be at or below **300 g**.
5. Submit one team ZIP with the transfer JSON, completed notebook, original final notebook ZIP, OrcaSlicer project, photographs, dimensions, mass and applicable fit record. Each student separately completes the teammate evaluation form.

| Project component | Points out of 100 |
| --- | --- |
| Design and analysis | 40 |
| Manufacturing and completed wing | 50 |
| Individual teammate evaluation | 10 |

The design-and-build submission is due **Monday, November 2, 2026, at 11:59 p.m.** See the [Canvas project assignment](https://umamherst.instructure.com/courses/37837/assignments/898213) for the submission and individual evaluation links. The [project guide](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/PROJECT.md) and [illustrated walkthrough](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/docs/MIE446_Simple_Wing_Walkthrough.pdf) explain the workflow. Additional activities and their deliverables will be assigned in Canvas.

Keep the printed wing unloaded; forces are for computer analysis. Retest the coupon if the rod or printing process changes.

### Letter grades

| Grade | Percent | Grade | Percent | Grade | Percent |
| --- | --- | --- | --- | --- | --- |
| A | 93-100 | B- | 80-82.9 | D+ | 67-69.9 |
| A- | 90-92.9 | C+ | 77-79.9 | D | 63-66.9 |
| B+ | 87-89.9 | C | 73-76.9 | F | Below 63 |
| B | 83-86.9 | C- | 70-72.9 | | |

UMass undergraduate grading does not use A+ or D-. Any end-of-term adjustment will be uniform and will not lower an earned letter grade.

## Lecture topics

Each lecture includes worked examples and may span several class meetings.

| Unit | Topics |
| --- | --- |
| Lecture 01 | Aircraft forces, airfoils and structural load paths |
| Lecture 02 | Finite-wing geometry, distributed loads and root reactions |
| Lecture 03 | Beam reactions, section properties, stress, strain, deflection and irregular beams |
| Energy methods | Work, strain energy, axial loading, bending and torsion; worked examples |
| Castigliano | Displacements, rotations, dummy loads and redundant reactions; worked examples |
| Unit-load method | Real and unit-load systems, displacement and rotation, and compatibility for indeterminate structures |
| Virtual work | Virtual work principles and applications to beams and trusses; indeterminate examples and comparison of methods |
| Aircraft loads and wing structures | Maneuver and landing loads; V-n diagrams; structural idealization; thin-walled shear flow, torsion and shear center; wing structures and numerical design |

HW 3 (three beams) is due **November 5 at 11:59 p.m.** Open its existing Canvas assignment and handout. Future assignment dates and the numerical project requirements will be posted in Canvas. The October 29 guest class with Dr. Michael Tsay covers electric propulsion and industry practice. Use Canvas announcements for event details.

## Course policies

### Attendance and communication

Regular attendance is expected, although attendance is not checked every class. Notify the instructor early about an illness, emergency, religious observance, accommodation or other University-recognized absence. Approved absences receive a reasonable equivalent activity or make-up without penalty. Keep up with Canvas announcements and team responsibilities. Bring technical questions to class or office hours; send private grading and accommodation questions to the instructor. Allow two business days for email replies.

### Deadlines, extensions and regrades

Each student has two 24-hour homework extensions without giving a reason. These do not apply to printer reservations, safety approvals, fabrication appointments or presentations. Beyond those passes, late individual work loses 10% of the earned score per 24 hours unless an approved circumstance or accommodation applies. Contact the instructor about a project delay; printer availability may require another arrangement.

Submit a written regrade request within **two calendar days** of grade posting. Identify the rubric item and supporting evidence. The complete submission may be reviewed, and a score may increase, stay the same or decrease if another grading error is found.

### Academic integrity, collaboration and AI

You may discuss approaches with classmates when the assignment allows it. Individual work must show your own reasoning, and every project member must understand the team work. Do not copy solutions, invent results or citations, or submit another person's work as your own.

AI may help with learning, debugging and writing unless an assignment restricts it. Disclose the tool and its purpose, check the technical output, and explain the reasoning yourself. You are responsible for every submitted result. Do not upload private teammate information or restricted course material. AI detectors are not proof of misconduct. The [University Academic Integrity Policy](https://www.umass.edu/senate/book/academic-integrity-policy) applies.

### Seminar extra credit

For the optional September 25 seminar, attendance and a 150-word technical reflection submitted within 48 hours earn up to **2.5 course percentage points**. Students unable to attend may use another aerospace/industry seminar for the same reflection and credit.

### Lab safety and materials

Complete the required orientation and use ELab only in authorized supervised slots. Use the assigned printer, nozzle and material profile; inspect every slicer layer and remain for the first layers. Do not bypass alarms, modify another team's job or use tools and adhesives without approval. Keep a print log and photographs. Report failures and obtain approval before reprinting. Anyone may stop unsafe work and notify staff without losing credit for reporting the concern.

### Recording and privacy

Obtain permission before recording classmates, guests, reviews or fabrication sessions. Course files are for enrolled students' learning; do not sell them or upload restricted materials to public answer-sharing or AI-training services. Remove private identifiers from shared project data.

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
