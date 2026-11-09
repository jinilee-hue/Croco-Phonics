"""QA: the intro's letters and Exit.
usage: uv run --with playwright python tools/qa/qa_intro_letters.py <outdir>
  1  title at 1728x960, 1180x820, 820x1180: teeth = m a p s t … (one per tooth), 10 letters round the croc (orbit frozen
     at 3 moments → stills): front ones bigger than back ones, on screen; Exit shows next to the sound button
  2  ?level=5 title: still the mix (not all p); the explanation: every tooth the level's letter, orbit hidden
  3  START → game: teeth the level's letter, orbit hidden; Exit → the title (mix again, letters pop back)
  4  Exit on the title → back to the page before (history), no hello line
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:5211/index.html'
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
TEETH = "__croco.croc.teeth ? __croco.croc.teeth.map(t => t.decal.material.map.userData.ch).join('') : null"
ORB = """() => { const R = e => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom]; };
  const vis = [...document.querySelectorAll('.ol')].filter(e => e.style.visibility === 'visible');
  const lay = getComputedStyle(document.querySelector('.orbit-front')).opacity;
  return { n: vis.length, layerOpacity: lay, letters: vis.map(e => ({ ch: e.textContent, front: !!e.closest('.orbit-front'), r: R(e).map(Math.round),
    h: Math.round(R(e)[3] - R(e)[1]) })) }; }"""
SYS = """() => [...document.querySelectorAll('.sys > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className)"""
bad, errs = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)

    def page(W, H):
        pg = b.new_page(viewport={'width': W, 'height': H})
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text else None)
        return pg

    # ── 1. title at 3 sizes ──
    for W, H in ((1728, 960), (1180, 820), (820, 1180)):
        pg = page(W, H)
        pg.goto(BASE + '?shot&nohowto')
        pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
        time.sleep(1.2)
        teeth = pg.evaluate(TEETH)
        sysb = pg.evaluate(SYS)
        rows = []
        for k, t in enumerate((0, 6.5, 13)):
            pg.evaluate(f'window.ORBIT_T = {t}')
            time.sleep(0.25)
            o = pg.evaluate(ORB)
            pg.screenshot(path=str(out / f'title_{W}x{H}_t{k}.png'))
            fr = [x['h'] for x in o['letters'] if x['front']]
            bk = [x['h'] for x in o['letters'] if not x['front']]
            off = [x['ch'] for x in o['letters'] if x['r'][0] < -2 or x['r'][2] > W + 2 or x['r'][1] < -2 or x['r'][3] > H + 2]
            rows.append(f"t={t}: {o['n']} letters, front h {min(fr) if fr else '-'}–{max(fr) if fr else '-'} px, back h {min(bk) if bk else '-'}–{max(bk) if bk else '-'} px, off screen {off or 'none'}")
            if o['n'] != 10: bad.append(f'{W}x{H} t={t}: {o["n"]} letters')
            if off: bad.append(f'{W}x{H} t={t}: off screen {off}')
            if fr and bk and max(bk) >= max(fr): bad.append(f'{W}x{H} t={t}: back letters not smaller')
        print(f'1 {W}x{H} teeth {teeth} | sys {sysb}')
        for r in rows: print('   ', r)
        if teeth != 'finmapstcd': bad.append(f'{W}x{H} teeth {teeth}')
        if 'btnHome' not in sysb or sysb.index('btnHome') != sysb.index('btnSound') + 1: bad.append(f'{W}x{H} sys {sysb}')
        pg.close()

    # ── 2. level 5 title, then the explanation ──
    pg = page(1180, 820)
    pg.goto(BASE + '?shot&level=5')
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    t5 = pg.evaluate(TEETH)
    pg.wait_for_function("document.querySelector('#app').classList.contains('howto')", timeout=30000)
    time.sleep(1.0)
    th = pg.evaluate(TEETH)
    oh = pg.evaluate(ORB)
    pg.screenshot(path=str(out / 'howto_level5.png'))
    print(f'2 level 5: title teeth {t5} | explanation teeth {th}, orbit layer opacity {oh["layerOpacity"]}')
    if t5 != 'finmapstcd': bad.append(f'level 5 title teeth {t5}')
    if th != 'p' * 10: bad.append(f'explanation teeth {th}')
    if oh['layerOpacity'] != '0': bad.append('orbit shown in the explanation')
    pg.click('#skip', force=True)
    pg.wait_for_function('window.__intro === true', timeout=30000)
    time.sleep(1.5)
    ts = pg.evaluate(TEETH)
    print(f'  after SKIP: teeth {ts}, letters {pg.evaluate(ORB)["n"]}')
    if ts != 'finmapstcd': bad.append(f'after skip teeth {ts}')

    # ── 3. game → Exit → title ──
    pg.evaluate("window.__test = {heard: true}")
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=30000)
    tg, og = pg.evaluate(TEETH), pg.evaluate(ORB)
    pg.screenshot(path=str(out / 'game_level5.png'))
    print(f'3 game: teeth {tg}, orbit layer opacity {og["layerOpacity"]}, sys {pg.evaluate(SYS)}')
    if tg != 'p' * 10: bad.append(f'game teeth {tg}')
    if og['layerOpacity'] != '0': bad.append('orbit shown in the game')
    pg.click('#btnHome')
    pg.wait_for_function("document.querySelector('#app').dataset.screen === 'title' && window.__intro === true", timeout=30000)
    time.sleep(1.2)
    tt, ot = pg.evaluate(TEETH), pg.evaluate(ORB)
    print(f'  Exit → title: teeth {tt}, letters {ot["n"]}, url {pg.url.split("/")[-1]}')
    if tt != 'finmapstcd' or ot['n'] != 10: bad.append(f'exit to title: teeth {tt} letters {ot["n"]}')
    pg.close()

    # ── 4. Exit on the title: back to the page before ──
    pg = page(1180, 820)
    pg.goto('data:text/html,<title>before</title><p>before')
    pg.goto(BASE + '?shot&nohowto')
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    pg.evaluate("() => { window.__said = []; const S = window.Sound, o = S.say.bind(S); S.say = (k, x) => { window.__said.push(k); return o(k, x); }; }")
    said = []
    pg.on('framenavigated', lambda f: said.append(f.url[:40]) if f == pg.main_frame else None)
    pg.click('#btnHome')
    time.sleep(1.5)
    print(f'4 Exit on the title → {pg.title()!r} (navigations {said})')
    if pg.title() != 'before': bad.append(f'exit on title → {pg.title()}')
    pg.close()
    print('problems:', bad or 'none', '| errors:', errs[:6] or 'none')
    b.close()
