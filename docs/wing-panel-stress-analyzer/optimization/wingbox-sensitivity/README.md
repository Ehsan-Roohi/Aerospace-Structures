# Wing Box Layout: Sensitivities, Active Constraints and Shadow Prices

Module `wingbox-sensitivity` of the MIE 446 Optimization Lab. Published at
`.../wing-panel-stress-analyzer/optimization/wingbox-sensitivity/index.html`.

## Scope and independence

This page sizes a straight, untwisted, cantilevered half wing with its own simplified thin-walled wing box
model, written for this page alone. It is independent of the Wing AeroStruct solver on the same site: there is
no panel method, no coupled aeroelasticity, no certified strength data (the material cards in
`../shared/presets.js` are educational values). The page exists to teach what sensitivities, active constraints
and Lagrange multipliers (shadow prices) mean for a wing layout. Every design presented is re-solved from
scratch with the same solver before it is shown (propose, then verify). Nothing here is a certified strength
or safety statement.

Files:

- `wingbox-sensitivity.js` pure ES module (no DOM): loads, section response, tornado, SLP optimizer, KKT
  multiplier estimator, shadow prices, rib pitch and cap taper studies. Imports only `../shared/presets.js`.
- `index.html` the page (thin glue: read inputs, call the module, render with `../shared/labkit.js`).
- `wingbox-sensitivity.test.js` Node tests (`node --test optimization/wingbox-sensitivity/wingbox-sensitivity.test.js`
  from `/home/claude/optlab`).

Units: length mm, force N, stress and modulus MPa, density g/cm^3, mass g, angles degrees.

## Model

Geometry. Linear chord taper c(y) from c_r to c_t over the half-span s. The spar box lies between 15 and 60
percent chord: width w(y) = 0.45 c(y), height h(y) = 0.9 tau c(y). Skins of thickness t_s (top and bottom),
front and rear spar webs of thickness t_w, four spar caps of area A_cap each, n_r equally spaced ribs of
thickness t_r at y = b, 2b, ..., s with b = s / n_r, rib area approximated by the box section w h.
Skins, webs and ribs share one material card; the caps have their own.

Loads. The half wing carries L_half = n m g / 2 (g = 9.81 m/s^2). Elliptic lift l(y) = l_0 sqrt(1 - (y/s)^2)
with l_0 = 4 L_half / (pi s); a uniform distribution is available as a closed-form test switch. Shear, bending
moment and torque are integrated from the tip with the trapezoidal rule on 201 stations (200 intervals).
Torque per unit span: section pitching moment q c^2 c_m (q = 0.5 rho V^2, rho = 1.225 kg/m^3; the airspeed is
used only here) plus the lift offset between the aerodynamic centre at 25 percent chord and the box shear
centre taken at the box mid-width (37.5 percent chord), so lift acts 12.5 percent chord ahead of the shear
centre. Nose-up torque is positive; lift and deflection are positive upward.

Section response at each station.

- Bending inertia with caps and skins as lumped flanges, webs neglected: I = 2 (2 A_cap)(h/2)^2 + 2 w t_s (h/2)^2.
- Modulus weighted stiffness EI = E_cap I_cap + E_skin I_skin. Outer fibre strain M (h/2) / EI; cap stress
  E_cap times the strain, skin stress E_skin times the strain. The task text wrote sigma = M (h/2) / I; because
  the caps and skins have different moduli the page uses the modulus weighted form, which reduces to
  M (h/2) / I when the two moduli are equal (the deflection integral in the task already used EI = sum E_i I_i).
- Web shear flow V / (2 h), Bredt torsion shear flow T / (2 A_m) with A_m = w h; web shear stress is the sum of
  the two flows over t_w, skin shear stress is the torsion flow over t_s.
- U_stress = max over stations of (cap bending, skin bending, sqrt(3) web shear, sqrt(3) skin shear), each
  times FS and divided by the material allowable. The skin shear term is in addition to the three terms listed
  in the task.
- Buckling screen: sigma_cr = k pi^2 E_skin / (12 (1 - nu^2)) (t_s / b)^2 with the plate width equal to the rib
  pitch b; U_buckle = max upper skin compression times FS over sigma_cr. Labelled a screen: simply supported
  edges assumed, k = 4 is the long plate value.
- Deflection: M / EI integrated twice from the clamped root; U_defl = |v_tip| / (limit fraction times s).
- Twist: T / (G J) integrated from the root with G = E_skin / (2 (1 + nu)) and the Bredt-Batho
  J = 4 A_m^2 / (2 w / t_s + 2 h / t_w); U_twist = |twist_tip| / limit.
- U_thick = t_min / min(t_s, t_w, t_r).
- Mass in grams: skins 2 w t_s, webs 2 h t_w, caps 4 A_cap integrated along the span, plus the ribs, with the
  respective densities.

## Features

1. Baseline solve with utilization tiles and badges, spanwise plots of M, T, cap stress, skin and web stresses,
   local utilizations, deflection and twist, a checks table and a CSV export.
2. Sensitivity profile: each design variable (t_s, t_w, A_cap, n_r as plus or minus one rib, t_r, tau) perturbed by
   plus and minus 10 percent, one at a time; percent change of mass, tip deflection, tip twist and the largest
   structural utilization as grouped signed bars; table of elasticities d ln R / d ln x by central differences.
3. Minimum-mass sizing over x = (t_s, t_w, A_cap) for every rib count in the search range (default 2 to 16),
   subject to U_stress, U_buckle, U_defl, U_twist at most 1 and t_s, t_w at least t_min. Verified optimum
   (fresh solve), mass versus rib count, active set, multipliers, shadow price sentences and a shadow price
   check by re-optimization.
4. Rib pitch closed form b_max = t_s sqrt(k pi^2 E / (12 (1 - nu^2) sigma FS)) at the critical station, the
   minimum rib count ceil(s / b_max), and the skin plus rib mass versus rib count with the skin thinned to the
   buckling limit for each count (bisection on fresh solves), optimum marked.
5. Spar cap taper: A_cap(y) proportional to M(y) with a floor at 20 percent of the root cap (as specified), or
   proportional to M(y) / h(y) (the fully stressed law for a tapered depth). Cap mass saved at equal root
   stress, deflection penalty, stress distributions, verified feasibility of the tapered design.

Four scenario presets are offered: the task defaults (printed trainer, PLA skins and CFRP caps), a stiffness
critical variant (deflection limit 0.5 percent), spruce caps (the baseline fails the buckling screen) and a
twist critical variant (V = 40 m/s, c_m = -0.15, twist limit 0.5 degree). They exist so that students can see
different constraints become active.

## Optimization algorithm

Sequential linear programming with move limits, in the form that is robust for this small smooth problem:

- Work in relative variables u_i = (x_i - x_i,k) / x_i,k. Linearize the mass and the four structural
  utilizations by central finite differences (relative step 1e-3).
- Add a proximal term (mu / 2) |u|^2 scaled so that the unconstrained step has the length of the move limit; the
  step problem is then a tiny strictly convex quadratic program with the linearized constraints and the box
  |u_i| at most the move limit (and the bounds t at least t_min, A_cap at least 0.5 mm^2, t at most 20 mm,
  A_cap at most 500 mm^2). It is solved exactly by enumerating candidate active sets (at most 232 small KKT
  systems). When the active linearized constraints leave only a short projected step, the proximal weight is
  relaxed so that the step along the feasible directions uses the move limit. A plain LP solved at box
  vertices was tried first and zigzagged on curved constraints; the proximal QP step removes that.
- The trial point is pulled back onto violated constraints by up to three Newton corrections along the
  constraint gradients (minimum norm in the scaled variables), with uniform scaling of all three variables as a
  fallback (every utilization of this model decreases when t_s, t_w and A_cap grow together, so bisection is
  safe). Every accepted iterate is therefore feasible and the mass decreases monotonically.
- Trust region logic: the move limit starts at 20 percent; it is halved when a step is rejected, when the ratio
  of actual to predicted mass decrease is below 0.25, or when consecutive steps reverse direction; it is doubled
  (up to 20 percent) when the ratio exceeds 0.75 and the step hit the move limit. Stop after 60 iterations, when
  the move limit falls below 1e-4, when the linearized problem predicts no further decrease, or after three
  consecutive steps with negligible change.
- An infeasible start is first made feasible by the same restoration. Rib counts are an outer loop; the best
  verified design is reported, together with the mass of the verified optimum at every rib count.

The finished design is re-solved from scratch by `verifyDesign`, which rebuilds the model from the design
numbers and returns feasibility, utilizations, the governing constraint and the mass. The page shows this
verified result and the badge "Checked by fresh model solve", or a red badge with the violated check.

## Multipliers and shadow prices

Active set: constraints with U within 0.02 of 1, thicknesses within 2 percent of t_min, cap area within
2 percent of its lower bound. At the verified optimum the stationarity condition
grad m + sum_j lambda_j grad g_j = 0 (g_j = U_j - 1, or (t_min - t) / t_min for the bounds) is solved for
lambda_j at least 0 by exact non-negative least squares on finite-difference gradients, with rows scaled by
|x_i| so that variables with different units carry comparable weight. The relative residual of the balance is
reported (1e-11 for the default wing). Each lambda_j is grams per unit of the normalized constraint; the page
converts it to physical units, for example grams per millimetre of deflection limit (lambda / limit), and
prints a sentence such as "relaxing the tip deflection limit by 1 mm would save about 9.7 g, to first order".
The first-order prediction is then checked by re-optimizing with the limit relaxed by 1 percent (deflection or
twist limit, plate coefficient k, allowable stresses, or t_min lowered by 1 percent) and comparing the actual
saving with lambda times the change of the normalized constraint. For the default wing the buckling check
agrees to 0.1 percent and the t_min check to 1.6 percent.

Note on the analytic test case. For minimize x + y subject to x y at least 1 at (1, 1) the KKT condition gives
lambda = 1 (grad f = (1, 1), grad g = (1, 1)), and the sensitivity theorem agrees (f*(b) = 2 sqrt(b), so
df*/db = 1 at b = 1). The task text quoted 0.5; that value belongs to the rescaled constraint (x y)^2 at least 1,
which describes the same feasible set. The test asserts both values, which is also the point of the shadow price
translation: multipliers depend on how a constraint is written, savings in grams do not.

## Verification

- Elliptic load integrates to L_half (root shear, 1.3e-4 relative with 200 trapezoidal intervals) and the root
  moment matches L_half 4 s / (3 pi).
- Uniform load on a constant chord: v_tip = w s^4 / (8 EI) to machine precision; slope w s^3 / (6 EI).
- Bredt J for a uniform wall equals 4 A^2 / (perimeter / t).
- Plate buckling: 25.84 MPa for E = 70000 MPa, nu = 0.33, t = 1 mm, b = 100 mm, k = 4 (reference 25.85 MPa).
- Multiplier estimator: lambda = 1 for x y at least 1, 0.5 for (x y)^2 at least 1, zero for a non-binding
  constraint; exact NNLS on a tiny problem; QP solver projects onto a violated constraint.
- Tornado signs; optimizer result verified feasible and not heavier than a feasible baseline (also per rib
  count); the known vertex optimum (both thicknesses at t_min, cap area from the buckling equality found by an
  independent bisection); the analytic twist-only optimum t_s = t_w; shadow price check within 5 percent;
  infeasible baseline (spruce caps) made feasible; verification rejects an infeasible design; rib pitch closed
  form and n_min; cap taper saves mass at equal root stress; invalid inputs return error objects;
  determinism and no NaN across the scenario presets.

Browser smoke test: served from `/home/claude/optlab/optimization` and opened with headless Chrome through
puppeteer-core; no console errors or page errors on load, after pressing the run button, after cancel and
reset, and after switching scenarios.

## Results for the default wing

Baseline (t_s 1.2 mm, t_w 1.5 mm, A_cap 25 mm^2, 6 ribs): 478 g, U_stress 0.032 (web shear), U_buckle 0.487,
U_defl 0.028 (v_tip 1.28 mm), U_twist 0.050 (0.10 degree nose-up), U_thick 0.667. Optimum: 273 g at 15 ribs
with t_s = t_w = 0.80 mm (t_min) and A_cap = 3.53 mm^2, active set buckling screen plus both thickness bounds,
KKT residual 1.3e-11; mass saved 205 g (42.9 percent). Shadow prices: 0.27 g per 1 percent of critical
buckling stress, 12.5 g (skins) plus 4.8 g (webs) per 0.1 mm of t_min. Deflection and twist are inactive for
these inputs (zero shadow price); the stiffness critical preset makes the deflection limit active
(lambda 43.6 g per unit U, 9.7 g per mm of limit).

## Decisions and limitations

- Default rib search range 2 to 16 instead of the 2 to 14 in the task text, so that the mass curve shows its
  minimum (15 ribs for the defaults, 273.1 g versus 273.4 g at 14 ribs) instead of ending at the range limit.
  Both limits are inputs.
- Ribs sit at y = b, 2b, ..., s (the root is the attachment, the tip is closed by a rib).
- Buckling plate width equals the rib pitch as specified, with k an input; for panels much longer than they are
  wide the real coefficient depends on the aspect ratio. The screen is not a stability analysis.
- The skin shear term from torsion is included in U_stress for completeness.
- Linear elastic, small deflection, no bending-torsion coupling, no aeroelastic feedback, no rib or web
  buckling, no cap crippling, no joints, no fatigue. Positive load factors only (the upper skin is the
  compression side). The rib thickness is not a design variable, so a rib thinner than t_min stays flagged.
- The thickness lower bound uses max(t_min, 0.05 mm) so that a zero t_min still leaves a positive wall.

## Classical references

- Bruhn, Analysis and Design of Flight Vehicle Structures (thin-walled boxes, shear flow, plate buckling).
- Megson, Aircraft Structures for Engineering Students (Bredt-Batho torsion, idealized booms and skins).
- Timoshenko and Gere, Theory of Elastic Stability (plate buckling coefficient k).
- Haftka and Gurdal, Elements of Structural Optimization (sequential linear programming, move limits,
  Lagrange multipliers as sensitivities of the optimum).
- Vanderplaats, Numerical Optimization Techniques for Engineering Design (SLP, active set strategies).
