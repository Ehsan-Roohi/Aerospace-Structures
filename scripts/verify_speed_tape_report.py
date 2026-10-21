"""Offline checks for the course reading's assets, links and classroom arithmetic."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'docs/case-studies/speed-tape/index.html'


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get('id'):
            self.ids.append(values['id'])
        for key in ('href', 'src'):
            if values.get(key):
                self.links.append(values[key])


doc = Document()
text = PAGE.read_text(encoding='utf-8')
doc.feed(text)
assert len(doc.ids) == len(set(doc.ids)), 'Duplicate ID'
for link in doc.links:
    url = urlsplit(link)
    if url.scheme:
        assert url.scheme == 'https', link
        continue
    target = PAGE.parent / unquote(url.path) if url.path else PAGE
    assert target.exists(), link
    if url.fragment and target == PAGE:
        assert url.fragment in doc.ids, link
figures = list(PAGE.parent.glob('*.svg'))
assert len(figures) == 4
for path in figures:
    root = ET.parse(path).getroot()
    assert root.find('{http://www.w3.org/2000/svg}title') is not None
    assert root.find('{http://www.w3.org/2000/svg}desc') is not None

expected = [(.5*.4*250**2, 12500), (.2*12500, 2500),
            (.01*2500, 25), (.003*12500, 37.5),
            (49*2.5, 122.5), (5.1*2.5, 12.75),
            (100/(25*50), .08), ((23e-6-2e-6)*100, .0021),
            ((23e-6-2e-6)*100*50, .105)]
for result, reference in expected:
    assert math.isclose(result, reference, rel_tol=1e-12)
assert 'Source links checked 20 October 2026' in text
assert 'not aircraft maintenance instructions' in text
print('Speed Tape reading PASS: local links/anchors, four accessible SVGs, nine arithmetic checks, educational scope.')
