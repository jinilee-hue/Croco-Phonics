"""QA: the turn tag sits ON the active player (tail on the avatar's centre), both players, 4 sizes, EN and 한.
usage: uv run --with playwright --with pillow python tools/qa/qa_turn.py <outdir>
"""
import sys, time, pathlib
from PIL import Image
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:5211/index.html?shot&nohowto'
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
SIZES = [(1180, 820), (1024, 768), (1920, 1080), (820, 1180)]
MEASURE = """() => {
  const P = innerWidth < innerHeight, u = Math.min(innerHeight / 100, innerWidth * (P ? 0.0095 : 0.0062));
  const p = +document.querySelector('#app').dataset.turn, t = document.querySelector('#turn'), r = t.getBoundingClientRect();
  const a = document.querySelector(`.player.p${p + 1} .ava`).getBoundingClientRect();
  const tail = p ? r.right - 10.1 * u : r.left + 10.1 * u;
  const other = document.querySelector(`.player.p${2 - p}`);
  return { p, text: t.querySelector('.t').textContent, tailVsAvatar: Math.round(tail - (a.left + a.width / 2)),
    gapToAvatar: +((a.top - (r.bottom + 2.5 * u)) / u).toFixed(2), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0,
    tag: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], otherOpacity: getComputedStyle(other).opacity };
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(channel='chrome', headless=True, args=ARGS)
    errs, shots = [], []
    for lang in ('en', 'ko'):
        for W, H in SIZES:
            ctx = b.new_context(viewport={'width': W, 'height': H})
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
            pg.goto(BASE)
            pg.evaluate(f"localStorage.setItem('croco.lang.v1', '{lang}')")
            pg.goto(BASE)
            pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
            pg.evaluate("window.__test = {heard: true, target: 'moon', teeth: ['map','milk','moon','mouse','monkey','mug','mop','man','meat','mitt']}")
            pg.click('#start', force=True)
            pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
            time.sleep(0.9)
            m0 = pg.evaluate(MEASURE)
            f0 = out / f'{lang}_{W}x{H}_p1.png'
            pg.screenshot(path=str(f0))
            pg.evaluate('() => { __croco.onTooth(0); }')
            pg.wait_for_function("document.querySelector('#app').dataset.turn === '1' && document.querySelector('#turn').classList.contains('show')", timeout=25000)
            time.sleep(0.9)
            m1 = pg.evaluate(MEASURE)
            f1 = out / f'{lang}_{W}x{H}_p2.png'
            pg.screenshot(path=str(f1))
            print(lang, f'{W}x{H}', 'P1', m0, '\n         P2', m1)
            shots.append((f0, f1, W, H))
            ctx.close()
    # sheet: per language, P1 + P2 for each size
    for lang in ('en', 'ko'):
        row = [s for s in shots if s[0].name.startswith(lang)]
        Hh = 360
        ims = []
        for f0, f1, W, H in row:
            for f in (f0, f1):
                im = Image.open(f).convert('RGB')
                ims.append(im.resize((int(im.width * Hh / im.height), Hh)))
        s = Image.new('RGB', (sum(i.width for i in ims[:4]) + 30, Hh * 2 + 10), 'white')
        x = 0
        for k, im in enumerate(ims):
            if k == 4:
                x = 0
            s.paste(im, (x, 0 if k < 4 else Hh + 10)); x += im.width + 10
        s.save(out / f'turn_{lang}.png')
    print('errors', errs or 'none')
    b.close()
