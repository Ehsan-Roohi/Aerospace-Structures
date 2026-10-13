"""Educational models: not reconstructed historical pressure or failure data."""
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Circle, FancyBboxPatch

OUT = Path(__file__).resolve().parents[1] / 'docs/assets/wright-controls'
OUT.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.size': 12, 'svg.fonttype': 'none',
                     'svg.hashsalt': 'wright-research', 'font.family': 'DejaVu Sans'})
B, R, K, G = '#176b9c', '#bd3745', '#20394e', '#b08300'

def save(fig, name):
    fig.savefig(OUT / (name + '.png'), dpi=180, bbox_inches='tight')
    fig.savefig(OUT / (name + '.svg'), bbox_inches='tight', metadata={'Date': None})
    plt.close(fig)

def arrow(ax, start, end, color=B):
    ax.annotate('', xy=end, xytext=start,
                arrowprops={'arrowstyle': '->', 'lw': 2.5, 'color': color})

# Equal integrals, different first moments: a transparent CP calculation.
x = np.linspace(0, 1, 1001)
fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout='constrained')
for ax, p, cp, title in zip(axes, (2*(1-x), 2*x), (1/3, 2/3),
                            ('Forward-loaded example', 'Aft-loaded example')):
    ax.fill_between(x, 0, p, alpha=.2, color=B)
    ax.plot(x, p, color=B, lw=3)
    ax.axvline(cp, color=R, ls='--', lw=2)
    ax.text(cp, 1.65, f'CP = {cp:.3f} c', ha='center', color=R,
            bbox={'facecolor': 'white', 'edgecolor': 'none'})
    ax.set(xlabel='x/c: leading edge → trailing edge', ylabel='Assumed pressure difference / scale',
           title=title, xlim=(0, 1), ylim=(0, 2.2))
    ax.grid(alpha=.2)
fig.suptitle('Same total lift; different pitching moments', fontsize=20)
save(fig, 'pressure_centroid')

fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout='constrained')
for lo, hi in ((-.6, -.02), (.02, 1.2)):
    cl = np.linspace(lo, hi, 400)
    axes[0].plot(cl, .25 + .05/cl, color=B, lw=3)
axes[0].axvline(0, color=R, ls='--')
axes[0].axhline(.25, color=G, ls=':', label='AC = 0.25c')
axes[0].axhspan(0, 1, color=K, alpha=.06, label='Physical chord interval')
axes[0].set(xlabel='Lift coefficient CL', ylabel='Equivalent xCP/c', ylim=(-2.5, 3),
            title='A finite couple cannot be replaced at CL = 0')
axes[0].legend(loc='upper right', fontsize=10); axes[0].grid(alpha=.2)
axes[1].axis('off')
axes[1].text(.04, .83, r'$x_{CP}/c = 0.25 - C_{m,ac}/C_L$', fontsize=22)
axes[1].text(.04, .62, 'Illustrative model: Cm,ac = −0.05\nNot measured Wright data.', fontsize=15)
axes[1].text(.04, .36, 'At CL = 0.50: CP = 0.35c\nAt CL = 0.10: CP = 0.75c\nAt CL = 0: retain the pitching couple.', fontsize=15)
axes[1].text(.04, .10, 'A CP outside the chord is an equivalent\nline of action—not a point on the skin.', fontsize=13)
save(fig, 'cp_motion')

fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout='constrained')
for ax in axes:
    ax.axis('off'); ax.set(xlim=(-3, 3), ylim=(-2.1, 2.5))
ax = axes[0]
ax.plot([0, 0], [0, 1.5], lw=5, color=K)
ax.add_patch(Circle((0, 0), .09, color=R))
arrow(ax, (0, 1.5), (-1.8, 1.5))
ax.text(-1, 1.8, 'Model lift L', color=B, ha='center')
ax.text(-.2, .8, 'd', ha='right'); ax.text(0, -.4, 'Pivot', ha='center', color=R)
ax.text(0, -1.3, r'Model torque: $L d$', ha='center', fontsize=20)
ax.set_title('One equivalent torque', fontsize=18)
ax = axes[1]; theta = np.deg2rad(35)
end = np.array([np.sin(theta), np.cos(theta)])*1.5
ax.plot([0, end[0]], [0, end[1]], color=K, lw=5)
ax.add_patch(Circle((0, 0), .09, color=R))
arrow(ax, end, end + [0, -1.45], G)
ax.plot([0, end[0]], [-.45, -.45], color=G, ls='--')
ax.text(.65, -.83, 'Perpendicular arm = d sin θ', ha='center', fontsize=12)
ax.plot([0, 0], [0, 1.7], ls=':', color=K)
ax.text(.2, .6, 'θ', fontsize=18)
ax.text(1.65, .7, 'Reference\nplate drag Dp', ha='center', color=G)
ax.text(0, -1.6, r'Reference torque: $D_p d\sin\theta$', ha='center', fontsize=18)
ax.set_title('Opposing equivalent torque', fontsize=18)
fig.suptitle('Lift balance: compare torques, then reduce the angle reading', fontsize=18)
fig.text(.5, -.035, 'Functional reduction only: not the actual four-arm linkage. θ is the balance angle, not angle of attack.',
         ha='center', fontsize=11)
save(fig, 'balance_torques')

fig, ax = plt.subplots(figsize=(12, 5), layout='constrained'); ax.axis('off')
ax.set(xlim=(0, 12), ylim=(0, 5))
boxes = [('1  Geometry', 'Choose camber, aspect ratio\nand planform separately', .15),
         ('2  Measurement', 'Set model angle α\nRead balance angle θ', 4.15),
         ('3  Reduction', 'Torque ratio → coefficients\nPlot lift AND drag', 8.15)]
for title, body, xx in boxes:
    ax.add_patch(FancyBboxPatch((xx, 2.1), 3.6, 2, boxstyle='round,pad=.1',
                               facecolor='#eef5fa', edgecolor=B, lw=2))
    ax.text(xx+1.8, 3.55, title, ha='center', fontsize=18, color=K)
    ax.text(xx+1.8, 2.75, body, ha='center', fontsize=12)
arrow(ax, (3.8, 3), (4.05, 3)); arrow(ax, (7.8, 3), (8.05, 3))
ax.text(6, 1.1, 'Repeat one-variable comparisons; check trends against glider flights.', ha='center', fontsize=16)
ax.text(6, .35, 'A model test is evidence—not automatic full-scale validation.', ha='center', color=R, fontsize=16)
ax.set_title('From workshop model to flight evidence', fontsize=22)
save(fig, 'wind_tunnel_process')

fig, ax = plt.subplots(figsize=(12, 6), layout='constrained'); ax.axis('off')
ax.set(xlim=(0, 12), ylim=(0, 6))
nodes = [(0.3, 4.1, 'Smithsonian\n1899: literature request'),
         (8.1, 4.1, 'Chanute\n1900 onward: correspondence'),
         (4.2, 2.2, 'Wright brothers\nTest, measure, fly, revise'),
         (0.3, .25, 'Lilienthal\nPublished wing data'),
         (8.1, .25, 'Langley\n1902: direct letters')]
for xx, yy, s in nodes:
    ax.add_patch(FancyBboxPatch((xx, yy), 3.5, 1.3, boxstyle='round,pad=.08',
                               facecolor='#eef5fa', edgecolor=K, lw=2))
    ax.text(xx+1.75, yy+.65, s, ha='center', va='center', fontsize=12)
arrow(ax, (2.6, 4.05), (4.2, 3.4))
arrow(ax, (8.1, 4.15), (7.7, 3.5)); arrow(ax, (7.8, 3.1), (8.5, 4.05))
arrow(ax, (3.4, 1.6), (4.35, 2.25))
arrow(ax, (8.15, 1.6), (7.7, 2.4)); arrow(ax, (7.9, 2.65), (8.8, 1.65))
ax.set_title('Documented knowledge exchange—not isolated invention', fontsize=21)
save(fig, 'knowledge_exchange')

fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout='constrained')
for ax, released in zip(axes, (False, True)):
    ax.axis('off'); ax.set(xlim=(0, 10), ylim=(-2, 3))
    ax.plot([1, 9], [0, 0], color=K, lw=4)
    ax.plot([2, 4], [0, 0], color=G, lw=10)
    ax.plot([6, 8], [0, 0], color=G, lw=10)
    ax.add_patch(Circle((5, 0), .1, color=R))
    arrow(ax, (5, 0), (5, -1.6), R); ax.text(5.15, -1.5, 'Weight', color=R)
    for xx in (2.5, 3.5, 6.5, 7.5): arrow(ax, (xx, .15), (xx, 1.1))
    ax.text(5, 1.6, 'Aerodynamic loading', ha='center', color=B)
    if not released:
        ax.plot([1, 9], [-.7, -.7], color=K, lw=3)
        arrow(ax, (4, -.7), (4, 0), G)
        ax.text(3.8, -1.55, 'Launch contact / reaction', ha='right', color=G, fontsize=11)
        arrow(ax, (1.2, .1), (2.2, .1), R)
        ax.text(1.1, .5, 'Acceleration', color=R, fontsize=11)
    else:
        ax.text(5, -1.95, 'Contact reaction disappears; air loads must support flight.', ha='center', fontsize=11)
    ax.set_title('On the launcher' if not released else 'After clean release', fontsize=18)
fig.suptitle('Launch is a structural load case and a changing boundary condition', fontsize=19)
fig.text(.5, -.035, 'Qualitative tandem-wing sketch. Not a reconstruction of measured Aerodrome forces or its crash trajectory.', ha='center', fontsize=11)
save(fig, 'langley_launch')

fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout='constrained')
lam = np.linspace(1, 4, 150)
axes[0].plot(lam, lam**3, color=B, lw=3, label='Weight ∝ λ³')
axes[0].plot(lam, lam**4, color=R, lw=3, label='Root moment ∝ λ⁴')
axes[0].set(xlabel='Geometric size factor λ', ylabel='Ratio to starting model', title='Loads grow at different rates')
axes[0].grid(alpha=.2); axes[0].legend()
axes[1].plot(lam, lam, color=R, lw=3, label='Stress ∝ λ')
axes[1].plot(lam, lam**2, color=B, lw=3, label='Absolute deflection ∝ λ²')
axes[1].set(xlabel='Geometric size factor λ', ylabel='Ratio to starting model', title='Same material; geometrically scaled members')
axes[1].grid(alpha=.2); axes[1].legend()
fig.suptitle('Why a larger copy is not an equally safe copy', fontsize=21)
fig.text(.5, -.04, 'Ideal cantilever under geometrically scaled 1g distributed weight; not Langley dimensions or an aerodynamic-similarity model.', ha='center', fontsize=10)
save(fig, 'scale_effects')

# Numerical checks of the classroom examples, independent of historical claims.
integral = np.trapezoid if hasattr(np, 'trapezoid') else np.trapz
for p, cp in ((2*(1-x), 1/3), (2*x, 2/3)):
    assert abs(integral(p, x)-1) < 1e-12
    assert abs(integral(x*p, x)/integral(p, x)-cp) < 1e-6
assert np.isclose(.25+.05/.5, .35)
assert np.isclose((8/6)*np.sin(np.deg2rad(30)), 2/3)
print('Seven figures generated; pressure-centroid, CP and balance examples verified.')
