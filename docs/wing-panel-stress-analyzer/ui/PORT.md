# Source-level port (Wing AeroStruct build sources)

The published page `docs/wing-panel-stress-analyzer/index.html` is a build product of
`computational/printed-wing-solver/aerostruct/build_wing_aerostruct.py` (sources in `aerostruct/` plus the shared
Wing Lab 1.3 modules in `web/`). Those AeroStruct sources are in `wing-aerostruct-0.3.0-dev-review.zip`
(committed in `docs/wing-panel-stress-analyzer/`), not yet as a folder in the repository. This folder carries the same
redesign as changes to those sources, so whoever owns the build (the FE work) can take it without re-doing it by hand.

## Files

| File | Content |
|---|---|
| `00-prerequisite-main-0bb76f3-on-template.patch` | **Not part of the redesign.** Main's commit 0bb76f3 edited the built page by hand (Aerodynamic solver button, `#wlAero` moved and open, stress opaque). This expresses that edit on `wing_aerostruct_template.html`, so the template reproduces main's page. Skip it if your template already has 0bb76f3. |
| `01-wing-aerostruct-ui-sources.patch` | The redesign: hooks and wording in `wing_aerostruct_template.html` and `wing_aero_ui.js`; the three shell files as new `aerostruct/` files; three build tokens in `build_wing_aerostruct.py`; four test expectations in `test_aerostruct_aero_ui.mjs`, `test_aerostruct_page.mjs`, `test_aerostruct_browser.mjs` that addressed the old layout or the old button names. |
| `02-closed-tip-aero-results.patch` | Apply after `01`: separates closed-tip aerodynamic results from unsupported spatial-beam load transfer in `wing_aero_ui.js`. The complete resulting UI module is also saved as `wing-aero-ui.js`. |
| `03-course-example-activity.patch` | Apply after `02`: the two-spar course preset, structural/contour activity feedback, clearer structural-capability messages and resetting the aerodynamic fields/results when the course example is opened. |
| `wording_edits.md` | Every hook and wording edit: page line, source file, old → new. |

No `web/` module (Wing Lab 1.3) is touched. No numerical source (`engine.js`, `wing_aero_panel.js`, `wing_aero_worker.js`,
`wing_study_io.js`, aero or print bundles) is touched.

## Apply (paths are relative to the repository root, with the ZIP's `computational/printed-wing-solver/aerostruct/` in place)

```
git apply source-port/00-prerequisite-main-0bb76f3-on-template.patch   # only if the template predates 0bb76f3
git apply source-port/01-wing-aerostruct-ui-sources.patch
git apply source-port/02-closed-tip-aero-results.patch
git apply source-port/03-course-example-activity.patch
git apply source-port/04-geometry-first-context-menu.patch
python3 computational/printed-wing-solver/aerostruct/build_wing_aerostruct.py
```

The build inlines the shell from the three new files through `/*__WX_SHELL_CSS__*/`, `/*__WX_AERO_RESULTS__*/` and
`/*__WX_SHELL__*/`, placed at the end of the template between the `BEGIN/END Wing AeroStruct UI shell` markers.

## Proof (byte-identical rebuilds)

`tools/port_sources.py` does the port mechanically (every page edit is located in the sources by its own lines plus
just enough context to be unique) and rebuilds after each step:

| Step | Built page SHA-256 | Equal to |
|---|---|---|
| ZIP sources as shipped | `f24efa963e0c…` | the ZIP's own `site-aerostruct/index.html` |
| + `00-prerequisite…` | `23e338bd458c…` | main's `docs/wing-panel-stress-analyzer/index.html` at 3588252 (byte-identical) |
| + `01-wing-aerostruct-ui-sources.patch` | `cb8097945a3a…` | the redesigned `site/index.html` (byte-identical; the build's `wing-lab.html` is the same page) |

The rebuilt `wing-aero/` and `wing-print/` workers and bundles are byte-identical to the published ones (unchanged
content hashes 2ff1da57ee4c, 13eb802302b6, a56bd8704a71).

The hashes in the table describe the original redesign. Subsequent visualization and closed-tip UI revisions are
recorded in `BUILD.json` and `validation/CLOSED_TIP_AERO_REVIEW.json`. The current `01` patch includes the current
shell, including **View → Full wing · mirror**. `02` changes no numerical solver and does not enable structural
load transfer for zero-chord tips; Cp, pressure and integral aerodynamic quantities remain available independently.

The same two patches were also applied with `git apply` to a fresh copy of the ZIP sources and rebuilt: identical again.
`port_verification.txt` is the log of the last `port_sources.py` run.

The current result-view module includes full-range square-root colour contrast by default, a linear full-range
option, manual signed limits, out-of-range panel hatching, and an expandable mesh-extrema sensitivity check.
The legend uses the same mapping as the panels; pressure probes and CSV keep the original values. These are
display controls, not a change to the potential-flow solver or a certification of local tip-pressure convergence.
`validation/test_pressure_scale.cjs` checks the mapping, signed limits, Cp/Pa conversion and immutable inputs.

## If the FE work changed the template meanwhile

The patch is small outside the three new files: 5 hooks (6 inserted lines, 2 edited lines) and 37 edited lines of
wording (`wording_edits.md`). If a hunk no longer applies, the hooks are the part that matters; the wording edits can be
re-done by hand. The shell itself tolerates layout differences: it moves controls by id, keeps any unknown control
under *Structure & Stress → More tools*, and if a required element is missing it leaves the previous layout and logs
one warning instead of breaking the page.

To add the shell/solid options to the new panel without editing the shell:

```js
window.WingLabUI.shell.addStructureSubgroup({ id: 'wxAnalysisModel', title: 'Analysis model', node: yourControls, open: false });
```

The subgroup appears in *Structure & Stress* right after *Mesh & analysis settings* and behaves like the others
(one open at a time, Escape, outside click, keyboard). `#wxAnalysisModelSlot` is an empty, hidden slot reserved inside
*Mesh & analysis settings* for a single selector, if that is preferred.
