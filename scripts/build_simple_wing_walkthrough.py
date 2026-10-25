from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/MIE446_Simple_Wing_Walkthrough.pdf'
pdfmetrics.registerFont(TTFont('TimesNewRoman','C:/Windows/Fonts/times.ttf'))
pdfmetrics.registerFont(TTFont('TimesNewRomanBold','C:/Windows/Fonts/timesbd.ttf'))
pdfmetrics.registerFontFamily('TimesNewRoman',normal='TimesNewRoman',bold='TimesNewRomanBold')
styles={
 'title':ParagraphStyle('title',fontName='TimesNewRomanBold',fontSize=21,leading=25,spaceAfter=8,textColor='#000000'),
 'sub':ParagraphStyle('sub',fontName='TimesNewRoman',fontSize=11,leading=14,spaceAfter=13,textColor='#000000'),
 'h':ParagraphStyle('h',fontName='TimesNewRomanBold',fontSize=15,leading=19,spaceBefore=10,spaceAfter=7,textColor='#000000',keepWithNext=True),
 'body':ParagraphStyle('body',fontName='TimesNewRoman',fontSize=11.5,leading=15.2,spaceAfter=8,textColor='#000000'),
 'small':ParagraphStyle('small',fontName='TimesNewRoman',fontSize=10,leading=13,spaceAfter=7,textColor='#000000'),
}
URL='https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#wing'
pages=[[
 ('title','Design and print your wing'),
 ('sub','MIE 446 Aerospace Structures | Student walkthrough'),
 ('body','Design, analyze and download the STL in <b>Wing Lab</b>. Prepare it in <b>OrcaSlicer</b>, then print and assemble it with staff approval. A semi-wing is sufficient; <b>Full wing mirror</b> is optional.'),
 ('body',f'<b>Open Wing Lab:</b> <link href="{URL}" color="black">ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#wing</link>'),
 ('h','1  Wing Lab design analysis and STL'),
 ('body','<b>Start with geometry.</b> Name the project with your team and revision. In <b>Airfoils &amp; planform</b>, a suggested starting point is NACA 2412 at root eta = 0 and NACA 0012 at tip eta = 1, taper ratio 0.7, and zero sweep, dihedral and incidence. Wing span may be 350 to 600 mm. You may change these suggested geometry choices. Check whether a span control refers to the full span or the semi-span.'),
 ('body','<b>Set structure and materials.</b> Use a skin thickness of 1 to 2 mm and choose your ribs. Use the same material for the spar and the rest of the wing. Keep the final plastic mass at or below <b>300 g</b>. The printer envelope is <b>300 x 300 x 300 mm</b>: choose one module only if the actual CAD fits, or use two or three modules.'),
 ('body','<b>Compare three layouts.</b> Prepare a wing with no spar, then a full-span bonded spar at <b>x/c = 0.25</b>, then the same spar at <b>x/c = 0.40</b>. Keep the geometry, material, spar dimensions and load identical apart from the spar location. Use the fixed root support. <b>For multiple modules, select bonded seams to match the bonded assembly.</b>'),
 ('body','<b>Apply the analysis load.</b> Use an upward distributed lift of <b>5 N total</b> at <b>x/c = 0.25</b>, and enable <b>Include wing self-weight</b>. As an alternative, the aircraft-mass option with <b>1 kg</b> and <b>n = 1</b> gives <b>4.905 N per semi-wing</b>; set wing inertia relief to <b>Ignored</b> when using explicit self-weight. Use the same choice for all three layouts.'),
 ('body','<b>Solve each layout.</b> Review the warnings and record semi-wing mass, downward weight, tip displacement, tip twist and maximum nominal stress. Compare the three layouts and justify the design you select. The prescribed lift is an input: Wing Lab does not calculate lift automatically from your airfoil choices.'),
 ('small','Analysis limits: the reported response is a nominal beam approximation. Local buckling, layer bonding, joints and stress concentrations require additional checks. Keep the physical wing unloaded; this is a non-flying fabrication model.'),
 ],[
 ('h','Download STL in Wing Lab'),
 ('body','Solve the selected design, then click <b>Download STL</b> in Wing Lab. The download uses the <b>undeformed geometry</b>, including skin, ribs, integral spars and any rod sleeves or holes. Review the mesh, printed-plastic mass and printer-envelope checks.'),
 ('body','For <b>one module</b>, download one STL file. For <b>two or three modules</b>, download the ZIP and extract the module STL files. If a check fails, correct the stated dimensions, thickness or interface and rebuild. The app does not automatically scale your wing.'),
 ('body','If you use external rods, complete the physical fit-coupon test first. Enter its reference and confirm that rod diameter, clearance and print process match. Keep the coupon record and photographs. A wing without external rods does not need a rod-fit record.'),
 ('body','You can download the STL directly from Wing Lab. An editable study backup is useful if you want to revise the design later.'),
 ('h','2  Prepare the print in OrcaSlicer'),
 ('body','Import the STL for every module into <b>OrcaSlicer</b>. Use the assigned <b>Creality K2 Pro</b>, <b>0.4 mm nozzle</b> and <b>staff-approved PLA Pro profile</b>. Confirm millimetres, <b>100% scale</b> and the actual dimensions.'),
 ('body','Choose the orientation and check bed contact, supports or brim clearance, and every sliced layer. Record the estimated mass and print time. Save the slicer project. STL stores geometry; OrcaSlicer generates printer-specific instructions after slicing.'),
 ('h','3  Print assemble and document'),
 ('body','Obtain staff approval before printing. Follow the assigned printer procedure and supervise the first layers. Assemble the modules and any reinforcement as designed. Keep the completed wing unloaded and do not fly it.'),
 ('body','Measure semi-span, root chord, tip chord and actual mass. Record the fit of rods and module joints, if present. Photograph the finished parts and assembly.'),
 ('body','Keep your STL files, slicer project, photographs and short comparison report under the same team and revision. In the report, state your design basis, load magnitude, direction, distribution and chord position, displacement target, and whether it was met. Include screenshots of the load and result; give force in N and line-load intensity in N/mm.'),
 ('small','Please submit a short PDF report with images from Wing Lab and photos of the fabricated wing. Staff approval and the assigned printer procedure remain required.'),
 ]]

c=canvas.Canvas(str(OUT),pagesize=(612,792))
c.setTitle('MIE 446 Simple Wing Walkthrough')
c.setAuthor('MIE 446 Aerospace Structures')
c.setSubject('Wing Lab direct STL design analysis slicing and printing')
for i,items in enumerate(pages,1):
    story=[Paragraph(t,styles[s]) for s,t in items]
    f=Frame(49,49,514,698,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
    f.addFromList(story,c)
    if story:raise RuntimeError(f'Page {i} overflow: {len(story)} blocks')
    c.setFont('TimesNewRoman',9);c.setFillColorRGB(0,0,0)
    c.drawString(49,30,'MIE 446 Aerospace Structures')
    c.drawRightString(563,30,f'{i} / {len(pages)}')
    c.showPage()
c.save()
r=PdfReader(OUT)
assert len(r.pages)==2
text=' '.join(p.extract_text() for p in r.pages)
for banned in ['Colab','notebook','transfer JSON','+0.1 N']:
    assert banned not in text,banned
assert '5 N total' in text and '4.905 N per semi-wing' in text
print(OUT)
