"""Import the user's art from ~/Downloads into the game (run again when the user drops new versions):
  croco_bg.png   → assets/img/bg.webp    playroom backdrop for the title and the game (2400×1792)
  croco_logo.png → assets/img/logo.webp  title logo (already cut out: alpha kept as is)

uv run --with pillow python tools/import_art.py                                  # both, default names
uv run --with pillow python tools/import_art.py --bg croco_phonics_bg2.png       # only the backdrop, from that file
uv run --with pillow python tools/import_art.py --logo croco_logo.png            # only the logo
"""
import sys, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DL = pathlib.Path.home() / 'Downloads'
IMG = ROOT / 'assets' / 'img'

args = sys.argv[1:]
pick = {k: args[args.index(f'--{k}') + 1] for k in ('bg', 'logo') if f'--{k}' in args}
if not pick:
    pick = {'bg': 'croco_bg.png', 'logo': 'croco_logo.png'}

if 'bg' in pick:
    bg = Image.open(DL / pick['bg']).convert('RGB')
    bg.save(IMG / 'bg.webp', quality=92, method=6)
    print('bg.webp ←', pick['bg'], bg.size, (IMG / 'bg.webp').stat().st_size, 'bytes')

if 'logo' in pick:
    logo = Image.open(DL / pick['logo']).convert('RGBA')
    bbox = logo.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    logo = logo.crop(bbox)
    if logo.width > 1400:
        logo = logo.resize((1400, round(logo.height * 1400 / logo.width)), Image.LANCZOS)
    logo.save(IMG / 'logo.webp', quality=90, alpha_quality=100, method=6, exact=True)
    print('logo.webp ←', pick['logo'], logo.size, (IMG / 'logo.webp').stat().st_size, 'bytes')
