"""Surgical HW2 split-release correction; retain existing syllabus formatting."""
from pathlib import Path
from docx import Document

root=Path(__file__).resolve().parents[1]
path=root/'docs/MIE_446_Aerospace_Structures_Fall_2026_Syllabus_Updated.docx'
doc=Document(path)
replacements={
 'Wing construction starts Oct. 13 only for released teams; HW 2 due Sunday, Oct. 18, 2026.':
 'Wing construction starts Oct. 13 only for released teams; HW 2A (Parts 1 and 3, 35 points) due Oct. 20.',
 'No HW 2 deadline this week; due Oct. 18.':
 'HW 2B (Parts 2, 4 and 5, 65 points) due Nov. 5.',
 'Oct. 18, 2026':'HW 2A: Oct. 20; HW 2B: Nov. 5, 2026',
 'Choose the model: 2D/3D stress transformation, principal stresses, constitutive assumptions and validity':
 'HW 2A: Lilienthal evidence and side-force geometry (35 points). HW 2B: integration, elevon mixing and local load paths (65 points).',
}
paragraphs=list(doc.paragraphs)+[p for t in doc.tables for row in t.rows for cell in row.cells for p in cell.paragraphs]
count=0
seen=set()
for p in paragraphs:
 if p._p in seen: continue
 seen.add(p._p)
 old=p.text
 if old in replacements:
  new=replacements[old]
  if p.runs:
   p.runs[0].text=new
   for run in p.runs[1:]: run.text=''
  else:p.add_run(new)
  count+=1
assert count in (1,4), count
alltext='\n'.join(p.text for p in paragraphs)
assert 'Oct. 18' not in alltext and 'October 18' not in alltext
doc.save(path)
print('Updated three syllabus locations; original layout/styles retained.')
