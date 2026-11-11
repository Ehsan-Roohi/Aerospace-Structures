"""Build the two 11 November 2026 enrichment readings using Pandoc."""
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STYLE = '''body{margin:0;background:#edf3f7;color:#18364a;font:18px/1.75 system-ui}main{max-width:1050px;margin:auto;background:white;padding:40px}h1{line-height:1.2}h2{color:#125c73;margin-top:2em}a{color:#086886}img{max-width:100%;height:auto}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #ccd7df;padding:10px;text-align:left}.math.display{display:block;overflow:auto;padding:16px;background:#f1f6fa}.video{width:100%;aspect-ratio:16/9;border:0}nav{padding:12px;background:#edf3f7} @media(max-width:640px){main{padding:20px}body{font-size:16px}}'''
READINGS = [('SKYREACH_CARGO_DRONE.md', 'skyreach', 'Skyreach: flight endurance and engineering'), ('TWO_NANOMETER_CHIPS.md', '2nm-chips', 'The 2 nm manufacturing challenge')]

def build():
    for filename, slug, title in READINGS:
        text = (ROOT / filename).read_text()
        text = text.replace(f'docs/case-studies/{slug}/', '')
        text = text.replace('(READINGS.md)', '(https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md)')
        body = subprocess.run(['pandoc', '-f', 'markdown+tex_math_dollars', '-t', 'html5', '--mathjax'], input=text, text=True, capture_output=True, check=True).stdout
        if slug == 'skyreach':
            for vid in ['KROJ9-dUIqk', 'HduWl_6-BH4', 'r0Hmt6UIwP4']:
                player = f'<iframe class="video" loading="lazy" src="https://www.youtube-nocookie.com/embed/{vid}" title="Official Skyways video {vid}" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>'
                pattern = rf'<p><a\s+href="https://www.youtube.com/watch\?v={re.escape(vid)}">.*?</a></p>'
                body, count = re.subn(pattern, lambda m: player + m.group(), body, count=1, flags=re.S)
                if count != 1:
                    raise ValueError(f'Missing video thumbnail {vid}')
        html = f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · MIE 446</title><style>{STYLE}</style><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script></head><body><main><nav><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md">All readings</a> · <a href="../skyreach/">Skyreach</a> · <a href="../2nm-chips/">2 nm chips</a></nav>{body}</main></body></html>\n'
        (ROOT / 'docs' / 'case-studies' / slug / 'index.html').write_text(html)

if __name__ == '__main__':
    build()
