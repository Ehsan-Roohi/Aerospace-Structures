"""Assemble the Wing Lab page: inline the verified engines into the HTML template.

The shared load profiles (load_profiles.js: curved and table loads, CSV reader), the shared wing load editor
(wing_loads_ui.js), the wing study files / design-parameter import / links (wing_study_io.js), the printed-wing engine (engine.js), the Beam Lab modules (beam_sections.js, beam_learning_engine.js,
beam_study.js, beam_diagrams.js, beam_solution.js, companion_tools.js, foundations_ui.js and beam_lab.css)
and the full-scale metal-wing engine (metal_wing_engine.js, with the D.520 shell-model reference numbers and
its workspace metal_wing_ui.js) are inlined in the page. Direct STL export
lazily loads the companion wing-print/ Worker and pinned WASM assets; deploy
that directory beside the HTML page.

    python computational/printed-wing-solver/web/build_wing_lab.py

Writes dist/wing-lab.html (page body for publishing as an artifact) and
docs/wing-lab.html in the repository (a complete standalone HTML document).
"""

import json
import shutil
import hashlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
template = (HERE / "wing_lab_template.html").read_text(encoding="utf-8")
engine = (HERE / "engine.js").read_text(encoding="utf-8")
assert "/*__ENGINE__*/" in template
page = template.replace("/*__ENGINE__*/", engine)
assert "/*__WING_CHART_MATH__*/" in page
page = page.replace("/*__WING_CHART_MATH__*/", (HERE / "wing_chart_math.js").read_text(encoding="utf-8"))
assert "/*__WING_GEOMETRY_HELP__*/" in page
page = page.replace("/*__WING_GEOMETRY_HELP__*/", (HERE / "wing_geometry_help.js").read_text(encoding="utf-8"))
page = page.replace("/*__WING_SELECTION_UI__*/", (HERE / "wing_selection_ui.js").read_text(encoding="utf-8"))
# Beam Lab modules share one inline script (sections -> engine -> study/diagrams/solution -> companion
# tools); its controller (foundations_ui.js) and stylesheet (beam_lab.css) have their own tokens.
for token, filename in [("/*__LOAD_PROFILES__*/", "load_profiles.js"), ("/*__WING_SPARS__*/", "wing_spars.js"), ("/*__WING_AIRFOILS__*/","wing_airfoils.js"),("/*__WING_GEOMETRY__*/","wing_geometry.js"),("/*__WING_FRAME3D__*/","wing_frame3d.js"),("/*__WING_CLOSED_TIP_STRESS__*/","wing_closed_tip_stress.js"),("/*__WING_GEOMETRY_UI__*/","wing_geometry_ui.js"),("/*__BEAM_STYLES__*/", "beam_lab.css"), ("/*__BEAM_SECTIONS__*/", "beam_sections.js"), ("/*__BEAM_ENGINE__*/", "beam_learning_engine.js"),
                        ("/*__BEAM_STRENGTH__*/", "beam_strength.js"), ("/*__BEAM_STRENGTH_UI__*/", "beam_strength_ui.js"), ("/*__BEAM_STUDY__*/", "beam_study.js"), ("/*__BEAM_DIAGRAMS__*/", "beam_diagrams.js"), ("/*__BEAM_SOLUTION__*/", "beam_solution.js"),
                        ("/*__COMPANION_TOOLS__*/", "companion_tools.js"), ("/*__FOUNDATIONS__*/", "foundations_ui.js"), ("/*__TEACHING_MODELS__*/", "teaching_models.js"), ("/*__WING_LOADS_UI__*/", "wing_loads_ui.js"), ("/*__WING_WORKSPACE_UI__*/", "wing_workspace_ui.js"), ("/*__WING_STUDY_IO__*/", "wing_study_io.js"), ("/*__WING_PRINT_UI__*/", "wing_print_ui.js"), ("/*__TEACHING_PANELS__*/", "teaching_panels.js"),
                        ("/*__METAL_ENGINE__*/", "metal_wing_engine.js"), ("/*__METAL_REFERENCE__*/", "metal_wing_reference.json"), ("/*__METAL_UI__*/", "metal_wing_ui.js")]:
    assert token in page
    text = (HERE / filename).read_text(encoding="utf-8")
    if filename.endswith(".json"):
        json.loads(text)                     # inlined verbatim, but it must be valid JSON
        text = text.strip()
    page = page.replace(token, text)
dist = HERE / "dist"
dist.mkdir(exist_ok=True)
(dist / "wing-lab.html").write_text(page, encoding="utf-8", newline="\n")
title_end = page.index("</title>") + len("</title>")
standalone = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
    "<meta name=\"color-scheme\" content=\"light\">\n"
    + page[:title_end] + "\n" + page[title_end:page.index("</style>") + len("</style>")]
    + "\n</head>\n<body>\n" + page[page.index("</style>") + len("</style>"):] + "\n</body>\n</html>\n"
)
(REPO / "docs" / "wing-lab.html").write_text(standalone, encoding="utf-8", newline="\n")
print(f"dist/wing-lab.html {len(page)/1024:.0f} KB; docs/wing-lab.html written")
# The CAD kernel is loaded only on an explicit STL request, in a Web Worker.
print_files = ["load_profiles.js", "wing_spars.js", "wing_airfoils.js", "wing_geometry.js", "wing_frame3d.js", "wing_closed_tip_stress.js", "engine.js", "wing_print_mesh.js", "wing_cad_export.js"]
print_bundle = "\n;\n".join((HERE / name).read_text(encoding="utf-8") for name in print_files)
print_hash = hashlib.sha256(print_bundle.encode()).hexdigest()[:12]
for target in [dist / "wing-print", REPO / "docs" / "wing-print"]:
    target.mkdir(parents=True, exist_ok=True)
    (target / "engine_bundle.js").write_text(print_bundle, encoding="utf-8", newline="\n")
    worker = (HERE / "wing_print_worker.js").read_text(encoding="utf-8").replace("'./engine_bundle.js'", f"'./engine_bundle.js?v={print_hash}'")
    (target / "wing_print_worker.js").write_text(worker, encoding="utf-8", newline="\n")
    (target / "vendor").mkdir(exist_ok=True)
    for name in ["manifold.js", "manifold.wasm", "LICENSE", "PROVENANCE.json"]:
        shutil.copyfile(HERE / "vendor" / "manifold-3.5.4" / name, target / "vendor" / name)
# Keep the linked planar-truss workspace reproducible with the same course-site build.
import runpy
runpy.run_path(str(HERE / 'build_truss_lab.py'), run_name='__main__')
