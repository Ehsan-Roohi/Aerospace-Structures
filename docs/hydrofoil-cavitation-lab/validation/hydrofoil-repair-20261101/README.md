# Current hydrofoil forward-solver evidence

Driver 0.1.6; core 0.3.4; smooth detachment 0.1.2; strict adapter 0.1.1. This pack contains recorded computed states and actual browser evidence, not experimental or mesh accuracy qualification.

The unchanged NACA 0020 target sigma 1.3157940493756035, incidence 4 degrees and chord 0.16 m passes reported checks in a real fresh Edge worker in 31.493 s. Its target residual is 4.12e-7, minimum sampled wet Cp + target sigma is +0.0014732952, and every recorded gap is nonnegative. The native cold result took 25.34 s; the same-configuration scalar-seed repeat took 4.033 s. Both the primary native and browser results have no warm start.

The original NACA 0012 at 4 degrees, U=20 m/s, pInf=101325 Pa and water at 20 °C remains unadmitted: the six current numerical length samples do not bracket target sigma 0.495842347. A new cold current 64-panel same-target study exhausted 120 s. Neither is relabeled as a passed solution or a convergence study.

## Numerical controls

The endpoint root is separated from physical geometry acceptance. A closed negative-gap probe stays rejected; an endpoint-unresolved probe cannot fit beta or influence its bracket. Default beta/station tolerances are 2e-4 / 2e-6; stricter supplied values survive, while looser ones are refused. Nearest-resolved-length continuation is configuration-local. Initial length 0.24 is only a numerical guess.

Local timing is cooperative, shared across each length's initializations, and subordinate to global/cancellation checks. With 240 s / six length trials, the initial allowance is 120 s and later allowances 40 s. One indivisible solver step may overrun a limit, but its overdue result cannot be admitted. Physics equations, recovery law, target tolerance and zero-allowance sampled pressure/gap gates are unchanged.

## Records and limits

Every case retains its actual driver/core version and execution type. Historical admissions keep historical checks; they are not requalified under the current tighter protocol. Full actual failed 0.1.3 / 0.1.4 and unresolved 0.1.5 traces are deterministic gzip archives with source and archive checksums. Current cold/repeat/original/fine and actual browser states are archived in the same format.

The historical same-target-refinement figure belongs to driver 0.1.2 / core 0.3.3. It is not current-method mesh verification. Current detachment estimators, endpoint derivative comparisons and reconstructed pressure residuals still leave accuracy open. No matched hydrofoil experiment or independent off-grid free-boundary validation is supplied.

## Reproduction

Run `node reproduce.cjs` from a local project copy. It prints current requested-case results and writes only with an explicit `--out` directory. `node control-flow-checks.cjs` runs virtual-clock/injected-adapter tests; those are control tests, not physical simulations. It writes only when an explicit `--out` file is supplied. `node check-evidence.cjs` validates this pack, archives, source hashes and accepted-case invariants. `plot-profiles.py` renders the stored current profiles with Matplotlib.

The 96-check receipt includes scoped implementation/admission assertions and eight unchanged fully wetted comparisons. Source references and method limitations are on the adjacent hydrofoil-repair.html page. All scientific figures show signed Cp or actual sheet gaps; no error table is substituted for physical profiles.
