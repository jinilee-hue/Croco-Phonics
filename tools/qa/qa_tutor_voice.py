"""QA: the explanation's voice (company-TTS tut1–tut8, EN and 한).
usage: uv run --with playwright python tools/qa/qa_tutor_voice.py <outdir>
  1  sound locked (no tap yet, the browser's rule): bubbles only — each line stays up at least its reading time
  2  a tap mid-line (on the bubble, not a button): that line is said aloud right away, then every next line in order;
     each clip starts with its own text in the bubble; never two voices at once
  3  한 (stored), a tap at the start: k:tut1 … k:tut8 in order, each with its Korean text
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:5211/index.html'
ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
SPY = """() => { window.__log = []; const S = window.Sound, o = S.say.bind(S), t0 = performance.now(), now = () => Math.round(performance.now() - t0);
  S.say = (k, opts) => { const key = S.voiceKey(k), e = { key, at: now(), text: document.querySelector('#bubble p').textContent, ok: null };
    window.__log.push(['say', e]); const r = o(k, opts); Promise.resolve(r).then(v => { e.ok = v; e.end = now(); }); return r; };
  window.__texts = []; const p = document.querySelector('#bubble p');
  new MutationObserver(() => window.__texts.push([p.textContent, now()])).observe(p, { childList: true, characterData: true, subtree: true });
  window.__maxPlaying = 0; setInterval(() => { window.__maxPlaying = Math.max(window.__maxPlaying, S.playing ? S.playing.size : 0); }, 30); }"""
DONE = "!document.querySelector('#app').classList.contains('howto') && document.querySelector('#start') && getComputedStyle(document.querySelector('#start')).opacity === '1' && window.__texts.length > 3"


def run(pg, lang, tap_at=None):
    pg.goto(BASE + '?shot&nohowto')
    pg.evaluate(f"localStorage.setItem('croco.lang.v1', '{lang}')")
    pg.goto(BASE + '?shot&target=mitt')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    pg.evaluate(SPY)
    lines = pg.evaluate("window.CROCO_VOICE['" + ('lines_ko' if lang == 'ko' else 'lines') + "']")
    if tap_at:
        pg.wait_for_function(f"document.querySelector('#bubble p').textContent === {lines[tap_at]!r} && document.querySelector('#bubble').classList.contains('show')", timeout=60000)
        time.sleep(0.4)
        pg.click('#bubble', force=True)
    pg.wait_for_function(DONE, timeout=120000, polling=200)
    return lines, pg.evaluate('window.__texts'), [e for k, e in pg.evaluate('window.__log') if k == 'say'], pg.evaluate('window.__maxPlaying')


def tut_key(text, lines):
    return next((k for k in lines if k.startswith('tut') and lines[k] == text), None)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    bad, errs = [], []
    # ── 1. locked: bubbles only, each up for its reading time ──
    pg = b.new_page(viewport={'width': 1180, 'height': 820})
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text else None)
    lines, texts, said, mx = run(pg, 'en')
    shown = []
    for (t, a), (_, nxt) in zip(texts, texts[1:] + [(None, None)]):
        k = tut_key(t, lines)
        if k and nxt is not None and not (shown and shown[-1][0] == k):
            shown.append((k, nxt - a, 1000 + len(t) * 58))
    print('1 locked:', ' '.join(f'{k} {ms}ms(≥{need})' for k, ms, need in shown), '| voices played:', [e['key'] for e in said if e['ok']])
    if [k for k, _, _ in shown] != [f'tut{i}' for i in range(1, 8)]:
        bad.append(f'locked: lines {[k for k, _, _ in shown]}')
    bad += [f'locked: {k} up {ms} ms < {need}' for k, ms, need in shown if ms < need - 150]
    if any(e['ok'] for e in said):
        bad.append('locked: a voice played')
    pg.close()
    # ── 2. a tap mid-line (tut2) ──
    pg = b.new_page(viewport={'width': 1180, 'height': 820})
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    lines, texts, said, mx = run(pg, 'en', tap_at='tut2')
    played = [e for e in said if e['ok'] is not False and e['key'].startswith('t:tut')]
    print('2 tap on tut2:', [(e['key'], e['at'], e.get('end')) for e in played], '| max voices at once', mx)
    if [e['key'] for e in played] != [f't:tut{i}' for i in range(2, 9)]:
        bad.append(f'tap: played {[e["key"] for e in played]}')
    bad += [f'tap: {e["key"]} started with "{e["text"]}"' for e in played if e['text'] != lines[e['key'][2:]]]
    if mx > 1:
        bad.append(f'tap: {mx} voices at once')
    tap2 = next((e for e in played if e['key'] == 't:tut2'), None)
    if tap2:
        t2 = next(a for t, a in texts if t == lines['tut2'])
        print(f'  tut2 said {tap2["at"] - t2} ms after its bubble (the tap came ~400 ms in)')
    pg.screenshot(path=str(out / 'tap_end.png'))
    pg.close()
    # ── 3. 한 ──
    pg = b.new_page(viewport={'width': 1180, 'height': 820})
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    lines, texts, said, mx = run(pg, 'ko', tap_at='tut1')
    played = [e for e in said if e['ok'] is not False and e['key'].startswith('k:tut')]
    print('3 한:', [(e['key'], e['at']) for e in played], '| max voices at once', mx)
    if [e['key'] for e in played] != [f'k:tut{i}' for i in range(1, 9)]:
        bad.append(f'ko: played {[e["key"] for e in played]}')
    bad += [f'ko: {e["key"]} started with "{e["text"]}"' for e in played if e['text'] != lines[e['key'][2:]]]
    if mx > 1:
        bad.append(f'ko: {mx} voices at once')
    pg.close()
    print('problems:', bad or 'none', '| errors:', errs[:6] or 'none')
    b.close()
