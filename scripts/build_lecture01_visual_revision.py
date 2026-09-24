"""Reproducible educational figures; FAA crops retain original artwork and labels.

Run with the bundled Python (pypdfium2) after downloading FAA chapter 6 to
tmp/lecture01-figures/faa-ch6.pdf. SVGs are rendered to PNG with Sharp separately.
"""
from pathlib import Path
from html import escape
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets/lecture01'
TMP = ROOT / 'tmp/lecture01-figures'
BLUE, INK, RED, GREEN, GRAY = '#176a91', '#17324d', '#b62f3b', '#237653', '#657781'


def extract_faa():
    doc = pdfium.PdfDocument(str(TMP / 'faa-ch6.pdf'))
    # Bounds selected on full-page renders at scale 1.3; only the figure is extracted.
    crops = [
        (2, (92, 475, 404, 849), 'FAA_6_4_Control_Axes.png'),
        (3, (369, 57, 681, 242), 'FAA_6_6_Aileron_Deflection.png'),
        (4, (415, 650, 729, 888), 'FAA_6_10_Elevator_Pitch.png'),
        (7, (44, 594, 360, 906), 'FAA_6_15_Rudder_Yaw.png'),
    ]
    for page_index, bounds, name in crops:
        page = doc[page_index]
        w, h = page.get_size()
        x0, y0, x1, y1 = [v / 1.3 for v in bounds]
        bitmap = page.render(scale=3.5, crop=(x0, h-y1, w-x1, y0))
        bitmap.to_pil().save(OUT / name)


class Figure:
    def __init__(self, height, title, description):
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{height}" viewBox="0 0 1200 {height}" role="img" aria-labelledby="title desc">',
                      f'<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>',
                      '<defs>' + ''.join(f'<marker id="{c}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="{v}"/></marker>' for c,v in [('blue', BLUE),('red',RED),('gray',GRAY),('green',GREEN)]) + '</defs>',
                      f'<rect width="1200" height="{height}" fill="white"/><g font-family="Arial, sans-serif" fill="{INK}">']

    def text(self, x, y, value, size=23, color=INK, bold=False, anchor='start'):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{"bold" if bold else "normal"}" text-anchor="{anchor}">{escape(value)}</text>')

    def line(self, x1, y1, x2, y2, color=GRAY, width=2, dashed=False, arrow=None):
        self.parts.append(f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}"' + (' stroke-dasharray="6 6"' if dashed else '') + (f' marker-end="url(#{arrow})"' if arrow else '') + '/>')

    def rect(self, x, y, w, h, fill='#f4f7fa'):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="#d3dce3"/>')

    def dot(self, x, y, color=RED, r=8):
        self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" stroke="white" stroke-width="2"/>')

    def dimension(self, x1, x2, y, label, color=GRAY):
        self.line(x1,y,x2,y,color,2)
        for x in [x1,x2]:
            self.line(x,y-7,x,y+7,color,2)
        self.text((x1+x2)/2,y-14,label,21,color,anchor='middle')

    def aircraft(self, x, y, scale=1):
        # Side view with distinct canopy, propeller, main wing root and conventional aft tail.
        self.parts.append(f'<g transform="translate({x} {y}) scale({scale})" fill="#e4edf2" stroke="{INK}" stroke-width="2.5">'
            '<path d="M0 10Q12 -17 80 -20L158 -43Q187 -48 216 -15L605 4L642 13L590 25L210 39L53 31Q5 29 0 10Z"/>'
            '<path d="M570 3L588 -77L608 -79L625 9Z"/>'
            '<path d="M551 20L642 16L656 25L555 33Z"/>'
            '<path d="M182 18L313 19L350 33L196 35Z" fill="#c7dbe6"/>'
            '<path d="M91 -19L159 -39L179 -39L180 -14Z" fill="#94bccd"/>'
            '<path d="M185 -39Q204 -33 214 -15L186 -14Z" fill="#94bccd"/>'
            '<path d="M-5 -29V47" stroke="#657781" stroke-width="5"/>'
            '<path d="M610 -77L615 -27L625 9" fill="none" stroke="#94a8b5"/>'
            '</g>')

    def save(self, name):
        (OUT / name).write_text('\n'.join(self.parts)+ '</g></svg>\n', encoding='utf-8')


def trim_figure():
    f = Figure(850, 'Pitch trim: the worked example', 'Nose left, tail right. CG ahead of wing force. Upward wing lift, downward weight and downward tail force. Dimensions match the example.')
    f.text(40,48,'Pitch trim: match every force to the worked example',32,bold=True)
    f.text(40,86,'Steady, level, trimmed flight  •  nose left  •  wing lift represented at AC',22)
    f.aircraft(92,330,1.5)
    cg, wing, tail = 370, 412.6, 938
    f.text(90,270,'NOSE',20,bold=True)
    f.text(990,215,'TAIL',20,bold=True)
    f.line(wing,357,wing,170,BLUE,5,arrow='blue')
    f.line(cg,345,cg,510,RED,5,arrow='red')
    f.line(tail,369,tail,485,BLUE,5,arrow='blue')
    f.dot(cg,345)
    f.dot(wing,357,BLUE,6)
    f.text(440,404,'AC: wing aerodynamic center',19,BLUE)
    f.text(330,315,'CG',23,RED,bold=True)
    f.text(480,165,'Wing lift  Lw = 10,946 N',25,BLUE,bold=True)
    f.line(470,171,wing+4,179,BLUE)
    f.text(285,552,'W = 10,000 N',24,RED,bold=True)
    f.text(810,526,'Lt = −946 N',24,BLUE,bold=True)
    f.text(810,555,'Tail downforce',21,BLUE)
    # Upper short dimension uses full projection to distinguish close stations.
    f.line(cg,295,cg,120,GRAY,1.5,True)
    f.line(wing,300,wing,120,GRAY,1.5,True)
    f.dimension(cg,wing,132,'')
    f.text(170,142,'dw = 0.30 m',21)
    f.line(318,137,367,132)
    f.line(cg,565,cg,613,GRAY,1.5,True)
    f.line(tail,568,tail,613,GRAY,1.5,True)
    f.dimension(cg,tail,608,'dt = 4.00 m')
    # Nose-down couple is counterclockwise in a nose-left side view.
    f.parts.append(f'<path d="M467 335 A57 57 0 0 0 374 313" fill="none" stroke="{GRAY}" stroke-width="3" marker-end="url(#gray)"/>')
    f.text(590,246,'M₀ = M_ac = −500 N m',22,GRAY)
    f.text(590,275,'Wing pressure: nose-down couple',19,GRAY)
    f.line(580,278,455,303,GRAY,2)
    f.rect(35,653,1130,160)
    f.text(58,690,'Force check',22,bold=True)
    f.text(260,690,'10,946 − 946 − 10,000 = 0 N',24)
    f.text(58,735,'Moment check',22,bold=True)
    f.text(260,735,'−500 − (0.30 × 10,946) + (4.00 × 946) ≈ 0 N m',23)
    f.text(58,781,'Nose-up positive. Values rounded; arrow lengths are not scaled to force magnitude.',20)
    f.save('Trim_Worked_Example_v3.svg')


def margin_figure():
    f = Figure(1170, 'Static margin: CG position and restoring response', 'Same neutral point at 40 percent MAC; CG at 25, 40 and 55 percent MAC. Three chord rulers show positive, zero and negative static margin.')
    f.text(40,46,'Static margin: where is the CG relative to the neutral point?',31,bold=True)
    f.text(40,83,'x increases aft. Compare all positions on the same mean aerodynamic chord (MAC).',21)
    f.aircraft(130,175,0.85)
    f.text(50,160,'NOSE',19,bold=True)
    f.text(765,160,'TAIL',19,bold=True)
    f.text(835,143,'CG: mass balance point',20,RED,bold=True)
    f.text(835,174,'NP: zero static-slope CG location',19,GRAY)
    f.text(40,235,'Illustrative NP = 40% MAC; only the CG changes between these cases.',22,bold=True)
    # Full-width row diagram on left and physically stated response on right.
    for i,(h,heading,response,color) in enumerate([
        (.25,'STABLE  •  SM = +15%','Restoring nose-down moment',GREEN),
        (.40,'NEUTRAL  •  SM = 0%','No first-order restoring moment',GRAY),
        (.55,'UNSTABLE  •  SM = −15%','Destabilizing nose-up moment',RED)]):
        y=266+i*237
        f.rect(35,y,1130,215)
        f.text(58,y+34,heading,25,color,True)
        x0, span = 82, 540
        cg=x0+h*span; np_=x0+.40*span; axis=y+126
        f.line(x0,axis,x0+span,axis,INK,3,arrow='gray')
        for frac,label in [(0,'0%'),(.25,'25%'),(.40,'40%'),(.55,'55%'),(1,'100% MAC')]:
            xp=x0+frac*span
            f.line(xp,axis-5,xp,axis+6)
            f.text(xp,axis+31,label,18,anchor='middle')
        f.line(np_,y+85,np_,axis,GRAY,2,True)
        if h != .4:
            f.dot(cg,axis,RED)
            f.dot(np_,axis,GRAY,6)
            f.text(cg,y+90,'CG',22,RED,True,anchor='middle')
            f.text(np_,y+69,'NP',22,GRAY,True,anchor='middle')
            f.dimension(min(cg,np_),max(cg,np_),y+188,'15% MAC',color)
        else:
            f.dot(cg,axis,'#805ba5',9)
            f.text(cg,y+79,'CG = NP',22,'#805ba5',True,anchor='middle')
        f.text(700,y+76,'After a small increase in angle of attack:',19)
        f.text(700,y+114,response,21,color,True)
        f.text(700,y+149,['Cmα < 0: opposes the disturbance','Cmα = 0: neutral in this linear model','Cmα > 0: reinforces the disturbance'][i],19)
        f.text(700,y+182,['CG is ahead of NP','CG coincides with NP','CG is aft of NP'][i],21)
    f.rect(35,996,1130,134,'#edf3f6')
    f.text(58,1034,'SM = (xNP − xCG) / c̄',28,bold=True)
    f.text(58,1076,'Positive example: (0.40c̄ − 0.25c̄) / c̄ = 0.15 = 15%',24)
    f.text(58,1110,'These positions illustrate the definition; they do not prescribe an operating CG range.',20)
    f.save('Static_Margin_Ruler_v2.svg')


if __name__ == '__main__':
    extract_faa()
    trim_figure()
    margin_figure()
    print('Created four FAA figure crops and two original SVG teaching figures.')
