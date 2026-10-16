# HW 2B Lilienthal wing loads and beam bending

**Download the handout:** [PDF](MIE446_HW2B_Lilienthal_Wing_Beam_Analysis.pdf) · [Editable Word](MIE446_HW2B_Lilienthal_Wing_Beam_Analysis.docx)

MIE 446 Aerospace Structures, Fall 2026. **65 points.**

**Due: Thursday, November 5, 2026.** Submit through Canvas at the time shown there.

## Required parts and numbering

HW 2B is the second submission of Homework 2. Complete **Part 2, Part 4 and Part 5** below, worth 35, 20 and 10 points respectively. Parts 1 and 3 belong to HW 2A and are not new tasks in this submission. Organize your report under the same Part 2, Part 4 and Part 5 headings.

The labels **Case A, Case B and Case C** refer only to three beam support arrangements within Part 2. They do not mean assignment parts 2A and 2B. Complete all three beam cases.

## Read before starting

[Lecture 03 in Colab](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb): Sections 2A–2C (supports and compatibility), 3 (cuts and V/M), 4 (stress and section properties), and 5 (strain, curvature and displacement).

Use equilibrium and integration of the displacement and rotation equations. Virtual work is not required.

## The wing member

Using your annotated Lilienthal wing/control-device image from HW 2A, investigate how a transverse load reaches a structural member and how its connections affect stress and deformation.

Use the Lilienthal glider image you annotated for **Part 1 of HW 2A**. Include a copy in this report with its source URL and a caption naming the aircraft or glider when known. You do not need a new photograph or a physical model. If your earlier image does not show a member clearly, add a sourced view that does and identify which image supports your interpretation.

Highlight one visible rib, spar or other wing member that motivates the beam idealization. Label its apparent extent, attachment location(s), and the direction in which load would enter and leave it. Identify what is actually visible; draw a separate conceptual load path from the aerodynamic load into the wing structure and its connections. Do not infer hidden dimensions, materials or joint fixity from the photograph. Label observed features as evidence and the simplified beam and fixtures as engineering assumptions. Use the prescribed dimensions below for calculations, not dimensions estimated from the photograph.

![Conceptual wing member and three alternative test fixtures](lilienthal_member_models.svg)

The figure is an original teaching schematic, **not a reconstruction of Lilienthal's wing**. We isolate a scaled member inspired by that wing's load-transfer problem and test three alternative connection arrangements. Case A represents a root-held, free-ended member idealization. Cases B and C represent a member supported at both ends in alternative test/design fixtures, with either free or restrained end rotations. They are **not three claims about how the historical half-wing was attached**. A simply supported bay or fixed-ended bay must have real load-bearing connections at both ends; adding a second support changes the physical system.

Keep the aircraft question visible throughout: what can a connection transmit, where does the member bend, and what evidence would you need to choose a defensible model for the actual wing?

## Given model and conventions

Use a straight, constant-section, linearly elastic **scaled wing-member model**: L = 450 mm, b = 16 mm, h = 8 mm, E = 2200 MPa, with a downward point-force increment P = 3 N at a = L/2 = 225 mm. This is a prescribed downward control-load increment for a support-comparison experiment; it is **not the complete upward lift**, a measured Lilienthal force, or the resultant of the distributed-load case below. The rectangle and modulus are teaching inputs, not a historical material/section identification. Ignore self-weight and shear deformation in the hand Euler–Bernoulli calculation.

In aircraft body axes, x points forward. In this beam model, beam x runs outward along the right wing/member and beam z is upward across its depth: beam x corresponds to the span coordinate s, **not aircraft-forward x**. Draw both conventions once. The retained transverse increment is positive downward; the drag increment and the real wing's other members, joints and bracing are outside this one-plane model.

Compare three supports under this **same** load: (A) left cantilever, (B) pin–roller, (C) fixed–fixed. The rectangle's vertical depth is h and its width is b. Calculate A, I = bh³/12 and c = h/2 before using any stress formula.

For the hand free body, upward forces and counterclockwise external couples are positive. Internal M is sagging-positive. Downward displacement v is positive:

$$\theta=\frac{dv}{dx},\qquad EI\frac{d^2v}{dx^2}=-M(x),\qquad
\sigma_{xx}=-\frac{M(x)z}{I}.$$

For transverse bending, a clamp supplies a vertical reaction and a couple; a pin/roller supplies a vertical reaction and no couple. There is no imposed axial load in these cases. The software uses its own force/couple signs: document the conversion before comparing numbers.

## Part 2 Beam model and hand solution 35 points

Marking: drawings, model and predictions 5; equilibrium and internal forces 10; displacement/rotation and compatibility 15; stress and interpretation 5.

For **each** support case draw two separate pictures:

1. Physical beam with its actual supports, dimensions and applied load only.
2. External free body: remove the supports and replace them with unknown reaction arrows/couples. Retain the applied load. Do not show a support symbol and its replacement reaction together.

On the sourced HW 2A image described above, highlight the selected member and mark the load-entry and connection locations. In a separate sketch, replace that member with the prescribed scaled beam. Before calculating, rank Cases A, B and C by maximum absolute displacement and by maximum absolute bending stress, stating any predicted ties. Explain your reasoning using constraints and load paths. A free wing tip must not become a clamp merely because the software offers that option.

Add a cross-section drawing showing b, h, z, the neutral axis and c. Add a bent-centreline sketch showing what displacement and tangent rotation each support permits.

## Part 2 calculation steps and required outputs

Complete the following steps separately for Case A, Case B and Case C. Label left and right beam ends as x = 0 and x = L. Use subscripts L and R for support reactions so that case labels cannot be mistaken for support locations.

For each case write whole-beam force and moment equilibrium. Derive the piecewise internal moment on 0 ≤ x ≤ a and a ≤ x ≤ L from a cut; sketch V and M with units.

Integrate the curvature equation in each interval. Show your constants and the physical condition used to determine each one. At the point load, displacement and rotation remain continuous; shear jumps. A point force is not a hinge or an applied point couple.

| Case | Geometric conditions you must explain and use |
|---|---|
| A Cantilever | v(0) = θ(0) = 0; continuity at a. The unloaded outboard region has M = 0, so it remains straight but can be tilted. |
| B Pin–roller | v(0) = v(L) = 0; continuity at a. End rotations are free, not prescribed zero. |
| C Fixed–fixed | v(0) = θ(0) = v(L) = θ(L) = 0; continuity at a. Equilibrium alone cannot determine all four transverse reactions. |

For Case C, identify the two missing equations as **compatibility**, not additional equilibrium. Starting from the zero displacement and slope at the left end x = 0, show why:

$$\theta(L)=-\frac{1}{EI}\int_0^L M(x)\,dx=0,\qquad
v(L)=-\frac{1}{EI}\int_0^L(L-x)M(x)\,dx=0.$$

Explain the remaining-distance factor L − x in one sentence. Substitute your piecewise M and solve for the reactions. Symmetry may check your result but is not a substitute for writing both compatibility equations.

Report all nonzero support reactions, signed end/centre internal moments, maximum absolute bending stress, displacement at the load, and maximum displacement with its location. Distinguish external support couples from internal end moments. Do not assume the cantilever maximum occurs under the centre load.

**Part 2 required outputs**

1. Sourced annotated image and a separate scaled-beam idealization.
2. Predictions ranking all three cases, with reasons.
3. Three physical-beam drawings and three separate reaction free bodies.
4. Cross-section and bent-centreline sketches with labeled variables.
5. Equilibrium, piecewise V and M, integration constants and compatibility calculations for all three cases.
6. One results table with reactions, internal moments at x = 0+, 225 mm and 450 mm-, maximum absolute stress and its location, v(225 mm), and maximum absolute displacement and its location. Use one row per case and units in every column. State tensile and compressive extreme-fibre stress signs at a section of maximum absolute moment.

## Part 4 Software verification 20 points

Marking: correct inputs and reproducible study records 5; hand–software comparison 10; boundary, equilibrium and mesh checks 5.

Open the corresponding **baseline lesson case** below. These links initially use the Lecture 03 defaults, **not the assessed values above**:

- [A Cantilever centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-centre)
- [B Simply supported centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-simple)
- [C Fixed–fixed centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-fixed)

In **Define your beam**, set L = 450 mm, b = 16 mm, h = 8 mm and E = 2200 MPa, then click **Apply beam dimensions**. Changing length can reset loads to the default tip force. Therefore set the load **after** applying geometry: use **Clear all loads**, add a single downward 3 N point load at 225 mm, and confirm the intended support. Do not leave the default 2 N tip force active. Confirm the displayed input summary and recalculate. This beam workspace uses mm, N and MPa.

Use **Download study record** for each solved case and include the records with your submission. In addition to the hand checks, use **Compare 10 / 20 / 40 elements** on one case. Explain why numerical convergence does not establish that a real clamp or material matches the model.

Capture the input panel and V/M, stress and displacement results. For each support, submit a table with **hand result, software result, sign/unit conversion and relative difference**. For a zero expected value use an absolute residual rather than dividing by zero. Include force and moment balance residuals and a check of the end displacements/rotations. Do not rely on a rounded display of 0.0000 as proof of exact zero.

Compare every quantity requested in the Part 2 results table, not just tip displacement. Define relative difference as 100 times the absolute difference divided by the absolute nonzero hand result; report it as a percentage. For an expected zero, report the signed software value and its absolute residual with units. For the mesh study, identify the case and compare maximum displacement and maximum bending stress at 10, 20 and 40 elements.

**Part 4 required outputs**

1. Three downloaded study records, one for each point-load case.
2. Clearly labeled input and result screenshots for each case.
3. Hand versus software comparison tables and a sign-convention note.
4. Force and moment residuals and end-displacement and rotation checks.
5. One 10, 20 and 40 element comparison with a short explanation.

The CSV in this pack is a starting template: add rows for all required quantities.

Keep hand predictions even if wrong; explain corrections. If you cannot match a displayed input to the hand model, document the mismatch instead of silently changing your theory.

## Part 5 Distributed wing load and design check 10 points

Marking: distributed-load input, resultant/root-moment check and refinement 5; equivalent-force interpretation 2; depth study and model limits 3.

Keep case A, the same 450 mm member section/modulus and the same downward-increment convention. Use the prescribed transverse control-load increment:

$$\Delta f_z(s)=q\,c(s)A_zg(s),\qquad q=\frac12\rho V^2.$$

Use these inputs: ρ = 1.225 kg/m³, V = 15 m/s, root/tip chords 0.160/0.100 m, activation at 0.300 m, tip at 0.450 m, and A_z = 0.30. The chord is linearly tapered and g grows linearly from zero at activation to one at the tip. These remain an educational control-load law, not measured historical pressure data.

Use s in metres in the load law: c(s) = 0.160 - (0.060/0.450)s. Set g(s) = 0 for 0 ≤ s ≤ 0.300 m and g(s) = (s - 0.300)/0.150 for 0.300 < s ≤ 0.450 m. Here c(s) is the aerodynamic chord, not the extreme-fibre distance c = h/2 used for stress. A_z is a prescribed dimensionless load coefficient. The symbol Δf_z denotes load per unit span in N/m, not a single force. Treat the law as the positive downward increment in this exercise, regardless of the app's signed input convention.

Compute the transverse resultant and its first moment about the member root. Do not reuse an aircraft roll/yaw moment as a local hinge torque or a beam end couple. State the reference point on each free body.

1. Plot the given transverse load against s. Keep the zero-load region from 0 to 300 mm.
2. Represent 300–450 mm with three adjacent trapezoidal line-load segments, with endpoints at 300, 350, 400 and 450 mm. Evaluate the given law at each endpoint. Convert N/m to N/mm by dividing by 1000; coordinates in the app are mm.
3. Clear the point load and enter only those three distributed segments in the beam software. Preserve the actual model assumptions: tapered aerodynamic chord controls the load, while the isolated structural section remains constant.
4. Compare app force resultant and root moment against your integrals of Δf_z and sΔf_z, using consistent units. Refine to six segments. Explain the load-approximation error: chord times activation is generally quadratic, so a few straight segments do not reproduce it exactly.
5. Compare with a **single equivalent force** at s-bar = integral(sΔf_z ds)/integral(Δf_z ds), not automatically L/2. The equivalent force should reproduce total force and root moment within the load-discretization error; it need not reproduce internal moment everywhere or maximum displacement. Show one displacement comparison and explain why.

The hand displacement derivation is required for the centre-force cases only. For the multi-segment distributed load, use the software and verify its resultant and root moment independently.

## Part 5 depth study and model limits

**Depth study:** keep case A and the same load/material/length; change only h from 8 to 10 mm. Predict stress and displacement ratios using I = bh³/12 and c = h/2 before rerunning. Verify with the app; explain why greater depth changes stiffness without changing equilibrium reactions.

For this depth comparison, use the **single 3 N downward point load at 225 mm** from Part 2, not the distributed load. Restore h = 8 mm for the baseline, record maximum absolute bending stress and maximum absolute displacement, then repeat at h = 10 mm. Define each ratio as the 10 mm result divided by the 8 mm result. Keep b = 16 mm, L = 450 mm, E = 2200 MPa, load position and support unchanged.

**Return to Lilienthal:** annotate your starting load-path sketch with what your solved member represents and what it omits. Explain which actual connection information would be needed before choosing a clamp, pin or elastic joint. Discuss why fabric, ribs, multiple members and any bracing identified in your cited source cannot automatically be replaced by a modern closed stressed-skin wing box.

**Optional modern comparison, not an additional required model:** open the app's printed-wing workspace and identify how its skin/member load path differs from your Lilienthal-inspired member. It is a different structure; do not present its stress plot as a prediction for Lilienthal's aircraft or as a full 3-D finite-element result.

Adding ribs is **not** required here. A short paragraph should distinguish global bending stiffness from rib functions such as section-shape retention and local skin support. This exercise does not approve a printed wing for loading or flight.

**Part 5 required outputs**

1. Load-law plot and endpoint load tables for three and six segments, including units and signs.
2. Independent integrals for resultant and root moment, compared with both software segment counts.
3. Equivalent-force position and the displacement comparison with the distributed load.
4. Two-depth predictions and a results table using the specified 3 N point load.
5. Annotated final load path and a short model-limit discussion.

## Submission

Submit individually authored work through Canvas. Include all outputs listed for Parts 2, 4 and 5. Do not publish student work in the course repository.

Include a short process/AI-use note. Answer:

- Why can two equilibrium equations solve the cantilever reactions but not the fixed–fixed reactions?
- Does zero end displacement imply zero end rotation for every support?
- Why does the outboard portion of the centre-loaded cantilever still move when its curvature is zero?
- What does software agreement verify, and what material or model assumptions remain unvalidated?
- Which parts of your model came from historical evidence, which came from the prescribed load law, and which were deliberately assumed for this structural comparison?

In your README, state units, software version/date and how to reproduce the studies. Be prepared to explain one compatibility equation and one discrepancy.

**Submission checklist:** upload one report PDF organized as Part 2, Part 4 and Part 5; the downloaded study records for the three point-load cases and the Part 5 studies; the slide in PDF and PPTX; and a README plus any calculation files used. Name files with your name and HW2B. The editable Word file in this pack is the assignment handout, not a required report submission format. In the slide, state one engineering claim, give one quantitative comparison as evidence, and name one independent check or model limitation. Do not submit a second copy of HW 2A.
