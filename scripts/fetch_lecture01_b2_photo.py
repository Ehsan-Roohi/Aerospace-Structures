"""Retrieve an unchanged, attributed USAF B-2 photograph for the course."""
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'docs/assets/lecture01'
URL = 'https://upload.wikimedia.org/wikipedia/commons/4/47/B-2_Spirit_original.jpg'

def main():
    data = urlopen(Request(URL, headers={'User-Agent': 'MIE446 teaching photo archive'}), timeout=45).read()
    assert data[:3] == b'\xff\xd8\xff', 'Expected a JPEG'
    (ASSETS/'Controls_B2_Flying_Wing.jpg').write_bytes(data)
    record = dict(file='Controls_B2_Flying_Wing.jpg', source_image=URL,
        source_page='https://commons.wikimedia.org/wiki/File:B-2_Spirit_original.jpg',
        credit='U.S. Air Force / Staff Sgt. Bennie J. Davis III',
        date='2006-05-30', source_id='060530-F-5040D-220',
        license='Public domain in the United States; U.S. federal government work',
        changes='None; original JPEG bytes retained', sha256=hashlib.sha256(data).hexdigest())
    (ASSETS/'B2_PHOTO_SOURCE.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
    print(record)

if __name__ == '__main__':
    main()
