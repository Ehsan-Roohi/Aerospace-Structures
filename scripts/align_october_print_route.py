"""Align the learning route with three remaining meetings and October 13 build."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
route = """### Three meetings to the October 13 fabrication session

| Date | Essential in-class work | Team evidence |
|---|---|---|
| Thu. October 1 (75 min) | Finish Lecture 1 wing parts/load paths; explain the seven-rib baseline; complete R01; start Coupon Only | Labeled R01 layout, saved team notebook, coupon ZIP or specific execution blocker |
| Tue. October 6 (75 min) | Lecture 2 geometry and simple strip-force/root-moment checks; compare with code; review the physical coupon record | Checked geometry and virtual-load calculation; actual rod-fit evidence; prepare R02 if qualified |
| Thu. October 8 (75 min) | Final Wing R02, geometry/mass checks, OrcaSlicer every-layer preview and staff review | Approved print package or explicit correction/hold list |
| Tue. October 13 | Supervised fabrication in the assigned printer slot | Print only the released, machine-specific files; inspect first layers with staff |

**Before October 8:** arrange an authorized, supervised appointment to print and physically test the
rod-fit coupon. This cannot be replaced by a numerical result or a guessed checkbox. If the first
printer access is October 13, that visit must start with the coupon; final wing printing follows
only after actual fit evidence and release. Training and staff authorization are required.

**Keep the pre-print scope small:** geometry, seven-rib reasoning, force/lever-arm checks,
coupon fit and manufacturing review. Detailed stress derivations, FEM, buckling calculations,
automated optimization and uncertainty studies remain later/optional material, not new
prerequisites for this three-meeting sequence. All student-wing loads here are virtual.
"""

for name in ["MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb",
             "MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb",
             "MIE446_Wing_Structural_Design_Numerical.ipynb",
             "MIE446_Code_to_Print_Wing.ipynb"]:
    path = ROOT / "notebooks" / name
    nb = json.loads(path.read_text(encoding="utf-8"))
    nb["cells"] = [c for c in nb["cells"] if c.get("id") != "oct13-class-route"]
    nb["cells"].insert(1, dict(cell_type="markdown", id="oct13-class-route", metadata={},
                             source=route.splitlines(keepends=True)))
    path.write_text(json.dumps(nb, ensure_ascii=False, indent=1 if "Code_to_Print" not in name else 2) + "\n", encoding="utf-8")

# Keep the CAD engine pinned, but link students to the updated teaching notebook.
for name in ["README.md", "PROJECT.md", "COURSE.md", "notebooks/README.md"]:
    path = ROOT / name
    s = path.read_text(encoding="utf-8")
    s = s.replace("blob/v1.1.1/notebooks/MIE446_Code_to_Print_Wing.ipynb",
                  "blob/main/notebooks/MIE446_Code_to_Print_Wing.ipynb")
    s = s.replace("Open stable Wing Project v1.1.1 in Colab", "Open updated Wing Project in Colab")
    s = s.replace("stable course notebook (v1.1.1)", "updated teaching notebook (CAD engine pinned to v1.1.1)")
    path.write_text(s, encoding="utf-8")
