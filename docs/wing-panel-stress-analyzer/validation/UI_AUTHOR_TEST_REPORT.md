# Test report · Wing AeroStruct compact UI

Environment: headless Chromium (Playwright 1.63, SwiftShader WebGL), Node 22, 2 CPU cores; three.js r128 served
locally. Pages served over HTTP exactly as published (`index.html` with `wing-aero/` and `wing-print/`).
Old page = `docs/wing-panel-stress-analyzer/index.html` at main 3588252; new page = `site/index.html`.

## 1. Same inputs → same solver outputs (old page vs new page)

The scenario drives both pages through the same controls (by id) and fingerprints every solver output: the whole
structural result object (SHA-256), the aerodynamic sequence (timing fields removed), the delivered strip loads, the
admission record, the saved study file, key values, and how many times each solver ran. Two runs of the old page and
one of the new page:

```
step                                         pre-redesign (2 runs)    redesigned     result
S0 course wing, no load                      aac338a43e87 / aac338a43e87 aac338a43e87   identical
S1 point load 3 N at y=300, x/c=0.3          84ee91fa761c / 84ee91fa761c 84ee91fa761c   identical
S2 semi-span 420                             78eb4b4de76c / 78eb4b4de76c 78eb4b4de76c   identical
S3 shell E 2800 MPa                          a8db5d13961e / a8db5d13961e a8db5d13961e   identical
S4 rib at 150                                8fc3bba4234d / 8fc3bba4234d 8fc3bba4234d   identical
S5 bonded spar                               0da0d36a493d / 0da0d36a493d 0da0d36a493d   identical
S6 aero Standard V18 a5                      6251ac85fd23 / 6251ac85fd23 6251ac85fd23   identical
S7 aero load applied                         de0a8912c146 / de0a8912c146 de0a8912c146   identical
S8 saved JSON                                259d527b2431 / 259d527b2431 259d527b2431   identical
S9 saved study reopened and solved           3d79e33d5902 / 3d79e33d5902 3d79e33d5902   identical
ALL STEPS IDENTICAL (fingerprints, values, solver call counts)
```

## 2. Interaction test (real clicks and typing): 113/113 checks passed (+ 1 timing record; the runner's own count, 114 entries, includes it)

Edits are made through the new panels (not by script) and compared with the old page's fingerprints for the same
inputs. Solver calls are counted with wrappers around `WingEngine.solve`, the aerodynamic Worker's sequence request and
the main-thread fallback.

### Layout, bar and strip at 1440 (12/12 passed)

| | Check | Measured |
|---|---|---|
| ✅ | command bar is one compact row (≤ 60 px) | height 52 |
| ✅ | result strip is one slim row at 1440 (≤ 56 px) | height 50 |
| ✅ | no horizontal page overflow at 1440 | overflow 0 |
| ✅ | bar holds File, Open JSON, Save JSON, Aerodynamics, Structure & Stress, View, Help | File \| Open JSON \| Save JSON \| Aerodynamics \| Structure & Stress \| View \| Help |
| ✅ | result tabs are Model, Stress, Displacement (+ More results and Aero results selectors) | Model,Stress,Displacement |
| ✅ | no "Aerodynamic solver" button beside the result tabs |  |
| ✅ | generic "Solve" is gone; structural action is named Solve Structure / Stress |  |
| ✅ | old two-row toolbar and view bar are not shown |  |
| ✅ | visible controls with all menus closed ≤ 50 (was 171) | 44 |
| ✅ | white default background |  |
| ✅ | ArrowRight moves focus along the command bar |  |
| ✅ | Download STL closes the File menu and opens the exporter below the command bar | {"menuHidden":true,"top":113,"barBottom":105} |

### Menus and panels: anchored, one at a time, keyboard, Escape, outside click, no solver runs (39/39 passed)

| | Check | Measured |
|---|---|---|
| ✅ | #wxFileBtn opens #wxFileMenu anchored below it | command 375–440, panel 375–795, gap 6 |
| ✅ | #wxFileMenu fits inside the window |  |
| ✅ | only one menu open after #wxFileBtn | 1 open |
| ✅ | #wxViewBtn opens #wxViewMenu anchored below it | command 1027–1102, panel 972–1432, gap 6 |
| ✅ | #wxViewMenu fits inside the window |  |
| ✅ | only one menu open after #wxViewBtn | 1 open |
| ✅ | #wxAeroBtn opens #wingSide anchored below it | command 672–827, panel 672–1200, gap 6 |
| ✅ | #wingSide fits inside the window |  |
| ✅ | only one menu open after #wxAeroBtn | 1 open |
| ✅ | #wxStructBtn opens #wingSide anchored below it | command 831–1010, panel 831–1359, gap 6 |
| ✅ | #wingSide fits inside the window |  |
| ✅ | only one menu open after #wxStructBtn | 1 open |
| ✅ | Escape closes the panel and returns focus to its command |  |
| ✅ | Help opens anchored under its command |  |
| ✅ | Help holds the Guided lesson and the five experiments |  |
| ✅ | opening Aerodynamics closes Help |  |
| ✅ | outside click on the model closes the panel |  |
| ✅ | subgroup #wlGeometry expands in the same panel, others collapse |  |
| ✅ | subgroup #wlStructure expands in the same panel, others collapse |  |
| ✅ | subgroup #wxRods expands in the same panel, others collapse |  |
| ✅ | subgroup #wxSpars expands in the same panel, others collapse |  |
| ✅ | subgroup #wxMaterials expands in the same panel, others collapse |  |
| ✅ | subgroup #wlLoads expands in the same panel, others collapse |  |
| ✅ | subgroup #wxJoints expands in the same panel, others collapse |  |
| ✅ | subgroup #wxAnalysis expands in the same panel, others collapse |  |
| ✅ | subgroup #wxParts expands in the same panel, others collapse |  |
| ✅ | subgroup #wxTree expands in the same panel, others collapse |  |
| ✅ | subgroup #wlInventory expands in the same panel, others collapse |  |
| ✅ | Ribs, Rods & sleeves and Spars show their own part of the one structure form |  |
| ✅ | structural inputs all reachable: geometry, ribs, rods, spars, materials, loads, joints, mesh, parts, tree |  |
| ✅ | File holds New / Clear, course example, STL/DXF/STEP, mirror, STL reference, design parameters |  |
| ✅ | View holds zoom, show, display, explode/clip, contours and dimensions |  |
| ✅ | camera views appear once (on the model only) |  |
| ✅ | opening and closing every menu and subgroup starts no solver | {"before":{"solve":0,"aeroPost":0,"aeroMain":0,"makeGeometry":0},"after":{"solve":0,"aeroPost":0,"aeroMain":0,"makeGeometry":0}} |
| ✅ | ArrowDown opens Aerodynamics and moves focus into it |  |
| ✅ | Escape returns focus to Aerodynamics |  |
| ✅ | unapplied Wing shape edit kept after Escape |  |
| ✅ | 1920: Help opens fully inside the window |  |
| ✅ | 390: Help opens fully inside the window |  |

### Drafts kept, Discard (1/1 passed)

| | Check | Measured |
|---|---|---|
| ✅ | Discard unapplied edits restores the applied value | 450 |

### Same inputs through the new panels → same solver outputs as the old page (8/8 passed)

| | Check | Measured |
|---|---|---|
| ✅ | load: point 3 N at y 300 → same structural result as before | 84ee91fa761c vs 84ee91fa761c, tip 1.7363102156226744 |
| ✅ | geometry: semi-span 420 → same result | 78eb4b4de76c vs 78eb4b4de76c |
| ✅ | material: shell E 2800 MPa → same result | a8db5d13961e vs a8db5d13961e |
| ✅ | rib: interior rib at 150 mm → same result | 8fc3bba4234d vs 8fc3bba4234d |
| ✅ | spar: bonded spar → same result | 0da0d36a493d vs 0da0d36a493d |
| ✅ | aerodynamics: V 18, α 5 Standard → same panel solution | 6251ac85fd23 vs 6251ac85fd23 |
| ✅ | Solve Aerodynamics runs one aero sequence and no structural solve | {"solve":5,"aeroPost":1,"aeroMain":0,"makeGeometry":77} |
| ✅ | Apply aerodynamic loads to structure → same coupled result | de0a8912c146 vs de0a8912c146 |

### Aerodynamic status and result views (no structural solve needed) (16/16 passed)

| | Check | Measured |
|---|---|---|
| ✅ | aero status shows Solved, load not applied |  |
| ✅ | surface Cp view draws the panel field | 2426 sampled non-white pixels |
| ✅ | click probe reports side, strip, panel, y, x/c, Cp and p − p∞ | 1. Upper surface · strip 6, panel 16 of 32 from the leading edge · y 215.7 mm (η 0.513) · x/c 0.476 · x ≈ 61.49 mm · Cp −0.5372 · p − p∞ −106.6 Pa |
| ✅ | surface CSV holds every base-mesh panel (2 × 19 × 32 = 1216) | wing-aero-cp.csv: 1216 rows |
| ✅ | surface PNG export is a PNG image | wing-aero-cp.png 434434 bytes |
| ✅ | pressure view is labelled p − p∞ in Pa |  |
| ✅ | sectional Cp CSV has 32 upper and 32 lower panels | wing-aero-section-strip6.csv |
| ✅ | spanwise lift reports integrated semi-wing and both-halves lift |  |
| ✅ | coefficients view lists CL, CDi, Cm with uncertainty, convergence and admission status |  |
| ✅ | no structural solve while viewing aero results |  |
| ✅ | a structural result tab closes the aero view |  |
| ✅ | aero status reports the applied load and its admission | Standard · α 5° · V 18 m/s. load applied · admitted, torque & twist withheld |
| ✅ | shape change: Aerodynamics shows Out of date | {"span":430,"aero":"Out of date","chip":"Out of date","text":"Inputs changed — press Solve Structure / Stress. Results shown are for the last solved model."} |
| ✅ | aero result view is withheld after a shape change |  |
| ✅ | aero result valid again for the restored shape |  |
| ✅ | phone: aero Cp view draws and a tap places a probe | {"x":176,"y":377.0625} |

### Save / Open JSON, stale and error states, Undo (7/7 passed)

| | Check | Measured |
|---|---|---|
| ✅ | Save JSON writes the same study file as before | mie446-printed-wing-study-2026-10-27.json |
| ✅ | Open JSON shows its review popup below the bar, at the Open JSON command, inside the window | {"x":444,"top":113,"bottom":880,"commandLeft":444,"barBottom":105,"vh":900} |
| ✅ | applying the opened study marks the structure out of date until solved |  |
| ✅ | opened study solves to the same result as in the pre-redesign page | 3d79e33d5902 vs 3d79e33d5902 |
| ✅ | shape change: the structural result is marked out of date | Out of date: Inputs changed — press Solve Structure / Stress. Results shown are for the last solved model. |
| ✅ | Solve Structure / Stress then refuses the old aerodynamic load and says why | {"dialog":true,"msg":"The applied aerodynamic load was solved for a different wing shape. In Aerodynamics, press Solve Aerodynamics again and apply the loads, or remove the aerodynamic load.","chip":"Input error","text": |
| ✅ | Undo restores the previous span |  |

### Result views (3/3 passed)

| | Check | Measured |
|---|---|---|
| ✅ | Stress tab selects the stress view |  |
| ✅ | Displacement + Deformed shows the deformed shape |  |
| ✅ | More results selects bending moment |  |

### STL export (5/5 passed)

| | Check | Measured |
|---|---|---|
| ✅ | exporter checks the printer envelope and offers module splits | Module 1 is 160.1 × 420.0 × 19.5 mm; it does not fit the 300 × 300 × 300 mm printer. Increase Printed modules or revise dimensions. No automatic scaling. |
| ✅ | closing the exporter returns focus to File |  |
| ✅ | exporter applies 2 modules per half and re-solves the study | Applied 2 modules per half · 2 semi-wing pieces. The updated study has been solved. Close this panel and choose Download STL again to build and check the actual |
| ✅ | Download STL (exporter already open) still closes the File menu |  |
| ✅ | STL export completes and downloads the printable modules | Wing_STL.zip · 328441 bytes · wing_module_1.stl, wing_module_2.stl, print_record.json · Ready · Semi-wing · 208.4 g printed plastic · 2 module(s) · 0.5 s. Watertight STL and printer-envelope checks  |

### 1920 × 1080 and 390 × 844 (phone) (18/18 passed)

| | Check | Measured |
|---|---|---|
| ✅ | no horizontal page overflow at 1920 | 0 px |
| ✅ | 1920: #wxFileMenu opens fully inside the window |  |
| ✅ | 1920: #wxViewMenu opens fully inside the window |  |
| ✅ | 1920: #wingSide opens fully inside the window |  |
| ✅ | 1920: #wingSide opens fully inside the window |  |
| ✅ | 1920: no solver started by menus |  |
| ✅ | 1920: command and result targets are at least 34 px tall | 36,36,36,36,36,36,36,34,34,34,34,34 |
| ✅ | no horizontal page overflow at 390 | 0 px |
| ✅ | 390: #wxFileMenu opens fully inside the window |  |
| ✅ | 390: #wxViewMenu opens fully inside the window |  |
| ✅ | 390: #wingSide opens fully inside the window |  |
| ✅ | 390: #wingSide opens fully inside the window |  |
| ✅ | 390: no solver started by menus |  |
| ✅ | 390: command and result targets are at least 44 px tall | 44,44,44,44,44,44,44,44,44,44,44,44 |
| ✅ | phone: the 3-D view starts within the first screen | view top 483 px of 844 |
| ✅ | phone: structure panel spans the width and shows the material fields |  |
| ✅ | phone: every aero view fits the width |  |
| ✅ | phone: no horizontal overflow with the aero view open |  |

### Page errors (3/3 passed)

| | Check | Measured |
|---|---|---|
| ✅ | no page errors at 1440 |  |
| ✅ | no page errors at 1920 |  |
| ✅ | no page errors at 390 |  |

### Other (1/1 passed)

| | Check | Measured |
|---|---|---|
| ✅ | geometry Apply marks results out of date (structure chip) |  |

Informational: first Stress view after the coupled solve (ms, informational) = 26432 (the old page takes as long; see
`tests/results/stress_view_timing_*.log`).

### Popups that belong to a bar command (9/9 passed)

Open JSON review, New / Clear confirmation and a lesson from Help, at 1440, 1920 and 390 px: each must open below the
bar and fit inside the window (`check_popups.mjs`; top, bottom, left, right in px).

```
PASS 1440: open_json_review {"hidden":false,"top":113,"bottom":880,"left":444,"right":1044,"barBottom":105,"vh":900,"vw":1440}
PASS 1440: new_clear {"hidden":false,"top":113,"bottom":355,"left":375,"right":795,"barBottom":105,"vh":900,"vw":1440}
PASS 1440: lesson {"hidden":false,"top":113,"bottom":880,"left":592,"right":1432,"barBottom":105,"vh":900,"vw":1440}
PASS 1920: open_json_review {"hidden":false,"top":113,"bottom":1060,"left":444,"right":1044,"barBottom":105,"vh":1080,"vw":1920}
PASS 1920: new_clear {"hidden":false,"top":113,"bottom":355,"left":375,"right":795,"barBottom":105,"vh":1080,"vw":1920}
PASS 1920: lesson {"hidden":false,"top":113,"bottom":1060,"left":1072,"right":1912,"barBottom":105,"vh":1080,"vw":1920}
PASS 390: open_json_review {"hidden":false,"top":209,"bottom":824,"left":8,"right":382,"barBottom":201,"vh":844,"vw":390}
PASS 390: new_clear {"hidden":false,"top":209,"bottom":459,"left":8,"right":382,"barBottom":201,"vh":844,"vw":390}
PASS 390: lesson {"hidden":false,"top":209,"bottom":824,"left":8,"right":382,"barBottom":201,"vh":844,"vw":390}
```

## 3. The project's own AeroStruct test suites

On the ported sources (`source-port/`: ZIP sources + main's 0bb76f3 template edit + this redesign, with four test
expectations updated for the new layout and button names):

```
Wing AeroStruct test run
date (UTC): 2026-10-28T00:00:10Z
node: v22.23.4   python: Python 3.13.18   cpu: 2 cores
jsdom: /home/claude/wingui/jsdom26/node_modules/jsdom

build    ok    site-aerostruct/index.html 2038 KB; wing-aero/ 2ff1da57ee4c (bundle 13eb802302b6); wing-print/ a56bd8704a71; docs/ untouched
test_wing_aero_kernels         exit 0     0.7 s  test_wing_aero_kernels: 21 checks passed
test_wing_aero_closed_bodies   exit 0     5.3 s  test_wing_aero_closed_bodies: 34 checks passed
test_wing_aero_trefftz         exit 0     0.2 s  test_wing_aero_trefftz: 23 checks passed
test_wing_aero_conformal       exit 0    11.5 s  test_wing_aero_conformal: 28 checks passed
test_wing_aero_wing            exit 0    22.2 s  test_wing_aero_wing: 65 checks passed
test_wing_aero_vlm             exit 0     4.2 s  test_wing_aero_vlm: 7 checks passed
test_wing_aero_admission       exit 0    54.4 s  test_wing_aero_admission: 259 checks passed (54.3 s)
test_wing_aero_transfer        exit 0    13.6 s  test_wing_aero_transfer: 28 checks passed
test_aerostruct_engine_fork    exit 0    10.9 s  test_aerostruct_engine_fork: 128 checks passed (10.8 s)
test_aerostruct_twist          exit 0    49.2 s  test_aerostruct_twist: 96 checks passed (49.0 s)
test_wing_aero_worker          exit 0    15.1 s  test_wing_aero_worker: 18 checks passed
test_aerostruct_study_io       exit 0    29.3 s  test_aerostruct_study_io: 51 checks passed
test_aerostruct_aero_ui        exit 0    10.3 s  test_aerostruct_aero_ui: 35 checks passed
test_aerostruct_page           exit 0    75.5 s  test_aerostruct_page: 43 checks passed
test_aerostruct_browser        exit 0   194.6 s  test_aerostruct_browser: 64 checks passed in Chromium (local three.js r128); screenshots in /home/claude/wingui/final/pr

suites failed: 0
Wing Lab files changed (docs/, web/): not checked (this folder is not a git checkout of the repository)
```

The four UI-facing suites on main's sources **without** the redesign, for comparison:

```
test_aerostruct_study_io     exit 0  test_aerostruct_study_io: 51 checks passed
test_aerostruct_aero_ui      exit 0  test_aerostruct_aero_ui: 35 checks passed
test_aerostruct_page         exit 0  test_aerostruct_page: 43 checks passed
test_aerostruct_browser      exit 1  Node.js v22.23.4
```

**Outstanding comparison (main without the redesign):** the unmodified project browser suite stops on main's page at
390 px with `page.fill: Timeout 30000ms exceeded. · waiting for locator('#aeroV') · element is not visible`. Since main's hand edit 0bb76f3 the aerodynamics section of the
input column starts open (`<details id="wlAero" open>`), so the suite's click on its summary closes it and the flow
inputs are hidden. This is independent of the redesign; with the redesign the suite opens the Aerodynamics panel from
the command bar and all 64 checks pass.
