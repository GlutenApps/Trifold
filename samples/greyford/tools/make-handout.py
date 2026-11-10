"""Renders Hesper's letter (notes/23-hespers-letter.md) as a landscape parchment handout.

usage: python make-handout.py <out.jpg> [font.ttf]
The default font is Georgia Italic from a Windows install; only the rendered image ships.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

out = sys.argv[1]
font_path = sys.argv[2] if len(sys.argv) > 2 else 'C:/Windows/Fonts/georgiai.ttf'
W, H = 2560, 1440
rng = np.random.default_rng(7)

# Parchment: warm base, low-frequency blotches, fine grain, darker edges.
base = np.array([226, 208, 168], dtype=float)
low = Image.fromarray((rng.random((18, 32)) * 255).astype('uint8')).resize((W, H), Image.BICUBIC)
low = np.asarray(low.filter(ImageFilter.GaussianBlur(40)), dtype=float) / 255 - 0.5
grain = rng.normal(0, 1, (H, W))
yy, xx = np.mgrid[0:H, 0:W]
edge = np.minimum(np.minimum(xx, W - 1 - xx) / W, np.minimum(yy, H - 1 - yy) / H)
vignette = np.clip(edge / 0.12, 0, 1) ** 0.6
shade = 0.78 + 0.22 * vignette + 0.10 * low + 0.012 * grain
img = np.clip(base[None, None, :] * shade[:, :, None], 0, 255).astype('uint8')
page = Image.fromarray(img, 'RGB')

d = ImageDraw.Draw(page)
ink = (58, 38, 24)
body = ImageFont.truetype(font_path, 64)
sign = ImageFont.truetype(font_path, 72)
paragraphs = [
    'Wren,',
    'I am writing because I am old and you were the only student I had who listened. '
    'Someone has been asking after the chapel records: a man with a priest\u2019s manners and '
    'none of a priest\u2019s sense. I sent him away. He came back at night.',
    'If you are reading this and I have not written again, come to Greyford. Come quickly. '
    'Keep it lit. Keep it high.',
]
left, right, top = 300, W - 300, 230
y = top
for i, para in enumerate(paragraphs):
    words, line = para.split(), ''
    for w in words:
        trial = f'{line} {w}'.strip()
        if d.textlength(trial, font=body) > right - left and line:
            d.text((left, y), line, font=body, fill=ink)
            y += 92
            line = w
        else:
            line = trial
    d.text((left, y), line, font=body, fill=ink)
    y += 92 + (40 if i < len(paragraphs) - 1 else 0)
d.text((right - d.textlength('\u2014 H. Q.', font=sign), y + 50), '\u2014 H. Q.', font=sign, fill=ink)
page = page.filter(ImageFilter.GaussianBlur(0.6))
page.save(out, quality=90, optimize=True)
print(out, page.size)
