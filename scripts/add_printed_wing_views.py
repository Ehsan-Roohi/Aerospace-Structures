"""Render original teaching views from the actual baseline CAD, not a substitute box.

Requires the course CadQuery environment plus Matplotlib. Changes teaching assets
and Lecture 1 only; does not change the manufacturing geometry or released engine.
"""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.colors import to_rgb
from matplotlib.patches import Patch, Rectangle
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import cadquery as cq
from mie446_wing import WingParameters, build_wing, validate_wing
from mie446_wing.geometry import _spar_endpoints, _cylinder_between, _cut_spar_holes

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/assets/lecture01"
OUT.mkdir(parents=True, exist_ok=True)
p = WingParameters()
b = build_wing(p)
validate_wing(b).raise_for_failure()
assert p.rib_stations_mm() == (112.5, 146.0, 154.0, 225.0, 296.0, 304.0, 337.5)
BLUE, ORANGE, DARK, GREEN = "#357fa0", "#cc792b", "#27333d", "#64977c"
plt.rcParams.update({"font.size": 11, "axes.titlesize": 14, "figure.facecolor": "white"})
rods = tuple(_cylinder_between(*_spar_endpoints(p, s), s.rod_diameter_mm/2) for s in p.spars)

def mesh(shape):
    v, t = shape.tessellate(0.12, 0.12)
    return np.array([x.toTuple() for x in v]), np.asarray(t)

def draw3(ax, shape, color, offset=0, alpha=1):
    v, t = mesh(shape)
    if not len(t):
        return
    xyz = v[:, [1, 0, 2]].copy()  # span horizontal, chord aft, thickness vertical
    xyz[:, 0] += offset
    faces=xyz[t]
    normals=np.cross(faces[:,1]-faces[:,0],faces[:,2]-faces[:,0])
    normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
    light=np.array([.2,-.45,.87]); light/=np.linalg.norm(light)
    # CAD faces can have opposite triangulation winding: use two-sided lighting.
    illumination=.55+.45*np.abs(normals@light)
    colors=np.asarray(to_rgb(color))[None,:]*illumination[:,None]
    ax.add_collection3d(Poly3DCollection(faces, facecolors=colors, linewidths=0, alpha=alpha,
                                       shade=False, antialiaseds=False, zsort="average"))
    for edge in shape.Edges():
        points,_=edge.sample(20)
        ax.plot([q.y+offset for q in points],[q.x for q in points],[q.z for q in points],
                color="#344650",lw=.35,alpha=.65)

def axes3(ax, length=450):
    ax.set(xlim=(0,length), ylim=(-4,166), zlim=(-12,22), xlabel="Span y (mm)",
           ylabel="Chordwise x (mm)", zlabel="z (mm)")
    ax.set_proj_type("ortho")
    ax.set_box_aspect((length,170,85), zoom=1.25)
    ax.view_init(elev=26, azim=-64)
    ax.grid(False)
    ax.set_axis_off()

def save(fig, name):
    fig.savefig(OUT/name, dpi=170, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("Rendered", name, flush=True)

# 1: Actual complete module solids, with deliberately separated assembly positions.
fig = plt.figure(figsize=(13,6.3))
ax = fig.add_axes([.01,.13,.98,.75], projection="3d")
colors = [BLUE, GREEN, ORANGE]
for i, module in enumerate(b.modules):
    draw3(ax,module,colors[i],offset=24*i)
    ax.text(75+174*i,75,27,f"MODULE {i+1}",ha="center",weight="bold",color=colors[i])
axes3(ax,498)
fig.suptitle("Our printed wing: three modules of ONE semi-wing",fontsize=19,weight="bold",y=.99)
fig.text(.5,.91,"Actual baseline CAD solids; exploded display only — no 24 mm gaps in the assembled wing.",ha="center")
fig.text(.06,.065,"NACA 2412  |  Semi-span 450 mm  |  Root/tip chords 160/100 mm  |  Each module: 150 mm",fontsize=12)
fig.text(.06,.025,"These are manufacturing modules, NOT three separate wing boxes. Vertical display aspect is enlarged.",fontsize=11)
save(fig,"Project_Wing_Modules.png")

# 2: Skin hidden for teaching; internal members are actual CAD parts.
fig = plt.figure(figsize=(13,7.1))
ax = fig.add_axes([.01,.14,.98,.73],projection="3d")
for y in [0.,450.]:
    outline=cq.Workplane("XZ",origin=(0,y,0)).newObject([b.outer]).section().val()
    for edge in outline.Edges():
        points,_=edge.sample(60)
        ax.plot([q.y for q in points],[q.x for q in points],[q.z for q in points],color="#8b969c",lw=.8)
ax.plot([0,450],[0,0],[0,0],color="#8b969c",lw=.8,ls="--")
ax.plot([0,450],[160,100],[0,0],color="#8b969c",lw=.8,ls="--")
for i,rib in enumerate(b.ribs,1):
    draw3(ax,_cut_spar_holes(rib,p),BLUE)
    station = p.rib_stations_mm()[i-1]
    ax.text(station,148 if i%2 else 169,13,f"R{i}",ha="center",fontsize=10,color=BLUE)
for sleeve in b.sleeves:
    draw3(ax,_cut_spar_holes(sleeve,p),ORANGE)
axes3(ax)
fig.suptitle("Inside our wing: shell + seven ribs + two printed sleeves",fontsize=18,weight="bold",y=.98)
fig.text(.5,.90,"Shell hidden; grey lines indicate its envelope. Separate rods omitted so printed sleeves remain visible.",ha="center",fontsize=11)
fig.legend(handles=[Patch(facecolor="#8b969c",label="Shell envelope only"),Patch(facecolor=BLUE,label="Ribs R1–R7"),
                    Patch(facecolor=ORANGE,label="Continuous rod sleeves")],loc="lower center",bbox_to_anchor=(.5,.08),ncol=3,frameon=False)
fig.text(.06,.06,"Sleeves run spanwise through the ribs. No separate skin-mounted stringers or full-depth spar webs are generated.",fontsize=11)
fig.text(.06,.025,"CAD cutaway, not a print orientation or a load-capacity demonstration. Vertical display aspect is enlarged.",fontsize=11)
save(fig,"Project_Wing_Cutaway.png")

# 3: Exact solid/plane intersections: the cavity exists between ribs, not through one.
def section_shape(shape,y):
    return cq.Workplane("XZ",origin=(0,y,0)).newObject([shape]).section().val()

def draw2(ax,shape,y,color):
    section=section_shape(shape,y)
    v,t=mesh(section)
    if len(t):
        ax.add_collection(PolyCollection(v[t][:,:,[0,2]],facecolors=color,edgecolors=color,linewidths=.15,antialiaseds=False))
    for edge in section.Edges():
        points,_=edge.sample(50)
        xy=np.array([[q.x,q.z] for q in points])
        ax.plot(xy[:,0],xy[:,1],color=color,lw=.8)
    return section

fig,axs=plt.subplots(2,1,figsize=(13,8.7))
fig.subplots_adjust(top=.87,bottom=.20,left=.07,right=.98,hspace=.65)
for ax,y,is_rib in zip(axs,[75.,225.],[False,True]):
    draw2(ax,b.complete,y,BLUE)
    for sleeve in b.sleeves: draw2(ax,_cut_spar_holes(sleeve,p),y,ORANGE)
    for rod in rods: draw2(ax,rod,y,DARK)
    chord=p.chord_at(y)
    ax.set(xlim=(-4,164),ylim=(-14,33),xlabel="x aft from the leading edge (mm)",ylabel="z (mm)")
    ax.set_aspect("equal",adjustable="box")
    ax.grid(alpha=.15)
    ax.set_title(f"{'B — THROUGH RIB R4' if is_rib else 'A — BETWEEN RIBS'}: y = {y:g} mm; local chord = {chord:g} mm",loc="left",pad=12)
    if not is_rib:
        ax.annotate("Closed outer shell",xy=(20,10),xytext=(5,26),arrowprops=dict(arrowstyle="->",color=BLUE),color=BLUE)
        ax.annotate("Hollow cavity",xy=(72,2),xytext=(78,25),arrowprops=dict(arrowstyle="->"))
        ax.annotate("Rod inside sleeve",xy=(45,3),xytext=(30,-12),arrowprops=dict(arrowstyle="->",color=ORANGE),color=ORANGE)
        ax.annotate("No spar web here",xy=(90,-3),xytext=(108,24),arrowprops=dict(arrowstyle="->"))
    else:
        ax.annotate("Rib diaphragm fills the section",xy=(67,4),xytext=(50,27),arrowprops=dict(arrowstyle="->",color=BLUE),color=BLUE)
        ax.annotate("Separate rod passing through rib",xy=(39,2.6),xytext=(10,-12),arrowprops=dict(arrowstyle="->"))
fig.suptitle("Two actual CAD sections — a rib is NOT a spanwise web",fontsize=19,weight="bold",y=.98)
fig.text(.5,.925,"Equal x/z scale. Blue = printed shell/rib; orange = sleeve material; dark = separate nominal 4 mm rod.",ha="center",fontsize=11)
fig.text(.07,.07,"Rod overlays are assembly illustrations; rods are NOT printed. The illustrated radial clearance is 0.25 mm, not a measured fit.",fontsize=10)
fig.text(.07,.035,"A closed shell is visible between ribs, but there is no conventional two-web box between the two rod paths.",fontsize=11)
save(fig,"Project_Wing_Sections.png")

# 4: Explicit distinction between bays along the span and cells across a box section.
fig,axs=plt.subplots(2,1,figsize=(13,7.5),gridspec_kw={"height_ratios":[1.3,1]})
fig.subplots_adjust(top=.85,bottom=.11,hspace=.55)
ax=axs[0]
stations=np.array([0,*p.rib_stations_mm(),450.])
for i,(a,z) in enumerate(zip(stations[:-1],stations[1:])):
    yy=np.linspace(a,z,20); c=160-60*yy/450
    ax.fill_between(yy,0,c,color="#d7e8f0" if i%2==0 else "#edf3f6")
for y in p.rib_stations_mm(): ax.plot([y,y],[0,p.chord_at(y)],color=BLUE,lw=2)
for y in [150,300]: ax.axvline(y,color=DARK,ls="--",lw=1.3)
for f in [.3,.6]: ax.plot([0,450],[160*f,100*f],color=ORANGE,lw=2)
ax.set(xlim=(0,450),ylim=(0,170),xlabel="Spanwise position y (mm)",ylabel="Chordwise x (mm)")
ax.set_title("Our wing: shaded spanwise BAY intervals between rib/end stations",loc="left")
ax.text(.01,.97,"Blue = ribs     Orange = sleeves     Dashed = module cuts",transform=ax.transAxes,va="top",fontsize=10,bbox=dict(facecolor="white",edgecolor="none",alpha=.9))
ax=axs[1]; ax.set_xlim(0,14);ax.set_ylim(-.8,3.4);ax.axis("off")
for x,label,middle in [(0.5,"Conventional single-cell box",False),(7.6,"Conventional two-cell box",True)]:
    ax.add_patch(Rectangle((x,0),5.5,2,facecolor="#eef3f6",edgecolor=BLUE,lw=3))
    for xx in [x,x+5.5]: ax.plot([xx,xx],[0,2],color="#b42318",lw=4)
    if middle: ax.plot([x+2.75,x+2.75],[0,2],color="#b42318",lw=4)
    ax.text(x+2.75,2.7,label,ha="center",fontsize=13,weight="bold")
    for xx,txt in ([(x+2.75,"Cell 1")] if not middle else [(x+1.375,"Cell 1"),(x+4.125,"Cell 2")]):
        ax.text(xx,1,txt,ha="center",va="center",fontsize=12)
    ax.text(x+2.75,-.55,"Concept only — NOT installed in our model",ha="center",fontsize=11)
fig.suptitle("Module ≠ rib bay ≠ wing-box cell",fontsize=21,weight="bold",y=.98)
fig.text(.5,.91,"Top: our baseline plan view. Bottom: simplified cross-sections of OTHER structural arrangements.",ha="center")
fig.text(.075,.035,"A true additional box cell needs a connecting web in cross-section. Adding a rod, a stringer, or a module cut does not create one.",fontsize=11)
save(fig,"Project_Wing_Bays_and_Cells.png")

# Publish explanations next to the existing real-aircraft/model comparison.
url="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/"
def md(ident,s): return dict(cell_type="markdown",id=ident,metadata={},source=s.strip().splitlines(keepends=True))
cells=[md("l01-our-wing-overview",f"""
#### 7G-1. Our own wing: what is actually printed?

**Five-minute pre-print bridge:** use the cutaway and the two actual sections below in class.
Keep the exploded view and bay/cell comparison as references while annotating R01; no new CAD
coding or structural sizing is required before October 13.

<img src="{url}Project_Wing_Modules.png" alt="Three actual baseline CAD modules separated for viewing; these are parts of one semi-wing, not separate wing boxes" width="1200">

These views are generated from the **same baseline CAD functions** used by the project notebook:
NACA 2412, 450 mm semi-span, 160/100 mm root/tip chords, three modules, nominal skin setting
1.2 mm, rib thickness 1.6 mm, and two nominal 4 mm rods at local $x/c=0.30$ and $0.60$.
They are CAD illustrations, not photographs or load-test evidence. The two rods are separate
course-issued parts; only shell, ribs and sleeves are printed.

**One semi-wing, three manufacturing modules.** The seams at 150 and 300 mm are printing/assembly
boundaries, not proof of three independent wing boxes. In this exploded view the modules are
shifted apart only to reveal the ends; assemble them at their original stations.
"""),md("l01-our-wing-cutaway",f"""
#### 7G-2. Open the shell: sleeves are not stringers

<img src="{url}Project_Wing_Cutaway.png" alt="Actual CAD internal view: seven blue chordwise ribs, two orange spanwise sleeves; shell hidden and envelope outlined in grey; no separate stringers" width="1200">

The shell has been hidden **for visualization only**; grey lines mark its envelope. Each sleeve is a tube-shaped printed
passage for a rod and meets the ribs. The sleeve's main purpose here is alignment and assembly fit;
it is not an intentionally designed upper/lower skin stringer. The model has **no separate
aircraft-style stringers attached along the inner skins**, and **no full-depth front/rear spar webs**
connecting the upper and lower skins at the two rod paths. Do not draw those missing members into
your interpretation of this picture. Rib positions R1–R7 are explained in Section 7H.
"""),md("l01-our-wing-sections",f"""
#### 7G-3. Is our wing a wing box? Use the precise name

<img src="{url}Project_Wing_Sections.png" alt="Actual sections between ribs at y75mm and through ribR4 at y225mm, distinguishing hollow shell, rib diaphragm, sleeves and separate rods" width="1200">

**Call our artifact a ribbed closed-shell wing demonstrator with rod/sleeve interfaces.**
At a between-rib section its outer shell forms a closed airfoil-shaped perimeter. In that limited
geometric sense it can be compared with a closed torsion shell. However, the region **between
the rods is not a conventional two-spar wing box**: there are no full-depth webs at those locations.
Do not infer its torsional stiffness or load capacity from the rectangular wing-box picture.

The second section cuts through a **chordwise rib**: the rib fills much of the interior while
retaining rod passages. It does not extend continuously along the span as a spar web would.
The nominal gap around each rod is an illustrative clearance, not evidence of the physical fit.
Module seams, material behavior and connections would all matter in a real structural assessment;
a closed section on a screen does not establish a continuous, qualified assembled load path.
"""),md("l01-our-wing-cells",f"""
#### 7G-4. Three different things: module, bay and cell

<img src="{url}Project_Wing_Bays_and_Cells.png" alt="Our spanwise rib bays and module cuts compared with conceptual single-cell and two-cell wing boxes; conceptual webs are not part of the printed model" width="1200">

| Name | What it means | In our baseline |
|---|---|---|
| Module | A separately printed piece | Three, each 150 mm long |
| Rib bay | Spanwise region between adjacent ribs/end structure | Several intervals; not automatically sealed compartments; seams cross two intervals |
| Wing-box cell | A closed structural loop seen in a chordwise section | No conventional front/rear-web box cells between the rods |
| Stringer | A slender spanwise stiffener attached to a skin | No separate stringers in the current CAD |

The bottom diagrams show alternative **concepts**, not hidden parts of our wing or proposed print
files. A multi-cell box needs additional connecting webs. Ribs, rods and stringers do not by
themselves divide a section into the illustrated box cells.
"""),md("l01-our-wing-stringer-decision","""
#### 7G-5. Should we add stringers before October 13?

**Recommendation for this project: retain the current no-separate-stringer baseline for the
October 13 fabrication session.** This is a schedule/manufacturing decision for an unloaded,
non-flying teaching model, not a claim that stringers are unnecessary on aircraft or that the
present shell has proven strength.

Skin-attached stringers can support thin panels and share spanwise axial load. Adding them here
would also add material and interfaces, possibly change unsupported print features, and require
checks for rib/sleeve interference, slicer continuity, print time, mass and local bonding. More
members do not automatically make the assembly better. Do not change the CAD kernel, improvise
glued strips or alter slicer settings as a substitute for an approved design review.

**A later optional comparison:** hold the outer geometry and material/profile fixed, propose
skin-attached stiffeners, compare CAD/slicer mass and printability, and discuss the expected
panel-support benefit. A numerical strength claim additionally needs suitable material,
boundary-condition and joint models; our ideal box-beam notebook does not automatically include
these features. Keep every student-built wing unloaded and undamaged.

For manufacturing context, see the [Prusa design-for-printing guide](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135): wall dimensions and print orientation must be considered together. It is a general design reference, **not** the profile or settings for our K2 Pro/OrcaSlicer workflow.

**Check before proceeding:** point to a sleeve, a rib and a skin in the actual CAD views. Which
member would need to be added to make a conventional two-spar box? Where would a true upper
stringer attach? Why are three printed modules not three box cells?

*Figure provenance: original views generated from this repository's `WingParameters`, `build_wing`
and solid/plane intersections. The bottom single-/two-cell comparison is an original conceptual
schematic. See `scripts/add_printed_wing_views.py`; no manufacturing geometry was changed.*
""")]
path=ROOT/"notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb"
nb=json.loads(path.read_text(encoding="utf-8"))
nb["cells"]=[c for c in nb["cells"] if not c.get("id","").startswith("l01-our-wing-")]
at=next(i for i,c in enumerate(nb["cells"]) if c.get("id")=="l01-seven-ribs-theory")
nb["cells"][at:at]=cells
path.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+"\n",encoding="utf-8")
print("Added five teaching panels; unchanged manufacturing geometry",flush=True)
