"""Original TITLE music for Croco Phonics — a JUNGLE groove (2026-11-22). The game-screen chase loop
(tools/make_bgm_game.py, A minor 150 BPM) stays.

Why a new one (user): the old title loop (F major, 132 BPM, steel drum over F–Dm–B♭–C, off-beat ukulele chops) shared
its chords bar for bar with Eye Catch and Toy Catch (I–vi–IV–V | IV–V–iii–vi) and its backing template with Magic Block
("croco와 Magic-Block도 비슷한거 아냐?"). Rule: "게임마다 게임에 맞게 음악이 좀 달라야해. 그리고 기본적으로 전체 음악은
신나야해." → "Croco 타이틀 → 정글 그루브".

Fit: the crocodile's jungle — a percussion-led groove: D major with a mixolydian C (D–C vamp), 126 BPM, 16 bars = 30.5 s.
Congas (tumbao), bongos in the B half, shaker 16ths, a son-clave woodblock, kick + surdo, a syncopated anticipating bass,
a kalimba arpeggio, a synth-brass section tune, samba-whistle calls at the phrase ends and a brass "CHOMP!" stab with a
jaw clack (bars 4 and 12). Chords: A = I–♭VII–I–♭VII | IV–V–I–V, B = ii–V–ii–V | IV–V–♭VII/IV–V.
Instruments, mixer and mastering: phonics-kit tools/bgm_engine.py (only the score lives here). Mastered to the old
title's loudness (-15.6 LUFS) so the title → game crossfade keeps its balance.
→ assets/audio/bgm.mp3 + js/bgm-data.js (window.CROCO_BGM, base64 — file:// plays it).

Run: /Users/jini/.local/bin/uv run --with numpy --with scipy --with pyloudnorm python tools/make_bgm.py
(The previous steel-drum loop is in git history: tools/make_bgm.py before 2026-11-22.)
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit/tools'))
import bgm_engine as E  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
mx = E.Mix(bpm=126, bars=16, seed_n=126)
CHORDS = ['D', 'C', 'D', 'C', 'G', 'A', 'D', 'A',
          'Em', 'A', 'Em', 'A', 'G', 'A', ('C', 'G'), 'A']
TONES = {'D': ['D', 'F#', 'A'], 'C': ['C', 'E', 'G'], 'G': ['G', 'B', 'D'], 'A': ['A', 'C#', 'E'], 'Em': ['E', 'G', 'B']}
R1 = [('A5', 0, .25), ('A5', .25, .25), ('F#5', .5, .5), ('A5', 1, .25), ('D6', 1.5, .5), ('E6', 2.5, .25), ('D6', 2.75, .25), ('A5', 3, .5), ('F#5', 3.5, .5)]
MEL = [
    R1,
    [('G5', 0, .25), ('G5', .25, .25), ('E5', .5, .5), ('G5', 1, .25), ('C6', 1.5, .5), ('D6', 2.5, .25), ('C6', 2.75, .25), ('G5', 3, .5), ('E5', 3.5, .5)],
    R1,
    [('G5', 0, .5), ('A5', .5, .5), ('C6', 1, .5), ('D6', 1.5, 1)],
    [('B5', 0, .25), ('B5', .25, .25), ('G5', .5, .5), ('B5', 1, .25), ('D6', 1.5, .5), ('E6', 2, .5), ('D6', 2.5, .5), ('B5', 3, 1)],
    [('C#6', 0, .25), ('C#6', .25, .25), ('A5', .5, .5), ('C#6', 1, .25), ('E6', 1.5, .5), ('F#6', 2, .5), ('E6', 2.5, .5), ('C#6', 3, 1)],
    [('D6', 0, .5), ('F#6', .5, .5), ('A6', 1, 1), ('F#6', 2, .5), ('D6', 2.5, .5), ('A5', 3, 1)],
    [('E6', 0, .5), ('C#6', .5, .5), ('A5', 1, .5), ('E5', 1.5, .5)],
    [('E5', 0, .5), ('G5', .5, .5), ('B5', 1, .5), ('D6', 2, .25), ('E6', 2.25, .25), ('D6', 2.5, .5), ('B5', 3, 1)],
    [('C#6', 0, .5), ('E6', .5, .5), ('A5', 1, .5), ('G5', 2, .25), ('A5', 2.25, .25), ('C#6', 2.5, .5), ('E6', 3, 1)],
    [('B5', 0, .5), ('E6', .5, .5), ('G6', 1, .5), ('F#6', 2, .25), ('E6', 2.25, .25), ('D6', 2.5, .5), ('B5', 3, 1)],
    [('A5', 0, .5), ('C#6', .5, .5), ('E6', 1, 1), ('E6', 3, .5), ('F#6', 3.5, .5)],
    [('G6', 0, .75), ('F#6', .75, .25), ('E6', 1, .5), ('D6', 1.5, .5), ('B5', 2, .5), ('D6', 2.5, .5), ('G6', 3, 1)],
    [('A6', 0, .75), ('G6', .75, .25), ('F#6', 1, .5), ('E6', 1.5, .5), ('C#6', 2, .5), ('E6', 2.5, .5), ('A6', 3, 1)],
    [('G6', 0, .5), ('E6', .5, .5), ('C6', 1, .5), ('E6', 1.5, .5), ('D6', 2, .5), ('B5', 2.5, .5), ('G5', 3, .5), ('B5', 3.5, .5)],
    [('A5', 0, .5), ('C#6', .5, .5), ('E6', 1, .5)],
]
CHOMP = {3: 3.5, 11: 2.5}               # bar → beat: brass "CHOMP!" + jaw clack
WHISTLE = (7, 15)                       # samba-whistle calls in the last beats
CLAVE = [(0, 0), (0, 1.5), (0, 3), (1, 1), (1, 2)]   # son clave 3-2 over two bars
assert len(MEL) == len(CHORDS) == mx.bars


def root_of(c):
    r = E.midi(TONES[c][0] + '2')
    return r - 12 if r > E.midi('F#2') else r


for bar in range(mx.bars):
    B = bar >= 8
    brk = bar in WHISTLE
    for note, b, ln in MEL[bar]:                                     # brass section an octave under the written tune
        f = E.hz(note) / 2
        d = ln * mx.beat * .9
        mx.add(E.brass(f, d, bright=1.3), mx.at(bar, b), pan=.15, gain=.15, send=.2)
        mx.add(E.brass(f * 1.5 if ln <= .25 else f / 2, d, bright=.8), mx.at(bar, b) + .006, pan=-.2, gain=.04 if ln <= .25 else .06, send=.2)
        if B:
            mx.add(E.kalimba(2 * f, d), mx.at(bar, b) + .003, pan=-.35, gain=.06, send=.25)
    for k in range(8):                                               # kalimba arpeggio (A) / off-beat chords (B)
        tones = TONES[E.chord_at(CHORDS, bar, k / 2)]
        if B and k % 2 == 1:
            for i, n in enumerate(tones):
                mx.add(E.kalimba(E.hz(n + '4'), .2), mx.at(bar, k / 2) + i * .005, pan=-.4, gain=.05, send=.2)
        elif not B:
            n = [0, 1, 2, 1, 2, 0, 1, 2][k]
            mx.add(E.kalimba(E.hz(tones[n] + ('5' if k == 4 else '4')), .3), mx.at(bar, k / 2), pan=-.4, gain=.08, send=.25)
    # bass: root, fifth, root, then the next chord's root anticipated on the last 8th
    r, nxt = root_of(E.chord_at(CHORDS, bar, 0)), root_of(E.chord_at(CHORDS, bar + 1, 0))
    r2 = root_of(E.chord_at(CHORDS, bar, 2))
    for b, n, ln in ((0, r, .7), (1.5, r + 7, .45), (2.5, r2, .45), (3.5, nxt, .5)):
        mx.add(E.bass(E.hz(n), ln * mx.beat, body=.35), mx.at(bar, b), gain=.4)
    # percussion
    for b, kind, f in ((0, 'mute', 330), (1, 'slap', 330), (2, 'mute', 330), (2.5, 'open', 330), (3, 'open', 330),
                       (3.5, 'open', 220), (3.75, 'open', 220)):
        if brk and b >= 2:
            continue
        mx.add(E.conga(kind, f), mx.at(bar, b), pan=-.3 if f > 300 else .3, gain=.22)
    if B:
        for k in range(8):
            mx.add(E.bongo(520 if k % 2 == 0 else 360), mx.at(bar, k / 2), pan=.45, gain=.12)
    for k in range(16):
        mx.add(E.shaker(), mx.at(bar, k / 4), pan=.4, gain=.05 if k % 4 == 2 else .03)
    for cb, b in CLAVE:
        if bar % 2 == cb:
            mx.add(E.woodblock(1100), mx.at(bar, b), pan=-.1, gain=.12, send=.1)
    for b in ((0, 1, 2, 3) if B else (0, 2.5)):
        mx.add(E.kick(), mx.at(bar, b), gain=.5)
    for b in (1, 3):
        if not (brk and b == 3):
            mx.add(E.surdo(), mx.at(bar, b), gain=.35 if B else .25)
            if B:
                mx.add(E.clap(), mx.at(bar, b) + .004, pan=.05, gain=.13, send=.15)
    if bar in CHOMP:
        b = CHOMP[bar]
        for n in TONES[E.chord_at(CHORDS, bar, b)]:
            mx.add(E.brass(E.hz(n + '4'), .3 * mx.beat, bright=1.5), mx.at(bar, b), gain=.08, send=.2)
        mx.add(E.woodblock(700), mx.at(bar, b) + .01, gain=.2)
        mx.add(E.woodblock(520), mx.at(bar, b) + .07, gain=.16)
    if brk:                                                          # whistle calls + conga break into the next bar
        mx.add(E.whistle(2600, .5 * mx.beat, trill=True), mx.at(bar, 2), pan=.2, gain=.05, send=.2)
        for b in (3, 3.5):
            mx.add(E.whistle(2600, .2 * mx.beat), mx.at(bar, b), pan=.2, gain=.05, send=.2)
        for k in range(4):
            mx.add(E.conga('slap' if k % 2 else 'open', 330 if k < 2 else 220), mx.at(bar, 2 + k / 4), gain=.2)
        for n in TONES[E.chord_at(CHORDS, bar + 1, 0)]:
            mx.add(E.brass(E.hz(n + '4'), .45 * mx.beat), mx.at(bar, 3.5), gain=.07, send=.2)
    if bar in (0, 8):
        mx.add(E.crash(), mx.at(bar, 0), pan=-.2, gain=.07, send=.1)

st = mx.render(lufs=-15.6)
E.write(st, mx, ROOT / 'assets' / 'audio' / 'bgm.mp3', ROOT / 'js' / 'bgm-data.js', 'CROCO_BGM',
        'generated by tools/make_bgm.py — do not edit: the background music loop (mp3, base64)')
