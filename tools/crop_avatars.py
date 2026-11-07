"""Crop the two player avatars (round portraits with a white ring) out of the user's game-screen reference.

design/game_ref.png (2400x1792): Player 1 (girl) top-left, Player 2 (boy in a bear hat) top-right.
Finds each white ring (near-white, low-saturation pixels in an annulus around the rough centre), fits a circle
(Kasa least squares), cuts the disc just inside the ring with an anti-aliased round alpha → assets/img/p1.webp, p2.webp
(512x512). The ring itself is drawn by CSS so it can light up for the player whose turn it is.

Run: uv run --with pillow --with numpy python tools/crop_avatars.py
"""
import pathlib

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
im = Image.open(ROOT / 'design' / 'game_ref.png').convert('RGB')
A = np.asarray(im).astype(np.float32)
SIZE = 512


def fit_circle(xs, ys):
    M = np.c_[2 * xs, 2 * ys, np.ones_like(xs)]
    b = xs ** 2 + ys ** 2
    (cx, cy, c), *_ = np.linalg.lstsq(M, b, rcond=None)
    return cx, cy, np.sqrt(c + cx ** 2 + cy ** 2)


for name, (cx0, cy0) in (('p1', (230, 230)), ('p2', (2166, 230))):
    R = 230
    x0, y0 = cx0 - R, cy0 - R
    sub = A[y0:y0 + 2 * R, x0:x0 + 2 * R]
    mx, mn = sub.max(-1), sub.min(-1)
    white = (mn > 228) & (mx - mn < 22)
    yy, xx = np.mgrid[0:2 * R, 0:2 * R]
    d = np.hypot(xx - R, yy - R)
    ring = white & (d > 110) & (d < 200)
    cx, cy, r = fit_circle(xx[ring].astype(float), yy[ring].astype(float))
    dd = np.hypot(xx[ring] - cx, yy[ring] - cy)
    r_in, r_out = np.percentile(dd, 4), np.percentile(dd, 97)
    print(f'{name}: centre ({x0 + cx:.1f}, {y0 + cy:.1f}) ring r {r:.1f} inner {r_in:.1f} outer {r_out:.1f} (px {ring.sum()})')
    rc = r_in - 3                              # stay inside the ring (its inner edge is anti-aliased)
    box = (x0 + cx - rc, y0 + cy - rc, x0 + cx + rc, y0 + cy + rc)
    disc = im.crop(tuple(int(round(v)) for v in box)).resize((SIZE, SIZE), Image.LANCZOS)
    ss = 4
    Y, X = np.mgrid[0:SIZE * ss, 0:SIZE * ss]
    c = (SIZE * ss - 1) / 2
    m = (np.hypot(X - c, Y - c) <= SIZE * ss / 2 - ss).astype(np.float32)
    alpha = m.reshape(SIZE, ss, SIZE, ss).mean((1, 3))
    out = disc.convert('RGBA')
    out.putalpha(Image.fromarray((alpha * 255 + .5).astype(np.uint8)))
    dst = ROOT / 'assets' / 'img' / f'{name}.webp'
    out.save(dst, quality=92, alpha_quality=100, method=6)
    print('  →', dst)
