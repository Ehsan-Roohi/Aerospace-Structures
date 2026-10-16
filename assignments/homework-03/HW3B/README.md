# HW 3B Beam equilibrium compatibility and software verification

MIE 446 Aerospace Structures, Fall 2026. This is **HW 3B**, separate from HW 2B. HW 2A and HW 2B are unchanged.

**Schedule:** part of the HW 3 portfolio, due November 12, 2026; Canvas supplies the exact time, submission slot and grading allocation. Do not submit this work in the HW 2B slot.

## Read before starting

[Lecture 03 in Colab](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb): Sections 2A–2C (supports and compatibility), 3 (cuts and V/M), 4 (stress and section properties), and 5 (strain, curvature and displacement).

Use **equilibrium and integration of the displacement/rotation equations**, not virtual work. Lecture 04 will introduce virtual work separately.

The question is: how does preventing end rotation change reactions, stress and displacement under the same force? Can you verify a software result without treating the software as an answer key?

## Given model and conventions

Use a straight, constant-section, linearly elastic beam: L = 400 mm, b = 16 mm, h = 8 mm, E = 2200 MPa, with a downward point force P = 3 N at a = L/2. These are prescribed teaching values, not measured PLA properties or a safe wing design. Ignore self-weight and shear deformation in the hand Euler–Bernoulli calculation.

Compare three supports under this **same** load: (A) left cantilever, (B) pin–roller, (C) fixed–fixed. The rectangle's vertical depth is h and its width is b. Calculate A, I = bh³/12 and c = h/2 before using any stress formula.

For the hand free body, upward forces and counterclockwise external couples are positive. Internal M is sagging-positive. Downward displacement v is positive:

$$\theta=\frac{dv}{dx},\qquad EI\frac{d^2v}{dx^2}=-M(x),\qquad
\sigma_{xx}=-\frac{M(x)z}{I}.$$

For transverse bending, a clamp supplies a vertical reaction and a couple; a pin/roller supplies a vertical reaction and no couple. There is no imposed axial load in these cases. The software uses its own force/couple signs: document the conversion before comparing numbers.

## 1 Predict and draw before calculating

For **each** support case draw two separate pictures:

1. Physical beam with its actual supports, dimensions and applied load only.
2. External free body: remove the supports and replace them with unknown reaction arrows/couples. Retain the applied load. Do not show a support symbol and its replacement reaction together.

Predict which case has the greatest maximum displacement and which has the smallest maximum bending stress. Explain your prediction using constraints, not remembered numerical answers.

Add a cross-section drawing showing b, h, z, the neutral axis and c. Add a bent-centreline sketch showing what displacement and tangent rotation each support permits.

## 2 Calculate reactions and displacement by hand

For each case write whole-beam force and moment equilibrium. Derive the piecewise internal moment on 0 ≤ x ≤ a and a ≤ x ≤ L from a cut; sketch V and M with units.

Integrate the curvature equation in each interval. Show your constants and the physical condition used to determine each one. At the point load, displacement and rotation remain continuous; shear jumps. A point force is not a hinge or an applied point couple.

| Case | Geometric conditions you must explain and use |
|---|---|
| A Cantilever | v(0) = θ(0) = 0; continuity at a. The unloaded outboard region has M = 0, so it remains straight but can be tilted. |
| B Pin–roller | v(0) = v(L) = 0; continuity at a. End rotations are free, not prescribed zero. |
| C Fixed–fixed | v(0) = θ(0) = v(L) = θ(L) = 0; continuity at a. Equilibrium alone cannot determine all four transverse reactions. |

For case C, identify the two missing equations as **compatibility**, not additional equilibrium. Starting from the zero displacement and slope at A, show why:

$$\theta(L)=-\frac{1}{EI}\int_0^L M(x)\,dx=0,\qquad
v(L)=-\frac{1}{EI}\int_0^L(L-x)M(x)\,dx=0.$$

Explain the remaining-distance factor L − x in one sentence. Substitute your piecewise M and solve for the reactions. Symmetry may check your result but is not a substitute for writing both compatibility equations.

Report all nonzero support reactions, signed end/centre internal moments, maximum absolute bending stress, displacement at the load, and maximum displacement with its location. Distinguish external support couples from internal end moments. Do not assume the cantilever maximum occurs under the centre load.

## 3 Verify using the course software

Open the corresponding **baseline lesson case** below. These links initially use the Lecture 03 defaults, **not the assessed values above**:

- [A Cantilever centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-centre)
- [B Simply supported centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-simple)
- [C Fixed–fixed centre force](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-fixed)

In **Define your beam**, set L = 400 mm, b = 16 mm, h = 8 mm and E = 2200 MPa, then click **Apply beam dimensions**. Changing length can reset loads to the default tip force. Therefore set the load **after** applying geometry: use **Clear all loads**, add a single downward 3 N point load at 200 mm, and confirm the intended support. Do not leave the default 2 N tip force active. Confirm the displayed input summary and recalculate. This beam workspace uses mm, N and MPa.

Use **Download study record** for each solved case and include the records with your submission. In addition to the hand checks, use **Compare 10 / 20 / 40 elements** on one case. Explain why numerical convergence does not establish that a real clamp or material matches the model.

Capture the input panel and V/M, stress and displacement results. For each support, submit a table with **hand result, software result, sign/unit conversion and relative difference**. For a zero expected value use an absolute residual rather than dividing by zero. Include force and moment balance residuals and a check of the end displacements/rotations. Do not rely on a rounded display of 0.0000 as proof of exact zero.

Keep hand predictions even if wrong; explain corrections. If you cannot match a displayed input to the hand model, document the mismatch instead of silently changing your theory.

## 4 One controlled change and a wing connection

**Depth study:** keep case A and the same load/material/length; change only h from 8 to 10 mm. Predict stress and displacement ratios using I = bh³/12 and c = h/2 before rerunning. Verify with the app; explain why greater depth changes stiffness without changing equilibrium reactions.

**Wing connection:** use the app's wing navigation to open the skin-only printed-wing preset. Keep its released geometry/materials; select a single tip-force case and record the actual inputs. Show one inside-wing view and one displacement or stress view. Identify the root, skin, and any reinforcements actually present. Explain why a rectangular-beam hand value is not automatically the prediction for a tapered hollow airfoil, and why the root load path matters. Do not claim a three-dimensional finite-element stress result from the beam/section model.

Adding ribs is **not** required here. A short paragraph should distinguish global bending stiffness from rib functions such as section-shape retention and local skin support. This exercise does not approve a printed wing for loading or flight.

## Submit and explain

Submit one individually authored PDF through Canvas, including your predictions, separate drawings, derivation, result/comparison tables, input/result screenshots, depth study and wing paragraph. Include any scripts/spreadsheets you actually used with a short README stating units, software version/date and how to reproduce your study. Do not publish student work here.

End with a brief process/AI-use note and answer:

- Why can two equilibrium equations solve the cantilever reactions but not the fixed–fixed reactions?
- Does zero end displacement imply zero end rotation for every support?
- Why does the outboard portion of the centre-loaded cantilever still move when its curvature is zero?
- What does software agreement verify, and what material or model assumptions remain unvalidated?

Be ready to explain one compatibility equation and one discrepancy in a short individual defense.
