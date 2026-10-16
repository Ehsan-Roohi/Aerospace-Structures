"""Build the three-case HW2B handout and its load diagram."""
import argparse
import re
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle, Circle

root = Path(__file__).resolve().parents[1]
source = root / 'assignments/homework-02/HW2B'
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
out = parser.parse_args().out
out.mkdir(parents=True, exist_ok=True)
stem = 'MIE446_HW2B_Three_Beams'

fig, axes = plt.subplots(3, 1, figsize=(10, 5.4))
for ax, title, ends, load in zip(
    axes,
    ['1  Cantilever', '2  Left roller and right pin', '3  Fixed–fixed'],
    [('fixed', None), ('roller', 'pin'), ('fixed', 'fixed')],
    [(0, 1), (.5, 1), (1, 0)]
):
    ax.set(xlim=(-.16, 1.22), ylim=(-.48, .70))
    ax.axis('off')
    ax.text(-.14, .59, title, fontsize=13, weight='bold')
    ax.plot([0, 1], [0, 0], color='#173b58', lw=3)
    for x, kind in zip([0, 1], ends):
        if kind == 'fixed':
            ax.add_patch(Rectangle((x-.023, -.15), .046, .30,
                                   facecolor='#d2d8dd', edgecolor='#344957', hatch='///'))
        elif kind:
            ax.add_patch(Polygon([[x, -.015], [x-.065, -.14], [x+.065, -.14]],
                                 facecolor='#edf3ee', edgecolor='#216343', lw=1.5))
            ground = -.15
            if kind == 'roller':
                for dx in [-.032, .032]:
                    ax.plot(x+dx, -.166, 'o', ms=6.5, mfc='white',
                            mec='#216343', mew=1.3)
                ground = -.195
            ax.plot([x-.09, x+.09], [ground, ground], color='#344957', lw=1.1)
    ax.plot([0, 1], [.43*load[0], .43*load[1]], color='#984626', lw=1.5)
    for i in range(13):
        x = i/12
        height = .43*(load[0] + (load[1]-load[0])*x)
        if height > .015:
            ax.annotate('', xy=(x, .014), xytext=(x, height),
                        arrowprops=dict(arrowstyle='-|>', color='#984626', lw=1))
    for x, value, align in [(0, load[0], 'left'), (1, load[1], 'right')]:
        ax.text(x, max(.43*value+.045, .18), f'{.002*value:.3f} N/mm',
                ha=align, fontsize=11, color='#78351d')
    ax.annotate('', xy=(0, -.29), xytext=(1, -.29),
                arrowprops=dict(arrowstyle='<->', lw=.9, color='#344957'))
    ax.text(.5, -.28, 'L = 450 mm', ha='center', va='bottom', fontsize=10,
            bbox=dict(facecolor='white', edgecolor='none', pad=1))
    ax.text(0, -.43, 'x = 0', ha='center', fontsize=9)
    ax.text(1, -.43, 'x = L', ha='center', fontsize=9)
fig.tight_layout(h_pad=.6)
fig.savefig(source/'three_beams.svg', bbox_inches='tight')
svg_path = source/'three_beams.svg'
svg_path.write_text('\n'.join(line.rstrip() for line in svg_path.read_text(encoding='utf-8').splitlines())+'\n', encoding='utf-8')
fig.savefig(out/'three_beams.png', dpi=220, bbox_inches='tight')
plt.close(fig)

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.top_margin = sec.bottom_margin = Inches(.65)
sec.left_margin = sec.right_margin = Inches(.7)
for name, size in [('Normal', 11), ('Title', 21), ('Heading 1', 13)]:
    style = doc.styles[name]
    style.font.name = 'Times New Roman'
    style.font.size = Pt(size)
    style.font.color.rgb = RGBColor(0, 0, 0)
    for element in list(style.element.iter()):
        if element.tag == qn('w:pBdr'):
            element.getparent().remove(element)
doc.styles['Normal'].paragraph_format.space_after = Pt(5)
doc.styles['Normal'].paragraph_format.line_spacing = 1.02
doc.core_properties.title = 'HW 2B Three beams under distributed loads'
doc.core_properties.author = 'Dr. Ehsan Roohi Golkhatmi'

def inline(paragraph, text):
    for token in re.split(r'(\[[^\]]+\]\([^)]+\)|\*\*.*?\*\*)', text):
        match = re.fullmatch(r'\[([^\]]+)\]\(([^)]+)\)', token)
        if match:
            label, url = match.groups()
            link = OxmlElement('w:hyperlink')
            link.set(qn('r:id'), paragraph.part.relate_to(url, RT.HYPERLINK, is_external=True))
            run = OxmlElement('w:r')
            value = OxmlElement('w:t')
            value.text = label
            run.append(value)
            link.append(run)
            paragraph._p.append(link)
        else:
            run = paragraph.add_run(token[2:-2] if token.startswith('**') else token)
            run.bold = token.startswith('**')

for block in re.split(r'\n\s*\n', (source/'README.md').read_text(encoding='utf-8').strip()):
    if block.startswith('**Download the handout:**'):
        continue
    if block.startswith('# '):
        doc.add_paragraph(block[2:], style='Title')
    elif block.startswith('## '):
        doc.add_heading(block[3:], level=1)
    elif block.startswith('!['):
        p = doc.add_paragraph()
        p.alignment = 1
        p.add_run().add_picture(str(out/'three_beams.png'), width=Inches(6.7))
    elif re.match(r'(- |\d+\. )', block):
        for line in block.splitlines():
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(.18)
            p.paragraph_format.first_line_indent = Inches(-.12)
            inline(p, '• '+line[2:] if line.startswith('- ') else line)
    else:
        inline(doc.add_paragraph(), block.replace('\n', ' '))
footer = sec.footer.paragraphs[0]
footer.alignment = 2
footer.add_run('MIE 446  •  HW 2B  •  ')
field = OxmlElement('w:fldSimple')
field.set(qn('w:instr'), 'PAGE')
footer._p.append(field)
doc.save(out/(stem+'.docx'))
print(out/(stem+'.docx'))
