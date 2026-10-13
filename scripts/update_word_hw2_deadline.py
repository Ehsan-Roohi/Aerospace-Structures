"""Change only three syllabus table texts; preserve all other DOCX contents."""
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'docs/MIE_446_Aerospace_Structures_Fall_2026_Syllabus_Updated.docx'
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
replacements={
    'Wing construction starts Oct. 13 only for released teams.':'Wing construction starts Oct. 13 only for released teams; HW 2 due Sunday, Oct. 18, 2026.',
    'HW 2 due Nov. 5.':'No HW 2 deadline this week; due Oct. 18.',
    '<w:t>Nov. 5</w:t>':'<w:t>Oct. 18, 2026</w:t>',
}
with ZipFile(PATH) as source:
    infos=source.infolist();members={i.filename:source.read(i.filename) for i in infos}
xml=members['word/document.xml'].decode('utf-8')
before=etree.fromstring(xml.encode())
old_texts=[''.join(p.itertext()) for p in before.findall('.//w:p',NS)]
for old,new in replacements.items():
    assert xml.count(old)==1,(old,xml.count(old))
    xml=xml.replace(old,new)
after=etree.fromstring(xml.encode())
new_texts=[''.join(p.itertext()) for p in after.findall('.//w:p',NS)]
changes=[(a,b) for a,b in zip(old_texts,new_texts) if a!=b]
assert len(old_texts)==len(new_texts) and len(changes)==3
assert 'HW 2 due Nov. 5.' not in new_texts
tables=after.findall('.//w:tbl',NS)
hw2=[]
for table in tables:
    for row in table.findall('w:tr',NS):
        cells=[''.join(c.itertext()) for c in row.findall('w:tc',NS)]
        if cells and cells[0]=='HW 2':hw2.append(cells)
assert len(hw2)==1 and hw2[0][-1]=='Oct. 18, 2026'
members['word/document.xml']=xml.encode('utf-8')
with ZipFile(PATH,'w') as out:
    for info in infos:out.writestr(info,members[info.filename])
with ZipFile(PATH) as check:
    assert check.testzip() is None
    for name,data in members.items():assert check.read(name)==data
    assert etree.tostring(before.find('w:body',NS).find('w:sectPr',NS))==etree.tostring(after.find('w:body',NS).find('w:sectPr',NS))
for old,new in changes:print('CHANGED:',old,'->',new)
print('PASS: exactly three paragraphs changed; dates validated; ZIP integrity and all other members preserved.')
