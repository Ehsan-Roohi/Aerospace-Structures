from pathlib import Path
from html.parser import HTMLParser
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[4];P=Path(__file__).resolve().parent;V=P.parent
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  self.links.extend(v for k,v in attrs if k in ('href','src'))
checks=[]
def check(name,passed):checks.append({'name':name,'passed':bool(passed)})
m=json.loads((P/'manifest.json').read_text())
check('Six raw case files retain exact original bytes and hashes',len(m['rawFiles'])==6 and all(hashlib.sha256((P/x['file']).read_bytes()).hexdigest()==x['sha256']==hashlib.sha256((ROOT/x['sourceRepositoryPath']).read_bytes()).hexdigest() for x in m['rawFiles']))
a=json.loads((P/'disk-physical-sigma-0p5.json').read_text());b=json.loads((P/'disk-explicit-sigma-0p05.json').read_text())
check('Both disk cases retain separate final field passes with all 15 audit fractions',all(d['ok'] and d['directFieldPassed'] and len(d['final']['fieldAudit']['fractions'])==15 and d['final']['fieldAudit']['allSamplesRetained'] for d in (a,b)))
check('Actual complete and first-half contour sample coverage retained',all(len(d['profile']['full'])==1025 and len(d['profile']['firstHalf'])==513 for d in (a,b)))
check('Experimental and mesh qualification flags remain false',all(not d['meshAccuracyQualified'] and not d['experimentalAccuracyQualified'] for d in (a,b)))
h=json.loads((P/'hydrofoil-rejected-roundtrip.json').read_text())['result'];w=json.loads((P/'hydrofoil-controls-and-wet-cases.json').read_text())['actualWetted']
check('Hydrofoil root retains all three negative panels and remains unaccepted',h['checks']['targetSigmaScreen']['wettedBelowVapourPanels']==3 and not h['acceptedForDisplay'] and h['checks']['targetSigmaScreen']['minimumWettedPressureMargin']<-.011)
check('Both actual wet hydrofoils retain passes on both meshes',len(w)==2 and all(v['wetPreflight']['coarse']['passed'] and v['wetPreflight']['fine']['passed'] for v in w.values()))
c=json.loads((P/'disk-reference-comparison.json').read_text())
check('Reference uses achieved sigma and identical physical disk radius',c['sigma_used']==b['achievedSigma'] and c['disk_radius_m']==b['input']['diskRn']==.01 and c['within_reference_sigma_range'] and not c['rear_closure_matched'] and not c['experimental_validation'] and not c['shape_parameter_fitted'])
check('Six rendered figure files are present',all((P/(stem+ext)).stat().st_size>1000 for stem in ('disk-sigma005-reference-overlay','disk-forward-full-shapes','hydrofoil-forward-pressure-status')for ext in ('.png','.svg')))
text=(V/'forward-problems.html').read_text(encoding='utf-8-sig');check('No personal C drive paths in public page or exact raw files','C:\\Users\\' not in text and 'C:\\\\Users\\\\' not in text and all('C:\\Users\\' not in (P/x['file']).read_text(encoding='utf-8-sig') and 'C:\\\\Users\\\\' not in (P/x['file']).read_text(encoding='utf-8-sig') for x in m['rawFiles']))
# Write the linked report before checking its own link.
(P/'qa.json').write_text('{}')
parser=Links();parser.feed(text)
missing=[v for v in parser.links if not v.startswith(('https:','http:','#')) and not (V/v.split('#')[0]).resolve().exists()]
check('Every local page/data/figure link resolves',not missing)
report={'passed':all(x['passed']for x in checks),'checks':checks,'missingLinks':missing,'newBEMSolves':0}
(P/'qa.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2));assert report['passed']
