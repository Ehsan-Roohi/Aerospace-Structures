"""Extend the current Lecture 01 in place, preserving unrelated cells and outputs.

Original scientific teaching diagrams use black Times New Roman labels.
Sources are linked next to aircraft-specific statements; schematics are generic.
"""
from pathlib import Path
import ast
import base64
import contextlib
import io
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, Rectangle, Arc
from matplotlib import font_manager

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/assets/lecture01"
NB = ROOT / "notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb"
RAW = "https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/"
PAPER = "https://elib.dlr.de/191143/1/JoA_Paper_Lilienthal_Flight_Controls.pdf"
NASA36 = "https://www.nasa.gov/aeronautics/x-36-tailless-fighter/"
NASA48 = "https://www.nasa.gov/wp-content/uploads/2021/09/171791main_FS-090-DFRC.pdf"
MAGMA = "https://www.baesystems.com/en-uk/article/magma-the-future-of-flight"


def image(name, alt, width=1050):
    return f'<p align="center"><img src="{RAW}{name}" alt="{alt}" width="{width}"></p>'


def cell(kind, identifier, source):
    item = {"cell_type": kind, "id": identifier, "metadata": {},
            "source": source.strip().splitlines(keepends=True)}
    if kind == "code":
        item.update(execution_count=None, outputs=[])
    return item


def label(ax, x, y, text, size=12, **kw):
    return ax.text(x, y, text, color="black", fontsize=size, **kw)


def arrow(ax, start, end, text=None, offset=(0, 0)):
    ax.annotate("", xy=end, xytext=start,
                arrowprops={"arrowstyle": "-|>", "color": "black", "lw": 1.6})
    if text:
        label(ax, end[0] + offset[0], end[1] + offset[1], text)


def leader(ax, start, end, text, ha="left"):
    ax.plot([start[0], end[0]], [start[1], end[1]], color="black", lw=1)
    label(ax, *start, text, ha=ha, va="bottom",
          bbox={"facecolor": "white", "edgecolor": "none", "pad": 1.5})


def frame(ax, title, xlim=(0, 10), ylim=(0, 7)):
    ax.set(xlim=xlim, ylim=ylim, aspect="equal")
    ax.axis("off")
    ax.set_title(title, fontsize=16, color="black", pad=14)


def save(fig, name):
    fig.savefig(ASSETS / (name + ".png"), dpi=190, facecolor="white", bbox_inches="tight")
    svg=io.StringIO()
    fig.savefig(svg, format="svg", facecolor="white", bbox_inches="tight")
    (ASSETS / (name + ".svg")).write_text(
        "\n".join(line.rstrip() for line in svg.getvalue().splitlines())+"\n",encoding="utf-8")
    plt.close(fig)


def wing(ax, cx=5, cy=3.5):
    ax.add_patch(Polygon([(cx,cy+1.2),(cx-4,cy-0.3),(cx-3.7,cy-1.4),
                         (cx,cy-0.6),(cx+3.7,cy-1.4),(cx+4,cy-0.3)],
                        fc="0.94", ec="black", lw=1.5))


def diagrams():
    times = Path("C:/Windows/Fonts/times.ttf")
    if times.exists():
        font_manager.fontManager.addfont(str(times))
    plt.rcParams.update({"font.family": "Times New Roman", "text.color": "black",
                         "axes.labelcolor": "black", "svg.fonttype": "none"})

    fig, axes = plt.subplots(1, 2, figsize=(15, 6.3))
    ax = axes[0]
    frame(ax, "Lilienthal: the tail and the tip devices are separate", ylim=(0,8))
    wing(ax, cy=4.4)
    ax.plot([5,5], [4.6,1.0], color="black", lw=2)
    ax.add_patch(Polygon([(5,2.0),(3.7,0.9),(5,0.55),(6.3,0.9)], fc="0.9", ec="black"))
    ax.plot([5,5], [0.7,2.1], color="black", lw=5)
    ax.add_patch(Circle((5,4.1), .18, fc="black"))
    for x in (1.1,8.9):
        ax.plot([x-.18,x+.18], [4.25,3.55], color="black", lw=4)
        ax.plot([x,5], [3.9,4.1], color="black", lw=1, ls="--")
    arrow(ax, (5,7.3), (5,6.0))
    label(ax, 5.25,6.7,"Flow: nose to tail")
    leader(ax,(0.2,6.2),(1.1,4.0),"Rotating wing-tip vane")
    leader(ax,(0.2,2.7),(4.9,4.1),"Pilot / hip cradle")
    leader(ax,(6.2,2.3),(5.05,1.6),"Aft vertical surface")
    leader(ax,(6.7,.3),(6.0,1.0),"Horizontal tail")
    label(ax,0.2,0,"Conceptual plan view; no dimensions or linkage simultaneity implied",10)
    ax=axes[1]
    frame(ax,"Tip vane: rotation about an upright post",ylim=(0,8))
    ax.plot([1,9], [4.5,4.5], color="black", lw=2)
    label(ax,1,4.7,"Local wing tip")
    ax.add_patch(Circle((5,4.0), .09, fc="black"))
    ax.plot([5,5], [2.7,5.5], ls="--", color="black", lw=2)
    ax.plot([3.7,6.3], [4,4], color="black", lw=5)
    ax.add_patch(Arc((5,4),2.2,2.2,theta1=0,theta2=90,ec="black",lw=1.5))
    arrow(ax,(3,7),(3,5.7),"Flow",(0.25,0.25))
    leader(ax,(6.6,6.0),(5,5.0),"Neutral: aligned with flow")
    leader(ax,(6.4,2.7),(6.1,4),"Turned: cross-flow drag")
    label(ax,0.5,1.5,"The dot is the post seen from above.\nThe physical vane remains vertical.",13)
    label(ax,0.5,.3,"Historical hardware: wing-tip rudder\nFunctional term in the paper: roll spoileron",13)
    fig.tight_layout(pad=2)
    save(fig,"Controls_Lilienthal_Tail_and_Tip_Map")

    fig,axes=plt.subplots(2,2,figsize=(14,10))
    for ax,title in zip(axes.flat,["A. Conventional aft tail","B. V-tail: inclined surfaces",
                                  "C. Winglets carry rudders","D. Finless wing: other yaw effectors"]):
        frame(ax,title)
        wing(ax,cy=4.1)
    ax=axes[0,0]
    ax.plot([5,5],[4.4,1.1],color="black",lw=2)
    ax.add_patch(Rectangle((3.8,1.0),2.4,.55,fc="0.9",ec="black"))
    ax.plot([5,5],[1.1,2.0],color="black",lw=5)
    label(ax,0.4,.25,"Separate pitch and yaw surfaces at the rear",13)
    leader(ax,(6.1,2.2),(5,1.65),"Fin + rudder")
    ax=axes[0,1]
    ax.plot([5,5],[4.4,1.1],color="black",lw=2)
    ax.plot([3.6,5,6.4],[1.9,1.0,1.9],color="black",lw=6)
    label(ax,.4,.25,"Ruddervators combine pitch and yaw commands",13)
    label(ax,6.6,2.1,"Inclined tail",12)
    ax=axes[1,0]
    for x in (1.1,8.9):
        ax.plot([x,x],[3.9,5.3],color="black",lw=5)
    ax.plot([1.5,4.3],[2.65,3.3],color="black",lw=5)
    ax.plot([5.7,8.5],[3.3,2.65],color="black",lw=5)
    label(ax,.4,.35,"Elevons at trailing edge; vertical rudders at tips",13)
    label(ax,0.4,5.65,"Vertical winglet",12)
    ax=axes[1,1]
    ax.plot([1.5,4.3],[2.65,3.3],color="black",lw=5)
    ax.plot([5.7,8.5],[3.3,2.65],color="black",lw=5)
    leader(ax,(6.7,5.8),(8.1,2.75),"Elevon / drag device")
    label(ax,.4,.35,"Yaw can use drag, propulsive force or other effectors",12)
    fig.suptitle("Identify the architecture before naming the moving surface",fontsize=21,y=.99)
    fig.text(.5,.005,"Generic plan-view sketches; the V-tail sketch projects inclined surfaces. Aircraft-specific examples follow.",ha="center",fontsize=12)
    fig.tight_layout(rect=(0,.04,1,.96),pad=2)
    save(fig,"Controls_Architecture_Comparison")

    fig,axes=plt.subplots(2,3,figsize=(16,10))
    titles=["Elevons: common motion","Elevons: opposite motion","V-tail: force projection",
            "Split drag rudder","Mechanical thrust vectoring","Circulation control / fluidic nozzle"]
    for ax,title in zip(axes.flat,titles): frame(ax,title,xlim=(0,8),ylim=(0,6))
    for ax,mode in zip(axes[0,:2],("pitch","roll")):
        ax.plot([.6,7.4],[3,3],color="black",lw=2)
        ax.plot([1,3],[3,3],color="black",lw=6)
        ax.plot([5,7],[3,3],color="black",lw=6)
        arrow(ax,(2,3.15),(2,4.5))
        arrow(ax,(6,3.15),(6,4.5) if mode=="pitch" else (6,1.6))
        label(ax,4,5.2,"Rear-view command schematic",12,ha="center")
        label(ax,4,.5,"Same sense: pitch channel" if mode=="pitch" else "Opposite sense: roll channel",13,ha="center")
    ax=axes[0,2]
    ax.plot([1.8,4,6.2],[4,2,4],color="black",lw=4)
    arrow(ax,(2.7,3.2),(3.5,4.15)); arrow(ax,(5.3,3.2),(4.5,4.15))
    label(ax,4,5.15,"Rear view: equal local normal forces",11,ha="center")
    label(ax,4,.4,"Vertical components add; lateral cancel.\nDifferential force reverses this pattern.",12,ha="center")
    ax=axes[1,0]
    ax.plot([.5,4.5],[3,3],color="black",lw=2)
    ax.plot([4.5,6.6],[3,4.1],color="black",lw=3)
    ax.plot([4.5,6.6],[3,1.9],color="black",lw=3)
    arrow(ax,(.6,4.6),(2.2,4.6),"Flow",(.2,0))
    arrow(ax,(6.3,3),(7.6,3))
    label(ax,4,.4,"Open halves increase local drag.\nOne side produces a yaw moment.",12,ha="center")
    ax=axes[1,1]
    ax.add_patch(Polygon([(1.1,2.2),(4.2,2.2),(5,1.4),(5,2.6),(4.2,3.4),(1.1,3.4)],fc="0.93",ec="black"))
    arrow(ax,(4.7,2),(7.2,.9)); arrow(ax,(3,2.8),(1.4,3.6))
    label(ax,.2,4.7,"Jet direction and reaction force oppose",11)
    label(ax,4,.2,"Nozzle / mounts carry redirected thrust",12,ha="center")
    ax=axes[1,2]
    ax.plot([.7,4.8],[3.3,3.3],color="black",lw=2)
    ax.add_patch(Arc((4.8,3.05),.5,.5,theta1=-90,theta2=90,ec="black",lw=2))
    for y in (3.45,3.65): arrow(ax,(3.8,y),(5.0,y-.25))
    label(ax,.3,5,"Air slot near a rounded trailing edge",11)
    label(ax,4,.4,"Blowing changes aerodynamic force.\nAir jets can also redirect engine exhaust.",12,ha="center")
    fig.suptitle("Different hardware can create the required aircraft moment",fontsize=22,y=.99)
    fig.text(.5,.005,"Qualitative teaching sketches, not construction drawings or aircraft-specific control laws. Arrows are commands or forces as labeled.",ha="center",fontsize=11)
    fig.tight_layout(rect=(0,.035,1,.96),pad=2)
    fig.subplots_adjust(hspace=.45)
    save(fig,"Controls_Modern_Effectors")


MIXER = r'''
#@title 7A-11. Elevon mixer — predict before running { display-mode: "form" }
pitch_command_deg = 8.0 #@param {type:"number"}
right_roll_command_deg = 5.0 #@param {type:"number"}
servo_limit_deg = 15.0 #@param {type:"number"}
import numpy as np
import matplotlib.pyplot as plt
from IPython.display import Markdown, display

if not np.all(np.isfinite([pitch_command_deg, right_roll_command_deg, servo_limit_deg])):
    raise ValueError("Use finite numeric inputs.")
if servo_limit_deg <= 0:
    raise ValueError("The symmetric servo limit must be positive.")

# Local elevon deflection: positive = trailing edge up.
# R > 0 requests right wing down: left down, right up in this idealized example.
requested = np.array([pitch_command_deg - right_roll_command_deg,
                      pitch_command_deg + right_roll_command_deg])
achieved = np.clip(requested, -servo_limit_deg, servo_limit_deg)
pitch_channel = achieved.sum() / 2
roll_channel = (achieved[1] - achieved[0]) / 2

fig, ax = plt.subplots(figsize=(8, 4.2))
locations = np.arange(2)
ax.bar(locations-.18, requested, .36, color="white", edgecolor="black",
       hatch="//", label="Requested")
ax.bar(locations+.18, achieved, .36, color="0.7", edgecolor="black", label="After limit")
ax.axhline(servo_limit_deg, color="black", ls="--", lw=1)
ax.axhline(-servo_limit_deg, color="black", ls="--", lw=1)
ax.axhline(0, color="black", lw=.8)
ax.set_xticks(locations, ["Left elevon", "Right elevon"])
ax.set_ylabel("Local deflection (deg); positive = trailing edge up")
ax.set_title("Control mixing and actuator saturation — illustrative only")
ax.legend(frameon=True, facecolor="white", edgecolor="none", framealpha=1, loc="upper left")
ax.grid(False)
fig.tight_layout()
plt.show()
display(Markdown(
    f"Requested left/right: **{requested[0]:.1f} / {requested[1]:.1f} deg**. "
    f"Achieved left/right: **{achieved[0]:.1f} / {achieved[1]:.1f} deg**.\n\n"
    f"Recovered pitch/roll command channels: **{pitch_channel:.1f} / {roll_channel:.1f} deg**. "
    "These are mixed command channels, not measured attitude angles or aircraft moments."
))
assert np.all(np.abs(achieved) <= servo_limit_deg)
if np.all(np.abs(requested) <= servo_limit_deg):
    assert np.allclose([pitch_channel, roll_channel],
                       [pitch_command_deg, right_roll_command_deg])
print("Try P=12, R=8, limit=15: predict left=4 and right=20 requested;")
print("after clipping, left=4 and right=15: pitch channel=9.5, roll channel=5.5.")
print("This mixes geometry commands. It does not compute lift, hinge torque, stability or strength.")
'''


def additions():
    history = cell("markdown","l01-controls-lilienthal-tail",f'''
#### 7A-3a. Did Lilienthal's glider have a tail? Yes.

{image("Controls_Lilienthal_Tail_and_Tip_Map.png", "Conceptual plan view of Lilienthal's glider showing the aft horizontal and vertical tail separately from the wing-tip vanes, plus a plan-view vane-rotation inset")}

The 1895 Experimental Monoplane had **horizontal and vertical tail surfaces**. The paper describes a hip-cradle linkage that deflected the aft vertical surface for yaw; the photographs leave uncertainty about its precise pivot/flexure arrangement. The horizontal tail should not be taught as a conventional, independently commanded modern elevator. Weight shift supplied pitch control; an actively commanded elevator sketch is mentioned for 1896, without a known flight demonstration. [Raffel et al., pp. 1–2, 7–9]({PAPER}).

Keep **tail presence**, **surface motion**, and **control purpose** separate. A wing-tip vane does not demonstrate that the aircraft lacked an aft tail. This schematic gathers devices for identification; it does not assert that every experimental linkage operated simultaneously.

{image("Controls_Lilienthal_Full_1895.jpg", "Historic overall photograph of the Experimental Monoplane; the tail is visible behind the fabric-covered wing", 780)}

**Read the photograph:** find the pilot, braced wing and aft tail. The large surface above the pilot is the banked wing, not a giant vertical tail. Credit: P. W. Preobrashenski / Otto-Lilienthal-Museum, 1895; [public-domain source](https://commons.wikimedia.org/wiki/File:Otto-Lilienthal-Museum_id_F0158b.jpg).

{image("Controls_Lilienthal_Experimental_View.jpg", "Annotated 1895 photograph showing hip cradle, control rods, control wires and leading-edge flap", 1150)}

**Read the linkage:** start at the labeled hip cradle, follow a lever and control rod, then a wire. This view documents a control-system arrangement; it does not by itself identify the tip-vane experiment. Credit: Richard Neuhauss, 1895; annotation published by [Beilich, CC BY 4.0](https://commons.wikimedia.org/wiki/File:Otto_Lilientahl%27s_Experimental_Monoplane.tif); converted from TIFF to JPEG, existing annotations retained.

{image("Controls_Lilienthal_Warping_Letter.jpg", "Lilienthal's 3 October 1895 handwritten wing-warping sketch", 700)}

**Read the sketch:** compare the alternative outlines. Wing warping changes wing shape/incidence; a rotating vane moves a separate part. Credit: Otto Lilienthal, 3 October 1895, Deutsches Museum archive 1932-1/11; [public-domain source](https://commons.wikimedia.org/wiki/File:Lilienthal_experimental_device_1895_detail.gif). Converted from GIF to JPEG.

**Instructor prompt:** “Which drawing proves that a tail exists? Which reveals a linkage? Which concerns wing deformation?” Students point before explaining.
''')
    physics = cell("markdown","l01-controls-tip-force-geometry",r'''
#### 7A-3b. A vertical vane is not automatically a pure-yaw device

Use body axes **$x$ forward, $y$ right, $z$ down**, with moments about the CG. Let $\mathbf r$ locate the force relative to the CG:

$$\mathbf M_{CG}=\mathbf r\times\mathbf F,$$
$$M_x=yF_z-zF_y,\qquad M_y=zF_x-xF_z,\qquad M_z=xF_y-yF_x.$$

For the **right wing**, $y>0$. A lift reduction gives a positive increment $\Delta F_z$ and tends to roll the right wing down. Additional drag gives $\Delta F_x<0$ and tends to yaw the nose right. These signs follow the declared axes. A purely lateral force $F_y$ at $z=0$ produces **no direct roll moment** merely because it is far outboard; its roll lever arm is the vertical offset $z$. An aft lateral force also has a yaw arm $x$.

**Worked geometry check:** suppose $\mathbf r=(0,4,0)$ m. A 10 N lift reduction and 5 N drag increase give $\Delta\mathbf F=(-5,0,10)$ N, hence $\Delta\mathbf M=(40,0,20)$ N m: right-wing-down roll and nose-right yaw. A pure side force $(0,10,0)$ N at that same location gives zero moment. Move that side force to $\mathbf r=(-3,4,0.5)$ m and the moment becomes $(-5,0,-30)$ N m. These are invented loads for learning vector mechanics, not glider measurements.

The historical paper calls the tip devices **wing-tip rudders, or roll spoilerons**. The first term identifies the vertically pivoting hardware; the second emphasizes asymmetric roll-control use. The replica's measured roll and yaw curves for a 90-degree spoileron deflection support coupled control; they do not establish a universal response for every angle or reconstruct every 1895 experiment. [Raffel et al., Figs. 11–12](https://elib.dlr.de/191143/1/JoA_Paper_Lilienthal_Flight_Controls.pdf).

**Teach the name:** “a vertically pivoting wing-tip rudder used asymmetrically as a roll spoileron.” Ask what changes the wing's aerodynamic forces before drawing a roll arrow.
''')
    architecture = cell("markdown","l01-controls-architecture",f'''
### 7A-7. Modern UAVs: separate the tail layout from the control mechanism

{image("Controls_Architecture_Comparison.png", "Four generic control architectures: conventional aft tail, V-tail, winglet rudders and a finless wing")}

A UAV still needs control moments about the same three axes. **Uncrewed** describes where the pilot is; **tailless** describes an airframe layout. Neither word specifies the actuator or control law. A craft can lack a separate aft tail yet carry vertical winglets; another can have no vertical fin but retain a forward canard. Stabilization software commands hardware that produces physical forces.

Assess passive stability using aerodynamic moment derivatives and CG location; assess feedback stabilization separately. The absence of a vertical fin alone does not establish either stability or instability.

| Architecture | What the student should locate | How the control task is distributed | Structural question |
|---|---|---|---|
| Conventional aft tail | Horizontal tail/elevator and vertical fin/rudder | Distinct surfaces primarily supply pitch and yaw; wing ailerons primarily supply roll | Where do tail loads enter the fuselage? |
| V-tail | Two inclined surfaces and their ruddervators | Common and differential force components combine pitch and yaw | How do inclined-root fittings carry vertical and lateral components? |
| Wing with vertical winglets | Winglet rudders plus trailing-edge elevons | Winglets supply directional control; elevons combine pitch and roll | What bending/torsion does the winglet introduce at the tip? |
| No vertical fin | Wing effectors and/or propulsion effectors | Required yaw moment comes from another available force mechanism | Where do drag or redirected-thrust reactions enter the structure? |

These are architecture categories, not complete aircraft control-allocation tables. The force projection in the next sections explains the combined controls.
''')
    mq9=cell("markdown","l01-controls-mq9",f'''
### 7A-8. MQ-9 Reaper: a V-tail and combined ruddervators

{image("Controls_MQ9_Vtail.jpg", "MQ-9 in flight with its two inclined aft tail surfaces and ventral surface visible", 900)}

**Point first:** locate the two inclined aft surfaces. The aircraft also has a ventral surface below the fuselage; “V-tail” does not mean only two surfaces exist. U.S. Air Force documentation identifies MQ-9 ruddervators. [USAF, The Combat Edge, Winter 2026, p. 16](https://www.acc.af.mil/Portals/92/Docs/ACC%20SAFETY/COMBAT%20EDGE/TCE_Winter_2026_web.pdf).

**Explain the generic V-tail physics:** a normal force on an inclined surface has both vertical and lateral components. Equal, mirror-symmetric forces can add their vertical components and cancel their lateral components. A differential pattern can add lateral components and cancel vertical components. A mixer maps pitch/yaw requests into the two local actuator commands. Geometry, aerodynamic derivatives and sign conventions determine the aircraft's actual mixing gains.

**Structural bridge:** draw each local force normal to its surface, then resolve it. Follow the load through the ruddervator hinge and actuator anchors, tail spar/root fittings and rear fuselage. Combined control does not remove hinge torque or attachment loads.

**Predict:** if one ruddervator reaches its limit, can arbitrary pitch and yaw requests still be achieved independently? Explain with two force arrows. We are not reverse-engineering the MQ-9 flight-control software.

Photo: U.S. Air Force / Staff Sgt. Brian Ferguson; [source and public-domain record](https://commons.wikimedia.org/wiki/File:MQ-9_Reaper_in_flight_(2007).jpg). Resized for display.
''')
    x48=cell("markdown","l01-controls-x48",f'''
### 7A-9. X-48B: elevons plus vertical winglet rudders

{image("Controls_X48B_Winglets.jpg", "NASA Boeing X-48B in flight with vertical wingtip fins visible", 900)}

The remotely piloted **X-48B research demonstrator** carries vertical fins/rudders at its wing tips and elevons at its trailing edges. It is a useful example of a blended wing-body without a conventional aft empennage, **but it still has vertical surfaces**. NASA documents that the **X-48C** relocated these winglets inboard beside the exhaust ducts, making twin vertical tails. Keep B and C distinct. [NASA fact sheet]({NASA48}).

**Explain an elevon:** the name combines elevator and aileron. Common left/right motion supplies a pitch-control channel; differential motion supplies a roll-control channel. The physical panel is the same, while its commanded role changes. The winglet rudders provide another control channel for yaw; their exact contribution depends on the tested configuration and allocation.

**Structural bridge:** a tip-fin side force bends the winglet root and can twist/bend the wing. An elevon load enters at panel hinges and actuator anchors. Distributed control surfaces require multiple local attachments, not just a strong wing-root joint.

**Pair prompt:** “Does no conventional tail mean no rudder? Does a winglet automatically have a rudder?” Answer using visible hardware plus the source.

Photo: NASA / Carla Thomas; [NASA photo page](https://www.nasa.gov/image-article/x-48b-first-flight/). NASA photograph, public domain in the United States. The flight photograph identifies configuration, not an active control command.
''')
    x36=cell("markdown","l01-controls-x36",f'''
### 7A-10. X-36: no aft tail, but a canard and multiple control mechanisms

{image("Controls_X36_Tailless.jpg", "Top oblique view of the remotely piloted NASA Boeing X-36 showing forward canards and the absence of vertical tail fins", 900)}

The **1997 X-36 research demonstrator** was remotely piloted. NASA identifies a forward canard, split ailerons and a thrust-vectoring nozzle in place of conventional aft tail surfaces. NASA also describes pitch/yaw instability and digital fly-by-wire stabilization. It is an historical demonstration of modern control ideas, not a current operational UAV. [NASA X-36 fact sheet]({NASA36}).

**Locate the canard:** it is ahead of the main wing. “Tailless” here does not mean “only one lifting surface.” **Explain yaw without a vertical fin:** opening a split drag device asymmetrically can create an outboard drag force and yaw moment; redirecting thrust produces another control force. The combination requires allocation and feedback. The photo does not reveal that allocation.

**Structural bridge:** split surfaces load their hinge fittings and actuator anchors; vectoring loads the nozzle assembly and engine mounts. A canard supplies a separate forward-fuselage load path. Removing aft fins changes where the structure must carry control loads.

**Check:** software stabilizes the aircraft by commanding these physical effectors. Which force and attachment would be absent from a free-body diagram that shows only “autopilot”?

Photo: NASA / Carla Thomas, 30 October 1997; NASA photograph, public domain in the United States; [source]({NASA36}).
''')
    mechanism=cell("markdown","l01-controls-effectors",rf'''
### 7A-11. What does each modern effector actually move or change?

{image("Controls_Modern_Effectors.png", "Six black-label teaching diagrams showing common and differential elevon commands, V-tail force projection, a split drag rudder, mechanical thrust vectoring and blown-air flow control", 1250)}

| Mechanism | Physical change | Typical purpose / condition | Structure that receives the reaction |
|---|---|---|---|
| **Elevon** | A trailing-edge panel rotates | Mixed pitch and roll; aerodynamic authority depends on local flow | Hinge fittings, actuator anchors, rear spar/skin/ribs |
| **Ruddervator** | A panel on an inclined tail rotates | Mixed pitch and yaw through force projection | Inclined tail structure and rear-fuselage fittings |
| **Spoileron** | A spoiler rises asymmetrically | Lift/drag asymmetry gives a roll-control contribution | Spoiler hinge/bracket and actuator support in wing |
| **Split drag rudder** | Upper/lower halves open as a drag device | An asymmetric drag increase can create yaw | Both hinges, actuation supports and local wing |
| **Differential thrust** | Available engines/rotors produce unequal thrust | Separated thrust lines can create moments, if the layout provides the needed lever arms | Motor/engine mounts and supporting spars/frames |
| **Thrust vectoring** | The thrust direction changes | Control force at a propulsive moment arm | Nozzle/tilt mechanism, propulsion mounts and frame |
| **Circulation control** | Air is blown through a wing slot | Local flow and aerodynamic force change | Slot region, ducts, pressure supply and wing structure |
| **Fly-by-wire / control allocation** | Sensors/software distribute commands to effectors | Feedback and mixing coordinate available hardware | Software creates no force by itself; each physical effector still loads the structure |

**A generic elevon mixer:** let local deflection be positive with the trailing edge up. For the teaching configuration, $P>0$ requests nose-up pitch; $R>0$ requests right-wing-down roll. With unit illustrative gains:

$$\delta_{{\mathrm{{left}}}}=P-R,\qquad \delta_{{\mathrm{{right}}}}=P+R.$$

This sign pattern assumes the pitch-relevant aerodynamic load acts aft of the CG. Deflections are commands in degrees, not aircraft pitch/roll angles. Real gains and cross-coupling require aerodynamic data; this mixer is not the X-48B or X-36 flight-control law.

**Predict before running:** (1) $P=8,R=0$; (2) $P=0,R=5$; (3) $P=8,R=5$; (4) $P=12,R=8$ with a 15-degree limit. Sketch both panel commands. Then run the next form and identify when the requested sum/difference becomes unattainable.
''')
    x47=cell("markdown","l01-controls-x47",'''
### 7A-12. X-47B: a real finless UAV, and the limits of a photograph

'''+image("Controls_X47B_Finless.jpg","U.S. Navy X-47B at takeoff, showing its wing-body configuration and absence of an upright vertical tail",900)+'''

**Observe:** this X-47B has no upright vertical tail. Northrop Grumman describes it as a tailless unmanned demonstrator. [Manufacturer's program description](https://investor.northropgrumman.com/news-releases/news-release-details/northrop-grumman-us-navy-complete-first-arrested-landing).

**Separate observation from a mechanism claim:** do not label a photographed panel “split drag rudder” solely because the aircraft has no fin. The cited program description establishes the layout and demonstration, not a complete surface-by-surface control law. The preceding generic mechanisms explain ways finless designs can obtain yaw authority; assigning one to this aircraft requires an aircraft-specific technical source.

**Structural question:** what drawings and measurements would let you trace a photographed panel's pressure, hinge reaction, actuator reaction and wing-box attachment? Mark the visible outline, and write “not resolved in this view” where appropriate.

Photo: U.S. Air Force / Rob Densmore, 4 February 2011; [source and public-domain record](https://commons.wikimedia.org/wiki/File:X-47B_110204-F-1162D-119.jpg). Resized only.
''')
    magma=cell("markdown","l01-controls-magma",f'''
### 7A-13. MAGMA: control through blown air rather than panel motion

The **BAE Systems / University of Manchester MAGMA research UAV** demonstrated wing circulation control and fluidic thrust vectoring in 2019. In wing circulation control, supplied air leaves narrow slots around a specially shaped trailing edge; in fluidic thrust vectoring, air jets inside the nozzle redirect exhaust. Use the last panel of the effector diagram to identify those two different flow paths. [BAE Systems' experiment description and actual aircraft photograph]({MAGMA}).

**Explain:** circulation control changes the wing's aerodynamic force. Fluidic vectoring changes the propulsive force direction. Both can produce a control moment when the force has a suitable CG lever arm. A stationary exterior surface can therefore participate in active flight control.

**Structural bridge:** follow supply pressure and duct reactions into the airframe, aerodynamic force into the wing, and redirected thrust into nozzle/engine mounts. Fewer moving exterior panels do not establish lower total mass or lower structural load; those are design claims that need evidence.

**Evidence boundary:** this is a demonstrated research technology. The source does not establish that every modern UAV uses fluidic control, or that a particular photographed airframe lacks all fins.

**Instructor question:** “If the flap does not move, which physical quantity changes?” Students answer flow/momentum/force before discussing the software command.
''')
    studio=cell("markdown","l01-controls-team-retrieval",r'''
### 7A-14. Bring the control mechanism back to Aerospace Structures

For any effector, start with the **force and moment**, then identify the load paths. For a hinged panel there are two essential structural input branches: the hinge/bracket reaction and the actuator-anchor reaction. A vane adds a post/pivot; a vectored engine adds propulsion-mount reactions; a fluidic system adds pressure/duct loads as well as aerodynamic/propulsive loads. Global moment balance does not determine every local fitting load.

**Five-minute team task, using your existing three-person teams:** one student identifies a device in a photo; one draws its free-body diagram and marks the CG lever arm; one audits the source and load path. Rotate roles for a second aircraft. Submit one annotated sketch with the device, force direction, intended control axis, attachment route and one uncertainty. This is a lecture activity, not a new manufacturing requirement for the October 13 wing.

| Retrieval question | Explain before opening the answer |
|---|---|
| Did the Lilienthal aircraft lack a tail because it had tip rudders? | Separate aft tail from tip hardware. |
| Does an X-48B lack every vertical surface? | Point to its winglet fins/rudders. |
| How can one elevon serve two control channels? | Draw common and differential commands. |
| Why can a V-tail combine pitch and yaw? | Resolve local normal forces vertically and laterally. |
| Does “tailless” imply no canard? | Use the X-36 photograph. |
| Does a yaw command need a conventional fin/rudder? | Identify a force mechanism and its CG moment arm. |
| Can software alone make a control moment? | Name the commanded physical effector. |
| Is every side force at a wing tip a rolling force? | Use $M_x=yF_z-zF_y$. |

<details><summary><strong>Instructor answer notes — reveal after discussion</strong></summary>

Lilienthal had aft horizontal and vertical surfaces. X-48B has vertical winglet surfaces; X-48C changed their location. An elevon mixer adds pitch and roll commands to obtain two local deflections. Mirror-symmetric inclined forces can cancel lateral components and add vertical components; a differential pattern changes that combination. X-36 retained a forward canard. Yaw can arise from drag asymmetry or suitable propulsive force, among other mechanisms. Feedback commands physical hardware; it supplies no independent force. An outboard side force needs a vertical offset for direct roll. Actuator saturation couples the attainable mixed commands.

</details>

**Suggested teaching route:** spend 5 minutes on 7A-3a/3b, 3 minutes on the MQ-9/X-48B contrast, 3 minutes on X-36 and the elevon form, then 4 minutes on the team sketch. Keep the full photo atlas and MAGMA for after-class reading if wing anatomy/R01 needs the remaining time. Continue with 7B–7I for the structural and fabrication bridge.
''')
    return [history,physics], [architecture,mq9,x48,x36,mechanism,
                              cell("code","l01-controls-elevon-mixer",MIXER),x47,magma,studio]


def main():
    diagrams()
    notebook=json.loads(NB.read_text(encoding="utf-8"))
    history,modern=additions()
    ids={c["id"] for c in history+modern}
    notebook["cells"]=[c for c in notebook["cells"] if c.get("id") not in ids]
    lookup={c.get("id"):c for c in notebook["cells"]}
    intro="".join(lookup["d0a89355"]["source"])
    outcome="12. compare conventional, V-tail, winglet and finless control architectures; explain elevons, ruddervators, drag rudders, thrust vectoring and blown-air control; and trace their structural reactions."
    if outcome not in intro:
        intro=intro.replace("### Teaching route across multiple sessions",outcome+"\n\n### Teaching route across multiple sessions")
        intro+="\n\n**Control atlas added October 1, 2026:** 7A-3a/3b establish Lilienthal's tail and tip hardware; 7A-7–7A-14 compare documented UAV layouts and introduce a generic elevon mixer. Use the short teaching route in 7A-14 before fabrication; the full atlas is reference material.\n"
    lookup["d0a89355"]["source"]=intro.splitlines(keepends=True)
    terminology="".join(lookup["mie446-l01-roll-spoileron-terminology"]["source"])
    terminology=terminology.replace("Next, test your visual vocabulary against four real aircraft photographs.",
        "Next, confirm that the historical glider had an aft tail, inspect its linkage and compare real aircraft photographs.")
    lookup["mie446-l01-roll-spoileron-terminology"]["source"]=terminology.splitlines(keepends=True)
    loads="".join(lookup["mie446-l01-roll-spoileron-loads"]["source"])
    loads=loads.replace("The vane is far outboard, so even a modest local force can have a substantial roll lever arm.",
        "The vane is far outboard, so changes in local lift and drag can have substantial roll and yaw lever arms. A purely lateral force produces direct roll only through its vertical offset from the CG; use the vector-moment check in 7A-3b.")
    lookup["mie446-l01-roll-spoileron-loads"]["source"]=loads.splitlines(keepends=True)
    i=next(i for i,c in enumerate(notebook["cells"]) if c.get("id")=="mie446-l01-four-aircraft-gallery")
    notebook["cells"][i:i]=history
    i=next(i for i,c in enumerate(notebook["cells"]) if c.get("id")=="f013bf43")
    notebook["cells"][i:i]=modern
    notebook["metadata"]["mie446"]["control_atlas_revision"]="2026-10-01"
    # Saved output makes the numerical activity visible before students run it.
    mixer=next(c for c in notebook["cells"] if c.get("id")=="l01-controls-elevon-mixer")
    ast.parse("".join(mixer["source"]))
    outputs=[]
    def show():
        for n in plt.get_fignums():
            buf=io.BytesIO()
            plt.figure(n).savefig(buf,format="png",dpi=130,bbox_inches="tight",facecolor="white")
            outputs.append({"output_type":"display_data","metadata":{},
                "data":{"image/png":base64.b64encode(buf.getvalue()).decode(),"text/plain":["Elevon command mixer"]}})
        plt.close("all")
    from IPython import display as ipdisplay
    old_show,old_display=plt.show,ipdisplay.display
    plt.show=show
    ipdisplay.display=lambda obj: outputs.append({"output_type":"display_data","metadata":{},
        "data":{"text/markdown":[obj.data],"text/plain":[obj.data]}})
    try:
        stream=io.StringIO()
        with contextlib.redirect_stdout(stream): exec(compile("".join(mixer["source"]),"elevon-mixer","exec"),{})
        outputs.append({"output_type":"stream","name":"stdout","text":stream.getvalue().splitlines(keepends=True)})
    finally:
        plt.show,ipdisplay.display=old_show,old_display
    mixer["outputs"]=outputs
    # Match the repository's existing notebook serialization to keep diffs focused.
    NB.write_text(json.dumps(notebook,ensure_ascii=False,indent=1)+"\n",encoding="utf-8")
    print(f"Updated current Lecture 01: {len(notebook['cells'])} cells; 3 original diagrams; source-linked photo atlas.")


if __name__=="__main__": main()
