/* Croco Phonics — three.js stage: renderer, camera framing, light, soft table shadow, picking, loop.
 * The page background (playroom) is CSS behind a transparent canvas; the croc sits on an invisible table plane that
 * only catches its shadow.
 */
(function () {
  'use strict';
  const S = {
    renderer: null, scene: null, camera: null, croc: null, canvas: null,
    frame: { y: 0.66, h: 0.6, el: 20 },         // where the croc sits on screen (centre y as a fraction from the top), its height fraction, camera elevation°
    frameTo: null, onTick: [], pointer: { x: 0, y: 0, inside: false }, ray: new THREE.Raycaster(), fps: 0,
  };
  const T = new THREE.Vector3(0, 1.6, 0.15);      // the croc's visual centre (feet → eye tops)

  function contactTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grd.addColorStop(0, 'rgba(40,52,40,0.55)');
    grd.addColorStop(0.45, 'rgba(40,52,40,0.28)');
    grd.addColorStop(1, 'rgba(40,52,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  S.init = function (canvas, opts = {}) {
    S.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    r.setClearColor(0x000000, 0);
    S.renderer = r;

    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    S.scene = scene;

    scene.add(new THREE.HemisphereLight('#ffffff', '#cdbb9f', 0.85));
    const key = new THREE.DirectionalLight('#fff4e6', 2.1);
    key.position.set(-3.2, 7.5, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -3.6, right: 3.6, top: 3.6, bottom: -3.6, near: 2, far: 20 });
    key.shadow.radius = 6;
    key.shadow.blurSamples = 16;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight('#e3ecff', 0.7);
    fill.position.set(5, 3, 5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 0.8);
    rim.position.set(1, 5, -6);
    scene.add(rim);
    S.lights = { key, fill, rim };

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14, color: '#3a4a3a' }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 3.7), new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(0, 0.004, 0.02);
    scene.add(contact);

    S.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    window.addEventListener('resize', S.resize);
    S.resize();
    return S;
  };

  S.setFrame = function (f, ms = 0) {
    if (!ms) { Object.assign(S.frame, f); S.resize(); return; }
    S.frameTo = { from: Object.assign({}, S.frame), to: Object.assign({}, S.frame, f), t: 0, ms };
  };

  S.resize = function () {
    const c = S.canvas, w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    S.renderer.setSize(w, h, false);
    const cam = S.camera, f = S.frame;
    cam.aspect = w / h;
    const vfov = cam.fov * Math.PI / 180;
    const croH = 3.3, croW = 3.7;                           // croc visual size (units): feet → eye tops, foot to foot
    let d = croH / (2 * Math.tan(vfov / 2) * f.h);
    const dw = croW / (2 * Math.tan(vfov / 2) * cam.aspect * 0.86);
    d = Math.max(d, dw);
    const el = f.el * Math.PI / 180;
    cam.position.set(T.x, T.y + Math.sin(el) * d, T.z + Math.cos(el) * d);
    cam.lookAt(T);
    // slide the picture so the croc's centre lands at frame.y (fraction from the top)
    cam.setViewOffset(w, h, 0, -(f.y - 0.5) * h, w, h);
    cam.updateProjectionMatrix();
    S.dist = d;
  };

  S.setCroc = function (c) { S.croc = c; };

  /* world → CSS px of the canvas */
  S.project = function (v) {
    const p = v.clone().project(S.camera), c = S.canvas;
    return { x: (p.x + 1) / 2 * c.clientWidth, y: (1 - p.y) / 2 * c.clientHeight };
  };

  /* tooth index under a client point, or -1 */
  S.pick = function (clientX, clientY) {
    if (!S.croc) return -1;
    const rect = S.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    S.ray.setFromCamera(nd, S.camera);
    // the tooth actually under the finger first; the larger invisible pads only when no tooth is hit
    let hits = S.ray.intersectObjects(S.croc.toothMeshes, false);
    if (!hits.length) hits = S.ray.intersectObjects(S.croc.hitMeshes, false);
    return hits.length ? hits[0].object.userData.tooth : -1;
  };
  /* is the croc (any part) under a client point? */
  S.hitCroc = function (clientX, clientY) {
    if (!S.croc) return false;
    const rect = S.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    S.ray.setFromCamera(nd, S.camera);
    return S.ray.intersectObject(S.croc.root, true).length > 0;
  };

  let last = 0, acc = 0, frames = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    acc += dt; frames++;
    if (acc > 1) { S.fps = Math.round(frames / acc); acc = 0; frames = 0; }
    if (S.frameTo) {
      const ft = S.frameTo;
      ft.t += dt * 1000;
      const k = Math.min(1, ft.t / ft.ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      for (const key of Object.keys(ft.to)) S.frame[key] = ft.from[key] + (ft.to[key] - ft.from[key]) * e;
      S.resize();
      if (k >= 1) S.frameTo = null;
    }
    for (const fn of S.onTick) fn(dt, now);
    if (S.croc) S.croc.update(dt, S.camera);
    S.renderer.render(S.scene, S.camera);
  }
  S.start = function () { requestAnimationFrame(loop); };
  /* deterministic stepping for tests */
  S.step = function (dt, n = 1) { for (let i = 0; i < n; i++) { for (const fn of S.onTick) fn(dt, 0); if (S.croc) S.croc.update(dt, S.camera); } S.renderer.render(S.scene, S.camera); };

  window.Stage = S;
})();
