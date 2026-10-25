"""Printable finite-tip planforms: bridge, geometry, reference area and STL."""
import json
import math
from pathlib import Path
import pytest
from mie446_wing import import_wing_lab_study, build_wing, validate_wing
from mie446_wing.metrics import calculate_planform_metrics
from mie446_wing.wing_sections import transform_point
import cadquery as cq

@pytest.mark.parametrize('shape',['elliptic','delta'])
@pytest.mark.parametrize('with_spar',[False,True])
def test_planform_json_to_stl(shape,with_spar,tmp_path):
    doc=json.loads((Path(__file__).parent/'fixtures/wing_lab_one_piece_browser.json').read_text(encoding='utf-8'))
    doc['version']=2
    g=doc['study']['geometry']
    g.update(planform=shape,naca='0020',rootChord=180,tipChord=80,semiSpan=260,skin=.8,cavityEnd=.8,modules=1,rodFractions=[],spars=[],interiorRibs=0,customInteriorRibs=None,sweepReferenceFraction=.5 if shape=='elliptic' else 1)
    if with_spar:
        g['spars']=[dict(fraction=.35,length=260,topWidth=8,topThickness=.8,bottomWidth=8,bottomThickness=.8,webThickness=.6,material=dict(name='PLA',E=2000,nu=.35,rho=1.24,ft=15,fc=50,fs=10))]
    doc['study']['load']={'kind':'flight','selfWeight':True,'aircraftMass':1,'loadFactor':1,'distribution':'elliptic','liftFraction':.25,'inertiaRelief':False,'tipFraction':.3,'fos':1.5,'tipMass':0}
    p=import_wing_lab_study(json.dumps(doc)).parameters
    assert p.planform==shape
    assert p.chord_at(260)==pytest.approx(80)
    if shape=='delta':
        assert transform_point(p,130,p.chord_at(130),0)[0]==pytest.approx(180)
    else:
        assert p.chord_at(130)**2==pytest.approx(180**2*.75+80**2*.25)
    area=calculate_planform_metrics(p).semi_wing_area_mm2
    integral=sum(p.chord_at((i+.5)*260/10000) for i in range(10000))*260/10000
    assert area==pytest.approx(integral,rel=1e-7)
    build=build_wing(p)
    assert build.complete.isValid()
    assert len(build.complete.Solids())==1
    assert validate_wing(parameters=p,build=build).passed
    stl=tmp_path/(shape+'.stl')
    cq.exporters.export(build.complete,str(stl),tolerance=.12,angularTolerance=.15)
    assert stl.stat().st_size>1000

