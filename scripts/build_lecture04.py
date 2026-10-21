"""Build an executed, self-contained virtual-work lesson and its HTML reading view."""
from pathlib import Path
import base64
import contextlib
import html
import io
import json
import re
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAME = 'MIE446_Lecture_04_Mohr_Circle_Virtual_Work_and_Unit_Load.ipynb'
APP = 'https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-fixed'
cells = []

def cell(kind, source):
    source = source.strip()
    item = dict(cell_type=kind, id=uuid.uuid5(uuid.NAMESPACE_URL, 'l04:'+source).hex[:12], metadata={}, source=source)
    if kind == 'code':
        item.update(execution_count=None, outputs=[])
    cells.append(item)

def md(source): cell('markdown', source)
def code(source): cell('code', source)

md(r'''# MIE 446 Aerospace Structures
## Lecture 04 — Mohr’s circle, virtual work and the unit-load method

**90-minute guided lecture and executable notebook · Dr. Ehsan Roohi · Fall 2026**

[Open in Google Colab](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_04_Mohr_Circle_Virtual_Work_and_Unit_Load.ipynb) · [Reading view with saved figures](https://ehsan-roohi.github.io/Aerospace-Structures/lecture04-virtual-work.html)

Lecture 03 showed that equilibrium cannot determine every reaction of a fixed–fixed beam. Today we calculate those reactions from **deformation compatibility**, using virtual loads to measure the missing displacements. We begin with a short stress-transformation review, then follow one beam all the way from its free body to the software equations.

### Learning goals

By the end, you should be able to:

1. Construct a Mohr circle from stresses at **one material point** and distinguish stress transformation from beam deflection.
2. Choose a virtual force for a displacement, or a virtual couple for a rotation, and explain the units.
3. Release redundant restraints, calculate flexibility coefficients, and enforce the original support conditions.
4. Recover signed support reactions and check equilibrium, compatibility and energy.
5. Explain the difference between the app’s direct-stiffness solution and its force-method explanation.

| Minutes | In-class route | Evidence to produce |
|---|---|---|
| 0–15 | Mohr circle and sign review | A stress point, two principal stresses, one invariant |
| 15–28 | Real loads versus virtual loads | Select the correct unit action and direction |
| 28–40 | One cantilever displacement by integration | Explain why there is no factor 1/2 |
| 40–65 | The Lecture 03 fixed–fixed beam | Two redundants, two compatibility equations, four reactions |
| 65–82 | What the software solves | Compare force method, NumPy FE and the app |
| 82–90 | Prediction, parameter test and exit ticket | One defensible engineering conclusion |

**How to use this notebook:** save your own copy in Drive. Choose **Run all** once, then change only the marked input cells and rerun downstream cells. Saved figures are visible before execution. Python uses NumPy and Matplotlib only; no repository clone, network data, CAD package or hidden solver is required. The expandable code shows every calculation. The final extension is optional after-class reading.
''')

code(r'''#@title Setup — run first
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon, Arc
from numpy.polynomial.legendre import leggauss

plt.rcParams.update({'figure.dpi':120, 'font.size':11, 'axes.spines.top':False,
                     'axes.spines.right':False, 'axes.grid':True, 'grid.alpha':.2})
BLUE, GREEN, PURPLE, ORANGE = '#1264a3', '#08734f', '#992a9f', '#c75b10'

def gauss_integral(fun, breaks, order=6):
    """Gauss integration, split at every formula change; no load smearing."""
    t,w=leggauss(order)
    return sum((b-a)/2*np.sum(w*fun((a+b)/2+(b-a)/2*t))
               for a,b in zip(breaks[:-1],breaks[1:]))

def cantilever_shape(x, L, a, P, EI):
    x=np.asarray(x)
    return np.where(x<=a, P*x*x*(3*a-x)/(6*EI),
                    P*a*a*(3*x-a)/(6*EI))

def force_solution(L,E,b,h,P,a):
    if not (L>0 and E>0 and b>0 and h>0 and 0<a<L):
        raise ValueError('Positive dimensions/modulus and an interior load station are required.')
    I=b*h**3/12; EI=E*I
    M0=lambda x:-P*np.maximum(a-x,0)
    basis=[lambda x:-(L-x), lambda x:-np.ones_like(x)]
    d=np.array([gauss_integral(lambda x:m(x)*M0(x)/EI,[0,a,L]) for m in basis])
    F=np.array([[gauss_integral(lambda x:mi(x)*mj(x)/EI,[0,a,L])
                 for mj in basis] for mi in basis])
    # Generalized forces [R_B (N), C_B (N mm)]; positive down / clockwise.
    RB,CB=np.linalg.solve(F,-d)
    RA=-P-RB; CA=-P*a-RB*L-CB
    return dict(L=L,E=E,b=b,h=h,P=P,a=a,I=I,EI=EI,delta=d,F=F,
                RB=RB,CB=CB,RA=RA,CA=CA,compatibility=d+F@np.array([RB,CB]))

def beam_moment(x,s):
    x=np.asarray(x)
    return s['CA']-s['RA']*x-s['P']*np.maximum(x-s['a'],0)

def beam_displacement(x,s):
    L,a,P,EI=s['L'],s['a'],s['P'],s['EI'];x=np.asarray(x)
    return (cantilever_shape(x,L,a,P,EI)
            +s['RB']*x*x*(3*L-x)/(6*EI)+s['CB']*x*x/(2*EI))

def arrow(ax,x,y0,y1,label,color=PURPLE,label_y=None):
    ax.annotate('',(x,y1),(x,y0),arrowprops=dict(arrowstyle='-|>',color=color,lw=2))
    ax.text(x,(y0+.06 if y0>y1 else y0-.13) if label_y is None else label_y,label,ha='center',color=color,fontsize=10)

def clamp(ax,x,side):
    ax.plot([x,x],[-.12,.16],color=GREEN,lw=4)
    for y in np.linspace(-.12,.12,6):
        ax.plot([x,x+side*.025],[y,y-.045],color=GREEN,lw=1)

def beam_picture(ax,title,L=450,a=None,real=None,unit=None,both=False,fbd=None):
    ax.plot([0,1],[0,0],color=BLUE,lw=6,solid_capstyle='round')
    if fbd is None:
        clamp(ax,0,-1)
        if both: clamp(ax,1,1)
    else:
        for xx,F in [(0,fbd['RA']),(1,fbd['RB'])]:
            arrow(ax,xx,-.48 if F<0 else -.03,-.03 if F<0 else -.48,
                  f'{F:+.3g} N '+('↑' if F<0 else '↓'),GREEN,label_y=-.61)
        for xx,C in [(0,fbd['CA']),(1,fbd['CB'])]:
            if abs(C)>1e-12:
                angles=np.deg2rad(np.linspace(220,-70,80) if C>0 else np.linspace(-40,250,80))
                cx=xx+.055*np.cos(angles);cy=.07+.22*np.sin(angles)
                ax.plot(cx,cy,color=GREEN,lw=1.6)
                ax.annotate('',(cx[-1],cy[-1]),(cx[-5],cy[-5]),arrowprops=dict(arrowstyle='-|>',color=GREEN,lw=1.6))
            ax.text(xx,.37,f'{C:+.4g} N mm\n'+('CW' if C>0 else 'CCW' if C<0 else 'zero'),ha='center',color=GREEN)
    if real is not None:
        arrow(ax,a/L,.65 if real>=0 else .035,.035 if real>=0 else .65,
              f'P = {real:g} N '+('↓' if real>=0 else '↑'),label_y=.75)
    if unit=='force': arrow(ax,1,.65,.035,'1 N ↓',ORANGE)
    if unit=='couple':
        ax.add_patch(Arc((1,.05),.18,.35,theta1=30,theta2=300,color=ORANGE,lw=2))
        ax.annotate('',(1.086,.12),(1.070,.18),arrowprops=dict(arrowstyle='-|>',color=ORANGE))
        ax.text(.92,.55,'1 N mm CW',ha='center',color=ORANGE)
    ax.text(0,-.81,'A · x = 0',ha='center');ax.text(1,-.81,f'B · x = {L:g} mm',ha='center')
    if a is not None:
        ax.plot([0,a/L],[-.28,-.28],color='#60788c');ax.text(a/(2*L),-.44,f'a = {a:g} mm',ha='center',fontsize=10)
    ax.set(xlim=(-.18,1.2),ylim=(-.98,.95),title=title);ax.axis('off')

print('Setup complete. Units: N, mm, MPa. No material strength or damage model is assumed.')
''')

md(r'''## 1. Review — Mohr’s circle describes stress at a point

Mohr’s circle changes the **orientation of the plane on which stress is reported**. It does not add a force, move a support or calculate the deflected shape. Never combine maximum normal stress at one fibre with maximum shear at a different fibre to invent a stress tensor.

Use x along the beam and z upward. At one material point the plane-stress tensor is:

$$\boldsymbol\sigma=\begin{bmatrix}\sigma_x&\tau_{xz}\\\tau_{xz}&\sigma_z\end{bmatrix}.$$

Tension is positive. Positive tensor shear means a +z traction on the +x face (and +x traction on the +z face). In the circle below **positive tensor shear is plotted upward**. With this plotting choice, the x-face point is (σₓ, τₓz), and a positive physical rotation φ of the axes moves that point through **−2φ** around the circle. A book plotting shear downward will show a different graphical rotation direction, not different physics.

$$c=\frac{\sigma_x+\sigma_z}{2},\qquad
R=\sqrt{\left(\frac{\sigma_x-\sigma_z}{2}\right)^2+\tau_{xz}^2},\qquad
\sigma_1=c+R,\quad\sigma_2=c-R.$$

These are the two **in-plane** principal stresses. The third principal stress is zero for plane stress. The absolute three-dimensional maximum shear is half the difference between the largest and smallest of {σ₁, σ₂, 0}; it need not equal the circle’s in-plane radius.

**Predict first:** for σₓ = 40 MPa, σz = 10 MPa and τₓz = 15 MPa, is σ₁ greater than 40 MPa? Does rotation change the trace σₓ + σz?
''')

code(r'''#@title Mohr circle explorer — change the stress or the physical axis angle
sigma_x=40.0 #@param {type:"number"}
sigma_z=10.0 #@param {type:"number"}
tensor_shear=15.0 #@param {type:"number"}
physical_angle_deg=25.0 #@param {type:"number"}
S=np.array([[sigma_x,tensor_shear],[tensor_shear,sigma_z]])
phi=np.deg2rad(physical_angle_deg);cphi,sphi=np.cos(phi),np.sin(phi)
Q=np.array([[cphi,sphi],[-sphi,cphi]]) # rows are new unit axes in old coordinates
Sp=Q@S@Q.T
centre=np.trace(S)/2;radius=np.hypot((sigma_x-sigma_z)/2,tensor_shear)
principal=np.linalg.eigvalsh(S);p3=np.sort(np.r_[principal,0.])
fig,axs=plt.subplots(1,2,figsize=(11,4.8),layout='constrained')
ax=axs[0];ax.add_patch(Rectangle((-.5,-.5),1,1,facecolor='#eaf3fb',edgecolor=BLUE,lw=2))
for xy,xytext,color in [((.95,0),(.5,0),BLUE),((-.95,0),(-.5,0),BLUE),
                        ((0,.95),(0,.5),BLUE),((0,-.95),(0,-.5),BLUE),
                        ((.63,.4),(.63,-.3),PURPLE),((-.63,-.4),(-.63,.3),PURPLE),
                        ((.4,.63),(-.3,.63),PURPLE),((-.4,-.63),(.3,-.63),PURPLE)]:
    ax.annotate('',xy,xytext,arrowprops=dict(arrowstyle='-|>',color=color,lw=1.5))
ax.text(1,0,'+x',va='center');ax.text(0,1,'+z',ha='center')
ax.text(0,-1.15,'Positive component directions shown\n(reverse arrows for negative components)',ha='center',fontsize=10)
ax.set(xlim=(-1.3,1.3),ylim=(-1.35,1.2),aspect='equal',title='Stress element · tensor convention');ax.axis('off')
ax=axs[1];t=np.linspace(0,2*np.pi,361)
ax.plot(centre+radius*np.cos(t),radius*np.sin(t),color=BLUE,lw=2)
ax.scatter([sigma_x,sigma_z],[tensor_shear,-tensor_shear],color=PURPLE,label='Original orthogonal faces')
ax.plot([centre,sigma_x],[0,tensor_shear],color=PURPLE,ls='--')
ax.scatter([Sp[0,0]],[Sp[0,1]],color=ORANGE,s=60,label=f'Rotated x-face, φ = {physical_angle_deg:g}°')
ax.scatter(principal,[0,0],color=GREEN,label='In-plane principal stresses')
ax.axhline(0,color='#576c80',lw=.8);ax.axvline(0,color='#576c80',lw=.8)
ax.set(xlabel='Normal stress σ (MPa)',ylabel='Tensor shear τ (MPa), positive up',aspect='equal',title='Mohr circle · circle angle = −2φ')
ax.legend(loc='upper center',bbox_to_anchor=(.5,-.18),fontsize=9)
print(f'In-plane σ1 = {principal[1]:.6f} MPa; σ2 = {principal[0]:.6f} MPa')
print(f'In-plane τmax = {radius:.6f} MPa; absolute 3-D τmax = {(p3[-1]-p3[0])/2:.6f} MPa')
print('Rotated tensor (MPa):\n',Sp)
assert np.allclose(np.trace(Sp),np.trace(S)) and np.allclose(np.linalg.det(Sp),np.linalg.det(S))
print('Check passed: trace and determinant are unchanged by rotation.')
plt.show()
''')

md(r'''## 2. Keep the beam and stress signs consistent

| Quantity | Positive direction or meaning |
|---|---|
| x | Left to right along the beam |
| z | Upward from the neutral axis |
| P, R, v | Downward force, reaction or displacement |
| C, θ = dv/dx | Clockwise external couple or slope |
| Internal M | Sagging; σₓ = −Mz/I and v″ = −M/(EI) |
| Internal V | V = dM/dx; dV/dx = −q |
| Tensor τₓz for the solid rectangle | −VQ/(Ib_local), when z is upward |

The app’s positive internal-shear readout VQ/(Ib_local) is **not** positive tensor τₓz with z upward. The minus sign above connects them. A support couple acts on the complete beam; an internal moment acts on a chosen cut face. Their numerical signs are not interchangeable.

## 3. What is virtual, and what is a unit load?

A **real system** contains the real loads and their real elastic deformation. An **auxiliary virtual-force system** is a separate equilibrium problem on the same structure, used to extract one selected displacement. It is not an additional physical load applied to the actual beam.

| Wanted result | Auxiliary action | Work-conjugate pair |
|---|---|---|
| Downward displacement at B | Downward test force at B | Force × displacement |
| Clockwise rotation at B | Clockwise test couple at B | Couple × rotation |

In the **virtual-displacement principle**, the real equilibrated forces do work through an arbitrary small imagined displacement compatible with the supports. Internal and external virtual work agree. The **virtual-force/unit-load method** uses a separate equilibrated force system and the real elastic deformation to extract a chosen motion. These are related uses of virtual work, not instructions to apply an extra physical force.

For the virtual-force calculation, first choose a nonzero test force Q̄, find its internal moment M̄ and use virtual work:

$$\bar Q\,v_B=\int_0^L\frac{M(x)\bar M(x)}{EI(x)}\,dx.$$

Define the **normalized** virtual moment mᵥ = M̄/Q̄. Choosing Q̄ = 1 N is convenient, but the normalization matters for units:

$$\boxed{v_B=\int_0^L\frac{M m_v}{EI}\,dx},\qquad
\boxed{\theta_B=\int_0^L\frac{M m_\theta}{EI}\,dx}.$$

Here mᵥ has units mm; mθ is dimensionless because it is moment per test couple. The first integral gives mm; the second gives radians (dimensionless). Reversing the test action reverses the positive measurement direction. Supports in the real and auxiliary systems must match; a release used for the force method is explicitly defined in Section 5.

**Why no 1/2?** Real strain energy U = ∫M²/(2EI) dx contains 1/2 because a real load ramps from zero. Virtual work is the mixed product of a virtual force field and the real strain field, not the work of ramping two real loads together. Adding 1/2 here halves the answer incorrectly.

The bending-only expression assumes a slender Euler–Bernoulli beam and negligible axial, shear-deformation and torsional contributions. Seeing a shear stress on a cross-section does not mean this beam model includes shear deformation.
''')

md(r'''## 4. Warm-up — measure one cantilever displacement

For a cantilever fixed at A, a downward point force P acts at x = a. Find the displacement at the free end B. Its real and normalized virtual moments are:

$$M_0(x)=\begin{cases}-P(a-x),&0\le x<a,\\0,&a<x\le L,\end{cases}
\qquad m_v(x)=-(L-x).$$

The auxiliary force is at **B**, not necessarily where the real load acts. Split integration at a because the real moment formula changes there:

$$v_B^{(0)}=\frac{P}{EI}\int_0^a(a-x)(L-x)\,dx
=\frac{Pa^2(3L-a)}{6EI}.$$

**Checkpoint:** at a = L this becomes PL³/(3EI). If the real load reverses, the displacement reverses. If E doubles, displacement halves. These are checks, not substitute derivations.
''')

code(r'''#@title Baseline inputs — exactly the Lecture 03 fixed–fixed example
L=450.0 #@param {type:"number"}
b=20.0 #@param {type:"number"}
h=10.0 #@param {type:"number"}
E=2000.0 #@param {type:"number"}
P=2.0 #@param {type:"number"}
load_station_fraction=0.5 #@param {type:"number"}
a=L*load_station_fraction
study=force_solution(L,E,b,h,P,a)
I,EI=study['I'],study['EI']
print(f'I = {I:.6f} mm^4; EI = {EI:.6f} N mm^2')
print(f'Released cantilever: vB = {study["delta"][0]:.8f} mm; θB = {study["delta"][1]:.8f} rad')
assert np.allclose(study['delta'],[P*a*a*(3*L-a)/(6*EI),P*a*a/(2*EI)])
''')

md(r'''## 5. Solve the statically indeterminate beam from Lecture 03

### 5.1 Original physical system and its free body

Both ends are fixed. The four transverse reactions are Rₐ, Cₐ, Rᵦ, Cᵦ. There are only two independent transverse equilibrium equations, so the model is indeterminate to degree two. The separate axial redundancy is outside this transverse model.

$$R_A+R_B+P=0,\qquad C_A+C_B+R_B L+Pa=0.$$

The original boundary conditions are v(0) = θ(0) = v(L) = θ(L) = 0. In the drawings, **physical support symbols and replacement reactions are in separate panels**.
''')

code(r'''#@title Physical system first; then a separate solved free-body diagram
fig,axs=plt.subplots(2,1,figsize=(10,5.5),layout='constrained')
beam_picture(axs[0],'Physical beam · two clamps · real load only',L,a,P,both=True)
beam_picture(axs[1],'Free body · clamps removed and replaced by solved reactions',L,a,P,fbd=study)
plt.show()
''')

md(r'''### 5.2 Release the B clamp, not the whole structure

Keep A fixed. Remove the B vertical restraint and rotation restraint. The **primary structure** is now a stable cantilever. Define two signed redundants that will restore the removed restraint actions:

$$X_1=R_B\quad(\mathrm{N},\ \downarrow+),\qquad
X_2=C_B\quad(\mathrm{N\,mm},\ \mathrm{CW}+).$$

Solve three separate primary-structure cases: real P alone, a 1 N downward force at B, and a 1 N mm clockwise couple at B. Do not leave either real clamp at B in these auxiliary cases: it would prevent the very motion we need to measure.

$$m_1(x)=-(L-x),\qquad m_2(x)=-1,\qquad
M(x)=M_0(x)+R_Bm_1(x)+C_Bm_2(x).$$

**Why m₂ = −1?** A clockwise end test couple requires a counter-clockwise root reaction couple. The constant internal moment before the free-end couple is negative in the sagging-positive convention.
''')

code(r'''#@title Three released cases — no B clamp in any panel
fig,axs=plt.subplots(3,1,figsize=(10,7),layout='constrained')
beam_picture(axs[0],'Case 0 · real load P',L,a,P)
beam_picture(axs[1],'Case 1 · virtual test force at B',L,unit='force')
beam_picture(axs[2],'Case 2 · virtual test couple at B',L,unit='couple')
plt.show()
''')

code(r'''#@title Moment fields — normalized auxiliary fields have different units
x=np.linspace(0,L,601)
fields=[-P*np.maximum(a-x,0),-(L-x),-np.ones_like(x)]
titles=['Real primary moment M0 (N mm)','m1 = moment / unit force (mm)',
        'm2 = moment / unit couple (dimensionless)']
fig,axs=plt.subplots(3,1,figsize=(10,7),layout='constrained')
for ax,y,title,color in zip(axs,fields,titles,[PURPLE,BLUE,ORANGE]):
    ax.plot(x,y,color=color,lw=2);ax.fill_between(x,0,y,color=color,alpha=.1)
    ax.axhline(0,color='#6c7e8d',lw=.8);ax.axvline(a,color='#6c7e8d',ls=':')
    ax.set(title=title,xlabel='Station x (mm)')
plt.show()
''')

md(r'''### 5.3 Build the flexibility coefficients

Let δᵢ⁽⁰⁾ be the displacement/rotation of the released structure at coordinate i due to the real load alone. Let fᵢⱼ measure motion at i per generalized force j:

$$\delta_i^{(0)}=\int_0^L\frac{m_iM_0}{EI}\,dx,\qquad
f_{ij}=\int_0^L\frac{m_i m_j}{EI}\,dx.$$

For constant EI, direct polynomial integration gives:

$$\boldsymbol\delta^{(0)}=
\begin{bmatrix}Pa^2(3L-a)/(6EI)\\Pa^2/(2EI)\end{bmatrix},\qquad
\mathbf F=\frac{1}{EI}\begin{bmatrix}L^3/3&L^2/2\\L^2/2&L\end{bmatrix}.$$

| Coefficient | Physical meaning | Units |
|---|---|---|
| f₁₁ | Downward B displacement per downward B force | mm/N |
| f₁₂ | Downward B displacement per clockwise B couple | 1/N |
| f₂₁ | Clockwise B rotation per downward B force | 1/N |
| f₂₂ | Clockwise B rotation per clockwise B couple | 1/(N mm) |

The equal cross terms express reciprocal work for this linear elastic model. F is not a table of numbers all sharing the same units: its rows and columns refer to different work-conjugate quantities.

### 5.4 Restore the original support conditions

At the original B clamp both motions must be zero:

$$\boxed{\boldsymbol\delta^{(0)}+\mathbf F
\begin{bmatrix}R_B\\C_B\end{bmatrix}=\begin{bmatrix}0\\0\end{bmatrix}.}$$

For the baseline EI = 3,333,333.333 N mm²:

$$5.6953125+9.1125R_B+0.030375C_B=0\quad(\mathrm{mm}),$$
$$0.0151875+0.030375R_B+0.000135C_B=0\quad(\mathrm{rad}).$$

The numerical coefficients carry the units in the table. These equations are **compatibility**, not two more force balances. Solve them first, then use equilibrium to recover A. The following cell computes the integrals, rather than assigning the standard reaction answers.
''')

code(r'''#@title Solve the two compatibility equations and recover the root reactions
print('δ0 =',study['delta'])
print('Flexibility F (row/column units listed above):\n',study['F'])
for key,unit in [('RA','N'),('RB','N'),('CA','N mm'),('CB','N mm')]:
    print(f'{key} = {study[key]:+.8f} {unit}')
print('Compatibility residual [mm, rad] =',study['compatibility'])
force_balance=study['RA']+study['RB']+P
moment_balance=study['CA']+study['CB']+study['RB']*L+P*a
print(f'Equilibrium residuals: {force_balance:.3e} N; {moment_balance:.3e} N mm')
assert np.allclose(study['compatibility'],0,atol=1e-10)
assert abs(force_balance)<1e-10 and abs(moment_balance)<1e-8
if abs(a-L/2)<1e-12:
    assert np.allclose([study['RA'],study['RB'],study['CA'],study['CB']],[-P/2,-P/2,-P*L/8,P*L/8])
print('Negative R means upward. Negative external C means counter-clockwise.')
''')

md(r'''### 5.5 Read the answer physically

For the 2 N centre-load baseline: Rₐ = Rᵦ = −1 N, Cₐ = −112.5 N mm, Cᵦ = +112.5 N mm. Both **internal** end moments are −112.5 N mm. The centre internal moment is +112.5 N mm. The right support’s external clockwise couple and its internal end moment have opposite signs.

The primary cantilever alone would move B down by 5.6953125 mm. The redundant upward force moves it up; the clockwise couple contributes downward displacement. Their signed sum is zero. Cancelling B displacement alone would not enforce B rotation; both equations are needed.

At constant uniform EI, multiplying E or the entire I by a common factor scales every flexibility and load-only displacement equally. Those factors cancel in the reaction solve; the deflection still changes. This cancellation is not generally true for nonuniform stiffness or imposed support settlements.
''')

code(r'''#@title Superpose the deformations, then inspect the final V, M and displacement
v0=cantilever_shape(x,L,a,P,EI)
vR=study['RB']*x*x*(3*L-x)/(6*EI)
vC=study['CB']*x*x/(2*EI)
vfinal=v0+vR+vC
fig,axs=plt.subplots(2,2,figsize=(11,7),layout='constrained')
ax=axs[0,0]
for y,label,color in [(v0,'Real P on released beam',PURPLE),(vR,'R_B contribution',BLUE),
                       (vC,'C_B contribution',ORANGE),(vfinal,'Final restrained beam',GREEN)]:
    ax.plot(x,y,label=label,color=color,lw=2)
ax.set(xlabel='x (mm)',ylabel='Downward displacement (mm)',title='Signed contributions, not physical stages')
ax.legend(fontsize=8)
axs[0,1].plot(x,beam_moment(x,study),color=BLUE,lw=2)
axs[0,1].set(xlabel='x (mm)',ylabel='Sagging M (N mm)',title='Reconstructed internal bending moment')
# Duplicate the force station to draw the actual jump, not a smeared diagonal.
xs=np.array([0,a,a,L]);Vs=np.array([-study['RA'],-study['RA'],-study['RA']-P,-study['RA']-P])
axs[1,0].plot(xs,Vs,color=PURPLE,lw=2)
axs[1,0].set(xlabel='x (mm)',ylabel='Internal V (N)',title='Point force creates a shear jump')
axs[1,1].plot(x,vfinal,color=GREEN,lw=2)
axs[1,1].set(xlabel='x (mm)',ylabel='Downward v (mm)',title='Final displacement · numerical axis scale')
for ax in axs.flat: ax.axhline(0,color='#7d8a96',lw=.7)
if abs(a-L/2)<1e-12:
    assert np.isclose(beam_displacement(L/2,study),P*L**3/(192*EI))
print(f'Centre displacement = {beam_displacement(L/2,study):.8f} mm')
print('Baseline maximum = 0.284765625 mm downward at midspan; end displacement and slope are zero.')
plt.show()
''')

md(r'''## 6. Connect the solved beam back to Mohr’s circle

Choose **one station and one fibre**, away from the concentrated load/support contact. For a solid rectangular section:

$$\sigma_x(x,z)=-\frac{M(x)z}{I},\qquad
\tau_{xz}(x,z)=-\frac{3V(x)}{2bh}\left[1-\left(\frac{2z}{h}\right)^2\right],\qquad\sigma_z\approx0.$$

The top/bottom surfaces have zero transverse shear; the neutral axis has zero bending normal stress. This explains why their independent maxima must not be put into a single Mohr circle. At a point-force jump, explicitly choose x⁻ or x⁺; no finite distance separates those mathematical limits. These are nominal beam stresses, not local contact stresses or a failure prediction.
''')

code(r'''#@title One material point on the solved beam — x/L and z/h are editable
probe_x_fraction=0.16666666666666666 #@param {type:"number"}
probe_z_fraction=0.25 #@param {type:"number"}
probe_side='right' #@param ["left","right"]
xp,zp=L*probe_x_fraction,h*probe_z_fraction
if not (0<xp<L and abs(zp)<=h/2): raise ValueError('Choose an interior station and a fibre within the section.')
include=P if (xp>a or (np.isclose(xp,a,atol=1e-10,rtol=0) and probe_side=='right')) else 0.
Vp=-study['RA']-include;Mp=float(beam_moment(xp,study))
sx=-Mp*zp/I;txz=-1.5*Vp/(b*h)*(1-(2*zp/h)**2)
pointS=np.array([[sx,txz],[txz,0.]])
eig=np.linalg.eigvalsh(pointS);cc=sx/2;rr=np.hypot(sx/2,txz)
fig,axs=plt.subplots(1,2,figsize=(10,4.3),layout='constrained')
ax=axs[0];ax.add_patch(Rectangle((-b/2,-h/2),b,h,facecolor='#eaf3fb',edgecolor=BLUE,lw=2))
ax.axhline(0,color='#6c7e8d',ls='--');ax.scatter([0],[zp],color=ORANGE,s=70,zorder=3)
ax.annotate(f'Probe z = {zp:.3g} mm',(0,zp),(b*.1,h*.65),arrowprops=dict(arrowstyle='->'),ha='center')
ax.set(xlim=(-b*.7,b*.7),ylim=(-h*.65,h*.95),xlabel='Width coordinate (mm)',ylabel='z upward (mm)',title=f'Section at x = {xp:.3g} mm',aspect='equal')
tt=np.linspace(0,2*np.pi,300);ax=axs[1]
ax.plot(cc+rr*np.cos(tt),rr*np.sin(tt),color=BLUE)
ax.scatter([sx,0],[txz,-txz],color=PURPLE,label='Two orthogonal faces at same point')
ax.scatter(eig,[0,0],color=GREEN,label='In-plane principal stresses')
ax.axhline(0,color='#7d8a96',lw=.8)
ax.set(xlabel='σ (MPa)',ylabel='Tensor τ (MPa), positive up',aspect='equal',title='Local stress circle, not section maxima');ax.legend(fontsize=8,loc='upper center',bbox_to_anchor=(.5,-.18))
print(f'M = {Mp:+.7f} N mm, V = {Vp:+.7f} N; σx = {sx:+.7f} MPa; tensor τxz = {txz:+.7f} MPa')
print(f'In-plane principal stresses: {eig[1]:+.7f}, {eig[0]:+.7f} MPa')
print('Strength status: NOT CHECKED — no material allowable or failure criterion has been specified here.')
plt.show()
''')

md(r'''## 7. What does the software actually solve?

### 7.1 Main solution: direct stiffness, not a lookup formula

Beam Virtual Lab uses cubic Hermite **Euler–Bernoulli finite elements**. A continuous beam node has two transverse degrees of freedom: downward displacement v and clockwise slope θ. A grounded interior pin/roller sets v = 0 but does not cut the beam; an internal hinge instead releases moment and permits a slope jump. This example has no internal hinge and no axial DOF.

For a prismatic element of length ℓ, its local displacement vector and stiffness are:

$$\mathbf u_e=[v_i,\theta_i,v_j,\theta_j]^T,\qquad
\mathbf k_e=\frac{EI}{\ell^3}
\begin{bmatrix}
12&6\ell&-12&6\ell\\
6\ell&4\ell^2&-6\ell&2\ell^2\\
-12&-6\ell&12&-6\ell\\
6\ell&2\ell^2&-6\ell&4\ell^2
\end{bmatrix}.$$

This matrix comes from virtual work: approximate v using the four Hermite shape functions, insert the curvature into internal virtual work, and integrate EI times the product of the shape-function second derivatives. Although v″ = −M/EI under our moment convention, the two minus signs cancel in the stiffness product. The result has the same mechanics as the flexibility calculation, but solves for nodal motions instead of redundant reactions.

For any admissible virtual displacement δv, with δv and δθ zero wherever the corresponding real motion is prescribed, the beam weak form is:

$$\int_0^L EI\,v''\,\delta v''\,dx
=\int_0^L q\,\delta v\,dx+\sum_i P_i\,\delta v(x_i)+\sum_j C_j\,\delta\theta(x_j).$$

Putting v = N u and δv = N δu into this identity gives kₑ = ∫ EI N″ᵀ N″ dx and the consistent load vector. Thus the stiffness matrix is not an unrelated numerical trick: it is a finite-dimensional statement of virtual work. δ here means a test variation, not the load-only displacement vector δ⁽⁰⁾ used in the force method.

| Stage | What is calculated |
|---|---|
| Model and mesh | Section I and EI; load, support and hinge stations become mesh nodes |
| Assemble | Add element stiffnesses and consistent nodal loads into K and f |
| Constrain | Prescribe clamped v and θ; solve Kff uf = ff − Kfc uc |
| Reactions | Use the original, unmodified equations: r = Ku − f |
| Recover results | Reconstruct V and M from equilibrium; evaluate displacement, stress and strain |
| Interpret | Check units, residuals, mesh sensitivity and model assumptions before accepting a result |

For this point-load study, the point is a mesh node and no distributed-load quadrature is needed. The app’s other load types require consistent integration; nodal loads are not an excuse to replace a curved distribution by an arbitrary point load.

### 7.2 Force-method explanation: a second route, not a different physical model

The app’s `BeamLearningEngine.forceMethod` releases redundant restraints, solves real-load and unit-action cases **with the same FE assembly**, builds a flexibility matrix and compares recovered redundants with the direct-stiffness reactions. Its redundant order may be [Cᵦ, Rᵦ], while this notebook uses [Rᵦ, Cᵦ]. Reorder the coordinates and units before comparing matrices. It is an explanatory consistency check, not an independently validated second software solver.

Below, a transparent NumPy implementation is checked against the independently integrated force method. It does **not** call the app or assign its reaction answers.
''')

code(r'''#@title Transparent direct-stiffness implementation — all matrices are visible
def hermite(t,ell):
    return np.array([1-3*t*t+2*t**3,ell*(t-2*t*t+t**3),3*t*t-2*t**3,ell*(-t*t+t**3)])

def fe_solution(L,EI,P,a,requested=10):
    if requested<2: raise ValueError('Use at least two requested elements.')
    nodes=np.linspace(0,L,int(requested)+1)
    nearest=np.argmin(abs(nodes-a))
    if abs(nodes[nearest]-a)<L*1e-12: nodes[nearest]=a
    else: nodes=np.sort(np.r_[nodes,a])
    K=np.zeros((2*len(nodes),2*len(nodes))); f=np.zeros(2*len(nodes))
    for j,ell in enumerate(np.diff(nodes)):
        ke=EI/ell**3*np.array([[12,6*ell,-12,6*ell],
            [6*ell,4*ell**2,-6*ell,2*ell**2],[-12,-6*ell,12,-6*ell],
            [6*ell,2*ell**2,-6*ell,4*ell**2]])
        dofs=np.arange(2*j,2*j+4);K[np.ix_(dofs,dofs)]+=ke
    f[2*np.argmin(abs(nodes-a))]=P
    fixed=np.array([0,1,len(f)-2,len(f)-1]);free=np.setdiff1d(np.arange(len(f)),fixed)
    u=np.zeros_like(f);u[free]=np.linalg.solve(K[np.ix_(free,free)],f[free])
    reactions=K@u-f
    def evaluate(xx):
        values=[]
        for xp in np.atleast_1d(xx):
            j=min(len(nodes)-2,max(0,np.searchsorted(nodes,xp,side='right')-1))
            ell=nodes[j+1]-nodes[j];t=(xp-nodes[j])/ell
            values.append(hermite(t,ell)@u[2*j:2*j+4])
        return np.array(values)
    return dict(nodes=nodes,K=K,f=f,u=u,r=reactions,free=free,fixed=fixed,
                evaluate=evaluate,energy=.5*u@K@u)

fe=fe_solution(L,EI,P,a,10)
force_reactions=np.array([study['RA'],study['CA'],study['RB'],study['CB']])
print('              RA (N)      CA (N mm)      RB (N)      CB (N mm)')
print('Force method',force_reactions)
print('Direct FE   ',fe['r'][fe['fixed']])
assert np.allclose(fe['r'][fe['fixed']],force_reactions,rtol=1e-8,atol=1e-7)
assert np.allclose(fe['evaluate'](x),beam_displacement(x,study),rtol=1e-8,atol=1e-9)
print(f'FE residual at free DOFs: {max(abs((fe["K"]@fe["u"]-fe["f"])[fe["free"]])):.3e}')
print('The residual contains force and couple equations; interpret each with its units.')
''')

code(r'''#@title A small FE mesh and the unit-action compatibility idea
fig,axs=plt.subplots(2,1,figsize=(10,5.5),layout='constrained')
beam_picture(axs[0],'Original model · load station must be a node',L,a,P,both=True)
for j,xx in enumerate([0,a,L]):
    axs[0].scatter(xx/L,0,s=65,facecolor='white',edgecolor=BLUE,zorder=4)
    axs[0].text(xx/L,-.16 if j==1 else .18,f'Node {j+1}',ha='center',fontsize=10)
axs[1].axis('off')
axs[1].text(.03,.88,'2-element teaching mesh → 3 nodes → 6 transverse DOFs',fontsize=13,weight='bold')
axs[1].text(.03,.61,'u = [vA, θA, vC, θC, vB, θB]ᵀ\nClamps prescribe vA = θA = vB = θB = 0.',fontsize=12)
axs[1].text(.03,.22,'Direct stiffness: solve the free motions, then recover support reactions.\nForce method: release two constraints, then solve the two reactions that restore them.',fontsize=12,color=BLUE)
plt.show()
''')

md(r'''### 7.3 Verification is more than a small residual

For this constant-EI point-load example, the exact displacement is piecewise cubic between load stations. Hermite elements can represent it exactly once the load station is inserted. Thus 10, 30 and 40 elements should agree to floating-point precision; do **not** invent a smooth convergence trend. Roundoff can grow for an unnecessarily fine, poorly scaled system. Other loads or variable stiffness can show actual discretization error.

The independent energy check is:

$$U=\int_0^L\frac{M^2}{2EI}\,dx=\frac12\mathbf u^T\mathbf K\mathbf u
=\frac12 P v(a).$$

Fixed supports do no work because their prescribed motions are zero. This is real strain energy and therefore does have 1/2; the earlier virtual-work displacement formula does not.
''')

code(r'''#@title Mesh, equilibrium, compatibility and energy checks
U=gauss_integral(lambda xx:beam_moment(xx,study)**2/(2*EI),[0,a,L])
external_energy=.5*P*float(beam_displacement(a,study))
print('Elements requested | actual | max |vFE-vforce| (mm) | |RB error| (N)')
for requested in [2,10,30,40]:
    trial=fe_solution(L,EI,P,a,requested)
    error=max(abs(trial['evaluate'](x)-beam_displacement(x,study)))
    print(f'{requested:18d} | {len(trial["nodes"])-1:6d} | {error:22.4e} | {abs(trial["r"][-2]-study["RB"]):.4e}')
    assert error<1e-7 and abs(trial['r'][-2]-study['RB'])<1e-6
print(f'U by moment integration = {U:.10f} N mm')
print(f'U by FE matrix          = {fe["energy"]:.10f} N mm')
print(f'Half P v(a)             = {external_energy:.10f} N mm')
assert np.allclose([U,fe['energy']],external_energy,rtol=1e-8,atol=1e-10)
print('PASS under the shared ideal-beam assumptions; this is not experimental validation.')
''')

md('''### 7.4 Reproduce the study in Beam Virtual Lab

1. [Open the exact Lecture 03 fixed–fixed study]('''+APP+'''). This link intentionally replaces the current study with the lecture inputs and solves it. Save any existing work first.
2. Verify L = 450 mm, E = 2000 MPa, solid rectangle b = 20 mm and h = 10 mm; two end clamps; one downward 2 N point load at x = 225 mm; self-weight off. The generic workspace normally opens without applied loads/supports; this is an explicit teaching example.
3. In **Solution**, compare signed reactions, the free body and compatibility explanation. Find −1 N, −112.5 N mm at A and −1 N, +112.5 N mm at B. Do not compare external couples with internal end moments without checking cut faces.
4. Compare v(225 mm) = 0.284765625 mm and θ at both clamps = 0. In **Cut & section**, inspect a station away from a jump. In the results’ Mohr-circle panel, choose the same x, side and fibre z as the notebook; select a homogeneous rectangular section and confirm the tensor-shear convention.
5. Repeat with 10, 30 and 40 requested elements. Record actual node placement and results, not just the requested count. A small difference alone is not evidence of better physics.
6. Save the study JSON and a chart PNG; use chart CSV when you want numerical samples. State which method independently checked each result.

**Model limits:** static, straight, slender, prismatic, small-displacement, linear-elastic bending; ideal supports; no local support/contact stresses, transverse-shear deflection, plastic collapse, post-buckling or fracture prediction. Mohr’s circle transforms a stress state; it is not a material failure test by itself.
''')

md(r'''## 8. Predict, change one input, verify

Before running the next cell, predict what happens to the reactions and centre displacement when: P doubles; E doubles; h doubles. Then move the real force away from the centre. Symmetry should no longer be used to assign equal reactions.

For this particular constant-EI fixed–fixed point-load problem, an independent closed-form reaction check is:

$$R_B=-\frac{Pa^2(3L-2a)}{L^3},\quad
C_B=\frac{Pa^2(L-a)}{L^2},\quad
C_A=-\frac{Pa(L-a)^2}{L^2}.$$

These expressions are verification targets, not the algorithm used to solve the compatibility equations.
''')

code(r'''#@title Parameter audit — each row is an explicitly changed physical model
print('Case                 RA (N)    RB (N)    CA (N mm)   CB (N mm)   v(mid) (mm)')
for label,pp,ee,hh,aa in [('Baseline',P,E,h,a),('Double load',2*P,E,h,a),
                        ('Double E',P,2*E,h,a),('Double h',P,E,2*h,a),
                        ('Off-centre at 0.3L',P,E,h,.3*L),('Reverse load',-P,E,h,a)]:
    s=force_solution(L,ee,b,hh,pp,aa)
    target=np.array([-pp+pp*aa**2*(3*L-2*aa)/L**3,
                     -pp*aa*(L-aa)**2/L**2,
                     -pp*aa**2*(3*L-2*aa)/L**3,pp*aa**2*(L-aa)/L**2])
    assert np.allclose([s['RA'],s['CA'],s['RB'],s['CB']],target)
    print(f'{label:21s}{s["RA"]:9.4f}{s["RB"]:10.4f}{s["CA"]:13.4f}{s["CB"]:13.4f}{float(beam_displacement(L/2,s)):14.7f}')
print('Doubling h multiplies I by 8; deflection is divided by 8, not by 2.')
''')

md(r'''## 9. Exit ticket — explain the mechanics, not only the number

Submit or discuss the following evidence as directed in class:

1. A Mohr circle with its shear-axis convention, stress tensor, principal values and a statement of the material point represented.
2. Three clearly separated primary-structure drawings: the real-load case, unit-force case and unit-couple case. Label the **measurement coordinate** and its positive direction.
3. The two flexibility equations, their units, and the recovered support reactions. Demonstrate one equilibrium check and one compatibility check.
4. One sentence explaining why the app solves K u = f while the force method solves F X = −δ⁽⁰⁾. Identify which checks share an implementation and which are independent.
5. One prediction and one observed trend after changing E, h or the load station; include a model limitation.

**Reasoning prompts:** Why is a unit force at a fixed point on the unreleased beam not useful for finding that redundant reaction? Why does a rotation query require a couple? Why is symmetry insufficient after moving the force? Why can the shear stress be nonzero even though the solver neglects shear deformation?

### Optional extension — other forms of virtual work

For a linear axial truss with a fixed active member set, virtual work gives a joint displacement from Σ Nᵢ nᵢ Lᵢ/(Eᵢ Aᵢ), with nᵢ the axial force per virtual test force. For a wing with bending, torsion or axial stretch, corresponding work-conjugate terms must be included. The beam’s bending-only integral does not automatically represent all of them. Tension-only wires can change active/slack status; do not apply linear superposition across different active sets. These extensions are outside today’s worked beam.

### Reading and attribution

The calculations and illustrations in this notebook are original course teaching material. The declared dimensions and modulus are illustrative, not measured printed-wing properties. Supporting reading:

- [TU Delft — Euler–Bernoulli beam weak form and Hermite elements](https://teachbooks.tudelft.nl/computational-modelling/structural_linear/euler_bernouilli.html).
- [René Alderliesten / TU Delft Open — virtual-work and unit-load formulation](https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Introduction_to_Aerospace_Structures_and_Materials_(Alderliesten)/03%3A_Analysis_of_Statically_Indeterminate_Structures/08%3A_Deflections_of_Structures-_Work-Energy_Methods/8.01%3A_Virtual_Work_Method).
- [David Roylance / MIT OpenCourseWare — stress tensor transformations and Mohr’s circle](https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Mechanics_of_Materials_(Roylance)/03%3A_General_Concepts_of_Stress_and_Strain/3.03%3A_Tensor_Transformations).
- Course implementation: `computational/printed-wing-solver/web/beam_learning_engine.js`, particularly `assemble`, `solve`, `forceMethod`, `internalForces` and `fieldAt`. Source details and implementation checks are not a substitute for validating a real structure.
''')

def build():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import markdown
    import nbformat
    env = {}
    preview=ROOT/'tmp'/'lecture04-previews';preview.mkdir(parents=True,exist_ok=True)
    count=0;figcount=0
    for c in cells:
        if c['cell_type']!='code': continue
        count+=1;out=io.StringIO()
        # Capture the figures when students' plt.show() executes, including on Agg.
        captured=[]
        def capture_show(*args,**kwargs):
            for number in plt.get_fignums():
                buffer=io.BytesIO();plt.figure(number).savefig(buffer,format='png',bbox_inches='tight')
                captured.append(buffer.getvalue())
            plt.close('all')
        plt.show=capture_show
        with contextlib.redirect_stdout(out):exec(compile(c['source'],NAME,'exec'),env)
        if out.getvalue():c['outputs'].append(dict(output_type='stream',name='stdout',text=out.getvalue()))
        for raw in captured:
            figcount+=1;(preview/f'figure-{figcount:02d}.png').write_bytes(raw)
            c['outputs'].append(dict(output_type='display_data',data={'image/png':base64.b64encode(raw).decode(),
                'text/plain':f'Lecture 04 teaching figure {figcount}'},metadata={}))
        c['execution_count']=count
    nb=dict(nbformat=4,nbformat_minor=5,cells=cells,metadata={
        'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},
        'language_info':{'name':'python','version':'3.12'},
        'colab':{'name':NAME,'provenance':[],'toc_visible':True}})
    nbformat.validate(nbformat.from_dict(nb))
    (ROOT/'notebooks'/NAME).write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    # Protect TeX before Markdown interprets underscores or matrix backslashes.
    def render_markdown(text):
        expressions=[]
        def hide(match):
            expressions.append(match.group());return f'MATHBLOCKTOKEN{len(expressions)-1}END'
        rendered=markdown.markdown(re.sub(r'\$\$.*?\$\$',hide,text,flags=re.S),extensions=['tables','fenced_code'])
        for i,value in enumerate(expressions):rendered=rendered.replace(f'MATHBLOCKTOKEN{i}END',html.escape(value))
        return rendered
    body=[]
    for c in cells:
        if c['cell_type']=='markdown':body.append('<section>'+render_markdown(c['source'])+'</section>')
        else:
            body.append('<details class="code"><summary>Executable Python · expand to inspect or copy</summary><pre><code>'+html.escape(c['source'])+'</code></pre></details>')
            for o in c['outputs']:
                if o['output_type']=='stream':body.append('<pre class="result">'+html.escape(o['text'])+'</pre>')
                elif 'image/png' in o.get('data',{}):body.append('<figure><img alt="'+html.escape(o['data']['text/plain'])+'" src="data:image/png;base64,'+o['data']['image/png']+'"></figure>')
    style='''body{margin:0;background:#edf3f8;color:#172e43;font:17px/1.7 system-ui,sans-serif}main{max-width:1050px;margin:28px auto;padding:32px 48px;background:white;border:1px solid #cfdfeb;border-radius:16px}h1,h2,h3{line-height:1.25;color:#124e7c}h2{margin-top:1.8em}h3{margin-top:1.6em}a{color:#0866ac}table{border-collapse:collapse;width:100%;font-size:.92em}th,td{border-bottom:1px solid #d3e1ec;padding:10px;text-align:left}th{background:#edf5fc}figure{margin:28px 0}img{width:100%;height:auto}pre{overflow:auto;padding:16px;border-radius:9px;font-size:13px;line-height:1.5}.result{background:#f0f7f4;border-left:4px solid #0c7752}.code{background:#f4f7fb;padding:10px 16px;border-radius:9px;margin:20px 0}summary{cursor:pointer;font-weight:600;color:#315f83}mjx-container{overflow-x:auto;overflow-y:hidden;padding:6px 0}nav{display:flex;gap:20px;flex-wrap:wrap;font-size:15px}.topnote{padding:14px;background:#edf5fc;border-radius:10px}@media(max-width:700px){main{margin:8px;padding:20px;font-size:16px}table{display:block;overflow:auto}}@media print{body{background:white}main{border:0;margin:0;padding:0}.code{display:none}h2,h3{break-after:avoid}figure{break-inside:avoid}nav{display:none}}'''
    head='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MIE 446 Lecture 04 · Virtual work and unit loads</title><style>'+style+'</style>'
    head+='<script>window.MathJax={tex:{displayMath:[["$$","$$"]]},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"]}};</script><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script></head><body><main>'
    nav='<nav><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures">Course home</a><a href="'+APP+'">Open the beam example</a><a href="https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/'+NAME+'">Open Lecture 04 in Colab</a></nav><p class="topnote">Reading view with saved figures. To execute the lesson, open the Colab notebook, choose File → Save a copy in Drive, then Runtime → Run all. Equations in this HTML view need an internet connection to load MathJax; figures are embedded.</p>'
    (ROOT/'docs'/'lecture04-virtual-work.html').write_text(head+nav+''.join(body)+'</main></body></html>',encoding='utf-8')
    print(f'Built {len(cells)} cells, {count} executed code cells, {figcount} figures and HTML reading view.')
    return env

if __name__=='__main__':build()
