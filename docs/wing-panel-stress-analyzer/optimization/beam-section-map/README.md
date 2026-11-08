# Beam Section Design-Space Map (beam-section-map 0.1.1)

Module of the MIE 446 Optimization Lab. The student has already sized a beam cross-section by hand; this
page shows where that design sits in the two-parameter design space of its section family, which
constraint governs, how far it is from the minimum-mass feasible design, the mass against deflection
trade-off (Pareto front) and how the material cards compare for the same task.

## Files

- `beam-section-map.js`: pure ES module (no DOM). Closed-form beam checks, grid, boundary bisection,
  pattern-search refinement, verification, Pareto front, classical formulas, material comparison.
  Imports only `../shared/presets.js` (material cards, `sectionProps`).
- `index.html`: the page. Thin glue: reads the inputs, calls the module, draws with `../shared/labkit.js`.
- `beam-section-map.test.js`: Node tests (`node --test optimization/beam-section-map/beam-section-map.test.js`
  from `/home/claude/optlab`).
- `README.md`: this file.

## Scope and model

Euler-Bernoulli beam, linear elastic, small deflection, constant section, one static load. Supports:
cantilever clamped at x = 0 or simply supported. Loads: point load P at x = a, or a uniform load w over
the full span. Loads are used as magnitudes; in the linear model the utilizations do not depend on the load
direction, so the lab sign convention (y up, loads positive upward, sagging moment positive) changes no
number on the page. Units: mm, N, MPa, g/cm^3, g, with mass_g = A L rho / 1000.

Closed forms (M_max, maximum deflection):

- cantilever, point load at a: M_max = P a at the clamp; v_tip = P a^2 (3L - a) / (6 E I)
- cantilever, uniform load: M_max = w L^2 / 2; v_tip = w L^4 / (8 E I)
- simply supported, point load at a with b = L - a: M_max = P a b / L;
  v_max = P b (L^2 - b^2)^(3/2) / (9 sqrt(3) L E I) for a >= b, mirrored otherwise
  (the code uses b = distance from the load to the nearer support)
- simply supported, uniform load: M_max = w L^2 / 8; v_max = 5 w L^4 / (384 E I)

Stress: sigma_max = M_max c / I. Utilizations: U_stress = sigma_max FS / sigma_allow,
U_defl = v_max / (L / k), U_thick = t_min / (smallest wall or dimension of the section). Feasible when
every U <= 1 (tolerance 1e-9). A utilization between 0.9 and 1 is reported as near the limit.

Section families and map parameters (x horizontal, y vertical): solid rectangle (b, h), circular tube
(D, t) and rectangular box (h, t) with width b = beta h. Section properties come from
`sectionProps` in the shared presets.

## Algorithm

1. Grid. The two parameters are sampled on an n by n grid (n from 40 to 160, default 90) over the map
   ranges. Every cell is evaluated exactly with the closed forms. Infeasible cells are hatched; geometrically
   impossible cells (tube with D <= 2 t, box with walls thicker than half a side) are drawn grey and excluded.
   Default ranges are derived from the student's values: dimensions from max(t_min, value / 4) to 2.5 times
   the value, wall thicknesses from min(t_min / 2, value / 2) to max(3 times the value, 2 t_min), rounded to
   two significant digits. Unticking "derive the ranges from my design" makes the four limits manual.
2. Refinement. Starting at the lightest feasible grid cell, a boundary-following pattern (compass) search
   runs on the first parameter with step halving down to 1e-7 of the range. For every trial value of the first
   parameter the smallest feasible second parameter is found by bisection on max(U) = 1, which is exact because
   all three utilizations are monotone non-increasing in each parameter for the three families (a larger
   section is stiffer, stronger and thicker). Every trial point is therefore feasible by construction and no
   penalty is needed. The search is deterministic.
3. Verification. The refined design is re-solved from scratch (`verifyDesign`) and all constraints are
   re-checked; only the verified numbers are shown, with the badge "Checked by fresh model solve". If the
   re-check failed the page would fall back to the best grid cell and say so. The nearest lighter feasible
   design (feasible grid cell lighter than the student's design that minimizes the normalized Euclidean
   distance in parameter space) is verified the same way.
4. Governing constraint. The utilization closest to 1 at the optimum. When a structural constraint (stress or
   deflection) and the minimum thickness are both active, the structural one is named and the other listed as
   also active. The page also says when the optimum sits on an edge of the map range.
5. Pareto panel. Candidates are the grid cells that satisfy stress and minimum thickness. The non-dominated
   set for (mass, deflection), both minimized, is found by sorting on mass and keeping the points whose
   deflection is below that of every lighter point. The student's point is labelled non-dominated or dominated
   by N designs (candidates at least as light and at least as stiff, one strictly). Up to 15 front points
   inside the plotted window are tabulated; the CSV holds the whole front.
6. Material comparison. For every card the same grid, refinement and verification are run with that card's
   E, allowable stress and density over the same map range. The table lists the verified minimum mass, its
   rank, the governing constraint, the optimum parameters and the Ashby indices E^(1/2)/rho (stiffness-limited
   beam) and sigma_allow^(2/3)/rho (strength-limited beam), normalized to the best card, with their ranks.
   The material rows are computed one card per timer tick with a progress bar and a Cancel button.
7. Slenderness screen. h/b, D/t or h/t of each design is shown as a screening number only; the model has no
   lateral-torsional or local buckling check, so it is never a pass or fail.

## Classical checks shown on the page

Rectangle with the width fixed at b: stress-governed depth h = sqrt(6 M_max FS / (b sigma_allow)),
deflection-governed depth h = (12 I_req / b)^(1/3) with I_req = (deflection coefficient) / (E L / k), and
h >= t_min. The largest is h*. It is shown at the student's width and at the optimum's width next to the
numerical boundary from bisection; the two agree to better than 1e-6 relative. Example (printed-spar preset,
PLA, L = 600 mm, P = 20 N at the tip, FS = 2, k = 50): at b = 12 mm, h_stress = 16.33 mm, h_defl = 32.49 mm,
so deflection governs and the 12 x 24 mm design is infeasible (U_defl = 2.48); at the optimum width
b = 3 mm (map edge), h* = 51.57 mm, mass 115.1 g against 214.3 g, a 46.3 percent saving.

Tube and box: thin-wall estimates at fixed wall t (tube I ~ pi D^3 t / 8, box with b = beta h
I ~ t h^3 (beta / 2 + 1 / 6)) are shown beside the exact boundary; the difference shrinks as the wall gets
thinner (4 percent at D/t = 25, about 1 percent at D/t = 85 for the ss-udl preset).

## Tests

`node --test optimization/beam-section-map/beam-section-map.test.js` (Node 22, no packages) checks: the
cantilever tip deflection P L^3 / (3 E I) and the inboard-load form; the cantilever uniform load; the simply
supported uniform load 5 w L^4 / (384 E I) and w L^2 / 8; the simply supported point load (midspan
P L^3 / (48 E I), mirror symmetry, the general closed form, load direction independence); the grid optimum
for a rectangle with fixed b within 3 percent of h* when stress governs, and the refined optimum within
1e-6; the free rectangle optimum at b = t_min with mass matching the closed form; the tube optimum at t_min
on the deflection boundary; the feasibility mask for thin tubes (t < t_min); the non-dominated set on a
hand-made 5-point set; the Pareto front ordering on a real grid; verification rejecting U > 1; invalid inputs
(L <= 0, negative E, D <= 2 t, bad ranges) returning error objects without NaN; the material comparison
indices and ranks; default ranges and the nearest lighter feasible cell; and the speed of a 160 x 160 run.

## Limitations

- No shear deformation or shear stress check, no self-weight, a single static load case, constant section.
- No lateral-torsional buckling (deep narrow rectangles) and no local buckling (thin tube or box walls). The
  model therefore rewards very slender sections; the slenderness screen is only a reminder.
- Material cards are representative educational values, not certified allowables; printed parts are
  anisotropic and need coupon data.
- The optimum is the lightest design inside the map range. When it touches a range edge the unconstrained
  optimum of this model lies outside the map; the page says so.
- The material comparison is restricted to the current map range; a card with no feasible design inside the
  range is reported as such rather than extrapolated.
- The steel bracing-wire card is a tension-member card and is listed only for completeness.

## References

- J. M. Gere and S. P. Timoshenko, Mechanics of Materials (beam deflection tables).
- W. C. Young and R. G. Budynas, Roark's Formulas for Stress and Strain.
- M. F. Ashby, Materials Selection in Mechanical Design (material indices for beams).
- R. Hooke and T. A. Jeeves, "Direct search" solution of numerical and statistical problems, J. ACM 8, 1961
  (pattern search).
