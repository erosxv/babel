// Mostra, por idioma, as palavras que o aluno pode tocar e que ainda não têm significado em glossario.js.
// Uso (na pasta do projeto):  node tools/glossario-faltam.js
// Escreve tools/glossario-faltam-<idioma>.txt (palavra, TAB, a primeira frase onde ela aparece).
const fs = require("fs"), vm = require("vm"), dir = require("path").join(__dirname, ".."), outDir = __dirname;
const window = {}; const ctx = vm.createContext({ window });
for (const f of ["data.js", "historia.js", "historia-ru.js", "conversas.js"]) vm.runInContext(fs.readFileSync(dir + "/" + f, "utf8"), ctx);
let gloss = {};
if (fs.existsSync(dir + "/glossario.js")) { vm.runInContext(fs.readFileSync(dir + "/glossario.js", "utf8"), ctx); gloss = window.XIB_GLOSS || {}; }
const L = window.BABEL_LANGS, ST = window.XIB_STORY, TK = window.XIB_TALKS || {};
const RX = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}]+)*/gu;
const stats = {};
for (const k of Object.keys(L)) {
  const texts = [], known = {};
  for (const u of L[k].units) {
    for (const w of u.w) { texts.push(w[0]); const t = w[0].split("/")[0].trim().toLowerCase(); if (!/\s/.test(t)) known[t] = w[1]; }
    for (const s of u.s) texts.push(s[0]);
  }
  const st = ST[k];
  if (st) for (const c of st.chapters) for (const n of c.nodes) {
    if (n.t) texts.push(n.t); if (n.line) texts.push(n.line);
    for (const o of n.choice || []) { texts.push(o.t); if (o.react) texts.push(o.react); }
    for (const o of n.explore || []) texts.push(o.w);
    for (const o of n.objs || []) texts.push(o.w);
    for (const p of c.phrases || []) texts.push(p[0]);
  }
  for (const t of TK[k] || []) for (const s of t.steps || []) { if (s.npc) texts.push(s.npc); if (s.say) texts.push(s.say.split("|")[0]); }
  const ex = new Map();
  for (const t of texts) { const line = String(t).split("/")[0]; for (const w of line.match(RX) || []) { const lw = w.toLowerCase(); if (!ex.has(lw)) ex.set(lw, line); } }
  const g = gloss[k] || {};
  const missing = [...ex.keys()].filter(w => !known[w] && !g[w]).sort();
  stats[k] = { words: ex.size, missing: missing.length };
  fs.writeFileSync(outDir + "/glossario-faltam-" + k + ".txt", missing.map(w => w + "\t" + ex.get(w)).join(String.fromCharCode(10)));
}
console.log(JSON.stringify(stats));
