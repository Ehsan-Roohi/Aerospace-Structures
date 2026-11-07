# Finite-rotation static flexible-wing model

This optional model resolves the limitation that caused the rigid-load 900 mm
study to stop. A span length does not itself invalidate a beam. The previous
one-way admission estimated lift feedback from rotation about the reference
shear-centre axis and assumed fixed aerodynamic pressures. That rotation is not
in general the actual airfoil-incidence change when the reference axis is swept
or curved. The new model computes both quantities and re-solves pressure.

## Equations and coordinates

Lengths are mm, forces N, moments N mm, stresses MPa and rotations radians.
The material/reference span coordinate is retained during load transfer. Within
each initially straight reference segment the elastic Kirchhoff equations are

- `dr/ds = Q e1 (1 + epsilon)`;
- `dQ/ds = Q hat(kappa)` (unit-quaternion integration);
- `dn/ds = -f`;
- `dm/ds = -(dr/ds) cross n - c`.

The existing positive-definite composite section law maps
`[epsilon,kappa2,kappa3,kappa1]` to `[n1,m2,m3,m1]`. Axial/biaxial coupling,
reference-axis eccentricity and Saint-Venant torsion are retained. Reference
triad changes at segment joints preserve the initially curved axis without
introducing a fictitious elastic bend. Load continuation and a three-component
shooting solve enforce the free-tip moment conditions. No unconverged partial
field is accepted. This is a finite-rotation, small-elastic-strain beam; it is
not a small-displacement stiffness solve relabelled nonlinear.

A material point is moved by the finite rigid-section map
`P = r + Q Q0^T (P0 - r0)`. Every pressure-panel vertex and wake attachment is
rebuilt on that surface, then the existing tensor-quadratic potential-flow
boundary system and quadratic pressure integration are solved again. Shape keys
prevent stale geometry reuse. The half-wing image supplies symmetric flight.
The old rigid-coordinate sectional Cp export is refused for deformed surfaces;
it is not presented with incorrect physical x/c coordinates.

Each aerodynamic strip retains its force and moment about the aircraft origin.
A force density on the moved quarter-chord line plus a restoring free-couple
density conserves all six components. The attachment map is iterated to coupled
equilibrium. Numerical admission uses the established cumulative-PCHIP mesh
estimator **plus** the actual delivered-load interpolation residual. It does not
replace unresolved numerical error with a torsional-stiffness fit or a 2-pi
feedback correction.

## Numerical verification

- Exact circular cantilever elastica, up to 1.6 rad end rotation.
- Independent scalar planar-elastica BVP using scalar bisection and independent
  RK4, compared with the spatial quaternion/shooting solution.
- Classical tip-force and uniform-force small-load limits.
- Full axial/biaxial/eccentric section-law linear limit.
- Arbitrary rigid rotation of geometry, section axes and loads.
- Pure torsion at 1.8 rad and preservation of the section radius.
- Refusal of invalid loads, non-positive section stiffness and nonconvergence.
- Identity deformed-pressure solve reproduces the rigid-pressure solution exactly;
  a controlled incidence deformation changes lift in the expected direction.
- Six-component pressure-wrench conservation and explicit shape-cache keys.
- The existing finite-wall section method is checked against analytic ellipse
  and rectangular Saint-Venant torsion, including a rotated held-out ellipse.
- The 900 mm study is checked by eight-grid aerodynamic refinement, coupled
  residuals, doubled integration resolution and independently refined
  reference-axis/section discretization. See the current review JSON for results.

The force/bending uncertainty thresholds remain 5%, torque 10%, and pressure vs
wake lift consistency 2%. Standard automatically advances to Fine if it does not
resolve those quantities. Position/span, rotation and load coupling residuals
must be below `1e-5`, `1e-6 rad` and `1e-4`, respectively; conservative transfer
moment error must be below `1e-4`. Integration refinement is checked separately;
section/axis refinement must change displacement and actual airfoil incidence by
no more than 1%; the nominal normal-stress envelope is independently checked at 1% as well. These are stated numerical criteria, not experimental accuracy.

Homogeneous bonded shell/spar unions use the existing conforming finite-wall
Saint-Venant section solve, with its refinement and energy checks. A rare
polygon-clipping failure from projected, nearly coincident bonded-interface
coordinates is retried at a recorded microscopic coordinate grid. The grid is
`1e-11` times the section-coordinate scale; receipts report its actual size.
Analytic section checks are retained. The original shared linear library is
unchanged; the guarded implementation belongs only to this optional worker.
Finite-wall torsion upgrades GJ, **not** the shear-centre approximation. Mixed
materials retain the explicitly identified existing multi-material model.

## Use and build

In Aerodynamics open **Flexible wing · coupled nonlinear model** and press
**Solve coupled flexible wing**. Current geometry, effective materials, flow
and self-weight are frozen for that run. As in the existing pressure-apply action,
prescribed flight/tip/custom loads are replaced by aerodynamic pressures;
self-weight stays as selected. A selected target lift is re-trimmed on each
updated aerodynamic geometry. Progress, cancellation, complete-result JSON and
matched physical profiles are available. Selected deflection/torsional-rotation design limits are reported separately; an exceeded stiffness criterion does not erase a converged solution or become a numerical pass. A late cancelled worker cannot replace
a newer result; input changes mark the saved result out of date.

Build from the repository root:

```
python computational/printed-wing-solver/nonlinear/build_flexible_solver.py
node computational/printed-wing-solver/nonlinear/test_nonlinear_beam.cjs
node computational/printed-wing-solver/nonlinear/test_scalar_elastica.cjs
node computational/printed-wing-solver/nonlinear/test_deformed_pressure.cjs
node computational/printed-wing-solver/nonlinear/test_finite_wall.mjs
```

`run_900mm.cjs` runs the saved case. Set `FULL_SEQUENCE=1` for checked coupled
refinement; the default single-grid run is explicitly diagnostic. The UI test
accepts `MIE446_JSDOM_MODULE` and uses a saved numerical result with only the
worker transport stubbed. The builder synchronizes the optional aerodynamic
vertex hook, rebuilds both served pages, versions all affected worker assets,
and records source provenance. No network scientific solver is required.

## Scope and reference

This remains an attached, incompressible, inviscid potential-flow / elastic-beam
model. There is no viscous drag, separation, stall, section distortion, transverse
shear deformation, material plasticity/failure, buckling, restrained-warping stress,
flutter or divergence/stable-branch certificate. Root restraints are equivalent
axis clamps; nominal end-zone stresses are excluded. Exact zero-chord tips are
not enabled in this finite-rotation model. Numerical convergence does not validate
filament properties or establish aircraft safety. Existing rigid and exact-tip
models remain separate.

The finite-rotation representation follows established spatial-beam mechanics;
see Vetter et al., *Finite Element Simulation of Dense Wire Packings*, sections
2.1–2.3, [author preprint](https://romanvetter.ethz.ch/publications/papers/2/preprint.pdf).
The current static shooting implementation and verification tests are independent
code; the paper's wire-contact and dynamic model are not executed here. No external
consultation advice is claimed: browser consultation was blocked because the
Windows Firefox URL-policy enforcement was unavailable in this turn.
