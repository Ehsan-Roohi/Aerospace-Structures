"""Package only released student files; never traverse instructor folders."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'assignments/homework-03'
files=['MIE446_HW3_Three_Beams.docx','MIE446_HW3_Three_Beams.pdf','cross_section.png','three_beams.png']
with ZipFile(folder/'MIE446_HW3_Student_Pack.zip','w',ZIP_DEFLATED) as z:
    readme=(folder/'README.md').read_text(encoding='utf-8').replace('../../notebooks/MIE446_HW3_Three_Beams.ipynb','MIE446_HW3_Three_Beams.ipynb')
    z.writestr('README.md',readme)
    for f in files:z.write(folder/f,f)
    z.write(ROOT/'notebooks/MIE446_HW3_Three_Beams.ipynb','MIE446_HW3_Three_Beams.ipynb')
with ZipFile(folder/'MIE446_HW3_Student_Pack.zip') as z:
    assert len(z.namelist())==6 and not any('solution' in n.lower() for n in z.namelist())
print('HW 3 student package built from six-file whitelist; no solutions.')
