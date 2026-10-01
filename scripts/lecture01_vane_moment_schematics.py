"""Original vector-mechanics figures for Lecture 01 section 7A-3b.

Run directly to regenerate PNG/SVG assets and update only the existing target
markdown cell. The complete atlas builder also imports these functions.
All numerical loads are invented teaching examples, not glider measurements.
"""
from pathlib import Path
import io
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Circle, Polygon, Rectangle
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/assets/lecture01"
NB = ROOT / "notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb"
RAW = "https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/"
TARGET = "l01-controls-tip-force-geometry"


def text(ax, x, y, s, size=15, **kwargs):
    return ax.text(x, y, s, fontsize=size, color="black", **kwargs)


def arrow(ax, a, b, lw=2, style="-|>"):
    ax.annotate("", xy=b, xytext=a,
                arrowprops={"arrowstyle": style, "color": "black", "lw": lw})


def frame(ax, title):
    ax.set(xlim=(-5.2, 7), ylim=(-5.2, 5.7), aspect="equal")
    ax.axis("off")
    ax.set_title(title, fontsize=19, color="black", pad=18)


def cg(ax):
    ax.add_patch(Circle((0, 0), .13, fc="black", zorder=8))
    text(ax, -.18, -.45, "CG", ha="right", size=13)


def into_page(ax, xy):
    ax.add_patch(Circle(xy, .13, fc="white", ec="black", lw=1.4))
    for sign in (-1, 1):
        ax.plot([xy[0]-.085, xy[0]+.085],
                [xy[1]-sign*.085, xy[1]+sign*.085], color="black", lw=1.1)


def rear(ax):
    ax.add_patch(Rectangle((-4.1, -.13), 8.2, .26, fc="0.92", ec="black", lw=1.3))
    cg(ax)
    text(ax, -4, .38, "Left wing", size=13, ha="center")
    text(ax, 4, .38, "Right wing", size=13, ha="center")


def plan(ax):
    ax.add_patch(Polygon([(-4, .35), (0, .65), (4, .35), (4, -.45),
                          (0, -.1), (-4, -.45)], fc="0.94", ec="black", lw=1.3))
    ax.add_patch(Polygon([(-.22, -2.5), (-.22, 2.1), (0, 2.8),
                          (.22, 2.1), (.22, -2.5)], fc="0.94", ec="black", lw=1.3))
    cg(ax)


def dimension(ax, a, b, label, label_at):
    arrow(ax, a, b, lw=1, style="<->")
    text(ax, *label_at, label, size=14, ha="center", va="center",
         bbox={"facecolor": "white", "edgecolor": "none", "pad": 2})


def rotation(ax, center, radius, start, end):
    """Signed in-plane arc: increasing angle is counterclockwise."""
    theta = np.linspace(np.deg2rad(start), np.deg2rad(end), 50)
    xy = np.column_stack([center[0]+radius*np.cos(theta),
                          center[1]+radius*np.sin(theta)])
    ax.plot(xy[:, 0], xy[:, 1], color="black", lw=1.8)
    arrow(ax, xy[-4], xy[-1], lw=1.8)


def save(fig, name):
    fig.savefig(ASSETS / (name + ".png"), dpi=180, bbox_inches="tight", facecolor="white")
    out = io.StringIO()
    fig.savefig(out, format="svg", bbox_inches="tight", facecolor="white",
                metadata={"Date": None})
    (ASSETS / (name + ".svg")).write_text(
        "\n".join(line.rstrip() for line in out.getvalue().splitlines()) + "\n",
        encoding="utf-8")
    plt.close(fig)


def build_diagrams():
    times = Path("C:/Windows/Fonts/times.ttf")
    if times.exists():
        font_manager.fontManager.addfont(str(times))
    plt.rcParams.update({"font.family": "Times New Roman", "text.color": "black",
                         "mathtext.fontset": "stix", "svg.fonttype": "none",
                         "svg.hashsalt": "lecture01-vane-moments"})
    ASSETS.mkdir(parents=True, exist_ok=True)

    fig, axes = plt.subplots(1, 2, figsize=(15.5, 7.2))
    fig.subplots_adjust(wspace=.13, top=.83, bottom=.12)
    fig.suptitle("1. Declare the axes before drawing a moment", fontsize=23, y=.98)
    ax = axes[0]
    frame(ax, "PLAN VIEW — looking down")
    plan(ax)
    arrow(ax, (0, 0), (0, 4.2))
    text(ax, .3, 4.05, "+x: forward", size=15)
    arrow(ax, (0, 0), (6, 0))
    text(ax, 5.3, -.6, "+y: right", size=15)
    into_page(ax, (-4.9, 1.55))
    text(ax, -4.55, 1.4, "+z into the page", size=15)
    rotation(ax, (-2.7, 3.15), .8, 135, 15)
    text(ax, -4.8, 4.55, "+Mz: nose-right yaw", size=15)
    ax.plot([0, 4], [-1.1, -1.1], color="black", ls="--", lw=1.3)
    arrow(ax, (0, -1.1), (4, -1.1), lw=1.3)
    text(ax, 2, -1.7, "Outboard position: y > 0", ha="center", size=14)
    text(ax, 0, -4.35, "Positive yaw is clockwise in this view.", ha="center", size=15)
    ax = axes[1]
    frame(ax, "REAR VIEW — looking forward")
    rear(ax)
    arrow(ax, (0, 0), (6, 0))
    text(ax, 5.35, -.6, "+y: right", size=15)
    arrow(ax, (0, 0), (0, -3))
    text(ax, .3, -2.9, "+z: down", size=15)
    into_page(ax, (-4.9, 1.55))
    text(ax, -4.55, 1.4, "+x into the page", size=15)
    rotation(ax, (-2.7, 3.15), .8, 135, 15)
    text(ax, -4.8, 4.55, "+Mx: right-wing-down roll", size=15)
    text(ax, 0, -4.35, "Positive roll is clockwise in this view.", ha="center", size=15)
    fig.text(.5, .035, "A circle with a cross means into the page. Right-handed body axes: x forward, y right, z down.",
             ha="center", fontsize=15)
    save(fig, "Controls_Vane_Body_Axes")

    fig, axes = plt.subplots(1, 2, figsize=(15.5, 7.2))
    fig.subplots_adjust(wspace=.13, top=.83, bottom=.12)
    fig.suptitle("2. At the right tip: lift loss and extra drag give different moments", fontsize=22, y=.98)
    ax = axes[0]
    frame(ax, "LIFT REDUCTION — rear view")
    rear(ax)
    arrow(ax, (4, 0), (4, -2.6), lw=3)
    text(ax, 4.35, -1.5, r"$\Delta F_z=+10$ N", size=16)
    dimension(ax, (0, 1.5), (4, 1.5), "y = 4 m", (2, 1.85))
    ax.plot([0, 0], [.3, 1.6], color="black", lw=.8, ls=":")
    ax.plot([4, 4], [.6, 1.6], color="black", lw=.8, ls=":")
    rotation(ax, (0, 0), 2.5, 155, 50)
    text(ax, -4.8, 4.7, "Right wing tends to go down", size=17)
    text(ax, 0, -3.65, r"$\Delta M_x=y\Delta F_z=+40$ N m", ha="center", size=18)
    text(ax, 0, -4.55, "Downward arrow = loss of upward lift,\nNOT total lift pointing down.",
         ha="center", size=14)
    ax = axes[1]
    frame(ax, "DRAG INCREASE — plan view")
    plan(ax)
    arrow(ax, (0, 2.9), (0, 4.2), lw=1.2)
    text(ax, .35, 3.7, "+x / nose", size=14)
    arrow(ax, (4, 0), (4, -2.6), lw=3)
    text(ax, 4.35, -1.5, r"$\Delta F_x=-5$ N", size=16)
    dimension(ax, (0, 1.5), (4, 1.5), "y = 4 m", (2, 1.85))
    rotation(ax, (0, 0), 2.5, 155, 50)
    text(ax, -4.8, 4.7, "Nose tends to turn right", size=17)
    text(ax, 0, -3.65, r"$\Delta M_z=-y\Delta F_x=+20$ N m", ha="center", size=18)
    text(ax, 0, -4.55, "Extra drag acts aft (opposite +x).", ha="center", size=14)
    fig.text(.5, .035, "Illustrative increments at r = (0, 4, 0) m: ΔF = (−5, 0, 10) N; ΔM = (40, 0, 20) N m.",
             ha="center", fontsize=15)
    save(fig, "Controls_Vane_Lift_Drag_Moments")

    fig, axes = plt.subplots(2, 2, figsize=(15.5, 13))
    fig.subplots_adjust(wspace=.13, hspace=.38, top=.89, bottom=.07)
    fig.suptitle("3. A side force: perpendicular distance matters, not just spanwise position", fontsize=22, y=.97)
    for row in range(2):
        for col in range(2):
            ax = axes[row, col]
            frame(ax, ("A. Same CG height / x = 0" if row == 0 else "B. Aft and below the CG")
                  + (" — rear view" if col == 0 else " — plan view"))
            rear(ax) if col == 0 else plan(ax)
            if col == 1:
                arrow(ax, (0, 2.9), (0, 4.1), lw=1.2)
                text(ax, .3, 3.65, "+x / nose", size=13)
            v = 0 if row == 0 else (-.5 if col == 0 else -3)
            p = (4, v)
            ax.add_patch(Circle(p, .12, fc="black", zorder=8))
            ax.plot([-4.5, 6.5], [v, v], color="black", lw=1, ls="--")
            arrow(ax, p, (6.2, v), lw=3)
            text(ax, 4.7, v+1.5, r"$F_y=+10$ N", size=16)
            if row == 0:
                text(ax, -4.8, 4.8, "Force line passes through the CG.", size=15)
                text(ax, 0, -3.35, r"$M_x=0$" if col == 0 else r"$M_z=0$", ha="center", size=21)
                text(ax, 0, -4.35, "y = 4 m is NOT a moment arm for Fy.", ha="center", size=15)
            elif col == 0:
                ax.plot([-3, -3], [0, -.5], color="black", lw=3)
                ax.plot([-3, -.3], [-.5, -.5], color="black", lw=1, ls=":")
                text(ax, -4.9, 4.8, "Force line is 0.5 m BELOW the CG.", size=15)
                text(ax, -4.9, 3.65, "z = +0.5 m; +z points down", size=14)
                rotation(ax, (0, 0), 2.5, 35, 145)
                text(ax, 0, -3.3, r"$M_x=-zF_y=-5$ N m", ha="center", size=20)
                text(ax, 0, -4.35, "Negative roll: left wing tends to go down.", ha="center", size=15)
            else:
                dimension(ax, (-2.8, 0), (-2.8, -3), "3 m", (-3.4, -1.5))
                ax.plot([0, 4], [0, -3], color="black", lw=1.3, ls=":")
                text(ax, -4.9, 4.9, "Force line is 3 m AFT of the CG: x = −3 m.", size=14)
                rotation(ax, (0, 0), 2.1, 35, 145)
                text(ax, 0, -4, r"$M_z=xF_y=-30$ N m", ha="center", size=20)
                text(ax, 0, -4.85, "Negative yaw: nose tends to turn left.", ha="center", size=15)
    fig.text(.5, .026, "A: r = (0, 4, 0) m → M = (0, 0, 0).    B: r = (−3, 4, 0.5) m → M = (−5, 0, −30) N m.",
             ha="center", fontsize=16)
    save(fig, "Controls_Vane_Side_Force_Arms")


def figure(name, alt, caption):
    return (f'\n\n<p align="center"><img src="{RAW}{name}.png" alt="{alt}" width="1100"></p>'
            f"\n\n{caption}\n\n")


def insert_schematics(source):
    """Idempotently insert figures without changing the original explanation."""
    if "Controls_Vane_Body_Axes.png" in source:
        return source
    source = source.replace("For the **right wing**", figure("Controls_Vane_Body_Axes",
        "Body axes in plan and rear views; positive yaw and roll are clockwise in these projections",
        "**Figure 7A-3b-1 — Views and signs.** Point to the CG, then identify the axis pointing into the page. Use the right-hand rule before naming a moment.") + "For the **right wing**", 1)
    source = source.replace("**Worked geometry check:**", figure("Controls_Vane_Lift_Drag_Moments",
        "Right-tip lift reduction creates positive roll; additional drag creates positive yaw",
        "**Figure 7A-3b-2 — Two force increments, two moments.** These are changes relative to the baseline flight load. The curved arrows show moment tendencies, not a predicted flight trajectory.") + "**Worked geometry check:**", 1)
    source = source.replace("The historical paper calls", figure("Controls_Vane_Side_Force_Arms",
        "A lateral force through the CG has zero moment; aft and below-CG offsets create negative yaw and roll",
        "**Figure 7A-3b-3 — Same side force, different lines of action.** Compare A with B in both views. The spanwise offset stays 4 m; the new perpendicular arms are the vertical offset and the fore-aft offset. Sketches are not to scale and are not a reconstruction of Lilienthal's glider.\n\n**Pause and predict:** If the force acts above the CG instead, which moment changes sign? If it acts forward of the CG instead, which moment changes sign?\n\n**Structures connection:** Draw the load path from vane to pivot/post to wing tip, then through the wing to its root attachment. The global moment about the CG does not replace a local hinge/post or wing-root stress calculation; those require the force application point and the local reference geometry.") + "The historical paper calls", 1)
    return source


def main():
    # Numerical checks protect all displayed sign conventions.
    assert np.allclose(np.cross([0, 4, 0], [-5, 0, 10]), [40, 0, 20])
    assert np.allclose(np.cross([0, 4, 0], [0, 10, 0]), [0, 0, 0])
    assert np.allclose(np.cross([-3, 4, .5], [0, 10, 0]), [-5, 0, -30])
    build_diagrams()
    nb = json.loads(NB.read_text(encoding="utf-8"))
    target = next(c for c in nb["cells"] if c.get("id") == TARGET)
    target["source"] = insert_schematics("".join(target["source"])).splitlines(keepends=True)
    NB.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Created three schematic sets (PNG + editable SVG); updated only section 7A-3b.")


if __name__ == "__main__":
    main()
