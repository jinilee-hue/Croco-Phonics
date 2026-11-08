/* Croco Phonics — game flow.
 * Two players take turns pressing the crocodile's teeth. One m-word (FPR K Unit 1 · Lesson 1) is the target shown at
 * the top; every tooth hides one Lesson 1 m-word. A safe tooth pops its picture card out: the game says the sound
 * /m/ and the word, the player says it (mic voice check), the card goes to the player and the turn passes.
 * The tooth that hides the target word makes the croc CHOMP — that player loses, the other one wins.
 * Interaction beats follow the user's reference video (gemini_generated_video_46830cdd.mp4): card pops from the
 * pressed tooth with sparkles → floats by the presser's side → docks into the player's corner; the bad tooth glows
 * purple while the target card flashes red, then a purple burst and "Player N Wins!" with confetti.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const A = window.Sound, Mic = window.Mic;
  const DATA = window.CROCO_WORDS, WORDS = DATA.words, BY = Object.fromEntries(WORDS.map(w => [w.w, w]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cap = w => w[0].toUpperCase() + w.slice(1);
  const EDGES = ['#f6b043', '#86c3ec', '#94d38a', '#f59ab8', '#b9a2f0', '#f7c95c', '#7fd6c8'];
  const LETTER_C = ['#ff7fb0', '#ffb547', '#5fd0a4', '#58b8f2', '#a98bff', '#ff8a4c', '#f06292', '#4fc3f7'];
  const FRAME = { title: { y: 0.685, h: 0.56, el: 13 }, game: { y: 0.692, h: 0.53, el: 12 } };
  const portrait = () => window.innerWidth < window.innerHeight;
  const u = () => Math.min(window.innerHeight / 100, window.innerWidth * (portrait() ? 0.0095 : 0.0062));
  const SVG_SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5v5a1 1 0 0 0 1 1h3l4.4 3.7a.8.8 0 0 0 1.3-.6V5.4a.8.8 0 0 0-1.3-.6L7 8.5H4a1 1 0 0 0-1 1z"/><path d="M15.6 8.2a5 5 0 0 1 0 7.6M18.3 5.6a8.6 8.6 0 0 1 0 12.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const SVG_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0" fill="none" stroke="#ff7d2e" stroke-width="2.2" stroke-linecap="round"/><path d="M12 17.5V21" stroke="#ff7d2e" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const SVG_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
  const SVG_BITE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 9.2C4.5 5.6 19.5 5.6 21.4 9.2v1.1l-1.9 2.4-1.9-2.4-1.9 2.4-1.9-2.4-1.9 2.4-1.9-2.4-1.9 2.4-1.9-2.4-1.9 2.4-1.9-2.4z" fill="#fff"/><path d="M2.6 14.8c1.9 3.6 16.9 3.6 18.8 0v-1.1l-1.9-2.4-1.9 2.4-1.9-2.4-1.9 2.4-1.9-2.4-1.9 2.4-1.9-2.4-1.9 2.4-1.9-2.4-1.9 2.4z" fill="#ffe1e1"/></svg>';

  const G = { screen: 'title', token: 0, busy: true, target: null, lastTarget: null, teeth: [], pressed: new Set(), turn: 0, starter: 0, got: [[], []], idle: null, said: new Set() };

  // ── 3D stage ─────────────────────────────────────────────────────────────────────────────────────────
  Stage.init($('#gl'), { preserve: /[?&]shot\b/.test(location.search) });
  const croc = Croc.build(Stage.scene);
  Stage.setCroc(croc);
  Stage.setFrame(FRAME.title);
  Stage.start();
  requestAnimationFrame(() => requestAnimationFrame(() => $('#loading').classList.add('done')));
  if (document.fonts && document.fonts.load) document.fonts.load('700 100px "Baloo 2"').then(() => croc.refreshLetters()).catch(() => {});

  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const toothScreen = i => Stage.project(croc.toothWorld(i).add(V3(0, 0.22, 0)));
  const mouthScreen = () => Stage.project(V3(0, 1.45, 0.6));

  // ── cards ────────────────────────────────────────────────────────────────────────────────────────────
  let edgeN = 0;
  function makeCard(word, opts = {}) {
    const w = BY[word];
    const el = document.createElement('div');
    el.className = 'card' + (opts.cls ? ' ' + opts.cls : '') + (opts.sound ? ' has-snd' : '');
    el.style.setProperty('--edge', opts.edge || EDGES[edgeN++ % EDGES.length]);
    el.dataset.word = word;
    el.innerHTML = `<div class="pic"><img src="${w.card}" alt="" draggable="false"></div>`
      + `<div class="word"><b>${cap(word)[0]}</b>${word.slice(1)}</div>`
      + (opts.sound ? `<div class="snd" role="button" aria-label="Listen: ${word}"><span class="ltr">M</span><span class="ph">/m/</span>${SVG_SPK}</div>` : '')
      + (opts.mic ? `<div class="mic" aria-hidden="true">${SVG_MIC}</div><div class="ok" aria-hidden="true">${SVG_OK}</div>` : '');
    return el;
  }
  function placeDecor() {
    document.querySelectorAll('.deco [data-word]').forEach(slot => {
      slot.innerHTML = '';
      slot.appendChild(makeCard(slot.dataset.word, { edge: slot.classList.contains('fly-r') ? '#86c3ec' : slot.classList.contains('lay-l') ? '#b9a2f0' : slot.classList.contains('lay-r') ? '#f6b043' : '#f6b043' }));
    });
  }
  placeDecor();

  /* a card that flies on the overlay layer: returns { el, card, at(x,y,s,r) } with WAAPI moves */
  function flyer(card) {
    const el = document.createElement('div');
    el.className = 'flyer';
    el.appendChild(card);
    $('#cards').appendChild(el);
    const tf = (x, y, s, r) => `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${r}deg) scale(${s})`;
    const f = {
      el, card, x: 0, y: 0, s: 1, r: 0,
      set(x, y, s, r) { Object.assign(f, { x, y, s, r }); el.style.transform = tf(x, y, s, r); return f; },
      to(x, y, s, r, ms, ease) {
        const from = tf(f.x, f.y, f.s, f.r);
        Object.assign(f, { x, y, s, r });
        const an = el.animate([{ transform: from }, { transform: tf(x, y, s, r) }], { duration: ms, easing: ease || 'cubic-bezier(.2,.9,.25,1.2)', fill: 'forwards' });
        return an.finished.catch(() => {});
      },
    };
    return f;
  }
  function revealSlot(p) {
    const W = window.innerWidth, H = window.innerHeight, cw = 27 * u();
    if (portrait()) return { x: W / 2 + (p ? 1 : -1) * Math.min(W * 0.22, cw * 0.62), y: H * 0.42, r: p ? 6 : -6 };
    const left = Stage.project(V3(-1.55, 1.5, 0.4)).x, right = Stage.project(V3(1.55, 1.5, 0.4)).x;
    const x = p === 0 ? Math.max(cw * 0.5 + 2 * u(), Math.min(left - cw * 0.45, left * 0.52)) : Math.min(W - cw * 0.5 - 2 * u(), Math.max(right + cw * 0.45, right + (W - right) * 0.48));
    return { x, y: H * 0.47, r: p === 0 ? -6 : 6 };
  }
  function stackPoint(p) {
    const ava = document.querySelector(`.player.p${p + 1} .ava`).getBoundingClientRect();
    const dx = 2.2 * u() + 4.5 * u();
    return { x: p === 0 ? ava.right + dx : ava.left - dx, y: ava.top + ava.height * 0.45 };
  }
  function renderStack(p) {
    const st = document.querySelector(`.player.p${p + 1} .stack`);
    st.innerHTML = '';
    G.got[p].forEach((w, k) => {
      const m = document.createElement('div');
      m.className = 'mini';
      m.style.setProperty('--i', Math.min(k, 6));
      m.style.setProperty('--rot', ((k * 37) % 13) - 6);
      if (k < G.got[p].length - 1) m.style.animation = 'none';
      m.appendChild(makeCard(w, { edge: EDGES[k % EDGES.length] }));
      st.appendChild(m);
    });
    if (G.got[p].length) {
      const c = document.createElement('div');
      c.className = 'count';
      c.textContent = G.got[p].length;
      st.appendChild(c);
    }
  }

  // ── voice helpers ────────────────────────────────────────────────────────────────────────────────────
  const say = (key, minMs = 0) => Promise.all([A.say(key), sleep(minMs)]);
  async function sayWord(word, card, tok) {
    if (card) card.classList.add('say-m');
    await say('s:m', 900);
    if (card) card.classList.remove('say-m');
    if (tok !== G.token) return;
    await sleep(140);
    if (card) card.classList.add('say-w');
    await say('w:' + word, 700);
    if (card) setTimeout(() => card.classList.remove('say-w'), 250);
  }

  // ── round setup ──────────────────────────────────────────────────────────────────────────────────────
  function setTargetCard(word) {
    const t = $('#target');
    t.innerHTML = '';
    const card = makeCard(word, { cls: 'tgt', sound: true, edge: '#f5b54a' });
    const bite = document.createElement('div');
    bite.className = 'bite';
    bite.innerHTML = SVG_BITE;
    card.appendChild(bite);
    t.appendChild(card);
    return card;
  }
  async function startRound() {
    const tok = ++G.token;
    G.busy = true;
    clearIdle();
    A.stopVoice();
    $('#cards').innerHTML = '';
    document.querySelectorAll('.player').forEach(p => p.classList.remove('win', 'lose', 'on'));
    $('#turn').classList.remove('show');
    G.got = [[], []];
    renderStack(0); renderStack(1);
    const pool = WORDS.map(w => w.w);
    let target;
    do { target = pool[rand(pool.length)]; } while (pool.length > 1 && target === G.lastTarget);
    if (window.__test && window.__test.target) target = window.__test.target;
    G.lastTarget = target; G.target = target;
    const others = shuffle(pool.filter(w => w !== target)).slice(0, croc.N_TEETH - 1);
    G.teeth = shuffle([target, ...others]);
    if (window.__test && window.__test.teeth) G.teeth = window.__test.teeth.slice();
    G.pressed = new Set();
    for (let i = 0; i < croc.N_TEETH; i++) croc.glow(i, 0);
    croc.reopen();
    croc.resetTeeth(0.05);
    croc.tremble(0);
    const t = $('#target');
    t.classList.remove('alarm');
    t.classList.add('hidden');
    const card = setTargetCard(target);
    await sleep(450);
    if (tok !== G.token) return;
    // the target word comes in big, is said, then parks at the top
    t.classList.remove('hidden');
    t.classList.add('intro');
    A.sfxPlay('pop');
    await sleep(650);
    if (tok !== G.token) return;
    if (A.has('t:rule')) await say('t:rule');
    await sayWord(target, card, tok);
    if (tok !== G.token) return;
    croc.setOpen(0.18);                         // a warning snap: this word bites!
    A.sfxPlay('chomp');
    card.querySelector('.bite').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5) rotate(-12deg)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out' });
    await sleep(300);
    croc.setOpen(1);
    await sleep(450);
    if (tok !== G.token) return;
    t.classList.remove('intro');
    A.sfxPlay('whoosh');
    await sleep(650);
    if (tok !== G.token) return;
    setTurn(G.starter);
  }

  function setTurn(p) {
    G.turn = p;
    app.dataset.turn = p;
    document.querySelectorAll('.player').forEach((el, k) => el.classList.toggle('on', k === p));
    const t = $('#turn');
    t.querySelector('.t').textContent = `Player ${p + 1}'s Turn!`;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    G.busy = false;
    A.say(p ? 't:turn2' : 't:turn1');
    croc.look(V3(p ? 4.5 : -4.5, 2.6, 3));
    const left = croc.N_TEETH - G.pressed.size;
    armIdle();
  }

  // ── idle hint: a tapping hand over a free tooth ──────────────────────────────────────────────────────
  function clearIdle() { clearTimeout(G.idle); $('#hint').classList.remove('show'); }
  function armIdle() {
    clearIdle();
    G.idle = setTimeout(() => {
      if (G.busy || G.screen !== 'game') return;
      const free = [...Array(croc.N_TEETH).keys()].filter(i => !G.pressed.has(i));
      if (!free.length) return;
      const front = free.filter(i => i >= 2 && i <= 7);
      const i = (front.length ? front : free)[rand((front.length ? front : free).length)];
      const p = toothScreen(i);
      const h = $('#hint');
      h.style.left = p.x + 'px';
      h.style.top = p.y + 'px';
      h.classList.add('show');
      G.idle = setTimeout(armIdle, 4200);
    }, 5200);
  }

  // ── a tooth is pressed ───────────────────────────────────────────────────────────────────────────────
  async function onTooth(i) {
    if (G.screen !== 'game' || G.busy) return;
    if (G.pressed.has(i)) { A.sfxPlay('tick'); return; }
    const tok = G.token, p = G.turn, word = G.teeth[i];
    G.busy = true;
    clearIdle();
    A.stopVoice();
    G.pressed.add(i);
    croc.hover(-1);
    croc.press(i);
    A.sfxPlay('tap');
    croc.look(croc.toothWorld(i));
    croc.squint(0.55);
    A.sfxPlay('drum');
    await sleep(620);
    if (tok !== G.token) return;
    if (word === G.target) return chomp(i, p, tok);
    await safe(i, p, word, tok);
  }

  async function safe(i, p, word, tok) {
    croc.squint(0);
    croc.wide(1);
    A.sfxPlay('pop');
    A.sfxPlay('sparkle');
    const from = toothScreen(i);
    FX.burst(from.x, from.y, { kind: 'sparkle', n: 30 });
    FX.burst(from.x, from.y, { kind: 'dots', n: 14, speed: 0.8 });
    const card = makeCard(word, { sound: true, mic: true });
    card.style.setProperty('--cw', 27 * u() + 'px');
    const f = flyer(card).set(from.x, from.y, 0.12, 0);
    const slot = revealSlot(p);
    A.sfxPlay('card');
    await f.to(slot.x, slot.y, 1, slot.r, 560);
    if (tok !== G.token) return;
    croc.look(null);
    card.addEventListener('pointerdown', e => { e.stopPropagation(); if (!card.classList.contains('busy')) A.say('w:' + word); });
    card.classList.add('busy');
    await sayWord(word, card, tok);
    if (tok !== G.token) return;
    await sayIt(card, tok);
    if (tok !== G.token) return;
    card.classList.remove('busy');
    // dock into the player's corner with a sparkle trail
    const to = stackPoint(p);
    FX.trail(slot.x, slot.y, to.x, to.y, 520);
    A.sfxPlay('whoosh');
    await f.to(to.x, to.y, 0.36, 0, 620, 'cubic-bezier(.5,0,.3,1)');
    f.el.remove();
    G.got[p].push(word);
    renderStack(p);
    A.sfxPlay('ding');
    FX.burst(to.x, to.y, { kind: 'stars', n: 10, speed: 0.6 });
    if (tok !== G.token) return;
    await sleep(250);
    setTurn(1 - p);
  }

  /* "say it": prompt, listen for a voice (mic) or give a short countdown without a mic */
  async function sayIt(card, tok) {
    const mic = card.querySelector('.mic');
    card.classList.add('listen');
    await say('t:sayit', 600);
    if (tok !== G.token) return;
    const lv = v => mic.style.setProperty('--lv', v.toFixed(3));
    let heard = await Mic.listen({ maxMs: 5200, onLevel: lv, cancel: () => tok !== G.token });
    if (tok !== G.token) return;
    if (heard === null) {                      // no microphone: give them time to say it
      card.classList.add('nomic');
      const t0 = performance.now(), ms = 2600;
      while (performance.now() - t0 < ms && tok === G.token) {
        card.style.setProperty('--cd', Math.min(100, (performance.now() - t0) / ms * 100) + '%');
        await sleep(50);
      }
      card.classList.remove('nomic');
    } else if (!heard) {
      await say('t:louder');
      if (tok !== G.token) return;
      heard = await Mic.listen({ maxMs: 4200, onLevel: lv, cancel: () => tok !== G.token });
    }
    card.classList.remove('listen');
    if (tok !== G.token) return;
    if (heard) {
      card.classList.add('good');
      A.sfxPlay('great');
      const r = card.getBoundingClientRect();
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, { kind: 'stars', n: 22 });
      await say(['t:great2', 't:great3'][rand(2)], 500);
    } else {
      await sleep(300);
    }
  }

  // ── the bad tooth: CHOMP ─────────────────────────────────────────────────────────────────────────────
  async function chomp(i, p, tok) {
    const t = $('#target');
    croc.release(i);
    croc.glow(i, 1, '#9b4dff');
    croc.squint(0);
    croc.wide(1.6);
    t.classList.add('alarm');
    A.sfxPlay('alarm');
    A.say('t:uhoh');
    for (let k = 0; k < 3; k++) {
      const at = toothScreen(i);
      FX.burst(at.x, at.y, { kind: 'dots', n: 10, speed: 0.5, ring: '#b46cff' });
      await sleep(330);
      if (tok !== G.token) return;
    }
    croc.chomp();
    croc.shake(1);
    A.sfxPlay('chomp');
    app.classList.remove('shake');
    void app.offsetWidth;
    app.classList.add('shake');
    const m = mouthScreen();
    FX.burst(m.x, m.y, { kind: 'purple', n: 44 });
    await sleep(160);
    if (tok !== G.token) return;
    // the target card bursts out of the closed mouth
    const card = makeCard(G.target, { cls: 'boom', edge: '#b98cff' });
    card.style.setProperty('--cw', 27 * u() + 'px');
    const rays = document.createElement('div');
    rays.className = 'rays';
    card.appendChild(rays);
    const f = flyer(card).set(m.x, m.y + 4 * u(), 0.1, -20);
    A.sfxPlay('boing');
    f.to(window.innerWidth / 2, window.innerHeight * 0.53, 1, -4, 700, 'cubic-bezier(.2,.9,.3,1.35)');
    if (A.has('t:chomp')) A.say('t:chomp');
    await sleep(900);
    if (tok !== G.token) return;
    t.classList.remove('alarm');
    croc.glow(i, 0);
    showResult(1 - p, tok);
  }

  async function showResult(winner, tok) {
    G.screen = 'result';
    app.dataset.screen = 'result';
    G.starter = 1 - winner;                      // the one who got bitten starts the next round
    document.querySelectorAll('.player').forEach((el, k) => { el.classList.toggle('on', false); el.classList.toggle('win', k === winner); el.classList.toggle('lose', k !== winner); });
    $('#turn').classList.remove('show');
    $('#rbText').textContent = `Player ${winner + 1} Wins!`;
    const bw = $('#bigword');
    bw.innerHTML = '';
    G.target.toUpperCase().split('').forEach((ch, k) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.setProperty('--c', LETTER_C[k % LETTER_C.length]);
      s.style.setProperty('--i', k);
      bw.appendChild(s);
    });
    A.sfxPlay('fanfare');
    FX.pop(window.innerWidth * 0.25, window.innerHeight * 0.6, 60);
    FX.pop(window.innerWidth * 0.75, window.innerHeight * 0.6, 60);
    FX.rain(2600, 150);
    await sleep(700);
    if (tok !== G.token) return;
    await say(winner ? 't:win2' : 't:win1');
  }

  // ── screens ──────────────────────────────────────────────────────────────────────────────────────────
  function goGame() {
    G.screen = 'game';
    app.dataset.screen = 'game';
    Stage.setFrame(FRAME.game, 900);
    startRound();
  }
  function goTitle() {
    ++G.token;
    A.stopVoice();
    clearIdle();
    G.screen = 'title';
    G.busy = true;
    app.dataset.screen = 'title';
    $('#cards').innerHTML = '';
    $('#turn').classList.remove('show');
    $('#target').classList.remove('alarm', 'intro');
    document.querySelectorAll('.player').forEach(p => p.classList.remove('win', 'lose', 'on'));
    Stage.setFrame(FRAME.title, 900);
    croc.reopen();
    croc.resetTeeth(0.04);
    for (let i = 0; i < croc.N_TEETH; i++) croc.glow(i, 0);
    croc.tremble(0);
  }

  $('#start').addEventListener('click', () => {
    A.unlock();
    A.stopVoice();
    A.sfxPlay('pop');
    Mic.init();
    A.startBgm(0.1);
    goGame();
  });
  $('#again').addEventListener('click', () => {
    A.sfxPlay('pop');
    G.screen = 'game';
    app.dataset.screen = 'game';
    say('t:playagain');
    startRound();
  });
  $('#btnHome').addEventListener('click', () => { A.sfxPlay('tap'); goTitle(); });
  $('#btnSound').addEventListener('click', () => {
    A.unlock();
    A.setMuted(!A.muted);
    app.classList.toggle('muted', A.muted);
    if (!A.muted) A.startBgm();
  });
  app.classList.toggle('muted', A.muted);
  $('#target').addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (!G.target || G.screen !== 'game' || $('#target').classList.contains('intro')) return;
    A.unlock();
    if (!G.busy) { A.stopVoice(); sayWord(G.target, $('#target .card'), G.token); }
  });

  // first touch anywhere on the title: sound on + a hello
  let greeted = false;
  window.addEventListener('pointerdown', () => {
    A.unlock();
    if (!greeted && G.screen === 'title') {
      greeted = true;
      A.startBgm(0.1);
      setTimeout(() => { if (G.screen === 'title') say(A.has('t:hello') ? 't:hello' : 't:pressstart'); }, 250);
    }
  }, true);

  // ── pointer on the 3D croc ───────────────────────────────────────────────────────────────────────────
  const gl = $('#gl');
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(V3(0, 0, 1), -2.4), hitP = V3(0, 0, 0);
  let lookTimer = null;
  function lookAtPointer(e) {
    const r = gl.getBoundingClientRect();
    ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, Stage.camera);
    if (ray.ray.intersectPlane(plane, hitP)) {
      croc.look(hitP);
      clearTimeout(lookTimer);
      lookTimer = setTimeout(() => croc.look(G.screen === 'game' && !G.busy ? V3(G.turn ? 4.5 : -4.5, 2.6, 3) : null), 2200);
    }
  }
  gl.addEventListener('pointermove', e => {
    lookAtPointer(e);
    if (G.screen !== 'game' || G.busy || e.pointerType === 'touch') { croc.hover(-1); gl.classList.remove('point'); return; }
    const i = Stage.pick(e.clientX, e.clientY);
    const ok = i >= 0 && !G.pressed.has(i);
    croc.hover(ok ? i : -1);
    gl.classList.toggle('point', ok);
  });
  gl.addEventListener('pointerdown', e => {
    A.unlock();
    lookAtPointer(e);
    if (G.screen === 'title') {
      // poke the croc on the title: a playful snap
      if (Stage.hitCroc(e.clientX, e.clientY) && !G.poking) {
        G.poking = true;
        croc.chomp(); A.sfxPlay('chomp'); croc.shake(0.5);
        setTimeout(() => { croc.reopen(); A.sfxPlay('boing'); }, 650);
        setTimeout(() => { G.poking = false; }, 1100);
      }
      return;
    }
    const i = Stage.pick(e.clientX, e.clientY);
    if (i >= 0) onTooth(i);
  });
  window.addEventListener('keydown', e => {
    if (G.screen === 'title' && (e.key === 'Enter' || e.key === ' ')) { $('#start').click(); return; }
    if (G.screen === 'game' && /^[0-9]$/.test(e.key)) onTooth((+e.key + 9) % 10);
  });

  // QA hooks (headless checks)
  window.__croco = { G, croc, Stage, goGame, goTitle, onTooth, startRound, showResult, toothScreen, revealSlot };
  window.__ready = true;
})();
