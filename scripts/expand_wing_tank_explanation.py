"""Add source-qualified answers and real photographs beside FAA Figure 3-7."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
n=json.loads(p.read_text(encoding='utf-8'))
c=next(c for c in n['cells'] if c.get('id')=='70bddc52')
s=''.join(c['source'])
at=s.index('#### A second reference view:')
new='''#### What Figure 3-7 does not tell us

**Where is the front spar? Are there two rear spars?** The FAA labels the green member only **Spar**, not **Rear spar**. This generic cutaway does not establish a complete front/rear spar arrangement; an unlabeled or omitted member cannot be reconstructed reliably from the drawing. Do not count the green panel and the beige member near the flap as two rear main spars. A conventional two-spar example has one front and one rear main spar, but single-spar and multispar designs also exist. A separate trailing-edge support or false spar may support control surfaces. Number and position are aircraft-specific. [FAA airframe handbook, wing construction](https://www.faa.gov/documentlibrary/media/advisory_circular/ac_65-15a.pdf).

**Why is the beige aft member perforated or lattice-like?** Its exact identity is not specified in this illustration. In general, lightening/access openings and open structural arrangements can reduce mass while retaining designed load paths. That general principle does not identify this particular drawn member or prove that it is a tank wall. Consult a labeled structural drawing for a specific airplane.

**What are the small upright blue shapes?** They have no individual FAA labels. Their appearance is consistent with blue tank shading visible through openings in a structural web, but that is a visual interpretation, not a confirmed component identification. Do not teach them as pumps, probes, posts or baffles on the basis of this figure.

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/Wet_Wing_Boundaries.png" alt="Explicit two-spar example with front and rear spars, selected wet bays, dry bays and an end rib; internal rib openings contrasted with a sealed boundary" width="1250"></p>

**Does fuel fill the whole wing?** No general rule places fuel in every bay, nor only in the blue patch at the left of this drawing. An integral or wet-wing tank uses selected sealed structural compartments; other designs use separate tanks or cells. The extent and division of tanks depend on the aircraft. Leading/trailing-edge equipment spaces and other bays can remain dry. The illustrative plan above separates the fuel-storage boundary from the longer structural members.

**Must the end rib have no holes?** A containment boundary must have no uncontrolled open path into dry space. It can nevertheless contain sealed covers and designed penetrations for structure or services. Ribs inside one fuel compartment may have communication openings; baffles reduce fuel motion. Do not confuse an internal perforated rib with a sealed end boundary. [Manufacturer example: Embraer rib/stringer penetration sealing, description and Figures 1–5](https://patents.google.com/patent/US20200307766A1/en).

For an aircraft-specific comparison, see the tank-layout diagram and wing photograph in Airbus FAST 52, **Repairing wing fuel tank access panels**. It distinguishes inner and outer wing tanks in the illustrated A330/A340 arrangement. [Open the Airbus publication](https://www.aircraft.airbus.com/sites/g/files/jlcbta126/files/2022-04/FAST52.pdf). Do not transfer that layout to every aircraft.

#### Real photograph 1: two spars and repeated ribs

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/Piper_PA18_Uncovered_Wing.jpg" alt="Piper PA-18 wing during overhaul; original callout 1 identifies spars and 2 identifies ribs" width="1100"></p>

The original marks identify **1: spars; 2: ribs**. Follow the spars underneath the remaining covering and compare their spanwise direction with the repeated chordwise rib frames. Diagonal braces and rib members are not all stringers. This fabric-covered light-aircraft wing is a structural comparison, not an example of an integral metal fuel tank.

Photo: Christoph von Blücher, unmodified, [source](https://commons.wikimedia.org/wiki/File:WingPiperPA18partialuncovered.JPG), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

#### Real photograph 2: inside an aircraft fuel tank

<p align="center"><img src="https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/USAF_Fuel_Tank_Interior_Display.jpg" alt="Interior of a C-17 fuel tank during a USAF extraction training exercise" width="1100"></p>

This C-17 photograph shows a real tank interior and maintenance-access setting. Compare the visible structural surfaces and openings with the simplified blue patch in Figure 3-7; the picture does not establish the function of every individual fitting or the extent of the complete tank. Photo: U.S. Air Force / Airman 1st Class Tom Brading, 130307-F-NK398-670; public domain in the United States; resized only. [Source and caption](https://commons.wikimedia.org/wiki/File:Inside_a_fuel_tank_(13151954573).jpg).

**More real skin/stringer photographs:** [Military Aviation Museum / Pioneer Aero — SBD center-section restoration](https://www.militaryaviationmuseum.org/sbd-dauntless-topside-wing-center-section-restoration/) shows hat-section stringers mating against the inner skin and ribs between numbered spars. Follow the museum's captions; this is another aircraft-specific layout, not the FAA figure's missing parts.

**Classroom check:** Why can an internal tank rib have an opening while a wet-to-dry boundary cannot have an unsealed opening? Why does an additional member behind the main wing box not automatically count as a second rear main spar?

'''
if '#### What Figure 3-7 does not tell us' not in s:
    s=s[:at]+new+s[at:]
c['source']=s.splitlines(keepends=True)
p.write_text(json.dumps(n,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
