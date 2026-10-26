// Lists every English line the game reads aloud, with the voice that should say it.
// Run: node tools/frases-en.js  → writes tools/frases-en.json, used by tools/gerar-audio.py.
// The key of each line is the same hash index.html uses to find its audio file (audioKey).
const fs = require("fs"), path = require("path");
global.window = {};
for (const f of ["data.js", "conversas.js", "historia.js", "alfabeto.js"]) require(path.join(__dirname, "..", f));
const L = window.BABEL_LANGS.en, SOUNDS = window.BABEL_SOUNDS.en, TALKS = window.XIB_TALKS.en, ST = window.XIB_STORY.en;

// American voices from Kokoro. The learner's own lines use one voice; each character has theirs.
const TEACHER = "af_heart", YOU = "am_michael", WHISPER = "af_nicole";
const CAST = { rosie: "af_sarah", tobias: "am_eric", mei: "af_nova", bram: "am_onyx", marcus: "am_fenrir", iris: "af_kore",
  lena: "af_bella", pip: "am_puck", ola: "af_aoede", ana: "af_jessica" };
const TALK_VOICES = ["af_sarah", "am_adam", "af_bella", "am_eric", "af_nova", "am_liam", "af_kore", "am_echo", "af_aoede", "am_onyx"];

const first = s => String(s).split("|")[0].trim();
// FNV-1a over UTF-16 code units, as in index.html
const audioKey = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
const out = new Map();
const add = (text, voice) => { const t = first(text); if (t && !out.has(t)) out.set(t, voice); };

for (const u of L.units) { for (const w of u.w) add(w[0], TEACHER); for (const s of u.s) add(s[0], TEACHER); }
for (const s of SOUNDS) { for (const e of s.ex) add(e[0], TEACHER); for (const p of s.pairs) { add(p[0], TEACHER); add(p[1], TEACHER); } }
TALKS.forEach((t, i) => { const v = TALK_VOICES[i % TALK_VOICES.length]; for (const s of t.steps) { add(s.npc, v); add(s.say, YOU); } });

const num = n => ST.pay.num[n] ?? String(n), coins = n => n === 1 ? ST.pay.coins[0] : ST.pay.coins[1];
const pay = (k, n, p = 0) => ST.pay[k].replace("{n}", num(n)).replace("{p}", num(p)).replace("{coins}", coins(n));
const prices = new Set();
for (const c of ST.chapters) {
  let who = null;
  for (const n of c.nodes) {
    if (n.say) { who = n.say; add(n.t, CAST[who] || TEACHER); }
    for (const o of n.choice || []) { add(o.t, YOU); if (o.react) add(o.react, CAST[who] || TEACHER); }
    for (const o of n.explore || []) add(o.w, TEACHER);
    if (n.find) { add(n.line, CAST[who] || TEACHER); for (const o of n.objs) { add(o.w, TEACHER); if (o.no) add(o.no, CAST[who] || TEACHER); } }
    if (n.memory) add(n.memory[0], WHISPER);
    if (n.pay) { prices.add(n.pay); add(pay("line", n.pay), CAST[who] || TEACHER); }
  }
  for (const p of c.phrases || []) add(p[0], YOU);
}
add(pay("ok", 1), TEACHER);
for (let n = 1; n <= 30; n++) add(pay("over", n), TEACHER);
for (const p of prices) for (let n = 0; n < p; n++) add(pay("short", n, p), TEACHER);
add("Hey! Can I get a coffee, please?", TEACHER);
// the alphabet tab: each letter's name and its example word. A lone letter is spelled out for the voice
// ("B" → "bee"), or it would be read as a word.
const SPELL = { A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "eff", G: "jee", H: "aitch", I: "eye", J: "jay", K: "kay", L: "el", M: "em",
  N: "en", O: "oh", P: "pee", Q: "cue", R: "are", S: "ess", T: "tee", U: "you", V: "vee", W: "double you", X: "ex", Y: "why", Z: "zee" };
const TTS = new Map();
for (const g of window.XIB_ABC.en.grupos) for (const l of g[1]) { add(l[2], TEACHER); if (SPELL[l[2]] && !TTS.has(l[2])) TTS.set(l[2], SPELL[l[2]]); add(l[4], TEACHER); }

// every word of every line, alone: tapping a word in the app says it with this clip
for (const t of [...out.keys()]) for (const w of t.match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}]+)*/gu) || []) add(w, TEACHER);

const list = [...out].map(([text, voice]) => Object.assign({ key: audioKey(text), text, voice }, TTS.has(text) ? { tts: TTS.get(text) } : {}));
fs.writeFileSync(path.join(__dirname, "frases-en.json"), JSON.stringify(list, null, 1));
console.log(list.length, "frases,", list.reduce((a, x) => a + x.text.length, 0), "letras");
