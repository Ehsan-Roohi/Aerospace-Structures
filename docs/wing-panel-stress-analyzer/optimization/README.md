# MIE 446 Optimization Lab

Ten self-contained browser pages that add a design-optimization layer to the beam, truss and wing-box problems of
MIE 446 Aerospace Structures. The lab is published at
`https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/optimization/` and lives in this folder
of the course repository. It is additive: the existing Wing AeroStruct, Wing Lab and Truss Lab pages are untouched and
no page here reads or replaces their solvers.

## Scope and honesty rules

Every page uses its own small linear-elastic model (Euler-Bernoulli beams, 2D direct-stiffness trusses, a thin-walled
single-cell wing box) and states that model in a scope callout at the top. Nothing here is a certified strength,
stability or fatigue statement. Indicative checks such as the Euler buckling estimate with an assumed effective length,
or the plate buckling estimate with simply supported edges, are labelled "screen". Every recommended design is re-solved
from scratch by the exact solver of its page before it is shown, with the result marked "Checked by fresh model solve";
candidate structural metrics are recomputed with the stated model. Surrogate curves and grid refinements are approximate and labelled; a fresh solve is not experimental validation or a guarantee of global optimality. All optimizers are
deterministic (seeded pseudo-random numbers where a method needs them), so a student can reproduce every result.

Units are mm, N, MPa and g. Utilization U is demand divided by capacity with the factor of safety included, so a check
passes when U is at most 1. Material cards are representative educational values; printed parts should use measured
coupon data.

## Modules

| Folder | Page | What it teaches |
|---|---|---|
| `beam-section-map/` | Beam Section Design-Space Map | feasibility map, governing constraint, minimum-mass section, Pareto front, Ashby indices |
| `beam-fsd/` | Fully Stressed Tapered Beam | fully stressed design iteration, Galileo's parabolic cantilever, mass versus stiffness |
| `beam-supports/` | Support Placement and Worst-Case Load Position | supports as design variables, the 0.207 L overhang, influence lines |
| `truss-sizing/` | Truss Member Sizing | fully stressed design versus gradient sizing with analytical sensitivities, catalog rounding |
| `truss-topology/` | Ground-Structure Topology Optimization | optimality criteria and the Dorn, Gomory and Greenberg linear program |
| `truss-failsafe/` | Truss Redundancy, Load Cases and Reliability | single-member removal map, load-case envelope, Monte Carlo reliability |
| `truss-shape/` | Truss Shape Optimization | node positions as variables, nested sizing, Nelder-Mead and CMA-ES |
| `wingbox-sensitivity/` | Wing Box Layout | sensitivity profile, active constraints, Lagrange multipliers as shadow prices, rib pitch, cap taper |
| `pareto-nsga2/` | Multi-Objective Design | NSGA-II, dominance, crowding, hypervolume |
| `constrained-bo/` | Constrained Bayesian Optimization | Gaussian process surrogate with honest uncertainty, constrained expected improvement |

Shared files: `shared/lab.css` (stylesheet), `shared/labkit.js` (canvas plotting kit), `shared/presets.js`
(material cards, section properties, the Wright Flyer type half-wing truss and Warren truss presets).

## Running the tests

The modules are plain ES modules with no runtime dependencies. From a checkout:

```
cd docs/wing-panel-stress-analyzer/optimization
node --test */*.test.js
```

Node 22 or newer is required for the built-in test runner. Each module folder also has a README with its model,
algorithm, verification and limitations.

## Serving locally

Module scripts need an HTTP origin (browsers block ES module imports from `file://`):

```
cd docs/wing-panel-stress-analyzer/optimization
python3 -m http.server 8000
```

then open `http://localhost:8000/`.

## Release

`RELEASE.json` records the version, scope and review status of this lab; `checksums.json` lists the SHA-256 of every
published file. The pages were written by Claude agents from a shared specification (`SPEC.md`), each with its own Node
test suite and a headless Chrome smoke test, and reviewed before release; they have not been independently validated
against a commercial finite-element code and do not claim to be.

## Independent review, 2026-11-08 (0.1.1)

The original 52 manifested files were recovered from the Claude artifact ZIP and all SHA256 values matched. Its original 186 tests passed before edits. The reviewed version passes 197 tests, including eleven independent validation groups. See `validation/REVIEW.json` for scope, checks and measured discrepancies. Run from this folder with Node 22:

```
node validation/run-tests.cjs
```

Scientific repairs: removed artificial compressive-wire stabilization; reject singular/cycling/unconverged tension-only active sets; re-activate released cables whose extension becomes tensile; withhold compressed-wire designs in the linear comparison; default member sizing to Warren; reject non-finite loads; correct the zero-scatter strict-limit reliability boundary. Original test assertions that accepted compressed wires were corrected, with their numerical comparisons preserved. The source release's 186/186 and browser claims are historical, not evidence of these repairs.

Comparison text now says the same budget cap, not identical evaluation counts: a tensor grid rounds down to k^n, while BO and random search spend the requested budget. Reported counts remain visible. Bar charts were replaced with category point profiles and an unfilled binned distribution profile. Model checking badges explicitly describe a fresh model solve.

Useful for teaching section sizing, stiffness/strength trade-offs, sensitivity, feasible sets and optimizer behavior. Material cards, Euler/local plate buckling, linear cable geometry and GP uncertainty remain educational approximations. No ANSYS/experimental validation, full wing/aeroelastic optimization, universal optimum, or structural approval is claimed. Existing course applications are untouched.
