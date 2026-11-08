# constrained-bo: Constrained Bayesian Optimization for Expensive Solves

Module of the MIE 446 Optimization Lab. Browser page plus a pure ES module, no dependencies, no build step.
Published at `.../wing-panel-stress-analyzer/optimization/constrained-bo/index.html`.

## Purpose

When one exact structural solve is expensive (for example the coupled aerodynamic and structural solve of a
whole wing), a grid search over the design variables is unaffordable. This page shows how a Gaussian process
(GP) surrogate plus a constrained expected-improvement acquisition function decides which design to solve next,
how the surrogate's uncertainty is displayed honestly, and why the recommendation is always a design that was
actually evaluated and then re-solved exactly, never a surrogate estimate. The demonstration solvers are cheap
closed forms so that every claim on the page can be checked against the exact answer.

## Files

- `constrained-bo.js`: pure ES module (no DOM). Gaussian process, acquisition functions, Latin hypercube
  sampling, Halton candidates, Nelder-Mead polishing, the optimizer loop, grid and random search, the two
  demonstration problems with exact solvers, reference optima, verification, and the campaign driver.
- `constrained-bo.worker.js`: module Web Worker that runs a campaign and posts progress after every exact
  evaluation; supports cancel.
- `index.html`: the page (thin glue: reads inputs, drives the worker, renders with `../shared/labkit.js`).
- `constrained-bo.test.js`: Node tests (`node --test optimization/constrained-bo/constrained-bo.test.js` from
  the lab root, Node 22, no npm packages).

## Scope and model statements

- Units: length mm, force N, stress and modulus MPa, density g/cm^3, mass g (mass = volume_mm3 x rho / 1000).
- Beam problem: Euler-Bernoulli beam, linear elastic, small deflection, four classical load cases with closed
  forms (see below). Objective mass; constraints g1 = U_stress - 1, g2 = U_defl - 1, g3 = t_min / t_section - 1,
  all required to be <= 0. Variables: solid rectangle b in 4..40 mm, h in 4..80 mm, or round tube D in 6..60 mm,
  t in 0.8..6 mm. For tubes a wall at or beyond the radius (2 t >= D) is treated as the solid-bar limit, so the
  requirement D > 2 t acts as a bound on t rather than as a constraint.
- Truss problem: 2-D linear elastic pin-jointed Warren truss from `TRUSS_PRESETS['warren']` (span 6000 mm,
  6 panels, pinned left, roller right, three load cases). Variables: chord area 50..1500 mm^2, diagonal area
  50..1500 mm^2, height h 300..2500 mm (all top-chord nodes move together). Constraints: maximum stress
  utilization - 1, maximum Euler buckling utilization - 1 over compression members (P_cr = pi^2 E I / (K L)^2
  with I = A^2 / 12 for a solid square and K = 1, a screening check with assumed effective length and shape),
  midspan deflection / (span / 250) - 1. A singular stiffness matrix (mechanism) is reported as "unstable
  structure" and counted as a large constraint violation (g = 1000).
- Material cards are the shared educational values in `../shared/presets.js`, not certified allowables.
  No stability, fatigue or certification claims. Independent of the Wing AeroStruct solver.
- The artificial solve delay (0..300 ms busy wait per exact solve) is a demonstration device that emulates an
  expensive solver. It changes no number.

## Algorithm

1. Inputs are scaled to the unit box; outputs are standardized (constant mean = sample mean).
2. Initial design: seeded Latin hypercube sample with 2n + 2 points (n design variables), solved exactly.
3. Surrogates: one GP for the objective and one for every constraint. Kernel Matern 5/2 with automatic
   relevance determination (one length scale per input) and a signal variance; diagonal nugget 1e-6 plus a
   noise term 1e-4 (standardized units); Cholesky factorization with jitter fallback. Hyperparameters maximize
   the log marginal likelihood on a deterministic grid: 5 length scales per dimension (0.1, 0.2, 0.4, 0.8, 1.6
   in unit-box units) and 5 signal variances (0.25 .. 4); full grid for n <= 2, coordinate-wise search (two
   sweeps from the grid centre) for n > 2. Refit after every evaluation.
4. Constraint GPs are fitted to the signed logarithm sign(g) ln(1 + |g|) of the constraint value. The
   transform is monotone and fixes zero, so P(T(g) <= 0) = P(g <= 0) exactly. It is needed because utilizations
   span orders of magnitude over the design box (small sections are violated by factors of 10 to 1000) and a
   stationary GP on the raw values is then dominated by the far-off region. Measured over seeds 1..8 with
   budget 30: mean gap of the verified result to the reference optimum 0.10 % (transform) versus 2.5 %
   (raw) for the rectangular beam, 0.09 % versus 19.6 % for the tube, 4.4 % versus 35 % for the truss.
   `createOptimizer(problem, { constraintTransform: 'none' })` switches it off.
5. Acquisition: constrained expected improvement (Gardner et al. 2014), EI(x) times the product over the
   constraints of P(g_j(x) <= 0). EI is measured against the best feasible observed objective. While no
   feasible design has been observed the probability of feasibility alone is maximized.
6. Acquisition maximization: 400 Halton candidates (bases 2, 3, 5, ..., shifted modulo 1 by the seeded
   generator on every iteration), then Nelder-Mead polishing from the best 3 candidates with trial points
   clamped to the box. A pick that would duplicate an evaluated design, or an acquisition that underflows to
   zero everywhere, falls back to the candidate where the objective GP is least certain (pure exploration).
7. Budget: total number of exact evaluations (default 30). Every evaluation is one call of the exact solver.
8. Recommendation: the best evaluated feasible design, re-solved from scratch and re-checked against all
   constraints by `verifyDesign` (page badge "Checked by fresh model solve"). The surrogate's own prediction at
   that design is displayed beside it with its +-2 sigma range only so that students can judge the surrogate.

Randomness: everything uses the seeded mulberry32 generator (same generator as `labkit.makeRng`); results are
identical for the same seed and settings.

## Same budget cap comparison and references

- Uniform grid with the same budget B: floor(sqrt(B))^2 points for two variables, floor(B^(1/3))^3 for three,
  bounds inclusive (`gridSide`, `gridPoints`).
- Random search: B uniform draws with the same seed.
- Reference optimum (computed outside the budget with the cheap exact solver, then re-solved):
  - beam: 1-D scan over the free variable (h for rectangles, D for tubes) with bisection on the other (b or t),
    valid because every constraint and the mass are monotone in that variable at fixed h or D;
  - rectangle only: classical closed form. Mass = rho L b h with b h^2 >= 6 M FS / sigma_allow and
    b h^3 >= 12 vCoef k / (E L); trading width for depth at constant b h^2 always lowers the mass, so the
    optimum has b at its lower bound (then h is the smallest depth satisfying every constraint) or h at its
    upper bound (then b is the smallest width);
  - truss: 1-D scan over h. The Warren truss is statically determinate (23 members + 3 reactions = 26 degrees
    of freedom), so member forces do not depend on the areas; stress and buckling give minimum areas per group
    directly, and the deflection constraint v = C_c / A_c + C_d / A_d <= v_lim is solved in closed form with a
    Lagrange multiplier and clamped to the bounds.
- The page plots "best verified feasible mass so far versus exact evaluations" for all three methods with the
  reference as a horizontal line.

## Honesty panel

- Heatmap of the GP posterior mean of the mass with white contours of the GP's probability of feasibility at
  0.5 (dashed) and 0.95 (solid), evaluated designs (green circles feasible, red crosses infeasible), the
  student's design (purple square) and the verified recommendation (orange star). Optional overlay of the
  exact feasibility boundary (dotted), affordable only because the demonstration solver is cheap.
- Heatmap of the GP posterior standard deviation (where the surrogate is guessing).
- 1-D slice through the recommendation along a chosen variable: GP mean with a shaded +-2 sigma band and the
  exact mass sampled on the slice (green where feasible, red dotted where infeasible), labelled "for teaching".
- For the three-variable truss the two heatmaps are slices over the two areas at the recommended height.

## Closed forms used by the beam solver

- Cantilever, tip load: M = P L, v = P L^3 / (3 E I)
- Cantilever, uniform load: M = w L^2 / 2, v = w L^4 / (8 E I)
- Simply supported, midspan load: M = P L / 4, v = P L^3 / (48 E I)
- Simply supported, uniform load: M = w L^2 / 8, v = 5 w L^4 / (384 E I)

Utilizations: U_stress = |sigma_max| FS / sigma_allow with sigma_max = M c / I; U_defl = |v_max| / (L / k);
U_thickness = t_min / t_section. Sign convention: y up, loads positive upward, moment positive sagging;
the page reports magnitudes.

## Adapter interface for other apps

```js
import { optimize } from './constrained-bo.js';
const result = optimize({
  n: 2, lower: [4, 4], upper: [40, 80],
  evaluate: x => ({ f: mass(x), g: [uStress(x) - 1, uDefl(x) - 1] }),   // pure, synchronous; feasible when all g <= 0
  budget: 30, seed: 1,
}, progress => console.log(progress.k, progress.total, progress.record.f, progress.best));
// result.history (one record per exact evaluation: x, f, g, feasible, phase, GP prediction before the solve,
// best feasible so far), result.best (best evaluated feasible record or null), result.models (final GPs).
```

`createOptimizer(problem, options)` returns a stepper (`step()`, `done`, `best`, `result()`) for callers that
want to interleave progress reporting or cancellation. `predictAt(result, x)` evaluates the final GPs at a
design. `verifyDesign(problem, x)` re-solves a design and re-checks all constraints.

Worker protocol (`constrained-bo.worker.js`): post `{ type: 'run', spec, budget, seed, delayMs, compare, gridN }`
and receive `{ type: 'progress', method, k, total, overall, overallTotal, record, bestF, elapsedMs }` after every
exact evaluation, then `{ type: 'done', payload }` (BO result, grid and random results, reference optimum,
closed form, exact grid for the teaching overlay) or `{ type: 'cancelled' }` after `{ type: 'cancel' }`, or
`{ type: 'error', message }`. Another app (for example Wing AeroStruct) plugs in an expensive solver by giving
`makeProblem` its own problem description with a pure synchronous `evaluate`; the worker keeps the main thread
free and the page falls back to chunked execution on the main thread when module workers are unavailable.

## Verification routine

`verifyDesign(problem, x)` rebuilds the design from its numbers, solves it from scratch with the plain exact
solver and checks every constraint (tolerance 1e-9) and the variable bounds. It returns
`{ feasible, mass, utilizations, governing, constraints, reason }`. The page shows this verified result for the
recommendation, the student's design, the grid and random bests, and the reference optimum.

## Tests

`node --test optimization/constrained-bo/constrained-bo.test.js` (26 tests, about 1 s): Cholesky versus a
direct inverse; GP interpolation (nugget 1e-8, noise free) with posterior sd below 1e-3 at training points;
GP on sin(3x) with 12 points, RMSE below 0.05 on 50 test points; EI versus numerical integration within 1e-6;
constrained EI below 1e-6 where the feasibility probability is below 1e-6; LHS stratification; the
Gardner-type analytic problem (minimize x + y subject to 1.5 - x - 2y + 0.5 sin(2 pi (x^2 - 2y)) <= 0) with
budget 40 and seed 1 within 0.05 of a 200 x 200 grid; beam BO at budget 30 no worse than the same budget cap
grid and within 1 % of the closed form; exactly `budget` evaluations and determinism; beam solver versus the
closed forms; truss solver versus the method of sections (top chord -9000 N, bottom chord +8500 N, end
diagonal -5590.17 N, reactions 5000 N); static determinacy; mechanism detection; verification rejecting an
infeasible design; readable errors for invalid inputs.

## Limitations

- Two and three design variables in the demonstration (the engine accepts up to ten).
- The hyperparameter search is a coarse grid by design; the acquisition maximizer is a heuristic and can miss
  a narrow peak. Different seeds give different paths; the same seed always gives the same result.
- The truss buckling check is a screen (assumed solid square section, K = 1); the beam is a one-dimensional
  Euler-Bernoulli model with four load cases only; material values are educational cards.
- The reference optima rely on monotonicity (beam) and static determinacy (truss) of these specific problems;
  they are re-solved exactly before display but would not transfer to other topologies without review.

## References

- Jones, Schonlau and Welch (1998), Efficient global optimization of expensive black-box functions, Journal of
  Global Optimization 13, 455-492.
- Gardner, Kusner, Xu, Weinberger and Cunningham (2014), Bayesian optimization with inequality constraints,
  Proceedings of ICML 31.
- Rasmussen and Williams (2006), Gaussian Processes for Machine Learning, MIT Press.
- McKay, Beckman and Conover (1979), A comparison of three methods for selecting values of input variables in
  the analysis of output from a computer code, Technometrics 21, 239-245.
- Halton (1960), On the efficiency of certain quasi-random sequences of points, Numerische Mathematik 2, 84-90.
- Nelder and Mead (1965), A simplex method for function minimization, The Computer Journal 7, 308-313.
- Beam deflection formulas and truss analysis: Gere and Goodno, Mechanics of Materials; Hibbeler, Structural Analysis.
