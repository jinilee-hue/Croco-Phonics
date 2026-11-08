"""print the model page's console (SDF clipping warnings) for a few views"""
import time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if 'favicon' not in m.text and '404' not in m.text else None)
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR {e}'))
    pg.goto('http://127.0.0.1:5211/dev/croc.html?still&el=12')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    time.sleep(0.3)
    print(pg.evaluate("document.getElementById('info').textContent"))
    print('\n'.join(logs) or 'console: clean')
    b.close()
