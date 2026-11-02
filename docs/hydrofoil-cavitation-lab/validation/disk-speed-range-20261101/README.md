# Disk speed-range numerical evidence

Current wrapper 0.1.1-automatic-bracket; C1 core 0.3.0-c1-reviewed-guards. The core source is unchanged. All records use p∞ = 101325 Pa, pc = 2339.19 Pa, density 998.158 kg/m³ and disk radius 0.01 m. Values are supplied directly; no temperature-property refit or flow-target adjustment is made.

The default pressure-target search solves fresh endpoints L/Rn=2 and 24. Only when both residuals show that the target lies below those fresh samples does it solve48, then 80 if necessary. Each expansion consumes one scalar evaluation. Actual signs define the bracket, followed by the existing reciprocal-separation Illinois iteration. All final candidates receive a separate fresh audited solve.

| Speed (m/s) | Nc | L/Rn | Sigma residual | Max normal/U | Max dynamic Cp residual | Seconds | Decision |
|---:|---:|---:|---:|---:|---:|---:|---|
| 37 | 32 | 20.49543162 | 4.8385e-9 | 0.0070671 | 0.0160070 | 5.482 | FORWARD_RESEARCH_FIELD_PASSED |
| 40 | 32 | 24.64921001 | 7.4192e-6 | 0.0078537 | 0.0165969 | 4.447 | FORWARD_RESEARCH_FIELD_PASSED |
| 50 | 32 | 41.60371543 | 5.8174e-6 | 0.0072668 | 0.0127442 | 4.72 | FORWARD_RESEARCH_FIELD_PASSED |
| 60 | 32 | 63.45013331 | 4.3442e-6 | 0.0047150 | 0.0128189 | 4.926 | FORWARD_RESEARCH_FIELD_PASSED |
| 60 | 128 | 63.43682464 | 4.2373e-6 | 0.0018726 | 0.0031349 | 78.612 | FORWARD_RESEARCH_FIELD_PASSED |

Each above record is a fresh native Node.js calculation with no cached answer or external warm state. Continuation between actual fresh lengths is recorded. The Nc32 37 m/s case is bitwise identical to the previous wrapper in nodes, solution state, complete field audit, L, sigma, radius, drag and volume. The full previous-wrapper source and actual previous result are preserved; timings may differ.

The explicit legacy-bounded 40 m/s request reproduces the old unbracketed rejection. The automatic request for the same flow passes after a fresh 48 probe. The 80 m/s case remains unbracketed after 2/24/48/80 (target σ = .03099014948; lowest fresh endpointσ = .04501486749). The 10 m/s case also remains unbracketed (target σ=1.98336956674 above endpointσ = .99697615601). These are numerical domain limits, not physical no-cavity conclusions. No automatic extension past80 or below 2 is included.

The pressure target, nodal tolerance1e-10, exact geometry screens,15 off-node fractions, max-normal .01 and max-dynamic-Cp .02 limits remain unchanged. Expanded endpoints are provisional pressure solves; only the separately audited final result can pass. Shapes end on an artificial Riabouchinsky image disk. Full-envelope volume is not natural physical cavity volume; cylinder wetted flow, reattachment and afterbody drag are outside this model.

Nc32 and128 independently find the same60 m/s target, with relative changes L−0.02098%, maximum radius−0.01870%, full-envelope volume−0.05831% and direct disk drag−0.03880%. Two meshes do not establish convergence. Higher64/24 exterior-field quadrature on the same states changes reported maxima by less than8e-11 and both pass. This checks quadrature for these states, not experimental accuracy. Every accuracy qualification flag remains false.

Raw JSON is preserved in gzip form, including complete node/state arrays and all off-node field samples. CSV files retain every sampled curved shape point and signed field value; no clipping, sample removal, smoothing or fabricated measured reference is used. The figure captions distinguish computed envelopes and the artificial closure. 32 synthetic control checks test wrapper logic; they are not32 physical-validation experiments.

API: default lengthStrategy='automatic', including extendedResearchDomain:false. lengthStrategy='legacy-bounded' explicitly restores2..24. The old extendedResearchDomain:true hint retains the direct2..80 initial bracket ('extended-research'). Requested hint, strategy, initial/allowed/tested domains, expansions, scalar counts, continuation source and incomplete evaluation identity are recorded. Existing scalar/time limits remain effective; final audit is additional to the scalar count.

Reproduction from the repository: Node.js built-ins are sufficient. Run node docs/hydrofoil-cavitation-lab/validation/disk-speed-range-20261101/reproduce.cjs --verify-only to check this package, then the two test-*.cjs files for20+12 control checks. Use --solve for the four fresh Nc32 requests and boundary cases; --all additionally runs the fresh Nc128 case, previous-wrapper37 m/s comparison and higher-quadrature field checks. New results go to output/axis-speed-repair-20261101/reproduced and do not overwrite the published records. To regenerate figures, use Python with Matplotlib and NumPy and run plot-profiles.py in this package. The plotting code reads the full gzip records directly. Source and package hashes are in manifest.json. Runtime depends on hardware and browser scheduling; these native timings are not browser timing claims.

Outside-production guard-only study: a source copy changes only the maximum extension80→320 and its diagnostic text. L/Rn=160 fails the unchanged field screens at Nc32 (normal .0224974, Cp .0318446), Nc128 (normal .01360815), and the held-state higher64/24 audit (normal .01276474; Cp .01707321 passes). All15 fractions remain. The exact source change, source copy and complete failed raw records are supplied; these experiments do not alter production or justify removing its bound. Use reproduce-range-probes.cjs --audit-stored for the held-state quadrature calculation, or --solve for fresh exploratory32/128 solves. Default invocation verifies the exact guard-only source change without numerical work.
