"""Assemble the Wing Lab page: inline the verified engines into the HTML template.

The printed-wing engine (engine.js), the Beam Lab modules (beam_sections.js, beam_learning_engine.js,
beam_study.js, beam_diagrams.js, beam_solution.js, companion_tools.js, foundations_ui.js and beam_lab.css)
and the full-scale metal-wing engine (metal_wing_engine.js, with the D.520 shell-model reference numbers and
its workspace metal_wing_ui.js) are inlined so the page is one file.

    python computational/printed-wing-solver/web/build_wing_lab.py

Writes dist/wing-lab.html (page body for publishing as an artifact) and
docs/wing-lab.html in the repository (a complete standalone HTML document).
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
template = (HERE / "wing_lab_template.html").read_text(encoding="utf-8")
engine = (HERE / "engine.js").read_text(encoding="utf-8")
assert "/*__ENGINE__*/" in template
page = template.replace("/*__ENGINE__*/", engine)
# Beam Lab modules share one inline script (sections -> engine -> study/diagrams/solution -> companion
# tools); its controller (foundations_ui.js) and stylesheet (beam_lab.css) have their own tokens.
for token, filename in [("/*__BEAM_STYLES__*/", "beam_lab.css"), ("/*__BEAM_SECTIONS__*/", "beam_sections.js"), ("/*__BEAM_ENGINE__*/", "beam_learning_engine.js"),
                        ("/*__BEAM_STUDY__*/", "beam_study.js"), ("/*__BEAM_DIAGRAMS__*/", "beam_diagrams.js"), ("/*__BEAM_SOLUTION__*/", "beam_solution.js"),
                        ("/*__COMPANION_TOOLS__*/", "companion_tools.js"), ("/*__FOUNDATIONS__*/", "foundations_ui.js"), ("/*__TEACHING_MODELS__*/", "teaching_models.js"), ("/*__TEACHING_PANELS__*/", "teaching_panels.js"),
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
    + page[:title_end] + "\n" + page[title_end:page.index("</style>") + len("</style>")]
    + "\n</head>\n<body>\n" + page[page.index("</style>") + len("</style>"):] + "\n</body>\n</html>\n"
)
(REPO / "docs" / "wing-lab.html").write_text(standalone, encoding="utf-8", newline="\n")
print(f"dist/wing-lab.html {len(page)/1024:.0f} KB; docs/wing-lab.html written")
