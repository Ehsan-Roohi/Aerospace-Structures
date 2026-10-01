"""Clarify the wing-box caption without rebuilding the surrounding lesson."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
heading = "#### Where are the upper and lower stringers?"
new_heading = "#### This is a wing box: cross-section viewed along the span"
old = "This original schematic shows a cut **normal to the span**, between ribs."
new = """**Yes: this is an idealized cross-section of a two-spar wing box, not the entire wing or airfoil.** The **upper skin, lower skin, front spar web and rear spar web** form the closed structural perimeter. The spar caps and the skin-mounted stringers reinforce it; the gold T shapes alone do not make a wing box.

This original schematic shows a cut **normal to the span**, between ribs. **No rib is shown in this cut**: ribs frame the box at other spanwise stations. Leading- and trailing-edge structures lie outside this simplified box and are omitted. Real wing boxes usually follow curved/tapered wing geometry rather than this exact rectangle.

**Why a closed box?** The connected skins and webs provide a closed path for torsional shear flow; skins, caps and stringers also share bending-related axial loads. This is a conventional structural concept, not a drawing or validation of our printed two-rod demonstrator.

"""
path = ROOT / "notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb"
nb = json.loads(path.read_text(encoding="utf-8"))
for cell in nb["cells"]:
    s = "".join(cell["source"])
    if "Wing_Box_Section.png" in s and "**Yes: this is an idealized cross-section" not in s:
        s = s.replace(heading, new_heading).replace(old, new)
        cell["source"] = s.splitlines(keepends=True)
path.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

# Preserve the same wording if the original identification-view builder is reused.
builder = ROOT / "scripts/add_wing_identification_views.py"
s = builder.read_text(encoding="utf-8")
if "**Yes: this is an idealized cross-section" not in s:
    s = s.replace(heading, new_heading).replace(old, new)
    builder.write_text(s, encoding="utf-8")
