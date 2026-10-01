"""Fetch unchanged NASA photographs for the per-effector reading cards."""
from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets/lecture01'
PHOTOS = [
    ('Controls_X48C_Split_Open.jpg',
     'https://www.nasa.gov/wp-content/uploads/2023/03/678011main_ED12-0255-59_full.jpg',
     'https://www.nasa.gov/image-article/x-48c-deploys-split-ailerons/',
     'NASA / Carla Thomas; ED12-0255-59, 7 August 2012'),
    ('Controls_Centurion_Motors.jpg',
     'https://www.nasa.gov/wp-content/uploads/2023/03/304627main_EC98-44803-115_full.jpg',
     'https://www.nasa.gov/reference/centurion/',
     'NASA; EC98-44803-115'),
    ('Controls_HARV_Ground_Test.jpg',
     'https://images-assets.nasa.gov/image/EC91-0075-33/EC91-0075-33~large.jpg',
     'https://www.nasa.gov/reference/f-18-harv/',
     'NASA; EC91-0075-33, 1991'),
    ('Controls_AMELIA_Blowing.jpg',
     'https://www.nasa.gov/wp-content/uploads/2015/02/acd12-0003-019.jpg',
     'https://www.nasa.gov/aeronautics/amelias-innovations-inspire-unusual-dedication/',
     'NASA / Dominic Hart; ACD12-0003-019'),
    ('Controls_F8_Flight_Computer.jpg',
     'https://images-assets.nasa.gov/image/E-24741/E-24741~large.jpg',
     'https://www.nasa.gov/image-detail/amf-e-24741/',
     'NASA; E-24741, 18 July 1971'),
]

def fetch(item):
    name, url, page, credit = item
    target = OUT / name
    if not target.exists():
        data = urlopen(Request(url, headers={'User-Agent':'MIE446-Course/1.0'}), timeout=45).read()
        if not data.startswith(b'\xff\xd8'):
            raise ValueError(f'Expected JPEG: {url}')
        target.write_bytes(data)
    data = target.read_bytes()
    return dict(file=name, source_image=url, source_page=page, credit=credit,
                reuse='NASA photograph; public domain in the United States; no edits',
                sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    records = list(ThreadPoolExecutor(max_workers=5).map(fetch, PHOTOS))
    (OUT / 'EFFECTOR_PHOTO_SOURCES.json').write_text(json.dumps(records, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(records, indent=2))
