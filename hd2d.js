// Xibolete HD-2D: a small ray tracer that draws the story's places (pixel-art textures, soft shadows,
// ambient occlusion, depth of field and bloom) and the big character portraits shown in dialogues.
// Used by index.html (window.XIB_HD) and by hd2d-worker.js, which draws the places off the main thread.
(function () {
const G = typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis;
const T = 16; // texels per world unit
// ---------- math ----------
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => vnoise(x, y, s) * .55 + vnoise(x * 2.1, y * 2.1, s + 7) * .3 + vnoise(x * 4.3, y * 4.3, s + 13) * .15;
const pick = (arr, r) => arr[Math.min(arr.length - 1, (r * arr.length) | 0)];
const jit = (c, r, k = .08) => mul(c, 1 - k + r * 2 * k);

// ---------- primitives: convex solids given by planes (inside where n·p - d <= 0) ----------
const B = (lo, hi, mat, o = {}) => ({ lo, hi, mat, planes: [
  { n: [1, 0, 0], d: hi[0] }, { n: [-1, 0, 0], d: -lo[0] }, { n: [0, 1, 0], d: hi[1] },
  { n: [0, -1, 0], d: -lo[1] }, { n: [0, 0, 1], d: hi[2] }, { n: [0, 0, -1], d: -lo[2] }], ...o });
function hitAabb(o, d, lo, hi, tmax) {
  let t0 = 0, t1 = tmax;
  for (let a = 0; a < 3; a++) {
    const inv = 1 / (d[a] || 1e-9); let ta = (lo[a] - o[a]) * inv, tb = (hi[a] - o[a]) * inv;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  return true;
}
function hitConvex(o, d, planes, tmax) {
  let t0 = 1e-4, t1 = tmax, hn = null;
  for (const P of planes) {
    const dn = P.n[0] * d[0] + P.n[1] * d[1] + P.n[2] * d[2], dist = P.n[0] * o[0] + P.n[1] * o[1] + P.n[2] * o[2] - P.d;
    if (Math.abs(dn) < 1e-9) { if (dist > 0) return null; continue; }
    const t = -dist / dn;
    if (dn < 0) { if (t > t0) { t0 = t; hn = P.n; } } else if (t < t1) t1 = t;
    if (t0 > t1) return null;
  }
  return hn ? { t: t0, n: hn } : null;
}
// upright cylinders: posts, barrels, wells
const CYL = (x, z, r, y0, y1, mat, o = {}) => ({ cyl: { x, z, r, y0, y1 }, lo: [x - r, y0, z - r], hi: [x + r, y1, z + r], mat, ...o });
function hitCyl(o, d, c, tmax) {
  const ox = o[0] - c.x, oz = o[2] - c.z, a = d[0] * d[0] + d[2] * d[2]; let best = null;
  if (a > 1e-9) {
    const b = ox * d[0] + oz * d[2], cc = ox * ox + oz * oz - c.r * c.r, disc = b * b - a * cc;
    if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / a; if (t > 1e-4 && t < tmax) { const y = o[1] + d[1] * t; if (y >= c.y0 && y <= c.y1) best = { t, n: [(ox + d[0] * t) / c.r, 0, (oz + d[2] * t) / c.r] }; } }
  }
  for (const [yc, ny] of [[c.y1, 1], [c.y0, -1]]) {
    if (Math.abs(d[1]) < 1e-9 || (ny > 0 ? d[1] > 0 : d[1] < 0)) continue;
    const t = (yc - o[1]) / d[1];
    if (t > 1e-4 && t < tmax && (!best || t < best.t)) { const x = ox + d[0] * t, z = oz + d[2] * t; if (x * x + z * z <= c.r * c.r) best = { t, n: [0, ny, 0] }; }
  }
  return best;
}
const hitPrim = (o, d, pr, t) => pr.cyl ? hitCyl(o, d, pr.cyl, t) : hitConvex(o, d, pr.planes, t);
// bounding-volume tree so hundreds of small pieces stay fast
function bvh(list) {
  if (list.length <= 3) return list;
  const box = part => { const l = [1e9, 1e9, 1e9], h = [-1e9, -1e9, -1e9]; for (const p of part) for (let a = 0; a < 3; a++) { l[a] = Math.min(l[a], p.lo[a]); h[a] = Math.max(h[a], p.hi[a]); } return [l, h]; };
  const [lo, hi] = box(list), ax = [0, 1, 2].sort((a, b) => (hi[b] - lo[b]) - (hi[a] - lo[a]))[0];
  const s = [...list].sort((a, b) => (a.lo[ax] + a.hi[ax]) - (b.lo[ax] + b.hi[ax])), m = s.length >> 1;
  return [s.slice(0, m), s.slice(m)].map(part => { const [l, h] = box(part); return { group: bvh(part), lo: l, hi: h }; });
}
function scan(list, o, d, st) {
  for (const pr of list) {
    if (pr === st.skip || !hitAabb(o, d, pr.lo, pr.hi, st.t)) continue;
    if (pr.group) { scan(pr.group, o, d, st); continue; }
    const h = hitPrim(o, d, pr, st.t); if (h && h.t < st.t) { st.t = h.t; st.best = { pr, n: h.n }; }
  }
}
function anyHit(list, o, d, tmax) {
  for (const pr of list) {
    if (pr.noShadow || !hitAabb(o, d, pr.lo, pr.hi, tmax)) continue;
    if (pr.group ? anyHit(pr.group, o, d, tmax) : hitPrim(o, d, pr, tmax)) return true;
  }
  return false;
}
function inside(pr, q) {
  if (pr.cyl) { const c = pr.cyl, dx = q[0] - c.x, dz = q[2] - c.z; return dx * dx + dz * dz <= c.r * c.r && q[1] >= c.y0 && q[1] <= c.y1; }
  return pr.planes.every(P => P.n[0] * q[0] + P.n[1] * q[1] + P.n[2] * q[2] - P.d <= 1e-6);
}
// self-check: every piece above the floor must touch something (no floating chimneys or lamps)
function checkFloating(S) {
  const bad = [], e = .03;
  for (const p of S.prims) {
    if (p.roof || p.ok || p.lo[1] < .01) continue;
    const c = [(p.lo[0] + p.hi[0]) / 2, (p.lo[1] + p.hi[1]) / 2, (p.lo[2] + p.hi[2]) / 2];
    const pts = [[c[0], p.lo[1] - e, c[2]], [p.lo[0] - e, c[1], c[2]], [p.hi[0] + e, c[1], c[2]], [c[0], c[1], p.lo[2] - e], [c[0], c[1], p.hi[2] + e], [c[0], p.hi[1] + e, c[2]]];
    if (!pts.some(q => S.prims.some(o => o !== p && inside(o, q)))) bad.push("peça em " + p.lo.map(v => +v.toFixed(2)).join(","));
  }
  for (const p of S.prims) if (p.planes && !inside(p, [(p.lo[0] + p.hi[0]) / 2, (p.lo[1] + p.hi[1]) / 2 + (p.roof ? .1 : 0), (p.lo[2] + p.hi[2]) / 2]) && !p.roof) bad.push("peça vazia em " + p.lo.map(v => +v.toFixed(2)).join(","));
  for (const p of S.prims) if (p.roof) { const c = [(p.lo[0] + p.hi[0]) / 2, (p.lo[2] + p.hi[2]) / 2]; let ok = false; for (let y = p.lo[1]; y <= p.hi[1] && !ok; y += .02) ok = inside(p, [c[0], y, c[1]]); if (!ok) bad.push("telhado vazio em " + p.lo.map(v => +v.toFixed(2)).join(",")); }
  for (const s of S.sprites) if (s.y > .01 && !S.prims.some(o => inside(o, [s.x, s.y - e, s.z]))) bad.push("sprite em " + [s.x, s.y, s.z].join(","));
  return bad;
}
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]; let PX = 0, PY = 0, CUR = null;
// soft shadows: each pixel aims at a slightly different point of the light (ordered dither)
const jitterPos = (p, r) => { const k = BAYER[PY & 3][PX & 3], a = k * 2.4, rr = r * Math.sqrt((k + .5) / 16); return [p[0] + Math.cos(a) * rr, p[1] + Math.sin(a * 1.7) * rr * .6, p[2] + Math.sin(a) * rr]; };
const jitterDir = (d, r) => { const k = BAYER[PY & 3][PX & 3], a = k * 2.4, rr = r * Math.sqrt((k + .5) / 16); return norm([d[0] + Math.cos(a) * rr, d[1], d[2] + Math.sin(a) * rr]); };
// weathering: soft stains everywhere, darker damp mossy band near the ground on walls
function grime(c, p, n) {
  let k = .84 + .22 * fbm(p[0] * .45 + p[2] * .3, p[1] * .7 + p[2] * .45 + p[0] * .1, 99);
  if (Math.abs(n[1]) < .5 && p[1] < .8) { const g = clamp(1 - p[1] / .8); k *= 1 - g * .25; c = mix(c, [80, 96, 58], g * .3 * fbm(p[0] * 2 + p[2] * 2, p[1] * 3, 98)); }
  if (n[1] > .9) k *= .9 + .12 * fbm(p[0] * .3, p[2] * .3, 97);
  return mul(c, k);
}
// plane through a line in a vertical cross-section; s runs along world x (ax="x") or z (ax="z")
function planeFrom(ax, s1, y1, s2, y2, inside) {
  let ns = y2 - y1, ny = -(s2 - s1); const l = Math.hypot(ns, ny); ns /= l; ny /= l;
  let n = ax === "x" ? [ns, ny, 0] : [0, ny, ns], d = ns * s1 + ny * y1;
  if (ns * inside[0] + ny * inside[1] - d > 0) { n = n.map(v => -v); d = -d; }
  return { n, d };
}
// house with a gable roof; ridge runs along x or z
function house(S, x0, x1, z0, z1, h, R, ridge, wallMat, roofMat) {
  S.prims.push(B([x0, 0, z0], [x1, h, z1], wallMat));
  const ax = ridge === "z" ? "x" : "z", [a0, a1] = ridge === "z" ? [x0, x1] : [z0, z1], [b0, b1] = ridge === "z" ? [z0, z1] : [x0, x1];
  const ac = (a0 + a1) / 2, k = R / (ac - a0), ov = .45, th = .2;
  const along = (u0, u1) => ridge === "z" ? [{ n: [0, 0, 1], d: u1 }, { n: [0, 0, -1], d: -u0 }] : [{ n: [1, 0, 0], d: u1 }, { n: [-1, 0, 0], d: -u0 }];
  const box3 = (s0, s1, y0, y1, u0, u1) => ridge === "z" ? [[s0, y0, u0], [s1, y1, u1]] : [[u0, y0, s0], [u1, y1, s1]];
  const cut = (n, d) => ({ n: ax === "x" ? [n, 0, 0] : [0, 0, n], d });
  // the triangular gable walls under the roof
  const [glo, ghi] = box3(a0, a1, h, h + R, b0, b1);
  S.prims.push({ lo: glo, hi: ghi, mat: wallMat, planes: [planeFrom(ax, a0, h, ac, h + R, [ac, h + .01]), planeFrom(ax, a1, h, ac, h + R, [ac, h + .01]), { n: [0, -1, 0], d: -h }, ...along(b0, b1)] });
  // two sloped roof slabs
  for (const side of [-1, 1]) {
    const ae = side < 0 ? a0 - ov : a1 + ov, aw = side < 0 ? a0 : a1, mid = (aw + ac) / 2, my = h + k * Math.abs(mid - aw) + th / 2;
    const outer = planeFrom(ax, aw, h + th, ac, h + R + th, [mid, my]), inner = planeFrom(ax, aw, h, ac, h + R, [mid, my]);
    const [lo, hi] = box3(Math.min(ae, ac), Math.max(ae, ac), h - k * ov - .01, h + R + th + .01, b0 - ov, b1 + ov);
    S.prims.push({ lo, hi, mat: roofMat, roof: { ax, ac }, planes: [outer, inner, cut(side, side * ae), cut(-side, -side * ac), ...along(b0 - ov, b1 + ov)] });
  }
}

// ---------- sprites (billboards) ----------
function procSprite(w, h, fn) { const px = new Array(w * h).fill(null); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = fn(x, y); return { w, h, px }; }
const FLAME = procSprite(6, 10, (x, y) => {
  const cx = (x - 2.5) / 3, t = y / 9, wdt = Math.sin(t * Math.PI) * (1 - t * .3) + (t > .8 ? .4 : 0), r = Math.abs(cx) / (wdt + .01);
  if (r > 1 || (y < 2 && hash(x, y, 3) > .5)) return null;
  return r < .45 && t > .4 ? [255, 246, 196] : r < .75 && t > .2 ? [255, 186, 76] : [238, 102, 34];
});
const CRYSTAL = procSprite(9, 17, (x, y) => {
  const cx = Math.abs(x - 4), lim = y < 8 ? y * .55 : (16 - y) * .5;
  if (cx > lim) return null;
  return cx > lim - 1 ? [70, 170, 230] : x < 4 ? [200, 250, 255] : [120, 220, 250];
});
function tree(seed, leaf) {
  return procSprite(44, 60, (x, y) => {
    const tx = Math.abs(x - 22);
    if (y > 36) return tx < 3 - (y > 55 ? -1 : 0) ? (x < 22 ? [104, 70, 46] : [78, 50, 34]) : null;
    let best = 0, shade = 0;
    for (let k = 0; k < 9; k++) {
      const bx = 8 + hash(k, 1, seed) * 28, by = 8 + hash(k, 2, seed) * 24, br = 7 + hash(k, 3, seed) * 6;
      const dx = (x - bx) / br, dy = (y - by) / br, d = dx * dx + dy * dy;
      if (d < 1 && 1 - d > best) { best = 1 - d; shade = -dx - dy; }
    }
    if (!best) return null;
    if (best < .12 && hash(x, y, seed) > .5) return null;
    const lv = shade + (hash(x, y, seed + 4) - .5) * .5;
    return lv > .7 ? mul(leaf, 1.35) : lv > .1 ? leaf : lv > -.6 ? mul(leaf, .74) : mul(leaf, .52);
  });
}
const POT = procSprite(10, 12, (x, y) => {
  if (y >= 6) { const w = y < 7 ? 5 : 4; return Math.abs(x - 4.5) <= w ? (y === 6 ? [196, 110, 70] : x < 5 ? [176, 94, 58] : [140, 72, 44]) : null; }
  const h = hash(x, y, 9); if (Math.hypot(x - 4.5, y - 3.5) > 4.6) return null;
  return h > .78 ? [236, 92, 120] : h > .62 ? [250, 214, 90] : h > .3 ? [86, 140, 64] : [60, 104, 48];
});

// ---------- materials (texel-snapped, so surfaces read as pixel art) ----------
function uvOf(p, n) { if (CUR && CUR.cyl && Math.abs(n[1]) < .5) return [Math.atan2(n[2], n[0]) * CUR.cyl.r, -p[1]]; const ax = Math.abs(n[0]), ay = Math.abs(n[1]); return ay > .7 ? [p[0], p[2]] : ax > .7 ? [p[2], -p[1]] : [p[0], -p[1]]; }
function bricks(seed, pal, bw = 8, bh = 4, mortar = [54, 40, 34]) {
  return (p, n) => {
    const [u, v] = uvOf(p, n), ui = Math.floor(u * T), vi = Math.floor(v * T), row = Math.floor(vi / bh), off = (((row % 2) + 2) % 2) * (bw / 2);
    const bx = Math.floor((ui + off) / bw), lx = ((ui + off) % bw + bw) % bw, ly = ((vi % bh) + bh) % bh;
    if (lx === 0 || ly === 0) return { c: jit(mortar, hash(ui, vi, seed), .1) };
    const r = hash(bx, row, seed); let c = jit(pick(pal, r), hash(ui, vi, seed + 1), .05);
    if (ly === 1) c = mul(c, 1.12); if (ly === bh - 1) c = mul(c, .86);
    if (hash(bx, row, seed + 9) > .93 && lx > 1 && lx < bw - 1) c = mul(c, .7); // worn/cracked brick
    return { c };
  };
}
function cobble(seed, pal) {
  return p => {
    const ui = Math.floor(p[0] * T), vi = Math.floor(p[2] * T), row = Math.floor(vi / 5), off = (((row % 2) + 2) % 2) * 3;
    const cx = Math.floor((ui + off) / 6), lx = ((ui + off) % 6 + 6) % 6, ly = ((vi % 5) + 5) % 5;
    if (lx === 0 || ly === 0) return { c: jit([78, 72, 66], hash(ui, vi, seed), .1) };
    let c = jit(pick(pal, hash(cx, row, seed)), hash(ui, vi, seed + 2), .04);
    const patch = fbm(p[0] * .25, p[2] * .25, seed); c = mix(c, [176, 150, 112], clamp((patch - .55) * 2.5) * .5);
    if (fbm(p[0] * .6, p[2] * .6, seed + 3) > .7 && hash(cx, row, seed + 7) > .5) c = mix(c, [96, 128, 70], .55); // grass between stones
    if ((lx === 1 || lx === 5) && (ly === 1 || ly === 4)) c = mul(c, .82); else if (ly === 1 || lx === 1) c = mul(c, 1.1); else if (ly === 4) c = mul(c, .9);
    return { c };
  };
}
const planks = (seed, base, w = 5, gap = [24, 16, 12], alongX = false) => (p, n) => {
  let [u, v] = uvOf(p, n); if (alongX) [u, v] = [v, u];
  const ui = Math.floor(u * T), vi = Math.floor(v * T), pk = Math.floor(ui / w), lx = ((ui % w) + w) % w;
  if (lx === 0) return { c: gap };
  const seg = Math.floor((vi + hash(pk, 0, seed) * 40) / 40);
  if ((((vi + Math.floor(hash(pk, 0, seed) * 40)) % 40) + 40) % 40 === 0) return { c: mul(base, .55) };
  let c = jit(base, hash(pk, seg, seed), .12); c = mul(c, .93 + .1 * vnoise(lx * .7, vi * .25, seed + pk));
  if (lx === 1) c = mul(c, 1.1); if (lx === w - 1) c = mul(c, .86);
  return { c };
};
const stoneBlocks = (seed, base) => bricks(seed, [base, mul(base, .92), mul(base, 1.06), mul(base, .86)], 16, 8, mul(base, .55));
const flat = (c, k = .06, seed = 1) => (p, n) => { const [u, v] = uvOf(p, n); return { c: jit(c, hash(Math.floor(u * T), Math.floor(v * T), seed), k) }; };
const emit = c => () => ({ c, e: c });
const roofTiles = (seed, base) => (p, n, pr) => {
  const s = pr.roof.ax === "x" ? p[0] : p[2], along = pr.roof.ax === "x" ? p[2] : p[0];
  const ui = Math.floor(along * T), vi = Math.floor(Math.abs(s - pr.roof.ac) * T * 1.25), row = Math.floor(vi / 4), off = (row % 2) * 3;
  let c = jit(base, hash(Math.floor((ui + off) / 6), row, seed), .1);
  const ly = vi % 4; if (ly === 3) c = mul(c, .6); else if (ly === 0) c = mul(c, 1.15);
  if ((ui + off) % 6 === 0) c = mul(c, .8);
  if (hash(Math.floor((ui + off) / 6), row, seed + 5) > .94) c = mix(c, [96, 120, 64], .55); // moss
  return { c };
};
// half-timbered plaster wall with windows, a door and a stone base
function plaster(seed, x0, x1, z0, z1, h, opts = {}) {
  const wood = [92, 60, 40], cream = opts.wall || [226, 210, 180];
  return (p, n) => {
    const facingZ = Math.abs(n[2]) > .7, u = facingZ ? p[0] - x0 : p[2] - z0, wdt = facingZ ? x1 - x0 : z1 - z0, y = p[1];
    const ui = Math.floor(u * T), vi = Math.floor(y * T), r = hash(ui, vi, seed);
    if (Math.abs(n[1]) > .7) return { c: jit(wood, r) };
    if (y < .4) return stoneBlocks(seed, [150, 142, 130])([u, y, 0], [0, 0, 1]);
    const front = facingZ && n[2] < 0, mid = wdt / 2;
    if (front && opts.door !== false && Math.abs(u - mid) < .45 && y < 1.55) {
      if (Math.abs(u - mid) > .38 || y > 1.48) return { c: jit([70, 44, 30], r) };
      const pk = Math.floor((u - mid + .45) * T / 3); let c = jit([120, 78, 46], hash(pk, 1, seed), .1);
      if (Math.floor((u - mid + .45) * T) % 3 === 0) c = mul(c, .7);
      if (Math.abs(u - mid - .22) < .05 && Math.abs(y - .8) < .05) c = [220, 180, 90];
      return { c };
    }
    // timber frame
    if ((y > h - .14 && y < h + .02) || (y > 1.68 && y < 1.8) || u < .1 || u > wdt - .1) return { c: jit(wood, r) };
    const bay = 1.4, bu = ((u % bay) + bay) % bay;
    if (bu < .1) return { c: jit(wood, r) };
    // windows on each floor
    for (const [wy0, wy1] of [[.75, 1.4], [2.05, 2.7]]) {
      if (wy1 > h - .2) continue;
      if (bu > .4 && bu < 1.05 && y > wy0 - .06 && y < wy1 + .06 && Math.floor(u / bay) * bay + 1.05 < wdt - .1) {
        if (front && opts.door !== false && Math.abs(Math.floor(u / bay) * bay + .725 - mid) < 1 && wy0 < 1) break;
        const lx = bu - .4, ly = y - wy0;
        if (y < wy0 || y > wy1 || lx < .06 || lx > .59) return { c: jit(wood, r) };
        if (Math.abs(lx - .325) < .035 || Math.abs(ly - .32) < .035) return { c: jit(wood, r) };
        let g = opts.lit ? [255, 206, 128] : mix([46, 58, 84], [110, 140, 170], clamp(1 - ly / .65));
        if (!opts.lit && lx > .1 && lx < .2 && ly > .4) g = [190, 214, 230];
        return opts.lit ? { c: g, e: mul(g, .9) } : { c: g, spec: true };
      }
    }
    // diagonal braces in the upper half
    const du = bu - .1, dv = y - 1.8;
    if (dv > 0 && Math.abs(du - dv * .9) < .07 && du < 1.3) return { c: jit(wood, r) };
    let c = jit(cream, r, .03); c = mul(c, .96 + .06 * vnoise(u * 6, y * 6, seed));
    return { c };
  };
}
function water(seed, deep, shallow) {
  return (p, n, pr, d) => {
    const ui = Math.floor(p[0] * 8), vi = Math.floor(p[2] * 8);
    const w = vnoise(p[0] * 1.3, p[2] * 3.2, seed) * .6 + vnoise(p[0] * 3.1, p[2] * 7, seed + 2) * .4;
    const c = mix(deep, shallow, clamp(w * 1.1 - .1));
    return { c, water: true, wave: (w - .5) * .16, spark: hash(ui, vi, seed + 3) };
  };
}
// ---------- the tracer ----------
function trace(S, o, d, depth = 0, skip = null) {
  const st = { t: S.far, best: null, skip }; scan(S.root, o, d, st);
  let bt = st.t, best = st.best, sp = null;
  for (const s of S.sprites) {
    const t = (s.z - o[2]) / d[2]; if (!(t > 1e-4 && t < bt)) continue;
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, u = (x - s.x) / s.w + .5, v = (s.y + s.h - y) / s.h;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const tx = s.img.px[((v * s.img.h) | 0) * s.img.w + ((u * s.img.w) | 0)]; if (!tx) continue;
    bt = t; sp = { s, tx }; best = null;
  }
  if (!best && !sp) return { c: S.sky(d), t: 1e9 };
  const p = [o[0] + d[0] * bt, o[1] + d[1] * bt, o[2] + d[2] * bt];
  let alb, em = null, n, m = null;
  if (sp) { alb = sp.tx; n = [0, 0, -1]; if (sp.s.emit) em = mul(alb, sp.s.emit); }
  else { n = best.n; CUR = best.pr; m = best.pr.mat(p, n, best.pr, d); CUR = null; alb = m.c; em = m.e || null; if (!m.e && !m.water && !best.pr.clean) alb = grime(alb, p, n); }
  const isSprite = !!sp, po = isSprite ? [p[0] - d[0] * .02, p[1] - d[1] * .02, p[2] - d[2] * .02] : [p[0] + n[0] * 1e-3, p[1] + n[1] * 1e-3, p[2] + n[2] * 1e-3];
  let L = [...S.amb];
  // soft contact shadows under every sprite that stands on the floor
  let ao = 1;
  if (n[1] > .9) for (const s of S.sprites) if (s.blob) {
    const dx = (p[0] - s.x) / (s.w * .55), dz = (p[2] - s.z) / .28, r2 = dx * dx + dz * dz;
    if (r2 < 1 && Math.abs(p[1] - s.y) < .05) ao *= .45 + .55 * r2;
  }
  // ambient occlusion: corners and contact points get darker, like a real model under soft light
  if (!isSprite && S.ao && !em) {
    const up = Math.abs(n[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
    const t1 = norm([n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]]), t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    let occ = 0; const j = BAYER[PY & 3][PX & 3] / 16 * 1.57;
    for (let k = 0; k < 5; k++) {
      const a = j + k * 1.2566, ca = Math.cos(a) * .8, sa = Math.sin(a) * .8;
      if (anyHit(S.root, po, norm([n[0] * .6 + t1[0] * ca + t2[0] * sa, n[1] * .6 + t1[1] * ca + t2[1] * sa, n[2] * .6 + t1[2] * ca + t2[2] * sa]), S.ao)) occ++;
    }
    const f = 1 - occ * .15; L = mul(L, f); ao *= .8 + .2 * f;
  }
  if (S.sun) {
    const nd = isSprite ? Math.max(.12, .35 - S.sun.dir[2] * .55) : dot(n, S.sun.dir);
    if (nd > 0 && !occluded(S, po, jitterDir(S.sun.dir, S.sun.soft ?? .045), 80, sp && sp.s)) L = [L[0] + S.sun.c[0] * nd, L[1] + S.sun.c[1] * nd, L[2] + S.sun.c[2] * nd];
  }
  for (const l of S.lights) {
    const lp = jitterPos(l.p, l.soft ?? .22), v = [lp[0] - p[0], lp[1] - p[1], lp[2] - p[2]], dist = Math.hypot(v[0], v[1], v[2]); if (dist >= l.r) continue;
    const ld = [v[0] / dist, v[1] / dist, v[2] / dist], nd = isSprite ? .45 - ld[2] * .5 : dot(n, ld); if (nd <= 0) continue;
    const att = (1 - dist / l.r) ** 2;
    if (occluded(S, po, ld, dist - .1, sp && sp.s)) continue;
    L = [L[0] + l.c[0] * att * nd, L[1] + l.c[1] * att * nd, L[2] + l.c[2] * att * nd];
  }
  let c = [alb[0] * L[0] * ao, alb[1] * L[1] * ao, alb[2] * L[2] * ao];
  if (m && m.water) {
    const rn = norm([m.wave, 1, m.wave * .6]), rd = [d[0] - 2 * dot(d, rn) * rn[0], d[1] - 2 * dot(d, rn) * rn[1], d[2] - 2 * dot(d, rn) * rn[2]];
    const fr = .25 + .65 * Math.pow(1 - Math.abs(d[1]), 4);
    const rc = depth < 1 ? trace(S, p, rd, depth + 1, best.pr).c : S.sky(rd);
    c = mix(c, rc, fr);
    if (S.sun) { const sd = dot(rd, S.sun.dir); if (sd > .96 && m.spark > .82) c = mix(c, [255, 246, 220], clamp((sd - .96) * 30) * 1.4); }
  }
  if (m && m.spec && S.sun) { const r = d[1] < 0 ? .25 : .1; c = mix(c, S.sky([d[0], -d[1], d[2]]), r); }
  if (em) c = [c[0] + em[0], c[1] + em[1], c[2] + em[2]];
  // atmospheric haze: far things fade into the air colour
  const f = 1 - Math.exp(-Math.max(0, bt - S.fog.start) * S.fog.k);
  c = mix(c, S.fog.c, clamp(f) * S.fog.max);
  return { c, t: bt };
}
function occluded(S, o, d, tmax, skipSprite) {
  if (anyHit(S.root, o, d, tmax)) return true;
  for (const s of S.sprites) {
    if (s.noShadow || s === skipSprite) continue;
    const t = (s.z - o[2]) / d[2]; if (!(t > 1e-3 && t < tmax)) continue;
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, u = (x - s.x) / s.w + .5, v = (s.y + s.h - y) / s.h;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    if (s.img.px[((v * s.img.h) | 0) * s.img.w + ((u * s.img.w) | 0)]) return true;
  }
  return false;
}
// ---------- props ----------
const GRASS = procSprite(12, 7, (x, y) => { const h = 2 + hash(x, 0, 21) * 5; if (y < 7 - h) return null; const t = hash(x, y, 22); return y < 7 - h + 1 ? [150, 186, 92] : t > .5 ? [96, 142, 64] : [68, 108, 50]; });
const FLOWERS = procSprite(12, 4, (x, y) => { const t = hash(x, y, 31); if (y === 0 && t < .4) return null; return t > .78 ? [236, 84, 116] : t > .6 ? [252, 216, 92] : t > .48 ? [250, 250, 240] : t > .22 ? [92, 146, 66] : [64, 110, 50]; });
const barrelMat = seed => (p, n) => {
  if (Math.abs(n[1]) > .5) { const ui = Math.floor(p[0] * T), vi = Math.floor(p[2] * T); return { c: jit((ui % 3) ? [128, 86, 52] : [96, 62, 38], hash(ui, vi, seed), .08) }; }
  const [u] = uvOf(p, n), ui = Math.floor(u * T), c0 = CUR.cyl, yy = (p[1] - c0.y0) / (c0.y1 - c0.y0);
  if (Math.abs(yy - .18) < .045 || Math.abs(yy - .82) < .045) return { c: jit([78, 74, 72], hash(ui, 0, seed), .1) };
  let c = jit([142, 96, 56], hash(Math.floor(ui / 3), 1, seed), .12); if (((ui % 3) + 3) % 3 === 0) c = mul(c, .68);
  return { c: mul(c, .82 + .3 * Math.sin(yy * Math.PI)) };
};
// lamp on a post: base, glass box (glowing when lit), roof and finial, all touching
function lantern(S, x, z, h, lit, iron) {
  S.prims.push(CYL(x, z, .06, 0, h - .04, iron), CYL(x, z, .13, 0, .22, iron), CYL(x, z, .09, .22, .3, iron));
  const glass = (p, n) => {
    const a = Math.abs(n[0]) > .5 ? p[2] - z : p[0] - x, yy = p[1] - h;
    if (Math.abs(n[1]) > .5 || Math.abs(a) > .1 || yy < .03 || yy > .31 || Math.abs(a) < .012) return { c: [46, 44, 48] };
    return lit ? { c: [255, 214, 150], e: [300, 230, 140] } : { c: [74, 88, 100] };
  };
  S.prims.push(B([x - .16, h - .04, z - .16], [x + .16, h, z + .16], iron, { noShadow: true }), B([x - .14, h, z - .14], [x + .14, h + .34, z + .14], glass, { noShadow: true, clean: true }),
    B([x - .19, h + .34, z - .19], [x + .19, h + .4, z + .19], iron, { noShadow: true }), B([x - .05, h + .4, z - .05], [x + .05, h + .5, z + .05], iron, { noShadow: true }));
  if (lit) S.lights.push({ p: [x, h + .17, z], c: [1.45, .95, .48], r: 5.5, soft: .1 });
}
// windows that stick out of the wall: sill, shutters, flower box with flowers
function frontDetails(S, x0, x1, zf, h, door, shutter) {
  const bay = 1.4, wdt = x1 - x0, mid = wdt / 2, sh = planks(81, shutter, 3), sill = flat([158, 148, 134]), box = planks(82, [112, 74, 46], 3);
  for (let k = 0; k * bay + 1.05 < wdt - .1; k++) {
    const wx0 = x0 + k * bay + .4, wx1 = x0 + k * bay + 1.05;
    for (const [wy0, wy1] of [[.75, 1.4], [2.05, 2.7]]) {
      if (wy1 > h - .2 || (door && Math.abs(k * bay + .725 - mid) < 1 && wy0 < 1)) continue;
      S.prims.push(B([wx0 - .06, wy0 - .07, zf - .1], [wx1 + .06, wy0, zf], sill),
        B([wx0 - .27, wy0 - .02, zf - .035], [wx0 - .01, wy1 + .02, zf], sh), B([wx1 + .01, wy0 - .02, zf - .035], [wx1 + .27, wy1 + .02, zf], sh),
        B([wx0, wy0 - .26, zf - .16], [wx1, wy0 - .07, zf], box));
      S.sprites.push({ x: (wx0 + wx1) / 2, y: wy0 - .07, z: zf - .09, w: wx1 - wx0 + .06, h: .2, img: FLOWERS, noShadow: true });
    }
  }
}

// ---------- rendering ----------
function camRay(S, x, y, W, H) {
  const c = S.cam, f = (c.fr || 1.17) * W, dx = (x + .5 - W / 2) / f, dy = -(y + .5 - H / 2) / f, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  return norm([dx, dy * cp - sp, dy * sp + cp]);
}
function renderRows(S, W, H, col, dep, y0, y1) {
  const o = S.cam.p;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    PX = x; PY = y; const r = trace(S, o, camRay(S, x, y, W, H)), i = y * W + x;
    col[i * 3] = r.c[0]; col[i * 3 + 1] = r.c[1]; col[i * 3 + 2] = r.c[2]; dep[i] = r.t;
  }
}
function renderSync(S, W, H) { S.root = bvh(S.prims); const col = new Float32Array(W * H * 3), dep = new Float32Array(W * H); renderRows(S, W, H, col, dep, 0, H); return { col, dep }; }
async function renderAsync(S, W, H, onProgress) {
  S.root = bvh(S.prims); const col = new Float32Array(W * H * 3), dep = new Float32Array(W * H);
  for (let y = 0; y < H; y += 6) { renderRows(S, W, H, col, dep, y, Math.min(H, y + 6)); if (onProgress) onProgress(y / H); await new Promise(r => setTimeout(r, 0)); }
  return { col, dep };
}
// tone mapping, depth of field (tilt-shift) and bloom; P = { dof, bloom, grade }
function tone(v, g) { v *= g; return v > 205 ? 205 + (v - 205) / (1 + (v - 205) / 70) : v; }
function finish(P, W, H, col, dep, scale = 2) {
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const sharp = mk(W, H), sx = sharp.getContext("2d"), img = sx.createImageData(W, H);
  const bloom = mk(W, H), bx = bloom.getContext("2d"), bimg = bx.createImageData(W, H);
  const mask = mk(W, H), mx = mask.getContext("2d"), mimg = mx.createImageData(W, H), D = P.dof;
  for (let i = 0; i < W * H; i++) {
    const r = tone(col[i * 3], P.grade[0]), g = tone(col[i * 3 + 1], P.grade[1]), b = tone(col[i * 3 + 2], P.grade[2]);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    const lum = .3 * col[i * 3] + .59 * col[i * 3 + 1] + .11 * col[i * 3 + 2], k = clamp((lum - P.bloom.t) / 120);
    bimg.data[i * 4] = r * k; bimg.data[i * 4 + 1] = g * k; bimg.data[i * 4 + 2] = b * k; bimg.data[i * 4 + 3] = 255;
    const t = dep[i], a = t < D.near ? (D.near - t) / D.nearRamp : t > D.far ? (t - D.far) / D.farRamp : 0;
    mimg.data[i * 4 + 3] = clamp(a) * 255;
  }
  sx.putImageData(img, 0, 0); bx.putImageData(bimg, 0, 0); mx.putImageData(mimg, 0, 0);
  const SW = W * scale, SH = H * scale, out = mk(SW, SH), ox = out.getContext("2d");
  ox.imageSmoothingEnabled = false; ox.drawImage(sharp, 0, 0, SW, SH);
  if ("filter" in ox) {
    const bl = mk(SW, SH), blx = bl.getContext("2d");
    blx.filter = `blur(${D.blur * scale / 2}px)`; blx.imageSmoothingEnabled = false; blx.drawImage(sharp, 0, 0, SW, SH);
    blx.filter = `blur(${1.5 * scale}px)`; blx.globalCompositeOperation = "destination-in"; blx.imageSmoothingEnabled = true; blx.drawImage(mask, 0, 0, SW, SH);
    ox.drawImage(bl, 0, 0);
    ox.globalCompositeOperation = "lighter"; ox.imageSmoothingEnabled = true;
    ox.globalAlpha = P.bloom.a; ox.filter = `blur(${5 * scale}px)`; ox.drawImage(bloom, 0, 0, SW, SH);
    ox.globalAlpha = P.bloom.a * .7; ox.filter = `blur(${14 * scale}px)`; ox.drawImage(bloom, 0, 0, SW, SH);
    ox.globalAlpha = 1; ox.filter = "none"; ox.globalCompositeOperation = "source-over";
  }
  return { fx: out, flat: sharp };
}

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// ---------- characters: built from body parts, then shaded in 4 tones and outlined in colour ----------
const CW = 24, CH = 40, CT = 25; // sprite size in texels; texels per world unit (40 texels = 1.6 units tall)
function makeChar(o) {
  const R = new Array(CW * CH).fill(null), put = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < CW && y < CH) R[y * CW + x] = k; };
  const ell = (cx, cy, rx, ry, k, clip = () => true) => { for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if (dx * dx + dy * dy <= 1 && clip(x, y)) put(x, y, k); } };
  const poly = (pts, k) => { for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { let ins = false; const px = x + .5, py = y + .5;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins; }
    if (ins) put(x, y, k); } };
  const line = (x0, y0, x1, y1, k) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, k); };
  const P = o.pal, has = k => !!P[k]; if (o.bun) P.bun = P.hair;
  // behind the body
  if (o.cape) poly([[6, 17], [18, 17], [21, 37], [3, 37]], "cape");
  if (o.hair === "long") poly([[6, 6], [18, 6], [19, 25], [5, 25]], "hair");
  if (o.hair === "hood") poly([[5, 6], [19, 6], [20, 20], [4, 20]], "hood");
  // legs and boots
  poly([[8, 28], [12, 28], [11.5, 36], [8.5, 36]], o.legs || "pants"); poly([[12.5, 28], [16, 28], [15.5, 36], [12.5, 36]], o.legs || "pants");
  poly([[7.5, 34], [11.8, 34], [12, 39], [6.5, 39]], "boots"); poly([[12.4, 34], [16.5, 34], [17.5, 39], [12, 39]], "boots");
  // torso
  poly([[6.5, 17], [17.5, 17], [16.5, 25], [17, 29], [7, 29], [7.5, 25]], "top");
  if (o.skirt) poly([[8, 24], [16, 24], [19, o.skirt], [5, o.skirt]], "skirt");
  if (has("apron")) { poly([[9, 23], [15, 23], [16, 33], [8, 33]], "apron"); poly([[10, 18.5], [14, 18.5], [14, 23], [10, 23]], "apron"); }
  if (has("armor")) { poly([[8, 17.5], [16, 17.5], [15.5, 24], [8.5, 24]], "armor"); ell(6.8, 18.5, 2.6, 2, "armor"); ell(17.2, 18.5, 2.6, 2, "armor"); }
  if (has("vest")) { poly([[7, 17.5], [10.5, 17.5], [11, 28], [7.2, 28]], "vest"); poly([[13.5, 17.5], [17, 17.5], [16.8, 28], [13, 28]], "vest"); }
  if (has("belt")) { for (let x = 7; x <= 16; x++) { put(x, 25, "belt"); if (o.sash) put(x, 24, "belt"); } put(12, 25, "buckle"); }
  if (has("strap")) line(8, 17, 16, 27, "strap");
  // arms: sleeve to the elbow, then forearm (skin or sleeve), then hand
  const fore = o.longSleeve ? "top" : "skin";
  poly([[4.5, 18], [7.5, 17.5], [7.6, 23], [4.8, 23]], "top"); poly([[4.8, 23], [7.6, 23], [7.2, 27.5], [4.6, 27.5]], fore);
  poly([[16.5, 17.5], [19.5, 18], [19.2, 23], [16.4, 23]], "top"); poly([[16.4, 23], [19.2, 23], [19.4, 27.5], [16.8, 27.5]], fore);
  ell(5.9, 28.6, 1.6, 1.5, "skin"); ell(18.1, 28.6, 1.6, 1.5, "skin");
  if (has("armor")) { ell(5.8, 18.6, 1.9, 1.5, "armor"); ell(18.2, 18.6, 1.9, 1.5, "armor"); }
  // neck and head
  poly([[10.5, 14], [13.5, 14], [13.5, 17.5], [10.5, 17.5]], "skin");
  ell(12, 9.8, 5.3, 5.9, "skin");
  ell(6.6, 10.6, 1, 1.4, "skin"); ell(17.4, 10.6, 1, 1.4, "skin"); // ears
  // hair on top
  const cap = (k, lowY) => ell(12, 7.4, 6.2, 5.2, k, (x, y) => y <= lowY || x <= 7 || x >= 16);
  if (o.hair === "hood") { ell(12, 7.6, 6.6, 6, "hood", (x, y) => y <= 6 || x <= 7 || x >= 16); poly([[10, 2.5], [14, 2.5], [12.5, .2]], "hood"); poly([[6, 12], [8, 12], [8, 17], [5, 18]], "hood"); poly([[16, 12], [18, 12], [19, 18], [16, 17]], "hood"); }
  else if (o.hair === "cap") { cap("hair", 7); ell(12, 6, 6.4, 3.6, "cap", (x, y) => y <= 6); for (let x = 5; x <= 19; x++) put(x, 7, "brim"); }
  else if (o.hair === "helmet") { ell(12, 7.2, 6.4, 5, "metal", (x, y) => y <= 7); for (let x = 5; x <= 18; x++) put(x, 7, "metal2"); put(12, 8, "metal2"); put(12, 9, "metal2"); }
  else if (o.hair === "curly") { for (let k = 0; k < 9; k++) ell(6.5 + k * 1.4, 4.5 + (k % 2) * .8, 2, 1.9, "hair"); cap("hair", 6); }
  else { cap("hair", o.hair === "short" ? 6 : 7); if (o.hair !== "short") { poly([[6, 7], [8, 7], [7.5, 15], [5.5, 14]], "hair"); poly([[16, 7], [18, 7], [18.5, 14], [16.5, 15]], "hair"); } }
  if (o.bun) ell(12, 2.6, 2.4, 2, "bun");
  if (o.fringe) for (let x = 8; x <= 16; x++) if ((x + o.fringe) % 3) put(x, 8, "hair");
  if (o.beard) { ell(12, 14.2, 3.6, 2, "hair", (x, y) => y >= 13); put(12, 13, "skin"); }
  if (o.mustache) for (let x = 10; x <= 14; x++) put(x, 13, "hair");
  if (o.flaps) { poly([[5.2, 7], [8, 7], [8, 13.5], [5.6, 13]], "cap"); poly([[16, 7], [18.8, 7], [18.4, 13], [16, 13.5]], "cap"); }  // a fur hat's ear flaps

  // shade every part as a rounded form lit from the upper left
  const span = {}; for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const k = R[y * CW + x]; if (!k) continue; const s = span[k + y] || (span[k + y] = [x, x]); s[0] = Math.min(s[0], x); s[1] = Math.max(s[1], x); }
  const px = new Array(CW * CH).fill(null);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const k = R[y * CW + x]; if (!k) continue;
    const base = P[k]; const [a, b] = span[k + y], t = b > a ? (x - a) / (b - a) : .5;
    const below = y + 1 < CH ? R[(y + 1) * CW + x] : null, above = y > 0 ? R[(y - 1) * CW + x] : null;
    let tone = t < .22 ? 1.16 : t > .74 ? .74 : 1;
    if (t > .9 && b - a > 2) tone = .6;
    if (above !== k && above && k !== "hair") tone *= .82;                       // the part above casts a little shadow
    if (below !== k && (k === "hair" || k === "hood")) tone *= .78;              // hair's lower edge
    if ((k === "hair") && (x + (y >> 1)) % 3 === 0) tone *= .86;                 // locks of hair
    if (k === "hood" && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => R[(y + dy) * CW + x + dx] === "skin")) tone = .5; // inside of the hood
    if (k === "hood" && y < 12 && Math.abs(x - 12) < 1) tone *= .8;               // seam
    if ((k === "skirt" || k === "cape" || k === "apron") && (x % 3 === 1) && y > 26) tone *= .86; // cloth folds
    if ((k === "armor" || k === "metal") && t < .3 && (x + y) % 2 === 0) tone = 1.4; // shine
    const warm = tone > 1 ? [1.04, 1, .94] : tone < 1 ? [.94, .97, 1.08] : [1, 1, 1];  // warm light, cool shadow
    px[y * CW + x] = [Math.min(255, base[0] * tone * warm[0]), Math.min(255, base[1] * tone * warm[1]), Math.min(255, base[2] * tone * warm[2])];
  }
  // face
  const at = (x, y, c) => { if (R[y * CW + x]) px[y * CW + x] = c; };
  const eye = P.eye || [52, 36, 30], dk = mul(P.hair || P.hood || [60, 40, 30], .55);
  for (const ex of [9, 14]) { at(ex, 10, mul(eye, .6)); at(ex + 1, 10, mul(eye, .6)); at(ex, 11, eye); at(ex + 1, 11, [250, 248, 240]); }
  if (o.hair !== "helmet" && o.hair !== "hood") { at(9, 8, dk); at(10, 8, dk); at(14, 8, dk); at(15, 8, dk); }
  at(12, 12, mul(P.skin, .84)); at(11, 14, mul(P.mouth || [200, 110, 100], 1)); at(12, 14, mul(P.mouth || [200, 110, 100], .85));
  if (!o.beard) { at(8, 12, mix(P.skin, [240, 130, 130], .35)); at(16, 12, mix(P.skin, [240, 130, 130], .35)); }
  if (o.hair === "helmet") { at(9, 8, dk); at(10, 8, dk); at(14, 8, dk); at(15, 8, dk); }
  // coloured outline: each edge pixel takes a dark version of the part it borders
  const out = px.slice();
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (px[y * CW + x]) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < CW && Y < CH ? px[Y * CW + X] : null; }).filter(Boolean);
    if (nb.length) { const c = nb[0]; out[y * CW + x] = [c[0] * .32, c[1] * .28, c[2] * .32]; }
  }
  return { w: CW, h: CH, px: out };
}

// the people of the story, small and standing in the places (same colours as their big portraits)
const SK = { skin: [242, 200, 160], boots: [92, 60, 40], pants: [70, 62, 72], mouth: [206, 112, 104] };
const FOLK = {
  rosie: () => makeChar({ hair: "side", bun: true, fringe: 1, skirt: 36, pal: { ...SK, skin: hex("#f2c4a0"), hair: hex("#c4492c"), top: hex("#4d7a9c"), skirt: [64, 100, 130], apron: [242, 234, 216], belt: [120, 80, 50], buckle: [220, 190, 90], eye: [70, 120, 70] } }),
  tobias: () => makeChar({ hair: "cap", beard: true, pal: { ...SK, skin: hex("#c98f62"), hair: hex("#5a3a24"), cap: hex("#3f8a3a"), brim: [46, 104, 44], top: hex("#e9dcc0"), vest: hex("#7a4e2a"), pants: [90, 70, 52], belt: [70, 46, 30], buckle: [210, 180, 100], eye: [80, 56, 36] } }),
  mei: () => makeChar({ hair: "long", fringe: 0, skirt: 38, sash: true, longSleeve: true, pal: { ...SK, skin: hex("#f4d2b4"), hair: hex("#1f1b2e"), top: hex("#7a4fd1"), skirt: [100, 64, 170], belt: hex("#f2c230"), buckle: [246, 240, 230], eye: [86, 60, 120] } }),
  bram: () => makeChar({ hair: "helmet", longSleeve: true, pal: { ...SK, skin: hex("#d6a27e"), hair: hex("#3b2f2a"), metal: hex("#9aa3ad"), metal2: [120, 128, 140], armor: [168, 176, 188], top: [120, 40, 46], pants: [62, 56, 62], belt: [80, 54, 38], buckle: [220, 200, 120], eye: [80, 70, 60] } }),
  marcus: () => makeChar({ hair: "short", beard: true, skirt: 38, longSleeve: true, pal: { ...SK, skin: hex("#e0b08c"), hair: hex("#b9b9b9"), top: hex("#7a2f2a"), skirt: [110, 42, 38], belt: hex("#e0b440"), buckle: [236, 200, 90], eye: [70, 80, 100] } }),
  hero: () => makeChar({ hair: "hood", cape: true, longSleeve: true, pal: { ...SK, hood: [72, 96, 136], cape: [62, 84, 122], top: [146, 108, 70], pants: [66, 58, 56], belt: [96, 62, 40], buckle: [210, 190, 120], strap: [110, 74, 46], eye: [60, 80, 120] } }),
  iris: () => makeChar({ hair: "side", bun: true, skirt: 38, longSleeve: true, pal: { ...SK, skin: hex("#e9c3a3"), hair: hex("#3a2a20"), top: hex("#2f5a6b"), skirt: [36, 70, 84], belt: hex("#d8c070"), buckle: [240, 220, 140], eye: [70, 90, 60] } }),
  pip: () => makeChar({ hair: "short", fringe: 1, pal: { ...SK, skin: hex("#e3b48c"), hair: hex("#d9a441"), top: hex("#e7dcc4"), vest: hex("#6a8f3a"), pants: [104, 78, 56], belt: [80, 54, 38], buckle: [200, 180, 110], eye: [70, 100, 140] } }),
  ola: () => makeChar({ hair: "cap", longSleeve: true, pal: { ...SK, skin: hex("#b97c55"), hair: hex("#d6d0c8"), cap: hex("#1f3557"), brim: [20, 34, 56], top: [240, 236, 224], vest: hex("#24406b"), pants: [52, 52, 66], belt: [70, 46, 30], buckle: [220, 190, 90], eye: [60, 90, 110] } }),
  lena: () => makeChar({ hair: "long", fringe: 1, skirt: 36, pal: { ...SK, skin: hex("#f2c4a0"), hair: hex("#e09a3a"), top: hex("#8a4e7a"), skirt: [110, 60, 96], apron: [242, 234, 216], belt: [120, 80, 50], buckle: [220, 190, 90], eye: [90, 120, 70] } }),
  ana: () => makeChar({ hair: "hood", cape: true, skirt: 38, longSleeve: true, pal: { ...SK, skin: hex("#a8724e"), hood: hex("#e8e2d4"), cape: [214, 206, 190], top: [236, 230, 218], skirt: [226, 220, 206], belt: hex("#d4a840"), buckle: [240, 220, 140], strap: [200, 160, 70], eye: [60, 44, 36] } }),
  folkA: () => makeChar({ hair: "short", fringe: 2, pal: { ...SK, skin: [214, 160, 120], hair: [70, 48, 34], top: [90, 130, 90], pants: [80, 70, 60], belt: [80, 54, 38], buckle: [200, 180, 110], eye: [60, 50, 40] } }),
  folkB: () => makeChar({ hair: "long", bun: true, skirt: 37, pal: { ...SK, skin: [236, 196, 160], hair: [150, 110, 60], top: [190, 120, 60], skirt: [130, 80, 50], apron: [236, 226, 206], belt: [100, 70, 44], buckle: [200, 180, 110], eye: [60, 90, 60] } }),
};
const sprites = {};
// puts someone standing on the floor at (x, z); remembers where, so the portrait can come out of them
function person(S, who, x, z, k = who === "pip" || who === "misha" ? .74 : 1) {  // k: size (Pip and Misha are kids)
  const img = sprites[who] || (sprites[who] = FOLK[who]());
  S.sprites.push({ x, y: 0, z, w: CW / CT * k, h: CH / CT * k, img, blob: true });
  (S.people ||= {})[who] = [x, z, k];
}

// ---------- materials for interiors ----------
// inn walls: wooden wainscot below a rail, cream plaster between timber posts above
const woodWall = seed => {
  const low = planks(seed + 1, [112, 74, 48], 5, [34, 22, 16], true), cream = [214, 194, 158], wood = [100, 64, 42];
  return (p, n) => {
    if (Math.abs(n[1]) > .5) return { c: jit([120, 80, 50], hash(Math.floor(p[0] * T), Math.floor(p[2] * T), seed)) };
    const u = Math.abs(n[2]) > .5 ? p[0] : p[2], r = hash(Math.floor(u * T), Math.floor(p[1] * T), seed);
    if (p[1] < .9) return low(p, n);
    if (p[1] < 1.02) return { c: jit([84, 54, 36], r, .06) };
    if (((u % 2.4) + 2.4) % 2.4 < .2 || p[1] > 3.4) return { c: jit(wood, r, .1) };
    return { c: mul(jit(cream, r, .03), .95 + .07 * vnoise(u * 5, p[1] * 5, seed)) };
  };
};
const cloth = (base, seed, stripe) => (p, n) => {
  const [u, v] = uvOf(p, n), ui = Math.floor(u * T), vi = Math.floor(v * T);
  let c = jit(base, hash(ui, vi, seed), .04); if (((ui % 4) + 4) % 4 === 0) c = mul(c, .82);
  if (stripe && (((vi % 10) + 10) % 10) < 2) c = stripe;
  return { c };
};
const quilt = seed => (p, n) => {
  const [u, v] = uvOf(p, n), ui = Math.floor(u * T), vi = Math.floor(v * T), cx = Math.floor(ui / 6), cy = Math.floor(vi / 6);
  if (((ui % 6) + 6) % 6 === 0 || ((vi % 6) + 6) % 6 === 0) return { c: [236, 222, 196] };
  return { c: jit(pick([[196, 80, 70], [80, 120, 170], [226, 180, 80], [110, 150, 90], [236, 220, 196]], hash(cx, cy, seed)), hash(ui, vi, seed + 1), .05) };
};
const rugMat = (base, edge, seed) => p => {
  const ui = Math.floor(p[0] * T), vi = Math.floor(p[2] * T), d = Math.abs(((ui % 8) + 8) % 8 - 4) + Math.abs(((vi % 8) + 8) % 8 - 4);
  return { c: jit(d < 2 ? edge : d === 4 ? mul(base, .8) : base, hash(ui, vi, seed), .05) };
};
const glassMat = c => (p, n) => { const [u, v] = uvOf(p, n), ui = Math.floor(u * T * 2); return { c: ((ui % 5) + 5) % 5 === 1 ? mix(c, [255, 255, 255], .55) : c, spec: true }; };
const bookRow = (S, x0, x1, y, z0, z1, seed) => {
  let x = x0;
  while (x < x1 - .1) {
    const w = .07 + hash(x * 100 | 0, 1, seed) * .07, h = .3 + hash(x * 100 | 0, 2, seed) * .22;
    const c = pick([[150, 50, 50], [60, 90, 140], [70, 120, 80], [180, 140, 70], [110, 70, 110], [200, 190, 160]], hash(x * 100 | 0, 3, seed));
    S.prims.push(B([x, y, z0], [x + w, y + h, z1], flat(c, .05, seed)));
    x += w + .01;
  }
};
// lamp hanging from a beam by a chain
function hangLamp(S, x, z, y, top, iron, lit = true) {
  S.prims.push(CYL(x, z, .02, y + .4, top, iron, { noShadow: true }));
  const glass = (p, n) => { const a = Math.abs(n[0]) > .5 ? p[2] - z : p[0] - x, yy = p[1] - y; if (Math.abs(n[1]) > .5 || Math.abs(a) > .1 || yy < .03 || yy > .31 || Math.abs(a) < .012) return { c: [46, 44, 48] }; return lit ? { c: [255, 214, 150], e: [300, 230, 140] } : { c: [74, 88, 100] }; };
  S.prims.push(B([x - .16, y - .04, z - .16], [x + .16, y, z + .16], iron, { noShadow: true }), B([x - .14, y, z - .14], [x + .14, y + .34, z + .14], glass, { noShadow: true, clean: true }), B([x - .19, y + .34, z - .19], [x + .19, y + .4, z + .19], iron, { noShadow: true }));
  if (lit) S.lights.push({ p: [x, y + .17, z], c: [1.4, .92, .46], r: 6, soft: .1 });
}
function candle(S, x, y, z, light = true) {
  S.prims.push(CYL(x, z, .05, y, y + .18, flat([236, 228, 206]), { clean: true }));
  S.sprites.push({ x, y: y + .18, z, w: .14, h: .22, img: FLAME, emit: 1.2, noShadow: true });
  if (light) S.lights.push({ p: [x, y + .34, z - .05], c: [.9, .58, .26], r: 3.2, soft: .05 });
}
function stool(S, x, z, wood) { S.prims.push(CYL(x, z, .22, .42, .5, wood), CYL(x, z, .05, 0, .42, wood)); }
function roundTable(S, x, z, r, wood) { S.prims.push(CYL(x, z, r, .74, .8, wood), CYL(x, z, .07, 0, .74, wood), CYL(x, z, .3, 0, .05, wood)); }
const base = o => ({ prims: [], sprites: [], lights: [], far: 260, ...o });

// ---------- the story's places ----------
const STORY = {};
// a bedroom upstairs at The Sleepy Fox, morning sun through the window
STORY.room = () => {
  const S = base({ cam: { p: [0, 3.4, -6.8], pitch: .19, fr: 1 }, ao: .8, amb: [.5, .44, .38],
    sun: { dir: norm([-.4, .5, 1]), c: [1.7, 1.35, .9], soft: .02 },
    fog: { c: [40, 30, 24], start: 30, k: .01, max: 0 }, grade: [1.04, 1, .95], bloom: { t: 190, a: .55 },
    dof: { near: 9, nearRamp: 3, far: 16, farRamp: 10, blur: 4 },
    sky: d => mix([255, 236, 200], [120, 176, 230], Math.pow(clamp(d[1] * 2), .6)) });
  const wall = woodWall(101), floor = planks(102, [156, 108, 68], 6), wood = planks(103, [126, 84, 52], 4), iron = flat([52, 50, 56]);
  S.prims.push(B([-7.5, -1, -4], [7.5, 0, 6.3], floor));
  S.prims.push(B([-7.5, 0, 6], [1.2, 3.8, 6.3], wall), B([3.4, 0, 6], [7.5, 3.8, 6.3], wall), B([1.2, 0, 6], [3.4, 1.1, 6.3], wall), B([1.2, 2.7, 6], [3.4, 3.8, 6.3], wall));
  S.prims.push(B([-7.5, 0, -4], [-6.9, 3.8, 6], wall), B([6.9, 0, -4], [7.5, 3.8, 6], wall), B([-6.9, 3.55, 5.8], [6.9, 3.8, 6], wood));
  // window: sill, cross bars, curtains on a rod
  S.prims.push(B([1.05, 1, 5.82], [3.55, 1.1, 6.3], wood), B([2.27, 1.1, 6.08], [2.33, 2.7, 6.2], wood), B([1.2, 1.87, 6.08], [3.4, 1.93, 6.2], wood));
  S.prims.push(B([.55, 2.92, 5.86], [4.05, 3.0, 6], iron), B([.6, 1.0, 5.88], [1.15, 2.92, 6], cloth([176, 60, 62], 1)), B([3.45, 1.0, 5.88], [4.0, 2.92, 6], cloth([176, 60, 62], 2)));
  // outside: a neighbour's roof and a tree in the sun
  house(S, -1, 6, 15, 19, 2.6, 2, "x", plaster(105, -1, 6, 15, 19, 2.6), roofTiles(106, [176, 80, 56]));
  S.prims.push(B([-20, -1, 6.3], [20, 0, 40], cobble(107, [[150, 142, 130], [140, 132, 120]])));
  S.sprites.push({ x: 4.2, y: 0, z: 12, w: 4, h: 5.4, img: tree(108, [90, 146, 70]) });
  // bed with patchwork quilt, nightstand with a candle
  S.prims.push(B([-6.2, 0, 5.6], [-3.6, 1.35, 6], wood), B([-6.2, 0, 2.7], [-3.6, .5, 5.6], wood), B([-6.2, 0, 2.55], [-3.6, .8, 2.7], wood));
  S.prims.push(B([-6.12, .5, 2.75], [-3.68, .74, 5.55], quilt(109)), B([-5.8, .74, 4.85], [-4.0, .92, 5.5], flat([240, 236, 226], .03)));
  S.prims.push(B([-3.3, 0, 5.3], [-2.5, .72, 5.98], wood)); candle(S, -2.9, .72, 5.62);
  // bookshelf against the wall
  S.prims.push(B([4.3, 0, 5.92], [6.2, 2.8, 6], wood), B([4.3, 0, 5.5], [4.4, 2.8, 5.92], wood), B([6.1, 0, 5.5], [6.2, 2.8, 5.92], wood));
  for (const y of [0, .9, 1.8, 2.7]) S.prims.push(B([4.4, y, 5.5], [6.1, y + .07, 5.92], wood));
  for (const y of [.07, .97, 1.87]) bookRow(S, 4.42, 6.08, y, 5.56, 5.9, 110 + y * 10);
  // chest at the foot of the bed, a rug, a little table with a mug, a framed picture, a plant
  S.prims.push(B([-5.6, 0, 1.6], [-4.2, .55, 2.3], planks(111, [140, 92, 56], 4)), B([-5.62, .2, 1.58], [-4.18, .27, 2.32], iron));
  S.prims.push(B([-1.8, 0, 1.2], [2, .02, 4], rugMat([150, 54, 52], [226, 184, 92], 112), { noShadow: true }));
  S.lights.push({ p: [-.5, 3.2, 2.5], c: [.5, .42, .32], r: 11, soft: .5 });
  S.prims.push(B([-1.6, 1.6, 5.95], [-.1, 2.5, 6], (p, n) => { const fx = p[0] + 1.6, fy = p[1] - 1.6; if (fx < .08 || fx > 1.42 || fy < .08 || fy > .82) return { c: [196, 152, 70] }; return { c: fy > .45 ? [130, 180, 220] : fy > .3 - Math.sin(fx * 4) * .08 ? [96, 150, 80] : [70, 120, 64] }; }));
  S.sprites.push({ x: 3.6, y: 0, z: 5.6, w: .7, h: .84, img: POT, blob: true });
  person(S, "rosie", -1.5, 3.6); person(S, "hero", 1.5, 2.4);
  return S;
};
// the inn's ground floor: counter, shelves of bottles, fireplace, evening
STORY.counter = () => {
  const S = base({ cam: { p: [0, 3.7, -7.4], pitch: .2, fr: 1 }, ao: .8, amb: [.3, .24, .22],
    fog: { c: [30, 20, 16], start: 30, k: .01, max: 0 }, grade: [1.05, 1, .93], bloom: { t: 160, a: .7 },
    dof: { near: 9.5, nearRamp: 3, far: 17, farRamp: 10, blur: 4 }, sky: () => [20, 20, 40] });
  const wall = woodWall(201), floor = planks(202, [128, 86, 54], 6), wood = planks(203, [120, 78, 48], 4), top = planks(204, [158, 108, 66], 6, [60, 40, 28], true), iron = flat([52, 50, 56]);
  const stone = stoneBlocks(205, [140, 132, 122]);
  S.prims.push(B([-8, -1, -4], [8, 0, 7.2], floor), B([-8, 0, 6.9], [8, 4, 7.2], wall), B([-8, 0, -4], [-7.4, 4, 6.9], wall), B([7.4, 0, -4], [8, 4, 6.9], wall));
  // shelves of bottles behind the counter
  for (const y of [1.45, 2.2, 2.95]) {
    S.prims.push(B([-1.2, y, 6.55], [4.6, y + .06, 6.9], wood));
    for (let x = -1.1; x < 4.5; x += .2 + hash(x * 50 | 0, y * 9 | 0, 206) * .08) {
      const h = .28 + hash(x * 50 | 0, 1, 207) * .16, c = pick([[60, 120, 70], [160, 100, 40], [130, 40, 56], [60, 84, 150], [190, 170, 120]], hash(x * 50 | 0, y * 7 | 0, 208));
      S.prims.push(CYL(x, 6.72, .065, y + .06, y + .06 + h, glassMat(c)), CYL(x, 6.72, .025, y + .06 + h, y + .14 + h, flat([150, 110, 70])));
    }
  }
  // counter with mugs, bread and a key
  S.prims.push(B([-2.4, 0, 3.7], [5.6, .98, 4.4], wood), B([-2.5, .98, 3.6], [5.7, 1.08, 4.5], top));
  for (const [x, z] of [[-1.2, 4], [.9, 3.9], [1.3, 4.1]]) S.prims.push(CYL(x, z, .1, 1.08, 1.3, wood), CYL(x, z, .1, 1.3, 1.34, flat([246, 236, 214], .02), { clean: true }));
  S.prims.push(B([2.4, 1.08, 3.85], [2.9, 1.24, 4.15], flat([196, 140, 76])), B([3.6, 1.08, 3.95], [3.8, 1.11, 4.02], flat([226, 190, 90])));
  // fireplace in the left of the back wall
  S.prims.push(B([-6.8, 0, 6.2], [-6, 1.5, 6.9], stone), B([-4.2, 0, 6.2], [-3.4, 1.5, 6.9], stone), B([-6.8, 1.5, 6.2], [-3.4, 4, 6.9], stone), B([-6, 0, 6.7], [-4.2, 1.5, 6.9], flat([30, 22, 20])));
  S.prims.push(B([-7, 1.5, 6.0], [-3.2, 1.64, 6.2], wood), B([-7, 0, 5.8], [-3.2, .1, 6.2], stone));
  S.prims.push(B([-5.6, 0, 6.35], [-4.6, .14, 6.55], flat([90, 56, 34])), B([-5.4, .14, 6.4], [-4.8, .26, 6.6], flat([110, 70, 40])));
  S.sprites.push({ x: -5.1, y: .14, z: 6.45, w: .9, h: 1, img: FLAME, emit: 1.2, noShadow: true });
  S.lights.push({ p: [-5.1, .6, 6.1], c: [2.1, 1.1, .45], r: 9, soft: .25 }, { p: [1, 3, 1.5], c: [.4, .3, .22], r: 10, soft: .5 });
  // a beam with two hanging lamps
  S.prims.push(B([-7.4, 3.4, 3.2], [7.4, 3.6, 3.4], wood)); hangLamp(S, -2.2, 3.3, 2.5, 3.4, iron); hangLamp(S, 3.2, 3.3, 2.5, 3.4, iron);
  // barrels, a table with stools and a candle, near the camera
  S.prims.push(CYL(6.4, 4.8, .36, 0, 1, barrelMat(209)), CYL(6.5, 5.7, .36, 0, 1, barrelMat(210)), CYL(5.8, 2.6, .34, 0, .95, barrelMat(211)));
  roundTable(S, -3.4, 1.6, .7, wood); stool(S, -4.4, 1.3, wood); stool(S, -2.5, .9, wood); candle(S, -3.3, .8, 1.6);
  S.prims.push(CYL(-3.6, 1.8, .1, .8, 1.0, wood));
  person(S, "rosie", 1.6, 4.95); person(S, "lena", -1.2, 5.0); person(S, "hero", -.6, 2.4);
  return S;
};
// the port market at noon: fruit stall, cloak stall, houses, the ziggurat far away
STORY.market = () => {
  const S = base({ cam: { p: [0, 5, -11], pitch: .15, fr: 1.05 }, ao: .8, amb: [.42, .43, .52],
    sun: { dir: norm([-.5, .85, -.25]), c: [1.25, 1.08, .82] },
    fog: { c: [200, 218, 236], start: 30, k: .012, max: .55 }, grade: [1.03, 1, .97], bloom: { t: 212, a: .45 },
    dof: { near: 10.5, nearRamp: 3, far: 26, farRamp: 30, blur: 4 },
    sky: d => { const y = clamp(d[1] * 2); let c = mix([214, 230, 242], [80, 140, 214], Math.pow(y, .5)); const cl = fbm(d[0] / (d[1] + .2) * 2, 1 / (d[1] + .2) * 3, 8); if (cl > .64) c = mix(c, [250, 250, 252], clamp((cl - .64) * 5)); return c; } });
  S.prims.push(B([-30, -1, -6], [30, 0, 160], cobble(301, [[156, 146, 132], [142, 134, 122], [166, 154, 138], [134, 124, 114]])));
  const roof = roofTiles(302, [176, 80, 56]), roofB = roofTiles(303, [86, 104, 140]), wood = planks(304, [120, 82, 52], 4), iron = flat([50, 50, 56]);
  house(S, -13, -5.4, 10, 15, 3.3, 2.2, "x", plaster(305, -13, -5.4, 10, 15, 3.3), roof); frontDetails(S, -13, -5.4, 10, 3.3, true, [70, 112, 90]);
  house(S, -4.6, 1.8, 11, 16, 4, 2.6, "z", plaster(306, -4.6, 1.8, 11, 16, 4, { wall: [236, 222, 196] }), roofB); frontDetails(S, -4.6, 1.8, 11, 4, true, [64, 92, 136]);
  house(S, 2.6, 9.6, 10, 15, 3.1, 2, "x", plaster(307, 2.6, 9.6, 10, 15, 3.1, { wall: [222, 200, 168] }), roof); frontDetails(S, 2.6, 9.6, 10, 3.1, true, [136, 64, 54]);
  house(S, 10.4, 16, 11, 16, 3.8, 2.4, "z", plaster(308, 10.4, 16, 11, 16, 3.8), roofB); frontDetails(S, 10.4, 16, 11, 3.8, true, [70, 112, 90]);
  const zig = stoneBlocks(309, [210, 186, 150]);
  for (let t = 0; t < 6; t++) { const w = 40 - t * 6.4; S.prims.push(B([-2 - w / 2, t * 2.6, 80 + t * 3], [-2 + w / 2, (t + 1) * 2.6, 115 - t * 3], zig)); }
  // stall builder: counter, four posts, sloped striped awning, goods on top
  const stall = (x0, x1, z0, colA, colB, goods) => {
    const z1 = z0 + .8, awn = p => { const s = Math.floor((p[0] - x0) * T / 5); return { c: s % 2 ? colB : colA }; };
    S.prims.push(B([x0, 0, z0 + .1], [x1, .95, z1], wood), B([x0, .95, z0], [x1, 1.05, z1 + .1], planks(310, [156, 112, 70], 4)));
    S.prims.push(B([x0 + .05, 0, z1 + 1.5], [x0 + .2, 2.2, z1 + 1.65], wood), B([x1 - .2, 0, z1 + 1.5], [x1 - .05, 2.2, z1 + 1.65], wood), B([x0 + .05, 0, z0 + .15], [x0 + .2, 1.9, z0 + .3], wood), B([x1 - .2, 0, z0 + .15], [x1 - .05, 1.9, z0 + .3], wood));
    S.prims.push({ ok: true, lo: [x0 - .2, 1.7, z0 - .4], hi: [x1 + .2, 2.35, z1 + 1.8], mat: awn, planes: [{ n: [1, 0, 0], d: x1 + .2 }, { n: [-1, 0, 0], d: -(x0 - .2) }, { n: [0, 0, 1], d: z1 + 1.8 }, { n: [0, 0, -1], d: -(z0 - .4) },
      planeFrom("z", z0 - .4, 1.8, z1 + 1.8, 2.3, [z0 + .5, 1.91]), planeFrom("z", z0 - .4, 1.72, z1 + 1.8, 2.22, [z0 + .5, 1.91])] });
    goods(x0, x1, z0);
  };
  stall(-4.4, -.6, 5.2, [64, 118, 176], [244, 236, 220], (x0, x1, z0) => {
    for (let i = 0; i < 20; i++) { const x = x0 + .15 + (i % 10) * .36, z = z0 + .15 + Math.floor(i / 10) * .32, c = [[206, 46, 44], [244, 200, 60], [120, 176, 64], [236, 140, 40]][Math.floor(i / 3) % 4];
      S.prims.push(B([x, 1.05, z], [x + .26, 1.27, z + .26], () => ({ c }))); }
    S.prims.push(B([x0 - .9, 0, z0], [x0 - .1, .5, z0 + .7], wood)); for (let i = 0; i < 4; i++) S.prims.push(B([x0 - .85 + i * .19, .5, z0 + .1], [x0 - .69 + i * .19, .66, z0 + .3], () => ({ c: [206, 46, 44] })));
  });
  stall(1.6, 5.4, 5.6, [150, 70, 160], [246, 226, 150], (x0, x1, z0) => {
    // folded cloaks on the counter and two hanging from the awning bar
    for (let i = 0; i < 4; i++) S.prims.push(B([x0 + .2 + i * .9, 1.05, z0 + .15], [x0 + .9 + i * .9, 1.2, z0 + .65], cloth(pick([[120, 70, 160], [60, 90, 140], [150, 50, 50], [70, 110, 80]], hash(i, 3, 311)), i)));
    S.prims.push(B([x0 + .2, 1.75, z0 + 1.1], [x1 - .2, 1.8, z0 + 1.15], iron, { ok: true }));
    S.prims.push(B([x0 + .6, .9, z0 + 1.08], [x0 + 1.3, 1.75, z0 + 1.12], cloth([120, 70, 160], 9, [246, 226, 150])), B([x0 + 2, .8, z0 + 1.08], [x0 + 2.7, 1.75, z0 + 1.12], cloth([60, 90, 140], 10, [236, 220, 196])));
  });
  S.prims.push(CYL(6.3, 6.2, .32, 0, .9, barrelMat(312)), CYL(6.9, 5.6, .3, 0, .85, barrelMat(313)), B([-5.8, 0, 6.6], [-5, .6, 7.3], wood));
  lantern(S, -6.6, 4.4, 2.3, false, iron); lantern(S, 7.8, 4.6, 2.3, false, iron);
  S.sprites.push({ x: -9.8, y: 0, z: 7.6, w: 4.4, h: 6, img: tree(314, [84, 140, 70]) }, { x: 12.4, y: 0, z: 8, w: 4, h: 5.4, img: tree(315, [96, 150, 74]) });
  for (const [x, z] of [[-1.2, 9.6], [9.4, 9.4], [-7.8, 9.4]]) S.sprites.push({ x, y: 0, z, w: .62, h: .75, img: POT, blob: true });
  for (const [x0, x1, zf] of [[-13, -5.4, 10], [-4.6, 1.8, 11], [2.6, 9.6, 10], [10.4, 16, 11]]) for (let x = x0 + .3; x < x1; x += .9 + hash(x * 10 | 0, 2, 316) * .8) S.sprites.push({ x, y: 0, z: zf - .12, w: .7, h: .4, img: GRASS, noShadow: true });
  // the sellers stand beside their stalls (behind the counter the awnings would hide them)
  person(S, "tobias", -4.9, 4.7); person(S, "mei", 5.9, 4.9); person(S, "hero", .5, 3.2); person(S, "folkA", -7.2, 4.6); person(S, "folkB", .4, 8.6);
  return S;
};
// the Guild's gate: a big stone hall with an arched door, banners and lamps, afternoon
STORY.guild = () => {
  const S = base({ cam: { p: [0, 4.2, -10], pitch: .12, fr: 1.05 }, ao: .85, amb: [.4, .38, .48],
    sun: { dir: norm([-.6, .62, -.5]), c: [1.35, 1.02, .68] },
    fog: { c: [214, 196, 186], start: 28, k: .012, max: .55 }, grade: [1.05, 1, .94], bloom: { t: 205, a: .5 },
    dof: { near: 9, nearRamp: 3, far: 22, farRamp: 26, blur: 4 },
    sky: d => { const y = clamp(d[1] * 2); let c = mix([250, 214, 170], [96, 136, 200], Math.pow(y, .55)); const cl = fbm(d[0] / (d[1] + .2) * 2, 1 / (d[1] + .2) * 3, 4); if (cl > .62) c = mix(c, [255, 236, 214], clamp((cl - .62) * 5)); return c; } });
  S.prims.push(B([-30, -1, -6], [30, 0, 160], cobble(401, [[160, 148, 132], [146, 136, 122], [170, 156, 138]])));
  const stone = stoneBlocks(402, [176, 166, 150]), dark = stoneBlocks(403, [140, 132, 120]), wood = planks(404, [104, 66, 40], 4), iron = flat([50, 48, 54]);
  const guildWall = (p, n) => {
    if (Math.abs(n[2]) > .7 && n[2] < 0) {
      // tall arched windows with warm light inside
      for (const wx of [-5.4, -3.2, 3.2, 5.4]) {
        const dx = Math.abs(p[0] - wx), y = p[1];
        if (dx < .5 && y > 2.6 && y < 4.3 + Math.sqrt(Math.max(0, .25 - dx * dx))) {
          if (dx > .42 || y < 2.68) return { c: [120, 112, 100] };
          if (dx < .03 || Math.abs(y - 3.6) < .03) return { c: [60, 50, 44] };
          return { c: [255, 210, 140], e: [200, 150, 80] };
        }
      }
    }
    return stone(p, n);
  };
  house(S, -7.5, 7.5, 8, 13, 5.5, 2.8, "x", guildWall, roofTiles(405, [86, 104, 140]));
  S.prims.push(B([-7.7, 0, 7.8], [7.7, .6, 8], dark), B([-7.7, 5.3, 7.85], [7.7, 5.5, 8], dark));
  // door, frame, steps, sign
  S.prims.push(B([-1.1, .3, 7.9], [1.1, 2.9, 8], (p, n) => { const ui = Math.floor((p[0] + 1.1) * T); let c = jit([110, 70, 40], hash(Math.floor(ui / 4), 1, 406), .1); if (ui % 4 === 0) c = mul(c, .65); if ((ui % 8 === 3) && (Math.floor(p[1] * T) % 10 === 2)) c = [60, 58, 60]; if (Math.abs(p[0]) < .02) c = [50, 34, 24]; return { c }; }));
  S.prims.push(B([-1.45, .3, 7.82], [-1.1, 3.2, 8], dark), B([1.1, .3, 7.82], [1.45, 3.2, 8], dark), B([-1.45, 2.9, 7.82], [1.45, 3.2, 8], dark));
  S.prims.push(B([-2.4, 0, 7.0], [2.4, .15, 8], dark), B([-2, .15, 7.35], [2, .3, 8], dark));
  S.prims.push(B([-1.1, 3.45, 7.86], [1.1, 4.05, 8], (p, n) => { const fx = p[0] + 1.1, fy = p[1] - 3.45; if (fx < .06 || fx > 2.14 || fy < .06 || fy > .54) return { c: [80, 52, 32] }; const zig = Math.abs(fx - 1.1) < .45 - (fy - .1) * .7 && fy > .1 && Math.floor(fy * 16) % 2 === 0; return { c: zig ? [236, 196, 96] : [140, 96, 60] }; }));
  // banners and lamps
  const banner = cx => (p, n) => { const fx = Math.abs(p[0] - cx), y = p[1]; if (fx > .5) return { c: [210, 170, 80] }; const em = Math.abs(y - 3.7) < .45 && fx < .3 - Math.abs(y - 3.7) * .4; return { c: em ? [236, 200, 100] : jit([60, 70, 140], hash(Math.floor(p[0] * T), Math.floor(y * T), 407), .06) }; };
  S.prims.push(B([-2.75, 2.4, 7.94], [-1.65, 4.9, 8], banner(-2.2)), B([1.65, 2.4, 7.94], [2.75, 4.9, 8], banner(2.2)));
  lantern(S, -3.2, 6.6, 2.2, true, iron); lantern(S, 3.2, 6.6, 2.2, true, iron);
  // neighbouring houses at the sides, trees, a cart of crates
  house(S, -16, -9, 7, 12, 3.2, 2.2, "z", plaster(408, -16, -9, 7, 12, 3.2), roofTiles(409, [176, 80, 56])); frontDetails(S, -16, -9, 7, 3.2, true, [70, 112, 90]);
  house(S, 9, 16, 7, 12, 3.4, 2.2, "z", plaster(410, 9, 16, 7, 12, 3.4, { wall: [222, 200, 168] }), roofTiles(411, [176, 80, 56])); frontDetails(S, 9, 16, 7, 3.4, true, [136, 64, 54]);
  S.sprites.push({ x: -8.4, y: 0, z: 5.5, w: 4, h: 5.6, img: tree(412, [84, 140, 70]) }, { x: 8.6, y: 0, z: 5.2, w: 3.6, h: 5, img: tree(413, [96, 150, 74]) });
  S.prims.push(B([4.6, 0, 3.6], [5.4, .7, 4.3], wood), B([5.5, 0, 3.4], [6.2, .6, 4.1], wood), B([4.8, .7, 3.7], [5.3, 1.15, 4.2], wood), CYL(-5, 4, .34, 0, .9, barrelMat(414)));
  for (let i = 0; i < 18; i++) { const x = (hash(i, 6, 415) - .5) * 22, z = 1 + hash(i, 7, 415) * 6; if (Math.abs(x) < 2.6) continue; S.sprites.push({ x, y: 0, z, w: .55, h: .3, img: GRASS, noShadow: true }); }
  for (let x = -7.3; x < 7.4; x += .7 + hash(x * 10 | 0, 2, 416) * .6) if (Math.abs(x) > 2.6) S.sprites.push({ x, y: 0, z: 7.7, w: .7, h: .42, img: GRASS, noShadow: true });
  S.sprites.push({ x: -2.9, y: 0, z: 7.3, w: .66, h: .8, img: POT, blob: true }, { x: 2.9, y: 0, z: 7.3, w: .66, h: .8, img: POT, blob: true });
  person(S, "bram", 2.0, 6.85); person(S, "hero", -.7, 4.2); person(S, "folkA", -6.2, 5.2);
  return S;
};
// inside the Guild hall: long table, notice board, banners, sun through tall windows, candles
STORY.hall = () => {
  const S = base({ cam: { p: [0, 3.9, -7.4], pitch: .2, fr: 1 }, ao: .85, amb: [.36, .32, .3],
    sun: { dir: norm([.35, .45, 1]), c: [1.5, 1.3, 1], soft: .02 },
    fog: { c: [30, 26, 30], start: 30, k: .01, max: 0 }, grade: [1.03, 1, .97], bloom: { t: 185, a: .6 },
    dof: { near: 9.5, nearRamp: 3, far: 17, farRamp: 10, blur: 4 },
    sky: d => mix([255, 240, 214], [140, 186, 230], Math.pow(clamp(d[1] * 2), .6)) });
  const floor = stoneBlocks(501, [150, 140, 126]), wall = stoneBlocks(502, [184, 164, 134]), wood = planks(503, [116, 76, 46], 4), top = planks(504, [150, 102, 62], 6, [60, 40, 28], true), iron = flat([52, 50, 56]);
  S.prims.push(B([-8, -1, -4], [8, 0, 8.3], floor));
  // back wall with two tall windows (open to the light)
  S.prims.push(B([-8, 0, 8], [-4.6, 5.4, 8.3], wall), B([-3.2, 0, 8], [3.2, 5.4, 8.3], wall), B([4.6, 0, 8], [8, 5.4, 8.3], wall),
    B([-4.6, 0, 8], [-3.2, 1.2, 8.3], wall), B([3.2, 0, 8], [4.6, 1.2, 8.3], wall), B([-4.6, 3.8, 8], [-3.2, 5.4, 8.3], wall), B([3.2, 3.8, 8], [4.6, 5.4, 8.3], wall));
  for (const x of [-3.93, 3.87]) S.prims.push(B([x, 1.2, 8.12], [x + .06, 3.8, 8.2], iron), B([x - .67, 2.47, 8.12], [x + .73, 2.53, 8.2], iron));
  S.prims.push(B([-8, 0, -4], [-7.4, 5.4, 8], wall), B([7.4, 0, -4], [8, 5.4, 8], wall), B([-7.4, 4.9, 4.2], [7.4, 5.15, 4.45], wood));
  // notice board with papers
  S.prims.push(B([-1.5, 1.3, 7.9], [1.5, 2.8, 8], (p, n) => { const fx = p[0] + 1.5, fy = p[1] - 1.3; if (fx < .08 || fx > 2.92 || fy < .08 || fy > 1.42) return { c: [96, 62, 38] };
    const cx = Math.floor(fx * 2.6), cy = Math.floor(fy * 2.4), lx = fx * 2.6 - cx, ly = fy * 2.4 - cy, paper = hash(cx, cy, 505) > .25 && lx > .12 && lx < .88 && ly > .1 && ly < .9;
    if (paper) { const line = Math.floor(ly * 10) % 2 === 0 && lx > .22 && lx < .78 && ly < .78; return { c: line ? [120, 110, 100] : [236, 228, 206] }; } return { c: jit([170, 128, 84], hash(Math.floor(fx * T), Math.floor(fy * T), 506), .08) }; }));
  // banners with the ziggurat crest
  const banner = cx => (p, n) => { const fx = Math.abs(p[0] - cx), y = p[1]; if (fx > .36) return { c: [210, 170, 80] }; const em = Math.abs(y - 3.7) < .45 && fx < .26 - Math.abs(y - 3.7) * .3; return { c: em ? [236, 200, 100] : jit([140, 34, 44], hash(Math.floor(p[0] * T), Math.floor(y * T), 507), .06) }; };
  S.prims.push(B([-2.9, 2.9, 7.94], [-2.1, 4.8, 8], banner(-2.5)), B([2.1, 2.9, 7.94], [2.9, 4.8, 8], banner(2.5)), B([-6.6, 2.9, 7.94], [-5.8, 4.8, 8], banner(-6.2)), B([5.8, 2.9, 7.94], [6.6, 4.8, 8], banner(6.2)));
  // long table, chairs, candles, scrolls and books
  S.prims.push(B([-3, .74, 3.6], [3, .84, 5], top));
  for (const [x, z] of [[-2.8, 3.8], [2.7, 3.8], [-2.8, 4.7], [2.7, 4.7]]) S.prims.push(B([x, 0, z], [x + .12, .74, z + .12], wood));
  for (const x of [-2.1, -.7, .7, 2.1]) S.prims.push(B([x - .3, .45, 5.25], [x + .3, .52, 5.75], wood, { ok: true }), B([x - .3, .52, 5.68], [x + .3, 1.3, 5.75], wood), B([x - .28, 0, 5.3], [x - .2, .45, 5.38], wood), B([x + .2, 0, 5.3], [x + .28, .45, 5.38], wood), B([x - .28, 0, 5.62], [x - .2, .45, 5.7], wood), B([x + .2, 0, 5.62], [x + .28, .45, 5.7], wood));
  candle(S, -1.5, .84, 4.3); candle(S, 1.4, .84, 4.4);
  S.prims.push(B([-.6, .84, 4], [.2, .9, 4.5], flat([236, 226, 196])), B([.5, .84, 3.9], [.9, .98, 4.2], flat([120, 50, 50])), B([.55, .98, 3.92], [.88, 1.06, 4.18], flat([60, 90, 140])));
  // a chandelier hanging from the beam
  S.prims.push(CYL(0, 4.32, .02, 3.5, 4.9, iron, { noShadow: true }), CYL(0, 4.32, .62, 3.42, 3.5, wood, { noShadow: true }));
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; candle(S, Math.cos(a) * .52, 3.5, 4.32 + Math.sin(a) * .52, k % 2 === 0); }
  // bookcases on the sides
  for (const x0 of [-7.4, 5.7]) {
    S.prims.push(B([x0, 0, 6.5], [x0 + 1.7, 3, 7.9], wood));
    for (const y of [.4, 1.2, 2.0]) bookRow(S, x0 + .05, x0 + 1.65, y, 6.4, 6.5, 508 + y * 10 + x0);
  }
  S.sprites.push({ x: -4.9, y: 0, z: 7.4, w: .7, h: .84, img: POT, blob: true }, { x: 4.9, y: 0, z: 7.4, w: .7, h: .84, img: POT, blob: true });
  person(S, "marcus", 0, 5.12); person(S, "bram", -4.2, 6.6); person(S, "iris", 3.7, 4.3); person(S, "hero", 1.5, 2.6);
  return S;
};

// ---------- the places from the samples page, now part of the story ----------
// a temple hall at night: stone ruins open to the sky, torches, a crystal on the altar
STORY.temple = () => {
  const S = { prims: [], sprites: [], lights: [], far: 200,
    cam: { p: [0, 5.6, -13.5], pitch: .2, fr: 1.25 },
    ao: .9, amb: [.13, .12, .19], sun: { dir: norm([-.35, 1, -.25]), c: [.24, .3, .5] },
    fog: { c: [18, 14, 26], start: 14, k: .05, max: .8 }, grade: [1.04, 1, .96],
    bloom: { t: 150, a: .75 }, dof: { near: 15.5, nearRamp: 4, far: 27, farRamp: 8, blur: 5 },
    sky: d => { const y = clamp(d[1] * 2.5); let c = mix([34, 36, 74], [8, 10, 28], y); if (hash(Math.floor(d[0] * 300), Math.floor(d[1] * 300), 4) > .996) c = [230, 230, 255]; return c; } };
  const floor = bricks(11, [[124, 82, 54], [140, 94, 60], [110, 70, 46], [132, 90, 62]], 8, 4, [62, 42, 32]);
  const wall = bricks(12, [[150, 112, 82], [138, 100, 72], [160, 122, 90], [126, 92, 68]], 8, 4, [70, 52, 40]);
  const stone = stoneBlocks(13, [146, 136, 120]), pillar = stoneBlocks(14, [168, 150, 126]), iron = flat([52, 50, 56]);
  S.prims.push(B([-16, -1, -4], [16, 0, 40], floor));
  S.prims.push(B([-7, 0, 11.5], [7, .4, 40], stone), B([-5, .4, 12.4], [5, .8, 40], stone), B([-1.1, .8, 13.6], [1.1, 1.5, 15], pillar));
  // back wall with two arched openings to the night sky
  S.prims.push(B([-16, 0, 18], [-8.5, 12, 19], wall), B([-5.5, 0, 18], [5.5, 12, 19], wall), B([8.5, 0, 18], [16, 12, 19], wall),
    B([-8.5, 4.6, 18], [-5.5, 12, 19], wall), B([5.5, 4.6, 18], [8.5, 12, 19], wall),
    B([-8.5, 3.9, 18], [-7.9, 4.6, 19], wall), B([-6.1, 3.9, 18], [-5.5, 4.6, 19], wall), B([5.5, 3.9, 18], [6.1, 4.6, 19], wall), B([7.9, 3.9, 18], [8.5, 4.6, 19], wall));
  S.prims.push(B([-16, 0, -4], [-12.5, 9, 19], wall), B([12.5, 0, -4], [16, 9, 19], wall));
  for (const [x, z] of [[-4.6, 4], [4.6, 4], [-4.6, 10], [4.6, 10]]) {
    S.prims.push(B([x - .55, 0, z - .55], [x + .55, .35, z + .55], stone), B([x - .42, .35, z - .42], [x + .42, 5.4, z + .42], pillar), B([x - .6, 5.4, z - .6], [x + .6, 5.8, z + .6], stone));
  }
  // broken pillar and rubble near the camera, plus a low wall (out of focus)
  S.prims.push(B([-12.5, 0, -1.5], [-6, 1.1, -.3], wall), B([6.5, 0, -.8], [10, .7, .1], pillar));
  for (const [x, z] of [[-2.7, 6.8], [2.7, 6.8], [-6.8, 13], [6.8, 13]]) {
    S.prims.push(CYL(x, z, .07, 0, 1.3, iron), CYL(x, z, .17, 0, .1, iron), CYL(x, z, .24, 1.3, 1.44, iron));
    S.sprites.push({ x, y: 1.44, z, w: .45, h: .75, img: FLAME, emit: 1.1, noShadow: true });
    S.lights.push({ p: [x, 1.95, z - .05], c: [1.7, .9, .38], r: 7 });
  }
  S.sprites.push({ x: 0, y: 1.5, z: 14.3, w: .62, h: 1.15, img: CRYSTAL, emit: .9, noShadow: true });
  // fallen stones along the walls and grass growing between the bricks
  for (let i = 0; i < 30; i++) { const side = i % 2 ? 1 : -1, x = side * (6.2 + hash(i, 1, 90) * 6), z = 1 + hash(i, 2, 90) * 16.5, sz = .12 + hash(i, 3, 90) * .24; S.prims.push(B([x, 0, z], [x + sz * 1.3, sz, z + sz], stone)); }
  for (let i = 0; i < 46; i++) { const x = (hash(i, 4, 91) - .5) * 25, z = hash(i, 5, 91) * 17.5; if (Math.abs(x) < 1.4) continue; S.sprites.push({ x, y: 0, z, w: .7, h: .42, img: GRASS, noShadow: true }); }
  // red carpet to the altar and banners on the back wall
  const carpet = (p) => { const e = Math.abs(p[0]); const ui = Math.floor(p[0] * T), vi = Math.floor(p[2] * T); if (e > .95) return { c: [200, 160, 70] }; if (e > .85) return { c: [110, 30, 34] }; const r = (Math.floor(p[2] * 2) + Math.floor(Math.abs(p[0]) * 3)) % 2; return { c: jit(r ? [150, 38, 44] : [136, 32, 40], hash(ui, vi, 71), .05) }; };
  S.prims.push(B([-1.05, 0, 1], [1.05, .03, 11.5], carpet, { noShadow: true }));
  const banner = (p) => { const u = Math.abs(p[0] - Math.round(p[0] / 3.4) * 3.4), y = p[1]; if (u > .55) return { c: [200, 160, 70] }; const zig = Math.abs(y - 6.4) < 1 && u < .45 - Math.abs(y - 6.4) * .35 - (Math.floor((y - 5.4) * 4) % 2 ? 0 : .08); return { c: zig ? [236, 196, 96] : jit([140, 30, 40], hash(Math.floor(p[0] * T), Math.floor(y * T), 72), .06) }; };
  for (const x of [-10.2, -3.4, 3.4, 10.2]) S.prims.push(B([x - .62, 4.8, 17.9], [x + .62, 8.6, 18], banner));
  for (const x of [-11.3, -2.2, 2.2, 11.3]) {
    S.prims.push(B([x - .12, 3.4, 17.6], [x + .12, 3.6, 18], iron));
    S.sprites.push({ x, y: 3.6, z: 17.7, w: .4, h: .66, img: FLAME, emit: 1.1, noShadow: true });
    S.lights.push({ p: [x, 4.1, 17.3], c: [1.5, .8, .34], r: 6 });
  }
  S.lights.push({ p: [0, 2.3, 13.7], c: [.35, 1.05, 1.6], r: 10 });
  person(S, "ana", 0, 10.4); person(S, "hero", -.9, 6); person(S, "bram", -2.4, 6.6);
  return S;
};
// the harbour at sunset (wooden pier, sea, a ship in the haze)
STORY.harbor = () => {
  const sunDir = norm([-.32, .11, 1]);
  const S = { prims: [], sprites: [], lights: [], far: 400,
    cam: { p: [0, 5, -11], pitch: .2, fr: 1.12 },
    ao: .7, amb: [.34, .3, .44], sun: { dir: sunDir, c: [1.45, .92, .55] },
    fog: { c: [232, 164, 140], start: 26, k: .012, max: .75 }, grade: [1.05, 1, .95],
    bloom: { t: 190, a: .55 }, dof: { near: 9.5, nearRamp: 3, far: 20, farRamp: 22, blur: 5 },
    sky: d => {
      const y = clamp(d[1] * 2.2), sd = dot(d, sunDir);
      let c = mix([252, 184, 132], [84, 96, 160], Math.pow(y, .55));
      const cl = fbm(d[0] / (d[1] + .15) * 1.6, 1 / (d[1] + .15) * 2.2, 5);
      if (d[1] > .02 && cl > .55) c = mix(c, mix([255, 196, 160], [150, 100, 130], clamp((d[1] - .02) * 4)), clamp((cl - .55) * 3) * .8);
      c = [c[0] + 255 * Math.pow(Math.max(sd, 0), 60) * .8, c[1] + 180 * Math.pow(Math.max(sd, 0), 60) * .8, c[2] + 110 * Math.pow(Math.max(sd, 0), 60) * .6];
      if (sd > .9994) c = [420, 380, 300];
      return c;
    } };
  const deck = planks(21, [138, 96, 62], 5), post = planks(22, [96, 66, 44], 4), crate = planks(23, [164, 118, 70], 4), hull = planks(24, [104, 64, 42], 4, [40, 26, 20], true), sail = flat([236, 226, 204], .03), rope = flat([176, 150, 104]);
  S.prims.push(B([-14, -.3, -10], [14, 0, 3.6], deck));
  for (let x = -12; x <= 12; x += 2.4) S.prims.push(CYL(x, 3.5, .17, -1.4, .85, post));
  S.prims.push(B([-12.5, .55, 3.45], [12.5, .62, 3.55], rope, { noShadow: true }));
  S.prims.push(B([-8.2, 0, .4], [-7, 1.1, 1.6], crate), B([-7, 0, .6], [-6.1, .8, 1.5], crate), B([-8, 1.1, .6], [-7.2, 1.8, 1.4], crate), B([6, 0, -.6], [7.2, .9, .5], crate));
  S.prims.push(B([-80, -3, 3.6], [80, -.62, 400], water(25, [18, 54, 76], [46, 108, 120])));
  // moored rowing boat
  S.prims.push(B([2.6, -.95, 5.2], [6.6, -.35, 6.5], hull), B([3, -.62, 5.4], [6.2, -.4, 6.3], flat([70, 44, 30])), B([4.2, -.5, 5.3], [4.6, -.35, 6.4], hull));
  // distant ship
  S.prims.push(B([-9, -.9, 52], [-1, .7, 54.4], hull), B([-8.6, .7, 52.3], [-6.4, 1.8, 54.1], hull), B([-2.4, .7, 52.5], [-1.2, 1.4, 54], hull));
  S.prims.push(B([-5.2, .7, 53.1], [-4.95, 9, 53.3], post), B([-3, .7, 53.1], [-2.8, 7.5, 53.3], post));
  S.prims.push(B([-6.6, 3, 53.15], [-3.6, 7.8, 53.25], sail), B([-4.2, 2.6, 53.15], [-1.6, 6.6, 53.25], sail), B([-7.4, 2.2, 53.15], [-5.15, 5.2, 53.25], sail));
  // far coast and the ziggurat of Babel in the haze
  const rock = stoneBlocks(26, [120, 110, 112]);
  S.prims.push(B([18, -1, 90], [70, 7, 110], rock), B([24, 7, 95], [50, 11, 110], rock));
  for (let t = 0; t < 7; t++) { const w = 34 - t * 4.6; S.prims.push(B([-62 - w / 2, -1 + t * 3.2, 140 + t * 2], [-62 + w / 2, -1 + (t + 1) * 3.2, 170 - t * 2], stone2)); }
  function stone2(p, n) { return stoneBlocks(27, [168, 150, 132])(p, n); }
  lantern(S, 1.2, 3.0, 1.75, true, flat([46, 42, 44]));
  S.prims.push(CYL(-4.6, .3, .32, 0, .9, barrelMat(1)), CYL(-3.95, .75, .3, 0, .85, barrelMat(2)), CYL(8.4, 1.4, .32, 0, .9, barrelMat(3)), CYL(9.9, 2.9, .17, 0, .42, flat([62, 58, 58])), CYL(-10.5, 2.9, .17, 0, .42, flat([62, 58, 58])));
  for (let i = 0; i < 6; i++) S.sprites.push({ x: -12 + i * 4.7, y: 0, z: 3.25, w: .8, h: .45, img: GRASS, noShadow: true });
  person(S, "ola", -1.4, 1.9); person(S, "hero", .4, 1.5); person(S, "folkA", -5.4, 1.6);
  return S;
};
// Shinar square on a spring morning
STORY.square = () => {
  const S = { prims: [], sprites: [], lights: [], far: 300,
    cam: { p: [0, 6.6, -15], pitch: .17, fr: 1.17 },
    ao: .9, amb: [.42, .43, .52], sun: { dir: norm([-.55, .85, -.2]), c: [1.25, 1.06, .8] },
    fog: { c: [200, 218, 236], start: 30, k: .012, max: .55 }, grade: [1.02, 1, .98],
    bloom: { t: 210, a: .5 }, dof: { near: 16.5, nearRamp: 2, far: 31, farRamp: 40, blur: 5 },
    sky: d => { const y = clamp(d[1] * 2); let c = mix([214, 230, 242], [80, 140, 214], Math.pow(y, .5)); const cl = fbm(d[0] / (d[1] + .2) * 2, 1 / (d[1] + .2) * 3, 8); if (cl > .64) c = mix(c, [250, 250, 252], clamp((cl - .64) * 5)); return c; } };
  S.prims.push(B([-30, -1, -6], [30, 0, 160], cobble(31, [[156, 146, 132], [142, 134, 122], [166, 154, 138], [134, 124, 114]])));
  const roof = roofTiles(32, [170, 76, 54]), roofB = roofTiles(33, [86, 104, 140]);
  house(S, -15, -7, 13, 18, 3.3, 2.2, "x", plaster(41, -15, -7, 13, 18, 3.3), roof);
  house(S, -6, .5, 15, 20, 4, 2.6, "z", plaster(42, -6, .5, 15, 20, 4, { wall: [236, 222, 196] }), roofB);
  house(S, 1.6, 8.6, 13.5, 18.5, 3.1, 2, "x", plaster(43, 1.6, 8.6, 13.5, 18.5, 3.1, { wall: [222, 200, 168] }), roof);
  house(S, 9.8, 15.5, 14, 19, 3.8, 2.4, "z", plaster(44, 9.8, 15.5, 14, 19, 3.8), roofB);
  house(S, -18, -12, 2, 9.5, 3.2, 2.2, "z", plaster(45, -18, -12, 2, 9.5, 3.2, { door: false }), roof);
  S.prims.push(B([-4.6, 3.8, 17], [-3.9, 7.1, 17.7], bricks(46, [[150, 100, 80], [130, 86, 70]])), B([-4.72, 7.1, 16.88], [-3.78, 7.25, 17.82], stoneBlocks(46, [120, 116, 110])));
  // the ziggurat beyond the rooftops
  const zig = stoneBlocks(47, [210, 186, 150]);
  for (let t = 0; t < 6; t++) { const w = 40 - t * 6.4; S.prims.push(B([5 - w / 2, t * 2.6, 85 + t * 3], [5 + w / 2, (t + 1) * 2.6, 120 - t * 3], zig)); }
  // well
  const stone = stoneBlocks(48, [150, 144, 136]), wood = planks(49, [120, 82, 52], 4);
  S.prims.push(CYL(0, 7, .95, 0, .75, stone), CYL(0, 7, .78, 0, .77, water(50, [30, 70, 90], [60, 110, 130])), CYL(.66, 6.5, .14, .75, .98, barrelMat(9)));
  S.prims.push(B([-.95, .75, 6.9], [-.8, 2.1, 7.1], wood), B([.8, .75, 6.9], [.95, 2.1, 7.1], wood), B([-1.2, 2.1, 6.6], [1.2, 2.3, 7.4], roofTilesBox, { ok: true }));
  function roofTilesBox(p, n) { return { c: jit([170, 76, 54], hash(Math.floor(p[0] * T), Math.floor(p[2] * T), 5)) }; }
  // market stall with a striped awning
  const awn = p => { const s = Math.floor((p[0] - 3.4) * T / 5); return { c: s % 2 ? [244, 236, 220] : [64, 118, 176] }; };
  S.prims.push(B([3.4, 0, 6.8], [7, .95, 7.6], wood), B([3.4, .95, 6.7], [7, 1.05, 7.7], planks(51, [156, 112, 70], 4)));
  S.prims.push(B([3.45, 0, 8.3], [3.6, 2.2, 8.45], wood), B([6.8, 0, 8.3], [6.95, 2.2, 8.45], wood), B([3.45, 0, 6.85], [3.6, 1.9, 7], wood), B([6.8, 0, 6.85], [6.95, 1.9, 7], wood));
  S.prims.push({ ok: true, lo: [3.2, 1.7, 6.4], hi: [7.2, 2.35, 8.6], mat: awn, planes: [{ n: [1, 0, 0], d: 7.2 }, { n: [-1, 0, 0], d: -3.2 }, { n: [0, 0, 1], d: 8.6 }, { n: [0, 0, -1], d: -6.4 },
    planeFrom("z", 6.4, 1.8, 8.6, 2.3, [7.5, 2.0]), planeFrom("z", 6.4, 1.72, 8.6, 2.22, [7.5, 2.0])].map(P => P.n ? P : P) });
  // fruit on the counter
  for (let i = 0; i < 18; i++) { const x = 3.6 + (i % 9) * .38, z = 6.85 + Math.floor(i / 9) * .35, c = [[206, 46, 44], [244, 200, 60], [120, 176, 64]][Math.floor(i / 3) % 3];
    S.prims.push(B([x, 1.05, z], [x + .26, 1.27, z + .26], () => ({ c }))); }
  S.prims.push(B([7.3, 0, 6.6], [8.1, .8, 7.4], wood), B([7.4, .8, 6.7], [8, 1.3, 7.3], wood), CYL(2.8, 7.3, .32, 0, .9, barrelMat(7)), CYL(2.5, 6.6, .28, 0, .8, barrelMat(8)));
  // trees and flowers (billboards); one tree very close to the camera, out of focus
  S.sprites.push({ x: -9.5, y: 0, z: 10.5, w: 5, h: 6.8, img: tree(61, [84, 140, 70]) }, { x: 12.6, y: 0, z: 10.8, w: 4.4, h: 6, img: tree(62, [96, 150, 74]) },
    { x: -8.6, y: 0, z: -2.5, w: 6, h: 8.2, img: tree(63, [70, 124, 62]) });
  for (const [x, z] of [[-2.2, 12.6], [-1.2, 12.6], [9.2, 12.4], [-6.6, 12], [2.2, 4.4]]) S.sprites.push({ x, y: 0, z, w: .62, h: .75, img: POT, blob: true });
  // real windows, lamps, a bench and grass along the walls
  frontDetails(S, -15, -7, 13, 3.3, true, [70, 112, 90]); frontDetails(S, -6, .5, 15, 4, true, [64, 92, 136]);
  frontDetails(S, 1.6, 8.6, 13.5, 3.1, true, [136, 64, 54]); frontDetails(S, 9.8, 15.5, 14, 3.8, true, [70, 112, 90]); frontDetails(S, -18, -12, 2, 3.2, false, [64, 92, 136]);
  const iron3 = flat([50, 50, 56]); lantern(S, -3.6, 3.4, 2.3, false, iron3); lantern(S, 8.9, 5.4, 2.3, false, iron3);
  const bench = planks(52, [130, 88, 54], 4, [40, 28, 20], true);
  S.prims.push(B([-7.4, .42, 5.6], [-5.6, .5, 6.05], bench, { ok: true }), B([-7.3, 0, 5.65], [-7.15, .42, 6], bench), B([-5.85, 0, 5.65], [-5.7, .42, 6], bench));
  for (const [x0, x1, zf] of [[-15, -7, 13], [-6, .5, 15], [1.6, 8.6, 13.5], [9.8, 15.5, 14], [-18, -12, 2]])
    for (let x = x0 + .3; x < x1; x += .9 + hash(x * 10 | 0, 2, 93) * .8) S.sprites.push({ x, y: 0, z: zf - .12, w: .7, h: .4, img: GRASS, noShadow: true });
  for (let i = 0; i < 24; i++) { const x = (hash(i, 6, 94) - .5) * 26, z = 1 + hash(i, 7, 94) * 11; S.sprites.push({ x, y: 0, z, w: .55, h: .3, img: GRASS, noShadow: true }); }
  person(S, "pip", -1.6, 5); person(S, "hero", .4, 4.4); person(S, "folkB", 2, 6.2); person(S, "folkA", -6.5, 5);
  return S;
};

// ---------- Белоречье: the snowy riverside town of the Russian story ----------
// the people of Белоречье (portraits further down, in BUSTS)
Object.assign(FOLK, {
  ruhero: () => makeChar({ hair: "curly", skirt: 36, longSleeve: true, pal: { ...SK, skin: hex("#b07a52"), hair: hex("#2a1c16"), top: hex("#c0703a"), skirt: [168, 98, 52], belt: [70, 46, 30], buckle: [210, 190, 120], strap: [64, 128, 96], pants: [60, 58, 70], eye: [60, 44, 36] } }),
  vera: () => makeChar({ hair: "hood", skirt: 38, longSleeve: true, pal: { ...SK, skin: hex("#eec3a4"), hair: [214, 210, 204], hood: hex("#c23b32"), top: hex("#5a6e9c"), skirt: [72, 62, 112], apron: [240, 232, 214], belt: [150, 60, 50], buckle: [230, 200, 110], eye: [80, 100, 130] } }),
  ivan: () => makeChar({ hair: "cap", beard: true, skirt: 37, longSleeve: true, pal: { ...SK, skin: hex("#dba882"), hair: hex("#6b5a4a"), cap: hex("#1f2f52"), brim: [22, 26, 34], top: hex("#2a3c66"), skirt: [36, 52, 92], belt: [40, 30, 26], buckle: [236, 200, 90], eye: [70, 80, 100] } }),
  katya: () => makeChar({ hair: "long", fringe: 2, skirt: 37, longSleeve: true, pal: { ...SK, skin: hex("#f5d0b4"), hair: hex("#e3c27a"), top: hex("#b8323a"), skirt: [150, 36, 44], apron: [244, 236, 220], belt: [210, 170, 70], buckle: [250, 230, 150], eye: [70, 110, 160] } }),
  dmitri: () => makeChar({ hair: "cap", flaps: true, mustache: true, skirt: 37, longSleeve: true, pal: { ...SK, skin: hex("#e2b08a"), hair: hex("#4a3424"), cap: [124, 120, 114], brim: [98, 94, 90], top: hex("#3e5a3c"), skirt: [52, 74, 50], belt: [60, 40, 28], buckle: [220, 200, 120], strap: [60, 40, 28], eye: [70, 70, 60] } }),
  olga: () => makeChar({ hair: "side", bun: true, skirt: 38, longSleeve: true, pal: { ...SK, skin: hex("#f0cfb4"), hair: hex("#7a4a34"), top: hex("#6b2f4a"), skirt: [70, 40, 60], belt: [200, 170, 110], buckle: [240, 220, 150], eye: [80, 90, 70] } }),
  misha: () => makeChar({ hair: "cap", flaps: true, longSleeve: true, pal: { ...SK, skin: hex("#f0c8a4"), hair: hex("#c88a3a"), cap: [140, 96, 60], brim: [112, 76, 48], top: hex("#3a6fb0"), pants: [60, 60, 80], belt: [80, 54, 38], buckle: [200, 180, 110], eye: [70, 110, 150] } }),
  fyodor: () => makeChar({ hair: "cap", flaps: true, beard: true, longSleeve: true, pal: { ...SK, skin: hex("#d49a74"), hair: hex("#8a4a2a"), cap: [72, 68, 74], brim: [58, 54, 60], top: hex("#34465e"), vest: [96, 74, 52], pants: [56, 52, 50], boots: [44, 40, 38], belt: [60, 40, 28], buckle: [180, 170, 150], eye: [70, 90, 110] } }),
  sonya: () => makeChar({ hair: "side", fringe: 0, longSleeve: true, pal: { ...SK, skin: hex("#f2cdb0"), hair: hex("#2c2230"), top: [236, 228, 212], vest: hex("#7a4a2a"), pants: [70, 60, 72], belt: [60, 40, 28], buckle: [230, 200, 110], strap: [200, 170, 90], eye: [90, 70, 50] } }),
  lev: () => makeChar({ hair: "short", beard: true, longSleeve: true, pal: { ...SK, skin: hex("#e8bc9c"), hair: [236, 234, 230], top: hex("#8a3a30"), apron: [124, 92, 60], pants: [70, 60, 60], belt: [60, 40, 28], buckle: [220, 190, 110], eye: [80, 110, 140] } }),
  rufolkA: () => makeChar({ hair: "cap", flaps: true, beard: true, skirt: 36, longSleeve: true, pal: { ...SK, skin: [220, 168, 128], hair: [96, 70, 50], cap: [150, 110, 72], brim: [120, 88, 58], top: [176, 130, 86], skirt: [150, 108, 70], belt: [80, 54, 38], buckle: [200, 180, 110], eye: [60, 50, 40] } }),
  rufolkB: () => makeChar({ hair: "hood", skirt: 38, longSleeve: true, pal: { ...SK, skin: [238, 200, 170], hair: [120, 80, 50], hood: [58, 96, 160], top: [96, 60, 90], skirt: [80, 50, 76], belt: [200, 170, 110], buckle: [240, 220, 150], eye: [60, 90, 60] } }),
});

// skies of a winter day and of a winter night
const winterSky = seed => d => { const y = clamp(d[1] * 2); let c = mix([232, 230, 236], [118, 148, 196], Math.pow(y, .6)); const cl = fbm(d[0] / (d[1] + .2) * 1.6, 1 / (d[1] + .2) * 2.4, seed); if (cl > .56) c = mix(c, [240, 240, 246], clamp((cl - .56) * 3) * .85); return c; };
const nightSky = seed => d => { const y = clamp(d[1] * 2.4); let c = mix([46, 54, 94], [10, 14, 38], y); if (d[1] > .03 && hash(Math.floor(d[0] * 260), Math.floor(d[1] * 260), seed) > .994) c = [226, 232, 255]; return c; };
// snow: soft blue-white drifts with a few glints; `path` (0..1) marks where feet have trodden it grey
const snowMat = (seed, path) => (p, n) => {
  const [u, v] = uvOf(p, n), ui = Math.floor(u * T), vi = Math.floor(v * T), r = hash(ui, vi, seed);
  if (r > .993 && n[1] > .5) return { c: [255, 255, 255], e: [46, 48, 56] };
  let c = mix([200, 212, 232], [246, 248, 252], clamp(fbm(u * .45, v * .45, seed) * 1.4 - .15));
  if (n[1] < .5) c = mul(c, .92);
  if (path) { const k = clamp(path(p) * (.6 + .6 * fbm(u * 1.4, v * 1.4, seed + 1))); if (k > 0) c = mix(c, [150, 146, 148], k * .5); }
  return { c: jit(c, r, .025) };
};
// a roof under snow: white on top, dark boards along the edges and underneath
const snowRoof = (seed, under = [96, 64, 44]) => { const s = snowMat(seed); return (p, n) => n[1] > .25 ? s(p, n) : { c: jit(under, hash(Math.floor(p[0] * T), Math.floor((p[1] + p[2]) * T), seed), .08) }; };
// walls of round logs laid one on top of another, with dark seams
const logs = (seed, base = [128, 84, 52]) => (p, n) => {
  if (Math.abs(n[1]) > .7) return { c: jit(mul(base, .85), hash(Math.floor(p[0] * T), Math.floor(p[2] * T), seed)) };
  const u = Math.abs(n[2]) > .5 ? p[0] : p[2], li = Math.floor(p[1] / .32), ly = p[1] / .32 - li;
  let c = mul(jit(base, hash(Math.floor(u * T / 5), li, seed), .07), .7 + .42 * Math.sin(ly * Math.PI));
  if (hash(Math.floor(u * T), li * 7 + Math.floor(ly * 5), seed + 1) > .9) c = mul(c, .86);
  if (ly < .07) c = mul(c, .45);
  return { c };
};
// an izba: log walls, a plank door and windows in carved white frames (наличники)
function izbaWall(seed, x0, x1, z0, z1, o = {}) {
  const lg = logs(seed, o.log), trim = o.trim || [238, 234, 222], trim2 = o.trim2 || [66, 108, 168], door = o.door !== false;
  return (p, n) => {
    if (Math.abs(n[1]) > .7) return lg(p, n);
    const facingZ = Math.abs(n[2]) > .7, u = facingZ ? p[0] - x0 : p[2] - z0, wdt = facingZ ? x1 - x0 : z1 - z0, y = p[1], mid = wdt / 2;
    const front = facingZ && n[2] < 0, ri = hash(Math.floor(u * T), Math.floor(y * T), seed);
    if (front && door && Math.abs(u - mid) < .5 && y < 1.95) {
      if (Math.abs(u - mid) > .42 || y > 1.87) return { c: jit(trim, ri, .04) };
      let c = jit([112, 72, 44], hash(Math.floor((u - mid + .5) * T / 3), 1, seed), .1);
      if (Math.floor((u - mid + .5) * T) % 3 === 0) c = mul(c, .7);
      if (Math.abs(u - mid - .26) < .05 && Math.abs(y - .95) < .05) c = [220, 180, 90];
      return { c };
    }
    const bay = 1.7, k = Math.floor(u / bay), lx = u - k * bay - .5, ly = y - .85;
    if (lx >= 0 && lx <= .7 && ly >= 0 && ly <= 1.5 && k * bay + 1.3 < wdt && !(front && door && Math.abs(k * bay + .85 - mid) < 1)) {
      if (ly > 1.08) { if (Math.abs(lx - .35) < (1.5 - ly) * .95) return { c: (Math.floor(lx * T) + Math.floor(ly * T)) % 3 ? trim : trim2 }; }
      else if (lx < .08 || lx > .62 || ly < .1 || ly > 1) return { c: ly < .1 && Math.floor(lx * T) % 2 ? trim2 : trim };
      else if (Math.abs(lx - .35) < .03 || Math.abs(ly - .58) < .03) return { c: trim };
      else if (o.lit) { const g = [255, 196, 116]; return { c: g, e: mul(g, .8) }; }
      else { const fr = clamp(1 - Math.min(lx - .08, .62 - lx, ly - .1, 1 - ly) * 9); return { c: mix(mix([44, 56, 86], [140, 168, 200], clamp(ly)), [226, 236, 248], fr * .8), spec: true }; }
    }
    if (u < .14 || u > wdt - .14) return { c: mul(lg(p, n).c, .8) };
    return lg(p, n);
  };
}
// an izba with a snowy roof, a chimney and drifts along the front
function izba(S, x0, x1, z0, z1, h, ridge, seed, o = {}) {
  house(S, x0, x1, z0, z1, h, o.R || 1.9, ridge, izbaWall(seed, x0, x1, z0, z1, o), snowRoof(seed + 1));
  const cx = ridge === "x" ? x0 + (x1 - x0) * .7 : (x0 + x1) / 2 + .2, cz = ridge === "x" ? (z0 + z1) / 2 + .2 : z0 + (z1 - z0) * .3;
  S.prims.push(B([cx - .3, h, cz - .3], [cx + .3, h + (o.R || 1.9) + .7, cz + .3], bricks(seed + 2, [[150, 70, 56], [130, 60, 50]], 8, 4, [200, 196, 190])));
  drift(S, x0, x1, z0, seed + 3, o.door !== false);
}
// low snowdrifts along the foot of a wall (with a gap at the door)
function drift(S, x0, x1, z, seed, door = true) {
  const mid = (x0 + x1) / 2, m = snowMat(seed);
  for (let x = x0 - .2; x < x1 + .2;) {
    const w = .5 + hash(x * 10 | 0, 1, seed) * .9, h = .1 + hash(x * 10 | 0, 2, seed) * .2, xe = Math.min(x + w, x1 + .2);
    if (!(door && xe > mid - .6 && x < mid + .6)) S.prims.push(B([x, 0, z - .25 - h], [xe, h, z + .05], m, { clean: true }));
    x = xe;
  }
}
// a fir with snow on each tier, and a bare winter birch (white bark, black marks)
function fir(seed, snowy = true) {
  const tiers = [0, 1, 2, 3].map(t => ({ yt: 1 + t * 11, yb: 22 + t * 11, w: 6 + t * 3.8 }));
  const inT = (x, y, Ti) => { if (y < Ti.yt || y > Ti.yb) return false; return Math.abs(x - 17.5) <= (y - Ti.yt + .5) / (Ti.yb - Ti.yt) * Ti.w + (hash(x, y, seed) - .5) * 1.2; };
  return procSprite(36, 64, (x, y) => {
    if (y >= 54) return Math.abs(x - 17.5) < 2.2 ? (x < 18 ? [104, 72, 48] : [76, 52, 34]) : null;
    for (let t = 3; t >= 0; t--) {
      const Ti = tiers[t]; if (!inT(x, y, Ti)) continue;
      if (snowy && (!inT(x, y - 1, Ti) || !inT(x, y - 2, Ti)) && hash(x, y, seed + 3) > .15) return x < 18 ? [246, 248, 252] : [206, 216, 234];
      const lv = (17.5 - x) / Ti.w * .35 + (hash(x, y, seed + 1) - .5) * .5 - (y - Ti.yt) / (Ti.yb - Ti.yt) * .3, g = [40, 82, 62];
      return lv > .25 ? mul(g, 1.3) : lv > -.1 ? g : lv > -.4 ? mul(g, .75) : mul(g, .55);
    }
    return null;
  });
}
function birch(seed) {
  return procSprite(30, 64, (x, y) => {
    const cx = 15 + Math.sin(y * .08 + seed) * 1.2, tw = y > 20 ? 1.6 : 1.1;
    if (Math.abs(x - cx) <= tw) return hash(x, y >> 1, seed) > .82 ? [40, 38, 40] : x < cx ? [244, 240, 232] : [196, 192, 188];
    for (let k = 0; k < 7; k++) {
      const by = 6 + k * 6 + hash(k, 1, seed) * 3, dir = k % 2 ? 1 : -1, len = 6 + hash(k, 2, seed) * 7, dx = (x - cx) * dir;
      if (dx > 0 && dx < len && Math.abs(by - y - dx * .8) < .7) return [92, 78, 72];
    }
    return null;
  });
}
const FIRS = [fir(1), fir(2), fir(3)], BIRCH = [birch(1), birch(2)];
// a tiny 3×5 pixel font for the signs (Cyrillic capitals)
const FONT = { А: "010101111101101", Б: "111100111101111", В: "110101110101110", Е: "111100111100111", Ж: "101111010111101", И: "101101111111101", К: "101110100110101",
  Л: "011101101101101", М: "101111111101101", О: "111101101101111", П: "111101101101101", Р: "111101111100100", С: "111100100100111", Т: "111010010010010",
  У: "101101111001111", Ч: "101101111001001", Ш: "101101101101111", Ь: "100100111101111", Я: "111101111011101" };
// a board with letters on its front face (x0..x1, y0..y1 are the board's front edges)
function signMat(text, x0, x1, y0, y1, bg, fg, seed = 1) {
  const cols = text.length * 4 + 3, k = Math.max(1, Math.floor(Math.min((x1 - x0) * T / cols, (y1 - y0) * T / 7)));
  const ox = Math.floor(((x1 - x0) * T - cols * k) / 2), oy = Math.floor(((y1 - y0) * T - 7 * k) / 2);
  return (p, n) => {
    if (n[2] > -.5) return { c: mul(bg, .8) };
    const tx = Math.floor((p[0] - x0) * T) - ox, ty = Math.floor((y1 - p[1]) * T) - oy, fx = Math.floor(tx / k) - 2, fy = Math.floor(ty / k) - 1;
    let on = false;
    if (fy >= 0 && fy < 5 && fx >= 0) { const g = FONT[text[Math.floor(fx / 4)]]; if (g && fx % 4 < 3) on = g[fy * 3 + fx % 4] === "1"; }
    return { c: jit(on ? fg : bg, hash(tx, ty, seed), .05) };
  };
}
// a round clock face on the front of a box, hands at h:m; `glow` lights it from behind
const clockFace = (cx, cy, r, h, m, rim = [60, 56, 60], glow = 0) => (p, n) => {
  if (n[2] > -.5) return { c: rim };
  const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) / r;
  if (d > 1) return { c: rim };
  if (d > .9) return { c: mul(rim, 1.35) };
  const a = Math.atan2(dx, dy), hand = (ang, len, w) => { const ux = Math.sin(ang), uy = Math.cos(ang), al = dx * ux + dy * uy; return al > -.05 * r && al < len * r && Math.abs(-dx * uy + dy * ux) < w * r; };
  if (hand((h % 12 + m / 60) / 12 * Math.PI * 2, .5, .08) || hand(m / 60 * Math.PI * 2, .78, .05)) return { c: [30, 28, 30] };
  const tick = d > .72 && d < .86 && Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - .5) > .4, c = tick ? [40, 38, 40] : [246, 238, 216];
  return glow ? { c, e: mul(c, glow) } : { c };
};
const brass = seed => (p, n) => ({ c: jit(n[0] < -.3 ? [246, 200, 110] : n[0] > .5 ? [168, 116, 52] : [214, 160, 72], hash(Math.floor(p[1] * T), 1, seed), .05), spec: true });
// a window seen from inside on a winter day: frost creeping in from the frame, daylight coming through
const frost = (x0, x1, y0, y1, seed) => (p, n) => {
  const u = (p[0] - x0) / (x1 - x0), v = (p[1] - y0) / (y1 - y0), ui = Math.floor(p[0] * T), vi = Math.floor(p[1] * T);
  if (u < .06 || u > .94 || v < .06 || v > .94 || Math.abs(u - .5) < .03 || Math.abs(v - .55) < .025) return { c: jit([226, 220, 206], hash(ui, vi, seed), .04) };
  const fr = clamp(1 - Math.min(u, 1 - u, v, 1 - v) * 5 + (fbm(u * 6, v * 6, seed) - .5) * .9), c = mix(mix([176, 200, 230], [226, 236, 248], v), [250, 252, 255], fr);
  return { c, e: mul(c, .55) };
};
// an onion dome: stacked rings that swell and narrow to a point, with a gold cross on top
function onion(S, x, y0, z, r, mat, gold) {
  const prof = [1, 1.16, 1.27, 1.3, 1.24, 1.08, .86, .6, .36, .16], h = r * .32;
  prof.forEach((k, i) => S.prims.push(CYL(x, z, r * k, y0 + i * h, y0 + (i + 1) * h, mat)));
  const top = y0 + prof.length * h, w = Math.max(.04, r * .06);
  S.prims.push(B([x - w, top, z - w], [x + w, top + r * 1.1, z + w], gold), B([x - r * .32, top + r * .66, z - w], [x + r * .32, top + r * .66 + 2 * w, z + w], gold));
}
const dome = (base, seed, stars) => (p, n) => { const ui = Math.floor(p[0] * T * 1.5), vi = Math.floor(p[1] * T * 1.5); return { c: stars && hash(ui, vi, seed) > .95 ? [246, 206, 96] : jit(base, hash(ui, vi, seed + 1), .05), spec: true }; };
// a white church with a big gold dome on a drum and four small blue ones with gold stars
function church(S, x, z, s, seed) {
  const wall = (p, n) => {
    if (Math.abs(n[1]) < .7 && !CUR.cyl) { const u = (Math.abs(n[2]) > .7 ? p[0] - x : p[2] - z) / s, y = p[1] / s, wu = ((u + .75) % 1.5 + 1.5) % 1.5 - .75;
      if (Math.abs(wu) < .2 && y > 1.6 && y < 3 + Math.sqrt(Math.max(0, .04 - wu * wu))) return { c: [54, 58, 80] }; }
    return { c: jit([240, 236, 226], hash(Math.floor(p[0] * T), Math.floor(p[1] * T), seed), .03) };
  };
  const gold = dome([226, 176, 66], seed + 1), blue = dome([52, 84, 160], seed + 2, true);
  S.prims.push(B([x - 3 * s, 0, z - 3 * s], [x + 3 * s, 4.6 * s, z + 3 * s], wall), B([x - 3.2 * s, 4.6 * s, z - 3.2 * s], [x + 3.2 * s, 5 * s, z + 3.2 * s], snowRoof(seed + 3, [70, 120, 96])));
  S.prims.push(CYL(x, z, 1.3 * s, 5 * s, 7.2 * s, wall)); onion(S, x, 7.2 * s, z, 1.3 * s, gold, gold);
  for (const [dx, dz] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) { S.prims.push(CYL(x + dx * s, z + dz * s, .55 * s, 5 * s, 6.2 * s, wall)); onion(S, x + dx * s, 6.2 * s, z + dz * s, .55 * s, blue, gold); }
}
// a nesting doll: painted body and head, a face on the front
function matryoshka(S, x, y, z, s, col) {
  const body = (p, n) => ({ c: n[2] < -.5 && Math.abs(p[0] - x) < .05 * s && p[1] < y + .16 * s ? [246, 226, 120] : jit(col, hash(Math.floor(p[0] * T * 4), Math.floor(p[1] * T * 4), 3), .05) });
  const head = (p, n) => ({ c: n[2] < -.4 && Math.abs(p[0] - x) < .045 * s && p[1] < y + .3 * s ? [244, 214, 186] : col });
  S.prims.push(CYL(x, z, .1 * s, y, y + .2 * s, body, { clean: true }), CYL(x, z, .072 * s, y + .2 * s, y + .33 * s, head, { clean: true }));
}
// a snowman: three balls of snow, a carrot nose, coal eyes and a bucket for a hat
function snowman(S, x, z, seed) {
  const m = snowMat(seed);
  S.prims.push(CYL(x, z, .48, 0, .78, m, { clean: true }), CYL(x, z, .35, .78, 1.32, m, { clean: true }), CYL(x, z, .24, 1.32, 1.72, m, { clean: true }));
  S.prims.push(B([x - .03, 1.5, z - .42], [x + .03, 1.56, z - .2], flat([236, 120, 40])), CYL(x, z, .2, 1.72, 1.92, flat([90, 96, 110])));
  for (const dx of [-.08, .08]) S.prims.push(B([x + dx - .025, 1.6, z - .245], [x + dx + .025, 1.65, z - .2], flat([30, 30, 34])));
}
// a pine sled loaded with firewood
function sled(S, x, z, seed) {
  const wood = planks(seed, [150, 108, 66], 3, [60, 40, 28], true);
  S.prims.push(B([x - .8, 0, z - .35], [x + .8, .08, z - .27], wood), B([x - .8, 0, z + .27], [x + .8, .08, z + .35], wood), B([x - .05, 0, z - .3], [x + .05, .09, z + .3], wood), B([x - .7, .08, z - .35], [x + .7, .24, z + .35], wood));
  for (let i = 0; i < 4; i++) S.prims.push(B([x - .62, .24 + (i > 2 ? .2 : 0), z - .3 + (i % 3) * .2], [x + .62, .44 + (i > 2 ? .2 : 0), z - .12 + (i % 3) * .2], (p, n) => ({ c: Math.abs(n[0]) > .5 ? [214, 176, 120] : jit([110, 78, 52], hash(Math.floor(p[0] * T), i, seed), .1) })));
}
// a winter crowd of trees: firs and birches scattered behind the scene
function forest(S, x0, x1, z0, z1, n, seed) {
  for (let i = 0; i < n; i++) {
    const x = x0 + hash(i, 1, seed) * (x1 - x0), z = z0 + hash(i, 2, seed) * (z1 - z0), b = hash(i, 3, seed) > .75, k = .8 + hash(i, 4, seed) * .6;
    S.sprites.push(b ? { x, y: 0, z, w: 2.6 * k, h: 5.6 * k, img: BIRCH[i % 2] } : { x, y: 0, z, w: 3.4 * k, h: 6 * k, img: FIRS[i % 3] });
  }
}

// the railway station at night: platform, a lit carriage, the station house with its sign, falling snow
STORY.station = () => {
  const S = base({ cam: { p: [0, 3.9, -10.5], pitch: .12, fr: 1.05 }, ao: .85, amb: [.2, .23, .36],
    sun: { dir: norm([-.45, .8, -.4]), c: [.36, .42, .62], soft: .06 },
    fog: { c: [40, 48, 78], start: 16, k: .035, max: .75 }, grade: [1, 1, 1.04], bloom: { t: 170, a: .65 },
    dof: { near: 9.5, nearRamp: 3, far: 20, farRamp: 18, blur: 4 }, sky: nightSky(601) });
  const snow = snowMat(602, p => clamp(1 - Math.abs(p[2] - 2) / 2.4) * clamp(1.2 - Math.abs(p[0]) / 8)), wood = planks(603, [104, 74, 52], 5, [40, 28, 20], true), iron = flat([46, 46, 52]);
  S.prims.push(B([-30, -1, -8], [30, 0, 4.2], snow), B([-30, 0, 3.9], [30, .02, 4.2], flat([196, 176, 96]), { noShadow: true }));
  // the tracks below the platform, then snowy fields
  S.prims.push(B([-30, -1.7, 4.2], [30, -.7, 7.6], snowMat(604)), B([-30, -1, 7.6], [30, 0, 80], snowMat(605)));
  for (let x = -29; x < 30; x += .9) S.prims.push(B([x, -.7, 4.9], [x + .25, -.62, 6.9], wood));
  for (const z of [5.15, 6.55]) S.prims.push(B([-30, -.7, z], [30, -.55, z + .1], iron));
  // a green carriage with warm windows, on its wheels
  const wagon = (p, n) => {
    const r = hash(Math.floor(p[0] * T), Math.floor(p[1] * T), 606);
    if (Math.abs(n[2]) > .5) { const wu = ((p[0] + 15) % 1.6 + 1.6) % 1.6, y = p[1];
      if (wu > .35 && wu < 1.25 && y > 1.05 && y < 1.95) { if (wu < .41 || wu > 1.19 || y < 1.11 || y > 1.89) return { c: [196, 190, 170] }; const g = [255, 204, 126]; return { c: g, e: mul(g, .9) }; }
      if (Math.abs(y - .62) < .07) return { c: [214, 176, 80] }; }
    return { c: jit([44, 86, 70], r, .05) };
  };
  S.prims.push(B([-15, -.25, 5], [1.5, 2.7, 6.8], wagon), B([-14.6, -.4, 5.4], [1.1, -.2, 6.4], iron), B([-15.1, 2.7, 4.95], [1.6, 2.86, 6.85], snowRoof(607, [50, 52, 58])));
  for (const x of [-13.4, -11.8, -2.6, -1]) for (const z of [5.1, 6.5]) S.prims.push(B([x, -.55, z], [x + .7, -.15, z + .2], iron));
  for (const x of [-12, -8.8, -5.6, -2.4, .4]) S.lights.push({ p: [x, 1.5, 4.4], c: [.9, .62, .3], r: 3.4, soft: .3 });
  // the station house beyond the tracks, with its name on a board
  izba(S, 3.5, 13, 9, 14, 3.2, "x", 608, { lit: true, trim2: [150, 60, 50], R: 2.2 });
  S.prims.push(B([6.4, 2.35, 8.86], [10.1, 2.95, 9.02], signMat("БЕЛОРЕЧЬЕ", 6.4, 10.1, 2.35, 2.95, [36, 52, 96], [246, 236, 200])));
  // lamps, a bench under snow, the station clock (almost midnight) and the hero's suitcase
  lantern(S, -4.6, 2.4, 2.3, true, iron); lantern(S, 5.2, 2.8, 2.3, true, iron);
  S.prims.push(B([-8.4, .42, 2.8], [-6.6, .5, 3.25], wood, { ok: true }), B([-8.4, .5, 2.8], [-6.6, .57, 3.25], snowMat(609), { clean: true }), B([-8.3, 0, 2.85], [-8.15, .42, 3.2], wood), B([-6.85, 0, 2.85], [-6.7, .42, 3.2], wood));
  S.prims.push(CYL(2.9, 3.6, .06, 0, 2.6, iron), B([2.6, 2.6, 3.5], [3.2, 3.2, 3.7], clockFace(2.9, 2.9, .28, 11, 50, [46, 46, 52], .5)));
  S.prims.push(B([-1.6, 0, 2.1], [-1.05, .42, 2.36], flat([124, 70, 44])), B([-1.4, .42, 2.2], [-1.25, .5, 2.26], flat([60, 40, 30])), B([-1.62, .2, 2.08], [-1.03, .24, 2.38], flat([200, 170, 90])));
  // firs and birches all around, a snowy forest far away
  forest(S, -26, 26, 18, 40, 22, 610);
  S.sprites.push({ x: -10.5, y: 0, z: 1.2, w: 3.4, h: 6.2, img: FIRS[0] }, { x: 9.8, y: 0, z: 1.8, w: 2.4, h: 5.2, img: BIRCH[0] }, { x: 15.6, y: 0, z: 10.6, w: 3.4, h: 6, img: FIRS[1] });
  person(S, "ivan", 2.3, 3.0); person(S, "ruhero", -.5, 2.2);
  return S;
};
// the tea house «Самовар»: log walls, a big white stove, the samovar on the table, frosty windows
STORY.chainaya = () => {
  const S = base({ cam: { p: [0, 3.7, -7.4], pitch: .2, fr: 1 }, ao: .8, amb: [.34, .3, .3],
    fog: { c: [30, 22, 18], start: 30, k: .01, max: 0 }, grade: [1.05, 1, .95], bloom: { t: 180, a: .6 },
    dof: { near: 9.5, nearRamp: 3, far: 17, farRamp: 10, blur: 4 }, sky: () => [210, 220, 236] });
  const wall = logs(611, [146, 98, 60]), floor = planks(612, [152, 106, 66], 6), wood = planks(613, [118, 78, 48], 4), iron = flat([52, 50, 56]);
  S.prims.push(B([-8, -1, -4], [8, 0, 7.2], floor), B([-8, 0, 6.9], [8, 4, 7.2], wall), B([-8, 0, -4], [-7.4, 4, 6.9], wall), B([7.4, 0, -4], [8, 4, 6.9], wall));
  // two frosty windows, daylight coming in
  for (const [x0, x1] of [[1.2, 2.8], [4.3, 5.9]]) { S.prims.push(B([x0, 1.2, 6.84], [x1, 2.7, 6.9], frost(x0, x1, 1.2, 2.7, 614)), B([x0 - .12, 1.08, 6.7], [x1 + .12, 1.2, 6.9], wood)); S.lights.push({ p: [(x0 + x1) / 2, 2, 6.2], c: [.5, .58, .78], r: 7, soft: .6 }); }
  // the Russian stove: white tiles with a blue band, the fire glowing in its mouth
  const stove = (p, n) => {
    const [u, v] = uvOf(p, n), ui = Math.floor(u * T), vi = Math.floor(v * T);
    if (n[2] < -.5 && Math.abs(p[0] + 6) < .45 && p[1] > .5 && p[1] < 1.15 + Math.sqrt(Math.max(0, .2 - (p[0] + 6) ** 2)) * .4) { const g = mix([255, 150, 60], [90, 30, 16], clamp((p[1] - .5) * 1.6)); return { c: g, e: mul(g, .8) }; }
    if (((ui % 8) + 8) % 8 === 0 || ((vi % 8) + 8) % 8 === 0) return { c: [196, 190, 180] };
    const band = p[1] > 1.32 && p[1] < 1.58, dm = Math.abs(((ui % 8) + 8) % 8 - 4) + Math.abs(((vi % 8) + 8) % 8 - 4);
    return { c: band && dm < 3 ? [56, 92, 170] : jit([240, 236, 228], hash(ui, vi, 615), .03) };
  };
  S.prims.push(B([-7.4, 0, 4.6], [-4.6, 1.7, 6.9], stove, { clean: true }), B([-7.4, 1.7, 5.4], [-5.2, 2.7, 6.9], stove, { clean: true }), B([-6.7, 2.7, 6.1], [-5.8, 4, 6.9], stove, { clean: true }));
  S.sprites.push({ x: -6, y: .5, z: 4.62, w: .6, h: .55, img: FLAME, emit: 1.2, noShadow: true });
  S.lights.push({ p: [-6, .9, 4.2], c: [1.9, 1, .42], r: 8, soft: .25 }, { p: [0, 3.2, 1.5], c: [.42, .32, .24], r: 10, soft: .5 });
  // the table with an embroidered cloth, the samovar, cups and a plate of pirozhki
  roundTable(S, 2.2, 4.2, .75, wood);
  S.prims.push(CYL(2.2, 4.2, .8, .8, .83, (p, n) => { const d = Math.hypot(p[0] - 2.2, p[2] - 4.2); return { c: d > .68 || (Math.abs(n[1]) < .5 && Math.floor(Math.atan2(p[2] - 4.2, p[0] - 2.2) * 8) % 2) ? [190, 40, 46] : [246, 242, 232] }; }, { clean: true }));
  const br = brass(616), china = (p, n) => ({ c: Math.floor(p[1] * T * 2) % 3 === 0 ? [60, 90, 170] : [246, 246, 240] });
  S.prims.push(CYL(2.2, 4.4, .16, .83, .95, br), CYL(2.2, 4.4, .28, .95, 1.45, br), CYL(2.2, 4.4, .2, 1.45, 1.55, br), CYL(2.2, 4.4, .12, 1.55, 1.62, br), CYL(2.2, 4.4, .13, 1.62, 1.82, china, { clean: true }), CYL(2.2, 4.4, .07, 1.82, 1.87, china, { clean: true }));
  S.prims.push(B([1.86, 1.28, 4.37], [1.94, 1.4, 4.43], flat([60, 40, 30])), B([2.46, 1.28, 4.37], [2.54, 1.4, 4.43], flat([60, 40, 30])), B([2.17, 1, 4.05], [2.23, 1.06, 4.16], br));
  for (const [x, z] of [[1.66, 3.86], [2.7, 3.82]]) S.prims.push(CYL(x, z, .12, .83, .85, china, { clean: true }), CYL(x, z, .07, .85, .95, china, { clean: true }));
  S.prims.push(CYL(1.6, 4.5, .2, .83, .85, flat([240, 236, 226]), { clean: true }));
  for (const [x, z] of [[1.52, 4.44], [1.66, 4.54], [1.56, 4.6]]) S.prims.push(B([x - .07, .85, z - .04], [x + .07, .91, z + .04], flat([206, 140, 64])));
  // a corner table with stools near the camera, a lamp on the beam, an embroidered towel, shelf of cups
  roundTable(S, -3.4, 1.6, .7, wood); stool(S, -4.4, 1.3, wood); stool(S, -2.5, .9, wood); candle(S, -3.3, .8, 1.6);
  S.prims.push(B([-7.4, 3.4, 3.2], [7.4, 3.6, 3.4], wood)); hangLamp(S, .4, 3.3, 2.5, 3.4, iron);
  S.prims.push(B([-.4, 1.6, 6.84], [.2, 2.9, 6.9], (p, n) => ({ c: (Math.floor(p[1] * T) % 6 < 2 && p[1] < 2) ? [196, 40, 46] : [246, 242, 232] }), { clean: true }));
  S.prims.push(B([6.2, 2.2, 3.2], [7.4, 2.28, 5.6], wood)); for (const z of [3.5, 4, 4.5, 5]) S.prims.push(CYL(6.8, z, .1, 2.28, 2.42, china, { clean: true }));
  matryoshka(S, 6.8, 2.28, 5.35, 1.4, [196, 40, 46]);
  S.prims.push(B([-2, 0, 1.2], [2, .02, 3.6], rugMat([150, 40, 46], [236, 196, 96], 617), { noShadow: true }));
  person(S, "vera", 1.0, 4.9); person(S, "katya", -3.4, 4.7); person(S, "ruhero", -.5, 2.4);
  return S;
};
// the winter fair on the town square: stalls under snow, a church with onion domes far away
STORY.snowmarket = () => {
  const S = base({ cam: { p: [0, 3.8, -11.5], pitch: .1, fr: 1.05 }, ao: .8, amb: [.46, .5, .62],
    sun: { dir: norm([-.5, .55, -.3]), c: [1.12, 1, .86] },
    fog: { c: [214, 222, 236], start: 26, k: .014, max: .6 }, grade: [1.02, 1, 1.02], bloom: { t: 235, a: .4 },
    dof: { near: 10.5, nearRamp: 3, far: 26, farRamp: 30, blur: 4 }, sky: winterSky(621) });
  S.prims.push(B([-30, -1, -6], [30, 0, 160], snowMat(622, p => Math.max(clamp(1 - Math.abs(p[2] - 3.4) / 2.6), clamp(1 - Math.abs(p[0] - .4) / 1.6) * clamp((p[2] - 3) / 3)))));
  izba(S, -14, -7.6, 10, 15, 2.8, "x", 623, { trim2: [70, 120, 80] });
  izba(S, -6.6, -1.8, 12, 17, 3, "z", 625, { R: 2.2 });
  izba(S, 2.6, 8.8, 10, 15, 2.7, "x", 627, { trim2: [160, 70, 56] });
  izba(S, 9.8, 15.5, 11, 16, 3, "z", 629, { R: 2.2, trim2: [70, 120, 80] });
  church(S, .4, 60, .8, 631);
  // the fair's sign over the path
  for (const x of [-1.75, 2.35]) S.prims.push(B([x, 0, 8.4], [x + .2, 3.6, 8.6], planks(632, [120, 82, 52], 4)));
  S.prims.push(B([-1.65, 2.8, 8.38], [2.45, 3.4, 8.6], signMat("ЯРМАРКА", -1.65, 2.45, 2.8, 3.4, [176, 40, 46], [250, 226, 140])));
  // stall builder: counter, four posts, a sloped roof under snow, goods on top
  const stall = (x0, x1, z0, col, seed, goods) => {
    const z1 = z0 + .8, wood = planks(seed, [126, 86, 54], 4);
    S.prims.push(B([x0, 0, z0 + .1], [x1, .95, z1], wood), B([x0, .95, z0], [x1, 1.05, z1 + .1], planks(seed + 1, [160, 116, 72], 4)));
    S.prims.push(B([x0 + .05, 0, z1 + 1.5], [x0 + .2, 2.2, z1 + 1.65], wood), B([x1 - .2, 0, z1 + 1.5], [x1 - .05, 2.2, z1 + 1.65], wood), B([x0 + .05, 0, z0 + .15], [x0 + .2, 1.9, z0 + .3], wood), B([x1 - .2, 0, z0 + .15], [x1 - .05, 1.9, z0 + .3], wood));
    S.prims.push({ ok: true, lo: [x0 - .2, 1.7, z0 - .4], hi: [x1 + .2, 2.4, z1 + 1.8], mat: snowRoof(seed + 2, col), planes: [{ n: [1, 0, 0], d: x1 + .2 }, { n: [-1, 0, 0], d: -(x0 - .2) }, { n: [0, 0, 1], d: z1 + 1.8 }, { n: [0, 0, -1], d: -(z0 - .4) },
      planeFrom("z", z0 - .4, 1.84, z1 + 1.8, 2.36, [z0 + .5, 1.93]), planeFrom("z", z0 - .4, 1.72, z1 + 1.8, 2.24, [z0 + .5, 1.93])] });
    goods(x0, x1, z0);
  };
  // Katya's pirozhki, with a samovar on the counter
  stall(-4.4, -.6, 5.2, [150, 40, 46], 633, (x0, x1, z0) => {
    for (let i = 0; i < 14; i++) { const x = x0 + .2 + (i % 7) * .32, z = z0 + .2 + Math.floor(i / 7) * .3; S.prims.push(B([x, 1.05, z], [x + .24, 1.15, z + .16], flat([206, 142, 66]))); }
    const br = brass(634); S.prims.push(CYL(x1 - .5, z0 + .4, .12, 1.05, 1.15, br), CYL(x1 - .5, z0 + .4, .2, 1.15, 1.5, br), CYL(x1 - .5, z0 + .4, .1, 1.5, 1.62, br));
  });
  // knitted hats and scarves, valenki and nesting dolls
  stall(1.8, 5.6, 5.6, [52, 84, 160], 635, (x0, x1, z0) => {
    const cols = [[196, 40, 46], [52, 84, 160], [236, 196, 70], [60, 130, 80], [240, 236, 226]];
    for (let i = 0; i < 6; i++) matryoshka(S, x0 + .3 + i * .22, 1.05, z0 + .25, 1.6 - i * .14, cols[i % 4]);
    for (let i = 0; i < 3; i++) S.prims.push(B([x0 + 1.8 + i * .55, 1.05, z0 + .15], [x0 + 2.25 + i * .55, 1.18, z0 + .65], cloth(cols[(i + 1) % 5], i, [240, 236, 226])));
    S.prims.push(B([x0 + .2, 1.75, z0 + 1.1], [x1 - .2, 1.8, z0 + 1.15], flat([50, 50, 56]), { ok: true }));
    S.prims.push(B([x0 + .6, .95, z0 + 1.08], [x0 + 1, 1.75, z0 + 1.12], cloth([196, 40, 46], 7, [240, 236, 226])), B([x0 + 2.4, 1.1, z0 + 1.08], [x0 + 2.8, 1.75, z0 + 1.12], cloth([60, 130, 80], 8, [236, 196, 70])));
    S.prims.push(B([x1 + .1, 0, z0 + .1], [x1 + .32, .38, z0 + .44], flat([110, 106, 104])), B([x1 + .36, 0, z0 + .1], [x1 + .58, .38, z0 + .44], flat([110, 106, 104])));
  });
  snowman(S, -7.2, 7.2, 636); sled(S, 7.4, 6.4, 637);
  lantern(S, -6.4, 4.2, 2.3, false, flat([50, 50, 56])); lantern(S, 7.6, 4.4, 2.3, false, flat([50, 50, 56]));
  S.sprites.push({ x: -10.4, y: 0, z: 7.2, w: 3.6, h: 6.4, img: FIRS[2] }, { x: 12.6, y: 0, z: 8, w: 2.6, h: 5.6, img: BIRCH[1] }, { x: -16.5, y: 0, z: 9, w: 3.4, h: 6, img: FIRS[0] });
  forest(S, -30, 30, 26, 46, 16, 638);
  person(S, "katya", -4.9, 4.7); person(S, "misha", 1.6, 4.1); person(S, "ruhero", .3, 3.2); person(S, "rufolkA", -8.6, 4.4); person(S, "rufolkB", 6.6, 4.6);
  return S;
};
// the town hall: red brick with white window frames, a porch, and the guard's striped booth
STORY.ratusha = () => {
  const S = base({ cam: { p: [0, 3.5, -12.5], pitch: .06, fr: 1.05 }, ao: .85, amb: [.44, .48, .6],
    sun: { dir: norm([.55, .5, -.45]), c: [1.15, 1, .84] },
    fog: { c: [214, 222, 236], start: 28, k: .012, max: .55 }, grade: [1.03, 1, 1], bloom: { t: 235, a: .45 },
    dof: { near: 11.5, nearRamp: 3, far: 24, farRamp: 26, blur: 4 }, sky: winterSky(641) });
  S.prims.push(B([-30, -1, -6], [30, 0, 160], snowMat(642, p => clamp(1 - Math.abs(p[0] - .2) / 1.8) * clamp(p[2] / 6))));
  const brick = bricks(643, [[168, 72, 58], [150, 62, 50], [180, 84, 66], [140, 58, 48]], 8, 4, [214, 204, 194]), white = [236, 232, 222];
  const hallWall = (p, n) => {
    if (Math.abs(n[2]) > .7 && n[2] < 0) {
      for (const wx of [-5.6, -3.6, 3.6, 5.6]) for (const [y0, y1] of [[.9, 1.9], [2.6, 3.6]]) {
        const dx = Math.abs(p[0] - wx), y = p[1];
        if (dx < .6 && y > y0 - .14 && y < y1 + .3) {
          if (dx < .44 && y > y0 && y < y1 + Math.sqrt(Math.max(0, .19 - dx * dx)) * .4) { if (dx < .03 || Math.abs(y - (y0 + y1) / 2) < .03) return { c: white }; return { c: mix([44, 56, 86], [150, 176, 206], clamp((y - y0) / (y1 - y0))), spec: true }; }
          return { c: jit(white, hash(Math.floor(p[0] * T), Math.floor(y * T), 644), .03) };
        }
      }
      if (Math.abs(p[1] - 2.25) < .08 || p[1] > 4) return { c: white };
    }
    if (Math.abs(p[0]) > 7.25 || p[1] < .35) return { c: jit(white, hash(Math.floor(p[0] * T), Math.floor(p[1] * T), 645), .03) };
    return brick(p, n);
  };
  house(S, -7.5, 7.5, 8, 13, 4.2, 2, "x", hallWall, snowRoof(646, [70, 110, 90]));
  // double door, porch roof on two posts, steps and the name board
  S.prims.push(B([-.9, .3, 7.9], [.9, 2.5, 8], (p, n) => { const ui = Math.floor((p[0] + .9) * T); let c = jit([110, 66, 40], hash(Math.floor(ui / 4), 1, 647), .1); if (ui % 4 === 0) c = mul(c, .65); if (Math.abs(p[0]) < .02) c = [50, 34, 24]; if (Math.abs(Math.abs(p[0]) - .14) < .04 && Math.abs(p[1] - 1.3) < .05) c = [230, 196, 100]; return { c }; }));
  S.prims.push(B([-2, 0, 6.8], [2, .15, 8], stoneBlocks(648, [170, 164, 156])), B([-1.7, .15, 7.2], [1.7, .3, 8], stoneBlocks(648, [170, 164, 156])));
  for (const x of [-1.6, 1.4]) S.prims.push(B([x, .15, 6.9], [x + .2, 2.9, 7.1], flat(white)));
  S.prims.push(B([-1.9, 2.9, 6.7], [1.9, 3.1, 8.05], snowRoof(649, [236, 232, 222])));
  S.prims.push(B([-1.4, 3.3, 7.92], [1.4, 3.85, 8.02], signMat("РАТУША", -1.4, 1.4, 3.3, 3.85, [36, 52, 96], [246, 226, 150])));
  // the guard's booth with black and white stripes
  const stripes = (p, n) => {
    if (n[2] < -.5 && Math.abs(p[0] - 3.7) < .3 && p[1] > .2 && p[1] < 2) return { c: [40, 34, 32] };
    const s = Math.floor((p[1] + (Math.abs(n[2]) > .5 ? p[0] : p[2]) * .7) * 3.2); return { c: s % 2 ? [236, 232, 224] : [38, 36, 40] };
  };
  house(S, 3.2, 4.2, 5.6, 6.5, 2.3, .5, "z", stripes, snowRoof(650, [38, 36, 40]));
  // neighbours, lamps, a bench, trees
  izba(S, -17, -9.5, 7, 12, 2.8, "z", 651, { R: 2 }); izba(S, 9.5, 17, 7, 12, 2.9, "z", 653, { R: 2, trim2: [160, 70, 56] });
  const iron = flat([50, 50, 56]); lantern(S, -3, 5.6, 2.3, false, iron); lantern(S, 6.2, 5.8, 2.3, false, iron);
  const bench = planks(655, [130, 88, 54], 4, [40, 28, 20], true);
  S.prims.push(B([-6.4, .42, 5.6], [-4.6, .5, 6.05], bench, { ok: true }), B([-6.4, .5, 5.6], [-4.6, .57, 6.05], snowMat(656), { clean: true }), B([-6.3, 0, 5.65], [-6.15, .42, 6], bench), B([-4.85, 0, 5.65], [-4.7, .42, 6], bench));
  S.sprites.push({ x: -8.4, y: 0, z: 5.4, w: 3.2, h: 5.8, img: FIRS[1] }, { x: 8.4, y: 0, z: 5.6, w: 2.6, h: 5.6, img: BIRCH[0] }, { x: -11.6, y: 0, z: 1.4, w: 3.8, h: 6.8, img: FIRS[2] });
  forest(S, -30, 30, 20, 40, 14, 657);
  person(S, "dmitri", 2.6, 5.5); person(S, "ruhero", -.6, 4); person(S, "rufolkB", -5.6, 5.1);
  return S;
};
// the town library: tall bookcases, a frosty arched window, a green reading lamp, a tiled stove
STORY.library = () => {
  const S = base({ cam: { p: [0, 3.9, -7.4], pitch: .2, fr: 1 }, ao: .85, amb: [.34, .32, .32],
    fog: { c: [30, 26, 30], start: 30, k: .01, max: 0 }, grade: [1.03, 1, .97], bloom: { t: 185, a: .6 },
    dof: { near: 9.5, nearRamp: 3, far: 17, farRamp: 10, blur: 4 }, sky: () => [210, 220, 236] });
  const wall = woodWall(661), floor = planks(662, [130, 86, 56], 3), wood = planks(663, [96, 60, 38], 4), top = planks(664, [120, 80, 50], 6, [60, 40, 28], true), iron = flat([52, 50, 56]);
  S.prims.push(B([-8, -1, -4], [8, 0, 8.3], floor), B([-8, 0, 8], [8, 5.2, 8.3], wall), B([-8, 0, -4], [-7.4, 5.2, 8], wall), B([7.4, 0, -4], [8, 5.2, 8], wall));
  S.prims.push(B([-1.3, 1.1, 7.94], [1.3, 3.9, 8], frost(-1.3, 1.3, 1.1, 3.9, 665)), B([-1.45, .98, 7.8], [1.45, 1.1, 8], wood));
  S.lights.push({ p: [0, 2.5, 7.2], c: [.6, .66, .86], r: 9, soft: .6 });
  // bookcases full of books on both sides of the window
  for (const x0 of [-7.2, -4.4, 1.9, 4.7]) {
    S.prims.push(B([x0, 0, 7.4], [x0 + 2.5, 4.2, 8], wood));
    for (const y of [.35, 1.25, 2.15, 3.05]) { S.prims.push(B([x0, y - .06, 7.2], [x0 + 2.5, y, 7.4], wood)); bookRow(S, x0 + .06, x0 + 2.44, y, 7.25, 7.4, 666 + y * 10 + x0); }
  }
  // the reading table: green lamp, an open book, a pile of old newspapers, a globe
  S.prims.push(B([-2.2, .74, 3.8], [2.2, .84, 4.9], top));
  for (const [x, z] of [[-2.1, 3.9], [1.98, 3.9], [-2.1, 4.68], [1.98, 4.68]]) S.prims.push(B([x, 0, z], [x + .12, .74, z + .12], wood));
  S.prims.push(CYL(-1.2, 4.4, .12, .84, .88, brass(667)), CYL(-1.2, 4.4, .025, .88, 1.2, brass(667)), B([-1.5, 1.2, 4.25], [-.9, 1.34, 4.55], (p, n) => n[1] < -.5 ? { c: [255, 236, 170], e: [200, 180, 110] } : { c: [40, 120, 70], spec: true }));
  S.lights.push({ p: [-1.2, 1.1, 4.1], c: [1.3, 1.05, .6], r: 4, soft: .1 });
  S.prims.push(B([-.4, .84, 4.1], [.4, .87, 4.6], (p, n) => ({ c: Math.abs(p[0]) < .02 ? [150, 140, 120] : Math.floor(p[2] * T) % 2 && Math.abs(p[0]) > .08 ? [150, 146, 136] : [244, 238, 220] })));
  for (let i = 0; i < 4; i++) S.prims.push(B([.9, .84 + i * .05, 4.05 + (i % 2) * .04], [1.6, .89 + i * .05, 4.65], flat(i % 2 ? [226, 220, 200] : [236, 230, 212])));
  S.prims.push(CYL(5.4, 3.4, .25, 0, .06, wood), CYL(5.4, 3.4, .04, .06, .9, wood), CYL(5.4, 3.4, .36, .9, 1.5, (p, n) => ({ c: fbm(Math.atan2(n[2], n[0]) * 2, p[1] * 4, 668) > .55 ? [120, 150, 80] : [70, 110, 170], spec: true })));
  // a round tiled stove in the corner, a chair, a hanging lamp
  S.prims.push(CYL(-6.5, 6.4, .75, 0, 3.6, (p, n) => { const [u, v] = uvOf(p, n), ui = Math.floor(u * T), vi = Math.floor(v * T); if (((ui % 7) + 7) % 7 === 0 || ((vi % 7) + 7) % 7 === 0) return { c: [190, 184, 176] }; return { c: Math.abs(((ui % 7) + 7) % 7 - 3.5) + Math.abs(((vi % 7) + 7) % 7 - 3.5) < 2 ? [60, 96, 170] : [240, 236, 228] }; }, { clean: true }));
  S.prims.push(B([.7, .45, 5.25], [1.3, .52, 5.75], wood, { ok: true }), B([.7, .52, 5.68], [1.3, 1.3, 5.75], wood), B([.72, 0, 5.3], [.8, .45, 5.38], wood), B([1.2, 0, 5.3], [1.28, .45, 5.38], wood), B([.72, 0, 5.62], [.8, .45, 5.7], wood), B([1.2, 0, 5.62], [1.28, .45, 5.7], wood));
  S.prims.push(B([-7.4, 4.6, 3.2], [7.4, 4.8, 3.4], wood)); hangLamp(S, 3.2, 3.3, 3.4, 4.6, iron);
  S.prims.push(B([-2.4, 0, 1], [2.4, .02, 3.4], rugMat([60, 80, 120], [214, 190, 120], 669), { noShadow: true }));
  person(S, "olga", 2.7, 5); person(S, "ruhero", -1, 2.6);
  return S;
};
// Grandpa Lev's toy workshop: clocks stopped at twelve, shelves of dolls and horses, the workbench
STORY.workshop = () => {
  const S = base({ cam: { p: [0, 3.7, -7.4], pitch: .2, fr: 1 }, ao: .85, amb: [.3, .27, .26],
    fog: { c: [30, 22, 18], start: 30, k: .01, max: 0 }, grade: [1.05, 1, .94], bloom: { t: 175, a: .6 },
    dof: { near: 9.5, nearRamp: 3, far: 17, farRamp: 10, blur: 4 }, sky: () => [210, 220, 236] });
  const wall = logs(671, [152, 108, 70]), floor = planks(672, [160, 118, 76], 6), wood = planks(673, [110, 72, 46], 4), top = planks(674, [150, 104, 64], 6, [60, 40, 28], true), iron = flat([52, 50, 56]);
  S.prims.push(B([-8, -1, -4], [8, 0, 7.2], floor), B([-8, 0, 6.9], [8, 4, 7.2], wall), B([-8, 0, -4], [-7.4, 4, 6.9], wall), B([7.4, 0, -4], [8, 4, 6.9], wall));
  // clocks of every size on the back wall, all stopped at twelve
  for (const [x, y, r] of [[-3.6, 2.9, .34], [-2.6, 2.4, .24], [-1.8, 3.1, .3], [-.9, 2.5, .2], [-.1, 3.05, .36], [.9, 2.45, .26], [1.8, 3.1, .22]]) {
    const w = r + .07; S.prims.push(B([x - w, y - w, 6.82], [x + w, y + w, 6.9], clockFace(x, y, r, 12, 0, [120, 76, 46])));
  }
  // a tall grandfather clock with its weights still
  S.prims.push(B([3.0, 0, 6.3], [3.9, 2.9, 6.9], (p, n) => n[2] < -.5 && Math.abs(p[0] - 3.45) < .25 && p[1] > .5 && p[1] < 1.8 ? { c: [60, 40, 30] } : { c: jit([96, 56, 34], hash(Math.floor(p[0] * T), Math.floor(p[1] * T), 675), .06) }));
  S.prims.push(B([3.05, 2.1, 6.24], [3.85, 2.9, 6.3], clockFace(3.45, 2.5, .34, 12, 0, [96, 56, 34])));
  // the window with snow outside
  S.prims.push(B([4.6, 1.3, 6.84], [6.4, 2.8, 6.9], frost(4.6, 6.4, 1.3, 2.8, 676)), B([4.48, 1.18, 6.7], [6.52, 1.3, 6.9], wood)); S.lights.push({ p: [5.5, 2.1, 6.1], c: [.5, .58, .78], r: 7, soft: .6 });
  // shelves of matryoshkas, wooden horses and soldiers along the left wall
  S.prims.push(B([-7.4, 0, 4], [-6.6, 3.2, 6.9], wood));
  const cols = [[196, 40, 46], [52, 84, 160], [236, 196, 70], [60, 130, 80]];
  for (const [k, y] of [[0, .9], [1, 1.75], [2, 2.6]]) {
    S.prims.push(B([-6.6, y - .06, 4], [-5.9, y, 6.9], wood));
    for (let i = 0; i < 5; i++) {
      const z = 4.3 + i * .5;
      if (k === 1) { S.prims.push(B([-6.4, y, z - .14], [-6.2, y + .14, z + .14], flat([200, 150, 90])), B([-6.4, y + .14, z - .16], [-6.2, y + .26, z - .02], flat([200, 150, 90]))); }
      else matryoshka(S, -6.25, y, z, 2.2 - (i % 3) * .4, cols[(i + k) % 4]);
    }
  }
  // the workbench: a vice, tools, a half-painted doll, wood shavings
  S.prims.push(B([-4.6, .9, 4.2], [-.8, 1.02, 5.2], top, { ok: true }));
  for (const [x, z] of [[-4.5, 4.3], [-1, 4.3], [-4.5, 5], [-1, 5]]) S.prims.push(B([x, 0, z], [x + .12, .9, z + .12], wood));
  S.prims.push(B([-4.4, 1.02, 4.3], [-4, 1.22, 4.6], iron), B([-3.4, 1.02, 4.4], [-2.6, 1.05, 4.48], iron), B([-3.2, 1.02, 4.7], [-3.1, 1.12, 5], flat([150, 100, 60])));
  matryoshka(S, -1.7, 1.02, 4.6, 3, [236, 210, 170]);
  for (let i = 0; i < 9; i++) S.sprites.push({ x: -4.4 + hash(i, 1, 677) * 3.4, y: 0, z: 3.8 + hash(i, 2, 677) * .8, w: .3, h: .1, img: procSprite(6, 2, (x, y) => [226, 196, 140]), noShadow: true });
  // a rocking horse near the camera, a hanging lamp, a candle on the bench
  const horse = flat([214, 172, 120]);
  S.prims.push(B([2.6, 0, 1.4], [3.9, .08, 1.5], wood), B([2.6, 0, 2.1], [3.9, .08, 2.2], wood), B([2.8, 0, 1.55], [3.7, .5, 2.05], wood));
  S.prims.push(B([2.75, .5, 1.6], [3.75, .85, 2], horse), B([3.55, .85, 1.65], [3.8, 1.35, 1.95], horse), B([3.55, 1.1, 1.62], [3.62, 1.4, 1.98], flat([90, 56, 34])));
  S.prims.push(B([-7.4, 3.4, 3.2], [7.4, 3.6, 3.4], wood)); hangLamp(S, -2.4, 3.3, 2.5, 3.4, iron); candle(S, -1.2, 1.02, 4.4);
  person(S, "sonya", 1.4, 4.7); person(S, "ruhero", -.6, 2.6);
  return S;
};
// the frozen river at sunset: ice with a fishing hole, Fyodor's hut, the town on the far bank
STORY.river = () => {
  const sunDir = norm([-.75, .3, .5]);
  const S = base({ cam: { p: [0, 3.9, -11], pitch: .1, fr: 1.05 }, far: 300, ao: .75, amb: [.4, .42, .58],
    sun: { dir: sunDir, c: [1.45, 1, .7] },
    fog: { c: [236, 206, 196], start: 24, k: .014, max: .6 }, grade: [1.04, 1, .98], bloom: { t: 225, a: .5 },
    dof: { near: 10, nearRamp: 3, far: 22, farRamp: 26, blur: 4 },
    sky: d => { const y = clamp(d[1] * 2.2), sd = dot(d, sunDir); let c = mix([250, 200, 160], [110, 130, 190], Math.pow(y, .5)); c = [c[0] + 160 * Math.pow(Math.max(sd, 0), 40), c[1] + 110 * Math.pow(Math.max(sd, 0), 40), c[2] + 60 * Math.pow(Math.max(sd, 0), 40)]; return c; } });
  const ice = (p, n) => {
    const ui = Math.floor(p[0] * T), vi = Math.floor(p[2] * T), r = hash(ui, vi, 681), hole = Math.hypot(p[0] - 1.9, p[2] - 4.3);
    if (hole < .28) return { c: hole > .22 ? [180, 206, 226] : [16, 30, 44], spec: true };
    if (fbm(p[0] * .35, p[2] * .5, 682) > .58) return snowMat(683)(p, n);
    let c = mix([120, 158, 190], [196, 216, 232], fbm(p[0] * .8, p[2] * 1.6, 684));
    if (Math.abs(vnoise(p[0] * 1.2, p[2] * 1.2, 685) - .5) < .02) c = mix(c, [240, 248, 255], .7);
    return { c: jit(c, r, .03), spec: true };
  };
  S.prims.push(B([-40, -1, -8], [40, 0, 16], ice, { clean: true }), B([-40, -1, 16], [40, 1.1, 120], snowMat(686), { clean: true }));
  // the town on the far bank, with the clock tower and the church
  izba(S, -16, -10, 20, 24, 2.8, "x", 687, { lit: true }); izba(S, -4, 2, 21, 25, 3, "x", 689, { lit: true, trim2: [160, 70, 56] }); izba(S, 12, 18, 20, 24, 2.7, "x", 691, { lit: true });
  church(S, 7, 34, .75, 693);
  const stone = stoneBlocks(694, [176, 170, 160]);
  house(S, -8.4, -6, 26, 28.4, 9, 2.4, "z", stone, snowRoof(695, [52, 84, 160]));
  S.prims.push(B([-8.15, 6.6, 25.88], [-6.25, 8.5, 26.02], clockFace(-7.2, 7.55, .85, 12, 0, [80, 76, 72])));
  // Fyodor's fishing hut, a stool and a bucket by the hole, his rod stuck in the snow
  house(S, 3.6, 5.8, 6, 7.6, 1.8, .7, "x", planks(696, [120, 84, 54], 5), snowRoof(697));
  stool(S, 2.5, 4.9, planks(698, [130, 90, 56], 4));
  S.prims.push(CYL(1.2, 4.9, .16, 0, .32, flat([120, 130, 140])), B([2.12, 0, 4.42], [2.16, 1, 4.46], flat([110, 80, 50]), { ok: true }));
  // banks lined with trees
  forest(S, -34, 34, 17, 30, 18, 699);
  S.sprites.push({ x: -11, y: 0, z: 2.5, w: 3.6, h: 6.4, img: FIRS[1] }, { x: 10.6, y: 0, z: 3, w: 2.8, h: 5.8, img: BIRCH[1] }, { x: -14.6, y: 0, z: 6.5, w: 2.6, h: 5.4, img: BIRCH[0] });
  person(S, "fyodor", 1.2, 4.7); person(S, "misha", -2.4, 4.2); person(S, "ruhero", -.6, 3.3);
  return S;
};
// the clock tower on a stormy winter night; its stopped face glows over the square
STORY.tower = () => {
  const S = base({ cam: { p: [0, 3.2, -14], pitch: 0, fr: 1 }, ao: .85, amb: [.18, .21, .34],
    sun: { dir: norm([.3, .8, -.5]), c: [.3, .36, .56], soft: .08 },
    fog: { c: [60, 70, 104], start: 12, k: .05, max: .72 }, grade: [1, 1, 1.05], bloom: { t: 160, a: .7 },
    dof: { near: 13, nearRamp: 3, far: 26, farRamp: 16, blur: 4 }, sky: nightSky(701) });
  S.prims.push(B([-30, -1, -16], [30, 0, 120], snowMat(702, p => clamp(1 - Math.abs(p[0]) / 2.2) * clamp(1 - Math.abs(p[2] - 6) / 6))));
  const stone = stoneBlocks(703, [150, 146, 140]);
  const towerWall = (p, n) => {
    if (n[2] < -.5) { const dx = p[0], y = p[1];
      if (Math.abs(dx) < .7 && y < 2.2 + Math.sqrt(Math.max(0, .49 - dx * dx)) * .6) return Math.abs(dx) < .02 ? { c: [40, 28, 20] } : { c: jit([96, 60, 38], hash(Math.floor((dx + 1) * T / 3), 1, 704), .1) };
      if (Math.abs(dx) < .22 && Math.abs(y - 4.6) < .5) { const g = [255, 196, 116]; return { c: g, e: mul(g, .8) }; } }
    return stone(p, n);
  };
  S.prims.push(B([-2.2, 0, 10], [2.2, 11, 14.4], towerWall), B([-1.25, 6.35, 9.9], [1.25, 8.85, 10.02], clockFace(0, 7.6, 1.15, 12, 0, [70, 66, 64], .45)));
  for (const y of [3.5, 6, 9.2]) S.prims.push(B([-2.35, y, 9.85], [2.35, y + .12, 14.55], stone), B([-2.35, y + .12, 9.85], [2.35, y + .2, 10.3], snowMat(705), { clean: true }));
  S.lights.push({ p: [0, 7.6, 9.2], c: [.8, .7, .45], r: 7, soft: .5 });
  lantern(S, -1.3, 9.4, 2.4, true, flat([46, 44, 48]));
  // dark houses with warm windows, lamps along the street
  izba(S, -13, -5.2, 9, 14, 3, "x", 706, { lit: true }); izba(S, 5.2, 13, 9, 14, 2.9, "x", 708, { lit: true, trim2: [160, 70, 56] });
  const iron = flat([46, 44, 48]); lantern(S, -3.4, 5.8, 2.3, true, iron); lantern(S, 3.6, 6.4, 2.3, true, iron);
  S.sprites.push({ x: -8.6, y: 0, z: 4.4, w: 3.6, h: 6.4, img: FIRS[0] }, { x: 9, y: 0, z: 4.8, w: 3.2, h: 6, img: FIRS[2] }, { x: 15.6, y: 0, z: 8, w: 2.6, h: 5.6, img: BIRCH[1] });
  forest(S, -30, 30, 18, 34, 12, 710);
  person(S, "sonya", 1.8, 6.2); person(S, "dmitri", -2.6, 5.9); person(S, "ruhero", -.4, 4.6);
  return S;
};
// inside the clock: brass gears, hanging weights and the back of the great dial lit by dawn
STORY.clockroom = () => {
  const S = base({ cam: { p: [0, 3.8, -7.4], pitch: .18, fr: 1 }, ao: .85, amb: [.26, .26, .34],
    fog: { c: [30, 26, 34], start: 30, k: .01, max: 0 }, grade: [1.03, 1, .98], bloom: { t: 170, a: .7 },
    dof: { near: 9.5, nearRamp: 3, far: 17, farRamp: 10, blur: 4 }, sky: () => [250, 214, 170] });
  const wall = stoneBlocks(721, [150, 144, 136]), floor = planks(722, [120, 86, 58], 6), wood = planks(723, [100, 66, 42], 4), iron = flat([56, 54, 60]);
  S.prims.push(B([-8, -1, -4], [8, 0, 7.2], floor), B([-8, 0, 6.9], [8, 5.4, 7.2], wall), B([-8, 0, -4], [-7.4, 5.4, 6.9], wall), B([7.4, 0, -4], [8, 5.4, 6.9], wall));
  // the great dial seen from inside, glowing with the dawn behind it (the hands read backwards)
  S.prims.push(B([-1.85, .9, 6.8], [1.85, 4.6, 6.9], (p, n) => { const m = clockFace(0, 2.75, 1.75, 12, 0, [70, 64, 60])(p, n); return m.c[0] > 200 ? { c: [236, 200, 150], e: [120, 84, 46] } : m; }));
  S.lights.push({ p: [0, 2.75, 6.2], c: [1.2, .86, .5], r: 10, soft: .8 });
  // the mechanism: an iron frame with brass gears on shafts
  const gear = (p, n) => {
    const c0 = CUR.cyl, dx = p[0] - c0.x, dz = p[2] - c0.z, a = Math.atan2(dz, dx);
    if (Math.abs(n[1]) < .5) return { c: Math.floor((a / Math.PI + 1) * c0.r * 14) % 2 ? [204, 152, 64] : [86, 64, 38], spec: true };
    const rr = Math.hypot(dx, dz) / c0.r, spoke = Math.abs(((a / (Math.PI / 3)) % 1 + 1) % 1 - .5) > .38;
    return { c: rr < .22 || rr > .76 || spoke ? jit([216, 162, 74], hash(Math.floor(p[0] * T), Math.floor(p[2] * T), 724), .05) : [62, 48, 36], spec: true };
  };
  S.prims.push(B([-4.4, 0, 4.4], [-4.2, 1.3, 4.6], iron), B([-1.4, 0, 4.4], [-1.2, 1.3, 4.6], iron), B([-4.4, 0, 5.8], [-4.2, 1.3, 6], iron), B([-1.4, 0, 5.8], [-1.2, 1.3, 6], iron), B([-4.4, 1.3, 4.4], [-1.2, 1.4, 6], iron, { ok: true }));
  S.prims.push(CYL(-3.4, 5, .62, 1.4, 1.52, gear), CYL(-2.1, 5.3, .42, 1.4, 1.5, gear), CYL(-2.7, 4.9, .05, 1.4, 2.4, iron), CYL(-2.7, 4.9, .5, 2.4, 2.5, gear), CYL(-1.9, 5.4, .05, 1.4, 2.9, iron), CYL(-1.9, 5.4, .32, 2.9, 2.98, gear));
  // a beam across the room with the weights hanging on chains
  S.prims.push(B([-7.4, 4.2, 5.5], [7.4, 4.4, 5.8], wood));
  for (const [x, y0] of [[2.6, 1.3], [3.4, 2]]) S.prims.push(CYL(x, 5.65, .02, y0 + .7, 4.2, iron, { noShadow: true }), CYL(x, 5.65, .2, y0, y0 + .7, iron));
  // stairs up the left wall, a lantern on the floor, a toolbox
  for (let i = 0; i < 7; i++) S.prims.push(B([-7.4, 0, 1 + i * .5], [-6.2, .3 + i * .4, 1.5 + i * .5], wood));
  lantern(S, -2.6, 3.4, .45, true, iron);
  S.prims.push(B([4.4, 0, 3.6], [5.2, .36, 4.1], wood), B([4.5, .36, 3.8], [5.1, .42, 3.9], iron));
  person(S, "lev", 1.6, 4.3); person(S, "sonya", -.6, 4.9); person(S, "ruhero", .3, 2.7);
  return S;
};

// ---------- portraits: big busts in the same style (4-tone shading, coloured outline), with blink and talk frames ----------
const BW = 48, BH = 56;
function makeBust(o) {
  const R = new Array(BW * BH).fill(null), put = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < BW && y < BH) R[y * BW + x] = k; };
  const ell = (cx, cy, rx, ry, k, clip = () => true) => { for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if (dx * dx + dy * dy <= 1 && clip(x, y)) put(x, y, k); } };
  const inEll = (x, y, cx, cy, rx, ry) => { const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; return dx * dx + dy * dy <= 1; };
  const poly = (pts, k) => { for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { let ins = false; const px = x + .5, py = y + .5;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins; }
    if (ins) put(x, y, k); } };
  const mirror = pts => pts.map(([x, y]) => [48 - x, y]);
  const P = o.pal;
  // behind: long hair, hood
  if (o.hair === "long") poly([[10, 12], [38, 12], [41, 50], [7, 50]], "hair");
  if (o.hood) poly([[6, 12], [42, 12], [46, 48], [2, 48]], "hood");
  // shoulders, neck, ears, head
  poly([[1, 56], [3, 48], [9, 43.5], [18, 41.5], [30, 41.5], [39, 43.5], [45, 48], [47, 56]], "top");
  poly([[19, 30], [29, 30], [29.5, 43.5], [18.5, 43.5]], "neck");
  ell(11.8, 24.5, 2.2, 3.4, "skin"); ell(36.2, 24.5, 2.2, 3.4, "skin");
  ell(24, 20, 12, 12.6, "skin");
  poly([[12.2, 20], [35.8, 20], [35, 27], [31, 33.5], [27, 36.4], [21, 36.4], [17, 33.5], [13, 27]], "skin");
  // clothes
  if (o.outfit === "apron") {
    poly([[17.5, 41], [24, 45], [30.5, 41], [31.5, 44], [24, 48], [16.5, 44]], "collar");
    poly([[14.5, 45], [18.5, 44], [19.5, 56], [15.5, 56]], "apron"); poly(mirror([[14.5, 45], [18.5, 44], [19.5, 56], [15.5, 56]]), "apron");
    poly([[18.5, 50.5], [29.5, 50.5], [29.5, 56], [18.5, 56]], "apron");
  } else if (o.outfit === "vest") {
    poly([[21, 41.5], [27, 41.5], [24, 47.5]], "neck");
    const v = [[1, 56], [3, 48], [9, 43.5], [17.5, 42], [21.5, 48], [20.5, 56]]; poly(v, "vest"); poly(mirror(v), "vest");
    put(24, 50, "button"); put(24, 53, "button");
  } else if (o.outfit === "kimono") {
    poly([[30, 41.5], [27, 41.5], [22.5, 49.5], [24.5, 51.5]], "under");
    poly([[17.5, 41.5], [20.5, 41.5], [27.5, 52.5], [24.5, 54]], "accent");
    poly([[1, 53], [47, 53], [47, 56], [1, 56]], "sash");
  } else if (o.outfit === "armor") {
    poly([[16.5, 40.5], [31.5, 40.5], [32.5, 44.5], [15.5, 44.5]], "metal2");
    poly([[13.5, 44.5], [34.5, 44.5], [33.5, 56], [14.5, 56]], "armor");
    ell(8.5, 47.5, 7.8, 5.6, "armor"); ell(39.5, 47.5, 7.8, 5.6, "armor");
    for (const [x, y] of [[5, 47], [9, 45], [39, 45], [43, 47]]) put(x, y, "rivet");
    poly([[22, 47], [26, 47], [25, 52], [23, 52]], "accent");
  } else if (o.outfit === "robe") {
    poly([[16, 39.5], [32, 39.5], [33.5, 44.5], [24, 46.5], [14.5, 44.5]], "accent");
    poly([[23, 46], [25, 46], [25, 56], [23, 56]], "accent");
    ell(24, 50.5, 2.6, 2.6, "medal");
  } else if (o.outfit === "tunic") {
    poly([[3, 41], [45, 41], [47, 51], [1, 51]], "hood"); poly([[18, 40], [30, 40], [29, 44], [19, 44]], "hood");
    for (let i = 0; i <= 14; i++) { put(13 + i * 1.2, 46 + i * .7, "strap"); put(13 + i * 1.2, 47 + i * .7, "strap"); }
  }
  // hair in front
  const capY = o.hair === "short" ? 11 : 15;
  if (o.hood) {
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (inEll(x, y, 24, 19.5, 16, 18) && !inEll(x, y, 24, 23.5, 10.6, 13.4) && y < 42) put(x, y, "hood");
    for (let x = 15; x <= 33; x++) for (let y = 10; y <= 13 + ((x * 7) % 3); y++) if (inEll(x, y, 24, 23.5, 10.6, 13.4)) put(x, y, "hair");
  } else if (o.hair === "cap") {
    ell(24, 14, 13.6, 8.4, "cap", (x, y) => y <= 14);
    poly([[10.5, 13.5], [37.5, 13.5], [39, 17.2], [9, 17.2]], "brim");
    poly([[11.6, 17], [14.4, 17], [14.4, 24], [12.4, 23]], "hair"); poly(mirror([[11.6, 17], [14.4, 17], [14.4, 24], [12.4, 23]]), "hair");
  } else if (o.hair === "helmet") {
    ell(24, 16.5, 13.8, 11.6, "metal", (x, y) => y <= 16);
    for (let x = 10; x <= 38; x++) { put(x, 15, "metal2"); put(x, 16, "metal2"); }
    poly([[23, 16], [25, 16], [25, 27.5], [23, 27.5]], "metal");
    poly([[10.4, 16.5], [14.4, 16.5], [14.8, 28.5], [11.4, 26.5]], "metal"); poly(mirror([[10.4, 16.5], [14.4, 16.5], [14.8, 28.5], [11.4, 26.5]]), "metal");
    for (const x of [12, 18, 30, 36]) put(x, 15, "rivet");
  } else {
    // a cap of hair with a fringe of pointed locks
    const fringe = x => {
      if (o.hair === "long") return 16.5;                                          // straight-cut fringe
      if (o.hair === "short") return 12 + (x % 3 === 0 ? 1 : 0);
      return 13 + (x - 13) * .22 + Math.max(0, Math.sin((x - 12) * .9)) * 3.2;      // side-swept locks
    };
    const side = o.hair === "long" ? 46 : o.hair === "short" ? 23 : 31;
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (!inEll(x, y, 24, 17.5, 13.6, 12.2) && !(y > 17 && y <= side && (x <= 13.4 || x >= 34.6) && x >= 9.8 && x <= 38.2)) continue;
      if (y <= fringe(x) || x <= 13.4 || x >= 34.6) if (y <= side) put(x, y, "hair");
    }
    if (o.hair === "long") { poly([[10, 18], [14.6, 18], [15, 47], [10.5, 45]], "hair"); poly(mirror([[10, 18], [14.6, 18], [15, 47], [10.5, 45]]), "hair"); }
    if (o.hair === "short") for (let x = 14; x <= 34; x++) if ((x % 4) < 2) put(x, 5, "hair");  // short tufts on top
  }
  if (o.bun) { ell(24, 4.2, 6.4, 4.2, "bun"); for (let x = 19; x <= 29; x++) if (R[7 * BW + x]) { put(x, 7, "tie"); put(x, 8, "tie"); } }
  if (o.beard) {
    for (let y = 26; y < 40; y++) for (let x = 12; x < 37; x++) {
      const k = R[y * BW + x]; if (k !== "skin") continue;
      const inMouth = Math.abs(x - 24) <= 3 && y >= 31 && y <= 33, cheek = Math.abs(x - 24) < 7.5 && y < 29;
      if (!inMouth && !cheek && (y >= 29 || Math.abs(x - 24) > 8)) put(x, y, "beard");
    }
    for (let x = 20; x <= 28; x++) put(x, 30, "beard");
  }
  if (o.mustache) for (let x = 19; x <= 29; x++) { if (R[30 * BW + x] === "skin") put(x, 30, "beard"); if (x >= 20 && x <= 28 && R[31 * BW + x] === "skin") put(x, 31, "beard"); }
  if (o.flaps) { const f = [[9.4, 15], [13.8, 15], [14, 31], [12, 33], [9.6, 30]]; poly(f, "cap"); poly(mirror(f), "cap"); }  // a fur hat's ear flaps

  // shading: rounded forms lit from the upper left, warm light and cool shadow
  const span = {}; for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const k = R[y * BW + x]; if (!k) continue; const s = span[k + y] || (span[k + y] = [x, x]); s[0] = Math.min(s[0], x); s[1] = Math.max(s[1], x); }
  const isHairy = k => k === "hair" || k === "cap" || k === "brim" || k === "metal" || k === "metal2" || k === "hood" || k === "bun";
  const px = new Array(BW * BH).fill(null);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const k = R[y * BW + x]; if (!k) continue;
    const base = P[k] || (k === "neck" ? P.skin : null); const [a, b] = span[k + y], t = b > a ? (x - a) / (b - a) : .5;
    let tone;
    if (k === "skin" || k === "neck") tone = t < .18 ? 1.08 : t > .92 ? .72 : t > .78 ? .86 : 1;
    else tone = t < .2 ? 1.16 : t > .9 ? .6 : t > .72 ? .76 : 1;
    if ((k === "skin") && (isHairy(R[(y - 1) * BW + x]) || isHairy(R[(y - 2) * BW + x]))) tone *= .8;        // shadow under fringe / helmet
    if (k === "neck") tone *= y < 39 ? .7 : .85;                                                               // under the chin
    if ((k === "hair" || k === "bun" || k === "beard") && (x + (y >> 1)) % 4 === 0) tone *= .84;                 // locks
    if ((k === "hair" || k === "bun") && y >= 8 && y <= 10 && t > .18 && t < .55 && (x + y) % 3) tone = 1.32;   // shine band
    if ((k === "armor" || k === "metal") && t > .1 && t < .26) tone = 1.3;                                       // metal shine
    if (k === "bun") { const r = Math.hypot(x + .5 - 24, (y + .5 - 4.2) * 1.5); tone = r < 2.5 ? 1.15 : (x + y) % 3 === 0 ? .82 : 1; if (x > 27) tone *= .8; }
    if (k === "hood" && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const q = R[(y + dy) * BW + x + dx]; return q === "skin" || q === "hair"; })) tone = .5;
    if ((k === "top" || k === "apron" || k === "hood" || k === "vest") && y > 44 && x % 4 === 1) tone *= .88;       // cloth folds
    const warm = tone > 1 ? [1.04, 1, .93] : tone < 1 ? [.93, .97, 1.08] : [1, 1, 1];
    const c = base || [255, 0, 255];
    px[y * BW + x] = [Math.min(255, c[0] * tone * warm[0]), Math.min(255, c[1] * tone * warm[1]), Math.min(255, c[2] * tone * warm[2])];
  }
  // face
  const at = (pix, x, y, c) => { if (R[y * BW + x]) pix[y * BW + x] = c; };
  const skin = P.skin, lash = mix(mul(P.hair || [60, 40, 30], .45), [40, 26, 30], .5), brow = mul(P.brow || P.hair || [80, 56, 40], .62);
  const iris = P.eye || [70, 90, 60], sclera = [244, 240, 234], female = !!o.female;
  const face = (pix, mode) => {
    for (const side of [0, 1]) {
      const x0 = side ? 28 : 16, outer = side ? x0 + 4 : x0, inner = side ? x0 : x0 + 4;
      if (mode === "blink") { for (let i = 0; i < 5; i++) at(pix, x0 + i, 25, lash); continue; }
      for (let i = 0; i < 5; i++) at(pix, x0 + i, 23, lash);
      if (o.stern) { at(pix, inner, 24, lash); }
      if (female) { at(pix, side ? outer + 1 : outer - 1, 23, lash); at(pix, side ? outer + 1 : outer - 1, 22, lash); }
      at(pix, x0, 24, sclera); at(pix, x0 + 4, 24, sclera); at(pix, x0, 25, sclera); at(pix, x0 + 4, 25, sclera);
      for (let i = 1; i <= 3; i++) { at(pix, x0 + i, 24, iris); at(pix, x0 + i, 25, mul(iris, .78)); }
      at(pix, x0 + 2, 25, mul(iris, .35)); at(pix, x0 + 2, 24, mul(iris, .55)); at(pix, x0 + 1, 24, [255, 255, 255]);
      for (let i = 1; i <= 3; i++) at(pix, x0 + i, 26, mul(skin, .86));
    }
    // eyebrows
    if (o.hair !== "helmet" || true) for (const side of [0, 1]) {
      const x0 = side ? 28 : 15;
      for (let i = 0; i < 6; i++) {
        const xx = side ? x0 + i : x0 + i, inner = side ? i === 0 || i === 1 : i === 4 || i === 5, outerEnd = side ? i === 5 : i === 0;
        let y = 20 + (outerEnd ? 1 : 0) + (o.stern && inner ? 1 : 0);
        if (R[y * BW + xx] === "skin") at(pix, xx, y, brow);
        if (!female && R[(y - 1) * BW + xx] === "skin") at(pix, xx, y - 1, brow);
      }
    }
    // nose
    at(pix, 25, 27, mul(skin, .86)); at(pix, 25, 28, mul(skin, .8)); at(pix, 24, 29, mul(skin, .74)); at(pix, 23, 27, mix(skin, [255, 255, 255], .15));
    // mouth
    const lip = P.mouth || [196, 104, 96];
    if (mode === "talk") { for (let x = 22; x <= 26; x++) at(pix, x, 32, [92, 40, 40]); for (let x = 23; x <= 25; x++) { at(pix, x, 33, [150, 64, 62]); at(pix, x, 31, mul(lip, .9)); } }
    else if (o.mouth === "grin") { for (let x = 21; x <= 27; x++) at(pix, x, 32, [92, 40, 40]); for (let x = 22; x <= 26; x++) at(pix, x, 32, [246, 240, 230]); at(pix, 21, 31, mul(skin, .8)); at(pix, 27, 31, mul(skin, .8)); for (let x = 22; x <= 26; x++) at(pix, x, 33, mul(lip, .8)); }
    else if (o.stern) { for (let x = 21; x <= 27; x++) at(pix, x, 33, mul(lip, .7)); }
    else { for (let x = 22; x <= 26; x++) at(pix, x, 32, mul(lip, .82)); at(pix, 21, 31, mul(skin, .8)); at(pix, 27, 31, mul(skin, .8)); for (let x = 23; x <= 25; x++) at(pix, x, 33, mix(skin, lip, .3)); }
    if (female) for (const [x0, x1] of [[15, 18], [30, 33]]) for (let x = x0; x <= x1; x++) at(pix, x, 29, mix(skin, [244, 120, 124], .32));
    if (o.freckles) for (const [x, y] of [[17, 28], [19, 29], [29, 29], [31, 28], [18, 27], [30, 27]]) at(pix, x, y, mul(skin, .84));
    if (o.scar) for (let i = 0; i <= 8; i++) at(pix, 30 + Math.round(i * .4), 19 + i, mix(mul(skin, .75), [200, 90, 90], .3));
  };
  const outline = pix => {
    const out = pix.slice();
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (pix[y * BW + x]) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < BW && Y < BH ? pix[Y * BW + X] : null; }).filter(Boolean);
      if (nb.length) { const c = nb[0]; out[y * BW + x] = [c[0] * .32, c[1] * .27, c[2] * .32]; }
    }
    return out;
  };
  const frame = mode => { const pix = px.slice(); face(pix, mode); return { w: BW, h: BH, px: outline(pix) }; };
  return { base: frame("base"), blink: frame("blink"), talk: frame("talk") };
}
// the cast, following the colours in arte.js
const BUSTS = {
  rosie: { female: true, hair: "side", bun: true, freckles: true, outfit: "apron", pal: { skin: hex("#f2c4a0"), hair: hex("#c4492c"), bun: hex("#c4492c"), tie: [90, 120, 170], top: hex("#4d7a9c"), collar: [246, 242, 232], apron: [242, 234, 216], eye: [70, 120, 70] } },
  tobias: { hair: "cap", beard: true, mouth: "grin", outfit: "vest", pal: { skin: hex("#c98f62"), hair: hex("#5a3a24"), beard: hex("#5a3a24"), cap: hex("#3f8a3a"), brim: [46, 104, 44], top: hex("#e9dcc0"), vest: hex("#7a4e2a"), button: [220, 190, 110], eye: [80, 56, 36] } },
  mei: { female: true, hair: "long", outfit: "kimono", pal: { skin: hex("#f4d2b4"), hair: hex("#1f1b2e"), brow: [60, 50, 80], top: hex("#7a4fd1"), accent: hex("#f2c230"), under: [246, 240, 230], sash: hex("#f2c230"), eye: [86, 60, 120] } },
  bram: { hair: "helmet", stern: true, scar: true, outfit: "armor", pal: { skin: hex("#d6a27e"), hair: hex("#3b2f2a"), metal: hex("#9aa3ad"), metal2: [120, 128, 140], armor: [168, 176, 188], rivet: [230, 230, 236], accent: [150, 40, 46], top: [120, 40, 46], eye: [80, 70, 60] } },
  marcus: { hair: "short", beard: true, outfit: "robe", pal: { skin: hex("#e0b08c"), hair: hex("#b9b9b9"), beard: hex("#c8c8c8"), brow: [150, 150, 150], top: hex("#7a2f2a"), accent: hex("#e0b440"), medal: [236, 200, 90], eye: [70, 80, 100] } },
  iris: { female: true, hair: "side", bun: true, outfit: "robe", pal: { skin: hex("#e9c3a3"), hair: hex("#3a2a20"), bun: hex("#3a2a20"), tie: [216, 192, 112], top: hex("#2f5a6b"), accent: hex("#d8c070"), medal: [240, 220, 140], eye: [70, 100, 60] } },
  pip: { hair: "short", freckles: true, mouth: "grin", outfit: "vest", pal: { skin: hex("#e3b48c"), hair: hex("#d9a441"), top: hex("#e7dcc4"), vest: hex("#6a8f3a"), button: [220, 190, 110], eye: [70, 110, 160] } },
  ola: { female: true, hair: "cap", mouth: "grin", outfit: "vest", pal: { skin: hex("#b97c55"), hair: hex("#d6d0c8"), cap: hex("#1f3557"), brim: [24, 40, 66], top: [240, 236, 224], vest: hex("#24406b"), button: [226, 196, 96], eye: [60, 100, 120] } },
  lena: { female: true, hair: "long", freckles: true, outfit: "apron", pal: { skin: hex("#f2c4a0"), hair: hex("#e09a3a"), top: hex("#8a4e7a"), collar: [246, 242, 232], apron: [242, 234, 216], eye: [90, 130, 70] } },
  ana: { female: true, hood: true, hair: "hood", outfit: "robe", pal: { skin: hex("#a8724e"), hair: hex("#1d1410"), hood: hex("#e8e2d4"), top: [236, 230, 218], accent: hex("#d4a840"), medal: [240, 220, 140], eye: [70, 50, 40] } },
  hero: { hood: true, hair: "hood", outfit: "tunic", pal: { skin: [238, 196, 158], hair: [120, 84, 54], hood: [72, 96, 136], top: [146, 108, 70], strap: [104, 70, 44], eye: [60, 80, 120] } },
  // the people of Белоречье, in the Russian story
  vera: { female: true, hood: true, hair: "hood", outfit: "apron", pal: { skin: hex("#eec3a4"), hair: [214, 210, 204], hood: hex("#c23b32"), top: hex("#5a6e9c"), collar: [246, 242, 232], apron: [240, 232, 214], brow: [170, 166, 160], eye: [80, 100, 130] } },
  ivan: { hair: "cap", beard: true, mouth: "grin", outfit: "robe", pal: { skin: hex("#dba882"), hair: hex("#6b5a4a"), beard: hex("#7a6a5a"), cap: hex("#1f2f52"), brim: [22, 26, 34], top: hex("#2a3c66"), accent: [226, 190, 90], medal: [236, 200, 90], eye: [70, 80, 100] } },
  katya: { female: true, hair: "long", freckles: true, mouth: "grin", outfit: "apron", pal: { skin: hex("#f5d0b4"), hair: hex("#e3c27a"), top: hex("#b8323a"), collar: [246, 242, 232], apron: [244, 236, 220], eye: [70, 110, 160] } },
  dmitri: { hair: "cap", flaps: true, mustache: true, stern: true, outfit: "tunic", pal: { skin: hex("#e2b08a"), hair: hex("#4a3424"), beard: hex("#4a3424"), cap: [124, 120, 114], brim: [98, 94, 90], top: hex("#3e5a3c"), hood: [52, 74, 50], strap: [70, 46, 30], eye: [70, 70, 60] } },
  olga: { female: true, hair: "side", bun: true, outfit: "robe", pal: { skin: hex("#f0cfb4"), hair: hex("#7a4a34"), bun: hex("#7a4a34"), tie: [236, 220, 180], top: hex("#6b2f4a"), accent: [240, 232, 214], medal: [220, 190, 110], eye: [80, 90, 70] } },
  misha: { hair: "cap", flaps: true, freckles: true, mouth: "grin", outfit: "vest", pal: { skin: hex("#f0c8a4"), hair: hex("#c88a3a"), cap: [140, 96, 60], brim: [112, 76, 48], top: hex("#3a6fb0"), vest: [44, 84, 140], button: [220, 190, 110], eye: [70, 110, 150] } },
  fyodor: { hair: "cap", flaps: true, beard: true, mouth: "grin", outfit: "vest", pal: { skin: hex("#d49a74"), hair: hex("#8a4a2a"), beard: hex("#8a4a2a"), cap: [72, 68, 74], brim: [58, 54, 60], top: hex("#34465e"), vest: [96, 74, 52], button: [180, 170, 150], eye: [70, 90, 110] } },
  sonya: { female: true, hair: "side", outfit: "vest", pal: { skin: hex("#f2cdb0"), hair: hex("#2c2230"), top: [236, 228, 212], vest: hex("#7a4a2a"), button: [230, 200, 110], eye: [90, 70, 50] } },
  lev: { hair: "short", beard: true, outfit: "apron", pal: { skin: hex("#e8bc9c"), hair: [236, 234, 230], beard: [240, 238, 234], brow: [210, 208, 204], top: hex("#8a3a30"), collar: [240, 232, 214], apron: [124, 92, 60], eye: [80, 110, 140] } },
  ruhero: { hair: "short", outfit: "tunic", pal: { skin: hex("#b07a52"), hair: hex("#2a1c16"), top: hex("#c0703a"), hood: [64, 128, 96], strap: [104, 70, 44], eye: [60, 44, 36] } },
};

// ---------- public API ----------
const HD_VER = "7", RW = 448, RH = 196, mem = {}, busy = {};
let worker = null, workerDead = false, chain = Promise.resolve();
function toURL(img, scale = 1) {
  const c = document.createElement("canvas"); c.width = img.w; c.height = img.h; const x = c.getContext("2d"), d = x.createImageData(img.w, img.h);
  img.px.forEach((v, i) => { if (v) { d.data[i * 4] = v[0]; d.data[i * 4 + 1] = v[1]; d.data[i * 4 + 2] = v[2]; d.data[i * 4 + 3] = 255; } });
  x.putImageData(d, 0, 0); return c.toDataURL("image/png");
}
function viaWorker(name) {
  if (workerDead || typeof Worker === "undefined") return Promise.resolve(null);
  return new Promise(ok => {
    try { if (!worker) worker = new Worker("hd2d-worker.js"); } catch { workerDead = true; return ok(null); }
    const fail = () => { workerDead = true; worker = null; ok(null); };
    worker.onmessage = e => ok(e.data); worker.onerror = fail; worker.onmessageerror = fail;
    worker.postMessage({ name, w: RW, h: RH });
  });
}
async function produce(name) {
  const key = "xib-hd:" + HD_VER + ":" + name;
  try { const v = localStorage.getItem(key); if (v) return v; } catch {}
  let res = await viaWorker(name);
  if (!res) { const S = STORY[name](); const r = await renderAsync(S, RW, RH); res = { col: r.col, dep: r.dep, P: { dof: S.dof, bloom: S.bloom, grade: S.grade } }; }
  const url = finish(res.P, RW, RH, res.col, res.dep, 2).fx.toDataURL("image/jpeg", .85);
  try { localStorage.setItem(key, url); } catch {}
  return url;
}
// where a point of the world lands in the picture, as fractions of its width and height
function project(S, p) {
  const c = S.cam, f = (c.fr || 1.17), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), v = [p[0] - c.p[0], p[1] - c.p[1], p[2] - c.p[2]];
  const fw = -sp * v[1] + cp * v[2], dx = v[0] / fw, dy = (cp * v[1] + sp * v[2]) / fw;
  return [.5 + dx * f, .5 - dy * f * RW / RH];
}
const API = {
  STORY, BUSTS, makeBust, renderSync, renderAsync, finish, checkFloating,
  // finished picture of a place, or null while it is still being drawn
  scene: name => mem[name] || null,
  load(name) {
    if (!STORY[name]) return Promise.resolve(null);
    if (mem[name]) return Promise.resolve(mem[name]);
    return busy[name] || (busy[name] = chain = chain.then(() => produce(name)).then(u => { mem[name] = u; return u; }, () => null));
  },
  // where each person stands in the picture: { who: { x, y (feet), h } } as fractions of the picture
  spots(name) {
    if (!STORY[name]) return {};
    if (!mem["p:" + name]) { const S = STORY[name](), out = {};
      for (const [who, [x, z, k]] of Object.entries(S.people || {})) { const a = project(S, [x, 0, z]), b = project(S, [x, CH / CT * k, z]); out[who] = { x: a[0], y: a[1], h: a[1] - b[1] }; }
      mem["p:" + name] = out; }
    return mem["p:" + name];
  },
  ratio: RW / RH,
  // places where snow falls in front of the picture
  snowy: name => ["station", "snowmarket", "ratusha", "tower"].includes(name),
  prefetch(names) { names.forEach(n => API.load(n)); },
  bust(who) {
    if (!BUSTS[who]) return null;
    if (!mem["b:" + who]) { const b = makeBust(BUSTS[who]); mem["b:" + who] = { base: toURL(b.base), blink: toURL(b.blink), talk: toURL(b.talk) }; }
    return mem["b:" + who];
  },
};
try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith("xib-hd:") && !k.startsWith("xib-hd:" + HD_VER + ":")) localStorage.removeItem(k); } } catch {}
G.XIB_HD = API;
})();
