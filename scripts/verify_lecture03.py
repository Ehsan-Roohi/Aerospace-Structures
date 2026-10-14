"""Audit saved lecture content and independently check the numerical examples."""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--schema', type=Path)
args = parser.parse_args()
nb = json.loads((ROOT/'notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb').read_text(encoding='utf-8'))
if args.schema:
    import fastjsonschema
    fastjsonschema.compile(json.loads(args.schema.read_text()))(nb)

markdown = '\n\n'.join(c['source'] for c in nb['cells'] if c['cell_type']=='markdown')
assert not re.search(r'(?<!\$)\$(?!\$)',markdown), 'Visible inline dollar delimiters'
assert not any(ord(c)<32 and c not in '\n\r' for c in markdown), 'Control character in prose'
assert '\\(' not in markdown and '\\)' not in markdown
assert markdown.count('beamCase=l03-')==5
assert 'How Figure 4 is actually calculated' in markdown
assert 'Hooke' in markdown and 'radius R' in markdown
assert 'v(0) = 0' in markdown and 'C₁ = 0' in markdown
ids=[c['id'] for c in nb['cells']]
assert len(ids)==len(set(ids))
figures=0
for c in nb['cells']:
    if c['cell_type']=='code':
        compile(c['source'],'Lecture 03','exec')
        assert c['execution_count'] is not None
        assert not any(o['output_type']=='error' for o in c['outputs'])
        figures+=sum('image/png' in o.get('data',{}) for o in c['outputs'])
assert figures==15

L,b,h,E,P=450.,20.,10.,2000.,2.
I=b*h**3/12
close=lambda a,b: abs(a-b)<1e-9
assert close(P*L*h/(2*I),2.7)
assert close(P*L**3/(3*E*I),18.225)
assert close((P/L)*L**4/(8*E*I),6.834375)
assert close(P*L**3/(48*E*I),1.1390625)
assert close(P*L**3/(192*E*I),.284765625)
assert close((P*L/(E*I))*(h/2),.00135)
assert close(E*.00135,2.7)
print(f'PASS: {len(nb["cells"])} cells, {figures} saved figures, no inline dollar signs; five app links and numerical stress/strain/deflection checks.')
