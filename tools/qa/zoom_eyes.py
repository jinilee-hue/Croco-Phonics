"""Close-up QA of the croc's eyes (rims, socket junction) at device scale 2.
usage: QA_OUT=<dir> uv run --with playwright --with pillow python tools/qa/zoom_eyes.py <name>
Renders dev/croc.html in several states, crops a box around both eyes (located by projecting the eye groups) and
writes shots/<name>_eyes.png (a labelled grid) + one full-res crop per state.
"""
import sys, time
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

name = sys.argv[1]
import os
D = os.environ.get('QA_OUT', '.').rstrip('/') + '/'
STATES = [
    ('title', 'el=12'), ('game', 'el=35&open=1.32'), ('blink', 'el=12&squint=0.5'), ('happy', 'el=12&happy'),
    ('surprised', 'el=12&surp'), ('side', 'el=12&az=-40'),
]
crops = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=2)
    for label, q in STATES:
        pg.goto(f'http://127.0.0.1:5211/dev/croc.html?still&fy=0.55&fh=0.8&{q}')
        pg.wait_for_function('window.__ready === true', timeout=60000)
        time.sleep(0.4)
        box = pg.evaluate("""() => {
          const pts = [];
          for (const e of croc.parts.eyes) {
            const c = e.g.getWorldPosition(new THREE.Vector3());
            for (const [dx, dy] of [[-0.62, 0], [0.62, 0], [0, 0.6], [0, -0.55]]) pts.push(Stage.project(c.clone().add(new THREE.Vector3(dx, dy, 0))));
          }
          const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
          return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        }""")
        f = D + f'{name}_{label}.png'
        pg.screenshot(path=f)
        im = Image.open(f).convert('RGB')
        x0, y0, x1, y1 = [int(v * 2) for v in box]
        c = im.crop((max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1)))
        c.save(D + f'{name}_{label}_eyes.png')
        crops.append((label, c))
    b.close()
W = 900
rows = []
for label, c in crops:
    r = c.resize((W, int(c.height * W / c.width)), Image.LANCZOS)
    rows.append((label, r))
cols = 2
cw = W + 10
heights = [max(r.height for _, r in rows[i:i + cols]) + 26 for i in range(0, len(rows), cols)]
sheet = Image.new('RGB', (cols * cw, sum(heights)), 'white')
dr = ImageDraw.Draw(sheet)
y = 0
for i in range(0, len(rows), cols):
    for k, (label, r) in enumerate(rows[i:i + cols]):
        dr.text((k * cw + 4, y + 4), label, fill='black')
        sheet.paste(r, (k * cw, y + 22))
    y += heights[i // cols]
sheet.save(D + f'{name}_eyes.png')
print('->', D + f'{name}_eyes.png', sheet.size)
