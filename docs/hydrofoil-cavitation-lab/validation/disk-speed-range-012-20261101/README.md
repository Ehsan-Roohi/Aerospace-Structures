# Two-sided disk pressure-target search: version 0.1.2

Current forward 0.1.2-bidirectional-bracket and C1 core 0.3.1-c1-forward-domain. The default direct C1 domain remains L/Rn2..24. The older researchLengthExtension:true domain remains2..80. Only the new explicit boolean forwardLengthExtension:true enables0.5..160. The automatic forward wrapper supplies that flag; legacy bounded and direct-extended strategies retain their original domains.

The automatic search starts at fresh2/24 endpoints. Actual same-side residuals can trigger fresh upper48/80/160 or lower1/0.5 endpoints. Every endpoint consumes the scalar evaluation budget. Only a separate fresh final 15-fraction field audit can admit a target root. Scalar budget exhaustion before an untested permitted endpoint is distinguished from exhausting the numerical domain. The numerical range is not a proof of support for every positive sigma, uniqueness, inception or natural closure.

Physical inputs for the numerical records: U as listed, p∞101325 Pa, pc2339.19 Pa, rho998.158 kg/m³, disk radius0.01m, no afterbody.

| Record | Original version | Nc | L/Rn | Sigma residual | Max normal/U | Max dynamic Cp residual | Seconds | Decision |
|---|---|---:|---:|---:|---:|---:|---:|---|
| production-012-U80-Nc32-cold | 0.1.2-bidirectional-bracket | 32 | 122.24685617 | 4.0359e-6 | 0.01319968 | 0.02009278 | 7.367 | FORWARD_FIELD_UNRESOLVED |
| production-012-U10-Nc32-cold | 0.1.2-bidirectional-bracket | 32 | 0.88162541 | 6.0551e-11 | 0.00082421 | 0.00194920 | 12.41 | FORWARD_RESEARCH_FIELD_PASSED |
| measured-private-U80-Nc128-cold | 0.1.2-private-bidirectional-bracket | 128 | 122.41331791 | 4.0123e-6 | 0.00952225 | 0.01250498 | 110.78 | FORWARD_RESEARCH_FIELD_PASSED |
| measured-private-U10-Nc32-cold | 0.1.2-private-bidirectional-bracket | 32 | 0.88162541 | 6.0551e-11 | 0.00082421 | 0.00194920 | 14.418 | FORWARD_RESEARCH_FIELD_PASSED |

The coarse 80 m/s production run is intentionally rejected: the pressure root and geometry converge, but normal0.013199676 and Cp0.020092785 fail their unchanged0.01/0.02 field limits. It is retained in full. The independent measured private128-panel80 m/s cold solve passed in 110.780 s, with normal0.009522251 and Cp0.012504975. Its original private version/source hashes remain intact. It is not relabeled as a fresh production110.780 s solve.

Exact inverse source comparisons recover the same0.1.1 baseline from both core versions; the only core changes concern versions, explicit domain-option validation, bounds and domain metadata. The promoted wrapper differs from the measured private wrapper only in binding/version/hash and supplying the new core flag. The production core reconstructed all 257stored fine nodes and 1025curved shape samples exactly and reevaluated the entire 3840-sample field audit bitwise-identically in 8.616 s. Nodes, gamma and solution state were held fixed; this did not perform a new root, Neumann or Newton solve. Full data and exact transformations are supplied.

A new production 10 m/s cold solve passed in 12.410 s. Its separation, sigma, radius, drag, volume, nodal residual, nodes, solution state and complete field audit are bitwise-identical to the earlier private 10 m/s solve. Runtime differences are retained as execution measurements. All 15fractions are kept, including0.001 and0.999; complete signed fields and curved-panel shapes are supplied without clipping or sample removal.

Auto mesh requests start at 32. Exactly one fresh 128 retry is permitted only after a completed pressure root, nodal/geometry admission and actual final field failure, with no known containment failure and at least10 s left. Both stages share one requested 300 s global budget and preserve full coarse/fine diagnostics. Other failures do not trigger this retry. The 12 worker groups are VM/virtual-clock mocks and one short Node thread-termination check; they do not constitute browser or real numerical evidence. Actual browser evidence is recorded separately.

The U80 fine normal margin is narrow. No mesh-convergence or experimental accuracy qualification is claimed. This remains a symmetric artificial Riabouchinsky image-disk envelope, not a naturally closing cavity. Full envelope volume is not physical natural vapor volume; afterbody wet flow and drag are not solved.

Reproduction: Node.js built-ins suffice. Run reproduce.cjs --verify-only for package/source hashes and exact CSV/raw sample correspondence. Run test-auto-bracket.cjs and test-domain-homology.cjs for 24+6 scoped assertions; test-worker-auto-mesh.cjs runs 12 mock/termination groups. --solve performs the two fresh production requests; --fine requests a new direct production128-panel80 m/s solve; --audit-held re-evaluates the stored fine field without a new root/Neumann/Newton solve. New results go to output/axis-speed-repair-20261101/promotion-012/reproduced, preserving this package. Numeric timings are native Node.js measurements, not browser timing claims.

The 0.1.1 page/data remain byte-identical historical evidence. Its source-bound verifier requires historical Git commit c9ea0d5a; its recorded source fingerprints intentionally differ from current production. historical-011-preservation.json records all 42 original payload hashes matching their manifest.
