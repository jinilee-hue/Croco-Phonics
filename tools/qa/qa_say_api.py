"""The say-it turn with the phonics-api word check, end to end (headless Chrome, never the user's browser).
getUserMedia is replaced by a stream the test plays clips into (macOS privacy blocks fake devices from an agent); the rest
is real: START → a safe tooth (__croco.onTooth) → card → "Now say the word." → Mic.listen → phonics-api → next turn.
usage: uv run --with playwright==1.62.0 python tools/qa/qa_say_api.py [api|device] [base]
  api (default): ~/.config/phonics-api/key goes into this browser's localStorage (never printed); device: no key.
Cases (level 1; clips = the lesson pack's recordings, Korean talk = phonics-api TTS):
  right   moon                       → passes
  other   map ← "mop", then "map"    → Try again, passes
  talk    milk ← Korean talk, "milk" → read again (not the child's), passes
  three   mug ← "moon" ×3            → the 3rd try passes anyway
In device mode every voice passes at once (the old rule).
"""
import json
import pathlib
import subprocess
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ('api', 'device') else 'api'
BASE = next((a for a in sys.argv[1:] if a.startswith('http')), 'http://127.0.0.1:5211/')
KIT = pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit'
sys.path.insert(0, str(KIT / 'tools'))
import lessonpack  # noqa: E402
import papi  # noqa: E402

CLIPS = KIT / 'cache' / 'qa' / 'croco'
CLIPS.mkdir(parents=True, exist_ok=True)
KEY = (pathlib.Path.home() / '.config/phonics-api/key').read_text().strip() if MODE == 'api' else ''
PACK = lessonpack.load(lessonpack.pack_dir('FP.K.U1L1'))


def word(w):
    out = CLIPS / f'w_{w}.wav'
    if not out.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', PACK['words'][w]['audio'], '-ac', '1', '-ar', '24000', str(out)], check=True)
    return out.name


def talk():
    out = CLIPS / 'talk_ko.wav'
    if not out.exists():
        out.write_bytes(papi.tts('선생님 이거 다음에 뭐 해요?', 'ko-KR-SunHiNeural'))
    return out.name


TEETH = ['moon', 'map', 'milk', 'mug', 'man', 'meat', 'mirror', 'mitt', 'mop', 'mushroom']
TARGET = 'mushroom'
CASES = [('right', 'moon', [word('moon')]), ('other', 'map', [word('mop'), word('map')]),
         ('talk', 'milk', [talk(), word('milk')]), ('three', 'mug', [word('moon')] * 3)]

INIT = '''(() => {
  let ctx = null, dest = null;
  const live = () => { if (!ctx) { ctx = new AudioContext(); dest = ctx.createMediaStreamDestination(); } return ctx; };
  navigator.mediaDevices.getUserMedia = async () => { live(); await ctx.resume(); dest = ctx.createMediaStreamDestination(); return dest.stream; };
  window.__qaPlay = async (url) => {
    live(); await ctx.resume();
    const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(dest); s.start();
    return buf.duration;
  };
  window.__test = %s;
  localStorage.%s;
})()''' % (json.dumps({'teeth': TEETH, 'target': TARGET}),
           f"setItem('phonics_api_key', {json.dumps(KEY)})" if KEY else "removeItem('phonics_api_key')")

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    logs, errors = [], []
    pg.on('console', lambda m: logs.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.route('**/qa-clip/**', lambda route: route.fulfill(body=(CLIPS / urllib.parse.unquote(route.request.url.split('/qa-clip/')[1])).read_bytes(), content_type='audio/wav'))
    pg.add_init_script(INIT)
    pg.goto(BASE + '?nohowto&log=1')
    pg.wait_for_function('window.__ready === true && window.__intro === true', timeout=90000)
    pg.wait_for_function("PhonicsAPI.status() !== 'unknown'", timeout=20000)
    print('phonics-api:', pg.evaluate('PhonicsAPI.status()'), f'({MODE})', flush=True)
    pg.click('.title .start', force=True)
    pg.wait_for_function("__croco.G.screen === 'game'", timeout=60000)
    # count the listen windows: clip k goes into window k of the turn (not into the tutor's lines in between)
    pg.evaluate("() => { const L = Mic.listen; Mic.listen = (o) => { window.__qaListens = (window.__qaListens || 0) + 1; return L(o); }; }")
    for name, w, clips in CASES:
        # the turn is up (the round's intro, or the last card docked) and the game takes a press
        pg.wait_for_function("document.querySelector('#turn').classList.contains('show') && !__croco.G.busy", timeout=60000)
        time.sleep(0.8)
        i = TEETH.index(w)
        n0 = len(logs)
        w0 = pg.evaluate('window.__qaListens || 0')
        pg.evaluate(f'() => {{ __croco.onTooth({i}); }}')
        pg.wait_for_function("!!document.querySelector('#mic.listen')", timeout=60000)
        fed, t0 = 0, time.time()
        while time.time() - t0 < 90:
            st = pg.evaluate("({ win: window.__qaListens || 0, listening: !!Sound.listening, mic: !!document.querySelector('#mic.listen') })")
            if not st['mic']:
                break
            if st['listening'] and fed < len(clips) and st['win'] - w0 == fed + 1:
                time.sleep(0.6)
                pg.evaluate(f"__qaPlay('./qa-clip/{urllib.parse.quote(clips[fed])}')")
                fed += 1
            time.sleep(0.2)
        judged = [json.loads(l.split('phonics-api ', 1)[1]) for l in logs[n0:] if l.startswith('phonics-api ')]
        print(f"{name:6s} {w:6s} | fed {fed}/{len(clips)} | " + ' · '.join(f"{j['verdict']} [{j['heard']}] {j['ms']}ms" for j in judged)
              + ('' if not pg.evaluate("!!document.querySelector('#mic.listen')") else ' | STILL LISTENING'), flush=True)
        pg.wait_for_function("!document.querySelector('#mic.listen')", timeout=30000)
    b.close()
print('errors:', errors or 'none')
