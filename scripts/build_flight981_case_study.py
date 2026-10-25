"""Original DC-10 load-path figures and a deliberately idealized pressure model.
Run with the bundled Python runtime (Pillow). No historical pressure trace is fitted.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from html import escape
import math,csv,json
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/case-studies/flight-981';OUT.mkdir(parents=True,exist_ok=True)
INK='#1b3144';BLUE='#176b94';RED='#b33939';GOLD='#a66612';GREEN='#287965'
class Figure:
 def __init__(self,name,title,desc,w=1200,h=620):
  self.name=name;self.w=w;self.h=h;self.im=Image.new('RGB',(w,h),'white');self.d=ImageDraw.Draw(self.im);self.svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><rect width="100%" height="100%" fill="white"/>'];self.text(28,19,title,26,bold=True)
 def line(self,a,b,c=INK,width=3,dash=False):
  if dash:
   length=math.dist(a,b)
   for k in range(0,int(length),16):
    t=min(k+9,length);self.d.line([(a[0]+(b[0]-a[0])*k/length,a[1]+(b[1]-a[1])*k/length),(a[0]+(b[0]-a[0])*t/length,a[1]+(b[1]-a[1])*t/length)],fill=c,width=width)
  else:self.d.line((a,b),fill=c,width=width)
  self.svg.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{c}" stroke-width="{width}"'+(' stroke-dasharray="9 7"'if dash else '')+'/>')
 def rect(self,x,y,w,h,fill='#f1f6f9',stroke=INK):
  self.d.rectangle((x,y,x+w,y+h),fill=fill,outline=stroke,width=2);self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
 def text(self,x,y,t,size=20,c=INK,bold=False):
  font_name=('C:/Windows/Fonts/'+('arialbd.ttf'if bold else 'arial.ttf')) if Path('C:/Windows/Fonts/arial.ttf').exists() else ('DejaVuSans-Bold.ttf'if bold else 'DejaVuSans.ttf');font=ImageFont.truetype(font_name,size);self.d.text((x,y),t,font=font,fill=c);self.svg.append(f'<text x="{x}" y="{y+size*.86}" font-family="Arial,sans-serif" font-size="{size}" fill="{c}"'+(' font-weight="700"'if bold else '')+'>'+escape(t)+'</text>')
 def arrow(self,a,b,c=RED,width=3):
  self.line(a,b,c,width);angle=math.atan2(b[1]-a[1],b[0]-a[0]);v=[b,(b[0]-12*math.cos(angle-.45),b[1]-12*math.sin(angle-.45)),(b[0]-12*math.cos(angle+.45),b[1]-12*math.sin(angle+.45))];self.d.polygon(v,fill=c);self.svg.append('<polygon points="'+' '.join(f'{x},{y}'for x,y in v)+f'" fill="{c}"/>')
 def save(self):
  self.svg.append('</svg>');(OUT/(self.name+'.svg')).write_text('\n'.join(self.svg),encoding='utf-8');self.im.save(OUT/(self.name+'.png'))

f=Figure('pressure-path','The floor acquires a new pressure load','Two conceptual compartment sections compare equal cabin/cargo pressure with cargo depressurization. Pressure on the floor then acts downward; control cables lie below it.')
for x,label in [(60,'Before the door opens'),(650,'Immediately after cargo decompression')]:
 f.text(x,83,label,22,bold=True);f.rect(x,135,475,320,fill='#f7fafc');f.rect(x+2,138,471,152,fill='#eef5fb',stroke='#eef5fb');f.rect(x+2,297,471,155,fill='#f3f5f7',stroke='#f3f5f7');f.line((x,294),(x+475,294),INK,7);f.text(x+24,167,'Passenger cabin',23);f.text(x+24,348,'Cargo compartment',23);f.line((x+35,319),(x+425,319),GOLD,5);f.text(x+45,421,'Control cables below the floor',18,c=GOLD)
f.text(85,218,'p_cabin ≈ p_cargo',24,c=BLUE);f.text(85,486,'Passenger / cargo loads exist,',20);f.text(85,514,'but little pressure difference across floor.',20)
f.text(680,215,'p_cabin > p_cargo',24,c=RED)
for x in [715,815,915,1015,1085]:f.arrow((x,245),(x,286),RED)
f.line((650,357),(650,412),'white',5);f.arrow((652,382),(590,382),BLUE,5);f.text(560,400,'Opening',17,c=BLUE);f.text(675,486,'Δp_floor(t) = p_cabin(t) − p_cargo(t)',21,c=RED);f.text(675,518,'Downward pressure load bends the floor.',20)
f.text(28,581,'Conceptual section, not DC-10 geometry. Normal passenger loads and shell pressure loads are omitted.',17);f.save()

f=Figure('latch-load-path','Closed, latched and locked are different states','A load-path schematic contrasts a correctly latched and locked door with the unintended actuator-support load path. This is not a dimensioned latch drawing.',h=650)
for x,title in [(45,'Intended restraint'),(645,'Faulted restraint')]:
 f.text(x,81,title,23,bold=True)
 for y,txt in [(135,'Pressure load on outward-opening door'),(240,'Latch hooks and fuselage spools')]:f.rect(x,y,500,65);f.text(x+16,y+21,txt,20);f.arrow((x+250,y+65),(x+250,y+96),BLUE)
f.rect(45,345,500,93,fill='#edf6f0');f.text(62,363,'Over-center linkage + engaged lock pins',20,bold=True);f.text(62,395,'Restrain latch rotation and opening.',20)
f.rect(645,345,500,93,fill='#fff0ee');f.text(661,361,'Not over-center; lock pins not engaged',20,bold=True);f.text(661,394,'Pressure back-drives operating linkage.',20)
f.arrow((895,439),(895,469));f.rect(645,475,500,83,fill='#fff0ee');f.text(661,492,'Actuator support → attachment bolts',21,bold=True);f.text(661,524,'Unintended restraint path fails.',20)
f.text(65,484,'Handle position and warning indication',20);f.text(65,516,'must establish actual latch/lock state.',20)
f.text(28,603,'Functional schematic based on the inquiry, printed p. 38. It does not reproduce the mechanism or its geometry.',17);f.save()

# Equal pressure capacitance, linearized conductances: du=-kv(u-v), dv=kv(u-v)-ko*v.
def pressures(t,kv,ko=8.):
 disc=math.sqrt(ko*ko+4*kv*kv);lp=-(2*kv+ko)/2+disc/2;lm=-(2*kv+ko)/2-disc/2;a=ko/disc
 delta=a*(math.exp(lp*t)-math.exp(lm*t));u=1-kv*a*((math.exp(lp*t)-1)/lp-(math.exp(lm*t)-1)/lm);return u,u-delta,delta
f=Figure('pressure-transient','Venting changes the pressure difference across the floor','Calculated curves from an explicitly assumed linear two-compartment model, not accident measurements. Higher intercompartment conductance lowers the maximum floor differential.',h=630)
left,top,w,h=110,130,1000,340
for j in range(5):
 y=top+h-j*h/4;f.line((left,y),(left+w,y),'#d9e1e7',1);f.text(57,y-10,str(j*5),18)
for j in range(5):f.text(left+j*w/4-10,487,f'{j*.5:.1f}',18)
f.line((left,top),(left,top+h),INK,2);f.line((left,top+h),(left+w,top+h),INK,2)
f.text(33,78,'Floor pressure difference (kPa)',20);f.text(535,521,'Time (s)',20)
rows=[]
for i in range(401):
 t=i/200;u,v,d=pressures(t,.6);_,_,d2=pressures(t,6.);rows.append((t,20*u,20*v,20*d,20*d2))
for index,color,dashed in [(3,RED,False),(4,BLUE,True)]:
 for a,b in zip(rows,rows[1:]):f.line((left+a[0]/2*w,top+h-a[index]/20*h),(left+b[0]/2*w,top+h-b[index]/20*h),color,3)
f.line((580,83),(635,83),RED,4);f.text(648,71,'Lower vent conductance',19,c=RED)
f.line((580,110),(635,110),BLUE,4);f.text(648,99,'Higher vent conductance',19,c=BLUE)
f.text(30,565,'Assumed: initial overpressure 20 kPa; cargo outflow coefficient 8 /s; vent coefficients 0.6 and 6 /s.',17);f.text(30,592,'Equal pressure capacitances; linear surrogate. Not compressible-flow sizing or reconstructed Flight 981 data.',17);f.save()
with (OUT/'pressure-transient.csv').open('w',newline='')as file:
 wr=csv.writer(file);wr.writerow(['time_s','cabin_lowvent_kPa','cargo_lowvent_kPa','floor_lowvent_kPa','floor_highvent_kPa']);wr.writerows(rows)
(OUT/'pressure-model.json').write_text(json.dumps({'model':'linear equal-capacitance two-compartment surrogate','initial_overpressure_kPa':20,'cargo_outflow_per_s':8,'vent_conductance_per_s':[.6,6],'time_end_s':2,'measured_accident_data':False},indent=2))

f=Figure('floor-beam','From pressure on a floor strip to beam bending','A simply supported illustrative floor beam has a four metre span and a half metre tributary width. A prescribed twenty kilopascal floor differential gives ten kilonewtons per metre. All dimensions are assumed.',h=550)
f.text(50,85,'Assumed classroom example — not recovered DC-10 dimensions or loads',21,bold=True)
f.line((140,295),(1050,295),INK,9)
for x in range(150,1051,75):f.arrow((x,165),(x,277),RED,3)
f.text(365,118,'q = Δp × s = 20 kPa × 0.5 m = 10 kN/m',23,c=RED)
for x in [140,1050]:
 f.line((x,300),(x-25,335),INK,3);f.line((x,300),(x+25,335),INK,3);f.line((x-25,335),(x+25,335),INK,3)
f.line((140,388),(1050,388),INK,2)
for x in [140,1050]:f.line((x,371),(x,401),INK,2)
f.text(493,400,'L = 4 m',23);f.text(95,345,'R = 20 kN',20);f.text(975,345,'R = 20 kN',20)
f.line((250,321),(930,321),GOLD,4,dash=True);f.text(350,451,'Critical systems must survive the deformation envelope below this beam.',19,c=GOLD)
f.text(30,504,'M_max = qL²/8 = 20 kN·m. Static illustration only: dynamic pressure history and real restraints matter.',18);f.save()

f=Figure('failure-chain','One structural event can defeat nominally redundant controls','The failure chain links incorrect door restraint, decompression, floor damage and a shared control-routing zone. Three drawn paths are conceptual, not the actual DC-10 circuit count.',h=640)
labels=[('Incorrect door restraint','Indication does not prove engagement'),('Door separates','Cargo pressure falls rapidly'),('Floor differential develops','Floor bends / deforms / disrupts'),('Shared routing zone damaged','Control authority is lost')]
for i,(a,b)in enumerate(labels):
 y=95+i*116;f.rect(45,y,610,85,fill='#fff5ee'if i<3 else '#fff0ee');f.text(63,y+14,a,23,bold=True);f.text(63,y+49,b,19)
 if i<3:f.arrow((350,y+85),(350,y+108),RED)
f.rect(785,215,330,260,fill='#f7fafc');f.text(806,235,'One floor damage zone',20,bold=True)
for i,color in enumerate([BLUE,GREEN,GOLD]):
 y=306+i*55;f.line((735,y),(1155,y),color,5);f.line((930,y-12),(956,y+12),RED,5);f.line((930,y+12),(956,y-12),RED,5)
f.text(774,498,'Separate circuits can share',20);f.text(774,529,'the same physical vulnerability.',20)
f.text(28,600,'Conceptual control paths only. Physical separation and structural protection require a system-level assessment.',17);f.save()
print('Five SVG + PNG figures and reproducible pressure-model data written.')
