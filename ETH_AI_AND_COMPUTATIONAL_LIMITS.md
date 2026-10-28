# Can AI Overturn a Computational Barrier? Understanding the Claimed Refutation of ETH

**MIE 446 · Aerospace Structures · University of Massachusetts Amherst**  
**Optional enrichment reading · October 27, 2026**

> **Status and scope.** OpenAI has released a claimed deterministic, subexponential-time algorithm for exact counting of satisfying assignments of fixed-width Boolean formulas, accompanied by Lean formalization materials. If correct, the result refutes the Exponential Time Hypothesis. Independent examination is being organized. This reading explains the claim and its implications; it does not certify the complete proof, report an independent Lean rebuild, or present measured speedups on engineering problems.

This original English educational article was prompted by [Pooyesh Pourmohammad’s Zoomit feature](https://www.zoomit.ir/ai-articles/469972-openai-eth-exponential-time-hypothesis-featured/), published October 27, 2026. It is an independent exposition rather than a translation or reproduction of that feature. Primary research links, formalization documentation, and classical complexity references are provided below. The numerical and engineering examples are teaching constructions.

## 1. What was announced—and what was not

OpenAI’s [October 26 announcement](https://openai.com/index/building-scientific-understanding-with-academic-communities/) reports an AI-generated ETH disproof obtained on October 16 and formalized on October 17. It identifies an external group led by Russell Impagliazzo, Ramamohan Paturi, and Ryan Williams to examine and explain the result. The company describes its released model outputs as research material requiring scientific understanding, and says the group requested public artifacts and support for a conference.

The immediate claim is about an **algorithm and a worst-case asymptotic running-time bound**, not a faster processor, a quantum computer, or a benchmark demonstrating that an industrial optimizer now runs faster. The central manuscript is [*The Exponential Time Hypothesis is False*](https://github.com/openai/math/blob/main/preprints/The-Exponential-Time-Hypothesis-is-False-October-25-2026/paper.pdf), dated October 17 and revised October 25, 2026.

The distinction is substantial. A theorem can change what is possible in principle even when the first resulting algorithm is impractical. Conversely, an impressive benchmark can improve practice without disproving a complexity hypothesis. Neither type of evidence should be substituted for the other.

The release also announced separate claims in harmonic analysis and quantum field theory. Those are different problems with different artifacts and review arrangements. They are not evidence for the ETH result and are not evaluated here.

## 2. Boolean satisfiability in a small example

A Boolean variable has two values, false and true, represented here by 0 and 1. A **literal** is either a variable or its negation. A **clause** is an OR of literals; a formula in **conjunctive normal form**, or CNF, is an AND of clauses.

For example,

$$F=(x\lor y\lor z)\land(\neg x\lor y\lor z).$$

There are eight assignments to the three variables. If either $y$ or $z$ is true, both clauses are satisfied regardless of $x$. If both $y$ and $z$ are false, the first clause demands $x=1$ and the second demands $x=0$, which is impossible. Thus six assignments satisfy $F$.

The **decision problem** asks whether any satisfying assignment exists. The **search problem** asks for one. The **counting problem** asks how many there are. For this formula, the respective answers are “yes,” an example such as $(0,1,0)$, and six.

For $k$-CNF, each clause contains at most $k$ literals. The parameter $k$ is the **clause width**. The parameter $n$ counts variables; $m$ counts clauses. These are different quantities. The claim concerns each **fixed** $k$ as $n$ grows, not an arbitrary clause width growing with the input under the same constants.

### A counterexample to a common misconception

Checking that every clause can be satisfied separately is not enough. The formula

$$G=(x)\land(\neg x)$$

has individually satisfiable clauses but no common satisfying assignment. The difficulty is compatibility across shared variables. Removing those shared dependencies without justification changes the problem.

## 3. Why the number of possible assignments is not itself a lower bound

There are $2^n$ Boolean assignments. Exhaustive search evaluates the formula on each one, taking roughly $2^n$ times the evaluation cost. Adding one variable doubles the number of candidates:

| Variables | Assignments |
|---|---|
| 10 | 1,024 |
| 20 | 1,048,576 |
| 40 | 1,099,511,627,776 |
| 100 | Approximately $1.27\times10^{30}$ |

But a large candidate space does not prove that every algorithm must enumerate it. An array can have a billion entries while a sorted representation permits a particular search in logarithmically many comparisons. An exact sum can sometimes be computed by a formula without visiting every summand individually.

ETH is therefore not the observation that brute force is exponential. It is a hypothesis about the absence of sufficiently fast **alternative algorithms** for worst-case 3-SAT. Proving a lower bound against all relevant algorithms is far more difficult than counting the assignments considered by one algorithm.

This also explains why finding a better branching rule does not automatically refute ETH. It might reduce the exponential base while leaving exponential dependence on the number of variables.

## 4. What ETH says

The standard algorithmic formulation used in this discussion is that 3-SAT on $n$ variables has no deterministic algorithm with running time

$$2^{o(n)}\operatorname{poly}(n,m).$$

Equivalently, in the usual ETH framework, the exponential-rate parameter for 3-SAT is positive. Precise formulations involve the computational model and treatment of input size; the classical papers and the sparsification lemma explain the relevant relationships.

ETH is a **hypothesis**, not an established theorem. It has supported conditional lower bounds of the form “unless ETH fails, problem $X$ cannot have a running time of this form.” The foundational references include Impagliazzo and Paturi’s [*On the Complexity of k-SAT*](https://cseweb.ucsd.edu/~paturi/myPapers/pubs/ImpagliazzoPaturi_2001_jcss.pdf) and Impagliazzo, Paturi, and Zane’s [*Which Problems Have Strongly Exponential Complexity?*](https://cseweb.ucsd.edu/~paturi/myPapers/pubs/ImpagliazzoPaturiZane_2001_jcss.pdf).

Do not confuse the abbreviation ETH with ETH Zurich or Ethereum. In this article it means **Exponential Time Hypothesis**.

## 5. Exponential, subexponential, and polynomial are different

An exponential running time can be written as $2^{cn}$ for a fixed positive constant $c$. The base need not be two:

$$1.3^n=2^{(\log_2 1.3)n}.$$

Likewise, $2^{n/1000}$ is still exponential. The constant multiplying $n$ is small, but it does not approach zero as $n$ grows.

For $T(n)=2^{g(n)}$, the notation $T(n)=2^{o(n)}$ means

$$\lim_{n\to\infty}\frac{g(n)}{n}=0.$$

Examples include $2^{\sqrt n}$ and $2^{n/\sqrt{\log n}}$. Neither example is polynomial in $n$. To test that, compare the logarithm with $\log n$: for every fixed $d$, the exponent $n/\sqrt{\log n}$ eventually exceeds $d\log_2 n$.

| Illustrative expression | Subexponential in $n$? | Polynomial? |
|---|---|---|
| $n^3$ | Yes | Yes |
| $2^{\sqrt n}$ | Yes | No |
| $2^{n/\sqrt{\ln n}}$ | Yes | No |
| $2^{n/1000}$ | No | No |
| $1.3^n$ | No | No |

The word “subexponential” describes an asymptotic category. It is not a promise that the time is manageable.

### A scale calculation—not an algorithm benchmark

Set $n=10^6$ and artificially set all constants and polynomial factors to one. The exponent in $2^{n/\sqrt{\ln n}}$ is then approximately 269,040. That is an unimaginably large operation count. The weaker expression with a squared $\ln\ln n$ factor has an exponent of roughly 1.85 million at this particular $n$, even though its ratio to $n$ eventually tends to zero.

These numbers illustrate slow asymptotic convergence. They do not estimate the claimed algorithm’s runtime. Big-O bounds do not supply executable constants, and an upper bound larger than brute force at a particular size does not force an implementation to use that bound rather than a fallback algorithm.

## 6. The manuscript and the Lean scope give different bounds

The public [formalization scope document](https://github.com/openai/math/blob/main/lean/docs/378.md) explicitly distinguishes three statements. Suppressing only the constants indicated in the notation:

| Source and input regime | Stated time bound |
|---|---|
| Lean scope: canonical input encoding of length $L$, fixed $k\ge2$ | $(L+1)^{O_k(1)}2^{O_k(n(\log\log n)^2/\sqrt{\log n})}$ |
| October 25 manuscript: $n$ variables, $m$ clauses, fixed $k$ | $(n+m)^{O_k(1)}2^{O_k(n\log\log n/\sqrt{\log n})}$ |
| Manuscript, additionally $m\le Dn$ for fixed $D$ | $(n+m)^{O_{k,D}(1)}2^{O_{k,D}(n/\sqrt{\log n})}$ |

Both the scope document and manuscript describe polynomial space; the formal statement measures space through visited tape cells. These are mathematical resource bounds, not measurements of a released industrial solver.

The weaker Lean exponent is still $o(n)$, because

$$\frac{(\log\log n)^2}{\sqrt{\log n}}\longrightarrow0.$$

Thus the qualitative ETH consequence does not require pretending that the sharper manuscript bound is the bound covered by the documented Lean scope. Conversely, verification of a weaker result is not verification of every sharper estimate or every corollary in the prose manuscript.

**Why the subscripts matter:** $O_k(1)$ permits constants and polynomial degrees to depend on $k$. Fixing $k=3$ is legitimate for the ETH question. Allowing $k$ to grow with $n$ while ignoring those dependencies is not.

## 7. Why counting solves decision—and need not list the solutions

Let $\#F$ denote the number of satisfying assignments. Then

$$F\text{ is satisfiable}\iff\#F>0.$$

Therefore an exact counting algorithm with the stated bound also decides satisfiability. It is not necessary to prove that counting is strictly harder than decision to obtain this implication.

The count can be as large as $2^n$, but its binary representation uses at most $n+1$ bits. Computing a compact count is different from explicitly listing exponentially many assignments. In the same way, writing the number $10^{100}$ takes far less space than writing that many separate objects.

Once a count routine exists, a satisfying assignment can be found through self-reduction. Set the first variable to false and count the resulting restricted formula. If that count is positive, keep false; otherwise choose true, provided the original count was positive. Repeat for the remaining variables. This uses a polynomial number of calls while retaining fixed-width clauses after simplification.

A related construction can sample an assignment uniformly by choosing each branch with probability proportional to its conditional count. That sampling procedure uses randomness; the underlying count routine need not. Distinguish the deterministic counting claim from randomized uses of its output.

## 8. The arithmetic identity behind exact counting

Represent a positive literal by $x_i$ and a negative literal by $1-x_i$. A clause with literal values $\ell_1,\ldots,\ell_r$ has satisfaction indicator

$$\Phi(x)=1-\prod_{j=1}^{r}(1-\ell_j(x)).$$

On a Boolean input, this is zero exactly when every literal is false and one otherwise. Multiplying clause indicators gives the indicator for the entire formula:

$$\#F=\sum_{x\in\{0,1\}^n}\prod_{e=1}^{m}\Phi_e(x).$$

For the first example in Section 2,

$$\Phi_1=1-(1-x)(1-y)(1-z),$$

$$\Phi_2=1-x(1-y)(1-z).$$

The sum of $\Phi_1\Phi_2$ over the eight Boolean assignments is six, exactly as found by logical reasoning.

This identity alone does **not** speed up counting: evaluating every summand is exhaustive search. The research challenge is computing the sum without doing essentially all that work. A compact mathematical expression can hide an expensive computation.

## 9. An easy special case: genuinely independent groups

Suppose the variables split into disjoint groups and every clause uses variables from only one group. If group $i$ has $N_i$ satisfying assignments, then

$$\#F=\prod_iN_i.$$

The product follows from independence: every valid choice in one group can be combined with every valid choice in the others.

For a teaching example, take ten independent groups of ten variables. Local exhaustive searches examine $10\times2^{10}=10,240$ assignments, rather than $2^{100}$ global assignments. Multiplication then combines the ten counts. This can be a spectacular saving, but only because the formula already has a special structure.

A single cross-group clause can invalidate the factorization. For example, suppose one group contains $x$, another $y$, and neither has internal restrictions. Each group has two possibilities, but adding $(x\lor y)$ leaves only three global assignments, not four. Independent local counts have forgotten the coupling.

This is why “partition the variables into small groups” is not a general SAT algorithm. A correct method must account for the information passing between groups, and the cost of retaining that information can dominate the calculation.

## 10. What the proposed method adds

The manuscript’s technical route uses algebraic representations of the counting problem, replacement linear forms, shared summaries, and exact reconstruction. In its overview, an auxiliary parameter $T$ is introduced so that the original count is recovered at $T=0$. Other parameter values permit a more structured evaluation. Interpolation then recovers the target quantity; the sharper bounds use an additional tensor-contraction argument.

This is a roadmap, not a complete proof. Its difficult obligations include constructing replacements with the required properties, bounding how many summaries must be considered, controlling degree and coefficient size, accounting for all arithmetic operations, and bounding space. General inputs also require transformations that preserve the count and have controlled cost.

An especially important nuance is that intermediate transformed quantities need not themselves be counts of ordinary Boolean formulas. Polynomial values away from the target parameter may be signed or nonintegral. Calling every intermediate quantity “the number of solutions of an easier SAT instance” can therefore misdescribe the algebra.

The [full manuscript](https://github.com/openai/math/blob/main/preprints/The-Exponential-Time-Hypothesis-is-False-October-25-2026/paper.pdf), rather than this short roadmap, is the authority for the proposed construction and its proof obligations.

## 11. Interpolation is exact mathematics, not a free shortcut

A polynomial of degree at most $d$ is determined by its values at $d+1$ distinct points. For instance, if a degree-two polynomial $H$ is known at 1, 2, and 3, Lagrange interpolation gives

$$H(0)=3H(1)-3H(2)+H(3).$$

Choose $H(T)=6+5T+2T^2$. Its three values are 13, 24, and 39. The formula recovers

$$3(13)-3(24)+39=6.$$

This is an exact reconstruction with integer arithmetic. It demonstrates a principle that an algorithm may exploit, but it does not demonstrate that an arbitrary SAT count can be encoded in a cheaply evaluated low-degree polynomial.

The costs still have to be proved. A degree growing exponentially would require too many samples. A cheap expression might generate integers with enormous bit lengths. A method using derivatives must account for how those derivatives are obtained. A numerical approximation to a value is not an exact value just because the final answer is an integer.

In complexity theory, arithmetic on an arbitrarily large integer cannot generally be treated as one fixed-cost machine operation. Bit-operation bounds and explicit input encodings guard against hiding expensive computation inside a convenient primitive.

## 12. Sparsification: useful, but not a polynomial-time miracle

The classical sparsification lemma expresses a fixed-width CNF as a controlled collection of sparse formulas. For any fixed positive tolerance parameter, the collection can have a small exponential factor in the variable count, with constants depending on that parameter and clause width.

For exact counting, overlap matters. If an assignment satisfies two branches and the branch counts are simply added, it is counted twice. A counting argument needs disjoint branches or another demonstrated way of correcting multiplicity.

Sparsification does not simply replace every dense input by one equivalent sparse input at zero cost. The number of generated instances, the density constants, count preservation, and the final combined resource bound all belong in the analysis. The original [Impagliazzo–Paturi–Zane paper](https://cseweb.ucsd.edu/~paturi/myPapers/pubs/ImpagliazzoPaturiZane_2001_jcss.pdf) is the appropriate starting reference.

## 13. Why this does not settle P versus NP

P consists of decision problems solvable in deterministic polynomial time. NP consists of decision problems whose yes-instances have certificates verifiable in polynomial time. NP does not mean “not polynomial.”

A polynomial-time algorithm for 3-SAT would imply P = NP. A subexponential-time algorithm need not be polynomial, so the claimed ETH refutation does not by itself establish that conclusion. It also does not prove P ≠ NP. It changes a finer-grained proposed barrier while leaving the broader separation question unresolved.

The [Clay Mathematics Institute’s P versus NP description](https://www.claymath.org/millennium/p-vs-np/) provides the authoritative problem context.

### Reductions must preserve the right scale

Suppose a problem of size $N$ is reduced in polynomial time to 3-SAT on $n=N^2$ variables. A running time of $2^{o(n)}$ becomes $2^{o(N^2)}$, not necessarily $2^{o(N)}$.

Using the illustrative bound $2^{n/\sqrt{\log n}}$ makes the issue concrete. After substitution, the exponent is proportional to

$$\frac{N^2}{\sqrt{\log N}},$$

which grows faster than $N$. A polynomial-time reduction preserves polynomial-time tractability; it need not preserve subexponential dependence on the original parameter.

Thus “3-SAT is NP-complete” is not enough to conclude “every NP problem now has the same subexponential bound in its own natural size.” The blowup must be tracked for each reduction.

## 14. What happens to ETH-based papers?

Suppose an earlier paper proves

$$\mathrm{ETH}\Longrightarrow\text{no algorithm of type }A\text{ for }X.$$

If ETH is false, the implication does not automatically become a false mathematical statement. Its premise no longer supports an unconditional claim that the fast algorithm is impossible. The reduction, structural lemmas, and other contributions may remain completely valid.

Nor does rejecting the premise prove that an algorithm of type $A$ exists. From “if it rains, the ground is wet” and “it does not rain,” we cannot conclude that the ground is dry. Similarly, a broken lower-bound assumption is not automatically an upper-bound construction for every target problem.

The appropriate response is to inspect each result: its exact hypothesis, reduction size, parameter dependence, and any alternative assumptions. Some reductions may transfer a new upper bound; others may preserve only a conditional relationship.

The stronger hypothesis SETH concerns how close fixed-width SAT gets to exhaustive-search complexity as the fixed width increases. A valid deterministic subexponential algorithm for every fixed width contradicts that assertion too. This does not mean every conjecture in fine-grained complexity falls with it; separate hypotheses require separate logical analysis.

## 15. What a Lean artifact can establish

Lean’s kernel checks formal proof terms against formal statements and accepted axioms. Automation helps construct proof terms; the kernel checks the result. The intended benefit is to make logical dependencies explicit, including resource-model details that might be easy to gloss over in prose. See the [Lean reference](https://lean-lang.org/doc/reference/latest/) and [Axioms and Computation](https://lean-lang.org/theorem_proving_in_lean4/Axioms-and-Computation/).

For this claim, inspecting the final formal statement is particularly important. The public [comparator challenge](https://github.com/openai/math/blob/main/lean/ComparatorChallenges/SubexponentialSAT.lean) defines Boolean formulas, a canonical encoding, a primitive machine model, output semantics, runtime, and visited space. Its theorem quantifies a fixed machine for each fixed width before quantifying the input formulas, rather than choosing a new machine separately for every formula.

### A crucial distinction about `sorry`

The comparator **challenge statement** contains `sorry`. A challenge file can intentionally state the target without proving it; it is not the submitted solution. Its placeholder does not establish that the actual proof admits the theorem, and compiling the challenge alone does not establish the result either.

An audit must check the corresponding submitted proof, its allowed axioms, and the comparator result. The [repository’s comparator instructions](https://github.com/openai/math/blob/main/lean/ComparatorChallenges/README.md) and [the comparator project](https://github.com/leanprover/comparator) explain the checking framework. The instructions’ example for a different theorem is not an ETH verification log.

### What has been checked for this reading

The news article, official announcement, selected manuscript sections, scope document, challenge statement, and verification instructions were inspected. The full Lean proof was **not** rebuilt, and no independent end-to-end correctness certification is claimed here. Human review still needs to assess the formal specification, the intended computational model, and correspondence with the manuscript’s sharper statements.

This distinction is neither dismissal of formal proof nor automatic acceptance of a headline. It identifies what evidence is available and what this course reading actually did with it.

## 16. Why no immediate cryptographic conclusion follows

A worst-case algorithm for fixed-width SAT does not by itself supply an efficient attack on a deployed cryptosystem. An attack analysis must specify the problem instance, encoding growth, key size, constants, memory, and comparison with existing attacks. Worst-case and average-case statements also address different questions.

Consequently, “ETH is claimed to be false” is not evidence that every password, encrypted message, or cryptocurrency key can now be recovered. The opposite absolute claim—that no cryptographic construction could ever be affected—would also exceed this reading’s evidence. Practical consequences require a concrete reduction and a practical resource analysis.

The abbreviation ETH in this research has no special connection to the Ethereum currency ticker.

## 17. What aerospace students can learn from this

The immediate connection is to discrete design, constraint satisfaction, and computational evidence—not an advertised acceleration of CFD or finite-element analysis.

Imagine a deliberately simplified assembly-planning problem. Variables $A$, $B$, and $C$ indicate whether three design features are selected. Suppose the logical rules are:

- At least one of $A$ and $B$ must be selected: $(A\lor B)$.
- They cannot both be selected: $(\neg A\lor\neg B)$.
- Choosing $A$ requires $C$: $(\neg A\lor C)$.

The combined CNF has exactly three assignments:

$$ (A,B,C)=(0,1,0),\ (0,1,1),\ (1,0,1). $$

A SAT solver can answer feasibility of these **encoded rules**. It cannot establish that a selected wing satisfies buckling, fatigue, flutter, manufacturability, or inspection requirements unless those requirements have been represented appropriately and the relevant physical models are justified.

This gives three separate questions:

| Question | Required evidence |
|---|---|
| Does an assignment satisfy the logical clauses? | Correct logical evaluation |
| Does the algorithm solve the specified class within the stated resources? | Correctness and complexity analysis |
| Do those clauses represent the actual design requirements? | Engineering formulation, physical modeling, and validation |

A faster solver cannot repair an omitted load case. A formally correct optimizer can optimize an inappropriate objective. A successful search can return a design that is valid only under idealized boundary conditions.

For [Wing Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html), the corresponding workflow remains: define loads and assumptions, predict behavior, compute, check independently, and state limitations. No measured Wing Lab, PINN, CFD, or structural-optimization speedup is established by this ETH reading.

## 18. Small, reproducible classroom calculations

The following Python uses only the standard library. It demonstrates Boolean counting and interpolation; it is **not an implementation of the proposed subexponential algorithm**.

```python
from itertools import product

def satisfies(bits, clauses):
    # Literal j means x_j; -j means not x_j; indices start at one.
    return all(any(bits[abs(j)-1] == (j > 0) for j in clause)
               for clause in clauses)

def count(n, clauses):
    return sum(satisfies(bits, clauses)
               for bits in product((False, True), repeat=n))

assert count(3, [(1, 2, 3), (-1, 2, 3)]) == 6
assert count(1, [(1,), (-1,)]) == 0
assert count(3, [(1, 2), (-1, -2), (-1, 3)]) == 3
assert count(3, []) == 8      # No constraints: every assignment works.
assert count(3, [()]) == 0    # An empty clause cannot be satisfied.

def H(t):
    return 6 + 5*t + 2*t*t

assert 3*H(1) - 3*H(2) + H(3) == H(0) == 6
print("All elementary activity checks passed.")
```

The distinction between the last two CNF examples is useful: an empty **collection** of clauses imposes no restriction, whereas a collection containing an empty **clause** is impossible to satisfy. Implementation conventions must agree with the mathematics.

Run the examples, then explain why the count routine remains exponential despite returning the correct answers. Exactness of output and efficiency are different properties.

## 19. Questions for critical reading

1. Why does reducing the running time from $2^n$ to $2^{n/1000}$ not refute ETH?
2. Prove that $(\log\log n)^2/\sqrt{\log n}$ tends to zero. Why can the ratio still be inconveniently large at practical values of $n$?
3. Which constants in the documented bounds may depend on clause width? Why is “fixed $k$” essential?
4. Explain why a positive exact count implies satisfiability without claiming a separation between decision and counting complexity.
5. Give a formula whose groups look independent until one cross-group clause is introduced. Compute both the correct count and the incorrect product of local counts.
6. Why must a counting reduction preserve multiplicities or correct them? Does an arbitrary decision reduction preserve counts?
7. In the interpolation example, identify what is proved by the three evaluations and what is not proved about SAT complexity.
8. Why does a reduction from size $N$ to $N^2$ variables create trouble for transferring a $2^{o(n)}$ bound?
9. Distinguish the comparator challenge from the submitted proof. What would you need to inspect before reporting an independent verification?
10. List three real structural-design requirements missing from the Boolean teaching example. How would you validate a numerical model supplying one of them?
11. Rewrite “AI made all NP problems easy” as a statement supported by the actual scope document.
12. Compare this case with the [Fermat reading](FERMATS_LAST_THEOREM.md): formalization of an established theorem versus formalization accompanying a newly claimed algorithmic result.

## 20. Sources, version record, and further reading

**Source snapshot.** The OpenAI repository was inspected at commit `7ef5c0cc5ca4b0e072b7a050fca09ab24bc6fa3a`. The [pinned scope document](https://github.com/openai/math/blob/7ef5c0cc5ca4b0e072b7a050fca09ab24bc6fa3a/lean/docs/378.md) preserves the distinction between manuscript and formalization bounds used here. Live links below may receive subsequent corrections; a later edition should inspect changes rather than silently retaining an outdated status statement.

1. **Motivating feature:** Pooyesh Pourmohammad, [Zoomit feature on OpenAI and ETH](https://www.zoomit.ir/ai-articles/469972-openai-eth-exponential-time-hypothesis-featured/), October 27, 2026. Popular reporting, not the proof or formal verification record.

2. **Official announcement:** OpenAI, [“Working with academic communities to build scientific understanding”](https://openai.com/index/building-scientific-understanding-with-academic-communities/), October 26, 2026. Source for the company’s announcement and review arrangements; not an independent certification.

3. **Primary manuscript:** OpenAI, [*The Exponential Time Hypothesis is False*](https://github.com/openai/math/blob/main/preprints/The-Exponential-Time-Hypothesis-is-False-October-25-2026/paper.pdf), October 17, revised October 25, 2026. Read Theorem 1.1, Section 2, the exact-arithmetic discussion, and Appendix D together.

4. **Explicit formalization scope:** [OpenAI math repository, `lean/docs/378.md`](https://github.com/openai/math/blob/main/lean/docs/378.md). Source for the weaker formalized bound and its comparison with the manuscript bounds.

5. **Formal target and definitions:** [`SubexponentialSAT.lean` comparator challenge](https://github.com/openai/math/blob/main/lean/ComparatorChallenges/SubexponentialSAT.lean). A target specification with a placeholder, not the completed solution by itself.

6. **Verification workflow:** [Comparator challenge instructions](https://github.com/openai/math/blob/main/lean/ComparatorChallenges/README.md) and [leanprover/comparator](https://github.com/leanprover/comparator). These explain tooling; this reading does not substitute them for an actual check.

7. **Release history:** [OpenAI math repository history](https://github.com/openai/math/blob/main/history.md). Check for revisions and withdrawals when revisiting any result.

8. **Classical complexity reference:** Russell Impagliazzo and Ramamohan Paturi, [“On the Complexity of k-SAT”](https://cseweb.ucsd.edu/~paturi/myPapers/pubs/ImpagliazzoPaturi_2001_jcss.pdf), *Journal of Computer and System Sciences* **62** (2001), 367–375. [DOI: 10.1006/jcss.2000.1727](https://doi.org/10.1006/jcss.2000.1727).

9. **Sparsification and exponential complexity:** Russell Impagliazzo, Ramamohan Paturi, and Francis Zane, [“Which Problems Have Strongly Exponential Complexity?”](https://cseweb.ucsd.edu/~paturi/myPapers/pubs/ImpagliazzoPaturiZane_2001_jcss.pdf), *Journal of Computer and System Sciences* **63** (2001), 512–530. [DOI: 10.1006/jcss.2001.1774](https://doi.org/10.1006/jcss.2001.1774).

10. **Teaching context for ETH:** [MIT 6.890, Lecture 14](https://ocw.mit.edu/courses/6-890-algorithmic-lower-bounds-fun-with-hardness-proofs-fall-2014/9e33e6db99205dce7216547e44fddde7_MIT6_890F14_Lec14.pdf). Historical course material; it predates the 2026 claim.

11. **P versus NP:** [Clay Mathematics Institute problem description](https://www.claymath.org/millennium/p-vs-np/). Establishes the broader question that this claimed ETH result does not settle.

12. **Formal proof foundations:** [The Lean Language Reference](https://lean-lang.org/doc/reference/latest/) and [Axioms and Computation](https://lean-lang.org/theorem_proving_in_lean4/Axioms-and-Computation/). Use these to interpret kernel checks, axioms, and admitted placeholders.

---

**Course connection:** This is optional enrichment, not a new assignment or a syllabus change. Apply the course workflow **Claim — Evidence — Check — Confidence — Limitation** to computational-complexity headlines as carefully as to a stress contour, a learned surrogate, or a proposed wing design.
