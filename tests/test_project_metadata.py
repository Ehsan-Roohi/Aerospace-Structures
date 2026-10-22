"""Fast metadata/export orchestration tests; no CAD construction or solver runs."""
import json
from pathlib import Path
from types import SimpleNamespace
import importlib

import pytest

from mie446_wing import WingLabImportError, import_wing_lab_study, WingProject, WingDesign
from mie446_wing.project_metadata import normalize_project_name, safe_project_stem

FIXTURE = Path(__file__).parent / 'fixtures/wing_lab_course_browser.json'


@pytest.fixture
def doc():
    return json.loads(FIXTURE.read_text(encoding='utf-8'))


def test_named_import_retains_label_source_and_unchanged_geometry(doc):
    baseline=import_wing_lab_study(json.dumps(doc))
    doc['projectName']='  بال تیم یک  '
    imported=import_wing_lab_study(json.dumps(doc))
    assert imported.parameters==baseline.parameters
    assert imported.source_record['project_name']=='بال تیم یک'
    assert imported.source_record['source_document']==doc
    assert imported.source_record['sha256']!=baseline.source_record['sha256']
    project=WingProject(WingDesign(),imported_parameters=imported.parameters,source_record=imported.source_record)
    assert project.project_name=='بال تیم یک'
    assert 'بال تیم یک' in imported.to_markdown()
    assert 'project_name' not in baseline.source_record


@pytest.mark.parametrize('name',[None,1,True,[],{},'x'*81,'x\nname','x\x00name','x\x85name','x\u202ename','x\u2066name','\ud800'])
def test_invalid_names_fail_without_partial_import(doc,name):
    doc['projectName']=name
    with pytest.raises(WingLabImportError,match='projectName'):
        import_wing_lab_study(json.dumps(doc))


@pytest.mark.parametrize('value',[None,0,1,'true',{},[]])
def test_empty_marker_is_strict_boolean(doc,value):
    doc['emptyStudy']=value
    with pytest.raises(WingLabImportError,match='emptyStudy'):
        import_wing_lab_study(json.dumps(doc))


def test_empty_native_study_never_becomes_default_printable_wing(doc):
    doc['emptyStudy']=True
    with pytest.raises(WingLabImportError,match='Create a wing first'):
        import_wing_lab_study(json.dumps(doc))
    doc['emptyStudy']=False
    assert import_wing_lab_study(json.dumps(doc)).parameters.semi_span_mm==450


def test_literal_display_and_safe_filenames(doc):
    doc['projectName']='<script>alert(1)</script> ** [link](evil)'
    imported=import_wing_lab_study(json.dumps(doc))
    assert '<script>' not in imported.to_markdown()
    assert '&lt;script&gt;' in imported.to_markdown()
    assert safe_project_stem('بال تیم یک')=='بال-تیم-یک'
    assert safe_project_stem('../CON/../../x')=='CON-x'
    assert safe_project_stem('../..')=='wing'
    for name in ['CON','prn','AUX','nul','COM1','lpt9']:
        assert safe_project_stem(name).startswith('wing-')
    assert normalize_project_name('🛩'*40)=='🛩'*40
    with pytest.raises(ValueError):normalize_project_name('🛩'*41)


def test_named_export_metadata_and_safe_paths_without_cad(doc,tmp_path,monkeypatch):
    """Only export orchestration is mocked; this does not certify a physical CAD shape."""
    module=importlib.import_module('mie446_wing.export')
    doc['projectName']='../بال تیم یک/..'
    imported=import_wing_lab_study(json.dumps(doc))
    from dataclasses import replace
    p=replace(imported.parameters,spars=())
    fake_report=SimpleNamespace(raise_for_failure=lambda:None,to_json=lambda path:path.write_text('{}',encoding='utf-8'))
    monkeypatch.setattr(module,'validate_wing',lambda build:fake_report)
    monkeypatch.setattr(module,'adaptive_volume',lambda shape:1000)
    monkeypatch.setattr(module,'_export_shape',lambda shape,path:path.write_bytes(b'export-placeholder-for-orchestration-test'*4))
    build=SimpleNamespace(parameters=p,complete=object(),modules=[object()],metrics=SimpleNamespace(to_dict=lambda:{}),bonded_spars=[])
    output=tmp_path/'files'
    manifest=module.export_build(build,output,ai_log=[],student_record={'wing_lab_import':imported.source_record})
    assert manifest['project_name']=='../بال تیم یک/..'
    shape_names=[r['name'] for r in manifest['files'] if Path(r['name']).suffix in ('.stl','.3mf','.step')]
    assert len(shape_names)==3
    assert all('_بال-تیم-یک_' in n and '/' not in n and '..' not in n for n in shape_names)
    transfer=json.loads((output/'wing_lab_transfer.json').read_text(encoding='utf-8'))
    assert transfer['project_name']==manifest['project_name']
    archive=module.make_verified_archive(output)
    assert archive.is_file()
    assert all(path.parent==output for path in output.iterdir())


def test_bad_export_name_rejected_before_creating_destination(tmp_path):
    module=importlib.import_module('mie446_wing.export')
    output=tmp_path/'must-not-exist'
    with pytest.raises(ValueError,match='projectName'):
        module.export_build(None,output,ai_log=[],project_name='bad\nname')
    assert not output.exists()


def test_notebook_project_facade_uses_named_safe_package_path(doc,tmp_path,monkeypatch):
    """The high-level notebook export passes metadata without a notebook-cell edit."""
    workflow=importlib.import_module('mie446_wing.student_workflow')
    doc['projectName']='../بال تیم یک/..'
    imported=import_wing_lab_study(json.dumps(doc))
    project=WingProject(WingDesign(),team_id='Team01',revision='R02',imported_parameters=imported.parameters,source_record=imported.source_record)
    built=workflow.BuiltWingProject(project,SimpleNamespace(parameters=project.parameters),None,None)
    captured={}
    def export_stub(build,destination,**kwargs):
        captured.update(destination=destination,**kwargs)
        return {'project_name':kwargs['project_name']}
    monkeypatch.setattr(workflow,'export_build',export_stub)
    monkeypatch.setattr(workflow,'make_verified_archive',lambda destination:destination.with_suffix('.zip'))
    monkeypatch.setattr(workflow,'plot_design_overview',lambda p:SimpleNamespace(to_html=lambda **kw:'<html>test</html>'))
    monkeypatch.setattr(workflow.BuiltWingProject,'design_summary',lambda *args:'metadata workflow test')
    package=built.export_submission(tmp_path,ai_log=[])
    assert package.output_dir.parent==tmp_path
    assert package.output_dir.name=='MIE446_Team01_بال-تیم-یک_R02'
    assert package.archive_path.name=='MIE446_Team01_بال-تیم-یک_R02.zip'
    assert captured['project_name']==doc['projectName']
    assert captured['student_record']['wing_lab_import']['source_document']==doc
