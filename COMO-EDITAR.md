# Como editar o Xibolete

Todo o conteúdo do app fica em arquivos de texto separados do código. Para mudar uma frase, um personagem ou uma história, você mexe só no arquivo certo e não precisa entender o resto.

## Onde fica cada coisa

| Arquivo | O que tem |
|---|---|
| `data.js` | Vocabulário e frases das lições de cada idioma, e os sons difíceis (aba Pronúncia) |
| `conversas.js` | As situações da aba Conversas |
| `historia.js` | O modo História: personagens, itens da mochila, dicas e capítulos |
| `arte.js` | A pixel art: o visual dos personagens e dos cenários |
| `index.html` | O app em si (telas, regras do jogo). Normalmente não precisa mexer |
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

**Criar um personagem:** em `historia.js`, acrescente o nome em `cast`; em `arte.js`, acrescente o visual em `CHARS` (cores da pele, do cabelo e da roupa e um dos estilos listados no topo do arquivo).

**Mexer num cenário** (`arte.js`): cada cenário em `SCENES` tem três camadas, `back` (o fundo, que aparece levemente desfocado), `mid` (o meio, nítido, onde fica o personagem) e `front` (coisas bem na frente, desfocadas). Em `lights` ficam os pontos de luz: `[posição horizontal %, posição vertical %, cor, tamanho]`. Em `rays`, os raios de sol que entram pela janela.

**As frases do capítulo** (`phrases`, no fim de cada capítulo em `historia.js`) são usadas no treino de fala do final e podem ir para o caderno. Escolha frases curtas do dia a dia.

**Criar um capítulo:** copie um capítulo inteiro em `historia.js` (de `{ id: "a1c3"` até o `},` que fecha ele), mude o `id` (por exemplo `a1c4`), o número `n`, o título e as falas. O comentário no topo do arquivo explica cada tipo de cena: narração, fala, escolha, explorar objetos, procurar algo, pagar e memória.

## Testar antes de publicar (opcional)

Abra a pasta do projeto no computador e dê dois cliques no `index.html`. O microfone e o modo app só funcionam pelo site publicado (https://erosxv.github.io/babel/), mas os textos dá para conferir assim.
