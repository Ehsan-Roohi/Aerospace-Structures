# Dewoitine D.520 S — from the 1940 *Notice descriptive et d'utilisation* to a Blender model

[D.520 project home](../README.md) · [3-D viewer](https://ehsan-roohi.github.io/Aerospace-Structures/d520/) · [Wing stress analysis](../stress/README.md) · [Wing Lab: full-scale wing](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#d520)

Source: the scanned *Notice descriptive et d'utilisation de l'avion de chasse D.520 S, moteur 12 Y 45*
(168 pages, Archives départementales de la Haute-Garonne stamp on every sheet).

One rule throughout: **every dimension comes from a source, and anything that doesn't is labelled as a guess.**

## What is in this package

| Path | What it is |
|---|---|
| `../manual/D520_manual_EN.md` | Full English translation, all 168 pages (text pages, photographs, plates, fold-out cards) |
| `../manual/D520_manual_FR_transcription.md` | Full French transcription |
| `../manual/D520_manual_bilingual.md` | French and English page by page |
| `../manual/D520_manual_pages.json` | Machine-readable page records (text, labels, every number with its French quote) |
| `../manual/D520_all_numbers_extracted.csv` | Every number found in the manual, with page, quote and confidence |
| `data/d520_params.json` | The 93 parameters the model uses, each with value, unit, status (PRINTED / SCALED / DERIVED / EXTERNAL / GUESS), page references and resolved conflicts |
| `data/pl0_side_px.json`, `data/pl0_plan_px.json` | Outlines digitised from plate 0 (1/50 general views) |
| `scripts/make_params.py` | Writes the parameter table (edit a value here, rebuild) |
| `scripts/d520_geom.py` | Geometry laws (planform, thickness, dihedral, fuselage sections, tail, gear solve), pure numpy |
| `scripts/d520_build.py` | Parametric Blender build: lofts every surface, rigs every moving part |
| `scripts/d520_paint.py`, `scripts/d520_textures.py` | Texture bake: position bake → procedural paint → normal map → AO bake → PBR materials |
| `scripts/d520_validate.py` | Measures the built model against the manual and flags every gap |
| `scripts/d520_overlay.py` | Orthographic renders overlaid on plate 0 |
| `scripts/d520_photomatch.py` | Solves the camera of each photograph in the manual and renders the model from it |
| `scripts/d520_render.py`, `scripts/d520_export.py` | Cycles renders, glTF export |
| `blender/d520.blend` | The textured, rigged model (textures in `textures/`, relative paths) |
| `export/d520.glb` | glTF binary, 4096 px textures, node names kept (open in Blender, three.js, Windows 3D Viewer, <https://gltf-viewer.donmccurdy.com>) |
| `textures/` | Albedo, normal and ORM (occlusion, roughness, metallic) maps per part |
| `validation/report.md` | The latest measurement report |
| `renders/` | Renders, plate-0 overlays, photograph matches |

## Rebuild

Blender 4.2+ or the `bpy` module (tested with bpy 5.2.2, Python 3.13):

```
python3 scripts/make_params.py
python3 scripts/d520_build.py --out build/d520_base.blend          # or: blender -b -P scripts/d520_build.py -- --out ...
python3 scripts/d520_textures.py build/d520_base.blend build/d520.blend textures
python3 scripts/d520_validate.py build/d520.blend --out validation
python3 scripts/d520_overlay.py build/d520.blend <scan of PDF page 62> renders
bash scripts/run_final.sh      # validation, overlays, photo matches, glTF, renders (set D520_SCANS to the page scans)
```

## The rig

All controls are custom properties on the empty `D520_CONTROLS`; drivers apply the manual's limits.
Each moving part hangs from a static `<name>_Axis` empty whose local X is the hinge line, and a driven child `<name>`.

| Property | Range | Effect (source) |
|---|---|---|
| `aileron` | −1 … 1 | +1 = stick right: right aileron 30° up, left 15° down (p13) |
| `elevator` | −1 … 1 | ±20° (p14) |
| `rudder` | −1 … 1 | ±30° (p14) |
| `flaps` | 0 … 1 | 0–35° (p14); slotted, hinge under the rear spar |
| `tailplane_incidence` | −3 … 3 | degrees, adjustable in flight (p63) |
| `gear` | 0 … 1 | oleo extends 0.15 m, then 90° inward about a fore-aft axis (p21–22, Pl.30); ventral antenna follows (Pl.45) |
| `canopy` | 0 … 1 | hood slides 0.55 m aft (travel is a guess) |
| `radiator_flap` | 0 … 1 | 0–25° (travel is a guess) |
| `prop_pitch`, `prop_spin_deg` | | blade pitch +0–20° (guess; "pas limite" left blank on p15), spin |
| `attitude` | 0 … 1 | 0 = flight line, 1 = at rest on the tail wheel (14.6°, derived from the printed propeller heights) |

A 10-second control-check animation is keyed on the controls.

## How the geometry was sourced

* **Plate 0 is a true 1/50 drawing.** Scanned at 150 dpi, 1 m = 118.1 px. The printed span (1223 px) and length
  (1037 px) confirm the scale to 1–2 %. Its outlines give the fuselage profile and plan width, fin, canopy,
  radiator, tailplane shape and Karman fillet edge.
* **Wing planform.** Printed centreline chord 2.36 (Pl.0), root chord 2.15 (p13), tip chord 0.92 (p13), span 10.20 and
  area 15.97 m² (p63) fit one straight taper with a half-elliptic cap starting at 4.687 m, which is where the aileron
  ends. The leading-edge/trailing-edge split of the taper is scaled from Pl.0 and puts the main spar line at 1° sweep,
  the printed "flèche longitudinale".
* **Thickness and dihedral.** Plate 1's front elevation gives the thickness at each of the 22 ribs (19 % at the root,
  10 % at the tip-cap start), the upper surface flat to rib 16 then rising at the printed 3°55'30", and the lower
  surface at the printed slope 0.1246 from rib 21. The camber family (symmetric root, NACA 230 tip) is a guess
  supported by the printed zero-lift line "0°4".
* **Hinges.** Elevator and rudder hinges 5.88 and 6.08 m aft of the wing leading edge (p14), aileron centre 3.84 m, flap
  centre 1.77 m, spans 1.645 and 2.35 m (Pl.0, p14).
* **Landing gear.** Track 2.88 (p14); propeller axis 1.845 m in flight line and 2.265 m at rest (p13); wheels retract
  inward to y = 0.30 m (Pl.0 plan), lying flush with the lower skin (Pl.30); the oleo keeps 0.15 m of travel at static
  load (p13). The solve gives a 0.93 m leg (1.08 m extended) splayed 11.5°.
* **Guns** at 1.79 and 1.955 m (Pl.50 bis, distances read from the cannon axis, which is offset 41 mm by the engine's
  1° left setting). **Pitot** on the left wing tip (p27), **navigation lights** red left, green right, two white on
  the fin (p48), **gun camera** under the left wing (p31), **ventral antenna** hinged ahead of frame 7 (Pl.45).
* **Paint** (p59–61): kaki / terre foncée / gris bleu foncé upper camouflage, gris bleu lower metal, gris bleu clair
  lower fabric, roundels, blue-white-red rudder with black lettering, red Flettner tab, night-blue cockpit.
  The pattern shapes, RGB values and roundel sizes are guesses; the manual names the colours but leaves the
  camouflage drawing number blank.

## Conflicts between sources and how they were settled

| Quantity | Sources | Decision |
|---|---|---|
| Length | 8.78 (p13) vs 8.76 (p63, p67, Pl.60) | 8.76, three to one |
| Tailplane span | 3.54 (p13, p14, p67 half-span 1.77) vs 3.630 (Pl.0) | 3.54; Pl.0 outline used for shape only |
| Track | 2.88 (p14 table) vs 2.830 (Pl.0 label); Pl.0 scales 2.86–2.92 | 2.88, the official table |
| Aileron length | 1.55 (p13) vs 1.645 (Pl.0); Pl.0 scales 1.69, Pl.59 split ~1.7 | 1.645 |
| Prop axis height, flight line | 1.845 (p13), 1.84 (p63) vs 1.950 (Pl.0) | 1.845; Pl.0 draws the oleos extended |
| Root chord | 2.15 (p13) vs 2.360 (Pl.0) | both: 2.36 on the axis, 2.15 at the junction |

## What went wrong (it was not a one-shot either)

* **The landing gear and its fairings flew off below the aircraft** on the first preview: objects were parented before
  Blender had updated their world matrices. Fixed by forcing a depsgraph update in the parenting helper.
* **Rotating a hinge destroyed its orientation**: a driver on `rotation_euler[0]` overwrote the hinge's own Euler
  angle. Every hinge is now a static axis empty plus a driven child.
* **The first canopy was a union of two shapes per fuselage ring**, which left a staircase of glass faces along the
  sill. The canopy is now three separate lofts whose base sits exactly on the body, with frames as tubes and the rear
  windows as clean patches.
* **The rudder baked as solid blue.** The UV seam face wrapped from the end of the texture back to the start and
  covered the whole map. All lofts now use arc-length UVs with a proper seam.
* **The first textured render was magenta**: texture paths were relative to the working directory, not the .blend.
* **The validation first reported zero control travel**: changing a custom property does not re-evaluate drivers until
  the frame is set. The validator now forces it.
* **The fuselage had a crease ahead of the windscreen** where the hidden body-top line had a kink. It is now a smooth
  Hermite bridge, and the canopy top line was re-read point by point on the plate because the automatic trace picked
  up frame lines.
* **The plate-0 gear is longer than the printed heights allow.** That turned out to be real: the drawing shows the
  oleos fully extended. The oleo is now telescopic and extends before retraction.

## Open flags in the validation

* **Fin area**: the model's exposed fin is 0.79 m² against 0.59 printed. The fin outline matches Pl.0, the croquis
  coté (p67), the printed fin height 1.87 and the printed overall height 3.435 (measured 3.433), so the printed
  area most likely excludes the curved dorsal fillet (the area above Z = +0.67 m equals 0.59 m²).
* **Main-frame height**: 1.556 m with the sliding hood against 1.50 printed (Pl.0 measures 1.53).
