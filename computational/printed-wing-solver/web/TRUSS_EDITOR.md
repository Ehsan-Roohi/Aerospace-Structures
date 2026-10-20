# Truss editor and nodal load transfer

The page starts empty, without loads or supports. Coordinates and physical lengths use mm, forces N, line intensities N/mm, E MPa, and member area mm². The drawing has equal x/y scale, visible square-grid cells, optional grid snapping and independent alignment with existing nodes. Zoom and Fit alter the view only.

In Select mode, drag a node to update its coordinates and connected members; coincident nodes are rejected rather than silently merged. Click without dragging to open the node/member/support property dialog. Force arrows open their magnitude/direction editor. Delete acts on the selected object, except within text-entry controls. Deleting a node removes its connected members and any load-transfer path using it. Undo/Redo restores up to 100 model states, including clear and dependent deletion; it invalidates old results rather than restoring a stale solution. A drag commits one undo step. Cancelled drags restore their starting model.

Point forces can be entered as Fx/Fy or nonnegative magnitude and angle measured counter-clockwise from global +x. A point-force edit replaces that node's manual resultant; it does not apply it again. Distributed-load contributions are stored separately and superposed only during solution.

## Support direction

An inclined roller has a surface/sliding tangent t=(cos α,sin α) and normal n=(−sin α,cos α). Its permissible displacement is u=t a and its reaction is normal to the surface. The reduced stiffness is BᵀKB and the reduced load BᵀF, where B contains permissible nodal directions. Reactions are recovered globally and checked for equilibrium. This is a bilateral linear restraint, not unilateral contact, lift-off or friction. A pin restrains both translations; rotating its symbol does not turn it into a one-direction restraint. The visual green handle rotates the support, in 5° increments; the property dialog accepts an exact entered angle.

## Distributed loads: explicit collection-path assumption

An ideal pin-jointed truss carries external forces at joints and axial force in its members. A transverse load on a real member also creates bending, which this solver does not resolve. The distributed-load tool therefore represents an external load collector (such as a specified idealized rib/spar/skin load path) transferring forces to an ordered sequence of nodes. It does not automatically analyze an aircraft covering or invent its stiffness.

Intensity varies linearly along cumulative actual path length, with a constant global force direction. For each straight interval of length ℓ, endpoint intensities qa,qb produce Fa=ℓ(2qa+qb)/6 and Fb=ℓ(qa+2qb)/6. These are integrals of the linear endpoint weighting functions against q(s); they preserve both resultant and moment. Contributions at shared nodes are added. For uniform loading and equally spaced nodes the interior joint receives twice an end joint's share. For a triangular load the endpoint shares are not equal. An actual flexible/continuous collector can redistribute loads: solve it as a beam/frame and transfer its connection reactions when its behavior matters.

Results and CSV separate manual, transferred and total nodal forces. No nodal couple is accepted because the axial truss has no rotational degree of freedom. Wing pressure-to-rib loading, front/rear spar load sharing, torsion, joint flexibility, pretension and geometrically nonlinear cable action require additional explicit models. The optional generic bays are teaching geometry, not a validated historical Wright aircraft reconstruction.

## Verification

`test_truss.mjs` checks analytical bars/triangles, energy, sign reversal and mechanisms. `test_truss_wires.mjs` checks tension-only active sets and Euler screening. `test_truss_tools.mjs` and `test_truss_ui.mjs` check the existing interaction/export behavior. `test_truss_editor.mjs` adds rotated-model equivalence for inclined rollers, uniform/triangular equivalent loads and moment preservation, superposition, modal editing, a snapped drag, undo/redo, polar force input, dependent deletion, and stale-result handling. Browser drag, modal editing, support angle and a loaded solve are also checked separately. These checks do not certify aircraft strength or physical buckling capacity.

References: [NASA: centre of pressure and distributed aerodynamic pressure](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/center-of-pressure/); [Engineering Mechanics: load collection into truss joints](https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Engineering_Mechanics_-_Statics_%28Osgood_Cameron_and_Christensen%29/05%253A_Trusses/5.01%253A_Trusses_Introduction).
