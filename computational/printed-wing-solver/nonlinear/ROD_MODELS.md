# Bonded rods and frictionless sleeves

The existing Connections > Rods in sleeves choice (`assembly.rodsBonded`) now selects two different multi-beam mechanical systems. Both clamp all six DOFs at the physical root of the shell and of every rod. Integral sleeves follow the shell section. Module seams must be bonded. The circular rod/sleeve must fit inside the cavity, without overlapping another sleeve. Mixed rods/spars and exact zero-chord tips retain their existing restrictions.

Bonded rods use separate spatial frame beams and exact rigid-offset six-DOF coordinate ties. Rod axial force, biaxial bending and torsion contribute, including eccentricity. This finite-element tie discretization converges to the composite-section solution; it is not an adhesive constitutive or failure model.

Sleeve rods have independent translations and rotations. Only transverse relative motion in the local bore plane is constrained by the actual radial clearance (`geometry.clearance`, mm). Axial sliding and rod spin remain free. Contact is compressive only, frictionless, and may separate. A convex dual solver uses exact two-component coordinate minimization and safeguarded Newton steps. Circular-gap violation must be below 1e-6 mm; equilibrium and contact work are checked. The zero-clearance radial limit is solved directly. Forces are equal and opposite and include the shell offset moments. This is a beam/contact idealization with a rigid sleeve cross-section, not a 3D bearing-pressure or crushing model. Sleeve contact is sampled at beam stations; refine the longitudinal mesh.

Rod gravity is applied on each rod path and removed from the shell equivalent gravity load, preventing double counting. Rod mass is separately reported. Shell nominal stress comes from the shell element strains, rather than incorrectly dividing the total shell-plus-rod wrench by shell stiffness. End-zone and local-strength exclusions remain.

## Independent numerical reference

Run `node computational/printed-wing-solver/nonlinear/test_rod_system.cjs`. The reference does not use a second run of the frame solver. Bonded eccentric symmetric rods are checked against `EI_composite = EI_shell + 2 E_rod (I_rod + A_rod z^2)` and `w_tip=P L^3/(3 EI_composite)`, with 12/24/48-element convergence. Finest relative tolerance: 0.1%.

For two coaxial prismatic clamped beams with tip loading, `ks=3 EIs/L^3`, `kr=3 EIr/L^3`. Before contact `ws=P/ks`; after contact `ws=(P+sign(P) kr gap)/(ks+kr)`. Their relative cubic displacement is bounded by the tip gap at every interior position, so this reference also satisfies a continuous sleeve, not just a tip collar. Test positive/negative load, open/closed contact, zero/positive clearance, arbitrary transverse direction, and absence of axial friction. Tip tolerance: 1e-7 mm. Matching displacement profiles are exported in the report.

Run `test_rod_wing.cjs` for actual tapered 900 mm wing integration, two longitudinal meshes, both choices, gravity off/on and applied aerodynamic strip wrenches. Equilibrium, energy (including contact work), mass and penetration are checked. These are independent analytical verification and integration checks, not experimental validation of a real wing.

## Finite-rotation limitation

Both new multi-beam rod models use small-displacement kinematics. The usual displacement/rotation screen is retained. The separate two-way finite-rotation single-beam solver explicitly refuses rod cases rather than discarding the extra rod fields or treating frictionless contact as a bond. Large-displacement multi-beam contact, friction, dry module seams, adhesive failure and bearing strength are not implemented. A failed numerical/model screen is not an aircraft design allowable.

Primary formulation references: [Abaqus tie constraints](https://docs.software.vt.edu/abaqusv2026/English/SIMACAEKEYRefMap/simakey-r-tie.htm), [GetFEM unilateral contact formulation](https://getfem.org/userdoc/model_contact_friction.html). These explain the interface laws; neither validates this implementation.
