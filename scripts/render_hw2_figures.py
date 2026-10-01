"""Draw the given geometry for Homework 2; no assessed answers are drawn."""
from pathlib import Path
import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Circle, Polygon, Arc

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assignments/homework-02/assets"


def label(ax, x, y, value, size=13, **kwargs):
    ax.text(x, y, value, fontsize=size, color="black", **kwargs)


def arrow(ax, start, stop, style="-|>", lw=1.4):
    ax.annotate("", xy=stop, xytext=start,
                arrowprops={"arrowstyle": style, "color": "black", "lw": lw})


def save(fig, name):
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / (name + ".png"), dpi=190, bbox_inches="tight", facecolor="white")
    svg = io.StringIO()
    fig.savefig(svg, format="svg", bbox_inches="tight", facecolor="white", metadata={"Date": None})
    (OUT / (name + ".svg")).write_text(
        "\n".join(line.rstrip() for line in svg.getvalue().splitlines()) + "\n", encoding="utf-8")
    plt.close(fig)


def main():
    font = Path("C:/Windows/Fonts/times.ttf")
    if font.exists():
        font_manager.fontManager.addfont(str(font))
    plt.rcParams.update({"font.family": "Times New Roman", "text.color": "black",
                         "mathtext.fontset": "stix", "svg.fonttype": "none",
                         "svg.hashsalt": "mie446-hw2"})
    fig, axes = plt.subplots(1, 2, figsize=(12.5, 4.25), gridspec_kw={"width_ratios": [1.4, 1]})
    fig.subplots_adjust(wspace=.24, bottom=.22, top=.85)
    ax = axes[0]
    ax.set(xlim=(-.09, .57), ylim=(-.155, .17), aspect="equal")
    ax.axis("off")
    ax.set_title("Given right semi-wing: plan view", fontsize=16)
    ax.add_patch(Polygon([(0, .08), (.45, .05), (.45, -.05), (0, -.08)], fc="white", ec="black", lw=1.6))
    ax.add_patch(Polygon([(.30, .06), (.45, .05), (.45, -.05), (.30, -.06)],
                         fc=".90", ec="black", hatch="///", lw=.8))
    ax.plot([0, .45], [0, 0], color="black", ls="--", lw=1.2)
    ax.add_patch(Circle((0, 0), .005, fc="black"))
    arrow(ax, (0, 0), (0, .14))
    label(ax, .014, .13, "+x forward", 12)
    arrow(ax, (.45, 0), (.55, 0))
    label(ax, .485, -.022, "+y = s", 12)
    label(ax, -.008, -.020, "CG", 12, ha="right")
    arrow(ax, (-.035, -.08), (-.035, .08), "<->", 1)
    label(ax, -.055, 0, "0.160 m", 12, rotation=90, ha="center", va="center")
    arrow(ax, (.475, -.05), (.475, .05), "<->", 1)
    label(ax, .456, .083, "0.100 m", 12, ha="center")
    for x in (0, .30, .45):
        ax.plot([x, x], [-.085, -.118], color="black", ls=":", lw=.8)
    arrow(ax, (0, -.106), (.45, -.106), "<->", 1)
    label(ax, .225, -.132, "Semi-span = 0.450 m", 12, ha="center")
    label(ax, .31, .11, "Control-effect region", 12, ha="center")
    arrow(ax, (.34, .096), (.365, .043), lw=.8)
    label(ax, .30, -.086, "0.300", 11, ha="center")
    ax = axes[1]
    ax.plot([0, .30, .45], [0, 0, 1], color="black", lw=2)
    ax.plot([.30, .30], [0, 1], color="black", ls=":", lw=.8)
    ax.set(xlim=(0, .47), ylim=(-.03, 1.10), xlabel="Spanwise coordinate s (m)",
           ylabel="Prescribed effect factor g(s)", xticks=[0, .15, .30, .45], yticks=[0, .5, 1])
    ax.set_title("Given spatial model", fontsize=16)
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(labelsize=12)
    ax.xaxis.label.set_size(13)
    ax.yaxis.label.set_size(13)
    fig.text(.5, .002, "Dashed force-reference line: r = (0, s, 0). This is an instructional geometry, not a flight-qualified design.",
             ha="center", fontsize=12)
    save(fig, "HW2_Wing_Model")

    fig, axes = plt.subplots(1, 2, figsize=(12.5, 3.8))
    fig.subplots_adjust(wspace=.18, bottom=.12, top=.85)
    for ax in axes:
        ax.set(xlim=(-.8, 6.1), ylim=(-2.2, 2.1), aspect="equal")
        ax.axis("off")
    ax = axes[0]
    ax.set_title("Local pivot and control-string force", fontsize=16)
    ax.plot([0, 3.2], [0, 0], color="black", lw=5)
    ax.add_patch(Circle((0, 0), .16, fc="white", ec="black", lw=1.5))
    label(ax, -.2, -.40, "O: pivot axis", 12)
    ax.plot([3.2, 3.2], [-1.75, 1.85], color="black", ls="--", lw=1)
    arrow(ax, (3.2, 0), (3.2, 1.65), lw=2)
    label(ax, 3.42, 1.40, "String tension T", 13)
    label(ax, 3.45, -.73, "Line of action", 12)
    arrow(ax, (0, -1.25), (3.2, -1.25), "<->", 1)
    label(ax, 1.6, -1.62, r"$d_\perp$: perpendicular distance", 13, ha="center")
    ax.add_patch(Arc((0, 0), 1.75, 1.75, theta1=35, theta2=145, color="black", lw=1.5))
    arrow(ax, (.40, .77), (.72, .51), lw=1.3)
    label(ax, .2, 1.4, "Resisting H = 0.12 N m", 13)
    ax = axes[1]
    ax.set_title("Two paths carry the control loads", fontsize=16)
    for y, s in [(1.05, "Surface load → panel → pivot / bracket"),
                 (.1, "String tension → linkage / actuator anchor"),
                 (-1, "Both paths connect to supporting structure")]:
        label(ax, -.5, y, s, 14)
    fig.text(.5, .012, "Ideal, frictionless mechanism in static balance. H is a supplied local hinge moment, separate from the aircraft roll moment.",
             ha="center", fontsize=12)
    save(fig, "HW2_Control_Lever")


if __name__ == "__main__":
    main()
