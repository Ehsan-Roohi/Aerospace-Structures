"""Teach distributed-load moments; preserve unrelated Lecture 02 cells and IDs."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
NB = ROOT / 'notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb'
ASSETS = ROOT / 'docs/assets/lecture02'
RAW = 'https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture02/'


def figure(name, alt):
    return f'![{alt}]({RAW}{name}.png)\n\n*Original teaching figure; assumed loads, not measured wing data. The load-profile area is force. Arrow lengths illustrate intensity, not separate point loads.*'


INTRO = r'''## 4. From distributed load to root bending moment

### 4.1 What exactly are we adding?

Imagine holding a ruler at one end. A push close to your hand is easier to resist than the **same push farther away**. Moment measures this turning demand: **force × perpendicular distance**. A wing experiences many small pushes along its span, so we add all their moments.

Here $y$ is distance from the **root**, $s$ is semi-span, and $F_h$ is the total force on **one half-wing**, not the full aircraft lift. We consider upward loads and report **applied moment magnitudes**. In the side-view drawings the applied loads turn counterclockwise; the clamp supplies an equal clockwise reaction couple. A signed moment needs an explicitly chosen axis.

| Quantity | Meaning | Units |
|---|---|---|
| $w(y)$ | Force per unit span at location $y$ | N/m |
| $dy$ | Width of a very narrow spanwise strip | m |
| $dF$ | Force carried by that strip | N |
| $y$ | Strip's perpendicular lever arm about the root | m |
| $dM$ | Strip's contribution to root moment | N·m |

Pressure and shear act on area. After integrating their vertical components around each airfoil section, we obtain $w(y)$. For a small-slope pressure sketch, $w(y)\approx\int[p_{\mathrm{lower}}-p_{\mathrm{upper}}]dx$. NACA geometry alone does **not** determine the load distribution.

### 4.2 One small strip, one force, one moment

1. Take a strip at $y$ with width $dy$.
2. Multiply load per length by strip width to obtain its force.
3. Multiply **that force**, not the intensity, by its root lever arm.
4. Add contributions from the root $y=0$ to the tip $y=s$.

$$dF=w(y)\,dy \qquad\text{and}\qquad dM=y\,dF=y\,w(y)\,dy.$$

For example, a strip with $w=300$ N/m, width $0.10$ m and center $2$ m from the root has **30 N force** and contributes **60 N·m moment**. Writing $300\times2$ as its moment would omit the strip width and give the wrong units.

$$\underbrace{F_h=\int_0^s w(y)\,dy}_{\text{add the strip forces}},\qquad
\underbrace{M_{\mathrm{load}}=\int_0^s y\,w(y)\,dy}_{\text{add force times its root distance}}.$$

Read the integral sign as “add very many very small pieces.” $y\,w(y)$ is the **moment contribution per unit length**, so it must still be multiplied by $dy$. Because the forces in these examples are vertical, their perpendicular distances are the horizontal spanwise distances $y$.

{STRIP_FIGURE}

### 4.3 Replace all the strips by one equivalent force

The equivalent force must preserve **both** total force and root moment. Its location is the load centroid:

$$\bar y=\frac{M_{\mathrm{load}}}{F_h},\qquad M_{\mathrm{load}}=F_h\bar y.$$

The area under the $w$–$y$ curve gives force. **Area alone does not give moment**: load farther from the root receives a larger distance multiplier. The equivalent single force gives the same root reactions, but it does not reproduce the distributed load's bending diagram at every interior cut.

The four cases below all use **$s=4$ m and $F_h=1200$ N**. For a symmetric aircraft this would correspond to 2400 N over both halves. These are teaching cases, not an aerodynamic prediction for the printed wing. With four worked derivations, use uniform and triangular in class first, then trapezoidal; the elliptical substitution can be reviewed after class.
'''

UNIFORM = r'''### 4.4 Uniform / rectangular loading: every metre carries the same force

{FIGURE}

“Rectangular” refers to the **shape of the load diagram**, not necessarily the wing planform. Let the constant intensity be $w_0$.

**Step 1 — add forces.** The area is a rectangle of width $s$ and height $w_0$:

$$F_h=\int_0^s w_0\,dy=w_0[y]_0^s=w_0s
\quad\Rightarrow\quad w_0=\frac{F_h}{s}.$$

**Step 2 — add moments.** A strip at $y$ has lever arm $y$:

$$M_{\mathrm{load}}=\int_0^s y w_0\,dy
=w_0\left[\frac{y^2}{2}\right]_0^s
=\frac{w_0s^2}{2}=\frac{F_hs}{2}.$$

The bracket means “evaluate at the upper limit, then subtract the value at the lower limit.” Thus $[y^2/2]_0^s=s^2/2-0$.

**Step 3 — locate the resultant.** $\bar y=M/F_h=s/2$: the middle of the span.

**Worked example:** $w_0=1200/4=300$ N/m; $F_h=300(4)=1200$ N; $M=300(4^2)/2=\mathbf{2400}$ N·m; $\bar y=2$ m. Independent check: $1200(2)=2400$ N·m.
'''

TRIANGLE = r'''### 4.5 Root-heavy triangular loading: most load is close to the clamp

{FIGURE}

The intensity decreases in a straight line from $w_0$ at the root to zero at the tip:

$$w(y)=w_0\left(1-\frac{y}{s}\right).$$

**Step 1 — add forces.** This is also the area of a triangle:

$$F_h=w_0\int_0^s\left(1-\frac{y}{s}\right)dy
=w_0\left[y-\frac{y^2}{2s}\right]_0^s
=\frac{w_0s}{2}
\quad\Rightarrow\quad w_0=\frac{2F_h}{s}.$$

**Step 2 — add moments.** Multiply the entire load expression by $y$ before integrating:

$$\begin{aligned}
M_{\mathrm{load}}&=w_0\int_0^s\left(y-\frac{y^2}{s}\right)dy\\
&=w_0\left[\frac{y^2}{2}-\frac{y^3}{3s}\right]_0^s\\
&=w_0\left(\frac{s^2}{2}-\frac{s^2}{3}\right)
=\frac{w_0s^2}{6}=\frac{F_hs}{3}.
\end{aligned}$$

**Step 3 — locate the resultant.** $\bar y=s/3$, measured from the **high-load end (the root)**, not from the tip.

**Worked example:** $w_0=600$ N/m; $F_h=600(4)/2=1200$ N; $M=600(4^2)/6=\mathbf{1600}$ N·m; $\bar y=4/3=1.3333$ m. Check: $1200(4/3)=1600$ N·m.

**Why is it lower than the rectangle?** The total force is unchanged, but more of it acts near the root. This reduces the average lever arm.

**Important mirror case:** if the load instead grows from zero at the root to $w_t$ at the tip, $w(y)=w_ty/s$. Then $F_h=w_ts/2$, $M=w_ts^2/3$, and $\bar y=2s/3$. The same 1200 N over 4 m gives **3200 N·m**, not 1600. Always draw which end of the triangle is high. “Triangular” alone is not enough information.

{MIRROR_FIGURE}
'''

TRAPEZOID = r'''### 4.6 Trapezoidal loading: a nonzero load at both ends

{FIGURE}

Let $w_r$ be root intensity and $w_t$ tip intensity. These are **loads in N/m, not chord lengths**. Interpolate linearly between them:

$$w(y)=w_r+(w_t-w_r)\frac{y}{s}.$$

**Step 1 — add forces:**

$$F_h=\int_0^s\left[w_r+(w_t-w_r)\frac{y}{s}\right]dy
=w_rs+\frac{(w_t-w_r)s}{2}
=\frac{s(w_r+w_t)}{2}.$$

**Step 2 — add moments:**

$$\begin{aligned}
M_{\mathrm{load}}&=\int_0^s\left[w_ry+(w_t-w_r)\frac{y^2}{s}\right]dy\\
&=\frac{w_rs^2}{2}+\frac{(w_t-w_r)s^2}{3}
=\frac{s^2(w_r+2w_t)}{6}.
\end{aligned}$$

**Step 3 — locate the resultant:**

$$\bar y=\frac{s(w_r+2w_t)}{3(w_r+w_t)}.$$

**A second method — rectangle + triangle.** For $w_r\ge w_t$, split the diagram into a uniform rectangle of height $w_t$ and a root-heavy triangle of height $w_r-w_t$:

$$F_{\mathrm{rect}}=w_ts,\quad \bar y_{\mathrm{rect}}=s/2;
\qquad F_{\mathrm{tri}}=(w_r-w_t)s/2,\quad\bar y_{\mathrm{tri}}=s/3.$$

$$M_{\mathrm{load}}=F_{\mathrm{rect}}(s/2)+F_{\mathrm{tri}}(s/3).$$

Add **moments**, not an unweighted average of the two centroid locations. If the tip is the high-load end, use a uniform rectangle of height $w_r$ plus a tip-heavy triangle whose centroid is $2s/3$.

**Worked example:** $w_r=400$ N/m and $w_t=200$ N/m over 4 m. Then $F_h=(400+200)4/2=1200$ N and

$$M=\frac{4^2(400+2\times200)}{6}=\mathbf{2133.33}\ \mathrm{N\,m}.$$

Independently: rectangle force = 800 N at 2 m; triangle force = 400 N at $4/3$ m. Their moments add to $800(2)+400(4/3)=2133.33$ N·m. The overall centroid is $2133.33/1200=1.7778$ m.

**For equal-force comparisons:** choose $r=w_t/w_r\ge0$, then $w_r=2F_h/[s(1+r)]$. The ratio $r$ describes **loading taper**, not geometric wing taper. At $r=0$ this becomes the root-heavy triangle; at $r=1$ it becomes the rectangle. At $r>1$ the resultant moves outboard of mid-span.
'''

ELLIPSE = r'''### 4.7 Elliptical loading: smooth decrease toward zero tip load

{FIGURE}

The load profile on one half-wing is a **quarter ellipse**, not a triangle:

$$w(y)=w_0\sqrt{1-(y/s)^2}.$$

**Step 1 — add forces.** Substitute $u=y/s$, so $y=su$ and $dy=s\,du$:

$$F_h=w_0s\int_0^1\sqrt{1-u^2}\,du
=\frac{\pi w_0s}{4}.$$

The remaining integral is the area of a quarter unit circle, $\pi/4$. Therefore $w_0=4F_h/(\pi s)$.

**Step 2 — include the distance multiplier.** Both $y=su$ and $dy=s\,du$ enter the moment integral:

$$M_{\mathrm{load}}=w_0s^2\int_0^1 u\sqrt{1-u^2}\,du.$$

The antiderivative is $-(1-u^2)^{3/2}/3$; differentiating it recovers $u\sqrt{1-u^2}$. Evaluating at 1 and 0 gives $0-(-1/3)=1/3$, so

$$M_{\mathrm{load}}=\frac{w_0s^2}{3}
=\frac{4F_hs}{3\pi},\qquad \bar y=\frac{4s}{3\pi}\approx0.4244s.$$

**Worked example:** $w_0=1200/\pi=381.97$ N/m; $\bar y=16/(3\pi)=1.6977$ m; $M=1200(1.6977)=\mathbf{2037.18}$ N·m. Its moment lies between those of the root-heavy triangle and the rectangle.

Elliptical **loading** is an aerodynamic idealization, not something guaranteed by an elliptical or tapered outline. Uniform and trapezoidal loads with nonzero tip intensity remain useful beam benchmarks even though they are not realistic free-tip aerodynamic predictions.
'''

PRACTICE = r'''### 4.8 Your calculation: make the computer a check, not the first answer

| Same force $F_h$, same semi-span $s$ | Resultant location from root | Applied root moment magnitude |
|---|---|---|
| Uniform / rectangular | $s/2$ | $F_hs/2$ |
| Root-heavy triangular | $s/3$ | $F_hs/3$ |
| Trapezoidal, $r=w_t/w_r$ | $s(1+2r)/[3(1+r)]$ | $F_hs(1+2r)/[3(1+r)]$ |
| Elliptical | $4s/(3\pi)$ | $4F_hs/(3\pi)$ |

**Before running 4B:**

1. For a **new virtual printed-wing problem**, use $F_h=9$ N and $s=0.45$ m. Write $w(y)$, integrate $y\,w(y)$, and calculate the four root moments. Use $r=0.50$ for the trapezoid. Enter your answers in N·m in 4A below; round to three decimal places. Do not copy the 1200 N / 4 m worked answers.
2. Predict which is largest and explain it using the location of the force, not just its peak intensity.
3. Mirror the triangle so its high-load end is at the tip. Calculate the new moment and compare with the root-heavy case. Check the units and state which quantities you held fixed. These are assumed loads, not permission to physically load the printed wing.

To compare custom trapezoids in 4B, change $r$. Try $r=0$, $0.50$, $1$ and $2$. Predict the centroid and moment trend first. The four hand-answer fields refer to the fixed **9 N / 0.45 m exercise**, even if you change the experimental inputs. Set 4B's force to 9 N and semi-span to 0.45 m to plot that same exercise.

**Common mistakes:** using full-wing lift in a half-wing integral; forgetting $dy$; measuring $s/3$ from the wrong end of a triangle; using $y$ instead of distance from an interior cut; confusing geometric taper with load taper; claiming extra ribs reduce the equilibrium root moment for a fixed applied load.

### The same reasoning at an interior cut

At a cut at $y_c$, retain only the wing **outboard of the cut**. A strip at $\eta$ now has lever arm $\eta-y_c$, not $\eta$:

$$V(y_c)=\int_{y_c}^s w(\eta)\,d\eta,\qquad
M(y_c)=\int_{y_c}^s(\eta-y_c)w(\eta)\,d\eta.$$

Here $\eta$ is just a name for the changing strip location while the cut stays fixed. These are demand magnitudes for the positive upward loads used here, with no added point forces or couples. At the root, $y_c=0$, they recover $F_h$ and $M_{\mathrm{load}}$. At the unloaded free tip, both are zero. The next five-strip example makes this bookkeeping visible. Loads of both signs or concentrated moments must be added consistently, not hidden in these positive-load examples.
'''

PREDICT_CODE = '''#@title 4A. Your prediction and four hand-calculated moments { display-mode: "form" }
LARGEST_MOMENT = "Choose" #@param ["Choose", "Uniform", "Root-heavy triangular", "Trapezoidal", "Elliptical", "All equal"]
LOAD_REASON = "" #@param {type:"string"}
HAND_UNIFORM_NM = -1.0 #@param {type:"number"}
HAND_TRIANGULAR_NM = -1.0 #@param {type:"number"}
HAND_TRAPEZOIDAL_NM = -1.0 #@param {type:"number"}
HAND_ELLIPTICAL_NM = -1.0 #@param {type:"number"}
print("Hand-answer exercise: Fh = 9 N, s = 0.45 m, trapezoid ratio r = 0.50.")
print("Use -1 for an unanswered field. Run 4B after recording your calculation.")
if LARGEST_MOMENT != "Choose" and LOAD_REASON.strip():
    print("Prediction:", LARGEST_MOMENT, "|", LOAD_REASON)
'''

EXPERIMENT_CODE = '''#@title 4B. Integrate four loads — compare with hand calculations { display-mode: "form" }
HALF_WING_FORCE_N = 1200.0 #@param {type:"number"}
LOAD_SEMI_SPAN_M = 4.0 #@param {type:"number"}
TRAPEZOID_TIP_TO_ROOT_RATIO = 0.50 #@param {type:"number"}
positive(force=HALF_WING_FORCE_N, span=LOAD_SEMI_SPAN_M)
r = TRAPEZOID_TIP_TO_ROOT_RATIO
if not np.isfinite(r) or r < 0:
    raise ValueError("Load ratio r must be finite and nonnegative; it is NOT chord taper.")
ss = LOAD_SEMI_SPAN_M
ys = np.linspace(0, ss, 4001)
u = ys / ss
# Write each analytical intensity explicitly; do not rescale sampled curves.
loads = {
    "Uniform": np.full_like(ys, HALF_WING_FORCE_N / ss),
    "Root-heavy triangular": 2*HALF_WING_FORCE_N/ss * (1-u),
    "Trapezoidal": 2*HALF_WING_FORCE_N/(ss*(1+r)) * (1+(r-1)*u),
    "Elliptical": 4*HALF_WING_FORCE_N/(np.pi*ss) * np.sqrt(np.maximum(0, 1-u*u)),
}
expected = {"Uniform": ss/2, "Root-heavy triangular": ss/3,
            "Trapezoidal": ss*(1+2*r)/(3*(1+r)), "Elliptical": 4*ss/(3*np.pi)}
centroids, root_moments = {}, {}
fig, axes = plt.subplots(1, 2, figsize=(13, 4.9), layout="constrained")
colors = [BLUE, ORANGE, "#7655A2", GREEN]
print("Case                     integral w dy (N)   integral y w dy (N m)  M/F (m)")
for (name, w), color in zip(loads.items(), colors):
    # 1. Numerical sum of strip forces: area under w versus y.
    force = integrate(w, ys)
    # 2. Numerical sum of strip moments: area under y*w versus y.
    moment = integrate(ys*w, ys)
    # 3. Equivalent force location must preserve force AND moment.
    centroids[name] = moment / force
    root_moments[name] = moment
    print(f"{name:25s} {force:12.3f} {moment:21.3f} {moment/force:12.5f}")
    assert np.isclose(force, HALF_WING_FORCE_N, rtol=2e-5)
    assert np.isclose(moment, HALF_WING_FORCE_N*expected[name], rtol=2e-5)
    assert np.isclose(moment/force, expected[name], rtol=2e-5)
    axes[0].plot(ys, w, color=color, label=name, lw=2)
    axes[0].plot(moment/force, np.interp(moment/force, ys, w), "o", color=color)
    bar = axes[1].bar(name.replace(" ", "\\n"), moment, color=color)
    axes[1].bar_label(bar, labels=[f"{moment:.1f}"], padding=4)
axes[0].set(xlabel="y from root (m)", ylabel="w(y) (N/m)",
            title="Same total force; dots mark load centroids")
axes[0].legend(fontsize=9)
axes[1].set(ylabel="Applied root moment magnitude (N m)",
            title="Moment is the integral of y times w")
axes[1].set_ylim(0, 1.2*max(root_moments.values()))
plt.show()
print("Force, centroid and root-moment checks against independent formulas: PASS")
print("Moments, descending (ties may share a position):",
      " > ".join(sorted(root_moments, key=root_moments.get, reverse=True)))
# Fixed practice problem: do not grade a student's 9 N / 0.45 m answer
# against a custom experiment's different force, span or ratio.
reference = {"Uniform": 9*.45/2, "Root-heavy triangular": 9*.45/3,
             "Trapezoidal": 9*.45*(1+2*.5)/(3*(1+.5)),
             "Elliptical": 4*9*.45/(3*np.pi)}
fields = {"Uniform": "HAND_UNIFORM_NM", "Root-heavy triangular": "HAND_TRIANGULAR_NM",
          "Trapezoidal": "HAND_TRAPEZOIDAL_NM", "Elliptical": "HAND_ELLIPTICAL_NM"}
print("\\nHand-answer check: fixed Fh=9 N, s=0.45 m, r=0.50; tolerance 0.2%.")
for name, field in fields.items():
    answer = globals().get(field, -1.)
    if answer == -1:
        print(name + ": unanswered — enter your calculation in 4A, then rerun 4A and 4B.")
    elif not np.isfinite(answer) or answer < 0:
        print(name + ": use a finite nonnegative moment magnitude in N m.")
    elif np.isclose(answer, reference[name], rtol=.002, atol=1e-6):
        print(name + ": numerical value agrees. Check your written integral and units too.")
    else:
        print(f"{name}: revise — reference is {reference[name]:.4f} N m. Check force, lever arm and units.")
'''


def new_markdown(ident, text):
    return {'cell_type': 'markdown', 'id': ident, 'metadata': {},
            'source': (text.strip() + '\n').splitlines(keepends=True)}


def enrich_load_moments(nb):
    nb['cells'] = [c for c in nb['cells'] if not c.get('id', '').startswith('l02-load-')]
    def find(ident, prefix):
        return next(c for c in nb['cells'] if c.get('id') == ident
                    or ''.join(c['source']).startswith(prefix))
    intro = find('f796fc19', '## 4. From a surface load')
    intro['source'] = (INTRO.replace('{STRIP_FIGURE}', figure('Load_Strip_To_Moment',
        'A narrow strip carries w times dy force; its moment uses distance y from root; resultant preserves total force and moment')).strip()+'\n').splitlines(keepends=True)
    additions = []
    for ident, text, name, alt in [
        ('uniform', UNIFORM, 'Load_Uniform', 'Rectangular load and its equivalent force at half the semi-span'),
        ('triangle', TRIANGLE, 'Load_Triangular', 'Root-heavy triangular load and its equivalent force at one third of the semi-span'),
        ('trapezoid', TRAPEZOID, 'Load_Trapezoidal', 'Trapezoidal load split into a rectangle and a root-heavy triangle, with force centroid'),
        ('ellipse', ELLIPSE, 'Load_Elliptical', 'Elliptical load and its resultant at 0.4244 of the semi-span'),
    ]:
        content = text.replace('{FIGURE}', figure(name, alt))
        if ident == 'triangle':
            content = content.replace('{MIRROR_FIGURE}', figure('Load_Tip_Heavy_Triangle',
                'Mirrored tip-heavy triangular load with resultant at two thirds of semi-span and larger root moment'))
        additions.append(new_markdown('l02-load-'+ident, content))
    additions.append(new_markdown('l02-load-practice', PRACTICE))
    index = nb['cells'].index(intro)+1
    nb['cells'][index:index] = additions
    for ident, prefix, source in [('b4c325a8', '#@title 4A.', PREDICT_CODE),
                                 ('3835cf36', '#@title 4B.', EXPERIMENT_CODE)]:
        cell = find(ident, prefix)
        cell['source'] = source.splitlines(keepends=True)
        cell['execution_count'], cell['outputs'] = None, []
    reaction = find('fae1f265', '#@title 5A.')
    source = ''.join(reaction['source'])
    source = source.replace('["Uniform", "Root-heavy triangular", "Elliptical"]',
                            '["Uniform", "Root-heavy triangular", "Trapezoidal", "Elliptical"]')
    reaction['source'] = source.splitlines(keepends=True)
    reaction['execution_count'], reaction['outputs'] = None, []
    nb.setdefault('metadata', {}).setdefault('mie446', {})['load_moment_lesson_revision'] = '2026-10-07'
    return nb


def build_figures():
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    ASSETS.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12,
                         'mathtext.fontset': 'dejavusans', 'svg.fonttype': 'none',
                         'svg.hashsalt': 'mie446-load-moments'})
    blue, red = '#245B8A', '#A92333'
    y = np.linspace(0, 4, 1201)
    def beam(ax, centroid=None, strip=False):
        ax.axis('off'); ax.set(xlim=(-.5, 4.5), ylim=(-1.15, 2.25))
        ax.add_patch(Rectangle((-.18, -.16), .18, .32, facecolor='.75', hatch='///', edgecolor='black'))
        ax.plot([0,4],[0,0], color='black', lw=3)
        ax.text(0,-.35,'ROOT',ha='center',fontsize=10)
        ax.text(4,-.35,'TIP',ha='center',fontsize=10)
        if centroid is not None:
            ax.annotate('',xy=(centroid,1.45),xytext=(centroid,0),
                        arrowprops=dict(arrowstyle='-|>',color=blue,lw=3))
            ax.text(centroid,1.63,r'$F_h=1200$ N',ha='center',color=blue)
            ax.annotate('',xy=(centroid,-.7),xytext=(0,-.7),
                        arrowprops=dict(arrowstyle='<->',color='black'))
            ax.text(centroid/2,-.95,fr'$\bar y={centroid:.4f}$ m',ha='center')
        ax.text(2,2.08,'One equivalent force',ha='center',weight='bold')
    def save(fig, name):
        for ext in ('png','svg'):
            target = ASSETS/f'{name}.{ext}'
            options = {'metadata': {'Date': None}} if ext == 'svg' else {}
            fig.savefig(target,dpi=170,facecolor='white',**options)
            if ext == 'svg':
                # Mechanical XML whitespace cleanup; no geometry/content change.
                text = target.read_text(encoding='utf-8')
                target.write_text('\n'.join(line.rstrip() for line in text.splitlines())+'\n',encoding='utf-8')
        plt.close(fig)
    cases = [
        ('Uniform / rectangular', 'Load_Uniform', np.full_like(y,300), 2., 2400.),
        ('Root-heavy triangular', 'Load_Triangular', 600*(1-y/4), 4/3, 1600.),
        ('Tip-heavy triangular: the high-load end matters', 'Load_Tip_Heavy_Triangle', 600*y/4, 8/3, 3200.),
        ('Trapezoidal: root 400, tip 200 N/m', 'Load_Trapezoidal', 400-50*y, 16/9, 6400/3),
        ('Elliptical', 'Load_Elliptical', 1200/np.pi*np.sqrt(1-(y/4)**2), 16/(3*np.pi), 19200/(3*np.pi)),
    ]
    for title, name, w, centroid, moment in cases:
        fig, axes = plt.subplots(1,2,figsize=(12,5.4))
        fig.subplots_adjust(left=.07,right=.98,bottom=.29,top=.79,wspace=.28)
        ax=axes[0]
        if name=='Load_Trapezoidal':
            ax.fill_between(y,0,200,color='#cddbe6',label='Rectangle: 800 N at 2 m')
            ax.fill_between(y,200,w,color='#efc8a8',label='Triangle: 400 N at 4/3 m')
            ax.axhline(200,color='.4',ls='--',lw=1)
            ax.legend(fontsize=9,loc='upper right',bbox_to_anchor=(.99,.86))
        else:
            ax.fill_between(y,0,w,color=blue,alpha=.13)
        ax.plot(y,w,color=blue,lw=2)
        for xi in np.linspace(0,4,9):
            wi=np.interp(xi,y,w)
            if wi>1e-10:
                ax.annotate('',xy=(xi,wi),xytext=(xi,0),
                            arrowprops=dict(arrowstyle='-|>',color=blue,lw=1.3))
        ax.set(xlim=(-.06,4.15),ylim=(0,max(w)*(1.65 if name=='Load_Trapezoidal' else 1.32)),xlabel='y from root (m)',
               ylabel='Load intensity w(y) (N/m)',title='Distributed upward load')
        ax.grid(alpha=.18)
        ax.text(.5,.94,'Area under curve = 1200 N',transform=ax.transAxes,ha='center',fontsize=11)
        beam(axes[1],centroid)
        fig.suptitle(title,fontsize=19,y=.96)
        fig.text(.5,.1,fr'$M_{{\mathrm{{load}}}}=F_h\bar y=1200\times{centroid:.4f}\approx{moment:.2f}$ N m',ha='center',fontsize=17)
        fig.text(.5,.025,'Same half-wing force and semi-span. Clamp reaction couple is equal and opposite.',ha='center',fontsize=11)
        save(fig,name)
    fig, axes=plt.subplots(1,2,figsize=(12,5.5))
    fig.subplots_adjust(left=.07,right=.98,top=.8,bottom=.30,wspace=.28)
    w=300*np.ones_like(y); ax=axes[0]
    ax.fill_between(y,0,w,color=blue,alpha=.10)
    ax.plot(y,w,color=blue,lw=2)
    ax.fill_between([1.85,2.15],0,[300,300],color='#D96B20',alpha=.5)
    ax.annotate('',xy=(2.15,70),xytext=(1.85,70),arrowprops=dict(arrowstyle='<->'))
    ax.text(2,100,r'$dy$',ha='center',fontsize=16)
    ax.text(2,350,r'$dF=w(y)\,dy$',ha='center',fontsize=17)
    ax.set(xlim=(0,4),ylim=(0,450),xlabel='y from root (m)',ylabel='w(y) (N/m)',title='1. Force = shaded narrow-strip area')
    ax.grid(alpha=.15)
    beam(axes[1]); ax=axes[1]
    ax.text(2,2.08,'2. Moment = strip force times distance',ha='center',weight='bold',bbox=dict(facecolor='white',edgecolor='none'))
    ax.annotate('',xy=(2,1.4),xytext=(2,0),arrowprops=dict(arrowstyle='-|>',color='#D96B20',lw=3))
    ax.text(2.12,1.25,r'$dF$',fontsize=17)
    ax.annotate('',xy=(2,-.7),xytext=(0,-.7),arrowprops=dict(arrowstyle='<->'))
    ax.text(1,-.95,r'lever arm $y$',ha='center',fontsize=14)
    fig.suptitle('A load intensity is not yet a force: include the strip width',fontsize=19,y=.96)
    fig.text(.5,.1,r'$dF=w(y)\,dy\quad\longrightarrow\quad dM=y\,dF\quad\longrightarrow\quad M_{\mathrm{load}}=\int_0^s y\,w(y)\,dy$',ha='center',fontsize=19)
    fig.text(.5,.025,'Finite strip width exaggerated so it is visible. Sum the small contributions from root to tip.',ha='center',fontsize=11)
    save(fig,'Load_Strip_To_Moment')


def main():
    build_figures()
    nb=json.loads(NB.read_text(encoding='utf-8'))
    enrich_load_moments(nb)
    NB.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    print('Updated load lesson, 4A, 4B and 5A; preserved unrelated cells and outputs.')


if __name__=='__main__':
    main()
