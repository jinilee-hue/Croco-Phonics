import time, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.goto('http://127.0.0.1:5211/index.html?nohowto')
    pg.wait_for_function('window.__ready === true', timeout=60000)
    time.sleep(3)
    info = pg.evaluate('''() => {
      const out = [];
      __croco.croc.root.traverse(o => { if (o.isMesh && o.geometry.index) out.push([o.material.color ? '#' + o.material.color.getHexString() : '', o.geometry.index.count / 3 | 0]); });
      const r = __croco.Stage.renderer;
      return { buildMs: __croco.croc.buildMs, tris: __croco.croc.tris | 0, parts: out.sort((a, b) => b[1] - a[1]).slice(0, 8), fps: __croco.Stage.fps, gl: r.getContext().getParameter(r.getContext().VERSION) };
    }''')
    print(json.dumps(info))
    # GPU cost: render + finish
    ms = pg.evaluate('''() => { const S = __croco.Stage, gl = S.renderer.getContext(); const t0 = performance.now(); for (let i = 0; i < 30; i++) { S.renderer.render(S.scene, S.camera); } gl.finish(); return (performance.now() - t0) / 30; }''')
    print('render ms/frame', round(ms, 2))
    b.close()
