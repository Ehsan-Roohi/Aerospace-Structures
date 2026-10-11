"""Report charts (matplotlib, static PNG) and render composites with colour bars.

    python3 charts.py
"""
import json, os, glob
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image, ImageChops
from common import INPUTS, ROOT, RIB_Y

V = lambda k: INPUTS[k]["value"]
FIG = os.path.join(ROOT, "figures"); os.makedirs(FIG, exist_ok=True)
C1, C2, C3, C4 = "#2a78d6", "#eb6834", "#1baf7a", "#6250d6"
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e4e3de", "#fcfcfb"
SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"]
CMAP = LinearSegmentedColormap.from_list("seq", SEQ)
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10.5, "axes.edgecolor": INK2, "axes.labelcolor": INK,
                     "xtick.color": INK2, "ytick.color": INK2, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
                     "axes.spines.top": False, "axes.spines.right": False, "figure.facecolor": SURF, "axes.facecolor": SURF,
                     "legend.frameon": False, "lines.linewidth": 2.0, "savefig.dpi": 170})
LOADS = json.load(open(os.path.join(ROOT, "data", "loads.json")))

def label_end(ax, x, y, text, color, dy=0):
    ax.annotate(text, (x[-1], y[-1]), xytext=(6, dy), textcoords="offset points", color=INK, fontsize=9.5, va="center")

def fig_loads(tag):
    bc = json.load(open(os.path.join(ROOT, "fe", tag, "beam_check.json")))
    y = np.array(LOADS["y"]); fig, ax = plt.subplots(1, 3, figsize=(13.5, 3.9))
    ax[0].plot(y, np.array(LOADS["lift_per_m_1g"]) / 1e3, color=C1, label="lifting line (used)")
    ax[0].plot(y, np.array(LOADS["schrenk_per_m_1g"]) / 1e3, color=C2, ls="--", label="Schrenk (check)")
    ax[0].set_title("Lift per unit span at 1 g", loc="left", color=INK); ax[0].set_ylabel("kN/m"); ax[0].legend(loc="lower left")
    yd = np.array(bc["diagrams"]["y"])
    ax[1].plot(y, np.array(LOADS["V_lift_1g"]) / 1e3, color=C2, ls="--", label="lift only")
    ax[1].plot(yd, np.array(bc["diagrams"]["V"]) / 1e3, color=C1, label="lift minus wing inertia")
    ax[1].set_title("Shear force per g", loc="left", color=INK); ax[1].set_ylabel("kN"); ax[1].legend(loc="upper right")
    ax[2].plot(y, np.array(LOADS["M_lift_1g"]) / 1e3, color=C2, ls="--", label="lift only")
    ax[2].plot(yd, np.array(bc["diagrams"]["M"]) / 1e3, color=C1, label="lift minus wing inertia")
    ax[2].set_title("Bending moment per g", loc="left", color=INK); ax[2].set_ylabel("kN·m"); ax[2].legend(loc="upper right")
    for a in ax:
        a.set_xlabel("span station y (m from centreline)"); a.set_xlim(0, 5.1)
        a.axvline(V("fitting_y"), color=INK2, lw=0.8, ls=":")
    ax[2].annotate("fuselage fittings", (V("fitting_y"), 1.0), xytext=(8, 0), textcoords="offset points", color=INK2, fontsize=9)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_loads.png")); plt.close(fig)

def fig_boom(tag):
    bc = json.load(open(os.path.join(ROOT, "fe", tag, "beam_check.json")))
    st = bc["stations"]; y = np.array([s["y"] for s in st])
    fig, ax = plt.subplots(figsize=(8.5, 4.0))
    ax.plot(y, [s["beam_lower"] / 1e6 for s in st], color=C1, label="lower boom, beam theory")
    ax.plot(y, [s["fe_lower"] / 1e6 for s in st], "o", color=C1, ms=8, mfc=SURF, mew=2, label="lower boom, FE")
    ax.plot(y, [s["beam_upper"] / 1e6 for s in st], color=C2, label="upper boom, beam theory")
    ax.plot(y, [s["fe_upper"] / 1e6 for s in st], "s", color=C2, ms=8, mfc=SURF, mew=2, label="upper boom, FE")
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_xlabel("span station y (m)"); ax.set_ylabel("axial stress per g (MPa)")
    ax.set_title("Spar boom stress at 1 g: shell FE against engineer's bending theory", loc="left", color=INK)
    ax.legend(ncol=2, loc="center right", bbox_to_anchor=(1.0, 0.5))
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_boom_check.png")); plt.close(fig)

def fig_convergence(tags):
    rows = []
    for t in tags:
        d = os.path.join(ROOT, "fe", t)
        if not os.path.exists(os.path.join(d, "results.json")): continue
        r = json.load(open(os.path.join(d, "results.json")))
        rows.append((r["n_elems"], r["tip_deflection_1g"] * 1e3, (r.get("buckling_factors_pos") or [None])[0], (r.get("buckling_factors_neg") or [None])[0]))
    rows = np.array([[np.nan if v is None else v for v in r] for r in rows], float)
    fig, ax = plt.subplots(1, 2, figsize=(11.5, 3.8))
    ax[0].plot(rows[:, 0] / 1e3, rows[:, 1], "-o", color=C1, ms=8, mfc=SURF, mew=2)
    ax[0].set_title("Tip deflection at 1 g", loc="left", color=INK); ax[0].set_ylabel("mm"); ax[0].set_ylim(0, rows[:, 1].max() * 1.25)
    ax[1].plot(rows[:, 0] / 1e3, rows[:, 2], "-o", color=C1, ms=8, mfc=SURF, mew=2, label="positive g (upper surface in compression)")
    ax[1].plot(rows[:, 0] / 1e3, -rows[:, 3], "-s", color=C2, ms=8, mfc=SURF, mew=2, label="negative g (lower surface in compression)")
    ax[1].set_title("First elastic buckling load factor", loc="left", color=INK); ax[1].set_ylabel("|n| at first skin buckle"); ax[1].legend(loc="upper right")
    ax[1].set_ylim(0, np.nanmax(np.abs(rows[:, 2:])) * 1.25)
    for a in ax: a.set_xlabel("shell elements (thousands)")
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_convergence.png")); plt.close(fig)
    return rows

def fig_collapse(tag):
    co = json.load(open(os.path.join(ROOT, "fe", tag, "collapse.json")))
    st = co["stations"]; y = np.array([s["y"] for s in st])
    fig, ax = plt.subplots(1, 2, figsize=(13.0, 4.0))
    for side, col, nm in (("pos", C1, "positive g"), ("neg", C2, "negative g")):
        ax[0].plot(y, [s[side]["n_collapse"] for s in st], color=col, label=f"{nm}: collapse")
        ax[0].plot(y, [s[side]["n_boom_yield"] for s in st], color=col, ls="--", label=f"{nm}: first boom yield")
    ax[0].axhline(V("n_limit_pos") * V("safety_factor"), color=INK2, lw=1, ls=":")
    ax[0].annotate("ultimate 9 g (CS-23 aerobatic, assumed)", (2.6, 9.0), xytext=(0, 5), textcoords="offset points", color=INK2, fontsize=9)
    ax[0].set_ylim(0, 40); ax[0].set_xlim(0.3, 4.6); ax[0].set_xlabel("span station y (m)"); ax[0].set_ylabel("|load factor|")
    ax[0].set_title("Strength of each wing section, as a load factor", loc="left", color=INK); ax[0].legend(loc="upper left", fontsize=9)
    crit = min(st, key=lambda s: s["pos"]["n_collapse"])
    curve = np.array(crit["pos"]["curve"])
    ax[1].plot(curve[:, 0] * 1e3, curve[:, 1] / crit["M_per_g"], color=C1)
    ev = [("first stringer cripples", crit["pos"]["n_stringer_cripple"]),
          ("first boom yields", crit["pos"]["n_boom_yield"]), ("collapse", crit["pos"]["n_collapse"])]
    for k, (txt, n) in enumerate(ev):
        if n is None: continue
        kap = np.interp(n, curve[:, 1] / crit["M_per_g"], curve[:, 0] * 1e3)
        ax[1].plot([kap], [n], "o", color=C1, ms=8, mfc=SURF, mew=2)
        ax[1].annotate(f"{txt}: {n:.1f} g", (kap, n), xytext=(10, -12 + 4 * k), textcoords="offset points", color=INK, fontsize=9.5)
    ax[1].set_xlabel("section curvature (1/km)"); ax[1].set_ylabel("load factor n")
    ax[1].set_title(f"Section at y = {crit['y']:.2f} m (positive g)", loc="left", color=INK)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_collapse.png")); plt.close(fig)

def autocrop(im, bg=(252, 252, 251), margin=24):
    diff = ImageChops.difference(im.convert("RGB"), Image.new("RGB", im.size, bg))
    bb = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bb: return im
    l, t, r, b = bb
    return im.crop((max(0, l - margin), max(0, t - margin), min(im.width, r + margin), min(im.height, b + margin)))

def with_colorbar(render, out, vmax, label, title=None, vmin=0.0):
    im = autocrop(Image.open(render).convert("RGB"))
    fig = plt.figure(figsize=(7.0, 0.85)); cax = fig.add_axes([0.06, 0.55, 0.88, 0.22])
    cb = matplotlib.colorbar.ColorbarBase(cax, cmap=CMAP, norm=matplotlib.colors.Normalize(vmin, vmax), orientation="horizontal")
    cb.set_label(label, color=INK, fontsize=10); cb.outline.set_edgecolor(INK2)
    tmp = out + ".cb.png"; fig.savefig(tmp, dpi=170, facecolor=SURF); plt.close(fig)
    cbim = Image.open(tmp).convert("RGB"); os.remove(tmp)
    W = max(im.width, cbim.width)
    canvas = Image.new("RGB", (W, im.height + cbim.height), SURF)
    canvas.paste(im, ((W - im.width) // 2, 0)); canvas.paste(cbim, ((W - cbim.width) // 2, im.height))
    canvas.save(out)

if __name__ == "__main__":
    import sys
    tag = sys.argv[1] if len(sys.argv) > 1 else "r3"
    fig_loads(tag); fig_boom(tag)
    print(fig_convergence(["r1", "r2", "r3", "r4"]))
    if os.path.exists(os.path.join(ROOT, "fe", tag, "collapse.json")): fig_collapse(tag)
