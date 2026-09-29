"""Add a source-grounded reading of the user-provided FAST52 article."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
n=json.loads(p.read_text(encoding='utf-8'))
c=next(c for c in n['cells'] if c.get('id')=='70bddc52')
s=''.join(c['source'])
section='''#### Airbus case study: read a real wing by rib and stringer number

**Source:** Airbus FAST 52, August 2013, *Repairing wing fuel tank access panels on A330/A340*, printed pages 26–31. [Open the original article, diagram spread](https://www.aircraft.airbus.com/sites/g/files/jlcbta126/files/2022-04/FAST52.pdf#page=15). This is a historical A330/A340 example, **not an A380 tank map** or a current maintenance instruction.

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/FAST52_Rib_Map.png" width="1000" alt="Airbus A330/A340 rib numbering, inner and outer tank regions and loaded versus non-loaded access-panel sections"></p>

*Figure excerpt: © Airbus S.A.S., FAST 52 (2013), printed p. 28. Rendered from the supplied PDF; source artwork unchanged.*

**Read the map in this order:**

1. Find **Rib 1**, then **Rib 8**, **Rib 27** and **Rib 39**. The numbering locates structural stations from the inboard region outward. A rib number is an identifier, not a distance in metres; do not assume equal spacing or infer actual dimensions from this sketch.
2. Follow the transverse rib lines, then the dashed lines labelled **Stringer 14–17 Upper**. Ribs cross the wing; stringers follow it spanwise along the skin. These four labels identify selected upper stringers, not the total number of stringers in the wing.
3. Locate the oval access openings. The caption says these are **under-wing** panels, although the skeleton is viewed from above. Do not mistake these ovals for holes cut through the ribs. Access-panel identifiers and rib identifiers are different numbering systems.
4. Find the transition at **Rib 27**. In this illustrated arrangement, the inner tank region runs from ribs 1–27 and the outer region from ribs 27–39. This does not establish the complete fuel-system architecture of every A330/A340 variant.

#### Why some access panels contribute to wing stiffness

| Region in the article | Panel arrangement | Structural interpretation |
|---|---|---|
| Inner region, ribs 1–27 | Two parts clamp around the thicker wing skin; called non-loaded | The design does not rely on the cover to supply the required primary structural stiffness. |
| Outer region, ribs 27–39 | One-part cover attached directly to the thinner skin; called loaded | The cover and its attachment contribute to the stiffness of the structure. |

**Non-loaded does not mean zero force.** A cover still has to retain fuel and withstand its relevant pressure, contact and fastening loads. The distinction here concerns participation in structural stiffness. Likewise, “loaded” is not simply a synonym for “contains fuel.”

An opening interrupts a skin load path. Its surrounding structure, reinforcement and attachments must provide a route for the load. A structurally participating cover provides another route through its fasteners. **Strength, stiffness and leak-tightness are three different requirements:** satisfying one does not automatically satisfy the others.

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/FAST52_Real_Wing.png" width="1000" alt="Real wing in an Airbus production setting, with access openings visible on the lower surface"></p>

*Photo excerpt: © Airbus S.A.S., FAST 52 (2013), p. 29. Cropped from the supplied page.* **Look for the row of lower-surface openings.** Unlike a skeleton view, the installed skin hides most ribs and stringers. Read the photograph together with the map; do not identify hidden members from surface colour alone.

#### A panel is an assembly, not just a lid

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/FAST52_Access_Panel.png" width="1000" alt="Airbus exploded access-panel assembly and cross sections showing doors, skin, fasteners, gasket and seal"></p>

*Figure excerpt: © Airbus S.A.S., FAST 52 (2013), p. 29. Cropped from the supplied page.*

Use the original legend: **3 = fasteners; 4 = wing skin; 5 and 6 = inner and outer aluminium doors; 7 = knitted gasket; 8 = sealing ring.** The sealing ring provides fuel containment. The metallic-mesh gasket also provides electrical continuity between the outer door and wing, relevant to lightning/static discharge. These are distinct functions, not interchangeable names for one seal.

The article describes replacing an earlier hollow titanium panel design with machined aluminium doors, and later improving seal material for low-temperature behaviour. The lesson is **system design:** changing only the apparent strength of a lid will not solve a failure caused by its seal, interface or environment. The article also identifies locally reinforced panels in areas exposed to tyre-burst damage; local hazards can change structural requirements.

**Design-review exercise (3 minutes; no laboratory required):** An AI proposes a thin, watertight plastic lid for every opening. Before accepting it, ask: (a) must this panel contribute to structural stiffness? (b) how do loads cross its attachment? (c) how is sealing maintained at temperature? (d) is electrical continuity required? A leak check alone cannot validate the proposal. Our classroom model does not certify an aircraft repair; actual maintenance requires the applicable current approved documentation.

'''
if '#### Airbus case study: read a real wing' not in s:
    s=s.replace('#### Real photograph 1:',section+'#### Real photograph 1:',1)
c['source']=s.splitlines(keepends=True)
p.write_text(json.dumps(n,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
v=root/'docs/assets/lecture01/VISUAL_SOURCES.md'
t=v.read_text(encoding='utf-8')
if '## FAST 52 supplied-PDF excerpts' not in t:
    v.write_text(t+'\n## FAST 52 supplied-PDF excerpts\n\n`FAST52_Rib_Map.png`, `FAST52_Real_Wing.png`, and `FAST52_Access_Panel.png`: excerpts rendered/cropped from user-provided FAST52.pdf, printed pp. 28–29 (PDF page 15). © Airbus S.A.S. 2013, all rights reserved; not covered by the repository code license. No open reuse license is asserted. Source: [Airbus FAST 52](https://www.aircraft.airbus.com/sites/g/files/jlcbta126/files/2022-04/FAST52.pdf). Used for the accompanying source-specific educational discussion.\n',encoding='utf-8')
