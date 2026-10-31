"""Standalone SVG of physical gap and upstream wetted-pressure diagnostics."""
from pathlib import Path
from html import escape
import json,math
b=Path(__file__).resolve().parent
p=json.loads((b/'cavity-2d-wet-pressure.json').read_text())['rows']
h=json.loads((b/'cavity-2d-wet-replay.json').read_text())['rows']
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="910" viewBox="0 0 1100 910">','<rect width="1100" height="910" fill="white"/>','<style>text{font-family:Arial,sans-serif;fill:#17293b} .tick{font-size:15px}.axis{font-size:18px}.title{font-size:23px;font-weight:700}.note{font-size:15px}</style>']
def text(x,y,s,cls='tick',anchor=None,color=None):
 svg.append(f'<text x="{x}" y="{y}" class="{cls}"'+(f' text-anchor="{anchor}"' if anchor else '')+(f' style="fill:{color}"' if color else '')+'>'+escape(s)+'</text>')
def panel(x,y,w,hh,x0,x1,y0,y1,xlabel,ylabel,title,xticks,yticks):
 def X(v):return x+(v-x0)*w/(x1-x0)
 def Y(v):return y+hh-(v-y0)*hh/(y1-y0)
 text(x,y-18,title,'title')
 for v in xticks:
  xx=X(v);svg.append(f'<path d="M{xx},{y}v{hh}" stroke="#e3e8ef"/>');text(xx,y+hh+25,f'{v:g}',anchor='middle')
 for v in yticks:
  if v<y0 or v>y1:continue
  yy=Y(v);svg.append(f'<path d="M{x},{yy}h{w}" stroke="#e3e8ef"/>');text(x-12,yy+5,f'{v:g}',anchor='end')
 svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" fill="none" stroke="#63798e"/>')
 text(x+w/2,y+hh+54,xlabel,'axis',anchor='middle')
 svg.append(f'<text class="axis" transform="translate({x-60},{y+hh/2}) rotate(-90)" text-anchor="middle">{escape(ylabel)}</text>')
 return X,Y
def curve(X,Y,data,color,dash=None,marker=False):
 data=sorted(data);points=' '.join(f'{X(x):.3f},{Y(y):.3f}' for x,y in data)
 svg.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="2.4"'+(f' stroke-dasharray="{dash}"' if dash else '')+'/>')
 if marker:
  for x,y in data:svg.append(f'<circle cx="{X(x)}" cy="{Y(y)}" r="3.3" fill="white" stroke="{color}" stroke-width="1.8"/>')
text(85,34,'2-D cavity: numerical convergence and physical admission are different','title')
text(85,61,'NACA 0012 · α = 4° · xD/c = 0.01 · l/c = 0.40 · smooth-contact closure','axis')
for yy,label,color,dash in [(92,'Production potential BIE: 80 panels','#1e61b8',None),(117,'Production potential BIE: 213 panels','#0c8058',None),(142,'Independent Hess–Smith replay: same 213-panel shape','#9d3f8f','7 4')]:
 svg.append(f'<path d="M85,{yy-5}h50" stroke="{color}" stroke-width="2.5"'+(f' stroke-dasharray="{dash}"' if dash else '')+'/>');text(148,yy,label,'note')
X,Y=panel(90,190,950,245,0,.42,0,.022,'Chord position x/c','Physical gap h/c','Computed positive cavity gap',[0,.1,.2,.3,.4],[0,.005,.01,.015,.02])
for r,col in [(p[0],'#1e61b8'),(p[-1],'#0c8058')]:curve(X,Y,[(v['x'],v['h']) for v in r['height']],col)
text(90,514,'Upstream liquid-pressure check: all upper wetted samples before detachment','title')
vals=[v for r in p for v in r['wet'] if v['y']>0 and v['x']<=.01]
top=math.ceil(max(v['pressureMargin'] for v in vals)*2)/2
X,Y=panel(90,550,950,230,0,.01,-.2,top,'Chord position x/c (onset detail)','Cp + σ = (p − pv) / q∞','',[0,.002,.004,.006,.008,.01],[-.2,0,.5,1,1.5,2])
svg.append(f'<rect x="90" y="{Y(0)}" width="950" height="{Y(-.2)-Y(0)}" fill="#c9202a" fill-opacity=".08"/>')
svg.append(f'<path d="M90,{Y(0)}h950" stroke="#a51222" stroke-width="1.6" stroke-dasharray="5 4"/>')
for r,col in [(p[0],'#1e61b8'),(p[-1],'#0c8058')]:curve(X,Y,[(v['x'],v['pressureMargin']) for v in r['wet'] if v['y']>0 and v['x']<=.01],col,marker=True)
q=h[-1];curve(X,Y,[(v['x'],v['cp']+q['sigma']) for v in q['samples'] if not v['cavity'] and v['fraction']==.5 and v['y']>0 and v['x']<=.01],'#9d3f8f','7 4',True)
text(1028,Y(.23),'Below dashed zero line: pressure below vapour','note',anchor='end',color='#a51222')
text(90,856,'A positive gap and small equation residual do not resolve this upstream pressure violation.','note')
text(90,880,'No pressure clipping or automatic movement of detachment. Full sampled data remain in the JSON reports.','note')
svg.append('</svg>');(b/'cavity-2d-admission.svg').write_text('\n'.join(svg),encoding='utf-8')
