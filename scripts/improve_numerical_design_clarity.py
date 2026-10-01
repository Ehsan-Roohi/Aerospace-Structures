"""Add a student-facing audit trail without replacing the existing numerical lesson.

Run from the repository root. Stable IDs make the update repeatable.
"""
from pathlib import Path
import json
import textwrap

PATH = Path(__file__).resolve().parents[1] / 'notebooks/MIE446_Wing_Structural_Design_Numerical.ipynb'
nb = json.loads(PATH.read_text(encoding='utf-8'))
nb['cells'] = [c for c in nb['cells'] if not c.get('id', '').startswith('clarity-')]

def cell(kind, name, source):
    result = dict(cell_type=kind, id='clarity-'+name, metadata={},
                  source=textwrap.dedent(source).strip().splitlines(keepends=True))
    if kind == 'code':
        result.update(execution_count=None, outputs=[])
    return result

def before(target, *cells):
    i = next(i for i,c in enumerate(nb['cells']) if c.get('id') == target)
    nb['cells'][i:i] = cells

def after(target, *cells):
    i = next(i for i,c in enumerate(nb['cells']) if c.get('id') == target)+1
    nb['cells'][i:i] = cells

after('6ef2b44cec5b', cell('markdown','route',r'''
### Start here — understand the model before trusting the dashboard

The first pass is **not a programming assignment**. Read the explanation, predict a trend, run the prepared cell, and explain one number in your own words. Formulas are provided for reference; you do not need to derive every equation to make the engineering decisions.

**Classroom route:** Sections 1–7 form the core lesson. Sections 8–11 repeat the process as a design studio. Sections 12–14 (finite elements, automated search and uncertainty) are extensions: the instructor can demonstrate their results without requiring students to derive the solver. Section 15 records evidence. A large notebook is a resource, not one class's workload.

#### Two different models — do not transfer results silently

| Question | This numerical design notebook | Code-to-Print project notebook |
|---|---|---|
| What is modeled? | A continuous, hollow rectangular spar with an illustrative isotropic material | A modular printed airfoil shell, ribs, rod sleeves and two rods |
| Baseline geometry | 1.40 m full span; initial constant chord, then tapered studio | 450 mm semi-span; 160/100 mm root/tip chords; three modules |
| What does it calculate? | Idealized load effects, box stress, deflection, twist and screening checks | Actual CAD parts, dimensions, mass estimates and print-readiness records |
| Are seven ribs resolved structurally? | **No.** Beam stations/FEM nodes are calculation locations, not ribs | Seven rib centerplanes for the specific three-module baseline |
| Does it approve a printed wing for flight/loading? | **No** | **No;** the team wing stays unloaded and non-flying |

Use [Code-to-Print Wing in Colab](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Code_to_Print_Wing.ipynb) to create manufacturing geometry. This notebook does not export the course's printable rib-and-rod assembly. An aluminum-like material card must not be relabeled as printed PLA. A coupon fit test checks rod clearance, not structural strength.

### The five questions behind every calculation

1. **What goes in?** Dimensions, material assumptions and a stated load.
2. **What does the model do?** Adds forces and lever arms, then relates loads to deformation/stress.
3. **What comes out?** A number with units, not just a green PASS.
4. **How can I check it?** One simple hand calculation, a limiting case or a second numerical method.
5. **What decision is justified?** Keep, revise or investigate — within the model's limitations.

**Design perspective:** Sadaf Khosoussi's *Airframe Structural Design* teaching notes (2021–22, Design / Materials / Buckling) motivate the sequence: choose a layout, distinguish material properties from geometry, check strength and stiffness separately, examine instability, then revise. We use those principles here, not the notes' aircraft dimensions or metallic allowables as printed-polymer data. Manufacturing direction can affect printed material behavior; a single isotropic modulus does not represent every layer orientation.
'''))

after('e52ae2643f40', cell('markdown','ribs-explain',r'''
### Project bridge — where do the seven ribs come from?

This is a **manufacturing layout rule**, not the result of a stress optimization. For the course baseline:

- Divide the 450 mm semi-span into three 150 mm modules: seams are at 150 and 300 mm.
- The requested three interior rib candidates divide the span into four equal intervals: 112.5, 225 and 337.5 mm.
- Add a rib 4 mm on each side of each seam: 146, 154, 296 and 304 mm.
- Sort the centerplane positions: **112.5, 146, 154, 225, 296, 304, 337.5 mm = seven ribs**.

The seam pairs give each adjacent module a nearby rib. Interior ribs help preserve section shape and transfer local loads. This explains the layout intention; it does not prove that the count or joint strength is optimal. The actual CAD rule also removes interior candidates too close to seams and merges nearly coincident positions. Therefore **three interior candidates plus two per seam is not a universal total** for every module count.

In the next figure, solid rib lines run chordwise. Dashed lines mark module cuts, **not ribs**. Rod centerlines run spanwise and are shown separately. The 4 mm values are distances from a seam to a rib centerplane, not rib thickness. The baseline rib thickness is 1.6 mm. This display explains the print project; it does not change the numerical box model below.
'''), cell('code','ribs-figure',r'''
#@title Project bridge — seven ribs, three modules, two rod paths
# Baseline teaching mirror of WingParameters.rib_stations_mm(); no CAD dependency.
print_span = 450.0
print_modules = 3
print_rib_thickness = 1.6
print_offset = 4.0
print_seams = np.arange(1, print_modules)*print_span/print_modules
print_interior = [i*print_span/4 for i in range(1,4)
                  if all(abs(i*print_span/4-s)>print_offset+print_rib_thickness for s in print_seams)]
print_joint = [s+d for s in print_seams for d in (-print_offset,print_offset)]
print_ribs = []
for station in sorted(print_interior+print_joint):
    if not print_ribs or abs(station-print_ribs[-1])>print_rib_thickness:
        print_ribs.append(station)
assert np.allclose(print_ribs,[112.5,146,154,225,296,304,337.5])

fig, (ax, ledger) = plt.subplots(2,1,figsize=(13,7.3),gridspec_kw={'height_ratios':[2.1,1]})
ax.add_patch(Polygon([(0,0),(450,0),(450,100),(0,160)],facecolor='#f4f6f7',edgecolor='black',lw=2))
for frac in (.30,.60):
    ax.plot([0,450],[frac*160,frac*100],color='#7d6608',lw=2.5)
for s in print_seams:
    ax.axvline(s,color='black',ls='--',lw=1.3)
    ax.text(s,175,f'CUT {s:.0f} mm',ha='center',fontsize=10)
for index,s in enumerate(print_ribs,1):
    local_chord=160-60*s/450
    ax.plot([s,s],[0,local_chord],color='#1769aa' if s in print_interior else '#ad4e00',lw=3)
    label_y = -20 if index%2 else -43
    ax.annotate(f'R{index}',xy=(s,0),xytext=(s,label_y),ha='center',fontsize=11,
                arrowprops=dict(arrowstyle='-',color='gray'))
for i in range(3): ax.text(75+150*i,195,f'MODULE {i+1}',ha='center',weight='bold')
ax.set(xlim=(-15,465),ylim=(-55,214),xlabel='Distance from root, y [mm]',ylabel='Chordwise distance [mm]',
       title='Printed baseline: blue = interior rib; orange = seam-support rib; gold = rod path')
ax.text(0,-52,'ROOT',ha='left',fontsize=10); ax.text(450,-52,'TIP',ha='right',fontsize=10)
ledger.axis('off')
table=ledger.table(cellText=[[f'R{i}',f'{s:g}', 'Interior' if s in print_interior else 'Near seam']
                             for i,s in enumerate(print_ribs,1)],
                   colLabels=['Rib','Centerplane from root [mm]','Reason'],loc='center',cellLoc='center',
                   colWidths=[.15,.35,.35])
table.auto_set_font_size(False); table.set_fontsize(10); table.scale(1,1.1)
plt.tight_layout(); plt.show()
print('Count audit: 3 retained interior ribs + 4 seam-support ribs =',len(print_ribs))
print('These are CAD layout positions, not beam/FEM nodes or a strength qualification.')
'''))

before('dd4f1a664fad', cell('markdown','strip-intro',r'''
### A four-strip ledger — see exactly what the integration adds

Before the fine numerical grid, use four equal strips under a **uniform teaching load**. Each strip contributes `load per metre × strip length` newtons. Put that force at the strip midpoint, multiply by its distance to the root, and add the four moments. This midpoint construction is exact for root shear and root moment under a uniform load; it is not generally exact for a varying load.

**Predict first:** if the same total force is moved closer to the root, which total changes — shear or moment? Run the ledger and explain why moment has units N·m whereas shear has units N. The ledger always uses a uniform load; your selected load distribution resumes in Section 2A.
'''), cell('code','strip-ledger',r'''
#@title Worked arithmetic — four strip forces and their root lever arms
strip_edges=np.linspace(0,L,5)
strip_mid=(strip_edges[:-1]+strip_edges[1:])/2
strip_force=np.full(4,F_HALF/4)  # Four equal strips under the uniform teaching load.
strip_moment=strip_force*strip_mid
print('Strip | length [m] | force [N] | root arm [m] | moment [N m]')
for k in range(4):
    print(f'{k+1:5d} | {np.diff(strip_edges)[k]:10.4f} | {strip_force[k]:9.4f} | {strip_mid[k]:12.4f} | {strip_moment[k]:12.4f}')
print(f'SHEAR: add the forces = {strip_force.sum():.4f} N')
print(f'MOMENT: add force × arm = {strip_moment.sum():.4f} N m')
print(f'Independent centroid check: {F_HALF:.4f} N × {L/2:.4f} m = {F_HALF*L/2:.4f} N m')
assert np.isclose(strip_force.sum(),F_HALF)
assert np.isclose(strip_moment.sum(),F_HALF*L/2)
fig,ax=plt.subplots(figsize=(10,3.5))
ax.plot([0,L],[0,0],color='black',lw=3)
for k,x in enumerate(strip_mid):
    ax.annotate('',xy=(x,.65),xytext=(x,0),arrowprops=dict(arrowstyle='->',lw=2))
    ax.text(x,.72,f'{strip_force[k]:.3f} N',ha='center')
    ax.text(x,-.18,f'arm {x:.3f} m',ha='center',fontsize=10)
ax.axvline(0,color='gray',lw=5)
ax.set(xlim=(-.05*L,1.05*L),ylim=(-.3,1),xlabel='Spanwise position [m]',
       title='Four forces reproduce the uniform-load root resultant and moment')
ax.set_yticks([]); plt.tight_layout(); plt.show()
'''))

before('5344e9dda8d2',cell('markdown','section-card',r'''
### Read this calculation as a recipe

**Inputs:** outer width/height, wall thickness, material modulus, density and illustrative strength. Convert mm to m before calculating.

**Operation:** subtract the empty inner rectangle from the outer rectangle. Area $A$ controls mass; $I$ weights material by its squared distance from the neutral axis and controls bending. Neither is a material property. Multiply density × area × span to obtain **spar-only** mass. Multiply moment × half-height and divide by $I$ to obtain the extreme bending stress.

**Check:** zero load must give zero stress; doubling the load with unchanged geometry must double stress. The displayed utilization is **calculated demand / allowed demand**. A value of 0.8 uses 80% of this particular allowable; it is not an 80% probability of failure. The mass excludes skin, ribs, rods, joints and fittings.

**Decision:** passing stress does not establish acceptable deflection or resistance to buckling. A thin compressed wall may wrinkle before reaching material strength. Keep those as separate questions.
'''))

before('1479fd4b1d29',cell('markdown','deflection-card',r'''
### Before running: what makes the wing bend more?

Hold geometry and loading fixed. A smaller $E$ means the material stretches more; a smaller $I$ means the section resists bending less. The code first finds curvature, accumulates small rotations, then accumulates displacement, starting at the fixed root. It is not prescribing the final shape.

**Prediction and check:** double $E$ and tip displacement should halve, while root shear/moment and bending stress remain unchanged in this load-controlled model. Root displacement and slope must be zero. A smooth graph is not sufficient evidence; use the uniform-load result and grid refinement printed below.
'''))

before('2a7bbe02f1a3',cell('markdown','torsion-card',r'''
### Do not confuse bending stiffness with torsional stiffness

| Quantity | What it describes | What multiplies it |
|---|---|---|
| $I$ | Section's resistance to bending geometry | $EI$: bending stiffness |
| $J$ | Section's Saint-Venant torsion constant | $GJ$: torsional stiffness |

Both $I$ and $J$ have units of length to the fourth power, but **they are not interchangeable**. For this noncircular box, do not replace $J$ by the polar area moment $I_x+I_z$.

**Recipe:** force offset × distributed force gives torque per span; add outboard torque to obtain $T$; accumulate twist rate $T/(GJ)$ from the fixed root. **Check:** set the offset to zero. Twist must become zero in this simplified model, even though bending remains. A real airfoil may also apply a pitching couple; that separate effect is not modeled here.
'''))

before('76a6a99bbc40',cell('markdown','function-map',r'''
### The calculation engine is a reusable recipe, not new physics

You may run the next function-definition cell without editing it. Read this map first; the worked numerical receipt after the load comparison will expose its intermediate numbers.

| Function | It takes | It returns | Student check |
|---|---|---|---|
| `section` | Four box dimensions | Area, $I$, $J$, clear panel width | Outer rectangle minus inner void |
| `line_load` | Total force, span, chosen shape | Force per metre at stations | Area under the curve equals total force |
| `beam_integral` | Load, stiffness, force offset | Shear, moment, twist, deflection | Root moment = resultant × centroid arm |
| `packaging` | Airfoil, chord taper and box | Smallest sampled wall gap | Tip may reject a box that fits at root |
| `assess` | One configuration and load case | Demand/limit ratios and eligibility | PASS only addresses the listed screens |
| `envelope` | Same design under several cases | Worst ratio for each screen | Different checks can have different governing cases |

**Model boundary:** the cap-buckling screen uses an ideal long, simply supported plate. No actual rib stations or seam-joint stiffness enter these functions. Adding the seven-rib diagram above does not add ribs to this solver. Beam mesh refinement cannot determine rib count or validate a printed joint.
'''))

after('1307072a009b',cell('markdown','receipt-intro',r'''
### Follow one design all the way through — a calculation receipt

Instead of trusting a single dashboard label, trace the positive studio load case below. The receipt prints the same inputs and intermediate values used by `assess`. The independent checks use force equilibrium, resultant × centroid and torque = offset × resultant. They check arithmetic and implementation, **not the real material or a manufactured wing**.

Predict what stays unchanged when you alter only the cap thickness: total force and root moment stay the same; section properties, stress, deformation and mass change. The detailed shear and buckling screens are taught in Section 10; their values are intentionally not introduced before that explanation.
'''),cell('code','receipt',r'''
#@title Numerical receipt — inputs → loads → section → response → simple checks
receipt=assess(cfg)
rb=receipt['beam']; rs=receipt['section']
rf=cfg['n']*cfg['mass']*cfg['g']/2
centroid_exact=4*cfg['L']/(3*np.pi)  # elliptical load used by assess by default
root_m_exact=rf*centroid_exact
print('1. INPUTS (this is the illustrative box model, not the printed wing)')
print(f"   n × m × g / 2 = {cfg['n']:g} × {cfg['mass']:g} × {cfg['g']:g} / 2 = {rf:.4f} N")
print(f"   Semi-span = {cfg['L']:.4f} m; box B/H = {cfg['B']*1000:.2f}/{cfg['H']*1000:.2f} mm")
print('2. FORCE AND LEVER ARM')
print(f'   Elliptical centroid = {centroid_exact:.5f} m from root')
print(f'   Hand-check root moment: {rf:.4f} × {centroid_exact:.5f} = {root_m_exact:.5f} N m')
print(f"   Numerical root shear/moment: {rb['V'][0]:.5f} N / {rb['M'][0]:.5f} N m")
print('3. GEOMETRY AND MATERIAL REMAIN SEPARATE')
print(f"   Area = {rs['A']*1e6:.3f} mm²; I = {rs['I']*1e12:.3f} mm⁴; J = {rs['J']*1e12:.3f} mm⁴")
print(f"   EI = {cfg['E']*rs['I']:.4f} N m²; GJ = {cfg['G']*rs['J']:.4f} N m²")
print(f"   Spar mass = density × area × span = {receipt['mass']:.5f} kg (NOT total wing mass)")
print('4. RESPONSE AND LIMIT ARE DIFFERENT NUMBERS')
print(f"   Bending stress = M × H/2 ÷ I = {receipt['stress']/1e6:.4f} MPa")
print(f"   Stress allowable = {cfg['stress_allow']/1e6:.4f} MPa; demand/limit = {receipt['U']['bending']:.4f}")
print(f"   Tip displacement = {rb['v'][-1]*1000:.4f} mm; limit = {cfg['defl_limit']*1000:.3f} mm")
print(f"   Tip twist = {np.degrees(rb['phi'][-1]):.4f} deg; limit = {np.degrees(cfg['twist_limit']):.3f} deg")
print('5. INDEPENDENT ROOT CHECKS (finite-grid tolerance: 0.1%)')
assert np.isclose(rb['V'][0],rf,rtol=.001)
assert np.isclose(rb['M'][0],root_m_exact,rtol=.001)
assert np.isclose(rb['T'][0],cfg['e']*rb['V'][0])
print('   Force, centroid moment and offset torque agree. Physical validation remains outstanding.')
'''))

before('d1455c0d9a16',cell('markdown','search-card',r'''
### What the search actually decides — and what it does not

The computer tries **272 listed box sections**: 17 heights × 16 equal wall thicknesses. For each, it repeats the same calculations under three prescribed load cases, rejects failed checks, and sorts survivors by spar mass. It does not invent a wing architecture, choose seven ribs, design printed joints, or prove a global optimum.

Read the result in this order: **Does it fit? Are model assumptions eligible? Which demand/limit ratio is largest? Only then: which accepted candidate is lighter?** If no candidate passes, the correct result is “no feasible point in this tested grid,” not permission to ignore the failed check. A lighter candidate is a proposal to explain, not an automatic manufacturing release.
'''))

before('72143cd786bb',cell('markdown','teachback',r'''
### Three-person teach-back — explain the evidence, not the source code

Each member gives a 60-second explanation using the group's actual numbers:

1. **Loads:** identify the assumed distribution, its total force and centroid; reproduce the root moment.
2. **Structure:** explain one dimension change using mass, bending stiffness and a failure/serviceability distinction.
3. **Manufacturing boundary:** locate all seven baseline ribs and explain why this box analysis cannot approve their spacing, a seam or printed PLA strength.

Then each student answers: “Which result would you distrust first if the real wing differed from this model?” AI may assist with code and wording, but a generated answer is not evidence until the inputs, units, assumptions and one independent check have been verified.
'''))

# Small input guards prevent plausible-looking output from invalid geometry.
for c in nb['cells']:
    s=''.join(c['source'])
    if c.get('id')=='5344e9dda8d2':
        s=s.replace('assert B>2*tw and H>2*tf and min(E_GPA,G_GPA,DENSITY_KG_M3,FACTOR_OF_SAFETY)>0',
                    "assert min(B,H,tf,tw)>0 and B>2*tw and H>2*tf and min(E_GPA,G_GPA,DENSITY_KG_M3,FACTOR_OF_SAFETY,TENSILE_STRENGTH_MPA,COMPRESSIVE_STRENGTH_MPA)>0, 'Use positive material properties and a box with a positive inner void.'")
    if c.get('id')=='1ce9f5087fc1':
        s=s.replace('checks={',"assert DEFLECTION_LIMIT_MM>0, 'Deflection limit must be positive.'\nchecks={") if 'assert DEFLECTION_LIMIT_MM>0' not in s else s
    if c.get('id')=='2a7bbe02f1a3' and 'assert TWIST_LIMIT_DEG>0' not in s:
        s=s.replace('e=OFFSET_E_MM',"assert TWIST_LIMIT_DEG>0, 'Twist limit must be positive.'\ne=OFFSET_E_MM")
    if c.get('id')=='1ce9f5087fc1':
        s=s.replace('7A. Design dashboard','7A. Selected-check dashboard — not a flight or print approval')
    c['source']=s.splitlines(keepends=True)

PATH.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
print('Updated',PATH.name,'with',sum(c.get('id','').startswith('clarity-') for c in nb['cells']),'teaching cells')

if '--execute' in __import__('sys').argv:
    # Lightweight headless execution/figure capture; no notebook packages required.
    import base64
    import contextlib
    import io
    import os
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    scratch=PATH.parents[1]/'tmp'/'numerical_clarity_validation'
    scratch.mkdir(parents=True,exist_ok=True)
    os.chdir(scratch)
    scope={'__name__':'__main__'}
    number=0
    for c in nb['cells']:
        if c['cell_type']!='code':
            continue
        number+=1
        output=[]
        def capture_show(*args,**kwargs):
            for figure_number in plt.get_fignums():
                fig=plt.figure(figure_number)
                buf=io.BytesIO()
                fig.savefig(buf,format='png',dpi=125,bbox_inches='tight')
                output.append(dict(output_type='display_data',metadata={},data={
                    'image/png':base64.b64encode(buf.getvalue()).decode('ascii'),
                    'text/plain':['<Matplotlib figure>']}))
                if c['id'].startswith('clarity-'):
                    (scratch/(c['id']+'.png')).write_bytes(buf.getvalue())
            plt.close('all')
        plt.show=capture_show
        stream=io.StringIO()
        with contextlib.redirect_stdout(stream):
            exec(compile(''.join(c['source']),c['id'],'exec'),scope)
        if stream.getvalue():
            output.append(dict(output_type='stream',name='stdout',text=stream.getvalue().splitlines(keepends=True)))
        c.update(execution_count=number,outputs=output)
        print('PASS',number,c['id'])
    PATH.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    print('Executed all',number,'code cells; refreshed outputs and assertions passed.')
