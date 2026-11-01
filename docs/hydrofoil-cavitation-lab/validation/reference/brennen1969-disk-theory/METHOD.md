# Matched-reference cavity evidence — 31 October 2026

## What this comparison establishes

The **current axisymmetric stable-kernel research solver** is compared with two published theoretical pressure profiles for a disk cavity. This is a numerical-reference comparison, **not experimental validation**, and does not qualify the complete flow field. All six computed cases retain `accuracyQualified: false` and the unchanged independent off-grid screens.

The kernel identifies itself as `0.2.1-research-stable-kernel`; its exact source SHA256 for these fresh runs is `b3d8ee5e35d97f3224cfbf325b8ae9090406c077d6a1c4c31cf3ab4b702704da`. This kernel version is distinct from the containing application's UI release version.

The reference is C. Brennen, *A Numerical Solution of Axisymmetric Cavity Flows* (1969), printed p.680, Figure 3, DOI [10.1017/S0022112069000802](https://doi.org/10.1017/S0022112069000802), [author's Caltech record](https://authors.library.caltech.edu/records/46gc9-rw507). The source PDF SHA256 is recorded in `brennen-1969-theory-cp.json`.

## Case matching

| Quantity | Published reference | Current comparison |
|---|---|---|
| Geometry | Circular disk, axisymmetric attached cavity | Same disk-front geometry; radius R = 1 |
| Flow | Steady incompressible inviscid potential flow | Same governing-flow class |
| Closure | Riabouchinsky image-disk closure | Same image-disk closure; full disk-to-image distance L/R |
| Cavitation number | σ = 0.3 and 0.7 | For each mesh, solve **L/R** until computed σ matches the prescribed reference σ; target mismatch below 5×10⁻⁸ |
| Pressure normalization | Cp = 1 − (q/U)²; horizontal coordinate r/C, C = disk radius | Same Cp; r/R |
| Tunnel walls | Figure 3 overlays indistinguishable fixed-σ profiles for differing H/C | Unbounded domain. Page 679 §9 explicitly states the wall-dependent profiles cannot be distinguished on that figure's scale. Equivalence is limited to this reading resolution. |
| Reynolds number | Not a parameter of the theoretical inviscid curves | Not a parameter; no viscous/turbulent claim |
| Recovery/tail model | Artificial image disk | No empirical reentrant-jet or hydrofoil A-recovery model fitted to the data |
| Reference precision | Scanned published curves, no tabulated machine-precision data | 16 visible samples per σ, manual pixel coordinates retained; ±0.006 in r/R and ±0.012 in Cp are conservative reading bounds, not measurement uncertainty |

Only L/R is adjusted to match the requested σ. The pressure curve, circulation density, source terms, closure law, tolerances, and screening criteria are not fitted to the reference points.

## Reproduction and plotted quantities

1. `run-matched-disk.cjs` calls the current production kernel at Nc = 32, 64, 128 cavity bands, Nf = Nc/2 bands on each disk face. Total meridional bands are 64, 128, 256. Each inverse root and every numerical iteration are retained in the raw case files.
2. `digitize-reference.py` converts the explicitly listed source pixel centres into `brennen-1969-theory-cp.json` and CSV. If a locally obtained original scan is rendered under the documented image name and calibration, the script can also produce an overlay to verify all 32 selected centres. Source PDF pages and screenshots are not redistributed in this package. Samples obscured by arrows, experimental squares, or the frame are not invented.
3. `plot-matched-disk.py` generates `matched-disk-cp.png/.svg`, `matched-disk-field.png/.svg`, portable profile JSON, a summary table and a CSV containing every directly evaluated field sample.

From this evidence directory, run `node verify-evidence.cjs` to audit the stored data and source hash. Run `node run-matched-disk.cjs` to repeat all six nonlinear solves; an explicit kernel path may be supplied as its first argument. Run `python digitize-reference.py` and `python plot-matched-disk.py` to repeat the transcription and figures (Python, NumPy, Pillow and Matplotlib). The source finder also supports this directory in an ordinary course-repository checkout. `manifest.json` lists the exact public evidence files, byte counts and SHA256 hashes; numerical verification does not depend on downloading source screenshots.

The Cp comparison shows the **reconstructed nodal surface trace** Cp = 1 − γ²; it must not be confused with the separately evaluated exterior velocity field. The second figure shows the actual direct exterior normal velocity and cavity Cp + σ at nine fractions of **every** band: 0.02, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95 and 0.98. No near-rim field samples are deleted or replaced by the trace. This exposes the remaining off-node inconsistency rather than hiding it behind close face-pressure curves.

The first and last reference symbols have padded axis limits. Exact rim values Cp(1) = −σ are drawn separately as **imposed boundary-condition limits**, never presented as independent digitized observations. The complete current computed rim trace remains visible, including its mesh dependence. No curve is fabricated from sparse experimental endpoints.

## Outcome and remaining failure

At Nc = 128, the matched cases are:

| σ target | L/R | CD/(1+σ) | Max direct normal/U | Max direct cavity pressure residual | Complete field admitted? |
|---|---:|---:|---:|---:|---|
| 0.3 | 8.578057 | 0.834996 | 0.02572 | 0.08355 | No |
| 0.7 | 3.068296 | 0.845785 | 0.02037 | 0.07641 | No |

Both nodal systems converge below 10⁻¹⁰ and the direct residuals decrease under refinement, but the unchanged full-field screens remain **0.01 for normal velocity/U** and **0.02 for cavity dynamic Cp residual**. The error is largest near meridional junctions; this is a discretization/trace-reconstruction issue, not cured by small linear-system residuals. Close pressure profiles on the wetted disk support the selected nodal-trace prediction only; they do not license declaring the free-boundary solver experimentally validated or fully accurate.

At the 16 digitized locations, finest-mesh nodal-trace Cp RMS differences are **0.03237** (σ=0.3) and **0.01488** (σ=0.7); maximum differences are 0.07658 and 0.04477. All samples overlap the conservative coordinate-reading rectangles when both horizontal and vertical scan bounds are considered. This overlap is not a pass criterion: near the steep rim curve, horizontal reading error produces a large Cp range. The σ=0.3 RMS difference increases from coarse to fine mesh, so this evidence must not be described as monotone convergence to the published pressure curve. Raw differences and all bounds are retained in `matched-disk-summary.json`.

CD is the **front-disk force relative to the constant cavity pressure**, normalized by ½ρU²πR². The image disk is a closure device, not a second real body whose opposing force should cancel the reported physical disk drag. Figure 4 of Brennen gives CD/(1+σ) approaching about 0.835 and 0.846 for these σ values at large H/C; that reading is a qualitative secondary cross-check, not an extra exact fitted datum.

## Why the experimental points are not called validation

The square symbols reproduced in Brennen Figure 3 are Rouse & McNown (1948) at σ = 0.24, rather than 0.3 or 0.7. The original [Iowa institutional record](http://ir.uiowa.edu/uisie/32) describes head forms on cylindrical shanks and a finite open/closed-throat tunnel. Exact identification of the test configuration, wall corrections, reference pressure and Reynolds number for the reproduced symbols is incomplete here. They are therefore **not included in the matched-case error calculation**. The existing five-point experimental digitization may remain visibly labelled as historical illustrative data, but must not be relabelled as a matched experimental accuracy test.

## Other primary comparisons: scope and obstacles

| Source | What is usable | Why it does not presently establish matched experimental accuracy |
|---|---|---|
| Brennen (1969), disk Fig.3 | Matched prescribed-σ numerical pressure profiles; reproduced above | Numerical theoretical reference, digitized finite resolution; full field still fails screening |
| Rouse & McNown (1948), *Cavitation and Pressure Distribution: Head Forms at Zero Angle of Yaw* | Primary experimental pressure distributions | Reproduced σ=0.24 symbols have incomplete full-body/tunnel/Re matching; not silently substituted for an isolated disk |
| Uhlman (1987), [author PDF](https://newenglandrandd.com/Papers/Uhlman1987.pdf), printed pp.114–115 | NACA16-006 α=4°, l/c=0.5 mesh study | Finite vertical Riabouchinsky termination wall, unlike the present 2D smooth zero-gap/recovery closure. Cannot import the reported σ as a matched test without implementing the same geometry and closure. |
| Kinnas & Fine (1993), [DOI](https://doi.org/10.1017/S0022112093002071), and [Kinnas chapter9](https://cavity.caee.utexas.edu/kinnas/COURSES/bem/kinnas_ch09.pdf), Fig.9.8 | Primary 2D free-boundary formulation; zero-recovery theoretical example | Current zero-recovery reproduction has not passed. Do not compare the default recovery=0.15 result against a λ=0 reference or call an inadmissible branch accepted. |
| Nouroozi et al. (2016), [DOI](https://doi.org/10.1155/2016/1593849) | Axisymmetric simple/reentrant-jet closure comparisons | Figure6 disk uses a specified jet/cavity length ratio 0.5, not the image-disk closure; experimental comparison cited through a secondary book. |
| Brennen (1969), spheres / [author textbook §8](https://media.library.caltech.edu/CaltechBOOK:1995.001/chap8.htm) | Useful detachment and blockage physics | A sphere in a finite tunnel with B/b=14.7 is not this unbounded disk. No relabelling. |

The 2D hydrofoil smooth-detachment cases and axisymmetric cavity cases are separate modules. Neither adding a structural spar nor obtaining a good wet-body panel benchmark resolves an inadmissible cavity pressure/gap or inconsistent free-surface velocity field.
