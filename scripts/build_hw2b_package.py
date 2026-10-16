"""Package only the current student-facing HW2B materials."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
folder=root/'assignments/homework-02/HW2B'
names=['README.md','MIE446_HW2B_Lilienthal_Wing_Beam_Analysis.docx','MIE446_HW2B_Lilienthal_Wing_Beam_Analysis.pdf','lilienthal_member_models.svg','STUDY_RECORD_TEMPLATE.csv']
for name in names:assert (folder/name).is_file(),name
target=folder.parent/'MIE446_HW2B_Student_Pack.zip'
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
 for name in names:archive.write(folder/name,'MIE446_HW2B_Student_Pack/'+name)
with ZipFile(target) as archive:
 assert archive.testzip() is None
 assert len(archive.namelist())==len(names)
 assert not any('HW3' in name or 'SOLUTION' in name for name in archive.namelist())
print(target)
