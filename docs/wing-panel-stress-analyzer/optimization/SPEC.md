# MIE 446 Optimization Lab: shared specification for module implementers

You are implementing ONE module of a browser-based educational optimization lab that sits next to
Ehsan Roohi's existing teaching apps (Beam, Truss Lab, Wing AeroStruct) at
https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/ .
The lab will be published at `.../wing-panel-stress-analyzer/optimization/<module-name>/index.html`.
Each module is fully self-contained: it must not depend on any other module and must not modify anything
outside its own folder. Read this file completely before writing code.

## 1. Non-negotiable rules

1. Deterministic, explainable optimization only. No language model anywhere, and no randomness that changes results
   between runs (use the seeded `makeRng` from labkit if you need pseudo-random numbers). A statistical surrogate such as
   the Gaussian process in constrained-bo may propose candidates, but it never supplies a displayed result: every number a
   student sees comes from the exact solver of the page.
2. "Propose, then verify": every optimum or recommended design shown to the student is re-solved from scratch
   with the exact solver, and all constraints are re-checked on that re-solve. Show the result with
   `badge('ok', 'Checked by fresh model solve')` or, if the verification fails, `badge('bad', ...)` with the reason.
   Never display a design as feasible on the strength of an approximation, an interpolation, or a surrogate.
3. Simplified physics must be stated plainly. Each page carries a `.scope` callout at the top saying what model
   is used (for example "Euler-Bernoulli beam, linear elastic, small deflection") and what is NOT claimed
   (no certified strengths, no stability or fatigue claims, independent of the Wing AeroStruct solver).
   Unavailable physics is never turned into a pass. If a check is a screening indicator (for example an Euler
   buckling estimate with assumed effective length), label it "screen" and say so.
4. English UI text and documentation. Natural prose, no em-dashes anywhere (use commas, colons or full stops).
   Define every abbreviation at first use. Keep the tone educational, concrete and free of hype.
5. SI units: length mm, force N, stress and modulus MPa (N/mm^2), density g/cm^3, mass g, angles degrees.
   mass_g = volume_mm3 * rho_g_cm3 / 1000. Label every input and output with its unit.
6. No external resources: no CDNs, no fonts, no npm runtime dependencies. Pure ES modules that run from a static
   GitHub Pages folder served over HTTP (ES modules do not run directly from `file://` in Chrome). Modern browsers only (ES2020, canvas 2D, optional module Web Workers).
7. The normal solve must stay fast. Anything above about 200 ms of work runs either in a module Web Worker
   (`new Worker(new URL('./<name>.worker.js', import.meta.url), { type: 'module' })`) or in chunks via
   `setTimeout`/`requestAnimationFrame` with a `<progress>` element, with a Cancel button. The page must never freeze.
8. Student pedagogy: the page is used by undergraduates who first solve the problem themselves. Always show
   (a) the student's own design point, (b) the optimized alternative, (c) which constraint is active (governing)
   at the optimum, (d) the quantitative gain (for example mass saved in grams and percent). Where a classical
   closed-form result exists (listed per module), show it beside the numerical optimum so students see them agree.
9. Accessibility and robustness: every control has a label; invalid inputs produce a readable message in the
   `#status` element (class `error`) instead of an exception; results tables use `<table class="results">`.
10. Do not write marketing text, do not call anything "AI", do not promise validation that was not done.

## 2. Files and folder layout

The development tree mirrors the published tree exactly. Work only inside
`/home/claude/optlab/optimization/<module-name>/`. The shared kit lives in `/home/claude/optlab/optimization/shared/`
(read-only for you). Create exactly these files (plus an optional `<module-name>.worker.js` when a worker is needed):

```
optimization/<module-name>/
  <module-name>.js        pure ES module: solvers, optimizers, helpers. NO DOM access. May import ../shared/presets.js (data only).
  index.html              the page (copy ../shared/TEMPLATE.html and adapt). Thin glue only: read inputs, call the module, render.
  <module-name>.test.js   Node tests using `node:test` and `node:assert/strict`, importing ./<module-name>.js
  README.md               scope, model, algorithm, verification, limitations, classical references (plain text, no em-dashes)
```

Relative paths from every file in your folder: stylesheet `../shared/lab.css`, kit `../shared/labkit.js`,
presets `../shared/presets.js`, your module `./<module-name>.js`. Run tests from `/home/claude/optlab` with
`node --test optimization/<module-name>/<module-name>.test.js` (package.json there sets `"type": "module"`).
labkit.js touches `window`/`document` only inside functions, so importing it in Node for tests is safe, but keep DOM
rendering out of your pure module anyway.

Page title format: `<Module title> · MIE 446 Optimization Lab`. Header crumbs link to `../index.html` (the lab hub),
`../../#beam`, `../../truss-lab.html`, `../../` as in the template. Version string `<module-name> 0.1.1`.

## 3. Shared kit (read `/home/claude/optlab/shared/labkit.js` and `/home/claude/optlab/shared/presets.js`)

labkit.js exports:
- `fmt(x, digits=3)`, `escapeHTML(s)`, `badge(kind, text)` with kind in ok | warn | bad | info
- `setupCanvas(canvas)`, `canvasPoint(canvas, evt)` for probes
- `linePlot(canvas, series, opts)` series `[{x, y, label, color, type:'line'|'scatter'|'both', width, dash, size}]`,
  opts `{title, xlabel, ylabel, xlim, ylim, legend, grid, markers:[{x,label,color}], hlines:[{y,label,color}], yZero, xZero}`;
  returns `{ctx, X, Y, xlim, ylim, frame}` so you can draw extra shapes in logical pixels afterwards.
- `categoryPlot(canvas, labels, values, opts)` horizontal bars; `values` may be `number[]` or `number[][]` for grouped
  bars (before/after); opts `{title, xlabel, xlim, colors, colorFn(v,i,g), refLines:[{x,label,color}], valueFmt, groupLabels}`.
  Negative values are supported, so a sensitivity profile is just a categoryPlot with signed values.
- `heatmap(canvas, xs, ys, Z, opts)` with `Z[j][i]` (row j over ys), opts `{title, xlabel, ylabel, zlabel, zlim, cmap,
  contours:[{levels, color, width, dash, labels}], mask (boolean[][] hatched), overlays:[{x,y,label,color,shape,size}]}`.
- `contourLines(xs, ys, Z, level)` marching squares segments; `colormap(name)`; `niceTicks`; `linspace(a,b,n)`;
  `makeRng(seed)` deterministic PRNG; `downloadCSV(filename, rows)`; `downloadPNG(canvas, filename)`.
Structure drawings (truss geometry, beam shapes, deformed shapes) are drawn with your own canvas code using
`setupCanvas` for HiDPI; use `palette` colors. Canvas elements carry logical `width`/`height` attributes and class `plot`.

presets.js exports `MATERIALS` (pla, petg, al6061, spruce, cfrp, wire, steel with E, sigmaAllow, rho),
`massGrams`, `sectionProps(type, params)` for rect | tube | ibeam | box returning `{A, I, c, tmin, h}`,
`TRUSS_PRESETS['wright-bay' | 'warren']` (nodes, members with group keys, groups with material/A0/tensionOnly/buckling,
supports, loads, loadCases) and `BEAM_PRESETS`. Use these presets so all modules speak the same language; you may add
your own extra presets inside your module.

## 4. Solver conventions

Beam (Euler-Bernoulli, linear elastic): use a 2-node Hermite cubic beam finite element with per-element EI (so tapered
and stepped beams work), or closed forms where exact. Support types: cantilever (clamped at x=0), simply supported,
general supports at arbitrary x (pin: v=0; clamp: v=0, theta=0). Loads: point load P at a, uniform load w on [a,b],
optional point moment. Report shear V(x), moment M(x), deflection v(x), max |sigma| = |M| c / I, reactions.
Utilization: U_stress = |sigma_max| * FS / sigmaAllow, U_defl = |v_max| / (L / ratio). Feasible means every U <= 1.
Sign convention: y up, loads positive upward, moment positive sagging (state it in the page).

Truss (2D linear elastic bars): standard direct stiffness, member force N = (E A / L) * (du along axis), stress N/A.
Utilization in tension: |N| * FS / (A * sigmaAllow). Compression: U = max(stress utilization, |N| * FS / P_cr) where
P_cr = pi^2 E I / (K L)^2 with I = A^2 / 12 for group.buckling === 'square' (solid square), K = 1 unless the UI says
otherwise; groups with buckling 'none' use only the stress check. Tension-only groups (bracing wires) that end up in
compression are flagged `slack` with a warning badge, and the page explains that the linear model is then not valid for
that wire (keep it simple: report, do not iterate a tension-only solution unless your module is specifically about it).
Detect singular stiffness (mechanism) and report "unstable structure" instead of NaNs. Mass = sum(A L rho) / 1000 g.

Verification routine: a separate function (for example `verifyDesign(model, design)`) that rebuilds the model from the
candidate design numbers, solves it with the plain solver and returns `{ feasible, utilizations, governing, mass }`.
The page shows this verified result, not the optimizer's internal estimate.

## 5. Testing (mandatory)

`node --test modules/<module-name>/<module-name>.test.js` must pass under Node 22 with no npm packages.
Include analytic checks relevant to your module (listed in your task) and at least: solver against a closed form,
optimizer reaches the expected optimum on a case with a known answer, verification routine rejects an infeasible design,
inputs that would produce NaN or singular systems are reported as errors not exceptions. Keep tests fast (< 10 s total).

## 6. Page checklist before you finish

- Loads with no console errors (module paths correct, no missing ids).
- Default preset solves on page load; buttons work; Reset restores the preset.
- Inputs panel left, results right (template grid); results include KPI tiles, at least one plot, a results table.
- Scope callout at top, limitations and classical reference in a "How it works" details block.
- A "Download CSV" button for the main table/plot data where it makes sense.
- No text overflow in plots; labels readable; colors from the kit palette; feasible/infeasible shown consistently
  (green = feasible, red = violated, amber = active or near the limit).

## 7. Final report format (your last message)

1. Files written (paths).
2. Features implemented, each in one line.
3. `node --test` output summary (pass/fail counts).
4. Classical results reproduced (numbers).
5. Known limitations and anything from the task you did not implement, stated plainly.
