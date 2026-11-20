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


def cut_white(im):
    """the near-white that touches the edge (+ the faint floor shadow in it) -> transparent, the edge softened by a pixel;
    only for a picture on an opaque white square (same rule as Phonics-Halli-Galli-3D tools/rep_cards.py)"""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lo = rgb.min(-1)
    whiteish = (lo >= 190) & (rgb.max(-1) - lo <= 18) & (al > 200)
    ring = np.ones(al.shape, bool)
    ring[8:-8, 8:-8] = False
    if whiteish[ring].mean() < .9:
        return im, False
    lab, _ = ndi.label(whiteish)
    ids = np.unique(lab[ring & whiteish])
    bg = ndi.binary_dilation(np.isin(lab, ids[ids > 0]), iterations=1)
    soft = np.asarray(Image.fromarray(bg.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    a[..., 3] = al * (1 - soft)
    return Image.fromarray(a.astype(np.uint8), 'RGBA'), True


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
