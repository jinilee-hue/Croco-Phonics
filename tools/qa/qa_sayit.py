"""Headless QA: the say turn — phonics-kit rules F0 · F3 (user 2026-11-22; reference Phonics Match sayItTurn).
usage: uv run --with playwright python tools/qa/qa_sayit.py <outdir> [base_url] [test …]
  jump     JUMP shows during a say turn (aria "Jump"); a tap skips the word: the turn passes, nobody gets the card
  reward   a word said right (scripted) → the card goes to the player
  wrong2   2 wrong tries → "Try again! Listen." then "Good try!", no card; wrong then right → the card
  quiet    scripted silence: 2 listens, the JUMP guide (glove + "Want to skip? Tap the jump button!") once per round, no card
  cant     scripted "can't judge" → skipped, no card
  nomic    no mic (__test.mic = false) → the say turn is skipped at once (no mic / JUMP shown), no card
  nokey    a (stubbed) mic but no phonics-api key, no on-device recognizer → skipped, no listen, no card
  apifail  a voice is heard, the server call fails → no card (never "any sound passes"); a server 'ok' → the card
  silence  real time: a silent mic, the server usable (stubbed) → the turn ends by itself in ~20 s, no card
The repo's old version checked the opposite rule ("the turn never moves on until the word is said", tap the mic).
"""

import sys, json, time, pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2].startswith('http') else 'http://127.0.0.1:5211/'
ONLY = {a for a in sys.argv[2:] if not a.startswith('http')}
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
TEETH = ['map', 'milk', 'moon', 'mouse', 'monkey', 'mug', 'mop', 'man', 'meat', 'mitt']
SAFE = 3        # 'mouse'
results = []

# a microphone the test controls: silence, or a tone after the listen's calibration (window.__qaVoice())
MIC_STUB = """
navigator.mediaDevices.getUserMedia = async () => {
  const c = new AudioContext(); await c.resume();
  const o = c.createOscillator(), g = c.createGain(); g.gain.value = 0; o.frequency.value = 220; o.type = 'sawtooth';
  const d = c.createMediaStreamDestination(); o.connect(g); g.connect(d); o.start();
  window.__qaVoice = (ms = 800) => { g.gain.setValueAtTime(0.6, c.currentTime); g.gain.setValueAtTime(0, c.currentTime + ms / 1000); };
  return d.stream;
};"""
SAY_LOG = """() => { const o = Sound.say; window.__said = []; Sound.say = function (k, opts) { window.__said.push([Math.round(performance.now()), k]); return o.call(this, k, opts); }; }"""


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + str(detail) if detail else ''), flush=True)


def page(b, w=1280, h=800, test=None, stub_mic=False, url='index.html?nohowto', ctx=None):
    c = ctx or b.new_context(viewport={'width': w, 'height': h})
    pg = c.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    if stub_mic:
        pg.add_init_script(MIC_STUB)
    if test is not None:
        pg.add_init_script('window.__test = ' + json.dumps(test))
    pg.goto(url if url.startswith('file:') else BASE + url)
    pg.wait_for_function('window.__ready && window.__intro', timeout=30000)
    pg.evaluate(SAY_LOG)
    return c, pg, errs


def start_and_press(pg, tooth=SAFE, player=0):
    pg.click('#start', force=True)
    wait_turn(pg, player)
    pg.evaluate(f'() => {{ __croco.onTooth({tooth}); }}')


def wait_turn(pg, player, timeout=60000):
    pg.wait_for_function(f'document.querySelector("#app").dataset.turn === "{player}" && !!document.querySelector("#turn.show") && !__croco.G.busy', timeout=timeout)


def state(pg):
    return pg.evaluate("""() => ({ got: __croco.G.got, stat: __croco.G.stat, said: (window.__said || []).map(x => x[1]),
      cards: document.querySelectorAll('#cards .card').length, turn: __croco.G.turn, jump: document.querySelector('#jump').className })""")


def want(name):
    return not ONLY or name in ONLY


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)

    if want('jump'):
        c, pg, errs = page(b, test={'heard': [False] * 8, 'target': 'moon', 'teeth': TEETH})
        start_and_press(pg)
        pg.wait_for_function("!!document.querySelector('#jump.show')", timeout=20000)
        pg.wait_for_timeout(700)
        vis = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('#jump')); return [s.opacity, s.pointerEvents, document.querySelector('#jump').getAttribute('aria-label')]; })()")
        pg.screenshot(path=str(OUT / 'jump_up.png'))
        t0 = time.time()
        pg.click('#jump')
        wait_turn(pg, 1, 10000)
        st = state(pg)
        check('jump: visible + clickable during the say turn', vis[0] == '1' and vis[1] == 'auto' and vis[2] == 'Jump', vis)
        check('jump: turn passes, no card for anyone', st['got'] == [[], []] and st['cards'] == 0 and st['stat']['jumped'] == 1,
              f"{time.time() - t0:.1f}s got={st['got']} stat={st['stat']}")
        check('jump: hidden after', 'show' not in st['jump'], st['jump'])
        check('jump: console clean', not errs, errs)
        c.close()

    if want('reward'):
        c, pg, errs = page(b, test={'heard': [True], 'target': 'moon', 'teeth': TEETH})
        start_and_press(pg)
        wait_turn(pg, 1, 30000)
        st = state(pg)
        check('reward: a word said right goes to the player', st['got'] == [['mouse'], []] and st['stat']['said'] == 1, f"got={st['got']} stat={st['stat']}")
        c.close()

    if want('wrong2'):
        c, pg, errs = page(b, test={'heard': ['miss', 'miss'], 'target': 'moon', 'teeth': TEETH})
        start_and_press(pg)
        wait_turn(pg, 1, 40000)
        st = state(pg)
        s = st['said']
        check('wrong x2: "Try again" then "Good try!", no card', 't:again' in s and 't:goodtry' in s and s.index('t:again') < s.index('t:goodtry')
              and st['got'] == [[], []] and st['stat']['missed'] == 1, f"said={s} got={st['got']}")
        c.close()
        c, pg, errs = page(b, test={'heard': ['miss', True], 'target': 'moon', 'teeth': TEETH})
        start_and_press(pg)
        wait_turn(pg, 1, 40000)
        st = state(pg)
        check('wrong then right: the card', st['got'] == [['mouse'], []] and 't:goodtry' not in st['said'], f"said={st['said']} got={st['got']}")
        c.close()

    if want('quiet'):
        c, pg, errs = page(b, test={'heard': [False] * 12, 'target': 'moon', 'teeth': TEETH})
        pg.evaluate("() => { window.__listens = 0; const L = Mic.listen; Mic.listen = function (o) { window.__listens++; return L.call(this, o); }; }")
        start_and_press(pg)
        pg.wait_for_function("document.querySelector('#hint').classList.contains('on-jump')", timeout=20000)
        pg.wait_for_timeout(900)
        pg.screenshot(path=str(OUT / 'jump_guide.png'))
        pokes = pg.evaluate("document.querySelector('#jump').classList.contains('poke')")
        wait_turn(pg, 1, 60000)
        st = state(pg)
        n1 = pg.evaluate('window.__listens')
        check('quiet (scripted): 2 listens, the guide once, no card', n1 == 2 and st['said'].count('t:jump') == 1 and st['got'] == [[], []] and st['stat']['missed'] == 1,
              f"listens={n1} said={st['said']} poke={pokes}")
        # player 2 quiet too: no second guide in the same round
        pg.evaluate("() => { window.__test.heard = [false, false, false, false]; window.__said = []; __croco.onTooth(4); }")
        wait_turn(pg, 0, 60000)
        st = state(pg)
        check('quiet: the guide only once per round', 't:jump' not in st['said'] and st['got'] == [[], []], f"said={st['said']}")
        c.close()

    if want('cant'):
        c, pg, errs = page(b, test={'heard': ['cant'], 'target': 'moon', 'teeth': TEETH})
        start_and_press(pg)
        wait_turn(pg, 1, 30000)
        st = state(pg)
        check("can't judge (scripted): no card", st['got'] == [[], []] and st['stat']['skipped'] == 1, f"stat={st['stat']} said={st['said']}")
        c.close()

    if want('nomic'):
        c, pg, errs = page(b, test={'mic': False, 'target': 'moon', 'teeth': TEETH})
        pg.evaluate("() => { window.__micUp = false; new MutationObserver(() => { if (document.querySelector('#mic.listen, #jump.show')) window.__micUp = true; }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); }")
        start_and_press(pg)
        t0 = time.time()
        wait_turn(pg, 1, 30000)
        st = state(pg)
        up = pg.evaluate('window.__micUp')
        check('no mic: say turn skipped at once, no card, no mic/jump shown', st['got'] == [[], []] and st['stat']['skipped'] == 1 and not up and 't:sayit' not in st['said'],
              f"{time.time() - t0:.1f}s said={st['said']} micUp={up}")
        check('no mic: console clean', not errs, errs)
        c.close()

    if want('nokey'):
        # a real (stubbed) microphone, no phonics-api key on this fresh profile, no on-device recognizer → skipped
        c, pg, errs = page(b, stub_mic=True, test=None)
        pg.evaluate("window.__test = {target: 'moon', teeth: %s}" % json.dumps(TEETH))
        api = pg.evaluate('PhonicsAPI.status()')
        pg.evaluate("() => { window.__lis = false; setInterval(() => { if (Sound.listening || document.querySelector('#mic.listen')) window.__lis = true; }, 30); }")
        start_and_press(pg)
        wait_turn(pg, 1, 30000)
        st = state(pg)
        check('no key: say turn skipped, no listen, no card', api != 'on' and not pg.evaluate('window.__lis') and st['got'] == [[], []] and st['stat']['skipped'] == 1,
              f"api={api} mic={pg.evaluate('Mic.state')} said={st['said']}")
        c.close()

    if want('apifail'):
        # key ok (stubbed), a voice is heard, the server call fails → can't judge, no card (never "any sound passes")
        c, pg, errs = page(b, stub_mic=True, test=None)
        pg.evaluate("""() => { window.__test = {target: 'moon', teeth: %s}; window.__an = 0;
          PhonicsAPI.usable = () => true; PhonicsAPI.analyze = async () => { window.__an++; return { ok: false, reason: 'network' }; }; }""" % json.dumps(TEETH))
        start_and_press(pg)
        pg.wait_for_function('Sound.listening', timeout=30000)
        pg.wait_for_timeout(500)
        pg.evaluate('window.__qaVoice(800)')
        wait_turn(pg, 1, 30000)
        st = state(pg)
        check('api failure after a voice: no card', pg.evaluate('window.__an') == 1 and st['got'] == [[], []] and st['stat']['skipped'] == 1,
              f"analyze calls={pg.evaluate('window.__an')} said={st['said']}")
        c.close()
        # and a voice judged 'ok' by the server → the card (the real judge path, server stubbed)
        c, pg, errs = page(b, stub_mic=True, test=None)
        pg.evaluate("""() => { window.__test = {target: 'moon', teeth: %s};
          PhonicsAPI.usable = () => true; PhonicsAPI.analyze = async () => ({ ok: true, data: {} });
          PhonicsAPI.judge = () => ({ verdict: 'ok', heard: 'm aw s', rel: 0 }); }""" % json.dumps(TEETH))
        start_and_press(pg)
        pg.wait_for_function('Sound.listening', timeout=30000)
        pg.wait_for_timeout(500)
        pg.evaluate('window.__qaVoice(800)')
        wait_turn(pg, 1, 30000)
        st = state(pg)
        check('server ok after a voice: the card', st['got'] == [['mouse'], []], f"got={st['got']}")
        c.close()

    if want('silence'):
        # real time: a silent microphone, the server usable (stubbed): the turn ends by itself after ~20 s
        c, pg, errs = page(b, stub_mic=True, test=None)
        pg.evaluate("""() => { window.__test = {target: 'moon', teeth: %s}; PhonicsAPI.usable = () => true; }""" % json.dumps(TEETH))
        start_and_press(pg)
        pg.wait_for_function("!!document.querySelector('#jump.show')", timeout=30000)
        t0 = time.time()
        wait_turn(pg, 1, 45000)
        dt = time.time() - t0
        st = state(pg)
        check('silence (real time): ends by itself in ~20 s, the guide said, no card', 15 <= dt <= 27 and 't:jump' in st['said'] and st['got'] == [[], []],
              f"{dt:.1f}s said={st['said']}")
        c.close()

    b.close()

bad = [r for r in results if not r[1]]
print(f'\n{len(results) - len(bad)}/{len(results)} passed')
sys.exit(1 if bad else 0)
