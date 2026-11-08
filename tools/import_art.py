"""Import the user's art from ~/Downloads into the game (run again when the user drops new versions):
  croco_bg.png   → assets/img/bg.webp    playroom backdrop (2400×1792, floor line at 70 % of its height)
  croco_logo.png → assets/img/logo.webp  title logo (already cut out: alpha kept as is)

uv run --with pillow python tools/import_art.py
"""
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DL = pathlib.Path.home() / 'Downloads'
IMG = ROOT / 'assets' / 'img'

bg = Image.open(DL / 'croco_bg.png').convert('RGB')
bg.save(IMG / 'bg.webp', quality=92, method=6)
print('bg.webp', bg.size, (IMG / 'bg.webp').stat().st_size, 'bytes')

logo = Image.open(DL / 'croco_logo.png').convert('RGBA')
bbox = logo.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
logo = logo.crop(bbox)
if logo.width > 1400:
    logo = logo.resize((1400, round(logo.height * 1400 / logo.width)), Image.LANCZOS)
logo.save(IMG / 'logo.webp', quality=90, alpha_quality=100, method=6, exact=True)
print('logo.webp', logo.size, (IMG / 'logo.webp').stat().st_size, 'bytes')
