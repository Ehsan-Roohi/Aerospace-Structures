# Independent printed-wing solid comparison

These optional developer scripts compare the browser's nominal spatial beam
with independent small-strain, isotropic **3-D solid elasticity** on the actual
CadQuery STEP. They are not called by the student notebook and do not certify
printed PLA strength, root/load-edge stress concentrations, buckling, or flight.
Reported cases are individual comparisons, not bounds on arbitrary airfoils or
the interior of a sweep/dihedral/twist parameter box.

Use a separate Python environment with the course package and the pinned
optional dependencies in `requirements.txt`. A normal virtual environment is
recommended: Windows Gmsh wheels contain a DLL in their data directory, which
some `pip --target` layouts do not relocate correctly. No cloud/HPC is needed.
The scripts refuse mesh volume/DOF/memory admission failures and preserve all
manufacturing checks; no failed gate should be relaxed to obtain a comparison.

Example commands, from the repository root (choose a new local QA directory):

```text
python scripts/validation/wing_solid_benchmark.py patch --out QA
python scripts/validation/wing_solid_two_rhs.py patch --out QA
python scripts/validation/wing_solid_benchmark.py cad --case baseline --out QA
python scripts/validation/wing_solid_benchmark.py mesh --h 8 --out QA
python scripts/validation/wing_solid_benchmark.py mesh --h 5 --out QA
python scripts/validation/wing_solid_benchmark.py volume --out QA
python scripts/validation/wing_solid_two_rhs.py solve --h 8 --out QA
python scripts/validation/wing_solid_two_rhs.py solve --h 5 --out QA
node scripts/validation/wing_solid_beam_reference.mjs --study QA/slender-study.json --solid-report QA/h5-solve-report.json --torque-report QA/h5-torque-solve-report.json --output QA/beam-reference.json --elements 40,80 --sections 15 --cuts 110,130,190
python scripts/validation/wing_solid_benchmark.py cuts --h 8 --channel uniform --out QA --frames QA/beam-reference.json
python scripts/validation/wing_solid_benchmark.py cuts --h 5 --channel uniform --out QA --frames QA/beam-reference.json
python scripts/validation/wing_solid_benchmark.py cuts --h 8 --channel torque --out QA --frames QA/beam-reference.json
python scripts/validation/wing_solid_benchmark.py cuts --h 5 --channel torque --out QA --frames QA/beam-reference.json
python scripts/validation/wing_solid_summary.py --out QA --reference QA/beam-reference.json --output QA/finished-summary.json
```

The summary retains geometry, material, actual load wrenches, solver algebra,
convergence, comparison errors, package versions and artifact hashes without
absolute machine-local paths. Optional `--plot QA/signed-stress-profiles.png`
requires Matplotlib and shows signed physical stress samples, not error bars.

Run full solves sequentially, not beside CAD regression suites. The default
admission requires 2.5 GiB free physical RAM and at most 150,000 displacement
DOFs. There is no sparse direct factorization: six rigid-body near-nullspace
modes inform AMG-preconditioned CG. Independently recomputed residuals and
bounded iterative refinement check the stored matrix, rather than trusting a
recursive Krylov convergence message alone. Optional curved-geometry pilots
exist in the first script, but the two-RHS comparison deliberately accepts only
affine tetrahedral geometry. Its quadratic displacement stiffness is integrated
exactly with degree-two quadrature; a tiny-mesh check compares this with degree
four. Tip traction and kinematic fit quadrature remain degree four.

The physical root face fixes all three solid translations at every boundary
node, thereby restraining all six rigid-body modes. It is not the same boundary
condition as an equivalent six-DOF beam-axis clamp. Each mesh uses its actual
tip-face area and centroid, and the applied force and moment are independently
integrated. The two channels are:

* uniform global-vertical tip traction, total force **2 N**;
* signed global-vertical traction proportional to `x − CGx`, zero resultant
  force and a pure **+50 N mm global-y couple**.

The beam comparison preserves those complete global wrenches. It does not
resolve their detailed physical traction or an oblique-end boundary layer.
The torque channel's exact generalized rotation is `thetaWork = (f · u)/My`.
Least-squares rigid rotations on the actual tip and the `y = 0.85 L` ring are
separate kinematic diagnostics; their residual measures non-rigid deformation.

Unchanged predeclared gates: CAD/mesh material-volume discrepancy **0.5%**,
force/moment balance **1e-5**, free residual **1e-7**, symmetry **1e-12**, and
energy/work **1e-7**. Successive-mesh compliance/torque rotation changes must be
within **2%**, and fitted nominal normal-stress changes within **5%**. Beam/solid
agreement targets are **10%** for compliance/torque rotation and **15%** for
nominal normal stress. Near-zero kinematic absolute floors are `1e-5 mm` and
`1e-7 rad`; do not print relative percentages for a zero quantity.

Material volume is independently converged by adaptive OpenCASCADE B-rep
integration, retaining the default non-adaptive value for audit. The latter can
mis-integrate station-loft B-spline faces. Tetrahedral volume is compared with
the converged B-rep, not a convenient mass value or a relaxed tolerance.

Complete physical beam-normal cuts, not global-y stress components, are used
for nominal `t · sigma · t`. The cut script integrates every intersecting
tetrahedron and preserves hollow regions. Fixed interior stations are 110,
130 and 190 mm. These are comparison stations, not an experimentally verified
Saint-Venant decay distance; the last station can be within one tip chord of
the load. No root/load-edge maximum is admitted by this comparison.

## Finished initial-case result and physical stress coverage

The [finished numerical record](results/initial_station_wing.json) separates
**passing global-response and fitted nominal-stress checks** from the **failed
15% raw local torque-stress comparison target**. At the three fixed cuts, the
raw torque-stress weighted relative errors are approximately 17.46%, 22.33%
and 15.22%. Absolute RMS errors in MPa are also recorded. An affine fit agreeing
with the beam does not validate the non-affine local solid stresses, restrained
warping, or any maximum stress. No broad local-stress validation is claimed.

![Actual signed solid stress samples and nominal spatial-beam predictions](results/initial_signed_stress_profiles.png)

Gray points are the actual fine-mesh tensor-stress quadrature samples on the
complete hollow normal cuts; teal points evaluate the nominal beam at the same
physical positions. The lower row makes the non-affine torque-stress difference
visible. These are actual samples across each section, not a fabricated
continuous FE curve between a few span stations. Positive normal stress is
tension and negative is compression. The plotted e3 depth is the right-handed
normal-cut coordinate, approximately downward for this case. Root/load-edge
stress peaks and an arbitrary-airfoil error bound remain outside this evidence.

The optional `sweep`, `dihedral`, `combined`, and `forward` case definitions use
`L/rootChord = 240/60 = 4`, taper 0.75, NACA 23018 to 0018, 1.2 mm skin/TE,
two ribs at 80/160 mm, and one full-span integral PLA I-spar at 0.35c with
4 × 0.8 mm caps and 0.6 mm web. Merely defining a case is not a claim that it
has been run or passed; report its actual solve and convergence results.

Primary implementation references: [Gmsh](https://gmsh.info/doc/texinfo/gmsh.html),
[scikit-fem](https://scikit-fem.readthedocs.io/en/latest/listofexamples.html),
[PyAMG](https://pyamg.readthedocs.io/en/latest/generated/pyamg.aggregation.html).
