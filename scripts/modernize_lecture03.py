"""Keep Lecture 03 aligned with the current Beam Lab, without assignment answers."""
import uuid

APP='https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html'

INTERIOR=r'''### Interior support is not an internal hinge

The four end choices (fixed, pin, roller and free) are not four limits on beam configuration. A pin, roller or clamp can also be placed at an **interior station**. The beam may continue beyond the support as an overhang.

| Feature at x = a | Vertical displacement | Rotation | External reaction | Internal bending moment |
|---|---|---|---|---|
| Grounded interior pin or roller on a continuous beam | v(a) = 0 | One continuous, unknown rotation | Vertical force; no external couple | Generally not zero; continuous if no point couple acts |
| Grounded interior clamp | v(a) = 0 | θ(a) = 0 | Force and external couple | May jump across its reaction couple |
| Internal hinge joining two beam pieces | Same displacement on both pieces; not necessarily zero | Left and right rotations may differ | No ground reaction unless separately supported | M(a⁻) = M(a⁺) = 0, with no applied hinge couple |

**A grounded pin does not cut the beam or release its bending continuity.** Its zero external reaction couple does not require the internal moment of a continuous beam to vanish there. An internal hinge is a connection between two pieces, not a support attached to ground. The drawings below show physical supports and applied loads only; reaction arrows belong in a separate free-body drawing.

In Beam Lab use **+ Interior support**, choose its kind and x, or select **Place → Pin / Roller / Fixed** and click the beam. Move the support with its handle or enter x numerically. Use **+ Internal hinge** or **Place → Hinge** for a genuine rotation release. Read the stability message and solve again. An internal hinge can create a mechanism; additional restraints are not optional if needed for stability. These capabilities are optional exploration and add no tasks to HW 3.
'''

DRAW=r'''#@title Figure 1I — grounded interior support versus internal connection
fig, axes = plt.subplots(2, 1, figsize=(12, 7.8), layout='constrained')
for ax in axes:
    ax.set(xlim=(-35,490), ylim=(-65,75)); ax.axis('off')
    ax.plot([0,450],[0,0],lw=5,color='#19394e')
    support(ax,0,'fixed')
    arrow(ax,(420,46),(420,3)); ax.text(426,46,'P down',fontsize=13)
    ax.text(0,-52,'x = 0',ha='center'); ax.text(450,-52,'x = L',ha='center')
support(axes[0],270,'pin')
axes[0].text(270,-48,'a: grounded interior pin',ha='center',fontsize=13)
axes[0].set_title('Continuous beam with an interior pin and an overhang')
axes[0].text(25,64,'v(a) = 0; θ is continuous; internal M(a) need not be zero',fontsize=14)
# A stable hinged arrangement: left clamp, hinge, right roller.
support(axes[1],450,'roller')
axes[1].add_patch(Circle((225,0),5,facecolor='white',edgecolor='#19394e',lw=2,zorder=4))
axes[1].text(225,-36,'a: internal hinge, no ground support',ha='center',fontsize=13)
axes[1].set_title('Two connected beam pieces with a rotation release')
axes[1].text(25,64,'v(a−) = v(a+); θ(a−) may differ from θ(a+); M at hinge = 0',fontsize=14)
fig.supxlabel('Physical systems only: applied load shown; no replacement reactions in these panels.',fontsize=12)
plt.show()
'''

WORKFLOW='''### Current Beam Lab workflow and load previews

1. Start in **Beam**. The normal opening has no applied load. An explicitly selected example link loads its stated example; do not mistake it for the empty opening.
2. Enter L and E; select **Cross-section → Solid rectangle** and enter b and h. Check A and I. Pick the left/right supports separately and remove unwanted interior supports or hinges. Keep self-weight off when it is neglected in the problem.
3. Under **Loads**, select a point force, bending couple, uniform, triangular, trapezoidal, elliptic or parabolic line load. Select a graphical tool and click a station, or drag an interval, then confirm its signed magnitude. Numeric fields provide precise coordinates. Selecting a tool or previewing a curve does not apply it.
4. **F is total force in N; q is intensity in N/mm.** The signed area under q is F. For example, 2 N distributed uniformly over 450 mm means q = 0.00444444 N/mm, not 2 N/mm. The live profile shows the interval, shape, total, peak intensity and resultant station. Curved laws accept total F or peak intensity; the other is derived.
5. **Shared intensity scale** compares line-load magnitudes, so a small load may look almost flat. **Independent heights** makes each shape visible but cannot compare magnitudes. This changes the drawing, not the applied forces or solution. Point-force arrows are schematic, not intensity measurements.
6. CSV tables are linear between supplied stations. The optional power-law generator makes an explicitly approximate 31-point table with a selectable exponent, interval and maximum location, normalized to the requested total. Preview and validate before applying. HW 3 needs only the stated triangular/trapezoidal loads.
7. Press **Solve**. Pending results belong to the last solved model. Use **Support reactions and motion**, **Diagrams**, **Cut & section** and the station table to distinguish reactions from internal V and M. A moving cut is not another support.
8. **Report & export** offers station, plot-sample and reaction CSV files, PNG for each plot, a printable/PDF report, and JSON study save/re-import or a share link. A/B comparison uses saved independent studies. These tools support checking; extra exports are not required for HW 3.

Beam Lab solves transverse Euler–Bernoulli bending, not axial/frame response or wing torsion. Printed-wing and D.520 workspaces additionally use chord position to calculate bending and twist. Their geometry and material models are not substitutes for this lecture's solid rectangular beam.
'''

def modernize(cells):
    for c in cells:
        c['source']=c['source'].replace('HW 2B','HW 3').replace('HW2B','HW3').replace('beamCase=hw2b-','beamCase=hw3-')
        if c['cell_type']!='markdown':
            for old,new in [('RA = 2 N up','RA = -2 N (up)'),('RA = 1 N up','RA = -1 N (up)'),('RB = 1 N up','RB = -1 N (up)'),('CA = 112.5 N mm CCW','CA = -112.5 N mm (CCW)'),('CA = 450 N mm CCW','CA = -450 N mm (CCW)'),('CA = 900 N mm CCW','CA = -900 N mm (CCW)'),('CB = 112.5 N mm CW','CB = +112.5 N mm (CW)')]:c['source']=c['source'].replace(old,new)
            continue
        s=c['source']
        s=s.replace('Optional HW 3 presets set the exact assigned dimensions and loads; they are not separate solvers. Existing example links still open the correct case.','HW 3 students enter all model inputs themselves. Lecture example links remain available for the separate teaching examples, not for the assigned models.')
        if s.startswith('### HW 3 three distributed loads'):
            s='''### HW 3 manual model setup

Open the blank [Beam Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html), not a lecture preset. Configure the left/right supports, rectangular section, L, E and distributed load from the [HW 3 handout](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/assignments/homework-03/README.md). Remove unintended loads, interior supports and hinges; leave self-weight off. Use Requested elements = 30. No mesh study or extra screenshots are required. The assigned cases are not available as preconfigured solved examples.
'''
        s=s.replace('Reverse those two reaction signs to compare with hand calculations using upward and counterclockwise positive. Displacement remains downward-positive in both.','Use the same signs in the hand solution and app: force downward positive, external couple clockwise positive, displacement downward positive. Negative results identify the opposite physical direction.')
        s=s.replace('Hand free bodies use upward forces and counterclockwise (CCW) couples as positive. The app uses downward force and clockwise couples as positive, so its reaction signs are reversed.','Hand calculations and the app both use downward-positive reactions and clockwise-positive external couples. Negative force means upward; negative external couple means counterclockwise (CCW). Internal M is separately sagging-positive.')
        if s.startswith('The free end is not a support'):
            s=s.replace('R_A-2=0','R_A+2=0').replace('R_A=2\\ \\mathrm{N\\ upward}','R_A=-2\\ \\mathrm{N}\\quad(\\mathrm{upward})').replace('C_A-2(225)=0','C_A+2(225)=0').replace('C_A=450\\ \\mathrm{N\\,mm\\ CCW}','C_A=-450\\ \\mathrm{N\\,mm}\\quad(\\mathrm{CCW})')
        if s.startswith('This drawing now has'):
            s=s.replace('R_A-P=0','R_A+P=0').replace('C_A-PL=0','C_A+PL=0').replace('Rₐ = 2 N upward and Cₐ = 900 N mm CCW','Rₐ = −2 N (upward) and Cₐ = −900 N mm (CCW)')
        if s.startswith('For a uniform line load'):
            s=s.replace('R_A-qL=0','R_A+qL=0').replace('C_A-(qL)','C_A+(qL)').replace('Rₐ = 2 N upward and Cₐ = 450 N mm CCW','Rₐ = −2 N (upward) and Cₐ = −450 N mm (CCW)')
        if s.startswith('The pin supplies horizontal/vertical'):
            s=s.replace('R_A+R_B-2=0','R_A+R_B+2=0').replace('R_B(450)-2(225)=0','R_B(450)+2(225)=0').replace('R_B=1\\ \\mathrm{N\\ upward}','R_B=-1\\ \\mathrm{N}\\quad(\\mathrm{upward})').replace('Rₐ = 2 − 1 = 1 N upward','Rₐ = −2 − (−1) = −1 N (upward)')
        if s.startswith('Both supports prevent translation'):
            s=s.replace('R_A+R_B-2=0','R_A+R_B+2=0').replace('C_A+C_B+450R_B-2(225)=0','C_A+C_B+450R_B+2(225)=0')
            s=s.replace('-C_A+R_Ax','C_A-R_Ax')
            s=s.replace('-C_A L+\\frac{R_A L^2}{2}-','C_A L-\\frac{R_A L^2}{2}-').replace('-\\frac{C_A L^2}{2}+\\frac{R_A L^3}{6}-','\\frac{C_A L^2}{2}-\\frac{R_A L^3}{6}-')
            s=s.replace('-450C_A+101250R_A-50625=0','450C_A-101250R_A-50625=0').replace('-101250C_A+15187500R_A-3796875=0','101250C_A-15187500R_A-3796875=0')
            s=s.replace('Rₐ = 1 N. Substitution in the first gives Cₐ = 112.5 N mm CCW. Equilibrium then gives R<sub>B</sub> = 1 N and C<sub>B</sub> = −112.5 N mm (clockwise).','Rₐ = −1 N. Substitution gives Cₐ = −112.5 N mm (CCW). Equilibrium gives R<sub>B</sub> = −1 N and C<sub>B</sub> = +112.5 N mm (clockwise).')
            s=s.replace('C_A=\\frac{PL}{8}=112.5\\ \\mathrm{N\\,mm\\ CCW},\\qquad C_B=-112.5\\ \\mathrm{N\\,mm\\ CW}','C_A=-\\frac{PL}{8}=-112.5\\ \\mathrm{N\\,mm}\\ (\\mathrm{CCW}),\\qquad C_B=+112.5\\ \\mathrm{N\\,mm}\\ (\\mathrm{CW})')
            s=s.replace('112.5 − 112.5 + 450 − 450 = 0','−112.5 + 112.5 − 450 + 450 = 0').replace('The app reports −112.5 at A and +112.5 at B because its positive couple direction is clockwise.','The app reports the same −112.5 at A and +112.5 at B with our shared clockwise-positive convention.')
        if s.startswith('### Compare reactions before'):
            s=s.replace('A: 2 N upward','A: −2 N (upward)').replace('A: 450 N mm CCW','A: −450 N mm (CCW)').replace('A and B: 1 N upward each','A and B: −1 N each (upward)').replace('A: 112.5 CCW; B: 112.5 CW','A: −112.5 (CCW); B: +112.5 (CW)')
        c['source']=s
    def new(kind,source):
        c=dict(cell_type=kind,id=uuid.uuid5(uuid.NAMESPACE_URL,source).hex[:8],metadata={},source=source.strip())
        if kind=='code':c.update(execution_count=None,outputs=[])
        return c
    i=next(i for i,c in enumerate(cells) if c['source'].startswith('### 1.2 Why'))
    cells[i:i]=[new('markdown',INTERIOR),new('code',DRAW)]
    j=next(i for i,c in enumerate(cells) if c['source'].startswith('### What the app actually solves'))
    cells.insert(j,new('markdown',WORKFLOW))
    cells[j+1:j+1]=[new('markdown',MESH),new('code',MESH_DRAW)]
    for c in cells:c['id']=uuid.uuid5(uuid.NAMESPACE_URL,c['source']).hex[:8]

MESH='''### What are 10, 30 or 40 elements?

An element is a numerical segment, not a separate physical beam piece. Every node has displacement v and rotation θ. The solver assembles stiffness and consistent loads, solves nodal values and interpolates displacement between nodes. With L = 450 mm, nominal element lengths L/N are 45 mm (N = 10), 15 mm (N = 30) and 11.25 mm (N = 40).

Support, point-load, line-load boundary and hinge stations become nodes even if they miss a regular grid point. Thus the requested count is not always the actual count. Mesh lines are not ribs, joints, cracks or new supports.

More elements generally improve between-node interpolation and mode estimates at greater computational cost. They do not change E or I and do not make the physical beam stronger. For the constant-EI examples, exact consistent loading can already produce highly accurate nodal motion and equilibrium-recovered V/M, so some numbers may barely change as N changes. This is not a guarantee for arbitrary models or between-node motion.

To study mesh sensitivity, keep every physical input fixed and compare the same quantity at the same x for 10, 30 and 40 elements. Check absolute differences as well as relative differences; relative error near a zero result is misleading. Do not compare different mesh-node locations as if they were the same station. Modal convergence and static convergence need not be the same. Numerical convergence does not validate the material, clamp or small-deflection assumptions.

**HW 3 instruction: use 30 requested elements for all three cases. No convergence table or extra mesh runs are required.** Other problems have no universally guaranteed element count.
'''
MESH_DRAW='''#@title Figure 7M — same physical beam with three numerical meshes
fig, axes = plt.subplots(3,1,figsize=(11,5.3),layout='constrained')
for ax,n in zip(axes,[10,30,40]):
    xx=np.linspace(0,450,n+1)
    ax.plot(xx,np.zeros_like(xx),'-o',color='#236bb4',lw=2,ms=3)
    ax.set(xlim=(-8,458),ylim=(-.5,.6),title=f'{n} requested elements: nominal length 450/{n} = {450/n:g} mm')
    ax.text(225,-.25,'Same physical span L = 450 mm',ha='center',fontsize=12)
    ax.axis('off')
fig.supxlabel('Uniform meshes shown for explanation; required load/support/hinge stations can add or move nodes.',fontsize=12)
plt.show()
'''
