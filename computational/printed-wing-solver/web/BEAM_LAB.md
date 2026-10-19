# MIE 446 Beam Lab — maintainer notes

The Beam workspace of `docs/wing-lab.html` (the landing screen of Wing Lab). It is an
Euler–Bernoulli teaching model: transverse displacement `v` and rotation `θ` only.

Load forms include a live signed intensity profile, total force, peak intensity and
resultant station. Saved loads have individual expandable previews. The graphical toolbar
switches between shared intensity scale (magnitude comparison) and independent heights
(shape inspection only); this never alters the solution. F is measured in N, q in N/mm.
The optional exponent-based generator creates an explicitly approximate 31-point
piecewise-linear CSV table, normalized to the requested total and applied only after
separate validation and confirmation. See `WING_IMPORT.md` for the shared workflow.

## Files

| File | Role |
|---|---|
| `load_profiles.js` | Shared with both wing workspaces: elliptic and parabolic line loads (exact integrals, Gauss–Legendre in the angle variable for the √ end), piecewise-linear tables, exact consistent nodal loads, CSV parsing/validation and templates. |
| `beam_sections.js` | Section library: rectangle, circle, tube, box, symmetric I. A, I, c, S, Q(z), b(z), τ(z) = VQ/(Ib), mass, ρgA, equal-mass candidates. |
| `beam_learning_engine.js` | Cubic Hermite FE solver. Supports anywhere, internal hinges, point couples, self-weight, mechanism detection, modes, `staticsSystem`, `forceMethod`, `fieldAt`. |
| `beam_study.js` | Versioned study JSON (save/import), share links (`?beam=`), A/B differences, CSV, HTML escaping. Untrusted input is whitelisted and re-validated by the engine. |
| `beam_diagrams.js` | SVG builders: physical beam, free-body diagrams, cut free body (thin end slices included), the two faces of a cut, charts, section and stress views, stress map, modes, sign conventions. |
| `beam_solution.js` | "Solution" tab: unknown counting, equilibrium in the single sign convention (R_y ↓ +, C ↻ +), self-balancing reaction set, consistent-deformation numbers, V/M → κ → σ chain, K u = f, textbook hand-checks. |
| `foundations_ui.js` | Controller and layout (`Lecture03BeamCases` deep links are defined here). |
| `beam_lab.css` | Styles, scoped to `#foundations`, using the page's theme tokens (light/dark), responsive and print rules. |
| `companion_tools.js` | Attributed external-link card for VINCO RC (wing geometry). Filled into `[data-companion="vinco"]` slots. |
| `beam_contrast_audit.js` | Test tooling, not in the built page: WCAG text-contrast audit from computed colours (used by `test_beam_browser.mjs`; can be pasted into a browser console). |

`build_wing_lab.py` inlines all of them (tokens `/*__BEAM_STYLES__*/`, `/*__BEAM_SECTIONS__*/`, …) into
`docs/wing-lab.html`. Rebuild after any edit: `python computational/printed-wing-solver/web/build_wing_lab.py`.

## Conventions

### Graphical load placement

The **Loads** toolbar above the physical beam places point forces and couples by a click, and uniform,
triangular, trapezoidal, elliptic and parabolic line loads by dragging an interval. The blue selection
is not a load: enter signed magnitude in the existing Loads form and confirm **Add load & solve**.
Intervals are ordered left to right even when drawn right to left; triangle icons describe the
intensity variation, not force direction. Positive values remain down / clockwise.

Purple numbered handles on applied loads can be dragged horizontally (their magnitude and interval
length stay fixed, and movement stops at the beam ends). Click a handle, or focus it and press Enter,
to edit exact positions and magnitudes in the form. Numeric input remains available for accessibility
and precision. Escape or **Cancel / select** cancels placement; a cancelled drag restores its load.
Moving an existing load makes the results stale until Solve, unless auto-solve is enabled.
Self-weight is not draggable. These handles are on the physical editor only, not reaction FBDs.

Regression: `test_graphical_loads.mjs` covers all eight tools, no automatic load insertion, reversed
interval gestures, signed values, whole-interval boundary clipping, cancellation and keyboard editing.

mm, N, MPa, N/mm, N·mm; density g/cm³ (self-weight q = ρ[g/cm³]·1000 · A[mm²]·10⁻⁶ · 9.80665 / 1000 N/mm).
Loads and `v` positive **down**; `θ = dv/dx` and applied/reaction couples positive **clockwise**;
internal `M` positive **sagging** (`M = −EI v″`, `V = dM/dx`, `dV/dx = −q`; a clockwise couple raises M by C).
On the left part's cut face positive V acts down and positive M counter-clockwise.

**One convention for every external action (v5).** Applied loads and support reactions are positive DOWN
(reaction force R_y, `R_A`, `R_B`, …) and applied couples, reaction couples (C, `C_A`, …) and moments of forces
positive CLOCKWISE — in the Solution tab's equilibrium and compatibility equations (ΣF_y = 0 with ↓ +, ΣM_A = 0
with ↻ +; unit redundants 1 N ↓ and 1 N·mm ↻, so f_ii > 0), the load and reaction tables (one signed R_y column,
one C column; pins and rollers C = 0 with the rotation free), the free-body diagrams, the reactions CSV
(`x_mm,support,type,R_y_N_down,C_Nmm_clockwise,v_mm,theta_rad`), the A/B table and the printed report. Unknowns are
drawn in their positive directions (R ↓, C ↻); solved reactions are drawn in their ACTUAL directions and labelled
with their SIGNED values, so a negative R_y points up and a negative C turns counter-clockwise. There is no second
"hand" convention and no sign-flip instruction anywhere. The solver values and the internal V/M conventions did not
change; only the presentation of the worked solution did (`test_beam_sign_convention.mjs`).

This is the convention of Lecture 03 §3 (tip-loaded cantilever: V = +P, M = −P(L − x); Activity A reads the
reaction −2 N and V = +2 N). Do not flip signs to make V "look like" a reaction: a reaction is an external force
at a support (app signs ↓ +, ↻ +), V and M are an equal and opposite pair on the two faces of a cut. Across a
support `V(x⁺) − V(x⁻) = −(R + P)` and `M(x⁺) − M(x⁻) = +(C + C₀)` (R, C: reaction force and couple; P, C₀: applied
point actions at that station), so `V(0⁺) = −R` and `M(0⁺) = +C` at a left end, `V(L⁻) = +R` and `M(L⁻) = −C` at a
right end. Reaction couples are named C (C_A, C_B, … as in Lecture 03), never M. Benchmarks (`test_beam_station.mjs`):
HW 2B Case 1, cantilever, q = 0 → 0.002 N/mm: W = 0.45 N at x̄ = 300 mm, R = −0.45 N, C = −135 N·mm,
V(0⁺) = +0.45 N, V(L/2) = +0.3375 N, M(L/2) = −42.1875 N·mm. HW 2B Case 3, fixed–fixed, q = 0.002 → 0 N/mm:
R_A = −0.315 N, R_B = −0.135 N, C_A = −20.25 N·mm, C_B = +13.5 N·mm, V(0⁺) = +0.315 N, V(L⁻) = −0.135 N,
M(0⁺) = −20.25 N·mm, M(L⁻) = −13.5 N·mm.

### Curved and table loads (v5)

A curved load on a ≤ x ≤ b, ℓ = b − a, is w(x) = w₀ g(u) with an explicit orientation: `shape: 'start'` (maximum
w₀ at a, zero at b), `'end'` (zero at a, maximum at b) or `'middle'` (zero at both ends, symmetric). Elliptic
g = √(1 − u²) gives F = πw₀ℓ/4 and a root-heavy resultant at a + 4ℓ/(3π) (cantilever root moment 4FL/(3π) on 0..L);
parabolic g = 1 − u² (vertex at the maximum, not a triangle) gives F = 2w₀ℓ/3 and a + 3ℓ/8. The user enters
**either** the signed total F **or** the peak w₀; the study stores only the entered value. V and M are exact
(closed-form integrals), the consistent FE loads are exact (angle-variable quadrature at the √ end), so nodal v and
θ are exact for any mesh; between nodes the Hermite interpolation converges (`test_beam_curved_loads.mjs` prints
the table). A **table** (`kind: 'table'`, 2–31 rows `[x, w]`) is linear between rows and zero outside them;
nothing is resampled or truncated. The CSV importer (`x_mm,w_N_per_mm`, w + down; `#` comments, CRLF and a BOM
accepted; semicolons, tabs, formulas, hex, NaN/Infinity, duplicate or decreasing x, rows outside 0..L, more than
31 rows or 20 kB refused) previews rows, segments, F, x̄ and the moment about x = 0 with the whole draft model
validated **before** anything changes; Apply adds the table, or replaces all loads only when Replace is chosen
for that table (never remembered); Edit replaces that table only. A chosen file keeps its name (shown as text)
and SHA-256; editing the text drops both. Load segments are limited to 30 (each load one, a table rows − 1).
Studies and links with curved or table loads are written as version 3; others stay version 2.

## Behaviour that must not regress

* Legacy inputs (`support: 'cantilever' | 'fixed-fixed' | 'simply-supported'`, `leftSupport/rightSupport`,
  `width/height`) give bit-identical arrays, reactions and modes to commit 0cba4ec.
* `?beamCase=l03-*` (6) and `?beamCase=hw2b-*` (3) set exact inputs; `beamCase` wins over `?beam=`.
* The normal opening has **no applied load** and self-weight off (an unloaded cantilever, all results zero, with the
  message "No load defined. Add your own load."). Loads come only from the load form, a study file or share link, or
  an explicitly chosen Lecture 03 / HW 2B example (buttons or `?beamCase=`). The load form starts empty, and nothing
  adds a load automatically. Solved reactions that are zero are labelled 0 and drawn without an arrow.
* One cut station for the whole page (`st.cut`): the Diagrams readout, the markers on every plot, the orange
  line on the beam picture (draggable on the Diagrams and Cut tabs) and Cut & section. The readout evaluates
  `fieldAt` at that x (never the plotted samples): V and M exact by equilibrium, v and θ from the
  Euler–Bernoulli FE (nodal values, or cubic Hermite interpolation between nodes, said which). At a jump both
  limits are listed and the x⁻ / x⁺ choice is shared. Buttons give x = 0, L/4, L/2, 3L/4, L; the station opens at
  L/2. Cut & section shows both parts by default, with V and M in opposite directions on the two faces. Under the
  reactions, a table and one thin-slice free body per support show the reaction (external) against V and M (internal).
* Downloads (all disabled while results are stale): station table CSV (exact values at listed x; header
  `x_mm,side,V_N,M_Nmm,v_mm,theta_rad,curvature_per_mm,sigma_top_MPa,sigma_bottom_MPa,tau_max_MPa,v_theta_source`;
  `left`/`right` rows at a jump), plot-samples CSV (unchanged columns), reactions CSV, one PNG per plot (built from
  the data as an SVG with its own white background, title, model, loads, axes, units and sign convention, drawn at
  2× on a canvas) and the printed report (now with the station table). The Diagrams tab offers them in its download
  bar. CSV is plain CSV for spreadsheets, not a native Excel workbook. The Learn tab starts with a short student guide.
* Results always belong to the last **solved** model. A pending or rejected draft (also mid-drag) marks
  results stale (status chip, banner, struck-through KPIs) and disables every export. A new solve clears
  panels computed for the previous one (equal-mass table, share link). Imports and `?beam=` links are
  all-or-nothing: a model the solver rejects changes nothing.
* At most 12 loads per study (load form, CSV, files and links) and 30 load segments; the engine itself accepts 30 segments. Modes: up to
  three, never more than the free degrees of freedom (none when every DOF is restrained).
* Physical diagrams never show reactions; free-body diagrams never show support symbols.
* Text contrast is at least 4.5:1 (3:1 for large text) in light and dark. Generic element rules in `beam_lab.css`
  must not carry ID weight over class-styled controls: the Beam Lab link colour is `:where(#foundations) a`, and
  the nav label rule is `.bl-nav > span` (an ID-weighted `#foundations a` once made the VINCO button blue on blue).
  Accent-coloured text uses `--bl-accent-text`, filled-button hovers `--bl-hover-filter`.
* Mechanisms (no support, rotation about one pin/roller, folding at hinges, rollers only) are rejected
  before any factorization, so no static result or eigenmode is produced for them.

## Tests

jsdom (install separately; set `MIE446_JSDOM_MODULE` to its path): `test_beam_learning.mjs`,
`test_general_beam.mjs`, `test_hw2b_cases.mjs`, `test_lecture03_links.mjs`, `test_learning_components.mjs`,
`test_beam_general_supports.mjs`, `test_beam_sections.mjs`, `test_beam_study.mjs`, `test_beam_ui.mjs`,
`test_beam_station.mjs` (shear sign convention against closed forms, the station readout, jumps, sign key, thin slices),
`test_beam_exports.mjs` (station table and CSVs, plot image content, download bar and stale guard, guide),
`test_load_profiles.mjs` (curve and table integrals against independent quadrature, CSV schema), `test_beam_curved_loads.mjs`
(cantilever, pin–roller, fixed–fixed, partial/signed, mixed, self-weight once, jumps, mesh convergence),
`test_beam_curved_ui.mjs` (form, F/w₀ conversion, CSV preview/add/replace/edit/limits/hostile names, persistence),
`test_companion_tools.mjs` (includes a static cascade check of the VINCO button's colours), `test_teaching_ui.mjs`
(page matches template). These are DOM component tests, not rendering tests. `test_beam_browser.mjs` is the
**real-browser** check (Chromium via Playwright, `PLAYWRIGHT_MODULE=…`; `BEAM_THREE_DIR=…` points a temporary
copy at a local three@0.128.0 when the CDN is unreachable) for layout at 390/768/1440 px in light and dark, pointer placement, cut dragging,
keyboard tabs, print report, reduced motion, computed-colour contrast (VINCO button in both places, every Beam
Lab text element, four theme paths), the station readout with real input, the plot PNG files (size, white
background, drawn content), the station-table CSV and the WebGL wing/D.520 round trips.

## Model limits (stated in the app)

Straight prismatic homogeneous beam, linear elastic, small displacement, ideal rigid supports. No axial
DOF (horizontal reactions are zero for transverse loads), shear deformation, torsion, buckling,
plasticity, local/shell buckling of thin walls, clamp/contact concentrations or CAD/print checks.
τ = VQ/(Ib) is the average over the total material width (two walls for tubes and boxes). Modes are
normalized undamped bending patterns, not a forced response.
