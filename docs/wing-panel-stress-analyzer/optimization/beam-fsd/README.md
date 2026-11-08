# beam-fsd: Fully Stressed Tapered Beam

Module of the MIE 446 Optimization Lab. Published next to the Beam, Truss Lab and Wing AeroStruct teaching apps at
`.../wing-panel-stress-analyzer/optimization/beam-fsd/index.html`. Self-contained: it uses only `../shared/lab.css`,
`../shared/labkit.js` (plotting) and `../shared/presets.js` (material cards, section properties).

## Purpose

The student has already sized a prismatic beam by hand. This page lets the depth of a rectangular section (fixed width b)
or the wall of a round tube (fixed outer diameter D) follow the bending-moment diagram through the fully stressed design
(FSD) iteration, then shows:

- the student's prismatic design, sized so that the largest moment is exactly at the allowable stress divided by FS;
- the fully stressed (stepped or linearly tapered) design and the mass it saves, in grams and percent;
- what the taper costs in stiffness (the maximum deflection grows);
- a third design in which the whole fully stressed profile is scaled by one factor until the deflection limit L / k is met
  exactly, plus, as a reference, the prismatic beam scaled the same way so both can be compared under identical limits;
- the classical closed-form results beside the numerical ones.

## Model

Euler-Bernoulli beam, linear elastic, small deflection, bending about one axis, no shear deformation. Sign convention:
y up, loads positive upward, bending moment positive sagging (bottom fibre in tension), shear V = dM/dx.

Support types: cantilever (clamped at x = 0), simply supported (pins at x = 0 and x = L), propped cantilever (clamped at
x = 0, pinned at x = L; statically indeterminate, so the moment diagram depends on the stiffness distribution). Loads: up
to three, each a point load P at a or a uniform load w on [a, b]. Materials from the shared cards or custom E, allowable
stress and density. Units: mm, N, MPa, g/cm^3, g.

Solver: 2-node Hermite cubic beam finite element with one bending stiffness EI per element. Nodes sit at the N segment
boundaries, at every load position and at the supports. Supports are applied by eliminating the constrained degrees of
freedom; the reduced symmetric system is solved by banded Gaussian elimination. For piecewise constant EI, point loads and
uniform loads the nodal solution is exact, and M(x), V(x) are recovered from the element end forces (M(xi) = -M1 + F1 xi +
w xi^2 / 2), so they are exact within every element. The deflection inside an element is the Hermite cubic plus the exact
quartic correction w xi^2 (Le - xi)^2 / (24 EI); its extremum is located by root finding on the derivative. Bending stress
is sigma = |M| c / I; stress utilization U = sigma FS / sigma_allow; deflection utilization max |v| / (L / k). Mass is
sum(A_i Le_i) rho / 1000 in grams.

## Algorithm

1. Prismatic start: a single uniform depth h (or wall t) such that max U = 1. The rectangle depth is
   sqrt(6 |M|max FS / (b sigma_allow)); the tube wall solves I(t) = |M|max (D/2) FS / sigma_allow in closed form.
   Both are clamped to the minimum dimension (h_min default 2 mm, t_min default 0.8 mm) and t <= D / 2.
2. Resize every segment for its governing section, the point with the largest |M| inside the segment (an element end or
   the interior point where V = 0). Rectangle: h_new = h sqrt(U), which is exactly the depth that puts the governing
   section at the allowable stress for the current moment. Tube: solve I(t_new) = I(t) U exactly (the thin-wall
   approximation t_new = t U is not used). Clamp to the minimum and to D / 2.
3. Repeat until max |U - 1| < 1e-3 over all segments that are not held at a bound, or 60 passes. For statically
   determinate beams the first pass is the fixed point. For the propped cantilever the moments move toward the stiffer
   parts after every pass; the first pass uses the plain stress-ratio rule and later passes use h_new = h U^(p/2) with the
   exponent p selectable on the page (1.5 by default, 1 is the textbook rule). The fixed point is the same (U = 1 on
   every free segment); p = 1.5 reaches it in roughly two thirds of the passes. Exponents of 2 and above diverge and are
   not offered.
4. Feasibility polish: if the converged design has max U a hair above 1 (within the tolerance), the whole profile is
   scaled up uniformly, which leaves the moment distribution unchanged for the rectangle, so the shown design has
   U <= 1 to floating point accuracy.
5. Deflection limit: if max |v| > L / k, the profile is scaled by a single factor s >= 1 found by bisection (bracket
   doubled until feasible, then 100 halvings or a relative width of 1e-8) until max |v| = L / k; the feasible side of the
   bracket is kept. The same is done to the prismatic design to give a fair reference. Uniform scaling is a simple repair,
   not the minimum-mass design under a deflection constraint.
6. Verification: `verifyDesign(model, design)` rebuilds the model from the candidate numbers, re-solves with the plain
   solver, re-checks every segment stress, the deflection and the dimension bounds, and returns feasibility, utilizations,
   the governing constraint and the mass. The page shows these verified numbers and a badge for every design.

The linear taper option changes only the drawing: the smooth profile through the segment midpoints (held constant over
the half segments at the ends) has the same volume as the stepped design for the rectangle (nearly the same for the tube,
whose area is not linear in the wall); the analysis always uses one depth per segment.

## Classical references shown on the page

- Cantilever, tip load, rectangle of fixed width (Galileo, Discorsi 1638, the beam of uniform strength):
  h(x) = h_root sqrt(1 - x / L); continuous mass ratio FSD / prismatic exactly 2/3; tip deflection ratio exactly 2
  (curvature P L / (E I_root) / sqrt(1 - x/L), integrated twice).
- Simply supported, full-span uniform load, rectangle: h(x) = h_mid sqrt(4 x (L - x)) / L; the integral of
  sqrt(x (L - x)) over [0, L] is pi L^2 / 8, so the mass ratio is pi / 4 = 0.7854; midspan deflection ratio
  (6 pi - 12) / 5 = 1.370.
- Thin-walled tube of fixed outer diameter: section modulus proportional to the wall, so t(x) follows |M(x)|:
  mass ratio 1/2 and deflection ratio 3/2 for the cantilever with tip load, 2/3 and 6/5 for the simply supported beam
  under uniform load (thin-wall limits; the exact tube formula and t_min shift the numbers).

Each segment of the stepped design is sized for the largest moment inside it, so the stepped design is always a little
heavier than the continuous profile and approaches it from above as N grows (difference of order 1 / N). With N = 24 the
cantilever ratio is 0.686, with N = 60 it is 0.675, with N = 200 it is 0.669.

## Verification and tests

`node --test optimization/beam-fsd/beam-fsd.test.js` (17 tests, under one second) checks:

- cantilever tip deflection P L^3 / (3 E I), root moment, reactions (relative error below 1e-6);
- simply supported uniform load midspan deflection 5 w L^4 / (384 E I) and M = w L^2 / 8;
- propped cantilever uniform load: pinned reaction 3 w L / 8, clamped-end moment w L^2 / 8, peak sagging 9 w L^2 / 128;
- point load at an arbitrary position (P a^2 b^2 / (3 E I L)) and a two-step cantilever closed form (per-element EI);
- EI v'' equals the statics moment inside every element; moment and shear continuity across nodes;
- prismatic sizing gives U = 1 exactly for rectangle and tube;
- FSD cantilever with N = 60: mass ratio within 2 percent of 2/3, depth equal to h_root sqrt(1 - x / L) at the governing
  section of every segment (relative error below 1e-3) and within 2 percent of the parabola at the segment midpoints over
  the inner three quarters of the span, deflection ratio within 5 percent of 2;
- FSD simply supported uniform load with N = 60: mass ratio within 2.5 percent of pi / 4 and closer at N = 200,
  deflection ratio within 5 percent of (6 pi - 12) / 5; thin tube within 2 percent of 2/3 and 3 percent of 6/5;
- convergence (max |U - 1| < 1e-3) on the default preset; the three designs verify as described;
- deflection-limited scaling lands within 0.5 percent of the limit on rectangle, tube and propped presets;
- the propped cantilever converges within 60 passes with both exponents and the clamp moment changes by more than 10 percent;
- the verification routine rejects a 10 percent thinner design and a design below the minimum dimension;
- invalid inputs (L <= 0, N < 2, h_min <= 0, no load, load outside the span, t_min >= D / 2, bad material, NaN) return
  error objects instead of throwing; a tube that cannot carry the moment even as a solid rod is reported as an error;
- mesh construction, determinism, speed and CSV export.

The page was smoke tested in headless Chrome (no console errors or page errors on load, on Run, on every preset, on an
invalid input, on Reset, on an out-of-range N and on a custom material with a propped tube).

## Limitations

- Only the bending stress at the extreme fibre is checked. Shear stress, stress concentrations at the steps,
  lateral-torsional and local buckling, fatigue and manufacturing constraints are not considered.
- Each step is sized for the largest moment inside it (conservative). Segments that want to be thinner than the minimum
  stay at the minimum and carry less than the allowable stress.
- Uniform scaling of the profile to meet the deflection limit is not optimal; it is shown because it is simple and
  explainable.
- The analysis uses one depth per segment even in the linear taper drawing mode.
- Material cards are educational values, not certified allowables. Nothing on the page is a design-code check, and the
  page is independent of the Wing AeroStruct solver.

## Files

- `beam-fsd.js`: pure ES module (validation, mesh, Hermite beam solver, prismatic sizing, FSD iteration, deflection
  scaling, verification, classical references, pipeline `runFSD`, CSV rows). No DOM access.
- `index.html`: the page (inputs left, results right, plots drawn with labkit and own canvas code).
- `beam-fsd.test.js`: Node tests (`node:test`, `node:assert/strict`).
- `README.md`: this file.
