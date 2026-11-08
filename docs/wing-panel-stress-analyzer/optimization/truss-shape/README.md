# truss-shape: Truss Shape Optimization, Moving the Nodes

Module of the MIE 446 Optimization Lab (version 0.1.1). Published next to the Beam, Truss Lab and Wing AeroStruct
teaching apps at `.../wing-panel-stress-analyzer/optimization/truss-shape/index.html`.

## Purpose

Students usually take the geometry of a truss as given and size the members. This page turns the node positions into
design variables, sizes the members inside every geometry evaluation, and shows how two deterministic optimizers walk
through geometry space. The classical study is the mass of a Warren truss as a function of its height, which has an
interior optimum because taller trusses carry smaller chord forces but need longer diagonals, and long compression
diagonals buckle more easily.

## Files

- `truss-shape.js`: pure ES module (no DOM access). Exact solver, inner sizing, parametrizations, Nelder-Mead, CMA-ES,
  the 1-D sweep, the verification routine, input validation and the campaign driver shared by the worker and the page.
  Imports `../shared/presets.js` (data) and `makeRng` from `../shared/labkit.js`.
- `truss-shape.worker.js`: module Web Worker that runs the campaign and streams progress; honours a cancel message.
- `index.html`: the page (inputs left, results right). If the module worker cannot start (for example an environment
  that blocks module workers), the same campaign runs on the main thread in short chunks with the same progress bar.
- `truss-shape.test.js`: `node --test optimization/truss-shape/truss-shape.test.js` from `/home/claude/optlab`.

## Model

Plane pin-jointed truss, linear elastic, small displacements, direct stiffness method (Gaussian elimination with
partial pivoting; a pivot below 1e-12 times the largest diagonal entry, or a residual above 1e-6 relative, is reported
as "unstable structure (mechanism)" instead of NaN). Member force N = (E A / L) times the elongation along the axis,
stress N / A. Units: mm, N, MPa, g/cm^3, g; mass = sum(A L) rho / 1000.

Utilization U (demand over capacity, feasible when U <= 1):
- tension: U = |N| FS / (A sigma_allow);
- compression: U = max(stress utilization, |N| FS / P_cr) with the Euler load P_cr = pi^2 E I / (K L)^2 and I = A^2 / 12
  for groups with buckling 'square' (solid square bar); K is the effective length factor entered on the page. This is a
  screening indicator, labelled "screen" on the page; groups with buckling 'none' use the stress check only. The screen
  can be switched off to study a stress-only design.
- tension-only groups (bracing wires): a wire that comes out in compression is flagged slack. By default the page uses a
  tension-only iteration: slack wires are released (no stiffness, zero force), the structure is re-solved, and a released
  wire whose elongation would put it back in tension is re-activated; this settles in one or two passes for crossed-wire
  bays. A singular, cycling or unconverged active set is now withheld; no compressed wire is kept for stability.
  This refusal is not a proof that no geometrically nonlinear equilibrium exists. The alternative linear model is
  retained only for numerical comparison; any compressed wire prevents physical design admission.

Presets come from `../shared/presets.js`: the 6-panel Warren truss (aluminium 6061, span 6000 mm, height 1000 mm,
2000 N at each interior bottom node) and the Wright Flyer type half-wing truss (spruce spars and struts, steel bracing
wires, 4 bays of 1500 mm, gap 1850 mm). All load cases of the presets are available.

## Inner sizing (fully stressed design)

For a candidate geometry the areas start from the preset values (at least A_min) and every sizing unit, a group or a
single member depending on the toggle, is updated with

    A <- max(A_min, A * max(U_stress, sqrt(U_buckle)))

until every unit has |U - 1| < 1e-3 (units sitting at A_min may have U < 1) or 40 iterations are done. The square root
appears because the Euler load of a solid square section grows with A^2. A final uniform scaling by
s = max over members of max(U_stress, sqrt(U_buckle)) makes every U <= 1 exactly (to rounding): uniform scaling keeps the
force distribution in determinate and indeterminate trusses, so stress utilizations scale as 1/s and Euler utilizations
as 1/s^2. An optional displacement limit at one node is then met by uniform scaling of all areas (displacements scale
exactly as 1/A, so the limit is hit to rounding). The mass of this sized design is the outer objective. A mechanism or
coincident nodes return the finite penalty 1e9 g. With "wires must stay taut" on, the objective is multiplied by
(1 + sum of the linear compression in slack wires / total applied load), a continuous penalty.

The fully stressed design is the exact minimum-mass solution of a statically determinate truss (the Warren preset) and a
close feasible design for indeterminate ones (the Wright bay); uniform scaling for the displacement limit is simple but
not mass-optimal.

## Design variables

Warren truss: (a) one common height h of all top-chord nodes, bounds 300 to 2500 mm (default); (b) individual heights y
of the top-chord nodes, mirrored pairs linked when "symmetry" is on (3 or 6 variables); (c) horizontal positions x of the
top-chord nodes inside their panels, a margin from the panel ends keeps members from degenerating (3 or 6 variables).
(a) and (b) are alternatives; (c) can be combined with either.
Wright bay: (a) the gap g between lower and upper spar (y of all upper nodes), bounds 1000 to 2600 mm (default); (b) the x
positions of the three interior strut stations, kept ordered with a minimum spacing (default 600 mm) by a sort-and-push
repair inside the mapping; (a) and (b) can be combined. Loads stay attached to their nodes, so moving a station moves its
lift point (total lift unchanged); this is stated on the page.
Bounds and start values can be typed on the page. The derived geometry layout (rows, panels, mirror pairs, stations) is
computed from the preset coordinates, not hard-coded.

## Outer optimizers (implemented from scratch, deterministic)

Both work on normalized variables z in [0, 1]^n and clamp every trial point into the box.

Nelder-Mead simplex with the adaptive parameters of Gao and Han (2012): reflection 1, expansion 1 + 2/n, contraction
0.75 - 1/(2n), shrink 1 - 1/n (equal to the classical values for n = 2). Initial simplex steps of 10 percent of the
variable range. Convergence when the simplex size is below 1e-6 (normalized) and the function spread is below 1e-9
relative, or after 400 + 200 n evaluations. Optional restarts (0 to 3) rebuild the simplex around the best point perturbed
by up to 2 percent of the range with halved steps; the perturbation uses the seeded generator, so runs are repeatable.

CMA-ES, (mu/mu_w, lambda) form following Hansen's tutorial: lambda = 4 + floor(3 ln n), mu = lambda/2, logarithmic
recombination weights, cumulative step-size adaptation, rank-one and rank-mu covariance updates, Jacobi
eigen-decomposition every generation, initial step 0.3 of the range, default 60 generations. Samples outside the box are
evaluated at the clamped point with a quadratic distance penalty added to the fitness used for ranking; the incumbent
reported is always an actually evaluated, clamped point. Gaussian samples come from Box-Muller on the lab's mulberry32
generator (`makeRng`), so a seed reproduces a run exactly. The test suite checks the implementation against a literal
transliteration of Hansen's `purecmaes.m` driven by the same random stream (identical to rounding).

Both optimizers are exposed as steppers (one iteration or generation per `step()`), which is what lets the worker yield
between steps, stream the incumbent geometry and honour Cancel. The page records every improvement of the incumbent
(geometry, areas, utilizations) and replays them with a slider or a Play button.

## Verification ("propose, then verify")

`verifyDesign(problem, nodes, areas, { dispLimit, slackMode })` rebuilds the model from the candidate numbers, solves it
again with the exact solver (including the tension-only iteration when wires are present) and re-checks every
utilization (U <= 1 + 1e-6), the displacement limit and the slack flags. The page shows this verified result in the KPI
tiles, the comparison table and the member table, with the badge "Checked by fresh model solve", or a red badge with the
reason when the check fails. Nelder-Mead and CMA-ES results are both verified; the lighter verified design is shown.

## Classical results reproduced (defaults: FS 1.5, K 1, group sizing, A_min 10 mm^2)

- Warren truss, buckling screen on: the 80-sample sweep has its minimum at h = 634 mm (26878 g); Nelder-Mead finds
  h = 635.9 mm (26878.0 g) in 52 evaluations and CMA-ES the same point in 241 evaluations. The ratio h/L = 0.106; the
  diagonals make 51.7 degrees with the chord. The sized start geometry (h = 1000 mm) weighs 30075 g, so the optimum
  saves 10.6 percent. At the optimum the chord material (18203 g) is about twice the web material (8675 g).
- Warren truss, buckling screen off (stress-only): optimum at h = 1386 mm, h/L = 0.231, 2427 g, with chord 1048 g and
  diagonals 1379 g, inside the classical 0.15 to 0.25 range for stress-governed parallel-chord trusses and with chord and
  web material of the same order (the exact equal-split rule assumes a fixed diagonal angle while the panel count varies,
  not a fixed panel count as here).
- The page states plainly that the buckling-governed optimum of this 6-panel preset sits below the 0.15 to 0.25 range:
  with a solid square section the compression diagonals dominate (A proportional to L sqrt(N)), the panel length is
  fixed, and the optimum height follows the diagonal angle (about 45 to 60 degrees) rather than the span.
- Individual member sizing lowers all masses (Warren optimum 11502 g at h = 690 mm) because tension and lightly loaded
  members are no longer forced to the group area.
- Wright bay, gap sweep with the tension-only model: interior optimum near g = 1260 mm (8717 g) with group sizing;
  the strut compressions at the start geometry are 1320, 820, 390 and 100 N, equal to the bay shears minus the lift at
  the strut's own node, as hand statics predicts. With gap and strut stations free and individual sizing the optimizers
  reach 2780 g against 3895 g for the sized start (the gap goes to its 1000 mm lower bound).

## Tests

19 tests, about 0.3 s: two-bar truss N = P / (2 sin theta); single-bar extension P L / (E A) and reactions; Euler screen
formula and K; mechanisms, coincident nodes, NaN input and bad areas reported as errors; tension-only release on the
Wright bay (strut forces, released wires at zero force, refusal of artificial stabilization in the landing case); nested objective finite
and feasible after sizing; U <= 1 after polish on the indeterminate Wright bay; mechanism geometry gives the finite
penalty; displacement limit met within 1e-6 relative; symmetry linking; ordered strut stations; Nelder-Mead on
Rosenbrock from (-1.2, 1) within 1e-4 of (1, 1); Nelder-Mead bound handling; CMA-ES on a 4-D sphere below 1e-6 within
500 evaluations with the seeded generator, determinism, and agreement with the reference transliteration; Jacobi
eigen-decomposition; sweep versus Nelder-Mead versus CMA-ES agreement within 3 percent (actually within 0.001 percent);
verification accepts the optimum and rejects a shrunken design; campaign messages and cancellation.

Note on the CMA-ES budget: the standard algorithm needs 310 to 490 evaluations (depending on the seed) for six decades on
the 4-D sphere, so the test asserts 500 evaluations rather than weakening the algorithm or picking a lucky seed.

## Limitations

Pin joints only, no joint bending, no self-weight, one load case at a time, no fatigue, no local or lateral-torsional
buckling, no connection design. The Euler check is a screening estimate with an assumed effective length. Uniform scaling
for the displacement limit is not mass-optimal. Loads move with the strut stations. Released wires are treated as absent;
a bay whose two wires would both go slack keeps the less compressed wire active. The fully stressed design is only an
exact minimum for determinate trusses. Nelder-Mead with clamping can collapse against a bound, which the restarts
mitigate but do not exclude; CMA-ES is stochastic in nature but reproducible through the seed. The browser must allow ES
modules from the page's origin (static hosting or a local server; Chrome blocks module scripts and module workers on
file:// URLs, Firefox allows the scripts). No certified strengths or safety statements are made; the material cards are
educational values.

## References

J. A. Nelder and R. Mead, A simplex method for function minimization, Computer Journal 7 (1965) 308 to 313.
F. Gao and L. Han, Implementing the Nelder-Mead simplex algorithm with adaptive parameters, Computational Optimization and
Applications 51 (2012) 259 to 277.
N. Hansen, The CMA Evolution Strategy: A Tutorial, arXiv:1604.00772 (2016), and purecmaes.m.
R. T. Haftka and Z. Gürdal, Elements of Structural Optimization, 3rd edition, Kluwer (1992), fully stressed design.
E. H. Gaylord, C. N. Gaylord and J. E. Stallmeyer, Structural Engineering Handbook, McGraw-Hill, truss proportions.
