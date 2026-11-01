"""Small standard-library SVG drawing helpers for reproducible course figures."""
from html import escape
from pathlib import Path
class SVG:
 def __init__(self,title,subtitle='',height=600,width=1000):
  self.width=width;self.height=height
  self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(subtitle)}</desc><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#7d96aa"/></marker></defs><rect width="100%" height="100%" rx="16" fill="#f5f8fc"/>']
  self.text(35,43,title,27,'#122e46',weight='700')
  if subtitle:self.text(35,75,subtitle,16,'#536f85')
 def text(self,x,y,s,size=17,color='#193b53',anchor='start',weight='400'):
  self.parts.append(f'<text x="{x}" y="{y}" font-family="Arial,Helvetica,sans-serif" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}">{escape(str(s))}</text>')
 def rect(self,x,y,w,h,fill='#fff',stroke='#d4e0e9',rx=9):
  self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"/>')
 def line(self,x1,y1,x2,y2,color='#9cb1c1',width=2,arrow=False,dash=False):
  extras=(' marker-end="url(#arrow)"' if arrow else '')+(' stroke-dasharray="8 5"' if dash else '')
  self.parts.append(f'<path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="{color}" stroke-width="{width}"{extras}/>')
 def circle(self,x,y,r=6,fill='#16799b'):
  self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>')
 def path(self,points,color='#16799b',width=3,dash=False):
  d=' '.join(('M' if i==0 else 'L')+f'{x:.3f},{y:.3f}' for i,(x,y) in enumerate(points))
  self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"'+(' stroke-dasharray="8 5"' if dash else '')+'/>')
 def box(self,x,y,w,h,title,lines,fill='#fff',color='#193b53'):
  self.rect(x,y,w,h,fill);self.text(x+17,y+30,title,19,color,weight='700')
  for i,s in enumerate(lines):self.text(x+17,y+57+i*24,s,16,color)
 def write(self,path):Path(path).write_text(''.join(self.parts)+'</svg>')

def axes(s,x,y,w,h,xmin,xmax,ymin,ymax,xticks,yticks,xlabel,ylabel):
 def xy(a,b):return x+w*(a-xmin)/(xmax-xmin),y+h-h*(b-ymin)/(ymax-ymin)
 for a in xticks:
  px,py=xy(a,ymin);s.line(px,y,px,y+h,'#e0e8ef',1);s.text(px,py+26,f'{a:g}',15,anchor='middle')
 for b in yticks:
  px,py=xy(xmin,b);s.line(x,py,x+w,py,'#e0e8ef',1);s.text(px-12,py+5,f'{b:g}',15,anchor='end')
 s.line(x,y+h,x+w,y+h,'#7b91a3',2);s.line(x,y,x,y+h,'#7b91a3',2)
 s.text(x+w/2,y+h+57,xlabel,17,anchor='middle');s.text(x,y-17,ylabel,17)
 return xy
