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

GEOMETRY='''### 2B. Why choose dihedral or sweep? Three disciplines, one wing

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

<div style="font-size:20px;padding:12px">V<sub>normal</sub> ≈ V cos Λ &nbsp; · &nbsp; M<sub>normal</sub> ≈ M cos Λ</div>

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

LIFT='''## 3. From airfoil cₗ to finite-wing Cₗ — then induced drag

### 3.1 Begin with the two different reference areas

Lecture 1 gave the **section** lift coefficient c<sub>l</sub>. A two-dimensional section uses lift per unit span L′ and its local chord c. A finite wing uses total lift L and **full-wing projected area S**:

<div style="font-size:21px;padding:12px;line-height:1.8">q = ½ρV²<br>c<sub>l</sub>(y) = L′(y) / [q c(y)]<br>C<sub>L</sub> = L / (q S)<br>L = ∫<sub>−b/2</sub><sup>b/2</sup> q c(y)c<sub>l</sub>(y) dy<br>C<sub>L</sub> = (1/S) ∫<sub>−b/2</sub><sup>b/2</sup> c(y)c<sub>l</sub>(y) dy</div>

The wing coefficient is a **chord-weighted spanwise average**, not the section coefficient at one chosen station. In a symmetric case you may double the half-wing integral. Never use half-wing lift with full-wing area without that factor of two.

### 3.2 Why does the lift curve change?

Finite span creates a trailing vortex system and **downwash**. The local flow tilts downward, so the section sees an effective angle smaller than the geometric angle. In a simple untwisted, weakly swept, attached-flow comparison:

<div style="font-size:21px;padding:12px;line-height:1.8">α<sub>effective</sub> ≈ α − α<sub>i</sub><br>c<sub>l</sub> ≈ a₀(α<sub>effective</sub> − α₀)<br>α<sub>i</sub> ≈ C<sub>L</sub> / (πe<sub>a</sub>AR)<br>C<sub>L</sub> ≈ a(α − α<sub>L=0</sub>)<br>a ≈ a₀ / [1 + a₀/(πe<sub>a</sub>AR)]</div>

**Read it step by step:** increasing α creates lift; lift creates downwash; downwash removes some effective incidence; consequently the finite-wing lift slope a is below the isolated-section slope a₀. Substitute α<sub>i</sub> into C<sub>L</sub> ≈ a₀(α − α₀ − α<sub>i</sub>), collect the terms in C<sub>L</sub>, and divide: that gives the denominator above. As AR → ∞, a → a₀.

Angles in these equations are **radians**, and slopes are per radian. The thin-airfoil estimate a₀ = 2π is an idealization, not measured data for every NACA airfoil. Use measured/computed section slope at the relevant Reynolds and Mach numbers when available. In this comparison α<sub>L=0</sub> equals the assumed section α₀; twist, varying sections and more general loading change that result.

Thus C<sub>L</sub> depends on angle of attack, airfoil/camber and zero-lift angle, AR, planform and span loading, twist, sweep, Reynolds/Mach number, configuration and stall. The definition C<sub>L</sub> = L/(qS) always defines the coefficient; the **linear prediction** above is limited to attached flow and is not a universal formula for a highly swept/delta wing or stall.

### 3.3 Now use wing Cₗ to calculate induced drag

<div style="font-size:21px;padding:12px;line-height:1.8">C<sub>D,i</sub> = C<sub>L</sub>² / (πe<sub>i</sub>AR)<br>D<sub>i</sub> = q S C<sub>D,i</sub></div>

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

def figures():
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
      'd9e8de83':[md('l2-oct13-geometry-reasons',GEOMETRY),md('l2-oct13-real-aircraft',PHOTOS),md('l2-oct13-clean-views',image('geometry_views_and_reasons','Front-view dihedral and top-view aft and forward sweep'))],
      '079e72ea':[md('l2-oct13-cl-graphs',image('airfoil_wing_lift_drag_comparison','Section and finite-wing lift curves, induced drag and lift slope versus aspect ratio')),code('l2-oct13-cl-experiment',EXPERIMENT)],
    }
    result=[]
    for c in cells:result.append(c);result.extend(additions.get(c.get('id'),[]))
    nb['cells']=result;NB.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    print('Updated Lecture 02 only; existing IDs and unrelated cells preserved.')
if __name__=='__main__':main()
