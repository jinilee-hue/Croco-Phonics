/* Croco Phonics — game flow.
 * Two players take turns pressing the crocodile's teeth. One m-word (FPR K Unit 1 · Lesson 1) is the target shown at
 * the top; every tooth hides one Lesson 1 m-word. A safe tooth pops its picture card out: the game says the sound
 * /m/ and the word, the player says it (mic voice check), the card goes to the player and the turn passes.
 * The tooth that hides the target word makes the croc CHOMP — that player loses 2 cards and the round ends: the player
 * with more cards wins (the same number: a tie, both win).
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
  // music level (× audio.js MUSIC_GAIN 0.56). 0.1 left Croco the quietest of the phonics games, ~8 dB under Eye Catch /
  // Puzzle (-40.6 vs -32.5 LUFS heard; user 2026-11-22: "croco 배경음악만 좀 소리가 기본적으로 작은거 아냐?"); 0.25 = -32.6
  const BGM_LEVEL = 0.25;
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
  // phones held sideways (tablets / PCs never match): the title croc a little smaller and higher, so the bigger START
  // under it stays clear of the front teeth's letters (css: the phone block)
  const PHONE_L = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
  FRAME.titlePhone = { y: 0.635, h: 0.53, el: 12 };
  const titleFrame = () => (PHONE_L.matches ? FRAME.titlePhone : FRAME.title);
  const OPEN_REST = { title: 1, game: 1.32 };          // the game opens the mouth wider: the back teeth clear the upper jaw
  const portrait = () => window.innerWidth < window.innerHeight;
  const u = () => Math.min(window.innerHeight / 100, window.innerWidth * (portrait() ? 0.0095 : 0.0062));
  const CARD_W = { reveal: 34, bite: 40 };          // card widths in u (user: "카드가 너무 작아" — were 27)
  const SVG_SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5v5a1 1 0 0 0 1 1h3l4.4 3.7a.8.8 0 0 0 1.3-.6V5.4a.8.8 0 0 0-1.3-.6L7 8.5H4a1 1 0 0 0-1 1z"/><path d="M15.6 8.2a5 5 0 0 1 0 7.6M18.3 5.6a8.6 8.6 0 0 1 0 12.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const SVG_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0" fill="none" stroke="#ff7d2e" stroke-width="2.2" stroke-linecap="round"/><path d="M12 17.5V21" stroke="#ff7d2e" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const SVG_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

  const G = { screen: 'title', token: 0, busy: true, target: null, nextTarget: null, winner: null, lastTarget: null, teeth: [], pressed: new Set(), turn: 0, starter: 0, got: [[], []], idle: null, said: new Set(), level: 0, bootHowto: null, wins: {},
    jumpTold: false,          // the JUMP guide was shown in this round (once per round/level, on the first quiet turn)
    stat: null,               // this round's say turns: said / missed / jumped / skipped, cards lost on the trap, + its start time (progress record)
    last: null,               // the finished round's stat + each player's cards (cards: [p1, p2])
    step: 1, poor: 0,         // the game step inside the lesson (STEPS, 1…3) + poor rounds in a row there
    plan: null };             // the result's next game { level, step, up: 'step' | 'lesson' | '', verdict } (planNext)
  // the shared progress record of the phonics games (js/phonics-progress.js, phonics-kit; localStorage 'phonics.progress')
  const PP = window.PhonicsProgress || null, GAME_ID = 'croco';
  const progress = () => (PP ? PP.get(GAME_ID) : { level: null, maxLevel: null, best: {} });

  // ── the 3D croc (js/croc.js) on the three.js stage (js/stage.js) ─────────────────────────────────────
  Stage.init($('#croc'), { preserve: /[?&]shot\b/.test(location.search) });
  const croc = Stage.view(Croc.build(Stage.scene));
  croc.lively(true);                              // steam puffs + toe taps (user: "콧김이 난다던가 … 발가락을 움직인다던가")
  Stage.setCroc(croc);
  croc.setFrame(titleFrame());
  PHONE_L.addEventListener('change', () => { if (G.screen === 'title') croc.setFrame(titleFrame()); });   // (turned sideways / upright)
  // the playroom tilts with the camera: css .room reads --tilt (0 = the title's 12°, 1 = the game's 35°) (user: "게임화면에서 악어가 기울어졌을때 뒤에 배경도 같이 기울어지면 안돼?")
  let tiltWas = -1;
  Stage.onTick.push(() => {
    const k = Math.max(0, Math.min(1, (Stage.frame.el - FRAME.title.el) / (FRAME.game.el - FRAME.title.el)));
    if (Math.abs(k - tiltWas) > 0.001) { tiltWas = k; app.style.setProperty('--tilt', k.toFixed(3)); }
  });
  /* the game view's backdrop (css .room; user: "게임화면에 배경을 너무 늘린거 같은데.."): the picture's floor line (72 % down
     it) comes up to ~64 % of the screen by panning the picture up inside its own spare height first (cover leaves 44 %
     of the overflow below it: no zoom, no stretch), then zooming from the bottom centre only for what's left
     (1.12…1.3; ≥ 1.1 keeps the 4° lean's top corners covered). Wide screens pan, 4:3 and portrait (no spare height) zoom */
  const bgPic = new Image();
  function fitRoom() {
    const room = $('.room'), W = room.clientWidth, H = room.clientHeight;
    if (!W || !H) return;
    const k = Math.max(W / (bgPic.naturalWidth || 2400), H / (bgPic.naturalHeight || 1792)), ih = (bgPic.naturalHeight || 1792) * k;
    const over = Math.max(0, ih - H), floor = -0.56 * over + 0.72 * ih, want = 0.635 * H;
    const slide = Math.max(0, Math.min(0.44 * over, floor - H + (H - want) / 1.12));
    const zoom = Math.min(1.3, Math.max(1.12, (H - want) / (H - floor + slide)));
    app.style.setProperty('--room-slide', slide.toFixed(1) + 'px');
    app.style.setProperty('--room-zoom', zoom.toFixed(3));
  }
  bgPic.onload = fitRoom;
  bgPic.src = 'assets/img/bg.webp';
  fitRoom();
  window.addEventListener('resize', fitRoom);
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
    // the top (trap) card fits each picture's DRAWN area, so every drawing comes out the same size (css .card.tgt
    // .pic img.fit; tools/card_boxes.py; user: "상단 카드에 이미지 크기 제각각 인거 같은데 크기 통일되게 맞춰줘")
    const bx = (opts.cls || '').split(' ').includes('tgt') && window.CROCO_CARD_BOX
      && CROCO_CARD_BOX[w.card.split('/').pop().replace(/\.\w+$/, '')];
    const ar = bx ? bx[2] / bx[3] * 0.9499 : 1;                     // the drawing's aspect in px (canvas 512×539)
    const fit = bx ? ` class="fit" style="--bx:${bx[0]};--by:${bx[1]};--bw:${bx[2]};--bh:${bx[3]};--r:${ar.toFixed(4)};--q:${(1 / Math.sqrt(ar)).toFixed(4)}"` : '';
    el.innerHTML = `<div class="pic"><img src="${w.card}"${fit} alt="" draggable="false"></div>`
      + `<div class="word">${pa}<b>${pb}</b>${pc}</div>`
      + (opts.sound ? `<div class="snd" role="button" aria-label="Listen: ${word}">${SVG_SPK}</div>` : '')   // speaker only (no M)
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
  /* game steps inside a lesson (phonics-kit README 공통 규칙: 레벨, user 2026-11-22): a lesson is played in 3 steps —
     ★ 1 trap tooth, ★★ 2, ★★★ 3 (the trap word on that many teeth). From ★★ the round's first tooth never bites (a trap
     pressed first trades words with a safe tooth still up), so a round with 2–3 trap teeth still gets going: safe teeth
     before the bite ≈ 4.5 / 3.3 / 2.5 on average. A round done well (the players together said ≥ 3 words right and
     missed — wrong twice, quiet or JUMP — ≤ 1) → the next step; well at ★★★ → the next lesson at ★. Poor (≤ 1 said
     right) twice in a row → one step down (never below ★, never an earlier lesson); else the same step again.
     Kept per device: croco.step.v1 {lesson, step, poor} (PhonicsProgress keeps the lesson) */
  const STEPS = [{ traps: 1, safe: 0 }, { traps: 2, safe: 1 }, { traps: 3, safe: 1 }];
  const STEP_KEY = 'croco.step.v1';
  const STEP = () => STEPS[G.step - 1] || STEPS[0];
  /* a level: the croc's teeth, the title's clay letters and cards, the level tag and banner follow it */
  const DECOR1 = ['monkey', 'map', 'mouse', 'moon'];          // level 1's title cards, as they were
  function setLevel(i) {
    G.level = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    const L = LV();
    WORDS = L.words;
    BY = Object.fromEntries(WORDS.map(w => [w.w, w]));
    if (G.nextTarget && !BY[G.nextTarget]) G.nextTarget = null;     // the explanation's trap word was another level's
    app.dataset.level = String(G.level + 1);
    app.classList.toggle('lastlv', G.level >= LEVELS.length - 1);
    teethLetters(true);
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
  function renderWins(pop = []) {
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
      const c = pop.includes(p) && box.querySelector('.wchip.cur');
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
    const pk = $('#lvPick');                                  // the title's level chip (levelMenu)
    pk.querySelector('.n').textContent = G.level + 1;
    pk.querySelector('b').textContent = lvLabel(L);
    pk.setAttribute('aria-label', `${tr('level', { n: G.level + 1 })} · ${L.title} — ${tr('a_levels')}`);
    $('#lvMenu .lm-panel').setAttribute('aria-label', tr('a_levels'));
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
  /* a round's tension 0…1: the music (tempo, heartbeat) and the croc (toe taps) */
  function tense(k) { A.setTension(k); croc.nervous(k); }
  async function startRound() {
    const tok = ++G.token;
    G.busy = true;
    tense(0);
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
    G.stat = { said: 0, missed: 0, jumped: 0, skipped: 0, lost: 0, t0: performance.now() };
    G.jumpTold = false;                                // a round (판) at this level: the JUMP guide may show once again
    if (PP) PP.setLevel(GAME_ID, G.level + 1);         // the level reached: the title offers to continue from it
    G.plan = null;
    store(STEP_KEY, { lesson: G.level + 1, step: G.step, poor: G.poor });   // … and the step played in it
    const pool = WORDS.map(w => w.w);
    let target;
    do { target = pool[rand(pool.length)]; } while (pool.length > 1 && target === G.lastTarget);
    if (G.nextTarget) { target = G.nextTarget; G.nextTarget = null; }      // the word the intro's explanation used
    if (window.__test && window.__test.target) target = window.__test.target;
    if (BY[Q.get('target')]) target = Q.get('target');
    G.lastTarget = target; G.target = target;
    // 10 teeth: the trap word on the step's trap teeth (1–3), the level's other words on the rest (dealt again when a
    // level has fewer)
    const traps = STEP().traps, rest = pool.filter(w => w !== target), others = [];
    while (rest.length && others.length < croc.N_TEETH - traps) others.push(...shuffle(rest.slice()));
    others.length = Math.min(others.length, croc.N_TEETH - traps);
    G.teeth = shuffle([...Array(traps).fill(target), ...others]);
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
    // steps 2–3: "Watch out! Two / Three trap teeth!" — said only, never shown (the user's call)
    if (traps > 1 && A.has('t:trap' + traps)) { await say('t:trap' + traps); if (tok !== G.token) return; }
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
    const tok = G.token, p = G.turn;
    G.busy = true;
    clearIdle();
    A.stopVoice();
    G.pressed.add(i);
    // from ★★ the round's first tooth never bites (STEPS): the trap word trades places with a safe tooth still up
    if (G.teeth[i] === G.target && G.pressed.size <= STEP().safe) {
      const up = [...G.teeth.keys()].filter(k => !G.pressed.has(k) && G.teeth[k] !== G.target);
      if (up.length) { const k = up[rand(up.length)]; [G.teeth[i], G.teeth[k]] = [G.teeth[k], G.teeth[i]]; }
    }
    const word = G.teeth[i];
    croc.hover(-1);
    croc.press(i);
    A.sfxPlay('tap');
    croc.look(toothScreen(i));
    A.sfxPlay('drum');
    await sleep(620);
    if (tok !== G.token) return;
    if (word === G.target) return chomp(i, p, tok);
    // tension: the fewer safe teeth are left, the faster the music; a heartbeat from half way (audio.js setTension);
    // the croc taps its toes more often
    tense(G.pressed.size / (croc.N_TEETH - STEP().traps));
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
    const said = await sayIt(word, card, tok);
    if (tok !== G.token) return;
    card.classList.remove('busy');
    if (!said) {
      // not said (JUMP, 2 wrong tries, quiet, or it couldn't be judged): nobody gets the card (phonics-kit rule 6) —
      // it shrinks away where it is and the turn passes
      A.sfxPlay('whoosh');
      await card.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.55 }], { duration: 420, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      f.el.remove();
      if (tok !== G.token) return;
      await sleep(150);
      setTurn(1 - p);
      return;
    }
    // onto the player's pile: the pile makes a place, the card arcs over (sparkle trail) and lands on it
    G.got[p].push(word);
    walletAdd(1);                                // CHARACTERS: +1 card to spend (the trap's cost never takes it back)
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

  /* "say it" — the phonics-kit rules for every phonics game (user 2026-11-22, launcher F0 · F3; reference Phonics Match
     sayItTurn / skipSay / jumpGuide). The word earns its card only when it is heard right:
     - JUMP (the green button on the card's top corner) is up for the whole turn: it skips the word — no card
     - 2 wrong tries → "Good try!" and on — no card
     - silence → the croc reads it once more and waits again; ~20 s with no word → on — no card (never for ever).
       The first quiet turn of a level the glove taps JUMP while the croc says "Want to skip? Tap the jump button!"
     - the judge: the company phonics-api when this device has a key, else the on-device recogniser (js/stt.js, whisper
       tiny.en in a worker, loaded after the first touch; user 2026-11-22: every phonics game has it as the backup)
     - can't be judged (no mic / refused, or neither judge: no key / a failed call AND the recogniser off, failed or
       still loading after ~8 s) → the say turn is skipped — no card. Any sound never passes.
     Home / Exit still end the round (the token). The mic sits in the middle of the screen on the croc's lower jaw
     (user: "마이크는 화면 가운데 악어 아래 턱에 겹쳐서"). Resolves true = said right (the card goes to the player). */
  function placeMic() { const mc = $('#mic'), p = croc.jawScreen(); mc.style.left = p.x + 'px'; mc.style.top = p.y + 'px'; return mc; }
  /* the word said, checked by the company phonics-api when this device has a key (js/phonics-api.js; the samples of
     the listen go once to /v1/speech/analyze, the server keeps no audio) against the level's other words; when it
     can't answer (no key, offline, busy, a failed call) by the on-device recogniser (js/stt.js; 'ok' only when the word
     itself is heard, another level word → a miss):
     'ok' | 'miss' (a try at it, not right) | 'other' (far from the word: not the child's) | null (can't judge: no card).
     QA: scripted listens (__test.heard) are judged by the script — true → 'ok', or the verdict itself ('miss', 'other',
     'cant' = can't judge) */
  const PH = window.CROCO_PH || {};
  const scripted = () => !!(window.__test && window.__test.heard != null);
  const apiOk = word => !!(window.PhonicsAPI && PhonicsAPI.usable() && PH[word]);
  const devOk = () => !!(window.STT && STT.state === 'ready');
  const canJudge = word => scripted() || apiOk(word) || devOk();
  // for whisper: peak-normalised, 0.25 s of silence each side (Eye Catch Mic.prepare)
  function forDevice(pcm) {
    let peak = 0; for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    const g = peak > 0.001 ? Math.min(8, 0.9 / peak) : 1, pad = 4000, out = new Float32Array(pcm.length + pad * 2);
    for (let i = 0; i < pcm.length; i++) out[pad + i] = pcm[i] * g;
    return out;
  }
  async function judgeWord(word, heard) {
    if (scripted()) return heard === true || heard === 'ok' ? 'ok' : heard === 'miss' || heard === 'other' ? heard : null;
    const pcm = Mic.lastPcm;
    if (!pcm || !canJudge(word)) return null;
    const pcm16 = await PhonicsAPI.to16k(pcm, Mic.sr), rivals = LV().words.map(w => w.w).filter(w => w !== word);
    if (apiOk(word)) {
      const r = await PhonicsAPI.analyze(PhonicsAPI.encodeWav(pcm16, 16000), word);
      if (r.ok) {
        const j = PhonicsAPI.judge(r.data, word, rivals, PH);
        G.lastJudge = { by: 'phonics-api', word, verdict: j.verdict, heard: j.heard, rel: j.rel, ms: r.ms };
        if (Q.has('log')) console.log('phonics-api', JSON.stringify(G.lastJudge));
        if (j.verdict === 'ok') return 'ok';
        if (j.verdict === 'wrong' || (j.verdict === 'unclear' && j.rel <= 0.7)) return 'miss';
        return 'other';
      }
      if (Q.has('log')) console.log('phonics-api failed -> on-device', r.reason, r.status || '');
    }
    if (!window.STT || STT.state === 'off' || STT.state === 'error') return null;
    const v = await STT.judge(forDevice(pcm16), word, rivals);         // null: it failed / timed out → can't judge
    const text = STT.last && STT.last.text || '';
    G.lastJudge = { by: 'device', word, verdict: v, text, ms: STT.last && STT.last.ms };
    if (Q.has('log')) console.log('device', JSON.stringify(G.lastJudge));
    if (v === 'ok') return 'ok';
    if (v === 'wrong') return 'miss';                                  // another word of the level
    if (v === 'unclear') return /[a-z0-9]/i.test(text) ? 'miss' : 'other';   // nothing in it: not counted, read again
    return null;
  }

  /* the say turn's JUMP: S.jumped cuts the turn's lines, pauses and listens short (one cut per turn, S.cutP) */
  const S = { on: false, jumped: false, cut: null, cutP: null };
  async function turnSay(key, minMs = 0) { if (!S.jumped) await Promise.race([say(key, minMs), S.cutP]); }
  async function turnWord(word, card, tok) { if (!S.jumped) await Promise.race([sayWord(word, card, tok), S.cutP]); }
  async function turnPause(ms) { if (!S.jumped) await Promise.race([sleep(ms), S.cutP]); }
  function placeJump(card) {
    const jb = $('#jump'), r = card.getBoundingClientRect(), right = r.left + r.width / 2 < window.innerWidth / 2;
    // the card's top corner toward the croc (player 1's card sits left of it, player 2's right); the ✓ of a word said
    // right comes up in the top-right corner
    jb.style.left = (right ? r.right - r.width * 0.1 : r.left + r.width * 0.1) + 'px';
    jb.style.top = (r.top + r.width * 0.06) + 'px';
    return jb;
  }
  function skipSay(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!S.on || S.jumped) return;
    S.jumped = true;
    A.unlock();
    A.sfxPlay('tap');
    A.stopVoice();
    $('#jump').classList.remove('show');
    if (S.cut) S.cut();
  }
  $('#jump').addEventListener('pointerdown', skipSay);
  $('#jump').addEventListener('click', e => { e.stopPropagation(); skipSay(); });   // keyboard
  /* "Want to skip? Tap the jump button!" — the white glove taps JUMP twice (it hops each time) while the croc says it
     (Phonics Match jumpGuide); once per level, on the first quiet turn. Without the clip it is the glove only. */
  async function jumpGuide(jb) {
    const h = $('#hint'), r = jb.getBoundingClientRect();
    h.style.left = (r.left + r.width * 0.56) + 'px';
    h.style.top = (r.top + r.height * 0.6) + 'px';
    h.classList.add('show', 'on-jump');
    const hop = () => { if (S.jumped) return; jb.classList.remove('poke'); void jb.offsetWidth; jb.classList.add('poke'); A.sfxPlay('tap'); };
    const t1 = setTimeout(hop, 700), t2 = setTimeout(hop, 1900);
    try {
      if (A.has('t:jump')) await Promise.all([turnSay('t:jump'), turnPause(2600)]);
      else await turnPause(2800);
    } finally { clearTimeout(t1); clearTimeout(t2); h.classList.remove('show', 'on-jump'); jb.classList.remove('poke'); }
  }

  async function sayIt(word, card, tok) {
    const mic = placeMic(), jb = placeJump(card);
    const live = () => tok === G.token && !S.jumped;
    let out = 'missed';                                       // said | missed (wrong ×2, quiet) | skipped (can't judge) | jumped
    Object.assign(S, { on: true, jumped: false });
    S.cutP = new Promise(r => { S.cut = r; });
    jb.classList.remove('poke', 'show');
    const showJump = () => jb.classList.add('show');       // jumps in (css jump-in) as the turn starts
    try {
      // the mic is still being asked for (or never was): wait for the answer, ~20 s at most — JUMP works meanwhile
      if (!scripted() && (Mic.state === 'off' || Mic.state === 'asking')) {
        showJump();
        if (Mic.state === 'off') Mic.init();
        const t0 = performance.now();
        while (live() && Mic.state === 'asking' && performance.now() - t0 < 20000) await turnPause(100);
        if (!live()) return false;
      }
      // can't judge: no mic, or neither phonics-api nor the on-device recogniser — the say turn is skipped, no card.
      // (QA: scripted listens need no microphone, as before; __test.mic = false still means none)
      const micOk = scripted() ? window.__test.mic !== false : Mic.ready();
      // no server judge and the recogniser still loading: wait for it ~8 s at most — JUMP works meanwhile
      if (micOk && !scripted() && !apiOk(word) && window.STT) {
        if (STT.state === 'off') STT.preload();
        if (STT.state === 'loading') { showJump(); await Promise.race([STT.whenReady(8000), S.cutP]); }
        if (!live()) return false;
      }
      if (!micOk || !canJudge(word)) { out = 'skipped'; return false; }
      showJump();
      mic.classList.add('listen');
      const lv = v => mic.style.setProperty('--lv', v.toFixed(3));
      await turnSay('t:sayit', 600);
      let misses = 0, quiet = 0;
      for (let round = 0; round < 6 && live(); round++) {
        // 5.5 s, then 7.5 s after the word is read again: ~20 s from "Now say the word." to moving on (with the guide)
        const heard = await Mic.listen({ maxMs: quiet ? 7500 : 5500, onLevel: lv, cancel: () => !live() });
        if (!live()) break;
        if (heard === null) { out = 'skipped'; return false; }              // the mic went away: can't judge
        if (heard) {
          const v = await judgeWord(word, heard);
          if (!live()) break;
          if (v === 'ok') {
            out = 'said';
            S.on = false;                                                    // no JUMP over the reward
            mic.classList.remove('listen');
            jb.classList.remove('show');
            card.classList.add('good');
            A.sfxPlay('great');
            const r = card.getBoundingClientRect();
            FX.burst(r.left + r.width / 2, r.top + r.height / 2, { kind: 'stars', n: 22 });
            await say(['t:great2', 't:great3'][rand(2)], 500);
            return true;
          }
          if (v === null) { out = 'skipped'; return false; }                 // the server failed: can't judge
          if (v === 'miss') {
            if (++misses >= 2) { mic.classList.remove('listen'); await turnSay('t:goodtry', 300); return false; }   // "Good try!"
            await turnSay('t:again', 200);                                    // "Try again! Listen."
          }
          // 'other' (far from the word: someone else talking): the word again, not counted
          await turnWord(word, card, tok); await turnSay('t:sayit', 300);
          continue;
        }
        // silence: the word once more, then one more wait; quiet again → on, no card
        if (++quiet >= 2) break;
        if (!G.jumpTold) { G.jumpTold = true; await jumpGuide(jb); if (!live()) break; }
        await turnWord(word, card, tok); await turnSay('t:sayit', 300);
      }
      return false;
    } finally {
      if (S.jumped) out = 'jumped';
      if (tok === G.token && G.stat) G.stat[out]++;
      S.on = false;
      if (S.cut) S.cut();
      jb.classList.remove('show', 'poke');
      $('#hint').classList.remove('show', 'on-jump');
      mic.classList.remove('listen', 'nomic');
      mic.style.setProperty('--lv', 0);
    }
  }

  // ── the bad tooth: CHOMP ─────────────────────────────────────────────────────────────────────────────
  async function chomp(i, p, tok) {
    const t = $('#target');
    tense(0);
    croc.snort(1.6);                             // a big double snort of steam before the bite
    A.sfxPlay('huff');
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
    await penalty(p, tok);                       // the trap's cost: 2 cards off the bitten player's pile
    if (tok !== G.token) return;
    // the word that bit, once more (user: "마지막 걸린 단어 다시 한번 음가랑 단어 읽어주고"): its sound, then the word
    await sayWord(G.target, card, tok);
    if (tok !== G.token) return;
    await sleep(200);
    if (tok !== G.token) return;
    const [n0, n1] = G.got.map(g => g.length);
    showResult(n0 > n1 ? 0 : n1 > n0 ? 1 : -1, tok, p);         // more cards wins; the same number = a tie
  }
  /* the trap's cost (user 2026-11-22: the game needs a cost, and the cards decide the winner): the bitten player loses
     2 cards, or as many as the pile has — the top ones fly off it and fade, a "−2" pops over it, with the bite's snap.
     Resolves the number lost; the pile and its count are drawn again without them */
  const PENALTY = 2;
  async function penalty(p, tok) {
    const n = Math.min(PENALTY, G.got[p].length);
    if (G.stat) G.stat.lost = n;
    if (!n) return 0;
    G.got[p].splice(-n);
    const st = document.querySelector(`.player.p${p + 1} .stack`), r = st.getBoundingClientRect(), dir = p === 0 ? 1 : -1;
    const pop = document.createElement('div');
    pop.className = 'minus';
    pop.textContent = '\u2212' + n;
    pop.style.left = r.left + r.width / 2 + 'px';
    pop.style.top = r.top - u() + 'px';
    $('#cards').appendChild(pop);
    A.sfxPlay('chomp');
    const shown = pop.animate([{ scale: 0.3, opacity: 0 }, { scale: 1.25, opacity: 1, offset: 0.22 }, { scale: 1, opacity: 1, translate: '0 0', offset: 0.36 },
      { scale: 1, opacity: 1, translate: '0 0', offset: 0.72 }, { scale: 0.9, opacity: 0, translate: `0 ${-6 * u()}px` }], { duration: 1500, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    const cnt = st.querySelector('.count');
    if (cnt) {
      if (G.got[p].length) cnt.textContent = G.got[p].length; else cnt.style.visibility = 'hidden';
      cnt.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
    }
    const minis = [...st.querySelectorAll('.mini')].slice(-n).reverse();          // the top card first
    await Promise.all(minis.map((m, k) => m.animate([{ translate: '0 0', rotate: '0deg', opacity: 1 },
      { translate: `${dir * 7 * u()}px ${-15 * u()}px`, rotate: `${dir * 30}deg`, opacity: 0 }],
      { duration: 640, delay: k * 150, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' }).finished.catch(() => {})));
    renderStack(p);
    await shown;
    pop.remove();
    return n;
  }

  /* winner = the player with more cards after the trap's cost, −1 = a tie (both win); bitten = who pressed the trap */
  async function showResult(winner, tok, bitten = winner < 0 ? G.turn : 1 - winner) {
    G.screen = 'result';
    app.dataset.screen = 'result';
    G.starter = bitten;                          // the one who got bitten starts the next round
    const won = k => winner < 0 || k === winner;
    document.querySelectorAll('.player').forEach((el, k) => { el.classList.toggle('on', false); el.classList.toggle('win', won(k)); el.classList.toggle('lose', !won(k)); });
    $('#turn').classList.remove('show');
    G.winner = winner;
    applyPicks();
    const wl = G.wins[G.level] = G.wins[G.level] || [0, 0];
    [0, 1].filter(won).forEach(k => wl[k]++);
    // the round in the shared record: level, who won (0 = a tie), each player's cards, the cards lost on the trap, who
    // pressed it, safe teeth pressed, words said right / not, seconds
    const st = G.stat || { said: 0, missed: 0, jumped: 0, skipped: 0, lost: 0, t0: performance.now() };
    st.cards = G.got.map(g => g.length);
    if (PP) PP.played(GAME_ID, { level: G.level + 1, step: G.step, winner: winner + 1, tie: winner < 0, cards1: st.cards[0], cards2: st.cards[1],
      lost: st.lost, bitten: bitten + 1, teeth: G.pressed.size - 1, words: st.said,
      misses: st.missed, jumped: st.jumped, skipped: st.skipped, time: Math.round((performance.now() - st.t0) / 100) / 10 },
      { higher: ['teeth'] });
    G.last = st;                                 // this round's stats (the last result), for QA
    G.stat = null;
    planNext(st);
    setTimeout(() => { if (tok === G.token) renderWins([0, 1].filter(won)); }, 650);
    setRibbon(winner + 1);
    A.sfxPlay('fanfare');
    FX.pop(window.innerWidth * 0.25, window.innerHeight * 0.6, 60);
    FX.pop(window.innerWidth * 0.75, window.innerHeight * 0.6, 60);
    FX.rain(2600, 150);
    await sleep(700);
    if (tok !== G.token) return;
    await say(winner < 0 ? 't:great3' : winner ? 't:win2' : 't:win1');      // a tie: "Yes! You did it!" (no new line)
  }
  /* the round's verdict → the next game (STEPS): kept at once (START continues with it), and the result's buttons —
     done well: "Next Level" (+ Play Again) — the next step of this lesson or the next lesson, the same button and words
     (user 2026-11-23: no "LEVEL UP! ★★☆" tag on it — the level tag's stars show the step); the same step or one down:
     Play Again only */
  function planNext(st) {
    const good = st.said >= 3 && st.missed + st.jumped <= 1, poor = st.said <= 1;
    let level = G.level, step = G.step, up = '';
    G.poor = poor ? G.poor + 1 : 0;
    if (good && step < STEPS.length) { step++; up = 'step'; }
    else if (good && level < LEVELS.length - 1) { level++; step = 1; up = 'lesson'; }
    else if (G.poor >= 2) { step = Math.max(1, step - 1); G.poor = 0; }
    G.plan = { level, step, up, verdict: good ? 'good' : poor ? 'poor' : 'ok' };
    store(STEP_KEY, { lesson: level + 1, step, poor: G.poor });
    if (up === 'lesson' && PP) PP.setLevel(GAME_ID, level + 1);
    app.classList.toggle('go-next', !!up);
  }
  /* the plan taken without Next: Exit to the title takes it as kept (START continues there); Play Again stays in this
     lesson at the planned step, never up */
  function takePlan(up) {
    const P = G.plan;
    G.plan = null;
    if (!P) return;
    if (P.level !== G.level) { if (up) { G.step = P.step; setLevel(P.level); } return; }
    G.step = up ? P.step : Math.min(G.step, P.step);
    levelText();
  }

  // ── screens ──────────────────────────────────────────────────────────────────────────────────────────
  function goGame() {
    IM.splice(0).forEach(a => a.cancel());
    G.screen = 'game';
    app.dataset.screen = 'game';
    teethLetters();
    croc.setFrame(FRAME.game, 900);
    croc.rest(OPEN_REST.game);
    A.setTrack('game');                          // the exciting, tense loop (user: "좀더 신나고 긴장감 넘치는 음악")
    startRound();
  }
  function goTitle() {
    ++G.token;
    takePlan(true);                              // from the result: START continues with the next game (as kept)
    A.stopVoice();
    clearIdle();
    endTutorial();
    $('#mic').classList.remove('listen', 'nomic');
    $('#jump').classList.remove('show', 'poke');
    G.screen = 'title';
    G.busy = true;
    app.dataset.screen = 'title';
    A.setTrack('title'); tense(0);
    $('#cards').innerHTML = '';
    $('#turn').classList.remove('show');
    $('#lvUp').classList.remove('show', 'say');
    $('#target').classList.remove('alarm', 'intro');
    document.querySelectorAll('.player').forEach(p => p.classList.remove('win', 'lose', 'on'));
    croc.setFrame(titleFrame(), 900);
    croc.rest(OPEN_REST.title);
    croc.reopen();
    croc.resetTeeth(0.04);
    for (let i = 0; i < croc.N_TEETH; i++) croc.glow(i, 0);
    croc.surprise(0);
    croc.happy(0);
    introMotion(false);
  }

  // ── language: EN | 한 in the top bar, on the title only (user: "튜터설명에 한글과 영어버전 설명 듣는게 있어야해" → a
  //    toggle like Magic Block's, remembered per device; a first visit starts in Korean). It switches the croc's voice +
  //    bubbles only; every screen word and the result banner stay English in both (user 2026-11-22: "화면 글자는 모두
  //    영어로"), and the words and the /m/ sound are English anyway. Korean voice = 'k:' clips (tools/build_voice.py);
  //    audio.js plays 'k:x' for 't:x' in Korean.
  const LANG_KEY = 'croco.lang.v1';
  let LANG = (() => { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ko'; } catch (e) { return 'ko'; } })();
  const UI = { p1: 'Player 1', p2: 'Player 2', turn: 'Your turn!', wins: 'Player {n} Wins!', tie: "It's a Tie!", again: 'Play Again', next: 'Next Level', level: 'Level {n}', levelup: 'Level {n}!', skip: 'Skip',
    a_skip: 'Skip the explanation', a_lang: 'Language: English or Korean', a_sound: 'Sound on/off', a_exit: 'Exit', a_jump: 'Jump', a_levels: 'Levels', a_locked: 'locked',
    chars: 'CHARACTERS', a_chars: 'Characters', a_close: 'Close', a_wallet: 'Cards' };
  const tr = (k, v = {}) => (UI[k] || k).replace(/\{(\w+)\}/g, (_, x) => (v[x] != null ? v[x] : ''));
  /* the result banner's text: a baked puffy sprite like the logo's letters (tools/make_banner_text.py → CROCO_RB) over
     the live text (transparent, it sizes the band); a text the tool hasn't baked shows as plain styled text */
  function setRibbon(n) {                       // n = the winner (1, 2), 0 = a tie (no baked sprite: plain styled text)
    const t = n ? tr('wins', { n }) : tr('tie'), key = 'en_' + (n || 'tie'), RB = window.CROCO_RB || {}, im = $('#rbImg');
    $('#rbText').textContent = t;
    const ok = !!(RB[key] && RB[key].t === t);
    $('.ribbon').classList.toggle('noimg', !ok);
    if (ok) im.src = `assets/img/rb_${key}.webp`; else im.removeAttribute('src');
  }
  $('#rbImg').addEventListener('error', () => $('.ribbon').classList.add('noimg'));
  Object.keys(window.CROCO_RB || {}).filter(k => k.startsWith('en_')).forEach(k => { new Image().src = `assets/img/rb_${k}.webp`; });   // ready before a win
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
    if (G.winner != null) setRibbon(G.winner + 1);
    levelText();
  }
  // phonics-api key (title only): a teacher enters it once per device; the dot shows whether the SERVER judges the word
  // (green) — without it the on-device recogniser does, so the game works with no key too
  const keyBtn = $('#btnKey');
  const showApi = () => { keyBtn.dataset.api = PhonicsAPI.status(); };
  addEventListener('phonicsapi:status', showApi);
  keyBtn.addEventListener('click', async e => { e.stopPropagation(); A.unlock(); A.sfxPlay('tap'); await PhonicsAPI.keyDialog(); showApi(); });
  PhonicsAPI.init().then(showApi);

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
      tut7: 'CHOMP! You lose two cards! Most cards wins!',
      tut8: "Ready? Let's play!",
    },
    ko: {
      tut1: '안녕, 친구들! 나는 크로코야!',
      tut2: '이건 함정 단어야.',
      tut3: '이 단어가 숨은 이빨은 누르면 안 돼!',
      tut4: '번갈아 가며 이빨을 하나씩 눌러 봐.',
      tut5: '카드가 톡 나오면, 이제 단어를 읽어 봐.',
      tut6: '앗! 함정 단어야!',
      tut7: '덥석! 카드 두 장을 잃어! 카드가 많으면 이겨!',
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
    levelMenu(false);
    charsOpen(false);
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
    E($('#lvPick'), [{ scale: 0, opacity: 0 }, { scale: 1.12, opacity: 1, offset: 0.65 }, { scale: 1, opacity: 1 }], { duration: 560, delay: d0 + 1650, easing: 'ease-out' });
    placeLevelPick();
    window.__intro = false;
    clearTimeout(introTimer);
    introTimer = setTimeout(() => { window.__intro = true; }, d0 + 2250);
  }
  /* ── the level START plays (phonics-kit F1, user 2026-11-22: levelled games get continue + level select on the title):
     the chip left of START shows it — the page opens on the saved level, so START continues there — and opens the
     levels. Open: every level reached and the one after the highest level with a finished round (Next Level only
     needs one round); the rest show a lock. Picking one says its sound. */
  function unlockedTop() {
    const r = progress();
    return Math.max(1, Math.min(LEVELS.length, Math.max(r.maxLevel || 1, ((r.best && r.best.level) || 0) + 1)));
  }
  const SVG_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.2" y="10.6" width="13.6" height="9.6" rx="2.4"/><path d="M8.4 10.6V8.2a3.6 3.6 0 0 1 7.2 0v2.4"/></svg>';
  function placeLevelPick() {
    const st = $('#start'), pk = $('#lvPick');
    if (!st.offsetWidth) return;
    // START is centred by translateX(-50%): its layout box starts at offsetLeft − half its width
    pk.style.left = (st.offsetLeft - st.offsetWidth / 2 - 1.8 * u() - pk.offsetWidth) + 'px';
    pk.style.top = (st.offsetTop + (st.offsetHeight - pk.offsetHeight) / 2) + 'px';
  }
  function levelMenu(open) {
    const m = $('#lvMenu'), pk = $('#lvTag'), panel = m.querySelector('.lm-panel');   // (the game's level tag opens it)
    if (open) {
      const top = unlockedTop();
      panel.innerHTML = LEVELS.map((L, k) => {
        const on = k < top || k === G.level;                  // (?level=N may start past the open ones)
        return `<button class="lm-t${k === G.level ? ' cur' : ''}${on ? '' : ' lock'}" data-k="${k}" style="--edge:${EDGES[k % EDGES.length]}"`
          + ` aria-label="${tr('level', { n: k + 1 })} · ${L.title}${on ? '' : ' · ' + tr('a_locked')}"${on ? '' : ' aria-disabled="true"'}>`
          + `<span class="n">${k + 1}</span><b>${lvLabel(L)}</b>${on ? '' : SVG_LOCK}</button>`;
      }).join('');
      // under the tag, its tail pointing at it
      const r = pk.getBoundingClientRect();
      panel.classList.add('below');
      panel.style.setProperty('--tx', (r.left + r.width / 2) + 'px');
      panel.style.setProperty('--ty', (r.bottom + 2.6 * u()) + 'px');
    }
    m.classList.toggle('show', open);
    m.setAttribute('aria-hidden', String(!open));
    pk.setAttribute('aria-expanded', String(open));
  }
  // (no opener any more: the levels follow one another — START continues, Next Level leads on; user 2026-11-22)
  $('#lvMenu').addEventListener('click', e => {
    e.stopPropagation();
    if (T.on || G.screen !== 'game') { levelMenu(false); return; }
    const t = e.target.closest('.lm-t');
    if (!t) { levelMenu(false); return; }                    // outside the tiles: close
    A.unlock();
    if (t.classList.contains('lock')) {
      A.sfxPlay('tick');
      t.animate([{ translate: '0 0' }, { translate: '-6% 0' }, { translate: '6% 0' }, { translate: '0 0' }], { duration: 260 });
      return;
    }
    A.sfxPlay('pop');
    levelMenu(false);
    const k = +t.dataset.k;
    if (k !== G.level) levelUp(k);                       // the croc snaps, the new level's banner and sound, a new round
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { levelMenu(false); if (charsIsOpen()) charsOpen(false); } });
  window.addEventListener('resize', placeLevelPick);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeLevelPick);

  /* ── CHARACTERS (user 2026-11-22: "획득한 카드를 쓸곳이 없는데 보상이라 할수 없어" — the cards kept are spent, like
     Phonics Match's coins on outfits): every card a player keeps by saying its word adds 1 to the device's wallet
     (localStorage croco.wallet.v1 {earned, spent}; the first time, earned = the old MY CARDS album's counts); the trap's
     cost takes cards off the pile, never out of the wallet. The title's character button (top left, by the key) opens
     CHARACTERS: a tab per player, the six clay kids — p1 / p2 free, the animal hats 3 / 6 / 9 / 12 cards. A tap on an
     owned one gives it to the tab's player (the other player's: the two swap); a locked one shows its price on the first
     tap and is bought on the second (not enough: the price and the wallet shake, nothing spent). Bought ones
     (croco.owned.v1) and the picks (croco.pick.v1 [Player 1, Player 2]) are kept; the picks show on the players' avatars. */
  const WALLET_KEY = 'croco.wallet.v1', OWNED_KEY = 'croco.owned.v1', PICK_KEY = 'croco.pick.v1';
  // fit / dy: p3–p6 are drawn with a margin round their coloured circle (p5's sits lower, under the ears): scaled so
  // the circle fills the avatar's white ring like p1 / p2's (measured: circle radius 236 / 223 of 256)
  const CHARS = [{ id: 'p1', price: 0, name: 'Girl' }, { id: 'p2', price: 0, name: 'Bear' },
    { id: 'p3', price: 3, name: 'Frog', fit: 1.085 }, { id: 'p4', price: 6, name: 'Tiger', fit: 1.082 },
    { id: 'p5', price: 9, name: 'Bunny', fit: 1.147, dy: -3.06 }, { id: 'p6', price: 12, name: 'Lion', fit: 1.084 }];
  const CH = Object.fromEntries(CHARS.map(c => [c.id, c]));
  const SVG_CARD = '<svg class="ci" viewBox="0 0 24 24" aria-hidden="true"><rect class="bk" x="8.2" y="2.2" width="12" height="16" rx="2.4" transform="rotate(12 14.2 10.2)"/>'
    + '<g transform="rotate(-7 10 13)"><rect class="bd" x="4" y="5" width="12" height="16" rx="2.4"/><path class="st" d="M10 9.4l.88 2.39 2.54.1-1.99 1.57.69 2.45L10 14.5l-2.12 1.41.69-2.45-1.99-1.57 2.54-.1z"/></g></svg>';
  const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: not kept */ } };
  function wallet() {
    let w = load(WALLET_KEY);
    if (!w || typeof w !== 'object') {
      const al = load('croco.album.v1');
      w = { earned: al && typeof al === 'object' ? Object.values(al).reduce((n, c) => n + (c | 0), 0) : 0, spent: 0 };
      store(WALLET_KEY, w);
    }
    return { earned: w.earned | 0, spent: w.spent | 0 };
  }
  const balance = () => { const w = wallet(); return Math.max(0, w.earned - w.spent); };
  function walletAdd(n) { const w = wallet(); if (n > 0) w.earned += n; else w.spent -= n; store(WALLET_KEY, w); }
  const owned = () => { const o = load(OWNED_KEY); return new Set(['p1', 'p2'].concat(Array.isArray(o) ? o.filter(id => CH[id]) : [])); };
  function picks() {
    const p = load(PICK_KEY), o = owned();
    return Array.isArray(p) && p.length === 2 && p[0] !== p[1] && p.every(id => o.has(id)) ? p : ['p1', 'p2'];
  }
  function charImg(img, id) {
    const c = CH[id] || CH.p1;
    img.src = `assets/img/${c.id}.webp`;
    img.style.setProperty('--fit', c.fit || 1);
    img.style.setProperty('--dy', (c.dy || 0) + '%');
  }
  function applyPicks() {                       // the players' avatars (corners, turn, result crown) + the podium's
    const pk = picks();
    [0, 1].forEach(k => charImg($(`.player.p${k + 1} .ava img`), pk[k]));
    charImg($('#champImg'), pk[G.winner === 1 ? 1 : 0]);
  }
  const CHS = { p: 0, ask: null };               // the tab's player; the locked one whose price is up (first tap)
  const charsIsOpen = () => $('#chars').classList.contains('show');
  const chCell = id => $(`#chars .ch-c[data-id="${id}"]`);
  function charsShow() {
    const m = $('#chars'), o = owned(), pk = picks();
    m.querySelector('.ch-n').textContent = balance();
    m.querySelector('.ch-wallet').setAttribute('aria-label', `${tr('a_wallet')}: ${balance()}`);
    m.querySelectorAll('.ch-tab').forEach(t => {
      const k = +t.dataset.p, on = k === CHS.p;
      t.classList.toggle('cur', on);
      t.setAttribute('aria-selected', String(on));
      charImg(t.querySelector('img'), pk[k]);
    });
    m.querySelector('.ch-grid').innerHTML = CHARS.map(c => {
      const has = o.has(c.id), who = pk.indexOf(c.id);
      return `<button class="ch-c${has ? '' : ' lock'}${who === CHS.p ? ' cur' : ''}${CHS.ask === c.id ? ' ask' : ''}" data-id="${c.id}"${who >= 0 ? ` data-who="${who + 1}"` : ''}`
        + ` aria-label="${c.name}${has ? '' : ' · ' + c.price}"><span class="ch-ava"><img alt="" draggable="false"></span>`
        + (who >= 0 ? `<span class="ch-who">${who + 1}</span>` : '')
        + (has ? '' : `<span class="ch-lock">${SVG_LOCK}</span><span class="ch-price">${SVG_CARD}<b>${c.price}</b></span>`) + '</button>';
    }).join('');
    m.querySelectorAll('.ch-c').forEach(b => charImg(b.querySelector('img'), b.dataset.id));
  }
  function charsOpen(open) {
    const m = $('#chars');
    if (open) { levelMenu(false); CHS.ask = null; charsShow(); }
    m.classList.toggle('show', open);
    m.setAttribute('aria-hidden', String(!open));
  }
  const shake = el => el.animate([{ translate: '0 0' }, { translate: '-9% 0' }, { translate: '8% 0' }, { translate: '-5% 0' }, { translate: '3% 0' }, { translate: '0 0' }], { duration: 420, easing: 'ease-out' });
  function charTap(id) {
    const c = CH[id], me = CHS.p, pk = picks();
    if (!c) return;
    if (owned().has(id)) {                                      // give it to the tab's player (the other's: they swap)
      CHS.ask = null;
      if (pk[me] !== id) {
        if (pk[1 - me] === id) pk[1 - me] = pk[me];
        pk[me] = id;
        store(PICK_KEY, pk);
        applyPicks();
      }
      A.sfxPlay('pop');
      charsShow();
      chCell(id).querySelector('.ch-ava').animate([{ scale: 1 }, { scale: 1.12, offset: 0.4 }, { scale: 1 }], { duration: 380, easing: 'ease-out' });
      return;
    }
    if (CHS.ask !== id) {                                       // first tap: the price
      CHS.ask = id;
      A.sfxPlay('tap');
      charsShow();
      chCell(id).querySelector('.ch-price').animate([{ scale: 1 }, { scale: 1.45, offset: 0.45 }, { scale: 1.25 }], { duration: 360, easing: 'ease-out' });
      return;
    }
    if (balance() < c.price) {                                  // not enough: nothing spent
      A.sfxPlay('boing');
      shake(chCell(id).querySelector('.ch-price'));
      shake($('#chars .ch-wallet'));
      return;
    }
    walletAdd(-c.price);
    store(OWNED_KEY, [...owned(), id].filter((x, i, a) => CH[x].price && a.indexOf(x) === i));
    pk[me] = id;
    store(PICK_KEY, pk);
    applyPicks();
    CHS.ask = null;
    charsShow();
    const cell = chCell(id), r = cell.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    A.sfxPlay('great');
    A.sfxPlay('sparkle');
    cell.querySelector('.ch-ava').animate([{ scale: 0.55 }, { scale: 1.2, offset: 0.55 }, { scale: 0.96, offset: 0.8 }, { scale: 1 }], { duration: 620, easing: 'ease-out' });
    $('#chars .ch-wallet').animate([{ scale: 1 }, { scale: 1.25, offset: 0.4 }, { scale: 1 }], { duration: 420, easing: 'ease-out' });
    FX.burst(x, y, { kind: 'sparkle', n: 34, ring: '#ffd34d' });
    FX.burst(x, y, { kind: 'stars', n: 12, speed: 0.7 });
  }
  $('#btnChars').addEventListener('click', e => {
    e.stopPropagation();
    if (T.on || G.screen !== 'title') return;
    A.unlock();
    A.sfxPlay('pop');
    charsOpen(true);
  });
  $('#chars').addEventListener('click', e => {
    e.stopPropagation();
    A.unlock();
    const tab = e.target.closest('.ch-tab'), c = e.target.closest('.ch-c');
    if (tab) { A.sfxPlay('tap'); CHS.p = +tab.dataset.p; CHS.ask = null; charsShow(); return; }
    if (c) { charTap(c.dataset.id); return; }
    if (e.target.closest('.ch-close') || !e.target.closest('.ch-panel')) { A.sfxPlay('tap'); charsOpen(false); return; }   // Close, or outside the panel
    if (CHS.ask) { CHS.ask = null; charsShow(); }               // elsewhere on the panel: the price goes back
  });
  wallet();                                     // the first visit after MY CARDS: its cards become the wallet
  applyPicks();

  applyLang();
  // ?level=N: start at level N (QA, a class on lesson N); else the saved level (continue), never past the open ones
  setLevel((parseInt(Q.get('level'), 10) || Math.min(progress().level || 1, unlockedTop())) - 1);
  const kept = load(STEP_KEY);                  // the step in that lesson (STEPS); one kept for another lesson starts over at ★
  if (kept && kept.lesson === G.level + 1) { G.step = Math.max(1, Math.min(STEPS.length, kept.step | 0)); G.poor = kept.poor | 0; levelText(); }
  placeLevelPick();

  $('#start').addEventListener('click', () => {
    if (T.on || G.screen !== 'title') return;
    levelMenu(false);
    A.unlock();
    A.stopVoice();
    A.sfxPlay('pop');
    Mic.init();
    STT.preload();                               // the on-device backup recogniser loads while the round starts
    A.startBgm(BGM_LEVEL);
    clearTimeout(G.bootHowto);                   // pressed before the explanation began: straight into the game
    G.bootHowto = null;
    howtoDone();
    goGame();
  });
  $('#again').addEventListener('click', () => {
    takePlan(false);                             // this lesson again: the same step, or one down after two poor rounds
    A.sfxPlay('pop');
    G.screen = 'game';
    app.dataset.screen = 'game';
    say('t:playagain');
    startRound();
  });
  // Next Level (user: "다시하기가 있고 다음레벨로 넘어가는 버튼이 있어야"): the next lesson's sound and words, or the next
  // step of this lesson (STEPS); shown only after a round done well (planNext)
  $('#next').addEventListener('click', () => {
    const P = G.plan;
    if (G.screen !== 'result' || !P || !P.up) return;
    A.sfxPlay('pop');
    if (P.up === 'lesson') levelUp(P.level); else stepUp(P.step);
  });
  /* Next Level at steps 1–2: the same lesson with one more trap tooth — the round's start says how many (t:trap2/3);
     nothing on screen shows the step (user 2026-11-23: "함정 이빨 갯수는 안내만 해주고 화면에 표시 해줄 필요는 없어") */
  function stepUp(step) {
    G.plan = null;
    G.step = step;
    G.screen = 'game';
    app.dataset.screen = 'game';
    levelText();
    A.sfxPlay('fanfare');
    startRound();
  }
  /* the croc snaps shut, the new lesson's letter goes onto its teeth, a banner shows the level and its sound is said,
     then the round starts with the new words */
  async function levelUp(to = G.level + 1) {                // (Next Level, or a level picked on the game's level tag)
    const tok = ++G.token;
    levelMenu(false);
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
    G.plan = null;
    G.step = 1; G.poor = 0;                                   // a new lesson starts again at ★ (STEPS)
    setLevel(to);
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
    STT.preload();                               // the on-device recogniser (~55 MB, a worker) loads in the background
    // the explanation runs silent until the first tap (the browser's rule): that tap → the croc says the line on screen
    // aloud now. Buttons keep their own job.
    if (first && T.on && T.line && T.wake && !e.target.closest('button')) { T.again = true; T.wake(); }
    if (!greeted && G.screen === 'title' && !e.target.closest('#btnHome, #btnKey, #lvPick, #lvMenu, #btnChars, #chars, [role="dialog"]')) {   // leaving / the teacher's key / the levels / the characters: no hello
      greeted = true;
      A.startBgm(BGM_LEVEL);
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
    // START and the level chip beside it: a front letter fades behind either
    const s0 = $('#start').getBoundingClientRect(), s1 = $('#lvPick').getBoundingClientRect();
    const st = s1.width > 0 ? { left: Math.min(s0.left, s1.left), right: Math.max(s0.right, s1.right), top: s0.top, bottom: s0.bottom, width: s0.width } : s0;
    const stOn = st.width > 0, stX = (st.left + st.right) / 2, stW = (st.right - st.left) / 2;
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
    if (G.screen === 'title' && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('#lvPick, #lvMenu') && !charsIsOpen()) { $('#start').click(); return; }
    if (G.screen === 'game' && /^[0-9]$/.test(e.key)) onTooth((+e.key + 9) % 10);
  });

  // QA hooks (headless checks)
  window.__croco = { G, croc, goGame, goTitle, onTooth, startRound, showResult, toothScreen, revealSlot, makeCard, T, LANG_KEY, lang: () => LANG, howtoSeen: () => howtoSeen, LEVELS, setLevel, levelUp, STEPS, STEP_KEY,
    chars: { CHARS, WALLET_KEY, OWNED_KEY, PICK_KEY, wallet, balance, owned, picks, open: charsOpen, tap: charTap } };
})();
