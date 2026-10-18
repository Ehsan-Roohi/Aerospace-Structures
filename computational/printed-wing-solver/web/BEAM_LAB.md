# MIE 446 Beam Lab — maintainer notes

The Beam workspace of `docs/wing-lab.html` (the landing screen of Wing Lab). It is an
Euler–Bernoulli teaching model: transverse displacement `v` and rotation `θ` only.

## Files

| File | Role |
|---|---|
| `beam_sections.js` | Section library: rectangle, circle, tube, box, symmetric I. A, I, c, S, Q(z), b(z), τ(z) = VQ/(Ib), mass, ρgA, equal-mass candidates. |
| `beam_learning_engine.js` | Cubic Hermite FE solver. Supports anywhere, internal hinges, point couples, self-weight, mechanism detection, modes, `staticsSystem`, `forceMethod`, `fieldAt`. |
| `beam_study.js` | Versioned study JSON (save/import), share links (`?beam=`), A/B differences, CSV, HTML escaping. Untrusted input is whitelisted and re-validated by the engine. |
| `beam_diagrams.js` | SVG builders: physical beam, free-body diagrams, cut free body, charts, section and stress views, stress map, modes, sign conventions. |
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

## Behaviour that must not regress

* Legacy inputs (`support: 'cantilever' | 'fixed-fixed' | 'simply-supported'`, `leftSupport/rightSupport`,
  `width/height`) give bit-identical arrays, reactions and modes to commit 0cba4ec.
* `?beamCase=l03-*` (6) and `?beamCase=hw2b-*` (3) set exact inputs; `beamCase` wins over `?beam=`.
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
`test_companion_tools.mjs` (includes a static cascade check of the VINCO button's colours), `test_teaching_ui.mjs`
(page matches template). These are DOM component tests, not rendering tests. `test_beam_browser.mjs` is the
**real-browser** check (Chromium via Playwright, `PLAYWRIGHT_MODULE=…`; `BEAM_THREE_DIR=…` points a temporary
copy at a local three@0.128.0 when the CDN is unreachable) for layout at 390/768/1440 px in light and dark, pointer placement, cut dragging,
keyboard tabs, print report, reduced motion, computed-colour contrast (VINCO button in both places, every Beam
Lab text element, four theme paths) and the WebGL wing/D.520 round trips.

## Model limits (stated in the app)

Straight prismatic homogeneous beam, linear elastic, small displacement, ideal rigid supports. No axial
DOF (horizontal reactions are zero for transverse loads), shear deformation, torsion, buckling,
plasticity, local/shell buckling of thin walls, clamp/contact concentrations or CAD/print checks.
τ = VQ/(Ib) is the average over the total material width (two walls for tubes and boxes). Modes are
normalized undamped bending patterns, not a forced response.
