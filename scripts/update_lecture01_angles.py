"""Install the reviewed figure cell while preserving Colab cell IDs."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
path=root/'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
nb=json.loads(path.read_text(encoding='utf-8'))
cell=next(c for c in nb['cells'] if c['id']=='bed76621')
src=(root/'scripts/lecture01_flight_angles.py').read_text(encoding='utf-8').splitlines(True)[1:]
cell['source']=src
cell['outputs']=[]
cell['execution_count']=None
theory=nb['cells'][6]
s=''.join(theory['source']).replace('parallel and opposite to the relative wind','opposite to the aircraft velocity relative to the air (in the relative-wind direction)')
s=s.replace('The first figure is the special case of level flight. The aircraft nose and thrust point to the **left**; the relative wind and drag point to the **right**.', 'The two-panel figure below separates **flight-path angle $\\gamma$** (side view, path versus horizontal) from **bank angle $\\phi$** (front view, wings versus horizontal, equivalently lift versus vertical). Panel A shows a climb; panel B shows a coordinated level turn. These are two distinct cases, not one combined maneuver. Change the sliders to explore each angle.')
theory['source']=s.splitlines(True)
path.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
