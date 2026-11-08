/* Croco Phonics — the 3D crocodile "Croco" (procedural SDF clay model, three.js).
 * Built after the user's character sheet (design/character_sheet.png; croc-only render design/croc_ref.png): a chubby
 * green croc sitting up — a big head with two big glossy eyes on top, nostril bumps and a long rounded snout; a pear-
 * shaped body with a pale-yellow belly, short arms, big feet with yellow claws and a tail; yellow spikes run from the
 * back of the head down the back and the tail. The mouth is the dentist toy: the head above the pegs (the hinge on the
 * cheeks) opens; the lower jaw holds a coral tray with 10 teeth (4 in front, 3 along each side) and a tongue.
 *
 * Coordinates: y up, the croc faces +z, the floor is y = 0. The head is modelled CLOSED; at rest it is opened by
 * OPEN × rest (title: rest 1 ≈ the sheet's side view; game: wide, so every tooth shows to the raised camera).
 * Expressions from the sheet: cheer() = happy (eyes ^^, arms up), surprise(v) = big eyes + hands on the cheeks.
 * Croc.build(THREE.Scene) → api (see bottom).
 */
(function () {
  'use strict';
  const { sphere, ellipsoid, roundBox, roundCone, rrect, extrude, smin, smax } = window.SDF;
  const mesh = window.SDFMesh;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ── dimensions ───────────────────────────────────────────────────────────────────────────────────────
  const HINGE = { y: 1.74, z: -0.02 };               // the pegs on the cheeks
  const OPEN = 0.3;                                   // rad: resting opening per unit of `rest`
  const JAW = { cz: 0.66, hx: 1.24, hz: 0.92, rc: 0.64, y0: 1.28, y1: 1.62 };      // green chin under the tray
  const TRAY = { cz: 0.66, hx: 1.18, hz: 0.88, rc: 0.6, y0: 1.5, top: 1.76 };       // coral gum tray
  const SNOUT = { cz: 0.72, hx: 1.36, hz: 1.24, rc: 0.85, top: 2.72, slope: 0.13, wall: 0.17 };
  const CRANIUM = { y: 2.5, z: -0.08, rx: 1.3, ry: 0.7, rz: 0.8 };
  const EYE = { x: 0.62, y: 3.04, z: 0.66, r: 0.42 };
  const SOCKET = { dy: -0.1, dz: -0.14, r: 0.52 };
  const NOSE = { x: 0.38, y: 2.5, z: 1.66, r: 0.18 };
  const NOSTRIL = { x: NOSE.x, y: NOSE.y + 0.55 * NOSE.r, z: NOSE.z + 0.8 * NOSE.r };
  const TOOTH = { hx: 0.2, top: 0.19, bot: -0.4, hz: 0.17, r: 0.1, press: 0.2 };
  const TOOTH_Y = TRAY.top + 0.1;
  const N_TEETH = 10;
  const SHOULDER = { x: 0.84, y: 1.18, z: 0.3 };
  const FOOT = { x: 1.08, y: 0.16, z: 0.34, yaw: 0.5 };
  const TAIL = [[0, 0.5, -0.75, 0.44], [0, 0.38, -1.42, 0.31], [0, 0.42, -1.98, 0.19], [0, 0.74, -2.36, 0.08]];
  const snoutTop = z => SNOUT.top - SNOUT.slope * Math.max(0, z - 0.2);
  // the upper lip's front edge (closed) at a given x
  const lipZ = x => SNOUT.cz + (SNOUT.hz - SNOUT.rc) + Math.sqrt(Math.max(0, SNOUT.rc ** 2 - Math.max(0, Math.abs(x) - (SNOUT.hx - SNOUT.rc)) ** 2));

  // the sheet's palette: fresh green skin, pale-yellow belly, yellow claws/spikes, coral gum, cream teeth
  const COLORS = {
    skin: '#6cb36e', belly: '#e3d888', interior: '#5b965c', palate: '#e27c66', gum: '#ec6e5a', tongue: '#e45f4f',
    tooth: '#fbf6ec', eye: '#fbf8f2', pupil: '#16181a', claw: '#dccb5a', peg: '#5c9b5f', lash: '#24321f',
  };
  // letter inks (the sheet's m s t p: blue, teal, sky, orange)
  const LETTER_COLORS = ['#3f95df', '#35b98a', '#2fa6cf', '#ef6636'];
  const TOOTH_WHITE = new THREE.Color(COLORS.tooth);

  // ── body (static): torso, belly, neck, chin, thighs, feet, tail ─────────────────────────────────────
  function footSDF(ax, y, z) {
    const dx = ax - FOOT.x, dz = z - FOOT.z, c = Math.cos(FOOT.yaw), s = Math.sin(FOOT.yaw);
    return ellipsoid(dx * c - dz * s, y, dx * s + dz * c, 0, FOOT.y, 0, 0.38, 0.17, 0.54);   // toes turned out a little
  }
  function fBody(x, y, z) {
    const ax = Math.abs(x);
    let f = ellipsoid(x, y, z, 0, 0.9, -0.1, 1.06, 0.9, 0.86);                               // torso
    f = smin(f, ellipsoid(x, y, z, 0, 0.54, 0.04, 1.14, 0.54, 0.86), 0.3);                   // hips / lower belly
    f = smin(f, ellipsoid(x, y, z, 0, 1.68, -0.3, 0.96, 0.6, 0.62), 0.35);                   // neck, up into the head
    f = smin(f, extrude(rrect(x, z - JAW.cz, JAW.hx, JAW.hz, JAW.rc), y, JAW.y0, JAW.y1, 0.16), 0.24);   // chin
    f = smin(f, ellipsoid(ax, y, z, 0.84, 0.44, -0.08, 0.44, 0.42, 0.55), 0.16);             // thighs
    f = smin(f, footSDF(ax, y, z), 0.14);
    for (let i = 0; i < TAIL.length - 1; i++) {                                              // tail, tip curling up
      const [x0, y0, z0, r0] = TAIL[i], [x1, y1, z1, r1] = TAIL[i + 1];
      f = smin(f, roundCone(x, y, z, x0, y0, z0, x1, y1, z1, r0, r1), 0.12);
    }
    return smax(f, -y, 0.02);
  }
  function bellyAmount(x, y, z) {
    const e = (x / 0.64) ** 2 + ((y - 0.78) / 0.56) ** 2;
    return smooth(1.08, 0.86, e) * smooth(0.15, 0.42, z) * smooth(1.25, 1.12, y) * smooth(1.15, 0.95, z);
  }
  function fFootClaws(x, y, z) {
    const ax = Math.abs(x);
    let f = 1e9;
    for (let k = -1; k <= 1; k++) {
      const a = FOOT.yaw + k * 0.42, dx = Math.sin(a), dz = Math.cos(a);
      f = Math.min(f, roundCone(ax, y, z, FOOT.x + dx * 0.4, 0.12, FOOT.z + dz * 0.4, FOOT.x + dx * 0.62, 0.085, FOOT.z + dz * 0.62, 0.11, 0.065));
    }
    return smax(f, -y, 0.02);
  }
  function fTray(x, y, z) {
    return extrude(rrect(x, z - TRAY.cz, TRAY.hx, TRAY.hz, TRAY.rc), y, TRAY.y0, TRAY.top, 0.1);
  }
  function fTongue(x, y, z) {
    let f = ellipsoid(x, y, z, 0, TRAY.top + 0.01, 0.32, 0.6, 0.12, 0.5);
    f = smin(f, ellipsoid(x, y, z, 0, TRAY.top - 0.01, 0.74, 0.4, 0.08, 0.22), 0.12);
    return smax(f, -ellipsoid(x, y, z, 0, TRAY.top + 0.14, 0.3, 0.04, 0.06, 0.4), 0.05);      // a soft groove
  }

  // ── arm (one side, local: shoulder at the origin, hanging down) ──────────────────────────────────────
  function fArm(x, y, z) {
    const f = roundCone(x, y, z, 0, 0, 0, 0.05, -0.47, 0.1, 0.21, 0.165);
    return smin(f, ellipsoid(x, y, z, 0.06, -0.6, 0.13, 0.19, 0.155, 0.19), 0.1);
  }
  function fHandClaws(x, y, z) {
    let f = 1e9;
    for (let k = -1; k <= 1; k++) {
      const a = k * 0.55, dx = Math.sin(a) * 0.8, dz = Math.cos(a) * 0.8;
      f = Math.min(f, roundCone(x, y, z, 0.06 + dx * 0.12, -0.67, 0.13 + dz * 0.12, 0.06 + dx * 0.22, -0.73, 0.13 + dz * 0.22, 0.06, 0.035));
    }
    return f;
  }

  // ── head (upper jaw), modelled CLOSED ────────────────────────────────────────────────────────────────
  function hoodSolid(x, y, z) {
    const ax = Math.abs(x);
    const top = (y - snoutTop(z)) * 0.986;
    let f = smax(rrect(x, z - SNOUT.cz, SNOUT.hx, SNOUT.hz, SNOUT.rc), top, 0.5);               // snout: a fat bean
    f = smin(f, ellipsoid(x, y, z, 0, CRANIUM.y, CRANIUM.z, CRANIUM.rx, CRANIUM.ry, CRANIUM.rz), 0.32);
    f = smin(f, ellipsoid(ax, y, z, 0.95, 2.02, 0.22, 0.6, 0.44, 0.78), 0.25);                  // cheeks
    f = smin(f, sphere(ax, y, z, EYE.x, EYE.y + SOCKET.dy, EYE.z + SOCKET.dz, SOCKET.r), 0.22);  // eye cups
    return smin(f, sphere(ax, y, z, NOSE.x, NOSE.y, NOSE.z, NOSE.r), 0.14);                     // nostril bumps
  }
  function hoodCavity(x, y, z) {
    const w = SNOUT.wall;
    const top = (y - (snoutTop(z) - w)) * 0.986;
    const f = smax(rrect(x, z - SNOUT.cz, SNOUT.hx - w, SNOUT.hz - w, SNOUT.rc - w), top, 0.3);
    return smin(f, ellipsoid(x, y, z, 0, CRANIUM.y - 0.06, CRANIUM.z - 0.02, CRANIUM.rx - w, CRANIUM.ry - w, CRANIUM.rz - w), 0.28);
  }
  function fHood(x, y, z) {
    const ax = Math.abs(x);
    let f = smax(hoodSolid(x, y, z), -hoodCavity(x, y, z), 0.06);
    f = smax(f, HINGE.y - y, 0.1);                                                           // the lip: flat underside, soft edge
    f = smax(f, -sphere(ax, y, z, EYE.x, EYE.y, EYE.z, EYE.r - 0.006), 0.02);                  // eyeball seats
    return smax(f, -ellipsoid(ax, y, z, NOSTRIL.x, NOSTRIL.y, NOSTRIL.z, 0.06, 0.05, 0.06), 0.03);
  }
  function fUpperTooth(x, y, z) {
    const k = 0.62;                                             // blunt and rounded, hanging from the lip (−y)
    return roundCone(x, y, z / k, 0, 0, 0, 0, -0.16, 0, 0.17, 0.14) * k;
  }
  function fSpike(x, y, z) { return roundCone(x, y, z / 1.3, 0, 0, 0, 0, 0.15, -0.02, 0.12, 0.05); }   // a soft fin

  // ── lower teeth ─────────────────────────────────────────────────────────────────────────────────────
  function fTooth(x, y, z) {
    const t = clamp((y - TOOTH.bot) / (TOOTH.top - TOOTH.bot), 0, 1);
    const w = TOOTH.hx * (1 - 0.07 * t);
    const cy = (TOOTH.top + TOOTH.bot) / 2, hy = (TOOTH.top - TOOTH.bot) / 2;
    const f = roundBox(x, y, z, 0, cy, 0, w, hy, TOOTH.hz, TOOTH.r);
    return smin(f, ellipsoid(x, y, z, 0, cy + 0.02, 0, w * 0.96, hy * 0.98, TOOTH.hz * 1.12), 0.03);
  }
  // left back → left side → front row → right side → right back (keys 1…9, 0)
  function toothLayout() {
    const side = [[0.93, 0.04, 1.05], [0.95, 0.42, 0.86], [0.92, 0.8, 0.66]];        // x, z, turn (back → front)
    const out = [];
    for (const [x, z, a] of side) out.push({ x: -x, z, ry: -a });
    for (const k of [-1.5, -0.5, 0.5, 1.5]) out.push({ x: k * 0.44, z: 1.29 - 0.05 * k * k, ry: -0.08 * k, front: true });
    for (const [x, z, a] of side.slice().reverse()) out.push({ x, z, ry: a });
    return out;
  }

  // ── letters on the teeth ─────────────────────────────────────────────────────────────────────────────
  function drawLetter(c, ch, color) {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = '700 190px "Baloo 2", "Arial Rounded MT Bold", "Nunito", sans-serif';
    g.fillStyle = 'rgba(30,40,70,0.16)';
    g.fillText(ch, 131, 186);
    g.fillStyle = color;
    g.fillText(ch, 128, 182);
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
  /* decal = the tooth's front triangles, pushed out a hair along their normals, UVs projected along z */
  function decalGeometry(src) {
    const P = src.getAttribute('position'), N = src.getAttribute('normal'), I = src.getIndex();
    const keep = [];
    for (let k = 0; k < I.count; k += 3) {
      const a = I.getX(k), b = I.getX(k + 1), c = I.getX(k + 2);
      if (N.getZ(a) > 0.25 && N.getZ(b) > 0.25 && N.getZ(c) > 0.25 && P.getY(a) > -0.22) keep.push(a, b, c);
    }
    const map = new Map(), pos = [], nor = [], uv = [], idx = [];
    const S = 0.44;
    for (const v of keep) {
      if (!map.has(v)) {
        map.set(v, pos.length / 3);
        const nx = N.getX(v), ny = N.getY(v), nz = N.getZ(v);
        const x = P.getX(v) + nx * 0.004, y = P.getY(v) + ny * 0.004, z = P.getZ(v) + nz * 0.004;
        pos.push(x, y, z); nor.push(nx, ny, nz);
        uv.push(x / S + 0.5, (y - 0.035) / S + 0.5);            // letter centred on the face above the tray
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
  /* eyes like the Phonics Match tutor's (user: "match 게임에 있는 튜터 눈처럼"): a soft warm-white ball, a big brown
   * iris painted round the ball's +z (the gaze) with a darker pupil and a soft dark rim, and two catch-lights fixed in
   * screen space on the iris (a big one up-left, a small one down-right). Flat-shaded: no mirror gloss. */
  function eyeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uLight: { value: new THREE.Vector3(-0.35, 0.6, 0.72).normalize() }, uIris: { value: 41 * Math.PI / 180 }, uPupil: { value: 20 * Math.PI / 180 } },
      vertexShader: `
        varying vec3 vO; varying vec3 vN; varying vec3 vG;
        void main() {
          vO = position;
          vN = normalize(normalMatrix * normal);
          vG = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLight; uniform float uIris, uPupil;
        varying vec3 vO; varying vec3 vN; varying vec3 vG;
        void main() {
          vec3 o = normalize(vO), N = normalize(vN), G = normalize(vG);
          float l = clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(vec3(0.86, 0.85, 0.82), vec3(1.0, 0.995, 0.98), smoothstep(0.3, 0.85, l));
          float a = acos(clamp(o.z, -1.0, 1.0));
          float ir = 1.0 - smoothstep(uIris - 0.03, uIris + 0.006, a);
          vec2 ip = o.xy / sin(uIris);
          vec3 irc = mix(vec3(0.54, 0.27, 0.13), vec3(0.30, 0.12, 0.05), smoothstep(-0.95, 0.4, ip.y));      // lighter low down
          irc = mix(irc, vec3(0.20, 0.065, 0.02), smoothstep(0.6, 1.0, length(ip)) * 0.65);                 // dark rim
          float pa = acos(clamp(dot(o, normalize(vec3(0.0, 0.12, 1.0))), -1.0, 1.0));
          irc = mix(irc, vec3(0.16, 0.045, 0.012), (1.0 - smoothstep(uPupil - 0.07, uPupil + 0.03, pa)) * 0.8);  // pupil
          col = mix(col, irc, ir);
          vec2 h1 = G.xy + vec2(-0.21, 0.35), h2 = G.xy + vec2(0.30, -0.27);
          col = mix(col, vec3(1.0), (1.0 - smoothstep(0.152, 0.172, length(N.xy - h1))) * step(0.0, N.z));
          col = mix(col, vec3(1.0, 0.93, 0.91), (1.0 - smoothstep(0.045, 0.075, length(N.xy - h2))) * 0.75 * ir);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }
  function glintTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ── helpers to sit spikes on a surface ──────────────────────────────────────────────────────────────
  function surfaceHit(f, o, d) {
    let t = 0;
    for (let i = 0; i < 500 && f(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t) < 0; i++) t += 0.008;
    return new THREE.Vector3(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
  }
  function surfaceNormal(f, p) {
    const e = 0.004;
    return new THREE.Vector3(
      f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z), f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z), f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e)).normalize();
  }

  function build(scene, opts = {}) {
    const q = opts.quality || 1;
    const H = 0.03 / q;
    const t0 = performance.now();
    // matte clay, like the sheet (user: "너무 실사같이 광택이 들어가있어"): no clearcoat, sheen or mirror reflections
    const mat = (hex, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.82, metalness: 0, envMapIntensity: 0.5 }, o));
    const M = {
      skin: mat(COLORS.skin),
      painted: mat('#ffffff', { vertexColors: true }),
      peg: mat(COLORS.peg),
      gum: mat(COLORS.gum, { roughness: 0.74 }),
      tongue: mat(COLORS.tongue, { roughness: 0.7 }),
      claw: mat(COLORS.claw, { roughness: 0.74 }),
      tooth: mat(COLORS.tooth, { roughness: 0.6, emissive: '#000000' }),
      eye: eyeMaterial(),
      lash: new THREE.MeshBasicMaterial({ color: COLORS.lash }),
    };
    const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };

    const root = new THREE.Group();
    root.name = 'croc';
    scene.add(root);
    const base = new THREE.Group();
    root.add(base);

    // body with the belly painted in
    const cSkin = new THREE.Color(COLORS.skin), cBelly = new THREE.Color(COLORS.belly);
    const body = shadowy(new THREE.Mesh(mesh(fBody, [-1.78, -0.05, -2.5, 1.78, 2.32, 1.72], H * 1.15, {
      color(x, y, z, out) {
        const b = bellyAmount(x, y, z);
        out[0] = cSkin.r + (cBelly.r - cSkin.r) * b; out[1] = cSkin.g + (cBelly.g - cSkin.g) * b; out[2] = cSkin.b + (cBelly.b - cSkin.b) * b;
      },
    }), M.painted));
    base.add(body);
    base.add(shadowy(new THREE.Mesh(mesh(fFootClaws, [-1.9, -0.05, -0.1, 1.9, 0.26, 1.1], H * 0.6), M.claw)));
    base.add(shadowy(new THREE.Mesh(mesh(fTray, [-1.24, 1.44, -0.3, 1.24, 1.8, 1.6], H * 0.8), M.gum)));
    base.add(shadowy(new THREE.Mesh(mesh(fTongue, [-0.66, 1.6, -0.24, 0.66, 1.95, 1.02], H * 0.8), M.tongue)));
    // hinge pegs
    const pegGeo = new THREE.SphereGeometry(1, 32, 16);
    for (const sx of [-1, 1]) {
      const peg = shadowy(new THREE.Mesh(pegGeo, M.peg));
      peg.position.set(sx * 1.4, HINGE.y, HINGE.z);
      peg.scale.set(0.08, 0.15, 0.15);
      base.add(peg);
    }

    // spikes: down the back and along the tail (sat on the body's surface), more on the back of the head below
    const spikeGeo = mesh(fSpike, [-0.15, -0.14, -0.22, 0.15, 0.24, 0.22], H * 0.4);
    const placeSpike = (parent, f, p, hint, s) => {
      const Y = surfaceNormal(f, p);
      const Z = hint.clone().sub(Y.clone().multiplyScalar(hint.dot(Y))).normalize();
      const X = new THREE.Vector3().crossVectors(Y, Z);
      const m = shadowy(new THREE.Mesh(spikeGeo, M.claw));
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      m.position.copy(p);
      m.scale.setScalar(s);
      parent.add(m);
    };
    for (const deg of [46, 65, 84, 103, 122]) {
      const a = deg * Math.PI / 180;
      placeSpike(base, fBody, surfaceHit(fBody, [0, 1.05, -0.2], [0, Math.cos(a), -Math.sin(a)]), new THREE.Vector3(0, -1, -0.3), 1);
    }
    for (const [i, t] of [[0, 0.75], [1, 0.3], [1, 0.8], [2, 0.4]]) {
      const [x0, y0, z0, r0] = TAIL[i], [x1, y1, z1, r1] = TAIL[i + 1];
      const c = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t];
      placeSpike(base, fBody, surfaceHit(fBody, c, [0, 1, 0]), new THREE.Vector3(0, 0, -1), 0.5 + 0.5 * ((r0 + (r1 - r0) * t) / 0.44));
    }

    // arms: pivot at the shoulder (the left one mirrored), rotation drives the expressions
    const armGeo = mesh(fArm, [-0.3, -0.86, -0.28, 0.34, 0.26, 0.42], H * 0.6);
    const handClawGeo = mesh(fHandClaws, [-0.22, -0.84, -0.06, 0.34, -0.55, 0.45], H * 0.4);
    const arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * SHOULDER.x, SHOULDER.y, SHOULDER.z);
      pivot.scale.x = sx;
      base.add(pivot);
      const rot = new THREE.Group();
      pivot.add(rot);
      const arm = shadowy(new THREE.Mesh(armGeo, M.skin));
      rot.add(arm, shadowy(new THREE.Mesh(handClawGeo, M.claw)));
      arms.push({ rot, arm });
    }

    // head: pivot at the pegs, children in croc coordinates
    const lid = new THREE.Group();
    lid.position.set(0, HINGE.y, HINGE.z);
    root.add(lid);
    const lidIn = new THREE.Group();
    lidIn.position.set(0, -HINGE.y, -HINGE.z);
    lid.add(lidIn);
    const cPal = new THREE.Color(COLORS.palate), cIn = new THREE.Color(COLORS.interior);
    const hoodGeo = mesh(fHood, [-1.68, 1.68, -0.96, 1.68, EYE.y + SOCKET.r + 0.05, 2.08], H, {
      color(x, y, z, out) {
        // skin outside; inside: a coral palate band along the lip, green deeper in
        const solid = hoodSolid(x, y, z), cav = -hoodCavity(x, y, z), cut = HINGE.y - y;
        const onCut = smooth(-0.02, 0.02, cut - Math.max(solid, cav));
        const onIn = smooth(-0.02, 0.02, cav - solid) * (1 - onCut);
        const band = smooth(HINGE.y + 0.3, HINGE.y + 0.12, y);
        const pal = Math.min(1, onCut + onIn * band), inr = onIn * (1 - band);
        const sk = Math.max(0, 1 - pal - inr);
        out[0] = cSkin.r * sk + cPal.r * pal + cIn.r * inr;
        out[1] = cSkin.g * sk + cPal.g * pal + cIn.g * inr;
        out[2] = cSkin.b * sk + cPal.b * pal + cIn.b * inr;
      },
    });
    const head = shadowy(new THREE.Mesh(hoodGeo, M.painted));
    lidIn.add(head);
    for (const deg of [56, 82]) {                                     // the first spikes, on the back of the head
      const a = deg * Math.PI / 180;
      placeSpike(lidIn, hoodSolid, surfaceHit(hoodSolid, [0, CRANIUM.y, CRANIUM.z], [0, Math.cos(a), -Math.sin(a)]), new THREE.Vector3(0, -1, -0.4), 0.95);
    }

    // upper teeth: blunt pegs hanging from the lip
    const utGeo = mesh(fUpperTooth, [-0.2, -0.34, -0.14, 0.2, 0.2, 0.14], H * 0.45);
    const upper = [];
    for (const [x, sc] of [[-0.52, 1], [0.52, 1], [-0.98, 0.72], [0.98, 0.72], [-1.18, 0.6], [1.18, 0.6]]) {
      const t = new THREE.Mesh(utGeo, M.tooth);
      t.position.set(x, HINGE.y + 0.03, lipZ(x) - 0.13 * sc - 0.02);
      t.scale.setScalar(sc);
      t.castShadow = true;
      lidIn.add(t);
      upper.push(t);
    }

    // eyes: glossy ball + pupil cap (turns to look) + sparkles; lids and the happy ^^ marks live in an upright frame
    const eyes = [];
    const eyeGeo = new THREE.SphereGeometry(EYE.r, 64, 48);
    const lidCapGeo = new THREE.SphereGeometry(EYE.r * 1.04, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const arcGeo = new THREE.TorusGeometry(EYE.r * 0.5, EYE.r * 0.07, 10, 28, Math.PI);       // ∩ = a happy closed eye
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * EYE.x, EYE.y, EYE.z);
      lidIn.add(g);
      const sg = new THREE.Group();
      g.add(sg);
      // the ball turns with the gaze: its iris is painted round its +z (eyeMaterial)
      const look = new THREE.Group();
      sg.add(look);
      const ball = new THREE.Mesh(eyeGeo, M.eye);
      ball.castShadow = true;
      look.add(ball);
      const face = new THREE.Group();                 // cancels the head's tilt: lids close top → down on screen
      g.add(face);
      const lidPivot = new THREE.Group();
      face.add(lidPivot);
      const cap = new THREE.Mesh(lidCapGeo, M.skin);
      cap.castShadow = true;
      cap.visible = false;
      lidPivot.add(cap);
      const arc = new THREE.Mesh(arcGeo, M.lash);
      arc.position.set(0, -EYE.r * 0.12, EYE.r * 1.07);
      arc.visible = false;
      face.add(arc);
      eyes.push({ g, sg, ball, look, face, cap, arc, side: sx });
    }

    // lower teeth
    const toothGeo = mesh(fTooth, [-0.26, -0.46, -0.22, 0.26, 0.26, 0.23], H * 0.5);
    const decalGeo = decalGeometry(toothGeo);
    const hitGeo = new THREE.BoxGeometry(TOOTH.hx * 2.5, 0.5, TOOTH.hz * 3.2);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const teeth = toothLayout().map((p, i) => {
      const g = new THREE.Group();
      g.position.set(p.x, TOOTH_Y, p.z);
      g.rotation.y = p.ry;
      base.add(g);
      const m = shadowy(new THREE.Mesh(toothGeo, M.tooth.clone()));
      g.add(m);
      const dm = new THREE.MeshStandardMaterial({
        map: letterTexture('m', LETTER_COLORS[(i + 1) % LETTER_COLORS.length]), transparent: true, roughness: 0.6, envMapIntensity: 0.5,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
      });
      const decal = new THREE.Mesh(decalGeo, dm);
      decal.renderOrder = 2;
      g.add(decal);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.set(0, 0.02, 0.05);
      hit.userData.tooth = i;
      g.add(hit);
      m.userData.tooth = i; decal.userData.tooth = i;
      return { i, g, mesh: m, decal, hit, front: !!p.front, yRest: TOOTH_Y, depth: 0, pressed: false, glow: 0, glowColor: new THREE.Color('#a463ff'), hover: 0 };
    });

    const glowLight = new THREE.PointLight('#a35bff', 0, 3, 1.4);
    scene.add(glowLight);
    const api = makeApi({ root, base, lid, lidIn, head, eyes, teeth, upper, arms, M, glowLight });
    api.buildMs = Math.round(performance.now() - t0);
    api.tris = 0;
    root.traverse(o => { if (o.isMesh && o.geometry.index) api.tris += o.geometry.index.count / 3; });
    return api;
  }

  // ── behaviour ───────────────────────────────────────────────────────────────────────────────────────
  // arm poses (rotation x, z of the right arm; the left one is mirrored)
  const ARM = { rest: [0, 0.12], cheer: [-0.35, 2.1], cheeks: [-2.0, 0.55] };
  function makeApi(P) {
    const st = {
      open: 1, openTarget: 1, openVel: 0, snap: null, rest: 1,
      squint: 0, squintTarget: 0, blink: 0, blinkT: 0, nextBlink: 1.5,
      gaze: null, gazeSm: new THREE.Vector3(0, 2.6, 9), wander: new THREE.Vector3(), nextWander: 2,
      eyeWide: 0, happy: 0, happyT: 0, surp: 0, surpT: 0, cheerTimer: 0, time: 0,
    };
    const tmpV = new THREE.Vector3(), eyeW = new THREE.Vector3(), dir = new THREE.Vector3(), inv = new THREE.Quaternion();

    const api = {
      parts: P, OPEN, teeth: P.teeth, N_TEETH,
      frontTeeth: P.teeth.filter(t => t.front).map(t => t.i),
      get root() { return P.root; },
      /* 0 = shut, 1 = the sheet's resting opening (> 1 opens wider) */
      setOpen(v, instant) { st.snap = null; st.openTarget = v; if (instant) { st.open = v; st.openVel = 0; } },
      /* fast bite: shut with a small rebound, then rest shut */
      chomp() { st.snap = { t: 0, from: st.open }; st.openTarget = 0; st.squintTarget = 0.8; },
      reopen() { st.snap = null; st.openTarget = st.rest; st.squintTarget = 0; },
      /* how wide the mouth rests open (1 = as in the sheet); the game view opens it wider */
      rest(v) { st.rest = v; if (!st.snap && st.openTarget > 0.5) st.openTarget = v; },
      squint(v) { st.squintTarget = v; },
      blink() { st.blinkT = 0.0001; },
      wide(v = 1) { st.eyeWide = v; },
      /* the sheet's expressions: happy (eyes ^^, arms up), surprised (big eyes, hands on the cheeks) */
      happy(v = 1) { st.happyT = v; clearTimeout(st.cheerTimer); },
      cheer(ms = 1500) { st.happyT = 1; clearTimeout(st.cheerTimer); st.cheerTimer = setTimeout(() => { st.happyT = 0; }, ms); },
      surprise(v = 1) { st.surpT = v; if (v) st.eyeWide = Math.max(st.eyeWide, 1.2); },
      // the toy stays put: no trembling, shaking or bouncing (user: "악어 이빨 누르면 떨림이 있어")
      tremble() {}, shake() {}, bounce() {},
      /* world-space point to look at (null = the viewer) */
      look(p) { st.gaze = p ? p.clone() : null; },
      press(i) { P.teeth[i].pressed = true; },
      release(i) { P.teeth[i].pressed = false; },
      refreshLetters() {
        for (const t of P.teeth) { const tex = t.decal.material.map; drawLetter(tex.image, tex.userData.ch, tex.userData.color); tex.needsUpdate = true; }
      },
      resetTeeth(stagger = 0.05) {
        P.teeth.forEach((t, k) => setTimeout(() => { t.pressed = false; }, k * stagger * 1000));
      },
      glow(i, v, color) { const t = P.teeth[i]; t.glow = v; if (color) t.glowColor.set(color); },
      hover(i) { P.teeth.forEach(t => { t.hoverTarget = t.i === i ? 1 : 0; }); },
      toothWorld(i, out = new THREE.Vector3()) { return P.teeth[i].g.getWorldPosition(out); },
      hitMeshes: P.teeth.map(t => t.hit),
      toothMeshes: P.teeth.map(t => t.mesh),
      occluders: [P.head, ...P.upper, ...P.arms.map(a => a.arm)],
      state: st,
      update(dt, camera) {
        st.time += dt;
        const t = st.time;
        // jaw: spring toward the target; a snap shuts in ~0.1 s with a small rebound
        if (st.snap) {
          st.snap.t += dt;
          const k = st.snap.t;
          st.open = k < 0.1 ? st.snap.from * (1 - (k / 0.1) * (k / 0.1)) : Math.max(0, 0.16 * Math.exp(-(k - 0.1) * 10) * Math.sin((k - 0.1) * 28));
          if (k > 0.7) st.open = 0;
        } else {
          const a = (st.openTarget - st.open) * 60 - st.openVel * 11;
          st.openVel += a * dt; st.open += st.openVel * dt;
        }
        P.lid.rotation.x = -OPEN * clamp(st.open, -0.05, 3);
        // teeth: sink when pressed, pop back up
        let glowing = null;
        for (const tooth of P.teeth) {
          const target = tooth.pressed ? -TOOTH.press : 0;
          tooth.vel = (tooth.vel || 0) + ((target - tooth.depth) * 320 - (tooth.vel || 0) * 24) * dt;
          tooth.depth += tooth.vel * dt;
          tooth.hover = (tooth.hover || 0) + ((tooth.hoverTarget || 0) - (tooth.hover || 0)) * Math.min(1, dt * 14);
          tooth.g.position.y = tooth.yRest + tooth.depth + tooth.hover * 0.02;
          const e = tooth.mesh.material.emissive;
          const glowAmt = tooth.glow * (0.7 + 0.3 * Math.sin(t * 9));
          e.copy(tooth.glowColor).multiplyScalar(glowAmt * 1.6);
          tooth.mesh.material.color.copy(TOOTH_WHITE).lerp(tooth.glowColor, Math.min(1, tooth.glow) * 0.55);
          if (tooth.glow > 0.01) glowing = tooth;
          e.r += tooth.hover * 0.07; e.g += tooth.hover * 0.07; e.b += tooth.hover * 0.08;
        }
        if (glowing) {
          glowing.g.getWorldPosition(P.glowLight.position);
          P.glowLight.position.y += 0.25; P.glowLight.position.z += 0.25;
          P.glowLight.color.copy(glowing.glowColor);
          P.glowLight.intensity = 14 * glowing.glow * (0.75 + 0.25 * Math.sin(t * 9));
        } else P.glowLight.intensity = 0;
        // expressions ease in/out (no wobble)
        const ez = Math.min(1, dt * 9);
        st.happy += (st.happyT - st.happy) * ez;
        st.surp += (st.surpT - st.surp) * ez;
        for (const a of P.arms) {
          const h = st.happy, s = st.surp * (1 - h);
          a.rot.rotation.x = ARM.rest[0] + (ARM.cheer[0] - ARM.rest[0]) * h + (ARM.cheeks[0] - ARM.rest[0]) * s;
          a.rot.rotation.z = ARM.rest[1] + (ARM.cheer[1] - ARM.rest[1]) * h + (ARM.cheeks[1] - ARM.rest[1]) * s;
        }
        // eyelids: blink timer, squint target, happy (closed ^^), wide
        st.nextBlink -= dt;
        if (st.nextBlink <= 0 && !st.blinkT) { st.blinkT = 0.0001; st.nextBlink = 2.2 + Math.random() * 3.2; }
        if (st.blinkT) {
          st.blinkT += dt;
          const k = st.blinkT / 0.17;
          st.blink = k < 1 ? Math.sin(k * Math.PI) : 0;
          if (k >= 1) { st.blinkT = 0; st.blink = 0; }
        }
        st.squint += (st.squintTarget - st.squint) * Math.min(1, dt * 12);
        st.eyeWide = Math.max(st.surpT ? 1 : 0, st.eyeWide - dt * 1.4);
        P.M.eye.uniforms.uIris.value = (41 - 7 * Math.min(1, st.surp)) * Math.PI / 180;     // surprised: smaller iris
        const close = clamp(Math.max(st.squint, st.blink, st.happy * 1.05), 0, 1);
        for (const e of P.eyes) {
          e.face.rotation.x = -P.lid.rotation.x;
          e.cap.visible = close > 0.02;
          e.cap.parent.rotation.x = -0.62 + close * 2.06;
          e.arc.visible = st.happy > 0.6;
          const w = 1 + 0.1 * Math.sin(Math.min(1, st.eyeWide) * Math.PI / 2);
          e.sg.scale.setScalar(w);
        }
        // gaze: the target (smoothed) or the viewer with a gentle wander
        st.nextWander -= dt;
        if (st.nextWander <= 0) {
          st.nextWander = 1.6 + Math.random() * 2.5;
          st.wander.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8, 0);
        }
        const goal = st.gaze ? tmpV.copy(st.gaze) : tmpV.copy(camera.position).add(st.wander);
        st.gazeSm.lerp(goal, Math.min(1, dt * (st.gaze ? 10 : 3)));
        for (const e of P.eyes) {
          // in the eye's own (tilted) frame; kept in the front of the ball, out of the green cup
          e.g.getWorldPosition(eyeW);
          dir.copy(st.gazeSm).sub(eyeW);
          e.g.getWorldQuaternion(inv).invert();
          dir.applyQuaternion(inv);
          const yaw = clamp(Math.atan2(dir.x, dir.z), -0.7, 0.7);
          const pitch = clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -0.45, 0.6);
          e.look.rotation.set(-pitch, yaw, 0, 'YXZ');
        }
      },
    };
    return api;
  }

  window.Croc = { build, COLORS, OPEN };
})();
