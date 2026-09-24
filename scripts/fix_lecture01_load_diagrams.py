"""Repair the malformed load-path text and separate the cut free-body views."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
nb = json.loads(p.read_text(encoding='utf-8'))
for cell in nb['cells']:
    s = ''.join(cell.get('source', []))
    if '$$\\boxed{\text{air pressure}' in s:
        start = s.index('$$\\boxed{\text{air pressure}')
        end = s.index('$$', start + 2) + 2
        s = s[:start] + '**Air pressure → skin → ribs/stringers and spars/wing box → wing-root attachments → fuselage.**\n\nThis is a simplified load-path summary: the connected skin, ribs, stringers and spars share loads; they are not a single serial chain.' + s[end:]
    if cell.get('id') == 'f013bf43':
        s = s[:s.index('# ---------- Panel B:')]
        s = s.replace('fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(17.0, 6.4), gridspec_kw={"wspace": 0.27})', 'fig, ax1 = plt.subplots(figsize=(11.5, 7.5))')
        s = s.replace('7B. Figure — wing components, load path, shear, bending, and torsion', '7B. Figure — wing anatomy and load path')
        s += '\nplt.show()\n'
        cell['outputs'] = []
        cell['execution_count'] = None
    cell['source'] = s.splitlines(keepends=True)
idx = next(i for i,c in enumerate(nb['cells']) if c.get('id') == 'f013bf43') + 1
new = '''### 7C. Isolate the outboard wing: shear, bending and torsion

Imagine cutting the wing at span station $y$ and keeping only the part between the cut and the tip. Replace the removed inboard wing by the force and moments it exerts at the cut. The three panels below describe the same cut using separate views so that rotation about the chordwise axis is not confused with rotation about the spanwise axis.

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/Wing_Cut_Resultants_v2.png" alt="Separate outboard free-body diagrams for shear and bending, plus a cross-section showing eccentric loading and resisting torsion" width="1200"></p>

**Shear:** upward loading on the retained outboard wing requires a downward cut force. If $V_z$ denotes its positive magnitude, vertical equilibrium gives

$$V_z(y)=\\int_y^{b/2}q_z(\\eta)\\,d\\eta.$$

**Bending:** each upward load contributes its force times the spanwise distance from the cut. In the side view shown, these loads turn the outboard segment counterclockwise, so the cut moment acts clockwise. Its positive magnitude is

$$M_x(y)=\\int_y^{b/2}(\\eta-y)q_z(\\eta)\\,d\\eta.$$

**Torsion:** a load offset from the shear center twists the wing about its spanwise axis. Looking at the cross-section, an upward load to the right of the shear center creates a counterclockwise torque; the resisting cut torque is clockwise. With signed offset and distributed aerodynamic couple chosen consistently, its magnitude is

$$|T_y(y)|=\\left|\\int_y^{b/2}\\left[e(\\eta)q_z(\\eta)+m_y(\\eta)\\right]\\,d\\eta\\right|.$$

Here $q_z$ is force per unit span (N/m), $e$ is the chordwise offset (m), and $m_y$ is pitching couple per unit span (N m/m). Torsion can remain nonzero when $e=0$ if the distributed pitching couple is nonzero. On the opposite cut face, all internal actions reverse direction. The diagrams show a static load balance, not a deformed shape.
'''
if not any(c.get('id') == 'wing-cut-resultants-v2' for c in nb['cells']):
    nb['cells'].insert(idx, dict(cell_type='markdown', id='wing-cut-resultants-v2', metadata={}, source=new.splitlines(keepends=True)))
p.write_text(json.dumps(nb, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
