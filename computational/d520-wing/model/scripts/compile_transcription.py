"""Compile the per-page transcription/translation JSON into Markdown documents."""
import json, glob, os, sys
SRC = os.environ.get("D520_WORK", "work")      # folder holding trans/p-*.json and plates/p-*.json (per-page transcription records)
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "manual")
pages = []
for f in sorted(glob.glob(f"{SRC}/trans/p-*.json") + glob.glob(f"{SRC}/plates/p-*.json"), key=lambda p: int(p.split("-")[-1][:3])):
    d = json.load(open(f)); pages.append(d)
pages.sort(key=lambda d: d["pdf_page"])
assert len(pages) == 168, len(pages)
def head(d):
    bits = [f"PDF page {d['pdf_page']}"]
    if d.get("printed_page"): bits.append(f"printed page {d['printed_page']}")
    if d.get("plate"): bits.append(d["plate"])
    return " · ".join(bits)
def block(d, lang):
    t = d.get("title_en" if lang == "en" else "title_fr") or ""
    L = [f"## {t}" if t else "## (untitled page)", f"*{head(d)}*", ""]
    body = d.get(lang) or ""
    if d.get("description_en") and lang == "en":
        L += [f"> **What the {'photograph' if d.get('kind')=='photo' else 'drawing'} shows:** {d['description_en']}", ""]
    if body: L += [body, ""]
    if d.get("labels") and lang == "en" and d.get("kind", "").startswith("plate"):
        L += ["| Label (French) | English |", "|---|---|"] + [f"| {x.get('fr','')} | {x.get('en','')} |" for x in d["labels"]] + [""]
    if d.get("notes") and lang == "en":
        L += [f"*Transcriber's notes: {d['notes']}*", ""]
    return L
intro_en = ["# Dewoitine D.520 S — Descriptive and Operating Manual (engine 12 Y 45)",
            "", "English translation of the scanned *Notice descriptive et d'utilisation de l'avion de chasse D.520 S, moteur 12 Y 45* "
            "(Archives départementales de la Haute-Garonne stamp on every sheet). 168 scanned pages: 61 typewritten pages and "
            "107 pages of plates and fold-out cards. Every page was transcribed from the scan and translated; numbers are kept "
            "exactly as written, illegible items are marked [illegible], handwritten additions are marked as such.", ""]
intro_fr = ["# Dewoitine D.520 S — Notice descriptive et d'utilisation (moteur 12 Y 45)", "",
            "Transcription intégrale du document numérisé (168 pages). Les passages illisibles sont signalés [illisible] / [illegible].", ""]
en, fr, bi = list(intro_en), list(intro_fr), list(intro_en)
for d in pages:
    en += block(d, "en") + ["---", ""]
    fr += block(d, "fr") + ["---", ""]
    bi += [f"## {d.get('title_en') or ''}", f"*{head(d)}*", "", "### Français", "", d.get("fr") or "", "", "### English", "", d.get("en") or "", ""]
    if d.get("description_en"): bi += [f"> {d['description_en']}", ""]
    if d.get("notes"): bi += [f"*Notes: {d['notes']}*", ""]
    bi += ["---", ""]
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "D520_manual_EN.md"), "w").write("\n".join(en))
open(os.path.join(OUT, "D520_manual_FR_transcription.md"), "w").write("\n".join(fr))
open(os.path.join(OUT, "D520_manual_bilingual.md"), "w").write("\n".join(bi))
json.dump(pages, open(os.path.join(OUT, "D520_manual_pages.json"), "w"), ensure_ascii=False, indent=1)
# all dimensions extracted, flat CSV
import csv
with open(os.path.join(OUT, "D520_all_numbers_extracted.csv"), "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(["pdf_page", "plate", "quantity", "value", "unit", "quote_fr", "where", "confidence"])
    for d in pages:
        for x in d.get("dimensions") or []:
            w.writerow([d["pdf_page"], d.get("plate") or "", x.get("quantity"), x.get("value"), x.get("unit"), x.get("quote_fr"), x.get("where"), x.get("confidence")])
for f in os.listdir(OUT): print(f, os.path.getsize(os.path.join(OUT, f)))
