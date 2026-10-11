# Cifrador

Editor de cifras que roda direto no navegador, sem servidor. Você digita a linha de acordes em cima da letra e o Cifrador monta a folha A4 pronta para imprimir, com o acorde preso à letra exata sobre a qual foi digitado.

## Como usar

Abra o `index.html` no navegador, ou publique a pasta pelo GitHub Pages (Settings → Pages → Deploy from a branch → `main` / raiz).

- **Acordes sobre a letra**: a linha de acordes vai em cima da linha da letra.
- **Seções**: `[Intro]`, `[Verso 1]`, `[Refrão]`, `[Ponte]`. Repita `[Refrão]` sem nada embaixo para indicar a repetição.
- **Frases com notas** (solo, melodia): comece a linha com `Notas:`, por exemplo `Notas: mi sol lá si` ou `Notas: E G A B`.
- **Anotações para os músicos**: comece a linha com `>`, por exemplo `> Bumbo em colcheia, cresce`. Também vale no fim de uma linha de acordes (`Bm  G  A > vem crescendo`). Uma seção repetida pode trazer só o nome e as anotações daquela vez.
- **Modo palco**: a cifra limpa para tocar pelo celular, com atalhos redondos que levam direto a cada seção, anotações à direita e cores claras ou escuras. No celular a música já abre nesse modo; no computador, use o botão "Modo palco".
- **Paleta de acordes**: escolhido o tom, a folha mostra o campo harmônico (tríades ou tétrades), os empréstimos do tom homônimo e os dominantes secundários. Arraste o acorde até a letra, ou clique na letra e depois no acorde. Acordes já colocados podem ser arrastados, trocados, movidos com as setas e apagados com `Delete`.
- **Transposição**: botões −½ tom e +½ tom; acordes, notas e o tom acompanham.
- **Ajuste fino**: com o cursor sobre um acorde, `Alt` + `←` / `→` move o acorde uma casa.
- **Folha**: A4 em 1 ou 2 colunas, tamanho da letra, margem, cor dos acordes e o botão "Caber em 1 página".
- **Importar**: letra em `.txt`, cifra em ChordPro (`.cho`) ou backup (`.json`).
- **Salvar**: as músicas ficam guardadas no navegador. "Salvar arquivo" gera um `.cho` (ChordPro) da música aberta e "Backup" gera um `.json` com todas.


## Estrutura

- `index.html` — a tela
- `css/style.css` — aparência, folha A4 e regras de impressão
- `js/music.js` — acordes, notas, transposição e ChordPro
- `js/app.js` — lista, editor, paginação e arquivos
- `tests/music.test.js` — testes do motor musical (`node tests/music.test.js`)
