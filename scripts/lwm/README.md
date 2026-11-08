# Finite-wing reference comparison

The application lives at `docs/wing-panel-stress-analyzer/wing-comparison/`.
It compares **our executed panel solves**, **our execution of the original pretrained LWM** and **published experimental points**. It does not execute CFD or use measured lift to condition ML predictions.

Source: [Large Wing Model](https://github.com/hwlee924/Large-Wing-Model), pinned commit `4cca875b84b97571569070a8032ce304db3d7311`; [paper](https://arxiv.org/abs/2508.11827). Model source and weights are not redistributed here. Two distributed wing checkpoints were used, not a newly trained model. The exported prediction artifact SHA256 is in `benchmarks.json`.

The two fixed cases are NACA0012 (alpha 8.85 degrees, M .13, semi-span/chord 2.95) and NACA0015 (the authors' tunnel-corrected alpha 4.1 degrees, M .17, semi-span/chord 3.2882). The second case's raw metadata instead lists alpha 4 and M .13; that discrepancy is exposed in the UI. Measurements for this case cover only the outer wing. These benchmarks do not validate arbitrary planforms, angles, stall, or a low-Re 900 mm foam wing.

Panel mesh levels are 16x8, 24x12 and 32x16 (chordwise panels per surface x spanwise base strips): 288, 672 and 1152 actual semi-wing panels including automatic rounded-tip refinement. Pressure errors use linear interpolation of panel-centroid values strictly inside their chord/span coverage, with no extrapolation. ML is evaluated at the actual measurement points. Mean errors are point-weighted, not area-weighted. Source measurements remain discrete. Both full pressure-force CL and the paper's normal-only approximation are labelled separately.

`Re-solve panel` runs the current bundled panel solver in a Web Worker. ML remains the recorded Unity inference. Source geometry sampling and the panel's analytic closed-TE NACA/rounded-tip geometry are not identical. Model 2-sigma bands are not calibrated 95% accuracy guarantees: observed point coverage was 84.7% and 70.0%, and original covariance averaging omits between-checkpoint mean variance and model-form uncertainty.

Tests (Node 22):

```
node scripts/lwm/test_wing_comparison.cjs
MIE446_JSDOM_MODULE=/path/to/jsdom node scripts/lwm/test_wing_comparison_page.cjs
```

The first test reproduces both recorded coarse panel solves through the actual browser worker and verifies recorded matched-point errors, holdout conditioning, source provenance and refusal to extrapolate. The second tests selection, discrete markers, cancellation/stale results, source warnings, fresh/recorded labels and error recovery. The application was also tested with actual browser solves for both 1152-panel cases.

Unity live inputs, logs, model outputs, covariance and recovery archives are on the allocated shared Workspace; no frequent outputs belong on `/project`. The completed scientific archives also have SHA256-verified copies on the user's external drive. A full project filesystem blocked durable archival on 2026-11-08; archival was stopped without deleting unique scientific data.