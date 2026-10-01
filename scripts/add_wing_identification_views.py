"""Add complementary, attributed views to the existing FAA wing illustration."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
p = root/'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
n = json.loads(p.read_text(encoding='utf-8'))
cell = next(c for c in n['cells'] if c.get('id') == '70bddc52')
s = ''.join(cell['source'])
at = s.index('</p>') + 4
addition = '''

**Read the FAA colors carefully.** The green surface identifies part of a **spar web**, a deep spanwise member, rather than a thin round rod. Spar caps run along the upper and lower edges of the web. The highlighted red airfoil-shaped frames are **ribs**; the similar uncolored frames are also ribs. The highlighted yellow slender spanwise members are **stringers**; comparable slender members continuing in the same direction are shown without yellow highlighting elsewhere. Do not classify every beige/brown line as a stringer: spar caps, rib flanges and other edges are also drawn in neutral colors. Trace the member's direction and attachment, not just its color.

The figure is a cutaway, not a fabrication drawing: the end of a colored patch does not establish a physical termination. Actual joints and member terminations must transfer their loads into the remaining structure. This drawing does not specify all such details.

#### A second reference view: identify the large members first

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/NASA_Wing_Structures.png" alt="NASA reference drawing of major wing structural components" width="1100"></p>

Use the original labels in this NASA drawing to distinguish the major spanwise members from the chordwise frames. The layout is an example, not a prescription for every aircraft. [NASA artwork and public-domain attribution record](https://commons.wikimedia.org/wiki/File:Wing_structures.svg).

#### This is a wing box: cross-section viewed along the span

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/Wing_Box_Section.png" alt="Cross-section of a wing box with stringers attached to both upper and lower skin; spar webs and caps shown separately" width="1200"></p>

**Yes: this is an idealized cross-section of a two-spar wing box, not the entire wing or airfoil.** The **upper skin, lower skin, front spar web and rear spar web** form the closed structural perimeter. The spar caps and the skin-mounted stringers reinforce it; the gold T shapes alone do not make a wing box.

This original schematic shows a cut **normal to the span**, between ribs. **No rib is shown in this cut**: ribs frame the box at other spanwise stations. Leading- and trailing-edge structures lie outside this simplified box and are omitted. Real wing boxes usually follow curved/tapered wing geometry rather than this exact rectangle.

**Why a closed box?** The connected skins and webs provide a closed path for torsional shear flow; skins, caps and stringers also share bending-related axial loads. This is a conventional structural concept, not a drawing or validation of our printed two-rod demonstrator.

 Each small gold T is the end view of a long stringer. Stringers run generally spanwise, approximately alongside the spars, while staying attached to the inner upper or lower skin; they are not free rods suspended in the cavity. Exact alignment and cross-section depend on the design. A spar has a much deeper web and associated caps; a stringer reinforces a local strip of skin. The closed wing box is formed by upper/lower skin and front/rear spar webs. Rib stations support and preserve its section shape.

#### Photograph of a physical model: spars versus ribs

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/NASA_Wright_Wing.gif" alt="NASA photograph of a Wright wing model with fabric removed, revealing spars and ribs" width="850"></p>

NASA's photograph of a Wright-wing **model** helps separate the long spars from repeated ribs. This fabric-covered historical arrangement is not a modern stiffened-metal wing and should not be used to infer modern skin-stringer construction. [NASA Glenn: Wing Geometry](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/wing-geometry/).

**Check your understanding:** in the cross-section, point to a spar web, a spar cap, an upper stringer and a lower stringer. Then explain which members extend out of the page and where the next rib would be.
'''
s = s[:at]+addition+s[at:]
s = s.replace('runs perpendicular to the ribs.', 'runs generally spanwise across successive rib stations; the exact intersection angle depends on the layout.')
cell['source'] = s.splitlines(keepends=True)
p.write_text(json.dumps(n,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
