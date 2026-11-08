# beam-supports: Support Placement and Worst-Case Load Position

Module of the MIE 446 Optimization Lab (browser-based, dependency-free). Published next to the Beam, Truss Lab and
Wing AeroStruct teaching apps as `optimization/beam-supports/index.html`.

## Purpose

A student has solved a beam with given supports. This page shows that the support locations are design variables:
it finds the placement that minimizes the peak bending moment or the peak deflection (Part A) and introduces
influence lines as a worst-case search over the position of a moving load (Part B). Every recommended layout is
re-solved from scratch with the exact solver and the constraints are re-checked before it is shown.

## Files

- `beam-supports.js`: pure ES module (no DOM): the finite element beam solver, the optimizers, the sweeps, the
  influence lines, the verification routine, the classical checks and the input parsers. Imports only
  `../shared/presets.js` (material cards and section properties).
- `index.html`: the page. Thin glue: reads the inputs, calls the module, renders with `../shared/labkit.js`.
- `beam-supports.test.js`: Node tests (`node --test optimization/beam-supports/beam-supports.test.js` from the
  repository root, Node 22, no npm packages).
- `README.md`: this file.

## Model

- Euler-Bernoulli beam, linear elastic, small deflection, uniform flexural rigidity EI with E from the material card
  and I from `sectionProps` (round tube, solid rectangle, box, I-beam). E, I, c, A and EI are shown as derived values.
- Units: length mm, force N, moment N·mm, modulus and stress MPa (N/mm^2), EI in N·mm^2.
- Sign convention: x to the right, y up. Loads and reactions are positive upward, point couples positive
  counterclockwise, the bending moment is positive when sagging (tension at the bottom), the shear force is the sum of
  the upward forces to the left of the section (so V = dM/dx), the deflection is positive upward. A UDL (uniformly
  distributed load) of -2 N/mm is a 2 N/mm gravity-type load.
- Supports: any number of pins (v = 0) and clamps (v = 0, slope = 0) at arbitrary positions. Loads: point loads P at a,
  uniform loads w on [a, b], and point couples (solver only, not exposed in the page).
- Finite elements: 2-node Hermite cubic elements. Nodes are placed at both ends, at every support, at every load point
  and UDL end and at any requested extra node (the section x_s of Part B); each segment is then refined uniformly so that
  at least 120 elements span the beam. Breakpoints closer than a quarter of the target element length are merged
  (beam ends take precedence over supports, supports over load points) so that no badly scaled tiny element appears; a
  merged or moved support is reported as a warning. Loads keep their exact positions through consistent
  (work-equivalent) load vectors, including partial UDL coverage of an element.
- Why this is "exact": the Hermite cubic is the homogeneous solution of the Euler-Bernoulli equation, so with consistent
  load vectors the nodal displacements and rotations are exact. The reactions follow from the exact nodal solution, and
  the shear and moment diagrams are recovered by statics from the loads and the reactions, so they are exact as well.
  The peak |M| is found exactly (sample points plus the interior extremum of the quadratic moment inside distributed
  loads). The deflection between nodes is the Hermite cubic of the element (exact for point loads, interpolation error
  of order (h/L)^4 under a UDL); the peak |v| is the exact extremum of that interpolant.
- Linear algebra: symmetric banded Cholesky factorization (half bandwidth 3), supports imposed by row and column
  elimination. A layout with fewer than two effective constraints (two pins at different positions or one clamp) is a
  mechanism and returns an error object (`{ ok: false, error }`) instead of NaN; a non-positive pivot is reported as a
  singular stiffness matrix.
- Utilization screen: U_stress = |M| c / I times FS divided by the material allowable, U_defl = |v| / (L / ratio).
  "Feasible" means both are at most 1. These are educational indicators, not design checks.

## Algorithms

Part A, support placement (deterministic, no randomness):

- A1, symmetric overhang: two pins at a and L - a. The overhang a is swept over 400 values from 0 to 0.49 L; the peak
  |M| and the peak |v| are plotted against a. The best grid point of each curve is refined by golden-section search in
  its neighbouring interval (tolerance 1e-7 L), then the refined layout is re-solved and the value compared with the
  optimizer's value ("propose, then verify").
- A2, two independent supports: 60 by 60 grid of (a1, a2) on [0, L]^2, cells with a1 >= a2 masked as infeasible. The
  grid runs in time slices of about 30 ms with a progress bar and a Cancel button (a module Web Worker was not used
  because Chrome refuses module workers from `file://`, which the lab must support). The best cell starts a Nelder-Mead
  simplex search whose trial points are projected onto 0 <= a1 <= L - gap, a1 + gap <= a2 <= L with gap = 0.02 L.
  The result is verified by a fresh solve and marked on the heatmap together with the student's layout.
- A3, three supports: pins at 0, s and L; s swept over 400 values from 0.02 L to 0.98 L, refined and verified as in A1.
- Governing condition: at a minimax optimum the leading local peaks tie. The solver returns the ranked local peaks of
  |M| and |v| and the page reports the tie (for example hogging at both supports equal to the midspan sagging moment)
  or states that the optimum is a smooth minimum or lies on a bound when there is no tie (for example A3 at s = L/2).

Part B, influence lines: a load P (default -1 N, a unit downward load) moves over 200 positions on the chosen support
layout (the student's layout, the optimized layout, or a custom comma-separated list such as `0 clamp, 700 pin`), with
the other loads removed because an influence line is the response to the moving load alone. For the section x_s the
page plots M(x_s), V(x_s), v(x_s) and the reaction at a selected support versus the load position, marks the worst case
(largest |value|), refines it by golden-section search and confirms it by a fresh solve with the load at that position.
At a section that coincides with the load or a support the shear jumps; the plotted ordinate is the mean of the two
limits and the worst case is approached from one side.

## Verification and classical references

`verifyLayout(params, supports, { which, claimed })` rebuilds the model from the candidate support positions, solves it
with the plain solver, recomputes the utilizations and reports `matches` (fresh value equals the optimizer's value to
1e-9 relative) and `feasible`. Non-increasing support positions and mechanisms are rejected. The page shows the verified
values, never the optimizer's internal estimate.

Classical results reproduced by the tests and shown on the page as a table of fresh solves:

- Simply supported beam, full-span UDL: midspan moment w L^2 / 8, midspan deflection 5 w L^4 / (384 EI)
  (relative error about 1e-10).
- Cantilever with a tip load: tip deflection P L^3 / (3 EI), root moment -P L.
- Two equal spans (pins at 0, L/2, L) under a UDL: hogging moment over the middle support w L^2 / 32, reactions
  3/16, 10/16, 3/16 of w L, span sagging peak 9 w L^2 / 512.
- Propped cantilever under a UDL: reactions 5/8 and 3/8 of w L, clamp moment w L^2 / 8, sagging peak 9 w L^2 / 128
  at 5 L / 8 from the clamp.
- Two symmetric supports under a full-span UDL: the overhang a = (sqrt(2) - 1) / 2 L = 0.20711 L makes the hogging and
  sagging peaks equal, at (3 - 2 sqrt(2)) / 8 = 0.021447 w L^2 instead of 0.125 w L^2 with the supports at the ends, a
  reduction of 82.84 percent. The sweep reproduces a / L to 1e-8. The deflection optimum differs: the sweep finds
  a = 0.2231 L, where the midspan and both tip deflections are equal (peak |v| = 2.70e-4 w L^4 / EI, about 97.9 percent
  below 5 w L^4 / (384 EI)).
- Moment influence line at midspan of a simply supported beam: a triangle with peak L / 4 per unit load and ordinate
  L / 8 at the quarter points.

## Limitations

- Euler-Bernoulli kinematics only: no shear deformation, no large deflections, uniform EI, rigid supports without
  settlement, loads in one plane, no axial force.
- The stress and deflection utilizations are screening indicators with representative educational material cards; there
  is no lateral-torsional buckling, local buckling, bearing, fatigue or dynamic check, and no certified strength claim.
- The moving load of Part B is a single concentrated load; distributed moving loads and load trains are not covered.
- Self-weight is included only if it is put into w.
- Supports closer than a quarter of an element length (L / 480) are merged; point couples are supported by the solver
  but not exposed in the page.
- Independent of the Wing AeroStruct solver.
