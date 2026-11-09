"""The trap word's bite badge = the game croc's own face, chomping in a loop (user: "이건 악어얼굴에서 입을 닫았을때
이빨을 보여주면 될거 같아" → "여기 카드 위에 악어는 입을 계속 열었다 닫히는 모션이 들어가면 좋겠는데").

Renders dev/croc.html (front view, eyes pinned open and looking straight out, plain teeth without the letters, no floor
shadow) at the mouth openings of one chomp, each on black and on white: the alpha comes from the difference, so the
anti-aliased edges stay clean. Writes one animated WebP: assets/img/bite_croc.webp (loops; the browser plays it, no
script). Needs the local server (tools/serve.py on 5211).

Nothing is cut (user: "영역에 대한 그림자가 잘려서 들어갔는데" — the crop used to run through the shaded green body under
the lip and through the side walls): only the face is drawn — the body, legs and claws are hidden — with a green
lower jaw under the red lip (user: "턱이 초록색이 아니네?": croc.js badgeChin() = the tub without the legs, rounded off at
CHIN_Y, so no straight cut); a clip plane below the chin; the crop holds the whole silhouette of every frame. The frames are aligned on the irises: the eyes stay still, the jaw drops. The tool prints the .bite box (in card
widths) that keeps the face exactly where and as big as the approved still badge had it (95c8139); css/style.css uses it.

The white sticker outline and the soft shadow are drawn INTO every frame: Chrome renders each frame once with the very
CSS filter the badge used to carry (STICKER_CSS) on black and on white, and the alpha comes from the difference again. A
CSS drop-shadow filter on the animated image went stale in Chrome as the jaw moved (user: "이거 턱 움직일때 그림자
이상한거 아직 안고쳐졌는데" — glow left over from an earlier frame, ending in a hard edge in the empty space above the
head), so the game shows the baked frames with no filter.

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
URL = 'http://127.0.0.1:5211/dev/croc.html?still&az=0&el=12&open=0&fy=0.56&fh=0.56'
WIDTH = 320                                  # output px wide (the badge shows ≤ 180 px wide on a 2× screen)
# one chomp: a closed rest, the mouth opens (ease-out), holds, SNAPS shut, a little bounce — (mouth opening, ms)
LOOP = [(0, 520), (0.12, 40), (0.3, 40), (0.46, 40), (0.58, 50), (0.66, 60), (0.7, 200),
        (0.4, 40), (0.08, 40), (0, 70), (0.05, 60)]
# the approved still badge (95c8139): a .27-card-width square at left -.09 / top -.1 (card widths); its irises' gap and
# middle in badge px of 320 → the face's size and place on the card, which the new box keeps
STILL = {'w': 0.27, 'left': -0.09, 'top': -0.1, 'gap': 122.0 / 320, 'mx': 160.5 / 320, 'my': 138.5 / 320}
MARGIN = 6                                   # render px of clear space round the silhouette
# the sticker look the badge had as a CSS filter (white outline + soft reddish shadow), in card widths
STICKER_CSS = ('drop-shadow(0 0 calc(var(--cw) * .008) #fff) drop-shadow(0 0 calc(var(--cw) * .008) #fff) '
               'drop-shadow(0 calc(var(--cw) * .012) calc(var(--cw) * .02) rgba(120,30,30,.4))')
PAD = 72                                     # px of room round the face box for the glow and the shadow (trimmed after)


def bake_sticker(browser, faces, k):
    """Chrome draws each face frame with STICKER_CSS at 1:1 (--cw = k px) on black and on white; alpha from the
    difference, as for the 3D renders → RGBA frames (W + 2 PAD) × (H + 2 PAD)"""
    import base64
    h, w = next(iter(faces.values())).shape[:2]
    pg = browser.new_page(viewport={'width': w + 2 * PAD, 'height': h + 2 * PAD}, device_scale_factor=1)
    out = {}
    for v, im in faces.items():
        buf = io.BytesIO()
        Image.fromarray(im).save(buf, 'PNG')
        src = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
        shots = {}
        for bg in ('#000', '#fff'):
            pg.set_content(f'<html><body style="margin:0;background:{bg}"><div style="position:absolute;left:{PAD}px;top:{PAD}px;'
                           f'width:{w}px;--cw:{k}px;filter:{STICKER_CSS}"><img src="{src}" style="display:block;width:{w}px;height:{h}px"></div></body></html>')
            pg.wait_for_function('document.images[0].complete')
            shots[bg] = np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert('RGB')).astype(np.float64)
        kk, ww = shots['#000'], shots['#fff']
        alpha = np.clip(1 - (ww - kk).mean(axis=2) / 255, 0, 1)
        rgb = np.where(alpha[..., None] > 1e-3, kk / np.maximum(alpha[..., None], 1e-3), 0)
        out[v] = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).round().astype(np.uint8)
    pg.close()
    return out



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
      const P = Stage.croc.parts;
      Stage.scene.traverse(o => {
        if (o.material && o.material.isShadowMaterial) o.visible = false;                              // no floor shadow
        if (o.material && o.material.map && o.material.map.userData && o.material.map.userData.ch) o.visible = false;   // plain teeth (the letter changes by level)
      });
      P.base.children.forEach(m => { if (m.material === P.M.skin || m.material === P.M.claw) m.visible = false; });   // no body, legs, claws
      // a green lower jaw under the red lip (user: "턱이 초록색이 아니네?"): the tub without the legs, rounded off
      const chin = Stage.croc.badgeChin();
      chin.mesh.visible = true;
      const y = P.root.localToWorld(new THREE.Vector3(0, chin.bottom - 0.1, 0)).y;            // nothing below the chin
      Stage.renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)];
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
        a = rgba[..., 3] > 4
        assert not (a[0].any() or a[-1].any() or a[:, 0].any() or a[:, -1].any()), f'open {v}: the croc touches the render edge'
        frames[v] = (rgba, ir)
        prev = (ir, E)
    b.close()

# the crop: every frame's whole silhouette, the frames moved so that their irises sit where the closed frame's do
mid = {v: ((ir[0][0] + ir[1][0]) / 2, (ir[0][1] + ir[1][1]) / 2) for v, (_, ir) in frames.items()}
mx0, my0 = mid[0]
L = T = 1e9
R = B = -1e9
for v, (rgba, _) in frames.items():
    ys, xs = np.nonzero(rgba[..., 3] > 4)
    dx, dy = mx0 - mid[v][0], my0 - mid[v][1]                          # this frame's shift (its eyes onto the closed ones)
    L, T, R, B = min(L, xs.min() + dx), min(T, ys.min() + dy), max(R, xs.max() + 1 + dx), max(B, ys.max() + 1 + dy)
L, T, R, B = L - MARGIN, T - MARGIN, R + MARGIN, B + MARGIN
cw, ch = R - L, B - T
out_h = round(WIDTH * ch / cw)
# the face's box on the card (card widths) that keeps the closed face as on the still badge
gap0 = frames[0][1][1][0] - frames[0][1][0][0]
w_cw = STILL['w'] * STILL['gap'] * cw / gap0                           # same iris gap on the card
fx, fy = (mx0 - L) / cw, (my0 - T) / cw                                 # the irises' middle in face-box widths
left = STILL['left'] + STILL['mx'] * STILL['w'] - fx * w_cw
top = STILL['top'] + STILL['my'] * STILL['w'] - fy * w_cw
K = WIDTH / w_cw                                                        # output px per card width
faces = {}
for v, (rgba, _) in frames.items():
    dx, dy = mx0 - mid[v][0], my0 - mid[v][1]
    box = (L - dx, T - dy, R - dx, B - dy)
    im = np.asarray(Image.fromarray(rgba).resize((WIDTH, out_h), Image.LANCZOS, box=box)).copy()
    im[im[..., 3] <= 6] = 0                                             # the resize's faint ringing (alpha ≤ 6)
    faces[v] = im
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    seqimg = bake_sticker(b, faces, K)
    b.close()
edge = max(int(f[[0, -1]].max()) for f in (x[..., 3] for x in seqimg.values()))
assert edge <= 2, f'the glow reaches the edge of the {PAD} px room (alpha {edge})'
# trim the empty border the glow and the shadow leave (the same box for every frame: they stay aligned)
on = np.zeros(next(iter(seqimg.values())).shape[:2], bool)
for f in seqimg.values():
    on |= f[..., 3] > 2
ys, xs = np.nonzero(on)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
seq = []
for v, _ in LOOP:
    f = seqimg[v][y0:y1, x0:x1].copy()
    f[f[..., 3] <= 2] = 0
    seq.append(Image.fromarray(f))
seq[0].save(OUT, 'WEBP', save_all=True, append_images=seq[1:], duration=[ms for _, ms in LOOP], loop=0,
            quality=90, method=6, background=(0, 0, 0, 0))
ox, oy = PAD - x0, PAD - y0                                             # the face box's corner in the image (px)
W2, H2 = x1 - x0, y1 - y0
print(f'{OUT.relative_to(ROOT)} {W2}×{H2} px (face {WIDTH}×{out_h} at {ox},{oy}) · {len(seq)} frames · {sum(ms for _, ms in LOOP)} ms loop · '
      f'{OUT.stat().st_size // 1024} KB')
print(f'.bite {{ left: calc(var(--cw) * {left - ox / K:.4f}); top: calc(var(--cw) * {top - oy / K:.4f}); width: calc(var(--cw) * {W2 / K:.4f}); '
      f'transform-origin: {100 * (ox + fx * WIDTH) / W2:.1f}% {100 * (oy + fy * WIDTH) / H2:.1f}%; }}   /* the eyes\' middle */')
