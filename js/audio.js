/* Croco Phonics — sound: pre-made voice clips (company TTS boy voice + the official FPR K /m/ recording),
 * synthesized effects, two music loops (the title's tools/make_bgm.py, the game's tools/make_bgm_game.py) with a round's
 * tension (tempo + heartbeat), and a microphone "did they say it?" voice detector.
 * No device speechSynthesis (the user rejected it: the voice differs per device).
 * Clips play from base64 (js/voice-data.js) so the game also works when index.html is opened from disk.
 */
(function () {
  'use strict';
  const V = window.CROCO_VOICE || { clips: {} }, VD = window.CROCO_VOICE_DATA || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const A = {
    ctx: null, master: null, sfx: null, voice: null, bgm: null, muted: false, buffers: {}, playing: new Set(),
    talking: 0, listening: false, bgmOn: false, bgmLevel: 0.12,
  };
  try { A.muted = localStorage.getItem('croco-muted') === '1'; } catch (e) { /* private mode */ }

  A.has = key => !!V.clips[key];
  /* language (game.js EN | 한): 't:x' plays the Korean take 'k:x' when there is one, else the English line */
  A.lang = 'en';
  A.voiceKey = key => (A.lang === 'ko' && key.startsWith('t:') && V.clips['k:' + key.slice(2)]) ? 'k:' + key.slice(2) : key;
  A.unlock = function () {
    if (!A.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      A.ctx = new C();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 1;
      A.master.connect(A.ctx.destination);
      A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.5; A.sfx.connect(A.master);
      A.voice = A.ctx.createGain(); A.voice.gain.value = 1; A.voice.connect(A.master);
      A.bgm = A.ctx.createGain(); A.bgm.gain.value = 0; A.bgm.connect(A.master);
      Object.keys(V.clips).forEach(decode);
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
  };

  function b64(b) {
    const bin = atob(b), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function decode(key) {
    if (A.buffers[key]) return A.buffers[key];
    const d = VD[key];
    const p = d ? A.ctx.decodeAudioData(b64(d))
      : fetch('assets/voice/' + V.clips[key][0]).then(r => r.arrayBuffer()).then(x => A.ctx.decodeAudioData(x));
    A.buffers[key] = p.catch(e => { console.warn('voice', key, e); return null; });
    return A.buffers[key];
  }

  /* one clip → resolves true when it ends (false if stopped / missing) */
  A.say = async function (key, opts = {}) {
    key = A.voiceKey(key);
    if (!A.ctx || !V.clips[key]) return false;
    const buf = await decode(key);
    if (!buf) return false;
    const [, start, gain, dur] = V.clips[key];
    return new Promise(res => {
      const src = A.ctx.createBufferSource();
      src.buffer = buf;
      const g = A.ctx.createGain();
      g.gain.value = gain * (opts.gain || 1);
      src.connect(g); g.connect(A.voice);
      const item = { src, res };
      A.playing.add(item);
      talk(+1);
      src.onended = () => { if (A.playing.delete(item)) { talk(-1); res(true); } };
      src.start(0, start, Math.max(0.05, dur));
    });
  };
  A.stopVoice = function () {
    for (const it of A.playing) {
      try { it.src.onended = null; it.src.stop(); } catch (e) { /* already stopped */ }
      talk(-1); it.res(false);
    }
    A.playing.clear();
  };
  function talk(d) { A.talking = Math.max(0, A.talking + d); duck(); }
  function duck() {
    if (!A.bgm) return;
    const t = A.ctx.currentTime;
    const v = A.bgmOn ? (A.listening ? 0 : A.talking ? 0.3 : 1) * A.bgmLevel : 0;
    A.bgm.gain.cancelScheduledValues(t);
    A.bgm.gain.setTargetAtTime(v, t, 0.12);
  }
  A.setMuted = function (m) {
    A.muted = m;
    try { localStorage.setItem('croco-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 1, A.ctx.currentTime, 0.03);
  };

  // ── synthesized effects ────────────────────────────────────────────────────────────────────────────
  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f0, f1, t, dur, peak, dest) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.006, dur, peak);
    o.connect(g); g.connect(dest || A.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  /* a brassy note: a saw through a lowpass that opens on the attack and closes as it dies */
  function brass(f0, f1, t, dur, peak) {
    const o = A.ctx.createOscillator(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.type = 'lowpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.035);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    env(g, t, 0.01, dur, peak);
    o.connect(f); f.connect(g); g.connect(A.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(t, dur, peak, freq, q, type) {
    if (!noiseBuf) {
      noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    s.buffer = noiseBuf;
    f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    env(g, t, 0.004, dur, peak);
    s.connect(f); f.connect(g); g.connect(A.sfx);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  A.sfxPlay = function (name) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + 0.01;
    switch (name) {
      case 'tap': osc('triangle', 520, 260, t, 0.09, 0.5); noise(t, 0.05, 0.25, 2400, 2); break;
      case 'tick': osc('square', 1500, 0, t, 0.035, 0.07); break;
      case 'pop': osc('sine', 320, 980, t, 0.13, 0.55); break;
      case 'sparkle': [0, 0.06, 0.12, 0.2].forEach((d, i) => osc('sine', 1300 + i * 280, 2500 + i * 300, t + d, 0.2, 0.15)); break;
      case 'whoosh': noise(t, 0.38, 0.22, 800, 0.6); break;
      case 'card': osc('sine', 700, 1300, t, 0.1, 0.18); noise(t, 0.08, 0.1, 3200, 1); break;
      case 'ding': osc('sine', 880, 0, t, 0.5, 0.3); osc('sine', 1320, 0, t + 0.09, 0.6, 0.25); break;
      case 'great': [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, 0, t + i * 0.08, 0.35, 0.26)); break;
      // a pressed tooth deciding: snare strokes getting louder over a low tom rumble (user: "좀더 신나고 긴장감 넘치는 … 효과음")
      case 'drum':
        for (let i = 0; i < 12; i++) noise(t + i * 0.045, 0.04, 0.05 + i * 0.02, 2000, 1.1);
        for (let i = 0; i < 6; i++) osc('sine', 125, 80, t + i * 0.09, 0.09, 0.1 + i * 0.03);
        break;
      // the trap tooth: dun-dun-DUUN, low brass (a fifth over the root), the last one long and sagging
      case 'alarm':
        [[0, 0.17, 146.8], [0.24, 0.17, 146.8], [0.5, 0.8, 138.6]].forEach(([d, len, f], k) => {
          const sag = k === 2 ? 0.92 : 0;
          brass(f, sag && f * sag, t + d, len, 0.2); brass(f * 1.5, sag && f * 1.5 * sag, t + d, len, 0.1);
          osc('square', f / 2, sag && f / 2 * sag, t + d, len, 0.08);
          osc('sine', 70, 45, t + d, 0.25, k === 2 ? 0.6 : 0.4);
        });
        break;
      // SNAP: a sharp click, a deep thud, a crunch and a quick drop
      case 'chomp':
        noise(t, 0.04, 0.9, 4200, 0.8, 'highpass');
        osc('sine', 190, 38, t, 0.45, 1.0); noise(t + 0.008, 0.16, 0.6, 1100, 0.9);
        osc('square', 260, 60, t, 0.12, 0.22); osc('triangle', 600, 140, t + 0.015, 0.22, 0.2);
        break;
      case 'heart': osc('sine', 78, 46, t, 0.13, 0.5); osc('sine', 70, 42, t + 0.16, 0.11, 0.35); break;
      // the croc's snort (steam from its nostrils): two breathy huffs
      case 'huff': noise(t, 0.24, 0.3, 1200, 0.6); noise(t + 0.33, 0.22, 0.24, 1000, 0.6); break;
      case 'boing': osc('sine', 220, 560, t, 0.22, 0.4); osc('sine', 560, 280, t + 0.12, 0.3, 0.22); break;
      // the win: drum hits, a brass run up to a held chord, a crash and a sparkle on top
      case 'fanfare':
        osc('sine', 120, 45, t, 0.3, 0.7); noise(t, 0.7, 0.15, 6500, 0.6, 'highpass');
        [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.36]].forEach(([f, d]) => { brass(f, 0, t + d, 0.22, 0.09); osc('triangle', f, 0, t + d, 0.3, 0.22); });
        [523, 659, 784, 1047].forEach(f => { brass(f, 0, t + 0.52, 1.0, 0.06); osc('triangle', f, 0, t + 0.52, 1.0, 0.1); });
        osc('sine', 120, 45, t + 0.52, 0.3, 0.6); noise(t + 0.52, 1.2, 0.2, 6500, 0.6, 'highpass');
        [0.62, 0.72, 0.82, 0.92].forEach((d, i) => osc('sine', 1568 + i * 220, 0, t + d, 0.28, 0.07));
        break;
      default: break;
    }
  };

  // ── music: two original loops, mastered alike (−17 dBFS RMS; MUSIC_GAIN puts them where the old live tune sat in the
  //    mix, −23 dBFS at level 1, plus 1 dB): the title's sunny one (tools/make_bgm.py: steel drum, F major, 132 BPM;
  //    user: "배경음악 좀더 신나는걸로") and the game's exciting-and-tense one (tools/make_bgm_game.py: a ticking clock,
  //    xylophone, A minor, 150 BPM; user: "악어게임 좀더 신나고 긴장감 넘치는 음악"). A.setTrack crossfades (the new one
  //    starts from its top). Ducked under voice, muted while listening. Played from base64 (js/bgm-data.js,
  //    js/bgm-game-data.js) so they also play when index.html is opened from disk.
  const MUSIC = { title: window.CROCO_BGM || null, game: window.CROCO_BGM_GAME || null }, MUSIC_GAIN = 0.56;
  const bufs = {}, live = {};                   // decoded buffers (promises); the playing track(s): name → { src, g }
  let want = 'title', tension = 0, heartTimer = 0;
  function playTrack(name) {
    const now = A.ctx.currentTime;
    for (const n of Object.keys(live)) {          // fade the other one out
      if (n === name) continue;
      const tk = live[n];
      delete live[n];
      tk.dead = true;
      if (tk.src) { tk.g.gain.cancelScheduledValues(now); tk.g.gain.setTargetAtTime(0, now, 0.22); try { tk.src.stop(now + 1.4); } catch (e) { /* stopped */ } }
    }
    if (live[name] || !MUSIC[name]) return;
    const tk = live[name] = {};
    if (!bufs[name]) bufs[name] = A.ctx.decodeAudioData(b64(MUSIC[name].data)).catch(e => { console.warn('music', e); delete bufs[name]; return null; });
    bufs[name].then(buf => {
      if (!buf || tk.dead) return;
      const s = A.ctx.createBufferSource(), g = A.ctx.createGain(), t = A.ctx.currentTime;
      s.buffer = buf; s.loop = true; s.loopStart = 0; s.loopEnd = Math.min(buf.duration, MUSIC[name].loop);  // mp3 pads its last frame
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(MUSIC_GAIN, t + 0.35);
      s.connect(g); g.connect(A.bgm); s.start(t);
      tk.src = s; tk.g = g;
      rate();
    });
  }
  A.startBgm = function (level) {
    if (!A.ctx) return;
    if (level != null) A.bgmLevel = level;
    A.bgmOn = true; duck();
    playTrack(want);
  };
  A.setTrack = function (name) {
    if (!MUSIC[name]) name = 'title';
    if (name === want) return;
    want = name;
    if (A.ctx && A.bgmOn) playTrack(name);
  };
  A.track = () => Object.keys(live).find(n => live[n].src) || null;
  /* a round's tension 0…1 (game.js: the share of safe teeth pressed): the game loop speeds up to +7 %, and from 0.5 a
     heartbeat comes in, faster and louder toward the end. Silent while the mic listens (it must never count as the
     player's voice) and with the music off. 0 = calm. */
  function rate() {
    const tk = live.game;
    if (tk && tk.src) tk.src.playbackRate.setTargetAtTime(1 + 0.07 * tension, A.ctx.currentTime, 0.8);
  }
  function heart() {
    clearTimeout(heartTimer);
    if (!A.ctx || tension < 0.5) return;
    if (!A.listening && A.bgmOn && !A.muted) {
      const t = A.ctx.currentTime + 0.01, v = 0.22 + 0.4 * (tension - 0.5);
      osc('sine', 78, 46, t, 0.13, v); osc('sine', 70, 42, t + 0.16, 0.11, v * 0.7);
    }
    heartTimer = setTimeout(heart, 780 - 300 * tension);
  }
  A.setTension = function (k) {
    const was = tension;
    tension = Math.max(0, Math.min(1, k || 0));
    if (!A.ctx) return;
    rate();
    if (tension >= 0.5 && was < 0.5) heart();
    if (tension < 0.5) clearTimeout(heartTimer);
  };
  A.tension = () => tension;
  A.stopBgm = function () { A.bgmOn = false; duck(); };
  A.setBgmLevel = function (v) { A.bgmLevel = v; duck(); };

  // ── microphone: "did they say something?" (voice activity, not word recognition) ─────────────────────
  const Mic = { state: 'off', stream: null, an: null, buf: null };
  Mic.init = async function () {
    if (Mic.state === 'on') return true;
    if (Mic.state === 'asking') { while (Mic.state === 'asking') await sleep(100); return Mic.state === 'on'; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { Mic.state = 'none'; return false; }
    Mic.state = 'asking';
    try {
      Mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
      A.unlock();
      const src = A.ctx.createMediaStreamSource(Mic.stream);
      Mic.an = A.ctx.createAnalyser();
      Mic.an.fftSize = 1024;
      src.connect(Mic.an);
      Mic.buf = new Float32Array(Mic.an.fftSize);
      Mic.state = 'on';
      return true;
    } catch (e) {
      Mic.state = 'denied';
      return false;
    }
  };
  Mic.level = function () {
    if (!Mic.an) return 0;
    Mic.an.getFloatTimeDomainData(Mic.buf);
    let s = 0;
    for (let i = 0; i < Mic.buf.length; i++) s += Mic.buf[i] * Mic.buf[i];
    return Math.sqrt(s / Mic.buf.length);
  };
  /* resolves true (voice heard), false (nothing heard), null (no microphone). A voice = ~150 ms of sound above the
     room's level within one stretch (gaps under 160 ms): clicks, knocks or beats spread over the wait no longer add up
     to one (user: "단어를 읽지 않았는데 그냥 넘어가는 경우 없어야해") */
  Mic.ready = () => Mic.state === 'on' && !(window.__test && window.__test.mic === false);
  Mic.listen = function ({ maxMs = 5000, onLevel, cancel } = {}) {
    return new Promise(res => {
      if (window.__test && window.__test.heard != null) {               // QA hook: scripted answer(s), in order
        const h = window.__test.heard, v = Array.isArray(h) ? (h.length > 1 ? h.shift() : h[0]) : h;
        return setTimeout(() => res(v), 500);
      }
      if (!Mic.ready()) return res(null);
      A.listening = true; duck();
      const t0 = performance.now();
      let floor = 0, nCal = 0, run = 0, last = t0, heardAt = 0, lastVoice = 0, finished = false;
      const done = v => { if (finished) return; finished = true; A.listening = false; duck(); if (onLevel) onLevel(0); res(v); };
      const tick = () => {
        if (finished) return;
        if (cancel && cancel()) return done(false);
        const now = performance.now(), lv = Mic.level(), dt = Math.min(50, now - last);
        last = now;
        if (now - t0 < 280) { floor += lv; nCal++; if (onLevel) onLevel(0); requestAnimationFrame(tick); return; }
        const thr = Math.max(0.016, (floor / Math.max(1, nCal)) * 3.2);
        if (onLevel) onLevel(Math.min(1, lv / (thr * 2.5)));
        if (lv > thr) {
          if (now - lastVoice > 160) run = 0;
          run += dt; lastVoice = now;
          if (!heardAt && run >= 150) heardAt = now;
        }
        if (heardAt && (now - lastVoice > 450 || now - heardAt > 2200)) return done(true);
        if (now - t0 > maxMs) return done(!!heardAt);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  A.sleep = sleep;
  window.Sound = A;
  window.Mic = Mic;
})();
