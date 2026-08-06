/* ===================== the shared toolkit =====================
   WHAT A PLACE IS ALLOWED TO IMPORT RATHER THAN BE HANDED.

   The core of this mockup lives in an inline <script type="module">, and an inline module can
   import from a file but cannot be imported FROM. That is the whole reason places/*.js receive a
   context object instead of importing what they need: there is no way to reach into the page.

   It is not a reason for the context object to carry EVERYTHING, though. Anything that depends on
   nothing but THREE and a canvas can live in a real file, and then both the page and every place
   import it from the same place. That is this file.

   The membership test was mechanical, not aesthetic: strip comments and string bodies from the
   core (it is mostly prose, and `at`, `W`, `ridge` and `INK` are ordinary English as well as
   declarations), take each candidate's transitive dependencies, and keep only those whose closure
   stays inside the set. Nothing here touches the scene, the renderer, the look state or the
   world's coordinate frame — those stay in the context object, because they ARE the page.

   Moving these took 8 names out of REVIEW's context and 1 out of STUDY's. */
import * as THREE from 'three';

/* ================= textures ================= */
export function softDot(r, g, b, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function blotTexture(size, blobs, r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  for (let i = 0; i < blobs; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.5;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.5;
    const rad = size * (0.10 + Math.random() * 0.22);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},0.3)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

export function ringTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(232,196,124,0.7)';
  ctx.lineWidth = size * 0.045;
  ctx.beginPath(); ctx.arc(size/2, size/2, size*0.4, 0, 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(232,196,124,0.28)';
  ctx.lineWidth = size * 0.02;
  ctx.beginPath(); ctx.arc(size/2, size/2, size*0.31, 0, 7); ctx.stroke();
  return new THREE.CanvasTexture(c);
}

export function cloudTexture(S = 512) {
  const hash = (x, y, p) => {
    const xi = ((x % p) + p) % p, yi = ((y % p) + p) % p;
    const n = Math.sin(xi * 127.1 + yi * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = sm(x - xi), v = sm(y - yi);
    return hash(xi, yi, p) * (1 - u) * (1 - v) + hash(xi + 1, yi, p) * u * (1 - v)
         + hash(xi, yi + 1, p) * (1 - u) * v + hash(xi + 1, yi + 1, p) * u * v;
  };
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0, amp = 0.55, f = 3;
      for (let o = 0; o < 5; o++) { v += noise(x / S * f, y / S * f, f) * amp; amp *= 0.5; f *= 2; }
      /* capped at 0.85 so even a cloud's core still passes light — uncapped reads as a hole */
      const lit = Math.round(255 * (1 - THREE.MathUtils.smoothstep(v, 0.40, 0.74) * 0.85));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = lit; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function mergeParts(parts) {
  const prepped = parts.map(({ geo, color }) => ({
    g: geo.index ? geo.toNonIndexed() : geo, c: new THREE.Color(color),
  }));
  const total = prepped.reduce((n, p) => n + p.g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  /* WHICH PART EACH VERTEX CAME FROM. The outline welds coincident vertices so a flat-shaded
     corner can be extruded as one, and merging destroyed the only information that says whether
     two vertices in the same place belong to the same SURFACE or to two solids that merely touch.
     A stile meeting a rail is the second kind, and averaging across it produces a direction that
     belongs to neither. Keeping the ranges lets the weld stay inside a part, where it is right. */
  const ranges = [];
  let o = 0;
  for (const { g, c } of prepped) {
    const p = g.attributes.position, n = g.attributes.normal;
    pos.set(p.array, o * 3);
    nor.set(n.array, o * 3);
    for (let i = 0; i < p.count; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    ranges.push([o, p.count]);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.userData.partRanges = ranges;
  return out;
}

export function outlineGeom(src) {
  const g = src.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  g.setAttribute('aFlat', new THREE.BufferAttribute(new Float32Array(n.array), 3));
  const part = new Int32Array(p.count);
  const ranges = src.userData && src.userData.partRanges;
  if (ranges) {
    for (let r = 0; r < ranges.length; r++) {
      const [start, count] = ranges[r];
      for (let i = 0; i < count; i++) part[start + i] = r;
    }
  }
  const buckets = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${part[i]}|${Math.round(p.getX(i) * 16)},${Math.round(p.getY(i) * 16)},${Math.round(p.getZ(i) * 16)}`;
    let b = buckets.get(k);
    if (!b) { b = { x: 0, y: 0, z: 0, at: [] }; buckets.set(k, b); }
    b.x += n.getX(i); b.y += n.getY(i); b.z += n.getZ(i); b.at.push(i);
  }
  const v = new THREE.Vector3();
  buckets.forEach((b) => {
    v.set(b.x, b.y, b.z);
    if (v.lengthSq() < 1e-8) return;
    v.normalize();
    b.at.forEach((i) => n.setXYZ(i, v.x, v.y, v.z));
  });
  n.needsUpdate = true;
  return g;
}

export function hash01(a, b) {
  let n = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35);
  n = Math.imul(n ^ (n >>> 15), 0x2545f491);
  n = Math.imul(n ^ (n >>> 13), 0x27d4eb2d);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/* one shared scatter so trees, rocks and grass agree about where the ground is busy */
export function scatter(i, seed, near, far, spread) {
  const a = hash01(i, seed);
  const b = hash01(i, seed + 7919);
  const c = hash01(i, seed + 104729);
  return { d: near + Math.pow(a, 0.62) * (far - near), s: (b - 0.42) * spread, r: c };
}

export function splitTris(geo) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const attrs = ['position', 'normal', 'color'].filter((k) => src.attributes[k]);
  const out = new THREE.BufferGeometry();
  for (const k of attrs) {
    const a = src.attributes[k], n = a.itemSize;
    const dst = new Float32Array(a.count * 4 * n);
    let w = 0;
    const mid = (i, j, o) => { for (let c = 0; c < n; c++) o[c] = (a.array[i * n + c] + a.array[j * n + c]) / 2; };
    const put = (i) => { for (let c = 0; c < n; c++) dst[w++] = a.array[i * n + c]; };
    const putV = (v) => { for (let c = 0; c < n; c++) dst[w++] = v[c]; };
    const ab = new Float32Array(n), bc = new Float32Array(n), ca = new Float32Array(n);
    for (let t = 0; t < a.count; t += 3) {
      mid(t, t + 1, ab); mid(t + 1, t + 2, bc); mid(t + 2, t, ca);
      put(t); putV(ab); putV(ca);
      putV(ab); put(t + 1); putV(bc);
      putV(ca); putV(bc); put(t + 2);
      putV(ab); putV(bc); putV(ca);
    }
    out.setAttribute(k, new THREE.BufferAttribute(dst, n));
  }
  return out;
}

export function smoothNormals(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position.array;
  const n = g.attributes.position.count;
  const key = (i) => `${Math.round(pos[i * 3])}|${Math.round(pos[i * 3 + 1])}|${Math.round(pos[i * 3 + 2])}`;
  const acc = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromArray(pos, t * 3); b.fromArray(pos, (t + 1) * 3); c.fromArray(pos, (t + 2) * 3);
    fn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    for (let k = 0; k < 3; k++) {
      const kk = key(t + k);
      let v = acc.get(kk);
      if (!v) acc.set(kk, v = new THREE.Vector3());
      v.add(fn);
    }
  }
  acc.forEach((v) => v.normalize());
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = acc.get(key(i)) || new THREE.Vector3(0, 1, 0);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  g.computeBoundingSphere();
  return g;
}

export function jsHash(x, y, z) {
  let a = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return a - Math.floor(a);
}

export function jsNoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(jsHash(ix, iy, iz), jsHash(ix + 1, iy, iz), sx),
      L(jsHash(ix, iy + 1, iz), jsHash(ix + 1, iy + 1, iz), sx), sy),
    L(L(jsHash(ix, iy, iz + 1), jsHash(ix + 1, iy, iz + 1), sx),
      L(jsHash(ix, iy + 1, iz + 1), jsHash(ix + 1, iy + 1, iz + 1), sx), sy), sz);
}

export function jsFbm(x, y, z) {
  let a = 0.5, s = 0, f = 1;
  for (let i = 0; i < 4; i++) { s += a * jsNoise(x * f, y * f, z * f); f *= 2.07; a *= 0.5; }
  return s;
}

export function jsRidged(x, y, z) {
  let a = 0.5, s = 0, f = 1, w = 0;
  for (let i = 0; i < 5; i++) {
    let n = 1 - Math.abs(jsNoise(x * f, y * f, z * f) * 2 - 1);
    n *= n;
    s += a * n; w += a;
    f *= 2.11; a *= 0.52;
  }
  return s / w;
}

export function cragify(geo, amp, freq) {
  let g = geo;
  /* TWO SPLITS, NOT THREE. Three is 64x — it took the far ranges from 128 triangles each to
     8,192, which is 155k across nineteen of them for objects that occupy a few hundred pixels of
     skyline. Two is 16x and still gives every ridge more crest detail than it can show at this
     distance; the difference in the render is not visible and the difference in the frame is
     116,000 triangles. */
  for (let i = 0; i < 2; i++) g = splitTris(g);
  const pos = g.attributes.position.array;
  const n = g.attributes.position.count;

  const key = (i) => `${Math.round(pos[i * 3])}|${Math.round(pos[i * 3 + 1])}|${Math.round(pos[i * 3 + 2])}`;
  const acc = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromArray(pos, t * 3); b.fromArray(pos, (t + 1) * 3); c.fromArray(pos, (t + 2) * 3);
    fn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    for (let k = 0; k < 3; k++) {
      const kk = key(t + k);
      const v = acc.get(kk) || acc.set(kk, new THREE.Vector3()).get(kk);
      v.add(fn);
    }
  }
  acc.forEach((v) => v.normalize());

  const d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    d.copy(acc.get(key(i)) || new THREE.Vector3(0, 1, 0));
    /* the ridged field for the shape, plus one fine fbm octave for surface grain */
    const f = (jsRidged(x * freq, y * freq, z * freq) - 0.42) * 2.3
      + (jsFbm(x * freq * 5.3, y * freq * 5.3, z * freq * 5.3) - 0.5) * 0.55;
    /* ridges get the most, valley floors the least — a mountain is rough at the top and buried
       in scree at the bottom, and pushing the base around only makes it float */
    const h = Math.min(1, Math.max(0, (y - 200) / 2600));
    const k = amp * f * (0.35 + 0.65 * h);
    pos[i * 3] += d.x * k;
    pos[i * 3 + 1] += d.y * k + f * amp * 0.45 * h;
    pos[i * 3 + 2] += d.z * k;
  }
  g.attributes.position.needsUpdate = true;
  /* non-indexed, so this is per-face: flat shading without asking for it */
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function beamSeg(len, h, d, x, y, rz) {
  const g = new THREE.BoxGeometry(len, h, d);
  g.rotateZ(rz);
  g.translate(x, y, 0);
  return g;
}

export function toriiGeo(H) {
  const parts = [];
  const V = 0xbf3b28, V_D = 0xa63020, V_L = 0xcf4a33, STONE = 0x6f6a63;
  const span = H * 0.42, lean = H * 0.024;
  [-1, 1].forEach((sx) => {
    /* tapered and leaning in at the top. Parallel pillars read as goalposts. */
    const ph = H * 0.80;
    const g = new THREE.CylinderGeometry(H * 0.037, H * 0.047, ph, 12);
    g.translate(0, ph / 2, 0);
    g.rotateZ(-sx * Math.atan(lean / ph));
    g.translate(sx * span, 0, 0);
    parts.push({ geo: g, color: V });
    /* the footing where the pillar enters the water */
    const b = new THREE.CylinderGeometry(H * 0.072, H * 0.084, H * 0.06, 12);
    b.translate(sx * span, H * 0.028, 0);
    parts.push({ geo: b, color: STONE });
  });
  /* nuki — the tie beam driven through the pillars, protruding either side */
  parts.push({ geo: beamSeg(span * 2 + H * 0.20, H * 0.055, H * 0.078, 0, H * 0.60, 0), color: V_D });
  /* gakuzuka — the central strut between the tie and the lintel */
  parts.push({ geo: beamSeg(H * 0.05, H * 0.19, H * 0.05, 0, H * 0.705, 0), color: V_D });
  /* shimaki — the straight beam carrying the curved one */
  parts.push({ geo: beamSeg(span * 2 + H * 0.30, H * 0.048, H * 0.095, 0, H * 0.818, 0), color: V });
  /* kasagi — the sweep, as five straight segments along a shallow parabola. A swept surface
     would cost far more and at this size the facets read as the traditional stepped ends. */
  const N = 5, half = span + H * 0.21, rise = H * 0.055;
  for (let i = 0; i < N; i++) {
    const t0 = -1 + (i / N) * 2, t1 = -1 + ((i + 1) / N) * 2;
    const x0 = t0 * half, y0 = t0 * t0 * rise;
    const x1 = t1 * half, y1 = t1 * t1 * rise;
    parts.push({
      geo: beamSeg(Math.hypot(x1 - x0, y1 - y0) * 1.08, H * 0.058, H * 0.115,
        (x0 + x1) / 2, H * 0.878 + (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0)),
      color: V_L,
    });
  }
  return mergeParts(parts);
}

export function signCanvas() {
  const c = document.createElement('canvas'); c.width = 520; c.height = 316;
  return c;
}

export function cedarGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(5, 13, 160, 6);
  trunk.translate(0, 80, 0);
  parts.push({ geo: trunk, color: 0x46362b });
  [[140, 58, 175, 0x2c4634], [258, 44, 148, 0x243c2c], [360, 27, 118, 0x35543b]]
    .forEach(([y, r, h, c]) => {
      const g = new THREE.ConeGeometry(r, h, 7);
      g.translate(0, y + h / 2, 0);
      parts.push({ geo: g, color: c });
    });
  return mergeParts(parts);
}

export function broadleafGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(9, 19, 130, 6);
  trunk.translate(0, 65, 0);
  parts.push({ geo: trunk, color: 0x4a3a2b });
  [[0, 205, 0, 78, 0x516d33], [-58, 168, 24, 60, 0x466030], [50, 178, -20, 54, 0x5c7a3b],
    [8, 252, -12, 44, 0x4b6a2f]]
    .forEach(([x, y, z, r, c]) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1.16, 0.9, 1.06);
      g.translate(x, y, z);
      parts.push({ geo: g, color: c });
    });
  return mergeParts(parts);
}

export function sakuraGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(8, 17, 150, 7);
  trunk.translate(0, 75, 0);
  parts.push({ geo: trunk, color: 0x3d2e29 });
  /* BUILD A BRANCH FROM ITS BASE, NOT FROM ITS MIDDLE. Placing a rotated cylinder by its centre
     means its inner end lands wherever the trigonometry puts it — for the first pass, seven
     units clear of the trunk, so the branches hung in the air beside it. Translating the
     cylinder so its base is at the origin BEFORE rotating means the base stays put whatever the
     angle, and can then be dropped straight onto the trunk axis where it is guaranteed to be
     buried inside the wood. */
  const tips = [];
  [[0.66, 118, 128], [-0.58, 132, 116], [0.30, 150, 92]].forEach(([rz, atY, len]) => {
    const g = new THREE.CylinderGeometry(4, 9, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateZ(rz);
    g.translate(0, atY, 0);
    parts.push({ geo: g, color: 0x3d2e29 });
    tips.push([-Math.sin(rz) * len, atY + Math.cos(rz) * len]);
  });
  /* and the blossom sits ON the tip each branch actually reached, rather than at a hand-typed
     coordinate that has to be re-guessed every time a branch angle changes */
  const blossom = [[tips[0][0], tips[0][1], 18, 58, 0xe5a2b5], [tips[1][0], tips[1][1], -20, 54, 0xf3c3cf],
    [tips[2][0], tips[2][1], 24, 48, 0xeeb3c3], [6, 268, -14, 46, 0xe9adbe]];
  blossom.forEach(([x, y, z, r, c]) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1.2, 0.82, 1.1);
    g.translate(x, y, z);
    parts.push({ geo: g, color: c });
  });
  return mergeParts(parts);
}
