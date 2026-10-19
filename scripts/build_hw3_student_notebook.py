"""Build a student workspace without reactions, worked answers or a hidden solver."""
from pathlib import Path
import base64,json,uuid
ROOT=Path(__file__).resolve().parents[1]
cells=[]
def md(s):cells.append(dict(cell_type='markdown',id=uuid.uuid5(uuid.NAMESPACE_URL,s).hex[:8],metadata={},source=s.strip()))
md('''# HW 3 Three beams under distributed loads

MIE 446 Aerospace Structures · Fall 2026 · 65 points · Due November 5, 2026 at the Canvas time.

This optional workspace organizes your analytical work and software comparison. Submit only the PDF specified in the handout; submitting this notebook is not required.

[Full handout](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/assignments/homework-03/README.md) · [Lecture 03](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb) · [Beam Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html)

Use L = 450 mm, E = 2200 MPa, b = 16 mm and h = 8 mm. Neglect self-weight and shear deformation. Positive reactions and v point down; positive external couples and θ are clockwise; internal M is sagging-positive. Do not confuse v with shear force V.
''')
for name,label in [('cross_section.png','Cross section and orientation'),('three_beams.png','The three assigned physical systems')]:
    img=base64.b64encode((ROOT/'assignments/homework-03'/name).read_bytes()).decode()
    md(f'### {label}\n\n<img alt="{label}" src="data:image/png;base64,{img}" width="900">')
md('''## Preparation

1. Calculate A and I and check their units.
2. Draw or state your sign convention before integrating.
3. Distinguish a load intensity in N/mm from its resultant force in N.
4. Set Requested elements = 30 for all assigned runs. Elements are numerical segments, not physical pieces. On a 450 mm beam, 10, 30 and 40 give nominal segment lengths 45, 15 and 11.25 mm; required stations may change the final count. More elements can improve interpolation and modal estimates, but do not repair wrong supports, loads or material data. This assignment requires no mesh study.
5. Use the full handout for the exact required quantities. This notebook adds no tasks.
''')
for n,title,kind,q0,q1 in [(1,'Cantilever','fixed / free','0','0.002'),(2,'Roller and pin','roller / pin','0.001','0.002'),(3,'Fixed–fixed','fixed / fixed','0.002','0')]:
    key=['cantilever','roller-pin','fixed'][n-1]
    md(f'''## Case {n} {title}

Supports left / right: **{kind}**. Downward intensity: **{q0} → {q1} N/mm**, over 0–450 mm.

### Analytical work

1. Write q(x), its integral and its first moment. Calculate the resultant and its location.
2. Write equilibrium and identify the reaction unknowns.
3. Write M(x), integrate EI v″ = −M(x), and apply the correct boundary conditions. For Case 3, show how the two right-clamp compatibility conditions determine the missing reactions.
4. Record the requested deformation quantities from Part A4 of the handout.

**Your derivation and numerical results:**

_Enter your own work here._

### Software check

Configure the model yourself in [Beam Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html). Clear unwanted loads, supports and hinges. Set the stated geometry and material and keep self-weight off. Check the live profile before applying it and solve before reading outputs.

Enter the supports, geometry, material and line load yourself; there is no preconfigured HW 3 study. Keep Requested elements at 30. After solving, use the station table rather than estimating a number from a plotted curve.

| Location and quantity | Analytical result | Software result | Unit | Brief discrepancy explanation |
|---|---|---|---|---|
| Each support reaction force | | | N | |
| Each support external couple | | | N mm | |
| Required displacement(s) | | | mm | |
| Required rotation(s) | | | rad | |
''')
md('''## Before submitting

1. Include all three analytical solutions, A and I, and one combined comparison table.
2. Use the same signs and units for hand and software values.
3. Submit one PDF through Canvas. No additional notebook, plot, screenshot, stress analysis or mesh study is required.
''')
nb=dict(nbformat=4,nbformat_minor=5,cells=cells,metadata={'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python'},'colab':{'name':'MIE446_HW3_Three_Beams.ipynb','provenance':[]}})
(ROOT/'notebooks/MIE446_HW3_Three_Beams.ipynb').write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
print('Built student notebook: no code solver, numerical reactions or worked solutions.')
