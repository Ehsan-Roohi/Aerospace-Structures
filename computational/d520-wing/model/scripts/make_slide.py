"""Title slide: render + the manual's cover inset, in the style of the reference post."""
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
render, cover, out = sys.argv[1], sys.argv[2], sys.argv[3]
title = sys.argv[4] if len(sys.argv) > 4 else "a 1940 manual, then a blender model."
R = Image.open(render).convert("RGB")
W, H = R.size
bar = int(H * 0.095)
S = Image.new("RGB", (W, H + bar), (16, 16, 16))
S.paste(R, (0, bar))
d = ImageDraw.Draw(S)
fp = None
for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed-Italic.ttf",
          "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"):
    if os.path.exists(f): fp = f; break
font = ImageFont.truetype(fp, int(bar * 0.52)) if fp else ImageFont.load_default()
d.text((int(W * 0.022), int(bar * 0.2)), title, fill=(245, 245, 240), font=font)
# manual cover inset, bottom right, slight shadow
C = Image.open(cover).convert("RGB")
ch = int(H * 0.40); cw = int(C.width * ch / C.height)
C = C.resize((cw, ch), Image.LANCZOS)
x, y = W - cw - int(W * 0.025), bar + H - ch - int(H * 0.03)
sh = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
ImageDraw.Draw(sh).rectangle([20, 20, cw + 20, ch + 20], fill=(0, 0, 0, 110))
sh = sh.filter(ImageFilter.GaussianBlur(10))
S.paste(sh, (x - 14, y - 10), sh)
S.paste(C, (x, y))
d.rectangle([x, y, x + cw - 1, y + ch - 1], outline=(160, 160, 160), width=2)
S.save(out, quality=92)
print("slide", out, S.size)
