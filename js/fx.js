/* Croco Phonics — 2D particle layer (sparkles, stars, confetti, purple bite burst, trails) on #fx. */
(function () {
  'use strict';
  const cv = document.getElementById('fx'), g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, running = false;
  const P = [];
  const PASTEL = ['#ff7eb6', '#ffd84d', '#6fe0c0', '#79c6ff', '#b99bff', '#ff9f5a', '#ffffff'];
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function star(x, y, r, n, inner, rot) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * Math.PI / n, rr = i % 2 ? r * inner : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }
  function add(p) {
    P.push(p);
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }
  let last = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 60); p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const k = p.t / p.life, a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.55) / 0.45);
      g.globalAlpha = Math.max(0, Math.min(1, a));
      g.fillStyle = p.color;
      const s = p.size * (p.kind === 'sparkle' ? 0.6 + 0.4 * Math.sin(p.t * 18 + p.seed) : 1) * (p.grow ? 1 + k * p.grow : 1);
      if (p.kind === 'sparkle') { star(p.x, p.y, s, 4, 0.28, p.rot); g.fill(); }
      else if (p.kind === 'star') { star(p.x, p.y, s, 5, 0.48, p.rot); g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.stroke(); }
      else if (p.kind === 'dot') { g.beginPath(); g.arc(p.x, p.y, s, 0, Math.PI * 2); g.fill(); }
      else if (p.kind === 'confetti') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.t * 9 + p.seed));
        g.fillRect(-s, -s * 0.55, s * 2, s * 1.1); g.restore();
      } else if (p.kind === 'shard') {
        g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx));
        g.beginPath(); g.moveTo(s * 2.2, 0); g.lineTo(-s, s * 0.45); g.lineTo(-s * 0.6, 0); g.lineTo(-s, -s * 0.45); g.closePath(); g.fill(); g.restore();
      } else if (p.kind === 'ring') {
        g.strokeStyle = p.color; g.lineWidth = p.size * 0.18 * (1 - k); g.beginPath(); g.arc(p.x, p.y, p.size * (0.3 + k * 2.2), 0, Math.PI * 2); g.stroke();
      } else if (p.kind === 'bolt') {
        g.strokeStyle = p.color; g.lineWidth = 4 * (1 - k) + 1; g.lineJoin = 'round'; g.beginPath();
        let x = p.x, y = p.y; g.moveTo(x, y);
        for (let j = 1; j <= 5; j++) {
          const d = p.size * j / 5;
          x = p.x + Math.cos(p.ang) * d + Math.cos(p.ang + Math.PI / 2) * (j % 2 ? 1 : -1) * p.size * 0.12;
          y = p.y + Math.sin(p.ang) * d + Math.sin(p.ang + Math.PI / 2) * (j % 2 ? 1 : -1) * p.size * 0.12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    if (P.length) requestAnimationFrame(loop);
    else { running = false; g.clearRect(0, 0, W, H); }
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const base = o => Object.assign({ t: 0, delay: 0, drag: 0.94, grav: 0, rot: rnd(0, 6.3), vr: rnd(-6, 6), seed: rnd(0, 9), grow: 0 }, o);
  const vh = () => H / 100;

  const FX = {
    burst(x, y, o = {}) {
      const n = o.n || 24, kind = o.kind || 'sparkle', sp = (o.speed || 1) * vh();
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2), v = rnd(18, 55) * sp;
        if (kind === 'sparkle') add(base({ kind: 'sparkle', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10 * vh(), grav: 20 * vh(), life: rnd(0.6, 1.1), size: rnd(0.8, 1.9) * vh(), color: ['#ffffff', '#fff3a6', '#ffd84d', '#ffe9f4'][i % 4] }));
        else if (kind === 'stars') add(base({ kind: 'star', x, y, vx: Math.cos(a) * v * 1.2, vy: Math.sin(a) * v * 1.2 - 14 * vh(), grav: 30 * vh(), life: rnd(0.8, 1.3), size: rnd(1, 2.1) * vh(), color: PASTEL[i % 6] }));
        else if (kind === 'dots') add(base({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.5, 0.9), size: rnd(0.4, 1) * vh(), color: PASTEL[i % 7] }));
        else if (kind === 'purple') {
          add(base({ kind: 'shard', x, y, vx: Math.cos(a) * v * 1.6, vy: Math.sin(a) * v * 1.6, life: rnd(0.5, 0.9), size: rnd(1, 2.2) * vh(), color: ['#b46cff', '#ffffff', '#ff7ad9', '#8a5cff'][i % 4] }));
        }
      }
      if (kind === 'purple') {
        for (let i = 0; i < 9; i++) add(base({ kind: 'bolt', x, y, vx: 0, vy: 0, ang: i / 9 * Math.PI * 2 + rnd(-0.2, 0.2), life: 0.45, size: rnd(14, 22) * vh(), color: i % 2 ? '#ffffff' : '#c38bff', vr: 0 }));
        add(base({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.6, size: 9 * vh(), color: '#d6b2ff', vr: 0 }));
      }
      if (o.ring) add(base({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.55, size: 6 * vh(), color: o.ring, vr: 0 }));
    },
    trail(x0, y0, x1, y1, ms = 600) {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const k = i / n, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 6 * vh();
        add(base({ kind: i % 3 ? 'sparkle' : 'dot', x, y, vx: rnd(-8, 8) * vh() / 10, vy: rnd(-8, 8) * vh() / 10, delay: k * ms / 1000, life: 0.55, size: rnd(0.6, 1.3) * vh(), color: ['#ffffff', '#fff1a8', '#ffd84d'][i % 3] }));
      }
    },
    rain(ms = 2500, n = 140) {
      for (let i = 0; i < n; i++) {
        add(base({ kind: 'confetti', x: rnd(0, W), y: rnd(-30, -5) * vh() / 3, vx: rnd(-10, 10) * vh() / 10, vy: rnd(10, 30) * vh() / 1, grav: 14 * vh(), drag: 0.985, delay: rnd(0, ms / 1000), life: rnd(2.2, 3.6), size: rnd(0.7, 1.2) * vh(), color: PASTEL[i % 6], vr: rnd(-8, 8) }));
      }
    },
    pop(x, y, n = 70) {
      for (let i = 0; i < n; i++) {
        const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), v = rnd(40, 95) * vh();
        add(base({ kind: 'confetti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 60 * vh(), drag: 0.95, life: rnd(1.4, 2.4), size: rnd(0.7, 1.2) * vh(), color: PASTEL[i % 6], vr: rnd(-10, 10) }));
      }
    },
    clear() { P.length = 0; },
    get count() { return P.length; },
  };
  window.FX = FX;
})();
