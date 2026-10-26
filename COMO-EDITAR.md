# Como editar o Xibolete

Todo o conteúdo do app fica em arquivos de texto separados do código. Para mudar uma frase, um personagem ou uma história, você mexe só no arquivo certo e não precisa entender o resto.

## Onde fica cada coisa

| Arquivo | O que tem |
|---|---|
| `data.js` | Vocabulário e frases das lições de cada idioma, e os sons difíceis (aba Pronúncia) |
| `conversas.js` | As situações da aba Conversas |
| `historia.js` | O modo História em inglês: personagens, itens da mochila, dicas e capítulos |
| `historia-ru.js` | O modo História em russo: outra história (Белоречье e o relógio parado), com o mesmo formato |
| `glossario.js` | O que cada palavra quer dizer: aparece no balão quando o aluno toca numa palavra. Para ver quais palavras ainda faltam, rode `node tools/glossario-faltam.js` |
| `supabase/amigos.sql` | As tabelas e as regras de privacidade da aba Amigos, no servidor Supabase. Só precisa rodar de novo (no SQL Editor do Supabase) se ele mudar |
| `arte.js` | A pixel art: o visual dos personagens e dos cenários |
| `hd2d.js` | A arte HD-2D da história: os cenários em 3D (`STORY`) e os retratos grandes de quem fala (`BUSTS`) |
| `hd2d-worker.js` | Desenha os cenários em segundo plano (não precisa mexer) |
| `index.html` | O app em si (telas, regras do jogo). Normalmente não precisa mexer |
| `audio/` | As vozes gravadas: um arquivo .mp3 por fala, por idioma. Não edite à mão: veja “Gerar as vozes” |
| `tools/` | Os programas que geram as vozes (`frases-en.js`, `gerar-audio.py` e `gerar-audio-chatterbox.py`) e as vozes de referência de cada personagem (`tools/vozes/`) |
| `manifest.webmanifest`, `sw.js`, `icons/` | O que faz o site virar app instalável |

## Editar pelo navegador (sem programa nenhum)

1. Abra https://github.com/erosxv/babel.
2. Clique no arquivo (por exemplo `historia.js`) e depois no lápis (Edit).
3. Faça a mudança e clique em **Commit changes**.
4. Em cerca de 1 minuto o site e o app instalado já mostram a mudança.

Cuidado com aspas e vírgulas: cada frase fica entre aspas `"…"`, e os itens de uma lista são separados por vírgula. Se o app parar de abrir depois de uma mudança, quase sempre falta uma vírgula ou uma aspa.

## Exemplos

**Mudar uma fala da Rosie** (`historia.js`): procure a frase e troque o texto.

```js
{ say: "rosie", t: "Hey! You okay in there?", pt: "Ei! Tudo bem aí dentro?" },
```

`t` é o que ela fala em inglês e `pt` é a tradução.

**Aceitar outra resposta numa escolha:** acrescente a frase na lista `alt`, em minúsculas e sem pontuação.

```js
{ t: "Yeah, I'm okay.", ok: true, alt: ["i'm okay", "i'm fine", "all good"] },
```

**Criar uma escolha errada com dica:** use `tip` (o nome de uma dica da lista `tips`) e `retry: true` para a pessoa tentar de novo.

**Padrão visual (vale para tudo o que for criado nos jogos):**
1. Todo lugar é um cenário HD-2D em 3D, em `hd2d.js` (`STORY`), realista e sem nada flutuando.
2. Todo personagem que fala num lugar aparece pequeno, de pé dentro dele (`person`), num ponto em que a câmera o veja. O herói e alguns moradores completam a cena.
3. Quando alguém fala, o retrato grande (`BUSTS`) sai de onde ele está e vem para a frente, piscando e mexendo a boca.

**Criar um personagem:** em `historia.js`, acrescente o nome em `cast`. Em `hd2d.js`, crie o boneco pequeno em `FOLK` e o retrato grande em `BUSTS`, com as mesmas cores, e coloque-o nos cenários em que ele aparece com `person`. Em `arte.js`, acrescente o visual simples em `CHARS` (é o que aparece enquanto o HD-2D é desenhado).

**Retrato grande de um personagem** (`hd2d.js`, em `BUSTS`): cada um tem cabelo (`side`, `long`, `short`, `cap`, `helmet`), roupa (`apron`, `vest`, `kimono`, `armor`, `robe`, `tunic`), detalhes como `bun` (coque), `beard` (barba), `freckles` (sardas), `scar` (cicatriz), e as cores em `pal`. Um personagem novo sem retrato usa o desenho de `arte.js`.

**Mexer num cenário HD-2D** (`hd2d.js`, em `STORY`): cada lugar é montado com blocos (`B`), cilindros (`CYL`), casas (`house`) e objetos prontos (`lantern`, `candle`, `hangLamp`, `stool`). As pessoas entram com `person(S, "rosie", x, z)`: o visual pequeno de cada uma está em `FOLK`. Depois de mudar um cenário, aumente `HD_VER` para os aparelhos desenharem de novo. Peças soltas no ar são apontadas pela checagem `checkFloating`.

**Mexer na versão simples do cenário** (`arte.js`, usada enquanto o HD-2D é desenhado): cada cenário em `SCENES` tem três camadas, `back` (o fundo, que aparece levemente desfocado), `mid` (o meio, nítido, onde fica o personagem) e `front` (coisas bem na frente, desfocadas). Em `lights` ficam os pontos de luz: `[posição horizontal %, posição vertical %, cor, tamanho]`. Em `rays`, os raios de sol que entram pela janela.

**As frases do capítulo** (`phrases`, no fim de cada capítulo em `historia.js`) são usadas no treino de fala do final e podem ir para o caderno. Escolha frases curtas do dia a dia.

**Criar um capítulo:** copie um capítulo inteiro em `historia.js` (de `{ id: "a1c3"` até o `},` que fecha ele), mude o `id` (por exemplo `a2c1` para o primeiro capítulo do Arco 2), o número `n`, o título e as falas. Quando um arco tiver todos os capítulos, marque `done: true` nele para sumir o aviso "Próximos capítulos em breve". Cada idioma tem a sua própria história: não traduza uma para a outra. Para criar a de outro idioma, copie `historia-ru.js` com outro nome (por exemplo `historia-es.js`), troque `ru` pela sigla do idioma, escreva um enredo e personagens novos (os lugares e as pessoas são desenhados em `hd2d.js`, nas listas `STORY`, `FOLK` e `BUSTS`, e em `arte.js`, na lista `CHARS`), escreva as dicas, ajuste `pay` (os números e a palavra “moeda”) e acrescente o arquivo em `index.html` (logo depois de `historia-ru.js`) e na lista `SHELL` de `sw.js`. O comentário no topo de `historia.js` explica cada tipo de cena: narração, fala, escolha, explorar objetos, procurar algo, pagar e memória.

## Palavras tocáveis e meta diária

- Em histórias, conversas e lições, cada palavra do idioma estudado tem um tracejado embaixo. Ao tocar, ela é falada sozinha e aparece um balão com o significado, tirado de `glossario.js` (significados separados por ` / `). Se a palavra não estiver lá, o app procura no vocabulário das lições em `data.js`.
- Ao escolher um idioma, o app faz algumas perguntas (por que estudar, quanto já sabe, quantos minutos por dia). A meta de minutos pode ser trocada depois em Perfil. O tempo só conta enquanto o aluno está numa lição, história ou conversa e mexeu no app no último minuto e meio.

## Aba Amigos (online)

- É a única parte que precisa de internet. Ela usa o projeto Supabase `eubptqdfpoxbwonbrbsh`: o endereço e a chave pública ficam no começo do bloco "friends" em `index.html`.
- Cada pessoa cria um perfil sem e-mail nem senha: escolhe um nome e um bicho, e recebe um código de 6 letras. O amigo digita esse código, ou abre o link de convite (`?amigo=CÓDIGO`).
- Sequência em dupla: dias seguidos em que os dois estudaram. Missão da semana: 60 minutos somando os dois, que dá 20 moedas para cada um. No chat dá para marcar uma mensagem como dúvida do idioma.
- O perfil fica guardado no aparelho. Se a pessoa apagar os dados do navegador, ela perde o perfil e precisa criar outro.

## Gerar as vozes

As falas em inglês são lidas por vozes de IA gravadas, que rodam de graça no computador: primeiro o Kokoro grava todas, e depois o Chatterbox, que tem entonação e emoção, grava de novo por cima com a mesma voz de cada personagem. Uma outra IA (Whisper) ouve cada áudio do Chatterbox: se a frase não saiu certa, ele tenta de novo, e depois de 3 tentativas fica a versão do Kokoro (isso acontece mais com palavras soltas, como “yes”). O resultado de cada frase fica em `tools/relatorio-chatterbox-en.json`. Quando você muda ou acrescenta uma frase em inglês, ela é lida pela voz do navegador até que o áudio dela seja gerado. Para gerar, no computador:

1. Uma vez só: instale o Python e o ffmpeg, rode `pip install kokoro-onnx soundfile` e baixe os arquivos `kokoro-v1.0.onnx` e `voices-v1.0.bin` (em github.com/thewh1teagle/kokoro-onnx, na versão “model-files-v1.0”) para uma pasta chamada `xibolete-voz` dentro de `%LOCALAPPDATA%`.
2. Na pasta do projeto, rode `node tools/frases-en.js` (lista as frases) e depois `python -X utf8 tools/gerar-audio.py en` (grava só as frases que ainda não têm áudio).
3. Para a voz com emoção (precisa de placa de vídeo NVIDIA): siga a instalação descrita no topo de `tools/gerar-audio-chatterbox.py` e rode `%LOCALAPPDATA%/xibolete-voz/cb/Scripts/python.exe -X utf8 tools/gerar-audio-chatterbox.py en`. Ele só regrava as frases novas.
4. Se regravou frases que já existiam, mude o nome `AUDIO_CACHE` em `sw.js` (por exemplo de `xibolete-audio-2` para `xibolete-audio-3`), para que todos baixem os áudios novos.
5. Publique a pasta `audio/` junto com o resto.

A voz de cada personagem fica no começo de `tools/frases-en.js` (por exemplo `rosie: "af_sarah"`). Para trocar a voz de alguém, mude ali, apague os áudios das falas dele e gere de novo.

## Testar antes de publicar (opcional)

Abra a pasta do projeto no computador e dê dois cliques no `index.html`. O microfone e o modo app só funcionam pelo site publicado (https://erosxv.github.io/babel/), mas os textos dá para conferir assim.
