# Third-party notices and file-to-source map: independent 2-D section solver (version 1.1.0)

`ui/wx-aero-results.js`, `window.WingAirfoilPanel2D`. What each part is and where it comes from.

| Part (function or block) | Status | Source |
|---|---|---|
| `solveLinear` (pivoted Gaussian elimination) | unchanged | published solver (own code) |
| `influences` (velocity of the unit linear vortex sheets, analytic) | unchanged | published solver (own code) |
| `streamInfluences` (stream function of the same sheets, analytic: integrals of ln r and s ln r) | new | derived here |
| `inside` (even-odd point-in-polygon) | new | standard algorithm, written here |
| equations: psi(node i) = psi0 at the N distinct nodes, Kutta gamma0 + gammaN = 0 | new implementation | the stream-function linear-vorticity formulation: M. Drela, "XFOIL: An Analysis and Design System for Low Reynolds Number Airfoils" (1989); J. Katz and A. Plotkin, *Low-Speed Aerodynamics*, 2nd ed., sec. 11.4. Formulation references only; no code from either |
| trailing-edge closure: zero interior velocity along the interior bisector of the edge angle, at half the shorter edge panel inside the edge | new | an interior condition of this kind is used by XFOIL for sharp edges. XFOIL is GPL and served only as a reference calculation (the reviewer's official 6.99 runs); no XFOIL source code was copied. The bisector here is the interior bisector of the two edge panels (well defined for a cusp), and the point (half the shorter edge panel) was chosen against the exact conformal solutions (`validation/test_airfoil_2d_te.cjs` records the sensitivity) |
| surface velocity v = inner flow + sheet jump, inner flow = 0, jump = -gamma t | adapted | MachLine `panel_get_velocity_jump`, `panel_get_velocity` (src/panel.f90, commit d62befa): v = U (inner_flow + dv), the 3-D jump (tangential doublet gradient + source normal term) reduced to a 2-D vortex sheet |
| quadratic panel Cp from the two vertex values and the mid-point value | adapted | MachLine `panel_get_quadratic_pressure_params` (vertex + edge mid-point samples of a triangle, 6 coefficients) reduced to a straight panel (3 coefficients, closed form) |
| exact integral of the quadratic panel Cp (`integrated.cl`, `.pressureDrag`) | adapted | MachLine `panel_get_avg_pressure_coef` (area moments of the triangle) reduced to the 1-D moments of [-1/2, 1/2] |
| panel couple about its mid-point (`integrated.cm`) | adapted | MachLine `panel_get_moment_about_centroid` (first moments of the quadratic Cp crossed with the normal) reduced to a straight panel: L^2 c1 / 12 |
| `cl`, `cm`, `pressureDrag` (Cp at the mid-point times the panel length) | unchanged convention | published solver |
| `section` | unchanged | published solver |

Inspected and not used:
- AeroSandbox `AirfoilInviscid` (MIT, github.com/peterdsharpe/AeroSandbox, commit edad83d). It enforces zero normal
  velocity at the panel mid-points plus gamma0 + gammaN = 0: the same formulation as the earlier published solver, which
  is what fails at the trailing edge. Adopting it would reproduce the defect.
- PANAIR: not used in this 2-D change.

## MachLine licence (adapted formulas, see the table)

MIT License

Copyright (c) 2021 USU Aero Lab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
