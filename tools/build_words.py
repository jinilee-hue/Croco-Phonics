"""Build js/words.js — the croc's LEVELS: Level N = FPR K Lesson N, in book order (user: "레벨1이 끝나면 레벨2로 …
lesson2에 배워야하는 음가와 단어로 넘어가야해 계속 레벨업하면 교재기반으로 계속 레벨 올라가게").

Level 1 keeps the user's first rule ("m 단어들은 다 fpr k unit1 lesson1에 교재에 나오는걸로"), and every level applies it to
its own lesson. A level's words are the lemmas with a row on that lesson's pages that carry the lesson's sound:
  - Xx lessons: the word starts with that consonant (not a digraph: sh ch th wh ph kn wr; c and g hard, not c/g + e i y).
    Xx = ending x (box, fox). Qu = starts with qu.
  - Short-vowel lessons: the word starts with the vowel, or is a closed CVC-type word with it
    (not ar / aw / all / ay / ai / ir / igh / ind / or / ow / oa / oo / er / ee / ea / ur … sounds).
It also needs what the game must show and say:
  - an official FPR K picture card: already here (the m cards), Magic Block's fitted card, or Phonics Island's cards2
    (the Constella FPR K set), fitted like Magic Block's (tools/fit_cards.py there);
  - a word clip in the game's boy voice (company TTS 'aiden'): Magic Block's or Phonics Island's;
  - the lesson's official FPR K letter-sound recording (Phonics Island public/fpr).
Function words (my, a, in, it, no, …) are left out: a card game needs a picture to show.
Levels follow the book with no gaps. A lesson with fewer than MIN_WORDS words, or not one sound (reviews, long vowels,
final e), is not a level yet; `notYet` in words.js and this script's output say why.

Source: SAD·FPR 단어 연구 자료집 → ~/dev/sadfpr-studio/data/b2_book_FPRK.json (lp: lesson → pages, lu: lesson → unit,
rows: lemma + page + lesson, words: lemma → printed / picture pages, gm: Korean glosses, title: page titles).
Only words, Korean glosses and page numbers are written — never textbook sentences (internal material).

Run: /Users/jini/.hermes/bin/uv run --with pillow --with numpy python tools/build_words.py
     (then tools/build_voice.py: it reads the levels for the word and letter-sound clips)
"""
import json
import os
import pathlib
import re
import shutil

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PH = pathlib.Path(os.path.expanduser('~/Documents/Jini/2026/Phonics'))
SRC = pathlib.Path(os.path.expanduser('~/dev/sadfpr-studio/data/b2_book_FPRK.json'))
ISLAND = PH / 'Phonics_island/phonics-island-3d/public'
JENGA = PH / 'Phonics-Jenga'
CARDS = ROOT / 'assets' / 'cards'
MIN_WORDS = 4
B = json.loads(SRC.read_text(encoding='utf-8'))
W, GM = B['words'], B['gm']
NAMES = {n.lower() for n in B['names']}
FUNCTION = {'my', 'a', 'an', 'the', 'i', 'in', 'it', 'is', 'at', 'am', 'as', 'no', 'do', 'to', 'go', 'so', 'of', 'on', 'off',
            'up', 'us', 'that', 'this', 'and', 'not', 'yes', 'you', 'we', 'he', 'she', 'me', 'be'}
DIGRAPH = ('sh', 'ch', 'th', 'wh', 'ph', 'kn', 'wr')
HARD_G = {'gift', 'girl', 'give', 'get', 'geese', 'gear', 'gecko', 'giggle', 'gill', 'gills'}
NOT_SHORT = {'a': ('ar', 'aw', 'all', 'al', 'ay', 'ai'), 'i': ('ir', 'igh', 'ind', 'ild'), 'o': ('or', 'ow', 'oa', 'old', 'oo', 'ou', 'oy', 'oi'),
             'e': ('er', 'ew', 'ee', 'ea', 'ey'), 'u': ('ur', 'ue')}
NOT_SHORT_WORDS = {'want', 'wash', 'what', 'was', 'watch', 'water', 'swan', 'push', 'bush', 'pull', 'bull', 'put', 'full', 'son', 'won', 'ton'}

jenga_clips = json.loads((JENGA / 'src/data/voice.json').read_text())['clips']
island_vm = json.loads((ISLAND / 'voice' / 'manifest.json').read_text())
island_keys = set(island_vm['keys'])
fpr = json.loads((ISLAND / 'fpr' / 'manifest.json').read_text())['clips']


def island_key(text, speaker='learn'):
    """Phonics Island's clip name (src/core/voiceLines.ts voiceKey: FNV-1a of 'speaker|text', base 36)"""
    s, h = f'{speaker}|{text.strip()}', 0x811c9dc5
    for ch in s:
        h = ((h ^ ord(ch)) * 0x01000193) & 0xffffffff
    d, out = '0123456789abcdefghijklmnopqrstuvwxyz', ''
    while True:
        out, h = d[h % 36] + out, h // 36
        if not h:
            return out


assert island_key('map') in island_keys, 'Phonics Island voice key scheme changed'


def has_voice(w):
    return f'w:{w}' in jenga_clips or island_key(w) in island_keys


# ── cards: Magic Block's fitting (one common visual size in the 512 × 532 picture-box canvas) ───────────────────────
CW, BOX_W, BOX_H, TARGET = 512, 0.86, 0.905, 0.76
CH = round(CW * BOX_H / BOX_W)


def fit_card(src: Image.Image) -> Image.Image:
    im = src.convert('RGBA')
    ys, xs = np.nonzero(np.asarray(im.getchannel('A')) > 12)
    c = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    cw, ch = c.size
    s = min(CW / cw, CH / ch, TARGET * (CW / BOX_W) / (cw * ch) ** 0.5)
    w, h = max(1, round(cw * s)), max(1, round(ch * s))
    out = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    # premultiplied while scaling: no dark fringe from the transparent pixels' colour
    out.paste(c.convert('RGBa').resize((w, h), Image.Resampling.LANCZOS).convert('RGBA'), ((CW - w) // 2, (CH - h) // 2))
    return out


def card_for(w, dry=False):
    dst = CARDS / f'{w}.webp'
    if dst.exists() and dst.stat().st_size > 0:      # (an interrupted run once left a 0-byte card)
        return dst
    jenga, island = JENGA / 'public' / 'cards' / f'{w}.webp', ISLAND / 'cards2' / f'{w}.webp'
    if not (jenga.exists() or island.exists()):
        return None
    if dry:
        return dst
    CARDS.mkdir(parents=True, exist_ok=True)
    if jenga.exists():
        shutil.copy2(jenga, dst)                      # already fitted there
    else:
        fit_card(Image.open(island)).save(dst, 'WEBP', quality=90, method=6)
    return dst


def lesson_sound(L):
    title = (B['title'].get(str(B['lp'][str(L)][0])) or '').split('•')[-1].split('(')[0].strip()
    m = re.fullmatch(r'Short ([aeiou])', title)
    if m:
        return title, m.group(1), 'short'
    if title == 'Qu':
        return title, 'qu', 'letter'
    m = re.fullmatch(r'([A-Z])([a-z])', title)
    if m and m.group(1).lower() == m.group(2):
        return title, m.group(2), 'letter'
    return title, None, 'other'                       # reviews, long vowels, final e: not one sound


def carries(wl, ch, kind):
    """where the lesson's sound is in the word (index), or -1"""
    if kind == 'short':
        if wl in NOT_SHORT_WORDS:
            return -1
        i = wl.find(ch)
        ok = i >= 0 and (i == 0 or bool(re.fullmatch(rf'[^aeiou]+{ch}[^aeiouy]+', wl))) and not wl[i:].startswith(NOT_SHORT[ch])
        return i if ok else -1
    if ch == 'x':
        return len(wl) - 1 if wl.endswith('x') else -1
    if not wl.startswith(ch) or wl.startswith(DIGRAPH):
        return -1
    if ch == 'c' and wl[1:2] in ('e', 'i', 'y'):
        return -1                                     # soft c
    if ch == 'g' and wl[1:2] in ('e', 'i', 'y') and wl not in HARD_G:
        return -1                                     # soft g
    return 0


levels, notyet = [], []
for L in sorted(int(k) for k in B['lp']):
    title, ch, kind = lesson_sound(L)
    p0, p1 = B['lp'][str(L)]
    if not ch:
        notyet.append({'lesson': L, 'title': title, 'why': 'not one sound (review / long vowels / final e)'})
        continue
    found = {}
    for r in B['rows']:
        wl = r['lemma'].lower()
        if r.get('lesson') == L and wl not in NAMES and wl not in FUNCTION and re.fullmatch(r'[a-z]+', wl) and carries(wl, ch, kind) >= 0:
            found.setdefault(wl, set()).add(r.get('page'))
    words, lacking = [], []
    gap = bool(notyet) and (not levels or notyet[-1]['lesson'] > levels[-1]['lesson'])
    for wl in sorted(found):
        voice = has_voice(wl)
        card = card_for(wl, dry=gap or not voice)           # no card file for a word the game can't say
        if not (card and voice):
            lacking.append({'w': wl, 'card': bool(card), 'voice': voice})
            continue
        v = W.get(wl, {})
        pages = sorted({p for k in ('printed', 'picture') for p in v.get(k, []) if p0 <= p <= p1} | {p for p in found[wl] if p})
        words.append({'w': wl, 'ko': GM.get(wl, ['', ''])[0], 'pages': pages, 'hl': carries(wl, ch, kind), 'hn': len(ch),
                      'card': f'assets/cards/{wl}.webp'})
    sound = 'q' if ch == 'qu' else ch
    why = None
    if len(words) < MIN_WORDS:
        why = f'{len(words)} playable words (a level needs {MIN_WORDS})'
    elif f'sound:{sound}' not in fpr:
        why = 'no official letter-sound recording'
    elif gap:
        why = 'an earlier lesson is not a level yet'
    if why:
        notyet.append({'lesson': L, 'title': title, 'why': why, 'words': [w['w'] for w in words], 'lacking': lacking})
        continue
    levels.append({'level': len(levels) + 1, 'lesson': L, 'unit': B['lu'][str(L)], 'title': title, 'letter': ch, 'kind': kind,
                   'sound': sound, 'pages': [p0, p1], 'words': words, 'lacking': lacking})

# Level 1 = the user's Lesson 1 list exactly (12 m-words; "my" is a printed-only function word)
L1 = ['man', 'map', 'meat', 'milk', 'mirror', 'mitt', 'monkey', 'moon', 'mop', 'mouse', 'mug', 'mushroom']
assert [w['w'] for w in levels[0]['words']] == L1, [w['w'] for w in levels[0]['words']]
used = {w['w'] for lv in levels for w in lv['words']}
for f in CARDS.glob('*.webp'):                              # cards no level uses (made by an earlier run)
    if f.stem not in used:
        f.unlink()
out = {
    'book': 'FPR K (From Phonics to Reading K)',
    'source': 'SAD·FPR 단어 연구 자료집 · b2_book_FPRK.json',
    'levels': [{k: v for k, v in lv.items() if k != 'lacking'} for lv in levels],
    'notYet': [{k: v for k, v in n.items() if k in ('lesson', 'title', 'why')} for n in notyet],
    'words': levels[0]['words'],          # Level 1 (kept for older tools)
}
js = ROOT / 'js' / 'words.js'
js.write_text('/* generated by tools/build_words.py — do not edit */\nwindow.CROCO_WORDS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n',
              encoding='utf-8')
mark = lambda x: f"{x['w']}({'카드' if not x['card'] else ''}{'·' if not x['card'] and not x['voice'] else ''}{'음성' if not x['voice'] else ''} 없음)"
for lv in levels:
    print(f"Level {lv['level']:2d} = Lesson {lv['lesson']:2d} (Unit {lv['unit']}) {lv['title']:8s} {len(lv['words']):2d} words: "
          + ' '.join(w['w'] for w in lv['words']) + (f"   — 빠짐: {' '.join(mark(x) for x in lv['lacking'])}" if lv['lacking'] else ''))
for n in notyet:
    print(f"  not yet: Lesson {n['lesson']:2d} {n['title']:20s} {n['why']}" + (f" | {' '.join(n.get('words', []))}" if n.get('words') else '')
          + (f" | 빠짐: {' '.join(mark(x) for x in n.get('lacking', []))}" if n.get('lacking') else ''))
print(len(levels), 'levels ·', len(list(CARDS.glob('*.webp'))), 'cards →', js.relative_to(ROOT))
