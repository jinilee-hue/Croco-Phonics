"""Play Again + Home + title poke + keyboard: functional checks."""
import time, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1180, 'height': 820})
    errs = []
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
    pg.goto('http://127.0.0.1:5211/index.html?shot')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    pg.evaluate("window.__test = {heard: true}")
    # title poke: click the croc's head
    head = pg.evaluate("__croco.croc.mouthScreen()")
    pg.mouse.click(head['x'], head['y'])
    time.sleep(0.25)
    print('poke open', round(pg.evaluate('__croco.croc.state.open'), 2), '(expect < .3)')
    time.sleep(1.2)
    print('reopened', round(pg.evaluate('__croco.croc.state.open'), 2))
    pg.keyboard.press('Enter')
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    t1 = pg.evaluate('__croco.G.target')
    bad = pg.evaluate('__croco.G.teeth.indexOf(__croco.G.target)')
    key = str((bad + 1) % 10)
    pg.keyboard.press(key)        # keyboard: 1..8 → teeth 0..7
    pg.wait_for_function("__croco.G.screen === 'result'", timeout=20000)
    time.sleep(2.0)
    pg.click('#again', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    st = pg.evaluate('({t: __croco.G.target, got: __croco.G.got, pressed: [...__croco.G.pressed], screen: __croco.G.screen, turn: __croco.G.turn, open: __croco.croc.state.open, depth: __croco.croc.teeth.map(t => +t.depth.toFixed(2))})')
    print('round1 target', t1, '→ round2', json.dumps(st))
    pg.click('#btnHome', force=True)
    time.sleep(1.0)
    print('home → screen', pg.evaluate('__croco.G.screen'), 'data-screen', pg.evaluate('document.querySelector("#app").dataset.screen'), 'flyers', pg.evaluate("document.querySelectorAll('.flyer').length"))
    print('errors', errs[:5])
    b.close()
