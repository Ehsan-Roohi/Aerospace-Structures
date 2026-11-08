# truss-failsafe: Truss Redundancy, Load Cases and Reliability

Module of the MIE 446 Optimization Lab (University of Massachusetts Amherst). Educational, browser based,
dependency free. Published next to the Beam, Truss Lab and Wing AeroStruct teaching apps.

## Purpose

A design that passes one load case with a factor of safety FS = 1.5 can still fail when a bracing wire breaks,
when the load case changes, or when the properties of printed or natural parts scatter. The page quantifies all
three on the student's truss:

- Part A, fail-safe map: every member is removed in turn and the damaged truss is re-solved.
- Part B, load-case envelope: every checked case is solved, the governing case per member is found, and the
  classical "size for one case, check under all" mistake is demonstrated with a fully stressed design (FSD).
- Part C, Monte Carlo reliability: material properties and the load are scattered with assumed lognormal
  distributions and the probability that the maximum utilization exceeds 1 (design criterion) or exceeds FS
  (limit state) is estimated with a confidence interval, a reliability index, a histogram, a convergence plot
  and a sensitivity table.

## Files

- `truss-failsafe.js`: pure ES module (no DOM): solver, fail-safe map, envelope, FSD, Monte Carlo stepper,
  statistics helpers, input validation. Imports `../shared/presets.js` (data only).
- `truss-failsafe.worker.js`: module Web Worker that drives the Monte Carlo stepper in chunks with progress
  messages and cancellation. The page falls back to a chunked `setTimeout` loop on the main thread if the
  worker cannot start (for example from `file://` in some browsers).
- `index.html`: the page (inputs left, results right, three colour modes for the truss drawing, KPI tiles,
  tables, plots, CSV downloads).
- `truss-failsafe.test.js`: Node tests (`node --test optimization/truss-failsafe/truss-failsafe.test.js` from
  the lab root, Node 22, no packages).

## Model

2D pin-jointed linear elastic truss, direct stiffness method. Units: mm, N, MPa, g/cm^3, g.

- Bar stiffness E A / L along the axis, assembled over the free degrees of freedom; supports remove DOF.
- Gaussian elimination with partial pivoting. A pivot smaller than 1e-11 times the largest diagonal entry, or a
  failed residual check, is reported as "unstable structure (mechanism)" rather than as numbers.
- Member force N = (E A / L) times the axial elongation, tension positive; stress N / A.
- Utilization: tension U = |N| FS / (A sigma_allow); compression U = max(stress utilization, |N| FS / P_cr) with
  P_cr = pi^2 E I / (K L)^2 and I = A^2 / 12 for groups with `buckling: 'square'` (a screening indicator with
  an assumed effective length factor K, default 1); groups with `buckling: 'none'` use the stress check only.
  Feasible means every U <= 1 (tolerance 1e-9).
- Mass = sum(A L rho) / 1000 g.
- Tension-only groups (bracing wires). Linear wire model (default, as the lab specification asks): every member
  is a bar; a wire in compression is flagged "slack" with a warning, and its listed utilization is the linear
  model value. Tension-only wire model (option): wires in compression are dropped (area set to zero) and the
  structure is re-solved until no wire is in compression; dropping is monotone so the loop terminates, and a
  structure that becomes a mechanism once the slack wires are gone is reported as such. Compressions below
  0.1 percent of the largest member force count as numerical zero in both models, so the crossed wires of an
  unloaded bay (which carry a tiny self-stress) are neither flagged nor dropped.
- Degree of static indeterminacy m + r - 2j is reported (members with A > 0, reaction components, joints). It is
  necessary but not sufficient for redundancy; the solve decides.

## Algorithms

Part A. For the primary case, each member i with A_i > 0 is deleted in turn and the truss is re-solved. Rows
record the maximum utilization of the remaining members, the new governing member, the displacement of the
reference node (node 4, lower tip, for the Wright bay; node 3, midspan, for the Warren truss) relative to the
intact truss, the number of slack wires, and whether the damaged truss is a mechanism ("collapse"). Rows are
sorted collapse first, then by decreasing maximum utilization. Damage tolerance index = fraction of removals
after which every remaining U <= 1. In the linear wire model a note marks removals whose load path runs through
a compression wire whose force grew by more than 25 percent, because that path exists only with rigging
pretension.

Part B. Envelope: solve every checked case (times its multiplier; the primary case is always included), take the
elementwise maximum utilization and the case that produces it. FSD: A_i <- A_i max(U_stress,i, sqrt(U_buckle,i))
with the maximum over the cases of the sizing set in every iteration, clamped to A_min = 0.2 A0 of the member's
group, up to 40 iterations with early stop when the relative area change falls below 1e-7. If the iteration has
not converged, a final uniform scale by s = max over members and cases of max(U_stress, sqrt(U_buckle)) is
applied; a uniform scale leaves the member forces of a linear truss unchanged, so the governing member lands
exactly at U = 1 and every other member below. The sized design is verified by `verifyDesign` (re-solve from the
design numbers, all cases, all constraints) and shown with the badge. "Size for one case, check under all"
sizes for the primary case and then evaluates under every other checked case; the envelope FSD uses all checked
cases; the mass difference is the envelope mass penalty. The comparison table also reports the damage tolerance
index of each design. A group-wise sizing button (one section per group, same update rule applied to the worst
member of the group, areas rounded up to five significant digits and re-verified) lets the student put their
own design at U = 1 for the primary case with one click.

Part C. Per sample: for each group, E and sigma_allow are drawn as mean times exp(sigma_ln z - sigma_ln^2 / 2)
with sigma_ln^2 = ln(1 + CoV^2) (lognormal, mean preserved), and one load multiplier is drawn the same way with
the load CoV; z comes from Box-Muller on the seeded mulberry32 generator (identical to `makeRng` in labkit).
The truss is solved with the sampled moduli and the maximum design utilization (FS included) over all members is
recorded. Two events are counted: max U > 1 (design criterion violated) and max U > FS (limit state exceeded:
actual stress above actual strength, or actual load above the buckling load). P_f is the sample fraction with a
95 percent Wilson score interval; beta = -Phi^-1(P_f) using Acklam's inverse normal approximation, Phi from the
Abramowitz and Stegun erf approximation. Five runs with the same seed (common random numbers): all scatter on,
modulus scatter off, strength scatter off, load scatter off, all scatter off. The last run must reproduce the
deterministic maximum utilization exactly (bit for bit, checked on the page and in the tests). The sensitivity
table reports the change in P_f for each switched-off source. Histogram of max U (40 bins), running estimate of
P_f versus sample count, and the members that govern most often are shown. Default CoV: 0.10 for spruce, PLA and
PETG; 0.03 for aluminium 6061, steel and bracing wire; load CoV 0.10; 5000 samples; seed 1.

Classical check beside the Monte Carlo result: for lognormal load effect S and resistance R with central safety
factor theta = mean R / mean S, beta = ln(theta sqrt((1 + V_S^2) / (1 + V_R^2))) / sqrt(ln((1 + V_R^2)(1 + V_S^2))).
Applied per member with theta = 1 / U_i (design criterion) or FS / U_i (limit state), V_R = strength CoV for
stress-governed members and modulus CoV for buckling-governed members, V_S = load CoV, it gives first-order
series-system bounds max_i P_i <= P_f <= sum_i P_i. The member forces are taken as fixed (exact for a determinate
truss, approximate for an indeterminate one where the modulus scatter redistributes forces). Because members of a
group share one sampled E and one sampled strength, their failures are strongly correlated and the Monte Carlo
estimate tends to sit near the lower bound.

## Verification shown on the page

- The baseline (student design, primary case) is solved with the plain solver and shown with a green or red
  badge and its utilizations; the fail-safe entries are actual re-solves of the damaged truss.
- Both FSD designs are re-solved from their area numbers under all their cases by `verifyDesign` before they are
  displayed.
- The Monte Carlo run with all CoVs set to zero must equal the deterministic maximum utilization exactly.

## Tests (20, all pass in about 2 s)

Single bar PL/(EA) and P/A; symmetric two-bar truss forces and apex deflection; Euler P_cr and the compression
utilization for several K; mechanisms and invalid inputs reported as errors, never thrown; Wright bay: removing a
wire leaves a stable truss, removing root spar 0-1 gives a mechanism or a utilization increase above 2 times the
baseline, rows sorted by criticality; tension-only model: slack wires dropped, taut wire or strut removal
collapses the bay; Warren truss: m + r = 2j, every removal collapses, method-of-sections forces 8500 N, -9000 N
and the end diagonal; envelope equals the elementwise maximum and scales with the multiplier; single-case FSD
then the -1 g case flags members consistently with a direct check and includes a buckling failure; FSD on the
determinate Warren truss converges in two iterations to the closed-form areas and mass; verifyDesign rejects an
infeasible design; group sizing helper; Monte Carlo with zero CoV reproduces the deterministic max U exactly with
P_f 0 or 1 consistently; lognormal sampler mean within 2 percent and CoV within 10 percent on 20000 samples;
Phi^-1(0.975) = 1.95996 and Phi(1.96) = 0.975 within 1e-4; Wilson interval endpoints; single-bar Monte Carlo
versus the lognormal closed form within 4 standard errors; series-system bounds bracket the Monte Carlo estimate
on the Warren truss; common random numbers, reproducibility and the stepper interface; mulberry32 copy matches
labkit.

## Classical results reproduced

- Warren truss, uniform case: bottom chord 2-3 = 8500 N, top chord 9-10 = -9000 N, end diagonal = -5000 L/h.
- Two-bar truss: N = -P L / (2 h), apex deflection P L^3 / (2 E A h^2).
- Euler: P_cr = pi^2 E I / (K L)^2.
- Static indeterminacy: Wright bay m + r - 2j = 21 + 4 - 20 = 5; Warren 23 + 3 - 26 = 0 (every removal is a
  mechanism, damage tolerance index 0).
- FSD on a determinate truss converges in one update to the closed-form areas and is the minimum mass design
  under stress constraints (Haftka and Gurdal).
- Lognormal reliability index: for a member at U = 1 with FS = 1.5, V_R = V_S = 0.10, beta = 2.874 and
  P_f = 0.203 percent; the Monte Carlo estimate on the group-sized Wright bay (0.22 percent, CI 0.12 to 0.39
  percent) lies inside the series-system bounds 0.203 to 0.211 percent.

## Limitations

Pin-jointed bars only (real spars are continuous and carry bending); no wire pretension in either wire model;
member removal is static (no dynamic overshoot when a member snaps); the Euler screen ignores end fixity,
imperfections and inelastic buckling; material cards are representative educational values; the scatter model
(lognormal, mean preserved, one batch per group, independent groups, one load multiplier) is an assumption;
the FSD iteration may not converge fully in 40 iterations on indeterminate trusses (the uniform polish then
restores feasibility and the page says so). Nothing on this page is a certified analysis.

## References

Hibbeler, Structural Analysis (direct stiffness truss analysis). Haftka and Gurdal, Elements of Structural
Optimization (fully stressed design). Melchers and Beck, Structural Reliability Analysis and Prediction; Nowak
and Collins, Reliability of Structures (lognormal reliability index, series-system bounds). Acklam, An algorithm
for computing the inverse normal cumulative distribution function. Abramowitz and Stegun, Handbook of
Mathematical Functions, 7.1.26 (erf approximation). Wilson, Probable inference, the law of succession, and
statistical inference (1927).
