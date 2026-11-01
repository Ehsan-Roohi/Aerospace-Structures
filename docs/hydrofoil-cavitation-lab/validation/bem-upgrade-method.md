# Cavitation BEM: smooth detachment and continuous vortex rings

The 2026-10-31 research update adds an optional two-dimensional smooth-detachment search and replaces the developed-disk browser calculation with a continuous linear-vortex formulation. The fully wetted sphere/prolate solver and the prescribed-detachment hydrofoil equations are unchanged. This is numerical verification, not experimental validation.

## Two-dimensional smooth detachment

At a smooth wall, zero starting gap slope does not determine the detachment position: a gap proportional to arclength to the power 3/2 already has zero starting slope. The Brillouin–Villat condition instead removes the coefficient of that leading singular term. The implementation searches for its coefficient beta equal to zero, with cavity speed selected by end-height closure and recovery attenuation A selected by end-contact slope.

The primary estimate is an overdetermined least-squares fit of the first **five** interior approximate normal-gap samples to powers 3/2 and 2 of the original foil arclength. Four- and six-node fits, upstream wetted-speed estimates, bracket conditioning and the complete trial trace remain diagnostics. This finite-window estimator is not an exact local expansion or proof of a unique branch.

Select **Automatic smooth · research**, **Smooth contact**, and resolution 48 or 64 initially. The entered detachment coordinate is a starting guess. The returned selected station is reported separately; inputs are not silently replaced. Resolution 96 exceeded a 120 s diagnostic budget in one review run, so it is not the default. Progress and Cancel remain available in a separate worker.

For NACA0012 at 4 degrees, length 0.4c and recovery fraction 0.15, the current potential solver at resolution 64 changes the minimum wetted Cp+sigma from -0.0700183 at prescribed D=0.01c to -0.00696181 at selected D=0.00633710c. An independently rerun nodal-vortex free-boundary calculation gives -0.0130316, -0.00658631 and -0.00406509 at 184, 276 and 368 total panels. The defect decreases but remains negative in both formulations.

**No physical pass is inferred from this improvement.** Every wetted sample still undergoes the unchanged zero-allowance pressure screen, with only floating-point roundoff allowed by the core. A failed branch stays under `rejectedTrial`, accepted-result CSV/figure exports remain disabled, and numerical convergence is recorded separately. Negative pressure margins or gaps are never clipped. A weak low-incidence NACA2414 root remains rejected when its end-contact branch intersects the foil.

The independent solver enforces cavity speed at nodes through the penultimate endpoint. Its omitted end-node speed residual and directly evaluated midpoint defects are retained. Therefore cross-method agreement of sigma alone does not establish complete free-boundary accuracy. The sharp-cusp analytic control also retains its nonmonotone trailing-edge pointwise error; no cusp point is removed to improve the reported maximum.

## Developed axisymmetric disk cavity

The model is unbounded, steady, incompressible potential flow behind a sharp disk with a downstream Riabouchinsky image disk. L/R is the **full disk-to-image separation**. The mesh is a surface of revolution, not a plane-flow substitution.

The new formulation uses continuous, piecewise-linear nodal vortex strengths on meridional bands. Midpoint normal equations determine the sheet strengths, with front/rear symmetry and stagnation-axis strength zero. Newton iteration adjusts cavity nodes along reference normals and solves a common reconstructed cavity speed. Velocity influence comes from elliptic-integral ring kernels with analytic planar singular-part subtraction and clustered quadrature.

In the continuum, an interior at rest makes exterior tangential velocity equal to the vortex-sheet jump. With finite midpoint collocation the interior is not exactly at rest. Thus the nodal approximation q/U≈-gamma can converge faster than a direct facet-field value while still differing from it. The interface shows **both** reconstructed Cp and independently evaluated exterior Cp. A tiny nodal residual is not labelled a direct pressure-accuracy result.

Independent field checks use fractions 0.1, 0.25, 0.5, 0.75 and 0.9 of every panel, including both rims. The signed normal profile, RMS normal velocity, mean absolute normal velocity, direct Cp+sigma defect, trace mismatch and signed net flux are retained. A signed global flux can cancel for a divergence-free vortex representation, so it is not used as proof of local no penetration. Existing sample thresholds 0.01U and 0.02Cp have not been relaxed.

At L/R = 8, independent Python and browser JavaScript sigma, maximum radius and physical front-disk drag agree within 1.6e-10 over the recorded matched meshes. At 192 cavity bands the current solver gives sigma 0.317647590, Rmax/R 1.97381972 and CD 1.10080947. However, maximum direct-field normal and Cp defects are 0.01323U and 0.02391, exceeding the existing limits. Some refined runs stall above the requested 1e-10 nodal tolerance; their convergence flag remains false. **Accuracy qualification remains false.**

Front-disk drag uses pressure relative to cavity pressure, normalized by one-half rho U squared times pi R squared. The artificial image-disk force is not treated as physical drag. A literature drag number with an unconfirmed reference-area normalization is not counted as a passed benchmark.

## Reproduction and scope

Run with Node.js from the repository:

```
node docs/hydrofoil-cavitation-lab/validation/smooth-detachment-verify.cjs
node docs/hydrofoil-cavitation-lab/validation/ui-smoke.cjs
node docs/hydrofoil-cavitation-lab/validation/nodal-cavity-verify.cjs
node docs/hydrofoil-cavitation-lab/validation/nodal-cavity-ui-smoke.cjs
```

The independent Python reference sources are in `reference/nodal-cavity/python/`; they require NumPy and SciPy. Code hashes, supplied-source provenance, complete profiles, analytical/kernel controls and recorded failures accompany the figures. Historical constant-source implementation and evidence remain available separately.

Matched experiments, viscosity, inception/nuclei physics, tunnel blockage, natural smooth-body detachment, re-entrant-jet closure, unsteady collapse and cavitating-wing structural coupling remain outside this release. The zero-recovery Kinnas benchmark has not been reproduced with converged meshes; changing closure and trailing-edge geometry prevents assigning its discrepancy to one cause alone.

References: [Brennen, chapter 8, especially 8.3](https://media.library.caltech.edu/CaltechBOOK:1995.001/chap8.htm); [Kinnas, chapter 9](https://cavity.caee.utexas.edu/kinnas/COURSES/bem/kinnas_ch09.pdf); [Kinnas and Fine 1993](https://doi.org/10.1017/S0022112093002071); [Yas’ko 1993](https://doi.org/10.2495/MB930161).

## Stable numerical kernel update (axisymmetric 0.2.1)

The ring-minus-planar remainder is now evaluated through a cancellation-free identity. Near complementary parameter q = k-prime squared equal to zero, K and E-minus-one use the convergent expansion through q cubed from NIST DLMF 19.12. The change solves the same BIE and nodal equations. Independent 400-digit original-expression fixtures verify the identity, including extreme separations; the truncation error of E-minus-one is retained in the test tolerance.

A declared surface trace is allowed only at a known panel interior within a coordinate-roundoff bound. Arbitrary off-surface evaluation is unchanged. Malformed indices, false declarations, panel extensions and endpoints are rejected. This fixes a false interior-side evaluation on very short panels, rather than changing the pressure target.

Strict Newton convergence now passes at 256 cavity panels, but nine-fraction sampling still finds maxima 0.01260374 U normal velocity and 0.04151791 Cp. The 0.01/0.02 limits are unchanged. The default field audit uses all nine fractions, retaining every previous point. No physical or experimental pass is inferred. See stable-kernel-verification.json and stable-kernel-repair-profiles.json for full evidence.
