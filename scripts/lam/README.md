# Wing Lab / Large Airfoil Model experiment

This is a separate section-level screening tool, linked from the current Wing Lab. It uses actual inference from upstream ADAPT to compare pressure, lift and moment, with full joint covariance propagated to integrated quantities. The browser uses recorded predictions; it does not run a neural model when controls change.

Source: https://github.com/hwlee924/Large-Airfoil-Model at `5353a862ec8c453788efef4e8aa8040148efbe6c`.
Paper: Lee, Seshadri and Rauleder, *Probabilistic inverse airfoil design using experimentally-driven machine learning models*, https://doi.org/10.1016/j.ast.2026.113783, Section 2.5 and Data availability. The article is CC BY 4.0. The inspected repository tree contains no explicit top-level software LICENSE; this integration redistributes neither upstream Python source nor model checkpoints. The adapter is independently written and records hashes.

## Why this helps wing design

For a flexible wing, select sections using several operating points and the actual required lift, while reducing moment about the section shear centre. A lower two-sigma lift screen filters the selected lift target. The demonstrator ranks `abs(mean Cm_ref) + 2 sigma(Cm_ref)` and shows lift alongside it. A low score alone is not an optimum. The entered reference point is only a probe; a real candidate needs its shear centre recomputed from the actual foam/inserts/skin construction and a new coupled Wing Lab solve. Multi-point probabilistic inverse design and manufacturing-tolerance optimization are future work, not claimed implemented here.

## Reproduce

Use an isolated Python 3.12 environment on project storage. Tested packages and weight/source hashes are recorded in `docs/wing-panel-stress-analyzer/ml-airfoil/demo.json`. Torch CPU, gpytorch 1.15.2, numpy 1.26.4, scipy 1.15.3, pandas 2.2.3 and scikit-learn 1.6.1 were used. Pandas was updated from the upstream 1.5.3 pin because it has no Python 3.12 wheel; the inference equations and upstream source were not modified.

1. Obtain the pinned upstream source and the three files in `ADAPT/model` from that commit; their hashes are enforced by `export_adapt.py`.
2. `node scripts/lam/export_clark_y.cjs`
3. `python scripts/lam/export_adapt.py --upstream UPSTREAM_PATH --clark-y output/lam-current/clark-y.csv --alpha-step .1 --output output/lam-current/actual-predictions.json`
4. Copy the actual output to `docs/wing-panel-stress-analyzer/ml-airfoil/demo.json`, then run `node scripts/lam/add_panel_baseline.cjs` to add current 320-panel incompressible references. The source module hash, trailing-edge closure and model-form differences are recorded.
5. Validate with `node scripts/lam/test_screen.cjs` and `node scripts/lam/test_page.cjs` after exporting the actual result to the demo file.

The script restricts checkpoint globals, verifies exact upstream source/checkpoint hashes and uses CPU with two threads and a fixed seed. It never trains a replacement model. Coefficients are integrated by our own straight-segment formula, not the upstream Monte Carlo coefficient utility. Covariance is propagated as `W Sigma_Cp W^T`; reference transfer retains the cross-covariances.

## Limits that matter here

The published domain is alpha -4 to 12 degrees, Mach 0 to 0.9 and Re > 1e6. Re is not an ADAPT input. **No ranking is shown at Re 400,000**, typical of the previous Aeroclub example. High-Re uncertainty bands cannot establish low-Re validity. The tool reports section pressure loads, not finite-wing lift/induced drag, total viscous drag, stall certification, structural stress, divergence or flight safety. The recorded runs are a reproducibility and integration check, not an independent experimental validation of ADAPT. Original ASPIRE data may overlap training and therefore cannot automatically serve as held-out validation.

## Main comparison workspace (0.5.6)

The dedicated ◈ Aero comparison entry opens `ml-airfoil/#comparison`, outside Help. Actual ML records cover 0–12° in 0.1° increments for four original sections, NASA modified NACA0012 (M .15), and nominal NACA4412 at M .059 (TR-613 context): 726 cases. Generated panel baselines use current Wing Lab at 160 panels/side; `panel2d.js` is copied verbatim by `build_comparison.cjs`. Arbitrary transferred/imported sections get a browser panel solve, with no substituted ML. The 0–30° selector covers available experimental angles; above 12° no ML is invented, and above the panel module's existing ±15° limit its result is withheld.

NASA CFD registry has actual 0°, 10°, 15° Cp, CL and total CD. No intermediate-angle CFD is manufactured. TR-613/ASPIRE registry has measured/digitized Cp at 0,2,4,8,12,16,18,20,24,30°, Re 1.8e6, metadata Mach .059 (filenames round to .05). Raw file hashes, pinned repository and original NASA report URL are recorded. Missing endpoints are retained; no full CL/Cm/CD is fabricated from incomplete Cp. Digitization uncertainty is not quantified. Nominal NACA4412 is used for panel/ML, not an independently measured historical manufactured shape. ASPIRE can overlap model training: agreement is not held-out validation.

Imports use `wing-cfd-reference-v1`: `airfoil`, complete unit-chord `geometry.upper/lower`, `mach`, `reynolds`, HTTPS `source.url`, `source.solver`, `source.type` cfd/experiment, and unique-angle `cases` with increasing sampled `branch1/branch2` Cp rows. Optional coefficients: `cl`, `cmQuarter` (nose-up), `totalCd`; absent quantities stay absent. Coverage is never extended and reference angles are not interpolated. Re/Mach and geometry must match before overlay. Files are parsed locally, not uploaded. Importing a reference does not generate ML.

Reproduce the original five contexts using `--alpha-step .1 --alpha-max 10 --additional-geometry output/lam-current/nasa-naca0012.csv`, plus the 10.1–12 batch via `--alpha-min 10.1 --alpha-max 12`. Generate the experiment Mach batch with `--airfoil "NACA 4412" --mach .059 --alpha-step .1 --alpha-max 12`, rename its context as in the checked dataset, merge outputs, then run `add_panel_baseline.cjs` and `build_comparison.cjs`. Original downloaded CSVs remain in `output/lam-current/experiment`. No CFD solver is run. `test_comparison.cjs` checks source coverage, matching refusal, exact missing angles, measured point retention, ML withholding, actual panel and UI events.

Wing comparisons require matching three-dimensional reference data and a separate wing ML model. The linked Large Wing Model paper is a research direction, not a deployed or validated wing inference engine. No 2D ADAPT values are presented as whole-wing predictions.

## Edge-geometry repair (0.5.7)

The comparison formerly interpolated 81 ML geometry samples per surface linearly and snapped only the final TE vertex to the mean ordinate. This produced a nonphysical local wedge and inherited under-resolved LE geometry. Panel geometry is now independent of the ML evaluation grid: exact NASA modified-NACA0012 formula; normal-offset analytic NACA 4-digit geometry with the existing Wing Lab smooth x^4 closed-TE thickness correction; and original Clark Y coordinates with shape-preserving cubic interpolation in sqrt(x/c). Arbitrary imported geometries retain their coordinates and use the same disclosed smooth closure approximation. Named analytic geometry requires a verified `panelGeometrySpec` descriptor, never a name guessed from an uploaded file.

This remains a sharp-edge inviscid solver, not a finite-base viscous/wake model. The finite-gap-to-closed-TE approximation and original gap are explicitly displayed; ADAPT and raw CFD/experimental data are unchanged. Therefore a modified panel section is not claimed to be an exact geometry match with a finite-gap ML/experimental section. NASA's already-closed definition needs no TE displacement. The original shared solver mathematics is unchanged and copied verbatim.

Users can select 16–512 panels per surface and recompute selected Cp/coefficient rows. Polar curves retain a labelled 160/side baseline. A mesh-check button solves coarser/current/finer meshes, reports CL/Cm/pressure-drag and Cp at fixed positions, and offers leading-/trailing-edge Cp profiles without dropping endpoint panels. Last-panel Cp values sample different positions as the mesh changes: finite-angle TE stagnation Cp=1 is a point limit, not a reason to suppress physical recovery or call every TE difference numerical error.

`test_panel_accuracy.cjs` independently derives exact CL and Cp for a Joukowski map (circle centre -0.1, radius 1.1, alpha 4 deg), compares every midpoint parameter without omitting edge samples, and verifies decreasing Cp errors and pressure-drag residual on 80/160/320 meshes. It also reproduces the NACA4412/TR613 screenshot at 3.9 deg and checks NASA 0/10/15 mesh behaviour. The deterministic public `panel-validation.json` records the results and limits. Regenerate panel baselines with `add_panel_baseline.cjs`; this never changes ML predictions or source references.
