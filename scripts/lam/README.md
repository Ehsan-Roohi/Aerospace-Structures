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

## Three-method worked example

The in-app Help uses NASA TMR CFL3D/SA reference data, alpha 0 degrees, Mach .15 and Re 6 million, on the NASA sharp-edge NACA 0012 definition (original section extended to x=1.008930411365 and rescaled). Source pages and raw-file hashes are in `cfd-comparison.json`. CFD was downloaded, not re-solved here, and is not experimental truth. All 513 contour points are retained. The source warns of high numerical error very near the trailing edge.

Generate the NASA contour from that formula with 401 cosine stations per surface, retaining the leading-edge coordinate separately on both branches for the upstream CSV surface splitter. Run `export_adapt.py --clark-y NASA_CONTOUR.csv --custom-name "NACA 0012 (NASA TMR geometry)" --upstream UPSTREAM --output output/lam-current/cfd-matched-inference.json`. Re is comparison context only and not consumed by ADAPT. Download `n0012cp_cfl3d_sa.dat` and `n0012clcd_cfl3d_sa.dat` from https://tmbwg.github.io/turbmodels/NACA0012_validation/ to `output/lam-current/`, then run `node scripts/lam/build_cfd_example.cjs`. The generator checks the ML surface representation against the actual NASA formula to 1e-6 chord and executes the current panel code on that formula.

The help distinguishes Cp comparisons from total drag, shows the surrogate's nonzero lift in a symmetric case, and provides checked examples for the lift screen, reference-point moment transfer and low-Re withholding. Run `test_help.cjs` for source coverage, geometry, arithmetic and UI actions.

The public angle control records actual ADAPT predictions for all four sections from 0 to 4 degrees at 0.1-degree increments (164 cases). The slider selects these records; no Cp/covariance interpolation is used.
