"""Deterministic frame strips of the card flights: pause the flyer's WAAPI animations and step their currentTime.
usage: uv run --with playwright --with pillow python tools/qa/qa_cards.py <outdir>
"""
import sys, json, pathlib
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
W, H = 1280, 800
TEST = {'heard': True, 'target': 'moon', 'teeth': ['map', 'milk', 'moon', 'mouse', 'monkey', 'mug', 'mop', 'man', 'meat', 'mitt']}
GRAB = """(ms) => {
  const fl = [...document.querySelectorAll('.flyer')].pop();
  // only this flight's animations (an earlier flight's finished, fill-forwards ones must keep their end state)
  if (ms === 0) window.__an = fl.getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().duration > 300);
  const an = window.__an;
  an.forEach(a => { a.pause(); a.currentTime = ms; });
  return an.length;
}"""
RESUME = "() => { const fl = [...document.querySelectorAll('.flyer')].pop(); fl.getAnimations({ subtree: true }).forEach(a => a.play()); }"


def steps(pg, tag, total, n, box):
    frames = []
    for k in range(n):
        t = round(total * k / (n - 1))
        cnt = pg.evaluate(GRAB, t)
        f = out / f'{tag}_{k:02d}.png'
        pg.screenshot(path=str(f), clip={'x': box[0], 'y': box[1], 'width': box[2] - box[0], 'height': box[3] - box[1]})
        frames.append((t, f))
    pg.evaluate(RESUME)
    cols = 5
    ims = [(t, Image.open(f).convert('RGB')) for t, f in frames]
    w, h = ims[0][1].size
    sc = min(1, 440 / w)
    tw, th = int(w * sc), int(h * sc)
    rows = (len(ims) + cols - 1) // cols
    s = Image.new('RGB', (cols * (tw + 4), rows * (th + 18)), 'white')
    d = ImageDraw.Draw(s)
    for i, (t, im) in enumerate(ims):
        x, y = (i % cols) * (tw + 4), (i // cols) * (th + 18)
        s.paste(im.resize((tw, th)), (x, y + 16)); d.text((x + 2, y + 2), f'{t} ms', fill='black')
    s.save(out / f'strip_{tag}.png')
    print(tag, 'animations paused:', cnt, '->', out / f'strip_{tag}.png')


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:5211/index.html?shot')
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    pg.evaluate(f'window.__test = {json.dumps(TEST)}')
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    pg.wait_for_timeout(600)
    pos = pg.evaluate('__croco.toothScreen(4)')
    pg.mouse.click(pos['x'], pos['y'])
    pg.wait_for_function("!!document.querySelector('.flyer')", polling=5, timeout=5000)
    steps(pg, 'reveal', 780, 10, (0, 120, 900, 720))
    pg.wait_for_function("!!document.querySelector('.flyer .card.good')", timeout=20000)
    pg.wait_for_function("!document.querySelector('.flyer .card.busy')", polling=5, timeout=20000)
    pg.wait_for_function("(() => { const f = document.querySelector('.flyer'); return f && f.getAnimations({subtree: true}).some(a => a.playState === 'running'); })()", polling=5, timeout=5000)
    steps(pg, 'dock', 680, 10, (0, 0, 640, 520))
    pg.wait_for_function("document.querySelector('#turn .t').textContent.includes('2')", timeout=20000)
    pg.wait_for_timeout(700)
    pos = pg.evaluate('__croco.toothScreen(2)')
    pg.mouse.click(pos['x'], pos['y'])
    pg.wait_for_function("!!document.querySelector('.flyer .card.boom')", polling=5, timeout=8000)
    steps(pg, 'bite', 820, 10, (240, 100, 1040, 760))
    pg.wait_for_function("document.querySelector('#app').dataset.screen === 'result'", timeout=20000)
    pg.wait_for_timeout(2200)
    pg.screenshot(path=str(out / 'result.png'))
    print('errors', errs[:8])
    b.close()
