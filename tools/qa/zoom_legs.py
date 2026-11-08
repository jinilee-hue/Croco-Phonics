"""Close-up QA of the croc's legs + claws at device scale 2.
usage: QA_OUT=<dir> uv run --with playwright --with pillow python tools/qa/zoom_legs.py <name>
Renders dev/croc.html (title / game / 3-4 views), crops boxes around the front and back feet (projected from the
model's foot positions) and writes shots/<name>_legs.png (labelled grid).
"""
import sys, time
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

name = sys.argv[1]
import os
D = os.environ.get('QA_OUT', '.').rstrip('/') + '/'
STATES = [('title', 'el=12'), ('game', 'el=35&open=1.32'), ('threequarter', 'el=14&az=-40')]
FEET = {'R front': (1.95, 0.15, 0.4), 'R back': (1.86, 0.15, -1.0), 'L front': (-1.95, 0.15, 0.4)}
tiles = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=2)
    for label, q in STATES:
        pg.goto(f'http://127.0.0.1:5211/dev/croc.html?still&fy=0.55&fh=0.8&{q}')
        pg.wait_for_function('window.__ready === true', timeout=60000)
        time.sleep(0.4)
        f = D + f'{name}_{label}.png'
        pg.screenshot(path=f)
        im = Image.open(f).convert('RGB')
        for foot, (x, y, z) in FEET.items():
            box = pg.evaluate(f"""() => {{
              const c = new THREE.Vector3({x}, {y}, {z}).applyMatrix4(croc.root.matrixWorld);
              const pts = [];
              for (const [dx, dy, dz] of [[-0.75, 0, 0], [0.75, 0, 0], [0, 0.6, 0], [0, -0.3, 0], [0, 0, 0.75], [0, 0, -0.75]])
                pts.push(Stage.project(c.clone().add(new THREE.Vector3(dx, dy, dz))));
              const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
              return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
            }}""")
            x0, y0, x1, y1 = [int(v * 2) for v in box]
            c = im.crop((max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1)))
            tiles.append((f'{label} · {foot}', c))
    b.close()
TW = 600
tiles = [(l, c.resize((TW, int(c.height * TW / c.width)), Image.LANCZOS)) for l, c in tiles]
cols = 3
rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
hs = [max(c.height for _, c in r) + 24 for r in rows]
sheet = Image.new('RGB', (cols * (TW + 8), sum(hs)), 'white')
dr = ImageDraw.Draw(sheet)
y = 0
for r, h in zip(rows, hs):
    for k, (l, c) in enumerate(r):
        dr.text((k * (TW + 8) + 4, y + 4), l, fill='black')
        sheet.paste(c, (k * (TW + 8), y + 22))
    y += h
sheet.save(D + f'{name}_legs.png')
print('->', D + f'{name}_legs.png', sheet.size)
