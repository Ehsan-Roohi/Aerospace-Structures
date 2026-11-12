"""Build the Barra lesson and original analytical SVG figures (requires Pandoc)."""
from pathlib import Path
import html
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/case-studies/barra-beach'
STYLE = '''
*{box-sizing:border-box}body{margin:0;background:#edf3f7;color:#18364a;font:18px/1.75 system-ui}
main{max-width:1080px;margin:auto;background:white;padding:42px}h1{font-size:2.5rem;line-height:1.15;max-width:850px}
h2{color:#125c73;margin-top:2.3em;line-height:1.3}h3{line-height:1.4}a{color:#086886;text-underline-offset:3px}
img{display:block;max-width:100%;height:auto;margin:auto}figure{margin:2em 0}figcaption{font-size:.85em;color:#506675}
table{border-collapse:collapse;display:block;overflow:auto;max-width:100%;font-size:.92em;margin:1.3em 0}
td,th{border:1px solid #ccd7df;padding:10px 12px;text-align:left;min-width:100px}th{background:#edf5f7}
.math.display{display:block;overflow:auto;padding:16px;background:#f1f6fa}nav{padding:12px 18px;background:#edf3f7}
#TOC{margin:2em 0;padding:18px 24px;border-left:4px solid #17788a;background:#f5f8fa}#TOC ul{margin:0;padding-left:20px}
@media(max-width:640px){main{padding:20px}body{font-size:16px}h1{font-size:2rem}td,th{padding:8px}}
@media print{body{background:white;font-size:11pt}main{max-width:none;padding:0}nav,#TOC{display:none}h2{break-after:avoid}figure,table{break-inside:avoid}}
'''


def svg_start(title, desc, width, height):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(desc)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#16788a"/></marker></defs>
<rect width="100%" height="100%" fill="#f1f6fa"/><g font-family="Arial,sans-serif" fill="#18364a">'''


def figures():
    s = svg_start('Wheel loading and contact pressure', 'Two hypothetical contact patches under equal load and a conceptual aircraft ground-force diagram.', 960, 450)
    s += '''<text x="28" y="36" font-size="24" font-weight="bold">Wheel load, footprint and ground forces</text>
<text x="28" y="65" font-size="16">Conceptual diagrams • not an aircraft geometry or tire specification</text>
<text x="30" y="104" font-size="19" font-weight="bold">Equal wheel load: 22.07 kN</text>
<path d="M30 265H410" stroke="#b5945f" stroke-width="5"/>
<ellipse cx="125" cy="208" rx="44" ry="55" fill="#d5e6ed" stroke="#18364a" stroke-width="3"/>
<ellipse cx="310" cy="221" rx="74" ry="42" fill="#d5e6ed" stroke="#18364a" stroke-width="3"/>
<path d="M125 125V190" stroke="#16788a" stroke-width="3" marker-end="url(#arrow)"/><path d="M310 125V190" stroke="#16788a" stroke-width="3" marker-end="url(#arrow)"/>
<path d="M100 265H150M260 265H360" stroke="#b45922" stroke-width="8"/>
<text x="125" y="302" text-anchor="middle" font-size="17">A = 0.060 m²</text>
<text x="310" y="302" text-anchor="middle" font-size="17">A = 0.120 m²</text>
<text x="125" y="328" text-anchor="middle" font-size="19" font-weight="bold">368 kPa</text>
<text x="310" y="328" text-anchor="middle" font-size="19" font-weight="bold">184 kPa</text>
<text x="30" y="378" font-size="17">Average pressure = wheel load / contact area</text>
<text x="30" y="404" font-size="15">Patch widths are schematic; values refer to area.</text>
<path d="M440 95V420" stroke="#c3d4dc"/>
<text x="480" y="104" font-size="19" font-weight="bold">Quasi-static vertical balance: N = W − L</text>
<rect x="565" y="211" width="225" height="45" rx="20" fill="#c9dfe6" stroke="#18364a" stroke-width="2"/>
<path d="M605 255V301M755 255V301" stroke="#18364a" stroke-width="4"/>
<circle cx="605" cy="311" r="14" fill="#18364a"/><circle cx="755" cy="311" r="14" fill="#18364a"/>
<path d="M480 327H920" stroke="#b5945f" stroke-width="5"/>
<circle cx="675" cy="231" r="5" fill="#b45922"/>
<g stroke="#16788a" stroke-width="3" marker-end="url(#arrow)"><path d="M675 218V135"/><path d="M700 240V307"/><path d="M605 379V334"/><path d="M755 379V334"/><path d="M780 231H895"/><path d="M588 317H510"/></g>
<text x="687" y="155" font-size="19">L</text><text x="709" y="289" font-size="19">W</text>
<text x="582" y="404" font-size="17">N main</text><text x="731" y="404" font-size="17">N nose</text>
<text x="810" y="218" font-size="17">Thrust</text><text x="485" y="298" font-size="16">Resistance</text>
<text x="480" y="433" font-size="15">Rearward ground force also produces a pitching moment.</text>'''
    (OUT / 'wheel-loads.svg').write_text(s + '</g></svg>\n')

    s = svg_start('Takeoff sensitivity to effective rolling resistance', 'Constant-force teaching model; ground run grows from 251 to 1589 metres as the assumed resistance coefficient rises from 0.03 to 0.25.', 960, 500)
    s += '<text x="30" y="36" font-size="24" font-weight="bold">Less acceleration margin → much more runway</text><text x="30" y="65" font-size="16">Hypothetical constant forces; no measured Barra or Twin Otter performance</text>'
    x0,y0,w,h=100,100,800,300
    def px(mu): return x0+mu/.27*w
    def py(dist): return y0+h-dist/2500*h
    for val in range(0,2501,500):
        y=py(val)
        s += f'<path d="M{x0} {y}H900" stroke="#d4e0e6"/><text x="85" y="{y+5}" text-anchor="end" font-size="15">{val:,}</text>'
    for val in [0,.05,.10,.15,.20,.25]:
        x=px(val)
        s += f'<text x="{x}" y="427" text-anchor="middle" font-size="15">{val:.2f}</text>'
    points=[]
    for i in range(271):
        mu=i/1000
        dist=5000*30**2/(2*(10000-mu*.7*5000*9.81))
        if dist<=2500: points.append(f'{px(mu):.2f},{py(dist):.2f}')
    s += f'<polyline points="{" ".join(points)}" fill="none" stroke="#16788a" stroke-width="4"/>'
    for mu in [.03,.12,.25]:
        dist=5000*30**2/(2*(10000-mu*.7*5000*9.81))
        s += f'<circle cx="{px(mu)}" cy="{py(dist)}" r="6" fill="#b45922"/><text x="{px(mu)-8}" y="{py(dist)-16}" text-anchor="end" font-size="17">{dist:,.0f} m</text>'
    s += '<text x="500" y="462" text-anchor="middle" font-size="18">Assumed effective rolling-resistance parameter, μeff</text><text x="25" y="270" transform="rotate(-90 25 270)" text-anchor="middle" font-size="18">Ground run (m)</text><text x="100" y="490" font-size="15">m = 5,000 kg; T = 12 kN; D = 2 kN; L = 0.30 W; target ground speed = 30 m/s</text>'
    (OUT / 'takeoff-sensitivity.svg').write_text(s+'</g></svg>\n')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    figures()
    text=(ROOT/'BARRA_BEACH_RUNWAY.md').read_text()
    text=text.replace('docs/case-studies/barra-beach/','')
    text=text.replace('(READINGS.md)','(https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md)')
    result=subprocess.run(['pandoc','-f','markdown+tex_math_dollars','-t','html5','--mathjax','--toc','--toc-depth=2','--standalone','--metadata','title=Barra beach runway · MIE 446'],input=text,text=True,capture_output=True,check=True).stdout
    body=result.split('<body>',1)[1].split('</body>',1)[0]
    # Pandoc adds a metadata title; the reading already contains its own H1.
    import re
    body=re.sub(r'<header id="title-block-header">.*?</header>','',body,flags=re.S)
    toc=re.search(r'<nav id="TOC".*?</nav>',body,re.S).group()
    body=body.replace(toc,'')
    body=body.replace('<h2 id="what-is-unusual-about-barra">', '<details><summary>Explore the lesson: 14 sections</summary>'+toc+'</details>\n<h2 id="what-is-unusual-about-barra">')
    (OUT/'index.html').write_text(f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Barra: beach landings, aircraft and structural loads · MIE 446</title><meta name="description" content="How aircraft land on tidal sand: wheel pressure, landing gear loads, takeoff resistance, Twin Otter suitability and a BeamLab exercise."><style>{STYLE}</style><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script></head><body><main><nav><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md">All readings</a> · <a href="../../wing-lab.html">BeamLab</a> · <a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/BARRA_BEACH_RUNWAY.md">GitHub text</a></nav>{body}</main></body></html>\n''')


if __name__ == '__main__':
    build()
