# Truss Virtual Lab

Open `docs/truss-lab.html` through the course site, or use the Truss Lab link in Beam Virtual Lab.

## Model and units

The direct-stiffness solver uses two global translations per joint and straight, pin-ended axial bars. Coordinates and displacements are mm, forces N, E and stress MPa, area mm². Axial force/stress is positive in tension. Global +x is right and +y is up. Node pin restraints fix both translations; the Y roller fixes only vertical translation and the X roller fixes only horizontal translation. Distinct crossing members are not automatically connected.

The normal workspace starts with no nodes, members, loads or supports. An explicitly selected generic braced-bay example is available. It is not a reconstruction of a Wright aircraft. Member materials and cross-sectional areas are independent. Loads are joint forces; moments and loads between joints require a frame/beam model, not this truss formulation.

The solver rejects singular/nearly singular free stiffness systems rather than adding artificial restraints. Edits invalidate results and disable CSV export. A separate reaction-FBD view replaces support symbols with solved reaction vectors. Force arrow lengths are schematic, not quantitative. The deformed geometry is visually amplified with its scale displayed; numerical displacement is reported separately.

Not included: cable slackening/tension-only action, prestress, geometric/material nonlinearity, Euler/member buckling, joint/contact failures, automatic self-weight, three-dimensional loading or airworthiness validation. In particular, a slender compressed bracing wire cannot be validated with an axial bar that permits compression.

## Build and verify

`python computational/printed-wing-solver/web/build_wing_lab.py` builds both workspaces. `build_truss_lab.py` builds the standalone truss page alone.

Run `node test_truss.mjs` for exact axial-bar and triangular-truss benchmarks, load reversal, stiffness scaling, member-orientation invariance, strain-energy/work and global-equilibrium checks, and invalid/mechanism cases. Run `node test_truss_ui.mjs` with jsdom available (or `MIE446_JSDOM_MODULE` set) for controller, selection/deletion, export-action, stale-result and failure-path checks. These DOM tests do not replace browser rendering checks.
