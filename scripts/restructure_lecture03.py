"""Teach from physical drawings to equilibrium, stress, strain and displacement."""
import re
import uuid

APP='https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html'

def restructure(cells):
    old=list(cells)
    def get(fragment):
        return next(dict(c) for c in old if fragment in c['source'])
    new=[]
    def add(kind,source):
        c=dict(cell_type=kind,metadata={},source=source.strip())
        if kind=='code':c.update(execution_count=None,outputs=[])
        new.append(c)
    def md(s):add('markdown',s)
    def code(s):add('code',s)
    def keep(fragment):new.append(get(fragment))
    def link(case,label):
        md(f'**[Open this exact beam study: {label}]({APP}?beamCase=l03-{case})**. The link replaces the old study with these inputs and solves it.')

    md(r'''
# MIE 446 Aerospace Structures
## Lecture 03 — Supports, equilibrium, stress, strain and beam displacement

**90-minute core lesson · Dr. Ehsan Roohi · Fall 2026**

Lecture 02 found resultant forces from distributed loads. Today we first draw the structure and its supports, then calculate reactions. We next learn what stress and strain physically mean before using beam formulas. Every calculation has a related drawing. The rectangular strip is a teaching surrogate for a wing load path, not the actual printed airfoil.

| Minutes | Core activity |
|---|---|
| 0–8 | Locate variables on the symbol-map drawings |
| 8–32 | Three supports under the same centre load; cantilever tip/uniform extensions |
| 32–42 | Draw a loaded beam, cut it, then read its V and M diagrams |
| 42–64 | Normal/shear stress, stress tensor, section area, contours and Q |
| 64–82 | Strain and strain tensor; bending fibres; root conditions and displacement |
| 82–90 | App checks, wing connection and exit ticket |

The full tensor definitions and supporting derivations remain readable after class; during class identify the components on the drawings and do one numerical substitution at each stage. Circular-tube torsion and finite-element details are optional. Save a copy in Drive and run setup first. Saved figures and numerical outputs are visible before execution. Units: mm, N, MPa = N/mm².
''')
    keep('0. Setup and clear plotting conventions')
    md('### A symbol map before we start\n\nStart with these drawings. Find each symbol on its own geometry or material element before using the reference table.')
    keep('Figure 0A — locate coordinates')
    keep('Figure 0B — motion, internal')
    mapping=get('### A symbol map before we start')['source']
    mapping=mapping.replace('### A symbol map before we start','### Reference table for the drawings above')
    md(mapping)
    keep('## 1. What a support')
    md(r'''
## 2. Calculate support reactions under the same load

Use L = 450 mm and P = 2 N downward at a = L/2 = 225 mm in all three comparison drawings. Hand free bodies use upward forces and counterclockwise (CCW) couples as positive. The app uses downward force and clockwise couples as positive, so its reaction signs are reversed.

**These are external support reactions.** Internal section moment M later uses the separate sagging-positive convention. Do not replace the signs of support couples by signs from the internal-moment diagram.
''')

    def support_figure(kind,title):
        code(f'''#@title {title}
fig,ax=plt.subplots(figsize=(12,4.6),layout='constrained')
clean_beam(ax,'{title}')
support(ax,0,{'fixed' if kind!='simple' else 'pin'!r})
{ "support(ax,L,'roller')" if kind=='simple' else "support(ax,L+9,'fixed')" if kind=='fixed' else ""}
arrow(ax,(L/2,45),(L/2,3));ax.text(240,43,'P = 2 N downward',fontsize=13)
arrow(ax,(0,-27),(0,-2),'#176441');ax.text(15,-25,'RA = {2 if kind=='cantilever' else 1} N up',fontsize=13)
{ "arrow(ax,(L,-27),(L,-2),'#176441');ax.text(335,-25,'RB = 1 N up',fontsize=13)" if kind!='cantilever' else ""}
dimension(ax,(0,-43),(L/2,-43),'a = 225 mm',(0,-8))
dimension(ax,(L/2,-43),(L,-43),'L − a = 225 mm',(0,-8))
ax.text(0,-64,'A: x = 0',fontsize=12);ax.text(400,-64,'B: x = L',fontsize=12)
{ """ax.add_patch(FancyArrowPatch((25,20),(-30,20),connectionstyle='arc3,rad=1',arrowstyle='-|>',mutation_scale=18,color='#d46a1f',lw=2))""" if kind!='simple' else ""}
{ """ax.add_patch(FancyArrowPatch((L-25,20),(L+30,20),connectionstyle='arc3,rad=-1',arrowstyle='-|>',mutation_scale=18,color='#d46a1f',lw=2))""" if kind=='fixed' else ""}
ax.text(-40,52,'{ 'CA = 450 N mm CCW' if kind=='cantilever' else 'CA = 112.5 N mm CCW' if kind=='fixed' else 'CA = 0: pin cannot supply couple' }',fontsize=12,color='#d46a1f')
{ "ax.text(335,52,'CB = 112.5 N mm CW',fontsize=12,color='#d46a1f')" if kind=='fixed' else "ax.text(320,52,'CB = 0: roller is free to rotate',fontsize=12)" if kind=='simple' else ""}
ax.set_ylim(-75,65)
plt.show()
''')
    md('### 2A. One fixed end — centre load')
    support_figure('cantilever','Figure 1A — cantilever, 2 N at the centre')
    md(r'''
The free end is not a support, so it contributes no reaction. At A, horizontal force balance gives Rₓ = 0. Vertical balance and moments about A give:

$$\sum F_z=0:\quad R_A-2=0\quad\Longrightarrow R_A=2\ \mathrm{N\ upward},$$

$$\sum M_A=0:\quad C_A-2(225)=0\quad\Longrightarrow C_A=450\ \mathrm{N\,mm\ CCW}.$$

There are two transverse reaction unknowns and two equilibrium equations. The app reports −2 N and −450 N mm. Changing the load station changes its moment arm, not the number of reaction unknowns.
''')
    link('centre','cantilever with the 2 N centre force')
    md('#### Example A belongs to this cantilever — move the same force to the tip')
    keep('Figure 2 — external free body')
    md(r'''
This drawing now has a = L = 450 mm. The applied force is unchanged, but its lever arm doubles:

$$R_A-P=0,\qquad C_A-PL=0.$$

Thus Rₐ = 2 N upward and Cₐ = 900 N mm CCW. The app gives −2 N and −900 N mm. At the cut x = 150 mm, the remaining arm is 300 mm and the cut couple magnitude is 600 N mm. These are the actions shown on the separate outboard free body.
''')
    link('tip','Example A: 2 N at the free tip')
    md('#### Example B belongs to this cantilever — spread the same 2 N along the span')
    keep('Figure 6A — line load versus')
    md(r'''
For a uniform line load q = 2/450 = 0.00444444 N/mm, the area under q is F = qL = 2 N. Its centroid lies at L/2:

$$R_A-qL=0,\qquad C_A-(qL)\frac{L}{2}=0.$$

Therefore Rₐ = 2 N upward and Cₐ = 450 N mm CCW. The centre point-load and uniform-load cases have the same whole-beam reactions, but not the same internal distributions or displacement. Replacing a distributed load by its resultant preserves whole-beam equilibrium, not the entire response.
''')
    link('uniform','Example B: uniform downward load totalling 2 N')
    link('lift','same uniform magnitude directed upward, a lift analogue')
    md('### 2B. Pin and roller — the same centre force')
    support_figure('simple','Figure 1B — simply supported, 2 N at the centre')
    md(r'''
The pin supplies horizontal/vertical force, but no couple. A horizontal roller supplies vertical force only. Thus Rₓ = 0 and Cₐ = Cᵦ = 0. Take moments about A first:

$$R_A+R_B-2=0,$$

$$R_B(450)-2(225)=0\quad\Longrightarrow R_B=1\ \mathrm{N\ upward}.$$

Then Rₐ = 2 − 1 = 1 N upward. Two transverse unknowns are found from equilibrium; no material modulus is needed. The app reports −1 N at each support and zero couples.
''')
    link('simple','pin–roller with the 2 N centre force')
    md('### 2C. Both ends fixed — the same centre force')
    support_figure('fixed','Figure 1C — fixed–fixed, 2 N at the centre')
    md(r'''
Both supports prevent translation and rotation. There are four transverse unknowns: Rₐ, Rᵦ, Cₐ and Cᵦ. Whole-beam equilibrium gives:

$$R_A+R_B-2=0,$$

$$C_A+C_B+450R_B-2(225)=0.$$

#### Why do we need two more equations?

Equilibrium says that the beam does not accelerate; it does **not** say whether its bent shape fits its supports. Four transverse reactions but only two equilibrium equations leave two unknowns undetermined. This is a **statically indeterminate beam of degree two** in the transverse bending model. Axial reactions are outside this model.

**Compatibility means that the deformed beam must still fit the supports.** A perfect clamp does not let the end move vertically or rotate. Therefore v(0) = 0, θ(0) = 0, v(L) = 0 and θ(L) = 0. The centre may move downward; a clamp does not mean the whole beam stays straight.

We build the shape starting at A with v(0) = θ(0) = 0. The **two additional requirements at B** are:

$$\boxed{\theta(L)=0}\qquad\boxed{v(L)=0}.$$

The first says “the right end must finish horizontal”; the second says “the right end must finish at its original height.” These are geometric conditions, not extra force balances. If guessed reactions leave a tilted or vertically displaced right end, they cannot be the reactions of this fixed–fixed beam.

#### How do these geometric conditions become equations for reactions?

For small elastic bending, moment makes curvature. With v positive downward and M positive in sagging, our sign convention gives:

$$\theta=\frac{dv}{dx},\qquad \frac{d\theta}{dx}=-\frac{M(x)}{EI}.$$

Think of a tiny length dx: curvature changes its slope by −M dx/(EI). Adding all these slope changes gives the end rotation. Adding slopes along the beam gives displacement. Section 5 derives this material/geometry relation more fully. For constant EI and the zero starting displacement and rotation at A:

$$\boxed{\theta(L)=-\frac{1}{EI}\int_0^L M(x)\,dx=0}$$

$$\boxed{v(L)=-\frac{1}{EI}\int_0^L (L-x)M(x)\,dx=0}$$

Why the factor L − x? A small change of slope created at station x contributes displacement over the remaining distance to B. The first integral has units of rotation (dimensionless, reported in radians); the second has units of length. Positive and negative moment regions must cancel in the required ways.

For a point force at a = L/2, a cut of the left portion gives:

$$M(x)=
\begin{cases}
-C_A+R_Ax,&0\leq x<a,\\
-C_A+R_Ax-P(x-a),&a\leq x\leq L.
\end{cases}$$

The load contributes only after the cut passes its location. Substituting this piecewise moment into the two compatibility integrals gives two simple algebraic equations:

$$\boxed{-C_A L+\frac{R_A L^2}{2}-\frac{P(L-a)^2}{2}=0}$$

$$\boxed{-\frac{C_A L^2}{2}+\frac{R_A L^3}{6}-\frac{P(L-a)^3}{6}=0}.$$

These are **zero rotation and zero displacement**, respectively—not new laws of equilibrium. The common nonzero EI cancels because it is constant here. It cannot generally be taken outside the integral for a tapered or variable-stiffness beam.

#### Solve the two equations, then return to equilibrium

For L = 450 mm, a = 225 mm and P = 2 N:

$$-450C_A+101250R_A-50625=0,$$

$$-101250C_A+15187500R_A-3796875=0.$$

Multiply the first equation by L/2 = 225 mm and subtract the second. This gives Rₐ = 1 N. Substitution in the first gives Cₐ = 112.5 N mm CCW. Equilibrium then gives Rᵦ = 1 N and Cᵦ = −112.5 N mm (clockwise). Equal vertical reactions are also an independent symmetry check.

$$C_A=\frac{PL}{8}=112.5\ \mathrm{N\,mm\ CCW},\qquad C_B=-112.5\ \mathrm{N\,mm\ CW}.$$

**Check the shape, not only the forces:** these reactions give θ(L) = 0 and v(L) = 0, while the centre displacement is PL³/(192EI) = 0.2848 mm downward. The midpoint tangent is horizontal by symmetry, but the midpoint displacement is not zero.

**Today's method:** equilibrium + elastic bending + compatibility. **Lecture 04 will use virtual work to solve this type of beam**; no virtual-work calculation is required here.

Substitution into the whole-beam moment equation gives 112.5 − 112.5 + 450 − 450 = 0 N mm. The app reports −112.5 at A and +112.5 at B because its positive couple direction is clockwise. Both **internal** end moments are −112.5 N mm; that is a different sign convention on different cut faces. The displacement/curvature relation used here is explained geometrically in Section 5.
''')
    link('fixed','fixed–fixed with the 2 N centre force')
    md(r'''
### Compare reactions before comparing stress or displacement

| Same 2 N centre load | Vertical reactions | External support couples | What found them? |
|---|---|---|---|
| Cantilever | A: 2 N upward | A: 450 N mm CCW; none at free B | Equilibrium |
| Pin–roller | A and B: 1 N upward each | Both zero | Equilibrium |
| Fixed–fixed | A and B: 1 N upward each | A: 112.5 CCW; B: 112.5 CW | Equilibrium plus compatibility |

A stronger constraint does not remove the load. It changes how forces and couples are shared. For a real aircraft root, multiple fittings collectively transmit the bending couple; a drawn clamp is their idealization.
''')
    keep('## 3. A cut reveals')
    code(r'''
#@title Figure 3 — first the loaded beam, then its shear and moment diagrams
V=np.full_like(x,P);M=-P*(L-x)
fig,axes=plt.subplots(3,1,figsize=(12,9),layout='constrained')
ax=axes[0];clean_beam(ax,'Example A: one fixed root, 2 N downward at the free tip')
support(ax,0,'fixed');arrow(ax,(L,45),(L,3));ax.text(370,50,'P = 2 N')
ax.text(15,23,'RA = 2 N upward; CA = 900 N mm CCW',fontsize=13)
dimension(ax,(0,-30),(L,-30),'L = 450 mm',(0,-9))
for ax,yy,label in zip(axes[1:],[V,M],['Shear V (N)','Sagging-positive M (N mm)']):
    ax.plot(x,yy,lw=3);ax.fill_between(x,yy,0,alpha=.12)
    ax.axhline(0,color='gray');ax.set_ylabel(label);ax.grid(alpha=.2);ax.set_xlim(0,L)
axes[1].set_title('The diagram belongs to the beam directly above')
axes[2].set_xlabel('x from the same fixed root (mm)')
plt.show()
''')
    md(r'''
## 4. Learn stress before using the beam stress equation

### 4.1. Force across a small surface

Imagine cutting through material and examining a small surface patch of area ΔA. The material on the other side transmits a force ΔF across that patch. **Traction** is the force vector per surface area:

$$\mathbf t(\mathbf n)=\lim_{\Delta A\to0}\frac{\Delta\mathbf F}{\Delta A}.$$

The unit normal n identifies which surface is being examined. Resolve this force into a component perpendicular to that face and components tangent to it:

$$\sigma_n=\frac{F_n}{A},\qquad \tau=\frac{F_t}{A}\quad\text{for uniform components over an area}.$$

**Normal stress means perpendicular to the face**, not necessarily vertical in the room. On a beam cross-section normal to x, normal stress σₓₓ acts along the beam. A force parallel to that face produces shear stress. N/mm² is MPa. The average F/A does not tell us whether stress is uniform: bending produces a varying distribution.
''')
    code(stress_tensor_figure())
    md(r'''
### 4.2. Stress tensor — select a face, then select a force direction

We use σᵢⱼ = force/traction component in direction i on a face with normal in direction j. For example, σ_zx is the vertical shear on an x-normal beam cut, while σ_xz is longitudinal shear on a z-normal face. They act on different faces. In a classical continuum without couple stresses, moment balance gives σ_zx = σ_xz.

$$\boldsymbol{\sigma}=
\begin{bmatrix}
\sigma_{xx}&\tau_{xy}&\tau_{xz}\\
\tau_{yx}&\sigma_{yy}&\tau_{yz}\\
\tau_{zx}&\tau_{zy}&\sigma_{zz}
\end{bmatrix},
\qquad \mathbf t(\mathbf n)=\boldsymbol{\sigma}\mathbf n.$$

Diagonal entries are normal stresses. Off-diagonal entries are shear stresses. Three faces times three components makes nine entries; symmetry leaves six independent components. The cube drawing identifies each component. The beam model below retains the dominant longitudinal bending stress and transverse shear; it does not compute every component of a three-dimensional solid.

The cube arrows illustrate positive tensor components, not the numerical load case. Reversing a face normal reverses its traction vector. [MIT primary reading on stress and equilibrium](https://ocw.mit.edu/courses/2-080j-structural-mechanics-fall-2013/8e61abd2b094e2214465ce18ab8eb440_MIT2_080JF13_Lecture3.pdf).

### 4.3. First draw the cross-section — then calculate A and I

The next drawing fixes b, h, z, c and the neutral axis before area or stress calculations. Width b lies along y; height h lies along z. A thin horizontal strip has area dA = b dz.
''')
    code(section_geometry_figure())
    md(r'''
$$A=bh=(20)(10)=200\ \mathrm{mm^2},$$

$$I_y=\int_A z^2\,dA=b\int_{-h/2}^{h/2}z^2\,dz
=\frac{bh^3}{12}=1666.6667\ \mathrm{mm^4},\qquad c=h/2=5\ \mathrm{mm}.$$

A counts area once. I weights it by distance squared from the neutral axis, so material farther away has more bending leverage. I is section geometry, not material stiffness or mass moment of inertia. E = 2000 MPa is our assumed material modulus; EI combines material and geometry.

### 4.4. Bending normal stress on this section

For the root section of Example A, M = −PL = −900 N mm. With sagging-positive M, upward-positive z and tension-positive stress:

$$\boxed{\sigma_{xx}(z)=-\frac{Mz}{I_y}},\qquad
|\sigma_{\max}|=\frac{|M|c}{I_y}=2.70\ \mathrm{MPa}.$$

At z = +5 mm the stress is +2.70 MPa (top tension); at z = 0 it is zero; at z = −5 mm it is −2.70 MPa (bottom compression). These are stresses **along x**, drawn on the cross-section normal to x. Section 5 derives this relation from fibre strain and material response.

The earlier shorthand σₓ means this component σₓₓ; εₓ likewise means longitudinal εₓₓ. A direction subscript is not an extra variable.
''')
    code(normal_contour())
    md(r'''
**Read the contour:** red means tension, blue means compression. Colour intensity increases with |z|, not monotonically with signed z across both halves. In the upper half, increasing z makes tension darker; moving downward below the neutral axis makes compression darker. The second panel shows magnitude only. Both plots are analytical fields on the solid rectangle, not a 3-D finite-element result or a damage image.

**Why not simply divide 2 N by A?** The 2 N applied force is transverse to the beam, so 2/200 = 0.010 MPa is an average transverse shear, not the longitudinal bending stress. Bending produces a tension/compression couple: integrating the root stress over the upper half gives 135 N tension, and the lower half gives 135 N compression. Their net axial force is zero but their combined moment is 900 N mm. Normal stress can therefore be large even though no net axial force is applied.

### 4.5. What Q means physically

Choose a horizontal cut at z = +2.5 mm and select only the material **above** it. Its first moment about the neutral axis is:

$$Q(z)=\int_{A^*}z'\,dA=A^*\bar z^*
=\frac b2\left[\left(\frac h2\right)^2-z^2\right].$$

Q is not a load and not merely area. Its mm³ units combine selected area and its centroid's bending lever arm. I describes the whole section with z² weighting; Q describes this selected region with z weighting.
''')
    keep('Figure 4B — first moment Q')
    new[-1]['source']=new[-1]['source'].replace('τxz = VQ/(I b)','|τxz| = |V|Q/(I b)')
    md(r'''
### Why that selected area requires shear transfer

The longitudinal bending-force resultant carried by the shaded upper material is:

$$N^*(x)=\int_{A^*}\sigma_{xx}\,dA=-\frac{M(x)Q}{I}.$$

Because bending moment changes along x, this force changes from one cut to a neighbouring cut. Shear across the lower boundary of the shaded material transfers the difference. The next diagram isolates that upper slice. Its longitudinal force balance is −Nₗ + Nᵣ + F_interface = 0. These longitudinal forces are not the 2 N vertical load.

Since dM/dx = V, the required shear-force transfer per unit span is |s| = |VQ|/I. Divide by the solid width b of the interface to obtain shear-stress magnitude:

$$\boxed{|\tau_{xz}|=\frac{|V|Q}{Ib}},\qquad \tau_{zx}=\tau_{xz}.$$

The second equality is complementary shear from stress symmetry. Thus the same magnitude appears as vertical shear on a beam cross-section and longitudinal shear on the horizontal interface.

**Face signs matter:** the isolated upper slice's lower interface has normal −z and receives force in +x. Consequently its positive-face tensor component σ_xz is negative. With the app's M′ = V convention, τxz = τzx = −VQ/(Ib). On the outboard portion's left face (normal −x), that negative component produces an upward traction. The following contour deliberately shows magnitude, not signed components.

[Roylance's beam-stress derivation](https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Mechanics_of_Materials_(Roylance)/04:_Bending/4.02:_Stresses_in_Beams) explains the selected-area force transfer; its coordinate/index conventions differ, so use the explicit convention of this notebook.
''')
    code(q_transfer_figure())
    md(r'''
For the solid rectangle, substitute Q(z) and I = bh³/12:

$$|\tau_{zx}(z)|=\frac{3|V|}{2bh}
\left[1-\left(\frac{2z}{h}\right)^2\right].$$

At V = 2 N, the maximum is 0.015 MPa at z = 0, and the top/bottom surfaces have zero shear. At z = 2.5 mm, Q = 187.5 mm³ and shear is 0.01125 MPa. The normal-stress maximum and shear-stress maximum occur at different heights.
''')
    code(shear_contour())
    md(r'''
### One section, two different stress distributions

| z (mm) | σₓₓ (MPa) | Shear magnitude (MPa) |
|---:|---:|---:|
| +5 | +2.700 | 0 |
| +2.5 | +1.350 | 0.01125 |
| 0 | 0 | 0.01500 |
| −2.5 | −1.350 | 0.01125 |
| −5 | −2.700 | 0 |

The contour colours and profiles follow these values. Do not add maximum bending stress and maximum shear as if they occupied the same point. A real wing box uses thin-wall shear flow and its own geometry; the solid-rectangle formula is not obtained by substituting wing-skin thickness for b. Nominal beam stresses also exclude clamp-edge concentrations, holes and buckling.
''')
    md(strain_intro())
    code(strain_figure())
    keep('## 5. Why bending creates strain')
    new[-1]['source']=new[-1]['source'].replace('## 5. Why bending creates strain and how curvature creates displacement','### 5.2. Apply the strain definition to bending fibres')
    keep('Figure 5A — equal original')
    md(r'''
For our beam coordinates, vertical material displacement u_z = −v because z points upward and v is defined downward. Plane sections remaining perpendicular to the neutral fibre give u_x = z v′. Therefore εₓₓ = ∂u_x/∂x = z v″. This fixes the sign of the bending strain. The **Euler–Bernoulli model neglects shear deformation**, although transverse shear stress still exists.

$$\gamma_{xz}=\frac{\partial u_x}{\partial z}+
\frac{\partial u_z}{\partial x}=v'-v'=0.$$

This zero is a kinematic approximation, not a claim that V or shear stress vanishes. Short/deep beams may need a shear-deformable model.

In this reduced theory, transverse shear stress is recovered from equilibrium while shear deformation is neglected. It is not an exact three-dimensional strain field. The relation σₓₓ = E εₓₓ is the beam's dominant uniaxial longitudinal response, not the general constitutive equation for a state with all nine stress components.
''')
    keep('### Integrate curvature using')
    keep('Figure 5B — undeformed')
    keep('Figure 5C — four stages')
    md(r'''
### 5.3. Return to the support examples after learning displacement

All centre-force comparisons below use the same length, section, modulus and 2 N force. The maximum cantilever displacement is at its free tip, **not at the load station**.

| Case | Largest nominal bending stress | Maximum downward displacement |
|---|---:|---:|
| Cantilever, centre force | 1.350 MPa at root | 5.695313 mm at free tip; load station: 2.278125 mm |
| Pin–roller, centre force | 0.675 MPa at centre | 1.139063 mm at centre |
| Fixed–fixed, centre force | 0.3375 MPa at ends and centre | 0.284766 mm at centre |
| Cantilever tip extension (Example A) | 2.700 MPa at root | 18.225 mm at tip |
| Cantilever uniform extension (Example B) | 1.350 MPa at root | 6.834375 mm at tip |

For the simply supported centre force, integrating curvature with zero end displacement gives PL³/(48EI). For fixed–fixed it gives PL³/(192EI). The reactions were derived in their own support subsections, not inferred from these displacement formulas.

For Example B, M(x) = −q(L − x)²/2. Two integrations with v(0) = θ(0) = 0 give:

$$v(x)=\frac{qx^2}{24EI}(6L^2-4Lx+x^2),\qquad
v(L)=\frac{qL^4}{8EI}=6.834375\ \mathrm{mm}.$$

Its root moment matches the centre point-load cantilever, but displacement does not: whole-beam equivalent loads need not have the same internal strain field.
''')
    keep('Figure 6B — equal total load')
    keep('Figure 7B — simply supported')
    keep('### What the app actually solves')
    keep('Figure 5D — finite-element')
    keep('## 8. Return to the aircraft wing')
    new[-1]['source']=new[-1]['source'].replace('## 8.','## 6.')
    keep('Figure 8 — a wing spar')
    keep('### Optional orientation — distinguish')
    keep('Optional Figure 9 — torsion')
    keep('## 9. Four-minute exit')
    new[-1]['source']=new[-1]['source'].replace('## 9.','## 7.')
    # Each face is tagged with its force component; inline symbols are plain text.
    for c in new:
        c['source']=c['source'].strip()
        c['id']=uuid.uuid5(uuid.NAMESPACE_URL,c['source']).hex[:8]
    cells[:]=new


def stress_tensor_figure():
    return r'''
#@title Stress element — normal and tangential traction on x, y and z faces
fig,axes=plt.subplots(1,3,figsize=(15,5.5),layout='constrained')
proj=lambda p:np.array([p[0]-p[1],1.1*p[2]-.35*(p[0]+p[1])])
vectors=[proj([1,0,0]),proj([0,1,0]),proj([0,0,1])]
faces=[[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],
       [[0,1,0],[1,1,0],[1,1,1],[0,1,1]],
       [[0,0,1],[1,0,1],[1,1,1],[0,1,1]]]
names=['x','y','z']
for j,ax in enumerate(axes):
    for k,face in enumerate(faces):
        ax.add_patch(Polygon([proj(p) for p in face],facecolor='#e4eef5' if k!=j else '#f5ddb8',edgecolor='#19394e',lw=1.5))
    origin=proj(np.mean(faces[j],axis=0))
    for i,vector in enumerate(vectors):
        target=origin+.70*vector
        arrow(ax,origin,target,'#b1322e' if i==j else '#236bb4')
        label=('σ' if i==j else 'τ')+names[i]+names[j]
        ax.text(*(target+.12*vector),label,color='#b1322e' if i==j else '#236bb4',ha='center',fontsize=13,
                bbox=dict(facecolor='white',edgecolor='none',alpha=.85))
    ax.text(-1.4,-1.02,f'Face normal: +{names[j]}',fontsize=13)
    ax.set(xlim=(-1.8,1.8),ylim=(-1.2,1.8),title=f'{names[j]}-normal face: three traction components')
    ax.set_aspect('equal');ax.axis('off')
fig.suptitle('Red: perpendicular to the selected face; blue: tangent to that face',fontsize=15)
plt.show()
'''

def section_geometry_figure():
    return r'''
#@title Figure 4 — draw the area and dimensions before calculating A and I
fig,axes=plt.subplots(1,2,figsize=(13,5.5),layout='constrained')
for ax in axes:
    ax.add_patch(Rectangle((-b/2,-h/2),b,h,facecolor='#e3eef5',edgecolor='#19394e',lw=2))
    ax.plot([-b/2,b/2],[0,0],'--',color='gray')
    dimension(ax,(-b/2,-8),(b/2,-8),'b = 20 mm',(0,-1))
    dimension(ax,(-14,-h/2),(-14,h/2),'h = 10 mm',(-3,0),rotation=90)
    ax.set(xlim=(-21,25),ylim=(-12,13));ax.set_aspect('equal');ax.axis('off')
axes[0].set_title('A: the entire rectangular area')
axes[0].text(-9,2,'A = width × depth',fontsize=13)
axes[0].text(-9,-1.5,'Neutral axis: z = 0',fontsize=12)
dimension(axes[0],(12,0),(12,h/2),'c = h/2',(4,0))
axes[0].text(-9,10,'Section normal is x; width is along y',fontsize=12)
axes[1].set_title('I: add the contributions of thin strips')
axes[1].add_patch(Rectangle((-b/2,2.5),b,.6,facecolor='#eeb147'))
dimension(axes[1],(0,0),(0,2.8),'z',(2,0))
axes[1].text(-9,4,'dA = b dz',fontsize=13)
dimension(axes[1],(12,2.5),(12,3.1),'dz',(3,1))
axes[1].text(-9,9,'Strip contribution: z² dA',fontsize=13)
axes[1].text(-9,-11,'Farther strips contribute more to Iy',fontsize=12)
plt.show()
'''

def normal_contour():
    return r'''
#@title Bending stress contour on the root cross-section — not a damage plot
yy,zz=np.meshgrid(np.linspace(-b/2,b/2,121),np.linspace(-h/2,h/2,121))
normal_field=P*L*zz/I
normal_peak=max(float(np.max(abs(normal_field))),1e-12)
fig,axes=plt.subplots(1,2,figsize=(13,5),layout='constrained')
for ax,field,cmap,levels,title in [
 (axes[0],normal_field,'RdBu_r',np.linspace(-normal_peak,normal_peak,19),'Signed σxx: blue compression, red tension'),
 (axes[1],abs(normal_field),'Reds',np.linspace(0,normal_peak,19),'Magnitude |σxx|: darker away from neutral axis')]:
    image=ax.contourf(yy,zz,field,levels=levels,cmap=cmap)
    ax.axhline(0,color='gray',ls='--');ax.set(xlabel='y across width b (mm)',ylabel='z from neutral axis (mm)',title=title)
    ticks=np.linspace(-normal_peak,normal_peak,7) if ax is axes[0] else np.linspace(0,normal_peak,4)
    ax.set_aspect('equal');fig.colorbar(image,ax=ax,orientation='horizontal',pad=.22,label='Stress (MPa)',ticks=ticks)
plt.show()
assert np.isclose(normal_field[-1,0],P*L*h/(2*I)) and np.isclose(normal_field[0,0],-P*L*h/(2*I))
'''

def shear_contour():
    return r'''
#@title Rectangular transverse shear magnitude — darkest at neutral axis
shear_field=1.5*abs(P)/A*(1-(2*zz/h)**2)
shear_peak=max(float(np.max(shear_field)),1e-12)
fig,axes=plt.subplots(1,2,figsize=(13,5),layout='constrained')
image=axes[0].contourf(yy,zz,shear_field,levels=np.linspace(0,shear_peak,16),cmap='Blues')
axes[0].axhline(0,color='gray',ls='--');axes[0].set(xlabel='y (mm)',ylabel='z (mm)',title='|τzx| = |τxz| on the rectangular section');axes[0].set_aspect('equal')
fig.colorbar(image,ax=axes[0],orientation='horizontal',pad=.22,label='Shear-stress magnitude (MPa)',ticks=np.linspace(0,shear_peak,4))
axes[1].plot(shear_field[:,0],zz[:,0],lw=3);axes[1].set(xlabel='|τzx| (MPa)',ylabel='z (mm)',title='Zero at top/bottom; maximum at z = 0');axes[1].grid(alpha=.2)
plt.show()
assert np.isclose(shear_field[0,0],0) and np.isclose(shear_field[60,0],1.5*abs(P)/A)
'''

def q_transfer_figure():
    return r'''
#@title Q determines the longitudinal-force difference that interface shear transfers
Qchosen=187.5;dx=10.;Mleft=-P*(L-150);Mright=-P*(L-160)
Nleft=-Mleft*Qchosen/I;Nright=-Mright*Qchosen/I
transfer=Nleft-Nright
fig,ax=plt.subplots(figsize=(12,5),layout='constrained')
ax.add_patch(Rectangle((100,0),260,20,facecolor='#f5ddb8',edgecolor='#19394e',lw=2))
arrow(ax,(100,10),(50,10),'#b1322e');ax.text(5,28,f'N*(150) = {Nleft:.2f} N',fontsize=14)
arrow(ax,(360,10),(415,10),'#b1322e');ax.text(330,28,f'N*(160) = {Nright:.2f} N',fontsize=14)
arrow(ax,(200,0),(290,0),'#236bb4');ax.text(140,-16,f'Interface force = {transfer:.2f} N to the right',fontsize=14,color='#236bb4')
dimension(ax,(100,-33),(360,-33),'Actual Δx = 10 mm; slice enlarged',(0,-8))
ax.text(120,8,'Selected upper material above z = 2.5 mm',fontsize=13)
ax.text(35,49,'Longitudinal equilibrium: −67.50 + 65.25 + 2.25 = 0 N',fontsize=15)
ax.text(35,-59,'Transfer / Δx = 0.225 N/mm; divide by b = 20 mm → |τxz| = 0.01125 MPa',fontsize=13)
ax.set(xlim=(0,470),ylim=(-70,65));ax.axis('off')
plt.show()
assert np.isclose(transfer,2.25)
'''

def strain_intro():
    return r'''
## 5. Learn strain before the bending-strain equation

### 5.1. Normal strain, shear strain and the strain tensor

Strain measures **local change of shape or length**, not rigid translation. Normal strain is the relative change in a material line's length:

$$\varepsilon_{xx}=\frac{\Delta\ell_x}{\ell_x}.$$

Extension is positive; shortening is negative. Normal strains εₓₓ, εᵧᵧ and εzz refer to lines initially along x, y and z. Shear strain describes the change of the right angle between material lines. Engineering shear γxz is the total small change in that angle; the tensor component is half of it.

For displacement vector u = (uₓ,uᵧ,u_z), the small-strain tensor is:

$$\varepsilon_{ij}=\frac12\left(\frac{\partial u_i}{\partial x_j}
+\frac{\partial u_j}{\partial x_i}\right),$$

$$\boldsymbol{\varepsilon}=
\begin{bmatrix}
\varepsilon_{xx}&\gamma_{xy}/2&\gamma_{xz}/2\\
\gamma_{xy}/2&\varepsilon_{yy}&\gamma_{yz}/2\\
\gamma_{xz}/2&\gamma_{yz}/2&\varepsilon_{zz}
\end{bmatrix}.$$

The tensor is symmetric. Normal strains are fractional length changes; shear entries measure distortion. Strain is dimensionless (small angles are conventionally expressed in radians). Do not confuse stress τxz, measured in MPa, with shear strain γxz. A rigid translation or infinitesimal rigid rotation produces no small strain.

[MIT primary reading on the concept of strain](https://ocw.mit.edu/courses/2-080j-structural-mechanics-fall-2013/71034688fba0ff26d25653a4bd236a4a_MIT2_080JF13_Lecture2.pdf). The notebook uses the small-strain symmetric displacement gradient; finite rotations require a different strain measure.
'''

def strain_figure():
    return r'''
#@title Material-line changes — stretch, shear distortion and rigid translation
fig,axes=plt.subplots(1,3,figsize=(15,5),layout='constrained')
for ax in axes:
    ax.add_patch(Rectangle((0,0),3,2,fill=False,edgecolor='gray',ls='--',lw=2))
    ax.set(xlim=(-.7,4.6),ylim=(-1,3.5));ax.set_aspect('equal');ax.axis('off')
axes[0].add_patch(Rectangle((0,0),3.7,2,fill=False,edgecolor='#b1322e',lw=2))
dimension(axes[0],(0,-.5),(3,-.5),'ℓ0')
dimension(axes[0],(3,2.6),(3.7,2.6),'Δℓ',(0,.3))
axes[0].set_title('Normal strain: εxx = Δℓ / ℓ0')
axes[1].add_patch(Polygon([[0,0],[3,0],[3.7,2],[.7,2]],fill=False,edgecolor='#236bb4',lw=2))
angles=np.linspace(np.arctan2(2,.7),np.pi/2,50)
axes[1].plot(.6*np.cos(angles),.6*np.sin(angles),color='#d46a1f',lw=2)
axes[1].text(.25,.85,'γxz',fontsize=13,color='#d46a1f')
axes[1].text(.6,2.5,'Angle change γxz',fontsize=13)
axes[1].text(.15,-.75,'Tensor shear εxz = γxz / 2',fontsize=12)
axes[1].set_title('Shear strain: square becomes skew')
axes[2].add_patch(Rectangle((.7,.7),3,2,fill=False,edgecolor='#176441',lw=2))
arrow(axes[2],(1.5,1),(2.2,1.7),'#176441')
axes[2].text(.05,-.75,'Lengths and angles unchanged: strain = 0',fontsize=12)
axes[2].set_title('Rigid translation is not strain')
fig.suptitle('Deformations exaggerated to make the definitions visible',fontsize=15)
for ax in axes:
    ax.text(3.15,-.25,'x →; z ↑',fontsize=11,color='#19394e')
plt.show()
'''
