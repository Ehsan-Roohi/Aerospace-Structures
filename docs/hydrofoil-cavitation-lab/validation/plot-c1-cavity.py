"""Figures for the C1 curved-sheet axisymmetric cavity verification (c1-cavity.html).
Reads c1-cavity-mesh-study.json (this solver), stable-kernel-repair-profiles.json (0.2.1 polygon baseline)
and c1-cavity-verification.json (sphere convergence). Numerical verification only."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
if 'font.enable_last_resort' in matplotlib.rcParams:
    matplotlib.rcParams['font.enable_last_resort'] = False
if 'mathtext.fallback' in matplotlib.rcParams: matplotlib.rcParams['mathtext.fallback'] = None
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, NullFormatter

out = Path(__file__).resolve().parent
if __import__('os').name == 'nt': out = Path('\\\\?\\' + str(out))
study = json.loads((out / 'c1-cavity-mesh-study.json').read_text(encoding='utf-8'))
base = json.loads((out / 'stable-kernel-repair-profiles.json').read_text(encoding='utf-8'))
ver = json.loads((out / 'c1-cavity-verification.json').read_text(encoding='utf-8'))
import logging; logging.getLogger('matplotlib.font_manager').setLevel(logging.ERROR)
plt.rcParams.update({'font.family': ['Times New Roman', 'DejaVu Serif', 'serif'], 'font.size': 13, 'axes.labelsize': 14, 'axes.titlesize': 15, 'legend.fontsize': 12})
logfmt = FuncFormatter(lambda v, pos: ('1e' + str(int(round(np.log10(v))))) if v > 0 else '0')
meshes = sorted(int(k) for k in study['meshes'])
colors = {32: '#8b4726', 64: '#b8860b', 128: '#075eb7', 256: '#117b42'}

# ------------------------------------------------------------------ figure 1: complete signed profiles
fig, ax = plt.subplots(4, 1, figsize=(12, 20), layout='constrained')
m256 = study['meshes'][str(meshes[-1])]; p = m256['profiles']; L = m256['nodes'][m256['N']][0]
s = np.array(p['arclength_R']); vn = np.array(p['normal_U']); vt = np.array(p['tangent_U']); pan = np.array(p['panel'])
Nf, Nc = m256['Nf'], m256['Nc']
cav = (pan >= Nf) & (pan < Nf + Nc)
ax[0].plot(s, vn, '.', ms=2.5, color=colors[meshes[-1]], label=f'Current C1 solver · {meshes[-1]} cavity panels · all {len(s)} samples')
for key, col in (('64', '#c86464'), ('256', '#8b4726')):
    r = base['meshes'][key]['result']; a = base['meshes'][key]['audit']; q = a['profiles']
    nodes = np.array(r['nodes']); seg = np.hypot(*np.diff(nodes, axis=0).T); arc = np.r_[0, np.cumsum(seg)]
    fr = np.array(a['fractions']); sp = np.array([arc[j] + fr[k % len(fr)] * seg[j] for k, j in enumerate(q['panel'])])
    ax[0].plot(sp, q['normal_U'], '.', ms=2, color=col, alpha=.7, label=f'Previous polygon 0.2.1 · {key} cavity panels')
for v in (arc[Nf] if False else s[pan == Nf][0], s[pan == Nf + Nc - 1][-1]):
    ax[0].axvline(v, color='grey', lw=.6)
ax[0].axhline(0, color='black', lw=.7); ax[0].axhline(.01, color='grey', ls='--', lw=.8, label='Unchanged 0.01 U gate'); ax[0].axhline(-.01, color='grey', ls='--', lw=.8)
ax[0].set(xlabel='Meridian arclength s / R (front axis → rim → image rim → axis)', ylabel='Direct normal velocity / U', title='Signed direct-field normal velocity, nine fractions of every panel including both rims')
ax[0].legend(loc='upper right', ncol=2); ax[0].grid(alpha=.25)
# log |vn| for every C1 mesh
for n in meshes:
    m = study['meshes'][str(n)]; q = m['profiles']; ax[1].semilogy(np.array(q['arclength_R']), np.abs(np.array(q['normal_U'])) + 1e-16, '.', ms=2, color=colors.get(n, 'k'), label=f'{n} cavity panels')
ax[1].axhline(.01, color='grey', ls='--', lw=.8, label='0.01 U gate'); ax[1].yaxis.set_major_formatter(logfmt); ax[1].yaxis.set_minor_formatter(NullFormatter())
ax[1].set(xlabel='Meridian arclength s / R', ylabel='|direct normal velocity| / U', title='Magnitude of the same samples for every mesh (curved sheet)'); ax[1].legend(loc='upper right', ncol=5); ax[1].grid(alpha=.25)
# cavity Cp + sigma defect vs x/L
xy = np.array(p['points'])[cav]; cp = np.array(p['cavityCpPlusSigmaDefect'])
ax[2].plot(xy[:, 0] / L, -cp, '.', ms=2.5, color=colors[meshes[-1]], label=f'Current C1 solver · {meshes[-1]} cavity panels')
for key, col in (('256', '#8b4726'),):
    r = base['meshes'][key]['result']; a = base['meshes'][key]['audit']; q = a['profiles']; mask = np.array([(r['Nf'] <= j < r['Nf'] + r['Nc']) for j in q['panel']])
    xq = np.array(q['points'])[mask][:, 0] / r['L']; vq = np.array(q['normal_U'])[mask]; tq = np.array(q['tangent_U'])[mask]
    ax[2].plot(xq, 1 - vq * vq - tq * tq + r['sigma'], '.', ms=2, color=col, alpha=.7, label=f'Previous polygon 0.2.1 · {key} cavity panels')
ax[2].axhline(0, color='black', lw=.7); ax[2].axhline(.02, color='grey', ls='--', lw=.8, label='Unchanged 0.02 Cp gate'); ax[2].axhline(-.02, color='grey', ls='--', lw=.8)
ax[2].set(xlabel='Cavity axial position x / L', ylabel='Direct Cp + σ on the free surface', title='Dynamic condition checked with the directly evaluated exterior speed (never the nodal trace)'); ax[2].legend(loc='upper center', ncol=3); ax[2].grid(alpha=.25)
# front face Cp: direct field vs trace, plus polygon trace
face = pan < Nf
rf = np.array(p['points'])[face][:, 1]; cpf = 1 - vn[face] ** 2 - vt[face] ** 2
order = np.argsort(rf)
ax[3].plot(rf[order], cpf[order], '-', lw=1.6, color=colors[meshes[-1]], label=f'Direct exterior field · C1 · {meshes[-1]} cavity panels')
fr_ = np.array([f['r_R'] for f in m256['face']]); ct = np.array([f['CpTrace'] for f in m256['face']])
ax[3].plot(fr_, ct, 'o', ms=3.5, mfc='none', color='#075eb7', label='Nodal trace 1 − γ² · C1')
r = base['meshes']['256']['result']; fb = np.array(r['face'] if 'face' in r else [])
if len(fb):
    ax[3].plot([f['r_R'] for f in fb], [f['CpTrace'] for f in fb], 'x', ms=3, color='#8b4726', label='Nodal trace · Previous polygon 0.2.1 · 256')
ax[3].axhline(-m256['sigma'], color='grey', ls='--', lw=.8, label='Cavity pressure −σ')
ax[3].set(xlabel='Face radius r / R', ylabel='Front-face Cp', title=f'Front-disk pressure (σ = {m256["sigma"]:.7f}; CD trace {m256["CD"]:.7f}, CD direct {m256["CD_directField"]:.7f})'); ax[3].legend(loc='lower left'); ax[3].grid(alpha=.25)
for axis in ax:
    handles, labels = axis.get_legend_handles_labels()
    axis.legend(handles, labels, loc='lower center', bbox_to_anchor=(.5,1.015), ncol=2, fontsize=11)
    axis.set_title(axis.get_title(), pad=68)
fig.suptitle('Axisymmetric disk cavity, L/R = 8 · Current C1 solver · numerical verification only', fontsize=16)
fig.savefig(out / 'c1-cavity-profiles.png', dpi=170); fig.savefig(out / 'c1-cavity-profiles.svg')

# ------------------------------------------------------------------ figure 2: mesh study
conv = ver['meshConvergence']
fig, ax = plt.subplots(1, 3, figsize=(15, 5), layout='constrained')
N = np.array(meshes, float)
for key, lab, mk in (('maxNormal_U', 'max |vₙ| / U', 'o'), ('maxCavityDynamicCpResidual', 'max |Cp + σ|', 's'), ('maxTraceSpeedMismatch_U', 'max |v_t + γ| / U', '^')):
    ax[0].loglog(N, conv[key]['values'], mk + '-', label='C1 ' + lab)
bN = np.array([64, 192, 256], float)
ax[0].loglog(bN, [base['meshes'][k]['audit']['maxNormal_U'] for k in ('64', '192', '256')], 'o--', color='#8b4726', label='0.2.1 polygon max |vₙ| / U')
ax[0].loglog(bN, [base['meshes'][k]['audit']['maxCavityDynamicCpResidual'] for k in ('64', '192', '256')], 's--', color='#c86464', label='0.2.1 polygon max |Cp + σ|')
ax[0].axhline(.01, color='grey', ls=':', lw=1); ax[0].axhline(.02, color='grey', ls=':', lw=1); ax[0].text(34, .0105, '0.01 U gate', fontsize=10); ax[0].text(34, .021, '0.02 Cp gate', fontsize=10)
ref = conv['maxNormal_U']['values'][0] * (N / N[0]) ** -3.5; ax[0].loglog(N, ref, 'k:', lw=1, label='slope −3.5')
ax[0].set(xlabel='Cavity panels Nc (Nf = Nc/2)', ylabel='Direct-field defect maximum', title='Nine-fraction direct-field defects'); ax[0].legend(fontsize=11); ax[0].grid(alpha=.25, which='both')
ax[0].yaxis.set_major_formatter(logfmt); ax[0].yaxis.set_minor_formatter(NullFormatter())
for key, lab, mk in (('sigma', 'σ', 'o'), ('Rmax', 'Rmax / R', 's'), ('CD', 'CD', '^')):
    v = np.array(conv[key]['values']); rich = conv[key].get('richardson', v[-1])
    ax[1].loglog(N[:-1], np.abs(v[:-1] - rich), mk + '-', label=f'|{lab} − Richardson limit|')
ref = np.abs(conv['sigma']['values'][0] - conv['sigma']['richardson']) * (N[:-1] / N[0]) ** -4; ax[1].loglog(N[:-1], ref, 'k:', lw=1, label='slope −4')
ax[1].set(xlabel='Cavity panels Nc', ylabel='Distance to the extrapolated limit', title='Integral quantities (curved sheet)'); ax[1].legend(fontsize=11); ax[1].grid(alpha=.25, which='both'); ax[1].yaxis.set_major_formatter(logfmt); ax[1].yaxis.set_minor_formatter(NullFormatter())
sph = next(c for c in ver['checks'] if c['name'].startswith('Sphere'))
rows = sph['rows']; Ns = np.array([r['N'] for r in rows], float)
for key, lab, mk in (('maxNormal_U', 'surface max |vₙ| / U', 'o'), ('maxSurfaceFieldErr', 'surface field error', 's'), ('exteriorFieldErr', 'exterior field error', '^'), ('interiorFieldErr', 'interior residual speed', 'v'), ('gammaErr', 'nodal γ error', 'd')):
    ax[2].loglog(Ns, [r[key] for r in rows], mk + '-', label=lab)
ax[2].loglog(Ns, rows[0]['maxNormal_U'] * (Ns / Ns[0]) ** -3, 'k:', lw=1, label='slope −3'); ax[2].loglog(Ns, rows[0]['gammaErr'] * (Ns / Ns[0]) ** -4, 'k-.', lw=1, label='slope −4')
ax[2].set(xlabel='Panels N', ylabel='Error against the exact sphere solution', title='Exact-solution control: unit sphere'); ax[2].legend(fontsize=11); ax[2].grid(alpha=.25, which='both'); ax[2].yaxis.set_major_formatter(logfmt); ax[2].yaxis.set_minor_formatter(NullFormatter())
fig.suptitle('Mesh refinement and exact-solution control · numerical verification only', fontsize=15)
for axis in ax:
    axis.set_xticks([16,32,64,128] if axis is ax[2] else [32,64,128,256]); axis.xaxis.set_major_formatter(FuncFormatter(lambda v,pos:str(int(v)))); axis.xaxis.set_minor_formatter(NullFormatter())
fig.savefig(out / 'c1-cavity-mesh-study.png', dpi=170); fig.savefig(out / 'c1-cavity-mesh-study.svg')

# ------------------------------------------------------------------ figure 3: geometry
fig, ax = plt.subplots(1, 2, figsize=(14, 4.6), layout='constrained')
nodes = np.array(m256['nodes'])
ax[0].plot(nodes[:, 0], nodes[:, 1], '-', lw=1.4, color=colors[meshes[-1]], label=f'C1 meridian nodes · {meshes[-1]} cavity panels')
nb = np.array(base['meshes']['256']['result']['nodes']); ax[0].plot(nb[:, 0], nb[:, 1], ':', lw=1, color='#8b4726', label='Previous polygon 0.2.1 · 256')
ax[0].plot([0, 0], [0, 1], 'k-', lw=3); ax[0].plot([L, L], [0, 1], 'k-', lw=3, alpha=.4); ax[0].set_aspect('equal'); ax[0].set(xlabel='x / R', ylabel='r / R', title=f'Cavity shape (Rmax / R = {m256["Rmax"]:.7f}, volume {m256["volume"]:.5f} R³)'); ax[0].legend(loc='lower center'); ax[0].grid(alpha=.25)
xs = np.array(p['points'])[cav][:, 0]; rs = np.array(p['points'])[cav][:, 1]
sel = xs < .25
ax[1].plot(xs[sel], rs[sel], '.', ms=3, color=colors[meshes[-1]], label='direct-field sample points near the rim (C1)')
ax[1].plot(nodes[Nf:Nf + 12, 0], nodes[Nf:Nf + 12, 1], 'o', ms=5, mfc='none', color='k', label='nodes')
xx = np.linspace(0, .25, 200); c = (nodes[Nf + 1, 0]) / (nodes[Nf + 1, 1] - 1) ** 1.5
ax[1].plot(xx, 1 + (xx / c) ** (2 / 3), '--', lw=1, color='grey', label='x ∝ (r − R)^{3/2} through node 1')
ax[1].set(xlabel='x / R', ylabel='r / R', title='Tangential departure at the sharp rim (x odd, r even in τ)'); ax[1].legend(loc='lower right'); ax[1].grid(alpha=.25)
fig.savefig(out / 'c1-cavity-geometry.png', dpi=170); fig.savefig(out / 'c1-cavity-geometry.svg')
print('figures written')
