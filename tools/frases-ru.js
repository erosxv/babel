// Lists every Russian line the game reads aloud, with the voice that should say it.
// Run: node tools/frases-ru.js  → writes tools/frases-ru.json, used by tools/gerar-audio-ru.py.
// The key of each line is the same hash index.html uses to find its audio file (audioKey).
const fs = require("fs"), path = require("path");
global.window = {};
for (const f of ["data.js", "conversas.js", "historia-ru.js", "alfabeto.js"]) require(path.join(__dirname, "..", f));
const L = window.BABEL_LANGS.ru, SOUNDS = (window.BABEL_SOUNDS || {}).ru || [], TALKS = window.XIB_TALKS.ru, ST = window.XIB_STORY.ru;

// Silero has five Russian voices (aidar, eugene: men; baya, kseniya, xenia: women).
// "voice:pitch" changes the pitch (x-low, low, high, x-high), so more characters get a voice of their own.
const TEACHER = "xenia", YOU = "aidar", WHISPER = "baya:low";
const CAST = { vera: "baya:low", ivan: "eugene", katya: "xenia:high", dmitri: "aidar:low", olga: "kseniya", misha: "eugene:x-high",
  lev: "eugene:x-low", sonya: "kseniya:high", fyodor: "eugene:low" };
const TALK_VOICE = { chai: "kseniya", meet: "eugene", way: "baya:low", market: "aidar:low", hotel: "xenia", train: "baya",
  pharmacy: "kseniya:low", taxi: "eugene:low", dinner: "xenia:high", phone: "baya:high" };

const first = s => String(s).split("|")[0].trim();
// FNV-1a over UTF-16 code units, as in index.html
const audioKey = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
const out = new Map();
const add = (text, voice) => { const t = first(text); if (t && !out.has(t)) out.set(t, voice); };

for (const u of L.units) { for (const w of u.w) add(w[0], TEACHER); for (const s of u.s) add(s[0], TEACHER); }
for (const s of SOUNDS) { for (const e of s.ex) add(e[0], TEACHER); for (const p of s.pairs || []) { add(p[0], TEACHER); add(p[1], TEACHER); } }
for (const t of TALKS) { const v = TALK_VOICE[t.id] || TEACHER; for (const s of t.steps) { add(s.npc, v); add(s.say, YOU); } }

const num = n => ST.pay.num[n] ?? String(n);
// монета / монеты / монет, by the Russian rule for 1, 2-4 and 5+
const coins = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? ST.pay.coins[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? ST.pay.coins[1] : ST.pay.coins[2] ?? ST.pay.coins[1]; };
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
// the alphabet tab: each letter's name and its example word
for (const g of window.XIB_ABC.ru.grupos) for (const l of g[1]) { add(l[2], TEACHER); add(l[4], TEACHER); }

// every word of every line, alone: tapping a word in the app says it with this clip
for (const t of [...out.keys()]) for (const w of t.match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}]+)*/gu) || []) if (/[а-яё]/i.test(w)) add(w, TEACHER);

// What the voice actually reads, when it differs from the text on screen: "*" is a name the learner
// says, and the Latin words in the Russian lines are spelled in Cyrillic so the voice can read them.
const LATIN = { obrigado: "обригадо" };
// a lone letter the voice cannot say by itself
const SPELL = { "ё": "йо" };
const ttsOf = t => {
  if (SPELL[t]) return SPELL[t];
  let s = t.replace(/\*/g, "Тео").replace(/[A-Za-z]+/g, w => LATIN[w.toLowerCase()] || w);
  return s === t ? null : s;
};
const list = [...out].map(([text, voice]) => Object.assign({ key: audioKey(text), text, voice }, ttsOf(text) ? { tts: ttsOf(text) } : {}));
const odd = list.filter(x => /[A-Za-z0-9]/.test(x.tts || x.text)).map(x => x.text);
if (odd.length) console.log("Linhas com letras latinas ou números (a voz pode não ler):", odd);
fs.writeFileSync(path.join(__dirname, "frases-ru.json"), JSON.stringify(list, null, 1));
console.log(list.length, "frases,", list.reduce((a, x) => a + x.text.length, 0), "letras");
