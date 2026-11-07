# Solid foam and bonded inserts

Select Solid foam volume under Construction & material. The airfoil volume replaces the hollow printed shell. Rods and spars replace their own volume of foam: material is not counted twice. Separate ribs are not added. Rods require Bonded; a bonded insert has no clearance. Frictionless contact or local crushing of a foam channel is not implemented.

The current reinforced construction is a straight constant-chord wing with a positive tip chord, one continuous body and full-span bonded inserts. Rods and spars are compared separately. No outer composite fabric skin is assumed. The printed hollow CAD exporter is explicitly unavailable for this construction; JSON preserves it.

## Equations and numerical admission

Axial/bending constitutive integrals use the actual nonoverlapping material polygons: EA = integral(E dA), E-weighted centroid and complete unsymmetric EI tensor. Total mass = integral(rho dA ds), with the occupied insert volume removed from foam. Circular rods use a declared 64-sided geometric approximation; the independent benchmark compares to exact circular area/inertia and reports the discrepancy.

A single constrained triangulation conforms to material interfaces. Nested P1 refinement minimizes the heterogeneous Saint-Venant torsion energy integral G*|grad(w)+(-z,x)|^2 dA. Relative change in torsion stiffness must fall below 0.3%; true equilibrium, energy identity and rigid coordinate rotation are checked. The Trefftz shear centre uses E-weighted warping integrals. The auxiliary unit-shear functions use the existing Poisson-zero approximation, with G-weighted stiffness and E-weighted bending source. They are a neglected-shear diagnostic, not a 3D shear-deformable solid solution.

The section Neumann solve preserves the constant-potential mode using potential differences, incomplete-Cholesky PCG and compensated true-residual corrections. The unit-shear potential is solved in normalized physical units to avoid enormous intermediate values. Numerical criteria are not changed to make a design pass.

The spatial beam remains small-displacement Euler-Bernoulli. The optional static two-way solver uses finite rotations and small elastic strain. Foam cases additionally check an illustrative 1% small-strain screen and a 1% neglected-shear estimate. Neither is a material strength allowable. No foam tensile/compressive/shear strength, adhesive failure, crushing, local buckling, section distortion, stall, flutter or flight safety is certified.

## Independent checks

* `test_solid_foam.cjs`: homogeneous solid volume/mass; unsymmetric Euler-Bernoulli bending; rectangle torsion series and shear-area reference; unused shell-thickness invariance; material JSON round trip.
* `scripts/validation/test_reinforced_foam.cjs`: composite concentric-cylinder exact torsion; complete 900 mm foam wings with two rods and two spars versus independent composite EI and mass formulas.
* `scripts/validation/compare_900mm_layouts.cjs`: identical Clark Y outer shape, Fine pressure sequence and flow for all internal layouts; 40/80-element refinement when selected.

EPS100 E=6 MPa, density=20 kg/m3 and nu=0.1 are illustrative inputs consistent with the example in [EOTA TR019](https://www.eota.eu/sites/default/files/uploads/Technical%2520reports/tr019total.pdf). They are not measured Aeroclub foam properties and no strength values are invented.
