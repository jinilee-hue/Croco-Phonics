/* Croco Phonics — the 3D crocodile (procedural SDF clay model, three.js).
 * Shaped after the user's renders (design/intro_ref.png, game_ref.png), measured on the title render with
 * 1 unit ≈ 300 px there: a round hood (upper jaw) with two big glossy eyes sunk in green sockets, nostril mounds,
 * a thick lip with a dark-red palate band and blunt upper teeth; a coral tray with a raised rim holding 10 chunky
 * teeth (4 in front, 3 along each side), a big tongue, a green tub underneath, splayed legs with yellow claws.
 *
 * The toy only — no torso (user: "악어 몸통까지 나오면 안돼"); from the character sheet it takes the matte clay look and
 * eyes like the Phonics Match tutor's ("눈동자가 너무 무서워"), and eye-only expressions (happy ^^, surprised).
 *
 * Coordinates: y up, the croc faces +z, the table is y = 0.
 * The hood is modelled in its resting OPEN pose (as in the renders). Its underside is the plane through the hinge
 * tilted by OPEN, so chomp() turns it shut about the hinge and that plane lands flat on the tray.
 * Croc.build(THREE.Scene) → api (see bottom).
 */
(function () {
  'use strict';
  const { sphere, ellipsoid, roundBox, roundCone, rrect, extrude, smin, smax } = window.SDF;
  const mesh = window.SDFMesh;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ── dimensions (resting pose) ────────────────────────────────────────────────────────────────────────
  const BOWL = { hx: 1.56, hz: 1.2, rc: 0.62, top: 0.6 };
  const TRAY = { hx: 1.48, hz: 1.13, rc: 0.56, y0: 0.34, top: 0.8, ring: 0.15, floor: 0.66 };
  const HINGE = { y: 1.0, z: -0.25 };                 // the pegs on the side walls
  const OPEN = 0.7;                                    // rad: the hood's resting open angle
  const cO = Math.cos(OPEN), sO = Math.sin(OPEN);
  const HEAD = { cy: 1.93, cz: -0.1, rx: 1.56, ry: 0.48, rz: 1.12, wall: 0.17 };
  const FLAP = { x0: 1.42, x1: 1.7, y0: 0.56, z0: -0.95, z1: 0.42, lean: 0.1 };   // side walls hanging down to the bowl
  const EYE = { x: 0.62, y: 2.72, z: -0.02, r: 0.42 };
  const SOCKET = { dy: -0.03, dz: -0.25, r: 0.53 };
  const NOSE = { x: 0.38, y: 2.47, z: 0.6, r: 0.2 };
  // a lower tooth: local y = 0 is the middle of the part above the rim (the letter's centre)
  const TOOTH = { hx: 0.22, top: 0.19, bot: -0.4, hz: 0.175, r: 0.1, press: 0.2 };
  const TOOTH_Y = TRAY.top + 0.12;
  const N_TEETH = 10;
  // distance above the hood's underside plane (> 0 = inside the hood's half-space)
  const above = (y, z) => (y - HINGE.y) * cO - (z - HINGE.z) * sO;

  const COLORS = {
    skin: '#6e9e6b', interior: '#d98880', palate: '#c96a60', gum: '#ef6c58', tongue: '#e0645c', blush: '#f59aa2',
    // the mouth's depth (see bakeAO): roof near the lip → deep in the hood, the floor inside the teeth, the throat.
    // The tongue stays one flat colour (user: "악어 혀 부분은 전에꺼가 나아" — the shaded one read washed out with a dark slit)
    roofNear: '#d4736b', roofDeep: '#953540', floor: '#d9574c', throat: '#7a2b30',
    tooth: '#fbf6ee', eye: '#f8f5ef', pupil: '#16171a', claw: '#d8c463',
  };
  // the render's letter inks: blue, mint, teal, orange (front teeth in that order)
  const LETTER_COLORS = ['#3f95df', '#35b98a', '#2fa6cf', '#ef6636'];
  const TOOTH_WHITE = new THREE.Color(COLORS.tooth);

  // ── lower body ───────────────────────────────────────────────────────────────────────────────────────
  const LEGS = [
    { hip: [1.36, 0.42, 0.1], foot: [1.95, 0.19, 0.36], toe: [0.36, 0.93] },
    { hip: [1.3, 0.42, -0.85], foot: [1.86, 0.18, -1.02], toe: [0.66, -0.75] },
  ];
  function fBody(x, y, z) {
    // the tub, tucked in toward the table
    const tuck = y < 0.44 ? 0.32 * (1 - y / 0.44) * (1 - y / 0.44) : 0;
    let f = extrude(rrect(x, z, BOWL.hx - tuck, BOWL.hz - tuck, BOWL.rc), y, -0.3, BOWL.top, 0.17);
    const ax = Math.abs(x);
    for (const L of LEGS) {
      const [hx, hy, hz] = L.hip, [fx, fy, fz] = L.foot;
      let leg = roundCone(ax, y, z, hx, hy, hz, fx, fy, fz, 0.36, 0.24);
      leg = smin(leg, ellipsoid(ax, y, z, fx + L.toe[0] * 0.08, 0.17, fz + L.toe[1] * 0.08, 0.42, 0.2, 0.38), 0.16);
      f = smin(f, leg, 0.2);
    }
    return smax(f, -y, 0.06);
  }
  function fClaws(x, y, z) {
    const ax = Math.abs(x);
    let f = 1e9;
    for (const L of LEGS) {
      const cx = L.foot[0] + L.toe[0] * 0.08, cz = L.foot[2] + L.toe[1] * 0.08;      // the foot pad's centre
      const base = Math.atan2(L.toe[0], L.toe[1]);
      for (let k = -1; k <= 1; k++) {
        const a = base + k * 0.5, dx = Math.sin(a), dz = Math.cos(a);
        f = smin(f, roundCone(ax, y, z, cx + dx * 0.18, 0.15, cz + dz * 0.18, cx + dx * 0.5, 0.105, cz + dz * 0.5, 0.13, 0.1), 0.04);
      }
    }
    return f;
  }
  function fTray(x, y, z) {
    return extrude(rrect(x, z, TRAY.hx, TRAY.hz, TRAY.rc), y, TRAY.y0, TRAY.top, 0.1);
  }
  function fTongue(x, y, z) {
    let f = ellipsoid(x, y, z, 0, 0.84, -0.2, 0.84, 0.27, 0.66);
    f = smin(f, ellipsoid(x, y, z, 0, 0.8, 0.18, 0.58, 0.18, 0.32), 0.18);
    return smax(f, -ellipsoid(x, y, z, 0, 1.1, -0.08, 0.05, 0.08, 0.5), 0.06);     // a soft groove
  }

  // ── hood (upper jaw), resting open pose ──────────────────────────────────────────────────────────────
  function hoodSolid(x, y, z) {
    const ax = Math.abs(x);
    let f = ellipsoid(x, y, z, 0, HEAD.cy, HEAD.cz, HEAD.rx, HEAD.ry, HEAD.rz);                      // wide snout
    f = smin(f, ellipsoid(x, y, z, 0, 2.3, -0.25, 1.2, 0.55, 0.96), 0.45);                           // narrower skull: a bell
    f = smin(f, ellipsoid(x, y, z, 0, 2.52, -0.36, 0.98, 0.44, 0.78), 0.3);                          // brow
    f = smin(f, sphere(ax, y, z, EYE.x, EYE.y + SOCKET.dy, EYE.z + SOCKET.dz, SOCKET.r), 0.18);      // eye sockets
    f = smin(f, ellipsoid(x, y, z, 0, 2.3, 0.3, 0.74, 0.26, 0.5), 0.25);                              // snout bridge
    f = smin(f, sphere(ax, y, z, NOSE.x, NOSE.y, NOSE.z, NOSE.r), 0.16);                             // nostril mounds
    // cheeks: the outline carried down (the underside plane trims it)
    return smin(f, extrude(rrect(x, z - HEAD.cz, HEAD.rx - 0.03, HEAD.rz - 0.02, 0.92), y, 0.2, HEAD.cy, 0.22), 0.3);
  }
  function fFlaps(x, y, z) {
    const ax = Math.abs(x);
    const cx = (FLAP.x0 + FLAP.x1) / 2, cz = (FLAP.z0 + FLAP.z1) / 2, cy = (FLAP.y0 + 2.0) / 2;
    const sx = ax + FLAP.lean * (y - 2.0) / (2.0 - FLAP.y0);          // leaning out toward the bottom
    let f = roundBox(sx, y, z, cx - FLAP.lean, cy, cz, (FLAP.x1 - FLAP.x0) / 2, (2.0 - FLAP.y0) / 2, (FLAP.z1 - FLAP.z0) / 2, 0.12);
    // round the front-bottom corner (the flap's leading edge sweeps back toward the peg)
    f = smax(f, ellipsoid(sx, y, z, cx - FLAP.lean, 1.5, -0.3, 0.6, 1.1, 0.95), 0.12);
    return smin(f, roundCone(ax, y, z, FLAP.x1 - 0.04, HINGE.y, HINGE.z, FLAP.x1 + 0.08, HINGE.y, HINGE.z, 0.15, 0.13), 0.05);   // peg
  }
  function hoodCavity(x, y, z) {
    const w = HEAD.wall;
    const f = ellipsoid(x, y, z, 0, HEAD.cy - 0.06, HEAD.cz - 0.02, HEAD.rx - w, HEAD.ry - w - 0.1, HEAD.rz - w);
    return smin(f, extrude(rrect(x, z - HEAD.cz, HEAD.rx - 0.03 - w, HEAD.rz - 0.02 - w, 0.92 - w), y, -1, HEAD.cy - 0.08, 0.2), 0.24);
  }
  const NOSTRIL = (() => {            // hole on each mound's top-front
    const d = [0, 0.55, 0.835];
    return { x: NOSE.x - 0.02, y: NOSE.y + d[1] * NOSE.r, z: NOSE.z + d[2] * NOSE.r };
  })();
  function fHood(x, y, z) {
    const ax = Math.abs(x);
    let f = smax(hoodSolid(x, y, z), -hoodCavity(x, y, z), 0.06);
    f = smax(f, -above(y, z), 0.06);
    f = smin(f, fFlaps(x, y, z), 0.1);
    return smax(f, -ellipsoid(ax, y, z, NOSTRIL.x, NOSTRIL.y, NOSTRIL.z, 0.062, 0.05, 0.062), 0.035);
  }
  // where the lip's outer edge is at a given x: walk the underside plane from the front until inside the hood
  function lipAt(x) {
    for (let z = 1.6; z > -1.2; z -= 0.004) {
      const y = HINGE.y + (z - HINGE.z) * sO / cO;
      if (hoodSolid(x, y, z) < 0) return { y, z };
    }
    return { y: HINGE.y, z: HINGE.z };
  }

  // ── teeth ────────────────────────────────────────────────────────────────────────────────────────────
  function fTooth(x, y, z) {
    const t = clamp((y - TOOTH.bot) / (TOOTH.top - TOOTH.bot), 0, 1);
    const w = TOOTH.hx * (1 - 0.07 * t);                        // a little narrower toward the crown
    const cy = (TOOTH.top + TOOTH.bot) / 2, hy = (TOOTH.top - TOOTH.bot) / 2;
    const f = roundBox(x, y, z, 0, cy, 0, w, hy, TOOTH.hz, TOOTH.r);
    return smin(f, ellipsoid(x, y, z, 0, cy + 0.02, 0, w * 0.96, hy * 0.98, TOOTH.hz * 1.12), 0.03);   // domed faces
  }
  function fUpperTooth(x, y, z) {
    // hangs along −y from its root at y = 0.06: a blunt rounded peg, a bit narrower at the tip
    const k = 0.6;
    return roundCone(x, y, z / k, 0, 0.0, 0, 0, -0.15, 0, 0.19, 0.16) * k;
  }
  // left back → left side → front row → right side → right back (keys 1…9, 0)
  function toothLayout() {
    const side = [[1.12, -0.68, 1.0], [1.13, -0.19, 0.82], [1.12, 0.29, 0.64]];       // x, z, turn (back → front)
    const out = [];
    for (const [x, z, a] of side) out.push({ x: -x, z, ry: -a });
    for (const k of [-1.5, -0.5, 0.5, 1.5]) out.push({ x: k * 0.48, z: 0.66 - 0.05 * k * k, ry: -0.08 * k, front: true });
    for (const [x, z, a] of side.slice().reverse()) out.push({ x, z, ry: a });
    return out;
  }

  // ── the mouth's depth (user: "악어 입안에도 좀더 입체감이 느껴지게 퀄리티 수정해줘") ────────────────────────────
  // Ambient occlusion baked into vertex colours at build time: from each vertex, step out along its normal and see how
  // close the mouth's parts are (Inigo Quilez's SDF AO). Creases, the teeth's feet, the tongue's edge and the back of
  // the mouth come out darker; flat open faces stay as they were. The hood is taken in its modelled open pose.
  const TEETH_AT = toothLayout().map(p => ({ x: p.x, z: p.z, c: Math.cos(p.ry), s: Math.sin(p.ry) }));
  function fTeethAll(x, y, z) {
    let f = 1e9;
    for (const t of TEETH_AT) {
      const dx = x - t.x, dz = z - t.z, r2 = dx * dx + dz * dz;
      if (r2 > 0.36) { f = Math.min(f, Math.sqrt(r2) - 0.33); continue; }      // far away: a bound is enough
      f = Math.min(f, fTooth(t.c * dx - t.s * dz, y - TOOTH_Y, t.s * dx + t.c * dz));   // into the tooth's own frame
    }
    return f;
  }
  const fMouth = (x, y, z) => Math.min(fTray(x, y, z), fTongue(x, y, z), fTeethAll(x, y, z), fHood(x, y, z));
  const fMouthTub = (x, y, z) => Math.min(fMouth(x, y, z), fBody(x, y, z));
  const AO_STEPS = [0.04, 0.1, 0.18, 0.3, 0.46];
  function bakeAO(f, x, y, z, nx, ny, nz, k) {
    let occ = 0, w = 1;
    for (const d of AO_STEPS) {
      occ += w * Math.max(0, d - f(x + nx * d, y + ny * d, z + nz * d));
      w *= 0.8;
    }
    return clamp(1 - occ * k, 0.18, 1);
  }
  const mixInto = (out, a, b, t) => { out[0] = a.r + (b.r - a.r) * t; out[1] = a.g + (b.g - a.g) * t; out[2] = a.b + (b.b - a.b) * t; };
  /* the hood's material: skin (vertex colour) or the mouth (aInner) by the sign of aSel, per pixel, anti-aliased */
  function hoodPick(m) {
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aInner;\nattribute float aSel;\nvarying vec3 vInner;\nvarying float vSel;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInner = aInner;\nvSel = aSel;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vInner;\nvarying float vSel;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n{ float fw = max(fwidth(vSel), 1e-5); diffuseColor.rgb = mix(diffuseColor.rgb, vInner, smoothstep(-fw, fw, vSel)); }');
    };
    m.customProgramCacheKey = () => 'croc-hood-pick';
    return m;
  }

  // ── letters on the teeth ─────────────────────────────────────────────────────────────────────────────
  function drawLetter(c, ch, color) {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `700 ${ch.length > 1 ? 140 : 190}px "Baloo 2", "Arial Rounded MT Bold", "Nunito", sans-serif`;    // qu: two letters
    g.fillStyle = 'rgba(30,40,70,0.16)';                 // a soft print shadow
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
    const S = 0.44;                                       // texture size on the face
    for (const v of keep) {
      if (!map.has(v)) {
        map.set(v, pos.length / 3);
        const nx = N.getX(v), ny = N.getY(v), nz = N.getZ(v);
        const x = P.getX(v) + nx * 0.004, y = P.getY(v) + ny * 0.004, z = P.getZ(v) + nz * 0.004;
        pos.push(x, y, z); nor.push(nx, ny, nz);
        uv.push(x / S + 0.5, (y - 0.035) / S + 0.5);          // letter centred on the face above the tray
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
   * iris painted round the ball's +z (the gaze) with a darker pupil and a soft dark rim, two catch-lights fixed in
   * screen space on the iris (a big one up-left, a small one down-right). Flat-shaded, no mirror gloss.
   * (Phonics-Match-3D src/app.js EYE_FS) */
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

  function build(scene, opts = {}) {
    const q = opts.quality || 1;
    const H = 0.03 / q;
    const t0 = performance.now();
    // matte clay (user: "너무 실사같이 광택이 들어가있어"): no clearcoat, sheen or mirror reflections
    const mat = (hex, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.82, metalness: 0, envMapIntensity: 0.5 }, o));
    const M = {
      skin: mat(COLORS.skin),
      hood: hoodPick(mat('#ffffff', { vertexColors: true })),
      gum: mat('#ffffff', { roughness: 0.74, vertexColors: true }),
      tongue: mat(COLORS.tongue, { roughness: 0.7 }),
      claw: mat(COLORS.claw, { roughness: 0.74 }),
      tooth: mat(COLORS.tooth, { roughness: 0.6, emissive: '#000000', vertexColors: true }),
      eye: eyeMaterial(),
      lash: new THREE.MeshBasicMaterial({ color: '#2a3a26' }),
    };
    const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };

    const root = new THREE.Group();
    root.name = 'croc';
    scene.add(root);
    const base = new THREE.Group();
    root.add(base);
    base.add(shadowy(new THREE.Mesh(mesh(fBody, [-2.55, -0.05, -1.62, 2.55, 0.82, 1.5], H), M.skin)));
    base.add(shadowy(new THREE.Mesh(mesh(fClaws, [-2.68, -0.03, -1.82, 2.68, 0.32, 1.2], H * 0.5), M.claw)));
    const C = k => new THREE.Color(COLORS[k]);
    const cGum = C('gum'), cFloor = C('floor'), cThroat = C('throat');
    // the tray: the floor inside the ring of teeth deeper red, darker toward the back (the throat); the coral rim in
    // front stays bright; AO round the teeth, the tongue, the side walls and where the tray meets the tub
    const trayGeo = mesh(fTray, [-1.5, 0.3, -1.18, 1.5, 0.84, 1.18], H * 0.8, {
      color(x, y, z, out, nx, ny, nz) {
        const ex = x / 1.0, ez = (z + 0.12) / 0.7, inside = smooth(1.02, 0.8, Math.sqrt(ex * ex + ez * ez)) * smooth(0.5, 0.85, ny);
        mixInto(out, cGum, cFloor, inside);
        const back = smooth(0.15, -0.95, z) * inside;
        out[0] += (cThroat.r - out[0]) * back * 0.85; out[1] += (cThroat.g - out[1]) * back * 0.85; out[2] += (cThroat.b - out[2]) * back * 0.85;
        const ao = bakeAO(fMouthTub, x, y, z, nx, ny, nz, 1.7);
        out[0] *= ao; out[1] *= ao; out[2] *= ao;
      },
    });
    base.add(shadowy(new THREE.Mesh(trayGeo, M.gum)));
    base.add(shadowy(new THREE.Mesh(mesh(fTongue, [-0.92, 0.5, -0.92, 0.92, 1.16, 0.58], H), M.tongue)));

    // hood: pivot at the hinge, children in croc coordinates
    const lid = new THREE.Group();
    lid.position.set(0, HINGE.y, HINGE.z);
    root.add(lid);
    const lidIn = new THREE.Group();
    lidIn.position.set(0, -HINGE.y, -HINGE.z);
    lid.add(lidIn);
    const cSkin = new THREE.Color(COLORS.skin), cPal = new THREE.Color(COLORS.palate);
    const cRoofNear = new THREE.Color(COLORS.roofNear), cRoofDeep = new THREE.Color(COLORS.roofDeep), cIn = new THREE.Color();
    const cBlush = new THREE.Color(COLORS.blush);
    /* the hood's colours (user: "위에 악어 이빨 옆에 영역들도 정리가 필요해보여"): green skin outside and on the side walls,
       the mouth's inside (the lip's cut face → a dark-red band along the lip → the roof, darker toward the throat, with
       AO). Which of the two a point shows is decided PER PIXEL: per-vertex colours could only blend between vertices,
       so the band's edge zigzagged along the triangles and the side wall / mouth seam was a wide mixed strip. Each vertex
       carries the skin colour (color), the mouth colour (aInner) and a signed field (aSel: > 0 = the lip's cut face or
       the cavity is the surface, < 0 = the outside or a side wall); the shader (hoodPick) cuts it at 0, anti-aliased. */
    const hoodGeo = mesh(fHood, [-2.0, 0.1, -1.45, 2.0, EYE.y + SOCKET.r + 0.08, 1.3], H);
    {
      const P = hoodGeo.attributes.position.array, N = hoodGeo.attributes.normal.array, nv = P.length / 3;
      const col = new Float32Array(nv * 3), inner = new Float32Array(nv * 3), sel = new Float32Array(nv);
      for (let k = 0; k < nv; k++) {
        const x = P[3 * k], y = P[3 * k + 1], z = P[3 * k + 2];
        const solid = hoodSolid(x, y, z), cav = -hoodCavity(x, y, z), cut = -above(y, z), top = Math.max(solid, cav, cut);
        // rosy cheeks on the snout's sides, under the eyes
        const dx = Math.abs(x) - 1.0, dy = y - 2.2, dz = z - 0.5;
        const bl = 0.8 * Math.exp(-(dx * dx + dy * dy * 2.2 + dz * dz * 0.8) / 0.045);
        col[3 * k] = cSkin.r + (cBlush.r - cSkin.r) * bl; col[3 * k + 1] = cSkin.g + (cBlush.g - cSkin.g) * bl; col[3 * k + 2] = cSkin.b + (cBlush.b - cSkin.b) * bl;
        // … and within 0.1 of a side wall it is the side wall: there the lip's cut face was a thin red sliver squeezed
        // between the band and the wall (a torn-looking wedge at each corner) — now the band ends cleanly at the green
        // wall, whose inside stays green like the reference render
        const s = Math.min(Math.max(cut, cav) - solid, fFlaps(x, y, z) - top - 0.1);
        sel[k] = s;
        if (s < -0.05) { inner[3 * k] = cPal.r; inner[3 * k + 1] = cPal.g; inner[3 * k + 2] = cPal.b; continue; }   // skin, far from the edge
        // the mouth: the lip's cut face and a band along the lip dark red; the roof further in, a warm red up top,
        // darker down toward the throat; AO in the creases
        const onCut = smooth(-0.02, 0.02, cut - Math.max(solid, cav));
        const band = smooth(0.32, 0.16, above(y, z)) * smooth(-0.1, 0.35, z);
        cIn.copy(cRoofNear).lerp(cRoofDeep, clamp(0.7 * smooth(2.05, 1.2, y) + 0.3 * smooth(0.1, 0.7, above(y, z)), 0, 1));
        cIn.lerp(cPal, 1 - (1 - onCut) * (1 - band));
        const ao = bakeAO(fMouth, x, y, z, N[3 * k], N[3 * k + 1], N[3 * k + 2], 1.1);
        inner[3 * k] = cIn.r * ao; inner[3 * k + 1] = cIn.g * ao; inner[3 * k + 2] = cIn.b * ao;
      }
      hoodGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      hoodGeo.setAttribute('aInner', new THREE.BufferAttribute(inner, 3));
      hoodGeo.setAttribute('aSel', new THREE.BufferAttribute(sel, 1));
    }
    const head = shadowy(new THREE.Mesh(hoodGeo, M.hood));
    lidIn.add(head);

    // upper teeth hang from the palate band, square to the underside plane (straight down once shut)
    // upper teeth: a soft shade toward the root (where they come out of the palate band)
    const utGeo = mesh(fUpperTooth, [-0.23, -0.36, -0.15, 0.23, 0.23, 0.15], H * 0.45, {
      color(x, y, z, out) { const g = 1 - 0.3 * smooth(-0.04, 0.12, y); out[0] = g; out[1] = g * 0.975; out[2] = g * 0.955; },
    });
    const upper = [];
    for (const [x, sc, inset] of [[-0.58, 0.92, 0.13], [0.58, 0.92, 0.13], [-1.06, 0.46, 0.12], [1.06, 0.46, 0.12], [-1.24, 0.42, 0.12], [1.24, 0.42, 0.12]]) {
      const lp = lipAt(x);
      const t = new THREE.Mesh(utGeo, M.tooth);
      // root just inside the lip, on the plane; inward = back along the plane
      t.position.set(x, lp.y - inset * sO + 0.02 * cO, lp.z - inset * cO - 0.02 * sO);
      t.rotation.x = -OPEN;
      t.scale.set(sc, sc * 1.05, sc);
      t.castShadow = true;
      lidIn.add(t);
      upper.push(t);
    }

    // eyes: a ball that turns to look (its iris is painted round +z: eyeMaterial), an eyelid shell for blinks/squints,
    // a dark ∩ arc on the shut lid for the happy face
    const eyes = [];
    const eyeGeo = new THREE.SphereGeometry(EYE.r, 64, 48);
    const lidCapGeo = new THREE.SphereGeometry(EYE.r * 1.04, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const arcGeo = new THREE.TorusGeometry(EYE.r * 0.5, EYE.r * 0.075, 10, 28, Math.PI);
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * EYE.x, EYE.y, EYE.z);
      lidIn.add(g);
      const sg = new THREE.Group();                 // scaled when wide-eyed
      g.add(sg);
      const look = new THREE.Group();
      sg.add(look);
      const ball = new THREE.Mesh(eyeGeo, M.eye);
      ball.castShadow = true;
      look.add(ball);
      const lidPivot = new THREE.Group();
      g.add(lidPivot);
      const cap = new THREE.Mesh(lidCapGeo, M.skin);
      cap.castShadow = true;
      cap.visible = false;
      lidPivot.add(cap);
      const arc = new THREE.Mesh(arcGeo, M.lash);
      arc.position.set(0, -EYE.r * 0.12, EYE.r * 1.07);
      arc.visible = false;
      g.add(arc);
      eyes.push({ g, sg, ball, look, cap, arc, side: sx });
    }

    // lower teeth
    // lower teeth: a soft shade at the gum line (the tray top is at local y −0.12), so they stand IN the gum
    const toothGeo = mesh(fTooth, [-0.26, -0.46, -0.22, 0.26, 0.26, 0.23], H * 0.5, {
      color(x, y, z, out) { const g = 1 - 0.32 * smooth(0.04, -0.13, y); out[0] = g; out[1] = g * 0.975; out[2] = g * 0.955; },
    });
    const decalGeo = decalGeometry(toothGeo);
    const hitGeo = new THREE.BoxGeometry(TOOTH.hx * 2.5, 0.5, TOOTH.hz * 3.2);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const layout = toothLayout();
    const teeth = layout.map((p, i) => {
      const g = new THREE.Group();
      g.position.set(p.x, TOOTH_Y, p.z);
      g.rotation.y = p.ry;
      base.add(g);
      const m = shadowy(new THREE.Mesh(toothGeo, M.tooth.clone()));
      g.add(m);
      const color = LETTER_COLORS[(i + 1) % LETTER_COLORS.length];
      const dm = new THREE.MeshStandardMaterial({
        map: letterTexture('m', color), transparent: true, roughness: 0.6, envMapIntensity: 0.5,
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
    const api = makeApi({ root, base, lid, lidIn, head, eyes, teeth, upper, M, glowLight });
    api.buildMs = Math.round(performance.now() - t0);
    api.tris = 0;
    root.traverse(o => { if (o.isMesh && o.geometry.index) api.tris += o.geometry.index.count / 3; });
    return api;
  }

  // ── behaviour ───────────────────────────────────────────────────────────────────────────────────────
  function makeApi(P) {
    const st = {
      open: 1, openTarget: 1, openVel: 0, snap: null, rest: 1, talk: 0, talkT: 0,
      squint: 0, squintTarget: 0, blink: 0, blinkT: 0, nextBlink: 1.5,
      gaze: null, gazeSm: new THREE.Vector3(0, 2, 9), wander: new THREE.Vector3(), nextWander: 2,
      eyeWide: 0, happy: 0, happyT: 0, surp: 0, surpT: 0, cheerTimer: 0, time: 0,
    };
    const tmpV = new THREE.Vector3(), eyeW = new THREE.Vector3(), dir = new THREE.Vector3(), inv = new THREE.Quaternion();

    const api = {
      parts: P, OPEN, teeth: P.teeth, N_TEETH,
      frontTeeth: P.teeth.filter(t => t.front).map(t => t.i),
      get root() { return P.root; },
      /* 0 = shut, 1 = resting open (> 1 opens wider) */
      setOpen(v, instant) { st.snap = null; st.openTarget = v; if (instant) { st.open = v; st.openVel = 0; } },
      /* fast bite: shut with a small rebound, then rest shut */
      chomp() { st.snap = { t: 0, from: st.open }; st.openTarget = 0; st.squintTarget = 0.8; },
      reopen() { st.snap = null; st.openTarget = st.rest; st.squintTarget = 0; },
      /* how wide the mouth rests open (1 = as in the renders); the game view opens it wider */
      rest(v) { st.rest = v; if (!st.snap && st.openTarget > 0.5) st.openTarget = v; },
      squint(v) { st.squintTarget = v; },
      /* the tutor speaking (on/off) */
      talk(v) { st.talkT = v ? 1 : 0; },
      /* the intro's entrance: grows out of its spot on the table with a quarter turn, mouth shut, then opens.
         An ease-out, no overshoot (the toy never bounces) */
      enter(ms = 1150) { st.enter = { t: 0, ms: ms / 1000 }; st.snap = null; st.open = 0; st.openVel = 0; st.openTarget = 0; P.root.scale.setScalar(0.35); P.root.rotation.y = -0.9; },
      blink() { st.blinkT = 0.0001; },
      wide(v = 1) { st.eyeWide = v; },
      // the toy stays put: no trembling, shaking or bouncing (user: "악어 이빨 누르면 떨림이 있어")
      tremble() {}, shake() {}, bounce() {},
      /* the sheet's expressions, eyes only: happy (lids shut in a ^^ smile), surprised (wide eyes, smaller iris) */
      happy(v = 1) { st.happyT = v; clearTimeout(st.cheerTimer); },
      cheer(ms = 1500) { st.happyT = 1; clearTimeout(st.cheerTimer); st.cheerTimer = setTimeout(() => { st.happyT = 0; }, ms); },
      surprise(v = 1) { st.surpT = v; if (v) st.eyeWide = Math.max(st.eyeWide, 1.2); },
      /* world-space point to look at (null = wander around the viewer) */
      look(p) { st.gaze = p ? p.clone() : null; },
      press(i) { P.teeth[i].pressed = true; },
      release(i) { P.teeth[i].pressed = false; },
      /* the level's letter on every tooth (game.js setLevel), drawn on the same textures */
      setLetter(ch) {
        for (const t of P.teeth) { const tex = t.decal.material.map; tex.userData.ch = ch; drawLetter(tex.image, ch, tex.userData.color); tex.needsUpdate = true; }
      },
      /* a letter per tooth (game.js: the title's mix of the levels' letters) */
      setLetters(chs) {
        P.teeth.forEach((t, i) => {
          const tex = t.decal.material.map, ch = chs[i % chs.length];
          if (tex.userData.ch === ch) return;
          tex.userData.ch = ch; drawLetter(tex.image, ch, tex.userData.color); tex.needsUpdate = true;
        });
      },
      /* redraw the tooth letters once the web font has loaded */
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
      occluders: [P.head, ...P.upper],
      toothMeshes: P.teeth.map(t => t.mesh),
      state: st,
      update(dt, camera) {
        st.time += dt;
        const t = st.time;
        if (st.enter) {
          const k = Math.min(1, (st.enter.t += dt) / st.enter.ms), e = 1 - Math.pow(1 - k, 3);
          P.root.scale.setScalar(0.35 + 0.65 * e);
          P.root.rotation.y = -0.9 * (1 - e);
          if (k > 0.72 && st.openTarget === 0 && !st.snap) st.openTarget = st.rest;
          if (k >= 1) st.enter = null;
        }
        // jaw: spring toward the target; a snap shuts in ~0.1 s with a small rebound
        if (st.snap) {
          st.snap.t += dt;
          const k = st.snap.t;
          st.open = k < 0.1 ? st.snap.from * (1 - (k / 0.1) * (k / 0.1)) : Math.max(0, 0.07 * Math.exp(-(k - 0.1) * 10) * Math.sin((k - 0.1) * 28));
          if (k > 0.7) st.open = 0;
        } else {
          const a = (st.openTarget - st.open) * 60 - st.openVel * 11;
          st.openVel += a * dt; st.open += st.openVel * dt;
        }
        st.talk += (st.talkT - st.talk) * Math.min(1, dt * 8);
        const syl = st.talk * clamp((st.open - 0.25) / 0.5, 0, 1) * 0.15
          * (0.5 - 0.5 * Math.cos(st.time * 10.5)) * (0.75 + 0.25 * Math.sin(st.time * 3.3 + 1));
        P.lid.rotation.x = OPEN * (1 - clamp(st.open, -0.05, 1.35) + syl);
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
        const ez = Math.min(1, dt * 9);
        st.happy += (st.happyT - st.happy) * ez;
        st.surp += (st.surpT - st.surp) * ez;
        st.eyeWide = Math.max(st.surpT ? 1 : 0, st.eyeWide - dt * 1.4);
        P.M.eye.uniforms.uIris.value = (41 - 7 * Math.min(1, st.surp)) * Math.PI / 180;     // surprised: smaller iris
        const close = clamp(Math.max(st.squint, st.blink, st.happy * 1.05), 0, 1);
        for (const e of P.eyes) {
          e.cap.visible = close > 0.02;
          e.cap.parent.rotation.x = -0.62 + close * 2.06;        // tucked at the back → over the front
          e.arc.visible = st.happy > 0.6;
          const w = 1 + 0.1 * Math.sin(Math.min(1, st.eyeWide) * Math.PI / 2) * (st.eyeWide > 0 ? 1 : 0);
          e.sg.scale.setScalar(w);
        }
        // gaze: the target (smoothed) or a gentle wander around the viewer
        st.nextWander -= dt;
        if (st.nextWander <= 0) {
          st.nextWander = 1.6 + Math.random() * 2.5;
          st.wander.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8, 0);
        }
        // at the viewer: a far point keeps both eyes nearly parallel (a near one made them cross)
        const goal = st.gaze ? tmpV.copy(st.gaze) : tmpV.copy(camera.position).add(st.wander);
        st.gazeSm.lerp(goal, Math.min(1, dt * (st.gaze ? 10 : 3)));
        for (const e of P.eyes) {
          // keep the pupil in the eye's visible front: clamp yaw and pitch in the eye's own frame
          e.g.getWorldPosition(eyeW);
          dir.copy(st.gazeSm).sub(eyeW);
          e.g.getWorldQuaternion(inv).invert();
          dir.applyQuaternion(inv);
          const yaw = clamp(Math.atan2(dir.x, dir.z), -0.7, 0.7);
          const pitch = clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -0.3, 0.5);
          e.look.rotation.set(-pitch, yaw, 0, 'YXZ');
        }
      },
    };
    return api;
  }

  window.Croc = { build, COLORS, OPEN };
})();
