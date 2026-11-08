"""Builds the sample's map images from the 2-Minute Tabletop originals (see ../images/CREDITS.md).

usage: python make-maps.py <originals dir> <out dir>
Originals, by the names they were saved under: 10.jpg and 11.jpg Howling Tunnels (300 DPI, the
two variants), 12.jpg and 13.jpg Dwarven Tavern (72 DPI, dark and light), 14.jpg Highway Town.
Every output is landscape, at most 4096 px on the long edge, and carries the licence's
attribution (title, author, licence, changes) in a corner.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
MAX = 4096
CREDIT = (
    '\u201c{title}\u201d by Ross McConnell, 2-Minute Tabletop (2minutetabletop.com)'
    ' \u00b7 CC BY-NC 4.0 \u00b7 adapted for Trifold'
)
FONT = 'C:/Windows/Fonts/segoeui.ttf'


def fit(im):
    s = min(1.0, MAX / max(im.size))
    return im if s == 1 else im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)


def credit(im, title):
    """A small dark label with the attribution, in the bottom-right corner."""
    d = ImageDraw.Draw(im, 'RGBA')
    size = max(12, round(im.size[0] / 150))
    font = ImageFont.truetype(FONT, size)
    text = CREDIT.format(title=title)
    w = d.textlength(text, font=font)
    pad = size // 2
    x = im.size[0] - w - 3 * pad
    y = im.size[1] - size - 4 * pad
    d.rounded_rectangle([x - pad, y - pad // 2, x + w + pad, y + size + pad], radius=pad,
                        fill=(0, 0, 0, 150))
    d.text((x, y), text, font=font, fill=(235, 235, 235, 255))
    return im


def save(im, name):
    p = os.path.join(out, name)
    im.convert('RGB').save(p, quality=88, optimize=True)
    print(name, im.size, round(os.path.getsize(p) / 1048576, 2), 'MB')


def load(n):
    return Image.open(os.path.join(src, f'{n}.jpg'))


save(credit(fit(load('14')), 'Highway Town'), 'village.jpg')
# The tavern is portrait; turned a quarter left, the front door faces east.
for n, name in (('12', 'inn-night.jpg'), ('13', 'inn-day.jpg')):
    save(credit(fit(load(n).transpose(Image.ROTATE_90)), 'Dwarven Tavern'), name)
for n, name in (('10', 'gorge.jpg'), ('11', 'gorge-flood.jpg')):
    save(credit(fit(load(n)), 'Howling Tunnels'), name)
