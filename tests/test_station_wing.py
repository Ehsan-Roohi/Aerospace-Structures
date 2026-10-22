"""Browser-profile/JSON -> station CAD -> real watertight print mesh regressions."""
from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path
import subprocess

import numpy as np
import pytest

from mie446_wing import import_wing_lab_study, build_wing, validate_wing, WingParameters
from mie446_wing.cad_metrics import adaptive_volume
from mie446_wing.wing_sections import profile_section, profile_ordinates, profile_at, section_at, surface_at, transform_point

ROOT = Path(__file__).parents[1]


def browser_profiles():
    code = "const A=require('./computational/printed-wing-solver/web/wing_airfoils.js');console.log(JSON.stringify(['naca23012','clarky','sc20412','naca632615'].map(id=>A.preset(id))))"
    return json.loads(subprocess.run(['node','-e',code],cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf-8').stdout)


def station_document():
    d=json.loads((ROOT/'tests/fixtures/wing_lab_one_piece_browser.json').read_text(encoding='utf-8'))
    root,tip=browser_profiles()[1:3]
    d['version']=2
    d['study']['load']['items'][0]['position']=150
    d['study']['geometry'].update(semiSpan=180,rootChord=160,tipChord=120,modules=1,
        customInteriorRibs=[60,120],rodFractions=[],spars=[dict(fraction=.35,length=180,topWidth=8,topThickness=.8,bottomWidth=8,bottomThickness=.8,webThickness=.6,
            material=dict(name='Printed PLA · teaching input',E=2000,nu=.35,rho=1.24,ft=15,fc=50,fs=10))],cavityEnd=.82,
        airfoil=root,stations=[{'eta':0,'airfoil':root,'incidenceDeg':2},
                              {'eta':.5,'airfoil':root,'incidenceDeg':0},
                              {'eta':1,'airfoil':tip,'incidenceDeg':-2}],
        twistEnabled=True,sweepDeg=12,dihedralDeg=6,sweepReferenceFraction=.25,twistReferenceFraction=.25)
    second=deepcopy(d['study']['geometry']['spars'][0]);second['fraction']=.65
    d['study']['geometry']['spars'].append(second)
    return d


def inspect_binary_stl(path):
    """Independent mesh checks without adding a notebook dependency."""
    import struct
    data=Path(path).read_bytes();count=struct.unpack_from('<I',data,80)[0]
    assert len(data)==84+50*count
    records=np.frombuffer(data,offset=84,dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attribute','<u2')]))
    triangles=records['vertices'].astype(float)
    vertices,flat=np.unique(triangles.reshape(-1,3),axis=0,return_inverse=True)
    faces=flat.reshape(-1,3)
    edges=np.concatenate((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]))
    _,counts=np.unique(np.sort(edges,axis=1),axis=0,return_counts=True)
    parents=list(range(len(vertices)))
    def find(i):
        while parents[i]!=i:
            parents[i]=parents[parents[i]];i=parents[i]
        return i
    for a,b in edges:
        parents[find(int(a))]=find(int(b))
    triangle_volume=np.einsum('ij,ij->i',triangles[:,0],np.cross(triangles[:,1],triangles[:,2]))/6
    volume=triangle_volume.sum()
    component_volumes={}
    for face,v in zip(faces,triangle_volume):
        key=find(int(face[0]));component_volumes[key]=component_volumes.get(key,0)+float(v)
    return dict(triangles=count,watertight=bool(np.all(counts==2)),components=len({find(i) for i in range(len(vertices))}),
                component_volumes_mm3=sorted(component_volumes.values()),
                signed_volume_mm3=float(volume),extents=np.ptp(vertices,axis=0).tolist())


@pytest.mark.parametrize('index',range(4))
def test_profile_surfaces_and_ordinates_match_javascript(index):
    p=browser_profiles()[index]
    script="const A=require('./computational/printed-wing-solver/web/wing_airfoils.js'),p=JSON.parse(process.argv[1]);console.log(JSON.stringify({s:A.surfaces(p,160,1.2,81),v:[.06,.3,.7,.9].map(x=>A.verticalOrdinates(p,x,160,1.2))}));"
    js=json.loads(subprocess.run(['node','-e',script,json.dumps(p)],cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf-8').stdout)
    s=profile_section(p,chord_mm=160,trailing_edge_mm=1.2,point_count=81)
    for a,b in zip((s.x_upper,s.z_upper,s.x_lower,s.z_lower),(js['s'][k] for k in ['xu','zu','xl','zl'])):
        np.testing.assert_allclose(a,b,atol=1e-11,rtol=1e-12)
    lo,ca,up=profile_ordinates(p,np.array([.06,.3,.7,.9]),160,1.2)
    for k,values in [('lower',lo),('upper',up),('camber',ca)]:
        np.testing.assert_allclose(values,[q[k] for q in js['v']],atol=1e-11,rtol=1e-12)


def test_version_two_json_preserves_all_station_parameters_and_provenance():
    d=station_document(); imported=import_wing_lab_study(json.dumps(d));p=imported.parameters
    assert p.sweep_deg==12 and p.dihedral_deg==6 and p.twist_enabled
    assert p.airfoil_stations==tuple(d['study']['geometry']['stations'])
    assert p.airfoil_profile==d['study']['geometry']['airfoil']
    assert WingParameters.from_dict(p.to_dict())==p
    assert imported.source_record['source_document']==d
    # Pivot location is independent of incidence; exact quarter-chord sweep/dihedral.
    y=90;c=p.chord_at(y);x,yy,z=transform_point(p,y,.25*c,0)
    assert x==pytest.approx(.25*p.root_chord_mm+y*np.tan(np.deg2rad(12)))
    assert z==pytest.approx(y*np.tan(np.deg2rad(6))) and yy==y
    p0=replace(p,sweep_deg=0,dihedral_deg=0)
    assert transform_point(p0,0,0,0)[2]>0 # positive incidence raises LE
    assert 'Sweep **12' in imported.to_markdown()


def test_aerodynamic_twist_blends_continuous_endpoint_surfaces_like_browser():
    d=station_document();g=d['study']['geometry']
    g['stations'][0]['airfoil']=browser_profiles()[0] # analytic NACA5 to coordinate endpoint
    p=import_wing_lab_study(json.dumps(d)).parameters
    script="const A=require('./computational/printed-wing-solver/web/wing_airfoils.js'),g=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify([0,.001,.2,.5,.8,1].map(e=>A.surfaces(A.profileAt(g.stations,e),g.rootChord+e*(g.tipChord-g.rootChord),g.te,81))));"
    js=json.loads(subprocess.run(['node','-e',script],input=json.dumps(g),cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf-8').stdout)
    for eta,expected in zip([0,.001,.2,.5,.8,1],js):
        s=section_at(p,eta*p.semi_span_mm,81)
        for got,key in zip((s.x_upper,s.z_upper,s.x_lower,s.z_lower),['xu','zu','xl','zl']):
            np.testing.assert_allclose(got,expected[key],atol=1e-10,rtol=1e-12)


def test_section_frames_match_browser_geometry_at_interior_stations():
    d=station_document();g=d['study']['geometry'];p=import_wing_lab_study(json.dumps(d)).parameters
    script="const G=require('./computational/printed-wing-solver/web/wing_geometry.js'),g=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify([0,63,90,159,180].map(y=>G.transformPoint(g,y,[.3*G.chordAt(g,y),2]))));"
    js=json.loads(subprocess.run(['node','-e',script],input=json.dumps(g),cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf-8').stdout)
    np.testing.assert_allclose([transform_point(p,y,.3*p.chord_at(y),2) for y in [0,63,90,159,180]],js,atol=1e-10,rtol=1e-12)


def test_legacy_json_does_not_change_leading_edge_or_spar_conventions():
    d=station_document(); d['version']=1
    for key in ['airfoil','stations','twistEnabled','sweepDeg','dihedralDeg','sweepReferenceFraction','twistReferenceFraction']:
        d['study']['geometry'].pop(key)
    p=import_wing_lab_study(json.dumps(d)).parameters
    assert transform_point(p,90,0,0)==(0,90,0)


def test_real_browser_serializer_round_trip_is_readable_by_same_notebook_bridge():
    d=station_document()
    script="const E=require('./computational/printed-wing-solver/web/engine.js'),IO=require('./computational/printed-wing-solver/web/wing_study_io.js');const r=IO.importPrintedStudy(require('fs').readFileSync(0,'utf8'),E);if(!r.ok)throw Error(r.errors.join(' | '));process.stdout.write(IO.exportPrintedStudy(r.state,E));"
    serialized=subprocess.run(['node','-e',script],input=json.dumps(d),cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf-8').stdout
    exported=json.loads(serialized);p=import_wing_lab_study(serialized).parameters
    assert exported['version']==2
    assert p==import_wing_lab_study(json.dumps(d)).parameters
    assert exported['study']['geometry']['stations']==d['study']['geometry']['stations']
    assert exported['study']['load']==d['study']['load']


def test_actual_notebook_upload_cell_keeps_advanced_geometry_and_printer(tmp_path):
    from mie446_wing import WingProject, WingProjectError, WingDesign, WingLabImportError, load_wing_lab_study
    document=station_document();path=tmp_path/'advanced-wing.json';path.write_text(json.dumps(document),encoding='utf-8')
    notebook=json.loads((ROOT/'notebooks/MIE446_Code_to_Print_Wing.ipynb').read_text(encoding='utf-8'))
    source=next(''.join(c['source']) for c in notebook['cells'] if c['cell_type']=='code' and '#@title Import the Wing Lab design' in ''.join(c['source']))
    env=dict(DESIGN_SOURCE='Wing Lab JSON',WING_LAB_JSON_FILE=str(path),TEAM_ID='StationTest',REVISION='R01',
        PRINTER_X_MM=300,PRINTER_Y_MM=300,PRINTER_Z_MM=300,load_wing_lab_study=load_wing_lab_study,
        WingLabImportError=WingLabImportError,WingProject=WingProject,WingDesign=WingDesign,WingProjectError=WingProjectError,
        display=lambda *args:None,Markdown=lambda s:s)
    exec(compile(source,'Wing Lab actual notebook upload','exec'),env)
    assert env['project'].parameters==import_wing_lab_study(json.dumps(document)).parameters
    analysis=env['project'].analyze()
    assert analysis.validation.passed
    report=analysis.to_markdown()
    assert 'CLARK Y' in report and '12° / 6°' in report and 'not solve the 3-D structure' in report


def test_analysis_mesh_is_preserved_as_provenance_not_changed_cad():
    d=station_document();base=import_wing_lab_study(json.dumps(d))
    d['study']['analysis']={'nElements':48}
    imported=import_wing_lab_study(json.dumps(d))
    assert imported.parameters==base.parameters
    assert imported.source_record['source_document']['study']['analysis']=={'nElements':48}
    for bad in [True,3,101,8.5,None]:
        d['study']['analysis']['nElements']=bad
        with pytest.raises(ValueError):import_wing_lab_study(json.dumps(d))


def test_large_incidence_changes_get_adaptive_loft_sampling():
    from mie446_wing.wing_sections import loft_stations,incidence_at
    p=import_wing_lab_study(json.dumps(station_document())).parameters
    ss=deepcopy(p.airfoil_stations);ss[0]['incidenceDeg']=30;ss[1]['incidenceDeg']=0;ss[2]['incidenceDeg']=-30
    p=replace(p,airfoil_stations=ss)
    ys=loft_stations(p,0,p.semi_span_mm)
    assert all(s['eta']*p.semi_span_mm in ys for s in ss)
    assert np.max(np.abs(np.diff([incidence_at(p,float(y)) for y in ys])))<=2+1e-10


@pytest.mark.parametrize('field,value', [('twistEnabled',False),('stations',[]),('sweepDeg',90),('dihedralDeg',60)])
def test_invalid_station_data_is_not_silently_flattened(field,value):
    d=station_document();d['study']['geometry'][field]=value
    with pytest.raises(ValueError):import_wing_lab_study(json.dumps(d))


def test_curved_carbon_rod_path_is_explicitly_rejected():
    d=station_document();d['study']['geometry'].update(rodFractions=[.3],spars=[])
    with pytest.raises(ValueError,match='straight rods'):
        import_wing_lab_study(json.dumps(d))


@pytest.fixture(scope='module')
def station_cad():
    return build_wing(import_wing_lab_study(json.dumps(station_document())).parameters)


@pytest.mark.slow
def test_station_loft_is_connected_valid_and_inside_actual_printer(station_cad,tmp_path):
    import cadquery as cq
    import os
    if os.environ.get('MIE446_STATION_QA_OUTPUT'):
        tmp_path=Path(os.environ['MIE446_STATION_QA_OUTPUT']);tmp_path.mkdir(parents=True,exist_ok=True)
    b=station_cad;report=validate_wing(b)
    assert report.passed,report.summary()
    assert len(b.complete.Solids())==1 and b.complete.isValid()
    assert len(b.ribs)==2 and len(b.modules)==1 and len(b.bonded_spars)==2
    for part in b.ribs+b.bonded_spars:
        assert part.cut(b.complete).Volume()<.05, 'An internal rib/spar was omitted from the final printable solid'
    assert b.complete.Volume()-b.skin.Volume()>1000, 'Internal structure must add real printable material'
    out=tmp_path/'station-wing.stl';cq.exporters.export(b.modules[0],str(out),tolerance=.05,angularTolerance=.1)
    mesh=inspect_binary_stl(out)
    assert mesh['watertight'] and mesh['signed_volume_mm3']>0
    # A single connected hollow solid may have multiple closed surface meshes:
    # one positive outer boundary plus negative enclosed cavity boundaries.
    # These are not separate printable parts; the B-rep must still be one solid.
    assert sum(v>1e-3 for v in mesh['component_volumes_mm3'])==1
    assert np.all(np.asarray(mesh['extents'])<=300.05)
    from mie446_wing.geometry import exact_bounding_box
    bb=exact_bounding_box(b.complete)
    np.testing.assert_allclose(mesh['extents'],[bb.xlen,bb.ylen,bb.zlen],atol=.08)
    # The physical result actually rises and sweeps; it is not an unmodified default wing.
    assert bb.zmax>25 and bb.xmax>165
    if os.environ.get('MIE446_STATION_QA_OUTPUT'):
        cq.exporters.export(b.complete,str(tmp_path/'station-wing.step'))
        (tmp_path/'wing-lab-station-study.json').write_text(json.dumps(station_document(),indent=2),encoding='utf-8')
        (tmp_path/'station-wing-validation.json').write_text(json.dumps(dict(validation=report.to_dict(),mesh=mesh),indent=2),encoding='utf-8')


@pytest.mark.slow
def test_station_wing_segmented_modules_keep_volume_and_connectedness(station_cad,tmp_path):
    from mie446_wing.geometry import _segment
    import cadquery as cq
    b=station_cad;p=replace(b.parameters,module_count=2,custom_rib_stations_mm=())
    modules=_segment(b.complete,p)
    assert all(m.isValid() and len(m.Solids())==1 for m in modules)
    assert sum(adaptive_volume(m) for m in modules)==pytest.approx(adaptive_volume(b.complete),rel=5e-4)
    for i,module in enumerate(modules,1):
        out=tmp_path/f'station-segment-{i}.stl';cq.exporters.export(module,str(out),tolerance=.05,angularTolerance=.1)
        mesh=inspect_binary_stl(out)
        assert mesh['watertight'] and sum(v>1e-3 for v in mesh['component_volumes_mm3'])==1 and mesh['signed_volume_mm3']>0
