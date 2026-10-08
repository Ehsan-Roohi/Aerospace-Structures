"""Scientific figure compositions; keep source photographs unchanged.

Rebuild with --b2-pdf <NASA proceedings> --moog-pdf <MarioValdo.pdf>.
Public source URLs and rights are recorded in FINLESS_LOCATION_SOURCES.json.
Only the relevant figure excerpts are distributed, not the full proceedings.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets/lecture01'
TMP = ROOT / 'tmp/finless-locations'


def excerpt(pdf, page, box, name):
    # Crop coordinates are normalized to the complete rendered PDF page.
    prefix = TMP / name
    subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page),
                    '-scale-to', '3300', '-png', str(pdf), str(prefix)], check=True)
    rendered = next(TMP.glob(name + '-*.png'))
    im = Image.open(rendered)
    w, h = im.size
    im.crop(tuple(round(v * d) for v, d in zip(box, (w, h, w, h)))).save(OUT / (name + '.png'))


def b2_open_photo():
    im = Image.open(OUT / 'Controls_B2_Split_Open.jpg')
    fig = plt.figure(figsize=(13, 4.9), facecolor='white')
    ax = fig.add_axes([.04, .19, .92, .64])
    ax.imshow(im)
    ax.set_xlim(390, 2150)
    ax.set_ylim(870, 450)
    ax.axis('off')
    def callout(text, target, label):
        ax.annotate(text, xy=target, xytext=label, fontsize=16,
                    ha='center', va='center', color='black',
                    bbox=dict(facecolor='white', edgecolor='black', pad=5),
                    arrowprops=dict(arrowstyle='->', color='black', lw=2))
    callout('Upper half raised', (670, 624), (750, 487))
    callout('Lower half lowered', (680, 685), (750, 835))
    callout('Nose / forward', (1970, 585), (1850, 488))
    fig.text(.5, .94, 'B-2: see an actual split drag rudder opened', ha='center', fontsize=23)
    fig.text(.5, .105, 'The outboard trailing-edge assembly separates above AND below the wing.',
             ha='center', fontsize=17)
    fig.text(.5, .05, 'USAF / SRA Diane S. Robinson, 11 June 1995, DF-ST-96-00221. Photo crop + teaching callouts.',
             ha='center', fontsize=12)
    fig.savefig(OUT / 'Controls_B2_Open_Annotated.png', dpi=170)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--b2-pdf', type=Path, required=True)
    parser.add_argument('--moog-pdf', type=Path, required=True)
    args = parser.parse_args()
    TMP.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({'font.family': 'Times New Roman', 'text.color': 'black'})
    excerpt(args.b2_pdf, 83, (.535, .20, .91, .355), 'Controls_B2_Figure7_Source')
    # Wing-control detail: omit the nose and unrelated right-hand text/controller.
    excerpt(args.moog_pdf, 71, (.092, .225, .539, .889), 'Controls_X47B_Moog_Locations')
    b2_open_photo()
    items = [
        {'file': 'Controls_B2_Split_Open.jpg',
         'source_page': 'https://commons.wikimedia.org/wiki/File:B-2_Spirit_at_Le_Bourget_Airport.JPEG',
         'source_image': 'https://upload.wikimedia.org/wikipedia/commons/1/18/B-2_Spirit_at_Le_Bourget_Airport.JPEG',
         'credit': 'USAF / SRA Diane S. Robinson; 11 June 1995; DF-ST-96-00221',
         'rights': 'U.S. military official-duty photograph; public domain in the United States',
         'changes': 'None; original JPEG bytes'},
        {'file': 'Controls_B2_Open_Annotated.png',
         'source_file': 'Controls_B2_Split_Open.jpg',
         'changes': 'Scientific composition with photo crop and labeled arrows; aircraft geometry unaltered'},
        {'file': 'Controls_B2_Figure7_Source.png',
         'source_page': 'https://ntrs.nasa.gov/citations/19990052682',
         'source_pdf': 'https://ntrs.nasa.gov/api/citations/19990052675/downloads/19990052675.pdf#page=83',
         'credit': 'D. R. Dreim, S. B. Jacobson, R. T. Britt; NASA/CP-1999-209136/PT2, 1999, p. 515, Fig. 7',
         'rights': 'NTRS record: Work of the US Gov. Public Use Permitted.',
         'changes': 'Rendered and cropped Figure 7 with original caption; labels unchanged'},
        {'file': 'Controls_X47B_Moog_Locations.png',
         'source_pdf': 'https://cisb.org.br/images/pdf/MarioValdo.pdf#page=71',
         'credit': 'Moog, Flight Control Technology, ABIMAQ workshop, May 2012, slide 70 (PDF p. 71)',
         'rights': 'Moog source figure; copyright retained by source. Limited attributed educational figure excerpt.',
         'changes': 'Cropped wing-control detail; nose and unrelated text/controller outside crop. Original three surface leader lines and labels retained'},
    ]
    for item in items:
        item['sha256'] = hashlib.sha256((OUT / item['file']).read_bytes()).hexdigest()
    (OUT / 'FINLESS_LOCATION_SOURCES.json').write_text(json.dumps(items, indent=2) + '\n', encoding='utf-8')
    print('Built three location/mechanism figures and recorded four source assets.')


if __name__ == '__main__':
    main()
