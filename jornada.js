// Semana da jornada: os marcos da semana e o "bem-vindo de volta". Dá para editar este arquivo sem mexer no app.
//
// Um dia conta como estudado quando você ganhou XP nele (lição, treino, conversa, história, alfabeto)
// ou passou pelo menos `minutosDia` minutos estudando, em qualquer idioma.
// A semana vai de segunda a domingo. Cada marco paga suas moedas uma vez por semana, quando o número de
// dias estudados chega em `dias`. Os marcos não exigem os 7 dias: um dia de folga não tira nada.
//
// marcos: { id (único, não mude depois de publicado), dias (1 a 7), moedas, nome, texto }
// voltaDias: quantos dias sem estudar contam como "voltar" (aparece a mensagem de boas-vindas uma vez)
// volta: o texto dessa mensagem. {dias} vira o número de dias longe.
window.XIB_JORNADA = {
  minutosDia: 3,
  marcos: [
    { id: "d2", dias: 2, moedas: 10, nome: "Pegando o ritmo", texto: "Estude em 2 dias da semana" },
    { id: "d4", dias: 4, moedas: 25, nome: "Semana firme", texto: "Estude em 4 dias da semana" },
    { id: "d6", dias: 6, moedas: 40, nome: "Semana completa", texto: "Estude em 6 dias da semana (um dia de folga vale)" },
  ],
  voltaDias: 3,
  volta: {
    titulo: "Que bom ter você de volta!",
    texto: "Faz {dias} dias desde o último estudo. Nada se perdeu: suas lições, palavras e capítulos estão aqui. Uma lição ou um treino curto ajudam a memória a voltar.",
  },

  // ---------- Mercado do Viajante ----------
  // pulseiras: cores da pulseira que brilha na história quando você responde bem. Compradas com moedas,
  // valem em todas as histórias. A de preço 0 é a que todo mundo já tem.
  //   { id (único, não mude depois de publicado), nome, cor (#rrggbb), preco }
  pulseiras: [
    { id: "ouro", nome: "Ouro", cor: "#ffe08a", preco: 0 },
    { id: "jade", nome: "Jade", cor: "#7fe0b0", preco: 80 },
    { id: "rubi", nome: "Rubi", cor: "#ff8f9e", preco: 120 },
    { id: "safira", nome: "Safira", cor: "#8fb8ff", preco: 150 },
    { id: "ametista", nome: "Ametista", cor: "#c79bff", preco: 200 },
    { id: "aurora", nome: "Aurora", cor: "#9ff5f0", preco: 300 },
  ],
  // estante: quantas lembranças cabem na estante do perfil. As lembranças vêm de graça: cada capítulo
  // terminado da história dá uma (o último objeto que você ganhou nele, ou um cartão-postal do lugar).
  estante: 6,
  // títulos: ganhos estudando, nunca comprados. Você escolhe um para aparecer no perfil.
  // A regra de cada id fica no app (index.html, TITLE_RULES); aqui ficam o nome e a explicação.
  titulos: [
    { id: "unidade1", nome: "Pé na estrada", texto: "Termine a primeira unidade de um idioma." },
    { id: "memoria", nome: "Memória de ferro", texto: "Tenha 50 palavras bem fixadas na revisão (força 4 ou mais)." },
    { id: "ouvido", nome: "Ouvido afiado", texto: "Chegue a 85% de acertos em compreensão auditiva, com pelo menos 30 respostas." },
    { id: "voz", nome: "Voz firme", texto: "Chegue a 85% de acertos em pronúncia, com pelo menos 30 respostas." },
    { id: "conversa", nome: "Boa de papo", texto: "Faça 5 conversas guiadas." },
    { id: "leitor", nome: "Leitor de histórias", texto: "Termine 5 capítulos de história." },
    { id: "semana", nome: "Semana completa", texto: "Estude em 6 dias de uma mesma semana." },
    { id: "dois", nome: "Dois caminhos", texto: "Conclua lições em dois idiomas." },
  ],
};
