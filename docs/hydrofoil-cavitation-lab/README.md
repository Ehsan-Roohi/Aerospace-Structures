# Hydrofoil Cavitation Lab 0.3.0

An isolated **research prototype** for steady, two-dimensional partial-sheet cavitation. It does not change the published Wing AeroStruct solver. [Evidence and figures](validation/index.html).

Version 0.3.0 adds normal-offset cambered NACA4 geometry and a **separate true 3-D axisymmetric ring BEM**. [Open axisymmetric body mode](axisymmetric.html). That mode computes fully wetted flow around a sphere or prolate spheroid and the Bernoulli inception indicator only; it does **not** solve a developed axisymmetric cavity. Its equations, self-panel integration, independent controls and recorded failed coarse-mesh gates are in [axisymmetric-method.md](validation/axisymmetric-method.md).

## Run and reproduce

Serve the repository with `python -m http.server 8782 --bind 127.0.0.1` and open `/docs/hydrofoil-cavitation-lab/`. A worker computes the result and reports progress; Cancel terminates it. No paid service is used.

Checks (Node.js):

```
node validation/verify.cjs
node validation/test-smooth-closure.cjs
node validation/test-velocity-kutta.cjs
node validation/ui-smoke.cjs
node validation/test-cambered-section.cjs
node validation/axisymmetric-verify.cjs
python validation/cambered-independent.py
```

Run these commands from this module's directory. Python requires NumPy. The first preserves the original analytic/fixed-A regression; the next two test the closure and TE conditions. UI smoke is a controller/DOM harness, **not** interactive browser acceptance. A separate browser run on 31 October 2026 checked the actual worker for NACA2412 and the sphere/prolate UI; see `validation/browser-0.3.0.json` for exact coverage. It does not imply native Firefox acceptance.

`python validation/plot_smooth_contact.py` regenerates the current figures from recorded results (NumPy/Matplotlib environment required; `--deps PATH` accepts a dependency directory). No reference data are fabricated.

## What is solved

The symmetric or cambered four-digit NACA section, angle of attack, cavity detachment and cavity length are inputs. The solver computes cavity geometry and `sigma = (qc/U)^2 - 1`. The required absolute pressure is `p_infinity = p_vapour + sigma*rho*U^2/2`. Ambient pressure is **not** an independently imposed constraint. Speed, density and chord change dimensional quantities; this gravity-free inverse potential-flow solution is dimensionless.

Cambered sections use the standard piecewise mean camber line and **normal** thickness offsets. Physical positive-x stations are inverted on the upper surface; the small leading-edge overhang is retained. The physical cavity gap uses the stored original upper surface at the same physical x. It never subtracts the symmetric thickness formula. The m=0 path retains the previous geometry and numerical solution exactly. Old numeric case files default to zero camber and remain readable.

At 640 boundary panels, fully wetted NACA2412/4412 at alpha0/4 degrees agree with an independent analytic-velocity Hess–Smith discretization to at most **0.001076 absolute CL** and **0.001681 all-panel Cp RMS**. The largest pointwise Cp discrepancy is about0.0262 at a TE-adjacent panel; every endpoint is retained. This is cross-discretization verification, not experimental or cavitating-flow validation. The raw first trial that failed a coarse-to-fine CL gate is retained; refinement to 640 met the unchanged gate. See [cambered-independent.json](validation/cambered-independent.json).

The NACA2412 smooth-contact cavity at alpha4, detachment0.01 and length0.40 is numerically admitted at 80/107/160 panels. NACA4412 at those same inputs is rejected because its cavity crosses the original foil; the negative gap remains in [cambered-section-verification.json](validation/cambered-section-verification.json). Profile availability is not a guarantee of an admitted closure branch.

The current GUI defaults to **smooth contact + velocity Kutta**. The API's omitted closure mode preserves the old fixed-A/Morino calculation. Case files without explicit mode/TE settings preserve that old physics; all imported cases need a fresh solve. Schema version 2 records both choices and the actual solved attenuation.

## Numerical formulation

The liquid perturbation potential satisfies Laplace's equation. The body contour is counterclockwise; normals point into the liquid. Constant source/doublet panels use analytic logarithmic/angle influence integrals:

`pi*phi(P) = integral(qn*lnR - phi*d(lnR)/dn) ds - integral_wake(Delta_phi*d(lnR)/dn) ds`.

Wetted panels impose `qn = -U_infinity dot n`. The cavity potential is integrated from tangential speed:

`phi(s) = phi_D - U_infinity dot (r-r_D) + qc*integral(g(sf) ds)`.

Before recovery, `g=1`. In the final lambda fraction, `g = 1-A*((sf-sT)/(sL-sT))^nu`; `sf` is original foil arclength. This is an algebraic pressure-recovery model, **not a resolved re-entrant jet**. The recovery segment is not the constant-vapour-pressure plateau.

For each shape and A, the current system has N+3 unknowns/rows: N wetted-potential/cavity-normal-derivative unknowns, phi_D, qc and an independent wake jump. The rows comprise N boundary integrals, the upstream cubic detachment anchor, integral height closure and a velocity Kutta condition. The last condition sums opposite-oriented tangential velocities at the two TE-adjacent collocation points, using five-point derivatives of total potential. It is a finite-mesh approximation, not exact evaluation at a cusp. The old N+2 Morino potential-jump path remains selectable.

The cavity correction obeys `dh/ds=(U_infinity dot n + qn)/(qc*g)` and is reparameterized onto fixed x stations. End height closure is `integral((U_infinity dot n + qn)/g ds)=0`.

Smooth-contact mode adds A as an unknown and the physical-gap equation `h_x(end)=0`. A safeguarded bracketed search uses a three-node endpoint derivative; an independent five-node derivative and the actual endpoint panel turning angle are also reported. Inner tolerances are tightened to at most 1e-7 normal velocity and 1e-8 shape correction. This is an **additional closure-selection assumption**; the thesis's A and nu were arbitrary model constants. It is not claimed to reproduce PCPAN or establish physical uniqueness.

Pressure comes from derivatives of the solved total potential, with separate stencils in wet/cavity regions. The imposed cavity Cp target is plotted separately. No Cp, negative gap or endpoint sample is clipped or replaced. Foil-intersecting branches, exhausted searches and invalid settings remain rejected; their traces are retained.

## What the repair achieved

For the default NACA0012, alpha4deg, detachment0.01, l/c0.40 case:

- Endpoint panel angle decreases 1.416,1.081,0.730,0.551,0.369 degrees at N=80,107,160,213,320. Fixed-A/velocity-Kutta angles instead grow from about28 to76 degrees.
- Equivalent-contour CL is 0.50133,0.50164,0.50155,0.50159,0.50187 on those meshes. Default mesh107 runs in about one second on the development machine; timings vary.
- On the identical 213-panel contour, independent Hess-Smith CL is0.50633 versus0.50159. The difference is0.00474 (~0.94% of that reference), compared with ~6.4% for the previous Morino/C1 comparison. All-cavity direct-speed-target RMS improves to0.00664U. This is a **prescribed-contour diagnostic**, not a complete cavitating free-boundary validation.
- Exact fully wetted Joukowski alpha4deg: at640panels, lift absolute error0.000388, all-panel CpRMS0.000289, maximum all-panel Cp error0.000998. Endpoint samples are retained. This verifies the velocity condition in noncavitating flow.

Detailed actual results: [endpoint mesh](validation/smooth-contact-verification.json), [analytic TE test](validation/velocity-kutta-analytic.json), [independent contour](validation/independent-cavity-vk-check.json), [13-case domain sweep](validation/c1-domain-vk-sweep.json). The current107-panel sweep admits10 cases and rejects3 (thickness.15/.18 and alpha2deg); this is a sampled domain, not a guarantee over all input combinations.

## Independent validation gate: NOT PASSED

A separate Hess-Smith free-boundary solve converged its equations but reached a negative-gap branch. It is rejected; no physical validation is claimed. See [raw failed attempt](validation/independent-cavity-vk-free.json). The earlier Acosta flat-plate asymptotic probes also remain [NOT PASSED](validation/flatplate-limit.json). A finite-thickness foil with recovery is not a matched zero-thickness sharp-leading-edge flat-plate reference.

Experimental cavitation validation has not been performed. Cavity lift/moment remain exploratory; combined-contour pressure drag is not physical cavitation/profile drag. Do not use these loads as validated structural inputs. A matched experimental reference and admitted independent free-boundary benchmark are required before claiming cavity accuracy.

Excluded: viscosity, cloud shedding, re-entrant jet dynamics, collapse/erosion, free water surface, compressibility, full3D cavities and structural coupling. No change to the published wing physics is made by this module.

## Primary sources

- Kinnas & Fine(1993), nonlinear partially cavitating hydrofoils: <https://doi.org/10.1017/S0022112093002071>.
- Kinnas(2010), chapter9: <https://cavity.caee.utexas.edu/kinnas/COURSES/bem/kinnas_ch09.pdf>.
- Krishnaswamy thesis(2000/2001), velocity Kutta section2.3 and recovery closure chapter3: <https://backend.orbit.dtu.dk/ws/portalfiles/portal/5446239/Padma.pdf>.
- Nouroozi, Pasandidehfard & Djavareshkian(2016), simple/re-entrant closure comparison, **not implemented here**: <https://doi.org/10.1155/2016/1593849>.
- Acosta(1955), sharp-leading-edge flat-plate reference: <https://authors.library.caltech.edu/records/p5ya1-44321>.

The implementation is original; it is not represented as an authors' released code. No paper PDF is redistributed.
