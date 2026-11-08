"""QA across screen sizes + paths: title / turn / reveal(no mic countdown) / idle hint / result.
usage: uv run --with playwright python qa_sizes.py <outdir> [base_url]
"""
import sys, time, json, pathlib
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:5211/index.html?shot'
SIZES = [(1024, 768), (1180, 820), (1920, 1080), (820, 1180)]
TEST = {'mic': False, 'target': 'moon', 'teeth': ['map', 'milk', 'moon', 'mouse', 'monkey', 'mug', 'mop', 'man', 'meat', 'mitt']}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    for (W, H) in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
        pg.goto(BASE)
        pg.wait_for_function('window.__ready === true', timeout=60000)
        pg.evaluate(f'window.__test = {json.dumps(TEST)}')
        time.sleep(1.2)
        tag = f'{W}x{H}'
        pg.screenshot(path=str(out / f'{tag}_1title.png'))
        pg.click('#start', force=True)
        pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
        time.sleep(0.8)
        pg.screenshot(path=str(out / f'{tag}_2turn.png'))
        if (W, H) == (1180, 820):
            time.sleep(5.6)
            pg.screenshot(path=str(out / f'{tag}_2b_idlehint.png'))
        # safe tooth 4 (monkey) → reveal → no-mic countdown
        print(tag, 'turn ok; busy', pg.evaluate('__croco.G.busy'), 'teeth', pg.evaluate('__croco.G.teeth'), flush=True)
        pg.evaluate('() => { __croco.onTooth(4); }')
        print(tag, 'after tooth: flyers', pg.evaluate("document.querySelectorAll('.flyer').length"), 'cls', pg.evaluate("(document.querySelector('.flyer .card')||{}).className"), flush=True)
        pg.wait_for_function("!!document.querySelector('.flyer .card.nomic')", timeout=20000)
        time.sleep(0.9)
        pg.screenshot(path=str(out / f'{tag}_3nomic.png'))
        pg.wait_for_function("document.querySelector('#turn .t').textContent.includes('2')", timeout=20000)
        time.sleep(0.6)
        pg.evaluate('() => { __croco.onTooth(2); }')   # moon = target
        time.sleep(4.6)
        pg.screenshot(path=str(out / f'{tag}_4result.png'))
        print(tag, 'screen', pg.evaluate('__croco.G.screen'), 'got', pg.evaluate('__croco.G.got'), 'errors', errs[:5])
        pg.close()
    b.close()
