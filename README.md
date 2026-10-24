# Xibolete

Aprenda idiomas jogando e falando em voz alta. É um jogo no navegador, sem instalação, para estudar **inglês, espanhol, francês, italiano e russo** a partir do português.

## Como funciona

- **Mapa de fases:** cada idioma tem 8 unidades (o russo tem 9, começando pelo alfabeto cirílico). Cada unidade tem 3 lições, uma prova de fala e um baú de recompensa.
- **Exercícios variados:** palavra nova, escolher a tradução, ouvir e escolher, formar pares, montar frases com peças, escrever a resposta, falar em voz alta e treino de ouvido.
- **XP e níveis:** cada acerto vale XP, com bônus de combo para acertos seguidos. Os níveis vão de Turista a Mestre do Xibolete.
- **Vidas:** cada erro numa lição custa 1 vida. Uma vida volta a cada 30 minutos, e um treino completo devolve 1. Exercícios de fala e de ouvido nunca custam vida.
- **Sequência de dias, meta diária e missões do dia.** Uma das missões é sempre de fala.
- **Moedas e loja:** recarga de vidas, protetor de sequência e XP em dobro.
- **28 conquistas.**
- **Treino com repetição espaçada:** as palavras que você mais erra voltam com mais frequência.

## História (por enquanto só em inglês)

Um RPG no estilo visual novel, em 4 arcos que acompanham os degraus do zigurate: A1 "O Despertar Sem Memória", A2 "A Jornada pela Guilda", B1 "O Mistério da Cidade Grande" e B2 "A Conspiração do Trono". Você acorda sem memória em Shinar e conversa com os personagens respondendo em voz alta ou tocando nas opções.

- **Mochila:** os itens que você pega ficam guardados, cada um com a palavra em inglês, pronúncia e frase de exemplo.
- **Erros têm consequência:** o personagem estranha o que você disse, um balão explica a regra em português, e o erro pode custar moedas ou levar a um caminho mais longo. Falar bem e com educação rende desconto e recompensas.
- **Pronúncia em primeiro lugar:** quando você responde falando, o app mostra quais palavras saíram bem e quais precisam de treino. Se você tocar na resposta em vez de falar, o jogo pede "Agora diga você" e dá nota.
- **Treino de fala no fim de cada capítulo:** você repete em voz alta as frases do dia a dia que apareceram, e a tela final mostra sua média de pronúncia.
- **A pulseira brilha** quando você fala com boa pronúncia.
- As frases de cada capítulo podem ir direto para o caderno.
- Os lugares da história são desenhados em estilo HD-2D (como Octopath Traveler e Dragon Quest III HD-2D) por `hd2d.js`: cenários em 3D com texturas de pixel art, sombras suaves, desfoque de profundidade e brilho. A primeira vez leva alguns segundos (o desenho roda em segundo plano, em `hd2d-worker.js`) e depois fica guardado no aparelho. Enquanto isso aparece a versão simples de `arte.js`.
- Os personagens ficam pequenos, de pé dentro de cada cenário. Quando um deles fala, o retrato grande sai de onde ele está e vem para a frente da cena; o retrato pisca e mexe a boca enquanto a voz fala. Enquanto a voz fala, aparece no canto da cena um botão para pausar e continuar a fala.
- A história fica em `historia.js`. O Arco 1 (A1) está completo, com 10 capítulos que cobrem o que o nível A1 do Quadro Europeu pede:
  1. "Wake Up": cumprimentos, nome, de onde você é.
  2. "The Market": números, preços, cores, pedir com educação.
  3. "The Guild": verbo *to be*, profissões, perguntas simples.
  4. "First Day": horas, dias da semana, rotina, com que frequência (*always, never*), soletrar e dar endereço.
  5. "The Letters": direções, lugares da cidade, *there is / there are*, números até 100.
  6. "The Harbour": família, *have got*, o *'s* de posse, descrever pessoas.
  7. "Dinner at the Fox": comida, *I would like*, *some / any*, *like + -ing*, pedir a conta.
  8. "Festival Clothes": roupas, *this / these*, *too big*, datas, meses e estações.
  9. "The Old Temple": clima, presente contínuo, *can / can't*, pronomes (*me, him, her*), ordens.
  10. "Who Was She?": revisão de *was / were* e o fim do arco, que leva ao A2.
- Personagens: Rosie (dona da pousada), Tobias e Mei (mercado), Bram (guarda), Marcus (chefe da Guilda), Iris (secretária da Guilda), Lena (cozinheira, filha da Rosie), Pip (menino que conhece as ruas), Ola (capitã do porto) e Ana (guardiã do templo). Lugares: quarto, pousada, mercado, guilda, salão, praça, porto e templo.

## Instalar como app

O Xibolete pode ser instalado como app e abre até sem internet.

- **Android e PC (Chrome ou Edge):** Perfil › Instalar o app, ou menu do navegador › Instalar app.
- **iPhone:** abra o site no Safari, toque em Compartilhar e em "Adicionar à Tela de Início".

## Conversas

Situações reais do dia a dia (pedir um café, fazer check-in, pedir comida…). O personagem fala, e você responde em voz alta. Valem várias respostas, do jeito que se fala na rua: "Can I get a coffee?" vale tanto quanto "I'd like a coffee". Quando você usa a forma mais formal, o jogo mostra a versão do dia a dia. Se travar, peça uma dica ou veja opções. Conversa não gasta vidas.

- **Repetir colado:** no fim da conversa, você ouve cada fala e repete logo em seguida, imitando o ritmo.
- **Grave e compare:** grava sua voz e toca logo depois da voz nativa, para você comparar de ouvido.
- Por enquanto há 10 conversas A1 em inglês americano, em `conversas.js`. Os outros idiomas e os níveis A2 a B2 vêm a seguir.

## Caderno

Um caderno de anotações para cada idioma, com folhas pautadas. Quando uma folha enche, o texto passa sozinho para a próxima. Cada folha pode ser copiada, enviada pelo WhatsApp ou compartilhada, e o caderno inteiro pode ser copiado ou baixado como arquivo .txt. As anotações ficam guardadas à parte: "Apagar progresso" não apaga o caderno. Elas só somem se você apagar uma folha ou o caderno.

## Pronúncia

- **Ditado:** você ouve uma palavra ou frase e escreve o que escutou.
- **Toda lição tem fala:** o jogo mostra uma palavra ou frase, você fala, e ele dá uma nota de 0 a 100%, marcando em verde, amarelo ou vermelho cada palavra que entendeu.
- **Treino de ouvido:** pares de palavras que só mudam num som (ship × sheep, tu × tout, был × бил). Você ouve uma delas e escolhe qual foi.
- **Prova de fala:** fecha cada unidade. Ela começa com o som em foco da unidade e depois pede para você falar as palavras e frases que aprendeu.
- **Aba Pronúncia:** sua nota média, um treino de fala com as palavras em que você foi pior e os sons difíceis de cada idioma, com dicas, exemplos e pares para ouvir.
- O método segue duas ideias de *Fluent Forever* (Gabriel Wyner): treinar o ouvido para os sons antes de falar e ligar cada som à escrita. Também segue uma ideia de *Fluent in 3 Months* (Benny Lewis): falar desde o primeiro dia, sem medo de errar.

O jogo ouve sua voz com o reconhecimento de fala do próprio navegador. Funciona no Chrome e no Edge (no celular, no Chrome do Android e no Safari do iPhone). Na primeira vez, o navegador pede permissão para usar o microfone. Nos navegadores sem esse recurso, como o Firefox, a fala vira autoavaliação: você ouve, repete e diz se ficou parecido.

As vozes que leem as palavras também são do navegador. O jogo escolhe sozinho a voz mais natural que encontrar (as vozes "Natural" do Edge e as do Google no Chrome são as mais fluidas), e no Perfil dá para trocar a voz de cada idioma.

## Por que Xibolete

No livro de Juízes, na Bíblia, os homens de Galaade descobriam quem era da tribo inimiga de Efraim pedindo que a pessoa dissesse *shibbólet* (“espiga”, em hebraico). Quem não conseguia fazer o som de “sh” e dizia “sibbólet” era descoberto. Foi a primeira prova de pronúncia de que se tem notícia. O logo é um zigurate, a torre em degraus da antiga Mesopotâmia: cada degrau é um nível a subir.

## Atalhos

- `1` a `4`: escolhem uma opção
- `Enter`: verifica a resposta, continua ou liga o microfone nos exercícios de fala
- `Backspace`: remove a última palavra ao montar uma frase
- `Esc`: sai da lição

## Onde ficam os dados

Seu progresso fica salvo no `localStorage` do navegador. O Xibolete não tem servidor próprio. Quando você usa o microfone, o navegador pode enviar o áudio para o serviço de reconhecimento de voz dele (o do Google, no Chrome) para transformar a fala em texto.

## Adicionar conteúdo

Todo o vocabulário está em `data.js`. Os sons de cada idioma ficam em `BABEL_SOUNDS`, no fim do mesmo arquivo. Para incluir uma unidade, palavras, sons ou um idioma novo, siga o formato descrito nos comentários do arquivo.

Para mudar textos, histórias e personagens, veja o [guia de edição](COMO-EDITAR.md).
