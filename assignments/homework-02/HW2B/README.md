# HW 2B Lilienthal wing loads and beam bending

**Download the handout:** [PDF](MIE446_HW2B_Lilienthal_Wing_Beam_Analysis.pdf) · [Editable Word](MIE446_HW2B_Lilienthal_Wing_Beam_Analysis.docx)

MIE 446 Aerospace Structures, Fall 2026. **65 points.**

**Due: Thursday, November 5, 2026.** Submit through Canvas at the time shown there.

## Scope and numbering

- Complete **Part 2, Part 4 and Part 5** for this HW 2B submission.
- Use the numbered task headings below in your report.
- Parts 1 and 3 belong to HW 2A; do not resubmit HW 2A.
- Complete all three beam support cases. **Case A, Case B and Case C are beam cases, not assignment parts.**
- Submit individually authored work. Discuss within your existing team, but write your own calculations and explanations.
- Read [Lecture 03 in Colab](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb), Sections 2A–2C, 3, 4 and 5.
- Use equilibrium and integration of displacement and rotation equations. Virtual work is not required.

## Prescribed model

The three fixtures below are alternative teaching models of a scaled wing member. They are **not reconstructions of Lilienthal's actual wing attachments**. Cases B and C require load-bearing connections at both ends; they do not represent a free wing tip with an invented extra support.

![Conceptual wing member and three alternative test fixtures](lilienthal_member_models.svg)

- **Case A:** left end fixed and right end free.
- **Case B:** pin at the left end and roller at the right end.
- **Case C:** both ends fixed.
- **Length:** L = 450 mm.
- **Rectangular section:** width b = 16 mm; vertical depth h = 8 mm.
- **Material modulus:** E = 2200 MPa = 2200 N/mm².
- **Applied point load:** P = 3 N downward at a = L/2 = 225 mm, measured from the left end.
- **Hand model:** straight, constant-section, linearly elastic Euler–Bernoulli beam; neglect self-weight and shear deformation.
- **Interpretation:** the 3 N load is a prescribed downward increment for comparing supports. It is not measured historical lift and is not the resultant of the Part 5 distributed load.
- **Historical limits:** the dimensions and modulus are teaching inputs; do not estimate them from the photograph.

## Coordinates and signs

- Beam x starts at the left end and runs along the member toward the right end.
- Beam z is upward from the cross-section neutral axis.
- Span coordinate s in Part 5 follows the same direction as beam x.
- Aircraft body x points forward; it is not beam x.
- For hand free bodies, upward forces and counterclockwise external couples are positive.
- Internal bending moment M is sagging-positive.
- Displacement v is positive downward; rotation θ = dv/dx.
- Use subscripts L and R for left and right support reactions.
- A clamp can supply a transverse reaction force and a reaction couple.
- A pin or roller supplies a transverse reaction but no reaction couple in this model.
- No axial load is applied in these cases.
- The governing hand relations are:

$$\theta=\frac{dv}{dx},\qquad EI\frac{d^2v}{dx^2}=-M(x),\qquad
\sigma_{xx}=-\frac{M(x)z}{I}.$$

## Part 2 Beam model and hand solution 35 points

### 2.1 Image drawings and predictions 5 points

- **Submit one annotated historical image:** reuse the Lilienthal glider image from Part 1 of HW 2A.
- Add the source URL and a caption identifying the aircraft or glider when known.
- Outline one visible rib, spar or other wing member that motivates your beam model.
- Mark the visible locations where that member connects to other structure.
- If your HW 2A image does not show a suitable member, add one sourced image that does; identify which image supports your interpretation.
- Do not infer hidden dimensions, material properties or joint fixity from a photograph.
- **Submit one separate load-transfer sketch:** draw the selected member and the neighboring structure that supports it.
- Draw an arrow for the assumed external load acting on the selected member; label the structure or surface applying that load.
- Mark the connection through which the member transfers force to the neighboring structure; name that neighboring structure.
- Label any assumed features as assumptions and any visible features as observations. The sketch does not require measured historical forces.
- **Submit three physical-beam drawings:** one each for Cases A, B and C, showing the actual support symbols, L, a and the downward 3 N load. Do not add support reaction arrows to these drawings.
- **Submit three separate free-body diagrams:** remove the support symbols and replace them with unknown reaction forces and, for clamps, reaction couples. Retain the 3 N load and dimensions.
- **Submit one cross-section sketch:** label b, h, the neutral axis, z, and the extreme-fibre distance c = h/2.
- **Submit three bent-centreline sketches:** show which end displacements and rotations each fixture permits or prevents.
- **Submit coordinate sketches:** distinguish aircraft-forward x from beam x and show the upward beam z direction.
- **Submit two prediction rankings before calculation:** rank Cases A, B and C by maximum absolute displacement and by maximum absolute bending stress. State any predicted ties.
- Give a short reason for each ranking using constraints and load transfer, not numerical answers.

### 2.2 Reactions shear and moment 10 points

- Complete the following calculations separately for Cases A, B and C.
- Write whole-beam vertical force equilibrium.
- Write whole-beam moment equilibrium and state the moment reference point.
- Identify which reactions equilibrium determines directly and which remain unknown.
- Draw a cut in the interval 0 < x < 225 mm and derive V(x) and M(x).
- Draw a second cut in the interval 225 < x < 450 mm and derive V(x) and M(x).
- Submit the two piecewise expressions with their interval limits and units.
- Submit labeled shear-force and bending-moment diagrams.
- Mark the shear jump at the point load and the internal moments at x = 0+, 225 mm and 450 mm-.
- Distinguish an external support couple from the signed internal moment immediately inside the beam.

### 2.3 Rotation displacement and compatibility 15 points

- Integrate EI d²v/dx² = -M(x) in each interval for each support case.
- Show the integration constants.
- Write the physical condition used to determine each constant.
- Enforce continuity of displacement and rotation at x = 225 mm; a point force is not a hinge.
- Apply the end conditions listed below.

| Case | End conditions |
|---|---|
| A Cantilever | v(0) = θ(0) = 0. The unloaded outboard interval has M = 0; it is straight but may be tilted. |
| B Pin–roller | v(0) = v(L) = 0. End rotations are free and must not be set to zero. |
| C Fixed–fixed | v(0) = θ(0) = v(L) = θ(L) = 0. Equilibrium alone is insufficient. |

- For Case C, write the two additional compatibility equations below.
- Explain that they enforce zero rotation and zero displacement at the right clamp, starting from zero rotation and displacement at the left clamp.

$$\theta(L)=-\frac{1}{EI}\int_0^L M(x)\,dx=0,\qquad
v(L)=-\frac{1}{EI}\int_0^L(L-x)M(x)\,dx=0.$$

- Explain the factor L - x in one sentence.
- Substitute the piecewise moment expressions into both integrals and solve for the remaining reactions.
- Use symmetry only to check the result, not to replace the two compatibility equations.
- Submit v(x) and θ(x) for both intervals in each case.
- Calculate v(225 mm) for each case.
- Determine the maximum absolute displacement and its location for each case; do not assume that it occurs under the load in Case A.

### 2.4 Stress and hand results 5 points

- Calculate section area A = bh, second moment of area I = bh³/12, and c = h/2, with units.
- Calculate the maximum absolute bending stress in each case using the largest absolute internal moment.
- State the beam location of that maximum.
- At a section with maximum absolute moment, calculate and label the upper- and lower-fibre stresses.
- Identify which fibre is in tension and which is in compression.
- Submit one hand-results table with one row per case and units in every column.
- Include all nonzero reaction forces and couples in the table.
- Include the signed internal moments at x = 0+, 225 mm and 450 mm-.
- Include maximum absolute bending stress and its location.
- Include v(225 mm), maximum absolute displacement and its location.
- Compare your results with your two prediction rankings and explain any correction.

## Part 4 Software verification 20 points

### 4.1 Model setup and saved records 5 points

- Open each corresponding beam case:

- [Case A Cantilever centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-centre)
- [Case B Simply supported centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-simple)
- [Case C Fixed–fixed centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-fixed)

- The links open baseline lessons, not the assessed HW 2B inputs.
- In **Define your beam**, set L = 450 mm, b = 16 mm, h = 8 mm and E = 2200 MPa.
- Click **Apply beam dimensions** before entering the load.
- Click **Clear all loads**; changing geometry may restore the default tip force.
- Add only one downward 3 N point force at x = 225 mm.
- Confirm the intended support case and the displayed input summary.
- Check that no default 2 N tip force remains.
- Run the calculation.
- Repeat the setup for all three support cases.
- Submit three records using **Download study record**, one per case.
- Submit a labeled input screenshot for each case.

### 4.2 Hand and software comparisons 10 points

- Submit result screenshots showing V, M, bending stress and displacement for each case.
- Submit a hand-versus-software table for every quantity in your Part 2 hand-results table.
- For each comparison, give the quantity, unit, hand value, software value, sign conversion, absolute difference and relative difference.
- Document how the software force, moment and displacement signs map to the hand conventions.
- For a nonzero hand value, calculate relative difference as 100 × absolute difference / absolute hand value.
- For an expected zero, report the signed software value and its absolute residual with units; do not divide by zero.
- Use the supplied CSV as a starting template and add rows for all required quantities.
- Retain your original predictions and explain any corrections.
- If the models do not match, identify the differing input or assumption rather than silently changing the hand theory.

### 4.3 Independent checks and mesh study 5 points

- Calculate the signed sum of applied and reaction forces for each case and report the force residual in N.
- Calculate the signed sum of applied and reaction moments about x = 0 and report the moment residual in N mm.
- Check the constrained end displacements and rotations for each case.
- Report small numerical values explicitly; a rounded display of 0.0000 does not establish exact zero.
- Select one case and use **Compare 10 / 20 / 40 elements**.
- Submit a table of maximum absolute displacement and maximum absolute bending stress for the three meshes.
- Identify which case and load were used.
- Explain whether the results converge.
- Explain why convergence alone does not verify the real material, connection stiffness or historical wing model.

## Part 5 Distributed wing load and design check 10 points

### Part 5 prescribed distributed load

- Use Case A with L = 450 mm, b = 16 mm, h = 8 mm and E = 2200 MPa.
- Keep the same downward-load convention.
- Use the following educational load law, not measured historical pressure:

$$\Delta f_z(s)=q\,c(s)A_zg(s),\qquad q=\frac12\rho V^2.$$

- Density ρ = 1.225 kg/m³; speed V = 15 m/s; dimensionless coefficient A_z = 0.30.
- Use s in metres in this law.
- Chord c(s) = 0.160 - (0.060/0.450)s in metres.
- Activation g(s) = 0 for 0 ≤ s ≤ 0.300 m.
- Activation g(s) = (s - 0.300)/0.150 for 0.300 < s ≤ 0.450 m.
- Here c(s) is aerodynamic chord, not the stress distance c = h/2.
- Δf_z is downward force per unit span in N/m, not a point force.
- Aerodynamic chord varies along the span; the structural beam section remains constant.
- Convert coordinates to mm and load intensity to N/mm before software input.

### 5.1 Distributed load and refinement 5 points

- Plot Δf_z against s over the entire 0–450 mm span, including the zero-load region.
- Independently integrate Δf_z to obtain total force in N.
- Independently integrate sΔf_z to obtain the applied moment about the root; report it in N m and N mm.
- State the reference point and sign used for the moment.
- Prepare a load-intensity table at 300, 350, 400 and 450 mm.
- Include each intensity in both N/m and N/mm; divide N/m by 1000 to obtain N/mm.
- Clear the point force from the software.
- Enter three adjacent trapezoidal segments spanning those four coordinates.
- Submit the input screenshot and downloaded record.
- Compare software total force and root moment with your independent integrals.
- Refine to six equal segments over 300–450 mm, using endpoints spaced 25 mm apart.
- Submit the six-segment endpoint table, screenshot, record and comparison.
- Explain the change in error: chord times activation is quadratic, whereas each entered segment is linear.
- Use software for distributed-load displacement; a hand derivation of its full displacement curve is not required.

### 5.2 Equivalent point force 2 points

- Calculate the equivalent force magnitude from your independent total-force integral.
- Calculate its position s-bar = integral(sΔf_z ds) / integral(Δf_z ds), not automatically L/2.
- Replace the distributed segments with that single downward force at s-bar.
- Submit the point-force position, input screenshot and downloaded record.
- Compare its total force and root moment with the distributed-load results.
- Compare maximum absolute displacement with the six-segment model.
- Explain why equivalent force and root moment do not guarantee the same internal moment distribution or displacement.

### 5.3 Depth comparison and model limits 3 points

- Restore the Part 2 **single downward 3 N point force at 225 mm**; do not use the Part 5 distributed load for this depth study.
- Use Case A and keep L = 450 mm, b = 16 mm and E = 2200 MPa unchanged.
- Record maximum absolute bending stress and displacement at h = 8 mm.
- Predict the ratios for h = 10 mm using I = bh³/12 and c = h/2.
- Define each ratio as the 10 mm result divided by the 8 mm result.
- Change only h to 10 mm, rerun, and submit a table of predictions, results and ratios.
- Submit the two study records and a labeled comparison screenshot.
- Explain why changing depth affects stress and stiffness but not the equilibrium reactions in this cantilever case.
- Reuse your historical-image annotation and load-transfer sketch in a final labeled figure.
- Mark what the isolated beam represents and what is omitted.
- State which actual connection information is needed before choosing a clamp, pin or elastic joint.
- Explain why fabric, ribs, multiple members and any source-supported bracing cannot automatically be modeled as a modern closed stressed-skin wing box.
- Distinguish the role of ribs in shape retention and local skin support from the role of longitudinal members in global bending.
- Do not add ribs or build an additional wing model for this assignment.
- An optional printed-wing workspace comparison is not graded and is not a prediction for Lilienthal's aircraft or a full 3-D finite-element result.
- This exercise does not approve a printed wing for loading or flight.

## Report questions

- Submit a short answer to each question below in your PDF report.
- **Q1:** Why can equilibrium solve the cantilever reactions but not all fixed–fixed reactions?
- **Q2:** Does zero end displacement imply zero end rotation for every support? Use your three cases.
- **Q3:** Why can the unloaded outboard part of Case A move even though its curvature is zero?
- **Q4:** What does hand–software agreement verify, and which material or model assumptions remain unvalidated?
- **Q5:** Which features came from historical evidence, which from the prescribed load law, and which were engineering assumptions?
- Include a short process/AI-use note identifying any tools used and how you checked their output.

## Files to submit through Canvas

1. **One report PDF:** include all drawings, calculations, tables, plots, screenshots and explanations requested in tasks 2.1–2.4, 4.1–4.3 and 5.1–5.3, followed by Q1–Q5 and the process/AI-use note.
2. **Software study records:** include the three Part 4 point-load cases, the three- and six-segment Part 5 loads, the equivalent point force, and the h = 8 and 10 mm depth cases. Clearly label every record; reuse a saved record where the inputs are identical.
3. **Calculation files:** include any scripts or spreadsheets actually used; do not create an extra script solely for submission.
4. **One README:** state units, software version/date, file names, and how to reproduce each study.
5. **One Claim–Evidence–Check slide in PDF and PPTX:** state one engineering claim, give a quantitative comparison supporting it, and identify one independent check or model limitation.
6. **File names:** include your name and HW2B in each submitted file name.
7. **Submission format:** the report is PDF; the editable Word handout is not a required report format.
8. **Individual explanation:** be prepared to explain one compatibility equation and one discrepancy.
9. **Submission limits:** do not resubmit HW 2A or publish student work in the course repository.
