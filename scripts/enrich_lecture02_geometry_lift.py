"""Targeted Lecture 02 additions: preserve existing cells, IDs and student work."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
NB=ROOT/'notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb'
OUT=ROOT/'docs/assets/lecture02'
RAW='https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture02/'
OUT.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.size':12,'axes.spines.top':False,'axes.spines.right':False})
def md(ident,text):return {'cell_type':'markdown','id':ident,'metadata':{},'source':text.strip().splitlines(keepends=True)}
def code(ident,text):return {'cell_type':'code','id':ident,'metadata':{},'execution_count':None,'outputs':[],'source':text.strip().splitlines(keepends=True)}
def image(name,alt):return f'![{alt}]({RAW}{name}.png)\n\n*Original instructional model, not aircraft test data.*'

GEOMETRY=r'''### 2B. Why choose dihedral or sweep? Three disciplines, one wing

**Dihedral Γ:** upward inclination in a FRONT view. **Sweep Λ:** aft or forward inclination in a TOP view. Neither is angle of attack, wing twist, or the upward bending caused by lift. Specify the sweep reference line (LE or quarter chord).

| Choice | Aerodynamics | Flight dynamics | Structures |
|---|---|---|---|
| Positive dihedral | Changes orientation of the aerodynamic force and the response to cross-flow | Usually gives a restoring rolling response to sideslip; wing height, fuselage and sweep also contribute | Inclined members, carry-through joints and force resolution change; not automatically stronger |
| Sweepback | Can delay compressibility-related drag rise at high subsonic/transonic speeds; often reduces lift-curve slope and complicates low-speed stall | Adds effective dihedral; rolling response to sideslip interacts with yaw stability and damping | Changes load-path geometry, bending–torsion coupling and root connection design |
| Forward sweep | Can retain tip control through different spanwise-flow/stall tendencies, depending on design | Handling still depends on the complete aircraft and control system | Bending can twist the wing toward higher angle of attack: divergence risk needs stiffness and aeroelastic tailoring |

#### Dihedral: the missing causal explanation

Imagine a small **sideslip**, not merely a bank angle. Air now approaches partly from the side. On a positive-dihedral wing, that cross-flow changes the two wings' effective incidence differently, creating a lift difference and a rolling moment that tends to oppose the associated disturbance. With no sideslip, geometric dihedral alone does not sense bank angle and command wings-level flight. It is therefore misleading to say “a banked wing automatically rights itself because it has dihedral.”

More dihedral is not always better. Sweep and a high-wing configuration can already supply substantial dihedral effect; designers may use anhedral to balance lateral–directional behavior. Dutch roll is a coupled roll–yaw motion; its damping cannot be inferred from dihedral angle alone. Directional stability, roll/yaw damping and control systems also matter.

#### Sweep: why not make every wing straight?

At high speed, consider the component of freestream normal to a swept reference line:

$$\Large V_{\mathrm{normal}}\approx V\cos\Lambda\qquad M_{\mathrm{normal}}\approx M\cos\Lambda$$

This is an intuition for compressibility benefits, **not a complete swept-wing design formula**. Thickness, Mach number, Reynolds number and the three-dimensional pressure field matter. At low speed there is no free benefit: sweep can reduce lift slope, change spanwise flow and encourage tip-stall/pitch-up tendencies. Washout, airfoil selection and high-lift devices help manage those tendencies. Do not put a cosine into every aerodynamic equation indiscriminately.

#### What happens structurally?

Resolve the actual force vector, then use **M = r × F**. If the right half-wing's vertical load is F<sub>z</sub>, its spanwise lever arm y contributes yF<sub>z</sub> to root bending. An aft offset x also contributes a pitching moment about the root axes. Torsion about the local beam axis depends on the offset from the **shear centre**, not sweep angle alone.

For a schematic force F<sub>n</sub> normal to a dihedral panel: F<sub>z</sub> = F<sub>n</sub> cos Γ and the horizontal component has magnitude F<sub>n</sub> sin Γ. At fixed vertical lift, F<sub>n</sub> = F<sub>z</sub>/cos Γ. This force resolution is not a complete aerodynamic load model. With fixed projected span and the same vertical line load, the global root roll-bending moment does **not** automatically increase just because dihedral is added. Joint geometry, actual member length and internal load components still change.

**Design question:** does your proposed geometry solve a speed/handling requirement, and what stiffness, joint, stall and control penalties follow? Our printed-wing geometry experiment does not compute any of these stability derivatives or aeroelastic limits.

Sources: [NASA SP-367, Introduction to the Aerodynamics of Flight](https://appel.nasa.gov/wp-content/uploads/2018/08/NASA-SP-367-Intro-to-Aero-of-Flight.pdf) (lateral stability and swept wings); [NASA X-29 overview](https://www.nasa.gov/aeronautics/nasa-aircraft/x-29-demonstrator/) (composites and forward sweep).
'''

PHOTOS='''### 2C. Real aircraft: read the view before naming the angle

#### Bell X-5 — aft sweep and a variable-sweep mechanism

![Real Bell X-5 aircraft with aft-swept wings](https://www.nasa.gov/wp-content/uploads/2015/08/341591main_E-648_full.jpg)

*NASA/NACA photograph. Follow the wing from root toward tip: the tip is farther aft. The camera is oblique; do not measure a certified sweep angle from this photograph.* The X-5 explored in-flight sweep changes over 20–60°. Its pivot and translating assembly illustrate a structural/mechanical cost of variable sweep. [NASA source and additional photographs](https://www.nasa.gov/centers-and-facilities/armstrong/nasa-armstrong-fact-sheet-x-5-research-aircraft/).

#### Grumman X-29 — forward sweep, not negative dihedral

![Real X-29 viewed from above, showing forward-swept wings](https://www.nasa.gov/wp-content/uploads/2015/02/344054main_ec85-33297-23_full_0.jpg)

*NASA photograph, look-down view.* Trace the main wing leading edge from root to tip: the tip moves **forward**. The smaller surfaces near the nose are canards, not the main wing. Forward sweep is a planform choice; this image alone does not establish dihedral. Composite aeroelastic tailoring was central to the X-29's wing; “strong material” and “adequate torsional stiffness” are not interchangeable. [NASA photograph/source](https://www.nasa.gov/aeronautics/looking-back-at-x-29a-in-sweeping-forward/).

#### PTERA Spanwise Adaptive Wing — see the outboard inclination

![PTERA research aircraft with outer wings folded upward](https://www.nasa.gov/wp-content/uploads/2018/01/front_3_0.png)

*Photograph credited by NASA to Area-I Inc.; displayed from the official NASA article.* The outer panels are folded upward by 70° in this flight, while the inner wing remains much flatter. This is an **adaptive outer-panel configuration**, not a conventional transport wing with 70° uniform dihedral and not an example of wing bending under load. It makes the front-view distinction especially visible. [NASA source](https://www.nasa.gov/aeronautics/nasa-tests-new-alloy-to-fold-wings-in-flight/).

**Ordinary aircraft comparison:** a straight-wing light aircraft and a swept-wing transport can both have positive dihedral; sweep and dihedral are independent design variables. The next original figure uses clean views so perspective and flight deformation do not obscure the definitions.

**Photo exercise:** identify nose/tail, main wing root/tip and viewing direction in each photo. Say which angle you can identify qualitatively, and which angle you cannot measure reliably from that view.
'''

LIFT=r'''## 3. From airfoil cₗ to finite-wing Cₗ — then induced drag

### 3.1 Begin with the two different reference areas

Lecture 1 gave the **section** lift coefficient c<sub>l</sub>. A two-dimensional section uses lift per unit span L′ and its local chord c. A finite wing uses total lift L and **full-wing projected area S**:

$$\Large q=\frac{1}{2}\rho V^2$$

$$\Large c_l(y)=\frac{L'(y)}{q\,c(y)}\qquad C_L=\frac{L}{qS}$$

$$\Large L=\int_{-b/2}^{b/2}q\,c(y)c_l(y)\,dy$$

$$\Large C_L=\frac{1}{S}\int_{-b/2}^{b/2}c(y)c_l(y)\,dy$$

The wing coefficient is a **chord-weighted spanwise average**, not the section coefficient at one chosen station. In a symmetric case you may double the half-wing integral. Never use half-wing lift with full-wing area without that factor of two.

### 3.2 Why does the lift curve change?

Finite span creates a trailing vortex system and **downwash**. The local flow tilts downward, so the section sees an effective angle smaller than the geometric angle. In a simple untwisted, weakly swept, attached-flow comparison:

$$\Large \alpha_{\mathrm{effective}}\approx\alpha-\alpha_i$$

$$\Large c_l\approx a_0(\alpha_{\mathrm{effective}}-\alpha_0)\qquad \alpha_i\approx\frac{C_L}{\pi e_a AR}$$

$$\Large C_L\approx a(\alpha-\alpha_{L=0})$$

$$\Large a\approx\frac{a_0}{1+\displaystyle\frac{a_0}{\pi e_a AR}}$$

**Read it step by step:** increasing α creates lift; lift creates downwash; downwash removes some effective incidence; consequently the finite-wing lift slope a is below the isolated-section slope a₀. Substitute α<sub>i</sub> into C<sub>L</sub> ≈ a₀(α − α₀ − α<sub>i</sub>), collect the terms in C<sub>L</sub>, and divide: that gives the denominator above. As AR → ∞, a → a₀.

Angles in these equations are **radians**, and slopes are per radian. The thin-airfoil estimate a₀ = 2π is an idealization, not measured data for every NACA airfoil. Use measured/computed section slope at the relevant Reynolds and Mach numbers when available. In this comparison α<sub>L=0</sub> equals the assumed section α₀; twist, varying sections and more general loading change that result.

Thus C<sub>L</sub> depends on angle of attack, airfoil/camber and zero-lift angle, AR, planform and span loading, twist, sweep, Reynolds/Mach number, configuration and stall. The definition C<sub>L</sub> = L/(qS) always defines the coefficient; the **linear prediction** above is limited to attached flow and is not a universal formula for a highly swept/delta wing or stall.

### 3.3 Now use wing Cₗ to calculate induced drag

$$\Large C_{D,i}=\frac{C_L^2}{\pi e_i AR}$$

$$\Large D_i=qS C_{D,i}$$

e<sub>i</sub> is **induced-drag span efficiency**; ideal planar elliptical loading gives e<sub>i</sub> = 1. e<sub>a</sub> above is an approximate lift-slope correction. They are separately assumed here; they are not automatically equal, and neither is automatically a fitted whole-aircraft Oswald factor. NACA digits do not determine them.

**Two different comparisons:** (1) at fixed α, changing AR changes predicted C<sub>L</sub>; (2) at fixed lift, q and S, C<sub>L</sub> is fixed, so larger AR reduces C<sub>D,i</sub>. State which experiment you are doing. Increasing span by k at fixed S and e<sub>i</sub> reduces induced drag by 1/k²: k=1.20 gives a 30.56% reduction. This does not establish lower total drag or structural mass.

Sources: [NASA lift coefficient definition](https://www.grc.nasa.gov/www/k-12/VirtualAero/BottleRocket/airplane/liftco.html), [NASA SP-367](https://appel.nasa.gov/wp-content/uploads/2018/08/NASA-SP-367-Intro-to-Aero-of-Flight.pdf) (finite-wing downwash and lift-curve comparison), [NASA induced drag](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/).
'''

EXPERIMENT=r'''#@title 3B. Compare airfoil and wing lift, then induced drag
A0_PER_RAD = 6.283185307 #@param {type:"number"}
ZERO_LIFT_DEG = -2.0 #@param {type:"number"}
COMPARE_ALPHA_DEG = 6.0 #@param {type:"number"}
LIFT_SLOPE_EA = 0.90 #@param {type:"number"}
DRAG_SPAN_EI = 0.85 #@param {type:"number"}
if not (0 < A0_PER_RAD < 12 and 0 < LIFT_SLOPE_EA <= 1 and 0 < DRAG_SPAN_EI <= 1):
    raise ValueError("Use positive slope below 12/rad and efficiencies between 0 and 1.")
if not (-6 <= COMPARE_ALPHA_DEG <= 10 and -5 <= ZERO_LIFT_DEG <= 2):
    raise ValueError("Stay in the illustrative pre-stall angle range.")
alphas = np.linspace(-6,10,161)
section_cl = A0_PER_RAD*np.deg2rad(alphas-ZERO_LIFT_DEG)
fig, axes = plt.subplots(1,2,figsize=(12,4.7),layout="constrained")
axes[0].plot(alphas,section_cl,'k--',lw=2,label='2-D section / infinite-span limit')
CL_axis=np.linspace(0,1.2,160)
for AR_test in (4,8,12):
    slope=A0_PER_RAD/(1+A0_PER_RAD/(np.pi*LIFT_SLOPE_EA*AR_test))
    wing_cl=slope*np.deg2rad(alphas-ZERO_LIFT_DEG)
    axes[0].plot(alphas,wing_cl,lw=2,label=f'Wing AR={AR_test}')
    axes[1].plot(CL_axis,CL_axis**2/(np.pi*DRAG_SPAN_EI*AR_test),lw=2,label=f'AR={AR_test}')
    point_cl=slope*np.deg2rad(COMPARE_ALPHA_DEG-ZERO_LIFT_DEG)
    print(f'AR={AR_test}: a={slope:.4f}/rad; CL at {COMPARE_ALPHA_DEG:g} deg = {point_cl:.4f}; CDi={point_cl**2/(np.pi*DRAG_SPAN_EI*AR_test):.5f}')
    assert 0 < slope < A0_PER_RAD
axes[0].axvline(COMPARE_ALPHA_DEG,color='.6',ls=':')
axes[0].set(xlabel='Geometric angle of attack (deg)',ylabel='cl or CL',title='Same section, different finite spans\nLinear model: stall is NOT predicted')
axes[1].set(xlabel='Wing CL (not local section cl)',ylabel='Induced-drag coefficient CDi',title='Fixed CL comparison\nSeparate drag efficiency ei')
for ax in axes: ax.legend(fontsize=9); ax.grid(alpha=.2)
plt.show()
print('Left: compare at the same angle. Right: compare at the same wing CL.')
print('Virtual teaching predictions, not NACA wind-tunnel data; do not extrapolate past stall.')
'''

SIDESLIP=r'''### 2B.1. What is sideslip? Start with the air, not the runway

**Sideslip β is the sideways component of motion relative to the surrounding air.** In a top view, the aircraft nose and its air-relative velocity no longer point along the same line. The relative wind points opposite to that velocity. It is not simply a bank angle, a change in compass heading, or a difference between heading and ground track.

We use body axes x forward, y toward the aircraft's right, and z downward. If v is the rightward air-relative velocity component:

$$\Large \beta=\sin^{-1}\!\left(\frac{v}{V}\right)$$

Positive β means the aircraft moves partly toward its own right through the air; the relative wind arrives from its right. A rudder input or an asymmetric disturbance can produce sideslip. A bank disturbance can also develop sideslip through the subsequent motion, but a coordinated banked turn can have approximately zero sideslip.

**Crosswind is not automatically sideslip.** In a crabbed crosswind flight the nose can point into the wind while the air-relative velocity stays aligned with the nose: β ≈ 0 even though ground track differs from heading. This follows V_ground = V_air + V_wind. In an intentional sideslip, the pilot instead maintains a nonzero β. The next figure separates those cases.
'''

DIHEDRAL_STEPS=r'''### 2B.2. How does dihedral turn sideslip into a rolling moment?

The next drawing is a **REAR view, looking toward the nose**. The aircraft's right wing is on the page's right. It is not a front-facing camera view. The green arrows illustrate the **vertical lift components**; horizontal components are omitted. All lift differences and arrows are schematic, not computed flight loads.

1. Positive β brings a cross-flow component from the aircraft's right.
2. With positive dihedral, the right and left wing panels are tilted in opposite directions. The same cross-flow therefore contributes differently to each panel's effective incidence.
3. The right (windward) wing sees higher effective angle of attack and the left sees lower effective angle of attack, for this small-disturbance attached-flow illustration.
4. Right-wing lift increases and left-wing lift decreases. The difference raises the right wing: a negative rolling moment in our body-axis convention.
5. This is the **dihedral effect: rolling response to sideslip**, not a direct “bank-angle sensor.” Reversing β reverses the lift difference and rolling moment.

For small angles, a geometry-only illustration is Δα_right ≈ +β sin Γ and Δα_left ≈ −β sin Γ (radians). It omits sweep, fuselage interference, twist and other surfaces; it is not the aircraft's stability derivative. An isolated, unswept zero-dihedral wing has no such geometric contribution in this idealization. A real zero-dihedral airplane can still have a substantial total dihedral effect.

$$\Large C_{\ell\beta}=\frac{\partial C_{\ell}}{\partial\beta}$$

Here C_ℓ is the **rolling-moment coefficient**, NOT section lift c_l or wing lift C_L. Positive roll lowers the aircraft's right wing; a usual stabilizing dihedral contribution has C_ℓβ &lt; 0. Overall lateral–directional stability also needs yaw stability/damping, roll damping and the coupled Dutch-roll/spiral behavior. Dihedral alone does not guarantee a stable aircraft.

Source for the windward-wing incidence/lift explanation: [FAA Airframe Handbook, lateral stability](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_65-15A.pdf), chapter 2, Figure 2-14.

**Check your understanding:** (a) banked but coordinated, β ≈ 0: is the pictured sideslip-driven restoring moment present? (b) reverse the sideslip: which wing gets more lift? (c) keep projected span and vertical load fixed: does Γ alone necessarily increase root roll-bending? Answers: no for this pictured mechanism; the left wing; no—resolve the actual force components and lever arms.
'''

HISTORY='''### 2B.3. Was dihedral discovered after an aircraft accident?

**There is no defensible universal story that “the first airplane without dihedral crashed, so designers invented dihedral.”** Zero geometric dihedral is not the same as zero aerodynamic dihedral effect. We do not attribute an accident to one geometric parameter without an investigation.

**An early documented explanation: Sir George Cayley, 1810.** In Part II of *On Aerial Navigation* (February 1810), Cayley discussed an apex-down V cross-section to resist lateral rolling. This is useful historical evidence of the idea, not proof that he was the first person ever to build it. His historical reasoning should not replace today's sideslip explanation. [Original article, university-hosted transcription](https://invention.psychology.msstate.edu/i/Cayley/CayleyP2.html) (the host notes incomplete final proofreading). The [Smithsonian history](https://airandspace.si.edu/explore/stories/flight-airplane) describes his 1804 hand-launched glider, but does not establish that as the first implementation of dihedral.

**A documented handling problem: Ryan FR-1 Fireball.** Ames engineer Seth B. Anderson described a 1945 investigation of inadequate lateral stability during carrier approaches. Wind-tunnel tests indicated that more dihedral was needed; three aircraft with 7.5°, 9.5° and 11.5° were compared in flight. Excessive dihedral could also make roll too sensitive to yaw. This is a concrete design/test trade-off, **not evidence of a crash caused by zero dihedral**. The cited account does not identify a final optimum or quantify the improvement. [Firsthand NASA memoir, printed p. 20](https://www.nasa.gov/wp-content/uploads/2023/04/sp-4526.pdf).

**Real counterexample: F-15.** NASA TM 72861, Table 1, lists wing dihedral as **−1°**, i.e. slight anhedral—not positive dihedral. Yet a separate NASA flight-research report describes how sideslip produces roll through the F-15's dihedral effect in differential-thrust control. This illustrates the distinction between wing geometry and the total airplane's response; it does not prove unconditional passive stability. [Geometry report, Table 1](https://ntrs.nasa.gov/api/citations/19790015808/downloads/19790015808.pdf); [flight-research report, printed p. 163](https://ntrs.nasa.gov/api/citations/19950026588/downloads/19950026588.pdf).

**Why might anhedral be intentional?** Other contributors—such as sweep and wing–fuselage interaction—may already produce a strong total dihedral effect. The designer balances those contributors with control authority and lateral–directional dynamics rather than maximizing Γ. A positive-dihedral wing, zero-dihedral wing and anhedral wing can all belong to flyable designs; the rest of the aircraft matters.
'''

def sideslip_figures():
    from matplotlib.patches import Polygon, FancyBboxPatch, Arc
    fig,axs=plt.subplots(1,3,figsize=(15,5),layout='constrained')
    for ax,beta,title in zip(axs,[0,22,0],['A. Aligned flight: β = 0','B. Sideslip: β > 0','C. Crosswind/crab: β = 0']):
        ax.add_patch(Polygon([(-.09,-.65),(.09,-.65),(.09,.6),(0,.92),(-.09,.6)],color='#dce8ef',ec='#19364b'))
        ax.add_patch(Polygon([(-1.05,-.13),(-.1,.14),(.1,.14),(1.05,-.13),(1.05,-.28),(-1.05,-.28)],color='#dce8ef',ec='#19364b'))
        ax.plot([0,0],[-.8,1.55],'k--',lw=1)
        vx=1.25*np.sin(np.deg2rad(beta));vy=1.25*np.cos(np.deg2rad(beta))
        ax.annotate('',(vx,vy),(0,0),arrowprops={'arrowstyle':'-|>','color':'#198652','lw':3})
        ax.text(vx+.1,vy,'V air',color='#198652',fontsize=12)
        ax.annotate('',(.5*vx,.5*vy),(vx,vy),arrowprops={'arrowstyle':'-|>','color':'#b42b37','lw':2})
        ax.text(-1.35,1.4,'Nose / x forward ↑',fontsize=10)
        if beta:
            ax.add_patch(Arc((0,0),1.3,1.3,theta1=90-beta,theta2=90,color='#b97513',lw=2));ax.text(.1,.76,'β',fontsize=22,color='#b97513');ax.text(-1.3,-1.0,'Red: relative wind arrives\nfrom aircraft right',color='#b42b37',fontsize=11)
        elif title.startswith('C'):
            ax.annotate('',(.9,1.15),(0,0),arrowprops={'arrowstyle':'-|>','color':'#1766c2','lw':2});ax.text(.9,.82,'V ground',color='#1766c2',fontsize=11)
            ax.text(-1.3,-1.0,'Wind changes ground track,\nnot necessarily sideslip.',fontsize=11)
        else:ax.text(-1.3,-1.0,'Air-relative velocity follows nose.\nRelative wind is opposite to V air.',fontsize=11)
        ax.set(xlim=(-1.5,1.55),ylim=(-1.2,1.65),title=title);ax.set_aspect('equal');ax.axis('off')
    fig.savefig(OUT/'sideslip_air_and_ground.png',dpi=170,bbox_inches='tight');plt.close(fig)
    fig,axs=plt.subplots(1,2,figsize=(13,5.5),layout='constrained')
    for ax,gamma,title in zip(axs,[0,12],['A. Zero dihedral: geometry-only contribution','B. Positive dihedral: windward wing gains lift']):
        xx=np.array([-1.2,0,1.2]);zz=np.abs(xx)*np.tan(np.deg2rad(gamma));ax.plot(xx,zz,lw=5,color='#197da6');ax.axhline(0,color='.6',ls='--',lw=1)
        ax.scatter([0],[0],color='#19364b',s=70);ax.text(0,-.12,'CG',ha='center')
        for x,label,height in [(-.8,'Aircraft LEFT',.55 if gamma==0 else .32),(.8,'Aircraft RIGHT',.55 if gamma==0 else .9)]:
            z=abs(x)*np.tan(np.deg2rad(gamma));ax.annotate('',(x,z+height),(x,z),arrowprops={'arrowstyle':'-|>','color':'#198652','lw':3});ax.text(x,-.3,label,ha='center',fontsize=11)
            ax.text(x,z+height+.06,'Equal lift' if gamma==0 else 'Lower lift' if x<0 else 'Higher lift',ha='center',color='#198652')
        ax.annotate('',(-.4,1.48),(1.15,1.48),arrowprops={'arrowstyle':'-|>','color':'#b42b37','lw':2});ax.text(.35,1.58,'Cross-flow from RIGHT',ha='center',color='#b42b37',fontsize=11)
        ax.text(0,-.62,'Same sideslip; schematic arrows, not calculated loads',ha='center',fontsize=11)
        if gamma:ax.text(-.95,1.3,'α left ↓     α right ↑\nRight wing tends to RISE',fontsize=12,color='#19364b')
        ax.set(xlim=(-1.5,1.5),ylim=(-.72,1.75),title=title+'\nREAR view: looking toward the nose');ax.axis('off')
    fig.savefig(OUT/'dihedral_crossflow_lift_difference.png',dpi=170,bbox_inches='tight');plt.close(fig)
    fig,ax=plt.subplots(figsize=(14,3.2),layout='constrained');ax.set(xlim=(0,14),ylim=(0,3));ax.axis('off')
    labels=['Sideslip β > 0\nWind arrives\nfrom the RIGHT','Tilted panels\nRight α increases\nLeft α decreases','Lift difference\nRight lift increases\nLeft lift decreases','Rolling moment\nRight wing rises\nCℓβ usually < 0']
    for i,label in enumerate(labels):
        x=.15+i*3.5;ax.add_patch(FancyBboxPatch((x,.8),2.9,1.45,boxstyle='round,pad=.1',fc='#edf4f7',ec='#197da6',lw=2));ax.text(x+1.45,1.52,label,ha='center',va='center',fontsize=12)
        if i<3:ax.annotate('',(x+3.4,1.52),(x+3.0,1.52),arrowprops={'arrowstyle':'-|>','lw':2})
    ax.text(7,.3,'Input is SIDESLIP, not bank angle alone. Reversing β reverses the pictured response.',ha='center',fontsize=12)
    fig.savefig(OUT/'dihedral_causal_chain.png',dpi=170,bbox_inches='tight');plt.close(fig)
    fig,axs=plt.subplots(1,2,figsize=(12,5),layout='constrained')
    for ax,side,sign in [(axs[0],'LEFT',1),(axs[1],'RIGHT',-1)]:
        gamma=np.deg2rad(25);normal=np.array([sign*np.sin(gamma),np.cos(gamma)]);flow=np.array([-1.,0.]);projection=np.dot(flow,normal)*normal
        xx=np.array([-.8,.8]);ax.plot(xx,-sign*xx*np.tan(gamma),lw=4,color='#197da6')
        for vec,color,label,pos in [(normal,'#198652','Panel normal n',(normal[0]+.08,normal[1]+.08)),(flow,'#b42b37','Side-flow u',(-1.12,-.13)),(projection,'#b97513','Normal component',(.15,-.65))]:
            ax.annotate('',tuple(vec),(0,0),arrowprops={'arrowstyle':'-|>','color':color,'lw':3});ax.text(*pos,label,color=color,fontsize=11)
        ax.text(-1.05,1.3,'u · n '+('< 0: incidence decreases' if side=='LEFT' else '> 0: incidence increases'),fontsize=12)
        ax.set(title=f'{side} panel: same flow, different projection\nRear-view geometry; Γ exaggerated for visibility',xlim=(-1.3,1.3),ylim=(-.85,1.55));ax.set_aspect('equal');ax.axis('off')
    fig.savefig(OUT/'dihedral_normal_projection.png',dpi=170,bbox_inches='tight');plt.close(fig)

def figures():
    sideslip_figures()
    fig,axs=plt.subplots(1,3,figsize=(14,4.2),layout='constrained')
    yy=np.array([-1,0,1]);axs[0].plot(yy,np.abs(yy)*.22,lw=5,color='#1674a5');axs[0].axhline(0,ls='--',color='.6');axs[0].text(.45,.08,'Γ',fontsize=23)
    axs[0].set(title='FRONT: positive dihedral',xlabel='Span',ylabel='Height',ylim=(-.18,.45));axs[0].text(0,.35,'Tips rise; not angle of attack',ha='center',fontsize=10)
    for ax,angle,title in [(axs[1],25,'TOP: aft sweep'),(axs[2],-25,'TOP: forward sweep')]:
        y=np.linspace(-1,1,101);le=np.abs(y)*np.tan(np.deg2rad(angle));c=.38-.16*np.abs(y)
        ax.fill_between(y,le,le+c,alpha=.2,color='#1674a5');ax.plot(y,le,lw=3);ax.plot(y,le+c/4,'r--',label='Quarter chord');ax.set(title=title,xlabel='Span',ylabel='Aft from root LE');ax.invert_yaxis();ax.legend(fontsize=9)
        ax.set_title(title+'\nNose / forward ↑; aft ↓')
    for ax in axs:ax.grid(alpha=.15)
    fig.savefig(OUT/'geometry_views_and_reasons.png',dpi=170,bbox_inches='tight');plt.close(fig)
    alpha=np.linspace(-6,10,161);a0=2*np.pi;ea=.9;ei=.85
    fig,axs=plt.subplots(1,3,figsize=(15,4.6),layout='constrained')
    axs[0].plot(alpha,a0*np.deg2rad(alpha+2),'k--',lw=2,label='2-D airfoil (a0 = 2π/rad)')
    for ar in [4,8,12]:
        a=a0/(1+a0/(np.pi*ea*ar));axs[0].plot(alpha,a*np.deg2rad(alpha+2),label=f'Wing AR={ar}',lw=2)
        cl=np.linspace(0,1.2,150);axs[1].plot(cl,cl**2/(np.pi*ei*ar),label=f'AR={ar}',lw=2)
    axs[0].set(xlabel='Angle of attack (deg)',ylabel='cl or CL',title='Same angle → different lift\nLinear attached-flow example')
    axs[1].set(xlabel='Wing CL',ylabel='CD,i',title='Same CL → different induced drag\nei = 0.85 (assumed)')
    ar=np.linspace(3,20,200);axs[2].plot(ar,a0/(1+a0/(np.pi*ea*ar)),lw=2);axs[2].axhline(a0,color='k',ls='--',label='Infinite-span slope a0');axs[2].set(xlabel='Aspect ratio',ylabel='Lift slope a (per radian)',title='Longer span weakens downwash\nea = 0.90 (assumed)')
    for ax in axs:ax.legend(fontsize=9);ax.grid(alpha=.2)
    fig.savefig(OUT/'airfoil_wing_lift_drag_comparison.png',dpi=170,bbox_inches='tight');plt.close(fig)

def main():
    figures();nb=json.loads(NB.read_text(encoding='utf-8'));cells=[c for c in nb['cells'] if not c.get('id','').startswith('l2-oct13-')]
    for c in cells:
        if c.get('id')=='079e72ea':c['source']=LIFT.strip().splitlines(keepends=True)
    additions={
      'd9e8de83':[md('l2-oct13-geometry-reasons',GEOMETRY),md('l2-oct13-sideslip-definition',SIDESLIP),md('l2-oct13-sideslip-picture',image('sideslip_air_and_ground','Aligned air-relative flight, sideslip and crosswind ground-track differences')),md('l2-oct13-dihedral-steps',DIHEDRAL_STEPS),md('l2-oct13-crossflow-picture',image('dihedral_crossflow_lift_difference','Rear-view comparison showing sideslip, windward incidence and lift difference')),md('l2-oct13-causal-picture',image('dihedral_causal_chain','Causal chain from sideslip through incidence and lift to rolling moment')),md('l2-oct13-history',HISTORY),md('l2-oct13-real-aircraft',PHOTOS),md('l2-oct13-clean-views',image('geometry_views_and_reasons','Front-view dihedral and top-view aft and forward sweep'))],
      '079e72ea':[md('l2-oct13-cl-graphs',image('airfoil_wing_lift_drag_comparison','Section and finite-wing lift curves, induced drag and lift slope versus aspect ratio')),code('l2-oct13-cl-experiment',EXPERIMENT)],
    }
    additions['d9e8de83'].insert(4,md('l2-oct13-projection-picture',image('dihedral_normal_projection','The same lateral relative wind has opposite signed normal components on left and right tilted panels')+'\n\nThe red vector is the same lateral part of relative wind on both panels. Project it onto the green panel normal: the orange normal component has opposite signs. Combined with the forward airflow, that gives the opposite incidence changes described above. This is a vector-geometry explanation, not a complete aerodynamic force calculation.'))
    result=[]
    for c in cells:result.append(c);result.extend(additions.get(c.get('id'),[]))
    nb['cells']=result;NB.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    print('Updated Lecture 02 only; existing IDs and unrelated cells preserved.')
if __name__=='__main__':main()
