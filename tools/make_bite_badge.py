"""The trap word's bite badge = the game croc's own face, mouth shut with the teeth showing (user: "이건 악어얼굴에서
입을 닫았을때 이빨을 보여주면 될거 같아"). Renders dev/croc.html (front view, shut, no floor shadow) on black and on white,
pulls the exact alpha from the difference (anti-aliased edges stay clean), crops the face and writes
assets/img/bite_croc.webp. Needs the local server (tools/serve.py on 5211).

    uv run --with playwright --with numpy --with pillow python tools/make_bite_badge.py
"""
import io
import pathlib
import time

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'img' / 'bite_croc.webp'
URL = 'http://127.0.0.1:5211/dev/croc.html?still&az=0&el=12&open=0&fy=0.5&fh=0.8'
SIZE = 320                                   # output px (the badge shows at ≤ 180 px on a 2× screen)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 900, 'height': 700}, device_scale_factor=2)
    pg.goto(URL)
    pg.wait_for_function('window.__ready === true', timeout=60000)
    time.sleep(1.5)
    pg.evaluate("""() => {
      document.getElementById('info').style.display = 'none';
      Stage.scene.traverse(o => { if (o.material && o.material.isShadowMaterial) o.visible = false; });   // no floor shadow
      const st = Stage.croc.state;                                    // eyes open: no blink mid-render
      st.nextBlink = 1e9; st.blinkT = 0; st.blink = 0; st.squintTarget = 0; st.squint = 0;
      Stage.step(1 / 60, 30);
    }""")
    shots = {}
    for bg in ('#000', '#fff'):
        pg.evaluate(f"document.documentElement.style.background = document.body.style.background = '{bg}'")
        time.sleep(0.3)
        shots[bg] = np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert('RGB')).astype(np.float64)
    b.close()

k, w = shots['#000'], shots['#fff']
alpha = np.clip(1 - (w - k).mean(axis=2) / 255, 0, 1)
rgb = np.where(alpha[..., None] > 1e-3, k / np.maximum(alpha[..., None], 1e-3), 0)
rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)

# crop the face: the head's columns (the splayed feet sit lower and wider), from the eye tops to the chin
ys, xs = np.nonzero(alpha > 0.5)
top, bottom = ys.min(), ys.max()
cx = (xs.min() + xs.max()) / 2
upper = alpha[top:top + int((bottom - top) * 0.55)] > 0.5            # the head above the feet
hx = np.nonzero(upper.any(axis=0))[0]
half = (hx.max() - hx.min()) / 2 * 1.04
chin = top + int((bottom - top) * 0.78)                              # below the red lip, above the toes
side = int(max(2 * half, chin - top) + 8)
x0, y0 = int(cx - side / 2), int((top + chin) / 2 - side / 2)
face = Image.fromarray(rgba).crop((x0, y0, x0 + side, y0 + side)).resize((SIZE, SIZE), Image.LANCZOS)
face.save(OUT, 'WEBP', quality=90, method=6)
print(f'{OUT.relative_to(ROOT)} {SIZE}px · {OUT.stat().st_size // 1024} KB · crop {x0},{y0} {side}px of {alpha.shape[1]}x{alpha.shape[0]}')
