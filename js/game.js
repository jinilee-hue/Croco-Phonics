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
  const Q = new URLSearchParams(location.search);
  // the croc explains the game on the intro before START (?nohowto: not — the QA scripts open straight on the title)
  const HOWTO_FIRST = !Q.has('nohowto');
  const HOWTO_AFTER = 550 + 2250 + 1000;               // ms: the title's entrance (START up at 2.8 s), a moment, then explain
  const A = window.Sound, Mic = window.Mic;
  // levels = the FPR K lessons in book order (tools/build_words.py; user: "레벨1이 끝나면 레벨2로 넘어가게 … lesson2에
  // 배워야하는 음가와 단어로 … 교재기반으로 계속 레벨 올라가게"). Level N = Lesson N: its letter on the teeth, the sound pill
  // and in bold in each word, its official letter sound, its words. WORDS / BY follow the current level (setLevel).
  const DATA = window.CROCO_WORDS;
  const LEVELS = DATA.levels && DATA.levels.length ? DATA.levels
    : [{ level: 1, lesson: 1, title: 'Mm', letter: 'm', sound: 'm', kind: 'letter', words: DATA.words }];
  const ANY = {};
  LEVELS.forEach(l => l.words.forEach(w => { if (!ANY[w.w]) ANY[w.w] = w; }));
  let WORDS = LEVELS[0].words, BY = Object.fromEntries(WORDS.map(w => [w.w, w]));
  const LV = () => LEVELS[G.level] || LEVELS[0];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cap = w => w[0].toUpperCase() + w.slice(1);
  const EDGES = ['#f6b043', '#86c3ec', '#94d38a', '#f59ab8', '#b9a2f0', '#f7c95c', '#7fd6c8'];
  // croc framing: horizontal centre, bottom edge, height (fractions of the viewport)
  // camera framing: croc centre (fraction from the top), its height fraction, camera elevation (°). In the game the
  // camera swings up to look into the mouth so every tooth shows (user: "화면 돌려서 악어 이빨이 다 잘 보이게")
  const FRAME = { title: { y: 0.68, h: 0.6, el: 12 }, game: { y: 0.635, h: 0.64, el: 35 } };
  const OPEN_REST = { title: 1, game: 1.32 };          // the game opens the mouth wider: the back teeth clear the upper jaw
  const portrait = () => window.innerWidth < window.innerHeight;
  const u = () => Math.min(window.innerHeight / 100, window.innerWidth * (portrait() ? 0.0095 : 0.0062));
  const CARD_W = { reveal: 34, bite: 40 };          // card widths in u (user: "카드가 너무 작아" — were 27)
  const SVG_SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5v5a1 1 0 0 0 1 1h3l4.4 3.7a.8.8 0 0 0 1.3-.6V5.4a.8.8 0 0 0-1.3-.6L7 8.5H4a1 1 0 0 0-1 1z"/><path d="M15.6 8.2a5 5 0 0 1 0 7.6M18.3 5.6a8.6 8.6 0 0 1 0 12.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const SVG_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0" fill="none" stroke="#ff7d2e" stroke-width="2.2" stroke-linecap="round"/><path d="M12 17.5V21" stroke="#ff7d2e" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const SVG_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

  const G = { screen: 'title', token: 0, busy: true, target: null, nextTarget: null, winner: null, lastTarget: null, teeth: [], pressed: new Set(), turn: 0, starter: 0, got: [[], []], idle: null, said: new Set(), level: 0, bootHowto: null, wins: {} };

  // ── the 3D croc (js/croc.js) on the three.js stage (js/stage.js) ─────────────────────────────────────
  Stage.init($('#croc'), { preserve: /[?&]shot\b/.test(location.search) });
  const croc = Stage.view(Croc.build(Stage.scene));
  Stage.setCroc(croc);
  croc.setFrame(FRAME.title);
  // the playroom tilts with the camera: css .room reads --tilt (0 = the title's 12°, 1 = the game's 35°) (user: "게임화면에서 악어가 기울어졌을때 뒤에 배경도 같이 기울어지면 안돼?")
  let tiltWas = -1;
  Stage.onTick.push(() => {
    const k = Math.max(0, Math.min(1, (Stage.frame.el - FRAME.title.el) / (FRAME.game.el - FRAME.title.el)));
    if (Math.abs(k - tiltWas) > 0.001) { tiltWas = k; app.style.setProperty('--tilt', k.toFixed(3)); }
  });
  Stage.start();
  if (document.fonts && document.fonts.load) document.fonts.load('700 100px "Baloo 2"').then(() => {
    croc.refreshLetters();
    document.querySelectorAll('.card[data-word]').forEach(fitCardWord);
  }).catch(() => {});
  // ready once the croc's parts are loaded (QA waits for window.__ready)
  (function waitCroc() {
    if (croc.ready && window.__croco) { $('#loading').classList.add('done'); bootIntro(); window.__ready = true; } else setTimeout(waitCroc, 50);
  })();
  const cvCroc = $('#croc');

  const toothScreen = i => croc.toothScreen(i);
  const mouthScreen = () => croc.mouthScreen();
  const avatarPoint = p => { const r = document.querySelector(`.player.p${p + 1} .ava`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  // ── cards ────────────────────────────────────────────────────────────────────────────────────────────
  let edgeN = 0;
  // long words stay inside the card (user: "긴 단어가 카드 밖으로 삐져나오지 않게"): a word is .19 of the card's width
  // (.13 on the wide target card) or smaller, so that it fits the card's inside with room for the say-it glow
  // (scale 1.12). Measured in the game font; measured again once that font has loaded.
  const measure = document.createElement('canvas').getContext('2d');
  const FONT = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || '"Baloo 2", sans-serif';
  /* the word as the cards show it: capitalised, the lesson's letter in bold (hl / hn from tools/build_words.py) — the
     initial (Map), a short vowel (C-a-t) or the final x */
  function wordParts(word) {
    const e = BY[word] || ANY[word] || {}, s = cap(word), i = e.hl || 0, n = e.hn || 1;
    return [s.slice(0, i), s.slice(i, i + n), s.slice(i + n)];
  }
  function wordFit(word, tgt) {
    const [pa, pb, pc] = wordParts(word);
    measure.font = `800 100px ${FONT}`;
    let w = measure.measureText(pb).width;
    measure.font = `700 100px ${FONT}`;
    w += measure.measureText(pa + pc).width + word.length;          // + letter-spacing .01em
    // inside width: card .788 (border .036 + padding .07 a side), target card .808; × .88 for the glow
    return Math.min(tgt ? 0.13 : 0.19, (tgt ? 0.71 : 0.69) / (w / 100));
  }
  function fitCardWord(el) { el.style.setProperty('--wf', wordFit(el.dataset.word, el.classList.contains('tgt')).toFixed(4)); }
  function makeCard(word, opts = {}) {
    const w = BY[word] || ANY[word], [pa, pb, pc] = wordParts(word);
    const el = document.createElement('div');
    el.className = 'card' + (opts.cls ? ' ' + opts.cls : '') + (opts.sound ? ' has-snd' : '');
    el.style.setProperty('--edge', opts.edge || EDGES[edgeN++ % EDGES.length]);
    el.dataset.word = word;
    fitCardWord(el);
    el.innerHTML = `<div class="pic"><img src="${w.card}" alt="" draggable="false"></div>`
      + `<div class="word">${pa}<b>${pb}</b>${pc}</div>`
      + (opts.sound ? `<div class="snd" role="button" aria-label="Listen: ${word}"><span class="ltr">${cap(LV().letter)}</span>${SVG_SPK}</div>` : '')
      + (opts.mic ? `<div class="ok" aria-hidden="true">${SVG_OK}</div>` : '');
    return el;
  }
  function placeDecor() {
    document.querySelectorAll('.deco > [data-word]').forEach(slot => {          // the slots (their cards carry data-word too)
      slot.innerHTML = '';
      slot.appendChild(makeCard(slot.dataset.word, { edge: slot.classList.contains('fly-r') ? '#86c3ec' : slot.classList.contains('lay-l') ? '#b9a2f0' : slot.classList.contains('lay-r') ? '#f6b043' : '#f6b043' }));
    });
  }
  placeDecor();

  /* the intro shows the levels' letters, not just the level's one (user: "인트로에 알파벳이 p만 나와있는데..mapst 등
     다양한 스펠링으로 넣어줘"): m a p s t first, then the rest in book order — one per tooth (the front row m a p s,
     then t, the sides, the back) and on the clay letters going round the croc (orbitFrame). The explanation and the
     game keep the level's letter on every tooth. */
  const MIX = (() => {
    const all = [...new Set(LEVELS.map(L => L.letter))];
    return [...'mapstnicfd'].filter(ch => all.includes(ch)).concat(all.filter(ch => !'mapstnicfd'.includes(ch)));
  })();
  const MIX_TEETH = [3, 4, 5, 6, 7, 2, 1, 8, 0, 9];          // tooth order: the front row left → right, t, sides, back
  let teethMix = null;
  function teethLetters(force) {
    const mix = G.screen === 'title' && !T.on;
    if (!force && mix === teethMix) return;
    teethMix = mix;
    if (!mix) { croc.setLetter(LV().letter); return; }
    const arr = new Array(croc.N_TEETH).fill(LV().letter);
    MIX_TEETH.forEach((t, k) => { if (t < arr.length) arr[t] = MIX[k % MIX.length]; });
    croc.setLetters(arr);
  }
  // the clay letters that go round the croc on the title (built here, moved by orbitFrame below)
  const ORBIT = { PERIOD: 26, SPIN: 1.1, MIN: 0.4, MAX: 1, FONT: 19, t0: 1e12, L: [] };   // FONT (u) = css .ol b
  (() => {
    const back = $('.orbit-back'), front = $('.orbit-front');
    if (!back || !front) return;
    // the logo letters' colours (user: "인트로 스펠링 로고처럼 좀더 밝은 채도로"): base = a logo letter's body colour
    // (sampled from logo.webp), top lighter, deep = same hue richer (the letter's lower part), rim = the clay thickness;
    // warm / cool alternating round the ring (m a p s t n i c f d). scratch orbit_palette.py made the tones (OKLCH).
    const COLS = [
      { c: '#fea6d9', top: '#ffb9e0', deep: '#fc72c7', rim: '#df4bab' }, { c: '#acdefd', top: '#c4e7fe', deep: '#6dc6f9', rim: '#40a8df' },
      { c: '#ffe97e', top: '#fff5c4', deep: '#eacc1f', rim: '#c7ae1b' }, { c: '#ffa0f8', top: '#fdb6f8', deep: '#f370ec', rim: '#d648d1' },
      { c: '#a1f3cf', top: '#bcfbde', deep: '#5fdead', rim: '#1ec18e' }, { c: '#fdc5a6', top: '#ffd4bd', deep: '#f89f6a', rim: '#dd7e42' },
      { c: '#a8f2f3', top: '#c2fbfb', deep: '#67dcdd', rim: '#2cbfc1' }, { c: '#d895fc', top: '#dca8f9', deep: '#c869f7', rim: '#ac41dd' },
      { c: '#d6f270', top: '#e4fb9a', deep: '#b8d80a', rim: '#9cb70c' }, { c: '#fea0c6', top: '#feb3d0', deep: '#fe6aae', rim: '#e24291' }];
    const mk = (layer, ch, c) => {
      const o = document.createElement('i');
      o.className = 'ol';
      // the letter is a baked puffy sprite like the logo's letters (tools/make_orbit_letters.py reads ch + colours
      // from here); the text stays (transparent) for the box and the QA, and shows in colour if the image fails
      o.innerHTML = `<b style="--c:${c.c};--top:${c.top};--deep:${c.deep};--rim:${c.rim}">${ch}<img src="assets/img/ol_${ch}.webp"`
        + ` alt="" draggable="false" onerror="this.parentNode.classList.add('noimg')"></b>`;
      layer.appendChild(o);
      return o;
    };
    ORBIT.L = MIX.map((ch, i, all) => ({
      a0: Math.PI / 2 + (i / all.length) * Math.PI * 2,         // m in front first, the rest round the ring
      tilt: [-10, 8, -6, 11, -8, 6][i % 6], ph: i * 1.7, every: 6.5 + (i * 0.83) % 3.2, off: 1.6 + i * 1.1,
      f: mk(front, ch, COLS[i % COLS.length]), b: mk(back, ch, COLS[i % COLS.length]),
    }));
  })();
  /* a level: the croc's teeth, the title's clay letters and cards, the level tag and banner follow it */
  const DECOR1 = ['monkey', 'map', 'mouse', 'moon'];          // level 1's title cards, as they were
  function setLevel(i) {
    G.level = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    const L = LV();
    WORDS = L.words;
    BY = Object.fromEntries(WORDS.map(w => [w.w, w]));
    app.dataset.level = String(G.level + 1);
    app.classList.toggle('lastlv', G.level >= LEVELS.length - 1);
    teethLetters(true);
    // the game's floating letters in the title orbit's style — its baked candy sprites (user: "게임화면에 들어가있는 알파벳도 인트로에 들어간 알파벳 스타일로 바꿔줘");
    // a capital has no sprite and stays coloured text
    document.querySelectorAll('.deco .l3d').forEach(el => {
      const ch = el.classList.contains('big') ? cap(L.letter) : L.letter, spr = MIX.includes(ch);
      el.classList.toggle('spr', spr);
      el.innerHTML = spr ? `${ch}<img src="assets/img/ol_${ch}.webp" alt="" draggable="false" onerror="this.parentNode.classList.remove('spr')">` : ch;
    });
    const pick = G.level === 0 ? DECOR1.filter(w => BY[w]) : WORDS.map(w => w.w);
    document.querySelectorAll('.deco > [data-word]').forEach((slot, k) => { slot.dataset.word = pick[k % pick.length]; });
    placeDecor();
    levelText();
    renderWins();
  }
  const lvLabel = L => (L.letter.length > 1 ? cap(L.letter) : cap(L.letter) + L.letter);      // Mm, Aa … (Qu)
  /* each player's wins, level by level (user: "레벨별 누적 승리 표시도 플레이어한테 있어야하는거 아냐?"): beside the name
     plate, a chip per level played — its letter, a crown, that player's wins there (the same levels for both players,
     the current one outlined). Kept for the visit; a reload starts over. */
  function renderWins(pop = -1) {
    const lv = [...new Set([...Object.keys(G.wins).map(Number), G.level])].sort((a, b) => a - b);
    document.querySelectorAll('.player').forEach((pl, p) => {
      const box = pl.querySelector('.wins');
      box.innerHTML = lv.map(k => {
        // the crown and the count only (user: "이건 왕관과 갯수만 있으면 될듯해"); the level stays in title / aria-label
        const n = (G.wins[k] || [0, 0])[p];
        return `<span class="wchip${k === G.level ? ' cur' : ''}${n ? '' : ' zero'}" title="Level ${k + 1}">`
          + `<img src="assets/img/crown.webp" alt="" draggable="false"><em>${n}</em></span>`;
      }).join('');
      box.setAttribute('aria-label', lv.map(k => `${tr('level', { n: k + 1 })}: ${(G.wins[k] || [0, 0])[p]}`).join(', '));
      const c = p === pop && box.querySelector('.wchip.cur');
      if (c) {
        c.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1.45)', offset: 0.55 }, { transform: 'none' }], { duration: 560, easing: 'ease-out' });
        const r = c.getBoundingClientRect();
        FX.burst(r.left + r.width / 2, r.top + r.height / 2, { kind: 'stars', n: 14, speed: 0.6 });
      }
    });
  }
  function levelText() {
    const L = LV(), t = $('#lvTag'), b = $('#lvUp');
    t.querySelector('.n').textContent = tr('level', { n: G.level + 1 });
    t.querySelector('.s').textContent = L.title;
    b.querySelector('.t').textContent = tr('levelup', { n: G.level + 1 });
    b.querySelector('.lv-ltr b').textContent = lvLabel(L);
    b.querySelector('.lv-sub').textContent = L.kind === 'short' ? L.title : '';
  }

  // CSS cubic-bezier curves as functions: the card curves of Halli Galli (deal = comes out, fly = goes to a slot)
  function bezier(x1, y1, x2, y2) {
    const B = (a, b, t) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
    const dB = (a, b, t) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;
    return x => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const d = dB(x1, x2, t); if (Math.abs(d) < 1e-6) break; t = Math.min(1, Math.max(0, t - (B(x1, x2, t) - x) / d)); }
      return B(y1, y2, t);
    };
  }
  const EASE_DEAL = bezier(.2, .9, .25, 1.05), EASE_FLY = bezier(.3, .7, .3, 1);
  const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* a card on the overlay layer that moves like the cards in Halli Galli (user: "카드들의 인터렉션은 할리갈리에 있는거처럼"):
   * it travels on an arc, lifts toward the viewer on the way (grows, its shadow drops away), turns over from its back
   * mid-air when it is revealed (`flip`), and settles with the deal curve's small overshoot.
   * flyer > .fshadow + .lift > .flip > (.card front, .cback back) */
  function flyer(card) {
    const el = document.createElement('div');
    el.className = 'flyer';
    const cw = card.style.getPropertyValue('--cw');
    if (cw) el.style.setProperty('--cw', cw);
    el.innerHTML = '<div class="fshadow"></div><div class="lift"><div class="flip"><div class="cback"><b>m</b></div></div></div>';
    const shadow = el.firstChild, liftEl = el.lastChild, flip = liftEl.firstChild;
    flip.insertBefore(card, flip.firstChild);
    $('#cards').appendChild(el);
    const tf = (x, y, s, r) => `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${r}deg) scale(${s})`;
    const f = {
      el, card, x: 0, y: 0, s: 1, r: 0,
      set(x, y, s, r, back) {
        Object.assign(f, { x, y, s, r });
        el.style.transform = tf(x, y, s, r);
        flip.style.transform = back ? 'rotateY(180deg)' : '';
        return f;
      },
      /* fly to (x, y) at scale s, rotation r. o: { ms, ease, arc (px the path bows up), lift (extra scale at the top),
       * flip (turn over from the back), trail (sparkles along the path) } */
      fly(x, y, s, r, o = {}) {
        const ms = o.ms || 720, ease = o.ease || EASE_DEAL, N = 32;
        const x0 = f.x, y0 = f.y, s0 = f.s, r0 = f.r;
        const arc = o.arc != null ? o.arc : Math.min(Math.hypot(x - x0, y - y0) * 0.3, 18 * u());
        const cx = (x0 + x) / 2, cy = Math.min(y0, y) - arc;                 // the arc's control point
        const lift = o.lift != null ? o.lift : 0.16, cwPx = card.offsetWidth || 200;
        const pos = k => { const e = ease(k), q = 1 - e; return [q * q * x0 + 2 * q * e * cx + e * e * x, q * q * y0 + 2 * q * e * cy + e * e * y, e]; };
        const kE = [], kL = [], kS = [], kF = [];
        for (let i = 0; i <= N; i++) {
          const k = i / N, [px, py, e] = pos(k), h = Math.sin(Math.PI * Math.min(1, k * 1.08));
          kE.push({ offset: k, transform: tf(px, py, s0 + (s - s0) * e, r0 + (r - r0) * e) });
          kL.push({ offset: k, transform: `translateY(${(-h * lift * 0.45 * cwPx).toFixed(2)}px) scale(${(1 + lift * h).toFixed(4)})` });
          kS.push({ offset: k, transform: `translateY(${(h * 0.22 * cwPx).toFixed(2)}px) scale(${(1 + 0.25 * h).toFixed(4)})`, opacity: (0.75 * h).toFixed(3) });
          if (o.flip) kF.push({ offset: k, transform: `rotateY(${(180 * (1 - smooth01(0.08, 0.72, k))).toFixed(2)}deg)` });
        }
        if (o.trail) {
          const t0 = performance.now();
          let lastT = 0;
          const tick = now => {
            const k = (now - t0) / ms;
            if (k >= 1 || !el.isConnected) return;
            if (now - lastT > 40) { lastT = now; const [px, py] = pos(k); FX.burst(px, py, { kind: 'sparkle', n: 2, speed: 0.25 }); }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
        Object.assign(f, { x, y, s, r });
        const opt = { duration: ms, easing: 'linear', fill: 'forwards' };
        const an = [el.animate(kE, opt), liftEl.animate(kL, opt), shadow.animate(kS, opt)];
        if (o.flip) an.push(flip.animate(kF, opt));
        return Promise.all(an.map(a => a.finished.catch(() => {})));
      },
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
    const W = window.innerWidth, H = window.innerHeight, cw = CARD_W.reveal * u();
    if (portrait()) return { x: W / 2 + (p ? 1 : -1) * Math.min(W * 0.22, cw * 0.62), y: H * 0.42, r: p ? 6 : -6 };
    const box = croc.screenBox(), left = box.left, right = box.right;
    const x = p === 0 ? Math.max(cw * 0.5 + 2 * u(), Math.min(left - cw * 0.45, left * 0.52)) : Math.min(W - cw * 0.5 - 2 * u(), Math.max(right + cw * 0.45, right + (W - right) * 0.48));
    return { x, y: H * 0.42, r: p === 0 ? -6 : 6 };          // .42: clear of the turn pill above the bottom-corner player
  }
  function stackPoint(p) {
    const ava = document.querySelector(`.player.p${p + 1} .ava`).getBoundingClientRect();
    const dx = 2.2 * u() + 4.5 * u();
    return { x: p === 0 ? ava.right + dx : ava.left - dx, y: ava.top + ava.height * 0.45 };
  }
  /* the player's pile; landing = the newest card is laid out but hidden (a flying card is about to land on it) */
  function renderStack(p, landing) {
    const st = document.querySelector(`.player.p${p + 1} .stack`);
    st.innerHTML = '';
    let top = null;
    G.got[p].forEach((w, k) => {
      const m = document.createElement('div');
      m.className = 'mini';
      m.style.setProperty('--i', Math.min(k, 6));
      m.style.setProperty('--rot', ((k * 37) % 13) - 6);
      if (k < G.got[p].length - 1 || landing) m.style.animation = 'none';
      if (landing && k === G.got[p].length - 1) m.style.visibility = 'hidden';
      m.appendChild(makeCard(w, { edge: EDGES[k % EDGES.length] }));
      st.appendChild(m);
      top = m;
    });
    if (G.got[p].length) {
      const c = document.createElement('div');
      c.className = 'count';
      c.textContent = G.got[p].length;
      if (landing) c.style.visibility = 'hidden';
      st.appendChild(c);
    }
    return top;
  }

  // ── voice helpers ────────────────────────────────────────────────────────────────────────────────────
  const say = (key, minMs = 0) => Promise.all([A.say(key), sleep(minMs)]);
  async function sayWord(word, card, tok) {
    if (card) card.classList.add('say-m');
    await say('s:' + LV().sound, 900);
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
    bite.innerHTML = '<img src="assets/img/bite_croc.webp" alt="" draggable="false">';
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
    $('#mic').classList.remove('listen', 'nomic');
    $('#target').classList.remove('alarm');
    G.winner = null;
    document.querySelectorAll('.player').forEach(p => p.classList.remove('win', 'lose', 'on'));
    $('#turn').classList.remove('show');
    G.got = [[], []];
    renderStack(0); renderStack(1);
    const pool = WORDS.map(w => w.w);
    let target;
    do { target = pool[rand(pool.length)]; } while (pool.length > 1 && target === G.lastTarget);
    if (G.nextTarget) { target = G.nextTarget; G.nextTarget = null; }      // the word the intro's explanation used
    if (window.__test && window.__test.target) target = window.__test.target;
    if (BY[Q.get('target')]) target = Q.get('target');
    G.lastTarget = target; G.target = target;
    // 10 teeth: the trap word once, the level's other words on the rest (dealt again when a level has fewer)
    const rest = pool.filter(w => w !== target), others = [];
    while (rest.length && others.length < croc.N_TEETH - 1) others.push(...shuffle(rest.slice()));
    others.length = Math.min(others.length, croc.N_TEETH - 1);
    G.teeth = shuffle([target, ...others]);
    if (window.__test && window.__test.teeth) G.teeth = window.__test.teeth.slice();
    G.pressed = new Set();
    for (let i = 0; i < croc.N_TEETH; i++) croc.glow(i, 0);
    croc.reopen();
    croc.resetTeeth(0.05);
    croc.surprise(0);
    croc.happy(0);
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
    croc.reopen();
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
    t.querySelector('.t').textContent = tr('turn', { n: p + 1 });
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    // pops up out of the active player's avatar (the tag's tail is the origin)
    t.animate([{ scale: 0.3, opacity: 0 }, { scale: 1.12, opacity: 1, offset: 0.6 }, { scale: 1, opacity: 1 }], { duration: 480, easing: 'ease-out' });
    G.busy = false;
    A.say(p ? 't:turn2' : 't:turn1');
    croc.look(avatarPoint(p));
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
      const front = free.filter(i => croc.frontTeeth.includes(i));
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
    if (G.screen !== 'game' || G.busy || !(i >= 0 && i < croc.N_TEETH)) return;
    if (G.pressed.has(i)) { A.sfxPlay('tick'); return; }
    const tok = G.token, p = G.turn, word = G.teeth[i];
    G.busy = true;
    clearIdle();
    A.stopVoice();
    G.pressed.add(i);
    croc.hover(-1);
    croc.press(i);
    A.sfxPlay('tap');
    croc.look(toothScreen(i));
    A.sfxPlay('drum');
    await sleep(620);
    if (tok !== G.token) return;
    if (word === G.target) return chomp(i, p, tok);
    await safe(i, p, word, tok);
  }

  async function safe(i, p, word, tok) {
    croc.squint(0);
    croc.cheer();
    A.sfxPlay('pop');
    A.sfxPlay('sparkle');
    const from = toothScreen(i);
    FX.burst(from.x, from.y, { kind: 'sparkle', n: 30 });
    FX.burst(from.x, from.y, { kind: 'dots', n: 14, speed: 0.8 });
    const card = makeCard(word, { sound: true, mic: true });
    card.style.setProperty('--cw', CARD_W.reveal * u() + 'px');
    const f = flyer(card).set(from.x, from.y, 0.2, 0, true);
    const slot = revealSlot(p);
    A.sfxPlay('card');
    await f.fly(slot.x, slot.y, 1, slot.r, { ms: 780, flip: true, lift: 0.2 });
    if (tok !== G.token) return;
    croc.look(null);
    card.addEventListener('pointerdown', e => { e.stopPropagation(); if (!card.classList.contains('busy')) A.say('w:' + word); });
    card.classList.add('busy');
    await sayWord(word, card, tok);
    if (tok !== G.token) return;
    await sayIt(word, card, tok);
    if (tok !== G.token) return;
    card.classList.remove('busy');
    // onto the player's pile: the pile makes a place, the card arcs over (sparkle trail) and lands on it
    G.got[p].push(word);
    const mini = renderStack(p, true);
    const mr = mini.getBoundingClientRect(), to = { x: mr.left + mr.width / 2, y: mr.top + mr.height / 2 };
    const sc = mini.firstChild.offsetWidth / (card.offsetWidth || 1);
    A.sfxPlay('whoosh');
    await f.fly(to.x, to.y, sc, +mini.style.getPropertyValue('--rot') || 0, { ms: 680, ease: EASE_FLY, lift: 0.14, trail: true });
    f.el.remove();
    mini.style.visibility = '';
    mini.firstChild.style.transformOrigin = '50% 90%';
    mini.firstChild.animate([{ transform: 'scale(1.1, .9)' }, { transform: 'scale(.97, 1.03)', offset: 0.55 }, { transform: 'none' }], { duration: 340, easing: 'ease-out' });
    const cnt = mini.parentNode.querySelector('.count');
    if (cnt) { cnt.style.visibility = ''; cnt.animate([{ transform: 'scale(.3)' }, { transform: 'scale(1.25)', offset: 0.6 }, { transform: 'none' }], { duration: 380, easing: 'ease-out' }); }
    A.sfxPlay('ding');
    FX.burst(to.x, to.y, { kind: 'stars', n: 10, speed: 0.6 });
    if (tok !== G.token) return;
    await sleep(250);
    setTurn(1 - p);
  }

  /* "say it": the croc asks, then WAITS for the word — the turn never moves on without it (user: "단어를 읽지 않았는데
     그냥 넘어가는 경우 없어야해"; it used to move on after ~10 s of silence, or after a 2.6 s countdown without a mic).
     - with a mic: it listens with no time-out; each silence brings the croc back, in turn "I can't hear you. Say it
       loud!" and the word once more (its sound + the word) + "Now say the word.", then it listens again
     - without one (refused, none, or still being asked) it can't hear, so the player taps the mic once they've said
       the word (tapMic); if the mic gets allowed meanwhile, it listens instead
     Home / Exit still end the round (the token). The mic sits in the middle of the screen on the croc's lower jaw
     (user: "마이크는 화면 가운데 악어 아래 턱에 겹쳐서") */
  function placeMic() { const mc = $('#mic'), p = croc.jawScreen(); mc.style.left = p.x + 'px'; mc.style.top = p.y + 'px'; return mc; }
  async function sayIt(word, card, tok) {
    const mic = placeMic();
    mic.classList.add('listen');
    try {
      await say('t:sayit', 600);
      const lv = v => mic.style.setProperty('--lv', v.toFixed(3));
      for (let k = 0; ; k++) {
        if (tok !== G.token) return;
        const heard = await Mic.listen({ maxMs: k ? 6500 : 5200, onLevel: lv, cancel: () => tok !== G.token });
        if (tok !== G.token) return;
        if (heard) break;
        if (heard === null) { if (await tapMic(mic, tok)) break; continue; }
        if (k % 2 === 0) await say('t:louder');
        else { await sayWord(word, card, tok); if (tok !== G.token) return; await say('t:sayit', 300); }
      }
      if (tok !== G.token) return;
      mic.classList.remove('listen');
      card.classList.add('good');
      A.sfxPlay('great');
      const r = card.getBoundingClientRect();
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, { kind: 'stars', n: 22 });
      await say(['t:great2', 't:great3'][rand(2)], 500);
    } finally {
      mic.classList.remove('listen', 'nomic');
      mic.style.setProperty('--lv', 0);
    }
  }

  /* no mic to hear with: wait for a tap on the mic ("I said it"). The glove taps it from 1.6 s on, and the croc asks
     again every 9 s. true = tapped; false = the round ended, or the mic got allowed meanwhile (then sayIt listens) */
  async function tapMic(mic, tok) {
    let tapped = false;
    const on = e => { e.preventDefault(); e.stopPropagation(); if (!tapped) { tapped = true; A.stopVoice(); A.sfxPlay('tap'); } };
    const h = $('#hint');
    mic.classList.add('nomic');
    mic.addEventListener('pointerdown', on);
    try {
      const t0 = performance.now();
      let again = 9000, hand = false;
      while (!tapped && tok === G.token && !Mic.ready()) {
        const el = performance.now() - t0;
        if (!hand && el > 1600) {
          hand = true;
          const r = mic.getBoundingClientRect();
          h.style.left = (r.left + r.width * 0.6) + 'px';
          h.style.top = (r.top + r.height * 0.62) + 'px';
          h.classList.add('show', 'on-mic');
        }
        if (el > again) { again = el + 9000; await say('t:sayit', 300); continue; }
        await sleep(60);
      }
      return tapped;
    } finally {
      mic.removeEventListener('pointerdown', on);
      mic.classList.remove('nomic');
      h.classList.remove('show', 'on-mic');
    }
  }

  // ── the bad tooth: CHOMP ─────────────────────────────────────────────────────────────────────────────
  async function chomp(i, p, tok) {
    const t = $('#target');
    croc.release(i);
    croc.glow(i, 1, '#9b4dff');
    croc.squint(0);
    croc.wide(1.6);
    croc.surprise(1);
    t.classList.add('alarm');
    A.sfxPlay('alarm');
    A.say('t:uhoh');
    for (let k = 0; k < 3; k++) {
      const at = toothScreen(i);
      FX.burst(at.x, at.y, { kind: 'dots', n: 10, speed: 0.5, ring: '#b46cff' });
      await sleep(330);
      if (tok !== G.token) return;
    }
    croc.surprise(0);
    croc.chomp();
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
    card.style.setProperty('--cw', CARD_W.bite * u() + 'px');
    const f = flyer(card).set(m.x, m.y + 4 * u(), 0.15, -20, true);
    const rays = document.createElement('div');
    rays.className = 'rays';
    f.el.insertBefore(rays, f.el.firstChild);                  // behind the card, not turned over with it
    A.sfxPlay('boing');
    f.fly(window.innerWidth / 2, window.innerHeight * 0.53, 1, -4, { ms: 820, flip: true, lift: 0.24, arc: 8 * u() });
    if (A.has('t:chomp')) await say('t:chomp', 900); else await sleep(900);
    if (tok !== G.token) return;
    t.classList.remove('alarm');
    croc.glow(i, 0);
    // the word that bit, once more (user: "마지막 걸린 단어 다시 한번 음가랑 단어 읽어주고"): its sound, then the word
    await sayWord(G.target, card, tok);
    if (tok !== G.token) return;
    await sleep(200);
    if (tok !== G.token) return;
    showResult(1 - p, tok);
  }

  async function showResult(winner, tok) {
    G.screen = 'result';
    app.dataset.screen = 'result';
    G.starter = 1 - winner;                      // the one who got bitten starts the next round
    document.querySelectorAll('.player').forEach((el, k) => { el.classList.toggle('on', false); el.classList.toggle('win', k === winner); el.classList.toggle('lose', k !== winner); });
    $('#turn').classList.remove('show');
    G.winner = winner;
    (G.wins[G.level] = G.wins[G.level] || [0, 0])[winner]++;
    setTimeout(() => { if (tok === G.token) renderWins(winner); }, 650);
    $('#rbText').textContent = tr('wins', { n: winner + 1 });
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
    IM.splice(0).forEach(a => a.cancel());
    G.screen = 'game';
    app.dataset.screen = 'game';
    teethLetters();
    croc.setFrame(FRAME.game, 900);
    croc.rest(OPEN_REST.game);
    startRound();
  }
  function goTitle() {
    ++G.token;
    A.stopVoice();
    clearIdle();
    endTutorial();
    $('#mic').classList.remove('listen', 'nomic');
    G.screen = 'title';
    G.busy = true;
    app.dataset.screen = 'title';
    $('#cards').innerHTML = '';
    $('#turn').classList.remove('show');
    $('#lvUp').classList.remove('show', 'say');
    $('#target').classList.remove('alarm', 'intro');
    document.querySelectorAll('.player').forEach(p => p.classList.remove('win', 'lose', 'on'));
    croc.setFrame(FRAME.title, 900);
    croc.rest(OPEN_REST.title);
    croc.reopen();
    croc.resetTeeth(0.04);
    for (let i = 0; i < croc.N_TEETH; i++) croc.glow(i, 0);
    croc.surprise(0);
    croc.happy(0);
    introMotion(false);
  }

  // ── language: EN | 한 in the top bar (user: "튜터설명에 한글과 영어버전 설명 듣는게 있어야해" → a toggle like Magic
  //    Block's, remembered per device). The croc's voice + bubbles and the screen words switch; the words and the /m/
  //    sound stay English. Korean voice = 'k:' clips (tools/build_voice.py); audio.js plays 'k:x' for 't:x' in Korean.
  const LANG_KEY = 'croco.lang.v1';
  let LANG = (() => { try { return localStorage.getItem(LANG_KEY) === 'ko' ? 'ko' : 'en'; } catch (e) { return 'en'; } })();
  const UI = {
    en: { p1: 'Player 1', p2: 'Player 2', turn: 'Your turn!', wins: 'Player {n} Wins!', again: 'Play Again', next: 'Next Level', level: 'Level {n}', levelup: 'Level {n}!', skip: 'Skip',
      a_skip: 'Skip the explanation', a_lang: 'Language: English or Korean', a_sound: 'Sound on/off', a_exit: 'Exit' },
    ko: { p1: '플레이어 1', p2: '플레이어 2', turn: '네 차례!', wins: '플레이어 {n} 승리!', again: '다시 하기', next: '다음 레벨', level: '레벨 {n}', levelup: '레벨 {n}!', skip: '건너뛰기',
      a_skip: '설명 건너뛰기', a_lang: '언어: 영어 또는 한국어', a_sound: '소리 켜기/끄기', a_exit: '나가기' },
  };
  const tr = (k, v = {}) => (UI[LANG][k] || UI.en[k] || k).replace(/\{(\w+)\}/g, (_, x) => (v[x] != null ? v[x] : ''));
  function applyLang() {
    document.documentElement.lang = LANG;
    app.dataset.lang = LANG;
    A.lang = LANG;
    document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = tr(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', tr(e.dataset.i18nAria)));
    const b = $('#btnLang');
    b.dataset.l = LANG;
    b.setAttribute('aria-pressed', String(LANG === 'ko'));
    b.querySelectorAll('.flag').forEach(f => f.classList.toggle('on', f.dataset.l === LANG));
    $('#turn .t').textContent = tr('turn', { n: G.turn + 1 });
    if (G.winner != null) $('#rbText').textContent = tr('wins', { n: G.winner + 1 });
    levelText();
  }
  $('#btnLang').addEventListener('click', e => {
    e.stopPropagation();
    A.unlock();
    A.sfxPlay('tap');
    LANG = LANG === 'ko' ? 'en' : 'ko';
    try { localStorage.setItem(LANG_KEY, LANG); } catch (err) { /* private mode */ }
    applyLang();
    if (T.on && T.line) { A.stopVoice(); if (T.wake) T.wake(); }        // the croc says the line again in the new language
  });

  // ── the croc explains the game on the INTRO (title) screen, before START (user: "인트로에서 스타트 버튼 누르기 전에
  //    게임설명이 나오면서 스타트 버튼 대신에 skip버튼 나오다가 설명끝나면 다시 스타트 버튼 나오고 스타트 버튼 누르면
  //    게임시작하는 젠가와 같은 인트로" → "마지막 화면이 처음에도 있다가 시작해야지"). The page opens on the title (its
  //    entrance, START up); a moment later the croc explains — START gives way to SKIP (bottom right), the screen goes
  //    plain — and when it ends, or on SKIP, the title with START comes back; START starts the game. Every visit; Home →
  //    the title with START (no explanation). START during that first moment starts the game straight away.
  //    ?nohowto opens on the title without it.
  const TUT = {
    en: {
      tut1: "Hi, friends! I'm Croco!",
      tut2: 'This is the trap word.',
      tut3: "Don't press the tooth with this word!",
      tut4: 'Take turns. Press a tooth.',
      tut5: 'A card pops out. Now say the word.',
      tut6: 'Uh-oh! The trap word!',
      tut7: 'CHOMP! You lose!',
      tut8: "Ready? Let's play!",
    },
    ko: {
      tut1: '안녕, 친구들! 나는 크로코야!',
      tut2: '이건 함정 단어야.',
      tut3: '이 단어가 숨은 이빨은 누르면 안 돼!',
      tut4: '번갈아 가며 이빨을 하나씩 눌러 봐.',
      tut5: '카드가 톡 나오면, 이제 단어를 읽어 봐.',
      tut6: '앗! 함정 단어야!',
      tut7: '덥석! 그럼 지는 거야!',
      tut8: '준비됐니? 시작하자!',
    },
  };
  const T = { tok: 0, on: false, card: null, line: null, wake: null, again: false };
  let howtoSeen = false;
  function howtoDone() { howtoSeen = true; }
  try { localStorage.removeItem('croco.howto.v1'); } catch (e) { /* the old once-per-device mark */ }
  /* a pause the language toggle (and Skip) can cut short */
  const pause = ms => new Promise(r => { const id = setTimeout(done, ms); function done() { clearTimeout(id); if (T.wake === done) T.wake = null; r(); } T.wake = done; });
  /* the bubble goes beside the croc's head (right, left or above); beside the big trap-word card while that covers the
     head; under the croc; never over a card, an avatar, the logo or a button */
  function placeBubble() {
    const b = $('#bubble'), W = window.innerWidth, H = window.innerHeight, U = u(), m = 2 * U, gap = 2.6 * U;
    const ex = [croc.eyeScreen(0), croc.eyeScreen(1)].sort((p, q) => p.x - q.x), r = Math.max(2 * U, (ex[1].x - ex[0].x) * 0.3);
    const head = { left: ex[0].x - r, right: ex[1].x + r, top: Math.min(ex[0].y, ex[1].y) - r, y: (ex[0].y + ex[1].y) / 2 };
    const sel = '.player .ava, .sys, #skip, #target .card, #cards .flyer .card' + (G.screen === 'title' ? '' : ', .glogo');
    const avoid = [...document.querySelectorAll(sel)].filter(el => el.closest('.player') ? getComputedStyle(el.closest('.player')).opacity !== '0' : true)
      .map(el => el.getBoundingClientRect()).filter(a => a.width > 0);
    const clear = (x, y, bw, bh) => x >= m - 1 && y >= m - 1 && x + bw <= W - m + 1 && y + bh <= H - m + 1
      && !avoid.some(a => x < a.right && x + bw > a.left && y < a.bottom && y + bh > a.top);
    // [tail side, room for the bubble's width, where it goes for its size]
    const cand = [
      ['l', W - m - head.right - gap, (bw, bh) => [head.right + gap, head.y - bh * 0.62]],
      ['r', head.left - gap - m, (bw, bh) => [head.left - gap - bw, head.y - bh * 0.62]],
      ['b', W - 2 * m, (bw, bh) => [(head.left + head.right) / 2 - bw / 2, head.top - gap - bh]],
    ];
    const tc = $('#target').classList.contains('intro') && $('#target .card');
    if (tc) {
      const a = tc.getBoundingClientRect();
      cand.push(['l', W - m - a.right - gap, (bw, bh) => [a.right + gap, a.top + a.height * 0.4 - bh * 0.62]],
        ['r', a.left - gap - m, (bw, bh) => [a.left - gap - bw, a.top + a.height * 0.4 - bh * 0.62]]);
    }
    const box = croc.screenBox();
    cand.push(['t', W - 2 * m, (bw, bh) => [(box.left + box.right) / 2 - bw / 2, Math.min(box.bottom + gap, H - m - bh)]]);
    let pick = null, first = null;
    for (const [side, room, at] of cand) {
      if (room < 22 * U) continue;                                   // too narrow to read
      const mw = Math.min(36 * U, room);
      b.classList.toggle('narrow', mw < 30 * U);
      b.style.maxWidth = mw + 'px';
      b.style.left = b.style.top = '0px';                            // measure at full width (no squeeze at the edge)
      const bw = b.offsetWidth, bh = b.offsetHeight, [x, y] = at(bw, bh), c = { side, x, y, bw, bh, mw };
      if (!first) first = c;
      if (clear(x, y, bw, bh)) { pick = c; break; }
    }
    pick = pick || first;
    b.classList.toggle('narrow', pick.mw < 30 * U);
    b.style.maxWidth = pick.mw + 'px';
    b.style.left = Math.min(W - pick.bw - m, Math.max(m, pick.x)) + 'px';
    b.style.top = Math.min(H - pick.bh - m, Math.max(m, pick.y)) + 'px';
    b.dataset.tail = pick.side;
  }
  /* one line in the chosen language: the bubble pops up with it, the croc talks, the voice plays (company-TTS 'tutN'
     clips; without one, o.voice plays an existing clip that says part of it). When no voice plays — the browser plays
     none before the first tap, so the explanation on opening the page is bubbles only — the bubble stays up for a
     reading time. Switching EN | 한 mid-line says the line again in the other language. */
  async function tutorSay(key, tt, o = {}) {
    const b = $('#bubble');
    T.line = key;
    for (;;) {
      T.again = false;
      const lang = LANG, text = TUT[lang][key];
      b.querySelector('p').textContent = text;
      placeBubble();
      b.classList.add('show');
      b.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
      if (o.talk !== false) croc.talk(1);
      const own = (lang === 'ko' ? 'k:' : 't:') + key, alt = o.voice ? A.voiceKey(o.voice) : null, t0 = performance.now();
      let voiced = false;
      if (A.has(own)) voiced = (await Promise.all([A.say(own), pause(700)]))[0];
      else if (alt && A.has(alt) && (lang === 'ko') === alt.startsWith('k:')) voiced = (await Promise.all([A.say(o.voice), pause(900 + text.length * (lang === 'ko' ? 90 : 45))]))[0];
      // no voice (no sound before the first tap, or no clip): the bubble stays up for a reading time
      if (!voiced && !T.again && tt === T.tok && lang === LANG) await pause(Math.max(0, 1000 + text.length * (lang === 'ko' ? 110 : 58) - (performance.now() - t0)));
      croc.talk(0);
      if (tt !== T.tok) return false;
      if (lang === LANG && !T.again) break;                      // T.again: the sound just came on — say it aloud
    }
    T.line = null;
    return true;
  }
  function endTutorial() {
    T.tok++;
    if (T.wake) T.wake();
    if (!T.on) return;
    T.on = false;
    T.line = null;
    croc.talk(0);
    app.classList.remove('howto');
    $('#skip').classList.remove('show');
    $('#bubble').classList.remove('show');
    $('#hint').classList.remove('show');
    $('#target').classList.remove('alarm', 'intro');
    document.querySelectorAll('.player').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('#cards .flyer.demo').forEach(el => el.remove());
  }
  /* the glove taps a tooth for a moment */
  async function demoTap(i, ms) {
    const at = toothScreen(i), h = $('#hint');
    h.style.left = at.x + 'px';
    h.style.top = at.y + 'px';
    h.classList.add('show');
    await sleep(ms);
    h.classList.remove('show');
    return at;
  }
  async function runTutorial(lead = 0) {
    const tt = ++T.tok, tok = G.token;
    const live = () => tt === T.tok && tok === G.token && G.screen === 'title';
    const t = $('#target');
    T.on = true;
    G.busy = true;
    window.__intro = false;
    A.stopVoice();
    app.classList.add('howto');
    teethLetters();
    $('#skip').classList.add('show');
    // the first round's trap word is picked now: the croc explains with it and the game starts with it
    const pool = WORDS.map(w => w.w);
    const target = (BY[Q.get('target')] && Q.get('target')) || (window.__test && window.__test.target) || pool[rand(pool.length)];
    G.nextTarget = target;
    const card = setTargetCard(target);
    T.card = card;
    t.classList.remove('intro', 'alarm');
    t.classList.add('hidden');
    const fr = croc.frontTeeth.length ? croc.frontTeeth : [0, 1, 2, 3];
    const pressI = fr[Math.min(1, fr.length - 1)], biteI = fr[Math.min(2, fr.length - 1)] !== pressI ? fr[Math.min(2, fr.length - 1)] : fr[0];
    if (lead) { await pause(lead); if (!live()) return false; }       // the title steps out first
    // 1 · hello: the croc beams and says hi
    croc.cheer(1700);
    await pause(350);
    if (!live() || !await tutorSay('tut1', tt)) return false;
    // 2 · the trap word: its card comes in big, is said, and the croc snaps at it
    t.classList.remove('hidden');
    t.classList.add('intro');
    A.sfxPlay('pop');
    await sleep(780);
    if (!live() || !await tutorSay('tut2', tt)) return false;
    await sayWord(target, card, G.token);
    if (!live()) return false;
    croc.setOpen(0.18);
    A.sfxPlay('chomp');
    card.querySelector('.bite').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5) rotate(-12deg)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out' });
    await sleep(300);
    croc.reopen();
    await sleep(350);
    if (!live() || !await tutorSay('tut3', tt)) return false;
    // the card settles at the top centre (its place in the game) and stays there as the trap word
    t.classList.remove('intro');
    $('#bubble').classList.remove('show');
    A.sfxPlay('whoosh');
    await sleep(750);
    if (!live()) return false;
    // 3 · take turns and press a tooth: the glove taps one (the players come in with the game: the screen stays plain)
    const say4 = tutorSay('tut4', tt);
    await sleep(600);
    if (!live()) return false;
    const at = await demoTap(pressI, 1500);
    if (!live() || !await say4) return false;
    $('#bubble').classList.remove('show');
    croc.look(at);
    croc.press(pressI);
    A.sfxPlay('tap');
    A.sfxPlay('drum');
    await sleep(620);
    if (!live()) return false;
    // 4 · a card pops out of the tooth to the right, and is said
    const others = pool.filter(w => w !== target);
    const demo = others[rand(others.length)];
    const dc = makeCard(demo, {});
    dc.style.setProperty('--cw', CARD_W.reveal * u() + 'px');
    croc.cheer(1400);
    A.sfxPlay('pop');
    A.sfxPlay('sparkle');
    FX.burst(at.x, at.y, { kind: 'sparkle', n: 30 });
    FX.burst(at.x, at.y, { kind: 'dots', n: 14, speed: 0.8 });
    const f = flyer(dc).set(at.x, at.y, 0.2, 0, true);
    f.el.classList.add('demo');
    const slot = revealSlot(1);
    A.sfxPlay('card');
    await f.fly(slot.x, slot.y, 1, slot.r, { ms: 780, flip: true, lift: 0.2 });
    if (!live()) return false;
    croc.look(null);
    if (!await tutorSay('tut5', tt, { voice: 't:sayit' })) return false;
    await sayWord(demo, dc, G.token);
    if (!live()) return false;
    await sleep(500);
    $('#bubble').classList.remove('show');
    f.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' });
    croc.release(pressI);
    await sleep(420);
    f.el.remove();
    if (!live()) return false;
    // 5 · the trap word's tooth: it lights up purple, the trap card flashes, CHOMP
    const bt = await demoTap(biteI, 1100);
    if (!live()) return false;
    croc.look(bt);
    croc.press(biteI);
    A.sfxPlay('tap');
    A.sfxPlay('drum');
    await sleep(620);
    if (!live()) return false;
    croc.release(biteI);
    croc.glow(biteI, 1, '#9b4dff');
    croc.wide(1.6);
    croc.surprise(1);
    t.classList.add('alarm');
    A.sfxPlay('alarm');
    FX.burst(bt.x, bt.y, { kind: 'dots', n: 10, speed: 0.5, ring: '#b46cff' });
    if (!await tutorSay('tut6', tt, { voice: 't:uhoh' })) return false;
    croc.surprise(0);
    croc.chomp();
    A.sfxPlay('chomp');
    app.classList.remove('shake');
    void app.offsetWidth;
    app.classList.add('shake');
    const m = mouthScreen();
    FX.burst(m.x, m.y, { kind: 'purple', n: 36 });
    if (!await tutorSay('tut7', tt, { talk: false })) return false;
    t.classList.remove('alarm');
    croc.glow(biteI, 0);
    croc.wide(1);
    croc.look(null);
    croc.reopen();
    A.sfxPlay('boing');
    await sleep(500);
    if (!live()) return false;
    // 6 · ready → the title comes in with START (the game's first round then uses this trap word)
    croc.cheer(1600);
    if (!await tutorSay('tut8', tt)) return false;
    await sleep(250);
    if (!live()) return false;
    tutorialToTitle();
    return true;
  }
  /* the explanation is over (its last line, or SKIP): the plain screen gives way to the title — the logo, the cards and
     START come in — and the croc asks for START */
  function tutorialToTitle() {
    howtoDone();
    endTutorial();
    titleIn(150);
    setTimeout(() => { if (G.screen === 'title' && !T.on) say('t:pressstart'); }, 150 + 1500);
  }
  /* SKIP: the explanation stops here; the title with START comes in */
  function skipTutorial() {
    if (!T.on) return;
    A.stopVoice();
    if (T.card) T.card.classList.remove('say-m', 'say-w');
    for (let i = 0; i < croc.N_TEETH; i++) croc.glow(i, 0);
    croc.resetTeeth(0);
    croc.surprise(0);
    croc.happy(0);
    croc.wide(1);
    croc.look(null);
    croc.reopen();
    A.sfxPlay('whoosh');
    if (G.screen === 'title') tutorialToTitle(); else { howtoDone(); endTutorial(); }
  }
  $('#skip').addEventListener('click', e => { e.stopPropagation(); A.unlock(); A.sfxPlay('tap'); skipTutorial(); });

  /* the intro's entrance (user: "인트로 화면이 뜰 때 로고·악어·카드 등장 모션"): when the loading screen lifts, and again
     on Home. WAAPI on the individual transform properties (translate / rotate / scale), so each element's own idle CSS
     animation (logo bob, card float, START breathing) keeps running underneath. The croc grows in without a bounce. */
  const IM = [];
  let introTimer = null;
  function introMotion(first) {
    const d0 = first ? 550 : 120;
    if (first) croc.enter(1150); else croc.cheer(1200);
    titleIn(d0);
    if (first) setTimeout(() => { if (G.screen === 'title' && !T.on) croc.cheer(1300); }, d0 + 1250);
  }
  /* the page opens on the title (the croc grows in, the logo drops, the cards are dealt, START pops); a moment later the
     croc explains the game, START giving way to SKIP; then the title with START again */
  function bootIntro() {
    introMotion(true);
    if (!HOWTO_FIRST) return;
    G.bootHowto = setTimeout(() => { G.bootHowto = null; if (G.screen === 'title' && !T.on && !howtoSeen) runTutorial(700); }, HOWTO_AFTER);
  }
  /* the title's own entrance: the logo drops in, the cards are dealt, the letters pop, START pops last
     (__intro = true once START is up) */
  function titleIn(d0) {
    IM.splice(0).forEach(a => a.cancel());
    const E = (el, kf, o) => { if (el) IM.push(el.animate(kf, Object.assign({ fill: 'backwards' }, o))); };
    E($('.title .logo'), [
      { translate: '0 -55vh', scale: 0.55, rotate: '-8deg', opacity: 0 },
      { translate: '0 1.6vh', scale: 1.05, rotate: '2deg', opacity: 1, offset: 0.6 },
      { translate: '0 -0.5vh', scale: 0.985, rotate: '-1deg', opacity: 1, offset: 0.8 },
      { translate: '0 0', scale: 1, rotate: '0deg', opacity: 1 }], { duration: 1150, delay: d0, easing: 'cubic-bezier(.25,.8,.35,1)' });
    // the floating cards are dealt in from the sides like Halli Galli's: an arc, a turn, a settle
    const deal = (el, s, delay) => E(el, [
      { translate: `${s * 62}vw 18vh`, rotate: `${s * 70}deg`, scale: 0.45, opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { translate: `${s * -1.5}vw -2vh`, rotate: `${s * -6}deg`, scale: 1.04, opacity: 1, offset: 0.78 },
      { translate: '0 0', rotate: '0deg', scale: 1, opacity: 1 }], { duration: 950, delay, easing: 'cubic-bezier(.3,.7,.3,1)' });
    deal($('.fly-l'), -1, d0 + 500);
    deal($('.fly-r'), 1, d0 + 640);
    const slide = (el, s, delay) => E(el, [{ translate: `${s * 30}vw 22vh`, opacity: 0 }, { translate: '0 0', opacity: 0.96 }], { duration: 800, delay, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    slide($('.lay-l'), -1, d0 + 800);
    slide($('.lay-r'), 1, d0 + 900);
    teethLetters();
    ORBIT.t0 = performance.now() + d0 + 900;                 // the letters round the croc pop in, one after another
    E($('#start'), [{ scale: 0, opacity: 0 }, { scale: 1.12, opacity: 1, offset: 0.65 }, { scale: 1, opacity: 1 }], { duration: 620, delay: d0 + 1500, easing: 'ease-out' });
    window.__intro = false;
    clearTimeout(introTimer);
    introTimer = setTimeout(() => { window.__intro = true; }, d0 + 2250);
  }
  applyLang();
  setLevel((parseInt(Q.get('level'), 10) || 1) - 1);       // ?level=N: start at level N (QA, a class on lesson N)

  $('#start').addEventListener('click', () => {
    if (T.on || G.screen !== 'title') return;
    A.unlock();
    A.stopVoice();
    A.sfxPlay('pop');
    Mic.init();
    A.startBgm(0.1);
    clearTimeout(G.bootHowto);                   // pressed before the explanation began: straight into the game
    G.bootHowto = null;
    howtoDone();
    goGame();
  });
  $('#again').addEventListener('click', () => {
    A.sfxPlay('pop');
    G.screen = 'game';
    app.dataset.screen = 'game';
    say('t:playagain');
    startRound();
  });
  // Next Level (user: "다시하기가 있고 다음레벨로 넘어가는 버튼이 있어야"): the next lesson's sound and words
  $('#next').addEventListener('click', () => {
    if (G.screen !== 'result' || G.level >= LEVELS.length - 1) return;
    A.sfxPlay('pop');
    levelUp();
  });
  /* the croc snaps shut, the new lesson's letter goes onto its teeth, a banner shows the level and its sound is said,
     then the round starts with the new words */
  async function levelUp() {
    const tok = ++G.token;
    G.screen = 'game';
    app.dataset.screen = 'game';
    G.busy = true;
    G.winner = null;
    clearIdle();
    A.stopVoice();
    $('#cards').innerHTML = '';
    document.querySelectorAll('.player').forEach(p => p.classList.remove('win', 'lose', 'on'));
    $('#turn').classList.remove('show');
    $('#target').classList.add('hidden');
    G.got = [[], []];
    renderStack(0); renderStack(1);
    croc.chomp();
    A.sfxPlay('chomp');
    await sleep(300);
    if (tok !== G.token) return;
    setLevel(G.level + 1);
    const b = $('#lvUp');
    b.classList.remove('show', 'say');
    void b.offsetWidth;
    b.classList.add('show');
    A.sfxPlay('fanfare');
    FX.pop(window.innerWidth * 0.5, window.innerHeight * 0.42, 50);
    croc.reopen();
    croc.cheer(1800);
    await sleep(800);
    if (tok !== G.token) return;
    if (A.has('t:levelup')) { await say('t:levelup'); if (tok !== G.token) return; }
    b.classList.add('say');
    await say('s:' + LV().sound, 900);
    b.classList.remove('say');
    await sleep(600);
    if (tok !== G.token) return;
    b.classList.remove('show');
    await sleep(350);
    if (tok !== G.token) return;
    startRound();
  }
  /* Exit, next to the sound button on every screen (user: "게임인트로에도 소리조절버튼 옆에 나가기 버튼 있어야해"):
     in the game → the title; on the title → leave the game like Magic Block's corner bar: back to the page that
     opened it, a tab of its own closes, or else it starts over */
  $('#btnHome').addEventListener('click', () => {
    A.sfxPlay('tap');
    if (G.screen !== 'title') { goTitle(); return; }
    A.stopVoice();
    if (history.length > 1) { history.back(); setTimeout(() => location.reload(), 700); }
    else { window.close(); setTimeout(() => location.reload(), 300); }
  });
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
  window.addEventListener('pointerdown', e => {
    const first = !A.ctx;
    A.unlock();
    // the explanation runs silent until the first tap (the browser's rule): that tap → the croc says the line on screen
    // aloud now. Buttons keep their own job.
    if (first && T.on && T.line && T.wake && !e.target.closest('button')) { T.again = true; T.wake(); }
    if (!greeted && G.screen === 'title' && !e.target.closest('#btnHome')) {       // leaving: no hello
      greeted = true;
      A.startBgm(0.1);
      setTimeout(() => { if (G.screen === 'title' && !T.on && !G.bootHowto) say(A.has('t:hello') ? 't:hello' : 't:pressstart'); }, 250);
    }
  }, true);

  // ── on the title the levels' letters go ROUND THE CROC (user: "동동 떠다지지말고 스펠링은 커졌다 작아졌다하면서
  //    돌려줘. 할리갈리 카드처럼", "악어를 기준으로"), like Phonics Halli Galli's title cards round the bell (its
  //    src/orbit.js): an ellipse round the croc's screen box, small at the back — in .orbit-back under the croc's canvas,
  //    so the croc hides them — and big at the front (.orbit-front); now and then one hops and turns round once. No
  //    bobbing. Hidden off the title and during the explanation (CSS); window.ORBIT_T freezes the clock for stills.
  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const popIn = e => (e <= 0 ? 0 : e >= 1 ? 1 : 1 + 2.70158 * Math.pow(e - 1, 3) + 1.70158 * Math.pow(e - 1, 2));
  const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function orbitFrame(now) {
    requestAnimationFrame(orbitFrame);
    // the croc sways gently on the title with START; it holds still while it explains and in the game (the glove,
    // the mic and the cards point at its teeth)
    croc.sway(G.screen === 'title' && !T.on);
    if (G.screen !== 'title' || T.on || !ORBIT.L.length) return;
    // the ring round the croc's waist, like Halli Galli's round the bell's base: its front low — a front letter's top
    // at the front teeth's feet (jaw point − 0.09 × the box height), so the big front letters never cover the teeth;
    // they pass behind START and run a little off the bottom edge in landscape — its back behind the croc's head, its
    // ends beside the croc (between the side cards and the cards lying at the bottom)
    const box = croc.screenBox(), jaw = croc.jawScreen(), W = window.innerWidth, H = window.innerHeight, U = u(), LS = ORBIT.FONT * U;
    const big = LS * ORBIT.MAX, bh = box.bottom - box.top;                       // big: a front letter's height
    const st = $('#start').getBoundingClientRect(), stOn = st.width > 0, stX = (st.left + st.right) / 2, stW = st.width / 2;
    // … and at least as low as START's middle (portrait: the front-side letters pass under the side teeth)
    const frontY = Math.max(jaw.y - 0.09 * bh + big * 0.5 + 0.5 * U, stOn ? (st.top + st.bottom) / 2 : 0), backY = box.top + bh * 0.38;
    const cx = (box.left + box.right) / 2, cy = (frontY + backY) / 2, ry = Math.max(0, (frontY - backY) / 2);
    const rx = Math.min((box.right - box.left) * 0.69, W / 2 - big * 0.42);
    const still = stillMotion.matches;
    const TS = window.ORBIT_T != null ? window.ORBIT_T : still ? 0 : now / 1000;
    ORBIT.L.forEach((c, k) => {
      const a = c.a0 + (TS / ORBIT.PERIOD) * Math.PI * 2, s = Math.sin(a), depth = (s + 1) / 2;   // 0 = back, 1 = front
      const q = ((TS - c.off) % c.every + c.every) % c.every, p = still || q >= ORBIT.SPIN ? 0 : q / ORBIT.SPIN;
      const spin = 360 * easeIO(p), hop = Math.sin(Math.PI * p) * 3.4 * U * (0.6 + 0.4 * depth);
      const sc = (ORBIT.MIN + (ORBIT.MAX - ORBIT.MIN) * depth) * popIn((now - ORBIT.t0 - k * 90) / 560);   // small at the back, big in front
      const x = cx + rx * Math.cos(a), y = cy + ry * s - hop, rz = c.tilt + 5 * Math.sin(TS * 0.7 + c.ph);
      const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(3)}) `
        + `perspective(${(40 * U).toFixed(0)}px) rotateZ(${rz.toFixed(1)}deg) rotateY(${spin.toFixed(1)}deg)`;
      const front = s > 0, z = String(Math.round(depth * 100));
      // behind START a front letter fades out, so its foot never pokes out under the button
      const hw = 0.3 * LS * sc, low = stOn && front && y + 0.5 * LS * sc > st.bottom;
      c.f.style.opacity = low ? smooth01(stW - hw * 0.2, stW + hw, Math.abs(x - stX)).toFixed(3) : '1';
      c.f.style.transform = c.b.style.transform = tf;
      c.f.style.zIndex = c.b.style.zIndex = z;
      c.f.style.visibility = front ? 'visible' : 'hidden';
      c.b.style.visibility = front ? 'hidden' : 'visible';
    });
  }
  requestAnimationFrame(orbitFrame);

  // ── pointer: the croc's eyes follow it; teeth light up under it ─────────────────────────────────────
  let lookTimer = null;
  function lookAtPointer(e) {
    croc.look({ x: e.clientX, y: e.clientY });
    clearTimeout(lookTimer);
    lookTimer = setTimeout(() => croc.look(G.screen === 'game' && !G.busy ? avatarPoint(G.turn) : null), 2200);
  }
  window.addEventListener('pointermove', e => {
    lookAtPointer(e);
    if (G.screen !== 'game' || G.busy || e.pointerType === 'touch') { croc.hover(-1); cvCroc.classList.remove('point'); return; }
    const i = croc.pick(e.clientX, e.clientY);
    const ok = i >= 0 && !G.pressed.has(i);
    croc.hover(ok ? i : -1);
    cvCroc.classList.toggle('point', ok);
  });
  cvCroc.addEventListener('pointerdown', e => {
    A.unlock();
    lookAtPointer(e);
    if (G.screen === 'title') {
      // poke the croc on the title: a playful snap (not while it explains the game)
      if (!T.on && croc.hitCroc(e.clientX, e.clientY) && !G.poking) {
        G.poking = true;
        croc.chomp(); A.sfxPlay('chomp');
        setTimeout(() => { croc.reopen(); A.sfxPlay('boing'); }, 650);
        setTimeout(() => { G.poking = false; }, 1100);
      }
      return;
    }
    const i = croc.pick(e.clientX, e.clientY);
    if (i >= 0) onTooth(i);
  });
  window.addEventListener('keydown', e => {
    if (G.screen === 'title' && (e.key === 'Enter' || e.key === ' ')) { $('#start').click(); return; }
    if (G.screen === 'game' && /^[0-9]$/.test(e.key)) onTooth((+e.key + 9) % 10);
  });

  // QA hooks (headless checks)
  window.__croco = { G, croc, goGame, goTitle, onTooth, startRound, showResult, toothScreen, revealSlot, makeCard, T, LANG_KEY, lang: () => LANG, howtoSeen: () => howtoSeen, LEVELS, setLevel, levelUp };
})();
