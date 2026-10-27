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
};
