"""Execute the actual notebook cells; only Colab transport and plot display are mocked.

CAD, validation, STL/3MF creation and archive hashing are real. QA records below
are synthetic software-test data, never physical coupon evidence.
"""
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys
import tempfile
import types
from zipfile import ZipFile

import numpy as np
import pytest

from mie446_wing import (WingDesign, WingProject, WingProjectError,
    WingLabImportError, load_wing_lab_study, make_ai_log,
    plot_design_overview, plot_modules)

ROOT = Path(__file__).parents[1]


def cells():
    notebook = json.loads((ROOT/'notebooks/MIE446_Code_to_Print_Wing.ipynb').read_text(encoding='utf-8'))
    return [''.join(c['source']) for c in notebook['cells'] if c['cell_type']=='code']


def environment():
    messages, downloads = [], []
    env = dict(date=date, Path=Path, tempfile=tempfile, COURSE_RELEASE='v1.3.0',
        WingDesign=WingDesign, WingProject=WingProject, WingProjectError=WingProjectError,
        WingLabImportError=WingLabImportError, load_wing_lab_study=load_wing_lab_study,
        make_ai_log=make_ai_log, plot_design_overview=plot_design_overview,
        plot_modules=plot_modules, Markdown=lambda s:s, display=messages.append,
        download_in_colab=downloads.append)
    return env, messages, downloads


@pytest.mark.parametrize('present', [{}, {'PRINTER_X_MM':280},
    {'PRINTER_X_MM':300,'PRINTER_Y_MM':500,'PRINTER_Z_MM':300}])
def test_upload_with_old_form_never_raises_printer_name_error(tmp_path, present):
    source=tmp_path/'wing.json'
    doc=json.loads((ROOT/'tests/fixtures/wing_lab_course_browser.json').read_text(encoding='utf-8'))
    source.write_text(json.dumps(doc),encoding='utf-8')
    env,messages,_=environment()
    env.update(DESIGN_SOURCE='Wing Lab JSON',WING_LAB_JSON_FILE=str(source),TEAM_ID='QA',REVISION='R01',**present)
    exec(compile(cells()[2],'notebook upload','exec'),env)
    assert env['project'] is not None
    expected=tuple(present.get(f'PRINTER_{axis}_MM',300) for axis in 'XYZ')
    assert env['project'].parameters.printer_build_volume_mm==expected
    assert env['project'].parameters.semi_span_mm==450
    assert env['project'].parameters.module_count==3
    assert len(env['project'].parameters.spars)==2
    if len(present)<3:
        assert any('missing axes use **300 mm**' in m for m in messages)


def test_wrong_filename_gives_upload_instructions_not_traceback():
    env,messages,_=environment()
    env.update(DESIGN_SOURCE='Wing Lab JSON',WING_LAB_JSON_FILE='Ehsan',TEAM_ID='QA',REVISION='R01')
    exec(compile(cells()[2],'notebook upload','exec'),env)
    assert env['project'] is None
    assert any('Copy path' in m and 'Leave WING_LAB_JSON_FILE empty' in m for m in messages)


def test_uploaded_course_example_still_requires_a_real_rod_fit_record(tmp_path):
    source=tmp_path/'course.json'
    source.write_bytes((ROOT/'tests/fixtures/wing_lab_course_browser.json').read_bytes())
    env,messages,downloads=environment()
    sources=cells()
    exec(compile(sources[1].replace('DESIGN_SOURCE = "Student form"','DESIGN_SOURCE = "Wing Lab JSON"'),'form','exec'),env)
    env.update(WING_LAB_JSON_FILE=str(source),WORKFLOW_STAGE='Final Wing',TEAM_ID='QA',TEAM_MEMBERS='Software QA only')
    for index in (2,4,5,6):
        exec(compile(sources[index],'notebook cell','exec'),env)
    assert env['project'] is not None
    assert not env['coupon_ready'] and env['built_project'] is None
    assert any('physical coupon record' in m for m in messages)
    assert not downloads,'missing physical evidence must not produce a final package'


def mesh_summary(path):
    """Independent binary-STL check; no mesh repair or geometry substitution."""
    raw=path.read_bytes()
    count=struct.unpack_from('<I',raw,80)[0]
    assert len(raw)==84+50*count
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attribute','<u2')])
    triangles=np.frombuffer(raw,offset=84,count=count,dtype=dtype)['vertices'].astype(float)
    assert np.isfinite(triangles).all()
    vertices,indices=np.unique(triangles.reshape(-1,3),axis=0,return_inverse=True)
    faces=indices.reshape(-1,3)
    edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    _,edge_counts=np.unique(np.sort(edges,axis=1),axis=0,return_counts=True)
    assert (edge_counts==2).all(),'STL must be closed and edge-manifold without repair'
    parents=list(range(len(vertices)))
    def find(i):
        while parents[i]!=i:
            parents[i]=parents[parents[i]]
            i=parents[i]
        return i
    for a,b in edges:
        parents[find(int(a))]=find(int(b))
    # A closed hollow solid has a positive exterior boundary and negative cavity
    # boundaries. Surface connectivity alone would misclassify cavities as parts.
    component_ids=np.array([find(int(f[0])) for f in faces])
    face_volumes=np.einsum('ij,ij->i',triangles[:,0],np.cross(triangles[:,1],triangles[:,2]))/6
    shell_volumes=[float(face_volumes[component_ids==i].sum()) for i in np.unique(component_ids)]
    volume=float(sum(shell_volumes))
    assert sum(v>0 for v in shell_volumes)==1,'only one exterior solid boundary is allowed'
    assert all(abs(v)>1e-6 for v in shell_volumes),'zero-volume mesh shell'
    assert volume>0,'STL orientation must give positive volume'
    return dict(triangles=count,boundary_shells=len(shell_volumes),shell_volumes_mm3=shell_volumes,volume_mm3=volume,
        extents_mm=np.ptp(vertices,axis=0).tolist(),sha256=sha256(raw).hexdigest())


@pytest.mark.slow
@pytest.mark.parametrize('fixture_name,expected_span,expected_ribs,expected_spars',[
    ('wing_lab_one_piece_browser.json',250,3,1),
    ('wing_lab_station_browser.json',180,2,2),
],ids=['legacy-v1','station-v2'])
def test_notebook_upload_through_final_zip_one_connected_piece(tmp_path, monkeypatch,fixture_name,expected_span,expected_ribs,expected_spars):
    from plotly.basedatatypes import BaseFigure
    monkeypatch.setattr(BaseFigure,'show',lambda self,*a,**kw:None)
    # Legacy live-site download and v2 real browser-serializer interoperability fixture.
    doc=json.loads((ROOT/'tests/fixtures'/fixture_name).read_text(encoding='utf-8'))
    source=tmp_path/'WingLab.json'
    source.write_text(json.dumps(doc),encoding='utf-8')
    # Exercise the blank-field upload branch, not just a prefilled filename.
    colab=types.ModuleType('google.colab')
    colab.files=types.SimpleNamespace(upload=lambda:{str(source):source.read_bytes()})
    monkeypatch.setitem(sys.modules,'google.colab',colab)
    env,messages,downloads=environment()
    sources=cells()
    form=sources[1].replace('DESIGN_SOURCE = "Student form"','DESIGN_SOURCE = "Wing Lab JSON"')
    exec(compile(form,'notebook form','exec'),env)
    env.update(WORKFLOW_STAGE='Final Wing',TEAM_ID='QA',TEAM_MEMBERS='Automated QA only; not a student submission',
        AIRFOIL_CHOICE_REASON='Software QA of imported NACA 2412; no flight claim.',
        PREDICTED_AREA_CHANGE='decrease',PREDICTED_ASPECT_RATIO_CHANGE='increase',
        PREDICTION_EXPLANATION='With fixed span, reducing tip chord reduces area and increases aspect ratio.',
        RESULT_INTERPRETATION='QA checks CAD inventory and file integrity, not structural capacity.',
        PRINT_DEFECT_CODE_CANNOT_DETECT='Layer adhesion and extrusion defects need physical inspection.',
        AI_USE_DECLARATION='Material AI used',AI_TOOL='Codex',AI_PURPOSE='Software regression test',
        AI_AFFECTED_ITEM='Synthetic QA form, not student work',STUDENT_CHANGE_TO_AI_OUTPUT='Not applicable: automated QA only',
        INDEPENDENT_CHECK='Binary STL topology, dimensions, provenance and archive hashes',
        AI_ERROR_OR_LIMITATION='No physical print, coupon or flight validation')
    for source_code in sources[2:]:
        exec(compile(source_code,'notebook cell','exec'),env)
    assert env['project'] is not None, messages
    assert env['coupon_ready'] and env['coupon_record']['required'] is False
    assert env['built_project'] is not None,messages
    assert len(downloads)==1,messages
    package=env['submission']
    assert package.archive_path==downloads[0]
    with ZipFile(package.archive_path) as archive:
        assert archive.testzip() is None
        names=archive.namelist()
        assert sum(n.endswith('.stl') for n in names)==1
        assert sum(n.endswith('.3mf') for n in names)==1
        provenance=json.loads(archive.read('wing_lab_transfer.json'))
        assert provenance['source_document']==doc
        assert provenance['sha256']==sha256(source.read_bytes()).hexdigest()
        assert not any('Coupon' in n for n in names)
        for record in package.manifest['files']:
            data=archive.read(record['name'])
            assert len(data)==record['bytes']
            assert sha256(data).hexdigest()==record['sha256']
    build=env['built_project'].build
    assert len(build.modules)==1 and len(build.complete.Solids())==1
    assert len(build.ribs)==expected_ribs and len(build.bonded_spars)==expected_spars
    stl=next(package.output_dir.glob('*.stl'))
    summary=mesh_summary(stl)
    # NACA normal-offset/camber geometry can extend slightly ahead of x=0;
    # compare the mesh with actual CAD bounds, not nominal chord as a box size.
    # Use the exact-surface optimal box: the default OCC spline-control-net box
    # is intentionally looser and is not the physical surface dimension.
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    bounds=Bnd_Box()
    BRepBndLib.AddOptimal_s(build.modules[0].wrapped,bounds,False,False)
    box=bounds.Get()
    exact_extents=[box[i+3]-box[i] for i in range(3)]
    assert summary['extents_mm']==pytest.approx(exact_extents,abs=.08)
    assert summary['extents_mm'][1]==pytest.approx(expected_span,abs=.01)
    assert summary['volume_mm3']==pytest.approx(build.modules[0].Volume(),rel=.01)
    for mf in package.output_dir.glob('*.3mf'):
        with ZipFile(mf) as archive:
            model=next(n for n in archive.namelist() if n.endswith('.model'))
            assert 'unit="millimeter"' in archive.read(model).decode()
