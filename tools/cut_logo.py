"""Cut the "Croco Phonics" logo out of the user's intro reference (design/intro_ref.png) -> assets/img/logo.png

Run: uv run --with "rembg[cpu]" --with pillow --with numpy --with scipy python tools/cut_logo.py
  - matte: rembg birefnet-general-lite on a generous crop (models cached in ~/.cache/rembg)
  - clean: keep the largest opaque blob + soft parts attached to it (drops stray sparkles/dots far away)
  - decontaminate: the logo sits on a light-blue blurred wall; edge pixels carry that blue.
    B (background) = normalized convolution of the clearly-background pixels around the matte,
    F = B + (I - B) / alpha on the soft rim, blended toward the local interior colour where alpha is low.
  - trim to the alpha bbox + 8 px padding, save PNG (and a 1200 px webp for the page).
"""
import os
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
os.environ.setdefault('U2NET_HOME', os.path.expanduser('~/.cache/rembg'))
SRC = ROOT / 'design' / 'intro_ref.png'
OUT = ROOT / 'assets' / 'img'
DBG = pathlib.Path(os.environ.get('CUT_DBG', '/Users/jini/.hermes/cache/scratch/croco/logo'))
DBG.mkdir(parents=True, exist_ok=True)
BOX = (600, 40, 1800, 780)          # x0, y0, x1, y1 in the 2400x1792 reference
MODEL = sys.argv[1] if len(sys.argv) > 1 else 'birefnet-general-lite'

im = Image.open(SRC).convert('RGB')
crop = im.crop(BOX)
mask_path = DBG / f'mask_{MODEL}.png'
if mask_path.exists():
    mask = Image.open(mask_path).convert('L')
else:
    from rembg import new_session, remove
    sess = new_session(MODEL)
    mask = remove(crop, session=sess, only_mask=True)
    mask.save(mask_path)
crop.save(DBG / 'crop.png')

I = np.asarray(crop).astype(np.float32) / 255.0
a = np.asarray(mask).astype(np.float32) / 255.0

# 1) keep the main blob: largest alpha>0.5 component (+ anything within 6 px of it), drop far specks
core = a > 0.5
lab, n = ndi.label(core)
if n:
    sizes = ndi.sum(core, lab, range(1, n + 1))
    keep_ids = [i + 1 for i, s in enumerate(sizes) if s >= max(400, 0.002 * sizes.max())]
    keep = np.isin(lab, keep_ids)
    near = ndi.binary_dilation(keep, iterations=6)
    soft = a > 0.02
    lab2, _ = ndi.label(soft)
    ids = np.unique(lab2[near & soft])
    region = np.isin(lab2, ids[ids > 0])
    a = np.where(region, a, 0.0)
    print('components', n, 'kept', len(keep_ids))

# 2) background estimate from clearly-background pixels (alpha < 0.02, away from the rim)
bg = (a < 0.02) & ~ndi.binary_dilation(a > 0.02, iterations=3)
w = bg.astype(np.float32)
sig = 18
num = np.stack([ndi.gaussian_filter(I[..., c] * w, sig) for c in range(3)], -1)
den = ndi.gaussian_filter(w, sig)[..., None]
B = num / np.maximum(den, 1e-4)
# where no background nearby (deep inside), B is meaningless but alpha is ~1 there anyway

# 3) interior colour estimate (alpha > 0.95), spread outward
fg = a > 0.95
wf = fg.astype(np.float32)
numf = np.stack([ndi.gaussian_filter(I[..., c] * wf, 3) for c in range(3)], -1)
denf = ndi.gaussian_filter(wf, 3)[..., None]
Fhat = numf / np.maximum(denf, 1e-4)
for s in (6, 12, 24):   # fill gaps further out
    m = denf[..., 0] < 1e-3
    numf2 = np.stack([ndi.gaussian_filter(I[..., c] * wf, s) for c in range(3)], -1)
    denf2 = ndi.gaussian_filter(wf, s)[..., None]
    F2 = numf2 / np.maximum(denf2, 1e-4)
    Fhat[m] = F2[m]
    denf = np.maximum(denf, denf2)

aa = a[..., None]
F = np.where(aa > 0.02, B + (I - B) / np.maximum(aa, 0.02), Fhat)
F = np.clip(F, 0, 1)
# low alpha: lean on the interior colour (the un-mixing is noisy there)
t = np.clip((aa - 0.15) / 0.6, 0, 1)
F = F * t + Fhat * (1 - t)
F = np.where(aa > 0.97, I, F)

# 4) the crocodile's head top sits right under the logo in the reference (green skin + eyes): the matte keeps it.
#    croc = green pixels in the lower band that touch the crop's bottom edge, closed with the bottom edge so the
#    eye whites/pupils (enclosed by green sockets) fill in. Lavender/purple decorations in front of it (music note,
#    'p' cube) are protected and their green-tinted rim is recoloured from their own interior.
import colorsys  # noqa: E402
hsv = np.asarray(crop.convert('HSV')).astype(np.float32) / 255.0
H, S, V = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
band = np.zeros_like(a, bool)
band[int(a.shape[0] * 0.72):] = True
green = band & (H > 70) & (H < 170) & (S > 0.22) & (V > 0.2)
lab, n = ndi.label(green)
touch = np.unique(lab[-1][lab[-1] > 0])
skin = np.isin(lab, touch)
closed = np.vstack([skin, np.ones((1, skin.shape[1]), bool)])
closed = ndi.binary_closing(closed, iterations=4)
filled = ndi.binary_fill_holes(closed)[:-1]
croc = ndi.binary_dilation(filled, iterations=3)
deco = (H > 235) & (H < 345) & (S > 0.12) & (a > 0.3)
deco = ndi.binary_opening(deco, iterations=1)
lab_d, nd = ndi.label(deco)
protect = np.zeros_like(deco)
for i in range(1, nd + 1):
    m = lab_d == i
    if m.sum() > 300 and (m & croc).any():
        protect |= ndi.binary_fill_holes(ndi.binary_dilation(m, iterations=2))
cut = croc & ~protect
print('croc pixels removed', int(cut.sum()), '· protected deco pixels', int(protect.sum()))
a = np.where(cut, 0.0, a)
# what's left of the croc (eye whites, pupils, their soft shadow rims) no longer touches the logo: keep only the
# components that reach above the band (the logo plate) or are protected decorations
top_rows = int(a.shape[0] * 0.72)
lab3, n3 = ndi.label((a > 0.25) & ~protect)
ids = set(np.unique(lab3[:top_rows][lab3[:top_rows] > 0]))
ids.discard(0)
keepm = ndi.binary_dilation(np.isin(lab3, list(ids)) | protect, iterations=3)
print('leftover components dropped', n3 - len(ids))
a = np.where(keepm, a, 0.0)
rim = protect & ndi.binary_dilation(croc, iterations=4)
if rim.any():
    inner = protect & ~ndi.binary_dilation(croc, iterations=6)
    wi = inner.astype(np.float32)
    num = np.stack([ndi.gaussian_filter(F[..., c] * wi, 6) for c in range(3)], -1)
    den = ndi.gaussian_filter(wi, 6)[..., None]
    F = np.where(rim[..., None], num / np.maximum(den, 1e-4), F)
aa = a[..., None]

rgba = np.concatenate([F, aa], -1)
ys, xs = np.where(a > 0.02)
pad = 8
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, a.shape[0])
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, a.shape[1])
out = Image.fromarray((rgba[y0:y1, x0:x1] * 255 + 0.5).astype(np.uint8), 'RGBA')
OUT.mkdir(parents=True, exist_ok=True)
out.save(OUT / 'logo.png', optimize=True)
w1 = 1200
small = out.resize((w1, round(out.height * w1 / out.width)), Image.LANCZOS)
small.save(OUT / 'logo.webp', quality=92, alpha_quality=100, method=6)
print('bbox in crop', (x0, y0, x1, y1), 'size', out.size, '->', OUT / 'logo.png', OUT / 'logo.webp')

# debug previews over two backgrounds
for name, col in (('peach', (255, 236, 222)), ('navy', (29, 35, 64))):
    bgim = Image.new('RGBA', out.size, col + (255,))
    bgim.alpha_composite(out)
    bgim.convert('RGB').save(DBG / f'logo_on_{name}.png')
print('debug ->', DBG)
