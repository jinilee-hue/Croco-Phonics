"""QA: the intro like Magic Block's (the page opens on the title with START; a moment later the croc explains with SKIP
instead of START; then the title with START again; START = game), EN | 한, the bottom-corner players / top bar, the mic
on the croc's lower jaw, long words.
usage: uv run --with playwright --with pillow python tools/qa/qa_tutor.py <outdir> [WxH ...]   (default 1180x820)
  0  the page opens: frames 0–6 s (the title's entrance with START up, then START gives way to SKIP as the croc explains)
  1  each size: the explanation, a frame per line; the bubble must stay on screen and off cards / avatars / logo /
     buttons; it ends on the TITLE with START (nothing left over); START → the game with its trap word
  2  Home → the title with START at once (no explanation) → START = game; a reload explains again; START pressed in
     the first moment (before the explanation) → the game at once, no explanation later
  3  한 + SKIP: Korean bubbles; switching EN | 한 mid-line re-says the line; SKIP → the title with START, then the game
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
    on: __croco.T.on, intro: window.__intro === true,
    start: +getComputedStyle(document.querySelector('#start')).opacity, logo: +getComputedStyle(document.querySelector('.title .logo')).opacity,
    skip: document.querySelector('#skip').classList.contains('show'), turn: document.querySelector('#turn').classList.contains('show'),
    demo: !!document.querySelector('.flyer.demo'), alarm: document.querySelector('#target').classList.contains('alarm') };
}"""
AFTER = """() => ({ screen: __croco.G.screen, on: __croco.T.on, seen: __croco.howtoSeen(), nextTarget: __croco.G.nextTarget,
  howto: document.querySelector('#app').classList.contains('howto'), skip: document.querySelector('#skip').classList.contains('show'),
  bubble: document.querySelector('#bubble').classList.contains('show'), glow: __croco.croc.teeth.some(t => t.glow > 0),
  flyers: document.querySelectorAll('.flyer').length, hud: +getComputedStyle(document.querySelector('.hud')).opacity,
  start: +getComputedStyle(document.querySelector('#start')).opacity, logo: +getComputedStyle(document.querySelector('.title .logo')).opacity })"""


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
    """a frame per line until the explanation is over and START is up on the title"""
    frames, seen, bad, t0 = [], set(), [], time.time()
    while time.time() - t0 < limit:
        st = pg.evaluate(STATE)
        key = (st['txt'], st['show'], st['demo'], st['alarm'], st['screen'])
        if key not in seen and (st['show'] or st['demo']):
            seen.add(key)
            time.sleep(0.45)
            st = pg.evaluate(STATE)
            f = out / f'{tag}_{len(frames):02d}.png'
            pg.screenshot(path=str(f))
            frames.append((f"{round(time.time() - t0, 1)}s {st['tail'] if st['show'] else ''} {st['txt'] if st['show'] else ''} start {st['start']:.1f}", f))
            if st['show'] and (st['hits'] or not st['inView']):
                bad.append((st['txt'], st['hits'], 'in view' if st['inView'] else 'OFF SCREEN'))
            if st['start'] > 0.05 or not st['skip']:
                bad.append((st['txt'], f"START opacity {st['start']} / SKIP shown {st['skip']} during the explanation"))
        if not st['on'] and st['intro']:
            break
        time.sleep(0.1)
    f = out / f'{tag}_{len(frames):02d}_title.png'
    pg.screenshot(path=str(f))
    frames.append((f"{round(time.time() - t0, 1)}s → title, START {pg.evaluate(STATE)['start']:.1f}", f))
    sheet(frames, f'{tag}.png', W, H)
    return frames, bad, round(time.time() - t0, 1)


def start_game(pg):
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    return pg.evaluate("({screen: __croco.G.screen, target: __croco.G.target})")


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
        pg.goto(BASE + '?shot&target=map')
        pg.wait_for_function('window.__ready === true', timeout=60000)
        if n == 0:
            # ── 0. the page opens on the title (START up), then START gives way to SKIP as the croc explains ──
            fr, t0, st0 = [], time.time(), []
            for k in range(12):
                f = out / f'open_{k:02d}.png'
                pg.screenshot(path=str(f))
                st = pg.evaluate(STATE)
                st0.append((round(time.time() - t0, 1), round(st['start'], 2), round(st['logo'], 2), st['skip'], st['show']))
                fr.append((f"{round(time.time() - t0, 2)}s start {st['start']:.1f} skip {st['skip']}", f))
                time.sleep(0.42)
            sheet(fr, 'open.png', W, H, cols=4)
            print('0 open (t, START opacity, logo opacity, SKIP, bubble):', st0)
        pg.wait_for_function('__croco.T.on === true', timeout=15000)
        # ── 1. the explanation from the page load → the title with START → START = game ──
        frames, bad, secs = run_tutorial(pg, f'tut_{W}x{H}', W, H)
        time.sleep(0.3)
        after = pg.evaluate(AFTER)
        print(f'1 {W}x{H}: {secs} s, frames {len(frames)}, after {after}')
        print('  problems:', bad or 'none')
        g = start_game(pg)
        print('  START →', g)
        if n == 0:
            # ── 2. Home → the title with START at once; a reload explains again ──
            pg.click('#btnHome')
            time.sleep(0.4)
            h = pg.evaluate(AFTER)
            pg.wait_for_function('window.__intro === true', timeout=15000)
            h2 = pg.evaluate(AFTER)
            g2 = start_game(pg)
            pg.goto(BASE + '?shot')
            pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
            r0 = pg.evaluate(AFTER)
            pg.wait_for_function("document.querySelector('#bubble').classList.contains('show')", timeout=15000)
            r = pg.evaluate(AFTER)
            print('2 Home: on', h['on'], 'skip', h['skip'], '→ START up', h2['start'], '| START →', g2['screen'],
                  '| reload: title first START', r0['start'], 'on', r0['on'], '→ explaining', r['on'], 'skip', r['skip'], 'START', r['start'])
            # START in the first moment, before the explanation began: the game at once, and no explanation later
            pg.goto(BASE + '?shot')
            pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
            g4 = start_game(pg)
            time.sleep(2.5)
            q = pg.evaluate(AFTER)
            print('  early START →', g4['screen'], '| 2.5 s later: on', q['on'], 'howto', q['howto'], 'skip', q['skip'], 'screen', q['screen'])
        ctx.close()

    W, H = SIZES[0]
    # ── 3. 한: Korean bubbles, EN|한 mid-line, SKIP → the title with START ──
    ctx, pg = page(W, H)
    pg.goto(BASE + '?shot&nohowto')
    pg.evaluate("localStorage.setItem('croco.lang.v1', 'ko')")
    pg.goto(BASE + '?shot&target=mitt')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    pg.wait_for_function("document.querySelector('#bubble').classList.contains('show')", timeout=15000)
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
    pg.wait_for_function("!!document.querySelector('.flyer.demo')", timeout=60000)
    time.sleep(1.2)
    pg.screenshot(path=str(out / 'ko_3_before_skip.png'))
    pg.click('#skip')
    t0 = time.time()
    pg.wait_for_function('window.__intro === true', timeout=20000)
    pg.screenshot(path=str(out / 'ko_4_after_skip.png'))
    s3 = pg.evaluate(AFTER)
    print(f'  skip: START up after {round(time.time() - t0, 1)} s, {s3}')
    g3 = start_game(pg)
    time.sleep(0.6)
    pg.screenshot(path=str(out / 'ko_5_game.png'))
    print('  START →', g3, pg.evaluate("({turnText: document.querySelector('#turn .t').textContent, names: [...document.querySelectorAll('.player .name')].map(e => e.textContent)})"))
    ctx.close()

    # ── 4. the mic on the croc's lower jaw (no mic → countdown), players at the bottom ──
    for W, H in SIZES:
        ctx, pg = page(W, H)
        pg.goto(BASE + '?shot&nohowto')
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
    pg.goto(BASE + '?shot&nohowto')
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
