// Pixel art for the story: character portraits and scene backdrops, drawn in code on tiny canvases
// (32×40 portraits, 240×105 scenes in layers) and scaled up with sharp pixels. Nothing to download.
//
// To create a character, add an entry to CHARS: pick colors and one of the styles below.
//   hair:   bun · cap · long · helmet · short
//   outfit: apron · vest · kimono · armor · robe
//   face:   smile · grin · calm · stern
// To create a scene, add an entry to SCENES with up to three painters (back, mid, front) that draw on a
// 240×105 grid with g.p(x, y, w, h, color) and the helpers in kit(), plus optional lights and rays.
(function () {
  const CHARS = {
    rosie: { skin: "#f2c4a0", hair: "#c4492c", hairLight: "#e8714e", style: "bun", outfit: "apron", cloth: "#4d7a9c", face: "smile", blush: true },
    tobias: { skin: "#c98f62", hair: "#5a3a24", hairLight: "#7a5234", style: "cap", cap: "#3f8a3a", outfit: "vest", cloth: "#e9dcc0", vest: "#7a4e2a", face: "grin", beard: true },
    mei: { skin: "#f4d2b4", hair: "#1f1b2e", hairLight: "#4a4370", style: "long", outfit: "kimono", cloth: "#7a4fd1", accent: "#f2c230", face: "smile", blush: true },
    bram: { skin: "#d6a27e", hair: "#3b2f2a", hairLight: "#5a4a40", style: "helmet", metal: "#9aa3ad", outfit: "armor", cloth: "#9aa3ad", face: "stern", scar: true },
    marcus: { skin: "#e0b08c", hair: "#b9b9b9", hairLight: "#e2e2e2", style: "short", outfit: "robe", cloth: "#7a2f2a", accent: "#e0b440", face: "calm", beard: true },
    iris: { skin: "#e9c3a3", hair: "#3a2a20", hairLight: "#5e4636", style: "bun", outfit: "robe", cloth: "#2f5a6b", accent: "#d8c070", face: "smile", blush: true },
    pip: { skin: "#e3b48c", hair: "#d9a441", hairLight: "#f0c766", style: "short", outfit: "vest", cloth: "#e7dcc4", vest: "#6a8f3a", face: "grin" },
    ola: { skin: "#b97c55", hair: "#d6d0c8", hairLight: "#f0ece6", style: "cap", cap: "#1f3557", outfit: "vest", cloth: "#f0ece0", vest: "#24406b", face: "grin" },
    lena: { skin: "#f2c4a0", hair: "#e09a3a", hairLight: "#f2bf6a", style: "long", outfit: "apron", cloth: "#8a4e7a", accent: "#f4efe6", face: "smile", blush: true },
    ana: { skin: "#a8724e", hair: "#1d1410", hairLight: "#3a2a22", style: "long", outfit: "robe", cloth: "#e8e2d4", accent: "#d4a840", face: "calm" },
  };
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
    return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
  };
  function canvas(w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d");
    const p = (X, Y, W, H, col) => { x.fillStyle = col; x.fillRect(X, Y, W, H); };
    const clr = (X, Y, W = 1, H = 1) => x.clearRect(X, Y, W, H);
    return { c, x, p, clr };
  }

  function portrait(s) {
    const { c, p, clr } = canvas(32, 40), O = "#2a1d1a", skinD = shade(s.skin, -.18), hairD = shade(s.hair, -.3), clothD = shade(s.cloth, -.25);
    // hair that falls behind the shoulders
    if (s.style === "long") { p(6, 7, 20, 26, O); p(7, 8, 18, 25, s.hair); p(7, 26, 18, 7, hairD); }
    // body and neck
    p(3, 31, 26, 9, O); p(4, 32, 24, 8, s.cloth); p(4, 38, 24, 2, clothD);
    p(13, 24, 6, 8, O); p(14, 24, 4, 8, s.skin); p(14, 30, 4, 1, skinD);
    // outfit
    if (s.outfit === "apron") { p(10, 33, 12, 7, "#f4efe6"); p(11, 31, 1, 2, "#f4efe6"); p(20, 31, 1, 2, "#f4efe6"); p(13, 36, 6, 2, "#e2d9c8"); }
    if (s.outfit === "vest") { p(4, 32, 7, 8, s.vest); p(21, 32, 7, 8, s.vest); p(15, 33, 2, 1, clothD); p(15, 36, 2, 1, clothD); }
    if (s.outfit === "kimono") { for (let i = 0; i < 4; i++) { p(11 + i * 2, 31 + i * 2, 2, 2, "#f4efe6"); p(19 - i * 2, 31 + i * 2, 2, 2, clothD); } p(4, 37, 24, 2, s.accent); }
    if (s.outfit === "armor") { p(1, 30, 8, 5, O); p(2, 31, 6, 3, s.metal); p(23, 30, 8, 5, O); p(24, 31, 6, 3, s.metal); p(4, 35, 24, 1, clothD); for (const x of [7, 12, 19, 24]) p(x, 33, 1, 1, "#e8edf2"); }
    if (s.outfit === "robe") { p(12, 31, 8, 2, s.accent); p(13, 33, 6, 1, s.accent); p(9, 35, 14, 1, s.accent); p(15, 36, 2, 2, s.accent); }
    // head with rounded corners, ears
    p(8, 9, 16, 17, O); p(9, 10, 14, 15, s.skin); p(9, 23, 14, 2, skinD);
    clr(8, 9); clr(23, 9); clr(8, 25); clr(23, 25); p(9, 10, 1, 1, O); p(22, 10, 1, 1, O); p(9, 24, 1, 1, O); p(22, 24, 1, 1, O);
    p(6, 15, 2, 5, O); p(7, 16, 1, 3, s.skin); p(24, 15, 2, 5, O); p(24, 16, 1, 3, s.skin);
    // face
    const brow = s.face === "stern";
    p(11, 15, 3, 1, hairD); p(18, 15, 3, 1, hairD); if (brow) { p(13, 16, 1, 1, hairD); p(18, 16, 1, 1, hairD); }
    p(11, 17, 2, 2, O); p(19, 17, 2, 2, O); p(11, 17, 1, 1, "#fff"); p(19, 17, 1, 1, "#fff");
    p(15, 19, 2, 1, skinD);
    const m = "#8a3a34";
    if (s.face === "smile") { p(13, 21, 1, 1, m); p(14, 22, 4, 1, m); p(18, 21, 1, 1, m); }
    if (s.face === "grin") { p(13, 21, 6, 2, m); p(14, 21, 4, 1, "#fff"); }
    if (s.face === "calm") p(14, 22, 4, 1, m);
    if (s.face === "stern") p(13, 22, 6, 1, m);
    if (s.blush) { p(10, 20, 2, 1, "#ef8f86"); p(20, 20, 2, 1, "#ef8f86"); }
    if (s.scar) { p(20, 16, 1, 5, "#a85350"); }
    if (s.beard) { p(9, 20, 14, 5, s.hair); p(10, 25, 12, 1, s.hair); p(13, 21, 6, 1, s.skin); p(14, 22, 4, 1, m); p(9, 16, 2, 5, s.hair); p(21, 16, 2, 5, s.hair); }
    // hair on top
    if (s.style === "bun") {
      p(12, 2, 8, 7, O); p(13, 3, 6, 5, s.hair); p(14, 3, 2, 1, s.hairLight);
      p(8, 7, 16, 5, O); p(9, 8, 14, 4, s.hair); p(11, 8, 5, 1, s.hairLight);
      p(8, 12, 2, 7, s.hair); p(22, 12, 2, 7, s.hair); p(10, 12, 3, 2, s.hair); p(19, 12, 3, 1, s.hair);
    }
    if (s.style === "cap") {
      p(8, 10, 16, 3, s.hair);
      p(8, 4, 16, 7, O); p(9, 5, 14, 5, s.cap); p(9, 9, 14, 1, shade(s.cap, -.3)); p(15, 4, 2, 1, shade(s.cap, -.3)); p(11, 5, 4, 1, shade(s.cap, .3));
      p(4, 10, 15, 3, O); p(5, 10, 13, 2, s.cap);
    }
    if (s.style === "long") { p(8, 7, 16, 6, O); p(9, 8, 14, 5, s.hair); p(9, 13, 14, 2, s.hair); p(8, 13, 2, 12, s.hair); p(22, 13, 2, 12, s.hair); p(11, 9, 6, 1, s.hairLight); p(20, 9, 3, 2, s.accent); p(21, 8, 1, 1, "#fff6c8"); }
    if (s.style === "helmet") {
      p(7, 4, 18, 10, O); p(8, 5, 16, 8, s.metal); p(8, 11, 16, 2, shade(s.metal, -.3)); p(10, 6, 5, 1, shade(s.metal, .4));
      for (const x of [10, 15, 21]) p(x, 9, 1, 1, shade(s.metal, .5));
      p(15, 12, 2, 6, O); p(15, 12, 2, 5, s.metal); p(10, 22, 12, 3, skinD);
    }
    if (s.style === "short") { p(8, 7, 16, 4, O); p(9, 8, 14, 3, s.hair); p(13, 9, 6, 1, s.skin); p(8, 11, 2, 6, s.hair); p(22, 11, 2, 6, s.hair); p(10, 8, 3, 1, s.hairLight); }
    return c;
  }

  // ---- scenes (240×105, in the spirit of "HD-2D") ----
  // Each scene is drawn in three layers: back (blurred a little), mid (sharp, where the characters stand)
  // and front (blurred more, close to the camera). `lights` adds glows, `rays` adds sunbeams; the stage
  // lays dust, vignette and color on top.
  const SW = 240, SH = 105;
  function kit(p, x, seed) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const px = (X, Y, c) => p(X, Y, 1, 1, c);
    const noise = (X, Y, W, H, cols, d) => { for (let j = Y; j < Y + H; j++) for (let i = X; i < X + W; i++) if (rnd() < d) px(i, j, cols[(rnd() * cols.length) | 0]); };
    const dith = (X, Y, W, H, c) => { for (let j = Y; j < Y + H; j++) for (let i = X + (j % 2); i < X + W; i += 2) px(i, j, c); };
    const vgrad = (X, Y, W, H, cols) => { for (let j = 0; j < H; j++) { const t = j / H * (cols.length - 1), k = Math.floor(t); p(X, Y + j, W, 1, cols[k]); if (t - k > .5 && cols[k + 1] && j % 2) dith(X, Y + j, W, 1, cols[k + 1]); } };
    const box = (X, Y, W, H, f, l, d, o = "#2a1c13") => { p(X - 1, Y - 1, W + 2, H + 2, o); p(X, Y, W, H, f); p(X, Y, W, 1, l); p(X, Y, 1, H, l); p(X, Y + H - 1, W, 1, d); p(X + W - 1, Y, 1, H, d); };
    const shadow = (X, Y, W, H = 3) => { p(X + 1, Y, W - 2, H, "#00000030"); p(X, Y + 1, W, H - 2, "#00000030"); };
    const bricks = (X, Y, W, H, cols, mortar, bh = 5, bw = 11) => {
      p(X, Y, W, H, mortar);
      for (let y = Y, r = 0; y < Y + H; y += bh + 1, r++) for (let i = X - (r % 2) * ((bw / 2) | 0); i < X + W; i += bw + 1) {
        const x0 = Math.max(X, i), w = Math.min(i + bw, X + W) - x0, h = Math.min(bh, Y + H - y); if (w <= 0) continue;
        const c = cols[(rnd() * cols.length) | 0]; p(x0, y, w, h, c); p(x0, y, w, 1, shade(c, .12)); p(x0, y + h - 1, w, 1, shade(c, -.15));
      }
    };
    const roof = (X, Y, W, H, a, b) => { for (let j = 0; j < H; j++) { const inset = Math.round((H - j) * .55); p(X + inset, Y + j, W - inset * 2, 1, j % 3 ? a : b); } };
    return { p, px, rnd, noise, dith, vgrad, box, shadow, bricks, roof, x };
  }
  const SCENES = {
    room: {
      lights: [[74, 30, "#ffd59a", 110], [48, 47, "#ffcf5a", 34]], rays: { x: 72, y: 20, angle: 132, color: "255,214,150" },
      back(g) {
        const { p, noise, vgrad, box, dith } = g;
        for (let x = 0; x < SW; x += 12) { p(x, 0, 12, 74, x % 24 ? "#6e4b33" : "#664530"); noise(x, 0, 12, 74, ["#5e3f2b", "#7a553a", "#704c34"], .06); p(x, 0, 1, 74, "#4a3121"); p(x + 3, 9, 1, 1, "#3a271b"); p(x + 3, 64, 1, 1, "#3a271b"); }
        p(0, 0, SW, 6, "#4a3121"); p(0, 6, SW, 1, "#7a553a"); p(0, 66, SW, 8, "#553a28"); p(0, 66, SW, 1, "#7a553a");
        box(152, 13, 44, 36, "#3a271b", "#4a3121", "#2a1c13"); vgrad(154, 15, 40, 32, ["#f39a62", "#f7b274", "#f9c98c", "#fbdba6", "#fde9c4"]);
        for (const [x, w, h, c] of [[154, 9, 8, "#c98a6a"], [164, 7, 11, "#b97c62"], [181, 8, 7, "#c98a6a"], [189, 5, 9, "#b97c62"]]) { p(x, 47 - h, w, h, c); g.roof(x - 1, 45 - h - 3, w + 2, 4, "#a86452", "#94584a"); }
        p(175, 19, 4, 26, "#dba582"); p(176, 16, 2, 3, "#dba582"); p(174, 26, 6, 1, "#c9937a"); p(173, 34, 8, 1, "#c9937a");
        p(172, 15, 2, 32, "#3a271b"); p(154, 30, 40, 2, "#3a271b"); p(148, 49, 52, 3, "#7a553a"); p(148, 49, 52, 1, "#9a7050");
        for (const x of [140, 196]) { p(x, 9, 11, 45, "#8a3b3b"); for (let i = 1; i < 11; i += 3) p(x + i, 9, 1, 45, "#a24b4a"); p(x, 9, 11, 2, "#5a2626"); }
        p(18, 26, 50, 3, "#4a3121"); p(18, 26, 50, 1, "#7a553a"); p(22, 29, 2, 4, "#3a271b"); p(62, 29, 2, 4, "#3a271b");
        for (let x = 20, i = 0; x < 64; i++) { const w = 3 + (i % 3), h = 9 + (i * 7) % 6, c = ["#8a3a34", "#3a5f8a", "#3f7a4a", "#c79a3a", "#6a4a8a"][i % 5]; p(x, 26 - h, w, h, c); p(x, 26 - h, w, 1, shade(c, .3)); p(x + 1, 28 - h, w - 2, 1, "#e9dcc0"); x += w + (i % 4 === 3 ? 4 : 0); }
        box(92, 17, 24, 17, "#c79a3a", "#e0b860", "#8a6420"); vgrad(94, 19, 20, 13, ["#9fd3ef", "#cfe9f5"]); p(94, 27, 20, 5, "#5a9a4a"); p(100, 24, 6, 3, "#7ab46a");
        dith(0, 0, 18, 74, "#00000022"); dith(222, 0, 18, 74, "#00000022");
      },
      mid(g) {
        const { p, noise, box, shadow } = g;
        let y = 74; for (const h of [3, 3, 4, 4, 5, 5, 6, 7]) { p(0, y, SW, h, (y % 2) ? "#5a3b27" : "#53361f"); noise(0, y, SW, h, ["#4a3121", "#6a4630"], .05); p(0, y + h - 1, SW, 1, "#3f2a1a"); y += h; }
        for (let j = 0; j < 31; j++) p(Math.round(124 - j * 1.6), 74 + j, 54 + j, 1, "#ffd9a028");
        p(8, 40, 6, 46, "#4a3121"); p(9, 41, 4, 44, "#6a4630"); p(9, 41, 4, 1, "#8a5c3c");
        box(14, 64, 86, 16, "#5a3a26", "#7a5238", "#3f2a1a"); p(14, 80, 4, 6, "#3f2a1a"); p(96, 80, 4, 6, "#3f2a1a");
        p(15, 56, 84, 8, "#efe6d4"); p(15, 63, 84, 1, "#c9bfae");
        for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) { const c = ["#b8483e", "#d98a3a", "#4d7a9c", "#c9b27a"][(i + j) % 4]; p(38 + i * 6, 54 + j * 5, 6, 5, c); p(38 + i * 6, 54 + j * 5, 6, 1, shade(c, .25)); p(38 + i * 6, 58 + j * 5, 6, 1, shade(c, -.25)); }
        p(16, 49, 20, 8, "#f8f2e4"); p(16, 55, 20, 2, "#ddd3c0"); p(18, 50, 8, 1, "#ffffff");
        shadow(12, 85, 90, 3);
        box(106, 62, 20, 22, "#6a4630", "#8a5c3c", "#4a3121"); p(108, 70, 16, 1, "#3f2a1a"); p(115, 74, 2, 2, "#e0b440"); shadow(105, 84, 23);
        p(112, 59, 6, 3, "#b0a089"); p(113, 50, 4, 9, "#f1e7c9"); p(113, 50, 1, 9, "#fffaf0"); p(113, 46, 4, 4, "#ffb03a"); p(114, 45, 2, 3, "#ffe08a"); p(114, 47, 1, 1, "#ffffff");
        box(178, 70, 34, 18, "#7a4e2a", "#9a6a3c", "#5a3a20"); p(178, 66, 34, 5, "#8a5c34"); p(178, 66, 34, 1, "#a8744c");
        for (const x of [184, 194, 204]) p(x, 66, 2, 22, "#b0a089"); p(193, 74, 4, 4, "#e0b440"); shadow(176, 88, 38);
        p(112, 89, 64, 12, "#7b3b5a"); p(114, 91, 60, 8, "#94476c"); for (let x = 118; x < 172; x += 8) { p(x, 94, 3, 2, "#e0b440"); p(x + 1, 93, 1, 4, "#e0b440"); }
      },
      front(g) {
        const { p } = g;
        p(0, 0, SW, 4, "#2a1c13"); p(0, 4, SW, 1, "#3a271b");
        p(0, 74, 6, 31, "#2a1c13"); p(6, 80, 14, 4, "#3a271b"); p(6, 90, 14, 4, "#3a271b"); p(18, 74, 5, 31, "#2a1c13");
        p(214, 90, 24, 15, "#8a4a2a"); p(214, 90, 24, 3, "#a0602e");
        for (const [x, y, w, h] of [[204, 74, 14, 10], [214, 64, 16, 14], [226, 70, 14, 12], [208, 82, 12, 9], [224, 80, 16, 10]]) { p(x, y, w, h, "#3f7a3a"); p(x + 2, y + 1, w - 6, 3, "#5a9a4a"); }
      },
    },
    counter: {
      lights: [[6, 14, "#ffcf5a", 46], [84, 52, "#ff9a3a", 90], [44, 14, "#ffcf5a", 40]],
      back(g) {
        const { p, noise, box, bricks, dith } = g;
        for (let x = 0; x < SW; x += 10) { p(x, 0, 10, 48, x % 20 ? "#7a5238" : "#704b33"); noise(x, 0, 10, 48, ["#6b4630", "#86603f"], .06); p(x, 0, 1, 48, "#5a3a26"); }
        bricks(0, 48, SW, 26, ["#7c7068", "#857870", "#736860", "#8c8076"], "#4a423c");
        for (const y of [20, 38]) { p(10, y, 112, 3, "#4a2f1f"); p(10, y, 112, 1, "#7a5238");
          for (let x = 12, i = 0; x < 118; i++) { const c = ["#3f8a5a", "#8a3a34", "#3a5f8a", "#c79a3a", "#7a4f9a"][i % 5], h = 9 + (i * 5) % 5, w = i % 4 === 2 ? 6 : 4;
            p(x, y - h, w, h, c); p(x + 1, y - h - 2, w - 2, 2, shade(c, -.2)); p(x + 1, y - h + 2, 1, h - 3, "#ffffff55"); p(x, y - 3, w, 1, shade(c, -.3)); x += w + 2; } }
        for (let x = 30; x < 110; x += 16) { p(x, 0, 1, 8, "#3a2a1f"); p(x - 2, 8, 5, 6, "#6a8a3a"); p(x - 1, 9, 3, 7, "#4f7030"); }
        box(166, 24, 64, 50, "#6c625a", "#857a70", "#4a423c"); p(170, 18, 56, 6, "#5a3a26"); p(170, 18, 56, 1, "#86603f");
        p(176, 38, 44, 36, "#1e1410"); for (let i = 0; i < 44; i += 2) p(176 + i, 38 + (i % 6 ? 0 : 1), 2, 1, "#3a2a1f");
        p(182, 68, 32, 4, "#5a3a26"); p(186, 65, 24, 3, "#6a4630");
        for (const [x, h, c] of [[184, 22, "#d8402f"], [190, 28, "#ff7a2a"], [196, 32, "#ffb03a"], [202, 26, "#ff7a2a"], [208, 20, "#d8402f"], [193, 18, "#ffe08a"], [199, 22, "#ffe08a"], [197, 10, "#ffffff"]]) p(x, 66 - h, 5, h, c);
        for (const x of [172, 220]) { p(x, 12, 3, 6, "#f1e7c9"); p(x, 9, 3, 3, "#ffcf5a"); }
        for (const [x, y] of [[130, 52], [146, 52], [138, 36]]) { box(x, y, 14, 18, "#6b4428", "#8a5c34", "#4a2f1f"); p(x, y + 4, 14, 2, "#b0a089"); p(x, y + 12, 14, 2, "#b0a089"); }
        dith(0, 0, 14, 74, "#00000026");
      },
      mid(g) {
        const { p, noise, box, shadow } = g;
        p(0, 74, SW, 31, "#5a3a26"); noise(0, 74, SW, 31, ["#4a2f1f", "#6a4630"], .06);
        for (let x = 0; x < SW; x += 24) { p(x, 78, 1, 27, "#3f2a1a"); p(x + 3, 80, 18, 22, "#63412b"); p(x + 3, 80, 18, 1, "#7a5238"); }
        p(0, 70, SW, 5, "#9a6a44"); p(0, 70, SW, 1, "#c08a5a"); p(0, 75, SW, 2, "#3f2a1a");
        for (const x of [36, 48]) { p(x, 60, 9, 10, "#d9cfbd"); p(x, 60, 9, 2, "#f2ecdf"); p(x + 9, 62, 3, 5, "#d9cfbd"); p(x + 1, 61, 7, 1, "#c8a060"); }
        p(70, 63, 22, 7, "#a0703a"); for (let i = 0; i < 22; i += 3) p(70 + i, 63, 1, 7, "#7a5228"); p(72, 58, 8, 6, "#e0a868"); p(80, 57, 9, 6, "#d09050"); p(73, 58, 6, 1, "#f2c88a");
        for (let i = 0; i < 5; i++) { p(118, 68 - i * 2, 8, 2, "#e0b440"); p(118, 68 - i * 2, 8, 1, "#ffe08a"); }
        box(146, 63, 20, 6, "#6a2f2a", "#8a3f38", "#4a1f1c"); p(148, 62, 16, 1, "#f2ecdf");
        p(204, 54, 8, 16, "#b0a089"); p(203, 60, 10, 2, "#8a7a64"); p(206, 50, 4, 4, "#ffcf5a"); p(207, 49, 2, 2, "#ffffff");
        shadow(30, 70, 70, 2);
      },
      front(g) {
        const { p } = g;
        p(6, 0, 1, 10, "#2a1c13"); p(0, 10, 14, 4, "#2a1c13"); p(2, 14, 10, 14, "#3a2a1f"); p(3, 15, 8, 12, "#ffcf5a"); p(5, 16, 4, 9, "#ffefb0"); p(0, 28, 14, 3, "#2a1c13");
        p(206, 92, 34, 6, "#3a271b"); p(210, 98, 5, 7, "#2a1c13"); p(232, 98, 5, 7, "#2a1c13");
      },
    },
    market: {
      lights: [[8, 6, "#fff3c0", 120]], rays: { x: 4, y: 0, angle: 38, color: "255,244,210" },
      back(g) {
        const { p, vgrad, rnd } = g;
        vgrad(0, 0, SW, 46, ["#6fbcec", "#86c8f0", "#9fd3f4", "#b8def7", "#d2eaf9", "#e8f4fb"]);
        for (const [x, y, w] of [[30, 10, 30], [96, 6, 40], [150, 16, 26], [206, 4, 30]]) { p(x, y, w, 5, "#ffffff"); p(x + 4, y - 3, w - 12, 3, "#ffffff"); p(x + 2, y + 5, w - 4, 2, "#dfe9f2"); }
        for (let i = 0; i < 9; i++) { const w = 22 - i * 2, y = 44 - i * 5; p(196 + (22 - w) / 2, y, w, 5, i % 2 ? "#b8c4d4" : "#aeb9ca"); p(196 + (22 - w) / 2, y, w, 1, "#ccd6e2"); }
        p(203, 0, 8, 2, "#e8f4fb"); p(198, 2, 18, 3, "#ffffff"); p(201, 0, 12, 2, "#ffffff");
        for (let x = 0; x < 190; x += 7) { const h = 3 + ((x * 7) % 5); p(x, 44 - h, 6, h, "#9fb4c8"); p(x, 44 - h - 2, 6, 2, (x / 7) % 2 ? "#7f9ab8" : "#b48a86"); }
        vgrad(0, 44, SW, 12, ["#3f8fc4", "#4a9acc", "#5aa6d4"]);
        for (let i = 0; i < 40; i++) p((rnd() * SW) | 0, 45 + ((rnd() * 10) | 0), 3, 1, "#a8dcf6");
        p(54, 44, 34, 6, "#6b4428"); p(56, 50, 30, 1, "#4a2f1f"); p(70, 18, 1, 26, "#3a2a1f"); for (let y = 0; y < 22; y++) p(71, 20 + y, Math.round(y * .9), 1, "#f4efe6"); p(60, 26, 9, 14, "#ece4d6");
      },
      mid(g) {
        const { p, noise, box, shadow, roof, dith } = g;
        let y = 56, r = 0; for (const h of [3, 3, 4, 4, 5, 5, 6, 6, 7, 8]) { const w = h * 2 + 2;
          for (let x = -(r % 2) * (w / 2); x < SW; x += w + 1) { const c = ["#b9a78a", "#a8967a", "#c4b394", "#b09d80"][(x * 3 + r) % 4 & 3]; p(x, y, w, h, c); p(x, y, w, 1, shade(c, .15)); }
          p(0, y + h, SW, 1, "#8a7a62"); y += h + 1; r++; }
        p(0, 14, 50, 46, "#e9dcc0"); noise(0, 14, 50, 46, ["#ddd0b2", "#f2e8d0"], .08);
        for (const x of [0, 16, 32, 48]) p(x, 14, 2, 46, "#5a3a26"); p(0, 34, 50, 2, "#5a3a26"); p(0, 14, 50, 2, "#5a3a26");
        for (let i = 0; i < 14; i++) { p(2 + i, 16 + i, 2, 2, "#5a3a26"); p(30 - i, 16 + i, 2, 2, "#5a3a26"); }
        roof(-8, 0, 66, 15, "#3a5f8a", "#2f4f75"); p(-8, 14, 66, 2, "#24405f");
        box(20, 40, 12, 12, "#2f6fd8", "#4a86e8", "#2050a0"); p(25, 40, 2, 12, "#5a3a26"); p(20, 45, 12, 2, "#5a3a26"); p(14, 40, 5, 12, "#3f8a3a"); p(33, 40, 5, 12, "#3f8a3a");
        p(18, 52, 16, 3, "#7a4e2a"); for (const x of [19, 23, 27, 31]) { p(x, 50, 2, 2, "#d8402f"); p(x, 49, 1, 1, "#ffd0d0"); }
        box(4, 44, 9, 16, "#6b4428", "#8a5c34", "#4a2f1f");
        p(98, 22, 2, 52, "#2a2a2a"); p(95, 18, 8, 7, "#2a2a2a"); p(96, 19, 6, 5, "#ffe08a"); p(94, 16, 10, 2, "#2a2a2a"); shadow(95, 74, 9, 2);
        const stall = (x, w, c1) => {
          for (let i = 0; i * 8 < w; i++) { const c = i % 2 ? "#f4efe6" : c1; p(x + i * 8, 36, 8, 9, c); p(x + i * 8, 36, 8, 1, shade(c, .2)); p(x + i * 8, 44, 8, 1, shade(c, -.2)); p(x + i * 8 + 2, 45, 4, 2, c); }
          p(x, 36, w, 1, "#00000040"); p(x + 2, 46, 2, 26, "#5a3a26"); p(x + w - 4, 46, 2, 26, "#5a3a26");
          box(x, 60, w, 10, "#8a5c3c", "#a8744c", "#6a4428"); shadow(x - 1, 71, w + 2, 3);
        };
        stall(112, 64, "#d8402f");
        for (let x = 116; x < 172; x += 5) { p(x, 56, 4, 4, "#d8402f"); p(x, 56, 2, 1, "#ff9a8a"); p(x + 1, 55, 1, 1, "#3f7a3a"); }
        for (let x = 118; x < 170; x += 7) { p(x, 52, 4, 4, "#c8d84a"); p(x, 52, 1, 1, "#eef4a0"); }
        stall(184, 56, "#2f6fd8");
        for (const [x, c] of [[188, "#d8402f"], [198, "#2f6fd8"], [208, "#3a9a52"], [218, "#f2c230"], [228, "#7a4fd1"]]) { p(x, 50, 8, 10, c); p(x, 50, 8, 1, shade(c, .35)); p(x + 7, 50, 1, 10, shade(c, -.3)); }
        for (const [x, y] of [[78, 70], [90, 74]]) { box(x, y, 14, 11, "#9a6a3c", "#b88850", "#6a4428"); p(x, y + 4, 14, 1, "#6a4428"); shadow(x - 1, y + 12, 16, 2); for (let i = 0; i < 12; i += 3) p(x + 1 + i, y - 2, 3, 3, "#d8402f"); }
        dith(0, 56, SW, 2, "#00000018");
      },
      front(g) {
        const { p } = g;
        for (const [x, y, w, h, c] of [[196, 0, 44, 12, "#2f5e2a"], [204, 10, 36, 10, "#3f7a3a"], [214, 18, 26, 8, "#2f5e2a"], [188, 0, 14, 6, "#3f7a3a"], [222, 24, 18, 6, "#3f7a3a"]]) { p(x, y, w, h, c); p(x + 3, y + 1, w - 8, 2, "#5a9a4a"); }
        p(0, 86, 30, 19, "#7a4e2a"); p(0, 86, 30, 3, "#9a6a3c"); p(0, 94, 30, 1, "#5a3a20"); for (let i = 2; i < 28; i += 4) p(i, 82, 3, 4, "#d8402f");
      },
    },
    guild: {
      lights: [[22, 56, "#ffb03a", 40], [78, 56, "#ffb03a", 40], [36, 30, "#ffcf7a", 30], [64, 30, "#ffcf7a", 30], [50, 28, "#ffcf7a", 26]],
      back(g) {
        const { p, vgrad, roof } = g;
        vgrad(0, 0, SW, 44, ["#2f3462", "#4c4a7c", "#7a5e8a", "#b47a86", "#e39a7c", "#f4bc86"]);
        for (const [x, y, w] of [[20, 8, 30], [170, 12, 40]]) { p(x, y, w, 2, "#e9a8a0"); p(x + 5, y - 1, w - 12, 1, "#f2c0b0"); }
        for (let x = 0; x < SW; x += 18) { const h = 10 + (x * 13) % 14; p(x, 44 - h, 16, h, "#3c3854"); roof(x - 2, 44 - h - 6, 20, 6, "#2e2a44", "#34304c"); }
      },
      mid(g) {
        const { p, noise, box, bricks, roof, shadow } = g;
        let y = 88; for (const h of [3, 4, 4, 5]) { for (let x = (y % 2) * 4; x < SW; x += h * 2 + 3) { p(x, y, h * 2 + 2, h, "#6b6f78"); p(x, y, h * 2 + 2, 1, "#858a94"); } y += h + 1; }
        p(0, 18, 30, 70, "#4a4656"); roof(-6, 6, 42, 14, "#2f4f75", "#24405f"); for (let j = 30; j < 80; j += 14) box(8, j, 10, 8, "#ffcf7a", "#ffe6a8", "#e0a040");
        p(210, 22, 30, 66, "#4a4656"); roof(204, 10, 42, 14, "#2f4f75", "#24405f"); for (let j = 34; j < 80; j += 14) box(220, j, 10, 8, "#ffcf7a", "#ffe6a8", "#e0a040");
        roof(28, 0, 184, 24, "#3a5f8a", "#2f4f75"); p(28, 22, 184, 2, "#24405f");
        box(108, 4, 24, 14, "#e9dcc0", "#f6eedb", "#cbb994"); roof(104, -4, 32, 9, "#3a5f8a", "#2f4f75"); box(114, 8, 12, 8, "#ffcf7a", "#ffe6a8", "#e0a040"); p(119, 8, 2, 8, "#5a3a26");
        p(32, 24, 176, 24, "#e9dcc0"); noise(32, 24, 176, 24, ["#ddd0b2", "#f2e8d0"], .08);
        for (let x = 32; x <= 206; x += 22) p(x, 24, 2, 24, "#5a3a26"); p(32, 24, 176, 2, "#5a3a26"); p(32, 46, 176, 2, "#5a3a26");
        for (const x of [42, 64, 152, 174, 196]) { box(x, 29, 10, 12, "#ffcf7a", "#ffe6a8", "#e0a040"); p(x + 4, 29, 2, 12, "#5a3a26"); p(x, 34, 10, 1, "#5a3a26"); p(x - 2, 41, 14, 2, "#7a4e2a"); p(x - 1, 39, 2, 2, "#d8402f"); p(x + 9, 39, 2, 2, "#f2c230"); }
        bricks(32, 48, 176, 40, ["#8a8f99", "#7c818b", "#959aa4", "#838892"], "#5d626b");
        p(98, 50, 44, 38, "#5d626b"); for (let i = 0; i < 22; i++) { const w = Math.round(Math.sqrt(484 - (21 - i) * (21 - i)) * 1); p(120 - w, 52 + i, w * 2, 1, i < 21 ? "#2a1c13" : "#2a1c13"); }
        p(100, 70, 40, 18, "#2a1c13"); p(102, 58, 36, 30, "#6b4428");
        for (let i = 0; i < 18; i++) { const w = Math.round(Math.sqrt(324 - (17 - i) * (17 - i))); p(120 - w, 54 + i, w * 2, 1, "#6b4428"); }
        for (let x = 104; x < 138; x += 6) p(x, 56, 1, 32, "#5a3a26"); p(119, 54, 2, 34, "#3f2a1a");
        for (const y of [64, 78]) p(102, y, 36, 2, "#3a3a3a"); p(114, 70, 3, 3, "#e0b440"); p(123, 70, 3, 3, "#e0b440");
        box(94, 88, 52, 3, "#9a9ea6", "#b4b8c0", "#7c818b"); box(90, 92, 60, 3, "#9a9ea6", "#b4b8c0", "#7c818b");
        for (const x of [70, 156]) { p(x, 50, 14, 30, "#b0302a"); p(x, 50, 14, 2, "#8a2420"); p(x, 80, 5, 4, "#b0302a"); p(x + 9, 80, 5, 4, "#b0302a"); p(x + 4, 58, 6, 10, "#e0b440"); p(x + 3, 60, 8, 5, "#e0b440"); p(x + 6, 61, 2, 3, "#b0302a"); }
        for (const x of [52, 186]) { p(x, 56, 3, 10, "#3a2a1f"); p(x - 1, 54, 5, 3, "#5a5a5a"); p(x, 50, 3, 4, "#ff9a3a"); p(x + 1, 47, 1, 4, "#ffe08a"); }
        p(150, 44, 1, 6, "#2a1c13"); box(144, 50, 14, 10, "#7a4e2a", "#9a6a3c", "#5a3a20"); p(148, 52, 6, 6, "#e0b440"); p(150, 53, 2, 4, "#b0302a");
        for (const x of [82, 150]) { box(x, 82, 8, 6, "#a0522d", "#c0703d", "#7a3a1d"); p(x - 1, 76, 10, 6, "#3f7a3a"); p(x + 1, 75, 4, 2, "#d8402f"); }
        shadow(90, 95, 60, 2);
      },
      front(g) {
        const { p } = g;
        p(0, 94, SW, 11, "#a8a294"); p(0, 94, SW, 2, "#c4bfb2"); for (let x = 4; x < SW; x += 12) { p(x, 96, 6, 9, "#8a857a"); p(x + 1, 96, 2, 9, "#b4ae9f"); }
        for (const [x, y, w, h] of [[0, 80, 24, 16], [10, 74, 22, 12], [26, 84, 16, 12]]) { p(x, y, w, h, "#2f5e2a"); p(x + 3, y + 1, w - 7, 3, "#4a8a3e"); }
      },
    },
    hall: {
      lights: [[22, 26, "#cfe6ff", 70], [78, 26, "#cfe6ff", 70], [50, 6, "#ffcf5a", 40]], rays: { x: 22, y: 18, angle: 62, color: "220,236,255" },
      back(g) {
        const { p, bricks, vgrad, box, dith } = g;
        bricks(0, 0, SW, 74, ["#5c5550", "#544d48", "#635b55", "#4e4843"], "#3a3531");
        for (const x of [40, 176]) { p(x - 2, 10, 28, 48, "#3a3531"); vgrad(x, 18, 24, 38, ["#cfe6ff", "#a8c8ee", "#8ab0de"]); for (let i = 0; i < 12; i++) { const w = Math.round(Math.sqrt(144 - (11 - i) * (11 - i))); p(x + 12 - w, 12 + i - 4, w * 2, 1, "#cfe6ff"); }
          p(x + 11, 8, 2, 48, "#3a3531"); p(x, 34, 24, 2, "#3a3531"); p(x - 3, 56, 30, 3, "#6a625b"); }
        for (const [x, w] of [[80, 34], [126, 30]]) { box(x, 14, w, 24, "#e7d3a1", "#f6e8c4", "#c8b07a", "#3a2a1f"); p(x + 3, 19, w - 8, 1, "#b8955a"); p(x + 5, 25, w - 12, 1, "#b8955a"); p(x + 4, 30, w - 10, 1, "#b8955a"); p(x + w / 2, 21, 3, 3, "#b0302a"); }
        for (const [x, c] of [[10, "#b0302a"], [220, "#2f6fd8"]]) { p(x, 16, 12, 14, c); p(x + 1, 30, 10, 3, c); p(x + 3, 33, 6, 2, c); p(x + 5, 18, 2, 14, "#e0b440"); p(x + 2, 22, 8, 2, "#e0b440"); }
        p(119, 0, 2, 8, "#2a2a2a"); p(104, 8, 32, 3, "#3a2a1f"); for (const x of [105, 113, 121, 129]) { p(x, 4, 3, 4, "#f1e7c9"); p(x, 1, 3, 3, "#ffcf5a"); }
        dith(0, 0, SW, 6, "#00000030");
      },
      mid(g) {
        const { p, box, shadow } = g;
        let y = 74, r = 0; for (const h of [3, 4, 4, 5, 6, 7]) { const w = h * 3; for (let x = -(r % 2) * w; x < SW; x += w) p(x, y, w, h, ((x / w + r) | 0) % 2 ? "#4a3e34" : "#3f352c"); y += h; r++; }
        for (let j = 0; j < 30; j++) { p(Math.round(52 + j * 1.2), 74 + j, 26, 1, "#cfe6ff1c"); p(Math.round(188 + j * 1.2), 74 + j, 26, 1, "#cfe6ff14"); }
        box(16, 66, 208, 6, "#6b4428", "#8a5c34", "#4a2f1f"); p(16, 66, 208, 2, "#9a6a3c"); p(30, 65, 180, 2, "#b0302a");
        for (const x of [22, 118, 214]) p(x, 72, 4, 16, "#4a2f1f"); shadow(14, 88, 214, 3);
        for (const x of [40, 84, 150, 196]) { p(x, 58, 3, 7, "#f1e7c9"); p(x, 55, 3, 3, "#ffb03a"); p(x + 1, 54, 1, 2, "#ffe08a"); p(x - 1, 64, 5, 1, "#b0a089"); }
        p(60, 62, 12, 4, "#e7d3a1"); p(62, 61, 10, 1, "#f6e8c4"); p(166, 62, 10, 4, "#e7d3a1"); p(124, 60, 8, 6, "#8a5c34");
        for (const x of [50, 100, 140, 186]) { box(x, 50, 12, 16, "#5a3a26", "#7a5238", "#3f2a1a"); }
      },
      front(g) {
        const { p } = g;
        p(0, 0, 14, SH, "#3a3531"); p(14, 0, 3, SH, "#2a2522"); for (let y = 0; y < SH; y += 8) p(0, y, 14, 1, "#2a2522");
        p(226, 0, 14, 46, "#b0302a"); p(226, 46, 6, 6, "#b0302a"); p(234, 46, 6, 6, "#b0302a"); p(230, 10, 6, 8, "#e0b440");
      },
    },
  };

  const cache = {};
  const url = (key, make) => cache[key] || (cache[key] = make().toDataURL());
  window.XIB_ART = {
    chars: CHARS,
    scenes: SCENES,
    portrait: who => CHARS[who] ? url("c:" + who, () => portrait(CHARS[who])) : null,
    // { back, mid, front, lights, rays } with image URLs for the three layers
    scene: name => {
      const sc = SCENES[name]; if (!sc) return null;
      const layer = (k, seed) => sc[k] ? url("s:" + name + ":" + k, () => { const { c, p, x } = canvas(SW, SH); sc[k](kit(p, x, seed)); return c; }) : null;
      return { back: layer("back", 11), mid: layer("mid", 23), front: layer("front", 37), lights: sc.lights || [], rays: sc.rays || null };
    },
  };
})();
