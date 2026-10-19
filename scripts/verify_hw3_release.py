"""Check public release identity and protect the instructor solution boundary."""
from pathlib import Path
from zipfile import ZipFile
import json
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'assignments/homework-03'
assert not any('solution' in p.name.lower() for p in folder.iterdir())
nb=json.loads((ROOT/'notebooks/MIE446_HW3_Three_Beams.ipynb').read_text(encoding='utf-8'))
assert all(c['cell_type']=='markdown' for c in nb['cells'])
student='\n'.join(''.join(c['source']) for c in nb['cells'])
assert 'HW 2B' not in student
assert all('beamCase=hw3-'+n in student for n in ['cantilever','roller-pin','fixed'])
assert all(x not in student for x in ['5.005646','0.533272','0.0711029','-20.25','−20.25'])
with ZipFile(folder/'MIE446_HW3_Student_Pack.zip') as z:
    assert len(z.namelist())==6 and not any('solution' in n.lower() for n in z.namelist())
with ZipFile(folder/'MIE446_HW3_Three_Beams.docx') as z:
    doc=ET.fromstring(z.read('word/document.xml'))
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    text='\n'.join(doc.itertext())
    assert 'HW 3' in text and 'November 5, 2026' in text
    assert 'Left roller / Right pin' in text and 'Include self-weight unchecked' in text
    assert 'l03-centre' not in z.read('word/_rels/document.xml.rels').decode()
for f in ['README.md','ASSIGNMENTS.md','SYLLABUS.md','notebooks/README.md']:
    text=(ROOT/f).read_text(encoding='utf-8')
    assert 'HW 2B' not in text, f
print('HW 3 release checks pass: numbering, deadline, support setup, correct links, blank student notebook, private-solution exclusion.')
