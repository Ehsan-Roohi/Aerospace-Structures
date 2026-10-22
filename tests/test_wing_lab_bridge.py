"""End-to-end tests use the real browser serializer, CAD kernel and STL/3MF exporters."""
from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile

import pytest

from mie446_wing import (WingLabImportError, WingDesign, WingProject,
    import_wing_lab_study, build_wing, validate_wing, WingParameters)
from mie446_wing.bonded_spar import spar_polygons

ROOT = Path(__file__).parents[1]


def browser_document(spar=True):
    script = """
const E=require('./computational/printed-wing-solver/web/engine.js'),IO=require('./computational/printed-wing-solver/web/wing_study_io.js'),SP=require('./computational/printed-wing-solver/web/wing_spars.js');
const spar=SP.MAT, has=process.argv[1]==='yes';
const g={...E.DEFAULT_GEOMETRY,semiSpan:240,modules:2,customInteriorRibs:[60,180],rodFractions:has?[]:[.3,.6],spars:has?[{fraction:.35,length:180,topWidth:8,topThickness:.8,bottomWidth:10,bottomThickness:.8,webThickness:.6,material:{...spar}}]:[]};
const s={geometry:g,plaKey:'pla_upright',plaOver:{},rodKey:'rod_hobby',rodOver:{},assembly:{...E.DEFAULT_ASSEMBLY,seamsBonded:true},load:{...E.DEFAULT_LOAD,kind:'tip',tipForce:2},criteria:E.DEFAULT_CRITERIA};
console.log(IO.exportPrintedStudy(s,E));
"""
    return json.loads(subprocess.run(['node','-e',script,'yes' if spar else 'no'],cwd=ROOT,check=True,capture_output=True,text=True).stdout)


@pytest.fixture(scope='module')
def doc():
    return browser_document()


def load(doc):
    return import_wing_lab_study(json.dumps(doc))


def test_browser_json_maps_without_substituting_components(doc):
    imported=load(doc); p=imported.parameters
    assert p.semi_span_mm==240 and p.module_count==2
    assert p.custom_rib_stations_mm==(60,180)
    assert p.rib_stations_mm()==(60,116,124,180)
    assert p.spars==() and len(p.bonded_spars)==1
    s=p.bonded_spars[0]
    assert (s.fraction,s.length,s.top_width,s.bottom_width,s.web_thickness)==(.35,180,8,10,.6)
    assert imported.source_record['source_document']==doc
    assert len(imported.source_record['sha256'])==64
    assert WingParameters.from_dict(p.to_dict())==p


def test_eight_rods_and_empty_custom_ribs_are_retained():
    doc=browser_document(False); g=doc['study']['geometry']
    g['rootChord']=g['tipChord']=300
    g['rodFractions']=[.15,.23,.31,.39,.47,.55,.63,.71];g['customInteriorRibs']=[]
    p=load(doc).parameters
    assert len(p.spars)==8 and p.custom_rib_stations_mm==()
    assert p.rib_stations_mm()==(116,124)


@pytest.mark.parametrize('mutation',[
    lambda d:d.update(workspace='d520'), lambda d:d.update(version=2),
    lambda d:d.update(extra=1),lambda d:d['study']['geometry'].update(extra=1),
    lambda d:d['study']['geometry'].update(semiSpan=float('inf')),
    lambda d:d['study']['geometry'].update(modules=True),
    lambda d:d['study']['geometry'].update(semiSpan=1000),
    lambda d:d['study']['geometry'].update(customInteriorRibs=[120]),
    lambda d:d['study']['geometry'].update(customInteriorRibs=[180,60]),
    lambda d:d['study']['geometry'].update(rodFractions=[.3]),
    lambda d:d['study']['geometry']['spars'][0]['material'].update(E=131000),
    lambda d:d['study']['materials'].update(plaKey='custom_shell'),
    lambda d:d['study']['geometry']['spars'][0].update(length=300),
    lambda d:d['study']['geometry']['spars'][0].update(fraction=.95),
    lambda d:d['study']['geometry']['spars'][0].update(webThickness=.2),
])
def test_unsupported_inputs_fail_explicitly_not_as_default_wing(doc,mutation):
    d=deepcopy(doc);mutation(d)
    with pytest.raises((WingLabImportError,ValueError)):
        load(d)


def test_hostile_json_is_refused(doc):
    text=json.dumps(doc)
    for bad in ['{"format":1,"format":2}',text.replace('240','1e9999',1),'['*30+'0'+']'*30,' '*262145,text.replace('240','true',1)]:
        with pytest.raises(WingLabImportError):
            import_wing_lab_study(bad)


def test_spar_polygons_match_browser_sections(doc):
    p=load(doc).parameters;s=p.bonded_spars[0]
    script="const E=require('./computational/printed-wing-solver/web/engine.js'); const g=JSON.parse(process.argv[1]); console.log(JSON.stringify([0,90,180].map(y=>E.sparParts(E.makeGeometry(g),y)[0].polygons)));"
    js=json.loads(subprocess.run(['node','-e',script,json.dumps(doc['study']['geometry'])],cwd=ROOT,check=True,capture_output=True,text=True).stdout)
    import numpy as np
    for y,polys in zip([0,90,180],js):
        for cad,beam in zip(spar_polygons(p,s,y),polys):
            assert np.asarray(cad)==pytest.approx(np.asarray(beam),abs=1e-10)


@pytest.fixture(scope='module')
def cad(doc):
    p=load(doc).parameters
    return build_wing(p)


@pytest.mark.slow
def test_real_spar_is_connected_inside_skin_and_every_module_valid(cad):
    report=validate_wing(cad)
    assert report.passed,report.summary()
    assert len(cad.bonded_spars)==1 and len(cad.ribs)==4 and not cad.sleeves
    assert len(cad.complete.Solids())==1
    assert all(m.isValid() and len(m.Solids())==1 for m in cad.modules)
    assert sum(m.Volume() for m in cad.modules)==pytest.approx(cad.complete.Volume(),rel=5e-4)
    assert cad.complete.cut(cad.outer).Volume()<.05
    # Cross-sections contain extra material only up to the requested spar runout.
    import cadquery as cq
    for y,expected in [(30,True),(150,True),(210,False)]:
        slab=cq.Solid.makeBox(300,1,100,cq.Vector(-1,y,-50))
        added=cad.bonded_spars[0].intersect(slab).Volume()
        assert (added>1)==expected


@pytest.mark.slow
def test_actual_spar_exports_to_stl_3mf_and_provenance_zip(doc,cad,tmp_path):
    from mie446_wing.student_workflow import BuiltWingProject
    imported=load(doc)
    project=WingProject(WingDesign(),team_id='BridgeTest',revision='R02',imported_parameters=imported.parameters,source_record=imported.source_record)
    built=BuiltWingProject(project,project.analyze(),cad,validate_wing(cad))
    package=built.export_submission(tmp_path,ai_log=[])
    with ZipFile(package.archive_path) as z:
        names=z.namelist()
        assert len([n for n in names if n.endswith('.stl')])==2
        assert len([n for n in names if n.endswith('.3mf')])==2
        assert 'wing_lab_transfer.json' in names
        source=json.loads(z.read('wing_lab_transfer.json'))
        assert source['sha256']==imported.source_record['sha256']
        assert source['source_document']==doc
        assert not any('Coupon' in n for n in names)
    for mesh in package.output_dir.glob('*.3mf'):
        with ZipFile(mesh) as z:
            assert any(n.endswith('.model') for n in z.namelist())


@pytest.mark.slow
def test_one_piece_shell_without_rods_is_supported_and_not_forced_to_course_defaults(doc):
    d=deepcopy(doc);d['study']['geometry'].update(modules=1,spars=[],customInteriorRibs=[])
    p=load(d).parameters
    assert not p.rib_stations_mm() and not p.spars
    build=build_wing(p)
    assert len(build.modules)==1 and validate_wing(build).passed
