/* Croco Phonics — sound: pre-made voice clips (company TTS boy voice + the official FPR K /m/ recording),
 * synthesized effects, a small looping tune, and a microphone "did they say it?" voice detector.
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
      case 'drum': for (let i = 0; i < 9; i++) noise(t + i * 0.055, 0.05, 0.14 + i * 0.035, 160, 1, 'lowpass'); break;
      case 'alarm': for (let i = 0; i < 3; i++) osc('square', 700, 470, t + i * 0.2, 0.16, 0.1); break;
      case 'chomp':
        osc('sine', 170, 42, t, 0.38, 0.95); noise(t, 0.13, 0.65, 1700, 0.8); osc('square', 240, 70, t, 0.11, 0.22);
        break;
      case 'boing': osc('sine', 220, 560, t, 0.22, 0.4); osc('sine', 560, 280, t + 0.12, 0.3, 0.22); break;
      case 'fanfare':
        [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.42], [784, 0.62], [1047, 0.74]].forEach(([f, d]) => {
          osc('triangle', f, 0, t + d, 0.32, 0.28); osc('sine', f * 2, 0, t + d, 0.2, 0.06);
        });
        break;
      default: break;
    }
  };

  // ── a light looping tune (pentatonic marimba + bass + shaker), ducked under voice, muted while listening ──
  const BPM = 108, STEP = 60 / BPM / 2;
  const MEL = [72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 74, 76, 79, 0, 81, 0, 79, 0, 76, 0, 74, 72, 74, 0, 76, 0, 74, 0, 72, 0, 0, 0];
  const BASS = [48, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0, 48, 0, 0, 0, 43, 0, 48, 0];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function pluck(f, t, dur, peak) {
    const o = A.ctx.createOscillator(), o2 = A.ctx.createOscillator(), g = A.ctx.createGain(), g2 = A.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 4;
    g2.gain.value = 0.12;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(A.bgm);
    env(g, t, 0.004, dur, peak);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function step(i, t) {
    if (MEL[i]) pluck(mtof(MEL[i]), t, 0.32, 0.32);
    if (BASS[i]) {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(BASS[i]);
      env(g, t, 0.01, 0.42, 0.5);
      o.connect(g); g.connect(A.bgm); o.start(t); o.stop(t + 0.5);
    }
    if (i % 2 === 1) {
      const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
      if (!noiseBuf) noise(t, 0.001, 0.0002, 1000, 1);
      s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 6000;
      env(g, t, 0.003, 0.05, 0.12);
      s.connect(f); f.connect(g); g.connect(A.bgm); s.start(t, Math.random() * 0.5, 0.08);
    }
  }
  A.startBgm = function (level) {
    if (!A.ctx) return;
    if (level != null) A.bgmLevel = level;
    A.bgmOn = true; duck();
    if (A.seq) return;
    let i = 0, next = A.ctx.currentTime + 0.15;
    A.seq = setInterval(() => {
      if (!A.ctx) return;
      while (next < A.ctx.currentTime + 0.3) { step(i, next); i = (i + 1) % MEL.length; next += STEP; }
    }, 70);
  };
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
  /* resolves true (voice heard), false (nothing heard), null (no microphone) */
  Mic.listen = function ({ maxMs = 5000, onLevel, cancel } = {}) {
    return new Promise(res => {
      if (window.__test && window.__test.heard != null) {               // QA hook: scripted answer
        const v = window.__test.heard;
        return setTimeout(() => res(v), 500);
      }
      if (Mic.state !== 'on' || (window.__test && window.__test.mic === false)) return res(null);
      A.listening = true; duck();
      const t0 = performance.now();
      let floor = 0, nCal = 0, voiced = 0, heardAt = 0, lastVoice = 0, finished = false;
      const done = v => { if (finished) return; finished = true; A.listening = false; duck(); if (onLevel) onLevel(0); res(v); };
      const tick = () => {
        if (finished) return;
        if (cancel && cancel()) return done(false);
        const now = performance.now(), lv = Mic.level();
        if (now - t0 < 280) { floor += lv; nCal++; if (onLevel) onLevel(0); requestAnimationFrame(tick); return; }
        const thr = Math.max(0.016, (floor / Math.max(1, nCal)) * 3.2);
        if (onLevel) onLevel(Math.min(1, lv / (thr * 2.5)));
        if (lv > thr) { voiced++; lastVoice = now; if (!heardAt && voiced >= 8) heardAt = now; }
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
