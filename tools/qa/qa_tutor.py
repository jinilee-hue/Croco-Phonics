"""QA: the croc tutor's explanation (first game only), Skip, and long words inside the cards.
usage: uv run --with playwright --with pillow python tools/qa/qa_tutor.py <outdir> [WxH ...]   (default 1180x820)
  1  the whole explanation at each size: a frame per line, the bubble must stay on screen and off cards/avatars/buttons
  2  a second game on the same device: no explanation
  3  Skip while the demo card is out: the first turn starts, nothing is left over, a tooth press works
  4  every word on every kind of card: text width / inside width (must stay under .9: room for the say-it glow)
"""
import sys, time, pathlib
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
SIZES = [tuple(map(int, s.split('x'))) for s in (sys.argv[2:] or ['1180x820'])]
BASE = 'http://127.0.0.1:5211/index.html'
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
STATE = """() => {
  const b = document.querySelector('#bubble'), br = b.getBoundingClientRect(), show = b.classList.contains('show');
  const hits = show ? [...document.querySelectorAll('.player .ava, .sys, #skip, #target .card, #cards .flyer .card')].filter(el => {
    const a = el.getBoundingClientRect();
    return a.width > 0 && getComputedStyle(el.closest('#skip') || el).opacity !== '0' && br.left < a.right && br.right > a.left && br.top < a.bottom && br.bottom > a.top;
  }).map(el => el.id || el.closest('[id]').id + ' ' + el.className) : [];
  return { txt: b.querySelector('p').textContent, show, hits, tail: b.dataset.tail,
    inView: br.left >= 0 && br.top >= 0 && br.right <= innerWidth && br.bottom <= innerHeight,
    skip: document.querySelector('#skip').classList.contains('show'), turn: document.querySelector('#turn').classList.contains('show'),
    demo: !!document.querySelector('.flyer.demo'), alarm: document.querySelector('#target').classList.contains('alarm') };
}"""


def sheet(frames, name, W, H, cols=4):
    k = 0.4 if W > H else 0.3
    ims = [(l, Image.open(f).convert('RGB').resize((int(W * k), int(H * k)))) for l, f in frames]
    tw, th = ims[0][1].size
    rows = (len(ims) + cols - 1) // cols
    s = Image.new('RGB', (cols * (tw + 4), rows * (th + 20)), 'white')
    d = ImageDraw.Draw(s)
    for i, (l, im) in enumerate(ims):
        x, y = (i % cols) * (tw + 4), (i // cols) * (th + 20)
        s.paste(im, (x, y + 18)); d.text((x + 2, y + 3), l[:64], fill='black')
    s.save(out / name)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    errs = []

    def page(W, H):
        ctx = b.new_context(viewport={'width': W, 'height': H})
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text else None)
        return ctx, pg

    # ── 1. the whole explanation, first time, at each size ──
    for W, H in SIZES:
        ctx, pg = page(W, H)
        pg.goto(BASE + '?shot')
        pg.wait_for_function('window.__ready === true', timeout=60000)
        pg.evaluate("window.__test = {howto: true, heard: true}")
        pg.click('#start', force=True)
        frames, seen, bad, t0 = [], set(), [], time.time()
        while time.time() - t0 < 90:
            st = pg.evaluate(STATE)
            key = (st['txt'], st['show'], st['demo'], st['alarm'], st['turn'])
            if key not in seen and (st['show'] or st['turn'] or st['demo']):
                seen.add(key)
                time.sleep(0.45)
                st = pg.evaluate(STATE)
                f = out / f'tut_{W}x{H}_{len(frames):02d}.png'
                pg.screenshot(path=str(f))
                frames.append((f"{round(time.time() - t0, 1)}s {st['tail'] if st['show'] else ''} {st['txt'] if st['show'] else ('TURN' if st['turn'] else '')}", f))
                if st['show'] and (st['hits'] or not st['inView']):
                    bad.append((st['txt'], st['hits'], 'in view' if st['inView'] else 'OFF SCREEN'))
            if st['turn']:
                break
            time.sleep(0.1)
        flag = pg.evaluate("localStorage.getItem('croco.howto.v1')")
        after = pg.evaluate("({skip: document.querySelector('#skip').classList.contains('show'), bubble: document.querySelector('#bubble').classList.contains('show'), busy: __croco.G.busy, glow: __croco.croc.teeth.some(t => t.glow > 0), pressed: __croco.croc.teeth.some(t => t.pressed), demo: document.querySelectorAll('.flyer').length})")
        print(f'1 full {W}x{H}: {round(time.time() - t0, 1)} s, frames {len(frames)}, flag {flag}, after {after}')
        print('  bubble problems:', bad or 'none')
        sheet(frames, f'tutor_{W}x{H}.png', W, H)

        if (W, H) == SIZES[0]:
            # ── 2. second game on the same device: no explanation ──
            pg.goto(BASE)                                            # no __test: the real first-time logic
            pg.wait_for_function('window.__ready === true', timeout=60000)
            pg.click('#start', force=True)
            t0, sawSkip = time.time(), False
            while time.time() - t0 < 20:
                s2 = pg.evaluate("({skip: document.querySelector('#skip').classList.contains('show'), turn: document.querySelector('#turn').classList.contains('show')})")
                sawSkip |= s2['skip']
                if s2['turn']:
                    break
                time.sleep(0.15)
            print(f'2 second game: explanation shown {sawSkip}, turn after {round(time.time() - t0, 1)} s')
        ctx.close()

    # ── 3. Skip in the middle ──
    W, H = SIZES[0]
    ctx, pg = page(W, H)
    pg.goto(BASE + '?shot')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    pg.evaluate("window.__test = {howto: true, heard: true}")
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#skip').classList.contains('show')", timeout=10000)
    time.sleep(1.6)
    pg.screenshot(path=str(out / 'skip_0_start.png'))
    pg.wait_for_function("!!document.querySelector('.flyer.demo')", timeout=60000)       # skip while the demo card is out
    time.sleep(0.9)
    pg.screenshot(path=str(out / 'skip_1_before.png'))
    pg.click('#skip')
    t0 = time.time()
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=10000)
    time.sleep(0.8)
    pg.screenshot(path=str(out / 'skip_2_after.png'))
    s3 = pg.evaluate("({flag: localStorage.getItem('croco.howto.v1'), flyers: document.querySelectorAll('.flyer').length, bubble: document.querySelector('#bubble').classList.contains('show'), skip: document.querySelector('#skip').classList.contains('show'), pressed: __croco.croc.teeth.some(t => t.pressed), glow: __croco.croc.teeth.some(t => t.glow > 0), target: document.querySelector('#target').className, on: [...document.querySelectorAll('.player.on')].map(e => e.dataset.p)})")
    print(f'3 skip: turn after {round(time.time() - t0, 1)} s, state {s3}')
    time.sleep(1.0)
    pos = pg.evaluate('__croco.toothScreen(4)')
    pg.mouse.click(pos['x'], pos['y'])
    try:
        pg.wait_for_function("!!document.querySelector('.flyer .card')", timeout=8000)
        print('  tooth press after skip: card out')
    except Exception as e:
        print('  tooth press after skip: NO CARD', str(e)[:80])
    ctx.close()

    # ── 4. long words: every word on every kind of card ──
    ctx, pg = page(W, H)
    pg.goto(BASE + '?shot')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    pg.evaluate("document.fonts.ready.then(() => 1)")
    time.sleep(0.6)
    res = pg.evaluate("""() => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:0;top:0;display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px;z-index:99;background:#cfe7ee;padding:6px;width:100vw';
      document.body.appendChild(box);
      const u = Math.min(innerHeight / 100, innerWidth * 0.0062), out = [];
      const kinds = [['reveal', 34, {}], ['bite', 40, { cls: 'boom' }], ['target', 30, { cls: 'tgt', sound: true }], ['pile', 10, {}]];
      for (const [k, cw, o] of kinds) for (const w of window.CROCO_WORDS.words.map(x => x.w)) {
        const c = __croco.makeCard(w, o);
        c.style.setProperty('--cw', cw * u * (k === 'pile' ? 1 : 0.42) + 'px');
        box.appendChild(c);
        const wd = c.querySelector('.word'), r = document.createRange();
        r.selectNodeContents(wd);
        const tw = r.getBoundingClientRect().width, cs = getComputedStyle(c);
        const inner = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        out.push([w, k, +(tw / inner).toFixed(3)]);
      }
      return out;
    }""")
    worst = sorted(res, key=lambda r: -r[2])[:6]
    print('4 words: widest text/inside', worst, '| over .9:', [r for r in res if r[2] > 0.9])
    pg.screenshot(path=str(out / 'words.png'))
    ctx.close()
    print('errors', errs[:8] or 'none')
    b.close()
