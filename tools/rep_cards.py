"""Card pictures from the common picture source (phonics-kit rule 2026-11-19: the picture inside a picture card = the
lesson pack's image, else 공통이미지자료/FPR K_U1,2 대표이미지). Re-draws assets/cards/<w>.webp for every word in js/words.js
that has such a picture, fitted exactly like tools/build_words.py fit_card (512×539, cut to its outline, one common visual
size); a word without one (toy) keeps its card. Which words a level has does NOT change here (build_words.py decides).
Then: uv run --with pillow python tools/card_boxes.py
A picture on an opaque white square (dog) loses that white first (cut_white — user 2026-11-20: "dog 흰바탕 빼야해").
usage: uv run --with pillow --with numpy --with scipy python tools/rep_cards.py
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit/tools'))
import lessonpack  # noqa: E402

CW, BOX_W, BOX_H, TARGET = 512, 0.86, 0.905, 0.76          # = build_words.py
CH = round(CW * BOX_H / BOX_W)


def cut_white(pic):
    """(same rule as Phonics-Halli-Galli-3D tools/rep_cards.py cut_white)
    a picture on an opaque white square (dog — user: "dog 흰바탕 빼야해", then "흰색 배경삭제가 제대로 안된거 같은데"):
    - the background = the pale grey-white that touches the edge (its floor shadow too) + big pure-white holes it cannot reach
      (between the legs, under the belly) → transparent, the floor shadow kept as a soft see-through shadow;
    - the edge (fur tips mixed with the white) un-mixed: alpha from how far a pixel is from white, colour with the white taken out
    Pictures without a white square stay as they are."""
    a = np.asarray(pic.convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lo = rgb.min(-1)
    sat = rgb.max(-1) - lo
    ring = np.ones(al.shape, bool)
    ring[8:-8, 8:-8] = False
    if ((lo >= 190) & (sat <= 18) & (al > 200))[ring].mean() < .9:
        return pic, False
    pale = (lo >= 120) & (sat <= 24) & (al > 200)                  # white … the floor shadow's grey (fur is sat ≥ 79)
    lab, _ = ndi.label(pale)
    ids = np.unique(lab[ring & pale])
    bg = np.isin(lab, ids[ids > 0])
    white = (lo >= 215) & (sat <= 24)                               # pure-white holes the edge can't reach
    lab, n = ndi.label(white & ~bg)
    if n:
        size = ndi.sum(np.ones_like(lo), lab, index=np.arange(1, n + 1))
        bg |= np.isin(lab, 1 + np.nonzero(size > .001 * lo.size)[0])
    lab, _ = ndi.label((lo >= 165) & (sat <= 45) & ~bg)             # pale slivers touching it (under the paws: sat ≈ 30; paw fur ≥ 85)
    ids = np.unique(lab[ndi.binary_dilation(bg, iterations=2) & (lab > 0)])
    bg |= np.isin(lab, ids)
    fg = ~bg
    out = a.copy()
    # background: white → clear, grey → a soft dark shadow (alpha from its darkness)
    sh = np.clip((248 - lo) / 248, 0, 1) * .85
    out[bg, :3] = 40
    out[bg, 3] = al[bg] * sh[bg]
    # the edge band: un-mix the white (alpha from whiteness against the fur colour just inside)
    band = ndi.binary_dilation(bg, iterations=4) & fg
    inner = ndi.binary_dilation(bg, iterations=14) & ndi.binary_erosion(fg, iterations=5)
    ref = float(np.median(lo[inner])) if inner.any() else 150.
    k = np.clip((255 - lo) / max(255 - ref, 30), 0, 1)
    kb = np.maximum(k[band], .02)[:, None]
    out[band, :3] = np.clip((rgb[band] - (1 - kb) * 255) / kb, 0, 255)
    out[band, 3] = al[band] * k[band]
    out[..., 3] = np.asarray(Image.fromarray(out[..., 3].astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6))).astype(np.float32)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA'), True


def fit_card(src):                                         # = build_words.py fit_card
    im = src.convert('RGBA')
    ys, xs = np.nonzero(np.asarray(im.getchannel('A')) > 12)
    c = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    cw, ch = c.size
    s = min(CW / cw, CH / ch, TARGET * (CW / BOX_W) / (cw * ch) ** 0.5)
    w, h = max(1, round(cw * s)), max(1, round(ch * s))
    out = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    out.paste(c.convert('RGBa').resize((w, h), Image.Resampling.LANCZOS).convert('RGBA'), ((CW - w) // 2, (CH - h) // 2))
    return out


def main():
    wj = json.loads((ROOT / 'js' / 'words.js').read_text(encoding='utf-8').split('=', 1)[1].rstrip().rstrip(';'))
    words = list(dict.fromkeys(w['w'] for lv in wj['levels'] for w in lv['words']))
    done, kept, cuts = [], [], []
    for w in words:
        pic = lessonpack.picture(w)
        if not pic:
            kept.append(w)
            continue
        im, cut = cut_white(Image.open(pic))
        fit_card(im).save(ROOT / 'assets' / 'cards' / f'{w}.webp', 'WEBP', quality=90, method=6)
        done.append(w)
        if cut:
            cuts.append(w)
    print(f'{len(done)} cards from the common pictures · own card kept: {", ".join(kept) or "-"} · white square cut: {", ".join(cuts) or "-"}')


if __name__ == '__main__':
    main()
