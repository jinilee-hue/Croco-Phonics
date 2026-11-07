"""Headless screenshots of the croc model page (never the user's browser).
usage: uv run --with playwright python shot_croc.py <out_prefix> '<query1>' '<query2>' ...
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:5211/dev/croc.html'
out = pathlib.Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
qs = sys.argv[2:] or ['still']
W, H = 1280, 800
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    for k, q in enumerate(qs):
        pg.goto(f'{BASE}?{q}')
        try:
            pg.wait_for_function('window.__ready === true', timeout=60000)
        except Exception as e:
            print('NOT READY', e.__class__.__name__)
            for l in logs[:30]:
                print(l)
            sys.exit(1)
        time.sleep(0.6)
        f = f'{out}_{k}.png'
        pg.screenshot(path=f)
        print(f, pg.evaluate("document.getElementById('info').textContent"))
    for l in logs[:20]:
        print(l)
    b.close()
