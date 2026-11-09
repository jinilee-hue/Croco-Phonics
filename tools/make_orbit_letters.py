#!/usr/bin/env python3
"""Bake the title's orbit letters as puffy candy sprites, the same volume as the logo's letters (user: "스펠링의 볼륨감
로고와 같아야해"). CSS can only paint a flat glyph with a gradient; the logo's letters are inflated: a flat bright face,
rounded bevels that darken to a richer same-hue edge at the bottom right, white gloss streaks on the top-left bevels and
a soft shadow under them.

For each orbit letter (read from the page: its character and its palette --c / --top / --deep / --rim):
  1. Chrome renders the glyph exactly as css `.ol b` does (800, line-height 1, the game font) at F px, supersampled ×SS,
     on a transparent page → its coverage.
  2. numpy: distance to the edge → a quarter-round bevel (width = 0.62 × the stroke's half width, like the logo's) plus a
     gentle dome (a blurred mask, so no crease down the strokes) → normals → light from the top left: the face keeps the
     letter's colour, bevels facing the light go to --top, the ones facing away to --deep then --rim; a Blinn streak +
     a soft sheen (stronger toward the top left); a soft shadow below (as the old drop-shadow: .11em down, σ .065em).
  3. Downsampled (premultiplied) to F px → assets/img/ol_<ch>.webp.

The sprite = the letter's css box (advance × 1em) + PAD on each side, so css `.ol b img` (left 50 %, top −PAD_T em,
height 1 + PAD_T + PAD_B em) lays it exactly over the transparent text; the tool checks those numbers in style.css.

Run with the dev server up (python3 tools/serve.py 5211):
  uv run --with playwright --with numpy --with scipy --with pillow python tools/make_orbit_letters.py [--sheet out.png]
"""
import io, re, sys, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'http://127.0.0.1:5211/index.html?nohowto'
F = 420                       # px: font size of a sprite (a front letter is 19u ≈ 204 CSS px at 1728×1117 → ~408 at DPR 2)
SS = 3                        # supersampling of the shading
PAD_X, PAD_T, PAD_B = 0.2, 0.2, 0.38          # em round the css box (glyph overhang, gloss, shadow); = css .ol b img
LIGHT = np.array([-0.4, -0.8, 0.75])          # from the top left, toward the viewer (x right, y down, z out)
FATTEN = 0.016                # em: the strokes grow by this all round (rounded): the logo's letters are chubbier than Baloo 800
BEVEL = 0.72                  # bevel width / stroke half width (the logo's rounded edge is wide: ~30-40 % of the stroke)
SHADOW = dict(dy=0.11, dx=0.015, sigma=0.065, alpha=0.24, rgb=(70, 60, 90))


def hexrgb(h):
    h = h.strip().lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def glyphs(pg, letters):
    """coverage (float H×W at F·SS) of each letter, laid out like css .ol b, plus the box (advance, height) in px at F"""
    pg.evaluate("""() => {
      document.body.innerHTML = '';
      const s = document.createElement('style');
      s.textContent = 'html, body { background: none !important; } body::before, body::after { display: none !important; }';
      document.head.appendChild(s);
    }""")
    out = {}
    for ch in letters:
        box = pg.evaluate("""([ch, F, px, pt]) => {
          document.body.innerHTML = '';
          const b = document.createElement('b');
          b.textContent = ch;
          b.style.cssText = `position:absolute; left:${px}px; top:${pt}px; display:block; white-space:nowrap; color:#000;
            font: 800 ${F}px/1 var(--font);`;
          document.body.appendChild(b);
          const r = b.getBoundingClientRect();
          return [r.width, r.height];
        }""", [ch, F, PAD_X * F, PAD_T * F])
        w, h = box
        cw, chh = w + 2 * PAD_X * F, h + (PAD_T + PAD_B) * F
        png = pg.screenshot(clip={'x': 0, 'y': 0, 'width': cw, 'height': chh}, omit_background=True)
        a = np.asarray(Image.open(io.BytesIO(png)).convert('RGBA'))[..., 3].astype(np.float32) / 255
        out[ch] = (a, (w, h))
    return out


def fatten(a, r):
    """grow the glyph by r px all round (rounded corners), anti-aliased"""
    m = a > 0.5
    sd = np.where(m, -ndimage.distance_transform_edt(m), ndimage.distance_transform_edt(~m))
    return ndimage.gaussian_filter(np.clip(0.5 - (sd - r), 0, 1).astype(np.float32), 0.8)


def shade(a, pal, B):
    m = a > 0.5
    D = ndimage.distance_transform_edt(m)
    x = np.clip(D / B, 0, 1)
    h = B * np.sqrt(np.clip(1 - (1 - x) ** 2, 0, 1))                       # quarter-round bevel, flat face
    dome = ndimage.gaussian_filter(m.astype(np.float32), 1.1 * B)            # inflated a little (no crease)
    h = h + 0.35 * B * dome * m
    h = ndimage.gaussian_filter(h, 0.2 * B)
    gy, gx = np.gradient(h)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = LIGHT / np.linalg.norm(LIGHT)
    s = (n @ L) / L[2]                                                       # 1 = the flat face
    base, top, deep, rim = (hexrgb(pal[k]) for k in ('c', 'top', 'deep', 'rim'))
    S = s[..., None]
    up = smooth(1.0, 1.45, S)
    col = base * (1 - up) + top * up
    dn = np.clip((1 - S) / 0.45, 0, 1)
    col = np.where(S < 1, base * (1 - dn) + deep * dn, col)
    dd = smooth(0.55, -0.25, S)
    col = np.where(S < 0.55, deep * (1 - dd) + rim * dd, col)
    # gloss: a sharp streak + a soft sheen, mostly on the top-left bevels (the logo's)
    Hv = L + np.array([0, 0, 1.0])
    Hv /= np.linalg.norm(Hv)
    nh = np.clip(n @ Hv, 0, 1)
    ys, xs = np.nonzero(m)
    yy, xx = np.mgrid[0:h.shape[0], 0:h.shape[1]]
    u = 0.5 * ((xx - xs.min()) / max(1, np.ptp(xs)) + (yy - ys.min()) / max(1, np.ptp(ys)))
    wpos = 0.3 + 0.7 * smooth(0.8, 0.25, u)
    spec = np.clip((1.0 * smooth(0.55, 0.8, nh ** 220) + 0.1 * nh ** 18) * wpos, 0, 1)[..., None]   # crisp streak
    col = col + (1 - col) * spec
    return np.clip(col, 0, 1)


def sprite(a, pal, B):
    col = shade(a, pal, B)
    k = F * SS
    sh = ndimage.gaussian_filter(a, SHADOW['sigma'] * k)
    sh = ndimage.shift(sh, (SHADOW['dy'] * k, SHADOW['dx'] * k), order=1, mode='constant')
    sa = SHADOW['alpha'] * sh
    srgb = np.array(SHADOW['rgb'], float) / 255
    A = a + sa * (1 - a)
    P = col * a[..., None] + srgb * (sa * (1 - a))[..., None]            # premultiplied
    im = Image.fromarray(np.dstack([np.clip(P * 255 + 0.5, 0, 255), np.clip(A * 255 + 0.5, 0, 255)]).astype(np.uint8), 'RGBa')
    small = im.resize((round(im.width / SS), round(im.height / SS)), Image.LANCZOS).convert('RGBA')
    arr = np.asarray(small).copy()
    arr[arr[..., 3] <= 2] = 0
    return Image.fromarray(arr, 'RGBA'), A


def main():
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    css = (ROOT / 'css/style.css').read_text()
    want = f'.ol b img {{ position: absolute; left: 50%; top: -{PAD_T}em; height: {1 + PAD_T + PAD_B:g}em;'
    if want not in css:
        print('css/style.css must have:', want)
        sys.exit(1)
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_page(viewport={'width': 1200, 'height': 1000}, device_scale_factor=SS)
        pg.goto(URL)
        pg.wait_for_function('window.__ready === true', timeout=90000)
        pg.evaluate('document.fonts.ready.then(() => true)')
        pal = pg.evaluate("""() => [...document.querySelectorAll('.orbit-front .ol b')].map(b => ({ ch: b.textContent,
            c: b.style.getPropertyValue('--c'), top: b.style.getPropertyValue('--top'),
            deep: b.style.getPropertyValue('--deep'), rim: b.style.getPropertyValue('--rim') }))""")
        letters = [q['ch'] for q in pal]
        assert len(letters) == len(set(letters)) and all(q['c'] for q in pal), pal
        G = glyphs(pg, letters)
        b.close()
    G = {ch: (fatten(a, FATTEN * F * SS), box) for ch, (a, box) in G.items()}
    # one bevel for all: from the strokes' half width (the median letter's 90th percentile of the inside distance)
    hw = np.median([np.percentile(ndimage.distance_transform_edt(a > 0.5)[a > 0.5], 90) / 0.9 for a, _ in G.values()])
    B = BEVEL * hw
    print(f'stroke half width {hw / (F * SS):.3f} em → bevel {B / (F * SS):.3f} em')
    tiles = []
    for q in pal:
        a, (w, h) = G[q['ch']]
        im, A = sprite(a, q, B)
        ys, xs = np.nonzero(A > 0.01)
        H0, W0 = A.shape
        # the content must stay inside the canvas (else raise PAD)
        assert ys.min() > 0 and xs.min() > 0 and ys.max() < H0 - 1 and xs.max() < W0 - 1, (q['ch'], ys.min(), ys.max(), xs.min(), xs.max(), A.shape)
        out = ROOT / f"assets/img/ol_{q['ch']}.webp"
        im.save(out, 'WEBP', quality=90, method=6)
        print(f"{q['ch']}: {im.size[0]}×{im.size[1]}  box {w:.0f}×{h:.0f}  {out.stat().st_size // 1024} KB")
        tiles.append(im)
    if sheet:
        Wt = sum(t.width for t in tiles) + 8 * len(tiles)
        s = Image.new('RGBA', (Wt, max(t.height for t in tiles)), (238, 231, 222, 255))
        x = 0
        for t in tiles:
            s.alpha_composite(t, (x, 0)); x += t.width + 8
        s.convert('RGB').save(sheet)
        print('sheet', sheet, s.size)


if __name__ == '__main__':
    main()
