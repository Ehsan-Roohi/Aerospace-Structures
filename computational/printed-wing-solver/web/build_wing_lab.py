"""Assemble the Wing Lab page: inline the verified engine into the HTML template.

    python computational/printed-wing-solver/web/build_wing_lab.py

Writes dist/wing-lab.html (page body for publishing as an artifact) and
docs/wing-lab.html in the repository (a complete standalone HTML document).
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
template = (HERE / "wing_lab_template.html").read_text(encoding="utf-8")
engine = (HERE / "engine.js").read_text(encoding="utf-8")
assert "/*__ENGINE__*/" in template
page = template.replace("/*__ENGINE__*/", engine)
dist = HERE / "dist"
dist.mkdir(exist_ok=True)
(dist / "wing-lab.html").write_text(page, encoding="utf-8")
title_end = page.index("</title>") + len("</title>")
standalone = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
    + page[:title_end] + "\n" + page[title_end:page.index("</style>") + len("</style>")]
    + "\n</head>\n<body>\n" + page[page.index("</style>") + len("</style>"):] + "\n</body>\n</html>\n"
)
(REPO / "docs" / "wing-lab.html").write_text(standalone, encoding="utf-8")
print(f"dist/wing-lab.html {len(page)/1024:.0f} KB; docs/wing-lab.html written")
