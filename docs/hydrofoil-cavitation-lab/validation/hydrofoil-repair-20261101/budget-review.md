# Independent 0.1.4 search-budget addendum

Reviewed 2026-11-01. Final driver: `0.1.4-forward-research`. Source SHA256: `ffb99e499f4b399c0a20110c4aa1b9844c74cc3f80e7fd86aecb7c20467d59b1`.

**Result: all 21 independent budget/control-flow checks pass. The earlier 23 seed/admission/error checks were also rerun against 0.1.4 and all pass. No remaining blocker was found in this narrow review.** This reviewer changed only review artifacts in this D: output directory.

The budget checks load the actual unmodified driver source into an isolated Node VM with wrappers around the production core and adapter. A virtual `Date.now` advances at selected computation boundaries, making deadline behavior reproducible without repeated expensive detachment/root solves. Physical numerical admission is rechecked using an existing retained result; synthetic adapter candidates test control flow only and are not new scientific solutions.

Verified behavior:

- Cold initialization starts at length/c = 0.24. This is explicitly identified as a numerical guess. A matching current-version warm start retains its length; a 0.1.3 warm state is ignored.
- With a 240 s global budget and eight permitted length evaluations, the first length has a declared 120 s allowance and later lengths have 40 s. Both initializations share one length deadline, so retry does not reset it. Derived local allowances are bounded by the global budget.
- Deadlines are checked before and after each adapter generator step, including a final step returning a complete candidate. A result crossing its local deadline is retained as incomplete and cannot enter the candidate cache or become the accepted root. A later length can still succeed.
- Cancellation takes priority over global expiration; global expiration takes priority over local expiration. Cancellation/global expiration stop immediately without a neutral retry. Global time is also checked after wetted preflight and after final physical screens before admission.
- A near-target resolved initial sample causes actual neighboring-length probes before distant endpoints. Admission still requires the evaluated target-sigma residual and unchanged physical checks.
- All-slow synthetic branches progressed through five distinct lengths before global expiration. Records distinguish local budget exhaustion from global interruption and retain attempt, seed, code, error, elapsed time, allowance and last available progress. This is bounded search opportunity, not a guarantee that all possible lengths or branches are explored.
- A numerically converged physical failure remains rejected after one initialization; the budget repair does not trigger a neutral rescue or relax its physical screen.

One premature-termination issue was found and fixed by the source owner during review: after a local timeout at secant length 0.445 and another at fallback 0.3425 inside the [0.24, 0.65] bracket, a cached secant/midpoint previously stopped the search despite an unused interior sample. The revised uncached dyadic-interior selection continues to 0.5475. The independent consecutive-timeout check now passes.

Wall-clock enforcement is cooperative at computation boundaries. A synchronous mixed/adapter step can run past a deadline before returning control; its late candidate is rejected. These checks establish control-flow safety, not browser performance, scientific uniqueness, mesh convergence, or experimental accuracy. The existing accuracy/validation limitations remain.

Reproduce from the external project root:

- `node output/cavitation-repair-20261101/kernel-review/budget-checks.cjs` -> `budget-checks.json` (21 checks).
- `node output/cavitation-repair-20261101/kernel-review/focused-checks.cjs` -> `focused-checks.json` (23 checks, rerun on 0.1.4).
