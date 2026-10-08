"""Prepare only this independent lecture's attributed assets and scientific figures.

Run with --originals PATH to import the already-created teaching drawings.
Remote photographs are fetched only from the explicit provenance list below.
Museum report pages and film frames are deliberately not reproduced.
"""
import argparse
import json
import shutil
from pathlib import Path
from urllib.request import Request, urlopen
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets/wing-structure'
OUT.mkdir(parents=True, exist_ok=True)
INK, BLUE, RED, RIB = '#19364b', '#197da6', '#b42b37', '#b76b26'
plt.rcParams.update({'font.size': 13, 'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.labelcolor': INK, 'text.color': INK, 'figure.facecolor': 'white'})
ORIGINALS = [
 'Airfoils_The_Wind_Rises', 'Aluminum_Extrusion_Process', 'Duralumin_Age_Hardening',
 'Flutter_Mechanism', 'Metal_Wing_Skins_Exploded', 'Skin_Forming_and_Spar_Joint',
 'Spar_Built_Up_vs_Extruded', 'Wing_No_Spar_Possible_Failure',
 'Wing_No_Stringers_Possible_Failure',
]
PHOTOS = [
 {'file':'Wright_1903_Wing.gif', 'url':'https://www1.grc.nasa.gov/wp-content/uploads/wing.gif',
  'source':'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/wing-geometry/',
  'credit':'NASA Glenn educational page; photograph of a model of the Wright 1903 wing, not a 1903 photograph.',
  'rights':'NASA educational media; no endorsement implied. Retain source credit.',
  'note':'Cloth removed to reveal spars and ribs. The early wing was externally braced, unlike the cantilever example.'},
 {'file':'Mitsubishi_1MF10.jpg', 'url':'https://upload.wikimedia.org/wikipedia/commons/e/ea/Mitsubishi_1MF10.jpg',
  'source':'https://commons.wikimedia.org/wiki/File:Mitsubishi_1MF10.jpg',
  'credit':'Unknown historical photographer; Wikimedia Commons description.',
  'rights':'Commons marks PD-Japan-oldphoto and PD-1996.',
  'note':'400 x 149 pixels. Commons provenance traces to a forum; a photograph is not a spar manufacturing drawing.'},
 {'file':'Ka14_First_Prototype.jpg', 'url':'https://upload.wikimedia.org/wikipedia/commons/9/97/Kyushi_Tanza_Sentoki.jpg',
  'source':'https://commons.wikimedia.org/wiki/File:Kyushi_Tanza_Sentoki.jpg',
  'credit':'Unknown historical photographer; Wikimedia Commons description.',
  'rights':'Commons marks PD-Japan-oldphoto and PD-1996.',
  'note':'450 x 200 pixels. Historical first-prototype Ka-14 with inverted-gull wing; not the final production A5M.'},
 {'file':'Horikoshi_1938.jpg', 'url':'https://upload.wikimedia.org/wikipedia/commons/e/e7/Jiro_Horikoshi_193810.jpg',
  'source':'https://commons.wikimedia.org/wiki/File:Jiro_Horikoshi_193810.jpg',
  'credit':'Unknown historical photographer; Wikimedia Commons description, October 1938.',
  'rights':'Commons marks PD-Japan-oldphoto and PD-1996.',
  'note':'Source description identifies family-held historical photograph; do not infer an engineering detail from this portrait.'},
 {'file':'Zero_A6M5_Museum.jpg', 'url':'https://ids.si.edu/ids/deliveryService?id=NASM-A19600335000-NASM2018-10489-000001&max_w=900',
  'source':'https://airandspace.si.edu/collection-media/NASM-A19600335000-NASM2018-10489-000001',
  'credit':'Eric Long / Smithsonian National Air and Space Museum; 23 May 2016.',
  'rights':'CC0, explicitly stated by the Smithsonian media record.',
  'note':'Surviving A6M5 Model 52; not the 1939 A6M1 prototype or its accident aircraft.'},
 {'file':'NASA_Adaptive_Wing.png', 'url':'https://www.nasa.gov/wp-content/uploads/2025/12/lrc-2023-ocio-p-02025.png',
  'source':'https://www.nasa.gov/aeronautics/nasa-boeing-test-aircraft-wings/',
  'credit':'NASA / Mark Knopp, Integrated Adaptive Wing Technology Maturation wind-tunnel model.',
  'rights':'NASA media, credit retained; no endorsement implied.',
  'note':'Scaled experimental model, not a full-size operational airliner. Source article published 18 December 2025.'},
]

def save(fig, name):
    for ext in ['png','svg']:
        target = OUT / f'{name}.{ext}'
        fig.savefig(target, dpi=160, bbox_inches='tight')
        if ext == 'svg':
            # Matplotlib path serialization adds spaces before newlines.
            target.write_text('\n'.join(line.rstrip() for line in target.read_text(encoding='utf-8').splitlines())+'\n', encoding='utf-8')
    plt.close(fig)

def scientific_figures():
    fig, ax = plt.subplots(1, 2, figsize=(13, 6))
    z = np.linspace(0, 1, 200)
    ax[0].plot(np.zeros_like(z), z, '--', color=BLUE, label='Straight reference')
    ax[0].plot(.2*np.sin(np.pi*z), z, color=RED, lw=3, label='Buckled shape (exaggerated)')
    for zz, end in [(1.28,1.03),(-.28,-.03)]:
        ax[0].annotate('', (0,end), (0,zz), arrowprops={'arrowstyle':'->','color':INK,'lw':2})
    ax[0].scatter([0,0],[0,1], color=INK, s=75)
    ax[0].text(-.32,1.17,'Compression P'); ax[0].text(.23,.48,'Lateral\ndeflection')
    ax[0].set(xlim=(-.5,.55), ylim=(-.35,1.35), title='A  Column: loss of lateral stability')
    ax[0].axis('off'); ax[0].legend(loc='lower left', frameon=False, fontsize=11)
    x = np.linspace(0,1,350)
    ax[1].plot(x, np.zeros_like(x),'--',color=BLUE,label='Flat reference')
    ax[1].plot(x,.14*np.sin(3*np.pi*x),color=RED,lw=3,label='Wrinkled plate (schematic)')
    for xx, end in [(-.2,-.02),(1.2,1.02)]:
        ax[1].annotate('', (end,0), (xx,0), arrowprops={'arrowstyle':'->','color':INK,'lw':2})
    ax[1].text(.15,.3,'A thin skin panel can buckle before\nits material reaches its yield stress.')
    ax[1].set(xlim=(-.25,1.25),ylim=(-.35,.5),title='B  Plate: out-of-plane wrinkles')
    ax[1].axis('off');ax[1].legend(loc='lower center',frameon=False,fontsize=11)
    fig.suptitle('Buckling is instability - not the same as cracking or fracture',fontsize=19)
    fig.text(.08,.015,'Illustrations only: no load threshold, crack location or wing safety is predicted.',fontsize=12)
    fig.tight_layout(rect=(0,.06,1,.91));save(fig,'Buckling_Column_and_Plate')

    # A measured-axis view removes the ambiguity of curves in a plan-view diagram.
    # This isolated beam/strip is not a rectangular wing-skin plate model.
    q, EI, total, a = 2., .2, .45, .15
    y=np.linspace(0,total,901)
    def ss(x,L): return q*x*(L**3-2*L*x**2+x**3)/(24*EI)
    local=np.mod(y,a)
    with_ribs=ss(local,a)*1000
    without=ss(y,total)*1000
    fig,ax=plt.subplots(2,1,figsize=(12,8),sharex=True)
    for panel,curve,stations,title in [
        (ax[0],with_ribs,[0,150,300,450],'A  Intermediate ribs: three supported 150 mm bays'),
        (ax[1],without,[0,450],'B  Intermediate ribs removed: one 450 mm supported bay')]:
        panel.axhline(0,color=BLUE,ls='--',lw=2,label='Blue dashed: unloaded reference z = 0')
        panel.plot(y*1000,-curve,color=RED,lw=2.6,label='Red: loaded displacement z(y)')
        for station in stations:
            panel.scatter(station,0,marker='^',s=100,color=RIB,zorder=5)
            panel.text(station+.8,.35,'Rib',color=RIB,fontsize=10)
        for station in np.arange(35,450,55):
            panel.annotate('',(station,-.05),(station,1.05),arrowprops={'arrowstyle':'->','color':INK})
        panel.set(title=title,ylabel='Displacement z (mm)',ylim=(-6.1,1.4),xlim=(-8,480))
        panel.grid(alpha=.17);panel.legend(loc='lower left',fontsize=10,frameon=False)
        panel.text(250,-1.5,f'Maximum downward displacement = {curve.max():.3f} mm',fontsize=11,
                   bbox={'facecolor':'white','edgecolor':'none','alpha':.9})
    ax[1].set_xlabel('Distance along isolated stiffener strip (mm)')
    fig.suptitle('What does the red curve mean? A side view with actual displacement units',fontsize=17)
    fig.text(.04,.015,'Toy 1-D simply-supported strip: q = 2 N/m, EI = 0.20 N m². NOT a prediction for a 2-D skin panel or printed wing.',fontsize=10)
    fig.tight_layout(rect=(0,.045,1,.94));save(fig,'Rib_Removal_Side_View')

    # Same source construction rule as PROJECT.md; no optimization claim.
    ribs=[112.5,146,154,225,296,304,337.5]
    fig,ax=plt.subplots(figsize=(12,4.5))
    ax.fill_between([0,450],[70,45],[-70,-45],color='#e2edf2')
    for station in [150,300]:
        ax.axvline(station,color=INK,ls='--',lw=1.8)
        ax.text(station,-88,f'Seam: {station} mm',fontsize=10,ha='center')
    for i,station in enumerate(ribs):
        h=70-25*station/450
        ax.plot([station,station],[-h,h],color=RIB,lw=3)
        yy=93 if i%2==0 else 131
        ax.annotate(f'{station:g} mm',(station,h),xytext=(station,yy),ha='center',fontsize=10,
                    arrowprops={'arrowstyle':'-','color':RIB})
    for frac in [.30,.60]:ax.plot([0,450],[(frac-.5)*140,(frac-.5)*90],color=BLUE,lw=3)
    ax.set(xlim=(-15,470),ylim=(-155,155),xlabel='Semi-span station y (mm)',yticks=[],title='Our baseline: 3 interior ribs + 4 seam-support ribs = 7')
    ax.text(6,-130,'Blue: two rod paths. Brown: rib mid-planes. Dashed: module seams.',fontsize=11)
    fig.text(.05,.01,'Construction rule, not an optimized strength result. End caps are separate; seam ribs do not themselves join the modules.',fontsize=10)
    fig.tight_layout(rect=(0,.05,1,1));save(fig,'Printed_Wing_Seven_Ribs')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--originals',type=Path);parser.add_argument('--offline',action='store_true')
    args=parser.parse_args()
    if args.originals:
        for name in ORIGINALS:
            for ext in ['png','svg']:shutil.copy2(args.originals/f'{name}.{ext}',OUT/f'{name}.{ext}')
    box=ROOT/'docs/assets/lecture01/Wing_Box_Section.png'
    if box.exists():shutil.copy2(box,OUT/box.name)
    for photo in PHOTOS:
        target=OUT/photo['file']
        if not target.exists() and not args.offline:
            request=Request(photo['url'],headers={'User-Agent':'MIE446 educational image attribution/1.0'})
            with urlopen(request,timeout=60) as response:target.write_bytes(response.read())
        if not target.exists():raise FileNotFoundError(target)
    scientific_figures()
    records=PHOTOS+[{'file':f'{name}.png','credit':'Original MIE 446 explanatory schematic',
                    'rights':'Course teaching figure; not an aircraft manufacturing drawing.'} for name in ORIGINALS]
    records += [{'file':f'{name}.png','credit':'Original MIE 446 scientific teaching figure',
                 'rights':'Course teaching schematic, not a certification or manufacturing drawing.'}
                for name in ['Buckling_Column_and_Plate','Rib_Removal_Side_View',
                             'Printed_Wing_Seven_Ribs','Wing_Box_Section']]
    (OUT/'PHOTO_SOURCES.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Prepared lecture assets: {OUT}')

if __name__=='__main__':main()
