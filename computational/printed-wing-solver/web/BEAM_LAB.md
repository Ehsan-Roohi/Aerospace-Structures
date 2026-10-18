# MIE 446 Beam Lab — maintainer notes

The Beam workspace of `docs/wing-lab.html` (the landing screen of Wing Lab). It is an
Euler–Bernoulli teaching model: transverse displacement `v` and rotation `θ` only.

## Files

| File | Role |
|---|---|
| `beam_sections.js` | Section library: rectangle, circle, tube, box, symmetric I. A, I, c, S, Q(z), b(z), τ(z) = VQ/(Ib), mass, ρgA, equal-mass candidates. |
| `beam_learning_engine.js` | Cubic Hermite FE solver. Supports anywhere, internal hinges, point couples, self-weight, mechanism detection, modes, `staticsSystem`, `forceMethod`, `fieldAt`. |
| `beam_study.js` | Versioned study JSON (save/import), share links (`?beam=`), A/B differences, CSV, HTML escaping. Untrusted input is whitelisted and re-validated by the engine. |
| `beam_diagrams.js` | SVG builders: physical beam, free-body diagrams, cut free body (thin end slices included), the two faces of a cut, charts, section and stress views, stress map, modes, sign conventions. |
| `beam_solution.js` | "Solution" tab: unknown counting, hand-convention equilibrium, self-balancing reaction set, consistent-deformation numbers, V/M → κ → σ chain, K u = f, textbook hand-checks. |
| `foundations_ui.js` | Controller and layout (`Lecture03BeamCases` deep links are defined here). |
| `beam_lab.css` | Styles, scoped to `#foundations`, using the page's theme tokens (light/dark), responsive and print rules. |
| `companion_tools.js` | Attributed external-link card for VINCO RC (wing geometry). Filled into `[data-companion="vinco"]` slots. |
| `beam_contrast_audit.js` | Test tooling, not in the built page: WCAG text-contrast audit from computed colours (used by `test_beam_browser.mjs`; can be pasted into a browser console). |

`build_wing_lab.py` inlines all of them (tokens `/*__BEAM_STYLES__*/`, `/*__BEAM_SECTIONS__*/`, …) into
`docs/wing-lab.html`. Rebuild after any edit: `python computational/printed-wing-solver/web/build_wing_lab.py`.

## Conventions

mm, N, MPa, N/mm, N·mm; density g/cm³ (self-weight q = ρ[g/cm³]·1000 · A[mm²]·10⁻⁶ · 9.80665 / 1000 N/mm).
Loads and `v` positive **down**; `θ = dv/dx` and applied/reaction couples positive **clockwise**;
internal `M` positive **sagging** (`M = −EI v″`, `V = dM/dx`, `dV/dx = −q`; a clockwise couple raises M by C).
On the left part's cut face positive V acts down and positive M counter-clockwise. The Solution tab writes
hand equations with reactions up and couples counter-clockwise positive and says so.

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
* At most 12 loads per study (load form, files and links); the engine itself accepts 30. Modes: up to
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
