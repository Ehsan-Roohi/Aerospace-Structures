"""Regression: support geometry and replacement reactions never share a panel."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon

root = Path(__file__).resolve().parents[1]
nb = json.loads((root / 'notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb').read_text(encoding='utf-8'))
setup = next(''.join(c['source']) for c in nb['cells'] if c['cell_type']=='code' and 'def beam_system_or_fbd' in ''.join(c['source']))
ns = {}
exec(setup, ns)
for kind in ('cantilever', 'simple', 'fixed'):
    for uniform in (False, True):
        fig, axes = plt.subplots(2)
        for fbd, ax in zip((False, True), axes):
            ns['beam_system_or_fbd'](ax, kind, '', uniform=uniform, fbd=fbd)
            supports = [p for p in ax.patches if isinstance(p, (Rectangle, Polygon))]
            labels = [t.get_text() for t in ax.texts]
            assert bool(supports) == (not fbd), (kind, fbd, supports)
            assert any('RA =' in t for t in labels) == fbd
            assert any(('q =' if uniform else 'P =') in t for t in labels)
        plt.close(fig)
print('PASS: 12 panels keep physical supports separate from reactions and retain applied loads.')
