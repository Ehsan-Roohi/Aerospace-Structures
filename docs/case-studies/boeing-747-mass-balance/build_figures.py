"""Rebuild the original teaching figures; no aircraft performance is simulated."""
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, Rectangle, FancyBboxPatch
import numpy as np

OUT = Path(__file__).resolve().parent
NAVY = "#18334d"
BLUE = "#1976a2"
ORANGE = "#b54b22"
GREEN = "#187556"
LIGHT = "#eff5f8"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 14,
                     "text.color": NAVY, "axes.labelcolor": NAVY,
                     "svg.fonttype": "none"})

def canvas(title, subtitle, height=7):
    fig = plt.figure(figsize=(14, height), facecolor="white")
    fig.text(.035, .955, title, fontsize=24, weight="bold", va="top")
    fig.text(.035, .897, subtitle, fontsize=14, va="top")
    return fig

def save(fig, name):
    fig.savefig(OUT / f"{name}.png", dpi=150, facecolor="white")
    plt.close(fig)

def label(ax, x, y, s, **kwargs):
    ax.text(x, y, s, va="center", **kwargs)

def arrow(ax, xy, start, color=BLUE, style="->", lw=2):
    ax.annotate("", xy=xy, xytext=start,
                arrowprops={"arrowstyle": style, "color": color, "lw": lw})

def mass_balance():
    fig = canvas("Local mass balance: move the surface CG toward its hinge",
                 "Section perpendicular to the hinge · idealized example, not a Boeing installation drawing")
    for i, balanced in enumerate([False, True]):
        ax = fig.add_axes([.04 + i*.49, .23, .44, .58])
        ax.set(xlim=(0, 1), ylim=(0, 1))
        ax.axis("off")
        ax.add_patch(FancyBboxPatch((.005, .01), .985, .98,
                     boxstyle="round,pad=0", facecolor=LIGHT, edgecolor="#b3c8d4"))
        label(ax, .04, .92, "B · With a forward weight" if balanced else "A · Surface without a weight",
              fontsize=17, weight="bold")
        label(ax, .04, .83, "Airflow: leading edge → trailing edge", fontsize=12)
        arrow(ax, (.92, .77), (.07, .77), color=NAVY)
        ax.add_patch(Polygon([(.07,.51),(.34,.57),(.34,.47)],
                             facecolor="#b9cbd6", edgecolor=NAVY, lw=2))
        ax.add_patch(Polygon([(.35,.57),(.92,.51),(.35,.47)],
                             facecolor="#d5e7f0", edgecolor=BLUE, lw=2))
        ax.plot([.35,.35],[.29,.69],color=NAVY,ls="--",lw=2)
        ax.add_patch(Circle((.35,.52),.019,color=NAVY))
        ax.add_patch(Circle((.68,.52),.018,color=ORANGE))
        label(ax,.69,.65,"Surface CG",color=ORANGE,ha="center",fontsize=14)
        arrow(ax,(.68,.54),(.68,.62),color=ORANGE)
        label(ax,.35,.23,"Hinge: x = 0",ha="center",fontsize=13)
        arrow(ax,(.68,.33),(.35,.33),color=ORANGE,style="<->")
        label(ax,.55,.39,"a = +0.12 m",ha="center",fontsize=13,color=ORANGE)
        if balanced:
            ax.plot([.18,.35],[.52,.52],lw=4,color=BLUE)
            ax.add_patch(Rectangle((.115,.465),.10,.11,facecolor=BLUE,edgecolor=NAVY))
            label(ax,.18,.67,"Balance weight",ha="center",fontsize=13,color=BLUE)
            arrow(ax,(.165,.58),(.18,.64))
            arrow(ax,(.35,.33),(.165,.33),style="<->")
            label(ax,.18,.39,"b = 0.08 m",ha="center",fontsize=12,color=BLUE)
            ax.add_patch(Circle((.35,.52),.033,fill=False,edgecolor=GREEN,lw=3))
            label(ax,.5,.12,"Combined CG at hinge in this example",ha="center",fontsize=12,color=GREEN)
        else:
            label(ax,.5,.12,"Aft mass produces inertial hinge coupling",ha="center",fontsize=12,color=ORANGE)
    fig.text(.045,.15,"Illustrative masses: surface 8 kg · forward weight 12 kg",fontsize=18,weight="bold")
    fig.text(.045,.096,"First mass moment: 8 × (+0.12) + 12 × (−0.08) = 0 kg m",fontsize=17)
    fig.text(.045,.041,"Zero first moment is a teaching target—not a universal requirement or proof of flutter safety.",fontsize=13)
    save(fig,"hinge-mass-balance")

def density():
    fig = canvas("Equal mass, smaller volume: why density matters",
                 "Same hypothetical 12 kg mass · same 100 cm² block footprint · volume = mass / density",height=6)
    ax = fig.add_axes([.08,.28,.84,.53])
    ax.set(xlim=(0,3),ylim=(0,15))
    ax.axis("off")
    materials = [("Lead",11.3,ORANGE),("Uranium ≈ DU",19.1,BLUE),("Pure tungsten",19.3,GREEN)]
    for i,(name,rho,color) in enumerate(materials):
        volume = 12000/rho
        height = volume/100
        ax.add_patch(Rectangle((i+.23,.7),.53,height,facecolor=color,edgecolor=NAVY,lw=1.5))
        label(ax,i+.5,height+1.25,f"{volume:.0f} cm³",ha="center",fontsize=19,weight="bold")
        label(ax,i+.5,.04,name,ha="center",fontsize=17)
        label(ax,i+.5,14.0,f"ρ ≈ {rho:.1f} g/cm³",ha="center",fontsize=16)
    fig.text(.05,.17,"Pure tungsten is slightly denser than uranium; practical tungsten alloys have their own densities.",fontsize=14)
    fig.text(.05,.105,"Changing material at the same mass and location preserves the first moment. It does not remove that mass.",fontsize=13)
    fig.text(.05,.04,"Illustrative blocks only. Actual counterweights are shaped to fit and attach to a specific structure.",fontsize=13)
    save(fig,"density-packaging")

def flutter():
    fig = canvas("Flutter is an energy-feedback problem",
                 "Bending, twisting and control-surface rotation can couple · conceptual illustration, not a flutter prediction",height=8)
    ax = fig.add_axes([.025,.51,.95,.31])
    ax.set(xlim=(0,1),ylim=(0,1)); ax.axis("off")
    boxes = [("Structural motion", "bending h · twist θ\ncontrol rotation δ"),
             ("Unsteady airflow", "motion changes the flow\nand aerodynamic forces"),
             ("Energy transfer", "force phase determines\nwork during each cycle")]
    for i,(head,body) in enumerate(boxes):
        x=.02+i*.33
        ax.add_patch(FancyBboxPatch((x,.29),.28,.65,boxstyle="round,pad=.01",
                                  facecolor=LIGHT,edgecolor=BLUE,lw=2))
        label(ax,x+.14,.78,head,ha="center",fontsize=16,weight="bold")
        label(ax,x+.14,.52,body,ha="center",fontsize=13,linespacing=1.5)
        if i<2: arrow(ax,(x+.32,.60),(x+.286,.60),lw=3)
    ax.plot([.82,.82,.16,.16],[.28,.10,.10,.27],color=BLUE,lw=2)
    arrow(ax,(.16,.30),(.16,.10),lw=2)
    label(ax,.49,.15,"Forces act back on the moving structure",ha="center",fontsize=13)
    t=np.linspace(0,5,600)
    for i,(name,rate,color) in enumerate([("Damped",-.5,GREEN),("Neutral",0,NAVY),("Growing",.35,ORANGE)]):
        a=fig.add_axes([.06+i*.315,.20,.27,.23])
        a.plot(t,np.exp(rate*t)*np.sin(2*np.pi*t),color=color,lw=2)
        a.set_title(name,fontsize=16,color=color,weight="bold")
        a.set(xlabel="Time (arbitrary units)",ylim=(-6,6),yticks=[])
        a.spines[["right","top"]].set_visible(False)
        a.tick_params(labelsize=10)
        a.axhline(0,color="#adbcc5",lw=.8)
    fig.text(.055,.105,"If airflow supplies more energy per cycle than damping removes, oscillations can grow.",fontsize=16,weight="bold")
    fig.text(.055,.055,"A mass-balance check or dry natural-frequency calculation alone cannot establish a safe flutter speed.",fontsize=13)
    save(fig,"flutter-feedback")

if __name__ == "__main__":
    mass_balance()
    density()
    flutter()
    print("Built three original teaching figures.")
