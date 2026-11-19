"""Card pictures from the common picture source (phonics-kit rule 2026-11-19: the picture inside a picture card = the
lesson pack's image, else 공통이미지자료/FPR K_U1,2 대표이미지). Re-draws assets/cards/<w>.webp for every word in js/words.js
that has such a picture, fitted exactly like tools/build_words.py fit_card (512×539, cut to its outline, one common visual
size); a word without one (toy) keeps its card. Which words a level has does NOT change here (build_words.py decides).
Then: uv run --with pillow python tools/card_boxes.py
usage: uv run --with pillow --with numpy python tools/rep_cards.py
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit/tools'))
import lessonpack  # noqa: E402

CW, BOX_W, BOX_H, TARGET = 512, 0.86, 0.905, 0.76          # = build_words.py
CH = round(CW * BOX_H / BOX_W)


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
    done, kept = [], []
    for w in words:
        pic = lessonpack.picture(w)
        if not pic:
            kept.append(w)
            continue
        fit_card(Image.open(pic)).save(ROOT / 'assets' / 'cards' / f'{w}.webp', 'WEBP', quality=90, method=6)
        done.append(w)
    print(f'{len(done)} cards from the common pictures · own card kept: {", ".join(kept) or "-"}')


if __name__ == '__main__':
    main()
