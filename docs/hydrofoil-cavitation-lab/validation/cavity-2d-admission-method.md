# Equilibrium cavity admission diagnostic — 0.3.2

The BEM equations, boundary conditions, iteration controls and tolerances are unchanged. A separate `physicalAdmissibility` report now distinguishes numerical convergence from an equilibrium-model consistency screen.

On each panel still labelled wetted, the pressure must satisfy

\[
C_p+\sigma=\frac{p-p_v}{\tfrac12\rho U_\infty^2}\ge0.
\]

Every wetted centroid is checked. Cavity BC panels are excluded. Negative pressures are retained; no cavity is moved and no pressure floor is imposed. The allowance of `64 * Number.EPSILON * pressureScale` covers roundoff only, not a discretisation error budget.

The report contains `screenPassed`, `numericalConverged`, `geometryValid`, `wettedPressurePass`, `minimumWettedCp`, `minimumWettedPressureMargin`, the minimum's panel and coordinates, and the number of violating wetted panels. A failed screen must be shown as a numerical trial, not as an accepted equilibrium-cavity prediction. Passing it does not establish mesh independence, physical uniqueness, experimental agreement, or metastable-liquid inception.

For the default NACA 0012, α = 4°, detachment x/c = 0.01 and cavity length l/c = 0.4, production pressure margins remain negative under refinement: −0.0764, −0.0732, −0.0702 and −0.0700 for 80, 107, 160 and 213 boundary panels. An independent analytic Hess–Smith velocity replay on exactly the same contours also finds negative margins. Its magnitude is still converging; it must not be called independent cavitation validation. The user's NACA 2414, α = 0.1° case remains rejected.

The [all-sample pressure figure](cavity-2d-pressure-all.svg) shows the physical quantity Cp + σ over the entire contour's wetted samples, with an explicitly labelled onset detail. [Gap and onset diagnostic](cavity-2d-admission.svg) shows why a positive gap does not establish physical admission. JSON reports preserve all samples, including the near-junction values.

Reproduce with `node cavity-2d-wet-pressure.cjs`, then `python cavity-2d-wet-replay.py`, then `python cavity-2d-pressure-plot.py`. `node cavity-2d-admission-test.cjs` compares every Cp, cavity ordinate, force coefficient, σ and legacy numerical status with the saved pre-change baseline; the solutions are bit-for-bit identical.

An additional structural spar can change structural stiffness; it cannot correct the hydrodynamic detachment, closure or unmodelled cavitation region. Automatic detachment experiments and fractional-power anchors remain exploratory and are not installed as a physical repair. See [the detailed investigation](cavity-2d-repair.md).

Primary formulation: [Kinnas, chapter 9, equations 9.9–9.16](https://cavity.caee.utexas.edu/kinnas/COURSES/bem/kinnas_ch09.pdf). Its NACA 16-006 / λ = 0 illustration is not a matched benchmark for the current NACA 0012 / λ = 0.15 example. The additional smooth-contact end-slope condition is also distinct from the original re-entrant closure formulation. A matched developed-cavity experimental validation is still outstanding.
