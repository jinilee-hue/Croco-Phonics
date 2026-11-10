"""Original GAME music for Croco Phonics: exciting AND tense (user: "악어게임 좀더 신나고 긴장감 넘치는 음악이랑 효과음
없을까?"). The title keeps its sunny F-major loop (tools/make_bgm.py); START crossfades to this one.

A cartoon "chase" loop for the crocodile-dentist moment: A minor, 150 BPM, 16 bars = 25.6 s. A ticking clock (woodblock
tick-tock on every beat), a staccato bass ostinato with chromatic walk-ups into each phrase, a xylophone hook over
Am–Am–F–E (the E major chord keeps it on edge), boom-chik drums with syncopated kicks, string tremolo under the
first half, off-beat brass stabs in bars 5–8 and 13–16, tom fills and a riser that runs back into bar 1. Playful, not
scary. Everything is synthesised here (no samples). The reverb tail is folded back onto the start: a seamless loop.
→ assets/audio/bgm_game.mp3 + js/bgm-game-data.js (window.CROCO_BGM_GAME, the same mp3 as base64 for file://)

Run: /Users/jini/.hermes/bin/uv run --with numpy --with scipy python tools/make_bgm_game.py
"""
import base64
import json
import pathlib
import subprocess
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_MP3 = ROOT / 'assets' / 'audio' / 'bgm_game.mp3'
OUT_JS = ROOT / 'js' / 'bgm-game-data.js'
SR = 44100
BPM = 150
BEAT = 60 / BPM
BARS = 16
LOOP = BARS * 4 * BEAT               # 25.6 s
N = int(LOOP * SR) + SR * 3
rng = np.random.default_rng(31)
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)


def m(s):  # 'G#5' → midi
    return NOTE[s[:-1]] + 12 * (int(s[-1]) + 1)


CHORDS = ['Am', 'Am', 'F', 'E', 'Am', 'Am', ('F', 'G'), 'E',
          'Dm', 'E', 'Am', 'F', 'Dm', 'E', ('F', 'G'), 'E']
TONES = {'Am': ['A', 'C', 'E'], 'F': ['F', 'A', 'C'], 'E': ['E', 'G#', 'B'], 'G': ['G', 'B', 'D'], 'Dm': ['D', 'F', 'A']}
HOOK = [('E5', 0, .5), ('A5', 1, .5), ('C6', 2, .25), ('B5', 2.5, .25), ('A5', 3, .5)]
MEL = [
    HOOK,
    [('E5', 0, .25), ('E5', .5, .25), ('G5', 1, .5), ('A5', 2, .5), ('E5', 3, .5)],
    [('F5', 0, .5), ('A5', 1, .5), ('C6', 1.5, .5), ('D6', 2, .5), ('C6', 3, .5)],
    [('B5', 0, .5), ('G#5', 1, .5), ('E5', 2, .5), ('G#5', 2.5, .25), ('B5', 3, .5)],
    HOOK,
    [('A5', 0, .25), ('C6', .5, .25), ('E6', 1, .5), ('D6', 2, .25), ('C6', 2.5, .25), ('A5', 3, .5)],
    [('C6', 0, .5), ('A5', 1, .5), ('D6', 2, .5), ('B5', 3, .5)],
    [('G#5', 0, .25), ('A5', .5, .25), ('B5', 1, .25), ('D6', 1.5, .25), ('E6', 2, 1)],
    [('D6', 0, .5), ('F6', 1, .5), ('E6', 1.5, .25), ('D6', 2, .5), ('A5', 3, .5)],
    [('B5', 0, .5), ('G#5', 1, .5), ('B5', 2, .25), ('D6', 2.5, .25), ('E6', 3, .5)],
    [('C6', 0, .5), ('E6', 1, .5), ('A6', 2, .5), ('G6', 3, .25), ('E6', 3.5, .25)],
    [('F6', 0, .5), ('E6', 1, .5), ('C6', 2, .5), ('A5', 3, .5)],
    [('D6', 0, .25), ('D6', .5, .25), ('F6', 1, .5), ('A6', 2, .5), ('F6', 3, .5)],
    [('E6', 0, .5), ('D6', 1, .25), ('B5', 1.5, .25), ('G#5', 2, .5), ('B5', 3, .5)],
    [('C6', 0, .5), ('D6', 1, .5), ('E6', 2, .5), ('F6', 3, .5)],
    [('G#6', 0, .5), ('E6', 1, .5), ('B5', 2, .25), ('G#5', 2.5, .25), ('E5', 3, .5)],
]
assert len(MEL) == BARS == len(CHORDS)

L = np.zeros(N); R = np.zeros(N)


def add(sig, t, pan=0.0, gain=1.0):
    i = int(round(t * SR))
    if i >= N:
        return
    j = min(N, i + len(sig))
    s = sig[:j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def xylo(f, dur):
    """xylophone: a short bright bar (the 3.9× partial of a tuned bar), dies fast"""
    t = tt(max(dur, .2) + .5)
    tau = .22 * (523 / f) ** .3
    env = np.minimum(1, t / .0015) * np.exp(-t / tau)
    return (np.sin(2 * np.pi * f * t) + .45 * np.sin(2 * np.pi * 3.93 * f * t) * np.exp(-t / .04)
            + .12 * np.sin(2 * np.pi * 9.2 * f * t) * np.exp(-t / .012)) * env


def pluck(f, dur=.18):
    t = tt(dur + .2)
    s = np.zeros_like(t)
    for k in range(1, 9):
        s += (1 / k) * np.sin(2 * np.pi * k * f * t + rng.random()) * np.exp(-t * (10 + 7 * k))
    return s * np.minimum(1, t / .002)


def bass(f, dur):
    """staccato synth bass: a saw whose upper harmonics close quickly"""
    t = tt(dur + .05)
    s = np.zeros_like(t)
    for k in range(1, 10):
        s += ((-1) ** (k + 1) / k) * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (4 + 12 * (k - 1)))
    env = np.minimum(1, t / .003) * np.where(t < dur, 1, np.exp(-(t - dur) / .015))
    return s * env


def stab(freqs, dur=.11):
    """brass-ish chord stab: saws with a quick filter close and a short release"""
    t = tt(dur + .12)
    s = np.zeros_like(t)
    for f in freqs:
        for k in range(1, 8):
            s += (1 / k) * np.sin(2 * np.pi * k * f * (1 + .002 * rng.standard_normal()) * t) * np.exp(-t * (6 + 9 * k))
    env = np.minimum(1, t / .006) * np.where(t < dur, 1, np.exp(-(t - dur) / .04))
    return s * env / len(freqs)


def trem(freqs, dur):
    """string tremolo: soft saws, the bow moving on every 16th (10 Hz at 150 BPM)"""
    t = tt(dur + .15)
    s = np.zeros_like(t)
    for f in freqs:
        for k in range(1, 6):
            s += (1 / k ** 1.4) * np.sin(2 * np.pi * k * f * t + rng.random() * 6)
    am = .55 + .45 * np.abs(np.sin(np.pi * (BPM / 60 * 4) / 2 * t))
    env = np.minimum(1, t / .08) * np.where(t < dur, 1, np.exp(-(t - dur) / .06))
    return s * am * env / len(freqs)


def woodblock(f):
    t = tt(.08)
    return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * 2.71 * f * t)) * np.exp(-t / .018) * np.minimum(1, t / .0005)


def kick():
    t = tt(.3)
    f = 50 + 130 * np.exp(-t / .028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * np.exp(-t / .13) + .25 * np.exp(-t / .004) * rng.standard_normal(len(t)) * .3) * np.minimum(1, t / .001)


def tom(f):
    t = tt(.3)
    ff = f * (1 + .35 * np.exp(-t / .02))
    ph = 2 * np.pi * np.cumsum(ff) / SR
    return np.sin(ph) * np.exp(-t / .16) * np.minimum(1, t / .001)


def timp(f):
    """a low boom (timpani-ish) on the phrase downbeats"""
    t = tt(1.4)
    ff = f * (1 + .06 * np.exp(-t / .05))
    ph = 2 * np.pi * np.cumsum(ff) / SR
    return (np.sin(ph) + .3 * np.sin(2 * ph)) * np.exp(-t / .55) * np.minimum(1, t / .003)


BP_CLAP = butter(2, [900, 2600], btype='band', fs=SR, output='sos')
HP_HAT = butter(2, 7000, btype='high', fs=SR, output='sos')
BP_SN = butter(2, [1500, 6000], btype='band', fs=SR, output='sos')
HP_CR = butter(2, 4500, btype='high', fs=SR, output='sos')


def clap():
    t = tt(.24)
    n = rng.standard_normal(len(t))
    env = np.zeros_like(t)
    for d in (0, .01, .02):
        env += (t >= d) * np.exp(-np.clip(t - d, 0, None) / .008)
    env += (t >= .028) * np.exp(-np.clip(t - .028, 0, None) / .09) * .6
    return sosfilt(BP_CLAP, n * env) * 2.2


def hat(open_=False):
    t = tt(.25 if open_ else .05)
    return sosfilt(HP_HAT, rng.standard_normal(len(t))) * np.exp(-t / (.08 if open_ else .016))


def snare():
    t = tt(.18)
    body = np.sin(2 * np.pi * 210 * t) * np.exp(-t / .045)
    return sosfilt(BP_SN, rng.standard_normal(len(t))) * np.exp(-t / .065) * 1.6 + .5 * body


def crash():
    t = tt(1.5)
    return sosfilt(HP_CR, rng.standard_normal(len(t))) * np.exp(-t / .5) * np.minimum(1, t / .002)


def riser(dur):
    """a noise swell whose pitch climbs (four band layers fading in one after another) + a rising whistle"""
    t = tt(dur)
    s = np.zeros_like(t)
    for k, fc in enumerate((700, 1400, 2800, 5600)):
        sos = butter(2, [fc / 1.5, fc * 1.5], btype='band', fs=SR, output='sos')
        w = np.clip((t / dur - k * .2) / .45, 0, 1) ** 2
        s += sosfilt(sos, rng.standard_normal(len(t))) * w
    f = 300 * (8 ** (t / dur))
    s += .25 * np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / dur) ** 2
    return s * (t / dur) ** 1.5 * np.minimum(1, (dur - t) / .012)        # a 12 ms close: no click at the loop point


def chord_at(bar, beat):
    c = CHORDS[bar]
    return (c[0] if beat < 2 else c[1]) if isinstance(c, tuple) else c


WALK = ['E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'B2', 'C3']     # the chromatic walk-up in the E bars (8ths)

for bar in range(BARS):
    t0 = bar * 4 * BEAT
    B = bar >= 8
    fill = bar in (7, 15)
    stabs = bar in (4, 5, 6, 7, 12, 13, 14, 15)
    # lead: xylophone (+ a pluck an octave under in the B half, + a high double on the hook bars)
    for note, b, ln in MEL[bar]:
        f = hz(m(note))
        add(xylo(f, ln * BEAT), t0 + b * BEAT, pan=.12, gain=.34)
        if B:
            add(pluck(f / 2, .16), t0 + b * BEAT + .004, pan=-.25, gain=.14)
        if bar in (0, 4):
            add(xylo(f * 2, ln * BEAT), t0 + b * BEAT + .003, pan=.3, gain=.08)
    # bass: staccato 8ths (root, root, octave, root, fifth, root, octave, fifth); the E bars walk up chromatically
    for k in range(8):
        b = k * .5
        if CHORDS[bar] == 'E' and k >= 0 and bar in (3, 7, 9, 13, 15):
            f = hz(m(WALK[k]))
        else:
            root = m(TONES[chord_at(bar, b)][0] + '2')
            if root > m('G#2'):
                root -= 12
            f = hz(root + (0, 0, 12, 0, 7, 0, 12, 7)[k])
        add(bass(f, .19 * BEAT * 2), t0 + b * BEAT, gain=.30 if k % 2 == 0 else .22)
    # the clock: tick on the beat, tock on the off-beat (high / low woodblock)
    for k in range(4):
        add(woodblock(1750), t0 + k * BEAT, pan=.45, gain=.055)
        add(woodblock(1240), t0 + (k + .5) * BEAT, pan=-.45, gain=.04)
    # strings: tremolo chord tones under the first half of each phrase
    if bar % 8 < 4:
        tones = [hz(m(n + '4')) for n in TONES[chord_at(bar, 0)]]
        add(trem(tones, 4 * BEAT - .02), t0, pan=-.15, gain=.07)
    # brass stabs on the off-beats of 2 and 4 (bars 5–8, 13–16)
    if stabs:
        for b in (1.5, 3.5):
            tones = [hz(m(n + '4')) for n in TONES[chord_at(bar, b)]]
            add(stab(tones), t0 + b * BEAT, pan=.2, gain=.20)
    # drums: kick on 1, the "and" of 2 and on 3; clap + snare on 2 and 4; 8th hats, open hat before each bar
    for b in ((0, 1.5, 2) if fill else (0, 1.5, 2, 3.25 if bar % 2 else 2.75)):
        add(kick(), t0 + b * BEAT, gain=.62)
    for b in (1, 3):
        if fill and b == 3:
            continue
        add(clap(), t0 + b * BEAT, pan=.05, gain=.22)
        add(snare(), t0 + b * BEAT, pan=-.05, gain=.10)
    for k in range(8):
        add(hat(), t0 + k * BEAT / 2 + .002, pan=-.35, gain=.04 if k % 2 else .025)
    add(hat(True), t0 + 3.5 * BEAT, pan=.3, gain=.05)
    if bar in (0, 8):
        add(crash(), t0, pan=-.2, gain=.08)
        add(timp(hz(m('A1'))), t0, gain=.42)
    if bar == 4 or bar == 12:
        add(timp(hz(m('A1'))), t0, gain=.3)
    # fills: toms down the kit on beats 3–4 of bars 8 and 16, and a riser into the next phrase
    if fill:
        for k, f in enumerate((330, 330, 262, 262, 196, 196, 147, 147)):
            add(tom(f), t0 + 2 * BEAT + k * BEAT / 4, pan=.4 - k * .1, gain=.16 + .02 * k)
        add(riser(4 * BEAT), t0, pan=0, gain=.035 if bar == 7 else .05)

# a little room (short, so it stays punchy)
ir_t = np.arange(int(.9 * SR)) / SR
irL = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / .18); irR = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / .18)
irL[:int(.01 * SR)] = 0; irR[:int(.014 * SR)] = 0
irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
wetL = fftconvolve(L, irL)[:N]; wetR = fftconvolve(R, irR)[:N]
L2 = L + .14 * wetL; R2 = R + .14 * wetR

# seamless loop: fold everything after LOOP back onto the start
n = int(round(LOOP * SR))
outL = L2[:n].copy(); outR = R2[:n].copy()
tail = len(L2) - n
outL[:tail] += L2[n:]; outR[:tail] += R2[n:]
st = np.stack([outL, outR], 1)
st /= np.abs(st).max()
st = np.tanh(st * 1.6) / np.tanh(1.6)                      # gentle glue / limiting
st *= 10 ** (-17 / 20) / np.sqrt((st ** 2).mean())          # −17 dBFS RMS, like the title loop (audio.js MUSIC_GAIN)
st *= min(1, 10 ** (-1 / 20) / np.abs(st).max())
rms = 20 * np.log10(np.sqrt((st ** 2).mean())); peak = 20 * np.log10(np.abs(st).max())
seam = float(np.abs(st[0] - st[-1]).max())
print(f'loop {LOOP:.3f}s · {BPM} BPM · peak {peak:.1f} dBFS · rms {rms:.1f} dBFS · seam jump {seam:.4f}')

OUT_MP3.parent.mkdir(parents=True, exist_ok=True)
wav = ROOT / 'tools' / 'bgm_game_loop.wav'
pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
with wave.open(str(wav), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', '128k', str(OUT_MP3)], check=True)
wav.unlink()
OUT_JS.write_text('/* generated by tools/make_bgm_game.py — do not edit: the game-screen music loop (mp3, base64) */\n'
                  'window.CROCO_BGM_GAME = ' + json.dumps({'loop': round(LOOP, 5), 'bpm': BPM,
                                                           'data': base64.b64encode(OUT_MP3.read_bytes()).decode()}) + ';\n',
                  encoding='utf-8')
print('→', OUT_MP3.relative_to(ROOT), OUT_MP3.stat().st_size // 1024, 'KB ·', OUT_JS.relative_to(ROOT), OUT_JS.stat().st_size // 1024, 'KB')
