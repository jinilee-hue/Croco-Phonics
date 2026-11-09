"""Headless QA: the turn never moves on without the word (user: "단어를 읽지 않았는데 그냥 넘어가는 경우 없어야해").
usage: uv run --with playwright python tools/qa/qa_sayit.py <outdir> [--real]
  1  scripted silence (__test.heard = [false, false, false, true]): no turn change until the 4th listen; between them
     "louder", the word again (sound + word) + "say it", "louder"; then praise and the turn passes
  2  no mic (__test.mic = false): after 11 s still the same turn, the mic is a button with the glove on it and "say it"
     came again; a click on the mic → praise, the turn passes
  3  --real: Chrome's fake microphone fed from a WAV (needs ffmpeg): steady room noise and spread-out clicks must NOT
     count as the word in 14 s; a spoken word (the game's own w:map clip with pauses) must, within 25 s
"""
import sys, time, json, base64, pathlib, subprocess, tempfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BASE = 'http://127.0.0.1:5211/index.html?shot&nohowto'
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
REAL = '--real' in sys.argv
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
SPY = """() => { window.__said = []; const S = window.Sound, o = S.say.bind(S);
  S.say = (k, opts) => { window.__said.push([S.voiceKey(k), Math.round(performance.now())]); return o(k, opts); }; }"""
problems = []


def start(pg, test):
    pg.goto(BASE)
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=60000)
    pg.evaluate(SPY)
    if test is not None:
        pg.evaluate(f'window.__test = {json.dumps(test)}')
    pg.click('#start', force=True)
    pg.wait_for_function("document.querySelector('#turn').classList.contains('show')", timeout=20000)
    time.sleep(0.6)
    st = pg.evaluate('({teeth: __croco.G.teeth, target: __croco.G.target, turn: __croco.G.turn})')
    safe = next(i for i, w in enumerate(st['teeth']) if w != st['target'])
    pg.evaluate('window.__said.length = 0')
    pg.evaluate(f'() => {{ __croco.onTooth({safe}); }}')
    return st['teeth'][safe], st['turn']


def said(pg):
    return [k for k, _ in pg.evaluate('window.__said')]


def turn(pg):
    return pg.evaluate('__croco.G.turn')


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    # ── 1. scripted silence ──
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    word, t0 = start(pg, {'heard': [False, False, False, True]})
    pg.wait_for_function(f'__croco.G.turn !== {t0}', timeout=60000)
    keys = said(pg)
    after = keys[keys.index('t:sayit') + 1:] if 't:sayit' in keys else []
    want = ['t:louder', 's:m', f'w:{word}', 't:sayit', 't:louder']
    got = after[:len(want)]
    print('1 voices after the first "say it":', after)
    if got != want:
        problems.append(f'1 expected {want} before the turn passed, got {got}')
    if not any(k in ('t:great2', 't:great3') for k in after):
        problems.append('1 no praise once heard')
    pg.close()

    # ── 2. no mic: waits for a tap ──
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    word, t0 = start(pg, {'mic': False})
    pg.wait_for_function("document.querySelector('#mic').classList.contains('nomic')", timeout=20000)
    time.sleep(11)
    st = pg.evaluate("""() => ({ turn: __croco.G.turn, nomic: document.querySelector('#mic').classList.contains('nomic'),
      hand: document.querySelector('#hint').matches('.show.on-mic'), pe: getComputedStyle(document.querySelector('#mic')).pointerEvents })""")
    pg.screenshot(path=str(out / '2_waiting_for_tap.png'))
    n_sayit = said(pg).count('t:sayit')
    print('2 after 11 s:', st, '| "say it" said', n_sayit, 'times')
    if st['turn'] != t0:
        problems.append('2 the turn moved on without a tap')
    if not (st['nomic'] and st['hand'] and st['pe'] == 'auto'):
        problems.append(f'2 mic not tappable / no glove: {st}')
    if n_sayit < 2:
        problems.append('2 "say it" not asked again')
    m = pg.evaluate("(() => { const r = document.querySelector('#mic').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    pg.mouse.click(m[0], m[1])
    try:
        pg.wait_for_function(f'__croco.G.turn !== {t0}', timeout=8000)
        print('2 tap → turn passed; praise:', [k for k in said(pg) if k.startswith('t:great')])
    except Exception:
        problems.append('2 the tap did not pass the turn')
    pg.close()
    b.close()

    # ── 3. a real (fake-device) microphone ──
    if REAL:
        tmp = pathlib.Path(tempfile.mkdtemp())
        vd = (ROOT / 'js/voice-data.js').read_text()
        key = '"w:map": "'
        i = vd.index(key) + len(key)
        (tmp / 'map.mp3').write_bytes(base64.b64decode(vd[i:vd.index('"', i)]))
        ff = ['ffmpeg', '-v', 'error', '-y']
        subprocess.run(ff + ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.004:d=6', '-ar', '48000', '-ac', '1', str(tmp / 'room.wav')], check=True)
        # clicks: 40 ms noise bursts every 0.45 s over the room noise
        subprocess.run(ff + ['-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t,0.45),0.04),0.5*(random(0)*2-1),0)':s=48000:d=6",
                             '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.004:d=6', '-filter_complex', 'amix=inputs=2:normalize=0',
                             '-ac', '1', str(tmp / 'clicks.wav')], check=True)
        # a word every 3.5 s: 2.5 s of room noise, the word, the rest
        subprocess.run(ff + ['-i', str(tmp / 'map.mp3'), '-af', 'adelay=2500,apad=whole_dur=3.5', '-ar', '48000', '-ac', '1', str(tmp / 'w.wav')], check=True)
        subprocess.run(ff + ['-i', str(tmp / 'w.wav'), '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.004:d=3.5',
                             '-filter_complex', 'amix=inputs=2:normalize=0', '-ac', '1', str(tmp / 'speech.wav')], check=True)
        for name, wait, expect in (('room', 14, False), ('clicks', 14, False), ('speech', 25, True)):
            b = p.chromium.launch(channel='chrome', headless=True, args=ARGS + [
                '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', f'--use-file-for-fake-audio-capture={tmp / (name + ".wav")}'])
            pg = b.new_page(viewport={'width': 1280, 'height': 800})
            pg.on('pageerror', lambda e: errs.append(str(e)))
            word, t0 = start(pg, None)
            t1 = time.time()
            passed = None
            while time.time() - t1 < wait:
                if turn(pg) != t0:
                    passed = round(time.time() - t1, 1); break
                time.sleep(0.25)
            mic = pg.evaluate("window.Mic ? Mic.state : (window.__croco && 'n/a')")
            print(f'3 {name}: mic {mic}, passed after {passed} s' if passed else f'3 {name}: mic {mic}, still waiting after {wait} s',
                  '| voices', said(pg)[:12])
            if (passed is not None) != expect:
                problems.append(f'3 {name}: expected {"a pass" if expect else "no pass"}, got {passed}')
            b.close()
print('problems:', problems or 'none', '| errors:', errs or 'none')
