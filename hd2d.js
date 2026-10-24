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
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// the cast, following the colours in arte.js
const BUSTS = {
  rosie: { female: true, hair: "side", bun: true, freckles: true, outfit: "apron", pal: { skin: hex("#f2c4a0"), hair: hex("#c4492c"), bun: hex("#c4492c"), tie: [90, 120, 170], top: hex("#4d7a9c"), collar: [246, 242, 232], apron: [242, 234, 216], eye: [70, 120, 70] } },
  tobias: { hair: "cap", beard: true, mouth: "grin", outfit: "vest", pal: { skin: hex("#c98f62"), hair: hex("#5a3a24"), beard: hex("#5a3a24"), cap: hex("#3f8a3a"), brim: [46, 104, 44], top: hex("#e9dcc0"), vest: hex("#7a4e2a"), button: [220, 190, 110], eye: [80, 56, 36] } },
  mei: { female: true, hair: "long", outfit: "kimono", pal: { skin: hex("#f4d2b4"), hair: hex("#1f1b2e"), brow: [60, 50, 80], top: hex("#7a4fd1"), accent: hex("#f2c230"), under: [246, 240, 230], sash: hex("#f2c230"), eye: [86, 60, 120] } },
  bram: { hair: "helmet", stern: true, scar: true, outfit: "armor", pal: { skin: hex("#d6a27e"), hair: hex("#3b2f2a"), metal: hex("#9aa3ad"), metal2: [120, 128, 140], armor: [168, 176, 188], rivet: [230, 230, 236], accent: [150, 40, 46], top: [120, 40, 46], eye: [80, 70, 60] } },
  marcus: { hair: "short", beard: true, outfit: "robe", pal: { skin: hex("#e0b08c"), hair: hex("#b9b9b9"), beard: hex("#c8c8c8"), brow: [150, 150, 150], top: hex("#7a2f2a"), accent: hex("#e0b440"), medal: [236, 200, 90], eye: [70, 80, 100] } },
  hero: { hood: true, hair: "hood", outfit: "tunic", pal: { skin: [238, 196, 158], hair: [120, 84, 54], hood: [72, 96, 136], top: [146, 108, 70], strap: [104, 70, 44], eye: [60, 80, 120] } },
};

// ---------- public API ----------
const HD_VER = "2", RW = 448, RH = 196, mem = {}, busy = {};
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
const API = {
  STORY, BUSTS, makeBust, renderSync, renderAsync, finish, checkFloating,
  // finished picture of a place, or null while it is still being drawn
  scene: name => mem[name] || null,
  load(name) {
    if (!STORY[name]) return Promise.resolve(null);
    if (mem[name]) return Promise.resolve(mem[name]);
    return busy[name] || (busy[name] = chain = chain.then(() => produce(name)).then(u => { mem[name] = u; return u; }, () => null));
  },
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
