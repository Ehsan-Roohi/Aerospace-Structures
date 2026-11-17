"""Build the two spaceflight case studies from their root Markdown sources.

Requires Pandoc on PATH; generated pages use the shared local stylesheet.
Run from any directory: python tools/build_spaceflight_readings.py
"""
import re
import subprocess
from pathlib import Path
from html import escape, unescape

ROOT = Path(__file__).resolve().parents[1]
PAGES = [
    ("DREAM_CHASER_SPACEPLANE.md", "dream-chaser", "Dream Chaser", 19,
     "Composite structures, reusable TPS, orbital propulsion and runway recovery."),
    ("ARTEMIS_MOON_ARCHITECTURE.md", "artemis", "Artemis", 27,
     "SLS, Orion, commercial lunar landers and the current mission architecture."),
]


def render(file, slug, short, sources, description):
    source = (ROOT / file).read_text()
    # Paths work in GitHub Markdown; the web page lives alongside its own assets.
    source = source.replace(f"docs/case-studies/{slug}/", "./")
    source = source.replace("docs/case-studies/spaceflight_calculations.py",
                            "../spaceflight_calculations.py")
    other = PAGES[1] if slug == "dream-chaser" else PAGES[0]
    source = source.replace(f"]({other[0]})", f"](../{other[1]}/)")
    source = source.replace("](READINGS.md)",
        "](https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md)")
    # Keep primary-source callouts clickable without requiring a script.
    source = re.sub(r"\[([AD]\d+(?:–[AD]\d+)?)\](?!\()",
        lambda m: f'<a class="citation" href="#{m.group(1).split("–")[0].lower()}">[{m.group(1)}]</a>',
        source)
    # Preserve complete HTML5 media blocks; Markdown parsing inside <video>
    # can otherwise turn its closing tag into fallback paragraph content.
    media_blocks = []
    def keep_media(match):
        media_blocks.append(match.group())
        return f'<!--SPACEFLIGHT_MEDIA_{len(media_blocks)-1}-->'
    source = re.sub(r"<video\b.*?</video>", keep_media, source, flags=re.S)
    body = subprocess.check_output([
        "pandoc", "--from=markdown", "--to=html5", "--mathjax",
        "--section-divs", "--toc", "--toc-depth=2", "--standalone",
        "--metadata", f"title={short}", "--metadata", "lang=en",
    ], input=source, text=True)
    body = re.search(r"<body[^>]*>(.*)</body>", body, re.S).group(1)
    for i, media in enumerate(media_blocks):
        body = body.replace(f'<!--SPACEFLIGHT_MEDIA_{i}-->', media)
    assert body.count("<video") == len(media_blocks)
    body = re.sub(r'<header id="title-block-header">.*?</header>', "", body,
                  flags=re.S)
    # Put navigation after the main title and introductory metadata.
    toc = re.search(r'<nav id="TOC".*?</nav>', body, re.S)
    if toc:
        headings = re.findall(
            r'<section\s+id="([^"]+)"\s+class="level2"[^>]*>\s*<h2[^>]*>(.*?)</h2>',
            body, re.S)
        assert len(headings) == source.count("\n## "), "Incomplete contents list"
        contents = "<ul>" + "".join(
            '<li><a href="#'+ident+'">'+
            escape(" ".join(unescape(re.sub("<[^>]+>", "", label)).split()))+
            "</a></li>" for ident, label in headings
        ) + "</ul>"
        toc_html = '<details id="TOC" open><summary>Explore this reading</summary>'+contents+"</details>"
        body = body.replace(toc.group(), "")
        insert = body.find('<section', body.find('<h1'))
        body = body[:insert] + toc_html + body[insert:]
    # Give Persian summaries their correct reading direction.
    body = re.sub(r'<section([^>]+)>\s*(<h2[^>]*>[^<]*خلاصه[^<]*</h2>)',
                  r'<section\1 dir="rtl" lang="fa">\2', body)
    # Image links give readers a full-size view without gallery JavaScript.
    body = re.sub(r'(<img\s+[^>]*src="([^"]+)"[^>]*>)',
        lambda m: '<a href="'+m.group(2)+'" aria-label="Open full-size image">'+
        m.group(1).replace("<img ", '<img loading="lazy" decoding="async" ')+"</a>", body)
    # First image is above the fold; prioritize it.
    body = body.replace('loading="lazy"', 'loading="eager" fetchpriority="high"', 1)
    nav = f'''<nav aria-label="Course navigation">
<a href="https://github.com/Ehsan-Roohi/Aerospace-Structures">Course home</a>
<a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md">All readings</a>
<a href="../../wing-panel-stress-analyzer/#wing">Wing Lab</a>
<a href="../{other[1]}/">{other[2]} reading</a>
<a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/{file}">Markdown source</a></nav>'''
    badges = f'<div class="evidence"><span>Checked 17 November 2026</span><span>{sources} source entries</span><span>Photographs · video · worked examples</span></div>'
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="{escape(description)}">
<meta name="theme-color" content="#123d53">
<title>{short}: structures, propulsion and mission engineering · MIE 446</title>
<link rel="stylesheet" href="../spaceflight.css">
<script>window.MathJax={{tex:{{inlineMath:[['\\\\(','\\\\)']],displayMath:[['\\\\[','\\\\]']]}},options:{{enableMenu:false}}}};</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
</head><body><main id="top">{nav}
<p class="kicker">MIE 446 · Spaceflight engineering</p>{badges}
{body}
<footer><p><a href="../{other[1]}/">Continue with {other[2]}</a> · <a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md">Browse all readings</a></p>
<p>Dr. Ehsan Roohi Golkhatmi · University of Massachusetts Amherst. Independent educational analysis. Agency photographs, planning graphics and videos retain their stated credits.</p>
<p><a class="backtop" href="#top">Back to top ↑</a></p></footer></main></body></html>'''
    output = ROOT / "docs" / "case-studies" / slug / "index.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(page)
    print(f"Built {output.relative_to(ROOT)} ({len(page):,} characters)")


if __name__ == "__main__":
    for args in PAGES:
        render(*args)
