/* Croco Phonics — the 3D crocodile (procedural SDF clay model, three.js).
 * Built after the user's reference renders (design/intro_ref.png, game_ref.png): a green toy crocodile whose
 * upper jaw is a hinged lid; big white eyes on top, nostril bumps, coral gum ring with white teeth, a tongue,
 * short legs with yellow claws. Every tooth can sink (pressed) and the lid can snap shut (chomp).
 *
 * Coordinates: y up, the croc faces +z, the table is y = 0. One unit ≈ 1/2.5 of the jaw width.
 * Croc.build(THREE.Scene) → api (see bottom).
 */
(function () {
  'use strict';
  const { sphere, ellipsoid, roundBox, roundCone, rrect, extrude, smin, smax } = window.SDF;
  const mesh = window.SDFMesh;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ── dimensions ───────────────────────────────────────────────────────────────────────────────────────
  const JAW = { hx: 1.25, hz: 1.05, rc: 0.8, y0: 0.16, y1: 0.97, wall: 0.3, floor: 0.74 };
  const GUM = { inset: 0.15, half: 0.17, y0: 0.88, y1: 1.07 };
  // lid (upper jaw) is modelled CLOSED: a puffy hood resting over the tray, hinged at the back. Opened by OPEN its
  // front wall becomes the face we see (nostrils), the eyes stand on top and the palate shows under the lip —
  // the look of the user's reference renders.
  const LID = { hx: 1.42, hz: 1.2, zc: 0.05, rc: 0.95, y0: 1.13, y1: 2.04, round: 0.5, wall: 0.17, ceil: 1.74 };
  const HINGE = { y: 0.98, z: -0.86 };
  const OPEN = 0.42;                      // rad, resting open angle (front of the lid lifted)
  const TOOTH = { hx: 0.155, hy: 0.2, hz: 0.1, r: 0.075, sink: 0.08, press: 0.19 };
  const N_TEETH = 8;                     // big, all on the front arc: easy to see and tap
  // features are placed where they should sit in the OPEN pose (world), stored in closed-frame coordinates
  const toClosed = (wy, wz) => {
    const ry = wy - HINGE.y, rz = wz - HINGE.z, c = Math.cos(OPEN), s = Math.sin(OPEN);
    return [HINGE.y + c * ry - s * rz, HINGE.z + s * ry + c * rz];
  };
  const EYE = (() => { const [y, z] = toClosed(2.84, -0.1); return { x: 0.5, y, z, r: 0.35 }; })();
  const NOSE = (() => { const [y, z] = toClosed(2.3, 0.78); return { x: 0.27, y, z }; })();

  const COLORS = {
    skin: '#50ad57', skinDeep: '#3f9a4a', palate: '#f07f62', gum: '#ef6b5f', tongue: '#e2575a',
    tooth: '#fbf8f0', eye: '#ffffff', pupil: '#1c1c22', claw: '#f3d143', throat: '#2f6e3c',
  };
  const LETTER_COLORS = ['#3d9be9', '#26b394', '#f0782f', '#ec5d9b', '#8d6be6'];
  const TOOTH_WHITE = new THREE.Color('#fbf8f0');

  // ── SDF parts ─────────────────────────────────────────────────────────────────────────────────────────
  function fBody(x, y, z) {
    const o = rrect(x, z, JAW.hx, JAW.hz, JAW.rc);
    let f = extrude(o, y, JAW.y0, JAW.y1, 0.2);
    // body under the jaw + four short legs
    f = smin(f, ellipsoid(x, y, z, 0, 0.34, -0.12, 1.16, 0.36, 1.0), 0.2);
    const ax = Math.abs(x);
    let legs = roundCone(ax, y, z, 1.02, 0.3, 0.42, 1.24, 0.15, 0.66, 0.27, 0.22);
    legs = smin(legs, ellipsoid(ax, y, z, 1.3, 0.12, 0.76, 0.29, 0.14, 0.3), 0.12);
    let back = roundCone(ax, y, z, 1.02, 0.3, -0.66, 1.26, 0.15, -0.84, 0.27, 0.22);
    back = smin(back, ellipsoid(ax, y, z, 1.33, 0.12, -0.92, 0.29, 0.14, 0.28), 0.12);
    f = smin(f, smin(legs, back, 0.05), 0.2);
    // mouth cavity (the gum ring + tongue sit in it)
    const oi = rrect(x, z, JAW.hx - JAW.wall, JAW.hz - JAW.wall, JAW.rc - JAW.wall);
    f = smax(f, -extrude(oi, y, JAW.floor, 3, 0.1), 0.06);
    // flat soles on the table
    return smax(f, -y, 0.03);
  }
  const CLAW_FEET = [[1.3, 0.76, 1], [1.33, -0.92, -1]];
  function fClaws(x, y, z) {
    const ax = Math.abs(x);
    let f = 1e9;
    for (const [fx, fz, dir] of CLAW_FEET) {
      for (let k = -1; k <= 1; k++) {
        const a = k * 0.5 + (dir > 0 ? 0.3 : 0.45);                      // fan out, turned a little outward
        const bx = fx + Math.sin(a) * 0.2, bz = fz + dir * Math.cos(a) * 0.22;
        const tx = fx + Math.sin(a) * 0.36, tz = fz + dir * Math.cos(a) * 0.38;
        f = Math.min(f, roundCone(ax, y, z, bx, 0.1, bz, tx, 0.075, tz, 0.1, 0.065));
      }
    }
    return smax(f, -y, 0.02);
  }
  function fGum(x, y, z) {
    const c = rrect(x, z, JAW.hx - GUM.inset, JAW.hz - GUM.inset, JAW.rc - GUM.inset);
    return extrude(Math.abs(c) - GUM.half, y, GUM.y0, GUM.y1, 0.085);
  }
  function fTongue(x, y, z) {
    let f = ellipsoid(x, y, z, 0, 0.8, -0.1, 0.74, 0.2, 0.6);
    f = smin(f, ellipsoid(x, y, z, 0, 0.76, 0.3, 0.5, 0.14, 0.3), 0.15);
    // a soft groove down the middle
    f = smax(f, -ellipsoid(x, y, z, 0, 1.0, 0.0, 0.05, 0.08, 0.5), 0.06);
    return f;
  }

  // lid (upper jaw) — modelled CLOSED, resting over the tray; hinge at the back
  function lidOuter(x, y, z) {
    const o = rrect(x, z - LID.zc, LID.hx, LID.hz, LID.rc);
    let f = extrude(o, y, LID.y0, LID.y1, LID.round);
    f = smin(f, ellipsoid(x, y, z, 0, 1.94, -0.42, 1.12, 0.34, 0.7), 0.3);              // skull
    const ax = Math.abs(x);
    f = smin(f, sphere(ax, y, z, EYE.x, EYE.y - 0.12, EYE.z - 0.07, EYE.r + 0.035), 0.24);  // eye sockets
    f = smin(f, sphere(ax, y, z, NOSE.x, NOSE.y, NOSE.z, 0.13), 0.12);                   // nostril bumps
    f = smax(f, -ellipsoid(ax, y, z, NOSE.x, NOSE.y + 0.03, NOSE.z + 0.12, 0.05, 0.055, 0.07), 0.035);
    return f;
  }
  function lidCavity(x, y, z) {
    const oi = rrect(x, z - LID.zc, LID.hx - LID.wall, LID.hz - LID.wall, LID.rc - LID.wall);
    return extrude(oi, y, -2, LID.ceil, 0.3);
  }
  // cheeks: the hood's side walls reach down toward the hinge, so the open mouth is closed at the sides
  function lidSkirt(x, y, z) {
    const o = rrect(x, z - LID.zc, LID.hx, LID.hz, LID.rc);
    const band = Math.abs(o + 0.11) - 0.11;
    const yb = 0.64 + Math.max(0, z + 0.6) * 0.62;
    return smax(smax(band, yb - y, 0.12), y - 1.7, 0.1);
  }
  function lidShell(x, y, z) { return smin(lidOuter(x, y, z), lidSkirt(x, y, z), 0.14); }
  function fLid(x, y, z) {
    return smax(lidShell(x, y, z), -lidCavity(x, y, z), 0.08);
  }
  function fTooth(x, y, z) {
    // a rounded block, a bit narrower at the root and with a softly domed front face
    const w = TOOTH.hx * (1 - 0.1 * smooth(TOOTH.hy, -TOOTH.hy, y));
    let f = roundBox(x, y, z, 0, 0, 0, w, TOOTH.hy, TOOTH.hz, TOOTH.r);
    f = smin(f, ellipsoid(x, y, z, 0, 0.01, 0.02, TOOTH.hx * 0.92, TOOTH.hy * 0.95, TOOTH.hz * 1.18), 0.03);
    return f;
  }
  function fUpperTooth(x, y, z) {
    return roundCone(x, y, z, 0, 0.14, 0, 0, -0.12, 0.015, 0.11, 0.08);
  }

  // teeth sit along the gum's centre line: left side → front → right side
  function toothPath() {
    const hx = JAW.hx - GUM.inset, hz = JAW.hz - GUM.inset, r = JAW.rc - GUM.inset;
    const cx = hx - r, cz = hz - r, zBack = 0.0;
    const segs = [
      { len: cz - zBack, at: t => [-hx, zBack + t, -1, 0] },
      { len: Math.PI / 2 * r, at: t => { const a = Math.PI - t / r; return [-cx + r * Math.cos(a), cz + r * Math.sin(a), Math.cos(a), Math.sin(a)]; } },
      { len: 2 * cx, at: t => [-cx + t, hz, 0, 1] },
      { len: Math.PI / 2 * r, at: t => { const a = Math.PI / 2 - t / r; return [cx + r * Math.cos(a), cz + r * Math.sin(a), Math.cos(a), Math.sin(a)]; } },
      { len: cz - zBack, at: t => [hx, cz - t, 1, 0] },
    ];
    const L = segs.reduce((s, g) => s + g.len, 0);
    const out = [];
    for (let i = 0; i < N_TEETH; i++) {
      let s = (i + 0.5) / N_TEETH * L;
      for (const g of segs) { if (s <= g.len + 1e-9) { out.push(g.at(s)); break; } s -= g.len; }
    }
    return out;
  }

  function drawLetter(c, ch, color) {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = '700 200px "Baloo 2", "Arial Rounded MT Bold", "Nunito", sans-serif';
    g.fillText(ch, 128, 196);
  }
  function letterTexture(ch, color) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    drawLetter(c, ch, color);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData = { ch, color };
    return t;
  }

  /* decal = the tooth's front-facing triangles, pushed out a hair along their normals, UVs projected along z */
  function decalGeometry(src) {
    const P = src.getAttribute('position'), N = src.getAttribute('normal'), I = src.getIndex();
    const keep = [];
    for (let k = 0; k < I.count; k += 3) {
      const a = I.getX(k), b = I.getX(k + 1), c = I.getX(k + 2);
      if (N.getZ(a) > 0.2 && N.getZ(b) > 0.2 && N.getZ(c) > 0.2) keep.push(a, b, c);
    }
    const map = new Map(), pos = [], nor = [], uv = [], idx = [];
    const sx = TOOTH.hx * 2.1, sy = TOOTH.hy * 2.1;
    for (const v of keep) {
      if (!map.has(v)) {
        map.set(v, pos.length / 3);
        const nx = N.getX(v), ny = N.getY(v), nz = N.getZ(v);
        const x = P.getX(v) + nx * 0.004, y = P.getY(v) + ny * 0.004, z = P.getZ(v) + nz * 0.004;
        pos.push(x, y, z); nor.push(nx, ny, nz);
        uv.push(x / sx + 0.5, y / sy + 0.5);
      }
      idx.push(map.get(v));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  function build(scene, opts = {}) {
    const q = opts.quality || 1;                 // 1 = full, 0.75 = lighter grids
    const H = 0.03 / q;
    const t0 = performance.now();
    const mat = (hex, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: hex, roughness: 0.45, metalness: 0 }, o));
    const M = {
      skin: mat(COLORS.skin, { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.25, sheenColor: '#d9ffd0', sheenRoughness: 0.6 }),
      lid: mat('#ffffff', { vertexColors: true, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.25, sheenColor: '#d9ffd0', sheenRoughness: 0.6 }),
      gum: mat(COLORS.gum, { roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
      tongue: mat(COLORS.tongue, { roughness: 0.55, clearcoat: 0.2 }),
      throat: mat(COLORS.throat, { roughness: 0.85 }),
      claw: mat(COLORS.claw, { roughness: 0.38, clearcoat: 0.4 }),
      tooth: mat(COLORS.tooth, { roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: '#000000' }),
      eye: mat(COLORS.eye, { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }),
      pupil: mat(COLORS.pupil, { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
      shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    };
    const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };

    const root = new THREE.Group();
    root.name = 'croc';
    scene.add(root);
    const base = new THREE.Group();
    root.add(base);

    const body = shadowy(new THREE.Mesh(mesh(fBody, [-1.95, -0.05, -1.5, 1.95, 1.08, 1.5], H), M.skin));
    const claws = shadowy(new THREE.Mesh(mesh(fClaws, [-2.0, -0.05, -1.5, 2.0, 0.24, 1.35], H * 0.7), M.claw));
    const gum = shadowy(new THREE.Mesh(mesh(fGum, [-1.4, 0.82, -1.2, 1.4, 1.14, 1.2], H * 0.85), M.gum));
    const tongue = shadowy(new THREE.Mesh(mesh(fTongue, [-0.85, 0.5, -0.8, 0.85, 1.05, 0.7], H), M.tongue));
    base.add(body, claws, gum, tongue);

    // lid: pivot at the hinge, children in croc coordinates
    const lid = new THREE.Group();
    lid.position.set(0, HINGE.y, HINGE.z);
    root.add(lid);
    const lidIn = new THREE.Group();
    lidIn.position.set(0, -HINGE.y, -HINGE.z);
    lid.add(lidIn);
    const cSkin = new THREE.Color(COLORS.skin), cPal = new THREE.Color(COLORS.palate);
    const lidGeo = mesh(fLid, [-1.64, 0.5, -1.45, 1.64, EYE.y + 0.3, 1.55], H, {
      color(x, y, z, out) {
        // palate where the cavity wall is the active surface, skin elsewhere (narrow blend)
        const pal = smooth(-0.012, 0.012, -lidCavity(x, y, z) - lidShell(x, y, z));
        out[0] = cSkin.r + (cPal.r - cSkin.r) * pal;
        out[1] = cSkin.g + (cPal.g - cSkin.g) * pal;
        out[2] = cSkin.b + (cPal.b - cSkin.b) * pal;
      },
    });
    const head = shadowy(new THREE.Mesh(lidGeo, M.lid));
    lidIn.add(head);

    // upper teeth hang from the palate's front edge; tilted back by OPEN so they point down when the mouth is open
    const utGeo = mesh(fUpperTooth, [-0.16, -0.24, -0.15, 0.16, 0.28, 0.15], H * 0.45);
    const upper = [];
    const ihz = LID.zc + LID.hz - LID.wall, ihx = LID.hx - LID.wall, irr = LID.rc - LID.wall;
    for (const [x, sc] of [[-0.34, 1], [0.34, 1], [-0.95, 0.8], [0.95, 0.8]]) {
      const t = new THREE.Mesh(utGeo, M.tooth);
      let z = ihz;
      if (Math.abs(x) > ihx - irr) { const dx = Math.abs(x) - (ihx - irr); z = LID.zc + (LID.hz - LID.wall - irr) + Math.sqrt(Math.max(0, irr * irr - dx * dx)); }
      t.position.set(x, LID.y0 + 0.05 * sc, z - 0.11 * sc);
      t.rotation.x = OPEN;
      t.scale.setScalar(sc);
      t.castShadow = true;
      lidIn.add(t);
      upper.push(t);
    }

    // eyes (in the lid): eyeball + pupil (turns to look) + glint, eyelid shell for blinks/squints
    const eyes = [];
    const eyeGeo = new THREE.SphereGeometry(EYE.r, 48, 32);
    const pupilGeo = new THREE.SphereGeometry(1, 40, 24);
    const glintGeo = new THREE.SphereGeometry(1, 16, 12);
    const lidCapGeo = new THREE.SphereGeometry(EYE.r * 1.045, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * EYE.x, EYE.y, EYE.z);
      lidIn.add(g);
      const ball = shadowy(new THREE.Mesh(eyeGeo, M.eye));
      g.add(ball);
      const look = new THREE.Group();          // +z → gaze direction
      g.add(look);
      const pupil = new THREE.Mesh(pupilGeo, M.pupil);
      pupil.scale.set(EYE.r * 0.62, EYE.r * 0.62, EYE.r * 0.3);
      pupil.position.z = EYE.r * 0.78;
      look.add(pupil);
      const glint = new THREE.Mesh(glintGeo, M.shine);
      glint.scale.setScalar(EYE.r * 0.12);
      glint.position.set(-EYE.r * 0.2, EYE.r * 0.24, EYE.r * 1.08);
      look.add(glint);
      const glint2 = new THREE.Mesh(glintGeo, M.shine);
      glint2.scale.setScalar(EYE.r * 0.055);
      glint2.position.set(EYE.r * 0.14, -EYE.r * 0.12, EYE.r * 1.1);
      look.add(glint2);
      // eyelid: cap that swings from the top (open: hidden) down over the front (closed)
      const lidPivot = new THREE.Group();
      lidPivot.rotation.x = OPEN;             // compensate the lid's tilt so blinks close top → down on screen
      g.add(lidPivot);
      const cap = new THREE.Mesh(lidCapGeo, M.skin);
      cap.castShadow = true;
      cap.visible = false;
      lidPivot.add(cap);
      eyes.push({ g, ball, look, pupil, cap, side: sx });
    }

    // teeth
    const toothGeo = mesh(fTooth, [-0.21, -0.26, -0.17, 0.21, 0.26, 0.18], H * 0.52);
    const decalGeo = decalGeometry(toothGeo);
    const hitGeo = new THREE.BoxGeometry(TOOTH.hx * 2.7, TOOTH.hy * 3.0, TOOTH.hz * 3.4);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const teeth = toothPath().map(([x, z, nx, nz], i) => {
      const g = new THREE.Group();
      const yRest = GUM.y1 - TOOTH.sink + TOOTH.hy;
      g.position.set(x, yRest, z);
      g.rotation.y = Math.atan2(nx, nz);
      base.add(g);
      const m = shadowy(new THREE.Mesh(toothGeo, M.tooth.clone()));
      g.add(m);
      const color = LETTER_COLORS[i % LETTER_COLORS.length];
      const dm = new THREE.MeshPhysicalMaterial({
        map: letterTexture('m', color), transparent: true, roughness: 0.35, clearcoat: 0.5,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
      });
      const decal = new THREE.Mesh(decalGeo, dm);
      decal.renderOrder = 2;
      g.add(decal);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.set(0, 0.05, 0.04);
      hit.userData.tooth = i;
      g.add(hit);
      m.userData.tooth = i; decal.userData.tooth = i;
      return { i, g, mesh: m, decal, hit, yRest, depth: 0, pressed: false, glow: 0, glowColor: new THREE.Color('#a463ff'), hover: 0 };
    });

    const glowLight = new THREE.PointLight('#a35bff', 0, 3, 1.4);
    scene.add(glowLight);
    const api = makeApi({ root, base, lid, lidIn, head, eyes, teeth, upper, M, glowLight });
    api.buildMs = Math.round(performance.now() - t0);
    api.tris = 0;
    root.traverse(o => { if (o.isMesh && o.geometry.index) api.tris += o.geometry.index.count / 3; });
    return api;
  }

  // ── behaviour ───────────────────────────────────────────────────────────────────────────────────────
  function makeApi(P) {
    const st = {
      open: 1, openTarget: 1, openVel: 0, snap: null,
      squint: 0, squintTarget: 0, blink: 0, blinkT: 0, nextBlink: 1.5,
      gaze: null, gazeSm: new THREE.Vector3(0, 1.6, 8), wander: new THREE.Vector3(), nextWander: 2,
      shake: 0, tremble: 0, breathe: 0, bounce: 0, eyeWide: 0, happy: 0, time: 0,
    };
    const tmpV = new THREE.Vector3(), eyeW = new THREE.Vector3(), dir = new THREE.Vector3();

    const api = {
      parts: P, OPEN, teeth: P.teeth, N_TEETH,
      get root() { return P.root; },
      /* 0 = shut, 1 = resting open */
      setOpen(v, instant) { st.openTarget = v; if (instant) { st.open = v; st.openVel = 0; } },
      /* fast bite: overshoot then rest shut */
      chomp() { st.snap = { t: 0 }; st.openTarget = 0; st.squintTarget = 0.8; },
      reopen() { st.snap = null; st.openTarget = 1; st.squintTarget = 0; },
      squint(v) { st.squintTarget = v; },
      blink() { st.blinkT = 0.0001; },
      wide(v = 1) { st.eyeWide = v; },
      happy(v = 1) { st.happy = v; },
      tremble(v) { st.tremble = v; },
      shake(v = 1) { st.shake = v; },
      bounce(v = 1) { st.bounce = v; },
      /* world-space point to look at (null = wander / viewer) */
      look(p) { st.gaze = p ? p.clone() : null; },
      press(i) { const t = P.teeth[i]; t.pressed = true; },
      release(i) { const t = P.teeth[i]; t.pressed = false; },
      /* redraw the tooth letters once the web font has loaded */
      refreshLetters() {
        for (const t of P.teeth) { const tex = t.decal.material.map; drawLetter(tex.image, tex.userData.ch, tex.userData.color); tex.needsUpdate = true; }
      },
      resetTeeth(stagger = 0.06) {
        P.teeth.forEach((t, k) => setTimeout(() => { t.pressed = false; }, k * stagger * 1000));
      },
      glow(i, v, color) { const t = P.teeth[i]; t.glow = v; if (color) t.glowColor.set(color); },
      hover(i) { P.teeth.forEach(t => { t.hoverTarget = t.i === i ? 1 : 0; }); },
      toothWorld(i, out = new THREE.Vector3()) { return P.teeth[i].g.getWorldPosition(out); },
      hitMeshes: P.teeth.map(t => t.hit),
      toothMeshes: P.teeth.map(t => t.mesh),
      state: st,
      update(dt, camera) {
        st.time += dt;
        const t = st.time;
        // jaw: spring toward target; a snap is a near-instant close with a rebound
        if (st.snap) {
          st.snap.t += dt;
          const k = st.snap.t;
          st.open = k < 0.09 ? 1 - k / 0.09 : Math.max(0, 0.08 * Math.exp(-(k - 0.09) * 9) * Math.cos((k - 0.09) * 30));
          if (k > 0.7) { st.open = 0; }
        } else {
          const kS = 60, dS = 11;
          const a = (st.openTarget - st.open) * kS - st.openVel * dS;
          st.openVel += a * dt; st.open += st.openVel * dt;
        }
        st.tremble = Math.max(0, st.tremble - dt * 0.0);
        const trem = st.tremble ? Math.sin(t * 55) * 0.012 * st.tremble + Math.sin(t * 31) * 0.006 * st.tremble : 0;
        P.lid.rotation.x = -OPEN * clamp(st.open, -0.1, 1.15) + trem;
        // body: breathing + bounce + shake
        st.breathe = Math.sin(t * 2.1);
        st.bounce = Math.max(0, st.bounce - dt * 2.2);
        st.shake = Math.max(0, st.shake - dt * 2.5);
        const b = st.bounce;
        P.root.scale.set(1 + 0.004 * st.breathe + 0.03 * Math.sin(b * Math.PI) * b, 1 - 0.006 * st.breathe - 0.04 * Math.sin(b * 9) * b, 1);
        P.root.position.x = st.shake ? Math.sin(t * 70) * 0.05 * st.shake : 0;
        P.root.rotation.z = st.shake ? Math.sin(t * 47) * 0.02 * st.shake : 0;
        // teeth: sink when pressed, pop back with a little overshoot
        let glowing = null;
        for (const tooth of P.teeth) {
          const target = tooth.pressed ? -TOOTH.press : 0;
          tooth.vel = (tooth.vel || 0) + ((target - tooth.depth) * 320 - (tooth.vel || 0) * 22) * dt;
          tooth.depth += tooth.vel * dt;
          tooth.hover = (tooth.hover || 0) + ((tooth.hoverTarget || 0) - (tooth.hover || 0)) * Math.min(1, dt * 14);
          tooth.g.position.y = tooth.yRest + tooth.depth + tooth.hover * 0.025;
          const e = tooth.mesh.material.emissive;
          const glowAmt = tooth.glow * (0.7 + 0.3 * Math.sin(t * 9));
          e.copy(tooth.glowColor).multiplyScalar(glowAmt * 1.6);
          tooth.mesh.material.color.copy(TOOTH_WHITE).lerp(tooth.glowColor, Math.min(1, tooth.glow) * 0.55);
          if (tooth.glow > 0.01) { glowing = tooth; }
          e.r += tooth.hover * 0.06; e.g += tooth.hover * 0.06; e.b += tooth.hover * 0.07;
        }
        if (glowing) {
          glowing.g.getWorldPosition(P.glowLight.position);
          P.glowLight.position.y += 0.25; P.glowLight.position.z += 0.25;
          P.glowLight.color.copy(glowing.glowColor);
          P.glowLight.intensity = 14 * glowing.glow * (0.75 + 0.25 * Math.sin(t * 9));
        } else P.glowLight.intensity = 0;
        // eyelids: blink timer, squint target, wide
        st.nextBlink -= dt;
        if (st.nextBlink <= 0 && !st.blinkT) { st.blinkT = 0.0001; st.nextBlink = 2.2 + Math.random() * 3.2; }
        if (st.blinkT) {
          st.blinkT += dt;
          const k = st.blinkT / 0.17;
          st.blink = k < 1 ? Math.sin(k * Math.PI) : 0;
          if (k >= 1) { st.blinkT = 0; st.blink = 0; }
        }
        st.squint += (st.squintTarget - st.squint) * Math.min(1, dt * 12);
        st.eyeWide = Math.max(0, st.eyeWide - dt * 1.4);
        const close = clamp(Math.max(st.squint, st.blink), 0, 1);
        for (const e of P.eyes) {
          e.cap.visible = close > 0.02;
          // cap rotation: -0.25π (tucked at the back) → +0.5π (covers the front)
          e.cap.parent.rotation.x = OPEN + (-0.6 + close * 2.05);
          const w = 1 + 0.12 * Math.sin(Math.min(1, st.eyeWide) * Math.PI / 2) * (st.eyeWide > 0 ? 1 : 0);
          e.ball.scale.setScalar(w);
          e.look.scale.setScalar(w);
          e.pupil.scale.set(EYE.r * 0.62 * (1 - 0.2 * st.eyeWide), EYE.r * 0.62 * (1 - 0.2 * st.eyeWide), EYE.r * 0.3);
        }
        // gaze: target (smoothed) or gentle wandering around the viewer
        st.nextWander -= dt;
        if (st.nextWander <= 0) {
          st.nextWander = 1.6 + Math.random() * 2.5;
          st.wander.set((Math.random() - 0.5) * 3, (Math.random() - 0.4) * 1.6, 0);
        }
        const goal = st.gaze ? tmpV.copy(st.gaze) : tmpV.copy(camera.position).add(st.wander);
        st.gazeSm.lerp(goal, Math.min(1, dt * (st.gaze ? 10 : 3)));
        for (const e of P.eyes) {
          // keep the pupils in the visible upper-front part of the eye: clamp the gaze's pitch and yaw
          e.g.getWorldPosition(eyeW);
          dir.copy(st.gazeSm).sub(eyeW);
          const yaw = clamp(Math.atan2(dir.x, dir.z), -0.75, 0.75);
          const pitch = clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -0.06, 0.55);
          dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
          e.look.lookAt(eyeW.add(dir));
        }
      },
    };
    return api;
  }

  window.Croc = { build, COLORS, OPEN };
})();
