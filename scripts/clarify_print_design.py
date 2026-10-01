"""Add student-facing explanations without changing the released CAD kernel."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "notebooks/MIE446_Code_to_Print_Wing.ipynb"
nb = json.loads(path.read_text(encoding="utf-8"))

before_form = r"""

### Read the design before filling the form

**What is chosen, and what is calculated?** The 450 mm semi-span, 160/100 mm root/tip chords,
three modules, 1.2 mm skin and 1.6 mm ribs are the course baseline, not the result of a strength
optimizer. Use changes only as approved by the instructor. The code calculates geometry and
checks specified constraints; it does not select an airworthy structure.

| Quantity | Meaning and a hand check |
|---|---|
| NACA 2412 | 2% maximum camber at 40% chord; 12% maximum airfoil thickness. The 12% is **not** the printed skin thickness. |
| Semi-wing area | Length times average chord: $S_h=s(c_r+c_t)/2$. Baseline: $450(160+100)/2=58{,}500$ mm². |
| Equivalent full wing | $b=2s$, $S=2S_h$, $AR=b^2/S$. Baseline: $b=900$ mm, $S=117{,}000$ mm², $AR=6.923$. This is not a second printed wing. |
| Taper ratio | Tip chord / root chord: $100/160=0.625$. |
| Mean aerodynamic chord | A representative chord for a tapered wing; it is not simply the root chord or the average chord. Step 3 exposes its arithmetic. |
| Rod position | $x/c=0.30$ and $0.60$ are measured aft of the **local** leading edge. Root: 48/96 mm; tip: 30/60 mm. |

With span fixed, a smaller tip chord reduces area and increases aspect ratio. Explain that chain
in your own words in the prediction field; identifying a trend is not proof of structural strength.

### Why the baseline has seven ribs

A rib is a chordwise internal plate that preserves section shape and connects nearby features.
It is not a spanwise rod, a slicer layer, or an infill line.

1. The rule proposes **three interior ribs** at one-quarter, one-half and three-quarters of the
   450 mm semi-span: **112.5, 225 and 337.5 mm** from the root.
2. Three printable modules create seams at **150 and 300 mm**.
3. Each seam gets a rib **4 mm on either side**, inside its own module:
   **146/154 mm** and **296/304 mm**. These support the local section near the split; they do not
   join the modules by themselves or prove joint strength.

| Module | Span interval (mm) | Rib mid-planes from the wing root (mm) |
|---|---|---|
| 1 | 0–150 | 112.5, 146 |
| 2 | 150–300 | 154, 225, 296 |
| 3 | 300–450 | 304, 337.5 |

Thus the **baseline has 3 interior + 4 interface ribs = 7 ribs**, each 1.6 mm thick.
Root/tip skin end caps are separate features, not two additional ribs in this count.
For other approved settings the code removes interior candidates too close to seams and merges
near-duplicates: **do not assume every configuration has seven ribs**. Step 3 reports the actual
stations used by the CAD code. For example, two 225 mm modules put a seam on the central candidate;
that candidate is replaced by the nearby interface pair, giving four ribs, not five.

**Team check before running:** draw the two seams and all seven rib mid-planes on your R01 worksheet.
Explain which dimensions are instructor choices and which positions follow from the rule.

### Skin, material and manufacturing are different decisions

`SKIN_THICKNESS_MM` defines nominal CAD geometry. OrcaSlicer converts it into extrusion paths:
nozzle diameter, line width, wall count, top/bottom settings and print orientation affect the result.
Changing layer height does not directly set skin thickness. Inspect all layers using the approved
profile. More skin or ribs usually adds mass, but this notebook does not prove the resulting change
in stiffness or strength. Printed PLA and its layer interfaces are not the aluminum in a textbook
wing-box example.

The fit coupon qualifies the selected **rod/hole fit only**. It does not qualify shell strength,
layer bonding, or the assembled wing's load capacity. Keep the student wing unloaded and undamaged.
"""

audit_code = '''
        # Expose the same parameter object's decisions used by CAD; no copied rib count.
        p = analysis.parameters
        seams = p.module_bounds_mm()[1:-1]
        stations = p.rib_stations_mm()
        rows = []
        for number, station in enumerate(stations, 1):
            interface = any(abs(abs(station - seam) - p.interface_rib_offset_mm) < 1e-6 for seam in seams)
            role = "Interface rib near a module seam" if interface else "Interior rib"
            module = min(p.module_count, int(station / (p.semi_span_mm / p.module_count)) + 1)
            rows.append(f"| {number} | {station:.2f} | {module} | {role} |")
        display(Markdown(
            f"### Actual rib layout: {len(stations)} ribs\\n\\n"
            "These are the rib mid-planes returned by the CAD parameter rule; end caps are separate.\\n\\n"
            "| Rib | Distance from root (mm) | Module | Reason for this rib |\\n"
            "|---|---:|---:|---|\\n" + "\\n".join(rows)
        ))
        semi_area = p.semi_span_mm * (p.root_chord_mm + p.tip_chord_mm) / 2
        full_area = 2 * semi_area
        span = 2 * p.semi_span_mm
        taper = p.tip_chord_mm / p.root_chord_mm
        mac = (2 / 3) * p.root_chord_mm * (1 + taper + taper**2) / (1 + taper)
        display(Markdown(
            "### Trace the geometry calculation\\n\\n"
            f"- Semi-wing area = {p.semi_span_mm:g} × ({p.root_chord_mm:g} + {p.tip_chord_mm:g}) / 2 = **{semi_area:,.2f} mm²**.\\n"
            f"- Full equivalent area = 2 × {semi_area:,.2f} = **{full_area:,.2f} mm² = {full_area / 1e6:.4f} m²**.\\n"
            f"- Aspect ratio = {span:g}² / {full_area:g} = **{span**2/full_area:.4f}**, dimensionless.\\n"
            f"- Taper = {p.tip_chord_mm:g} / {p.root_chord_mm:g} = **{taper:.4f}**.\\n"
            f"- Trapezoid mean aerodynamic chord = (2/3) × {p.root_chord_mm:g} × (1 + {taper:.4f} + {taper:.4f}²) / (1 + {taper:.4f}) = **{mac:.2f} mm**.\\n\\n"
            "Compare one value with your hand calculation. In RESULT_INTERPRETATION explain the rib count, "
            "one dimension check, and one limitation. Geometry agreement is not structural validation."
        ))
'''

for cell in nb["cells"]:
    s = "".join(cell["source"])
    if s.startswith("## 2. Enter your wing design") and "### Read the design" not in s:
        s = s.replace("three interior ribs,", "three interior rib candidates plus paired ribs beside module seams,")
        s += before_form
    if "analysis = project.analyze()" in s and "### Actual rib layout" not in s:
        s = s.replace("        plot_design_overview(analysis.parameters).show()", audit_code + "        plot_design_overview(analysis.parameters).show()")
    if '"engineering_responses": {' in s and '"rib_stations_mm":' not in s:
        s = s.replace('                "engineering_responses": {',
                      '                "rib_stations_mm": list(built_project.analysis.parameters.rib_stations_mm()),\n'
                      '                "rib_count": len(built_project.analysis.parameters.rib_stations_mm()),\n'
                      '                "engineering_responses": {')
    cell["source"] = s.splitlines(keepends=True)
    if cell["cell_type"] == "code":
        cell["execution_count"] = None
        cell["outputs"] = []
path.write_text(json.dumps(nb, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
