# Lecture 01: controls, trim and static margin figures

## Real wing and tank photographs

- `Piper_PA18_Uncovered_Wing.jpg`: Christoph von Blücher, 19 August 2007,
  [original file record](https://commons.wikimedia.org/wiki/File:WingPiperPA18partialuncovered.JPG),
  used under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
  Unmodified; original marks 1 = spars, 2 = ribs. This image retains its own license.
- `USAF_Fuel_Tank_Interior_Display.jpg`: U.S. Air Force / Airman 1st Class Tom Brading,
  photo 130307-F-NK398-670, 7 March 2013. C-17 extraction training exercise.
  [Source](https://commons.wikimedia.org/wiki/File:Inside_a_fuel_tank_(13151954573).jpg).
  Public domain in the United States; resized and JPEG-compressed for notebook display.
- `Wet_Wing_Boundaries.svg` / `.png`: original course teaching diagram, illustrative
  two-spar plan and wet/dry boundary comparison, not an aircraft-specific tank plan.

## Wing-identification companion views (September 2026)

- `NASA_Wing_Structures.svg` and `.png`: NASA educational wing-components artwork,
  retrieved from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wing_structures.svg),
  whose source is NASA's *Wing Design* educational publication. Public domain
  (NASA attribution on the file record). PNG rasterized on white; labels retained.
- `NASA_Wright_Wing.gif` and `.png`: NASA Glenn photograph of a Wright wing model,
  from [Wing Geometry](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/wing-geometry/).
  This is a model of historical fabric-covered construction, not a photograph of
  a modern metal wing. Source: https://www1.grc.nasa.gov/wp-content/uploads/wing.gif.
- `Wing_Box_Section.svg` and `.png`: original course schematic of a section
  between rib stations; simplified rectangular box, not an actual aircraft section.
  Shows spar webs/caps and upper/lower skin-attached stringer cross-sections.

## FAA control-surface illustrations

The following figures were extracted from the Federal Aviation Administration's
[*Pilot's Handbook of Aeronautical Knowledge*, Chapter 6: Flight Controls](https://www.faa.gov/sites/faa.gov/files/08_phak_ch6.pdf).
They retain the original artwork and internal labels; surrounding page text was
cropped away to make the figures readable in Colab. Credit: FAA.

| Repository file | Source figure | Printed page |
|---|---|---|
| `FAA_6_4_Control_Axes.png` | 6-4, controls and axes of rotation | 6-3 |
| `FAA_6_6_Aileron_Deflection.png` | 6-6, differential ailerons | 6-4 |
| `FAA_6_10_Elevator_Pitch.png` | 6-10, elevator effect | 6-5 |
| `FAA_6_15_Rudder_Yaw.png` | 6-15, left rudder effect | 6-8 |

These are published instructional drawings, rather than photographs of a particular
aircraft. Their general arrangement depicts a conventional light airplane.

## Original MIE 446 teaching figures

- `MIE446_L01_Spoileron_vs_Wingtip_Rudder.png`: original teaching schematic
  comparing a modern raised upper-wing panel with Lilienthal's vertical
  wing-tip vane and their distinct structural interfaces. It is not a
  reconstruction to scale; the historical description follows
  [Raffel et al., *Journal of Aircraft* (2022)](https://doi.org/10.2514/1.C037047).
- `MIE446_L01_Airframe_Map.png`: original schematic top view locating flap,
  aileron, spoiler, slat, horizontal tail, elevator, fin and rudder. Typical
  locations only; it is not the geometry of a particular airplane.
- `MIE446_L01_Wing_Structure.png`: original transparent-skin semi-wing diagram
  locating root, tip, spars, ribs, stringers, wing box and example control
  attachment regions. It is not the students' printed-wing CAD.
- `MIE446_L01_Wing_Devices.png`: original schematic comparison of aileron,
  flap, spoiler and slat. Deflections and load arrows are qualitative.
- `Trim_Worked_Example_v2.svg` / `.png`: side-view force diagram matching the
  notebook's example, with CG ahead of the wing force, tail downforce, dimensions
  and numerical equilibrium checks. The aircraft outline and force lengths are
  schematic. The force-station spacings match the ratio 0.30 m : 4.00 m.
- `Static_Margin_Ruler_v2.svg` / `.png`: common MAC scales with a fixed illustrative
  neutral point and three CG locations. The 40% neutral-point location is teaching
  data, not a claimed property of an actual airplane.

Reproduce the earlier FAA crops and SVGs with
`scripts/build_lecture01_visual_revision.py`; it requires `pypdfium2` and a local
copy of the FAA chapter at `tmp/lecture01-figures/faa-ch6.pdf`. Render SVGs to PNG
with an SVG renderer such as Sharp. The notebook displays PNG versions for consistent
rendering across notebook viewers. The three `MIE446_L01_*.png` diagrams are
original raster teaching figures added separately for the wing anatomy studio.

For background on static margin, see [NACA TN 1670](https://ntrs.nasa.gov/api/citations/19930082297/downloads/19930082297.pdf).
For the distinction between natural stability and active stabilization, see
[NASA, stability augmentation with relaxed static stability](https://ntrs.nasa.gov/citations/19760011057).

## Four aircraft photographs in the spoileron studio

The notebook uses these Wikimedia Commons photographs at reduced display size.
The repository files are unannotated Wikimedia thumbnails; no force arrows or
control labels have been added to the images. Please preserve these credits
and licenses when reusing them.

| Repository file | Aircraft and source | Creator | License |
|---|---|---|---|
| `MIE446_L01_Example_Lilienthal_1895.jpg` | [Lilienthal Experimental Monoplane, 1895](https://commons.wikimedia.org/wiki/File:Otto-Lilienthal-Museum_id_F0158b_(cropped).jpg) | P. W. Preobrashenski / Otto-Lilienthal-Museum | [Public Domain Mark](https://creativecommons.org/publicdomain/mark/1.0/) |
| `MIE446_L01_Example_B737_Descent.jpg` | [Qantas Boeing 737-800 in descent](https://commons.wikimedia.org/wiki/File:Qantas_Boeing_737-800_spoiler_deployed_for_descent.jpg) | Jg4817 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `MIE446_L01_Example_A319_Landing.jpg` | [EasyJet Airbus A319 during landing](https://commons.wikimedia.org/wiki/File:EasyJet_A319_wing_spoilers.jpg) | John Haslam | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `MIE446_L01_Example_Capstan_Airbrake.jpg` | [Slingsby T.49 Capstan airbrakes](https://commons.wikimedia.org/wiki/File:Airbrakes_on_Capstan.jpg) | TSRL | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

## Expanded comparative wing photo gallery

- `Mu22_Glider_Wing.jpg` — Members of Akaflieg München e.V.; [source](https://commons.wikimedia.org/wiki/File:Akaflieg_Mue22a_Flaeche.jpg); [CC BY-SA/3.0](https://creativecommons.org/licenses/by-sa/3.0/); Unmodified source image.
- `K7_Glider_Wing.jpg` — Allan Gillis; [source](https://commons.wikimedia.org/wiki/File:Schleicher_K7_C-GALN_wing_recovering.jpg); Public domain (released by photographer); Unmodified source image.
- `REP_Uncovered_Wing.jpg` — Mikaël Restoux / Deep silence; [source](https://commons.wikimedia.org/wiki/File:WingStructure.JPG); [CC BY/2.5](https://creativecommons.org/licenses/by/2.5/); Unmodified source image.
- `Comet_Internal_Wing_Display.jpg` — Clemens Vasters; [source](https://commons.wikimedia.org/wiki/File:DeHavilland_Comet_4C_-_Stripped_Wing_(6661501103)_(3).jpg); [CC BY/2.0](https://creativecommons.org/licenses/by/2.0/); Resized only.
- `DLR_Wing_Demonstrator.jpg` — DLR German Aerospace Center; [source](https://commons.wikimedia.org/wiki/File:Innenansicht_eines_Leichtbau-Fl%C3%BCgeldemonstrators_(7486564206).jpg); [CC BY/2.0](https://creativecommons.org/licenses/by/2.0/); Unmodified source image.
- `Tu154_Rear_Spar.jpg` — Vivan755; [source](https://commons.wikimedia.org/wiki/File:Tu-154B-wing-rear-longeron.jpg); [CC BY-SA/4.0](https://creativecommons.org/licenses/by-sa/4.0/); Unmodified source image.
- `A380_Wing_Test.jpg` — IABG Dresden; [source](https://commons.wikimedia.org/wiki/File:IABG_Test_Setup_A380_Dresden_bent_wing.jpg); Reuse permitted with attribution; see source permission statement; Unmodified source image.

## Original printed-wing CAD teaching views

`Project_Wing_Modules.png`, `Project_Wing_Cutaway.png`, `Project_Wing_Sections.png`, and `Project_Wing_Bays_and_Cells.png` are original course figures generated by `scripts/add_printed_wing_views.py` from the repository's baseline `WingParameters` and `build_wing` geometry. Section views use solid/plane intersections. Separate nominal rods are drawn only as assembly overlays; the exploded offsets and hidden shell are display operations, not manufacturing edits. Three-dimensional views enlarge the vertical display aspect; the two-dimensional CAD sections have equal x/z scale. The single-/two-cell boxes in the last figure are conceptual comparisons, explicitly not the printed baseline. No external photograph or third-party figure is used in these assets.

## FAST 52 supplied-PDF excerpts

`FAST52_Rib_Map.png`, `FAST52_Real_Wing.png`, and `FAST52_Access_Panel.png`: excerpts rendered/cropped from user-provided FAST52.pdf, printed pp. 28–29 (PDF page 15). © Airbus S.A.S. 2013, all rights reserved; not covered by the repository code license. No open reuse license is asserted. Source: [Airbus FAST 52](https://www.aircraft.airbus.com/sites/g/files/jlcbta126/files/2022-04/FAST52.pdf). Used for the accompanying source-specific educational discussion.

## Lilienthal and modern UAV control atlas — October 1, 2026

All new diagram text is black Times New Roman. Photographs retain their natural
appearance. The schematic geometry is qualitative; it is not aircraft CAD.

| Asset | Source and credit | Reuse / changes |
|---|---|---|
| `Controls_Lilienthal_Full_1895.jpg` | P. W. Preobrashenski, 1895 / Otto-Lilienthal-Museum; [file record](https://commons.wikimedia.org/wiki/File:Otto-Lilienthal-Museum_id_F0158b.jpg) | Public domain; JPEG recompressed, full view retained |
| `Controls_Lilienthal_Experimental_View.jpg` | Richard Neuhauss historical photograph, 1895; annotations credited to Beilich; [file record](https://commons.wikimedia.org/wiki/File:Otto_Lilientahl%27s_Experimental_Monoplane.tif) | Source record specifies [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); TIFF converted to JPEG, existing annotations retained |
| `Controls_Lilienthal_Warping_Letter.jpg` | Otto Lilienthal, 3 October 1895; Deutsches Museum archive 1932-1/11; [file record](https://commons.wikimedia.org/wiki/File:Lilienthal_experimental_device_1895_detail.gif) | Public domain; GIF converted to JPEG |
| `Controls_MQ9_Vtail.jpg` | U.S. Air Force / Staff Sgt. Brian Ferguson; [file record](https://commons.wikimedia.org/wiki/File:MQ-9_Reaper_in_flight_(2007).jpg) | Public domain in the United States; resized/recompressed |
| `Controls_X48B_Winglets.jpg` | NASA / Carla Thomas; [NASA image article](https://www.nasa.gov/image-article/x-48b-first-flight/); actual page image filename `254008main_ED07-0164-1_full.jpg` | NASA photograph, public domain in the United States; recompressed |
| `Controls_X36_Tailless.jpg` | NASA / Carla Thomas, 30 October 1997; [NASA source](https://www.nasa.gov/aeronautics/x-36-tailless-fighter/), photo `EC97-44294-2` | NASA photograph, public domain in the United States; recompressed |
| `Controls_X47B_Finless.jpg` | U.S. Air Force / Rob Densmore, 4 February 2011; [file record](https://commons.wikimedia.org/wiki/File:X-47B_110204-F-1162D-119.jpg) | Public domain in the United States; resized/recompressed |

`Controls_Lilienthal_Tail_and_Tip_Map`, `Controls_Architecture_Comparison`, and
`Controls_Modern_Effectors` (SVG and PNG) are original teaching diagrams generated
by `scripts/expand_lecture01_control_atlas.py`. A post viewed from above is shown
as a dot; a vertical vane remains vertical as it pivots. The V-tail sketch is a
projection of inclined surfaces. Command arrows in the elevon sketches are not
force arrows; the V-tail arrows represent illustrative local normal forces.

Aircraft-specific claims are grounded in [Raffel et al.](https://doi.org/10.2514/1.C037047),
[NASA X-48 facts](https://www.nasa.gov/wp-content/uploads/2021/09/171791main_FS-090-DFRC.pdf),
[NASA X-36](https://www.nasa.gov/aeronautics/x-36-tailless-fighter/), the cited USAF
ruddervator report and [BAE Systems' MAGMA experiment](https://www.baesystems.com/en-uk/article/magma-the-future-of-flight).
No aircraft-specific X-47B surface allocation is inferred from its photograph.
The original elevon form is a command-mixing and saturation illustration, not a
flight-dynamics model or one of these aircraft's control laws. MAGMA is shown by
an original mechanism schematic and a link to the manufacturer's actual photo;
the manufacturer's copyrighted photo is not redistributed here.

Rebuild the sourced photos with `scripts/fetch_lecture01_control_photos.py`.
The original `Controls_Vane_Body_Axes`, `Controls_Vane_Lift_Drag_Moments`, and
`Controls_Vane_Side_Force_Arms` figures (PNG and editable SVG) are generated by
`scripts/lecture01_vane_moment_schematics.py`. They illustrate section 7A-3b's
right-handed body axes and vector cross products. Labels are black Times New
Roman; equations use Times-compatible STIX math. Loads and dimensions are
invented teaching examples, not measured glider data. Dashed lines in the
side-force comparison are lines of action. Curved arrows indicate moment
tendencies, not simulated flight trajectories. Geometry is not to scale.

The actual source URLs, credits and reuse metadata are retained in
`CONTROL_PHOTO_SOURCES.json`. Preserve the photo licenses independently of the
repository code license. Rendering the diagrams requires Matplotlib; saving
the notebook's numerical activity output additionally requires IPython.

## Real-hardware reading cards for section 7A-11 — October 1, 2026

Eight photo/explanation cards replace the wide mechanism table. A subsequent
October 1 rendering fix stacks each photo, caption and explanation in normal
document flow: Colab's table rendering could clip the earlier side-by-side
version. Content and photo attribution are unchanged; no table layout is needed.
The existing X-48B, MQ-9 and 737 photographs retain the credits above. The five
additional NASA photographs below are downloaded without pixel edits; display
size is set in HTML, and clicking opens the full repository image.

| Asset | Source and credit | What the photograph establishes |
|---|---|---|
| `Controls_X48C_Split_Open.jpg` | [NASA / Carla Thomas, ED12-0255-59](https://www.nasa.gov/image-article/x-48c-deploys-split-ailerons/) | Split ailerons open for post-landing braking, not evidence of an asymmetric yaw command |
| `Controls_Centurion_Motors.jpg` | [NASA, EC98-44803-115](https://www.nasa.gov/reference/centurion/) | Outboard propeller locations; the source text, not the still photo, establishes differential-power yaw control |
| `Controls_HARV_Ground_Test.jpg` | [NASA, EC91-0075-33](https://www.nasa.gov/reference/f-18-harv/) | Actual external vectoring vanes and exhaust during a ground test |
| `Controls_AMELIA_Blowing.jpg` | [NASA / Dominic Hart, ACD12-0003-019](https://www.nasa.gov/aeronautics/amelias-innovations-inspire-unusual-dedication/) | A physical circulation-control model and smoke-visualization setup; smoke is a tracer, not the slot supply jet |
| `Controls_F8_Flight_Computer.jpg` | [NASA, E-24741](https://www.nasa.gov/image-detail/amf-e-24741/) | Installed digital fly-by-wire electronics; not a modern control-allocation algorithm |

These NASA photographs are public domain in the United States. Credits and
exact download URLs/hashes are in `EFFECTOR_PHOTO_SOURCES.json`. Rebuild the
downloads with `scripts/fetch_lecture01_effector_photos.py`; update the notebook
and its local HTML companion with `scripts/enrich_lecture01_effector_cards.py`.
The original atlas builder also invokes the enrichment step, so it does not
silently restore the old table. The card text is original course explanation;
aircraft-specific claims link to NASA, USAF or FAA documentation. The generic
mechanics statements do not prescribe the named aircraft's control law.

## Finless yaw comparison, section 7A-12 — October 1, 2026

- `Controls_B2_Flying_Wing.jpg`: unchanged [USAF photograph by Staff Sgt.
  Bennie J. Davis III, May 30, 2006](https://commons.wikimedia.org/wiki/File:B-2_Spirit_original.jpg),
  public domain in the United States. Full provenance/hash: `B2_PHOTO_SOURCE.json`.
  The front/upper view shows the planform but not a clearly opened clamshell.
- B-2 hardware claim: D. R. Dreim, S. B. Jacobson and R. T. Britt (Northrop
  Grumman), “Simulation of Non-Linear Transonic Aeroelastic Behavior on the B-2,”
  in [NASA/CP-1999-209136/PT2](https://ntrs.nasa.gov/api/citations/19990052675/downloads/19990052675.pdf#page=83),
  printed p. 515 / PDF p. 83, Fig. 7 and adjacent flight-control paragraph.
  The source PDF is linked, not redistributed as a course asset.
- X-47 mechanism family: [JATM 11 (2019), DOI 10.5028/jatm.v11.1074,
  Introduction](https://www.scielo.br/j/jatm/a/LRXDrQqY4wyQh4SSGnssPPp/?lang=en),
  describes coordinated spoilers/trailing-edge surfaces and cites Whittenbury's
  X-47B design-development paper, AIAA 2011-7041. The latter full text was not
  accessible during this revision; no exact surface schedule is attributed to it.
  The existing X-47B photograph and credit remain unchanged.
- `Controls_Finless_Yaw.png` and `.svg`: original black Times New Roman
  teaching schematics, generated by `scripts/enrich_lecture01_finless_yaw.py`.
  These explain generic local motion and CG moment balance; they are not
  dimensioned aircraft diagrams or mappings of exact panel positions/counts.
  The 4 m, 30 N and 10 N worked values are invented classroom loads.

Run `scripts/fetch_lecture01_b2_photo.py` to rebuild the unchanged photo and
`scripts/enrich_lecture01_finless_yaw.py` to rebuild the schematic, update only
the existing `l01-controls-x47` cell, and regenerate the local HTML companion.
The main control-atlas builder also invokes this enrichment. All existing
code cells, outputs and section numbers outside 7A-12 are preserved.
