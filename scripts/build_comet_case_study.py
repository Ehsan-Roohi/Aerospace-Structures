"""Reproduce the Comet teaching figures and analytical results.

No aircraft FE model, fatigue-life fit, or historical reconstruction is implied.
Run from any directory with Python, NumPy and Matplotlib installed.
"""
from pathlib import Path
import csv
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle, FancyBboxPatch, Ellipse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/case-studies/comet-windows"
BLUE, RED, GOLD, INK = "#176b94", "#b93336", "#c58b20", "#19364b"
plt.rcParams.update({"font.size": 13, "axes.titlesize": 15,
                     "axes.labelsize": 13, "figure.facecolor": "white",
                     "axes.spines.top": False, "axes.spines.right": False})


def save(fig, name):
    fig.savefig(OUT / f"{name}.png", dpi=180, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def arrow(ax, p, q, color=BLUE, lw=2):
    ax.annotate("", xy=q, xytext=p,
                arrowprops={"arrowstyle": "-|>", "color": color, "lw": lw,
                            "mutation_scale": 16})


def kirsch(r, theta, sx, sy, radius=1.0):
    """Infinite isotropic plate, traction-free circular hole, biaxial far field."""
    k = (radius / np.asarray(r)) ** 2
    c, s = np.cos(2 * theta), np.sin(2 * theta)
    rr = (sx + sy) / 2 * (1-k) + (sx-sy) / 2 * (1-4*k+3*k*k) * c
    tt = (sx + sy) / 2 * (1+k) - (sx-sy) / 2 * (1+3*k*k) * c
    rt = -(sx-sy) / 2 * (1+2*k-3*k*k) * s
    return rr, tt, rt


def verify():
    theta = np.linspace(0, 2*np.pi, 1441)
    for sx, sy, peak in [(1, 0, 3), (0.5, 1, 2.5), (1, 1, 2)]:
        rr, tt, rt = kirsch(np.ones_like(theta), theta, sx, sy)
        np.testing.assert_allclose(rr, 0, atol=1e-13)
        np.testing.assert_allclose(rt, 0, atol=1e-13)
        np.testing.assert_allclose(np.max(tt), peak, atol=1e-13)
        rr, tt, rt = kirsch(np.full_like(theta, 1e7), theta, sx, sy)
        np.testing.assert_allclose(rr, sx*np.cos(theta)**2+sy*np.sin(theta)**2, atol=1e-12)
        np.testing.assert_allclose(tt, sx*np.sin(theta)**2+sy*np.cos(theta)**2, atol=1e-12)
        np.testing.assert_allclose(rt, (sy-sx)*np.sin(theta)*np.cos(theta), atol=1e-12)
    assert 1+2*1 == 3
    print("PASS: hole-edge tractions, three exact peaks, far-field tensor, circle/ellipse limit")


def pressure_diagram():
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.6))
    ax = axes[0]
    ax.add_patch(Circle((0, 0), 1, fill=False, lw=6, ec=BLUE))
    for angle in np.linspace(0, 2*np.pi, 12, endpoint=False):
        u = np.array([np.cos(angle), np.sin(angle)])
        arrow(ax, .58*u, .96*u, RED)
    ax.text(0, -.28, "Differential\npressure p", ha="center", va="center", fontsize=12)
    arrow(ax, (0, 0), (.71, .71), INK)
    ax.text(.42, .25, "R", color=INK)
    ax.text(0, -1.40, "Circular shell cut across the fuselage", ha="center")
    ax.set(xlim=(-1.7, 1.7), ylim=(-1.7, 1.6), aspect="equal")
    ax.set_title("1. Pressure tries to expand the shell", pad=16)
    ax.axis("off")
    ax = axes[1]
    ax.add_patch(Rectangle((-.8, -.65), 1.6, 1.3, fc="#e5f0f5", ec=INK, lw=2))
    ax.add_patch(FancyBboxPatch((-.27, -.35), .54, .70, boxstyle="round,pad=0,rounding_size=.14", fc="white", ec=INK, lw=2))
    for x in (-.6, 0, .6):
        arrow(ax, (x, .65), (x, 1.15), RED)
        arrow(ax, (x, -.65), (x, -1.15), RED)
    for y in (-.4, 0, .4):
        arrow(ax, (.8, y), (1.15, y), BLUE)
        arrow(ax, (-.8, y), (-1.15, y), BLUE)
    ax.text(0, 1.34, r"Hoop tension: $\sigma_h = pR/t$", ha="center", color=RED)
    ax.text(0, -1.47, r"Axial tension: $\sigma_a = pR/(2t)$", ha="center", color=BLUE)
    ax.text(0, 0, "Window\nopening", ha="center", va="center", fontsize=11)
    ax.set(xlim=(-1.55, 1.55), ylim=(-1.75, 1.65), aspect="equal")
    ax.set_title("2. Flatten a small skin patch", pad=16)
    ax.axis("off")
    fig.suptitle("A window interrupts a skin already carrying two tensile stresses", fontsize=19, color=INK)
    fig.subplots_adjust(top=.84, wspace=.30)
    save(fig, "pressure-load-paths")


def geometry_diagram():
    fig, axes = plt.subplots(1, 3, figsize=(13, 5.3))
    for ax, radius, title in zip(axes[:2], [.035, .28], ["Small corner radius", "Generous corner radius"]):
        ax.add_patch(Rectangle((-.9, -.9), 1.8, 1.8, fc="#e5f0f5", ec="#9fb5c1"))
        ax.add_patch(FancyBboxPatch((-.50, -.65), 1, 1.3,
                     boxstyle=f"round,pad=0,rounding_size={radius}", fc="white", ec=INK, lw=3))
        for x in np.linspace(-.5, .5, 5):
            for y in (-.77, .77): ax.add_patch(Circle((x,y), .025, color=GOLD))
        for y in (-.45, -.15, .15, .45):
            for x in (-.64, .64): ax.add_patch(Circle((x,y), .025, color=GOLD))
        arrow(ax, (.7, .98), (.45-radius*.3, .65-radius*.3), RED)
        ax.text(0, -1.19, "Cutout + frame + fasteners\nmust be assessed together", ha="center", fontsize=11)
        ax.set_title(title)
    ax = axes[2]
    ax.add_patch(Rectangle((-.9, -.9), 1.8, 1.8, fc="#e5f0f5", ec="#9fb5c1"))
    ax.add_patch(Ellipse((0,0), 1.3, 1, fc="white", ec=INK, lw=3))
    arrow(ax, (-1.18, -.65), (-1.18, .65), BLUE)
    ax.text(0, -1.19, "An oval is not automatically best:\norientation and loading matter", ha="center", fontsize=11)
    ax.set_title("Smooth elliptical opening")
    for ax in axes:
        ax.set(xlim=(-1.38, 1.38), ylim=(-1.42, 1.18), aspect="equal")
        ax.axis("off")
    fig.suptitle("Corner radius helps, but shape alone is not a fatigue design", fontsize=19, color=INK)
    fig.text(.5, .015, "Concept sketches only. Not Comet dimensions, stress contours or failure-origin maps.", ha="center", fontsize=11)
    fig.subplots_adjust(top=.80, bottom=.12, wspace=.18)
    save(fig, "cutout-details")


def historical_diagram():
    values = np.array([28000, 43000, 45700])*0.006894757293
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.5), gridspec_kw={"width_ratios": [1.55, 1]})
    ax = axes[0]
    labels = ["Manufacturer estimate\nspatial average; pressure only",
              "RAE local edge estimate\npressure only; extrapolated",
              "RAE local edge estimate\npressure + other loads"]
    ax.barh(labels, values, color=[BLUE, GOLD, RED], height=.52)
    ax.invert_yaxis()
    for i,v in enumerate(values): ax.text(v+5, i, f"{v:.1f} MPa", va="center")
    ax.set(xlim=(0, 370), xlabel="Reported stress estimate (MPa)")
    ax.set_title("Court of Inquiry: paragraphs 124-128")
    ax.grid(axis="x", alpha=.2)
    ax = axes[1]
    ax.axis("off")
    ax.text(.02, .86, "Do not divide these bars\nto claim a design error factor.", fontsize=16, weight="bold", color=RED)
    ax.text(.02, .61, "The first is an average.\nThe next two describe a local peak.\nThe third includes extra loads.", fontsize=13, linespacing=1.6)
    ax.text(.02, .24, "Withey (1997) also discusses about\n70 MPa in the vicinity of the\ncrack-origin bolthole: not the\nresolved maximum at its rim.", fontsize=12, linespacing=1.5)
    fig.suptitle("Historical high stress: a local peak is not a spatial average", fontsize=19, color=INK)
    fig.text(.5, .015, "Original units: 28,000; 43,000; 45,700 psi. 1 psi = 0.006894757 MPa. Not new FE results.", ha="center", fontsize=11)
    fig.subplots_adjust(top=.80, bottom=.17, left=.21, wspace=.25)
    save(fig, "historical-stress-estimates")


def kirsch_diagram():
    fig, axes = plt.subplots(1, 2, figsize=(12, 6.8))
    line = np.linspace(-3.3, 3.3, 701)
    x, y = np.meshgrid(line, line)
    r, theta = np.hypot(x,y), np.arctan2(y,x)
    for ax, sx, sy, title in zip(axes, [1, .5], [0, 1],
        ["Uniaxial tension: Sx = S, Sy = 0", "Cabin-like biaxial tension: Sx = S/2, Sy = S"]):
        rr, tt, rt = kirsch(np.maximum(r, 1), theta, sx, sy)
        principal = (rr+tt)/2 + np.sqrt(((rr-tt)/2)**2+rt**2)
        principal = np.ma.masked_where(r < 1, principal)
        im = ax.contourf(x, y, principal, levels=np.linspace(0,3.1,32), cmap="inferno", vmin=0, vmax=3.1)
        ax.add_patch(Circle((0,0), 1, fc="white", ec=INK, lw=2))
        ax.text(0, 0, "Traction-free\nhole", ha="center", va="center", fontsize=11, color=INK)
        if sx == 1:
            for px in (-3.1, 3.1): arrow(ax, (np.sign(px)*2.6, 0), (px, 0), BLUE)
            ax.text(0, 2.95, "Exact peak = 3 S", color="white", ha="center", fontsize=13)
        else:
            for py in (-3.1, 3.1): arrow(ax, (0, np.sign(py)*2.6), (0, py), BLUE)
            for px in (-3.1, 3.1): arrow(ax, (np.sign(px)*2.85, 0), (px, 0), BLUE)
            ax.text(0, 2.95, "Exact peak = 2.5 S", color="white", ha="center", fontsize=13)
        ax.set(xlabel="x / hole radius", ylabel="y / hole radius", aspect="equal")
        ax.set_title(title, fontsize=13, pad=14)
    fig.suptitle("Even a round hole concentrates stress", fontsize=20, color=INK)
    cbax = fig.add_axes([.28, .12, .44, .025])
    fig.colorbar(im, cax=cbax, orientation="horizontal", label="Maximum principal tensile stress / S")
    fig.text(.5, .015, "Analytical Kirsch solution. Infinite flat isotropic plate; not a Comet window or a finite-element model.", ha="center", fontsize=11)
    fig.subplots_adjust(top=.82, bottom=.23, wspace=.26)
    save(fig, "kirsch-stress-fields")


def radius_diagram():
    fig, axes = plt.subplots(1, 2, figsize=(12, 5.5))
    ax = axes[0]
    ax.add_patch(Rectangle((-1.5,-1),3,2,fc="#e5f0f5",ec=INK))
    ax.add_patch(Ellipse((0,0),2,.8,fc="white",ec=INK,lw=3))
    for x in (-1.2,0,1.2):
        arrow(ax,(x,1),(x,1.55)); arrow(ax,(x,-1),(x,-1.55))
    ax.plot([0,1],[0,0],color=INK); ax.plot([0,0],[0,.4],color=INK)
    ax.text(.55,.08,"a",fontsize=16); ax.text(.06,.22,"b",fontsize=16)
    ax.text(0,-1.93,"Remote tension is perpendicular to the long axis.\nTip radius rho = b squared / a.",ha="center",fontsize=12)
    ax.set(xlim=(-1.7,1.7),ylim=(-2.2,1.8),aspect="equal")
    ax.set_title("Inglis elliptical-hole model")
    ax.axis("off")
    ax = axes[1]
    ab=np.linspace(1,4,200)
    ax.plot(ab,1+2*ab,lw=3,color=RED)
    for ratio in (1,2,3,4):
        ax.plot(ratio,1+2*ratio,"o",color=INK)
        ax.annotate(f"{1+2*ratio:.0f}",(ratio,1+2*ratio),xytext=(0,9),textcoords="offset points",ha="center")
    ax.set(xlabel="Ellipse aspect ratio a / b",ylabel="Elastic concentration Kt = 1 + 2 a / b",ylim=(2,10))
    ax.set_title("Sharper tips produce larger local peaks")
    ax.grid(alpha=.2)
    fig.suptitle("Radius, orientation and loading must be stated together",fontsize=19,color=INK)
    fig.text(.5,.015,"This curve is NOT a formula for a rounded rectangular aircraft window. Elastic peaks can exceed yield.",ha="center",fontsize=11)
    fig.subplots_adjust(top=.78,bottom=.23,wspace=.30)
    save(fig,"ellipse-radius-effect")


def fatigue_diagram():
    fig=plt.figure(figsize=(13,7))
    gs=fig.add_gridspec(2,3,height_ratios=[1.15,1])
    for i,(title,length) in enumerate(zip(["1. Small initial flaw","2. Growth under repeated loading","3. Remaining ligament fails"],[.12,.60,1.15])):
        ax=fig.add_subplot(gs[0,i]); ax.add_patch(Rectangle((-1,-.55),2,1.1,fc="#e5f0f5",ec=INK))
        ax.add_patch(Circle((-.5,0),.17,fc="white",ec=INK,lw=2))
        xx=np.linspace(-.33,-.33+length,13)
        yy=np.zeros(13); yy[1:-1]=.025*np.sin(np.arange(1,12)*2)
        ax.plot(xx,yy,color=RED,lw=3)
        arrow(ax,(-.2,-.25),(xx[-1],0),RED)
        ax.text(0,-.83,"Fastener hole and crack\n(crack opening exaggerated)",ha="center",fontsize=11)
        ax.set(xlim=(-1.15,1.15),ylim=(-1,1),aspect="equal"); ax.axis("off"); ax.set_title(title,fontsize=13)
    ax=fig.add_subplot(gs[1,:]); x=np.linspace(0,6,1201)
    stress=.5*(1-np.cos(2*np.pi*x))
    ax.plot(x,stress,lw=2.5,color=BLUE)
    ax.set(xlabel="Illustrative flight cycles (not historical crack-growth data)",ylabel="Normalized pressure stress",ylim=(-.08,1.2))
    ax.grid(alpha=.2)
    fig.suptitle("Fatigue can accumulate without exceeding static strength on every flight",fontsize=19,color=INK)
    fig.text(.5,.015,"Conceptual sequence only; not a time-resolved reconstruction. Real flight spectra and crack geometry must be measured.",ha="center",fontsize=11)
    fig.subplots_adjust(top=.85,bottom=.15,hspace=.37,wspace=.25)
    save(fig,"fatigue-sequence")


def cycle_diagram():
    fig,ax=plt.subplots(figsize=(11,5.3))
    names=["G-ALYY\naccident aircraft","G-ALYP\naccident aircraft","G-ALYU\nwater-tank test aircraft"]
    vals=[903,1286,3057]
    ax.bar(names,vals,color=[RED,GOLD,BLUE],width=.6)
    for i,v in enumerate(vals): ax.text(i,v+90,f"{v:,}",ha="center",weight="bold",fontsize=16)
    ax.set(ylabel="Accumulated pressurization cycles",ylim=(0,3500))
    ax.set_title("Historical cycle counts refer to different airframes",fontsize=19,color=INK,pad=22)
    ax.grid(axis="y",alpha=.2)
    fig.text(.5,.02,"G-ALYU: 1,221 service + 1,836 simulated cycles to first tank failure. Not a design-life curve or universal limit.",ha="center",fontsize=11)
    fig.subplots_adjust(bottom=.23)
    save(fig,"historical-cycle-counts")


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    verify()
    p=8.25*6.894757293  # psi to kPa
    radius,thickness=1600.0,1.42  # mm; assumed fully load-sharing local equivalent
    hoop=p/1000*radius/thickness
    results={"pressure_kPa":p,"assumed_radius_mm":radius,"assumed_equivalent_thickness_mm":thickness,
             "hoop_stress_MPa":hoop,"axial_stress_MPa":hoop/2,
             "circle_uniaxial_peak_MPa":3*hoop,"circle_biaxial_peak_MPa":2.5*hoop,
             "ellipse_2_to_1_uniaxial_peak_MPa":5*hoop,
             "scope":"Illustrative membrane and infinite-plate elasticity; not aircraft certification or reconstructed Comet stress."}
    np.testing.assert_allclose(hoop,64.0921100,rtol=1e-7)
    (OUT/"analytical-results.json").write_text(json.dumps(results,indent=2)+"\n",encoding="utf-8")
    with (OUT/"analytical-results.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.writer(f); w.writerow(["quantity","value","unit"])
        for key,value in results.items():
            if isinstance(value,(int,float)):
                w.writerow([key,format(value,".10g"),key.rsplit("_",1)[-1]])
    for builder in [pressure_diagram,geometry_diagram,historical_diagram,kirsch_diagram,radius_diagram,fatigue_diagram,cycle_diagram]:
        builder()
    print(json.dumps(results,indent=2))
    print("PASS: seven original figures and analytical CSV/JSON generated")


if __name__ == "__main__":
    main()
