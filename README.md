# Babel

Aprenda idiomas jogando e falando em voz alta. É um jogo no navegador, sem instalação, para estudar **inglês, espanhol, francês, italiano e russo** a partir do português.

## Como funciona

- **Mapa de fases:** cada idioma tem 8 unidades (o russo tem 9, começando pelo alfabeto cirílico). Cada unidade tem 3 lições, uma prova de fala e um baú de recompensa.
- **Exercícios variados:** palavra nova, escolher a tradução, ouvir e escolher, formar pares, montar frases com peças, escrever a resposta, falar em voz alta e treino de ouvido.
- **XP e níveis:** cada acerto vale XP, com bônus de combo para acertos seguidos. Os níveis vão de Turista a Lenda de Babel.
- **Vidas:** cada erro numa lição custa 1 vida. Uma vida volta a cada 30 minutos, e um treino completo devolve 1. Exercícios de fala e de ouvido nunca custam vida.
- **Sequência de dias, meta diária e missões do dia.** Uma das missões é sempre de fala.
- **Moedas e loja:** recarga de vidas, protetor de sequência e XP em dobro.
- **25 conquistas.**
- **Treino com repetição espaçada:** as palavras que você mais erra voltam com mais frequência.

## Pronúncia

- **Toda lição tem fala:** o jogo mostra uma palavra ou frase, você fala, e ele dá uma nota de 0 a 100%, marcando em verde, amarelo ou vermelho cada palavra que entendeu.
- **Treino de ouvido:** pares de palavras que só mudam num som (ship × sheep, tu × tout, был × бил). Você ouve uma delas e escolhe qual foi.
- **Prova de fala:** fecha cada unidade. Ela começa com o som em foco da unidade e depois pede para você falar as palavras e frases que aprendeu.
- **Aba Pronúncia:** sua nota média, um treino de fala com as palavras em que você foi pior e os sons difíceis de cada idioma, com dicas, exemplos e pares para ouvir.
- O método segue duas ideias de *Fluent Forever* (Gabriel Wyner): treinar o ouvido para os sons antes de falar e ligar cada som à escrita. Também segue uma ideia de *Fluent in 3 Months* (Benny Lewis): falar desde o primeiro dia, sem medo de errar.

O jogo ouve sua voz com o reconhecimento de fala do próprio navegador. Funciona no Chrome e no Edge (no celular, no Chrome do Android e no Safari do iPhone). Na primeira vez, o navegador pede permissão para usar o microfone. Nos navegadores sem esse recurso, como o Firefox, a fala vira autoavaliação: você ouve, repete e diz se ficou parecido.

As vozes que leem as palavras também são do navegador. Chrome e Edge costumam ter vozes para todos os idiomas.

## Atalhos

- `1` a `4`: escolhem uma opção
- `Enter`: verifica a resposta, continua ou liga o microfone nos exercícios de fala
- `Backspace`: remove a última palavra ao montar uma frase
- `Esc`: sai da lição

## Onde ficam os dados

Seu progresso fica salvo no `localStorage` do navegador. O Babel não tem servidor próprio. Quando você usa o microfone, o navegador pode enviar o áudio para o serviço de reconhecimento de voz dele (o do Google, no Chrome) para transformar a fala em texto.

## Adicionar conteúdo

Todo o vocabulário está em `data.js`. Os sons de cada idioma ficam em `BABEL_SOUNDS`, no fim do mesmo arquivo. Para incluir uma unidade, palavras, sons ou um idioma novo, siga o formato descrito nos comentários do arquivo.
