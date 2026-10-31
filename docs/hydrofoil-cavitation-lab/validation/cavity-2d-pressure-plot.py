"""Plot ALL wetted Cp+sigma samples, with independent analytic-velocity replay.

No panel is discarded. No line connects across the omitted cavity BC region.
An additional explicitly labelled onset zoom uses the same underlying samples.
"""
from pathlib import Path
from html import escape
import json
b=Path(__file__).resolve().parent
p=json.loads((b/'cavity-2d-wet-pressure.json').read_text())['rows'][-1]
h=json.loads((b/'cavity-2d-wet-replay.json').read_text())['rows'][-1]
S=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000">','<rect width="1200" height="1000" fill="white"/>','<style>text{font-family:Arial,sans-serif;fill:#17293b}.title{font-size:23px;font-weight:700}.axis{font-size:18px}.tick{font-size:16px}.note{font-size:16px}</style>']
def text(x,y,s,cls='tick',anchor=None,color=None):
 S.append(f'<text x="{x}" y="{y}" class="{cls}"'+(f' text-anchor="{anchor}"' if anchor else '')+(f' style="fill:{color}"' if color else '')+'>'+escape(s)+'</text>')
def dot(x,y,color,r=2.8,filled=True,triangle=False):
 if triangle:S.append(f'<path d="M{x},{y-r}l{r},{2*r}h{-2*r}Z" fill="{color if filled else "white"}" stroke="{color}" stroke-width="1.1"/>')
 else:S.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color if filled else "white"}" stroke="{color}" stroke-width="1.1"/>')
def axes(y,hh,x0,x1,title):
 x=100;w=1030;y0=-.2;y1=2.2
 def X(v):return x+w*(v-x0)/(x1-x0)
 def Y(v):return y+hh-hh*(v-y0)/(y1-y0)
 text(x,y-18,title,'title')
 S.append(f'<rect x="{x}" y="{Y(0)}" width="{w}" height="{Y(-.2)-Y(0)}" fill="#b71c2a" fill-opacity=".10"/>')
 for k in range(6):
  v=x0+(x1-x0)*k/5;xx=X(v);S.append(f'<path d="M{xx},{y}v{hh}" stroke="#e1e7ef"/>');text(xx,y+hh+25,f'{v:.3f}' if x1<.1 else f'{v:.1f}',anchor='middle')
 for v in [-.2,0,.5,1,1.5,2]:
  yy=Y(v);S.append(f'<path d="M{x},{yy}h{w}" stroke="{"#a51222" if v==0 else "#e1e7ef"}"'+(' stroke-dasharray="6 4"' if v==0 else '')+'/>');text(x-12,yy+5,f'{v:g}',anchor='end')
 S.append(f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" fill="none" stroke="#64768a"/>')
 text(x+w/2,y+hh+52,'Chord position x/c','axis',anchor='middle')
 S.append(f'<text class="axis" transform="translate(33,{y+hh/2}) rotate(-90)" text-anchor="middle">Cp + σ = (p − pv) / q∞</text>')
 for v in p['wet']:
  if x0<=v['x']<=x1:dot(X(v['x']),Y(v['pressureMargin']),'#0d5faf',filled=v['y']>=0)
 for v in h['samples']:
  if not v['cavity'] and x0<=v['x']<=x1:dot(X(v['x']),Y(v['cp']+h['sigma']),'#a03c86',r=2.1,filled=v['y']>=0,triangle=True)
 text(x+w-12,Y(.25),'Below dashed zero line: pressure below vapour','note',anchor='end',color='#a51222')
text(100,34,'Equilibrium pressure check — entire wetted contour, no deleted samples','title')
text(100,63,'NACA 0012 · α = 4° · xD/c = 0.01 · l/c = 0.40 · 213 boundary panels','axis')
dot(110,95,'#0d5faf',4);text(125,101,'Production potential BIE: panel centroids','note')
dot(110,124,'#a03c86',4,triangle=True);text(125,130,'Independent Hess–Smith replay: ¼, ½ and ¾ of EVERY wetted panel','note')
text(100,161,'Filled symbols: upper surface. Open symbols: lower surface. No prescribed cavity BC samples are plotted.','note')
axes(215,260,0,1,'Full chord: all wetted panel samples')
axes(590,260,0,.01,'Onset detail: identical samples upstream of prescribed detachment')
text(100,936,'Production minimum Cp + σ = −0.0700; independent centroid replay = −0.1104. Both violate the screen.','note')
text(100,966,'Cross-method magnitude is not converged. These are model-consistency diagnostics, not experimental validation.','note')
S.append('</svg>');(b/'cavity-2d-pressure-all.svg').write_text('\n'.join(S),encoding='utf-8')
