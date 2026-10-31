# 2-D free-boundary investigation and admission repair

The shipped equations and numerical tolerances have not changed. `physicalAdmissibility` now distinguishes a converged numerical branch from a physically admissible equilibrium sheet cavity. Rejected trial values remain available for diagnostics, rather than being presented as predictions.

## Why the additional pressure screen is necessary

For the equilibrium model, the liquid labelled wetted must satisfy

\[
C_p+\sigma=(p-p_v)/(\tfrac12\rho U_\infty^2)\ge0.
\]

The screen excludes cavity BC panels and checks every remaining panel centroid. Its only allowance is 64 machine epsilons times the pressure scale; this covers roundoff, not mesh error. The pressure and geometry are never clipped or moved. Junction samples remain resolution-sensitive, so a passing screen does not prove accuracy or experimental validation. It also does not model metastable liquid or nuclei-dependent delayed inception.

For the default NACA0012, α4°, prescribed detachment0.01, cavity length0.4, smooth-contact case:

| Total boundary panels | Production minimum Cp+σ | Independent analytic-velocity replay at the same centroids |
|---:|---:|---:|
|80|−0.07638|−0.16010|
|107|−0.07317|−0.14101|
|160|−0.07016|−0.12072|
|213|−0.07002|−0.11038|

The sign persists in both discretisations. The discrepancy in magnitude is unresolved, so these are admission diagnostics, not cross-code validation. The production minimum is upstream of prescribed detachment, around x/c0.0073–0.0078. This identifies an unmodelled additional cavitation region in the assumed equilibrium problem. Adding a structural spar cannot correct a hydrodynamic cavity boundary or an inadmissible flow model.

The user's NACA2414, α0.1°, detachment0.01, length0.4, resolution32 remains rejected. Its missing smooth-end bracket and foil-intersecting cavity have not been overridden. `physicalAdmissibility.screenPassed` is false. Increasing speed alone cannot fix this dimensionless free-boundary problem; speed changes dimensional pressure requirements through σ.

## Detachment experiments, retained but not promoted

An explicit exploratory problem made detachment an unknown while keeping cavity length and recovery fixed. Entry tangency alone was insufficient: a smooth mixed-boundary detachment also requires control of the leading singular coefficient. Cancelling the fitted s^(3/2) gap term was studied separately. This is not equivalent to imposing a fixed detachment, and must not be silently substituted for the user's case.

The potential-BIE roots xD≈0.00554 were positive-gap numerical branches, but still failed sampled wetted pressure: margins−0.0341,−0.0220,−0.00991,−0.00547 at80/107/160/213panels. Independent replay was also negative. Independent Hess–Smith free-boundary roots at xD≈0.08 had much larger upstream pressure violations and were ruled out. No exploratory root has been installed as a physical solution.

A fractional-power detachment-potential anchor was also tested in isolation. At213panels, it changed σ only≈0.00003 and did not repair the cross-formulation discrepancy. It was not installed in the production kernel.

## Evidence and reproducibility

- `node cavity-2d-wet-pressure.cjs`: production default smooth-branch pressure study; no kernel changes.
- `python cavity-2d-wet-replay.py`: independent analytic source/uniform-vortex velocity on the same production shapes, at1/4,1/2,3/4 panel positions.
- `node cavity-2d-admission-test.cjs`: confirms numerical status, σ, every gap ordinate, every Cp and integrated coefficients are bit-for-bit unchanged by the new screen; default and user low-angle cases both tested.
- `python cavity-2d-admission-plot.py`: reproducible gap and pressure-margin figure, without bar charts or altered data.
- `cavity-2d-autoD-admission.json`, `cavity-2d-entry-regularity-study.json` and `cavity-2d-anchor-study.json` retain exploratory successes and failures.

The wet-boundary cylinder/Joukowski controls remain separate from developed-cavity validation. No matched experimental cavity validation has been produced by this work.

## Primary reference and the next scientific step

[Kinnas, chapter9, equations9.9–9.16](https://cavity.caee.utexas.edu/kinnas/COURSES/bem/kinnas_ch09.pdf) describes the constant-strength mixed-potential BIE, prescribed cavity potential, integrated normal correction, Morino wake jump and end-height closure. Its simplified derivation sets recovery fraction λ=0; its figure9.8 σ1.097 case is NACA16-006, not NACA0012. Comparing the current0012/λ0.15 result with that number would be a mismatched benchmark. The current extra equation h_x(end)=0 is an additional smooth-contact closure selection, not an obligatory condition of the original re-entrant-jet formulation.

The next repair needs a genuinely matched16-006 reference with the original detachment, TE and recovery conventions, plus independently converged treatment of both mixed-boundary junctions. End-corner velocity residuals must stay visible. No pressure floor, ad-hoc endpoint replacement or fitted closure parameter can establish that validation.
