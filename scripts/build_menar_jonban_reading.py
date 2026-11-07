"""Build the Menar Jonban web reading from its Markdown source."""
from pathlib import Path
import re,subprocess
R=Path(__file__).resolve().parents[1]
base='docs/case-studies/menar-jonban/'
body=subprocess.check_output(['pandoc',str(R/'MENAR_JONBAN.md'),'--from=markdown+tex_math_dollars','--to=html5','--mathjax'],text=True)
body=body.replace(base,'').replace('href="README.md"','href="https://github.com/Ehsan-Roohi/Aerospace-Structures"')
body=body.replace('href="computational/','href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/computational/')
css=re.search(r'<style>(.*?)</style>',(R/'docs/case-studies/navigation-without-gps/index.html').read_text(),re.S).group(1)
headings=re.findall(r'<h2 id="([^"]+)">(.*?)</h2>',body,re.S)
toc='<details class="toc"><summary>Contents</summary><ol>'+''.join(f'<li><a href="#{i}">{t}</a></li>' for i,t in headings)+'</ol></details>'
body=body.replace('<h2 ',toc+'<h2 ',1)
body=re.sub(r'(<h2 id="[^"]+">خلاصهٔ فارسی</h2>)(.*)$',r'<section lang="fa">\1\2</section>',body,flags=re.S)
head='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Menar Jonban · MIE 446</title><style>'+css+'</style><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script></head><body><main>'
nav='<nav><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures#engineering-readings-and-case-studies">Course readings</a> · <a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/MENAR_JONBAN.md">GitHub source</a> · <a href="../../../wing-lab.html">BeamLab</a></nav>'
nav=nav.replace('../../../wing-lab.html','../../wing-lab.html')
(R/base/'index.html').write_text(head+nav+body+'</main></body></html>')
print('Built Menar Jonban HTML')
