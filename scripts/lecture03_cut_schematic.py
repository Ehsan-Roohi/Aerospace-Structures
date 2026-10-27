#@title Figure 2A — where the cut actions come from (run this schematic)
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrowPatch


def lecture03_cut_schematic():
    span, cut, load = 450.0, 150.0, 2.0
    lever = span - cut
    shear, moment = load, -load * lever
    # Vertical force and moment balance of the isolated RIGHT portion.
    assert abs(shear - load) < 1e-12
    assert abs((-moment) - load * lever) < 1e-12
    fig, axes = plt.subplots(2, 1, figsize=(12, 6.4), layout="constrained")
    blue, orange = "#19394e", "#ba4a00"
    for ax in axes:
        ax.set_xlim(-30, 490)
        ax.set_ylim(-78, 82)
        ax.axis("off")
    ax = axes[0]
    ax.set_title("1. Physical cantilever: choose a cut; retain the portion to its right", loc="left", fontsize=13, pad=12)
    ax.add_patch(Rectangle((-9, -21), 9, 42, facecolor="#eeeeee", edgecolor="#555555", hatch="///"))
    ax.plot([0, span], [0, 0], color=blue, lw=6, solid_capstyle="butt")
    ax.plot([cut, cut], [-28, 35], ls="--", color=orange, lw=1.8)
    ax.add_patch(Rectangle((cut, -13), lever, 26, facecolor="#e4f2fb", edgecolor="none", zorder=0))
    ax.annotate("P = 2 N", (span, 4), (span, 59), ha="center", fontsize=11,
                arrowprops=dict(arrowstyle="-|>", lw=2, color=blue))
    ax.text(0, -36, "A: x = 0", ha="center", fontsize=11)
    ax.text(cut, 43, "cut: x = 150 mm", ha="center", color=orange, fontsize=11)
    ax.text(300, 16, "Retain this portion", ha="center", fontsize=11)
    ax.text(span, -36, "tip: L = 450 mm", ha="center", fontsize=11)
    ax.annotate("", (0, -58), (cut, -58), arrowprops=dict(arrowstyle="<->", color="#666666"))
    ax.text(cut / 2, -74, "x = 150 mm", ha="center", fontsize=10)

    ax = axes[1]
    ax.set_title("2. Isolated right portion: the removed material is replaced by cut actions", loc="left", fontsize=13, pad=12)
    ax.plot([cut, span], [0, 0], color=blue, lw=6, solid_capstyle="butt")
    ax.plot([cut, cut], [-15, 15], color=orange, lw=2)
    ax.annotate("", (cut, -3), (cut, -48), arrowprops=dict(arrowstyle="-|>", lw=2, color=orange))
    ax.text(cut - 12, -43, "Cut force\n2 N upward", ha="right", color=orange, fontsize=11)
    ax.annotate("P = 2 N", (span, 4), (span, 59), ha="center", fontsize=11,
                arrowprops=dict(arrowstyle="-|>", lw=2, color=blue))
    # Increasing polar angle draws a genuinely counterclockwise couple.
    angles = np.linspace(np.deg2rad(30), np.deg2rad(300), 100)
    xx, yy = cut + 26 * np.cos(angles), 26 * np.sin(angles)
    ax.plot(xx[:-4], yy[:-4], color=orange, lw=2)
    ax.add_patch(FancyArrowPatch((xx[-5], yy[-5]), (xx[-1], yy[-1]),
                                arrowstyle="-|>", mutation_scale=15, lw=2, color=orange))
    ax.text(cut + 42, 42, "Cut couple: 600 N mm CCW", ha="left", color=orange, fontsize=11)
    ax.annotate("", (cut, -58), (span, -58), arrowprops=dict(arrowstyle="<->", color="#666666"))
    ax.text((cut + span) / 2, -74, "L - x = 300 mm", ha="center", fontsize=11)
    fig.suptitle("At x = 150 mm: V = +2 N; M = -600 N mm (sagging-positive convention)", fontsize=14)
    print("Right-piece equilibrium: 2 N up - 2 N down = 0; 600 N mm CCW - 2 N x 300 mm CW = 0.")
    print("On the opposite cut face, BOTH cut arrows reverse. Internal actions are not extra applied loads.")
    return fig


lecture03_cut_schematic()
plt.show()
