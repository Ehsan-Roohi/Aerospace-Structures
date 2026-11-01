# Detached single-bubble axisymmetric BEM — research foundation

This is an executable free-interface boundary-element calculation, not a spherical ODE disguised as BEM. The Rayleigh–Plesset (RP) ODE appears only in `test.cjs` as an independent reference. `bubble.js` never calls it and never projects the evolving mesh back to a sphere.

The current scope is **one closed, smooth, axisymmetric gas/vapour bubble in unbounded incompressible, inviscid, irrotational liquid**. This is a foundation for subsequent detached-cavity research. It does not model hydrofoil shedding, a bubble cloud, multiple interacting bubbles, a re-entrant jet, coalescence, breakup, compressibility, sound, viscosity, heat/mass transfer, or topology change. No experimental validation is claimed. It is not a repair or physical admission of the separate attached-cavity solver.

## Governing equations and signs

Let `n` point from the bubble into liquid, `q = d(phi)/dn`, and `G = 1/(4 pi |x-y|)`. The liquid satisfies `Laplacian(phi)=0`, with disturbance potential tending to zero at infinity. On the bubble,

```
S q = (D - I/2) phi,
S q(x) = integral_surface G(x,y) q(y) dS_y,
D phi(x) = PV integral_surface dG(x,y)/dn_y phi(y) dS_y.
```

For a sphere expanding at velocity `U`, `phi = -R U` on the boundary and `q = U`. Since `S 1 = R` and `D 1 = -1/2`, the implemented sign gives `q = -phi/R`, as required. The independent exterior harmonic tests additionally verify `q_l = -(l+1) phi_l/R`, including nonuniform `l=1,2` data.

The meridian runs from the north pole to south pole, with tangent `t=(dr/ds,dz/ds)` and normal `n=(-dz/ds,dr/ds)`. Each straight meridional panel is revolved into a conical frustum. The azimuthal integration is analytic, using complete elliptic integrals. There is no azimuthal polygon mesh and no rotated planar-flow approximation. The single-layer kernel is

```
C = (r+rs)^2 + (z-zs)^2,
B = (r-rs)^2 + (z-zs)^2,
S_ring = rs K(1-B/C)/(pi sqrt(C)).
```

The directly formed complement `B/C` avoids subtracting two nearly equal numbers near a coincident ring. The double-layer ring kernel is

```
D_ring = [rs E (dr nr + dz nz)/B - nr (K-E)/2] /(pi sqrt(C)).
```

On the generating straight self panel, `dr nr + dz nz` is zero by construction. Self integration splits at the target and uses a quadratic coordinate map to integrate the logarithm. The double-layer diagonal is completed from the **closed-surface identity** `D 1 = -1/2`, valid for every admitted closed shape. This is not a fit to spherical velocity. Pivoted dense LU solves the Dirichlet-to-Neumann system. The residual is recomputed from the unmodified assembled matrix.

Interface pressure is

```
p_liquid = pGas0 (V0/V)^k + pVapour - gamma curvature.
```

The physical velocity is `u = q n + phi_s t`. Surface-tension curvature is positive `2/R` on a sphere; the code includes meridional and azimuthal terms. The interface is advanced by a normal-motion ALE mesh to avoid tangential node clustering. If `w` is this mesh velocity, the **moving-collocation** potential evolves as

```
d(phi)/dt on mesh = -|u|^2/2 + w dot u + (pInfinity-p_liquid)/rho - g z.
```

Thus the tangential term is not accidentally treated as material motion. Heun's explicit two-stage RK2 advances the mesh and potential, with an actual BEM solve at both stages. Tangential gradients use finite differences of panel-midpoint potential values. This is a low-order collocation method, not a higher-order Galerkin formulation. The frustum volume is integrated exactly for the current polygonal meridian.

For a spherical reference, these equations reduce to

```
R Rddot + 1.5 Rdot^2 =
  [pGas0 (R0/R)^(3 k) + pVapour - pInfinity - 2 gamma/R]/rho.
```

That ODE is independently integrated by RK4 in the tests. Numerical RP reference convergence is checked separately.

## Run and interface

```js
const B = require('./bubble.js'); // browser global: DetachedBubbleBEM
const state = B.createState({radius: 1, nPanels: 32});
const result = B.simulate({
  state,
  physics: {density: 1, pInfinity: 1, pVapour: 0,
            pGas0: 0.1, polytropicExponent: 1.4,
            surfaceTension: 0, gravity: 0},
  dt: 0.003, steps: 200, snapshotEvery: 10, quadratureOrder: 12
});
```

`result.status` is `completed` or `stopped`. A stopped run returns the last admitted state, completed step count, a reason, and only previously admitted history. It does not silently reduce radii, clip signs, repair intersections, or continue through singular collapse.

For responsive UI/worker integration, call `advanceBubble(state,dt,physics,options)` once per iteration; the caller can report progress and cancel between steps. It throws when a strict stop is reached. The returned state has `mesh:[{r,z}]`, `phi`, `time`, `steps`, `initialVolume`, `initialRadius`, and `diagnostics`. `simulate` collects:

```
history: [{time, volume, equivalentRadius, maxBoundaryResidual,
           gasPressure, minInteriorRadius}],
snapshots: [{time, mesh:[{r,z}], phi:[...]}]
```

`equivalentRadius=(3 V/(4 pi))^(1/3)`. The first history entry has only time/volume/radius/residual. `maxBoundaryResidual` at later entries is the maximum normalized **algebraic BIE residual over that step's two stage solves**. It is neither a physical prediction error nor experimental agreement. `conditioning.pivotRatio` is an LU pivot ratio, explicitly not a condition number. The gas-pressure diagnostic is recomputed at the corrected final volume/time, rather than copied from the predictor.

Lengths and pressures can be SI or consistently nondimensional. A useful collapse scaling is `R=R0 R*`, `t=R0 sqrt(rho/(pInfinity-pVapour)) t*`. Use `density=1,pInfinity=1,pVapour=0` for the scaled kernel, and scale its output afterward. `pGas0` then means initial noncondensable gas pressure divided by the ambient-minus-vapour pressure. With capillarity, `gamma*=gamma/[(pInfinity-pVapour)R0]`. This scaling does not change the equations or replace BEM velocities.

## Verification evidence

Run `node test.cjs` in this directory (Node.js required). Fresh `tests.json` records **13/13 passed**. Retained `tests-before-input-guard.json` records the earlier finite-radius-input guard failure; it is not presented as a successful run.

* Exterior sphere flux `l=0`: maximum error `1.164e-3, 2.794e-4, 6.828e-5` at 16/32/64 panels. Modes `l=1,2` also converge at approximately second order. Algebraic BIE residuals are of order `1e-15`.
* Non-spherical ellipsoid with a known offset interior point-source potential: maximum flux error `1.175e-2, 2.520e-3, 6.361e-4` at 16/32/64 panels. This checks an actual nonuniform, non-spherical BEM solve against an analytical harmonic field, rather than only reporting a matrix residual.
* Independent off-surface Green representation on the sphere converges to the exact exterior potential at approximately second order.
* Expanding sphere, `pGas0=1.1`, `k=1.4`, time `0.4`: RP radius ratio `1.007486268`. BEM errors at 16/32/64 panels and `dt=.002`: `2.705e-5, 6.857e-6, 1.696e-6`.
* Contracting sphere, `pGas0=.1`, time `.6`: RP radius ratio `.819021739`. BEM at 64 panels/`dt=.0015` gives `.819078474`, absolute difference `5.674e-5` (about `0.00693%` of the RP radius). The 16/32/64-panel errors are `8.864e-4, 2.254e-4, 5.674e-5`. Separate time-step halving tests show approximately second-order temporal self-convergence; at these time steps the spatial error dominates the total reference discrepancy.
* The actual contracting mesh is not forced spherical: max-minus-min vertex radius spreads at 16/32/64 panels are `9.368e-4, 2.050e-4, 4.062e-5`, decreasing under refinement.
* Gas-free Rayleigh contraction, capillary sphere curvature/equilibrium, nonspherical moving-interface steps, finite-value tests, mesh intersection tests, and explicit time-step rejection are included.

Radius comparisons use `Req(t)/Req(0)` for the polygonal BEM mesh and `R(t)/R0` for the independent exact sphere. Their initial volumes differ by the ordinary polygonal geometry discretization; this normalization is explicit, not an enforced spherical update. Mesh shape spread remains independently reported. `radius-check.png/.svg` show the actual temporal distributions and signed reference differences; `mesh-shapes.png/.svg` show computed interfaces. These are mathematical/numerical verification cases, not measured cavity data.

## Admission and remaining limitations

The kernel rejects nonfinite states/physics, nonpositive interior radii/volume, bad pole orientation, meridional intersections, degenerate/strongly disproportionate panels, singular influence solves, excessive BIE algebraic residual, a step moving nodes by more than 20% of the smallest panel, and an explicit capillary time-step limit. Positive radii at the two poles are not allowed: pole radii are zero by axisymmetry and are excluded from the positive-interior-radius screen. There are 8–256 panels and 1–10000 step bounds to keep browser work bounded; callers choose actual counts/time steps and must examine convergence.

These guards do not certify every smooth nonspherical evolution. There is no mesh adaptation, remeshing, automatic time-step refinement or rigorous a posteriori spatial-error bound. The explicit method is intended for early smooth motion. Near singular collapse, jetting, or rapidly growing shape modes, stop and refine or use a substantially more advanced solver. A dense 64-panel run is suitable for this prototype; large bubble clouds require multiple-surface interaction, acceleration, robust topology handling and independent physical validation. That work has not been claimed complete.

## Literature and implementation provenance

The free-interface Laplace/kinematic/Bernoulli formulation is standard bubble boundary-integral physics; useful primary references include:

* [Klaseboer et al., modified RP verification for nonspherical boundary-integral calculations, Engineering Analysis with Boundary Elements (2006)](https://www.sciencedirect.com/science/article/abs/pii/S0955799705001773).
* [Wang, axisymmetric bubble dynamics near a plane wall, Journal of Fluid Mechanics (2009)](https://doi.org/10.1017/S0022112009991340).
* [A Level Set–Boundary Element Method for the Simulation of Underwater Bubble Dynamics, SIAM J. Scientific Computing (2007)](https://doi.org/10.1137/060660667).
* [Irrotational flow due to forced oscillations of a bubble, ANZIAM Journal 66 (2024)](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/FFCFE8FE985E3DA613703222AB8C42DF/S144618112400021Xa.pdf/irrotational_flow_due_to_forced_oscillations_of_a_bubble.pdf).

The AGM complete-elliptic-integral implementation was adapted from the existing `docs/hydrofoil-cavitation-lab/axisymmetric.js` kernel, reviewed before reuse. The source file's SHA-256 is recorded in `provenance.json`; the new unsteady solver, exterior double-layer system, ALE update, tests and independent RP integration are new work in this private folder. No third-party production code was downloaded or executed. The references inform the equations, not a claim to reproduce all capabilities of those research codes.
