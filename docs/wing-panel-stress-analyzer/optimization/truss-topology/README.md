# Ground-Structure Topology Optimization (truss-topology 0.1.1)

Module of the MIE 446 Optimization Lab. Browser page, dependency free, pure ES modules, runs from a static folder.

## Scope

Instead of sizing a truss the student drew, the computer starts from a dense ground structure of candidate
pin-jointed bars on a rectangular grid and lets two deterministic optimizers decide which bars should exist.
The Michell-like layouts that emerge show where material wants to be. The page shows the student's own design
point (every candidate at the reference area), the two optimized layouts, the governing constraint of each, the
quantitative gain in grams and percent, and the classical identity that ties the two methods together.

Model: 2D linear elastic truss (direct stiffness method), one static load case, continuous member areas, no self
weight. Units: mm, N, MPa, g/cm^3, mass in g (mass = sum A L rho / 1000), compliance in N mm.

Not claimed: buckling (the Euler column is a screening indicator with an assumed solid square section and K = 1),
joint or connection design, fatigue, dynamic loads, certified allowables. Independent of the Wing AeroStruct solver.

## Files

- `truss-topology.js`: pure module (no DOM): ground structure generator, direct stiffness solver with mechanism
  analysis, optimality criteria optimizer, dense two-phase simplex, plastic design LP, thresholding, verification,
  the full pipeline (`runAll`, `runAllAsync`, generator `runAllSteps`) and CSV rows.
- `truss-topology.worker.js`: module Web Worker that runs the pipeline and posts progress.
- `index.html`: the page (inputs left, results right, worker with a chunked main-thread fallback, Cancel button).
- `truss-topology.test.js`: `node --test` suite.

## Inputs

Design domain W x H (mm, default 3000 x 1500), node grid nx x ny (default 7 x 4, allowed 3..10 x 2..6),
connectivity level r = 1, 2 or 3 (node pairs whose grid index differences are both at most r; a pair whose offsets
have a common divisor passes exactly through an intermediate grid node and is skipped), support preset
(cantilever: left column pinned; simply supported: bottom-left pin and bottom-right roller; MBB half beam: left
column rollers that fix x, bottom-right pin), load magnitude and direction at a chosen grid node (defaults: right
column mid-height for the cantilever, bottom midspan for the simply supported beam, top-left for the MBB half
beam; 10 kN downward), material card from the shared presets (default aluminium 6061-T6), allowable stresses in
tension and compression (default both the card allowable), reference area A_ref (the student's uniform trial,
default 20 mm^2), OC volume fraction (default 0.2 of the ground-structure volume at A_ref), minimum area floor
(default 1e-4 A_ref), display threshold theta (default 0.02 of the largest optimized area).

## Algorithms

Optimality criteria (OC) for minimum compliance at fixed volume. Start from uniform areas that meet the
volume budget exactly. Each iteration: solve the elastic problem, compute dC/dA_i = -N_i^2 L_i / (E A_i^2),
update A_i <- A_i (B_i)^0.5 with B_i = -dC/dA_i / (lambda L_i), clamp to a 20 percent move limit and to the
floor and ceiling (no bar may hold more than the whole budget), and find lambda by bisection so that the volume
equals the budget to machine precision. A safeguard halves the move limit if a step would raise the compliance
(the OC step is a first-order descent direction, so a small enough move always decreases compliance); it was not
triggered in the test cases. Stop when the largest area change divided by the largest area is below 1e-3 or
after 200 iterations (both adjustable). The compliance history is recorded for the convergence plot.

Minimum-volume plastic design (Dorn, Gomory and Greenberg 1964) as a linear program. Variables t_i >= 0 and
c_i >= 0 (tension and compression force magnitudes), equilibrium B (t - c) = f at every free degree of freedom,
objective sum L_i (t_i / sigma_t + c_i / sigma_c); areas follow as A_i = t_i / sigma_t + c_i / sigma_c.
The dense two-phase simplex scales rows and the right-hand side, uses artificial variables in phase 1, removes
redundant rows, refactors the tableau from the original data every 250 pivots and before declaring optimality,
and recomputes the final basic solution from the original equations. Pivot rules: Bland's rule is implemented
(entering: first negative reduced cost; leaving: minimum ratio, smallest basis index on ties) and is available
as an option and as the anti-cycling fallback. The default rule is Dantzig's most negative reduced cost with a
lexicographic ratio test (ties broken by comparing the basis-inverse columns), which is also finite in exact
arithmetic. Reason for the default: every unloaded free degree of freedom gives a zero right-hand side, so phase
1 is massively degenerate; pure Bland's rule performed 20,000 zero-step pivots without progress on a 10 x 6 grid
and reached the optimum in 12,293 pivots (1.5 s) only after the refactorization safeguard was added, while the
default rule needs a few hundred pivots (under 0.2 s for 574 candidate bars, 1148 variables, 108 constraints).
Status returned: optimal, infeasible, unbounded or maxiter.

## Verification (propose, then verify)

Bars below theta times the largest optimized area are dropped. A dangling bar at an unloaded, unsupported node
is removed (it carries no force); two collinear bars meeting at an unloaded, unsupported two-bar node are merged
into one continuous bar (length-weighted mean area), because that joint would be a hinge in a straight bar.
The remaining layout is re-solved from scratch with the direct stiffness method: member forces, stresses,
utilization U = |sigma| / allowable, number of bars at U >= 0.98, mass, compliance, equilibrium residual and the
check that f . u equals the strain energy sum N^2 L / (E A).

Mechanisms. If the stiffness matrix is singular, the page reports "the thresholded layout is kinematically
unstable, lower the threshold" and automatically retries with theta / 2, theta / 4, ... down to 0, reporting the
threshold actually used. The zero-stiffness modes are computed with a Jacobi eigen-decomposition. If the load is
orthogonal to every mode (the usual case for a plastic design: a roller hanging on a single vertical bar needs no
horizontal reaction), the member forces are unique, are computed on the range space and reported, the mode is
drawn in purple, and the layout is flagged as a mechanism that needs bracing; it is never shown as feasible.
If the load excites a mode the layout cannot carry it and the error is reported as such.

Scaling. Because scaling all areas by one factor does not change the force distribution of a linear truss, the
baseline and the OC layout are also re-solved with areas multiplied by their maximum utilization, which gives
exactly feasible designs ("mass at the allowable") that can be compared with the LP minimum volume.

Badges: OC gets "Checked by fresh model solve, volume budget met" plus a stress badge (OC does not enforce stress,
so U above 1 is a warning, not a failure of the OC problem); LP gets "Checked by fresh model solve, fully
stressed" when U_max = 1 within 1e-6, a red badge otherwise.

## Classical results shown

- Michell identity. For one load case with equal allowables the minimum-compliance and the minimum-volume
  problems share the same layout, and C V E = (sigma V_LP)^2 for the optimal layout at any volume. The page
  shows this product for the OC layout (it cannot drop below 1; the default cantilever gives 1.001) and for the
  LP layout (1.000 when fully stressed).
- Fully stressed condition at the OC optimum: interior bars share |sigma| = sqrt(lambda E); the page prints this
  target stress and the actual stress range of the kept bars so students see how far the layout has converged.
- The LP volume is a lower bound: the OC layout and the uniform baseline scaled to the allowable always weigh at
  least as much as the LP design (checked in the tests).
- Nested candidate sets: the LP volume does not increase when r grows (tested on a 5 x 3 grid).

Default cantilever (7 x 4, r = 2, 10 kN, Al 6061-T6, both allowables 276 MPa): 135 candidates, 48 free dofs;
baseline at A_ref = 20 mm^2 reaches U = 1.75; OC converges in 92 iterations to C = 402981 N mm at V_t =
433319 mm^3 with 22 kept bars; LP optimum V = 397283 mm^3 (1073 g) after 125 pivots, 22 kept bars, all fully
stressed; mass saved versus the uniform baseline sized to the allowable: 9162 g (89.5 percent).

## Tests

`node --test optimization/truss-topology/truss-topology.test.js` (14 tests, about 0.3 s): connectivity counts and
collinear skipping; B N = f for a solved truss plus strain-energy and reaction checks; two-bar closed form;
textbook LP (12 at (4, 0)) with every pivot rule; infeasible, unbounded and redundant systems; Beale's cycling
example with Bland's rule; three-node ground structure returning the analytic two-bar volume with unequal
allowables, and a single direct bar when it is cheaper; LP volume monotone in r; OC monotone compliance and
volume constraint within 1e-6 at every iteration; thresholding plus exact re-solve with finite stresses, the
Michell identity and the lower-bound property; mechanism detection (error object with moving nodes) and the
range-space solve for a roller on a single bar; verification rejecting an infeasible design and accepting the
scaled one; invalid inputs reported as messages; all three presets end to end.

## Limitations

- Single load case; multiple load cases, self weight and buckling constraints are not in the LP or the OC.
- Candidate bars may cross without a joint; a buildable structure needs a decision at each crossing.
- The OC stops at a loose tolerance by default (1e-3), so slowly vanishing thin bars can remain above the display
  threshold; tighten the tolerance under advanced settings to sharpen the layout.
- Plastic designs can be mechanisms (equilibrium only). The page reports them honestly rather than adding bracing.
- Grids are limited to 10 x 6 nodes and r <= 3 (574 candidates) to keep the dense simplex fast in a browser.

## References

- A. G. M. Michell, The limits of economy of material in frame-structures, Philosophical Magazine 8 (1904) 589-597.
- W. S. Dorn, R. E. Gomory, H. J. Greenberg, Automatic design of optimal structures, Journal de Mecanique 3 (1964) 25-52.
- W. S. Hemp, Optimum Structures, Clarendon Press, Oxford, 1973.
- M. P. Bendsoe, O. Sigmund, Topology Optimization: Theory, Methods and Applications, Springer, 2003.
- R. G. Bland, New finite pivoting rules for the simplex method, Mathematics of Operations Research 2 (1977) 103-107.
