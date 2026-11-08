"""QA: the intro (entrance motion + the croc's explanation on the title), EN | 한, Skip, first-time-only, the bottom-corner
players / top bar, the mic on the croc's lower jaw, and long words inside the cards.
usage: uv run --with playwright --with pillow python tools/qa/qa_tutor.py <outdir> [WxH ...]   (default 1180x820)
  0  the entrance after loading: frames 0–2 s (logo drops, croc grows in, cards dealt, START pops)
  1  START (first time) at each size: the explanation on the intro screen, a frame per line; the bubble must stay on
     screen and off cards / avatars / logo / buttons; it ends in the game (turn pill) with the explanation's trap word
  2  the visit rule (Magic Block): a fresh visit's first START explains; Home → START in the same visit doesn't
  3  한 + Skip: Korean bubbles; switching EN | 한 mid-line re-says the line; Skip → game, nothing left over
  4  the say-it mic sits on the croc's lower jaw (no-mic countdown), players at the bottom, top bar
  5  every word on every kind of card: text width / inside width (must stay under .9: room for the say-it glow)
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
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none') return false; } return true; };
  const sel = '.player .ava, .sys, #skip, #target .card, #cards .flyer .card, ' + (__croco.G.screen === 'title' ? '.title .logo' : '.glogo');
  const hits = show ? [...document.querySelectorAll(sel)].filter(el => {
    const a = el.getBoundingClientRect();
    return a.width > 0 && vis(el) && br.left < a.right && br.right > a.left && br.top < a.bottom && br.bottom > a.top;
  }).map(el => (el.id || el.className || el.tagName).toString().slice(0, 30)) : [];
  return { txt: b.querySelector('p').textContent, show, hits, tail: b.dataset.tail, screen: __croco.G.screen,
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


def run_tutorial(pg, tag, W, H, limit=95):
    frames, seen, bad, t0 = [], set(), [], time.time()
    while time.time() - t0 < limit:
        st = pg.evaluate(STATE)
        key = (st['txt'], st['show'], st['demo'], st['alarm'], st['turn'], st['screen'])
        if key not in seen and (st['show'] or st['turn'] or st['demo']):
            seen.add(key)
            time.sleep(0.45)
            st = pg.evaluate(STATE)
            f = out / f'{tag}_{len(frames):02d}.png'
            pg.screenshot(path=str(f))
            frames.append((f"{round(time.time() - t0, 1)}s {st['screen'][:1]} {st['tail'] if st['show'] else ''} {st['txt'] if st['show'] else ('TURN' if st['turn'] else '')}", f))
            if st['show'] and (st['hits'] or not st['inView']):
                bad.append((st['txt'], st['hits'], 'in view' if st['inView'] else 'OFF SCREEN'))
        if st['turn']:
            break
        time.sleep(0.1)
    sheet(frames, f'{tag}.png', W, H)
    return frames, bad, round(time.time() - t0, 1)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    errs = []

    def page(W, H):
        ctx = b.new_context(viewport={'width': W, 'height': H})
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text else None)
        return ctx, pg

    for n, (W, H) in enumerate(SIZES):
        ctx, pg = page(W, H)
        pg.goto(BASE + '?shot')
        pg.wait_for_function('window.__ready === true', timeout=60000)
        if n == 0:
            # ── 0. the entrance motion right after loading ──
            fr, t0 = [], time.time()
            for k in range(9):
                f = out / f'enter_{k}.png'
                pg.screenshot(path=str(f))
                fr.append((f'{round(time.time() - t0, 2)}s', f))
                time.sleep(0.22)
            sheet(fr, 'enter.png', W, H, cols=3)
        pg.wait_for_function('window.__intro === true', timeout=15000)
        # ── 1. START → the explanation on the intro screen → the game ──
        pg.evaluate("window.__test = {howto: true, heard: true}")
        pg.click('#start', force=True)
        frames, bad, secs = run_tutorial(pg, f'tut_{W}x{H}', W, H)
        flag = pg.evaluate("__croco.howtoSeen()")
        after = pg.evaluate("({screen: __croco.G.screen, target: __croco.G.target, howto: document.querySelector('#app').classList.contains('howto'), skip: document.querySelector('#skip').classList.contains('show'), bubble: document.querySelector('#bubble').classList.contains('show'), glow: __croco.croc.teeth.some(t => t.glow > 0), flyers: document.querySelectorAll('.flyer').length})")
        print(f'1 {W}x{H}: {secs} s, frames {len(frames)}, flag {flag}, after {after}')
        print('  bubble problems:', bad or 'none')
        if n == 0:
            # ── 2. the visit rule: Home → START in the same visit goes straight to the game ──
            pg.evaluate("delete window.__test")
            pg.click('#btnHome')
            pg.wait_for_function('window.__intro === true', timeout=15000)
            pg.click('#start', force=True)
            time.sleep(0.6)
            s2 = pg.evaluate("({screen: __croco.G.screen, howto: document.querySelector('#app').classList.contains('howto')})")
            # … and a fresh visit (reload, no test hooks) explains again
            pg.goto(BASE)
            pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
            pg.click('#start', force=True)
            time.sleep(1.2)
            s2b = pg.evaluate("({screen: __croco.G.screen, howto: document.querySelector('#app').classList.contains('howto'), skip: document.querySelector('#skip').classList.contains('show')})")
            print('2 same visit, Home → START:', s2, '| new visit START:', s2b)
        ctx.close()

    W, H = SIZES[0]
    # ── 3. 한: Korean bubbles, EN|한 mid-line, Skip ──
    ctx, pg = page(W, H)
    pg.goto(BASE + '?shot')
    pg.evaluate("localStorage.setItem('croco.lang.v1', 'ko')")
    pg.goto(BASE + '?shot')
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    pg.screenshot(path=str(out / 'ko_0_title.png'))
    pg.evaluate("window.__test = {howto: true, heard: true}")
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#bubble').classList.contains('show')", timeout=10000)
    time.sleep(0.5)
    t1 = pg.evaluate("document.querySelector('#bubble p').textContent")
    pg.screenshot(path=str(out / 'ko_1_hello.png'))
    pg.click('#btnLang')
    time.sleep(0.5)
    t2 = pg.evaluate("document.querySelector('#bubble p').textContent")
    pg.screenshot(path=str(out / 'ko_2_switched_en.png'))
    pg.click('#btnLang')
    time.sleep(0.4)
    t3 = pg.evaluate("document.querySelector('#bubble p').textContent")
    stored = pg.evaluate("localStorage.getItem('croco.lang.v1')")
    print(f'3 lang: ko "{t1}" → en "{t2}" → ko "{t3}", stored {stored}')
    pg.wait_for_function("document.querySelector('#target').classList.contains('side')", timeout=40000)
    time.sleep(1.2)
    pg.screenshot(path=str(out / 'ko_3_before_skip.png'))
    pg.click('#skip')
    t0 = time.time()
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    time.sleep(0.8)
    pg.screenshot(path=str(out / 'ko_4_after_skip.png'))
    s3 = pg.evaluate("({seen: __croco.howtoSeen(), screen: __croco.G.screen, flyers: document.querySelectorAll('.flyer').length, bubble: document.querySelector('#bubble').classList.contains('show'), skip: document.querySelector('#skip').classList.contains('show'), howto: document.querySelector('#app').classList.contains('howto'), turnText: document.querySelector('#turn .t').textContent, names: [...document.querySelectorAll('.player .name')].map(e => e.textContent)})")
    print(f'  skip: turn after {round(time.time() - t0, 1)} s, {s3}')
    ctx.close()

    # ── 4. the mic on the croc's lower jaw (no mic → countdown), players at the bottom ──
    for W, H in SIZES:
        ctx, pg = page(W, H)
        pg.goto(BASE + '?shot')
        pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
        pg.evaluate("window.__test = {mic: false, target: 'moon', teeth: ['map','milk','moon','mouse','monkey','mug','mop','man','meat','mitt']}")
        pg.click('#start', force=True)
        pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
        time.sleep(0.8)
        pg.screenshot(path=str(out / f'mic_{W}x{H}_0turn.png'))
        pg.evaluate('() => { __croco.onTooth(0); }')
        pg.wait_for_function("document.querySelector('#mic').classList.contains('nomic')", timeout=20000)
        time.sleep(0.8)
        pg.screenshot(path=str(out / f'mic_{W}x{H}_1mic.png'))
        g = pg.evaluate("""() => { const m = document.querySelector('#mic').getBoundingClientRect(), j = __croco.croc.jawScreen();
          return { mic: [Math.round(m.left + m.width / 2), Math.round(m.top + m.height / 2), Math.round(m.width)], jaw: [Math.round(j.x), Math.round(j.y)], W: innerWidth }; }""")
        print(f'4 {W}x{H} mic', g)
        ctx.close()

    # ── 5. long words ──
    W, H = SIZES[0]
    ctx, pg = page(W, H)
    pg.goto(BASE + '?shot')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    time.sleep(0.6)
    res = pg.evaluate("""() => {
      const out = [];
      const u = Math.min(innerHeight / 100, innerWidth * 0.0062);
      const kinds = [['reveal', 34, {}], ['bite', 40, { cls: 'boom' }], ['target', 30, { cls: 'tgt', sound: true }], ['pile', 10, {}]];
      const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;display:flex;flex-wrap:wrap;gap:6px;z-index:99;background:#cfe7ee';
      document.body.appendChild(box);
      for (const [k, cw, o] of kinds) for (const w of window.CROCO_WORDS.words.map(x => x.w)) {
        const c = __croco.makeCard(w, o); c.style.setProperty('--cw', cw * u * (k === 'pile' ? 1 : 0.42) + 'px'); box.appendChild(c);
        const r = document.createRange(); r.selectNodeContents(c.querySelector('.word'));
        const cs = getComputedStyle(c), inner = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        out.push([w, k, +(r.getBoundingClientRect().width / inner).toFixed(3)]);
      }
      return out;
    }""")
    print('5 words: widest', sorted(res, key=lambda r: -r[2])[:3], '| over .9:', [r for r in res if r[2] > 0.9])
    ctx.close()
    print('errors', errs[:8] or 'none')
    b.close()
