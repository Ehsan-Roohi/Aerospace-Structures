"""Build the CE-25A web reading and nine original educational SVG figures.

Dependencies: Python 3, NumPy, Matplotlib, Pandoc. Run from any directory.
No network downloads or changes to existing course software are performed.
"""
from pathlib import Path
import html
import importlib.util
import json
import math
import re
import subprocess

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/case-studies/ce25a"
BLUE = "#176b87"
INK = "#193449"
ORANGE = "#b34b25"
TEAL = "#147d72"
BG = "#f2f6f9"


def start(title, desc, width=1080, height=500):
    return [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(desc)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{BLUE}"/></marker></defs>
<rect width="100%" height="100%" fill="{BG}"/><g font-family="Arial,sans-serif" fill="{INK}">''']


def text(s, x, y, label, size=18, anchor="start", weight="normal", color=INK):
    s.append(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}" fill="{color}">{html.escape(label)}</text>')


def line(s, x1, y1, x2, y2, arrow=False, color=BLUE, width=3, dash=False):
    s.append(f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="{width}" fill="none"' + (' marker-end="url(#arrow)"' if arrow else '') + (' stroke-dasharray="8 6"' if dash else '') + '/>')


def box(s, x, y, w, h, labels, fill="#fff"):
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="#a1b7c6" stroke-width="2"/>')
    for i, label in enumerate(labels):
        text(s, x+w/2, y+h/2 + (i-(len(labels)-1)/2)*25+6, label, 18, "middle", "bold" if i == 0 else "normal")


def finish(s, filename):
    s.append("</g></svg>")
    (OUT/filename).write_text("\n".join(s)+"\n", encoding="utf-8")


def heading(s, title, subtitle):
    text(s, 30, 42, title, 28, weight="bold")
    text(s, 30, 73, subtitle, 17)


def diagrams():
    s = start("Electrical power, shaft power and heat", "Generic five-stage propulsion chain with losses; not CE-25A wiring", height=470)
    heading(s, "From stored energy to thrust", "Generic architecture; protection and electrical segregation are design-specific")
    for x, labels in [(30,["Battery","DC energy"]),(240,["Protection","DC distribution"]),(450,["Inverter","Controlled AC"]),(660,["Motor","Shaft torque"]),(870,["Ducted fan","Thrust"] )]:
        box(s,x,145,180,100,labels)
    for x in [210,420,630,840]:line(s,x,195,x+27,195,True)
    for x in [120,540,750]:line(s,x,245,x,320,True)
    box(s,300,345,480,65,["Heat → cooling system → surrounding air"],"#e4f0f1")
    line(s,120,320,540,320);line(s,750,320,540,320);line(s,540,320,540,340,True)
    text(s,30,440,"Motor efficiency, fan propulsive efficiency and complete-system efficiency are different.",18)
    finish(s,"power-chain.svg")

    s = start("Conceptual radial-flux PMSM", "Stator windings surrounding a magnet rotor with a controlled air gap", height=570)
    heading(s,"Where motor torque comes from","Generic radial-flux cross-section; actual CE-25A machine type is not public")
    cx,cy=330,320
    s.append(f'<circle cx="{cx}" cy="{cy}" r="183" fill="#d6e2e8" stroke="{INK}" stroke-width="4"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="133" fill="#fff" stroke="#8ba5b5" stroke-width="2"/>')
    for j in range(12):
        ang=j*2*math.pi/12
        x,y=cx+155*math.cos(ang),cy+155*math.sin(ang)
        s.append(f'<circle cx="{x}" cy="{y}" r="15" fill="#d2944d" stroke="#925b20" stroke-width="2"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="118" fill="#c2d5de" stroke="{BLUE}" stroke-width="3"/>')
    for j,col in enumerate(["#c85e50","#4c83b4","#c85e50","#4c83b4"]):
        ang=j*math.pi/2
        x,y=cx+94*math.cos(ang),cy+94*math.sin(ang)
        s.append(f'<circle cx="{x}" cy="{y}" r="17" fill="{col}"/>')
        text(s,x,y+6,"N" if j%2==0 else "S",16,"middle","bold","#fff")
    s.append(f'<circle cx="{cx}" cy="{cy}" r="31" fill="{INK}"/>')
    line(s,330,165,580,160);text(s,600,168,"Stator + copper windings",21,weight="bold")
    line(s,457,300,580,270);text(s,600,278,"Small running air gap",21,weight="bold")
    line(s,400,378,580,375);text(s,600,383,"Rotor + permanent magnets",21,weight="bold")
    line(s,330,320,580,475);text(s,600,483,"Shaft → fan",21,weight="bold")
    text(s,600,202,"Controlled stator field produces torque.",17)
    text(s,600,413,"Rotor torque has an equal stator reaction.",17)
    text(s,30,548,"Housing and mounts transmit reaction torque to the airframe; bearings preserve alignment.",18)
    finish(s,"motor-section.svg")

    s=start("Motor control hierarchy", "Thrust request, speed or torque schedule, current control and motor with two feedback loops",height=480)
    heading(s,"Thrust control and motor current control","Conceptual control hierarchy, not a CE-25A controller implementation")
    for x,labels in [(30,["Flight control","Thrust request"]),(292,["Fan / motor map","Torque or rpm"]),(554,["Current control","Inverter"]),(816,["Motor + fan","Torque / flow"])]:
        box(s,x,150,225,100,labels)
    for x in [255,517,779]:line(s,x,200,x+31,200,True)
    s.append(f'<path d="M920 250V320H665V255" fill="none" stroke="{BLUE}" stroke-width="3" marker-end="url(#arrow)"/>')
    text(s,790,310,"Phase-current feedback",17,"middle")
    s.append(f'<path d="M975 250V385H610V255" fill="none" stroke="{BLUE}" stroke-width="3" marker-end="url(#arrow)"/>')
    text(s,790,375,"Rotor-position / speed feedback",17,"middle")
    text(s,30,444,"Battery, temperature and voltage limits can restrict the achievable thrust request.",18)
    finish(s,"motor-control.svg")

    s=start("Ducted fan and wing interaction", "Cross-section of generic duct, rotor, support vanes, motor and wing with a deflected flap",height=540)
    heading(s,"A motor turns the fan; the installation shapes the flow","Generic concept: rotor, motor support and a powered stream near a flap")
    s.append(f'<path d="M120 175Q190 135 300 145L700 145Q760 150 815 180L798 200Q745 177 700 178L290 178Q200 168 130 205Z" fill="#c5d7df" stroke="{INK}" stroke-width="2"/>')
    s.append(f'<path d="M130 325Q200 360 300 350L700 350Q760 345 815 315L798 295Q745 318 700 317L290 317Q200 327 130 295Z" fill="#c5d7df" stroke="{INK}" stroke-width="2"/>')
    s.append(f'<rect x="320" y="180" width="14" height="135" fill="{ORANGE}"/><ellipse cx="464" cy="247" rx="90" ry="35" fill="#8fb1c4" stroke="{INK}" stroke-width="2"/>')
    line(s,334,247,550,247,False,INK,6)
    line(s,520,212,550,178,False,INK,5);line(s,520,282,550,317,False,INK,5)
    s.append(f'<path d="M110 375Q280 320 740 360L860 395L970 455L950 474L830 420L700 402Q310 400 110 375Z" fill="#b6c9d3" stroke="{INK}" stroke-width="2"/>')
    for yy in [217,275]:line(s,30,yy,270,yy,True)
    for yy in [215,278]:
        s.append(f'<path d="M590 {yy}H790Q870 {yy+10} 950 {yy+90}" fill="none" stroke="{BLUE}" stroke-width="3" marker-end="url(#arrow)"/>')
    text(s,200,120,"Inlet lip",18,"middle");line(s,200,126,170,166)
    text(s,285,466,"Rotor",18,"middle");line(s,285,440,327,315)
    text(s,462,120,"Motor + hub",18,"middle");line(s,465,127,465,210)
    text(s,630,120,"Support vanes",18,"middle");line(s,625,126,550,180)
    text(s,865,500,"Deflected flap / turned stream",18,"middle")
    text(s,30,520,"Duct pressure forces, inlet losses, tip clearance and wing interference affect installed thrust.",17)
    finish(s,"fan-wing.svg")

    s=start("Propulsor installation load path", "Fan and motor loads transfer through brackets, ribs and spars into the wing root",height=540)
    heading(s,"Motor and fan loads enter a wing box","Conceptual local attachment; axes must be retained in a three-dimensional load analysis")
    s.append(f'<path d="M115 295L600 245L930 310L425 375Z" fill="#d9e6ec" stroke="{INK}" stroke-width="3"/>')
    s.append(f'<path d="M115 295V390L425 470V375M425 470L930 405V310" fill="#b9ced9" stroke="{INK}" stroke-width="3"/>')
    for x in [250,425,600,775]:
        line(s,x,281+(x-250)*.02,x+90,400-(x-250)*.02,False,"#6f98aa",3)
    line(s,200,305,880,320,False,BLUE,8);line(s,210,370,880,395,False,BLUE,8)
    box(s,430,125,230,95,["Motor / fan","Attachment frame"],"#e4f0f1")
    line(s,475,220,430,285,False,INK,7);line(s,620,220,650,308,False,INK,7)
    line(s,660,170,855,170,True);text(s,770,150,"Thrust",20,"middle","bold")
    line(s,545,220,545,295,True);text(s,595,275,"Weight / inertia",17)
    s.append(f'<path d="M430 160C365 110 365 220 425 205" fill="none" stroke="{ORANGE}" stroke-width="3"/>')
    text(s,125,180,"Reaction torque",20,weight="bold",color=ORANGE)
    text(s,80,440,"Wing root",18);line(s,175,430,130,385)
    text(s,735,450,"Spars + ribs + skins",18,"middle")
    text(s,30,517,"Concentrated mount loads, thermal deformation and inspection access shape the structural design.",17)
    finish(s,"load-path.svg")


def save_plot(fig, path, title):
    fig.savefig(OUT/path, format="svg", bbox_inches="tight", metadata={"Title":title,"Description":"Independent classroom assumptions; not CE-25A performance data"})
    plt.close(fig)


def plots():
    plt.rcParams.update({"font.family":"DejaVu Sans","font.size":11,"axes.labelcolor":INK,"text.color":INK,"axes.edgecolor":"#9aafbd","axes.spines.top":False,"axes.spines.right":False,"svg.fonttype":"none","figure.facecolor":"white","axes.facecolor":BG,"grid.color":"#d3dfe7","grid.alpha":0.8})
    n=np.linspace(300,8000,500)
    q0=200000/(2*math.pi*3000/60)
    q=np.minimum(q0,200000/(2*math.pi*n/60))
    fig,ax=plt.subplots(1,2,figsize=(11,4.3),layout="constrained")
    ax[0].plot(n,q,color=BLUE,lw=3);ax[0].set(xlabel="Speed (rpm)",ylabel="Shaft torque (N m)",ylim=(0,720))
    ax[1].plot(n,q*2*math.pi*n/60/1000,color=TEAL,lw=3);ax[1].set(xlabel="Speed (rpm)",ylabel="Shaft power (kW)",ylim=(0,230))
    for a in ax:a.axvline(3000,color=ORANGE,ls="--",lw=1.5);a.grid()
    fig.suptitle("Hypothetical motor envelope: current limit, then idealized voltage-limited region",fontsize=14)
    save_plot(fig,"torque-speed.svg","Hypothetical 200 kW motor torque and power envelope")

    fig,ax=plt.subplots(figsize=(10,4.6),layout="constrained")
    for d,col in zip([.6,.8,1.0],[TEAL,BLUE,ORANGE]):
        mach=np.hypot(math.pi*d*n/60,300/3.6)/330
        ax.plot(n,mach,lw=2.7,label=f"Assumed diameter {d:.1f} m",color=col)
    ax.set(xlabel="Fan speed (rpm)",ylabel="Approximate helical tip Mach number",xlim=(0,8000),ylim=(0,1.35),title="Tip-speed sensitivity | flight speed 300 km/h, sound speed 330 m/s")
    ax.legend(frameon=False,loc="upper left");ax.grid()
    save_plot(fig,"tip-mach.svg","Kinematic fan tip Mach sensitivity, assumed diameters")

    fig,ax=plt.subplots(figsize=(10,4.6),layout="constrained")
    energy=np.linspace(200,1300,200)
    for e,col in zip([250,350,450],[ORANGE,BLUE,TEAL]):
        ax.plot(energy,energy/(.8*e/1000),lw=2.7,label=f"Assumed pack {e} Wh/kg",color=col)
    ax.set(xlabel="Electrical mission energy required (kWh)",ylabel="Battery pack mass (kg)",title="Battery mass sensitivity | usable fraction = 0.80; no installed CE-25A pack claim")
    ax.legend(frameon=False);ax.grid()
    save_plot(fig,"battery-mass.svg","Battery mass from mission energy and assumed pack specific energy")

    spec=importlib.util.spec_from_file_location("ce25a_calculations",OUT/"calculations.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    result=module.calculate();(OUT/"calculations.json").write_text(json.dumps(result,indent=2)+"\n")
    a=result["assumptions"]
    y=np.linspace(0,8,2001)
    for pos in a["beam_installation_locations_m"]:y=np.sort(np.r_[y,pos-1e-8,pos+1e-8])
    shear=6000*(8-y);moment=6000*(8-y)**2/2
    for pos in a["beam_installation_locations_m"]:
        shear-=60*9.80665*(y<pos)
        moment-=60*9.80665*np.maximum(pos-y,0)
    fig,ax=plt.subplots(1,2,figsize=(11,4.3),layout="constrained")
    for ar,vals,lab in zip(ax,[shear/1000,moment/1000],["Outboard load resultant (kN)","Bending demand (kN m)"]):
        ar.plot(y,vals,color=BLUE,lw=2.5);ar.set(xlabel="Distance from root (m)",ylabel=lab,xlim=(0,8));ar.grid()
    fig.suptitle("Assumed 8 m cantilever: 6 kN/m upward load + five 60 kg installations",fontsize=14)
    save_plot(fig,"wing-beam.svg","Assumed half-wing shear and bending demand")


STYLE = '''
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf3f7;color:#193449;font:18px/1.78 system-ui,sans-serif}main{max-width:1100px;margin:auto;background:white;padding:36px 54px 72px}h1{font-size:clamp(2rem,4vw,3.1rem);line-height:1.16;letter-spacing:-.035em;max-width:940px;color:#123d53;margin:1em 0 .55em}h2{font-size:1.65rem;line-height:1.3;color:#125c73;margin-top:2.8em;border-top:1px solid #dce6ec;padding-top:1em;scroll-margin-top:20px}h3{line-height:1.4;margin-top:1.8em}a{color:#086886;text-underline-offset:3px;overflow-wrap:anywhere}nav{display:flex;flex-wrap:wrap;gap:8px 20px;border-bottom:1px solid #cddde6;padding:12px 0 18px;font-size:.88em}nav a{text-decoration:none}img{display:block;max-width:100%;height:auto;margin:auto;border-radius:5px}figure{margin:2.1em 0}figcaption{font-size:.84em;color:#526b7c;line-height:1.6;margin-top:12px}figure+p{font-size:.88em;color:#526b7c}table{border-collapse:collapse;display:block;overflow:auto;max-width:100%;font-size:.88em;margin:1.5em 0}td,th{border:1px solid #cbd9e2;padding:11px 13px;text-align:left;min-width:120px;vertical-align:top}th{background:#eaf2f6;color:#173d50}tbody tr:nth-child(even){background:#f6f9fb}pre{overflow:auto;padding:16px;background:#f2f6f9}code{font-size:.9em}p,li{overflow-wrap:break-word}.math.display{display:block;overflow-x:auto;overflow-y:hidden;padding:18px 12px;background:#f2f6f9;border-left:3px solid #1f7a91;margin:1.2em 0}#TOC{background:#f2f7fa;padding:20px 26px;border-left:4px solid #17788a;margin:2em 0;font-size:.9em}#TOC>ul{columns:2;column-gap:35px;margin:0;padding-left:20px}#TOC li{margin:.2em 0;break-inside:avoid}#TOC ul ul{display:none}.kicker{font-size:.8em;text-transform:uppercase;letter-spacing:.12em;color:#17788a;font-weight:700}.lead-note{padding:16px 20px;background:#eaf4f6;border-radius:8px;color:#254a5b;font-size:.94em}section[dir=rtl]{text-align:right}footer{margin-top:3em;border-top:1px solid #dce6ec;padding-top:20px;color:#526b7c;font-size:.85em}a:focus-visible{outline:3px solid #d39235;outline-offset:4px}@media(max-width:680px){main{padding:22px 20px 45px}body{font-size:16px}#TOC>ul{columns:1}h2{font-size:1.45rem}td,th{padding:9px;min-width:110px}.math.display{padding:12px 6px}}@media print{body{background:white;font-size:10.5pt}main{max-width:none;padding:0}nav,#TOC,.kicker{display:none}h1{font-size:25pt}h2{break-after:avoid;font-size:17pt}figure,table{break-inside:avoid}a{color:inherit}img{max-height:650px}footer{display:none}}
'''


def build_page():
    source=(ROOT/"CE25A_ELECTRIC_AIRCRAFT.md").read_text(encoding="utf-8")
    source=source.replace("docs/case-studies/ce25a/", "./")
    source=source.replace("](READINGS.md)","](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md)")
    source=source.replace("](scripts/build_ce25a_reading.py)","](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/scripts/build_ce25a_reading.py)")
    source=source.replace("All ten engineering diagrams/plots", "All nine engineering diagrams/plots")
    rendered=subprocess.run(["pandoc","--from=markdown+tex_math_dollars+raw_html","--to=html5","--mathjax","--toc","--toc-depth=2","--standalone","--metadata","title=CE-25A electric motors and structures"],input=source,text=True,capture_output=True,check=True).stdout
    body=re.search(r"<body[^>]*>(.*)</body>",rendered,re.S).group(1)
    body=re.sub(r'<header id="title-block-header">.*?</header>',"",body,flags=re.S)
    body=re.sub(r'<nav id="TOC".*?</nav>',"",body,flags=re.S)
    headings=re.findall(r'<h2\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</h2>',body,re.S)
    if len(headings) != 23:
        raise ValueError(f"Expected all 23 article sections, found {len(headings)}")
    toc='<aside id="TOC" aria-label="Article sections"><strong>Explore the 23 sections</strong><ul>'
    for anchor,label in headings:
        label=re.sub(r'<[^>]+>', '', label)
        toc+=f'<li><a href="#{html.escape(anchor,quote=True)}">{label}</a></li>'
    toc+='</ul></aside>'
    pos=body.find('<h2')
    body=body[:pos]+toc+body[pos:]
    fa=re.search(r'(<h2 id="[^"]*">22\..*?</h2>)(.*?)(?=<h2)',body,re.S)
    if fa:
        body=body[:fa.start()]+f'<section lang="fa" dir="rtl">{fa.group(0)}</section>'+body[fa.end():]
    page=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="An illustrated CE-25A engineering lesson on electric motors, inverters, ducted fans, battery energy, cooling and wing structural loads. Includes reproducible teaching calculations.">
<title>CE-25A: electric motors, fans and structures · MIE 446</title>
<style>{STYLE}</style>
<script>window.MathJax={{tex:{{inlineMath:[['\\\\(','\\\\)']],displayMath:[['\\\\[','\\\\]']]}},options:{{enableMenu:false}}}};</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
</head><body><main><nav aria-label="Course navigation"><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures">Course home</a><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md">All readings</a><a href="../../wing-panel-stress-analyzer/#wing">Wing Lab</a><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/CE25A_ELECTRIC_AIRCRAFT.md">Markdown source</a></nav>
<p class="kicker">MIE 446 · Propulsion meets structures</p>
<p class="lead-note">Nine original engineering figures, two programme photographs and reproducible calculations. Aircraft facts and assumed teaching examples are identified throughout.</p>
{body}<footer>University of Massachusetts Amherst · MIE 446 · Independent classroom engineering analysis · Evidence checked 15 November 2026</footer></main></body></html>'''
    (OUT/"index.html").write_text(page,encoding="utf-8")


if __name__ == "__main__":
    OUT.mkdir(parents=True,exist_ok=True)
    diagrams();plots();build_page()
    print("Built nine original SVG figures, calculation results and CE-25A HTML reading.")
