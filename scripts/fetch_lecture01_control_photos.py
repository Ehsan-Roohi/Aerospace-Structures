"""Fetch attributed source photographs for the Lecture 01 control atlas.

Network access is needed only to rebuild the local assets, not to run the lesson.
Photographs remain photographs; original teaching diagrams are built separately.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from html import unescape
import io
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/assets/lecture01"
TMP = ROOT / "tmp/control-atlas"
USER_AGENT = "MIE446-LectureAssets/1.0 (educational aircraft comparison)"


def get(url):
    with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=45) as response:
        return response.read()


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.items.append(dict(attrs))


def save_photo(name, url):
    path = OUT / name
    if path.exists():
        print(f"Reusing {name}")
        return
    image = Image.open(io.BytesIO(get(url))).convert("RGB")
    image.thumbnail((1600, 1400))
    image.save(path, quality=93)
    print(f"Saved {name}: {image.size}")


def commons(title, name):
    url = "https://commons.wikimedia.org/w/api.php?" + urlencode({
        "action": "query", "format": "json", "titles": "File:" + title,
        "prop": "imageinfo", "iiprop": "url|extmetadata",
    })
    data = json.loads(get(url))
    page = next(iter(data["query"]["pages"].values()))
    info = page["imageinfo"][0]
    save_photo(name, info["url"])
    return {"file": name, "source_page": info["descriptionurl"],
            "source_image": info["url"], "metadata": info["extmetadata"]}


def page_photo(page, match, name, credit):
    parser = Images()
    parser.feed(get(page).decode("utf-8"))
    matches = [item for item in parser.items if match.lower() in
               (item.get("alt", "") + " " + item.get("src", "")).lower()]
    if not matches:
        raise ValueError(f"No verified image matching {match!r} at {page}")
    url = unescape(matches[0]["src"]).split("?")[0]
    save_photo(name, url)
    return {"file": name, "source_page": page, "source_image": url,
            "credit": credit, "license": "US government photograph; public domain in the United States"}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    manifest = []
    tasks = [
        ("commons", ("Otto-Lilienthal-Museum id F0158b.jpg", "Controls_Lilienthal_Full_1895.jpg")),
        ("commons", ("Lilienthal experimental device 1895 detail.gif", "Controls_Lilienthal_Warping_Letter.jpg")),
        ("commons", ("Otto Lilientahl's Experimental Monoplane.tif", "Controls_Lilienthal_Experimental_View.jpg")),
        ("commons", ("MQ-9 Reaper in flight (2007).jpg", "Controls_MQ9_Vtail.jpg")),
        ("page", ("https://www.nasa.gov/aeronautics/x-36-tailless-fighter/", "EC97-44294", "Controls_X36_Tailless.jpg", "NASA / Carla Thomas, 30 October 1997")),
        ("page", ("https://www.nasa.gov/image-article/x-48b-first-flight/", "ED07", "Controls_X48B_Winglets.jpg", "NASA / Carla Thomas, 20 July 2007; image filename ED07-0164-1")),
        ("commons", ("X-47B 110204-F-1162D-119.jpg", "Controls_X47B_Finless.jpg")),
    ]
    failed=[]
    for kind, args in tasks:
        try:
            manifest.append(commons(*args) if kind == "commons" else page_photo(*args))
        except Exception as error:
            print(f"FETCH FAILED: {args}: {error}")
            failed.append(args)
    if failed:
        raise RuntimeError(f"{len(failed)} photo source retrievals failed; preserve previous provenance and retry.")
    # The PDF is read-only supporting material, not a redistributed course asset.
    pdf_path = TMP / "Lilienthal_Flight_Controls.pdf"
    if not pdf_path.exists():
        pdf_path.write_bytes(get(
            "https://elib.dlr.de/191143/1/JoA_Paper_Lilienthal_Flight_Controls.pdf"))
    (TMP / "photo_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    sources=[]
    for item in manifest:
        meta=item.get("metadata", {})
        sources.append({"file": item["file"], "source_page": item["source_page"],
                        "source_image": item["source_image"].split("?")[0],
                        "credit": item.get("credit", meta.get("Artist", {}).get("value")),
                        "license": item.get("license", meta.get("LicenseShortName", {}).get("value")),
                        "license_url": meta.get("LicenseUrl", {}).get("value"),
                        "description": meta.get("ImageDescription", {}).get("value"),
                        "changes": "Converted to RGB JPEG; resized to at most 1600 by 1400 pixels; content and existing annotations retained."})
    (OUT / "CONTROL_PHOTO_SOURCES.json").write_text(json.dumps(sources,indent=2)+"\n",encoding="utf-8")
    for item in manifest:
        meta = item.get("metadata", {})
        print(json.dumps({"file": item["file"], "image": item["source_image"],
                          "credit": item.get("credit", meta.get("Artist", {}).get("value")),
                          "license": item.get("license", meta.get("LicenseShortName", {}).get("value")),
                          "description": meta.get("ImageDescription", {}).get("value")}, ensure_ascii=True))


if __name__ == "__main__":
    main()
