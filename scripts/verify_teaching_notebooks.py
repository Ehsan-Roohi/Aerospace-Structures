"""Execute lesson code headlessly with real scientific/display dependencies.

Only new Lecture 2 figure outputs are saved; existing lesson content is preserved.
This verifies local execution, not authentication or browser behavior in Colab.
"""
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
scratch = ROOT / "tmp" / "teaching-validation"
scratch.mkdir(parents=True, exist_ok=True)
os.chdir(scratch)

for name in ["MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb",
             "MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb",
             "MIE446_Wing_Structural_Design_Numerical.ipynb"]:
    path = ROOT / "notebooks" / name
    nb = json.loads(path.read_text(encoding="utf-8"))
    scope = {"__name__": "__main__"}
    total = 0
    for cell in nb["cells"]:
        if cell["cell_type"] != "code":
            continue
        total += 1
        outputs = []
        ident = cell.get("id", str(total))
        def capture_show(*args, **kwargs):
            for number in plt.get_fignums():
                buffer = io.BytesIO()
                plt.figure(number).savefig(buffer, format="png", dpi=125, bbox_inches="tight")
                if ident.startswith("l2-clear-"):
                    outputs.append({"output_type": "display_data", "metadata": {}, "data": {
                        "image/png": base64.b64encode(buffer.getvalue()).decode("ascii"),
                        "text/plain": ["Verified lesson figure"]}})
            plt.close("all")
        plt.show = capture_show
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            exec(compile("".join(cell["source"]), f"{name}:{ident}", "exec"), scope)
        if stream.getvalue():
            outputs.append({"output_type": "stream", "name": "stdout",
                            "text": stream.getvalue().splitlines(keepends=True)})
        if ident.startswith("l2-clear-"):
            cell.update(execution_count=total, outputs=outputs)
        print("PASS", name, ident, flush=True)
    if "Lecture_02" in name:
        path.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("COMPLETE", name, total, "code cells", flush=True)
