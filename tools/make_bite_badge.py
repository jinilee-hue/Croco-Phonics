"""The trap word's bite badge = the game croc's own face, chomping in a loop (user: "이건 악어얼굴에서 입을 닫았을때
이빨을 보여주면 될거 같아" → "여기 카드 위에 악어는 입을 계속 열었다 닫히는 모션이 들어가면 좋겠는데").

Renders dev/croc.html (front view, eyes pinned open and looking straight out, plain teeth without the letters, no floor
shadow) at the mouth openings of one chomp, each on black and on white: the alpha comes from the difference, so the
anti-aliased edges stay clean. Every frame is cropped around the EYES (they stay still; the jaw drops), with the bottom
cut riding on the lower jaw, so the closed frame is the badge as it was and the open mouth grows downward over the card's
corner (never up past the screen's top edge). Writes one animated WebP: assets/img/bite_croc.webp (loops; the browser
plays it, no script). Needs the local server (tools/serve.py on 5211).

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
URL = 'http://127.0.0.1:5211/dev/croc.html?still&az=0&el=12&open=0&fy=0.58&fh=0.6'
WIDTH = 320                                  # output px wide (the badge shows ≤ 180 px wide on a 2× screen)
# one chomp: a closed rest, the mouth opens (ease-out), holds, SNAPS shut, a little bounce — (mouth opening, ms)
LOOP = [(0, 520), (0.12, 40), (0.3, 40), (0.46, 40), (0.58, 50), (0.66, 60), (0.7, 200),
        (0.4, 40), (0.08, 40), (0, 70), (0.05, 60)]
# the closed face sits as on the still badge the user approved (95c8139): iris gap and the irises' middle, in badge widths;
# its bottom cut = one badge width below the top (the still was square)
EYE_GAP, EYE_X, EYE_Y = 122.0 / 320, 160.5 / 320, 138.5 / 320


def irises(rgba, near, r):
    """the two irises' centres (the dark brown of the painted iris + pupil) within r px of the guesses `near`"""
    a = rgba.astype(int)
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = np.logical_and.reduce([A > 200, R >= 25, R < 175, G < R * 0.62, B < R * 0.5])
    out = []
    for x, y in near:
        y0, x0 = max(0, int(y - r)), max(0, int(x - r))
        ys, xs = np.nonzero(m[y0:int(y + r), x0:int(x + r)])
        out.append((xs.mean() + x0, ys.mean() + y0, len(xs)))
    return out

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 900, 'height': 900}, device_scale_factor=2)
    pg.goto(URL)
    pg.wait_for_function('window.__ready === true', timeout=60000)
    time.sleep(1.0)
    pg.evaluate("""() => {
      document.getElementById('info').style.display = 'none';
      Stage.scene.traverse(o => {
        if (o.material && o.material.isShadowMaterial) o.visible = false;                              // no floor shadow
        if (o.material && o.material.map && o.material.map.userData && o.material.map.userData.ch) o.visible = false;   // plain teeth (the letter changes by level)
      });
      const st = Stage.croc.state;
      st.nextBlink = 1e9; st.blinkT = 0; st.blink = 0; st.squintTarget = 0; st.squint = 0;   // eyes open: no blink mid-render
      st.wander.set(0, 0, 0); st.nextWander = 1e9;                                          // and looking straight out
      Stage.step(1 / 60, 150);
    }""")
    frames, prev = {}, None
    for v in sorted({v for v, _ in LOOP}):                              # closed first: each frame tracks the irises from the last
        E = pg.evaluate(f"""() => {{
          Stage.croc.setOpen({v}, true);
          Stage.step(1 / 60, 40);
          return Stage.croc.parts.eyes.map(e => {{ const p = Stage.project(e.g.getWorldPosition(new THREE.Vector3())); return [p.x * devicePixelRatio, p.y * devicePixelRatio]; }});
        }}""")
        shots = {}
        for bg in ('#000', '#fff'):
            pg.evaluate(f"document.documentElement.style.background = document.body.style.background = '{bg}'")
            time.sleep(0.25)
            shots[bg] = np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert('RGB')).astype(np.float64)
        k, w = shots['#000'], shots['#fff']
        alpha = np.clip(1 - (w - k).mean(axis=2) / 255, 0, 1)
        rgb = np.where(alpha[..., None] > 1e-3, k / np.maximum(alpha[..., None], 1e-3), 0)
        rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
        # the irises, not the eyeballs' projected centres: the painted iris moves a little more than the ball's centre
        gap = abs(E[1][0] - E[0][0])
        if prev is None:
            near = E
        else:                                                              # last irises + the eyeballs' move, a bit more
            near = [(pi[0] + (e[0] - pe[0]), pi[1] + 1.3 * (e[1] - pe[1])) for pi, e, pe in zip(prev[0], E, prev[1])]
        ir = irises(rgba, near, 0.3 * gap)          # an iris is ~0.2 gap across
        if prev is not None:
            assert all(0.6 < i[2] / p[2] < 1.4 for i, p in zip(ir, frames[0][1])), (v, ir)   # each one found whole
        frames[v] = (rgba, ir)
        prev = (ir, E)
    b.close()

# the closed frame: scaled and placed like the still badge (iris gap + middle), square, its bottom cut one width down
rgba0, ir0 = frames[0]
mx0, my0 = (ir0[0][0] + ir0[1][0]) / 2, (ir0[0][1] + ir0[1][1]) / 2
side = (ir0[1][0] - ir0[0][0]) / EYE_GAP                               # render px per badge width
x0, y0 = mx0 - EYE_X * side, my0 - EYE_Y * side
cut = int(round(y0 + side))                                            # the bottom cut rides on the lower jaw (fixed in the render)
# … along a gentle arc (the middle as low as the still's straight cut, the sides ARC px higher): its sticker outline and
# shadow follow a chin-like curve; a straight one showed as a pale strip over the card while the mouth was open
ARC = 0.07 * side
cols = np.arange(rgba0.shape[1])
below = np.arange(rgba0.shape[0])[:, None] >= (cut - ARC * ((cols - (x0 + side / 2)) / (side / 2)) ** 2)[None, :]
rise = {v: my0 - (ir[0][1] + ir[1][1]) / 2 for v, (_, ir) in frames.items()}    # how far the eyes go up = the jaw drops below them
H = side + max(rise.values())
out_h = round(WIDTH * H / side)
imgs = {}
for v, (rgba, ir) in frames.items():
    f = rgba.copy()
    f[below] = 0
    top = y0 - rise[v]                                                  # the window goes up with the eyes: they stay still
    im = np.asarray(Image.fromarray(f).crop((round(x0), round(top), round(x0 + side), round(top + H))).resize((WIDTH, out_h), Image.LANCZOS)).copy()
    im[im[..., 3] <= 6] = 0                                             # the resize's faint ringing (alpha ≤ 6) off the cleared parts
    imgs[v] = Image.fromarray(im)
drop = max(rise.values())
seq = [imgs[v] for v, _ in LOOP]
seq[0].save(OUT, 'WEBP', save_all=True, append_images=seq[1:], duration=[ms for _, ms in LOOP], loop=0,
            quality=90, method=6, background=(0, 0, 0, 0))
print(f'{OUT.relative_to(ROOT)} {WIDTH}×{out_h} px (aspect {WIDTH / out_h:.4f}) · {len(seq)} frames · {sum(ms for _, ms in LOOP)} ms loop · '
      f'{OUT.stat().st_size // 1024} KB · crop {x0:.0f},{y0:.0f} {side:.0f}px + jaw drop {drop:.0f}px · '
      f'iris rise by opening: ' + ' '.join(f'{v}:{rise[v]:.0f}' for v in sorted(rise)))
