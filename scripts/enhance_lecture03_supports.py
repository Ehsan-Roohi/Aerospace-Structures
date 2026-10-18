"""Add explicit support kinematics and the exact HW2B software links."""
from copy import deepcopy

INTRO = """### 1.1 Pin and roller are not the same support

Think about three separate motions at a point on a planar beam:

1. **Axial translation uₓ:** sliding horizontally along the beam.
2. **Vertical translation v:** moving up or down.
3. **Rotation θ:** turning the beam cross-section.

An ideal **pin** prevents both translations but permits rotation. It can exert two force components, Rₓ and Rᵥ, but no reaction couple. A **frictionless roller on horizontal ground** prevents vertical translation only. It permits horizontal sliding and rotation, and supplies only a vertical reaction Rᵥ. The two circles under its triangle identify the roller; a triangle directly on the ground identifies a pin.

| Support | Axial movement uₓ | Vertical movement v | Rotation θ | Possible planar reactions |
|---|---|---|---|---|
| Pin | Restrained | Restrained | Free | Rₓ and Rᵥ |
| Horizontal roller | Free | Restrained | Free | Rᵥ only |
| Fixed clamp | Restrained | Restrained | Restrained | Rₓ, Rᵥ and C |

**Free rotation does not mean zero rotation.** It means the support does not prescribe the rotation. A loaded pin–roller beam usually has nonzero end slopes even though both end displacements are zero. Zero reaction couple is not the same as zero slope.

The roller reaction is normal to the supporting surface. On an inclined surface it is generally not vertical. We use horizontal supporting surfaces here.
"""

INTRO += "\n\n### Configure the software: one Beam workspace\n\nOpen [Beam: supports and loads](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html). Select **Left end** and **Right end** independently (fixed, pin, roller or free), then click **Apply both supports and solve**. Support pictures identify your choices. Loads are preserved when supports change.\n\n- Cantilever: left fixed, right free. Reverse these for a right-hand clamp.\n- Simply supported: one pin and one roller; HW 2B uses left roller, right pin.\n- Fixed–fixed: both fixed. A fixed–pin or fixed–roller beam is also possible, but needs displacement compatibility as well as equilibrium.\n- Free–free and single-pin/free combinations are mechanisms and are rejected. Two rollers leave axial rigid-body motion and are rejected. Pin–pin is a **vertical-bending-only** idealization: this model does not calculate axial redundancy or thermal stress.\n\nAfter each change, compare reactions, end displacement and rotation, shear, moment and stress. The reaction table uses positive downward force and clockwise couple. Optional HW 2B presets set the exact assigned dimensions and loads; they are not separate solvers. Existing example links still open the correct case.\n"

FIGURE = r"""#@title Figure 1S — pin, roller and clamp; geometry first, replacement reactions second
fig, axes = plt.subplots(2, 3, figsize=(15, 8.4), layout='constrained')
support_names = ['Pin', 'Roller on horizontal ground', 'Fixed clamp']
for j, name in enumerate(support_names):
    for row in (0, 1):
        ax = axes[row, j]
        ax.set(xlim=(-1.65, 1.65), ylim=(-1.15, 1.8), aspect='equal')
        ax.axis('off')
        ax.plot([-.75, .9], [.35, .35], color='#19394e', lw=6)
        if row == 0:
            ax.set_title(name, fontsize=17, weight='bold')
            if j < 2:
                ax.add_patch(Polygon([[0,.31],[-.38,-.12],[.38,-.12]],
                                     facecolor='#d6eee0',edgecolor='#176441',lw=2))
                ground = -.15
                if j == 1:
                    for dx in [-.21,.21]:
                        ax.add_patch(Circle((dx,-.24),.09,facecolor='white',edgecolor='#176441',lw=2))
                    ground = -.36
                ax.plot([-.62,.62],[ground,ground],color='#176441',lw=2)
            else:
                ax.add_patch(Rectangle((-.95,-.12),.18,1.05,facecolor='#d6eee0',
                                       edgecolor='#176441',hatch='///',lw=2))
            free_text = ['uₓ = 0; v = 0\nθ is free',
                         'Horizontal sliding is free\nv = 0; θ is free',
                         'uₓ = 0; v = 0; θ = 0'][j]
            ax.text(0,-.77,free_text,ha='center',va='center',fontsize=14)
            if j < 2:
                ax.add_patch(FancyArrowPatch((.78,.83),(1.14,.48),
                             connectionstyle='arc3,rad=-.8',arrowstyle='-|>',
                             mutation_scale=16,color='#236bb4',lw=2))
                ax.text(.7,1.12,'Can rotate',fontsize=12,color='#236bb4')
        else:
            ax.set_title('Support removed',fontsize=15)
            arrow(ax,(0,.35),(0,1.25),'#176441')
            ax.text(-.45,1.28,'Rᵥ',fontsize=16,color='#176441')
            if j != 1:
                arrow(ax,(0,.35),(1.08,.35),'#176441')
                ax.text(1.1,.47,'Rₓ',fontsize=16,color='#176441')
            if j == 2:
                ax.add_patch(FancyArrowPatch((.72,.90),(-.12,.95),
                             connectionstyle='arc3,rad=.8',arrowstyle='-|>',
                             mutation_scale=19,color='#c66b18',lw=2))
                ax.text(.3,1.51,'C',fontsize=16,color='#c66b18')
            ax.text(0,-.48,['Two force components\nNo reaction couple',
                            'One force component\nNo horizontal reaction or couple',
                            'Two force components\nOne reaction couple'][j],
                    ha='center',va='center',fontsize=13)
fig.suptitle('Physical support geometry above · replacement reactions below',fontsize=18)
fig.supxlabel('Local support details only. A complete beam free body must also retain its applied loads.',fontsize=13)
plt.show()
"""

EXPLANATION = """### 1.2 Why the bending app can give the same answer after swapping the pin and roller

- A complete pin–roller beam has three planar reaction unknowns: two components at the pin and one at the roller. The pin prevents the whole beam from sliding horizontally; two horizontal rollers alone would not do that.
- Apply only vertical loads: horizontal equilibrium gives zero horizontal reaction. This does **not** turn the pin into a roller; the pin still restrains axial translation.
- Apply an additional horizontal force: the pin can provide the balancing horizontal reaction; an ideal horizontal roller cannot. A beam with two pins also restrains axial movement at both ends and is not generally equivalent under axial load or thermal expansion.
- Our app solves **vertical bending only**, with v and θ at each node. It does not solve uₓ, axial deformation, inclined rollers or general frame behavior. It must not be used to infer an axial reaction under horizontal loading.
- For the vertical loads in HW 2B, both the pin and roller enforce v = 0 and allow θ to be determined by the beam. Swapping the pin and roller leaves the vertical reactions, deflection and slopes unchanged. It changes the location of axial restraint, not the transverse-bending equations.
- In the app, choose **Left roller / right pin** for HW 2B Case 2. Read v and θ in the **Support reactions and motion** table. At a pin or roller, v = 0 and the reaction couple is zero, but θ may be nonzero.
- The app reports positive reaction force downward and positive reaction couple clockwise. Reverse those two reaction signs to compare with hand calculations using upward and counterclockwise positive. Displacement remains downward-positive in both.
"""

HW_LINKS = """### HW 2B three distributed loads in the software

These links set the complete assessed model: L = 450 mm, b = 16 mm, h = 8 mm, E = 2200 MPa. They replace all previous loads. They are **not** the 2 N point-force examples used earlier in this lecture.

1. [Case 1 cantilever with a triangle increasing toward the free end](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=hw2b-cantilever): load intensity 0 to 0.002 N/mm.
2. [Case 2 left roller and right pin with a trapezoidal load](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=hw2b-roller-pin): 0.001 to 0.002 N/mm.
3. [Case 3 fixed–fixed with a triangle greatest at the left end](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=hw2b-fixed): 0.002 to 0 N/mm.

Read the support reaction force, reaction couple, vertical displacement and rotation from the table. The software also lets you select a triangle with zero intensity at either end. This section is a setup aid for the existing HW 2B tasks, not an additional assignment.
"""

def extra_cells():
    return [
        dict(id='l03-support-pin-roller',cell_type='markdown',metadata={},source=INTRO),
        dict(id='l03-support-figure',cell_type='code',metadata={},source=FIGURE,outputs=[],execution_count=None),
        dict(id='l03-support-bending-scope',cell_type='markdown',metadata={},source=EXPLANATION),
    ]

def enhance(cells):
    if any(c.get('id')=='l03-support-pin-roller' for c in cells):
        return
    at=next(i for i,c in enumerate(cells) if c['source'].startswith('## 2. Calculate support reactions'))
    cells[at:at]=deepcopy(extra_cells())
    at=next(i for i,c in enumerate(cells) if c['source'].startswith('## 7. Four-minute exit ticket'))
    cells.insert(at,dict(id='l03-hw2b-exact-cases',cell_type='markdown',metadata={},source=HW_LINKS))

if __name__ == '__main__':
    import base64, contextlib, io, json
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    path=root/'notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb'
    nb=json.loads(path.read_text(encoding='utf-8'))
    enhance(nb['cells'])
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    env={}
    exec(next(c['source'] for c in nb['cells'] if c['cell_type']=='code'),env)
    cell=next(c for c in nb['cells'] if c.get('id')=='l03-support-figure')
    exec(cell['source'],env)
    cell['outputs']=[]
    for number in plt.get_fignums():
        fig=plt.figure(number)
        buffer=io.BytesIO()
        fig.savefig(buffer,format='png',bbox_inches='tight')
        cell['outputs'].append(dict(output_type='display_data',
             data={'image/png':base64.b64encode(buffer.getvalue()).decode(),
                   'text/plain':['Pin roller and fixed support geometry and reaction diagrams']},metadata={}))
        preview=root/'tmp/lecture03-previews/support_pin_roller.png'
        preview.parent.mkdir(parents=True,exist_ok=True)
        preview.write_bytes(buffer.getvalue())
    plt.close('all')
    for n,c in enumerate([c for c in nb['cells'] if c['cell_type']=='code'],1):
        c['execution_count']=n
    path.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    print('Lecture 03 support explanation, executed figure and HW2B deep links updated.')
