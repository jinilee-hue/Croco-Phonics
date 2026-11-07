/* Croco Phonics — tiny SDF toolkit + Surface Nets mesher → smooth "clay" THREE.BufferGeometry.
 * Shapes are written as plain signed-distance functions f(x, y, z) (negative = inside).
 * mesh(f, box, h, {color}) samples f on a grid of cell size h, places one vertex per surface cell
 * (mean of the edge crossings, then pulled onto the surface along the gradient), joins quads across every
 * sign-changing grid edge and takes normals from the SDF gradient → no facets, toy-like smooth shading.
 */
(function () {
  'use strict';
  const sqrt = Math.sqrt, abs = Math.abs, max = Math.max, min = Math.min;

  const SDF = {
    sphere(x, y, z, cx, cy, cz, r) {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      return sqrt(dx * dx + dy * dy + dz * dz) - r;
    },
    ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
      const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
      const k0 = sqrt(px * px + py * py + pz * pz);
      const qx = px / rx, qy = py / ry, qz = pz / rz;
      const k1 = sqrt(qx * qx + qy * qy + qz * qz);
      return k1 < 1e-9 ? -min(rx, ry, rz) : k0 * (k0 - 1) / k1;
    },
    roundBox(x, y, z, cx, cy, cz, bx, by, bz, r) {
      const qx = abs(x - cx) - bx + r, qy = abs(y - cy) - by + r, qz = abs(z - cz) - bz + r;
      const ox = max(qx, 0), oy = max(qy, 0), oz = max(qz, 0);
      return sqrt(ox * ox + oy * oy + oz * oz) + min(max(qx, qy, qz), 0) - r;
    },
    capsule(x, y, z, ax, ay, az, bx, by, bz, r) {
      const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
      const h = max(0, min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
      const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
      return sqrt(dx * dx + dy * dy + dz * dz) - r;
    },
    /* capsule with different end radii (r1 at a, r2 at b) */
    roundCone(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
      const bax = bx - ax, bay = by - ay, baz = bz - az;
      const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
      const pax = x - ax, pay = y - ay, paz = z - az;
      const yv = pax * bax + pay * bay + paz * baz, zv = yv - l2;
      const cx = pax * l2 - bax * yv, cy = pay * l2 - bay * yv, cz = paz * l2 - baz * yv;
      const x2 = cx * cx + cy * cy + cz * cz, y2 = yv * yv * l2, z2 = zv * zv * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yv) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
      return (sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
    },
    /* 2D rounded rectangle (half sizes hx, hz, corner radius rc) */
    rrect(x, z, hx, hz, rc) {
      const qx = abs(x) - hx + rc, qz = abs(z) - hz + rc;
      const ox = max(qx, 0), oz = max(qz, 0);
      return sqrt(ox * ox + oz * oz) + min(max(qx, qz), 0) - rc;
    },
    /* extrude a 2D distance d2 over y0..y1 with all edges rounded by r */
    extrude(d2, y, y0, y1, r) {
      const cy = (y0 + y1) / 2, hh = (y1 - y0) / 2;
      const wx = d2 + r, wy = abs(y - cy) - hh + r;
      const ox = max(wx, 0), oy = max(wy, 0);
      return min(max(wx, wy), 0) + sqrt(ox * ox + oy * oy) - r;
    },
    smin(a, b, k) {
      const h = max(k - abs(a - b), 0) / k;
      return min(a, b) - h * h * k * 0.25;
    },
    smax(a, b, k) {
      const h = max(k - abs(a - b), 0) / k;
      return max(a, b) + h * h * k * 0.25;
    },
  };

  // cube corners (dx, dy, dz) as bit index dx + 2dy + 4dz and the 12 edges between them
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

  /**
   * f: (x,y,z) => signed distance. box: [x0,y0,z0,x1,y1,z1]. h: cell size.
   * opts.color: (x,y,z,out[3]) => void  → vertex colours (linear 0..1)
   * opts.project: Newton steps onto the surface (default 2)
   */
  function mesh(f, box, h, opts = {}) {
    const [x0, y0, z0, x1, y1, z1] = box;
    const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
    const sxy = nx * ny;
    const F = new Float32Array(nx * ny * nz);
    let i = 0;
    for (let z = 0; z < nz; z++) {
      const pz = z0 + z * h;
      for (let y = 0; y < ny; y++) {
        const py = y0 + y * h;
        for (let x = 0; x < nx; x++, i++) F[i] = f(x0 + x * h, py, pz);
      }
    }
    const cx = nx - 1, cy = ny - 1, cz = nz - 1, cxy = cx * cy;
    const cell = new Int32Array(cx * cy * cz).fill(-1);
    const pos = [];
    const v = new Float32Array(8);
    const off = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
    for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) {
      const base = x + y * nx + z * sxy;
      let mask = 0;
      for (let c = 0; c < 8; c++) { v[c] = F[base + off[c]]; if (v[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const a = EDGES[e][0], b = EDGES[e][1];
        const va = v[a], vb = v[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
        const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; n++;
      }
      cell[x + y * cx + z * cxy] = pos.length / 3;
      pos.push(x0 + (x + sx / n) * h, y0 + (y + sy / n) * h, z0 + (z + sz / n) * h);
    }
    const idx = [];
    const C = (x, y, z) => cell[x + y * cx + z * cxy];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) { const t = b; b = d; d = t; }
      idx.push(a, b, c, a, c, d);
    };
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const g = x + y * nx + z * sxy, inside = F[g] < 0;
      // edge along +x: the 4 cells around it in the (y, z) plane (CCW seen from +x when inside → outside)
      if (x < cx && y > 0 && y < cy && z > 0 && z < cz && inside !== (F[g + 1] < 0))
        quad(C(x, y - 1, z - 1), C(x, y, z - 1), C(x, y, z), C(x, y - 1, z), !inside);
      // edge along +y: cells in the (z, x) plane
      if (y < cy && z > 0 && z < cz && x > 0 && x < cx && inside !== (F[g + nx] < 0))
        quad(C(x - 1, y, z - 1), C(x - 1, y, z), C(x, y, z), C(x, y, z - 1), !inside);
      // edge along +z: cells in the (x, y) plane
      if (z < cz && x > 0 && x < cx && y > 0 && y < cy && inside !== (F[g + sxy] < 0))
        quad(C(x - 1, y - 1, z), C(x, y - 1, z), C(x, y, z), C(x - 1, y, z), !inside);
    }
    // pull vertices onto the surface and take smooth normals from the gradient
    const nv = pos.length / 3, P = new Float32Array(pos), N = new Float32Array(nv * 3);
    const e = h * 0.5, steps = opts.project == null ? 2 : opts.project;
    for (let k = 0; k < nv; k++) {
      let px = P[3 * k], py = P[3 * k + 1], pz = P[3 * k + 2];
      let gx = 0, gy = 0, gz = 1;
      for (let s = 0; s <= steps; s++) {
        gx = f(px + e, py, pz) - f(px - e, py, pz);
        gy = f(px, py + e, pz) - f(px, py - e, pz);
        gz = f(px, py, pz + e) - f(px, py, pz - e);
        const gl = sqrt(gx * gx + gy * gy + gz * gz) || 1;
        gx /= gl; gy /= gl; gz /= gl;
        if (s === steps) break;
        const d = f(px, py, pz);
        const mv = max(-h * 0.7, min(h * 0.7, d));
        px -= gx * mv; py -= gy * mv; pz -= gz * mv;
      }
      P[3 * k] = px; P[3 * k + 1] = py; P[3 * k + 2] = pz;
      N[3 * k] = gx; N[3 * k + 1] = gy; N[3 * k + 2] = gz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (opts.color) {
      const col = new Float32Array(nv * 3), out = [0, 0, 0];
      for (let k = 0; k < nv; k++) {
        opts.color(P[3 * k], P[3 * k + 1], P[3 * k + 2], out);
        col[3 * k] = out[0]; col[3 * k + 1] = out[1]; col[3 * k + 2] = out[2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  window.SDF = SDF;
  window.SDFMesh = mesh;
})();
