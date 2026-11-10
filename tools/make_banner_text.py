#!/usr/bin/env python3
"""Bake the result banner's text ("Player 1 Wins!", "플레이어 2 승리!" …) as puffy 3D letters like the logo's (user: "좀더
3d 느낌 살게 로고처럼 깨져보이지 않게 만들어줘"). The banner text used to be flat white text with a hard orange copy under
it (a stamp, not a volume). The logo's letters are inflated and sit on a thick plate; so here:

  letters  white, puffy: rounded bevels shading to a warm cream at the bottom right (the orbit letters' bevel, as in
           tools/make_orbit_letters.py), a soft contact shadow on the plate under them
  plate    a deep-orange rim round the letters (PLATE em, one blob where letters are close, like the logo's plate), its
           own rounded bevel, and a thickness below it (SIDE em) — the volume reads without any light band or line
  shadow   a soft drop shadow onto the banner

For each language × winner the text comes from js/game.js (UI en/ko `wins`, {n} = 1, 2). Chrome renders it exactly as
css `.ribbon` does (800, line-height 1, the game font; Hangul in Jua) at F px ×SS on a transparent page → coverage →
numpy shading → assets/img/rb_<lang>_<n>.webp + js/rb-text.js (window.CROCO_RB: key → the text it shows; game.js uses
a sprite only when its text matches, else it shows the plain text).

The sprite = the text's css box (advance × 1em) + PAD on each side, so css `.rb-txt img` (left 50 %, top −PAD_T em,
height 1 + PAD_T + PAD_B em) lays it exactly over the transparent text; the tool checks those numbers in style.css.

Run with the dev server up (python3 tools/serve.py 5211):
  uv run --with playwright --with numpy --with scipy --with pillow python tools/make_banner_text.py [--sheet out.png]
"""
import io, re, sys, json, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'http://127.0.0.1:5211/index.html?nohowto'
F = 300                       # px: font size of a sprite (the banner is 6.2u ≈ 69 CSS px at 1728×1117 → 139 at DPR 2)
SS = 2                        # supersampling of the shading
PAD_X, PAD_T, PAD_B = 0.2, 0.2, 0.4            # em round the css box (plate, side, shadow); = css .rb-txt img
LIGHT = np.array([-0.4, -0.8, 0.75])          # from the top left, toward the viewer (x right, y down, z out)
FATTEN = 0.012                # em: chubbier strokes, like the logo's
BEVEL = 0.72                  # letter bevel width / stroke half width (as the orbit letters)
PLATE = 0.075                 # em: the plate's rim round the letters
PLATE_BEVEL = 0.05            # em
SIDE = 0.07                   # em: the plate's thickness below it
LETTER = dict(c='#ffffff', top='#ffffff', deep='#f8d6a2', rim='#eab070')
PLATE_PAL = dict(c='#d26a17', top='#ec9440', deep='#b0520e', rim='#924209')
SIDE_RGB = ('#a8500f', '#8a3e09')             # the plate's side: top → bottom
SHADOW = dict(dy=0.12, dx=0.01, sigma=0.06, alpha=0.3, rgb=(140, 62, 12))


def hexrgb(h):
    h = h.strip().lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def texts():
    """{'en_1': 'Player 1 Wins!', …} from js/game.js's UI table"""
    js = (ROOT / 'js/game.js').read_text()
    wins = re.findall(r"\bwins: '([^']*)'", js)
    assert len(wins) == 2, wins                      # en, ko
    return {f'{lang}_{n}': w.replace('{n}', str(n)) for lang, w in zip(('en', 'ko'), wins) for n in (1, 2)}


def render(pg, s):
    """coverage (float, at F·SS) of the string laid out like css .ribbon, plus its box (advance, height) at F"""
    box = pg.evaluate("""async ([s, F, px, pt]) => {
      await document.fonts.load(`800 ${F}px "Baloo 2"`, s); await document.fonts.load(`800 ${F}px Jua`, s);
      document.body.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = s;
      b.style.cssText = `position:absolute; left:${px}px; top:${pt}px; display:block; white-space:nowrap; color:#000;
        font: 800 ${F}px/1 var(--font);`;
      document.body.appendChild(b);
      await document.fonts.ready;
      const r = b.getBoundingClientRect();
      return [r.width, r.height];
    }""", [s, F, PAD_X * F, PAD_T * F])
    w, h = box
    png = pg.screenshot(clip={'x': 0, 'y': 0, 'width': w + 2 * PAD_X * F, 'height': h + (PAD_T + PAD_B) * F}, omit_background=True)
    a = np.asarray(Image.open(io.BytesIO(png)).convert('RGBA'))[..., 3].astype(np.float32) / 255
    return a, (w, h)


def grow(a, r):
    """grow a coverage by r px all round (rounded corners), anti-aliased"""
    m = a > 0.5
    sd = np.where(m, -ndimage.distance_transform_edt(m), ndimage.distance_transform_edt(~m))
    return ndimage.gaussian_filter(np.clip(0.5 - (sd - r), 0, 1).astype(np.float32), 0.8)


def shade(a, pal, B, dome=0.35, gloss=1.0):
    """a rounded bevel B px wide (+ a gentle dome) lit from the top left → colour per pixel (the orbit letters' shading)"""
    m = a > 0.5
    D = ndimage.distance_transform_edt(m)
    x = np.clip(D / B, 0, 1)
    h = B * np.sqrt(np.clip(1 - (1 - x) ** 2, 0, 1))
    if dome:
        h = h + dome * B * ndimage.gaussian_filter(m.astype(np.float32), 1.1 * B) * m
    h = ndimage.gaussian_filter(h, 0.2 * B)
    gy, gx = np.gradient(h)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = LIGHT / np.linalg.norm(LIGHT)
    S = ((n @ L) / L[2])[..., None]                                           # 1 = the flat face
    base, top, deep, rim = (hexrgb(pal[k]) for k in ('c', 'top', 'deep', 'rim'))
    up = smooth(1.0, 1.45, S)
    col = base * (1 - up) + top * up
    dn = np.clip((1 - S) / 0.45, 0, 1)
    col = np.where(S < 1, base * (1 - dn) + deep * dn, col)
    dd = smooth(0.55, -0.25, S)
    col = np.where(S < 0.55, deep * (1 - dd) + rim * dd, col)
    if gloss:
        Hv = L + np.array([0, 0, 1.0])
        Hv /= np.linalg.norm(Hv)
        nh = np.clip(n @ Hv, 0, 1)
        ys = np.nonzero(m)[0]
        yy = np.mgrid[0:h.shape[0], 0:h.shape[1]][0]
        wpos = 0.35 + 0.65 * smooth(0.75, 0.2, (yy - ys.min()) / max(1, np.ptp(ys)))   # the upper bevels
        spec = np.clip(gloss * (smooth(0.55, 0.8, nh ** 220) + 0.1 * nh ** 18) * wpos, 0, 1)[..., None]
        col = col + (1 - col) * spec
    return np.clip(col, 0, 1)


def bake(a):
    k = F * SS
    a = grow(a, FATTEN * k)
    m = a > 0.5
    hw = np.percentile(ndimage.distance_transform_edt(m)[m], 90) / 0.9       # the strokes' half width
    plate = grow(a, PLATE * k)
    # the plate's side: the plate pushed down SIDE em (a solid extrusion), darker toward the bottom
    steps = 12
    side = np.zeros_like(plate)
    depth = np.zeros_like(plate)
    for i in range(1, steps + 1):
        s = ndimage.shift(plate, (SIDE * k * i / steps, 0), order=1, mode='constant')
        newer = s > side
        depth = np.where(newer, i / steps, depth)
        side = np.maximum(side, s)
    s0, s1 = hexrgb(SIDE_RGB[0]), hexrgb(SIDE_RGB[1])
    side_col = s0 + (s1 - s0) * depth[..., None]
    # the plate, with the letters' soft contact shadow on it
    plate_col = shade(plate, PLATE_PAL, PLATE_BEVEL * k, dome=0.15, gloss=0.25)
    cs = ndimage.shift(ndimage.gaussian_filter(a, 0.03 * k), (0.03 * k, 0.008 * k), order=1, mode='constant')
    plate_col = plate_col * (1 - 0.35 * (cs * (1 - a)))[..., None]
    letter_col = shade(a, LETTER, BEVEL * hw)
    # the drop shadow under the plate and its side
    body = np.maximum(plate, side)
    sh = ndimage.shift(ndimage.gaussian_filter(body, SHADOW['sigma'] * k), (SHADOW['dy'] * k, SHADOW['dx'] * k), order=1, mode='constant')
    sa = SHADOW['alpha'] * sh
    # composite (premultiplied), bottom up: shadow, side, plate, letters
    P = (np.array(SHADOW['rgb'], float) / 255) * sa[..., None]
    A = sa.copy()
    for col, al in ((side_col, side), (plate_col, plate), (letter_col, a)):
        P = col * al[..., None] + P * (1 - al)[..., None]
        A = al + A * (1 - al)
    im = Image.fromarray(np.dstack([np.clip(P * 255 + 0.5, 0, 255), np.clip(A * 255 + 0.5, 0, 255)]).astype(np.uint8), 'RGBa')
    small = im.resize((round(im.width / SS), round(im.height / SS)), Image.LANCZOS).convert('RGBA')
    arr = np.asarray(small).copy()
    arr[arr[..., 3] <= 2] = 0
    return Image.fromarray(arr, 'RGBA'), A, hw / k


def main():
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    css = (ROOT / 'css/style.css').read_text()
    want = f'.rb-txt img {{ position: absolute; left: 50%; top: -{PAD_T}em; height: {1 + PAD_T + PAD_B:g}em;'
    if want not in css:
        print('css/style.css must have:', want)
        sys.exit(1)
    T = texts()
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_page(viewport={'width': 3000, 'height': 1000}, device_scale_factor=SS)
        pg.goto(URL)
        pg.wait_for_function('window.__ready === true', timeout=90000)
        pg.evaluate("""() => { const s = document.createElement('style');
          s.textContent = 'html, body { background: none !important; } body::before, body::after { display: none !important; }';
          document.head.appendChild(s); }""")
        G = {key: render(pg, s) for key, s in T.items()}
        b.close()
    manifest, tiles = {}, []
    for key, (a, (w, h)) in G.items():
        im, A, hw = bake(a)
        ys, xs = np.nonzero(A > 0.01)
        H0, W0 = A.shape
        assert ys.min() > 0 and xs.min() > 0 and ys.max() < H0 - 1 and xs.max() < W0 - 1, (key, ys.min(), ys.max(), xs.min(), xs.max(), A.shape)
        out = ROOT / f'assets/img/rb_{key}.webp'
        im.save(out, 'WEBP', quality=92, method=6)
        manifest[key] = {'t': T[key]}
        print(f'{key}: "{T[key]}" {im.size[0]}×{im.size[1]}  box {w:.0f}×{h:.0f}  stroke half width {hw:.3f} em  {out.stat().st_size // 1024} KB')
        tiles.append(im)
    (ROOT / 'js/rb-text.js').write_text('/* generated by tools/make_banner_text.py — the result banner\'s baked texts (assets/img/rb_<key>.webp) */\n'
                                        'window.CROCO_RB = ' + json.dumps(manifest, ensure_ascii=False) + ';\n', encoding='utf-8')
    if sheet:
        s = Image.new('RGBA', (max(t.width for t in tiles) + 40, sum(t.height + 20 for t in tiles) + 20), (255, 173, 56, 255))
        y = 20
        for t in tiles:
            s.alpha_composite(t, (20, y)); y += t.height + 20
        s.convert('RGB').save(sheet)
        print('sheet', sheet, s.size)


if __name__ == '__main__':
    main()
