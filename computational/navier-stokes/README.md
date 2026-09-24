# Computational companion: a prescribed collapsing vortex

This folder accompanies the [course report](../../NAVIER_STOKES_AI.md#computational-companion-executed-notebook-and-related-code). It contains Ivan C. Christov's educational notebook, a headless runner, and outputs generated on 23 September 2026.

**This is not a Navier–Stokes momentum solver or a proof of finite-time blowup.** The field is prescribed, its incompressibility is checked, and particle trajectories and scaling diagnostics are computed. Core energy is not whole-space energy. The notebook uses h = 0.05 for illustration.

## Attribution and changes

Original author: Ivan C. Christov, Purdue University. [Upstream notebook at the retrieved revision](https://github.com/ichristov/intermediate-fluid-mechanics/blob/0f93a34750531e42e8806e5a11c46ac56769e669/extras/NS_blowup_vortex.ipynb). The upstream GPL-3.0 license is reproduced in [LICENSE](LICENSE) and applies to this code adaptation.

Course adaptation, 23 September 2026: cleared previous notebook outputs, added attribution, resolved relative reading links, and updated the Colab link. Scientific code cells and parameters are unchanged. The runner skips unused widget imports and IPython magic, suppresses rich display, adjusts figure size, exports four figures and a 50-frame animation, and records numerical checks. It executes scientific cells in one Python namespace rather than through a Jupyter kernel.

## Run

Python 3.12 was used. From this folder:

```bash
python -m pip install -r requirements.txt
python run_notebook.py
```

For interactive notebook use, install Jupyter and ipywidgets as well, or [open in Colab](https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/main/computational/navier-stokes/NS_blowup_vortex.ipynb).

Outputs are in [results](results). [run_metrics.json](results/run_metrics.json) records versions, cell execution, divergence, trajectory status, slopes and endpoint values. [scaling_data.csv](results/scaling_data.csv) contains the plotted diagnostic data. Runtime depends on hardware. The animation does not reach the singular time, and the fixed physical grid under-resolves the core at late times; use the accompanying rescaled view to interpret it.
