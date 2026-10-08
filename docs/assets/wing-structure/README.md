# Independent wing-structure lecture: image provenance

These assets support `notebooks/MIE446_Wing_Structure_Buckling_Materials_and_Flutter.ipynb`. They do not replace any Lecture 01 assets.

The notebook supplies a reading guide beside every figure. [PHOTO_SOURCES.json](PHOTO_SOURCES.json) records credits, source URLs, rights statements and historical-image limitations.

Original diagrams are explanatory schematics, not original aircraft shop drawings, finite-element failure predictions or certification evidence. In particular:

- The red rib-removal curve is the calculated displacement of an isolated, ideal one-dimensional supported strip. It is **not** a two-dimensional skin-panel deflection model or a prediction for the printed wing.
- The seven-rib view illustrates the current course construction rule, not a structurally optimized rib count.
- The built-up/extruded spar comparison separates historical evidence from a simplified construction diagram. An extruded cap is not a claim that the entire spar was one extrusion.
- The flutter feedback sketch and oscillator plots explain energy exchange. They cannot supply a real-wing flutter speed.
- Film-related airfoil outlines are qualitative; their labels do not establish the sections used on historical aircraft.

Historical 7-Shi, Ka-14 and Horikoshi photographs retain the public-domain designations and source limitations recorded by Wikimedia Commons. The Zero museum photograph is credited to Eric Long/Smithsonian and its media record explicitly states CC0. NASA images retain their source credit; no NASA endorsement is implied. No complete museum report page or film frame is reproduced.

To regenerate the three scientific diagrams and provenance record, install NumPy and Matplotlib and run from the repository root:

```bash
python scripts/prepare_wing_structure_assets.py --offline
```

Previously prepared original PNG/SVG diagrams are checked in; rebuilding those designs is not required to use the notebook. To rebuild and execute the notebook with saved numerical output:

```bash
python scripts/build_wing_structure_lecture.py
python scripts/verify_wing_structure_lecture.py
```

The verifier requires NumPy, Matplotlib, IPython and nbformat. It executes only this independent lecture and confirms that Lectures 01 and 02 remain unchanged.
