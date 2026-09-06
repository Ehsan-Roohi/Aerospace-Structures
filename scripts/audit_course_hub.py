"""Validate public course notebooks and Markdown navigation."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK_DIR = ROOT / "notebooks"
MARKDOWN_FILES = sorted(ROOT.glob("*.md")) + [NOTEBOOK_DIR / "README.md"]
LOCAL_LINK = re.compile(r"\[[^]]+\]\((?![a-zA-Z][\w+.-]*:)([^)]+)\)")
HTML_IMAGE = re.compile(r'<img\b[^>]*\bsrc="(?!https?://)([^"]+)"')


def heading_ids(text: str) -> set[str]:
    """GitHub-style heading slugs for the course's plain Markdown headings."""
    result: set[str] = set()
    for heading in re.findall(r"^#{1,6}\s+(.+)$", text, flags=re.MULTILINE):
        slug = re.sub(r"[^\w\- ]", "", heading.strip().lower()).replace(" ", "-")
        candidate, suffix = slug, 1
        while candidate in result:
            candidate = f"{slug}-{suffix}"
            suffix += 1
        result.add(candidate)
    return result
COLAB_NOTEBOOK = re.compile(
    r"https://colab\.research\.google\.com/github/Ehsan-Roohi/"
    r"Aerospace-Structures/blob/main/(notebooks/[^)]+\.ipynb)"
)


def audit_notebooks() -> list[str]:
    reports: list[str] = []
    notebooks = sorted(NOTEBOOK_DIR.glob("*.ipynb"))
    if not notebooks:
        raise AssertionError("No course notebooks were found.")

    for path in notebooks:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("nbformat") != 4:
            raise AssertionError(f"{path.name} is not an nbformat 4 notebook.")

        code_cells = [cell for cell in data.get("cells", []) if cell.get("cell_type") == "code"]
        for index, cell in enumerate(code_cells, start=1):
            source = "".join(cell.get("source", []))
            compile(source, f"{path.name}:code-cell-{index}", "exec")

        reports.append(
            f"PASS {path.relative_to(ROOT)}: "
            f"{len(data.get('cells', []))} cells, {len(code_cells)} code cells"
        )
    return reports


def audit_markdown_links() -> list[str]:
    reports: list[str] = []
    for path in MARKDOWN_FILES:
        text = path.read_text(encoding="utf-8")
        missing: list[str] = []

        for target in LOCAL_LINK.findall(text) + HTML_IMAGE.findall(text):
            clean_target, _, fragment = target.partition("#")
            destination = (path.parent / clean_target).resolve() if clean_target else path
            if not destination.exists():
                missing.append(target)
            elif fragment and destination.suffix == ".md":
                if fragment not in heading_ids(destination.read_text(encoding="utf-8")):
                    missing.append(target)

        for target in COLAB_NOTEBOOK.findall(text):
            if not (ROOT / target).exists():
                missing.append(target)

        if missing:
            raise AssertionError(f"Broken links in {path.relative_to(ROOT)}: {missing}")
        reports.append(f"PASS {path.relative_to(ROOT)}: local files, images, heading anchors and Colab targets exist")
    return reports


def main() -> None:
    reports = audit_notebooks() + audit_markdown_links()
    print("Course hub audit")
    for report in reports:
        print(f"  {report}")


if __name__ == "__main__":
    main()
