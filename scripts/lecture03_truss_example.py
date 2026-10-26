"""Determinate truss warm-up: equilibrium, axial integration and software checking."""
import uuid

INTRO = r'''## 7. A determinate truss warm-up for HW 4

This small triangle is a practice model, **not the Flyer geometry or the answer to HW 4**. It introduces the joint equilibrium and output checks used in that assignment. Use the HW 4 handout for its geometry, lift and materials.

Take joints A = (0, 0), B = (400, 0), C = (200, 150), in mm. Connect AB, AC and BC. A is a pin (x and y restrained); B is a horizontal-ground roller (y restrained, x free). Apply P = 100 N **downward** at C. Every member has E = 70,000 MPa and area Aₘ = 50 mm². Neglect member weight. Members are straight, axial, pin-jointed and linearly elastic; positive axial force means tension. The vertical coordinate y is upward, unlike the beam's downward-positive displacement v.

### First find forces using equilibrium

The two inclined lengths are 250 mm; their direction cosines have magnitudes 200/250 = 0.8 and 150/250 = 0.6. Draw the supported triangle, then replace its supports with reactions. Taking moments about A:

$$400R_{By}-100(200)=0,\qquad R_{By}=50\ \mathrm{N}.$$

Vertical and horizontal equilibrium give Rₐᵧ = 50 N upward and Rₐₓ = 0. At C, assume both inclined member forces point away from the joint (tension). Symmetry and vertical balance give:

$$-0.6N_{AC}-0.6N_{BC}-100=0,\qquad N_{AC}=N_{BC}=-83.3333\ \mathrm{N}.$$

The negative answers mean **compression**, not a negative material property. At A, horizontal equilibrium gives:

$$N_{AB}+0.8N_{AC}=0,\qquad N_{AB}=66.6667\ \mathrm{N}\quad\text{(tension)}.$$

There are j = 3 joints, m = 3 members and r = 3 reaction components, so m + r = 2j = 6. This non-collinear triangle is stable and statically determinate: equilibrium finds its reactions and member forces without an extra compatibility equation. The count alone does not prove stability for an arbitrary arrangement.

### Then integrate axial strain to find each member's extension

Let s measure distance along a member; Aₘ is its cross-sectional area, not joint A. Axial stress and strain give:

$$\sigma=\frac{N}{A_m},\qquad \varepsilon=\frac{\sigma}{E}=\frac{N}{EA_m},\qquad
\Delta\ell=\int_0^{\ell}\varepsilon(s)\,ds.$$

With no distributed axial load, N is constant along each member. Here E and Aₘ are also constant, so:

$$\Delta\ell=\frac{N}{EA_m}\int_0^{\ell}1\,ds
=\frac{N}{EA_m}[s]_0^{\ell}=\frac{N\ell}{EA_m}.$$

The unit check is (N × mm)/(N/mm² × mm²) = mm. Thus:

$$\Delta\ell_{AB}=\frac{66.6667(400)}{70000(50)}=0.00761905\ \mathrm{mm},$$

$$\Delta\ell_{AC}=\Delta\ell_{BC}=\frac{-83.3333(250)}{70000(50)}=-0.00595238\ \mathrm{mm}.$$

An extension is positive; shortening is negative. These are **member length changes**, not directly the vertical displacement of C. To connect them, use small-displacement geometry:

$$\Delta\ell_{ij}=c(u_{jx}-u_{ix})+s(u_{jy}-u_{iy}),$$

where c and s are signed direction cosines from i to j. The restraints give uₐₓ = uₐᵧ = uᵦᵧ = 0. Member AB gives uᵦₓ = 0.00761905 mm. Applying the length-change relation to AC and BC gives:

$$0.8u_{Cx}+0.6u_{Cy}=-0.00595238,$$

$$-0.8(u_{Cx}-0.00761905)+0.6u_{Cy}=-0.00595238.$$

Subtracting the equations gives u꜀ₓ = 0.00380952 mm; substitution gives u꜀ᵧ = −0.0150000 mm, or **0.015 mm downward**. C has a small horizontal motion because the roller at B permits the base to extend. Do not set u꜀ₓ to zero merely because the drawing is symmetric.

Compatibility was needed to connect extensions to joint motion; it was **not an additional equation needed to determine these member forces**. For varying E, area or axial force, keep those functions inside the strain integral and split it at their changes.
'''

CODE = r'''#@title Truss warm-up — independent stiffness solution and deflected shape
t_xy = np.array([[0., 0.], [400., 0.], [200., 150.]])
t_members = [(0, 1), (0, 2), (1, 2)]
t_names = ['AB', 'AC', 'BC']
t_E, t_area = 70000., 50.
t_K = np.zeros((6, 6)); t_f = np.zeros(6); t_f[5] = -100.
t_parts = []
for t_i, t_j in t_members:
    t_vector = t_xy[t_j] - t_xy[t_i]
    t_length = np.linalg.norm(t_vector)
    t_c, t_s = t_vector / t_length
    t_B = np.array([-t_c, -t_s, t_c, t_s])
    t_dofs = np.array([2*t_i, 2*t_i+1, 2*t_j, 2*t_j+1])
    t_K[np.ix_(t_dofs, t_dofs)] += t_E*t_area/t_length*np.outer(t_B, t_B)
    t_parts.append((t_length, t_B, t_dofs))
t_fixed = np.array([0, 1, 3]); t_free = np.array([2, 4, 5])
assert np.linalg.matrix_rank(t_K[np.ix_(t_free, t_free)]) == len(t_free)
t_u = np.zeros(6)
t_u[t_free] = np.linalg.solve(t_K[np.ix_(t_free, t_free)], t_f[t_free])
t_reaction = t_K @ t_u - t_f
t_extension = np.array([t_B @ t_u[t_dofs] for t_length, t_B, t_dofs in t_parts])
t_N = np.array([t_E*t_area/t_length*t_extension[k] for k, (t_length, _, _) in enumerate(t_parts)])
assert np.allclose(t_N, [200/3, -250/3, -250/3])
assert np.allclose(t_reaction[t_fixed], [0, 50, 50])
assert np.allclose(t_u[[2, 4, 5]], [0.007619047619, 0.003809523810, -0.015])
assert np.max(np.abs(t_reaction[t_free])) < 1e-9
print('Member   N (N)     stress (MPa)   extension (mm)')
for t_name, t_force, t_delta in zip(t_names, t_N, t_extension):
    print(f'{t_name:5s} {t_force:10.5f} {t_force/t_area:13.6f} {t_delta:15.8f}')
print(f'Reactions Ax, Ay, By (N): {t_reaction[t_fixed]}')
print(f'C displacement (mm): ux={t_u[4]:.8f}, uy={t_u[5]:.8f}')
print(f'Maximum free-joint force residual: {np.max(abs(t_reaction[t_free])):.2e} N')
t_scale = 1000.
t_moved = t_xy + t_scale*t_u.reshape(-1, 2)
fig, t_axes = plt.subplots(1, 2, figsize=(13, 5.8), layout='constrained')
for t_k, (t_i, t_j) in enumerate(t_members):
    t_color = '#b1322e' if t_N[t_k] > 0 else '#236bb4'
    t_axes[0].plot(t_xy[[t_i, t_j], 0], t_xy[[t_i, t_j], 1], color=t_color, lw=3)
    t_mid = (t_xy[t_i]+t_xy[t_j])/2
    t_axes[0].text(t_mid[0], t_mid[1]+10, f'{t_names[t_k]}: {t_N[t_k]:.2f} N', ha='center', fontsize=11)
    t_axes[1].plot(t_xy[[t_i, t_j], 0], t_xy[[t_i, t_j], 1], '--', color='gray', lw=1.5)
    t_axes[1].plot(t_moved[[t_i, t_j], 0], t_moved[[t_i, t_j], 1], color='#19394e', lw=2.5)
for t_k, t_name in enumerate(['A (pin)', 'B (roller)', 'C']):
    t_axes[0].plot(*t_xy[t_k], 'o', color='#19394e')
    t_axes[0].text(t_xy[t_k, 0], t_xy[t_k, 1]-22, t_name, ha='center', fontsize=11)
t_axes[0].annotate('100 N', xy=t_xy[2], xytext=(200, 215), ha='center', arrowprops=dict(arrowstyle='->', color='black', lw=2))
for t_ax in t_axes:
    t_ax.set(xlim=(-65, 465), ylim=(-65, 235), xlabel='x (mm)', ylabel='y (mm; upward +)')
    t_ax.set_aspect('equal'); t_ax.grid(alpha=.2)
t_axes[0].set_title('Axial forces: tension red, compression blue')
t_axes[1].set_title('Dashed: original; solid: displacement × 1000')
t_axes[1].text(10, 205, 'Actual C vertical motion: −0.015 mm', fontsize=11)
plt.show()
'''

CHECK = r'''### Compare this truss with Truss Lab

Open [Truss Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#truss), enter these three joints and three **bar** members, and use the stated supports, E, area and downward force. Compare reactions, every axial force and stress, and C's numerical displacement. Record the magnification separately from the actual displacement. No mesh subdivision is needed to make these straight, end-loaded axial members exact within the linear truss model.

For HW 4, use its assigned half-wing geometry and loads instead. Its crossed cables are **tension-only**: a negative trial cable force cannot be retained as cable compression. Identify a stable active set, check any slack cables, and compare its reactions and member forces with software. Crossing lines are not automatically joints. Counting all drawn cables as active bars can give a misleading indeterminacy count.

**Optional extension for a larger truss:** an additional independent redundant member can make a stable truss statically indeterminate. Equilibrium then leaves a force undetermined; elastic extension and compatibility supply the extra relation. The triangle above already contains all three possible joint pairs—do not add a duplicate member and call it a new diagonal. Virtual work and energy methods for these displacement/compatibility calculations follow in Lecture 04.
'''


def add_truss(cells):
    anchor = next(i for i, c in enumerate(cells) if c['source'].startswith('## 7. Four-minute'))
    cells[anchor]['source'] = cells[anchor]['source'].replace('## 7. Four-minute', '## 8. Four-minute', 1)
    additions = []
    for kind, source in [('markdown', INTRO), ('code', CODE), ('markdown', CHECK)]:
        cell = dict(cell_type=kind, id=uuid.uuid5(uuid.NAMESPACE_URL, source).hex[:8], metadata={}, source=source.strip())
        if kind == 'code':
            cell.update(execution_count=None, outputs=[])
        additions.append(cell)
    cells[anchor:anchor] = additions
