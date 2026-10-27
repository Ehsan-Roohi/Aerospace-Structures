#@title A fixed-fixed beam with an additional middle roller: solve and check
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon


def lecture03_middle_support_example():
    span, support, force_at = 450.0, 225.0, 112.5  # mm
    force, elastic_modulus = 2.0, 2000.0          # N; MPa
    inertia = 20.0 * 10.0**3 / 12.0              # mm^4
    rigidity = elastic_modulus * inertia

    def reactions(load_station):
        # Columns: CA, RA, RC. Rows: theta(L), v(L), v(a).
        matrix = np.array([[span, -span**2/2, -(span-support)**2/2],
                           [span**2/2, -span**3/6, -(span-support)**3/6],
                           [support**2/2, -support**3/6, 0.0]])
        rhs = force*np.array([(span-load_station)**2/2,
                              (span-load_station)**3/6,
                              max(support-load_station, 0.0)**3/6])
        ca, ra, rc = np.linalg.solve(matrix, rhs)
        rb = -force-ra-rc
        cb = -ca-rb*span-rc*support-force*load_station
        return ca, ra, rc, rb, cb

    ca, ra, rc, rb, cb = reactions(force_at)
    def rotation(station):
        return -(ca*station-ra*station**2/2-force*np.maximum(station-force_at,0)**2/2
                 -rc*np.maximum(station-support,0)**2/2)/rigidity
    def displacement(station):
        return -(ca*station**2/2-ra*station**3/6-force*np.maximum(station-force_at,0)**3/6
                 -rc*np.maximum(station-support,0)**3/6)/rigidity
    assert max(abs(displacement(t)) for t in [0,support,span]) < 1e-10
    assert max(abs(rotation(t)) for t in [0,span]) < 1e-10
    assert abs(ra+rc+rb+force) < 1e-10
    assert abs(ca+cb+rc*support+rb*span+force*force_at) < 1e-8
    assert abs(rotation(support)) > 1e-6  # NOT constrained by the middle roller
    assert rc < 0                       # upward contact: no lift-off in this case
    assert np.allclose([ca,ra,rc,rb,cb],[-70.3125,-1.1875,-1.0,0.1875,-14.0625])
    direct = reactions(support)
    assert np.allclose(direct,[0,0,-force,0,0],atol=1e-9)
    print("Reactions (downward / clockwise positive):")
    print(f"RA = {ra:+.4f} N; RC = {rc:+.4f} N; RB = {rb:+.4f} N")
    print(f"CA = {ca:+.4f} N mm; CB = {cb:+.4f} N mm")
    print(f"theta(C) = {rotation(support):+.8f} rad: the roller is allowed to rotate.")
    print("RB is downward; an end clamp can transmit either sign of vertical reaction.")
    print("All five prescribed support motions and both equilibrium equations passed.")

    fig, axes = plt.subplots(2,1,figsize=(12,6.3),layout='constrained')
    ax = axes[0]
    ax.set_title("Physical supports: two clamps plus a middle roller (the beam is continuous)",loc='left')
    ax.plot([0,span],[0,0],lw=5,color='#19394e')
    for x0 in [-9,span]:
        ax.add_patch(Rectangle((x0,-20),9,40,facecolor='#eeeeee',edgecolor='#555555',hatch='///'))
    ax.add_patch(Polygon([[support, -3],[support-12,-20],[support+12,-20]],closed=True,
                         facecolor='#dddddd',edgecolor='#333333'))
    ax.plot([support-16,support+16],[-25,-25],color='#555555')
    ax.annotate('P = 2 N', (force_at,3),(force_at,48),ha='center',
                arrowprops=dict(arrowstyle='-|>',lw=2,color='#19394e'))
    for station,label in [(0,'A: clamp'),(support,'C: roller'),(span,'B: clamp')]:
        ax.text(station,-43,label,ha='center',fontsize=11)
    ax.text(support,38,'v(C) = 0; rotation is free',ha='center',fontsize=11)
    ax.set_xlim(-35,485);ax.set_ylim(-65,70);ax.axis('off')
    ax = axes[1]
    positions = np.unique(np.r_[np.linspace(0,span,901),support,force_at])
    ax.plot(positions,displacement(positions),color='#19394e',lw=2)
    ax.plot([0,support,span],[0,0,0],'o',color='#ba4a00',label='Prescribed v = 0')
    ax.axhline(0,color='#999999',lw=.7)
    ax.set_xlabel('Station x (mm)');ax.set_ylabel('v (mm), downward positive')
    ax.invert_yaxis();ax.grid(alpha=.25);ax.legend(loc='best')
    ax.set_title('Computed shape: continuous displacement and slope at C; no internal hinge',loc='left')
    return fig


lecture03_middle_support_example()
plt.show()
