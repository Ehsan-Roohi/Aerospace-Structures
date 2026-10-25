"""Strict, local Wing Lab study → printable geometry bridge. Never executes uploaded code.

Loads, material cards and assembly assumptions are retained as provenance, not
re-solved or converted into slicer settings. Only single-filament PLA spars with
the same effective properties as the shell can become integral printed spars.
"""
from dataclasses import dataclass
from hashlib import sha256
import json
import math
from pathlib import Path

from .config import BondedSparSpec, SparSpec, WingParameters
from .wing_sections import airfoil_label
from .project_metadata import normalize_project_name, project_markdown


class WingLabImportError(ValueError):
    pass


def _fail(message):
    raise WingLabImportError(message)


def _number(value, label, low=0, high=1e6, *, inclusive=False):
    if isinstance(value, bool) or not isinstance(value, (int,float)) or not math.isfinite(value):
        _fail(f"{label}: enter a finite number")
    if not (low <= value if inclusive else low < value) or value > high:
        _fail(f"{label}: value is outside the supported manufacturing range")
    return value


def _object(value, keys, label):
    if not isinstance(value, dict) or set(value) != set(keys):
        _fail(f"{label}: missing or unsupported fields; expected {', '.join(keys)}")
    return value


def _unique(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            _fail(f"Duplicate JSON key: {key}")
        out[key] = value
    return out


def _tree(value, depth=0):
    if depth > 12:
        _fail("JSON nesting is too deep")
    if isinstance(value, float) and not math.isfinite(value):
        _fail("Non-finite JSON numbers are not allowed")
    if isinstance(value, dict):
        if len(value)>64:
            _fail("Too many JSON object fields")
        for child in value.values():
            _tree(child, depth+1)
    elif isinstance(value, list):
        if len(value)>256:
            _fail("Too many JSON array items")
        for child in value:
            _tree(child, depth+1)
    elif isinstance(value, str) and len(value)>4096:
        _fail("JSON text field is too long")


@dataclass(frozen=True)
class WingLabImport:
    parameters: WingParameters
    source_record: dict

    def to_markdown(self):
        p = self.parameters
        name = self.source_record.get('project_name', '')
        return ("### Wing Lab → CAD import accepted\n\n"
                + (f"- Project: **{project_markdown(name)}**.\n" if name else "")
                + f"- Airfoil **{airfoil_label(p)}**, semi-span **{p.semi_span_mm:g} mm**, chords **{p.root_chord_mm:g}/{p.tip_chord_mm:g} mm**.\n"
                f"- Sweep **{p.sweep_deg:g}°** at x/c={p.sweep_reference_fraction:g}; dihedral **{p.dihedral_deg:g}°**; incidence twist **{'enabled' if p.twist_enabled else 'off'}**.\n"
                f"- **{p.module_count} module(s), {len(p.rib_stations_mm())} physical ribs, {len(p.spars)} external rods, {len(p.bonded_spars)} integral printed spars**.\n"
                f"- Source SHA-256: `{self.source_record['sha256']}`.\n\n"
                "Imported geometry overrides the geometry entries in Step 2. Team/workflow, coupon and submission fields still apply. "
                "No ribs, rods or spars are substituted with the course defaults. Printed spars share the shell filament; carbon rods are purchased, not printed. "
                "Module seams still need the assembly specified in Wing Lab. Loads and material/assembly cards are archived, not applied to the printer. "
                "The browser beam model and CAD use different discretisations: compare CAD mass and the slicer layers; this transfer is not structural certification.")


def import_wing_lab_study(data: bytes | str) -> WingLabImport:
    raw = data.encode('utf-8') if isinstance(data,str) else data
    if not isinstance(raw, bytes) or len(raw)>262144:
        _fail("Upload one Wing Lab JSON file no larger than 256 KiB")
    try:
        doc = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique,
                         parse_constant=lambda v: _fail(f"Invalid JSON number: {v}"))
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise WingLabImportError(f"Cannot read Wing Lab JSON: {exc}") from exc
    _tree(doc)
    _object(doc, ['format','version','workspace','savedAt','app','study'] + ([k for k in ['projectName','emptyStudy'] if k in doc] if isinstance(doc,dict) else []), 'Study document')
    try:
        project_name = normalize_project_name(doc.get('projectName', ''))
    except ValueError as exc:
        raise WingLabImportError(str(exc)) from exc
    if 'emptyStudy' in doc:
        if type(doc['emptyStudy']) is not bool:
            _fail("emptyStudy must be true or false")
        if doc['emptyStudy']:
            _fail("Create a wing first in Wing Lab, then Export to notebook. This JSON is an empty study, not a printable wing")
    if doc['format']!='mie446-wing-study' or type(doc['version']) is not int or doc['version'] not in (1,2) or doc['workspace']!='printed':
        _fail("Use Export to notebook from the general Wing workspace, not D.520, a share link, or a geometry-only file")
    st = doc['study']
    required_study = {'geometry','materials','assembly','load','criteria'}
    if not isinstance(st,dict) or required_study-set(st) or set(st)-required_study-({'analysis'} if doc['version']==2 else set()):
        _fail("Study: missing or unsupported fields")
    if 'analysis' in st:
        a = _object(st['analysis'],['nElements'],'Analysis mesh')
        if type(a['nElements']) is not int or not 4 <= a['nElements'] <= 100:
            _fail("Analysis nElements must be an integer from 4 to 100; this is the structural numerical mesh, not printable parts")
    fields = ['naca','semiSpan','rootChord','tipChord','skin','ribThickness','modules','te','interiorRibs','customInteriorRibs','interfaceOffset','cap','cavityStart','cavityEnd','rodFractions','rodDiameter','clearance','sleeveWall','spars']
    g = st['geometry']
    extra_fields = ['planform','airfoil','stations','twistEnabled','sweepDeg','dihedralDeg','sweepReferenceFraction','twistReferenceFraction']
    if not isinstance(g, dict) or set(fields)-set(g) or set(g)-set(fields+ (extra_fields if doc['version']==2 else [])):
        _fail("Geometry: missing or unsupported fields; use the current Wing Lab JSON export without manual schema edits")
    if any(g[key] is None for key in extra_fields if key in g):
        _fail("Station geometry fields cannot be null; omit unused optional fields or supply explicit valid values")
    for key in fields:
        if key not in ['naca','customInteriorRibs','rodFractions','spars','interiorRibs','modules']:
            _number(g[key], key, inclusive=key=='clearance')
    if type(g['modules']) is not int or g['modules'] not in (1,2,3):
        _fail("Use 1, 2 or 3 modules")
    if type(g['interiorRibs']) is not int or not 0<=g['interiorRibs']<=16:
        _fail("Use 0–16 interior ribs")
    if g['skin']<.8 or g['ribThickness']<.8 or g['te']<.8:
        _fail("Skin, ribs and trailing edge must be at least 0.8 mm")
    # Printer fit belongs to the actual CAD check in the notebook, not nominal JSON dimensions.
    rods = g['rodFractions']
    if not isinstance(rods,list) or len(rods)>8:
        _fail("Use zero to eight rod positions")
    for f in rods:
        _number(f, 'rod x/c', .1, .8, inclusive=True)
    if rods and (g['clearance']<.05 or g['clearance']>.8 or g['sleeveWall']<.8):
        _fail("Rod clearance must be 0.05–0.8 mm; sleeve wall must be at least 0.8 mm")
    ribs = g['customInteriorRibs']
    if ribs is not None:
        if not isinstance(ribs,list) or len(ribs)>16:
            _fail("Use at most 16 custom interior ribs")
        for y in ribs:
            _number(y, 'rib station')
    mats = _object(st['materials'], ['plaKey','plaOver','rodKey','rodOver'], 'Materials')
    if mats['plaKey'] not in ['pla_upright','pla_flat']:
        _fail("The current print bridge supports PLA shell/ribs only; custom or metal material cards cannot be silently printed as PLA")
    base = dict(E=2000,nu=.35,rho=1.24,ft=15,fc=50,fs=10) if mats['plaKey']=='pla_upright' else dict(E=3000,nu=.35,rho=1.24,ft=45,fc=55,fs=20)
    over = mats['plaOver']
    if not isinstance(over,dict) or set(over)-set(base):
        _fail("Unsupported shell material override")
    for k,v in over.items():
        if v is not None:
            base[k] = _number(v, f'shell {k}', inclusive=k=='nu')
    if base['nu']>=.5:
        _fail("Shell Poisson ratio must be less than 0.5")
    if not isinstance(g['spars'],list) or len(g['spars'])>2:
        _fail("Use at most two bonded spars")
    spars = []
    for i,s in enumerate(g['spars']):
        _object(s,['fraction','length','topWidth','topThickness','bottomWidth','bottomThickness','webThickness','material'],f'Spar {i+1}')
        m = _object(s['material'],['name','E','nu','rho','ft','fc','fs'],f'Spar {i+1} material')
        for k,v in base.items():
            if not isinstance(m[k],(int,float)) or isinstance(m[k],bool) or not math.isclose(m[k],v,rel_tol=1e-9,abs_tol=1e-12):
                _fail(f"Spar {i+1} {k} differs from the shell. Integral single-filament printing cannot reproduce this multi-material analysis; match the effective PLA cards in Wing Lab and Solve again")
        for k in ['topThickness','bottomThickness','webThickness']:
            if _number(s[k],f'Spar {i+1} {k}')<.4:
                _fail("Printed spar cap/web thickness must be at least 0.4 mm; inspect extrusion paths in OrcaSlicer")
        spars.append(BondedSparSpec(s['fraction'],s['length'],s['topWidth'],s['topThickness'],s['bottomWidth'],s['bottomThickness'],s['webThickness']))
    try:
        p = WingParameters(naca=g['naca'],semi_span_mm=g['semiSpan'],root_chord_mm=g['rootChord'],tip_chord_mm=g['tipChord'],
            skin_mm=g['skin'],trailing_edge_mm=g['te'],rib_thickness_mm=g['ribThickness'],interior_rib_count=g['interiorRibs'],
            module_count=g['modules'],interface_rib_offset_mm=g['interfaceOffset'],root_tip_cap_mm=g['cap'],cavity_x_start=g['cavityStart'],
            cavity_x_end=g['cavityEnd'],pla_density_g_cm3=base['rho'],
            spars=tuple(SparSpec(f,g['rodDiameter'],g['clearance'],g['sleeveWall']) for f in rods),
            custom_rib_stations_mm=None if ribs is None else tuple(ribs),bonded_spars=tuple(spars),
            airfoil_profile=g.get('airfoil'),airfoil_stations=tuple(g.get('stations') or ()),
            planform=g.get('planform','linear'),twist_enabled=g.get('twistEnabled',False),sweep_deg=g.get('sweepDeg',0),dihedral_deg=g.get('dihedralDeg',0),
            sweep_reference_fraction=g.get('sweepReferenceFraction',.5 if g.get('planform')=='elliptic' else 0),twist_reference_fraction=g.get('twistReferenceFraction',.25))
        from .validation import validate_wing
        report = validate_wing(parameters=p)
        if not report.passed:
            _fail(report.summary())
    except (TypeError,ValueError) as exc:
        raise WingLabImportError(f"Wing Lab design cannot be fabricated: {exc}") from exc
    return WingLabImport(p, dict(format='mie446-wing-lab-cad-transfer',version=1,sha256=sha256(raw).hexdigest(),
        **({'project_name':project_name} if project_name else {}),
        source_document=doc, geometry_parameters=p.to_dict(),
        limitations=['Nominal geometry transfer, not a re-solve or certification.',
                     'Elliptical and delta planforms use a finite positive tip chord; sharp zero-thickness tips are not fabricated. Elliptical CAD is a 33-station ruled approximation; inspect slicer layers.',
                     'Station sections stay parallel to aircraft x-z planes; y is projected span, positive incidence raises the leading edge. Interior profiles interpolate pointwise; no aerodynamic polar or lifting-surface analysis is implied.',
                     'Expanded geometry uses ruled CAD lofts through at least nine transformed span stations plus every explicit airfoil station; browser rendering and CAD discretisations are different approximations of the same station definition.',
                     'Saved analysis.nElements is retained in source provenance; numerical beam/frame mesh resolution does not alter CAD geometry or create physical ribs.',
                     'Integral spars share shell filament; 0.05 mm skin-internal Boolean bond overlap is clipped to outer wing.',
                     'Carbon rods and module bonding are external assembly operations; load cases are not printer settings.',
                     'CAD and browser mass/discretisation can differ; inspect validation and every slicer layer.']))


def load_wing_lab_study(path: str | Path) -> WingLabImport:
    path = Path(path)
    if path.stat().st_size>262144:
        _fail("Wing Lab file exceeds 256 KiB")
    return import_wing_lab_study(path.read_bytes())
