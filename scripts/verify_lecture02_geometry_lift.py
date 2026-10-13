"""Execute the complete Lecture 02 without changing saved student outputs."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
nb=json.loads((ROOT/'notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb').read_text(encoding='utf-8'))
ids=[c['id'] for c in nb['cells']]
assert len(ids)==len(set(ids))
assert '079e72ea' in ids and 'd9e8de83' in ids
assert all(x in ids for x in ['l2-oct13-cl-experiment','l2-oct13-real-aircraft','l2-oct13-geometry-reasons'])
scope={'__name__':'__main__'}
plt.show=lambda *a,**k:plt.close('all')
for c in nb['cells']:
    if c['cell_type']=='code':
        exec(compile(''.join(c['source']),c['id'],'exec'),scope)
        print('PASS',c['id'])
import numpy as np
a0=2*np.pi
for ar in (4,8,12):
    a=a0/(1+a0/(np.pi*.9*ar))
    assert 0<a<a0
assert np.isclose(a0/(1+a0/(np.pi*.9*1e9)),a0,rtol=1e-7)
assert np.isclose((.7**2/(np.pi*.85*8))/(.7**2/(np.pi*.85*4)),.5)
print('PASS full notebook execution; finite/infinite-span limits and induced-drag AR scaling.')
