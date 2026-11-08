"""file:// check: the page opened straight from disk must run the whole loop (fonts, voice from base64, 3D)."""
import time, json
from playwright.sync_api import sync_playwright
URL = 'file:///Users/jini/Documents/Jini/2026/Phonics/Croco-Phonics/index.html?shot'
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1180, 'height': 820})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    pg.goto(URL)
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    pg.evaluate("window.__test = {heard: true, target: 'map', teeth: ['milk','map','moon','mouse','monkey','mug','mop','man']}")
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    font = pg.evaluate("document.fonts.check('700 40px \"Baloo 2\"')")
    voice = pg.evaluate("Object.keys(Sound.buffers).length")
    ctx = pg.evaluate("Sound.ctx && Sound.ctx.state")
    pg.evaluate("() => { __croco.onTooth(0); }")
    pg.wait_for_function("__croco.G.got[0].length === 1", timeout=25000)
    pg.wait_for_function("document.querySelector('#app').dataset.turn === '1' && document.querySelector('#turn').classList.contains('show')", timeout=20000)
    pg.evaluate("() => { __croco.onTooth(1); }")
    pg.wait_for_function("__croco.G.screen === 'result'", timeout=20000)
    time.sleep(1.5)
    pg.screenshot(path='shots/file_result.png')
    print('font', font, 'voice buffers', voice, 'audio', ctx, 'result', pg.evaluate("document.querySelector('#rbText').textContent"))
    print('errors/warnings:', errs[:8])
    b.close()
