"""Build the navigation enrichment reading with Pandoc and MathJax."""
from pathlib import Path
import re,subprocess
R=Path(__file__).resolve().parents[1]
base='docs/case-studies/navigation-without-gps/'
body=subprocess.check_output(['pandoc',str(R/'NAVIGATION_WITHOUT_GPS.md'),'--from=markdown+tex_math_dollars','--to=html5','--mathjax'],text=True)
body=body.replace(base,'').replace('href="README.md"','href="https://github.com/Ehsan-Roohi/Aerospace-Structures"')
body=body.replace('href="scripts/','href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/scripts/')
css=re.search(r'<style>(.*?)</style>',(R/'docs/case-studies/blue-led/index.html').read_text(),re.S).group(1)
css+=' .toc{background:#eef5fa;padding:20px} img{max-height:850px;object-fit:contain} .footnote-ref{font-size:.9em}'
headings=re.findall(r'<h2 id="([^"]+)">(.*?)</h2>',body)
toc='<details class="toc"><summary>Contents</summary><ol>'+''.join(f'<li><a href="#{i}">{t}</a></li>' for i,t in headings)+'</ol></details>'
body=body.replace('<h2 ',toc+'<h2 ',1)
body=re.sub(r'(<h2 id="[^"]+">خلاصهٔ فارسی</h2>)(.*)$',r'<section lang="fa">\1\2</section>',body,flags=re.S)
head='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Navigation Without GPS · MIE 446</title><meta name="description" content="An illustrated engineering lesson with 13 visuals: sensing, uncertainty, camera brackets and vibration."><style>'+css+'</style><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script></head><body><main>'
nav='<nav><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures#engineering-readings-and-case-studies">Course readings</a> · <a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/NAVIGATION_WITHOUT_GPS.md">GitHub source</a> · <a href="teaching_calculations.py">Laboratory calculations</a></nav>'
(R/base/'index.html').write_text(head+nav+body+'</main></body></html>')
print('Built illustrated HTML edition')
