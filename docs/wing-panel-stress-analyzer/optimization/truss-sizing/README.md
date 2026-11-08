# Truss Member Sizing: Fully Stressed and Gradient Methods

Module `truss-sizing` of the MIE 446 Optimization Lab. Browser page, pure ES modules, no dependencies.
Published at `.../wing-panel-stress-analyzer/optimization/truss-sizing/index.html`.

## Purpose

Students in the Wright Flyer half-wing truss project size bracing wires by hand from sensitivity
arguments. This page sizes every member of a 2D truss automatically under stress, buckling and
displacement constraints, shows which members were under-used, and contrasts the classical fully
stressed design (FSD) heuristic with a gradient-based method that uses analytical sensitivities.
Every design shown (the student's own, FSD, gradient, catalog) is re-solved from scratch with the
exact solver before it is displayed, and the badges come from that re-solve.

## Files

- `truss-sizing.js`: pure module, no DOM access. Model building, direct stiffness solver, sensitivities,
  FSD, sequential linear programming (SLP) with a dense simplex, catalog rounding, verification.
- `index.html`: the page. Thin glue: reads inputs, calls the module, draws with `../shared/labkit.js`.
- `truss-sizing.test.js`: Node tests (`node --test optimization/truss-sizing/truss-sizing.test.js` from the lab root).
- `README.md`: this file.

## Model (what is and is not claimed)

- Two-dimensional pin-jointed truss, linear elastic bars, small displacements, direct stiffness method.
  The reduced stiffness matrix is factored by a dense Cholesky decomposition; a non-positive pivot is
  reported as "unstable structure" (mechanism or insufficient supports), never as NaN.
- Units: length mm, force N, stress and modulus MPa, density g/cm^3, mass g (mass = sum(A L rho) / 1000).
  Sign convention: y up, loads positive upward, member force N positive in tension.
- Stress check: U_stress = |N| FS / (A sigma_allow), FS the factor of safety.
- Buckling screen (compression members of groups with `buckling: 'square'`): P_cr = pi^2 E I / (K L)^2 with
  I = A^2 / 12 (solid square section) and the effective length factor K from the inputs; U_buckle = |N| FS / P_cr.
  This is a screening indicator with an assumed effective length, not a stability analysis.
- Tension-only groups (bracing wires) in compression are flagged slack. The linear model is not valid for
  a slack wire; the page reports the fictitious compressive force and does not iterate a tension-only
  solution (shared-kit convention). Both optimizers send a design variable whose members are all slack to
  its minimum area, so that the optimizer cannot exploit the fictitious compressive stiffness.
- Displacement constraint: the vertical, horizontal or resultant displacement of one or more nodes
  (default: the free nodes farthest from the supports, that is nodes 4 and 9 of the Wright bay and node 3
  of the Warren truss) must not exceed a limit (default span/150 = 40 mm for both presets).
- Material cards are the shared educational values of `../shared/presets.js`, not certified allowables.
  No fatigue, joint stiffness, self-weight or geometric nonlinearity. Independent of the Wing AeroStruct solver.

## Design variables

One area per member group (default, students size by group) or one area per member ("size each member
individually"). Each group has a minimum area (defaults: spruce 100, aluminium 20, wire 0.5 mm^2) and a
catalog of stock sizes (defaults: wood 400 to 4000 mm^2, aluminium 100 to 800 mm^2, wire 1 to 12 mm^2).
The student's own design is always evaluated as entered; the optimizers start from it clamped to the minimum.

## Algorithms

### Fully stressed design

Resize every variable by the factor its most loaded member needs: A <- A * U_stress for stress and
A <- A * sqrt(U_buckle) for the buckling screen (P_cr grows with A^2), take the larger, clamp to the
minimum area, re-solve, repeat until max |U - 1| < 1e-3 over the variables that are not at their minimum,
or 50 iterations. Then at most 30 monotone "polish" steps (only increases) bring max U to 1 + 1e-7, and if
the displacement limit is violated all areas are scaled by one factor (member forces are unchanged by a
uniform scaling, displacements scale as 1/factor, so the limit is met to machine precision). The history
of mass and max U per iteration is returned and plotted.

A one-shot closed form is shown beside the iterated result: from the member forces of the student's design,
A = max(|N| FS / sigma_allow, sqrt(12 |N| FS (K L)^2 / (pi^2 E))). For a statically determinate truss the
forces do not depend on the areas, so the closed form, the iterated FSD and the gradient optimum coincide
whenever only stress and buckling constraints are active (Razani 1965). The degree of static indeterminacy
m + r - 2j is displayed (Warren: 0; Wright bay: 5).

### Gradient method: sequential linear programming

Sensitivities are analytical. Differentiating K u = F gives du/dA_j = -K^-1 (dK/dA_j) u, where
(dK/dA_j) u = sum over the variable's members of sigma_i b_i (b_i the member direction vector on its four
degrees of freedom); one back-substitution with the factored K per design variable (direct method), and
dN_i/dA_j = (E A / L)_i b_i . (du/dA_j)_e + [i in j] sigma_i. The displacement constraint uses the adjoint
method: lambda = K^-1 e_k (unit load at the constrained degree of freedom) and d(delta)/dA_j =
-lambda^T (dK/dA_j) u, one adjoint solve per constrained component. Tests compare both with central finite
differences on the Warren and the Wright presets, in group and member modes.

Each iteration linearizes the mass and all constraints in the reciprocal variables y = 1/A (member stress
is exactly linear in 1/A for a determinate truss, so this linearization is much more accurate than one in A),
restricts the step to a move-limit box (an area may shrink by at most 20 percent and grow by at most 100
percent per iteration) and solves the resulting linear program (LP) with a small dense two-phase simplex
method using Bland's rule (implemented in `simplexLP`, no external solver). The LP variables are the
normalized positions in the box, z in [0, 1]. A variable whose step changes sign has its shrink limit
halved (floor 1 percent) and recovers by a factor 1.5 after two steps in the same direction. If the LP has no
feasible point inside the box (typically a member with a near-zero force that is about to be loaded by a
force redistribution, which a first-order model cannot anticipate), the iteration falls back to one fully
stressed repair step. The loop stops when the relative mass change is below 1e-4 at a design within 0.1
percent of feasibility, or after 80 iterations (reported). The final design gets the same polish and
uniform scaling steps as the FSD and is then verified by a fresh solve.

I implemented the dense simplex route rather than the optimality criteria alternative.

### Catalog rounding

The lighter verified-feasible continuous optimum (FSD if neither is feasible) is rounded up, variable by
variable, to the nearest stock size of its group catalog, re-solved and verified; the mass penalty of
discreteness is reported in grams and percent. If no catalog size is large enough the largest is used and
the group is flagged with a red badge.

## Page

Inputs left (preset, load case, FS, buckling screen and K, displacement nodes, component and limit, sizing
mode, per-group area, minimum area and catalog), results right: summary tiles (mass before/after/percent,
max U, displacement versus limit, iterations, governing constraint), a comparison table of the four designs
with verification badges, notes (classical check, slack wires), the truss drawing (line width proportional
to sqrt(A) with a legend, colour by utilization: green U <= 0.9, amber 0.9 < U <= 1, red U > 1, slack wires
dashed grey, supports, scaled load arrows, deformed shape with a scale slider), grouped utilization profiles
(student versus design shown, reference line at U = 1), two iteration-history plots, the per-member table
(group, L, A before, A after, N, sigma, U_stress, U_buckle, governing) and a check of the shown design
against every load case of the preset. "Download CSV" exports the member table for all four designs, the
summary and the histories.

## Verification and tests

`verifyDesign(model, areas, opts)` rebuilds nothing from the optimizer: it solves the candidate areas with
the plain solver and returns feasibility (every non-slack U <= 1 + 1e-6 and displacement <= limit (1 + 1e-6),
the tolerance absorbs round-off only), utilizations, the governing constraint per member and overall, mass
and slack wires. The page shows only verified results.

Tests (13, about 0.2 s): two-bar truss against the closed form N = P / (2 sin theta) and the exact
deflection; FSD and gradient reach the exact optimum A = |N| FS / sigma_allow on the two-bar truss;
Wright bay equilibrium of reactions within 1e-8 relative; FSD on the Warren truss converges to U within
1e-3 of 1 for variables not at the minimum, in both modes, and equals the closed form; analytical dN/dA
and d(delta)/dA against central finite differences (1e-4 relative) on both presets and both modes, adjoint
versus direct method; displacement scaling meets the limit within 1e-6 relative; catalog rounding never
decreases an area and the rounded Warren design verifies feasible; gradient mass within 0.5 percent of
FSD on the Warren truss with both feasible; gradient beats FSD plus scaling under a tight displacement
limit; verification rejects an infeasible design; mechanism and invalid inputs return error objects;
simplex on known LPs; all-load-case check.

## Results reproduced

- Warren truss, default inputs (FS 1.5, buckling on, K 1): student design 19777 g violates the buckling
  screen (U = 2.65 in the top chord). Group sizing: FSD = SLP = 30075 g (chord 488.1 mm^2, diagonal 430.1 mm^2),
  identical because the truss is determinate. Member sizing: FSD = SLP = 12509 g.
- Wright bay, default inputs: student design 15490 g, max U 0.38. Group sizing: FSD = SLP = 5388 g
  (spar 935 mm^2 by buckling, strut at the 100 mm^2 minimum, wire 1.91 mm^2), 65 percent lighter.
  Member sizing: FSD = SLP = 3257 g.
- Tight displacement limit (Wright bay, 12 mm): FSD plus uniform scaling 9203 g (group) and 10692 g (member)
  against the gradient method 5652 g and 4591 g, which thickens the wires instead of everything.

## Limitations

- Single load case at a time; a design sized for one case is only checked, not sized, against the others
  (last table). The lift case leaves the landing wires slack and, in member mode, at their minimum area.
- Slack wires are reported, not removed. In group mode the two crossed wires of a bay share one area and the
  linear model splits the bay shear equally between the tensioned wire and the slack one, so the tensioned
  wire's force is under-estimated by up to a factor of two for that load case and the struts come out nearly
  unloaded. Member mode (slack wires at the minimum area) is closer to the physical load path.
- The SLP is a first-order method with move limits; it can stop at the iteration limit on badly scaled
  inputs, in which case the page says so and still shows the verified design it reached.
- Buckling is a screen for a solid square section only; no local or lateral stability, no joint design.

## References

- R. Razani, "Behavior of fully stressed design of structures and its relationship to minimum-weight design", AIAA Journal 3 (1965).
- L. A. Schmit, "Structural design by systematic synthesis", Proceedings of the 2nd ASCE Conference on Electronic Computation (1960).
- C. Fleury and V. Braibant, "Structural optimization: a new dual method using mixed variables", International Journal for Numerical Methods in Engineering 23 (1986).
- R. T. Haftka and Z. Gurdal, Elements of Structural Optimization, Kluwer (1992).
- U. Kirsch, Structural Optimization: Fundamentals and Applications, Springer (1993).
