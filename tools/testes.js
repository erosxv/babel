// Testes automáticos do Xibolete. Rode antes e depois de cada mudança:
//   node tools/testes.js
// Confere três coisas, sem abrir o navegador:
//   1. os arquivos de conteúdo carregam e cada lição tem palavras e frases;
//   2. as histórias de cada idioma não têm saltos, itens ou dicas quebrados, e os ids dos capítulos não se repetem;
//   3. saves antigos (tools/saves-exemplo/*.json) abrem sem perder nada, com o mesmo código de index.html,
//      e juntar dois aparelhos (backup na nuvem) nunca diminui o progresso.
// Termina com "TUDO CERTO" ou com a lista do que falhou (e código de saída 1).
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FALHOU:", msg); } };
const section = t => console.log("\n" + t);

// ---------- 1. conteúdo ----------
section("1. Conteúdo");
global.window = {};
for (const f of ["data.js", "conversas.js", "historia.js", "historia-ru.js", "glossario.js", "alfabeto.js", "jornada.js"]) require(path.join(ROOT, f));
const LANGS = window.BABEL_LANGS, STORY = window.XIB_STORY, TALKS = window.XIB_TALKS;
for (const [k, L] of Object.entries(LANGS)) {
  ok(L.units.length > 0, `${k}: sem unidades`);
  L.units.forEach((u, i) => {
    ok(u.t && u.w && u.w.length >= 3, `${k} unidade ${i + 1}: precisa de título e pelo menos 3 palavras`);
    for (const w of u.w) ok(w[0] && w[1], `${k} unidade ${i + 1}: palavra sem texto ou tradução (${JSON.stringify(w)})`);
    for (const s of u.s) ok(s[0] && s[1], `${k} unidade ${i + 1}: frase sem texto ou tradução (${JSON.stringify(s)})`);
  });
}
for (const [k, list] of Object.entries(TALKS)) for (const t of list) {
  ok(t.id && t.steps && t.steps.length, `conversa ${k}/${t.id}: sem passos`);
  for (const s of t.steps) ok(s.npc && s.say && s.ok && s.ok.length, `conversa ${k}/${t.id}: passo incompleto`);
}
console.log(`  idiomas: ${Object.keys(LANGS).join(", ")} · histórias: ${Object.keys(STORY).join(", ")} · conversas: ${Object.keys(TALKS).join(", ")}`);

// ---------- 2. histórias ----------
section("2. Histórias");
const seenIds = new Map();
for (const [lang, st] of Object.entries(STORY)) {
  ok(st.cast && st.items && st.tips && st.arcs && st.chapters, `${lang}: história sem cast, items, tips, arcs ou chapters`);
  for (const c of st.chapters) {
    const where = `${lang}/${c.id}`;
    ok(!seenIds.has(c.id), `${where}: id repetido (já usado em ${seenIds.get(c.id)}). Use um prefixo do idioma, como "ru-"`);
    seenIds.set(c.id, lang);
    ok(st.arcs[c.arc], `${where}: arco ${c.arc} não existe`);
    ok(c.phrases && c.phrases.length, `${where}: sem frases do capítulo`);
    const ids = new Set(c.nodes.filter(n => n.id).map(n => n.id));
    const flagsSet = new Set(c.nodes.flatMap(n => (n.choice || []).map(o => o.flag).concat(n.flag)).filter(Boolean));
    c.nodes.forEach((n, i) => {
      const at = `${where} nó ${i}`;
      if (n.go && !n.choice) ok(ids.has(n.go), `${at}: go "${n.go}" não existe`);
      if (n.say) ok(st.cast[n.say], `${at}: personagem "${n.say}" não está no cast`);
      if (n.give) ok(st.items[n.give], `${at}: item "${n.give}" não existe`);
      for (const f of [n.when, n.unless]) if (f) ok(flagsSet.has(f), `${at}: a marca "${f}" nunca é ligada`);
      for (const o of n.choice || []) {
        if (o.go) ok(ids.has(o.go), `${at}: opção vai para "${o.go}", que não existe`);
        if (o.give) ok(st.items[o.give], `${at}: opção dá o item "${o.give}", que não existe`);
        if (o.tip) ok(st.tips[o.tip], `${at}: dica "${o.tip}" não existe`);
      }
      if (n.choice) ok(n.choice.some(o => o.ok), `${at}: escolha sem nenhuma resposta certa`);
      for (const o of n.explore || []) if (o.take) ok(st.items[o.take], `${at}: objeto dá "${o.take}", que não existe`);
      if (n.find) ok(n.objs.some(o => o.w === n.find), `${at}: o objeto procurado "${n.find}" não está na cena`);
    });
  }
  console.log(`  ${lang}: ${st.chapters.length} capítulos, ${Object.keys(st.cast).length} personagens, ${Object.keys(st.items).length} itens`);
}

// ---------- 3. saves ----------
section("3. Saves antigos e backup na nuvem");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const cut = (from, to) => { const a = html.indexOf(from); ok(a >= 0, `index.html: não achei "${from}"`); const b = html.indexOf(to, a); return html.slice(a, b + to.length); };
// the same code the app runs: the empty save, how a stored save is read, and how two devices are joined
const code = [
  cut("const fresh = () => ({", "\n});"),
  cut("const maxBy = ", "};"),
  cut("function mergeSaves(base, other) {", "\n}"),
  `function loadFrom(store) { let S = fresh();
    ${cut("try {\n  const raw = JSON.parse(localStorage.getItem(KEY)", "} catch {}")}
    return S; }`,
].join("\n");
const ctx = { Date, Math, JSON, Object, localStorage: null, KEY: "babel-save-v1" };
vm.createContext(ctx);
vm.runInContext(code.replace("function loadFrom(store) {", "function loadFrom(store) { localStorage = store;") + "\nthis.fresh = fresh; this.mergeSaves = mergeSaves; this.loadFrom = loadFrom;", ctx);
const store = obj => ({ getItem: k => (k === "babel-save-v1" ? JSON.stringify(obj) : null) });
// every value of the old save must still be there after loading (deep compare)
const keeps = (oldV, newV, at) => {
  if (oldV && typeof oldV === "object" && !Array.isArray(oldV)) { for (const k in oldV) keeps(oldV[k], newV && newV[k], at + "." + k); return; }
  ok(JSON.stringify(oldV) === JSON.stringify(newV), `${at}: era ${JSON.stringify(oldV)}, ficou ${JSON.stringify(newV)}`);
};
const dir = path.join(__dirname, "saves-exemplo");
const saves = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => [f, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]);
for (const [f, old] of saves) {
  const S = ctx.loadFrom(store(old));
  keeps(old, S, f);
  for (const k of Object.keys(ctx.fresh())) ok(k in S, `${f}: depois de abrir, falta o campo novo "${k}"`);
  for (const k of Object.keys(ctx.fresh().stats)) ok(k in S.stats, `${f}: depois de abrir, falta stats.${k}`);
  console.log(`  ${f}: abre sem perder nada (XP ${S.xp}, ${S.coins} moedas, ${S.hearts} vidas)`);
}
// joining two devices: nothing that grows may go down
const [a, b] = [saves[0][1], saves[saves.length - 1][1]];
const A = ctx.loadFrom(store(a)), B = ctx.loadFrom(store(b));
for (const [base, other, name] of [[A, B, "A+B"], [B, A, "B+A"]]) {
  const m = ctx.mergeSaves(base, other);
  ok(m.xp === Math.max(A.xp, B.xp), `${name}: XP devia ser o maior`);
  for (const S of [A, B]) {
    for (const l in S.progress) for (const k in S.progress[l]) ok((m.progress[l] || {})[k] >= S.progress[l][k], `${name}: lição ${l} ${k} diminuiu`);
    for (const k in S.ach) ok(k in m.ach, `${name}: conquista ${k} sumiu`);
    for (const k in S.story) ok(m.story[k] && m.story[k].stars >= S.story[k].stars, `${name}: capítulo ${k} perdeu estrelas`);
    for (const k in S.srs) ok(m.srs[k] && m.srs[k].s >= S.srs[k].s, `${name}: palavra ${k} perdeu nível na revisão`);
  }
}
// acertos por habilidade: em cada idioma e habilidade fica o registro com mais respostas, e um save antigo
// (sem registro) nunca apaga o de outro aparelho
const withSkill = Object.assign({}, A, { skill: { en: { vocab: { n: 40, ok: 30, h: "1101" }, listen: { n: 3, ok: 1, h: "100" } }, ru: { speak: { n: 9, ok: 8, h: "111111110" } } } });
const otherSkill = Object.assign({}, B, { skill: { en: { vocab: { n: 12, ok: 12, h: "111111111111" }, listen: { n: 20, ok: 15, h: "1" } } } });
for (const [base, other, name] of [[withSkill, otherSkill, "A+B"], [otherSkill, withSkill, "B+A"]]) {
  const m = ctx.mergeSaves(base, other);
  ok(m.skill.en.vocab.n === 40 && m.skill.en.listen.n === 20 && m.skill.ru.speak.n === 9, `${name}: habilidades deviam ficar com o maior registro (${JSON.stringify(m.skill)})`);
}
for (const [base, other, name] of [[A, withSkill, "antigo+novo"], [withSkill, A, "novo+antigo"]]) {
  const m = ctx.mergeSaves(base, other);
  ok(m.skill.en && m.skill.en.vocab.n === 40, `${name}: o save sem habilidades apagou o registro`);
}
ok(JSON.stringify(ctx.loadFrom(store(a)).skill) === "{}", "save antigo: o registro de habilidades devia começar vazio, sem inventar dados");

// semana da jornada: os marcos de jornada.js fazem sentido, pagam uma vez por semana e juntar aparelhos não perde nenhum
const J = window.XIB_JORNADA;
ok(J && J.marcos.length && J.volta && J.volta.titulo && J.voltaDias >= 1, "jornada.js: faltam marcos, voltaDias ou o texto de volta");
ok(new Set(J.marcos.map(m => m.id)).size === J.marcos.length, "jornada.js: ids de marcos repetidos");
for (const m of J.marcos) ok(m.id && m.dias >= 1 && m.dias <= 7 && m.moedas > 0 && m.nome && m.texto, `jornada.js: marco incompleto ${JSON.stringify(m)}`);
const wctx = { Date, Math, Object, window: { XIB_JORNADA: J }, S: null, esc: x => x, I: x => x };
vm.createContext(wctx);
vm.runInContext([cut("const pad = ", ";"), cut("const dkey = ", ";"), cut("const JOR = ", "\n  return got;\n}")].join("\n") + "\nthis.weekOf = weekOf; this.claimWeek = claimWeek; this.dkey = dkey;", wctx);
{
  const t = wctx.dkey(), days = wctx.weekOf();
  ok(days.length === 7 && days.includes(t) && new Date(days[0] + "T12:00").getDay() === 1, `a semana devia ir de segunda a domingo e conter hoje (${days})`);
  const S = wctx.S = { coins: 0, week: {}, day: {} };
  for (const k of days) if (k <= t) S.day[k] = { xp: 10 };
  S.day[wctx.weekOf(t, 1)[0]] = { xp: 50 };  // last week does not count for this one
  S.day[days[0]] = S.day[days[0]] || {}; S.day[days[0]].sec = { en: 600 };  // minutes alone count too
  const n = days.filter(k => k <= t).length, due = J.marcos.filter(m => m.dias <= n);
  const got = wctx.claimWeek();
  ok(got.length === due.length && S.coins === due.reduce((a, m) => a + m.moedas, 0), `marcos: com ${n} dias devia pagar ${due.length} marcos (pagou ${got.length}, ${S.coins} moedas)`);
  const again = wctx.claimWeek();
  ok(again.length === 0 && S.coins === due.reduce((a, m) => a + m.moedas, 0), "marcos: pagaram duas vezes na mesma semana");
  const m = ctx.mergeSaves(Object.assign({}, A, { week: { "2026-10-19": { d2: true } } }), Object.assign({}, B, { week: { "2026-10-19": { d4: true }, "2026-10-26": { d2: true } } }));
  ok(m.week["2026-10-19"].d2 && m.week["2026-10-19"].d4 && m.week["2026-10-26"].d2, `juntar aparelhos perdeu marcos já pagos (${JSON.stringify(m.week)})`);
  ok(JSON.stringify(ctx.loadFrom(store(a)).week) === "{}", "save antigo: a semana devia começar vazia");
}
// Mercado do Viajante: pulseiras e títulos de jornada.js fazem sentido, cada título tem regra no app,
// pulseiras compradas em um aparelho nunca somem ao juntar, e um save antigo começa sem nada comprado
{
  ok(J.pulseiras.filter(b => !b.preco).length === 1, "jornada.js: devia haver exatamente uma pulseira grátis (preço 0)");
  ok(new Set(J.pulseiras.map(b => b.id)).size === J.pulseiras.length, "jornada.js: ids de pulseiras repetidos");
  for (const b of J.pulseiras) ok(b.id && b.nome && /^#[0-9a-f]{6}$/i.test(b.cor) && b.preco >= 0, `jornada.js: pulseira incompleta ${JSON.stringify(b)}`);
  ok(J.estante >= 1, "jornada.js: a estante precisa de pelo menos 1 lugar");
  const rules = cut("const TITLE_RULES = {", "\n};");
  ok(new Set(J.titulos.map(t => t.id)).size === J.titulos.length, "jornada.js: ids de títulos repetidos");
  for (const t of J.titulos) ok(t.nome && t.texto && rules.includes(`\n  ${t.id}: `), `título "${t.id}": falta nome, texto ou a regra em TITLE_RULES (index.html)`);
  const m = ctx.mergeSaves(Object.assign({}, A, { bracelets: { jade: true }, bracelet: "jade" }), Object.assign({}, B, { bracelets: { rubi: true }, bracelet: "rubi", shelf: ["a1c1"], titleSel: "leitor" }));
  ok(m.bracelets.jade && m.bracelets.rubi && m.bracelet === "jade" && m.shelf[0] === "a1c1" && m.titleSel === "leitor", `juntar aparelhos perdeu pulseiras ou escolhas (${JSON.stringify([m.bracelets, m.bracelet, m.shelf, m.titleSel])})`);
  const old = ctx.loadFrom(store(a));
  ok(JSON.stringify(old.bracelets) === "{}" && old.bracelet === "" && old.shelf.length === 0 && old.titleSel === "", "save antigo: devia começar sem pulseiras compradas nem escolhas");
}

const empty = ctx.loadFrom({ getItem: () => null });
ok(empty.coins === 50 && empty.hearts === 5 && !empty.onboarded, "sem save: devia começar do zero com 50 moedas e 5 vidas");
const broken = ctx.loadFrom({ getItem: () => "{isto não é json" });
ok(broken.coins === 50, "save corrompido: devia começar do zero sem travar");

console.log(`\n${checks} verificações. ${fails ? fails + " FALHARAM." : "TUDO CERTO."}`);
process.exit(fails ? 1 : 0);
