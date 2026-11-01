# Disk-cavity dimensions: current C1 solver and Waid's experiment

This is a qualified comparison with measured characteristic dimensions, not an experimentally qualified model of the full test facility or cavity closure. All four resolved high-cavitation-number circles in the selected source series and both meshes are retained. No measured cavity dimension is fitted.

## Primary evidence and normalization

R. L. Waid, *Cavity Shapes for Circular Disks at Angles of Attack*, Report E-73.4 (1957), [Caltech primary record](https://authors.library.caltech.edu/records/cape9-a2b62). Figures 12 and 13 (PDF pages 22 and 23) show the selected zero-incidence, 1-inch disk, 12-ft/s series. Figure 17 (PDF page 27) additionally prints sigma = 0.1417 for that condition. The other three sigma values are paired reads from the two characteristic-dimension graphs.

The report defines a0 as the distance from the disk to the maximum-radius station; it is not the total closure length. It defines b0 as the maximum radius minus disk radius. For the image-symmetric current solver, with disk radius R and image-disk spacing L, the corresponding quantities are:

- a0/d = L/(4R), with d = 2R;
- b0/d = (Rmax/R - 1)/2.

The selected experimental series uses a 20 by 20-inch tunnel, sting and strut, air-sustained cavity and gravity. The source removes the buoyant rise of the centreline in the first-half profiles. Sigma uses disk-centre static pressure and the measured cavity pressure. These conditions are not all represented by the current unbounded, inviscid image-cavity model. In particular, its image disk is not the measured downstream closure. The comparison therefore concerns forward-half characteristic dimensions only.

`waid-digitization.json` records source-page hashes, pixel coordinates, axis calibration and all four paired reads. The displayed bounds, sigma +/-0.001, a0/d +/-0.10 and b0/d +/-0.012, are conservative manual reading bounds, not confidence intervals. The source's profile-reading estimate of +/-0.015 inch is a separate statement. The nonmonotonic a0 measurements are retained.

The source's equations 4 and 5, a0/d = 0.540 sigma^(-1.118) and b0/d = 0.267 sigma^(-0.568), are empirical correlations, not point measurements. Their stated range is 0.035 <= sigma <= 0.171. The plotted correlations stop at 0.171; the fourth raw measurement is retained beyond that limit without extending the fit.

## Current solver runs

The unchanged reviewed C1 kernel SHA-256 is `9bfb67177b372128a26c0893f7df35fc3bfadae5ea6e30a2770d6b71905bfc7c`. Each measured sigma is the sole inverse target. Illinois/secant search varies L/R inside the existing 2 to 24 domain until absolute sigma mismatch is below 5e-8. It does not use measured a0 or b0 to choose the root. Unsuccessful iterates and search traces remain in the raw results or progress files.

Meshes use Nc = 64 and 128 cavity bands, Nf = Nc/2 on each disk face, hence N = Nc + 2 Nf = 128 and 256 total boundary bands. Nodal integration uses near/far quadrature 24/12; maximum 28 nonlinear iterations and nodal tolerance 1e-10 are unchanged. After matching, every reported case receives the direct field audit on all nine fractions (0.02, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.98) of every band. The direct audit retains its production quadrature and thresholds.

The normal-velocity threshold is 0.01 U over the complete boundary. The cavity pressure-residual threshold is 0.02 in Cp. Both Nc = 64 failures are retained: sigma approximately 0.1312 fails both checks and sigma = 0.1417 fails the pressure check. All four Nc = 128 cases pass these unchanged numerical field checks. This establishes resolved numerical checks at the tested settings; it is not an experimental accuracy certificate.

The raw property named `cavityCpPlusSigmaDefect` stores speed squared minus qc squared. Its sign is opposite the physical Cp + sigma. The residual figure explicitly negates that raw array to display physical Cp + sigma. Absolute admission thresholds are unaffected. Normal residual plots show all samples over the complete front-disk, cavity and image-disk boundary; no endpoint or rim samples are removed.

## Files and reproduction

Run `match-waid-additional.cjs 1 3 4` with Node from this folder to reproduce the additional cases, using the source at its declared repository-relative path. The separately retained `match-waid-1417.cjs 64` and `match-waid-1417.cjs 128` produce the printed sigma = 0.1417 case. The comparison script requires the eight completed raw JSON files, checks their source hashes and matching tolerance, and produces the JSON, CSV and two PNG/SVG figures:

`python compare-waid-current.py`

`waid-current-comparison.csv` reports signed differences, 100 times (prediction minus digitized measurement) divided by measurement. Reading uncertainty, model discrepancy and mesh effects are not merged into a single error bar. Small 64-to-128 changes in dimensions coexist with noticeably larger differences from some measured a0 values; do not describe this as complete physical agreement.

The public evidence contains numerical reads, calibration coordinates, source-page hashes, computational results and original comparison figures. Source PDFs and page images remain available from the cited primary repository; they are not redistributed here.
