"""Build the reading page from the authoritative root Markdown using Pandoc."""
from pathlib import Path
import html
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / "MPEMBA_EFFECT.md"
COURSE = "https://github.com/Ehsan-Roohi/Aerospace-Structures"

ast = json.loads(subprocess.run(
    ["pandoc", "--from=gfm+tex_math_dollars+raw_html", "--to=json", str(SOURCE)],
    check=True, capture_output=True, text=True).stdout)


def walk(node):
    if isinstance(node, dict):
        if node.get("t") in ("Link", "Image"):
            target = node["c"][-1]
            if target[0].startswith("docs/case-studies/mpemba/"):
                target[0] = target[0].split("docs/case-studies/mpemba/", 1)[1]
            elif target[0] == "README.md":
                target[0] = COURSE
        for value in node.values():
            walk(value)
    elif isinstance(node, list):
        for value in node:
            walk(value)


walk(ast)
body = subprocess.run(
    ["pandoc", "--from=json", "--to=html5", "--mathjax"], input=json.dumps(ast),
    check=True, capture_output=True, text=True).stdout

styles = """
:root{color-scheme:light;--ink:#183345;--blue:#176d9e;--line:#d6e2e9}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf2f6;color:var(--ink);font:18px/1.75 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
main{max-width:1100px;margin:0 auto;background:#fff;padding:clamp(22px,5vw,72px)}.page-nav{font-size:15px;display:flex;flex-wrap:wrap;gap:10px 24px;border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:35px}
h1{font-size:clamp(30px,4.3vw,46px);line-height:1.18;letter-spacing:-.025em;margin:0 0 28px}h2{font-size:clamp(24px,3vw,31px);line-height:1.3;color:#164a68;margin-top:2em;scroll-margin-top:20px}h3{font-size:23px;color:#164a68;margin-top:1.6em}
p,li{max-width:82ch}a{color:#086ca8;text-underline-offset:3px}a:hover{color:#124864}a:focus-visible{outline:3px solid #d28934;outline-offset:3px}img{display:block;max-width:100%;height:auto;margin:25px auto 12px}figure{margin:24px 0}figcaption{font-size:16px}
table{border-collapse:collapse;display:block;max-width:100%;overflow-x:auto;margin:24px 0;font-size:16px;line-height:1.6}th,td{border:1px solid var(--line);padding:12px 14px;vertical-align:top;text-align:left;min-width:100px}th{background:#edf4f8;color:#164a68}tr:nth-child(even){background:#f8fafc}
.math.display{display:block;max-width:100%;overflow-x:auto;padding:12px 2px;font-size:1.18em}.math.inline{font-size:1.05em}mjx-container{max-width:100%}.math.display mjx-container{margin:.5em 0!important}
code{font-size:.88em;background:#edf3f7;padding:.12em .3em;border-radius:4px}pre{overflow-x:auto;background:#152d3f;color:#f1f6f9;border-radius:9px;padding:20px;font-size:15px}pre code{background:none;padding:0;color:inherit}
div[lang=fa]{background:#f0f6fa;border-inline-start:4px solid #2a7ea6;padding:12px 25px 18px;margin:30px 0;text-align:right}div[lang=fa] p{max-width:none;line-height:2}div[lang=fa] h3{margin-top:8px}
blockquote{border-left:4px solid var(--blue);margin-left:0;padding-left:20px}footer{border-top:1px solid var(--line);margin-top:48px;padding-top:20px;font-size:15px;color:#536977}
@media(max-width:650px){body{font-size:17px}main{padding:26px 20px}th,td{font-size:14px;padding:9px;min-width:110px}.math.display{font-size:1.05em}h1{font-size:32px}}
@media print{body{background:#fff;font-size:11pt}main{padding:0;max-width:none}.page-nav{display:none}h2,h3{break-after:avoid}img,table{break-inside:avoid}a{color:inherit}pre{white-space:pre-wrap}}
"""
page = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Evidence, equations and reproducible examples for the Mpemba effect, freezing water, nonequilibrium relaxation and thermal history. MIE 446, UMass Amherst.">
<title>The Mpemba Effect · MIE 446 Aerospace Structures</title><style>""" + styles + """</style>
<script>window.MathJax={tex:{inlineMath:[['\\\\(','\\\\)']],displayMath:[['\\\\[','\\\\]']]},options:{skipHtmlTags:['script','noscript','style','textarea','pre','code']}};</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
</head><body><main><nav class="page-nav" aria-label="Course navigation">
<a href="https://github.com/Ehsan-Roohi/Aerospace-Structures">MIE 446 course home</a>
<a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/MPEMBA_EFFECT.md">Report on GitHub</a>
<a href="teaching_calculations.py">Calculation source</a><a href="calculations.json">Numerical record</a>
</nav>""" + body + """<footer>Optional interdisciplinary reading. Original synthetic figures; no experimental measurements are presented as new results. Updated 30 October 2026.</footer></main></body></html>
"""
target = HERE / "index.html"
temporary = target.with_suffix(".tmp.html")
temporary.write_text(page)
temporary.replace(target)
print(f"Built {target.relative_to(ROOT)} from {SOURCE.name}")
