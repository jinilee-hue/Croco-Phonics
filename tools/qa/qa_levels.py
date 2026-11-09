"""QA: levels (FPR K Lesson N = Level N) — every level's data in the game, the result screen's Play Again + Next Level,
the level-up banner, the new letter on the teeth, the last level.
usage: uv run --with playwright --with pillow python tools/qa/qa_levels.py <outdir>
  1  every level: on the title the teeth show the levels' letters (one per tooth; its own letter is checked in its
     round), its sound clip + every word's clip exist, every card picture loads; a round
     deals 10 teeth from its words with the trap word on exactly one; the trap card's pill letter and bold letter(s)
  2  1180x820 + 820x1180: level 1 → the trap tooth → result (Play Again + Next Level) → Next Level → banner → level 2's
     round (teeth 'a', level tag) → result → Play Again stays on level 2
  3  the last level's result has no Next Level
"""
import sys, time, pathlib, json
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:5211/index.html?shot&nohowto'
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
ROUND = """() => { const G = __croco.G, L = __croco.LEVELS[G.level], c = document.querySelector('#target .card');
  const words = L.words.map(w => w.w), cnt = G.teeth.filter(w => w === G.target).length;
  return { level: G.level + 1, letter: L.letter, teeth: G.teeth.length, allIn: G.teeth.every(w => words.includes(w)), trapOnce: cnt === 1,
    distinct: new Set(G.teeth).size, snd: !!(c && c.querySelector('.snd svg')), bold: c && c.querySelector('.word b').textContent,
    word: c && c.querySelector('.word').textContent, toothCh: [...new Set(__croco.croc.teeth.map(t => t.decal.material.map.userData.ch))],
    tag: document.querySelector('#lvTag').textContent }; }"""


def start(pg):
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    pg.evaluate("window.__test = {heard: true}")
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=30000)


def bite(pg):
    pg.evaluate("() => { const G = __croco.G; __croco.onTooth(G.teeth.indexOf(G.target)); }")
    pg.wait_for_function("document.querySelector('#app').dataset.screen === 'result'", timeout=30000)
    time.sleep(2.3)                                    # the buttons come in at 1.1 / 1.25 s


BTN = """() => { const v = s => { const e = document.querySelector(s), r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return cs.display !== 'none' && r.width > 0 ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), e.textContent.trim()] : null; };
  return { next: v('#next'), again: v('#again'), W: innerWidth, H: innerHeight }; }"""

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    errs = []

    def page(W, H, q=''):
        pg = b.new_page(viewport={'width': W, 'height': H})
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text else None)
        pg.goto(BASE + q)
        return pg

    # ── 1. every level ──
    pg = page(1180, 820)
    pg.wait_for_function('window.__ready === true', timeout=60000)
    n = pg.evaluate('__croco.LEVELS.length')
    bad = []
    for i in range(n):
        r = pg.evaluate("""async (i) => { __croco.setLevel(i); const L = __croco.LEVELS[i], A = window.Sound;
          const pics = await Promise.all(L.words.map(w => new Promise(res => { const im = new Image(); im.onload = () => res([w.w, im.naturalWidth]); im.onerror = () => res([w.w, 0]); im.src = w.card; })));
          return { lesson: L.lesson, title: L.title, letter: L.letter, n: L.words.length, sound: A.has('s:' + L.sound),
            noVoice: L.words.filter(w => !A.has('w:' + w.w)).map(w => w.w), noPic: pics.filter(x => !x[1]).map(x => x[0]),
            toothCh: [...new Set(__croco.croc.teeth.map(t => t.decal.material.map.userData.ch))], deco: [...document.querySelectorAll('.deco .l3d')].map(e => e.textContent).join(''),
            decoCards: [...document.querySelectorAll('.deco [data-word]')].map(e => e.dataset.word) }; }""", i)
        mix = sorted(pg.evaluate("[...new Set(__croco.LEVELS.map(L => L.letter))]"))
        ok = r['sound'] and not r['noVoice'] and not r['noPic'] and sorted(r['toothCh']) == mix   # the title's mix
        print(f"1 level {i + 1:2d} = Lesson {r['lesson']:2d} {r['title']:8s} {r['n']:2d} words · sound {r['sound']} · teeth {r['toothCh']} · deco {r['deco']} {r['decoCards']}"
              + ('' if ok else f"  ✗ noVoice {r['noVoice']} noPic {r['noPic']}"))
        if not ok:
            bad.append(i + 1)
    pg.close()
    for lv in (1, 2, 7, 10):
        pg = page(1180, 820, f'&level={lv}')
        start(pg)
        r = pg.evaluate(ROUND)
        pg.screenshot(path=str(out / f'round_L{lv}.png'))
        print(f'  round level {lv}:', json.dumps(r, ensure_ascii=False))
        if not (r['teeth'] == 10 and r['allIn'] and r['trapOnce'] and r['toothCh'] == [r['letter']]):
            bad.append(f'round {lv}')
        pg.close()

    # ── 2. result → Next Level → level 2 → Play Again stays ──
    for W, H in ((1180, 820), (820, 1180)):
        pg = page(W, H, '&level=1')
        start(pg)
        bite(pg)
        pg.screenshot(path=str(out / f'result_L1_{W}x{H}.png'))
        print(f'2 {W}x{H} result buttons', pg.evaluate(BTN))
        pg.click('#next', force=True)
        pg.wait_for_function("document.querySelector('#lvUp').classList.contains('show')", timeout=10000)
        time.sleep(0.9)
        pg.screenshot(path=str(out / f'levelup_{W}x{H}.png'))
        banner = pg.evaluate("document.querySelector('#lvUp').innerText.replace(/\\n+/g, ' | ')")
        pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=30000)
        time.sleep(0.6)
        r = pg.evaluate(ROUND)
        pg.screenshot(path=str(out / f'round_after_next_{W}x{H}.png'))
        print(f'  banner "{banner}" → round', json.dumps(r, ensure_ascii=False))
        if r['level'] != 2 or r['toothCh'] != ['a']:
            bad.append(f'next {W}x{H}')
        bite(pg)
        pg.click('#again', force=True)
        pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=30000)
        r2 = pg.evaluate(ROUND)
        print('  Play Again → level', r2['level'], 'teeth', r2['toothCh'])
        if r2['level'] != 2:
            bad.append(f'again {W}x{H}')
        pg.close()

    # ── 3. the last level: no Next Level ──
    pg = page(1180, 820, f'&level={n}')
    start(pg)
    bite(pg)
    pg.screenshot(path=str(out / f'result_last_L{n}.png'))
    r = pg.evaluate(BTN)
    print(f'3 last level {n} result buttons', r)
    if r['next'] is not None:
        bad.append('last level shows Next')
    pg.close()
    print('problems:', bad or 'none', '| errors:', errs[:8] or 'none')
    b.close()
