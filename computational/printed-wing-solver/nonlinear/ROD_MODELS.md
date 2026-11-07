# Bonded rods and frictionless sleeves

The existing Connections > Rods in sleeves choice (`assembly.rodsBonded`) now selects two different multi-beam mechanical systems. Both clamp all six DOFs at the physical root of the shell and of every rod. Integral sleeves follow the shell section. Module seams must be bonded. The circular rod/sleeve must fit inside the cavity, without overlapping another sleeve. Mixed rods/spars and exact zero-chord tips retain their existing restrictions.

Bonded rods use separate spatial frame beams and exact rigid-offset centreline translation and axial-spin coordinate ties, with independent transverse rod bending rotations. Rod axial force, biaxial bending and torsion contribute, including eccentricity. This is an embedded line-bond idealization. Rod bending rotations remain independent so eccentric centre lines can follow changes in wing twist. It is not a bonded 3D continuum or adhesive failure model.

Sleeve rods have independent translations and rotations. Only transverse relative motion in the local bore plane is constrained by the actual radial clearance (`geometry.clearance`, mm). Axial sliding and rod spin remain free. Contact is compressive only, frictionless, and may separate. A convex dual solver uses exact two-component coordinate minimization and safeguarded Newton steps. Circular-gap violation must be below 1e-6 mm; equilibrium and contact work are checked. The zero-clearance radial limit is solved directly. Forces are equal and opposite and include the shell offset moments. This is a beam/contact idealization with a rigid sleeve cross-section, not a 3D bearing-pressure or crushing model. Sleeve contact is sampled at beam stations; refine the longitudinal mesh.

Rod gravity is applied on each rod path and removed from the shell equivalent gravity load, preventing double counting. Rod mass is separately reported. Shell nominal stress comes from the shell element strains, rather than incorrectly dividing the total shell-plus-rod wrench by shell stiffness. End-zone and local-strength exclusions remain.

## Independent numerical reference

Run `node computational/printed-wing-solver/nonlinear/test_rod_system.cjs`. The reference does not use a second run of the frame solver. Bonded eccentric symmetric rods are checked against `EI_composite = EI_shell + 2 E_rod (I_rod + A_rod z^2)` and `w_tip=P L^3/(3 EI_composite)`, with 12/24/48-element convergence. Finest relative tolerance: 0.1%.

For two coaxial prismatic clamped beams with tip loading, `ks=3 EIs/L^3`, `kr=3 EIr/L^3`. Before contact `ws=P/ks`; after contact `ws=(P+sign(P) kr gap)/(ks+kr)`. Their relative cubic displacement is bounded by the tip gap at every interior position, so this reference also satisfies a continuous sleeve, not just a tip collar. Test positive/negative load, open/closed contact, zero/positive clearance, arbitrary transverse direction, and absence of axial friction. Tip tolerance: 1e-7 mm. Matching displacement profiles are exported in the report.

Run `test_rod_wing.cjs` for actual tapered 900 mm wing integration, two longitudinal meshes, both choices, gravity off/on and applied aerodynamic strip wrenches. Equilibrium, energy (including contact work), mass and penetration are checked. These are independent analytical verification and integration checks, not experimental validation of a real wing.

## Finite-rotation limitation

Both new multi-beam rod models use small-displacement kinematics. The usual displacement/rotation screen is retained. The separate two-way finite-rotation single-beam solver explicitly refuses rod cases rather than discarding the extra rod fields or treating frictionless contact as a bond. Large-displacement multi-beam contact, friction, dry module seams, adhesive failure and bearing strength are not implemented. A failed numerical/model screen is not an aircraft design allowable.

Primary formulation references: [Abaqus tie constraints](https://docs.software.vt.edu/abaqusv2026/English/SIMACAEKEYRefMap/simakey-r-tie.htm), [GetFEM unilateral contact formulation](https://getfem.org/userdoc/model_contact_friction.html). These explain the interface laws; neither validates this implementation.

## Saved Clark Y pressure regression and numerical precision repair

`test_rod_saved_pressure.cjs` uses the actual saved 900 mm semi-span, constant 400 mm chord Clark Y case: one 4 mm rod at quarter chord, 0.25 mm radial clearance, and all eight Fine pressure meshes at 50 m/s, alpha=0. The vertical semi-wing pressure resultant is 140.8786467263 N. The former 1 N single-strip integration test did not cover this case.

Before repair the original saved sleeve case failed the 1e-7 energy check with a relative error of approximately 1.0045e-6. Its pressure boundaries forced extra, sometimes short structural elements, worsening numerical conditioning. Pressure strips are now integrated with their original six components on an independent structural mesh. Every pressure boundary remains a nominal stress sampling location. No load component is removed or rescaled.

The linear solves use independent uncoupled beam blocks where valid, with compensated-residual iterative refinement. Energy is integrated from the positive section strain-energy density, including the condensed axial mode, rather than subtracting large cancelling matrix products. Contact compliance is made reciprocal at roundoff precision; Newton globalization checks the actual contact KKT residual. The final check recomputes contact compatibility from the recovered displacement field. The original force, moment, energy and gap limits are unchanged.

The saved-pressure regression checks both rod choices on 20/40/80-element structural meshes. The 40/80 tip-deflection difference must be below 0.2%. The actual aerodynamic admission path is also checked for the saved sleeve case; a failed aeroelastic coupling test stays failed even if a qualified prescribed-load response is available. Structural failures are reported as failed in the Aerodynamics panel, not left as solving.

Independent sleeve beams now use a force-based cantilever flexibility operator: integrate the inverse 4x4 section law against the exact outboard nodal force and moment, then integrate the small-rotation kinematics. This is algebraically equivalent to the existing prismatic condensed Euler–Bernoulli frame elements, but avoids their globally ill-conditioned stiffness inverse. Bonded ties retain assembled stiffness. `test_rod_flexibility.cjs` cross-checks the two independent formulations on curved, nonuniform, fully coupled 3D sections and consistent distributed loads, including the axial bubble. The actual primal displacement is re-solved and checked after contact; compliance defects are corrected without changing physical loads or clearances.

The eccentric-torsion regression includes the independent gradient-energy boundary-layer solution; coaxial torsion alone cannot detect eccentric beam locking. Bonded foam inserts use conforming heterogeneous material sections instead of these separate line ties. Frictionless foam-channel contact remains unavailable.
