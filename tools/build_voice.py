"""Voice clips for Croco Phonics → assets/voice/*.mp3 + js/voice.js

One voice for the whole game = the company TTS boy voice Magic Block (Phonics-Jenga) uses (Qwen3 'aiden',
cheerful 7-year-old boy) — the user picked it for Phonics Island; no device speechSynthesis (differs per device).
- REUSED from Phonics-Jenga public/voice (same engine, already read-back checked there):
  the 12 Lesson 1 words (w_*), the official FPR K /m/ letter-sound recording (s_m), and shared lines (turns, say it, wins…).
- KOREAN (EN | 한 in the game): Magic Block's Korean takes of the shared lines (k:*, same voice, language 'ko') are
  reused too, except great1 (it says 블럭); NEW_KO are this game's Korean lines. audio.js plays 'k:x' for 't:x' in Korean.
- NEW lines below (game-specific) are fetched from the company TTS (company network / VPN; TTS_BASE_URL + LLM_API_KEY
  come from ~/.zshrc — never printed). If the server can't be reached, the new lines are skipped and the game plays
  without them (it checks CROCO_VOICE.clips before playing).

Clip trims: lead-in, loudness and length are applied at playback from js/voice.js: {key: [file, start s, gain, dur s]}.
Run: zsh -ic '/Users/jini/.hermes/bin/uv run --with numpy python tools/build_voice.py'
"""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'voice'
JS = ROOT / 'js' / 'voice.js'
JENGA = pathlib.Path.home() / 'Documents/Jini/2026/Phonics/Phonics-Jenga'
CACHE = pathlib.Path.home() / '.cache' / 'croco-phonics' / 'voice_qwen'
SR = 24000
QWEN_URL, QWEN_KEY = os.environ.get('TTS_BASE_URL', '').rstrip('/'), os.environ.get('LLM_API_KEY', '')
QWEN_VOICE = 'aiden'
T_INS = ['Speak like a cheerful, energetic 7-year-old boy: bright and excited.',
         'Speak like a cheerful, energetic 7-year-old boy, bright and excited, clearly.',
         'Like a cheerful, energetic 7-year-old boy: bright, excited and clear.']

WORDS = [w['w'] for w in json.loads((ROOT / 'js' / 'words.js').read_text(encoding='utf-8')
                                    .split('=', 1)[1].rstrip().rstrip(';'))['words']]
REUSE_T = ['turn1', 'turn2', 'sayit', 'great1', 'great2', 'great3', 'uhoh', 'win1', 'win2', 'playagain',
           'nomic', 'louder', 'pressstart']
REUSE_K = [k for k in REUSE_T if k != 'great1']        # Magic Block's Korean takes ('great1' says "블럭을 얻었어")
NEW = {
    'hello': 'Hi, friends! Welcome to Croco Phonics!',
    'rule': 'Watch out for this word!',
    'safe': 'Phew! Safe!',
    'chomp': 'Chomp! The croc got you!',
    'howto': 'Press a tooth and say the word!',
    # the croc tutor's explanation (first game only; game.js TUT has the same texts for its bubbles)
    'tut1': "Hi, friends! I'm Croco!",
    'tut2': 'This is the trap word.',
    'tut3': "Don't press the tooth with this word!",
    'tut4': 'Take turns. Press a tooth.',
    'tut5': 'A card pops out. Now say the word.',
    'tut6': 'Uh-oh! The trap word!',
    'tut7': 'CHOMP! You lose!',
    'tut8': "Ready? Let's play!",
}
# Korean lines (the bubble text = what the voice reads; game.js TUT.ko holds the same tut* texts)
NEW_KO = {
    'hello': '안녕, 친구들! 크로코 파닉스에 온 걸 환영해!',
    'rule': '이 단어를 조심해!',
    'safe': '휴! 괜찮아!',
    'chomp': '덥석! 악어한테 잡혔다!',
    'howto': '이빨을 누르고 단어를 말해 봐!',
    'tut1': '안녕, 친구들! 나는 크로코야!',
    'tut2': '이건 함정 단어야.',
    'tut3': '이 단어가 숨은 이빨은 누르면 안 돼!',
    'tut4': '번갈아 가며 이빨을 하나씩 눌러 봐.',
    'tut5': '카드가 톡 나오면, 이제 단어를 읽어 봐.',
    'tut6': '앗! 함정 단어야!',
    'tut7': '덥석! 그럼 지는 거야!',
    'tut8': '준비됐니? 시작하자!',
}
assert set(NEW_KO) == set(NEW), f'Korean lines missing/extra: {set(NEW) ^ set(NEW_KO)}'

jv = json.loads((JENGA / 'src/data/voice.json').read_text(encoding='utf-8'))
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob('*.mp3'):
    f.unlink()
clips, lines, lines_ko = {}, {}, {}


def reuse(key):
    e = jv['clips'][key]
    shutil.copy2(JENGA / 'public' / 'voice' / e[0], OUT / e[0])
    clips[key] = e


for w in WORDS:
    reuse(f'w:{w}')
reuse('s:m')
for k in REUSE_T:
    reuse(f't:{k}')
    lines[k] = jv['lines'][k]
for k in REUSE_K:
    reuse(f'k:{k}')
    lines_ko[k] = jv['lines_ko'][k]

# ── new lines: company TTS ───────────────────────────────────────────────────────────────────────────────
LEAD, TAIL = .10, .25
FR = int(SR * .01)


def decode(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def speech(x, floor_db=-50):
    n = len(x) // FR
    rms = np.sqrt((x[:n * FR].reshape(n, FR) ** 2).mean(1) + 1e-12)
    return rms, np.nonzero(rms > rms.max() * 10 ** (floor_db / 20))[0]


def trim(raw, dst, target_db=-17, floor_db=-50):
    _, act = speech(decode(raw), floor_db)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-t', f'{(act[-1] + 1) * FR / SR + TAIL:.3f}',
                    '-c:a', 'copy', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '0', str(dst)], check=True)
    y = decode(dst)
    rms, act = speech(y, floor_db)
    voiced = rms[act[0]:act[-1] + 1]
    loud = np.sqrt((voiced[voiced > voiced.max() * .1] ** 2).mean())
    g = min(10 ** (target_db / 20) / loud, 10 ** (-1 / 20) / np.abs(y).max())
    start = max(0., act[0] * FR / SR - LEAD)
    return round(start, 3), round(float(g), 3), round(len(y) / SR - start, 3)


SERVER = {'down': False}


def qwen(text, ins, dst, lang='en'):
    if SERVER['down']:
        return False
    body = json.dumps({'model': 'qwen-tts', 'input': text, 'voice': QWEN_VOICE, 'language': lang,
                       'response_format': 'wav', 'instructions': ins}).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(QWEN_URL + '/audio/speech', data=body, method='POST',
                                         headers={'Authorization': 'Bearer ' + QWEN_KEY, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=25) as r:
                wav = r.read()
            with tempfile.NamedTemporaryFile(suffix='.wav') as f:
                f.write(wav); f.flush()
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f.name, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame',
                                '-b:a', '64k', str(dst)], check=True)
            return True
        except Exception as e:   # 503 = GPU busy: wait and retry; no answer at all = not on the company network
            busy = getattr(e, 'code', None) in (429, 502, 503, 504)
            if attempt == 3 or not busy:
                print(f'  TTS failed for "{text}": {type(e).__name__} {getattr(e, "code", "")}')
                if not busy:
                    SERVER['down'] = True
                return False
            time.sleep(4 + 3 * attempt)


CACHE.mkdir(parents=True, exist_ok=True)
missing = []
take = int(os.environ.get('TAKE', '0'))
for pre, table, lang, out in (('t', NEW, 'en', lines), ('k', NEW_KO, 'ko', lines_ko)):
    for k, text in table.items():
        ins = T_INS[take % len(T_INS)]
        raw = CACHE / f'{pre}_{k}_{hashlib.md5((QWEN_VOICE + ins + text + lang).encode()).hexdigest()[:8]}.mp3'
        if not raw.exists():
            if not (QWEN_URL and QWEN_KEY) or not qwen(text, ins, raw, lang):
                missing.append(f'{pre}:{k}')
                continue
        dst = OUT / f'{pre}_{k}.mp3'
        clips[f'{pre}:{k}'] = [dst.name, *trim(raw, dst)]
        out[k] = text

JS.write_text('/* generated by tools/build_voice.py — do not edit */\nwindow.CROCO_VOICE = '
              + json.dumps({'engine': 'company-tts', 'voice': QWEN_VOICE, 'clips': clips, 'lines': lines, 'lines_ko': lines_ko},
                           ensure_ascii=False, indent=0) + ';\n', encoding='utf-8')
# the same clips as base64 so the game also plays when index.html is opened straight from disk (file:// can't fetch)
import base64  # noqa: E402
data = {k: base64.b64encode((OUT / v[0]).read_bytes()).decode() for k, v in clips.items()}
(ROOT / 'js' / 'voice-data.js').write_text('/* generated by tools/build_voice.py — do not edit */\nwindow.CROCO_VOICE_DATA = '
                                           + json.dumps(data) + ';\n', encoding='utf-8')
size = sum((OUT / v[0]).stat().st_size for v in clips.values())
print(f'{len(clips)} clips · {size / 1024:.0f} KB → {JS}')
if missing:
    print('NOT generated (no company TTS):', missing)
