// Story mode (Modo História): a visual-novel RPG that climbs A1 → B2, one arc per step of the ziggurat.
// For now it exists in English only.
//
// A chapter is a list of nodes played in order; `id` marks a jump target and `go` jumps to one.
//   { scene, label }                       change the backdrop
//   { nar }                                narration, in Portuguese
//   { say: who, t, pt }                    a line spoken by a character (read aloud)
//   { choice: [opt…] }                     the learner answers by tapping or speaking. An option:
//       t       the line;  alt  other ways to say it that also count (lowercase, no punctuation)
//       ok      true for a right answer;  rude  correct but impolite
//       react   what the character says back;  tip  key of TIPS shown as a thought balloon
//       retry   ask again after the reaction;  cost  coins lost;  give  item gained;  flag  remembered
//       go      jump to this id afterwards
//   { explore: [obj…], all }               tap the objects in the room to learn their names
//   { find: obj, line, pt, objs: [obj…] }  look for something where the character says it is
//   { pay: n }                             count out n coins
//   { give: item } / { coins: n } / { memory: [en, pt] }
//   `when` / `unless` on any node: play it only if a flag is (or isn't) set.
window.XIB_STORY = {
  en: {
    cast: {
      rosie: { name: "Rosie", color: "#d9643a", role: "Dona da pousada" },
    },
    // things you can carry; the card teaches the word
    items: {
      backpack: { w: "backpack", pt: "mochila", ex: "My backpack is pretty heavy.", exPt: "Minha mochila é bem pesada.", ic: "🎒" },
      water: { w: "a bottle of water", pt: "uma garrafa de água", ex: "Can I get a bottle of water?", exPt: "Me vê uma garrafa de água?", ic: "💧" },
      key: { w: "key", pt: "chave", ex: "Can I get the key, please?", exPt: "Me dá a chave, por favor?", ic: "🔑" },
      map: { w: "map", pt: "mapa", ex: "I need a map. I'm lost!", exPt: "Preciso de um mapa. Estou perdido!", ic: "🗺️" },
      note: { w: "note", pt: "bilhete", ex: "Go to the Guild. Ask for Marcus.", exPt: "Vá até a Guilda. Pergunte pelo Marcus.", ic: "📜" },
    },
    tips: {
      tobe: "Em inglês, o verbo to be não pode sumir: I'm okay = I am okay (eu estou bem). E quem fala é I, nunca me.",
      neg: "Para negar uma ação, use don't antes do verbo: I don't know (eu não sei). O no sozinho serve para responder “não”.",
      nice: "Quando alguém diz Nice to meet you, a resposta é Nice to meet you too (prazer, igualmente).",
      from: "Para dizer de onde você é: I'm from Brazil. Se não sabe: I'm not sure (não tenho certeza).",
      polite: "Give me the key está certo, mas soa grosso. No dia a dia se pede com Can I get…, please? (Me vê…, por favor?)",
      order: "Em inglês a ordem é quem faz + ação + coisa. Mas para pedir, o natural é perguntar: Can I get the key?",
      numbers: "Conte com calma: one, two, three, four, five (1, 2, 3, 4, 5).",
      like: "Para dizer que não gosta: I don't like coffee (eu não gosto de café). O don't vem antes do verbo.",
      grumpy: "Só falar as palavras soa grosso. Tente: Can I get some coffee, please?",
      bye: "Para se despedir: Bye!, See ya! (até mais) ou Thanks for everything! (obrigado por tudo).",
    },
    arcs: [
      { lvl: "A1", t: "O Despertar Sem Memória", sub: "Saudações, objetos do dia a dia, verbo to be e presente simples" },
      { lvl: "A2", t: "A Jornada pela Guilda", sub: "Direções, passado simples, rotina, compras e descrições" },
      { lvl: "B1", t: "O Mistério da Cidade Grande", sub: "Planos, opiniões, sentimentos e present perfect" },
      { lvl: "B2", t: "A Conspiração do Trono", sub: "Debates, phrasal verbs, condicionais e argumentação" },
    ],
    chapters: [
      {
        id: "a1c1", arc: 0, n: 1, t: "Wake Up", tPt: "Acorde", purse: 10,
        blurb: "Você acorda numa pousada sem lembrar de nada. A dona, Rosie, bate na porta.",
        phrases: [["I'm okay.", "Estou bem."], ["I don't know.", "Não sei."], ["I'm not sure.", "Não tenho certeza."], ["Nice to meet you too.", "Prazer, igualmente."],
          ["Can I get the key, please?", "Me dá a chave, por favor?"], ["Can I get some coffee and bread?", "Me vê um café e pão?"], ["I don't like coffee.", "Eu não gosto de café."], ["Thanks for everything!", "Obrigado por tudo!"]],
        nodes: [
          { scene: "room", label: "Um quarto · The Sleepy Fox" },
          { nar: "Você abre os olhos. Chão de madeira, cheiro de pão… e nenhuma lembrança. Nem do seu próprio nome." },
          { nar: "No seu pulso, uma pulseira com um zigurate gravado brilha fraquinho. Ela parece reagir quando alguém fala." },
          { nar: "Toc, toc! Alguém bate na porta." },
          { say: "rosie", t: "Hey! You okay in there?", pt: "Ei! Tudo bem aí dentro?" },
          { choice: [
            { t: "Yeah, I'm okay.", ok: true, alt: ["i'm okay", "yeah i'm fine", "i'm fine", "i'm good", "yeah i'm good", "yes i'm okay", "i am okay", "yeah i am okay"], react: "Oh, good! You were out cold." },
            { t: "I okay.", tip: "tobe", retry: true, react: "You… okay? Did you hit your head or something?" },
            { t: "Me is okay.", tip: "tobe", retry: true, react: "“Me is”? Wow. Okay, take it easy, buddy." },
          ] },
          { nar: "A pulseira esquenta. Antes de abrir a porta, você olha em volta. Toque em cada objeto para lembrar o nome dele em inglês." },
          { explore: [
            { w: "bed", pt: "cama", ic: "🛏️", ex: "The bed is super comfy.", exPt: "A cama é super confortável." },
            { w: "window", pt: "janela", ic: "🪟", ex: "Can you open the window?", exPt: "Pode abrir a janela?" },
            { w: "door", pt: "porta", ic: "🚪", ex: "Close the door, please.", exPt: "Feche a porta, por favor." },
            { w: "chair", pt: "cadeira", ic: "🪑", ex: "Grab a chair!", exPt: "Pega uma cadeira!" },
            { w: "backpack", pt: "mochila", ic: "🎒", take: "backpack" },
            { w: "a bottle of water", pt: "uma garrafa de água", ic: "💧", take: "water" },
          ] },
          { say: "rosie", t: "So… what's your name?", pt: "Então… qual é o seu nome?" },
          { choice: [
            { t: "I don't know.", ok: true, alt: ["i dont know", "i do not know", "i don't remember", "i dunno"], react: "You don't know? Wow. Okay…" },
            { t: "I'm not sure.", ok: true, alt: ["im not sure", "not sure"], react: "Not sure? Okay, that's weird…" },
            { t: "I no know.", tip: "neg", retry: true, react: "You… no know? Hmm, you must be really tired." },
          ] },
          { say: "rosie", t: "Well, I'll call you Newbie. Nice to meet you, Newbie!", pt: "Bom, vou te chamar de Novato. Prazer, Novato!" },
          { choice: [
            { t: "Nice to meet you too.", ok: true, alt: ["nice to meet you", "you too", "nice meeting you", "nice to meet you too rosie"], react: "Aw, you're sweet." },
            { t: "Me too meet.", tip: "nice", retry: true, react: "Me too… what? Haha, you're funny." },
          ] },
          { say: "rosie", t: "And where are you from?", pt: "E de onde você é?" },
          { choice: [
            { t: "I'm not sure.", ok: true, alt: ["im not sure", "not sure"], react: "Huh. A real mystery, aren't you?" },
            { t: "I don't know.", ok: true, alt: ["i dont know", "i dunno"], react: "Huh. A real mystery, aren't you?" },
            { t: "I from no.", tip: "from", retry: true, react: "From… no? Is that a place?" },
          ] },
          { nar: "Você gira a maçaneta. Trancada! A Rosie está com a chave do outro lado." },
          { say: "rosie", t: "Oh, the door's locked. My bad!", pt: "Ah, a porta tá trancada. Foi mal!" },
          { choice: [
            { t: "Can I get the key, please?", ok: true, alt: ["can i get the key", "can i have the key please", "can i have the key", "can you give me the key please", "key please"], react: "Sure thing! Here you go.", give: "key", flag: "polite" },
            { t: "Give me the key.", rude: true, tip: "polite", react: "Whoa. Okay… “please” is free, you know. That's two coins for the attitude.", cost: 2, give: "key", flag: "rude" },
            { t: "Key me give.", tip: "order", react: "Key… me… give? I don't get it. Hmm, there's a spare key in there somewhere.", go: "search" },
          ] },
          { go: "downstairs" },
          { id: "search", nar: "Caminho mais longo: procure a chave reserva no quarto. Ouça a dica da Rosie." },
          { find: "bed", line: "Try under the bed!", pt: "Tenta embaixo da cama!", objs: [
            { w: "window", pt: "janela", ic: "🪟", no: "Not the window!" },
            { w: "chair", pt: "cadeira", ic: "🪑", no: "Nope, not the chair." },
            { w: "bed", pt: "cama", ic: "🛏️" },
            { w: "door", pt: "porta", ic: "🚪", no: "It's not by the door." },
          ] },
          { give: "key" },
          { say: "rosie", t: "You found it? Nice! Come on down.", pt: "Achou? Boa! Pode descer." },
          { id: "downstairs", scene: "counter", label: "O balcão · The Sleepy Fox" },
          { nar: "Você desce a escada. A Rosie está atrás do balcão, secando uma caneca." },
          { say: "rosie", t: "Okay, Newbie. That's five coins for the room.", pt: "Certo, Novato. São cinco moedas pelo quarto." },
          { pay: 5 },
          { say: "rosie", t: "Thanks! You hungry? Coffee? Bread?", pt: "Valeu! Tá com fome? Café? Pão?" },
          { choice: [
            { t: "Can I get some coffee and bread?", ok: true, alt: ["can i get coffee and bread", "can i get some coffee and some bread", "coffee and bread please", "can i have some coffee and bread", "can i get some coffee", "can i get some bread"], react: "Coming right up!", flag: "ate" },
            { t: "I don't like coffee. Can I get some water?", ok: true, alt: ["i don't like coffee", "i dont like coffee can i get some water", "can i get some water", "water please", "can i get some water please"], react: "No coffee? Okay, water it is.", flag: "ate" },
            { t: "I like no coffee.", tip: "like", retry: true, react: "You… like no coffee? Like, you don't like it?" },
            { t: "Coffee. Bread. Now.", rude: true, tip: "grumpy", react: "Wow. Somebody's grumpy in the morning. Fine. That's one extra coin.", cost: 1, flag: "ate" },
          ] },
          { when: "polite", say: "rosie", t: "And since you asked so nicely, breakfast is on the house!", pt: "E como você pediu com tanta educação, o café é por conta da casa!" },
          { unless: "polite", say: "rosie", t: "That's two coins for breakfast.", pt: "São duas moedas pelo café." },
          { unless: "polite", coins: -2 },
          { nar: "Enquanto você come, a pulseira brilha forte, como nunca. Uma palavra volta à sua memória…" },
          { memory: ["Tower", "Torre"] },
          { say: "rosie", t: "Whoa, your bracelet! I've seen that symbol before… Here, take this. Go to the Guild and ask for Marcus.", pt: "Nossa, sua pulseira! Já vi esse símbolo antes… Toma, leva isso. Vai até a Guilda e pergunta pelo Marcus." },
          { give: "note" },
          { give: "map" },
          { choice: [
            { t: "Thanks for everything!", ok: true, alt: ["thanks for everything rosie", "thank you for everything", "thanks rosie", "thank you rosie", "thanks", "thank you"], react: "Anytime, Newbie." },
            { t: "Bye! See ya!", ok: true, alt: ["bye", "see ya", "see you", "bye see you", "see ya rosie", "bye rosie"], react: "See ya!" },
            { t: "Me go now thanks.", tip: "bye", retry: true, react: "“Me go”? Haha, okay, caveman." },
          ] },
          { say: "rosie", t: "Be careful out there. Shinar's a big city.", pt: "Toma cuidado lá fora. Shinar é uma cidade grande." },
          { nar: "Você sai pela porta da pousada. O porto de Shinar se abre à sua frente. Ao longe, uma torre enorme some entre as nuvens." },
        ],
      },
    ],
  },
};
