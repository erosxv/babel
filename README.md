# Xibolete

Aprenda idiomas jogando e falando em voz alta. É um jogo no navegador, sem instalação, para estudar **inglês, espanhol, francês, italiano e russo** a partir do português.

## Como funciona

- **Início:** a primeira tela. A ação principal é sempre estudar: a próxima lição, ou o Treino quando há 8 ou mais palavras e frases para revisar. Logo abaixo, atalhos para Lições, Treino, Pronúncia, Conversas, Alfabeto e Caderno. Depois vem o capítulo atual da história do idioma (com o cenário HD-2D e quantas palavras das frases do capítulo você já viu nas lições). Idiomas sem história própria mostram um aviso, sem inventar capítulo. No celular, a barra de baixo tem Início, Lições, Treino, História e Mais.

- **Mapa de fases:** inglês e russo têm o nível A1 completo: 30 unidades no inglês e 31 no russo (o russo começa pelo alfabeto cirílico), com cerca de 380 palavras e 140 frases cada, de números, horas e rotina até compras, transporte, verbos de movimento e o passado. Espanhol, francês e italiano têm 8 unidades por enquanto. Cada unidade tem 3 lições, uma prova de fala e um baú de recompensa.
- **Gramática em pílulas:** o Guia de cada unidade nova traz uma regra curta da unidade, explicada em português (por exemplo, por que o russo diz я был e я была).
- **Teste de nível:** quem responde no plano que já sabe um pouco do idioma pode fazer um teste rápido, de 4 em 4 unidades. Acertando, as unidades são liberadas e as palavras delas vão para o Treino.
- **Exercícios variados:** palavra nova, escolher a tradução, ouvir e escolher, formar pares, montar frases com peças, escrever a resposta, falar em voz alta e treino de ouvido.
- **XP e níveis:** cada acerto vale XP, com bônus de combo para acertos seguidos. Os níveis vão de Turista a Mestre do Xibolete.
- **Vidas:** só valem no **Desafio**, um modo opcional para refazer uma lição já concluída: cada erro custa 1 vida, e terminar dá +10 moedas e +20 XP. Nas lições normais, no treino, na fala e na história, errar não custa nada: você vê a explicação e a pergunta volta mais tarde. Uma vida volta a cada 30 minutos, e um treino completo devolve 1.
- **Acertos por habilidade:** cada resposta conta para uma habilidade do idioma em que foi dada: vocabulário, gramática (montar frases), compreensão auditiva (ouvir, ditado, sons parecidos), leitura (traduzir frases e responder tocando na história), pronúncia e conversação (conversas e respostas faladas na história). Fica em `S.skill[idioma]`, com o total, os acertos e as últimas 30 respostas. Começa vazio: nada é estimado de antes.
- **Domínio:** a tela que mostra essas seis habilidades no idioma atual. Cada uma diz a porcentagem de acertos nas últimas respostas (até 30) e se está Firme (85% ou mais), Em progresso (65% a 84%) ou Precisando de reforço. Com menos de 10 respostas aparece "pouco histórico", sem número. Junto vêm dados que o app já tinha: palavras aprendidas e para revisar, melhor nota de fala, conversas feitas e capítulos lidos. A sugestão do topo aponta a habilidade mais fraca e um botão para treiná-la, e o fim da tela lista as palavras mais fracas da revisão. O Início mostra um resumo das seis.
- **Semana da jornada:** o topo mostra quantos dias você estudou nesta semana (segunda a domingo), as moedas e o nível. A sequência de dias continua existindo (amigos e conquistas usam) e aparece no calendário. Um dia conta quando deu XP ou teve pelo menos 3 minutos de estudo. Os marcos da semana (2, 4 e 6 dias) pagam moedas uma vez por semana, e um dia de folga não tira nada. Quem volta depois de 3 dias ou mais vê uma mensagem de boas-vindas, sem bronca, com atalho para um treino curto ou a próxima lição. Tocar na semana abre o calendário das últimas 5 semanas. Os marcos e os textos ficam em `jornada.js`, que dá para editar.
- **Testes:** `node tools/testes.js` confere o conteúdo, as histórias e se saves antigos (em `tools/saves-exemplo/`) abrem sem perder nada. Rode antes de publicar.
- **Sequência de dias, meta diária e missões do dia.** Uma das missões é sempre de fala.
- **Moedas e loja:** recarga de vidas, protetor de sequência e XP em dobro.
- **28 conquistas.**
- **Treino com repetição espaçada:** as palavras que você mais erra voltam com mais frequência. As frases úteis de cada capítulo da História também entram no Treino depois que você termina o capítulo.

## História (em inglês e russo)

Um RPG no estilo visual novel, em 4 arcos que acompanham os degraus do zigurate: A1 "O Despertar Sem Memória", A2 "A Jornada pela Guilda", B1 "O Mistério da Cidade Grande" e B2 "A Conspiração do Trono". Você acorda sem memória em Shinar e conversa com os personagens respondendo em voz alta ou tocando nas opções.

- **Mochila:** os itens que você pega ficam guardados, cada um com a palavra em inglês, pronúncia e frase de exemplo.
- **Erros têm consequência:** o personagem estranha o que você disse, um balão explica a regra em português, e o erro pode custar moedas ou levar a um caminho mais longo. Falar bem e com educação rende desconto e recompensas.
- **Pronúncia em primeiro lugar:** quando você responde falando, o app mostra quais palavras saíram bem e quais precisam de treino. Se você tocar na resposta em vez de falar, o jogo pede "Agora diga você" e dá nota.
- **Treino de fala no fim de cada capítulo:** você repete em voz alta as frases do dia a dia que apareceram, e a tela final mostra sua média de pronúncia.
- **A pulseira brilha** quando você fala com boa pronúncia.
- As frases de cada capítulo podem ir direto para o caderno.
- Os lugares da história são desenhados em estilo HD-2D (como Octopath Traveler e Dragon Quest III HD-2D) por `hd2d.js`: cenários em 3D com texturas de pixel art, sombras suaves, desfoque de profundidade e brilho. A primeira vez leva alguns segundos (o desenho roda em segundo plano, em `hd2d-worker.js`) e depois fica guardado no aparelho. Enquanto isso aparece a versão simples de `arte.js`.
- Os personagens ficam pequenos, de pé dentro de cada cenário. Quando um deles fala, o retrato grande sai de onde ele está e vem para a frente da cena; o retrato pisca e mexe a boca enquanto a voz fala. Enquanto a voz fala, aparece no canto da cena um botão para pausar e continuar a fala.
- A história aparece no idioma que você está estudando: inglês ou russo. Nos outros idiomas ela aparece em inglês, por enquanto. Cada idioma guarda o próprio progresso e a própria mochila.
- Cada idioma tem a sua própria história, com outros personagens e outros lugares. A história em russo (`historia-ru.js`), **O Relógio Parado**, se passa em Белоречье, uma cidadezinha coberta de neve na beira de um rio. Teo, um rapaz brasileiro, chega de trem com uma carta do avô Lev, o velho relojoeiro amigo da avó dele. O relógio da torre parou, o Lev sumiu e o inverno não acaba. São 10 capítulos com a vovó Vera da casa de chá, a Katya da feira, o menino Misha, o policial Dmitri, a bibliotecária Olga Petrovna, a aprendiz Sonya e o pescador Fyodor, em 9 lugares próprios: estação, casa de chá, feira, prefeitura, biblioteca, oficina, rio congelado, torre e a sala das engrenagens. As dicas ensinam o que é difícil no russo: os casos (Лев → ищу Льва), o gênero (синий шарф, синяя шапка), *у меня есть* para “ter”, *мне двадцать лет* para a idade, *умею* e *могу*, e o passado com *был* e *была*. O herói fala no masculino, mas as formas femininas também valem quando você responde falando.
- A história em inglês fica em `historia.js`. O Arco 1 (A1) está completo, com 10 capítulos que cobrem o que o nível A1 do Quadro Europeu pede:
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
- Há 10 conversas A1 em inglês americano e 10 em russo (um chá em Moscou, uma festa em Petersburgo, a feira, o trem Sapsan, um jantar em Ecaterimburgo…), em `conversas.js`. No russo, cada fala mostra embaixo como se lê em letras latinas. Os outros idiomas e os níveis A2 a B2 vêm a seguir.

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

Em inglês, todas as palavras e falas (lições, sons, conversas e história) foram gravadas por vozes de IA com sotaque americano nativo e entonação natural (Chatterbox, com o Kokoro para as palavras soltas). Cada personagem da história tem a sua voz, e as suas próprias falas têm uma voz masculina diferente. Em russo, tudo (lições, conversas, história e alfabeto) foi gravado pelo Silero, uma voz de IA russa que roda no computador, com uma voz para cada personagem. Os áudios ficam na pasta `audio/` e, depois de ouvidos uma vez, funcionam até sem internet. Em espanhol, francês e italiano, e em qualquer frase sem áudio gravado, a leitura é feita pela voz do navegador: o jogo escolhe sozinho a voz mais natural que encontrar, e no Perfil dá para trocar a voz de cada idioma.

## Por que Xibolete

No livro de Juízes, na Bíblia, os homens de Galaade descobriam quem era da tribo inimiga de Efraim pedindo que a pessoa dissesse *shibbólet* (“espiga”, em hebraico). Quem não conseguia fazer o som de “sh” e dizia “sibbólet” era descoberto. Foi a primeira prova de pronúncia de que se tem notícia. O logo é um zigurate, a torre em degraus da antiga Mesopotâmia: cada degrau é um nível a subir.

## Atalhos

- `1` a `4`: escolhem uma opção
- `Enter`: verifica a resposta, continua ou liga o microfone nos exercícios de fala
- `Backspace`: remove a última palavra ao montar uma frase
- `Esc`: sai da lição

## Onde ficam os dados

Seu progresso fica salvo no navegador e também tem backup automático na nuvem (Supabase), numa linha que só a sua conta consegue ler. Com um usuário e senha (no Perfil, em "Conta e backup") você entra na mesma conta em outro celular ou computador. Se dois aparelhos tiverem progressos diferentes, eles são juntados: lições feitas, palavras, capítulos e conquistas nunca se perdem. Quando você usa o microfone, o navegador pode enviar o áudio para o serviço de reconhecimento de voz dele (o do Google, no Chrome) para transformar a fala em texto.

## Adicionar conteúdo

Todo o vocabulário está em `data.js`. Os sons de cada idioma ficam em `BABEL_SOUNDS`, no fim do mesmo arquivo. Para incluir uma unidade, palavras, sons ou um idioma novo, siga o formato descrito nos comentários do arquivo.

Para mudar textos, histórias e personagens, veja o [guia de edição](COMO-EDITAR.md).
