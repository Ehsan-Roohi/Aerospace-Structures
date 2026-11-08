# pareto-nsga2: Multi-Objective Design, Pareto Fronts with NSGA-II

Module of the MIE 446 Optimization Lab (University of Massachusetts Amherst, Aerospace Structures).
Published at `optimization/pareto-nsga2/index.html` next to the Beam, Truss Lab and Wing AeroStruct teaching apps.
Version 0.1.1.

## Purpose

When mass and stiffness compete there is no single best design. This page computes the Pareto front of two small
structural problems with NSGA-II (Non-dominated Sorting Genetic Algorithm II, Deb, Pratap, Agarwal and Meyarivan,
IEEE Transactions on Evolutionary Computation 6, 2002), places the student's own design relative to that front, and
teaches three ideas: dominance, crowding distance and hypervolume.

## Scope and model

Units: length mm, force N, stress and modulus MPa, density g/cm^3, mass g (mass = volume_mm3 x rho / 1000).

Problem 1, beam section. Euler-Bernoulli beam, linear elastic, small deflection, prismatic section. Presets from the
shared `BEAM_PRESETS` ("printed-spar": PLA cantilever 600 mm with a 20 N tip load, "ss-udl": aluminium simply
supported beam 1000 mm with 2 N/mm). Editable span, load, material card, factor of safety FS and minimum thickness
t_min. Design variables by section family: solid rectangle (width b, depth h), circular tube (outer diameter D,
wall t), rectangular box (depth h, wall t, width b = 0.6 h). Objectives: minimize mass and minimize the maximum
deflection. Constraints: U_stress = sigma_max FS / sigma_allow <= 1, wall or minimum dimension >= t_min, and for
hollow sections an open bore (D > 2 t, or b > 2 t for the box; implemented as D >= 2 t (1 + 0.001)). Exact closed
forms are used:

- cantilever, point load at the tip: M = P L, v = P L^3 / (3 E I)
- cantilever, uniform load: M = w L^2 / 2, v = w L^4 / (8 E I)
- simply supported, midspan point load: M = P L / 4, v = P L^3 / (48 E I)
- simply supported, uniform load: M = w L^2 / 8, v = 5 w L^4 / (384 E I)

Sign convention: y up, loads act downward, the reported deflection is the magnitude.

Problem 2, Warren truss. The shared `TRUSS_PRESETS['warren']` (span 6000 mm, six panels, pinned left, roller right,
2000 N down at each interior bottom node, three load cases) solved with the 2D direct stiffness method: member force
N = (E A / L) du_axial, stress N / A, mass sum(A L rho) / 1000. Variables: chord area and diagonal area (bounds
50 to 1500 mm^2) and optionally the truss height h (300 to 2500 mm, moves all top chord nodes). Objectives: mass and
the downward deflection of the midspan bottom node (node 3). Constraints for every member: stress utilization
|N| FS / (A sigma_allow) <= 1 and, for compression members, the Euler screen |N| FS / P_cr <= 1 with
P_cr = pi^2 E I / (K L)^2, I = A^2 / 12 (solid square bar) and K = 1. A singular stiffness matrix (mechanism) is
reported as an unstable structure. Because the truss is statically determinate, the member forces do not depend on
the areas, only the deflections do.

Not claimed: no certified strengths, no local wall buckling of thin tubes and boxes, no shear deflection, no fatigue,
no dynamic or stability analysis. The Euler check is a screening indicator with an assumed effective length. The page
is independent of the Wing AeroStruct solver.

## Algorithm

Real-coded NSGA-II, deterministic through the seeded mulberry32 pseudo-random number generator (a copy of
`makeRng` from the shared kit lives in the module so the Web Worker does not depend on the plotting kit):

- population size N (default 60), generations G (default 120), seed (default 1);
- initial population uniform inside the variable bounds;
- fast non-dominated sorting with Deb's constraint-domination rule (feasible beats infeasible, smaller total
  violation wins among infeasible designs, dominance among feasible designs);
- crowding distance per front (extremes infinite, interior designs the normalized neighbour gap summed over the
  objectives);
- binary tournament selection with the crowded-comparison operator (feasibility, violation, rank, crowding);
- simulated binary crossover (SBX, Deb and Agrawal 1995) with eta_c = 15 and probability 0.9, polynomial mutation
  with eta_m = 20 and probability 1/n per variable, both bounded;
- elitist (mu + lambda) survival: parents and offspring pooled, sorted, the last front truncated by crowding.

Generic interface: `problem = { n, lower[], upper[], evaluate(x) -> { f: [f1, f2], g: [g1, ...] } }` with
g <= 0 feasible. `createNsga2(problem, options)` returns a stepwise optimizer (`step()`, `result()`), used by the
Web Worker (one progress message per generation, cancel supported) and by the main-thread fallback when module
workers are unavailable. Designs whose evaluation throws or returns NaN are treated as heavily infeasible, never as
NaN in the population.

Hypervolume (2-D, exact by a sorted staircase sweep): area dominated by the feasible first front inside the box
closed by the reference point. Reference point: 1.1 times the largest value of each objective over the feasible
members of the initial population (over all finite members when fewer than two are feasible; infeasible designs can
have absurd objective values, for example the deflection of a 2 mm x 2 mm spar). The curve is plotted per generation;
small dips are possible because the crowding truncation can drop an extreme design.

Reference fronts shown beside the NSGA-II front:

- closed-form front (beam problems): at fixed area the second moment of area grows with the outer dimension
  (rectangle I = A h^2 / 12, tube I = (A / 16)(D^2 + d^2)), so every Pareto optimal section has the outer dimension
  at its upper bound, except at the light end where the wall or width sits at its lower bound and only the outer
  dimension shrinks; the two boundary segments are closed by the stress constraint (bisection). The tests confirm,
  for all three families, that no point of a dense exact grid sweep dominates any closed-form point;
- exact reference sweep (2-variable problems, optional): exact evaluation on a grid (200 x 200 for the beam,
  70 x 70 for the truss) followed by the exact non-dominated subset.

Student analysis: the student's design is evaluated exactly, plotted in orange, classified as "non-dominated with
respect to the computed front" or "dominated by N front designs", given its normalized distance to the front
(objectives scaled by the front ranges) and two trade-off readings interpolated along the front: "same deflection,
lighter by X g" and "same mass, stiffer by Y mm". These readings are plot readings, not verified designs; the nearest
front design is selected automatically and shown verified.

## Verification (propose, then verify)

Every design displayed as feasible (each front design in the table, the selected design and the student's design)
is rebuilt from its design numbers and re-solved by `verifyDesign(spec, x)`:

- beam: closed forms recomputed and cross-checked against an independent 2-node Hermite cubic finite element model
  (16 elements, consistent loads, element end moments from element equilibrium); the badge "Verified by exact
  re-solve" requires agreement within 1e-6 and all constraints satisfied, otherwise a red badge states the reason;
- truss: the direct stiffness solve is repeated, global equilibrium (reactions against loads) is checked and all
  member utilizations are re-evaluated.

The governing constraint (largest utilization) and the active variable bounds are reported for each design, and the
quantitative gain against the student's design is given in grams, millimetres and percent.

## Files

- `pareto-nsga2.js`: pure ES module (no DOM): PRNG, dominance utilities, fast non-dominated sort, crowding
  distance, hypervolume, SBX, polynomial mutation, NSGA-II engine, ZDT1 benchmark, beam closed forms and finite
  element cross-check, truss direct stiffness solver with mechanism detection, verification routines, student
  classification and trade-off readings, closed-form and grid reference fronts, CSV rows.
- `pareto-nsga2.worker.js`: module Web Worker running NSGA-II with per-generation progress and cancel.
- `index.html`: the page (inputs left, results right: tiles, objective plane with click selection and dominance
  shading, convergence plot, verified design panels, front table, CSV download).
- `pareto-nsga2.test.js`: Node tests (`node --test optimization/pareto-nsga2/pareto-nsga2.test.js`).

## Tests

Fast non-dominated sort on a hand-made 6-point set; crowding distance extremes infinite; constraint-domination
prefers feasible designs; NSGA-II on ZDT1 (n = 10, 60 individuals, 150 generations, seed 1) reaches a mean distance
below 0.02 from f2 = 1 - sqrt(f1) and spans f1 from below 0.05 to above 0.9; 2-D hypervolume of {(1,2),(2,1)} with
reference (3,3) equals 3; beam closed forms for all four cases and three families; finite element cross-check; Warren
solver equilibrium, symmetry and method-of-sections forces (bottom chord 2-3 carries 8500 N, top chord 9-10 carries
9000 N compression); mechanism detection; verification rejects infeasible designs; classification and trade-off
readings; SBX children inside the bounds; determinism; readable errors for invalid inputs.

## Limitations

NSGA-II returns an approximation of the front that improves with generations and population size; for the beam
problems the closed-form front shows how close it is. Thin-wall sections that the stress constraint accepts may fail
by local buckling in reality; raise t_min to screen them out. The truss buckling check uses K = 1 and a solid square
bar for every member group marked `buckling: 'square'`. The grid reference sweep is only available for 2-variable
problems; with the truss height as a third variable only NSGA-II results are shown.

## References

- K. Deb, A. Pratap, S. Agarwal, T. Meyarivan, "A fast and elitist multiobjective genetic algorithm: NSGA-II",
  IEEE Transactions on Evolutionary Computation 6(2), 2002.
- K. Deb, R. B. Agrawal, "Simulated binary crossover for continuous search space", Complex Systems 9, 1995.
- E. Zitzler, L. Thiele, "Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto
  approach", IEEE Transactions on Evolutionary Computation 3(4), 1999 (hypervolume).
- E. Zitzler, K. Deb, L. Thiele, "Comparison of multiobjective evolutionary algorithms: empirical results",
  Evolutionary Computation 8(2), 2000 (ZDT test problems).
- J. M. Gere, S. P. Timoshenko, Mechanics of Materials (beam deflection formulas).
