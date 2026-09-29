"""Replace the weak tank photograph with a source-attributed comparative gallery."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
n = json.loads(p.read_text(encoding='utf-8'))
c = next(c for c in n['cells'] if c.get('id') == '70bddc52')
s = ''.join(c['source'])
start = s.index('#### Real photograph 2:')
end = s.index('**More real skin/stringer photographs:**', start)
items = [
('2: glider skeleton — follow one spar across many ribs', 'Mu22_Glider_Wing.jpg',
 'Akaflieg München Mü 22a wooden wing under construction. Follow the substantial spanwise member across the repeated narrow rib frames. The source records a rib spacing of 110 mm. The workshop supports underneath are tooling, not aircraft structure. This view makes the difference between one continuous member and many repeated ribs especially clear.',
 'Members of Akaflieg München e.V.', 'Akaflieg_Mue22a_Flaeche.jpg', 'by-sa/3.0'),
('3: glider recovering — what the covering normally hides', 'K7_Glider_Wing.jpg',
 'Schleicher K7 right wing during recovering. Compare the exposed, repeated rib framework with the still-covered yellow region. Do not infer the full spar count from this partial view. Fabric covering and a load-bearing metal or composite skin must not be assumed to have identical structural roles.',
 'Allan Gillis', 'Schleicher_K7_C-GALN_wing_recovering.jpg', None),
('4: an early airplane — the complete rib pattern', 'REP_Uncovered_Wing.jpg',
 'R.E.P. Type D at the Musée de l’Air et de l’Espace. Start at the fuselage and follow the wing outward. The repeated perforated airfoil-shaped members are ribs; compare them with the longer members crossing several rib stations. External wires are a different type of structural element, not skin stringers. This historical configuration is not a template for a modern transport wing.',
 'Mikaël Restoux / Deep silence', 'WingStructure.JPG', 'by/2.5'),
('5: jet-airliner wing root — structure around large openings', 'Comet_Internal_Wing_Display.jpg',
 'De Havilland Comet 4C stripped wing. The large circular openings belong to the wing-root engine installation: they are not ordinary rib lightening holes or fuel bays. Examine the surrounding sheet structure, flanges and rows of fasteners. Large openings force the load path to go around them; the detailed arrangement differs greatly from a simple rectangular wing box. This is a local root/engine view, not a complete spar map.',
 'Clemens Vasters', 'DeHavilland_Comet_4C_-_Stripped_Wing_(6661501103)_(3).jpg', 'by/2.0'),
('6: modern composite construction — inside a wing demonstrator', 'DLR_Wing_Demonstrator.jpg',
 'DLR lightweight wing demonstrator. Look at the carbon-fibre web with large cutouts and the surfaces above and below it. The remaining material forms connected load paths around the openings. The blue illumination is not fuel. This is a research demonstrator, not an A380 wing; do not assign front/rear spar names to every visible member without its engineering drawing.',
 'DLR German Aerospace Center', 'Innenansicht_eines_Leichtbau-Fl%C3%BCgeldemonstrators_(7486564206).jpg', 'by/2.0'),
('7: a real rear-spar connection — distinguish structure from systems', 'Tu154_Rear_Spar.jpg',
 'Tu-154B-2 wing-center-section/fuselage interface, with the photographer’s original numbers. Number 18 identifies the rear (third) center-section spar; 2 identifies the aileron control rod, not a stringer. Numbers 8 and 9 identify a stringer and frame on the fuselage side: they must not be relabeled as wing ribs. Trace the numbered leader lines rather than identifying parts by colour. This close-up shows why pipes, cables and rods must be distinguished from primary structure.',
 'Vivan755', 'Tu-154B-wing-rear-longeron.jpg', 'by-sa/4.0'),
('8: Airbus A380 — the assembled wing box under load', 'A380_Wing_Test.jpg',
 'IABG Dresden structural loading test of an A380 wing box. This is a composite photograph showing different deflected positions, not two separate wings. The red fixtures and vertical loading equipment belong to the test rig, not the aircraft’s ribs or spars. Compare the test article with the open skeletons above: once skins are installed, most internal members are hidden. Use this picture to discuss bending and load introduction, not to count internal spars.',
 'IABG Dresden', 'IABG_Test_Setup_A380_Dresden_bent_wing.jpg', 'attribution'),
]
parts = ['**Comparative photo gallery:** Start with the exposed glider, then compare historical, jet-airliner and composite structures. These are different designs; colour is not a universal component code. Open each source for the full-resolution photograph.\n\n']
credits = ['\n## Expanded comparative wing photo gallery\n\n']
for title, filename, caption, author, page, license_id in items:
    assert (root / 'docs/assets/lecture01' / filename).exists(), filename
    source = 'https://commons.wikimedia.org/wiki/File:' + page
    if license_id is None:
        license_text = 'Public domain (released by photographer)'
    elif license_id == 'attribution':
        license_text = 'Reuse permitted with attribution; see source permission statement'
    else:
        license_text = f'[CC {license_id.upper()}](https://creativecommons.org/licenses/{license_id}/)'
    change = 'Resized only' if 'Display' in filename else 'Unmodified source image'
    width = '604' if filename == 'K7_Glider_Wing.jpg' else '1100'
    parts.append(f'#### Real photograph {title}\n\n<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/{filename}" alt="{title}" width="{width}"></p>\n\n**Read the photograph:** {caption}\n\nPhoto: {author}. {change}. [Source / full resolution]({source}). {license_text}.\n\n')
    credits.append(f'- `{filename}` — {author}; [source]({source}); {license_text}; {change}.\n')
parts.append('**Airbus extension:** [How to Make a Wing — Airbus](https://www.airbus.com/en/newsroom/stories/2023-09-how-to-make-a-wing) connects modern wing manufacture to assembly and production choices. It is a separate modern-wing programme, not a structural drawing of the A380.\n\n**Discuss:** Which photos reveal ribs clearly? Which show a local connection rather than an entire wing? Which parts are test equipment? What evidence would you need before identifying a sealed fuel boundary?\n\n')
c['source'] = (s[:start] + ''.join(parts) + s[end:]).splitlines(keepends=True)
p.write_text(json.dumps(n, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
credit_path = root/'docs/assets/lecture01/VISUAL_SOURCES.md'
existing = credit_path.read_text(encoding='utf-8')
if '## Expanded comparative wing photo gallery' not in existing:
    credit_path.write_text(existing + ''.join(credits), encoding='utf-8')
print('Replaced tank photograph with seven source-attributed structural photographs.')
