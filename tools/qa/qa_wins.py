"""QA: after CHOMP the trap word is read again (its sound, then the word, on the big card) before the result; each
player's wins level by level (chips beside the name plate), counted on the winner, kept across Play Again / Next Level.
usage: uv run --with playwright --with pillow python tools/qa/qa_wins.py <outdir>
  1  1180x820: level 1 round → the trap tooth: the voice order (uh-oh … s:m, w:<trap>, then the win line), the big card
     pulses its letter / word while they are said; the winner's 'Mm' chip 1, the other 0
  2  Play Again → the trap tooth again → the counts add up; Next Level → an 'Aa' chip (0 · 0) after 'Mm'; a win there
  3  three levels of chips at 1728x960, 1180x820, 820x1180: chips on screen, clear of the avatars, the piles' cards
     and the result buttons
"""
import sys, time, pathlib, json
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:5211/index.html?shot&nohowto'
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
SPY = """() => { window.__said = []; const S = window.Sound, o = S.say.bind(S);
  S.say = (k, opts) => { window.__said.push([S.voiceKey(k), Math.round(performance.now())]); return o(k, opts); };
  window.__pulse = []; new MutationObserver(ms => ms.forEach(m => { const c = m.target; if (c.classList && c.classList.contains('boom'))
    window.__pulse.push([c.classList.contains('say-m') ? 'say-m' : c.classList.contains('say-w') ? 'say-w' : '-', Math.round(performance.now())]); }))
    .observe(document.querySelector('#cards'), { subtree: true, attributes: true, attributeFilter: ['class'] }); }"""
CHIPS = """() => [...document.querySelectorAll('.player')].map(p => [...p.querySelectorAll('.wchip')].map(c => c.textContent + (c.classList.contains('cur') ? '*' : '')).join(' '))"""


def start(pg):
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    pg.evaluate("window.__test = {heard: true}")
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=30000)


def bite(pg):
    who = pg.evaluate("__croco.G.turn")
    pg.evaluate("() => { const G = __croco.G; __croco.onTooth(G.teeth.indexOf(G.target)); }")
    pg.wait_for_function("document.querySelector('#app').dataset.screen === 'result'", timeout=30000)
    time.sleep(2.4)
    return 1 - who                                         # the presser loses


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    errs, bad = [], []
    pg = b.new_page(viewport={'width': 1180, 'height': 820})
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text else None)
    pg.goto(BASE + '&target=monkey')
    start(pg)
    print('0 chips at the start:', pg.evaluate(CHIPS))
    pg.evaluate(SPY)
    t0 = pg.evaluate('performance.now()')
    w1 = bite(pg)
    said = [(k, round((t - t0) / 1000, 2)) for k, t in pg.evaluate('window.__said')]
    pulse = [(k, round((t - t0) / 1000, 2)) for k, t in pg.evaluate('window.__pulse')]
    keys = [k for k, _ in said]
    print('1 voice after the trap tooth:', said)
    print('  big card pulses:', pulse)
    i_s, i_w = keys.index('s:m') if 's:m' in keys else -1, keys.index('w:monkey') if 'w:monkey' in keys else -1
    i_win = max((keys.index(k) for k in ('t:win1', 't:win2') if k in keys), default=-1)
    if not (0 <= i_s < i_w < i_win):
        bad.append(f'voice order {keys}')
    if not any(k == 'say-m' for k, _ in pulse) or not any(k == 'say-w' for k, _ in pulse):
        bad.append('the big card did not pulse')
    c1 = pg.evaluate(CHIPS)
    print(f'  winner P{w1 + 1} → chips', c1)
    if c1[w1] != '1*' or c1[1 - w1] != '0*':                # crown + count only (no level label)
        bad.append(f'chips after round 1 {c1}')
    pg.screenshot(path=str(out / 'result1.png'))
    # ── 2. Play Again → another win; Next Level → Aa ──
    pg.click('#again', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=30000)
    w2 = bite(pg)
    c2 = pg.evaluate(CHIPS)
    exp = [0, 0]; exp[w1] += 1; exp[w2] += 1
    print(f'2 Play Again, winner P{w2 + 1} → chips', c2)
    if c2 != [f'{exp[0]}*', f'{exp[1]}*']:
        bad.append(f'chips after round 2 {c2} (expected {exp})')
    pg.click('#next', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=30000)
    c3 = pg.evaluate(CHIPS)
    print('  Next Level → chips', c3)
    if c3 != [f'{exp[0]} 0*', f'{exp[1]} 0*']:
        bad.append(f'chips at level 2 {c3}')
    w3 = bite(pg)
    c4 = pg.evaluate(CHIPS)
    print(f'  level 2 win P{w3 + 1} → chips', c4)
    pg.screenshot(path=str(out / 'result_level2.png'))
    pg.close()

    # ── 3. three levels of chips at three sizes: on screen, clear of avatars / pile cards / result buttons ──
    GEO = """() => { const R = e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; };
      const hit = (a, c) => a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;
      const chips = [...document.querySelectorAll('.wchip')].map(R), avas = [...document.querySelectorAll('.player .ava')].map(R);
      const cards = [...document.querySelectorAll('.stack .mini .card')].map(R);
      const btns = document.querySelector('#app').dataset.screen !== 'result' ? [] :            // hidden off the result screen
        [...document.querySelectorAll('.r-btns button')].filter(e => getComputedStyle(e).display !== 'none').map(R);
      const pile = [...document.querySelectorAll('.stack .count')].map(R);
      return { n: chips.length, off: chips.filter(c => c.l < 0 || c.t < 0 || c.r > innerWidth || c.b > innerHeight).length,
        onAva: chips.filter(c => avas.some(a => hit(c, a))).length, onCards: chips.filter(c => cards.some(a => hit(c, a))).length,
        onBtns: chips.filter(c => btns.some(a => hit(c, a))).length,
        btnsOnPiles: btns.filter(c => cards.concat(pile).some(a => hit(c, a))).length }; }"""
    for W, H in ((1728, 960), (1180, 820), (820, 1180)):
        pg = b.new_page(viewport={'width': W, 'height': H})
        pg.goto(BASE + '&level=3&target=sun')
        start(pg)
        pg.evaluate("() => { __croco.G.wins = {0: [2, 1], 1: [0, 3]}; __croco.setLevel(2); }")
        for i in (0, 1):                                    # a card or two in each pile
            pg.evaluate("() => { const G = __croco.G; __croco.onTooth(G.teeth.findIndex((w, k) => w !== G.target && !G.pressed.has(k))); }")
            pg.wait_for_function("document.querySelector('#turn').classList.contains('show') && !__croco.G.busy", timeout=40000)
        time.sleep(0.5)
        g1 = pg.evaluate(GEO)
        pg.screenshot(path=str(out / f'chips_game_{W}x{H}.png'))
        bite(pg)
        g2 = pg.evaluate(GEO)
        pg.screenshot(path=str(out / f'chips_result_{W}x{H}.png'))
        print(f'3 {W}x{H} game {g1} | result {g2} | chips {pg.evaluate(CHIPS)}')
        for g in (g1, g2):
            if g['off'] or g['onAva'] or g['onCards'] or g['onBtns'] or g['btnsOnPiles']:
                bad.append(f'{W}x{H} {g}')
        pg.close()
    print('problems:', bad or 'none', '| errors:', errs[:8] or 'none')
    b.close()
