"""Package only public HW2 student files; no instructor checks or answers."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "assignments/homework-02"
FILES = [
    "README.md",
    "MIE446_HW2_Control_Forces_Moments.pdf",
    "MIE446_HW2_Control_Forces_Moments.html",
    "MIE446_HW2_Excel_Starter.xlsx",
    "MIE446_HW2_Starter.m",
    "assets/HW2_Body_Axes.png",
    "assets/HW2_Wing_Model.png",
    "assets/HW2_Wing_Model.svg",
    "assets/HW2_Control_Lever.png",
    "assets/HW2_Control_Lever.svg",
]


def main():
    missing = [name for name in FILES if not (FOLDER / name).is_file()]
    if missing:
        raise SystemExit("Missing student deliverables: " + ", ".join(missing))
    archive = FOLDER / "MIE446_HW2_Student_Pack.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as package:
        for name in FILES:
            package.write(FOLDER / name, "MIE446_HW2_Student_Pack/" + name)
    with ZipFile(archive) as package:
        assert package.testzip() is None
        assert len(package.namelist()) == len(FILES)
        assert all(not name.endswith((".json", ".ndjson")) for name in package.namelist())
    print(json.dumps({"archive": str(archive.relative_to(ROOT)),
                      "files": len(FILES), "bytes": archive.stat().st_size}))


if __name__ == "__main__":
    main()
