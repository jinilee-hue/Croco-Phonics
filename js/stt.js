/* Croco Phonics (copied from Eye Catch, 2026-11-22) — on-device speech recognition (whisper tiny.en on ONNX Runtime
 * WASM in a worker): the BACKUP judge. The company phonics-api judges first when this device has a key
 * (js/phonics-api.js, game.js judgeWord); this one when it can't (no key, offline, busy, a failed call).
 * The worker is Phonics Match's built sttWorker (js/stt-worker.js; source: Phonics-Match src/core/sttWorker.ts +
 * sttCheck.ts): it loads the model from ./stt/models and the runtime from ./stt/ort — nothing comes from outside and
 * the child's audio never leaves the page. Needs http(s): from file:// there is no worker (state 'error'), and without
 * a key the say turn is skipped with no card.
 *
 * judge(pcm16k, target, rivals) -> 'ok' | 'wrong' | 'unclear' | null (no recogniser, or its check failed / timed out:
 *   can't judge — the game skips the word with no card, phonics-kit README rule 5)
 *   ok      = the target word itself is in what it heard (said(): the word, or a SAME spelling of it)
 *   wrong   = it heard another word of the level (exactly, or that word clearly beats the target)
 *   unclear = speech, but neither
 */
(function () {
  'use strict';
  const STT = { state: 'off', progress: 0, last: null };
  let worker = null, seq = 0;
  const waiting = new Map(), readyFns = [];

  STT.preload = function () {
    if (worker || STT.state === 'error') return;
    if (location.protocol === 'file:' || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') { STT.state = 'error'; return; }
    try { worker = new Worker('js/stt-worker.js', { type: 'module' }); } catch (e) { STT.state = 'error'; return; }
    STT.state = 'loading';
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'ready') { STT.state = 'ready'; readyFns.splice(0).forEach(f => f(true)); }
      else if (d.type === 'error') { STT.state = 'error'; console.warn('stt load failed', d.error); readyFns.splice(0).forEach(f => f(false)); }
      else if (d.type === 'progress') { STT.progress = d.total ? d.loaded / d.total : 0; }
      else if (d.type === 'checked') { const f = waiting.get(d.id); waiting.delete(d.id); f && f(d.error ? null : d.r); }
    };
    worker.onerror = (e) => { STT.state = 'error'; console.warn('stt worker', e.message); readyFns.splice(0).forEach(f => f(false)); };
    worker.postMessage({ type: 'load', base: new URL('./', location.href).href, model: 'onnx-community/whisper-tiny.en' });
  };
  STT.whenReady = function (ms) {
    if (STT.state === 'ready') return Promise.resolve(true);
    if (STT.state !== 'loading') return Promise.resolve(false);
    return new Promise(res => { const t = setTimeout(() => res(false), ms); readyFns.push(ok => { clearTimeout(t); res(ok); }); });
  };
  function check(audio, target, alts, rivals, ms = 12000) {
    if (!worker || STT.state !== 'ready') return Promise.resolve(null);
    const id = ++seq, a = new Float32Array(audio);
    return new Promise(res => {
      waiting.set(id, res);
      worker.postMessage({ type: 'check', id, audio: a, target, alts, rivals }, [a.buffer]);
      setTimeout(() => { if (waiting.delete(id)) res(null); }, ms);
    });
  }
  const words = s => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []);
  // other spellings of the SAME sounds (plurals, true homophones, numerals) — never a different word. Level 1 = Eye Catch's.
  // Checked with every level word's own clip (scratch stt_words.py): 'Aunt.' (ant), '7.' (seven), '10.' (ten), '4.' (four),
  // 'Inc.' (ink) came back for the right word.
  const SAME = { meat: ['meet'], mitt: ['mit', 'mitts'], mouse: ['mouses'], man: ['men'], mail: ['mails', 'male'], mask: ['masks'], mat: ['mats', 'matt'], match: ['matches'], mice: [], mouth: ['mouths'], monkey: ['monkeys'], mushroom: ['mushrooms'], mirror: ['mirrors'], moon: ['moons'], milk: ['milks'], mug: ['mugs', 'muck', 'mugg'], map: ['maps'], mop: ['mops'],
    ant: ['ants', 'aunt'], apple: ['apples'], bag: ['bags'], cap: ['caps'], cat: ['cats'], fan: ['fans'], hat: ['hats'], van: ['vans'],
    seal: ['seals'], see: ['sea'], seven: ['7'], sink: ['sinks'], sock: ['socks'], spoon: ['spoons'], sun: ['son', 'suns'],
    tail: ['tails', 'tale'], ten: ['10'], tent: ['tents'], tie: ['ties'], toe: ['toes', 'tow'], toy: ['toys'], turkey: ['turkeys'], turtle: ['turtles'],
    paint: ['paints'], pencil: ['pencils'], pie: ['pies', 'pi'], pillow: ['pillows'], pop: ['pops'], pot: ['pots'],
    nail: ['nails'], nap: ['naps'], nest: ['nests'], net: ['nets'], nose: ['noses', 'knows'], nut: ['nuts'],
    ink: ['inc'], pin: ['pins'], pit: ['pits'],
    cake: ['cakes'], comb: ['combs'], cook: ['cooks'], cow: ['cows'], cup: ['cups'],
    face: ['faces'], fire: ['fires'], fork: ['forks'], four: ['4', 'for'],
    dog: ['dogs'], doll: ['dolls'], door: ['doors'], duck: ['ducks'] };
  // a compound may come back split ("Pop corn."): two words heard side by side count as one
  const said = (w, text) => {
    const ws = words(text), all = ws.concat(ws.slice(1).map((x, i) => ws[i] + x));
    return all.includes(w) || (SAME[w] || []).some(x => all.includes(x));
  };

  STT.judge = async function (pcm16k, target, rivals) {
    if (STT.state === 'loading') await STT.whenReady(8000);   // still loading: ~8 s at most, then can't judge
    if (STT.state !== 'ready') return null;
    const r = await check(pcm16k, target, SAME[target] || [], rivals);
    STT.last = r && { target, ...r };
    if (!r) return null;                                 // the check failed: can't judge (not 'unclear')
    if (said(target, r.text)) return 'ok';
    const other = rivals.find(w => said(w, r.text));
    if (other) return 'wrong';
    // a hum ("Mmm…") is not a word: whisper scores it close to the short m-words (mop, mouse)
    if (/^\s*(h?m+|um+)[\s,.!?]*$/i.test(r.text || '')) return 'unclear';
    // 'ok' ONLY when the word itself was heard (said() above). The score rules that passed the best-scoring picture are
    // gone: every picture starts with m, so an "Mmm", a hum or a 'you' scored the target best and won the card (user
    // 2026-11-22: "잘못말해도 카드가 획득되는데?", "말을 해야 카드를 획득할수 있는거잖아"; a 220 Hz hum heard as 'you' passed
    // for moon). Scores still decide 'wrong' (another picture, clearly) below.
    const best = Object.entries(r.rv || {}).sort((a, b) => b[1] - a[1])[0];
    if (best && r.pNo < 0.35 && best[1] > r.sT + 2 && best[1] > -7.5) return 'wrong';     // another picture, clearly
    return 'unclear';
  };
  window.STT = STT;
})();
