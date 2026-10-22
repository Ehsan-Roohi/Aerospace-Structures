# Wing Lab study files and design-parameter import

## Live load profiles and drawing scales

Load inputs preview the signed intensity against span before application. Each saved load
also has an expandable profile with its total force, peak intensity and resultant station.
Total force F is in N; intensity q is in N/mm for printed wings and N/m for D.520.
They are different quantities: integrating q over span gives F. Curved loads accept either
total force or peak intensity; changing the input basis preserves the physical load.

Shared intensity scale compares line-load magnitudes; a small load can look nearly flat.
Independent heights show each profile clearly but must not be used to compare magnitudes.
The selection changes drawing only, never the solved load. Point-force arrows are schematic
and cannot share an intensity scale with line loads.

The optional power-law generator accepts interval, signed total force, maximum location
and exponent (0.1–12). It previews a 31-point piecewise-linear table, normalized to the
specified total. This is an approximation of the power law, not an additional exact solver
law. Generating or previewing a table does not apply it; confirm the validated CSV separately.

## Selecting load coordinates on the 3-D model

New wing studies start without applied loads; reopening or restoring a saved study retains its recorded loads. In **Loads**, select a shape and press
**Pick on 3-D wing**. The view switches to undeformed geometry and pauses orbit controls.
Click visible skin to select a point force's span station and chord fraction; for a line load,
click its two end stations. Its chord fraction is fixed by the first click throughout the interval.
The Schrenk option (printed wing) always uses the full semi-span and only takes x/c from the pick.

Coordinates are interpolated on the actual skin triangle hit by the camera ray. They are not
inferred from a screen rectangle or from the deformation exaggeration. Printed-wing stations use
mm; D.520 uses m, within its modelled support-to-last-rib loading interval. Hidden or clipped skin
and empty background cannot receive a pick. The same numeric fields remain editable for precision.
An unsupported/incomplete study must be corrected and solved before picking.

Picking fills coordinates and clears magnitude; it does not apply a force. Enter signed magnitude
(upward positive) and confirm **Add load**. **Esc** or the picking button cancels selection.
**Show bending & twist** displays the solved, exaggerated deflected/twisted model. The existing
stress plot remains available. Changing x/c changes the force's lever arm about the shear centre;
it does not change the prescribed spanwise force or, in the legacy straight-beam route, its spanwise bending moment. The spatial route uses the full global load-position/moment vector. The beam/section
idealization still does not resolve local contact stress at the picked point, or turn the load
into an airfoil pressure distribution. No new load type or direct applied torque is implied.


This page describes how the MIE 446 Wing Lab saves and opens studies, how a study travels in a link,
and how the outer shape of a wing designed in another program can be brought into the printed-wing
workspace. The code is `wing_study_io.js`; its tests are `test_wing_study_io.mjs`.

> **Compatibility with any external design tool's export is pending: no exported file has been tested.**
> The Wing Lab reads only its own two JSON formats described here. DAT airfoil coordinates use the separate profile-upload control, not the JSON study control. A JSON file written by another program is
> not read directly. To use a design from another program, copy its numbers into the parameter
> template by hand (see the [manual-transfer worksheet](#manual-transfer-worksheet)).

## What the buttons do

| Button | Workspace | What happens |
|---|---|---|
| **Save study** | printed wing, D.520 | Checks the current inputs and downloads them as a `.json` study file. If an input is invalid, nothing is downloaded and the reasons are listed. |
| **Open study** | printed wing, D.520 | Reads a study file, checks every field, and shows a preview. **Apply** replaces the current study; **Cancel** leaves it unchanged. |
| **Import design parameters** | printed wing | Reads a design-parameter file (or text pasted with **Paste design parameters**) and shows every field with its value in the file, its value in the Wing Lab, and where the value came from. **Apply outer geometry** copies only the airfoil, semi-span and chords. |
| **Download parameter template** | printed wing | Downloads `mie446-wing-parameters-template.json`, a valid example to fill in (the same text as `wing_parameters_template.json` in this folder). |

Opening a file only shows the preview. **Apply** replaces the inputs like any other edit: the printed wing then
waits for **Solve** (unless "Solve automatically after each valid change" is ticked), and the D.520, which always
solves after a valid change, re-solves. Results are always recomputed by the page; a file cannot carry results into
the study. Design-parameter import and its analysis gate exist only in the printed-wing workspace.

## How an imported file is checked

Every file, pasted text and link is treated as untrusted:

1. **Size and encoding.** At most 256 KiB (262 144 bytes) of UTF-8 text. A byte-order mark is ignored (with a note).
2. **Strict JSON.** Refused: `NaN`, `Infinity`, `-Infinity`, `undefined`; numbers that overflow
   (for example `1e400`) or underflow to zero (`1e-400`); numbers written as text (`"450"`);
   duplicate field names; comments; trailing commas; raw control characters; unpaired Unicode
   surrogates; nesting deeper than 12 levels; lists longer than 256 entries; objects with more than
   64 fields. Every error names the field (for example `study.geometry.semiSpan`); JSON syntax errors
   also give the line and column.
3. **Field by field.** Each field is copied into a new state only if it has the right type, units and
   bounds. Nothing is rounded, clipped, sorted or guessed: an optional field that is absent takes its
   documented default, and a design-parameter file lists every default it uses. Unknown fields are
   refused.
4. **Engine checks.** The completed state is then checked by the solver's own code: the printed-wing
   geometry rules (`WingEngine.makeGeometry`), the input check (`WingEngine.normalize`), and the
   cross-section builder at the seven analysis stations (which reports, for example, a cavity that
   collapses because the skin is too thick). D.520 studies are checked by `MetalWingEngine.normalise`.
5. **All or nothing.** An import gives either a complete, checked state or a list of errors. A partial
   study is never applied.

Text from a file (names, labels, file names) is shown only as plain text. The page does not fetch,
upload or run anything from a file.

## Native study files: `mie446-wing-study`, versions 1 and 2

```json
{
  "format": "mie446-wing-study",
  "version": 1,
  "workspace": "printed",
  "savedAt": "2026-10-18T12:00:00.000Z",
  "app": { "name": "MIE 446 Wing Lab", "engine": "1.0.0", "io": "1.0.0" },
  "study": { "geometry": {}, "materials": {}, "assembly": {}, "load": {}, "criteria": {} }
}
```

| Field | Meaning |
|---|---|
| `format` | Always `"mie446-wing-study"`. A design-parameter file or a Beam Lab study is refused with a pointer to the right button. |
| `version` | `1` for legacy studies; `2` for expanded printed-wing geometry or saved analysis-mesh settings. D.520 remains version 1. Unsupported versions are refused; nothing changes. |
| `workspace` | `"printed"` or `"d520"`. A study opens only in its own workspace. |
| `savedAt` | ISO 8601 date and time (optional; an invalid date gives a warning). |
| `app` | `name`, `engine` (engine version that saved the file), `io` (version of this module). If `engine` differs from the page's engine, a warning says so; the results are recomputed by the page's engine. Other `app` fields give a warning and are ignored. |
| `study` | The inputs (below). |

Any other top-level field is refused. Inside `study`, every field listed below is required unless it
says *optional*; unknown fields are refused. One exception: in the printed load case, a field that
belongs to another load case (for example `aircraftMass` in a tip-force case) gives a warning and is
ignored.

### Printed semi-wing (`workspace: "printed"`)

Units: mm, N, N/mm, MPa, g, kg, degrees.

`study.geometry`

| Field | Unit | Rule |
|---|---|---|
| `naca` | text | Four digits of a NACA 4-digit section, written as text (`"2412"`, `"0012"`). A cambered section needs a non-zero camber position; thickness must be non-zero. |
| `semiSpan`, `rootChord`, `tipChord` | mm | Positive; `tipChord ≤ rootChord` (linear taper). |
| `skin` | mm | Positive; measured vertically. |
| `ribThickness`, `te` (printed trailing edge), `cap` (root and tip caps), `rodDiameter`, `sleeveWall` | mm | Positive. |
| `modules` | – | 1, 2 or 3. |
| `interiorRibs` | – | Whole number 0–16: evenly spaced interior ribs requested (the engine always adds the two interface ribs at each seam). Ignored when `customInteriorRibs` is a list. |
| `customInteriorRibs` | mm | `null`, or a list of at most 16 stations in strictly increasing order. The engine requires them inside the span clear of the caps, clear of the seams and their interface ribs, and not overlapping. |
| `interfaceOffset` | mm | Positive and larger than `ribThickness`. |
| `cavityStart`, `cavityEnd` | x/c | 0 < start < end < 1. |
| `rodFractions` | x/c | List of at most 8 rod positions (the page's maximum), each strictly between 0 and 1; `[]` means no rods (allowed only for one module or bonded seams). Each rod hole (rod plus clearance) must fit inside the airfoil depth at the tip chord, and the printed sleeves of two rods must not overlap there. |
| `clearance` | mm | Radial rod clearance, 0–0.8. |

### Expanded printed-wing studies: version 2

Use **Airfoils & planform** in Wing Lab to choose profiles and stations; use **Open JSON** for a saved
native study and confirm **Apply** in its visible preview. **Save JSON** retains editable inputs;
**Export to notebook** also checks manufacturing compatibility. Neither button produces an STL.
The Code-to-Print notebook's setup is pinned to **v1.3.0**: open the updated notebook, rerun setup,
choose **Wing Lab JSON** in Step 2, then run its upload cell. Leave the filename blank to select a
file, or supply its actual uploaded path. The notebook keeps the source document and SHA-256.

**Airfoils.** The catalogue includes NACA four-digit sections, the non-reflex five-digit generator
(for example 23012), and coordinate examples from the NACA 6-series, NASA supercritical, Clark,
Eppler, Drela and Selig families. It is a selection, not every airfoil or a generator for every family.
Reflex five-digit and other named profiles need validated coordinate data rather than an unsupported
analytic code. The non-reflex mean-line implementation follows [PDAS's NACA definitions](https://www.pdas.com/naca456mean3.html).

For **Upload DAT**, choose a plain-text file with an optional first-line name and two coordinate
columns. Selig ordering wraps from trailing edge around the leading edge back to trailing edge;
Lednicer ordering supplies upper/lower point counts, then each surface from leading to trailing edge.
See the [UIUC format descriptions and source data](https://m-selig.ae.illinois.edu/ads.html).
The importer normalizes the chord to 1, resamples the surfaces to a shared cosine grid and retains
source metadata. Inspect the preview before applying it: crossed, folded, open-leading-edge or
malformed contours are refused, not repaired by sorting. Uploading coordinates does not supply
lift/drag polars, Reynolds-number performance or a zero-lift angle.

The following optional fields extend `study.geometry`; create them through the editor rather than
uploading an incomplete JSON fragment. Omitted fields preserve legacy geometry. Explicit `null`
does not mean a valid angle, station table or profile.

| Field | Meaning and limits |
|---|---|
| `airfoil` | Global profile: `{kind:"naca4",code:"2412"}`, `{kind:"naca5",code:"23012"}`, or `{kind:"coordinates",name,upper,lower,source}`. Each coordinate surface is ordered LE→TE as normalized `[x/c,z/c]` pairs. The legacy `naca` field remains a four-digit compatibility value; it does not replace an explicit profile. |
| `stations` | 2–9 strictly increasing `{eta,airfoil,incidenceDeg}` entries, root `eta=0` and tip `eta=1` required. `y=eta×semiSpan`; distinct stations must be ≥0.1 mm apart. Root/intermediate/tip profiles and incidence interpolate between the saved stations; section chord still follows the global linear taper. |
| `twistEnabled` | Boolean, initially false. Enable it before entering nonzero incidence; otherwise every incidence must be zero. Airfoil variation is independent of this switch. |
| `sweepDeg`, `dihedralDeg` | Degrees; permitted input ranges ±60° and ±45°. Positive sweep moves the reference line aft toward the tip; positive dihedral raises it. These are input limits, not a guarantee that every shape passes structural or fabrication checks. |
| `sweepReferenceFraction` | Sweep-line chord fraction, 0–1; omitted means 0 (leading edge), preserving old tapered models. Choose 0.25 explicitly for quarter-chord sweep. |
| `twistReferenceFraction` | Incidence pivot, 0–1; omitted means 0.25. `incidenceDeg` is absolute in the aircraft frame, positive leading-edge-up, within ±30°. Tip incidence below root incidence gives washout. |

Lengths are **mm**, angles **degrees**, aircraft **x is aft, y is projected semi-span, z is up**.
For local chord `c(y)` and sweep reference `f`, the leading-edge reference offsets are
`xLE=y tan(sweep)+f(rootChord−c(y))` and `zLE=y tan(dihedral)`. Incidence rotates the section about
its saved chord pivot. Airfoil sections remain in aircraft x-z planes; they are not automatically
rotated normal to the dihedral line. Chord-reference sweep and explicit section orientation follow
the conventions discussed in [NASA's OpenVSP wing guide](https://www.nasa.gov/reference/openvsp-wings/).
Changing airfoil along span represents aerodynamic twist geometrically; it does not calculate the
resulting aerodynamic loading. Multi-panel chord breaks, winglets and articulated control surfaces
are not implied by this station feature.

**Structural model and mesh.** Expanded profiles or nonzero geometric angles use a six-DOF-per-node,
linear, small-displacement **3-D Euler–Bernoulli spatial beam** with projected normal sections,
axial response, biaxial bending and torsion. It is not a 3-D solid/shell finite-element model.
Prescribed point forces are in **N** and line loads in **N/mm per projected y**, acting in aircraft
global **+z**; negative values act downward. Eccentric application points supply their global
moment arms. No lift distribution is inferred from incidence or airfoil choice.

This route requires no external rods, full-span perfectly bonded spars, and one piece or explicitly
fully bonded module seams. Use prescribed custom loads or a tip force, not the legacy flight
lift/weight/inertia-relief case. Dry/slipping joints and abrupt partial-span spar runouts are refused.
Nearly span-normal section projections (`|t_y|<0.35`) or unconverged reference-axis iterations are
also refused. Modes, flutter, shear failure, local buckling, bond/contact stresses and an overall
certified factor of safety are unavailable in this route; displayed normal stresses are beam stresses,
not local solid-FEA stresses. The unchanged legacy straight-wing route retains its own assumptions
and outputs.

Optional `study.analysis={"nElements":40}` records **4–100 requested numerical beam elements**.
Mandatory ends, profile stations, rib/seam locations, load boundaries and numerical section samples
can increase the actual count; compare the displayed requested and actual counts. The spatial route
has a 161-node cap. Refine and compare displacement/stress results rather than assuming a larger
count certifies the model. Elements are not physical ribs or printable pieces. The notebook archives
this analysis setting but does not use it to change CAD or rerun the structural solve.

**Fabrication remains a separate check.** The notebook lofts transformed sections, including every
specified airfoil station, and creates real skin, ribs and same-material integral spars. Ruled CAD
lofts use at least nine span samples, with additional samples for large incidence changes; browser,
beam and CAD discretisations are not identical. Thin profiles can fail the inner-cavity check; a
curved rod path cannot silently become a bent carbon rod. Inspect the imported inventory, validated
CAD and every OrcaSlicer layer. One-piece printing is optional, not mandatory. Actual connected-solid,
300 g mass and configured printer-envelope checks remain enforced; the default usable envelope is
**300 × 300 × 300 mm**. Increasing a setting does not enlarge the printer. Axis permutations are
checked, not arbitrary-angle packing, support/brim space or physical print quality. Material volume,
segmentation conservation and estimated fully dense mass use adaptive B-rep surface integration,
not the display mesh; the slicer still determines the final extrusion paths and print mass.

`study.materials`: `plaKey` (`"pla_upright"` or `"pla_flat"`), `plaOver` (`E`, `ft`, `fc`, `fs` in MPa;
each `null` for the card value or a positive number), `rodKey` (`"rod_hobby"` or `"rod_t700"`),
`rodOver` (`E` in MPa, `null` or positive). An override field that is absent means the card value.

`study.assembly`: `rodsBonded` and `seamsBonded` (true or false), `seamFreeLength` (`null` for
2 × `interfaceOffset`, or a positive length in mm), `adhesiveTensile` (MPa, positive).

`study.criteria`: `maxTipDeflection` (mm, positive) and `maxTipTwist` (degrees, positive).

`study.load` — one of three load cases (upward positive):

| `kind` | Fields |
|---|---|
| `"flight"` | `aircraftMass` (kg, > 0), `loadFactor` (n, any finite value), `distribution` (`"schrenk"`, `"elliptic"`, `"planform"`, `"uniform"` or `"tip"`), `liftFraction` (x/c where the lift acts, 0–1), `inertiaRelief` (true/false), `tipFraction` (*optional*, x/c of the tip mass, 0–1; default 0.3), `fos`, `tipMass` |
| `"tip"` | `tipForce` (N), `tipFraction` (x/c of the tip chord, 0–1), `fos`, `tipMass` |
| `"custom"` | `items` (list of load items, below; `[]` means no load is defined yet), `fos`, `tipMass` |

`fos` is the factor of safety (> 0; below 1 gives a warning). `tipMass` is the tip sensor mass in g
(≥ 0). `name` is an optional label (text, at most 80 characters).

### Load items

Printed wing: stations in mm from the root, forces in N, line loads in N/mm. D.520: stations in m
from the centreline, forces in N, line loads in N/m. `fraction` is the chord position x/c measured from
the local leading edge (0 = leading edge, 1 = trailing edge). Every item may carry an optional `label`
(text, at most 120 characters).

| `kind` | Fields | Bounds |
|---|---|---|
| `"point"` | `position`, `force`, `fraction` | printed: 0 < position ≤ semi-span; D.520: 0.46 m ≤ position ≤ 4.93 m |
| `"distributed"` | `start`, `end`, `qStart`, `qEnd`, `fraction` — linear from `qStart` to `qEnd` | printed: 0 ≤ start < end ≤ semi-span; D.520: 0.46 ≤ start < end ≤ 4.93 m |
| `"elliptic"`, `"parabolic"` | `start`, `end`, `shape`, exactly one of `total` (N) or `peak` (N/mm or N/m), `fraction` | as `"distributed"`; `shape` is `"start"`, `"end"` or `"middle"`: the position of the maximum as the solver defines the profile (`"middle"`: maximum in the middle, zero at both ends) |
| `"table"` | `points`: 2–31 rows `[y, w]` or `[y, w, x/c]` (all rows the same width, y strictly increasing, every y within the span bounds), `fraction` (required for `[y, w]` rows; with `[y, w, x/c]` rows it is not used and gives a warning), optional `source` `{filename, sha256, rows}` | linear between rows |
| `"schrenk"` | `total` (N), `fraction` — the whole semi-span | printed wing only |

Limits: printed wing at most 12 items and 30 segments; D.520 at most 30 items and 30 segments. Every
item counts as one segment except a table, which counts its rows − 1. `source.sha256` must be 64
lower-case hexadecimal characters; a `source.rows` that differs from the number of rows gives a
warning.

The solver adds its own rules for the items it analyses, for example that distinct load boundaries
stay at least 0.1 mm from each other and from ribs, seams and ends (or coincide exactly). If the
page's engine cannot analyse a kind yet, a study with that kind still opens after the checks above,
with a warning that the engine could not check it.

### D.520 metal wing (`workspace: "d520"`)

Units: SI (m, N, N/m, Pa, kg, kg/m³). `study` has these fields:

| Field | Rule |
|---|---|
| `n` | Finite and non-zero: the load factor for flight loading, or the multiplier of custom loads. |
| `distribution` | `"liftingLine"`, `"schrenk"` or `"elliptic"`. |
| `inertiaRelief` | true/false (flight loading only; custom loads never include inertia relief). |
| `include` | `{fuel, guns, ammo}`, each true/false. |
| `scales` | `{skin, web, boom, stringer}`, each positive. |
| `support` | `"fittings"` or `"clamped"`. |
| `taper` | true/false (tapered-beam effect of the inclined booms). |
| `mass`, `CL` | `null` for the preset value, or positive (mass in kg). |
| `material` | `null` for the preset, or `{E, nu, rho, Fty, Fcy, Ftu, Fsu, epsU}` (Pa, –, kg/m³, Pa …; `0 < nu < 0.5`; the engine also requires `Ftu > Fty` and `epsU > Fty/E`) with an optional `name`. |
| `customLoads` | `null` = flight loading; `[]` = no load defined yet; a list = custom bench loads (items above, no `"schrenk"`). |

## Share links

A study can also travel in a link: the study file's JSON, encoded as UTF-8 and then base64url, after
the fragment key `#wingstudy=` (for example `wing-lab.html#wingstudy=eyJmb3Jt…`). A link holds at most
8000 characters; a longer study must be saved as a file. Opening a link runs exactly the same checks
as opening a file. In the page, **Study files → Copy a link to this solved study** builds the link (only for inputs
that have been solved); a D.520 link starts with `#d520&wingstudy=`. Opening a link shows the workspace with that
study and solves it. A damaged link is checked before anything changes and the page says why: on a first visit it
shows the course wing (or the D.520) with no load; pasted into a page where a study is already open, it leaves that
study unchanged. Nothing is uploaded:
the study is inside the link itself.

## Design-parameter files: `mie446-wing-parameters`, version 1

This neutral format describes the **outer shape** of a semi-wing, and optionally its structure,
material, support and loads. It exists so that a design made elsewhere can be transferred by hand
and checked. It is not the export format of any particular program.

### Axes

The frame must be stated, exactly as follows, so that span, chord and thickness cannot be mixed up:

```json
"frame": { "span": "y", "chord": "x", "up": "z", "origin": "root leading edge" }
```

y runs along the span from the root (y = 0) to the tip; x runs along the chord from the leading edge
to the trailing edge; z points up. Nothing is rotated, mirrored or swapped automatically: any other
frame is refused.

### Fields

| Field | Unit | Rule |
|---|---|---|
| `format` | – | `"mie446-wing-parameters"`. |
| `version` | – | `1`. |
| `notes` | text | *Optional*, at most 2000 characters. |
| `source` | – | Where the numbers came from, as stated by the file (not verified): `app` (required, non-empty), and optional `appVersion`, `filename`, `exportedAt` (ISO 8601). Other `source` fields give a warning. |
| `units.length` | – | `"mm"`, `"cm"`, `"m"` or `"in"` (exactly these, lower case). Optional `units.force` must be `"N"` and `units.stress` must be `"MPa"`. |
| `span` | length | `{ "value": positive, "kind": "semi" or "full" }`. A full span is halved: semi-span = full span ÷ 2. |
| `frame` | – | As above. |
| `airfoil` | – | `{ "type": "naca4", "code": "2412" }`; the code may be written `"NACA 2412"`. |
| `rootChord`, `tipChord` | length | Positive; tip ≤ root. |
| `sweepDeg`, `dihedralDeg`, `twistDeg` | degrees | Required, and must be exactly 0. |
| `sections` | length | *Optional.* Exactly two entries, root then tip: `{station, chord}` with optional `airfoil`, `leadingEdgeX`, `leadingEdgeZ`, `twistDeg`. The root is at station 0 and the tip at the semi-span; chords must equal `rootChord` and `tipChord`; offsets and twist must be 0; the airfoil must be the wing airfoil. |
| `structure`, `material`, `supports`, `loads`, `criteria` | – | *Optional*; see [What must be supplied before analysis](#what-must-be-supplied-before-analysis). |

Any other field is refused.

### Supported geometry

A straight, unswept, untwisted, zero-dihedral semi-wing with one NACA 4-digit profile and linear
taper (tip chord ≤ root chord). These are the restrictions of this **neutral version-1 parameter
importer**, not the broader native version-2 study/editor described above.

### Rejected features

Each of these is refused with the reason; nothing is flattened or approximated:

- sweep, dihedral or twist other than 0 (including leading-edge offsets or twist in `sections`);
- more than one panel: `sections` with other than two entries, extra or intermediate sections, a chord that is not the linear taper;
- more than one airfoil: `airfoil` given as a list, separate root and tip airfoils (`airfoil.root`, `airfoil.tip`, or a section airfoil that differs), multi-element airfoils (`airfoil.elements`);
- coordinate airfoils (`airfoil.type` other than `"naca4"`, `airfoil.coordinates`, `airfoil.points`);
- airfoil designations that are not NACA 4-digit (5-digit, 6-series, named sections …), and NACA codes that break the 4-digit rules;
- tip chord larger than root chord;
- unknown units (anything other than mm, cm, m, in; forces other than N; stresses other than MPa);
- a missing or different frame;
- a root support other than `"clamped"`;
- unknown fields, `NaN`, `Infinity`, overflowing numbers, numbers written as text, negative or zero dimensions.

### Unit conversion

Lengths are converted to mm by exact decimal arithmetic (1 cm = 10 mm, 1 m = 1000 mm, 1 in = 25.4 mm
exactly), so the Wing Lab value is the number you would type: 1.5 in → 38.1 mm, 6.3 in → 160.02 mm,
0.3571 m → 357.1 mm, full span 36 in → semi-span 457.2 mm. Line loads are converted from N per length
unit to N/mm (0.254 N/in → 0.01 N/mm). The preview lists every field with its value and unit in the
file, its value in the Wing Lab, and its origin.

| Origin | Meaning |
|---|---|
| supplied | In the file (possibly converted to mm). |
| derived | Computed from supplied values (the semi-span from a full span). |
| assumed | Not in the file; the Wing Lab default is used (complete files only). |
| missing | Required before analysis and not in the file. |
| unsupported | In the file but not analysable; the file is rejected. |

### What must be supplied before analysis

The outer geometry alone gives the status **geometry-only**. **Apply outer geometry** then copies
the airfoil, semi-span, root chord and tip chord, and the **analysis stays blocked** until these are
supplied — in the file or in the app:

1. skin thickness;
2. rib layout;
3. spanwise rods (positions and diameter; an empty list means no rods);
4. modules and seams (module count; dry or bonded seams when there is more than one module);
5. material cards (printed PLA, and the rod card when there are rods);
6. root support (clamped);
7. load case.

In the app this is a checklist at the top of the printed wing's input column, with the value each item has now.
**Solve**, automatic solving, **Save study** and the link button are blocked until every item is ticked;
**Discard the imported shape** restores the previous geometry. Ticking an item is your confirmation that the value
shown is the one you intend: the app cannot know whether a default is right for your design. Structural items that a
shape-only file does supply are listed for reference but are applied only when the file supplies all seven. The outer shape goes through the same rules as the
geometry fields, so a shape that the current structure or loads cannot take (for example a shorter span than an
entered load) is refused as a whole, with the reason, and nothing changes.

A file that supplies all seven is **complete**: the assembled study is checked like a native study
and can be applied with **Apply complete study**. A file with errors is **rejected**: nothing can be
applied.

Optional sections (lengths in `units.length`):

| Section | Fields |
|---|---|
| `structure` | `skin`; `ribs` = `{interior}` (0–16 evenly spaced ribs) or `{stations: [...]}` (at most 16, strictly increasing), optional `thickness`; `rods` = `{fractions: [x/c, …], diameter, clearance, sleeveWall, bonded}` (diameter required when there are rods); `modules` (1–3); `seams` = `{bonded, freeLength, adhesiveTensile (MPa)}` (`bonded` required for 2 or 3 modules); optional `interfaceOffset`, `cap`, `trailingEdge`, `cavity` = `{start, end}` (x/c). |
| `material` | `shell` = `{card: "pla_upright" or "pla_flat", E, ft, fc, fs}`; `rod` = `{card: "rod_hobby" or "rod_t700", E}`. Moduli and strengths in MPa are optional overrides of the card. |
| `supports` | `{ "root": "clamped" }`. |
| `loads` | The study load case above (`flight`, `tip` or `custom`), with stations in `units.length`, line loads in N per `units.length`, forces in N, aircraft mass in kg and tip mass in g. |
| `criteria` | `maxTipDeflection` (length), `maxTipTwist` (degrees). |

When a complete file leaves out a value that has a Wing Lab default, the default is used and listed
as *assumed*: rib thickness 1.6 mm, radial clearance 0.25 mm, sleeve wall 1.2 mm, interface rib
offset 4 mm, caps 2 mm, trailing edge 1.2 mm, cavity 0.06–0.90 c, slip-fit rods, rod free length at a
dry seam 2 × interface offset, epoxy strength 5 MPa, stiffness criteria 45 mm and 2°. With no rods, the
rod diameter and rod card are not used.

### Provenance

Every preview shows the file name as chosen, its size in bytes, and the SHA-256 of its exact bytes
(of the UTF-8 text for pasted text), so a result can be traced to one exact file. `source.app`,
`appVersion`, `filename` and `exportedAt` are shown as stated by the file; the Wing Lab cannot verify
them.

## Limits

| Item | Limit |
|---|---|
| Study or design-parameter file | 262 144 bytes (256 KiB) of UTF-8 text |
| Share link token | 8000 characters |
| Nesting / list / object size | 12 levels / 256 entries / 64 fields |
| Text values | study, load and material names 80; item labels and `source.app` 120; file names 255; notes 2000 characters |
| Load items, printed wing | 12 items, 30 segments |
| Load items, D.520 | 30 items, 30 segments |
| Table rows | 2–31 |
| Rods / custom interior ribs | 8 / 16 |
| Messages listed | 60 errors (the rest are counted) |

## Manual-transfer worksheet

Use this worksheet to copy a design from another program into `wing_parameters_template.json`.
Write the number and its unit exactly as the other program shows them, then enter them in the
template with the matching `units.length`. If a quantity is not 0 where the worksheet requires 0,
this neutral version-1 import path cannot accept the design; use the native version-2 editor/profile
upload and its separate analysis/manufacturing checks instead.

| Quantity (generic name) | Value from the other program | Unit | Template field | Requirement |
|---|---|---|---|---|
| Length unit used | | | `units.length` | mm, cm, m or in |
| Span — is it the full span (tip to tip) or one semi-wing (root to tip)? | | | `span.value`, `span.kind` | `"full"` or `"semi"` |
| Root chord | | | `rootChord` | positive |
| Tip chord | | | `tipChord` | positive, ≤ root chord |
| Airfoil designation | | – | `airfoil.code` | NACA 4-digit only |
| Same airfoil at root and tip? | yes / no | – | — | must be yes |
| Leading-edge sweep | | degrees | `sweepDeg` | 0 |
| Dihedral | | degrees | `dihedralDeg` | 0 |
| Twist or washout | | degrees | `twistDeg` | 0 |
| Number of panels or sections between root and tip | | – | — | one straight panel |
| Axes: span along y, chord along x (leading edge to trailing edge), up along z, origin at the root leading edge? | yes / no | – | `frame` | must be yes (convert first if not) |
| Program name and version, original file name, export date | | – | `source` | for your record |

Then supply in the file, or enter in the app before running: skin thickness, ribs, rods, modules and
seams, material cards, the clamped root and the load case. Open the result with **Import design
parameters**, compare every row of the preview with your worksheet, and check the converted values.
