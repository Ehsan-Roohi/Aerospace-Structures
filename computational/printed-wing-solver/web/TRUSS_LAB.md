# Truss Virtual Lab

Open `docs/truss-lab.html` through the course site, or use the Truss Lab link in Beam Virtual Lab.

## Model and units

The direct-stiffness solver uses two global translations per joint and straight, pin-ended axial bars. Coordinates and displacements are mm, forces N, E and stress MPa, area mm². Axial force/stress is positive in tension. Global +x is right and +y is up. Node pin restraints fix both translations; the Y roller fixes only vertical translation and the X roller fixes only horizontal translation. Distinct crossing members are not automatically connected.

The normal workspace starts with no nodes, members, loads or supports. An explicitly selected generic braced-bay example is available. It is not a reconstruction of a Wright aircraft. Member materials and cross-sectional areas are independent. Loads are joint forces; moments and loads between joints require a frame/beam model, not this truss formulation.

The solver rejects singular/nearly singular free stiffness systems rather than adding artificial restraints. Edits invalidate results and disable CSV export. A separate reaction-FBD view replaces support symbols with solved reaction vectors. Force arrow lengths are schematic, not quantitative. The deformed geometry is visually amplified with its scale displayed; numerical displacement is reported separately.

The drawing toolbar includes nodal force and pin/roller placement, with a closable force editor. Forces and restraints can be selected and deleted independently of their node. Grid snapping, alignment to existing node coordinates and cursor guides support exact construction; the two axes use one geometric scale. Typed coordinates remain exact and are not silently snapped.

Wire members use the unilateral small-displacement law N=max(0,EA ΔL/L), zero initial slack, no pretension. Active-set iteration releases compressed wires and reactivates stretched ones; a bounded exhaustive fallback handles at most 10 wires if the active-set iteration cycles or encounters an intermediate singular tangent. Accepted results satisfy signed equilibrium and unilateral extension conditions. Failure to converge is reported, not hidden by compression stiffness. A slack wire has zero force/elastic strain although its joint-to-joint separation can decrease. Zero-force boundary wires are explicitly labelled and do not guarantee stability under a changed load.

For bars with an entered weakest-axis Imin and positive effective length factor K, Euler screening reports Pcr=π² E Imin/(K L)², KL/r, and compression/Pcr. Missing Imin is NOT CHECKED, never a pass. Use the actual unbraced length and justified end restraints; Euler assumes slender, straight, elastic members. This is not global eigenvalue buckling, plastic/local buckling, or a post-buckling solve. Exceeding Pcr invalidates interpreting the displayed linear response as a safe capacity.

Not included: prestress, sag/catenary and geometric/material nonlinearity, global truss buckling, joint/contact failures, automatic self-weight, three-dimensional loading or airworthiness validation.

## Build and verify

`python computational/printed-wing-solver/web/build_wing_lab.py` builds both workspaces. `build_truss_lab.py` builds the standalone truss page alone.

Run `node test_truss.mjs` for exact axial-bar and triangular-truss benchmarks, load reversal, stiffness scaling, member-orientation invariance, strain-energy/work and global-equilibrium checks, and invalid/mechanism cases. Run `node test_truss_ui.mjs` with jsdom available (or `MIE446_JSDOM_MODULE` set) for controller, selection/deletion, export-action, stale-result and failure-path checks. These DOM tests do not replace browser rendering checks.

`test_truss_wires.mjs` checks crossed-wire load reversal, exact brace/reaction forces, slack-wire complementarity, equilibrium, member-order invariance and Euler scaling. `test_truss_tools.mjs` checks snapping, toolbar load/support placement, selective Delete, wire creation and the Euler-limit warning. `test_support_slice_dimensions.mjs` verifies the numerical station and ε→0 interpretation of beam support-slice diagrams.
