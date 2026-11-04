"""Build the published reading from BLUE_LED.md using Pandoc."""
from pathlib import Path
import re
import subprocess
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'BLUE_LED.md'
body=subprocess.check_output(['pandoc',str(source),'--from=markdown+tex_math_dollars','--to=html5','--mathjax'],text=True)
body=body.replace('docs/case-studies/blue-led/','').replace('href="README.md"','href="https://github.com/Ehsan-Roohi/Aerospace-Structures"')
old=(ROOT/'docs/case-studies/feynman-sprinkler/index.html').read_text()
css=re.search(r'<style>(.*?)</style>',old,re.S).group(1)
css+=' .math.display{background:#f1f6fa;border-left:4px solid #2669c9;padding:16px;box-sizing:border-box}h2{scroll-margin-top:20px} table img{max-height:310px;width:auto;max-width:100%;margin:12px auto;object-fit:contain} table:has(img){table-layout:fixed;width:100%} table:has(img) td{width:33.333%;vertical-align:top}.toc{background:#eef5fa;padding:20px;line-height:1.9} img{width:100%} [lang=fa]{direction:rtl}'
head='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Blue LED · MIE 446</title><meta name="description" content="A detailed illustrated blue LED case study: semiconductor physics, crystal growth, carrier activation, 33 equations, 10 original figures, 7 real photographs, thermal stress and reproducible calculations."><style>'''+css+'''</style><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script></head><body><main>'''
nav='''<nav><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures#engineering-readings-and-case-studies">Course readings</a> · <a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/BLUE_LED.md">GitHub source</a> · <a href="teaching_calculations.py">Calculation script</a> · <a href="calculations.json">Numerical record</a></nav>'''
headings=re.findall(r'<h2 id="([^"]+)">(.*?)</h2>',body)
toc='<details class="toc"><summary>Contents · 17 sections plus Persian summary</summary><ol>'+''.join(f'<li><a href="#{i}">{t}</a></li>' for i,t in headings)+'</ol></details>'
body=body.replace('<h2 ',toc+'<h2 ',1)
body=re.sub(r'(<h2 id="[^"]+">خلاصهٔ فارسی</h2>)(.*)$',r'<section lang="fa">\1\2</section>',body,flags=re.S)
(ROOT/'docs/case-studies/blue-led/index.html').write_text(head+nav+body+'</main></body></html>')
print('Built Blue LED reading; equations use MathJax and require internet.')
