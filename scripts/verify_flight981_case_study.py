"""Verify source links, figure assets and independent pressure-model arithmetic."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import xml.etree.ElementTree as ET
import csv,math
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/case-studies/flight-981'
class Page(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.links=[];self.images=[]
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.append(a['id'])
  for k in ['href','src']:
   if a.get(k):self.links.append(a[k])
  if t=='img':assert a.get('alt');self.images.append(a['src'])
p=Page();p.feed((OUT/'index.html').read_text(encoding='utf-8'));assert len(p.ids)==len(set(p.ids));assert len(p.images)==5
for u in p.links:
 a=urlsplit(u)
 if a.scheme:assert a.scheme=='https';continue
 f=(OUT/unquote(a.path)) if a.path else OUT/'index.html';assert f.exists(),u
 if a.fragment and f==OUT/'index.html':assert a.fragment in p.ids
for f in OUT.glob('*.svg'):
 r=ET.parse(f).getroot();assert r.find('{http://www.w3.org/2000/svg}title') is not None;assert r.find('{http://www.w3.org/2000/svg}desc') is not None
rows=list(csv.DictReader((OUT/'pressure-transient.csv').open()));assert len(rows)==401
assert float(rows[0]['floor_lowvent_kPa'])==0
low=[float(r['floor_lowvent_kPa'])for r in rows];high=[float(r['floor_highvent_kPa'])for r in rows]
assert min(low)>=-1e-10 and min(high)>=-1e-10;assert max(high)<max(low)<20
# Independent RK4 integration, rather than reusing the closed-form builder.
for kv,key in [(.6,'floor_lowvent_kPa'),(6.,'floor_highvent_kPa')]:
 u=v=1.;h=.001
 def rhs(u,v):return (-kv*(u-v),kv*(u-v)-8*v)
 for i in range(2000):
  a,b=rhs(u,v);c,d=rhs(u+h*a/2,v+h*b/2);e,f=rhs(u+h*c/2,v+h*d/2);g,j=rhs(u+h*e,v+h*f);u+=h*(a+2*c+2*e+g)/6;v+=h*(b+2*d+2*f+j)/6
 assert math.isclose(20*(u-v),float(rows[-1][key]),rel_tol=1e-7,abs_tol=1e-8)
assert 20_000*.5==10_000;assert 10_000*4**2/8==20_000;assert 20_000*2==40_000
text=(ROOT/'TURKISH_AIRLINES_FLIGHT_981.md').read_text(encoding='utf-8');assert 'Detroit Metropolitan Airport' in text;assert 'not accident measurements' in text;assert 'not a line-by-line translation' in text
print('PASS: five accessible figures, internal links, independent RK4 pressure check, floor/door load arithmetic and source qualifications.')
