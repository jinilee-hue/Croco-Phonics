"""Headless QA of the whole game flow (never the user's browser).
usage: uv run --with playwright python qa_flow.py <outdir> [WxH] [mic: none|heard]
Takes stills: title, target intro, turn, safe reveal, say-it, docked, alarm, chomp, result.
"""
import sys, time, json, pathlib
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:5211/index.html?shot'
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
W, H = (int(v) for v in (sys.argv[2] if len(sys.argv) > 2 else '1280x800').split('x'))
mic = sys.argv[3] if len(sys.argv) > 3 else 'heard'
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(BASE)
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    test = {'mic': False} if mic == 'none' else {'heard': True}
    pg.evaluate(f'window.__test = {json.dumps(test)}')
    t0 = time.time()
    def shot(name):
        pg.screenshot(path=str(out / f'{name}.png'))
        print(f'{time.time() - t0:5.1f}s {name}')
    time.sleep(1.2); shot('01_title')
    pg.click('#start', force=True)
    time.sleep(1.6); shot('02_target_intro')
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    time.sleep(0.8); shot('03_turn')
    st = pg.evaluate('({teeth: __croco.G.teeth, target: __croco.G.target})')
    safe = next(i for i, w in enumerate(st['teeth']) if w != st['target'] and 1 <= i <= 6)
    bad = st['teeth'].index(st['target'])
    print('target', st['target'], 'safe tooth', safe, st['teeth'][safe], 'bad', bad)
    # tap the safe tooth by its screen position (real pointer path)
    pos = pg.evaluate(f'__croco.toothScreen({safe})')
    pg.mouse.move(pos['x'], pos['y']); time.sleep(0.3); shot('04_hover')
    pg.mouse.click(pos['x'], pos['y'])
    time.sleep(0.35); shot('05_press')
    time.sleep(1.0); shot('06_reveal')
    pg.wait_for_function("document.querySelector('#mic').classList.contains('listen')", timeout=15000)
    time.sleep(0.3); shot('07_sayit')
    pg.wait_for_function("document.querySelector('#turn .t').textContent.includes('2')", timeout=20000)
    time.sleep(0.9); shot('08_docked_turn2')
    pos = pg.evaluate(f'__croco.toothScreen({bad})')
    pg.mouse.click(pos['x'], pos['y'])
    time.sleep(1.1); shot('09_alarm')
    time.sleep(0.75); shot('10_chomp')
    time.sleep(2.2); shot('11_result')
    print('pressed', pg.evaluate('[...__croco.G.pressed]'), 'got', pg.evaluate('__croco.G.got'), 'screen', pg.evaluate('__croco.G.screen'))
    for l in logs[:25]:
        print(l)
    b.close()
