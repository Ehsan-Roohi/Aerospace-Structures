# Dewoitine D.520 S manual — translation brief (shared by all helpers)

Source: a scanned 1940-era French Armée de l'Air manual, "Notice Descriptive et d'Utilisation de l'Avion de Chasse D.520 S, moteur 12 Y 45" (168 scanned pages, typewritten text + red-ink technical plates).
Every page is available as a JPEG: /home/claude/d520/pages/p-XXX.jpg where XXX = (PDF page number - 1), zero-padded to 3 digits.
  e.g. PDF page 13 -> /home/claude/d520/pages/p-012.jpg
Rough Tesseract French OCR (often wrong, use only as a hint; the image is the authority) is in /home/claude/d520/ocr/p-XXX.txt (may still be generating; ignore if missing).

## How to read a page
Use the Read tool on the JPEG. Typewritten text is faint; when anything is hard to read, crop and upscale with Python/PIL
(e.g. split the page into top/middle/bottom thirds, upscale 2x, save to /tmp/claude-crops/ and Read the crops). Run python with `python3 -I`.
Do not guess numbers: if a figure is illegible, write [illegible] in both languages and mention it in "notes".

## Glossary (use consistently)
voilure = wing; longeron = spar; nervure = rib; bord d'attaque / de fuite = leading / trailing edge; volet de courbure = flap;
aileron = aileron; Karman = wing-root fillet (Karman fairing); fuselage; couple = frame (bulkhead); couple principal = main frame;
étambot = sternpost; tôlage = skinning; capot moteur = engine cowling; bâti-moteur = engine mount; plan fixe = tailplane (horizontal stabilizer);
gouvernail de profondeur = elevator; gouvernail de direction / gouvernail = rudder; dérive = fin; empennage(s) = tail unit / empennage;
compensateur / volet de compensation (tab) = trim tab; réglage d'incidence du plan fixe = tailplane incidence (trim) adjustment;
atterrisseur / train d'atterrissage = landing gear (undercarriage); train rentrant = retractable gear; béquille = tail skid (use tailwheel only if text says roulette);
amortisseur = shock absorber (oleo strut); jambe = leg; roue = wheel; frein = brake; verrouillage = lock(ing);
oléo-pneumatique = oleo-pneumatic (the D.520's hydraulic/compressed-air system); bouteille d'air comprimé = compressed-air bottle; vérin = actuator (jack);
groupe motopropulseur = powerplant; moteur = engine; compresseur = supercharger; carburateur = carburettor; correcteur altimétrique = altitude mixture control;
hélice = propeller; pas variable = variable pitch; démarreur = starter; magnéto; bougie = spark plug; pare-flammes = flame dampers; échappement = exhaust;
radiateur = radiator; refroidissement = cooling; eau = coolant (water); huile = oil; essence = fuel (petrol); réservoir = tank; jaugeur = fuel gauge;
nourrice = header tank; pompe = pump; robinet = cock / valve; filtre = filter; manette des gaz = throttle; tirette = pull handle;
canon-moteur / moteur-canon = engine-mounted cannon (Hispano-Suiza HS 404, 20 mm, firing through the propeller hub); mitrailleuse(s) = machine gun(s) (MAC 1934, 7.5 mm);
collimateur = reflector gunsight; ligne de visée de secours = emergency (backup) sight line; réchauffage = heating; boîte d'alimentation = ammunition box;
lance-bombes éclairantes = flare launcher; dispositif photographique = gun camera / camera installation;
planche de bord = instrument panel; poste de pilotage = cockpit; siège = seat; verrière = canopy; largage = jettison; conduite intérieure = enclosed cockpit / canopy;
manche à balai = control stick; palonnier = rudder bar (rudder pedals); courroie(s) de pied = foot strap(s); blocage des commandes = control lock;
inhalateur = oxygen apparatus (inhaler); TSF / poste radio = radio (wireless set); antenne = antenna; extincteur = fire extinguisher;
éclairage = lighting; feux de position = navigation lights; phare = landing light; batterie d'accumulateurs = storage battery; génératrice = generator;
hissage = hoisting; amarrage = tie-down / mooring; campement sous abri = parking under shelter (hangar layout); manutention = ground handling;
portes de visite = inspection doors (access panels); outillage de bord = on-board tool kit; trousse = tool roll; palan = hoist (block and tackle);
visite = inspection; avant le vol / après le vol = before flight / after flight; mise en marche = engine start; décollage = takeoff;
atterrissage = landing; roulage = taxiing; vrille = spin; piqué = dive; cotes = dimensions; planche (Pl.) = plate (Pl.); Notice = manual.
Units: keep metric units exactly as written (m, m², kg, l, km/h, kg/cm², tr/mn -> rpm, CV -> hp (metric, keep "ch/CV" as "hp (CV)")).
Keep all part numbers, plate references (Pl. 12, Pl. 30 bis), and model designations (12 Y 45, HS 404, MAC 1934, Ratier, Szydlowski, etc.) verbatim.

## Translation standard
Faithful, complete, technically precise English, in a clear period-appropriate technical-manual register. Translate EVERYTHING on the page
(including headers, marginal notes, handwritten corrections, table cells, footnotes). Do not summarise. Do not add content that is not on the page.
Use Markdown: headings for section titles (## / ###), numbered or lettered lists where the original uses them, Markdown tables for tabular data,
**bold** only where the original underlines/emphasises. Ignore the repeated running header "NOTICE DESCRIPTIVE ET D'UTILISATION / D.520-S / Page N" except to record the printed page number.

## WHY this matters (read carefully)
The transcription feeds a parametric 3D model of the aircraft built under one strict rule: EVERY dimension must come from a source,
and anything that does not must be labelled as a guess. So, in addition to transcribing/translating, you must capture EVERY number that
could help build or check a 3D model: lengths, spans, chords, areas, angles (dihedral, incidence, control-surface deflections, flap angles),
positions (frame/rib numbers, distances from datum), diameters (propeller, wheels), track, heights, counts (number of ribs, frames, blades, guns),
airfoil/profile designations and thicknesses, capacities, weights. Quote the exact French wording with each number.

## Output: one JSON file per page (UTF-8, valid JSON, use json.dump with ensure_ascii=False)
Text pages -> /home/claude/d520/trans/p-XXX.json ; plate pages -> /home/claude/d520/plates/p-XXX.json  (XXX = PDF page - 1, 3 digits)
{
 "pdf_page": 13,
 "printed_page": "9",                 // number typed in the page header, or null
 "kind": "cover|photo|toc|text|plate|plate-card|plate-view|blank",
 "plate": null,                        // for plates: "Pl. 9", "Pl. 30 bis" ... (from the title block / card)
 "view_of": null,                      // for multi-view fold-outs: e.g. "Pl. 9, view 2 of 3" if inferable
 "title_fr": "...", "title_en": "...",
 "fr": "full French transcription in Markdown (text pages; for plates: all legible text/labels, one per line)",
 "en": "full English translation in Markdown, same structure",
 "description_en": "plates/photos only: 2-6 sentences describing what the drawing/photo shows for a reader who cannot see it",
 "labels": [{"fr":"...","en":"..."}],   // plates: every callout/label/legend item
 "plates_referenced": ["Pl. 12"],
 "dimensions": [{"quantity":"wing span","value":"10.18","unit":"m","quote_fr":"Envergure ......... 10 m 18","where":"table row / drawing location","confidence":"high|medium|low"}],
 "modeling_notes": "anything else useful for an accurate 3D model or rig (shapes, positions relative to frames/ribs, which side, how parts move, ranges of motion, colours/markings)",
 "notes": "illegible parts, uncertainties, handwritten corrections, archive stamps"
}
For "PLANCHE N° x / Longueur / Largeur / EN n VUES" cards: kind="plate-card", record plate number, fold-out size and number of views in en/fr.
