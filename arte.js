// Pixel art for the story: character portraits and scene backdrops, drawn in code on tiny canvases
// (32×40 portraits, 160×70 scenes) and scaled up with sharp pixels. Nothing to download.
//
// To create a character, add an entry to CHARS: pick colors and one of the styles below.
//   hair:   bun · cap · long · helmet · short
//   outfit: apron · vest · kimono · armor · robe
//   face:   smile · grin · calm · stern
// To create a scene, add a painter to SCENES: a function that draws with p(x, y, w, h, color).
(function () {
  const CHARS = {
    rosie: { skin: "#f2c4a0", hair: "#c4492c", hairLight: "#e8714e", style: "bun", outfit: "apron", cloth: "#4d7a9c", face: "smile", blush: true },
    tobias: { skin: "#c98f62", hair: "#5a3a24", hairLight: "#7a5234", style: "cap", cap: "#3f8a3a", outfit: "vest", cloth: "#e9dcc0", vest: "#7a4e2a", face: "grin", beard: true },
    mei: { skin: "#f4d2b4", hair: "#1f1b2e", hairLight: "#4a4370", style: "long", outfit: "kimono", cloth: "#7a4fd1", accent: "#f2c230", face: "smile", blush: true },
    bram: { skin: "#d6a27e", hair: "#3b2f2a", hairLight: "#5a4a40", style: "helmet", metal: "#9aa3ad", outfit: "armor", cloth: "#9aa3ad", face: "stern", scar: true },
    marcus: { skin: "#e0b08c", hair: "#b9b9b9", hairLight: "#e2e2e2", style: "short", outfit: "robe", cloth: "#7a2f2a", accent: "#e0b440", face: "calm", beard: true },
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

  // ---- scenes (160×70) ----
  function bricks(p, x0, y0, w, h, a, b, mortar) {
    p(x0, y0, w, h, mortar);
    for (let y = y0, r = 0; y < y0 + h; y += 6, r++) for (let x = x0 - (r % 2) * 5; x < x0 + w; x += 10) { const xx = Math.max(x0, x); p(xx, y, Math.min(9, x + 9 - xx, x0 + w - xx), 5, (x + y) % 3 ? a : b); }
  }
  const SCENES = {
    room(p) {
      for (let x = 0; x < 160; x += 8) { p(x, 0, 8, 50, x % 16 ? "#6b4a35" : "#61432f"); p(x, 0, 1, 50, "#4e3424"); }
      p(104, 8, 32, 26, "#3a2a1f"); for (let y = 0; y < 22; y++) p(106, 10 + y, 28, 1, y < 8 ? "#f6b47a" : y < 15 ? "#f8cf92" : "#fbe3b0");
      p(110, 22, 6, 4, "#fff3c4"); p(119, 10, 2, 22, "#3a2a1f"); p(106, 20, 28, 2, "#3a2a1f");
      p(0, 50, 160, 20, "#4a3122"); for (const y of [55, 61, 67]) p(0, y, 160, 1, "#3d281b");
      p(3, 28, 4, 26, "#5a3a26"); p(5, 40, 48, 12, "#5a3a26"); p(7, 37, 44, 6, "#e9e1d0"); p(20, 38, 31, 9, "#b8483e"); p(20, 38, 31, 1, "#d6675c"); p(8, 34, 12, 5, "#f6f0e2");
      p(62, 40, 14, 12, "#5a3a26"); p(62, 40, 14, 2, "#7a5238"); p(67, 34, 3, 6, "#f1e7c9"); p(67, 31, 3, 3, "#ffcf5a"); p(68, 30, 1, 1, "#fff3c4");
      p(80, 58, 44, 8, "#7b3b5a"); for (let x = 82; x < 122; x += 6) p(x, 59, 2, 6, "#a35a7c");
      p(140, 38, 12, 14, "#5a3a26"); p(141, 36, 10, 3, "#7a5238");
    },
    counter(p) {
      p(0, 0, 160, 48, "#7a5238"); for (let x = 0; x < 160; x += 10) p(x, 0, 1, 48, "#6b4630");
      for (const y of [12, 28]) { p(8, y, 70, 2, "#4a2f1f"); for (let x = 10, i = 0; x < 76; x += 7, i++) { const col = ["#3f8a5a", "#8a3a34", "#3a5f8a", "#c79a3a"][i % 4]; p(x, y - 7, 4, 7, col); p(x + 1, y - 9, 2, 2, col); p(x + 1, y - 6, 1, 4, "#ffffff55"); } }
      for (const x of [96, 128]) { p(x + 2, 0, 1, 6, "#3a2a1f"); p(x, 6, 6, 8, "#3a2a1f"); p(x + 1, 7, 4, 6, "#ffcf5a"); p(x - 3, 4, 12, 12, "#ffcf5a22"); }
      p(0, 48, 160, 4, "#8a5c3c"); p(0, 52, 160, 18, "#5a3a26"); for (let x = 0; x < 160; x += 16) p(x, 52, 1, 18, "#4a2f1f");
      p(86, 42, 6, 6, "#e9e1d0"); p(92, 43, 2, 3, "#e9e1d0"); p(120, 40, 10, 8, "#c98a4a"); p(121, 41, 8, 2, "#e0a868");
    },
    market(p) {
      for (let y = 0; y < 30; y++) p(0, y, 160, 1, y < 10 ? "#8fcdf2" : y < 20 ? "#a8d9f6" : "#c6e9fb");
      p(18, 5, 8, 8, "#fff2b0"); p(20, 3, 4, 12, "#fff2b0"); p(16, 7, 12, 4, "#fff2b0");
      for (const [x, y] of [[50, 6], [94, 10], [130, 4]]) { p(x, y, 16, 3, "#ffffff"); p(x + 3, y - 2, 8, 2, "#ffffff"); }
      for (const [x, y] of [[70, 14], [78, 11]]) { p(x, y, 2, 1, "#3a3a3a"); p(x + 2, y + 1, 1, 1, "#3a3a3a"); p(x + 3, y, 2, 1, "#3a3a3a"); }
      p(0, 30, 160, 10, "#3f8fc4"); for (let x = 0; x < 160; x += 9) p(x + ((x / 9) % 2) * 3, 33 + (x % 2), 4, 1, "#7cc0e8");
      p(104, 30, 30, 5, "#6b4428"); p(106, 35, 26, 1, "#4a2f1f"); p(118, 12, 1, 18, "#3a2a1f"); for (let y = 0; y < 15; y++) p(119, 13 + y, Math.round(y * .8), 1, "#f4efe6");
      p(0, 40, 160, 30, "#c9a46a"); for (const y of [46, 53, 60, 67]) p(0, y, 160, 1, "#b08a52");
      const stall = (x, c1) => { for (let i = 0; i < 7; i++) p(x + i * 8, 34, 8, 7, i % 2 ? "#f4efe6" : c1); p(x, 41, 56, 1, "#00000033"); p(x + 2, 41, 2, 20, "#6b4428"); p(x + 52, 41, 2, 20, "#6b4428"); p(x, 52, 56, 9, "#8a5c3c"); p(x, 52, 56, 2, "#a8744c"); };
      stall(4, "#d8402f"); for (let x = 8; x < 56; x += 5) { p(x, 49, 4, 3, "#d8402f"); p(x + 1, 48, 1, 1, "#3f8a3a"); }
      stall(100, "#2f6fd8"); for (const [x, c] of [[104, "#d8402f"], [116, "#2f6fd8"], [128, "#3a9a52"], [140, "#f2c230"]]) { p(x, 44, 9, 8, c); p(x, 44, 9, 1, "#ffffff55"); }
      p(68, 56, 12, 10, "#8a5c3c"); p(68, 56, 12, 1, "#a8744c"); p(82, 58, 10, 8, "#7a4e2a");
    },
    guild(p) {
      for (let y = 0; y < 10; y++) p(0, y, 160, 1, y < 5 ? "#5a6e9c" : "#7f8fb8");
      bricks(p, 0, 10, 160, 50, "#8a8f99", "#7c818b", "#5d626b");
      p(58, 18, 44, 2, "#5d626b"); p(60, 20, 40, 42, "#3a2a1f"); p(62, 22, 36, 38, "#6b4428"); for (let x = 62; x < 98; x += 6) p(x, 22, 1, 38, "#5a3a26");
      for (const y of [28, 48]) p(62, y, 36, 2, "#3a3a3a"); p(78, 38, 2, 4, "#e0b440"); p(82, 38, 2, 4, "#e0b440");
      for (const x of [26, 124]) { p(x, 14, 12, 26, "#b0302a"); p(x, 40, 4, 3, "#b0302a"); p(x + 8, 40, 4, 3, "#b0302a"); p(x + 4, 22, 4, 6, "#e0b440"); p(x + 3, 24, 6, 2, "#e0b440"); }
      for (const x of [48, 108]) { p(x, 28, 3, 8, "#3a2a1f"); p(x, 25, 3, 3, "#ffb03a"); p(x + 1, 23, 1, 2, "#ffe08a"); p(x - 3, 22, 9, 10, "#ffcf5a22"); }
      p(0, 60, 160, 10, "#6b6f78"); for (let x = 0; x < 160; x += 7) p(x, 60 + (x % 3) * 3, 5, 2, "#7d828c");
    },
    hall(p) {
      bricks(p, 0, 0, 160, 50, "#5c5550", "#544d48", "#3f3a36");
      for (const [x, w] of [[14, 30], [56, 22], [104, 36]]) { p(x - 1, 8, w + 2, 22, "#3a2a1f"); p(x, 9, w, 20, "#e7d3a1"); p(x + 3, 13, w - 8, 1, "#b8955a"); p(x + 5, 18, w - 12, 1, "#b8955a"); p(x + w / 2, 15, 2, 2, "#b0302a"); }
      p(72, 0, 1, 6, "#2a2a2a"); p(62, 6, 22, 2, "#3a2a1f"); for (const x of [63, 72, 81]) { p(x, 3, 2, 3, "#f1e7c9"); p(x, 1, 2, 2, "#ffcf5a"); }
      p(0, 50, 160, 20, "#4a3a2e"); for (const y of [56, 63]) p(0, y, 160, 1, "#3d2f25");
      p(8, 46, 144, 5, "#6b4428"); p(8, 46, 144, 1, "#8a5c3c"); for (const x of [12, 76, 146]) p(x, 51, 3, 12, "#5a3a26");
      for (const x of [30, 64, 98, 132]) { p(x, 41, 2, 5, "#f1e7c9"); p(x, 39, 2, 2, "#ffcf5a"); }
      p(46, 43, 6, 3, "#c9c2b0"); p(110, 43, 8, 3, "#e7d3a1");
    },
  };

  const cache = {};
  const url = (key, make) => cache[key] || (cache[key] = make().toDataURL());
  window.XIB_ART = {
    chars: CHARS,
    scenes: SCENES,
    portrait: who => CHARS[who] ? url("c:" + who, () => portrait(CHARS[who])) : null,
    scene: name => SCENES[name] ? url("s:" + name, () => { const { c, p } = canvas(160, 70); SCENES[name](p); return c; }) : null,
  };
})();
