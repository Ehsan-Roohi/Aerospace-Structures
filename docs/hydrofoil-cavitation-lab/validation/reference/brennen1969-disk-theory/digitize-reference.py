"""Transcribe explicitly selected pixels, not fitted model predictions, from Brennen Fig. 3.
The source scan is private. The resulting numeric reference and metadata are portable.
"""
from pathlib import Path
import csv, json, hashlib, os

HERE=Path(__file__).resolve().parent
if os.name=='nt' and not str(HERE).startswith('\\\\?\\'):HERE=Path('\\\\?\\'+str(HERE))
# Original PDF p.680 (PDF page 10), rendered at scale=5 with pypdfium2.
# Selected horizontal Cp levels avoid labels, arrows, and Rouse's experimental squares.
# Columns are [Cp row, image y, sigma .7 centre x, sigma .3 centre x].
RAW=[
 [.925,386,1093,1114], [.900,405,1137.5,1162], [.875,423,1173.5,1198],
 [.750,516,1280.5,1308], [.700,554,1307.5,1335], [.650,591,1329,1355],
 [.600,628,1347,1368.5], [.550,666,1362,1381.5], [.500,703,1372.5,1393],
 [.450,740,1381.5,1401.5], [.350,815,1396,1411.5], [.300,852,1401.5,1416],
 [.250,890,1407.5,1419.5], [.150,964,1413.5,1422], [.100,1001,1416,1424.5],
 [.050,1039,1418,1426.5]
]
meta={
 'source':{'author':'C. Brennen','year':1969,'title':'A Numerical Solution of Axisymmetric Cavity Flows',
 'doi':'10.1017/S0022112069000802','url':'https://authors.library.caltech.edu/records/46gc9-rw507',
 'page':680,'figure':3,'pdfPageOneBased':10,
 'pdfSha256':'c6b24e4e8137b7becb58b774226aa363b133f1baa26b23f931614c6c55725858'},
 'referenceType':'published numerical theory, manually digitized; not experimental measurements',
 'model':'axisymmetric Riabouchinsky disk cavity',
 'wallQualification':'Page 679 section 9 states that disk Cp at each sigma was indistinguishable for different H/C on the scale of Figure 3. The present solver is unbounded.',
 'pixelCalibration':{'image':'brennen-p680-hires.png','imageSize':[1950,3120],
 'renderScale':5,'r0_x':686,'r1_x':1433,'Cp0_y':1076,'Cp1_y':330,
 'rFormula':'(pixel_x - 686) / 747','CpFormula':'(1076 - pixel_y) / 746'},
 'readingBounds':{'r_R':0.006,'Cp':0.012,
 'meaning':'Conservative scan/manual-reading bounds, not statistical or experimental uncertainty. Pixel upsampling adds no source information.'},
 'sampling':'Sixteen visibly resolved curve samples per sigma. No samples inferred where curves merge with the frame or experimental symbols. The first and last digitized samples are retained.',
 'rimLimits':[{'sigma':.3,'r_R':1.,'Cp':-.3},{'sigma':.7,'r_R':1.,'Cp':-.7}],
 'rimLimitMeaning':'Exact imposed free-surface pressure boundary-condition limits, not independent reference samples.',
 'points':[]
}
for _,y,x7,x3 in RAW:
 for sigma,x in [(.3,x3),(.7,x7)]:
  meta['points'].append({'sigma':sigma,'r_R':(x-686)/747,'Cp':(1076-y)/746,
    'pixel_x':x,'pixel_y':y,'readingBound_r_R':.006,'readingBound_Cp':.012})
(HERE/'brennen-1969-theory-cp.json').write_text(json.dumps(meta,indent=2)+'\n')
with (HERE/'brennen-1969-theory-cp.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=meta['points'][0].keys());w.writeheader();w.writerows(meta['points'])
try:
 from PIL import Image,ImageDraw
 im=Image.open(HERE/'brennen-p680-hires.png').convert('RGB');d=ImageDraw.Draw(im)
 for p in meta['points']:
  x,y=p['pixel_x'],p['pixel_y'];c='#0072B2' if p['sigma']==.3 else '#D55E00'
  d.ellipse((x-7,y-7,x+7,y+7),outline=c,width=2)
 im.crop((650,300,1460,1110)).save(HERE/'digitization-overlay.png')
except FileNotFoundError: pass
print('32 published numerical-reference samples written; no experiment claimed.')
