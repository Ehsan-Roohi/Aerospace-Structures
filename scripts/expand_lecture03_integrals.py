"""Insert the worked integration steps after the original support/figure assembly."""
from pathlib import Path
import json
import re


def expand(cells):
    notes = json.loads(Path(__file__).with_name('lecture03_integral_notes.json').read_text(encoding='utf-8'))

    def prose(match):
        value = match.group(1)
        for old, new in [(r'\theta', 'θ'), (r'\sigma', 'σ'), (r'\Delta', 'Δ'),
                         (r'\bar z', 'z̄'), (r'\le', '≤'), (r'\mathrm', ''),
                         (r'\rm ', ''), ('_interface', 'interface'),
                         ('C_1', 'C₁'), ('C_2', 'C₂'), ('^2', '²'), ('^3', '³'),
                         ('^4', '⁴'), ('^{-1}', '⁻¹')]:
            value = value.replace(old, new)
        return value.replace('\\,', ' ').replace('\\ ', ' ').replace('{', '').replace('}', '').replace('\\', '')

    notes = {key: re.sub(r'\\\((.*?)\\\)', prose, text, flags=re.S) for key, text in notes.items()}

    def find(fragment):
        return next(c for c in cells if fragment in c['source'])


    fixed = find('#### How do these geometric conditions become equations for reactions?')
    anchor = '#### How do these geometric conditions become equations for reactions?'
    explanation = r"""#### Why use the conditions at L rather than at zero?

**Start with bending, then integrate twice.** We use the small-deflection Euler–Bernoulli beam model: cross-sections remain plane and normal to the bent centreline. Here displacement v is positive downward, θ = dv/dx, and internal moment M is positive in sagging.

**Step 1 — moment produces curvature.** The bending law is M = EIκ. With our signs, sagging curvature is κ = −dθ/dx: a positive sagging moment makes the downward-positive slope decrease as x increases. Therefore

$$M=EI\kappa,\qquad \kappa=-\frac{d\theta}{dx}
\quad\Rightarrow\quad \frac{d\theta}{dx}=-\frac{M(x)}{EI(x)}.$$

This is the moment–curvature law, not another equilibrium equation. E describes the material and I describes the section's resistance to bending. The stress/strain derivation is developed in the bending-stress section below.

**Step 2 — add the changes in slope from 0 to x.** The fundamental theorem of calculus gives

$$\int_0^x\frac{d\theta(s)}{ds}\,ds
=\theta(x)-\theta(0)
=-\int_0^x\frac{M(s)}{EI(s)}\,ds.$$

Move θ(0) to the right and call it Cθ:

$$\boxed{\theta(x)=C_\theta-\int_0^x\frac{M(s)}{EI(s)}\,ds},
\qquad C_\theta=\theta(0).$$

The integral gives the **change** in slope; the starting slope must be added. The letter s labels the running position inside the integral; x is the position where we want the answer.

**Step 3 — add the slopes to obtain displacement.** Since dv/dx = θ,

$$v(x)-v(0)=\int_0^x\theta(t)\,dt.$$

Substitute the slope just obtained (using t for its endpoint):

$$v(x)=v(0)+x\theta(0)
-\int_0^x\left[\int_0^t\frac{M(s)}{EI(s)}\,ds\right]dt.$$

**Why does the factor (x − s) appear?** A small length ds at s contributes a small slope change −M(s)ds/EI(s). That change contributes to the slope at every later position t between s and x. Its total contribution to displacement is therefore its slope change multiplied by the remaining distance, x − s. Adding all these contributions turns the double integral into

$$\int_0^x\left[\int_0^t\frac{M(s)}{EI(s)}\,ds\right]dt
=\int_0^x(x-s)\frac{M(s)}{EI(s)}\,ds.$$

Thus the second relation is

$$\boxed{v(x)=C_v+C_\theta x-\int_0^x(x-s)\frac{M(s)}{EI(s)}\,ds},
\qquad C_v=v(0).$$

The three terms are **starting displacement + displacement from starting tilt + displacement caused by bending**. Units provide a check: M/EI has units 1/length; its first integral is a rotation, and multiplying by (x − s) before integrating gives a length. Keep EI(s) inside the integral when stiffness varies.

**Now apply the left clamp.** At x = 0 the integrals vanish, so the clamp sets Cθ = θ(0) = 0 and Cᵥ = v(0) = 0. Both left-end conditions have been used; they were not omitted.

Once those constants are zero, substituting x = 0 again merely gives 0 = 0. It supplies no new equation for the unknown reactions. The right clamp supplies the remaining two independent conditions, **θ(L) = 0 and v(L) = 0**, which determine the redundant reactions through the moment function M(s). In total, all four displacement/rotation end conditions are satisfied, but they play different roles: two fix the integration constants; two determine the remaining reactions.

We could instead integrate starting at B, build in its two clamp conditions, and impose the conditions at A afterward. The final reactions and deflected shape would be the same.

**Keep the support cases separate:** these four zero end conditions belong to the fixed–fixed beam. In the cantilever cut example that follows, only the root is clamped; its free tip generally has nonzero rotation and displacement. Do not impose θ(L) = v(L) = 0 on that cantilever.

"""
    fixed['source'] = fixed['source'].replace(anchor, explanation + anchor)
    cut = find('## 3. A cut reveals the internal shear and moment')
    schematic = Path(__file__).with_name('lecture03_cut_schematic.py').read_text(encoding='utf-8')
    cells.insert(cells.index(cut) + 1, dict(cell_type='code', id='cut-fbd-schematic', metadata={}, source=schematic,
                                        execution_count=None, outputs=[]))

    start = fixed['source'].index('The load contributes only after the cut passes its location.')
    end = fixed['source'].index('These are **zero rotation and zero displacement**', start)
    fixed['source'] = fixed['source'][:start] + notes['cell32_piecewise_compatibility'] + '\n\n' + fixed['source'][end:]
    anchor = 'Multiply the first equation by L/2'
    pos = fixed['source'].index(anchor)
    fixed['source'] = fixed['source'][:pos] + notes['cell32_numeric_substitution'] + '\n\n' + fixed['source'][pos:]
    find('### 4.5. What Q means physically')['source'] += '\n\n' + notes['cell43_bending_force_and_Q']
    find('### Why that selected area requires shear transfer')['source'] += '\n\n' + notes['cell45_selected_area_force_transfer']
    area = next(c for c in cells if c['cell_type'] == 'markdown' and r'I_y=\int_A' in c['source'])
    area['source'] += '\n\n' + notes['cell41_area_second_moment']
    area['source'] += r'''

### 4.4A. What Wing Lab solves, and which stress its colours represent

The same sequence connects this rectangle to the wing: **applied loads → support reactions and internal resultants → section strain/stress → reported values**. A 3-D picture does not by itself mean that a program solves a three-dimensional solid stress field.

**1. Equilibrium and structural motion.** For the regular positive-tip-chord spatial-beam pathway, Wing Lab assembles beam-element stiffness and loads, imposes the root restraints and solves:

$$\mathbf K\mathbf u=\mathbf f,\qquad
\mathbf r=\mathbf K\mathbf u-\mathbf f.$$

Each spatial node has three translations and three rotations. Geometry, material stiffness and section properties enter K; the applied forces and their offsets enter f. Reactions are recovered at restrained degrees of freedom. Cut equilibrium gives axial force, transverse shear, bending moments and a span-axis moment. These are forces/moments (N and N mm), **not stresses**. The original straight planar pathway is a reduced bending/torsion model; it does not have all the spatial degrees of freedom.

**2. Recover the longitudinal normal stress.** At a cut through the wing, let s be the local span direction and let ξ and ζ be section coordinates. For a homogeneous section, the nominal longitudinal beam stress is an affine field:

$$\sigma_{ss}(\xi,\zeta)=a_0+b_0\xi+c_0\zeta.$$

The coefficients must reproduce the section's axial force and two bending moments. With right-handed axes (ξ, s, ζ), traction σₛₛ along +s on the positive cut face gives:

$$N_s=\int_A\sigma_{ss}\,dA,\qquad
M_\xi=-\int_A\zeta\sigma_{ss}\,dA,\qquad
M_\zeta=\int_A\xi\sigma_{ss}\,dA.$$

For the symmetric solid rectangle with no axial force and bending about one axis, these reduce to the familiar σₓₓ = −Mz/I in this notebook. For an airfoil with skin, spars or different materials, the program uses its modeled section geometry and stiffness distribution; do not insert the rectangle's bh³/12 as the wing's I. Perfectly bonded components share compatible section motion; member/material stresses can differ.

**3. Read the contour as a particular component.** Wing Lab's normal-stress contour is nominal longitudinal stress along the wing, the counterpart of this notebook's σₓₓ. Positive means tension and negative means compression. Read the legend, units and selected component: it is not automatically a von Mises equivalent stress or a full tensor containing every normal and shear component. Shear force V and torque T have their own section effects; they are not added directly to a normal stress. The rectangular formula VQ/(Ib) derived next is a shear-stress recovery for that rectangle, not a general formula to paste onto every hollow wing section.

**Closed-tip delta/elliptical pathway:** the exact zero-chord tip uses a separate section-equilibrium calculation. It integrates the physical outboard loads, recovers nominal normal stress on finite-area cuts, and integrates bending curvature to obtain the available bending-displacement components. It does **not** provide a torsional/full-motion solution or a defined stress at the exact zero-area apex. A bending-only displacement must not be reported as a complete displacement including twist.

These are beam/section approximations, not a volume mesh solving all components of three-dimensional elasticity. Local load introduction, bonds, holes, spar runout, warping and buckling are not resolved by the normal-stress colour map. Compare the same load, section, material and sign conventions before comparing a notebook calculation with the program.
'''
    curvature = find('### Integrate curvature using the physical root constraints')
    table = curvature['source'][curvature['source'].index('| Station |'):]
    curvature['source'] = notes['cell55_curvature_integrations'] + '\n\nThe fixed root gives v(0) = 0 and θ(0) = 0; equivalently C₁ = 0 and C₂ = 0.\n\n' + table
    find('### 5.3. Return to the support examples')['source'] += '\n\n' + notes['cell58_uniform_integrations']
    uniform = find('For a uniform line load q = 2/450')
    uniform['source'] += r'''

#### Calculate the resultant by integration

For a uniform q, each small segment dx carries force q dx. Add these forces and their moments about A:

$$F=\int_0^Lq\,dx=q[x]_0^L=qL=2\ \mathrm N,$$

$$H_A=\int_0^Lxq\,dx=q\left[\frac{x^2}{2}\right]_0^L
=\frac{qL^2}{2}=450\ \mathrm{N\,mm}.$$

The resultant position is Hₐ/F = 450/2 = 225 mm. The first integral adds forces (N/mm × mm); the second adds force times lever arm (N mm). A varying q(x) must remain inside both integrals, with separate intervals if its formula changes.
'''

    # Place the contribution diagram beside the derivation, before the worked equations.
    marker = '#### How do these geometric conditions become equations for reactions?'
    before, after = fixed['source'].split(marker, 1)
    fixed['source'] = before
    at = cells.index(fixed) + 1
    diagram = Path(__file__).with_name('lecture03_curvature_schematic.py').read_text(encoding='utf-8')
    cells[at:at] = [dict(cell_type='code', id='curvature-contribution', metadata={}, source=diagram,
                         execution_count=None, outputs=[]),
                    dict(cell_type='markdown', id='fixed-compatibility-worked', metadata={}, source=marker + after)]
